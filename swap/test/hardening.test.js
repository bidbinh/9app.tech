// Vòng sửa lỗi sau phản biện độc lập (T1-T6, L1-L9)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, interest, ok, db, Client, LISTING, config, THUMB, fakeJpeg } from './helper.js';
import { noLinks, noBanned, likeEscape } from '../src/util.js';
import { sweep } from '../src/sweep.js';

before(boot);
after(shutdown);

test('T1: cookie phiên được gia hạn khi có hoạt động (tối đa mỗi ngày một lần)', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const lan = c.by['Lan'];
  const first = await lan.get('/api/me');
  assert.equal(first.setCookie.length, 0, 'vừa cấp, chưa cần gia hạn');
  await db.query("UPDATE phien SET seen_at = now() - interval '2 days'");
  const r = await lan.get('/api/me');
  const sc = r.setCookie.find((x) => x.startsWith('swsid='));
  assert.ok(sc, 'phải cấp lại cookie');
  assert.match(sc, new RegExp(`Max-Age=${config.sessionDays * 86400}`)); assert.match(sc, /HttpOnly/);
  assert.equal((await lan.get('/api/me')).setCookie.length, 0, 'trong ngày không cấp lại');
  assert.equal((await lan.get(`/api/c/${c.cid}`)).status, 200);
});

test('T1: chủ vắng lâu thì thành viên lâu năm nhất tiếp quản; ngoài ra không ai tiếp quản được', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan, Minh } = c.by;
  assert.equal((await ok(Lan.get(`/api/c/${c.cid}`))).canClaimOwner, false);
  assert.equal((await Lan.post(`/api/c/${c.cid}/claim-owner`)).status, 403, 'chủ còn hoạt động');
  await db.query("UPDATE members SET last_seen_at = now() - interval '70 days' WHERE id=$1", [c.ids['Chủ']]);
  assert.equal((await ok(Minh.get(`/api/c/${c.cid}`))).canClaimOwner, false, 'Minh vào sau Lan');
  assert.equal((await Minh.post(`/api/c/${c.cid}/claim-owner`)).status, 403);
  assert.equal((await new Client().post(`/api/c/${c.cid}/claim-owner`)).status, 404);
  assert.equal((await ok(Lan.get(`/api/c/${c.cid}`))).canClaimOwner, true);
  await ok(Lan.post(`/api/c/${c.cid}/claim-owner`));
  assert.equal((await db.query('SELECT role FROM members WHERE id=$1', [c.ids['Lan']]))[0].role, 'chu');
  assert.equal((await db.query('SELECT role FROM members WHERE id=$1', [c.ids['Chủ']]))[0].role, 'thanh_vien');
  assert.equal((await Chủ.post(`/api/c/${c.cid}/rotate-code`)).status, 403);
  assert.equal((await Lan.post(`/api/c/${c.cid}/rotate-code`)).status, 200);
});

test('T2: tin đã giữ không mất luồng nhắn khi hết hạn; người nhận được báo; tác giả vẫn hoàn tất được', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà']);
  const { Lan, Minh, Hà } = c.by;
  const lid = await makeListing(c, 'Lan');
  const tm = await interest(c, 'Minh', lid); const th = await interest(c, 'Hà', lid);
  await db.query("UPDATE listings SET expires_at = now() + interval '2 days' WHERE id=$1", [lid]);
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: tm }));
  const exp = (await db.query('SELECT expires_at > now() + interval \'13 days\' AS ext FROM listings WHERE id=$1', [lid]))[0];
  assert.equal(exp.ext, true, 'chọn người nhận thì gia hạn ân hạn');
  assert.equal((await Hà.get(`/api/threads/${th}`)).json.canSend, false, 'tin đã giữ: người không được chọn không nhắn được (L4)');
  assert.equal((await Hà.post(`/api/threads/${th}/messages`, { body: 'còn không' })).status, 409);
  await db.query("UPDATE listings SET expires_at = now() - interval '1 hour' WHERE id=$1", [lid]);
  await sweep();
  assert.equal((await db.query('SELECT status FROM listings WHERE id=$1', [lid]))[0].status, 'het_han');
  assert.ok((await ok(Minh.get(`/api/c/${c.cid}/poll`))).items.some((n) => n.type === 'expired'), 'người nhận được báo');
  const th1 = await Minh.get(`/api/threads/${tm}`);
  assert.equal(th1.status, 200, 'người nhận vẫn vào được luồng');
  assert.equal(th1.json.canSend, true);
  assert.equal((await Minh.get(`/api/listings/${lid}`)).status, 200);
  await ok(Minh.post(`/api/threads/${tm}/messages`, { body: 'Mình lấy chiều nay nhé' }));
  assert.equal((await Hà.get(`/api/threads/${th}`)).status, 404, 'hết hạn thì người không được chọn không còn thấy tin');
  assert.equal((await Hà.post(`/api/threads/${th}/messages`, { body: 'còn không' })).status, 404);
  const r = await ok(Lan.post(`/api/listings/${lid}/complete`));
  assert.equal(r.credited, true);
  // hết hạn mà chưa có người nhận thì không hoàn tất qua "het_han" được
  const l2 = await makeListing(c, 'Lan', { title: 'Tin hai' });
  await db.query("UPDATE listings SET expires_at = now() - interval '1 hour' WHERE id=$1", [l2]); await sweep();
  assert.equal((await Lan.post(`/api/listings/${l2}/complete`)).status, 409);
});

test('T4: văn bản thường thiếu dấu cách sau dấu chấm không bị coi là liên kết; liên kết thật vẫn bị chặn', () => {
  for (const s of ['Con tot.Co the mua', 'Ly thuy tinh moi.Ly dep', 'Gia 200k.Me ghe', 'Dung tot.App cho be', 'Moi 90%.Top 1', 'Nho gon.Io', 'Gia 3.5 trieu']) assert.doesNotThrow(() => noLinks(s), s);
  for (const s of ['http://a.b', 'www.abc.def', 'xem shop.vn', 'evil.com', 'EVIL.XYZ', 'zalo.me/123', 'bit.ly/x', 'mua o abc.net nhe']) assert.throws(() => noLinks(s), s);
});

test('T5: đồ thông dụng không bị chặn nhầm, đồ cấm vẫn bị chặn', () => {
  for (const s of ['Dao băm thịt inox', 'Dao bấm móng tay', 'Thuốc ngủ thảo dược', 'Hàng giá rẻ', 'Kiếm đồ chơi', 'Dao thái rau', 'Súng nước']) assert.doesNotThrow(() => noBanned(s), s);
  for (const s of ['Dao găm cổ', 'Hàng cấm', 'ma túy', 'vũ khí', 'pháo nổ', 'ngà voi', 'thuốc kê đơn']) assert.throws(() => noBanned(s), s);
});

test('T6: tác giả đóng luồng quan tâm; luồng trống tự đóng; không đóng luồng của người được chọn', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà']);
  const { Lan, Minh, Hà } = c.by;
  const lid = await makeListing(c, 'Lan');
  const tm = await interest(c, 'Minh', lid, 'Mình muốn lấy');
  const th = (await ok(Hà.post(`/api/listings/${lid}/threads`, {}))).threadId; // quan tâm không kèm tin nhắn
  assert.equal((await Minh.post(`/api/threads/${tm}/close`)).status, 403, 'người quan tâm không tự đóng');
  await ok(Lan.post(`/api/threads/${tm}/close`));
  assert.equal((await ok(Lan.get(`/api/listings/${lid}`))).threads.length, 1, 'luồng đã đóng biến khỏi danh sách');
  assert.equal((await Minh.post(`/api/threads/${tm}/messages`, { body: 'alo' })).status, 409);
  assert.equal((await Minh.post(`/api/listings/${lid}/threads`, { body: 'xin lại' })).status, 409);
  assert.equal((await Lan.post(`/api/listings/${lid}/choose`, { threadId: tm })).status, 409);
  assert.equal((await ok(Minh.get(`/api/c/${c.cid}/interests`))).items.length, 0);
  assert.equal((await Minh.get(`/api/threads/${tm}`)).json.canSend, false);
  // chọn Hà rồi không đóng được luồng của Hà
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: th }));
  assert.equal((await Lan.post(`/api/threads/${th}/close`)).status, 409);
  // luồng trống quá hạn tự đóng, trừ luồng của người được chọn
  const l2 = await makeListing(c, 'Lan', { title: 'Tin hai' });
  const e1 = (await ok(Minh.post(`/api/listings/${l2}/threads`, {}))).threadId;
  await db.query("UPDATE threads SET created_at = now() - interval '8 days' WHERE id=$1 OR id=$2", [e1, th]);
  await sweep();
  assert.ok((await db.query('SELECT closed_at FROM threads WHERE id=$1', [e1]))[0].closed_at);
  assert.equal((await db.query('SELECT closed_at FROM threads WHERE id=$1', [th]))[0].closed_at, null);
  // đóng luồng giải phóng chỗ trong hạn mức luồng/tin
  const keep = config.maxThreadsPerListing;
  try {
    config.maxThreadsPerListing = 1;
    const l3 = await makeListing(c, 'Lan', { title: 'Tin ba' });
    const t3 = await interest(c, 'Minh', l3);
    assert.equal((await Hà.post(`/api/listings/${l3}/threads`, {})).status, 409);
    await ok(Lan.post(`/api/threads/${t3}/close`));
    assert.equal((await Hà.post(`/api/listings/${l3}/threads`, {})).status, 200);
  } finally { config.maxThreadsPerListing = keep; }
});

test('T6: hạn mức ảnh theo từng thành viên', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const keep = config.maxPhotoBytesPerMember;
  try {
    config.maxPhotoBytesPerMember = 5000;
    const l1 = await makeListing(c, 'Lan'); const l2 = await makeListing(c, 'Lan', { title: 'Tin hai' }); const l3 = await makeListing(c, 'Minh', { title: 'Của Minh' });
    await ok(c.by['Lan'].upload(l1, fakeJpeg(100, 100, 800), fakeJpeg(300, 200, 3000)));
    const r = await c.by['Lan'].upload(l2, fakeJpeg(100, 100, 800), fakeJpeg(300, 200, 3000));
    assert.equal(r.status, 413); assert.equal(r.json.error.code, 'quota');
    await ok(c.by['Minh'].upload(l3, fakeJpeg(100, 100, 800), fakeJpeg(300, 200, 3000)));
  } finally { config.maxPhotoBytesPerMember = keep; }
});

test('L1: tạo/vào cộng đồng luôn cấp cookie dù gửi Idempotency-Key lặp lại', async () => {
  const h = { 'idempotency-key': 'khoa-lap-lai-01' };
  for (let i = 0; i < 2; i++) {
    const r = await new Client().post('/api/communities', { name: 'Cộng đồng ' + i, myName: 'An', agree: true }, { headers: h });
    assert.equal(r.status, 200); assert.ok(r.setCookie.some((x) => x.startsWith('swsid=')), 'lần ' + i);
  }
});

test('L2: likeEscape thoát đúng \\ % _', () => {
  assert.equal(likeEscape('a%b_c\\d'), 'a\\%b\\_c\\\\d');
});

test('L3: người nhận được báo khi người đăng bị khóa hoặc rời; rời cộng đồng khóa hàng thành viên', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà', 'Quân']);
  const a = await makeListing(c, 'Lan'); const ta = await interest(c, 'Minh', a);
  await ok(c.by['Lan'].post(`/api/listings/${a}/choose`, { threadId: ta }));
  await ok(c.by['Chủ'].post(`/api/c/${c.cid}/members/${c.ids['Lan']}/ban`));
  assert.ok((await ok(c.by['Minh'].get(`/api/c/${c.cid}/poll`))).items.some((n) => n.type === 'cancelled'));
  const b = await makeListing(c, 'Hà', { title: 'Tin của Hà' }); const tb = await interest(c, 'Quân', b);
  await ok(c.by['Hà'].post(`/api/listings/${b}/choose`, { threadId: tb }));
  await Promise.all([c.by['Hà'].post(`/api/c/${c.cid}/leave`), c.by['Hà'].post(`/api/c/${c.cid}/leave`)]);
  assert.ok((await ok(c.by['Quân'].get(`/api/c/${c.cid}/poll`))).items.some((n) => n.type === 'cancelled'));
});

test('L9: tên hiển thị và tên cộng đồng không chứa liên kết', async () => {
  assert.equal((await new Client().post('/api/communities', { name: 'Vào www.evil.com', myName: 'An', agree: true })).status, 400);
  assert.equal((await new Client().post('/api/communities', { name: 'Tòa A', myName: 'http://evil.example', agree: true })).status, 400);
  const c = await makeCommunity(['Chủ', 'Lan']);
  assert.equal((await new Client().post(`/api/join/${c.code}`, { name: 'xem evil.com', agree: true })).status, 400);
  assert.equal((await c.by['Lan'].post(`/api/c/${c.cid}/me`, { name: 'zalo.me/123' })).status, 400);
  assert.equal((await c.by['Chủ'].post(`/api/c/${c.cid}`, { name: 'bit.ly/abc' })).status, 400);
});

test('L7: có các chỉ mục bổ sung', async () => {
  const rows = (await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).map((r) => r.indexname);
  for (const i of ['threads_member', 'listings_recipient', 'board_replies_author', 'board_posts_author']) assert.ok(rows.includes(i), i);
});
