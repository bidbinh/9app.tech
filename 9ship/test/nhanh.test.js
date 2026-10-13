// Adapter Nhanh.vn kiểm thử với máy chủ giả (không gọi Nhanh.vn thật).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createNhanh, parseNhanhWebhook, nhanhLocation, adapterIdOf } from '../src/carriers/nhanh.js';
import { CarrierError } from '../src/errors.js';
import { wardsOf } from '../src/geo.js';

const log = []; let fake; let base; let orders; let depotLoc; let failNext;
const state = () => { orders = []; depotLoc = { cityId: 255, wardId: 10269 }; failNext = null; log.length = 0; };

before(async () => {
  state();
  fake = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const path = new URL(req.url, 'http://x').pathname.replace('/v3.0/', '');
      log.push({ path, body, auth: req.headers.authorization });
      const send = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'tok') return send({ code: 0, errorCode: 'ERR_INVALID_ACCESS_TOKEN', messages: 'x' });
      if (failNext && (!failNext.path || failNext.path === path)) { const f = failNext; failNext = null; return f(send); }
      if (path === 'business/depot') return send({ code: 1, data: [{ id: 77, name: 'Kho 9app', mobile: '0966', locationV2: depotLoc }] });
      if (path === 'shipping/fee') {
        return send({ code: 1, data: [
          { carrier: { id: 29 }, service: { id: 186, name: 'Tiêu chuẩn', description: '3-4 ngày' }, shipFee: 14000, codFee: 0, declaredFee: 0 },
          { carrier: { id: 5 }, service: { id: 31, name: 'Tiêu chuẩn', description: '2 ngày' }, shipFee: 19000, codFee: 0, declaredFee: 1000 },
          { carrier: { id: 5 }, service: { id: 99, name: 'Lỗi giá', description: '1 ngày' }, shipFee: 0 },
          { carrier: { id: 999 }, service: { id: 1, name: 'Lạ' }, shipFee: 5000 }] });
      }
      if (path === 'order/add') {
        const o = { info: { id: 5000 + orders.length, status: 56, updatedAt: 1760000000 }, channel: body.channel, carrier: { id: body.carrier.id, shipFee: 14000, carrierCode: body.carrier.autoSend ? 'SPXVN123' : '' } };
        orders.push(o);
        return send({ code: 1, data: { id: o.info.id, carrierCode: o.carrier.carrierCode, trackingUrl: 'https://t/x', ...(o.carrier.carrierCode ? {} : { sendCarrierError: ['hãng từ chối'] }) } });
      }
      if (path === 'order/list') {
        const f = body.filters || {};
        let rows = orders;
        if (f.ids) rows = rows.filter((o) => f.ids.includes(o.info.id));
        return send({ code: 1, data: rows });
      }
      if (path === 'order/cancelcarrier') return typeof body.orderId === 'number' ? send({ code: 1, data: {} }) : send({ code: 0, errorCode: 'ERR_DATA_404', messages: 'Đơn hàng không tồn tại' });
      return send({ code: 0, errorCode: 'ERR_404', messages: 'khong co' });
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + fake.address().port;
});
after(() => fake.close());

const mk = (extra = {}) => createNhanh({ NHANH_APP_ID: '1', NHANH_BUSINESS_ID: '2', NHANH_ACCESS_TOKEN: 'tok', NHANH_BASE: base, NHANH_PRODUCT_ID: '123', NHANH_CARRIER_IDS: '29,5', ...extra });
const REQ = { from: { province: 'tp-ho-chi-minh', ward: wardsOf('tp-ho-chi-minh')[0] }, to: { province: 'ha-noi', ward: wardsOf('ha-noi')[0] }, weightG: 1000, dims: null, declaredValue: 0, goodsType: 'general', handover: 'dropoff' };
const CREATE = { ref: 'REF-1', expectedFee: 14000, service: '186', weightG: 1000, declaredValue: 0, goodsType: 'general', handover: 'dropoff', sender: { contact: 'A', phone: '0901234567' }, receiver: { contact: 'B', phone: '0987654321', street: '34 Hai Bà Trưng', province: 'ha-noi', ward: wardsOf('ha-noi')[0] }, request: {} };

test('không có khóa thì không tạo adapter; có khóa thì mỗi hãng một adapter', () => {
  assert.deepEqual(createNhanh({}), []);
  assert.deepEqual(mk().map((a) => a.id), ['nhanh-spx', 'nhanh-ghn']);
  assert.equal(adapterIdOf(29), 'nhanh-spx');
});

test('bảng địa danh: mọi phường 9Ship đều đổi được sang mã Nhanh.vn', () => {
  for (const code of ['ha-noi', 'tp-ho-chi-minh', 'ca-mau']) for (const w of wardsOf(code)) assert.ok(nhanhLocation(code, w), code + ' ' + w);
  assert.equal(nhanhLocation('khong-co', 'x'), null);
});

test('quote: lọc đúng hãng, bỏ dịch vụ giá 0, tổng = cước + phí khai giá, một lần gọi cho mọi hãng', async () => {
  state();
  const [spx, ghn] = mk();
  const [a, b] = await Promise.all([spx.quote(REQ), ghn.quote(REQ)]);
  assert.equal(a.length, 1); assert.equal(a[0].cost.total, 14000); assert.equal(a[0].service, '186');
  assert.deepEqual(a[0].etaDays, [3, 4]); assert.deepEqual(a[0].handovers, ['dropoff']);
  assert.equal(b.length, 1); assert.equal(b[0].cost.total, 20000); assert.equal(b[0].cost.breakdown.insurance, 1000);
  assert.equal(log.filter((l) => l.path === 'shipping/fee').length, 1, 'dùng chung một lần gọi cước');
  const sum = (o) => Object.values(o.cost.breakdown).reduce((x, y) => x + y, 0);
  assert.equal(sum(a[0]), a[0].cost.total); assert.equal(sum(b[0]), b[0].cost.total);
  const f = log.find((l) => l.path === 'shipping/fee').body.filters;
  assert.equal(f.type, 1); assert.equal(f.shippingFrom.wardId, 10269); assert.equal(f.shippingFrom.locationVersion, 'v2');
});

test('quote: kho chưa có địa chỉ thì báo lỗi rõ; địa chỉ lạ thì không có offer', async () => {
  state(); depotLoc = { cityId: 0, wardId: 0 };
  const [spx] = mk();
  await assert.rejects(spx.quote(REQ), (e) => e instanceof CarrierError && /chưa có địa chỉ/.test(e.message));
  const [spx2] = mk({ NHANH_DEPOT_ID: '77' });
  depotLoc = { cityId: 255, wardId: 10269 };
  assert.deepEqual(await spx2.quote({ ...REQ, to: { province: 'ha-noi', ward: 'Phường Không Có' } }), []);
});

test('sai mã truy cập: lỗi cấu hình rõ ràng, không phải "không có dịch vụ"', async () => {
  state();
  const [spx] = createNhanh({ NHANH_APP_ID: '1', NHANH_BUSINESS_ID: '2', NHANH_ACCESS_TOKEN: 'sai', NHANH_BASE: base });
  await assert.rejects(spx.quote(REQ), (e) => e instanceof CarrierError && !e.unknown && /từ chối xác thực/.test(e.message));
});

test('createShipment: gửi đúng nội dung, không thu hộ, trả mã đơn Nhanh và mã vận đơn hãng', async () => {
  state();
  const [spx] = mk();
  const r = await spx.createShipment(CREATE);
  assert.equal(r.trackingCode, 'SPXVN123'); assert.equal(r.carrierCode, '5000'); assert.equal(r.fee, 14000);
  const b = log.find((l) => l.path === 'order/add').body;
  assert.equal(b.channel.appOrderId, 'REF-1'); assert.equal(b.carrier.autoSend, 1); assert.equal(b.carrier.sendCarrierType, 1);
  assert.equal(b.carrier.id, 29); assert.equal(b.carrier.serviceId, 186); assert.equal(b.carrier.customerShipFee, 0);
  assert.equal(b.products[0].price, 0, 'đơn 0 đồng nên không phát sinh thu hộ');
  assert.equal(b.info.depotId, 77); assert.match(b.info.description, /0901234567/);
  assert.equal(b.shippingAddress.locationVersion, 'v2');
});

test('createShipment: thiếu sản phẩm mẫu là lỗi rõ (nhả tiền); đơn có trong Nhanh.vn mà chưa có mã vận đơn là "không rõ" (giữ tiền)', async () => {
  state();
  const [noProd] = mk({ NHANH_PRODUCT_ID: '' });
  await assert.rejects(noProd.createShipment(CREATE), (e) => e instanceof CarrierError && !e.unknown && /NHANH_PRODUCT_ID/.test(e.message));
  const [spx] = mk();
  failNext = Object.assign((send) => send({ code: 1, data: { id: 9001, sendCarrierError: ['hãng từ chối'] } }), { path: 'order/add' });
  await assert.rejects(spx.createShipment(CREATE), (e) => e instanceof CarrierError && e.unknown === true && /chưa có mã vận đơn/.test(e.message), 'chưa có mã vận đơn: không được nhả tiền');
});

test('createShipment: Nhanh.vn lỗi 5xx là "không rõ" (không tự nhả tiền)', async () => {
  state();
  const [spx] = mk();
  failNext = Object.assign((send) => send({ code: 0 }, 502), { path: 'order/add' });
  await assert.rejects(spx.createShipment(CREATE), (e) => e instanceof CarrierError && e.unknown);
});

test('findByReference: thấy thì trả mã; quét xong không thấy thì null; đơn chưa gửi hãng thì "không rõ"', async () => {
  state();
  const [spx] = mk();
  assert.equal(await spx.findByReference('REF-NONE'), null);
  await spx.createShipment({ ...CREATE, ref: 'REF-2' });
  const f = await spx.findByReference('REF-2');
  assert.equal(f.trackingCode, 'SPXVN123');
  orders.push({ info: { id: 7777, status: 56 }, channel: { appOrderId: 'REF-3' }, carrier: { id: 29 } });
  await assert.rejects(spx.findByReference('REF-3'), (e) => e.unknown === true);
});

test('cancel: ánh xạ mã lỗi của Nhanh.vn', async () => {
  state();
  const [spx] = mk();
  assert.deepEqual(await spx.cancel('5000'), { status: 'confirmed' });
  failNext = (send) => send({ code: 0, errorCode: 'ERR_ORDER_CARRIER_NOT_YET_SENT', messages: 'x' });
  assert.deepEqual(await spx.cancel('5000'), { status: 'confirmed' });
  failNext = (send) => send({ code: 0, errorCode: 'ERR_ORDER_CARRIER_NO_API_CANCEL', messages: 'x' });
  assert.equal((await spx.cancel('5000')).status, 'rejected');
  failNext = (send) => send({ code: 0, errorCode: 'ERR_ORDER_CARRIER_REJECT', messages: 'hãng không cho hủy' });
  const r = await spx.cancel('5000'); assert.equal(r.status, 'rejected'); assert.match(r.reason, /không cho hủy/);
  failNext = (send) => send({ code: 0, errorCode: 'ERR_LA', messages: 'x' });
  await assert.rejects(spx.cancel('5000'), (e) => e.unknown === true);
});

test('track: đổi trạng thái đơn Nhanh.vn; trạng thái lạ bị bỏ qua', async () => {
  state();
  const [spx] = mk();
  await spx.createShipment(CREATE);
  orders[0].info.status = 59;
  const ev = await spx.track('5000');
  assert.equal(ev.length, 1); assert.equal(ev[0].status, 'in_transit'); assert.equal(ev[0].eventId, '5000:59'); assert.equal(ev[0].feeTotal, 14000);
  orders[0].info.status = 999;
  assert.deepEqual(await spx.track('5000'), []);
});

test('webhook: nhận đúng hãng, bỏ sự kiện lạ và JSON hỏng', () => {
  const ok = JSON.stringify({ event: 'orderUpdate', businessId: 2, data: { info: { id: 5000, status: 60, updatedAt: 1760000100 }, carrier: { id: 29, carrierCode: 'X', shipFee: 14000 } } });
  const g = parseNhanhWebhook(ok);
  assert.equal(g.length, 1); assert.equal(g[0].adapterId, 'nhanh-spx'); assert.equal(g[0].events[0].status, 'delivered'); assert.equal(g[0].events[0].code, '5000');
  assert.deepEqual(parseNhanhWebhook(JSON.stringify({ event: 'orderDelete', data: [1] })), []);
  assert.deepEqual(parseNhanhWebhook(JSON.stringify({ event: 'orderUpdate', data: { info: { id: 1, status: 60 }, carrier: { id: 12345 } } })), []);
  assert.throws(() => parseNhanhWebhook('không phải json'), CarrierError);
});
