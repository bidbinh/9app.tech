import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { reserveSend, sendOtp, checkOtp, createSession, sessionPhone, canonicalPhone, otpAvailable } from '../otp.js';
import { searchListings, listingDetail, listingAreas } from '../listing-public.js';
import { orgBySlug, offers, book, receipt, cancelByReceipt, getPublicPage, setPublicPage } from '../public.js';

const csvInts = (v) => {
  if (v === undefined || v === '') return [];
  return String(v).split(',').map((x) => (/^\d{1,2}$/.test(x.trim()) ? Number(x.trim()) : Number.NaN));
};
const intQ = (v, d) => (v === undefined || v === '' ? d : (/^\d{1,2}$/.test(String(v)) ? Number(v) : Number.NaN));

// Trang đặt phòng công khai: không cookie, định danh org bằng slug, mọi đầu vào do khách điều khiển nên kiểm kỹ và giới hạn tần suất.
export function publicRoutes(app, { idClient }) {
  const otpReady = otpAvailable(idClient);
  async function org(c, slug) {
    const o = await orgBySlug(c, slug);
    if (!o) throw new AppError('not_found', 'Không tìm thấy trang đặt phòng', 404);
    return o;
  }

  app.route('GET', '/api/public/:slug/offers', async (ctx) => tx(async (c) => {
    const o = await org(c, ctx.params.slug);
    const q = ctx.query;
    return offers(c, { org: o, checkin: q.checkin, checkout: q.checkout, adults: intQ(q.adults, 1), childAges: csvInts(q.childAges), otpReady }, { now: ctx.now });
  }), { auth: 'none', limit: 60 });

  // Chợ phòng: danh sách, chi tiết, khu vực. Giá luôn đã gồm VAT; không lộ căn/chủ/địa chỉ chính xác.
  const guestQ = (q) => ({ adults: intQ(q.adults, 1), childAges: csvInts(q.childAges), from: q.from, to: q.to });
  const moneyQ = (v) => (v === undefined || v === '' ? null : (/^\d{1,9}$/.test(String(v)) ? Number(v) : Number.NaN));
  app.route('GET', '/api/public/:slug/listings', async (ctx) => tx(async (c) => {
    const o = await org(c, ctx.params.slug);
    const q = ctx.query;
    const min = moneyQ(q.minPrice); const max = moneyQ(q.maxPrice);
    if (Number.isNaN(min) || Number.isNaN(max)) throw new AppError('bad_input', 'Khoảng giá không hợp lệ');
    return searchListings(c, { orgId: o.id, ...guestQ(q), area: q.area ?? '', minPrice: min, maxPrice: max, sort: q.sort ?? 'recommended', page: intQ(q.page, 1) }, { now: ctx.now });
  }), { auth: 'none', limit: 90 });
  app.route('GET', '/api/public/:slug/listings/:id', async (ctx) => tx(async (c) => {
    const o = await org(c, ctx.params.slug);
    return listingDetail(c, { orgId: o.id, listingId: ctx.params.id, ...guestQ(ctx.query) }, { now: ctx.now });
  }), { auth: 'none', limit: 120 });
  app.route('GET', '/api/public/:slug/areas', async (ctx) => tx(async (c) => ({ areas: await listingAreas(c, { orgId: (await org(c, ctx.params.slug)).id }) })), { auth: 'none', limit: 60 });

  // OTP do 9id gửi/kiểm (dùng chung cổng Zalo/SMS và hạn mức với 9Ship/9Sport). Ghi dấu lần xin và commit TRƯỚC rồi mới gọi 9id (không giữ kết nối CSDL khi chờ);
  // lần gửi lỗi vẫn bị tính vào giới hạn cục bộ.
  app.route('POST', '/api/public/:slug/otp', async (ctx) => {
    const r = await tx(async (c) => reserveSend(c, { orgId: (await org(c, ctx.params.slug)).id, phone: ctx.body.phone }, { now: ctx.now }));
    await sendOtp(idClient, { phone: r.phone, ip: ctx.ip });
    return { ok: true };
  }, { auth: 'none', limit: 10 });

  app.route('POST', '/api/public/:slug/otp/verify', async (ctx) => {
    const orgId = await tx(async (c) => (await org(c, ctx.params.slug)).id);
    const phone = await checkOtp(idClient, { phone: ctx.body.phone, code: ctx.body.code, ip: ctx.ip });
    return { token: await tx((c) => createSession(c, { orgId, phone }, { now: ctx.now })) };
  }, { auth: 'none', limit: 20 });

  app.route('POST', '/api/public/:slug/book', async (ctx) => tx(async (c) => {
    const o = await org(c, ctx.params.slug);
    const b = ctx.body;
    const phone = await sessionPhone(c, { orgId: o.id, token: b.token }, { now: ctx.now });
    if (!phone) throw new AppError('otp_required', 'Cần xác thực số điện thoại trước', 401);
    return book(c, { org: o, phone, listingId: b.listingId ?? null, roomTypeId: b.roomTypeId, checkin: b.checkin, checkout: b.checkout, adults: b.adults, childAges: b.childAges ?? [], guestName: b.guestName, expectedTotal: Number.isSafeInteger(b.expectedTotal) ? b.expectedTotal : null, sessionToken: b.token }, { now: ctx.now });
  }), { auth: 'none', limit: 10 });

  app.route('GET', '/api/public/receipt/:token', async (ctx) => tx((c) => receipt(c, { token: ctx.params.token }, { now: ctx.now })), { auth: 'none', limit: 120 });
  app.route('POST', '/api/public/receipt/:token/cancel', async (ctx) => tx((c) => cancelByReceipt(c, { token: ctx.params.token }, { now: ctx.now })), { auth: 'none', limit: 10 });

  // Quản lý bật/tắt trang và đặt địa chỉ.
  app.route('GET', '/api/public-page', async (ctx) => {
    requirePerm(ctx, 'settings.write');
    return tx((c) => getPublicPage(c, ctx.member.orgId));
  });
  app.route('PUT', '/api/public-page', async (ctx) => {
    requirePerm(ctx, 'settings.write');
    return tx(async (c) => {
      await setPublicPage(c, { orgId: ctx.member.orgId, slug: ctx.body.slug, enabled: ctx.body.enabled === true });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'public.page.set', target: null, data: { slug: ctx.body.slug, enabled: ctx.body.enabled === true } });
      return { ok: true };
    });
  });
}

export { canonicalPhone };
