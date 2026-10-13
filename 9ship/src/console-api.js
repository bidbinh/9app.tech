// API quản trị chuẩn cho "9app Console" (giao thức v1, xem 9admin/docs/ADMIN-API.md).
// Xác thực bằng HMAC-SHA256; chỉ bật khi đặt CONSOLE_API_KEY_ID và CONSOLE_API_SECRET.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import * as ledger from './ledger.js';
import * as admin from './admin.js';
import * as withdrawals from './withdrawals.js';
import * as claims from './claims.js';
import * as topup from './topup.js';
import * as worker from './worker.js';
import { health as carrierHealth } from './rating.js';

const VERSION = '1.0';
const MAX_SKEW_S = 120;
const seen = new Map(); // chống phát lại cùng một chữ ký trong cửa sổ thời gian

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
  if (seen.has(k) && ctx.req.method !== 'GET') throw new ApiError(401, 'unauthorized', 'Yêu cầu đã dùng');
  seen.set(k, now);
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const limitOf = (q, def = 500) => Math.min(1000, Math.max(1, Number.parseInt(q.limit, 10) || def));
const after = (q) => (/^\d{1,18}$/.test(q.after || '') ? q.after : '0');

const R = (app, path, handler, extra = {}) => app.route('GET', '/admin-api/v1' + path, async (ctx) => { verify(ctx); return handler(ctx); }, { limit: 600, limitKey: 'console', ...extra });

// ---------- bảng quản trị riêng ----------
const PAGE = 50;
const stripKnown = (s) => String(s || '').replace(/[%_\\]/g, '\\$&');

const PANELS = [
  {
    id: 'attention', title: 'Đơn cần kiểm tra tay', description: 'Đơn mà hãng chưa phản hồi rõ hoặc có sai lệch cước; tiền khách vẫn đang được giữ an toàn.',
    searchable: true,
    columns: [{ key: 'ref', label: 'Mã tham chiếu' }, { key: 'carrier', label: 'Hãng' }, { key: 'issue', label: 'Vấn đề' }, { key: 'payment', label: 'Thanh toán', format: 'status' }, { key: 'price', label: 'Cước', format: 'money' }, { key: 'created', label: 'Tạo lúc', format: 'datetime' }],
    rowActions: [
      { id: 'resolve_created', label: 'Hãng ĐÃ tạo', tone: 'primary', confirm: 'Xác nhận hãng đã có đơn này? Hệ thống sẽ chốt tiền theo mã vận đơn bạn nhập.', inputs: [{ name: 'carrierCode', label: 'Mã vận đơn của hãng', type: 'text' }], when: { key: 'payment', in: ['held'] } },
      { id: 'resolve_not_created', label: 'Hãng CHƯA tạo', tone: 'danger', confirm: 'Xác nhận hãng chưa có đơn này? Tiền sẽ hoàn về ví khách.', inputs: [], when: { key: 'payment', in: ['held'] } },
    ],
  },
  {
    id: 'bank', title: 'Tiền về chưa ghép', description: 'Giao dịch ngân hàng chưa gắn được vào yêu cầu nạp (sai nội dung, lệch số tiền, hết hạn).', searchable: true,
    columns: [{ key: 'id', label: 'Mã giao dịch' }, { key: 'amount', label: 'Số tiền', format: 'money' }, { key: 'content', label: 'Nội dung' }, { key: 'note', label: 'Ghi chú' }, { key: 'at', label: 'Nhận lúc', format: 'datetime' }],
    rowActions: [{ id: 'match_user', label: 'Ghép cho người dùng', tone: 'primary', confirm: 'Cộng đúng số tiền thực nhận vào ví của người dùng được chọn.', inputs: [{ name: 'userId', label: 'ID người dùng 9Ship', type: 'number' }] }],
  },
  {
    id: 'withdrawals', title: 'Yêu cầu rút tiền', description: 'Quy trình: duyệt → bắt đầu chi → xác nhận đã chi. Không rõ kết quả thì để "đối soát", đừng hoàn tiền khi chưa chắc.', searchable: false,
    columns: [{ key: 'user', label: 'Người dùng' }, { key: 'amount', label: 'Số tiền', format: 'money' }, { key: 'account', label: 'Tài khoản nhận' }, { key: 'status', label: 'Trạng thái', format: 'status' }, { key: 'wait', label: 'Chờ đến', format: 'datetime' }, { key: 'ref', label: 'Mã tham chiếu chi' }],
    rowActions: [
      { id: 'approve', label: 'Duyệt', tone: 'primary', when: { key: 'status', in: ['requested'] }, inputs: [] },
      { id: 'start', label: 'Bắt đầu chi', tone: 'primary', when: { key: 'status', in: ['approved'] }, inputs: [] },
      { id: 'paid', label: 'Đã chi', tone: 'primary', when: { key: 'status', in: ['paying', 'unknown'] }, confirm: 'Xác nhận ĐÃ chuyển tiền thành công?', inputs: [{ name: 'bankRef', label: 'Mã giao dịch ngân hàng', type: 'text' }] },
      { id: 'unknown', label: 'Không rõ', tone: 'ghost', when: { key: 'status', in: ['paying'] }, inputs: [] },
      { id: 'fail', label: 'Chưa chi → hoàn ví', tone: 'danger', when: { key: 'status', in: ['paying', 'unknown'] }, confirm: 'Chỉ chọn khi đã đối soát chắc chắn CHƯA chuyển tiền. Tiền sẽ hoàn về ví khách.', inputs: [] },
      { id: 'reject', label: 'Từ chối', tone: 'danger', when: { key: 'status', in: ['requested', 'approved'] }, confirm: 'Từ chối và hoàn tiền về ví khách?', inputs: [{ name: 'note', label: 'Lý do', type: 'text', required: false }] },
    ],
  },
  {
    id: 'claims', title: 'Khiếu nại', description: 'Hồ sơ mất/hư hàng. Bồi thường chỉ ghi khi đã thực nhận tiền từ hãng.', searchable: false,
    columns: [{ key: 'id', label: '#' }, { key: 'kind', label: 'Loại' }, { key: 'description', label: 'Mô tả' }, { key: 'deadline', label: 'Hạn nộp hồ sơ', format: 'date' }, { key: 'status', label: 'Trạng thái', format: 'status' }, { key: 'partner', label: 'Mã hồ sơ hãng' }],
    rowActions: [
      { id: 'claim_forward', label: 'Đã chuyển hãng', tone: 'primary', when: { key: 'status', in: ['received'] }, inputs: [{ name: 'partnerRef', label: 'Mã hồ sơ bên hãng', type: 'text', required: false }] },
      { id: 'claim_resolve', label: 'Giải quyết', tone: 'primary', inputs: [{ name: 'compensation', label: 'Tiền bồi thường đã NHẬN từ hãng (0 nếu không có)', type: 'number', required: false }, { name: 'note', label: 'Ghi chú', type: 'text', required: false }] },
      { id: 'claim_reject', label: 'Từ chối', tone: 'danger', inputs: [{ name: 'note', label: 'Lý do', type: 'text', required: false }] },
    ],
  },
  {
    id: 'orders', title: 'Đơn hàng gần đây', description: '200 đơn mới nhất (chỉ xem).', searchable: true,
    columns: [{ key: 'code', label: 'Mã vận đơn' }, { key: 'carrier', label: 'Hãng' }, { key: 'receiver', label: 'Người nhận' }, { key: 'status', label: 'Trạng thái', format: 'status' }, { key: 'price', label: 'Cước', format: 'money' }, { key: 'created', label: 'Tạo lúc', format: 'datetime' }],
    rowActions: [],
  },
  {
    id: 'pricing', title: 'Quy tắc giá', description: 'Chỉ xem. Chỉnh sửa trong trang quản trị riêng của 9Ship.', searchable: false,
    columns: [{ key: 'carrier', label: 'Hãng' }, { key: 'route', label: 'Tuyến' }, { key: 'margin', label: 'Biên %' }, { key: 'min', label: 'Biên tối thiểu', format: 'money' }, { key: 'cap', label: 'Cần giá niêm yết' }, { key: 'active', label: 'Bật' }],
    rowActions: [],
  },
];

async function panelRows(id, q) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  const off = (page - 1) * PAGE;
  const like = q.q ? '%' + stripKnown(q.q) + '%' : null;
  const out = (rows, total) => ({ rows, total, page, pageSize: PAGE });
  if (id === 'attention') {
    const w = like ? 'AND (carrier_ref ILIKE $1 OR carrier ILIKE $1 OR tracking_code ILIKE $1)' : '';
    const p = like ? [like] : [];
    const total = (await query(`SELECT count(*)::int n FROM shipments WHERE needs_attention IS NOT NULL ${w}`, p))[0].n;
    const rows = await query(`SELECT id, carrier_ref, carrier, needs_attention, payment_status, sell_price, created_at FROM shipments WHERE needs_attention IS NOT NULL ${w} ORDER BY updated_at DESC LIMIT ${PAGE} OFFSET ${off}`, p);
    const issues = { create_unknown: 'Không rõ hãng đã tạo đơn chưa', fee_drift: 'Cước hãng lệch nhiều', fee_unpaid: 'Cước tăng, không thu đủ của khách', cancel_unknown: 'Hủy chưa rõ kết quả', adapter_missing: 'Hãng không còn được cấu hình', carrier_cancelled: 'Hãng tự hủy đơn', fee_invalid: 'Hãng báo cước không hợp lệ' };
    return out(rows.map((r) => ({ _id: r.id, ref: r.carrier_ref, carrier: r.carrier, issue: issues[r.needs_attention] || r.needs_attention, payment: r.payment_status, price: r.sell_price, created: iso(r.created_at) })), total);
  }
  if (id === 'bank') {
    const w = like ? "AND (bank_tx_id ILIKE $1 OR content ILIKE $1)" : '';
    const p = like ? [like] : [];
    const total = (await query(`SELECT count(*)::int n FROM bank_inbox WHERE status IN ('unmatched','needs_review') ${w}`, p))[0].n;
    const rows = await query(`SELECT * FROM bank_inbox WHERE status IN ('unmatched','needs_review') ${w} ORDER BY received_at DESC LIMIT ${PAGE} OFFSET ${off}`, p);
    return out(rows.map((r) => ({ _id: r.bank_tx_id, id: r.bank_tx_id, amount: r.amount, content: r.content, note: r.note, at: iso(r.received_at) })), total);
  }
  if (id === 'withdrawals') {
    const total = (await query("SELECT count(*)::int n FROM withdrawals WHERE status IN ('requested','approved','paying','unknown')"))[0].n;
    const rows = await query(
      `SELECT w.*, u.phone FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status IN ('requested','approved','paying','unknown')
        ORDER BY w.created_at LIMIT ${PAGE} OFFSET ${off}`);
    return out(rows.map((r) => ({ _id: r.id, user: r.phone, amount: r.amount, account: `${r.bank_account.bank} · ${r.bank_account.number} · ${r.bank_account.holder}`, status: r.status, wait: new Date(r.not_before) > new Date() ? iso(r.not_before) : null, ref: r.payout_ref })), total);
  }
  if (id === 'claims') {
    const total = (await query("SELECT count(*)::int n FROM claims WHERE status IN ('received','forwarded')"))[0].n;
    const rows = await query(`SELECT * FROM claims WHERE status IN ('received','forwarded') ORDER BY deadline LIMIT ${PAGE} OFFSET ${off}`);
    const kinds = { lost: 'Mất hàng', damaged: 'Hư hỏng', late: 'Giao chậm', other: 'Khác' };
    return out(rows.map((r) => ({ _id: String(r.id), id: r.id, kind: kinds[r.kind] || r.kind, description: r.description.slice(0, 300), deadline: iso(r.deadline), status: r.status, partner: r.partner_ref || '' })), total);
  }
  if (id === 'orders') {
    const w = like ? 'WHERE (tracking_code ILIKE $1 OR carrier ILIKE $1 OR receiver->>\'contact\' ILIKE $1 OR receiver->>\'phone\' ILIKE $1)' : '';
    const p = like ? [like] : [];
    const total = Math.min(200, (await query(`SELECT count(*)::int n FROM shipments ${w}`, p))[0].n);
    const rows = await query(`SELECT * FROM shipments ${w} ORDER BY created_at DESC LIMIT ${Math.max(0, Math.min(PAGE, 200 - off))} OFFSET ${off}`, p);
    return out(rows.map((r) => ({ _id: r.id, code: r.tracking_code || r.carrier_ref, carrier: r.carrier, receiver: `${r.receiver.contact} · ${r.receiver.provinceName}`, status: r.shipping_status, price: r.sell_price, created: iso(r.created_at) })), total);
  }
  if (id === 'pricing') {
    const rows = await query('SELECT * FROM pricing_rules ORDER BY carrier, route');
    return out(rows.map((r) => ({ _id: String(r.id), carrier: r.carrier, route: r.route, margin: String(r.margin_pct), min: Number(r.margin_min), cap: r.require_cap ? 'có' : 'không', active: r.active ? 'có' : 'không' })), rows.length);
  }
  throw new ApiError(404, 'not_found', 'Không có bảng này');
}

// ---------- hành động ----------
async function runAction(id, body) {
  const rowId = String(body.rowId || '');
  const inputs = body.inputs || {};
  const audit = (action, detail) => admin.audit('console', action, rowId, null, detail || null, '');
  const ok = (message) => ({ ok: true, message });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const needsUuid = ['resolve_created', 'resolve_not_created', 'approve', 'start', 'paid', 'unknown', 'fail', 'reject'];
  if (needsUuid.includes(id) && !UUID.test(rowId)) throw new ApiError(400, 'invalid_request', 'Mã dòng không hợp lệ');
  if (id.startsWith('claim_') && !/^\d{1,12}$/.test(rowId)) throw new ApiError(400, 'invalid_request', 'Mã dòng không hợp lệ');
  if (id === 'match_user' && !(Number.isSafeInteger(Number(inputs.userId)) && Number(inputs.userId) > 0)) throw new ApiError(400, 'invalid_request', 'Cần ID người dùng hợp lệ');
  switch (id) {
    case 'resolve_created': {
      if (!inputs.carrierCode) throw new ApiError(400, 'invalid_request', 'Cần mã vận đơn của hãng');
      if (!(await worker.resolveUnknown(rowId, 'created', { carrierCode: String(inputs.carrierCode).trim() }))) throw new ApiError(409, 'not_pending', 'Đơn không còn ở trạng thái chờ xác nhận');
      await audit('console.shipment.created', { carrierCode: inputs.carrierCode });
      return ok('Đã chốt đơn theo mã vận đơn của hãng');
    }
    case 'resolve_not_created': {
      if (!(await worker.resolveUnknown(rowId, 'not_created'))) throw new ApiError(409, 'not_pending', 'Đơn không còn ở trạng thái chờ xác nhận');
      await audit('console.shipment.not_created');
      return ok('Đã hoàn tiền về ví khách');
    }
    case 'match_user': {
      const r = await topup.matchManually(rowId, Number(inputs.userId), 'console');
      await audit('console.bank.match', { userId: inputs.userId });
      return ok(`Đã cộng ${r.amount.toLocaleString('vi-VN')} đ vào ví người dùng`);
    }
    case 'approve': case 'start': case 'paid': case 'unknown': case 'fail': case 'reject': {
      const r = await withdrawals.transition(rowId, id, { actor: 'console', bankRef: inputs.bankRef || '', note: inputs.note || '' });
      await audit('console.withdrawal.' + id, { to: r.status, bankRef: inputs.bankRef || '' });
      return ok(`Yêu cầu rút tiền chuyển sang "${r.status}"`);
    }
    case 'claim_forward': case 'claim_resolve': case 'claim_reject': {
      const status = { claim_forward: 'forwarded', claim_resolve: 'resolved', claim_reject: 'rejected' }[id];
      const comp = id === 'claim_resolve' ? Number.parseInt(inputs.compensation || '0', 10) || 0 : 0;
      await claims.adminUpdate(Number(rowId), { status, partnerRef: inputs.partnerRef, compensation: comp, note: inputs.note || '' });
      await audit('console.' + id, { compensation: comp });
      return ok('Đã cập nhật khiếu nại');
    }
    default: throw new ApiError(404, 'unknown_action', 'Hành động không tồn tại');
  }
}

// ---------- đăng ký các đường dẫn ----------
export function consoleApiRoutes(app) {
  R(app, '/manifest', async () => ({ app: { id: 'ship', name: '9Ship', version: VERSION }, capabilities: ['users', 'money', 'panels'], currency: 'VND', adminUrl: `${config.basePath}/admin.html` }));
  R(app, '/health', async () => { await query('SELECT 1'); return { ok: true, details: `${carrierHealth().filter((c) => c.open).length} hãng đang ngắt` }; });

  R(app, '/summary', async () => {
    const o = await admin.overview();
    const b = o.balances;
    const customerFunds = b.userWallets + b.userHeld + b.userBuffer + b.pendingWithdrawals;
    const users = (await query('SELECT count(*)::int n FROM users'))[0].n;
    const kpis = [
      { id: 'orders_24h', label: 'Đơn 24 giờ qua', value: o.orders.today, format: 'int', tone: 'info' },
      { id: 'orders_total', label: 'Tổng số đơn', value: o.orders.total, format: 'int' },
      { id: 'users', label: 'Người dùng', value: users, format: 'int' },
      { id: 'customer_funds', label: 'Tiền khách giữ hộ', value: customerFunds, format: 'money', hint: 'ví + đang tạm giữ + đang rút', tone: 'warn' },
      { id: 'revenue', label: 'Doanh thu lũy kế', value: b.revenue, format: 'money', tone: 'ok' },
      { id: 'carrier_cost', label: 'Giá vốn hãng lũy kế', value: b.carrier_cost, format: 'money' },
      { id: 'deposit', label: 'Ký quỹ đơn vị tổng hợp', value: b.aggregator_deposit, format: 'money', hint: 'tài sản đã trả trước cho hãng' },
      { id: 'bank', label: 'Tiền ngân hàng (theo sổ)', value: b.bank, format: 'money' },
    ];
    const q = o.queues;
    const alerts = [];
    if (q.attention) alerts.push({ level: 'warn', text: `${q.attention} đơn cần kiểm tra tay`, panel: 'attention' });
    if (q.bankInbox) alerts.push({ level: 'warn', text: `${q.bankInbox} khoản tiền về chưa ghép được`, panel: 'bank' });
    if (q.withdrawals) alerts.push({ level: 'info', text: `${q.withdrawals} yêu cầu rút tiền đang chờ xử lý`, panel: 'withdrawals' });
    if (q.claims) alerts.push({ level: 'info', text: `${q.claims} khiếu nại đang xử lý`, panel: 'claims' });
    if (q.negativeWallets) alerts.push({ level: 'warn', text: `${q.negativeWallets} ví đang âm do hãng điều chỉnh cước` });
    for (const c of o.carriers.filter((x) => x.open)) alerts.push({ level: 'bad', text: `Hãng ${c.name} đang bị ngắt (${c.lastError || 'lỗi liên tiếp'})` });
    for (const a of o.alerts.filter((x) => x.reason === 'no_verified_cap').slice(0, 5)) alerts.push({ level: 'warn', text: `Hãng ${a.carrier} bị ẩn ${a.count} lần vì thiếu giá niêm yết đáng tin`, panel: 'pricing' });
    if (!o.carriers.length) alerts.push({ level: 'warn', text: 'Chưa có hãng vận chuyển nào được kết nối' });
    return { kpis, alerts };
  });

  // Người dùng: con trỏ là id tăng dần; tên đổi thì cập nhật qua lần đồng bộ đầy đủ hằng ngày.
  R(app, '/users', async (ctx) => {
    const limit = limitOf(ctx.query);
    const rows = await query(
      `SELECT u.id, u.phone, u.name, u.status, u.source, u.created_at, u.last_login_at,
              (SELECT count(*)::int FROM shipments s WHERE s.user_id = u.id) AS orders
         FROM users u WHERE u.id > $1 ORDER BY u.id LIMIT ${limit + 1}`, [after(ctx.query)]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((u) => ({ id: String(u.id), phone: u.phone, name: u.name || '', status: u.status, createdAt: iso(u.created_at), lastSeenAt: iso(u.last_login_at), extra: { nguon: u.source, don_hang: u.orders } })),
      next: items.length ? String(items[items.length - 1].id) : null, hasMore: rows.length > limit,
    };
  });

  R(app, '/users/:id', async (ctx) => {
    if (!/^\d{1,18}$/.test(ctx.params.id)) throw new ApiError(404, 'not_found', 'Không có người dùng');
    const u = (await query('SELECT * FROM users WHERE id=$1', [ctx.params.id]))[0];
    if (!u) throw new ApiError(404, 'not_found', 'Không có người dùng');
    const bal = await tx((c) => ledger.walletBalance(c, u.id));
    const st = (await query("SELECT count(*)::int n, COALESCE(SUM(sell_price) FILTER (WHERE payment_status IN ('captured','partially_refunded')),0)::bigint spent, max(created_at) last FROM shipments WHERE user_id=$1", [u.id]))[0];
    const addr = (await query('SELECT count(*)::int n FROM addresses WHERE user_id=$1', [u.id]))[0].n;
    const cl = (await query('SELECT count(*)::int n FROM claims WHERE user_id=$1', [u.id]))[0].n;
    return {
      title: u.name || u.phone,
      fields: [
        { label: 'Số điện thoại', value: u.phone, format: 'phone' }, { label: 'Họ tên', value: u.name || '—' }, { label: 'Nguồn tài khoản', value: u.source === '9sport' ? 'Từ 9Sport' : 'Tạo tại 9Ship' },
        { label: 'Ngày tạo', value: iso(u.created_at), format: 'datetime' }, { label: 'Đăng nhập gần nhất', value: iso(u.last_login_at), format: 'datetime' },
        { label: 'Số dư ví', value: bal, format: 'money' }, { label: 'Số đơn', value: st.n, format: 'int' }, { label: 'Đã chi cho cước', value: st.spent, format: 'money' },
        { label: 'Đơn gần nhất', value: iso(st.last), format: 'datetime' }, { label: 'Địa chỉ trong sổ', value: addr, format: 'int' }, { label: 'Khiếu nại', value: cl, format: 'int' },
        { label: 'Trạng thái', value: u.status, format: 'status' },
      ],
    };
  });

  // Dòng tiền từ sổ cái: tiền ngân hàng vào/ra, doanh thu, giá vốn. Tiền khách nạp là tiền vào ngân hàng chứ không phải doanh thu.
  R(app, '/cash', async (ctx) => {
    const limit = limitOf(ctx.query);
    const rows = await query(
      `SELECT e.id, e.amount, e.created_at, a.kind AS acct, t.kind AS tkind, t.idem_scope, t.idem_key, t.shipment_id,
              COALESCE(
                (SELECT u.phone FROM ledger_entries e2 JOIN accounts a2 ON a2.id = e2.account_id AND a2.kind = 'user_wallet' AND a2.owner_type = 'user'
                   JOIN users u ON u.id::text = a2.owner_id WHERE e2.tx_id = e.tx_id LIMIT 1),
                (SELECT u.phone FROM shipments s JOIN users u ON u.id = s.user_id WHERE s.id = t.shipment_id), '') AS phone
         FROM ledger_entries e
         JOIN accounts a ON a.id = e.account_id AND a.owner_type = 'system' AND a.kind IN ('bank','revenue','carrier_cost')
         JOIN ledger_transactions t ON t.id = e.tx_id
        WHERE e.id > $1 ORDER BY e.id LIMIT ${limit + 1}`, [after(ctx.query)]);
    const page = rows.slice(0, limit);
    const items = page.map((r) => {
      const amt = Math.abs(r.amount);
      let kind; let category; let description;
      if (r.acct === 'bank') {
        kind = r.amount > 0 ? 'cash_in' : 'cash_out';
        category = r.idem_scope === 'agg-deposit' ? 'Ký quỹ đơn vị tổng hợp' : r.tkind === 'withdrawal' ? 'Rút tiền của khách' : r.idem_scope === 'admin-credit' ? 'Cộng ví thủ công' : 'Nạp ví';
        description = `${category} · ${r.idem_key}`.slice(0, 200);
      } else if (r.acct === 'revenue') {
        kind = r.amount < 0 ? 'revenue' : 'expense'; // ghi nợ doanh thu = hoàn tiền cho khách
        category = r.amount < 0 ? (r.tkind === 'adjustment' ? 'Cước phát sinh' : 'Cước vận chuyển') : 'Hoàn tiền đơn';
        description = `${r.tkind}${r.shipment_id ? ' · đơn ' + String(r.shipment_id).slice(0, 8) : ''}`;
      } else {
        kind = r.amount > 0 ? 'expense' : 'revenue'; // ghi có giá vốn = hãng hoàn lại
        category = r.amount > 0 ? 'Giá vốn hãng' : 'Hãng hoàn cước';
        description = `${r.tkind}${r.shipment_id ? ' · đơn ' + String(r.shipment_id).slice(0, 8) : ''}`;
      }
      return { id: String(r.id), at: iso(r.created_at), kind, amount: amt, category, description, ref: r.shipment_id ? String(r.shipment_id) : String(r.idem_key).slice(0, 60), phone: r.phone };
    });
    return { items, next: page.length ? String(page[page.length - 1].id) : null, hasMore: rows.length > limit };
  });

  R(app, '/balances', async () => {
    const o = await admin.overview();
    const b = o.balances;
    return {
      items: [
        { id: 'bank', label: 'Tiền ngân hàng (theo sổ)', amount: b.bank, kind: 'cash' },
        { id: 'customer_funds', label: 'Tiền khách giữ hộ (ví + tạm giữ + đang rút)', amount: b.userWallets + b.userHeld + b.userBuffer + b.pendingWithdrawals, kind: 'customer_funds' },
        { id: 'aggregator_deposit', label: 'Ký quỹ đơn vị tổng hợp', amount: b.aggregator_deposit, kind: 'receivable' },
      ].map((x) => ({ ...x, amount: Number.isSafeInteger(x.amount) ? x.amount : 0 })),
    };
  });

  R(app, '/panels', async () => ({ items: PANELS }));
  R(app, '/panels/:id', async (ctx) => panelRows(ctx.params.id, ctx.query));

  app.route('POST', '/admin-api/v1/actions/:id', async (ctx) => {
    verify(ctx);
    let body;
    try { body = JSON.parse(ctx.raw || '{}'); } catch { throw new ApiError(400, 'bad_json', 'JSON không hợp lệ'); }
    try { return await runAction(ctx.params.id, body); } catch (e) {
      if (e instanceof ApiError) return { ok: false, message: e.message };
      throw e;
    }
  }, { raw: true, noCsrf: true, limit: 120, limitKey: 'consoleact' });
}
