import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Api } from './helper-http.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const raw = (path) => fetch(srv.base + path);

test('trang chính được phát ở /stay/ và các đường dẫn giao diện (SPA), kèm CSP chặt và không cache', async () => {
  for (const p of ['/', '/lich', '/don/abc']) {
    const r = await raw(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.ok(!/unsafe-inline/.test(csp.match(/script-src[^;]*/)[0]), 'script-src không được unsafe-inline');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.ok((await r.text()).includes('<base href="' + srv.base.replace(/^https?:\/\/[^/]+/, '') + '/">'));
  }
});

test('tệp tĩnh có kiểu MIME đúng; tệp không tồn tại: 404 (không rơi về index cho đường có đuôi tệp)', async () => {
  const js = await raw('/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await raw('/style.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await raw('/khong-co.js')).status, 404);
  assert.equal((await raw('/anh/khong-co.png')).status, 404);
});

test('chống duyệt ngược thư mục và truy cập tệp ngoài public', async () => {
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/src/db.js', '/..\\package.json', '/static/../../.env']) {
    const r = await raw(p);
    assert.ok([400, 404].includes(r.status) || (r.headers.get('content-type') || '').includes('text/html'), `${p} -> ${r.status}`);
    const t = await r.text();
    assert.ok(!t.includes('"name": "9stay"') && !t.includes('pg.types'), p + ' lộ mã nguồn');
  }
});

test('API không bị tệp tĩnh che: /api/... chưa đăng nhập vẫn là 401 JSON; /api lạ là 404 JSON', async () => {
  const me = await new Api(srv).get('/api/me');
  assert.equal(me.status, 401);
  assert.ok(me.json.error);
  const none = await new Api(srv).get('/api/khong-co');
  assert.equal(none.status, 404);
  assert.ok(none.json.error);
});

test('chỉ GET/HEAD cho tệp tĩnh: POST vào trang là 405/403, không phục vụ HTML', async () => {
  const r = await fetch(srv.base + '/', { method: 'POST', headers: { 'x-requested-with': '9stay' } });
  assert.ok([404, 405].includes(r.status), String(r.status));
});
