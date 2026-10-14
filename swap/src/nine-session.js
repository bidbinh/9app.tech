// Nhận diện người dùng đăng nhập 9id (tài khoản 9app dùng chung) từ cookie `nine_sid`, như một LỚP TÙY CHỌN trên phiên ẩn danh.
//
//  * Tích hợp chỉ bật khi có NINE_ID_SECRET (>= 32 ký tự) hoặc khi kiểm thử bơm máy khách giả; ngược lại mọi thứ chạy như trước.
//  * `ctx.userId` LUÔN lấy từ máy chủ 9id (verify), không bao giờ từ dữ liệu client gửi.
//  * 9id không đạt được (hạ tầng lỗi) -> `ctx.idDown = true`, `ctx.userId = null`; app vẫn chạy ẩn danh, KHÔNG coi là đăng xuất và không lỗi 5xx.
//  * Đệm 60 giây theo băm token; đệm âm 15 giây cho token không hợp lệ (cookie giả không làm 9id bị gọi dồn); cầu dao NINE_ID_BREAK_MS.
import { config } from './config.js';
import { createNineId } from './nine-id.js';
import { sha256hex, UUID_RE } from './util.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const NEG_MS = 15_000;

let override = null;   // máy khách giả (kiểm thử)
let client = null;
let nowFn = Date.now;
export const setNow = (fn) => { nowFn = fn || Date.now; };

const cache = new Map();   // băm token -> { user | null, at }
const inflight = new Map(); // băm token -> Promise đang hỏi 9id (gộp các yêu cầu đồng thời cùng token)
const CACHE_MAX = 5000;
export const cacheSize = () => cache.size;
let brokenAt = -Infinity;
export function flushCaches() { cache.clear(); inflight.clear(); brokenAt = -Infinity; }
export function setIdClient(c) { override = c || null; client = null; flushCaches(); }

export function idEnabled() {
  return !!override || (typeof config.nineIdSecret === 'string' && config.nineIdSecret.length >= 32);
}
function idClient() {
  if (override) return override;
  if (!client) client = createNineId({ baseUrl: config.nineIdUrl, keyId: config.nineIdKeyId, secret: config.nineIdSecret, timeoutMs: config.idTimeoutMs });
  return client;
}

function remember(h, user) {
  cache.set(h, { user, at: nowFn() });
  if (cache.size > CACHE_MAX) {
    const t = nowFn();
    for (const [k, v] of cache) if (t - v.at >= (v.user ? config.idCacheMs : NEG_MS)) cache.delete(k);   // bỏ mục hết hạn
    for (const k of cache.keys()) { if (cache.size <= CACHE_MAX - 500) break; cache.delete(k); }          // vẫn quá trần: bỏ mục cũ nhất
  }
}

// -> { userId, displayName } | null (token không hợp lệ/hết hạn). Ném lỗi khi 9id không đạt được hoặc trả dữ liệu lạ.
export async function verifyToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const h = sha256hex(token);
  const hit = cache.get(h);
  if (hit && nowFn() - hit.at < (hit.user ? config.idCacheMs : NEG_MS)) return hit.user;
  const pending = inflight.get(h);
  if (pending) return pending;                                   // đang có một lần hỏi cùng token: dùng chung kết quả
  if (config.idBreakMs > 0 && nowFn() - brokenAt < config.idBreakMs) throw new Error('9id tạm không đạt được');
  const p = (async () => {
    let u;
    try { u = await idClient().verify(token); } catch (e) { brokenAt = nowFn(); throw e; }
    if (!u) { remember(h, null); return null; }
    if (!u.userId || !UUID_RE.test(String(u.userId))) { brokenAt = nowFn(); throw new Error('9id trả dữ liệu không hợp lệ'); }
    const user = { userId: String(u.userId).toLowerCase(), displayName: String(u.displayName || '').slice(0, 80) };
    remember(h, user);
    return user;
  })().finally(() => { inflight.delete(h); });
  inflight.set(h, p);
  return p;
}

// Gắn ctx.userId / ctx.userName / ctx.idDown. Không bao giờ ném lỗi (app phải chạy ẩn danh khi 9id có vấn đề).
export async function resolveUser(ctx) {
  ctx.userId = null;
  if (!idEnabled()) return;
  const t = ctx.cookies && ctx.cookies.nine_sid;
  if (!t || !TOKEN_RE.test(t)) return;
  try {
    const u = await verifyToken(t);
    if (u) { ctx.userId = u.userId; ctx.userName = u.displayName; }
  } catch (e) {
    ctx.idDown = true;
    if (!resolveUser.warned || nowFn() - resolveUser.warned > 60_000) { resolveUser.warned = nowFn(); console.error('[9id] không xác thực được:', (e && e.message) || e); }
  }
}
