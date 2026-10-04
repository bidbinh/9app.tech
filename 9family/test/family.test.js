import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, ok, Client, clock, db, config, base, at } from './helper.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(() => { clock.set(null); });

const status = async (p) => (await p).status;

test('tạo gia đình: kiểm tra đầu vào, cookie phiên an toàn, chỉ lưu băm', async () => {
  const c = new Client();
  assert.equal(await status(c.post('/api/families', { name: '', myName: 'A' })), 400);
  assert.equal(await status(c.post('/api/families', { name: 'x'.repeat(61), myName: 'A' })), 400);
  assert.equal(await status(c.post('/api/families', { name: 'Nhà', myName: 'A', relation: 'hacker' })), 400);
  assert.equal(await status(c.post('/api/families', { name: 'Nhà', myName: 'A', relation: 'don_ho' })), 400);
  const r = await c.post('/api/families', { name: '  Nhà   Ba\u0000 Bống 🏠 ', myName: 'Nguyễn Thị Bình Minh 🌸', relation: 'me' });
  assert.equal(r.status, 200);
  const sc = r.setCookie.find((x) => x.startsWith('fsid='));
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Path=\/9family\//);
  const token = decodeURIComponent(sc.split(';')[0].slice(5));
  const rows = await db.query('SELECT token_hash FROM sessions');
  assert.ok(rows.every((x) => x.token_hash !== token && /^[0-9a-f]{64}$/.test(x.token_hash)), 'token thật không vào CSDL');
  const core = await ok(c.get(`/api/families/${r.json.family.id}`));
  assert.equal(core.family.name, 'Nhà Ba Bống 🏠');
  assert.equal(core.me.role, 'chu'); assert.equal(core.members.length, 1);
  assert.equal(core.caps.ai, true); assert.equal(core.caps.push, true);
  assert.deepEqual(core.family.esc, { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 });
});

test('giới hạn 5 gia đình mỗi ngày cho một phiên', async () => {
  const c = new Client();
  for (let i = 0; i < 5; i++) await ok(c.post('/api/families', { name: 'G' + i, myName: 'A' }));
  assert.equal(await status(c.post('/api/families', { name: 'G6', myName: 'A' })), 429);
});

test('CSRF: thiếu header hoặc sai Origin bị từ chối; GET không cần', async () => {
  const c = new Client();
  assert.equal(await status(c.post('/api/families', { name: 'N', myName: 'A' }, { csrf: false })), 403);
  assert.equal(await status(c.post('/api/families', { name: 'N', myName: 'A' }, { origin: 'https://evil.example' })), 403);
  assert.equal(await status(c.get('/api/me')), 200);
  assert.equal(await status(c.req('GET', '/healthz')), 200);
});

test('mời bằng link một lần: vào được, dùng lại bị từ chối, hết hạn bị từ chối', async () => {
  const fam = await makeFamily(['Mẹ']);
  const o = fam.owner;
  const inv = (await ok(o.post(`${fam.F}/members`, { name: 'Bố', relation: 'bo' }))).invite;
  assert.match(inv.code, /^[A-Za-z0-9_-]{24}$/);
  const codes = await db.query("SELECT code_hash FROM invites WHERE kind='moi'");
  assert.ok(codes.every((x) => x.code_hash !== inv.code), 'mã mời chỉ lưu băm');
  const stranger = new Client();
  const pv = await ok(stranger.get(`/api/invites/${inv.code}`));
  assert.equal(pv.familyName, 'Nhà Cún'); assert.equal(pv.memberName, 'Bố'); assert.equal(pv.kind, 'moi'); assert.equal(pv.alreadyMember, false);
  // chưa vào thì chưa là thành viên
  assert.equal(await status(stranger.get(fam.F)), 404);
  const bo = new Client();
  const j = await ok(bo.post(`/api/invites/${inv.code}/accept`, { name: 'Bố Tuấn' }));
  assert.equal(j.familyId, fam.fid);
  const core = await ok(bo.get(fam.F));
  assert.equal(core.me.name, 'Bố Tuấn'); assert.equal(core.me.role, 'thanh_vien');
  // dùng lại: người khác, chính người đó, người lạ không phiên
  for (const c of [new Client(), bo, stranger]) {
    const r = await c.post(`/api/invites/${inv.code}/accept`, {});
    assert.equal(r.status, 410); assert.equal(r.json.error.code, 'invite_used');
  }
  assert.equal((await stranger.get(`/api/invites/${inv.code}`)).status, 410);
  // chủ nhận thông báo "đã vào"
  const inbox = await ok(o.get(`${fam.F}/notifications`));
  assert.ok(inbox.items.some((n) => n.title.includes('Bố Tuấn') && n.type === 'family'));
  // hết hạn sau 7 ngày
  const inv2 = (await ok(o.post(`${fam.F}/members`, { name: 'Bà ngoại', relation: 'ba' }))).invite;
  clock.set(Date.now() + 7 * 86400_000 - 60_000);
  assert.equal((await new Client().get(`/api/invites/${inv2.code}`)).status, 200);
  clock.set(Date.now() + 7 * 86400_000 + 60_000);
  const late = new Client();
  const r2 = await late.post(`/api/invites/${inv2.code}/accept`, {});
  assert.equal(r2.status, 410); assert.equal(r2.json.error.code, 'invite_expired');
  assert.equal(await status(late.get(fam.F)), 404);
  // mã sai định dạng / không tồn tại
  assert.equal((await new Client().get('/api/invites/abc')).status, 404);
  assert.equal((await new Client().get('/api/invites/' + 'A'.repeat(24))).status, 404);
  // người đã ở trong gia đình mở link của thành viên khác: bị từ chối, link vẫn dùng được cho đúng người
  clock.set(null);
  const inv3 = (await ok(o.post(`${fam.F}/members`, { name: 'Chú Hai', relation: 'nguoi_than' }))).invite;
  const r3 = await bo.post(`/api/invites/${inv3.code}/accept`, {});
  assert.equal(r3.status, 409); assert.equal(r3.json.error.code, 'already_member');
  await ok(new Client().post(`/api/invites/${inv3.code}/accept`, {}));
});

test('hai người bấm cùng một link mời cùng lúc: chỉ một người vào', async () => {
  const fam = await makeFamily(['Mẹ']);
  const inv = (await ok(fam.owner.post(`${fam.F}/members`, { name: 'Ông', relation: 'ong' }))).invite;
  const cs = Array.from({ length: 6 }, () => new Client());
  const rs = await Promise.all(cs.map((c) => c.post(`/api/invites/${inv.code}/accept`, {})));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 410).length, 5);
  const joined = (await db.query("SELECT count(*)::int n FROM sessions s JOIN members m ON m.id=s.member_id WHERE m.name='Ông'"))[0].n;
  assert.equal(joined, 1);
});

test('tên trùng trong gia đình bị từ chối (không phân biệt dấu, hoa thường)', async () => {
  const fam = await makeFamily(['Mẹ']);
  await ok(fam.owner.post(`${fam.F}/members`, { name: 'Bà Nội', relation: 'ba' }));
  assert.equal(await status(fam.owner.post(`${fam.F}/members`, { name: 'ba noi', relation: 'ba' })), 409);
  assert.equal(await status(fam.owner.post(`${fam.F}/members`, { name: 'me', relation: 'khac' })), 409);
});

test('thêm thiết bị thứ hai bằng link liên kết (một lần, 10 phút)', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const bo = fam.by['Bố'];
  const link = await ok(bo.post(`${fam.F}/devices/link`, { origin: base.replace(/\/9family$/, '') }));
  assert.ok(link.url.endsWith('/9family/d/' + link.invite.code)); assert.match(link.qr, /^data:image\/png;base64,/);
  const phone2 = new Client();
  const pv = await ok(phone2.get(`/api/invites/${link.invite.code}`));
  assert.equal(pv.kind, 'thiet_bi');
  const j = await ok(phone2.post(`/api/invites/${link.invite.code}/accept`, {}));
  assert.equal(j.memberId, fam.ids['Bố']);
  assert.equal((await ok(phone2.get(fam.F))).me.name, 'Bố');
  assert.equal((await new Client().post(`/api/invites/${link.invite.code}/accept`, {})).status, 410);
  const devs = (await ok(bo.get(`${fam.F}/devices`))).devices;
  assert.equal(devs.length, 2); assert.equal(devs.filter((d) => d.current).length, 1);
  // hết hạn sau 10 phút
  const l2 = await ok(bo.post(`${fam.F}/devices/link`, {}));
  clock.set(Date.now() + 11 * 60_000);
  const r = await new Client().post(`/api/invites/${l2.invite.code}/accept`, {});
  assert.equal(r.status, 410); assert.equal(r.json.error.code, 'invite_expired');
  clock.set(null);
  // origin lạ bị bỏ qua (không để QR trỏ ra ngoài)
  const l3 = await ok(bo.post(`${fam.F}/devices/link`, { origin: 'https://evil.example' }));
  assert.ok(!l3.url.includes('evil.example'));
  // thu hồi thiết bị khác; thiết bị cuối cùng không tự thu hồi được
  const other = devs.find((d) => !d.current);
  await ok(bo.del(`${fam.F}/devices/${other.id}`));
  assert.equal(await status(phone2.get(fam.F)), 404);
  const only = (await ok(bo.get(`${fam.F}/devices`))).devices[0];
  assert.equal(await status(bo.del(`${fam.F}/devices/${only.id}`)), 409);
  assert.equal(await status(bo.del(`${fam.F}/devices/0123456789abcdef`)), 404);
  // thiết bị của người khác không thu hồi được
  const meDev = (await ok(fam.owner.get(`${fam.F}/devices`))).devices[0];
  assert.equal(await status(bo.del(`${fam.F}/devices/${meDev.id}`)), 404);
});

test('mất thiết bị rồi mời lại: giữ nguyên dữ liệu, thiết bị cũ bị thu hồi', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam);
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Bố'] }));
  const oldPhone = fam.by['Bố'];
  const t = await ok(oldPhone.post(`${fam.F}/tasks`, { title: 'Mua sữa' }));
  // người thường không mời lại được; chủ tự mời lại cho mình thì không
  assert.equal(await status(oldPhone.post(`${fam.F}/members/${fam.ids['Mẹ']}/invite`)), 403);
  assert.equal(await status(fam.owner.post(`${fam.F}/members/${fam.ids['Mẹ']}/invite`)), 400);
  const inv = (await ok(fam.owner.post(`${fam.F}/members/${fam.ids['Bố']}/invite`))).invite;
  // trước khi dùng link mới, máy cũ vẫn chạy
  assert.equal(await status(oldPhone.get(fam.F)), 200);
  const newPhone = new Client();
  const j = await ok(newPhone.post(`/api/invites/${inv.code}/accept`, {}));
  assert.equal(j.memberId, fam.ids['Bố']);
  assert.equal(await status(oldPhone.get(fam.F)), 404, 'thiết bị cũ bị thu hồi');
  const core = await ok(newPhone.get(fam.F));
  assert.equal(core.me.id, fam.ids['Bố']);
  const lists = await ok(newPhone.get(`${fam.F}/lists`));
  assert.ok(lists.tasks.some((x) => x.id === t.task.id), 'dữ liệu giữ nguyên');
  const rides = await ok(newPhone.get(`${fam.F}/rides`));
  assert.equal(rides.rides[0].p0, fam.ids['Bố'], 'vẫn là người phụ trách ca');
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE family_id=$1', [fam.fid]))[0].n, 2, 'không tạo thành viên mới');
  // link mời lại cũ bị thay bằng link mới
  const inv2 = (await ok(fam.owner.post(`${fam.F}/members/${fam.ids['Bố']}/invite`))).invite;
  const inv3 = (await ok(fam.owner.post(`${fam.F}/members/${fam.ids['Bố']}/invite`))).invite;
  assert.equal((await new Client().get(`/api/invites/${inv2.code}`)).status, 404, 'link cũ chưa dùng bị thay thế');
  assert.equal((await new Client().get(`/api/invites/${inv3.code}`)).status, 200);
});

test('phân quyền: thành viên thường, người quản lý, chủ', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội', 'Chú'], { roles: { 'Bố': 'quan_ly' } });
  const [me, bo, ba, chu] = ['Mẹ', 'Bố', 'Bà nội', 'Chú'].map((n) => fam.by[n]);
  const kid = await addChild(fam);
  // người thường
  for (const [m, p, b] of [['post', '/children', { name: 'Con khác' }], ['post', `/children/${kid.id}`, { name: 'Đổi' }], ['post', '/members', { name: 'Ai đó', relation: 'khac' }],
    ['post', '/settings', { name: 'Hack' }], ['post', '/rides', { childId: kid.id, dir: 'don', weekdays: [1], time: '16:00' }], ['post', '/timetable', {}], ['post', '/transfer', { memberId: fam.ids['Bố'] }]]) {
    assert.equal(await status(ba[m](fam.F + p, b)), 403, `${m} ${p}`);
  }
  assert.equal(await status(ba.del(`${fam.F}/children/${kid.id}`)), 403);
  assert.equal(await status(ba.del(`${fam.F}/members/${fam.ids['Chú']}`)), 403);
  assert.equal(await status(ba.post(`${fam.F}/delete`, { confirm: 'Nhà Cún' })), 403);
  // người thường sửa phần của mình
  await ok(ba.post(`${fam.F}/members/${fam.ids['Bà nội']}`, { name: 'Bà Nội Lan', relation: 'ba' }));
  assert.equal(await status(ba.post(`${fam.F}/members/${fam.ids['Chú']}`, { name: 'Đổi tên người khác' })), 403);
  assert.equal(await status(ba.post(`${fam.F}/members/${fam.ids['Bà nội']}`, { role: 'quan_ly' })), 403, 'không tự thăng quyền');
  // người quản lý
  await ok(bo.post(`${fam.F}/children`, { name: 'Con hai' }));
  await ok(bo.post(`${fam.F}/settings`, { name: 'Nhà Cún Con' }));
  assert.equal(await status(bo.post(`${fam.F}/members`, { name: 'Cô', relation: 'nguoi_than', role: 'quan_ly' })), 403, 'chỉ chủ đặt quản lý');
  assert.equal(await status(bo.post(`${fam.F}/members/${fam.ids['Mẹ']}`, { name: 'Hack' })), 403, 'không sửa chủ');
  assert.equal(await status(bo.del(`${fam.F}/members/${fam.ids['Mẹ']}`)), 403);
  assert.equal(await status(bo.post(`${fam.F}/members/${fam.ids['Chú']}/invite`)), 200);
  assert.equal(await status(bo.post(`${fam.F}/transfer`, { memberId: fam.ids['Chú'] })), 403);
  assert.equal(await status(bo.post(`${fam.F}/delete`, { confirm: 'Nhà Cún Con' })), 403);
  // chủ đổi quyền
  await ok(me.post(`${fam.F}/members/${fam.ids['Chú']}`, { role: 'quan_ly' }));
  assert.equal(await status(chu.post(`${fam.F}/children`, { name: 'Con ba' })), 200);
  assert.equal(await status(me.post(`${fam.F}/members/${fam.ids['Mẹ']}`, { role: 'thanh_vien' })), 400, 'chủ không tự hạ quyền');
  // mốc leo thang phải giảm dần
  assert.equal(await status(me.post(`${fam.F}/settings`, { esc: { t1: 10, t2: 20, t3: 5, t4: 2, after: 10 } })), 400);
  await ok(me.post(`${fam.F}/settings`, { esc: { t1: 45, t2: 30, t3: 15, t4: 8, after: 15 } }));
  assert.equal((await ok(ba.get(fam.F))).family.esc.t1, 45);
});

test('chuyển quyền chủ, rời gia đình, xóa người, xóa gia đình', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội']);
  const kid = await addChild(fam);
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1, 2], time: '16:30', p0: fam.ids['Bà nội'], p1: fam.ids['Bố'] }));
  // chủ không rời được khi chưa chuyển quyền
  let r = await fam.owner.post(`${fam.F}/leave`);
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'owner_cannot_leave');
  // chuyển quyền cho chính mình / cho người không tồn tại bị từ chối
  assert.equal(await status(fam.owner.post(`${fam.F}/transfer`, { memberId: fam.ids['Mẹ'] })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/transfer`, { memberId: '00000000-0000-4000-8000-000000000000' })), 400);
  await ok(fam.owner.post(`${fam.F}/transfer`, { memberId: fam.ids['Bố'] }));
  assert.equal((await ok(fam.by['Bố'].get(fam.F))).me.role, 'chu');
  assert.equal((await ok(fam.owner.get(fam.F))).me.role, 'quan_ly');
  // bà nội rời: các ca bà phụ trách trở thành chưa gán, dữ liệu khác còn
  await ok(fam.by['Bà nội'].post(`${fam.F}/leave`));
  assert.equal(await status(fam.by['Bà nội'].get(fam.F)), 404);
  const rides = (await ok(fam.owner.get(`${fam.F}/rides`))).rides;
  assert.ok(rides.every((x) => x.p0 === null && x.p1 === fam.ids['Bố']));
  const members = (await ok(fam.owner.get(fam.F))).members;
  assert.ok(!members.some((m) => m.name === 'Bà nội'));
  // quản lý (Mẹ) xóa Bố là chủ: không được; chủ xóa quản lý được
  assert.equal(await status(fam.owner.del(`${fam.F}/members/${fam.ids['Bố']}`)), 403);
  await ok(fam.by['Bố'].del(`${fam.F}/members/${fam.ids['Mẹ']}`));
  assert.equal(await status(fam.owner.get(fam.F)), 404);
  // xóa gia đình: phải gõ đúng tên, rồi mọi dữ liệu biến mất
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/delete`, { confirm: 'sai tên' })), 400);
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/delete`, {})), 400);
  await ok(fam.by['Bố'].post(`${fam.F}/delete`, { confirm: 'nha cun' }));
  assert.equal(await status(fam.by['Bố'].get(fam.F)), 404);
  for (const t of ['families', 'members', 'children', 'rides', 'ride_days', 'sessions', 'invites', 'notifications']) {
    const col = t === 'families' ? 'id' : t === 'sessions' ? null : 'family_id';
    if (!col) continue;
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${t} WHERE ${col}=$1`, [fam.fid]))[0].n, 0, t);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM sessions s LEFT JOIN members m ON m.id=s.member_id WHERE m.id IS NULL'))[0].n, 0);
});

test('người ngoài gia đình nhận 404 cho mọi endpoint, không có IDOR', async () => {
  const A = await makeFamily(['Mẹ A', 'Bố A']);
  const B = await makeFamily(['Mẹ B']);
  const kid = await addChild(A, 'Bé A');
  const kidB = await addChild(B, 'Bé B');
  const ride = (await ok(A.owner.post(`${A.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1, 2, 3, 4, 5, 6, 7], time: '16:30', p0: A.ids['Mẹ A'] }))).ids[0];
  const day = (await ok(A.owner.get(`${A.F}/rides/board`))).rides[0];
  const ev = (await ok(A.owner.post(`${A.F}/events`, { title: 'Họp phụ huynh', startDate: '2026-10-10', start: '19:00', childIds: [kid.id] }))).event;
  const task = (await ok(A.owner.post(`${A.F}/tasks`, { title: 'Việc' }))).task;
  const shop = (await ok(A.owner.post(`${A.F}/shopping`, { text: 'Sữa' }))).items[0];
  const outsiders = [new Client(), B.owner, B.clients[0]];
  const calls = [
    ['GET', ''], ['GET', '/pulse'], ['GET', '/today'], ['GET', '/calendar?from=2026-10-01&to=2026-10-31'], ['GET', `/events/${ev.id}`], ['GET', '/rides'], ['GET', '/rides/board'], ['GET', '/rides/history'],
    ['GET', '/lists'], ['GET', '/notifications'], ['GET', '/devices'], ['GET', '/ics'], ['GET', `/timetable/${kid.id}`],
    ['POST', '/settings', { name: 'x' }], ['POST', '/children', { name: 'Con ngoài' }], ['POST', `/children/${kid.id}`, { name: 'x' }], ['DELETE', `/children/${kid.id}`],
    ['POST', '/members', { name: 'Kẻ lạ', relation: 'khac' }], ['POST', `/members/${A.ids['Bố A']}`, { name: 'x' }], ['DELETE', `/members/${A.ids['Bố A']}`], ['POST', `/members/${A.ids['Bố A']}/invite`],
    ['POST', '/rides', { childId: kid.id, dir: 'don', weekdays: [1], time: '10:00' }], ['POST', `/rides/${ride}`, { time: '10:00' }], ['DELETE', `/rides/${ride}`],
    ['POST', `/ride-days/${day.id}/claim`], ['POST', `/ride-days/${day.id}/done`], ['POST', `/ride-days/${day.id}/skip`], ['POST', `/ride-days/${day.id}/assign`, { memberId: A.ids['Bố A'] }],
    ['POST', `/rides/${ride}/days/2026-10-05/assign`, { memberId: A.ids['Bố A'] }],
    ['POST', '/events', { title: 'x', startDate: '2026-10-10', start: '10:00' }], ['POST', `/events/${ev.id}`, { title: 'x', startDate: '2026-10-10', start: '10:00' }], ['DELETE', `/events/${ev.id}`],
    ['POST', `/events/${ev.id}/exceptions`, { day: '2026-10-10', action: 'skip' }], ['POST', `/events/${ev.id}/end-from`, { day: '2026-10-10' }], ['POST', '/events/preview', { title: 'x', startDate: '2026-10-10', start: '10:00' }],
    ['POST', '/tasks', { title: 'x' }], ['POST', `/tasks/${task.id}`, { title: 'x' }], ['POST', `/tasks/${task.id}/done`], ['DELETE', `/tasks/${task.id}`],
    ['POST', '/shopping', { text: 'x' }], ['POST', `/shopping/${shop.id}/bought`], ['DELETE', `/shopping/${shop.id}`], ['POST', '/shopping/clear-bought'],
    ['POST', '/notifications/read'], ['POST', '/devices/link'], ['POST', '/ics/reset'], ['POST', '/leave'], ['POST', '/transfer', { memberId: A.ids['Bố A'] }], ['POST', '/delete', { confirm: 'Nhà Cún' }],
    ['POST', '/push/status', { endpoint: 'https://fcm.googleapis.com/x' }], ['POST', '/timetable/scan', { image: 'x' }], ['POST', '/timetable', { childId: kid.id }],
  ];
  for (const c of outsiders) {
    for (const [m, p, b] of calls) {
      const r = await c.req(m, `${A.F}${p}`, m === 'GET' ? undefined : (b || {}));
      assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`);
      assert.ok(!r.text.includes('Bé A') && !r.text.includes('Họp phụ huynh') && !r.text.includes('Mẹ A'), 'không lộ nội dung');
    }
  }
  // thành viên gia đình B dùng id của gia đình A trong gia đình B: không với tới được
  const own = B.F;
  assert.equal(await status(B.owner.post(`${own}/children/${kid.id}`, { name: 'x' })), 404);
  assert.equal(await status(B.owner.del(`${own}/children/${kid.id}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/rides/${ride}`, { time: '10:00' })), 404);
  assert.equal(await status(B.owner.post(`${own}/ride-days/${day.id}/claim`)), 404);
  assert.equal(await status(B.owner.get(`${own}/events/${ev.id}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/events/${ev.id}`, { title: 'x', startDate: '2026-10-10', start: '10:00' })), 404);
  assert.equal(await status(B.owner.post(`${own}/tasks/${task.id}/done`)), 404);
  assert.equal(await status(B.owner.del(`${own}/shopping/${shop.id}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/members/${A.ids['Bố A']}`, { name: 'x' })), 404);
  assert.equal(await status(B.owner.del(`${own}/members/${A.ids['Bố A']}`)), 404);
  assert.equal(await status(B.owner.post(`${own}/transfer`, { memberId: A.ids['Bố A'] })), 400);
  assert.equal(await status(B.owner.post(`${own}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '10:00' })), 404, 'con của gia đình khác');
  assert.equal(await status(B.owner.post(`${own}/rides`, { childId: kidB.id, dir: 'don', weekdays: [1], time: '10:00', p0: A.ids['Bố A'] })), 400, 'người khác gia đình làm người phụ trách');
  assert.equal(await status(B.owner.post(`${own}/events`, { title: 'x', startDate: '2026-10-10', start: '10:00', childIds: [kid.id] })), 400);
  assert.equal(await status(B.owner.post(`${own}/events`, { title: 'x', startDate: '2026-10-10', start: '10:00', memberIds: [A.ids['Bố A']] })), 400);
  assert.equal(await status(B.owner.post(`${own}/tasks`, { title: 'x', assigneeId: A.ids['Bố A'] })), 400);
  // dữ liệu gia đình A còn nguyên
  const core = await ok(A.owner.get(A.F));
  assert.equal(core.children.length, 1); assert.equal(core.children[0].name, 'Bé A');
  // id không phải uuid
  assert.equal(await status(A.owner.get('/api/families/abc')), 404);
  assert.equal(await status(A.owner.get(`${A.F}/events/abc`)), 404);
  // /api/me chỉ liệt kê gia đình của mình
  assert.deepEqual((await ok(B.owner.get('/api/me'))).families.map((f) => f.id), [B.fid]);
  assert.deepEqual((await ok(new Client().get('/api/me'))).families, []);
});

test('giới hạn: 8 con, kích thước nội dung, số lượng', async () => {
  const fam = await makeFamily(['Mẹ']);
  for (let i = 1; i <= 8; i++) await addChild(fam, 'Bé ' + i);
  const r = await fam.owner.post(`${fam.F}/children`, { name: 'Bé 9' });
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'limit');
  const colors = (await ok(fam.owner.get(fam.F))).children.map((c) => c.color);
  assert.equal(new Set(colors).size, 8, '8 con có 8 màu khác nhau');
  assert.equal(await status(fam.owner.post(`${fam.F}/children`, { name: 'bé 1' })), 409);
  const big = await fam.owner.post(`${fam.F}/tasks`, { title: 'x'.repeat(70_000) });
  assert.equal(big.status, 413);
  assert.equal(await status(fam.owner.post(`${fam.F}/tasks`, { title: 'x'.repeat(101) })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/children`, { name: 'Bé', birthYear: 1800 })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/children`, { name: 'Bé', color: 'đen thui' })), 400);
  const bad = await fam.owner.req('POST', `${fam.F}/tasks`, undefined);
  assert.equal(bad.status, 200 === bad.status ? 400 : bad.status);
});

test('XSS: tên có thẻ HTML được lưu như chữ, CSP chặt', async () => {
  const fam = await makeFamily(['Mẹ']);
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const kid = await addChild(fam, evil.slice(0, 40));
  const core = await ok(fam.owner.get(fam.F));
  assert.equal(core.children[0].name, evil.slice(0, 40));
  const page = await new Client().req('GET', '/', undefined, { raw: true });
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/); assert.match(csp, /script-src 'self'/); assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(page.text.includes('<base href="/9family/">'));
  void kid;
});

test('bấm hai lần (Idempotency-Key) chỉ tạo một lần', async () => {
  const fam = await makeFamily(['Mẹ']);
  const h = { 'idempotency-key': 'khoa-thu-123456' };
  const [a, b] = await Promise.all([fam.owner.post(`${fam.F}/children`, { name: 'Bé Một' }, { headers: h }), fam.owner.post(`${fam.F}/children`, { name: 'Bé Một' }, { headers: h })]);
  const codes = [a.status, b.status].sort();
  assert.ok(codes[0] === 200 && (codes[1] === 200 || codes[1] === 409), codes.join());
  const again = await fam.owner.post(`${fam.F}/children`, { name: 'Bé Một' }, { headers: h });
  assert.equal(again.status, 200);
  assert.equal((await ok(fam.owner.get(fam.F))).children.length, 1);
  assert.equal(await status(fam.owner.post(`${fam.F}/children`, { name: 'Bé' }, { headers: { 'idempotency-key': 'x' } })), 400);
});

test('pulse và rev: chỉ tăng khi dữ liệu thay đổi', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const p0 = await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  const p1 = await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  assert.equal(p0.rev, p1.rev);
  await addChild(fam);
  const p2 = await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  assert.ok(p2.rev > p1.rev);
});

test('mất phiên: người dùng xóa cookie thì không vào được nữa, phải được mời lại', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const ghost = new Client();
  ghost.cookie = 'fsid=' + 'A'.repeat(43);
  assert.equal(await status(ghost.get(fam.F)), 404);
  assert.deepEqual((await ok(ghost.get('/api/me'))).families, []);
  ghost.cookie = 'fsid=rác';
  assert.equal(await status(ghost.get(fam.F)), 404);
});

test('đường dẫn và tệp tĩnh', async () => {
  const c = new Client();
  for (const p of ['/', '/index.html', '/m/' + 'A'.repeat(24), '/d/' + 'B'.repeat(24)]) assert.equal((await c.req('GET', p, undefined, { raw: true })).status, 200, p);
  for (const p of ['/app.js', '/style.css', '/manifest.webmanifest', '/sw.js', '/icon.svg', '/icon.png']) assert.equal((await c.req('GET', p, undefined, { raw: true })).status, 200, p);
  assert.equal((await c.req('GET', '/..%2f..%2fpackage.json', undefined, { raw: true })).status, 404);
  assert.equal((await c.req('GET', '/%2e%2e/package.json', undefined, { raw: true })).status, 404);
  assert.equal((await c.req('GET', '/nope.js', undefined, { raw: true })).status, 404);
  assert.equal(config.basePath, '/9family');
  void at;
});
