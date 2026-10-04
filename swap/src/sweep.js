// Dọn định kỳ: tin hết hạn, ảnh của tin đã đóng, thông báo và khóa idempotency cũ.
// Độ đúng không phụ thuộc vào việc dọn: mọi truy vấn đều tự xét expires_at; dọn chỉ để ghi trạng thái, báo người đăng và giải phóng dung lượng.
import { query } from './db.js';
import { config } from './config.js';
import { notify } from './lib.js';

export async function sweep() {
  const expired = await query(
    "UPDATE listings SET status='het_han', closed_at=now(), updated_at=now() WHERE status IN ('mo','giu') AND expires_at <= now() RETURNING id, author_id, title, recipient_id");
  for (const l of expired) {
    await notify({ query }, l.author_id, { type: 'expired', text: `Tin "${l.title}" đã hết hạn và được ẩn. Bấm gia hạn nếu vẫn còn đồ.`, listingId: l.id });
    if (l.recipient_id) await notify({ query }, l.recipient_id, { type: 'expired', text: `Tin "${l.title}" đã hết hạn. Hãy nhắn người đăng để chốt việc nhận đồ.`, listingId: l.id });
  }
  await query(`UPDATE threads SET closed_at = now() WHERE closed_at IS NULL AND created_at < now() - interval '${config.emptyThreadDays} days'
    AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id)
    AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.id = threads.listing_id AND l.recipient_id = threads.member_id)`);
  const posts = await query("UPDATE board_posts SET status='het_han' WHERE status='mo' AND expires_at <= now() RETURNING id");
  const photos = await query(
    `DELETE FROM listing_photos WHERE listing_id IN (
       SELECT id FROM listings WHERE (status IN ('xong','huy','go') AND closed_at < now() - interval '${config.photoKeepDaysAfterClose} days')
                                  OR (status = 'het_han' AND closed_at < now() - interval '30 days')) RETURNING 1`);
  await query("DELETE FROM notifications WHERE created_at < now() - interval '60 days'");
  await query("DELETE FROM idem WHERE created_at < now() - interval '2 days'");
  return { expired: expired.length, posts: posts.length, photos: photos.length };
}

export function startSweeper(everyMs = 3600_000) {
  const run = () => sweep().catch((e) => console.error('[sweep] lỗi:', e && e.message));
  const t = setInterval(run, everyMs);
  t.unref();
  run();
  return () => clearInterval(t);
}
