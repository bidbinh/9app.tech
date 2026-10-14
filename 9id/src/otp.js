import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query, tx } from './db.js';
import { hmac, phoneHash, safeEqualHex, sha256hex, newToken, TOKEN_RE, normalizePhone } from './util.js';
import { getProvider } from './otp-provider.js';
import { consume } from './throttle.js';
import { consumePow } from './pow.js';
import { isPhoneHeld } from './phone-hold.js';

export const ipKey = (ip) => hmac('ip', ip || '').slice(0, 24);
const codeHash = (ph, salt, code) => hmac('otp', `${ph}|${salt}|${code}`);
// 'verify': chỉ xác minh quyền dùng số (app khác nhờ qua /internal/v1/otp/*), không dẫn tới tạo tài khoản; có hạn mức riêng theo số
export const PURPOSES = ['register', 'reset', 'phone_change', 'verify'];

// Cảnh báo khi dùng 50% và 80% trần OTP toàn hệ trong 24 giờ (ghi log một lần mỗi mức mỗi ngày)
const warned = { day: '', 50: false, 80: false };
export function usageLevel(used, cap) { const r = cap > 0 ? used / cap : 0; return r >= 0.8 ? 80 : r >= 0.5 ? 50 : 0; }
export function resetWarned() { warned.day = ""; warned[50] = false; warned[80] = false; }
function warnUsage(used, cap) {
  const day = new Date().toISOString().slice(0, 10);
  if (warned.day !== day) { warned.day = day; warned[50] = false; warned[80] = false; }
  const lvl = usageLevel(used, cap);
  for (const l of [50, 80]) if (lvl >= l && !warned[l]) { warned[l] = true; console.warn(`[otp] cảnh báo: đã dùng ${used}/${cap} mã OTP trong 24 giờ (từ ${l}% trần)`); }
}

// Gửi OTP tới số E.164. Thứ tự: số hợp lệ -> proof-of-work -> hạn mức (trong giao dịch có khóa tư vấn, nên gửi đồng thời không vượt).
// Phản hồi giống nhau dù số có tài khoản hay không.
export async function requestOtp(phone, ip, { purpose = 'register', pow, skipPow = false } = {}) {
  if (!PURPOSES.includes(purpose)) throw new ApiError(400, 'invalid_input', 'Mục đích không hợp lệ');
  // skipPow: chỉ cho đường nội bộ đã xác thực HMAC theo app (app tự chống lạm dụng ở phía nó; hạn mức theo số/IP/toàn hệ vẫn áp dụng)
  if (!skipPow) await consumePow(pow);
  const ph = phoneHash(phone);
  const ipk = ipKey(ip);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = crypto.randomBytes(8).toString('hex');
  const exists = purpose === 'reset' ? (await query('SELECT 1 FROM users WHERE phone=$1', [phone])).length > 0 : false;
  const row = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(9103)');
    const st = (await c.query(
      `SELECT count(*) FILTER (WHERE purpose = $2)::int AS n_purpose,
              max(created_at) > now() - make_interval(secs => $3) AS recent,
              max(expires_at) FILTER (WHERE used_at IS NULL AND expires_at > now()) AS live_until
         FROM otps WHERE phone_hash=$1 AND created_at > now() - interval '24 hours'`, [ph, purpose, config.otpResendSec]))[0];
    if (st.recent) {
      const left = st.live_until ? Math.max(1, Math.ceil((new Date(st.live_until).getTime() - Date.now()) / 60000)) : 0;
      throw new ApiError(429, 'otp_too_soon', left
        ? `Mã vừa gửi vẫn còn hiệu lực khoảng ${left} phút. Hãy nhập mã đó; chỉ xin mã mới nếu mã chưa đến sau ${config.otpResendSec} giây.`
        : `Vui lòng đợi ${config.otpResendSec} giây trước khi xin mã mới`, { retryAfterSec: config.otpResendSec });
    }
    // hạn mức xin mã tách riêng cho đăng ký và đặt lại mật khẩu: xin nhiều mã đăng ký không chặn việc đặt lại mật khẩu
    if (st.n_purpose >= config.otpDailyPerPhone) throw new ApiError(429, 'otp_limit', 'Số này đã nhận quá nhiều mã trong ngày. Hãy thử lại vào ngày mai.');
    const perIp = (await c.query("SELECT count(*)::int AS n FROM otps WHERE ip_key=$1 AND created_at > now() - interval '24 hours'", [ipk]))[0].n;
    if (perIp >= config.otpDailyPerIp) throw new ApiError(429, 'otp_limit', 'Thiết bị hoặc mạng này đã xin quá nhiều mã trong ngày. Hãy thử lại vào ngày mai.');
    const tot = (await c.query("SELECT count(*) FILTER (WHERE NOT reserved)::int AS general, count(*) FILTER (WHERE reserved)::int AS reserved FROM otps WHERE created_at > now() - interval '24 hours'"))[0];
    // ngân sách dành riêng: đặt lại mật khẩu của tài khoản ĐÃ TỒN TẠI vẫn gửi được khi trần chung đã cạn
    let reserved = false;
    if (tot.general >= config.otpDailyGlobal) {
      if (exists && tot.reserved < config.otpDailyReserved) reserved = true;
      else throw new ApiError(503, 'otp_unavailable', 'Hệ thống tạm dừng gửi mã hôm nay, hãy thử lại sau.');
    }
    const r = (await c.query(
      'INSERT INTO otps(phone_hash, code_hash, salt, expires_at, ip_key, purpose, reserved) VALUES($1,$2,$3, now() + make_interval(secs => $4), $5, $6, $7) RETURNING id',
      [ph, codeHash(ph, salt, code), salt, config.otpTtlSec, ipk, purpose, reserved]))[0];
    warnUsage(tot.general + (reserved ? 0 : 1), config.otpDailyGlobal);
    return r;
  });
  try {
    await getProvider()(phone, code);
  } catch (e) {
    // chỉ ghi loại lỗi, không ghi số hay mã
    console.error('[otp] gửi không được:', String(e && e.message).slice(0, 80));
    await query('DELETE FROM otps WHERE id=$1', [row.id]).catch(() => {});
    throw new ApiError(503, 'otp_unavailable', 'Không gửi được mã lúc này, hãy thử lại sau ít phút');
  }
  return { ok: true, resendAfterSec: config.otpResendSec, ttlSec: config.otpTtlSec };
}

// Kiểm mã. Lần sai đếm theo (OTP, IP): 5 lần sai từ CÙNG một IP, hoặc 20 lần sai tổng cộng, hoặc 25 lần dò mỗi ngày mỗi số thì khóa.
// Nhờ vậy kẻ lạ ở IP khác không đốt được mã của chủ số bằng vài lần nhập bừa, mà vẫn không dò được 10^6 khả năng.
// noTicket: chỉ xác nhận mã (đốt mã), KHÔNG cấp vé đăng ký/đặt lại, nên người xác minh qua app khác không có đường tạo tài khoản.
export async function verifyOtp(phone, code, ip, { noTicket = false } = {}) {
  const ipk = ipKey(ip);
  await consume('vi:' + ipk, { limit: config.verifyPerIpHour, windowSec: 3600, message: 'Bạn nhập mã quá nhiều lần, hãy thử lại sau' });
  const ph = phoneHash(phone);
  const invalid = () => new ApiError(400, 'otp_invalid', 'Mã không đúng hoặc đã hết hạn');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw invalid();
  const c6 = code.trim();
  const out = await tx(async (c) => {
    const o = (await c.query(
      'SELECT id, code_hash, salt, tries FROM otps WHERE phone_hash=$1 AND used_at IS NULL AND expires_at > now() ORDER BY id DESC LIMIT 1 FOR UPDATE', [ph]))[0];
    if (!o) return { err: invalid() };
    const mine = (await c.query('SELECT n FROM otp_fails WHERE otp_id=$1 AND ip_key=$2', [o.id, ipk]))[0];
    const daily = (await c.query("SELECT coalesce(sum(tries),0)::int AS n FROM otps WHERE phone_hash=$1 AND created_at > now() - interval '24 hours'", [ph]))[0].n;
    if (o.tries >= config.otpMaxTriesTotal || daily >= config.otpDailyGuesses) return { err: new ApiError(429, 'otp_locked', 'Mã này đã bị nhập sai quá nhiều lần, hãy xin mã mới (hoặc thử lại vào ngày mai)') };
    if (mine && mine.n >= config.otpMaxTries) return { err: new ApiError(429, 'otp_locked', 'Bạn đã nhập sai quá nhiều lần ở thiết bị hoặc mạng này, hãy xin mã mới') };
    if (!safeEqualHex(o.code_hash, codeHash(ph, o.salt, c6))) {
      await c.query('UPDATE otps SET tries = tries + 1 WHERE id=$1', [o.id]);
      await c.query('INSERT INTO otp_fails(otp_id, ip_key, n) VALUES($1,$2,1) ON CONFLICT (otp_id, ip_key) DO UPDATE SET n = otp_fails.n + 1', [o.id, ipk]);
      return { err: invalid() };
    }
    await c.query('UPDATE otps SET used_at = now() WHERE phone_hash=$1 AND used_at IS NULL', [ph]);
    if (noTicket) return { verified: true };
    const token = newToken();
    await c.query('INSERT INTO tickets(token_hash, phone_hash, expires_at) VALUES($1,$2, now() + make_interval(secs => $3))', [sha256hex(token), ph, config.ticketTtlSec]);
    const exists = (await c.query('SELECT 1 FROM users WHERE phone=$1', [phone])).length > 0;
    return { ticket: token, accountExists: exists };
  });
  if (out.err) throw out.err;
  if (out.verified) return { verified: true };
  // số này vừa được đổi khỏi một tài khoản trong cửa sổ hoàn tác? (chỉ người đã chứng minh sở hữu số mới thấy cờ này)
  return { ...out, phoneChangeUndoable: await isPhoneHeld(null, phone) };
}

const ticketBad = () => new ApiError(400, 'ticket_invalid', 'Phiên xác minh số điện thoại đã hết hạn. Hãy xác minh lại số điện thoại.');

// Vé chỉ lưu băm số; yêu cầu đăng ký/đặt lại phải gửi kèm số, và băm của số đó phải khớp vé.
// Trả số E.164 đã chuẩn hóa. Xem vé mà không tiêu (để kiểm tên/mật khẩu trước khi tiêu).
export async function peekTicket(token, phoneInput) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw ticketBad();
  let phone;
  try { phone = normalizePhone(phoneInput); } catch { throw ticketBad(); }
  const r = (await query('SELECT 1 FROM tickets WHERE token_hash=$1 AND phone_hash=$2 AND used_at IS NULL AND expires_at > now()', [sha256hex(token), phoneHash(phone)]))[0];
  if (!r) throw ticketBad();
  return phone;
}

// Tiêu vé nguyên tử trong giao dịch c: hai yêu cầu đồng thời chỉ một thắng. Giao dịch hỏng thì vé không bị đốt.
export async function consumeTicket(c, token, phone) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw ticketBad();
  const r = (await c.query('UPDATE tickets SET used_at = now() WHERE token_hash=$1 AND phone_hash=$2 AND used_at IS NULL AND expires_at > now() RETURNING 1', [sha256hex(token), phoneHash(phone)]))[0];
  if (!r) throw ticketBad();
  return phone;
}
