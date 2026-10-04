// Phân quyền: nhà tuyển dụng với nhau, người xem với hộp thư, cổng cảnh báo trước khi lộ liên hệ.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, makeEmployer, postJob, jobBody, db } from './helper.js';

before(boot);
after(shutdown);

const apply = (c, id, over = {}) => c.post(`/api/jobs/${id}/apply`, { name: 'Nguyễn Văn An', phone: '0987 654 321', message: 'Em rảnh buổi sáng', startNow: true, ...over });

test('chưa là nhà tuyển dụng thì mọi API nhà tuyển dụng trả 401', async () => {
  const anon = new Client();
  for (const [m, p, b] of [['GET', '/api/employer/jobs'], ['POST', '/api/employer/jobs', jobBody()], ['GET', '/api/employer/jobs/' + '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12)],
    ['POST', '/api/employer/recovery-code', {}], ['DELETE', '/api/employer', undefined]]) {
    const r = await anon.req(m, p, b);
    assert.equal(r.status, 401, `${m} ${p}`);
  }
  assert.deepEqual((await ok(anon.get('/api/employer/me'))).employer, null);
});

test('IDOR: nhà tuyển dụng khác không đọc, sửa, đóng, xóa tin hay hộp thư của tôi', async () => {
  const a = await makeEmployer('Quán A');
  const b = await makeEmployer('Quán B');
  const job = await postJob(a);
  const seeker = new Client();
  await ok(apply(seeker, job.id));
  const inbox = await ok(a.get(`/api/employer/jobs/${job.id}/applications`));
  assert.equal(inbox.items.length, 1);
  const appId = inbox.items[0].id;

  assert.equal((await b.get(`/api/employer/jobs/${job.id}`)).status, 404);
  assert.equal((await b.get(`/api/employer/jobs/${job.id}/applications`)).status, 404);
  assert.equal((await b.put(`/api/employer/jobs/${job.id}`, jobBody({ title: 'Bị chiếm quyền' }))).status, 404);
  assert.equal((await b.post(`/api/employer/jobs/${job.id}/close`)).status, 404);
  assert.equal((await b.post(`/api/employer/jobs/${job.id}/reopen`, { days: 5 })).status, 404);
  assert.equal((await b.del(`/api/employer/jobs/${job.id}`)).status, 404);
  assert.equal((await b.post(`/api/employer/applications/${appId}/status`, { status: 'loai' })).status, 404);
  // người tìm việc (cũng là người gửi hồ sơ) không đọc được hộp thư và không đổi trạng thái hồ sơ của chính mình
  assert.equal((await seeker.get(`/api/employer/jobs/${job.id}/applications`)).status, 401);
  assert.equal((await seeker.post(`/api/employer/applications/${appId}/status`, { status: 'nhan' })).status, 401);
  const rows = await db.query('SELECT status FROM applications WHERE id=$1', [appId]);
  assert.equal(rows[0].status, 'moi', 'hồ sơ không bị đổi');
  const mine = await ok(a.get(`/api/employer/jobs/${job.id}`));
  assert.equal(mine.job.title, job.title);
  assert.equal((await ok(b.get('/api/employer/jobs'))).jobs.length, 0, 'danh sách tin của B không chứa tin của A');
  // chủ tin thì được
  assert.equal((await ok(a.post(`/api/employer/applications/${appId}/status`, { status: 'da_lien_he' }))).status, 'da_lien_he');
});

test('trạng thái hồ sơ chỉ nhận giá trị hợp lệ; id lạ/không phải uuid là 404', async () => {
  const a = await makeEmployer('Quán C');
  assert.equal((await a.post('/api/employer/applications/abc/status', { status: 'nhan' })).status, 404);
  const job = await postJob(a);
  const s = new Client(); await ok(apply(s, job.id));
  const id = (await ok(a.get(`/api/employer/jobs/${job.id}/applications`))).items[0].id;
  assert.equal((await a.post(`/api/employer/applications/${id}/status`, { status: 'hack' })).status, 400);
  assert.equal((await a.post(`/api/employer/applications/${id}/status`, {})).status, 400);
  assert.equal((await a.get(`/api/employer/jobs/${job.id}/applications?status=xyz`)).status, 400);
});

test('cổng cảnh báo: không có SĐT/địa chỉ cụ thể trong mọi API công khai; chỉ lộ sau khi ack:true', async () => {
  const a = await makeEmployer('Quán D');
  const job = await postJob(a, { contactPhone: '0933 111 222', address: '99 Nguyễn Huệ' });
  const s = new Client();
  const flat = async (p) => JSON.stringify((await s.get(p)).json);
  for (const p of ['/api/jobs', `/api/jobs/${job.id}`, '/api/jobs?q=cafe', '/api/jobs/new?since=0']) {
    const t = await flat(p);
    assert.ok(!t.includes('0933111222') && !t.includes('0933 111 222') && !t.includes('99 Nguyễn Huệ') && !t.includes('contactPhone') && !t.includes('employer_id') && !t.includes('employerId'), 'lộ dữ liệu ở ' + p);
  }
  assert.equal((await s.post(`/api/jobs/${job.id}/contact`, {})).status, 400);
  assert.equal((await s.post(`/api/jobs/${job.id}/contact`, { ack: 'true' })).status, 400, 'chuỗi "true" không phải xác nhận');
  assert.equal((await s.post(`/api/jobs/${job.id}/contact`, { ack: 1 })).status, 400);
  const r = await ok(s.post(`/api/jobs/${job.id}/contact`, { ack: true }));
  assert.equal(r.contact.phone, '0933111222');
  assert.equal(r.contact.zaloUrl, 'https://zalo.me/0933111222');
  assert.equal(r.contact.address, '99 Nguyễn Huệ');
  const stats = (await ok(a.get('/api/employer/jobs'))).jobs.find((j) => j.id === job.id);
  assert.equal(stats.contactViews, 1);
});

test('tin đóng, hết hạn hoặc bị ẩn: không xem liên hệ, không gửi quan tâm; tin ẩn là 404', async () => {
  const a = await makeEmployer('Quán E');
  const j1 = await postJob(a); const j2 = await postJob(a); const j3 = await postJob(a);
  const s = new Client();
  await ok(a.post(`/api/employer/jobs/${j1.id}/close`));
  await db.query("UPDATE jobs SET expires_at = now() - interval '1 hour' WHERE id=$1", [j2.id]);
  await db.query("UPDATE jobs SET status='an' WHERE id=$1", [j3.id]);
  for (const j of [j1, j2]) {
    assert.equal((await s.post(`/api/jobs/${j.id}/contact`, { ack: true })).status, 409);
    assert.equal((await apply(s, j.id)).status, 409);
    assert.equal((await s.get(`/api/jobs/${j.id}`)).json.job.state, j === j1 ? 'dong' : 'het_han');
  }
  assert.equal((await s.get(`/api/jobs/${j3.id}`)).status, 404);
  assert.equal((await s.post(`/api/jobs/${j3.id}/contact`, { ack: true })).status, 404);
  assert.equal((await apply(s, j3.id)).status, 404);
  const list = (await ok(s.get('/api/jobs'))).items.map((x) => x.id);
  assert.ok(!list.includes(j1.id) && !list.includes(j2.id) && !list.includes(j3.id));
});

test('không tự gửi quan tâm cho tin của mình; hồ sơ trùng cùng phiên hoặc cùng số bị từ chối', async () => {
  const a = await makeEmployer('Quán F');
  const job = await postJob(a);
  assert.equal((await apply(a, job.id)).status, 400, 'tin của mình');
  const s = new Client();
  assert.equal((await apply(s, job.id)).status, 200);
  assert.equal((await apply(s, job.id, { phone: '0911 222 333' })).status, 409, 'cùng phiên');
  const s2 = new Client();
  const re = await apply(s2, job.id, { name: 'Người khác', message: 'gửi lại' });
  assert.equal(re.status, 200, 'cùng số điện thoại khác phiên: cập nhật hồ sơ cũ, không bị nuốt');
  assert.equal((await ok(a.get(`/api/employer/jobs/${job.id}/applications`))).items.length, 1);
  assert.equal((await ok(a.get(`/api/employer/jobs/${job.id}/applications`))).items[0].message, 'gửi lại');
  assert.equal((await apply(s2, job.id, { phone: '0911222333' })).status, 200);
  assert.equal((await ok(a.get(`/api/employer/jobs/${job.id}/applications`))).items.length, 2);
  assert.equal((await ok(s.get(`/api/jobs/${job.id}`))).job.applied, true);
  assert.equal((await ok(new Client().get(`/api/jobs/${job.id}`))).job.applied, false);
});

test('mã khôi phục: vào lại từ thiết bị khác, mã cũ hết hiệu lực sau khi đổi, đăng xuất', async () => {
  const a = await makeEmployer('Quán G');
  const job = await postJob(a);
  const other = new Client();
  assert.equal((await other.post('/api/employer/recover', { code: 'SAI-SAI' })).status, 404);
  assert.equal((await other.post('/api/employer/recover', { code: 'ABCD-EFGH-JKLM-NPQR' })).status, 404);
  const r = await ok(other.post('/api/employer/recover', { code: a.recoveryCode.toLowerCase().replace(/-/g, ' ') }));
  assert.equal(r.employer.id, a.employerId);
  assert.equal((await ok(other.get('/api/employer/jobs'))).jobs[0].id, job.id);
  // đổi mã
  const nc = await ok(a.post('/api/employer/recovery-code'));
  assert.notEqual(nc.recoveryCode, a.recoveryCode);
  assert.equal((await new Client().post('/api/employer/recover', { code: a.recoveryCode })).status, 404, 'mã cũ vô hiệu');
  assert.equal((await new Client().post('/api/employer/recover', { code: nc.recoveryCode })).status, 200);
  // đăng xuất: cookie không còn quyền
  await ok(other.post('/api/employer/logout'));
  assert.equal((await other.get('/api/employer/jobs')).status, 401);
  // mã không bao giờ nằm nguyên văn trong CSDL
  const rows = await db.query('SELECT recovery_hash FROM employers WHERE id=$1', [a.employerId]);
  assert.ok(!JSON.stringify(rows).includes(nc.recoveryCode.replace(/-/g, '')));
  assert.equal((await db.query('SELECT token_hash FROM phien WHERE employer_id=$1', [a.employerId])).every((x) => /^[0-9a-f]{64}$/.test(x.token_hash)), true, 'chỉ lưu băm token');
});

test('thiết bị đã có tài khoản không tạo thêm; xóa tài khoản xóa cả tin và hồ sơ', async () => {
  const a = await makeEmployer('Quán H');
  assert.equal((await a.post('/api/employer', { name: 'Lại tạo' })).status, 409);
  const job = await postJob(a);
  const s = new Client(); await ok(apply(s, job.id));
  await ok(a.del('/api/employer'));
  assert.equal((await db.query('SELECT count(*)::int n FROM jobs WHERE id=$1', [job.id]))[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM applications WHERE job_id=$1', [job.id]))[0].n, 0);
  assert.equal((await new Client().post('/api/employer/recover', { code: a.recoveryCode })).status, 404);
});
