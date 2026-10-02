import crypto from 'node:crypto';
import { ApiError } from './errors.js';
import { config } from './config.js';

// Quy ước dấu: amount > 0 là NỢ, amount < 0 là CÓ. Tổng mỗi giao dịch bằng 0.
const DEBIT_NATURAL = new Set(['bank', 'aggregator_deposit', 'carrier_cost', 'adjustment_receivable']);
// Các tài khoản không được âm (theo số dư tự nhiên của chúng).
const NON_NEGATIVE = new Set(['user_wallet', 'user_hold', 'hold_buffer', 'withdrawal_pending']);

export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function hashPayload(obj) {
  return crypto.createHash('sha256').update(stableStringify(obj)).digest('hex');
}

export async function account(c, ownerType, ownerId, kind) {
  await c.query(
    'INSERT INTO accounts(owner_type, owner_id, kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [ownerType, String(ownerId), kind],
  );
  const r = await c.query(
    'SELECT id FROM accounts WHERE owner_type=$1 AND owner_id=$2 AND kind=$3',
    [ownerType, String(ownerId), kind],
  );
  return r[0].id;
}

export const userAccount = (c, userId, kind) => account(c, 'user', userId, kind);
export const systemAccount = (c, kind) => account(c, 'system', 'main', kind);

// Khóa dòng ví người dùng; mọi giao dịch ảnh hưởng ví phải gọi trước.
export async function lockWallet(c, userId) {
  const id = await userAccount(c, userId, 'user_wallet');
  await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [id]);
  return id;
}

export async function balance(c, accountId) {
  const r = await c.query(
    `SELECT a.kind, COALESCE(SUM(e.amount),0)::bigint AS s
       FROM accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id
      WHERE a.id=$1 GROUP BY a.kind`,
    [accountId],
  );
  if (!r.length) return 0;
  return DEBIT_NATURAL.has(r[0].kind) ? r[0].s : -r[0].s;
}

export async function walletBalance(c, userId) {
  return balance(c, await userAccount(c, userId, 'user_wallet'));
}

// entries: [{ accountId, amount }]; kind 'adjustment' được phép đẩy ví xuống âm tới trần.
export async function post(c, { kind, idemScope, idemKey, payload = {}, shipmentId = null, entries }) {
  if (!idemScope || !idemKey) throw new Error('ledger.post cần idemScope và idemKey');
  if (!Array.isArray(entries) || entries.length < 2) throw new Error('giao dịch cần ít nhất hai dòng');
  let sum = 0;
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amount) || e.amount === 0) throw new Error('số tiền phải là số nguyên khác 0');
    sum += e.amount;
  }
  if (sum !== 0) throw new Error('tổng giao dịch phải bằng 0 (hiện ' + sum + ')');

  const hash = hashPayload({ kind, payload, entries: entries.map((e) => [e.accountId, e.amount]) });

  // Khóa mọi tài khoản không-được-âm liên quan theo thứ tự id (tránh deadlock).
  const ids = [...new Set(entries.map((e) => e.accountId))].sort((a, b) => a - b);
  const locked = await c.query(
    'SELECT id, kind FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
    [ids],
  );

  const ins = await c.query(
    `INSERT INTO ledger_transactions(kind, idem_scope, idem_key, payload_hash, shipment_id)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT (idem_scope, idem_key) DO NOTHING RETURNING id`,
    [kind, idemScope, idemKey, hash, shipmentId],
  );
  if (!ins.length) {
    const ex = await c.query(
      'SELECT id, payload_hash FROM ledger_transactions WHERE idem_scope=$1 AND idem_key=$2',
      [idemScope, idemKey],
    );
    if (ex[0].payload_hash !== hash) {
      throw new ApiError(409, 'idempotency_conflict', 'Khóa đã dùng cho yêu cầu khác nội dung');
    }
    return { txId: ex[0].id, replay: true };
  }
  const txId = ins[0].id;
  for (const e of entries) {
    await c.query('INSERT INTO ledger_entries(tx_id, account_id, amount) VALUES($1,$2,$3)', [txId, e.accountId, e.amount]);
  }

  const floor = kind === 'adjustment' ? -config.walletOverdraftCap : 0;
  for (const a of locked) {
    if (!NON_NEGATIVE.has(a.kind)) continue;
    const bal = await balance(c, a.id);
    const min = a.kind === 'user_wallet' ? floor : 0;
    if (bal < min) {
      throw new ApiError(402, 'insufficient_funds', 'Số dư không đủ');
    }
  }
  return { txId, replay: false };
}

// Kiểm tra toàn cục: mọi giao dịch cân bằng, tổng toàn sổ bằng 0.
export async function audit(c) {
  const bad = await c.query(
    `SELECT tx_id, SUM(amount)::bigint AS s FROM ledger_entries GROUP BY tx_id HAVING SUM(amount) <> 0`,
  );
  const total = await c.query('SELECT COALESCE(SUM(amount),0)::bigint AS s FROM ledger_entries');
  return { unbalanced: bad, total: total[0].s };
}
