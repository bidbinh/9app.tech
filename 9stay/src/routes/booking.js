import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { can } from '../access.js';
import { requirePerm, isAgentRole } from '../auth.js';
import { orgCalendar } from '../calendar.js';
import { roomTypeAvailability, createBookingForType } from '../search.js';
import { createBooking, cancelBooking, moveBooking } from '../bookings.js';
import { createQuote, ensureRatePlans } from '../pricing.js';
import { checkIn, checkOut } from '../stay.js';
import { recordPayment, bookingBalance } from '../payments.js';
import { listBookings, getBooking, bookingDetail, shapeBooking } from '../queries.js';

const intParam = (v, d, label) => {
  if (v === undefined || v === '') return d;
  if (!/^\d{1,3}$/.test(String(v))) throw new AppError('bad_guest', `${label} không hợp lệ`);
  return Number(v);
};

async function agentCommissionPct(c, orgId, agentId) {
  const [a] = await c.query('SELECT commission_pct FROM agents WHERE id = $1 AND org_id = $2', [agentId, orgId]);
  return a ? a.commission_pct : 0;
}

export function bookingRoutes(app) {
  // ---- Lịch & tìm phòng ----
  app.route('GET', '/api/calendar', async (ctx) => {
    const m = ctx.member;
    let ownerId = null;
    let guest = 'full';
    if (can(m.role, 'calendar.read.all')) { /* thấy tất cả */ } else if (can(m.role, 'calendar.read.own')) { ownerId = m.ownerId; guest = 'masked'; } else requirePerm(ctx, 'calendar.read.all');
    return tx((c) => orgCalendar(c, { orgId: m.orgId, from: ctx.query.from, to: ctx.query.to, ownerId, guest }));
  });

  // Chỉ trả theo loại phòng, không có căn: dùng chung cho nhân viên và sale/CTV.
  app.route('GET', '/api/availability', async (ctx) => {
    requirePerm(ctx, 'availability.search');
    const adults = intParam(ctx.query.adults, 1, 'Số người lớn');
    const children = intParam(ctx.query.children, 0, 'Số trẻ em');
    const roomTypes = await tx((c) => roomTypeAvailability(c, { orgId: ctx.member.orgId, checkin: ctx.query.checkin, checkout: ctx.query.checkout, adults, children }, { now: ctx.now }));
    return { roomTypes };
  });

  app.route('POST', '/api/quotes', async (ctx) => {
    requirePerm(ctx, 'quote.create');
    const m = ctx.member;
    const b = ctx.body;
    const plan = isAgentRole(m.role) ? 'public' : (b.plan ?? 'public');
    if (!['public', 'ctv'].includes(plan)) throw new AppError('bad_plan', 'Gói giá không hợp lệ');
    return tx(async (c) => {
      const plans = await ensureRatePlans(c, { orgId: m.orgId });
      const q = await createQuote(c, { orgId: m.orgId, roomTypeId: b.roomTypeId, planId: plans[plan], checkin: b.checkin, checkout: b.checkout, adults: b.adults ?? 1, childAges: b.childAges ?? [], by: m.id }, { now: ctx.now });
      if (!q.ok) return { ok: false, warnings: q.warnings };
      const out = { ok: true, id: q.id, expiresAt: q.expiresAt, subtotal: q.subtotal, vat: q.vat, total: q.total, deposit: q.deposit, lines: q.lines.map((l) => ({ night: l.night, amount: l.amount })) };
      if (isAgentRole(m.role)) out.commission = Math.floor((q.subtotal * (await agentCommissionPct(c, m.orgId, m.agentId))) / 100);
      return out;
    });
  });

  // ---- Đơn ----
  app.route('POST', '/api/bookings', async (ctx) => {
    requirePerm(ctx, 'booking.create');
    const m = ctx.member;
    const b = ctx.body;
    const agent = isAgentRole(m.role);
    if (agent && b.unitId) throw new AppError('forbidden', 'Bạn chỉ được đặt theo loại phòng', 403);
    // Chỉ quản lý được gán đơn cho một sale/CTV (đơn gắn hoa hồng); lễ tân thì không.
    if (!agent && b.agentId && m.role !== 'quanly') throw new AppError('forbidden', 'Chỉ quản lý được gán đơn cho sale/CTV', 403);
    const input = {
      orgId: m.orgId, checkin: b.checkin, checkout: b.checkout, guestName: b.guestName, guestPhone: b.guestPhone ?? null,
      adults: b.adults ?? 1, children: b.children ?? 0, quoteId: b.quoteId ?? null, createdBy: m.id,
      source: agent ? 'agent' : 'staff', agentId: agent ? m.agentId : (b.agentId ?? null), status: 'giu',
    };
    if (!agent && b.status === 'da_coc') {
      if (m.role !== 'quanly') throw new AppError('forbidden', 'Chỉ quản lý được tạo đơn đã cọc trực tiếp', 403);
      input.status = 'da_coc';
    }
    if (!b.unitId && !b.roomTypeId) throw new AppError('missing_target', 'Cần chọn căn hoặc loại phòng', 400);
    return tx(async (c) => {
      const made = b.unitId ? await createBooking(c, { ...input, unitId: b.unitId }, { now: ctx.now }) : await createBookingForType(c, { ...input, roomTypeId: b.roomTypeId }, { now: ctx.now });
      const row = await getBooking(c, { orgId: m.orgId, bookingId: made.id });
      return { booking: shapeBooking(row, { staff: !agent }) };
    });
  });

  app.route('GET', '/api/bookings', async (ctx) => {
    const m = ctx.member;
    let agentId = null;
    if (can(m.role, 'booking.read.all')) { /* tất cả */ } else if (can(m.role, 'booking.read.own')) agentId = m.agentId; else requirePerm(ctx, 'booking.read.all');
    const q = ctx.query;
    const rows = await tx((c) => listBookings(c, { orgId: m.orgId, agentId, from: q.from ?? null, to: q.to ?? null, status: q.status ?? null, limit: q.limit }));
    return { bookings: rows.map((r) => shapeBooking(r, { staff: agentId === null })) };
  });

  async function loadForRole(ctx, c) {
    const m = ctx.member;
    let agentId = null;
    if (can(m.role, 'booking.read.all')) { /* tất cả */ } else if (can(m.role, 'booking.read.own')) agentId = m.agentId; else requirePerm(ctx, 'booking.read.all');
    const row = await getBooking(c, { orgId: m.orgId, bookingId: ctx.params.id, agentId });
    if (!row) throw new AppError('not_found', 'Không tìm thấy đơn', 404); // đơn của người khác cũng 404, không lộ sự tồn tại
    return { row, staff: agentId === null };
  }

  app.route('GET', '/api/bookings/:id', async (ctx) => tx(async (c) => {
    const { row, staff } = await loadForRole(ctx, c);
    const out = { booking: shapeBooking(row, { staff }) };
    if (staff) Object.assign(out, await bookingDetail(c, { orgId: ctx.member.orgId, bookingId: row.id }));
    return out;
  }));

  app.route('GET', '/api/bookings/:id/balance', async (ctx) => {
    requirePerm(ctx, 'booking.read.all');
    return tx((c) => bookingBalance(c, { orgId: ctx.member.orgId, bookingId: ctx.params.id }));
  });

  app.route('POST', '/api/bookings/:id/cancel', async (ctx) => {
    const m = ctx.member;
    const b = ctx.body;
    return tx(async (c) => {
      let row;
      if (can(m.role, 'booking.cancel')) {
        row = await getBooking(c, { orgId: m.orgId, bookingId: ctx.params.id });
      } else if (can(m.role, 'booking.cancel.own')) {
        row = await getBooking(c, { orgId: m.orgId, bookingId: ctx.params.id, agentId: m.agentId });
      } else requirePerm(ctx, 'booking.cancel');
      if (!row) throw new AppError('not_found', 'Không tìm thấy đơn', 404);
      // Lễ tân và sale/CTV không xử lý tiền cọc: đơn đã thu tiền phải do quản lý hủy (chọn giữ lại/hoàn). Kiểm ngay trong cancelBooking, sau khi khóa đơn.
      return cancelBooking(c, { orgId: m.orgId, bookingId: row.id, reason: b.reason ?? null, retainAmount: b.retainAmount, by: m.id, requireNoPayments: m.role !== 'quanly' }, { now: ctx.now });
    });
  });

  app.route('POST', '/api/bookings/:id/move', async (ctx) => {
    requirePerm(ctx, 'booking.move');
    const b = ctx.body;
    return tx((c) => moveBooking(c, { orgId: ctx.member.orgId, bookingId: ctx.params.id, unitId: b.unitId, checkin: b.checkin, checkout: b.checkout, expectedVersion: b.expectedVersion ?? null, quoteId: b.quoteId ?? null, by: ctx.member.id }, { now: ctx.now }));
  });

  app.route('POST', '/api/bookings/:id/checkin', async (ctx) => {
    requirePerm(ctx, 'booking.checkin');
    return tx((c) => checkIn(c, { orgId: ctx.member.orgId, bookingId: ctx.params.id, by: ctx.member.id }));
  });

  app.route('POST', '/api/bookings/:id/checkout', async (ctx) => {
    requirePerm(ctx, 'booking.checkout');
    return tx((c) => checkOut(c, { orgId: ctx.member.orgId, bookingId: ctx.params.id, by: ctx.member.id }, { now: ctx.now }));
  });

  // Thu/hoàn tiền thủ công. Hoàn tiền chỉ quản lý. Phương thức luôn là manual_bank: client không được tự nhận là webhook.
  app.route('POST', '/api/bookings/:id/payments', async (ctx) => {
    const b = ctx.body;
    requirePerm(ctx, b.kind === 'refund' ? 'payment.refund' : 'payment.record');
    return tx((c) => recordPayment(c, { orgId: ctx.member.orgId, bookingId: ctx.params.id, kind: b.kind, amount: b.amount, receivedOn: b.receivedOn, note: typeof b.note === 'string' ? b.note : '', by: ctx.member.id, ref: b.ref, method: 'manual_bank' }));
  });
}
