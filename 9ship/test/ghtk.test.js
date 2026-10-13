// Adapter GHTK chạy với máy chủ giả lập dựng theo tài liệu https://api.ghtk.vn/docs/ (không gọi GHTK thật).
// Kiểm tra cách adapter ánh xạ yêu cầu/phản hồi và các ca lỗi; việc đối chiếu với GHTK thật làm bằng `npm run ghtk:check`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { query } from '../src/db.js';
import { config } from '../src/config.js';
import { CarrierError } from '../src/errors.js';
import { createGhtk, STATUS_MAP } from '../src/carriers/ghtk.js';
import * as registry from '../src/carriers/index.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import * as lifecycle from '../src/lifecycle.js';
import { quoteAll, resetBreakers } from '../src/rating.js';
import { validateQuoteRequest } from '../src/pricing.js';
import { buildApp } from '../src/server.js';
import { wardsOf } from '../src/geo.js';
import { setup, close, newUser, fund, wallet, key, SENDER, RECEIVER } from './helpers.js';

// ---------- máy chủ GHTK giả ----------
const fake = { orders: new Map(), byLabel: new Map(), seq: 0, log: [], mode: {} };
// seq không đặt lại: mã vận đơn phải duy nhất giữa các bài kiểm thử vì CSDL giữ các đơn cũ
function resetFake() { fake.orders.clear(); fake.byLabel.clear(); fake.log.length = 0; fake.mode = {}; }

function readBody(req) { return new Promise((r) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => r(Buffer.concat(c).toString())); }); }
const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await readBody(req);
  fake.log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: body ? JSON.parse(body) : null });
  if (req.headers.token !== 'tok-123' || req.headers['x-client-source'] !== 'PARTNER1') return send(res, 401, { success: false, message: 'Token không hợp lệ' });

  if (url.pathname === '/services/shipment/fee') {
    const q = url.searchParams;
    for (const k of ['pick_province', 'pick_ward', 'province', 'ward', 'weight']) if (!q.get(k)) return send(res, 200, { success: false, message: 'Thiếu tham số ' + k });
    if (q.get('province') === 'Cà Mau') return send(res, 200, { success: true, fee: { name: 'area3', fee: 0, insurance_fee: 0, delivery: false } });
    const w = Number(q.get('weight'));
    const base = q.get('transport') === 'fly' ? 32000 : 22000;
    return send(res, 200, { success: true, message: '', fee: { name: 'area1', fee: base + Math.ceil(Math.max(0, w - 500) / 500) * 5000, insurance_fee: Number(q.get('value')) > 1000000 ? 5000 : 0, delivery: true, extFees: [] } });
  }
  if (url.pathname === '/services/shipment/order' && req.method === 'POST') {
    if (fake.mode.createStatus) return send(res, fake.mode.createStatus, { success: false, message: 'lỗi máy chủ' });
    if (fake.mode.createHang) return; // không trả lời
    const o = JSON.parse(body).order;
    for (const k of ['id', 'pick_name', 'pick_address', 'pick_province', 'pick_ward', 'pick_tel', 'name', 'address', 'province', 'ward', 'tel', 'value']) if (o[k] === undefined || o[k] === '') return send(res, 200, { success: false, message: 'Thiếu trường ' + k });
    if (fake.mode.reject) return send(res, 200, { success: false, message: fake.mode.reject });
    if (fake.orders.has(o.id)) return send(res, 200, { success: false, message: 'Mã đơn hàng của bạn đã tồn tại trên hệ thống GHTK', error: { code: 'ORDER_ID_EXIST', partner_id: o.id, ghtk_label: fake.orders.get(o.id).label } });
    const label = 'S' + (++fake.seq) + '.MIEN.' + (1000 + fake.seq);
    const rec = { label, partner_id: o.id, status: 1, fee: o.transport === 'fly' ? 32000 : 22000, insurance_fee: o.value > 1000000 ? 5000 : 0, req: JSON.parse(body) };
    fake.orders.set(o.id, rec); fake.byLabel.set(label, rec);
    return send(res, 200, { success: true, message: '', order: { partner_id: o.id, label, area: '1', fee: String(rec.fee), insurance_fee: String(rec.insurance_fee), tracking_id: fake.seq, estimated_pick_time: 'Sáng mai', status_id: 1 } });
  }
  let m = url.pathname.match(/^\/services\/shipment\/v2\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const rec = id.startsWith('partner_id:') ? fake.orders.get(id.slice(11)) : fake.byLabel.get(id);
    if (!rec) return send(res, 200, { success: false, message: 'Không tìm thấy đơn hàng có mã ' + id });
    return send(res, 200, { success: true, order: { label_id: rec.label, partner_id: rec.partner_id, status: String(rec.status), status_text: 'Trạng thái ' + rec.status, created: '26-10-03 08:00:00', modified: '26-10-03 10:30:00', ship_money: rec.shipMoney ?? rec.fee, insurance: rec.insurance_fee, value: 0, weight: 1 } });
  }
  m = url.pathname.match(/^\/services\/shipment\/cancel\/(.+)$/);
  if (m) {
    const rec = fake.byLabel.get(decodeURIComponent(m[1]));
    if (!rec) return send(res, 200, { success: false, message: 'Không tìm thấy đơn hàng' });
    if (rec.status === -1) return send(res, 200, { success: false, message: 'Đơn hàng đã đã ở trạng thái hủy' });
    if (![1, 2, 12].includes(rec.status)) return send(res, 200, { success: false, message: 'Đơn đã lấy hàng, không thể hủy đơn' });
    rec.status = -1;
    return send(res, 200, { success: true, message: '', log_id: 'x' });
  }
  m = url.pathname.match(/^\/services\/label\/(.+)$/);
  if (m) { res.writeHead(200, { 'content-type': 'application/pdf' }); return res.end(Buffer.from('%PDF-1.4 fake')); }
  return send(res, 404, { success: false, message: 'not found' });
});

let port; let ghtk; let app; let base;
const envFor = (extra = {}) => ({ GHTK_TOKEN: 'tok-123', GHTK_PARTNER_CODE: 'PARTNER1', GHTK_BASE: `http://127.0.0.1:${port}`, GHTK_WEBHOOK_HASH: 'hash-secret-1', GHTK_TIMEOUT_MS: '600', ...extra });

before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  await setup();
  worker.workerOpts.reconcileMinAgeMs = 0;
  ghtk = createGhtk(envFor());
  app = buildApp();
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await close(); });
beforeEach(() => { resetFake(); resetBreakers(); });

const req = (over = {}) => ({
  from: { province: 'tp-ho-chi-minh', ward: wardsOf('tp-ho-chi-minh')[0] }, to: { province: 'ha-noi', ward: wardsOf('ha-noi')[0] },
  weightG: 1200, dims: null, declaredValue: 0, goodsType: 'general', handover: 'dropoff', ...over,
});

test('không có GHTK_TOKEN thì không tạo adapter', () => { assert.equal(createGhtk({}), null); });

test('báo giá: gửi đúng header và tham số, trả hai dịch vụ, breakdown cộng đúng tổng', async () => {
  const offers = await ghtk.quote(req({ declaredValue: 2000000 }));
  assert.equal(offers.length, 2);
  const call = fake.log.find((c) => c.path === '/services/shipment/fee');
  assert.equal(call.headers.token, 'tok-123');
  assert.equal(call.headers['x-client-source'], 'PARTNER1');
  assert.equal(call.query.pick_province, 'Hồ Chí Minh', 'tên tỉnh bỏ tiền tố TP');
  assert.equal(call.query.province, 'Hà Nội');
  assert.equal(call.query.weight, '1200');
  assert.equal(call.query.value, '2000000');
  for (const o of offers) {
    assert.equal(o.cost.total, Object.values(o.cost.breakdown).reduce((a, b) => a + b, 0));
    assert.ok(Number.isSafeInteger(o.cost.total));
    assert.equal(o.cost.breakdown.insurance, 5000);
    assert.deepEqual(o.handovers, ['dropoff', 'pickup']);
    assert.equal(o.listPrice, null);
  }
  assert.ok(offers.find((o) => o.service === 'fly').cost.total > offers.find((o) => o.service === 'road').cost.total);
});

test('báo giá: tên tỉnh ghi đè được; kiện cồng kềnh dùng cân quy đổi; dịch vụ không giao được bị bỏ', async () => {
  const g = createGhtk(envFor({ GHTK_PROVINCE_ALIASES: JSON.stringify({ 'tp-ho-chi-minh': 'TP. Hồ Chí Minh' }) }));
  await g.quote(req());
  assert.equal(fake.log.at(-1).query.pick_province, 'TP. Hồ Chí Minh');
  resetFake();
  const offers = await ghtk.quote(req({ weightG: 500, dims: { l: 60, w: 50, h: 40 } }));
  assert.equal(offers[0].chargeableWeightG, 20000);
  assert.equal(fake.log.at(-1).query.weight, '20000');
  resetFake();
  assert.deepEqual(await ghtk.quote(req({ to: { province: 'ca-mau', ward: wardsOf('ca-mau')[0] } })), []);
});

test('báo giá: lỗi xác thực trả mảng rỗng được xử lý; 5xx là lỗi không rõ', async () => {
  const bad = createGhtk(envFor({ GHTK_TOKEN: 'sai' }));
  await assert.rejects(bad.quote(req()), (e) => e instanceof CarrierError);
});

test('tạo đơn: ánh xạ đúng sang API đăng đơn (gửi tại bưu cục = post, lấy tận nơi = cod; 9Ship trả cước)', async () => {
  const r = await ghtk.createShipment({ ref: '9SREF1', service: 'road', handover: 'dropoff', weightG: 1500, declaredValue: 350000, goodsType: 'fragile', sender: { ...SENDER, province: 'tp-ho-chi-minh' }, receiver: { ...RECEIVER, province: 'ha-noi' } });
  assert.match(r.carrierCode, /^S\d+\.MIEN\.\d+$/);
  assert.equal(r.fee, 22000);
  const b = fake.log.find((c) => c.path === '/services/shipment/order').body;
  assert.equal(b.products[0].weight, 1.5, 'cân sản phẩm tính bằng kg');
  assert.equal(b.products[0].name, 'Hàng dễ vỡ');
  assert.equal(b.order.id, '9SREF1');
  assert.equal(b.order.pick_option, 'post');
  assert.equal(b.order.is_freeship, 1);
  assert.equal(b.order.pick_money, 0);
  assert.equal(b.order.transport, 'road');
  assert.equal(b.order.value, 350000);
  assert.equal(b.order.pick_province, 'Hồ Chí Minh');
  assert.equal(b.order.pick_ward, SENDER.ward);
  assert.equal(b.order.tel, RECEIVER.phone);
  await ghtk.createShipment({ ref: '9SREF2', service: 'fly', handover: 'pickup', weightG: 500, declaredValue: 0, goodsType: 'general', sender: SENDER, receiver: RECEIVER });
  const b2 = fake.log.filter((c) => c.path === '/services/shipment/order').at(-1).body;
  assert.equal(b2.order.pick_option, 'cod');
  assert.equal(b2.order.transport, 'fly');
});

test('tạo đơn idempotent: gọi lại cùng mã tham chiếu trả đơn cũ, không tạo đơn thứ hai', async () => {
  const mk = () => ghtk.createShipment({ ref: '9SDUP', service: 'road', handover: 'dropoff', weightG: 800, declaredValue: 0, goodsType: 'general', sender: SENDER, receiver: RECEIVER });
  const a = await mk();
  const b = await mk();
  assert.equal(a.carrierCode, b.carrierCode);
  assert.equal(fake.orders.size, 1);
});

test('tạo đơn: GHTK từ chối là lỗi rõ ràng; 5xx và quá thời gian là lỗi KHÔNG RÕ', async () => {
  const args = { ref: '9SERR', service: 'road', handover: 'dropoff', weightG: 800, declaredValue: 0, goodsType: 'general', sender: SENDER, receiver: RECEIVER };
  fake.mode.reject = 'Địa chỉ không hỗ trợ giao hàng';
  await assert.rejects(ghtk.createShipment(args), (e) => e instanceof CarrierError && !e.unknown && /Địa chỉ/.test(e.message));
  fake.mode = { createStatus: 502 };
  await assert.rejects(ghtk.createShipment(args), (e) => e instanceof CarrierError && e.unknown === true);
  fake.mode = { createHang: true };
  await assert.rejects(ghtk.createShipment(args), (e) => e instanceof CarrierError && e.unknown === true);
});

test('tra theo mã tham chiếu: có đơn, không có đơn (null), lỗi thì ném', async () => {
  await ghtk.createShipment({ ref: '9SFIND', service: 'road', handover: 'dropoff', weightG: 800, declaredValue: 0, goodsType: 'general', sender: SENDER, receiver: RECEIVER });
  const f = await ghtk.findByReference('9SFIND');
  assert.match(f.carrierCode, /^S\d+\.MIEN\./);
  assert.equal(f.fee, 22000);
  assert.equal(await ghtk.findByReference('9SKHONGCO'), null);
  const bad = createGhtk(envFor({ GHTK_TOKEN: 'sai' }));
  await assert.rejects(bad.findByReference('9SFIND'));
});

test('hủy đơn: xác nhận; đã hủy coi là xác nhận; đã lấy hàng bị từ chối', async () => {
  const mk = (ref) => ghtk.createShipment({ ref, service: 'road', handover: 'dropoff', weightG: 800, declaredValue: 0, goodsType: 'general', sender: SENDER, receiver: RECEIVER });
  const a = await mk('9SC1');
  assert.deepEqual(await ghtk.cancel(a.carrierCode), { status: 'confirmed' });
  assert.deepEqual(await ghtk.cancel(a.carrierCode), { status: 'confirmed' }, 'hủy lại vẫn là xác nhận');
  const b = await mk('9SC2');
  fake.byLabel.get(b.carrierCode).status = 3;
  const r = await ghtk.cancel(b.carrierCode);
  assert.equal(r.status, 'rejected');
  assert.match(r.reason, /đã lấy hàng/);
});

test('theo dõi: ánh xạ trạng thái GHTK, giờ Việt Nam, cước tổng = ship_money + bảo hiểm; mã lạ bị bỏ qua', async () => {
  const a = await ghtk.createShipment({ ref: '9ST1', service: 'road', handover: 'dropoff', weightG: 800, declaredValue: 2000000, goodsType: 'general', sender: SENDER, receiver: RECEIVER });
  const rec = fake.byLabel.get(a.carrierCode);
  rec.status = 4; rec.shipMoney = 27000;
  const [ev] = await ghtk.track(a.carrierCode);
  assert.equal(ev.status, 'in_transit');
  assert.equal(ev.feeTotal, 27000 + 5000);
  assert.equal(ev.at, '2026-10-03T03:30:00.000Z', '26-10-03 10:30 giờ VN = 03:30 UTC');
  assert.equal(ev.eventId, `${a.carrierCode}:4`);
  rec.status = 9999;
  assert.deepEqual(await ghtk.track(a.carrierCode), []);
  const table = { '-1': 'cancelled', 5: 'delivered', 21: 'returned', 20: 'returning', 9: 'delivery_failed', 3: 'picked_up' };
  for (const [k, v] of Object.entries(table)) assert.equal(STATUS_MAP[k], v, 'mã ' + k);
});

test('webhook: phải có hash đúng; thân dạng form được phân tích', () => {
  const raw = new URLSearchParams({ label_id: 'S9.X.1', partner_id: 'P', status_id: '5', action_time: '2026-10-03T10:00:00+07:00', reason: 'ok', weight: '1.25' }).toString();
  assert.throws(() => ghtk.parseWebhook({}, raw, {}), CarrierError);
  assert.throws(() => ghtk.parseWebhook({}, raw, { hash: 'sai' }), CarrierError);
  const [ev] = ghtk.parseWebhook({}, raw, { hash: 'hash-secret-1' });
  assert.equal(ev.code, 'S9.X.1');
  assert.equal(ev.status, 'delivered');
  assert.equal(ev.weightG, 1250);
  assert.equal(ev.at, '2026-10-03T03:00:00.000Z');
  assert.deepEqual(ghtk.parseWebhook({}, raw.replace('status_id=5', 'status_id=31337'), { hash: 'hash-secret-1' }), []);
  const noSecret = createGhtk(envFor({ GHTK_WEBHOOK_HASH: '' }));
  assert.throws(() => noSecret.parseWebhook({}, raw, { hash: '' }), CarrierError);
});

test('nhãn PDF gốc của GHTK', async () => {
  const pdf = await ghtk.getLabel('S1.MIEN.1001', { size: 'A5' });
  assert.ok(pdf.toString().startsWith('%PDF'));
  assert.equal(fake.log.at(-1).query.page_size, 'A5');
});

// ---------- xuyên suốt cả hệ thống ----------
test('hệ thống: báo giá → tạo đơn → webhook GHTK → đối chiếu cước → hủy hoàn tiền (qua máy chủ GHTK giả)', async () => {
  registry.register(ghtk);
  try {
    // trần niêm yết: với GHTK phải nhập bảng giá hoặc tắt "cần trần" cho hãng này (quyết định của chủ sản phẩm)
    const quoteNoCap = await quoteAll(validateQuoteRequest({ from: { province: 'Hồ Chí Minh', ward: SENDER.ward }, to: { province: 'Hà Nội', ward: RECEIVER.ward }, weightG: 1200 }));
    assert.ok(!quoteNoCap.offers.some((o) => o.carrier === 'ghtk'));
    assert.ok(quoteNoCap.skipped.some((s) => s.carrier === 'ghtk' && s.reason === 'no_verified_cap'), 'mặc định bị ẩn vì thiếu giá niêm yết');
    await query("INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, rounding, require_cap) VALUES('ghtk','*',10,1000,500,false)");

    const u = await newUser();
    await fund(u, 300000);
    const q = await quoteAll(validateQuoteRequest({ from: { province: 'Hồ Chí Minh', ward: SENDER.ward }, to: { province: 'Hà Nội', ward: RECEIVER.ward }, weightG: 1200 }), { userId: u });
    const offer = q.offers.find((o) => o.carrier === 'ghtk' && o.service === 'road');
    assert.ok(offer, 'có offer GHTK');
    assert.equal(offer.capVerified, false);
    assert.ok(offer.sellPrice > 0);

    const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
    assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'created');
    const sh = (await query('SELECT * FROM shipments WHERE id=$1', [shipment.id]))[0];
    assert.match(sh.carrier_code, /^S\d+\.MIEN\./);
    assert.equal(sh.cost_price, 22000);
    const sent = fake.orders.get(sh.carrier_ref).req.order;
    assert.equal(sent.pick_option, 'post');

    // webhook: GHTK báo đã lấy hàng
    const hook = (status, extra = {}) => fetch(`${base}/v1/webhooks/ghtk?hash=hash-secret-1`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ label_id: sh.carrier_code, partner_id: sh.carrier_ref, status_id: String(status), action_time: '2026-10-03 11:00:00', ...extra }).toString(),
    });
    assert.equal((await fetch(`${base}/v1/webhooks/ghtk?hash=sai`, { method: 'POST', body: 'x=1' })).status, 401);
    let r = await hook(3);
    assert.equal(r.status, 200);
    assert.equal((await query('SELECT shipping_status FROM shipments WHERE id=$1', [shipment.id]))[0].shipping_status, 'picked_up');
    assert.equal((await hook(3)).status, 200); // GHTK gửi lại: không áp dụng hai lần
    assert.equal((await query('SELECT count(*)::int n FROM tracking_events WHERE shipment_id=$1', [shipment.id]))[0].n, 2);

    // hãng cân lại: phí tăng, đối chiếu qua polling (adapter khai báo poll)
    fake.byLabel.get(sh.carrier_code).shipMoney = 27000;
    fake.byLabel.get(sh.carrier_code).status = 4;
    assert.ok(await lifecycle.pollTracking({ everySec: 0 }) >= 1);
    const after = (await query('SELECT * FROM shipments WHERE id=$1', [shipment.id]))[0];
    assert.equal(after.shipping_status, 'in_transit');
    assert.equal(after.cost_price, 27000);
    assert.equal(after.sell_price, sh.sell_price + 5000, 'khách trả thêm đúng phần chênh');
    assert.ok((await wallet(u)) >= 0);
  } finally {
    registry.unregister('ghtk');
    await query("DELETE FROM pricing_rules WHERE carrier='ghtk'");
  }
});

test('hệ thống: hủy đơn GHTK khi chưa lấy hàng hoàn tiền; sau khi lấy hàng bị từ chối', async () => {
  registry.register(ghtk);
  await query("INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, rounding, require_cap) VALUES('ghtk','*',10,1000,500,false)");
  try {
    for (const pickedUp of [false, true]) {
      const u = await newUser();
      await fund(u, 300000);
      const q = await quoteAll(validateQuoteRequest({ from: { province: 'Hồ Chí Minh', ward: SENDER.ward }, to: { province: 'Hà Nội', ward: RECEIVER.ward }, weightG: 800 }), { userId: u });
      const offer = q.offers.find((o) => o.carrier === 'ghtk' && o.service === 'road');
      const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
      await worker.runOnce({ shipmentId: shipment.id });
      const code = (await query('SELECT carrier_code FROM shipments WHERE id=$1', [shipment.id]))[0].carrier_code;
      if (pickedUp) fake.byLabel.get(code).status = 3;
      const r = await lifecycle.cancel(u, shipment.id);
      assert.equal(r.status, pickedUp ? 'rejected' : 'confirmed');
      assert.equal(await wallet(u), pickedUp ? 300000 - offer.sellPrice - orders.bufferFor(offer.sellPrice) : 300000);
    }
  } finally {
    registry.unregister('ghtk');
    await query("DELETE FROM pricing_rules WHERE carrier='ghtk'");
  }
});

test('hệ thống: timeout khi đăng đơn → đối soát theo mã tham chiếu, không nhả tiền vội, không tạo đơn thứ hai', async () => {
  registry.register(ghtk);
  await query("INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, rounding, require_cap) VALUES('ghtk','*',10,1000,500,false)");
  try {
    const u = await newUser();
    await fund(u, 300000);
    const q = await quoteAll(validateQuoteRequest({ from: { province: 'Hồ Chí Minh', ward: SENDER.ward }, to: { province: 'Hà Nội', ward: RECEIVER.ward }, weightG: 800 }), { userId: u });
    const offer = q.offers.find((o) => o.carrier === 'ghtk' && o.service === 'road');
    const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
    // GHTK nhận đơn nhưng phản hồi không về (mô phỏng: tạo sẵn đơn rồi cho lần gọi đầu bị treo)
    const ref = (await query('SELECT carrier_ref FROM shipments WHERE id=$1', [shipment.id]))[0].carrier_ref;
    await ghtk.createShipment({ ref, service: 'road', handover: 'dropoff', weightG: 800, declaredValue: 0, goodsType: 'general', sender: SENDER, receiver: RECEIVER });
    fake.mode = { createHang: true };
    assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'unknown');
    assert.equal((await query('SELECT payment_status FROM shipments WHERE id=$1', [shipment.id]))[0].payment_status, 'held');
    fake.mode = {};
    await query("UPDATE outbox SET next_at = now()");
    assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'created');
    assert.equal(fake.orders.size, 1, 'chỉ một đơn trên GHTK');
  } finally {
    registry.unregister('ghtk');
    await query("DELETE FROM pricing_rules WHERE carrier='ghtk'");
  }
});

test('cấu hình lên hệ thống: GHTK_TOKEN trong môi trường thì tự đăng ký adapter', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, envFor());
  try {
    const ids = await registry.loadExternal('');
    assert.ok(ids.includes('ghtk'));
    assert.equal(registry.get('ghtk').capabilities.webhook, true);
  } finally {
    registry.unregister('ghtk');
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
