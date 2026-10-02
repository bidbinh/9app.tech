import { config } from './config.js';
import { query, tx } from './db.js';
import * as ledger from './ledger.js';
import * as registry from './carriers/index.js';
import { CarrierError } from './errors.js';
import * as lifecycle from './lifecycle.js';

const LEASE_SEC = 120;
const MAX_ATTEMPTS = 4;
// confirmations: số lần tra cứu liên tiếp đều "hãng chưa có đơn" mới được nhả tiền (hãng có thể tra cứu chậm đồng bộ).
export const workerOpts = { reconcileMinAgeMs: 120_000, confirmations: 2 };

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); t.unref?.(); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function claim(limit = 10, shipmentId = null) {
  return query(
    `WITH due AS (
       SELECT id, status AS prev FROM outbox
        WHERE status IN ('pending','processing','reconcile') AND next_at <= now()
          AND ($3::uuid IS NULL OR shipment_id = $3::uuid)
        ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
     UPDATE outbox o SET status='processing', attempts = o.attempts + 1,
            next_at = now() + ($1 || ' seconds')::interval
       FROM due WHERE o.id = due.id
     RETURNING o.id, o.shipment_id, o.kind, o.attempts, o.payload, due.prev AS status`,
    [String(LEASE_SEC), limit, shipmentId],
  );
}

async function setOutbox(id, status, { delaySec = 0, error = null } = {}) {
  await query(
    "UPDATE outbox SET status=$2, last_error=$3, next_at = now() + ($4 || ' seconds')::interval WHERE id=$1",
    [id, status, error, String(delaySec)],
  );
}

const backoff = (attempts) => Math.min(600, 15 * 2 ** (attempts - 1));

// Hãng đã tạo đơn: chốt tiền cước thật, giữ lại phần đệm.
export async function onCreated(shipment, result) {
  await tx(async (c) => {
    const rows = await c.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [shipment.id]);
    const sh = rows[0];
    if (sh.payment_status !== 'held') return; // đã xử lý rồi (chạy lại an toàn)
    const walletId = await ledger.lockWallet(c, sh.user_id);
    void walletId;
    const holdId = await ledger.userAccount(c, sh.user_id, 'user_hold');
    const revenue = await ledger.systemAccount(c, 'revenue');
    const cost = await ledger.systemAccount(c, 'carrier_cost');
    const deposit = await ledger.systemAccount(c, 'aggregator_deposit');
    const fee = result.fee;
    await ledger.post(c, {
      kind: 'capture', idemScope: 'capture', idemKey: sh.id, shipmentId: sh.id, payload: { fee },
      entries: [
        { accountId: holdId, amount: sh.sell_price },
        { accountId: revenue, amount: -sh.sell_price },
        { accountId: cost, amount: fee },
        { accountId: deposit, amount: -fee },
      ],
    });
    const drift = fee - sh.cost_price;
    const tolerance = Math.round((sh.cost_price * config.priceDriftPct) / 100);
    await c.query(
      `UPDATE shipments SET carrier_code=$2, tracking_code=$3, shipping_status='created', payment_status='captured',
         fee_confirmed=$4, cost_price=$4, buffer_open=true, closed_at=NULL, updated_at=now(),
         needs_attention = CASE WHEN $5 > $6 THEN 'fee_drift' ELSE needs_attention END
       WHERE id=$1`,
      [sh.id, result.carrierCode, result.trackingCode || result.carrierCode, fee, drift, tolerance]);
    await c.query(
      `INSERT INTO carrier_fee_versions(shipment_id, version, total, breakdown, source) VALUES($1,1,$2,$3,'create')
       ON CONFLICT DO NOTHING`,
      [sh.id, fee, JSON.stringify(result.breakdown || null)]);
    await c.query(
      `INSERT INTO tracking_events(shipment_id, carrier_event_id, status, note, event_at, raw)
       VALUES($1,'create','created','Đã tạo đơn', now(), NULL) ON CONFLICT DO NOTHING`, [sh.id]);
    await c.query("UPDATE outbox SET status='done', last_error=NULL WHERE shipment_id=$1 AND kind='create_shipment'", [sh.id]);
  });
}

// Hãng không tạo đơn: nhả toàn bộ tiền giữ về ví.
export async function onFailed(shipmentId, reason) {
  await tx(async (c) => {
    const rows = await c.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [shipmentId]);
    const sh = rows[0];
    if (sh.payment_status !== 'held') return;
    const walletId = await ledger.lockWallet(c, sh.user_id);
    const holdId = await ledger.userAccount(c, sh.user_id, 'user_hold');
    const bufId = await ledger.userAccount(c, sh.user_id, 'hold_buffer');
    await ledger.post(c, {
      kind: 'release', idemScope: 'release', idemKey: sh.id, shipmentId: sh.id, payload: { reason },
      entries: [
        { accountId: holdId, amount: sh.hold_amount },
        { accountId: bufId, amount: sh.buffer_amount },
        { accountId: walletId, amount: -(sh.hold_amount + sh.buffer_amount) },
      ],
    });
    await c.query(
      `UPDATE shipments SET shipping_status='create_failed', payment_status='released', buffer_open=false,
         needs_attention=NULL, updated_at=now() WHERE id=$1`, [sh.id]);
    await c.query("UPDATE outbox SET status='done', last_error=$2 WHERE shipment_id=$1 AND kind='create_shipment'", [sh.id, reason]);
  });
}

function buildCreateRequest(sh) {
  return {
    ref: sh.carrier_ref,
    expectedFee: sh.cost_price,
    service: sh.service,
    contract: sh.contract,
    priceToken: sh.offer?.priceToken ?? null,
    weightG: sh.weight_g,
    declaredValue: sh.declared_value,
    goodsType: sh.goods_type,
    handover: sh.handover,
    pickupPointId: sh.pickup_point_id,
    sender: sh.sender,
    receiver: sh.receiver,
    request: sh.request,
  };
}

async function markAttention(sh, outboxId, note) {
  await query('UPDATE shipments SET needs_attention=$2, updated_at=now() WHERE id=$1', [sh.id, note]);
  await setOutbox(outboxId, 'attention', { delaySec: 3600, error: note });
}

// Xử lý một công việc tạo đơn. Mọi nhánh đều an toàn khi chạy lại.
async function processCreate(job) {
  const sh = (await query('SELECT * FROM shipments WHERE id=$1', [job.shipment_id]))[0];
  if (!sh || sh.payment_status !== 'held') { await setOutbox(job.id, 'done'); return 'skipped'; }
  const adapter = registry.get(sh.carrier);
  if (!adapter) {
    // Không biết hãng đã nhận đơn chưa (có thể do cấu hình CARRIER_MODULES bị lỗi sau khi khởi động lại): không nhả tiền.
    await markAttention(sh, job.id, 'adapter_missing');
    return 'attention';
  }

  const ageMs = Date.now() - new Date(sh.created_at).getTime();
  const reconciling = job.status === 'reconcile' || job.attempts > 1;

  // Có thể lần trước đã tới hãng mà ta không biết: tra theo mã tham chiếu trước.
  if (reconciling && adapter.capabilities.findByReference) {
    let found = null;
    let lookupOk = true;
    try { found = await adapter.findByReference(sh.carrier_ref); } catch { lookupOk = false; }
    if (found) { await onCreated(sh, found); return 'created'; }
    if (job.status === 'reconcile') {
      if (lookupOk && ageMs >= workerOpts.reconcileMinAgeMs) {
        const nulls = ((job.payload && job.payload.nullLookups) || 0) + 1;
        if (nulls >= workerOpts.confirmations) { await onFailed(sh.id, 'đối soát: hãng chưa có đơn'); return 'failed'; }
        await query("UPDATE outbox SET payload = jsonb_set(payload, '{nullLookups}', to_jsonb($2::int)) WHERE id=$1", [job.id, nulls]);
      }
      await setOutbox(job.id, 'reconcile', { delaySec: 30 });
      return 'reconciling';
    }
  } else if (job.status === 'reconcile') {
    // hãng không tra được theo tham chiếu: không tự nhả tiền
    if (ageMs >= config.unknownCreateHours * 3600_000) { await markAttention(sh, job.id, 'create_unknown'); return 'attention'; }
    await setOutbox(job.id, 'reconcile', { delaySec: 60 });
    return 'reconciling';
  } else if (reconciling && !adapter.capabilities.idempotentCreate) {
    await markAttention(sh, job.id, 'create_unknown');
    return 'attention';
  }

  try {
    const res = await withTimeout(adapter.createShipment(buildCreateRequest(sh)), config.createTimeoutMs);
    await onCreated(sh, res);
    return 'created';
  } catch (e) {
    const known = e instanceof CarrierError && !e.unknown;
    if (known && !e.retryable) { await onFailed(sh.id, String(e.message).slice(0, 200)); return 'failed'; }
    if (known && e.retryable) {
      if (job.attempts >= MAX_ATTEMPTS) { await onFailed(sh.id, 'hết số lần thử: ' + e.message); return 'failed'; }
      await setOutbox(job.id, 'pending', { delaySec: backoff(job.attempts), error: String(e.message).slice(0, 200) });
      return 'retry';
    }
    // không rõ hãng đã nhận chưa (timeout, mất kết nối, lỗi lạ)
    await setOutbox(job.id, 'reconcile', { delaySec: 30, error: String(e.message).slice(0, 200) });
    return 'unknown';
  }
}

async function processCancelCheck(job) {
  const r = await lifecycle.resolveCancel(job.shipment_id);
  if (r.status === 'requested') {
    if (job.attempts >= 30) {
      await query("UPDATE shipments SET needs_attention='cancel_unknown' WHERE id=$1", [job.shipment_id]);
      await setOutbox(job.id, 'attention', { delaySec: 3600 });
      return 'attention';
    }
    await setOutbox(job.id, 'pending', { delaySec: 120 });
    return 'waiting';
  }
  await setOutbox(job.id, 'done');
  return r.status;
}

async function processJob(job) {
  if (job.kind === 'create_shipment') return processCreate(job);
  if (job.kind === 'cancel_check') return processCancelCheck(job);
  await setOutbox(job.id, 'done');
  return 'skipped';
}

export async function runOnce({ shipmentId = null, limit = 10 } = {}) {
  const jobs = await claim(limit, shipmentId);
  const out = [];
  for (const j of jobs) {
    try { out.push({ shipmentId: j.shipment_id, result: await processJob(j) }); }
    catch (e) {
      console.error('[worker] lỗi xử lý job', j.id, e.message);
      await setOutbox(j.id, 'reconcile', { delaySec: 60, error: String(e.message).slice(0, 200) });
      out.push({ shipmentId: j.shipment_id, result: 'error' });
    }
  }
  return out;
}

// Admin xử lý tay một đơn "không rõ": created (kèm mã hãng) hoặc not_created (nhả tiền).
export async function resolveUnknown(shipmentId, action, details = {}) {
  const sh = (await query('SELECT * FROM shipments WHERE id=$1', [shipmentId]))[0];
  if (!sh || sh.payment_status !== 'held') return false;
  if (action === 'created') {
    await onCreated(sh, { carrierCode: details.carrierCode, trackingCode: details.carrierCode, fee: details.fee ?? sh.cost_price });
  } else {
    await onFailed(shipmentId, 'quản trị xác nhận hãng chưa có đơn');
  }
  return true;
}

// Việc định kỳ: hỏi hành trình hãng không có webhook, nhả đệm hết hạn.
export async function maintenance() {
  const polled = await lifecycle.pollTracking();
  const released = await lifecycle.releaseExpiredBuffers();
  return { polled, released };
}

let timer = null;
let tick = 0;
export function start(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => {
    runOnce().catch((e) => console.error('[worker]', e.message));
    tick += 1;
    if (tick % 12 === 0) maintenance().catch((e) => console.error('[maintenance]', e.message));
  }, intervalMs);
  timer.unref();
}
export function stop() { if (timer) { clearInterval(timer); timer = null; } }
