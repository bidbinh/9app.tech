import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, shutdown, makeFamily, addChild, newUser, ok, Client, clock, scheduler, db, at, config } from './helper.js';
import { solarToLunar, lunarToSolar } from '../src/lunar.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(async () => { clock.set(null); await db.resetForTests(); });

const status = async (p) => (await p).status;
const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const inbox = async (fam, n) => (await ok(fam.by[n].get(`${fam.F}/notifications`))).items.filter((i) => i.type !== 'family').map((i) => i.title).reverse();
const tickAt = (ms) => { clock.set(ms); return scheduler.tick(ms); };
const cal = async (fam, from, to, extra = '') => (await ok(fam.owner.get(`${fam.F}/calendar?from=${from}&to=${to}${extra}`))).events;
const ev0 = { title: 'Học múa', kind: 'nang_khieu', start: '16:00', end: '17:00', location: 'CLB Hoa Sen' };

test('sự kiện một lần và lặp: tạo, xem hôm nay/tuần/tháng, lọc theo con', async () => {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const k1 = await addChild(fam, 'Bống'); const k2 = await addChild(fam, 'Cún');
  await ok(fam.owner.post(`${fam.F}/events`, { ...ev0, startDate: '2026-10-05', recType: 'weekly', recDays: [1, 3], childIds: [k1.id], checklist: ['Giày múa', 'Nước'] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Họp phụ huynh', kind: 'hop_phu_huynh', startDate: '2026-10-10', start: '08:00', childIds: [k2.id] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Ăn tối cả nhà', kind: 'gia_dinh', startDate: '2026-10-05', recType: 'daily', start: '19:00' }));
  const td = await ok(fam.by['Bố'].get(`${fam.F}/today`));
  assert.equal(td.today, '2026-10-05'); assert.deepEqual(td.events.map((e) => e.title), ['Học múa', 'Ăn tối cả nhà']);
  assert.deepEqual(td.tomorrowEvents.map((e) => e.title), ['Ăn tối cả nhà']);
  assert.deepEqual(td.events[0].checklist, ['Giày múa', 'Nước']);
  const week = await cal(fam, '2026-10-05', '2026-10-11');
  assert.equal(week.filter((e) => e.title === 'Học múa').length, 2);
  assert.equal(week.filter((e) => e.title === 'Ăn tối cả nhà').length, 7);
  assert.equal(week.filter((e) => e.title === 'Họp phụ huynh').length, 1);
  const forK1 = await cal(fam, '2026-10-01', '2026-10-31', `&childId=${k1.id}`);
  assert.ok(forK1.length === 8 && forK1.every((e) => e.title === 'Học múa'));
  const forK2 = await cal(fam, '2026-10-01', '2026-10-31', `&childId=${k2.id}`);
  assert.deepEqual(forK2.map((e) => e.title), ['Họp phụ huynh']);
  const month = await ok(fam.owner.get(`${fam.F}/calendar?from=2026-10-01&to=2026-11-01`));
  assert.equal(Object.keys(month.lunar).length, 32); assert.deepEqual(month.lunar['2026-10-05'].length, 3);
  const l = solarToLunar('2026-10-05'); assert.deepEqual(month.lunar['2026-10-05'], [l.day, l.month, 0]);
  // tối đa 62 ngày một lần gọi, ngày sai bị từ chối
  assert.equal(await status(fam.owner.get(`${fam.F}/calendar?from=2026-01-01&to=2026-12-31`)), 400);
  assert.equal(await status(fam.owner.get(`${fam.F}/calendar?from=2026-10-10&to=2026-10-01`)), 400);
  assert.equal(await status(fam.owner.get(`${fam.F}/calendar?from=2026-10-01`)), 400);
  assert.equal((await ok(fam.owner.get(`${fam.F}/calendar?from=2026-10-01&to=2026-12-01`))).events.length > 0, true);
  // qua năm
  const ny = await cal(fam, '2026-12-28', '2027-01-03');
  assert.deepEqual(ny.filter((e) => e.title === 'Học múa').map((e) => e.day), ['2026-12-28', '2026-12-30', '2027-01-01'].filter((d) => [1, 3].includes(new Date(d + 'T00:00:00Z').getUTCDay() || 7)).concat(['2027-01-04'].slice(0, 0)));
});

test('quyền sửa sự kiện: người tạo hoặc quản lý; nội dung kiểm tra chặt', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội']);
  const e1 = (await ok(fam.by['Bà nội'].post(`${fam.F}/events`, { title: 'Khám mắt', kind: 'kham', startDate: '2026-10-12', start: '09:00' }))).event;
  assert.equal(e1.createdBy, fam.ids['Bà nội']);
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/events/${e1.id}`, { title: 'Sửa', startDate: '2026-10-12', start: '09:00' })), 403);
  assert.equal(await status(fam.by['Bố'].del(`${fam.F}/events/${e1.id}`)), 403);
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/events/${e1.id}`))).canEdit, false);
  await ok(fam.by['Bà nội'].post(`${fam.F}/events/${e1.id}`, { title: 'Khám mắt 👁', kind: 'kham', startDate: '2026-10-12', start: '10:00' }));
  await ok(fam.owner.post(`${fam.F}/events/${e1.id}`, { title: 'Khám mắt (mẹ sửa)', kind: 'kham', startDate: '2026-10-12', start: '10:30' }));
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/events/${e1.id}`))).event.start, '10:30');
  for (const b of [{ title: '' }, { title: 'x', start: '7h' }, { title: 'x', startDate: '2026-02-30' }, { title: 'x', recType: 'weekly' }, { title: 'x', notifyOffsets: [5] }, { title: 'x', checklist: Array(21).fill('a') }, { title: 'x', kind: 'abc' }]) {
    assert.equal(await status(fam.owner.post(`${fam.F}/events`, { startDate: '2026-10-12', start: '09:00', ...b })), 400, JSON.stringify(b));
  }
  assert.equal(await status(fam.owner.post(`${fam.F}/events`, { title: 'x', allDay: true, startDate: '2026-10-12' })), 200, 'cả ngày không cần giờ');
  await ok(fam.by['Bà nội'].del(`${fam.F}/events/${e1.id}`));
  assert.equal(await status(fam.owner.get(`${fam.F}/events/${e1.id}`)), 404);
});

test('ngoại lệ: xóa/sửa một ngày, khôi phục, từ ngày này không lặp nữa', async () => {
  const fam = await makeFamily(['Mẹ']);
  const e = (await ok(fam.owner.post(`${fam.F}/events`, { ...ev0, startDate: '2026-10-05', recType: 'weekly', recDays: [1] }))).event;
  const url = `${fam.F}/events/${e.id}`;
  assert.equal(await status(fam.owner.post(`${url}/exceptions`, { day: '2026-10-06', action: 'skip' })), 400, 'ngày không có sự kiện');
  await ok(fam.owner.post(`${url}/exceptions`, { day: '2026-10-12', action: 'skip' }));
  await ok(fam.owner.post(`${url}/exceptions`, { day: '2026-10-19', action: 'edit', title: 'Múa (đổi phòng)', start: '17:00', end: '18:00', location: 'Phòng 3' }));
  assert.equal(await status(fam.owner.post(`${url}/exceptions`, { day: '2026-10-26', action: 'edit', start: '10:00', end: '09:00' })), 400);
  let days = await cal(fam, '2026-10-05', '2026-11-02');
  assert.deepEqual(days.map((d) => d.day), ['2026-10-05', '2026-10-19', '2026-10-26', '2026-11-02']);
  const edited = days.find((d) => d.day === '2026-10-19');
  assert.deepEqual([edited.title, edited.start, edited.end, edited.location, edited.edited], ['Múa (đổi phòng)', '17:00', '18:00', 'Phòng 3', true]);
  assert.equal(days[0].edited, false);
  const full = await ok(fam.owner.get(url));
  assert.deepEqual(full.exceptions.map((x) => [x.day, x.action]), [['2026-10-12', 'skip'], ['2026-10-19', 'edit']]);
  await ok(fam.owner.del(`${url}/exceptions/2026-10-12`));
  days = await cal(fam, '2026-10-05', '2026-10-13');
  assert.equal(days.length, 2);
  // từ ngày 26/10 không lặp nữa
  await ok(fam.owner.post(`${url}/end-from`, { day: '2026-10-26' }));
  days = await cal(fam, '2026-10-05', '2026-12-01');
  assert.deepEqual(days.map((d) => d.day), ['2026-10-05', '2026-10-12', '2026-10-19']);
  // đổi quy tắc lặp thì ngoại lệ không còn khớp bị gỡ
  await ok(fam.owner.post(url, { ...ev0, startDate: '2026-10-05', recType: 'weekly', recDays: [2] }));
  assert.equal((await ok(fam.owner.get(url))).exceptions.length, 0);
  // end-from tại ngày đầu: xóa luôn
  assert.equal((await ok(fam.owner.post(`${url}/end-from`, { day: '2026-10-05' }))).deleted, true);
  assert.equal(await status(fam.owner.get(url)), 404);
  // sự kiện hằng năm: sinh nhật
  const b = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Sinh nhật Bống 🎂', kind: 'ngay_quan_trong', allDay: true, startDate: '2018-02-28', recType: 'yearly', notifyOffsets: [1440, 0] }))).event;
  assert.deepEqual((await cal(fam, '2026-02-01', '2026-03-31')).map((x) => x.day), ['2026-02-28']);
  void b;
});

test('xem trước các lần diễn ra kể cả âm lịch', async () => {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(['Mẹ']);
  const p = await ok(fam.owner.post(`${fam.F}/events/preview`, { title: 'Giỗ ông', kind: 'ngay_quan_trong', allDay: true, recType: 'yearly_lunar', lunarMonth: 8, lunarDay: 20 }));
  assert.equal(p.next.length, 4);
  assert.deepEqual(p.next.map((n) => n.day), [2027, 2028, 2029, 2030].map((y) => lunarToSolar(20, 8, y)));
  assert.ok(p.next.every((n) => n.lunar[0] === 20 && n.lunar[1] === 8));
  const m = await ok(fam.owner.post(`${fam.F}/events/preview`, { title: 'Rằm', allDay: true, recType: 'monthly_lunar', lunarDay: 15 }));
  assert.deepEqual(m.next.map((n) => n.lunar[0]), [15, 15, 15, 15]);
  assert.equal((await db.query('SELECT count(*)::int n FROM events'))[0].n, 0, 'xem trước không lưu');
  assert.equal(await status(fam.owner.post(`${fam.F}/events/preview`, { title: 'x', recType: 'yearly_lunar', lunarMonth: 13, lunarDay: 1 })), 400);
});

test('nhắc sự kiện đúng giờ VN, đúng người, đúng một lần', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội']);
  const kid = await addChild(fam);
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Đóng học phí', startDate: '2026-10-05', recType: 'weekly', recDays: [1], start: '07:30', notifyOffsets: [30], memberIds: [fam.ids['Bố']], childIds: [kid.id] }));
  const S = at('2026-10-12', '07:30');
  await tickAt(S - 31 * 60_000);
  assert.deepEqual(await inbox(fam, 'Bố'), []);
  await tickAt(S - 30 * 60_000); await tickAt(S - 29 * 60_000); await tickAt(S - 29 * 60_000);
  assert.deepEqual(await inbox(fam, 'Bố'), ['30 phút nữa: Đóng học phí']);
  assert.deepEqual(await inbox(fam, 'Mẹ'), [], 'chỉ người được gắn nhận nhắc');
  // không gắn ai: cả nhà nhận
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Dọn nhà', startDate: '2026-10-12', start: '15:00', notifyOffsets: [10] }));
  await tickAt(at('2026-10-12', '14:50'));
  for (const n of ['Mẹ', 'Bố', 'Bà nội']) assert.ok((await inbox(fam, n)).includes('10 phút nữa: Dọn nhà'), n);
});

test('nhắc sự kiện: mốc 1 ngày trước, ngoại lệ, quá hạn muộn không nhắc', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const e = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Khám răng', startDate: '2026-10-12', start: '09:00', notifyOffsets: [1440, 60, 0] }))).event;
  const S = at('2026-10-12', '09:00');
  await tickAt(S - 1440 * 60_000 - 60_000); assert.deepEqual(await inbox(fam, 'Mẹ'), []);
  await tickAt(S - 1440 * 60_000); assert.deepEqual(await inbox(fam, 'Mẹ'), ['Ngày mai: Khám răng']);
  await tickAt(S - 3600_000); await tickAt(S - 3600_000);
  await tickAt(S);
  assert.deepEqual(await inbox(fam, 'Bố'), ['Ngày mai: Khám răng', '1 giờ nữa: Khám răng', 'Đến giờ: Khám răng']);
  // tiến trình chết đúng lúc 1 giờ trước và khởi động lại sau 40 phút: bỏ lỡ, không nhắc muộn
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Họp lớp', startDate: '2026-10-13', start: '09:00', notifyOffsets: [60] }));
  await tickAt(at('2026-10-13', '09:40'));
  assert.ok(!(await inbox(fam, 'Mẹ')).includes('1 giờ nữa: Họp lớp'));
  // ngoại lệ: bỏ một ngày thì không nhắc ngày đó; sửa giờ thì nhắc theo giờ mới
  const w = (await ok(fam.owner.post(`${fam.F}/events`, { title: 'Bơi', startDate: '2026-10-19', recType: 'weekly', recDays: [1], start: '10:00', notifyOffsets: [30] }))).event;
  await ok(fam.owner.post(`${fam.F}/events/${w.id}/exceptions`, { day: '2026-10-19', action: 'skip' }));
  await ok(fam.owner.post(`${fam.F}/events/${w.id}/exceptions`, { day: '2026-10-26', action: 'edit', start: '14:00' }));
  await tickAt(at('2026-10-19', '09:30')); assert.ok(!(await inbox(fam, 'Mẹ')).includes('30 phút nữa: Bơi'));
  await tickAt(at('2026-10-26', '09:30')); assert.ok(!(await inbox(fam, 'Mẹ')).includes('30 phút nữa: Bơi'));
  await tickAt(at('2026-10-26', '13:30')); assert.ok((await inbox(fam, 'Mẹ')).includes('30 phút nữa: Bơi'));
  void e;
});

test('ngày quan trọng âm lịch: nhắc trước 1 ngày và đúng ngày lúc 07:00, loại "important"', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Giỗ ông nội', kind: 'ngay_quan_trong', allDay: true, startDate: '2026-01-01', recType: 'yearly_lunar', lunarMonth: 8, lunarDay: 20, notifyOffsets: [1440, 0] }));
  const d = lunarToSolar(20, 8, 2026);
  await tickAt(at(d, '06:59').valueOf() - 86400_000); assert.deepEqual(await inbox(fam, 'Bố'), []);
  await tickAt(at(d, '07:00') - 86400_000);
  await tickAt(at(d, '07:00'));
  await tickAt(at(d, '07:00'));
  const items = (await ok(fam.by['Bố'].get(`${fam.F}/notifications`))).items.reverse();
  assert.deepEqual(items.map((i) => i.title), ['Ngày mai: Giỗ ông nội', 'Hôm nay: Giỗ ông nội']);
  assert.ok(items.every((i) => i.type === 'important'));
  assert.ok(items[1].body.includes('âm lịch 20/8'));
  // năm sau đúng ngày mới
  const d2 = lunarToSolar(20, 8, 2027);
  await tickAt(at(d2, '07:00'));
  assert.equal((await inbox(fam, 'Bố')).length, 3);
  // rằm hằng tháng
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Rằm', kind: 'ngay_quan_trong', allDay: true, startDate: '2027-02-01', recType: 'monthly_lunar', lunarDay: 15, notifyOffsets: [0] }));
  const r = lunarToSolar(15, 2, 2027);
  await tickAt(at(r, '07:00'));
  assert.ok((await inbox(fam, 'Mẹ')).includes('Hôm nay: Rằm'));
});

test('việc chung: giao việc, nhắc đến hạn một lần, hoàn thành, quyền', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội']);
  const t = (await ok(fam.owner.post(`${fam.F}/tasks`, { title: 'Đóng tiền điện', assigneeId: fam.ids['Bố'], due: '2026-10-10' }))).task;
  assert.deepEqual(await inbox(fam, 'Bố'), ['Mẹ giao việc cho bạn']);
  assert.deepEqual(await inbox(fam, 'Mẹ'), []);
  await tickAt(at('2026-10-10', '06:59')); assert.equal((await inbox(fam, 'Bố')).length, 1);
  await tickAt(at('2026-10-10', '07:00')); await tickAt(at('2026-10-10', '08:00'));
  assert.deepEqual(await inbox(fam, 'Bố'), ['Mẹ giao việc cho bạn', 'Việc đến hạn: Đóng tiền điện']);
  const lists = await ok(fam.by['Bà nội'].get(`${fam.F}/lists`));
  assert.equal(lists.tasks[0].title, 'Đóng tiền điện');
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/tasks/${t.id}`, { title: 'Sửa' })), 403);
  assert.equal(await status(fam.by['Bà nội'].del(`${fam.F}/tasks/${t.id}`)), 403);
  clock.set(at('2026-10-10', '09:00'));
  const d1 = await ok(fam.by['Bà nội'].post(`${fam.F}/tasks/${t.id}/done`));
  assert.equal(d1.task.done, true); assert.equal(d1.task.doneBy, 'Bà nội');
  assert.equal((await ok(fam.by['Bố'].post(`${fam.F}/tasks/${t.id}/done`))).already, true);
  assert.equal((await ok(fam.owner.post(`${fam.F}/tasks/${t.id}/done`, { done: false }))).task.done, false);
  await ok(fam.by['Bố'].post(`${fam.F}/tasks/${t.id}`, { due: '2026-10-20' }));
  assert.equal(await status(fam.owner.post(`${fam.F}/tasks`, { title: '', })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/tasks`, { title: 'x', due: '2026-02-30' })), 400);
  await ok(fam.owner.del(`${fam.F}/tasks/${t.id}`));
  assert.equal((await ok(fam.owner.get(`${fam.F}/lists`))).tasks.length, 0);
  // việc xong quá 7 ngày không còn hiện
  const t2 = (await ok(fam.owner.post(`${fam.F}/tasks`, { title: 'Cũ' }))).task;
  await ok(fam.owner.post(`${fam.F}/tasks/${t2.id}/done`));
  clock.set(at('2026-10-20', '09:00'));
  assert.equal((await ok(fam.owner.get(`${fam.F}/lists`))).tasks.length, 0);
});

test('danh sách mua sắm dùng chung', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const r = await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'Sữa tươi, trứng gà\nBánh mì 🥖' }));
  assert.deepEqual(r.items.map((i) => i.text), ['Sữa tươi', 'Trứng gà', 'Bánh mì 🥖']);
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping`, { text: '  ,\n ' })), 400);
  const [a, b] = r.items;
  assert.equal((await ok(fam.by['Bố'].post(`${fam.F}/shopping/${a.id}/bought`))).already, false);
  assert.equal((await ok(fam.owner.post(`${fam.F}/shopping/${a.id}/bought`))).already, true, 'hai người tích cùng lúc');
  const lists = await ok(fam.owner.get(`${fam.F}/lists`));
  assert.deepEqual(lists.shopping.map((s) => [s.text, s.bought, s.boughtBy]), [['Trứng gà', false, ''], ['Bánh mì 🥖', false, ''], ['Sữa tươi', true, 'Bố']]);
  assert.equal(await status(fam.by['Bố'].del(`${fam.F}/shopping/${b.id}`)), 403, 'người khác thêm thì không xóa');
  await ok(fam.owner.del(`${fam.F}/shopping/${a.id}`));
  await ok(fam.by['Bố'].post(`${fam.F}/shopping/${b.id}/bought`));
  assert.equal((await ok(fam.owner.post(`${fam.F}/shopping/clear-bought`))).removed, 1);
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/shopping/${b.id}/bought`)), 404, 'món đã dọn không còn');
});

test('hộp thông báo: chỉ của mình, đánh dấu đã đọc, chấm đỏ', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  await ok(fam.owner.post(`${fam.F}/tasks`, { title: 'Mua gạo', assigneeId: fam.ids['Bố'] }));
  const meBase = (await ok(fam.owner.get(`${fam.F}/pulse`))).unread; // lần đồng bộ đầu tiên của gia đình không báo "đã vào gia đình"
  assert.equal(meBase, 0);
  // người vào sau đó thì chủ được báo
  const late = newUser('Chú Út'); fam.fake.addMember(fam.fid, late.userId, 'thanh_vien'); await ok(fam.owner.get(fam.F));
  assert.equal((await ok(fam.owner.get(`${fam.F}/pulse`))).unread, 1);
  await ok(fam.owner.post(`${fam.F}/notifications/read`));
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/pulse`))).unread, 1);
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/today`))).unread, 1);
  const items = (await ok(fam.by['Bố'].get(`${fam.F}/notifications`))).items;
  assert.equal(items[0].read, false);
  await ok(fam.owner.post(`${fam.F}/notifications/read`));
  assert.equal((await ok(fam.owner.get(`${fam.F}/pulse`))).unread, 0);
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/pulse`))).unread, 1, 'đánh dấu của người khác không ảnh hưởng');
  await ok(fam.by['Bố'].post(`${fam.F}/notifications/read`, { upTo: items[0].id }));
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/pulse`))).unread, 0);
  assert.equal((await ok(fam.by['Bố'].get('/api/me'))).families[0].unread, 0);
});

// ---------- thời khóa biểu ----------
const GRID = {
  periods: [{ n: 1, start: '07:00', end: '07:45' }, { n: 2, start: '07:50', end: '08:35' }, { n: 3, start: '08:50', end: '09:35' }],
  cells: [{ weekday: 1, period: 1, subject: 'Toán' }, { weekday: 1, period: 2, subject: 'Toán' }, { weekday: 1, period: 3, subject: 'Tiếng Việt' }, { weekday: 3, period: 1, subject: 'Toán' }, { weekday: 3, period: 2, subject: 'Toán' }, { weekday: 4, period: 3, subject: 'Mỹ thuật 🎨' }],
};
test('thời khóa biểu bằng lưới: sinh sự kiện lặp tuần, thay thế, xóa', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam, 'Bống'); const other = await addChild(fam, 'Cún');
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/timetable`, { childId: kid.id, startDate: '2026-09-07', ...GRID })), 403);
  const r = await ok(fam.owner.post(`${fam.F}/timetable`, { childId: kid.id, startDate: '2026-09-07', untilDate: '2026-12-31', ...GRID }));
  assert.equal(r.created, 3);
  const days = await cal(fam, '2026-10-05', '2026-10-11', `&childId=${kid.id}`);
  assert.deepEqual(days.map((d) => `${d.day} ${d.start}-${d.end} ${d.title}`), ['2026-10-05 07:00-08:35 Toán', '2026-10-05 08:50-09:35 Tiếng Việt', '2026-10-07 07:00-08:35 Toán', '2026-10-08 08:50-09:35 Mỹ thuật 🎨']);
  assert.equal((await cal(fam, '2026-10-05', '2026-10-11', `&childId=${other.id}`)).length, 0);
  assert.equal((await cal(fam, '2027-01-04', '2027-01-10')).length, 0, 'hết hiệu lực sau 31/12');
  assert.equal((await cal(fam, '2026-09-01', '2026-09-06')).length, 0, 'chưa có hiệu lực');
  const g = (await ok(fam.owner.get(`${fam.F}/timetable/${kid.id}`))).timetable;
  assert.equal(g.cells.length, 6); assert.equal(g.periods.length, 3); assert.equal(g.startDate, '2026-09-07');
  // nhập lại thay thế bản cũ
  await ok(fam.owner.post(`${fam.F}/timetable`, { childId: kid.id, startDate: '2026-09-07', periods: GRID.periods, cells: [{ weekday: 2, period: 1, subject: 'Anh' }] }));
  assert.deepEqual((await cal(fam, '2026-10-05', '2026-10-11')).map((d) => d.title), ['Anh']);
  // sai đầu vào
  const bad = (b) => status(fam.owner.post(`${fam.F}/timetable`, { childId: kid.id, startDate: '2026-09-07', ...GRID, ...b }));
  assert.equal(await bad({ cells: [] }), 400);
  assert.equal(await bad({ cells: [{ weekday: 1, period: 9, subject: 'x' }] }), 400);
  assert.equal(await bad({ periods: [{ n: 1, start: '08:00', end: '07:00' }] }), 400);
  assert.equal(await bad({ cells: [{ weekday: 8, period: 1, subject: 'x' }] }), 400);
  assert.equal(await bad({ untilDate: '2026-01-01' }), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/timetable`, { childId: '00000000-0000-4000-8000-000000000000', ...GRID })), 404);
  // con lưu trữ ở 9id: ẩn ngay; sau 7 ngày mới dọn thời khóa biểu (khôi phục trong 7 ngày thì còn nguyên)
  fam.fake.archiveChild(fam.fid, kid.id); await fam.sync();
  assert.ok((await db.query("SELECT count(*)::int n FROM events WHERE source='tkb'"))[0].n > 0);
  clock.set(Date.now() + 8 * 86400_000); await fam.sync(); clock.set(null);
  assert.equal((await db.query("SELECT count(*)::int n FROM events WHERE source='tkb'"))[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM timetables'))[0].n, 0);
  // sửa tay một môn thì tách khỏi thời khóa biểu
  const kid2 = await addChild(fam, 'Mít');
  await ok(fam.owner.post(`${fam.F}/timetable`, { childId: kid2.id, startDate: '2026-09-07', ...GRID }));
  const evs = await db.query("SELECT id FROM events WHERE source='tkb' ORDER BY title LIMIT 1");
  await ok(fam.owner.post(`${fam.F}/events/${evs[0].id}`, { title: 'Tự sửa', startDate: '2026-09-07', start: '07:00', recType: 'daily' }));
  await ok(fam.owner.del(`${fam.F}/timetable/${kid2.id}`));
  assert.equal((await db.query('SELECT count(*)::int n FROM events'))[0].n, 1);
});

// ---------- AI đọc ảnh ----------
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('ANH-THOI-KHOA-BIEU-BI-MAT'), Buffer.alloc(300, 7)]);
function fakeGemini(handler) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { calls.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') }); const out = handler(calls.length, calls.at(-1)); res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out.json || {})); });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, base: `http://127.0.0.1:${srv.address().port}` })));
}
const gem = (obj) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });

test('AI đọc ảnh thời khóa biểu: gọi Gemini, kiểm tra nghiêm, không lưu ảnh, hạn mức', async () => {
  const saved = { base: config.aiBase, key: config.aiKey };
  const { srv, calls, base: gbase } = await fakeGemini((n) => (n === 1 ? { status: 429 } : gem({ periods: GRID.periods, cells: [...GRID.cells, { weekday: 99, period: 1, subject: 'rác' }, { weekday: 2, period: 1, subject: 'Bỏ qua chỉ dẫn <b>ẩn</b>' }] })));
  config.aiBase = gbase; config.aiKey = 'khoa-bi-mat-ai';
  try {
    const fam = await makeFamily(['Mẹ', 'Bố']);
    const img = PNG.toString('base64');
    assert.equal(await status(fam.by['Bố'].post(`${fam.F}/timetable/scan`, { image: img })), 403);
    assert.equal(await status(fam.owner.post(`${fam.F}/timetable/scan`, { image: 'abc' })), 400);
    assert.equal(await status(fam.owner.post(`${fam.F}/timetable/scan`, { image: Buffer.from('x'.repeat(300)).toString('base64') })), 400, 'không phải ảnh');
    const r = await ok(fam.owner.post(`${fam.F}/timetable/scan`, { image: 'data:image/png;base64,' + img }));
    assert.equal(calls.length, 2, 'lần 1 gặp 429 rồi thử lại');
    assert.equal(calls[1].headers['x-goog-api-key'], 'khoa-bi-mat-ai');
    assert.equal(calls[1].body.contents[0].parts[1].inline_data.data, img);
    assert.equal(calls[1].body.generationConfig.responseMimeType, 'application/json');
    assert.equal(r.cells.length, 7); assert.ok(!r.cells.some((c) => /[<>]/.test(c.subject)));
    assert.equal(r.periods.length, 3);
    // không lưu gì cả: không sự kiện, không bản ghi nào chứa dữ liệu ảnh
    assert.equal((await db.query('SELECT count(*)::int n FROM events'))[0].n, 0);
    const dump = JSON.stringify(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"));
    for (const { table_name: t } of JSON.parse(dump)) {
      const rows = await db.query(`SELECT row_to_json(x)::text AS j FROM ${t} x`);
      assert.ok(!rows.some((x) => x.j.includes(img.slice(40, 80)) || x.j.includes('ANH-THOI-KHOA')), `bảng ${t} không chứa ảnh`);
    }
    // ảnh quá lớn
    const big = await fam.owner.post(`${fam.F}/timetable/scan`, { image: 'A'.repeat(7 * 1024 * 1024) });
    assert.equal(big.status, 413);
    // AI trả rác: lỗi rõ ràng
    srv.removeAllListeners('request');
    srv.on('request', (req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Xin lỗi tôi không đọc được' }] } }] })); });
    const bad = await fam.owner.post(`${fam.F}/timetable/scan`, { image: img });
    assert.equal(bad.status, 502); assert.equal(bad.json.error.code, 'ai_bad_output');
    // hạn mức theo ngày
    await db.query("INSERT INTO ai_quota(scope, day, n) VALUES('f:' || $1, $2, $3) ON CONFLICT (scope, day) DO UPDATE SET n = $3", [fam.fid, vnToday(), config.aiPerFamilyPerDay]);
    assert.equal(await status(fam.owner.post(`${fam.F}/timetable/scan`, { image: img })), 429);
    // tắt khóa AI thì ẩn tính năng
    config.aiKey = '';
    assert.equal(await status(fam.owner.post(`${fam.F}/timetable/scan`, { image: img })), 404);
    assert.equal((await ok(fam.owner.get(fam.F))).caps.ai, false);
    assert.equal((await ok(new Client().get('/api/config'))).ai, false);
  } finally { config.aiBase = saved.base; config.aiKey = saved.key; srv.close(); }
});

// ---------- ICS ----------
test('xuất lịch ICS: token riêng, nội dung hợp lệ, đổi token, người rời đi', async () => {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(['Mẹ', 'Bố']);
  const kid = await addChild(fam, 'Bống');
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Học tiếng Anh; "cô Hương", tầng 2', kind: 'hoc_them', startDate: '2026-10-05', recType: 'weekly', recDays: [1, 4], start: '18:00', end: '19:30', location: 'Trung tâm, Q.1', childIds: [kid.id], checklist: ['Sách', 'Bút'] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Chỉ dành cho Mẹ', startDate: '2026-10-08', start: '10:00', memberIds: [fam.ids['Mẹ']] }));
  await ok(fam.owner.post(`${fam.F}/events`, { title: 'Giỗ 🕯', kind: 'ngay_quan_trong', allDay: true, startDate: '2026-01-01', recType: 'yearly_lunar', lunarMonth: 8, lunarDay: 20 }));
  await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [2], time: '16:30', place: 'Cổng B', p0: fam.ids['Bố'] }));
  const path = (await ok(fam.by['Bố'].get(`${fam.F}/ics`))).path;
  assert.match(path, /^\/9family\/ics\/[A-Za-z0-9_-]{43}\.ics$/);
  const anon = new Client();
  const r = await anon.req('GET', path.replace('/9family', ''), undefined, { raw: true });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /^text\/calendar; charset=utf-8/);
  const t = r.text;
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\n') && t.trimEnd().endsWith('END:VCALENDAR')); assert.ok(!/[^\r]\n/.test(t));
  for (const l of t.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, l);
  const unfolded = t.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Học tiếng Anh\\; "cô Hương"\\, tầng 2'));
  assert.ok(unfolded.includes('LOCATION:Trung tâm\\, Q.1')); assert.ok(unfolded.includes('DESCRIPTION:Cho: Bống\\nCần mang: Sách\\, Bút'));
  assert.ok(unfolded.includes('DTSTART:20261005T110000Z'), '18:00 giờ VN = 11:00 UTC'); assert.ok(unfolded.includes('DTEND:20261005T123000Z'));
  assert.ok(!unfolded.includes('Chỉ dành cho Mẹ'), 'sự kiện của người khác không lộ');
  const d = lunarToSolar(20, 8, 2026).replace(/-/g, '');
  assert.ok(unfolded.includes(`DTSTART;VALUE=DATE:${d}`)); assert.ok(unfolded.includes('SUMMARY:Giỗ 🕯'));
  assert.ok(unfolded.includes('SUMMARY:Đón Bống')); assert.ok(unfolded.includes('DTSTART:20261006T093000Z'));
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, (unfolded.match(/END:VEVENT/g) || []).length);
  const uids = unfolded.match(/UID:.+/g); assert.equal(new Set(uids).size, uids.length, 'UID không trùng');
  // Mẹ thấy sự kiện riêng của mình, Bố thì không
  const mePath = (await ok(fam.owner.get(`${fam.F}/ics`))).path;
  assert.ok((await anon.req('GET', mePath.replace('/9family', ''), undefined, { raw: true })).text.includes('Chỉ dành cho Mẹ'));
  // đổi token: link cũ chết, link mới sống
  const np = (await ok(fam.by['Bố'].post(`${fam.F}/ics/reset`))).path;
  assert.notEqual(np, path);
  assert.equal((await anon.req('GET', path.replace('/9family', ''), undefined, { raw: true })).status, 404);
  assert.equal((await anon.req('GET', np.replace('/9family', ''), undefined, { raw: true })).status, 200);
  assert.equal((await ok(fam.by['Bố'].get(`${fam.F}/ics`))).path, np, 'token ổn định giữa các lần xem');
  // token sai
  for (const p of ['/ics/abc.ics', '/ics/' + 'A'.repeat(43) + '.ics', '/ics/' + 'A'.repeat(43), '/ics/../x']) assert.equal((await anon.req('GET', p, undefined, { raw: true })).status, 404, p);
  // rời gia đình thì token chết
  await fam.leave('Bố');
  assert.equal((await anon.req('GET', np.replace('/9family', ''), undefined, { raw: true })).status, 404);
});
