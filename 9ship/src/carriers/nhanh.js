// Adapter NhanhShip qua Nhanh.vn POS Open API v3.0 (https://developers.nhanh.group/pos/), mỗi hãng một adapter, dùng chung một máy khách.
//   cước      POST /v3.0/shipping/fee        (type 1 = kết nối dùng chung của Nhanh.vn)
//   tạo + gửi POST /v3.0/order/add           (carrier.autoSend = 1 → trả carrierCode và trackingUrl)
//   hủy       POST /v3.0/order/cancelcarrier
//   tra cứu   POST /v3.0/order/list          (lọc theo id; tra theo mã tham chiếu bằng cách quét đơn mới)
//   sự kiện   webhook v3.0 (orderAdd/orderUpdate...), header Authorization = mã xác thực của app
// GIỚI HẠN: điểm lấy hàng luôn là KHO của tài khoản Nhanh.vn (không đặt được người gửi riêng cho từng đơn).
// Vì vậy chỉ cho phép gửi tại bưu cục; người gửi thật được ghi vào ghi chú đơn.
// carrierCode của 9Ship = ID đơn trong Nhanh.vn; trackingCode = mã vận đơn của hãng.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CarrierError } from '../errors.js';
import { findProvince } from '../geo.js';

const BASE = 'https://pos.open.nhanh.vn';
const LOCATIONS = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/nhanh-locations.json', import.meta.url)), 'utf8'));

// ID hãng trong Nhanh.vn (GET shipping/carrier) → mã ngắn dùng làm id adapter.
const CARRIERS = { 2: ['vtp', 'Viettel Post'], 5: ['ghn', 'Giao Hàng Nhanh'], 22: ['vnp', 'VNPost'], 24: ['jt', 'J&T Express'], 26: ['best', 'Best Express'], 29: ['spx', 'SPX Express'] };
const DEFAULT_IDS = '29,5,2,24,26,22';

// Trạng thái đơn của Nhanh.vn → trạng thái của 9Ship. Mã khác bị bỏ qua.
export const STATUS_MAP = {
  40: 'created', 42: 'created', 43: 'created', 54: 'created', 55: 'created', 56: 'created',
  59: 'in_transit', 60: 'delivered', 61: 'delivery_failed',
  58: 'cancelled', 63: 'cancelled', 64: 'cancelled',
  71: 'returning', 72: 'returned', 74: 'returned',
};

const GOODS_NAME = { general: 'Hàng hóa', document: 'Tài liệu', clothes: 'Quần áo, giày dép', electronics: 'Đồ điện tử', food_dry: 'Thực phẩm khô', cosmetics: 'Mỹ phẩm', fragile: 'Hàng dễ vỡ' };

export const adapterIdOf = (nhanhCarrierId) => (CARRIERS[nhanhCarrierId] ? 'nhanh-' + CARRIERS[nhanhCarrierId][0] : null);

// Đổi (tỉnh, phường) của 9Ship sang mã v2 của Nhanh.vn; null nếu không có.
export function nhanhLocation(provinceCode, wardName) {
  const p = findProvince(provinceCode);
  const e = p && LOCATIONS.provinces[p.code];
  if (!e) return null;
  const wardId = e.wards[wardName];
  return wardId ? { cityId: e.cityId, wardId } : null;
}

// "3-4 ngày" → [3,4]; "2 ngày" → [2,2]; không đọc được → [2,5]
export function parseEta(desc) {
  const m = String(desc || '').match(/(\d+)\s*(?:-|–|đến)?\s*(\d+)?/);
  if (!m) return [2, 5];
  const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

export function createNhanh(env = process.env, fetchImpl = globalThis.fetch) {
  const appId = env.NHANH_APP_ID; const businessId = env.NHANH_BUSINESS_ID; const token = env.NHANH_ACCESS_TOKEN;
  if (!appId || !businessId || !token) return [];
  const base = (env.NHANH_BASE || BASE).replace(/\/+$/, '');
  const timeoutMs = Number.parseInt(env.NHANH_TIMEOUT_MS || '20000', 10);
  const divisor = Number.parseInt(env.NHANH_VOLUME_DIVISOR || '6000', 10);
  const depotId = env.NHANH_DEPOT_ID ? Number(env.NHANH_DEPOT_ID) : null;
  const productId = env.NHANH_PRODUCT_ID ? Number(env.NHANH_PRODUCT_ID) : null;
  const ids = (env.NHANH_CARRIER_IDS || DEFAULT_IDS).split(',').map((x) => Number(x.trim())).filter((x) => CARRIERS[x]);

  async function call(path, body = {}) {
    const url = `${base}/v3.0/${path}?appId=${encodeURIComponent(appId)}&businessId=${encodeURIComponent(businessId)}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    } catch (e) {
      throw new CarrierError('Nhanh.vn không phản hồi: ' + (e.name === 'AbortError' ? 'quá thời gian' : e.message), { unknown: true });
    } finally { clearTimeout(timer); }
    if (res.status >= 500) throw new CarrierError('Nhanh.vn lỗi tạm thời (HTTP ' + res.status + ')', { unknown: true });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!json) throw new CarrierError('Nhanh.vn trả dữ liệu không đọc được (HTTP ' + res.status + ')', { unknown: true });
    if (json.code === 1) return json;
    const code = json.errorCode || '';
    if (code === 'ERR_429') throw new CarrierError('Nhanh.vn giới hạn tốc độ, thử lại sau', { retryable: true });
    if (code === 'ERR_INVALID_ACCESS_TOKEN' || code === 'ERR_403') throw new CarrierError('Nhanh.vn từ chối xác thực (' + code + '): cấp quyền lại cho app (NHANH_ACCESS_TOKEN)');
    const e = new CarrierError(messageOf(json));
    e.nhanhCode = code;
    throw e;
  }
  const messageOf = (j) => {
    const m = j.messages;
    const s = Array.isArray(m) ? m.join('; ') : (m && typeof m === 'object') ? Object.values(m).join('; ') : String(m || '');
    return ('Nhanh.vn từ chối' + (j.errorCode ? ` (${j.errorCode})` : '') + (s ? ': ' + s : '')).slice(0, 300);
  };

  // Kho gửi hàng (nơi hãng lấy/nhận hàng). Lưu tạm 10 phút.
  let depotCache = null;
  async function depot() {
    if (depotCache && Date.now() - depotCache.at < 600_000) return depotCache.value;
    const j = await call('business/depot');
    const d = (j.data || []).find((x) => (depotId ? x.id === depotId : true));
    if (!d) throw new CarrierError('Không tìm thấy kho trong Nhanh.vn (NHANH_DEPOT_ID)');
    const loc = d.locationV2 || {};
    depotCache = { at: Date.now(), value: { id: d.id, name: d.name, mobile: d.mobile, cityId: Number(loc.cityId) || 0, wardId: Number(loc.wardId) || 0 } };
    return depotCache.value;
  }

  // Một lần gọi cước dùng chung cho mọi adapter hãng (cùng tham số trong 20 giây).
  const feeCache = new Map();
  function feeAll(key, body) {
    const hit = feeCache.get(key);
    if (hit && Date.now() - hit.at < 20_000) return hit.p;
    const p = call('shipping/fee', { filters: body }).then((j) => j.data || []);
    feeCache.set(key, { at: Date.now(), p });
    p.catch(() => feeCache.delete(key));
    if (feeCache.size > 200) for (const k of feeCache.keys()) { feeCache.delete(k); if (feeCache.size < 100) break; }
    return p;
  }

  const orderOf = async (nhanhId) => {
    const j = await call('order/list', { filters: { ids: [Number(nhanhId)] }, paginator: { size: 1 } });
    return (j.data || [])[0] || null;
  };

  function viewOf(o) {
    const c = o.carrier || {};
    return { code: String(o.info.id), tracking: c.carrierCode ? String(c.carrierCode) : '', fee: Number(c.shipFee) || 0, status: Number(o.info.status) };
  }

  function make(carrierId) {
    const [short, name] = CARRIERS[carrierId];
    const adapter = {
      id: 'nhanh-' + short,
      name,
      nhanhCarrierId: carrierId,
      capabilities: { dropoff: true, pickup: false, findByReference: true, idempotentCreate: false, webhook: true, poll: true, officeList: false, labelNative: false },

      async quote(req) {
        const d = await depot();
        if (!d.cityId || !d.wardId) throw new CarrierError('Kho trong Nhanh.vn chưa có địa chỉ (tỉnh/phường): cập nhật kho rồi thử lại');
        const to = nhanhLocation(req.to.province, req.to.ward);
        if (!to) return [];
        let cw = req.weightG;
        if (req.dims && req.dims.l && req.dims.w && req.dims.h) cw = Math.max(cw, Math.ceil((req.dims.l * req.dims.w * req.dims.h) / divisor * 1000));
        const body = {
          type: 1, shippingWeight: cw, price: req.declaredValue || 0, totalCod: 0,
          shippingFrom: { cityId: d.cityId, wardId: d.wardId, address: d.name, locationVersion: 'v2' },
          shippingTo: { cityId: to.cityId, wardId: to.wardId, address: '-', locationVersion: 'v2' },
        };
        const rows = await feeAll(JSON.stringify(body), body);
        return rows.filter((r) => r.carrier && Number(r.carrier.id) === carrierId && r.service && Number.isSafeInteger(Number(r.shipFee)) && Number(r.shipFee) > 0).map((r) => {
          const freight = Number(r.shipFee); const insurance = Number(r.declaredFee) || 0; const cod = Number(r.codFee) || 0;
          return {
            service: String(r.service.id), serviceName: String(r.service.name), contract: 'nhanh-shared',
            handovers: ['dropoff'], etaDays: parseEta(r.service.description), chargeableWeightG: cw,
            cost: { total: freight + insurance + cod, breakdown: { freight, surcharge: 0, insurance, serviceFee: cod, vat: 0 } },
            listPrice: null, listPriceVerifiedAt: null, priceToken: null,
          };
        });
      },

      async createShipment(req) {
        if (!productId) throw new CarrierError('Chưa cấu hình NHANH_PRODUCT_ID (sản phẩm mẫu "Hàng gửi 9Ship")');
        const d = await depot();
        const to = nhanhLocation(req.receiver.province, req.receiver.ward);
        if (!to) throw new CarrierError('Không đổi được địa chỉ người nhận sang mã Nhanh.vn');
        const s = req.sender;
        const body = {
          info: { type: 1, depotId: d.id, description: `9Ship ${req.ref} | Người gửi: ${s.contact} ${s.phone} | ${GOODS_NAME[req.goodsType] || 'Hàng hóa'}`.slice(0, 250) },
          channel: { appOrderId: req.ref, sourceName: '9Ship' },
          shippingAddress: { name: req.receiver.contact, mobile: req.receiver.phone, cityId: to.cityId, wardId: to.wardId, address: req.receiver.street, locationVersion: 'v2' },
          carrier: {
            sendCarrierType: 1, id: carrierId, serviceId: Number(req.service), customerShipFee: 0, autoSend: 1,
            orderPackage: { weight: req.weightG, ...(req.request?.dims ? { length: req.request.dims.l, width: req.request.dims.w, height: req.request.dims.h } : {}) },
            ...(req.declaredValue > 0 ? { isDeclaredFee: 1, declaredValue: req.declaredValue } : {}),
          },
          products: [{ id: productId, price: 0, quantity: 1 }],
        };
        const j = await call('order/add', body);
        const data = j.data || {};
        const code = data.id ? String(data.id) : '';
        if (!code) throw new CarrierError('Nhanh.vn không trả mã đơn', { unknown: true });
        if (!data.carrierCode) {
          const err = Array.isArray(data.sendCarrierError) ? data.sendCarrierError.join('; ') : '';
          // Đơn đã có trong Nhanh.vn nhưng chưa gửi hãng: báo lỗi rõ ràng để tiền được nhả, quản trị dọn đơn trong Nhanh.vn
          throw new CarrierError(`Nhanh.vn tạo đơn ${code} nhưng chưa gửi được cho hãng${err ? ': ' + err : ''}`);
        }
        const o = await orderOf(code).catch(() => null);
        const fee = o && viewOf(o).fee > 0 ? viewOf(o).fee : req.expectedFee;
        return { carrierCode: code, trackingCode: String(data.carrierCode), fee, trackingUrl: data.trackingUrl || null };
      },

      async cancel(code) {
        try {
          await call('order/cancelcarrier', { orderId: [Number(code)] });
          return { status: 'confirmed' };
        } catch (e) {
          if (!(e instanceof CarrierError) || e.unknown || e.retryable) throw e;
          if (e.nhanhCode === 'ERR_ORDER_CARRIER_NOT_YET_SENT') return { status: 'confirmed' };
          if (e.nhanhCode === 'ERR_ORDER_CARRIER_NO_API_CANCEL') return { status: 'rejected', reason: 'Hãng không hỗ trợ hủy qua API, cần liên hệ hãng' };
          if (e.nhanhCode === 'ERR_ORDER_CARRIER_REJECT') return { status: 'rejected', reason: e.message };
          throw new CarrierError(e.message, { unknown: true });
        }
      },

      async track(code) {
        const o = await orderOf(code);
        if (!o) throw new CarrierError('Nhanh.vn không tìm thấy đơn ' + code, { unknown: true });
        const v = viewOf(o);
        const status = STATUS_MAP[v.status];
        if (!status) return [];
        const ev = { eventId: `${v.code}:${v.status}`, status, note: '', at: new Date(((o.info.updatedAt) || Date.now() / 1000) * 1000).toISOString() };
        if (v.fee > 0) ev.feeTotal = v.fee;
        return [ev];
      },

      // Quét đơn tạo trong 3 ngày gần nhất tìm đúng mã tham chiếu. null chỉ khi quét xong mà không thấy.
      async findByReference(ref) {
        const from = Math.floor(Date.now() / 1000) - 3 * 86400;
        let next = null;
        for (let page = 0; page < 20; page++) {
          const j = await call('order/list', { filters: { createdAtFrom: from }, paginator: { size: 100, ...(next ? { next } : {}) } });
          const hit = (j.data || []).find((o) => o.channel && o.channel.appOrderId === ref);
          if (hit) {
            const v = viewOf(hit);
            if (!v.tracking) throw new CarrierError(`Đơn ${v.code} có trong Nhanh.vn nhưng chưa có mã vận đơn`, { unknown: true });
            return { carrierCode: v.code, trackingCode: v.tracking, fee: v.fee };
          }
          next = j.paginator && j.paginator.next;
          if (!next || !(j.data || []).length) return null;
        }
        throw new CarrierError('Quá nhiều đơn để tra theo mã tham chiếu', { unknown: true });
      },

      async listPickupPoints() { return []; },

      // Sự kiện đi qua tuyến riêng /v1/webhooks/nhanh (một địa chỉ cho mọi hãng), xem parseNhanhWebhook.
      parseWebhook() { throw new CarrierError('Dùng /v1/webhooks/nhanh'); },
    };
    return adapter;
  }

  return ids.map(make);
}

// Phân tích webhook v3.0: trả [{ adapterId, events }]. Xác thực bằng header Authorization = mã xác thực (so sánh thời gian cố định ở tầng gọi).
export function parseNhanhWebhook(raw) {
  let p;
  try { p = JSON.parse(raw); } catch { throw new CarrierError('webhook không phải JSON'); }
  if (!p || (p.event !== 'orderAdd' && p.event !== 'orderUpdate') || !p.data || !p.data.info) return [];
  const o = p.data; const c = o.carrier || {};
  const adapterId = adapterIdOf(Number(c.id));
  const status = STATUS_MAP[Number(o.info.status)];
  if (!adapterId || !status) return [];
  const ev = {
    eventId: `${o.info.id}:${o.info.status}:${o.info.updatedAt || ''}`, code: String(o.info.id), status, note: '',
    at: new Date(((o.info.updatedAt) || Date.now() / 1000) * 1000).toISOString(),
  };
  if (Number(c.shipFee) > 0) ev.feeTotal = Number(c.shipFee);
  return [{ adapterId, events: [ev] }];
}

export default function create() { return createNhanh(process.env); }
