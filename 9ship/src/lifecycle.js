// Vòng đời đơn sau khi hãng đã tạo: hành trình, điều chỉnh cước, hủy và hoàn tiền, nhả tiền đệm.
import { config } from './config.js';
import { query, tx } from './db.js';
import { ApiError, CarrierError } from './errors.js';
import * as ledger from './ledger.js';
import * as registry from './carriers/index.js';

// Thứ hạng trạng thái vận chuyển: chỉ tiến, không lùi. Trạng thái cuối không đổi nữa.
const RANK = {
  pending_carrier: 0, created: 1, picked_up: 2, in_transit: 3, delivery_failed: 4, returning: 5,
  delivered: 8, returned: 8, lost: 8, cancelled: 8, create_failed: 8,
};
const TERMINAL = new Set(['delivered', 'returned', 'lost', 'cancelled', 'create_failed']);
const KNOWN = new Set(Object.keys(RANK));
const NO_MORE_FEES = new Set(['refunded', 'partially_refunded', 'released']);

export const isTerminal = (s) => TERMINAL.has(s);

const inTx = (c0, fn) => (c0 ? fn(c0) : tx(fn));

// ---------- nhả tiền đệm ----------
export async function releaseBuffer(shipmentId, c0 = null) {
  return inTx(c0, async (c) => {
    const rows = await c.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [shipmentId]);
    const sh = rows[0];
    if (!sh || !sh.buffer_open) return false;
    if (sh.buffer_amount <= 0) {
      await c.query('UPDATE shipments SET buffer_open=false, updated_at=now() WHERE id=$1', [sh.id]);
      return false;
    }
    const walletId = await ledger.lockWallet(c, sh.user_id);
    const bufId = await ledger.userAccount(c, sh.user_id, 'hold_buffer');
    await ledger.post(c, {
      kind: 'release', idemScope: 'buffer-release', idemKey: sh.id, shipmentId: sh.id, payload: { amount: sh.buffer_amount },
      entries: [{ accountId: bufId, amount: sh.buffer_amount }, { accountId: walletId, amount: -sh.buffer_amount }],
    });
    await c.query('UPDATE shipments SET buffer_open=false, buffer_amount=0, updated_at=now() WHERE id=$1', [sh.id]);
    return true;
  });
}

// ---------- điều chỉnh cước (hãng cân/đo lại) ----------
// Chênh lệch tính từ cước tổng mới so với phiên bản cước gần nhất đã ghi nhận.
// Không bao giờ ném lỗi vì ví: hãng đã tính cước thì phải ghi nhận; phần không thu được của khách do 9Ship chịu và đơn bị gắn cờ.
export async function applyFee(shipmentId, newTotal, { source, sourceEventId = null, breakdown = null, listTotal = null, final = false } = {}, c0 = null) {
  if (!Number.isSafeInteger(newTotal) || newTotal < 0) throw new ApiError(400, 'invalid_fee', 'Cước không hợp lệ');
  return inTx(c0, async (c) => {
    const rows = await c.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [shipmentId]);
    const sh = rows[0];
    if (!sh || sh.payment_status === 'held') return { applied: false, reason: 'not_captured' };
    if (NO_MORE_FEES.has(sh.payment_status) || sh.cancel_status === 'confirmed') return { applied: false, reason: 'closed' };
    const walletId = await ledger.lockWallet(c, sh.user_id);

    const last = (await c.query('SELECT version, total FROM carrier_fee_versions WHERE shipment_id=$1 ORDER BY version DESC LIMIT 1', [shipmentId]))[0];
    const prev = last ? last.total : sh.cost_price;
    const version = (last ? last.version : 0) + 1;
    const ins = await c.query(
      `INSERT INTO carrier_fee_versions(shipment_id, version, total, breakdown, source, source_event_id)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
      [shipmentId, version, newTotal, JSON.stringify(breakdown), source, sourceEventId]);
    if (!ins.length) return { applied: false, reason: 'duplicate' };

    const delta = newTotal - prev;
    if (delta === 0) {
      if (final) await releaseBuffer(shipmentId, c);
      return { applied: false, reason: 'no_change', version };
    }

    const revenue = await ledger.systemAccount(c, 'revenue');
    const cost = await ledger.systemAccount(c, 'carrier_cost');
    const deposit = await ledger.systemAccount(c, 'aggregator_deposit');
    let customerDelta;
    let absorbedNow = 0;       // phần 9Ship chịu thêm lần này
    let absorbedBack = 0;      // phần 9Ship được giảm nợ chịu khi cước giảm
    let flag = null;

    if (delta > 0) {
      customerDelta = delta;
      if (listTotal != null) {
        // tổng thu không vượt niêm yết của chính cân đã xác nhận; phần vượt do 9Ship chịu
        const maxCharge = Math.max(sh.sell_price, listTotal);
        customerDelta = Math.max(0, Math.min(delta, maxCharge - sh.sell_price));
        absorbedNow = delta - customerDelta;
      }
      // hạn mức ví: phần không thu được của khách (vượt trần âm) cũng do 9Ship chịu và gắn cờ
      const fromBufferWanted = Math.min(sh.buffer_open ? sh.buffer_amount : 0, customerDelta);
      const walletBal = await ledger.balance(c, walletId);
      const room = Math.max(0, walletBal + config.walletOverdraftCap);
      const needWallet = customerDelta - fromBufferWanted;
      if (needWallet > room) {
        const unpaid = needWallet - room;
        customerDelta -= unpaid;
        absorbedNow += unpaid;
        flag = 'fee_unpaid';
      }
    } else {
      // cước giảm: giảm phần 9Ship đang chịu trước, còn lại hoàn cho khách
      absorbedBack = Math.min(sh.absorbed, -delta);
      customerDelta = delta + absorbedBack; // <= 0
    }

    const entries = [];
    let fromBuffer = 0;
    if (customerDelta > 0) {
      fromBuffer = Math.min(sh.buffer_open ? sh.buffer_amount : 0, customerDelta);
      const bufId = await ledger.userAccount(c, sh.user_id, 'hold_buffer');
      if (fromBuffer > 0) entries.push({ accountId: bufId, amount: fromBuffer });
      if (customerDelta - fromBuffer > 0) entries.push({ accountId: walletId, amount: customerDelta - fromBuffer });
      entries.push({ accountId: revenue, amount: -customerDelta });
    } else if (customerDelta < 0) {
      entries.push({ accountId: revenue, amount: -customerDelta }); // ghi nợ doanh thu
      entries.push({ accountId: walletId, amount: customerDelta }); // ghi có ví
    }
    entries.push({ accountId: cost, amount: delta });
    entries.push({ accountId: deposit, amount: -delta });
    const post = await ledger.post(c, {
      kind: 'adjustment', idemScope: 'fee', idemKey: `${shipmentId}:${version}`, shipmentId, payload: { delta, customerDelta },
      entries,
    });
    const newBufferOpen = (sh.buffer_open ? sh.buffer_amount - fromBuffer : 0) > 0;
    await c.query(
      `UPDATE shipments SET fee_confirmed=$2, cost_price=$2, sell_price = sell_price + $3,
         buffer_amount = buffer_amount - $4, buffer_open = $5, absorbed = absorbed + $6 - $7,
         needs_attention = COALESCE($8, needs_attention), updated_at=now() WHERE id=$1`,
      [shipmentId, newTotal, customerDelta, fromBuffer, newBufferOpen, absorbedNow, absorbedBack, flag]);
    await c.query(
      'INSERT INTO adjustments(shipment_id, kind, amount, reason, ledger_tx_id) VALUES($1,$2,$3,$4,$5)',
      [shipmentId, delta > 0 ? 'increase' : 'decrease', customerDelta,
        `hãng báo cước ${newTotal} (trước đó ${prev})${absorbedNow ? `, 9Ship chịu ${absorbedNow}` : ''}${absorbedBack ? `, giảm phần 9Ship đã chịu ${absorbedBack}` : ''}`, post.txId]);
    if (final) await releaseBuffer(shipmentId, c);
    return { applied: true, delta, customerDelta, absorbed: absorbedNow, absorbedBack, flag, version };
  });
}

// ---------- hủy và hoàn tiền ----------
async function confirmCancel(shipmentId, { feeRetained = 0, note = '' } = {}, c0 = null) {
  return inTx(c0, async (c) => {
    const rows = await c.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [shipmentId]);
    const sh = rows[0];
    if (!sh || sh.cancel_status === 'confirmed') return false;
    if (sh.payment_status !== 'captured') return false;
    const walletId = await ledger.lockWallet(c, sh.user_id);
    const revenue = await ledger.systemAccount(c, 'revenue');
    const cost = await ledger.systemAccount(c, 'carrier_cost');
    const deposit = await ledger.systemAccount(c, 'aggregator_deposit');
    const userFee = Math.min(feeRetained, sh.sell_price);
    const refund = sh.sell_price - userFee;
    const carrierRefund = Math.max(0, (sh.fee_confirmed ?? sh.cost_price) - feeRetained);
    const entries = [];
    if (refund > 0) { entries.push({ accountId: revenue, amount: refund }); entries.push({ accountId: walletId, amount: -refund }); }
    if (carrierRefund > 0) { entries.push({ accountId: deposit, amount: carrierRefund }); entries.push({ accountId: cost, amount: -carrierRefund }); }
    if (entries.length) {
      await ledger.post(c, { kind: 'refund', idemScope: 'cancel-refund', idemKey: sh.id, shipmentId: sh.id, payload: { refund, carrierRefund }, entries });
    }
    if (userFee > 0) {
      await c.query('INSERT INTO adjustments(shipment_id, kind, amount, reason) VALUES($1,$2,$3,$4)', [sh.id, 'cancel_fee', userFee, 'phí hủy do hãng giữ lại']);
    }
    await c.query(
      `UPDATE shipments SET cancel_status='confirmed', shipping_status='cancelled', payment_status=$2,
         closed_at=now(), cancel_note=$3, updated_at=now() WHERE id=$1`,
      [sh.id, userFee > 0 ? 'partially_refunded' : 'refunded', note]);
    await releaseBuffer(sh.id, c);
    await c.query("UPDATE outbox SET status='done' WHERE shipment_id=$1 AND kind='cancel_check'", [sh.id]);
    return true;
  });
}

export async function cancel(userId, shipmentId) {
  if (!/^[0-9a-f-]{36}$/.test(String(shipmentId))) throw new ApiError(404, 'not_found', 'Không tìm thấy đơn');
  const rows = await query('SELECT * FROM shipments WHERE id=$1 AND user_id=$2', [shipmentId, userId]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'Không tìm thấy đơn');
  const sh = rows[0];
  if (sh.cancel_status === 'confirmed' || sh.cancel_status === 'requested') return { status: sh.cancel_status };
  if (sh.shipping_status === 'pending_carrier') throw new ApiError(409, 'not_cancellable', 'Đơn đang được tạo với hãng, vui lòng thử lại sau ít phút');
  if (sh.shipping_status !== 'created') throw new ApiError(409, 'not_cancellable', 'Đơn đã được lấy hàng hoặc đã kết thúc, không thể hủy');

  const upd = await query("UPDATE shipments SET cancel_status='requested', updated_at=now() WHERE id=$1 AND cancel_status IN ('none','rejected') AND shipping_status='created' RETURNING id", [sh.id]);
  if (!upd.length) return { status: 'requested' };
  await query(
    "INSERT INTO outbox(shipment_id, kind, payload, status) VALUES($1,'cancel_check','{}','pending') ON CONFLICT (shipment_id, kind) DO UPDATE SET status='pending', next_at=now(), attempts=0",
    [sh.id]);
  return resolveCancel(sh.id);
}

// Gọi hãng hủy hoặc kiểm tra kết quả; có thể chạy lại nhiều lần.
export async function resolveCancel(shipmentId) {
  const sh = (await query('SELECT * FROM shipments WHERE id=$1', [shipmentId]))[0];
  if (!sh || sh.cancel_status !== 'requested') return { status: sh ? sh.cancel_status : 'none' };
  const adapter = registry.get(sh.carrier);
  if (!adapter) return { status: 'requested' };
  try {
    const r = await adapter.cancel(sh.carrier_code);
    if (r.status === 'confirmed') {
      await confirmCancel(sh.id, { feeRetained: r.feeRetained || 0, note: 'Hãng xác nhận hủy' });
      return { status: 'confirmed' };
    }
    if (r.status === 'rejected') {
      await query("UPDATE shipments SET cancel_status='rejected', cancel_note=$2, updated_at=now() WHERE id=$1", [sh.id, r.reason || 'Hãng từ chối hủy']);
      await query("UPDATE outbox SET status='done' WHERE shipment_id=$1 AND kind='cancel_check'", [sh.id]);
      return { status: 'rejected', reason: r.reason };
    }
  } catch (e) {
    if (!(e instanceof CarrierError)) console.error('[cancel]', e.message);
  }
  return { status: 'requested' };
}

// ---------- nhận sự kiện hành trình (webhook hoặc polling) ----------
// Mỗi sự kiện được ghi và áp dụng trong MỘT giao dịch: nếu áp dụng lỗi thì sự kiện không bị "tiêu thụ" và hãng/polling sẽ gửi lại.
async function ingestOne(carrierId, ev) {
  const at = ev.at ? new Date(ev.at) : new Date();
  return tx(async (c) => {
    const rows = await c.query('SELECT id FROM shipments WHERE carrier=$1 AND carrier_code=$2', [carrierId, ev.code]);
    if (!rows.length) return false;
    const sh = (await c.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [rows[0].id]))[0];
    const ins = await c.query(
      `INSERT INTO tracking_events(shipment_id, carrier_event_id, status, note, event_at, raw)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (shipment_id, carrier_event_id) DO NOTHING RETURNING id`,
      [sh.id, ev.eventId, ev.status, String(ev.note || '').slice(0, 300), isNaN(at) ? new Date() : at, JSON.stringify(ev)]);
    if (!ins.length) return false; // sự kiện trùng: không áp dụng lại

    if (ev.feeTotal !== undefined && ev.status !== 'cancelled') {
      if (Number.isSafeInteger(ev.feeTotal) && ev.feeTotal >= 0) {
        let listTotal = ev.listTotal ?? null;
        if (listTotal == null && Number.isFinite(ev.weightG)) listTotal = await listPriceFor(c, sh, ev.weightG);
        await applyFee(sh.id, ev.feeTotal, { source: 'webhook', sourceEventId: ev.eventId, listTotal, final: Boolean(ev.feeFinal) }, c);
      } else {
        await c.query("UPDATE shipments SET needs_attention='fee_invalid' WHERE id=$1", [sh.id]);
      }
    }
    if (ev.status === 'fee_update') return true;

    const cur = (await c.query('SELECT shipping_status, cancel_status FROM shipments WHERE id=$1', [sh.id]))[0];

    if (ev.status === 'cancelled') {
      if (cur.cancel_status === 'confirmed') return true;
      if (cur.shipping_status === 'created') {
        // hãng xác nhận hủy (theo yêu cầu của khách) hoặc tự hủy vì không lấy được hàng: hoàn tiền
        await confirmCancel(sh.id, { feeRetained: ev.feeTotal ?? 0, note: ev.note || 'Hãng hủy đơn' }, c);
      } else if (!TERMINAL.has(cur.shipping_status)) {
        await c.query("UPDATE shipments SET needs_attention='carrier_cancelled', updated_at=now() WHERE id=$1", [sh.id]);
      }
      return true;
    }

    // chỉ tiến theo thứ hạng
    if (TERMINAL.has(cur.shipping_status)) return true;
    if ((RANK[ev.status] ?? 0) <= (RANK[cur.shipping_status] ?? 0)) return true;
    const closed = TERMINAL.has(ev.status);
    await c.query(
      `UPDATE shipments SET shipping_status=$2, closed_at = CASE WHEN $3 THEN now() ELSE closed_at END,
         cancel_status = CASE WHEN cancel_status='requested' AND $4 THEN 'rejected' ELSE cancel_status END, updated_at=now()
       WHERE id=$1`,
      [sh.id, ev.status, closed, RANK[ev.status] >= RANK.picked_up]);
    return true;
  });
}

// Giá niêm yết công bố theo cân hãng đã xác nhận (nếu hãng cho biết cân và bảng giá có dữ liệu).
async function listPriceFor(c, sh, weightG) {
  const route = `${sh.sender.province}>${sh.receiver.province}`;
  const r = await c.query(
    `SELECT price FROM list_prices WHERE carrier=$1 AND service=$2 AND route IN ($3,'*') AND max_weight_g >= $4
      ORDER BY (route='*') ASC, max_weight_g ASC LIMIT 1`, [sh.carrier, sh.service, route, weightG]);
  return r.length ? r[0].price : null;
}

export async function ingest(carrierId, events) {
  let accepted = 0;
  for (const ev of events) {
    if (!KNOWN.has(ev.status) && ev.status !== 'fee_update') continue;
    if (await ingestOne(carrierId, ev)) accepted += 1;
  }
  return accepted;
}

// ---------- việc định kỳ ----------
// Hãng không có webhook: hỏi hành trình định kỳ.
export async function pollTracking({ everySec = 300, limit = 50 } = {}) {
  const rows = await query(
    `SELECT s.id, s.carrier, s.carrier_code FROM shipments s
      WHERE s.shipping_status IN ('created','picked_up','in_transit','delivery_failed','returning')
        AND (s.polled_at IS NULL OR s.polled_at < now() - ($1 || ' seconds')::interval)
      ORDER BY s.polled_at NULLS FIRST LIMIT $2`, [String(everySec), limit]);
  let n = 0;
  for (const r of rows) {
    const adapter = registry.get(r.carrier);
    await query('UPDATE shipments SET polled_at=now() WHERE id=$1', [r.id]);
    if (!adapter || adapter.capabilities.webhook) continue;
    try {
      const events = await adapter.track(r.carrier_code);
      n += await ingest(r.carrier, events.map((e) => ({ ...e, code: r.carrier_code })));
    } catch (e) {
      console.error('[poll]', r.id, e.message); // sự kiện chưa bị tiêu thụ nên lần sau sẽ thử lại
    }
  }
  return n;
}

// Hết hạn đệm: sau khi đơn kết thúc đủ lâu mà hãng không báo cước cuối thì nhả đệm.
export async function releaseExpiredBuffers() {
  const rows = await query(
    `SELECT id FROM shipments WHERE buffer_open = true AND closed_at IS NOT NULL
        AND closed_at < now() - ($1 || ' hours')::interval LIMIT 100`, [String(config.bufferTtlHours)]);
  let n = 0;
  for (const r of rows) if (await releaseBuffer(r.id)) n += 1;
  return n;
}
