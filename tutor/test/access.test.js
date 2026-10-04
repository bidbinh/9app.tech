// Phân quyền và IDOR: gia sư B không đọc/ghi/xóa được bất cứ thứ gì của gia sư A; id của người khác và id bịa cho cùng phản hồi
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newTutor, addStudent, day, wd, db, BANK } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const GHOST = '00000000-0000-4000-8000-0000000000aa';

async function world() {
  const a = await newTutor('Gia sư A'); const b = await newTutor('Gia sư B');
  await ok(a.post('/api/me', { bank: BANK }));
  const sa = await addStudent(a, { name: 'HS của A', note: 'ghi chú của A' });
  const sb = await addStudent(b, { name: 'HS của B' });
  const slot = (await ok(a.post(`/api/students/${sa.id}/slots`, { weekday: wd(day(1)), startMin: 600, durationMin: 60 }))).slot;
  const week = (await ok(a.get(`/api/week?from=${day(0)}&days=14`))).lessons;
  const slotLesson = week.find((l) => l.slotId);
  const one = (await ok(a.post('/api/lessons', { studentId: sa.id, day: day(-2), startMin: 900, durationMin: 60 }))).lesson;
  await ok(a.post(`/api/lessons/${one.id}/mark`, { status: 'hs_nghi' }));
  const mk = (await ok(a.post('/api/lessons', { makeupOf: one.id, day: day(3), startMin: 900, durationMin: 60 }))).lesson;
  const pay = (await ok(a.post(`/api/students/${sa.id}/payments`, { amount: 10000 }))).payment;
  const chg = (await ok(a.post(`/api/students/${sa.id}/charges`, { kind: 'khac', amount: 5000, note: 'Phí' }))).charge;
  const link = (await ok(a.post(`/api/students/${sa.id}/link`, {}))).link;
  const dev = (await ok(a.get('/api/devices'))).devices[0];
  return { a, b, sa, sb, slot, slotLesson, one, mk, pay, chg, link, dev };
}

test('B dùng id của A: mọi thao tác đều 404 và không thay đổi gì', async () => {
  const w = await world();
  const { b } = w;
  const tries = [
    ['GET', `/api/students/${w.sa.id}`], ['POST', `/api/students/${w.sa.id}`, { name: 'HACK' }], ['POST', `/api/students/${w.sa.id}/archive`, { active: false }],
    ['DELETE', `/api/students/${w.sa.id}`],
    ['POST', `/api/students/${w.sa.id}/slots`, { weekday: 1, startMin: 100, durationMin: 60 }],
    ['DELETE', `/api/slots/${w.slot.id}`],
    ['POST', `/api/students/${w.sa.id}/payments`, { amount: 1000 }], ['POST', `/api/students/${w.sa.id}/payments`, { full: true }],
    ['POST', `/api/students/${w.sa.id}/charges`, { kind: 'khac', amount: 1, note: 'x' }],
    ['DELETE', `/api/payments/${w.pay.id}`], ['DELETE', `/api/charges/${w.chg.id}`],
    ['GET', `/api/students/${w.sa.id}/reminder`], ['GET', `/api/students/${w.sa.id}/qr.svg`], ['GET', `/api/students/${w.sa.id}/qr.png`],
    ['POST', `/api/students/${w.sa.id}/link`, {}], ['POST', `/api/students/${w.sa.id}/link`, { regenerate: true }], ['DELETE', `/api/students/${w.sa.id}/link`],
    ['GET', `/api/lessons/${w.one.id}`], ['GET', `/api/lessons/${w.slotLesson.id}`],
    ['POST', `/api/lessons/${w.one.id}/mark`, { status: 'da_day' }], ['POST', `/api/lessons/${w.slotLesson.id}/mark`, { status: 'gs_huy' }],
    ['POST', `/api/lessons/${w.one.id}/log`, { topic: 'HACK' }], ['POST', `/api/lessons/${w.slotLesson.id}/move`, { day: day(9), startMin: 700, durationMin: 60 }],
    ['DELETE', `/api/lessons/${w.mk.id}`],
    ['POST', '/api/lessons', { studentId: w.sa.id, day: day(5), startMin: 600, durationMin: 60 }],
    ['POST', '/api/lessons', { makeupOf: w.one.id, day: day(5), startMin: 600, durationMin: 60 }],
    ['POST', `/api/devices/${w.dev.id}/revoke`],
  ];
  for (const [m, p, body] of tries) {
    const r = await b.req(m, p, body);
    assert.equal(r.status, 404, `${m} ${p} -> ${r.status} ${r.buf.toString().slice(0, 120)}`);
    // cùng phản hồi với id bịa (không phân biệt "không phải của bạn" và "không tồn tại")
    const ghost = p.replaceAll(w.sa.id, GHOST).replaceAll(w.slot.id, GHOST).replaceAll(w.pay.id, GHOST).replaceAll(w.chg.id, GHOST).replaceAll(w.one.id, GHOST).replaceAll(w.slotLesson.id, GHOST).replaceAll(w.mk.id, GHOST).replaceAll(w.dev.id, GHOST);
    const body2 = body && JSON.parse(JSON.stringify(body).replaceAll(w.sa.id, GHOST).replaceAll(w.one.id, GHOST));
    const g = await b.req(m, ghost, body2);
    assert.equal(g.status, 404, `ghost ${m} ${ghost}`);
    assert.equal(g.json?.error?.code, r.json?.error?.code);
  }
  // A còn nguyên vẹn
  const d = await ok(w.a.get(`/api/students/${w.sa.id}`));
  assert.equal(d.student.name, 'HS của A'); assert.equal(d.payments.length, 1); assert.equal(d.charges.length, 1);
  assert.equal(d.student.active, true); assert.ok(d.link);
  assert.equal((await ok(w.a.get('/api/devices'))).devices.length, 1);
  assert.equal((await ok(w.a.get(`/api/lessons/${w.one.id}`))).lesson.topic, '');
});

test('danh sách của B không chứa dữ liệu của A (học sinh, tuần, hôm nay, báo cáo, xuất dữ liệu)', async () => {
  const w = await world();
  const txt = async (p) => (await w.b.get(p)).buf.toString();
  for (const p of ['/api/students', `/api/week?from=${day(-5)}&days=30`, '/api/today', '/api/reports/month', '/api/export', '/api/devices', '/api/me', '/api/profile']) {
    const t = await txt(p);
    assert.ok(!t.includes('HS của A') && !t.includes('ghi chú của A') && !t.includes('Gia sư A') && !t.includes(w.sa.id) && !t.includes(w.link.token), p);
  }
  assert.equal((await ok(w.b.get('/api/students'))).students.length, 1);
});

test('B không dùng được id học sinh của A để tạo buổi/lịch/khoản thu, kể cả khi trộn id', async () => {
  const w = await world();
  // B có học sinh của mình nhưng makeupOf trỏ vào buổi của A
  const r = await w.b.post('/api/lessons', { studentId: w.sb.id, makeupOf: w.one.id, day: day(7), startMin: 600, durationMin: 60 });
  assert.equal(r.status, 404);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM lessons WHERE student_id=$1 AND tutor_id <> (SELECT tutor_id FROM students WHERE id=$1)', [w.sa.id]))[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE student_id=$1', [w.sa.id]))[0].n, 1);
});

test('mọi dòng dữ liệu đều thuộc đúng gia sư (không có chéo tutor_id giữa học sinh và buổi/khoản thu)', async () => {
  await world();
  for (const t of ['lessons', 'slots', 'charges', 'payments', 'share_links']) {
    const bad = (await db.query(`SELECT count(*)::int AS n FROM ${t} x JOIN students s ON s.id = x.student_id WHERE s.tutor_id <> x.tutor_id`))[0].n;
    assert.equal(bad, 0, t);
  }
});

test('chưa đăng nhập: mọi API riêng trả 401 (không phân biệt id có tồn tại hay không)', async () => {
  const w = await world();
  const anon = new Client();
  for (const [m, p, body] of [
    ['GET', `/api/students/${w.sa.id}`], ['POST', `/api/students/${w.sa.id}/payments`, { amount: 1 }], ['DELETE', `/api/payments/${w.pay.id}`],
    ['POST', `/api/lessons/${w.one.id}/mark`, { status: 'da_day' }], ['GET', `/api/students/${w.sa.id}/qr.png`], ['POST', `/api/students/${w.sa.id}/link`, {}],
    ['GET', `/api/students/${GHOST}`], ['DELETE', `/api/slots/${w.slot.id}`],
  ]) {
    const r = await anon.req(m, p, body);
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test('id không phải UUID: 404 gọn, không lỗi 500', async () => {
  const a = await newTutor();
  for (const p of ['/api/students/abc', '/api/students/1', "/api/students/'; DROP TABLE students;--", '/api/lessons/%00', '/api/students/' + 'f'.repeat(36)]) {
    const r = await a.get(p);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await a.del('/api/payments/xyz')).status, 404);
  assert.equal((await a.post('/api/lessons/xyz/mark', { status: 'da_day' })).status, 404);
});

test('gia sư xóa học sinh: lịch, buổi, khoản thu, link đi theo (xóa cứng), dữ liệu gia sư khác không bị đụng', async () => {
  const w = await world();
  await ok(w.a.del(`/api/students/${w.sa.id}`));
  for (const t of ['lessons', 'slots', 'charges', 'payments', 'share_links']) assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE student_id=$1`, [w.sa.id]))[0].n, 0, t);
  assert.equal((await new Client().get('/api/r/' + w.link.token)).status, 404);
  assert.equal((await ok(w.b.get('/api/students'))).students.length, 1);
});
