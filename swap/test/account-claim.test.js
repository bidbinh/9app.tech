// GET /api/account và POST /api/account/claim: nhận cộng đồng ẩn danh trên máy này vào tài khoản 9id. 9id được giả bằng máy khách bơm vào.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, ok, db, Client, config } from './helper.js';
import { setIdClient, flushCaches } from '../src/nine-session.js';

const people = {};
let down = false;
let seq = 0;
function mkUser(name) {
  seq++;
  const token = ('w' + seq).padEnd(43, String.fromCharCode(97 + (seq % 20)));
  const userId = `00000000-0000-4000-8000-${String(seq + 500).padStart(12, '0')}`;
  people[token] = { userId, displayName: name };
  return { token, userId, name };
}
const verify = async (t) => { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; };
before(async () => { await boot(); setIdClient({ verify }); });
after(async () => { setIdClient(null); await shutdown(); });

const device = (user) => { const c = new Client('máy'); if (user) c.nine = user.token; return c; };
const mem = (cid) => db.query('SELECT id, name, user_id, left_at, banned_at FROM members WHERE community_id=$1 ORDER BY seq', [cid]);
const mk = (c, name, myName = 'A') => c.post('/api/communities', { name, kind: 'toa_nha', myName, agree: true });

test('tắt tích hợp: GET báo enabled:false, claim trả 404, không đổi gì', async () => {
  setIdClient(null);
  try {
    const c = new Client('x');
    await ok(mk(c, 'Cộng đồng N'));
    const g = await ok(c.get('/api/account'));
    assert.deepEqual(g, { enabled: false, loggedIn: false, idDown: false, user: null, loginPath: config.nineIdPublicPath, claimable: [], conflicts: [] });
    assert.equal((await c.post('/api/account/claim')).status, 404);
  } finally { setIdClient({ verify }); }
});

test('chưa đăng nhập: enabled:true, loggedIn:false, claim 401 kèm đường dẫn đăng nhập', async () => {
  const c = new Client('an');
  await ok(mk(c, 'Cộng đồng N'));
  const g = await ok(c.get('/api/account'));
  assert.equal(g.enabled, true); assert.equal(g.loggedIn, false); assert.equal(g.user, null); assert.deepEqual(g.claimable, []);
  const r = await c.post('/api/account/claim');
  assert.equal(r.status, 401);
  assert.equal(r.json.error.details.login, config.nineIdPublicPath);
});

test('đã đăng nhập: claimable chỉ gồm thành viên của PHIÊN NÀY; claim gắn user_id, idempotent, máy mới thấy cộng đồng', async () => {
  const lan = mkUser('Lan');
  const anon = new Client('anon');
  const c1 = await ok(mk(anon, 'Cộng đồng một', 'Lan'));
  const c2 = await ok(mk(anon, 'Cộng đồng hai', 'Lan'));
  const other = new Client('người khác');
  const c3 = await ok(mk(other, 'Của người khác', 'Ai đó'));
  anon.nine = lan.token;
  const g = await ok(anon.get('/api/account'));
  assert.equal(g.loggedIn, true);
  assert.deepEqual(Object.keys(g.user), ['displayName'], 'không lộ id hay số điện thoại');
  assert.deepEqual(g.claimable.map((x) => x.communityName).sort(), ['Cộng đồng hai', 'Cộng đồng một']);
  assert.ok(!JSON.stringify(g).includes('Của người khác'));
  const r1 = await ok(anon.post('/api/account/claim'));
  assert.deepEqual(r1.claimed.map((x) => x.communityName).sort(), ['Cộng đồng hai', 'Cộng đồng một']);
  assert.deepEqual(r1.skipped, []);
  assert.deepEqual((await mem(c1.community.id)).map((m) => m.user_id), [lan.userId]);
  assert.deepEqual((await mem(c3.community.id)).map((m) => m.user_id), [null], 'cộng đồng của người khác không bị đụng');
  assert.deepEqual((await ok(anon.post('/api/account/claim'))).claimed, [], 'idempotent');
  assert.deepEqual((await ok(anon.get('/api/account'))).claimable, []);
  assert.deepEqual((await ok(device(lan).get('/api/me'))).communities.map((x) => x.id).sort(), [c1.community.id, c2.community.id].sort());
});

test('xung đột cùng cộng đồng: người dùng đã có thành viên ở đó thì bỏ qua và báo, thành viên ẩn danh giữ nguyên', async () => {
  const mai = mkUser('Mai');
  const com = await makeCommunity(['Chủ']);
  const dev1 = device(mai);
  const j = await ok(dev1.post('/api/join/' + com.code, { name: 'Mai', agree: true }));
  const anon = new Client('anon');
  const j2 = await ok(anon.post('/api/join/' + com.code, { name: 'Mai cũ', agree: true }));
  assert.notEqual(j2.memberId, j.memberId);
  anon.nine = mai.token;
  const g = await ok(anon.get('/api/account'));
  assert.deepEqual(g.claimable, []);
  assert.deepEqual(g.conflicts.map((x) => x.communityId), [com.cid]);
  const r = await ok(anon.post('/api/account/claim'));
  assert.deepEqual(r.claimed, []);
  assert.equal(r.skipped[0].reason, 'da_co_thanh_vien');
  assert.equal((await mem(com.cid)).find((m) => m.id === j2.memberId).user_id, null);
});

test('không bao giờ chiếm thành viên đã có user_id khác, hay đã rời cộng đồng', async () => {
  const x = mkUser('X'), y = mkUser('Y');
  const anon = new Client('anon');
  const a = await ok(mk(anon, 'Chung máy', 'Người A'));
  const b = await ok(mk(anon, 'Đã rời', 'Người A'));
  await db.query('UPDATE members SET user_id=$2 WHERE id=$1', [a.memberId, x.userId]);
  await db.query('UPDATE members SET left_at=now() WHERE id=$1', [b.memberId]);
  anon.nine = y.token;
  assert.deepEqual((await ok(anon.get('/api/account'))).claimable, []);
  assert.deepEqual((await ok(anon.post('/api/account/claim'))).claimed, []);
  assert.equal((await mem(a.community.id))[0].user_id, x.userId);
  assert.equal((await mem(b.community.id))[0].user_id, null);
});

test('hai yêu cầu claim đồng thời: không lỗi, mỗi thành viên chỉ nhận một lần', async () => {
  const z = mkUser('Z');
  const anon = new Client('anon');
  const cs = [];
  for (let i = 0; i < 3; i++) cs.push(await ok(mk(anon, 'CD' + i, 'Z')));
  anon.nine = z.token;
  const rs = await Promise.all([anon.post('/api/account/claim'), anon.post('/api/account/claim'), anon.post('/api/account/claim')]);
  for (const r of rs) assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(rs.reduce((n, r) => n + r.json.claimed.length, 0), 3);
  for (const c of cs) assert.equal((await mem(c.community.id))[0].user_id, z.userId);
});

test('9id lỗi: GET báo idDown, claim 503, cộng đồng ẩn danh vẫn dùng được', async () => {
  const w = mkUser('W');
  const anon = new Client('anon');
  const c = await ok(mk(anon, 'Cộng đồng W', 'W'));
  anon.nine = w.token;
  down = true; flushCaches();
  try {
    const g = await ok(anon.get('/api/account'));
    assert.equal(g.enabled, true); assert.equal(g.loggedIn, false); assert.equal(g.idDown, true);
    assert.equal((await anon.post('/api/account/claim')).status, 503);
    await ok(anon.get('/api/c/' + c.community.id));
  } finally { down = false; flushCaches(); }
  assert.equal((await mem(c.community.id))[0].user_id, null);
});

test('tên hiển thị chứa HTML được trả nguyên văn (giao diện chỉ dùng textContent)', async () => {
  const h = mkUser('<img src=x onerror=alert(1)>');
  assert.equal((await ok(device(h).get('/api/account'))).user.displayName, '<img src=x onerror=alert(1)>');
});

test('chưa có phiên ẩn danh (máy mới) nhưng đã đăng nhập: claimable rỗng, claim không lỗi', async () => {
  const v = mkUser('V');
  const c = device(v);
  assert.deepEqual((await ok(c.get('/api/account'))).claimable, []);
  assert.deepEqual(await ok(c.post('/api/account/claim')), { claimed: [], skipped: [] });
});

// ---------- riêng 9swap: thành viên bị khóa ----------
test('nhận thành viên đang bị khóa vào tài khoản: khóa giữ nguyên và theo người sang máy khác', async () => {
  const k = mkUser('K');
  const com = await makeCommunity(['Chủ']);
  const anon = new Client('anon');
  const j = await ok(anon.post('/api/join/' + com.code, { name: 'Kẻ vi phạm', agree: true }));
  await db.query('UPDATE members SET banned_at=now() WHERE id=$1', [j.memberId]);     // chủ khóa thành viên ẩn danh
  anon.nine = k.token;
  assert.deepEqual((await ok(anon.get('/api/account'))).claimable.map((x) => x.communityId), [com.cid], 'thành viên bị khóa vẫn nhận được');
  assert.deepEqual((await ok(anon.post('/api/account/claim'))).claimed.map((x) => x.communityId), [com.cid]);
  const row = (await mem(com.cid)).find((m) => m.id === j.memberId);
  assert.equal(row.user_id, k.userId);
  assert.ok(row.banned_at, 'khóa giữ nguyên sau khi nhận');
  const other = device(k);                                                            // máy khác cùng tài khoản
  assert.equal((await ok(other.get('/api/me'))).communities[0].banned, true);
  assert.equal((await other.post('/api/join/' + com.code, { name: 'Lại', agree: true })).status, 403);
});
