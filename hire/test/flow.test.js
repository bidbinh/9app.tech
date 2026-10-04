// Luồng nghiệp vụ: đăng/sửa/đóng/gia hạn, tìm kiếm không dấu và lọc, hết hạn, tin mới, báo cáo tự ẩn, quét dọn.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, makeEmployer, postJob, jobBody, db, config, sweep } from './helper.js';

before(boot);
after(shutdown);

const list = async (c, qs = '') => (await ok(c.get('/api/jobs' + qs))).items;

test('đăng tin, xem công khai, sửa, đóng, mở lại', async () => {
  const e = await makeEmployer();
  const job = await postJob(e, { title: 'Pha chế ca tối', district: 'Bình Thạnh', slots: 3, contactPhone: '0912 345 678' });
  assert.equal(job.state, 'dang');
  assert.equal(job.contactPhone, '0912345678', 'số được chuẩn hóa');
  const seeker = new Client();
  const pub = (await ok(seeker.get(`/api/jobs/${job.id}`))).job;
  assert.equal(pub.title, 'Pha chế ca tối');
  assert.equal(pub.slots, 3);
  assert.ok(pub.employerSince);
  assert.equal(pub.contactPhone, undefined);
  // sửa
  const upd = await ok(e.put(`/api/employer/jobs/${job.id}`, jobBody({ title: 'Pha chế ca tối (sửa)', district: 'Bình Thạnh', description: 'Mô tả mới đủ dài để hợp lệ, pha chế đồ uống và dọn quầy.' })));
  assert.equal(upd.job.title, 'Pha chế ca tối (sửa)');
  assert.equal((await ok(seeker.get(`/api/jobs/${job.id}`))).job.title, 'Pha chế ca tối (sửa)');
  // sửa mà chèn nội dung thu phí thì bị chặn, tin cũ giữ nguyên
  const bad = await e.put(`/api/employer/jobs/${job.id}`, jobBody({ description: 'Nhận việc ngay, cần đặt cọc 500k giữ chỗ cho ca làm.' }));
  assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'scam_blocked');
  assert.equal((await ok(seeker.get(`/api/jobs/${job.id}`))).job.title, 'Pha chế ca tối (sửa)');
  // đóng và mở lại
  await ok(e.post(`/api/employer/jobs/${job.id}/close`));
  assert.ok(!(await list(seeker)).some((x) => x.id === job.id));
  assert.equal((await ok(seeker.get(`/api/jobs/${job.id}`))).job.state, 'dong');
  const re = await ok(e.post(`/api/employer/jobs/${job.id}/reopen`, { days: 7 }));
  assert.equal(re.job.state, 'dang'); assert.equal(re.job.renewCount, 1);
  assert.ok(Math.abs(new Date(re.job.expiresAt) - Date.now() - 7 * 86400000) < 60000);
  assert.ok((await list(seeker)).some((x) => x.id === job.id));
  assert.equal((await e.post(`/api/employer/jobs/${job.id}/reopen`, { days: 99 })).status, 400);
  // xóa
  await ok(e.del(`/api/employer/jobs/${job.id}`));
  assert.equal((await seeker.get(`/api/jobs/${job.id}`)).status, 404);
});

test('hết hạn: tin quá hạn biến khỏi danh sách và không đếm vào hạn mức tin đang mở', async () => {
  const e = await makeEmployer();
  const job = await postJob(e, { days: 1 });
  const s = new Client();
  assert.ok((await list(s)).some((x) => x.id === job.id));
  await db.query("UPDATE jobs SET expires_at = now() - interval '1 second' WHERE id=$1", [job.id]);
  assert.ok(!(await list(s)).some((x) => x.id === job.id));
  assert.equal((await ok(s.get(`/api/jobs/${job.id}`))).job.state, 'het_han');
  assert.equal((await ok(e.get('/api/employer/jobs'))).jobs[0].state, 'het_han');
  assert.equal((await ok(s.get('/api/jobs/new?since=0'))).count >= 0, true);
  // gia hạn đưa tin trở lại
  await ok(e.post(`/api/employer/jobs/${job.id}/reopen`, { days: 3 }));
  assert.ok((await list(s)).some((x) => x.id === job.id));
  // quá 30 ngày sau hết hạn thì 404
  await db.query("UPDATE jobs SET expires_at = now() - interval '31 days' WHERE id=$1", [job.id]);
  assert.equal((await s.get(`/api/jobs/${job.id}`)).status, 404);
  // tin hết hạn không tính vào số tin đang mở
  const e2 = await makeEmployer();
  for (let i = 0; i < 10; i++) await postJob(e2);
  assert.equal((await e2.post('/api/employer/jobs', jobBody())).status, 409, 'đủ 10 tin đang mở');
  const first = (await ok(e2.get('/api/employer/jobs'))).jobs[0];
  await db.query("UPDATE jobs SET expires_at = now() - interval '1 minute' WHERE id=$1", [first.id]);
  assert.equal((await e2.post('/api/employer/jobs', jobBody())).status, 200);
});

test('tìm kiếm không dấu và các bộ lọc', async () => {
  const e = await makeEmployer('Tiệm Cô Ba');
  const a = await postJob(e, { company: 'Tiệm Cô Ba', title: 'Phụ bếp bánh mì', category: 'bep', kind: 'lam_them', payType: 'gio', payMin: 30000, payMax: 35000, shifts: ['sang'], district: 'Quận 3', startNow: true, description: 'Phụ bếp làm bánh mì buổi sáng, nướng bánh, cắt rau. Có cơm trưa.' });
  const b = await postJob(e, { company: 'Tiệm Cô Ba', title: 'Giao hàng nội thành', category: 'giao_hang', kind: 'ban_tg', payType: 'ngay', payMin: 300000, payMax: 400000, shifts: ['toi'], district: 'Thủ Đức', startNow: false, description: 'Giao hàng nội thành bằng xe máy, có phụ cấp xăng. Làm theo ca tối.' });
  const c = await postJob(e, { company: 'Tiệm Cô Ba', title: 'Kế toán tổng hợp', category: 'van_phong', kind: 'van_phong', payType: 'thang', payMin: 10000000, payMax: 14000000, shifts: [], city: 'hn', district: 'Cầu Giấy', startNow: false, description: 'Làm sổ sách, báo cáo thuế, hóa đơn hằng tháng cho công ty nhỏ.' });
  const d = await postJob(e, { company: 'Tiệm Cô Ba', title: 'Phụ quán thỏa thuận', payType: 'thoa_thuan', payMin: undefined, payMax: undefined, shifts: ['linh_hoat'], district: 'Quận 3', description: 'Phụ quán buổi chiều, lương thỏa thuận theo kinh nghiệm làm việc.' });
  const s = new Client();
  // mọi truy vấn kèm "tiem co ba" (tên quán) để không lẫn tin của các test khác
  const ids = async (qs, q = '') => (await list(s, '?q=' + encodeURIComponent('tiem co ba ' + q) + (qs ? '&' + qs : ''))).map((x) => x.id);
  assert.deepEqual(await ids('', 'banh mi'), [a.id]);
  assert.deepEqual(await ids('', 'Bánh mì'), [a.id]);
  assert.deepEqual(await ids('', 'ke toan'), [c.id]);
  assert.deepEqual(await ids('', 'KE TOAN cau giay'), [c.id]);
  assert.deepEqual(await ids('', 'thu duc'), [b.id]);
  assert.deepEqual(await ids('', 'banh xe'), [], 'AND các từ khóa');
  assert.equal((await ids('', '%')).length, 4, 'dấu % không phải ký tự đại diện, chỉ bị bỏ');
  assert.deepEqual(await ids('', "'; DROP TABLE jobs; --"), []);
  assert.deepEqual(await ids('city=hn'), [c.id]);
  assert.deepEqual((await ids('city=hcm&district=quan+3')).sort(), [a.id, d.id].sort());
  assert.deepEqual(await ids('kind=van_phong'), [c.id]);
  assert.deepEqual(await ids('category=giao_hang'), [b.id]);
  assert.deepEqual(await ids('payType=gio&minPay=30000'), [a.id]);
  assert.deepEqual(await ids('payType=gio&minPay=40000'), [], 'lương cao nhất 35k < 40k');
  assert.deepEqual(await ids('payType=ngay&minPay=350000'), [b.id]);
  assert.deepEqual(await ids('payType=thang&minPay=12000000'), [c.id]);
  assert.deepEqual(await ids('payType=thoa_thuan'), [d.id]);
  assert.deepEqual((await ids('shift=sang')).sort(), [a.id, d.id].sort(), 'ca linh hoạt khớp mọi ca');
  assert.deepEqual((await ids('shift=toi')).sort(), [b.id, d.id].sort());
  assert.deepEqual((await ids('startNow=1')).sort(), [a.id, d.id].sort(), 'jobBody mặc định startNow=true, b và c tắt');
  assert.equal((await s.get('/api/jobs?city=xx')).status, 400);
  assert.equal((await s.get('/api/jobs?kind=xx')).status, 400);
  // phân trang theo con trỏ
  const first2 = await ok(s.get('/api/jobs?limit=2&q=tiem+co+ba'));
  assert.equal(first2.items.length, 2);
  assert.ok(first2.next);
  const rest = await ok(s.get('/api/jobs?limit=2&q=tiem+co+ba&before=' + first2.next));
  assert.ok(rest.items.every((x) => x.seq < first2.next));
  assert.equal(new Set([...first2.items, ...rest.items].map((x) => x.id)).size, first2.items.length + rest.items.length);
});

test('báo tin mới theo bộ lọc bằng thăm dò', async () => {
  const e = await makeEmployer();
  const s = new Client();
  const base = await ok(s.get('/api/jobs?limit=1'));
  const since = base.head;
  assert.equal((await ok(s.get('/api/jobs/new?since=' + since + '&q=tho+ong+nuoc'))).count, 0);
  await postJob(e, { title: 'Thợ ống nước phụ việc', category: 'khac', description: 'Phụ thợ ống nước đi công trình nhỏ trong quận, có xe đưa đón.' });
  await postJob(e, { title: 'Phục vụ nhà hàng' });
  const r1 = await ok(s.get('/api/jobs/new?since=' + since + '&q=tho+ong+nuoc'));
  assert.equal(r1.count, 1);
  const r2 = await ok(s.get('/api/jobs/new?since=' + since));
  assert.equal(r2.count, 2);
  const r3 = await ok(s.get('/api/jobs/new?since=' + r2.latest));
  assert.equal(r3.count, 0);
});

test('báo cáo: tự ẩn khi đủ 3 IP khác nhau; bỏ qua báo cáo của chủ tin, cùng IP, hoặc lặp lại', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  const reporters = [new Client(), new Client(), new Client()];
  const sameIpPre = () => null;
  assert.equal((await e.post(`/api/jobs/${job.id}/report`, { reason: 'lua_dao' })).status, 200, 'chủ tin tự báo cáo: nhận nhưng không tính');
  // chỉ báo cáo của phiên đã xem liên hệ mới được tính vào ngưỡng tự ẩn
  const stranger = new Client();
  for (const c of [stranger, new Client(), new Client(), new Client()]) await ok(c.post(`/api/jobs/${job.id}/report`, { reason: 'lua_dao' }));
  assert.equal((await db.query('SELECT status FROM jobs WHERE id=$1', [job.id]))[0].status, 'dang', '4 báo cáo từ phiên chưa xem liên hệ không tự ẩn tin');
  for (const c of [...reporters, sameIpPre()]) if (c) await ok(c.post(`/api/jobs/${job.id}/contact`, { ack: true }));
  await ok(reporters[0].post(`/api/jobs/${job.id}/report`, { reason: 'thu_phi' }));
  await ok(reporters[0].post(`/api/jobs/${job.id}/report`, { reason: 'thu_phi' })); // lặp: không tính thêm
  // cùng IP với người đầu, khác cookie: không tính thêm
  const sameIp = new Client('cung-ip', reporters[0].ip);
  await ok(sameIp.post(`/api/jobs/${job.id}/contact`, { ack: true }));
  await ok(sameIp.post(`/api/jobs/${job.id}/report`, { reason: 'thu_phi' }));
  await ok(reporters[1].post(`/api/jobs/${job.id}/report`, { reason: 'ep_mua', note: 'Bắt mua hàng' }));
  let st = await db.query('SELECT status FROM jobs WHERE id=$1', [job.id]);
  assert.equal(st[0].status, 'dang', 'mới 2 IP khác nhau: chưa ẩn');
  // cùng IP đăng tin: không tính
  const owner = new Client('cung-ip-dang', (await db.query('SELECT created_ip FROM jobs WHERE id=$1', [job.id]))[0].created_ip);
  await ok(owner.post(`/api/jobs/${job.id}/report`, { reason: 'khac' }));
  st = await db.query('SELECT status FROM jobs WHERE id=$1', [job.id]);
  assert.equal(st[0].status, 'dang');
  await ok(reporters[2].post(`/api/jobs/${job.id}/report`, { reason: 'lua_dao' }));
  st = await db.query('SELECT status, hidden_reason FROM jobs WHERE id=$1', [job.id]);
  assert.equal(st[0].status, 'an'); assert.equal(st[0].hidden_reason, 'bao_cao');
  const pub = await new Client().get(`/api/jobs/${job.id}`);
  assert.equal(pub.status, 404);
  assert.ok(!(await list(new Client())).some((x) => x.id === job.id));
  // chủ tin thấy tin bị ẩn nhưng không tự mở lại/sửa được
  const mine = (await ok(e.get('/api/employer/jobs'))).jobs.find((x) => x.id === job.id);
  assert.equal(mine.status, 'an');
  assert.equal((await e.post(`/api/employer/jobs/${job.id}/reopen`, { days: 5 })).status, 409);
  assert.equal((await e.put(`/api/employer/jobs/${job.id}`, jobBody())).status, 409);
  assert.equal((await e.post(`/api/employer/jobs/${job.id}/close`)).status, 200);
  assert.equal((await db.query('SELECT status FROM jobs WHERE id=$1', [job.id]))[0].status, 'an', 'đóng không phá trạng thái ẩn');
  // lý do báo cáo phải hợp lệ
  const j2 = await postJob(e);
  assert.equal((await new Client().post(`/api/jobs/${j2.id}/report`, { reason: 'xyz' })).status, 400);
});

test('nhãn cần cẩn trọng cho tin có dấu hiệu nghi ngờ; lương vô lý bị từ chối', async () => {
  const e = await makeEmployer();
  const risky = await postJob(e, { description: 'Việc nhẹ lương cao, không cần kinh nghiệm. Gửi ảnh CCCD trước để giữ suất.' });
  assert.equal(risky.risk, 1);
  assert.ok(risky.riskNotes.length >= 1);
  const s = new Client();
  const pub = (await ok(s.get(`/api/jobs/${risky.id}`))).job;
  assert.equal(pub.risk, 1); assert.ok(pub.riskNotes.length);
  const highPay = await postJob(e, { payType: 'gio', payMin: 250000, payMax: 300000 });
  assert.equal(highPay.risk, 1);
  assert.equal((await e.post('/api/employer/jobs', jobBody({ payType: 'gio', payMin: 5000000 }))).status, 400);
  assert.equal((await e.post('/api/employer/jobs', jobBody({ payType: 'thang', payMin: 20000000, payMax: 15000000 }))).status, 400);
  assert.equal((await e.post('/api/employer/jobs', jobBody({ payType: 'gio', payMin: 20000, payMax: 500000 }))).status, 400, 'khoảng lương quá rộng');
});

test('lọc lừa đảo khi đăng: thu phí/ép mua bị chặn; liên hệ nhét trong mô tả bị chặn; phủ định được qua', async () => {
  const e = await makeEmployer();
  const tries = [
    { description: 'Tuyển nhân viên bán hàng, cần đặt cọc đồng phục 300k nhé.' },
    { title: 'Việc nhẹ, đóng phí hồ sơ 100k' },
    { description: 'Phải mua sản phẩm của công ty để được nhận làm cộng tác viên.' },
    { description: 'Kinh doanh đa cấp, phát triển tuyến dưới hưởng hoa hồng.' },
  ];
  for (const t of tries) {
    const r = await e.post('/api/employer/jobs', jobBody(t));
    assert.equal(r.status, 400, JSON.stringify(t)); assert.equal(r.json.error.code, 'scam_blocked');
  }
  const leak = await e.post('/api/employer/jobs', jobBody({ description: 'Phục vụ bàn, liên hệ trực tiếp 0988 777 666 để nhận việc ngay hôm nay.' }));
  assert.equal(leak.status, 400); assert.equal(leak.json.error.code, 'contact_in_text');
  const leak2 = await e.post('/api/employer/jobs', jobBody({ description: 'Phục vụ bàn, nhắn qua t.me/quan_abc hoặc email abc@gmail.com để nhận việc.' }));
  assert.equal(leak2.json.error.code, 'contact_in_text');
  const good = await e.post('/api/employer/jobs', jobBody({ description: 'Phục vụ bàn tại quán. Không thu phí, không đặt cọc, lương trả cuối tuần. Được học việc tại chỗ.' }));
  assert.equal(good.status, 200, JSON.stringify(good.json));
  // bắt buộc có ô liên hệ riêng hợp lệ
  assert.equal((await e.post('/api/employer/jobs', jobBody({ contactPhone: '12345' }))).status, 400);
});

test('chống tin trùng trong 7 ngày (cùng tài khoản hoặc cùng IP)', async () => {
  const e = await makeEmployer();
  const body = jobBody({ title: 'Nhân viên kho cuối tuần', description: 'Xếp hàng, kiểm đếm, đóng gói đơn hàng cuối tuần tại kho nhỏ.' });
  assert.equal((await e.post('/api/employer/jobs', body)).status, 200);
  const dup = await e.post('/api/employer/jobs', { ...body, title: 'NHÂN VIÊN KHO CUỐI TUẦN!!' });
  assert.equal(dup.status, 409); assert.equal(dup.json.error.code, 'duplicate');
  const e2 = new Client('khac-tk', e.ip);
  await ok(e2.post('/api/employer', { name: 'Tài khoản khác cùng IP' }));
  assert.equal((await e2.post('/api/employer/jobs', body)).status, 409, 'cùng IP');
});

test('hộp thư ứng viên: danh sách, lọc, đổi trạng thái, đếm', async () => {
  const e = await makeEmployer();
  const job = await postJob(e);
  const people = [['Lan', '0911000001'], ['Mai', '0911000002'], ['Cúc', '0911000003']];
  for (const [name, phone] of people) await ok(new Client().post(`/api/jobs/${job.id}/apply`, { name, phone, message: `Em là ${name}`, startNow: name === 'Lan' }));
  let box = await ok(e.get(`/api/employer/jobs/${job.id}/applications`));
  assert.equal(box.items.length, 3); assert.equal(box.counts.moi, 3);
  assert.equal(box.items[0].zaloUrl, 'https://zalo.me/' + box.items[0].phone);
  const lan = box.items.find((x) => x.name === 'Lan');
  assert.equal(lan.startNow, true);
  await ok(e.post(`/api/employer/applications/${lan.id}/status`, { status: 'nhan' }));
  const mai = box.items.find((x) => x.name === 'Mai');
  await ok(e.post(`/api/employer/applications/${mai.id}/status`, { status: 'loai' }));
  box = await ok(e.get(`/api/employer/jobs/${job.id}/applications?status=nhan`));
  assert.deepEqual(box.items.map((x) => x.name), ['Lan']);
  assert.deepEqual(box.counts, { moi: 1, nhan: 1, loai: 1 });
  const mine = (await ok(e.get('/api/employer/jobs'))).jobs[0];
  assert.equal(mine.appsTotal, 3); assert.equal(mine.appsNew, 1); assert.equal(mine.appsAccepted, 1);
});

test('quét dọn: hồ sơ ứng viên của tin hết hạn/đóng quá 60 ngày bị xóa; tin còn mở giữ nguyên', async () => {
  const e = await makeEmployer();
  const open = await postJob(e); const old = await postJob(e); const closed = await postJob(e);
  for (const j of [open, old, closed]) await ok(new Client().post(`/api/jobs/${j.id}/apply`, { name: 'Bình', phone: '0922333444' }));
  await db.query("UPDATE jobs SET expires_at = now() - interval '61 days' WHERE id=$1", [old.id]);
  await ok(e.post(`/api/employer/jobs/${closed.id}/close`));
  await db.query("UPDATE jobs SET closed_at = now() - interval '61 days' WHERE id=$1", [closed.id]);
  const r = await sweep();
  assert.equal(r.applications, 2);
  const n = async (id) => (await db.query('SELECT count(*)::int n FROM applications WHERE job_id=$1', [id]))[0].n;
  assert.equal(await n(open.id), 1); assert.equal(await n(old.id), 0); assert.equal(await n(closed.id), 0);
});

test('lookup tin đã lưu: trả tình trạng, bỏ tin ẩn/xóa/id rác', async () => {
  const e = await makeEmployer();
  const a = await postJob(e); const b = await postJob(e); const c = await postJob(e);
  await ok(e.post(`/api/employer/jobs/${b.id}/close`));
  await db.query("UPDATE jobs SET status='an' WHERE id=$1", [c.id]);
  const r = await ok(new Client().post('/api/jobs/lookup', { ids: [a.id, b.id, c.id, 'rac', 123, '00000000-0000-0000-0000-000000000000'] }));
  const m = Object.fromEntries(r.items.map((x) => [x.id, x.state]));
  assert.deepEqual(m, { [a.id]: 'dang', [b.id]: 'dong' });
});

test('trang chia sẻ /j/<id> có thẻ og, đã escape; tin không tồn tại vẫn trả trang (không lộ)', async () => {
  const e = await makeEmployer();
  const job = await postJob(e, { title: 'Chạy bàn "Quán <b>Mới</b>"' });
  const s = new Client();
  const r = await s.req('GET', `/j/${job.id}`, undefined, { raw: true });
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('og:title'));
  assert.ok(r.text.includes('Chạy bàn &quot;Quán &lt;b&gt;Mới&lt;/b&gt;&quot;'));
  assert.ok(!r.text.includes('<b>Mới</b>'));
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  const r2 = await s.req('GET', '/j/00000000-0000-0000-0000-000000000000', undefined, { raw: true });
  assert.equal(r2.status, 200); assert.ok(!r2.text.includes('og:title'));
});
