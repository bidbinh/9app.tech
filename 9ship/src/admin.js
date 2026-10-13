import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import * as ledger from './ledger.js';
import { creditFromBank } from './wallet.js';
import { validateRule } from './pricing.js';
import { health, getAlerts } from './rating.js';

export async function audit(admin, action, target = '', before = null, after = null, reason = '') {
  await query(
    'INSERT INTO admin_audit(admin, action, target, before, after, reason) VALUES($1,$2,$3,$4,$5,$6)',
    [admin, action, String(target), before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), reason]);
}

export async function overview() {
  const bal = await tx(async (c) => {
    const out = {};
    for (const k of ['bank', 'aggregator_deposit', 'revenue', 'carrier_cost']) out[k] = await ledger.balance(c, await ledger.systemAccount(c, k));
    return out;
  });
  const liab = await query(
    `SELECT a.kind, COALESCE(-SUM(e.amount),0)::bigint AS s FROM accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id
      WHERE a.owner_type='user' GROUP BY a.kind`);
  const userLiabilities = Object.fromEntries(liab.map((r) => [r.kind, r.s]));
  const count = async (sql) => (await query(sql))[0].n;
  return {
    balances: { ...bal, userWallets: userLiabilities.user_wallet || 0, userHeld: userLiabilities.user_hold || 0, userBuffer: userLiabilities.hold_buffer || 0, pendingWithdrawals: userLiabilities.withdrawal_pending || 0 },
    queues: {
      attention: await count("SELECT count(*)::int n FROM shipments WHERE needs_attention IS NOT NULL"),
      bankInbox: await count("SELECT count(*)::int n FROM bank_inbox WHERE status IN ('unmatched','needs_review')"),
      withdrawals: await count("SELECT count(*)::int n FROM withdrawals WHERE status IN ('requested','approved','paying','unknown')"),
      claims: await count("SELECT count(*)::int n FROM claims WHERE status IN ('received','forwarded')"),
      negativeWallets: await count(`SELECT count(*)::int n FROM (SELECT a.id FROM accounts a JOIN ledger_entries e ON e.account_id=a.id
        WHERE a.kind='user_wallet' GROUP BY a.id HAVING -SUM(e.amount) < 0) x`),
    },
    carriers: health(),
    alerts: getAlerts(),
    orders: {
      today: await count("SELECT count(*)::int n FROM shipments WHERE created_at > now() - interval '24 hours'"),
      total: await count('SELECT count(*)::int n FROM shipments'),
    },
  };
}

export async function listRules() {
  return query('SELECT * FROM pricing_rules ORDER BY carrier, route');
}

export async function upsertRule(admin, r) {
  const rule = {
    carrier: String(r.carrier || '*'), route: String(r.route || '*'),
    margin_pct: Number(r.margin_pct), margin_min: Number(r.margin_min), surcharge: Number(r.surcharge || 0),
    rounding: Number(r.rounding), allow_loss: Boolean(r.allow_loss), require_cap: r.require_cap === undefined ? true : Boolean(r.require_cap),
    active: r.active === undefined ? true : Boolean(r.active),
  };
  validateRule(rule);
  if (!Number.isInteger(rule.surcharge) || rule.surcharge < 0) throw new ApiError(400, 'invalid_request', 'surcharge phải là số nguyên >= 0');
  const before = (await query('SELECT * FROM pricing_rules WHERE carrier=$1 AND route=$2', [rule.carrier, rule.route]))[0] || null;
  await query(
    `INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, surcharge, rounding, allow_loss, require_cap, active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (carrier, route) DO UPDATE SET margin_pct=EXCLUDED.margin_pct, margin_min=EXCLUDED.margin_min,
       surcharge=EXCLUDED.surcharge, rounding=EXCLUDED.rounding, allow_loss=EXCLUDED.allow_loss,
       require_cap=EXCLUDED.require_cap, active=EXCLUDED.active`,
    [rule.carrier, rule.route, rule.margin_pct, rule.margin_min, rule.surcharge, rule.rounding, rule.allow_loss, rule.require_cap, rule.active]);
  await audit(admin, 'pricing_rule.upsert', `${rule.carrier}|${rule.route}`, before, rule);
  return rule;
}

export async function listListPrices() {
  return query('SELECT * FROM list_prices ORDER BY carrier, service, route, max_weight_g');
}

export async function upsertListPrice(admin, r) {
  for (const k of ['carrier', 'service']) if (!r[k] || typeof r[k] !== 'string') throw new ApiError(400, 'invalid_request', `Thiếu ${k}`);
  if (!Number.isInteger(r.max_weight_g) || r.max_weight_g <= 0) throw new ApiError(400, 'invalid_request', 'max_weight_g không hợp lệ');
  if (!Number.isInteger(r.price) || r.price <= 0) throw new ApiError(400, 'invalid_request', 'price không hợp lệ');
  if (!r.owner || !r.source) throw new ApiError(400, 'invalid_request', 'Cần ghi nguồn (source) và người phụ trách (owner)');
  const before = (await query('SELECT * FROM list_prices WHERE carrier=$1 AND service=$2 AND route=$3 AND max_weight_g=$4', [r.carrier, r.service, r.route || '*', r.max_weight_g]))[0] || null;
  await query(
    `INSERT INTO list_prices(carrier, service, route, max_weight_g, price, vat_included, source, owner, verified_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (carrier, service, route, max_weight_g) DO UPDATE SET price=EXCLUDED.price, vat_included=EXCLUDED.vat_included,
       source=EXCLUDED.source, owner=EXCLUDED.owner, verified_at=now()`,
    [r.carrier, r.service, r.route || '*', r.max_weight_g, r.price, Boolean(r.vat_included), r.source, r.owner]);
  await audit(admin, 'list_price.upsert', `${r.carrier}|${r.service}|${r.route || '*'}|${r.max_weight_g}`, before, r);
  return { ok: true };
}

export async function manualCredit(admin, userId, amount, reason, idemKey) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000) throw new ApiError(400, 'invalid_amount', 'Số tiền không hợp lệ');
  if (!reason || String(reason).trim().length < 3) throw new ApiError(400, 'invalid_request', 'Cần ghi lý do');
  if (!idemKey || idemKey.length < 8) throw new ApiError(400, 'invalid_request', 'Cần Idempotency-Key');
  const u = await query('SELECT id, phone FROM users WHERE id=$1', [userId]);
  if (!u.length) throw new ApiError(404, 'user_not_found', 'Không có người dùng');
  const r = await tx((c) => creditFromBank(c, userId, amount, { kind: 'topup', idemScope: 'admin-credit', idemKey, payload: { reason } }));
  if (!r.replay) await audit(admin, 'wallet.credit', String(userId), null, { amount }, reason);
  return { ok: true, replay: r.replay };
}

export async function recordAggregatorDeposit(admin, amount, ref, reason) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(400, 'invalid_amount', 'Số tiền không hợp lệ');
  if (!ref || String(ref).length < 4) throw new ApiError(400, 'invalid_request', 'Cần mã tham chiếu giao dịch nạp ký quỹ');
  const r = await tx(async (c) => {
    const deposit = await ledger.systemAccount(c, 'aggregator_deposit');
    const bank = await ledger.systemAccount(c, 'bank');
    return ledger.post(c, { kind: 'topup', idemScope: 'agg-deposit', idemKey: String(ref), payload: { amount }, entries: [{ accountId: deposit, amount }, { accountId: bank, amount: -amount }] });
  });
  if (!r.replay) await audit(admin, 'deposit.record', String(ref), null, { amount }, reason || '');
  return { ok: true, replay: r.replay };
}

export async function setSetting(admin, key, value) {
  if (!['deposit_min'].includes(key)) throw new ApiError(400, 'invalid_request', 'Khóa cài đặt không hợp lệ');
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(400, 'invalid_request', 'Giá trị không hợp lệ');
  const before = (await query('SELECT value FROM settings WHERE key=$1', [key]))[0] || null;
  await query('INSERT INTO settings(key, value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
  await audit(admin, 'setting.set', key, before, { value });
  return { ok: true };
}

export async function findUsers(q) {
  const term = String(q || '').replace(/[^0-9+]/g, '');
  if (term.length < 4) return [];
  const rows = await query('SELECT id, phone, name, created_at FROM users WHERE phone LIKE $1 ORDER BY id DESC LIMIT 20', ['%' + term + '%']);
  const out = [];
  for (const u of rows) out.push({ ...u, balance: await tx((c) => ledger.walletBalance(c, u.id)) });
  return out;
}

export async function listShipments({ attention = false, limit = 100 } = {}) {
  const rows = attention
    ? await query('SELECT * FROM shipments WHERE needs_attention IS NOT NULL ORDER BY updated_at DESC LIMIT $1', [limit])
    : await query('SELECT * FROM shipments ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, carrier: r.carrier, trackingCode: r.tracking_code, carrierRef: r.carrier_ref,
    shippingStatus: r.shipping_status, cancelStatus: r.cancel_status, paymentStatus: r.payment_status,
    sellPrice: r.sell_price, costPrice: r.cost_price, needsAttention: r.needs_attention, createdAt: r.created_at,
  }));
}

export async function listAudit(limit = 100) {
  return query('SELECT * FROM admin_audit ORDER BY id DESC LIMIT $1', [limit]);
}

export async function listBankInbox(status = null) {
  return status
    ? query('SELECT * FROM bank_inbox WHERE status=$1 ORDER BY received_at DESC LIMIT 200', [status])
    : query('SELECT * FROM bank_inbox ORDER BY received_at DESC LIMIT 200');
}
