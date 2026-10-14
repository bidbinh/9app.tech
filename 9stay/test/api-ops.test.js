import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as, Api } from './helper-http.js';

before(boot);
after(shutdown);
let srv, w, ics;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261107\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  srv = await startServer({ fetchText: async () => ics });
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

const mkTask = (key = 'letan', note = 'dọn') => as(srv, w, key).post('/api/housekeeping', { unitId: w.unitId, dueDate: '2026-10-14', note });

test('quyền buồng phòng: chỉ xem và cập nhật việc dọn', async () => {
  const t = await mkTask();
  assert.equal(t.status, 200);
  const bp = as(srv, w, 'buongphong');
  const list = await bp.get('/api/housekeeping');
  assert.equal(list.json.tasks.length, 1);
  assert.equal((await bp.post(`/api/housekeeping/${t.json.id}/status`, { status: 'done' })).status, 200);
  assert.equal((await bp.post('/api/housekeeping', { unitId: w.unitId, dueDate: '2026-10-14' })).status, 403);
  for (const p of ['/api/calendar?from=2026-11-01&to=2026-11-03', '/api/bookings', '/api/ical/feeds', '/api/reports/occupancy?from=2026-11-01&to=2026-11-02']) assert.equal((await bp.get(p)).status, 403, p);
});

test('CTV, chủ phòng và người ngoài không đụng được buồng phòng hay iCal', async () => {
  for (const k of ['ctv1', 'chu1']) {
    const a = as(srv, w, k);
    assert.equal((await a.get('/api/housekeeping')).status, 403, k);
    assert.equal((await a.get('/api/ical/feeds')).status, 403, k);
    assert.equal((await a.post('/api/ical/feeds', { unitId: w.unitId, name: 'x', url: 'https://a.com/x.ics' })).status, 403, k);
  }
  assert.equal((await new Api(srv).get('/api/housekeeping')).status, 401);
});

test('lễ tân tạo và cập nhật việc dọn nhưng không quản lý iCal', async () => {
  const lt = as(srv, w, 'letan');
  assert.equal((await mkTask('letan')).status, 200);
  assert.equal((await lt.get('/api/ical/feeds')).status, 403);
  assert.equal((await lt.post('/api/housekeeping', { unitId: 'khong-phai-uuid', dueDate: '2026-10-14' })).status, 400);
});

test('iCal qua HTTP: thêm nguồn, đồng bộ, địa chỉ nội bộ bị chặn, xuất lịch không cần đăng nhập', async () => {
  const mgr = as(srv, w, 'quanly');
  assert.equal((await mgr.post('/api/ical/feeds', { unitId: w.unitId, name: 'Nội bộ', url: 'https://127.0.0.1/a.ics' })).status, 400);
  assert.equal((await mgr.post('/api/ical/feeds', { unitId: w.unitId, name: 'Booking', url: 'http://a.com/a.ics' })).status, 400);
  const add = await mgr.post('/api/ical/feeds', { unitId: w.unitId, name: 'Booking', url: 'https://ical.booking.com/x' });
  assert.equal(add.status, 200);
  const sync = await mgr.post(`/api/ical/feeds/${add.json.id}/sync`, {});
  assert.equal(sync.status, 200);
  assert.equal(sync.json.blocked, 2);
  const feeds = (await mgr.get('/api/ical/feeds')).json.feeds;
  assert.equal(feeds[0].blockedNights, 2);
  assert.equal(feeds[0].lastError, null);
  const exp = await mgr.post(`/api/ical/export/${w.unitId}`, {});
  assert.match(exp.json.path, /^\/api\/ical\/out\/[0-9a-f]{48}\.ics$/);
  const pub = await fetch(srv.origin + '/stay' + exp.json.path);
  assert.equal(pub.status, 200);
  assert.match(pub.headers.get('content-type'), /text\/calendar/);
  assert.equal((await fetch(srv.origin + '/stay/api/ical/out/' + 'a'.repeat(48) + '.ics')).status, 404);
  assert.equal((await fetch(srv.origin + '/stay/api/ical/out/xyz.ics')).status, 404);
});

test('nguồn iCal lỗi: ghi lỗi vào nguồn, trả 502, không chặn đêm nào', async () => {
  await srv.close();
  const { AppError } = await import('../src/errors.js');
  srv = await startServer({ fetchText: async () => { throw new AppError('feed_http', 'Nguồn iCal trả mã 500', 502); } });
  const mgr = as(srv, w, 'quanly');
  const add = await mgr.post('/api/ical/feeds', { unitId: w.unitId, name: 'Hỏng', url: 'https://ical.booking.com/x' });
  const r = await mgr.post(`/api/ical/feeds/${add.json.id}/sync`, {});
  assert.equal(r.status, 502);
  assert.match((await mgr.get('/api/ical/feeds')).json.feeds[0].lastError, /500/);
  assert.equal((await db.query("SELECT 1 FROM owner_releases WHERE source = 'ical'")).length, 0);
});
