// Kiểm thử các lỗi do phản biện độc lập tìm ra (C1, T1-T10, L1-L8) và cấu hình triển khai.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { boot, shutdown, makeFamily, addChild, ok, Client, clock, scheduler, db, at, config, base } from './helper.js';
import { dueSteps, normEsc } from '../src/rides.js';
import { productionProblems } from '../src/config.js';
import { normIp } from '../src/util.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(async () => { clock.set(null); await db.resetForTests(); });

const status = async (p) => (await p).status;
const inbox = async (c, fam) => (await ok(c.get(`${fam.F}/notifications`))).items.map((i) => i.title).reverse();
const tickAt = (ms) => { clock.set(ms); return scheduler.tick(ms); };
const b64 = (n) => crypto.randomBytes(n).toString('base64url');

// ---------- C1/T1/T2: thiết bị, token ICS (đăng nhập do 9id lo; xem test/id-auth.test.js) ----------
test('T2: token ICS đổi được; rời gia đình thì link lịch chết ngay, người khác không dùng được link cũ', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Chú']);
  const bo = fam.by['Bố'];
  await ok(bo.post(`${fam.F}/push/subscribe`, { endpoint: 'https://127.0.0.1:1/p/bo1', keys: { p256dh: b64(65), auth: b64(16) } }));
  const ics0 = (await ok(bo.get(`${fam.F}/ics`))).path;
  const ics1 = (await ok(bo.post(`${fam.F}/ics/reset`))).path;
  assert.notEqual(ics1, ics0);
  const anon = new Client();
  assert.equal((await anon.req('GET', ics0.replace('/9family', ''), undefined, { raw: true })).status, 404, 'link cũ chết');
  assert.equal((await anon.req('GET', ics1.replace('/9family', ''), undefined, { raw: true })).status, 200);
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE ics_token = $1', [ics1.split('/').pop().replace('.ics', '')]))[0].n, 1);
  // bị mời ra khỏi gia đình ở 9id: link lịch và đăng ký đẩy mất theo, 404 với chính người đó
  fam.fake.removeMember(fam.fid, fam.userIds['Bố']); await fam.sync();
  assert.equal((await anon.req('GET', ics1.replace('/9family', ''), undefined, { raw: true })).status, 404);
  assert.equal((await db.query('SELECT count(*)::int n FROM push_subs'))[0].n, 0);
  assert.equal(await status(bo.get(fam.F)), 404);
  // thiết bị thứ hai của cùng một người dùng 9id: dùng chung gia đình
  const phone2 = new Client().loginAs(fam.fake.login(fam.userIds['Chú']));
  assert.equal((await ok(phone2.get(fam.F))).me.id, fam.ids['Chú']);
});

// ---------- T3: đồng bộ vai trò song song ----------
test('T3: đổi chủ ở 9id rồi nhiều người mở gia đình cùng lúc: luôn đúng một chủ, không lỗi 500', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà']);
  const names = ['Mẹ', 'Bố', 'Bà'];
  for (let i = 0; i < 4; i++) {
    const to = names[(i + 1) % 3];
    fam.fake.setRole(fam.fid, fam.userIds[to], 'chu');
    const rs = await Promise.all(names.flatMap((n) => [fam.by[n].get(fam.F), fam.by[n].get(`${fam.F}/today`)]));
    assert.ok(rs.every((r) => r.status === 200), rs.map((r) => r.status).join());
    const owners = await db.query("SELECT id, user_id FROM members WHERE family_id=$1 AND role='chu' AND left_at IS NULL", [fam.fid]);
    assert.equal(owners.length, 1, 'luôn đúng một chủ');
    assert.equal(owners[0].user_id, fam.userIds[to]);
  }
  // lớp bảo vệ cuối ở CSDL: chỉ mục "một chủ" vẫn còn
  await assert.rejects(db.query("UPDATE members SET role='chu' WHERE family_id=$1 AND role='quan_ly'", [fam.fid]), /members_one_owner|duplicate/);
});

// ---------- T4: chỉ người trong ca mới báo xong / bỏ qua ----------
test('T4: người ngoài ca chỉ được nhận; báo xong hoặc bỏ qua cần là người trong ca hoặc quản lý', async () => {
  clock.set(at('2026-10-05', '15:00'));
  const fam = await makeFamily(['Mẹ', 'Bố', 'Chú']);
  const kid = await addChild(fam, 'Bống');
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Mẹ'], p1: fam.ids['Bố'] }));
  const rd = (await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-05`))).rides[0];
  const chu = fam.by['Chú'];
  assert.equal(await status(chu.post(`${fam.F}/ride-days/${rd.id}/done`)), 403);
  assert.equal(await status(chu.post(`${fam.F}/ride-days/${rd.id}/skip`, { reason: 'phá' })), 403);
  assert.equal((await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-05`))).rides[0].state, 'cho');
  await ok(chu.post(`${fam.F}/ride-days/${rd.id}/claim`));
  assert.equal(await status(chu.post(`${fam.F}/ride-days/${rd.id}/done`)), 200, 'nhận rồi thì báo xong được');
  const rd2 = (await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-12`))).rides[0];
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/ride-days/${rd2.id}/skip`)), 200, 'dự phòng bỏ qua được');
  assert.equal(await status(fam.owner.post(`${fam.F}/ride-days/${rd2.id}/unskip`)), 200);
});

// ---------- T5/T6: nhắc sự kiện ----------
test('T5: dời giờ sự kiện sau khi đã nhắc thì nhắc lại theo giờ mới (không bị nuốt)', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const e = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Khám răng', startDate: '2026-10-12', start: '09:00', notifyOffsets: [30] }))).event;
  await tickAt(at('2026-10-12', '08:30'));
  assert.deepEqual((await inbox(fam.by['Bố'], fam)).filter((t) => t.includes('Khám răng')), ['30 phút nữa: Khám răng']);
  clock.set(at('2026-10-12', '08:40'));
  await ok(fam.owner.post(`${fam.F}/events/${e.id}`, { title: 'Khám răng', startDate: '2026-10-12', start: '14:00', notifyOffsets: [30] }));
  await tickAt(at('2026-10-12', '13:30'));
  assert.equal((await inbox(fam.by['Bố'], fam)).filter((t) => t.includes('Khám răng')).length, 2, 'giờ mới phải được nhắc lại');
  await tickAt(at('2026-10-12', '13:35'));
  assert.equal((await inbox(fam.by['Bố'], fam)).filter((t) => t.includes('Khám răng')).length, 2, 'nhưng không nhắc trùng');
  // sửa riêng một ngày cũng nhắc theo giờ mới
  const w = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Bơi', startDate: '2026-10-19', recType: 'weekly', recDays: [1], start: '10:00', notifyOffsets: [30] }))).event;
  await tickAt(at('2026-10-19', '09:30'));
  await ok(fam.owner.post(`${fam.F}/events/${w.id}/exceptions`, { day: '2026-10-19', action: 'edit', start: '16:00' }));
  await tickAt(at('2026-10-19', '15:30'));
  assert.equal((await inbox(fam.by['Bố'], fam)).filter((t) => t.includes('Bơi')).length, 2);
});

test('T6: nhắc sự kiện cả ngày vẫn phát nếu máy chủ khởi động muộn buổi sáng (tới 12:00)', async () => {
  const fam = await makeFamily(['Mẹ']);
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Giỗ ông', kind: 'ngay_quan_trong', allDay: true, startDate: '2026-10-12', notifyOffsets: [0] }));
  await tickAt(at('2026-10-12', '11:30'));
  assert.ok((await inbox(fam.owner, fam)).includes('Hôm nay: Giỗ ông'));
  const f2 = await makeFamily(['Mẹ2']);
  await ok(f2.owner.post(`${f2.F}/events`, { title: 'Giỗ bà', kind: 'ngay_quan_trong', allDay: true, startDate: '2026-10-13', notifyOffsets: [0] }));
  await tickAt(at('2026-10-13', '12:30'));
  assert.ok(!(await inbox(f2.owner, f2)).includes('Hôm nay: Giỗ bà'), 'sau 12:00 thì thôi');
});

// ---------- T7 ----------
test('T7: không giao ca cho thành viên đã rời gia đình hay cho tài khoản của con', async () => {
  clock.set(at('2026-10-05', '10:00'));
  const fam = await makeFamily(['Mẹ', 'Bà']);
  const kid = await addChild(fam, 'Bống');
  const conUser = fam.fake.signup('Bống (tài khoản)');
  fam.fake.addMember(fam.fid, conUser.userId, 'con');
  const conClient = new Client().loginAs(conUser.token);
  const conMe = (await ok(conClient.get(fam.F))).me;
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Mẹ'] }));
  const rd = (await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-05`))).rides[0];
  assert.equal(await status(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: conMe.id })), 400, 'con không làm người đưa đón');
  assert.equal(await status(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'dua', weekdays: [2], time: '07:00', p0: conMe.id })), 400);
  await fam.leave('Bà');
  assert.equal(await status(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bà'] })), 400, 'người đã rời');
});

// ---------- T8: cookie lạ ----------
test('T8: cookie do client tự đặt (nine_sid giả, fsid cũ) không được chấp nhận', async () => {
  const fam = await makeFamily(['Mẹ']);
  for (const ck of ['nine_sid=' + b64(32), 'fsid=' + b64(32), 'nine_sid=' + fam.tokens['Mẹ'].slice(0, 42) + 'x']) {
    const c = new Client(); c.cookie = ck;
    assert.equal(await status(c.get('/api/me')), 401, ck);
    assert.equal(await status(c.get(fam.F)), 401, ck);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM sessions'))[0].n, 0, 'không còn phiên ẩn danh nào được tạo');
});

// ---------- T9: hạn mức AI ----------
function fakeGemini(statusFor) {
  let calls = 0;
  const srv = http.createServer((req, res) => {
    req.resume(); req.on('end', () => {
      calls++; const s = statusFor(calls); res.writeHead(s, { 'content-type': 'application/json' });
      res.end(JSON.stringify(s === 200 ? { candidates: [{ content: { parts: [{ text: JSON.stringify({ periods: [], cells: [{ weekday: 1, period: 1, subject: 'Toán' }] }) }] } }] } : {}));
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls: () => calls, base: `http://127.0.0.1:${srv.address().port}` })));
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 3)]).toString('base64');
test('T9: hạn mức AI theo gia đình, IP và toàn hệ; lỗi không bị trừ lượt', async () => {
  const saved = { b: config.aiBase, k: config.aiKey, g: config.aiGlobalPerDay, i: config.aiPerIpPerDay };
  const g = await fakeGemini((n) => (n <= 3 ? 500 : 200));
  config.aiBase = g.base; config.aiKey = 'k';
  try {
    const fam = await makeFamily(['Mẹ']);
    const scan = () => fam.owner.post(`${fam.F}/timetable/scan`, { image: PNG });
    assert.equal((await scan()).status, 502);
    assert.equal((await db.query('SELECT count(*)::int n FROM ai_quota'))[0].n, 0, 'gọi lỗi không trừ lượt');
    assert.equal((await scan()).status, 502); assert.equal((await scan()).status, 502);
    assert.equal((await scan()).status, 200);
    const q = Object.fromEntries((await db.query('SELECT scope, n FROM ai_quota')).map((r) => [r.scope.replace(fam.fid, 'F').replace(/^ip:.*/, 'ip'), r.n]));
    assert.deepEqual(q, { 'f:F': 1, ip: 1, g: 1 });
    config.aiPerIpPerDay = 1;
    assert.equal((await scan()).status, 429);
    config.aiPerIpPerDay = 30; config.aiGlobalPerDay = 1;
    const r = await scan(); assert.equal(r.status, 429); assert.equal(r.json.error.code, 'ai_quota');
    assert.equal(g.calls(), 4, 'bị chặn thì không gọi Gemini');
  } finally { Object.assign(config, { aiBase: saved.b, aiKey: saved.k, aiGlobalPerDay: saved.g, aiPerIpPerDay: saved.i }); g.srv.close(); }
});

// ---------- T10 ----------
test('T10: bảng idem không giữ số điện thoại / nhận dạng của người đón hộ', async () => {
  const fam = await makeFamily(['Mẹ']);
  const h = { 'idempotency-key': 'khoa-them-nguoi-don-1' };
  await ok(fam.owner.post(`${fam.F}/members`, { name: 'Cô Hoa', external: true, phone: '0912345678', note: 'áo xanh biển 29B1' }, { headers: h }));
  const dump = JSON.stringify(await db.query('SELECT * FROM idem'));
  assert.ok(!dump.includes('0912345678') && !dump.includes('29B1'));
  const again = await fam.owner.post(`${fam.F}/members`, { name: 'Cô Hoa', external: true, phone: '0912345678' }, { headers: h });
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'already_done');
});

// ---------- L1 ----------
test('L1: "từ ngày này về sau" không bao giờ kéo dài khoảng lặp', async () => {
  const fam = await makeFamily(['Mẹ']);
  const e = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Học vẽ', startDate: '2026-10-05', untilDate: '2026-10-20', recType: 'weekly', recDays: [1], start: '10:00' }))).event;
  await ok(fam.owner.post(`${fam.F}/events/${e.id}/end-from`, { day: '2026-12-01' }));
  assert.equal((await ok(fam.owner.get(`${fam.F}/events/${e.id}`))).event.untilDate, '2026-10-20');
  await ok(fam.owner.post(`${fam.F}/events/${e.id}/end-from`, { day: '2026-10-13' }));
  assert.equal((await ok(fam.owner.get(`${fam.F}/events/${e.id}`))).event.untilDate, '2026-10-12');
});

// ---------- L2 ----------
test('L2: mốc "sau giờ ca" cài tới 120 phút vẫn phát được', async () => {
  const T = Date.parse('2026-10-05T09:30:00Z');
  const esc = normEsc({ esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 120 } });
  assert.deepEqual(dueSteps(T, T + 120 * 60_000, esc), [1, 2, 3, 4, 5]);
  assert.deepEqual(dueSteps(T, T + 131 * 60_000, esc), []);
  assert.deepEqual(dueSteps(T, T + 91 * 60_000, normEsc({})), [], 'mặc định vẫn thôi sau 90 phút');
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam, 'Bống');
  await ok(fam.owner.post(`${fam.F}/settings`, { esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 120 } }));
  clock.set(at('2026-10-05', '16:00'));
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Mẹ'] }));
  await tickAt(at('2026-10-05', '16:35'));
  await tickAt(at('2026-10-05', '18:30'));
  assert.equal((await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-05`))).rides[0].state, 'khong_ai');
});

// ---------- L3 ----------
test('L3: ICS ca đưa đón theo ca thực tế (ghi đè người, bỏ qua) chứ không chỉ khuôn tuần', async () => {
  clock.set(at('2026-10-05', '08:00'));
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam, 'Bống');
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: fam.ids['Mẹ'] }));
  const ics = async (c) => { const p = (await ok(c.get(`${fam.F}/ics`))).path; return (await new Client().req('GET', p.replace('/9family', ''), undefined, { raw: true })).text.replace(/\r\n /g, ''); };
  const count = (t) => (t.match(/SUMMARY:Đón Bống/g) || []).length;
  const before = await ics(fam.owner);
  assert.equal(count(before), 9, '9 thứ hai trong 60 ngày tới (gồm hôm nay)');
  const today = (await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-05`))).rides[0];
  const nextMon = (await ok(fam.owner.get(`${fam.F}/rides/board?day=2026-10-12`))).rides[0];
  await ok(fam.owner.post(`${fam.F}/ride-days/${today.id}/assign`, { memberId: fam.ids['Bố'] }));
  await ok(fam.owner.post(`${fam.F}/ride-days/${nextMon.id}/skip`, { reason: 'nghỉ' }));
  assert.equal(count(await ics(fam.owner)), 7, 'bỏ ngày giao cho Bố và ngày bỏ qua');
  const boIcs = await ics(fam.by['Bố']);
  assert.equal(count(boIcs), 1); assert.ok(boIcs.includes('DTSTART:20261005T093000Z'));
});

// ---------- L5 ----------
test('L5: IP lấy từ phần tử cuối của X-Forwarded-For, IPv6 gom /64; giới hạn tần suất theo IP không né được bằng X-Forwarded-For giả', async () => {
  assert.equal(normIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(normIp('2001:DB8::1'), '2001:db8:0:0::/64');
  const saved = config.rateLimitPerMin;
  config.rateLimitPerMin = 5;
  try {
    const hit = (xff) => new Client().get('/api/config', { headers: { 'x-forwarded-for': xff } });
    for (let i = 0; i < 5; i++) assert.equal((await hit(`6.6.6.${i}, 9.9.9.9`)).status, 200);
    assert.equal((await hit('7.7.7.7, 9.9.9.9')).status, 429, 'đổi phần tử đầu vẫn bị tính chung một IP');
    assert.equal((await hit('2.2.2.2')).status, 200, 'IP khác không ảnh hưởng');
    for (let i = 0; i < 5; i++) await hit(`2001:db8:1:2::${i + 1}`);
    assert.equal((await hit('2001:db8:1:2:ffff::5')).status, 429, 'cùng /64');
  } finally { config.rateLimitPerMin = saved; }
});

// ---------- cấu hình production ----------
test('productionProblems: từ chối khởi động khi cấu hình mẫu hoặc thiếu', () => {
  const prod = { production: true, nineIdKeyId: 'family' };
  const DB = 'postgres://family:kXz81hQw93@9ship-db:5432/family';
  const ID = { NINE_ID_SECRET: 'kZ91xQw3Lm7Rt5Vn2Hp8Dc4Bf6Gs0Jy1AeUi' };
  assert.deepEqual(productionProblems({ production: false }, {}), []);
  assert.match(productionProblems(prod, {})[0], /Thiếu DATABASE_URL/);
  assert.ok(productionProblems(prod, { DATABASE_URL: 'postgres://family:x@localhost:5432/family', ...ID }).some((p) => /localhost/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: 'postgres://family:x@127.0.0.1:5432/family', ...ID }).some((p) => /localhost/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: 'postgres://family:MAT_KHAU@9ship-db:5432/family', ...ID }).some((p) => /mật khẩu mẫu/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: 'postgres://postgres:ship@9ship-db:5432/family', ...ID }).some((p) => /mật khẩu mẫu/.test(p)));
  assert.deepEqual(productionProblems(prod, { DATABASE_URL: DB, ...ID }), []);
  assert.ok(productionProblems(prod, { DATABASE_URL: DB, ...ID, VAPID_PUBLIC_KEY: 'a' }).some((p) => /VAPID/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: DB, ...ID, CONSOLE_API_KEY_ID: 'hub', CONSOLE_API_SECRET: 'ngan' }).some((p) => /CONSOLE_API_SECRET/.test(p)));
  // khóa 9id: thiếu, ngắn, còn mẫu, sai địa chỉ, dùng nhầm khóa của app ủy quyền
  assert.ok(productionProblems(prod, { DATABASE_URL: DB }).some((p) => /NINE_ID_SECRET/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: DB, NINE_ID_SECRET: 'ngan' }).some((p) => /NINE_ID_SECRET/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: DB, NINE_ID_SECRET: 'CHANGE_ME'.repeat(5) }).some((p) => /NINE_ID_SECRET/.test(p)));
  assert.ok(productionProblems(prod, { DATABASE_URL: DB, ...ID, NINE_ID_URL: 'ftp://9id' }).some((p) => /NINE_ID_URL/.test(p)));
  assert.ok(productionProblems({ ...prod, nineIdKeyId: 'osin' }, { DATABASE_URL: DB, ...ID }).some((p) => /ủy quyền/.test(p)));
  void base;
});
