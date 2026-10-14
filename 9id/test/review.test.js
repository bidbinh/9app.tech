// Các điểm rút ra từ phản biện bảo mật (9hire/9tutor/9swap) và tự phản biện 9id: mỗi test tái hiện một rủi ro
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, shutdown, Client, ok, newPhone, signup, getTicket, PASS, db, query, config, base, origin, util, maintenance, makeFamily } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

test('bảo trì: dọn OTP, vé, phiên quá hạn, lời mời hết hạn, nonce, idem, bộ đếm, nhật ký; giữ dữ liệu còn hạn', async () => {
  const keep = await signup('Giữ', {}); const old = await signup('Cũ', {});
  await query("UPDATE sessions SET last_used_at = now() - interval '400 days' WHERE user_id=$1", [old.user.id]);
  await query("INSERT INTO otps(phone_hash, code_hash, salt, expires_at, created_at) VALUES('p','c','s', now(), now() - interval '2 days')");
  await query("INSERT INTO otps(phone_hash, code_hash, salt, expires_at) VALUES('p2','c','s', now() + interval '5 minutes')");
  await query("INSERT INTO tickets(token_hash, phone_hash, expires_at) VALUES('t1','h', now() - interval '2 days')");
  await query("INSERT INTO tickets(token_hash, phone_hash, expires_at) VALUES('t2','h', now() + interval '10 minutes')");
  await query("INSERT INTO internal_nonces(kid, nonce, at) VALUES('family','cu', now() - interval '1 hour'), ('family','moi', now())");
  await query("INSERT INTO idem(scope,key,created_at) VALUES('x','y', now() - interval '3 days')");
  await query("INSERT INTO throttle(key, n, window_start) VALUES('cu', 1, now() - interval '5 hours'), ('moi', 1, now())");
  await query("INSERT INTO throttle(key, n, window_start, locked_until) VALUES('dang-khoa', 0, now() - interval '5 hours', now() + interval '10 minutes')");
  await query("INSERT INTO audit(at, kind) VALUES(now() - interval '200 days', 'cu'), (now(), 'moi')");
  const O = await signup('Chủ', {}); const fid = await makeFamily(O, 'Nhà dọn');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: newPhone() }));
  await ok(O.post(`/api/families/${fid}/invites`, { phone: newPhone() }));
  await query("UPDATE invitations SET expires_at = now() - interval '1 day' WHERE id = (SELECT id FROM invitations ORDER BY created_at LIMIT 1)");
  await query("INSERT INTO invitations(family_id, kind, role, phone_hash, invited_by, status, expires_at, decided_at) VALUES($1,'nguoi_lon','thanh_vien','z', $2, 'declined', now() - interval '80 days', now() - interval '70 days')", [fid, O.user.id]);
  await maintenance();
  assert.equal((await keep.get('/api/me')).json.user.id, keep.user.id);
  assert.equal((await old.get('/api/me')).json.user, null);
  const c = async (sql) => (await query(sql))[0].n;
  assert.equal(await c("SELECT count(*)::int AS n FROM otps WHERE phone_hash='p'"), 0);
  assert.equal(await c("SELECT count(*)::int AS n FROM otps WHERE phone_hash='p2'"), 1);
  assert.equal(await c("SELECT count(*)::int AS n FROM tickets WHERE token_hash='t1'"), 0);
  assert.equal(await c("SELECT count(*)::int AS n FROM tickets WHERE token_hash='t2'"), 1);
  assert.equal(await c("SELECT count(*)::int AS n FROM internal_nonces WHERE nonce='cu'"), 0);
  assert.equal(await c("SELECT count(*)::int AS n FROM internal_nonces WHERE nonce='moi'"), 1);
  assert.equal(await c("SELECT count(*)::int AS n FROM idem WHERE scope='x'"), 0);
  assert.equal(await c("SELECT count(*)::int AS n FROM throttle WHERE key='cu'"), 0);
  assert.equal(await c("SELECT count(*)::int AS n FROM throttle WHERE key IN ('moi','dang-khoa')"), 2);
  assert.equal(await c("SELECT count(*)::int AS n FROM audit WHERE kind='cu'"), 0);
  assert.equal(await c("SELECT count(*)::int AS n FROM audit WHERE kind='moi'"), 1);
  assert.equal(await c("SELECT count(*)::int AS n FROM invitations WHERE status='expired'"), 1, 'lời mời hết hạn chuyển expired');
  assert.equal(await c("SELECT count(*)::int AS n FROM invitations WHERE status='declined'"), 0, 'lời mời đã đóng quá 60 ngày bị xóa');
  assert.equal(await c("SELECT count(*)::int AS n FROM invitations WHERE status='pending'"), 1);
});

test('tệp tĩnh: CSP chặt, không lộ mã nguồn/thư mục ẩn, chống duyệt thư mục', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/); assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const html = await page.text();
  assert.ok(html.includes(`<base href="${config.basePath}/">`) && !html.includes('__BASE__'));
  for (const p of ['/../src/config.js', '/..%2fsrc%2fconfig.js', '/%2e%2e/src/config.js', '/../../package.json', '/.env', '/db/001_init.sql', '/src/server.js', '/node_modules/pg/package.json', '/..\\src\\config.js', '/%00', '/internal/v1/verify', '/admin-api/v1/manifest']) {
    const r = await fetch(origin + '/id' + p);
    assert.ok(r.status === 404 || r.status === 400 || r.status === 401 || r.status === 405, `${p} -> ${r.status}`);
    const t = await r.text();
    assert.ok(!t.includes('PHONE_PEPPER') && !t.includes('CREATE TABLE'), p);
  }
  const raw = await new Promise((resolve) => {
    import('node:net').then(({ default: net }) => {
      const s = net.connect(new URL(origin).port, '127.0.0.1', () => s.write('GET /id/../src/config.js HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let d = ''; s.on('data', (x) => { d += x; }); s.on('close', () => resolve(d));
    });
  });
  assert.ok(!raw.includes('PHONE_PEPPER'));
  const si = await fetch(base + '/search-index.json');
  assert.equal(si.status, 200); assert.match(si.headers.get('content-type'), /application\/json/);
});

test('chỉ mục tìm kiếm cho launcher đúng định dạng SEARCH-INDEX.md', async () => {
  const idx = JSON.parse(fs.readFileSync(path.join(root, 'public', 'search-index.json'), 'utf8'));
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  assert.ok(Array.isArray(idx) && idx.length >= 5);
  const paths = new Set();
  for (const e of idx) {
    assert.deepEqual(Object.keys(e).sort(), ['blurb', 'keywords', 'name', 'path']);
    assert.match(e.path, /^#\/[a-z0-9\-\/]+$/); assert.ok(!paths.has(e.path)); paths.add(e.path);
    assert.ok(e.name && e.blurb && e.keywords.length >= 3);
    assert.equal(new Set(e.keywords).size, e.keywords.length, 'từ khóa không trùng');
    for (const k of e.keywords) {
      assert.equal(k, k.toLowerCase());
      if (fold(k) !== k) assert.ok(e.keywords.includes(fold(k)), `thiếu bản không dấu của "${k}"`);
    }
  }
  for (const need of ['#/dang-nhap', '#/dang-ky', '#/quen-mat-khau', '#/tai-khoan', '#/loi-moi']) assert.ok(paths.has(need), need);
  // mọi đường dẫn có thật trong giao diện
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  for (const p of paths) assert.ok(app.includes(p.slice(1)), `app.js chưa có tuyến ${p}`);
});

test('XSS: tên hiển thị, tên gia đình, tên con chứa HTML được lưu nguyên và trả dạng JSON, không bao giờ vào trang HTML', async () => {
  const xss = '<img src=x onerror=alert(1)>';
  const a = await signup(xss, {});
  assert.equal((await ok(a.get('/api/me'))).user.displayName, xss);
  const fid = await makeFamily(a, xss);
  const html = await (await fetch(base + '/')).text();
  assert.ok(!html.includes('onerror'));
  const r = await a.get('/api/families/' + fid);
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  // giao diện chỉ dùng textContent: không có innerHTML / insertAdjacentHTML / document.write trong mã giao diện
  for (const f of fs.readdirSync(path.join(root, 'public')).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(root, 'public', f), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(src), `${f} dùng API chèn HTML thô`);
  }
});

test('cookie: chỉ nhận token máy chủ đã cấp; Secure khi production; đăng xuất xóa cookie', async () => {
  const a = await signup('Cookie', {});
  const out = await a.post('/api/logout');
  assert.ok(out.setCookie.some((c) => /^nine_sid=;/.test(c) && /Max-Age=0/.test(c) && /Path=\//.test(c)));
  config.production = true;
  try {
    const c = new Client('prod', '10.9.9.9'); const phone = newPhone();
    const { ticket } = await getTicket(c, phone);
    const r = await c.post('/api/register', { ticket, phone, name: 'Prod', password: PASS });
    assert.ok(r.setCookie.some((x) => x.startsWith('nine_sid=') && /; Secure/.test(x) && /HttpOnly/.test(x) && /Path=\/(;|$)/.test(x)), r.setCookie.join());
  } finally { config.production = false; }
  const src = fs.readFileSync(path.join(root, 'src', 'http.js'), 'utf8');
  assert.match(src, /if \(config\.production\) parts\.push\('Secure'\)/);
});

test('mã nguồn: không dùng .replace với chuỗi thay thế chứa dữ liệu người dùng, không log body/mật khẩu', async () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === 'shots' || e.name === '.data') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(path.join(root, 'src')); walk(path.join(root, 'client'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/console\.(log|error|warn)\(([^)]*)\)/g)) {
      assert.ok(!/\b(password|currentPassword|newPassword|ctx\.body|ctx\.raw|code\b|ticket|token)\b/.test(m[2].replace(/\[otp\]|'[^']*'|`[^`]*`/g, '')), `${path.basename(f)}: ${m[0]}`);
    }
    assert.ok(!/\.replace\([^,]+,\s*(ctx|body|req)\b/.test(src), path.basename(f));
  }
  const indexSrc = fs.readFileSync(path.join(root, 'src', 'http.js'), 'utf8');
  assert.match(indexSrc, /replaceAll\('__BASE__', \(\) =>/);
});

test('mọi bảng chứa mật khẩu/token chỉ lưu băm: không cột token thô, không số điện thoại ở bảng gia đình', async () => {
  const cols = await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'");
  const names = cols.map((c) => `${c.table_name}.${c.column_name}`);
  assert.ok(!names.some((n) => /(^|\.)(token|code|otp|password)$/.test(n)), names.filter((n) => /token|code|otp|password/.test(n)).join());
  const phoneCols = cols.filter((c) => /phone/.test(c.column_name) && !/verified/.test(c.column_name)).map((c) => `${c.table_name}.${c.column_name}`);
  // ngoại lệ có chủ đích: phone_changes.old_phone giữ số cũ dạng rõ để HOÀN TÁC đổi số trong 7 ngày, bị xóa về NULL sau 8 ngày (maintenance)
  assert.deepEqual(phoneCols.sort(), ['invitations.phone_hash', 'invitations.phone_last4', 'otps.phone_hash', 'phone_changes.new_phone_hash', 'phone_changes.old_phone', 'tickets.phone_hash', 'users.phone']);
});

test('CSDL: ràng buộc vai trò, một chủ, lời mời chờ duy nhất; xóa tài khoản cascade sạch', async () => {
  const a = await signup('RB', {});
  const fid = await makeFamily(a, 'RB');
  await assert.rejects(query("INSERT INTO memberships(family_id,user_id,role) VALUES($1,$2,'khac')", [fid, a.user.id]), /check|violates/i);
  await assert.rejects(query("INSERT INTO memberships(family_id,user_id,role) VALUES($1,$2,'quan_ly')", [fid, a.user.id]), /duplicate|unique/i);
  await query("INSERT INTO invitations(family_id,kind,role,phone_hash,invited_by,expires_at) VALUES($1,'nguoi_lon','thanh_vien','h1',$2, now() + interval '1 day')", [fid, a.user.id]);
  await assert.rejects(query("INSERT INTO invitations(family_id,kind,role,phone_hash,invited_by,expires_at) VALUES($1,'nguoi_lon','thanh_vien','h1',$2, now() + interval '1 day')", [fid, a.user.id]), /duplicate|unique/i);
  await assert.rejects(query("INSERT INTO users(phone, display_name, password_hash) VALUES($1,'x','y')", [util.normalizePhone(a.phone)]), /duplicate|unique/i);
});

test('khởi động production với .env.example (giá trị mẫu) bị từ chối, nêu rõ từng vấn đề', async () => {
  const { spawnSync } = await import('node:child_process');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  for (const line of fs.readFileSync(path.join(root, '.env.example'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
  }
  const r = spawnSync(process.execPath, [path.join(root, 'src', 'server.js')], { env, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1);
  for (const re of [/từ chối khởi động/, /MAT_KHAU/, /PHONE_PEPPER/, /ESMS/, /INTERNAL_KEYS/]) assert.match(r.stderr, re);
  // cổng OTP mock/console ở production cũng bị từ chối
  const r2 = spawnSync(process.execPath, [path.join(root, 'src', 'server.js')], { env: { ...env, OTP_PROVIDER: 'mock' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r2.status, 1); assert.match(r2.stderr, /OTP_PROVIDER="mock"/);
});
