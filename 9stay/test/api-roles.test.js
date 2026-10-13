import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as } from './helper-http.js';

before(boot);
after(shutdown);
let srv, w;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer();
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

const book = (api, over = {}) => api.post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Nguyễn Văn Lan', guestPhone: '0901234567', adults: 2, ...over });
const status = async (p) => (await p).status;

test('buồng phòng chưa có quyền nghiệp vụ nào: mọi route đều 403', async () => {
  const b = as(srv, w, 'buongphong');
  for (const p of [b.get('/api/calendar?from=2026-11-01&to=2026-11-03'), b.get('/api/bookings'), b.get('/api/availability?checkin=2026-11-01&checkout=2026-11-03'), b.post('/api/quotes', {}), b.post('/api/bookings', {}), b.get('/api/statements/owner'), b.get('/api/reports/custody')]) {
    assert.equal(await status(p), 403);
  }
  assert.equal((await b.get('/api/me')).json.member.role, 'buongphong');
});

test('CTV tìm phòng theo loại, thấy hoa hồng dự kiến; đặt theo loại, kết quả không lộ căn/tòa/chủ', async () => {
  const c1 = as(srv, w, 'ctv1');
  const av = await c1.get('/api/availability?checkin=2026-11-12&checkout=2026-11-14&adults=2');
  assert.equal(av.status, 200);
  assert.deepEqual(av.json.roomTypes.map((t) => ({ name: t.name, free: t.free })), [{ name: 'Deluxe', free: 3 }]);
  assert.ok(!av.text.includes('A1205') && !av.text.includes('Sunrise') && !av.text.includes('Minh'));

  const q = await c1.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2, plan: 'ctv' });
  assert.equal(q.status, 200);
  assert.equal(q.json.subtotal, 1300000);
  assert.equal(q.json.commission, 130000); // 10% của hoa hồng Hoa; plan do client gửi bị bỏ qua, luôn giá công khai
  const r = await book(c1, { quoteId: q.json.id });
  assert.equal(r.status, 200);
  const bk = r.json.booking;
  assert.equal(bk.status, 'giu');
  assert.equal(bk.roomTypeName, 'Deluxe');
  assert.equal(bk.total, q.json.total);
  for (const k of ['unitCode', 'buildingName', 'agentId', 'source']) assert.equal(bk[k], undefined, k);
  assert.ok(!r.text.includes('A120') && !r.text.includes('Sunrise'));
  // trong CSDL đơn thuộc đúng sale/CTV, nguồn 'agent'
  const [row] = await db.query('SELECT agent_id, source, commission_pct, created_by FROM bookings WHERE id=$1', [bk.id]);
  assert.deepEqual({ agent: row.agent_id, source: row.source, pct: row.commission_pct }, { agent: w.ag1, source: 'agent', pct: 10 });
});

test('CTV không đặt theo căn cụ thể, không đặt hộ người khác, không dùng route của nhân viên', async () => {
  const c1 = as(srv, w, 'ctv1');
  const r = await book(c1, { unitId: w.unitId, roomTypeId: undefined });
  assert.equal(r.status, 403);
  // agentId do client gửi bị bỏ qua: luôn là sale/CTV của chính họ
  const ok = await book(c1, { agentId: w.ag2 });
  assert.equal(ok.status, 200);
  assert.equal((await db.query('SELECT agent_id FROM bookings WHERE id=$1', [ok.json.booking.id]))[0].agent_id, w.ag1);
  for (const p of [
    c1.get('/api/calendar?from=2026-11-01&to=2026-11-03'), c1.get('/api/reports/custody'), c1.get('/api/statements/owner'), c1.put('/api/rates', {}),
    c1.post('/api/agents', {}), c1.post('/api/invites', { role: 'letan' }), c1.post(`/api/bookings/${ok.json.booking.id}/checkin`), c1.post(`/api/bookings/${ok.json.booking.id}/payments`, { kind: 'deposit' }),
    c1.post(`/api/bookings/${ok.json.booking.id}/move`, {}), c1.get(`/api/bookings/${ok.json.booking.id}/balance`), c1.post(`/api/units/${w.unitId}/release`, { action: 'open' }),
  ]) assert.equal(await status(p), 403);
});

test('CTV khác đoán id đơn: 404 (không lộ sự tồn tại), danh sách chỉ có đơn của mình', async () => {
  const c1 = as(srv, w, 'ctv1');
  const c2 = as(srv, w, 'ctv2');
  const mine = (await book(c1)).json.booking;
  const staff = (await book(as(srv, w, 'letan'), { checkin: '2026-11-20', checkout: '2026-11-21' })).json.booking;
  const theirs = (await book(c2, { checkin: '2026-11-25', checkout: '2026-11-26' })).json.booking;
  assert.equal((await c1.get(`/api/bookings/${mine.id}`)).status, 200);
  for (const id of [theirs.id, staff.id, '00000000-0000-0000-0000-000000000000']) {
    const r = await c1.get(`/api/bookings/${id}`);
    assert.equal(r.status, 404, id);
    assert.equal(r.json.error.code, 'not_found');
  }
  assert.equal((await c1.post(`/api/bookings/${theirs.id}/cancel`, {})).status, 404);
  const list = await c1.get('/api/bookings');
  assert.deepEqual(list.json.bookings.map((x) => x.id), [mine.id]);
  assert.equal((await c2.get('/api/bookings')).json.bookings.length, 1);
  assert.equal((await as(srv, w, 'letan').get('/api/bookings')).json.bookings.length, 3);
});

test('CTV hủy đơn của mình khi chưa thu tiền được; đã thu tiền thì 403', async () => {
  const c1 = as(srv, w, 'ctv1');
  const q = as(srv, w, 'quanly');
  const a = (await book(c1)).json.booking;
  assert.equal((await c1.post(`/api/bookings/${a.id}/cancel`, { reason: 'khách đổi ý' })).status, 200);
  const b = (await book(c1, { checkin: '2026-11-20', checkout: '2026-11-21' })).json.booking;
  assert.equal((await q.post(`/api/bookings/${b.id}/payments`, { kind: 'deposit', amount: 100000, receivedOn: '2026-10-14', ref: 'x1' })).status, 200);
  assert.equal((await c1.post(`/api/bookings/${b.id}/cancel`, {})).status, 403);
});

test('lễ tân: vận hành được nhưng không hoàn tiền, không hủy đơn đã thu tiền, không sửa giá, không bản kê, không mời', async () => {
  const l = as(srv, w, 'letan');
  const bk = (await book(l)).json.booking;
  assert.equal(bk.unitCode !== undefined, true); // nhân viên thấy căn
  assert.equal((await l.post(`/api/bookings/${bk.id}/payments`, { kind: 'deposit', amount: 300000, receivedOn: '2026-10-14', ref: 'd1' })).status, 200);
  const refund = await l.post(`/api/bookings/${bk.id}/payments`, { kind: 'refund', amount: 1000, receivedOn: '2026-10-14', ref: 'r1' });
  assert.equal(refund.status, 403);
  assert.equal((await l.post(`/api/bookings/${bk.id}/cancel`, { retainAmount: 0 })).status, 403);
  assert.equal((await l.put('/api/rates', { roomTypeId: w.roomTypeId, from: '2026-11-01', to: '2026-11-02', price: 1 })).status, 403);
  assert.equal((await l.get('/api/reports/custody')).status, 403);
  assert.equal((await l.post('/api/statements/owner/freeze', { ownerId: w.ownerId, from: '2026-11-01', to: '2026-12-01' })).status, 403);
  assert.equal((await l.post('/api/invites', { role: 'letan' })).status, 403);
  assert.equal((await l.post(`/api/units/${w.unitId}/release`, { action: 'open', from: '2026-12-01', to: '2026-12-03' })).status, 403);
  assert.equal((await book(l, { status: 'da_coc', checkin: '2026-11-20', checkout: '2026-11-21' })).status, 403);
  // quản lý hủy đơn đã thu tiền: phải chọn số giữ lại
  const q = as(srv, w, 'quanly');
  const need = await q.post(`/api/bookings/${bk.id}/cancel`, {});
  assert.equal(need.json.error.code, 'payments_exist');
  assert.equal((await q.post(`/api/bookings/${bk.id}/cancel`, { retainAmount: 0 })).status, 200);
  assert.equal((await q.post(`/api/bookings/${bk.id}/payments`, { kind: 'refund', amount: 300000, receivedOn: '2026-10-14', ref: 'r2' })).status, 200);
});

test('chủ phòng: chỉ thấy căn của mình trên lịch với tên khách bị che; không dùng route bán hàng', async () => {
  const staff = as(srv, w, 'letan');
  await book(staff, { guestName: 'Nguyễn Văn Lan' });
  const chu1 = as(srv, w, 'chu1');
  const cal = await chu1.get('/api/calendar?from=2026-11-11&to=2026-11-15');
  assert.equal(cal.status, 200);
  assert.deepEqual(cal.json.units.map((u) => u.code), ['A1205', 'A1206']);
  assert.ok(!cal.text.includes('B1"'));
  const guests = cal.json.units.flatMap((u) => u.cells).map((c) => c.guest).filter(Boolean);
  assert.deepEqual(guests, ['L***', 'L***']);
  assert.ok(!cal.text.includes('Nguyễn Văn Lan'));
  const chu2 = await as(srv, w, 'chu2').get('/api/calendar?from=2026-11-11&to=2026-11-15');
  assert.deepEqual(chu2.json.units.map((u) => u.code), ['B1']);
  for (const p of [chu1.get('/api/bookings'), chu1.post('/api/bookings', {}), chu1.get('/api/availability?checkin=2026-11-01&checkout=2026-11-03'), chu1.post('/api/quotes', {}), chu1.get('/api/reports/custody'), chu1.put('/api/rates', {})]) {
    assert.equal(await status(p), 403);
  }
  // quản lý/lễ tân thấy đủ tên khách trên lịch
  const full = await staff.get('/api/calendar?from=2026-11-11&to=2026-11-15');
  assert.ok(full.text.includes('Nguyễn Văn Lan'));
  assert.equal((await as(srv, w, 'ctv1').get('/api/calendar?from=2026-11-11&to=2026-11-15')).status, 403);
});

test('chủ phòng chặn/mở ngày căn của mình; căn của chủ khác hoặc id lạ: 404; không chặn được đêm đã có khách', async () => {
  const chu1 = as(srv, w, 'chu1');
  const own = await chu1.post(`/api/units/${w.unitId}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-23', kind: 'owner_use' });
  assert.equal(own.status, 200);
  const free = await as(srv, w, 'ctv1').get('/api/availability?checkin=2026-11-20&checkout=2026-11-22');
  assert.equal(free.json.roomTypes[0].free, 2); // 3 căn Deluxe trừ A1205 bị chủ giữ
  assert.equal((await chu1.post(`/api/units/${w.unitId}/release`, { action: 'open', from: '2026-11-20', to: '2026-11-23' })).status, 200);
  for (const id of [w.lan.unitId, '00000000-0000-0000-0000-000000000000']) {
    assert.equal((await chu1.post(`/api/units/${id}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-22' })).status, 404, id);
  }
  assert.equal((await chu1.post('/api/units/khong-phai-uuid/release', { action: 'open', from: '2026-11-20', to: '2026-11-22' })).status, 400);
  assert.equal((await chu1.post(`/api/units/${w.unitId}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-22', kind: 'blocked_by_anstay' })).status, 403);
  assert.equal((await chu1.post(`/api/units/${w.unitId}/release`, { action: 'xoa', from: '2026-11-20', to: '2026-11-22' })).status, 400);
  // có khách thì không chặn được
  const unitCode = (await book(as(srv, w, 'quanly'), { unitId: w.unitId, roomTypeId: undefined, checkin: '2026-11-25', checkout: '2026-11-26' })).json.booking.unitCode;
  assert.equal(unitCode, 'A1205');
  const blocked = await chu1.post(`/api/units/${w.unitId}/release`, { action: 'block', from: '2026-11-25', to: '2026-11-26' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.error.code, 'night_booked');
  // quản lý được chặn kiểu blocked_by_anstay trên mọi căn
  assert.equal((await as(srv, w, 'quanly').post(`/api/units/${w.lan.unitId}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-22', kind: 'blocked_by_anstay' })).status, 200);
});

test('bản kê chủ: chủ chỉ xem của mình (id chủ khác: 404), CTV và lễ tân 403; CSV chủ khác 404', async () => {
  const q = as(srv, w, 'quanly');
  // tạo một quyết toán để có bản kê
  const bk = (await book(q, { unitId: w.unitId, roomTypeId: undefined })).json.booking;
  const quote = await q.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2 });
  assert.ok(quote.json.ok && bk.id);
  const chu1 = as(srv, w, 'chu1');
  const own = await chu1.get('/api/statements/owner?from=2026-11-01&to=2026-12-01');
  assert.equal(own.status, 200);
  assert.deepEqual(own.json.totals, { room: 0, owner: 0, cleaning: 0, carried: 0, payable: 0 });
  assert.equal((await chu1.get(`/api/statements/owner?ownerId=${w.lan.ownerId}&from=2026-11-01&to=2026-12-01`)).status, 404);
  assert.equal((await chu1.get(`/api/statements/owner?ownerId=${w.ownerId}&from=2026-11-01&to=2026-12-01`)).status, 200);
  assert.equal((await as(srv, w, 'ctv1').get('/api/statements/owner?from=2026-11-01&to=2026-12-01')).status, 403);
  assert.equal((await as(srv, w, 'letan').get('/api/statements/owner?ownerId=' + w.ownerId + '&from=2026-11-01&to=2026-12-01')).status, 403);
  assert.equal((await q.get('/api/statements/owner?from=2026-11-01&to=2026-12-01')).json.error.code, 'missing_owner');
  assert.equal((await chu1.get('/api/statements/owner/list')).status, 200);
  assert.equal((await chu1.get('/api/statements/owner/00000000-0000-0000-0000-000000000000/csv')).status, 404);
});
