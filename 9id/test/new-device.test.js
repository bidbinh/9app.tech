import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, signup, PASS, query, util } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

let ipSeq = 1;
const freshIp = () => `10.8.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const uidOf = async (phone) => (await query('SELECT id FROM users WHERE phone=$1', [util.normalizePhone(phone)]))[0].id;
const countNew = async (phone) => (await query("SELECT count(*)::int AS n FROM notices WHERE user_id=$1 AND kind='new_device'", [await uidOf(phone)]))[0].n;
const loginNew = async (phone) => {
  const c = new Client('máy mới', freshIp());
  const r = await ok(c.post('/api/login', { phone, password: PASS }), 'đăng nhập');
  return { c, r };
};

test('đăng ký lần đầu không tạo thông báo thiết bị mới', async () => {
  const a = await signup('An');
  assert.equal(await countNew(a.phone), 0);
});

test('đăng nhập từ thiết bị lạ khi đã có phiên khác: thông báo cho thiết bị khác, không cho thiết bị vừa đăng nhập', async () => {
  const a = await signup('Bình');
  const { r } = await loginNew(a.phone);
  assert.equal(await countNew(a.phone), 1);
  assert.ok(!(r.notices || []).some((n) => n.kind === 'new_device'), 'thiết bị vừa đăng nhập không nhận thông báo về chính nó');
  const me = await ok(a.get('/api/me'));
  assert.ok(me.notices.some((n) => n.kind === 'new_device'), 'thiết bị cũ thấy thông báo');
  const rows = await query("SELECT kind FROM notices WHERE user_id=$1", [await uidOf(a.phone)]);
  assert.ok(rows.every((x) => !JSON.stringify(x).includes(a.phone.slice(1))), 'không chứa số điện thoại');
});

test('tối đa một thông báo mỗi giờ; sau một giờ thì có thể có thông báo mới', async () => {
  const a = await signup('Chi');
  await loginNew(a.phone);
  await loginNew(a.phone);
  assert.equal(await countNew(a.phone), 1, 'đăng nhập thiết bị lạ thứ hai trong 1 giờ không thêm');
  await query("UPDATE notices SET created_at = now() - interval '2 hours' WHERE user_id=$1 AND kind='new_device'", [await uidOf(a.phone)]);
  await loginNew(a.phone);
  assert.equal(await countNew(a.phone), 2);
});

test('thiết bị quen đăng nhập lại: không thông báo', async () => {
  const a = await signup('Dũng');
  const { c } = await loginNew(a.phone);
  const before = await countNew(a.phone);
  await ok(c.post('/api/logout'), 'đăng xuất');
  await ok(c.post('/api/login', { phone: a.phone, password: PASS }), 'đăng nhập lại cùng máy');
  assert.equal(await countNew(a.phone), before);
});

test('không còn phiên nào khác (đăng nhập sau khi đăng xuất hết): không thông báo', async () => {
  const a = await signup('Em');
  await ok(a.post('/api/logout-all'), 'đăng xuất tất cả');
  await loginNew(a.phone);
  assert.equal(await countNew(a.phone), 0);
});

test('đặt lại mật khẩu không tạo new_device (đã có thông báo password_reset)', async () => {
  const a = await signup('Giang');
  const { getTicket } = await import('./helper.js');
  const c = new Client('reset', freshIp());
  const { ticket } = await getTicket(c, a.phone, 'reset');
  await ok(c.post('/api/password/reset', { ticket, phone: a.phone, password: 'MatKhau-Moi-77' }), 'đặt lại');
  assert.equal(await countNew(a.phone), 0);
});
