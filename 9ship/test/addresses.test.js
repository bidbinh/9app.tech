import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db.js';
import { config } from '../src/config.js';
import * as auth from '../src/auth.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import * as addresses from '../src/addresses.js';
import { wardsOf, canonicalWard } from '../src/geo.js';
import { buildApp } from '../src/server.js';
import { syncPickupPoints } from '../src/places.js';
import { setup, close, newUser, fund, getOffer, key, loginCookie, SENDER, RECEIVER } from './helpers.js';

let app; let base;
before(async () => {
  await setup();
  await syncPickupPoints();
  config.routeLimitFactor = 1000;
  config.rateLimitPerMin = 100000;
  config.adminToken = 'adm-tok';
  config.adminTotpSecret = 'JBSWY3DPEHPK3PXP';
  app = buildApp();
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });

const H = { 'content-type': 'application/json', 'x-requested-with': '9ship' };
const call = (method, p, cookie, body) => fetch(base + p, { method, headers: { ...H, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });

test('danh mục phường/xã: 34 tỉnh, mỗi tỉnh có phường; so khớp không phân biệt hoa-thường và dấu', () => {
  assert.ok(wardsOf('ha-noi').length > 50);
  assert.ok(wardsOf('tp-ho-chi-minh').length > 50);
  const w = wardsOf('ha-noi')[0];
  assert.equal(canonicalWard('ha-noi', w.toUpperCase()), w);
  assert.equal(canonicalWard('ha-noi', 'Phường Không Có Thật'), null);
  assert.equal(canonicalWard('khong-co', w), null);
  assert.equal(canonicalWard('hue', wardsOf('ha-noi')[0]), null, 'phường của tỉnh khác không hợp lệ');
});

const addr = (over = {}) => ({ contact: 'Lê Thu Hà', phone: '0905123456', street: '8 Nguyễn Huệ', ward: wardsOf('da-nang')[0], province: 'Đà Nẵng', ...over });

test('sổ địa chỉ: thêm, trùng thì gộp, sửa, đặt mặc định, xóa; không đụng dữ liệu người khác', async () => {
  const u = await newUser(); const other = await newUser();
  const c = await loginCookie(u); const c2 = await loginCookie(other);
  let r = await call('POST', '/v1/addresses', c, addr({ label: 'Nhà' }));
  assert.equal(r.status, 200);
  const a = await r.json();
  assert.equal(a.provinceName, 'Đà Nẵng');
  r = await call('POST', '/v1/addresses', c, addr({ contact: 'Lê Hà (đổi tên)', street: '8 NGUYỄN HUỆ' }));
  const again = await r.json();
  assert.equal(again.id, a.id, 'cùng người/điện thoại/địa chỉ chỉ có một bản');
  assert.equal((await (await call('GET', '/v1/addresses', c)).json()).addresses.length, 1);
  // thêm bản thứ hai và đặt mặc định
  const b = await (await call('POST', '/v1/addresses', c, addr({ phone: '0905999888', street: '99 Trần Phú', label: 'Cơ quan' }))).json();
  r = await call('POST', `/v1/addresses/${b.id}/default`, c);
  assert.equal((await r.json()).isDefaultSender, true);
  let list = (await (await call('GET', '/v1/addresses', c)).json()).addresses;
  assert.equal(list[0].id, b.id, 'mặc định đứng đầu');
  assert.equal(list.filter((x) => x.isDefaultSender).length, 1);
  // sửa
  r = await call('PATCH', `/v1/addresses/${a.id}`, c, { street: '10 Lê Duẩn', label: 'Kho' });
  assert.equal((await r.json()).street, '10 Lê Duẩn');
  // sửa sang địa chỉ trùng bản khác bị từ chối
  r = await call('PATCH', `/v1/addresses/${a.id}`, c, { phone: '0905999888', street: '99 Trần Phú' });
  assert.equal(r.status, 409);
  // người khác
  assert.equal((await call('PATCH', `/v1/addresses/${a.id}`, c2, { street: 'xxx xxx' })).status, 404);
  assert.equal((await call('POST', `/v1/addresses/${a.id}/default`, c2)).status, 404);
  await call('DELETE', `/v1/addresses/${a.id}`, c2);
  assert.equal((await (await call('GET', '/v1/addresses', c)).json()).addresses.length, 2, 'xóa của người khác không có tác dụng');
  await call('DELETE', `/v1/addresses/${a.id}`, c);
  assert.equal((await (await call('GET', '/v1/addresses', c)).json()).addresses.length, 1);
});

test('địa chỉ sai bị từ chối: thiếu phường, phường không thuộc tỉnh, điện thoại sai', async () => {
  const c = await loginCookie(await newUser());
  assert.equal((await call('POST', '/v1/addresses', c, addr({ ward: '' }))).status, 400);
  assert.equal((await call('POST', '/v1/addresses', c, addr({ ward: wardsOf('hue')[0] }))).status, 400);
  assert.equal((await call('POST', '/v1/addresses', c, addr({ phone: '123' }))).status, 400);
  assert.equal((await call('POST', '/v1/addresses', c, addr({ province: 'Atlantis' }))).status, 400);
  assert.equal((await call('GET', '/v1/addresses', undefined)).status, 401);
});

test('tạo đơn tự lưu người gửi (thành mặc định) và người nhận; dùng lại thì tăng số lần dùng, không nhân bản', async () => {
  const u = await newUser();
  await fund(u, 500000);
  const make = async () => {
    const { q, offer } = await getOffer(u);
    const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
    await worker.runOnce({ shipmentId: shipment.id });
  };
  await make();
  let list = await addresses.list(u);
  assert.equal(list.length, 2);
  const sender = list.find((x) => x.phone === SENDER.phone);
  const receiver = list.find((x) => x.phone === RECEIVER.phone);
  assert.equal(sender.isDefaultSender, true);
  assert.equal(receiver.isDefaultSender, false);
  assert.equal(receiver.useCount, 1);
  await make();
  list = await addresses.list(u);
  assert.equal(list.length, 2);
  assert.equal(list.find((x) => x.phone === RECEIVER.phone).useCount, 2);
});

test('đơn bị từ chối vì phường sai thì không lưu địa chỉ', async () => {
  const u = await newUser();
  await fund(u, 500000);
  const { q, offer } = await getOffer(u);
  await assert.rejects(orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: { ...RECEIVER, ward: 'Phường Hư Cấu' } }, key()), (e) => e.status === 400);
  assert.equal((await addresses.list(u)).length, 0);
});

test('đăng nhập thủ công: không gửi mã, quản trị cấp mã dùng một lần, hết hạn thì vô hiệu', async () => {
  const saved = config.otpProvider;
  config.otpProvider = 'manual';
  try {
    const phone = '0917000001';
    let r = await call('POST', '/v1/auth/otp', undefined, { phone });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).manual, true);
    // chưa có mã nào được cấp: không đăng nhập được
    r = await call('POST', '/v1/auth/verify', undefined, { phone, code: '123456' });
    assert.equal(r.status, 400);
    // quản trị cấp mã
    assert.equal((await call('POST', '/v1/admin/otp', undefined, { phone })).status, 401, 'cần quyền quản trị');
    const login = await call('POST', '/v1/admin/login', undefined, { token: 'adm-tok', otp: auth.totp(config.adminTotpSecret) });
    const admin = (login.headers.getSetCookie()[0] || '').split(';')[0];
    const issued = await (await call('POST', '/v1/admin/otp', admin, { phone, reason: 'thử' })).json();
    assert.match(issued.code, /^\d{6}$/);
    assert.equal((await call('POST', '/v1/auth/verify', undefined, { phone, code: issued.code === '000000' ? '111111' : '000000' })).status, 400);
    r = await call('POST', '/v1/auth/verify', undefined, { phone, code: issued.code });
    assert.equal(r.status, 200);
    // dùng lại thì không được
    assert.equal((await call('POST', '/v1/auth/verify', undefined, { phone, code: issued.code })).status, 400);
    // cấp mã mới vô hiệu mã cũ; mã hết hạn bị từ chối
    const i1 = await (await call('POST', '/v1/admin/otp', admin, { phone })).json();
    const i2 = await (await call('POST', '/v1/admin/otp', admin, { phone })).json();
    assert.equal((await call('POST', '/v1/auth/verify', undefined, { phone, code: i1.code })).status === 200 && i1.code !== i2.code, false);
    await query("UPDATE otps SET expires_at = now() - interval '1 second' WHERE phone=$1", [phone]);
    assert.equal((await call('POST', '/v1/auth/verify', undefined, { phone, code: i2.code })).status, 400);
    const audit = await query("SELECT count(*)::int n FROM admin_audit WHERE action='otp.issue'");
    assert.ok(audit[0].n >= 3, 'mỗi lần cấp mã đều được ghi nhật ký');
  } finally { config.otpProvider = saved; }
});
