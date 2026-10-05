import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { boot, shutdown, makeFamily, addChild, ok, clock, scheduler, db, at, config } from './helper.js';
import { setPushTlsInsecure } from '../src/push.js';
import { drainOutbox } from '../src/push.js';

before(async () => { await boot(); setPushTlsInsecure(true); });
after(async () => { setPushTlsInsecure(false); await shutdown(); });
beforeEach(async () => { clock.set(null); await db.resetForTests(); });

const status = async (p) => (await p).status;
const b64u = (b) => Buffer.from(b).toString('base64url');

// Máy chủ đẩy giả (HTTPS tự ký): ghi lại yêu cầu, giải mã nội dung theo RFC 8291 (aes128gcm)
function fakePushServer() {
  const got = []; const plan = new Map();
  const srv = https.createServer({ key: fs.readFileSync(new URL('./fixtures/push-key.pem', import.meta.url)), cert: fs.readFileSync(new URL('./fixtures/push-cert.pem', import.meta.url)) }, (req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      got.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(plan.get(req.url) || 201); res.end();
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, got, plan, url: (id) => `https://127.0.0.1:${srv.address().port}/push/${id}` })));
}
function device() {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { ecdh, auth: crypto.randomBytes(16) };
}
const keysOf = (d) => ({ p256dh: b64u(d.ecdh.getPublicKey()), auth: b64u(d.auth) });
function decrypt(d, body) {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const data = body.subarray(21 + idlen);
  const secret = d.ecdh.computeSecret(asPub);
  const hk = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const prk = hk(secret, d.auth, Buffer.concat([Buffer.from('WebPush: info\0'), d.ecdh.getPublicKey(), asPub]), 32);
  const cek = hk(prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const dec = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  dec.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([dec.update(data.subarray(0, data.length - 16)), dec.final()]);
  let end = plain.length - 1; while (end > 0 && plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString('utf8'));
}

async function sub(client, fam, url, d, types) {
  return ok(client.post(`${fam.F}/push/subscribe`, { endpoint: url, keys: keysOf(d), hide: false, ...(types ? { types } : {}) }), 'đăng ký đẩy');
}
const DAY = '2026-10-05';

test('Web Push: đăng ký, đẩy đúng người đúng loại, giải mã được, đúng giao thức VAPID', async () => {
  const ps = await fakePushServer();
  try {
    const fam = await makeFamily(['Mẹ', 'Bố']);
    const kid = await addChild(fam, 'Bống', { note: 'dị ứng đậu phộng, mang thuốc hen' });
    await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', place: 'Cổng B', p0: fam.ids['Mẹ'], p1: fam.ids['Bố'] }));
    const dMe = device(); const dBo1 = device(); const dBo2 = device();
    await sub(fam.owner, fam, ps.url('me'), dMe);
    await sub(fam.by['Bố'], fam, ps.url('bo1'), dBo1);
    const r2 = await sub(fam.by['Bố'], fam, ps.url('bo2'), dBo2, ['event', 'task']);
    assert.deepEqual(r2.types, ['event', 'task']);
    assert.equal((await ok(fam.by['Bố'].post(`${fam.F}/push/status`, { endpoint: ps.url('bo2') }))).subscribed, true);
    assert.deepEqual((await ok(fam.by['Bố'].post(`${fam.F}/push/status`, { endpoint: ps.url('bo2') }))).types, ['event', 'task']);
    assert.equal((await ok(fam.owner.post(`${fam.F}/push/status`, { endpoint: ps.url('bo2') }))).subscribed, false, 'thiết bị của người khác');
    const T = at(DAY, '16:30');
    clock.set(T - 30 * 60_000);
    const t1 = await scheduler.tick(T - 30 * 60_000);
    assert.equal(t1.push.sent, 1);
    assert.equal(ps.got.length, 1); assert.equal(ps.got[0].path, '/push/me');
    const h = ps.got[0].headers;
    assert.match(h.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/); assert.ok(h.authorization.includes(config.vapidPublic));
    assert.equal(h['content-encoding'], 'aes128gcm'); assert.equal(h.urgency, 'high'); assert.equal(h.ttl, '3600');
    const msg = decrypt(dMe, ps.got[0].body);
    assert.equal(msg.title, 'Sắp tới giờ đón Bống'); assert.equal(msg.type, 'ride'); assert.equal(msg.url, `#/f/${fam.fid}/rides`);
    assert.deepEqual(Object.keys(msg).sort(), ['body', 'tag', 'title', 'type', 'url']);
    // riêng tư: không có ghi chú của con trong nội dung đẩy hay trong hộp thông báo
    assert.ok(!JSON.stringify(msg).includes('đậu phộng') && !JSON.stringify(msg).includes('thuốc hen'));
    assert.ok(!JSON.stringify(await db.query('SELECT title, body FROM notifications')).includes('đậu phộng'));
    // T-20: Bố là dự phòng nên nhận trên thiết bị 1 (bật loại đưa đón) nhưng không nhận trên thiết bị 2 (chỉ sự kiện)
    clock.set(T - 20 * 60_000);
    await scheduler.tick(T - 20 * 60_000);
    const paths = ps.got.map((g) => g.path).sort();
    assert.deepEqual(paths, ['/push/bo1', '/push/me', '/push/me']);
    assert.equal(decrypt(dBo1, ps.got.find((g) => g.path === '/push/bo1').body).title, 'Nhờ bạn đón Bống lúc 16:30');
    // chạy lại không gửi lại
    await scheduler.tick(T - 20 * 60_000); await drainOutbox({ nowMs: T });
    assert.equal(ps.got.length, 3);
    // tắt loại "đưa đón" trên thiết bị 1: T-5 báo cả nhà nhưng thiết bị 1 không nhận nữa
    await ok(fam.by['Bố'].post(`${fam.F}/push/types`, { endpoint: ps.url('bo1'), types: ['task'] }));
    assert.equal(await status(fam.by['Bố'].post(`${fam.F}/push/types`, { endpoint: ps.url('bo1'), types: ['bậy'] })), 400);
    assert.equal(await status(fam.by['Bố'].post(`${fam.F}/push/types`, { endpoint: ps.url('chuadk'), types: [] })), 404);
    clock.set(T - 5 * 60_000);
    await scheduler.tick(T - 5 * 60_000);
    assert.equal(ps.got.filter((g) => g.path === '/push/bo1').length, 1);
    assert.equal(ps.got.filter((g) => g.path === '/push/me').length, 3);
    // sự kiện có ghi chú nhạy cảm: nội dung đẩy chỉ gồm tiêu đề, giờ, địa điểm
    await ok(fam.owner.post(`${fam.F}/events`, { title: 'Khám tim', kind: 'kham', startDate: DAY, start: '17:00', location: 'BV Nhi', note: 'tái khám tim bẩm sinh, nhịn ăn', checklist: ['sổ khám bệnh'], notifyOffsets: [10] }));
    clock.set(at(DAY, '16:50'));
    await scheduler.tick(at(DAY, '16:50'));
    const evPush = ps.got.filter((g) => g.path === '/push/bo2').map((g) => decrypt(dBo2, g.body));
    assert.equal(evPush.length, 1); assert.equal(evPush[0].title, '10 phút nữa: Khám tim'); assert.equal(evPush[0].body, '17:00 · BV Nhi'); assert.equal(evPush[0].type, 'event');
    for (const g of ps.got) for (const d of [dMe, dBo1, dBo2]) { try { const m = JSON.stringify(decrypt(d, g.body)); assert.ok(!/nhịn ăn|tim bẩm sinh|sổ khám|đậu phộng/.test(m)); } catch (e) { if (e.name === 'AssertionError') throw e; } }
  } finally { ps.srv.close(); }
});

test('Web Push: kiểm tra đăng ký, huỷ, rời gia đình, thu hồi thiết bị', async () => {
  const ps = await fakePushServer();
  try {
    const fam = await makeFamily(['Mẹ', 'Bố']);
    const d = device();
    const bad = (b) => status(fam.owner.post(`${fam.F}/push/subscribe`, b));
    assert.equal(await bad({ endpoint: 'http://127.0.0.1:1/x', keys: keysOf(d) }), 400);
    assert.equal(await bad({ endpoint: 'https://u:p@127.0.0.1:1/x', keys: keysOf(d) }), 400);
    assert.equal(await bad({ endpoint: ps.url('a'), keys: { p256dh: 'ngắn', auth: 'x' } }), 400);
    assert.equal(await bad({ endpoint: ps.url('a'), keys: keysOf(d), types: ['lạ'] }), 400);
    assert.equal(await bad({}), 400);
    // chống SSRF: khi không bật chế độ thử, địa chỉ nội bộ bị chặn
    config.pushAllowAnyHost = false;
    try { assert.equal(await bad({ endpoint: ps.url('a'), keys: keysOf(d) }), 400); } finally { config.pushAllowAnyHost = true; }
    await sub(fam.owner, fam, ps.url('a'), d);
    await sub(fam.owner, fam, ps.url('a'), d, ['ride']); // đăng ký lại cùng endpoint: cập nhật, không nhân đôi
    assert.equal((await db.query('SELECT count(*)::int n FROM push_subs'))[0].n, 1);
    await ok(fam.owner.post(`${fam.F}/push/unsubscribe`, { endpoint: ps.url('a') }));
    assert.equal((await db.query('SELECT count(*)::int n FROM push_subs'))[0].n, 0);
    await ok(fam.owner.post(`${fam.F}/push/unsubscribe`, { endpoint: 'rác' }));
    // đăng ký đẩy gắn với người dùng 9id và thiết bị (hai máy của cùng một người)
    const phone2 = new (fam.owner.constructor)().loginAs(fam.fake.login(fam.userIds['Bố']));
    await sub(fam.by['Bố'], fam, ps.url('b1'), device()); await sub(phone2, fam, ps.url('b2'), device());
    const rowsB = await db.query('SELECT user_id, sid, endpoint FROM push_subs ORDER BY endpoint');
    assert.equal(rowsB.length, 2); assert.ok(rowsB.every((r) => r.user_id === fam.userIds['Bố']), 'đăng ký đẩy gắn user_id của 9id');
    assert.notEqual(rowsB[0].sid, rowsB[1].sid, 'mỗi thiết bị (phiên) một sid riêng');
    await ok(phone2.post(`${fam.F}/push/unsubscribe`, { endpoint: ps.url('b2') }));
    assert.deepEqual((await db.query('SELECT endpoint FROM push_subs')).map((r) => r.endpoint.split('/').pop()), ['b1']);
    await fam.leave('Bố'); // rời gia đình ở 9id: đăng ký đẩy mất theo
    assert.equal((await db.query('SELECT count(*)::int n FROM push_subs'))[0].n, 0);
    // máy chủ chưa cấu hình VAPID
    const keep = config.vapidPrivate; config.vapidPrivate = '';
    try { assert.equal(await status(fam.owner.post(`${fam.F}/push/subscribe`, { endpoint: ps.url('a'), keys: keysOf(d) })), 404); assert.equal((await ok(fam.owner.get(fam.F))).caps.push, false); } finally { config.vapidPrivate = keep; }
  } finally { ps.srv.close(); }
});

test('Web Push: 410 gỡ thuê bao, lỗi tạm thì thử lại, nhiều bản gửi song song không trùng', async () => {
  const ps = await fakePushServer();
  try {
    const fam = await makeFamily(['Mẹ', 'Bố']);
    const dA = device(); const dB = device(); const dC = device();
    await sub(fam.owner, fam, ps.url('chet'), dA); await sub(fam.owner, fam, ps.url('loi'), dB); await sub(fam.owner, fam, ps.url('tot'), dC);
    ps.plan.set('/push/chet', 410); ps.plan.set('/push/loi', 500);
    await ok(fam.by['Bố'].post(`${fam.F}/tasks`, { title: 'Mua sữa', assigneeId: fam.ids['Mẹ'] }));
    const now = Date.now();
    const rs = await Promise.all(Array.from({ length: 4 }, () => drainOutbox({ nowMs: now })));
    assert.equal(rs.reduce((s, r) => s + r.sent, 0), 1, 'thiết bị tốt chỉ nhận một lần');
    assert.equal(ps.got.filter((g) => g.path === '/push/tot').length, 1);
    assert.equal(ps.got.filter((g) => g.path === '/push/chet').length, 1);
    assert.equal(ps.got.filter((g) => g.path === '/push/loi').length, 1);
    const left = (await db.query('SELECT endpoint FROM push_subs ORDER BY endpoint')).map((r) => r.endpoint.split('/').pop());
    assert.deepEqual(left, ['loi', 'tot'], 'thuê bao 410 bị gỡ');
    // thử lại sau 30 giây, đến 4 lần thì thôi
    await drainOutbox({ nowMs: now + 5_000 });
    assert.equal(ps.got.filter((g) => g.path === '/push/loi').length, 1, 'chưa tới hạn thử lại');
    ps.plan.set('/push/loi', 201);
    const r = await drainOutbox({ nowMs: now + 40_000 });
    assert.equal(r.sent, 1);
    assert.equal(ps.got.filter((g) => g.path === '/push/loi').length, 2);
    assert.equal((await db.query('SELECT count(*)::int n FROM push_outbox WHERE sent_at IS NULL'))[0].n, 0);
    assert.equal(decrypt(dC, ps.got.find((g) => g.path === '/push/tot').body).title, 'Bố giao việc cho bạn');
  } finally { ps.srv.close(); }
});

test('L6: mặc định ẩn tên con/địa điểm trong nội dung đẩy; bật hiện chi tiết thì có đủ', async () => {
  const ps = await fakePushServer();
  try {
    const fam = await makeFamily(['Mẹ', 'Bố']);
    const kid = await addChild(fam, 'Bống Bí Mật');
    await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '16:30', place: 'Cổng B kín', p0: fam.ids['Mẹ'] }));
    const d = device();
    const r = await ok(fam.owner.post(`${fam.F}/push/subscribe`, { endpoint: ps.url('an'), keys: keysOf(d) }));
    assert.equal(r.hide, true);
    assert.equal((await ok(fam.owner.post(`${fam.F}/push/status`, { endpoint: ps.url('an') }))).hide, true);
    const T = at(DAY, '16:30');
    clock.set(T - 30 * 60_000); await scheduler.tick(T - 30 * 60_000);
    const m = decrypt(d, ps.got[0].body);
    assert.deepEqual([m.title, m.body], ['Nhắc đưa đón', 'Mở 9family để xem chi tiết.']);
    assert.ok(!JSON.stringify(m).includes('Bống') && !JSON.stringify(m).includes('Cổng'));
    assert.equal(m.url, `#/f/${fam.fid}/rides`);
    // trong app (hộp thư) vẫn đầy đủ
    assert.ok((await ok(fam.owner.get(`${fam.F}/notifications`))).items.some((i) => i.title === 'Sắp tới giờ đón Bống Bí Mật'));
    // bật hiện chi tiết
    await ok(fam.owner.post(`${fam.F}/push/types`, { endpoint: ps.url('an'), hide: false }));
    clock.set(T - 5 * 60_000); await scheduler.tick(T - 5 * 60_000);
    const m2 = decrypt(d, ps.got[1].body);
    assert.ok(m2.title.includes('Bống Bí Mật'));
    // đổi loại không làm mất cờ hide
    await ok(fam.owner.post(`${fam.F}/push/types`, { endpoint: ps.url('an'), types: ['ride'] }));
    assert.equal((await ok(fam.owner.post(`${fam.F}/push/status`, { endpoint: ps.url('an') }))).hide, false);
  } finally { ps.srv.close(); }
});
