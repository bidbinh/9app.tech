// Các lỗi do người phản biện độc lập tìm ra: mỗi test tái hiện lỗi trước khi sửa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { boot, shutdown, makeTeam, mealToPayment, ok, db, Client, config, base, bankFor } from './helper.js';

before(boot);
after(shutdown);

const meal = async (c, id) => (await ok(c.get(`/api/meals/${id}`))).meal;
const rows = (sql, p) => db.query(sql, p);
const chargeOf = (v, name) => v.charges.find((c) => c.memberName === name);
const fut = (d) => new Date(Date.now() + 7 * 3600_000 + d * 86400000).toISOString().slice(0, 10);

test('CAO 1: sau thu tiền thành viên thường không tự kéo khoản về tài khoản mình; trước đó chỉ nhận ứng khi bữa chưa có ai', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình', 'Chi'], { bankFor: ['Chủ', 'An', 'Bình', 'Chi'] });
  const [chu, an, binh, chi] = t.clients;
  const id = await mealToPayment(t, { payer: 'Chủ', orders: { An: [['x', 30000, 1]], Bình: [['x', 40000, 1]], Chi: [['x', 50000, 1]] } });
  const before = await rows('SELECT id, payee_id, status, qr_gen FROM charges WHERE meal_id=$1 ORDER BY id', [id]);
  const r = await binh.post(`/api/meals/${id}/settings`, { payerId: t.ids['Bình'] });
  assert.equal(r.status, 403);
  assert.equal((await chi.post(`/api/meals/${id}/settings`, { payerId: t.ids['Chi'] })).status, 403);
  assert.equal((await binh.post(`/api/meals/${id}/settings`, { payerId: t.ids['An'] })).status, 403);
  assert.deepEqual(await rows('SELECT id, payee_id, status, qr_gen FROM charges WHERE meal_id=$1 ORDER BY id', [id]), before, 'không khoản nào bị đổi');
  // người tạo bữa (chủ nhóm) và người ứng hiện tại được đổi
  assert.equal((await chu.post(`/api/meals/${id}/settings`, { payerId: t.ids['An'] })).status, 200);
  const v = await meal(binh, id);
  assert.equal(v.payerChange.fromName, 'Chủ'); assert.equal(v.payerChange.toName, 'An');
  assert.equal((await an.post(`/api/meals/${id}/settings`, { payerId: t.ids['Chi'] })).status, 200, 'người ứng hiện tại được đổi');
  assert.equal((await meal(chu, id)).payerChange.toName, 'Chi');

  // trước thu tiền: chỉ tự nhận khi bữa chưa có người ứng và người chốt
  const m = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' }))).mealId;
  await ok(chu.post(`/api/meals/${m}/proposals`, { name: 'Q' }));
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
  assert.equal((await ok(binh.post(`/api/meals/${m}/settings`, { ordererId: t.ids['Bình'] }))).meal.orderer.name, 'Bình');
  assert.equal((await an.post(`/api/meals/${m}/settings`, { ordererId: t.ids['An'] })).status, 403, 'đã có người chốt đơn thì không giành');
  assert.equal((await an.post(`/api/meals/${m}/settings`, { payerId: t.ids['An'] })).status, 200, 'bữa chưa có người ứng thì tự nhận được');
  assert.equal((await chi.post(`/api/meals/${m}/settings`, { payerId: t.ids['Chi'] })).status, 403, 'đã có người ứng thì không giành');
  const m2 = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'sang' }))).mealId;
  await ok(an.post(`/api/meals/${m2}/settings`, { payerId: t.ids['An'] }));
  assert.equal((await binh.post(`/api/meals/${m2}/settings`, { ordererId: t.ids['Bình'] })).status, 403, 'đã có người ứng (là người chốt mặc định)');
});

test('TRUNG BÌNH 2: người ứng/người chốt rời nhóm khi bữa chưa thu tiền thì bữa không kẹt', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình'], { bankFor: ['Chủ', 'An'] });
  const [chu, an, binh] = t.clients;
  const m = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, {}))).mealId;
  await ok(chu.post(`/api/meals/${m}/proposals`, { name: 'Q' }));
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
  await ok(an.post(`/api/meals/${m}/settings`, { payerId: t.ids['An'] }));
  await ok(chu.post(`/api/meals/${m}/settings`, { ordererId: t.ids['An'] }));
  await ok(an.post(`/api/meals/${m}/items`, { name: 'x', price: 1000, qty: 1 }));
  await ok(binh.post(`/api/meals/${m}/items`, { name: 'y', price: 2000, qty: 1 }));
  await ok(an.post(`/api/teams/${t.teamId}/leave`));
  const row = (await rows('SELECT payer_id, orderer_id FROM meals WHERE id=$1', [m]))[0];
  assert.equal(row.payer_id, null); assert.equal(row.orderer_id, null);
  const v = await meal(binh, m);
  assert.equal(v.payer, null); assert.equal(v.orderer, null);
  assert.ok(!v.items.some((i) => i.memberName === 'An'));
  // chọn lại người ứng rồi vẫn đi tiếp được
  await ok(chu.post(`/api/meals/${m}/settings`, { payerId: t.ids['Chủ'] }));
  assert.equal((await meal(chu, m)).orderer.name, 'Chủ');
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'thanh_toan' }));
});

test('3: hai khoản nợ bù nhau đúng bằng 0 vẫn bù trừ được, khoản gốc đánh dấu thanh toán qua bù trừ', async () => {
  const t = await makeTeam(['A', 'B'], { bankFor: ['A', 'B'] });
  const [a, b] = t.clients;
  await mealToPayment(t, { payer: 'B', venue: 'Q1', orders: { A: [['x', 10000, 1]] } });
  await mealToPayment(t, { payer: 'A', venue: 'Q2', orders: { B: [['x', 10000, 1]] } });
  let d = await ok(a.get(`/api/teams/${t.teamId}/debts`));
  assert.equal(d.items.length, 2); assert.deepEqual(d.suggestions, []);
  const r = await ok(a.post(`/api/teams/${t.teamId}/netting`));
  assert.equal(r.done, true);
  d = await ok(b.get(`/api/teams/${t.teamId}/debts`));
  assert.equal(d.items.length, 0); assert.equal(d.netting, null);
  assert.equal((await rows("SELECT count(*)::int n FROM charges c JOIN meals m ON m.id=c.meal_id WHERE m.team_id=$1 AND c.settled_by_netting AND c.status='da_nhan'", [t.teamId]))[0].n, 2);
  assert.equal((await rows("SELECT count(*)::int n FROM charge_events WHERE team_id=$1 AND action='da_nhan_bu_tru'", [t.teamId]))[0].n, 2);
  assert.equal((await rows("SELECT status FROM nettings WHERE team_id=$1", [t.teamId]))[0].status, 'xong');
  assert.equal((await a.post(`/api/teams/${t.teamId}/netting`)).json.error.code, 'nothing_to_net');
});

test('4: xem trước và chạy thật dùng cùng điều kiện: khoản đã báo chuyển nằm riêng "đang chờ xác nhận"', async () => {
  const t = await makeTeam(['A', 'B', 'C'], { bankFor: ['A', 'B', 'C'] });
  const [a, b, c] = t.clients;
  const id = await mealToPayment(t, { payer: 'A', orders: { B: [['x', 30000, 1]], C: [['x', 20000, 1]] } });
  await ok(b.post(`/api/charges/${chargeOf(await meal(b, id), 'B').id}/paid`));
  const d = await ok(a.get(`/api/teams/${t.teamId}/debts`));
  assert.deepEqual(d.suggestions.map((s) => [s.fromName, s.toName, s.amount]), [['C', 'A', 20000]]);
  assert.deepEqual(d.waiting.map((s) => [s.fromName, s.toName, s.amount]), [['B', 'A', 30000]]);
  assert.deepEqual(d.pairs.map((s) => [s.fromName, s.amount]), [['C', 20000]]);
  await ok(a.post(`/api/teams/${t.teamId}/netting`));
  const n = (await ok(a.get(`/api/teams/${t.teamId}/debts`))).netting;
  assert.deepEqual(n.transfers.map((s) => [s.fromName, s.toName, s.amount]), d.suggestions.map((s) => [s.fromName, s.toName, s.amount]));
});

test('6: lỗi ở kết nối nhàn rỗi của pool chỉ ghi log, không sập tiến trình', () => {
  assert.doesNotThrow(() => db.getPool().emit('error', new Error('mất kết nối nhàn rỗi (thử nghiệm)')));
});

test('7: production thiếu DATABASE_URL hoặc dùng chuỗi mặc định thì báo lỗi', async () => {
  const { productionProblems } = await import('../src/config.js');
  assert.deepEqual(productionProblems({ production: false }), []);
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: false, databaseUrl: 'postgres://postgres:ship@localhost:5440/lunch' }).length, 1);
  assert.match(productionProblems({ production: true, databaseUrlFromEnv: false })[0], /DATABASE_URL/);
  assert.deepEqual(productionProblems({ production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://u:p@db:5432/lunch' }), []);
});

test('thấp (a): link mời có dấu / cuối vẫn mở được trang', async () => {
  const r = await fetch(`${base}/t/ABCDEFGHJK/`);
  assert.equal(r.status, 200); assert.match(await r.text(), /<base href=/);
  assert.equal((await fetch(`${base}/t/ABCDEFGHJK`)).status, 200);
});

test('thấp (c): ghi chú dòng món tới 160 ký tự', async () => {
  const t = await makeTeam(['Chủ']);
  const c = t.clients[0];
  const m = (await ok(c.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' }))).mealId;
  await ok(c.post(`/api/meals/${m}/proposals`, { name: 'Q' }));
  await ok(c.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
  await ok(c.post(`/api/meals/${m}/items`, { name: 'x', price: 1, qty: 1, note: 'a'.repeat(160) }));
  assert.equal((await c.post(`/api/meals/${m}/items`, { name: 'x', price: 1, qty: 1, note: 'a'.repeat(161) })).status, 400);
});

test('thấp (e): giờ chốt chỉ nhận ngày giờ đầy đủ', async () => {
  const t = await makeTeam(['Chủ']);
  const c = t.clients[0];
  const m = (await ok(c.post(`/api/teams/${t.teamId}/meals`, {}))).mealId;
  for (const bad of ['1', '2026', '2026-10-04', 'abc', '12:30', 5]) {
    assert.equal((await c.post(`/api/meals/${m}/settings`, { voteDeadline: bad })).status, 400, String(bad));
  }
  assert.equal((await c.post(`/api/meals/${m}/settings`, { voteDeadline: new Date(Date.now() + 3600e3).toISOString() })).status, 200);
  assert.equal((await c.post(`/api/meals/${m}/settings`, { orderDeadline: '2030-01-01T11:30:00+07:00' })).status, 200);
  assert.equal((await c.post(`/api/meals/${m}/settings`, { voteDeadline: null })).status, 200);
  assert.equal((await c.post(`/api/teams/${t.teamId}/meals`, { voteDeadline: '1', kind: 'sang' })).status, 400);
});

test('thấp (f): giới hạn số bữa mỗi nhóm mỗi ngày, số bữa đang mở, số nhóm mới mỗi IP mỗi giờ', async () => {
  const t = await makeTeam(['Chủ']);
  const c = t.clients[0];
  const old = [config.maxMealsPerDay, config.maxOpenMeals];
  config.maxMealsPerDay = 2;
  try {
    await ok(c.post(`/api/teams/${t.teamId}/meals`, { kind: 'trua' }));
    await ok(c.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' }));
    const r = await c.post(`/api/teams/${t.teamId}/meals`, { kind: 'sang' });
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'too_many_meals');
    config.maxMealsPerDay = 30; config.maxOpenMeals = 2;
    const r2 = await c.post(`/api/teams/${t.teamId}/meals`, { kind: 'sang' });
    assert.equal(r2.status, 429);
  } finally { [config.maxMealsPerDay, config.maxOpenMeals] = old; }
  const oldIp = config.maxTeamsPerIpHour; config.maxTeamsPerIpHour = 3;
  try {
    const h = { 'x-forwarded-for': '198.51.100.9' };
    for (let i = 0; i < 3; i++) await ok(new Client().post('/api/teams', { name: 'N' + i, myName: 'u' }, { headers: h }));
    assert.equal((await new Client().post('/api/teams', { name: 'N4', myName: 'u' }, { headers: h })).status, 429);
    await ok(new Client().post('/api/teams', { name: 'N5', myName: 'u' }, { headers: { 'x-forwarded-for': '198.51.100.10' } }));
  } finally { config.maxTeamsPerIpHour = oldIp; }
});

test('thấp (g): cookie 90 ngày; thoát khỏi thiết bị xóa phiên ở máy chủ', async () => {
  const t = await makeTeam(['Chủ', 'An']);
  const c = new Client();
  const r = await c.post('/api/teams', { name: 'X', myName: 'Y' });
  assert.match(r.setCookie[0], /Max-Age=7776000/);
  const an = t.clients[1];
  assert.equal((await ok(an.get('/api/me'))).teams.length, 1);
  const out = await an.post('/api/logout');
  assert.equal(out.status, 200); assert.match(out.setCookie[0], /Max-Age=0/);
  const token = an.cookie;
  assert.equal((await ok(an.get('/api/me'))).teams.length, 0);
  assert.equal((await an.get(`/api/teams/${t.teamId}`)).status, 404);
  assert.equal((await rows('SELECT count(*)::int n FROM phien WHERE member_id=$1', [t.ids['An']]))[0].n, 0);
  assert.ok(token !== undefined);
  assert.equal((await t.clients[0].get(`/api/teams/${t.teamId}`)).status, 200, 'người khác không bị ảnh hưởng');
});

test('thấp (j): đọc bữa ăn không khóa hàng (không bị chặn bởi thao tác ghi đang giữ khóa)', async () => {
  const t = await makeTeam(['Chủ']);
  const c = t.clients[0];
  const m = (await ok(c.post(`/api/teams/${t.teamId}/meals`, {}))).mealId;
  const cl = await db.getPool().connect();
  try {
    await cl.query('BEGIN'); await cl.query('SELECT id FROM meals WHERE id=$1 FOR UPDATE', [m]);
    const res = await Promise.race([c.get(`/api/meals/${m}`), new Promise((r) => setTimeout(() => r('treo'), 2500))]);
    assert.notEqual(res, 'treo', 'GET bị khóa hàng chặn');
    assert.equal(res.status, 200);
  } finally { await cl.query('ROLLBACK'); cl.release(); }
});

test('thấp (l): hai bản khởi động đồng thời cùng chạy migration không đụng nhau', async () => {
  const name = 'lunch_mig_' + Date.now();
  await db.query(`CREATE DATABASE ${name}`);
  try {
    const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + name;
    const run = () => new Promise((resolve) => {
      const p = spawn(process.execPath, ['-e', "import('./src/db.js').then((m) => m.migrate().then(() => m.close())).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); })"], { env: { ...process.env, DATABASE_URL: url.href }, cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), stdio: ['ignore', 'ignore', 'pipe'] });
      let err = ''; p.stderr.on('data', (d) => { err += d; });
      p.on('exit', (code) => resolve({ code, err }));
    });
    const res = await Promise.all([run(), run(), run()]);
    assert.deepEqual(res.map((r) => r.code), [0, 0, 0], JSON.stringify(res));
  } finally { await db.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); }
});
