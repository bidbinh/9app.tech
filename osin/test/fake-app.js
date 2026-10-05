// App giả dùng chính SDK để đăng ký công cụ (dùng cho test và e2e). Chạy server node:http thật ở cổng ngẫu nhiên.
import http from 'node:http';
import { createOsinApi } from '../sdk/osin-sdk.js';

export const FAKE_SECRET = 'fake-app-secret-0123456789abcdef0123456789';
export const FAKE_RECEIPT_SECRET = 'fake-receipt-secret-9876543210fedcba9876543210';

export async function createFakeApp({ id = 'family', secret = FAKE_SECRET, receiptSecret = FAKE_RECEIPT_SECRET, keyId = 'osin', mount = '/family', nonceStore, userRate, extraTools = [] } = {}) {
  const state = {
    calls: [],                 // mọi lời gọi tới handler công cụ: { tool, mode, userId, familyId, requestId }
    executed: [],              // chỉ các lần chạy thật của công cụ ghi
    lists: new Map(),          // userId -> mảng mục đi chợ
    events: new Map(),         // userId -> sự kiện
    deleted: [],
    slowMs: 0,
    down: false,
    manifestHits: 0,
    sdkLog: [],
    audit: [],
  };
  const eventsOf = (u) => state.events.get(u) || [{ ten: 'Học Toán', gio: '07:30' }, { ten: 'Đón con', gio: '16:30' }];
  const track = (tool, mode, ctx) => state.calls.push({ tool, mode, userId: ctx.userId, familyId: ctx.familyId, requestId: ctx.requestId });
  const tools = [
    {
      name: 'lich_hom_nay', description: 'Lấy lịch học và đưa đón của hôm nay của người dùng đang trò chuyện.', readOnly: true,
      parameters: { type: 'object', properties: { ngay: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Ngày YYYY-MM-DD, mặc định hôm nay' } } },
      async run(args, ctx) {
        track('lich_hom_nay', ctx.mode, ctx);
        if (state.slowMs) await new Promise((r) => setTimeout(r, state.slowMs));
        if (ctx.userId === 'con1') throw Object.assign(new Error('Vai trò con không xem được lịch này'), { osinCode: 'forbidden' });
        return { su_kien: eventsOf(ctx.userId), links: [{ label: 'lịch 9family', path: '/family/#/lich' }, { label: 'Liên kết giả', path: 'https://evil.example/x' }, { label: 'Ra ngoài app', path: '/hire/' }] };
      },
    },
    {
      name: 'them_vao_danh_sach', description: 'Thêm một mục vào danh sách đi chợ của gia đình.', readOnly: false, confirm: true,
      parameters: { type: 'object', properties: { muc: { type: 'string', maxLength: 80 }, so_luong: { type: 'integer', minimum: 1, maximum: 99 } }, required: ['muc'] },
      summaryTemplate: 'Thêm "{muc}" vào danh sách đi chợ',
      authorize(_a, ctx) { if (ctx.userId === 'con1') throw Object.assign(new Error('Vai trò con không được sửa danh sách'), { osinCode: 'forbidden' }); },
      async run(args, ctx) {
        track('them_vao_danh_sach', ctx.mode, ctx);
        const list = state.lists.get(ctx.userId) || []; list.push(args.muc); state.lists.set(ctx.userId, list);
        state.executed.push({ tool: 'them_vao_danh_sach', userId: ctx.userId, args, requestId: ctx.requestId });
        if (state.slowMs) await new Promise((r) => setTimeout(r, state.slowMs));
        return { message: `Đã thêm "${args.muc}" vào danh sách đi chợ.`, tong: list.length };
      },
    },
    {
      name: 'xoa_su_kien', description: 'Xóa một sự kiện khỏi lịch gia đình.', readOnly: false, confirm: true,
      parameters: { type: 'object', properties: { ten: { type: 'string', maxLength: 80 } }, required: ['ten'] },
      summaryTemplate: 'Xóa sự kiện "{ten}" khỏi lịch',
      async run(args, ctx) { track('xoa_su_kien', ctx.mode, ctx); state.deleted.push(args.ten); state.executed.push({ tool: 'xoa_su_kien', userId: ctx.userId, args, requestId: ctx.requestId }); return { message: `Đã xóa "${args.ten}".` }; },
    },
    {
      name: 'chuyen_tien', description: 'Chuyển tiền từ quỹ gia đình cho một người.', readOnly: false, confirm: true, sensitive: true,
      parameters: { type: 'object', properties: { so_tien: { type: 'integer', minimum: 1 } }, required: ['so_tien'] },
      summaryTemplate: 'Chuyển {so_tien} đồng',
      async run(args, ctx) { track('chuyen_tien', ctx.mode, ctx); state.executed.push({ tool: 'chuyen_tien', userId: ctx.userId, args }); return { message: 'đã chuyển' }; },
    },
    {
      name: 'xem_can_duyet', description: 'Đọc dữ liệu nhưng người dùng muốn duyệt trước (đọc mà cần xác nhận).', readOnly: true, confirm: true,
      parameters: { type: 'object', properties: { ma: { type: 'string', maxLength: 20 } } },
      summaryTemplate: 'Xem mục cần duyệt',
      async run(args, ctx) { track('xem_can_duyet', ctx.mode, ctx); state.executed.push({ tool: 'xem_can_duyet', userId: ctx.userId, args, requestId: ctx.requestId }); return { message: 'Đã xem.' }; },
    },
    {
      name: 'doc_chua_duyet', description: 'Công cụ app tự khai là chỉ đọc nhưng vận hành chưa duyệt.', readOnly: true,
      parameters: { type: 'object', properties: {} },
      async run(_a, ctx) { track('doc_chua_duyet', ctx.mode, ctx); return { ok: true }; },
    },
    {
      name: 'hong', description: 'Công cụ luôn gặp lỗi bên trong (dùng để thử xử lý lỗi).', readOnly: true,
      parameters: { type: 'object', properties: {} },
      async run(_a, ctx) { track('hong', ctx.mode, ctx); throw new Error('boom nội bộ không được lộ ra ngoài'); },
    },
  ];
  tools.push(...extraTools);
  const api = createOsinApi({ appId: id, prefix: mount + '/osin-api/v1', keys: { [keyId]: secret }, tools, nonceStore, receipt: { secret: receiptSecret }, userRate, audit: (e) => state.audit.push(e), log: (e) => state.sdkLog.push(e) });
  const server = http.createServer((req, res) => {
    if (state.down) { req.destroy(); return; }
    if (api.matches(req.url)) { if (req.url.includes('/tools')) state.manifestHits++; api.handle(req, res); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    state, api, port, secret, keyId, id,
    baseUrl: `http://127.0.0.1:${port}${mount}`,
    appConfig: { id, name: '9family', baseUrl: `http://127.0.0.1:${port}${mount}`, keyId, secret, receiptSecret, linkPrefix: mount + '/', readOnlyTools: ['lich_hom_nay', 'hong', 'xem_can_duyet'] },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}
