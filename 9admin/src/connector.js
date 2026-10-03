// Máy khách gọi API quản trị của từng app (giao thức v1, ký HMAC).
import { config } from './config.js';
import * as C from './contract.js';
import * as box from './cryptobox.js';

export class ConnectorError extends Error {
  constructor(message, { status = 0, code = 'connector' } = {}) { super(message); this.status = status; this.code = code; }
}

// Chỉ gọi tới máy chủ trong danh sách cho phép; không nhận địa chỉ có tài khoản/mật khẩu.
export function assertAllowedUrl(urlStr, hosts = config.allowedHosts) {
  let u;
  try { u = new URL(urlStr); } catch { throw new ConnectorError('Địa chỉ app không hợp lệ', { code: 'bad_url' }); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ConnectorError('Địa chỉ app phải là http hoặc https', { code: 'bad_url' });
  if (u.username || u.password) throw new ConnectorError('Địa chỉ app không được chứa tài khoản', { code: 'bad_url' });
  if (!hosts.includes(u.hostname)) throw new ConnectorError(`Máy chủ "${u.hostname}" không nằm trong danh sách cho phép (CONSOLE_ALLOWED_HOSTS)`, { code: 'host_not_allowed' });
  return u;
}

async function readCapped(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { try { await reader.cancel(); } catch { /* bỏ qua */ } throw new ConnectorError('Phản hồi của app quá lớn', { code: 'too_large' }); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// app: hàng trong bảng apps. validate: hàm kiểm tra trong contract.js.
export async function call(app, method, path, { query = {}, body = null, validate = (x) => x, timeoutMs = config.connectorTimeoutMs } = {}) {
  const base = assertAllowedUrl(app.base_url);
  const url = new URL(base.href.replace(/\/+$/, '') + '/admin-api/v1' + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const payload = body === null ? '' : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = C.sign(box.open(app.secret_enc), ts, method, url.pathname + url.search, payload);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res; let text;
  try {
    res = await fetch(url, {
      method, redirect: 'error', signal: ctl.signal,
      headers: { accept: 'application/json', 'x-console-key': app.key_id, 'x-console-ts': ts, 'x-console-sig': sig, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload || undefined,
    });
    text = await readCapped(res, config.connectorMaxBytes);
  } catch (e) {
    if (e instanceof ConnectorError) throw e;
    throw new ConnectorError(e.name === 'AbortError' ? 'App không phản hồi (quá thời gian)' : `Không kết nối được app: ${e.cause?.code || e.message}`, { code: 'unreachable' });
  } finally { clearTimeout(timer); }
  let json = null;
  try { json = JSON.parse(text); } catch { /* xử lý bên dưới */ }
  if (!res.ok) {
    const m = json && json.error && json.error.message ? String(json.error.message).slice(0, 200) : `HTTP ${res.status}`;
    throw new ConnectorError(m, { status: res.status, code: res.status === 401 || res.status === 403 ? 'unauthorized' : 'app_error' });
  }
  if (json === null) throw new ConnectorError('App trả dữ liệu không phải JSON', { status: res.status, code: 'bad_response' });
  try { return validate(json); } catch (e) {
    if (e instanceof C.ContractError) throw new ConnectorError('Phản hồi không đúng giao thức: ' + e.message, { status: res.status, code: 'bad_response' });
    throw e;
  }
}
