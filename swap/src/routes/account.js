// Tài khoản 9id (tùy chọn): xem trạng thái và NHẬN các cộng đồng ẩn danh đang có trên máy này vào tài khoản.
// Nhận là hành động có xác nhận của người dùng (không tự động khi đăng nhập: máy dùng chung có thể chứa thành viên của người khác).
// Thành viên đang bị khóa vẫn nhận được và GIỮ NGUYÊN khóa (khóa theo người).
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { idEnabled } from '../nine-session.js';

const uniqueViolation = (e) => e && e.code === '23505';

// Thành viên ẩn danh của PHIÊN HIỆN TẠI (qua bảng phien), còn trong cộng đồng, chưa gắn user_id nào.
// conflict: người dùng này đã có thành viên đang hoạt động ở cùng cộng đồng (hai danh tính trong một cộng đồng thì không gộp được).
async function candidates(q, sid, userId, lock = '') {
  return q(
    `SELECT m.id AS member_id, m.community_id, c.name AS community_name, m.name AS my_name,
            EXISTS (SELECT 1 FROM members x WHERE x.community_id = m.community_id AND x.user_id = $2::uuid AND x.left_at IS NULL) AS conflict
       FROM members m JOIN communities c ON c.id = m.community_id
      WHERE m.left_at IS NULL AND m.user_id IS NULL
        AND EXISTS (SELECT 1 FROM phien p WHERE p.member_id = m.id AND p.token_hash = $1)
      ORDER BY m.joined_at, m.seq ${lock}`, [sid, userId]);
}

export function accountRoutes(app) {
  app.route('GET', '/api/account', async (ctx) => {
    const out = {
      enabled: idEnabled(), loggedIn: !!ctx.userId, idDown: !!ctx.idDown,
      user: ctx.userId ? { displayName: ctx.userName || '' } : null,   // không bao giờ trả id hay số điện thoại
      loginPath: config.nineIdPublicPath, claimable: [], conflicts: [],
    };
    if (!out.enabled || !ctx.userId || !ctx.sid) return out;
    for (const r of await candidates(query, ctx.sid, ctx.userId)) {
      (r.conflict ? out.conflicts : out.claimable).push(r.conflict
        ? { communityId: r.community_id, communityName: r.community_name }
        : { communityId: r.community_id, communityName: r.community_name, myName: r.my_name });
    }
    return out;
  });

  app.route('POST', '/api/account/claim', async (ctx) => {
    if (!idEnabled()) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    if (ctx.idDown) throw new ApiError(503, 'id_unavailable', 'Chưa kết nối được dịch vụ tài khoản 9app, thử lại sau ít phút');
    if (!ctx.userId) throw new ApiError(401, 'unauthenticated', 'Bạn cần đăng nhập tài khoản 9app trước.', { login: config.nineIdPublicPath });
    if (!ctx.sid) return { claimed: [], skipped: [] };
    const userId = ctx.userId, sid = ctx.sid;
    return tx(async (c) => {
      // một người dùng nhận từng đợt một: các yêu cầu đồng thời xếp hàng, không đua chỉ mục duy nhất
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['swap-claim:' + userId]);
      const claimed = [], skipped = [];
      let n = 0;
      for (const r of await candidates(c.query, sid, userId, 'FOR UPDATE OF m')) {
        const item = { communityId: r.community_id, communityName: r.community_name };
        if (r.conflict) { skipped.push({ ...item, reason: 'da_co_thanh_vien' }); continue; }
        const sp = 'claim' + (n++);
        await c.query('SAVEPOINT ' + sp);
        try {
          const u = await c.query('UPDATE members SET user_id=$2 WHERE id=$1 AND user_id IS NULL AND left_at IS NULL RETURNING id', [r.member_id, userId]);
          await c.query('RELEASE SAVEPOINT ' + sp);
          if (u.length) claimed.push(item); else skipped.push({ ...item, reason: 'da_duoc_nhan' });
        } catch (e) {
          if (!uniqueViolation(e)) throw e;
          await c.query('ROLLBACK TO SAVEPOINT ' + sp);   // vừa có thành viên khác của người này vào cộng đồng (đua với gia nhập)
          skipped.push({ ...item, reason: 'da_co_thanh_vien' });
        }
      }
      return { claimed, skipped };
    });
  });
}
