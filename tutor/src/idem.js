// Idempotency-Key: bấm hai lần (hoặc mạng thử lại) cùng khóa và cùng nội dung thì trả lại đúng kết quả lần đầu, không làm hai lần.
// Cùng khóa nhưng khác nội dung thì 422. Hàng đang xử lý mà tiến trình chết (quá 60 giây không có kết quả) được dọn và cho làm lại.
import { query } from './db.js';
import { ApiError } from './errors.js';
import { sha256hex } from './util.js';

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function withIdem(handler) {
  return async (ctx) => {
    const raw = ctx.headers['idempotency-key'];
    if (!raw) return handler(ctx);
    if (!KEY_RE.test(String(raw))) throw new ApiError(400, 'bad_idempotency_key', 'Khóa Idempotency-Key không hợp lệ');
    const scope = ctx.sid || 'ip:' + ctx.ip;
    const key = `${raw}|${ctx.req.method} ${ctx.req.url.split('?')[0]}`;
    const hash = sha256hex(ctx.raw || '');
    await query("DELETE FROM idem WHERE scope=$1 AND key=$2 AND body IS NULL AND created_at < now() - interval '60 seconds'", [scope, key]);
    const claimed = await query('INSERT INTO idem(scope, key, req_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1', [scope, key, hash]);
    if (!claimed.length) {
      const row = (await query('SELECT status, body, req_hash FROM idem WHERE scope=$1 AND key=$2', [scope, key]))[0];
      if (row && row.req_hash && row.req_hash !== hash) throw new ApiError(422, 'idempotency_mismatch', 'Khóa Idempotency-Key này đã dùng cho một yêu cầu khác nội dung');
      if (!row || row.body === null) throw new ApiError(409, 'in_progress', 'Yêu cầu trước đó vẫn đang xử lý, đợi một chút');
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
    const body = out && out.__status ? out.body : (out ?? { ok: true });
    await query('UPDATE idem SET status=$3, body=$4 WHERE scope=$1 AND key=$2', [scope, key, status, JSON.stringify(body)]);
    return out;
  };
}
