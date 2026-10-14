// Quyền truy cập theo tài khoản 9id (user_id) song song với phiên ẩn danh. 9id được giả bằng máy khách bơm vào.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, ok, db, Client, LISTING } from './helper.js';
import { setIdClient, flushCaches } from '../src/nine-session.js';

const people = {};
let down = false;
let seq = 0;
function mkUser(name) {
  seq++;
  const token = ('v' + seq).padEnd(43, String.fromCharCode(97 + (seq % 20)));
  const userId = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  people[token] = { userId, displayName: name };
  return { token, userId, name };
}
const verify = async (t) => { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; };

before(async () => { await boot(); setIdClient({ verify }); });
after(async () => { setIdClient(null); await shutdown(); });

const as = (user) => { const c = new Client(user ? 'dn' : 'an'); if (user) c.nine = user.token; return c; };
const members = (cid) => db.query('SELECT id, name, user_id, left_at, banned_at FROM members WHERE community_id=$1 ORDER BY seq', [cid]);
const phienCount = async (mid) => (await db.query('SELECT count(*)::int AS n FROM phien WHERE member_id=$1', [mid]))[0].n;

test('tạo cộng đồng khi đã đăng nhập: thành viên có user_id, không nối phiên ẩn danh; máy mới (không có swsid) thấy và thao tác đúng vai chủ', async () => {
  const lan = mkUser('Lan');
  const a1 = as(lan);
  const c = await ok(a1.post('/api/communities', { name: 'Tòa của Lan', kind: 'toa_nha', myName: 'Lan', agree: true }));
  assert.equal((await members(c.community.id))[0].user_id, lan.userId);
  assert.equal(await phienCount(c.memberId), 0, 'đăng nhập tạo thì không nối phiên ẩn danh của máy');
  const a2 = as(lan);                                  // máy khác, chưa có cookie ẩn danh
  assert.equal(a2.cookie, '');
  const list = await ok(a2.get('/api/me'));
  assert.deepEqual(list.communities.map((x) => x.id), [c.community.id]);
  await ok(a2.get('/api/c/' + c.community.id));
  await ok(a2.post('/api/c/' + c.community.id, { name: 'Đổi tên từ máy mới' }), 'chủ cộng đồng sửa từ máy mới');
  assert.equal((await ok(a2.get('/api/c/' + c.community.id))).community.name, 'Đổi tên từ máy mới');
  a1.nine = '';                                        // đăng xuất 9id: máy gốc mất quyền
  assert.equal((await a1.get('/api/c/' + c.community.id)).status, 404);
  assert.deepEqual((await ok(a1.get('/api/me'))).communities, []);
});

test('người dùng khác, cookie nine_sid giả/hết hạn, và máy không có gì: 404 như người ngoài', async () => {
  const u = mkUser('U'), other = mkUser('V');
  const c = await ok(as(u).post('/api/communities', { name: 'Riêng', kind: 'toa_nha', myName: 'U', agree: true }));
  const forged = new Client('giả'); forged.nine = 'x'.repeat(43);
  for (const who of [as(other), forged, as(null)]) {
    assert.equal((await who.get('/api/c/' + c.community.id)).status, 404);
    assert.equal((await who.post('/api/c/' + c.community.id, { name: 'Chiếm' })).status, 404);
  }
  assert.deepEqual((await ok(as(other).get('/api/me'))).communities, []);
});

test('thành viên đã rời cộng đồng mất quyền dù còn user_id', async () => {
  const mk = await makeCommunity(['Chủ']);
  const u = mkUser('Cúc');
  const d1 = as(u);
  await ok(d1.post('/api/join/' + mk.code, { name: 'Cúc', agree: true }));
  const d2 = as(u);
  assert.equal((await ok(d2.get('/api/me'))).communities.length, 1);
  await ok(d2.post(`/api/c/${mk.cid}/leave`), 'rời từ máy khác');
  assert.equal((await d2.get('/api/c/' + mk.cid)).status, 404);
  assert.deepEqual((await ok(d2.get('/api/me'))).communities, []);
  assert.equal((await d1.get('/api/c/' + mk.cid)).status, 404);
});

test('gia nhập khi đã là thành viên qua tài khoản: dùng lại, không tạo trùng, không nối phiên máy dùng chung', async () => {
  const mk = await makeCommunity(['Chủ']);
  const u = mkUser('Dung');
  const m1 = as(u);
  const j1 = await ok(m1.post('/api/join/' + mk.code, { name: 'Dung', agree: true }));
  const shared = new Client('máy dùng chung');                                   // máy này đã có phiên ẩn danh riêng
  await ok(shared.post('/api/communities', { name: 'Của người khác', kind: 'toa_nha', myName: 'Ai đó', agree: true }));
  shared.nine = u.token;
  const j2 = await ok(shared.post('/api/join/' + mk.code, { name: 'Dung máy hai', agree: true }));
  assert.equal(j2.already, true);
  assert.equal(j2.memberId, j1.memberId);
  assert.equal((await members(mk.cid)).filter((x) => x.user_id === u.userId).length, 1);
  assert.equal(await phienCount(j1.memberId), 0);
  assert.equal((await ok(shared.get('/api/join/' + mk.code))).alreadyMember, true);
  shared.nine = '';                                                              // đăng xuất
  assert.equal((await shared.get('/api/c/' + mk.cid)).status, 404, 'máy dùng chung không giữ quyền sau khi đăng xuất');
});

test('hai yêu cầu gia nhập đồng thời cùng một người dùng: chỉ một thành viên, không 500', async () => {
  const mk = await makeCommunity(['Chủ']);
  const u = mkUser('Em');
  const [r1, r2] = await Promise.all([as(u).post('/api/join/' + mk.code, { name: 'Em', agree: true }), as(u).post('/api/join/' + mk.code, { name: 'Em khác', agree: true })]);
  assert.ok(r1.status < 300 && r2.status < 300, `${r1.status} ${r2.status}`);
  assert.equal((await members(mk.cid)).filter((x) => x.user_id === u.userId && !x.left_at).length, 1);
  assert.equal(r1.json.memberId, r2.json.memberId);
});

test('9id lỗi: cộng đồng ẩn danh vẫn dùng bình thường (không 5xx); máy chỉ có nine_sid thì chưa thấy gì', async () => {
  const mk = await makeCommunity(['Chủ', 'An']);
  const u = mkUser('Giang');
  down = true; flushCaches();
  try {
    const chu = mk.by['Chủ'];
    chu.nine = u.token;
    assert.equal((await ok(chu.get('/api/me'))).communities.length, 1);
    await ok(chu.get('/api/c/' + mk.cid));
    await ok(chu.post('/api/c/' + mk.cid, { name: 'Vẫn sửa được' }));
    assert.deepEqual((await ok(as(u).get('/api/me'))).communities, []);
  } finally { down = false; flushCaches(); }
});

test('tắt tích hợp (không máy khách 9id): hành vi ẩn danh cũ, cookie nine_sid bị bỏ qua', async () => {
  const mk = await makeCommunity(['Chủ']);
  const u = mkUser('Hoa');
  setIdClient(null);
  try {
    const c = as(u);
    assert.equal((await c.get('/api/c/' + mk.cid)).status, 404);
    assert.deepEqual((await ok(c.get('/api/me'))).communities, []);
    await ok(mk.by['Chủ'].get('/api/c/' + mk.cid));
  } finally { setIdClient({ verify }); }
});

test('máy có cả thành viên ẩn danh lẫn thành viên tài khoản ở cùng cộng đồng: chọn xác định (ưu tiên tài khoản), một dòng mỗi cộng đồng', async () => {
  for (const order of ['anon-truoc', 'tai-khoan-truoc']) {
    const u = mkUser('Quỳnh ' + order);
    const mk = await makeCommunity(['Chủ']);
    const acct = as(u);
    const dev = new Client('hai danh tính');
    let anonId, acctId;
    if (order === 'anon-truoc') {
      anonId = (await ok(dev.post('/api/join/' + mk.code, { name: 'Quỳnh máy cũ', agree: true }))).memberId;
      acctId = (await ok(acct.post('/api/join/' + mk.code, { name: 'Quỳnh điện thoại', agree: true }))).memberId;
    } else {
      acctId = (await ok(acct.post('/api/join/' + mk.code, { name: 'Quỳnh điện thoại', agree: true }))).memberId;
      anonId = (await ok(dev.post('/api/join/' + mk.code, { name: 'Quỳnh máy cũ', agree: true }))).memberId;
    }
    dev.nine = u.token;
    const rows = (await ok(dev.get('/api/me'))).communities.filter((x) => x.id === mk.cid);
    assert.equal(rows.length, 1, `${order}: mỗi cộng đồng một dòng`);
    assert.equal(rows[0].memberId, acctId, `${order}: ưu tiên thành viên của tài khoản`);
    dev.nine = '';
    assert.equal((await ok(dev.get('/api/me'))).communities.filter((x) => x.id === mk.cid)[0].memberId, anonId);
  }
});

// ---------- riêng 9swap: thành viên bị khóa ----------
test('thành viên có user_id bị khóa: khóa theo người ở mọi máy; gia nhập lại bằng mã vẫn 403; mở khóa thì dùng lại được', async () => {
  const mk = await makeCommunity(['Chủ']);
  const u = mkUser('Khoa');
  const d1 = as(u);
  const j = await ok(d1.post('/api/join/' + mk.code, { name: 'Khoa', agree: true }));
  await db.query('UPDATE members SET banned_at=now() WHERE id=$1', [j.memberId]);     // chủ khóa
  const d2 = as(u);                                                                    // máy mới, cùng tài khoản
  const me = await ok(d2.get('/api/me'));
  assert.equal(me.communities.find((x) => x.id === mk.cid).banned, true);
  const view = await ok(d2.get('/api/c/' + mk.cid));                                   // chỉ đọc được thông báo khóa
  assert.ok(view.community);
  const act = await d2.post(`/api/c/${mk.cid}/listings`, LISTING());
  assert.equal(act.status, 403);
  assert.equal(act.json.error.code, 'banned');
  for (const dev of [d1, d2, as(u)]) {
    const again = await dev.post('/api/join/' + mk.code, { name: 'Khoa lại', agree: true });
    assert.equal(again.status, 403, 'gia nhập lại bằng mã trên mọi máy vẫn bị khóa');
  }
  await db.query('UPDATE members SET banned_at=NULL WHERE id=$1', [j.memberId]);     // mở khóa
  await ok(d2.post(`/api/c/${mk.cid}/listings`, LISTING()));
});
