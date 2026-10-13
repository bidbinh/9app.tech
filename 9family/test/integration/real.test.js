// Kiểm thử TÍCH HỢP với 9id THẬT (không dùng 9id giả): 9id + 9family chạy cùng lúc, hai PostgreSQL nhúng, "nginx" mô phỏng, OTP mock.
// Chạy riêng: node --test test/integration/real.test.js   (npm test cũng chạy tệp này ở cuối).
// Dữ liệu mẫu đều BỊA. Cổng >= 17000 ngẫu nhiên.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, signup, Browser, ID_SECRET } from './harness.js';
import { createNineId, NineIdError } from '../../src/nine-id.js';

let sys;
before(async () => { sys = await boot({ legacy: true }); });
after(async () => {
  if (sys) await sys.stop();
  setTimeout(() => process.exit(process.exitCode || 0), 1500).unref(); // dọn xong mà còn tay cầm mở (kết nối giữ sống) thì thoát hẳn, không treo `npm test`
});

const status = async (p) => (await p).status;
const okj = async (p, label = '') => { const r = await p; if (r.status >= 300) throw new Error(`${label} -> ${r.status} ${r.text.slice(0, 300)}`); return r.json; };
const realClient = () => createNineId({ baseUrl: sys.ID_DIRECT + '/id', keyId: 'family', secret: ID_SECRET });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// gửi lời mời theo số điện thoại, người nhận chấp nhận, chủ/quản lý duyệt
async function inviteAndJoin(owner, fid, guest, role = 'thanh_vien') {
  await okj(owner.id('POST', `/families/${fid}/invites`, { phone: guest.phone, role }), 'mời');
  const inv = (await okj(guest.id('GET', '/invitations'), 'lời mời')).invitations[0];
  assert.ok(inv, 'người được mời thấy lời mời');
  await okj(guest.id('POST', `/invitations/${inv.id}/accept`, {}), 'chấp nhận');
  const fam = await okj(owner.id('GET', `/families/${fid}`), 'xem gia đình');
  const wait = fam.invitations.find((i) => i.status === 'awaiting');
  if (wait) await okj(owner.id('POST', `/families/${fid}/invites/${wait.id}/approve`, {}), 'duyệt');
}

test('nginx giả chặn đường nội bộ của 9id; chưa đăng nhập thì 9family trả 401 chuẩn', async () => {
  const b = new Browser(sys);
  assert.equal((await b.req('POST', '/id/internal/v1/verify', { token: 'x' })).status, 404);
  assert.equal((await b.req('GET', '/id/admin-api/v1/manifest')).status, 404);
  const me = await b.fam('GET', '/api/me');
  assert.equal(me.status, 401); assert.equal(me.json.error.code, 'unauthenticated'); assert.equal(me.json.error.details.login, '/id/');
  assert.equal((await b.fam('GET', '/api/families/11111111-1111-4111-8111-111111111111')).status, 401);
  assert.equal((await b.fam('GET', '/')).status, 200);
  // cookie giả
  b.jar.nine_sid = 'A'.repeat(43);
  assert.equal((await b.fam('GET', '/api/me')).status, 401);
});

test('đăng ký ở 9id -> tạo gia đình ở 9id -> mở trong 9family: đồng bộ, vai trò, tên trùng; không lộ số điện thoại', async () => {
  const me = await signup(sys, { name: 'Mẹ Bình Thử' });
  const me2 = await signup(sys, { name: 'Mẹ Lan Thử' });
  const a = (await okj(me.id('POST', '/families', { name: 'Nhà Cún' }))).family;
  const b = (await okj(me2.id('POST', '/families', { name: 'Nhà Cún' }))).family; // tên trùng
  assert.notEqual(a.id, b.id);
  const core = await okj(me.fam('GET', `/api/families/${a.id}`), 'mở gia đình');
  assert.equal(core.family.name, 'Nhà Cún'); assert.equal(core.me.role, 'chu'); assert.equal(core.me.name, 'Mẹ Bình Thử');
  const list = await okj(me.fam('GET', '/api/me'));
  assert.deepEqual(list.families.map((f) => f.id), [a.id]);
  assert.equal(list.user.displayName, 'Mẹ Bình Thử');
  // gia đình của người khác: 404, như không tồn tại
  assert.equal((await me.fam('GET', `/api/families/${b.id}`)).status, 404);
  assert.equal((await me.fam('GET', `/api/families/${b.id}/today`)).status, 404);
  assert.equal((await me.fam('GET', `/api/families/11111111-1111-4111-8111-111111111111`)).status, 404);
  // id của 9family = id của 9id
  const row = await sys.famDb.query('SELECT user_id FROM members WHERE family_id=$1', [a.id]);
  assert.deepEqual(row.map((r) => r.user_id), [me.userId]);
  // số điện thoại không bao giờ xuất hiện ở 9family (phản hồi lẫn CSDL)
  const digits = me.phone.replace(/^0/, '');
  const dump = JSON.stringify([core, list, await sys.famDb.query('SELECT * FROM members'), await sys.famDb.query('SELECT * FROM families'), await sys.famDb.query('SELECT * FROM children')]);
  assert.ok(!dump.includes(digits), 'không có số điện thoại');
  const dbText = JSON.stringify(await Promise.all(['members', 'families', 'children', 'idem', 'notifications', 'push_subs'].map((t) => sys.famDb.query(`SELECT * FROM ${t}`))));
  assert.ok(!dbText.includes(digits) && !dbText.includes(me2.phone.replace(/^0/, '')));
  // 9family không thể xin số đầy đủ: verify chỉ trả userId + displayName
  const who = await realClient().verify(me.jar.nine_sid);
  assert.deepEqual(Object.keys(who).sort(), ['displayName', 'userId']);
});

test('ràng buộc token: 9family là app thường, 9id từ chối đọc gia đình khi thiếu hoặc sai token', async () => {
  const mama = await signup(sys, { name: 'Mẹ Token' });
  const other = await signup(sys, { name: 'Người Khác' });
  const fam = (await okj(mama.id('POST', '/families', { name: 'Nhà Token' }))).family;
  const c = realClient();
  await assert.rejects(c.members(fam.id, mama.userId), (e) => e instanceof NineIdError && e.status === 401 && e.code === 'token_required');
  await assert.rejects(c.members(fam.id, mama.userId, other.jar.nine_sid), (e) => e instanceof NineIdError && e.status === 401 && e.code === 'token_mismatch');
  await assert.rejects(c.userFamilies(mama.userId, other.jar.nine_sid), (e) => e.status === 401);
  assert.equal((await c.members(fam.id, mama.userId, mama.jar.nine_sid)).role, 'chu');
  // người ngoài gia đình dù có token đúng của mình: 404
  await assert.rejects(c.members(fam.id, other.userId, other.jar.nine_sid), (e) => e.status === 404);
});

test('lời mời qua số điện thoại: mời -> chấp nhận -> chủ duyệt -> thành viên; ghi chú sức khỏe không lộ ngay cho người mới', async () => {
  const mama = await signup(sys, { name: 'Mẹ Mời' });
  const papa = await signup(sys, { name: 'Bố Được Mời' });
  const fam = (await okj(mama.id('POST', '/families', { name: 'Nhà Mời' }))).family;
  await okj(mama.id('POST', `/families/${fam.id}/children`, { name: 'Bé Một', birthYear: 2018, note: 'Dị ứng đậu phộng' }));
  assert.equal((await papa.fam('GET', `/api/families/${fam.id}`)).status, 404, 'chưa mời thì chưa thấy');
  await okj(mama.id('POST', `/families/${fam.id}/invites`, { phone: papa.phone, role: 'quan_ly' }));
  // lời mời hiện ở /api/me của 9family (đọc pendingInvitations từ 9id)
  sys.famId.flushCaches();
  const pend = await okj(papa.fam('GET', '/api/me'));
  assert.equal(pend.pendingInvitations, 1); assert.deepEqual(pend.families, []);
  const inv = (await okj(papa.id('GET', '/invitations'))).invitations[0];
  assert.equal(inv.kind, 'nguoi_lon');
  await okj(papa.id('POST', `/invitations/${inv.id}/accept`, {}));
  assert.equal((await papa.fam('GET', `/api/families/${fam.id}`)).status, 404, 'chấp nhận xong vẫn phải chờ duyệt');
  sys.famId.flushCaches();
  const m2 = await okj(mama.fam('GET', '/api/me'));
  assert.equal(m2.pendingApprovals, 1, 'chủ thấy số người chờ duyệt');
  const core0 = await okj(mama.fam('GET', `/api/families/${fam.id}`));
  assert.equal(core0.id.inbox.approvals, 1);
  const wait = (await okj(mama.id('GET', `/families/${fam.id}`))).invitations.find((i) => i.status === 'awaiting');
  await okj(mama.id('POST', `/families/${fam.id}/invites/${wait.id}/approve`, {}));
  sys.famId.flushCaches();
  const core = await okj(papa.fam('GET', `/api/families/${fam.id}`));
  assert.equal(core.me.role, 'quan_ly'); assert.equal(core.me.name, 'Bố Được Mời');
  assert.equal(core.children.length, 1);
  assert.equal(core.children[0].healthNote, undefined, 'ghi chú sức khỏe bị ẩn với người mới vào dưới 24 giờ (quy định của 9id)');
  const forMama = await okj(mama.fam('GET', `/api/families/${fam.id}`));
  assert.equal(forMama.children[0].healthNote, 'Dị ứng đậu phộng');
  // chủ nhận thông báo "đã vào gia đình"
  const notes = (await okj(mama.fam('GET', `/api/families/${fam.id}/notifications`))).items;
  assert.ok(notes.some((n) => n.title.includes('Bố Được Mời') && n.type === 'family'));
  // đổi tên gia đình ở 9id -> 9family thấy sau khi bỏ đệm
  await okj(mama.id('POST', `/families/${fam.id}/rename`, { name: 'Nhà Mới Tên' }));
  await okj(mama.fam('POST', `/api/families/${fam.id}/resync`));
  assert.equal((await okj(papa.fam('GET', `/api/families/${fam.id}`))).family.name, 'Nhà Mới Tên');
});

test('tài khoản của con: nối bằng số điện thoại (con tự chấp nhận), vai con chỉ xem lịch/việc của mình', async () => {
  const mama = await signup(sys, { name: 'Mẹ Có Con' });
  const kidAcc = await signup(sys, { name: 'Bống Tự Đăng Nhập' });
  const fam = (await okj(mama.id('POST', '/families', { name: 'Nhà Có Con' }))).family;
  const k1 = (await okj(mama.id('POST', `/families/${fam.id}/children`, { name: 'Bống', birthYear: 2014, phone: kidAcc.phone, note: 'Hen suyễn' }))).child;
  const k2 = (await okj(mama.id('POST', `/families/${fam.id}/children`, { name: 'Sóc', birthYear: 2019 }))).child;
  await okj(mama.fam('POST', `/api/families/${fam.id}/resync`));
  await okj(mama.fam('POST', `/api/families/${fam.id}/children/${k1.id}`, { school: 'Trường Thử', grade: '8A', color: 'cam' }));
  await okj(mama.fam('POST', `/api/families/${fam.id}/events`, { title: 'Học thêm Toán của Bống', startDate: '2026-10-12', start: '19:00', childIds: [k1.id] }));
  await okj(mama.fam('POST', `/api/families/${fam.id}/events`, { title: 'Học bơi của Sóc', startDate: '2026-10-12', start: '15:00', childIds: [k2.id] }));
  const inv = (await okj(kidAcc.id('GET', '/invitations'))).invitations[0];
  assert.equal(inv.kind, 'con');
  await okj(kidAcc.id('POST', `/invitations/${inv.id}/accept`, {}));
  const wait = (await okj(mama.id('GET', `/families/${fam.id}`))).invitations.find((i) => i.status === 'awaiting');
  if (wait) await okj(mama.id('POST', `/families/${fam.id}/invites/${wait.id}/approve`, {}));
  sys.famId.flushCaches();
  const F = `/api/families/${fam.id}`;
  const core = await okj(kidAcc.fam('GET', F));
  assert.equal(core.me.role, 'con'); assert.deepEqual(core.children.map((k) => k.name), ['Bống']);
  assert.ok(!JSON.stringify(core).includes('Sóc') && !JSON.stringify(core).includes('Hen suyễn'));
  assert.equal(core.children[0].school, 'Trường Thử');
  const cal = await okj(kidAcc.fam('GET', `${F}/calendar?from=2026-10-01&to=2026-10-31`));
  assert.deepEqual(cal.events.map((e) => e.title), ['Học thêm Toán của Bống']);
  for (const [m, p, b] of [['POST', `${F}/events`, { title: 'x', startDate: '2026-10-12', start: '10:00' }], ['POST', `${F}/tasks`, { title: 'x' }], ['POST', `${F}/settings`, { esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 } }], ['POST', `${F}/members`, { name: 'x', external: true }]]) {
    assert.equal((await kidAcc.fam(m, p, b)).status, 403, p);
  }
  // 9id: con gỡ nối chính mình -> mất quyền thấy hồ sơ
  await okj(kidAcc.id('POST', `/families/${fam.id}/children/${k1.id}/unlink`, {}));
  await okj(kidAcc.fam('POST', `${F}/resync`).catch(() => ({ json: {} })), 'resync').catch(() => {});
  sys.famId.flushCaches();
  assert.equal((await kidAcc.fam('GET', F)).status, 404, 'con đã gỡ nối thì không còn trong gia đình');
});

test('phiên 9id bị thu hồi / đăng xuất giữa chừng: 9family trả 401 khi hết đệm (tối đa 60 giây); đăng xuất tất cả thiết bị', async () => {
  const u = await signup(sys, { name: 'Mẹ Đăng Xuất' });
  const fam = (await okj(u.id('POST', '/families', { name: 'Nhà Đăng Xuất' }))).family;
  const F = `/api/families/${fam.id}`;
  await okj(u.fam('GET', F));
  // thiết bị thứ hai của cùng người dùng
  const phone2 = new Browser(sys, 'máy 2');
  const login = await phone2.id('POST', '/login', { phone: u.phone, password: u.password });
  assert.equal(login.status, 200);
  await okj(phone2.fam('GET', F));
  // máy 2 đăng xuất ở 9id
  assert.equal((await phone2.id('POST', '/logout', {})).status, 200);
  const stale = await phone2.fam('GET', F);
  // cookie đã bị xóa phía trình duyệt khi đăng xuất, nên không còn nine_sid -> 401 ngay
  assert.equal(stale.status, 401);
  // máy 1 vẫn dùng được
  assert.equal((await u.fam('GET', F)).status, 200);
  // cookie cũ của máy 2 bị giữ lại (kẻ trộm cookie): 9id đã xóa phiên nên hết đệm là hết quyền
  const thief = new Browser(sys, 'kẻ trộm');
  const p3 = new Browser(sys, 'máy 3'); await p3.id('POST', '/login', { phone: u.phone, password: u.password });
  const stolen = p3.jar.nine_sid; thief.jar.nine_sid = stolen;
  assert.equal((await thief.fam('GET', F)).status, 200);
  await p3.id('POST', '/logout', {});
  assert.equal((await thief.fam('GET', F)).status, 200, 'còn trong đệm 60 giây (đã biết, theo spec 9id)');
  sys.famId.flushCaches();
  const after = await thief.fam('GET', F);
  assert.equal(after.status, 401); assert.equal(after.json.error.code, 'unauthenticated');
  // đổi mật khẩu = đăng xuất các thiết bị khác (9id xóa phiên) -> 9family 401 khi hết đệm
  const p4 = new Browser(sys, 'máy 4'); await p4.id('POST', '/login', { phone: u.phone, password: u.password });
  await okj(p4.fam('GET', F));
  await okj(u.id('POST', '/account/password', { currentPassword: u.password, newPassword: 'MatKhau-Moi-2-xyz' }), 'đổi mật khẩu');
  sys.famId.flushCaches();
  assert.equal((await p4.fam('GET', F)).status, 401, 'máy khác bị đăng xuất sau khi đổi mật khẩu');
  assert.equal((await u.fam('GET', F)).status, 200, 'máy vừa đổi mật khẩu vẫn dùng được');
});

test('9id không với tới được: 503 (không phải 401), tự hồi phục', async () => {
  const u = await signup(sys, { name: 'Mẹ Sự Cố' });
  const fam = (await okj(u.id('POST', '/families', { name: 'Nhà Sự Cố' }))).family;
  const F = `/api/families/${fam.id}`;
  await okj(u.fam('GET', F));
  const saved = sys.famCfg.idCacheMs; sys.famCfg.idCacheMs = 0; sys.famCfg.idBreakMs = 0;
  sys.famId.setIdClient(createNineId({ baseUrl: 'http://127.0.0.1:1/id', keyId: 'family', secret: ID_SECRET, timeoutMs: 800 }));
  try {
    const r = await u.fam('GET', F);
    assert.equal(r.status, 503); assert.equal(r.json.error.code, 'id_unavailable');
    assert.equal((await u.fam('GET', '/api/me')).status, 503);
  } finally { sys.famId.setIdClient(null); sys.famCfg.idCacheMs = saved; }
  assert.equal((await u.fam('GET', F)).status, 200);
  assert.equal((await sys.famDb.query('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL', [fam.id]))[0].n, 1);
});

test('Web Push gắn user_id; Console liệt kê theo user_id, không có số điện thoại', async () => {
  const u = await signup(sys, { name: 'Mẹ Đẩy' });
  const fam = (await okj(u.id('POST', '/families', { name: 'Nhà Đẩy' }))).family;
  const F = `/api/families/${fam.id}`;
  await okj(u.fam('GET', F));
  await okj(u.fam('POST', `${F}/push/subscribe`, { endpoint: 'https://127.0.0.1:1/p/real', keys: { p256dh: crypto.randomBytes(65).toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } }));
  const sub = (await sys.famDb.query("SELECT user_id FROM push_subs WHERE endpoint LIKE '%/p/real'"))[0];
  assert.equal(sub.user_id, u.userId);
  // Console (ký HMAC)
  const KEY = 'hub'; const SECRET = 'console-secret-0123456789abcdef-test-xx';
  const url = new URL(sys.FAM_DIRECT + '/9family/admin-api/v1/users?limit=1000');
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}\nGET\n${url.pathname + url.search}\n${crypto.createHash('sha256').update('').digest('hex')}`).digest('hex');
  const r = await fetch(url, { headers: { 'x-console-key': KEY, 'x-console-ts': ts, 'x-console-sig': sig } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.items.some((x) => x.id === u.userId), 'id = user_id của 9id');
  assert.ok(!JSON.stringify(j).includes(u.phone.replace(/^0/, '')), 'không có số điện thoại');
});

test('NHẬP GIA ĐÌNH HIỆN CÓ: export-to-9id -> chủ đăng ký + nhập mã -> 9family tự nối chủ; chỉ-đọc trước khi nối; dữ liệu nguyên vẹn', async () => {
  const F9 = (sql, p) => sys.famDb.query(sql, p);
  const ID9 = { fam: crypto.randomUUID(), me: crypto.randomUUID(), bo: crypto.randomUUID(), k1: crypto.randomUUID(), k2: crypto.randomUUID(), ride: crypto.randomUUID() };
  // gia đình "đang chạy thật" kiểu cũ (phiên ẩn danh), dữ liệu bịa
  await F9("INSERT INTO families(id, name, created_by_hash, settings) VALUES($1,'Nhà Cũ Thử','h-bịa','{\"esc\":{\"t1\":45,\"t2\":30,\"t3\":15,\"t4\":8,\"after\":12}}')", [ID9.fam]);
  await F9("INSERT INTO members(id, family_id, name, relation, role, joined_at, ics_token) VALUES($1,$2,'Mẹ Cũ','me','chu',now(),'ics-cu-1'),($3,$2,'Bố Cũ','bo','thanh_vien',now(),'ics-cu-2')", [ID9.me, ID9.fam, ID9.bo]);
  const tok = crypto.randomBytes(32).toString('base64url');
  await F9("INSERT INTO sessions(token_hash, member_id, label) VALUES($1,$2,'Android')", [crypto.createHash('sha256').update(tok).digest('hex'), ID9.me]);
  await F9("INSERT INTO children(id, family_id, name, birth_year, school, grade, color, note) VALUES($1,$3,'Bé Cũ Một',2017,'Trường Cũ','4A','xanh','Cổng B'),($2,$3,'Bé Cũ Hai',2020,'','', 'cam','')", [ID9.k1, ID9.k2, ID9.fam]);
  await F9("INSERT INTO rides(id, family_id, child_id, dir, weekday, at_time, p0) VALUES($1,$2,$3,'don',1,'16:30',$4)", [ID9.ride, ID9.fam, ID9.k1, ID9.bo]);
  await F9("INSERT INTO events(family_id, title, start_date, start_time, created_by) VALUES($1,'Họp phụ huynh cũ','2026-10-20','19:00',$2)", [ID9.fam, ID9.me]);
  const legacy = new Browser(sys, 'phiên cũ'); legacy.jar.fsid = tok;

  // 1) trước khi xuất: phiên ẩn danh XEM được (chế độ tương thích), KHÔNG ghi được
  const L = `/api/families/${ID9.fam}`;
  assert.equal((await okj(legacy.fam('GET', '/api/me'))).legacy, true);
  assert.equal((await okj(legacy.fam('GET', L))).family.name, 'Nhà Cũ Thử');
  assert.equal((await legacy.fam('POST', `${L}/tasks`, { title: 'x' })).status, 423);

  // 2) lệnh quản trị xuất sang 9id THẬT; mã nhận in ra đúng một lần
  const lines = [];
  const res = await sys.famExport.exportFamilies({ family: ID9.fam, out: (l) => lines.push(l) });
  assert.equal(res[0].status, 'da_xuat_moi'); assert.match(res[0].claimCode, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
  const idFam = (await sys.idDb.query('SELECT id, name FROM families WHERE id=$1', [ID9.fam]))[0];
  assert.equal(idFam.name, 'Nhà Cũ Thử', '9id giữ nguyên uuid gia đình');
  const idKids = await sys.idDb.query('SELECT id, name, birth_year, note FROM child_profiles WHERE family_id=$1 ORDER BY name', [ID9.fam]);
  assert.deepEqual(idKids.map((k) => k.id).sort(), [ID9.k1, ID9.k2].sort(), '9id giữ nguyên uuid con');
  assert.ok(idKids.every((k) => k.note === ''), 'KHÔNG gửi ghi chú');
  const idDump = JSON.stringify(await Promise.all(['families', 'child_profiles', 'family_claims', 'users', 'memberships', 'audit'].map((t) => sys.idDb.query(`SELECT * FROM ${t}`))));
  for (const secret of ['Trường Cũ', 'Cổng B', 'Mẹ Cũ', 'Bố Cũ', 'ics-cu', 'h-bịa']) assert.ok(!idDump.includes(secret), '9id không nhận: ' + secret);
  assert.ok(!idDump.includes(res[0].claimCode) && !idDump.replace(/-/g, '').includes(res[0].claimCode.replace(/-/g, '')), '9id chỉ giữ băm của mã');
  assert.ok(!JSON.stringify(await F9('SELECT * FROM id_import')).includes(res[0].claimCode), 'CSDL 9family không giữ mã');

  // 3) chưa ai nhận: người lạ không thấy; phiên cũ vẫn chỉ đọc
  const stranger = await signup(sys, { name: 'Người Lạ' });
  assert.equal((await stranger.fam('GET', L)).status, 404);
  assert.equal((await stranger.id('GET', `/families/${ID9.fam}`)).status, 404);
  assert.equal((await legacy.fam('POST', `${L}/tasks`, { title: 'x' })).status, 423);
  // mã sai bị từ chối; mã đúng dùng một lần
  assert.equal((await stranger.id('POST', '/claims/redeem', { code: 'AAAAA-BBBBB-CCCCC-DDDDD' })).status, 400);

  // 4) chủ đăng ký tài khoản 9app rồi nhập mã -> thành chủ ở 9id
  const owner = await signup(sys, { name: 'Mẹ Cũ Đã Đăng Ký' });
  await okj(owner.id('POST', '/claims/redeem', { code: res[0].claimCode }), 'nhập mã');
  assert.equal((await stranger.id('POST', '/claims/redeem', { code: res[0].claimCode })).status, 400, 'mã dùng một lần');
  // 5) mở 9family: tự nối thành viên "chu" cũ, giữ memberId cũ
  const me = await okj(owner.fam('GET', '/api/me'));
  assert.deepEqual(me.families.map((f) => [f.id, f.role, f.memberId]), [[ID9.fam, 'chu', ID9.me]]);
  const row = (await F9('SELECT user_id, name, recovery_hash FROM members WHERE id=$1', [ID9.me]))[0];
  assert.equal(row.user_id, owner.userId); assert.equal(row.recovery_hash, null);
  const core = await okj(owner.fam('GET', L));
  assert.equal(core.family.esc.t1, 45, 'thiết lập leo thang còn'); assert.equal(core.children.length, 2);
  assert.equal(core.children.find((k) => k.id === ID9.k1).school, 'Trường Cũ'); assert.equal(core.children.find((k) => k.id === ID9.k1).note, 'Cổng B');
  assert.equal((await okj(owner.fam('GET', `${L}/rides`))).rides[0].p0, ID9.bo);
  assert.ok((await okj(owner.fam('GET', `${L}/calendar?from=2026-10-01&to=2026-10-31`))).events.some((e) => e.title === 'Họp phụ huynh cũ'));
  await okj(owner.fam('POST', `${L}/tasks`, { title: 'Ghi được sau khi nối' }));
  // 6) phiên ẩn danh cũ hết hiệu lực khi gia đình đã có chủ
  assert.equal((await legacy.fam('GET', L)).status, 401);
  // 7) Bố cũ (chưa có tài khoản): mời bằng số điện thoại rồi gộp
  const bo = await signup(sys, { name: 'Bố Cũ Đã Đăng Ký' });
  await inviteAndJoin(owner, ID9.fam, bo, 'quan_ly');
  sys.famId.flushCaches();
  const boMe = (await okj(bo.fam('GET', L))).me;
  assert.notEqual(boMe.id, ID9.bo);
  await okj(owner.fam('POST', `${L}/members/${ID9.bo}/merge`, { into: boMe.id }));
  assert.equal((await okj(bo.fam('GET', `${L}/rides`))).rides[0].p0, boMe.id, 'ca đưa đón cũ của Bố chuyển sang tài khoản mới');
  // 8) chạy lại lệnh xuất không tạo thêm gì
  const again = await sys.famExport.exportFamilies({ family: ID9.fam, out: () => {} });
  assert.equal(again[0].status, 'da_nhan');
  assert.equal((await F9('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL', [ID9.fam]))[0].n, 2);
});

test('xóa tài khoản ở 9id: 9family nhận 401 khi hết đệm; không đoán được id người khác (IDOR chéo gia đình)', async () => {
  const a = await signup(sys, { name: 'Mẹ A' });
  const b = await signup(sys, { name: 'Mẹ B' });
  const fa = (await okj(a.id('POST', '/families', { name: 'Nhà A' }))).family;
  const fb = (await okj(b.id('POST', '/families', { name: 'Nhà B' }))).family;
  const ka = (await okj(a.id('POST', `/families/${fa.id}/children`, { name: 'Bé A' }))).child;
  await okj(a.fam('POST', `/api/families/${fa.id}/resync`));
  // B không đụng được vào dữ liệu A dù có id (kể cả id con/sự kiện)
  const FA = `/api/families/${fa.id}`;
  for (const [m, p, body] of [['GET', ''], ['GET', '/today'], ['GET', '/lists'], ['POST', `/children/${ka.id}`, { school: 'x' }], ['POST', '/tasks', { title: 'x' }], ['POST', '/resync']]) {
    const r = await b.fam(m, FA + p, body);
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.equal((await b.fam('POST', `/api/families/${fb.id}/children/${ka.id}`, { school: 'x' })).status, 404, 'id con của gia đình khác');
  // xóa tài khoản (chủ phải chọn xóa/chuyển gia đình): 9family nhận 401 khi hết đệm
  const del = await a.id('POST', '/account/delete', { password: a.password, decisions: { [fa.id]: { action: 'delete' } } });
  assert.equal(del.status, 200, del.text);
  sys.famId.flushCaches();
  assert.equal((await a.fam('GET', FA)).status, 401);
  assert.equal((await new Browser(sys).fam('GET', FA)).status, 401);
});
