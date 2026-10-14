// Dọn dữ liệu rác định kỳ (mỗi lần giữ phòng/OTP/báo giá bị bỏ dở đều để lại một dòng). Không đụng dữ liệu tiền, đơn, sổ.
export async function cleanup(c, { now = new Date() } = {}) {
  const otp = await c.query("DELETE FROM otp_codes WHERE created_at < $1::timestamptz - interval '2 days' RETURNING 1", [now]);
  const sess = await c.query('DELETE FROM otp_sessions WHERE expires_at < $1::timestamptz RETURNING 1', [now]);
  // báo giá hết hạn quá 7 ngày và chưa từng được dùng cho đơn nào
  const quotes = await c.query(
    `DELETE FROM quotes q WHERE q.expires_at < $1::timestamptz - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM quote_uses u WHERE u.quote_id = q.id) AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.quote_id = q.id) RETURNING 1`,
    [now],
  );
  return { otpCodes: otp.length, otpSessions: sess.length, quotes: quotes.length };
}
