import * as wallet from '../wallet.js';
import * as topup from '../topup.js';
import * as withdrawals from '../withdrawals.js';
import * as claims from '../claims.js';
import { requireStepUp } from '../auth.js';
import { ApiError } from '../errors.js';

export function moneyRoutes(app) {
  app.route('GET', '/v1/wallet', async (ctx) => wallet.get(ctx.user.id), { auth: 'user' });

  app.route('POST', '/v1/wallet/topups', async (ctx) => topup.create(ctx.user.id, ctx.body?.amount), { auth: 'user', limit: 10, limitKey: 'topup' });
  app.route('GET', '/v1/wallet/topups/:id', async (ctx) => topup.status(ctx.user.id, ctx.params.id), { auth: 'user' });

  // Webhook thông báo tiền vào: HMAC-SHA256 của thân yêu cầu bằng BANK_WEBHOOK_SECRET, header x-signature.
  // Thân: { transactions: [{ id, amount, content }] }. Nhà cung cấp thật cần một lớp chuyển đổi định dạng (xem SETUP-CHECKLIST).
  app.route('POST', '/v1/webhooks/bank', async (ctx) => {
    topup.verifyBankSignature(ctx.raw, ctx.headers['x-signature']);
    let body;
    try { body = JSON.parse(ctx.raw); } catch { throw new ApiError(400, 'bad_json', 'JSON không hợp lệ'); }
    const results = [];
    for (const t of body.transactions || []) {
      results.push(await topup.ingestBankTx({ bankTxId: t.id, amount: t.amount, content: t.content, raw: t }));
    }
    return { ok: true, results };
  }, { raw: true, noCsrf: true, limit: 600, limitKey: 'bankhook' });

  // Rút tiền: bắt buộc xác thực lại bằng OTP trong 5 phút gần nhất.
  app.route('POST', '/v1/wallet/withdrawals', async (ctx) => {
    await requireStepUp(ctx);
    return withdrawals.request(ctx.user.id, ctx.body || {}, ctx.headers['idempotency-key']);
  }, { auth: 'user', limit: 10, limitKey: 'wd' });
  app.route('GET', '/v1/wallet/withdrawals', async (ctx) => ({ items: await withdrawals.listForUser(ctx.user.id) }), { auth: 'user' });
  app.route('POST', '/v1/wallet/withdrawals/:id/cancel', async (ctx) => withdrawals.transition(ctx.params.id, 'cancel', { actor: 'user', byUserId: ctx.user.id }), { auth: 'user' });

  app.route('POST', '/v1/claims', async (ctx) => claims.create(ctx.user.id, ctx.body || {}), { auth: 'user', limit: 10, limitKey: 'claims' });
  app.route('GET', '/v1/claims', async (ctx) => ({ items: await claims.list(ctx.user.id) }), { auth: 'user' });
}
