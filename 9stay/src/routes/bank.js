import crypto from 'node:crypto';
import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { can } from '../access.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { getBooking } from '../queries.js';
import { getBankAccount, setBankAccount, orgByWebhookToken, ingestBankTx, listInbox, matchManually, dismissInbox, paymentInfo } from '../bank.js';

const eq = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Chữ ký: hex HMAC-SHA256 của thân yêu cầu (header x-signature), hoặc "Authorization: Apikey <bí mật>" (kiểu SePay).
export function webhookAuthorized(req, rawBody, secret) {
  if (!secret) return false;
  const sig = req.headers['x-signature'];
  if (sig) return eq(String(sig).toLowerCase(), crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const auth = String(req.headers.authorization || '');
  return /^apikey /i.test(auth) && eq(auth.slice(7).trim(), secret);
}

// Chuẩn hóa thân yêu cầu về một dạng. Hỗ trợ dạng chung ({id, amount, content, time}) và tên trường của SePay
// ({id, transferType, transferAmount, content, transactionDate, accountNumber}). Tên trường của nhà cung cấp thật còn chờ kiểm bằng sandbox.
export function normalizeWebhook(b) {
  const id = b.id ?? b.transactionId ?? b.tid;
  const amount = b.amount ?? b.transferAmount;
  const direction = b.transferType ?? b.type ?? 'in';
  return {
    bankTxId: id === undefined || id === null ? '' : String(id),
    amount: typeof amount === 'number' ? amount : Number.NaN,
    content: typeof b.content === 'string' ? b.content : (typeof b.description === 'string' ? b.description : ''),
    occurredAt: b.time ?? b.transactionDate ?? b.when ?? null,
    incoming: String(direction).toLowerCase() === 'in' || String(direction).toLowerCase() === 'credit',
    accountNumber: b.accountNumber === undefined ? null : String(b.accountNumber),
  };
}

export function bankRoutes(app, cfg) {
  // Webhook: không cookie, không CSRF; xác thực bằng bí mật dùng chung + mã trong đường dẫn. Trả 200 cho giao dịch đã xử lý (kể cả trùng) để nhà cung cấp không gửi lại mãi.
  app.route('POST', '/api/bank/webhook/:token', async (ctx) => {
    if (!webhookAuthorized(ctx.req, ctx.rawBody, cfg.bankWebhookSecret)) throw new AppError('unauthenticated', 'Chữ ký không hợp lệ', 401);
    const w = normalizeWebhook(ctx.body);
    const org = await tx((c) => orgByWebhookToken(c, ctx.params.token));
    if (!org) throw new AppError('unauthenticated', 'Chữ ký không hợp lệ', 401);
    if (!w.incoming) return { ok: true, ignored: 'outgoing' };
    if (w.accountNumber !== null && w.accountNumber !== org.accountNumber) return { ok: true, ignored: 'other_account' };
    const r = await tx((c) => ingestBankTx(c, {
      orgId: org.orgId, provider: 'webhook', bankTxId: w.bankTxId, amount: w.amount, content: w.content, occurredAt: w.occurredAt,
      raw: { id: w.bankTxId, amount: w.amount, content: w.content, time: w.occurredAt },
    }, { now: ctx.now }));
    return { ok: true, status: r.status, duplicate: r.duplicate };
  }, { auth: 'none', csrf: false, limit: 300 });

  app.route('GET', '/api/bank/account', async (ctx) => {
    requirePerm(ctx, 'bank.configure');
    const a = await tx((c) => getBankAccount(c, ctx.member.orgId));
    if (!a) return { configured: false };
    return { configured: true, bankBin: a.bank_bin, accountNumber: a.account_number, accountHolder: a.account_holder, webhookPath: `${cfg.basePath}/api/bank/webhook/${a.webhook_token}` };
  });

  app.route('PUT', '/api/bank/account', async (ctx) => {
    requirePerm(ctx, 'bank.configure');
    const b = ctx.body;
    return tx(async (c) => {
      const r = await setBankAccount(c, { orgId: ctx.member.orgId, bin: b.bankBin, account: b.accountNumber, holder: b.accountHolder, rotate: b.rotateToken === true });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'bank.account.set', target: null, data: { bankBin: b.bankBin, rotated: b.rotateToken === true } });
      return { ok: true, webhookPath: `${cfg.basePath}/api/bank/webhook/${r.webhookToken}` };
    });
  });

  app.route('GET', '/api/bank/inbox', async (ctx) => {
    requirePerm(ctx, 'bank.review');
    const lim = ctx.query.limit === undefined ? 100 : Number(ctx.query.limit);
    return { items: await tx((c) => listInbox(c, { orgId: ctx.member.orgId, status: ctx.query.status ?? null, limit: lim })) };
  });

  app.route('POST', '/api/bank/inbox/:id/match', async (ctx) => {
    requirePerm(ctx, 'bank.review');
    return tx(async (c) => {
      const r = await matchManually(c, { orgId: ctx.member.orgId, inboxId: ctx.params.id, bookingId: ctx.body.bookingId, by: ctx.member.id }, { now: ctx.now });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'bank.match', target: ctx.params.id, data: { bookingId: ctx.body.bookingId } });
      return r;
    });
  });

  app.route('POST', '/api/bank/inbox/:id/dismiss', async (ctx) => {
    requirePerm(ctx, 'bank.review');
    return tx(async (c) => {
      const r = await dismissInbox(c, { orgId: ctx.member.orgId, inboxId: ctx.params.id, note: ctx.body.note });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'bank.dismiss', target: ctx.params.id, data: { note: String(ctx.body.note).slice(0, 300) } });
      return r;
    });
  });

  // Mã QR chuyển khoản cho một đơn. Nhân viên xem mọi đơn; sale/CTV chỉ đơn của mình (để gửi QR cho khách).
  app.route('GET', '/api/bookings/:id/payment-info', async (ctx) => {
    const m = ctx.member;
    let agentId = null;
    if (can(m.role, 'payment.record')) { /* nhân viên */ } else if (can(m.role, 'booking.read.own')) agentId = m.agentId; else requirePerm(ctx, 'payment.record');
    return tx(async (c) => {
      const row = await getBooking(c, { orgId: m.orgId, bookingId: ctx.params.id, agentId });
      if (!row) throw new AppError('not_found', 'Không tìm thấy đơn', 404);
      return paymentInfo(c, { orgId: m.orgId, bookingId: row.id });
    });
  });
}
