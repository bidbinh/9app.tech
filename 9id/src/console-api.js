// API quản trị chuẩn cho "9app Console" (giao thức v1, xem 9admin/docs/ADMIN-API.md).
// Xác thực HMAC-SHA256; chỉ bật khi đặt CONSOLE_API_KEY_ID và CONSOLE_API_SECRET. Chỉ GET (đọc), nên lặp lại cùng yêu cầu
// trong cửa sổ 120 giây vô hại; ghi thì không có endpoint nào ở đây.
// 9id không giữ tiền: chỉ khai capability "users". Không trả số điện thoại đầy đủ: chỉ 4 số cuối trong `extra`.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { ApiError } from './errors.js';
import { usageLevel } from './otp.js';

const VERSION = '1.0';
const MAX_SKEW_S = 120;

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
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const limitOf = (q, def = 500) => Math.min(1000, Math.max(1, Number.parseInt(q.limit, 10) || def));
const after = (q) => (/^\d{1,18}$/.test(q.after || '') ? q.after : '0');
const R = (app, path, handler) => app.route('GET', '/admin-api/v1' + path, async (ctx) => { verify(ctx); return handler(ctx); }, { limit: 600, limitKey: 'console', internal: true });

export function consoleApiRoutes(app) {
  R(app, '/manifest', async () => ({ app: { id: 'id', name: '9id', version: VERSION }, capabilities: ['users'], currency: 'VND' }));
  R(app, '/health', async () => { await query('SELECT 1'); return { ok: true, details: 'CSDL hoạt động' }; });

  R(app, '/summary', async () => {
    const r = (await query(
      `SELECT (SELECT count(*)::int FROM users) AS users,
              (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new7,
              (SELECT count(*)::int FROM users WHERE last_seen_at > now() - interval '7 days') AS active7,
              (SELECT count(*)::int FROM families) AS families,
              (SELECT count(*)::int FROM child_profiles WHERE linked_user_id IS NOT NULL) AS linked,
              (SELECT count(*)::int FROM invitations WHERE status='pending' AND expires_at > now()) AS pending,
              (SELECT count(*)::int FROM otps WHERE created_at > now() - interval '24 hours') AS otp24,
              (SELECT count(*)::int FROM users WHERE password_weak) AS weak,
              (SELECT count(*)::int FROM invitations WHERE status='awaiting' AND expires_at > now()) AS awaiting`))[0];
    const alerts = [];
    const lvl = usageLevel(r.otp24, config.otpDailyGlobal);
    if (lvl >= 80) alerts.push({ level: 'bad', text: `Đã dùng ${r.otp24}/${config.otpDailyGlobal} mã OTP trong 24 giờ (từ 80% trần)` });
    else if (lvl >= 50) alerts.push({ level: 'warn', text: `Đã dùng ${r.otp24}/${config.otpDailyGlobal} mã OTP trong 24 giờ (từ 50% trần)` });
    if (r.awaiting) alerts.push({ level: 'info', text: `${r.awaiting} lời mời đang chờ chủ gia đình duyệt` });
    if (r.weak) alerts.push({ level: 'info', text: `${r.weak} tài khoản cũ còn mật khẩu ngắn (chưa đổi)` });
    return {
      kpis: [
        { id: 'users', label: 'Tài khoản 9app', value: r.users, format: 'int', tone: 'info' },
        { id: 'new_7d', label: 'Đăng ký mới 7 ngày', value: r.new7, format: 'int' },
        { id: 'active_7d', label: 'Hoạt động 7 ngày', value: r.active7, format: 'int', tone: 'ok' },
        { id: 'families', label: 'Số gia đình', value: r.families, format: 'int' },
        { id: 'linked', label: 'Hồ sơ con đã nối tài khoản', value: r.linked, format: 'int' },
        { id: 'pending', label: 'Lời mời đang chờ', value: r.pending, format: 'int' },
        { id: 'otp_24h', label: 'OTP đã gửi 24 giờ', value: r.otp24, format: 'int', hint: `trần ${config.otpDailyGlobal}/ngày` },
      ],
      alerts,
    };
  });

  R(app, '/users', async (ctx) => {
    const limit = limitOf(ctx.query);
    const rows = await query(
      `SELECT u.seq, u.display_name, u.phone, u.source, u.created_at, u.last_seen_at,
              (SELECT count(*)::int FROM memberships m WHERE m.user_id = u.id AND m.left_at IS NULL) AS fams
         FROM users u WHERE u.seq > $1 ORDER BY u.seq LIMIT ${limit + 1}`, [after(ctx.query)]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((u) => ({ id: String(u.seq), name: u.display_name, status: 'active', createdAt: iso(u.created_at), lastSeenAt: iso(u.last_seen_at), extra: { so_cuoi: u.phone.slice(-4), nguon: u.source, so_gia_dinh: u.fams } })),
      next: items.length ? String(items[items.length - 1].seq) : null, hasMore: rows.length > limit,
    };
  });

  R(app, '/users/:id', async (ctx) => {
    if (!/^\d{1,18}$/.test(ctx.params.id)) throw new ApiError(404, 'not_found', 'Không có người dùng');
    const u = (await query(
      `SELECT u.*, (SELECT count(*)::int FROM memberships m WHERE m.user_id = u.id AND m.left_at IS NULL) AS fams,
              (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id) AS devices
         FROM users u WHERE u.seq = $1`, [ctx.params.id]))[0];
    if (!u) throw new ApiError(404, 'not_found', 'Không có người dùng');
    return {
      title: u.display_name,
      fields: [
        { label: 'Tên hiển thị', value: u.display_name }, { label: '4 số cuối điện thoại', value: u.phone.slice(-4) }, { label: 'Nguồn', value: u.source },
        { label: 'Tạo lúc', value: iso(u.created_at), format: 'datetime' }, { label: 'Hoạt động gần nhất', value: iso(u.last_seen_at), format: 'datetime' },
        { label: 'Số gia đình', value: u.fams, format: 'int' }, { label: 'Số thiết bị đang đăng nhập', value: u.devices, format: 'int' },
        { label: 'Mật khẩu cũ còn ngắn', value: u.password_weak ? 'Có' : 'Không' },
      ],
    };
  });
}
