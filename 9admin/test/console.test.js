// 9app Console: đăng nhập/TOTP/khóa, đăng ký app (chống SSRF), đồng bộ với app giả, báo cáo, proxy hành động, nhật ký.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { query, migrate, resetForTests, close } from '../src/db.js';
import { config } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { createAdmin } from '../src/auth.js';
import { totp } from '../src/totp.js';
import { sign } from '../src/contract.js';
import { upsertApp } from '../src/registry.js';
import { refreshApp } from '../src/sync.js';
import { assertAllowedUrl } from '../src/connector.js';

const SECRET = 'bi-mat-kiem-thu-rat-dai-0123456789';
let fake; let fakeUrl; let app; let base; let admin;

// ---- app giả theo giao thức v1 ----
const data = {
  users: [{ id: '1', name: 'An', phone: '0901111111', createdAt: '2026-10-01T00:00:00Z' }, { id: '2', name: 'Bình', phone: '+84902222222', createdAt: '2026-10-02T00:00:00Z' }],
  cash: [
    { id: 'c1', at: '2026-10-01T01:00:00Z', kind: 'cash_in', amount: 500000, category: 'Nạp ví', description: 'nạp', ref: 'r1', phone: '0901111111' },
    { id: 'c2', at: '2026-10-01T02:00:00Z', kind: 'revenue', amount: 30000, category: 'Cước', description: '=HYPERLINK("http://x")', ref: 'r2', phone: '0901111111' },
    { id: 'c3', at: '2026-10-01T03:00:00Z', kind: 'expense', amount: 20000, category: 'Giá vốn', description: 'gv', ref: 'r3', phone: '' },
  ],
  balances: [{ id: 'bank', label: 'Ngân hàng', amount: 480000, kind: 'cash' }, { id: 'held', label: 'Tiền khách giữ hộ', amount: 500000, kind: 'customer_funds' }],
  badCash: false, calls: [],
};
const PANELS = { items: [{ id: 'q', title: 'Hàng đợi', columns: [{ key: 'name', label: 'Tên', format: 'text' }], rowActions: [{ id: 'ok', label: 'Duyệt', tone: 'primary', inputs: [{ name: 'note', label: 'Ghi chú', type: 'text', required: true }] }] }] };

function startFake() {
  return new Promise((resolve) => {
    fake = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const ts = req.headers['x-console-ts'];
        const want = sign(SECRET, ts, req.method, req.url, body);
        const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.headers['x-console-sig'] !== want || req.headers['x-console-key'] !== 'k1') return send(401, { error: { code: 'unauthorized' } });
        const u = new URL(req.url, 'http://x');
        const p = u.pathname.replace('/admin-api/v1', '');
        data.calls.push(req.method + ' ' + p);
        const after = u.searchParams.get('after') || '0';
        const page = (arr, idKey) => {
          const lim = Number(u.searchParams.get('limit') || 2);
          const i = after === '0' ? 0 : arr.findIndex((x) => x[idKey] === after) + 1;
          const items = arr.slice(i, i + lim);
          return { items, next: items.length ? items[items.length - 1][idKey] : after, hasMore: i + lim < arr.length };
        };
        if (p === '/manifest') return send(200, { app: { id: 'fake', name: 'App giả', version: '1' }, capabilities: ['users', 'money', 'panels'], currency: 'VND' });
        if (p === '/health') return send(200, { ok: true, details: 'tốt' });
        if (p === '/summary') return send(200, { kpis: [{ id: 'x', label: 'X', value: 7, format: 'int' }], alerts: [] });
        if (p === '/panels') return send(200, PANELS);
        if (p === '/users') return send(200, page(data.users, 'id'));
        if (p === '/cash') return send(200, page(data.badCash ? data.cash.map((c) => ({ ...c, amount: -5 })) : data.cash, 'id'));
        if (p === '/balances') return send(200, { items: data.balances });
        if (p === '/actions/ok') return send(200, { ok: true, message: 'đã duyệt ' + JSON.parse(body).rowId });
        return send(404, { error: { code: 'not_found' } });
      });
    }).listen(0, '127.0.0.1', () => { fakeUrl = 'http://127.0.0.1:' + fake.address().port; resolve(); });
  });
}

before(async () => {
  await migrate(); await resetForTests();
  await startFake();
  app = buildApp();
  base = 'http://127.0.0.1:' + await app.listen(0);
  admin = await createAdmin('chu', 'matkhau-rat-dai-123');
  await upsertApp({ id: 'fake', name: 'App giả', baseUrl: fakeUrl, keyId: 'k1', secret: SECRET });
});
after(async () => { await app.close(); fake.close(); await close(); });

let cookie = '';
async function api(method, path, body, { csrf = true, ck = cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (csrf) headers['x-requested-with'] = 'console';
  if (ck) headers.cookie = ck;
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: r.status, json, text, headers: r.headers };
}
const login = (u, p, code) => api('POST', '/api/login', { username: u, password: p, totp: code }, { ck: '' });

test('đăng nhập: cần mật khẩu + TOTP; sai bị từ chối; cookie đúng thuộc tính', async () => {
  assert.equal((await api('GET', '/api/overview', null, { ck: '' })).status, 401);
  const noCode = await login('chu', 'matkhau-rat-dai-123', '000000');
  assert.equal(noCode.status, 401);
  const wrongPw = await login('chu', 'sai-sai-sai-sai', totp(admin.totpSecret));
  assert.equal(wrongPw.status, 401);
  assert.equal(noCode.json.error.message, wrongPw.json.error.message, 'không lộ lý do sai');
  const ok = await login('chu', 'matkhau-rat-dai-123', totp(admin.totpSecret));
  assert.equal(ok.status, 200, ok.text);
  const sc = ok.headers.get('set-cookie');
  assert.match(sc, /csid=/); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Strict/i); assert.match(sc, /Path=\/admin\//);
  cookie = sc.split(';')[0];
  assert.equal((await api('GET', '/api/me')).json.admin.username, 'chu');
});

test('CSRF: POST thiếu header X-Requested-With bị chặn', async () => {
  const r = await api('POST', '/api/sync', null, { csrf: false });
  assert.ok([400, 403].includes(r.status), String(r.status));
});

test('khóa tài khoản sau nhiều lần sai', async () => {
  await createAdmin('khac', 'matkhau-khac-123456');
  let last;
  for (let i = 0; i < config.loginMaxFails; i++) last = await login('khac', 'sai-sai-sai-sai-1', '123456');
  assert.equal(last.status, 401);
  const locked = await login('khac', 'matkhau-khac-123456', '123456');
  assert.equal(locked.status, 429);
  await query('DELETE FROM auth_failures');
});

test('mật khẩu quản trị yếu bị từ chối', async () => {
  await assert.rejects(createAdmin('yeu', 'ngan123'));
});

test('chống SSRF: chỉ máy chủ trong danh sách, không tài khoản trong URL, không giao thức lạ', async () => {
  assert.throws(() => assertAllowedUrl('http://evil.example.com/x'), /không nằm trong danh sách/);
  assert.throws(() => assertAllowedUrl('http://169.254.169.254/latest'), /không nằm trong danh sách/);
  assert.throws(() => assertAllowedUrl('http://user:pw@127.0.0.1/x'), /tài khoản/);
  assert.throws(() => assertAllowedUrl('file:///etc/passwd'), /http/);
  assert.doesNotThrow(() => assertAllowedUrl('http://9ship:8099/9ship'));
  const r = await api('POST', '/api/apps', { id: 'xau', name: 'Xấu', baseUrl: 'http://evil.example.com', keyId: 'k', secret: SECRET });
  assert.equal(r.status, 400);
});

test('bí mật của app lưu mã hóa và không bao giờ trả ra ngoài', async () => {
  const row = (await query("SELECT secret_enc FROM apps WHERE id='fake'"))[0];
  assert.ok(row.secret_enc.startsWith('v1.'));
  assert.ok(!row.secret_enc.includes(SECRET));
  const list = await api('GET', '/api/apps');
  assert.ok(!list.text.includes(SECRET) && !list.text.includes('secret_enc'));
});

test('đồng bộ: người dùng, dòng tiền, số dư vào kho; chạy lại không nhân đôi', async () => {
  const r = await refreshApp('fake', { forceFull: true });
  for (const [k, v] of Object.entries(r.steps)) assert.ok(v.ok, k + ': ' + v.error);
  assert.equal((await query("SELECT count(*)::int n FROM users_index WHERE app_id='fake'"))[0].n, 2);
  assert.equal((await query("SELECT count(*)::int n FROM cash_entries WHERE app_id='fake'"))[0].n, 3);
  assert.equal((await query("SELECT count(*)::int n FROM balances WHERE app_id='fake'"))[0].n, 2);
  await refreshApp('fake');
  await refreshApp('fake', { forceFull: true });
  assert.equal((await query("SELECT count(*)::int n FROM cash_entries WHERE app_id='fake'"))[0].n, 3, 'không nhân đôi');
  assert.equal((await query("SELECT count(*)::int n FROM users_index WHERE app_id='fake'"))[0].n, 2);
  const phones = (await query("SELECT phone FROM cash_entries WHERE app_id='fake' ORDER BY entry_id")).map((x) => x.phone);
  assert.deepEqual(phones.slice(0, 2), ['0901111111', '0901111111']);
});

test('dữ liệu mới của app được lấy tiếp theo con trỏ', async () => {
  data.cash.push({ id: 'c4', at: '2026-10-02T01:00:00Z', kind: 'cash_out', amount: 100000, category: 'Rút tiền', description: 'rút', ref: 'r4', phone: '0901111111' });
  await refreshApp('fake');
  assert.equal((await query("SELECT count(*)::int n FROM cash_entries WHERE app_id='fake'"))[0].n, 4);
});

test('dòng tiền: tách tiền vào/ra, doanh thu, chi phí; tiền khách giữ hộ không tính doanh thu', async () => {
  const m = (await api('GET', '/api/money')).json;
  const t = m.totals || m.kpis || m;
  const s = JSON.stringify(m);
  assert.ok(s.includes('500000') && s.includes('30000') && s.includes('20000') && s.includes('100000'), s.slice(0, 400));
  const bal = (await api('GET', '/api/overview')).json;
  assert.ok(JSON.stringify(bal).includes('500000'), 'số dư tiền khách giữ hộ hiển thị riêng');
  void t;
});

test('xuất CSV chặn chèn công thức', async () => {
  const r = await api('GET', '/api/money.csv');
  assert.equal(r.status, 200);
  assert.ok(!/^=HYPERLINK/m.test(r.text) && !r.text.includes(',=HYPERLINK') && !r.text.includes(',"=HYPERLINK'), 'ô bắt đầu bằng = phải bị vô hiệu');
  assert.ok(r.text.includes("'=HYPERLINK") || r.text.includes("'\"=HYPERLINK"));
});

test('người dùng gom theo số điện thoại giữa các app', async () => {
  await upsertApp({ id: 'fake2', name: 'App giả 2', baseUrl: fakeUrl, keyId: 'k1', secret: SECRET });
  await query("INSERT INTO users_index(app_id, app_user_id, name, phone, created_at) VALUES('fake2','9','An (app 2)','0901111111', now())");
  const r = await api('GET', '/api/users?q=0901111111');
  assert.equal(r.status, 200);
  const rows = r.json.rows.filter((u) => u.phone === '0901111111');
  assert.equal(rows.length, 1, 'gộp một dòng cho một số điện thoại');
  assert.equal(rows[0].accounts.length, 2, 'hai tài khoản ở hai app');
});

test('app trả dữ liệu sai hợp đồng bị từ chối, không ghi vào kho', async () => {
  data.badCash = true;
  const before = (await query("SELECT count(*)::int n FROM cash_entries WHERE app_id='fake'"))[0].n;
  data.cash.push({ id: 'c5', at: '2026-10-03T01:00:00Z', kind: 'cash_in', amount: 1, category: 'x', description: '', ref: '', phone: '' });
  const r = await refreshApp('fake');
  assert.equal(r.steps.cash.ok, false);
  assert.equal((await query("SELECT count(*)::int n FROM cash_entries WHERE app_id='fake'"))[0].n, before);
  data.badCash = false;
});

test('sai bí mật: app giả từ chối, trạng thái app báo lỗi', async () => {
  await upsertApp({ id: 'fake', name: 'App giả', baseUrl: fakeUrl, keyId: 'k1', secret: 'bi-mat-khac-hoan-toan-0123456789' });
  const r = await refreshApp('fake');
  assert.equal(r.steps.manifest.ok, false);
  assert.equal((await query("SELECT ok FROM app_status WHERE app_id='fake'"))[0].ok, false);
  await upsertApp({ id: 'fake', name: 'App giả', baseUrl: fakeUrl, keyId: 'k1', secret: SECRET });
  assert.ok((await refreshApp('fake')).steps.manifest.ok);
});

test('proxy hành động: chỉ hành động đã khai báo; thiếu ô bắt buộc bị chặn; có nhật ký', async () => {
  await refreshApp('fake', { forceFull: true });
  let r = await api('POST', '/api/apps/fake/actions/xoa-het', { panel: 'q', rowId: '1', inputs: {} });
  assert.equal(r.status, 400);
  r = await api('POST', '/api/apps/fake/actions/ok', { panel: 'q', rowId: '1', inputs: {} });
  assert.equal(r.status, 400, 'thiếu ô bắt buộc');
  r = await api('POST', '/api/apps/fake/actions/ok', { panel: 'q', rowId: '77', inputs: { note: 'ổn' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);
  assert.match(r.json.message, /77/);
  const a = await query("SELECT * FROM audit_log WHERE action='app.action' ORDER BY id DESC LIMIT 1");
  assert.equal(a[0].admin, 'chu');
});

test('nhật ký không sửa/xóa được', async () => {
  await assert.rejects(query("UPDATE audit_log SET action='x'"));
  await assert.rejects(query('DELETE FROM audit_log'));
});

test('đăng xuất vô hiệu phiên', async () => {
  const c = cookie;
  assert.equal((await api('POST', '/api/logout', {})).status, 200);
  assert.equal((await api('GET', '/api/overview', null, { ck: c })).status, 401);
});
