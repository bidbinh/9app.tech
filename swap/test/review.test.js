// Các lỗi hay gặp khi phản biện: đua dữ liệu, bấm hai lần, giới hạn theo IP, cấu hình production, quyền uy tín
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, interest, ok, db, Client, LISTING, config, base } from './helper.js';

before(boot);
after(shutdown);

test('hai yêu cầu "hoàn tất" đồng thời: chỉ một thành công, điểm uy tín tính đúng một lần', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Lan } = c.by;
  const lid = await makeListing(c, 'Lan');
  const tid = await interest(c, 'Minh', lid);
  await ok(Lan.post(`/api/listings/${lid}/choose`, { threadId: tid }));
  const rs = await Promise.all(Array.from({ length: 6 }, () => Lan.post(`/api/listings/${lid}/complete`)));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 5);
  const m = (await ok(c.by['Chủ'].get(`/api/c/${c.cid}/members`))).members.find((x) => x.name === 'Lan');
  assert.equal(m.tang, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM notifications WHERE type='done' AND listing_id=$1", [lid]))[0].n, 1);
});

test('chọn người nhận đồng thời với từ chối/rút: trạng thái luôn nhất quán', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh', 'Hà']);
  const { Lan, Minh } = c.by;
  for (let round = 0; round < 5; round++) {
    const lid = await makeListing(c, 'Lan', { title: 'Vòng ' + round });
    const t1 = await interest(c, 'Minh', lid); const t2 = await interest(c, 'Hà', lid);
    await Promise.all([
      Lan.post(`/api/listings/${lid}/choose`, { threadId: t1 }), Lan.post(`/api/listings/${lid}/choose`, { threadId: t2 }),
      Minh.post(`/api/listings/${lid}/decline`), Lan.post(`/api/listings/${lid}/cancel`),
    ]);
    const row = (await db.query('SELECT status, recipient_id FROM listings WHERE id=$1', [lid]))[0];
    if (row.status === 'giu') assert.ok(row.recipient_id, 'đã giữ thì phải có người nhận');
    else assert.equal(row.recipient_id, null, `trạng thái ${row.status} không được còn người nhận`);
    assert.ok(['mo', 'giu', 'huy'].includes(row.status));
  }
});

test('bấm "Quan tâm" hai lần/đồng thời chỉ tạo một luồng', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const lid = await makeListing(c, 'Lan');
  const rs = await Promise.all(Array.from({ length: 6 }, () => c.by['Minh'].post(`/api/listings/${lid}/threads`, { body: 'Mình quan tâm' })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(new Set(rs.map((r) => r.json.threadId)).size, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM threads WHERE listing_id=$1', [lid]))[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM notifications WHERE type='interest' AND listing_id=$1", [lid]))[0].n, 1);
});

test('Idempotency-Key: bấm đăng tin hai lần chỉ tạo một tin, trả lại cùng kết quả', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const { Lan } = c.by;
  const h = { 'idempotency-key': 'khoa-dang-tin-0001' };
  const [a, b] = await Promise.all([Lan.post(`/api/c/${c.cid}/listings`, LISTING(), { headers: h }), Lan.post(`/api/c/${c.cid}/listings`, LISTING(), { headers: h })]);
  const again = await Lan.post(`/api/c/${c.cid}/listings`, LISTING(), { headers: h });
  assert.equal(again.status, 200);
  const ids = new Set([a, b, again].filter((r) => r.status === 200).map((r) => r.json.id));
  assert.equal(ids.size, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM listings WHERE community_id=$1', [c.cid]))[0].n, 1);
  assert.equal((await Lan.post(`/api/c/${c.cid}/listings`, LISTING(), { headers: { 'idempotency-key': 'x' } })).status, 400, 'khóa sai định dạng');
  // cùng khóa nhưng phiên khác: không dùng chung kết quả
  const other = await ok(c.by['Chủ'].post(`/api/c/${c.cid}/listings`, LISTING({ title: 'Của chủ' }), { headers: h }));
  assert.notEqual(other.id, [...ids][0]);
});

test('hai người cùng xin một tên: chỉ một người được', async () => {
  const c = await makeCommunity(['Chủ']);
  const rs = await Promise.all(['Hạnh', 'hanh', 'HẠNH'].map((n) => new Client().post(`/api/join/${c.code}`, { name: n, agree: true })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 2);
});

test('điểm uy tín: tin bị rút/gỡ/hết hạn hoặc hoàn tất không có người nhận thì không được tính', async () => {
  const c = await makeCommunity(['Chủ', 'Lan', 'Minh']);
  const { Chủ, Lan } = c.by;
  const stat = async () => (await ok(Chủ.get(`/api/c/${c.cid}/members`))).members.find((m) => m.name === 'Lan');
  const a = await makeListing(c, 'Lan', { title: 'Tin A' }); const ta = await interest(c, 'Minh', a);
  await ok(Lan.post(`/api/listings/${a}/choose`, { threadId: ta }));
  await ok(Lan.post(`/api/listings/${a}/cancel`));
  const b = await makeListing(c, 'Lan', { title: 'Tin B', kind: 'ban', price: 1000 }); const tb = await interest(c, 'Minh', b);
  await ok(Lan.post(`/api/listings/${b}/choose`, { threadId: tb }));
  await ok(Chủ.post(`/api/listings/${b}/remove`, { reason: 'x' }));
  const d = await makeListing(c, 'Lan', { title: 'Tin D' });
  await ok(Lan.post(`/api/listings/${d}/complete`));
  assert.deepEqual([(await stat()).tang, (await stat()).other], [0, 0]);
  // bán và đổi tính vào "other"
  const e = await makeListing(c, 'Lan', { title: 'Tin E', kind: 'doi', swapWish: 'sách' }); const te = await interest(c, 'Minh', e);
  await ok(Lan.post(`/api/listings/${e}/choose`, { threadId: te })); await ok(Lan.post(`/api/listings/${e}/complete`));
  const f = await makeListing(c, 'Lan', { title: 'Tin F' }); const tf = await interest(c, 'Minh', f);
  await ok(Lan.post(`/api/listings/${f}/choose`, { threadId: tf })); await ok(Lan.post(`/api/listings/${f}/complete`));
  const s = await stat();
  assert.deepEqual([s.tang, s.other], [1, 1]);
  const lst = (await ok(c.by['Minh'].get(`/api/c/${c.cid}/listings?view=done`))).items;
  assert.deepEqual(lst.map((x) => x.title).sort(), ['Tin D', 'Tin E', 'Tin F'] /* tin D xong ngoài app vẫn nằm trong danh sách đã xong */);
  assert.deepEqual(lst[0].stats, { tang: 1, doi: 1, ban: 0 });
});

test('giới hạn tần suất theo IP dùng phần tử đầu của X-Forwarded-For; không có thì dùng IP kết nối', async () => {
  const keep = { rate: config.rateLimitPerMin };
  config.rateLimitPerMin = 8;
  try {
    const get = (ip) => fetch(base + '/healthz', { headers: ip ? { 'x-forwarded-for': ip } : {} });
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await get('192.0.2.1')).status);
    assert.equal(codes.slice(0, 8).every((c) => c === 200), true);
    assert.equal(codes.slice(8).every((c) => c === 429), true);
    assert.equal((await get('192.0.2.2')).status, 200, 'IP khác không bị ảnh hưởng');
    // nginx đặt X-Forwarded-For = $remote_addr: giá trị đầu là IP thật, các giá trị thêm sau không đổi khóa
    assert.equal((await get('192.0.2.1, 10.0.0.9')).status, 429);
    assert.equal((await get('192.0.2.3, 192.0.2.1')).status, 200);
    for (let i = 0; i < 12; i++) await get(null);
    assert.equal((await get(null)).status, 429, 'không có header: dùng IP kết nối');
  } finally { config.rateLimitPerMin = keep.rate; }
});

test('giới hạn theo phiên: thao tác ghi quá nhanh bị 429', async () => {
  const c = await makeCommunity(['Chủ', 'Lan']);
  const keep = { s: config.sessionLimitPerMin, f: config.routeLimitFactor };
  config.sessionLimitPerMin = 5; config.routeLimitFactor = 1;
  try {
    const rs = [];
    for (let i = 0; i < 9; i++) rs.push((await c.by['Lan'].post(`/api/c/${c.cid}/notifications/read`, {})).status);
    assert.ok(rs.includes(429), rs.join());
    assert.equal((await c.by['Chủ'].post(`/api/c/${c.cid}/notifications/read`, {})).status, 200, 'phiên khác không bị ảnh hưởng');
  } finally { config.sessionLimitPerMin = keep.s; config.routeLimitFactor = keep.f; }
});

test('production thiếu DATABASE_URL hoặc dùng chuỗi mặc định thì báo lỗi; lỗi kết nối nhàn rỗi không sập tiến trình', async () => {
  const { productionProblems } = await import('../src/config.js');
  assert.deepEqual(productionProblems({ production: false }), []);
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: false, databaseUrl: 'postgres://postgres:ship@localhost:5440/swap' }).length, 1);
  assert.match(productionProblems({ production: true, databaseUrlFromEnv: false })[0], /DATABASE_URL/);
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://postgres:ship@localhost:5440/swap' }).length, 1);
  assert.deepEqual(productionProblems({ production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://swap:p@db:5432/swap' }), []);
  assert.doesNotThrow(() => db.getPool().emit('error', new Error('mất kết nối nhàn rỗi (thử nghiệm)')));
});

test('khởi động thật ở production không có DATABASE_URL thì thoát ngay với mã lỗi', async () => {
  const { spawn } = await import('node:child_process');
  const p = spawn(process.execPath, ['src/server.js'], { env: Object.fromEntries(Object.entries({ ...process.env, NODE_ENV: 'production', PORT: '0' }).filter(([k]) => k !== 'DATABASE_URL')), stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  const code = await new Promise((resolve) => { const t = setTimeout(() => { p.kill(); resolve('timeout'); }, 10000); p.on('exit', (c) => { clearTimeout(t); resolve(c); }); });
  assert.equal(code, 1);
  assert.match(err, /DATABASE_URL/);
});

test('cookie phiên: HttpOnly, SameSite=Lax, Path theo BASE_PATH, chỉ băm SHA-256 vào CSDL', async () => {
  const cl = new Client();
  const r = await cl.post('/api/communities', { name: 'Cookie thử', myName: 'An', agree: true });
  const sc = r.setCookie.find((x) => x.startsWith('swsid='));
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/); assert.match(sc, new RegExp(`Path=${config.basePath}/`));
  const token = decodeURIComponent(sc.split(';')[0].slice(6));
  assert.equal(token.length, 43);
  const hashes = (await db.query('SELECT token_hash FROM phien')).map((x) => x.token_hash);
  assert.ok(!hashes.includes(token), 'token thật không nằm trong CSDL');
  const { createHash } = await import('node:crypto');
  assert.ok(hashes.includes(createHash('sha256').update(token).digest('hex')));
});

test('tệp tĩnh: không đọc ra ngoài thư mục public, có tiêu đề an toàn', async () => {
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/src/config.js', '/..\\package.json', '/db/001_init.sql', '/src/config.js', '/node_modules/pg/package.json']) {
    const r = await fetch(base + p);
    assert.notEqual(r.status, 200, p);
    assert.doesNotMatch(await r.text(), /"name": "9swap"|CREATE TABLE|databaseUrl/);
  }
  const r = await fetch(base + '/style.css');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const page = await fetch(base + '/');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(base + '/api/nope')).status, 404);
  assert.equal((await fetch(base + '/api/me', { method: 'PUT' })).status, 405);
});
