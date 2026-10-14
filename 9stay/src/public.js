import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { getSetting } from './settings.js';
import { todayVN, nightsBetween } from './time.js';
import { ensureRatePlans, createQuote } from './pricing.js';
import { roomTypeAvailability, createBookingForType } from './search.js';
import { cancelBooking, expireHolds } from './bookings.js';
import { bookingBalance } from './payments.js';
import { getBankAccount, paymentInfo } from './bank.js';
import { hashToken } from './otp.js';

const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;

export async function orgBySlug(c, slug) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return null;
  const [o] = await c.query('SELECT id, name FROM orgs WHERE slug = $1 AND public_enabled', [slug]);
  return o ?? null;
}

export async function getPublicPage(c, orgId) {
  const [o] = await c.query('SELECT slug, public_enabled FROM orgs WHERE id = $1', [orgId]);
  return { slug: o.slug, enabled: o.public_enabled };
}

export async function setPublicPage(c, { orgId, slug, enabled }) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new AppError('bad_slug', 'Địa chỉ trang gồm 3–40 ký tự a-z, 0-9 và dấu gạch');
  try {
    await c.query('UPDATE orgs SET slug = $2, public_enabled = $3 WHERE id = $1', [orgId, slug, !!enabled]);
  } catch (e) {
    if (e.code === '23505') throw new AppError('slug_taken', 'Địa chỉ này đã có người dùng', 409);
    throw e;
  }
}

async function checkNights(c, org, checkin, checkout, today) {
  const max = await getSetting(c, { orgId: org.id, key: 'booking.maxNightsPublic', asOf: today });
  if (nightsBetween(checkin, checkout).length > max) throw new AppError('too_long', `Đặt trực tuyến tối đa ${max} đêm, vui lòng liên hệ cơ sở cho kỳ dài hơn`);
}

function guestInput({ adults, childAges }) {
  if (!Number.isInteger(adults) || adults < 1 || adults > 20) throw new AppError('bad_guest', 'Số người lớn không hợp lệ');
  if (!Array.isArray(childAges) || childAges.length > 10 || !childAges.every((a) => Number.isInteger(a) && a >= 0 && a <= 17)) throw new AppError('bad_guest', 'Tuổi trẻ em không hợp lệ');
}

// Giá khách thấy luôn là giá gói công khai ĐÃ GỒM VAT (total). Không lộ số căn còn lại, chỉ cờ "sắp hết".
export async function offers(c, { org, checkin, checkout, adults, childAges, otpReady = true }, { now = new Date() } = {}) {
  guestInput({ adults, childAges });
  await checkNights(c, org, checkin, checkout, todayVN(now));
  await expireHolds(c, { orgId: org.id, now });
  const plans = await ensureRatePlans(c, { orgId: org.id });
  const avail = await roomTypeAvailability(c, { orgId: org.id, checkin, checkout, adults, children: childAges.length }, { now });
  const bank = await getBankAccount(c, org.id);
  const rooms = [];
  for (const t of avail.filter((x) => x.free > 0)) {
    const q = await createQuote(c, { orgId: org.id, roomTypeId: t.roomTypeId, planId: plans.public, checkin, checkout, adults, childAges }, { now, persist: false });
    if (!q.ok) continue;
    rooms.push({ roomTypeId: t.roomTypeId, name: t.name, scarce: t.free <= 2, nights: q.lines.length, total: q.total, deposit: q.deposit });
  }
  const holdMinutes = await getSetting(c, { orgId: org.id, key: 'booking.holdMinutesPublic', asOf: todayVN(now) });
  return { rooms, payReady: !!bank, otpReady, holdMinutes };
}

// Bước "đến nút thanh toán": khóa một căn của loại phòng trong holdMinutesPublic phút, trả mã biên nhận ngẫu nhiên.
export async function book(c, { org, phone, listingId = null, roomTypeId: rtId, checkin, checkout, adults, childAges, guestName, expectedTotal = null, sessionToken = null }, { now = new Date() } = {}) {
  guestInput({ adults, childAges });
  let roomTypeId = rtId;
  if (listingId) {
    const [l] = await c.query("SELECT room_type_id FROM listings WHERE id = $1 AND org_id = $2 AND status = 'approved'", [listingId, org.id]);
    if (!l) throw new AppError('not_found', 'Phòng này hiện không nhận đặt', 404);
    roomTypeId = l.room_type_id;
  } else {
    // loại phòng gắn với một tin thì tin phải đang hiển thị (tin chưa duyệt/bị ngưng không đặt qua đường này)
    const [lt] = await c.query('SELECT status FROM listings WHERE room_type_id = $1 AND org_id = $2', [roomTypeId, org.id]);
    if (lt && lt.status !== 'approved') throw new AppError('not_found', 'Phòng này hiện không nhận đặt', 404);
  }
  await checkNights(c, org, checkin, checkout, todayVN(now));
  if (!(await getBankAccount(c, org.id))) throw new AppError('no_bank_account', 'Cơ sở chưa nhận thanh toán trực tuyến, vui lòng liên hệ trực tiếp', 409);
  const today = todayVN(now);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['hold:' + org.id + phone]);
  const max = await getSetting(c, { orgId: org.id, key: 'booking.maxHeldPerPhone', asOf: today });
  const [held] = await c.query("SELECT count(*)::int AS n FROM bookings WHERE org_id = $1 AND guest_phone = $2 AND source = 'web' AND status = 'giu' AND hold_until >= $3::timestamptz", [org.id, phone, now]);
  if (held.n >= max) throw new AppError('too_many_holds', 'Bạn đang giữ phòng cho một đơn khác chưa thanh toán, hãy hoàn tất hoặc đợi hết hạn giữ chỗ', 409);
  const dayMax = await getSetting(c, { orgId: org.id, key: 'booking.maxWebPerPhonePerDay', asOf: today });
  const [day] = await c.query("SELECT count(*)::int AS n FROM bookings WHERE org_id = $1 AND guest_phone = $2 AND source = 'web' AND created_at > $3::timestamptz - interval '24 hours' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = bookings.id)", [org.id, phone, now]);
  if (day.n >= dayMax) throw new AppError('too_many_holds', 'Số lần giữ phòng chưa thanh toán trong 24 giờ đã đạt giới hạn, vui lòng liên hệ cơ sở', 429);
  const plans = await ensureRatePlans(c, { orgId: org.id });
  const q = await createQuote(c, { orgId: org.id, roomTypeId, planId: plans.public, checkin, checkout, adults, childAges }, { now });
  if (q.ok && expectedTotal !== null && expectedTotal !== q.total) throw new AppError('price_changed', 'Giá đã thay đổi, vui lòng tìm lại để xem giá mới', 409, { total: q.total });
  if (!q.ok) throw new AppError('not_available', 'Loại phòng này không còn bán cho các ngày đã chọn', 409);
  const b = await createBookingForType(c, { orgId: org.id, roomTypeId, checkin, checkout, guestName, guestPhone: phone, adults, children: childAges.length, source: 'web', status: 'giu', quoteId: q.id }, { now });
  const token = crypto.randomBytes(24).toString('base64url');
  await c.query('UPDATE bookings SET public_token_hash = $2, phone_verified = true WHERE id = $1', [b.id, hashToken(token)]);
  if (sessionToken) await c.query('DELETE FROM otp_sessions WHERE token_hash = $1', [hashToken(sessionToken)]);
  return { receipt: token, code: b.code, holdUntil: b.holdUntil, total: q.total, deposit: q.deposit };
}

async function byToken(c, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new AppError('not_found', 'Không tìm thấy đơn', 404);
  const [b] = await c.query('SELECT id, org_id FROM bookings WHERE public_token_hash = $1', [hashToken(token)]);
  if (!b) throw new AppError('not_found', 'Không tìm thấy đơn', 404);
  return b;
}

// Biên nhận cho khách: chỉ thông tin của chính đơn đó, không có căn, chủ, hoa hồng.
export async function receipt(c, { token }, { now = new Date() } = {}) {
  const ref = await byToken(c, token);
  await expireHolds(c, { orgId: ref.org_id, now });
  const [b] = await c.query(
    `SELECT b.code, b.status, b.checkin, b.checkout, b.guest_name, b.hold_until, rt.name AS room_type
       FROM bookings b JOIN units u ON u.id = b.unit_id JOIN room_types rt ON rt.id = u.room_type_id WHERE b.id = $1`,
    [ref.id],
  );
  const bal = await bookingBalance(c, { orgId: ref.org_id, bookingId: ref.id });
  const [loc] = await c.query('SELECT bd.name, bd.address, bd.district, bd.province FROM bookings bk JOIN units u ON u.id = bk.unit_id JOIN buildings bd ON bd.id = u.building_id WHERE bk.id = $1', [ref.id]);
  const out = { code: b.code, status: b.status, checkin: b.checkin, checkout: b.checkout, roomType: b.room_type, guestName: b.guest_name, holdUntil: b.hold_until, total: bal.total, paid: bal.paid, due: bal.due, deposit: bal.depositRequired };
  if (['da_coc', 'da_nhan', 'da_tra'].includes(b.status) && loc) out.location = { name: loc.name, address: loc.address, district: loc.district, province: loc.province };
  if (['giu', 'da_coc'].includes(b.status) && bal.due > 0) {
    const p = await paymentInfo(c, { orgId: ref.org_id, bookingId: ref.id });
    out.pay = { amount: p.amount, content: p.content, accountNumber: p.accountNumber, accountHolder: p.accountHolder, svg: p.svg };
  }
  return out;
}

export async function cancelByReceipt(c, { token }, { now = new Date() } = {}) {
  const ref = await byToken(c, token);
  return cancelBooking(c, { orgId: ref.org_id, bookingId: ref.id, reason: 'Khách tự hủy trên trang đặt phòng', requireNoPayments: true }, { now });
}
