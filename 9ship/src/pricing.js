import crypto from 'node:crypto';
import { ApiError } from './errors.js';
import { findProvince } from './geo.js';

export const GOODS_TYPES = ['general', 'document', 'clothes', 'electronics', 'food_dry', 'cosmetics', 'fragile'];
export const MAX_WEIGHT_G = 30000;
export const MAX_DECLARED = 50_000_000;
export const CAP_MAX_AGE_HOURS = 72;

function bad(msg, field) {
  return new ApiError(400, 'invalid_request', msg, { field });
}

function intIn(v, min, max, field, { allowZero = false } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) throw bad(`${field} phải là số nguyên`, field);
  if (v < (allowZero ? 0 : min) || v > max) throw bad(`${field} phải trong khoảng ${allowZero ? 0 : min}..${max}`, field);
  return v;
}

function place(p, field) {
  if (!p || typeof p !== 'object') throw bad(`${field} là bắt buộc`, field);
  const prov = findProvince(p.province);
  if (!prov) throw bad(`${field}.province không hợp lệ`, field + '.province');
  const out = { province: prov.code, provinceName: prov.name, ward: String(p.ward || '').slice(0, 80) };
  if (p.lat !== undefined && p.lng !== undefined) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      throw bad(`${field} có tọa độ không hợp lệ`, field + '.lat');
    }
    out.lat = p.lat;
    out.lng = p.lng;
  }
  return out;
}

export function validateQuoteRequest(body) {
  if (!body || typeof body !== 'object') throw bad('Thiếu nội dung yêu cầu');
  const from = place(body.from, 'from');
  const to = place(body.to, 'to');
  const weightG = intIn(body.weightG, 1, MAX_WEIGHT_G, 'weightG');
  let dims = null;
  if (body.dims !== undefined && body.dims !== null) {
    const d = body.dims;
    dims = {
      l: intIn(d.l, 1, 200, 'dims.l'),
      w: intIn(d.w, 1, 200, 'dims.w'),
      h: intIn(d.h, 1, 200, 'dims.h'),
    };
  }
  const declaredValue = body.declaredValue === undefined ? 0 : intIn(body.declaredValue, 0, MAX_DECLARED, 'declaredValue', { allowZero: true });
  const goodsType = body.goodsType === undefined ? 'general' : String(body.goodsType);
  if (!GOODS_TYPES.includes(goodsType)) throw bad('goodsType không hợp lệ', 'goodsType');
  const handover = body.handover === undefined ? 'dropoff' : String(body.handover);
  if (!['dropoff', 'pickup'].includes(handover)) throw bad('handover phải là dropoff hoặc pickup', 'handover');
  return { from, to, weightG, dims, declaredValue, goodsType, handover };
}

export function ceilTo(n, step) {
  if (!step || step <= 1) return Math.ceil(n);
  return Math.ceil(n / step) * step;
}

export function floorTo(n, step) {
  if (!step || step <= 1) return Math.floor(n);
  return Math.floor(n / step) * step;
}

// Chọn quy tắc cụ thể nhất: (carrier, route) > (carrier, *) > (*, route) > (*, *)
export function pickRule(rules, carrier, route) {
  const order = [[carrier, route], [carrier, '*'], ['*', route], ['*', '*']];
  for (const [c, r] of order) {
    const hit = rules.find((x) => x.active && x.carrier === c && x.route === r);
    if (hit) return hit;
  }
  return null;
}

export function validateRule(r) {
  if (!(Number(r.margin_pct) >= 0 && Number(r.margin_pct) <= 100)) throw bad('margin_pct phải trong 0..100');
  if (!(Number.isInteger(r.margin_min) && r.margin_min >= 0)) throw bad('margin_min phải là số nguyên >= 0');
  if (!(Number.isInteger(r.rounding) && r.rounding >= 1)) throw bad('rounding phải là số nguyên >= 1');
  if (r.rounding > Math.max(1, r.margin_min)) throw bad('bậc làm tròn không được lớn hơn biên tối thiểu');
  return r;
}

// Giá bán = giá vốn + biên, làm tròn lên, rồi chặn trần theo giá niêm yết đã kiểm chứng.
// Trả về { sellPrice, hidden, reason, capped, capVerified }.
export function applyMargin({ cost, rule, listPrice, listVerifiedAt, now = new Date() }) {
  const pct = Number(rule.margin_pct);
  const margin = Math.max(rule.margin_min, Math.round((cost * pct) / 100));
  let sell = ceilTo(cost + margin + (rule.surcharge || 0), rule.rounding);

  const fresh = listPrice != null && listVerifiedAt
    && (now - new Date(listVerifiedAt)) <= CAP_MAX_AGE_HOURS * 3600 * 1000;
  const capVerified = Boolean(fresh);
  let capped = false;
  if (capVerified) {
    const cap = floorTo(listPrice - rule.rounding, rule.rounding);
    if (sell > cap) {
      sell = cap;
      capped = true;
    }
  } else if (rule.require_cap) {
    return { sellPrice: sell, hidden: true, reason: 'no_verified_cap', capped: false, capVerified: false };
  }
  const realMargin = sell - cost;
  if (realMargin < 0 && !rule.allow_loss) {
    return { sellPrice: sell, hidden: true, reason: 'negative_margin', capped, capVerified };
  }
  if (realMargin < rule.margin_min && !rule.allow_loss) {
    return { sellPrice: sell, hidden: true, reason: 'margin_below_min', capped, capVerified };
  }
  return { sellPrice: sell, hidden: false, reason: null, capped, capVerified };
}

export function priceBookVersion(rule, listPrice) {
  const h = crypto.createHash('sha1').update(JSON.stringify([rule.id, rule.margin_pct, rule.margin_min, rule.rounding, listPrice])).digest('hex');
  return 'pb-' + h.slice(0, 10);
}
