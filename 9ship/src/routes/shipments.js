import * as orders from '../orders.js';
import * as worker from '../worker.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { render, verifyLabel, signLabel } from '../labels.js';
import { html } from '../http.js';
import * as registry from '../carriers/index.js';
import { config } from '../config.js';

const WAIT_MS = 7000;

export function shipmentRoutes(app) {
  app.route('POST', '/v1/shipments', async (ctx) => {
    const idem = ctx.headers['idempotency-key'];
    const { shipment, replay } = await orders.create(ctx.user.id, ctx.body, idem);
    if (!replay || shipment.shipping_status === 'pending_carrier') {
      // chờ ngắn để phản hồi có luôn mã vận đơn; quá hạn thì client theo dõi qua GET
      await Promise.race([
        worker.runOnce({ shipmentId: shipment.id }),
        new Promise((r) => { setTimeout(r, WAIT_MS).unref(); }),
      ]).catch(() => {});
    }
    return orders.get(ctx.user.id, shipment.id);
  }, { auth: 'user', limit: 20, limitKey: 'ship' });

  app.route('GET', '/v1/shipments', async (ctx) => ({ shipments: await orders.list(ctx.user.id) }), { auth: 'user' });
  app.route('GET', '/v1/shipments/:id', async (ctx) => orders.get(ctx.user.id, ctx.params.id), { auth: 'user' });

  // Link nhãn có ký, hết hạn sau 1 giờ; làm mới bằng GET này khi đang đăng nhập.
  app.route('GET', '/v1/shipments/:id/label', async (ctx) => {
    await orders.get(ctx.user.id, ctx.params.id); // kiểm tra quyền sở hữu
    return { url: `${config.basePath}/v1/labels/${signLabel(ctx.params.id, 3600)}` };
  }, { auth: 'user' });

  app.route('GET', '/v1/labels/:token', async (ctx) => {
    const id = verifyLabel(ctx.params.token);
    if (!id) throw new ApiError(404, 'not_found', 'Liên kết không hợp lệ hoặc đã hết hạn');
    const rows = await query('SELECT * FROM shipments WHERE id=$1', [id]);
    if (!rows.length || !rows[0].tracking_code) throw new ApiError(404, 'not_found', 'Đơn chưa có nhãn');
    const sh = rows[0];
    const pp = sh.pickup_point_id ? (await query('SELECT name, address FROM pickup_points WHERE id=$1', [sh.pickup_point_id]))[0] : null;
    const body = await render(sh, {
      size: ctx.query.size === 'a6' ? 'a6' : '100x150',
      carrierName: registry.get(sh.carrier)?.name || sh.carrier,
      pickupPoint: pp,
    });
    return html(body);
  });
}
