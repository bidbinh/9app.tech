// Dữ liệu dựng sẵn cho kiểm thử quyết toán: một đơn 3 đêm (12→15/11) từ báo giá, tổng 2.145.000 (tiền phòng 1.950.000 + VAT 195.000).
import { db, seed, NOW } from './helper.js';
import { ensureRatePlans, setRates, createQuote } from '../src/pricing.js';
import { createBooking } from '../src/bookings.js';
import { createContract } from '../src/inventory.js';
import { createAgent } from '../src/agents.js';
import { recordPayment } from '../src/payments.js';

export async function bookedWorld({ agentPct = 10, contract = {}, noContract = false, pay = 'full', quoted = true } = {}) {
  const w = await seed();
  const plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-12-01', price: 650000 }));
  const agent = agentPct === null ? null : await db.tx((c) => createAgent(c, { orgId: w.orgId, name: 'Hoa', kind: 'ctv', commissionPct: agentPct }));
  let contractRow = null;
  if (!noContract) contractRow = await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom: '2026-01-01', ...contract }));
  const quote = quoted ? await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin: '2026-11-12', checkout: '2026-11-15', adults: 2 }, { now: NOW })) : null;
  const booking = await db.tx((c) => createBooking(c, {
    orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-15', guestName: 'Lan', adults: 2,
    quoteId: quote ? quote.id : undefined, agentId: agent ? agent.id : null,
  }, { now: NOW }));
  if (pay === 'full') await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: booking.id, kind: 'deposit', amount: 2145000, receivedOn: '2026-10-14', ref: 'full' }));
  if (pay === 'deposit') await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: booking.id, kind: 'deposit', amount: 644000, receivedOn: '2026-10-14', ref: 'dep' }));
  return { ...w, plans, agent, contract: contractRow, quote, booking };
}

// Thêm một đơn đã thanh toán đủ, nhận phòng và trả phòng vào thế giới đã có (cần hợp đồng cho căn). Trả { booking, settlementId }.
import { checkIn, checkOut } from '../src/stay.js';
export async function settleNew(w, { unitId, checkin, checkout, outOn, agentId = null, ref }) {
  const unit = unitId || w.unitId;
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: w.plans.public, checkin, checkout, adults: 2 }, { now: NOW }));
  const booking = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: unit, checkin, checkout, guestName: 'Khách ' + ref, adults: 2, quoteId: q.id, agentId }, { now: NOW }));
  await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: booking.id, kind: 'deposit', amount: q.total, receivedOn: '2026-10-14', ref: 'pay-' + ref }));
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: booking.id }));
  const out = await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: booking.id }, { now: new Date(outOn + 'T05:00:00Z') }));
  return { booking, settlementId: out.settlementId, quote: q };
}
