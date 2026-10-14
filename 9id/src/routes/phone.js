import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import { requireUser, audit } from '../auth.js';
import { reauth } from '../reauth.js';
import { peekTicket, consumeTicket } from '../otp.js';
import { phoneHash } from '../util.js';
import { isPhoneHeld, unavailable } from '../phone-hold.js';
import { rememberDevice, publicUser } from './auth.js';

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
        await c.query('INSERT INTO phone_changes(user_id, old_phone, new_phone_hash) VALUES($1,$2,$3)', [u.id, u.phone, phoneHash(phone)]);
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
}
