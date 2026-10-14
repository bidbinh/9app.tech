import { AppError } from './errors.js';
import { tx } from './db.js';
import { COOKIE_SESSION } from './http.js';
import { getMemberByUser, can } from './access.js';

// Danh tính từ cookie nine_sid qua 9id; vai từ bảng members. mode: 'none' | 'user' (đã đăng nhập 9id) | 'member' (đã thuộc tổ chức).
// Không bao giờ tin vai hoặc org do client gửi.
export function makeAuthResolver({ idClient }) {
  return async function resolve(ctx, mode) {
    if (mode === 'none') return;
    const token = ctx.cookies[COOKIE_SESSION];
    if (!token) throw new AppError('unauthenticated', 'Bạn chưa đăng nhập', 401);
    let who;
    try { who = await idClient.verify(token); } catch (e) {
      console.error('[9id]', e && e.message);
      throw new AppError('id_unavailable', 'Chưa kết nối được dịch vụ tài khoản, hãy thử lại sau', 503);
    }
    if (!who) throw new AppError('unauthenticated', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401);
    ctx.user = { userId: who.userId, displayName: who.displayName };
    if (mode === 'user') return;
    const m = await tx((c) => getMemberByUser(c, who.userId));
    if (!m) throw new AppError('not_member', 'Tài khoản chưa thuộc tổ chức nào. Hãy nhập mã mời.', 403);
    ctx.member = m;
  };
}

// Kiểm quyền theo hành động; sai vai trả 403.
export function requirePerm(ctx, action) {
  if (!can(ctx.member.role, action)) throw new AppError('forbidden', 'Bạn không có quyền thực hiện việc này', 403);
}

export const isAgentRole = (role) => role === 'ctv' || role === 'sale';
export const isStaffRole = (role) => role === 'quanly' || role === 'letan';
