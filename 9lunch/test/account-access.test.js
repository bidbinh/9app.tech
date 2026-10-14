// Quyền truy cập theo tài khoản 9id (user_id) song song với phiên ẩn danh. 9id được giả bằng máy khách bơm vào.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeTeam, ok, db, Client } from './helper.js';
import { setIdClient, flushCaches } from '../src/nine-session.js';

const UA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TA = 'a'.repeat(43), TB = 'b'.repeat(43), TC = 'c'.repeat(43), TX = 'x'.repeat(43);
const people = { [TA]: { userId: UA, displayName: 'Lan' }, [TB]: { userId: UB, displayName: 'Bình' }, [TC]: { userId: UC, displayName: 'Cúc' } };
let down = false;

before(async () => {
  await boot();
  setIdClient({ async verify(t) { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; } });
});
after(async () => { setIdClient(null); await shutdown(); });

const as = (token) => { const c = new Client(token ? 'dn' : 'an'); if (token) c.nine = token; return c; };
const members = (teamId) => db.query('SELECT id, name, user_id, left_at FROM members WHERE team_id=$1 ORDER BY seq', [teamId]);

test('tạo nhóm khi đã đăng nhập: thành viên có user_id; máy mới (không có lsid) chỉ cần nine_sid là thấy và thao tác đúng vai chủ', async () => {
  const a1 = as(TA);
  const t = await ok(a1.post('/api/teams', { name: 'Nhóm Lan', myName: 'Lan' }), 'tạo nhóm');
  assert.equal((await members(t.team.id))[0].user_id, UA);
  const a2 = as(TA);                               // máy khác: chưa có cookie lsid
  assert.equal(a2.cookie, '');
  const list = await ok(a2.get('/api/me'));
  assert.deepEqual(list.teams.map((x) => x.id), [t.team.id], 'danh sách nhóm hiện theo tài khoản');
  const view = await ok(a2.get('/api/teams/' + t.team.id));
  assert.equal(view.me.role, 'chu');
  await ok(a2.post('/api/teams/' + t.team.id, { name: 'Đổi tên từ máy mới' }), 'chủ nhóm sửa từ máy mới');
  assert.equal((await ok(a2.get('/api/teams/' + t.team.id))).team.name, 'Đổi tên từ máy mới');
});

test('người dùng khác, cookie nine_sid giả/hết hạn, và máy không có gì: 404 như người ngoài', async () => {
  const a1 = as(TA);
  const t = await ok(a1.post('/api/teams', { name: 'Riêng', myName: 'Lan' }));
  for (const who of [as(TB), as(TX), as(null)]) {
    assert.equal((await who.get('/api/teams/' + t.team.id)).status, 404);
    assert.equal((await who.post('/api/teams/' + t.team.id, { name: 'Chiếm' })).status, 404);
  }
  assert.deepEqual((await ok(as(TB).get('/api/me'))).teams, []);
  assert.deepEqual((await ok(as(null).get('/api/me'))).teams, []);
});

test('thành viên đã rời nhóm mất quyền dù còn user_id', async () => {
  const mk = await makeTeam(['Chủ', 'Dương']);
  const duong = as(TC);
  await ok(duong.post('/api/join/' + mk.code, { name: 'Lan' }), 'Lan vào nhóm khi đã đăng nhập');
  const lan2 = as(TC);                             // máy khác của Lan
  assert.equal((await ok(lan2.get('/api/me'))).teams.length, 1);
  await ok(lan2.post(`/api/teams/${mk.teamId}/leave`), 'rời nhóm từ máy khác');
  assert.equal((await lan2.get('/api/teams/' + mk.teamId)).status, 404);
  assert.deepEqual((await ok(lan2.get('/api/me'))).teams, []);
  assert.equal((await duong.get('/api/teams/' + mk.teamId)).status, 404, 'máy gốc cũng mất quyền');
});

test('gia nhập bằng mã khi đã là thành viên qua tài khoản: dùng lại thành viên cũ, không tạo trùng', async () => {
  const mk = await makeTeam(['Chủ']);
  const m1 = as(TB);
  const j1 = await ok(m1.post('/api/join/' + mk.code, { name: 'Bình' }));
  const m2 = as(TB);                               // máy khác, bấm lại link mời
  const j2 = await ok(m2.post('/api/join/' + mk.code, { name: 'Bình máy hai' }));
  assert.equal(j2.already, true);
  assert.equal(j2.memberId, j1.memberId);
  assert.equal((await members(mk.teamId)).filter((x) => x.user_id === UB).length, 1);
  assert.equal((await ok(m2.get('/api/join/' + mk.code))).alreadyMember, true, 'GET join cũng nhận ra qua tài khoản');
});

test('hai yêu cầu gia nhập đồng thời cùng một người dùng: chỉ một thành viên, không 500', async () => {
  const mk = await makeTeam(['Chủ']);
  const [r1, r2] = await Promise.all([as(TB).post('/api/join/' + mk.code, { name: 'Bình' }), as(TB).post('/api/join/' + mk.code, { name: 'Bình khác' })]);
  assert.ok(r1.status < 300 && r2.status < 300, `${r1.status} ${r2.status}`);
  assert.equal((await members(mk.teamId)).filter((x) => x.user_id === UB && !x.left_at).length, 1);
  assert.equal(r1.json.memberId, r2.json.memberId);
});

test('9id lỗi: nhóm ẩn danh vẫn dùng bình thường (không 5xx); máy chỉ có nine_sid thì chưa thấy gì', async () => {
  const mk = await makeTeam(['Chủ', 'An']);
  down = true; flushCaches();
  try {
    const chu = mk.by['Chủ'];
    chu.nine = TA;                                  // vừa có lsid vừa có nine_sid
    assert.equal((await ok(chu.get('/api/me'))).teams.length, 1);
    await ok(chu.get('/api/teams/' + mk.teamId));
    await ok(chu.post('/api/teams/' + mk.teamId, { round500: true }));
    const onlyNine = as(TA);
    assert.deepEqual((await ok(onlyNine.get('/api/me'))).teams, [], 'không có phiên ẩn danh và 9id lỗi: chưa nhận ra ai');
  } finally { down = false; flushCaches(); }
});

test('không có tích hợp 9id (máy khách tắt): hành vi ẩn danh cũ, cookie nine_sid bị bỏ qua', async () => {
  const mk = await makeTeam(['Chủ']);
  setIdClient(null);
  try {
    const c = as(TA);
    assert.equal((await c.get('/api/teams/' + mk.teamId)).status, 404);
    assert.deepEqual((await ok(c.get('/api/me'))).teams, []);
    await ok(mk.by['Chủ'].get('/api/teams/' + mk.teamId));
  } finally { setIdClient({ async verify(t) { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; } }); }
});
