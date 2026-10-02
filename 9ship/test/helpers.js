import assert from 'node:assert/strict';
import { migrate, resetForTests, query, tx, close } from '../src/db.js';
import * as ledger from '../src/ledger.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import { quoteAll } from '../src/rating.js';
import { validateQuoteRequest } from '../src/pricing.js';

// Mỗi bài kiểm thử gọi setup() để có CSDL sạch cùng quy tắc giá mặc định.
export async function setup() {
  try { await resetForTests(); } catch { /* lược đồ chưa có */ }
  await migrate();
  await resetForTests();
  await query(`INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, surcharge, rounding, require_cap)
               VALUES ('*','*',8,1000,0,500,true)`);
}

export async function makeUser(phone = '0900000001') {
  const r = await query('INSERT INTO users(phone, name) VALUES($1, $2) RETURNING id', [phone, 'Test ' + phone]);
  return r[0].id;
}

export { close };

let seq = 0;
export const newUser = () => makeUser('09140' + String(10000 + ++seq));
export const key = () => 'idem-' + Math.random().toString(36).slice(2, 12);

export async function fund(userId, amount) {
  await tx(async (c) => {
    const w = await ledger.lockWallet(c, userId);
    const bank = await ledger.systemAccount(c, 'bank');
    await ledger.post(c, { kind: 'topup', idemScope: 'tf', idemKey: 'f' + userId + '-' + Math.random(), entries: [{ accountId: bank, amount }, { accountId: w, amount: -amount }] });
  });
}
export const wallet = (userId) => tx((c) => ledger.walletBalance(c, userId));
export const acct = (userId, kind) => tx(async (c) => ledger.balance(c, await ledger.userAccount(c, userId, kind)));
export const sysAcct = (kind) => tx(async (c) => ledger.balance(c, await ledger.systemAccount(c, kind)));
export const due = () => query("UPDATE outbox SET next_at = now() WHERE status IN ('pending','processing','reconcile','attention')");

export const SENDER = { contact: 'Nguyễn Văn A', phone: '0901234567', street: '12 Lê Lợi', ward: 'Bến Nghé', province: 'TP Hồ Chí Minh' };
export const RECEIVER = { contact: 'Trần Thị B', phone: '0987654321', street: '34 Hai Bà Trưng', ward: 'Hàng Bài', province: 'Hà Nội' };

export async function getOffer(userId, carrier = 'mock-chuan', over = {}) {
  const req = validateQuoteRequest({ from: { province: 'TP Hồ Chí Minh', lat: 10.7769, lng: 106.7009 }, to: { province: 'Hà Nội' }, weightG: 1000, ...over });
  const q = await quoteAll(req, { userId });
  const offer = q.offers.find((o) => o.carrier === carrier);
  assert.ok(offer, 'không có offer ' + carrier);
  return { q, offer };
}

// Tạo một đơn đã được hãng nhận (trạng thái created) cho người dùng đã nạp tiền.
export async function makeCreated(userId, { carrier = 'mock-chuan', funds = 300000 } = {}) {
  await fund(userId, funds);
  const { q, offer } = await getOffer(userId, carrier);
  const { shipment } = await orders.create(userId, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  await worker.runOnce({ shipmentId: shipment.id });
  const view = await orders.get(userId, shipment.id);
  assert.equal(view.shippingStatus, 'created');
  return { id: shipment.id, view, offer, buffer: orders.bufferFor(offer.sellPrice), funds };
}
