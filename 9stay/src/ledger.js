import { AppError } from './errors.js';
import { assertUuid } from './ids.js';

export const ACCOUNTS = new Set([
  'bank', 'guest_deposit_liability', 'held_for_owner', 'anstay_revenue', 'vat_payable',
  'commission_expense', 'agent_commission_payable', 'cleaning_payable', 'cleaning_expense', 'receivable',
]);

// Ghi một giao dịch sổ kép (ghi nợ dương, ghi có âm, tổng bằng 0). Idempotent theo ref trong org:
// gọi lại cùng ref trả giao dịch cũ (created=false) và không ghi thêm dòng nào.
export async function postTransaction(c, { orgId, kind, bookingId = null, ref, memo = '', entries }) {
  assertUuid(orgId, 'org');
  if (bookingId !== null) assertUuid(bookingId, 'đơn');
  if (typeof kind !== 'string' || !kind) throw new AppError('bad_ledger', 'Loại giao dịch sổ không hợp lệ');
  if (typeof ref !== 'string' || !ref || ref.length > 200) throw new AppError('bad_ledger', 'Mã tham chiếu giao dịch không hợp lệ');
  if (!Array.isArray(entries) || entries.length < 2) throw new AppError('bad_ledger', 'Giao dịch sổ cần ít nhất hai dòng');
  let sum = 0;
  for (const e of entries) {
    if (!ACCOUNTS.has(e.account)) throw new AppError('bad_ledger', 'Tài khoản sổ không tồn tại: ' + e.account);
    if (!Number.isSafeInteger(e.amount) || e.amount === 0) throw new AppError('bad_ledger', 'Số tiền dòng sổ không hợp lệ');
    if (e.partyId) assertUuid(e.partyId, 'đối tượng');
    sum += e.amount;
  }
  if (sum !== 0) throw new AppError('unbalanced', 'Giao dịch sổ không cân bằng (tổng khác 0)');

  const ins = await c.query(
    'INSERT INTO ledger_transactions(org_id, kind, booking_id, ref, memo) VALUES($1, $2, $3, $4, $5) ON CONFLICT (org_id, ref) DO NOTHING RETURNING id',
    [orgId, kind, bookingId, ref, memo],
  );
  if (!ins.length) {
    const [existing] = await c.query('SELECT id FROM ledger_transactions WHERE org_id = $1 AND ref = $2', [orgId, ref]);
    return { id: existing.id, created: false };
  }
  const txId = ins[0].id;
  for (const e of entries) {
    await c.query('INSERT INTO ledger_entries(org_id, tx_id, account, party_id, amount) VALUES($1, $2, $3, $4, $5)', [orgId, txId, e.account, e.partyId || null, e.amount]);
  }
  return { id: txId, created: true };
}

// Số dư có dấu: dương = ghi nợ, âm = ghi có (tài khoản nợ phải trả có số dư âm).
// partyId: bỏ trống = cộng mọi đối tượng; một uuid = chỉ đối tượng đó.
export async function accountBalance(c, { orgId, account, partyId }) {
  assertUuid(orgId, 'org');
  if (!ACCOUNTS.has(account)) throw new AppError('bad_ledger', 'Tài khoản sổ không tồn tại: ' + account);
  if (partyId === undefined) {
    const [r] = await c.query('SELECT COALESCE(SUM(amount), 0)::bigint AS balance FROM ledger_entries WHERE org_id = $1 AND account = $2', [orgId, account]);
    return r.balance;
  }
  assertUuid(partyId, 'đối tượng');
  const [r] = await c.query('SELECT COALESCE(SUM(amount), 0)::bigint AS balance FROM ledger_entries WHERE org_id = $1 AND account = $2 AND party_id = $3', [orgId, account, partyId]);
  return r.balance;
}
