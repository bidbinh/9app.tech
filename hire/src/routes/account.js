// Tài khoản 9id (tùy chọn): xem trạng thái và NHẬN nhà tuyển dụng ẩn danh của máy này vào tài khoản.
// Nhận là hành động có xác nhận của người dùng. Một tài khoản chỉ có MỘT nhà tuyển dụng; không bao giờ chiếm nhà tuyển dụng đã có user_id.
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { idEnabled } from '../nine-session.js';

// Nhà tuyển dụng ẩn danh của PHIÊN HIỆN TẠI, chưa gắn tài khoản nào. conflict: người dùng này đã có nhà tuyển dụng.
async function candidate(q, sid, userId, lock = '') {
  const r = await q(
    `SELECT e.id, e.name, EXISTS (SELECT 1 FROM employers x WHERE x.user_id = $2::uuid) AS conflict
       FROM employers e JOIN phien p ON p.employer_id = e.id
      WHERE p.token_hash = $1 AND e.user_id IS NULL ORDER BY e.seq LIMIT 1 ${lock}`, [sid, userId]);
  return r[0] || null;
}

export function accountRoutes(app) {
  app.route('GET', '/api/account', async (ctx) => {
    const out = {
      enabled: idEnabled(), loggedIn: !!ctx.userId, idDown: !!ctx.idDown,
      user: ctx.userId ? { displayName: ctx.userName || '' } : null,   // không bao giờ trả id hay số điện thoại
      loginPath: config.nineIdPublicPath, claimable: null, conflict: null,
    };
    if (!out.enabled || !ctx.userId || !ctx.sid) return out;
    const c = await candidate(query, ctx.sid, ctx.userId);
    if (c) { if (c.conflict) out.conflict = { employerName: c.name }; else out.claimable = { employerName: c.name }; }
    return out;
  });

  app.route('POST', '/api/account/claim', async (ctx) => {
    if (!idEnabled()) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    if (ctx.idDown) throw new ApiError(503, 'id_unavailable', 'Chưa kết nối được dịch vụ tài khoản 9app, thử lại sau ít phút');
    if (!ctx.userId) throw new ApiError(401, 'unauthenticated', 'Bạn cần đăng nhập tài khoản 9app trước.', { login: config.nineIdPublicPath });
    if (!ctx.sid) return { claimed: null, skipped: null };
    const userId = ctx.userId, sid = ctx.sid;
    return tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 9201))', ['u:' + userId]);   // cùng khóa với tạo nhà tuyển dụng của tài khoản
      const r = await candidate(c.query, sid, userId, 'FOR UPDATE OF e');
      if (!r) return { claimed: null, skipped: null };
      if (r.conflict) return { claimed: null, skipped: { employerName: r.name, reason: 'da_co_nha_tuyen_dung' } };
      const u = await c.query('UPDATE employers SET user_id = $2 WHERE id = $1 AND user_id IS NULL RETURNING id', [r.id, userId]);
      return u.length ? { claimed: { employerName: r.name }, skipped: null } : { claimed: null, skipped: { employerName: r.name, reason: 'da_duoc_nhan' } };
    });
  });
}
