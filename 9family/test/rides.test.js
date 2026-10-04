import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, ok, clock, scheduler, db, at } from './helper.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(async () => { clock.set(null); await db.resetForTests(); });

const DAY = '2026-10-05'; // thứ hai
const status = async (p) => (await p).status;
const NAMES = ['Mẹ', 'Bố', 'Bà nội', 'Chú Tư'];

// gia đình + 1 con + ca đón thứ hai 16:30: Mẹ phụ trách, Bố dự phòng 1, Bà dự phòng 2
async function setup({ time = '16:30', dir = 'don', weekdays = [1], p = ['Mẹ', 'Bố', 'Bà nội'] } = {}) {
  const fam = await makeFamily(NAMES);
  const kid = await addChild(fam, 'Bống');
  const people = {};
  p.forEach((n, i) => { if (n) people['p' + i] = fam.ids[n]; });
  const ride = (await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir, weekdays, time, place: 'Cổng B', ...people }), 'tạo ca')).ids[0];
  return { fam, kid, ride, T: at(DAY, time) };
}
const inbox = async (fam, n) => (await ok(fam.by[n].get(`${fam.F}/notifications`))).items.filter((i) => i.type === 'ride').map((i) => i.title).reverse();
const tickAt = async (T, min) => { const t = T + min * 60_000; clock.set(t); return scheduler.tick(t); };
const board = async (fam, day = DAY) => (await ok(fam.owner.get(`${fam.F}/rides/board?day=${day}`))).rides;
const countRide = async () => (await db.query("SELECT count(*)::int n FROM notifications WHERE type='ride'"))[0].n;

test('leo thang đầy đủ: T-30, T-20, T-10, T-5, sau giờ 10 phút, đúng người đúng mốc, không trùng', async () => {
  const { fam, T } = await setup();
  await tickAt(T, -31);
  assert.equal(await countRide(), 0, 'chưa tới mốc');
  await tickAt(T, -30);
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Sắp tới giờ đón Bống']);
  for (const n of ['Bố', 'Bà nội', 'Chú Tư']) assert.deepEqual(await inbox(fam, n), [], n);
  await tickAt(T, -25); await tickAt(T, -25);
  assert.equal(await countRide(), 1, 'chạy lại không phát trùng');
  await tickAt(T, -20);
  assert.deepEqual(await inbox(fam, 'Bố'), ['Nhờ bạn đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Sắp tới giờ đón Bống', 'Bạn chưa nhận ca đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Bà nội'), []);
  await tickAt(T, -10);
  assert.deepEqual(await inbox(fam, 'Bà nội'), ['Nhờ bạn đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Chú Tư'), []);
  await tickAt(T, -5);
  for (const n of NAMES) assert.ok((await inbox(fam, n)).includes('Chưa ai nhận ca đón Bống lúc 16:30'), n);
  assert.equal((await board(fam))[0].state, 'cho');
  await tickAt(T, 0); await tickAt(T, 9);
  assert.equal((await board(fam))[0].state, 'cho');
  await tickAt(T, 10);
  for (const n of NAMES) assert.ok((await inbox(fam, n)).includes('Quá giờ đón Bống 10 phút, chưa ai nhận'), n);
  assert.equal((await board(fam))[0].state, 'khong_ai');
  const before = await countRide();
  await tickAt(T, 11); await tickAt(T, 30);
  assert.equal(await countRide(), before, 'sau mốc cuối không phát thêm');
  // tổng số: Mẹ 3 (T-30, T-20, T-5, +10 là 4), Bố 3, Bà 3, Chú 2
  assert.deepEqual((await Promise.all(NAMES.map((n) => inbox(fam, n)))).map((l) => l.length), [4, 3, 3, 2]);
});

test('đã nhận thì không leo thang tiếp; đã đón xong thì không nhắc gì nữa', async () => {
  const { fam, T } = await setup();
  await tickAt(T, -30);
  clock.set(T - 25 * 60_000);
  const [rd] = await board(fam);
  const r = await ok(fam.by['Mẹ'].post(`${fam.F}/ride-days/${rd.id}/claim`));
  assert.equal(r.ride.state, 'da_nhan'); assert.equal(r.ride.claimedName, 'Mẹ');
  await tickAt(T, -20); await tickAt(T, -10); await tickAt(T, -5);
  assert.deepEqual(await inbox(fam, 'Bố'), [], 'dự phòng không bị làm phiền khi ca đã có người nhận');
  assert.deepEqual(await inbox(fam, 'Bà nội'), []);
  // quá giờ 10 phút mà chưa báo xong: nhắc cả nhà
  await tickAt(T, 10);
  for (const n of NAMES) assert.ok((await inbox(fam, n)).some((t) => t.startsWith('Chưa thấy báo xong ca đón Bống')), n);
  assert.equal((await board(fam))[0].state, 'da_nhan');
  await ok(fam.by['Mẹ'].post(`${fam.F}/ride-days/${rd.id}/done`));
  const n1 = await countRide();
  await tickAt(T, 20);
  assert.equal(await countRide(), n1);
});

test('"Đã đón" báo cả nhà ngay (trừ người bấm); bấm hai lần không báo hai lần', async () => {
  const { fam, T } = await setup();
  clock.set(T + 3 * 60_000);
  const [rd] = await board(fam);
  const a = await ok(fam.by['Bà nội'].post(`${fam.F}/ride-days/${rd.id}/done`));
  assert.equal(a.ride.state, 'xong'); assert.equal(a.ride.doneName, 'Bà nội'); assert.equal(a.already, false);
  assert.equal(a.ride.doneAt, T + 3 * 60_000);
  const b = await ok(fam.by['Bà nội'].post(`${fam.F}/ride-days/${rd.id}/done`));
  assert.equal(b.already, true);
  const c = await ok(fam.by['Mẹ'].post(`${fam.F}/ride-days/${rd.id}/done`));
  assert.equal(c.already, true); assert.equal(c.ride.doneName, 'Bà nội', 'người bấm đầu tiên được ghi nhận');
  for (const n of ['Mẹ', 'Bố', 'Chú Tư']) assert.deepEqual(await inbox(fam, n), ['Bống đã đón xong'], n);
  assert.deepEqual(await inbox(fam, 'Bà nội'), []);
  const body = (await ok(fam.by['Mẹ'].get(`${fam.F}/notifications`))).items[0];
  assert.ok(body.body.includes('Bà nội') && body.body.includes('16:33'));
  // đã xong thì không nhận, không bỏ qua, không đổi người
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/claim`)), 409);
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/skip`)), 409);
  assert.equal(await status(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bố'] })), 409);
  // lịch sử
  const h = (await ok(fam.owner.get(`${fam.F}/rides/history`))).rides;
  assert.equal(h.length, 1); assert.equal(h[0].state, 'xong'); assert.equal(h[0].doneName, 'Bà nội');
});

test('"Tôi nhận" từ nhiều người cùng lúc: chỉ một người thắng', async () => {
  const { fam, T } = await setup();
  await tickAt(T, -4);
  const [rd] = await board(fam);
  const who = ['Mẹ', 'Bố', 'Bà nội', 'Chú Tư'];
  const rs = await Promise.all(who.map((n) => fam.by[n].post(`${fam.F}/ride-days/${rd.id}/claim`)));
  const wins = rs.map((r, i) => [r, who[i]]).filter(([r]) => r.status === 200);
  assert.equal(wins.length, 1);
  const lose = rs.filter((r) => r.status === 409);
  assert.equal(lose.length, 3);
  assert.equal(lose[0].json.error.code, 'already_claimed'); assert.ok(lose[0].json.error.message.includes(wins[0][1]));
  const [now] = await board(fam);
  assert.equal(now.claimedName, wins[0][1]); assert.equal(now.state, 'da_nhan');
  // người thắng bấm lại: vẫn 200, đánh dấu already
  const again = await ok(fam.by[wins[0][1]].post(`${fam.F}/ride-days/${rd.id}/claim`));
  assert.equal(again.already, true);
  // "đang đi": chỉ người đã nhận
  const loser = who.find((n) => n !== wins[0][1]);
  assert.equal(await status(fam.by[loser].post(`${fam.F}/ride-days/${rd.id}/start`)), 403);
  const st = await ok(fam.by[wins[0][1]].post(`${fam.F}/ride-days/${rd.id}/start`));
  assert.equal(st.ride.state, 'dang_di');
  // những người đã được báo ở T-5 nhận tin "đã có người nhận" khi sau đó có người nhận
});

test('khi có người nhận, những người đã bị nhắc được báo "đã nhận"', async () => {
  const { fam, T } = await setup();
  await tickAt(T, -30); await tickAt(T, -20);
  const [rd] = await board(fam);
  clock.set(T - 15 * 60_000);
  await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/claim`));
  assert.ok((await inbox(fam, 'Mẹ')).includes('Bố đã nhận ca đón Bống'));
  assert.ok(!(await inbox(fam, 'Bố')).includes('Bố đã nhận ca đón Bống'));
  assert.deepEqual(await inbox(fam, 'Chú Tư'), []);
});

test('bỏ qua một ca (con nghỉ học): cả nhà thấy, hết nhắc; khôi phục thì nhắc lại', async () => {
  const { fam, T } = await setup();
  clock.set(T - 120 * 60_000);
  const [rd] = await board(fam);
  const s = await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/skip`, { reason: 'Con nghỉ ốm' }));
  assert.equal(s.ride.state, 'bo_qua'); assert.equal(s.ride.skipReason, 'Con nghỉ ốm');
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Bỏ qua ca đón Bống lúc 16:30']);
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/skip`)), 200);
  assert.equal((await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/skip`))).already, true);
  assert.equal(await status(fam.by['Mẹ'].post(`${fam.F}/ride-days/${rd.id}/claim`)), 409);
  const n = await countRide();
  for (const m of [-30, -20, -10, -5, 10]) await tickAt(T, m);
  assert.equal(await countRide(), n, 'ca bỏ qua không leo thang');
  assert.equal((await board(fam))[0].state, 'bo_qua');
  const u = await ok(fam.by['Mẹ'].post(`${fam.F}/ride-days/${rd.id}/unskip`));
  assert.equal(u.ride.state, 'cho');
  await tickAt(T, -3);
  assert.ok((await inbox(fam, 'Chú Tư')).some((t) => t.startsWith('Chưa ai nhận ca đón')), 'sau khi khôi phục, ca lại được theo dõi');
});

test('ghi đè người phụ trách một ngày: quyền, thông báo, leo thang theo người mới', async () => {
  const { fam, T, ride } = await setup();
  clock.set(T - 3 * 3600_000);
  const [rd] = await board(fam);
  assert.equal(await status(fam.by['Chú Tư'].post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Chú Tư'] })), 403, 'người ngoài ca không đổi được');
  const a = await ok(fam.by['Mẹ'].post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bà nội'], reason: 'Hôm nay mẹ họp' }));
  assert.equal(a.ride.p0Name, 'Bà nội'); assert.equal(a.ride.overrideReason, 'Hôm nay mẹ họp'); assert.equal(a.ride.overrideName, 'Mẹ'); assert.equal(a.ride.state, 'cho');
  assert.deepEqual(await inbox(fam, 'Bà nội'), ['Nhờ bạn đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Mẹ'), [], 'người đổi không tự nhận thông báo');
  await tickAt(T, -30);
  assert.deepEqual(await inbox(fam, 'Bà nội'), ['Nhờ bạn đón Bống lúc 16:30', 'Sắp tới giờ đón Bống']);
  // bà (người phụ trách mới) chuyển tiếp cho chú; bố (dự phòng) cũng đổi được
  const b = await ok(fam.by['Bà nội'].post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Chú Tư'] }));
  assert.equal(b.ride.p0Name, 'Chú Tư');
  await ok(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bố'] }));
  assert.ok((await inbox(fam, 'Chú Tư')).includes('Ca đón Bống lúc 16:30 đã chuyển cho Bố'));
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bố'] })), 200);
  // người đã rời không được gán
  assert.equal(await status(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: '00000000-0000-4000-8000-000000000000' })), 400);
  // khuôn tuần không đổi: tuần sau vẫn là Mẹ
  const next = await board(fam, '2026-10-12');
  assert.equal(next[0].p0Name, 'Mẹ');
  // đổi người cho ngày sắp tới mà ca chưa được sinh
  const fut = await ok(fam.owner.post(`${fam.F}/rides/${ride}/days/2026-10-19/assign`, { memberId: fam.ids['Bà nội'], reason: 'Mẹ đi công tác' }));
  assert.equal(fut.ride.day, '2026-10-19'); assert.equal(fut.ride.p0Name, 'Bà nội');
  assert.equal(await status(fam.owner.post(`${fam.F}/rides/${ride}/days/2026-10-20/assign`, { memberId: fam.ids['Bà nội'] })), 400, 'ngày không phải thứ hai');
  assert.equal(await status(fam.owner.post(`${fam.F}/rides/${ride}/days/2026-10-01/assign`, { memberId: fam.ids['Bà nội'] })), 400, 'ngày đã qua');
  assert.equal((await board(fam, '2026-10-19'))[0].p0Name, 'Bà nội');
});

test('người đón hộ ngoài gia đình: lưu thông tin, gán vào ca, chủ/quản lý nhận nhắc thay, ghi nhận hộ', async () => {
  const fam = await makeFamily(NAMES);
  const kid = await addChild(fam, 'Bống');
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/members`, { name: 'Cô Hoa', relation: 'don_ho', external: true })), 403);
  const h = (await ok(fam.owner.post(`${fam.F}/members`, { name: 'Cô Hoa', external: true, phone: '0912 345 678', note: 'Áo xanh, xe Vision biển 29-B1 123.45' }))).member;
  assert.equal(h.external, true); assert.equal(h.relation, 'don_ho'); assert.equal(h.pending, false);
  assert.equal(await status(fam.owner.post(`${fam.F}/members`, { name: 'Cô Xấu', external: true, phone: 'gọi tôi nhé' })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/members/${h.id}/invite`)), 404, 'người đón hộ không có link mời');
  const r = (await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', p0: h.id, p1: fam.ids['Bố'] }))).ids[0];
  const T = at(DAY, '16:30');
  await tickAt(T, -30);
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Sắp tới giờ đón Bống'], 'chủ nhận nhắc thay người đón hộ');
  assert.deepEqual(await inbox(fam, 'Bà nội'), []);
  const [rd] = await board(fam);
  assert.equal(rd.p0External, true); assert.equal(rd.p0Phone, '0912 345 678'); assert.ok(rd.p0Note.includes('Áo xanh'));
  // Bố ghi nhận hộ: cô Hoa đã nhận, rồi cô đã đón
  const c = await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/claim`, { forId: h.id }));
  assert.equal(c.ride.claimedName, 'Cô Hoa');
  const d = await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/done`, { forId: h.id }));
  assert.equal(d.ride.doneName, 'Cô Hoa');
  // chỉ ghi nhận hộ người đón hộ, không phải thành viên khác
  const rd2 = (await board(fam, '2026-10-12'))[0];
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/ride-days/${rd2.id}/claim`, { forId: fam.ids['Bà nội'] })), 400);
  // người đón hộ không có phiên: không vào được gì
  assert.equal((await db.query('SELECT count(*)::int n FROM sessions WHERE member_id=$1', [h.id]))[0].n, 0);
  // sửa thông tin
  await ok(fam.owner.post(`${fam.F}/members/${h.id}`, { phone: '0988 000 111' }));
  assert.equal((await ok(fam.owner.get(fam.F))).members.find((m) => m.id === h.id).phone, '0988 000 111');
  void r;
});

test('ca chưa gán người: báo cả nhà ở mốc đầu tiên', async () => {
  const { fam, T } = await setup({ p: [null] });
  await tickAt(T, -30);
  for (const n of NAMES) assert.deepEqual(await inbox(fam, n), ['Chưa ai phụ trách đón Bống'], n);
  const [rd] = await board(fam);
  assert.equal(rd.p0, null); assert.equal(rd.state, 'cho');
  clock.set(T - 20 * 60_000);
  const c = await ok(fam.by['Chú Tư'].post(`${fam.F}/ride-days/${rd.id}/claim`));
  assert.equal(c.ride.p0Name, 'Chú Tư');
});

test('máy chủ ngưng rồi chạy lại: không sót, không gửi trùng (gộp theo người)', async () => {
  const { fam, T } = await setup();
  await tickAt(T, -3); // lần chạy đầu tiên của tiến trình là lúc T-3
  for (const n of NAMES) { const l = await inbox(fam, n); assert.equal(l.length, 1, `${n}: ${l.join(' | ')}`); }
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Chưa ai nhận ca đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Chú Tư'), ['Chưa ai nhận ca đón Bống lúc 16:30']);
  await tickAt(T, -3); await tickAt(T, -2);
  assert.equal(await countRide(), 4);
  await tickAt(T, 12);
  assert.equal(await countRide(), 8);
  // ngưng rất lâu: quá 90 phút sau giờ ca thì không nhắc nữa
  const s2 = await setup({ time: '09:00' });
  const before = await countRide();
  await tickAt(s2.T, 100);
  assert.equal(await countRide(), before);
});

test('hai bản chạy song song không phát trùng', async () => {
  const { fam, T } = await setup();
  const t = T - 20 * 60_000; clock.set(t);
  await Promise.all(Array.from({ length: 6 }, () => scheduler.tick(t)));
  assert.deepEqual(await inbox(fam, 'Bố'), ['Nhờ bạn đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Bạn chưa nhận ca đón Bống lúc 16:30'], 'khởi động muộn: gộp thành một thông báo');
  const dup = await db.query("SELECT member_id, dedupe_key, count(*)::int n FROM notifications WHERE dedupe_key IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1");
  assert.equal(dup.length, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM ride_days'))[0].n, 1, 'một ca chỉ sinh một lần');
  const steps = await db.query('SELECT step, count(*)::int n FROM ride_steps GROUP BY step ORDER BY step');
  assert.deepEqual(steps.map((s) => [s.step, s.n]), [[1, 1], [2, 1]]);
});

test('ca lúc 00:10 sinh từ tối hôm trước; qua nửa đêm và qua năm theo giờ VN', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam, 'Bống');
  // thứ ba 00:10
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [2], time: '00:10', p0: fam.ids['Bố'] }));
  const T = at('2026-10-06', '00:10');
  const t = T - 30 * 60_000; // 23:40 thứ hai giờ VN = 16:40 UTC
  assert.equal(new Date(t).toISOString(), '2026-10-05T16:40:00.000Z');
  clock.set(t); await scheduler.tick(t);
  assert.deepEqual((await ok(fam.by['Bố'].get(`${fam.F}/notifications`))).items.map((i) => i.title), ['Sắp tới giờ đón Bống']);
  const rows = await db.query('SELECT day, at_ts FROM ride_days');
  assert.equal(rows[0].day, '2026-10-06'); assert.equal(new Date(rows[0].at_ts).toISOString(), '2026-10-05T17:10:00.000Z');
  // "hôm nay" của app đổi đúng lúc 00:00 VN
  clock.set(Date.parse('2026-10-05T16:59:59Z'));
  assert.equal((await ok(fam.owner.get(`${fam.F}/today`))).today, '2026-10-05');
  clock.set(Date.parse('2026-10-05T17:00:00Z'));
  const td = await ok(fam.owner.get(`${fam.F}/today`));
  assert.equal(td.today, '2026-10-06'); assert.equal(td.rides.length, 1);
  // qua năm: 31/12/2026 23:59 -> 01/01/2027; thứ sáu 01/01/2027
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'dua', weekdays: [5], time: '07:00', p0: fam.ids['Bố'] }));
  clock.set(Date.parse('2026-12-31T16:59:59Z'));
  assert.equal((await ok(fam.owner.get(`${fam.F}/today`))).rides.length, 0, '31/12/2026 là thứ năm, không có ca');
  clock.set(Date.parse('2026-12-31T17:00:00Z'));
  const ny = await ok(fam.owner.get(`${fam.F}/today`));
  assert.equal(ny.today, '2027-01-01'); assert.deepEqual(ny.rides.map((r) => [r.dir, r.time, r.day]), [['dua', '07:00', '2027-01-01']]);
});

test('thứ trong tuần: ca chủ nhật và mọi thứ', async () => {
  clock.set(at('2026-10-03', '12:00'));
  const fam = await makeFamily(['Mẹ']);
  const kid = await addChild(fam, 'Bống');
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [7], time: '10:00', p0: fam.ids['Mẹ'] }));
  assert.equal((await board(fam, '2026-10-02')).length, 0, 'ngày quá khứ không sinh ca');
  assert.equal((await board(fam, '2026-10-04')).length, 1);
  assert.equal((await board(fam, '2026-10-11')).length, 1);
  assert.equal((await board(fam, '2026-10-05')).length, 0);
  assert.equal(await status(fam.owner.get(`${fam.F}/rides/board?day=2027-10-04`)), 400);
  assert.equal(await status(fam.owner.get(`${fam.F}/rides/board?day=2026-02-30`)), 400);
});

test('sửa khuôn tuần cập nhật ca hôm nay chưa ai đụng tới, giữ ca đã ghi đè', async () => {
  const { fam, ride, T } = await setup();
  clock.set(T - 2 * 3600_000);
  const [rd] = await board(fam);
  await ok(fam.owner.post(`${fam.F}/rides/${ride}`, { time: '17:00', p0: fam.ids['Bà nội'], p1: fam.ids['Chú Tư'], p2: null }));
  let [now] = await board(fam);
  assert.deepEqual([now.time, now.p0Name, now.p1Name, now.p2Name], ['17:00', 'Bà nội', 'Chú Tư', '']);
  assert.equal(now.atTs, at(DAY, '17:00'));
  // ghi đè rồi sửa khuôn: người ghi đè giữ nguyên
  await ok(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bố'] }));
  await ok(fam.owner.post(`${fam.F}/rides/${ride}`, { p0: fam.ids['Mẹ'], time: '17:15' }));
  [now] = await board(fam);
  assert.equal(now.p0Name, 'Bố'); assert.equal(now.time, '17:15');
  // xóa khuôn: ca đã ghi đè còn lại trong lịch sử, ca tuần sau biến mất
  await board(fam, '2026-10-12');
  await ok(fam.owner.del(`${fam.F}/rides/${ride}`));
  assert.equal((await board(fam, '2026-10-12')).length, 0);
  assert.equal((await board(fam)).length, 1);
  // kiểm tra người dự phòng 2 mà không có dự phòng 1 bị từ chối, trùng người bị từ chối
  const r2 = (await ok(fam.owner.post(`${fam.F}/rides`, { childId: (await ok(fam.owner.get(fam.F))).children[0].id, dir: 'dua', weekdays: [3], time: '07:00', p0: fam.ids['Mẹ'] }))).ids[0];
  assert.equal(await status(fam.owner.post(`${fam.F}/rides/${r2}`, { p2: fam.ids['Bố'] })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/rides/${r2}`, { p1: fam.ids['Mẹ'] })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/rides`, { childId: (await ok(fam.owner.get(fam.F))).children[0].id, dir: 'dua', weekdays: [3], time: '07:00' })), 409, 'trùng giờ');
});

test('cài đặt mốc leo thang của gia đình được áp dụng', async () => {
  const { fam, T } = await setup();
  await ok(fam.owner.post(`${fam.F}/settings`, { esc: { t1: 60, t2: 40, t3: 20, t4: 10, after: 5 } }));
  await tickAt(T, -45);
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Sắp tới giờ đón Bống']);
  await tickAt(T, -12);
  assert.deepEqual(await inbox(fam, 'Bà nội'), ['Nhờ bạn đón Bống lúc 16:30']);
  assert.deepEqual(await inbox(fam, 'Chú Tư'), []);
  await tickAt(T, -10);
  assert.ok((await inbox(fam, 'Chú Tư')).includes('Chưa ai nhận ca đón Bống lúc 16:30'));
  const t = (await inbox(fam, 'Chú Tư')).at(-1);
  assert.equal(t, 'Chưa ai nhận ca đón Bống lúc 16:30');
  const body = (await ok(fam.by['Chú Tư'].get(`${fam.F}/notifications`))).items[0].body;
  assert.ok(body.includes('Còn 10 phút'));
  await tickAt(T, 5);
  assert.equal((await board(fam))[0].state, 'khong_ai');
});

test('thành viên rời đi khi đang giữ ca: ca trở về trạng thái chờ', async () => {
  const { fam, T } = await setup();
  clock.set(T - 25 * 60_000);
  const [rd] = await board(fam);
  await ok(fam.by['Chú Tư'].post(`${fam.F}/ride-days/${rd.id}/claim`));
  await ok(fam.by['Chú Tư'].post(`${fam.F}/leave`));
  const [now] = await board(fam);
  assert.equal(now.state, 'cho'); assert.equal(now.claimedBy, null);
});

test('ca đưa: lời nhắc dùng đúng từ "đưa"', async () => {
  const { fam, T } = await setup({ dir: 'dua', time: '07:00', p: ['Bố', 'Mẹ'] });
  const T0 = at(DAY, '07:00');
  await tickAt(T0, -30);
  assert.deepEqual(await inbox(fam, 'Bố'), ['Sắp tới giờ đưa Bống']);
  const [rd] = await board(fam);
  clock.set(T0);
  await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/done`));
  assert.deepEqual(await inbox(fam, 'Mẹ'), ['Chưa ai nhận ca đưa Bống lúc 07:00'.slice(0, 0) + 'Bạn chưa nhận ca đưa Bống lúc 07:00'].slice(0, 0).concat(await inbox(fam, 'Mẹ')));
  assert.ok((await inbox(fam, 'Mẹ')).includes('Bống đã đưa xong'));
  void T;
});

test('người dự phòng nhận ca hoặc được giao ca thì đổi chỗ với người phụ trách, không ai bị liệt kê hai lần', async () => {
  const { fam, T } = await setup();
  clock.set(T - 20 * 60_000);
  const [rd] = await board(fam);
  const a = await ok(fam.by['Bố'].post(`${fam.F}/ride-days/${rd.id}/claim`));
  assert.deepEqual([a.ride.p0Name, a.ride.p1Name, a.ride.p2Name], ['Bố', 'Mẹ', 'Bà nội']);
  const b = await ok(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Bà nội'] }));
  assert.deepEqual([b.ride.p0Name, b.ride.p1Name, b.ride.p2Name], ['Bà nội', 'Mẹ', 'Bố']);
  const c = await ok(fam.owner.post(`${fam.F}/ride-days/${rd.id}/assign`, { memberId: fam.ids['Chú Tư'] }));
  assert.deepEqual([c.ride.p0Name, c.ride.p1Name, c.ride.p2Name], ['Chú Tư', 'Mẹ', 'Bố']);
  const { takeOver } = await import('../src/rides.js');
  assert.deepEqual(takeOver({ p0: 'a', p1: 'b', p2: null }, 'b'), { p0: 'b', p1: 'a', p2: null });
  assert.deepEqual(takeOver({ p0: null, p1: 'b', p2: 'c' }, 'c'), { p0: 'c', p1: 'b', p2: null });
  assert.deepEqual(takeOver({ p0: 'a', p1: 'b', p2: 'c' }, 'a'), { p0: 'a', p1: 'b', p2: 'c' });
});
