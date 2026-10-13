// Liên kết báo cáo cho phụ huynh (công khai) và trang giới thiệu gia sư: chỉ lộ đúng dữ liệu, thu hồi được
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newTutor, addStudent, day, db, BANK, base } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const BAD_WORDS = ['0912345678', 'BÍ MẬT RIÊNG', 'GHI CHÚ HỌC SINH', 'Bạn Khác', 'recovery', 'tutor_id', 'private'];

async function setup() {
  const c = await newTutor('Cô Lan Hương');
  await ok(c.post('/api/me', { bank: BANK }));
  const s = await addStudent(c, { name: 'Bé Minh', grade: 'Lớp 9', subject: 'Toán', parentName: 'Chị Hoa', parentPhone: '0912345678', note: 'GHI CHÚ HỌC SINH', feeAmount: 200000 });
  const other = await addStudent(c, { name: 'Bạn Khác', feeAmount: 100000 });
  const mk = async (d, st, log) => {
    const l = (await ok(c.post('/api/lessons', { studentId: s.id, day: d, startMin: 600 + Math.abs(Number(d.slice(8))) , durationMin: 60 }))).lesson;
    if (st) await ok(c.post(`/api/lessons/${l.id}/mark`, { status: st }));
    if (log) await ok(c.post(`/api/lessons/${l.id}/log`, log));
    return l;
  };
  await mk(day(-1), 'da_day', { topic: 'Hệ phương trình', homework: 'Bài 3 trang 20', comment: 'Bé tiến bộ rõ', rating: 5, privateNote: 'BÍ MẬT RIÊNG: mẹ khó tính' });
  await mk(day(-2), 'hs_nghi', { comment: 'Nghỉ ốm' });
  await mk(day(-3), 'gs_huy');
  await mk(day(4), null);
  const ol = (await ok(c.post('/api/lessons', { studentId: other.id, day: day(-1), startMin: 900, durationMin: 60 }))).lesson;
  await ok(c.post(`/api/lessons/${ol.id}/mark`, { status: 'da_day' }));
  await ok(c.post(`/api/lessons/${ol.id}/log`, { topic: 'Chuyện của Bạn Khác', privateNote: 'riêng của bạn khác' }));
  return { c, s, other };
}

test('link báo cáo: không cần đăng nhập, chỉ lộ dữ liệu phù hợp của đúng học sinh', async () => {
  const { c, s } = await setup();
  const { link } = await ok(c.post(`/api/students/${s.id}/link`, {}));
  assert.match(link.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(link.showFee, false, 'mặc định không hiện học phí'); assert.equal(link.showComments, true);
  const anon = new Client();
  const r = await anon.get('/api/r/' + link.token);
  assert.equal(r.status, 200);
  const raw = r.buf.toString();
  for (const w of BAD_WORDS) assert.ok(!raw.includes(w), 'không được lộ: ' + w);
  assert.ok(!raw.includes('Chuyện của Bạn Khác'));
  assert.equal(r.json.student.name, 'Bé Minh'); assert.equal(r.json.tutor.name, 'Cô Lan Hương');
  assert.equal(r.json.fee, null);
  assert.ok(!raw.includes('0011004012345') && !raw.includes('NGUYEN VAN A'), 'không lộ tài khoản ngân hàng khi chưa bật');
  assert.deepEqual(Object.keys(r.json).sort(), ['fee', 'months', 'recent', 'showComments', 'student', 'today', 'tutor', 'upcoming']);
  assert.deepEqual(Object.keys(r.json.student).sort(), ['grade', 'name', 'subject']);
  const done = r.json.recent.find((x) => x.status === 'da_day');
  assert.equal(done.topic, 'Hệ phương trình'); assert.equal(done.homework, 'Bài 3 trang 20'); assert.equal(done.comment, 'Bé tiến bộ rõ'); assert.equal(done.rating, 5);
  assert.equal(r.json.recent.length, 3); assert.equal(r.json.upcoming.length, 1);
  for (const x of r.json.recent) assert.ok(!('id' in x) && !('studentId' in x) && !('location' in x) && !('fee' in x) && !('privateNote' in x));
  assert.ok(r.json.months.length >= 1);
  // không cookie: tiêu đề chống lập chỉ mục và lộ Referer
  assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.equal(r.headers.get('referrer-policy'), 'no-referrer'); assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal(r.setCookie.length, 0, 'xem báo cáo không cấp phiên');
});

test('tắt hiện nhận xét: bỏ nội dung, bài tập, nhận xét, mức tiếp thu', async () => {
  const { c, s } = await setup();
  const { link } = await ok(c.post(`/api/students/${s.id}/link`, { showComments: false }));
  const r = await new Client().get('/api/r/' + link.token);
  const raw = r.buf.toString();
  assert.ok(!raw.includes('Hệ phương trình') && !raw.includes('Bé tiến bộ rõ') && !raw.includes('Bài 3'));
  assert.equal(r.json.showComments, false);
  assert.ok(r.json.recent.every((x) => !('topic' in x)));
  assert.ok(r.json.recent.length === 3, 'vẫn hiện chuyên cần');
});

test('bật hiện học phí: có số còn nợ, tài khoản nhận tiền và QR; tắt lại thì biến mất; QR bị chặn khi tắt', async () => {
  const { c, s } = await setup();
  const { link } = await ok(c.post(`/api/students/${s.id}/link`, {}));
  const anon = new Client();
  assert.equal((await anon.get(`/api/r/${link.token}/qr.svg`)).status, 404, 'tắt học phí: không lấy được QR');
  const on = (await ok(c.post(`/api/students/${s.id}/link`, { showFee: true }))).link;
  assert.equal(on.token, link.token, 'sửa tùy chọn không đổi link'); assert.equal(on.showFee, true);
  const r = await anon.get('/api/r/' + link.token);
  assert.equal(r.json.fee.balance, 200000); assert.equal(r.json.fee.bank.account, '0011004012345'); assert.equal(r.json.fee.bank.name, 'Vietcombank'); assert.equal(r.json.fee.qr, true);
  assert.match(r.json.fee.content, /^9T[A-Z0-9]{6}$/);
  assert.ok(!r.buf.toString().includes('Bạn Khác') && !r.buf.toString().includes('100000'), 'không lộ nợ của học sinh khác');
  const qr = await anon.get(`/api/r/${link.token}/qr.svg`, { raw: true });
  assert.equal(qr.status, 200); assert.match(qr.buf.toString(), /<svg/);
  // trả hết thì không còn QR
  await ok(c.post(`/api/students/${s.id}/payments`, { full: true }));
  assert.equal((await anon.get(`/api/r/${link.token}/qr.svg`)).status, 404);
  assert.equal((await anon.get('/api/r/' + link.token)).json.fee.qr, false);
  await ok(c.post(`/api/students/${s.id}/link`, { showFee: false }));
  const off = await anon.get('/api/r/' + link.token);
  assert.equal(off.json.fee, null); assert.ok(!off.buf.toString().includes('0011004012345'));
});

test('thu hồi và tạo lại: link cũ chết ngay, mỗi học sinh một link hiệu lực', async () => {
  const { c, s, other } = await setup();
  const t1 = (await ok(c.post(`/api/students/${s.id}/link`, {}))).link.token;
  const anon = new Client();
  assert.equal((await anon.get('/api/r/' + t1)).status, 200);
  const t2 = (await ok(c.post(`/api/students/${s.id}/link`, { regenerate: true }))).link.token;
  assert.notEqual(t1, t2);
  assert.equal((await anon.get('/api/r/' + t1)).status, 404, 'link cũ bị thu hồi khi tạo mới');
  assert.equal((await anon.get('/api/r/' + t2)).status, 200);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM share_links WHERE student_id=$1 AND revoked_at IS NULL`, [s.id]))[0].n, 1);
  assert.equal((await c.post(`/api/students/${s.id}/link`, {})).json.link.token, t2, 'gọi lại không đổi link');
  await ok(c.del(`/api/students/${s.id}/link`));
  assert.equal((await anon.get('/api/r/' + t2)).status, 404);
  assert.equal((await ok(c.get('/api/students/' + s.id))).link, null);
  // đồng thời tạo link: vẫn chỉ một link hiệu lực
  const rs = await Promise.all([1, 2, 3, 4].map(() => c.post(`/api/students/${other.id}/link`, { regenerate: true })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM share_links WHERE student_id=$1 AND revoked_at IS NULL`, [other.id]))[0].n, 1);
});

test('mã sai định dạng, mã bịa, mã của link khác: 404 đồng nhất; không thể dò bằng độ dài/ký tự lạ', async () => {
  const { c, s } = await setup();
  const t = (await ok(c.post(`/api/students/${s.id}/link`, {}))).link.token;
  const anon = new Client();
  for (const bad of ['abc', 'A'.repeat(22), 'A'.repeat(21), 'A'.repeat(23), t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), encodeURIComponent("' OR 1=1 --"), '..%2F..%2Fetc', t.toLowerCase() === t ? t.toUpperCase() : t.toLowerCase()]) {
    const r = await anon.get('/api/r/' + bad);
    assert.equal(r.status, 404, bad);
    assert.equal(r.json.error.code, 'not_found');
  }
});

test('lượt xem được ghi nhận cho gia sư', async () => {
  const { c, s } = await setup();
  const t = (await ok(c.post(`/api/students/${s.id}/link`, {}))).link.token;
  await new Client().get('/api/r/' + t); await new Client().get('/api/r/' + t);
  await new Promise((r) => setTimeout(r, 150));
  const l = (await ok(c.get('/api/students/' + s.id))).link;
  assert.equal(l.views, 2); assert.ok(l.lastViewedAt);
});

test('trang HTML của link: không lập chỉ mục, không rò Referer, không lưu đệm', async () => {
  const { c, s } = await setup();
  const t = (await ok(c.post(`/api/students/${s.id}/link`, {}))).link.token;
  const r = await fetch(`${base}/r/${t}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /html/);
  assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.equal(r.headers.get('referrer-policy'), 'no-referrer'); assert.match(r.headers.get('cache-control'), /no-store/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await r.text();
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.ok(!html.includes(t), 'trang HTML không chứa mã (mã nằm ở đường dẫn, JS tự đọc)');
});

test('chỉ chủ mới quản lý link: người khác không tạo, không thu hồi, không xem mã của link', async () => {
  const { c, s } = await setup();
  const x = await newTutor('Người lạ');
  assert.equal((await x.post(`/api/students/${s.id}/link`, {})).status, 404);
  const t = (await ok(c.post(`/api/students/${s.id}/link`, {}))).link.token;
  assert.equal((await x.del(`/api/students/${s.id}/link`)).status, 404);
  assert.equal((await new Client().get('/api/r/' + t)).status, 200);
  const d = await x.get(`/api/students/${s.id}`);
  assert.equal(d.status, 404); assert.ok(!d.buf.toString().includes(t));
});

// ---------- trang giới thiệu gia sư ----------
const PROFILE = { enabled: true, headline: 'Gia sư Toán lớp 6-9, 3 năm kinh nghiệm', bio: 'Dạy kiên nhẫn.\nCó giáo án riêng.', subjects: 'Toán, Lý', levels: 'Lớp 6 đến 9', area: 'Quận Cầu Giấy, Hà Nội', priceFrom: 150000, priceTo: 250000, mode: 'ca_hai', contact: 'Zalo 0901234567' };

test('trang giới thiệu: mặc định chưa có; bật thì công khai chỉ gồm trường hồ sơ; tắt thì 404', async () => {
  const c = await newTutor('Thầy Hùng', 'giao_vien_khac');
  assert.equal((await ok(c.get('/api/profile'))).profile, null);
  const st = await addStudent(c, { name: 'Học trò bí mật' });
  const p = (await ok(c.post('/api/profile', PROFILE))).profile;
  assert.match(p.code, /^[A-HJ-NP-Z2-9]{10}$/);
  const anon = new Client();
  const r = await anon.get('/api/g/' + p.code);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['area', 'bio', 'contact', 'headline', 'levels', 'mode', 'name', 'priceFrom', 'priceTo', 'subjects']);
  assert.equal(r.json.name, 'Thầy Hùng'); assert.ok(!r.buf.toString().includes('Học trò') && !r.buf.toString().includes(st.id));
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  const page = await fetch(`${base}/g/${p.code}`);
  const html = await page.text();
  assert.match(html, /property="og:title" content="Thầy Hùng - gia sư Toán, Lý"/);
  await ok(c.post('/api/profile', { ...PROFILE, enabled: false }));
  assert.equal((await anon.get('/api/g/' + p.code)).status, 404);
  assert.ok(!(await (await fetch(`${base}/g/${p.code}`)).text()).includes('og:title'), 'trang tắt thì không có thẻ chia sẻ');
  assert.equal((await ok(c.post('/api/profile', PROFILE))).profile.code, p.code, 'bật lại giữ nguyên mã');
});

test('trang giới thiệu: giáo viên trường công lập bị khóa (403), đổi sang tình trạng này thì tự tắt trang đang bật', async () => {
  const gv = await newTutor('GV công', 'giao_vien_cong');
  const r = await gv.post('/api/profile', PROFILE);
  assert.equal(r.status, 403); assert.match(r.json.error.message, /Thông tư 29/);
  assert.equal((await ok(gv.get('/api/profile'))).allowed, false);
  // lưu nháp không bật được
  assert.equal((await gv.post('/api/profile', { ...PROFILE, enabled: false })).status, 200);
  const sv = await newTutor('Sinh viên', 'sinh_vien');
  const p = (await ok(sv.post('/api/profile', PROFILE))).profile;
  assert.equal((await new Client().get('/api/g/' + p.code)).status, 200);
  await ok(sv.post('/api/me', { status: 'giao_vien_cong' }));
  assert.equal((await new Client().get('/api/g/' + p.code)).status, 404, 'tự tắt');
  assert.equal((await sv.post('/api/profile', PROFILE)).status, 403);
});

test('trang giới thiệu: nhập xấu bị từ chối, nội dung HTML không thành thẻ ở trang chia sẻ', async () => {
  const c = await newTutor('Gia sư XSS', 'khac');
  for (const bad of [{ headline: '' }, { subjects: '' }, { headline: 'x'.repeat(81) }, { bio: 'x'.repeat(801) }, { priceFrom: -1 }, { priceFrom: 300000, priceTo: 100000 }, { priceTo: 1e12 }, { mode: 'khác' }, { enabled: 'yes' }, { contact: 'x'.repeat(61) }]) {
    assert.equal((await c.post('/api/profile', { ...PROFILE, ...bad })).status, 400, JSON.stringify(bad));
  }
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
  const p = (await ok(c.post('/api/profile', { ...PROFILE, headline: evil.slice(0, 80), subjects: evil.slice(0, 40) }))).profile;
  const html = await (await fetch(`${base}/g/${p.code}`)).text();
  assert.ok(!html.includes('<script>alert') && !html.includes('<img src=x'), 'đã escape thẻ meta');
  assert.match(html, /&lt;script&gt;/);
  assert.equal((await fetch(`${base}/g/ZZZZZZZZZZ`)).status, 200, 'trang HTML luôn trả khung; giao diện tự báo không tồn tại');
  assert.equal((await new Client().get('/api/g/ZZZZZZZZZZ')).status, 404);
  assert.equal((await new Client().get('/api/g/short')).status, 404);
});

test('không có danh sách hay tìm kiếm gia sư: không kết nối tự động', async () => {
  const anon = new Client();
  for (const p of ['/api/g', '/api/g/', '/api/tutors', '/api/search', '/api/profiles', '/api/r']) assert.equal((await anon.get(p)).status, 404, p);
});
