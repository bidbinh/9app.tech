// Xác thực bằng tài khoản 9app dùng chung (9id). Cookie nine_sid (cùng nguồn gốc 9app.tech) -> 9id verify -> ctx.user.
// Không còn cookie ẩn danh fsid, link mời, ghép thiết bị, mã khôi phục. (Ngoại lệ có kiểm soát: LEGACY_SESSIONS=1 chỉ cho XEM
// gia đình cũ chưa được nhận về 9id trong lúc cutover, xem README.)
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { sha256hex, UUID_RE } from './util.js';
import { verifyToken, familyContext, TOKEN_RE } from './id.js';

export const COOKIE = 'nine_sid';
export const LEGACY_COOKIE = 'fsid';
const LEGACY_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Mỗi yêu cầu: đọc nine_sid, hỏi 9id (đệm <= 60 giây). ctx.user = { userId, displayName } hoặc null. ctx.sid = băm token (dùng làm khóa giới hạn tốc độ/idempotency/thiết bị đẩy).
export async function resolveSession(ctx) {
  const t = ctx.cookies[COOKIE];
  if (t && TOKEN_RE.test(t)) {
    const user = await verifyToken(t); // 9id lỗi -> ném 503 (không coi là đăng xuất)
    if (user) { ctx.user = user; ctx.token = t; ctx.sid = sha256hex(t); return null; }
  }
  // chế độ tương thích khi cutover: phiên ẩn danh cũ, chỉ đọc
  const lt = config.legacySessions && ctx.cookies[LEGACY_COOKIE];
  if (lt && LEGACY_TOKEN_RE.test(lt)) {
    const h = sha256hex(lt);
    if ((await query('SELECT 1 FROM sessions WHERE token_hash = $1 LIMIT 1', [h])).length) { ctx.legacy = h; ctx.sid = h; }
  }
  return null;
}

export const loginInfo = () => ({ login: config.nineIdPublicPath });
export function unauthenticated() {
  return new ApiError(401, 'unauthenticated', 'Bạn chưa đăng nhập tài khoản 9app. Hãy đăng nhập hoặc đăng ký để dùng 9family.', loginInfo());
}
// Phải đăng nhập 9id (chế độ cũ chỉ-đọc không tính). Chưa đăng nhập: 401 chuẩn để giao diện chuyển sang /id/?next=...
export function requireUser(ctx) {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
}
export function requireSession(ctx) {
  if (!ctx.user && !ctx.legacy) throw unauthenticated();
  return ctx.sid;
}

// Nhãn thiết bị thô từ User-Agent (không lưu nguyên chuỗi UA)
export function deviceLabel(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'iPhone/iPad';
  if (/Android/i.test(s)) return 'Điện thoại Android';
  if (/Windows/i.test(s)) return 'Máy tính Windows';
  if (/Macintosh|Mac OS/i.test(s)) return 'Máy Mac';
  if (/Linux/i.test(s)) return 'Máy Linux';
  return 'Thiết bị';
}

// Thành viên cũ (phiên ẩn danh) của gia đình CHƯA được nhận về 9id; chỉ dùng ở chế độ tương thích
async function legacyMember(sid, fid) {
  const rows = await query(
    `SELECT m.* FROM members m JOIN sessions s ON s.member_id = m.id
      WHERE s.token_hash = $1 AND m.family_id = $2 AND m.left_at IS NULL AND m.external = false AND m.user_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM members x WHERE x.family_id = m.family_id AND x.user_id IS NOT NULL AND x.left_at IS NULL) LIMIT 1`, [sid, fid]);
  return rows[0] || null;
}
export async function legacyFamilies(sid) {
  return query(
    `SELECT f.id, f.name, m.id AS member_id, m.name AS my_name, m.role
       FROM members m JOIN sessions s ON s.member_id = m.id JOIN families f ON f.id = m.family_id
      WHERE s.token_hash = $1 AND m.left_at IS NULL AND m.external = false AND m.user_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM members x WHERE x.family_id = m.family_id AND x.user_id IS NOT NULL AND x.left_at IS NULL)
      ORDER BY m.joined_at DESC NULLS LAST`, [sid]);
}

// Người ngoài gia đình và gia đình không tồn tại đều nhận 404 như nhau. Tham số q giữ cho tương thích chữ ký cũ (không dùng).
// Trả hàng members của người gọi (+ userId, memberId, role theo 9id, childIds, isExternal). Đặt ctx.view = bản đọc từ 9id.
export async function requireMember(q, ctx, fid) {
  if (!UUID_RE.test(String(fid))) throw new ApiError(404, 'not_found', 'Không tìm thấy gia đình này, hoặc bạn không ở trong gia đình');
  fid = String(fid).toLowerCase();
  if (ctx.user) {
    const { me, view } = await familyContext(ctx, fid);
    ctx.view = view;
    return me;
  }
  if (ctx.legacy) {
    const m = await legacyMember(ctx.legacy, fid);
    if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy gia đình này, hoặc bạn không ở trong gia đình');
    if (ctx.req.method !== 'GET') throw new ApiError(423, 'migrating', 'Gia đình đang chuyển sang tài khoản 9app nên tạm thời chỉ xem được. Hãy đăng nhập 9app và nhập mã nhận gia đình để tiếp tục.', loginInfo());
    return Object.assign(m, { userId: null, memberId: m.id, isExternal: false, childIds: [], legacy: true });
  }
  throw unauthenticated();
}

export const isManager = (m) => m.role === 'chu' || m.role === 'quan_ly';
export const isChild = (m) => m.role === 'con';
export const forbidden = (msg = 'Bạn không có quyền làm việc này') => new ApiError(403, 'forbidden', msg);
export function requireManager(me, msg = 'Chỉ chủ gia đình hoặc người quản lý mới làm được việc này') {
  if (!isManager(me)) throw forbidden(msg);
}
export function requireOwner(me, msg = 'Chỉ chủ gia đình mới làm được việc này') {
  if (me.role !== 'chu') throw forbidden(msg);
}
// Vai 'con' không làm được việc của người lớn (mời, đặt lịch, xem thông tin nhạy cảm...)
export function requireAdult(me, msg = 'Việc này dành cho người lớn trong gia đình') {
  if (me.role === 'con') throw forbidden(msg);
}

export async function touch(ctx) {
  if (!ctx.user) return;
  await query(`UPDATE members SET last_seen_at = now() WHERE user_id = $1 AND last_seen_at < now() - interval '1 minute'`, [ctx.user.userId]);
}
