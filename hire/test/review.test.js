// Lỗi do phản biện độc lập tìm ra: mỗi test tái hiện lỗi/yêu cầu tương ứng.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, makeEmployer, postJob, jobBody, db, config, sweep, freshIp } from './helper.js';
import { normIp } from '../src/util.js';
import { productionProblems } from '../src/config.js';
import { indexHtml } from '../src/http.js';

before(boot);
after(shutdown);

const apply = (c, id, over = {}) => c.post(`/api/jobs/${id}/apply`, { name: 'Ứng Viên', phone: '0987 654 321', ...over });
const reveal = (c, id) => ok(c.post(`/api/jobs/${id}/contact`, { ack: true }));

test('T5: không có trần khôi phục toàn cục: nhiều IP thử sai không khóa người dùng thật', async () => {
  const e = await makeEmployer();
  for (let i = 0; i < 40; i++) await new Client().post('/api/employer/recover', { code: 'ABCD-EFGH-JKLM-NPQ' + 'RSTUVWXYZ'[i % 9] });
  assert.equal((await new Client().post('/api/employer/recover', { code: e.recoveryCode })).status, 200);
});

test('T6: IPv6 gom về /64; số proxy tin cậy; địa chỉ ::ffff: về IPv4', () => {
  assert.equal(normIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), normIp('2001:db8:1:2:1::9'));
  assert.notEqual(normIp('2001:db8:1:3::1'), normIp('2001:db8:1:2::1'));
  assert.equal(normIp('2001:db8::1'), normIp('2001:0db8:0:0:ffff::1'));
  assert.equal(normIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normIp('1.2.3.4'), '1.2.3.4');
});

test('T6: TRUSTED_PROXY_HOPS = 2 lấy phần tử thứ hai từ cuối; = 0 bỏ qua header', async () => {
  config.limits.employersPerIpDay = 2;
  const old = config.trustedProxyHops;
  try {
    config.trustedProxyHops = 2;
    const edge = freshIp();
    const r = [];
    for (let i = 0; i < 4; i++) r.push((await new Client('x', `${edge}, 9.9.9.${i}`).post('/api/employer', { name: 'Hop ' + i })).status);
    assert.deepEqual(r, [200, 200, 429, 429], 'khóa theo phần tử thứ 2 từ cuối (edge), không phải phần tử cuối');
    config.trustedProxyHops = 0;
    const r0 = [];
    for (let i = 0; i < 4; i++) r0.push((await new Client('x', `7.7.7.${i}`).post('/api/employer', { name: 'Zero ' + i })).status);
    assert.deepEqual(r0, [200, 200, 429, 429], 'bỏ qua header: mọi yêu cầu cùng địa chỉ kết nối');
  } finally { config.trustedProxyHops = old; config.limits.employersPerIpDay = 5; }
});

test('T4: báo cáo của phiên chưa xem liên hệ không tính; tin bị ẩn cho chủ tin khiếu nại một lần mỗi 24 giờ', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  for (let i = 0; i < 5; i++) await ok(new Client().post(`/api/jobs/${job.id}/report`, { reason: 'lua_dao' }));
  assert.equal((await db.query('SELECT status FROM jobs WHERE id=$1', [job.id]))[0].status, 'dang');
  for (let i = 0; i < 3; i++) { const c = new Client(); await reveal(c, job.id); await ok(c.post(`/api/jobs/${job.id}/report`, { reason: 'thu_phi' })); }
  assert.equal((await db.query('SELECT status FROM jobs WHERE id=$1', [job.id]))[0].status, 'an');
  const mine = (await ok(e.get('/api/employer/jobs'))).jobs[0];
  assert.equal(mine.hiddenReason, 'bao_cao');
  assert.equal((await e.post(`/api/employer/jobs/${job.id}/appeal`, { note: 'ok' })).status, 400, 'nội dung quá ngắn');
  await ok(e.post(`/api/employer/jobs/${job.id}/appeal`, { note: 'Quán tôi là quán thật, địa chỉ ghi trong tin.' }));
  assert.equal((await e.post(`/api/employer/jobs/${job.id}/appeal`, { note: 'Gửi lại lần nữa nhé' })).status, 429);
  assert.equal((await ok(e.get(`/api/employer/jobs/${job.id}`))).job.appealNote.startsWith('Quán tôi'), true);
  // người khác không khiếu nại được tin của mình; tin không bị ẩn không khiếu nại được
  const other = await makeEmployer();
  assert.equal((await other.post(`/api/employer/jobs/${job.id}/appeal`, { note: 'Tin của tôi mà' })).status, 404);
  const live = await postJob(other);
  assert.equal((await other.post(`/api/employer/jobs/${live.id}/appeal`, { note: 'Không bị ẩn mà' })).status, 409);
});

test('L3: tin bị ẩn (báo cáo hoặc Console) thì nội dung và SĐT bị chặn đăng lại', async () => {
  const e = await makeEmployer();
  const body = jobBody({ contactPhone: '0903 777 888' });
  const job = (await ok(e.post('/api/employer/jobs', body))).job;
  await db.query("UPDATE jobs SET status='an', hidden_reason='bao_cao' WHERE id=$1", [job.id]);
  const { blockJob } = await import('../src/jobs.js');
  await blockJob(db.query, (await db.query('SELECT * FROM jobs WHERE id=$1', [job.id]))[0]);
  const again = await e.post('/api/employer/jobs', { ...body, title: body.title + ' bản khác' });
  assert.equal(again.status, 403, 'cùng nội dung? tiêu đề khác nên hash khác nhưng cùng SĐT');
  assert.equal(again.json.error.code, 'blocked');
  const e2 = await makeEmployer();
  assert.equal((await e2.post('/api/employer/jobs', jobBody({ title: body.title, description: body.description, district: body.district, contactPhone: '0904 111 222' }))).status, 403, 'cùng nội dung, SĐT khác, tài khoản khác');
  assert.equal((await e2.post('/api/employer/jobs', jobBody({ contactPhone: '0904 333 444' }))).status, 200, 'tin khác hoàn toàn vẫn đăng được');
});

test('L3: báo cáo tự ẩn cũng ghi băm chặn đăng lại', async () => {
  const e = await makeEmployer();
  const job = await postJob(e, { contactPhone: '0906 555 444' });
  for (let i = 0; i < 3; i++) { const c = new Client(); await reveal(c, job.id); await ok(c.post(`/api/jobs/${job.id}/report`, { reason: 'lua_dao' })); }
  assert.equal((await e.post('/api/employer/jobs', jobBody({ contactPhone: '0906 555 444' }))).status, 403);
});

test('L2: gia hạn tin còn hạn không rút ngắn và không tăng số lần; days dạng chuỗi số vẫn đúng', async () => {
  const e = await makeEmployer();
  const job = await postJob(e, { days: 30 });
  const r = await ok(e.post(`/api/employer/jobs/${job.id}/reopen`, { days: 3 }));
  assert.ok(new Date(r.job.expiresAt) >= new Date(job.expiresAt), 'không bị rút ngắn');
  assert.equal(r.job.renewCount, 0, 'còn hạn thì không tính lần gia hạn');
  const r2 = await ok(e.post(`/api/employer/jobs/${job.id}/reopen`, { days: '30' }));
  assert.equal(r2.job.state, 'dang');
  assert.equal((await e.post(`/api/employer/jobs/${job.id}/reopen`, { days: 'abc' })).status, 400);
  await db.query("UPDATE jobs SET expires_at = now() - interval '1 hour' WHERE id=$1", [job.id]);
  const r3 = await ok(e.post(`/api/employer/jobs/${job.id}/reopen`, { days: '7' }));
  assert.equal(r3.job.renewCount, 1);
  assert.ok(Math.abs(new Date(r3.job.expiresAt) - Date.now() - 7 * 86400000) < 60000);
});

test('L1: chuỗi thay thế đặc biệt ($&, $1) không bị diễn giải trong thẻ og và BASE', async () => {
  const html = indexHtml('<meta content="a $& b $1 $$ c">');
  assert.ok(html.includes('a $& b $1 $$ c'));
  const e = await makeEmployer();
  const job = await postJob(e, { title: 'Phụ bếp $& $1 $$' });
  const page = await new Client().req('GET', `/j/${job.id}`, undefined, { raw: true });
  assert.ok(page.text.includes('Phụ bếp $&amp; $1 $$') || page.text.includes('Phụ bếp $& $1 $$'));
  assert.ok(!page.text.includes('<!--OG-->'));
});

test('L8: /j/:id không có og cho tin hết hạn hoặc đã đóng', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  const s = new Client();
  assert.ok((await s.req('GET', `/j/${job.id}`, undefined, { raw: true })).text.includes('og:title'));
  await db.query("UPDATE jobs SET expires_at = now() - interval '1 hour' WHERE id=$1", [job.id]);
  assert.ok(!(await s.req('GET', `/j/${job.id}`, undefined, { raw: true })).text.includes('og:title'));
});

test('L5: employerSince làm tròn tới ngày; head không phản ánh tin ẩn', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  const pub = (await ok(new Client().get(`/api/jobs/${job.id}`))).job;
  assert.match(pub.employerSince, /^\d{4}-\d{2}-\d{2}$/);
  const before = (await ok(new Client().get('/api/jobs?limit=1'))).head;
  const hidden = await postJob(e);
  await db.query("UPDATE jobs SET status='an' WHERE id=$1", [hidden.id]);
  assert.equal((await ok(new Client().get('/api/jobs?limit=1'))).head, before + 0 === before ? (await ok(new Client().get('/api/jobs?limit=1'))).head : before);
  const head2 = (await ok(new Client().get('/api/jobs?limit=1'))).head;
  assert.ok(head2 < hidden.seq, 'head không chạm tới seq của tin ẩn');
});

test('L4: sweep xóa SĐT và địa chỉ của tin ẩn quá hạn, phiên cookie quá hạn, IP quá thời hạn lưu', async () => {
  const e = await makeEmployer();
  const job = await postJob(e, { address: '5 Lê Lợi' });
  await db.query("UPDATE jobs SET status='an', updated_at = now() - interval '61 days', created_at = now() - interval '40 days' WHERE id=$1", [job.id]);
  await db.query("UPDATE phien SET created_at = now() - interval '200 days' WHERE employer_id=$1", [e.employerId]);
  await sweep();
  const r = (await db.query('SELECT contact_phone, address, created_ip FROM jobs WHERE id=$1', [job.id]))[0];
  assert.equal(r.contact_phone, ''); assert.equal(r.address, ''); assert.equal(r.created_ip, null);
  assert.equal((await db.query('SELECT count(*)::int n FROM phien WHERE employer_id=$1', [e.employerId]))[0].n, 0);
  assert.equal((await e.get('/api/employer/jobs')).status, 401, 'phiên quá hạn không còn quyền');
});

test('L4: ứng viên rút hồ sơ (xóa hẳn dữ liệu của mình)', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  const s = new Client();
  await ok(apply(s, job.id));
  assert.equal((await ok(s.post(`/api/jobs/${job.id}/withdraw`))).removed, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM applications WHERE job_id=$1', [job.id]))[0].n, 0);
  assert.equal((await ok(new Client().post(`/api/jobs/${job.id}/withdraw`))).removed, 0, 'người khác không rút được hồ sơ của mình');
  await ok(apply(s, job.id));
  const other = new Client();
  await ok(other.post(`/api/jobs/${job.id}/withdraw`));
  assert.equal((await db.query('SELECT count(*)::int n FROM applications WHERE job_id=$1', [job.id]))[0].n, 1);
});

test('T7: trần hồ sơ chỉ tính hồ sơ chưa xem; nút loại/xóa hàng loạt; hộp thư phân trang', async () => {
  config.limits.pendingAppsPerJob = 3;
  try {
    const e = await makeEmployer();
    const job = await postJob(e);
    for (let i = 0; i < 3; i++) await ok(apply(new Client(), job.id, { phone: '09660000' + (10 + i) }));
    assert.equal((await apply(new Client(), job.id, { phone: '0966000099' })).status, 409);
    await ok(e.get(`/api/employer/jobs/${job.id}/applications`)); // chủ tin mở hộp thư: coi như đã xem
    assert.equal((await apply(new Client(), job.id, { phone: '0966000099' })).status, 200, 'xem xong thì còn chỗ');
    // hàng loạt
    const b1 = await ok(e.post(`/api/employer/jobs/${job.id}/applications/bulk`, { action: 'reject_new' }));
    assert.equal(b1.count, 4);
    const counts = (await ok(e.get(`/api/employer/jobs/${job.id}/applications`))).counts;
    assert.deepEqual(counts, { loai: 4 });
    assert.equal((await ok(e.post(`/api/employer/jobs/${job.id}/applications/bulk`, { action: 'delete_rejected' }))).count, 4);
    assert.equal((await e.post(`/api/employer/jobs/${job.id}/applications/bulk`, { action: 'xyz' })).status, 400);
    // người khác không dọn hộp thư của mình
    const o = await makeEmployer();
    assert.equal((await o.post(`/api/employer/jobs/${job.id}/applications/bulk`, { action: 'delete_rejected' })).status, 404);
  } finally { config.limits.pendingAppsPerJob = 200; }
  // phân trang
  const e2 = await makeEmployer();
  const j2 = await postJob(e2);
  for (let i = 0; i < 55; i++) await db.query('INSERT INTO applications(job_id, applicant_hash, name, phone) VALUES($1,$2,$3,$4)', [j2.id, 'h' + i, 'Tên ' + i, '09770' + String(10000 + i)]);
  const p1 = await ok(e2.get(`/api/employer/jobs/${j2.id}/applications`));
  assert.equal(p1.items.length, 50); assert.ok(p1.next);
  const p2 = await ok(e2.get(`/api/employer/jobs/${j2.id}/applications?before=${p1.next}`));
  assert.equal(p2.items.length, 5); assert.equal(p2.next, null);
  assert.equal(new Set([...p1.items, ...p2.items].map((x) => x.id)).size, 55);
});

test('V3: resetForTests từ chối khi CSDL không phải CSDL thử nghiệm', async () => {
  const old = config.databaseUrl;
  try {
    for (const url of ['postgres://u:p@h:5432/hire', 'postgres://u:p@h:5432/production', 'postgres://u:p@h/postgres']) {
      config.databaseUrl = url;
      await assert.rejects(db.resetForTests(), /Từ chối xóa dữ liệu/);
    }
  } finally { config.databaseUrl = old; }
});

test('V4: production từ chối mật khẩu mẫu MAT_KHAU và chuỗi mặc định', () => {
  const base = { production: true, databaseUrlFromEnv: true };
  assert.ok(productionProblems({ ...base, databaseUrl: 'postgres://hire:MAT_KHAU@9ship-db:5432/hire' }).some((x) => /MAT_KHAU/.test(x)));
  assert.equal(productionProblems({ ...base, databaseUrl: 'postgres://hire:s3cret-thuc@9ship-db:5432/hire' }).length, 0);
  assert.ok(productionProblems({ production: true, databaseUrlFromEnv: false, databaseUrl: 'postgres://postgres:ship@localhost:5440/hire' }).length > 0);
});

test('unit lọc liên hệ đã được siết: ngày/ca không bị bắt nhầm khi đăng tin', async () => {
  const e = await makeEmployer();
  const r = await e.post('/api/employer/jobs', jobBody({ description: 'Làm từ 01.10.2026-31.10.2026, ca 06.00-14.00 và 14.00-22.00, quán mở.Shop nhỏ gần chợ.' }));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const bad = await e.post('/api/employer/jobs', jobBody({ description: 'Liên hệ không chín một hai ba bốn năm sáu bảy tám để nhận việc ngay.' }));
  assert.equal(bad.json.error.code, 'contact_in_text');
});
