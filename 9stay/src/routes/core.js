import { tx, query } from '../db.js';
import { AppError } from '../errors.js';
import { assertUuid } from '../ids.js';
import { requirePerm } from '../auth.js';
import { config } from '../config.js';
import { audit } from '../audit.js';
import { createInvite, redeemInvite, getMemberByUser, setMemberStatus } from '../access.js';

const publicMember = (m) => (m ? { role: m.role, orgId: m.orgId, ownerId: m.ownerId, agentId: m.agentId, displayName: m.displayName } : null);

export function coreRoutes(app, cfg = config) {
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; }, { auth: 'none' });

  // Cho người đã đăng nhập 9id nhưng chưa là thành viên: member = null để giao diện hiện ô nhập mã mời.
  app.route('GET', '/api/me', async (ctx) => {
    const m = await tx((c) => getMemberByUser(c, ctx.user.userId));
    return { userId: ctx.user.userId, displayName: ctx.user.displayName, member: publicMember(m) };
  }, { auth: 'user' });

  // ---- Mã mời ----
  // Tạo mã mời: mã chỉ hiện đúng một lần trong phản hồi này.
  app.route('POST', '/api/invites', async (ctx) => {
    requirePerm(ctx, 'invite.create');
    const b = ctx.body;
    return tx(async (c) => {
      const inv = await createInvite(c, { orgId: ctx.member.orgId, role: b.role, ownerId: b.ownerId ?? null, agentId: b.agentId ?? null, createdBy: ctx.member.id, ttlDays: b.ttlDays ?? 7 }, { now: ctx.now });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'invite.create', target: inv.id, data: { role: b.role } });
      return { id: inv.id, code: inv.code, expiresAt: inv.expiresAt };
    });
  });

  // Mã đang chờ dùng (không có chính mã, vì chỉ lưu băm).
  app.route('GET', '/api/invites', async (ctx) => {
    requirePerm(ctx, 'invite.create');
    const rows = await tx((c) => c.query(
      `SELECT id, role, owner_id, agent_id, expires_at, created_at FROM invites
        WHERE org_id = $1 AND used_at IS NULL AND expires_at > $2::timestamptz ORDER BY created_at DESC LIMIT 200`,
      [ctx.member.orgId, ctx.now],
    ));
    return { invites: rows.map((r) => ({ id: r.id, role: r.role, ownerId: r.owner_id, agentId: r.agent_id, expiresAt: r.expires_at, createdAt: r.created_at })) };
  });

  app.route('POST', '/api/invites/:id/revoke', async (ctx) => {
    requirePerm(ctx, 'invite.create');
    return tx(async (c) => {
      assertUuid(ctx.params.id, 'mã mời');
      const rows = await c.query('UPDATE invites SET expires_at = $3::timestamptz WHERE id = $1 AND org_id = $2 AND used_at IS NULL AND expires_at > $3::timestamptz RETURNING id', [ctx.params.id, ctx.member.orgId, ctx.now]);
      if (!rows.length) throw new AppError('not_found', 'Không tìm thấy mã mời chưa dùng', 404);
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'invite.revoke', target: ctx.params.id });
      return { ok: true };
    });
  });

  // Hạn mức chặt vì đây là chỗ có thể bị dò mã.
  app.route('POST', '/api/invites/redeem', async (ctx) => {
    const m = await tx((c) => redeemInvite(c, { code: ctx.body.code, userId: ctx.user.userId, displayName: ctx.user.displayName }, { now: ctx.now }));
    return { member: publicMember(m) };
  }, { auth: 'user', limit: cfg.redeemLimitPerMin });

  // ---- Thành viên ----
  app.route('GET', '/api/members', async (ctx) => {
    requirePerm(ctx, 'member.manage');
    const rows = await tx((c) => c.query('SELECT id, display_name, role, owner_id, agent_id, status, created_at FROM members WHERE org_id = $1 ORDER BY created_at', [ctx.member.orgId]));
    return { members: rows.map((r) => ({ id: r.id, displayName: r.display_name, role: r.role, ownerId: r.owner_id, agentId: r.agent_id, status: r.status, createdAt: r.created_at })) };
  });

  // Khóa/mở thành viên. Không tự khóa mình, và luôn còn ít nhất một quản lý hoạt động (tránh khóa mất cả tổ chức).
  app.route('POST', '/api/members/:id/status', async (ctx) => {
    requirePerm(ctx, 'member.manage');
    const status = ctx.body.status;
    return tx(async (c) => {
      assertUuid(ctx.params.id, 'thành viên');
      const [t] = await c.query('SELECT id, role FROM members WHERE id = $1 AND org_id = $2 FOR UPDATE', [ctx.params.id, ctx.member.orgId]);
      if (!t) throw new AppError('not_found', 'Không tìm thấy thành viên', 404);
      if (status === 'disabled') {
        if (t.id === ctx.member.id) throw new AppError('cannot_self', 'Bạn không thể tự khóa chính mình', 409);
        if (t.role === 'quanly') {
          const [o] = await c.query("SELECT count(*)::int AS n FROM members WHERE org_id = $1 AND role = 'quanly' AND status = 'active' AND id <> $2", [ctx.member.orgId, t.id]);
          if (o.n < 1) throw new AppError('last_manager', 'Phải còn ít nhất một quản lý hoạt động', 409);
        }
      }
      await setMemberStatus(c, { orgId: ctx.member.orgId, memberId: t.id, status });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'member.status', target: t.id, data: { status } });
      return { ok: true };
    });
  });
}
