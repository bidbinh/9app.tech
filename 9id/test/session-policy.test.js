import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, signup, PASS, query, config, tokenOf, util } from './helper.js';
import { readSessionPolicy } from '../src/config.js';

before(async () => { await boot(); });
after(shutdown);

let ipSeq = 1;
const freshIp = () => `10.7.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const hashOf = (c) => util.sha256hex(tokenOf(c));
const setUsed = (c, interval) => query(`UPDATE sessions SET last_used_at = now() - interval '${interval}' WHERE token_hash = $1`, [hashOf(c)]);
const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};
const loginAs = async (phone) => {
  const c = new Client('máy', freshIp());
  await ok(c.post('/api/login', { phone, password: PASS }), 'đăng nhập');
  return c;
};

test('mặc định: phiên 365 ngày, tối đa 30 thiết bị; đọc được từ biến môi trường', () => {
  assert.deepEqual(readSessionPolicy({}), { sessionDays: 365, maxSessions: 30 });
  assert.deepEqual(readSessionPolicy({ SESSION_DAYS: '400', MAX_SESSIONS: '5' }), { sessionDays: 400, maxSessions: 5 });
  assert.deepEqual(readSessionPolicy({ SESSION_DAYS: 'x', MAX_SESSIONS: '' }), { sessionDays: 365, maxSessions: 30 });
});

test('cookie phiên có Max-Age 365 ngày và được cấp lại khi gia hạn', async () => {
  const c = new Client('A', freshIp());
  const phone = '0911' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  const { getTicket } = await import('./helper.js');
  const { ticket } = await getTicket(c, phone);
  const reg = await c.post('/api/register', { ticket, phone, name: 'An', password: PASS });
  assert.equal(reg.status, 200);
  const sc = reg.setCookie.find((x) => x.startsWith('nine_sid='));
  assert.match(sc, /Max-Age=31536000/);
  await setUsed(c, '2 hours');
  const me = await c.get('/api/me');
  assert.ok(me.json.user);
  const refreshed = me.setCookie.find((x) => x.startsWith('nine_sid='));
  assert.ok(refreshed && /Max-Age=31536000/.test(refreshed), 'gia hạn phải cấp lại cookie 365 ngày');
});

test('phiên còn hiệu lực sau 364 ngày không dùng, hết hiệu lực sau 366 ngày', async () => {
  const a = await signup('Bình');
  await setUsed(a, '364 days');
  assert.ok((await ok(a.get('/api/me'))).user, '364 ngày vẫn đăng nhập');
  await setUsed(a, '366 days');
  assert.equal((await ok(a.get('/api/me'))).user, null, '366 ngày thì hết');
});

test('vượt trần thiết bị: đẩy phiên ÍT DÙNG GẦN ĐÂY NHẤT, không đẩy phiên tạo sớm nhất đang dùng hằng ngày', () => withConfig({ maxSessions: 3 }, async () => {
  const c1 = await signup('Chính');           // phiên 1: tạo sớm nhất
  const c2 = await loginAs(c1.phone);
  const c3 = await loginAs(c1.phone);
  await setUsed(c1, '1 minute');               // máy chính vừa dùng
  await setUsed(c2, '30 days');                // máy ít dùng nhất
  await setUsed(c3, '5 days');
  const c4 = await loginAs(c1.phone);          // phiên thứ 4 -> phải đẩy c2
  const alive = async (c) => (await ok(c.get('/api/me'))).user !== null;
  assert.equal(await alive(c1), true, 'máy chính còn');
  assert.equal(await alive(c2), false, 'máy ít dùng nhất bị đẩy');
  assert.equal(await alive(c3), true);
  assert.equal(await alive(c4), true);
  const n = (await query('SELECT count(*)::int AS n FROM sessions WHERE user_id = (SELECT id FROM users WHERE phone = $1)', [util.normalizePhone(c1.phone)]))[0].n;
  assert.equal(n, 3);
}));

test('trần 30 thiết bị mặc định: phiên thứ 30 không đẩy ai, phiên thứ 31 đẩy một', async () => {
  const first = await signup('Đông');
  for (let i = 1; i < 30; i++) await loginAs(first.phone);
  const count = async () => (await query('SELECT count(*)::int AS n FROM sessions WHERE user_id = (SELECT id FROM users WHERE phone = $1)', [util.normalizePhone(first.phone)]))[0].n;
  assert.equal(await count(), 30);
  await loginAs(first.phone);
  assert.equal(await count(), 30);
});
