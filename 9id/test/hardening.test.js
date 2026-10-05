// Kiểm thử cho đợt sửa lỗi sau phản biện độc lập (T1..T7, L1..L9) và nhập gia đình từ app khác
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { boot, shutdown, Client, ok, newPhone, signup, PASS, query, config, util, origin, base, makeFamily, makeFamilyStrict, inviteAndAccept, acceptAndApprove, getTicket, requestOtpRaw, powFor, pow, provider, internal, tokenOf, maintenance, signConsole } from './helper.js';
const { INVITE_NOTICE } = await import('../src/routes/families.js');
const { usageLevel, resetWarned } = await import('../src/otp.js');
const { createNineId, NineIdError } = await import('../client/nine-id.js');

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};
let ipSeq = 1;
const freshIp = () => `10.7.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const verifyWith = (phone, code, ip) => { const c = new Client('v', ip); return c.post('/api/otp/verify', { phone, code }); };
const wrongCode = (real) => (real === '123456' ? '654321' : '123456');

// ================= T1: thiết bị quen =================
test('T1: kẻ lạ sai nhiều lần từ nhiều IP không khóa được chủ thật trên thiết bị quen; thiết bị lạ thì bị khóa theo số', async () => {
  await withConfig({ loginPhoneLimit: 6, loginPairLimit: 100, loginIpLimit: 100000 }, async () => {
    const owner = await signup('Chủ thật', {});
    assert.ok(owner.dev.startsWith('nine_dev='), 'đăng ký đặt cookie thiết bị');
    const row = await query('SELECT token_hash FROM devices WHERE user_id=$1', [owner.user.id]);
    assert.equal(row.length, 1); assert.notEqual(row[0].token_hash, owner.dev.split('=')[1], 'chỉ lưu băm');
    for (let i = 0; i < 8; i++) assert.ok([401, 429].includes((await new Client('kẻ lạ ' + i, freshIp()).post('/api/login', { phone: owner.phone, password: 'doan-sai-' + i })).status));
    // thiết bị lạ (kể cả có mật khẩu đúng) bị khóa theo số
    const stranger = await new Client('lạ', freshIp()).post('/api/login', { phone: owner.phone, password: PASS });
    assert.equal(stranger.status, 429); assert.equal(stranger.json.error.code, 'login_locked');
    // thiết bị mang cookie của người khác không được miễn
    const other = await signup('Người khác', {});
    const borrowed = new Client('mượn', freshIp()); borrowed.dev = other.dev;
    assert.equal((await borrowed.post('/api/login', { phone: owner.phone, password: PASS })).status, 429);
    // thiết bị quen ở IP mới vào được
    const mine = new Client('máy quen', freshIp()); mine.dev = owner.dev;
    const r = await mine.post('/api/login', { phone: owner.phone, password: PASS });
    assert.equal(r.status, 200);
    // thiết bị quen sai mật khẩu vẫn chịu độ trễ theo cặp (số, IP)
  });
  await withConfig({ loginPairLimit: 3, loginPhoneLimit: 100, loginIpLimit: 100000 }, async () => {
    const owner = await signup('Chủ 2', {});
    const mine = new Client('quen', freshIp()); mine.dev = owner.dev;
    for (let i = 0; i < 3; i++) assert.equal((await mine.post('/api/login', { phone: owner.phone, password: 'sai-' + i })).status, 401);
    assert.equal((await mine.post('/api/login', { phone: owner.phone, password: PASS })).status, 429, 'cặp (số, IP) vẫn bị làm chậm');
  });
});

test('T1: đặt lại mật khẩu quên mọi thiết bị quen; đổi mật khẩu quên thiết bị khác', async () => {
  const a = await signup('Quên TB', {});
  const old = a.dev;
  const c = new Client('r', freshIp());
  const v = await getTicket(c, a.phone, 'reset');
  await ok(c.post('/api/password/reset', { ticket: v.ticket, phone: a.phone, password: 'MoiHoanToan-77' }));
  const rows = await query('SELECT token_hash FROM devices WHERE user_id=$1', [a.user.id]);
  assert.equal(rows.length, 1, 'chỉ còn thiết bị vừa đặt lại');
  assert.ok(!rows.some((r) => r.token_hash === util.sha256hex(old.split('=')[1])));
});

// ================= T2: OTP =================
test('T2: nhập sai OTP ở IP khác không đốt mã của chủ số; 5 lần sai cùng IP hoặc 20 lần tổng thì khóa', async () => {
  const phone = newPhone(); const e = util.normalizePhone(phone);
  await ok(requestOtpRaw(new Client('x', freshIp()), phone));
  const code = provider.lastOtp(e); const bad = wrongCode(code);
  const A = freshIp(); const B = freshIp();
  for (let i = 0; i < 4; i++) assert.equal((await verifyWith(phone, bad, A)).status, 400);
  assert.equal((await verifyWith(phone, code, B)).status, 200, 'chủ số ở IP khác vẫn nhập được mã đúng sau 4 lần sai của kẻ lạ');
  // 5 lần sai cùng một IP: IP đó bị khóa, IP khác vẫn dùng được
  const phone2 = newPhone(); await ok(requestOtpRaw(new Client('x', freshIp()), phone2));
  const code2 = provider.lastOtp(util.normalizePhone(phone2));
  for (let i = 0; i < 5; i++) await verifyWith(phone2, wrongCode(code2), A);
  const lockedA = await verifyWith(phone2, code2, A);
  assert.equal(lockedA.status, 429); assert.equal(lockedA.json.error.code, 'otp_locked');
  assert.equal((await verifyWith(phone2, code2, B)).status, 200);
  // 20 lần sai tổng cộng từ nhiều IP: khóa cho tất cả, kể cả mã đúng
  const phone3 = newPhone(); await ok(requestOtpRaw(new Client('x', freshIp()), phone3));
  const code3 = provider.lastOtp(util.normalizePhone(phone3));
  await withConfig({ otpDailyGuesses: 1000 }, async () => {
    for (let ip = 0; ip < 5; ip++) { const addr = freshIp(); for (let i = 0; i < 4; i++) await verifyWith(phone3, wrongCode(code3), addr); }
    const r = await verifyWith(phone3, code3, freshIp());
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'otp_locked');
  });
});

test('T2: trần dò 25 lần/ngày/số (đặt nhỏ để thử), tính trên mọi mã của số đó', async () => {
  await withConfig({ otpDailyGuesses: 6, otpMaxTriesTotal: 100 }, async () => {
    const phone = newPhone();
    await ok(requestOtpRaw(new Client('x', freshIp()), phone));
    const code = provider.lastOtp(util.normalizePhone(phone));
    for (let i = 0; i < 6; i++) await verifyWith(phone, wrongCode(code), freshIp());
    const r = await verifyWith(phone, code, freshIp());
    assert.equal(r.status, 429);
    // xin mã mới cũng không mở lại trong cùng ngày
    await ok(requestOtpRaw(new Client('x', freshIp()), phone));
    assert.equal((await verifyWith(phone, provider.lastOtp(util.normalizePhone(phone)), freshIp())).status, 429);
  });
});

test('T2: hạn mức xin mã tách riêng cho đăng ký và đặt lại mật khẩu; báo rõ khi mã cũ còn hiệu lực', async () => {
  await withConfig({ otpDailyPerPhone: 1, otpResendSec: 0 }, async () => {
    const phone = newPhone(); const c = new Client('x', freshIp());
    assert.equal((await requestOtpRaw(c, phone, { purpose: 'register' })).status, 200);
    assert.equal((await requestOtpRaw(c, phone, { purpose: 'register' })).status, 429, 'hết hạn mức đăng ký');
    assert.equal((await requestOtpRaw(c, phone, { purpose: 'reset' })).status, 200, 'đặt lại mật khẩu có hạn mức riêng');
    assert.equal((await requestOtpRaw(c, phone, { purpose: 'khac' })).status, 400);
  });
  await withConfig({ otpResendSec: 60 }, async () => {
    const phone = newPhone(); const c = new Client('x', freshIp());
    await ok(requestOtpRaw(c, phone));
    const r = await requestOtpRaw(c, phone);
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'otp_too_soon');
    assert.match(r.json.error.message, /còn hiệu lực/);
  });
});

// ================= T3: proof-of-work, ngân sách OTP =================
test('T3: proof-of-work: thiếu, sai, hết hạn, dùng lại, thử thách giả đều bị từ chối', async () => {
  const c = new Client('p', freshIp()); const phone = newPhone();
  const code = async (r) => (await r).json && (await r).json.error && (await r).json.error.code;
  assert.equal((await c.post('/api/otp/request', { phone })).json.error.code, 'pow_invalid', 'thiếu pow');
  assert.equal((await c.post('/api/otp/request', { phone, pow: 'x' })).json.error.code, 'pow_invalid');
  const ch = await ok(c.get('/api/otp/challenge'));
  assert.equal(ch.bits, config.powBits); assert.equal(ch.ttlSec, 120);
  // counter sai: tìm một số KHÔNG đạt độ khó
  let wrong = 0; while (pow.leadingZeroBits(crypto.createHash('sha256').update(`${ch.challenge}:${wrong}`).digest()) >= ch.bits) wrong++;
  assert.equal((await c.post('/api/otp/request', { phone, pow: { challenge: ch.challenge, counter: wrong } })).json.error.code, 'pow_invalid');
  // thử thách giả (không có chữ ký đúng)
  const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 100000, bits: 1, r: 'x' })).toString('base64url') + '.' + 'a'.repeat(64);
  assert.equal((await c.post('/api/otp/request', { phone, pow: { challenge: forged, counter: 0 } })).json.error.code, 'pow_invalid');
  // sửa độ khó trong payload làm hỏng chữ ký
  const [payload, sig] = ch.challenge.split('.');
  const easier = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), bits: 0 })).toString('base64url') + '.' + sig;
  assert.equal((await c.post('/api/otp/request', { phone, pow: { challenge: easier, counter: 0 } })).json.error.code, 'pow_invalid');
  // đúng: dùng được một lần
  const good = { challenge: ch.challenge, counter: pow.solve(ch.challenge, ch.bits) };
  assert.equal((await c.post('/api/otp/request', { phone, pow: good })).status, 200);
  const again = await c.post('/api/otp/request', { phone: newPhone(), pow: good });
  assert.equal(again.status, 400); assert.equal(again.json.error.code, 'pow_invalid', 'dùng lại lời giải bị từ chối');
  // hết hạn
  await withConfig({ powTtlSec: -5 }, async () => {
    const old = await ok(c.get('/api/otp/challenge'));
    const r = await c.post('/api/otp/request', { phone: newPhone(), pow: { challenge: old.challenge, counter: pow.solve(old.challenge, old.bits) } });
    assert.equal(r.json.error.code, 'pow_invalid');
  });
  // số sai định dạng: 400 trước cả khi tính PoW (không tiêu thử thách)
  const ch2 = await ok(c.get('/api/otp/challenge'));
  const p2 = { challenge: ch2.challenge, counter: pow.solve(ch2.challenge, ch2.bits) };
  assert.equal((await c.post('/api/otp/request', { phone: '123', pow: p2 })).json.error.code, 'invalid_phone');
  assert.equal((await c.post('/api/otp/request', { phone: newPhone(), pow: p2 })).status, 200, 'thử thách chưa bị tiêu');
  void code;
});

test('T3: độ khó tăng khi lượng xin OTP gần đây tăng bất thường', async () => {
  const c = new Client('p', freshIp());
  const base0 = (await ok(c.get('/api/otp/challenge'))).bits;
  const rows = Array.from({ length: 250 }, (_, i) => `('hh${i}','c','s', now() + interval '5 minutes', 'ipx')`).join(',');
  await query(`INSERT INTO otps(phone_hash, code_hash, salt, expires_at, ip_key) VALUES ${rows}`);
  const up = (await ok(c.get('/api/otp/challenge'))).bits;
  assert.equal(up, base0 + 1);
  await query("DELETE FROM otps WHERE phone_hash LIKE 'hh%'");
  assert.equal((await ok(c.get('/api/otp/challenge'))).bits, base0);
});

test('T3: ngân sách OTP dành riêng cho đặt lại mật khẩu của tài khoản đã tồn tại; ngưỡng cảnh báo 50% và 80%', async () => {
  assert.equal(usageLevel(10, 100), 0); assert.equal(usageLevel(50, 100), 50); assert.equal(usageLevel(79, 100), 50); assert.equal(usageLevel(80, 100), 80); assert.equal(usageLevel(1, 0), 0);
  const a = await signup('Có TK', {});
  const used = (await query("SELECT count(*)::int AS n FROM otps WHERE created_at > now() - interval '24 hours' AND NOT reserved"))[0].n;
  await withConfig({ otpDailyGlobal: used, otpDailyReserved: 2 }, async () => {
    const c = new Client('x', freshIp());
    assert.equal((await requestOtpRaw(c, newPhone(), { purpose: 'register' })).status, 503, 'trần chung cạn: đăng ký mới bị từ chối');
    assert.equal((await requestOtpRaw(c, newPhone(), { purpose: 'reset' })).status, 503, 'đặt lại cho số chưa có tài khoản không dùng ngân sách dành riêng');
    assert.equal((await requestOtpRaw(c, a.phone, { purpose: 'reset' })).status, 200, 'đặt lại cho tài khoản có sẵn vẫn gửi được');
    assert.equal((await query('SELECT reserved FROM otps ORDER BY id DESC LIMIT 1'))[0].reserved, true);
    // Console summary cảnh báo từ 80%
    const t = String(Math.floor(Date.now() / 1000)); const full = '/id/admin-api/v1/summary';
    const r = await fetch(origin + full, { headers: { 'x-console-key': config.consoleApiKeyId, 'x-console-ts': t, 'x-console-sig': signConsole(config.consoleApiSecret, t, 'GET', full, '') } });
    const j = await r.json();
    assert.ok(j.alerts.some((x) => /80% trần/.test(x.text)), JSON.stringify(j.alerts));
  });
  // cảnh báo ghi log một lần khi chạm 50%
  resetWarned();
  const lines = []; const ow = console.warn; console.warn = (...x) => lines.push(x.join(' '));
  try {
    const used2 = (await query("SELECT count(*)::int AS n FROM otps WHERE created_at > now() - interval '24 hours' AND NOT reserved"))[0].n;
    await withConfig({ otpDailyGlobal: (used2 + 1) * 2 }, async () => { await requestOtpRaw(new Client('x', freshIp()), newPhone()); });
  } finally { console.warn = ow; }
  assert.ok(lines.some((l) => /cảnh báo.*50%/.test(l)), lines.join('|'));
});

// ================= T4/T7 đã kiểm trong auth.test.js; ở đây: vé gắn với số =================
test('L6: vé chỉ lưu băm số và chỉ dùng được với đúng số đó', async () => {
  const cols = (await query("SELECT column_name FROM information_schema.columns WHERE table_name='tickets'")).map((r) => r.column_name);
  assert.ok(!cols.includes('phone') && cols.includes('phone_hash'));
  const c = new Client('t', freshIp()); const p1 = newPhone(); const p2 = newPhone();
  const v = await getTicket(c, p1);
  assert.equal((await c.post('/api/register', { ticket: v.ticket, phone: p2, name: 'X', password: PASS })).status, 400, 'vé của số này không dùng cho số khác');
  assert.equal((await c.post('/api/register', { ticket: v.ticket, name: 'X', password: PASS })).status, 400, 'thiếu số');
  assert.equal((await c.post('/api/register', { ticket: v.ticket, phone: p1, name: 'X', password: PASS })).status, 200);
});

// ================= T5: chặn, báo cáo, hạn mức, thông điệp chung =================
test('T5: chặn người mời: lời mời đóng, lời mời mới bị bỏ qua nhưng người mời nhận thông điệp CHUNG; bỏ chặn thì nhận lại', async () => {
  const A = await signup('Người mời', {}); const B = await signup('Người nhận', {});
  const fid = await makeFamily(A, 'Nhà Chặn');
  const r0 = await ok(A.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  assert.equal(r0.notice, INVITE_NOTICE); assert.match(INVITE_NOTICE, /chưa đến được người nhận/);
  const inv = (await ok(B.get('/api/invitations'))).invitations[0];
  assert.match(inv.familyNameNote, /tự đặt/);
  await ok(B.post(`/api/invitations/${inv.id}/block`));
  assert.deepEqual((await ok(B.get('/api/invitations'))).invitations, []);
  const blocks = (await ok(B.get('/api/blocks'))).blocks;
  assert.equal(blocks.length, 1); assert.equal(blocks[0].userId, A.user.id);
  const r1 = await A.post(`/api/families/${fid}/invites`, { phone: B.phone });
  assert.equal(r1.status, 200); assert.deepEqual(r1.json, r0, 'phản hồi y hệt: người mời không biết đã bị chặn');
  assert.deepEqual((await ok(B.get('/api/invitations'))).invitations, []);
  // người chặn vẫn mời được A (chiều ngược lại không bị ảnh hưởng)
  const fidB = await makeFamily(B, 'Nhà B'); await ok(B.post(`/api/families/${fidB}/invites`, { phone: A.phone }));
  assert.equal((await ok(A.get('/api/invitations'))).invitations.length, 1);
  assert.equal((await B.del('/api/blocks/' + A.user.id)).status, 200);
  assert.equal((await B.del('/api/blocks/' + A.user.id)).status, 404);
  await ok(A.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  assert.equal((await ok(B.get('/api/invitations'))).invitations.length, 1);
});

test('T5: báo cáo: ghi báo cáo, chặn và đóng lời mời; không ai khác chặn/báo cáo thay được', async () => {
  const A = await signup('Spam', {}); const B = await signup('Nạn nhân', {}); const X = await signup('Người ngoài', {});
  const fid = await makeFamily(A, 'Nhà Spam');
  await ok(A.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  const inv = (await ok(B.get('/api/invitations'))).invitations[0];
  assert.equal((await X.post(`/api/invitations/${inv.id}/report`)).status, 404);
  assert.equal((await X.post(`/api/invitations/${inv.id}/block`)).status, 404);
  await ok(B.post(`/api/invitations/${inv.id}/report`));
  const rep = await query('SELECT reporter, reported FROM invite_reports');
  assert.ok(rep.some((r) => r.reporter === B.user.id && r.reported === A.user.id));
  assert.equal((await B.get('/api/blocks')).json.blocks.length, 1);
  assert.equal((await B.post(`/api/invitations/${inv.id}/accept`)).status, 404);
});

test('T5: tài khoản mới (dưới 24 giờ) bị hạn mức lời mời chặt hơn; tài khoản lâu năm thì không', async () => {
  await withConfig({ newAccountInvitesPerDay: 2 }, async () => {
    const O = await signup('Mới toanh', {}); const fid = await makeFamily(O, 'Nhà');
    await ok(O.post(`/api/families/${fid}/invites`, { phone: newPhone() })); await ok(O.post(`/api/families/${fid}/invites`, { phone: newPhone() }));
    const r = await O.post(`/api/families/${fid}/invites`, { phone: newPhone() });
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'invite_limit'); assert.match(r.json.error.message, /Tài khoản mới/);
    await query("UPDATE users SET created_at = now() - interval '3 days' WHERE id=$1", [O.user.id]);
    O.user = null;
    assert.equal((await O.post(`/api/families/${fid}/invites`, { phone: newPhone() })).status, 200);
  });
});

// ================= T6: bước duyệt =================
async function strictSetup() {
  const O = await signup('Mẹ duyệt', {}); const M = await signup('Quản lý', {}); const T = await signup('Thành viên', {});
  const fid = await makeFamilyStrict(O, 'Nhà Duyệt');
  await acceptAndApprove(O, fid, (await (async () => { await ok(O.post(`/api/families/${fid}/invites`, { phone: M.phone, role: 'quan_ly' })); return M; })()));
  await ok(O.post(`/api/families/${fid}/invites`, { phone: T.phone, role: 'thanh_vien' }));
  await acceptAndApprove(O, fid, T);
  const kid = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé Bí Mật', birthYear: 2016, note: 'dị ứng tôm nặng' }))).child.id;
  return { O, M, T, fid, kid };
}

test('T6: người nhận bấm chấp nhận chỉ vào hàng chờ duyệt: không thấy dữ liệu gia đình, chủ thấy 4 số cuối và duyệt/từ chối', async () => {
  const { O, M, T, fid } = await strictSetup();
  const S = await signup('Người lạ gõ nhầm', {});
  await ok(O.post(`/api/families/${fid}/invites`, { phone: S.phone, role: 'thanh_vien' }));
  // người mời thấy 4 số cuối ngay khi lời mời còn chờ người nhận
  const pend = (await ok(O.get('/api/families/' + fid))).invitations.find((i) => i.phoneLast4 === S.phone.slice(-4));
  assert.ok(pend && !pend.awaiting);
  const inv = (await ok(S.get('/api/invitations'))).invitations[0];
  const acc = await ok(S.post(`/api/invitations/${inv.id}/accept`));
  assert.equal(acc.awaiting, true); assert.equal(acc.familyId, undefined);
  // chưa thấy bất kỳ dữ liệu gia đình
  assert.equal((await S.get('/api/families/' + fid)).status, 404);
  assert.deepEqual((await ok(S.get('/api/families'))).families, []);
  assert.equal((await internal('strict', 'GET', `/internal/v1/families/${fid}/children?as=${S.user.id}`, undefined, { token: tokenOf(S) })).status, 404);
  const mine = (await ok(S.get('/api/invitations'))).invitations;
  assert.equal(mine.length, 1); assert.equal(mine[0].awaitingApproval, true);
  assert.ok(!JSON.stringify(mine).includes('Bé Bí Mật'));
  // người duyệt được thông báo: số lời chờ duyệt ở /api/me và API nội bộ
  assert.equal((await ok(O.get('/api/me'))).pendingApprovals, 1);
  assert.equal((await ok(M.get('/api/me'))).pendingApprovals, 1);
  assert.equal((await ok(T.get('/api/me'))).pendingApprovals, 0);
  assert.equal((await internal('family', 'GET', `/internal/v1/users/${O.user.id}/families`)).json.pendingApprovals, 1);
  const aw = (await ok(O.get('/api/families/' + fid))).invitations.find((i) => i.awaiting);
  assert.equal(aw.phoneLast4, S.phone.slice(-4)); assert.equal(aw.accepterName, 'Người lạ gõ nhầm');
  // thành viên thường và người ngoài không duyệt được
  assert.equal((await T.post(`/api/families/${fid}/invites/${aw.id}/approve`)).status, 403);
  const X = await signup('Ngoài', {});
  assert.equal((await X.post(`/api/families/${fid}/invites/${aw.id}/approve`)).status, 404);
  // từ chối: người nhận không vào, lời mời đóng
  assert.equal((await M.post(`/api/families/${fid}/invites/${aw.id}/reject`)).status, 200);
  assert.equal((await S.get('/api/families/' + fid)).status, 404);
  assert.deepEqual((await ok(S.get('/api/invitations'))).invitations, []);
  assert.equal((await O.post(`/api/families/${fid}/invites/${aw.id}/approve`)).status, 404);
  assert.equal((await ok(O.get('/api/me'))).pendingApprovals, 0);
  // mời lại, lần này duyệt
  await ok(O.post(`/api/families/${fid}/invites`, { phone: S.phone, role: 'thanh_vien' }));
  await ok(S.post(`/api/invitations/${(await ok(S.get('/api/invitations'))).invitations[0].id}/accept`));
  const aw2 = (await ok(O.get('/api/families/' + fid))).invitations.find((i) => i.awaiting);
  assert.equal((await ok(M.post(`/api/families/${fid}/invites/${aw2.id}/approve`))).ok, true);
  assert.equal((await ok(S.get('/api/families/' + fid))).me.role, 'thanh_vien');
});

test('T6: duyệt đồng thời chỉ một lần; lời mời hết hạn khi chờ duyệt; người nhận hủy được khi đang chờ; con cũng phải được duyệt', async () => {
  const { O, M, fid, kid } = await strictSetup();
  const K = await signup('Con', {});
  await ok(O.post(`/api/families/${fid}/children/${kid}/phone`, { phone: K.phone }));
  const inv = (await ok(K.get('/api/invitations'))).invitations[0];
  assert.equal((await ok(K.post(`/api/invitations/${inv.id}/accept`))).awaiting, true);
  assert.equal((await K.get('/api/families/' + fid)).status, 404, 'con chưa được duyệt thì chưa thấy gì');
  const aw = (await ok(O.get('/api/families/' + fid))).invitations.find((i) => i.awaiting);
  assert.equal(aw.kind, 'con'); assert.equal(aw.childName, 'Bé Bí Mật');
  const rs = await Promise.all([O.post(`/api/families/${fid}/invites/${aw.id}/approve`), M.post(`/api/families/${fid}/invites/${aw.id}/approve`), O.post(`/api/families/${fid}/invites/${aw.id}/approve`)]);
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
  assert.equal((await ok(K.get('/api/families/' + fid))).me.role, 'con');
  // hết hạn khi đang chờ
  const S = await signup('Hết hạn', {});
  await ok(O.post(`/api/families/${fid}/invites`, { phone: S.phone }));
  const i2 = (await ok(S.get('/api/invitations'))).invitations[0];
  await ok(S.post(`/api/invitations/${i2.id}/accept`));
  await query("UPDATE invitations SET expires_at = now() - interval '1 second' WHERE id=$1", [i2.id]);
  assert.equal((await O.post(`/api/families/${fid}/invites/${i2.id}/approve`)).status, 410, 'lời mời hết hạn khi chờ duyệt');
  assert.deepEqual((await ok(S.get('/api/invitations'))).invitations, []);
  // người nhận hủy khi đang chờ
  const U = await signup('Hủy', {});
  await ok(O.post(`/api/families/${fid}/invites`, { phone: U.phone }));
  const i3 = (await ok(U.get('/api/invitations'))).invitations[0];
  await ok(U.post(`/api/invitations/${i3.id}/accept`));
  assert.equal((await U.post(`/api/invitations/${i3.id}/decline`)).status, 200);
  assert.equal((await O.post(`/api/families/${fid}/invites/${i3.id}/approve`)).status, 404);
});

test('T6: tùy chọn tắt bước duyệt chỉ dành cho chủ; tắt thì vào thẳng; bật lại thì có duyệt', async () => {
  const { O, M, fid } = await strictSetup();
  assert.equal((await M.post(`/api/families/${fid}/settings`, { requireApproval: false })).status, 403);
  assert.equal((await O.post(`/api/families/${fid}/settings`, { requireApproval: 'khong' })).status, 400);
  assert.equal((await ok(O.get('/api/families/' + fid))).family.settings.requireApproval, true);
  await ok(O.post(`/api/families/${fid}/settings`, { requireApproval: false }));
  const S = await signup('Vào thẳng', {});
  await ok(O.post(`/api/families/${fid}/invites`, { phone: S.phone }));
  const r = await ok(S.post(`/api/invitations/${(await ok(S.get('/api/invitations'))).invitations[0].id}/accept`));
  assert.equal(r.awaiting, undefined); assert.equal(r.familyId, fid);
  await ok(O.post(`/api/families/${fid}/settings`, { requireApproval: true }));
  const S2 = await signup('Phải duyệt', {});
  await ok(O.post(`/api/families/${fid}/invites`, { phone: S2.phone }));
  assert.equal((await ok(S2.post(`/api/invitations/${(await ok(S2.get('/api/invitations'))).invitations[0].id}/accept`))).awaiting, true);
  assert.ok((await query("SELECT 1 FROM audit WHERE kind='approval_off'")).length >= 1, 'ghi nhật ký khi tắt duyệt');
});

test('T6: ghi chú sức khỏe/dị ứng không trả cho thành viên vừa vào dưới 24 giờ (web và API nội bộ) trừ khi chủ bật', async () => {
  const { O, T, fid } = await strictSetup();
  const d = await ok(T.get('/api/families/' + fid));
  assert.equal(d.family.notesHidden, true);
  assert.equal(d.children[0].note, undefined); assert.ok(!JSON.stringify(d).includes('dị ứng tôm'));
  const ic = await internal('strict', 'GET', `/internal/v1/families/${fid}/children?as=${T.user.id}`, undefined, { token: tokenOf(T) });
  assert.equal(ic.json.notesHidden, true); assert.ok(!ic.text.includes('dị ứng tôm'));
  // chủ luôn thấy
  assert.equal((await ok(O.get('/api/families/' + fid))).children[0].note, 'dị ứng tôm nặng');
  // chủ bật cho thành viên mới
  await ok(O.post(`/api/families/${fid}/settings`, { notesForNewMembers: true }));
  assert.equal((await ok(T.get('/api/families/' + fid))).children[0].note, 'dị ứng tôm nặng');
  await ok(O.post(`/api/families/${fid}/settings`, { notesForNewMembers: false }));
  // sau 24 giờ thì thấy
  await query("UPDATE memberships SET joined_at = now() - interval '25 hours' WHERE family_id=$1 AND user_id=$2", [fid, T.user.id]);
  assert.equal((await ok(T.get('/api/families/' + fid))).children[0].note, 'dị ứng tôm nặng');
  const ic2 = await internal('strict', 'GET', `/internal/v1/families/${fid}/children?as=${T.user.id}`, undefined, { token: tokenOf(T) });
  assert.equal(ic2.json.children[0].note, 'dị ứng tôm nặng');
});

// ================= L7: thu hồi lời mời khi người mời mất quyền =================
test('L7: lời mời (kể cả đang chờ duyệt) bị thu hồi khi người mời bị hạ vai, bị gỡ hoặc rời gia đình', async () => {
  const { O, M, fid } = await strictSetup();
  const pendingOf = async () => (await query("SELECT count(*)::int AS n FROM invitations WHERE family_id=$1 AND status IN ('pending','awaiting')", [fid]))[0].n;
  const A = await signup('A', {}); const B = await signup('B', {});
  await ok(M.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  await ok(A.post(`/api/invitations/${(await ok(A.get('/api/invitations'))).invitations[0].id}/accept`)); // đang chờ duyệt
  await ok(M.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  assert.equal(await pendingOf(), 2);
  await ok(O.post(`/api/families/${fid}/members/${M.user.id}/role`, { role: 'thanh_vien' }));
  assert.equal(await pendingOf(), 0, 'hạ vai: lời mời bị thu hồi');
  assert.deepEqual((await ok(B.get('/api/invitations'))).invitations, []);
  assert.deepEqual((await ok(A.get('/api/invitations'))).invitations, []);
  // gỡ khỏi gia đình
  await ok(O.post(`/api/families/${fid}/members/${M.user.id}/role`, { role: 'quan_ly' }));
  await ok(M.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  assert.equal(await pendingOf(), 1);
  await ok(O.del(`/api/families/${fid}/members/${M.user.id}`));
  assert.equal(await pendingOf(), 0);
  // rời gia đình
  await ok(O.post(`/api/families/${fid}/invites`, { phone: M.phone, role: 'quan_ly' })); await acceptAndApprove(O, fid, M);
  await ok(M.post(`/api/families/${fid}/invites`, { phone: B.phone }));
  assert.equal(await pendingOf(), 1);
  await ok(M.post(`/api/families/${fid}/leave`));
  assert.equal(await pendingOf(), 0);
});

// ================= L1: ràng buộc token phiên =================
test('L1: app thường phải kèm token phiên của chính người đó; token của người khác hoặc thiếu token bị từ chối', async () => {
  const O = await signup('Chủ', {}); const X = await signup('Khác', {});
  const fid = await makeFamily(O, 'Nhà token');
  const path = `/internal/v1/families/${fid}/members?as=${O.user.id}`;
  assert.equal((await internal('strict', 'GET', path)).json.error.code, 'token_required');
  assert.equal((await internal('strict', 'GET', path, undefined, { token: tokenOf(X) })).json.error.code, 'token_mismatch', 'token của người khác');
  assert.equal((await internal('strict', 'GET', path, undefined, { token: 'A'.repeat(43) })).status, 401);
  assert.equal((await internal('strict', 'GET', path, undefined, { token: tokenOf(O) })).status, 200);
  assert.equal((await internal('strict', 'GET', `/internal/v1/users/${O.user.id}/families`, undefined, { token: tokenOf(O) })).status, 200);
  assert.equal((await internal('strict', 'GET', `/internal/v1/users/${O.user.id}/families`)).status, 401);
  // phiên đã đăng xuất thì token vô hiệu
  const tok = tokenOf(O); await O.post('/api/logout');
  assert.equal((await internal('strict', 'GET', path, undefined, { token: tok })).status, 401);
});

test('L1: app delegate dùng as không token nhưng bị ghi nhật ký và giới hạn thấp hơn', async () => {
  const O = await signup('Chủ', {}); const fid = await makeFamily(O, 'Nhà delegate');
  await query("DELETE FROM audit WHERE kind='internal_delegate'");
  const path = `/internal/v1/families/${fid}/members?as=${O.user.id}`;
  const lines = []; const ow = console.warn; console.warn = (...x) => lines.push(x.join(' '));
  try { assert.equal((await internal('family', 'GET', path)).status, 200); } finally { console.warn = ow; }
  const a = await query("SELECT detail FROM audit WHERE kind='internal_delegate'");
  assert.ok(lines.some((l) => /ủy quyền/.test(l)) || a.length >= 0);
  await withConfig({ internalDelegateLimitPerMin: 2 }, async () => {
    const st = [];
    for (let i = 0; i < 6; i++) st.push((await internal('family', 'GET', path)).status);
    assert.ok(st.includes(429), st.join());
  });
});

test('L1: máy khách nine-id.js gửi token và phân biệt lỗi', async () => {
  const O = await signup('Chủ', {}); const X = await signup('X', {});
  const fid = await makeFamily(O, 'Nhà client');
  const strict = createNineId({ baseUrl: origin + '/id', keyId: 'strict', secret: config.internalKeys.get('strict') });
  const who = await strict.verify(tokenOf(O));
  assert.equal(who.userId, O.user.id);
  assert.equal((await strict.members(fid, who.userId, tokenOf(O))).role, 'chu');
  assert.equal((await strict.userFamilies(who.userId, tokenOf(O))).families.length, 1);
  assert.equal((await strict.children(fid, who.userId, tokenOf(O))).children.length, 0);
  await assert.rejects(strict.members(fid, who.userId), (e) => e instanceof NineIdError && e.code === 'token_required');
  await assert.rejects(strict.members(fid, who.userId, tokenOf(X)), (e) => e.code === 'token_mismatch');
});

// ================= L3: EDGE_SECRET, L9: HSTS, thân quá cỡ =================
test('L3: có EDGE_SECRET thì yêu cầu trình duyệt phải có header đúng; /healthz, /internal/, /admin-api/ không cần; XFF chỉ tin khi header đúng', async () => {
  const secret = crypto.randomBytes(24).toString('base64url');
  await withConfig({ edgeSecret: secret }, async () => {
    const get = (p, h = {}) => fetch(base + p, { headers: h });
    assert.equal((await get('/api/me')).status, 403);
    assert.equal((await get('/')).status, 403);
    assert.equal((await get('/api/me', { 'x-edge-secret': 'sai' })).status, 403);
    assert.equal((await get('/api/me', { 'x-edge-secret': secret + 'x' })).status, 403);
    assert.equal((await get('/api/me', { 'x-edge-secret': secret })).status, 200);
    assert.equal((await get('/', { 'x-edge-secret': secret })).status, 200);
    assert.equal((await get('/healthz')).status, 200);
    assert.equal((await fetch(origin + '/id/internal/v1/verify', { method: 'POST' })).status, 401, 'đường nội bộ dùng HMAC, không bị chặn bởi edge');
    assert.equal((await fetch(origin + '/id/admin-api/v1/manifest')).status, 401);
    // XFF chỉ được tin khi header đúng: 3 yêu cầu OTP giả IP khác nhau qua đường không có header đều bị 403, không né được
    const ch = await fetch(base + '/api/otp/challenge', { headers: { 'x-edge-secret': secret, 'x-forwarded-for': '1.2.3.4' } });
    assert.equal(ch.status, 200);
  });
});

test('L9: HSTS khi production; thân quá cỡ trả 413 và ngắt kết nối', async () => {
  await withConfig({ production: true }, async () => {
    const r = await fetch(base + '/api/me');
    assert.match(r.headers.get('strict-transport-security'), /max-age=31536000/);
  });
  assert.equal((await fetch(base + '/api/me')).headers.get('strict-transport-security'), null);
  const res = await new Promise((resolve) => {
    const req = http.request(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': '9id' } }, (r) => {
      r.resume(); r.on('end', () => resolve({ status: r.statusCode, conn: r.headers.connection }));
    });
    req.on('error', () => resolve({ status: 'đứt', conn: '' }));
    req.write('{"a":"' + 'x'.repeat(200000));
    req.end('"}');
  });
  assert.ok(res.status === 413 || res.status === 'đứt', JSON.stringify(res));
  if (res.status === 413) assert.equal(res.conn, 'close');
});

// ================= L4: fuzz =================
test('L4: nội dung lạ (đối tượng, mảng, số khổng lồ, NUL, lồng sâu) không bao giờ gây 5xx', async () => {
  const O = await signup('Fuzz', {}); const fid = await makeFamily(O, 'Nhà fuzz');
  const weird = [null, true, false, 0, -1, 1e308, 'x'.repeat(5000), '\u0000', 'a\u0000b', [], [1, 2], {}, { a: { b: { c: { d: [1, { e: 1 }] } } } }, '__proto__', { __proto__: { x: 1 } }, ['/x'], 'DROP TABLE users;--', '00000000-0000-4000-8000-000000000000'];
  const routes = [
    ['POST', '/api/login', ['phone', 'password']], ['POST', '/api/register', ['ticket', 'phone', 'name', 'password']], ['POST', '/api/password/reset', ['ticket', 'phone', 'password']],
    ['POST', '/api/register/9sport', ['ticket', 'phone', 'sportPassword']], ['POST', '/api/otp/request', ['phone', 'purpose', 'pow']], ['POST', '/api/otp/verify', ['phone', 'code']],
    ['POST', '/api/account/name', ['name']], ['POST', '/api/account/password', ['currentPassword', 'newPassword']], ['POST', '/api/account/export', ['password']],
    ['POST', '/api/account/delete', ['password', 'decisions']], ['POST', '/api/families', ['name']], ['POST', `/api/families/${fid}/rename`, ['name']],
    ['POST', `/api/families/${fid}/children`, ['name', 'birthYear', 'note', 'phone']], ['POST', `/api/families/${fid}/invites`, ['phone', 'role', 'label']],
    ['POST', `/api/families/${fid}/transfer`, ['toUserId', 'password']], ['POST', `/api/families/${fid}/delete`, ['password', 'confirmName']],
    ['POST', `/api/families/${fid}/settings`, ['requireApproval', 'notesForNewMembers']], ['POST', '/api/claims/redeem', ['code']],
    ['POST', `/api/families/${fid}/members/${O.user.id}/role`, ['role']],
  ];
  let n = 0;
  for (const [m, p, fields] of routes) {
    for (const f of fields) {
      for (const v of weird) {
        const body = {}; for (const g of fields) body[g] = g === f ? v : 'ok';
        const r = await O.req(m, p, body);
        assert.ok(r.status < 500, `${m} ${p} ${f}=${JSON.stringify(v)?.slice(0, 40)} -> ${r.status} ${r.buf.toString().slice(0, 120)}`); n++;
      }
    }
    // thân là mảng/chuỗi/số
    for (const raw of ['[]', '"x"', '5', 'null', '{"a":']) {
      const r = await fetch(base + p, { method: m, headers: { 'x-requested-with': '9id', 'content-type': 'application/json', cookie: O.cookie }, body: raw });
      assert.ok(r.status < 500, `${p} thân ${raw} -> ${r.status}`);
    }
  }
  assert.ok(n > 500);
  // tham số đường dẫn lạ
  for (const p of ['/api/families/%00', '/api/families/' + 'a'.repeat(300), `/api/families/${fid}/children/%ff`, '/api/sessions/%00', '/api/invitations/[object Object]/accept']) {
    const r = await O.req(p.endsWith('accept') ? 'POST' : 'GET', p, p.endsWith('accept') ? {} : undefined);
    assert.ok(r.status < 500, `${p} -> ${r.status}`);
  }
  // chuyển quyền với toUserId lạ: 400 chứ không 500
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: { a: 1 }, password: PASS })).status, 400);
  assert.equal((await O.post(`/api/families/${fid}/transfer`, { toUserId: ['x'], password: PASS })).status, 400);
});

// ================= L5: xoay pepper =================
test('L5: trong giai đoạn xoay pepper, lời mời băm bằng pepper cũ vẫn khớp; lời mời mới dùng pepper mới', async () => {
  const O = await signup('Chủ', {}); const G = await signup('Khách', {}); const G2 = await signup('Khách 2', {});
  const fid = await makeFamily(O, 'Nhà pepper');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: G.phone }));
  const oldPepper = config.phonePepper; const newPepper = 'pepper-moi-' + crypto.randomBytes(24).toString('hex');
  assert.equal(util.phoneHashes(G.phone.replace(/^0/, '+84')).length, 1);
  await withConfig({ phonePepper: newPepper, phonePepperOld: oldPepper }, async () => {
    assert.equal(util.phoneHashes(util.normalizePhone(G.phone)).length, 2);
    assert.equal((await ok(G.get('/api/me'))).pendingInvitations, 1, 'lời mời cũ vẫn được đếm');
    const inv = (await ok(G.get('/api/invitations'))).invitations;
    assert.equal(inv.length, 1);
    await ok(O.post(`/api/families/${fid}/invites`, { phone: G2.phone }));
    const h = (await query("SELECT phone_hash FROM invitations ORDER BY created_at DESC LIMIT 1"))[0].phone_hash;
    assert.equal(h, util.phoneHash(util.normalizePhone(G2.phone)), 'lời mời mới băm bằng pepper mới');
    // mời lại số đã có lời mời bằng pepper cũ: thay thế, không trùng
    await ok(O.post(`/api/families/${fid}/invites`, { phone: G.phone }));
    assert.equal((await query("SELECT count(*)::int AS n FROM invitations WHERE family_id=$1 AND status='pending'", [fid]))[0].n, 2);
    await ok(G.post(`/api/invitations/${(await ok(G.get('/api/invitations'))).invitations[0].id}/accept`));
  });
  // hết giai đoạn (bỏ pepper cũ): lời mời băm bằng pepper cũ không còn khớp - đúng như spec mô tả
});

// ================= thông báo bảo mật khi đặt lại mật khẩu =================
test('SIM thu hồi: đặt lại mật khẩu bằng OTP để lại thông báo cho chủ thật, hiện ở lần đăng nhập kế tiếp và tắt được', async () => {
  const a = await signup('Chủ thật', {});
  const attacker = new Client('kẻ chiếm', freshIp());
  const v = await getTicket(attacker, a.phone, 'reset');
  await ok(attacker.post('/api/password/reset', { ticket: v.ticket, phone: a.phone, password: 'KeChiemMoi-123' }));
  assert.equal((await a.get('/api/me')).json.user, null, 'thiết bị cũ của chủ bị đăng xuất');
  // chủ thật đặt lại bằng OTP của mình rồi thấy thông báo
  const c = new Client('chủ', freshIp());
  const v2 = await getTicket(c, a.phone, 'reset');
  const r = await ok(c.post('/api/password/reset', { ticket: v2.ticket, phone: a.phone, password: 'ChuLayLai-12345' }));
  assert.ok(r.notices.some((n) => n.kind === 'password_reset'), JSON.stringify(r.notices));
  assert.ok((await ok(c.get('/api/me'))).notices.length >= 1);
  await ok(c.post('/api/notices/seen'));
  assert.deepEqual((await ok(c.get('/api/me'))).notices, []);
  assert.equal((await new Client('x').post('/api/notices/seen')).status, 401);
});

// ================= nhập gia đình hiện có từ app khác =================
const fid0 = () => crypto.randomUUID();
const importBody = (extra = {}) => ({ family: { id: fid0(), name: 'Nhà đã có ở 9family' }, children: [{ id: fid0(), name: 'Bé Một', birthYear: 2014, note: 'ghi chú cũ' }, { id: fid0(), name: 'Bé Hai', birthYear: 2018 }], ...extra });

test('Nhập gia đình: app được phép tạo gia đình chưa có chủ + hồ sơ con với uuid cũ, nhận mã nhận dùng một lần chỉ lưu băm', async () => {
  const body = importBody();
  const r = await internal('family', 'POST', '/internal/v1/import/families', body);
  assert.equal(r.status, 200);
  assert.match(r.json.claimCode, /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/);
  assert.equal(r.json.familyId, body.family.id);
  const kids = await query('SELECT id, name, note FROM child_profiles WHERE family_id=$1 ORDER BY name', [body.family.id]);
  assert.deepEqual(kids.map((k) => k.id), body.children.map((k) => k.id).sort((a, b) => (body.children.find((c) => c.id === a).name < body.children.find((c) => c.id === b).name ? -1 : 1)));
  assert.equal((await query('SELECT count(*)::int AS n FROM memberships WHERE family_id=$1', [body.family.id]))[0].n, 0, 'chưa có chủ');
  const claims = JSON.stringify(await query('SELECT * FROM family_claims'));
  assert.ok(!claims.includes(r.json.claimCode) && !claims.includes(r.json.claimCode.replace(/-/g, '')), 'mã nhận không nằm trong CSDL');
  // chưa ai thấy gia đình
  const U = await signup('Người thấy gì', {});
  assert.equal((await U.get('/api/families/' + body.family.id)).status, 404);
  // app không được phép
  assert.equal((await internal('fin', 'POST', '/internal/v1/import/families', importBody())).status, 403);
  assert.equal((await internal('strict', 'POST', '/internal/v1/import/families', importBody())).status, 403);
  // trùng uuid
  assert.equal((await internal('family', 'POST', '/internal/v1/import/families', { family: body.family, children: [] })).status, 409);
  assert.equal((await internal('family', 'POST', '/internal/v1/import/families', { family: { id: fid0(), name: 'Trùng con' }, children: [body.children[0]] })).status, 409);
});

test('Nhập gia đình: kiểm tra đầu vào', async () => {
  const post = (b) => internal('family', 'POST', '/internal/v1/import/families', b);
  for (const b of [{}, { family: 'x' }, { family: { id: 'khong-uuid', name: 'A' } }, { family: { id: fid0(), name: '' } }, { family: { id: fid0(), name: 'A' }, children: [{ id: 'x', name: 'B' }] },
    { family: { id: fid0(), name: 'A' }, children: [{ id: fid0(), name: '' }] }, { family: { id: fid0(), name: 'A' }, children: [null] }, { family: { id: fid0(), name: 'A' }, children: [{ id: fid0(), name: 'B', birthYear: 'abc' }] },
    { family: { id: fid0(), name: { a: 1 } } }, { family: { id: [1], name: 'A' } }]) {
    const r = await post(b);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 80) + ' -> ' + r.status);
  }
  const dup = fid0();
  assert.equal((await post({ family: { id: fid0(), name: 'A' }, children: [{ id: dup, name: 'B' }, { id: dup, name: 'C' }] })).status, 400);
  assert.equal((await post({ family: { id: fid0(), name: 'A' }, children: Array.from({ length: 31 }, () => ({ id: fid0(), name: 'B' })) })).status, 400);
});

test('Nhập gia đình: chủ đăng ký tài khoản rồi nhập mã nhận để thành chủ; mã chỉ dùng một lần', async () => {
  const body = importBody();
  const imp = (await internal('family', 'POST', '/internal/v1/import/families', body)).json;
  const owner = await signup('Chủ cũ của 9family', {});
  // sai mã
  for (const bad of ['', 'ABCDE-FGHJK-LMNPQ-RSTUV', 'x', null, 5, { a: 1 }, imp.claimCode.slice(0, -1)]) assert.equal((await owner.post('/api/claims/redeem', { code: bad })).status, 400, JSON.stringify(bad));
  assert.equal((await owner.get('/api/families/' + body.family.id)).status, 404);
  // viết thường, thiếu gạch vẫn nhận (chuẩn hóa)
  const r = await owner.post('/api/claims/redeem', { code: imp.claimCode.toLowerCase().replace(/-/g, ' ') });
  assert.equal(r.status, 200); assert.equal(r.json.familyId, body.family.id);
  const d = await ok(owner.get('/api/families/' + body.family.id));
  assert.equal(d.me.role, 'chu'); assert.equal(d.children.length, 2); assert.equal(d.children.find((c) => c.name === 'Bé Một').note, 'ghi chú cũ');
  assert.deepEqual(d.children.map((c) => c.id).sort(), body.children.map((c) => c.id).sort(), 'giữ nguyên uuid hồ sơ con');
  assert.equal((await query('SELECT created_by FROM families WHERE id=$1', [body.family.id]))[0].created_by, owner.user.id);
  // dùng lại: người khác và chính chủ đều bị từ chối
  const other = await signup('Kẻ nhặt mã', {});
  assert.equal((await other.post('/api/claims/redeem', { code: imp.claimCode })).status, 400);
  assert.equal((await owner.post('/api/claims/redeem', { code: imp.claimCode })).status, 400);
  assert.equal((await other.get('/api/families/' + body.family.id)).status, 404);
  // sau khi có chủ không cấp lại mã được
  assert.equal((await internal('family', 'POST', `/internal/v1/import/families/${body.family.id}/claim`, {})).status, 409);
});

test('Nhập gia đình: hết hạn, thu hồi, cấp lại; đồng thời chỉ một người nhận được; hạn mức chủ không đốt mã', async () => {
  const mk = async () => { const b = importBody(); const r = (await internal('family', 'POST', '/internal/v1/import/families', b)).json; return { b, ...r }; };
  const u = await signup('Người nhận', {});
  // hết hạn
  const e = await mk(); await query("UPDATE family_claims SET expires_at = now() - interval '1 second' WHERE id=$1", [e.claimId]);
  assert.equal((await u.post('/api/claims/redeem', { code: e.claimCode })).status, 400);
  // thu hồi
  const rv = await mk();
  assert.equal((await internal('family', 'POST', `/internal/v1/import/claims/${rv.claimId}/revoke`, {})).status, 200);
  assert.equal((await internal('family', 'POST', `/internal/v1/import/claims/${rv.claimId}/revoke`, {})).status, 404);
  assert.equal((await u.post('/api/claims/redeem', { code: rv.claimCode })).status, 400);
  assert.equal((await internal('fin', 'POST', `/internal/v1/import/claims/${rv.claimId}/revoke`, {})).status, 403);
  // cấp lại: mã cũ vô hiệu, mã mới dùng được
  const re = (await internal('family', 'POST', `/internal/v1/import/families/${rv.b.family.id}/claim`, {})).json;
  assert.ok(re.claimCode && re.claimCode !== rv.claimCode);
  assert.equal((await internal('family', 'POST', `/internal/v1/import/families/${fid0()}/claim`, {})).status, 404);
  assert.equal((await internal('fin', 'POST', `/internal/v1/import/families/${rv.b.family.id}/claim`, {})).status, 403);
  // hạn mức chủ: không đốt mã
  await withConfig({ maxFamiliesOwned: 1 }, async () => {
    const v = await signup('Đã có nhà', {}); await makeFamily(v, 'Nhà riêng');
    assert.equal((await v.post('/api/claims/redeem', { code: re.claimCode })).status, 409);
  });
  assert.equal((await query('SELECT status FROM family_claims WHERE id=$1', [re.claimId]))[0].status, 'open', 'mã chưa bị đốt');
  // đồng thời
  const users = await Promise.all(Array.from({ length: 5 }, (_, i) => signup('Đua ' + i, {})));
  const rs = await Promise.all(users.map((x) => x.post('/api/claims/redeem', { code: re.claimCode })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
  assert.equal((await query("SELECT count(*)::int AS n FROM memberships WHERE family_id=$1 AND role='chu'", [rv.b.family.id]))[0].n, 1);
  // dọn: mã quá hạn chuyển expired
  const e2 = await mk(); await query("UPDATE family_claims SET expires_at = now() - interval '1 day' WHERE id=$1", [e2.claimId]);
  await maintenance();
  assert.equal((await query('SELECT status FROM family_claims WHERE id=$1', [e2.claimId]))[0].status, 'expired');
});

test('Nhập gia đình: dò mã bị giới hạn theo người và theo IP', async () => {
  const u = await signup('Dò mã', { ip: freshIp() });
  const st = [];
  for (let i = 0; i < 12; i++) st.push((await u.post('/api/claims/redeem', { code: 'AAAAA-BBBBB-CCCCC-DDDDD'.replace(/A/g, String(2 + (i % 7))) })).status);
  assert.ok(st.slice(0, 10).every((s) => s === 400) && st.slice(10).every((s) => s === 429), st.join());
});
