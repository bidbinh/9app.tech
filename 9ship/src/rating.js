import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import * as registry from './carriers/index.js';
import { applyMargin, pickRule, priceBookVersion } from './pricing.js';
import { nearestPoints } from './places.js';
import * as ledger from './ledger.js';
import { tx } from './db.js';

// ---- cảnh báo cho quản trị: offer bị ẩn vì biên hoặc thiếu trần ----
const alerts = new Map();
function recordAlert(carrier, route, reason) {
  const k = `${carrier}|${route}|${reason}`;
  const a = alerts.get(k) || { carrier, route, reason, count: 0, last: null };
  a.count += 1;
  a.last = new Date().toISOString();
  alerts.set(k, a);
}
export const getAlerts = () => [...alerts.values()].sort((a, b) => b.count - a.count).slice(0, 100);
export const clearAlerts = () => alerts.clear();

export async function getSetting(key, def) {
  const r = await query('SELECT value FROM settings WHERE key=$1', [key]);
  return r.length ? r[0].value : def;
}

// ---- circuit breaker theo hãng ----
const breaker = new Map(); // id -> { fails, openUntil, lastError }
const BREAK_AFTER = 5;
const BREAK_MS = 30_000;

export function health() {
  return registry.list().map((a) => {
    const b = breaker.get(a.id) || { fails: 0, openUntil: 0, lastError: null };
    return { id: a.id, name: a.name, open: b.openUntil > Date.now(), fails: b.fails, lastError: b.lastError };
  });
}
export function resetBreakers() { breaker.clear(); }

function isOpen(id) {
  const b = breaker.get(id);
  return Boolean(b && b.openUntil > Date.now());
}
function recordOk(id) { breaker.set(id, { fails: 0, openUntil: 0, lastError: null }); }
function recordFail(id, err) {
  const b = breaker.get(id) || { fails: 0, openUntil: 0, lastError: null };
  b.fails += 1;
  b.lastError = String(err?.message || err).slice(0, 200);
  if (b.fails >= BREAK_AFTER) b.openUntil = Date.now() + BREAK_MS;
  breaker.set(id, b);
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function loadListPrice(carrier, service, route, chargeableG) {
  const rows = await query(
    `SELECT price, verified_at, vat_included FROM list_prices
      WHERE carrier=$1 AND service=$2 AND route IN ($3,'*') AND max_weight_g >= $4
      ORDER BY (route = '*') ASC, max_weight_g ASC LIMIT 1`,
    [carrier, service, route, chargeableG],
  );
  return rows[0] || null;
}

export function publicOffer(o) {
  return {
    offerId: o.offerId, carrier: o.carrier, carrierName: o.carrierName, service: o.service, serviceName: o.serviceName,
    contract: o.contract, handovers: o.handovers, etaDays: o.etaDays, sellPrice: o.sellPrice,
    listPrice: o.capVerified ? o.listPrice : null, saved: o.saved, capVerified: o.capVerified,
    chargeableWeightG: o.chargeableWeightG, pickupPoints: o.pickupPoints, tags: o.tags,
  };
}

export async function quoteAll(req, { userId = null } = {}) {
  const route = `${req.from.province}>${req.to.province}`;
  const rules = await query('SELECT * FROM pricing_rules WHERE active');
  const adapters = registry.list();
  const skipped = [];

  // Ký quỹ của đơn vị tổng hợp xuống dưới ngưỡng: tạm ẩn mọi offer để không nhận đơn không thanh toán được.
  const depositMin = await getSetting('deposit_min', 0);
  if (depositMin > 0) {
    const bal = await tx(async (c) => ledger.balance(c, await ledger.systemAccount(c, 'aggregator_deposit')));
    if (bal < depositMin) {
      return { quoteId: null, expiresAt: null, offers: [], skipped: adapters.map((a) => ({ carrier: a.id, reason: 'deposit_low' })) };
    }
  }

  const settled = await Promise.all(adapters.map(async (a) => {
    if (isOpen(a.id)) { skipped.push({ carrier: a.id, reason: 'circuit_open' }); return []; }
    try {
      const offers = await withTimeout(a.quote({ ...req, from: req.from, to: req.to }), config.carrierTimeoutMs);
      recordOk(a.id);
      return offers.map((o) => ({ ...o, carrier: a.id, carrierName: a.name }));
    } catch (e) {
      recordFail(a.id, e);
      skipped.push({ carrier: a.id, reason: e.message === 'timeout' ? 'timeout' : 'error', detail: String(e.message).slice(0, 120) });
      return [];
    }
  }));

  const offers = [];
  for (const raw of settled.flat()) {
    if (!raw.handovers.includes(req.handover)) continue;
    const rule = pickRule(rules, raw.carrier, route);
    if (!rule) { skipped.push({ carrier: raw.carrier, reason: 'no_rule' }); continue; }

    let listPrice = raw.listPrice ?? null;
    let listVerifiedAt = raw.listPriceVerifiedAt ?? null;
    if (listPrice == null) {
      const lp = await loadListPrice(raw.carrier, raw.service, route, raw.chargeableWeightG);
      if (lp) { listPrice = lp.price; listVerifiedAt = lp.verified_at; }
    }

    const m = applyMargin({ cost: raw.cost.total, rule, listPrice, listVerifiedAt });
    if (m.hidden) { skipped.push({ carrier: raw.carrier, reason: m.reason }); recordAlert(raw.carrier, route, m.reason); continue; }

    const offer = {
      offerId: `${raw.carrier}:${raw.service}:${raw.contract}`,
      carrier: raw.carrier, carrierName: raw.carrierName,
      service: raw.service, serviceName: raw.serviceName, contract: raw.contract,
      handovers: raw.handovers, etaDays: raw.etaDays, chargeableWeightG: raw.chargeableWeightG,
      cost: raw.cost, costTotal: raw.cost.total, sellPrice: m.sellPrice,
      listPrice, listVerifiedAt, capped: m.capped, capVerified: m.capVerified,
      saved: m.capVerified ? Math.max(0, listPrice - m.sellPrice) : null,
      priceToken: raw.priceToken ?? null,
      priceBookVersion: priceBookVersion(rule, listPrice),
      pickupPoints: [],
      tags: [],
    };
    if (req.from.lat !== undefined) {
      const pts = await nearestPoints(raw.carrier, req.from.lat, req.from.lng, { limit: 3 });
      offer.pickupPoints = pts.map((p) => ({ id: p.id, name: p.name, address: p.address, hours: p.hours, distanceKm: p.distanceKm, lat: p.lat, lng: p.lng }));
    }
    offers.push(offer);
  }

  offers.sort((a, b) => a.sellPrice - b.sellPrice || a.etaDays[1] - b.etaDays[1]);
  if (offers.length) {
    offers[0].tags.push('cheapest');
    const fastest = [...offers].sort((a, b) => a.etaDays[1] - b.etaDays[1] || a.sellPrice - b.sellPrice)[0];
    fastest.tags.push('fastest');
    const withDist = offers.filter((o) => o.pickupPoints.length);
    if (withDist.length) {
      [...withDist].sort((a, b) => a.pickupPoints[0].distanceKm - b.pickupPoints[0].distanceKm)[0].tags.push('nearest');
    }
  }

  const expiresAt = new Date(Date.now() + config.quoteTtlMin * 60_000);
  const id = crypto.randomUUID();
  await query(
    'INSERT INTO quotes(id, user_id, request, offers, expires_at) VALUES($1,$2,$3,$4,$5)',
    [id, userId, JSON.stringify(req), JSON.stringify(offers), expiresAt],
  );
  return { quoteId: id, expiresAt: expiresAt.toISOString(), offers: offers.map(publicOffer), skipped };
}
