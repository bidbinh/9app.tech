import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { ApiError } from './errors.js';
import * as pw from './password.js';
import { newSecret, otpauthUri, verifyTotp } from './totp.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const lockMs = () => config.loginLockMin * 60_000;
const USER_RE = /^[a-z0-9._-]{3,40}$/;

export async function createAdmin(username, password) {
  const u = String(username || '').trim().toLowerCase();
  if (!USER_RE.test(u)) throw new ApiError(400, 'invalid_request', 'Tên đăng nhập gồm 3-40 ký tự a-z, 0-9, . _ -');
  pw.check(password, u);
  if (String(password).length < 10) throw new ApiError(400, 'weak_password', 'Mật khẩu quản trị cần ít nhất 10 ký tự');
  const secret = newSecret();
  await query('INSERT INTO admins(username, password_hash, totp_secret) VALUES($1,$2,$3)', [u, await pw.hash(password), secret]);
  return { username: u, totpSecret: secret, otpauth: otpauthUri(secret, u) };
}

async function assertNotLocked(keys) {
  const r = await query('SELECT max(locked_until) l FROM auth_failures WHERE key = ANY($1::text[]) AND locked_until > now()', [keys]);
  if (r[0] && r[0].l) {
    const m = Math.max(1, Math.ceil((new Date(r[0].l) - Date.now()) / 60_000));
    throw new ApiError(429, 'locked', `Nhập sai quá nhiều lần. Thử lại sau ${m} phút.`);
  }
}
async function noteFail(keys) {
  for (const k of keys) {
    await query(
      `INSERT INTO auth_failures(key, fails, first_at) VALUES($1,1,now())
       ON CONFLICT (key) DO UPDATE SET
         fails = CASE WHEN auth_failures.first_at < now() - ($2 || ' milliseconds')::interval OR auth_failures.locked_until < now() THEN 1 ELSE auth_failures.fails + 1 END,
         first_at = CASE WHEN auth_failures.first_at < now() - ($2 || ' milliseconds')::interval OR auth_failures.locked_until < now() THEN now() ELSE auth_failures.first_at END,
         locked_until = CASE WHEN (CASE WHEN auth_failures.first_at < now() - ($2 || ' milliseconds')::interval OR auth_failures.locked_until < now() THEN 1 ELSE auth_failures.fails + 1 END) >= $3
                             THEN now() + ($2 || ' milliseconds')::interval ELSE NULL END`,
      [k, String(lockMs()), config.loginMaxFails]);
  }
}
const clearFail = (keys) => query('DELETE FROM auth_failures WHERE key = ANY($1::text[])', [keys]);

// Đăng nhập: mật khẩu + TOTP (bắt buộc). Thông báo lỗi chung để không lộ tài khoản nào tồn tại.
export async function login(usernameIn, password, totpCode, ip) {
  const username = String(usernameIn || '').trim().toLowerCase();
  const keys = ['u:' + username, 'ip:' + (ip || '')];
  await assertNotLocked(keys);
  const a = (await query('SELECT * FROM admins WHERE username=$1 AND active', [username]))[0];
  const passOk = a ? await pw.verify(String(password || ''), a.password_hash) : (await pw.verify(String(password || ''), 'pbkdf2$200000$00$00'), false);
  const totpOk = a ? verifyTotp(a.totp_secret, totpCode) : false;
  if (!a || !passOk || !totpOk) {
    await noteFail(keys);
    throw new ApiError(401, 'bad_credentials', 'Tên đăng nhập, mật khẩu hoặc mã xác thực không đúng');
  }
  await clearFail(keys);
  const token = crypto.randomBytes(32).toString('hex');
  await query('INSERT INTO sessions(token_hash, admin_id, expires_at) VALUES($1,$2,$3)', [sha(token), a.id, new Date(Date.now() + config.sessionHours * 3600_000)]);
  await query('UPDATE admins SET last_login_at=now() WHERE id=$1', [a.id]);
  await query('DELETE FROM sessions WHERE expires_at < now()');
  return { token, admin: { id: a.id, username: a.username, role: a.role, apps: a.apps } };
}

export async function logout(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [sha(token)]);
}

export async function resolveSession(ctx) {
  const token = ctx.cookies.csid;
  if (!token) return null;
  const r = (await query(
    `SELECT s.token_hash, a.id, a.username, a.role, a.apps FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash=$1 AND s.expires_at > now() AND a.active`, [sha(token)]))[0];
  if (!r) return null;
  return { role: 'admin', hash: r.token_hash, user: { id: r.id, username: r.username, role: r.role, apps: r.apps } };
}

// Siêu quản trị thấy mọi app; vai trò khác chỉ thấy app được giao (khung phân quyền để mở rộng).
export const canSee = (admin, appId) => admin.role === 'super' || (admin.apps || []).includes(appId);

export async function changePassword(ctx, current, next) {
  const a = (await query('SELECT * FROM admins WHERE id=$1', [ctx.user.id]))[0];
  if (!a || !(await pw.verify(String(current || ''), a.password_hash))) throw new ApiError(400, 'bad_credentials', 'Mật khẩu hiện tại không đúng');
  pw.check(next, a.username);
  if (String(next).length < 10) throw new ApiError(400, 'weak_password', 'Mật khẩu quản trị cần ít nhất 10 ký tự');
  await query('UPDATE admins SET password_hash=$2 WHERE id=$1', [a.id, await pw.hash(next)]);
  await query('DELETE FROM sessions WHERE admin_id=$1 AND token_hash <> $2', [a.id, ctx.session.hash]);
  return { ok: true };
}

export async function audit(admin, action, appId = '', detail = null) {
  await query('INSERT INTO audit_log(admin, action, app_id, detail) VALUES($1,$2,$3,$4)', [admin, action, appId, detail === null ? null : JSON.stringify(detail)]);
}
