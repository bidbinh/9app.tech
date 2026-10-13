// Vòng phản biện độc lập thứ hai: mỗi test tái hiện một lỗi đã được chỉ ra
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newTutor, addStudent, day, db, base, util, config, resetHourly } from './helper.js';
import { sha256hex } from '../src/util.js';
import { normIp } from '../src/http.js';
import { productionProblems } from '../src/config.js';
import { reminderMessage } from '../src/routes/money.js';
import { maintenance } from '../src/server.js';

before(async () => { await boot(); });
after(shutdown);

test('trang HTML: $&, $` và $\' trong tên và tiêu đề không bị replace() diễn giải', async () => {
  const a = await newTutor('Cô $& Lan', 'khac');
  const hl = "hello $` and $' world";
  const p = (await ok(a.post('/api/profile', { enabled: true, headline: hl, bio: '', subjects: 'Toán $&', levels: '', area: '', mode: 'ca_hai', contact: '' }))).profile;
  const html = await (await fetch(`${base}/g/${p.code}`)).text();
  assert.ok(html.includes('content="Cô $&amp; Lan - gia sư Toán $&amp;"'), html.match(/og:title[^>]*>/)?.[0]);
  assert.ok(html.includes('hello $` and $&#39; world'));
  assert.ok(!html.includes('<!--META-->'));
});

test('IP khách: phần tử cuối X-Forwarded-For, IPv4-mapped, IPv6 gom /64', async () => {
  assert.equal(normIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(normIp('2001:db8::5'), '2001:db8:0:0::/64');
  const c = new Client();
  await ok(c.post('/api/start', { name: 'Giả IP', status: 'khac' }, { headers: { 'x-forwarded-for': 'ke-gia-mao, 9.9.9.9' } }));
  assert.equal((await db.query("SELECT created_ip FROM tutors WHERE name='Giả IP'"))[0].created_ip, '9.9.9.9');
});

test('bộ đếm khôi phục, ghép, xem trước tách riêng', async () => {
  resetHourly();
  const old = config.recoverPerIpHour; config.recoverPerIpHour = 3;
  try {
    const c = new Client();
    for (let i = 0; i < 4; i++) await c.post('/api/devices/peek', { code: 'ZZZZZZZZZZZZ' });
    assert.equal((await c.post('/api/devices/redeem', { code: 'ZZZZZZZZZZZZ' })).status, 404, 'peek không ăn vào bộ đếm ghép');
    assert.equal((await c.post('/api/recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' })).status, 404);
  } finally { config.recoverPerIpHour = old; resetHourly(); }
});

test('xem trước ghép: có số học sinh và ngày tạo tài khoản đích', async () => {
  const a = await newTutor('Đích');
  await addStudent(a); await addStudent(a, { name: 'Bé 2' });
  const { code } = await ok(a.post('/api/devices/pair'));
  const r = await new Client().post('/api/devices/peek', { code });
  assert.equal(r.json.students, 2); assert.ok(r.json.createdAt);
});

test('Idempotency-Key: cùng khóa khác nội dung 422; hàng kẹt do tiến trình chết được dọn', async () => {
  const a = await newTutor();
  const h = { 'idempotency-key': 'khoa-khac-noi-dung-1' };
  assert.equal((await a.post('/api/students', { name: 'A' }, { headers: h })).status, 200);
  const r = await a.post('/api/students', { name: 'B' }, { headers: h });
  assert.equal(r.status, 422); assert.equal(r.json.error.code, 'idempotency_mismatch');
  assert.equal((await a.post('/api/students', { name: 'A' }, { headers: h })).status, 200, 'cùng nội dung vẫn trả kết quả cũ');
  await db.query(`INSERT INTO idem(scope, key, req_hash, created_at) VALUES($1, $2, 'x', now() - interval '5 minutes')`, [sha256hex(a.cookie.split('=')[1]), 'ket-cung-nhau-0001|POST /api/students']);
  const k = await a.post('/api/students', { name: 'C' }, { headers: { 'idempotency-key': 'ket-cung-nhau-0001' } });
  assert.equal(k.status, 200, 'hàng kẹt cũ bị dọn, yêu cầu mới chạy được');
});

test('lâu không mở app: Hôm nay sinh bù khoảng trống; buổi chưa điểm danh cũ vẫn nhắc, có phân trang', async () => {
  const a = await newTutor();
  const s = await addStudent(a);
  await ok(a.post(`/api/students/${s.id}/slots`, { weekday: util.isoWeekday(day(-50)), startMin: 600, durationMin: 60, validFrom: day(-59) }));
  for (let i = 1; i <= 45; i++) await db.query(`INSERT INTO lessons(tutor_id, student_id, day, start_min, duration_min) SELECT tutor_id, id, $2::date, 1000, 30 FROM students WHERE id=$1`, [s.id, day(-i - 100)]);
  const t1 = await ok(a.get('/api/today'));
  assert.ok(t1.overdueTotal >= 45 + 7, 'tính cả buổi cũ hơn 30 ngày và buổi sinh bù: ' + t1.overdueTotal);
  assert.equal(t1.overdue.length, 30);
  const t2 = await ok(a.get('/api/today?od=30'));
  assert.ok(t2.overdue.length >= 15 && t2.overdueOffset === 30);
  assert.notEqual(t1.overdue[0].id, t2.overdue[0].id);
  assert.equal((await a.get('/api/today?od=-1')).status, 400);
});

test('buổi bù cho buổi nghỉ đã tính phí có cảnh báo; học phí riêng bị bỏ qua ở mô hình tháng/gói có cảnh báo', async () => {
  const a = await newTutor();
  const s = await addStudent(a, { feeAmount: 100000 });
  const l = (await ok(a.post('/api/lessons', { studentId: s.id, day: day(-2), startMin: 600, durationMin: 60 }))).lesson;
  await ok(a.post(`/api/lessons/${l.id}/mark`, { status: 'hs_nghi', billable: true }));
  const m = await ok(a.post('/api/lessons', { makeupOf: l.id, day: day(2), startMin: 600, durationMin: 60 }));
  assert.match(m.warning, /tính học phí/);
  const t = await addStudent(a, { name: 'Tháng', feeModel: 'thang', feeAmount: 1000000 });
  const l2 = (await ok(a.post('/api/lessons', { studentId: t.id, day: day(-1), startMin: 900, durationMin: 60 }))).lesson;
  const r = await ok(a.post(`/api/lessons/${l2.id}/mark`, { status: 'da_day', fee: 50000 }));
  assert.match(r.warning, /không được áp dụng/); assert.equal(r.lesson.fee, 0);
  const r2 = await ok(a.post(`/api/lessons/${l.id}/mark`, { status: 'hs_nghi', billable: false }));
  assert.equal(r2.warning, undefined);
});

test('production từ chối mật khẩu mẫu MAT_KHAU', () => {
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://tutor:MAT_KHAU@9ship-db:5432/tutor' }).length, 1);
});

test('lưu giữ: created_ip hết hạn 30 ngày, tài khoản bỏ hoang bị xóa, tài khoản đang dùng giữ nguyên', async () => {
  const keep = await newTutor('Còn dùng'); await addStudent(keep);
  await newTutor('Bỏ hoang trống');
  const idleWith = await newTutor('Bỏ hoang có HS'); await addStudent(idleWith);
  await db.query(`UPDATE tutors SET created_at = now() - interval '40 days' WHERE name='Còn dùng'`);
  await db.query(`UPDATE tutors SET last_seen_at = now() - interval '400 days' WHERE name IN ('Bỏ hoang trống','Bỏ hoang có HS')`);
  await maintenance();
  assert.equal((await db.query("SELECT created_ip FROM tutors WHERE name='Còn dùng'"))[0].created_ip, null);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM tutors WHERE name='Bỏ hoang trống'"))[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM tutors WHERE name='Bỏ hoang có HS'"))[0].n, 1, 'có học sinh thì giữ tới 730 ngày');
  await db.query(`UPDATE tutors SET last_seen_at = now() - interval '800 days' WHERE name='Bỏ hoang có HS'`);
  await maintenance();
  assert.equal((await db.query("SELECT count(*)::int AS n FROM tutors WHERE name='Bỏ hoang có HS'"))[0].n, 0);
  assert.equal((await keep.get('/api/me')).status, 200);
});

test('tạo lại mã trang giới thiệu: mã cũ chết, mã mới sống; chưa có trang thì 404', async () => {
  const a = await newTutor('Mã trang', 'khac');
  assert.equal((await a.post('/api/profile/regenerate-code')).status, 404);
  const p = (await ok(a.post('/api/profile', { enabled: true, headline: 'Gia sư', bio: '', subjects: 'Toán', levels: '', area: '', mode: 'ca_hai', contact: '' }))).profile;
  const n = (await ok(a.post('/api/profile/regenerate-code'))).profile;
  assert.notEqual(n.code, p.code);
  assert.equal((await new Client().get('/api/g/' + p.code)).status, 404);
  assert.equal((await new Client().get('/api/g/' + n.code)).status, 200);
  assert.equal((await new Client().post('/api/profile/regenerate-code')).status, 401);
});

test('tin nhắc học phí không còn câu thừa', () => {
  const m = reminderMessage({ name: 'Minh', subject: '', parent_name: 'Lan' }, { bank_bin: null }, { total: 1, paid: 0, balance: 1 }, '9TX');
  assert.ok(!/Mình gửi anh\/chị/.test(m) && m.startsWith('Chào anh/chị Lan. Mình xin gửi'));
});
