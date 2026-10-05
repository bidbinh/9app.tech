// Idempotency-Key: bấm hai lần (hoặc mạng thử lại) cùng khóa thì trả lại đúng kết quả lần đầu, không làm hai lần.
import { query } from './db.js';
import { ApiError } from './errors.js';

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

// opts.noBody: phản hồi chứa mã bí mật (mã mời, mã khôi phục...) nên KHÔNG lưu vào bảng idem; bấm lại cùng khóa thì báo đã xử lý.
export function withIdem(handler, opts = {}) {
  return async (ctx) => {
    const raw = ctx.headers['idempotency-key'];
    if (!raw) return handler(ctx);
    if (!KEY_RE.test(String(raw))) throw new ApiError(400, 'bad_idempotency_key', 'Khóa Idempotency-Key không hợp lệ');
    const scope = ctx.sid || 'ip:' + ctx.ip;
    const key = `${raw}|${ctx.req.method} ${ctx.req.url.split('?')[0]}`;
    const claimed = await query('INSERT INTO idem(scope, key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [scope, key]);
    if (!claimed.length) {
      const row = (await query('SELECT status, body FROM idem WHERE scope=$1 AND key=$2', [scope, key]))[0];
      if (!row || row.body === null) throw new ApiError(409, 'in_progress', 'Yêu cầu trước đó vẫn đang xử lý, đợi một chút');
      if (row.body && row.body.__noreplay) return { __status: 409, body: { error: { code: 'already_done', message: 'Thao tác này đã được thực hiện. Hãy tải lại trang để xem kết quả.' } } };
      return { __status: row.status, body: row.body };
    }
    if (Math.random() < 0.01) query("DELETE FROM idem WHERE created_at < now() - interval '2 days'").catch(() => {});
    let out;
    try { out = await handler(ctx); } catch (e) {
      await query('DELETE FROM idem WHERE scope=$1 AND key=$2', [scope, key]).catch(() => {});
      throw e;
    }
    if (out && out.__raw) { await query('DELETE FROM idem WHERE scope=$1 AND key=$2', [scope, key]); return out; }
    const status = out && out.__status ? out.__status : 200;
    const body = opts.noBody ? { __noreplay: true } : (out && out.__status ? out.body : (out ?? { ok: true }));
    await query('UPDATE idem SET status=$3, body=$4 WHERE scope=$1 AND key=$2', [scope, key, status, JSON.stringify(body)]);
    return out;
  };
}
