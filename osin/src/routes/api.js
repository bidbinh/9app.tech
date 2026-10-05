import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { raw } from '../http.js';
import { requireUser, createSession, destroySession, destroyUserSessions, sessionCookieName, stateCookieName } from '../auth.js';
import { runTurn, isBusy } from '../chat.js';
import { confirmAction, cancelAction } from '../pending.js';
import { getPrefs, setConsent, setFamily, history, clearHistory, eraseUser, exportUser } from '../store.js';
import { query } from '../db.js';
import { verifyRequest, createNonceStore } from '../../sdk/osin-sdk.js';
import { logEvent, safeEqual, sha256hex } from '../util.js';

const eraseNonces = createNonceStore();

function pickFamily(families, pref) {
  if (pref && families.some((f) => f.id === pref)) return families.find((f) => f.id === pref);
  if (families.length === 1) return families[0];
  return null;
}

/**
 * Lớp phòng thủ cho việc nhạy cảm (xác nhận, xóa, xuất): trình duyệt phải báo yêu cầu cùng nguồn gốc (Sec-Fetch-Site), chế độ hợp lệ,
 * và Referer đúng trang Osin. Là lớp phụ: XSS cùng origin vẫn vượt được, nên Osin chạy ở tên miền riêng + CSP chặt.
 */
export function browserGuard(ctx, { navigate = false } = {}) {
  const deny = () => new ApiError(403, 'csrf', 'Yêu cầu bị từ chối (không đến từ trang Osin). Tải lại trang rồi thử lại.');
  const h = ctx.headers;
  if (h['sec-fetch-site'] !== 'same-origin') throw deny();
  const okModes = navigate ? ['navigate', 'cors', 'same-origin'] : ['cors', 'same-origin'];
  if (!okModes.includes(h['sec-fetch-mode'])) throw deny();
  let ref;
  try { ref = new URL(h.referer); } catch { throw deny(); }
  const host = h['x-forwarded-host'] || h.host;
  if (ref.host !== host || !(ref.pathname + (ref.pathname.endsWith('/') ? '' : '/')).startsWith(config.basePath + '/')) throw deny();
}

// Token phiên giao diện: lấy qua một GET riêng sau khi trang tải; việc nguy hiểm phải kèm header X-Osin-Ui khớp người dùng
const uiTokens = new Map(); // băm -> { userId, exp }
function newUiToken(userId) {
  const now = Date.now();
  if (uiTokens.size >= 20000) { for (const [k, v] of uiTokens) if (v.exp <= now) uiTokens.delete(k); if (uiTokens.size >= 20000) uiTokens.delete(uiTokens.keys().next().value); }
  const t = crypto.randomBytes(24).toString('base64url');
  uiTokens.set(sha256hex(t), { userId, exp: now + 12 * 3600_000 });
  return t;
}
function requireUi(ctx, user) {
  const t = String(ctx.headers['x-osin-ui'] || '');
  const v = t.length >= 20 && t.length <= 64 ? uiTokens.get(sha256hex(t)) : null;
  if (!v || v.exp <= Date.now() || v.userId !== user.userId) throw new ApiError(403, 'ui_session', 'Phiên giao diện đã hết hạn. Tải lại trang rồi thử lại.');
}

function publicOrigin(ctx) {
  if (config.publicOrigin) return config.publicOrigin;
  const proto = ctx.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${ctx.headers.host}`; // chỉ khi phát triển (production bắt buộc OSIN_PUBLIC_ORIGIN)
}
const redirect = (location, headers = {}) => raw('', { location, 'cache-control': 'no-store', ...headers }, 302);

export function apiRoutes(app, deps) {
  const { identity, llm, registry } = deps;

  /* ---------- đăng nhập qua luồng của 9id ---------- */
  app.route('GET', '/auth/login', async (ctx) => {
    const state = crypto.randomBytes(24).toString('base64url');
    ctx.setCookie(stateCookieName(), state, { maxAge: 600 });
    const url = new URL(config.idAuthorizeUrl);
    url.searchParams.set('client', 'osin');
    url.searchParams.set('redirect_uri', publicOrigin(ctx) + config.basePath + '/auth/callback');
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }, { limit: 30, limitKey: 'login' });

  app.route('GET', '/auth/callback', async (ctx) => {
    const home = (config.basePath || '') + '/';
    const cookieState = ctx.cookies[stateCookieName()];
    ctx.setCookie(stateCookieName(), '', { clear: true });
    const { state, code } = ctx.query;
    if (!state || !cookieState || !safeEqual(state, cookieState) || typeof code !== 'string') return redirect(home + '?loi=state');
    let u;
    try { u = await identity.exchange(code, publicOrigin(ctx) + config.basePath + '/auth/callback'); } catch (e) {
      if (e instanceof ApiError) return redirect(home + '?loi=ban');
      throw e;
    }
    if (!u) return redirect(home + '?loi=ma');
    const token = await createSession(u);
    ctx.setCookie(sessionCookieName(), token, { maxAge: config.sessionDays * 86400 });
    logEvent('login', { rid: ctx.rid });
    return redirect(home);
  }, { limit: 30, limitKey: 'callback' });

  app.route('POST', '/api/logout', async (ctx) => {
    const t = ctx.cookies[sessionCookieName()];
    const sid9 = t ? await destroySession(t) : null;
    if (sid9) identity.sessionEnd(sid9); // không chờ (9id chậm không làm trễ đăng xuất); báo 9id xóa phiên con (spec 9id mục 16.6); lỗi bị nuốt, phiên Osin đã xóa
    ctx.setCookie(sessionCookieName(), '', { clear: true });
    return { ok: true };
  }, { limit: 30, limitKey: 'logout' });

  /* ---------- người dùng ---------- */
  app.route('GET', '/api/me', async (ctx) => {
    const user = requireUser(ctx);
    const [prefs, families] = await Promise.all([getPrefs(user.userId), identity.families(user.userId), registry.listTools()]);
    const fam = pickFamily(families, prefs.familyId);
    return {
      user: { displayName: user.displayName },
      ai: { enabled: llm.kind !== 'offline', kind: llm.kind, external: !!llm.external, noTrainConfirmed: config.noTrainConfirmed },
      needConsent: !!llm.external && (!prefs.consentAt || prefs.consentVersion < config.consentVersion),
      consentVersion: config.consentVersion,
      families, familyId: fam ? fam.id : null,
      apps: registry.status(),
      limits: { maxChars: config.maxMsgChars, historyDays: config.historyDays },
      busy: isBusy(user.userId),
    };
  });

  app.route('GET', '/api/ui-token', async (ctx) => { const u = requireUser(ctx); browserGuard(ctx); return { token: newUiToken(u.userId) }; }, { limit: 60, limitKey: 'ui-token' });

  app.route('POST', '/api/consent', async (ctx) => { const u = requireUser(ctx); await setConsent(u.userId); return { ok: true }; }, { limit: 20, limitKey: 'consent' });

  app.route('POST', '/api/prefs', async (ctx) => {
    const u = requireUser(ctx);
    const fid = ctx.body.familyId;
    if (fid === null) { await setFamily(u.userId, null); return { ok: true, familyId: null }; }
    if (typeof fid !== 'string') throw new ApiError(400, 'invalid_input', 'Gia đình không hợp lệ');
    const families = await identity.families(u.userId);
    if (!families.some((f) => f.id === fid)) throw new ApiError(404, 'not_found', 'Không tìm thấy gia đình này'); // không thuộc người dùng = như không tồn tại
    await setFamily(u.userId, fid);
    return { ok: true, familyId: fid };
  }, { limit: 60, limitKey: 'prefs' });

  app.route('GET', '/api/history', async (ctx) => {
    const u = requireUser(ctx);
    return history(u.userId, { limit: ctx.query.limit, before: ctx.query.before });
  });

  app.route('POST', '/api/chat', async (ctx) => {
    const u = requireUser(ctx);
    if (typeof ctx.body.text !== 'string') throw new ApiError(400, 'invalid_input', 'Tin nhắn không hợp lệ');
    const [prefs, families] = await Promise.all([getPrefs(u.userId), identity.families(u.userId)]);
    const fam = pickFamily(families, prefs.familyId);
    const t0 = Date.now();
    const message = await runTurn({ user: u, text: ctx.body.text, clientId: ctx.body.clientId, familyId: fam ? fam.id : null, familyName: fam ? fam.name : '', deps });
    logEvent('chat_ok', { ms: Date.now() - t0, rid: ctx.rid }); // KHÔNG ghi nội dung
    return { message };
  }, { limit: 60, limitKey: 'chat' });

  app.route('POST', '/api/actions/:id/confirm', async (ctx) => {
    const u = requireUser(ctx);
    browserGuard(ctx); requireUi(ctx, u);
    // ngân sách ghi: số hành động đã xác nhận mỗi giờ (chặn mã độc cùng nguồn gốc bấm xác nhận hàng loạt)
    const n = (await query("SELECT count(*)::int AS n FROM pending_actions WHERE user_id=$1 AND status IN ('running','done','failed') AND decided_at > now() - interval '1 hour'", [u.userId]))[0].n;
    if (n >= config.confirmPerHour) throw new ApiError(429, 'confirm_limit', 'Bạn đã xác nhận khá nhiều việc trong giờ qua. Đợi một lúc rồi thử lại nhé.');
    const out = await confirmAction(u.userId, ctx.params.id, { registry });
    logEvent('action_confirm', { status: out.status, rid: ctx.rid });
    return { action: out };
  }, { limit: 60, limitKey: 'confirm' });

  app.route('POST', '/api/actions/:id/cancel', async (ctx) => {
    const u = requireUser(ctx);
    browserGuard(ctx);
    return { action: await cancelAction(u.userId, ctx.params.id) };
  }, { limit: 60, limitKey: 'cancel' });

  app.route('DELETE', '/api/history', async (ctx) => {
    const u = requireUser(ctx); browserGuard(ctx); requireUi(ctx, u);
    const r = await clearHistory(u.userId); return { ok: true, deleted: r };
  }, { limit: 20, limitKey: 'clear' });

  app.route('POST', '/api/account/erase', async (ctx) => {
    const u = requireUser(ctx); browserGuard(ctx); requireUi(ctx, u);
    if (ctx.body.confirm !== true) throw new ApiError(400, 'invalid_input', 'Cần xác nhận xóa tất cả dữ liệu');
    const deleted = await eraseUser(u.userId);
    await destroyUserSessions(u.userId);
    ctx.setCookie(sessionCookieName(), '', { clear: true });
    return { ok: true, deleted };
  }, { limit: 10, limitKey: 'erase' });

  app.route('GET', '/api/export', async (ctx) => {
    const u = requireUser(ctx); browserGuard(ctx, { navigate: true });
    const data = await exportUser(u.userId);
    return raw(JSON.stringify(data, null, 1), { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="osin-du-lieu-cua-toi.json"' });
  }, { limit: 10, limitKey: 'export' });

  // 9id gọi khi người dùng xóa tài khoản 9app (ký HMAC theo giao thức OSIN1; nginx PHẢI chặn /internal/ từ internet)
  app.route('DELETE', '/internal/v1/users/:uid', async (ctx) => {
    if (!config.eraseKeys.size) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    try { await verifyRequest({ keys: config.eraseKeys, method: 'DELETE', pathWithQuery: ctx.req.url, headers: ctx.headers, body: ctx.raw || '', nonces: eraseNonces }); } catch (e) {
      throw new ApiError(401, 'unauthorized', 'Xác thực không hợp lệ');
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ctx.params.uid)) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const r = await eraseUser(ctx.params.uid);
    await destroyUserSessions(ctx.params.uid);
    logEvent('erase_by_id', { rid: ctx.rid });
    return { ok: true, deleted: r };
  }, { noCsrf: true, limit: 600, limitKey: 'erase-int' });

  // chỉ để phát triển cục bộ với danh tính giả
  if (identity.kind === 'mock' && !config.production && config.devLogin) {
    app.route('GET', '/dev-login', async (ctx) => {
      const name = String(ctx.query.name || 'Người dùng thử').slice(0, 40);
      const uid = String(ctx.query.uid || 'dev-' + crypto.createHash('sha256').update(name).digest('hex').slice(0, 10)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'dev';
      const families = ctx.query.family === '1' ? [{ id: 'fam-dev', name: 'Gia đình thử', role: 'chu' }] : [];
      const code = identity.register({ userId: uid, displayName: name, families });
      const u = await identity.exchange(code, null);
      const token = await createSession(u);
      ctx.setCookie(sessionCookieName(), token, { maxAge: 86400 });
      return redirect((config.basePath || '') + '/');
    });
  }
}
