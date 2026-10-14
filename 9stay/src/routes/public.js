import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { requestOtp, verifyOtp, sessionPhone, canonicalPhone } from '../otp.js';
import { orgBySlug, offers, book, receipt, cancelByReceipt, getPublicPage, setPublicPage } from '../public.js';

const csvInts = (v) => {
  if (v === undefined || v === '') return [];
  return String(v).split(',').map((x) => (/^\d{1,2}$/.test(x.trim()) ? Number(x.trim()) : Number.NaN));
};
const intQ = (v, d) => (v === undefined || v === '' ? d : (/^\d{1,2}$/.test(String(v)) ? Number(v) : Number.NaN));

// Trang đặt phòng công khai: không cookie, định danh org bằng slug, mọi đầu vào do khách điều khiển nên kiểm kỹ và giới hạn tần suất.
export function publicRoutes(app, { otpSender, otpReady = true }) {
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

  // Ghi mã và commit TRƯỚC rồi mới gửi (không giữ kết nối CSDL khi chờ nhà cung cấp; lần gửi lỗi vẫn bị tính vào giới hạn).
  app.route('POST', '/api/public/:slug/otp', async (ctx) => {
    const r = await tx(async (c) => requestOtp(c, { orgId: (await org(c, ctx.params.slug)).id, phone: ctx.body.phone }, { now: ctx.now }));
    await otpSender.send(r.phone, r.code);
    return { ok: true };
  }, { auth: 'none', limit: 10 });

  app.route('POST', '/api/public/:slug/otp/verify', async (ctx) => {
    const r = await tx(async (c) => verifyOtp(c, { orgId: (await org(c, ctx.params.slug)).id, phone: ctx.body.phone, code: ctx.body.code }, { now: ctx.now }));
    if (!r.ok) throw new AppError('otp_invalid', 'Mã không đúng hoặc đã hết hạn', 400);
    return { token: r.token };
  }, { auth: 'none', limit: 20 });

  app.route('POST', '/api/public/:slug/book', async (ctx) => tx(async (c) => {
    const o = await org(c, ctx.params.slug);
    const b = ctx.body;
    const phone = await sessionPhone(c, { orgId: o.id, token: b.token }, { now: ctx.now });
    if (!phone) throw new AppError('otp_required', 'Cần xác thực số điện thoại trước', 401);
    return book(c, { org: o, phone, roomTypeId: b.roomTypeId, checkin: b.checkin, checkout: b.checkout, adults: b.adults, childAges: b.childAges ?? [], guestName: b.guestName, expectedTotal: Number.isSafeInteger(b.expectedTotal) ? b.expectedTotal : null, sessionToken: b.token }, { now: ctx.now });
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
