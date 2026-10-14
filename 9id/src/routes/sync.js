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
    const r = (await query('SELECT epoch, version, data, updated_at FROM sync_docs WHERE user_id=$1 AND app=$2', [user.id, a]))[0];
    return r ? { epoch: r.epoch, version: r.version, data: r.data, updatedAt: r.updated_at } : { epoch: null, version: 0, data: null, updatedAt: null };
  }, { limit: 120, limitKey: 'sync-get' });

  app.route('PUT', '/api/sync/:app', async (ctx) => {
    const user = requireUser(ctx);
    const a = appOf(ctx);
    const base = ctx.body.baseVersion;
    if (!Number.isInteger(base) || base < 0) throw new ApiError(400, 'invalid_input', 'baseVersion không hợp lệ');
    if (!plain(ctx.body.data)) throw new ApiError(400, 'invalid_input', 'Dữ liệu đồng bộ phải là một đối tượng');
    const json = JSON.stringify(ctx.body.data);
    if (json.includes('\u0000')) throw new ApiError(400, 'invalid_input', 'Dữ liệu chứa ký tự không hợp lệ');   // PostgreSQL jsonb không nhận \u0000
    const bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > config.syncMaxBytes) throw new ApiError(413, 'too_large', 'Dữ liệu quá lớn để đồng bộ');
    let out;
    try {
      out = await tx(async (c) => {
        // ghi có điều kiện NGUYÊN TỬ trong một câu lệnh (không có cửa sổ giữa kiểm và ghi); chỉ dùng kết nối của giao dịch này
        const w = base === 0
          ? await c.query('INSERT INTO sync_docs(user_id, app, version, data, bytes) VALUES($1,$2,1,$3,$4) ON CONFLICT (user_id, app) DO NOTHING RETURNING epoch, version', [user.id, a, json, bytes])
          : await c.query('UPDATE sync_docs SET version=version+1, data=$3, bytes=$4, updated_at=now() WHERE user_id=$1 AND app=$2 AND version=$5 RETURNING epoch, version', [user.id, a, json, bytes, base]);
        if (w.length) return { ok: { epoch: w[0].epoch, version: w[0].version } };
        const r = (await c.query('SELECT epoch, version, data FROM sync_docs WHERE user_id=$1 AND app=$2', [user.id, a]))[0];
        return { conflict: r ? { epoch: r.epoch, version: r.version, data: r.data } : { epoch: null, version: 0, data: null } };
      });
    } catch (e) {
      if (e && typeof e.code === 'string' && e.code.startsWith('22')) throw new ApiError(400, 'invalid_input', 'Dữ liệu đồng bộ không hợp lệ');
      throw e;
    }
    if (out.conflict) throw new ApiError(409, 'conflict', 'Dữ liệu trên máy chủ đã thay đổi, hãy gộp lại', out.conflict);
    return out.ok;
  }, { limit: 60, limitKey: 'sync-put', maxBody: config.syncMaxBytes + 4096 });

  app.route('DELETE', '/api/sync/:app', async (ctx) => {
    const user = requireUser(ctx);
    const a = appOf(ctx);
    await query('DELETE FROM sync_docs WHERE user_id=$1 AND app=$2', [user.id, a]);
    return { ok: true };
  }, { limit: 30, limitKey: 'sync-del' });
}
