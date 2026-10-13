// Luồng chính: tạo cộng đồng, vào bằng mã, đăng tin, tìm kiếm, quan tâm, nhắn tin, chọn người nhận, hoàn tất, uy tín
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, interest, ok, db, Client, LISTING, base } from './helper.js';

before(boot);
after(shutdown);

test('luồng cho tặng đầy đủ: đăng, quan tâm, nhắn, chọn, hoàn tất, điểm uy tín', async () => {
  const t = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan, Minh } = t.by;
  const lid = await makeListing(t, 'Lan', { title: 'Nồi chiên không dầu', category: 'gia_dung' });

  // danh sách thấy tin, có tên người đăng
  let feed = await ok(Minh.get(`/api/c/${t.cid}/listings`));
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].authorName, 'Lan');
  assert.equal(feed.items[0].isMine, false);
  assert.equal(feed.items[0].status, 'mo');

  // Minh quan tâm và nhắn
  const tid = await interest(t, 'Minh', lid, 'Còn không bạn?');
  const detail = await ok(Lan.get(`/api/listings/${lid}`));
  assert.equal(detail.threads.length, 1);
  assert.equal(detail.threads[0].name, 'Minh');
  assert.equal(detail.threads[0].unread, true);
  assert.equal((await ok(Lan.get(`/api/c/${t.cid}/poll`))).unread >= 1, true);

  // Lan đọc và trả lời
  let th = await ok(Lan.get(`/api/threads/${tid}`));
  assert.equal(th.messages.length, 1);
  assert.equal(th.messages[0].mine, false);
  await ok(Lan.post(`/api/threads/${tid}/messages`, { body: 'Còn nhé, 6h chiều lấy được không?' }));
  th = await ok(Minh.get(`/api/threads/${tid}?after=${th.messages[0].id}`));
  assert.equal(th.messages.length, 1);
  assert.equal(th.messages[0].body, 'Còn nhé, 6h chiều lấy được không?');

  // chọn người nhận → đã giữ; người khác không quan tâm thêm được
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: tid }));
  assert.equal((await ok(Minh.get(`/api/listings/${lid}`))).listing.status, 'giu');
  assert.equal((await ok(Minh.get(`/api/listings/${lid}`))).listing.iAmRecipient, true);
  assert.equal((await Chủ.post(`/api/listings/${lid}/threads`, { body: 'Cho mình với' })).status, 409);

  // hoàn tất, điểm uy tín
  const r = await ok(Lan.post(`/api/listings/${lid}/complete`));
  assert.equal(r.credited, true);
  const members = (await ok(Chủ.get(`/api/c/${t.cid}/members`))).members;
  assert.equal(members.find((m) => m.name === 'Lan').tang, 1);
  assert.equal((await ok(Minh.get(`/api/listings/${lid}`))).listing.stats.tang, 1);
  // sau khi xong không nhắn thêm được
  assert.equal((await Minh.post(`/api/threads/${tid}/messages`, { body: 'cảm ơn' })).status, 409);
  // tin xong nằm ở danh sách "đã xong", không còn ở danh sách mở
  assert.equal((await ok(Minh.get(`/api/c/${t.cid}/listings`))).items.length, 0);
  assert.equal((await ok(Minh.get(`/api/c/${t.cid}/listings?view=done`))).items.length, 1);
});

test('người nhận từ chối thì tin mở lại; người đăng trả lại hoặc chọn người khác', async () => {
  const t = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà']);
  const { Lan, Minh, Hà } = t.by;
  const lid = await makeListing(t, 'Lan');
  const tm = await interest(t, 'Minh', lid);
  const th = await interest(t, 'Hà', lid);
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: tm }));
  await ok(Minh.post(`/api/listings/${lid}/decline`));
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.status, 'mo');
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: th }));
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: tm }));
  assert.equal((await ok(Hà.get(`/api/listings/${lid}`))).listing.iAmRecipient, false);
  await ok(Lan.post(`/api/listings/${lid}/release`));
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.status, 'mo');
  // hoàn tất không có người nhận (tặng ngoài app): xong nhưng không tính điểm
  const r = await ok(Lan.post(`/api/listings/${lid}/complete`));
  assert.equal(r.credited, false);
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.stats.tang, 0);
});

test('tìm kiếm không dấu và lọc', async () => {
  const t = await makeCommunity(['Chủ', 'Lan']);
  const { Lan, Chủ } = t.by;
  await makeListing(t, 'Lan', { title: 'Áo khoác đồng phục', category: 'thoi_trang', condition: 'nhu_moi', description: 'Size M, màu xanh' });
  await makeListing(t, 'Lan', { title: 'Sách Đắc nhân tâm', category: 'sach', kind: 'ban', price: 30000 });
  await makeListing(t, 'Lan', { title: 'Xe đạp trẻ em', category: 'tre_em', kind: 'doi', swapWish: 'xe đạp lớn hơn' });
  const q = async (s) => (await ok(Chủ.get(`/api/c/${t.cid}/listings?${s}`))).items.map((i) => i.title);
  assert.deepEqual(await q('q=ao khoac'), ['Áo khoác đồng phục']);
  assert.deepEqual(await q('q=' + encodeURIComponent('Đắc nhân')), ['Sách Đắc nhân tâm']);
  assert.deepEqual(await q('q=dac+nhan+tam'), ['Sách Đắc nhân tâm']);
  assert.deepEqual(await q('q=xanh'), ['Áo khoác đồng phục']);
  assert.deepEqual(await q('kind=ban'), ['Sách Đắc nhân tâm']);
  assert.deepEqual(await q('kind=doi'), ['Xe đạp trẻ em']);
  assert.deepEqual(await q('category=thoi_trang'), ['Áo khoác đồng phục']);
  assert.deepEqual(await q('condition=nhu_moi'), ['Áo khoác đồng phục']);
  assert.deepEqual(await q('q=%25'), [], 'chỉ gõ ký hiệu thì không khớp gì');
  assert.deepEqual(await q('q=_'), [], 'ký tự _ không làm khớp mọi thứ');
  assert.equal((await Chủ.get(`/api/c/${t.cid}/listings?kind=xx`)).status, 400);
  const p = (await ok(Chủ.get(`/api/c/${t.cid}/listings?kind=ban`))).items[0];
  assert.equal(p.price, 30000);
  // "của tôi"
  assert.equal((await ok(Lan.get(`/api/c/${t.cid}/listings?view=mine`))).items.length, 3);
  assert.equal((await ok(Chủ.get(`/api/c/${t.cid}/listings?view=mine`))).items.length, 0);
});

test('sửa, rút, gia hạn tin', async () => {
  const t = await makeCommunity(['Chủ', 'Lan']);
  const { Lan, Chủ } = t.by;
  const lid = await makeListing(t, 'Lan');
  await ok(Lan.post(`/api/listings/${lid}`, { title: 'Nồi chiên 5L', location: 'Sảnh B' }));
  const d = (await ok(Lan.get(`/api/listings/${lid}`))).listing;
  assert.equal(d.title, 'Nồi chiên 5L'); assert.equal(d.location, 'Sảnh B'); assert.equal(d.description, 'Dùng 1 năm, còn tốt.');
  // đổi sang bán cần giá
  assert.equal((await Lan.post(`/api/listings/${lid}`, { kind: 'ban' })).status, 400);
  await ok(Lan.post(`/api/listings/${lid}`, { kind: 'ban', price: 500000 }));
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.price, 500000);
  // gia hạn: tăng hạn và đếm lần
  const before = (await ok(Lan.get(`/api/listings/${lid}`))).listing.expiresAt;
  await db.query("UPDATE listings SET expires_at = now() + interval '2 days' WHERE id=$1", [lid]);
  await ok(Lan.post(`/api/listings/${lid}/renew`));
  const after = (await ok(Lan.get(`/api/listings/${lid}`))).listing;
  assert.ok(new Date(after.expiresAt) > new Date(Date.now() + 29 * 86400000));
  assert.equal(after.renewCount, 1);
  assert.ok(before);
  // rút
  await ok(Lan.post(`/api/listings/${lid}/cancel`));
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.status, 'huy');
  assert.equal((await Chủ.get(`/api/listings/${lid}`)).status, 200, 'chủ cộng đồng vẫn xem được để kiểm duyệt');
  assert.equal((await Lan.post(`/api/listings/${lid}`, { title: 'Sửa sau khi rút' })).status, 409);
});

test('tin hết hạn tự ẩn sau 30 ngày; sweep báo người đăng; gia hạn khôi phục', async () => {
  const t = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Lan, Minh } = t.by;
  const lid = await makeListing(t, 'Lan');
  assert.equal((await ok(Minh.get(`/api/c/${t.cid}/listings`))).items.length, 1);
  await db.query("UPDATE listings SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day' WHERE id=$1", [lid]);
  // chưa sweep: vẫn ẩn khỏi người khác và không quan tâm được
  assert.equal((await ok(Minh.get(`/api/c/${t.cid}/listings`))).items.length, 0);
  assert.equal((await Minh.get(`/api/listings/${lid}`)).status, 404);
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.status, 'het_han');
  const { sweep } = await import('../src/sweep.js');
  const r = await sweep();
  assert.equal(r.expired, 1);
  const n = (await ok(Lan.get(`/api/c/${t.cid}/poll`))).items.find((x) => x.type === 'expired');
  assert.ok(n);
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.status, 'het_han');
  await ok(Lan.post(`/api/listings/${lid}/renew`));
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).listing.status, 'mo');
  assert.equal((await ok(Minh.get(`/api/c/${t.cid}/listings`))).items.length, 1);
  // gia hạn tối đa 3 lần
  await ok(Lan.post(`/api/listings/${lid}/renew`)); await ok(Lan.post(`/api/listings/${lid}/renew`));
  assert.equal((await Lan.post(`/api/listings/${lid}/renew`)).status, 409);
});

test('bảng tin thất lạc, nhặt được, cần tìm', async () => {
  const t = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan, Minh } = t.by;
  const p = await ok(Lan.post(`/api/c/${t.cid}/board`, { kind: 'that_lac', title: 'Mất chìa khóa xe', description: 'Móc khóa hình gấu', location: 'Hầm B1' }));
  await ok(Minh.post(`/api/c/${t.cid}/board`, { kind: 'can_tim', title: 'Cần tìm xe đẩy em bé cũ' }));
  assert.equal((await ok(Chủ.get(`/api/c/${t.cid}/board`))).items.length, 2);
  assert.equal((await ok(Chủ.get(`/api/c/${t.cid}/board?kind=that_lac`))).items.length, 1);
  assert.equal((await ok(Chủ.get(`/api/c/${t.cid}/board?q=chia+khoa`))).items.length, 1);
  await ok(Minh.post(`/api/board/${p.id}/replies`, { body: 'Mình nhặt được ở hầm B1, nhắn mình nhé' }));
  const d = await ok(Lan.get(`/api/board/${p.id}`));
  assert.equal(d.replies.length, 1);
  assert.equal(d.replies[0].authorName, 'Minh');
  assert.ok((await ok(Lan.get(`/api/c/${t.cid}/poll`))).items.some((n) => n.type === 'reply'));
  // người khác không đóng/xóa được; người đăng đóng được
  assert.equal((await Minh.post(`/api/board/${p.id}/close`)).status, 403);
  assert.equal((await Minh.post(`/api/board/${p.id}/remove`)).status, 403);
  await ok(Lan.post(`/api/board/${p.id}/close`));
  assert.equal((await ok(Chủ.get(`/api/c/${t.cid}/board`))).items.length, 1);
  assert.equal((await Minh.post(`/api/board/${p.id}/replies`, { body: 'thêm' })).status, 409);
});

test('thông báo và đánh dấu đã đọc', async () => {
  const t = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Lan, Minh } = t.by;
  const lid = await makeListing(t, 'Lan');
  const tid = await interest(t, 'Minh', lid);
  await ok(Lan.post(`/api/threads/${tid}/messages`, { body: 'a' }));
  await ok(Lan.post(`/api/threads/${tid}/messages`, { body: 'b' }));
  const p = await ok(Minh.get(`/api/c/${t.cid}/poll`));
  assert.equal(p.items.filter((n) => n.type === 'message').length, 1, 'tin nhắn dồn thành một thông báo');
  await ok(Minh.post(`/api/c/${t.cid}/notifications/read`, {}));
  assert.equal((await ok(Minh.get(`/api/c/${t.cid}/poll`))).unread, 0);
  const me = await ok(Lan.get('/api/me'));
  assert.equal(me.communities[0].myName, 'Lan');
  assert.ok(me.communities[0].unread >= 1);
  assert.equal((await ok(new Client().get('/api/me'))).communities.length, 0);
  const mine = await ok(Minh.get(`/api/c/${t.cid}/interests`));
  assert.equal(mine.items.length, 1); assert.equal(mine.items[0].title, 'Nồi chiên không dầu');
});

test('trang chính và /c/<mã> trả HTML, healthz hoạt động', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  const r = await fetch(`${base}/c/ABCDEFGHJK`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<base href=/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await fetch(base + '/healthz')).status, 200);
  const meta = await (await fetch(base + '/api/meta')).json();
  assert.ok(meta.categories.thuc_pham);
});
