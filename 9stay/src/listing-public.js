import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { todayVN, addDays, nightsBetween, isDate } from './time.js';
import { getSetting } from './settings.js';
import { ensureRatePlans, createQuote } from './pricing.js';
import { roomTypeAvailability } from './search.js';
import { AMENITIES, CANCEL_POLICIES } from './listing-meta.js';

const AMENITY_LABEL = Object.fromEntries(AMENITIES);
const PAGE = 20;
const MAX_CANDIDATES = 60;

// Giá hiển thị cho khách luôn ĐÃ GỒM VAT.
const withVat = (price, vatPct) => Math.round((price * (100 + vatPct)) / 100);

function guestsOf({ adults, childAges }) {
  if (!Number.isInteger(adults) || adults < 1 || adults > 20) throw new AppError('bad_guest', 'Số người lớn không hợp lệ');
  if (!Array.isArray(childAges) || childAges.length > 10 || !childAges.every((a) => Number.isInteger(a) && a >= 0 && a <= 17)) throw new AppError('bad_guest', 'Tuổi trẻ em không hợp lệ');
  return adults + childAges.length;
}

function datesOf(from, to) {
  if (from === undefined && to === undefined) return null;
  if (!isDate(from) || !isDate(to)) throw new AppError('bad_dates', 'Ngày không hợp lệ');
  nightsBetween(from, to);
  return { from, to };
}


// Danh sách phòng cho khách và CTV. Bước rẻ trước (SQL: sức chứa, khu vực, còn trống, khoảng giá theo giá niêm yết, sắp xếp), bước đắt sau (báo giá chính xác)
// chỉ cho đúng trang đang xem, tối đa PAGE*3 lần thử mỗi yêu cầu. total = số tin còn trống (cận trên: tin đóng bán/chưa đủ đêm tối thiểu bị loại khi báo giá).
export async function searchListings(c, { orgId, from, to, adults = 1, childAges = [], area = '', minPrice = null, maxPrice = null, sort = 'recommended', page = 1, plan = 'public' }, { now = new Date() } = {}) {
  const guests = guestsOf({ adults, childAges });
  const dates = datesOf(from, to);
  if (!['recommended', 'price_asc', 'price_desc', 'newest'].includes(sort)) throw new AppError('bad_input', 'Cách sắp xếp không hợp lệ');
  const pg = Number.isInteger(page) && page >= 1 && page <= 50 ? page : 1;
  const areaQ = typeof area === 'string' ? area.trim().slice(0, 60).replace(/[%_\\]/g, '') : '';
  const today = todayVN(now);
  const vatPct = await getSetting(c, { orgId, key: 'pricing.vatPct', asOf: today });
  // khu vực chỉ khớp tỉnh/quận (KHÔNG khớp tên tòa: tên tòa là thông tin chưa công khai)
  const order = { price_asc: 'l.live_price ASC', price_desc: 'l.live_price DESC' }[sort] ?? 'l.decided_at DESC NULLS LAST';
  const rows = await c.query(
    `SELECT l.id, l.title, l.room_type_id, l.bedrooms, l.beds, l.bathrooms, l.capacity_max, l.amenities, l.live_price,
            b.province, b.district,
            (SELECT id FROM listing_photos p WHERE p.listing_id = l.id ORDER BY position LIMIT 1) AS cover,
            (SELECT count(*)::int FROM listing_photos p WHERE p.listing_id = l.id) AS photos
       FROM listings l JOIN buildings b ON b.id = l.building_id
      WHERE l.org_id = $1 AND l.status = 'approved' AND b.status = 'approved' AND l.capacity_max >= $2
        AND ($3::text = '' OR b.province ILIKE '%' || $3 || '%' OR b.district ILIKE '%' || $3 || '%')
      ORDER BY ${order}, l.id`, [orgId, guests, areaQ]);
  let free = null;
  if (dates) {
    free = new Map((await roomTypeAvailability(c, { orgId, checkin: dates.from, checkout: dates.to, adults, children: childAges.length }, { now })).map((t) => [t.roomTypeId, t.free]));
  }
  // lọc theo giá niêm yết (đã gồm VAT) và còn trống; giá chính xác theo ngày kiểm lại ở bước báo giá
  const candidates = rows.filter((r) => {
    if (free && !(free.get(r.room_type_id) > 0)) return false;
    if (dates) return true; // có ngày: lọc giá theo báo giá chính xác ở bước sau
    const p = withVat(r.live_price, vatPct);
    return !(minPrice !== null && p < minPrice) && !(maxPrice !== null && p > maxPrice);
  });
  const plans = dates ? await ensureRatePlans(c, { orgId }) : null;
  const out = [];
  let looked = 0;
  let i = (pg - 1) * PAGE;
  for (; i < candidates.length && out.length < PAGE && looked < PAGE * 3; i++) {
    const r = candidates[i];
    looked += 1;
    const card = {
      id: r.id, title: r.title, province: r.province, district: r.district, bedrooms: r.bedrooms, beds: r.beds, bathrooms: r.bathrooms, capacityMax: r.capacity_max,
      amenities: r.amenities.slice(0, 5).map((a) => ({ code: a, label: AMENITY_LABEL[a] ?? a })), cover: r.cover, photos: r.photos, roomTypeId: r.room_type_id,
      priceNight: withVat(r.live_price, vatPct), scarce: free ? free.get(r.room_type_id) <= 2 : false,
    };
    if (dates) {
      const q = await createQuote(c, { orgId, roomTypeId: r.room_type_id, planId: plans[plan], checkin: dates.from, checkout: dates.to, adults, childAges }, { now, persist: false });
      if (!q.ok) continue; // đóng bán, thiếu giá hoặc chưa đủ số đêm tối thiểu: không hiện
      card.total = q.total; card.deposit = q.deposit; card.nights = q.lines.length; card.subtotal = q.subtotal;
      card.priceNight = Math.round(q.total / q.lines.length);
      if ((minPrice !== null && card.priceNight < minPrice) || (maxPrice !== null && card.priceNight > maxPrice)) continue;
    }
    out.push(card);
  }
  // Có ngày và đã xem hết danh sách ở trang 1: tổng chính xác (đã loại tin đóng bán/giá ngoài khoảng); còn lại là cận trên.
  const total = pg === 1 && dates && i >= candidates.length ? out.length : candidates.length;
  return { listings: out, total, page: pg, pageSize: PAGE, withDates: !!dates };
}

export async function listingAreas(c, { orgId }) {
  const rows = await c.query(
    `SELECT b.province, b.district, count(*)::int AS n FROM listings l JOIN buildings b ON b.id = l.building_id
      WHERE l.org_id = $1 AND l.status = 'approved' AND b.status = 'approved' GROUP BY b.province, b.district ORDER BY b.province, b.district`, [orgId]);
  return rows.map((r) => ({ province: r.province, district: r.district, count: r.n }));
}

// Trang chi tiết. KHÔNG có số căn, tên chủ, địa chỉ chính xác (chỉ tỉnh/quận). Lịch 90 đêm: đêm nào còn ít nhất một căn mở bán và trống.
export async function listingDetail(c, { orgId, listingId, from, to, adults = 1, childAges = [], plan = 'public' }, { now = new Date() } = {}) {
  assertUuid(listingId, 'tin');
  const guests = guestsOf({ adults, childAges });
  const dates = datesOf(from, to);
  const [l] = await c.query(
    `SELECT l.*, b.province, b.district FROM listings l JOIN buildings b ON b.id = l.building_id WHERE l.id = $1 AND l.org_id = $2 AND l.status = 'approved' AND b.status = 'approved'`, [listingId, orgId]);
  if (!l) throw new AppError('not_found', 'Không tìm thấy phòng', 404);
  const today = todayVN(now);
  const vatPct = await getSetting(c, { orgId, key: 'pricing.vatPct', asOf: today });
  const photos = await c.query('SELECT id FROM listing_photos WHERE listing_id = $1 ORDER BY position', [l.id]);
  const cal = await c.query(
    `SELECT d::date::text AS night,
            EXISTS (SELECT 1 FROM listing_units x JOIN units u ON u.id = x.unit_id
                     WHERE x.listing_id = $1 AND u.status = 'active'
                       AND EXISTS (SELECT 1 FROM owner_releases r WHERE r.unit_id = u.id AND r.kind = 'open' AND r.night = d::date)
                       AND NOT EXISTS (SELECT 1 FROM room_nights rn JOIN bookings bk ON bk.id = rn.booking_id
                                        WHERE rn.unit_id = u.id AND rn.active AND rn.night = d::date
                                          AND NOT (bk.status = 'giu' AND bk.hold_until < $4::timestamptz AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = bk.id)))) AS free
       FROM generate_series($2::date, $3::date, interval '1 day') d`, [l.id, today, addDays(today, 89), now]);
  const out = {
    id: l.id, title: l.title, description: l.description, houseRules: l.house_rules, province: l.province, district: l.district, bedrooms: l.bedrooms, beds: l.beds, bathrooms: l.bathrooms,
    capacityStd: l.capacity_std, capacityMax: l.capacity_max, amenities: l.amenities.map((a) => ({ code: a, label: AMENITY_LABEL[a] ?? a })),
    cancelPolicy: { code: l.cancel_policy, label: CANCEL_POLICIES[l.cancel_policy].label, text: CANCEL_POLICIES[l.cancel_policy].text },
    photos: photos.map((p) => p.id), priceNight: withVat(l.live_price, vatPct), weekendPriceNight: withVat(l.live_weekend_price, vatPct), roomTypeId: l.room_type_id,
    calendar: cal.map((r) => ({ night: r.night, free: r.free })), fitsGuests: guests <= l.capacity_max,
    holdMinutes: await getSetting(c, { orgId, key: 'booking.holdMinutesPublic', asOf: today }),
  };
  if (dates) {
    const plans = await ensureRatePlans(c, { orgId });
    const q = await createQuote(c, { orgId, roomTypeId: l.room_type_id, planId: plans[plan], checkin: dates.from, checkout: dates.to, adults, childAges }, { now, persist: false });
    out.quote = q.ok ? { total: q.total, deposit: q.deposit, nights: q.lines.length, subtotal: q.subtotal, vat: q.vat, lines: q.lines.map((x) => ({ night: x.night, amount: x.amount })) } : { ok: false, warnings: q.warnings };
    const free = (await roomTypeAvailability(c, { orgId, checkin: dates.from, checkout: dates.to, adults, children: childAges.length }, { now })).find((t) => t.roomTypeId === l.room_type_id);
    out.available = !!(free && free.free > 0) && q.ok;
  }
  return out;
}
