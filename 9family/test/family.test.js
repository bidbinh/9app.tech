import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, ok, Client, newUser, clock, db, config, fake as _f, at } from './helper.js';
import * as H from './helper.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(() => { clock.set(null); });

const status = async (p) => (await p).status;

test('chưa đăng nhập: API trả 401 chuẩn kèm đường dẫn đăng nhập; trang tĩnh vẫn tải được', async () => {
  const c = new Client();
  const me = await c.get('/api/me');
  assert.equal(me.status, 401); assert.equal(me.json.error.code, 'unauthenticated'); assert.equal(me.json.error.details.login, '/id/');
  const fam = await makeFamily(['Mẹ']);
  for (const [m, p, b] of [['GET', fam.F], ['GET', fam.F + '/today'], ['POST', fam.F + '/tasks', { title: 'x' }], ['GET', fam.F + '/lists'], ['POST', fam.F + '/resync']]) {
    const r = await c.req(m, p, b); assert.equal(r.status, 401, `${m} ${p}`); assert.equal(r.json.error.code, 'unauthenticated');
  }
  assert.equal((await c.get('/api/config')).status, 200);
  assert.equal((await c.req('GET', '/', undefined, { raw: true })).status, 200);
  // cookie rác / cookie ẩn danh cũ (fsid) không có giá trị
  for (const ck of ['nine_sid=rác', 'nine_sid=' + 'A'.repeat(43), 'fsid=' + 'A'.repeat(43), 'nine_sid=' + 'A'.repeat(44)]) {
    const g = new Client(); g.cookie = ck;
    assert.equal((await g.get('/api/me')).status, 401, ck);
    assert.equal((await g.get(fam.F)).status, 401, ck);
  }
});

test('đăng nhập 9id: gia đình, vai trò, tên được đọc từ 9id; tên gia đình có thể trùng', async () => {
  const A = await makeFamily(['Mẹ Bình', 'Bố Tuấn'], { familyName: 'Nhà Cún', roles: { 'Bố Tuấn': 'quan_ly' } });
  const B = await makeFamily(['Mẹ Lan'], { familyName: 'Nhà Cún' });
  assert.notEqual(A.fid, B.fid);
  const core = await ok(A.owner.get(A.F));
  assert.equal(core.family.name, 'Nhà Cún'); assert.equal(core.me.role, 'chu'); assert.equal(core.me.name, 'Mẹ Bình');
  assert.equal(core.members.length, 2); assert.ok(core.members.every((m) => m.linked && !m.pending));
  assert.equal(core.caps.ai, true); assert.equal(core.caps.push, true);
  assert.deepEqual(core.family.esc, { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 });
  assert.equal((await ok(A.by['Bố Tuấn'].get(A.F))).me.role, 'quan_ly');
  const me = await ok(A.owner.get('/api/me'));
  assert.deepEqual(me.families.map((f) => [f.id, f.name, f.role]), [[A.fid, 'Nhà Cún', 'chu']]);
  assert.equal(me.user.displayName, 'Mẹ Bình'); assert.equal(me.legacy, false);
  // hai gia đình cùng tên vẫn tách bạch theo id
  assert.deepEqual((await ok(B.owner.get('/api/me'))).families.map((f) => f.id), [B.fid]);
  // id trong 9family là id của 9id
  assert.ok((await db.query('SELECT 1 FROM families WHERE id=$1', [A.fid])).length);
  assert.equal((await db.query('SELECT user_id FROM members WHERE id=$1', [A.ids['Mẹ Bình']]))[0].user_id, A.userIds['Mẹ Bình']);
});

test('CSRF: thiếu header hoặc sai Origin bị từ chối; GET không cần', async () => {
  const fam = await makeFamily(['Mẹ']);
  assert.equal(await status(fam.owner.post(fam.F + '/tasks', { title: 'x' }, { csrf: false })), 403);
  assert.equal(await status(fam.owner.post(fam.F + '/tasks', { title: 'x' }, { origin: 'https://evil.example' })), 403);
  assert.equal(await status(fam.owner.get('/api/me')), 200);
  assert.equal(await status(fam.owner.req('GET', '/healthz')), 200);
});

test('đồng bộ 9id -> 9family: đổi tên, đổi vai trò, thêm/bớt người, chuyển quyền chủ', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội']);
  const f = fam.fake;
  f.rename(fam.userIds['Bố'], 'Bố Tuấn Anh'); f.renameFamily(fam.fid, 'Nhà Cây Sồi');
  let core = await ok(fam.owner.get(fam.F));
  assert.equal(core.family.name, 'Nhà Cây Sồi'); assert.ok(core.members.some((m) => m.name === 'Bố Tuấn Anh'));
  f.setRole(fam.fid, fam.userIds['Bố'], 'quan_ly');
  assert.equal((await ok(fam.by['Bố'].get(fam.F))).me.role, 'quan_ly');
  // người mới
  const nu = f.signup('Cô Ba'); f.addMember(fam.fid, nu.userId, 'thanh_vien');
  const cb = new Client().loginAs(nu.token);
  const meCb = (await ok(cb.get(fam.F))).me;
  assert.equal(meCb.name, 'Cô Ba'); assert.equal(meCb.role, 'thanh_vien');
  // chuyển quyền chủ ở 9id: đúng một chủ ở 9family
  f.setRole(fam.fid, fam.userIds['Bố'], 'chu');
  assert.equal((await ok(fam.by['Bố'].get(fam.F))).me.role, 'chu');
  assert.equal((await ok(fam.owner.get(fam.F))).me.role, 'quan_ly');
  assert.equal((await db.query("SELECT count(*)::int n FROM members WHERE family_id=$1 AND role='chu' AND left_at IS NULL", [fam.fid]))[0].n, 1);
  // bà nội bị mời ra: ca bà phụ trách trở về chưa gán, 404 ngay với bà
  const kid = await addChild(fam);
  await ok(fam.by['Bố'].post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1, 2], time: '16:30', p0: fam.ids['Bà nội'], p1: fam.ids['Mẹ'] }));
  f.removeMember(fam.fid, fam.userIds['Bà nội']);
  assert.equal(await status(fam.by['Bà nội'].get(fam.F)), 404);
  await ok(fam.by['Bố'].get(fam.F));
  const rides = (await ok(fam.by['Bố'].get(`${fam.F}/rides`))).rides;
  assert.ok(rides.every((x) => x.p0 === null && x.p1 === fam.ids['Mẹ']));
  assert.ok(!(await ok(fam.by['Bố'].get(fam.F))).members.some((m) => m.name === 'Bà nội'));
  // quay lại sau khi bị mời ra: thành viên mới (không dùng lại hàng cũ)
  f.addMember(fam.fid, fam.userIds['Bà nội'], 'thanh_vien');
  const again = (await ok(fam.by['Bà nội'].get(fam.F))).me;
  assert.notEqual(again.id, fam.ids['Bà nội']);
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fam.fid, fam.userIds['Bà nội']]))[0].n, 1);
});

test('hồ sơ con: tên/năm sinh đọc từ 9id, trường/lớp/màu do 9family giữ; đổi tên ở 9id; lưu trữ ở 9id', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam, 'Bống', { birthYear: 2018, color: 'cam', school: 'Tiểu học Hoa Mai', grade: '3A', note: 'Chờ ở cổng B' });
  let core = await ok(fam.owner.get(fam.F));
  assert.equal(core.children[0].id, kid.id); assert.equal(core.children[0].name, 'Bống'); assert.equal(core.children[0].birthYear, 2018);
  assert.equal(core.children[0].school, 'Tiểu học Hoa Mai'); assert.equal(core.children[0].color, 'cam'); assert.equal(core.children[0].note, 'Chờ ở cổng B');
  fam.fake.renameChild(fam.fid, kid.id, 'Bống Bông');
  core = await ok(fam.owner.get(fam.F));
  assert.equal(core.children[0].name, 'Bống Bông'); assert.equal(core.children[0].school, 'Tiểu học Hoa Mai', 'phần mở rộng không mất');
  // tên/năm sinh/thêm/xóa con đi qua 9id
  for (const r of [await fam.owner.post(`${fam.F}/children/${kid.id}`, { name: 'Tên khác' }), await fam.owner.post(`${fam.F}/children/${kid.id}`, { birthYear: 2010 }), await fam.owner.post(`${fam.F}/children`, { name: 'Bé mới' }), await fam.owner.del(`${fam.F}/children/${kid.id}`)]) {
    assert.equal(r.status, 409); assert.equal(r.json.error.code, 'child_in_id');
  }
  // lưu trữ ở 9id: ẩn khỏi danh sách, bỏ khuôn đưa đón, giữ lịch sử
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Mẹ'] }));
  fam.fake.archiveChild(fam.fid, kid.id);
  core = await ok(fam.owner.get(fam.F));
  assert.equal(core.children.length, 0);
  assert.equal((await ok(fam.owner.get(`${fam.F}/rides`))).rides.length, 0, 'khuôn đưa đón của con đã lưu trữ không còn hiện');
  assert.equal((await db.query('SELECT count(*)::int n FROM rides WHERE child_id=$1', [kid.id]))[0].n, 1, 'nhưng chưa xóa ngay (khôi phục trong 7 ngày thì còn)');
  assert.equal((await db.query('SELECT count(*)::int n FROM children WHERE id=$1', [kid.id]))[0].n, 1, 'hồ sơ cục bộ còn (lịch sử)');
  assert.equal(await status(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [2], time: '16:30' })), 404);
  // con có ghi chú sức khỏe ở 9id: người lớn xem được, không nằm trong CSDL 9family
  const k2 = fam.fake.addChild(fam.fid, { name: 'Sóc', birthYear: 2020, note: 'Dị ứng đậu phộng' });
  core = await ok(fam.owner.get(fam.F));
  assert.equal(core.children.find((c) => c.id === k2.id).healthNote, 'Dị ứng đậu phộng');
  assert.equal((await db.query("SELECT count(*)::int n FROM children WHERE note LIKE '%đậu phộng%'"))[0].n, 0, 'ghi chú sức khỏe không được sao vào 9family');
});

test('phân quyền theo vai: thành viên thường, người quản lý, chủ', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội', 'Chú'], { roles: { 'Bố': 'quan_ly' } });
  const [me, bo, ba] = ['Mẹ', 'Bố', 'Bà nội'].map((n) => fam.by[n]);
  const kid = await addChild(fam);
  // người thường
  for (const [m, p, b] of [['post', `/children/${kid.id}`, { school: 'Đổi' }], ['post', '/members', { name: 'Ai đó', external: true }],
    ['post', '/settings', { esc: { t1: 40, t2: 20, t3: 10, t4: 5, after: 10 } }], ['post', '/rides', { childId: kid.id, dir: 'don', weekdays: [1], time: '16:00' }], ['post', '/timetable', {}]]) {
    assert.equal(await status(ba[m](fam.F + p, b)), 403, `${m} ${p}`);
  }
  assert.equal(await status(ba.del(`${fam.F}/members/${fam.ids['Chú']}`)), 403);
  // người thường sửa quan hệ của mình, không sửa người khác, không đổi tên/quyền (thuộc 9id)
  await ok(ba.post(`${fam.F}/members/${fam.ids['Bà nội']}`, { relation: 'ba' }));
  assert.equal(await status(ba.post(`${fam.F}/members/${fam.ids['Chú']}`, { relation: 'khac' })), 403);
  const rn = await ba.post(`${fam.F}/members/${fam.ids['Bà nội']}`, { name: 'Bà Nội Lan' });
  assert.equal(rn.status, 409); assert.equal(rn.json.error.code, 'managed_in_id');
  assert.equal((await ba.post(`${fam.F}/members/${fam.ids['Bà nội']}`, { role: 'quan_ly' })).json.error.code, 'managed_in_id');
  // người quản lý (Bố) đặt lịch, sửa thiết lập; không sửa chủ
  await ok(bo.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:00' }));
  await ok(bo.post(`${fam.F}/settings`, { esc: { t1: 45, t2: 30, t3: 15, t4: 8, after: 15 } }));
  assert.equal(await status(bo.post(`${fam.F}/members/${fam.ids['Mẹ']}`, { relation: 'khac' })), 403, 'không sửa chủ');
  assert.equal(await status(bo.del(`${fam.F}/members/${fam.ids['Mẹ']}`)), 409, 'người có tài khoản gỡ ở 9id');
  // đổi tên gia đình, mời người, chuyển quyền, xóa gia đình: thuộc 9id
  for (const [m, p, b] of [['post', '/settings', { name: 'Hack' }], ['post', '/members', { name: 'Cô', relation: 'khac' }]]) {
    const r = await me[m](fam.F + p, b);
    assert.equal(r.status, 409, `${m} ${p}`); assert.ok(['rename_in_id', 'invite_in_id'].includes(r.json.error.code));
  }
  for (const p of ['/leave', '/transfer', '/delete', '/devices', '/devices/link', '/recovery/reset']) {
    assert.equal(await status(me.post(fam.F + p, {})), 404, 'đã gỡ ' + p);
  }
  for (const p of ['/api/recover', '/api/families', '/api/invites/abc', '/api/invites/abc/accept']) {
    assert.ok([404, 405].includes(await status(me.post(p, {}))), 'đã gỡ ' + p);
  }
  assert.equal((await ok(ba.get(fam.F))).family.esc.t1, 45);
  // mốc leo thang phải giảm dần
  assert.equal(await status(me.post(`${fam.F}/settings`, { esc: { t1: 10, t2: 20, t3: 5, t4: 2, after: 10 } })), 400);
});

test('người ngoài gia đình nhận 404 cho mọi endpoint, không có IDOR; người chưa đăng nhập nhận 401', async () => {
  const A = await makeFamily(['Mẹ A', 'Bố A']);
  const B = await makeFamily(['Mẹ B']);
  const kid = await addChild(A, 'Bé A');
  const kidB = await addChild(B, 'Bé B');
  const ride = (await ok(A.owner.post(`${A.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1, 2, 3, 4, 5, 6, 7], time: '16:30', p0: A.ids['Mẹ A'] }))).ids[0];
  const day = (await ok(A.owner.get(`${A.F}/rides/board`))).rides[0];
  const ev = (await ok(A.owner.post(`${A.F}/events`, { title: 'Họp phụ huynh', startDate: '2026-10-10', start: '19:00', childIds: [kid.id] }))).event;
  const task = (await ok(A.owner.post(`${A.F}/tasks`, { title: 'Việc' }))).task;
  const shop = (await ok(A.owner.post(`${A.F}/shopping`, { text: 'Sữa' }))).items[0];
  const stranger = newUser('Người lạ').client;
  const anon = new Client();
  const calls = [
    ['GET', ''], ['GET', '/pulse'], ['GET', '/today'], ['GET', '/calendar?from=2026-10-01&to=2026-10-31'], ['GET', `/events/${ev.id}`], ['GET', '/rides'], ['GET', '/rides/board'], ['GET', '/rides/history'],
    ['GET', '/lists'], ['GET', '/notifications'], ['GET', '/ics'], ['GET', `/timetable/${kid.id}`], ['POST', '/resync'],
    ['POST', '/settings', { esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 } }], ['POST', '/children', { name: 'Con ngoài' }], ['POST', `/children/${kid.id}`, { school: 'x' }], ['DELETE', `/children/${kid.id}`],
    ['POST', '/members', { name: 'Kẻ lạ', external: true }], ['POST', `/members/${A.ids['Bố A']}`, { relation: 'bo' }], ['DELETE', `/members/${A.ids['Bố A']}`], [`POST`, `/members/${A.ids['Bố A']}/merge`, { into: A.ids['Mẹ A'] }],
    ['POST', '/rides', { childId: kid.id, dir: 'don', weekdays: [1], time: '10:00' }], ['POST', `/rides/${ride}`, { time: '10:00' }], ['DELETE', `/rides/${ride}`],
    ['POST', `/ride-days/${day.id}/claim`], ['POST', `/ride-days/${day.id}/done`], ['POST', `/ride-days/${day.id}/skip`], ['POST', `/ride-days/${day.id}/assign`, { memberId: A.ids['Bố A'] }],
    ['POST', `/rides/${ride}/days/2026-10-05/assign`, { memberId: A.ids['Bố A'] }],
    ['POST', '/events', { title: 'x', startDate: '2026-10-10', start: '10:00' }], ['POST', `/events/${ev.id}`, { title: 'x', startDate: '2026-10-10', start: '10:00' }], ['DELETE', `/events/${ev.id}`],
    ['POST', `/events/${ev.id}/exceptions`, { day: '2026-10-10', action: 'skip' }], ['POST', `/events/${ev.id}/end-from`, { day: '2026-10-10' }], ['POST', '/events/preview', { title: 'x', startDate: '2026-10-10', start: '10:00' }],
    ['POST', '/tasks', { title: 'x' }], ['POST', `/tasks/${task.id}`, { title: 'x' }], ['POST', `/tasks/${task.id}/done`], ['DELETE', `/tasks/${task.id}`],
    ['POST', '/shopping', { text: 'x' }], ['POST', `/shopping/${shop.id}/bought`], ['DELETE', `/shopping/${shop.id}`], ['POST', '/shopping/clear-bought'],
    ['POST', '/notifications/read'], ['POST', '/ics/reset'],
    ['POST', '/push/status', { endpoint: 'https://fcm.googleapis.com/x' }], ['POST', '/timetable/scan', { image: 'x' }], ['POST', '/timetable', { childId: kid.id }],
  ];
  for (const c of [stranger, B.owner]) {
    for (const [m, p, b] of calls) {
      const r = await c.req(m, `${A.F}${p}`, m === 'GET' ? undefined : (b || {}));
      assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`);
      assert.ok(!r.text.includes('Bé A') && !r.text.includes('Họp phụ huynh') && !r.text.includes('Mẹ A'), 'không lộ nội dung');
    }
  }
  for (const [m, p, b] of calls) assert.equal((await anon.req(m, `${A.F}${p}`, m === 'GET' ? undefined : (b || {}))).status, 401, `ẩn danh ${m} ${p}`);
  // thành viên gia đình B dùng id của gia đình A trong gia đình B: không với tới được
  const own = B.F;
  assert.equal(await status(B.owner.post(`${own}/children/${kid.id}`, { school: 'x' })), 404);
  assert.equal(await status(B.owner.post(`${own}/rides/${ride}`, { time: '10:00' })), 404);
  assert.equal(await status(B.owner.post(`${own}/ride-days/${day.id}/claim`)), 404);
  assert.equal(await status(B.owner.get(`${own}/events/${ev.id}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/events/${ev.id}`, { title: 'x', startDate: '2026-10-10', start: '10:00' })), 404);
  assert.equal(await status(B.owner.post(`${own}/tasks/${task.id}/done`)), 404);
  assert.equal(await status(B.owner.del(`${own}/shopping/${shop.id}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/members/${A.ids['Bố A']}`, { relation: 'bo' })), 404);
  assert.equal(await status(B.owner.del(`${own}/members/${A.ids['Bố A']}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/members/${A.ids['Bố A']}/merge`, { into: B.ids['Mẹ B'] })), 404);
  assert.equal(await status(B.owner.post(`${own}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '10:00' })), 404, 'con của gia đình khác');
  assert.equal(await status(B.owner.post(`${own}/rides`, { childId: kidB.id, dir: 'don', weekdays: [1], time: '10:00', p0: A.ids['Bố A'] })), 400, 'người khác gia đình làm người phụ trách');
  assert.equal(await status(B.owner.post(`${own}/events`, { title: 'x', startDate: '2026-10-10', start: '10:00', childIds: [kid.id] })), 400);
  assert.equal(await status(B.owner.post(`${own}/events`, { title: 'x', startDate: '2026-10-10', start: '10:00', memberIds: [A.ids['Bố A']] })), 400);
  assert.equal(await status(B.owner.post(`${own}/tasks`, { title: 'x', assigneeId: A.ids['Bố A'] })), 400);
  // dữ liệu gia đình A còn nguyên
  const core = await ok(A.owner.get(A.F));
  assert.equal(core.children.length, 1); assert.equal(core.children[0].name, 'Bé A');
  assert.equal(await status(A.owner.get('/api/families/abc')), 404);
  assert.equal(await status(A.owner.get(`${A.F}/events/abc`)), 404);
  // /api/me chỉ liệt kê gia đình của mình
  assert.deepEqual((await ok(B.owner.get('/api/me'))).families.map((f) => f.id), [B.fid]);
  assert.deepEqual((await ok(stranger.get('/api/me'))).families, []);
});

test('giới hạn: kích thước nội dung, màu, ghi chú; con hiển thị đủ 8 màu khác nhau', async () => {
  const fam = await makeFamily(['Mẹ']);
  for (let i = 1; i <= 8; i++) await addChild(fam, 'Bé ' + i);
  const colors = (await ok(fam.owner.get(fam.F))).children.map((c) => c.color);
  assert.equal(new Set(colors).size, 8, '8 con có 8 màu khác nhau');
  const kid = (await ok(fam.owner.get(fam.F))).children[0];
  const big = await fam.owner.post(`${fam.F}/tasks`, { title: 'x'.repeat(70_000) });
  assert.equal(big.status, 413);
  assert.equal(await status(fam.owner.post(`${fam.F}/tasks`, { title: 'x'.repeat(101) })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/children/${kid.id}`, { color: 'đen thui' })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/children/${kid.id}`, { note: 'n'.repeat(301) })), 400);
  const bad = await fam.owner.req('POST', `${fam.F}/tasks`, undefined);
  assert.equal(bad.status, 400);
});

test('XSS: tên có thẻ HTML được lưu như chữ, CSP chặt', async () => {
  const fam = await makeFamily(['Mẹ']);
  const evil = '<img src=x onerror=alert(1)>"\'&';
  await addChild(fam, evil.slice(0, 40));
  const core = await ok(fam.owner.get(fam.F));
  assert.equal(core.children[0].name, evil.slice(0, 40));
  const page = await new Client().req('GET', '/', undefined, { raw: true });
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/); assert.match(csp, /script-src 'self'/); assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(page.text.includes('<base href="/9family/">'));
});

test('bấm hai lần (Idempotency-Key) chỉ làm một lần', async () => {
  const fam = await makeFamily(['Mẹ']);
  const h = { 'idempotency-key': 'khoa-thu-123456' };
  const [a, b] = await Promise.all([fam.owner.post(`${fam.F}/tasks`, { title: 'Mua sữa' }, { headers: h }), fam.owner.post(`${fam.F}/tasks`, { title: 'Mua sữa' }, { headers: h })]);
  const codes = [a.status, b.status].sort();
  assert.ok(codes[0] === 200 && (codes[1] === 200 || codes[1] === 409), codes.join());
  const again = await fam.owner.post(`${fam.F}/tasks`, { title: 'Mua sữa' }, { headers: h });
  assert.equal(again.status, 200);
  assert.equal((await ok(fam.owner.get(`${fam.F}/lists`))).tasks.length, 1);
  assert.equal(await status(fam.owner.post(`${fam.F}/tasks`, { title: 'Bé' }, { headers: { 'idempotency-key': 'x' } })), 400);
});

test('pulse và rev: chỉ tăng khi dữ liệu thay đổi', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const p0 = await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  const p1 = await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  assert.equal(p0.rev, p1.rev);
  await addChild(fam);
  const p2 = await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  assert.ok(p2.rev > p1.rev);
  // thay đổi bên 9id (thêm con) cũng làm rev tăng ngay khi đồng bộ
  fam.fake.addChild(fam.fid, { name: 'Sóc' });
  await ok(fam.owner.get(fam.F));
  assert.ok((await ok(fam.by['Bố'].get(`${fam.F}/pulse`))).rev > p2.rev);
});

test('đường dẫn và tệp tĩnh; link mời ẩn danh cũ không còn trang riêng', async () => {
  const c = new Client();
  for (const p of ['/', '/index.html']) assert.equal((await c.req('GET', p, undefined, { raw: true })).status, 200, p);
  for (const p of ['/m/' + 'A'.repeat(24), '/d/' + 'B'.repeat(24)]) assert.equal((await c.req('GET', p, undefined, { raw: true })).status, 404, p);
  for (const p of ['/app.js', '/style.css', '/manifest.webmanifest', '/sw.js', '/icon.svg', '/icon.png']) assert.equal((await c.req('GET', p, undefined, { raw: true })).status, 200, p);
  assert.equal((await c.req('GET', '/..%2f..%2fpackage.json', undefined, { raw: true })).status, 404);
  assert.equal((await c.req('GET', '/%2e%2e/package.json', undefined, { raw: true })).status, 404);
  assert.equal((await c.req('GET', '/nope.js', undefined, { raw: true })).status, 404);
  assert.equal(config.basePath, '/9family');
  void at; void H; void _f;
});

test('gộp thành viên cũ (chưa có tài khoản) vào tài khoản 9app: ca đưa đón, việc, thông báo chuyển sang', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam);
  // thành viên cũ từ bản ẩn danh: hàng members không có user_id
  const old = (await db.query("INSERT INTO members(family_id, name, relation, role, joined_at, ics_token) VALUES($1,'Bà ngoại cũ','ba','thanh_vien',now(),'tok') RETURNING id", [fam.fid]))[0].id;
  await db.query('INSERT INTO rides(family_id, child_id, dir, weekday, at_time, p0) VALUES($1,$2,\'don\',1,\'16:30\',$3)', [fam.fid, kid.id, old]);
  await db.query('INSERT INTO tasks(family_id, title, assignee_id, created_by) VALUES($1,\'Mua hoa\',$2,$2)', [fam.fid, old]);
  await db.query("UPDATE events SET member_ids = member_ids WHERE false");
  const core = await ok(fam.owner.get(fam.F));
  const ph = core.members.find((m) => m.id === old);
  assert.equal(ph.pending, true); assert.equal(ph.linked, false);
  // bà ngoại đăng ký 9app và được mời vào gia đình
  const nb = newUser('Bà ngoại'); fam.fake.addMember(fam.fid, nb.userId, 'thanh_vien');
  const newId = (await ok(nb.client.get(fam.F))).me.id;
  assert.notEqual(newId, old);
  // người thường không gộp được; sai đích bị từ chối
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/members/${old}/merge`, { into: newId })), 403);
  assert.equal(await status(fam.owner.post(`${fam.F}/members/${old}/merge`, { into: old })), 404, 'đích phải là thành viên có tài khoản');
  assert.equal(await status(fam.owner.post(`${fam.F}/members/${fam.ids['Bố']}/merge`, { into: newId })), 404, 'nguồn phải là thành viên chưa nối tài khoản');
  await ok(fam.owner.post(`${fam.F}/members/${old}/merge`, { into: newId }));
  assert.equal((await db.query('SELECT p0 FROM rides WHERE family_id=$1', [fam.fid]))[0].p0, newId);
  assert.equal((await db.query("SELECT assignee_id FROM tasks WHERE title='Mua hoa'"))[0].assignee_id, newId);
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE id=$1', [old]))[0].n, 0);
  assert.equal((await ok(nb.client.get(`${fam.F}/rides`))).rides[0].p0, newId);
});
