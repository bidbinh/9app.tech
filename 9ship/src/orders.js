import crypto from 'node:crypto';
import { config } from './config.js';
import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import * as ledger from './ledger.js';
import * as registry from './carriers/index.js';
import { quoteAll, publicOffer } from './rating.js';
import { cleanParty } from './party.js';
import * as addresses from './addresses.js';
import { signLabel } from './labels.js';

function bad(msg, field) { return new ApiError(400, 'invalid_request', msg, { field }); }

export function newCarrierRef() {
  return '9S' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

export function bufferFor(sell) {
  return Math.max(config.bufferMin, Math.ceil((sell * config.bufferPct) / 100 / 500) * 500);
}

export function shipmentView(row, { events = [], carrierName } = {}) {
  const label = row.tracking_code && ['created', 'picked_up', 'in_transit', 'delivered', 'delivery_failed', 'returning', 'returned'].includes(row.shipping_status)
    ? `${config.basePath}/v1/labels/${signLabel(row.id, 3600)}` : null;
  return {
    id: row.id,
    carrier: row.carrier,
    carrierName: carrierName || registry.get(row.carrier)?.name || row.carrier,
    service: row.service,
    serviceName: (row.offer && row.offer.serviceName) || row.service,
    handover: row.handover,
    pickupPointId: row.pickup_point_id,
    trackingCode: row.tracking_code,
    shippingStatus: row.shipping_status,
    cancelStatus: row.cancel_status,
    paymentStatus: row.payment_status,
    weightG: row.weight_g,
    declaredValue: row.declared_value,
    goodsType: row.goods_type,
    sellPrice: row.sell_price,
    listPrice: row.list_price,
    held: row.payment_status === 'held' ? row.hold_amount : 0,
    bufferHeld: row.buffer_open ? row.buffer_amount : 0,
    charged: ['captured', 'partially_refunded'].includes(row.payment_status) ? row.sell_price : 0,
    needsAttention: Boolean(row.needs_attention),
    sender: row.sender,
    receiver: row.receiver,
    labelUrl: label,
    createdAt: row.created_at,
    events: events.map((e) => ({ status: e.status, note: e.note, at: e.event_at })),
  };
}

async function fetchEvents(id) {
  return query('SELECT status, note, event_at FROM tracking_events WHERE shipment_id=$1 ORDER BY event_at, id', [id]);
}

export async function get(userId, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new ApiError(404, 'not_found', 'Không tìm thấy đơn');
  const rows = await query('SELECT * FROM shipments WHERE id=$1 AND user_id=$2', [id, userId]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'Không tìm thấy đơn');
  return shipmentView(rows[0], { events: await fetchEvents(id) });
}

export async function list(userId, { limit = 30 } = {}) {
  const rows = await query('SELECT * FROM shipments WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, Math.min(100, limit)]);
  return rows.map((r) => shipmentView(r));
}

// Kiểm tra lại giá hãng trước khi giữ tiền (khi hãng không cấp token giá).
async function reprice(request, offer) {
  if (offer.priceToken) return { cost: offer.costTotal, drift: 0 };
  const adapter = registry.get(offer.carrier);
  if (!adapter) throw new ApiError(400, 'carrier_unavailable', 'Hãng không còn khả dụng');
  let now;
  try {
    const offers = await Promise.race([
      adapter.quote({ ...request, handover: request.handover }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), config.carrierTimeoutMs).unref()),
    ]);
    now = offers.find((o) => o.service === offer.service && o.contract === offer.contract);
  } catch {
    return { cost: offer.costTotal, drift: 0 }; // không hỏi lại được: tiếp tục, worker xử lý
  }
  if (!now) throw new ApiError(409, 'offer_gone', 'Dịch vụ này không còn khả dụng, hãy báo giá lại');
  return { cost: now.cost.total, drift: now.cost.total - offer.costTotal };
}

export async function create(userId, input, idemKey) {
  if (typeof idemKey !== 'string' || idemKey.length < 8 || idemKey.length > 80) {
    throw bad('Cần header Idempotency-Key (8-80 ký tự)', 'idempotency-key');
  }
  if (!input || typeof input !== 'object') throw bad('Thiếu nội dung');
  const sender = cleanParty(input.sender, 'sender');
  const receiver = cleanParty(input.receiver, 'receiver');
  const payloadHash = ledger.hashPayload({ q: input.quoteId, o: input.offerId, s: sender, r: receiver, p: input.pickupPointId || null });

  const replay = async () => {
    const ex = await query('SELECT * FROM shipments WHERE user_id=$1 AND idem_key=$2', [userId, idemKey]);
    if (!ex.length) return null;
    if (ex[0].payload_hash !== payloadHash) throw new ApiError(409, 'idempotency_conflict', 'Khóa đã dùng cho yêu cầu khác nội dung');
    return ex[0];
  };
  const prev = await replay();
  if (prev) return { shipment: prev, replay: true };

  if (!/^[0-9a-f-]{36}$/.test(String(input.quoteId))) throw new ApiError(404, 'quote_not_found', 'Không thấy báo giá');
  const qrows = await query('SELECT * FROM quotes WHERE id=$1', [input.quoteId]);
  if (!qrows.length || (qrows[0].user_id && qrows[0].user_id !== userId)) throw new ApiError(404, 'quote_not_found', 'Không thấy báo giá');
  const quote = qrows[0];
  if (new Date(quote.expires_at) < new Date()) throw new ApiError(410, 'quote_expired', 'Báo giá đã hết hạn, hãy báo giá lại');
  const offer = quote.offers.find((o) => o.offerId === input.offerId);
  if (!offer) throw bad('offerId không thuộc báo giá này', 'offerId');
  const request = quote.request;

  let pickupPointId = null;
  if (input.pickupPointId) {
    const pp = await query('SELECT id FROM pickup_points WHERE id=$1 AND carrier=$2', [String(input.pickupPointId), offer.carrier]);
    if (!pp.length) throw bad('Điểm nhận gửi không thuộc hãng đã chọn', 'pickupPointId');
    pickupPointId = pp[0].id;
  }
  if (request.handover === 'dropoff' && !pickupPointId && offer.pickupPoints?.length) pickupPointId = offer.pickupPoints[0].id;

  // Giá hãng đổi so với báo giá?
  const rp = await reprice(request, offer);
  if (rp.drift > Math.round((offer.costTotal * config.priceDriftPct) / 100)) {
    const fresh = await quoteAll(request, { userId });
    throw new ApiError(409, 'price_changed', 'Giá của hãng đã thay đổi, vui lòng xác nhận giá mới', { quote: fresh });
  }
  const cost = rp.cost;
  const sell = offer.sellPrice;
  const buffer = bufferFor(sell);
  const carrierRef = newCarrierRef();

  try {
    const shipment = await tx(async (c) => {
      const walletId = await ledger.lockWallet(c, userId);
      if ((await ledger.balance(c, walletId)) < 0) throw new ApiError(402, 'wallet_negative', 'Ví đang âm, hãy nạp tiền trước khi gửi');
      const holdId = await ledger.userAccount(c, userId, 'user_hold');
      const bufId = await ledger.userAccount(c, userId, 'hold_buffer');
      const ins = await c.query(
        `INSERT INTO shipments(user_id, quote_id, idem_key, payload_hash, carrier, service, contract, carrier_ref, handover,
           pickup_point_id, goods_type, declared_value, weight_g, price_book_version, cost_price, sell_price, list_price,
           hold_amount, buffer_amount, buffer_open, sender, receiver, offer, request)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,false,$20,$21,$22,$23) RETURNING *`,
        [userId, quote.id, idemKey, payloadHash, offer.carrier, offer.service, offer.contract, carrierRef, request.handover,
          pickupPointId, request.goodsType, request.declaredValue, request.weightG, offer.priceBookVersion || '', cost, sell,
          offer.capVerified ? offer.listPrice : null, sell, buffer, JSON.stringify(sender), JSON.stringify(receiver),
          JSON.stringify({ service: offer.service, serviceName: offer.serviceName, contract: offer.contract, priceToken: offer.priceToken, costTotal: cost }),
          JSON.stringify(request)]);
      const sh = ins[0];
      await ledger.post(c, {
        kind: 'hold', idemScope: 'hold:' + userId, idemKey, shipmentId: sh.id,
        payload: { shipment: sh.id },
        entries: [
          { accountId: walletId, amount: sell + buffer },
          { accountId: holdId, amount: -sell },
          { accountId: bufId, amount: -buffer },
        ],
      });
      await c.query("INSERT INTO outbox(shipment_id, kind, payload) VALUES($1,'create_shipment','{}')", [sh.id]);
      // tự lưu vào sổ địa chỉ để lần sau chọn nhanh; người gửi đầu tiên trở thành mặc định
      await addresses.upsert(c, userId, sender, { touch: true, makeDefaultIfNone: true, lat: request.from.lat ?? null, lng: request.from.lng ?? null });
      await addresses.upsert(c, userId, receiver, { touch: true });
      return sh;
    });
    return { shipment, replay: false };
  } catch (e) {
    // hai yêu cầu cùng khóa chạy song song: yêu cầu thua đọc lại kết quả của yêu cầu thắng
    if (e && e.code === '23505') {
      const again = await replay();
      if (again) return { shipment: again, replay: true };
    }
    throw e;
  }
}

export { publicOffer };
