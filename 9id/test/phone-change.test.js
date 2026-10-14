import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, signup, newPhone, getTicket, requestOtpRaw, PASS, query, config, util, provider, makeFamily } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const GENERIC = 'Không thể dùng số này hoặc mã chưa đúng';
let ipSeq = 1;
const freshIp = () => `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const e164 = (p) => util.normalizePhone(p);
const uid = async (phone) => (await query('SELECT id FROM users WHERE phone=$1', [e164(phone)]))[0].id;
const phoneOf = async (id) => (await query('SELECT phone FROM users WHERE id=$1', [id]))[0].phone;
// vé cho một số, tạo thẳng trong CSDL (mô phỏng người đã xác minh OTP số đó)
async function ticketFor(phone) {
  const token = util.newToken();
  await query('INSERT INTO tickets(token_hash, phone_hash, expires_at) VALUES($1,$2, now() + interval \'10 minutes\')', [util.sha256hex(token), util.phoneHash(e164(phone))]);
  return token;
}
const change = (c, ticket, phone, password = PASS) => c.post('/api/phone/change', { ticket, phone, password });

test('xin OTP đổi số: cần phiên; không được trùng số hiện tại', async () => {
  const guest = new Client('khách', freshIp());
  assert.equal((await requestOtpRaw(guest, newPhone(), { purpose: 'phone_change' })).status, 401);
  const a = await signup('An', { ip: freshIp() });
  assert.equal((await requestOtpRaw(a, a.phone, { purpose: 'phone_change' })).status, 400);
  assert.equal((await requestOtpRaw(a, newPhone(), { purpose: 'phone_change' })).status, 200);
});

test('đổi số thành công: đổi số, giữ phiên này, xóa phiên/thiết bị khác, ghi audit/notices/phone_changes, không lộ số', async () => {
  const a = await signup('Bình', { ip: freshIp() });
  const other = new Client('máy 2', freshIp());
  await ok(other.post('/api/login', { phone: a.phone, password: PASS }));
  const oldPhone = a.phone, np = newPhone();
  const { ticket } = await getTicket(a, np, 'phone_change');
  const r = await ok(change(a, ticket, np), 'đổi số');
  assert.equal(r.ok, true);
  assert.equal(await phoneOf(await uid(np)), e164(np));
  assert.equal((await query('SELECT count(*)::int AS n FROM users WHERE phone=$1', [e164(oldPhone)]))[0].n, 0);
  assert.ok((await ok(a.get('/api/me'))).user, 'phiên hiện tại còn');
  assert.equal((await ok(other.get('/api/me'))).user, null, 'phiên khác bị thu hồi');
  const id = await uid(np);
  assert.equal((await query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [id]))[0].n, 1);
  assert.equal((await query('SELECT count(*)::int AS n FROM devices WHERE user_id=$1', [id]))[0].n, 1, 'chỉ còn thiết bị hiện tại');
  const pc = (await query('SELECT * FROM phone_changes WHERE user_id=$1', [id]))[0];
  assert.equal(pc.old_phone, e164(oldPhone));
  assert.equal(pc.undone_at, null);
  assert.ok((await query("SELECT 1 FROM notices WHERE user_id=$1 AND kind='phone_changed'", [id])).length === 1);
  const aud = await query("SELECT * FROM audit WHERE user_id=$1 AND kind='phone_changed'", [id]);
  assert.equal(aud.length, 1);
  assert.ok(!JSON.stringify(aud).includes(np.slice(1)) && !JSON.stringify(aud).includes(oldPhone.slice(1)), 'audit không chứa số');
  assert.ok(!JSON.stringify(r).includes(np.slice(1)), 'phản hồi không chứa số đầy đủ');
  // đăng nhập bằng số mới được, số cũ không
  const c = new Client('mới', freshIp());
  assert.equal((await c.post('/api/login', { phone: np, password: PASS })).status, 200);
  assert.equal((await new Client('cũ', freshIp()).post('/api/login', { phone: oldPhone, password: PASS })).status, 401);
});

test('sai mật khẩu bị từ chối và không đốt vé; đúng mật khẩu thì đổi được', async () => {
  const a = await signup('Chi', { ip: freshIp() });
  const np = newPhone();
  const { ticket } = await getTicket(a, np, 'phone_change');
  const bad = await change(a, ticket, np, 'Sai-Mat-Khau-9');
  assert.equal(bad.status, 403);
  assert.equal(await phoneOf(await uid(a.phone)), e164(a.phone));
  assert.equal((await change(a, ticket, np)).status, 200, 'vé còn dùng được sau lần sai mật khẩu');
});

test('vé của số khác, vé dùng lại, không có phiên: bị từ chối', async () => {
  const a = await signup('Dũng', { ip: freshIp() });
  const np = newPhone(), np2 = newPhone();
  const { ticket } = await getTicket(a, np, 'phone_change');
  const wrong = await change(a, ticket, np2);
  assert.equal(wrong.status, 400);
  assert.equal(wrong.json.error.code, 'ticket_invalid');
  assert.equal((await change(a, ticket, np)).status, 200);
  assert.equal((await change(a, ticket, np)).status, 400, 'vé đã dùng');
  const guest = new Client('khách', freshIp());
  assert.equal((await change(guest, await ticketFor(newPhone()), newPhone())).status, 401);
});

test('số đã thuộc tài khoản khác: thông điệp chung, không lộ; xin OTP vẫn trả giống nhau và không gửi mã', async () => {
  const a = await signup('Em', { ip: freshIp() });
  const b = await signup('Giang', { ip: freshIp() });
  const req = await requestOtpRaw(a, b.phone, { purpose: 'phone_change' });
  const fine = await requestOtpRaw(a, newPhone(), { purpose: 'phone_change' });
  assert.equal(req.status, 200);
  assert.deepEqual(Object.keys(req.json).sort(), Object.keys(fine.json).sort(), 'phản hồi cùng dạng');
  provider.resetSent();
  const t = await ticketFor(b.phone);
  const r = await change(a, t, b.phone);
  assert.equal(r.status, 400);
  assert.equal(r.json.error.message, GENERIC);
  assert.equal(await phoneOf(await uid(a.phone)), e164(a.phone), 'không đổi');
});

test('đổi lần hai trong 30 ngày bị từ chối; sau 31 ngày được', async () => {
  const a = await signup('Hà', { ip: freshIp() });
  const n1 = newPhone(), n2 = newPhone();
  assert.equal((await change(a, await ticketFor(n1), n1)).status, 200);
  const r = await change(a, await ticketFor(n2), n2);
  assert.equal(r.status, 429);
  assert.equal(r.json.error.code, 'phone_change_cooldown');
  await query("UPDATE phone_changes SET changed_at = now() - interval '31 days' WHERE user_id=$1", [await uid(n1)]);
  assert.equal((await change(a, await ticketFor(n2), n2)).status, 200);
});

test('hai tài khoản cùng đổi sang một số cùng lúc: chỉ một thắng', async () => {
  const a = await signup('Khoa', { ip: freshIp() });
  const b = await signup('Lan', { ip: freshIp() });
  const np = newPhone();
  const [ta, tb] = [await ticketFor(np), await ticketFor(np)];
  const [ra, rb] = await Promise.all([change(a, ta, np), change(b, tb, np)]);
  const statuses = [ra.status, rb.status].sort();
  assert.deepEqual(statuses, [200, 400]);
  const loser = ra.status === 400 ? ra : rb;
  assert.equal(loser.json.error.message, GENERIC);
  assert.equal((await query('SELECT count(*)::int AS n FROM users WHERE phone=$1', [e164(np)]))[0].n, 1);
});

test('số cũ được giữ chỗ 7 ngày với đăng ký, đổi số của người khác và nhập 9Sport; sau 7 ngày thì thả', async () => {
  const a = await signup('Minh', { ip: freshIp() });
  const oldPhone = a.phone;
  const np = newPhone();
  assert.equal((await change(a, await ticketFor(np), np)).status, 200);
  // người khác đăng ký đúng số cũ
  const c = new Client('lạ', freshIp());
  const { ticket } = await getTicket(c, oldPhone);
  const reg = await c.post('/api/register', { ticket, phone: oldPhone, name: 'Lạ', password: PASS });
  assert.equal(reg.status, 409);
  assert.equal(reg.json.error.message, GENERIC);
  // người khác đổi sang số cũ
  const d = await signup('Nga', { ip: freshIp() });
  const r2 = await change(d, await ticketFor(oldPhone), oldPhone);
  assert.equal(r2.status, 400);
  assert.equal(r2.json.error.message, GENERIC);
  // qua 7 ngày: thả
  await query("UPDATE phone_changes SET changed_at = now() - interval '8 days'");
  const { ticket: t3 } = await getTicket(c, oldPhone);
  assert.equal((await c.post('/api/register', { ticket: t3, phone: oldPhone, name: 'Lạ', password: PASS })).status, 200);
});

test('lời mời gia đình gửi tới số mới tự hiện cho người đổi số', async () => {
  const owner = await signup('Chủ', { ip: freshIp() });
  const fid = await makeFamily(owner, 'Nhà thử');
  const a = await signup('Oanh', { ip: freshIp() });
  const np = newPhone();
  await ok(owner.post(`/api/families/${fid}/invites`, { phone: np, role: 'thanh_vien' }), 'mời số mới');
  assert.equal((await ok(a.get('/api/invitations'))).invitations.length, 0);
  assert.equal((await change(a, await ticketFor(np), np)).status, 200);
  assert.equal((await ok(a.get('/api/invitations'))).invitations.length, 1);
});

test('bảo trì: xóa số cũ khỏi phone_changes sau 8 ngày và xóa dòng sau 90 ngày', async () => {
  const { maintenance } = await import('./helper.js');
  const a = await signup('Phúc', { ip: freshIp() });
  const np = newPhone();
  assert.equal((await change(a, await ticketFor(np), np)).status, 200);
  const id = await uid(np);
  await query("UPDATE phone_changes SET changed_at = now() - interval '9 days' WHERE user_id=$1", [id]);
  await maintenance();
  const row = (await query('SELECT old_phone FROM phone_changes WHERE user_id=$1', [id]))[0];
  assert.equal(row.old_phone, null);
  await query("UPDATE phone_changes SET changed_at = now() - interval '91 days' WHERE user_id=$1", [id]);
  await maintenance();
  assert.equal((await query('SELECT count(*)::int AS n FROM phone_changes WHERE user_id=$1', [id]))[0].n, 0);
});
