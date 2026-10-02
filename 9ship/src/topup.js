import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from './config.js';
import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import { creditFromBank } from './wallet.js';

export const MIN_TOPUP = 10_000;
export const MAX_TOPUP = 50_000_000;

// ---- VietQR (NAPAS 247, EMVCo) ----
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;

export function vietQrPayload({ bin, account, amount, content }) {
  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', account)) + tlv('02', 'QRIBFTTA');
  const body = tlv('00', '01') + tlv('01', '12') + tlv('38', merchant) + tlv('53', '704')
    + (amount ? tlv('54', String(amount)) : '') + tlv('58', 'VN') + tlv('62', tlv('08', content)) + '6304';
  return body + crc16(body);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return '9S' + s;
}

export async function create(userId, amount) {
  if (!Number.isSafeInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    throw new ApiError(400, 'invalid_amount', `Số tiền nạp từ ${MIN_TOPUP.toLocaleString('vi-VN')} đến ${MAX_TOPUP.toLocaleString('vi-VN')} đồng`);
  }
  const pending = (await query("SELECT count(*)::int n FROM topups WHERE user_id=$1 AND status='pending' AND expires_at > now()", [userId]))[0].n;
  if (pending >= 5) throw new ApiError(429, 'too_many_pending', 'Bạn có quá nhiều yêu cầu nạp đang chờ');
  const code = newCode();
  const expiresAt = new Date(Date.now() + config.topupTtlMin * 60_000);
  const r = await query(
    'INSERT INTO topups(user_id, amount, code, expires_at) VALUES($1,$2,$3,$4) RETURNING id',
    [userId, amount, code, expiresAt]);
  const payload = vietQrPayload({ bin: config.bankBin, account: config.bankAccount, amount, content: code });
  return {
    id: r[0].id, code, amount, expiresAt: expiresAt.toISOString(),
    transfer: { bankBin: config.bankBin, account: config.bankAccount, accountName: config.bankAccountName, content: code, amount },
    qrSvg: await QRCode.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
  };
}

export async function status(userId, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  const r = await query('SELECT id, amount, code, status, expires_at FROM topups WHERE id=$1 AND user_id=$2', [id, userId]);
  if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  const t = r[0];
  const st = t.status === 'pending' && new Date(t.expires_at) < new Date() ? 'expired' : t.status;
  return { id: t.id, amount: t.amount, code: t.code, status: st, expiresAt: t.expires_at };
}

// Chuẩn hóa nội dung chuyển khoản: hoa-thường, bỏ dấu, bỏ ký tự ngăn cách, bỏ tiền tố ngân hàng.
export function normalizeContent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Nhận một giao dịch tiền vào từ ngân hàng. Luôn ghi vào bank_inbox trước khi ghép.
export async function ingestBankTx({ bankTxId, amount, content, raw = null }) {
  if (!bankTxId || !Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(400, 'invalid_tx', 'Giao dịch không hợp lệ');
  const ins = await query(
    `INSERT INTO bank_inbox(bank_tx_id, amount, content, raw) VALUES($1,$2,$3,$4)
     ON CONFLICT (bank_tx_id) DO NOTHING RETURNING bank_tx_id`,
    [String(bankTxId), amount, String(content || '').slice(0, 300), JSON.stringify(raw)]);
  if (!ins.length) return { status: 'duplicate' };

  const norm = normalizeContent(content);
  const m = norm.match(/9S[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}/);
  const setInbox = (st, note, topupId = null) => query(
    'UPDATE bank_inbox SET status=$2, note=$3, matched_topup_id=$4 WHERE bank_tx_id=$1', [String(bankTxId), st, note, topupId]);
  if (!m) { await setInbox('unmatched', 'không thấy mã nạp trong nội dung'); return { status: 'unmatched' }; }
  const t0 = (await query('SELECT id FROM topups WHERE code=$1', [m[0]]))[0];
  if (!t0) { await setInbox('unmatched', 'mã nạp không tồn tại'); return { status: 'unmatched' }; }
  // Kiểm tra và cộng ví trong cùng một giao dịch có khóa dòng: hai thông báo đồng thời hoặc việc hết hạn chạy xen giữa không làm mất tiền.
  const res = await tx(async (c) => {
    const t = (await c.query('SELECT * FROM topups WHERE id=$1 FOR UPDATE', [t0.id]))[0];
    if (t.amount !== amount) return { status: 'needs_review', note: `lệch số tiền: yêu cầu ${t.amount}, nhận ${amount}`, topupId: t.id };
    if (t.status !== 'pending' || new Date(t.expires_at) < new Date()) return { status: 'needs_review', note: 'yêu cầu nạp đã hết hạn hoặc đã xử lý', topupId: t.id };
    await c.query("UPDATE topups SET status='paid', bank_tx_id=$2 WHERE id=$1", [t.id, String(bankTxId)]);
    await creditFromBank(c, t.user_id, amount, { idemScope: 'bank-tx', idemKey: String(bankTxId), payload: { topup: t.id } });
    await c.query("UPDATE bank_inbox SET status='matched', matched_topup_id=$2, note='' WHERE bank_tx_id=$1", [String(bankTxId), t.id]);
    return { status: 'matched' };
  });
  if (res.status === 'needs_review') await setInbox('needs_review', res.note, res.topupId);
  return { status: res.status };
}

// Quản trị ghép tay một giao dịch chưa ghép được: cộng đúng số tiền thực nhận cho người dùng chỉ định.
export async function matchManually(bankTxId, userId, adminLabel) {
  return tx(async (c) => {
    const rows = await c.query('SELECT * FROM bank_inbox WHERE bank_tx_id=$1 FOR UPDATE', [String(bankTxId)]);
    const r = rows[0];
    if (!r) throw new ApiError(404, 'not_found', 'Không có giao dịch');
    if (r.status === 'matched') throw new ApiError(409, 'already_matched', 'Giao dịch đã được ghép');
    const u = await c.query('SELECT id FROM users WHERE id=$1', [userId]);
    if (!u.length) throw new ApiError(404, 'user_not_found', 'Không có người dùng');
    await creditFromBank(c, userId, r.amount, { idemScope: 'bank-tx', idemKey: r.bank_tx_id, payload: { manual: adminLabel } });
    await c.query("UPDATE bank_inbox SET status='matched', note=$2 WHERE bank_tx_id=$1", [r.bank_tx_id, `ghép tay bởi ${adminLabel} cho user ${userId}`]);
    return { ok: true, amount: r.amount };
  });
}

export async function expirePending() {
  const r = await query("UPDATE topups SET status='expired' WHERE status='pending' AND expires_at < now() RETURNING id");
  return r.length;
}

export function verifyBankSignature(raw, signature) {
  if (!config.bankWebhookSecret) throw new ApiError(503, 'bank_webhook_disabled', 'Chưa cấu hình BANK_WEBHOOK_SECRET');
  const want = crypto.createHmac('sha256', config.bankWebhookSecret).update(raw).digest('hex');
  const a = Buffer.from(String(signature || ''));
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ApiError(401, 'bad_signature', 'Chữ ký không hợp lệ');
}
