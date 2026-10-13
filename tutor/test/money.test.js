// Học phí: theo buổi / tháng / gói, thu một phần và thu đủ, QR VietQR, nhắc phụ huynh, báo cáo tháng, nhập xấu, đồng thời
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { boot, shutdown, ok, newTutor, addStudent, day, db, util, BANK } from './helper.js';
import { crc16 } from '../src/transfer.js';

before(async () => { await boot(); });
after(shutdown);

async function lesson(c, s, d, status = 'da_day', extra = {}) {
  const l = (await ok(c.post('/api/lessons', { studentId: s.id, day: d, startMin: 480 + Math.floor(Math.random() * 600), durationMin: 60 }))).lesson;
  if (status) await ok(c.post(`/api/lessons/${l.id}/mark`, { status, ...extra }));
  return l;
}
const stu = async (c, id) => (await ok(c.get('/api/students/' + id))).student;

test('theo buổi: còn nợ = Σ buổi đã dạy × mức phí − đã thu; thu một phần, thu đủ, trả dư', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 200000 });
  for (let i = 1; i <= 4; i++) await lesson(c, s, day(-i));
  assert.equal((await stu(c, s.id)).balance, 800000);
  let r = await ok(c.post(`/api/students/${s.id}/payments`, { amount: 300000, method: 'tm', note: 'Mẹ đưa tay' }));
  assert.equal(r.balance, 500000);
  r = await ok(c.post(`/api/students/${s.id}/payments`, { full: true }));
  assert.equal(r.payment.amount, 500000); assert.equal(r.balance, 0);
  assert.equal((await c.post(`/api/students/${s.id}/payments`, { full: true })).status, 409, 'hết nợ thì không "thu đủ"');
  r = await ok(c.post(`/api/students/${s.id}/payments`, { amount: 100000 }));
  assert.equal(r.balance, -100000, 'đóng trước');
  await lesson(c, s, day(-5));
  assert.equal((await stu(c, s.id)).balance, 100000);
  const d = await ok(c.get('/api/students/' + s.id));
  assert.equal(d.payments.length, 3);
  await ok(c.del('/api/payments/' + d.payments[0].id));
  assert.equal((await stu(c, s.id)).balance, 200000);
});

test('thu đủ do máy chủ tính; số tiền trình duyệt gửi kèm bị bỏ qua; hai yêu cầu đồng thời chỉ một thành công', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 150000 });
  await lesson(c, s, day(-1)); await lesson(c, s, day(-2));
  const rs = await Promise.all([1, 2, 3, 4].map(() => c.post(`/api/students/${s.id}/payments`, { full: true, amount: 5 })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
  const ok1 = rs.find((r) => r.status === 200);
  assert.equal(ok1.json.payment.amount, 300000);
  assert.equal((await stu(c, s.id)).balance, 0);
});

test('Idempotency-Key: bấm hai lần chỉ ghi một khoản thu', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 100000 });
  await lesson(c, s, day(-1));
  const h = { 'idempotency-key': 'khoa-bam-dup-0001' };
  const a = await c.post(`/api/students/${s.id}/payments`, { amount: 40000 }, { headers: h });
  const b = await c.post(`/api/students/${s.id}/payments`, { amount: 40000 }, { headers: h });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.json.payment.id, b.json.payment.id);
  assert.equal((await ok(c.get('/api/students/' + s.id))).payments.length, 1);
  assert.equal((await c.post(`/api/students/${s.id}/payments`, { amount: 1 }, { headers: { 'idempotency-key': 'ngan' } })).status, 400);
});

test('nhập xấu cho khoản thu: âm, 0, thập phân, quá lớn, ngày sai, hình thức lạ', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  for (const bad of [{ amount: 0 }, { amount: -1000 }, { amount: 1.5 }, { amount: 1e12 }, { amount: '1e6' }, { amount: 'abc' }, { amount: null }, {}, { amount: 1000, paidOn: '2026-02-30' }, { amount: 1000, method: 'bitcoin' }, { amount: 1000, note: 'x'.repeat(121) }, { full: 'true' }]) {
    assert.equal((await c.post(`/api/students/${s.id}/payments`, bad)).status, 400, JSON.stringify(bad));
  }
  for (const bad of [{ kind: 'lạ' }, { kind: 'khac', amount: 100 }, { kind: 'khac', note: 'x', amount: -1 }, { kind: 'khac', note: 'x', amount: 2e9 }, { kind: 'thang', period: '2026-13' }, { kind: 'goi', sessions: 0 }, { kind: 'goi', sessions: 500 }]) {
    assert.equal((await c.post(`/api/students/${s.id}/charges`, bad)).status, 400, JSON.stringify(bad));
  }
  // học sinh: mức phí và số buổi
  for (const bad of [{ feeAmount: -1 }, { feeAmount: 2e8 }, { feeAmount: 10.5 }, { feeModel: 'x' }, { feeModel: 'goi', packageSessions: 0 }, { packageSessions: 201 }, { name: '' }, { name: 'x'.repeat(61) }, { parentPhone: 'abc' }, { note: 'x'.repeat(501) }]) {
    assert.equal((await c.post('/api/students', { name: 'Test', ...bad })).status, 400, JSON.stringify(bad));
  }
});

test('theo tháng: tạo học phí tháng không trùng kỳ; tạo hàng loạt chỉ cho học sinh tính tháng; buổi dạy không cộng thêm', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { name: 'A', feeModel: 'thang', feeAmount: 2000000 });
  const b = await addStudent(c, { name: 'B', feeModel: 'thang', feeAmount: 1500000 });
  const z = await addStudent(c, { name: 'Z', feeModel: 'buoi', feeAmount: 100000 });
  const free = await addStudent(c, { name: 'Miễn', feeModel: 'thang', feeAmount: 0 });
  await lesson(c, a, day(-1)); await lesson(c, a, day(-2));
  assert.equal((await stu(c, a.id)).balance, 0, 'chưa tạo học phí tháng thì chưa nợ');
  const r1 = await ok(c.post(`/api/students/${a.id}/charges`, { kind: 'thang', period: '2026-10' }));
  assert.equal(r1.charge.amount, 2000000); assert.equal(r1.balance, 2000000);
  assert.equal((await c.post(`/api/students/${a.id}/charges`, { kind: 'thang', period: '2026-10' })).status, 409);
  assert.equal((await ok(c.post(`/api/students/${a.id}/charges`, { kind: 'thang', period: '2026-11', amount: 1800000 }))).balance, 3800000);
  const bulk = await ok(c.post('/api/billing/monthly', { period: '2026-10' }));
  assert.equal(bulk.created, 1, 'chỉ B (A đã có, Z tính buổi, Miễn phí 0)');
  assert.equal((await ok(c.post('/api/billing/monthly', { period: '2026-10' }))).created, 0, 'chạy lại không tạo trùng');
  assert.equal((await stu(c, b.id)).balance, 1500000);
  assert.equal((await stu(c, z.id)).balance, 0); assert.equal((await stu(c, free.id)).balance, 0);
  assert.equal((await c.post('/api/billing/monthly', { period: 'x' })).status, 400);
  // xóa khoản nhập nhầm
  const d = await ok(c.get('/api/students/' + b.id));
  await ok(c.del('/api/charges/' + d.charges[0].id));
  assert.equal((await stu(c, b.id)).balance, 0);
});

test('đồng thời: tạo học phí tháng hai lần cùng lúc chỉ ra một khoản', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { feeModel: 'thang', feeAmount: 1000000 });
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => c.post(`/api/students/${a.id}/charges`, { kind: 'thang', period: '2026-09' })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 4);
  await Promise.all([1, 2, 3].map(() => c.post('/api/billing/monthly', { period: '2026-08' })));
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM charges WHERE student_id=$1 AND period='2026-08'`, [a.id]))[0].n, 1);
});

test('gói N buổi: bán gói, trừ dần theo buổi dạy, cảnh báo sắp hết, bán gói mới cộng thêm', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { name: 'Gói', feeModel: 'goi', feeAmount: 1600000, packageSessions: 8 });
  assert.equal((await stu(c, s.id)).pkgLeft, 0);
  const b = await ok(c.post(`/api/students/${s.id}/charges`, { kind: 'goi' }));
  assert.equal(b.charge.sessions, 8); assert.equal(b.charge.amount, 1600000);
  assert.equal((await stu(c, s.id)).pkgLeft, 8);
  for (let i = 1; i <= 6; i++) { const r = await lesson(c, s, day(-i)); assert.equal(r.fee, 0); }
  let st = await stu(c, s.id);
  assert.equal(st.pkgLeft, 2); assert.equal(st.balance, 1600000, 'gói đã tính một lần, buổi dạy không cộng thêm');
  await lesson(c, s, day(-7));
  assert.equal((await ok(c.get('/api/today'))).lowPackages[0].left, 1);
  await lesson(c, s, day(-8)); await lesson(c, s, day(-9));
  assert.equal((await stu(c, s.id)).pkgLeft, -1, 'dạy lố gói thì âm, hiện cảnh báo');
  await ok(c.post(`/api/students/${s.id}/charges`, { kind: 'goi', sessions: 10, amount: 1900000 }));
  st = await stu(c, s.id);
  assert.equal(st.pkgLeft, 9); assert.equal(st.balance, 3500000);
  // đổi cách tính sau đó không đổi buổi cũ
  await ok(c.post(`/api/students/${s.id}`, { feeModel: 'buoi', feeAmount: 100000 }));
  assert.equal((await stu(c, s.id)).balance, 3500000);
});

test('khoản khác (phí tài liệu): cần ghi chú, cộng vào nợ', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const r = await ok(c.post(`/api/students/${s.id}/charges`, { kind: 'khac', amount: 120000, note: 'Sách bài tập' }));
  assert.equal(r.balance, 120000);
});

test('báo cáo tháng: phát sinh, đã thu, số buổi và giờ, theo học sinh, còn nợ hiện tại, xu hướng 6 tháng', async () => {
  const c = await newTutor();
  const a = await addStudent(c, { name: 'An', feeAmount: 100000 });
  const b = await addStudent(c, { name: 'Bình', feeAmount: 200000 });
  const thisMonth = util.monthOf(day(0));
  const prevDay = util.monthRange(util.addMonths(thisMonth, -1)).from;
  // buổi tháng trước (bỏ qua ràng buộc ngày bằng cách tạo buổi quá khứ)
  const l0 = await lesson(c, a, prevDay); const l1 = await lesson(c, a, util.addDays(prevDay, 1));
  const l2 = (await ok(c.post('/api/lessons', { studentId: b.id, day: day(0), startMin: 480, durationMin: 90 }))).lesson;
  await ok(c.post(`/api/lessons/${l2.id}/mark`, { status: 'da_day' }));
  await ok(c.post(`/api/lessons/${(await ok(c.post('/api/lessons', { studentId: b.id, day: day(0), startMin: 700, durationMin: 60 }))).lesson.id}/mark`, { status: 'hs_nghi' }));
  await ok(c.post(`/api/students/${a.id}/payments`, { amount: 50000, paidOn: prevDay }));
  await ok(c.post(`/api/students/${b.id}/payments`, { amount: 100000 }));
  const cur = await ok(c.get('/api/reports/month?month=' + thisMonth));
  assert.equal(cur.totals.accrued, 200000); assert.equal(cur.totals.collected, 100000);
  assert.equal(cur.totals.taught, 1); assert.equal(cur.totals.hours, 1.5); assert.equal(cur.totals.absent, 1);
  assert.equal(cur.totals.owedNow, 150000 + 100000);
  const sb = cur.students.find((x) => x.name === 'Bình');
  assert.equal(sb.accrued, 200000); assert.equal(sb.collected, 100000); assert.equal(sb.balance, 100000);
  const prev = await ok(c.get('/api/reports/month?month=' + util.addMonths(thisMonth, -1)));
  assert.equal(prev.totals.accrued, 200000); assert.equal(prev.totals.collected, 50000); assert.equal(prev.totals.taught, 2);
  assert.equal(cur.trend.length, 6); assert.equal(cur.trend[5].month, thisMonth);
  assert.equal(cur.trend[5].collected, 100000); assert.equal(cur.trend[4].accrued, 200000);
  assert.equal((await c.get('/api/reports/month?month=2026-99')).status, 400);
  assert.ok(l0 && l1);
});

test('báo cáo chỉ tính dữ liệu của chính gia sư đó', async () => {
  const a = await newTutor('Cô A'); const b = await newTutor('Cô B');
  const s = await addStudent(a, { feeAmount: 999000 }); await lesson(a, s, day(-1));
  const rb = await ok(b.get('/api/reports/month'));
  assert.equal(rb.totals.accrued, 0); assert.equal(rb.students.length, 0); assert.equal(rb.totals.owedNow, 0);
  assert.equal((await ok(b.get('/api/today'))).stats.owed, 0);
});

test('QR học phí: cần tài khoản nhận tiền; payload VietQR đúng số tiền, nội dung, CRC; ảnh PNG quét ra đúng payload', async () => {
  const c = await newTutor();
  const s = await addStudent(c, { feeAmount: 250000 });
  await lesson(c, s, day(-1));
  assert.equal((await c.get(`/api/students/${s.id}/qr.svg`)).status, 409, 'chưa lưu ngân hàng');
  await ok(c.post('/api/me', { bank: BANK }));
  const svg = await c.get(`/api/students/${s.id}/qr.svg`, { raw: true });
  assert.equal(svg.status, 200); assert.match(svg.headers.get('content-type'), /svg/); assert.match(svg.buf.toString(), /<svg/);
  const png = await c.get(`/api/students/${s.id}/qr.png?amount=123456`, { raw: true });
  assert.equal(png.status, 200); assert.match(png.headers.get('content-type'), /png/);
  const img = PNG.sync.read(png.buf);
  const code = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  assert.ok(code, 'quét được QR');
  const p = code.data;
  assert.equal(crc16(p.slice(0, -4)), p.slice(-4));
  assert.ok(p.includes('970436') && p.includes('0011004012345'));
  assert.ok(p.includes('5406123456'), 'số tiền');
  assert.ok(p.includes('0808' + '9T' + (await stu(c, s.id)).code), 'nội dung 9T + mã học sinh');
  assert.ok(!p.toLowerCase().includes('minh'), 'không chứa tên học sinh');
  // mặc định dùng số còn nợ
  const png2 = await c.get(`/api/students/${s.id}/qr.png`, { raw: true });
  const i2 = PNG.sync.read(png2.buf);
  assert.ok(jsQR(new Uint8ClampedArray(i2.data), i2.width, i2.height).data.includes('5406250000'));
  assert.equal((await c.get(`/api/students/${s.id}/qr.png?amount=-5`)).status, 400);
  assert.equal((await c.get(`/api/students/${s.id}/qr.png?amount=abc`)).status, 400);
});

test('nhắc phụ huynh: tin nhắn có số đúng; số Zalo riêng được ưu tiên; có kèm tài khoản khi còn nợ', async () => {
  const c = await newTutor();
  await ok(c.post('/api/me', { bank: BANK }));
  const s = await addStudent(c, { feeAmount: 200000, parentName: 'Hạnh', parentPhone: '0912345678', parentZalo: '0987654321' });
  await lesson(c, s, day(-1)); await lesson(c, s, day(-2));
  await ok(c.post(`/api/students/${s.id}/payments`, { amount: 100000 }));
  const r = await ok(c.get(`/api/students/${s.id}/reminder`));
  assert.equal(r.balance, 300000);
  assert.match(r.message, /anh\/chị Hạnh/); assert.match(r.message, /Còn lại: 300\.000đ/); assert.match(r.message, /Vietcombank/); assert.match(r.message, /0011004012345/); assert.match(r.message, /9T/);
  assert.equal(r.zaloPhone, '84987654321'); assert.equal(r.phone, '0912345678'); assert.equal(r.hasBank, true);
});
