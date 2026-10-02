import * as registry from '../carriers/index.js';
import * as lifecycle from '../lifecycle.js';
import { ApiError, CarrierError } from '../errors.js';

export function webhookRoutes(app) {
  // Webhook hãng: không dùng cookie, nên miễn CSRF; xác thực bằng chữ ký do adapter kiểm tra.
  app.route('POST', '/v1/webhooks/:carrier', async (ctx) => {
    const adapter = registry.get(ctx.params.carrier);
    if (!adapter || !adapter.capabilities.webhook) throw new ApiError(404, 'not_found', 'Không có webhook cho hãng này');
    let events;
    try {
      events = adapter.parseWebhook(ctx.headers, ctx.raw);
    } catch (e) {
      if (e instanceof CarrierError) throw new ApiError(401, 'bad_signature', 'Chữ ký webhook không hợp lệ');
      throw new ApiError(400, 'bad_payload', 'Nội dung webhook không hợp lệ');
    }
    const accepted = await lifecycle.ingest(adapter.id, events);
    return { ok: true, accepted };
  }, { raw: true, noCsrf: true, limit: 600, limitKey: 'webhook' });
}
