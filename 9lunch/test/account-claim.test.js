// GET /api/account và POST /api/account/claim: nhận nhóm ẩn danh trên máy này vào tài khoản 9id. 9id được giả bằng máy khách bơm vào.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeTeam, ok, db, Client, config } from './helper.js';
import { setIdClient, flushCaches } from '../src/nine-session.js';

const people = {};
let down = false;
let seq = 0;
// người dùng 9id mới: token 43 ký tự + userId UUID
function mkUser(name) {
  seq++;
  const token = ('u' + seq).padEnd(43, String.fromCharCode(97 + (seq % 20)));
  const userId = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  people[token] = { userId, displayName: name };
  return { token, userId, name };
}
const verify = async (t) => { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; };
before(async () => { await boot(); setIdClient({ verify }); });
after(async () => { setIdClient(null); await shutdown(); });

const device = (user) => { const c = new Client('máy'); if (user) c.nine = user.token; return c; };
const mem = (id) => db.query('SELECT id, name, user_id, left_at, team_id FROM members WHERE team_id=$1 ORDER BY seq', [id]);

test('tắt tích hợp: GET báo enabled:false, claim trả 404, không đổi gì', async () => {
  setIdClient(null);
  try {
    const c = new Client('x');
    await ok(c.post('/api/teams', { name: 'N', myName: 'A' }));
    const g = await ok(c.get('/api/account'));
    assert.deepEqual(g, { enabled: false, loggedIn: false, idDown: false, user: null, loginPath: config.nineIdPublicPath, claimable: [], conflicts: [] });
    assert.equal((await c.post('/api/account/claim')).status, 404);
  } finally { setIdClient({ verify }); }
});

test('chưa đăng nhập: enabled:true, loggedIn:false, claim 401 kèm đường dẫn đăng nhập', async () => {
  const c = new Client('an');
  await ok(c.post('/api/teams', { name: 'N', myName: 'A' }));
  const g = await ok(c.get('/api/account'));
  assert.equal(g.enabled, true); assert.equal(g.loggedIn, false); assert.equal(g.user, null); assert.deepEqual(g.claimable, []);
  const r = await c.post('/api/account/claim');
  assert.equal(r.status, 401);
  assert.equal(r.json.error.details.login, config.nineIdPublicPath);
});

test('đã đăng nhập: claimable chỉ gồm thành viên của PHIÊN NÀY; claim gắn user_id, idempotent, máy mới thấy nhóm', async () => {
  const lan = mkUser('Lan');
  const anon = new Client('anon');
  const t1 = await ok(anon.post('/api/teams', { name: 'Nhóm một', myName: 'Lan' }));
  const t2 = await ok(anon.post('/api/teams', { name: 'Nhóm hai', myName: 'Lan' }));
  const other = new Client('người khác');            // phiên khác trên cùng CSDL: không được lộ
  const t3 = await ok(other.post('/api/teams', { name: 'Của người khác', myName: 'Ai đó' }));
  anon.nine = lan.token;
  const g = await ok(anon.get('/api/account'));
  assert.equal(g.loggedIn, true);
  assert.equal(g.user.displayName, 'Lan');
  assert.deepEqual(Object.keys(g.user), ['displayName'], 'không lộ id hay số điện thoại');
  assert.deepEqual(g.claimable.map((x) => x.teamName).sort(), ['Nhóm hai', 'Nhóm một']);
  assert.ok(!JSON.stringify(g).includes('Của người khác'));
  const c1 = await ok(anon.post('/api/account/claim'));
  assert.deepEqual(c1.claimed.map((x) => x.teamName).sort(), ['Nhóm hai', 'Nhóm một']);
  assert.deepEqual(c1.skipped, []);
  assert.deepEqual((await mem(t1.team.id)).map((m) => m.user_id), [lan.userId]);
  assert.deepEqual((await mem(t3.team.id)).map((m) => m.user_id), [null], 'nhóm của người khác không bị đụng');
  const c2 = await ok(anon.post('/api/account/claim'));
  assert.deepEqual(c2.claimed, [], 'idempotent');
  assert.deepEqual((await ok(anon.get('/api/account'))).claimable, []);
  const newDevice = device(lan);                      // máy mới, chưa có lsid
  assert.deepEqual((await ok(newDevice.get('/api/me'))).teams.map((x) => x.id).sort(), [t1.team.id, t2.team.id].sort());
});

test('xung đột cùng nhóm: người dùng đã có thành viên ở nhóm đó thì bỏ qua và báo, thành viên ẩn danh giữ nguyên', async () => {
  const mai = mkUser('Mai');
  const mk = await makeTeam(['Chủ']);
  const dev1 = device(mai);
  const j = await ok(dev1.post('/api/join/' + mk.code, { name: 'Mai' }));       // đã đăng nhập: có user_id
  const anon = new Client('anon');                                              // cùng người, máy cũ chưa đăng nhập
  const j2 = await ok(anon.post('/api/join/' + mk.code, { name: 'Mai cũ' }));   // thành viên ẩn danh thứ hai ở cùng nhóm
  assert.notEqual(j2.memberId, j.memberId);
  anon.nine = mai.token;
  const g = await ok(anon.get('/api/account'));
  assert.deepEqual(g.claimable, []);
  assert.deepEqual(g.conflicts.map((x) => x.teamId), [mk.teamId]);
  const r = await ok(anon.post('/api/account/claim'));
  assert.deepEqual(r.claimed, []);
  assert.equal(r.skipped[0].reason, 'da_co_thanh_vien');
  const rows = await mem(mk.teamId);
  assert.equal(rows.find((m) => m.id === j2.memberId).user_id, null);
});

test('không bao giờ chiếm thành viên đã có user_id khác, hay đã rời nhóm', async () => {
  const x = mkUser('X'), y = mkUser('Y');
  const anon = new Client('anon');
  const t = await ok(anon.post('/api/teams', { name: 'Chung máy', myName: 'Người A' }));
  const t2 = await ok(anon.post('/api/teams', { name: 'Đã rời', myName: 'Người A' }));
  await db.query('UPDATE members SET user_id=$2 WHERE id=$1', [t.memberId, x.userId]);          // đã thuộc X
  await db.query('UPDATE members SET left_at=now() WHERE id=$1', [t2.memberId]);               // đã rời
  anon.nine = y.token;
  const g = await ok(anon.get('/api/account'));
  assert.deepEqual(g.claimable, []);
  const r = await ok(anon.post('/api/account/claim'));
  assert.deepEqual(r.claimed, []);
  assert.equal((await mem(t.team.id))[0].user_id, x.userId);
  assert.equal((await mem(t2.team.id))[0].user_id, null);
});

test('hai yêu cầu claim đồng thời: không lỗi, mỗi thành viên chỉ nhận một lần', async () => {
  const z = mkUser('Z');
  const anon = new Client('anon');
  const ts = [];
  for (let i = 0; i < 3; i++) ts.push(await ok(anon.post('/api/teams', { name: 'N' + i, myName: 'Z' })));
  anon.nine = z.token;
  const rs = await Promise.all([anon.post('/api/account/claim'), anon.post('/api/account/claim'), anon.post('/api/account/claim')]);
  for (const r of rs) assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(rs.reduce((n, r) => n + r.json.claimed.length, 0), 3, 'tổng số nhận đúng 3');
  for (const t of ts) assert.equal((await mem(t.team.id))[0].user_id, z.userId);
});

test('9id lỗi: GET báo idDown, claim 503, nhóm ẩn danh vẫn dùng được', async () => {
  const w = mkUser('W');
  const anon = new Client('anon');
  const t = await ok(anon.post('/api/teams', { name: 'N', myName: 'W' }));
  anon.nine = w.token;
  down = true; flushCaches();
  try {
    const g = await ok(anon.get('/api/account'));
    assert.equal(g.enabled, true); assert.equal(g.loggedIn, false); assert.equal(g.idDown, true);
    assert.equal((await anon.post('/api/account/claim')).status, 503);
    await ok(anon.get('/api/teams/' + t.team.id));
  } finally { down = false; flushCaches(); }
  assert.equal((await mem(t.team.id))[0].user_id, null, 'không đổi gì khi 9id lỗi');
});

test('tên hiển thị chứa HTML được trả nguyên văn (giao diện chỉ dùng textContent)', async () => {
  const h = mkUser('<img src=x onerror=alert(1)>');
  const c = device(h);
  const g = await ok(c.get('/api/account'));
  assert.equal(g.user.displayName, '<img src=x onerror=alert(1)>');
});

test('chưa có phiên ẩn danh (máy mới) nhưng đã đăng nhập: claimable rỗng, claim không lỗi', async () => {
  const v = mkUser('V');
  const c = device(v);
  assert.deepEqual((await ok(c.get('/api/account'))).claimable, []);
  assert.deepEqual(await ok(c.post('/api/account/claim')), { claimed: [], skipped: [] });
});
