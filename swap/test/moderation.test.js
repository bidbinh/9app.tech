// Báo cáo, kiểm duyệt, đồ cấm, chống spam, nhập xấu
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, interest, ok, db, Client, LISTING, config, THUMB, fakeJpeg, base } from './helper.js';

before(boot);
after(shutdown);

test('báo cáo tin: chủ cộng đồng thấy hàng chờ, gỡ tin kèm lý do, người đăng được báo, ảnh bị xóa', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà']);
  const { Chủ, Lan, Minh, Hà } = c.by;
  const lid = await makeListing(c, 'Lan', { title: 'Món đồ đáng ngờ' });
  await ok(Lan.upload(lid, THUMB(), fakeJpeg(300, 200, 900)));
  await ok(Minh.post(`/api/c/${c.cid}/reports`, { type: 'listing', id: lid, reason: 'Nghi hàng giả' }));
  assert.equal((await Minh.post(`/api/c/${c.cid}/reports`, { type: 'listing', id: lid, reason: 'Báo lại' })).status, 409, 'báo cáo lặp');
  await ok(Hà.post(`/api/c/${c.cid}/reports`, { type: 'listing', id: lid, reason: 'Spam' }));
  assert.equal((await Lan.post(`/api/c/${c.cid}/reports`, { type: 'listing', id: lid, reason: 'Tự báo' })).status, 404, 'không tự báo cáo tin của mình');
  assert.equal((await Minh.get(`/api/c/${c.cid}/reports`)).status, 403);
  const q = await ok(Chủ.get(`/api/c/${c.cid}/reports`));
  assert.equal(q.items.length, 2);
  assert.equal(q.items[0].snapshot.startsWith('Món đồ đáng ngờ'), true);
  assert.equal((await ok(Chủ.get(`/api/c/${c.cid}`))).counts.reports, 2);
  const rid = q.items[0].id;
  // thành viên thường không xử lý được
  assert.equal((await Minh.post(`/api/reports/${rid}/action`, { action: 'remove' })).status, 403);
  assert.equal((await Chủ.post(`/api/reports/${rid}/action`, { action: 'xoa-het' })).status, 400);
  await ok(Chủ.post(`/api/reports/${rid}/action`, { action: 'remove' }));
  const l = (await ok(Lan.get(`/api/listings/${lid}`))).listing;
  assert.equal(l.status, 'go'); assert.match(l.removedReason, /báo cáo/);
  assert.equal((await Minh.get(`/api/listings/${lid}`)).status, 404);
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [lid]))[0].n, 0);
  assert.ok((await ok(Lan.get(`/api/c/${c.cid}/poll`))).items.some((n) => n.type === 'removed'));
  assert.equal((await ok(Chủ.get(`/api/c/${c.cid}/reports`))).items.length, 0, 'cả hai báo cáo cùng tin được đóng');
  // người đăng không tự "phục hồi" tin đã bị gỡ
  assert.equal((await Lan.post(`/api/listings/${lid}`, { title: 'Sửa lại' })).status, 409);
  assert.equal((await Lan.post(`/api/listings/${lid}/renew`)).status, 409);
  assert.equal((await Lan.post(`/api/listings/${lid}/cancel`)).status, 409);
  // gỡ trực tiếp (không qua báo cáo)
  const l2 = await makeListing(c, 'Lan', { title: 'Tin khác' });
  await ok(Chủ.post(`/api/listings/${l2}/remove`, { reason: 'Quảng cáo' }));
  assert.equal((await ok(Lan.get(`/api/listings/${l2}`))).listing.removedReason, 'Quảng cáo');
});

test('báo cáo và khóa người: bỏ qua / khóa; khóa đóng mọi báo cáo về người đó', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan, Minh } = c.by;
  const lid = await makeListing(c, 'Lan');
  await makeListing(c, 'Lan', { title: 'Tin hai' });
  await ok(Minh.post(`/api/c/${c.cid}/reports`, { type: 'listing', id: lid, reason: 'Lừa đảo' }));
  let q = await ok(Chủ.get(`/api/c/${c.cid}/reports`));
  await ok(Chủ.post(`/api/reports/${q.items[0].id}/action`, { action: 'dismiss' }));
  assert.equal((await ok(Chủ.get(`/api/c/${c.cid}/reports`))).items.length, 0);
  assert.equal((await ok(Chủ.get(`/api/listings/${lid}`))).listing.status, 'mo', 'bỏ qua thì tin còn nguyên');
  const lid3 = await makeListing(c, 'Lan', { title: 'Tin ba' });
  await ok(Minh.post(`/api/c/${c.cid}/reports`, { type: 'listing', id: lid3, reason: 'Lại nữa' }));
  q = await ok(Chủ.get(`/api/c/${c.cid}/reports`));
  await ok(Chủ.post(`/api/reports/${q.items[0].id}/action`, { action: 'ban' }));
  assert.equal((await Lan.get(`/api/c/${c.cid}/listings`)).status, 403);
  assert.equal((await ok(Minh.get(`/api/c/${c.cid}/listings`))).items.length, 0, 'mọi tin của người bị khóa bị gỡ');
  const all = await ok(Chủ.get(`/api/c/${c.cid}/members`));
  assert.equal(all.members.find((m) => m.name === 'Lan').banned, true);
  assert.equal((await ok(Minh.get(`/api/c/${c.cid}/members`))).members.some((m) => m.name === 'Lan'), false, 'thành viên thường không thấy người bị khóa');
});

test('báo cáo tin nhắn: chỉ người trong cuộc thấy và báo được; chủ cộng đồng chỉ thấy bản chụp, và gỡ được nội dung', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà']);
  const { Chủ, Lan, Minh, Hà } = c.by;
  const lid = await makeListing(c, 'Lan');
  const tid = await interest(c, 'Minh', lid, 'Chuyển khoản trước cho mình nhé');
  const th = await ok(Lan.get(`/api/threads/${tid}`));
  const mid = String(th.messages[0].id);
  assert.equal((await Hà.post(`/api/c/${c.cid}/reports`, { type: 'message', id: mid, reason: 'x y z' })).status, 404);
  assert.equal((await Chủ.post(`/api/c/${c.cid}/reports`, { type: 'message', id: mid, reason: 'x y z' })).status, 404);
  assert.equal((await Minh.post(`/api/c/${c.cid}/reports`, { type: 'message', id: mid, reason: 'tự báo' })).status, 404, 'không tự báo tin nhắn của mình');
  await ok(Lan.post(`/api/c/${c.cid}/reports`, { type: 'message', id: mid, reason: 'Yêu cầu chuyển khoản trước' }));
  const q = await ok(Chủ.get(`/api/c/${c.cid}/reports`));
  assert.equal(q.items[0].snapshot, 'Chuyển khoản trước cho mình nhé');
  assert.equal((await Chủ.get(`/api/threads/${tid}`)).status, 404, 'chủ vẫn không đọc được cả luồng');
  await ok(Chủ.post(`/api/reports/${q.items[0].id}/action`, { action: 'remove' }));
  assert.match((await ok(Lan.get(`/api/threads/${tid}`))).messages[0].body, /đã bị chủ cộng đồng gỡ/);
});

test('bảng tin: gỡ bài, xóa bình luận, báo cáo bài/bình luận', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan, Minh } = c.by;
  const p = await ok(Lan.post(`/api/c/${c.cid}/board`, { kind: 'nhat_duoc', title: 'Nhặt được thẻ xe', location: 'Sảnh' }));
  const r = await ok(Minh.post(`/api/board/${p.id}/replies`, { body: 'Của mình ạ' }));
  const r2 = await ok(Minh.post(`/api/board/${p.id}/replies`, { body: 'Bình luận gây khó chịu' }));
  await ok(Lan.post(`/api/c/${c.cid}/reports`, { type: 'reply', id: r2.id, reason: 'Gây khó chịu' }));
  await ok(Minh.post(`/api/c/${c.cid}/reports`, { type: 'board', id: p.id, reason: 'Nghi lừa đảo' }));
  const q = await ok(Chủ.get(`/api/c/${c.cid}/reports`));
  assert.equal(q.items.length, 2);
  const byType = Object.fromEntries(q.items.map((i) => [i.type, i]));
  await ok(Chủ.post(`/api/reports/${byType.reply.id}/action`, { action: 'remove' }));
  assert.equal((await ok(Lan.get(`/api/board/${p.id}`))).replies.length, 1);
  // Minh không xóa được bình luận của người khác; xóa được bình luận của chính mình
  assert.equal((await Lan.post(`/api/replies/${r.id}/delete`)).status, 200, 'người đăng bài xóa bình luận dưới bài của mình');
  await ok(Chủ.post(`/api/reports/${byType.board.id}/action`, { action: 'remove' }));
  assert.equal((await Minh.get(`/api/board/${p.id}`)).status, 404);
  assert.equal((await ok(Lan.get(`/api/board/${p.id}`))).post.status, 'go');
  assert.equal((await ok(Chủ.get(`/api/c/${c.cid}/board`))).items.length, 0);
});

test('đồ cấm và nội dung xấu bị chặn; từ lành tính không bị chặn nhầm', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const { Lan } = c.by;
  const bad = [
    { title: 'Bán thuốc kê đơn giá rẻ', kind: 'ban', price: 1 },
    { title: 'Ma túy đá chất lượng' }, { title: 'Súng hơi bắn chim' }, { description: 'có bán vũ khí tự vệ' },
    { title: 'Ngà voi châm cứu' }, { title: 'Sừng tê giác' }, { title: 'Hàng fake y như thật', kind: 'ban', price: 100 },
    { title: 'Túi hàng giả loại 1', kind: 'ban', price: 100 }, { title: 'Giấy phép giả', kind: 'ban', price: 5 },
    { title: 'Vape pod system', kind: 'ban', price: 5 }, { title: 'Pháo hoa Tết' },
  ];
  for (const b of bad) {
    const r = await Lan.post(`/api/c/${c.cid}/listings`, LISTING(b));
    assert.equal(r.status, 400, JSON.stringify(b) + ' -> ' + r.status);
    assert.equal(r.json.error.code, 'banned_item');
  }
  // lành tính
  for (const t of ['Súng nước đồ chơi cho bé', 'Hàng giá rẻ, tặng', 'Sung (trái cây) hái ở ban công', 'Thuốc xịt muỗi còn mới', 'Kiếm đồ chơi gỗ']) {
    const r = await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ title: t }));
    assert.equal(r.status, 200, t + ' -> ' + JSON.stringify(r.json));
  }
  // bảng tin cũng lọc
  assert.equal((await Lan.post(`/api/c/${c.cid}/board`, { kind: 'can_tim', title: 'Cần tìm ma túy' })).status, 400);
  // liên kết bị chặn ở mọi nội dung
  for (const text of ['xem http://evil.example/x', 'vào www.evil.com đi', 'liên hệ evil.xyz', 'zalo.me/0123', 'HTTPS://EVIL.EXAMPLE']) {
    assert.equal((await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ description: text }))).status, 400, text);
    assert.equal((await Lan.post(`/api/c/${c.cid}/board`, { kind: 'that_lac', title: 'Mất đồ ' + text })).status, 400, 'bảng tin ' + text);
  }
  assert.equal((await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ description: 'Còn 3.5 kg, gặp 18.30 nhé' }))).status, 200, 'số thập phân không bị coi là liên kết');
  // đồ ăn chỉ để tặng
  assert.equal((await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ category: 'thuc_pham', kind: 'ban', price: 1000, title: 'Sữa chua' }))).status, 400);
  assert.equal((await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ category: 'thuc_pham', kind: 'doi', swapWish: 'gì cũng được', title: 'Mì gói' }))).status, 400);
  assert.equal((await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ category: 'thuc_pham', kind: 'tang', title: 'Sữa chua sắp hết hạn' }))).status, 200);
  const l = await makeListing(c, 'Lan', { title: 'Hộp bánh', category: 'khac' });
  assert.equal((await Lan.post(`/api/listings/${l}`, { category: 'thuc_pham', kind: 'ban', price: 5 })).status, 400, 'sửa sang đồ ăn để bán cũng bị chặn');
});

test('nhập xấu: kiểu dữ liệu, độ dài, giá, ký tự điều khiển, XSS lưu nguyên dạng văn bản', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const { Lan } = c.by;
  const url = `/api/c/${c.cid}/listings`;
  const cases = [
    LISTING({ title: '' }), LISTING({ title: 'ab' }), LISTING({ title: 'x'.repeat(81) }), LISTING({ title: 123 }), LISTING({ title: ['a'] }), LISTING({ title: { a: 1 } }),
    LISTING({ description: 'x'.repeat(1001) }), LISTING({ description: 5 }), LISTING({ category: 'khong-co' }), LISTING({ category: null }), LISTING({ condition: 'tuyet-voi' }),
    LISTING({ kind: 'cho-muon' }), LISTING({ kind: 'ban' }), LISTING({ kind: 'ban', price: -1 }), LISTING({ kind: 'ban', price: 1.5 }), LISTING({ kind: 'ban', price: 'abc' }),
    LISTING({ kind: 'ban', price: 1e12 }), LISTING({ kind: 'ban', price: 1e308 }), LISTING({ kind: 'ban', price: null }), LISTING({ location: '' }), LISTING({ location: 'x'.repeat(81) }),
    LISTING({ pickupTime: 'x'.repeat(81) }), LISTING({ swapWish: 'x'.repeat(121), kind: 'doi' }),
  ];
  for (const b of cases) {
    const r = await Lan.post(url, b);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 100) + ' -> ' + r.status);
    assert.equal(r.json.error.code, 'invalid_input');
  }
  for (const body of ['[]', '"x"', 'null', '123', '{bad json']) {
    const r2 = await fetch(`${base}/api/c/${c.cid}/listings`, { method: 'POST', headers: { 'x-requested-with': '9swap', cookie: Lan.cookie, 'content-type': 'application/json' }, body });
    assert.equal(r2.status, 400, body);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM listings WHERE community_id=$1', [c.cid]))[0].n, 0, 'không tin nào lọt qua');
  // XSS: lưu như văn bản thường, trả về dạng JSON, không bị nhân đôi hay biến đổi thành thẻ
  const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const r = await ok(Lan.post(url, LISTING({ title: xss, description: xss, location: xss })));
  const l = (await ok(Lan.get(`/api/listings/${r.id}`))).listing;
  assert.equal(l.title, xss); assert.equal(l.description, xss);
  const raw = await Lan.get(`/api/listings/${r.id}`, { raw: true });
  assert.equal(raw.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
  // ký tự điều khiển và bidi bị loại; khoảng trắng gộp
  const r3 = await ok(Lan.post(url, LISTING({ title: 'Tiêu\u0000 đề‮   dài​  ', description: 'dòng1\r\n\r\n\r\n\r\ndòng2\u0007' })));
  const l3 = (await ok(Lan.get(`/api/listings/${r3.id}`))).listing;
  assert.equal(l3.title, 'Tiêu đề dài'); assert.equal(l3.description, 'dòng1\n\ndòng2');
  // tên người dùng cũng bị làm sạch và giới hạn
  assert.equal((await new Client().post('/api/communities', { name: 'x', myName: 'An', agree: true })).status, 400);
  assert.equal((await new Client().post('/api/communities', { name: 'Tòa A', myName: 'x'.repeat(61), agree: true })).status, 400);
  assert.equal((await new Client().post('/api/communities', { name: 'Tòa A', myName: '   ', agree: true })).status, 400);
  assert.equal((await new Client().post('/api/communities', { name: 'Tòa A', kind: 'hanh-tinh', myName: 'An', agree: true })).status, 400);
  assert.equal((await new Client().post('/api/communities', { name: 'Tòa A', myName: 'An' })).status, 400, 'chưa đồng ý quy tắc');
  const nm = await ok(new Client().post('/api/communities', { name: '<b>Tòa</b>', myName: '<i>An</i>‮', agree: true }));
  assert.equal(nm.community.name, '<b>Tòa</b>');
  // tin nhắn
  const t = c.by['Chủ'];
  const tid = await interest(c, 'Chủ', r.id, 'xin chào');
  for (const body of ['', '   ', 'x'.repeat(501), 5, null, 'xem http://evil.example']) {
    assert.equal((await t.post(`/api/threads/${tid}/messages`, { body })).status, 400, JSON.stringify(body));
  }
  // id dạng lạ trong đường dẫn
  for (const p of ["/api/listings/1'; DROP TABLE listings;--", '/api/listings/%00', '/api/threads/../../x', '/api/board/' + 'a'.repeat(5000)]) {
    assert.equal((await Lan.get(p)).status, 404, p.slice(0, 40));
  }
  assert.equal((await Lan.get(`/api/c/${c.cid}/listings?offset=-5&q=${'a'.repeat(5000)}`)).status, 200);
  assert.equal((await Lan.get(`/api/c/${c.cid}/listings?q=${encodeURIComponent("'; DROP TABLE listings;--")}`)).status, 200);
});

test('chống spam: hạn mức tin/ngày, tin đang mở, tin nhắn/giờ, luồng/tin, bài bảng tin/ngày, báo cáo/ngày', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà', 'Quân']);
  const { Lan, Minh } = c.by;
  const keep = { ...config };
  try {
    config.maxListingsPerDay = 3;
    for (let i = 0; i < 3; i++) await ok(Lan.post(`/api/c/${c.cid}/listings`, LISTING({ title: 'Tin số ' + i })));
    const r = await Lan.post(`/api/c/${c.cid}/listings`, LISTING({ title: 'Tin thứ tư' }));
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'too_many');
    assert.equal((await ok(c.by['Chủ'].post(`/api/c/${c.cid}/listings`, LISTING()))).id.length, 36, 'hạn mức tính riêng từng người');
    // song song: không vượt hạn mức
    config.maxListingsPerDay = 5;
    const par = await Promise.all(Array.from({ length: 10 }, (_, i) => Minh.post(`/api/c/${c.cid}/listings`, LISTING({ title: 'Song song ' + i }))));
    assert.equal(par.filter((x) => x.status === 200).length, 5);
    assert.equal(par.filter((x) => x.status === 429).length, 5);
    config.maxListingsPerDay = 1000;

    config.maxOpenListingsPerMember = 4;
    const q = await c.by['Hà'].post(`/api/c/${c.cid}/listings`, LISTING());
    assert.equal(q.status, 200);
    for (let i = 0; i < 3; i++) await ok(c.by['Hà'].post(`/api/c/${c.cid}/listings`, LISTING({ title: 'Mở ' + i })));
    assert.equal((await c.by['Hà'].post(`/api/c/${c.cid}/listings`, LISTING())).status, 429);
    config.maxOpenListingsPerMember = 30;

    // tin nhắn/giờ
    const lid = await makeListing(c, 'Lan', { title: 'Cho nhắn' });
    config.maxMessagesPerHour = 3;
    const tid = await interest(c, 'Minh', lid, 'một');
    await ok(Minh.post(`/api/threads/${tid}/messages`, { body: 'hai' }));
    await ok(Minh.post(`/api/threads/${tid}/messages`, { body: 'ba' }));
    assert.equal((await Minh.post(`/api/threads/${tid}/messages`, { body: 'bốn' })).status, 429);
    config.maxMessagesPerHour = 1000;
    // tối đa tin nhắn mỗi luồng
    config.maxMessagesPerThread = 5;
    for (let i = 0; i < 2; i++) await ok(Minh.post(`/api/threads/${tid}/messages`, { body: 'm' + i }));
    assert.equal((await Minh.post(`/api/threads/${tid}/messages`, { body: 'quá' })).status, 409);
    config.maxMessagesPerThread = 200;
    // số luồng mỗi tin
    config.maxThreadsPerListing = 2;
    await interest(c, 'Hà', lid);
    assert.equal((await c.by['Quân'].post(`/api/listings/${lid}/threads`, { body: 'Cho mình với' })).status, 409);
    config.maxThreadsPerListing = 40;

    // bảng tin
    config.maxPostsPerDay = 2;
    await ok(c.by['Quân'].post(`/api/c/${c.cid}/board`, { kind: 'can_tim', title: 'Bài một' }));
    await ok(c.by['Quân'].post(`/api/c/${c.cid}/board`, { kind: 'can_tim', title: 'Bài hai' }));
    assert.equal((await c.by['Quân'].post(`/api/c/${c.cid}/board`, { kind: 'can_tim', title: 'Bài ba' })).status, 429);
    config.maxPostsPerDay = 20;
    // bình luận/giờ
    const post = await ok(Lan.post(`/api/c/${c.cid}/board`, { kind: 'that_lac', title: 'Mất mũ' }));
    config.maxRepliesPerHour = 2;
    await ok(Minh.post(`/api/board/${post.id}/replies`, { body: 'a' }));
    await ok(Minh.post(`/api/board/${post.id}/replies`, { body: 'b' }));
    assert.equal((await Minh.post(`/api/board/${post.id}/replies`, { body: 'c' })).status, 429);
    config.maxRepliesPerHour = 30;
    // báo cáo/ngày
    config.maxReportsPerDay = 1;
    const others = [];
    for (let i = 0; i < 2; i++) others.push(await makeListing(c, 'Lan', { title: 'Đáng ngờ ' + i }));
    await ok(c.by['Quân'].post(`/api/c/${c.cid}/reports`, { type: 'listing', id: others[0], reason: 'lý do' }));
    assert.equal((await c.by['Quân'].post(`/api/c/${c.cid}/reports`, { type: 'listing', id: others[1], reason: 'lý do' })).status, 429);
  } finally { Object.assign(config, keep); }
});

test('giới hạn thành viên và tạo cộng đồng', async () => {
  const keep = { ...config };
  try {
    config.maxMembers = 3;
    const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
    const r = await new Client().post(`/api/join/${c.code}`, { name: 'Thứ tư', agree: true });
    assert.equal(r.status, 409); assert.equal(r.json.error.code, 'full');
    assert.equal((await ok(new Client().get(`/api/join/${c.code}`))).full, true);
    // khóa một người thì có chỗ trống
    await ok(c.by['Chủ'].post(`/api/c/${c.cid}/members/${c.ids['Minh']}/ban`));
    await ok(new Client().post(`/api/join/${c.code}`, { name: 'Thứ tư', agree: true }));
    config.maxCommunitiesPerDay = 2;
    const u = new Client();
    await ok(u.post('/api/communities', { name: 'Một', myName: 'A', agree: true }));
    await ok(u.post('/api/communities', { name: 'Hai', myName: 'A', agree: true }));
    assert.equal((await u.post('/api/communities', { name: 'Ba', myName: 'A', agree: true })).status, 429);
    config.maxCommunitiesPerDay = 5;
    config.maxCommunitiesPerIpHour = 1;
    const x = new Client();
    const first = await x.post('/api/communities', { name: 'IP một', myName: 'A', agree: true }, { headers: { 'x-forwarded-for': '198.51.100.9' } });
    const second = await new Client().post('/api/communities', { name: 'IP hai', myName: 'B', agree: true }, { headers: { 'x-forwarded-for': '198.51.100.9' } });
    assert.ok(first.status === 200 || first.status === 429);
    assert.equal(second.status, 429);
    const third = await new Client().post('/api/communities', { name: 'IP ba', myName: 'B', agree: true }, { headers: { 'x-forwarded-for': '198.51.100.10' } });
    assert.equal(third.status, 200, 'IP khác không bị chặn');
  } finally { Object.assign(config, keep); }
});
