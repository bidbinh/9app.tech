// Nhập xấu, XSS, CSRF, cookie, tệp tĩnh, và API Console.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, shutdown, Client, ok, makeEmployer, postJob, jobBody, config, base, db } from './helper.js';
import * as contract from '../../9admin/src/contract.js';

before(boot);
after(shutdown);

test('CSRF: thiếu header X-Requested-With hoặc Origin lạ bị từ chối; Origin đúng được', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/employer', { name: 'Quán CSRF' }, { csrf: false })).status, 403);
  assert.equal((await c.post('/api/employer', { name: 'Quán CSRF' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.post('/api/employer', { name: 'Quán CSRF' }, { headers: { 'x-requested-with': 'fetch' }, csrf: false })).status, 403);
  const host = new URL(base).host;
  assert.equal((await c.post('/api/employer', { name: 'Quán CSRF' }, { origin: 'http://' + host })).status, 200);
  // PUT/DELETE cũng cần header
  assert.equal((await c.del('/api/employer', { csrf: false })).status, 403);
});

test('cookie phiên: HttpOnly, SameSite=Lax, Path theo BASE_PATH; không lộ token trong JSON', async () => {
  const c = new Client();
  const r = await c.post('/api/employer', { name: 'Quán Cookie' });
  const sc = r.setCookie.find((x) => x.startsWith('hsid='));
  assert.ok(sc);
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/); assert.match(sc, new RegExp('Path=' + config.basePath + '/'));
  const token = decodeURIComponent(sc.split(';')[0].slice(5));
  assert.ok(!r.text.includes(token));
  const rows = await db.query('SELECT token_hash FROM phien');
  assert.ok(!rows.some((x) => x.token_hash === token));
  assert.ok(rows.some((x) => x.token_hash === crypto.createHash('sha256').update(token).digest('hex')));
  // cookie bịa không có quyền
  const fake = new Client(); fake.cookie = 'hsid=' + 'A'.repeat(43);
  assert.equal((await fake.get('/api/employer/jobs')).status, 401);
  const junk = new Client(); junk.cookie = 'hsid=%E0%A4%A';
  assert.equal((await junk.get('/api/employer/jobs')).status, 401);
});

test('nhập xấu: kiểu dữ liệu sai, quá dài, ký tự điều khiển, số ngoài khoảng', async () => {
  const e = await makeEmployer();
  const post = (over) => e.post('/api/employer/jobs', jobBody(over));
  for (const over of [
    { title: 123 }, { title: ['a'] }, { title: { a: 1 } }, { title: '' }, { title: 'ab' }, { title: 'x'.repeat(81) }, { company: null }, { description: 'ngắn' }, { description: 'x'.repeat(2001) },
    { kind: 'hack' }, { category: '__proto__' }, { payType: 'khac' }, { payMin: -5 }, { payMin: 'abc' }, { payMin: 1.5 }, { payMin: 10 }, { payMax: 1e15 },
    { shifts: ['sang', 'xyz'] }, { shifts: 'sang' }, { shifts: Array(9).fill('sang') }, { city: 'xx' }, { district: 'a' }, { district: '   ' }, { district: '!!!' },
    { contactPhone: '0123' }, { contactPhone: 'abc' }, { contactPhone: '091234567890123' }, { contactName: 'a' }, { slots: 0 }, { slots: 101 }, { slots: 'abc' }, { days: 0 }, { days: 31 }, { days: 'x' },
  ]) {
    const r = await post(over);
    assert.equal(r.status, 400, JSON.stringify(over).slice(0, 80) + ' -> ' + r.status);
    assert.equal(r.json.error.code === 'invalid_input' || r.json.error.code === 'scam_blocked' || r.json.error.code === 'contact_in_text', true);
  }
  assert.equal((await e.post('/api/employer/jobs', undefined, { rawBody: '{không phải json' })).status, 400);
  assert.equal((await e.post('/api/employer/jobs', undefined, { rawBody: '[1,2]' })).status, 400);
  assert.equal((await e.post('/api/employer/jobs', undefined, { rawBody: 'null' })).status, 400);
  const huge = await e.post('/api/employer/jobs', undefined, { rawBody: JSON.stringify({ title: 'x'.repeat(70 * 1024) }) });
  assert.equal(huge.status, 413);
  // ký tự điều khiển, RTL override, ký tự rộng 0 bị loại; khoảng trắng gộp
  const j = await ok(e.post('/api/employer/jobs', jobBody({ title: 'Thu‮ ngân\u0000  viên​   ca\u0007 tối', description: 'Dòng 1\r\n\r\n\r\n\r\nDòng 2 có đủ độ dài\u0001 để hợp lệ.' })));
  assert.equal(j.job.title, 'Thu ngân viên ca tối');
  assert.ok(!/[\u0000-\u0008‮​]/.test(j.job.description));
  assert.equal(j.job.description.split('\n').length, 3, 'tối đa một dòng trống');
  // ứng viên: tên, số, lời nhắn
  const job = j.job;
  const s = new Client();
  for (const over of [{ name: '' }, { name: 'a' }, { name: 5 }, { phone: 'abc' }, { phone: '0111' }, { message: 'x'.repeat(301) }, { message: 123 }]) {
    assert.equal((await s.post(`/api/jobs/${job.id}/apply`, { name: 'An An', phone: '0911222333', ...over })).status, 400, JSON.stringify(over));
  }
  assert.equal((await s.post(`/api/jobs/${job.id}/apply`, { name: 'An', phone: '+84 911 222 333' })).status, 200, '+84 hợp lệ');
  assert.equal((await new Client().post(`/api/jobs/xyz/apply`, { name: 'An An', phone: '0911222444' })).status, 404);
});

test('XSS/HTML: dữ liệu giữ nguyên dạng văn bản, API trả JSON + nosniff, không phản chiếu HTML', async () => {
  const e = await makeEmployer('<img src=x onerror=alert(1)>');
  const xss = '<script>alert(1)</script>';
  const job = await postJob(e, { title: 'Thu ngân ' + xss, company: '"><svg onload=alert(1)>', requirements: '<b>đậm</b> & "trích" \'đơn\'' });
  const s = new Client();
  const r = await s.get(`/api/jobs/${job.id}`);
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.json.job.title, 'Thu ngân ' + xss);
  await ok(s.post(`/api/jobs/${job.id}/apply`, { name: '<img src=x onerror=1>', phone: '0911555666', message: '"><script>1</script>' }));
  const inbox = await ok(e.get(`/api/employer/jobs/${job.id}/applications`));
  assert.equal(inbox.items[0].name, '<img src=x onerror=1>');
  // lỗi trả JSON, không chèn đầu vào vào HTML
  const bad = await s.req('GET', '/api/jobs/' + encodeURIComponent('<script>'), undefined, { raw: true });
  assert.match(bad.headers.get('content-type'), /json/);
  // trang chính: CSP chặn script/style nội tuyến
  const page = await s.req('GET', '/', undefined, { raw: true });
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /style-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(!/<script>[^<]/.test(page.text) && !/ style=/.test(page.text), 'trang gốc không có script/style nội tuyến');
});

test('tệp tĩnh: không đọc ra ngoài public, không lộ mã nguồn hay .env', async () => {
  const s = new Client();
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/../package.json', '/src/server.js', '/db/001_init.sql', '/.env', '/node_modules/pg/package.json', '/..%5c..%5cpackage.json']) {
    const r = await s.req('GET', p, undefined, { raw: true });
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.text.includes('"name": "9hire"') && !r.text.includes('CREATE TABLE'), p);
  }
  const r = await s.req('GET', '/style.css', undefined, { raw: true });
  assert.equal(r.status, 200);
  assert.equal((await s.req('GET', '/admin-api/v1/manifest', undefined, { raw: true })).status, 404, 'Console tắt khi chưa đặt khóa');
});

test('API Console: ký HMAC, thời gian, phát lại; dữ liệu qua bộ kiểm tra hợp đồng của 9admin; không lộ SĐT ứng viên', async () => {
  const kid = 'hub'; const secret = 'bi-mat-thu-nghiem-cho-hire';
  config.consoleApiKeyId = kid; config.consoleApiSecret = secret;
  try {
    const e = await makeEmployer('Quán Console');
    const job = await postJob(e, { description: 'Việc nhẹ lương cao, phục vụ bàn cuối tuần tại quán, gửi ảnh CCCD trước nhé.' });
    await ok(new Client().post(`/api/jobs/${job.id}/apply`, { name: 'Ứng Viên Bí Mật', phone: '0911999888' }));
    const call = async (method, path, bodyObj, over = {}) => {
      const ts = String(over.ts ?? Math.floor(Date.now() / 1000));
      const body = bodyObj ? JSON.stringify(bodyObj) : '';
      const full = config.basePath + path;
      const sig = over.sig ?? crypto.createHmac('sha256', secret).update(`${ts}\n${method}\n${full}\n${crypto.createHash('sha256').update(body).digest('hex')}`).digest('hex');
      const r = await fetch(base.replace(config.basePath, '') + full, { method, headers: { 'x-console-key': over.kid ?? kid, 'x-console-ts': ts, 'x-console-sig': sig, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body || undefined });
      const t = await r.text();
      return { status: r.status, text: t, json: t ? JSON.parse(t) : null };
    };
    assert.equal((await call('GET', '/admin-api/v1/manifest', null, { sig: 'x'.repeat(64) })).status, 401);
    assert.equal((await call('GET', '/admin-api/v1/manifest', null, { kid: 'sai' })).status, 401);
    assert.equal((await call('GET', '/admin-api/v1/manifest', null, { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401);
    const m = await call('GET', '/admin-api/v1/manifest');
    assert.equal(m.status, 200); contract.manifest(m.json);
    assert.deepEqual(m.json.capabilities, ['users', 'panels']);
    contract.health((await call('GET', '/admin-api/v1/health')).json);
    const sum = (await call('GET', '/admin-api/v1/summary')).json; contract.summary(sum);
    const users = (await call('GET', '/admin-api/v1/users')).json; contract.usersPage(users);
    assert.ok(users.items.length >= 1);
    const detail = (await call('GET', '/admin-api/v1/users/' + users.items[0].id)).json; contract.userDetail(detail);
    const panels = (await call('GET', '/admin-api/v1/panels')).json; contract.panels(panels);
    const data = (await call('GET', '/admin-api/v1/panels/review')).json; contract.panelData(data);
    const row = data.rows.find((r) => r._id === job.id);
    assert.ok(row, 'tin có nhãn cẩn trọng nằm trong hàng đợi xem xét');
    const everything = JSON.stringify([m.json, sum, users, detail, panels, data]);
    assert.ok(!everything.includes('0911999888') && !everything.includes('Ứng Viên Bí Mật') && !everything.includes('0912345678'), 'không lộ liên hệ');
    // hành động: ẩn, bỏ ẩn, xóa; chữ ký dùng một lần
    const act = { panel: 'review', rowId: job.id, inputs: {} };
    const body = JSON.stringify(act);
    const ts = String(Math.floor(Date.now() / 1000));
    const full = config.basePath + '/admin-api/v1/actions/hide';
    const sig = crypto.createHmac('sha256', secret).update(`${ts}\nPOST\n${full}\n${crypto.createHash('sha256').update(body).digest('hex')}`).digest('hex');
    const send = () => fetch(base.replace(config.basePath, '') + full, { method: 'POST', headers: { 'x-console-key': kid, 'x-console-ts': ts, 'x-console-sig': sig, 'content-type': 'application/json' }, body });
    const r1 = await send(); const j1 = await r1.json(); contract.actionResult(j1);
    assert.equal(j1.ok, true);
    assert.equal((await send()).status, 401, 'phát lại cùng chữ ký bị từ chối');
    assert.equal((await new Client().get(`/api/jobs/${job.id}`)).status, 404);
    const un = await call('POST', '/admin-api/v1/actions/unhide', { ...act, inputs: { n: 1 } }); assert.equal(un.json.ok, true);
    assert.equal((await new Client().get(`/api/jobs/${job.id}`)).status, 200);
    assert.equal((await call('POST', '/admin-api/v1/actions/unhide', { ...act, inputs: { n: 2 } })).json.ok, false, 'không ẩn thì không bỏ ẩn');
    assert.equal((await call('POST', '/admin-api/v1/actions/xyz', { ...act, inputs: { n: 3 } })).json.ok, false);
    assert.equal((await call('POST', '/admin-api/v1/actions/delete', { ...act, rowId: 'khong-phai-uuid', inputs: { n: 5 } })).json.ok, false);
    const del = await call('POST', '/admin-api/v1/actions/delete', { ...act, inputs: { n: 4 } }); assert.equal(del.json.ok, true);
    assert.equal((await new Client().get(`/api/jobs/${job.id}`)).status, 404);
    // POST thiếu chữ ký/CSRF vẫn bị từ chối bởi chữ ký
    const naked = await fetch(base.replace(config.basePath, '') + full, { method: 'POST', body });
    assert.equal(naked.status, 401);
  } finally {
    config.consoleApiKeyId = ''; config.consoleApiSecret = '';
  }
});
