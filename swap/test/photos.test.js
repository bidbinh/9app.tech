// Ảnh: kiểm byte thật, kích thước, hạn mức, quyền xem, tiêu đề phản hồi an toàn
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, ok, db, Client, config, THUMB, fakeJpeg, fakePng, fakeWebp, base } from './helper.js';
import { inspectImage } from '../src/image.js';

before(boot);
after(shutdown);

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
const html = Buffer.from('<html><script>alert(1)</script></html>');
const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40, 1)]);

test('đơn vị: nhận JPEG/PNG/WebP hợp lệ, từ chối SVG/GIF/HTML/rỗng/cụt/kích thước quá lớn', () => {
  assert.deepEqual(inspectImage(fakeJpeg(640, 480)), { mime: 'image/jpeg', width: 640, height: 480 });
  assert.deepEqual(inspectImage(fakePng(300, 200)), { mime: 'image/png', width: 300, height: 200 });
  assert.deepEqual(inspectImage(fakeWebp(321, 123)), { mime: 'image/webp', width: 321, height: 123 });
  for (const bad of [svg, html, gif, Buffer.alloc(0), Buffer.from('xyz'), Buffer.from([0xff, 0xd8, 0xff]), fakeJpeg(640, 480).subarray(0, 40), fakePng().subarray(0, 30), fakeWebp().subarray(0, 20)]) {
    assert.throws(() => inspectImage(bad), (e) => e.status === 400 || e.status === 413);
  }
  assert.throws(() => inspectImage(fakeJpeg(5000, 100)), /Kích thước/);
  assert.throws(() => inspectImage(fakePng(4096, 4096)), /Kích thước/);
  assert.throws(() => inspectImage(fakeJpeg(0, 0)), (e) => e.status === 400);
  assert.throws(() => inspectImage(fakeJpeg(100, 100, 5000), { maxBytes: 1000 }), (e) => e.status === 413);
  // WebP với RIFF size sai (cắt dở / nối thêm)
  assert.throws(() => inspectImage(Buffer.concat([fakeWebp(), Buffer.from('extra')])), (e) => e.status === 400);
});

test('tải ảnh hợp lệ, xem lại đúng nội dung và tiêu đề an toàn; người ngoài không xem được', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const other = await makeCommunity(['X', 'Y']);
  const lid = await makeListing(c, 'Lan');
  const main = fakeJpeg(800, 600, 3000); const thumb = fakeJpeg(120, 90, 800);
  const up = await ok(c.by['Lan'].upload(lid, thumb, main));
  assert.equal(up.pos, 0); assert.equal(up.mime, 'image/jpeg');
  const up2 = await ok(c.by['Lan'].upload(lid, fakePng(60, 60), fakePng(300, 300)));
  assert.equal(up2.pos, 1); assert.equal(up2.mime, 'image/png');
  const l = (await ok(c.by['Minh'].get(`/api/listings/${lid}`))).listing;
  assert.deepEqual(l.photos, [up.id, up2.id]);
  assert.deepEqual((await ok(c.by['Minh'].get(`/api/c/${c.cid}/listings`))).items[0].photos, [up.id, up2.id]);
  const r = await c.by['Minh'].get(`/api/photos/${up.id}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.buf, main);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  assert.equal(r.headers.get('content-disposition'), 'inline; filename="photo"');
  assert.match(r.headers.get('cache-control'), /private/);
  const t = await c.by['Minh'].get(`/api/photos/${up.id}/t`);
  assert.deepEqual(t.buf, thumb);
  assert.equal((await c.by['Minh'].get(`/api/photos/${up2.id}`)).headers.get('content-type'), 'image/png');
  // người không thuộc cộng đồng / cộng đồng khác / chưa đăng nhập
  for (const who of [new Client(), other.by['X'], other.by['Y']]) {
    assert.equal((await who.get(`/api/photos/${up.id}`)).status, 404);
    assert.equal((await who.get(`/api/photos/${up.id}/t`)).status, 404);
  }
  // định dạng đường dẫn lạ
  assert.equal((await c.by['Minh'].get(`/api/photos/${up.id}/x`)).status, 404);
  assert.equal((await c.by['Minh'].get(`/api/photos/..%2f..%2fetc%2fpasswd`)).status, 404);
});

test('từ chối tệp không phải ảnh dù khai Content-Type/tên tệp là ảnh; tên tệp không được dùng', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const lid = await makeListing(c, 'Lan');
  const lan = c.by['Lan'];
  const T = THUMB();
  for (const [name, bad] of [['svg', svg], ['html', html], ['gif', gif], ['text', Buffer.from('hello world, đây không phải ảnh')], ['jpeg cụt', fakeJpeg(640, 480).subarray(0, 42)]]) {
    const r = await lan.upload(lid, T, bad, { headers: { 'content-type': 'image/jpeg', 'content-disposition': 'attachment; filename="evil.php.jpg"' } });
    assert.equal(r.status, 400, name + ' -> ' + r.status);
    assert.equal(r.json.error.code, 'bad_image');
    // ảnh nhỏ giả cũng bị chặn
    const r2 = await lan.upload(lid, bad, fakeJpeg(640, 480, 2000));
    assert.equal(r2.status, 400, name + ' (thumb)');
  }
  assert.equal((await lan.req('POST', `/api/listings/${lid}/photos`, fakeJpeg(), { binary: true })).status, 400, 'thiếu X-Thumb-Length');
  for (const v of ['0', '-5', 'abc', '99999999', '1e3', '']) {
    const r = await lan.req('POST', `/api/listings/${lid}/photos`, Buffer.concat([T, fakeJpeg()]), { binary: true, headers: { 'x-thumb-length': v } });
    assert.equal(r.status, 400, 'x-thumb-length=' + v);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [lid]))[0].n, 0);
  // ảnh JSON thay vì nhị phân
  assert.equal((await lan.post(`/api/listings/${lid}/photos`, { data: 'abc' }, { headers: { 'x-thumb-length': '3' } })).status, 400);
  // tên tệp độc hại không đi vào đâu: ảnh hợp lệ vẫn nhận và phục vụ với tên cố định
  const up = await ok(lan.upload(lid, T, fakeJpeg(400, 300, 1500), { headers: { 'content-disposition': 'attachment; filename="../../etc/passwd"' } }));
  assert.equal((await lan.get(`/api/photos/${up.id}`)).headers.get('content-disposition'), 'inline; filename="photo"');
});

test('giới hạn: kích thước từng ảnh, thân yêu cầu, 4 ảnh/tin, hạn mức cộng đồng, tải đồng thời', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const lan = c.by['Lan'];
  const lid = await makeListing(c, 'Lan');
  const T = THUMB();
  // ảnh chính quá lớn / ảnh nhỏ quá lớn
  let r = await lan.upload(lid, T, fakeJpeg(640, 480, config.maxPhotoBytes + 1));
  assert.equal(r.status, 413);
  r = await lan.upload(lid, fakeJpeg(100, 100, config.maxThumbBytes + 1), fakeJpeg(640, 480, 2000));
  assert.equal(r.status, 413);
  // thân yêu cầu khổng lồ bị cắt sớm theo Content-Length, không đọc hết
  r = await lan.upload(lid, T, Buffer.alloc(3 * 1024 * 1024, 0xab));
  assert.equal(r.status, 413);
  // ảnh vừa đúng giới hạn nhận được
  await ok(lan.upload(lid, T, fakeJpeg(640, 480, config.maxPhotoBytes)));
  // tải đồng thời: tổng 4 ảnh/tin dù 8 yêu cầu song song
  const lid2 = await makeListing(c, 'Lan', { title: 'Tin hai' });
  const results = await Promise.all(Array.from({ length: 8 }, () => lan.upload(lid2, T, fakeJpeg(300, 200, 1000))));
  assert.equal(results.filter((x) => x.status === 200).length, 4);
  assert.equal(results.filter((x) => x.status === 409).length, 4);
  assert.deepEqual((await db.query('SELECT pos FROM listing_photos WHERE listing_id=$1 ORDER BY pos', [lid2])).map((x) => x.pos), [0, 1, 2, 3]);
  // hạn mức dung lượng cộng đồng
  const keep = config.maxPhotoBytesPerCommunity;
  const used = Number((await db.query('SELECT COALESCE(sum(bytes),0)::bigint s FROM listing_photos WHERE community_id=$1', [c.cid]))[0].s);
  config.maxPhotoBytesPerCommunity = used + 10_000;
  try {
    const lid3 = await makeListing(c, 'Lan', { title: 'Tin ba' });
    await ok(lan.upload(lid3, fakeJpeg(100, 100, 500), fakeJpeg(300, 200, 3000)));
    r = await lan.upload(lid3, fakeJpeg(100, 100, 500), fakeJpeg(300, 200, 9000));
    assert.equal(r.status, 413); assert.equal(r.json.error.code, 'quota');
  } finally { config.maxPhotoBytesPerCommunity = keep; }
});

test('xóa ảnh: chỉ người đăng; vị trí được dùng lại; rút tin xóa hết ảnh; ảnh của tin đã đóng không xem được', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const lan = c.by['Lan']; const minh = c.by['Minh'];
  const lid = await makeListing(c, 'Lan');
  const a = await ok(lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900)));
  const b = await ok(lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900)));
  assert.equal((await minh.del(`/api/photos/${a.id}`)).status, 403);
  assert.equal((await c.by['Chủ'].del(`/api/photos/${a.id}`)).status, 403);
  await ok(lan.del(`/api/photos/${a.id}`));
  assert.equal((await minh.get(`/api/photos/${a.id}`)).status, 404);
  const n = await ok(lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900)));
  assert.equal(n.pos, 0, 'vị trí trống được dùng lại');
  await ok(lan.post(`/api/listings/${lid}/cancel`));
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [lid]))[0].n, 0);
  assert.equal((await minh.get(`/api/photos/${b.id}`)).status, 404);
  assert.equal((await lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900))).status, 409, 'tin đã rút không nhận ảnh');
});

test('dọn: ảnh của tin đã xong quá 7 ngày bị xóa, tin còn mở thì giữ nguyên', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const lan = c.by['Lan'];
  const done = await makeListing(c, 'Lan', { title: 'Tin xong' });
  const open = await makeListing(c, 'Lan', { title: 'Tin mở' });
  await ok(lan.upload(done, THUMB(), fakeJpeg(300, 200, 900)));
  await ok(lan.upload(open, THUMB(), fakeJpeg(300, 200, 900)));
  await ok(lan.post(`/api/listings/${done}/complete`));
  const { sweep } = await import('../src/sweep.js');
  await sweep();
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [done]))[0].n, 1, 'mới xong: còn giữ');
  await db.query("UPDATE listings SET closed_at = now() - interval '8 days' WHERE id=$1", [done]);
  const r = await sweep();
  assert.equal(r.photos, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [done]))[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [open]))[0].n, 1);
});

test('tải ảnh bị giới hạn tần suất theo IP (X-Forwarded-For)', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const lan = c.by['Lan'];
  const lid = await makeListing(c, 'Lan');
  const keep = config.routeLimitFactor; config.routeLimitFactor = 1;
  try {
    let limited = 0;
    for (let i = 0; i < 50; i++) {
      const r = await lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900), { headers: { 'x-forwarded-for': '203.0.113.77' } });
      if (r.status === 429) limited++;
    }
    assert.ok(limited > 0, 'phải có 429');
    const other = await lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900), { headers: { 'x-forwarded-for': '203.0.113.78' } });
    assert.notEqual(other.status, 429, 'IP khác không bị ảnh hưởng');
  } finally { config.routeLimitFactor = keep; }
});
