// API quản trị chuẩn cho "9app Console" (giao thức v1, xem 9admin/docs/ADMIN-API.md).
// Xác thực HMAC-SHA256; chỉ bật khi đặt CONSOLE_API_KEY_ID và CONSOLE_API_SECRET.
// 9tutor không giữ tiền nên không khai capability "money"; chỉ có "users" (tên hiển thị gia sư, không số điện thoại, không tên học sinh).
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
  if (seen.has(k)) throw new ApiError(401, 'unauthorized', 'Yêu cầu bị phát lại');
  seen.set(k, now);
}

const STATUS_LABEL = { sinh_vien: 'Sinh viên', giao_vien_cong: 'Giáo viên trường công lập', giao_vien_khac: 'Giáo viên/người dạy khác', khac: 'Khác', chua_khai: 'Chưa khai' };
const iso = (d) => (d ? new Date(d).toISOString() : null);
const limitOf = (q, def = 500) => Math.min(1000, Math.max(1, Number.parseInt(q.limit, 10) || def));
const after = (q) => (/^\d{1,18}$/.test(q.after || '') ? q.after : '0');
const R = (app, path, handler) => app.route('GET', '/admin-api/v1' + path, async (ctx) => { verify(ctx); return handler(ctx); }, { limit: 600, limitKey: 'console' });

export function consoleApiRoutes(app) {
  R(app, '/manifest', async () => ({ app: { id: 'tutor', name: '9tutor', version: VERSION }, capabilities: ['users'], currency: 'VND' }));
  R(app, '/health', async () => { await query('SELECT 1'); return { ok: true, details: 'CSDL hoạt động' }; });

  R(app, '/summary', async () => {
    const r = (await query(
      `SELECT (SELECT count(*)::int FROM tutors) AS tutors,
              (SELECT count(*)::int FROM tutors WHERE last_seen_at > now() - interval '7 days') AS active7,
              (SELECT count(*)::int FROM students WHERE active) AS students,
              (SELECT count(*)::int FROM lessons WHERE status='da_day' AND day > current_date - 7) AS taught7,
              (SELECT count(*)::int FROM share_links WHERE revoked_at IS NULL) AS links,
              (SELECT count(*)::int FROM profiles WHERE enabled) AS profiles,
              (SELECT count(*)::int FROM tutors WHERE status='giao_vien_cong') AS gv_cong`))[0];
    const alerts = [];
    if (r.gv_cong) alerts.push({ level: 'info', text: `${r.gv_cong} tài khoản tự khai là giáo viên trường công lập (trang giới thiệu công khai bị khóa)` });
    return {
      kpis: [
        { id: 'tutors', label: 'Gia sư (ẩn danh)', value: r.tutors, format: 'int', tone: 'info' },
        { id: 'active_7d', label: 'Gia sư hoạt động 7 ngày', value: r.active7, format: 'int', tone: 'ok' },
        { id: 'students', label: 'Học sinh đang dạy', value: r.students, format: 'int' },
        { id: 'taught_7d', label: 'Buổi đã dạy 7 ngày qua', value: r.taught7, format: 'int' },
        { id: 'links', label: 'Link báo cáo phụ huynh', value: r.links, format: 'int' },
        { id: 'profiles', label: 'Trang giới thiệu công khai', value: r.profiles, format: 'int' },
      ],
      alerts,
    };
  });

  R(app, '/users', async (ctx) => {
    const limit = limitOf(ctx.query);
    const rows = await query(
      `SELECT t.seq, t.name, t.status, t.created_at, t.last_seen_at, (SELECT count(*)::int FROM students s WHERE s.tutor_id = t.id AND s.active) AS students
         FROM tutors t WHERE t.seq > $1 ORDER BY t.seq LIMIT ${limit + 1}`, [after(ctx.query)]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((u) => ({ id: String(u.seq), name: u.name, status: 'active', createdAt: iso(u.created_at), lastSeenAt: iso(u.last_seen_at), extra: { tinh_trang: STATUS_LABEL[u.status] || u.status, hoc_sinh: u.students } })),
      next: items.length ? String(items[items.length - 1].seq) : null, hasMore: rows.length > limit,
    };
  });

  R(app, '/users/:id', async (ctx) => {
    if (!/^[0-9]{1,18}$/.test(ctx.params.id)) throw new ApiError(404, 'not_found', 'Không có người dùng');
    const u = (await query(
      `SELECT t.*, (SELECT count(*)::int FROM students s WHERE s.tutor_id = t.id) AS students, (SELECT count(*)::int FROM students s WHERE s.tutor_id = t.id AND s.active) AS active_students,
              (SELECT count(*)::int FROM lessons l WHERE l.tutor_id = t.id AND l.status='da_day') AS taught, (SELECT count(*)::int FROM share_links k WHERE k.tutor_id = t.id AND k.revoked_at IS NULL) AS links,
              COALESCE((SELECT enabled FROM profiles p WHERE p.tutor_id = t.id), false) AS profile
         FROM tutors t WHERE t.seq = $1`, [ctx.params.id]))[0];
    if (!u) throw new ApiError(404, 'not_found', 'Không có người dùng');
    return {
      title: u.name,
      fields: [
        { label: 'Tên hiển thị', value: u.name }, { label: 'Tình trạng tự khai', value: STATUS_LABEL[u.status] || u.status },
        { label: 'Tạo lúc', value: iso(u.created_at), format: 'datetime' }, { label: 'Hoạt động gần nhất', value: iso(u.last_seen_at), format: 'datetime' },
        { label: 'Học sinh (tổng)', value: u.students, format: 'int' }, { label: 'Học sinh đang dạy', value: u.active_students, format: 'int' },
        { label: 'Buổi đã dạy', value: u.taught, format: 'int' }, { label: 'Link phụ huynh đang mở', value: u.links, format: 'int' },
        { label: 'Trang giới thiệu công khai', value: u.profile ? 'Bật' : 'Tắt' },
      ],
    };
  });
}
