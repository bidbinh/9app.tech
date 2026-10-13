import { tx, query } from '../db.js';
import { requirePerm } from '../auth.js';
import { config } from '../config.js';
import { createInvite, redeemInvite, getMemberByUser } from '../access.js';

const publicMember = (m) => (m ? { role: m.role, orgId: m.orgId, ownerId: m.ownerId, agentId: m.agentId, displayName: m.displayName } : null);

export function coreRoutes(app, cfg = config) {
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; }, { auth: 'none' });

  // Cho người đã đăng nhập 9id nhưng chưa là thành viên: member = null để giao diện hiện ô nhập mã mời.
  app.route('GET', '/api/me', async (ctx) => {
    const m = await tx((c) => getMemberByUser(c, ctx.user.userId));
    return { userId: ctx.user.userId, displayName: ctx.user.displayName, member: publicMember(m) };
  }, { auth: 'user' });

  // Tạo mã mời: mã chỉ hiện đúng một lần trong phản hồi này.
  app.route('POST', '/api/invites', async (ctx) => {
    requirePerm(ctx, 'invite.create');
    const b = ctx.body;
    const inv = await tx((c) => createInvite(c, { orgId: ctx.member.orgId, role: b.role, ownerId: b.ownerId ?? null, agentId: b.agentId ?? null, createdBy: ctx.member.id, ttlDays: b.ttlDays ?? 7 }, { now: ctx.now }));
    return { code: inv.code, expiresAt: inv.expiresAt };
  });

  // Hạn mức chặt vì đây là chỗ có thể bị dò mã.
  app.route('POST', '/api/invites/redeem', async (ctx) => {
    const m = await tx((c) => redeemInvite(c, { code: ctx.body.code, userId: ctx.user.userId, displayName: ctx.user.displayName }, { now: ctx.now }));
    return { member: publicMember(m) };
  }, { auth: 'user', limit: cfg.redeemLimitPerMin });
}
