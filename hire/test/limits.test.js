// Giới hạn tốc độ và hạn mức nghiệp vụ, kể cả khi nhiều yêu cầu chạy song song (khóa hàng, hạn mức nguyên tử).
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, makeEmployer, postJob, jobBody, config, freshIp } from './helper.js';

before(boot);
after(shutdown);

const saved = { ...config.limits };
const savedTop = { f: config.routeLimitFactor, s: config.sessionLimitPerMin };
beforeEach(() => { Object.assign(config.limits, saved); });
afterEach(() => { Object.assign(config.limits, saved); config.routeLimitFactor = savedTop.f; config.sessionLimitPerMin = savedTop.s; });

const apply = (c, id, phone, over = {}) => c.post(`/api/jobs/${id}/apply`, { name: 'Ứng viên', phone, ...over });

test('tài khoản mới đăng tối đa 2 tin/ngày; tài khoản cũ 3 tin/ngày', async () => {
  config.limits.jobsPerSessionDay = 3; config.limits.jobsPerNewSessionDay = 2;
  const e = await makeEmployer();
  assert.equal((await e.post('/api/employer/jobs', jobBody())).status, 200);
  assert.equal((await e.post('/api/employer/jobs', jobBody())).status, 200);
  const r = await e.post('/api/employer/jobs', jobBody());
  assert.equal(r.status, 429); assert.match(r.json.error.message, /mới/);
  // tin bị từ chối vì bộ lọc không tốn hạn mức
  const e2 = await makeEmployer();
  for (let i = 0; i < 4; i++) assert.equal((await e2.post('/api/employer/jobs', jobBody({ description: 'Cần đặt cọc 300k trước khi nhận việc làm nhé.' }))).status, 400);
  assert.equal((await e2.post('/api/employer/jobs', jobBody())).status, 200);
  // làm già tài khoản 2 ngày: được 3 tin
  const { query } = await import('../src/db.js');
  const e3 = await makeEmployer();
  await query("UPDATE employers SET created_at = now() - interval '2 days' WHERE id=$1", [e3.employerId]);
  for (let i = 0; i < 3; i++) assert.equal((await e3.post('/api/employer/jobs', jobBody())).status, 200);
  assert.equal((await e3.post('/api/employer/jobs', jobBody())).status, 429);
});

test('giới hạn tin mỗi IP mỗi ngày: nhiều tài khoản cùng IP vẫn bị chặn', async () => {
  config.limits.jobsPerIpDay = 3; config.limits.jobsPerSessionDay = 50; config.limits.jobsPerNewSessionDay = 50;
  const ip = freshIp();
  const mk = async () => { const c = new Client('x', ip); await ok(c.post('/api/employer', { name: 'Quán chung IP' })); return c; };
  const [a, b] = [await mk(), await mk()];
  assert.equal((await a.post('/api/employer/jobs', jobBody())).status, 200);
  assert.equal((await b.post('/api/employer/jobs', jobBody())).status, 200);
  assert.equal((await a.post('/api/employer/jobs', jobBody())).status, 200);
  const r = await b.post('/api/employer/jobs', jobBody());
  assert.equal(r.status, 429);
  // IP khác thì không sao
  const other = await makeEmployer();
  assert.equal((await other.post('/api/employer/jobs', jobBody())).status, 200);
});

test('song song: 12 yêu cầu đăng tin cùng lúc không vượt hạn mức ngày (3) và không vượt tin đang mở', async () => {
  config.limits.jobsPerSessionDay = 3; config.limits.jobsPerNewSessionDay = 3;
  const e = await makeEmployer();
  const rs = await Promise.all(Array.from({ length: 12 }, () => e.post('/api/employer/jobs', jobBody())));
  assert.equal(rs.filter((r) => r.status === 200).length, 3);
  assert.equal(rs.filter((r) => r.status === 429).length, 9);
  assert.equal((await ok(e.get('/api/employer/jobs'))).jobs.length, 3);
  // trần tin đang mở
  config.limits.jobsPerSessionDay = 50; config.limits.jobsPerNewSessionDay = 50; config.limits.openJobsPerEmployer = 4;
  const e2 = await makeEmployer();
  const rs2 = await Promise.all(Array.from({ length: 10 }, () => e2.post('/api/employer/jobs', jobBody())));
  assert.equal(rs2.filter((r) => r.status === 200).length, 4);
  assert.equal(rs2.filter((r) => r.status === 409).length, 6);
});

test('song song: gửi quan tâm trùng chỉ thành công một lần; mỗi tin tối đa N hồ sơ chưa xử lý', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  const s = new Client();
  const rs = await Promise.all(Array.from({ length: 6 }, () => apply(s, job.id, '0933000111')));
  assert.equal(rs.filter((r) => r.status === 200).length, 6, 'cùng số gửi lại: cập nhật, không lỗi');
  assert.equal((await ok(e.get(`/api/employer/jobs/${job.id}/applications`))).items.length, 1, 'chỉ một hồ sơ');
  const s1 = new Client();
  await ok(apply(s1, job.id, '0933000222'));
  const dupSession = await Promise.all(Array.from({ length: 4 }, () => apply(s1, job.id, '0933000333')));
  assert.equal(dupSession.filter((r) => r.status === 200).length, 0, 'cùng phiên không gửi hai số cho một tin');
  assert.ok(dupSession.every((r) => r.status === 409));

  config.limits.pendingAppsPerJob = 3;
  const job2 = await postJob(e);
  const many = await Promise.all(Array.from({ length: 8 }, (_, i) => apply(new Client(), job2.id, '09440000' + String(10 + i))));
  assert.equal(many.filter((r) => r.status === 200).length, 3);
  assert.ok(many.filter((r) => r.status === 409).every((r) => r.json.error.code === 'full'));
  // xử lý một hồ sơ thì mở chỗ trống
  const first = (await ok(e.get(`/api/employer/jobs/${job2.id}/applications`))).items[0];
  await ok(e.post(`/api/employer/applications/${first.id}/status`, { status: 'loai' }));
  assert.equal((await apply(new Client(), job2.id, '0955000111')).status, 200);
});

test('giới hạn gửi quan tâm theo phiên và theo IP mỗi ngày', async () => {
  config.limits.applyPerSessionDay = 3; config.limits.applyPerIpDay = 5;
  const e = await makeEmployer();
  const jobs = [];
  for (let i = 0; i < 6; i++) jobs.push(await postJob(e));
  const s = new Client();
  for (let i = 0; i < 3; i++) assert.equal((await apply(s, jobs[i].id, '0966000111')).status, 200);
  const r = await apply(s, jobs[3].id, '0966000111');
  assert.equal(r.status, 429);
  // đổi cookie nhưng cùng IP: bị IP chặn sau 5
  let okCount = 3;
  for (let i = 0; i < 6; i++) {
    const t = new Client('x', s.ip);
    const rr = await apply(t, jobs[i % 6].id, '09770001' + String(10 + i));
    if (rr.status === 200) okCount++;
  }
  assert.equal(okCount, 5);
});

test('giới hạn xem liên hệ (chống cào số điện thoại) theo phiên và IP', async () => {
  config.limits.revealPerSessionDay = 3; config.limits.revealPerIpDay = 100;
  const e = await makeEmployer();
  const jobs = [];
  for (let i = 0; i < 5; i++) jobs.push(await postJob(e));
  const s = new Client();
  for (let i = 0; i < 3; i++) assert.equal((await s.post(`/api/jobs/${jobs[i].id}/contact`, { ack: true })).status, 200);
  assert.equal((await s.post(`/api/jobs/${jobs[3].id}/contact`, { ack: true })).status, 429);
  config.limits.revealPerIpDay = 2;
  const ip = freshIp();
  const r = [];
  for (let i = 0; i < 4; i++) r.push((await new Client('x', ip).post(`/api/jobs/${jobs[i].id}/contact`, { ack: true })).status);
  assert.deepEqual(r, [200, 200, 429, 429]);
});

test('dò mã khôi phục: mỗi lần thử đều tính hạn mức, kể cả khi mã đúng sau đó', async () => {
  config.limits.recoverPerIpHour = 3;
  const e = await makeEmployer();
  const ip = freshIp();
  const c = () => new Client('dò', ip);
  assert.equal((await c().post('/api/employer/recover', { code: 'ABCD-EFGH-JKLM-NPQR' })).status, 404);
  assert.equal((await c().post('/api/employer/recover', { code: 'xxx' })).status, 404);
  assert.equal((await c().post('/api/employer/recover', { code: 'ABCD-EFGH-JKLM-NPQS' })).status, 404);
  const r = await c().post('/api/employer/recover', { code: e.recoveryCode });
  assert.equal(r.status, 429, 'mã đúng nhưng đã quá số lần thử của IP');
  // IP khác vào được
  assert.equal((await new Client().post('/api/employer/recover', { code: e.recoveryCode })).status, 200);
});

test('tối đa số tài khoản nhà tuyển dụng mới mỗi IP mỗi ngày', async () => {
  config.limits.employersPerIpDay = 3;
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await new Client('x', ip).post('/api/employer', { name: 'Quán ' + i })).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('giới hạn tốc độ theo đường dẫn (bộ nhớ) và theo phiên', async () => {
  config.routeLimitFactor = 1;
  const s = new Client();
  const codes = [];
  for (let i = 0; i < 125; i++) codes.push((await s.get('/api/jobs/new?since=0')).status);
  assert.ok(codes.includes(429), 'phải bị 429 sau 120 lần/phút: ' + codes.filter((x) => x === 429).length);
  config.routeLimitFactor = 1000;
  // theo phiên (ghi): phiên đã có cookie
  config.sessionLimitPerMin = 5; config.routeLimitFactor = 1;
  const t = new Client();
  await ok(t.post('/api/employer', { name: 'Quán giới hạn phiên' }));
  const res = [];
  for (let i = 0; i < 10; i++) res.push((await t.post('/api/employer/jobs', jobBody({ title: 'x' }))).status);
  assert.ok(res.includes(429));
});

test('không giả IP bằng header X-Forwarded-For: lấy phần tử cuối (do proxy ghi)', async () => {
  config.limits.employersPerIpDay = 2;
  const real = freshIp();
  const mk = (spoof) => new Client('x', `${spoof}, ${real}`);
  const r = [];
  for (let i = 0; i < 4; i++) r.push((await mk('1.1.1.' + i).post('/api/employer', { name: 'Giả IP ' + i })).status);
  assert.deepEqual(r, [200, 200, 429, 429]);
});
