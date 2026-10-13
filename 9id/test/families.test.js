import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newPhone, signup, PASS, query, config, util, makeFamily, inviteAndAccept } from './helper.js';
const { INVITE_NOTICE } = await import('../src/routes/families.js');

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};
const owners = async (fid) => (await query("SELECT user_id FROM memberships WHERE family_id=$1 AND role='chu' AND left_at IS NULL", [fid])).length;

// Gia đình mẫu: chủ O, quản lý M, thành viên T, con K (đã nối bằng số điện thoại), một hồ sơ con khác (chưa nối)
async function sample() {
  const O = await signup('Bố Nam', {}); const M = await signup('Mẹ Hoa', {}); const T = await signup('Bà Nội', {}); const K = await signup('Bé Na', {});
  const fid = await makeFamily(O, 'Nhà Cún');
  await inviteAndAccept(O, fid, M, 'quan_ly');
  await inviteAndAccept(O, fid, T, 'thanh_vien');
  const kid = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé Na', birthYear: 2015, note: 'dị ứng tôm', phone: K.phone }))).child.id;
  const sib = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé Bi', birthYear: 2019, note: 'ghi chú riêng' }))).child.id;
  const inv = (await ok(K.get('/api/invitations'))).invitations;
  assert.equal(inv.length, 1);
  await ok(K.post(`/api/invitations/${inv[0].id}/accept`));
  return { O, M, T, K, fid, kid, sib };
}

test('tạo gia đình: tên có thể trùng, mỗi gia đình một id; một người thuộc nhiều gia đình', async () => {
  const a = await signup('Chủ A', {}); const b = await signup('Chủ B', {});
  const f1 = await makeFamily(a, 'Nhà Tôi'); const f2 = await makeFamily(b, 'Nhà Tôi'); const f3 = await makeFamily(a, 'Nhà Tôi');
  assert.equal(new Set([f1, f2, f3]).size, 3);
  await inviteAndAccept(b, f2, a, 'thanh_vien');
  const list = (await ok(a.get('/api/families'))).families;
  assert.equal(list.length, 3); assert.deepEqual(list.map((f) => f.role).sort(), ['chu', 'chu', 'thanh_vien']);
  assert.equal((await a.post('/api/families', { name: '   ' })).status, 400);
  assert.equal((await a.post('/api/families', { name: 'x'.repeat(61) })).status, 400);
  assert.equal((await a.post('/api/families', {})).status, 400);
  assert.equal((await new Client('chưa đăng nhập').get('/api/families')).status, 401);
  assert.equal((await new Client('chưa đăng nhập').post('/api/families', { name: 'Ma' })).status, 401);
  const d = await ok(a.get('/api/families/' + f1));
  assert.equal(d.me.role, 'chu'); assert.equal(d.members.length, 1); assert.equal(d.can.delete, true);
});

test('hạn mức: số gia đình làm chủ, đồng thời không vượt', async () => {
  await withConfig({ maxFamiliesOwned: 3 }, async () => {
    const a = await signup('Nhiều nhà', {});
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => a.post('/api/families', { name: 'Nhà ' + i })));
    assert.equal(rs.filter((r) => r.status === 200).length, 3, rs.map((r) => r.status).join());
    assert.equal((await ok(a.get('/api/families'))).families.length, 3);
  });
});

test('IDOR: người ngoài gia đình và gia đình không tồn tại cho cùng một 404', async () => {
  const { fid, kid, O } = await sample();
  const x = await signup('Người ngoài', {});
  const ghost = '00000000-0000-4000-8000-000000000000';
  const calls = [
    ['GET', (f) => `/api/families/${f}`], ['POST', (f) => `/api/families/${f}/rename`, { name: 'Hack' }], ['POST', (f) => `/api/families/${f}/children`, { name: 'Hack' }],
    ['POST', (f) => `/api/families/${f}/children/${kid}`, { name: 'Hack' }], ['DELETE', (f) => `/api/families/${f}/children/${kid}`], ['POST', (f) => `/api/families/${f}/children/${kid}/phone`, { phone: newPhone() }],
    ['POST', (f) => `/api/families/${f}/children/${kid}/unlink`, {}], ['POST', (f) => `/api/families/${f}/invites`, { phone: newPhone() }],
    ['POST', (f) => `/api/families/${f}/members/${O.user.id}/role`, { role: 'thanh_vien' }], ['DELETE', (f) => `/api/families/${f}/members/${O.user.id}`], ['POST', (f) => `/api/families/${f}/leave`, {}],
    ['POST', (f) => `/api/families/${f}/transfer`, { toUserId: x.user.id, password: PASS }], ['POST', (f) => `/api/families/${f}/delete`, { password: PASS, confirmName: 'Nhà Cún' }],
  ];
  for (const [m, p, body] of calls) {
    const real = await x.req(m, p(fid), body);
    const fake = await x.req(m, p(ghost), body);
    assert.equal(real.status, 404, `${m} ${p('<fid>')}`);
    assert.equal(fake.status, 404);
    assert.deepEqual(real.json, fake.json, 'cùng nội dung 404: không lộ gia đình có tồn tại');
  }
  assert.equal((await x.get('/api/families/not-a-uuid')).status, 404);
  // gia đình còn nguyên
  assert.equal((await ok(O.get('/api/families/' + fid))).family.name, 'Nhà Cún');
  // lời mời của người khác
  const inv = (await ok(O.get(`/api/families/${fid}`))).invitations;
  assert.equal(inv.length, 0);
});

test('ma trận vai trò: chủ, quản lý, thành viên, con', async () => {
  const { O, M, T, K, fid, kid, sib } = await sample();
  const S = (r) => r.status;
  // xem: mọi người ở trong gia đình
  for (const c of [O, M, T, K]) assert.equal(S(await c.get('/api/families/' + fid)), 200);
  // đổi tên
  assert.equal(S(await T.post(`/api/families/${fid}/rename`, { name: 'T đổi' })), 403);
  assert.equal(S(await K.post(`/api/families/${fid}/rename`, { name: 'K đổi' })), 403);
  assert.equal(S(await M.post(`/api/families/${fid}/rename`, { name: 'Nhà Mới' })), 200);
  assert.equal(S(await O.post(`/api/families/${fid}/rename`, { name: 'Nhà Cún' })), 200);
  // hồ sơ con
  assert.equal(S(await T.post(`/api/families/${fid}/children`, { name: 'T thêm' })), 403);
  assert.equal(S(await K.post(`/api/families/${fid}/children`, { name: 'K thêm' })), 403);
  assert.equal(S(await T.post(`/api/families/${fid}/children/${sib}`, { name: 'T sửa' })), 403);
  assert.equal(S(await K.post(`/api/families/${fid}/children/${sib}`, { name: 'K sửa' })), 403);
  assert.equal(S(await K.post(`/api/families/${fid}/children/${kid}`, { name: 'Tự đổi tên' })), 403);
  assert.equal(S(await M.post(`/api/families/${fid}/children/${sib}`, { note: 'mẹ sửa' })), 200);
  assert.equal(S(await T.del(`/api/families/${fid}/children/${sib}`)), 403);
  // mời
  assert.equal(S(await T.post(`/api/families/${fid}/invites`, { phone: newPhone() })), 403);
  assert.equal(S(await K.post(`/api/families/${fid}/invites`, { phone: newPhone() })), 403);
  assert.equal(S(await M.post(`/api/families/${fid}/invites`, { phone: newPhone(), role: 'thanh_vien' })), 200);
  assert.equal(S(await M.post(`/api/families/${fid}/invites`, { phone: newPhone(), role: 'quan_ly' })), 403, 'quản lý không mời quản lý');
  assert.equal(S(await O.post(`/api/families/${fid}/invites`, { phone: newPhone(), role: 'quan_ly' })), 200);
  assert.equal(S(await O.post(`/api/families/${fid}/invites`, { phone: newPhone(), role: 'chu' })), 400, 'không mời làm chủ');
  assert.equal(S(await O.post(`/api/families/${fid}/invites`, { phone: newPhone(), role: 'con' })), 400);
  // đổi vai trò: chỉ chủ
  assert.equal(S(await M.post(`/api/families/${fid}/members/${T.user.id}/role`, { role: 'quan_ly' })), 403);
  assert.equal(S(await O.post(`/api/families/${fid}/members/${T.user.id}/role`, { role: 'quan_ly' })), 200);
  assert.equal(S(await O.post(`/api/families/${fid}/members/${T.user.id}/role`, { role: 'thanh_vien' })), 200);
  assert.equal(S(await O.post(`/api/families/${fid}/members/${O.user.id}/role`, { role: 'thanh_vien' })), 400, 'không hạ chủ bằng đường này');
  assert.equal(S(await O.post(`/api/families/${fid}/members/${K.user.id}/role`, { role: 'quan_ly' })), 400, 'không đổi vai trò của con');
  assert.equal(S(await O.post(`/api/families/${fid}/members/${T.user.id}/role`, { role: 'chu' })), 400);
  // xóa thành viên
  assert.equal(S(await T.del(`/api/families/${fid}/members/${M.user.id}`)), 403);
  assert.equal(S(await K.del(`/api/families/${fid}/members/${T.user.id}`)), 403);
  assert.equal(S(await M.del(`/api/families/${fid}/members/${O.user.id}`)), 403, 'không xóa chủ');
  assert.equal(S(await O.del(`/api/families/${fid}/members/${O.user.id}`)), 400);
  // chuyển quyền / xóa gia đình: chỉ chủ
  assert.equal(S(await M.post(`/api/families/${fid}/transfer`, { toUserId: M.user.id, password: PASS })), 403);
  assert.equal(S(await M.post(`/api/families/${fid}/delete`, { password: PASS, confirmName: 'Nhà Cún' })), 403);
  assert.equal(S(await K.post(`/api/families/${fid}/delete`, { password: PASS, confirmName: 'Nhà Cún' })), 403);
  // chủ không rời được
  assert.equal(S(await O.post(`/api/families/${fid}/leave`)), 409);
  // quản lý xóa thành viên, không xóa quản lý khác
  assert.equal(S(await M.del(`/api/families/${fid}/members/${T.user.id}`)), 200);
  assert.equal(S(await O.post(`/api/families/${fid}/members/${M.user.id}/role`, { role: 'thanh_vien' })), 200);
  assert.equal(await owners(fid), 1);
});

test('vai trò con: chỉ thấy người lớn, chính mình, hồ sơ của mình; không ghi chú, không lời mời', async () => {
  const { K, fid, O } = await sample();
  const d = await ok(K.get('/api/families/' + fid));
  assert.equal(d.me.role, 'con');
  assert.equal(d.children.length, 1); assert.equal(d.children[0].name, 'Bé Na'); assert.equal(d.children[0].note, undefined);
  assert.ok(!JSON.stringify(d).includes('ghi chú riêng') && !JSON.stringify(d).includes('Bé Bi') && !JSON.stringify(d).includes('dị ứng tôm'));
  assert.ok(d.members.every((m) => m.role !== 'con' || m.isMe));
  assert.deepEqual(d.invitations, []);
  assert.equal(d.can.rename, false); assert.equal(d.can.invite, false); assert.equal(d.can.leave, true);
  const list = (await ok(K.get('/api/families'))).families;
  assert.equal(list[0].childCount, null);
  // chủ thấy đủ
  const od = await ok(O.get('/api/families/' + fid));
  assert.equal(od.children.length, 2); assert.ok(od.children.some((c) => c.note === 'dị ứng tôm'));
});

test('nối tài khoản bằng số điện thoại: số đã có tài khoản thấy lời mời NGAY; con phải bấm chấp nhận; xem được phần của con', async () => {
  const O = await signup('Mẹ', {}); const K = await signup('Con', {});
  const fid = await makeFamily(O, 'Nhà Nối');
  const r = await O.post(`/api/families/${fid}/children`, { name: 'Bé Nối', birthYear: 2014, phone: K.phone.replace(/^0/, '+84 ') });
  assert.equal(r.status, 200);
  // chưa chấp nhận: K không thấy gì của gia đình
  assert.equal((await K.get('/api/families/' + fid)).status, 404);
  assert.deepEqual((await ok(K.get('/api/families'))).families, []);
  assert.equal((await ok(K.get('/api/me'))).pendingInvitations, 1);
  const inv = (await ok(K.get('/api/invitations'))).invitations;
  assert.equal(inv.length, 1); assert.equal(inv[0].kind, 'con'); assert.equal(inv[0].familyName, 'Nhà Nối'); assert.equal(inv[0].invitedByName, 'Mẹ');
  assert.deepEqual(Object.keys(inv[0]).sort(), ['awaitingApproval', 'createdAt', 'expiresAt', 'familyName', 'familyNameNote', 'id', 'invitedByName', 'kind', 'role', 'roleLabel', 'status']);
  assert.ok(!JSON.stringify(inv).includes('Bé Nối'), 'thẻ lời mời không lộ tên con');
  assert.equal((await ok(O.get('/api/families/' + fid))).children[0].invitePending, true);
  await ok(K.post(`/api/invitations/${inv[0].id}/accept`));
  const d = await ok(K.get('/api/families/' + fid));
  assert.equal(d.me.role, 'con'); assert.equal(d.children[0].name, 'Bé Nối'); assert.equal(d.children[0].linkedUserId, K.user.id);
  const od = await ok(O.get('/api/families/' + fid));
  assert.equal(od.children[0].linkedUserId, K.user.id); assert.equal(od.children[0].linkedName, 'Con'); assert.equal(od.children[0].invitePending, false);
  assert.equal((await ok(K.get('/api/me'))).pendingInvitations, 0);
  // nhận lại lần hai: 404
  assert.equal((await K.post(`/api/invitations/${inv[0].id}/accept`)).status, 404);
  // số điện thoại (băm) không còn nằm ở hồ sơ con; DB không chứa số thô ở bảng gia đình
  const dump = JSON.stringify([await query('SELECT * FROM invitations'), await query('SELECT * FROM child_profiles'), await query('SELECT * FROM memberships'), await query('SELECT * FROM families')]);
  assert.ok(!dump.includes(K.phone.slice(1)) && !dump.includes('84' + K.phone.slice(1)));
});

test('số chưa có tài khoản: lời mời chờ và hiện khi đăng ký + xác minh OTP đúng số đó', async () => {
  const O = await signup('Cha', {});
  const fid = await makeFamily(O, 'Nhà Chờ');
  const phone = newPhone();
  await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé Chờ', phone }));
  const K = await signup('Con mới', { phone });
  assert.equal((await ok(K.get('/api/me'))).pendingInvitations, 1);
  const inv = (await ok(K.get('/api/invitations'))).invitations;
  assert.equal(inv.length, 1);
  await ok(K.post(`/api/invitations/${inv[0].id}/accept`));
  assert.equal((await ok(K.get('/api/families/' + fid))).me.role, 'con');
});

test('gõ nhầm số: người lạ KHÔNG thấy dữ liệu gia đình, chỉ thấy thẻ lời mời; từ chối thì đóng; con thật vẫn nối được sau', async () => {
  const O = await signup('Cha', {}); const stranger = await signup('Người lạ', {}); const realKid = await signup('Con thật', {});
  const fid = await makeFamily(O, 'Nhà Riêng Tư');
  const kid = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé Bí Mật', note: 'đón 16h30 cổng B', phone: stranger.phone }))).child.id;
  const all = JSON.stringify([(await ok(stranger.get('/api/invitations'))), (await ok(stranger.get('/api/me'))), (await ok(stranger.get('/api/families')))]);
  assert.ok(!all.includes('Bé Bí Mật') && !all.includes('đón 16h30') && !all.includes(fid) && !all.includes(kid), 'không rò dữ liệu: ' + all);
  assert.equal((await stranger.get('/api/families/' + fid)).status, 404);
  assert.equal((await stranger.get(`/api/families/${fid}`)).status, 404);
  const inv = (await ok(stranger.get('/api/invitations'))).invitations[0];
  assert.equal((await stranger.post(`/api/invitations/${inv.id}/decline`)).status, 200);
  assert.equal((await stranger.post(`/api/invitations/${inv.id}/accept`)).status, 404, 'đã từ chối thì không nhận được nữa');
  assert.equal((await stranger.get('/api/families/' + fid)).status, 404);
  // sửa số: gửi lại cho đúng người
  await ok(O.post(`/api/families/${fid}/children/${kid}/phone`, { phone: realKid.phone }));
  const i2 = (await ok(realKid.get('/api/invitations'))).invitations;
  assert.equal(i2.length, 1);
  await ok(realKid.post(`/api/invitations/${i2[0].id}/accept`));
  assert.equal((await ok(realKid.get('/api/families/' + fid))).children[0].name, 'Bé Bí Mật');
});

test('lời mời của người khác: không xem, không nhận, không từ chối (IDOR) ', async () => {
  const O = await signup('Chủ', {}); const A = await signup('A', {}); const B = await signup('B', {});
  const fid = await makeFamily(O, 'Nhà X');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  const inv = (await ok(A.get('/api/invitations'))).invitations[0];
  assert.deepEqual((await ok(B.get('/api/invitations'))).invitations, []);
  assert.equal((await B.post(`/api/invitations/${inv.id}/accept`)).status, 404);
  assert.equal((await B.post(`/api/invitations/${inv.id}/decline`)).status, 404);
  assert.equal((await O.post(`/api/invitations/${inv.id}/accept`)).status, 404, 'chính người mời cũng không tự nhận');
  assert.equal((await B.get('/api/families/' + fid)).status, 404);
  assert.equal((await B.post(`/api/invitations/${'00000000-0000-4000-8000-000000000000'}/accept`)).status, 404);
  assert.equal((await B.post('/api/invitations/xyz/accept')).status, 404);
  await ok(A.post(`/api/invitations/${inv.id}/accept`));
  assert.equal((await ok(A.get('/api/families/' + fid))).me.role, 'thanh_vien');
});

test('phản hồi khi thêm số LUÔN giống nhau: số có tài khoản, chưa có, đã là thành viên, trùng lời mời, quá hạn mức chờ', async () => {
  const O = await signup('Chủ', {}); const reg = await signup('Có TK', {}); const member = await signup('Thành viên', {});
  const fid = await makeFamily(O, 'Nhà Đồng Nhất');
  await inviteAndAccept(O, fid, member, 'thanh_vien');
  const body = (phone) => ({ phone, role: 'thanh_vien' });
  const rs = [];
  rs.push(await O.post(`/api/families/${fid}/invites`, body(reg.phone)));
  rs.push(await O.post(`/api/families/${fid}/invites`, body(newPhone())));
  rs.push(await O.post(`/api/families/${fid}/invites`, body(member.phone)));
  rs.push(await O.post(`/api/families/${fid}/invites`, body(reg.phone)));
  // số đã có đủ 5 lời mời chờ ở nơi khác
  const busy = newPhone();
  for (let i = 0; i < config.maxPendingPerPhone; i++) { const o = await signup('Chủ phụ ' + i, {}); const f = await makeFamily(o, 'Nhà ' + i); await ok(o.post(`/api/families/${f}/invites`, body(busy))); }
  rs.push(await O.post(`/api/families/${fid}/invites`, body(busy)));
  // thêm số cho con theo cùng cách
  const ch = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé' }))).child.id;
  rs.push(await O.post(`/api/families/${fid}/children/${ch}/phone`, { phone: reg.phone }));
  const ch2 = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé 2' }))).child.id;
  rs.push(await O.post(`/api/families/${fid}/children/${ch2}/phone`, { phone: newPhone() }));
  const ch3 = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé 3' }))).child.id;
  rs.push(await O.post(`/api/families/${fid}/children/${ch3}/phone`, { phone: member.phone }));
  for (const r of rs) { assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true, notice: INVITE_NOTICE }); }
  // thêm con kèm số: phần phản hồi giống nhau về dạng
  const c1 = await O.post(`/api/families/${fid}/children`, { name: 'Con có TK', phone: reg.phone });
  const c2 = await O.post(`/api/families/${fid}/children`, { name: 'Con chưa TK', phone: newPhone() });
  assert.deepEqual(Object.keys(c1.json).sort(), Object.keys(c2.json).sort()); assert.equal(c1.status, c2.status);
  // số của chính mình
  assert.equal((await O.post(`/api/families/${fid}/invites`, body(O.phone))).status, 400);
  // số sai định dạng
  assert.equal((await O.post(`/api/families/${fid}/invites`, body('123'))).status, 400);
});

test('lời mời hết hạn: không hiện, không nhận được (410), được dọn', async () => {
  const O = await signup('Chủ', {}); const A = await signup('A', {});
  const fid = await makeFamily(O, 'Nhà Hạn');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  const inv = (await ok(A.get('/api/invitations'))).invitations[0];
  await query("UPDATE invitations SET expires_at = now() - interval '1 second'");
  assert.deepEqual((await ok(A.get('/api/invitations'))).invitations, []);
  assert.equal((await ok(A.get('/api/me'))).pendingInvitations, 0);
  assert.equal((await A.post(`/api/invitations/${inv.id}/accept`)).status, 410);
  assert.equal((await query('SELECT status FROM invitations WHERE id=$1', [inv.id]))[0].status, 'expired');
  assert.equal((await A.get('/api/families/' + fid)).status, 404);
  // 14 ngày
  await ok(O.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  const row = (await query("SELECT (expires_at - created_at) > interval '13 days 23 hours' AND (expires_at - created_at) < interval '14 days 1 hour' AS okd FROM invitations WHERE status='pending' AND family_id=$1", [fid]))[0];
  assert.equal(row.okd, true);
});

test('thu hồi lời mời: chủ thu hồi mọi lời mời, quản lý chỉ lời mời của mình; thu hồi rồi người được mời không nhận được', async () => {
  const { O, M, fid } = await sample();
  const A = await signup('A', {}); const B = await signup('B', {});
  await ok(O.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  await ok(M.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  const list = (await ok(M.get('/api/families/' + fid))).invitations;
  assert.equal(list.length, 2);
  const ofO = list.find((i) => !i.mine); const ofM = list.find((i) => i.mine);
  assert.equal((await M.del(`/api/families/${fid}/invites/${ofO.id}`)).status, 403);
  assert.equal((await M.del(`/api/families/${fid}/invites/${ofM.id}`)).status, 200);
  assert.deepEqual((await ok(B.get('/api/invitations'))).invitations, []);
  assert.equal((await O.del(`/api/families/${fid}/invites/${ofO.id}`)).status, 200);
  assert.equal((await O.del(`/api/families/${fid}/invites/${ofO.id}`)).status, 404);
  assert.equal((await ok(A.get('/api/invitations'))).invitations.length, 0);
});

test('hạn mức lời mời mỗi người mỗi ngày (báo rõ) và lời mời chờ mỗi gia đình', async () => {
  await withConfig({ invitesPerUserDay: 2 }, async () => {
    const O = await signup('Nhiều mời', {}); const fid = await makeFamily(O, 'Nhà');
    assert.equal((await O.post(`/api/families/${fid}/invites`, { phone: newPhone() })).status, 200);
    assert.equal((await O.post(`/api/families/${fid}/invites`, { phone: newPhone() })).status, 200);
    const r = await O.post(`/api/families/${fid}/invites`, { phone: newPhone() });
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'invite_limit');
  });
  await withConfig({ maxPendingPerFamily: 2 }, async () => {
    const O = await signup('Nhiều chờ', {}); const fid = await makeFamily(O, 'Nhà');
    await ok(O.post(`/api/families/${fid}/invites`, { phone: newPhone() })); await ok(O.post(`/api/families/${fid}/invites`, { phone: newPhone() }));
    assert.equal((await O.post(`/api/families/${fid}/invites`, { phone: newPhone() })).status, 409);
  });
});

test('hồ sơ con: kiểm đầu vào, lưu trữ, xóa, gỡ nối bởi cha mẹ hoặc chính con', async () => {
  const { O, M, K, fid, kid, sib } = await sample();
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: '' })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: 'Bé', birthYear: 1900 })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: 'Bé', birthYear: 3000 })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: 'Bé', birthYear: 'abc' })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: 'Bé', phone: 'zzz' })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: 'x'.repeat(41) })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/children`, { name: 'Bé', note: 'n'.repeat(301) })).status, 400);
  const ok1 = await ok(O.post(`/api/families/${fid}/children`, { name: ' Bé   <b>Đậm</b> ', birthYear: '2016' }));
  assert.equal(ok1.child.name, 'Bé <b>Đậm</b>', 'lưu nguyên văn, giao diện chỉ dùng textContent');
  // sửa một phần
  await ok(O.post(`/api/families/${fid}/children/${sib}`, { note: 'mới' }));
  const d = await ok(O.get('/api/families/' + fid));
  const bi = d.children.find((c) => c.id === sib); assert.equal(bi.name, 'Bé Bi'); assert.equal(bi.note, 'mới'); assert.equal(bi.birthYear, 2019);
  // lưu trữ
  await ok(O.post(`/api/families/${fid}/children/${sib}/archive`, { archived: true }));
  assert.equal((await ok(O.get('/api/families/' + fid))).children.find((c) => c.id === sib).archived, true);
  assert.equal((await O.post(`/api/families/${fid}/children/${sib}/phone`, { phone: newPhone() })).status, 409);
  // hồ sơ con khác gia đình: 404
  const other = await signup('Khác', {}); const f2 = await makeFamily(other, 'Nhà khác');
  assert.equal((await O.post(`/api/families/${fid}/children/${(await ok(other.post(`/api/families/${f2}/children`, { name: 'Con khác' }))).child.id}`, { name: 'Hack' })).status, 404);
  // đã nối thì không nối số khác
  assert.equal((await O.post(`/api/families/${fid}/children/${kid}/phone`, { phone: newPhone() })).status, 409);
  // thành viên khác không gỡ nối; con tự gỡ nối của mình
  const T = (await sample()); // gia đình khác để thử chéo
  assert.equal((await T.K.post(`/api/families/${fid}/children/${kid}/unlink`)).status, 404);
  assert.equal((await M.post(`/api/families/${fid}/children/${kid}/unlink`)).status, 200);
  assert.equal((await K.get('/api/families/' + fid)).status, 404, 'gỡ nối rồi thì con không còn thấy gia đình');
  const od = await ok(O.get('/api/families/' + fid)); assert.equal(od.children.find((c) => c.id === kid).linkedUserId, null);
  assert.equal((await query("SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND role='con' AND left_at IS NULL", [K.user.id]))[0].n, 0);
  // nối lại bằng số, rồi con tự rời
  await ok(O.post(`/api/families/${fid}/children/${kid}/phone`, { phone: K.phone }));
  await ok(K.post(`/api/invitations/${(await ok(K.get('/api/invitations'))).invitations[0].id}/accept`));
  assert.equal((await K.post(`/api/families/${fid}/children/${kid}/unlink`)).status, 200);
  assert.equal((await K.get('/api/families/' + fid)).status, 404);
  // xóa hồ sơ
  assert.equal((await O.del(`/api/families/${fid}/children/${sib}`)).status, 200);
  assert.equal((await ok(O.get('/api/families/' + fid))).children.some((c) => c.id === sib), false);
});

test('rời gia đình, xóa thành viên: con rời thì hồ sơ gỡ nối; người đã rời không còn truy cập', async () => {
  const { O, M, T, K, fid, kid } = await sample();
  assert.equal((await T.post(`/api/families/${fid}/leave`)).status, 200);
  assert.equal((await T.get('/api/families/' + fid)).status, 404);
  assert.equal((await K.post(`/api/families/${fid}/leave`)).status, 200);
  assert.equal((await ok(O.get('/api/families/' + fid))).children.find((c) => c.id === kid).linkedUserId, null);
  assert.equal((await M.del(`/api/families/${fid}/members/${O.user.id}`)).status, 403);
  // mời lại người đã rời: vào lại được
  await inviteAndAccept(O, fid, T, 'thanh_vien');
  assert.equal((await ok(T.get('/api/families/' + fid))).me.role, 'thanh_vien');
  assert.equal((await query('SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND family_id=$2', [T.user.id, fid]))[0].n, 2, 'giữ lịch sử rời/vào');
  assert.equal(await owners(fid), 1);
});

test('chuyển quyền chủ: cần mật khẩu, chỉ cho người lớn trong gia đình; luôn đúng một chủ', async () => {
  const { O, M, T, K, fid } = await sample();
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: M.user.id, password: 'sai-mat-khau' })).status, 403);
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: K.user.id, password: PASS })).status, 400, 'không chuyển cho con');
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: (await signup('Ngoài', {})).user.id, password: PASS })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: O.user.id, password: PASS })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: 'abc', password: PASS })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: M.user.id, password: PASS })).status, 200);
  assert.equal((await ok(M.get('/api/families/' + fid))).me.role, 'chu');
  assert.equal((await ok(O.get('/api/families/' + fid))).me.role, 'quan_ly');
  assert.equal((await O.post(`/api/families/${fid}/delete`, { password: PASS, confirmName: 'Nhà Cún' })).status, 403, 'chủ cũ hết quyền xóa');
  assert.equal(await owners(fid), 1);
  // chỉ mục duy nhất: chèn tay chủ thứ hai bị CSDL chặn
  await assert.rejects(query("UPDATE memberships SET role='chu' WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL", [fid, T.user.id]), /memberships_one_owner/);
});

test('một chủ duy nhất dưới truy cập đồng thời: chuyển quyền đua nhau, rời đua nhau, xóa đua nhau', async () => {
  for (let round = 0; round < 3; round++) {
    const { O, M, T, fid } = await sample();
    const rs = await Promise.all([
      O.post(`/api/families/${fid}/transfer`, { toUserId: M.user.id, password: PASS }),
      O.post(`/api/families/${fid}/transfer`, { toUserId: T.user.id, password: PASS }),
      O.post(`/api/families/${fid}/transfer`, { toUserId: M.user.id, password: PASS }),
      M.post(`/api/families/${fid}/leave`), T.post(`/api/families/${fid}/leave`),
      O.post(`/api/families/${fid}/members/${M.user.id}/role`, { role: 'thanh_vien' }),
      T.post(`/api/families/${fid}/members/${M.user.id}/role`, { role: 'thanh_vien' }),
    ]);
    assert.ok(rs.every((r) => r.status < 500), rs.map((r) => r.status).join());
    assert.equal(await owners(fid), 1, 'đúng một chủ: ' + rs.map((r) => r.status).join());
    assert.ok(rs.slice(0, 3).filter((r) => r.status === 200).length <= 1, 'tối đa một lần chuyển quyền thắng: ' + rs.map((r) => r.status).join());
  }
  // hai người cùng nhận một lời mời đồng thời -> một thành viên
  const O = await signup('Chủ', {}); const A = await signup('A', {}); const fid = await makeFamily(O, 'Nhà đua');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  const inv = (await ok(A.get('/api/invitations'))).invitations[0];
  const rs = await Promise.all(Array.from({ length: 6 }, () => A.post(`/api/invitations/${inv.id}/accept`)));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
  assert.equal((await query('SELECT count(*)::int AS n FROM memberships WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fid, A.user.id]))[0].n, 1);
});

test('xóa gia đình: nhập lại mật khẩu và gõ đúng tên; xóa sạch dữ liệu liên quan', async () => {
  const { O, M, K, fid } = await sample();
  assert.equal((await O.post(`/api/families/${fid}/delete`, { password: 'sai-mk', confirmName: 'Nhà Cún' })).status, 403);
  assert.equal((await O.post(`/api/families/${fid}/delete`, { password: PASS, confirmName: 'Nhà Khác' })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/delete`, { password: PASS })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/delete`, { password: PASS, confirmName: ' nhà cún ' })).status, 200);
  for (const c of [O, M, K]) assert.equal((await c.get('/api/families/' + fid)).status, 404);
  for (const t of ['memberships', 'child_profiles', 'invitations']) assert.equal((await query(`SELECT count(*)::int AS n FROM ${t} WHERE family_id=$1`, [fid]))[0].n, 0);
  assert.equal((await O.post(`/api/families/${fid}/delete`, { password: PASS, confirmName: 'Nhà Cún' })).status, 404);
});

test('idempotency: bấm hai lần cùng khóa chỉ tạo một gia đình / một hồ sơ; khác nội dung thì 422', async () => {
  const a = await signup('Idem', {});
  const h = { 'idempotency-key': 'tao-gia-dinh-0001' };
  const r1 = await a.post('/api/families', { name: 'Một lần' }, { headers: h });
  const r2 = await a.post('/api/families', { name: 'Một lần' }, { headers: h });
  assert.equal(r1.json.family.id, r2.json.family.id);
  assert.equal((await ok(a.get('/api/families'))).families.length, 1);
  assert.equal((await a.post('/api/families', { name: 'Khác' }, { headers: h })).status, 422);
  assert.equal((await a.post('/api/families', { name: 'Z' }, { headers: { 'idempotency-key': 'short' } })).status, 400);
  const fid = r1.json.family.id;
  const rs = await Promise.all(Array.from({ length: 4 }, () => a.post(`/api/families/${fid}/children`, { name: 'Con đua' }, { headers: { 'idempotency-key': 'tao-con-dong-thoi-1' } })));
  assert.ok(rs.every((r) => r.status === 200 || r.status === 409), rs.map((r) => r.status).join());
  assert.equal((await ok(a.get('/api/families/' + fid))).children.length, 1);
  // bảng idem không giữ bí mật: chỉ có phản hồi tạo gia đình/hồ sơ
  const bodies = JSON.stringify(await query('SELECT body FROM idem'));
  assert.ok(!bodies.includes(PASS) && !/pbkdf2|nine_sid|token/i.test(bodies));
});

test('xuất dữ liệu cá nhân và xóa tài khoản: bắt buộc chọn cho gia đình mình làm chủ', async () => {
  const { O, M, T, K, fid, kid } = await sample();
  const solo = await makeFamily(O, 'Nhà một mình');
  assert.equal((await O.post('/api/account/export', { password: 'sai' })).status, 403, 'xuất dữ liệu phải nhập lại mật khẩu');
  assert.equal((await O.get('/api/account/export')).status, 405);
  const exp = await O.post('/api/account/export', { password: PASS });
  assert.equal(exp.status, 200); assert.match(exp.headers.get('content-disposition'), /attachment/);
  const data = exp.json;
  assert.equal(data.account.phone, util.normalizePhone(O.phone)); assert.equal(data.families.length, 2);
  assert.ok(!exp.buf.toString().includes('password_hash') && !exp.buf.toString().includes('pbkdf2') && !exp.buf.toString().includes(util.normalizePhone(M.phone)), 'không lộ băm mật khẩu, số của người khác');
  // chưa chọn: 409 kèm danh sách
  const r = await O.post('/api/account/delete', { password: PASS });
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'needs_decision');
  const fams = r.json.error.details.families;
  assert.equal(fams.length, 2);
  assert.deepEqual(fams.find((f) => f.id === fid).candidates.map((c) => c.displayName).sort(), ['Bà Nội', 'Mẹ Hoa']);
  assert.deepEqual(fams.find((f) => f.id === solo).candidates, []);
  assert.equal((await O.get('/api/me')).json.user.id, O.user.id, '409 thì chưa xóa gì');
  // mật khẩu sai
  assert.equal((await O.post('/api/account/delete', { password: 'sai', decisions: {} })).status, 403);
  // chuyển quyền cho người không phải thành viên / chọn thiếu
  assert.equal((await O.post('/api/account/delete', { password: PASS, decisions: { [fid]: { action: 'transfer', toUserId: K.user.id }, [solo]: { action: 'delete' } } })).status, 400, 'không chuyển cho con');
  assert.equal((await O.post('/api/account/delete', { password: PASS, decisions: { [fid]: { action: 'transfer', toUserId: M.user.id } } })).status, 409, 'thiếu quyết định cho gia đình còn lại');
  assert.equal((await query('SELECT count(*)::int AS n FROM users WHERE id=$1', [O.user.id]))[0].n, 1);
  // lời mời O đã gửi còn chờ phải bị thu hồi khi xóa
  const guest = await signup('Khách', {}); await ok(O.post(`/api/families/${fid}/invites`, { phone: guest.phone }));
  const res = await O.post('/api/account/delete', { password: PASS, decisions: { [fid]: { action: 'transfer', toUserId: M.user.id }, [solo]: { action: 'delete' } } });
  assert.equal(res.status, 200);
  assert.equal((await O.get('/api/me')).json.user, null, 'phiên bị hủy');
  assert.equal((await new Client('x').post('/api/login', { phone: O.phone, password: PASS })).status, 401);
  assert.equal((await query('SELECT count(*)::int AS n FROM users WHERE id=$1', [O.user.id]))[0].n, 0);
  assert.equal((await query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [O.user.id]))[0].n, 0);
  assert.equal((await ok(M.get('/api/families/' + fid))).me.role, 'chu', 'quyền chủ đã chuyển');
  assert.equal(await owners(fid), 1);
  assert.equal((await M.get('/api/families/' + solo)).status, 404);
  assert.equal((await ok(M.get('/api/families/' + fid))).members.some((m) => m.userId === O.user.id), false);
  assert.deepEqual((await ok(guest.get('/api/invitations'))).invitations, [], 'lời mời của người đã xóa bị thu hồi');
  const ch = (await ok(M.get('/api/families/' + fid))).children.find((c) => c.id === kid);
  assert.ok(ch, 'hồ sơ con vẫn còn');
  // nhật ký sự kiện xóa không chứa số
  const au = JSON.stringify(await query("SELECT * FROM audit WHERE kind='account_deleted'"));
  assert.ok(!au.includes(O.phone.slice(1)));
  // người con bị xóa tài khoản: hồ sơ gỡ nối
  assert.equal((await K.post('/api/account/delete', { password: PASS })).status, 200);
  assert.equal((await ok(M.get('/api/families/' + fid))).children.find((c) => c.id === kid).linkedUserId, null);
  assert.ok(T);
});

test('xóa tài khoản đồng thời với chuyển quyền: vẫn đúng một chủ, không kẹt khóa', async () => {
  const { O, M, T, fid } = await sample();
  const rs = await Promise.all([
    O.post('/api/account/delete', { password: PASS, decisions: { [fid]: { action: 'transfer', toUserId: M.user.id } } }),
    O.post(`/api/families/${fid}/transfer`, { toUserId: T.user.id, password: PASS }),
    M.post(`/api/families/${fid}/leave`),
  ]);
  assert.ok(rs.every((r) => r.status < 500), rs.map((r) => r.status).join());
  const n = await owners(fid);
  assert.ok(n === 1 || (await query('SELECT 1 FROM families WHERE id=$1', [fid])).length === 0, 'còn gia đình thì đúng một chủ: ' + rs.map((r) => r.status).join());
});

test('con lớn lên: được mời làm người lớn, hồ sơ con được gỡ nối, vai trò đổi', async () => {
  const { O, K, fid, kid } = await sample();
  assert.equal((await ok(K.get('/api/families/' + fid))).me.role, 'con');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: K.phone, role: 'thanh_vien' }));
  const inv = (await ok(K.get('/api/invitations'))).invitations;
  assert.equal(inv.length, 1); assert.equal(inv[0].kind, 'nguoi_lon');
  await ok(K.post(`/api/invitations/${inv[0].id}/accept`));
  const d = await ok(K.get('/api/families/' + fid));
  assert.equal(d.me.role, 'thanh_vien');
  assert.equal(d.children.find((c) => c.id === kid).linkedUserId, null, 'hồ sơ con không còn nối');
  assert.equal(await owners(fid), 1);
  assert.equal((await query('SELECT count(*)::int AS n FROM memberships WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fid, K.user.id]))[0].n, 1);
});
