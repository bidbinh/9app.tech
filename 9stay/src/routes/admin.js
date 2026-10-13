import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { requirePerm } from '../auth.js';
import { ensureRatePlans, setRates, createPromotion } from '../pricing.js';
import { setSetting } from '../settings.js';
import { createAgent } from '../agents.js';
import { custodyReport } from '../statements.js';
import { audit } from '../audit.js';

async function planId(c, orgId, code) {
  if (code === undefined || code === null) return null;
  if (!['public', 'ctv'].includes(code)) throw new AppError('bad_plan', 'Gói giá không hợp lệ');
  return (await ensureRatePlans(c, { orgId }))[code];
}

// Việc của quản lý: giá, ưu đãi, cài đặt, sale/CTV, báo cáo tiền giữ hộ.
export function adminRoutes(app) {
  app.route('PUT', '/api/rates', async (ctx) => {
    requirePerm(ctx, 'rates.write');
    const b = ctx.body;
    return tx(async (c) => {
      const pid = await planId(c, ctx.member.orgId, b.plan ?? 'public');
      const r = await setRates(c, { orgId: ctx.member.orgId, roomTypeId: b.roomTypeId, planId: pid, from: b.from, to: b.to, price: b.price, minStay: b.minStay ?? 1, closed: b.closed ?? false, by: ctx.member.id });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'rates.set', target: b.roomTypeId, data: { plan: b.plan ?? 'public', from: b.from, to: b.to, price: b.price, closed: b.closed ?? false } });
      return r;
    });
  });

  app.route('POST', '/api/promotions', async (ctx) => {
    requirePerm(ctx, 'promotion.write');
    const b = ctx.body;
    return tx(async (c) => {
      const pid = await planId(c, ctx.member.orgId, b.plan);
      return createPromotion(c, { orgId: ctx.member.orgId, name: b.name, kind: b.kind, value: b.value, minNights: b.minNights ?? 1, stayFrom: b.stayFrom, stayTo: b.stayTo, planId: pid, roomTypeId: b.roomTypeId ?? null });
    });
  });

  app.route('PUT', '/api/settings', async (ctx) => {
    requirePerm(ctx, 'settings.write');
    const b = ctx.body;
    await tx(async (c) => {
      await setSetting(c, { orgId: ctx.member.orgId, scopeType: b.scopeType, scopeId: b.scopeId ?? null, key: b.key, value: b.value, effectiveFrom: b.effectiveFrom });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'settings.set', target: b.key, data: { scopeType: b.scopeType, scopeId: b.scopeId ?? null, value: b.value, effectiveFrom: b.effectiveFrom } });
    });
    return { ok: true };
  });

  app.route('POST', '/api/agents', async (ctx) => {
    requirePerm(ctx, 'agent.manage');
    const b = ctx.body;
    return tx(async (c) => {
      const a = await createAgent(c, { orgId: ctx.member.orgId, name: b.name, kind: b.kind, commissionPct: b.commissionPct });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'agent.create', target: a.id, data: { kind: b.kind, commissionPct: b.commissionPct } });
      return a;
    });
  });

  app.route('GET', '/api/reports/custody', async (ctx) => {
    requirePerm(ctx, 'report.custody');
    return tx((c) => custodyReport(c, { orgId: ctx.member.orgId }));
  });
}
