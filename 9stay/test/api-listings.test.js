import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, boot, shutdown, NOW } from './helper.js';
import { startServer, apiWorld, as, Api } from './helper-http.js';
import { config } from '../src/config.js';
import { extendListingRates } from '../src/listings.js';
import { setBankAccount } from '../src/bank.js';
import { hashToken } from '../src/otp.js';

before(boot);
after(shutdown);
let srv, w, mgr, chu1, chu2, dir;
beforeEach(async () => {
  await db.resetForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), '9stay-photos-'));
  config.dataDir = dir;
  w = await apiWorld();
  srv = await startServer();
  mgr = as(srv, w, 'quanly'); chu1 = as(srv, w, 'chu1'); chu2 = as(srv, w, 'chu2');
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; fs.rmSync(dir, { recursive: true, force: true }); });

const JPEG = (n = 2000, seed = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, seed)]);
async function upload(api, id, buf = JPEG(), type = 'image/jpeg') {
  const r = await fetch(srv.base + `/api/listings/${id}/photos`, { method: 'POST', headers: { cookie: `nine_sid=${encodeURIComponent(api.token)}`, 'x-requested-with': '9stay', 'content-type': type }, body: buf });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}
const ok = (r, label = '') => { assert.equal(r.status, 200, `${label} ${r.status} ${r.text}`); return r.json; };

const DESC = 'Căn hộ studio sáng sủa, đầy đủ tiện nghi, gần biển, thích hợp cho gia đình nhỏ và cặp đôi muốn nghỉ dưỡng thoải mái.';
async function draft(api, over = {}, buildingId = w.buildingId) {
  const body = { buildingId, title: 'Studio view biển tầng cao', description: DESC, amenities: ['wifi', 'dieu_hoa'], houseRules: 'Không hút thuốc', cancelPolicy: 'trung_binh', capacityStd: 2, capacityMax: 3, proposedPrice: 600000, proposedWeekendPrice: 800000, attest: true, ...over };
  if (api === mgr) body.ownerId = over.ownerId ?? w.ownerId;
  return ok(await api.post('/api/listings', body), 'tạo tin').id;
}
async function complete(api, id, codes = ['L-101']) {
  ok(await api.post(`/api/listings/${id}/units`, { codes }), 'thêm căn');
  for (let i = 0; i < 3; i++) assert.equal((await upload(api, id, JPEG(2000, i))).status, 200);
}
async function published(over = {}) {
  const id = await draft(chu1, over);
  await complete(chu1, id, over.codes ?? ['L-101']);
  ok(await chu1.post(`/api/listings/${id}/submit`, {}), 'gửi duyệt');
  ok(await mgr.post(`/api/listings/${id}/approve`, {}), 'duyệt');
  return id;
}
const detail = async (api, id) => (await api.get(`/api/listings/${id}`)).json;
const openNightsFor = async (id, from = '2026-12-01', to = '2026-12-31') => {
  const d = await detail(mgr, id);
  for (const u of d.units) ok(await chu1.post(`/api/units/${u.id}/release`, { action: 'open', from, to }), 'mở đêm');
};

test('quyền: chỉ chủ và quản lý đụng tới tin đăng; các vai khác 403, chưa đăng nhập 401', async () => {
  for (const k of ['letan', 'buongphong', 'ctv1']) {
    const a = as(srv, w, k);
    assert.equal((await a.get('/api/listings')).status, 403, k);
    assert.equal((await a.post('/api/listings', { buildingId: w.buildingId })).status, 403, k);
    assert.equal((await a.get('/api/listing-meta')).status, 403, k);
    assert.equal((await a.get('/api/review')).status, 403, k);
  }
  assert.equal((await new Api(srv).get('/api/listings')).status, 401);
  assert.equal((await chu1.get('/api/review')).status, 403, 'chủ không vào hàng duyệt');
  assert.equal((await chu1.post('/api/listings/' + crypto.randomUUID() + '/approve', {})).status, 403, 'chủ không tự duyệt');
  assert.equal((await chu1.post('/api/buildings/' + w.buildingId + '/approve', {})).status, 403);
  const meta = (await chu1.get('/api/listing-meta')).json;
  assert.ok(meta.amenities.length >= 20 && meta.cancelPolicies.length === 3);
});

test('luồng đầy đủ: chủ đề xuất tòa + đăng tin → thiếu thì không gửi được → admin duyệt tòa rồi tin → hiện công khai', async () => {
  const b = ok(await chu1.post('/api/buildings/propose', { name: 'Ocean Park S1', address: '12 Đường Biển, Gia Lâm', province: 'Hà Nội', district: 'Gia Lâm', legalType: 'can_ho_du_lich' }), 'đề xuất tòa');
  const id = await draft(chu1, {}, b.id);
  const inc = await chu1.post(`/api/listings/${id}/submit`, {});
  assert.equal(inc.status, 422);
  assert.match(inc.json.error.message, /ít nhất một căn/);
  assert.match(inc.json.error.message, /ảnh/);
  await complete(chu1, id, ['S1-101', 'S1-102']);
  ok(await chu1.post(`/api/listings/${id}/submit`, {}), 'gửi duyệt');
  // sửa khi đang chờ duyệt bị chặn
  assert.equal((await chu1.put(`/api/listings/${id}`, { title: 'Đổi tên khi đang chờ' })).status, 409);
  assert.equal((await upload(chu1, id)).status, 409);
  const q = (await mgr.get('/api/review')).json;
  assert.equal(q.buildings.length, 1);
  assert.equal(q.listings.length, 1);
  assert.equal(q.listings[0].buildingApproved, false);
  const early = await mgr.post(`/api/listings/${id}/approve`, {});
  assert.equal(early.status, 409);
  assert.equal(early.json.error.code, 'building_not_approved');
  ok(await mgr.post(`/api/buildings/${b.id}/approve`, {}), 'duyệt tòa');
  // chưa duyệt: không hiện công khai, ảnh công khai 404
  const d0 = await detail(chu1, id);
  assert.equal((await fetch(srv.base + `/photos/${d0.photos[0].id}`)).status, 404);
  const ap = ok(await mgr.post(`/api/listings/${id}/approve`, { price: 650000, weekendPrice: 850000, ownerSharePct: 65 }), 'duyệt tin');
  assert.equal(ap.units, 2);
  const d = await detail(chu1, id);
  assert.equal(d.status, 'approved');
  assert.equal(d.livePrice, 650000);
  assert.ok(d.units.every((u) => u.status === 'active'));
  const k = await db.query('SELECT owner_share_pct, cancel_penalty_pct, valid_from FROM owner_contracts WHERE unit_id = ANY($1::uuid[])', [d.units.map((u) => u.id)]);
  assert.equal(k.length, 2);
  assert.ok(k.every((x) => x.owner_share_pct === 65 && x.cancel_penalty_pct === 20));
  assert.equal((await fetch(srv.base + `/photos/${d.photos[0].id}`)).status, 200);
  const rates = await db.query("SELECT count(*)::int AS n FROM rate_calendar WHERE room_type_id = $1 AND source = 'listing'", [d.roomTypeId]);
  assert.equal(rates[0].n, 2 * 540);
});

test('giá lịch: ngày thường và thứ Sáu/Bảy khác nhau; gói CTV cùng giá', async () => {
  const id = await published();
  const d = await detail(mgr, id);
  const r = await db.query("SELECT night::text AS night, price, extract(isodow FROM night)::int AS dow FROM rate_calendar WHERE room_type_id = $1 AND plan_id = (SELECT id FROM rate_plans WHERE code = 'public' AND org_id = $2) ORDER BY night LIMIT 14", [d.roomTypeId, w.orgId]);
  assert.ok(r.length === 14);
  for (const x of r) assert.equal(x.price, [5, 6].includes(x.dow) ? 800000 : 600000, x.night);
  const c = await db.query("SELECT DISTINCT price FROM rate_calendar WHERE room_type_id = $1 AND plan_id = (SELECT id FROM rate_plans WHERE code = 'ctv' AND org_id = $2) ORDER BY price", [d.roomTypeId, w.orgId]);
  assert.deepEqual(c.map((x) => x.price), [600000, 800000]);
});

test('tìm phòng công khai: giá đã gồm VAT, không lộ căn/chủ/địa chỉ; cần đêm mở và còn trống', async () => {
  const id = await published();
  const P = '/api/public/anstay';
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  const anon = new Api(srv, null, null);
  // chưa có ngày: danh sách theo "từ giá"
  const r0 = (await anon.get(`${P}/listings`)).json;
  assert.equal(r0.total, 1);
  assert.equal(r0.listings[0].priceNight, 660000, '600.000 + VAT 10%');
  assert.ok(!/L-101|Minh|Sunrise|address/i.test(JSON.stringify(r0)));
  // có ngày nhưng chủ chưa mở đêm: không còn phòng
  const q = 'from=2026-12-02&to=2026-12-04&adults=2';
  assert.equal((await anon.get(`${P}/listings?${q}`)).json.total, 0);
  await openNightsFor(id);
  const r1 = (await anon.get(`${P}/listings?${q}`)).json;
  assert.equal(r1.total, 1);
  assert.equal(r1.listings[0].nights, 2);
  assert.equal(r1.listings[0].total, 1320000, '2 đêm x 600.000 x 1,1');
  // lọc: khu vực, giá, sức chứa
  assert.equal((await anon.get(`${P}/listings?${q}&area=Hà%20Nội`)).json.total, 0, 'tòa mặc định không có tỉnh');
  assert.equal((await anon.get(`${P}/listings?${q}&maxPrice=100000`)).json.total, 0);
  assert.equal((await anon.get(`${P}/listings?${q}&minPrice=100000&maxPrice=900000`)).json.total, 1);
  assert.equal((await anon.get(`${P}/listings?from=2026-12-02&to=2026-12-04&adults=9`)).json.total, 0, 'quá sức chứa tối đa');
  for (const bad of ['sort=lung_tung', 'minPrice=abc', 'adults=0', 'from=2026-12-04&to=2026-12-02', 'from=abc&to=2026-12-02']) {
    const x = await anon.get(`${P}/listings?${bad}`);
    assert.ok(x.status >= 400 && x.status < 500, bad + ' ' + x.status);
  }
  // chi tiết
  const d = (await anon.get(`${P}/listings/${id}?${q}`)).json;
  assert.equal(d.quote.total, 1320000);
  assert.equal(d.available, true);
  assert.equal(d.calendar.length, 90);
  assert.ok(d.calendar.find((x) => x.night === '2026-12-02').free);
  assert.ok(!/L-101|Minh/.test(JSON.stringify(d)));
  assert.equal((await anon.get(`${P}/listings/${crypto.randomUUID()}`)).status, 404);
  // sau khi có đơn kín các căn: hết phòng
  const book = await mgr.post('/api/quotes', { roomTypeId: d.roomTypeId, checkin: '2026-12-02', checkout: '2026-12-04', adults: 2 });
  ok(await mgr.post('/api/bookings', { roomTypeId: d.roomTypeId, checkin: '2026-12-02', checkout: '2026-12-04', guestName: 'Khách', adults: 2, quoteId: book.json.id }), 'đặt');
  assert.equal((await anon.get(`${P}/listings?${q}`)).json.total, 0);
});

test('tạm ngưng: ẩn khỏi công khai và ảnh công khai 404; bỏ tạm ngưng thì hiện lại; đặt theo loại phòng bị chặn khi tin không hiển thị', async () => {
  const id = await published();
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  await openNightsFor(id);
  const d = await detail(mgr, id);
  const anon = new Api(srv, null, null);
  assert.equal((await mgr.post(`/api/listings/${id}/suspend`, { reason: 'ok' })).status, 400, 'lý do quá ngắn');
  ok(await mgr.post(`/api/listings/${id}/suspend`, { reason: 'Ảnh không đúng thực tế' }), 'tạm ngưng');
  assert.equal((await anon.get('/api/public/anstay/listings')).json.total, 0);
  assert.equal((await anon.get(`/api/public/anstay/listings/${id}`)).status, 404);
  assert.equal((await fetch(srv.base + `/photos/${d.photos[0].id}`)).status, 404);
  ok(await mgr.post(`/api/listings/${id}/unsuspend`, {}), 'bỏ tạm ngưng');
  assert.equal((await anon.get('/api/public/anstay/listings')).json.total, 1);
});

test('đặt phòng công khai theo tin: chỉ tin đang hiển thị; tin nháp/chờ duyệt không đặt được', async () => {
  const id = await published();
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'CONG TY ANSTAY' }));
  await openNightsFor(id);
  const sess = async () => { const tok = 's' + crypto.randomBytes(12).toString('hex') + 'x'.repeat(10); await db.query("INSERT INTO otp_sessions(token_hash, org_id, phone, expires_at) VALUES($1, $2, '0901234567', '2030-01-01')", [hashToken(tok), w.orgId]); return tok; };
  const anon = new Api(srv, null, null);
  const body = (over) => ({ token: over.token, checkin: '2026-12-10', checkout: '2026-12-12', adults: 2, childAges: [], guestName: 'Nguyễn Lan', ...over });
  const good = await anon.post('/api/public/anstay/book', body({ token: await sess(), listingId: id }));
  assert.equal(good.status, 200, good.text);
  assert.equal(good.json.total, 1540000, 'đêm thứ Sáu 11/12 tính giá cuối tuần 800.000: (600.000 + 800.000) x 1,1');
  // tin nháp mới (chưa duyệt) không đặt được dù biết id hay loại phòng
  const dr = await draft(chu1);
  const drd = await detail(chu1, dr);
  assert.equal((await anon.post('/api/public/anstay/book', body({ token: await sess(), listingId: dr }))).status, 404);
  assert.equal((await anon.post('/api/public/anstay/book', body({ token: await sess(), roomTypeId: drd.roomTypeId }))).status, 404);
});

test('CTV tìm theo tin: cùng dữ liệu, kèm hoa hồng dự kiến theo % của CTV; chủ không dùng được', async () => {
  const id = await published();
  await openNightsFor(id);
  const ctv = as(srv, w, 'ctv1');
  const r = (await ctv.get('/api/search-listings?from=2026-12-02&to=2026-12-04&adults=2')).json;
  assert.equal(r.total, 1);
  assert.equal(r.listings[0].commission, Math.floor((1200000 * 10) / 100), 'hoa hồng 10% trên tiền phòng trước VAT');
  assert.ok(!/L-101|Minh/.test(JSON.stringify(r)));
  assert.equal((await chu1.get('/api/search-listings?from=2026-12-02&to=2026-12-04')).status, 403);
  assert.equal((await as(srv, w, 'letan').get('/api/search-listings?from=2026-12-02&to=2026-12-04')).json.listings[0].commission, undefined);
});

test('quyền theo hàng: chủ khác không thấy/sửa/tải ảnh/thêm căn vào tin của chủ này', async () => {
  const id = await draft(chu1);
  await complete(chu1, id);
  const d = await detail(chu1, id);
  assert.equal((await chu2.get(`/api/listings/${id}`)).status, 404);
  assert.equal((await chu2.put(`/api/listings/${id}`, { title: 'Chiếm tin của người khác' })).status, 404);
  assert.equal((await chu2.post(`/api/listings/${id}/submit`, {})).status, 404);
  assert.equal((await chu2.post(`/api/listings/${id}/delete`, {})).status, 404);
  assert.equal((await chu2.post(`/api/listings/${id}/units`, { codes: ['X'] })).status, 404);
  assert.equal((await upload(chu2, id)).status, 404);
  assert.equal((await chu2.post(`/api/listings/${id}/photos/${d.photos[0].id}/delete`, {})).status, 404);
  assert.equal((await chu2.get(`/api/photos/${d.photos[0].id}`)).status, 404);
  assert.equal((await chu1.get(`/api/photos/${d.photos[0].id}`)).status, 200);
  assert.equal((await mgr.get(`/api/photos/${d.photos[0].id}`)).status, 200);
  assert.equal((await chu2.get('/api/listings')).json.listings.length, 0);
  // chủ 2 không tạo tin ở tòa chờ duyệt do chủ 1 đề xuất
  const pb = ok(await chu1.post('/api/buildings/propose', { name: 'Tòa riêng của chủ 1', address: '1 Phố Cổ, Hà Nội', province: 'Hà Nội', district: 'Hoàn Kiếm' }));
  assert.equal((await chu2.post('/api/listings', { buildingId: pb.id, title: 'x' })).status, 404);
  assert.ok(!(await chu2.get('/api/my/buildings')).json.buildings.some((b) => b.id === pb.id));
});

test('ảnh: sai định dạng, ảnh giả, quá lớn, quá nhiều, hết hạn mức; xóa ảnh xóa tệp; sắp xếp ảnh bìa', async () => {
  const id = await draft(chu1);
  assert.equal((await upload(chu1, id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml')).status, 415);
  assert.equal((await upload(chu1, id, Buffer.from('khong phai anh khong phai anh'), 'image/jpeg')).status, 415, 'khai báo JPEG nhưng byte sai');
  assert.equal((await upload(chu1, id, JPEG(1_600_000))).status, 413);
  assert.equal((await upload(chu1, id, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2]), 'image/png')).status, 200, 'PNG hợp lệ');
  assert.equal((await upload(chu1, id, Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]), 'image/webp')).status, 200, 'WebP hợp lệ');
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push((await upload(chu1, id, JPEG(500, i))).json.id);
  assert.equal((await upload(chu1, id)).status, 409, 'đủ 12 ảnh');
  const d = await detail(chu1, id);
  assert.equal(d.photos.length, 12);
  const first = d.photos[0].id;
  const del = d.photos[1].id;
  ok(await chu1.post(`/api/listings/${id}/photos/${del}/delete`, {}));
  const files = () => fs.readdirSync(path.join(dir, 'photos', id)).length;
  assert.equal(files(), 11, 'tệp ảnh đã xóa khỏi ổ đĩa');
  const order = (await detail(chu1, id)).photos.map((p) => p.id).reverse();
  ok(await chu1.post(`/api/listings/${id}/photos/order`, { ids: order }));
  assert.equal((await detail(chu1, id)).photos[0].id, order[0]);
  assert.equal((await chu1.post(`/api/listings/${id}/photos/order`, { ids: order.slice(1) })).status, 400, 'thiếu ảnh');
  assert.ok(first && ids.length === 10);
  // hạn mức dung lượng của chủ
  await db.query('UPDATE listing_photos SET bytes = 2900000 WHERE listing_id = $1', [id]);
  assert.equal((await upload(chu1, (await draft(chu1)))).status, 409, 'hết 30 MB của chủ');
});

test('tải ảnh: chưa đăng nhập 401 và không nhận thân; thiếu CSRF 403', async () => {
  const id = await draft(chu1);
  const noCookie = await fetch(srv.base + `/api/listings/${id}/photos`, { method: 'POST', headers: { 'x-requested-with': '9stay', 'content-type': 'image/jpeg' }, body: JPEG() });
  assert.equal(noCookie.status, 401);
  const noCsrf = await fetch(srv.base + `/api/listings/${id}/photos`, { method: 'POST', headers: { cookie: `nine_sid=${encodeURIComponent(chu1.token)}`, 'content-type': 'image/jpeg' }, body: JPEG() });
  assert.equal(noCsrf.status, 403);
});

test('nội dung: ký tự điều khiển, tiện nghi lạ, giá ngoài khoảng, sức chứa sai bị từ chối', async () => {
  const bad = async (over, why) => { const r = await chu1.post('/api/listings', { buildingId: w.buildingId, ...over }); assert.equal(r.status, 400, why + ' ' + r.text); };
  await bad({ title: 'abc‮def' }, 'ký tự đảo chiều');
  await bad({ title: 'dòng 1\ndòng 2' }, 'xuống dòng trong tiêu đề');
  await bad({ title: 'x'.repeat(101) }, 'tiêu đề dài');
  await bad({ description: 'a\u0000b' }, 'ký tự NUL');
  await bad({ amenities: ['wifi', 'phao_cuu_sinh'] }, 'tiện nghi lạ');
  await bad({ proposedPrice: 100 }, 'giá quá thấp');
  await bad({ proposedPrice: 10 ** 10 }, 'giá quá cao');
  await bad({ capacityStd: 5, capacityMax: 2 }, 'sức chứa ngược');
  await bad({ cancelPolicy: 'tuy_thich' }, 'chính sách hủy lạ');
  const okLong = await chu1.post('/api/listings', { buildingId: w.buildingId, description: 'Dòng một\nDòng hai' });
  assert.equal(okLong.status, 200, 'mô tả nhiều dòng được');
});

test('tin đã duyệt: sửa nội dung ngay được, đổi giá qua đề xuất; duyệt đổi giá áp từ ngày mai; từ chối cần lý do; chỉ một đề xuất chờ', async () => {
  const id = await published();
  assert.equal((await chu1.put(`/api/listings/${id}`, { title: 'Studio đã đổi tên mới' })).status, 200);
  assert.equal((await chu1.put(`/api/listings/${id}`, { proposedPrice: 100000 })).status, 409, 'không tự đổi giá');
  const pc = ok(await chu1.post(`/api/listings/${id}/price-change`, { price: 700000, weekendPrice: 900000 }));
  assert.equal((await chu1.post(`/api/listings/${id}/price-change`, { price: 710000 })).status, 409, 'đã có đề xuất chờ');
  assert.equal((await detail(chu1, id)).livePrice, 600000, 'giá cũ chạy tới khi duyệt');
  assert.equal((await chu1.post(`/api/price-changes/${pc.id}/approve`, {})).status, 403);
  assert.equal((await mgr.post(`/api/price-changes/${pc.id}/reject`, {})).status, 400, 'từ chối cần lý do');
  ok(await mgr.post(`/api/price-changes/${pc.id}/approve`, {}));
  const d = await detail(mgr, id);
  assert.equal(d.livePrice, 700000);
  const today = '2026-10-14'; // NOW của kiểm thử
  const rows = await db.query("SELECT night::text AS night, price, extract(isodow FROM night)::int AS dow FROM rate_calendar WHERE room_type_id = $1 AND plan_id = (SELECT id FROM rate_plans WHERE code = 'public' AND org_id = $2) AND night <= '2026-10-20' ORDER BY night", [d.roomTypeId, w.orgId]);
  assert.equal(rows.find((r) => r.night === today).price, 600000 + (rows.find((r) => r.night === today).dow >= 5 ? 200000 : 0), 'hôm nay giữ giá cũ');
  const tomorrow = rows.find((r) => r.night === '2026-10-15');
  assert.equal(tomorrow.price, [5, 6].includes(tomorrow.dow) ? 900000 : 700000);
  const pc2 = ok(await chu1.post(`/api/listings/${id}/price-change`, { price: 650000 }));
  ok(await mgr.post(`/api/price-changes/${pc2.id}/reject`, { reason: 'Giá thấp hơn thị trường' }));
  assert.equal((await mgr.post(`/api/price-changes/${pc2.id}/approve`, {})).status, 409, 'đã xử lý');
});

test('bị từ chối: có lý do, sửa và gửi lại được; không duyệt lại tin không chờ', async () => {
  const id = await draft(chu1);
  await complete(chu1, id);
  ok(await chu1.post(`/api/listings/${id}/submit`, {}));
  assert.equal((await mgr.post(`/api/listings/${id}/reject`, { reason: 'abc' })).status, 400);
  ok(await mgr.post(`/api/listings/${id}/reject`, { reason: 'Ảnh mờ, cần ảnh phòng ngủ' }));
  const d = await detail(chu1, id);
  assert.equal(d.status, 'rejected');
  assert.match(d.rejectReason, /Ảnh mờ/);
  assert.equal((await mgr.post(`/api/listings/${id}/approve`, {})).status, 409);
  ok(await chu1.put(`/api/listings/${id}`, { title: 'Studio view biển tầng cao (đã sửa)' }));
  ok(await chu1.post(`/api/listings/${id}/submit`, {}));
  assert.equal((await detail(chu1, id)).status, 'pending');
});

test('duyệt tin khóa hàng: hai quản lý duyệt cùng lúc chỉ một thắng, hợp đồng không nhân đôi', async () => {
  const id = await draft(chu1);
  await complete(chu1, id);
  ok(await chu1.post(`/api/listings/${id}/submit`, {}));
  const rs = await Promise.all([mgr.post(`/api/listings/${id}/approve`, {}), mgr.post(`/api/listings/${id}/approve`, {}), mgr.post(`/api/listings/${id}/approve`, {})]);
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 2);
  assert.equal((await db.query('SELECT 1 FROM owner_contracts WHERE unit_id IN (SELECT unit_id FROM listing_units WHERE listing_id = $1)', [id])).length, 1);
});

test('xóa tin nháp: xóa tin, căn tạo kèm, ảnh; không xóa tin đã gửi/duyệt', async () => {
  const id = await draft(chu1);
  await complete(chu1, id, ['DEL-1']);
  assert.ok(fs.existsSync(path.join(dir, 'photos', id)));
  ok(await chu1.post(`/api/listings/${id}/delete`, {}));
  assert.ok(!fs.existsSync(path.join(dir, 'photos', id)));
  assert.equal((await db.query("SELECT 1 FROM units WHERE code = 'DEL-1'")).length, 0);
  const live = await published({ codes: ['KEEP-1'] });
  assert.equal((await chu1.post(`/api/listings/${live}/delete`, {})).status, 409);
});

test('thêm căn: mã trùng 409 và hoàn tác; không thêm vào tin đã duyệt; bớt căn khi nháp', async () => {
  const id = await draft(chu1);
  ok(await chu1.post(`/api/listings/${id}/units`, { codes: ['A-1', 'A-2'] }));
  const dup = await chu1.post(`/api/listings/${id}/units`, { codes: ['A-3', 'A-1'] });
  assert.equal(dup.status, 409);
  assert.equal((await db.query("SELECT 1 FROM units WHERE code = 'A-3'")).length, 0);
  assert.equal((await chu1.post(`/api/listings/${id}/units`, { codes: ['b', 'B'] })).status, 400);
  const d = await detail(chu1, id);
  ok(await chu1.post(`/api/listings/${id}/units/${d.units[0].id}/remove`, {}));
  assert.equal((await detail(chu1, id)).units.length, 1);
  const live = await published({ codes: ['LIVE-1'] });
  assert.equal((await chu1.post(`/api/listings/${live}/units`, { codes: ['LIVE-2'] })).status, 409);
});

test('tòa nhiều chủ: admin tạo tòa + căn cho từng chủ; mỗi chủ chỉ thấy và đăng căn của mình; đổi chủ khi chưa dùng', async () => {
  const mb = ok(await mgr.post('/api/setup/buildings', { name: 'Tòa chung cư A', address: '5 Đường Lớn', province: 'Đà Nẵng', district: 'Sơn Trà', multiOwner: true }));
  const rt = ok(await mgr.post('/api/setup/room-types', { name: 'Mặc định', capacityStd: 2, capacityMax: 4 }));
  const u1 = ok(await mgr.post('/api/setup/units', { buildingId: mb.id, ownerId: w.ownerId, roomTypeId: rt.id, codes: ['A-1201', 'A-1202'] }));
  const u2 = ok(await mgr.post('/api/setup/units', { buildingId: mb.id, ownerId: w.lan.ownerId, roomTypeId: rt.id, codes: ['A-1301'] }));
  const mine1 = (await chu1.get('/api/listings/unassigned-units')).json.units.filter((u) => u.buildingId === mb.id);
  assert.deepEqual(mine1.map((u) => u.code).sort(), ['A-1201', 'A-1202']);
  assert.deepEqual((await chu2.get('/api/listings/unassigned-units')).json.units.filter((u) => u.buildingId === mb.id).map((u) => u.code), ['A-1301']);
  // chủ 2 không gắn căn của chủ 1
  const id2 = await draft(chu2, {}, mb.id);
  assert.equal((await chu2.post(`/api/listings/${id2}/units`, { unitIds: [u1.ids[0]] })).status, 404);
  ok(await chu2.post(`/api/listings/${id2}/units`, { unitIds: u2.ids }));
  // chủ 1 đăng tin gồm cả hai căn của mình ở tòa chung
  const id1 = await draft(chu1, { title: 'Hai căn hộ cao cấp cùng tòa' }, mb.id);
  ok(await chu1.post(`/api/listings/${id1}/units`, { unitIds: u1.ids }));
  assert.equal((await detail(chu1, id1)).units.length, 2);
  assert.equal((await chu1.get('/api/listings/unassigned-units')).json.units.filter((u) => u.buildingId === mb.id).length, 0);
  // căn đã thuộc tin thì không đổi chủ; căn mới tạo chưa dùng thì đổi được
  assert.equal((await mgr.post(`/api/setup/units/${u1.ids[0]}/owner`, { ownerId: w.lan.ownerId })).status, 409);
  const free = ok(await mgr.post('/api/setup/units', { buildingId: mb.id, ownerId: w.ownerId, roomTypeId: rt.id, codes: ['A-1401'] }));
  ok(await mgr.post(`/api/setup/units/${free.ids[0]}/owner`, { ownerId: w.lan.ownerId }));
  assert.ok((await chu2.get('/api/listings/unassigned-units')).json.units.some((u) => u.code === 'A-1401'));
  assert.equal((await chu1.post(`/api/setup/units/${free.ids[0]}/owner`, { ownerId: w.ownerId })).status, 403);
});

test('căn đang có khách không gắn vào tin; căn gắn vào tin thành không hoạt động tới khi duyệt', async () => {
  const mb = ok(await mgr.post('/api/setup/buildings', { name: 'Tòa B', province: 'Hà Nội', multiOwner: true }));
  const rt = ok(await mgr.post('/api/setup/room-types', { name: 'Thường' }));
  const u = ok(await mgr.post('/api/setup/units', { buildingId: mb.id, ownerId: w.ownerId, roomTypeId: rt.id, codes: ['B-1', 'B-2'] }));
  await db.query("INSERT INTO owner_releases(unit_id, night, kind) VALUES($1, '2026-11-20', 'open')", [u.ids[0]]);
  await db.query("INSERT INTO bookings(org_id, code, guest_name, adults, status, checkin, checkout, unit_id) VALUES($1, 'TST1', 'K', 1, 'da_coc', '2026-11-20', '2026-11-21', $2)", [w.orgId, u.ids[0]]);
  await db.query("INSERT INTO room_nights(org_id, booking_id, unit_id, night) SELECT $1, id, $2, '2026-11-20' FROM bookings WHERE code = 'TST1'", [w.orgId, u.ids[0]]);
  const id = await draft(chu1, {}, mb.id);
  assert.equal((await chu1.post(`/api/listings/${id}/units`, { unitIds: [u.ids[0]] })).status, 409);
  ok(await chu1.post(`/api/listings/${id}/units`, { unitIds: [u.ids[1]] }));
  assert.equal((await db.query('SELECT status FROM units WHERE id = $1', [u.ids[1]]))[0].status, 'inactive');
});

test('bảo đảm ở CSDL: căn không thể gắn vào tin của chủ khác, mỗi căn chỉ một tin', async () => {
  const a = await draft(chu1);
  ok(await chu1.post(`/api/listings/${a}/units`, { codes: ['DB-1'] }));
  const unit = (await detail(chu1, a)).units[0].id;
  const b = await draft(chu1, { title: 'Tin thứ hai của cùng chủ' });
  await assert.rejects(db.query('INSERT INTO listing_units(listing_id, owner_id, unit_id) VALUES($1, $2, $3)', [b, w.ownerId, unit]), /unique|duplicate/i);
  const c = await draft(chu2);
  await assert.rejects(db.query('INSERT INTO listing_units(listing_id, owner_id, unit_id) VALUES($1, $2, $3)', [c, w.lan.ownerId, w.unit2Id]), /foreign key/i, 'căn của chủ 1 không gắn được vào tin của chủ 2');
});

test('kéo dài lịch giá: điền đêm còn thiếu, không ghi đè giá đã sửa tay', async () => {
  const id = await published();
  const d = await detail(mgr, id);
  await db.query("DELETE FROM rate_calendar WHERE room_type_id = $1 AND night >= '2027-03-01'", [d.roomTypeId]);
  await db.query("UPDATE rate_calendar SET price = 1234000 WHERE room_type_id = $1 AND night = '2026-11-05'", [d.roomTypeId]);
  const r = await db.tx((c) => extendListingRates(c, { now: NOW }));
  assert.equal(r.listings, 1);
  const n = await db.query("SELECT count(*)::int AS n FROM rate_calendar WHERE room_type_id = $1", [d.roomTypeId]);
  assert.equal(n[0].n, 2 * 540);
  assert.equal((await db.query("SELECT price FROM rate_calendar WHERE room_type_id = $1 AND night = '2026-11-05' LIMIT 1", [d.roomTypeId]))[0].price, 1234000);
});

test('danh sách tin lọc theo trạng thái; khu vực công khai chỉ tính tin đang hiển thị', async () => {
  const id = await published();
  await draft(chu1, { title: 'Một tin nháp khác của chủ' });
  assert.equal((await chu1.get('/api/listings')).json.listings.length, 2);
  assert.equal((await chu1.get('/api/listings?status=approved')).json.listings.length, 1);
  assert.equal((await chu1.get('/api/listings?status=bậy')).status, 400);
  assert.equal((await mgr.get('/api/listings?status=draft')).json.listings.length, 1);
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  await db.query("UPDATE buildings SET province = 'Quảng Ninh', district = 'Hạ Long' WHERE id = $1", [w.buildingId]);
  const areas = (await new Api(srv, null, null).get('/api/public/anstay/areas')).json.areas;
  assert.deepEqual(areas, [{ province: 'Quảng Ninh', district: 'Hạ Long', count: 1 }]);
  assert.equal((await new Api(srv, null, null).get('/api/public/anstay/listings?area=hạ%20long')).json.total, 1);
  assert.ok(id);
});
