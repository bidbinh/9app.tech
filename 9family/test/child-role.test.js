// Vai 'con' (tài khoản của con nối vào hồ sơ con ở 9id): chỉ XEM lịch/việc/đưa đón liên quan mình; không mời, không xóa, không sửa gia đình;
// không thấy con khác, người đón hộ, ghi chú sức khỏe, mua sắm. Mặc định từ chối mọi tuyến chưa khai báo cho con (an toàn cho module mới).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, newUser, ok, Client, clock, scheduler, db, at } from './helper.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(() => { clock.set(null); });

const status = async (p) => (await p).status;

async function setup() {
  clock.set(at('2026-10-05', '08:00'));
  const fam = await makeFamily(['Mẹ', 'Bố'], { roles: { 'Bố': 'quan_ly' } });
  const kidA = await addChild(fam, 'Bống', { healthNote: 'Dị ứng đậu phộng', note: 'Chờ ở cổng B' });
  const kidB = await addChild(fam, 'Sóc');
  const conA = newUser('Bống (tài khoản)');
  fam.fake.addMember(fam.fid, conA.userId, 'con');
  fam.fake.families.get(fam.fid).children.find((k) => k.id === kidA.id).linkedUserId = conA.userId;
  await fam.sync();
  const con = conA.client;
  const me = (await ok(con.get(fam.F))).me;
  return { fam, kidA, kidB, con, conUser: conA, meId: me.id };
}

test('vai con: chỉ thấy hồ sơ của mình, người lớn không số điện thoại, không thấy người đón hộ, ghi chú, con khác', async () => {
  const { fam, kidA, con } = await setup();
  await ok(fam.owner.post(`${fam.F}/members`, { name: 'Cô Hoa', external: true, phone: '0912345678', note: 'áo xanh' }));
  const core = await ok(con.get(fam.F));
  assert.equal(core.me.role, 'con'); assert.deepEqual(core.me.childIds, [kidA.id]);
  assert.deepEqual(core.children.map((k) => k.name), ['Bống']);
  assert.equal(core.children[0].note, '', 'ghi chú đưa đón không cho con'); assert.equal(core.children[0].healthNote, undefined, 'ghi chú sức khỏe không cho con');
  assert.ok(!core.members.some((m) => m.external || m.role === 'con'), 'không thấy người đón hộ và các con khác');
  assert.ok(!JSON.stringify(core).includes('0912345678') && !JSON.stringify(core).includes('Cô Hoa') && !JSON.stringify(core).includes('Sóc') && !JSON.stringify(core).includes('đậu phộng'));
  // người lớn thì thấy đủ
  const adult = await ok(fam.owner.get(fam.F));
  assert.equal(adult.children.length, 2); assert.equal(adult.children[0].healthNote, 'Dị ứng đậu phộng'); assert.ok(adult.members.some((m) => m.external && m.phone === '0912345678'));
  assert.ok(adult.members.some((m) => m.role === 'con'), 'người lớn thấy tài khoản con');
});

test('vai con: không mời, không xóa, không sửa gia đình; mọi tuyến không khai báo cho con bị từ chối', async () => {
  const { fam, kidA, kidB, con, meId } = await setup();
  const ev = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Họp phụ huynh', startDate: '2026-10-10', start: '19:00', childIds: [kidA.id] }))).event;
  const calls = [
    ['POST', '/settings', { esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 } }], ['POST', '/members', { name: 'Kẻ lạ', external: true }], ['POST', `/members/${meId}`, { relation: 'khac' }],
    ['DELETE', `/members/${fam.ids['Bố']}`], ['POST', `/members/${fam.ids['Bố']}/merge`, { into: meId }], ['POST', `/children/${kidA.id}`, { school: 'x' }], ['POST', '/children', { name: 'x' }], ['DELETE', `/children/${kidA.id}`],
    ['POST', '/rides', { childId: kidA.id, dir: 'don', weekdays: [1], time: '10:00' }], ['POST', '/events', { title: 'x', startDate: '2026-10-10', start: '10:00' }],
    ['POST', `/events/${ev.id}`, { title: 'x', startDate: '2026-10-10', start: '10:00' }], ['DELETE', `/events/${ev.id}`], ['POST', `/events/${ev.id}/exceptions`, { day: '2026-10-10', action: 'skip' }],
    ['POST', '/events/preview', { title: 'x', startDate: '2026-10-10', start: '10:00' }], ['POST', '/tasks', { title: 'x' }],
    ['POST', '/shopping', { text: 'x' }], ['POST', '/shopping/clear-bought'], ['GET', `/timetable/${kidA.id}`], ['POST', '/timetable', { childId: kidA.id }], ['POST', '/timetable/scan', { image: 'x' }],
  ];
  for (const [m, p, b] of calls) {
    const r = await con.req(m, fam.F + p, m === 'GET' ? undefined : (b || {}));
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status} ${r.text.slice(0, 100)}`);
  }
  // việc của người lớn khác thì không đánh dấu hộ được; sổ mua sắm trống với con
  const t = (await ok(fam.owner.post(`${fam.F}/tasks`, { title: 'Việc của mẹ', assigneeId: fam.ids['Mẹ'] }))).task;
  await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'Sữa tươi' }));
  assert.equal(await status(con.post(`${fam.F}/tasks/${t.id}/done`)), 403);
  assert.equal(await status(con.del(`${fam.F}/tasks/${t.id}`)), 403);
  assert.deepEqual((await ok(con.get(`${fam.F}/lists`))).shopping, []);
  void kidB;
});

test('vai con: lịch, đưa đón, việc chỉ của mình; việc giao cho con làm xong được', async () => {
  const { fam, kidA, kidB, con, meId } = await setup();
  const own = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Học bơi của Bống', startDate: '2026-10-05', start: '15:00', childIds: [kidA.id] }))).event;
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Học đàn của Sóc', startDate: '2026-10-05', start: '16:00', childIds: [kidB.id] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Cả nhà đi ăn', startDate: '2026-10-05', start: '18:30' }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Bố đi họp', startDate: '2026-10-05', start: '09:00', memberIds: [fam.ids['Bố']] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Dặn riêng Bống', startDate: '2026-10-05', start: '12:00', memberIds: [meId] }));
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kidA.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Mẹ'] }));
  await ok(fam.owner.post(`${fam.F}/members`, { name: 'Cô Hoa', external: true, phone: '0912345678' }));
  const hoa = (await db.query("SELECT id FROM members WHERE name='Cô Hoa' AND family_id=$1", [fam.fid]))[0].id;
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kidB.id, dir: 'don', weekdays: [1], time: '11:30', p0: hoa }));
  const today = await ok(con.get(`${fam.F}/today`));
  assert.deepEqual(today.events.map((e) => e.title).sort(), ['Cả nhà đi ăn', 'Dặn riêng Bống', 'Học bơi của Bống']);
  assert.deepEqual(today.rides.map((r) => r.childName), ['Bống']);
  assert.ok(!JSON.stringify(today).includes('0912345678') && !JSON.stringify(today).includes('Sóc'));
  const cal = await ok(con.get(`${fam.F}/calendar?from=2026-10-01&to=2026-10-31`));
  assert.ok(!cal.events.some((e) => /Sóc|Bố đi họp/.test(e.title)));
  assert.equal((await ok(con.get(`${fam.F}/calendar?from=2026-10-01&to=2026-10-31&childId=${kidB.id}`))).events.length, 0, 'lọc theo con khác không lộ');
  assert.equal(await status(con.get(`${fam.F}/events/${own.id}`)), 200);
  const other = (await db.query("SELECT id FROM events WHERE title='Học đàn của Sóc'"))[0].id;
  assert.equal(await status(con.get(`${fam.F}/events/${other}`)), 404);
  const rides = (await ok(con.get(`${fam.F}/rides`))).rides; assert.deepEqual(rides.map((r) => r.childId), [kidA.id]);
  const board = (await ok(con.get(`${fam.F}/rides/board?day=2026-10-05`))).rides; assert.deepEqual(board.map((r) => r.childName), ['Bống']);
  assert.ok((await ok(con.get(`${fam.F}/rides/history`))).rides.every((r) => r.childName === 'Bống'));
  // không nhận/báo xong ca đưa đón
  for (const a of ['claim', 'done', 'skip', 'start', 'assign']) assert.equal(await status(con.post(`${fam.F}/ride-days/${board[0].id}/${a}`, {})), 403, a);
  // việc giao cho con
  const mine = (await ok(fam.owner.post(`${fam.F}/tasks`, { title: 'Dọn đồ chơi', assigneeId: meId }))).task;
  await ok(fam.owner.post(`${fam.F}/tasks`, { title: 'Việc người lớn', assigneeId: fam.ids['Mẹ'] }));
  assert.deepEqual((await ok(con.get(`${fam.F}/lists`))).tasks.map((t) => t.title), ['Dọn đồ chơi']);
  assert.deepEqual((await ok(con.get(`${fam.F}/today`))).tasks.map((t) => t.title), ['Dọn đồ chơi']);
  assert.equal((await ok(con.post(`${fam.F}/tasks/${mine.id}/done`))).task.done, true);
});

test('vai con: nhận nhắc sự kiện của chính mình, không nhận thông báo chung của cả nhà; lịch ICS và đẩy riêng', async () => {
  const { fam, kidA, kidB, con, conUser } = await setup();
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Học bơi của Bống', startDate: '2026-10-05', start: '15:00', childIds: [kidA.id], notifyOffsets: [30] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Học đàn của Sóc', startDate: '2026-10-05', start: '15:00', childIds: [kidB.id], notifyOffsets: [30] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Cả nhà đi ăn', startDate: '2026-10-05', start: '15:00', notifyOffsets: [30] }));
  clock.set(at('2026-10-05', '14:30')); await scheduler.tick(at('2026-10-05', '14:30'));
  const titles = (await ok(con.get(`${fam.F}/notifications`))).items.map((i) => i.title);
  assert.ok(titles.some((t) => t.includes('Học bơi của Bống')), 'nhắc việc của chính mình');
  assert.ok(!titles.some((t) => t.includes('Sóc')), 'không nhận nhắc của con khác');
  assert.ok(!titles.some((t) => t.includes('Cả nhà đi ăn')), 'sự kiện chung của cả nhà chỉ gửi người lớn');
  const adultTitles = (await ok(fam.owner.get(`${fam.F}/notifications`))).items.map((i) => i.title);
  assert.ok(adultTitles.some((t) => t.includes('Cả nhà đi ăn')) && adultTitles.some((t) => t.includes('Sóc')));
  // ICS của con chỉ có sự kiện liên quan con
  const path = (await ok(con.get(`${fam.F}/ics`))).path;
  const ics = (await new Client().req('GET', path.replace('/9family', ''), undefined, { raw: true })).text;
  assert.ok(ics.includes('Học bơi của Bống') && !ics.includes('Sóc'));
  // con đăng ký đẩy được, gắn user_id của con
  const sub = await con.post(`${fam.F}/push/subscribe`, { endpoint: 'https://127.0.0.1:1/p/con', keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } });
  assert.equal(sub.status, 200);
  assert.equal((await db.query("SELECT user_id FROM push_subs WHERE endpoint LIKE '%/p/con'"))[0].user_id, conUser.userId);
  assert.equal(await status(con.post(`${fam.F}/notifications/read`)), 200);
});

test('vai con: gỡ nối ở 9id thì mất quyền xem; con của gia đình khác không với tới (IDOR)', async () => {
  const { fam, kidA, con, conUser } = await setup();
  const other = await makeFamily(['Mẹ Khác']);
  assert.equal(await status(con.get(other.F)), 404);
  assert.equal(await status(con.get(`${other.F}/today`)), 404);
  // gỡ nối: con không còn hồ sơ của mình nên không thấy gì liên quan
  fam.fake.families.get(fam.fid).children.find((k) => k.id === kidA.id).linkedUserId = null;
  await ok(fam.owner.post(`${fam.F}/resync`));
  const core = await ok(con.get(fam.F));
  assert.deepEqual(core.children, []);
  assert.deepEqual((await ok(con.get(`${fam.F}/rides`))).rides, []);
  // con bị mời ra khỏi gia đình
  fam.fake.removeMember(fam.fid, conUser.userId);
  assert.equal(await status(con.get(fam.F)), 404);
  void kidA;
});

test('vai con: cũng đúng khi con vào trước, hồ sơ nối sau (9id đổi liên tục)', async () => {
  clock.set(null);
  const fam = await makeFamily(['Mẹ']);
  const kid = await addChild(fam, 'Mít');
  const c = newUser('Tài khoản Mít');
  fam.fake.addMember(fam.fid, c.userId, 'con');
  assert.deepEqual((await ok(c.client.get(fam.F))).children, [], 'chưa nối hồ sơ thì chưa thấy con nào');
  fam.fake.families.get(fam.fid).children.find((k) => k.id === kid.id).linkedUserId = c.userId;
  const core = await ok(c.client.get(fam.F));
  assert.deepEqual(core.children.map((k) => k.name), ['Mít']);
  assert.equal((await db.query('SELECT linked_user_id FROM children WHERE id=$1', [kid.id]))[0].linked_user_id, c.userId);
});
