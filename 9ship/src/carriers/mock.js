// Adapter mô phỏng: dùng để dựng và kiểm thử toàn bộ luồng khi chưa có hợp đồng thật.
// Trạng thái giữ trong bộ nhớ (mất khi khởi động lại). KHÔNG dùng ở production.
import crypto from 'node:crypto';
import { CarrierError } from '../errors.js';
import { findProvince, zoneOf, isRemote } from '../geo.js';

export const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';

const SPECS = {
  'mock-nhanh': {
    name: 'Mock Nhanh', divisor: 5000, discount: 0.9,
    table: { noi_tinh: [22000, 4500], noi_mien: [28000, 5500], lien_mien: [38000, 7000] },
    eta: { noi_tinh: [1, 1], noi_mien: [1, 2], lien_mien: [2, 3] },
    handovers: ['dropoff', 'pickup'],
    caps: { dropoff: true, pickup: true, findByReference: true, webhook: true, officeList: true, labelNative: false, idempotentCreate: true },
    service: 'express', serviceName: 'Giao nhanh',
  },
  'mock-chuan': {
    name: 'Mock Chuẩn', divisor: 6000, discount: 0.87,
    table: { noi_tinh: [18000, 3500], noi_mien: [24000, 4500], lien_mien: [32000, 6000] },
    eta: { noi_tinh: [1, 2], noi_mien: [2, 3], lien_mien: [3, 5] },
    handovers: ['dropoff', 'pickup'],
    caps: { dropoff: true, pickup: true, findByReference: true, webhook: false, officeList: true, labelNative: false, idempotentCreate: true },
    service: 'standard', serviceName: 'Giao chuẩn',
  },
  'mock-tietkiem': {
    name: 'Mock Tiết kiệm', divisor: 6000, discount: 0.85,
    table: { noi_tinh: [15000, 3000], noi_mien: [20000, 4000], lien_mien: [27000, 5000] },
    eta: { noi_tinh: [2, 3], noi_mien: [3, 4], lien_mien: [4, 6] },
    handovers: ['dropoff'],
    caps: { dropoff: true, pickup: false, findByReference: false, webhook: false, officeList: true, labelNative: false, idempotentCreate: true },
    service: 'economy', serviceName: 'Tiết kiệm',
    refuses: ['electronics', 'fragile'],
  },
};

// Điểm nhận gửi mẫu (tọa độ gần đúng các khu trung tâm).
const OFFICES = [
  ['TP Hồ Chí Minh', 'Quận 1', 10.7769, 106.7009],
  ['TP Hồ Chí Minh', 'Bình Thạnh', 10.8106, 106.7091],
  ['TP Hồ Chí Minh', 'Tân Bình', 10.8015, 106.6524],
  ['TP Hồ Chí Minh', 'Thủ Đức', 10.8494, 106.7537],
  ['TP Hồ Chí Minh', 'Quận 7', 10.7340, 106.7218],
  ['Hà Nội', 'Hoàn Kiếm', 21.0285, 105.8542],
  ['Hà Nội', 'Cầu Giấy', 21.0338, 105.7907],
  ['Hà Nội', 'Đống Đa', 21.0180, 105.8270],
  ['Hà Nội', 'Hà Đông', 20.9710, 105.7770],
  ['Đà Nẵng', 'Hải Châu', 16.0544, 108.2022],
  ['Đà Nẵng', 'Sơn Trà', 16.0720, 108.2400],
];

const state = {
  byCode: new Map(),
  byRef: new Map(),
  seq: 0,
  behaviors: [], // [{ carrierId, method, behavior, times }]
};

export const mockControl = {
  // Đặt hành vi cho lần gọi kế tiếp (times lần). behavior: fail | slow | timeout_before | timeout_after | fee_drift:<n> | reject_cancel
  set(carrierId, method, behavior, times = 1) {
    state.behaviors.push({ carrierId, method, behavior, times });
  },
  reset() {
    state.byCode.clear();
    state.byRef.clear();
    state.behaviors.length = 0;
  },
  take(carrierId, method) {
    const i = state.behaviors.findIndex((b) => b.carrierId === carrierId && b.method === method && b.times > 0);
    if (i < 0) return null;
    state.behaviors[i].times -= 1;
    return state.behaviors[i].behavior;
  },
  // Đẩy một sự kiện hành trình (dùng cho thử nghiệm và chế độ demo).
  advance(code, status, { note = '', feeTotal } = {}) {
    const s = state.byCode.get(code);
    if (!s) throw new Error('mã không tồn tại: ' + code);
    const ev = { eventId: 'ev' + (s.events.length + 1) + '-' + status, status, note, at: new Date().toISOString() };
    if (feeTotal !== undefined) ev.feeTotal = feeTotal;
    s.events.push(ev);
    s.status = status;
    if (feeTotal !== undefined) s.fee = feeTotal;
    return ev;
  },
  get(code) { return state.byCode.get(code); },
  sign(raw) {
    return crypto.createHmac('sha256', MOCK_WEBHOOK_SECRET).update(raw).digest('hex');
  },
};

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms).unref(); });
const roundUp100 = (n) => Math.round(n / 100) * 100;

function pickBehavior(id, method) {
  return mockControl.take(id, method);
}

function chargeable(req, spec) {
  const w = req.weightG;
  let vol = 0;
  if (req.dims && req.dims.l && req.dims.w && req.dims.h) {
    vol = Math.ceil((req.dims.l * req.dims.w * req.dims.h) / spec.divisor * 1000);
  }
  return Math.max(w, vol);
}

function makeAdapter(id, spec) {
  const adapter = {
    id,
    name: spec.name,
    capabilities: spec.caps,

    async quote(req) {
      const b = pickBehavior(id, 'quote');
      if (b === 'fail') throw new CarrierError('mock quote lỗi', { retryable: true });
      if (b === 'slow') await sleep(20000);
      const from = findProvince(req.from?.province);
      const to = findProvince(req.to?.province);
      if (!from || !to) throw new CarrierError('tỉnh không hợp lệ');
      if (spec.refuses && spec.refuses.includes(req.goodsType)) return [];
      const cw = chargeable(req, spec);
      if (cw > 30000) throw new CarrierError('vượt trọng lượng tối đa của hãng (30kg)');
      const zone = zoneOf(from.code, to.code);
      const [base, step] = spec.table[zone];
      const steps = Math.max(0, Math.ceil(cw / 500) - 1);
      const freightList = base + step * steps;
      const surcharge = isRemote(to.code) ? 10000 : 0;
      const insurance = req.declaredValue > 1000000 ? Math.round(req.declaredValue * 0.005) : 0;
      const freightCost = roundUp100(freightList * spec.discount);
      const handovers = spec.handovers.filter((h) => !req.handover || h === req.handover);
      if (!handovers.length) return [];
      return [{
        service: spec.service,
        serviceName: spec.serviceName,
        contract: id + '-main',
        handovers,
        etaDays: spec.eta[zone],
        chargeableWeightG: cw,
        cost: { total: freightCost + surcharge + insurance, breakdown: { freight: freightCost, surcharge, insurance, serviceFee: 0, vat: 0 } },
        listPrice: freightList + surcharge + insurance,
        listPriceVerifiedAt: new Date().toISOString(),
        priceToken: spec.caps.webhook ? 'tok-' + crypto.randomBytes(6).toString('hex') : null,
      }];
    },

    async createShipment(req) {
      const b = pickBehavior(id, 'createShipment');
      if (b === 'fail') throw new CarrierError('mock từ chối tạo đơn');
      if (b === 'timeout_before') throw new CarrierError('timeout', { unknown: true });
      const existing = state.byRef.get(req.ref);
      if (existing) return summary(existing);
      state.seq += 1;
      // có thành phần thời gian để mã không trùng sau khi khởi động lại (đơn cũ vẫn nằm trong CSDL)
      const code = id.replace('mock-', 'MK').toUpperCase() + Date.now().toString(36).toUpperCase().slice(-5) + String(1000 + state.seq);
      let fee = req.expectedFee;
      if (b && b.startsWith('fee_drift:')) fee += Number.parseInt(b.split(':')[1], 10);
      const s = {
        ref: req.ref, carrierCode: code, trackingCode: code, fee, status: 'created',
        events: [{ eventId: 'ev1-created', status: 'created', note: 'Đã tạo đơn', at: new Date().toISOString() }],
        req,
      };
      state.byRef.set(req.ref, s);
      state.byCode.set(code, s);
      if (b === 'timeout_after') throw new CarrierError('timeout sau khi hãng đã tạo', { unknown: true });
      return summary(s);
    },

    async cancel(code) {
      const b = pickBehavior(id, 'cancel');
      if (b === 'timeout_before') throw new CarrierError('timeout', { unknown: true });
      const s = state.byCode.get(code);
      if (!s) throw new CarrierError('không có đơn');
      if (b === 'reject_cancel' || ['picked_up', 'in_transit', 'delivered', 'returning', 'returned'].includes(s.status)) {
        return { status: 'rejected', reason: 'Đơn đã được lấy hàng' };
      }
      mockControl.advance(code, 'cancelled', { note: 'Đã hủy theo yêu cầu' });
      return { status: 'confirmed' };
    },

    async track(code) {
      const s = state.byCode.get(code);
      if (!s) return [];
      return s.events.map((e) => ({ ...e }));
    },

    async findByReference(ref) {
      if (!spec.caps.findByReference) return null;
      const s = state.byRef.get(ref);
      return s ? summary(s) : null;
    },

    async listPickupPoints({ lat, lng, radiusKm = 15 } = {}) {
      void lat; void lng; void radiusKm;
      return OFFICES.map(([province, district, plat, plng], i) => ({
        id: `${id}:${i}`,
        carrier: id,
        type: 'carrier_office',
        name: `${spec.name} - ${district}`,
        address: `Bưu cục ${district}, ${province}`,
        lat: plat + ((i % 3) - 1) * 0.004,
        lng: plng + ((i % 4) - 1.5) * 0.004,
        hours: '07:30-19:00 (T2-T7)',
        source: 'mock',
      }));
    },

    // Webhook dạng JSON {events:[{eventId, code, status, at, note, feeTotal?}]}, chữ ký HMAC-SHA256 ở header x-signature.
    parseWebhook(headers, raw) {
      const sig = headers['x-signature'] || '';
      const want = mockControl.sign(raw);
      const a = Buffer.from(sig);
      const w = Buffer.from(want);
      if (a.length !== w.length || !crypto.timingSafeEqual(a, w)) throw new CarrierError('chữ ký webhook không hợp lệ');
      const body = JSON.parse(raw);
      return (body.events || []).map((e) => ({
        eventId: String(e.eventId), code: String(e.code), status: String(e.status),
        at: e.at || new Date().toISOString(), note: e.note || '',
        feeTotal: e.feeTotal === undefined ? undefined : Number(e.feeTotal),
      }));
    },
  };
  return adapter;
}

function summary(s) {
  return { carrierCode: s.carrierCode, trackingCode: s.trackingCode, fee: s.fee, labelUrl: null };
}

export function createMockAdapters() {
  return Object.entries(SPECS).map(([id, spec]) => makeAdapter(id, spec));
}
