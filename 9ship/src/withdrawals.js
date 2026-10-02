import crypto from 'node:crypto';
import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import * as ledger from './ledger.js';

const ledgerHashOf = (o) => ledger.hashPayload(o);

export const MIN_WITHDRAW = 50_000;
const NEW_ACCOUNT_DELAY_H = 24;

// Trạng thái hợp lệ: action -> { từ: đến }
const FLOW = {
  approve: { requested: 'approved' },
  start: { approved: 'paying' },
  paid: { paying: 'paid', unknown: 'paid' },
  unknown: { paying: 'unknown' },
  fail: { paying: 'failed', unknown: 'failed' },       // quản trị xác nhận CHƯA chi
  reject: { requested: 'rejected', approved: 'rejected' },
  cancel: { requested: 'cancelled' },                  // người dùng tự hủy
};
const RELEASES = new Set(['failed', 'rejected', 'cancelled']);

function cleanAccount(a) {
  if (!a || typeof a !== 'object') throw new ApiError(400, 'invalid_request', 'Thiếu tài khoản nhận tiền');
  const number = String(a.number || '').replace(/\s/g, '');
  const holder = String(a.holder || '').trim();
  const bank = String(a.bank || '').trim();
  if (!/^\d{6,20}$/.test(number)) throw new ApiError(400, 'invalid_request', 'Số tài khoản không hợp lệ', { field: 'number' });
  if (holder.length < 2 || holder.length > 60) throw new ApiError(400, 'invalid_request', 'Tên chủ tài khoản không hợp lệ', { field: 'holder' });
  if (bank.length < 2 || bank.length > 60) throw new ApiError(400, 'invalid_request', 'Ngân hàng không hợp lệ', { field: 'bank' });
  return { number, holder, bank };
}

const view = (w) => ({
  id: w.id, amount: w.amount, status: w.status, bankAccount: { ...w.bank_account, number: '****' + String(w.bank_account.number).slice(-4) },
  note: w.note, notBefore: w.not_before, createdAt: w.created_at,
});

export async function request(userId, { amount, bankAccount }, idemKey) {
  if (typeof idemKey !== 'string' || idemKey.length < 8 || idemKey.length > 80) {
    throw new ApiError(400, 'invalid_request', 'Cần header Idempotency-Key (8-80 ký tự)');
  }
  if (!Number.isSafeInteger(amount) || amount < MIN_WITHDRAW) {
    throw new ApiError(400, 'invalid_amount', `Số tiền rút tối thiểu ${MIN_WITHDRAW.toLocaleString('vi-VN')} đồng`);
  }
  const acc = cleanAccount(bankAccount);
  const hash = ledgerHashOf({ amount, acc });

  const existing = async () => {
    const r = await query('SELECT * FROM withdrawals WHERE user_id=$1 AND idem_key=$2', [userId, idemKey]);
    if (!r.length) return null;
    if (ledgerHashOf({ amount: r[0].amount, acc: r[0].bank_account }) !== hash) {
      throw new ApiError(409, 'idempotency_conflict', 'Khóa đã dùng cho yêu cầu khác nội dung');
    }
    return r[0];
  };
  const prev = await existing();
  if (prev) return view(prev);

  try {
    const w = await tx(async (c) => {
      const walletId = await ledger.lockWallet(c, userId);
      const pendId = await ledger.userAccount(c, userId, 'withdrawal_pending');
      // tài khoản nhận mới (chưa từng rút) phải chờ một khoảng an toàn
      const seen = await c.query("SELECT 1 FROM withdrawals WHERE user_id=$1 AND bank_account->>'number'=$2 AND status='paid' LIMIT 1", [userId, acc.number]);
      const notBefore = seen.length ? new Date() : new Date(Date.now() + NEW_ACCOUNT_DELAY_H * 3600_000);
      const ref = 'WD' + crypto.randomBytes(7).toString('hex').toUpperCase();
      const ins = await c.query(
        `INSERT INTO withdrawals(user_id, amount, bank_account, payout_ref, idem_key, not_before)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [userId, amount, JSON.stringify(acc), ref, idemKey, notBefore]);
      await ledger.post(c, {
        kind: 'withdrawal', idemScope: 'wd-hold:' + userId, idemKey, payload: { wd: ins[0].id, amount },
        entries: [{ accountId: walletId, amount }, { accountId: pendId, amount: -amount }],
      });
      return ins[0];
    });
    return view(w);
  } catch (e) {
    if (e && e.code === '23505') { const again = await existing(); if (again) return view(again); }
    throw e;
  }
}

export async function listForUser(userId) {
  return (await query('SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [userId])).map(view);
}

// Chuyển trạng thái; mọi chuyển đều có điều kiện trạng thái hiện tại nên chạy lại không ghi hai lần.
export async function transition(id, action, { actor = 'system', bankRef = '', note = '', byUserId = null } = {}) {
  const map = FLOW[action];
  if (!map) throw new ApiError(400, 'invalid_action', 'Hành động không hợp lệ');
  return tx(async (c) => {
    const rows = await c.query('SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [id]);
    const w = rows[0];
    if (!w || (byUserId !== null && w.user_id !== byUserId)) throw new ApiError(404, 'not_found', 'Không có yêu cầu rút tiền');
    const to = map[w.status];
    if (!to) throw new ApiError(409, 'invalid_transition', `Không thể ${action} khi đang ở trạng thái ${w.status}`);
    if (action === 'approve' && new Date(w.not_before) > new Date()) {
      throw new ApiError(409, 'not_yet', 'Tài khoản nhận mới, chưa đến thời điểm được duyệt', { notBefore: w.not_before });
    }
    if (action === 'paid' && !bankRef) throw new ApiError(400, 'invalid_request', 'Cần mã giao dịch ngân hàng khi xác nhận đã chi');
    const walletId = await ledger.lockWallet(c, w.user_id);
    const pendId = await ledger.userAccount(c, w.user_id, 'withdrawal_pending');
    if (to === 'paid') {
      const bank = await ledger.systemAccount(c, 'bank');
      await ledger.post(c, {
        kind: 'withdrawal', idemScope: 'wd-paid', idemKey: w.id, payload: { bankRef },
        entries: [{ accountId: pendId, amount: w.amount }, { accountId: bank, amount: -w.amount }],
      });
    } else if (RELEASES.has(to)) {
      await ledger.post(c, {
        kind: 'release', idemScope: 'wd-release', idemKey: w.id, payload: { to },
        entries: [{ accountId: pendId, amount: w.amount }, { accountId: walletId, amount: -w.amount }],
      });
    }
    const upd = await c.query(
      'UPDATE withdrawals SET status=$2, note=$3, bank_ref=$4, updated_at=now() WHERE id=$1 AND status=$5 RETURNING *',
      [w.id, to, note || `${action} bởi ${actor}`, bankRef || w.bank_ref, w.status]);
    if (!upd.length) throw new ApiError(409, 'invalid_transition', 'Trạng thái vừa thay đổi');
    return { ...view(upd[0]), from: w.status };
  });
}

export async function adminList(status = null) {
  const rows = status
    ? await query('SELECT * FROM withdrawals WHERE status=$1 ORDER BY created_at LIMIT 200', [status])
    : await query('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 200');
  // quản trị cần số tài khoản đầy đủ để chuyển tiền
  return rows.map((w) => ({ ...view(w), userId: w.user_id, bankAccountFull: w.bank_account, payoutRef: w.payout_ref, bankRef: w.bank_ref }));
}
