// Tích hợp 9id: quyền gia sư qua tài khoản song song phiên ẩn danh, GET /api/account, POST /api/account/claim. 9id được giả bằng máy khách bơm vào.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, db, config, newTutor, addStudent, resetHourly } from './helper.js';
import { setIdClient, flushCaches } from '../src/nine-session.js';

const people = {};
let down = false, seq = 0;
function mkUser(name) {
  seq++;
  const token = ('t' + seq).padEnd(43, String.fromCharCode(97 + (seq % 20)));
  const userId = `00000000-0000-4000-8000-${String(seq + 900).padStart(12, '0')}`;
  people[token] = { userId, displayName: name };
  return { token, userId, name };
}
const verify = async (t) => { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; };
before(async () => { await boot(); setIdClient({ verify }); });
after(async () => { setIdClient(null); await shutdown(); });

const device = (user) => { const c = new Client('máy'); if (user) c.nine = user.token; return c; };
const tutorRow = async (name) => (await db.query('SELECT id, user_id FROM tutors WHERE name=$1 ORDER BY seq DESC LIMIT 1', [name]))[0];
const start = (c, name) => c.post('/api/start', { name, status: 'sinh_vien' });

test('tắt tích hợp: GET báo enabled:false, claim 404, gia sư ẩn danh chạy như cũ', async () => {
  setIdClient(null);
  try {
    const t = await newTutor('Cô N');
    const g = await ok(t.get('/api/account'));
    assert.deepEqual(g, { enabled: false, loggedIn: false, idDown: false, user: null, loginPath: config.nineIdPublicPath, claimable: null, conflict: null, linked: false });
    assert.equal((await t.post('/api/account/claim')).status, 404);
    await ok(t.get('/api/students'));
  } finally { setIdClient({ verify }); }
});

test('chưa đăng nhập: claim 401 kèm đường dẫn đăng nhập', async () => {
  const t = await newTutor('Cô A');
  const g = await ok(t.get('/api/account'));
  assert.equal(g.enabled, true); assert.equal(g.loggedIn, false); assert.equal(g.claimable, null);
  const r = await t.post('/api/account/claim');
  assert.equal(r.status, 401); assert.equal(r.json.error.details.login, config.nineIdPublicPath);
});

test('đã đăng nhập: claimable là gia sư của PHIÊN NÀY; claim gắn user_id, idempotent, máy mới thấy học sinh', async () => {
  const lan = mkUser('Lan');
  const t = await newTutor('Cô Lan');
  const other = await newTutor('Cô khác');
  const st = await addStudent(t, { name: 'Bé Na' });
  t.nine = lan.token;
  const g = await ok(t.get('/api/account'));
  assert.equal(g.loggedIn, true); assert.deepEqual(Object.keys(g.user), ['displayName']);
  assert.deepEqual(g.claimable, { tutorName: 'Cô Lan', students: 1 });
  assert.ok(!JSON.stringify(g).includes('Cô khác'));
  assert.deepEqual((await ok(t.post('/api/account/claim'))).claimed, { tutorName: 'Cô Lan', students: 1 });
  assert.equal((await tutorRow('Cô Lan')).user_id, lan.userId);
  assert.equal((await tutorRow('Cô khác')).user_id, null);
  assert.deepEqual(await ok(t.post('/api/account/claim')), { claimed: null, skipped: null });
  const fresh = device(lan);
  assert.deepEqual((await ok(fresh.get('/api/students'))).students.map((s) => s.id), [st.id]);
  assert.equal((await ok(fresh.get('/api/me'))).me.name, 'Cô Lan');
  await addStudent(fresh, { name: 'Bé Bo' });                  // ghi từ máy mới
  assert.ok(other);
});

test('gia sư tạo lúc đã đăng nhập: gắn user_id, không có phiên; đăng xuất 9id thì mất quyền; không tạo được cái thứ hai', async () => {
  const mai = mkUser('Mai');
  const c = device(mai);
  const r = await ok(start(c, 'Cô Mai'));
  assert.ok(r.recoveryCode);
  const row = await tutorRow('Cô Mai');
  assert.equal(row.user_id, mai.userId);
  assert.equal((await db.query('SELECT 1 FROM sessions WHERE tutor_id=$1', [row.id])).length, 0);
  await ok(c.get('/api/students'));
  assert.equal((await new Client('anon').get('/api/me')).status, 401, 'đăng xuất 9id thì không vào được');
  assert.equal((await start(device(mai), 'Cô Mai hai')).status, 409);
});

test('xung đột: tài khoản đã có gia sư thì gia sư ẩn danh của máy được báo và giữ riêng, không bị gắn', async () => {
  const x = mkUser('X');
  await ok(start(device(x), 'Cô X'));
  const anon = await newTutor('Cô ẩn danh X');
  anon.nine = x.token;
  const g = await ok(anon.get('/api/account'));
  assert.equal(g.claimable, null); assert.equal(g.conflict.tutorName, 'Cô ẩn danh X');
  const r = await ok(anon.post('/api/account/claim'));
  assert.equal(r.claimed, null); assert.equal(r.skipped.reason, 'da_co_gia_su');
  assert.equal((await tutorRow('Cô ẩn danh X')).user_id, null);
});

test('không bao giờ chiếm gia sư đã có user_id khác', async () => {
  const p = mkUser('P'), q = mkUser('Q');
  const t = await newTutor('Cô P');
  await db.query('UPDATE tutors SET user_id=$2 WHERE name=$1', ['Cô P', p.userId]);
  t.nine = q.token;
  assert.equal((await ok(t.get('/api/account'))).claimable, null);
  assert.deepEqual(await ok(t.post('/api/account/claim')), { claimed: null, skipped: null });
  assert.equal((await tutorRow('Cô P')).user_id, p.userId);
});

test('khôi phục bằng mã hay ghép thiết bị vào tài khoản đã có gia sư khác: 409; chưa có thì dùng như cũ', async () => {
  resetHourly();
  const s = mkUser('S');
  await ok(start(device(s), 'Cô S'));
  const other = await newTutor('Cô cũ');
  assert.equal((await device(s).post('/api/recover', { code: other.recovery })).status, 409);
  const pair = await ok(other.post('/api/devices/pair'));
  assert.equal((await device(s).post('/api/devices/redeem', { code: pair.code })).status, 409);
  const free = mkUser('Free');
  const d = device(free);
  await ok(d.post('/api/recover', { code: other.recovery }));
  assert.equal((await ok(d.get('/api/me'))).me.name, 'Cô cũ');
});

test('claim đồng thời và đua với tạo gia sư: không 5xx, chỉ một gia sư gắn tài khoản', async () => {
  const z = mkUser('Z');
  const t = await newTutor('Cô Z');
  t.nine = z.token;
  const rs = await Promise.all([t.post('/api/account/claim'), t.post('/api/account/claim'), start(device(z), 'Cô Z mới')]);
  for (const r of rs) assert.ok(r.status < 500, JSON.stringify(r.json));
  assert.equal((await db.query('SELECT 1 FROM tutors WHERE user_id=$1', [z.userId])).length, 1);
});

test('9id lỗi: GET báo idDown, claim 503, đăng nhập mà tạo/khôi phục/ghép 503, gia sư ẩn danh vẫn dùng được', async () => {
  resetHourly();
  const w = mkUser('W');
  const t = await newTutor('Cô W');
  const other = await newTutor('Cô V');
  t.nine = w.token;
  down = true; flushCaches();
  try {
    const g = await ok(t.get('/api/account'));
    assert.equal(g.idDown, true); assert.equal(g.loggedIn, false);
    assert.equal((await t.post('/api/account/claim')).status, 503);
    assert.equal((await start(device(w), 'Cô W2')).status, 503);
    assert.equal((await device(w).post('/api/recover', { code: other.recovery })).status, 503);
    await ok(t.get('/api/students'));
  } finally { down = false; flushCaches(); }
  assert.equal((await tutorRow('Cô W')).user_id, null);
});

test('máy có hai danh tính: xóa dữ liệu chỉ xóa gia sư của tài khoản, giữ cookie phiên ẩn danh', async () => {
  const d = mkUser('D');
  await ok(start(device(d), 'Cô D'));
  const anonT = await newTutor('Cô ẩn danh D');
  anonT.nine = d.token;
  assert.equal((await ok(anonT.get('/api/me'))).me.name, 'Cô D', 'ưu tiên gia sư của tài khoản');
  const r = await anonT.post('/api/me/delete', { confirm: 'XOA' });
  assert.equal(r.status, 200);
  assert.ok(!r.setCookie.some((c) => /tsid=;/.test(c)), 'không xóa cookie phiên ẩn danh');
  anonT.nine = '';
  assert.equal((await ok(anonT.get('/api/me'))).me.name, 'Cô ẩn danh D');
});

test('đăng xuất các máy khác khi quyền đến từ tài khoản (không có phiên): không lỗi', async () => {
  const k = mkUser('K');
  const c = device(k);
  await ok(start(c, 'Cô K'));
  const r = await ok(c.post('/api/logout-others'));
  assert.equal(r.removed, 0);
});

test('người dùng khác không động được vào học sinh của tài khoản; cookie nine_sid giả bị coi là chưa đăng nhập', async () => {
  const a = mkUser('A1'), b = mkUser('B1');
  const ca = device(a);
  await ok(start(ca, 'Cô A1'));
  const st = await addStudent(ca, { name: 'Của A1' });
  const cb = device(b);
  await ok(start(cb, 'Cô B1'));
  assert.deepEqual((await ok(cb.get('/api/students'))).students, []);
  assert.equal((await cb.get(`/api/students/${st.id}`)).status, 404);
  const fake = new Client('giả'); fake.nine = 'z'.repeat(43);
  assert.equal((await fake.get('/api/students')).status, 401);
});

test('tên hiển thị chứa HTML được trả nguyên văn (giao diện chỉ dùng textContent)', async () => {
  const h = mkUser('<img src=x onerror=alert(1)>');
  assert.equal((await ok(device(h).get('/api/account'))).user.displayName, '<img src=x onerror=alert(1)>');
});

test('linked chỉ đúng khi gia sư đang dùng là của tài khoản; sổ ẩn danh của máy thì không', async () => {
  const u = mkUser('U');
  const anon = await newTutor('Cô sổ ẩn danh');
  anon.nine = u.token;
  assert.equal((await ok(anon.get('/api/account'))).linked, false);
  await ok(anon.post('/api/account/claim'));
  assert.equal((await ok(anon.get('/api/account'))).linked, true);
});

test('khôi phục hoặc ghép bằng mã của chính gia sư tài khoản: không để lại phiên (cookie) trên máy', async () => {
  resetHourly();
  const m = mkUser('M');
  const own = device(m);
  await ok(start(own, 'Cô M'));
  const code = (await ok(own.post('/api/me/recovery'))).recoveryCode;
  const d1 = device(m);
  await ok(d1.post('/api/recover', { code }));
  assert.equal(d1.cookie, '', 'không nhận cookie tsid');
  const pair = await ok(own.post('/api/devices/pair'));
  const d2 = device(m);
  await ok(d2.post('/api/devices/redeem', { code: pair.code }));
  assert.equal(d2.cookie, '');
  assert.equal((await new Client('anon').get('/api/me')).status, 401);
});

test('ghép thiết bị bị 409 vì tài khoản đã có sổ khác: mã ghép không bị đốt, dùng lại được ở máy khác', async () => {
  resetHourly();
  const s = mkUser('S2');
  await ok(start(device(s), 'Cô S2'));
  const other = await newTutor('Cô nguồn');
  const pair = await ok(other.post('/api/devices/pair'));
  assert.equal((await device(s).post('/api/devices/redeem', { code: pair.code })).status, 409);
  const fresh = new Client('máy lạ');
  await ok(fresh.post('/api/devices/redeem', { code: pair.code }));
});
