// Phân quyền từng endpoint: người ngoài, cộng đồng khác (IDOR), thành viên thường, người đăng, chủ cộng đồng, người bị khóa
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, interest, ok, db, Client, LISTING, THUMB, fakeJpeg, config } from './helper.js';

before(boot);
after(shutdown);

async function world() {
  const A = await makeCommunity(['Chủ A', 'Lan', 'Minh', 'Hà']);
  const B = await makeCommunity(['Chủ B', 'Bảo']);
  const lid = await makeListing(A, 'Lan');
  const tid = await interest(A, 'Minh', lid);
  const photo = await ok(A.by['Lan'].upload(lid, THUMB(), fakeJpeg(640, 480, 2000)));
  const post = await ok(A.by['Lan'].post(`/api/c/${A.cid}/board`, { kind: 'that_lac', title: 'Mất ví màu đen' }));
  const reply = await ok(A.by['Minh'].post(`/api/board/${post.id}/replies`, { body: 'Mình thấy ở sảnh' }));
  const msg = (await ok(A.by['Minh'].get(`/api/threads/${tid}`))).messages[0];
  return { A, B, lid, tid, photoId: photo.id, postId: post.id, replyId: reply.id, msgId: msg.id };
}

// mọi điểm cuối đọc/ghi gắn với một cộng đồng hoặc một tài nguyên
function endpoints(w) {
  const { A, lid, tid, photoId, postId, replyId, msgId } = w;
  const c = A.cid;
  return [
    ['GET', `/api/c/${c}`], ['GET', `/api/c/${c}/listings`], ['GET', `/api/c/${c}/listings?view=mine`], ['GET', `/api/c/${c}/board`], ['GET', `/api/c/${c}/members`],
    ['GET', `/api/c/${c}/poll`], ['GET', `/api/c/${c}/interests`], ['GET', `/api/c/${c}/reports`],
    ['POST', `/api/c/${c}/listings`, LISTING()], ['POST', `/api/c/${c}/board`, { kind: 'can_tim', title: 'Cần tìm đồ' }],
    ['POST', `/api/c/${c}/reports`, { type: 'listing', id: lid, reason: 'Lừa đảo' }], ['POST', `/api/c/${c}/notifications/read`, {}],
    ['POST', `/api/c/${c}`, { name: 'Đổi tên' }], ['POST', `/api/c/${c}/rotate-code`, {}], ['POST', `/api/c/${c}/me`, { name: 'Tên khác' }],
    ['POST', `/api/c/${c}/leave`, {}], ['POST', `/api/c/${c}/delete`, { confirm: true }],
    ['POST', `/api/c/${c}/members/${A.ids['Lan']}/ban`, {}], ['POST', `/api/c/${c}/members/${A.ids['Lan']}/unban`, {}], ['POST', `/api/c/${c}/members/${A.ids['Lan']}/make-owner`, {}],
    ['GET', `/api/listings/${lid}`], ['POST', `/api/listings/${lid}`, { title: 'Hack tiêu đề' }], ['POST', `/api/listings/${lid}/cancel`, {}], ['POST', `/api/listings/${lid}/renew`, {}],
    ['POST', `/api/listings/${lid}/choose`, { threadId: tid }], ['POST', `/api/listings/${lid}/release`, {}], ['POST', `/api/listings/${lid}/decline`, {}],
    ['POST', `/api/listings/${lid}/complete`, {}], ['POST', `/api/listings/${lid}/remove`, { reason: 'x' }], ['POST', `/api/listings/${lid}/threads`, { body: 'Cho mình' }],
    ['GET', `/api/threads/${tid}`], ['POST', `/api/threads/${tid}/messages`, { body: 'xin chào' }],
    ['GET', `/api/photos/${photoId}`], ['GET', `/api/photos/${photoId}/t`], ['DELETE', `/api/photos/${photoId}`],
    ['GET', `/api/board/${postId}`], ['POST', `/api/board/${postId}/replies`, { body: 'xin chào' }], ['POST', `/api/board/${postId}/close`, {}], ['POST', `/api/board/${postId}/remove`, {}],
    ['POST', `/api/replies/${replyId}/delete`, {}],
  ];
}

test('người chưa có phiên và người ở cộng đồng khác đều nhận 404 ở MỌI điểm cuối (không lộ sự tồn tại)', async () => {
  const w = await world();
  const outsider = new Client('ngoài');
  const other = w.B.by['Bảo']; // thành viên cộng đồng B, không phải A
  const ownerOther = w.B.by['Chủ B'];
  for (const who of [outsider, other, ownerOther]) {
    for (const [m, p, body] of endpoints(w)) {
      const r = await who.req(m, p, m === 'GET' || m === 'DELETE' ? undefined : body);
      assert.equal(r.status, 404, `${who.name} ${m} ${p} -> ${r.status} ${r.buf.toString().slice(0, 120)}`);
      assert.deepEqual(Object.keys(r.json), ['error']);
    }
  }
  // dữ liệu vẫn nguyên
  const lan = w.A.by['Lan'];
  assert.equal((await ok(lan.get(`/api/listings/${w.lid}`))).listing.title, 'Nồi chiên không dầu');
  assert.equal((await lan.get(`/api/photos/${w.photoId}`)).status, 200);
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE community_id=$1', [w.A.cid]))[0].n, 4);
});

test('cộng đồng và tài nguyên không tồn tại: 404 giống nhau', async () => {
  const A = await makeCommunity(['Chủ', 'Lan']);
  const z = '00000000-0000-4000-8000-000000000000';
  for (const p of [`/api/c/${z}`, `/api/c/${z}/listings`, `/api/listings/${z}`, `/api/threads/${z}`, `/api/photos/${z}`, `/api/board/${z}`, '/api/listings/abc', '/api/c/xyz/listings']) {
    assert.equal((await A.by['Lan'].get(p)).status, 404, p);
  }
  assert.equal((await A.by['Lan'].post(`/api/c/${z}/listings`, LISTING())).status, 404);
});

test('thành viên thường không sửa/xóa/hoàn tất tin của người khác; chỉ người đăng và chủ cộng đồng đúng quyền', async () => {
  const w = await world();
  const { A, lid, tid, photoId } = w;
  const [minh, ha, chu, lan] = [A.by['Minh'], A.by['Hà'], A.by['Chủ A'], A.by['Lan']];
  for (const who of [minh, ha, chu]) {
    assert.equal((await who.post(`/api/listings/${lid}`, { title: 'Bị sửa' })).status, 403, who.name + ' sửa');
    assert.equal((await who.post(`/api/listings/${lid}/cancel`)).status, 403, who.name + ' rút');
    assert.equal((await who.post(`/api/listings/${lid}/renew`)).status, 403);
    assert.equal((await who.post(`/api/listings/${lid}/choose`, { threadId: tid })).status, 403);
    assert.equal((await who.post(`/api/listings/${lid}/complete`)).status, 403);
    assert.equal((await who.post(`/api/listings/${lid}/release`)).status, 403);
    assert.equal((await who.upload(lid, THUMB(), fakeJpeg(100, 100, 500))).status, 403);
    assert.equal((await who.del(`/api/photos/${photoId}`)).status, 403);
  }
  // thành viên thường không gỡ tin, không xem báo cáo, không khóa người
  for (const who of [minh, ha, lan]) {
    assert.equal((await who.post(`/api/listings/${lid}/remove`, { reason: 'x' })).status, 403);
    assert.equal((await who.get(`/api/c/${A.cid}/reports`)).status, 403);
    assert.equal((await who.post(`/api/c/${A.cid}/rotate-code`)).status, 403);
    assert.equal((await who.post(`/api/c/${A.cid}`, { name: 'x y' })).status, 403);
    assert.equal((await who.post(`/api/c/${A.cid}/delete`, { confirm: true })).status, 403);
    assert.equal((await who.post(`/api/c/${A.cid}/members/${A.ids['Hà']}/ban`)).status, 403);
    assert.equal((await who.post(`/api/c/${A.cid}/members/${A.ids['Hà']}/make-owner`)).status, 403);
  }
  // người không phải người nhận không từ chối được
  await ok(lan.post(`/api/listings/${lid}/choose`, { threadId: tid }));
  assert.equal((await ha.post(`/api/listings/${lid}/decline`)).status, 403);
  assert.equal((await lan.post(`/api/listings/${lid}/decline`)).status, 403, 'người đăng không phải người nhận');
  assert.equal((await minh.post(`/api/listings/${lid}/complete`)).status, 403, 'người nhận không tự hoàn tất');
  assert.equal((await minh.post(`/api/listings/${lid}/release`)).status, 403);
  // tin vẫn nguyên
  const l = (await ok(lan.get(`/api/listings/${lid}`))).listing;
  assert.equal(l.title, 'Nồi chiên không dầu'); assert.equal(l.status, 'giu'); assert.equal(l.photos.length, 1);
});

test('luồng nhắn tin riêng: người thứ ba và cả chủ cộng đồng đều 404; không chọn người nhận ở tin khác', async () => {
  const w = await world();
  const { A, lid, tid } = w;
  for (const who of ['Hà', 'Chủ A']) {
    assert.equal((await A.by[who].get(`/api/threads/${tid}`)).status, 404, who);
    assert.equal((await A.by[who].post(`/api/threads/${tid}/messages`, { body: 'nghe lén' })).status, 404, who);
  }
  assert.equal((await ok(A.by['Hà'].get(`/api/listings/${lid}`))).myThread, undefined, 'Hà không thấy luồng của Minh');
  assert.equal((await ok(A.by['Hà'].get(`/api/listings/${lid}`))).threads, undefined);
  assert.equal((await ok(A.by['Minh'].get(`/api/listings/${lid}`))).threads, undefined, 'người quan tâm không thấy danh sách luồng của tin');
  // tin khác của Minh + luồng của tin trước: chọn nhầm luồng
  const l2 = await makeListing(A, 'Minh', { title: 'Bàn học' });
  assert.equal((await A.by['Minh'].post(`/api/listings/${l2}/choose`, { threadId: tid })).status, 404);
  // không tự quan tâm tin của mình; không chọn bản thân làm người nhận
  assert.equal((await A.by['Lan'].post(`/api/listings/${lid}/threads`, { body: 'tự nhắn' })).status, 409);
  // người ngoài luồng không đọc được dù biết messageId (báo cáo tin nhắn)
  assert.equal((await A.by['Hà'].post(`/api/c/${A.cid}/reports`, { type: 'message', id: String(w.msgId), reason: 'xấu' })).status, 404);
});

test('CSRF: thiếu header X-Requested-With hoặc Origin lạ thì bị từ chối ở mọi POST/DELETE', async () => {
  const w = await world();
  const lan = w.A.by['Lan'];
  assert.equal((await lan.post(`/api/listings/${w.lid}`, { title: 'Đổi' }, { csrf: false })).status, 403);
  assert.equal((await lan.post(`/api/listings/${w.lid}`, { title: 'Đổi' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await lan.req('DELETE', `/api/photos/${w.photoId}`, undefined, { csrf: false })).status, 403);
  assert.equal((await lan.upload(w.lid, THUMB(), fakeJpeg(), { csrf: false })).status, 403);
  assert.equal((await lan.post(`/api/listings/${w.lid}/cancel`, {}, { csrf: false })).status, 403);
  assert.equal((await ok(lan.get(`/api/listings/${w.lid}`))).listing.status, 'mo');
  // cookie giả/hỏng không tạo được phiên
  const forged = new Client('giả'); forged.cookie = 'swsid=' + 'A'.repeat(43);
  assert.equal((await forged.get(`/api/c/${w.A.cid}`)).status, 404);
  const junk = new Client('rác'); junk.cookie = 'swsid=%E0%A4%A; x';
  assert.equal((await junk.get(`/api/c/${w.A.cid}`)).status, 404);
});

test('thành viên bị khóa: mọi thao tác 403, tin bị gỡ, vào lại vẫn bị chặn; mở khóa thì dùng lại được', async () => {
  const w = await world();
  const { A, lid, tid } = w;
  const chu = A.by['Chủ A']; const lan = A.by['Lan']; const minh = A.by['Minh'];
  await ok(lan.post(`/api/listings/${lid}/choose`, { threadId: tid }));
  const lMinh = await makeListing(A, 'Minh', { title: 'Giá sách' });
  const tLan = await interest(A, 'Lan', lMinh);
  await ok(minh.post(`/api/listings/${lMinh}/choose`, { threadId: tLan }));
  await ok(chu.post(`/api/c/${A.cid}/members/${A.ids['Lan']}/ban`));
  // các thao tác của Lan
  for (const [m, p, b] of [['GET', `/api/c/${A.cid}/listings`], ['POST', `/api/c/${A.cid}/listings`, LISTING()], ['GET', `/api/listings/${lid}`], ['GET', `/api/threads/${tid}`], ['POST', `/api/threads/${tid}/messages`, { body: 'a' }], ['GET', `/api/c/${A.cid}/members`]]) {
    const r = await lan.req(m, p, b);
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
    assert.equal(r.json.error.code, 'banned');
  }
  assert.equal((await lan.post(`/api/join/${A.code}`, { name: 'Lan mới', agree: true })).status, 403, 'không vào lại bằng cùng trình duyệt');
  const me = (await ok(lan.get('/api/me'))).communities[0];
  assert.equal(me.banned, true); assert.equal(me.inviteCode, undefined);
  const info = await ok(lan.get(`/api/c/${A.cid}`));
  assert.equal(info.me.banned, true); assert.equal(info.community.inviteCode, undefined);
  // tin của Lan bị gỡ, ảnh xóa; tin mà Lan đang được giữ trả về mở
  assert.equal((await ok(chu.get(`/api/listings/${lid}`))).listing.status, 'go');
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE listing_id=$1', [lid]))[0].n, 0);
  assert.equal((await minh.get(`/api/listings/${lid}`)).status, 404);
  assert.equal((await ok(minh.get(`/api/listings/${lMinh}`))).listing.status, 'mo');
  assert.equal((await ok(minh.get(`/api/c/${A.cid}/listings`))).items.length, 1);
  // không khóa chính mình / không khóa hai lần gây lỗi
  assert.equal((await chu.post(`/api/c/${A.cid}/members/${A.ids['Chủ A']}/ban`)).status, 409);
  await ok(chu.post(`/api/c/${A.cid}/members/${A.ids['Lan']}/ban`));
  await ok(chu.post(`/api/c/${A.cid}/members/${A.ids['Lan']}/unban`));
  assert.equal((await lan.get(`/api/c/${A.cid}/listings`)).status, 200);
});

test('tự đổi quyền: không thành chủ cộng đồng, không tự mở khóa, không chọn chính mình làm người nhận', async () => {
  const w = await world();
  const { A, lid } = w;
  const lan = A.by['Lan']; const minh = A.by['Minh'];
  // truyền role/banned_at trong thân yêu cầu không có tác dụng
  await ok(minh.post(`/api/c/${A.cid}/me`, { name: 'Minh Mới', role: 'chu', banned_at: null }));
  assert.equal((await db.query("SELECT role FROM members WHERE id=$1", [A.ids['Minh']]))[0].role, 'thanh_vien');
  assert.equal((await minh.post(`/api/c/${A.cid}/rotate-code`)).status, 403);
  await ok(lan.post(`/api/listings/${lid}`, { title: 'Nồi mới', authorId: A.ids['Minh'], status: 'xong', recipient_id: A.ids['Lan'], community_id: w.B.cid }));
  const row = (await db.query('SELECT author_id, status, recipient_id, community_id FROM listings WHERE id=$1', [lid]))[0];
  assert.equal(row.author_id, A.ids['Lan']); assert.equal(row.status, 'mo'); assert.equal(row.recipient_id, null); assert.equal(row.community_id, A.cid);
  // tin tạo với authorId/communityId giả vẫn thuộc đúng người và cộng đồng
  const r = await ok(minh.post(`/api/c/${A.cid}/listings`, LISTING({ authorId: A.ids['Lan'], community_id: w.B.cid, status: 'xong' })));
  const r2 = (await db.query('SELECT author_id, community_id, status FROM listings WHERE id=$1', [r.id]))[0];
  assert.equal(r2.author_id, A.ids['Minh']); assert.equal(r2.community_id, A.cid); assert.equal(r2.status, 'mo');
});

test('chủ cộng đồng: không rời khi chưa chuyển quyền; chuyển quyền rồi quyền cũ mất', async () => {
  const A = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan } = A.by;
  assert.equal((await Chủ.post(`/api/c/${A.cid}/leave`)).status, 409);
  await ok(Chủ.post(`/api/c/${A.cid}/members/${A.ids['Lan']}/make-owner`));
  assert.equal((await Chủ.post(`/api/c/${A.cid}/rotate-code`)).status, 403);
  assert.equal((await Lan.post(`/api/c/${A.cid}/rotate-code`)).status, 200);
  await ok(Chủ.post(`/api/c/${A.cid}/leave`));
  assert.equal((await Chủ.get(`/api/c/${A.cid}`)).status, 404, 'sau khi rời không còn truy cập');
  assert.equal((await ok(Lan.get(`/api/c/${A.cid}/members`))).members.length, 2);
});

test('mã mời: sai định dạng và mã đã đổi đều 404; vào hai lần không tạo thêm thành viên; trùng tên bị từ chối', async () => {
  const A = await makeCommunity(['Chủ', 'Lan']);
  const c = new Client();
  assert.equal((await c.get('/api/join/abc')).status, 404);
  assert.equal((await c.get('/api/join/AAAAAAAAAA')).status, 404);
  assert.equal((await c.post('/api/join/AAAAAAAAAA', { name: 'X', agree: true })).status, 404);
  assert.equal((await c.post(`/api/join/${A.code}`, { name: 'Khách', agree: false })).status, 400, 'phải đồng ý quy tắc');
  assert.equal((await c.post(`/api/join/${A.code}`, { name: 'lan', agree: true })).status, 409, 'trùng tên không phân biệt hoa thường');
  assert.equal((await c.post(`/api/join/${A.code}`, { name: 'LÂN', agree: true })).status, 409, 'trùng tên không dấu');
  const j = await ok(c.post(`/api/join/${A.code}`, { name: 'Khách', agree: true }));
  const again = await ok(c.post(`/api/join/${A.code}`, { name: 'Tên khác', agree: true }));
  assert.equal(again.already, true); assert.equal(again.memberId, j.memberId);
  assert.equal((await ok(A.by['Chủ'].get(`/api/c/${A.cid}/members`))).members.length, 3);
  const newCode = (await ok(A.by['Chủ'].post(`/api/c/${A.cid}/rotate-code`))).inviteCode;
  assert.notEqual(newCode, A.code);
  assert.equal((await new Client().get(`/api/join/${A.code}`)).status, 404);
  assert.equal((await new Client().get(`/api/join/${newCode.toLowerCase()}`)).status, 200, 'mã không phân biệt hoa thường');
  // xem trước mã mời không lộ gì ngoài tên và số người
  const prev = await ok(new Client().get(`/api/join/${newCode}`));
  assert.deepEqual(Object.keys(prev).sort(), ['alreadyMember', 'banned', 'communityId', 'full', 'kind', 'memberCount', 'name'].filter((k) => k in prev).sort());
});

test('rời cộng đồng: tin của mình bị đóng, tin đang giữ trả về mở', async () => {
  const A = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan, Minh } = A.by;
  const mine = await makeListing(A, 'Minh', { title: 'Của Minh' });
  const theirs = await makeListing(A, 'Chủ', { title: 'Của Chủ' });
  const t = await interest(A, 'Minh', theirs);
  await ok(Chủ.post(`/api/listings/${theirs}/choose`, { threadId: t }));
  await ok(Minh.post(`/api/c/${A.cid}/leave`));
  assert.equal((await ok(Chủ.get(`/api/listings/${theirs}`))).listing.status, 'mo');
  assert.equal((await Lan.get(`/api/listings/${mine}`)).status, 404);
  assert.equal((await Minh.get(`/api/c/${A.cid}/listings`)).status, 404);
  // tên được giải phóng
  const c = new Client();
  await ok(c.post(`/api/join/${A.code}`, { name: 'Minh', agree: true }));
});

test('xóa cộng đồng xóa sạch dữ liệu liên quan, không ảnh hưởng cộng đồng khác', async () => {
  const w = await world();
  assert.equal((await w.A.by['Chủ A'].post(`/api/c/${w.A.cid}/delete`, {})).status, 400, 'cần xác nhận');
  await ok(w.A.by['Chủ A'].post(`/api/c/${w.A.cid}/delete`, { confirm: true }));
  for (const t of ['members', 'listings', 'board_posts']) assert.equal((await db.query(`SELECT count(*)::int n FROM ${t} WHERE community_id=$1`, [w.A.cid]))[0].n, 0, t);
  assert.equal((await db.query('SELECT count(*)::int n FROM listing_photos WHERE community_id=$1', [w.A.cid]))[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE community_id=$1', [w.B.cid]))[0].n, 2);
  assert.equal((await w.A.by['Lan'].get(`/api/c/${w.A.cid}`)).status, 404);
});
