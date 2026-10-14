import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { todayVN } from './time.js';
import { recordPayment, bookingBalance } from './payments.js';
import { lockBooking } from './bookings.js';
import { vietQrPayload, qrSvg, MAX_CONTENT } from './vietqr.js';

const CODE_RE = /^[A-Z]{1,8}[0-9]{3,9}$/;

// Mã đơn nằm trong nội dung chuyển khoản. Ngân hàng hay chèn dấu cách hoặc dấu gạch, nên thử cả từng token lẫn cặp token liền kề.
export function codeCandidates(content) {
  const tokens = String(content ?? '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (CODE_RE.test(tokens[i])) out.add(tokens[i]);
    if (i + 1 < tokens.length && CODE_RE.test(tokens[i] + tokens[i + 1]) && /^[A-Z]+$/.test(tokens[i]) && /^[0-9]+$/.test(tokens[i + 1])) out.add(tokens[i] + tokens[i + 1]);
  }
  return [...out].slice(0, 6);
}

export async function getBankAccount(c, orgId) {
  const [a] = await c.query('SELECT bank_bin, account_number, account_holder, webhook_token FROM org_bank_accounts WHERE org_id = $1', [orgId]);
  return a ?? null;
}

export async function setBankAccount(c, { orgId, bin, account, holder, rotate = false }) {
  if (typeof bin !== 'string' || !/^[0-9]{6}$/.test(bin)) throw new AppError('bad_bank', 'Mã ngân hàng (BIN) gồm 6 chữ số');
  if (typeof account !== 'string' || !/^[0-9]{6,20}$/.test(account)) throw new AppError('bad_bank', 'Số tài khoản gồm 6 đến 20 chữ số');
  if (typeof holder !== 'string' || !holder.trim() || holder.length > 120) throw new AppError('bad_bank', 'Tên chủ tài khoản không hợp lệ');
  const token = crypto.randomBytes(24).toString('hex');
  const [row] = await c.query(
    `INSERT INTO org_bank_accounts(org_id, bank_bin, account_number, account_holder, webhook_token) VALUES($1, $2, $3, $4, $5)
     ON CONFLICT (org_id) DO UPDATE SET bank_bin = $2, account_number = $3, account_holder = $4, updated_at = now(),
       webhook_token = CASE WHEN $6::boolean THEN $5 ELSE org_bank_accounts.webhook_token END
     RETURNING webhook_token`,
    [orgId, bin, account, holder.trim(), token, !!rotate],
  );
  return { webhookToken: row.webhook_token };
}

export async function orgByWebhookToken(c, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null;
  const [a] = await c.query('SELECT org_id, account_number FROM org_bank_accounts WHERE webhook_token = $1', [token]);
  return a ? { orgId: a.org_id, accountNumber: a.account_number } : null;
}

// Thông tin để khách chuyển khoản cho một đơn: số tiền còn thiếu của cọc (hoặc còn phải thu), nội dung = mã đơn.
export async function paymentInfo(c, { orgId, bookingId }) {
  const acct = await getBankAccount(c, orgId);
  if (!acct) throw new AppError('no_bank_account', 'Chưa cài tài khoản nhận tiền', 409);
  const [b] = await c.query('SELECT code, status FROM bookings WHERE id = $1 AND org_id = $2', [bookingId, orgId]);
  if (!b) throw new AppError('booking_not_found', 'Không tìm thấy đơn', 404);
  if (!['giu', 'da_coc', 'da_nhan'].includes(b.status)) throw new AppError('booking_closed', 'Đơn đã đóng, không nhận chuyển khoản', 409);
  const bal = await bookingBalance(c, { orgId, bookingId });
  const depositLeft = Math.max(bal.depositRequired - bal.paid, 0);
  const amount = b.status === 'giu' && depositLeft > 0 ? depositLeft : Math.max(bal.due, 0);
  const content = b.code.slice(0, MAX_CONTENT);
  const payload = vietQrPayload({ bin: acct.bank_bin, account: acct.account_number, amount: amount || null, content });
  return { code: b.code, status: b.status, amount, content, bankBin: acct.bank_bin, accountNumber: acct.account_number, accountHolder: acct.account_holder, payload, svg: await qrSvg(payload) };
}

async function applyPayment(c, { orgId, inboxId, booking, amount, occurredOn, by, auto = false }) {
  const bal = await bookingBalance(c, { orgId, bookingId: booking.id });
  if (!['giu', 'da_coc', 'da_nhan'].includes(booking.status)) return { ok: false, why: `Đơn ${booking.code} đang ở trạng thái đã đóng (${booking.status})` };
  if (bal.total <= 0) return { ok: false, why: `Đơn ${booking.code} chưa có giá` };
  if (bal.paid + amount > bal.total) return { ok: false, why: `Số tiền vượt phần còn phải thu của đơn ${booking.code}` };
  if (auto) {
    // Tự ghép chỉ khi số tiền đủ phần cọc còn thiếu (khoản lẻ không được giữ chỗ vô hạn), và không trùng khoản đã ghi tay.
    if (booking.status === 'giu' && amount < bal.depositRequired - bal.paid) return { ok: false, why: `Chưa đủ cọc cho đơn ${booking.code} (còn thiếu ${bal.depositRequired - bal.paid}đ), cần quản lý xem` };
    const [m] = await c.query("SELECT 1 FROM payments WHERE booking_id = $1 AND method = 'manual_bank' AND amount = $2 AND kind <> 'refund' AND created_at > now() - interval '3 days' LIMIT 1", [booking.id, amount]);
    if (m) return { ok: false, why: `Đơn ${booking.code} đã có khoản ghi tay cùng số tiền, có thể là cùng một lần chuyển` };
  }
  const kind = booking.status === 'giu' ? 'deposit' : 'payment';
  const r = await recordPayment(c, { orgId, bookingId: booking.id, kind, amount, receivedOn: occurredOn, method: 'vietqr_webhook', by, ref: 'bank:' + inboxId });
  return { ok: true, paymentId: r.paymentId };
}

// Nhận một giao dịch tiền vào từ ngân hàng/nhà cung cấp. Luôn ghi bank_inbox trước; gọi lại cùng giao dịch không ghi thêm.
// Tự ghép khi mã đơn khớp đúng một đơn đang mở và số tiền hợp lý; còn lại vào hàng chờ cho quản lý.
export async function ingestBankTx(c, { orgId, provider, bankTxId, amount, content = '', occurredAt = null, raw = null }, { now = new Date() } = {}) {
  if (typeof provider !== 'string' || !provider || provider.length > 40) throw new AppError('bad_bank_tx', 'Thiếu nhà cung cấp');
  if (typeof bankTxId !== 'string' || !bankTxId || bankTxId.length > 120) throw new AppError('bad_bank_tx', 'Thiếu mã giao dịch');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AppError('bad_bank_tx', 'Số tiền không hợp lệ');
  const text = String(content ?? '').slice(0, 300);
  // Chuỗi giờ không kèm múi giờ (kiểu SePay "2026-10-13 20:15:00") là giờ Việt Nam, không phải giờ máy chủ.
  const occStr = typeof occurredAt === 'string' && /^d{4}-d{2}-d{2}[ T]d{2}:d{2}(:d{2})?$/.test(occurredAt.trim()) ? occurredAt.trim().replace(' ', 'T') + '+07:00' : occurredAt;
  const occ = occStr && !Number.isNaN(new Date(occStr).getTime()) ? new Date(occStr) : null;
  const [row] = await c.query(
    `INSERT INTO bank_inbox(org_id, provider, bank_tx_id, amount, content, occurred_at, raw) VALUES($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (org_id, provider, bank_tx_id) DO NOTHING RETURNING id`,
    [orgId, provider, bankTxId, amount, text, occ, raw],
  );
  if (!row) {
    const [old] = await c.query('SELECT id, status FROM bank_inbox WHERE org_id = $1 AND provider = $2 AND bank_tx_id = $3', [orgId, provider, bankTxId]);
    return { inboxId: old.id, status: old.status, duplicate: true };
  }
  const cands = codeCandidates(text);
  const found = cands.length ? await c.query('SELECT id, code, status FROM bookings WHERE org_id = $1 AND upper(code) = ANY($2)', [orgId, cands]) : [];
  const finish = async (status, extra = {}) => {
    await c.query('UPDATE bank_inbox SET status = $2, booking_id = $3, payment_id = $4, note = $5 WHERE id = $1', [row.id, status, extra.bookingId ?? null, extra.paymentId ?? null, extra.note ?? '']);
    return { inboxId: row.id, status, duplicate: false, ...extra };
  };
  if (found.length === 0) return finish('unmatched', { note: 'Không thấy mã đơn trong nội dung' });
  if (found.length > 1) return finish('needs_review', { note: 'Nội dung khớp nhiều đơn' });

  const booking = found[0];
  await c.query('SAVEPOINT bank_apply');
  try {
    await lockBooking(c, orgId, booking.id);
    const [fresh] = await c.query('SELECT id, code, status FROM bookings WHERE id = $1', [booking.id]);
    const r = await applyPayment(c, { orgId, inboxId: row.id, booking: fresh, amount, occurredOn: todayVN(occ ?? now), by: null, auto: true });
    if (!r.ok) {
      await c.query('ROLLBACK TO SAVEPOINT bank_apply');
      return finish('needs_review', { bookingId: booking.id, note: r.why });
    }
    await c.query('RELEASE SAVEPOINT bank_apply');
    return finish('matched', { bookingId: booking.id, paymentId: r.paymentId });
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT bank_apply');
    if (e instanceof AppError) return finish('needs_review', { bookingId: booking.id, note: e.message });
    throw e;
  }
}

export async function listInbox(c, { orgId, status = null, limit = 100 }) {
  const lim = Math.min(Math.max(Number.isInteger(limit) ? limit : 100, 1), 200);
  if (status !== null && !['received', 'matched', 'needs_review', 'unmatched', 'resolved', 'dismissed'].includes(status)) throw new AppError('bad_status', 'Trạng thái không hợp lệ');
  const rows = await c.query(
    `SELECT i.id, i.provider, i.bank_tx_id, i.amount, i.content, i.occurred_at, i.status, i.booking_id, i.note, i.received_at, b.code AS booking_code
       FROM bank_inbox i LEFT JOIN bookings b ON b.id = i.booking_id
      WHERE i.org_id = $1 AND ($2::text IS NULL OR i.status = $2) ORDER BY i.received_at DESC LIMIT $3`,
    [orgId, status, lim],
  );
  return rows.map((r) => ({ id: r.id, provider: r.provider, amount: r.amount, content: r.content, occurredAt: r.occurred_at, status: r.status, bookingId: r.booking_id, bookingCode: r.booking_code, note: r.note, receivedAt: r.received_at }));
}

// Quản lý ghép tay một giao dịch đang chờ với một đơn. Số tiền vẫn phải hợp lệ với đơn; ngoại lệ thì hoàn tay rồi bỏ qua giao dịch.
export async function matchManually(c, { orgId, inboxId, bookingId, by }, { now = new Date() } = {}) {
  assertUuid(inboxId, 'giao dịch');
  assertUuid(bookingId, 'đơn');
  const [i] = await c.query('SELECT id, amount, status, occurred_at FROM bank_inbox WHERE id = $1 AND org_id = $2 FOR UPDATE', [inboxId, orgId]);
  if (!i) throw new AppError('not_found', 'Không tìm thấy giao dịch', 404);
  if (!['needs_review', 'unmatched'].includes(i.status)) throw new AppError('already_handled', 'Giao dịch này đã được xử lý', 409);
  const b = await lockBooking(c, orgId, bookingId);
  const [{ code }] = await c.query('SELECT code FROM bookings WHERE id = $1', [bookingId]);
  const r = await applyPayment(c, { orgId, inboxId, booking: { id: bookingId, code, status: b.status }, amount: i.amount, occurredOn: todayVN(i.occurred_at ?? now), by });
  if (!r.ok) throw new AppError('cannot_apply', r.why, 409);
  await c.query("UPDATE bank_inbox SET status = 'resolved', booking_id = $2, payment_id = $3, note = '' WHERE id = $1", [inboxId, bookingId, r.paymentId]);
  return { ok: true, paymentId: r.paymentId };
}

export async function dismissInbox(c, { orgId, inboxId, note }) {
  assertUuid(inboxId, 'giao dịch');
  if (typeof note !== 'string' || !note.trim()) throw new AppError('note_required', 'Cần ghi chú lý do bỏ qua (ví dụ: đã hoàn tiền cho khách)');
  const rows = await c.query("UPDATE bank_inbox SET status = 'dismissed', note = $3 WHERE id = $1 AND org_id = $2 AND status IN ('needs_review', 'unmatched') RETURNING id", [inboxId, orgId, note.trim().slice(0, 300)]);
  if (!rows.length) throw new AppError('already_handled', 'Giao dịch không còn ở hàng chờ', 409);
  return { ok: true };
}
