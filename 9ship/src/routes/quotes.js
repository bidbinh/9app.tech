import { validateQuoteRequest, GOODS_TYPES, MAX_WEIGHT_G, MAX_DECLARED } from '../pricing.js';
import { quoteAll } from '../rating.js';
import { PROVINCES, pointsNear } from '../places.js';
import { ApiError } from '../errors.js';
import * as registry from '../carriers/index.js';
import { config } from '../config.js';

export const GOODS_LABELS = {
  general: 'Hàng thông thường', document: 'Tài liệu, giấy tờ', clothes: 'Quần áo, giày dép', electronics: 'Đồ điện tử',
  food_dry: 'Thực phẩm khô, đóng gói', cosmetics: 'Mỹ phẩm', fragile: 'Hàng dễ vỡ',
};

export function quotesRoutes(app) {
  app.route('GET', '/v1/meta', async () => ({
    provinces: PROVINCES.map((p) => ({ code: p.code, name: p.name })),
    goodsTypes: GOODS_TYPES.map((g) => ({ code: g, label: GOODS_LABELS[g] })),
    limits: { maxWeightG: MAX_WEIGHT_G, maxDeclaredValue: MAX_DECLARED },
    bufferPct: config.bufferPct,
    bufferMin: config.bufferMin,
    demo: !config.production && config.mockCarriers,
    carriers: registry.list().map((a) => ({ id: a.id, name: a.name, capabilities: a.capabilities })),
    notice: 'Không gửi hàng cấm: chất nổ, chất cháy, vũ khí, chất ma túy, hàng giả, động vật sống và các mặt hàng pháp luật cấm lưu thông.',
  }));

  app.route('POST', '/v1/quotes', async (ctx) => {
    const req = validateQuoteRequest(ctx.body);
    return quoteAll(req, { userId: ctx.user.id });
  }, { auth: 'user', limit: 40, limitKey: 'quotes' });

  app.route('GET', '/v1/pickup-points', async (ctx) => {
    const lat = Number(ctx.query.lat);
    const lng = Number(ctx.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new ApiError(400, 'invalid_request', 'lat/lng không hợp lệ');
    }
    const radiusKm = Math.min(50, Math.max(1, Number(ctx.query.radiusKm) || 10));
    const points = await pointsNear(lat, lng, { carrier: ctx.query.carrier || undefined, radiusKm });
    return {
      points: points.map((p) => ({
        id: p.id, carrier: p.carrier, name: p.name, address: p.address, hours: p.hours,
        lat: p.lat, lng: p.lng, distanceKm: p.distanceKm,
      })),
    };
  }, { auth: 'user' });
}
