// Truy vấn cho các màn hình gộp: dòng tiền, người dùng, tổng quan.
import { query } from './db.js';
import { statusOf } from './sync.js';

const TZ = 'Asia/Ho_Chi_Minh';

// Bộ lọc dòng tiền -> mệnh đề WHERE tham số hóa.
function cashWhere(f) {
  const w = []; const p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (f.from) add('e.at >= ?', f.from);
  if (f.to) add('e.at < ?', f.to);
  if (f.app) add('e.app_id = ?', f.app);
  if (f.kind) add('e.kind = ?', f.kind);
  if (f.q) { p.push('%' + String(f.q).replace(/[%_\\]/g, '\\$&') + '%'); w.push(`(e.description ILIKE $${p.length} OR e.ref ILIKE $${p.length} OR e.phone ILIKE $${p.length} OR e.category ILIKE $${p.length})`); }
  if (f.apps) add('e.app_id = ANY(?::text[])', f.apps);
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

export function parseFilters(q, allowedApps = null) {
  const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);
  const f = {
    from: date(q.from) ? `${q.from}T00:00:00+07:00` : null,
    to: date(q.to) ? new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 86400_000).toISOString() : null,
    app: /^[a-z0-9_-]{2,30}$/.test(q.app || '') ? q.app : null,
    kind: ['cash_in', 'cash_out', 'revenue', 'expense'].includes(q.kind) ? q.kind : null,
    q: String(q.q || '').slice(0, 80),
    page: Math.max(1, Number.parseInt(q.page, 10) || 1),
  };
  if (allowedApps) f.apps = allowedApps;
  return f;
}

export async function moneyReport(f, { pageSize = 50 } = {}) {
  const { where, params } = cashWhere(f);
  const sums = await query(`SELECT e.kind AS kind, COALESCE(SUM(e.amount),0)::bigint AS s, count(*)::int n FROM cash_entries e ${where} GROUP BY e.kind`, params);
  const by = Object.fromEntries(sums.map((r) => [r.kind, r.s]));
  const totals = {
    cashIn: by.cash_in || 0, cashOut: by.cash_out || 0, revenue: by.revenue || 0, expense: by.expense || 0,
    netCash: (by.cash_in || 0) - (by.cash_out || 0), grossProfit: (by.revenue || 0) - (by.expense || 0),
    count: sums.reduce((a, r) => a + r.n, 0),
  };
  const perApp = await query(
    `SELECT e.app_id, a.name, COALESCE(SUM(amount) FILTER (WHERE kind='cash_in'),0)::bigint cash_in, COALESCE(SUM(amount) FILTER (WHERE kind='cash_out'),0)::bigint cash_out,
            COALESCE(SUM(amount) FILTER (WHERE kind='revenue'),0)::bigint revenue, COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0)::bigint expense
       FROM cash_entries e JOIN apps a ON a.id=e.app_id ${where} GROUP BY e.app_id, a.name ORDER BY a.name`, params);
  const daily = await query(
    `SELECT to_char((e.at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(e.amount) FILTER (WHERE e.kind='cash_in'),0)::bigint cash_in, COALESCE(SUM(e.amount) FILTER (WHERE e.kind='cash_out'),0)::bigint cash_out,
            COALESCE(SUM(e.amount) FILTER (WHERE e.kind='revenue'),0)::bigint revenue, COALESCE(SUM(e.amount) FILTER (WHERE e.kind='expense'),0)::bigint expense
       FROM cash_entries e ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 90`, params);
  const items = await query(
    `SELECT e.app_id, a.name AS app_name, e.entry_id, e.at, e.kind, e.amount, e.category, e.description, e.ref, e.phone
       FROM cash_entries e JOIN apps a ON a.id=e.app_id ${where}
      ORDER BY e.at DESC, e.entry_id DESC LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}`, params);
  const bal = await query(
    `SELECT b.app_id, a.name AS app_name, b.item_id, b.label, b.amount, b.kind, b.at FROM balances b JOIN apps a ON a.id=b.app_id
      ${f.apps ? 'WHERE b.app_id = ANY($1::text[])' : ''} ORDER BY a.sort, a.name, b.item_id`, f.apps ? [f.apps] : []);
  const sumKind = (k) => bal.filter((b) => b.kind === k).reduce((a, b) => a + b.amount, 0);
  return {
    totals, perApp, daily: daily.reverse(), items, page: f.page, pageSize,
    balances: { items: bal, customerFunds: sumKind('customer_funds'), cash: sumKind('cash'), receivable: sumKind('receivable') },
  };
}

const CSV_MAX = 50_000;
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // chống chèn công thức khi mở bằng Excel
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export async function moneyCsv(f) {
  const { where, params } = cashWhere(f);
  const rows = await query(
    `SELECT to_char(e.at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS') AS at, e.app_id, e.kind, e.amount, e.category, e.description, e.ref, e.phone
       FROM cash_entries e ${where} ORDER BY e.at DESC, e.entry_id DESC LIMIT ${CSV_MAX}`, params);
  const head = ['Thời gian', 'App', 'Loại', 'Số tiền (đ)', 'Danh mục', 'Mô tả', 'Mã tham chiếu', 'Số điện thoại'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) lines.push([r.at, r.app_id, r.kind, r.amount, r.category, r.description, r.ref, r.phone].map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ---------- người dùng gộp theo số điện thoại ----------
const UKEY = "COALESCE(NULLIF(phone,''), app_id || ':' || app_user_id)";
export async function usersReport({ q = '', app = null, apps = null, page = 1, pageSize = 50 }) {
  const w = []; const p = [];
  if (q) { p.push('%' + String(q).replace(/[%_\\]/g, '\\$&') + '%'); w.push(`(phone ILIKE $${p.length} OR name ILIKE $${p.length})`); }
  if (app) { p.push(app); w.push(`app_id = $${p.length}`); }
  if (apps) { p.push(apps); w.push(`app_id = ANY($${p.length}::text[])`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = (await query(`SELECT count(DISTINCT ${UKEY})::int n FROM users_index ${where}`, p))[0].n;
  const rows = await query(
    `SELECT ${UKEY} AS ukey, max(phone) AS phone, (array_agg(name ORDER BY (name <> '') DESC, created_at))[1] AS name,
            min(created_at) AS first_seen, max(COALESCE(last_seen_at, created_at)) AS last_seen,
            json_agg(json_build_object('app', app_id, 'id', app_user_id, 'name', name, 'status', status, 'createdAt', created_at) ORDER BY app_id) AS accounts
       FROM users_index ${where} GROUP BY ${UKEY} ORDER BY min(created_at) DESC NULLS LAST LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, p);
  const byApp = await query(`SELECT app_id, count(*)::int n FROM users_index ${apps ? 'WHERE app_id = ANY($1::text[])' : ''} GROUP BY app_id`, apps ? [apps] : []);
  return { total, page, pageSize, rows, byApp };
}

export async function userAccounts(ukey) {
  return query(`SELECT * FROM users_index WHERE ${UKEY} = $1 ORDER BY app_id`, [ukey]);
}

export async function userCashByApp(phone) {
  if (!phone) return [];
  return query(
    `SELECT app_id,
            COALESCE(SUM(amount) FILTER (WHERE kind='cash_in'),0)::bigint cash_in, COALESCE(SUM(amount) FILTER (WHERE kind='cash_out'),0)::bigint cash_out,
            COALESCE(SUM(amount) FILTER (WHERE kind='revenue'),0)::bigint revenue, count(*)::int n
       FROM cash_entries WHERE phone=$1 GROUP BY app_id ORDER BY app_id`, [phone]);
}

// ---------- tổng quan ----------
export async function overview(apps) {
  const ids = apps.map((a) => a.id);
  const st = await query('SELECT * FROM app_status WHERE app_id = ANY($1::text[])', [ids]);
  const sync = await query('SELECT * FROM sync_state WHERE app_id = ANY($1::text[])', [ids]);
  const cards = apps.map((a) => {
    const s = st.find((x) => x.app_id === a.id) || {};
    const mine = sync.filter((x) => x.app_id === a.id);
    return {
      id: a.id, name: a.name, status: statusOf(s), detail: s.detail || '', checkedAt: s.checked_at || null,
      summary: s.summary || { kpis: [], alerts: [] }, capabilities: (a.manifest && a.manifest.capabilities) || [],
      errors: mine.filter((x) => x.last_error).map((x) => `${x.stream}: ${x.last_error}`),
    };
  });
  const alerts = [];
  for (const c of cards) {
    if (c.status === 'down') alerts.push({ app: c.id, appName: c.name, level: 'bad', text: `Không kết nối được: ${c.detail || 'không rõ lý do'}` });
    else if (c.status === 'stale') alerts.push({ app: c.id, appName: c.name, level: 'warn', text: 'Dữ liệu đã cũ, đồng bộ chưa chạy gần đây' });
    for (const a of (c.summary.alerts || [])) alerts.push({ app: c.id, appName: c.name, level: a.level, text: a.text, panel: a.panel });
    for (const e of c.errors) alerts.push({ app: c.id, appName: c.name, level: 'warn', text: 'Đồng bộ lỗi — ' + e });
  }
  const order = { bad: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  const money30 = (await query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE kind='cash_in'),0)::bigint cash_in, COALESCE(SUM(amount) FILTER (WHERE kind='cash_out'),0)::bigint cash_out,
            COALESCE(SUM(amount) FILTER (WHERE kind='revenue'),0)::bigint revenue, COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0)::bigint expense
       FROM cash_entries WHERE at >= now() - interval '30 days' AND app_id = ANY($1::text[])`, [ids]))[0];
  const daily = await query(
    `SELECT to_char((at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day, COALESCE(SUM(amount) FILTER (WHERE kind='revenue'),0)::bigint revenue,
            COALESCE(SUM(amount) FILTER (WHERE kind='cash_in'),0)::bigint cash_in
       FROM cash_entries WHERE at >= now() - interval '30 days' AND app_id = ANY($1::text[]) GROUP BY 1 ORDER BY 1`, [ids]);
  const funds = (await query("SELECT COALESCE(SUM(amount),0)::bigint s FROM balances WHERE kind='customer_funds' AND app_id = ANY($1::text[])", [ids]))[0].s;
  const users = (await query(
    `SELECT count(DISTINCT ${UKEY})::int total, count(DISTINCT ${UKEY}) FILTER (WHERE created_at >= now() - interval '7 days')::int new7
       FROM users_index WHERE app_id = ANY($1::text[])`, [ids]))[0];
  return { apps: cards, alerts, money30, daily, customerFunds: funds, users };
}
