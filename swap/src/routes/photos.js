import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden, notFound } from '../auth.js';
import { uuidParam } from '../util.js';
import { raw } from '../http.js';
import { inspectImage } from '../image.js';
import { post, LISTING_SELECT, loadListing, canSee, live } from '../lib.js';

// Yêu cầu tải ảnh: thân = [ảnh nhỏ][ảnh chính], header X-Thumb-Length cho biết độ dài ảnh nhỏ.
// Cả hai đều bị kiểm byte thật; tên tệp và Content-Type của khách không được dùng ở đâu cả.
const MAX_BODY = config.maxPhotoBytes + config.maxThumbBytes + 16;

export function photoRoutes(app) {
  post(app, '/api/listings/:id/photos', async (ctx) => {
    const tl = ctx.headers['x-thumb-length'];
    if (!/^\d{1,7}$/.test(String(tl || ''))) throw new ApiError(400, 'bad_image', 'Thiếu độ dài ảnh nhỏ');
    const thumbLen = Number(tl);
    const buf = ctx.buf;
    if (thumbLen <= 0 || thumbLen >= buf.length) throw new ApiError(400, 'bad_image', 'Độ dài ảnh nhỏ không hợp lệ');
    const thumb = buf.subarray(0, thumbLen);
    const main = buf.subarray(thumbLen);
    const ti = inspectImage(thumb, { maxBytes: config.maxThumbBytes });
    const mi = inspectImage(main, { maxBytes: config.maxPhotoBytes });
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới thêm ảnh cho tin này');
      if (!live(l)) throw new ApiError(409, 'closed', 'Tin đã đóng nên không thêm ảnh được');
      // hạn mức theo cộng đồng: khóa tư vấn theo cộng đồng để hai lần tải đồng thời không vượt hạn mức
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['photos:' + l.community_id]);
      const used = (await c.query('SELECT COALESCE(sum(bytes),0)::bigint AS s FROM listing_photos WHERE community_id=$1', [l.community_id]))[0].s;
      const size = main.length + thumb.length;
      if (Number(used) + size > config.maxPhotoBytesPerCommunity) throw new ApiError(413, 'quota', 'Cộng đồng đã dùng hết dung lượng ảnh. Chủ cộng đồng nên gỡ bớt tin cũ.');
      const mine = (await c.query('SELECT COALESCE(sum(p.bytes),0)::bigint AS s FROM listing_photos p JOIN listings x ON x.id = p.listing_id WHERE x.author_id=$1', [me.id]))[0].s;
      if (Number(mine) + size > config.maxPhotoBytesPerMember) throw new ApiError(413, 'quota', 'Bạn đã dùng hết dung lượng ảnh cho phép. Hãy xóa ảnh của tin cũ trước khi thêm.');
      const have = await c.query('SELECT pos FROM listing_photos WHERE listing_id=$1', [l.id]);
      if (have.length >= config.maxPhotosPerListing) throw new ApiError(409, 'too_many', `Mỗi tin tối đa ${config.maxPhotosPerListing} ảnh`);
      const taken = new Set(have.map((r) => r.pos));
      let pos = 0; while (taken.has(pos)) pos++;
      const r = (await c.query(
        'INSERT INTO listing_photos(listing_id, community_id, pos, mime, bytes, data, thumb) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [l.id, l.community_id, pos, mi.mime, size, Buffer.from(main), Buffer.from(thumb)]))[0];
      return { id: r.id, pos, mime: mi.mime, thumbMime: ti.mime };
    });
  }, { binary: true, maxBody: MAX_BODY, limit: 40, limitKey: 'photo' });

  app.route('DELETE', '/api/photos/:id', async (ctx) => {
    const pid = uuidParam(ctx.params.id);
    return tx(async (c) => {
      const p = (await c.query('SELECT id, listing_id FROM listing_photos WHERE id=$1', [pid]))[0];
      if (!p) throw notFound();
      const { l, me } = await loadListing(c.query, ctx, p.listing_id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới xóa được ảnh');
      await c.query('DELETE FROM listing_photos WHERE id=$1', [pid]);
      return { ok: true };
    });
  }, { noCsrf: false });

  async function serve(ctx, field) {
    const pid = uuidParam(ctx.params.id);
    const p = (await query(`SELECT id, listing_id, community_id, mime, ${field} AS img FROM listing_photos WHERE id=$1`, [pid]))[0];
    if (!p) throw notFound();
    // phải là thành viên đang hoạt động của cộng đồng chứa ảnh, và được phép thấy tin chứa ảnh
    const me = await requireMember(query, ctx, p.community_id);
    const l = (await query(`${LISTING_SELECT} WHERE l.id=$1`, [p.listing_id]))[0];
    if (!l || !canSee(l, me)) throw notFound();
    const mime = field === 'thumb' ? inspectImage(p.img).mime : p.mime;
    return raw(p.img, {
      'content-type': mime,
      'content-length': String(p.img.length),
      'content-disposition': 'inline; filename="photo"',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
      'cache-control': 'private, max-age=86400',
    });
  }
  app.route('GET', '/api/photos/:id', (ctx) => serve(ctx, 'data'));
  app.route('GET', '/api/photos/:id/t', (ctx) => serve(ctx, 'thumb'));
}
