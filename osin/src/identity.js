// IdentityVerifier: Osin chạy ở tên miền riêng (osin.9app.tech) nên KHÔNG đọc cookie của 9app.tech. Đăng nhập qua luồng của 9id:
//   exchange(code, redirectUri) -> { userId, displayName, sessionId9id }   đổi mã dùng một lần lấy danh tính (POST /id/internal/v1/exchange, HMAC)
//   sessionEnd(sessionId9id)    -> (không trả gì)                          Osin đăng xuất: báo 9id xóa phiên con (POST /id/internal/v1/session-end)
//   sessionValid(sessionId9id)  -> true | false                           phiên 9id còn hiệu lực không (POST /id/internal/v1/session-valid, HMAC)
//   families(userId)            -> [{ id, name, role }]                   (GET /id/internal/v1/users/:uid/families)
// Lỗi tạm thời của 9id: 429 (quá tải) -> ApiError 429 identity_busy; sập/5xx/timeout -> ApiError 503 identity_unavailable.
// Bản `9id` bám spec 9id mục 7 (chữ ký X-9ID-*), tên endpoint theo yêu cầu của chủ sản phẩm; bản `mock` chỉ cho dev/test.
import crypto from 'node:crypto';
import { ApiError } from './errors.js';
import { sha256hex, softText, logEvent } from './util.js';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function normUser(u) {
  if (!u || typeof u !== 'object' || typeof u.userId !== 'string' || !ID_RE.test(u.userId)) return null;
  const sid = typeof u.sessionId9id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(u.sessionId9id) ? u.sessionId9id : null;
  if (!sid) return null;
  return { userId: u.userId, displayName: softText(u.displayName, 40) || 'Bạn', sessionId9id: sid };
}
function normFamilies(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).filter((f) => f && typeof f.id === 'string' && ID_RE.test(f.id)).map((f) => ({ id: f.id, name: softText(f.name, 60) || 'Gia đình', role: softText(f.role, 20) }));
}

class TtlCache {
  constructor(max = 5000) { this.m = new Map(); this.max = max; }
  get(k, now) { const v = this.m.get(k); if (!v) return undefined; if (v.exp <= now) { this.m.delete(k); return undefined; } return v.val; }
  set(k, val, ttl, now) {
    if (this.m.size >= this.max) { for (const [kk, v] of this.m) if (v.exp <= now) this.m.delete(kk); if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value); }
    this.m.set(k, { val, exp: now + ttl });
  }
  clear() { this.m.clear(); }
}

export function createMockIdentity() {
  const users = new Map();     // userId -> { displayName, families }
  const codes = new Map();     // mã dùng một lần -> { userId, redirectUri }
  const sessions = new Map();  // sessionId9id -> { userId, valid }
  const faults = { sessionValid: null }; // test: 'busy' | 'down'
  return {
    kind: 'mock',
    faults,
    /** Đăng ký người dùng giả và trả MÃ đăng nhập dùng một lần (giống mã 9id cấp cho luồng authorize). */
    register({ userId, displayName = 'Người dùng thử', families = [], redirectUri = null } = {}) {
      users.set(userId, { displayName, families: normFamilies(families) });
      const code = 'code-' + crypto.randomBytes(18).toString('base64url');
      codes.set(code, { userId, redirectUri });
      return code;
    },
    async exchange(code, redirectUri) {
      const c = codes.get(code);
      if (!c) return null;
      codes.delete(code); // dùng một lần
      if (c.redirectUri && c.redirectUri !== redirectUri) return null;
      const u = users.get(c.userId);
      const sessionId9id = 'sid-' + crypto.randomBytes(12).toString('base64url');
      sessions.set(sessionId9id, { userId: c.userId, valid: true });
      return { userId: c.userId, displayName: u.displayName, sessionId9id };
    },
    /** Đăng xuất phía 9id. */
    revokeSession(sessionId9id) { const s = sessions.get(sessionId9id); if (s) s.valid = false; },
    revokeUser(userId) { for (const s of sessions.values()) if (s.userId === userId) s.valid = false; },
    async sessionValid(sessionId9id) {
      if (faults.sessionValid === 'busy') throw new ApiError(429, 'identity_busy', 'Hệ thống tài khoản 9app đang bận');
      if (faults.sessionValid === 'down') throw new ApiError(503, 'identity_unavailable', 'Chưa kiểm tra được tài khoản 9app');
      const s = sessions.get(sessionId9id);
      return !!(s && s.valid);
    },
    async sessionEnd(sessionId9id) { const s = sessions.get(sessionId9id); if (s) s.valid = false; },
    async families(userId) { const u = users.get(userId); return u ? u.families : []; },
  };
}

export function createIdIdentity({ url, keyId, secret, timeoutMs = 4000, fetchImpl = fetch, now = () => Date.now(), familiesTtlMs = 60_000, maxInflight = 20 }) {
  const famCache = new TtlCache();
  const base = new URL(url);
  let inflight = 0;

  async function call(method, pathAfterBase, bodyObj) {
    const full = new URL(base.pathname.replace(/\/+$/, '') + pathAfterBase, base);
    const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const ts = String(Math.floor(now() / 1000));
    const nonce = crypto.randomBytes(16).toString('base64url');
    const pathq = full.pathname + full.search;
    const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n${method}\n${pathq}\n${sha256hex(body)}`).digest('hex');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(full, {
        method, body: body || undefined, redirect: 'error', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-9id-key': keyId, 'x-9id-ts': ts, 'x-9id-nonce': nonce, 'x-9id-sig': sig },
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ }
      return { status: r.status, json };
    } finally { clearTimeout(timer); }
  }
  // 429 của 9id khác với sập: báo "bận", không báo 503 cho mọi người. Giới hạn đồng thời để kẻ xấu không đẩy 9id tới sập.
  async function guarded(method, path, body) {
    if (inflight >= maxInflight) throw new ApiError(429, 'identity_busy', 'Hệ thống tài khoản 9app đang bận, bạn thử lại sau ít giây');
    inflight++;
    let r;
    try { r = await call(method, path, body); } catch (e) {
      logEvent('id_unreachable', { code: e && e.name });
      throw new ApiError(503, 'identity_unavailable', 'Chưa kiểm tra được tài khoản 9app lúc này, thử lại sau ít phút');
    } finally { inflight--; }
    if (r.status === 429) { logEvent('id_rate_limited', {}); throw new ApiError(429, 'identity_busy', 'Hệ thống tài khoản 9app đang bận, bạn thử lại sau ít giây'); }
    return r;
  }

  return {
    kind: '9id',
    async exchange(code, redirectUri) {
      if (typeof code !== 'string' || !/^[A-Za-z0-9_.~-]{8,200}$/.test(code)) return null;
      const r = await guarded('POST', '/internal/v1/exchange', { client: 'osin', code, redirect_uri: redirectUri });
      if (r.status === 400 || r.status === 401 || r.status === 404) return null;
      if (r.status !== 200 || !r.json) { logEvent('id_bad_status', { status: r.status }); throw new ApiError(503, 'identity_unavailable', 'Chưa kiểm tra được tài khoản 9app lúc này, thử lại sau ít phút'); }
      return normUser(r.json);
    },
    async sessionValid(sessionId9id) {
      const r = await guarded('POST', '/internal/v1/session-valid', { sessionId9id });
      if (r.status === 401 || r.status === 404) return false;
      // 200 nhưng không phải JSON (trang đăng nhập của proxy, trang lỗi...) là 9id hỏng, KHÔNG phải "phiên hết hạn": không được đăng xuất mọi người
      if (r.status !== 200 || !r.json || typeof r.json.valid !== 'boolean') { logEvent('id_bad_status', { status: r.status }); throw new ApiError(503, 'identity_unavailable', 'Chưa kiểm tra được tài khoản 9app lúc này, thử lại sau ít phút'); }
      return r.json.valid === true;
    },
    /** Osin đăng xuất: báo 9id xóa phiên con (POST /internal/v1/session-end). Không ném lỗi: phiên con tự hết hạn sau 30 ngày nếu không báo được. */
    async sessionEnd(sessionId9id) {
      try { await guarded('POST', '/internal/v1/session-end', { sessionId9id }); } catch { /* best effort */ }
    },
    async families(userId) {
      if (!ID_RE.test(userId)) return [];
      const t = now();
      const hit = famCache.get(userId, t);
      if (hit) return hit;
      try {
        const r = await call('GET', `/internal/v1/users/${encodeURIComponent(userId)}/families`);
        if (r.status !== 200) { logEvent('id_families_status', { status: r.status }); return []; } // 401 token_required = 9id chưa cho osin vào INTERNAL_DELEGATE_APPS
        const list = normFamilies(r.json && r.json.families);
        famCache.set(userId, list, familiesTtlMs, t);
        return list;
      } catch { return []; }
    },
    clearCache() { famCache.clear(); },
  };
}
