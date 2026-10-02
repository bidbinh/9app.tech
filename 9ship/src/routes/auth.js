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

  // ---- sổ địa chỉ ----
  app.route('GET', '/v1/addresses', async (ctx) => ({
    addresses: await query('SELECT id, label, contact, phone, street, ward, province, lat, lng FROM addresses WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [ctx.user.id]),
  }), { auth: 'user' });

  app.route('POST', '/v1/addresses', async (ctx) => {
    const b = ctx.body || {};
    const need = ['contact', 'phone', 'street', 'province'];
    for (const k of need) if (!b[k] || typeof b[k] !== 'string') throw new ApiError(400, 'invalid_request', `Thiếu ${k}`);
    const count = (await query('SELECT count(*)::int AS n FROM addresses WHERE user_id=$1', [ctx.user.id]))[0].n;
    if (count >= 50) throw new ApiError(400, 'limit', 'Tối đa 50 địa chỉ');
    const r = await query(
      `INSERT INTO addresses(user_id, label, contact, phone, street, ward, province, lat, lng)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [ctx.user.id, String(b.label || '').slice(0, 40), b.contact.slice(0, 80), auth.normalizePhone(b.phone), b.street.slice(0, 200),
        String(b.ward || '').slice(0, 80), b.province.slice(0, 60), Number.isFinite(b.lat) ? b.lat : null, Number.isFinite(b.lng) ? b.lng : null]);
    return { id: r[0].id };
  }, { auth: 'user' });

  app.route('DELETE', '/v1/addresses/:id', async (ctx) => {
    await query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [Number(ctx.params.id) || 0, ctx.user.id]);
    return { ok: true };
  }, { auth: 'user' });
}
