// Giữ chỗ số cũ sau khi đổi số: trong phoneUndoDays ngày (và chưa hoàn tác) không ai khác đăng ký hay đổi sang số đó,
// để chủ số cũ còn hoàn tác được. Tách khỏi routes/ để routes/auth.js và routes/phone.js cùng dùng mà không vòng import.
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';

export const PHONE_UNAVAILABLE = 'Không thể dùng số này hoặc mã chưa đúng';
export const unavailable = (status = 400) => new ApiError(status, 'phone_unavailable', PHONE_UNAVAILABLE);

// c: ngữ cảnh giao dịch ({query}) hoặc null. exceptUserId: bỏ qua việc giữ chỗ của chính người này.
export async function isPhoneHeld(c, phone, exceptUserId = null) {
  const q = c && c.query ? (s, p) => c.query(s, p) : query;
  const rows = await q(
    `SELECT 1 FROM phone_changes
      WHERE old_phone = $1 AND undone_at IS NULL AND changed_at > now() - make_interval(days => $2)
        AND ($3::uuid IS NULL OR user_id <> $3::uuid) LIMIT 1`, [phone, config.phoneUndoDays, exceptUserId]);
  return rows.length > 0;
}
