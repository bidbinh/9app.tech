import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, signup, newPhone, getTicket, PASS, query, util } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const NEWPASS = 'MatKhau-Moi-88';
let ipSeq = 1;
const freshIp = () => `10.10.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const e164 = (p) => util.normalizePhone(p);
const uid = async (phone) => (await query('SELECT id FROM users WHERE phone=$1', [e164(phone)]))[0].id;
async function ticketFor(phone) {
  const token = util.newToken();
  await query('INSERT INTO tickets(token_hash, phone_hash, expires_at) VALUES($1,$2, now() + interval \'10 minutes\')', [util.sha256hex(token), util.phoneHash(e164(phone))]);
  return token;
}
const change = (c, ticket, phone, password = PASS) => c.post('/api/phone/change', { ticket, phone, password });
const undo = (c, ticket, phone, password = NEWPASS) => c.post('/api/phone/undo', { ticket, phone, password });
// kẻ có phiên + mật khẩu của nạn nhân đổi sang số của mình
async function takeover() {
  const victim = await signup('Nạn nhân', { ip: freshIp() });
  const oldPhone = victim.phone, attackerPhone = newPhone();
  assert.equal((await change(victim, await ticketFor(attackerPhone), attackerPhone)).status, 200);
  return { victim, oldPhone, attackerPhone };
}

test('xác minh OTP số cũ trong 7 ngày có phoneChangeUndoable; số khác hoặc quá hạn thì không', async () => {
  const { oldPhone } = await takeover();
  const c = new Client('chủ số cũ', freshIp());
  const v = await getTicket(c, oldPhone, 'reset');
  assert.equal(v.accountExists, false);
  assert.equal(v.phoneChangeUndoable, true);
  const other = await getTicket(new Client('x', freshIp()), newPhone(), 'reset');
  assert.ok(!other.phoneChangeUndoable);
  await query("UPDATE phone_changes SET changed_at = now() - interval '8 days'");
  const late = await getTicket(new Client('y', freshIp()), oldPhone, 'reset');
  assert.ok(!late.phoneChangeUndoable, 'quá 7 ngày thì không còn hoàn tác');
});

test('hoàn tác thành công: trả số cũ, đặt mật khẩu mới, đuổi kẻ đổi (mật khẩu cũ không còn đăng nhập), mở phiên mới', async () => {
  const { victim, oldPhone, attackerPhone } = await takeover();
  const id = await uid(attackerPhone);
  const owner = new Client('chủ số cũ', freshIp());
  const r = await undo(owner, await ticketFor(oldPhone), oldPhone);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.user && r.json.user.id === id, 'cùng một tài khoản');
  assert.equal((await query('SELECT phone FROM users WHERE id=$1', [id]))[0].phone, e164(oldPhone));
  assert.equal((await ok(owner.get('/api/me'))).user.id, id, 'phiên mới mở');
  assert.equal((await ok(victim.get('/api/me'))).user, null, 'phiên của kẻ đổi (cũ) đã bị thu hồi');
  assert.equal((await query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [id]))[0].n, 1);
  assert.equal((await new Client('a', freshIp()).post('/api/login', { phone: oldPhone, password: NEWPASS })).status, 200, 'mật khẩu mới dùng được');
  assert.equal((await new Client('b', freshIp()).post('/api/login', { phone: oldPhone, password: PASS })).status, 401, 'mật khẩu cũ không còn dùng được');
  assert.equal((await new Client('c', freshIp()).post('/api/login', { phone: attackerPhone, password: NEWPASS })).status, 401, 'số của kẻ đổi không còn là tên đăng nhập');
  const pc = (await query('SELECT * FROM phone_changes WHERE user_id=$1', [id]))[0];
  assert.ok(pc.undone_at);
  assert.equal((await query("SELECT count(*)::int AS n FROM notices WHERE user_id=$1 AND kind='phone_change_undone'", [id]))[0].n, 1);
  const aud = await query("SELECT * FROM audit WHERE user_id=$1 AND kind='phone_change_undone'", [id]);
  assert.equal(aud.length, 1);
  assert.ok(!JSON.stringify(aud).includes(oldPhone.slice(1)) && !JSON.stringify(aud).includes(attackerPhone.slice(1)));
  assert.ok(!JSON.stringify(r.json).includes(oldPhone.slice(1)), 'phản hồi không chứa số đầy đủ');
  // số của kẻ tấn công được thả: người khác đăng ký được
  const c = new Client('mới', freshIp());
  const { ticket } = await getTicket(c, attackerPhone);
  assert.equal((await c.post('/api/register', { ticket, phone: attackerPhone, name: 'Mới', password: PASS })).status, 200);
});

test('không hoàn tác lần hai, không hoàn tác quá 7 ngày, không hoàn tác bằng vé của số khác', async () => {
  const { oldPhone } = await takeover();
  const bad = await undo(new Client('1', freshIp()), await ticketFor(newPhone()), oldPhone);
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'ticket_invalid');
  assert.equal((await undo(new Client('2', freshIp()), await ticketFor(oldPhone), oldPhone)).status, 200);
  const again = await undo(new Client('3', freshIp()), await ticketFor(oldPhone), oldPhone);
  assert.equal(again.status, 400, 'đã hoàn tác rồi');
  assert.equal(again.json.error.code, 'undo_unavailable');
  const t2 = await takeover();
  await query("UPDATE phone_changes SET changed_at = now() - interval '8 days' WHERE new_phone_hash = $1", [util.phoneHash(e164(t2.attackerPhone))]);
  assert.equal((await undo(new Client('4', freshIp()), await ticketFor(t2.oldPhone), t2.oldPhone)).json.error.code, 'undo_unavailable');
});

test('không hoàn tác khi tài khoản đã đổi sang số khác nữa', async () => {
  const { oldPhone, attackerPhone } = await takeover();
  await query('UPDATE users SET phone=$2 WHERE phone=$1', [e164(attackerPhone), e164(newPhone())]);
  const r = await undo(new Client('x', freshIp()), await ticketFor(oldPhone), oldPhone);
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'undo_unavailable');
});

test('mật khẩu mới yếu bị từ chối và không đốt vé', async () => {
  const { oldPhone } = await takeover();
  const t = await ticketFor(oldPhone);
  assert.equal((await undo(new Client('x', freshIp()), t, oldPhone, 'ngan1')).status, 400);
  assert.equal((await undo(new Client('y', freshIp()), t, oldPhone)).status, 200, 'vé còn dùng được');
});

test('sau hoàn tác, tài khoản đó chưa đổi số lại được trong 30 ngày kể từ lần đổi gốc', async () => {
  const { oldPhone } = await takeover();
  const owner = new Client('chủ', freshIp());
  assert.equal((await undo(owner, await ticketFor(oldPhone), oldPhone)).status, 200);
  const np = newPhone();
  const r = await change(owner, await ticketFor(np), np, NEWPASS);
  assert.equal(r.status, 429);
  assert.equal(r.json.error.code, 'phone_change_cooldown');
});
