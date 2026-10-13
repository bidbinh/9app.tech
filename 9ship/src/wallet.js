import { query, tx } from './db.js';
import * as ledger from './ledger.js';

export async function get(userId) {
  const [bal, held, buffer, pendingWd] = await tx(async (c) => [
    await ledger.walletBalance(c, userId),
    await ledger.balance(c, await ledger.userAccount(c, userId, 'user_hold')),
    await ledger.balance(c, await ledger.userAccount(c, userId, 'hold_buffer')),
    await ledger.balance(c, await ledger.userAccount(c, userId, 'withdrawal_pending')),
  ]);
  const entries = await query(
    `SELECT t.kind, e.amount, t.shipment_id, e.created_at
       FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.tx_id
       JOIN accounts a ON a.id = e.account_id
      WHERE a.owner_type='user' AND a.owner_id=$1 AND a.kind='user_wallet'
      ORDER BY e.id DESC LIMIT 50`, [String(userId)]);
  return {
    balance: bal,
    held,
    buffer,
    pendingWithdrawal: pendingWd,
    entries: entries.map((e) => ({ kind: e.kind, amount: -e.amount, shipmentId: e.shipment_id, at: e.created_at })),
  };
}

// Cộng ví từ bên ngoài sổ (nạp tay, nạp ngân hàng): Nợ ngân hàng, Có ví.
export async function creditFromBank(c, userId, amount, { kind = 'topup', idemScope, idemKey, payload = {} }) {
  const w = await ledger.lockWallet(c, userId);
  const bank = await ledger.systemAccount(c, 'bank');
  return ledger.post(c, {
    kind, idemScope, idemKey, payload: { userId, amount, ...payload },
    entries: [{ accountId: bank, amount }, { accountId: w, amount: -amount }],
  });
}
