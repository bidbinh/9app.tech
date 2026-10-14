import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { boot, shutdown, Client } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const SRC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'nine.js');
const src = () => fs.readFileSync(SRC_PATH, 'utf8');

// Nạp nine.js vào một "trình duyệt" giả; responder(url, init) trả { status, ct, body } hoặc ném lỗi
function browser(responder, loc = {}) {
  const calls = [];
  const location = { pathname: '/lunch/', search: '?a=1', hash: '#x', href: '', ...loc };
  const fetchFake = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve().then(() => responder(url, init)).then((r) => ({
      ok: r.status >= 200 && r.status < 300, status: r.status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (r.ct === undefined ? 'application/json; charset=utf-8' : r.ct) : null) },
      json: () => Promise.resolve(typeof r.body === 'string' ? JSON.parse(r.body) : r.body),
    }));
  };
  const ctx = vm.createContext({ fetch: fetchFake, location, encodeURIComponent, decodeURIComponent, Promise, Error, JSON, console });
  ctx.window = ctx;
  vm.runInContext(src(), ctx, { filename: 'nine.js' });
  return { Nine: ctx.Nine, calls, location };
}
const ME = { user: { id: 'u1', displayName: 'Lan', phoneLast4: '1234', source: '9id', passwordWeak: false } };

test('me(): trả người dùng đã đăng nhập, nhớ kết quả; user() đọc đồng bộ', async () => {
  const { Nine, calls } = browser(() => ({ status: 200, body: ME }));
  assert.equal(Nine.user(), null, 'chưa nạp thì null');
  const u = await Nine.me();
  const plain = (x) => JSON.parse(JSON.stringify(x)); // đối tượng tạo trong vm có nguyên mẫu khác: so qua JSON
  assert.deepEqual(plain(u), { id: 'u1', displayName: 'Lan', phoneLast4: '1234' });
  assert.deepEqual(plain(Nine.user()), plain(u));
  assert.equal(calls[0].url, '/id/api/me');
  assert.equal(calls[0].init.credentials, 'same-origin');
});

test('me(): chưa đăng nhập thì null', async () => {
  const { Nine } = browser(() => ({ status: 200, body: { user: null } }));
  assert.equal(await Nine.me(), null);
  assert.equal(Nine.user(), null);
});

test('me(): mạng lỗi, 404, 500, trả HTML hoặc dữ liệu lạ đều reject (không bị coi là đăng xuất)', async () => {
  const cases = [
    () => { throw new Error('offline'); },
    () => ({ status: 404, body: {} }),
    () => ({ status: 500, body: {} }),
    () => ({ status: 200, ct: 'text/html', body: '{"user":null}' }),
    () => ({ status: 200, body: { foo: 1 } }),
    () => ({ status: 200, body: 'null' }),
  ];
  for (const c of cases) {
    const { Nine } = browser(c);
    await assert.rejects(Nine.me());
    assert.equal(Nine.user(), null);
  }
});

test('_safeNext: chỉ nhận đường dẫn cùng nguồn gốc', () => {
  const { Nine } = browser(() => ({ status: 200, body: ME }));
  for (const bad of ['//evil.com', 'https://evil.com', '\\\\evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, 42, '/\tevil', '/a\\b', 'evil', '/%2F%2Fevil.com'.replace('%2F%2F', '/\u0000')]) {
    assert.equal(Nine._safeNext(bad), '/', String(bad));
  }
  for (const good of ['/', '/tai-khoan?x=1#a', '/lunch/', '/#/tai-khoan', '/id/?next=%2F']) assert.equal(Nine._safeNext(good), good);
  assert.equal(Nine._safeNext('/' + 'a'.repeat(600)), '/', 'quá dài');
});

test('login/register: chuyển tới 9id với next đã làm sạch', () => {
  const b = browser(() => ({ status: 200, body: ME }));
  b.Nine.login();
  assert.equal(b.location.href, '/id/?next=%2Flunch%2F%3Fa%3D1%23x#/dang-nhap');
  b.Nine.register('/#/tai-khoan');
  assert.equal(b.location.href, '/id/?next=%2F%23%2Ftai-khoan#/dang-ky');
  b.Nine.login('https://evil.com/x');
  assert.equal(b.location.href, '/id/?next=%2F#/dang-nhap');
  b.Nine.login('//evil.com');
  assert.equal(b.location.href, '/id/?next=%2F#/dang-nhap');
});

test('logout(): POST có header chống CSRF, cùng nguồn gốc, rồi xóa bộ nhớ', async () => {
  const { Nine, calls } = browser((url, init) => (url.endsWith('/api/me') ? { status: 200, body: ME } : { status: 200, body: { ok: true } }));
  await Nine.me();
  assert.ok(Nine.user());
  await Nine.logout();
  const c = calls[calls.length - 1];
  assert.equal(c.url, '/id/api/logout');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.credentials, 'same-origin');
  assert.equal(c.init.headers['x-requested-with'], '9id');
  assert.equal(Nine.user(), null);
});

test('require(ok): đã đăng nhập gọi ok(user); chưa thì chuyển tới đăng nhập; 9id không đạt được thì không chuyển trang', async () => {
  let b = browser(() => ({ status: 200, body: ME }));
  let got = null;
  await b.Nine.require((u) => { got = u; });
  assert.equal(got.displayName, 'Lan');
  assert.equal(b.location.href, '');

  b = browser(() => ({ status: 200, body: { user: null } }));
  got = null;
  await b.Nine.require((u) => { got = u; });
  assert.equal(got, null);
  assert.match(b.location.href, /^\/id\/\?next=.*#\/dang-nhap$/);

  b = browser(() => { throw new Error('offline'); });
  let failed = null;
  await b.Nine.require(() => assert.fail('không được gọi'), (e) => { failed = e; });
  assert.ok(failed instanceof Error);
  assert.equal(b.location.href, '');
});

test('nine.js viết bằng ES5 cổ điển (chạy được trên WebView cũ): không let/const/mũi tên/class/import/export', () => {
  const code = src().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\b(let|const|class|import|export)\b/.test(code), 'từ khóa ES6');
  assert.ok(!/=>/.test(code), 'mũi tên');
  assert.ok(!/`/.test(code), 'template literal');
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(code), 'không lưu trữ/đọc cookie ở phía trình duyệt');
});

test('máy chủ phục vụ /id/nine.js là JavaScript', async () => {
  const r = await new Client('x').get('/nine.js', { raw: true });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.buf.toString('utf8'), /Nine/);
});
