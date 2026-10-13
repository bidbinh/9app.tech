import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query, tx } from '../src/db.js';
import { config } from '../src/config.js';
import * as ledger from '../src/ledger.js';
import * as orders from '../src/orders.js';
import * as topup from '../src/topup.js';
import * as withdrawals from '../src/withdrawals.js';
import * as claims from '../src/claims.js';
import * as admin from '../src/admin.js';
import * as auth from '../src/auth.js';
import * as worker from '../src/worker.js';
import { quoteAll, resetBreakers, clearAlerts } from '../src/rating.js';
import { validateQuoteRequest } from '../src/pricing.js';
import { mockControl } from '../src/carriers/mock.js';
import { syncPickupPoints } from '../src/places.js';
import { buildApp } from '../src/server.js';
import { setup, close, newUser, fund, wallet, acct, sysAcct, makeCreated, getOffer, key, loginCookie, SENDER, RECEIVER } from './helpers.js';

let app; let base;
before(async () => {
  await setup();
  await syncPickupPoints();
  worker.workerOpts.reconcileMinAgeMs = 0;
  config.adminToken = 'adm-tok';
  config.adminTotpSecret = 'JBSWY3DPEHPK3PXP';
  config.bankWebhookSecret = 'bank-secret';
  config.routeLimitFactor = 1000;
  config.rateLimitPerMin = 100000;
  app = buildApp();
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });
beforeEach(() => { mockControl.reset(); resetBreakers(); clearAlerts(); });

const auditOk = async () => { const a = await tx((c) => ledger.audit(c)); assert.deepEqual(a.unbalanced, []); assert.equal(a.total, 0); };
const H = { 'content-type': 'application/json', 'x-requested-with': '9ship' };

// ---------------- VietQR và nạp ví ----------------
test('CRC16-CCITT khớp vectơ chuẩn và mã VietQR tự kiểm', () => {
  assert.equal(topup.crc16('123456789'), '29B1');
  const p = topup.vietQrPayload({ bin: '970436', account: '0011001234567', amount: 150000, content: '9SABCD2345' });
  assert.equal(topup.crc16(p.slice(0, -4)), p.slice(-4));
  assert.ok(p.includes('5303704') && p.includes('540') && p.includes('9SABCD2345'));
});

test('chưa cấu hình tài khoản ngân hàng ở production thì không cho nạp ví', async () => {
  const u = await newUser();
  config.bankConfigured = false;
  try { await assert.rejects(topup.create(u, 100000), (e) => e.status === 503 && e.code === 'topup_unavailable'); }
  finally { config.bankConfigured = true; }
});

test('tạo yêu cầu nạp: giới hạn số tiền, có mã và QR', async () => {
  const u = await newUser();
  await assert.rejects(topup.create(u, 5000), (e) => e.status === 400);
  await assert.rejects(topup.create(u, 100_000_000), (e) => e.status === 400);
  await assert.rejects(topup.create(u, 10.5), (e) => e.status === 400);
  const t = await topup.create(u, 200000);
  assert.match(t.code, /^9S[A-Z2-9]{8}$/);
  assert.ok(t.qrSvg.includes('<svg'));
  assert.equal((await topup.status(u, t.id)).status, 'pending');
});

test('tiền về khớp mã: cộng ví một lần; nội dung bị đổi hoa/thường/dấu vẫn khớp; trùng giao dịch bỏ qua', async () => {
  const u = await newUser();
  const t = await topup.create(u, 300000);
  const messy = 'MBVCB.123 chuyen tien ' + t.code.toLowerCase().replace(/(.{4})/g, '$1 ') + ' cam on';
  const r1 = await topup.ingestBankTx({ bankTxId: 'BT-1-' + u, amount: 300000, content: messy });
  assert.equal(r1.status, 'matched');
  assert.equal(await wallet(u), 300000);
  assert.equal((await topup.status(u, t.id)).status, 'paid');
  const r2 = await topup.ingestBankTx({ bankTxId: 'BT-1-' + u, amount: 300000, content: messy });
  assert.equal(r2.status, 'duplicate');
  assert.equal(await wallet(u), 300000);
  await auditOk();
});

test('lệch số tiền, hết hạn, thiếu mã: vào hàng đợi, ví không đổi; quản trị ghép tay đúng số tiền thực nhận một lần', async () => {
  const u = await newUser();
  const t = await topup.create(u, 100000);
  assert.equal((await topup.ingestBankTx({ bankTxId: 'BT-2-' + u, amount: 90000, content: t.code })).status, 'needs_review');
  assert.equal(await wallet(u), 0);
  await query("UPDATE topups SET expires_at = now() - interval '1 minute' WHERE id=$1", [t.id]);
  assert.equal((await topup.ingestBankTx({ bankTxId: 'BT-3-' + u, amount: 100000, content: t.code })).status, 'needs_review');
  assert.equal((await topup.ingestBankTx({ bankTxId: 'BT-4-' + u, amount: 100000, content: 'khong co ma' })).status, 'unmatched');
  assert.equal(await wallet(u), 0);
  const m = await topup.matchManually('BT-2-' + u, u, 'admin');
  assert.equal(m.amount, 90000);
  assert.equal(await wallet(u), 90000);
  await assert.rejects(topup.matchManually('BT-2-' + u, u, 'admin'), (e) => e.status === 409);
  assert.equal(await wallet(u), 90000);
  await auditOk();
});

test('webhook ngân hàng: sai chữ ký 401, đúng chữ ký ghi nhận, không cần CSRF', async () => {
  const u = await newUser();
  const t = await topup.create(u, 120000);
  const raw = JSON.stringify({ transactions: [{ id: 'BT-H-' + u, amount: 120000, content: t.code }] });
  let r = await fetch(base + '/v1/webhooks/bank', { method: 'POST', body: raw, headers: { 'x-signature': 'sai' } });
  assert.equal(r.status, 401);
  const sig = crypto.createHmac('sha256', 'bank-secret').update(raw).digest('hex');
  r = await fetch(base + '/v1/webhooks/bank', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).results[0].status, 'matched');
  assert.equal(await wallet(u), 120000);
  const saved = config.bankWebhookSecret;
  config.bankWebhookSecret = '';
  r = await fetch(base + '/v1/webhooks/bank', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
  assert.equal(r.status, 503);
  config.bankWebhookSecret = saved;
});

// ---------------- Rút tiền ----------------
const ACC = { bank: 'Vietcombank', number: '0123456789', holder: 'NGUYEN VAN A' };

test('rút tiền: giữ ngay, không đủ thì 402, cùng khóa trả cùng yêu cầu, khác nội dung 409', async () => {
  const u = await newUser();
  await fund(u, 500000);
  await assert.rejects(withdrawals.request(u, { amount: 900000, bankAccount: ACC }, key()), (e) => e.status === 402);
  await assert.rejects(withdrawals.request(u, { amount: 1000, bankAccount: ACC }, key()), (e) => e.status === 400);
  await assert.rejects(withdrawals.request(u, { amount: 100000, bankAccount: { ...ACC, number: 'abc' } }, key()), (e) => e.status === 400);
  const k = key();
  const a = await withdrawals.request(u, { amount: 200000, bankAccount: ACC }, k);
  const b = await withdrawals.request(u, { amount: 200000, bankAccount: ACC }, k);
  assert.equal(a.id, b.id);
  assert.equal(a.bankAccount.number, '****6789');
  assert.equal(await wallet(u), 300000);
  assert.equal(await acct(u, 'withdrawal_pending'), 200000);
  await assert.rejects(withdrawals.request(u, { amount: 250000, bankAccount: ACC }, k), (e) => e.status === 409);
  await auditOk();
});

test('rút tiền: tài khoản mới phải chờ; quy trình requested → approved → paying → paid ghi sổ đúng', async () => {
  const u = await newUser();
  await fund(u, 400000);
  const w = await withdrawals.request(u, { amount: 150000, bankAccount: ACC }, key());
  await assert.rejects(withdrawals.transition(w.id, 'approve'), (e) => e.code === 'not_yet');
  await query("UPDATE withdrawals SET not_before = now() - interval '1 second' WHERE id=$1", [w.id]);
  await withdrawals.transition(w.id, 'approve');
  await withdrawals.transition(w.id, 'start');
  await assert.rejects(withdrawals.transition(w.id, 'paid', {}), (e) => e.status === 400, 'cần mã giao dịch ngân hàng');
  const bankBefore = await sysAcct('bank');
  const done = await withdrawals.transition(w.id, 'paid', { bankRef: 'FT123' });
  assert.equal(done.status, 'paid');
  assert.equal(await acct(u, 'withdrawal_pending'), 0);
  assert.equal(await sysAcct('bank'), bankBefore - 150000);
  assert.equal(await wallet(u), 250000);
  await assert.rejects(withdrawals.transition(w.id, 'paid', { bankRef: 'FT123' }), (e) => e.code === 'invalid_transition');
  assert.equal(await sysAcct('bank'), bankBefore - 150000, 'không chi hai lần');
  // lần sau cùng tài khoản đã từng chi thì không phải chờ
  const w2 = await withdrawals.request(u, { amount: 60000, bankAccount: ACC }, key());
  await withdrawals.transition(w2.id, 'approve');
  await auditOk();
});

test('rút tiền: chi thất bại hoặc từ chối thì hoàn về ví; kết quả không rõ thì giữ nguyên cho tới khi đối soát', async () => {
  const u = await newUser();
  await fund(u, 500000);
  const ok = async (amount) => {
    const w = await withdrawals.request(u, { amount, bankAccount: { ...ACC, number: '999888777' } }, key());
    await query("UPDATE withdrawals SET not_before = now() - interval '1 second' WHERE id=$1", [w.id]);
    return w;
  };
  const w1 = await ok(100000);
  await withdrawals.transition(w1.id, 'approve');
  await withdrawals.transition(w1.id, 'start');
  await withdrawals.transition(w1.id, 'unknown', { note: 'ngân hàng báo timeout' });
  assert.equal(await acct(u, 'withdrawal_pending'), 100000, 'chưa nhả khi chưa chắc');
  assert.equal(await wallet(u), 400000);
  await withdrawals.transition(w1.id, 'fail', { note: 'đối soát: chưa chi' });
  assert.equal(await wallet(u), 500000);
  assert.equal(await acct(u, 'withdrawal_pending'), 0);
  await assert.rejects(withdrawals.transition(w1.id, 'fail'), (e) => e.code === 'invalid_transition');
  assert.equal(await wallet(u), 500000, 'không nhả hai lần');
  const w2 = await ok(70000);
  await withdrawals.transition(w2.id, 'reject', { note: 'nghi ngờ' });
  assert.equal(await wallet(u), 500000);
  await auditOk();
});

test('người dùng tự hủy khi còn requested; không hủy được sau khi duyệt; không hủy của người khác', async () => {
  const u = await newUser();
  const other = await newUser();
  await fund(u, 300000);
  const w = await withdrawals.request(u, { amount: 100000, bankAccount: ACC }, key());
  await assert.rejects(withdrawals.transition(w.id, 'cancel', { byUserId: other }), (e) => e.status === 404);
  await withdrawals.transition(w.id, 'cancel', { byUserId: u });
  assert.equal(await wallet(u), 300000);
  const w2 = await withdrawals.request(u, { amount: 100000, bankAccount: { ...ACC, number: '55555555' } }, key());
  await query("UPDATE withdrawals SET not_before = now() - interval '1 second' WHERE id=$1", [w2.id]);
  await withdrawals.transition(w2.id, 'approve');
  await assert.rejects(withdrawals.transition(w2.id, 'cancel', { byUserId: u }), (e) => e.code === 'invalid_transition');
});

test('rút tiền song song với tạo đơn, ví chỉ đủ một việc: ví không bao giờ âm', async () => {
  const u = await newUser();
  const { q, offer } = await getOffer(u);
  const need = offer.sellPrice + orders.bufferFor(offer.sellPrice);
  await fund(u, need + 500);
  const rs = await Promise.allSettled([
    orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key()),
    withdrawals.request(u, { amount: Math.max(50000, need), bankAccount: ACC }, key()),
  ]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok((await wallet(u)) >= 0);
  await auditOk();
});

test('API rút tiền cần nhập lại mật khẩu (step-up)', async () => {
  const phone = '0915000001';
  await fetch(base + '/v1/auth/register/otp', { method: 'POST', headers: H, body: JSON.stringify({ phone }) });
  const code = auth.sentForTests.at(-1).code;
  const v = await fetch(base + '/v1/auth/register', { method: 'POST', headers: H, body: JSON.stringify({ phone, code, name: 'Người Rút Tiền', password: 'matkhau-rut' }) });
  assert.equal(v.status, 200);
  const cookie = (v.headers.getSetCookie()[0] || '').split(';')[0];
  const uid = (await query('SELECT id FROM users WHERE phone=$1', [phone]))[0].id;
  await fund(uid, 300000);
  const body = JSON.stringify({ amount: 100000, bankAccount: ACC });
  let r = await fetch(base + '/v1/wallet/withdrawals', { method: 'POST', headers: { ...H, cookie, 'idempotency-key': key() }, body });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, 'step_up_required');
  r = await fetch(base + '/v1/auth/step-up', { method: 'POST', headers: { ...H, cookie }, body: JSON.stringify({ password: 'sai-mat-khau' }) });
  assert.equal(r.status, 401);
  r = await fetch(base + '/v1/auth/step-up', { method: 'POST', headers: { ...H, cookie }, body: JSON.stringify({ password: 'matkhau-rut' }) });
  assert.equal(r.status, 200);
  r = await fetch(base + '/v1/wallet/withdrawals', { method: 'POST', headers: { ...H, cookie, 'idempotency-key': key() }, body });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'requested');
});

// ---------------- Khiếu nại ----------------
test('khiếu nại: tạo, chứng cứ tự động, chặn trùng, kiểm tra quyền sở hữu', async () => {
  const u = await newUser();
  const other = await newUser();
  const o = await makeCreated(u);
  await assert.rejects(claims.create(u, { shipmentId: o.id, kind: 'khac', description: 'mất hàng rồi' }), (e) => e.status === 400);
  await assert.rejects(claims.create(u, { shipmentId: o.id, kind: 'lost', description: 'x' }), (e) => e.status === 400);
  await assert.rejects(claims.create(other, { shipmentId: o.id, kind: 'lost', description: 'hàng bị mất rồi' }), (e) => e.status === 404);
  await assert.rejects(claims.create(u, { shipmentId: o.id, kind: 'lost', description: 'hàng bị mất rồi', evidence: [{ type: 'url', value: 'javascript:alert(1)' }] }), (e) => e.status === 400);
  const c = await claims.create(u, { shipmentId: o.id, kind: 'lost', description: 'Người nhận báo chưa nhận được hàng', evidence: [{ type: 'url', value: 'https://example.com/anh.jpg' }] });
  assert.equal(c.status, 'received');
  assert.ok(c.evidence[0].value.includes('Mã vận đơn'));
  assert.equal(c.evidence.length, 2);
  assert.ok(new Date(c.deadline) > new Date());
  await assert.rejects(claims.create(u, { shipmentId: o.id, kind: 'lost', description: 'báo lại lần nữa nhé' }), (e) => e.status === 409);
  assert.equal((await claims.list(u)).length, 1);
  assert.equal((await claims.list(other)).length, 0);
});

test('khiếu nại: quản trị chuyển trạng thái, bồi thường chỉ ghi khi giải quyết và chỉ một lần', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const c = await claims.create(u, { shipmentId: o.id, kind: 'damaged', description: 'Hàng bị móp méo khi nhận' });
  await assert.rejects(claims.adminUpdate(c.id, { status: 'forwarded', compensation: 5000 }), (e) => e.status === 400);
  await claims.adminUpdate(c.id, { status: 'forwarded', partnerRef: 'KN-9' });
  const before = await wallet(u);
  const done = await claims.adminUpdate(c.id, { status: 'resolved', compensation: 40000, note: 'hãng đã bồi thường' });
  assert.equal(done.status, 'resolved');
  assert.equal(await wallet(u), before + 40000);
  await assert.rejects(claims.adminUpdate(c.id, { status: 'resolved', compensation: 40000 }), (e) => e.code === 'invalid_transition');
  assert.equal(await wallet(u), before + 40000);
  await auditOk();
});

// ---------------- Quản trị ----------------
test('quy tắc giá: kiểm tra hợp lệ, ghi nhật ký; nhật ký không sửa được', async () => {
  await assert.rejects(admin.upsertRule('admin', { carrier: 'x', route: '*', margin_pct: 8, margin_min: 300, rounding: 500 }), (e) => e.status === 400);
  await assert.rejects(admin.upsertRule('admin', { carrier: 'x', route: '*', margin_pct: 150, margin_min: 1000, rounding: 500 }), (e) => e.status === 400);
  await admin.upsertRule('admin', { carrier: 'mock-nhanh', route: '*', margin_pct: 12, margin_min: 2000, rounding: 1000 });
  const rows = await admin.listAudit();
  assert.equal(rows[0].action, 'pricing_rule.upsert');
  assert.equal(rows[0].after.margin_pct, 12);
  await assert.rejects(query("UPDATE admin_audit SET reason='x'"), /append-only/);
  const { q } = await getOffer(await newUser(), 'mock-nhanh');
  assert.ok(q.offers.find((o) => o.carrier === 'mock-nhanh').sellPrice % 1000 === 0);
  await query("DELETE FROM pricing_rules WHERE carrier='mock-nhanh'");
});

test('cộng ví tay: cần lý do và khóa, idempotent, có nhật ký', async () => {
  const u = await newUser();
  await assert.rejects(admin.manualCredit('admin', u, 50000, '', key()), (e) => e.status === 400);
  await assert.rejects(admin.manualCredit('admin', u, 50000, 'nạp tay', 'ngan'), (e) => e.status === 400);
  await assert.rejects(admin.manualCredit('admin', 9999999, 50000, 'nạp tay', key()), (e) => e.status === 404);
  const k = key();
  await admin.manualCredit('admin', u, 50000, 'khách chuyển khoản ngoài hệ thống', k);
  const again = await admin.manualCredit('admin', u, 50000, 'khách chuyển khoản ngoài hệ thống', k);
  assert.equal(again.replay, true);
  assert.equal(await wallet(u), 50000);
  await auditOk();
});

test('bảng giá niêm yết cần nguồn và người phụ trách', async () => {
  await assert.rejects(admin.upsertListPrice('admin', { carrier: 'c', service: 's', max_weight_g: 500, price: 20000 }), (e) => e.status === 400);
  await admin.upsertListPrice('admin', { carrier: 'c', service: 's', max_weight_g: 500, price: 20000, source: 'bảng giá công bố 10/2026', owner: 'ke-toan' });
  assert.equal((await admin.listListPrices()).length >= 1, true);
  await query("DELETE FROM list_prices WHERE carrier='c'");
});

test('ký quỹ xuống dưới ngưỡng thì ẩn mọi offer; nạp ký quỹ idempotent', async () => {
  await admin.setSetting('admin', 'deposit_min', 1_000_000);
  const req = validateQuoteRequest({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500 });
  const low = await quoteAll(req);
  assert.equal(low.offers.length, 0);
  assert.ok(low.skipped.every((s) => s.reason === 'deposit_low'));
  await admin.recordAggregatorDeposit('admin', 5_000_000, 'DEP-' + Date.now(), 'nạp ký quỹ');
  const ref = 'DEP-X-' + Date.now();
  await admin.recordAggregatorDeposit('admin', 100, ref);
  const again = await admin.recordAggregatorDeposit('admin', 100, ref);
  assert.equal(again.replay, true);
  const ok = await quoteAll(req);
  assert.ok(ok.offers.length > 0);
  await admin.setSetting('admin', 'deposit_min', 0);
  await auditOk();
});

test('offer bị ẩn do thiếu trần/biên thì ghi cảnh báo cho quản trị', async () => {
  await query("UPDATE pricing_rules SET margin_min = 500000, rounding = 500 WHERE carrier='*'");
  const req = validateQuoteRequest({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500 });
  const q = await quoteAll(req);
  assert.equal(q.offers.length, 0);
  const ov = await admin.overview();
  assert.ok(ov.alerts.length > 0);
  assert.ok(ov.alerts[0].reason === 'margin_below_min' || ov.alerts[0].reason === 'negative_margin');
  await query("UPDATE pricing_rules SET margin_min = 1000 WHERE carrier='*'");
});

test('API quản trị cần phiên admin; có MFA mới vào được', async () => {
  let r = await fetch(base + '/v1/admin/overview');
  assert.equal(r.status, 401);
  r = await fetch(base + '/v1/admin/login', { method: 'POST', headers: H, body: JSON.stringify({ token: 'adm-tok', otp: auth.totp(config.adminTotpSecret) }) });
  assert.equal(r.status, 200);
  const cookie = (r.headers.getSetCookie()[0] || '').split(';')[0];
  r = await fetch(base + '/v1/admin/overview', { headers: { cookie } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok('balances' in j && 'queues' in j && Array.isArray(j.carriers));
  // người dùng thường không vào được admin
  const ucookie = await loginCookie(await newUser());
  r = await fetch(base + '/v1/admin/overview', { headers: { cookie: ucookie } });
  assert.equal(r.status, 401);
});
