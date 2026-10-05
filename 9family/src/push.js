// Web Push (VAPID): kiểm tra endpoint, gửi từ hàng đợi push_outbox (SKIP LOCKED, thử lại, dọn thuê bao hỏng).
import https from 'node:https';
import webpush from 'web-push';
import { config } from './config.js';
import { query, tx } from './db.js';
import { clock } from './clock.js';
import { ApiError } from './errors.js';

export const pushEnabled = () => !!(config.vapidPublic && config.vapidPrivate);

// Chỉ nhận endpoint của các dịch vụ đẩy thật (chống SSRF: máy chủ không được gọi vào địa chỉ nội bộ tùy ý)
const HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function checkEndpoint(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new ApiError(400, 'invalid_input', 'Địa chỉ đẩy thông báo không hợp lệ'); }
  if (String(raw).length > 1000 || u.protocol !== 'https:' || u.username || u.password) throw new ApiError(400, 'invalid_input', 'Địa chỉ đẩy thông báo không hợp lệ');
  if (!config.pushAllowAnyHost && !HOSTS.some((re) => re.test(u.hostname))) throw new ApiError(400, 'invalid_input', 'Dịch vụ đẩy thông báo này chưa được hỗ trợ');
  return u.href;
}

let agent;
let senderOverride = null;
export function setPushSender(fn) { senderOverride = fn; }
export function setPushTlsInsecure(on) { agent = on ? new https.Agent({ rejectUnauthorized: false }) : undefined; }

let vapidReady = false;
async function send(sub, payload, urgent) {
  if (senderOverride) return senderOverride(sub, payload);
  if (!vapidReady) { webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate); vapidReady = true; }
  return webpush.sendNotification(sub, payload, { TTL: 3600, urgency: urgent ? 'high' : 'normal', timeout: 10_000, agent });
}

// Gửi tối đa `limit` thông báo đang chờ. Trả { sent, failed, dropped }.
export async function drainOutbox({ limit = 50, nowMs = clock.now() } = {}) {
  if (!pushEnabled() && !senderOverride) return { sent: 0, failed: 0, dropped: 0 };
  const lockTo = new Date(nowMs + 60_000).toISOString();
  const now = new Date(nowMs).toISOString();
  const claimed = await tx(async (c) => {
    const rows = await c.query(
      `SELECT o.id FROM push_outbox o WHERE o.sent_at IS NULL AND o.attempts < 4 AND (o.locked_until IS NULL OR o.locked_until < $1)
        ORDER BY o.id LIMIT $2 FOR UPDATE SKIP LOCKED`, [now, limit]);
    if (!rows.length) return [];
    return c.query(
      `UPDATE push_outbox o SET attempts = attempts + 1, locked_until = $2 FROM push_subs s
        WHERE o.id = ANY($1::bigint[]) AND s.id = o.sub_id
        RETURNING o.id, o.payload, s.id AS sub_id, s.endpoint, s.p256dh, s.auth`, [rows.map((r) => r.id), lockTo]);
  });
  const out = { sent: 0, failed: 0, dropped: 0 };
  for (const o of claimed) {
    try {
      await send({ endpoint: o.endpoint, keys: { p256dh: o.p256dh, auth: o.auth } }, JSON.stringify(o.payload), o.payload.type === 'ride');
      await query('UPDATE push_outbox SET sent_at = $2 WHERE id = $1 AND sent_at IS NULL', [o.id, now]);
      await query('UPDATE push_subs SET fail_count = 0 WHERE id = $1', [o.sub_id]);
      out.sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) { await query('DELETE FROM push_subs WHERE id = $1', [o.sub_id]); out.dropped++; continue; }
      out.failed++;
      await query('UPDATE push_subs SET fail_count = fail_count + 1 WHERE id = $1', [o.sub_id]);
      // thử lại sau 30 giây, tối đa 4 lần; không ghi nội dung vào nhật ký
      await query('UPDATE push_outbox SET locked_until = $2 WHERE id = $1', [o.id, new Date(nowMs + 30_000).toISOString()]);
    }
  }
  await query(`DELETE FROM push_subs WHERE fail_count >= 20`);
  if (Math.random() < 0.02) await query(`DELETE FROM push_outbox WHERE created_at < now() - interval '2 days'`);
  return out;
}
