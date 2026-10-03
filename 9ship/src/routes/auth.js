import * as auth from '../auth.js';
import { query } from '../db.js';
import { config } from '../config.js';

const SECS = () => config.sessionDays * 86400;

export function authRoutes(app) {
  app.setAuthResolver(auth.resolveSession);

  const login = (ctx, r) => {
    ctx.setCookie('sid', r.token, { maxAge: SECS() });
    return { user: r.user, needsName: !r.user.name };
  };

  // Bước 1: số điện thoại đã có mật khẩu chưa (đăng nhập) hay chưa (đăng ký / dùng tài khoản 9Sport).
  app.route('POST', '/v1/auth/check', async (ctx) => auth.checkPhone(ctx.body?.phone), { limit: 30, limitKey: 'authcheck' });

  // Đăng nhập thường ngày: số điện thoại + mật khẩu. Không cần OTP.
  app.route('POST', '/v1/auth/login', async (ctx) => login(ctx, await auth.loginWithPassword(ctx.body?.phone, ctx.body?.password, ctx.ip)),
    { limit: 20, limitKey: 'login' });

  // Đăng ký lần đầu: gửi OTP rồi tạo tài khoản kèm mật khẩu.
  app.route('POST', '/v1/auth/register/otp', async (ctx) => auth.startRegister(ctx.body?.phone, ctx.ip), { limit: 10, limitKey: 'regotp' });
  app.route('POST', '/v1/auth/register', async (ctx) => login(ctx, await auth.register(ctx.body?.phone, ctx.body?.code, ctx.body?.name, ctx.body?.password)),
    { limit: 15, limitKey: 'register' });

  // Quên mật khẩu (cũng dùng cho tài khoản cũ chưa có mật khẩu).
  app.route('POST', '/v1/auth/reset/otp', async (ctx) => auth.startReset(ctx.body?.phone, ctx.ip), { limit: 5, limitKey: 'resetotp' });
  app.route('POST', '/v1/auth/reset', async (ctx) => login(ctx, await auth.resetPassword(ctx.body?.phone, ctx.body?.code, ctx.body?.password)),
    { limit: 10, limitKey: 'reset' });

  app.route('POST', '/v1/auth/logout', async (ctx) => {
    await auth.logout(ctx.cookies.sid);
    ctx.setCookie('sid', '', { clear: true });
    return { ok: true };
  });

  app.route('GET', '/v1/me', async (ctx) => ({ user: ctx.user, admin: ctx.session?.role === 'admin' }));

  app.route('PATCH', '/v1/me', async (ctx) => {
    const name = String(ctx.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    await query('UPDATE users SET name=$1 WHERE id=$2', [name, ctx.user.id]);
    return { user: { ...ctx.user, name } };
  }, { auth: 'user' });

  app.route('POST', '/v1/me/password', async (ctx) => auth.changePassword(ctx, ctx.body?.current, ctx.body?.password),
    { auth: 'user', limit: 10, limitKey: 'chpw' });

  // Nhập lại mật khẩu trước khi rút tiền.
  app.route('POST', '/v1/auth/step-up', async (ctx) => auth.stepUpWithPassword(ctx, ctx.body?.password),
    { auth: 'user', limit: 10, limitKey: 'stepup' });

  app.route('POST', '/v1/admin/login', async (ctx) => {
    const token = await auth.adminLogin(ctx.body?.token, ctx.body?.otp);
    ctx.setCookie('sid', token, { maxAge: 8 * 3600 });
    return { ok: true };
  }, { limit: 8, limitKey: 'adminlogin' });
}
