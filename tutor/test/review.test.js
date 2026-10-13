// Các điểm rút ra từ phản biện bảo mật nội bộ và từ lỗi đã gặp ở 9lunch: mỗi test tái hiện một rủi ro
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newTutor, addStudent, day, db, base, util } from './helper.js';
import { maintenance } from '../src/server.js';
import { sha256hex } from '../src/util.js';

before(async () => { await boot(); });
after(shutdown);

test('phiên quá 90 ngày không hoạt động thì hết hiệu lực ở máy chủ (không chỉ ở cookie)', async () => {
  const a = await newTutor();
  assert.equal((await a.get('/api/me')).status, 200);
  await db.query(`UPDATE sessions SET last_used_at = now() - interval '91 days' WHERE token_hash = $1`, [sha256hex(a.cookie.split('=')[1])]);
  assert.equal((await a.get('/api/me')).status, 401);
  // vẫn khôi phục được bằng mã
  assert.equal((await new Client().post('/api/recover', { code: a.recovery })).status, 200);
});

test('mã ghép: hai máy đổi cùng một mã cùng lúc chỉ một máy được vào', async () => {
  const a = await newTutor();
  const { code } = await ok(a.post('/api/devices/pair'));
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => new Client().post('/api/devices/redeem', { code })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
  assert.equal(rs.filter((r) => r.status === 404).length, 4);
});

test('nhiều khoản thu đồng thời: tổng đã thu đúng, không mất khoản nào', async () => {
  const a = await newTutor();
  const s = await addStudent(a, { feeAmount: 100000 });
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => a.post(`/api/students/${s.id}/payments`, { amount: 10000 + i })));
  assert.ok(rs.every((r) => r.status === 200));
  const d = await ok(a.get('/api/students/' + s.id));
  assert.equal(d.payments.length, 12);
  assert.equal(d.student.paid, 12 * 10000 + (11 * 12) / 2);
  assert.equal(d.student.balance, -d.student.paid);
});

test('điểm danh đồng thời / lặp lại không nhân đôi học phí', async () => {
  const a = await newTutor();
  const s = await addStudent(a, { feeAmount: 150000 });
  const l = (await ok(a.post('/api/lessons', { studentId: s.id, day: day(-1), startMin: 600, durationMin: 60 }))).lesson;
  await Promise.all(Array.from({ length: 6 }, () => a.post(`/api/lessons/${l.id}/mark`, { status: 'da_day' })));
  assert.equal((await ok(a.get('/api/students/' + s.id))).student.balance, 150000);
  await Promise.all([a.post(`/api/lessons/${l.id}/mark`, { status: 'du_kien' }), a.post(`/api/lessons/${l.id}/mark`, { status: 'du_kien' })]);
  assert.equal((await ok(a.get('/api/students/' + s.id))).student.balance, 0);
});

test('tạo học sinh với Idempotency-Key: bấm hai lần chỉ có một hồ sơ', async () => {
  const a = await newTutor();
  const h = { 'idempotency-key': 'tao-hoc-sinh-0001' };
  const r1 = await a.post('/api/students', { name: 'Một lần thôi' }, { headers: h });
  const r2 = await a.post('/api/students', { name: 'Một lần thôi' }, { headers: h });
  assert.equal(r1.json.student.id, r2.json.student.id);
  assert.equal((await ok(a.get('/api/students'))).students.length, 1);
});

test('đường dẫn trang công khai có dấu / cuối vẫn mở được; chữ hoa chữ thường của mã được phân biệt', async () => {
  const a = await newTutor();
  const s = await addStudent(a);
  const t = (await ok(a.post(`/api/students/${s.id}/link`, {}))).link.token;
  assert.equal((await fetch(`${base}/r/${t}/`)).status, 200);
  assert.equal((await new Client().get(`/api/r/${t}`)).status, 200);
  const swapped = [...t].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('');
  if (swapped !== t) assert.equal((await new Client().get(`/api/r/${swapped}`)).status, 404);
});

test('API công khai không nhận và không đặt cookie; không trả thông tin gia sư ngoài tên', async () => {
  const a = await newTutor('Cô Công Khai');
  const s = await addStudent(a, { name: 'Bé Công Khai', note: 'ghi-chu-noi-bo' });
  const t = (await ok(a.post(`/api/students/${s.id}/link`, {}))).link.token;
  const anon = new Client();
  const r = await anon.get('/api/r/' + t);
  assert.equal(r.setCookie.length, 0);
  const txt = r.buf.toString();
  assert.ok(!txt.includes('ghi-chu-noi-bo') && !txt.includes(s.code) && !txt.includes('seq') && !txt.includes('tutor_id') && !txt.includes(s.id));
  assert.deepEqual(Object.keys(r.json.tutor), ['name']);
});

test('lịch lặp quá khứ: ghi bù các buổi đã dạy; ngày hiệu lực ngoài khoảng cho phép bị từ chối', async () => {
  const a = await newTutor();
  const s = await addStudent(a, { feeAmount: 100000 });
  const from = day(-21);
  const r = await ok(a.post(`/api/students/${s.id}/slots`, { weekday: util.isoWeekday(from), startMin: 600, durationMin: 60, validFrom: from }));
  assert.ok(r.slot);
  const past = (await ok(a.get(`/api/week?from=${from}&days=22`))).lessons.filter((l) => l.day < day(0));
  assert.ok(past.length >= 3, 'đã sinh các buổi trong quá khứ để điểm danh bù: ' + past.length);
  for (const l of past) await ok(a.post(`/api/lessons/${l.id}/mark`, { status: 'da_day' }));
  assert.equal((await ok(a.get('/api/students/' + s.id))).student.balance, past.length * 100000);
});

test('lưu trữ học sinh không làm mất học phí đang nợ trong báo cáo hiện tại', async () => {
  const a = await newTutor();
  const s = await addStudent(a, { feeAmount: 80000 });
  const l = (await ok(a.post('/api/lessons', { studentId: s.id, day: day(-1), startMin: 600, durationMin: 60 }))).lesson;
  await ok(a.post(`/api/lessons/${l.id}/mark`, { status: 'da_day' }));
  await ok(a.post(`/api/students/${s.id}/archive`, { active: false }));
  const rep = await ok(a.get('/api/reports/month'));
  assert.equal(rep.totals.owedNow, 80000);
  assert.equal((await ok(a.get('/api/today'))).stats.owed, 0, 'hôm nay chỉ tính học sinh đang dạy');
});

test('tên có dấu và emoji được giữ nguyên; chuẩn hóa NFC', async () => {
  const a = await newTutor();
  const decomposed = 'Nguyễn';
  const s = await addStudent(a, { name: decomposed + ' Hương 😀' });
  assert.equal(s.name, 'Nguyễn Hương 😀');
});

test('xem trước mã ghép: trả tên tài khoản, không đốt mã; mã sai 404', async () => {
  const a = await newTutor('Cô Xem Trước');
  const { code } = await ok(a.post('/api/devices/pair'));
  const x = new Client();
  assert.equal((await x.post('/api/devices/peek', { code })).json.name, 'Cô Xem Trước');
  assert.equal((await x.post('/api/devices/peek', { code })).status, 200, 'xem nhiều lần không đốt mã');
  assert.equal((await x.post('/api/devices/peek', { code: 'ZZZZZZZZZZZZ' })).status, 404);
  assert.equal((await x.post('/api/devices/peek', {})).status, 404);
  assert.equal((await x.post('/api/devices/redeem', { code })).status, 200);
  assert.equal((await x.post('/api/devices/peek', { code })).status, 404, 'đã dùng thì hết xem');
});

test('bảo trì: xóa phiên quá hạn, mã ghép hết hạn, khóa idempotency cũ; giữ phiên còn hạn', async () => {
  const a = await newTutor('Giữ phiên');
  const old = await newTutor('Phiên cũ');
  await db.query(`UPDATE sessions SET last_used_at = now() - interval '120 days' WHERE tutor_id = (SELECT id FROM tutors WHERE name='Phiên cũ')`);
  await db.query(`INSERT INTO idem(scope, key, created_at) VALUES('x','y', now() - interval '3 days')`);
  await maintenance();
  assert.equal((await a.get('/api/me')).status, 200);
  assert.equal((await old.get('/api/me')).status, 401);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM idem WHERE scope='x'"))[0].n, 0);
});
