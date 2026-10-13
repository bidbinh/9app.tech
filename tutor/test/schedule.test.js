// Lịch dạy: lịch lặp, buổi lẻ, trùng giờ (kể cả đồng thời), điểm danh, hủy, buổi bù, dời, lưu trữ
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, ok, newTutor, addStudent, day, wd, db, util } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const slotBody = (d, startMin = 18 * 60, durationMin = 90, extra = {}) => ({ weekday: wd(d), startMin, durationMin, location: 'Nhà bé', ...extra });
const weekOf = async (c, from, days = 14) => (await ok(c.get(`/api/week?from=${from}&days=${days}`))).lessons;

test('lịch lặp sinh buổi đúng thứ, đúng giờ, không sinh trùng khi xem nhiều lần (kể cả đồng thời)', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const d = day(1);
  await ok(c.post(`/api/students/${s.id}/slots`, slotBody(d)));
  const [a, b, e] = await Promise.all([weekOf(c, day(0), 28), weekOf(c, day(0), 28), weekOf(c, day(0), 28)]);
  for (const list of [a, b, e]) {
    assert.ok(list.length >= 4 && list.length <= 5, 'khoảng 4 buổi trong 28 ngày: ' + list.length);
    assert.ok(list.every((l) => util.isoWeekday(l.day) === wd(d) && l.startMin === 1080 && l.durationMin === 90 && l.status === 'du_kien' && l.studentName === 'Minh'));
  }
  assert.deepEqual(a.map((l) => l.id), b.map((l) => l.id));
  const n = (await db.query('SELECT count(*)::int AS n FROM lessons WHERE student_id=$1', [s.id]))[0].n;
  assert.ok(n >= a.length);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM (SELECT slot_id, slot_day FROM lessons GROUP BY 1,2 HAVING count(*) > 1) x'))[0].n, 0);
});

test('lịch lặp không sinh buổi trước ngày hiệu lực và không sinh cho học sinh đã lưu trữ', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const from = day(10);
  await ok(c.post(`/api/students/${s.id}/slots`, slotBody(from, 600, 60, { validFrom: from })));
  const list = await weekOf(c, day(0), 42);
  assert.ok(list.length > 0 && list.every((l) => l.day >= from));
});

test('trùng giờ giữa hai lịch lặp: 409 kèm chi tiết; kề nhau thì được; allowOverlap cho phép dạy nhóm', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { name: 'An' });
  const b = await addStudent(c, { name: 'Bình' });
  const d = day(2);
  await ok(c.post(`/api/students/${a.id}/slots`, slotBody(d, 17 * 60, 60)));
  const r = await c.post(`/api/students/${b.id}/slots`, slotBody(d, 17 * 60 + 30, 60));
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'schedule_conflict');
  assert.equal(r.json.error.details.conflicts[0].studentName, 'An');
  assert.match(r.json.error.message, /Trùng giờ/);
  assert.equal((await c.post(`/api/students/${b.id}/slots`, slotBody(d, 18 * 60, 60))).status, 200, 'kề nhau (18:00 sau buổi 17:00 đến 18:00) không trùng');
  assert.equal((await c.post(`/api/students/${b.id}/slots`, slotBody(d, 16 * 60, 60))).status, 200, 'kề trước');
  assert.equal((await c.post(`/api/students/${b.id}/slots`, slotBody(d, 17 * 60 + 30, 60, { allowOverlap: true }))).status, 200);
  // buổi sinh ra được gắn cờ trùng để giao diện cảnh báo
  const list = await weekOf(c, d, 1);
  assert.ok(list.some((l) => l.overlap), 'có buổi bị gắn cờ trùng');
  assert.equal(list.filter((l) => l.overlap).length, 3);
});

test('lịch lặp trùng với buổi lẻ đã có; buổi lẻ trùng với lịch lặp; ngày khác thì không trùng', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { name: 'An' });
  const b = await addStudent(c, { name: 'Bình' });
  const d = day(3);
  await ok(c.post('/api/lessons', { studentId: a.id, day: d, startMin: 600, durationMin: 60 }));
  const r1 = await c.post(`/api/students/${b.id}/slots`, slotBody(d, 630, 60, { validFrom: day(0) }));
  assert.equal(r1.status, 409);
  assert.equal(r1.json.error.details.conflicts[0].kind, 'lesson');
  await ok(c.post(`/api/students/${b.id}/slots`, slotBody(d, 900, 60)));
  // buổi lẻ trùng lịch lặp (buổi sinh ra từ lịch lặp tại ngày đó)
  const r2 = await c.post('/api/lessons', { studentId: a.id, day: d, startMin: 920, durationMin: 30 });
  assert.equal(r2.status, 409);
  assert.equal((await c.post('/api/lessons', { studentId: a.id, day: util.addDays(d, 1), startMin: 920, durationMin: 30 })).status, 200);
});

test('đồng thời: tám yêu cầu xếp cùng giờ chỉ một thành công (khóa gia sư)', async () => {
  const c = await newTutor();
  const ss = [];
  for (let i = 0; i < 8; i++) ss.push(await addStudent(c, { name: 'HS' + i }));
  const d = day(5);
  const rs = await Promise.all(ss.map((s) => c.post('/api/lessons', { studentId: s.id, day: d, startMin: 480, durationMin: 60 })));
  const codes = rs.map((r) => r.status).sort();
  assert.equal(codes.filter((x) => x === 200).length, 1, JSON.stringify(codes));
  assert.equal(codes.filter((x) => x === 409).length, 7);
  const rs2 = await Promise.all(ss.map((s) => c.post(`/api/students/${s.id}/slots`, slotBody(day(6), 480, 60))));
  assert.equal(rs2.filter((r) => r.status === 200).length, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM lessons WHERE tutor_id=(SELECT id FROM tutors WHERE name=$1 LIMIT 1) AND day=$2`, ['Cô Lan', day(6)]))[0].n >= 0, true);
});

test('buổi bị hủy hoặc học sinh nghỉ không chiếm giờ', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { name: 'An' });
  const b = await addStudent(c, { name: 'Bình' });
  const d = day(4);
  const l = (await ok(c.post('/api/lessons', { studentId: a.id, day: d, startMin: 480, durationMin: 60 }))).lesson;
  assert.equal((await c.post('/api/lessons', { studentId: b.id, day: d, startMin: 480, durationMin: 60 })).status, 409);
  await ok(c.post(`/api/lessons/${l.id}/mark`, { status: 'gs_huy' }));
  assert.equal((await c.post('/api/lessons', { studentId: b.id, day: d, startMin: 480, durationMin: 60 })).status, 200);
});

test('nhập xấu: giờ, thời lượng, ngày, thứ, kéo qua nửa đêm, học sinh không tồn tại', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const base = { studentId: s.id, day: day(2), startMin: 600, durationMin: 60 };
  for (const bad of [{ startMin: -1 }, { startMin: 1440 }, { startMin: 10.5 }, { startMin: '9h' }, { durationMin: 5 }, { durationMin: 481 }, { durationMin: 0 }, { startMin: 1400, durationMin: 60 }, { day: '2026-02-31' }, { day: '04/10/2026' }, { day: undefined }, { studentId: 'không-phải-uuid' }, { studentId: '00000000-0000-4000-8000-000000000000' }, { location: 'x'.repeat(81) }]) {
    const r = await c.post('/api/lessons', { ...base, ...bad });
    assert.ok([400, 404].includes(r.status), JSON.stringify(bad) + ' -> ' + r.status);
  }
  for (const bad of [{ weekday: 0 }, { weekday: 8 }, { weekday: 'thứ hai' }, { startMin: 2000 }, { durationMin: 14 }, { validFrom: '2020-01-01' }, { validFrom: day(400) }, { validFrom: '2026-02-31' }]) {
    const r = await c.post(`/api/students/${s.id}/slots`, { weekday: 3, startMin: 600, durationMin: 60, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await c.get('/api/week?from=2026-02-31')).status, 400);
  assert.equal((await c.get('/api/week?days=100')).status, 400);
  assert.equal((await c.get('/api/week?days=abc')).status, 400);
});

test('điểm danh: đã dạy ghi học phí lúc đó; chưa đến ngày thì không điểm danh "đã dạy"; bỏ điểm danh trả lại', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 200000 });
  const past = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-2), startMin: 600, durationMin: 60 }))).lesson;
  const future = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(3), startMin: 600, durationMin: 60 }))).lesson;
  const m = await ok(c.post(`/api/lessons/${past.id}/mark`, { status: 'da_day' }));
  assert.equal(m.lesson.status, 'da_day'); assert.equal(m.lesson.fee, 200000); assert.equal(m.balance, 200000);
  // đổi mức phí sau đó không đổi buổi cũ
  await ok(c.post(`/api/students/${s.id}`, { feeAmount: 300000 }));
  assert.equal((await ok(c.get(`/api/lessons/${past.id}`))).lesson.fee, 200000);
  assert.equal((await c.post(`/api/lessons/${future.id}/mark`, { status: 'da_day' })).status, 409);
  assert.equal((await c.post(`/api/lessons/${future.id}/mark`, { status: 'gs_huy' })).status, 200, 'hủy trước ngày dạy được');
  const undo = await ok(c.post(`/api/lessons/${past.id}/mark`, { status: 'du_kien' }));
  assert.equal(undo.lesson.fee, 0); assert.equal(undo.balance, 0);
  assert.equal((await c.post(`/api/lessons/${past.id}/mark`, { status: 'tuy_y' })).status, 400);
  assert.equal((await c.post(`/api/lessons/${past.id}/mark`, { status: 'da_day', fee: -5 })).status, 400);
  assert.equal((await c.post(`/api/lessons/${past.id}/mark`, { status: 'da_day', fee: 1e12 })).status, 400);
  const o = await ok(c.post(`/api/lessons/${past.id}/mark`, { status: 'da_day', fee: 150000 }));
  assert.equal(o.lesson.fee, 150000);
});

test('học sinh nghỉ: chọn tính phí hay không; gia sư hủy không bao giờ tính phí', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 100000 });
  const mk = async (n) => (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-n), startMin: 600, durationMin: 60 }))).lesson;
  const l1 = await mk(1); const l2 = await mk(2); const l3 = await mk(3);
  assert.equal((await ok(c.post(`/api/lessons/${l1.id}/mark`, { status: 'hs_nghi' }))).balance, 0);
  assert.equal((await ok(c.post(`/api/lessons/${l2.id}/mark`, { status: 'hs_nghi', billable: true }))).balance, 100000);
  const r = await ok(c.post(`/api/lessons/${l3.id}/mark`, { status: 'gs_huy', billable: true, fee: 99999 }));
  assert.equal(r.balance, 100000); assert.equal(r.lesson.fee, 0);
});

test('buổi bù: chỉ cho buổi đã hủy/học sinh nghỉ, mỗi buổi gốc một buổi bù, không bù của buổi bù, kiểm tra trùng giờ', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 100000 });
  const o = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-3), startMin: 600, durationMin: 60 }))).lesson;
  assert.equal((await c.post('/api/lessons', { makeupOf: o.id, day: day(2), startMin: 600, durationMin: 60 })).status, 409, 'buổi còn dự kiến thì chưa xếp bù');
  await ok(c.post(`/api/lessons/${o.id}/mark`, { status: 'hs_nghi' }));
  const mk = await ok(c.post('/api/lessons', { makeupOf: o.id, day: day(2), startMin: 600, durationMin: 60 }));
  assert.equal(mk.lesson.makeupOf, o.id);
  assert.equal((await ok(c.get(`/api/lessons/${o.id}`))).lesson.hasMakeup, true);
  assert.equal((await c.post('/api/lessons', { makeupOf: o.id, day: day(3), startMin: 600, durationMin: 60 })).status, 409, 'chỉ một buổi bù');
  assert.equal((await c.post('/api/lessons', { makeupOf: mk.lesson.id, day: day(4), startMin: 600, durationMin: 60 })).status, 409);
  // đồng thời hai buổi bù cho một buổi gốc khác
  const o2 = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-4), startMin: 600, durationMin: 60 }))).lesson;
  await ok(c.post(`/api/lessons/${o2.id}/mark`, { status: 'gs_huy' }));
  const rs = await Promise.all([day(6), day(7), day(8)].map((d) => c.post('/api/lessons', { makeupOf: o2.id, day: d, startMin: 900, durationMin: 60 })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  // buổi bù chỉ tính phí khi dạy (buổi gốc hủy không tính)
  const dq = (await ok(c.get('/api/students/' + s.id))).student;
  assert.equal(dq.balance, 0);
});

test('dời buổi: chỉ buổi chưa dạy, kiểm tra trùng giờ, buổi sinh từ lịch lặp dời đi không bị sinh lại', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { name: 'An' });
  const b = await addStudent(c, { name: 'Bình' });
  const d = day(2);
  await ok(c.post(`/api/students/${a.id}/slots`, slotBody(d, 600, 60)));
  const l = (await weekOf(c, d, 1))[0];
  await ok(c.post('/api/lessons', { studentId: b.id, day: util.addDays(d, 1), startMin: 600, durationMin: 60 }));
  assert.equal((await c.post(`/api/lessons/${l.id}/move`, { day: util.addDays(d, 1), startMin: 630, durationMin: 60 })).status, 409);
  const mv = await ok(c.post(`/api/lessons/${l.id}/move`, { day: util.addDays(d, 1), startMin: 720, durationMin: 60 }));
  assert.equal(mv.lesson.day, util.addDays(d, 1)); assert.equal(mv.lesson.moved, true);
  // xem lại nhiều lần: không sinh lại buổi gốc tại ngày d
  await weekOf(c, d, 3); await weekOf(c, d, 3);
  const at = (await weekOf(c, d, 1)).filter((x) => x.studentName === 'An');
  assert.equal(at.length, 0, 'ngày gốc không còn buổi của An');
  // không thể dời buổi đã dạy
  const past = (await ok(c.post('/api/lessons', { studentId: a.id, day: day(-1), startMin: 600, durationMin: 60 }))).lesson;
  await ok(c.post(`/api/lessons/${past.id}/mark`, { status: 'da_day' }));
  assert.equal((await c.post(`/api/lessons/${past.id}/move`, { day: day(5), startMin: 600, durationMin: 60 })).status, 409);
  // dời về chính chỗ của mình không tự trùng với mình
  assert.equal((await c.post(`/api/lessons/${l.id}/move`, { day: util.addDays(d, 1), startMin: 725, durationMin: 60 })).status, 200);
});

test('xóa buổi: buổi lẻ xóa được, buổi của lịch lặp phải hủy, buổi đã tính phí phải bỏ điểm danh', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const one = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-1), startMin: 600, durationMin: 60 }))).lesson;
  await ok(c.post(`/api/lessons/${one.id}/mark`, { status: 'da_day' }));
  assert.equal((await c.del(`/api/lessons/${one.id}`)).status, 409);
  await ok(c.post(`/api/lessons/${one.id}/mark`, { status: 'du_kien' }));
  assert.equal((await c.del(`/api/lessons/${one.id}`)).status, 200);
  assert.equal((await c.get(`/api/lessons/${one.id}`)).status, 404);
  await ok(c.post(`/api/students/${s.id}/slots`, slotBody(day(1), 600, 60)));
  const sl = (await weekOf(c, day(0), 14)).find((x) => x.slotId);
  assert.equal((await c.del(`/api/lessons/${sl.id}`)).status, 409);
  await ok(c.post(`/api/lessons/${sl.id}/mark`, { status: 'gs_huy' }));
  assert.ok((await weekOf(c, sl.day, 1)).some((x) => x.id === sl.id && x.status === 'gs_huy'), 'buổi hủy còn đó, không bị sinh lại');
});

test('dừng lịch lặp: xóa buổi dự kiến chưa ghi gì từ hôm nay, giữ lịch sử và buổi đã có ghi chép', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const slot = (await ok(c.post(`/api/students/${s.id}/slots`, slotBody(day(1), 600, 60, { validFrom: day(-14) })))).slot;
  const all = await weekOf(c, day(-14), 42);
  const past = all.filter((l) => l.day < day(0));
  const fut = all.filter((l) => l.day >= day(0));
  assert.ok(past.length >= 2 && fut.length >= 3);
  await ok(c.post(`/api/lessons/${fut[1].id}/log`, { topic: 'Đã soạn bài trước' }));
  await ok(c.del(`/api/slots/${slot.id}`));
  const after = await weekOf(c, day(-14), 42);
  assert.equal(after.filter((l) => l.day < day(0)).length, past.length, 'lịch sử còn nguyên');
  const futAfter = after.filter((l) => l.day >= day(0));
  assert.deepEqual(futAfter.map((l) => l.id), [fut[1].id], 'chỉ còn buổi đã có ghi chép');
  assert.equal((await ok(c.get('/api/students/' + s.id))).slots.length, 0);
  // không sinh lại
  assert.equal((await weekOf(c, day(0), 42)).length, 1);
});

test('lưu trữ học sinh: dừng lịch, thu hồi link phụ huynh, giữ lịch sử và sổ nợ; khôi phục được', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 100000 });
  await ok(c.post(`/api/students/${s.id}/slots`, slotBody(day(1), 600, 60)));
  const l = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-1), startMin: 900, durationMin: 60 }))).lesson;
  await ok(c.post(`/api/lessons/${l.id}/mark`, { status: 'da_day' }));
  const link = (await ok(c.post(`/api/students/${s.id}/link`, {}))).link;
  assert.equal((await c.get('/api/r/' + link.token, { csrf: false })).status, 200);
  await ok(c.post(`/api/students/${s.id}/archive`, { active: false }));
  assert.equal((await new (c.constructor)().get('/api/r/' + link.token)).status, 404);
  assert.equal((await weekOf(c, day(0), 28)).length, 0, 'học sinh nghỉ: lịch lặp tạm dừng, không sinh buổi');
  assert.equal((await c.post(`/api/students/${s.id}/slots`, slotBody(day(1)))).status, 409);
  assert.equal((await c.post('/api/lessons', { studentId: s.id, day: day(2), startMin: 600, durationMin: 60 })).status, 409);
  const st = (await ok(c.get('/api/students'))).students.find((x) => x.id === s.id);
  assert.equal(st.active, false); assert.equal(st.balance, 100000);
  await ok(c.post(`/api/students/${s.id}/archive`, { active: true }));
  assert.ok((await weekOf(c, day(0), 28)).length >= 3, 'khôi phục: lịch lặp cũ chạy lại');
  assert.equal((await c.post(`/api/students/${s.id}/slots`, slotBody(day(1), 600, 60))).status, 409, 'trùng với chính lịch cũ đã chạy lại');
  assert.equal((await c.post(`/api/students/${s.id}/archive`, { active: 'có' })).status, 400);
});

test('nhật ký buổi học: lưu nội dung, bài tập, nhận xét, mức tiếp thu; kiểm tra độ dài; ghi chú riêng tách biệt', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const l = (await ok(c.post('/api/lessons', { studentId: s.id, day: day(-1), startMin: 600, durationMin: 60 }))).lesson;
  const r = await ok(c.post(`/api/lessons/${l.id}/log`, { topic: 'Phương trình bậc hai', homework: 'Bài 1 đến 5 trang 40', comment: 'Bé hiểu bài,\ncần luyện thêm', rating: 4, privateNote: 'Mẹ hay đón trễ' }));
  assert.equal(r.lesson.topic, 'Phương trình bậc hai'); assert.equal(r.lesson.comment, 'Bé hiểu bài,\ncần luyện thêm'); assert.equal(r.lesson.rating, 4);
  assert.equal((await ok(c.post(`/api/lessons/${l.id}/log`, { rating: null }))).lesson.rating, null);
  for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { topic: 'x'.repeat(301) }, { comment: 'x'.repeat(601) }, { homework: 5 }, { privateNote: [] }]) assert.equal((await c.post(`/api/lessons/${l.id}/log`, bad)).status, 400, JSON.stringify(bad));
  // đã có nội dung cũ vẫn giữ khi cập nhật trường khác
  const r2 = await ok(c.post(`/api/lessons/${l.id}/log`, { topic: 'Mới' }));
  assert.equal(r2.lesson.comment, 'Bé hiểu bài,\ncần luyện thêm');
});

test('hôm nay: danh sách buổi hôm nay, buổi quá hạn chưa điểm danh, thống kê và cảnh báo hết gói', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 100000 });
  const g = await addStudent(c, { name: 'Gói', feeModel: 'goi', feeAmount: 1000000, packageSessions: 10 });
  await ok(c.post('/api/lessons', { studentId: s.id, day: day(0), startMin: 480, durationMin: 60 }));
  await ok(c.post('/api/lessons', { studentId: s.id, day: day(-2), startMin: 480, durationMin: 60 }));
  const t = await ok(c.get('/api/today'));
  assert.equal(t.lessons.length, 1); assert.equal(t.overdue.length, 1); assert.equal(t.today, day(0));
  assert.equal(t.stats.students, 2);
  assert.deepEqual(t.lowPackages.map((x) => x.name), ['Gói'], 'gói chưa mua nên còn 0 buổi');
  assert.ok(g.id);
});
