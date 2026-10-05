import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import * as pw from '../password.js';
import { requireUser, audit, COOKIE } from '../auth.js';
import { reauth } from '../reauth.js';
import { raw } from '../http.js';
import { cleanText, uuidParam, uuidBody, notFound, phoneHashes } from '../util.js';
import { transferOwner, listMembers } from '../families.js';
import { rememberDevice } from './auth.js';

export function accountRoutes(app) {
  const R = (method, path, handler, opts) => app.route(method, path, async (ctx) => { requireUser(ctx); return handler(ctx); }, opts);

  R('POST', '/api/account/name', async (ctx) => {
    const name = cleanText(ctx.body.name, { min: 1, max: 40, field: 'Tên hiển thị' });
    await query('UPDATE users SET display_name=$2 WHERE id=$1', [ctx.user.id, name]);
    return { ok: true, displayName: name };
  });

  // Đổi mật khẩu: cần mật khẩu hiện tại; xong thì đăng xuất các thiết bị khác
  R('POST', '/api/account/password', async (ctx) => {
    const next = pw.check(ctx.body.newPassword, ctx.user.phone);
    await reauth(ctx.user.id, ctx.body.currentPassword);
    const hash = await pw.hash(next);
    await tx(async (c) => {
      await c.query('UPDATE users SET password_hash=$2, password_weak=false WHERE id=$1', [ctx.user.id, hash]);
      await c.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash <> $2', [ctx.user.id, ctx.sid]);
      await c.query('DELETE FROM devices WHERE user_id=$1', [ctx.user.id]);
      await c.query('DELETE FROM app_sessions WHERE user_id=$1', [ctx.user.id]); // thu hồi mọi phiên con của app ở tên miền con
      await audit(c, ctx.user.id, 'password_changed');
    });
    await rememberDevice(ctx, ctx.user.id);
    return { ok: true };
  }, { limit: 20, limitKey: 'pw-change' });

  // ---------- thiết bị ----------
  R('GET', '/api/sessions', async (ctx) => {
    const rows = await query('SELECT id, ua, created_at, last_used_at, token_hash FROM sessions WHERE user_id=$1 ORDER BY last_used_at DESC', [ctx.user.id]);
    return { sessions: rows.map((r) => ({ id: r.id, device: r.ua, createdAt: r.created_at, lastUsedAt: r.last_used_at, current: r.token_hash === ctx.sid })) };
  });

  R('DELETE', '/api/sessions/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const r = await query('DELETE FROM sessions WHERE id=$1 AND user_id=$2 RETURNING token_hash', [id, ctx.user.id]);
    if (!r.length) throw notFound();
    if (r[0].token_hash === ctx.sid) ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  });

  R('POST', '/api/sessions/revoke-others', async (ctx) => {
    const r = await query('DELETE FROM sessions WHERE user_id=$1 AND token_hash <> $2 RETURNING id', [ctx.user.id, ctx.sid]);
    return { ok: true, revoked: r.length };
  });

  R('POST', '/api/logout-all', async (ctx) => {
    await query('DELETE FROM sessions WHERE user_id=$1', [ctx.user.id]);
    await query('DELETE FROM app_sessions WHERE user_id=$1', [ctx.user.id]);
    await audit(null, ctx.user.id, 'logout_all');
    ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  });

  // ---------- xuất dữ liệu cá nhân ----------
  // xuất dữ liệu cá nhân bắt nhập lại mật khẩu (phiên bị đánh cắp không rút được dữ liệu)
  R('POST', '/api/account/export', async (ctx) => {
    await reauth(ctx.user.id, ctx.body.password);
    const u = (await query('SELECT id, phone, display_name, source, created_at, phone_verified_at FROM users WHERE id=$1', [ctx.user.id]))[0];
    const sessions = await query('SELECT ua, created_at, last_used_at FROM sessions WHERE user_id=$1 ORDER BY created_at', [u.id]);
    const families = await query(
      `SELECT f.id, f.name, m.role, m.joined_at FROM memberships m JOIN families f ON f.id = m.family_id WHERE m.user_id=$1 AND m.left_at IS NULL ORDER BY m.joined_at`, [u.id]);
    const children = await query(
      `SELECT c.id, c.family_id, c.name, c.birth_year, c.created_at FROM child_profiles c WHERE c.linked_user_id=$1 OR c.created_by=$1 ORDER BY c.created_at`, [u.id]);
    const invites = await query(
      `SELECT i.id, f.name AS family_name, i.kind, i.status, i.created_at, i.expires_at FROM invitations i JOIN families f ON f.id = i.family_id WHERE i.phone_hash = ANY($1) OR i.invited_by=$2 ORDER BY i.created_at`, [phoneHashes(u.phone), u.id]);
    const body = {
      exportedAt: new Date().toISOString(),
      account: { id: u.id, phone: u.phone, displayName: u.display_name, source: u.source, createdAt: u.created_at, phoneVerifiedAt: u.phone_verified_at },
      devices: sessions.map((s) => ({ device: s.ua, createdAt: s.created_at, lastUsedAt: s.last_used_at })),
      families: families.map((f) => ({ id: f.id, name: f.name, role: f.role, joinedAt: f.joined_at })),
      childProfiles: children.map((c) => ({ id: c.id, familyId: c.family_id, name: c.name, birthYear: c.birth_year, createdAt: c.created_at })),
      invitations: invites.map((i) => ({ id: i.id, familyName: i.family_name, kind: i.kind, status: i.status, createdAt: i.created_at, expiresAt: i.expires_at })),
    };
    return raw(JSON.stringify(body, null, 2), { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="9app-du-lieu-ca-nhan.json"', 'cache-control': 'no-store' });
  });

  // ---------- xóa tài khoản ----------
  // Chủ gia đình nào thì BẮT BUỘC chọn: chuyển quyền cho một người lớn hoặc xóa gia đình đó. Chưa chọn đủ: 409 kèm danh sách.
  R('POST', '/api/account/delete', async (ctx) => {
    await reauth(ctx.user.id, ctx.body.password);
    const decisions = ctx.body.decisions && typeof ctx.body.decisions === 'object' && !Array.isArray(ctx.body.decisions) ? ctx.body.decisions : {};
    const uid = ctx.user.id;
    const result = await tx(async (c) => {
      // khóa các gia đình do mình làm chủ theo thứ tự id (không kẹt khóa)
      const owned = await c.query(
        `SELECT f.id, f.name FROM memberships m JOIN families f ON f.id = m.family_id
          WHERE m.user_id=$1 AND m.role='chu' AND m.left_at IS NULL ORDER BY f.id FOR UPDATE OF f`, [uid]);
      const pending = [];
      for (const f of owned) {
        const d = decisions[f.id];
        if (!d || (d.action !== 'delete' && d.action !== 'transfer')) {
          const adults = (await listMembers(c.query, f.id, 'chu', uid)).filter((m) => (m.role === 'quan_ly' || m.role === 'thanh_vien'));
          pending.push({ id: f.id, name: f.name, candidates: adults.map((a) => ({ userId: a.userId, displayName: a.displayName, role: a.role })) });
        }
      }
      if (pending.length) return { needs: pending };
      for (const f of owned) {
        const d = decisions[f.id];
        if (d.action === 'transfer') await transferOwner(c, f.id, uid, uuidBody(d.toUserId, 'Người nhận quyền chủ'));
        else await c.query('DELETE FROM families WHERE id=$1', [f.id]);
      }
      await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE invited_by=$1 AND status IN ('pending','awaiting')", [uid]);
      await audit(c, null, 'account_deleted', `source=${ctx.user.source}`);
      await c.query('DELETE FROM users WHERE id=$1', [uid]);
      return { done: true };
    });
    if (result.needs) throw new ApiError(409, 'needs_decision', 'Bạn đang là chủ của gia đình. Hãy chọn chuyển quyền hoặc xóa gia đình trước khi xóa tài khoản.', { families: result.needs });
    ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  }, { limit: 10, limitKey: 'acct-delete' });
}
