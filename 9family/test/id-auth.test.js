// Xác thực bằng 9id (bản GIẢ trong bộ nhớ, cùng giao diện máy khách thật): đệm 60 giây, token hết hạn/thu hồi giữa chừng, 9id lỗi,
// ràng buộc token theo từng người (app thường, không phải delegate), không rò token ra nhật ký. 9id THẬT: test/integration/.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, newUser, ok, Client, config, idmod, fake, db, clock } from './helper.js';

before(async () => { await boot({ cacheMs: 60_000 }); });
after(shutdown);
beforeEach(() => { clock.set(null); idmod.flushCaches(); fake.calls.length = 0; fake.state.down = false; config.idCacheMs = 60_000; });

const status = async (p) => (await p).status;
const verifyCalls = () => fake.calls.filter((c) => c.name === 'verify').length;

test('đệm: nhiều yêu cầu liên tiếp chỉ hỏi 9id verify một lần trong 60 giây', async () => {
  const fam = await makeFamily(['Mẹ']);
  idmod.flushCaches(); fake.calls.length = 0;
  for (let i = 0; i < 6; i++) await ok(fam.owner.get(`${fam.F}/pulse`));
  assert.equal(verifyCalls(), 1, 'verify đệm');
  assert.equal(fake.calls.filter((c) => c.name === 'members').length, 1, 'đọc gia đình cũng đệm');
  // hết hạn đệm thì hỏi lại
  config.idCacheMs = 80;
  idmod.flushCaches(); fake.calls.length = 0;
  await ok(fam.owner.get(`${fam.F}/pulse`)); await new Promise((r) => setTimeout(r, 120)); await ok(fam.owner.get(`${fam.F}/pulse`));
  assert.equal(verifyCalls(), 2);
});

test('token bị thu hồi / hết hạn giữa chừng: 401 ngay khi hết đệm; không đệm thì 401 ngay', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  await ok(fam.by['Bố'].get(`${fam.F}/pulse`));
  fam.fake.revokeSession(fam.tokens['Bố']);
  // còn trong đệm: vẫn chạy (tối đa 60 giây, theo spec 9id)
  assert.equal(await status(fam.by['Bố'].get(`${fam.F}/pulse`)), 200);
  // hết đệm: 401 chuẩn
  idmod.flushCaches();
  const r = await fam.by['Bố'].get(`${fam.F}/pulse`);
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'unauthenticated'); assert.equal(r.json.error.details.login, '/id/');
  assert.equal(await status(fam.by['Bố'].post(`${fam.F}/tasks`, { title: 'x' })), 401);
  assert.equal(await status(fam.owner.get(`${fam.F}/pulse`)), 200, 'người khác không ảnh hưởng');
  // đệm = 0: thu hồi có hiệu lực ngay
  config.idCacheMs = 0;
  await ok(fam.owner.get(`${fam.F}/pulse`));
  fam.fake.revokeSession(fam.tokens['Mẹ']);
  assert.equal(await status(fam.owner.get(`${fam.F}/pulse`)), 401);
  // tài khoản bị xóa ở 9id
  const u = await makeFamily(['Cô']);
  config.idCacheMs = 0;
  u.fake.deleteUser(u.userIds['Cô']);
  assert.equal(await status(u.owner.get(u.F)), 401);
});

test('token hợp lệ nhưng bị rút khỏi gia đình giữa chừng: 404 (không lộ), dữ liệu không đọc được nữa', async () => {
  config.idCacheMs = 0;
  const fam = await makeFamily(['Mẹ', 'Bố']);
  await addChild(fam, 'Bống');
  fam.fake.removeMember(fam.fid, fam.userIds['Bố']);
  const r = await fam.by['Bố'].get(fam.F);
  assert.equal(r.status, 404); assert.ok(!r.text.includes('Bống'));
  assert.equal(await status(fam.by['Bố'].get(`${fam.F}/today`)), 404);
});

test('9id không với tới được: 503 (không phải đăng xuất), tự khỏi khi 9id về; không làm mất dữ liệu', async () => {
  config.idCacheMs = 0;
  const fam = await makeFamily(['Mẹ']);
  fam.fake.state.down = true;
  const r = await fam.owner.get(`${fam.F}/pulse`);
  assert.equal(r.status, 503); assert.equal(r.json.error.code, 'id_unavailable');
  assert.ok(!/nine_sid|token/i.test(r.text));
  assert.equal((await fam.owner.get('/api/me')).status, 503);
  assert.equal((await fam.owner.post(`${fam.F}/tasks`, { title: 'x' })).status, 503);
  assert.equal((await new Client().get('/api/me')).status, 401, 'chưa đăng nhập vẫn là 401 (không hỏi 9id vì không có cookie)');
  assert.equal((await new Client().get('/healthz')).status, 200, 'healthz không phụ thuộc 9id');
  assert.equal((await new Client().get('/api/config')).status, 200);
  fam.fake.state.down = false;
  assert.equal(await status(fam.owner.get(`${fam.F}/pulse`)), 200);
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL', [fam.fid]))[0].n, 1, 'sự cố 9id không làm ai bị coi là rời gia đình');
});

test('9id trả thiếu dữ liệu giữa chừng không làm mất thành viên/hồ sơ con khi người xem là con', async () => {
  config.idCacheMs = 0;
  const fam = await makeFamily(['Mẹ']);
  const k1 = await addChild(fam, 'Bé Một'); const k2 = await addChild(fam, 'Bé Hai');
  const c1 = fam.fake.signup('Tài khoản Bé Một'); fam.fake.addMember(fam.fid, c1.userId, 'con');
  fam.fake.families.get(fam.fid).children.find((k) => k.id === k1.id).linkedUserId = c1.userId;
  const c2 = fam.fake.signup('Tài khoản Bé Hai'); fam.fake.addMember(fam.fid, c2.userId, 'con');
  fam.fake.families.get(fam.fid).children.find((k) => k.id === k2.id).linkedUserId = c2.userId;
  await ok(fam.owner.get(fam.F));
  const con1 = new Client().loginAs(c1.token);
  const core = await ok(con1.get(fam.F));
  assert.deepEqual(core.children.map((k) => k.name), ['Bé Một']);
  // con 1 mở gia đình (9id chỉ trả hồ sơ của con 1 và người lớn): hồ sơ và tài khoản của con 2 vẫn còn ở 9family
  assert.equal((await db.query('SELECT count(*)::int n FROM children WHERE family_id=$1 AND archived_at IS NULL', [fam.fid]))[0].n, 2);
  assert.equal((await db.query("SELECT count(*)::int n FROM members WHERE family_id=$1 AND role='con' AND left_at IS NULL", [fam.fid]))[0].n, 2);
  assert.equal((await ok(fam.owner.get(fam.F))).children.length, 2);
});

test('mọi lần gọi 9id đều kèm token của CHÍNH người đó (app thường, không phải delegate); không có lệnh ghi', async () => {
  config.idCacheMs = 0;
  const fam = await makeFamily(['Mẹ', 'Bố'], { roles: { 'Bố': 'quan_ly' } });
  await addChild(fam, 'Bống');
  fake.calls.length = 0;
  for (const n of ['Mẹ', 'Bố']) { await ok(fam.by[n].get(fam.F)); await ok(fam.by[n].get(`${fam.F}/today`)); await ok(fam.by[n].get('/api/me')); }
  const byUser = { [fam.tokens['Mẹ']]: fam.userIds['Mẹ'], [fam.tokens['Bố']]: fam.userIds['Bố'] };
  assert.ok(fake.calls.length > 10);
  for (const c of fake.calls) {
    assert.ok(c.token, `${c.name} phải kèm token`);
    const who = c.uid || c.as;
    if (who) assert.equal(byUser[c.token], who, `${c.name}: token phải là của ${who}`);
  }
  assert.ok(!fake.calls.some((c) => ['importFamily', 'reissueClaim'].includes(c.name)), 'server không gọi API nhập gia đình');
});

test('token và cookie không bị ghi vào nhật ký, kể cả khi lỗi', async () => {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(' '));
  let fam;
  try {
    config.idCacheMs = 0;
    fam = await makeFamily(['Mẹ']);
    fam.fake.state.down = true;
    await fam.owner.get(fam.F);
    fam.fake.state.down = false;
    fam.fake.revokeSession(fam.tokens['Mẹ']);
    await fam.owner.get(fam.F);
    await fam.owner.post(`${fam.F}/tasks`, { title: 'x'.repeat(200) });
  } finally { Object.assign(console, orig); }
  const all = lines.join('\n');
  assert.ok(!all.includes(fam.tokens['Mẹ']) && !all.includes('nine_sid'), 'không có token/cookie trong nhật ký');
});

test('đồng bộ ngay: /resync bỏ đệm; /api/me trả số lời mời chờ và chờ duyệt từ 9id', async () => {
  const fam = await makeFamily(['Mẹ']);
  config.idCacheMs = 60_000;
  await ok(fam.owner.get(fam.F));
  fam.fake.addChild(fam.fid, { name: 'Sóc', birthYear: 2021 });
  assert.equal((await ok(fam.owner.get(fam.F))).children.length, 0, 'còn trong đệm');
  await ok(fam.owner.post(`${fam.F}/resync`));
  assert.equal((await ok(fam.owner.get(fam.F))).children.length, 1);
  // vai trò đổi: có hiệu lực sau resync
  const bo = newUser('Bố'); fam.fake.addMember(fam.fid, bo.userId, 'thanh_vien'); await ok(bo.client.get(fam.F));
  fam.fake.setRole(fam.fid, bo.userId, 'quan_ly');
  assert.equal((await ok(bo.client.get(fam.F))).me.role, 'thanh_vien', 'đệm: tối đa 60 giây');
  await ok(bo.client.post(`${fam.F}/resync`));
  assert.equal((await ok(bo.client.get(fam.F))).me.role, 'quan_ly');
  // lời mời / chờ duyệt
  fam.fake.setPending(fam.userIds['Mẹ'], 2); fam.fake.setApprovals(fam.userIds['Mẹ'], 1);
  idmod.flushCaches();
  const me = await ok(fam.owner.get('/api/me'));
  assert.equal(me.pendingInvitations, 2); assert.equal(me.pendingApprovals, 1);
  const core = await ok(fam.owner.get(fam.F));
  assert.deepEqual(core.id.inbox, { invitations: 2, approvals: 1 });
  assert.equal(core.id.family, `/id/#/gia-dinh/${fam.fid}`); assert.equal(core.id.invitations, '/id/#/loi-moi');
});

test('không lộ số điện thoại: không có đường nào trong 9family trả hay lưu số của tài khoản', async () => {
  const fam = await makeFamily(['Mẹ', 'Bố']);
  await addChild(fam, 'Bống');
  const dump = JSON.stringify([
    (await ok(fam.owner.get(fam.F))).members, (await ok(fam.owner.get('/api/me'))), await ok(fam.owner.get(`${fam.F}/today`)),
    await db.query('SELECT * FROM members'), await db.query('SELECT * FROM children'), await db.query('SELECT * FROM families'),
  ]);
  assert.ok(!/\+?84[35789]\d{8}\b|\b0[35789]\d{8}\b/.test(dump), 'không có chuỗi giống số điện thoại');
  assert.ok(!fake.calls.some((c) => c.fields), 'không xin phoneLast4');
  // cột phone chỉ dành cho người đón hộ (không có tài khoản)
  assert.equal((await db.query("SELECT count(*)::int n FROM members WHERE external = false AND phone <> ''"))[0].n, 0);
});

test('cầu dao: 9id lỗi hạ tầng thì các yêu cầu sau trả 503 ngay (không dồn chờ), hết thời gian cầu dao thì thử lại', async () => {
  config.idCacheMs = 0;
  const fam = await makeFamily(['Mẹ']);
  config.idBreakMs = 400;
  try {
    fam.fake.state.down = true;
    assert.equal(await status(fam.owner.get(`${fam.F}/pulse`)), 503);
    const callsAfterFirst = fake.calls.length;
    fam.fake.state.down = false;
    for (let i = 0; i < 5; i++) assert.equal(await status(fam.owner.get(`${fam.F}/pulse`)), 503, 'cầu dao đang mở');
    assert.equal(fake.calls.length, callsAfterFirst, 'cầu dao mở thì không gọi 9id thêm');
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(await status(fam.owner.get(`${fam.F}/pulse`)), 200, 'hết thời gian cầu dao thì thử lại và hồi phục');
  } finally { config.idBreakMs = 0; }
});
