// Đồng bộ dữ liệu app chỉ lưu ở máy qua tài khoản 9id. Máy chủ chỉ lưu một tài liệu JSON cho mỗi (người dùng, app) và kiểm phiên bản;
// việc gộp xảy ra ở máy khách (xem public/nine-sync.mjs). Không ghi nội dung vào nhật ký.
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import { requireUser } from '../auth.js';

const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function syncRoutes(app) {
  const appOf = (ctx) => {
    const a = String(ctx.params.app || '');
    if (!config.syncApps.has(a)) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    return a;
  };

  app.route('GET', '/api/sync/:app', async (ctx) => {
    const user = requireUser(ctx);
    const a = appOf(ctx);
    const r = (await query('SELECT version, data, updated_at FROM sync_docs WHERE user_id=$1 AND app=$2', [user.id, a]))[0];
    return r ? { version: r.version, data: r.data, updatedAt: r.updated_at } : { version: 0, data: null, updatedAt: null };
  }, { limit: 120, limitKey: 'sync-get' });

  app.route('PUT', '/api/sync/:app', async (ctx) => {
    const user = requireUser(ctx);
    const a = appOf(ctx);
    const base = ctx.body.baseVersion;
    if (!Number.isInteger(base) || base < 0) throw new ApiError(400, 'invalid_input', 'baseVersion không hợp lệ');
    if (!plain(ctx.body.data)) throw new ApiError(400, 'invalid_input', 'Dữ liệu đồng bộ phải là một đối tượng');
    const bytes = Buffer.byteLength(JSON.stringify(ctx.body.data), 'utf8');
    if (bytes > config.syncMaxBytes) throw new ApiError(413, 'too_large', 'Dữ liệu quá lớn để đồng bộ');
    const conflict = async () => {
      const r = (await query('SELECT version, data FROM sync_docs WHERE user_id=$1 AND app=$2', [user.id, a]))[0];
      return new ApiError(409, 'conflict', 'Dữ liệu trên máy chủ đã thay đổi, hãy gộp lại', r ? { version: r.version, data: r.data } : { version: 0, data: null });
    };
    try { return await tx(async (c) => {
      // ghi có điều kiện: chỉ thành công khi phiên bản hiện tại đúng bằng baseVersion (0 = chưa có)
      const cur = (await c.query('SELECT version FROM sync_docs WHERE user_id=$1 AND app=$2 FOR UPDATE', [user.id, a]))[0];
      const curVersion = cur ? cur.version : 0;
      if (curVersion !== base) throw await conflict();
      const next = curVersion + 1;
      await c.query(
        `INSERT INTO sync_docs(user_id, app, version, data, bytes) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, app) DO UPDATE SET version=EXCLUDED.version, data=EXCLUDED.data, bytes=EXCLUDED.bytes, updated_at=now()`,
        [user.id, a, next, JSON.stringify(ctx.body.data), bytes]);
      return { version: next };
    }); } catch (e) {
      if (e && e.code === '23505') throw await conflict();   // hai máy cùng tạo tài liệu đầu tiên: một bên thắng, bên kia gộp lại
      throw e;
    }
  }, { limit: 60, limitKey: 'sync-put', maxBody: config.syncMaxBytes + 4096 });

  app.route('DELETE', '/api/sync/:app', async (ctx) => {
    const user = requireUser(ctx);
    const a = appOf(ctx);
    await query('DELETE FROM sync_docs WHERE user_id=$1 AND app=$2', [user.id, a]);
    return { ok: true };
  }, { limit: 30, limitKey: 'sync-del' });
}
