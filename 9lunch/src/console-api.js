// API quản trị chuẩn cho "9app Console" (giao thức v1, xem 9admin/docs/ADMIN-API.md).
// Xác thực HMAC-SHA256; chỉ bật khi đặt CONSOLE_API_KEY_ID và CONSOLE_API_SECRET.
// 9lunch không giữ tiền nên không khai capability "money"; chỉ có "users" (tên hiển thị ẩn danh, không số điện thoại).
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
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
  seen.set(k, now);
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const limitOf = (q, def = 500) => Math.min(1000, Math.max(1, Number.parseInt(q.limit, 10) || def));
const after = (q) => (/^\d{1,18}$/.test(q.after || '') ? q.after : '0');
const R = (app, path, handler) => app.route('GET', '/admin-api/v1' + path, async (ctx) => { verify(ctx); return handler(ctx); }, { limit: 600, limitKey: 'console' });

export function consoleApiRoutes(app) {
  R(app, '/manifest', async () => ({ app: { id: 'lunch', name: '9lunch', version: VERSION }, capabilities: ['users'], currency: 'VND' }));
  R(app, '/health', async () => { await query('SELECT 1'); return { ok: true, details: 'CSDL hoạt động' }; });

  R(app, '/summary', async () => {
    const r = (await query(
      `SELECT (SELECT count(*)::int FROM teams) AS teams,
              (SELECT count(*)::int FROM members WHERE left_at IS NULL) AS users,
              (SELECT count(*)::int FROM meals WHERE created_at > now() - interval '7 days') AS meals7,
              (SELECT count(*)::int FROM members WHERE left_at IS NULL AND last_seen_at > now() - interval '7 days') AS active7,
              (SELECT count(*)::int FROM meals WHERE status='thanh_toan' AND payment_at < now() - interval '14 days') AS stale`))[0];
    const alerts = [];
    if (r.stale) alerts.push({ level: 'info', text: `${r.stale} bữa còn ở bước thu tiền quá 14 ngày` });
    return {
      kpis: [
        { id: 'teams', label: 'Số nhóm', value: r.teams, format: 'int', tone: 'info' },
        { id: 'meals_7d', label: 'Bữa ăn 7 ngày qua', value: r.meals7, format: 'int' },
        { id: 'users', label: 'Người dùng (ẩn danh)', value: r.users, format: 'int' },
        { id: 'active_7d', label: 'Người hoạt động 7 ngày', value: r.active7, format: 'int', tone: 'ok' },
      ],
      alerts,
    };
  });

  R(app, '/users', async (ctx) => {
    const limit = limitOf(ctx.query);
    const rows = await query(
      `SELECT m.seq, m.name, m.role, m.joined_at, m.last_seen_at, t.name AS team FROM members m JOIN teams t ON t.id = m.team_id
        WHERE m.seq > $1 AND m.left_at IS NULL ORDER BY m.seq LIMIT ${limit + 1}`, [after(ctx.query)]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((u) => ({ id: String(u.seq), name: u.name, status: 'active', createdAt: iso(u.joined_at), lastSeenAt: iso(u.last_seen_at), extra: { nhom: u.team, vai_tro: u.role === 'chu' ? 'chủ nhóm' : 'thành viên' } })),
      next: items.length ? String(items[items.length - 1].seq) : null, hasMore: rows.length > limit,
    };
  });

  R(app, '/users/:id', async (ctx) => {
    if (!/^\d{1,18}$/.test(ctx.params.id)) throw new ApiError(404, 'not_found', 'Không có người dùng');
    const u = (await query(
      `SELECT m.*, t.name AS team, (SELECT count(*)::int FROM items i WHERE i.member_id = m.id) AS items
         FROM members m JOIN teams t ON t.id = m.team_id WHERE m.seq = $1`, [ctx.params.id]))[0];
    if (!u) throw new ApiError(404, 'not_found', 'Không có người dùng');
    return {
      title: u.name,
      fields: [
        { label: 'Tên hiển thị', value: u.name }, { label: 'Nhóm', value: u.team }, { label: 'Vai trò', value: u.role === 'chu' ? 'Chủ nhóm' : 'Thành viên' },
        { label: 'Vào nhóm lúc', value: iso(u.joined_at), format: 'datetime' }, { label: 'Hoạt động gần nhất', value: iso(u.last_seen_at), format: 'datetime' },
        { label: 'Số dòng món đã gọi', value: u.items, format: 'int' }, { label: 'Đã rời nhóm', value: u.left_at ? 'Có' : 'Không' },
      ],
    };
  });
}
