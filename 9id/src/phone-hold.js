// Giữ chỗ số cũ sau khi đổi số: trong phoneUndoDays ngày (và chưa hoàn tác/khóa) không ai khác đăng ký hay đổi sang số đó,
// để chủ số cũ còn hoàn tác được. Tách khỏi routes/ để routes/auth.js và routes/phone.js cùng dùng mà không vòng import.
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { phoneHashes } from './util.js';

export const PHONE_UNAVAILABLE = 'Không thể dùng số này hoặc mã chưa đúng';
export const unavailable = (status = 400) => new ApiError(status, 'phone_unavailable', PHONE_UNAVAILABLE);

// c: ngữ cảnh giao dịch ({query}) hoặc null. exceptUserId: bỏ qua việc giữ chỗ của chính người này.
export async function isPhoneHeld(c, phone, exceptUserId = null) {
  const q = c && c.query ? (s, p) => c.query(s, p) : query;
  const rows = await q(
    `SELECT 1 FROM phone_changes
      WHERE old_phone_hash = ANY($1) AND undone_at IS NULL AND closed_at IS NULL AND changed_at > now() - make_interval(days => $2)
        AND ($3::uuid IS NULL OR user_id <> $3::uuid) LIMIT 1`, [phoneHashes(phone), config.phoneUndoDays, exceptUserId]);
  return rows.length > 0;
}

// Lần đổi số của người này còn đang trong thời gian hoàn tác (chưa hoàn tác, chưa khóa): { until } hoặc null
export async function activeUndo(userId) {
  const r = (await query(
    `SELECT changed_at + make_interval(days => $2) AS until FROM phone_changes
      WHERE user_id=$1 AND undone_at IS NULL AND closed_at IS NULL AND changed_at > now() - make_interval(days => $2)
      ORDER BY changed_at DESC LIMIT 1`, [userId, config.phoneUndoDays]))[0];
  return r ? { until: r.until } : null;
}
