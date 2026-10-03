import * as auth from '../auth.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { config } from '../config.js';

export function authRoutes(app) {
  app.setAuthResolver(auth.resolveSession);

  app.route('POST', '/v1/auth/otp', async (ctx) => auth.requestOtp(ctx.body?.phone, ctx.ip),
    { limit: 10, limitKey: 'otp' });

  app.route('POST', '/v1/auth/verify', async (ctx) => {
    const { token, user } = await auth.verifyOtp(ctx.body?.phone, ctx.body?.code);
    ctx.setCookie('sid', token, { maxAge: config.sessionDays * 86400 });
    return { user };
  }, { limit: 20, limitKey: 'verify' });

  app.route('POST', '/v1/auth/logout', async (ctx) => {
    await auth.logout(ctx.cookies.sid);
    ctx.setCookie('sid', '', { clear: true });
    return { ok: true };
  });

  app.route('GET', '/v1/me', async (ctx) => ({ user: ctx.user, admin: ctx.session?.role === 'admin' }));

  app.route('PATCH', '/v1/me', async (ctx) => {
    const name = String(ctx.body?.name || '').trim().slice(0, 80);
    await query('UPDATE users SET name=$1 WHERE id=$2', [name, ctx.user.id]);
    return { user: { ...ctx.user, name } };
  }, { auth: 'user' });

  app.route('POST', '/v1/auth/step-up/request', async (ctx) => auth.requestStepUp(ctx.user, ctx.ip), { auth: 'user', limit: 5, limitKey: 'stepup' });
  app.route('POST', '/v1/auth/step-up/verify', async (ctx) => auth.verifyStepUp(ctx, ctx.body?.code), { auth: 'user', limit: 10, limitKey: 'stepupv' });

  app.route('POST', '/v1/admin/login', async (ctx) => {
    const token = await auth.adminLogin(ctx.body?.token, ctx.body?.otp);
    ctx.setCookie('sid', token, { maxAge: 8 * 3600 });
    return { ok: true };
  }, { limit: 8, limitKey: 'adminlogin' });
}
