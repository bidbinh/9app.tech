import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as, Api } from './helper-http.js';
import { config } from '../src/config.js';

before(boot);
after(shutdown);
let srv, w;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer({ extra: (app) => app.route('GET', '/boom', async () => { throw new Error('chi tiết nội bộ bí mật'); }, { auth: 'none' }) });
});
const stop = async () => { if (srv) await srv.close(); srv = null; };
test.afterEach(stop);

test('healthz không cần đăng nhập', async () => {
  const r = await new Api(srv).get('/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
});

test('chưa đăng nhập: 401 unauthenticated; token hỏng: 401; dịch vụ 9id sập: 503, không coi là đăng xuất', async () => {
  const none = await new Api(srv).get('/api/me');
  assert.equal(none.status, 401);
  assert.equal(none.json.error.code, 'unauthenticated');
  const bad = await new Api(srv, null, 'khong-hop-le').get('/api/me');
  assert.equal(bad.status, 401);
  const down = await startServer({ idClient: { verify: async () => { throw new Error('ECONNREFUSED'); } } });
  try {
    const r = await new Api(down, crypto.randomUUID()).get('/api/me');
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'id_unavailable');
  } finally {
    await down.close();
  }
});

test('người đã đăng nhập 9id nhưng chưa là thành viên: /api/me trả member null, mọi route nghiệp vụ trả 403 not_member', async () => {
  const o = as(srv, w, 'outsider');
  const me = await o.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.member, null);
  for (const [m, p] of [['GET', '/api/calendar?from=2026-11-01&to=2026-11-03'], ['GET', '/api/bookings'], ['GET', '/api/availability?checkin=2026-11-01&checkout=2026-11-03'], ['GET', '/api/reports/custody'], ['GET', '/api/statements/owner']]) {
    const r = await o.req(m, p);
    assert.equal(r.status, 403, m + ' ' + p);
    assert.equal(r.json.error.code, 'not_member');
  }
  assert.equal((await o.post('/api/bookings', { roomTypeId: w.roomTypeId })).status, 403);
});

test('thành viên bị khóa mất quyền ngay', async () => {
  const c1 = as(srv, w, 'letan');
  assert.equal((await c1.get('/api/bookings')).status, 200);
  await db.query("UPDATE members SET status='disabled' WHERE user_id=$1", [w.users.letan]);
  const r = await c1.get('/api/bookings');
  assert.equal(r.status, 403);
});

test('CSRF: thiếu header X-Requested-With bị 403; Origin lạ bị 403; Origin cùng host được', async () => {
  const q = as(srv, w, 'quanly');
  const body = { name: 'X', kind: 'ctv', commissionPct: 5 };
  const noHeader = await q.post('/api/agents', body, { csrf: false });
  assert.equal(noHeader.status, 403);
  assert.equal(noHeader.json.error.code, 'csrf');
  assert.equal((await q.post('/api/agents', body, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await q.post('/api/agents', body, { origin: srv.origin })).status, 200);
  assert.equal((await q.get('/api/bookings')).status, 200); // GET không cần header
});

test('JSON hỏng, mảng, quá lớn, route lạ, sai phương thức', async () => {
  const q = as(srv, w, 'quanly');
  assert.equal((await q.req('POST', '/api/agents', undefined, { raw: '{khong json' })).status, 400);
  assert.equal((await q.req('POST', '/api/agents', undefined, { raw: '[1,2]' })).json.error.code, 'bad_json');
  assert.equal((await q.req('POST', '/api/agents', undefined, { raw: '"chuoi"' })).status, 400);
  const big = await q.req('POST', '/api/agents', undefined, { raw: JSON.stringify({ name: 'x'.repeat(70 * 1024) }) });
  assert.equal(big.status, 413);
  assert.equal((await q.get('/api/khong-co')).status, 404);
  assert.equal((await q.req('DELETE', '/api/bookings')).status, 405);
});

test('lỗi nghiệp vụ trả JSON thống nhất; lỗi lạ trả 500 không lộ nội dung', async () => {
  const q = as(srv, w, 'quanly');
  const bad = await q.post('/api/agents', { name: '', kind: 'ctv', commissionPct: 5 });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'bad_agent');
  assert.equal(typeof bad.json.error.message, 'string');
  const boom = await new Api(srv).get('/boom');
  assert.equal(boom.status, 500);
  assert.equal(boom.json.error.code, 'internal');
  assert.ok(!boom.text.includes('bí mật'));
});

test('mã mời: quản lý tạo, người ngoài dùng một lần để thành lễ tân; dùng lại bị từ chối; lễ tân không tạo được mã', async () => {
  const q = as(srv, w, 'quanly');
  const inv = await q.post('/api/invites', { role: 'letan' });
  assert.equal(inv.status, 200);
  assert.match(inv.json.code, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  const u1 = new Api(srv, crypto.randomUUID());
  const ok = await u1.post('/api/invites/redeem', { code: inv.json.code });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.member.role, 'letan');
  assert.equal((await u1.get('/api/me')).json.member.role, 'letan');
  assert.equal((await u1.get('/api/bookings')).status, 200);
  const u2 = new Api(srv, crypto.randomUUID());
  const again = await u2.post('/api/invites/redeem', { code: inv.json.code });
  assert.equal(again.status, 400);
  assert.equal(again.json.error.code, 'invite_invalid');
  assert.equal((await u1.post('/api/invites', { role: 'letan' })).status, 403);
  assert.equal((await q.post('/api/invites', { role: 'vua' })).json.error.code, 'bad_invite');
  assert.equal((await q.post('/api/invites', { role: 'chu' })).json.error.code, 'bad_invite');
  const mine = await q.post('/api/invites', { role: 'chu', ownerId: w.lan.ownerId });
  assert.equal(mine.status, 200);
});

test('dùng mã mời khi chưa đăng nhập 9id: 401; hạn mức dò mã: vượt thì 429', async () => {
  assert.equal((await new Api(srv).post('/api/invites/redeem', { code: 'ABCD-EFGH-IJKL-MNOP' })).status, 401);
  const tight = await startServer({ cfg: { ...config, redeemLimitPerMin: 3 } });
  try {
    const u = new Api(tight, crypto.randomUUID());
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await u.post('/api/invites/redeem', { code: 'AAAA-BBBB-CCCC-DDDD' })).status);
    assert.deepEqual(codes, [400, 400, 400, 429, 429]);
  } finally {
    await tight.close();
  }
});
