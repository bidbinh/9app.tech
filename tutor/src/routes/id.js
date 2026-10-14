// Tài khoản 9id (tùy chọn): xem trạng thái và NHẬN sổ gia sư ẩn danh của máy này vào tài khoản.
// Nhận là hành động có xác nhận của người dùng. Một tài khoản chỉ có MỘT gia sư; không bao giờ chiếm gia sư đã có user_id.
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { idEnabled } from '../nine-session.js';

// Gia sư ẩn danh của PHIÊN HIỆN TẠI (cookie tsid), chưa gắn tài khoản nào. conflict: người dùng này đã có gia sư.
async function candidate(q, sessHash, userId, lock = '') {
  const r = await q(
    `SELECT t.id, t.name, (SELECT count(*)::int FROM students s WHERE s.tutor_id = t.id AND s.active) AS students,
            EXISTS (SELECT 1 FROM tutors x WHERE x.user_id = $2::uuid) AS conflict
       FROM sessions s JOIN tutors t ON t.id = s.tutor_id
      WHERE s.token_hash = $1 AND t.user_id IS NULL ${lock}`, [sessHash, userId]);
  return r[0] || null;
}

export function idRoutes(app) {
  app.route('GET', '/api/account', async (ctx) => {
    const out = {
      enabled: idEnabled(), loggedIn: !!ctx.userId, idDown: !!ctx.idDown,
      user: ctx.userId ? { displayName: ctx.userName || '' } : null,   // không bao giờ trả id hay số điện thoại
      loginPath: config.nineIdPublicPath, claimable: null, conflict: null,
    };
    if (!out.enabled || !ctx.userId || !ctx.sessHash) return out;
    const c = await candidate(query, ctx.sessHash, ctx.userId);
    if (c) { const v = { tutorName: c.name, students: c.students }; if (c.conflict) out.conflict = v; else out.claimable = v; }
    return out;
  });

  app.route('POST', '/api/account/claim', async (ctx) => {
    if (!idEnabled()) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    if (ctx.idDown) throw new ApiError(503, 'id_unavailable', 'Chưa kết nối được dịch vụ tài khoản 9app, thử lại sau ít phút');
    if (!ctx.userId) throw new ApiError(401, 'unauthenticated', 'Bạn cần đăng nhập tài khoản 9app trước.', { login: config.nineIdPublicPath });
    if (!ctx.sessHash) return { claimed: null, skipped: null };
    const userId = ctx.userId, sessHash = ctx.sessHash;
    return tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 9201))', ['u:' + userId]);   // cùng khóa với tạo gia sư của tài khoản
      const r = await candidate(c.query, sessHash, userId, 'FOR UPDATE OF t');
      if (!r) return { claimed: null, skipped: null };
      const item = { tutorName: r.name, students: r.students };
      if (r.conflict) return { claimed: null, skipped: { ...item, reason: 'da_co_gia_su' } };
      const u = await c.query('UPDATE tutors SET user_id = $2 WHERE id = $1 AND user_id IS NULL RETURNING id', [r.id, userId]);
      return u.length ? { claimed: item, skipped: null } : { claimed: null, skipped: { ...item, reason: 'da_duoc_nhan' } };
    });
  });
}
