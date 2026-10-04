// API quản trị chuẩn cho "9app Console" (giao thức v1, xem 9admin/docs/ADMIN-API.md).
// Xác thực HMAC-SHA256; chỉ bật khi đặt CONSOLE_API_KEY_ID và CONSOLE_API_SECRET.
// 9hire không giữ tiền nên không khai "money". "users" là nhà tuyển dụng (tên hiển thị ẩn danh); KHÔNG trả số điện thoại hay hồ sơ ứng viên.
// "panels": hàng đợi "Tin cần xem xét" với hành động ẩn / bỏ ẩn / xóa.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { ApiError } from './errors.js';
import { labelOf, KINDS } from './meta.js';
import { stateOf, blockJob, unblockJob } from './jobs.js';

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
  // hành động ghi: chữ ký dùng một lần (chống phát lại trong cửa sổ lệch giờ)
  if (ctx.req.method !== 'GET') {
    const k = ts + ':' + got.toString();
    const now = Date.now();
    for (const [key, at] of seen) if (now - at > (MAX_SKEW_S + 30) * 1000) seen.delete(key);
    if (seen.has(k)) throw new ApiError(401, 'unauthorized', 'Yêu cầu đã dùng rồi');
    seen.set(k, now);
  }
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const limitOf = (q, def = 500) => Math.min(1000, Math.max(1, Number.parseInt(q.limit, 10) || def));
const after = (q) => (/^\d{1,18}$/.test(q.after || '') ? q.after : '0');
const R = (app, path, handler) => app.route('GET', '/admin-api/v1' + path, async (ctx) => { verify(ctx); return handler(ctx); }, { limit: 600, limitKey: 'console' });

const PAGE = 50;
const REVIEW_WHERE = `(j.status = 'an' OR EXISTS (SELECT 1 FROM reports r WHERE r.job_id = j.id) OR (j.risk > 0 AND j.status = 'dang' AND j.expires_at > now()))`;

export function consoleApiRoutes(app) {
  R(app, '/manifest', async () => ({ app: { id: 'hire', name: '9hire', version: VERSION }, capabilities: ['users', 'panels'], currency: 'VND' }));
  R(app, '/health', async () => { await query('SELECT 1'); return { ok: true, details: 'CSDL hoạt động' }; });

  R(app, '/summary', async () => {
    const r = (await query(
      `SELECT (SELECT count(*)::int FROM employers) AS employers,
              (SELECT count(*)::int FROM jobs WHERE status = 'dang' AND expires_at > now()) AS open_jobs,
              (SELECT count(*)::int FROM jobs WHERE created_at > now() - interval '7 days') AS jobs7,
              (SELECT count(*)::int FROM applications WHERE created_at > now() - interval '7 days') AS apps7,
              (SELECT count(*)::int FROM jobs WHERE status = 'an') AS hidden,
              (SELECT count(DISTINCT job_id)::int FROM reports r JOIN jobs j ON j.id = r.job_id WHERE j.status = 'dang') AS reported`))[0];
    const alerts = [];
    if (r.hidden) alerts.push({ level: 'warn', text: `${r.hidden} tin đang bị ẩn do báo cáo, cần xem xét`, panel: 'review' });
    if (r.reported) alerts.push({ level: 'info', text: `${r.reported} tin đang mở có báo cáo chưa đủ ngưỡng ẩn`, panel: 'review' });
    return {
      kpis: [
        { id: 'open_jobs', label: 'Tin đang mở', value: r.open_jobs, format: 'int', tone: 'ok' },
        { id: 'jobs_7d', label: 'Tin mới 7 ngày qua', value: r.jobs7, format: 'int' },
        { id: 'apps_7d', label: 'Lượt quan tâm 7 ngày qua', value: r.apps7, format: 'int' },
        { id: 'employers', label: 'Nhà tuyển dụng (ẩn danh)', value: r.employers, format: 'int', tone: 'info' },
        { id: 'hidden', label: 'Tin bị ẩn', value: r.hidden, format: 'int', tone: r.hidden ? 'warn' : undefined },
      ],
      alerts,
    };
  });

  R(app, '/users', async (ctx) => {
    const limit = limitOf(ctx.query);
    const rows = await query(
      `SELECT e.seq, e.name, e.created_at, e.last_seen_at,
              (SELECT count(*)::int FROM jobs j WHERE j.employer_id = e.id) AS jobs,
              (SELECT count(*)::int FROM jobs j WHERE j.employer_id = e.id AND j.status = 'an') AS hidden
         FROM employers e WHERE e.seq > $1 ORDER BY e.seq LIMIT ${limit + 1}`, [after(ctx.query)]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((u) => ({ id: String(u.seq), name: u.name, status: u.hidden ? 'warn' : 'active', createdAt: iso(u.created_at), lastSeenAt: iso(u.last_seen_at), extra: { so_tin: u.jobs, tin_bi_an: u.hidden } })),
      next: items.length ? String(items[items.length - 1].seq) : null, hasMore: rows.length > limit,
    };
  });

  R(app, '/users/:id', async (ctx) => {
    if (!/^\d{1,18}$/.test(ctx.params.id)) throw new ApiError(404, 'not_found', 'Không có người dùng');
    const u = (await query(
      `SELECT e.*, (SELECT count(*)::int FROM jobs j WHERE j.employer_id = e.id) AS jobs,
              (SELECT count(*)::int FROM jobs j WHERE j.employer_id = e.id AND j.status = 'an') AS hidden,
              (SELECT count(*)::int FROM jobs j WHERE j.employer_id = e.id AND j.status = 'dang' AND j.expires_at > now()) AS open
         FROM employers e WHERE e.seq = $1`, [ctx.params.id]))[0];
    if (!u) throw new ApiError(404, 'not_found', 'Không có người dùng');
    return {
      title: u.name,
      fields: [
        { label: 'Tên hiển thị', value: u.name }, { label: 'Tạo lúc', value: iso(u.created_at), format: 'datetime' }, { label: 'Hoạt động gần nhất', value: iso(u.last_seen_at), format: 'datetime' },
        { label: 'Số tin đã đăng', value: u.jobs, format: 'int' }, { label: 'Tin đang mở', value: u.open, format: 'int' }, { label: 'Tin bị ẩn', value: u.hidden, format: 'int' },
      ],
    };
  });

  // ---------- panel: tin cần xem xét ----------
  R(app, '/panels', async () => ({
    items: [{
      id: 'review', title: 'Tin cần xem xét', description: 'Tin bị ẩn do báo cáo, tin có báo cáo, tin gắn nhãn cần cẩn trọng.', searchable: true,
      columns: [
        { key: 'title', label: 'Vị trí' }, { key: 'company', label: 'Quán' }, { key: 'kind', label: 'Loại' }, { key: 'state', label: 'Trạng thái', format: 'status' },
        { key: 'reports', label: 'Báo cáo', format: 'int' }, { key: 'appeal', label: 'Khiếu nại' }, { key: 'risk', label: 'Nhãn cẩn trọng' }, { key: 'created', label: 'Đăng lúc', format: 'datetime' },
      ],
      rowActions: [
        { id: 'hide', label: 'Ẩn tin', tone: 'danger', confirm: 'Ẩn tin này khỏi người tìm việc?', when: { key: 'state', in: ['dang'] }, inputs: [] },
        { id: 'unhide', label: 'Bỏ ẩn', tone: 'primary', confirm: 'Cho hiển thị lại tin này và xóa các báo cáo cũ?', when: { key: 'state', in: ['an'] }, inputs: [] },
        { id: 'delete', label: 'Xóa tin', tone: 'danger', confirm: 'Xóa hẳn tin và hộp thư ứng viên của tin này? Không hoàn tác được.', inputs: [] },
      ],
    }],
  }));

  R(app, '/panels/:id', async (ctx) => {
    if (ctx.params.id !== 'review') throw new ApiError(404, 'not_found', 'Không có bảng này');
    const page = Math.max(1, Number.parseInt(ctx.query.page, 10) || 1);
    const qtext = String(ctx.query.q || '').slice(0, 60);
    const params = [];
    let where = REVIEW_WHERE;
    if (qtext) { params.push('%' + qtext.toLowerCase() + '%'); where += ` AND (lower(j.title) LIKE $1 OR lower(j.company) LIKE $1)`; }
    const total = (await query(`SELECT count(*)::int AS n FROM jobs j WHERE ${where}`, params))[0].n;
    const rows = await query(
      `SELECT j.*, (SELECT count(*)::int FROM reports r WHERE r.job_id = j.id) AS reports FROM jobs j WHERE ${where}
        ORDER BY (j.status = 'an') DESC, reports DESC, j.seq DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, params);
    return {
      rows: rows.map((j) => ({
        _id: j.id, title: j.title, company: j.company, kind: labelOf(KINDS, j.kind), state: j.status === 'an' ? 'an' : stateOf(j), reports: j.reports,
        appeal: (j.appeal_note || '').slice(0, 300), risk: (j.risk_notes || []).join('; ').slice(0, 300), created: iso(j.created_at),
      })),
      total, page, pageSize: PAGE,
    };
  });

  app.route('POST', '/admin-api/v1/actions/:id', async (ctx) => {
    verify(ctx);
    let b;
    try { b = JSON.parse(ctx.raw || '{}'); } catch { throw new ApiError(400, 'bad_json', 'Dữ liệu không hợp lệ'); }
    const id = ctx.params.id;
    const rowId = String(b.rowId || '');
    if (b.panel !== 'review' || !/^[0-9a-f-]{36}$/i.test(rowId)) return { ok: false, message: 'Yêu cầu không hợp lệ' };
    if (id === 'hide') {
      const r = await query("UPDATE jobs SET status = 'an', hidden_reason = 'quan_tri', updated_at = now() WHERE id = $1 AND status = 'dang' RETURNING *", [rowId]);
      if (r.length) await blockJob(query, r[0]);
      return r.length ? { ok: true, message: 'Đã ẩn tin' } : { ok: false, message: 'Tin không ở trạng thái đang mở' };
    }
    if (id === 'unhide') {
      const r = await query(
        `UPDATE jobs SET status = 'dang', hidden_reason = NULL, appeal_note = NULL, appealed_at = NULL, updated_at = now() WHERE id = $1 AND status = 'an' RETURNING *`, [rowId]);
      if (!r.length) return { ok: false, message: 'Tin không đang bị ẩn' };
      await unblockJob(query, r[0]);
      await query('DELETE FROM reports WHERE job_id = $1', [rowId]);
      return { ok: true, message: 'Đã hiển thị lại tin và xóa báo cáo cũ' };
    }
    if (id === 'delete') {
      const r = await query('DELETE FROM jobs WHERE id = $1 RETURNING *', [rowId]);
      if (r.length) await blockJob(query, r[0]);
      return r.length ? { ok: true, message: 'Đã xóa tin' } : { ok: false, message: 'Không tìm thấy tin' };
    }
    return { ok: false, message: 'Hành động không hỗ trợ' };
  }, { raw: true, noCsrf: true, limit: 120, limitKey: 'console-act' });
}
