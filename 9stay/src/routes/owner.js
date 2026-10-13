import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { assertUuid } from '../ids.js';
import { can } from '../access.js';
import { requirePerm } from '../auth.js';
import { openNights, blockNights } from '../inventory.js';
import { nightsBetween } from '../time.js';
import {
  ownerStatement, freezeOwnerStatement, recordOwnerPayout, agentStatement, freezeAgentStatement, recordAgentPayout, statementCsv,
} from '../statements.js';
import { rawResponse } from '../http.js';

const notFound = () => new AppError('not_found', 'Không tìm thấy', 404);

export function ownerRoutes(app) {
  // ---- Chủ phòng / quản lý mở & chặn ngày ----
  app.route('POST', '/api/units/:id/release', async (ctx) => {
    const m = ctx.member;
    const b = ctx.body;
    const any = can(m.role, 'release.any');
    if (!any) requirePerm(ctx, 'release.own');
    return tx(async (c) => {
      assertUuid(ctx.params.id, 'căn');
      const [u] = await c.query('SELECT owner_id FROM units WHERE id = $1 AND org_id = $2', [ctx.params.id, m.orgId]);
      // căn của chủ khác cũng 404: không lộ sự tồn tại
      if (!u || (!any && u.owner_id !== m.ownerId)) throw notFound();
      if (b.action === 'open') {
        const n = await openNights(c, { orgId: m.orgId, unitId: ctx.params.id, from: b.from, to: b.to, by: m.id });
        return { ok: true, nights: n };
      }
      if (b.action === 'block') {
        const nights = Array.isArray(b.nights) ? b.nights : nightsBetween(b.from, b.to);
        const kind = b.kind ?? 'blocked_by_owner';
        const allowed = any ? ['owner_use', 'blocked_by_owner', 'blocked_by_anstay'] : ['owner_use', 'blocked_by_owner'];
        if (!allowed.includes(kind)) throw new AppError('forbidden', 'Loại chặn này không dành cho bạn', 403);
        await blockNights(c, { orgId: m.orgId, unitId: ctx.params.id, nights, kind, by: m.id, now: ctx.now });
        return { ok: true, nights: nights.length };
      }
      throw new AppError('bad_action', 'Hành động không hợp lệ (open hoặc block)');
    });
  });

  // ---- Bản kê chủ phòng ----
  function ownerScope(ctx, requested) {
    const m = ctx.member;
    if (can(m.role, 'statement.owner.read.all')) {
      if (!requested) throw new AppError('missing_owner', 'Cần chọn chủ phòng');
      return requested;
    }
    requirePerm(ctx, 'statement.owner.read.own');
    if (requested && requested !== m.ownerId) throw notFound();
    return m.ownerId;
  }

  app.route('GET', '/api/statements/owner', async (ctx) => {
    const ownerId = ownerScope(ctx, ctx.query.ownerId);
    return tx(async (c) => {
      const { lines, totals } = await ownerStatement(c, { orgId: ctx.member.orgId, ownerId, from: ctx.query.from, to: ctx.query.to });
      return { lines, totals };
    });
  });

  app.route('GET', '/api/statements/owner/list', async (ctx) => {
    const ownerId = ownerScope(ctx, ctx.query.ownerId);
    return tx(async (c) => {
      assertUuid(ownerId, 'chủ phòng');
      const rows = await c.query(
        `SELECT s.id, s.period_start, s.period_end, s.total_room, s.total_owner, s.total_cleaning, s.total_carried, s.payable, s.line_count, s.frozen_at,
                EXISTS (SELECT 1 FROM owner_payouts p WHERE p.statement_id = s.id) AS paid
           FROM owner_statements s WHERE s.org_id = $1 AND s.owner_id = $2 ORDER BY s.period_start DESC, s.frozen_at DESC LIMIT 200`,
        [ctx.member.orgId, ownerId],
      );
      return { statements: rows };
    });
  });

  app.route('POST', '/api/statements/owner/freeze', async (ctx) => {
    requirePerm(ctx, 'statement.freeze');
    const b = ctx.body;
    return tx((c) => freezeOwnerStatement(c, { orgId: ctx.member.orgId, ownerId: b.ownerId, from: b.from, to: b.to, by: ctx.member.id }));
  });

  app.route('POST', '/api/statements/owner/:id/payout', async (ctx) => {
    requirePerm(ctx, 'statement.payout');
    const b = ctx.body;
    return tx((c) => recordOwnerPayout(c, { orgId: ctx.member.orgId, statementId: ctx.params.id, paidOn: b.paidOn, ref: b.ref, by: ctx.member.id }));
  });

  app.route('GET', '/api/statements/owner/:id/csv', async (ctx) => {
    const m = ctx.member;
    return tx(async (c) => {
      assertUuid(ctx.params.id, 'bản kê');
      const [st] = await c.query('SELECT owner_id FROM owner_statements WHERE id = $1 AND org_id = $2', [ctx.params.id, m.orgId]);
      if (!st) throw notFound();
      if (!can(m.role, 'statement.owner.read.all')) {
        requirePerm(ctx, 'statement.owner.read.own');
        if (st.owner_id !== m.ownerId) throw notFound();
      }
      const csv = await statementCsv(c, { orgId: m.orgId, kind: 'owner', statementId: ctx.params.id, bom: true });
      return rawResponse(csv, { contentType: 'text/csv; charset=utf-8', headers: { 'content-disposition': 'attachment; filename="ban-ke-chu-phong.csv"' } });
    });
  });

  // ---- Bản kê hoa hồng ----
  function agentScope(ctx, requested) {
    const m = ctx.member;
    if (can(m.role, 'statement.agent.read.all')) {
      if (!requested) throw new AppError('missing_agent', 'Cần chọn sale/CTV');
      return requested;
    }
    requirePerm(ctx, 'statement.agent.read.own');
    if (requested && requested !== m.agentId) throw notFound();
    return m.agentId;
  }

  app.route('GET', '/api/statements/agent', async (ctx) => {
    const agentId = agentScope(ctx, ctx.query.agentId);
    return tx(async (c) => {
      const { lines, totals } = await agentStatement(c, { orgId: ctx.member.orgId, agentId, from: ctx.query.from, to: ctx.query.to });
      return { lines, totals };
    });
  });

  app.route('POST', '/api/statements/agent/freeze', async (ctx) => {
    requirePerm(ctx, 'statement.freeze');
    const b = ctx.body;
    return tx((c) => freezeAgentStatement(c, { orgId: ctx.member.orgId, agentId: b.agentId, from: b.from, to: b.to, by: ctx.member.id }));
  });

  app.route('POST', '/api/statements/agent/:id/payout', async (ctx) => {
    requirePerm(ctx, 'statement.payout');
    const b = ctx.body;
    return tx((c) => recordAgentPayout(c, { orgId: ctx.member.orgId, statementId: ctx.params.id, paidOn: b.paidOn, ref: b.ref, by: ctx.member.id }));
  });
}
