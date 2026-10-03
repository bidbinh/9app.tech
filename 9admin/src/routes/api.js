import { config } from '../config.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import * as auth from '../auth.js';
import * as C from '../contract.js';
import { call, ConnectorError } from '../connector.js';
import { listApps, getApp, upsertApp, removeApp, publicApp } from '../registry.js';
import { refreshApp, refreshAll, statusOf } from '../sync.js';
import * as reports from '../reports.js';

const A = { auth: 'admin' };
const raw = (status, headers, body) => ({ __raw: true, status, headers, body });
const WHO = (ctx) => ctx.user.username;

// Danh sách app mà quản trị viên này được thấy.
async function visibleApps(ctx, { all = false } = {}) {
  return (await listApps({ all })).filter((a) => auth.canSee(ctx.user, a.id));
}
async function appFor(ctx, id) {
  const a = await getApp(id);
  if (!auth.canSee(ctx.user, a.id)) throw new ApiError(404, 'app_not_found', 'Không có app này');
  return a;
}
const asApiError = (e) => {
  if (e instanceof ConnectorError) return new ApiError(e.code === 'unauthorized' ? 502 : 502, 'connector_' + e.code, e.message);
  return e;
};

export function apiRoutes(app) {
  // ---- phiên ----
  app.route('POST', '/api/login', async (ctx) => {
    const r = await auth.login(ctx.body?.username, ctx.body?.password, ctx.body?.totp, ctx.ip);
    ctx.setCookie('csid', r.token, { maxAge: config.sessionHours * 3600 });
    return { admin: r.admin };
  }, { limit: 10, limitKey: 'login' });
  app.route('POST', '/api/logout', async (ctx) => { await auth.logout(ctx.cookies.csid); ctx.setCookie('csid', '', { clear: true }); return { ok: true }; });
  app.route('GET', '/api/me', async (ctx) => ({ admin: ctx.user ? { username: ctx.user.username, role: ctx.user.role } : null }));
  app.route('POST', '/api/me/password', async (ctx) => auth.changePassword(ctx, ctx.body?.current, ctx.body?.password), { auth: 'admin', limit: 5, limitKey: 'chpw' });

  // ---- tổng quan ----
  app.route('GET', '/api/overview', async (ctx) => reports.overview(await visibleApps(ctx)), A);

  // ---- dòng tiền ----
  const scope = async (ctx) => {
    if (ctx.user.role === 'super') return null;
    return (await visibleApps(ctx)).map((a) => a.id);
  };
  app.route('GET', '/api/money', async (ctx) => reports.moneyReport(reports.parseFilters(ctx.query, await scope(ctx))), A);
  app.route('GET', '/api/money.csv', async (ctx) => {
    const csv = await reports.moneyCsv(reports.parseFilters(ctx.query, await scope(ctx)));
    await auth.audit(WHO(ctx), 'money.export', '', { filters: ctx.query });
    return raw(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="dong-tien.csv"', 'cache-control': 'no-store' }, csv);
  }, A);

  // ---- người dùng ----
  app.route('GET', '/api/users', async (ctx) => {
    const apps = await scope(ctx);
    return reports.usersReport({ q: String(ctx.query.q || '').slice(0, 60), app: /^[a-z0-9_-]{2,30}$/.test(ctx.query.app || '') ? ctx.query.app : null, apps, page: Math.max(1, Number.parseInt(ctx.query.page, 10) || 1) });
  }, A);

  app.route('GET', '/api/users/:ukey', async (ctx) => {
    const accounts = (await reports.userAccounts(ctx.params.ukey)).filter((u) => auth.canSee(ctx.user, u.app_id));
    if (!accounts.length) throw new ApiError(404, 'not_found', 'Không có người dùng này');
    const apps = Object.fromEntries((await listApps({ all: true })).map((a) => [a.id, a]));
    // chi tiết lấy trực tiếp từ từng app (không dùng bản đã đồng bộ) để luôn mới
    const details = await Promise.all(accounts.map(async (u) => {
      const a = apps[u.app_id];
      const base = { app: u.app_id, appName: a ? a.name : u.app_id, id: u.app_user_id, name: u.name, status: u.status, createdAt: u.created_at };
      try {
        const d = await call(a, 'GET', '/users/' + encodeURIComponent(u.app_user_id), { validate: C.userDetail, timeoutMs: 6000 });
        return { ...base, ok: true, title: d.title, fields: d.fields };
      } catch (e) { return { ...base, ok: false, error: e.message, fields: [] }; }
    }));
    const phone = accounts.find((u) => u.phone)?.phone || '';
    return { ukey: ctx.params.ukey, phone, details, cash: await reports.userCashByApp(phone) };
  }, A);

  // ---- app ----
  app.route('GET', '/api/apps', async (ctx) => {
    const apps = await visibleApps(ctx, { all: ctx.user.role === 'super' });
    const st = await query('SELECT * FROM app_status');
    return { apps: apps.map((a) => ({ ...publicApp(a), status: statusOf(st.find((s) => s.app_id === a.id) || {}) })) };
  }, A);

  app.route('GET', '/api/apps/:id', async (ctx) => {
    const a = await appFor(ctx, ctx.params.id);
    const st = (await query('SELECT * FROM app_status WHERE app_id=$1', [a.id]))[0] || {};
    const sync = await query('SELECT stream, last_ok_at, last_error, last_count FROM sync_state WHERE app_id=$1 ORDER BY stream', [a.id]);
    return { ...publicApp(a), status: statusOf(st), detail: st.detail || '', checkedAt: st.checked_at, summary: st.summary || { kpis: [], alerts: [] }, summaryAt: st.summary_at, sync };
  }, A);

  app.route('POST', '/api/apps', async (ctx) => {
    if (ctx.user.role !== 'super') throw new ApiError(403, 'forbidden', 'Chỉ siêu quản trị được khai báo app');
    const b = ctx.body || {};
    const saved = await upsertApp({ id: b.id, name: b.name, baseUrl: b.baseUrl, keyId: b.keyId, secret: b.secret || null, note: b.note || '', sort: Number.isInteger(b.sort) ? b.sort : 100, enabled: b.enabled !== false });
    await auth.audit(WHO(ctx), 'app.upsert', saved.id, { name: saved.name, baseUrl: saved.baseUrl, secretChanged: Boolean(b.secret) });
    return saved;
  }, { auth: 'admin', limit: 20, limitKey: 'appupsert' });

  app.route('DELETE', '/api/apps/:id', async (ctx) => {
    if (ctx.user.role !== 'super') throw new ApiError(403, 'forbidden', 'Chỉ siêu quản trị được xóa app');
    await removeApp(ctx.params.id);
    await auth.audit(WHO(ctx), 'app.remove', ctx.params.id);
    return { ok: true };
  }, A);

  // Thử kết nối và đồng bộ ngay một app.
  app.route('POST', '/api/apps/:id/test', async (ctx) => {
    await appFor(ctx, ctx.params.id);
    const r = await refreshApp(ctx.params.id);
    await auth.audit(WHO(ctx), 'app.test', ctx.params.id, { steps: Object.fromEntries(Object.entries(r.steps).map(([k, v]) => [k, v.ok])) });
    return r;
  }, { auth: 'admin', limit: 20, limitKey: 'apptest' });

  app.route('POST', '/api/sync', async (ctx) => {
    if (ctx.query.app) { await appFor(ctx, ctx.query.app); return { results: [await refreshApp(ctx.query.app, { forceFull: ctx.query.full === '1' })] }; }
    return { results: await refreshAll({ forceFull: ctx.query.full === '1' }) };
  }, { auth: 'admin', limit: 10, limitKey: 'sync' });

  // ---- bảng quản trị riêng của app (qua khai báo) ----
  app.route('GET', '/api/apps/:id/panels/:pid', async (ctx) => {
    const a = await appFor(ctx, ctx.params.id);
    const declared = ((a.panels && a.panels.items) || []).find((p) => p.id === ctx.params.pid);
    if (!declared) throw new ApiError(404, 'panel_not_found', 'App không có bảng này');
    try {
      return await call(a, 'GET', '/panels/' + encodeURIComponent(declared.id), {
        query: { page: Math.max(1, Number.parseInt(ctx.query.page, 10) || 1), q: String(ctx.query.q || '').slice(0, 80) }, validate: C.panelData,
      });
    } catch (e) { throw asApiError(e); }
  }, A);

  app.route('POST', '/api/apps/:id/actions/:aid', async (ctx) => {
    const a = await appFor(ctx, ctx.params.id);
    const b = ctx.body || {};
    const panel = ((a.panels && a.panels.items) || []).find((p) => p.id === b.panel);
    const action = panel && panel.rowActions.find((x) => x.id === ctx.params.aid);
    if (!action) throw new ApiError(400, 'unknown_action', 'Hành động không có trong khai báo của app');
    const inputs = {};
    for (const i of action.inputs) {
      const v = b.inputs && b.inputs[i.name];
      if ((v === undefined || v === null || String(v).trim() === '') && i.required) throw new ApiError(400, 'invalid_request', `Thiếu "${i.label}"`, { field: i.name });
      if (v !== undefined && v !== null) inputs[i.name] = String(v).slice(0, 1000);
    }
    const rowId = String(b.rowId ?? '').slice(0, 100);
    let result;
    try {
      result = await call(a, 'POST', '/actions/' + encodeURIComponent(action.id), { body: { panel: panel.id, rowId, inputs }, validate: C.actionResult });
    } catch (e) {
      await auth.audit(WHO(ctx), 'app.action.failed', a.id, { panel: panel.id, action: action.id, rowId, error: e.message });
      throw asApiError(e);
    }
    await auth.audit(WHO(ctx), 'app.action', a.id, { panel: panel.id, action: action.id, rowId, inputs, ok: result.ok, message: result.message });
    refreshApp(a.id).catch(() => {}); // làm mới tóm tắt sau khi thao tác
    return result;
  }, { auth: 'admin', limit: 60, limitKey: 'action' });

  // ---- nhật ký ----
  app.route('GET', '/api/audit', async (ctx) => {
    if (ctx.user.role !== 'super') throw new ApiError(403, 'forbidden', 'Chỉ siêu quản trị xem nhật ký');
    return { items: await query('SELECT id, admin, action, app_id, detail, at FROM audit_log ORDER BY id DESC LIMIT 200') };
  }, A);
}
