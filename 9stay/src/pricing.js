import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate, nightsBetween, todayVN } from './time.js';
import { roundTo } from './money.js';
import { getSetting } from './settings.js';

const PRICING_KEYS = {
  vatPct: 'pricing.vatPct',
  extraAdultFee: 'pricing.extraAdultFee',
  childFee: 'pricing.childFee',
  childFreeMaxAge: 'pricing.childFreeMaxAge',
  childAdultMinAge: 'pricing.childAdultMinAge',
  depositPct: 'pricing.depositPct',
  quoteHours: 'pricing.quoteHours',
  roundTo: 'pricing.roundTo',
};

export async function loadPricingSettings(c, { orgId, asOf }) {
  const out = {};
  for (const [short, key] of Object.entries(PRICING_KEYS)) out[short] = await getSetting(c, { orgId, key, asOf });
  return out;
}

// Hàm thuần: không đụng CSDL, không sửa đầu vào. Thiếu dữ liệu thành cảnh báo (ok=false) thay vì ném lỗi.
// Đường tính cố định, từng đêm: giá nền + phụ thu - một ưu đãi -> làm tròn dòng đêm -> cộng -> VAT -> làm tròn VAT -> tổng.
export function computeQuote({ nights, rates, adults, childAges = [], capacityStd, settings, promotion = null }) {
  const empty = (warnings) => ({ ok: false, warnings, lines: [], subtotal: 0, vat: 0, total: 0, deposit: 0 });
  const s = settings;

  const warnings = [];
  for (const age of childAges) {
    if (!Number.isInteger(age) || age < 0 || age > 17) { warnings.push({ code: 'bad_child_age' }); break; }
  }
  if (warnings.length) return empty(warnings);

  for (const night of nights) {
    const r = rates.get(night);
    if (!r) warnings.push({ code: 'missing_price', night });
    else if (r.closed) warnings.push({ code: 'closed', night });
  }
  const first = rates.get(nights[0]);
  if (first && !first.closed && first.minStay > nights.length) warnings.push({ code: 'min_stay', night: nights[0], minStay: first.minStay });
  if (warnings.length) return empty(warnings);

  const teens = childAges.filter((a) => a >= s.childAdultMinAge).length;
  const kidsPaying = childAges.filter((a) => a > s.childFreeMaxAge && a < s.childAdultMinAge).length;
  const effectiveAdults = adults + teens;
  const surcharge = Math.max(0, effectiveAdults - capacityStd) * s.extraAdultFee + kidsPaying * s.childFee;

  const promoActive = promotion && nights.length >= promotion.minNights;
  const lines = nights.map((night) => {
    const base = rates.get(night).price;
    const gross = base + surcharge;
    let discount = 0;
    if (promoActive) discount = promotion.kind === 'pct' ? Math.floor((gross * promotion.value) / 100) : promotion.value;
    discount = Math.min(gross, discount);
    return { kind: 'night', night, base, surcharge, discount, amount: roundTo(gross - discount, s.roundTo) };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const vat = roundTo(Math.floor((subtotal * s.vatPct) / 100), s.roundTo);
  const total = subtotal + vat;
  const deposit = roundTo(Math.floor((total * s.depositPct) / 100), s.roundTo);
  return { ok: true, warnings: [], lines, subtotal, vat, total, deposit };
}

export async function ensureRatePlans(c, { orgId }) {
  assertUuid(orgId, 'org');
  for (const [code, name] of [['public', 'Giá công khai'], ['ctv', 'Giá CTV']]) {
    await c.query('INSERT INTO rate_plans(org_id, code, name) VALUES($1, $2, $3) ON CONFLICT (org_id, code) DO NOTHING', [orgId, code, name]);
  }
  const rows = await c.query('SELECT id, code FROM rate_plans WHERE org_id = $1', [orgId]);
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

async function requireRoomTypeAndPlan(c, orgId, roomTypeId, planId) {
  assertUuid(orgId, 'org');
  assertUuid(roomTypeId, 'loại phòng');
  assertUuid(planId, 'gói giá');
  const [rt] = await c.query('SELECT id, capacity_std, capacity_max FROM room_types WHERE id = $1 AND org_id = $2', [roomTypeId, orgId]);
  if (!rt) throw new AppError('room_type_not_found', 'Không tìm thấy loại phòng', 404);
  const [pl] = await c.query('SELECT id FROM rate_plans WHERE id = $1 AND org_id = $2', [planId, orgId]);
  if (!pl) throw new AppError('plan_not_found', 'Không tìm thấy gói giá', 404);
  return rt;
}

// Ghi giá cho [from, to). Mọi thay đổi (giá hoặc đóng bán) ghi lịch sử: ai sửa, giá cũ, giá mới.
export async function setRates(c, { orgId, roomTypeId, planId, from, to, price, minStay = 1, closed = false, source = 'manual', by = null }) {
  const nights = nightsBetween(from, to);
  if (!Number.isSafeInteger(price) || price < 0) throw new AppError('bad_price', 'Giá không hợp lệ');
  if (!Number.isInteger(minStay) || minStay < 1) throw new AppError('bad_price', 'Số đêm tối thiểu không hợp lệ');
  await requireRoomTypeAndPlan(c, orgId, roomTypeId, planId);
  const old = await c.query(
    'SELECT night, price, closed FROM rate_calendar WHERE room_type_id = $1 AND plan_id = $2 AND night = ANY($3::date[]) FOR UPDATE',
    [roomTypeId, planId, nights],
  );
  const oldBy = new Map(old.map((r) => [r.night, r]));
  const changed = nights.filter((n) => { const o = oldBy.get(n); return !o || o.price !== price || o.closed !== closed; });
  if (changed.length) {
    await c.query(
      `INSERT INTO rate_calendar_history(org_id, room_type_id, plan_id, night, old_price, new_price, old_closed, new_closed, source, changed_by)
       SELECT $1::uuid, $2::uuid, $3::uuid, n, o.price, $5::bigint, o.closed, $6::boolean, $7::text, $8::uuid
         FROM unnest($4::date[]) AS n
         LEFT JOIN rate_calendar o ON o.room_type_id = $2::uuid AND o.plan_id = $3::uuid AND o.night = n`,
      [orgId, roomTypeId, planId, changed, price, closed, source, by],
    );
  }
  await c.query(
    `INSERT INTO rate_calendar(org_id, room_type_id, plan_id, night, price, min_stay, closed, source, updated_by)
     SELECT $1::uuid, $2::uuid, $3::uuid, n, $5::bigint, $6::int, $7::boolean, $8::text, $9::uuid FROM unnest($4::date[]) AS n
     ON CONFLICT (room_type_id, plan_id, night)
     DO UPDATE SET price = EXCLUDED.price, min_stay = EXCLUDED.min_stay, closed = EXCLUDED.closed, source = EXCLUDED.source, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [orgId, roomTypeId, planId, nights, price, minStay, closed, source, by],
  );
  return { nights: nights.length, changed: changed.length };
}

export async function createPromotion(c, { orgId, name, kind, value, minNights = 1, stayFrom, stayTo, planId = null, roomTypeId = null }) {
  assertUuid(orgId, 'org');
  if (typeof name !== 'string' || !name.trim()) throw new AppError('bad_promotion', 'Tên ưu đãi không hợp lệ');
  if (!['pct', 'amount_per_night'].includes(kind)) throw new AppError('bad_promotion', 'Loại ưu đãi không hợp lệ');
  if (!Number.isSafeInteger(value) || value < 1 || (kind === 'pct' && value > 100)) throw new AppError('bad_promotion', 'Giá trị ưu đãi không hợp lệ');
  if (!Number.isInteger(minNights) || minNights < 1) throw new AppError('bad_promotion', 'Số đêm tối thiểu không hợp lệ');
  if (!isDate(stayFrom) || !isDate(stayTo) || stayTo <= stayFrom) throw new AppError('bad_dates', 'Khoảng áp dụng không hợp lệ');
  if (planId) assertUuid(planId, 'gói giá');
  if (roomTypeId) assertUuid(roomTypeId, 'loại phòng');
  const [row] = await c.query(
    `INSERT INTO promotions(org_id, name, kind, value, min_nights, stay_from, stay_to, plan_id, room_type_id)
     VALUES($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9) RETURNING id`,
    [orgId, name.trim(), kind, value, minNights, stayFrom, stayTo, planId, roomTypeId],
  );
  return row;
}

// Báo giá có hạn. Chọn đúng MỘT ưu đãi có lợi nhất cho khách trong các ưu đãi đủ điều kiện. Chỉ lưu khi ok.
export async function createQuote(c, { orgId, roomTypeId, planId, checkin, checkout, adults = 1, childAges = [], by = null }, { now = new Date() } = {}) {
  const nights = nightsBetween(checkin, checkout);
  const today = todayVN(now);
  if (checkin < today) throw new AppError('past_date', 'Ngày đến đã qua');
  if (!Number.isInteger(adults) || adults < 1) throw new AppError('bad_guest', 'Cần ít nhất 1 người lớn');
  if (!Array.isArray(childAges)) throw new AppError('bad_guest', 'Danh sách tuổi trẻ em không hợp lệ');
  const rt = await requireRoomTypeAndPlan(c, orgId, roomTypeId, planId);
  if (adults + childAges.length > rt.capacity_max) throw new AppError('over_capacity', `Loại phòng chứa tối đa ${rt.capacity_max} người`);

  const rateRows = await c.query('SELECT night, price, min_stay, closed FROM rate_calendar WHERE room_type_id = $1 AND plan_id = $2 AND night = ANY($3::date[])', [roomTypeId, planId, nights]);
  const rates = new Map(rateRows.map((r) => [r.night, { price: r.price, minStay: r.min_stay, closed: r.closed }]));
  const settings = await loadPricingSettings(c, { orgId, asOf: today });
  const input = { nights, rates, adults, childAges, capacityStd: rt.capacity_std, settings };

  const promos = await c.query(
    `SELECT id, kind, value, min_nights FROM promotions
      WHERE org_id = $1 AND active AND stay_from <= $2::date AND stay_to >= $3::date
        AND (plan_id IS NULL OR plan_id = $4) AND (room_type_id IS NULL OR room_type_id = $5)
      ORDER BY id`,
    [orgId, checkin, checkout, planId, roomTypeId],
  );
  let best = computeQuote({ ...input, promotion: null });
  let bestPromoId = null;
  if (best.ok) {
    for (const p of promos) {
      const q = computeQuote({ ...input, promotion: { id: p.id, kind: p.kind, value: p.value, minNights: p.min_nights } });
      if (q.ok && q.total < best.total) { best = q; bestPromoId = p.id; }
    }
  }
  if (!best.ok) return { id: null, ...best };

  const expiresAt = new Date(now.getTime() + settings.quoteHours * 3600 * 1000);
  const [row] = await c.query(
    `INSERT INTO quotes(org_id, room_type_id, plan_id, checkin, checkout, adults, child_ages, promotion_id, lines, subtotal, vat, total, deposit, expires_at, created_by)
     VALUES($1, $2, $3, $4::date, $5::date, $6, $7::jsonb, $8, $9::jsonb, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [orgId, roomTypeId, planId, checkin, checkout, adults, JSON.stringify(childAges), bestPromoId, JSON.stringify(best.lines), best.subtotal, best.vat, best.total, best.deposit, expiresAt, by],
  );
  return { id: row.id, expiresAt, promotionId: bestPromoId, ...best };
}
