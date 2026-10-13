import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, boot, shutdown, NOW } from './helper.js';
import { startServer, apiWorld, as, Api } from './helper-http.js';
import { config } from '../src/config.js';
import { createBooking, cancelBooking } from '../src/bookings.js';
import { recordPayment } from '../src/payments.js';

before(boot);
after(shutdown);
let srv, w;
const extraServers = [];
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer();
});
test.afterEach(async () => {
  if (srv) await srv.close();
  srv = null;
  while (extraServers.length) await extraServers.pop().close();
});

const D = { roomTypeId: undefined, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2 };
const quote = async (api, over = {}) => (await api.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: D.checkin, checkout: D.checkout, adults: 2, ...over })).json;
const book = (api, over = {}) => api.post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: D.checkin, checkout: D.checkout, guestName: 'Khách', adults: 2, ...over });
const bookQ = async (api, over = {}) => book(api, { ...over, quoteId: (await quote(api, { checkin: over.checkin ?? D.checkin, checkout: over.checkout ?? D.checkout })).id });
const setOrgSetting = (key, value) => as(srv, w, 'quanly').put('/api/settings', { scopeType: 'org', key, value, effectiveFrom: '2026-01-01' });

// ---- 1. CTV: bắt buộc báo giá, hạn giữ riêng, giới hạn số đơn giữ ----
test('CTV đặt không có báo giá bị từ chối (không thể chiếm phòng "trống giá")', async () => {
  const r = await book(as(srv, w, 'ctv1'));
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'quote_required');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings'))[0].n, 0);
});

test('đơn giữ chỗ của CTV hết hạn sau 120 phút (cài đặt riêng), của lễ tân sau 24 giờ', async () => {
  const c = as(srv, w, 'ctv1');
  const a = (await bookQ(c)).json.booking;
  const l = (await book(as(srv, w, 'letan'), { checkin: '2026-11-20', checkout: '2026-11-21' })).json.booking;
  assert.equal(new Date(a.holdUntil).getTime(), NOW.getTime() + 120 * 60 * 1000);
  assert.equal(new Date(l.holdUntil).getTime(), NOW.getTime() + 1440 * 60 * 1000);
  assert.equal((await setOrgSetting('booking.holdMinutesAgent', 30)).status, 200);
  const b = (await bookQ(c, { checkin: '2026-11-22', checkout: '2026-11-23' })).json.booking;
  assert.equal(new Date(b.holdUntil).getTime(), NOW.getTime() + 30 * 60 * 1000);
});

test('giới hạn số đơn đang giữ chỗ của một CTV; hủy bớt thì đặt tiếp được; CTV khác không bị ảnh hưởng', async () => {
  assert.equal((await setOrgSetting('booking.maxHeldPerAgent', 2)).status, 200);
  const c1 = as(srv, w, 'ctv1');
  const day = (n) => ({ checkin: `2026-11-${10 + n}`, checkout: `2026-11-${11 + n}` });
  const a = await bookQ(c1, day(0));
  await bookQ(c1, day(1));
  const third = await bookQ(c1, day(2));
  assert.equal(third.status, 409);
  assert.equal(third.json.error.code, 'too_many_holds');
  assert.equal((await c1.post(`/api/bookings/${a.json.booking.id}/cancel`, {})).status, 200);
  assert.equal((await bookQ(c1, day(2))).status, 200);
  assert.equal((await bookQ(as(srv, w, 'ctv2'), day(5))).status, 200);
});

test('đặt đồng thời vượt giới hạn: không bao giờ vượt quá số đơn cho phép', async () => {
  assert.equal((await setOrgSetting('booking.maxHeldPerAgent', 2)).status, 200);
  const c1 = as(srv, w, 'ctv1');
  const days = [0, 1, 2, 3];
  const quotes = [];
  for (const n of days) quotes.push((await quote(c1, { checkin: `2026-11-${10 + n}`, checkout: `2026-11-${11 + n}` })).id);
  const rs = await Promise.all(days.map((n, i) => book(c1, { checkin: `2026-11-${10 + n}`, checkout: `2026-11-${11 + n}`, quoteId: quotes[i] })));
  assert.equal(rs.filter((r) => r.status === 200).length, 2);
  for (const r of rs.filter((x) => x.status !== 200)) assert.equal(r.json.error.code, 'too_many_holds');
});

test('CTV không dùng được báo giá của người khác (kể cả báo giá gói CTV của quản lý)', async () => {
  const q1 = await quote(as(srv, w, 'ctv1'));
  const stolen = await book(as(srv, w, 'ctv2'), { quoteId: q1.id });
  assert.equal(stolen.status, 409);
  assert.equal(stolen.json.error.code, 'quote_mismatch');
  const cheap = await quote(as(srv, w, 'quanly'), { plan: 'ctv' }); // gói ctv chưa có giá: cảnh báo, không có id
  assert.equal(cheap.ok, false);
  await as(srv, w, 'quanly').put('/api/rates', { roomTypeId: w.roomTypeId, plan: 'ctv', from: '2026-11-01', to: '2026-12-01', price: 400000 });
  const ctvPlan = await quote(as(srv, w, 'quanly'), { plan: 'ctv' });
  assert.ok(ctvPlan.ok);
  const useIt = await book(as(srv, w, 'ctv1'), { quoteId: ctvPlan.id });
  assert.equal(useIt.status, 409);
  assert.equal(useIt.json.error.code, 'quote_mismatch');
});

// ---- 2. Hạ tầng: IP tin cậy, bí mật biên ----
test('X-Forwarded-For: lấy phần tử cuối (do nginx đặt), nên khách đổi phần tử đầu không né được giới hạn dò mã', async () => {
  const tight = await startServer({ cfg: { ...config, redeemLimitPerMin: 3, trustedProxyHops: 1 } });
  extraServers.push(tight);
  const u = new Api(tight, crypto.randomUUID());
  const codes = [];
  for (let i = 0; i < 5; i++) {
    codes.push((await u.post('/api/invites/redeem', { code: 'AAAA-BBBB-CCCC-DDDD' }, { headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.9` } })).status);
  }
  assert.deepEqual(codes, [400, 400, 400, 429, 429]);
  // IP thật khác thì có hạn mức riêng
  assert.equal((await u.post('/api/invites/redeem', { code: 'AAAA-BBBB-CCCC-DDDD' }, { headers: { 'x-forwarded-for': '203.0.113.77' } })).status, 400);
});

test('trustedProxyHops = 0: bỏ qua X-Forwarded-For, dùng địa chỉ kết nối', async () => {
  const tight = await startServer({ cfg: { ...config, redeemLimitPerMin: 2, trustedProxyHops: 0 } });
  extraServers.push(tight);
  const u = new Api(tight, crypto.randomUUID());
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await u.post('/api/invites/redeem', { code: 'AAAA-BBBB-CCCC-DDDD' }, { headers: { 'x-forwarded-for': `10.0.0.${i}` } })).status);
  assert.deepEqual(codes, [400, 400, 429, 429]);
});

test('bí mật biên: có cấu hình thì thiếu hoặc sai header bị 403, đúng thì qua; healthz không cần', async () => {
  const secret = 'b'.repeat(40);
  const guarded = await startServer({ cfg: { ...config, edgeSecret: secret } });
  extraServers.push(guarded);
  const q = new Api(guarded, w.users.quanly);
  assert.equal((await q.get('/api/me')).status, 403);
  assert.equal((await q.get('/api/me', { headers: { 'x-edge-secret': 'sai' } })).status, 403);
  assert.equal((await q.get('/api/me', { headers: { 'x-edge-secret': 'b'.repeat(39) } })).status, 403);
  assert.equal((await q.get('/api/me', { headers: { 'x-edge-secret': secret } })).status, 200);
  assert.equal((await new Api(guarded).get('/healthz')).status, 200);
});

// ---- 3. Chủ phòng không ghi đè khóa của Anstay ----
test('chủ phòng không mở lại đêm Anstay đã khóa (409); quản lý thì được', async () => {
  const q = as(srv, w, 'quanly');
  assert.equal((await q.post(`/api/units/${w.unitId}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-22', kind: 'blocked_by_anstay' })).status, 200);
  const chu = as(srv, w, 'chu1');
  const r = await chu.post(`/api/units/${w.unitId}/release`, { action: 'open', from: '2026-11-19', to: '2026-11-23' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'blocked_by_anstay');
  assert.deepEqual(r.json.error.detail.nights, ['2026-11-20', '2026-11-21']);
  const kinds = (await db.query("SELECT night, kind FROM owner_releases WHERE unit_id=$1 AND night BETWEEN '2026-11-19' AND '2026-11-22' ORDER BY night", [w.unitId])).map((x) => x.kind);
  assert.deepEqual(kinds, ['open', 'blocked_by_anstay', 'blocked_by_anstay', 'open']);
  assert.equal((await q.post(`/api/units/${w.unitId}/release`, { action: 'open', from: '2026-11-20', to: '2026-11-22' })).status, 200);
});

// ---- 4. Tiền ----
test('thu tiền cho đơn không có báo giá không biến nó thành da_coc', async () => {
  const l = as(srv, w, 'letan');
  const b = (await book(l, { checkin: '2026-11-20', checkout: '2026-11-21' })).json.booking;
  const r = await l.post(`/api/bookings/${b.id}/payments`, { kind: 'deposit', amount: 1, receivedOn: '2026-10-14', ref: 'mot-dong' });
  assert.equal(r.status, 200);
  assert.equal(r.json.bookingStatus, 'giu');
  assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1', [b.id]))[0].status, 'giu');
});

test('lễ tân không gán đơn cho sale/CTV (403); quản lý được và hoa hồng chụp lúc đặt', async () => {
  const l = await book(as(srv, w, 'letan'), { agentId: w.ag1 });
  assert.equal(l.status, 403);
  const q = await book(as(srv, w, 'quanly'), { agentId: w.ag1 });
  assert.equal(q.status, 200);
  assert.equal((await db.query('SELECT commission_pct, source FROM bookings WHERE id=$1', [q.json.booking.id]))[0].commission_pct, 10);
});

test('hủy: kiểm "đã thu tiền" nằm trong cùng khóa với đơn (không đua với khoản tiền vừa ghi)', async () => {
  const l = as(srv, w, 'letan');
  const b = (await book(l)).json.booking;
  await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: b.id, kind: 'deposit', amount: 50000, receivedOn: '2026-10-14', ref: 'x' }));
  await assert.rejects(
    db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, retainAmount: 0, requireNoPayments: true })),
    (e) => e.code === 'forbidden' && e.status === 403,
  );
  assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1', [b.id]))[0].status, 'giu');
});

// ---- 5. Nhật ký ----
test('nhật ký: sự kiện đơn ghi người thực hiện; thao tác nhạy cảm vào audit_log (chỉ id/số liệu, chỉ thêm)', async () => {
  const l = as(srv, w, 'letan');
  const q = as(srv, w, 'quanly');
  const b = (await book(l)).json.booking;
  const letanId = (await db.query("SELECT id FROM members WHERE user_id=$1", [w.users.letan]))[0].id;
  const quanlyId = (await db.query("SELECT id FROM members WHERE user_id=$1", [w.users.quanly]))[0].id;
  await q.post(`/api/bookings/${b.id}/cancel`, { reason: 'khách báo hủy' });
  const ev = await db.query('SELECT kind, actor FROM booking_events WHERE booking_id=$1 ORDER BY id', [b.id]);
  assert.deepEqual(ev.map((e) => [e.kind, e.actor]), [['created', letanId], ['cancelled', quanlyId]]);

  await q.post('/api/invites', { role: 'letan' });
  await q.put('/api/rates', { roomTypeId: w.roomTypeId, from: '2026-12-01', to: '2026-12-03', price: 700000 });
  await q.post(`/api/units/${w.unitId}/release`, { action: 'block', from: '2026-11-25', to: '2026-11-26', kind: 'blocked_by_anstay' });
  await q.post('/api/agents', { name: 'Mới', kind: 'ctv', commissionPct: 8 });
  const log = await db.query('SELECT action, actor, data FROM audit_log ORDER BY id');
  assert.deepEqual(log.map((x) => x.action), ['invite.create', 'rates.set', 'release.block', 'agent.create']);
  assert.ok(log.every((x) => x.actor === quanlyId));
  assert.ok(!JSON.stringify(log).includes('khách báo hủy'));
  await assert.rejects(db.query('UPDATE audit_log SET action = $1', ['x']), (e) => e.code === '55000');
});

// ---- 6. Đầu vào quản lý không gây 500 ----
test('cài đặt/ưu đãi với đầu vào sai trả 4xx rõ ràng, không phải 500', async () => {
  const q = as(srv, w, 'quanly');
  const base = { scopeType: 'org', key: 'pricing.vatPct', value: 8, effectiveFrom: '2026-01-01' };
  assert.equal((await q.put('/api/settings', { ...base, scopeType: 'unit', scopeId: 'abc' })).json.error.code, 'bad_id');
  assert.equal((await q.put('/api/settings', { ...base, effectiveFrom: 'rac' })).json.error.code, 'bad_dates');
  const ghost = await q.put('/api/settings', { ...base, scopeType: 'unit', scopeId: '00000000-0000-0000-0000-000000000000' });
  assert.equal(ghost.status, 404);
  assert.equal(ghost.json.error.code, 'scope_not_found');
  assert.equal((await q.put('/api/settings', { ...base, value: '8' })).json.error.code, 'bad_setting');
  assert.equal((await q.put('/api/settings', base)).status, 200);
  const otherOrg = (await db.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0].id;
  const rt = (await db.query("INSERT INTO room_types(org_id,name) VALUES($1,'X') RETURNING id", [otherOrg]))[0].id;
  const promo = await q.post('/api/promotions', { name: 'KM', kind: 'pct', value: 10, stayFrom: '2026-11-01', stayTo: '2026-12-01', roomTypeId: rt });
  assert.equal(promo.status, 404);
  assert.equal(promo.json.error.code, 'room_type_not_found');
});

// ---- 7. Quản trị thành viên và mã mời ----
test('quản lý xem danh sách, khóa/mở thành viên; không tự khóa mình; luôn còn một quản lý; mã mời thu hồi được', async () => {
  const q = as(srv, w, 'quanly');
  const list = await q.get('/api/members');
  assert.equal(list.status, 200);
  assert.equal(list.json.members.length, 7);
  assert.ok(!list.text.includes(w.users.letan)); // không lộ user_id của 9id
  const letanM = list.json.members.find((m) => m.role === 'letan');
  const meM = list.json.members.find((m) => m.role === 'quanly');
  assert.equal((await q.post(`/api/members/${meM.id}/status`, { status: 'disabled' })).json.error.code, 'cannot_self');
  assert.equal((await q.post(`/api/members/${letanM.id}/status`, { status: 'disabled' })).status, 200);
  assert.equal((await as(srv, w, 'letan').get('/api/bookings')).status, 403);
  assert.equal((await q.post(`/api/members/${letanM.id}/status`, { status: 'active' })).status, 200);
  assert.equal((await as(srv, w, 'letan').get('/api/bookings')).status, 200);
  assert.equal((await q.post(`/api/members/${letanM.id}/status`, { status: 'xoa' })).json.error.code, 'bad_status');
  assert.equal((await q.post('/api/members/00000000-0000-0000-0000-000000000000/status', { status: 'disabled' })).status, 404);
  assert.equal((await as(srv, w, 'letan').get('/api/members')).status, 403);
  // quản lý thứ hai khóa được quản lý thứ nhất; quản lý cuối cùng thì không
  const second = crypto.randomUUID();
  const inv = await q.post('/api/invites', { role: 'quanly' });
  assert.equal((await new Api(srv, second).post('/api/invites/redeem', { code: inv.json.code })).status, 200);
  const q2 = new Api(srv, second);
  assert.equal((await q2.post(`/api/members/${meM.id}/status`, { status: 'disabled' })).status, 200);
  const q2m = (await q2.get('/api/members')).json.members.find((m) => m.role === 'quanly' && m.id !== meM.id);
  assert.equal((await q2.post(`/api/members/${q2m.id}/status`, { status: 'disabled' })).json.error.code, 'cannot_self');
  // mã mời: liệt kê (không lộ mã), thu hồi thì không dùng được
  const pending = await q2.post('/api/invites', { role: 'letan' });
  const pend = await q2.get('/api/invites');
  assert.ok(pend.json.invites.some((i) => i.id === pending.json.id));
  assert.ok(!pend.text.includes(pending.json.code));
  assert.equal((await q2.post(`/api/invites/${pending.json.id}/revoke`, {})).status, 200);
  assert.equal((await new Api(srv, crypto.randomUUID()).post('/api/invites/redeem', { code: pending.json.code })).json.error.code, 'invite_invalid');
  assert.equal((await q2.post(`/api/invites/${pending.json.id}/revoke`, {})).status, 404);
});

test('hàng rào quản lý cuối cùng', async () => {
  const q = as(srv, w, 'quanly');
  const second = crypto.randomUUID();
  const inv = await q.post('/api/invites', { role: 'quanly' });
  await new Api(srv, second).post('/api/invites/redeem', { code: inv.json.code });
  const members = (await q.get('/api/members')).json.members.filter((m) => m.role === 'quanly');
  const other = members.find((m) => m.displayName !== 'quanly');
  // q khóa quản lý thứ hai: được (còn q). Rồi quản lý thứ hai bị khóa không còn thao tác.
  assert.equal((await q.post(`/api/members/${other.id}/status`, { status: 'disabled' })).status, 200);
  assert.equal((await new Api(srv, second).get('/api/members')).status, 403);
});
