// Adapter Giao Hàng Tiết Kiệm (GHTK), viết theo tài liệu chính thức https://api.ghtk.vn/docs/ :
//   tính phí  GET  /services/shipment/fee            đăng đơn  POST /services/shipment/order
//   hủy đơn   GET  /services/shipment/cancel/{mã}    trạng thái GET /services/shipment/v2/{mã}
//   in nhãn   GET  /services/label/{mã}              webhook    POST về URL của bạn, xác thực bằng tham số ?hash=
// Cần: GHTK_TOKEN (Token) và GHTK_PARTNER_CODE (X-Client-Source) lấy trong tài khoản GHTK.
// CHƯA kiểm chứng với tài khoản/sandbox thật: chạy `npm run ghtk:check` trước khi bật (xem docs/SETUP-CHECKLIST.md).
import crypto from 'node:crypto';
import { CarrierError } from '../errors.js';
import { PROVINCES, zoneOf } from '../geo.js';

const DEFAULT_BASE = 'https://services.giaohangtietkiem.vn';
const GOODS_NAME = {
  general: 'Hàng hóa', document: 'Tài liệu', clothes: 'Quần áo, giày dép', electronics: 'Đồ điện tử',
  food_dry: 'Thực phẩm khô', cosmetics: 'Mỹ phẩm', fragile: 'Hàng dễ vỡ',
};

// Mã trạng thái GHTK -> trạng thái của 9Ship. Mã chưa biết bị bỏ qua (không làm đổi trạng thái đơn).
// Nguồn: bảng trạng thái trong tài liệu GHTK; phải đối chiếu lại với sandbox khi có tài khoản.
export const STATUS_MAP = {
  '-1': 'cancelled',
  1: 'created', 2: 'created', 12: 'created', 7: 'created', 8: 'created', 127: 'created', 128: 'created',
  3: 'picked_up', 123: 'picked_up',
  4: 'in_transit', 10: 'in_transit', 45: 'in_transit', 410: 'in_transit',
  5: 'delivered', 6: 'delivered',
  9: 'delivery_failed', 49: 'delivery_failed',
  20: 'returning', 13: 'lost',
  21: 'returned', 11: 'returned',
};

const ETA = { // ngày, ước lượng theo tuyến (GHTK không trả thời gian giao trong API tính phí)
  road: { noi_tinh: [1, 2], noi_mien: [2, 3], lien_mien: [3, 5] },
  fly: { noi_tinh: [1, 1], noi_mien: [1, 2], lien_mien: [2, 3] },
};
const SERVICES = { road: 'Đường bộ', fly: 'Đường bay (nhanh)' };

function parseVnTime(s) {
  if (!s) return new Date().toISOString();
  const t = String(s).trim();
  const m = t.match(/^(\d{2,4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const y = m[1].length === 2 ? '20' + m[1] : m[1];
    const d = new Date(`${y}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
    if (!isNaN(d)) return d.toISOString();
  }
  const d = new Date(t);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

export function createGhtk(env = process.env, fetchImpl = globalThis.fetch) {
  const token = env.GHTK_TOKEN;
  if (!token) return null;
  const base = (env.GHTK_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  const partner = env.GHTK_PARTNER_CODE || '';
  const timeoutMs = Number.parseInt(env.GHTK_TIMEOUT_MS || '15000', 10);
  const divisor = Number.parseInt(env.GHTK_VOLUME_DIVISOR || '6000', 10);
  const hashSecret = env.GHTK_WEBHOOK_HASH || '';
  let aliases = {};
  try { aliases = JSON.parse(env.GHTK_PROVINCE_ALIASES || '{}'); } catch { /* bỏ qua */ }

  // Tên tỉnh gửi cho GHTK: mặc định tên không có tiền tố "TP"; ghi đè bằng GHTK_PROVINCE_ALIASES nếu GHTK dùng tên khác.
  const provinceName = (code) => {
    if (aliases[code]) return aliases[code];
    const p = PROVINCES.find((x) => x.code === code);
    return p ? p.name.replace(/^TP\s+/, '') : code;
  };

  async function call(method, path, { query, body, raw = false } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { Token: token, 'X-Client-Source': partner, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
    } catch (e) {
      // không biết GHTK đã nhận hay chưa
      throw new CarrierError('GHTK không phản hồi: ' + (e.name === 'AbortError' ? 'quá thời gian' : e.message), { unknown: true });
    } finally { clearTimeout(timer); }
    if (res.status >= 500 || res.status === 429) throw new CarrierError('GHTK lỗi tạm thời (HTTP ' + res.status + ')', { unknown: true });
    // sai khóa/đối tác: lỗi cấu hình, phải hiện ra cho quản trị chứ không được im lặng trả về "không có dịch vụ"
    if (res.status === 401 || res.status === 403) throw new CarrierError('GHTK từ chối xác thực (HTTP ' + res.status + '): kiểm tra GHTK_TOKEN và GHTK_PARTNER_CODE');
    if (raw) return res;
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!json) throw new CarrierError('GHTK trả dữ liệu không đọc được (HTTP ' + res.status + ')', { unknown: true });
    return { status: res.status, json };
  }

  const msg = (j) => String((j && j.message) || 'GHTK từ chối');

  const adapter = {
    id: 'ghtk',
    name: 'Giao Hàng Tiết Kiệm',
    capabilities: { dropoff: true, pickup: true, findByReference: true, idempotentCreate: true, webhook: true, poll: true, officeList: false, labelNative: false },

    async quote(req) {
      const w = req.weightG;
      let cw = w;
      if (req.dims && req.dims.l && req.dims.w && req.dims.h) cw = Math.max(w, Math.ceil((req.dims.l * req.dims.w * req.dims.h) / divisor * 1000));
      const zone = zoneOf(req.from.province, req.to.province);
      const results = await Promise.all(Object.keys(SERVICES).map(async (transport) => {
        const { json } = await call('GET', '/services/shipment/fee', {
          query: {
            pick_province: provinceName(req.from.province), pick_ward: req.from.ward || undefined,
            province: provinceName(req.to.province), ward: req.to.ward || undefined,
            weight: cw, value: req.declaredValue || undefined, transport,
          },
        });
        if (!json.success || !json.fee || json.fee.delivery === false) return null;
        const fee = Number(json.fee.fee);
        const insurance = Number(json.fee.insurance_fee || 0);
        if (!Number.isSafeInteger(fee) || fee <= 0 || !Number.isSafeInteger(insurance)) return null;
        return {
          service: transport, serviceName: SERVICES[transport], contract: 'ghtk-main',
          handovers: ['dropoff', 'pickup'], etaDays: ETA[transport][zone], chargeableWeightG: cw,
          cost: { total: fee + insurance, breakdown: { freight: fee, surcharge: 0, insurance, serviceFee: 0, vat: 0 } },
          listPrice: null, listPriceVerifiedAt: null, priceToken: null,
        };
      }));
      return results.filter(Boolean);
    },

    async createShipment(req) {
      const s = req.sender;
      const r = req.receiver;
      const body = {
        products: [{ name: GOODS_NAME[req.goodsType] || 'Hàng hóa', weight: req.weightG / 1000, quantity: 1 }],
        order: {
          id: req.ref,
          pick_name: s.contact, pick_address: s.street, pick_province: provinceName(s.province), pick_ward: s.ward, pick_tel: s.phone,
          name: r.contact, address: r.street, province: provinceName(r.province), ward: r.ward, hamlet: 'Khác', tel: r.phone,
          // 9Ship đã thu cước của khách qua ví nên GHTK không thu COD và cước tính vào tài khoản 9Ship
          pick_money: 0, is_freeship: 1, value: req.declaredValue || 0,
          transport: req.service === 'fly' ? 'fly' : 'road',
          pick_option: req.handover === 'dropoff' ? 'post' : 'cod',
          note: ('9Ship ' + req.ref).slice(0, 120),
        },
      };
      const { json } = await call('POST', '/services/shipment/order', { body });
      if (json.success && json.order) {
        const o = json.order;
        const fee = Number(o.fee) + Number(o.insurance_fee || 0);
        return { carrierCode: String(o.label), trackingCode: String(o.label), fee, breakdown: { freight: Number(o.fee), surcharge: 0, insurance: Number(o.insurance_fee || 0), serviceFee: 0, vat: 0 } };
      }
      // đơn đã tồn tại (gọi lại cùng mã tham chiếu): lấy đơn cũ thay vì báo lỗi, để việc tạo đơn idempotent
      if (json.error && json.error.code === 'ORDER_ID_EXIST') {
        const existing = await adapter.findByReference(req.ref);
        if (existing) return existing;
        throw new CarrierError('GHTK báo mã đơn đã tồn tại nhưng không tra được đơn', { unknown: true });
      }
      throw new CarrierError(msg(json));
    },

    async cancel(code) {
      const { json } = await call('GET', '/services/shipment/cancel/' + encodeURIComponent(code));
      if (json.success) return { status: 'confirmed' };
      const m = msg(json);
      if (/đã (ở trạng thái )?hủy|đã huỷ/i.test(m)) return { status: 'confirmed' };
      if (/đã lấy hàng|không thể hủy|không thể huỷ/i.test(m)) return { status: 'rejected', reason: m };
      throw new CarrierError(m, { unknown: true });
    },

    async track(code) {
      const { json } = await call('GET', '/services/shipment/v2/' + encodeURIComponent(code));
      if (!json.success || !json.order) throw new CarrierError(msg(json), { unknown: true });
      const o = json.order;
      const mapped = STATUS_MAP[String(o.status)];
      if (!mapped) return [];
      const ev = {
        eventId: `${o.label_id || code}:${o.status}`, status: mapped, note: o.status_text || '',
        at: parseVnTime(o.modified || o.created),
      };
      const money = Number(o.ship_money);
      if (Number.isSafeInteger(money) && money > 0) ev.feeTotal = money + (Number.isSafeInteger(Number(o.insurance)) ? Number(o.insurance) : 0);
      return [ev];
    },

    async findByReference(ref) {
      const { json } = await call('GET', '/services/shipment/v2/' + encodeURIComponent('partner_id:' + ref));
      if (json.success && json.order) {
        const o = json.order;
        const money = Number(o.ship_money);
        return { carrierCode: String(o.label_id), trackingCode: String(o.label_id), fee: Number.isSafeInteger(money) ? money + (Number(o.insurance) || 0) : 0 };
      }
      if (/không tìm thấy|không tồn tại|not found/i.test(msg(json))) return null; // GHTK xác nhận chưa có đơn
      throw new CarrierError(msg(json), { unknown: true });
    },

    async listPickupPoints() { return []; },

    // GHTK gọi POST về URL đã đăng ký, thân dạng form, xác thực bằng tham số ?hash= do bạn đặt trong URL.
    parseWebhook(headers, raw, query = {}) {
      if (!hashSecret) throw new CarrierError('chưa cấu hình GHTK_WEBHOOK_HASH');
      const a = Buffer.from(String(query.hash || ''));
      const b = Buffer.from(hashSecret);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new CarrierError('hash webhook không hợp lệ');
      const p = new URLSearchParams(raw);
      const label = p.get('label_id');
      const statusId = p.get('status_id');
      const mapped = STATUS_MAP[String(statusId)];
      if (!label || !mapped) return [];
      const ev = {
        eventId: `${label}:${statusId}:${p.get('action_time') || ''}`, code: label, status: mapped,
        at: parseVnTime(p.get('action_time')), note: p.get('reason') || '',
      };
      const kg = Number(p.get('weight'));
      if (Number.isFinite(kg) && kg > 0) ev.weightG = Math.round(kg * 1000);
      return [ev];
    },

    // Nhãn PDF gốc của GHTK (A6/A5). Dùng khi muốn in đúng nhãn của hãng thay vì nhãn của 9Ship.
    async getLabel(code, { size = 'A6' } = {}) {
      const res = await call('GET', '/services/label/' + encodeURIComponent(code), { query: { page_size: size }, raw: true });
      if (!res.ok) throw new CarrierError('GHTK không trả được nhãn (HTTP ' + res.status + ')');
      return Buffer.from(await res.arrayBuffer());
    },
  };
  return adapter;
}

export default function create() {
  const a = createGhtk(process.env);
  return a ? [a] : [];
}
