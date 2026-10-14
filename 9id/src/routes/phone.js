import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import { requireUser, audit } from '../auth.js';
import { reauth } from '../reauth.js';
import { peekTicket, consumeTicket } from '../otp.js';
import { phoneHash, phoneHashes } from '../util.js';
import { isPhoneHeld, unavailable } from '../phone-hold.js';
import * as pw from '../password.js';
import { rememberDevice, publicUser, startSession } from './auth.js';

export function phoneRoutes(app) {
  // Đổi số điện thoại: vé OTP của số MỚI + nhập lại mật khẩu. Thành công thì số cũ được giữ chỗ phoneUndoDays ngày (cho phép hoàn tác).
  app.route('POST', '/api/phone/change', async (ctx) => {
    const user = requireUser(ctx);
    const phone = await peekTicket(ctx.body.ticket, ctx.body.phone); // chưa tiêu vé: sai mật khẩu không đốt vé
    if (phone === user.phone) throw unavailable();
    await reauth(user.id, ctx.body.password);
    let updated;
    try {
      updated = await tx(async (c) => {
        const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id]))[0];
        if (!u) throw new ApiError(401, 'unauthorized', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.');
        if (u.phone === phone) throw unavailable();
        const recent = (await c.query(
          `SELECT changed_at + make_interval(days => $2) AS until FROM phone_changes
            WHERE user_id=$1 AND changed_at > now() - make_interval(days => $2) ORDER BY changed_at DESC LIMIT 1`, [u.id, config.phoneChangeDays]))[0];
        if (recent) {
          const left = Math.max(1, Math.ceil((new Date(recent.until).getTime() - Date.now()) / 86400000));
          throw new ApiError(429, 'phone_change_cooldown', `Bạn vừa đổi số điện thoại. Có thể đổi lại sau ${left} ngày.`);
        }
        if ((await c.query('SELECT 1 FROM users WHERE phone=$1', [phone])).length) throw unavailable();
        if (await isPhoneHeld(c, phone, u.id)) throw unavailable();
        await consumeTicket(c, ctx.body.ticket, phone);
        const nu = (await c.query('UPDATE users SET phone=$2, phone_verified_at=now() WHERE id=$1 RETURNING *', [u.id, phone]))[0];
        await c.query('INSERT INTO phone_changes(user_id, old_phone_hash, new_phone_hash) VALUES($1,$2,$3)', [u.id, phoneHash(u.phone), phoneHash(phone)]);
        // thu hồi mọi phiên khác, thiết bị quen và phiên con của app tên miền con; giữ phiên hiện tại
        await c.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash <> $2', [u.id, ctx.sid]);
        await c.query('DELETE FROM devices WHERE user_id=$1', [u.id]);
        await c.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
        await c.query("INSERT INTO notices(user_id, kind) VALUES($1,'phone_changed')", [u.id]);
        await audit(c, u.id, 'phone_changed');
        return nu;
      });
    } catch (e) {
      if (e && e.code === '23505') throw unavailable(); // hai yêu cầu đồng thời sang cùng một số: chỉ một thắng
      throw e;
    }
    await rememberDevice(ctx, user.id);
    return { ok: true, user: publicUser(updated) };
  }, { limit: 20, limitKey: 'phone-change' });

  // Hoàn tác đổi số: người giữ SỐ CŨ (đã xác minh OTP số cũ) lấy lại tài khoản trong phoneUndoDays ngày, bắt buộc đặt mật khẩu mới.
  // Không cần phiên (người dùng vừa bị đuổi khỏi tài khoản). Mọi phiên/thiết bị cũ bị xóa nên kẻ đã đổi số bị đuổi.
  app.route('POST', '/api/phone/undo', async (ctx) => {
    const phone = await peekTicket(ctx.body.ticket, ctx.body.phone);
    const password = pw.check(ctx.body.password, phone);
    const hash = await pw.hash(password);
    const cannot = () => new ApiError(400, 'undo_unavailable', 'Không thể hoàn tác: số này không được đổi gần đây, đã quá hạn hoặc đã được hoàn tác.');
    const user = await tx(async (c) => {
      const pc = (await c.query(
        `SELECT id, user_id, new_phone_hash FROM phone_changes
          WHERE old_phone_hash = ANY($1) AND undone_at IS NULL AND closed_at IS NULL AND changed_at > now() - make_interval(days => $2)
          ORDER BY changed_at DESC LIMIT 1 FOR UPDATE`, [phoneHashes(phone), config.phoneUndoDays]))[0];
      if (!pc) throw cannot();
      const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [pc.user_id]))[0];
      if (!u || !phoneHashes(u.phone).includes(pc.new_phone_hash)) throw cannot(); // đã đổi tiếp sang số khác (so cả băm theo pepper cũ khi đang xoay)
      if ((await c.query('SELECT 1 FROM users WHERE phone=$1', [phone])).length) throw cannot();
      await consumeTicket(c, ctx.body.ticket, phone);
      const nu = (await c.query('UPDATE users SET phone=$2, password_hash=$3, password_weak=false, phone_verified_at=now() WHERE id=$1 RETURNING *', [u.id, phone, hash]))[0];
      await c.query('UPDATE phone_changes SET undone_at = now() WHERE id=$1', [pc.id]);
      await c.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
      await c.query('DELETE FROM devices WHERE user_id=$1', [u.id]);
      await c.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
      await c.query("INSERT INTO notices(user_id, kind) VALUES($1,'phone_change_undone')", [u.id]);
      await audit(c, u.id, 'phone_change_undone');
      return nu;
    });
    return startSession(ctx, user);
  }, { limit: 20, limitKey: 'phone-undo' });

  // Khóa hoàn tác: chủ tài khoản biết số cũ không còn do mình giữ (đã đưa/trả SIM) thì tắt khả năng hoàn tác và thả số cũ.
  app.route('POST', '/api/phone/undo-lock', async (ctx) => {
    const user = requireUser(ctx);
    await reauth(user.id, ctx.body.password);
    const r = await query(
      `UPDATE phone_changes SET closed_at = now()
        WHERE user_id=$1 AND undone_at IS NULL AND closed_at IS NULL AND changed_at > now() - make_interval(days => $2) RETURNING id`, [user.id, config.phoneUndoDays]);
    if (!r.length) throw new ApiError(400, 'nothing_to_lock', 'Không có lần đổi số nào đang trong thời gian hoàn tác.');
    await audit(null, user.id, 'phone_undo_locked');
    return { ok: true };
  }, { limit: 20, limitKey: 'phone-undo-lock' });
}
