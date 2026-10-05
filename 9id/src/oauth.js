// Cấp phiên cho app chạy ở TÊN MIỀN CON RIÊNG (ví dụ osin.9app.tech): cookie nine_sid của 9app.tech không gửi sang đó.
//  1. Trình duyệt mở GET /id/authorize?client=osin&redirect_uri=...&state=...
//     (client + redirect_uri phải khớp CHÍNH XÁC một cặp đã đăng ký; không wildcard; sai thì 400, KHÔNG chuyển hướng).
//     Chưa đăng nhập: chuyển qua đăng nhập rồi quay lại. Lần đầu: màn "Cho phép". Sau đó cấp mã dùng một lần (256 bit, chỉ lưu băm, 60 giây,
//     gắn client + redirect_uri + người dùng + state + phiên 9id) và chuyển hướng 302 tới redirect_uri?code=...&state=...
//  2. Máy chủ của app gọi POST /id/internal/v1/exchange {code, client, redirect_uri} (HMAC của chính client đó) -> {userId, displayName, sessionId9id}.
//  3. App kiểm lại định kỳ (<= 5 phút) bằng POST /id/internal/v1/session-valid {sessionId9id}.
//  4. Phiên con mất khi phiên 9id cha mất (đăng xuất, đổi mật khẩu, đăng xuất tất cả, xóa tài khoản) hoặc người dùng thu hồi quyền.
import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query, tx } from './db.js';
import { requireUser, audit } from './auth.js';
import { raw } from './http.js';
import { authInternal } from './internal.js';
import { sha256hex, newToken, notFound } from './util.js';

const STATE_RE = /^[A-Za-z0-9._~:-]{8,200}$/;
const CLIENT_RE = /^[a-z0-9_-]{1,30}$/;
const clientName = (id) => id.charAt(0).toUpperCase() + id.slice(1);

// client + redirect_uri khớp chính xác một cặp đã đăng ký
export function registeredRedirect(client, redirectUri) {
  if (typeof client !== 'string' || typeof redirectUri !== 'string' || !CLIENT_RE.test(client)) return false;
  const set = config.oauthClients.get(client);
  return !!set && set.has(redirectUri);
}

const bad = (msg) => new ApiError(400, 'invalid_request', msg);

export function oauthRoutes(app) {
  // ---------- 1. authorize ----------
  app.route('GET', '/authorize', async (ctx) => {
    const { client, redirect_uri: redirectUri, state } = ctx.query;
    // chỉ chuyển hướng tới địa chỉ đã đăng ký: mọi lỗi khác trả 400 tại chỗ (chống open redirect)
    if (!registeredRedirect(client, redirectUri)) throw bad('Ứng dụng hoặc địa chỉ quay lại không được đăng ký');
    if (typeof state !== 'string' || !STATE_RE.test(state)) throw bad('Thiếu hoặc sai tham số state');
    const here = config.basePath + '/authorize' + ctx.req.url.slice(ctx.req.url.indexOf('?'));
    const go = (hash) => raw('', { location: `${config.basePath}/?next=${encodeURIComponent(here)}#/${hash}`, 'cache-control': 'no-store' }, 302);
    if (!ctx.user) return go('dang-nhap');
    if (config.oauthRequireConsent && !(await query('SELECT 1 FROM oauth_consents WHERE user_id=$1 AND client=$2', [ctx.user.id, client])).length) return go('cho-phep');
    const code = newToken();
    await query(
      `INSERT INTO auth_codes(code_hash, client, redirect_uri, user_id, parent_session_id, state, expires_at)
       VALUES($1,$2,$3,$4,$5,$6, now() + make_interval(secs => $7))`, [sha256hex(code), client, redirectUri, ctx.user.id, ctx.sessionId, state, config.authCodeTtlSec]);
    const u = new URL(redirectUri);
    u.searchParams.set('code', code);
    u.searchParams.set('state', state);
    return raw('', { location: u.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, 302);
  });

  // ---------- đồng ý / thu hồi quyền của app ----------
  app.route('GET', '/api/oauth/client', async (ctx) => {
    requireUser(ctx);
    const c = ctx.query.client;
    if (typeof c !== 'string' || !config.oauthClients.has(c)) throw notFound();
    const hosts = [...config.oauthClients.get(c)].map((u) => new URL(u).host);
    return { client: c, name: clientName(c), hosts: [...new Set(hosts)], consented: (await query('SELECT 1 FROM oauth_consents WHERE user_id=$1 AND client=$2', [ctx.user.id, c])).length > 0 };
  });

  app.route('POST', '/api/oauth/consent', async (ctx) => {
    requireUser(ctx);
    const c = ctx.body.client;
    if (typeof c !== 'string' || !config.oauthClients.has(c)) throw notFound();
    await query('INSERT INTO oauth_consents(user_id, client) VALUES($1,$2) ON CONFLICT DO NOTHING', [ctx.user.id, c]);
    await audit(null, ctx.user.id, 'oauth_consent', c);
    return { ok: true };
  });

  app.route('GET', '/api/oauth/grants', async (ctx) => {
    requireUser(ctx);
    const rows = await query('SELECT client, created_at FROM oauth_consents WHERE user_id=$1 ORDER BY created_at', [ctx.user.id]);
    return { grants: rows.map((r) => ({ client: r.client, name: clientName(r.client), at: r.created_at })) };
  });

  app.route('DELETE', '/api/oauth/grants/:client', async (ctx) => {
    requireUser(ctx);
    const r = await query('DELETE FROM oauth_consents WHERE user_id=$1 AND client=$2 RETURNING 1', [ctx.user.id, ctx.params.client]);
    await query('DELETE FROM app_sessions WHERE user_id=$1 AND client=$2', [ctx.user.id, ctx.params.client]);
    if (!r.length) throw notFound();
    return { ok: true };
  });

  // ---------- 2, 3: API nội bộ cho app (HMAC của chính client) ----------
  const I = (path, handler) => app.route('POST', '/internal/v1' + path, async (ctx) => { ctx.kid = await authInternal(ctx); return handler(ctx); }, { internal: true, noCsrf: true });
  const invalidGrant = () => new ApiError(400, 'invalid_grant', 'Mã không hợp lệ, đã dùng hoặc đã hết hạn');

  I('/exchange', async (ctx) => {
    const { code, client, redirect_uri: redirectUri } = ctx.body;
    if (typeof client !== 'string' || client !== ctx.kid) throw new ApiError(403, 'forbidden', 'Khóa này không thuộc ứng dụng được yêu cầu');
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code) || !registeredRedirect(client, redirectUri)) throw invalidGrant();
    return tx(async (c) => {
      // nguyên tử: đua song song chỉ một yêu cầu thắng; sai client/redirect thì mã không bị đốt
      const r = (await c.query(
        `UPDATE auth_codes SET used_at = now() WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now() AND client=$2 AND redirect_uri=$3
         RETURNING user_id, parent_session_id`, [sha256hex(code), client, redirectUri]))[0];
      if (!r) throw invalidGrant();
      const u = (await c.query('SELECT display_name FROM users WHERE id=$1', [r.user_id]))[0];
      // phiên 9id cha phải còn (đăng xuất giữa chừng thì mã vô hiệu; khóa dòng cha để không bị xóa giữa chừng)
      const parent = (await c.query('SELECT id FROM sessions WHERE id=$1 FOR SHARE', [r.parent_session_id]))[0];
      if (!u || !parent) throw invalidGrant();
      const s = (await c.query(
        "INSERT INTO app_sessions(user_id, client, parent_session_id, expires_at) VALUES($1,$2,$3, now() + make_interval(days => $4)) RETURNING id",
        [r.user_id, client, r.parent_session_id, config.appSessionDays]))[0];
      return { userId: r.user_id, displayName: u.display_name, sessionId9id: s.id };
    });
  });

  I('/session-valid', async (ctx) => {
    const id = ctx.body.sessionId9id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { valid: false };
    const r = (await query(
      `UPDATE app_sessions a SET last_checked_at = now() FROM users u
        WHERE a.id=$1 AND a.client=$2 AND a.expires_at > now() AND u.id = a.user_id RETURNING a.user_id, u.display_name`, [id.toLowerCase(), ctx.kid]))[0];
    return r ? { valid: true, userId: r.user_id, displayName: r.display_name } : { valid: false };
  });

  I('/session-end', async (ctx) => {
    const id = ctx.body.sessionId9id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) await query('DELETE FROM app_sessions WHERE id=$1 AND client=$2', [id.toLowerCase(), ctx.kid]);
    return { ok: true };
  });
}
