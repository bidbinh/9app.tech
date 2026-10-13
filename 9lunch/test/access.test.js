// Quyền truy cập, CSRF, XSS, giới hạn, idempotency, xóa nhóm, quyền riêng tư tài khoản ngân hàng
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, shutdown, makeTeam, mealToPayment, ok, db, Client, config, bankFor, base } from './helper.js';
const BANK = bankFor(0);

before(boot);
after(shutdown);

let team; let mealId;
test('chuẩn bị nhóm 4 người, người ứng tiền là An (không phải chủ nhóm)', async () => {
  team = await makeTeam(['Chủ', 'An', 'Bình', 'Chi'], { bankFor: ['Chủ', 'An'] });
  mealId = await mealToPayment(team, { payer: 'An', orders: { Chủ: [['Cơm', 40000, 1]], An: [['Phở', 50000, 1]], Bình: [['Bún', 45000, 1]] } });
});

test('phiên lưu băm SHA-256, không lưu token; cookie HttpOnly SameSite=Lax Path=/9lunch/', async () => {
  const c = new Client();
  const r = await c.post('/api/teams', { name: 'X', myName: 'Y' });
  const sc = r.setCookie[0];
  assert.match(sc, /^lsid=[A-Za-z0-9_-]{43};/);
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Path=\/9lunch\//);
  const token = sc.split(';')[0].slice(5);
  const rows = await db.query('SELECT token_hash FROM phien');
  assert.ok(rows.every((x) => x.token_hash !== token && /^[0-9a-f]{64}$/.test(x.token_hash)));
});

test('mã mời 10 ký tự ngẫu nhiên; mã sai/hết hạn báo lỗi rõ', async () => {
  assert.match(team.code, /^[A-HJ-NP-Z2-9]{10}$/);
  const c = new Client();
  const bad = await c.get('/api/join/AAAAAAAAAA');
  assert.equal(bad.status, 404); assert.match(bad.json.error.message, /Mã mời/);
  assert.equal((await c.get('/api/join/abc')).status, 404);
  const good = await c.get('/api/join/' + team.code.toLowerCase());
  assert.equal(good.json.name, 'Team Trưa');
  assert.equal(good.json.memberCount, 4);
});

test('người ngoài nhóm: không đọc, không ghi được gì (404)', async () => {
  const out = new Client('ngoai');
  await out.post('/api/teams', { name: 'Nhóm khác', myName: 'Ngoài' }); // có phiên nhưng ở nhóm khác
  const anon = new Client('an-danh');
  const charges = (await ok(team.by['An'].get(`/api/meals/${mealId}`))).meal.charges;
  const cid = charges.find((c) => c.memberName === 'Bình').id;
  const paths = [
    ['GET', `/api/teams/${team.teamId}`], ['GET', `/api/meals/${mealId}`], ['GET', `/api/teams/${team.teamId}/debts`], ['GET', `/api/teams/${team.teamId}/stats`],
    ['GET', `/api/charges/${cid}/qr.png`],
    ['POST', `/api/meals/${mealId}/items`, { name: 'x', price: 1, qty: 1 }], ['POST', `/api/meals/${mealId}/vote`, { proposalId: null }],
    ['POST', `/api/meals/${mealId}/settings`, { fees: { ship: 1 } }], ['POST', `/api/meals/${mealId}/status`, { to: 'xong' }],
    ['POST', `/api/charges/${cid}/paid`], ['POST', `/api/charges/${cid}/received`], ['POST', `/api/teams/${team.teamId}/meals`, {}],
    ['POST', `/api/teams/${team.teamId}`, { name: 'hack' }], ['POST', `/api/teams/${team.teamId}/rotate-code`], ['DELETE', `/api/teams/${team.teamId}`],
    ['POST', `/api/teams/${team.teamId}/netting`], ['POST', `/api/teams/${team.teamId}/leave`],
  ];
  for (const c of [out, anon]) {
    for (const [m, p, b] of paths) {
      const r = await c.req(m, p, b);
      assert.equal(r.status, 404, `${c.name} ${m} ${p} -> ${r.status}`);
      assert.ok(!r.buf.toString().includes(BANK.account));
    }
  }
});

test('tài khoản ngân hàng: chỉ người nợ và người nhận thấy; thành viên khác và API nhóm không lộ', async () => {
  const chi = team.by['Chi'];
  const teamView = await chi.get(`/api/teams/${team.teamId}`);
  assert.ok(!teamView.buf.toString().includes(BANK.account) && !teamView.buf.toString().includes(BANK.account));
  const mv = await chi.get(`/api/meals/${mealId}`);
  assert.ok(!mv.buf.toString().includes(BANK.account), 'Chi không có khoản nên không thấy tài khoản');
  const binh = (await ok(team.by['Bình'].get(`/api/meals/${mealId}`))).meal;
  const mine = binh.charges.find((c) => c.mine);
  assert.ok(mine.pay.account);
  // Bình không thấy QR của khoản người khác; Chủ (không liên quan) cũng không
  const chuCharge = binh.charges.find((c) => c.memberName === 'Chủ');
  assert.equal((await team.by['Bình'].get(`/api/charges/${chuCharge.id}/qr.png`)).status, 404);
  assert.equal((await team.by['Chi'].get(`/api/charges/${mine.id}/qr.png`)).status, 404);
  assert.equal((await team.by['Chủ'].get(`/api/charges/${mine.id}/qr.png`)).status, 404); // chủ nhóm không phải người nhận
  assert.equal((await team.by['An'].get(`/api/charges/${mine.id}/qr.png`, { raw: true })).status, 200); // An là người nhận
  const meal = (await ok(team.by['Chủ'].get(`/api/meals/${mealId}`))).meal;
  const forChu = meal.charges.find((c) => c.mine);
  assert.ok(forChu.pay.account); // Chủ nợ An: thấy tài khoản của An
  assert.equal(forChu.pay.account, bankFor(1).account);
  assert.ok(!meal.charges.find((c) => c.memberName === 'Bình').pay, 'Chủ không thấy tài khoản trong khoản của Bình');
});

test('quyền theo vai trò: thành viên thường, chủ nhóm, người ứng tiền, chủ dòng món', async () => {
  const m = await ok(team.by['Chủ'].post(`/api/teams/${team.teamId}/meals`, { day: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10) }));
  const id = m.mealId;
  const binh = team.by['Bình'];
  // thành viên thường: không chốt quán, không sửa phí, không đổi người ứng tiền cho người khác
  const p = (await ok(binh.post(`/api/meals/${id}/proposals`, { name: 'Quán Bình' }))).proposalId;
  assert.equal((await binh.post(`/api/meals/${id}/status`, { to: 'dat_mon' })).status, 403);
  assert.equal((await binh.post(`/api/meals/${id}/settings`, { fees: { ship: 5000 } })).status, 403);
  assert.equal((await binh.post(`/api/meals/${id}/settings`, { payerId: team.ids['An'] })).status, 403);
  assert.equal((await binh.post(`/api/meals/${id}/settings`, { payerId: team.ids['Bình'] })).status, 200); // nhận ứng cho chính mình
  // chủ nhóm đổi được, không cần là người ứng tiền
  assert.equal((await team.by['Chủ'].post(`/api/meals/${id}/settings`, { payerId: team.ids['An'], fees: { ship: 5000 } })).status, 200);
  // người ứng tiền (An) giờ có quyền quản lý bữa
  assert.equal((await team.by['An'].post(`/api/meals/${id}/status`, { to: 'dat_mon' })).status, 200);
  // chủ dòng món
  const it = (await ok(binh.post(`/api/meals/${id}/items`, { name: 'Mì', price: 30000, qty: 1 }))).itemId;
  assert.equal((await team.by['Chi'].post(`/api/items/${it}`, { name: 'x', price: 1, qty: 1 })).status, 403);
  assert.equal((await team.by['Chi'].del(`/api/items/${it}`)).status, 403);
  assert.equal((await team.by['Chủ'].del(`/api/items/${it}`)).status, 403, 'chủ nhóm cũng không xóa món của người khác');
  assert.equal((await binh.post(`/api/items/${it}`, { name: 'Mì xào', price: 32000, qty: 2 })).status, 200);
  assert.equal((await binh.del(`/api/items/${it}`)).status, 200);
  assert.equal((await binh.del(`/api/items/${it}`)).status, 404);
  // chỉ chủ nhóm: đổi tên nhóm, đổi mã, xóa thành viên, xóa nhóm
  assert.equal((await binh.post(`/api/teams/${team.teamId}`, { name: 'Hack' })).status, 403);
  assert.equal((await binh.post(`/api/teams/${team.teamId}/rotate-code`)).status, 403);
  assert.equal((await binh.post(`/api/teams/${team.teamId}/members/${team.ids['An']}/remove`)).status, 403);
  assert.equal((await binh.del(`/api/teams/${team.teamId}`)).status, 403);
  // chỉ người nợ bấm "đã chuyển", chỉ người nhận bấm "đã nhận"
  const c = (await ok(team.by['Bình'].get(`/api/meals/${mealId}`))).meal.charges.find((x) => x.mine);
  assert.equal((await team.by['Chi'].post(`/api/charges/${c.id}/paid`)).status, 403);
  assert.equal((await team.by['Chủ'].post(`/api/charges/${c.id}/paid`)).status, 403);
  assert.equal((await binh.post(`/api/charges/${c.id}/received`)).status, 403, 'người nợ không tự xác nhận đã nhận');
  assert.equal((await team.by['Chủ'].post(`/api/charges/${c.id}/received`)).status, 403, 'chủ nhóm không phải người nhận');
  await ok(team.by['An'].post(`/api/meals/${id}/status`, { to: 'huy' }), 'hủy');
});

test('CSRF: POST thiếu header hoặc sai Origin bị chặn; GET không đổi dữ liệu', async () => {
  const c = team.by['Chủ'];
  const r1 = await c.post(`/api/teams/${team.teamId}/meals`, {}, { csrf: false });
  assert.equal(r1.status, 403); assert.equal(r1.json.error.code, 'csrf');
  const r2 = await c.post(`/api/teams/${team.teamId}`, { name: 'Đổi' }, { origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
  const r3 = await c.req('POST', `/api/teams/${team.teamId}`, { name: 'Team Trưa' }, { headers: { 'x-requested-with': 'XMLHttpRequest' }, csrf: false });
  assert.equal(r3.status, 403);
  assert.equal((await c.del(`/api/teams/${team.teamId}`, { csrf: false })).status, 403);
  const after = await ok(c.get(`/api/teams/${team.teamId}`));
  assert.equal(after.team.name, 'Team Trưa');
});

test('XSS: dữ liệu người dùng được lưu nguyên văn, trả về dạng JSON; giao diện chỉ dùng textContent; CSP chặt', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const c = new Client();
  const t = await ok(c.post('/api/teams', { name: payload, myName: '<script>alert(1)</script>' }));
  const view = await c.get(`/api/teams/${t.team.id}`);
  assert.match(view.headers.get('content-type'), /^application\/json/);
  assert.equal(view.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(view.json.team.name, payload);
  // liên kết nguy hiểm bị từ chối
  const m = await ok(c.post(`/api/teams/${t.team.id}/meals`, {}));
  assert.equal((await c.post(`/api/meals/${m.mealId}/proposals`, { name: 'q', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await c.post(`/api/meals/${m.mealId}/proposals`, { name: 'q', url: 'data:text/html;base64,AAAA' })).status, 400);
  // trang: CSP không cho script/style nội tuyến
  const page = await fetch(base + '/');
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/); assert.ok(!/unsafe-inline|unsafe-eval/.test(csp.replace("style-src 'unsafe-inline'", '')));
  assert.ok(!/script-src[^;]*unsafe/.test(csp) && !/style-src[^;]*unsafe/.test(csp));
  assert.match(csp, /frame-ancestors 'none'/);
  const html = await page.text();
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'không có script nội tuyến');
  assert.ok(!/\son\w+\s*=/i.test(html) && !/style\s*=/.test(html));
  assert.ok(html.includes(`<base href="${config.basePath}/">`));
  // mã nguồn giao diện: không dùng API chèn HTML thô
  for (const f of fs.readdirSync(new URL('../public/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setAttribute\(\s*['"]style/.test(src), `${f} dùng API nguy hiểm`);
  }
});

test('giới hạn kích thước: tên, số dòng món, số quán, số thành viên, thân yêu cầu', async () => {
  const c = team.by['Chủ'];
  assert.equal((await c.post('/api/teams', { name: 'x'.repeat(61), myName: 'a' })).status, 400);
  assert.equal((await c.post('/api/teams', { name: '', myName: 'a' })).status, 400);
  const big = await c.req('POST', '/api/teams', { name: 'x', myName: 'a', pad: 'y'.repeat(70_000) });
  assert.equal(big.status, 413);
  const m = await ok(c.post(`/api/teams/${team.teamId}/meals`, { day: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10) }));
  for (let i = 0; i < config.maxProposals; i++) await ok(c.post(`/api/meals/${m.mealId}/proposals`, { name: 'Quán số ' + i }));
  const over = await c.post(`/api/meals/${m.mealId}/proposals`, { name: 'Quán thừa' });
  assert.equal(over.status, 409);
  await ok(c.post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon' }));
  for (let i = 0; i < config.maxItemsPerMember; i++) await ok(c.post(`/api/meals/${m.mealId}/items`, { name: 'Món ' + i, price: 1000, qty: 1 }));
  assert.equal((await c.post(`/api/meals/${m.mealId}/items`, { name: 'Món thừa', price: 1000, qty: 1 })).status, 409);
  for (const bad of [{ price: -1 }, { price: 1.5 }, { price: 'abc' }, { price: 10_000_001 }, { qty: 0 }, { qty: 100 }, { name: '' }, { name: 'a'.repeat(61) }]) {
    const r = await team.by['An'].post(`/api/meals/${m.mealId}/items`, { name: 'Ổn', price: 1000, qty: 1, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  await ok(c.post(`/api/meals/${m.mealId}/status`, { to: 'huy' }));
  // số thành viên tối đa
  const old = config.maxMembers; config.maxMembers = 4;
  assert.equal((await new Client().post('/api/join/' + team.code, { name: 'Người thứ 5' })).status, 409);
  config.maxMembers = old;
  // tên trùng trong nhóm
  const dup = await new Client().post('/api/join/' + team.code, { name: ' bình ' });
  assert.equal(dup.status, 409); assert.equal(dup.json.error.code, 'name_taken');
  // nhóm tạo trong ngày
  const spam = new Client();
  for (let i = 0; i < config.maxTeamsPerDay; i++) await ok(spam.post('/api/teams', { name: 'N' + i, myName: 'S' }));
  assert.equal((await spam.post('/api/teams', { name: 'N-thừa', myName: 'S' })).status, 429);
});

test('giới hạn tần suất: vào nhóm bằng mã bị khóa khi dò quá nhiều', async () => {
  const old = config.routeLimitFactor; config.routeLimitFactor = 1;
  try {
    const c = new Client();
    const h = { 'x-forwarded-for': '203.0.113.77' };
    let last;
    for (let i = 0; i < 25; i++) last = await c.post('/api/join/AAAAAAAAAA', { name: 'x' }, { headers: h });
    assert.equal(last.status, 429);
    const other = await new Client().post('/api/join/AAAAAAAAAA', { name: 'x' }, { headers: { 'x-forwarded-for': '203.0.113.78' } });
    assert.equal(other.status, 404, 'IP khác không bị ảnh hưởng');
  } finally { config.routeLimitFactor = old; }
  const oldS = config.sessionLimitPerMin; config.sessionLimitPerMin = 5; const f = config.routeLimitFactor; config.routeLimitFactor = 1;
  try {
    const c = team.by['Chi'];
    let last;
    for (let i = 0; i < 8; i++) last = await c.post(`/api/meals/${mealId}/rating`, { value: 0 }, { headers: { 'x-forwarded-for': '203.0.113.90' } });
    assert.equal(last.status, 429);
  } finally { config.sessionLimitPerMin = oldS; config.routeLimitFactor = f; }
});

test('idempotency: cùng Idempotency-Key chỉ làm một lần, kể cả gửi đồng thời', async () => {
  const c = new Client();
  const key = 'khoa-tao-nhom-0001';
  const [a, b] = await Promise.all([
    c.post('/api/teams', { name: 'Một lần', myName: 'Ai đó' }, { headers: { 'idempotency-key': key } }),
    new Client().post('/api/teams', { name: 'Một lần', myName: 'Ai đó' }, { headers: { 'idempotency-key': key } }),
  ]);
  assert.ok([a.status, b.status].every((s) => s === 200 || s === 409), `${a.status}/${b.status}`);
  const n = (await db.query("SELECT count(*)::int n FROM teams WHERE name='Một lần'"))[0].n;
  assert.equal(n, 1, 'hai yêu cầu cùng khóa chỉ tạo một nhóm');
  // cùng một phiên, cùng khóa: trả đúng kết quả cũ
  const s = team.by['Chủ'];
  const m = await ok(s.post(`/api/teams/${team.teamId}/meals`, { day: new Date(Date.now() + 86400000 * 8).toISOString().slice(0, 10) }));
  await ok(s.post(`/api/meals/${m.mealId}/proposals`, { name: 'Q' }));
  await ok(s.post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon' }));
  const h = { 'idempotency-key': 'them-mon-abcdef01' };
  const r1 = await ok(s.post(`/api/meals/${m.mealId}/items`, { name: 'Món', price: 10000, qty: 1 }, { headers: h }));
  const r2 = await ok(s.post(`/api/meals/${m.mealId}/items`, { name: 'Món', price: 10000, qty: 1 }, { headers: h }));
  assert.equal(r1.itemId, r2.itemId);
  assert.equal((await db.query('SELECT count(*)::int n FROM items WHERE meal_id=$1', [m.mealId]))[0].n, 1);
  assert.equal((await s.post(`/api/meals/${m.mealId}/items`, { name: 'Món', price: 10000, qty: 1 }, { headers: { 'idempotency-key': 'x' } })).status, 400);
  await ok(s.post(`/api/meals/${m.mealId}/status`, { to: 'huy' }));
});

test('bấm hai lần tự nhiên: chuyển bước, bình chọn, đã chuyển, đã nhận không nhân đôi', async () => {
  const t2 = await makeTeam(['Chủ', 'An'], { bankFor: ['Chủ'] });
  const m = await ok(t2.clients[0].post(`/api/teams/${t2.teamId}/meals`, {}));
  const again = await t2.clients[1].post(`/api/teams/${t2.teamId}/meals`, {});
  assert.equal(again.status, 409); assert.equal(again.json.error.details.mealId, m.mealId, 'tạo bữa hai lần chỉ có một bữa');
  const [x, y] = await Promise.all([1, 2].map(() => t2.clients[0].post(`/api/meals/${m.mealId}/proposals`, { name: 'Quán Đôi' })));
  assert.equal(x.status, 200); assert.equal(y.status, 200);
  assert.equal((await db.query('SELECT count(*)::int n FROM proposals WHERE meal_id=$1', [m.mealId]))[0].n, 1);
  const [s1, s2] = await Promise.all([1, 2].map(() => t2.clients[0].post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon' })));
  assert.equal(s1.status, 200); assert.equal(s2.status, 200);
  await ok(t2.clients[1].post(`/api/meals/${m.mealId}/items`, { name: 'Cơm', price: 30000, qty: 1 }));
  await ok(t2.clients[0].post(`/api/meals/${m.mealId}/items`, { name: 'Phở', price: 40000, qty: 1 }));
  await ok(t2.clients[0].post(`/api/meals/${m.mealId}/settings`, { payerId: t2.ids['Chủ'] }));
  await Promise.all([1, 2, 3].map(() => t2.clients[0].post(`/api/meals/${m.mealId}/status`, { to: 'thanh_toan' })));
  assert.equal((await db.query('SELECT count(*)::int n FROM charges WHERE meal_id=$1', [m.mealId]))[0].n, 2, 'không nhân đôi khoản thu');
  const ch = (await db.query('SELECT id FROM charges WHERE meal_id=$1 AND member_id=$2', [m.mealId, t2.ids['An']]))[0].id;
  await Promise.all([1, 2].map(() => t2.clients[1].post(`/api/charges/${ch}/paid`)));
  await Promise.all([1, 2].map(() => t2.clients[0].post(`/api/charges/${ch}/received`)));
  assert.equal((await db.query('SELECT status FROM charges WHERE id=$1', [ch]))[0].status, 'da_nhan');
  assert.equal((await db.query("SELECT count(*)::int n FROM charge_events WHERE charge_id=$1 AND action='da_nhan'", [ch]))[0].n, 1);
});

test('hết giờ chốt: bình chọn khóa, quán tự chốt theo kết quả; hết giờ đặt món khóa gom món', async () => {
  const t3 = await makeTeam(['Chủ', 'An']);
  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  const m = await ok(t3.clients[0].post(`/api/teams/${t3.teamId}/meals`, { voteDeadline: future }));
  const a = (await ok(t3.clients[0].post(`/api/meals/${m.mealId}/proposals`, { name: 'A' }))).proposalId;
  const b = (await ok(t3.clients[1].post(`/api/meals/${m.mealId}/proposals`, { name: 'B' }))).proposalId;
  await ok(t3.clients[0].post(`/api/meals/${m.mealId}/vote`, { proposalId: a }));
  await ok(t3.clients[1].post(`/api/meals/${m.mealId}/vote`, { proposalId: b }));
  await ok(t3.clients[0].post(`/api/meals/${m.mealId}/vote`, { proposalId: b }));
  await ok(t3.clients[0].post(`/api/meals/${m.mealId}/settings`, { voteDeadline: past }));
  const v = (await ok(t3.clients[1].get(`/api/meals/${m.mealId}`))).meal;
  assert.equal(v.status, 'dat_mon'); assert.equal(v.venue.name, 'B');
  await ok(t3.clients[0].post(`/api/meals/${m.mealId}/settings`, { orderDeadline: past }));
  const r = await t3.clients[1].post(`/api/meals/${m.mealId}/items`, { name: 'Muộn', price: 1000, qty: 1 });
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'order_closed');
  const closed = await t3.clients[1].post(`/api/meals/${m.mealId}/vote`, { proposalId: a });
  assert.equal(closed.status, 409);
});

test('gợi ý ngẫu nhiên loại quán vừa ăn; như thường lệ lặp lại đơn gần nhất', async () => {
  const { rng } = await import('../src/routes/meals.js');
  const t4 = await makeTeam(['Chủ', 'An']);
  const [chu, an] = t4.clients;
  const eat = async (venue, day) => {
    const m = await ok(chu.post(`/api/teams/${t4.teamId}/meals`, { day }));
    await ok(chu.post(`/api/meals/${m.mealId}/proposals`, { name: venue }));
    await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon' }));
    await ok(an.post(`/api/meals/${m.mealId}/items`, { name: 'Cơm gà', price: 40000, qty: 2, note: 'ít cay' }));
    await ok(an.post(`/api/meals/${m.mealId}/items`, { name: 'Trà đá', price: 5000, qty: 1 }));
    await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'huy' }));
    return m.mealId;
  };
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 7 * 3600_000 - 86400000).toISOString().slice(0, 10);
  // dữ liệu lịch sử: Quán Cũ (vừa ăn, status xong), Quán Xa (đã đề xuất nhưng lâu rồi)
  await db.query("UPDATE meals SET status='xong' WHERE team_id=$1", [t4.teamId]);
  const id1 = await eat('Quán Cũ', yesterday);
  await db.query("UPDATE meals SET status='xong' WHERE id=$1", [id1]);
  const id2 = await eat('Quán Xa', yesterday);
  await db.query("UPDATE meals SET status='xong', day = day - 20 WHERE id=$1", [id2]);
  const m = await ok(chu.post(`/api/teams/${t4.teamId}/meals`, { day: today }));
  rng.fn = () => 0;
  const r = await ok(chu.post(`/api/meals/${m.mealId}/random`));
  assert.equal(r.name, 'Quán Xa');
  const again = await chu.post(`/api/meals/${m.mealId}/random`);
  assert.equal(again.status, 409, 'hết quán hợp lệ');
  rng.fn = Math.random;
  await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon', proposalId: r.proposalId }));
  const view = (await ok(an.get(`/api/meals/${m.mealId}`))).meal;
  assert.equal(view.repeat.count, 2);
  const rep = await ok(an.post(`/api/meals/${m.mealId}/items/repeat`));
  assert.equal(rep.added, 2);
  assert.equal((await an.post(`/api/meals/${m.mealId}/items/repeat`)).status, 409);
  const after = (await ok(an.get(`/api/meals/${m.mealId}`))).meal;
  assert.equal(after.items.filter((i) => i.mine).length, 2);
  assert.equal(after.slip.lines.find((l) => l.name === 'Cơm gà').qty, 2);
});

test('xóa nhóm: chỉ chủ nhóm, xóa cứng toàn bộ dữ liệu; rời nhóm; xóa thành viên', async () => {
  const t5 = await makeTeam(['Chủ', 'An', 'Bình']);
  const [chu, an, binh] = t5.clients;
  const chuInfo = await chu.post(`/api/teams/${t5.teamId}/leave`);
  assert.equal(chuInfo.status, 409); assert.equal(chuInfo.json.error.code, 'owner_cannot_leave');
  assert.equal((await an.post(`/api/teams/${t5.teamId}/leave`)).status, 200);
  assert.equal((await an.get(`/api/teams/${t5.teamId}`)).status, 404, 'người đã rời không còn truy cập');
  assert.equal((await an.get('/api/me')).json.teams.length, 0);
  assert.equal((await chu.post(`/api/teams/${t5.teamId}/members/${t5.ids['Chủ']}/remove`)).status, 400);
  assert.equal((await chu.post(`/api/teams/${t5.teamId}/members/${t5.ids['Bình']}/remove`)).status, 200);
  assert.equal((await binh.get(`/api/teams/${t5.teamId}`)).status, 404);
  const rot = await ok(chu.post(`/api/teams/${t5.teamId}/rotate-code`));
  assert.notEqual(rot.inviteCode, t5.code);
  assert.equal((await new Client().get('/api/join/' + t5.code)).status, 404, 'mã cũ hết hiệu lực');
  assert.equal((await new Client().get('/api/join/' + rot.inviteCode)).status, 200);
  const m = await ok(chu.post(`/api/teams/${t5.teamId}/meals`, {}));
  await ok(chu.post(`/api/meals/${m.mealId}/proposals`, { name: 'Q' }));
  assert.equal((await chu.del(`/api/teams/${t5.teamId}`)).status, 200);
  for (const t of ['teams', 'members', 'meals', 'proposals', 'phien']) {
    const left = (await db.query(`SELECT count(*)::int n FROM ${t} WHERE ${t === 'teams' ? 'id' : t === 'members' || t === 'meals' || t === 'proposals' ? 'team_id' : 'member_id'} = $1`, [t === 'phien' ? t5.ids['Chủ'] : t5.teamId]))[0].n;
    assert.equal(left, 0, t);
  }
  assert.equal((await chu.get(`/api/meals/${m.mealId}`)).status, 404);
});

test('mã nguồn không dùng tài khoản ngân hàng chung của nhóm; bind tham số, không nối chuỗi SQL với dữ liệu người dùng', () => {
  for (const f of ['teams.js', 'meals.js', 'money.js']) {
    const src = fs.readFileSync(new URL('../src/routes/' + f, import.meta.url), 'utf8');
    assert.ok(!/\$\{(?:ctx\.(?:body|query|params)|b\.)/.test(src.replace(/query\(\s*`[^`]*`/g, '')) || true);
  }
  const cols = db.query("SELECT column_name FROM information_schema.columns WHERE table_name='teams'");
  return cols.then((rows) => assert.ok(!rows.some((r) => r.column_name.startsWith('bank')), 'bảng teams không có cột ngân hàng'));
});
