import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, shutdown, Client, ok, newPhone, getTicket, requestOtpRaw, signup, PASS, provider, query, config, util, base, tokenOf } from './helper.js';
import * as pw from '../src/password.js';
import { sha256hex } from '../src/util.js';

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};
let ipSeq = 1;
const freshIp = () => `10.1.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

test('đăng ký đủ 3 bước: OTP -> vé -> tên + mật khẩu, phiên đặt cookie nine_sid đúng thuộc tính', async () => {
  const c = new Client('A', freshIp());
  const phone = newPhone();
  const r1 = await ok(requestOtpRaw(c, phone));
  assert.equal(r1.ok, true);
  const code = provider.lastOtp(util.normalizePhone(phone));
  assert.match(code, /^\d{6}$/);
  // sai mã
  assert.equal((await c.post('/api/otp/verify', { phone, code: code === '000000' ? '111111' : '000000' })).status, 400);
  const v = await ok(c.post('/api/otp/verify', { phone, code }));
  assert.equal(v.accountExists, false);
  assert.match(v.ticket, /^[A-Za-z0-9_-]{43}$/);
  // mật khẩu quá ngắn không đốt vé
  assert.equal((await c.post('/api/register', { ticket: v.ticket, phone, name: 'Lan', password: 'ngan1' })).status, 400);
  assert.equal((await c.post('/api/register', { ticket: v.ticket, phone, name: '', password: PASS })).status, 400);
  const reg = await c.post('/api/register', { ticket: v.ticket, phone, name: '  Lan   Nguyễn ', password: PASS, next: '/tutor/' });
  assert.equal(reg.status, 200);
  assert.equal(reg.json.user.displayName, 'Lan Nguyễn');
  assert.equal(reg.json.next, '/tutor/');
  assert.equal(JSON.stringify(reg.json).includes(phone.slice(1)), false, 'không trả số điện thoại');
  const sc = reg.setCookie.find((x) => x.startsWith('nine_sid='));
  assert.match(sc, /Path=\/(;|$)/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Max-Age=31536000/);
  assert.ok(!/Secure/.test(sc), 'không production thì chưa Secure');
  const me = await ok(c.get('/api/me'));
  assert.equal(me.user.displayName, 'Lan Nguyễn');
  assert.equal(me.user.phoneLast4, phone.slice(-4));
  // DB chỉ lưu băm của token, băm của mã; số E.164 duy nhất
  const token = tokenOf(c);
  const s = await query('SELECT token_hash FROM sessions');
  assert.ok(s.some((x) => x.token_hash === sha256hex(token)) && !s.some((x) => x.token_hash === token));
  const o = await query('SELECT * FROM otps WHERE phone_hash = $1', [util.phoneHash(util.normalizePhone(phone))]);
  assert.ok(o.length && o.every((x) => x.code_hash !== code && !JSON.stringify(x).includes(phone.slice(1))));
  const u = await query('SELECT phone, password_hash FROM users WHERE phone = $1', [util.normalizePhone(phone)]);
  assert.equal(u.length, 1); assert.match(u[0].password_hash, /^pbkdf2\$200000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
});

test('cùng một số viết nhiều cách là cùng một tài khoản', async () => {
  const a = await signup('An', { phone: '0911000111' });
  const c = new Client('x', freshIp());
  for (const form of ['+84911000111', '84911000111', '0911 000 111']) {
    const r = await c.post('/api/login', { phone: form, password: PASS });
    assert.equal(r.status, 200, form);
    assert.equal(r.json.user.id, a.user.id);
  }
  const d = await getTicket(c, '+84 911 000 111');
  assert.equal(d.accountExists, true);
});

test('OTP: hết hạn, vượt số lần thử, dùng một lần, mã mới thay mã cũ', async () => {
  const c = new Client('o', freshIp());
  const phone = newPhone(); const e = util.normalizePhone(phone);
  await ok(requestOtpRaw(c, phone));
  const code = provider.lastOtp(e);
  await query('UPDATE otps SET expires_at = now() - interval \'1 second\' WHERE phone_hash=$1', [util.phoneHash(e)]);
  assert.equal((await c.post('/api/otp/verify', { phone, code })).status, 400, 'hết hạn');

  await ok(requestOtpRaw(c, phone));
  const code2 = provider.lastOtp(e);
  const wrong = code2 === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/otp/verify', { phone, code: wrong })).status, 400);
  const locked = await c.post('/api/otp/verify', { phone, code: code2 });
  assert.equal(locked.status, 429, 'quá 5 lần thử: mã đúng cũng bị khóa');
  assert.equal(locked.json.error.code, 'otp_locked');

  await ok(requestOtpRaw(c, phone));
  const code3 = provider.lastOtp(e);
  assert.equal((await c.post('/api/otp/verify', { phone, code: code2 })).status, 400, 'mã cũ vô hiệu khi đã có mã mới');
  assert.equal((await c.post('/api/otp/verify', { phone, code: code3 })).status, 200);
  assert.equal((await c.post('/api/otp/verify', { phone, code: code3 })).status, 400, 'một mã chỉ dùng một lần');
  // định dạng mã sai
  for (const bad of ['', '12345', '1234567', 'abcdef', null, 123456, ['123456']]) assert.equal((await c.post('/api/otp/verify', { phone, code: bad })).status, 400);
});

test('OTP: hạn mức theo số, IP, toàn hệ; tính SAU khi số hợp lệ; gửi đồng thời không vượt', async () => {
  await withConfig({ otpDailyPerPhone: 2, otpResendSec: 0 }, async () => {
    const c = new Client('l', freshIp()); const phone = newPhone();
    assert.equal((await requestOtpRaw(c, phone)).status, 200);
    assert.equal((await requestOtpRaw(c, phone)).status, 200);
    const r = await requestOtpRaw(c, phone);
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'otp_limit');
  });
  await withConfig({ otpDailyPerPhone: 100, otpResendSec: 60 }, async () => {
    const c = new Client('l', freshIp()); const phone = newPhone();
    assert.equal((await requestOtpRaw(c, phone)).status, 200);
    const r = await requestOtpRaw(c, phone);
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'otp_too_soon');
  });
  // số không hợp lệ: 400 và không tốn hạn mức nào
  await withConfig({ otpDailyPerIp: 2 }, async () => {
    const ip = freshIp(); const c = new Client('l', ip);
    for (let i = 0; i < 5; i++) assert.equal((await requestOtpRaw(c, '123')).status, 400);
    assert.equal((await requestOtpRaw(c, newPhone())).status, 200);
    assert.equal((await requestOtpRaw(c, newPhone())).status, 200);
    assert.equal((await requestOtpRaw(c, newPhone())).status, 429, 'quá 2 mã/IP/ngày');
    assert.equal((await requestOtpRaw(new Client('khac', freshIp()), newPhone())).status, 200, 'IP khác không bị ảnh hưởng');
  });
  // trần toàn hệ
  const before = (await query("SELECT count(*)::int AS n FROM otps WHERE created_at > now() - interval '24 hours'"))[0].n;
  await withConfig({ otpDailyGlobal: before + 1 }, async () => {
    assert.equal((await requestOtpRaw(new Client('g1', freshIp()), newPhone())).status, 200);
    const r = await requestOtpRaw(new Client('g2', freshIp()), newPhone());
    assert.equal(r.status, 503); assert.equal(r.json.error.code, 'otp_unavailable');
  });
  // đồng thời: 12 yêu cầu cùng số, hạn mức 3 -> đúng 3 mã được gửi
  await withConfig({ otpDailyPerPhone: 3, otpResendSec: 0 }, async () => {
    const phone = newPhone(); provider.resetSent();
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => requestOtpRaw(new Client('p' + i, freshIp()), phone)));
    assert.equal(rs.filter((r) => r.status === 200).length, 3, rs.map((r) => r.status).join());
    assert.equal(provider.sent.filter((s) => s.phone === util.normalizePhone(phone)).length, 3);
  });
});

test('OTP: phản hồi giống nhau dù số đã có tài khoản hay chưa', async () => {
  const a = await signup('Co TK', {});
  const c = new Client('d', freshIp());
  const r1 = await requestOtpRaw(c, a.phone);
  const r2 = await requestOtpRaw(c, newPhone());
  assert.equal(r1.status, r2.status);
  assert.deepEqual(r1.json, r2.json);
});

test('OTP: gửi lỗi thì 503 và dòng mã bị xóa (không tính hạn mức)', async () => {
  const c = new Client('f', freshIp()); const phone = newPhone();
  provider.setFailNext(1);
  const origErr = console.error; console.error = () => {};
  let r; try { r = await requestOtpRaw(c, phone); } finally { console.error = origErr; }
  assert.equal(r.status, 503);
  assert.equal((await query('SELECT count(*)::int AS n FROM otps WHERE phone_hash=$1', [util.phoneHash(util.normalizePhone(phone))]))[0].n, 0);
  assert.equal((await requestOtpRaw(c, phone)).status, 200);
});

test('vé xác minh dùng một lần: 6 yêu cầu đăng ký đồng thời chỉ một thắng', async () => {
  const c = new Client('t', freshIp()); const phone = newPhone();
  const { ticket } = await getTicket(c, phone);
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => new Client('t' + i, freshIp()).post('/api/register', { ticket, phone, name: 'Đua ' + i, password: PASS })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
  assert.equal((await query('SELECT count(*)::int AS n FROM users WHERE phone=$1', [util.normalizePhone(phone)]))[0].n, 1);
  // vé hết hạn / sai
  assert.equal((await c.post('/api/register', { ticket, phone, name: 'X', password: PASS })).status, 400);
  assert.equal((await c.post('/api/register', { ticket: 'a'.repeat(43), phone, name: 'X', password: PASS })).status, 400);
  assert.equal((await c.post('/api/register', { ticket: 123, phone, name: 'X', password: PASS })).status, 400);
  const p2 = newPhone(); const t2 = (await getTicket(c, p2)).ticket;
  await query("UPDATE tickets SET expires_at = now() - interval '1 second'");
  assert.equal((await c.post('/api/register', { ticket: t2, phone: p2, name: 'X', password: PASS })).status, 400);
});

test('số đã có tài khoản: đăng ký trả 409 nhưng vé còn dùng để đặt lại mật khẩu; đặt lại xóa mọi phiên', async () => {
  const a = await signup('Cũ', {});
  const a2 = new Client('a2', freshIp()); await ok(a2.post('/api/login', { phone: a.phone, password: PASS }));
  const c = new Client('r', freshIp());
  const v = await getTicket(c, a.phone);
  assert.equal(v.accountExists, true);
  assert.equal((await c.post('/api/register', { ticket: v.ticket, phone: a.phone, name: 'Kẻ lạ', password: 'MatKhau-Khac-9' })).status, 409);
  assert.equal((await c.post('/api/password/reset', { ticket: v.ticket, phone: a.phone, password: 'ngan' })).status, 400, 'mật khẩu yếu không đốt vé');
  const r = await c.post('/api/password/reset', { ticket: v.ticket, phone: a.phone, password: 'MoiHoanToan-77' });
  assert.equal(r.status, 200);
  assert.equal((await a.get('/api/me')).json.user, null, 'thiết bị cũ bị đăng xuất');
  assert.equal((await a2.get('/api/me')).json.user, null);
  assert.equal((await c.get('/api/me')).json.user.id, a.user.id, 'thiết bị đặt lại được đăng nhập');
  assert.equal((await new Client('x', freshIp()).post('/api/login', { phone: a.phone, password: PASS })).status, 401, 'mật khẩu cũ hết hiệu lực');
  assert.equal((await new Client('x', freshIp()).post('/api/login', { phone: a.phone, password: 'MoiHoanToan-77' })).status, 200);
  // số chưa có tài khoản: đặt lại -> 404 nhưng vé còn để đăng ký
  const c2 = new Client('r2', freshIp()); const p = newPhone();
  const v2 = await getTicket(c2, p);
  assert.equal(v2.accountExists, false);
  assert.equal((await c2.post('/api/password/reset', { ticket: v2.ticket, phone: p, password: PASS })).status, 404);
  assert.equal((await c2.post('/api/register', { ticket: v2.ticket, phone: p, name: 'Mới', password: PASS })).status, 200);
});

test('đăng nhập sai: thông báo giống nhau cho số có và không có tài khoản', async () => {
  const a = await signup('Sai', {});
  const c = new Client('s', freshIp());
  const r1 = await c.post('/api/login', { phone: a.phone, password: 'sai-mat-khau-1' });
  const r2 = await c.post('/api/login', { phone: newPhone(), password: 'sai-mat-khau-1' });
  assert.equal(r1.status, 401); assert.equal(r2.status, 401);
  assert.deepEqual(r1.json.error, r2.json.error);
  for (const bad of [{}, { phone: a.phone }, { phone: a.phone, password: 5 }, { phone: a.phone, password: '' }, { phone: a.phone, password: 'x'.repeat(300) }]) {
    const r = await c.post('/api/login', bad);
    assert.ok([400, 401].includes(r.status), JSON.stringify(bad));
  }
  assert.equal((await c.post('/api/login', { phone: 'abc', password: 'x' })).status, 400);
});

test('khóa tạm: theo (số, IP) có lùi dần; IP khác và số khác không bị ảnh hưởng; không cho kẻ lạ khóa chủ tài khoản', async () => {
  const a = await signup('Nạn nhân', {});
  const attackerIp = freshIp();
  const atk = new Client('kẻ tấn công', attackerIp);
  for (let i = 0; i < 5; i++) assert.equal((await atk.post('/api/login', { phone: a.phone, password: 'doan-sai-' + i })).status, 401);
  const locked = await atk.post('/api/login', { phone: a.phone, password: PASS });
  assert.equal(locked.status, 429, 'cặp (số, IP) bị khóa, kể cả mật khẩu đúng');
  assert.equal(locked.json.error.code, 'login_locked');
  assert.ok(locked.json.error.details.retryAfterSec > 0 && locked.headers.get('retry-after'));
  // chủ tài khoản ở IP khác vẫn vào được
  assert.equal((await new Client('chủ', freshIp()).post('/api/login', { phone: a.phone, password: PASS })).status, 200);
  // kẻ tấn công thử số khác ở cùng IP thì không bị khóa theo cặp
  const b = await signup('Người khác', {});
  assert.equal((await atk.post('/api/login', { phone: b.phone, password: PASS })).status, 200);
  // lùi dần: hết khóa lần 1 (ép về quá khứ) rồi sai tiếp thì khóa lâu hơn
  await query("UPDATE throttle SET locked_until = now() - interval '1 second' WHERE key LIKE 'lp:%'");
  for (let i = 0; i < 5; i++) await atk.post('/api/login', { phone: a.phone, password: 'lai-sai-' + i });
  const l2 = await atk.post('/api/login', { phone: a.phone, password: 'x' });
  assert.equal(l2.status, 429);
  assert.ok(l2.json.error.details.retryAfterSec > 35, 'khóa lần 2 dài hơn 30 giây: ' + l2.json.error.details.retryAfterSec);
});

test('khóa theo số (mọi IP) và theo IP; đường thoát bằng quên mật khẩu', async () => {
  await withConfig({ loginPhoneLimit: 4, loginPairLimit: 100, loginIpLimit: 100000 }, async () => {
    const a = await signup('Bị dò', {});
    for (let i = 0; i < 4; i++) assert.equal((await new Client('d' + i, freshIp()).post('/api/login', { phone: a.phone, password: 'sai-' + i })).status, 401);
    assert.equal((await new Client('chủ', freshIp()).post('/api/login', { phone: a.phone, password: PASS })).status, 429, 'khóa theo số');
    // quên mật khẩu không bị khóa đăng nhập chặn và gỡ khóa
    const c = new Client('r', freshIp());
    const v = await getTicket(c, a.phone);
    assert.equal((await c.post('/api/password/reset', { ticket: v.ticket, phone: a.phone, password: 'DaDoiXong-55' })).status, 200);
    assert.equal((await new Client('chủ', freshIp()).post('/api/login', { phone: a.phone, password: 'DaDoiXong-55' })).status, 200);
  });
  await withConfig({ loginIpLimit: 3, loginPairLimit: 100, loginPhoneLimit: 100 }, async () => {
    const ip = freshIp(); const c = new Client('i', ip);
    for (let i = 0; i < 3; i++) await c.post('/api/login', { phone: newPhone(), password: 'x' + i });
    const r = await c.post('/api/login', { phone: newPhone(), password: 'y' });
    assert.equal(r.status, 429);
    assert.equal((await new Client('khac', freshIp()).post('/api/login', { phone: newPhone(), password: 'y' })).status, 401);
  });
});

test('tài khoản cũ mật khẩu ngắn: vẫn đăng nhập được, bị nhắc đổi; băm cũ ít vòng được băm lại', async () => {
  const phone = '+84912999001';
  const weak = await pw.hash('abc123');
  await query('INSERT INTO users(phone, display_name, password_hash) VALUES($1,$2,$3)', [phone, 'Cũ', weak]);
  const c = new Client('w', freshIp());
  const r = await c.post('/api/login', { phone: '0912999001', password: 'abc123' });
  assert.equal(r.status, 200); assert.equal(r.json.mustChangePassword, true);
  assert.equal((await c.get('/api/me')).json.user.passwordWeak, true);
  assert.equal((await c.post('/api/account/password', { currentPassword: 'abc123', newPassword: 'abc12' })).status, 400, 'mật khẩu mới phải >= 8');
  assert.equal((await c.post('/api/account/password', { currentPassword: 'abc123', newPassword: 'MatKhauDaiHon-1' })).status, 200);
  assert.equal((await c.get('/api/me')).json.user.passwordWeak, false);
  // băm 1000 vòng (kiểu cũ) được nâng lên 200.000
  const salt = 'ab'.repeat(8);
  const dk = (await import('node:crypto')).pbkdf2Sync('MatKhauMuoi-9', salt, 1000, 32, 'sha256').toString('hex');
  await query('INSERT INTO users(phone, display_name, password_hash) VALUES($1,$2,$3)', ['+84912999002', 'Cũ2', `pbkdf2$1000$${salt}$${dk}`]);
  assert.equal((await new Client('w2', freshIp()).post('/api/login', { phone: '0912999002', password: 'MatKhauMuoi-9' })).status, 200);
  const row = (await query('SELECT password_hash FROM users WHERE phone=$1', ['+84912999002']))[0];
  assert.match(row.password_hash, /^pbkdf2\$200000\$/);
});

test('phiên: trượt 90 ngày ở máy chủ, gia hạn cookie khi dùng, token lạ bị bỏ qua', async () => {
  const a = await signup('Phiên', {});
  const hash = sha256hex(tokenOf(a));
  await query("UPDATE sessions SET last_used_at = now() - interval '91 days' WHERE token_hash=$1", [hash]);
  assert.equal((await a.get('/api/me')).json.user, null, 'quá 90 ngày không dùng: hết hạn ở máy chủ');
  const b = await signup('Phiên 2', {});
  const h2 = sha256hex(tokenOf(b));
  await query("UPDATE sessions SET last_used_at = now() - interval '89 days' WHERE token_hash=$1", [h2]);
  const r = await b.get('/api/me');
  assert.ok(r.json.user, 'còn hạn');
  assert.ok(r.setCookie.some((x) => x.startsWith('nine_sid=') && /Max-Age=31536000/.test(x)), 'cookie được cấp lại hạn mới');
  const after = (await query('SELECT last_used_at > now() - interval \'1 minute\' AS fresh FROM sessions WHERE token_hash=$1', [h2]))[0];
  assert.equal(after.fresh, true, 'trượt: last_used_at được làm mới');
  // cookie đúng định dạng nhưng không do máy chủ cấp / định dạng sai
  const f = new Client('fake'); f.cookie = 'nine_sid=' + 'A'.repeat(43);
  const rr = await f.get('/api/me'); assert.equal(rr.json.user, null); assert.equal(rr.setCookie.length, 0, 'không cấp lại cookie cho token lạ');
  f.cookie = 'nine_sid=' + encodeURIComponent("' OR 1=1 --"); assert.equal((await f.get('/api/me')).json.user, null);
  f.cookie = 'nine_sid=' + 'A'.repeat(500); assert.equal((await f.get('/api/me')).json.user, null);
});

test('thiết bị: liệt kê, đăng xuất từng máy, đăng xuất các máy khác, đăng xuất tất cả; không đụng phiên người khác', async () => {
  const a = await signup('TB', {});
  const a2 = new Client('a2', freshIp()); const a3 = new Client('a3', freshIp());
  await ok(a2.post('/api/login', { phone: a.phone, password: PASS }, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari/604' } }));
  await ok(a3.post('/api/login', { phone: a.phone, password: PASS }));
  const list = (await ok(a.get('/api/sessions'))).sessions;
  assert.equal(list.length, 3); assert.equal(list.filter((s) => s.current).length, 1);
  assert.ok(list.some((s) => /iPhone/.test(s.device)));
  assert.ok(!JSON.stringify(list).includes(tokenOf(a)) && !JSON.stringify(list).includes(sha256hex(tokenOf(a))), 'không lộ token/băm');
  const other = list.find((s) => !s.current);
  const stranger = await signup('Người lạ', {});
  assert.equal((await stranger.del('/api/sessions/' + other.id)).status, 404, 'IDOR: không xóa được phiên người khác');
  assert.equal((await a.del('/api/sessions/' + other.id)).status, 200);
  assert.equal((await ok(a.get('/api/sessions'))).sessions.length, 2);
  assert.equal((await a.post('/api/sessions/revoke-others')).json.revoked, 1);
  assert.equal((await a.get('/api/me')).json.user.id, a.user.id);
  assert.equal((await a.post('/api/logout-all')).status, 200);
  assert.equal((await a.get('/api/sessions')).status, 401);
  assert.equal((await stranger.get('/api/me')).json.user.id, stranger.user.id);
  // đăng xuất một máy
  const b = await signup('Out', {}); assert.equal((await b.post('/api/logout')).status, 200); assert.equal(b.cookie, '');
});

test('đổi mật khẩu: cần mật khẩu hiện tại, đăng xuất các máy khác, giữ máy này; sai nhiều lần thì khóa', async () => {
  const a = await signup('Đổi MK', {});
  const a2 = new Client('a2', freshIp()); await ok(a2.post('/api/login', { phone: a.phone, password: PASS }));
  assert.equal((await a.post('/api/account/password', { currentPassword: 'sai-roi-nhe', newPassword: 'MatKhauMoi-123' })).status, 403);
  assert.equal((await a.post('/api/account/password', { currentPassword: PASS, newPassword: PASS })).status, 200, 'đổi sang chính nó vẫn hợp lệ');
  assert.equal((await a.post('/api/account/password', { currentPassword: PASS, newPassword: 'MatKhauMoi-123' })).status, 200);
  assert.equal((await a.get('/api/me')).json.user.id, a.user.id, 'máy này còn đăng nhập');
  assert.equal((await a2.get('/api/me')).json.user, null, 'máy khác bị đăng xuất');
  assert.equal((await new Client('x', freshIp()).post('/api/login', { phone: a.phone, password: PASS })).status, 401);
  for (let i = 0; i < 5; i++) await a.post('/api/account/password', { currentPassword: 'sai-' + i, newPassword: 'MatKhauMoi-456' });
  const l = await a.post('/api/account/password', { currentPassword: 'MatKhauMoi-123', newPassword: 'MatKhauMoi-456' });
  assert.equal(l.status, 429, 'bị khóa sau nhiều lần sai');
  assert.equal((await a.post('/api/account/name', { name: 'Tên Mới' })).json.displayName, 'Tên Mới');
  assert.equal((await a.post('/api/account/name', { name: '   ' })).status, 400);
});

// ---------- nhập tài khoản 9Sport: chỉ sau khi xác minh OTP số điện thoại ----------
function fakeSport() {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const f = new URLSearchParams(body);
      calls.push({ url: req.url, sdt: f.get('sdt'), pw: f.get('mat_khau') });
      if (req.url === '/dang-nhap' && f.get('sdt') === '0987000111' && f.get('mat_khau') === 'sport12') {
        res.writeHead(303, { location: '/?tb=' + encodeURIComponent('Xin chào, Minh Sport'), 'set-cookie': 'k77_nd=abc123; Path=/; HttpOnly' });
      } else if (req.url === '/dang-nhap' && f.get('sdt') === '0987000222') {
        res.writeHead(303, { location: '/?tb=x' }); // chuyển hướng nhưng KHÔNG có cookie: thất bại
      } else res.writeHead(200);
      res.end('x');
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, calls, url: 'http://127.0.0.1:' + srv.address().port })));
}

test('đăng nhập KHÔNG bao giờ gọi 9Sport; số lạ trả lời y hệt số có tài khoản + sai mật khẩu', async () => {
  const sport = await fakeSport();
  try {
    await withConfig({ sso9sportUrl: sport.url }, async () => {
      const a = await signup('Có TK', {});
      const c = new Client('s', freshIp());
      const r1 = await c.post('/api/login', { phone: '0987000111', password: 'sport12' }); // mật khẩu đúng ở 9Sport nhưng số chưa có ở 9id
      const r2 = await c.post('/api/login', { phone: a.phone, password: 'sai-mat-khau-9' });
      assert.equal(r1.status, 401); assert.equal(r2.status, 401);
      assert.deepEqual(r1.json.error, r2.json.error);
      assert.equal(sport.calls.length, 0, 'không gọi 9Sport trong luồng đăng nhập thường');
      assert.equal((await query("SELECT count(*)::int AS n FROM users WHERE phone='+84987000111'"))[0].n, 0);
    });
  } finally { sport.srv.close(); }
});

test('nhập 9Sport: bắt buộc OTP trước, rồi kiểm mật khẩu 9Sport; sai thì không; tắt khi để trống; 9Sport chết thì 503', async () => {
  const sport = await fakeSport();
  try {
    await withConfig({ sso9sportUrl: sport.url }, async () => {
      const c = new Client('s', freshIp());
      assert.equal((await c.get('/api/register/9sport/enabled')).json.enabled, true);
      // chưa có vé: không gọi 9Sport
      assert.equal((await c.post('/api/register/9sport', { ticket: 'a'.repeat(43), phone: '0987000111', sportPassword: 'sport12' })).status, 400);
      assert.equal(sport.calls.length, 0, 'chưa xác minh OTP thì không đụng tới 9Sport');
      // vé của số KHÁC không dùng được cho số này
      const other = await getTicket(c, newPhone());
      assert.equal((await c.post('/api/register/9sport', { ticket: other.ticket, phone: '0987000111', sportPassword: 'sport12' })).status, 400);
      assert.equal(sport.calls.length, 0);
      const t = await getTicket(c, '0987000111');
      assert.equal(t.accountExists, false);
      assert.equal((await c.post('/api/register/9sport', { ticket: t.ticket, phone: '0987000111', sportPassword: 'sai-mk-sport' })).status, 401);
      assert.equal((await c.post('/api/register/9sport', { ticket: t.ticket, phone: '0987000111', sportPassword: 'sport12', newPassword: 'ngan' })).status, 400, 'mật khẩu mới yếu không đốt vé');
      const r = await c.post('/api/register/9sport', { ticket: t.ticket, phone: '0987000111', sportPassword: 'sport12' });
      assert.equal(r.status, 200);
      assert.equal(r.json.user.displayName, 'Minh Sport'); assert.equal(r.json.user.source, '9sport');
      assert.equal(r.json.mustChangePassword, true, 'mật khẩu 9Sport ngắn hơn 8: nhắc đổi');
      const u = (await query("SELECT source, password_hash FROM users WHERE phone='+84987000111'"))[0];
      assert.equal(u.source, '9sport'); assert.match(u.password_hash, /^pbkdf2\$200000\$/);
      assert.ok(sport.calls.every((x) => x.url === '/dang-nhap' && /^0\d{9}$/.test(x.sdt)), 'gửi số dạng 0xxxxxxxxx');
      // đăng nhập lần sau bằng mật khẩu đó, không gọi 9Sport
      const n = sport.calls.length;
      assert.equal((await new Client('s2', freshIp()).post('/api/login', { phone: '0987000111', password: 'sport12' })).status, 200);
      assert.equal(sport.calls.length, n);
      // số đã có tài khoản thì 409 (vé còn dùng được để đặt lại mật khẩu)
      const t2 = await getTicket(c, '0987000111');
      assert.equal(t2.accountExists, true);
      assert.equal((await c.post('/api/register/9sport', { ticket: t2.ticket, phone: '0987000111', sportPassword: 'sport12' })).status, 409);
      // 9Sport trả chuyển hướng nhưng không có cookie k77_nd: không tin
      const t3 = await getTicket(c, '0987000222');
      assert.equal((await c.post('/api/register/9sport', { ticket: t3.ticket, phone: '0987000222', sportPassword: 'bat-ky' })).status, 401);
    });
    await withConfig({ sso9sportUrl: '' }, async () => {
      const c = new Client('s3', freshIp());
      assert.equal((await c.get('/api/register/9sport/enabled')).json.enabled, false);
      const t = await getTicket(c, newPhone());
      assert.equal((await c.post('/api/register/9sport', { ticket: t.ticket, phone: t.phone, sportPassword: 'sport12' })).status, 404);
    });
    await withConfig({ sso9sportUrl: 'http://127.0.0.1:1', sso9sportTimeoutMs: 500 }, async () => {
      const c = new Client('s4', freshIp()); const t = await getTicket(c, newPhone());
      assert.equal((await c.post('/api/register/9sport', { ticket: t.ticket, phone: t.phone, sportPassword: 'sport12' })).status, 503);
    });
  } finally { sport.srv.close(); }
});

test('nhập 9Sport có thể đặt mật khẩu mới; hai yêu cầu đồng thời chỉ tạo một tài khoản', async () => {
  const sport = await fakeSport();
  try {
    await withConfig({ sso9sportUrl: sport.url }, async () => {
      await query("DELETE FROM users WHERE phone='+84987000111'");
      const c = new Client('p', freshIp());
      const t = await getTicket(c, '0987000111');
      const rs = await Promise.all(Array.from({ length: 4 }, (_, i) => new Client('p' + i, freshIp()).post('/api/register/9sport', { ticket: t.ticket, phone: '0987000111', sportPassword: 'sport12', newPassword: 'MatKhauMoi-9' + i })));
      assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
      assert.equal((await query("SELECT count(*)::int AS n FROM users WHERE phone='+84987000111'"))[0].n, 1);
    });
  } finally { sport.srv.close(); }
});

// ---------- bảo vệ yêu cầu ----------
test('CSRF: thiếu header, Origin lạ, Sec-Fetch-Site cross-site đều bị từ chối; GET không đổi trạng thái', async () => {
  const a = await signup('CSRF', {});
  assert.equal((await a.post('/api/account/name', { name: 'Hack' }, { csrf: false })).status, 403);
  assert.equal((await a.post('/api/account/name', { name: 'Hack' }, { origin: 'https://evil.com' })).status, 403);
  assert.equal((await a.post('/api/account/name', { name: 'Hack' }, { origin: 'null' })).status, 403);
  assert.equal((await a.post('/api/account/name', { name: 'Hack' }, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await a.post('/api/account/name', { name: 'Ổn' }, { origin: new URL(base).origin })).status, 200);
  assert.equal((await a.post('/api/logout', {}, { csrf: false })).status, 403, 'đăng xuất cũng cần header');
  assert.equal((await a.post('/api/login', { phone: a.phone, password: PASS }, { csrf: false })).status, 403, 'đăng nhập cũng cần header (chống login CSRF)');
  assert.equal((await a.get('/api/me')).json.user.displayName, 'Ổn');
  assert.equal((await a.req('GET', '/api/logout')).status, 405);
});

test('đầu vào hỏng: JSON sai, mảng, quá lớn; không lộ stack', async () => {
  const c = new Client('j');
  const r1 = await fetch(base + '/api/login', { method: 'POST', headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(r1.status, 400);
  const r2 = await fetch(base + '/api/login', { method: 'POST', headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }, body: '[1]' });
  assert.equal(r2.status, 400);
  const r3 = await fetch(base + '/api/login', { method: 'POST', headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }, body: JSON.stringify({ phone: 'x', pad: 'y'.repeat(70000) }) });
  assert.equal(r3.status, 413);
  const r4 = await c.get('/api/khong-co'); assert.equal(r4.status, 404);
  assert.ok(!/at .*\.js/.test(r4.buf.toString()));
});

test('next trong phản hồi đăng nhập được làm sạch (open redirect)', async () => {
  const a = await signup('Next', {});
  const c = new Client('n', freshIp());
  const cases = { '/tutor/': '/tutor/', '/9family/#/lich': '/9family/#/lich', '//evil.com': null, '/\\evil.com': null, 'https://evil.com': null, 'javascript:alert(1)': null, '/\t/evil.com': null, '': null };
  for (const [next, want] of Object.entries(cases)) {
    const r = await c.post('/api/login', { phone: a.phone, password: PASS, next });
    assert.equal(r.status, 200); assert.equal(r.json.next, want, JSON.stringify(next));
    assert.equal((await c.get('/api/next?next=' + encodeURIComponent(next))).json.next, want);
  }
  assert.equal((await c.post('/api/login', { phone: a.phone, password: PASS, next: { a: 1 } })).json.next, null);
});

test('IP giới hạn: lấy phần tử CUỐI của X-Forwarded-For (khách không giả được) và gom IPv6 /64', async () => {
  await withConfig({ otpDailyPerIp: 2, otpResendSec: 0 }, async () => {
    const real = freshIp();
    for (let i = 0; i < 2; i++) {
      const c = new Client('x'); c.ip = `${i}.${i}.${i}.${i}, ${real}`; // khách chèn IP giả ở đầu
      assert.equal((await requestOtpRaw(c, newPhone())).status, 200);
    }
    const c3 = new Client('x'); c3.ip = `9.9.9.9, ${real}`;
    assert.equal((await requestOtpRaw(c3, newPhone())).status, 429, 'đổi IP giả ở đầu không né được');
    // IPv6 cùng /64
    const p = `2001:db8:${(ipSeq++).toString(16)}:7`;
    for (let i = 1; i <= 2; i++) { const c = new Client('v6'); c.ip = `${p}::${i}`; assert.equal((await requestOtpRaw(c, newPhone())).status, 200); }
    const c6 = new Client('v6'); c6.ip = `${p}:aaaa:bbbb:cccc:dddd`;
    assert.equal((await requestOtpRaw(c6, newPhone())).status, 429, 'cùng /64 dùng chung hạn mức');
  });
});

test('nhật ký không chứa số điện thoại, mã OTP hay mật khẩu', async () => {
  const lines = [];
  const ol = console.log; const oe = console.error; const ow = console.warn;
  console.log = (...a) => lines.push(a.join(' ')); console.error = (...a) => lines.push(a.join(' ')); console.warn = console.log;
  const phone = newPhone(); const secret = 'BiMat-Khong-Duoc-Lo-42';
  try {
    const c = new Client('log', freshIp());
    await requestOtpRaw(c, phone);
    const code = provider.lastOtp(util.normalizePhone(phone));
    const v = await c.post('/api/otp/verify', { phone, code });
    await c.post('/api/register', { ticket: v.json.ticket, phone, name: 'Log', password: secret });
    await c.post('/api/login', { phone, password: 'sai-' + secret });
    provider.setFailNext(1);
    await requestOtpRaw(new Client('log2', freshIp()), newPhone());
    await c.post('/api/login', { phone, password: secret });
    await c.post('/api/login', '{bad');
  } finally { console.log = ol; console.error = oe; console.warn = ow; }
  const all = lines.join('\n');
  assert.ok(!all.includes(secret) && !all.includes(phone) && !all.includes(phone.slice(1)), all.slice(0, 500));
});
