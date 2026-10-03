import * as admin from '../admin.js';
import * as worker from '../worker.js';
import * as topup from '../topup.js';
import * as withdrawals from '../withdrawals.js';
import * as claims from '../claims.js';
import { ApiError } from '../errors.js';
import { query } from '../db.js';
import * as auth from '../auth.js';

const A = { auth: 'admin' };
const WHO = 'admin';

export function adminRoutes(app) {
  app.route('GET', '/v1/admin/overview', async () => admin.overview(), A);

  app.route('GET', '/v1/admin/pricing-rules', async () => ({ rules: await admin.listRules() }), A);
  app.route('PUT', '/v1/admin/pricing-rules', async (ctx) => ({ rule: await admin.upsertRule(WHO, ctx.body || {}) }), A);
  app.route('GET', '/v1/admin/list-prices', async () => ({ prices: await admin.listListPrices() }), A);
  app.route('PUT', '/v1/admin/list-prices', async (ctx) => admin.upsertListPrice(WHO, ctx.body || {}), A);
  app.route('PUT', '/v1/admin/settings', async (ctx) => admin.setSetting(WHO, ctx.body?.key, ctx.body?.value), A);

  app.route('GET', '/v1/admin/users', async (ctx) => ({ users: await admin.findUsers(ctx.query.q) }), A);
  app.route('POST', '/v1/admin/credit', async (ctx) => {
    const b = ctx.body || {};
    return admin.manualCredit(WHO, Number(b.userId), b.amount, b.reason, ctx.headers['idempotency-key']);
  }, A);
  app.route('POST', '/v1/admin/aggregator-deposit', async (ctx) => {
    const b = ctx.body || {};
    return admin.recordAggregatorDeposit(WHO, b.amount, b.ref, b.reason);
  }, A);

  app.route('GET', '/v1/admin/shipments', async (ctx) => ({
    shipments: await admin.listShipments({ attention: ctx.query.attention === '1' }),
  }), A);
  app.route('POST', '/v1/admin/shipments/:id/resolve', async (ctx) => {
    const b = ctx.body || {};
    if (!['created', 'not_created'].includes(b.action)) throw new ApiError(400, 'invalid_request', 'action phải là created hoặc not_created');
    if (b.action === 'created' && !b.carrierCode) throw new ApiError(400, 'invalid_request', 'Cần carrierCode khi xác nhận hãng đã tạo');
    const ok = await worker.resolveUnknown(ctx.params.id, b.action, { carrierCode: b.carrierCode, fee: b.fee });
    await admin.audit(WHO, 'shipment.resolve', ctx.params.id, null, b, b.reason || '');
    if (!ok) throw new ApiError(409, 'not_pending', 'Đơn không ở trạng thái chờ xác nhận');
    return { ok: true };
  }, A);

  app.route('GET', '/v1/admin/bank-inbox', async (ctx) => ({ items: await admin.listBankInbox(ctx.query.status || null) }), A);
  app.route('POST', '/v1/admin/bank-inbox/:id/match', async (ctx) => {
    const r = await topup.matchManually(ctx.params.id, Number(ctx.body?.userId), WHO);
    await admin.audit(WHO, 'bank.match', ctx.params.id, null, { userId: ctx.body?.userId }, ctx.body?.reason || '');
    return r;
  }, A);

  app.route('GET', '/v1/admin/withdrawals', async (ctx) => ({ items: await withdrawals.adminList(ctx.query.status || null) }), A);
  app.route('POST', '/v1/admin/withdrawals/:id/:action', async (ctx) => {
    const b = ctx.body || {};
    const r = await withdrawals.transition(ctx.params.id, ctx.params.action, { actor: WHO, bankRef: b.bankRef || '', note: b.note || '' });
    await admin.audit(WHO, 'withdrawal.' + ctx.params.action, ctx.params.id, { status: r.from }, { status: r.status, bankRef: b.bankRef || '' }, b.note || '');
    return r;
  }, A);

  app.route('GET', '/v1/admin/claims', async (ctx) => ({ items: await claims.adminList(ctx.query.status || null) }), A);
  app.route('POST', '/v1/admin/claims/:id', async (ctx) => {
    const b = ctx.body || {};
    const r = await claims.adminUpdate(Number(ctx.params.id), { status: b.status, partnerRef: b.partnerRef, compensation: b.compensation || 0, note: b.note || '' });
    await admin.audit(WHO, 'claim.update', ctx.params.id, null, { status: b.status, compensation: b.compensation || 0 }, b.note || '');
    return r;
  }, A);

  // Cấp mã đăng nhập một lần cho số điện thoại (kênh OTP thủ công). Mọi lần cấp đều được ghi nhật ký.
  app.route('POST', '/v1/admin/otp', async (ctx) => {
    const r = await auth.issueOtp(ctx.body?.phone);
    await admin.audit(WHO, 'otp.issue', r.phone, null, null, ctx.body?.reason || '');
    return r;
  }, { auth: 'admin', limit: 30, limitKey: 'adminotp' });

  app.route('GET', '/v1/admin/audit', async () => ({ items: await admin.listAudit() }), A);
  app.route('GET', '/v1/admin/health', async () => ({ ok: true, db: (await query('SELECT 1 AS ok'))[0].ok === 1 }), A);
}
