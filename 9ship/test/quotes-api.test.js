import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http.js';
import { quotesRoutes } from '../src/routes/quotes.js';
import { authRoutes } from '../src/routes/auth.js';
import { syncPickupPoints } from '../src/places.js';
import { setup, close, makeUser, loginCookie } from './helpers.js';

let app; let base; let COOKIE;
before(async () => {
  await setup();
  await syncPickupPoints();
  COOKIE = await loginCookie(await makeUser('0916000001'));
  app = createApp();
  quotesRoutes(app);
  authRoutes(app);
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });

const H = { 'content-type': 'application/json', 'x-requested-with': '9ship', get cookie() { return COOKIE; } };
const post = (p, body, headers = H) => fetch(base + p, { method: 'POST', headers, body: JSON.stringify(body) });

test('GET /v1/meta trả tỉnh, loại hàng, giới hạn', async () => {
  const j = await (await fetch(base + '/v1/meta')).json();
  assert.equal(j.provinces.length, 34);
  assert.ok(j.goodsTypes.length > 3);
  assert.equal(j.limits.maxWeightG, 30000);
});

test('POST /v1/quotes trả báo giá và lưu quote', async () => {
  const r = await post('/v1/quotes', { from: { province: 'Hà Nội' }, to: { province: 'Đà Nẵng' }, weightG: 900 });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.quoteId && j.offers.length >= 2);
  assert.ok(j.offers[0].sellPrice > 0);
  assert.equal(j.offers[0].cost, undefined, 'không lộ giá vốn');
});

test('thiếu header CSRF thì 403', async () => {
  const r = await post('/v1/quotes', { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 100 }, { 'content-type': 'application/json' });
  assert.equal(r.status, 403);
});

test('Origin lạ bị chặn', async () => {
  const r = await post('/v1/quotes', { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 100 }, { ...H, origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('Origin trùng X-Forwarded-Host (đi qua cổng 9app) được chấp nhận', async () => {
  const body = { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 300 };
  const ok = await post('/v1/quotes', body, { ...H, origin: 'https://9app.tech', 'x-forwarded-host': '9app.tech' });
  assert.equal(ok.status, 200);
  const bad = await post('/v1/quotes', body, { ...H, origin: 'https://evil.example', 'x-forwarded-host': '9app.tech' });
  assert.equal(bad.status, 403);
});

test('đầu vào sai trả 400 với định dạng lỗi chung', async () => {
  const r = await post('/v1/quotes', { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 0 });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.error.code, 'invalid_request');
});

test('JSON hỏng trả 400, đường dẫn lạ trả 404', async () => {
  const r = await fetch(base + '/v1/quotes', { method: 'POST', headers: H, body: '{bad' });
  assert.equal(r.status, 400);
  const r2 = await fetch(base + '/v1/khong-co');
  assert.equal(r2.status, 404);
});

test('GET /v1/pickup-points theo tọa độ, sai tọa độ trả 400', async () => {
  const r = await fetch(base + '/v1/pickup-points?lat=10.7769&lng=106.7009&carrier=mock-nhanh', { headers: { cookie: COOKIE } });
  const j = await r.json();
  assert.ok(j.points.length > 0);
  assert.ok(j.points.every((p) => p.carrier === 'mock-nhanh'));
  const r2 = await fetch(base + '/v1/pickup-points?lat=abc&lng=1', { headers: { cookie: COOKIE } });
  assert.equal(r2.status, 400);
});

test('chấp nhận tiền tố /9ship khi chạy sau nginx', async () => {
  const j = await (await fetch(base + '/9ship/v1/meta')).json();
  assert.equal(j.provinces.length, 34);
});

test('báo giá và quầy gần nhất yêu cầu đăng nhập', async () => {
  const r = await fetch(base + '/v1/quotes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': '9ship' }, body: JSON.stringify({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 100 }) });
  assert.equal(r.status, 401);
  assert.equal((await fetch(base + '/v1/pickup-points?lat=10&lng=106')).status, 401);
});

test('phường/xã phải thuộc đúng tỉnh', async () => {
  const { wardsOf } = await import('../src/geo.js');
  const ok = await post('/v1/quotes', { from: { province: 'Hà Nội', ward: wardsOf('ha-noi')[0] }, to: { province: 'Huế', ward: wardsOf('hue')[0] }, weightG: 200 });
  assert.equal(ok.status, 200);
  const bad = await post('/v1/quotes', { from: { province: 'Hà Nội', ward: wardsOf('hue')[0] }, to: { province: 'Huế' }, weightG: 200 });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.details.field, 'from.ward');
});
