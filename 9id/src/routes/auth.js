import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import * as pw from '../password.js';
import * as sso from '../sso9sport.js';
import { createSession, audit, COOKIE } from '../auth.js';
import { requestOtp, verifyOtp, peekTicket, consumeTicket, ipKey } from '../otp.js';
import { issueChallenge } from '../pow.js';
import { assertNotLocked, recordFailure, clear } from '../throttle.js';
import { cleanText, normalizePhone, phoneHash, phoneHashes, safeNext, sha256hex, newToken, TOKEN_RE } from '../util.js';

const BAD_LOGIN = () => new ApiError(401, 'invalid_credentials', 'Số điện thoại hoặc mật khẩu không đúng');
const NAME_OPTS = { min: 1, max: 40, field: 'Tên hiển thị' };
export const DEVICE_COOKIE = 'nine_dev';
const DEVICE_DAYS = 365;

export const publicUser = (u) => ({ id: u.id, displayName: u.displayName ?? u.display_name, phoneLast4: String(u.phone).slice(-4), source: u.source, passwordWeak: !!(u.passwordWeak ?? u.password_weak), createdAt: u.createdAt ?? u.created_at });

export async function pendingInvitationCount(phone) {
  const r = await query("SELECT count(*)::int AS n FROM invitations WHERE phone_hash = ANY($1) AND status='pending' AND expires_at > now()", [phoneHashes(phone)]);
  return r[0].n;
}
// số lời nhận đang chờ DUYỆT ở các gia đình mà người này là chủ/quản lý
export async function pendingApprovalCount(userId) {
  const r = await query(
    `SELECT count(*)::int AS n FROM invitations i JOIN memberships m ON m.family_id = i.family_id AND m.user_id = $1 AND m.left_at IS NULL AND m.role IN ('chu','quan_ly')
      WHERE i.status='awaiting' AND i.expires_at > now()`, [userId]);
  return r[0].n;
}
export async function unseenNotices(userId) {
  return (await query('SELECT id, kind, created_at FROM notices WHERE user_id=$1 AND seen_at IS NULL ORDER BY id DESC LIMIT 5', [userId])).map((n) => ({ id: n.id, kind: n.kind, at: n.created_at }));
}

function loginKeys(phone, ip) {
  const ph = phoneHash(phone).slice(0, 32);
  const ipk = ipKey(ip);
  return { pair: `lp:${ph}:${ipk}`, phone: `lh:${ph}`, ip: `li:${ipk}`, ph };
}

// Thiết bị quen: cookie nine_dev ngẫu nhiên (chỉ lưu băm), đặt khi đăng nhập thành công. Thiết bị đã từng đăng nhập đúng tài khoản
// được miễn khóa theo số (chỉ chịu độ trễ theo cặp số + IP), nên kẻ lạ ở nhiều IP không khóa được chủ thật trên máy quen.
async function knownDevice(ctx, userId) {
  const t = ctx.cookies[DEVICE_COOKIE];
  if (!t || !TOKEN_RE.test(t) || !userId) return false;
  return (await query('SELECT 1 FROM devices WHERE token_hash=$1 AND user_id=$2', [sha256hex(t), userId])).length > 0;
}
export async function rememberDevice(ctx, userId) {
  let t = ctx.cookies[DEVICE_COOKIE];
  if (t && TOKEN_RE.test(t)) {
    const r = await query('UPDATE devices SET last_used_at = now() WHERE token_hash=$1 AND user_id=$2 RETURNING 1', [sha256hex(t), userId]);
    if (r.length) { ctx.setCookie(DEVICE_COOKIE, t, { maxAge: DEVICE_DAYS * 86400 }); return; }
  }
  t = newToken();
  await query('INSERT INTO devices(token_hash, user_id) VALUES($1,$2)', [sha256hex(t), userId]);
  await query('DELETE FROM devices WHERE user_id=$1 AND token_hash NOT IN (SELECT token_hash FROM devices WHERE user_id=$1 ORDER BY last_used_at DESC LIMIT 20)', [userId]);
  ctx.setCookie(DEVICE_COOKIE, t, { maxAge: DEVICE_DAYS * 86400 });
}

// Thông báo "thiết bị mới" (chỉ khi đăng nhập thường): thiết bị không quen mà tài khoản đã có phiên khác đang hiệu lực.
// Không kèm số điện thoại hay IP; tối đa một thông báo mỗi giờ. Phiên vừa tạo không nhận thông báo về chính nó.
async function shouldNoteNewDevice(ctx, userId) {
  if (await knownDevice(ctx, userId)) return false;
  const others = (await query("SELECT count(*)::int AS n FROM sessions WHERE user_id=$1 AND last_used_at > now() - make_interval(days => $2)", [userId, config.sessionDays]))[0].n;
  if (!others) return false;
  const recent = (await query("SELECT 1 FROM notices WHERE user_id=$1 AND kind='new_device' AND created_at > now() - interval '1 hour'", [userId])).length;
  return !recent;
}

async function startSession(ctx, userRow, extra = {}, { notifyNewDevice = false } = {}) {
  const noteNew = notifyNewDevice ? await shouldNoteNewDevice(ctx, userRow.id) : false;
  await createSession({ query }, ctx, userRow.id);
  await rememberDevice(ctx, userRow.id);
  const u = { id: userRow.id, phone: userRow.phone, displayName: userRow.display_name, passwordWeak: userRow.password_weak, source: userRow.source, createdAt: userRow.created_at };
  const notices = await unseenNotices(userRow.id);
  if (noteNew) await query("INSERT INTO notices(user_id, kind) VALUES($1,'new_device')", [userRow.id]);
  return { user: publicUser(u), next: safeNext(ctx.body.next), notices, ...extra };
}

export function authRoutes(app) {
  // ---------- OTP ----------
  app.route('GET', '/api/otp/challenge', async () => issueChallenge(), { limit: 60, limitKey: 'otp-chal' });

  app.route('POST', '/api/otp/request', async (ctx) => {
    const phone = normalizePhone(ctx.body.phone);
    return requestOtp(phone, ctx.ip, { purpose: ctx.body.purpose === undefined ? 'register' : ctx.body.purpose, pow: ctx.body.pow });
  }, { limit: 20, limitKey: 'otp-req' });

  app.route('POST', '/api/otp/verify', async (ctx) => {
    const phone = normalizePhone(ctx.body.phone);
    return verifyOtp(phone, ctx.body.code, ctx.ip);
  }, { limit: 30, limitKey: 'otp-verify' });

  // ---------- đăng ký ----------
  app.route('POST', '/api/register', async (ctx) => {
    const name = cleanText(ctx.body.name, NAME_OPTS);
    const phone = await peekTicket(ctx.body.ticket, ctx.body.phone);
    const password = pw.check(ctx.body.password, phone);
    const hash = await pw.hash(password);
    const user = await tx(async (c) => {
      await consumeTicket(c, ctx.body.ticket, phone);
      const u = (await c.query(
        `INSERT INTO users(phone, display_name, password_hash) VALUES($1,$2,$3) ON CONFLICT (phone) DO NOTHING RETURNING *`, [phone, name, hash]))[0];
      if (!u) throw new ApiError(409, 'account_exists', 'Số điện thoại này đã có tài khoản 9app. Hãy đăng nhập hoặc chọn "Quên mật khẩu".');
      await audit(c, u.id, 'register');
      return u;
    });
    return startSession(ctx, user);
  }, { limit: 20, limitKey: 'register' });

  // ---------- nhập tài khoản 9Sport: PHẢI xác minh OTP số điện thoại trước, rồi mới kiểm mật khẩu 9Sport ----------
  app.route('POST', '/api/register/9sport', async (ctx) => {
    if (!sso.enabled()) throw new ApiError(404, 'sso_disabled', 'Tính năng nhập tài khoản 9Sport chưa được bật');
    const phone = await peekTicket(ctx.body.ticket, ctx.body.phone);
    const sportPassword = ctx.body.sportPassword;
    if (typeof sportPassword !== 'string' || !sportPassword || sportPassword.length > 200) throw new ApiError(401, 'sport_invalid', 'Mật khẩu 9Sport không đúng');
    const newPassword = ctx.body.newPassword === undefined || ctx.body.newPassword === '' ? null : pw.check(ctx.body.newPassword, phone);
    if ((await query('SELECT 1 FROM users WHERE phone=$1', [phone])).length) throw new ApiError(409, 'account_exists', 'Số điện thoại này đã có tài khoản 9app. Hãy đăng nhập hoặc chọn "Quên mật khẩu".');
    const k = loginKeys(phone, ctx.ip);
    await assertNotLocked([k.pair, k.ip]);
    const r = await sso.verify('0' + phone.slice(3), sportPassword);
    if (!r.ok) {
      await recordFailure(k.pair, { limit: config.loginPairLimit, base: 30, maxLock: 3600, backoff: true });
      await recordFailure(k.ip, { limit: config.loginIpLimit, base: 600, backoff: false });
      throw new ApiError(r.error ? 503 : 401, r.error ? 'sport_unavailable' : 'sport_invalid', r.error ? 'Không kết nối được 9Sport lúc này, hãy thử lại sau' : 'Số điện thoại hoặc mật khẩu 9Sport không đúng');
    }
    const name = cleanText(r.name || '', { max: 40 }) || cleanText(ctx.body.name || '', { max: 40 }) || 'Người dùng ' + phone.slice(-4);
    const finalPass = newPassword || sportPassword;
    const hash = await pw.hash(finalPass);
    const user = await tx(async (c) => {
      await consumeTicket(c, ctx.body.ticket, phone);
      const u = (await c.query(
        `INSERT INTO users(phone, display_name, password_hash, password_weak, source) VALUES($1,$2,$3,$4,'9sport') ON CONFLICT (phone) DO NOTHING RETURNING *`,
        [phone, name, hash, pw.isWeakLegacy(finalPass)]))[0];
      if (!u) throw new ApiError(409, 'account_exists', 'Số điện thoại này đã có tài khoản 9app.');
      await audit(c, u.id, 'import_9sport');
      return u;
    });
    await clear([k.pair]);
    return startSession(ctx, user, { mustChangePassword: user.password_weak });
  }, { limit: 20, limitKey: 'register-sport' });

  app.route('GET', '/api/register/9sport/enabled', async () => ({ enabled: sso.enabled() }));

  // ---------- quên mật khẩu ----------
  app.route('POST', '/api/password/reset', async (ctx) => {
    const phone = await peekTicket(ctx.body.ticket, ctx.body.phone);
    const password = pw.check(ctx.body.password, phone);
    const hash = await pw.hash(password);
    const user = await tx(async (c) => {
      await consumeTicket(c, ctx.body.ticket, phone);
      const u = (await c.query('SELECT * FROM users WHERE phone=$1 FOR UPDATE', [phone]))[0];
      if (!u) throw new ApiError(404, 'no_account', 'Số này chưa có tài khoản. Hãy đăng ký.');
      await c.query('UPDATE users SET password_hash=$2, password_weak=false WHERE id=$1', [u.id, hash]);
      // đặt lại mật khẩu: mọi thiết bị phải đăng nhập lại, thiết bị quen cũng bị quên
      await c.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
      await c.query('DELETE FROM devices WHERE user_id=$1', [u.id]);
      await c.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
      const ph = phoneHash(phone).slice(0, 32);
      await c.query('DELETE FROM throttle WHERE key LIKE $1 OR key = $2', [`lp:${ph}:%`, `lh:${ph}`]);
      // thông báo cho chủ thật: hiện ở lần đăng nhập/mở ứng dụng kế tiếp trên bất kỳ thiết bị nào (phòng SIM bị thu hồi/cấp lại)
      await c.query("INSERT INTO notices(user_id, kind) VALUES($1,'password_reset')", [u.id]);
      await audit(c, u.id, 'password_reset');
      return { ...u, password_weak: false };
    });
    return startSession(ctx, user);
  }, { limit: 20, limitKey: 'pw-reset' });

  // ---------- đăng nhập ----------
  // Số lạ trả lời Y HỆT số có tài khoản + sai mật khẩu (băm giả cho đều thời gian). Không gọi 9Sport ở đây.
  app.route('POST', '/api/login', async (ctx) => {
    const phone = normalizePhone(ctx.body.phone);
    const password = ctx.body.password;
    if (typeof password !== 'string' || password.length < 1 || password.length > 200) throw BAD_LOGIN();
    const k = loginKeys(phone, ctx.ip);
    let user = (await query('SELECT * FROM users WHERE phone=$1', [phone]))[0];
    const known = user ? await knownDevice(ctx, user.id) : false;
    // khóa tạm kiểm TRƯỚC khi băm mật khẩu. Khóa theo số chỉ áp cho thiết bị lạ.
    await assertNotLocked(known ? [k.pair, k.ip] : [k.pair, k.phone, k.ip]);
    let ok = false;
    if (user) ok = await pw.verify(password, user.password_hash);
    else await pw.dummyVerify(password);
    if (!ok) {
      await recordFailure(k.pair, { limit: config.loginPairLimit, base: 30, maxLock: 3600, backoff: true });
      if (!known) await recordFailure(k.phone, { limit: config.loginPhoneLimit, base: 600, backoff: false });
      await recordFailure(k.ip, { limit: config.loginIpLimit, base: 600, backoff: false });
      throw BAD_LOGIN();
    }
    await clear([k.pair]);
    // tài khoản cũ mật khẩu ngắn: nhắc đổi (không ép); băm cũ ít vòng: băm lại
    const weak = pw.isWeakLegacy(password);
    if (weak !== user.password_weak || pw.needsRehash(user.password_hash)) {
      const nh = pw.needsRehash(user.password_hash) ? await pw.hash(password) : user.password_hash;
      await query('UPDATE users SET password_weak=$2, password_hash=$3, last_seen_at=now() WHERE id=$1', [user.id, weak, nh]);
      user = { ...user, password_weak: weak };
    } else {
      await query('UPDATE users SET last_seen_at=now() WHERE id=$1', [user.id]);
    }
    return startSession(ctx, user, { mustChangePassword: user.password_weak }, { notifyNewDevice: true });
  }, { limit: 60, limitKey: 'login' });

  // ---------- phiên hiện tại ----------
  app.route('GET', '/api/me', async (ctx) => {
    const u = ctx.user;
    if (!u) return { user: null };
    return { user: publicUser(u), pendingInvitations: await pendingInvitationCount(u.phone), pendingApprovals: await pendingApprovalCount(u.id), notices: await unseenNotices(u.id) };
  });

  app.route('POST', '/api/notices/seen', async (ctx) => {
    if (!ctx.user) throw new ApiError(401, 'unauthorized', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.');
    await query('UPDATE notices SET seen_at = now() WHERE user_id=$1 AND seen_at IS NULL', [ctx.user.id]);
    return { ok: true };
  });

  app.route('GET', '/api/next', async (ctx) => ({ next: safeNext(ctx.query.next) }));

  app.route('POST', '/api/logout', async (ctx) => {
    if (ctx.sid) await query('DELETE FROM sessions WHERE token_hash=$1', [ctx.sid]);
    ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  });
}
