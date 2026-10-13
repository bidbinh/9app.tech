// Kết nối các app: lấy manifest công cụ (đệm, làm mới nền), gọi công cụ có chữ ký HMAC, ngắt mạch khi app lỗi.
// Nguyên tắc: app là bên KHÔNG đáng tin cho nội dung (kiểm mọi thứ nhận về) và là bên duy nhất quyết định quyền.
import crypto from 'node:crypto';
import { signRequest, signReceipt, argsHash } from '../sdk/osin-sdk.js';
import { softText, logEvent } from './util.js';
import { internalTools } from './tools/internal.js';

const MAX_RESPONSE_BYTES = 256 * 1024;
const TOOL_RE = /^[a-z][a-z0-9_]{1,40}$/;
const CODE_RE = /^[a-z][a-z0-9_]{1,40}$/;
export const MAX_TOOLS_PER_APP = 40;
export const MAX_TOOLS_TOTAL = 120;
export const MAX_MANIFEST_BYTES = 48 * 1024;

async function readLimited(res, max) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return (await res.text()).slice(0, max);
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { try { await reader.cancel(); } catch { /* bỏ qua */ } throw Object.assign(new Error('response too large'), { code: 'too_large' }); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Kiểm một công cụ do app khai báo. Trả null nếu không hợp lệ. */
export function normalizeTool(app, raw) {
  if (!raw || typeof raw !== 'object' || !TOOL_RE.test(raw.name || '')) return null;
  const description = softText(raw.description, 500);
  if (description.length < 10) return null;
  const params = raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters) ? raw.parameters : { type: 'object', properties: {} };
  if (params.type !== 'object') return null;
  let size = 0; try { size = JSON.stringify(params).length; } catch { return null; }
  if (size > 4096) return null;
  // Chỉ công cụ app tự khai readOnly VÀ được vận hành duyệt trong apps.json (readOnlyTools) mới chạy ngay; còn lại coi là ghi, cần xác nhận
  const readOnly = raw.readOnly === true && !!(app.readOnlyTools && app.readOnlyTools.has(raw.name));
  return {
    id: `${app.id}__${raw.name}`, appId: app.id, name: raw.name, description, parameters: params,
    readOnly, confirm: raw.confirm === true || !readOnly, sensitive: raw.sensitive === true,
    summaryTemplate: softText(raw.summaryTemplate || '', 200), internal: false, declaredReadOnly: raw.readOnly === true,
  };
}

export function createRegistry({ apps = [], searchEntries = [], config, fetchImpl = fetch, now = () => Date.now() }) {
  const states = new Map();
  const defs = new Map();
  for (const a of apps) {
    defs.set(a.id, { id: a.id, name: a.name || a.id, baseUrl: String(a.baseUrl).replace(/\/+$/, ''), keyId: a.keyId, secret: a.secret, linkPrefix: a.linkPrefix || `/${a.id}/`, receiptSecret: a.receiptSecret || '', readOnlyTools: new Set(Array.isArray(a.readOnlyTools) ? a.readOnlyTools : []) });
    states.set(a.id, { tools: null, at: 0, fetching: null, retryAt: 0, fails: 0, openUntil: 0, lastError: '' });
  }
  const internal = internalTools({ searchEntries, now });
  const internalById = new Map(internal.map((t) => [t.id, t]));
  let snapshot = new Map(); // id -> entry của lần listTools gần nhất

  async function http(app, method, suffix, bodyObj, timeoutMs, signal) {
    const url = new URL(app.baseUrl + '/osin-api/v1' + suffix);
    const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const headers = { 'content-type': 'application/json', ...signRequest({ keyId: app.keyId, secret: app.secret, method, pathWithQuery: url.pathname + url.search, body, ts: Math.floor(now() / 1000) }) };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onAbort = () => ctl.abort();
    if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    try {
      const r = await fetchImpl(url, { method, headers, body: body || undefined, redirect: 'error', signal: ctl.signal });
      const text = await readLimited(r, MAX_RESPONSE_BYTES);
      let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ }
      return { status: r.status, json };
    } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
  }

  const breakerOpen = (st) => st.openUntil > now();
  function noteFail(app, st, why) {
    st.fails += 1; st.lastError = why;
    if (st.fails >= config.breakerFailures) { st.openUntil = now() + config.breakerOpenMs; logEvent('app_breaker_open', { app: app.id, why }); }
  }
  const noteOk = (st) => { st.fails = 0; st.openUntil = 0; st.lastError = ''; };

  async function refresh(app, st) {
    if (st.fetching) return st.fetching;
    st.fetching = (async () => {
      try {
        const r = await http(app, 'GET', '/tools', undefined, config.appManifestTimeoutMs);
        if (r.status !== 200 || !r.json) throw Object.assign(new Error('bad manifest status'), { code: 'http_' + r.status });
        const list = Array.isArray(r.json) ? r.json : (Array.isArray(r.json.tools) ? r.json.tools : null);
        if (!list) throw Object.assign(new Error('bad manifest'), { code: 'bad_manifest' });
        if (JSON.stringify(list).length > MAX_MANIFEST_BYTES) throw Object.assign(new Error('manifest too large'), { code: 'manifest_too_large' });
        const tools = [];
        const seen = new Set();
        for (const raw of list.slice(0, MAX_TOOLS_PER_APP)) {
          const t = normalizeTool(app, raw);
          if (t && !seen.has(t.id)) { seen.add(t.id); tools.push(t); }
        }
        st.tools = tools; st.at = now(); st.retryAt = 0; noteOk(st);
      } catch (e) {
        st.retryAt = now() + config.breakerOpenMs;
        noteFail(app, st, (e && (e.code || e.name)) || 'error');
        logEvent('app_manifest_fail', { app: app.id, code: e && (e.code || e.name) });
      } finally { st.fetching = null; }
    })();
    return st.fetching;
  }

  /** Gộp công cụ nội bộ + của mọi app. Không bao giờ ném lỗi và không bị app chậm làm chậm quá hạn manifest. */
  async function listTools() {
    const waits = [];
    for (const [id, app] of defs) {
      const st = states.get(id);
      const t = now();
      const fresh = st.tools && t - st.at < config.manifestTtlMs;
      if (fresh) continue;
      if (st.tools) { // bản cũ còn dùng được: trả ngay, làm mới nền
        if (t - st.at > config.manifestStaleMs) st.tools = null;
        else if (t >= st.retryAt && !breakerOpen(st)) refresh(app, st);
        if (st.tools) continue;
      }
      if (t >= st.retryAt && !breakerOpen(st)) waits.push(refresh(app, st));
    }
    if (waits.length) await Promise.all(waits);
    const all = [...internal];
    const status = [];
    for (const [id, app] of defs) {
      const st = states.get(id);
      const ok = !!st.tools;
      status.push({ id, name: app.name, ok, tools: ok ? st.tools.length : 0, error: ok ? '' : (st.lastError || 'chưa kết nối') });
      if (ok) all.push(...st.tools);
    }
    const tools = all.slice(0, MAX_TOOLS_TOTAL);
    snapshot = new Map(tools.map((x) => [x.id, x]));
    return { tools, status };
  }

  /** Gọi công cụ của app. Luôn trả { ok, result|error, preview? }; lỗi mạng không ném ra ngoài. */
  async function callApp(entry, { mode = 'execute', args, userId, familyId, requestId, timeoutMs, signal, confirmed = false }) {
    const app = defs.get(entry.appId); const st = states.get(entry.appId);
    if (!app) return { ok: false, error: { code: 'unknown_app', message: 'App này chưa được kết nối với Osin.' } };
    if (breakerOpen(st)) return { ok: false, transport: true, notSent: true, error: { code: 'app_unavailable', message: `${app.name} đang tạm không phản hồi, thử lại sau ít phút.` } };
    const ts = Math.floor(now() / 1000);
    const body = { tool: entry.name, args, mode, actingUserId: userId, ...(familyId ? { familyId } : {}), requestId, ts, nonce: crypto.randomBytes(16).toString('base64url') };
    // biên nhận xác nhận (ký bằng khóa riêng) chỉ cấp khi người dùng đã bấm Xác nhận
    if (mode === 'execute' && confirmed && app.receiptSecret) body.receipt = signReceipt(app.receiptSecret, { userId, tool: entry.name, argsHash: argsHash(args), requestId, exp: ts + 120 });
    // nonce/ts trong thân phải trùng header: ký bằng đúng giá trị này
    const url = new URL(app.baseUrl + '/osin-api/v1/call');
    const bodyStr = JSON.stringify(body);
    const headers = { 'content-type': 'application/json', ...signRequest({ keyId: app.keyId, secret: app.secret, method: 'POST', pathWithQuery: url.pathname + url.search, body: bodyStr, ts, nonce: body.nonce }) };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onAbort = () => ctl.abort();
    if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    let status = 0; let json = null;
    try {
      const r = await fetchImpl(url, { method: 'POST', headers, body: bodyStr, redirect: 'error', signal: ctl.signal });
      status = r.status;
      const text = await readLimited(r, MAX_RESPONSE_BYTES);
      try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    } catch (e) {
      const timedOut = ctl.signal.aborted;
      noteFail(app, st, timedOut ? 'timeout' : (e && e.code) || 'network');
      return { ok: false, transport: true, timedOut, error: { code: timedOut ? 'timeout' : 'app_unavailable', message: timedOut ? `${app.name} trả lời quá lâu.` : `${app.name} không phản hồi.` } };
    } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }

    if (status === 401 || status === 403 && !json) { noteFail(app, st, 'auth'); logEvent('app_auth_rejected', { app: app.id, status }); return { ok: false, transport: true, error: { code: 'app_auth', message: `${app.name} từ chối yêu cầu của Osin (lỗi cấu hình).` } }; }
    if (status >= 500 || !json || typeof json !== 'object') { noteFail(app, st, 'http_' + status); return { ok: false, transport: true, error: { code: 'app_unavailable', message: `${app.name} gặp lỗi, thử lại sau.` } }; }
    noteOk(st);
    if (json.ok === true) return { ok: true, result: json.result === undefined ? null : json.result, preview: json.preview && typeof json.preview === 'object' ? { summary: softText(json.preview.summary, 300) } : undefined };
    const e = json.error && typeof json.error === 'object' ? json.error : {};
    return { ok: false, error: { code: CODE_RE.test(e.code || '') ? e.code : 'error', message: softText(typeof e.message === 'string' ? e.message : '', 300) || 'Công cụ không thực hiện được.' } };
  }

  return {
    listTools, callApp,
    timeouts: { tool: config.appToolTimeoutMs, confirm: config.appConfirmTimeoutMs },
    get: (id) => snapshot.get(id) || internalById.get(id) || null,
    linkPrefixOf: (appId) => (appId === 'osin' ? null : (defs.get(appId) || {}).linkPrefix || null),
    appName: (appId) => (defs.get(appId) || {}).name || appId,
    appIds: () => [...defs.keys()],
    status: () => [...defs.values()].map((a) => { const st = states.get(a.id); return { id: a.id, name: a.name, ok: !!st.tools, tools: st.tools ? st.tools.length : 0, breaker: breakerOpen(st) }; }),
    invalidate() { for (const st of states.values()) { st.at = 0; st.retryAt = 0; st.openUntil = 0; st.fails = 0; } },
  };
}
