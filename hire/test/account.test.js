// Tích hợp 9id: quyền nhà tuyển dụng qua tài khoản song song phiên ẩn danh, GET /api/account, POST /api/account/claim. 9id được giả bằng máy khách bơm vào.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, db, config, makeEmployer, postJob } from './helper.js';
import { setIdClient, flushCaches } from '../src/nine-session.js';

const people = {};
let down = false, seq = 0;
function mkUser(name) {
  seq++;
  const token = ('h' + seq).padEnd(43, String.fromCharCode(97 + (seq % 20)));
  const userId = `00000000-0000-4000-8000-${String(seq + 700).padStart(12, '0')}`;
  people[token] = { userId, displayName: name };
  return { token, userId, name };
}
const verify = async (t) => { if (down) throw new Error('ECONNREFUSED'); return people[t] || null; };
before(async () => { await boot(); setIdClient({ verify }); });
after(async () => { setIdClient(null); await shutdown(); });

const device = (user) => { const c = new Client('máy'); if (user) c.nine = user.token; return c; };
const emp = (id) => db.query('SELECT id, user_id FROM employers WHERE id=$1', [id]).then((r) => r[0]);

test('tắt tích hợp: GET báo enabled:false, claim 404, nhà tuyển dụng ẩn danh chạy như cũ', async () => {
  setIdClient(null);
  try {
    const e = await makeEmployer('Quán N');
    const g = await ok(e.get('/api/account'));
    assert.deepEqual(g, { enabled: false, loggedIn: false, idDown: false, user: null, loginPath: config.nineIdPublicPath, claimable: null, conflict: null });
    assert.equal((await e.post('/api/account/claim')).status, 404);
    await ok(e.get('/api/employer/jobs'));
  } finally { setIdClient({ verify }); }
});

test('chưa đăng nhập: claim 401 kèm đường dẫn đăng nhập', async () => {
  const e = await makeEmployer('Quán A');
  const g = await ok(e.get('/api/account'));
  assert.equal(g.enabled, true); assert.equal(g.loggedIn, false); assert.equal(g.claimable, null);
  const r = await e.post('/api/account/claim');
  assert.equal(r.status, 401); assert.equal(r.json.error.details.login, config.nineIdPublicPath);
});

test('đã đăng nhập: claimable là nhà tuyển dụng của PHIÊN NÀY; claim gắn user_id, idempotent, máy mới thấy tin và đăng tin được', async () => {
  const lan = mkUser('Lan');
  const e = await makeEmployer('Quán Lan');
  const other = await makeEmployer('Quán khác');
  const job = await postJob(e);
  e.nine = lan.token;
  const g = await ok(e.get('/api/account'));
  assert.equal(g.loggedIn, true); assert.deepEqual(Object.keys(g.user), ['displayName']);
  assert.deepEqual(g.claimable, { employerName: 'Quán Lan' });
  assert.ok(!JSON.stringify(g).includes('Quán khác'));
  const r1 = await ok(e.post('/api/account/claim'));
  assert.deepEqual(r1.claimed, { employerName: 'Quán Lan' });
  assert.equal((await emp(e.employerId)).user_id, lan.userId);
  assert.equal((await emp(other.employerId)).user_id, null);
  assert.deepEqual(await ok(e.post('/api/account/claim')), { claimed: null, skipped: null });
  const fresh = device(lan);
  const jobs = await ok(fresh.get('/api/employer/jobs'));
  assert.deepEqual(jobs.jobs.map((j) => j.id), [job.id]);
  await postJob(fresh);                                   // đăng thêm từ máy mới
  assert.equal((await ok(fresh.get('/api/employer/me'))).employer.id, e.employerId);
});

test('nhà tuyển dụng tạo lúc đã đăng nhập: gắn user_id, không có phiên ẩn danh; đăng xuất 9id thì mất quyền; không tạo được cái thứ hai', async () => {
  const mai = mkUser('Mai');
  const c = device(mai);
  const r = await ok(c.post('/api/employer', { name: 'Quán Mai' }));
  assert.equal((await emp(r.employer.id)).user_id, mai.userId);
  assert.equal((await db.query('SELECT 1 FROM phien WHERE employer_id=$1', [r.employer.id])).length, 0);
  await ok(c.get('/api/employer/jobs'));
  const anon = new Client('anon'); anon.cookie = c.cookie;
  assert.equal((await anon.get('/api/employer/jobs')).status, 401);
  assert.equal((await c.post('/api/employer', { name: 'Quán Mai hai' })).status, 409);
  assert.equal((await device(mai).post('/api/employer', { name: 'Quán Mai ba' })).status, 409);
});

test('xung đột: tài khoản đã có nhà tuyển dụng thì nhà tuyển dụng ẩn danh của máy bị bỏ qua và báo, không bị gắn', async () => {
  const x = mkUser('X');
  await ok(device(x).post('/api/employer', { name: 'Quán X' }));
  const anon = await makeEmployer('Quán ẩn danh X');
  anon.nine = x.token;
  const g = await ok(anon.get('/api/account'));
  assert.equal(g.claimable, null); assert.deepEqual(g.conflict, { employerName: 'Quán ẩn danh X' });
  const r = await ok(anon.post('/api/account/claim'));
  assert.equal(r.claimed, null); assert.equal(r.skipped.reason, 'da_co_nha_tuyen_dung');
  assert.equal((await emp(anon.employerId)).user_id, null);
});

test('không bao giờ chiếm nhà tuyển dụng đã có user_id khác', async () => {
  const p = mkUser('P'), q = mkUser('Q');
  const e = await makeEmployer('Quán P');
  await db.query('UPDATE employers SET user_id=$2 WHERE id=$1', [e.employerId, p.userId]);
  e.nine = q.token;
  assert.equal((await ok(e.get('/api/account'))).claimable, null);
  assert.deepEqual(await ok(e.post('/api/account/claim')), { claimed: null, skipped: null });
  assert.equal((await emp(e.employerId)).user_id, p.userId);
});

test('khôi phục bằng mã khi đã có nhà tuyển dụng của tài khoản: 409; chưa có thì dùng được như cũ', async () => {
  const s = mkUser('S');
  await ok(device(s).post('/api/employer', { name: 'Quán S' }));
  const other = await makeEmployer('Quán cũ');
  assert.equal((await device(s).post('/api/employer/recover', { code: other.recoveryCode })).status, 409);
  const free = mkUser('Free');
  const d = device(free);
  await ok(d.post('/api/employer/recover', { code: other.recoveryCode }));
  assert.equal((await ok(d.get('/api/employer/me'))).employer.id, other.employerId);
});

test('claim đồng thời và đua với tạo nhà tuyển dụng: không 5xx, chỉ một nhà tuyển dụng gắn tài khoản', async () => {
  const z = mkUser('Z');
  const e = await makeEmployer('Quán Z');
  e.nine = z.token;
  const rs = await Promise.all([e.post('/api/account/claim'), e.post('/api/account/claim'), device(z).post('/api/employer', { name: 'Quán Z mới' })]);
  for (const r of rs) assert.ok(r.status < 500, JSON.stringify(r.json));
  assert.equal((await db.query('SELECT 1 FROM employers WHERE user_id=$1', [z.userId])).length, 1);
});

test('9id lỗi: GET báo idDown, claim 503, đăng nhập mà tạo/khôi phục 503, nhà tuyển dụng ẩn danh vẫn dùng được', async () => {
  const w = mkUser('W');
  const e = await makeEmployer('Quán W');
  const other = await makeEmployer('Quán V');
  e.nine = w.token;
  down = true; flushCaches();
  try {
    const g = await ok(e.get('/api/account'));
    assert.equal(g.idDown, true); assert.equal(g.loggedIn, false);
    assert.equal((await e.post('/api/account/claim')).status, 503);
    assert.equal((await device(w).post('/api/employer', { name: 'Quán W2' })).status, 503);
    assert.equal((await device(w).post('/api/employer/recover', { code: other.recoveryCode })).status, 503);
    await ok(e.get('/api/employer/jobs'));
  } finally { down = false; flushCaches(); }
  assert.equal((await emp(e.employerId)).user_id, null);
});

test('chủ tin gửi hồ sơ vào tin của chính mình qua tài khoản: bị từ chối own_job', async () => {
  const o = mkUser('O');
  const c = device(o);
  await ok(c.post('/api/employer', { name: 'Quán O' }));
  const job = await postJob(c);
  const r = await c.post(`/api/jobs/${job.id}/apply`, { name: 'Tôi', phone: '0911222333', message: '' });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, 'own_job');
});

test('tên hiển thị chứa HTML được trả nguyên văn (giao diện chỉ dùng textContent)', async () => {
  const h = mkUser('<img src=x onerror=alert(1)>');
  assert.equal((await ok(device(h).get('/api/account'))).user.displayName, '<img src=x onerror=alert(1)>');
});

test('máy có hai danh tính: xóa tài khoản chỉ xóa nhà tuyển dụng của tài khoản, giữ cookie để còn vào nhà tuyển dụng ẩn danh', async () => {
  const d = mkUser('D');
  await ok(device(d).post('/api/employer', { name: 'Quán D' }));
  const anonE = await makeEmployer('Quán ẩn danh D');
  anonE.nine = d.token;
  assert.equal((await ok(anonE.get('/api/employer/me'))).employer.name, 'Quán D', 'ưu tiên nhà tuyển dụng của tài khoản');
  const r = await anonE.del('/api/employer');
  assert.equal(r.status, 200);
  assert.ok(!r.setCookie.some((c) => c.startsWith('hsid=;') || /hsid=;/.test(c)), 'không xóa cookie phiên ẩn danh');
  anonE.nine = '';
  assert.equal((await ok(anonE.get('/api/employer/me'))).employer.id, anonE.employerId, 'nhà tuyển dụng ẩn danh còn nguyên');
});

test('người dùng khác không động được vào tin của tài khoản; cookie nine_sid giả bị coi là chưa đăng nhập', async () => {
  const a = mkUser('A1'), b = mkUser('B1');
  const ca = device(a);
  await ok(ca.post('/api/employer', { name: 'Quán A1' }));
  const job = await postJob(ca);
  const cb = device(b);
  await ok(cb.post('/api/employer', { name: 'Quán B1' }));
  assert.equal((await cb.get(`/api/employer/jobs/${job.id}`)).status, 404);
  assert.equal((await cb.post(`/api/employer/jobs/${job.id}/close`)).status, 404);
  const fake = new Client('giả'); fake.nine = 'z'.repeat(43);
  assert.equal((await fake.get('/api/employer/jobs')).status, 401);
});
