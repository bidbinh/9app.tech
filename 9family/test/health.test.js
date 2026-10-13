// Tích hợp (PostgreSQL thật + 9id giả): sức khỏe gia đình. Tên người/thuốc/bệnh toàn BỊA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, shutdown, makeFamily, addChild, ok, clock, scheduler, at, db, fake as _f } from './helper.js';
import * as H from './helper.js';

const query = (...a) => db.query(...a);
before(async () => { await boot(); clock.set(at('2026-10-05', '06:00')); });
after(shutdown);

async function setup(names = ['Mẹ', 'Bố', 'Bà nội'], opts = {}) {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(names, opts);
  const kid = await addChild(fam, 'Bống', { birthYear: 2025 });
  return { fam, kid, hs: `${fam.F}/health` };
}
const subjOf = async (client, hs, pred) => (await ok(client.get(hs))).subjects.find(pred);

test('danh sách hồ sơ: chủ thấy con và hồ sơ của mình; thành viên chỉ thấy hồ sơ của mình', async () => {
  const { fam, hs } = await setup();
  const mine = (await ok(fam.owner.get(hs))).subjects;
  assert.deepEqual(mine.map((s) => s.kind), ['child', 'adult']);
  assert.equal(mine[0].level, 'manage');
  const bo = (await ok(fam.by['Bố'].get(hs))).subjects;
  assert.equal(bo.length, 1); assert.equal(bo[0].kind, 'adult'); assert.equal(bo[0].memberId, fam.ids['Bố']);
  assert.ok(!(await ok(fam.by['Bố'].get(hs))).subjects.some((s) => s.name === 'Mẹ'), 'Bố không thấy hồ sơ của Mẹ');
  assert.equal((await ok(fam.by['Bà nội'].get(hs))).subjects.length, 1);
});

test('tăng trưởng: nhập số đo, đối chiếu WHO, thay số cùng ngày, kiểm tra đầu vào', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  let d = await ok(fam.owner.get(P));
  assert.equal(d.growth.ready, false); assert.equal(d.growth.needProfile, true);
  await ok(fam.owner.post(`${P}/profile`, { sex: 'nam', birthDate: '2025-10-05' }));
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2026-10-05', v1: 0 })).status, 400);
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2027-01-01', v1: 9 })).status, 400, 'ngày tương lai');
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2025-09-01', v1: 3 })).status, 400, 'trước ngày sinh');
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'bp', day: '2026-10-05', v1: 120, v2: 80 })).status, 400, 'con không có huyết áp');
  await ok(fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2026-04-05', v1: 7.6 }));
  await ok(fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9.6 }));
  await ok(fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9.7 })); // thay số
  await ok(fam.owner.post(`${P}/measures`, { kind: 'height', day: '2026-10-05', v1: '75,7' }));
  await ok(fam.owner.post(`${P}/measures`, { kind: 'head', day: '2026-10-05', v1: 46 }));
  d = await ok(fam.owner.get(P));
  assert.equal(d.growth.ready, true);
  assert.equal(d.growth.indicators.weight.points.length, 2);
  assert.equal(d.growth.indicators.weight.last.value, 9.7);
  assert.ok(d.growth.indicators.weight.last.place.pct > 40 && d.growth.indicators.weight.last.place.pct < 60);
  assert.ok(d.growth.indicators.weight.curves.p50.length > 5);
  assert.match(d.growth.indicators.weight.last.text, /hỏi bác sĩ nhi/);
  assert.ok(d.growth.indicators.bmi && d.growth.indicators.head);
  assert.match(d.notes.noPhotos, /chưa lưu ảnh/);
  // xóa số đo
  const m = d.measures.find((x) => x.kind === 'head');
  await ok(fam.owner.del(`${P}/measures/${m.id}`));
  assert.equal((await fam.owner.del(`${P}/measures/${m.id}`)).status, 404);
});

test('con theo người phụ trách: thành viên chưa được giao thì 404, được giao thì ghi được nhưng không đổi cài đặt/xóa', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  assert.equal((await fam.by['Bố'].get(P)).status, 404);
  assert.equal((await fam.by['Bố'].post(`${P}/measures`, { kind: 'weight', v1: 9 })).status, 404);
  await ok(fam.owner.post(`${P}/profile`, { sex: 'nu', birthDate: '2025-10-05', sharedWith: [fam.ids['Bố']] }));
  assert.equal((await fam.by['Bố'].get(P)).status, 200);
  await ok(fam.by['Bố'].post(`${P}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9 }));
  assert.equal((await fam.by['Bố'].post(`${P}/profile`, { sharedWith: [] })).status, 403);
  assert.equal((await fam.by['Bố'].post(`${P}/erase`, { confirm: true })).status, 403);
  assert.equal((await fam.by['Bà nội'].get(P)).status, 404);
  // sharedWith phải là thành viên trong nhà
  assert.equal((await fam.owner.post(`${P}/profile`, { sharedWith: ['00000000-0000-4000-8000-000000000001'] })).status, 400);
  assert.ok(!(await ok(fam.by['Bố'].get(hs))).subjects.some((s) => s.id === k.id && s.level === 'manage'));
});

test('người lớn mặc định riêng tư: chủ/quản lý KHÔNG thấy, người được chia sẻ chỉ xem', async () => {
  const { fam, hs } = await setup(['Mẹ', 'Bố', 'Bà nội'], { roles: { 'Bố': 'quan_ly' } });
  const own = await subjOf(fam.by['Bà nội'], hs, (s) => s.kind === 'adult');
  const P = `${hs}/${own.id}`;
  assert.equal((await fam.owner.get(P)).status, 404, 'chủ không thấy');
  assert.equal((await fam.by['Bố'].get(P)).status, 404, 'quản lý không thấy');
  await ok(fam.by['Bà nội'].post(`${P}/measures`, { kind: 'bp', day: '2026-10-05', v1: 150, v2: 95, v3: 80 }));
  await ok(fam.by['Bà nội'].post(`${P}/profile`, { sharedWith: [fam.ids['Mẹ']] }));
  const d = await ok(fam.owner.get(P));
  assert.equal(d.subject.level, 'view');
  assert.equal(d.measures.length, 1);
  assert.equal(d.measures[0].check.level, 'high');
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'bp', v1: 120, v2: 80 })).status, 403, 'người xem không ghi được');
  assert.equal((await fam.by['Bố'].get(P)).status, 404, 'quản lý khác vẫn không thấy');
  // thu hồi chia sẻ
  await ok(fam.by['Bà nội'].post(`${P}/profile`, { sharedWith: [] }));
  assert.equal((await fam.owner.get(P)).status, 404);
});

test('huyết áp/đường huyết: tô mức, cảnh báo nặng bằng chữ cố định, không chẩn đoán', async () => {
  const { fam, hs } = await setup();
  const me = await subjOf(fam.owner, hs, (s) => s.kind === 'adult');
  const P = `${hs}/${me.id}`;
  const a = await ok(fam.owner.post(`${P}/measures`, { kind: 'bp', day: '2026-10-05', v1: 118, v2: 76, v3: 70 }));
  assert.equal(a.check.level, 'ok'); assert.equal(a.emergencyText, null);
  const b = await ok(fam.owner.post(`${P}/measures`, { kind: 'bp', day: '2026-10-05', v1: 190, v2: 105 }));
  assert.equal(b.check.level, 'severe_high'); assert.equal(b.emergencyText, 'Nếu có triệu chứng nặng hãy đi cấp cứu hoặc gọi 115.');
  const c = await ok(fam.owner.post(`${P}/measures`, { kind: 'glucose', day: '2026-10-05', v1: 7.4, ctx: 'doi' }));
  assert.equal(c.check.level, 'high'); assert.match(c.consultText, /bác sĩ/);
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'bp', v1: 80, v2: 90 })).status, 400, 'tâm thu phải lớn hơn tâm trương');
  assert.equal((await fam.owner.post(`${P}/measures`, { kind: 'glucose', v1: 99 })).status, 400);
  const d = await ok(fam.owner.get(P));
  assert.equal(d.measures.length, 3);
  assert.match(d.notes.thresholds, /không phải chẩn đoán/);
  assert.ok(!('growth' in d), 'người lớn không có biểu đồ WHO');
});

test('người lớn chưa có tài khoản (thành viên cũ nhập hộ): chủ/quản lý quản lý hộ, thành viên khác không thấy', async () => {
  const { fam, hs } = await setup();
  const ob = (await query("INSERT INTO members(family_id, name, relation, role) VALUES($1,'Ông Tư Bịa','ong','thanh_vien') RETURNING id", [fam.fid]))[0].id;
  const s = await subjOf(fam.owner, hs, (x) => x.memberId === ob);
  assert.ok(s, 'chủ thấy'); assert.equal(s.level, 'manage'); assert.equal(s.hasAccount, false);
  await ok(fam.owner.post(`${hs}/${s.id}/measures`, { kind: 'bp', day: '2026-10-05', v1: 130, v2: 85 }));
  assert.equal((await fam.by['Bố'].get(`${hs}/${s.id}`)).status, 404);
});

test('IDOR: chéo gia đình và chéo người trong gia đình', async () => {
  const A = await setup(); const B = await setup(['Chị Hai', 'Anh Ba']);
  const ka = await subjOf(A.fam.owner, A.hs, (s) => s.kind === 'child');
  const kb = await subjOf(B.fam.owner, B.hs, (s) => s.kind === 'child');
  await ok(A.fam.owner.post(`${A.hs}/${ka.id}/measures`, { kind: 'weight', day: '2026-10-05', v1: 8 }));
  const da = await ok(A.fam.owner.get(`${A.hs}/${ka.id}`));
  // gia đình B dùng id của A ở đường dẫn của chính B
  assert.equal((await B.fam.owner.get(`${B.hs}/${ka.id}`)).status, 404);
  assert.equal((await B.fam.owner.post(`${B.hs}/${ka.id}/measures`, { kind: 'weight', v1: 8 })).status, 404);
  // gia đình B gọi đường dẫn gia đình A: không phải thành viên
  assert.equal((await B.fam.owner.get(`${A.hs}/${ka.id}`)).status, 404);
  assert.equal((await B.fam.owner.get(A.hs)).status, 404);
  // xóa số đo của A qua hồ sơ của B
  assert.equal((await B.fam.owner.del(`${B.hs}/${kb.id}/measures/${da.measures[0].id}`)).status, 404);
  // thuốc, tiêm, khám của A qua B
  for (const [m, p, b] of [['post', 'meds', { name: 'x', times: ['08:00'] }], ['post', 'visits', { day: '2026-10-05' }], ['post', 'vaccines', { name: 'x', dueDate: '2026-12-01' }], ['post', 'vaccines/schedule', {}], ['post', 'erase', { confirm: true }]]) {
    assert.equal((await B.fam.owner[m](`${B.hs}/${ka.id}/${p}`, b)).status, 404, p);
  }
  // chưa đăng nhập
  assert.equal((await new H.Client().get(A.hs)).status, 401);
});

test('tiêm chủng: lập lịch theo ngày sinh (idempotent), đánh dấu đã tiêm, mũi tự thêm', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  assert.equal((await fam.owner.post(`${P}/vaccines/schedule`, {})).status, 400, 'cần ngày sinh');
  await ok(fam.owner.post(`${P}/profile`, { sex: 'nu', birthDate: '2026-07-05' }));
  const r1 = await ok(fam.owner.post(`${P}/vaccines/schedule`, {}));
  const r2 = await ok(fam.owner.post(`${P}/vaccines/schedule`, {}));
  assert.ok(r1.added >= 19); assert.equal(r2.added, 0);
  let d = await ok(fam.owner.get(P));
  assert.equal(d.vaccines.length, r1.added);
  assert.match(d.vaccineInfo.source, /10\/2024\/TT-BYT/);
  assert.match(d.vaccineInfo.verification, /CHƯA đối chiếu/);
  const dpt1 = d.vaccines.find((v) => v.code === 'dpt1');
  assert.equal(dpt1.dueDate, '2026-09-05'); assert.equal(dpt1.status, 'overdue');
  const dpt2 = d.vaccines.find((v) => v.code === 'dpt2');
  await ok(fam.owner.post(`${P}/vaccines/${dpt1.id}`, { doneOn: '2026-10-01' }));
  assert.equal((await fam.owner.post(`${P}/vaccines/${dpt1.id}`, { doneOn: '2027-01-01' })).status, 400);
  d = await ok(fam.owner.get(P));
  assert.equal(d.vaccines.find((v) => v.code === 'dpt1').status, 'done');
  assert.equal(d.vaccines.find((v) => v.code === 'dpt2').earliest, '2026-10-29');
  await ok(fam.owner.post(`${P}/vaccines/${dpt1.id}`, { doneOn: null })); // hoàn tác
  const c = await ok(fam.owner.post(`${P}/vaccines`, { name: 'Cúm mùa', dueDate: '2026-11-01' }));
  assert.equal((await fam.owner.del(`${P}/vaccines/${dpt2.id}`)).status, 404, 'không xóa mũi trong lịch TCMR');
  await ok(fam.owner.del(`${P}/vaccines/${c.id}`));
  // người lớn không có lịch TCMR
  const me = await subjOf(fam.owner, hs, (s) => s.kind === 'adult');
  assert.equal((await fam.owner.post(`${hs}/${me.id}/vaccines/schedule`, {})).status, 400);
});

test('nhắc tiêm: nhắc trước 7 ngày và đúng ngày, mỗi mốc một lần, nội dung chung chung', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  await ok(fam.owner.post(`${P}/vaccines`, { name: 'Vắc xin Bịa Đặc Biệt', dueDate: '2026-10-12', note: 'GhiChúTiêmBíMật' }));
  await query('DELETE FROM notifications');
  await scheduler.tick(at('2026-10-05', '07:00')); // chưa 08:00
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health'"))[0].n, 0);
  await scheduler.tick(at('2026-10-05', '08:10'));
  await scheduler.tick(at('2026-10-05', '08:20')); // chạy lại: không trùng
  const n1 = await query("SELECT * FROM notifications WHERE type='health' AND member_id=$1", [fam.ids['Mẹ']]);
  assert.equal(n1.length, 1);
  assert.equal(n1[0].title, 'Nhắc sức khỏe'); assert.ok(!/Bịa|Bống|BíMật/.test(n1[0].title + n1[0].body));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health' AND member_id=$1", [fam.ids['Bà nội']]))[0].n, 0, 'người không liên quan không nhận');
  await scheduler.tick(at('2026-10-12', '08:05'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health' AND member_id=$1", [fam.ids['Mẹ']]))[0].n, 2);
});

test('thuốc: nhắc đúng giờ, không nhắc trùng khi khởi động lại, đã uống thì khỏi nhắc, đếm thuốc còn lại, hoàn tác', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  const med = await ok(fam.owner.post(`${P}/meds`, { name: 'Thuốc Bịa A', dose: '1 gói theo đơn', times: ['08:00', '20:00'], startDate: '2026-10-05', endDate: '2026-10-07', stock: 5 }));
  assert.equal((await fam.owner.post(`${P}/meds`, { name: 'x', times: ['25:00'] })).status, 400);
  assert.equal((await fam.owner.post(`${P}/meds`, { name: 'x', times: ['08:00'], startDate: '2026-10-05', endDate: '2026-10-01' })).status, 400);
  await query('DELETE FROM notifications');
  await scheduler.tick(at('2026-10-05', '07:55'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health'"))[0].n, 0, 'chưa đến giờ');
  await scheduler.tick(at('2026-10-05', '08:02'));
  await scheduler.tick(at('2026-10-05', '08:04')); // lập lịch chạy lại / khởi động lại
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health' AND member_id=$1", [fam.ids['Mẹ']]))[0].n, 1);
  // quá 30 phút sau giờ (máy chủ nghỉ lâu) thì không dồn nhắc
  await scheduler.tick(at('2026-10-05', '09:00'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health'"))[0].n, 1);
  // đã uống rồi thì không nhắc giờ tối
  const t1 = await ok(fam.owner.post(`${P}/meds/${med.id}/take`, { time: '20:00' }));
  assert.equal(t1.stock, 4);
  const t2 = await ok(fam.owner.post(`${P}/meds/${med.id}/take`, { time: '20:00' }));
  assert.equal(t2.already, true); assert.equal(t2.stock, 4, 'bấm lại không trừ hai lần');
  await scheduler.tick(at('2026-10-05', '20:03'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health' AND dedupe_key LIKE 'med:%'"))[0].n, 1, 'giờ tối không nhắc vì đã uống (thông báo còn lại là báo sắp hết thuốc)');
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE dedupe_key LIKE 'medlow:%'"))[0].n, 1);
  assert.equal((await fam.owner.post(`${P}/meds/${med.id}/take`, { time: '09:30' })).status, 400, 'giờ không có trong lịch');
  await ok(fam.owner.post(`${P}/meds/${med.id}/untake`, { time: '20:00' }));
  let d = await ok(fam.owner.get(P));
  assert.equal(d.meds[0].stock, 5); assert.equal(d.meds[0].taken.length, 0);
  // sắp hết thuốc: báo một lần
  await ok(fam.owner.post(`${P}/meds/${med.id}`, { stock: 4 }));
  await ok(fam.owner.post(`${P}/meds/${med.id}/take`, { time: '08:00' })); // còn 3
  await ok(fam.owner.post(`${P}/meds/${med.id}/take`, { time: '20:00' })); // còn 2 <= 2 liều/ngày x 2... = 4
  const low = await query("SELECT count(*)::int n FROM hm_fires WHERE key LIKE 'medlow:%'");
  assert.equal(low[0].n, 1);
  d = await ok(fam.owner.get(P));
  assert.equal(d.meds[0].lowStock, true);
  // dừng thuốc thì không nhắc ngày sau
  await ok(fam.owner.post(`${P}/meds/${med.id}`, { stop: true }));
  await query('DELETE FROM notifications');
  await scheduler.tick(at('2026-10-06', '08:01'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='health'"))[0].n, 0);
  await ok(fam.owner.del(`${P}/meds/${med.id}`));
});

test('thuốc của người lớn: nhắc cho chính họ; người khác không nhận', async () => {
  const { fam, hs } = await setup();
  const own = await subjOf(fam.by['Bà nội'], hs, (s) => s.kind === 'adult');
  await ok(fam.by['Bà nội'].post(`${hs}/${own.id}/meds`, { name: 'Thuốc Bịa B', times: ['07:30'], startDate: '2026-10-05' }));
  await query('DELETE FROM notifications');
  await scheduler.tick(at('2026-10-05', '07:35'));
  const rows = await query("SELECT member_id FROM notifications WHERE type='health'");
  assert.deepEqual(rows.map((r) => r.member_id), [fam.ids['Bà nội']]);
});

test('hồ sơ khám + tái khám liên kết lịch; xóa lần khám thì xóa cả sự kiện', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  const v = await ok(fam.owner.post(`${P}/visits`, { day: '2026-10-03', place: 'Phòng khám Bịa', doctor: 'BS. Bịa', reason: 'Khám định kỳ', conclusion: 'Kết luận ngắn', prescription: 'Theo đơn', recheckDate: '2026-10-20', addToCalendar: true }));
  assert.ok(v.eventId);
  const ev = (await query('SELECT * FROM events WHERE id=$1', [v.eventId]))[0];
  assert.equal(ev.title, 'Tái khám'); assert.equal(ev.kind, 'kham'); assert.equal(ev.start_date, '2026-10-20'); assert.deepEqual(ev.child_ids, [k.childId]);
  assert.ok(!/Bịa|Kết luận/.test(ev.title + ev.note + ev.location), 'sự kiện lịch không mang nội dung khám');
  assert.equal((await fam.owner.post(`${P}/visits`, { day: '2026-10-03', recheckDate: '2026-09-01' })).status, 400);
  const d = await ok(fam.owner.get(P));
  assert.equal(d.visits.length, 1); assert.equal(d.visits[0].inCalendar, true);
  // sửa bỏ liên kết lịch
  await ok(fam.owner.post(`${P}/visits/${v.id}`, { day: '2026-10-03', recheckDate: '2026-10-20', addToCalendar: false }));
  assert.equal((await query('SELECT count(*)::int n FROM events WHERE id=$1', [v.eventId]))[0].n, 0);
  const v2 = await ok(fam.owner.post(`${P}/visits`, { day: '2026-10-04', recheckDate: '2026-10-25', addToCalendar: true }));
  await ok(fam.owner.del(`${P}/visits/${v2.id}`));
  assert.equal((await query('SELECT count(*)::int n FROM events WHERE id=$1', [v2.eventId]))[0].n, 0);
});

test('xóa dữ liệu sức khỏe của một người: sạch số đo, tiêm, thuốc, khám, sự kiện, khóa nhắc; chỉ quyền quản lý', async () => {
  const { fam, hs } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  const P = `${hs}/${k.id}`;
  await ok(fam.owner.post(`${P}/profile`, { sex: 'nam', birthDate: '2025-10-05', sharedWith: [fam.ids['Bố']] }));
  await ok(fam.owner.post(`${P}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9 }));
  await ok(fam.owner.post(`${P}/vaccines/schedule`, {}));
  const med = await ok(fam.owner.post(`${P}/meds`, { name: 'Thuốc Bịa C', times: ['08:00'], startDate: '2026-10-05' }));
  const v = await ok(fam.owner.post(`${P}/visits`, { day: '2026-10-05', recheckDate: '2026-10-30', addToCalendar: true }));
  await scheduler.tick(at('2026-10-05', '08:02'));
  assert.equal((await fam.owner.post(`${P}/erase`, {})).status, 400, 'phải xác nhận');
  assert.equal((await fam.by['Bố'].post(`${P}/erase`, { confirm: true })).status, 403);
  const r = await ok(fam.owner.post(`${P}/erase`, { confirm: true }));
  assert.ok(r.erased.measures === 1 && r.erased.meds === 1 && r.erased.visits === 1 && r.erased.vaccines > 10);
  for (const t of ['health_measures', 'health_vaccines', 'health_meds', 'health_visits']) assert.equal((await query(`SELECT count(*)::int n FROM ${t} WHERE subject_id=$1`, [k.id]))[0].n, 0, t);
  assert.equal((await query('SELECT count(*)::int n FROM health_med_logs WHERE med_id=$1', [med.id]))[0].n, 0);
  assert.equal((await query('SELECT count(*)::int n FROM events WHERE id=$1', [v.eventId]))[0].n, 0);
  assert.equal((await query("SELECT count(*)::int n FROM hm_fires WHERE key LIKE $1", [`med:${med.id}:%`]))[0].n, 0);
  const d = await ok(fam.owner.get(P));
  assert.equal(d.subject.sex, null); assert.equal(d.subject.birthDate, null); assert.deepEqual(d.share.sharedWith, []);
});

test('xóa con ở 9id/9family: dữ liệu sức khỏe đi theo (khóa ngoại CASCADE)', async () => {
  const { fam, hs, kid } = await setup();
  const k = await subjOf(fam.owner, hs, (s) => s.kind === 'child');
  await ok(fam.owner.post(`${hs}/${k.id}/profile`, { sex: 'nam', birthDate: '2025-10-05' }));
  await ok(fam.owner.post(`${hs}/${k.id}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9 }));
  await query('DELETE FROM children WHERE id=$1', [kid.id]);
  assert.equal((await query('SELECT count(*)::int n FROM health_measures WHERE subject_id=$1', [k.id]))[0].n, 0);
  assert.equal((await query('SELECT count(*)::int n FROM health_subjects WHERE id=$1', [k.id]))[0].n, 0);
});

test('vai "con": chỉ thấy hồ sơ của mình ở mức hạn chế (tăng trưởng + tiêm), không thuốc/khám/ghi', async () => {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bé Bống'], { roles: { 'Bé Bống': 'con' } });
  const kid = await addChild(fam, 'Bống', { linkedUserId: fam.userIds['Bé Bống'] });
  const kid2 = await addChild(fam, 'Cún');
  const hs = `${fam.F}/health`;
  const owner = (await ok(fam.owner.get(hs))).subjects;
  const k1 = owner.find((s) => s.childId === kid.id); const k2 = owner.find((s) => s.childId === kid2.id);
  await ok(fam.owner.post(`${hs}/${k1.id}/profile`, { sex: 'nu', birthDate: '2025-10-05' }));
  await ok(fam.owner.post(`${hs}/${k1.id}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9, note: 'GhiChúRiêng' }));
  await ok(fam.owner.post(`${hs}/${k1.id}/meds`, { name: 'Thuốc Bịa D', times: ['08:00'], startDate: '2026-10-05' }));
  await ok(fam.owner.post(`${hs}/${k1.id}/visits`, { day: '2026-10-05', conclusion: 'KếtLuậnRiêng' }));
  await ok(fam.owner.post(`${hs}/${k1.id}/vaccines/schedule`, {}));
  const con = fam.by['Bé Bống'];
  const list = await ok(con.get(hs));
  assert.deepEqual(list.subjects.map((s) => s.childId), [kid.id], 'chỉ thấy hồ sơ của mình, không thấy con khác hay người lớn');
  assert.equal(list.subjects[0].level, 'limited');
  const d = await ok(con.get(`${hs}/${k1.id}`));
  assert.ok(d.growth.ready && d.vaccines.length > 10);
  assert.equal(d.meds, undefined); assert.equal(d.visits, undefined); assert.equal(d.share, undefined);
  assert.ok(d.measures.every((m) => m.note === ''));
  assert.ok(!JSON.stringify(d).includes('KếtLuậnRiêng') && !JSON.stringify(d).includes('Thuốc Bịa D'));
  assert.equal((await con.get(`${hs}/${k2.id}`)).status, 404);
  assert.equal((await con.post(`${hs}/${k1.id}/measures`, { kind: 'weight', v1: 10 })).status, 403);
  assert.equal((await con.post(`${hs}/${k1.id}/vaccines/schedule`, {})).status, 403);
  assert.equal((await con.post(`${hs}/${k1.id}/profile`, { sharedWith: [] })).status, 403);
  const me = owner.find((s) => s.kind === 'adult');
  assert.equal((await con.get(`${hs}/${me.id}`)).status, 404);
});

test('KHÔNG rò thông tin sức khỏe qua nhật ký máy chủ, thông báo đẩy, Console', async () => {
  const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
  let fam; let hs; let k;
  try {
    clock.set(at('2026-10-05', '06:00'));
    fam = await makeFamily(['MẹBíMật', 'BốBíMật']);
    await addChild(fam, 'ConBíMật');
    hs = `${fam.F}/health`;
    k = (await ok(fam.owner.get(hs))).subjects.find((s) => s.kind === 'child');
    // đăng ký đẩy với "hiện chi tiết" (hide=false): app vẫn không được đưa nội dung sức khỏe vào thông báo
    await query("INSERT INTO push_subs(member_id, sid, endpoint, p256dh, auth, hide) VALUES($1,'sid-bia','https://push.example.invalid/x','p','a',false)", [fam.ids['MẹBíMật']]);
    await ok(fam.owner.post(`${hs}/${k.id}/profile`, { sex: 'nam', birthDate: '2025-10-05' }));
    await ok(fam.owner.post(`${hs}/${k.id}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9, note: 'GhiChúSốĐoBíMật' }));
    await ok(fam.owner.post(`${hs}/${k.id}/vaccines`, { name: 'VắcXinBíMật', dueDate: '2026-10-05' }));
    const med = await ok(fam.owner.post(`${hs}/${k.id}/meds`, { name: 'ThuốcBíMật', dose: 'LiềuBíMật', times: ['08:00'], startDate: '2026-10-05', stock: 1 }));
    await ok(fam.owner.post(`${hs}/${k.id}/visits`, { day: '2026-10-05', place: 'NơiKhámBíMật', reason: 'LýDoBíMật', conclusion: 'KếtLuậnBíMật', prescription: 'ĐơnBíMật', recheckDate: '2026-10-09', addToCalendar: true }));
    await ok(fam.owner.post(`${hs}/${k.id}/meds/${med.id}/take`, { time: '08:00' }));
    await scheduler.tick(at('2026-10-05', '08:03'));
    // lỗi người dùng và lỗi dữ liệu
    await fam.owner.post(`${hs}/${k.id}/measures`, { kind: 'weight', v1: 'ThuốcBíMật' });
    await fam.owner.post(`${hs}/${k.id}/meds`, { name: 'ThuốcBíMật', times: ['xx'] });
    await fam.by['BốBíMật'].get(`${hs}/${k.id}`);
  } finally { Object.assign(console, orig); clock.set(null); }
  const text = logs.join('\n');
  assert.ok(!text.includes('BíMật'), 'nhật ký lộ dữ liệu: ' + text.slice(0, 300));
  const notes = await query('SELECT title, body, link FROM notifications');
  const outbox = await query('SELECT payload FROM push_outbox');
  assert.ok(outbox.length >= 1, 'có xếp hàng đẩy');
  const blob = JSON.stringify([notes, outbox]);
  assert.ok(!blob.includes('BíMật'), 'thông báo/đẩy lộ dữ liệu: ' + blob.slice(0, 300));
  for (const o of outbox) assert.equal(o.payload.title, 'Nhắc sức khỏe');
  // nhật ký idempotency (bảng idem) không giữ nội dung sức khỏe
  assert.ok(!JSON.stringify(await query('SELECT body FROM idem')).includes('BíMật'));
  // Console API không đọc bảng sức khỏe/tiền
  for (const f of ['src/console-api.js']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/health_|money_/.test(src), f + ' không được đọc dữ liệu sức khỏe/tiền');
  }
});

test('migration 030 cộng thêm, chạy lại nhiều lần không lỗi và không mất dữ liệu', async () => {
  const { fam, hs } = await setup();
  const k = (await ok(fam.owner.get(hs))).subjects.find((s) => s.kind === 'child');
  await ok(fam.owner.post(`${hs}/${k.id}/measures`, { kind: 'weight', day: '2026-10-05', v1: 9 }));
  await query("INSERT INTO push_subs(member_id, sid, endpoint, p256dh, auth, types) VALUES($1,'sid-cu','https://push.example.invalid/cu','p','a','{ride,event}')", [fam.ids['Mẹ']]);
  const count = async () => Object.fromEntries(await Promise.all(['families', 'children', 'members', 'events', 'health_measures', 'health_subjects'].map(async (t) => [t, (await query(`SELECT count(*)::int n FROM ${t}`))[0].n])));
  const before = await count();
  const sql = fs.readFileSync(new URL('../db/030_health_money.sql', import.meta.url), 'utf8');
  await query(sql); await query(sql);
  await query("DELETE FROM schema_migrations WHERE name='030_health_money.sql'");
  await db.migrate(); // áp lại như DB cũ chưa có bản ghi 030
  assert.deepEqual(await count(), before);
  assert.equal((await query("SELECT count(*)::int n FROM schema_migrations WHERE name='030_health_money.sql'"))[0].n, 1);
  const types = (await query("SELECT types FROM push_subs WHERE sid='sid-cu'"))[0].types;
  assert.ok(types.includes('health') && types.includes('money') && types.includes('ride'), 'loại thông báo mới được thêm, không mất loại cũ');
  assert.equal(types.filter((t) => t === 'health').length, 1, 'không thêm trùng');
  // kiểm hàng của hồ sơ cũ vẫn đọc được
  assert.equal((await ok(fam.owner.get(`${hs}/${k.id}`))).measures.length, 1);
});
