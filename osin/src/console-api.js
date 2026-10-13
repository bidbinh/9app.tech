// API quản trị chuẩn cho "9app Console" (giao thức v1, xem 9admin/docs/ADMIN-API.md).
// Xác thực HMAC-SHA256; chỉ bật khi đặt CONSOLE_API_KEY_ID và CONSOLE_API_SECRET.
// Osin không khai capability nào (không giữ tiền, không liệt kê người dùng); summary chỉ có số liệu tổng hợp, KHÔNG có nội dung hội thoại.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { todayVN } from './util.js';
import { ApiError } from './errors.js';

const VERSION = '1.0';
const MAX_SKEW_S = 120;
const seen = new Map();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const sign = (secret, ts, method, pathq, body = '') => crypto.createHmac('sha256', secret).update(`${ts}\n${String(method).toUpperCase()}\n${pathq}\n${sha256(body)}`).digest('hex');

function verify(ctx) {
  const { consoleApiKeyId: kid, consoleApiSecret: secret } = config;
  if (!kid || !secret) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  const h = ctx.headers;
  const ts = String(h['x-console-ts'] || '');
  if (h['x-console-key'] !== kid || !/^\d{9,12}$/.test(ts)) throw new ApiError(401, 'unauthorized', 'Xác thực không hợp lệ');
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_S) throw new ApiError(401, 'unauthorized', 'Đồng hồ lệch quá 120 giây');
  const want = Buffer.from(sign(secret, ts, ctx.req.method, ctx.req.url, ctx.raw || ''));
  const got = Buffer.from(String(h['x-console-sig'] || ''));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new ApiError(401, 'unauthorized', 'Chữ ký không hợp lệ');
  const k = ts + ':' + got.toString();
  const now = Date.now();
  for (const [key, at] of seen) if (now - at > (MAX_SKEW_S + 30) * 1000) seen.delete(key);
  if (seen.has(k)) throw new ApiError(401, 'unauthorized', 'Yêu cầu bị phát lại');
  seen.set(k, now);
}

const R = (app, path, handler) => app.route('GET', '/admin-api/v1' + path, async (ctx) => { verify(ctx); return handler(ctx); }, { limit: 600, limitKey: 'console' });

export function consoleApiRoutes(app, deps) {
  R(app, '/manifest', async () => ({ app: { id: 'osin', name: 'Osin', version: VERSION }, capabilities: [], currency: 'VND' }));
  R(app, '/health', async () => {
    await query('SELECT 1');
    const st = deps.registry.status();
    const down = st.filter((s) => !s.ok).length;
    return { ok: true, details: `CSDL hoạt động; AI: ${deps.llm.kind}; app kết nối ${st.length - down}/${st.length}` };
  });

  R(app, '/summary', async () => {
    const day = todayVN();
    const r = (await query(
      `SELECT count(*) FILTER (WHERE msgs > 0)::int AS users, COALESCE(sum(msgs),0)::int AS msgs, COALESCE(sum(tokens),0)::bigint AS tokens,
              COALESCE(sum(tool_calls),0)::int AS tools, COALESCE(sum(errors),0)::int AS errors
         FROM usage_daily WHERE day = $1`, [day]))[0];
    const a = (await query(`SELECT count(*) FILTER (WHERE status='pending' AND expires_at > now())::int AS pending,
                                   count(*) FILTER (WHERE status='done' AND decided_at > now() - interval '1 day')::int AS done,
                                   count(*) FILTER (WHERE status='failed' AND decided_at > now() - interval '1 day')::int AS failed
                              FROM pending_actions`))[0];
    const st = deps.registry.status();
    const down = st.filter((s) => !s.ok);
    const alerts = [];
    if (deps.llm.kind === 'offline') alerts.push({ level: 'info', text: 'Osin đang chạy chế độ không AI (chưa đặt OSIN_AI_KEY)' });
    if (down.length) alerts.push({ level: 'warn', text: `${down.length} app chưa kết nối được với Osin: ${down.map((d) => d.name).join(', ')}` });
    if (Number(r.tokens) > config.globalTokensPerDay * 0.8) alerts.push({ level: 'bad', text: 'Token hôm nay đã dùng quá 80% trần toàn hệ' });
    else if (Number(r.tokens) > config.globalTokensPerDay * 0.5) alerts.push({ level: 'warn', text: 'Token hôm nay đã dùng quá 50% trần toàn hệ' });
    if (a.failed > 0) alerts.push({ level: 'warn', text: `${a.failed} hành động xác nhận bị lỗi trong 24 giờ qua` });
    return {
      kpis: [
        { id: 'users_today', label: 'Người dùng trò chuyện hôm nay', value: r.users, format: 'int', tone: 'info' },
        { id: 'msgs_today', label: 'Lượt hội thoại hôm nay', value: r.msgs, format: 'int' },
        { id: 'tokens_today', label: 'Token AI hôm nay', value: Number(r.tokens), format: 'int', hint: `Trần toàn hệ ${config.globalTokensPerDay.toLocaleString('vi-VN')}` },
        { id: 'tools_today', label: 'Lần gọi công cụ hôm nay', value: r.tools, format: 'int' },
        { id: 'errors_today', label: 'Lượt lỗi hôm nay', value: r.errors, format: 'int', tone: r.errors ? 'warn' : 'ok' },
        { id: 'pending', label: 'Hành động đang chờ xác nhận', value: a.pending, format: 'int' },
        { id: 'done_24h', label: 'Hành động đã xác nhận (24 giờ)', value: a.done, format: 'int' },
        { id: 'apps_ok', label: 'App kết nối', value: `${st.length - down.length}/${st.length}`, format: 'text', tone: down.length ? 'warn' : 'ok' },
      ],
      alerts,
    };
  });
}
