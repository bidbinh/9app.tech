import crypto from 'node:crypto';
import { config } from '../config.js';
import { html } from '../http.js';
import * as lifecycle from '../lifecycle.js';
import { parseNhanhWebhook } from '../carriers/nhanh.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Kết nối NhanhShip: trang nhận mã cấp quyền (OAuth) và webhook sự kiện.
export function nhanhRoutes(app) {
  // Nhanh.vn chuyển trình duyệt của chủ tài khoản về đây kèm accessCode (hết hạn sau 10 phút).
  app.route('GET', '/nhanh/callback', async (ctx) => {
    const code = String(ctx.query.accessCode || '').slice(0, 200);
    const body = code
      ? `<h1>Đã cấp quyền cho 9Ship</h1><p>Mã cấp quyền (hết hạn sau 10 phút):</p><pre>${esc(code)}</pre><p>Gửi mã này cho người triển khai để hoàn tất kết nối.</p>`
      : '<h1>Thiếu mã cấp quyền</h1><p>Hãy mở lại đường dẫn cấp quyền từ Nhanh.vn.</p>';
    return html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kết nối Nhanh.vn</title><body style="font:16px system-ui;max-width:560px;margin:40px auto;padding:0 16px">${body}</body>`);
  });

  // Nhanh.vn gọi thử địa chỉ này khi lưu app (phải trả 200) rồi gửi sự kiện kèm header Authorization = mã xác thực.
  // Luôn trả 200 để Nhanh.vn không tụt ưu tiên webhook; sự kiện sai mã hoặc không hiểu thì bỏ qua.
  app.route('POST', '/v1/webhooks/nhanh', async (ctx) => {
    const token = config.nhanhWebhookToken;
    if (!token || !same(ctx.headers.authorization || '', token)) return { ok: true, accepted: 0 };
    let groups;
    try { groups = parseNhanhWebhook(ctx.raw); } catch { return { ok: true, accepted: 0 }; }
    let accepted = 0;
    for (const g of groups) accepted += await lifecycle.ingest(g.adapterId, g.events);
    return { ok: true, accepted };
  }, { raw: true, noCsrf: true, limit: 600, limitKey: 'webhook' });
}
