import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { LIMITS } from './listing-meta.js';

// Ảnh lưu thành tệp trong {dataDir}/photos/<tin>/<ảnh>. Máy chủ KHÔNG giải mã ảnh (tránh lỗi thư viện ảnh): chỉ kiểm byte đầu tệp,
// cỡ tệp và số lượng. Trình duyệt đã thu nhỏ trước khi tải.
export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const fileOf = (listingId, photoId, mime) => path.join(config.dataDir, 'photos', listingId, `${photoId}.${EXT[mime]}`);

// Phải chạy trong giao dịch; khóa hàng tin nên hai lần tải đồng thời không vượt số ảnh tối đa.
export async function addPhoto(c, { orgId, listingId, buf }) {
  assertUuid(listingId, 'tin');
  const mime = sniffImage(buf);
  if (!mime) throw new AppError('bad_photo', 'Chỉ nhận ảnh JPEG, PNG hoặc WebP', 415);
  if (buf.length > LIMITS.maxPhotoBytes) throw new AppError('photo_too_big', `Mỗi ảnh tối đa ${Math.round(LIMITS.maxPhotoBytes / 1000)} KB (ảnh được tự thu nhỏ trước khi tải)`, 413);
  const [l] = await c.query('SELECT id, owner_id FROM listings WHERE id = $1 AND org_id = $2 FOR UPDATE', [listingId, orgId]);
  if (!l) throw new AppError('not_found', 'Không tìm thấy tin', 404);
  // khóa theo chủ phòng: tải song song vào nhiều tin của cùng chủ vẫn xếp hàng nên hạn mức dung lượng không bị vượt
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['photos:' + l.owner_id]);
  const [cnt] = await c.query('SELECT count(*)::int AS n, COALESCE(max(position), -1)::int AS mx FROM listing_photos WHERE listing_id = $1', [listingId]);
  if (cnt.n >= LIMITS.maxPhotos) throw new AppError('too_many_photos', `Tối đa ${LIMITS.maxPhotos} ảnh mỗi tin`, 409);
  const [tot] = await c.query('SELECT COALESCE(sum(p.bytes), 0)::bigint AS b FROM listing_photos p JOIN listings x ON x.id = p.listing_id WHERE x.owner_id = $1', [l.owner_id]);
  if (tot.b + buf.length > LIMITS.maxOwnerPhotoBytes) throw new AppError('photo_quota', 'Đã hết dung lượng ảnh của chủ phòng, hãy xóa bớt ảnh cũ', 409);
  const id = crypto.randomUUID();
  const dest = fileOf(listingId, id, mime);
  await c.query('INSERT INTO listing_photos(id, listing_id, position, bytes, mime) VALUES($1, $2, $3, $4, $5)', [id, listingId, cnt.mx + 1, buf.length, mime]);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest + '.tmp', buf, { flag: 'wx' });
  await fs.rename(dest + '.tmp', dest);
  // giao dịch hỏng sau bước này thì tệp mồ côi được dọn bởi sweepOrphanPhotos
  return { id, position: cnt.mx + 1 };
}

export async function deletePhoto(c, { orgId, listingId, photoId }) {
  assertUuid(listingId, 'tin');
  assertUuid(photoId, 'ảnh');
  const [p] = await c.query('SELECT p.id, p.mime FROM listing_photos p JOIN listings l ON l.id = p.listing_id WHERE p.id = $1 AND p.listing_id = $2 AND l.org_id = $3 FOR UPDATE OF p', [photoId, listingId, orgId]);
  if (!p) throw new AppError('not_found', 'Không tìm thấy ảnh', 404);
  await c.query('DELETE FROM listing_photos WHERE id = $1', [photoId]);
  return { removeFile: fileOf(listingId, photoId, p.mime) }; // route xóa tệp SAU khi commit
}

export const removeFile = (file) => fs.rm(file, { force: true });

// ids = thứ tự mới của TOÀN BỘ ảnh (ảnh đầu là ảnh bìa).
export async function reorderPhotos(c, { orgId, listingId, ids }) {
  assertUuid(listingId, 'tin');
  const [l] = await c.query('SELECT id FROM listings WHERE id = $1 AND org_id = $2 FOR UPDATE', [listingId, orgId]);
  if (!l) throw new AppError('not_found', 'Không tìm thấy tin', 404);
  const cur = (await c.query('SELECT id FROM listing_photos WHERE listing_id = $1', [listingId])).map((r) => r.id).sort();
  if (!Array.isArray(ids) || ids.length !== cur.length || [...ids].sort().some((x, i) => x !== cur[i])) throw new AppError('bad_input', 'Danh sách ảnh không khớp ảnh hiện có');
  for (let i = 0; i < ids.length; i++) await c.query('UPDATE listing_photos SET position = $2 WHERE id = $1', [ids[i], i]);
}

// Đọc tệp ảnh; ném 404 nếu thiếu. Kiểm quyền xem là việc của route.
export async function readPhoto(c, photoId) {
  assertUuid(photoId, 'ảnh');
  const [p] = await c.query('SELECT p.id, p.listing_id, p.mime, l.status, l.owner_id, l.org_id FROM listing_photos p JOIN listings l ON l.id = p.listing_id WHERE p.id = $1', [photoId]);
  if (!p) throw new AppError('not_found', 'Không tìm thấy ảnh', 404);
  return p;
}
export async function loadFile(p) {
  try { return await fs.readFile(fileOf(p.listing_id, p.id, p.mime)); } catch { throw new AppError('not_found', 'Không tìm thấy ảnh', 404); }
}

// Dọn thư mục ảnh của tin không còn trong CSDL (tin nháp bị xóa).
export async function removeListingFiles(listingId) {
  await fs.rm(path.join(config.dataDir, 'photos', listingId), { recursive: true, force: true });
}

// Dọn tệp ảnh không còn dòng CSDL (tải lên rồi giao dịch hỏng, hoặc tin bị xóa khi tiến trình dừng giữa chừng). Chỉ xóa tệp cũ hơn 1 giờ.
export async function sweepOrphanPhotos(c, { now = new Date() } = {}) {
  const root = path.join(config.dataDir, 'photos');
  let dirs = [];
  try { dirs = await fs.readdir(root); } catch { return { removed: 0 }; }
  const known = new Set((await c.query('SELECT id FROM listing_photos')).map((r) => r.id));
  let removed = 0;
  for (const d of dirs) {
    const dir = path.join(root, d);
    let files = [];
    try { files = await fs.readdir(dir); } catch { continue; }
    for (const f of files) {
      const id = f.replace(/\.(jpg|png|webp)(\.tmp)?$/, '');
      if (known.has(id) && !f.endsWith('.tmp')) continue;
      try {
        const st = await fs.stat(path.join(dir, f));
        if (now.getTime() - st.mtimeMs < 3600_000) continue;
        await fs.rm(path.join(dir, f), { force: true }); removed += 1;
      } catch { /* đã mất */ }
    }
    try { if (!(await fs.readdir(dir)).length) await fs.rmdir(dir); } catch { /* không rỗng */ }
  }
  return { removed };
}
