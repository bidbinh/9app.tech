// Thư viện đồng bộ phía máy khách: gộp ba chiều và vòng đồng bộ (máy chủ giả trong bộ nhớ, không cần DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge3, createSync } from '../public/nine-sync.mjs';

const r = (id, v, t) => ({ id, v, capNhat: t });
const ids = (arr) => arr.map((x) => x.id).sort();

test('merge3: lần đầu (không có base) lấy hợp hai bên, không suy ra việc xóa', () => {
  const m = merge3(null, { xs: [r('a', 1)] }, { xs: [r('b', 2)] });
  assert.deepEqual(ids(m.xs), ['a', 'b']);
});

test('merge3: thêm ở hai máy khác nhau thì giữ cả hai', () => {
  const base = { xs: [r('a', 1)] };
  const m = merge3(base, { xs: [r('a', 1), r('b', 2)] }, { xs: [r('a', 1), r('c', 3)] });
  assert.deepEqual(ids(m.xs), ['a', 'b', 'c']);
});

test('merge3: xóa ở một máy được áp dụng (không sống lại); sửa thắng xóa', () => {
  const base = { xs: [r('a', 1), r('b', 1)] };
  let m = merge3(base, { xs: [r('b', 1)] }, { xs: [r('a', 1), r('b', 1)] });       // local xóa a
  assert.deepEqual(ids(m.xs), ['b']);
  m = merge3(base, { xs: [r('a', 1), r('b', 1)] }, { xs: [r('a', 1)] });             // remote xóa b
  assert.deepEqual(ids(m.xs), ['a']);
  m = merge3(base, { xs: [r('a', 1), r('b', 1)] }, { xs: [r('b', 'sửa')] });         // remote xóa a, sửa b
  assert.deepEqual(ids(m.xs), ['b']);
  assert.equal(m.xs[0].v, 'sửa');
  m = merge3(base, { xs: [r('a', 'sửa ở local'), r('b', 1)] }, { xs: [r('b', 1)] });  // remote xóa a nhưng local đã sửa a: giữ bản sửa
  assert.deepEqual(ids(m.xs), ['a', 'b']);
  assert.equal(m.xs.find((x) => x.id === 'a').v, 'sửa ở local');
});

test('merge3: một bên sửa thì lấy bên đó; cả hai sửa thì bản mới hơn thắng, không có dấu thời gian thì giữ bản máy này', () => {
  const base = { xs: [r('a', 1, '2026-01-01T00:00:00Z')] };
  let m = merge3(base, { xs: [r('a', 1, '2026-01-01T00:00:00Z')] }, { xs: [r('a', 'R', '2026-02-01T00:00:00Z')] });
  assert.equal(m.xs[0].v, 'R');
  m = merge3(base, { xs: [r('a', 'L', '2026-03-01T00:00:00Z')] }, { xs: [r('a', 'R', '2026-02-01T00:00:00Z')] });
  assert.equal(m.xs[0].v, 'L');
  m = merge3(base, { xs: [r('a', 'L', '2026-02-01T00:00:00Z')] }, { xs: [r('a', 'R', '2026-03-01T00:00:00Z')] });
  assert.equal(m.xs[0].v, 'R');
  m = merge3({ xs: [{ id: 'a', v: 0 }] }, { xs: [{ id: 'a', v: 'L' }] }, { xs: [{ id: 'a', v: 'R' }] });
  assert.equal(m.xs[0].v, 'L', 'không dấu thời gian: giữ máy này');
});

test('merge3: đối tượng lồng nhau, khóa thêm/xóa, giá trị thuần, mảng không có id', () => {
  const base = { a: { n: 1, list: [r('x', 1)] }, giaTri: 5, tags: ['u', 'v'], bo: 1 };
  const local = { a: { n: 1, list: [r('x', 1), r('y', 2)] }, giaTri: 6, tags: ['u', 'v'] };      // local: thêm y, đổi giaTri, xóa 'bo'
  const remote = { a: { n: 2, list: [r('x', 1)] }, giaTri: 5, tags: ['u', 'v', 'w'], moi: true, bo: 1 };   // remote: đổi n, thêm tags, khóa mới
  const m = merge3(base, local, remote);
  assert.equal(m.a.n, 2); assert.deepEqual(ids(m.a.list), ['x', 'y']);
  assert.equal(m.giaTri, 6); assert.deepEqual(m.tags, ['u', 'v', 'w']); assert.equal(m.moi, true);
  assert.ok(!('bo' in m), 'khóa bị xóa ở local và không đổi ở remote thì bị xóa');
});

test('merge3: gộp theo thứ tự nào cũng ra cùng tập bản ghi', () => {
  const base = { xs: [r('a', 1), r('b', 1), r('c', 1)] };
  const A = { xs: [r('a', 1), r('c', 1), r('d', 4)] };   // xóa b, thêm d
  const B = { xs: [r('a', 'B'), r('b', 1), r('c', 1), r('e', 5)] };   // sửa a, thêm e
  const m1 = merge3(base, A, B), m2 = merge3(base, B, A);
  assert.deepEqual(ids(m1.xs), ids(m2.xs));
  assert.deepEqual(ids(m1.xs), ['a', 'c', 'd', 'e']);
});

test('merge3: thứ tự khóa khác nhau (jsonb của máy chủ) vẫn coi là bằng nhau: xóa không sống lại', () => {
  const base = { xs: [{ id: 'a', v: 1, w: 2 }, { id: 'b', v: 1, w: 2 }] };
  const local = { xs: [{ id: 'b', v: 1, w: 2 }] };                        // local xóa a
  const remote = { xs: [{ w: 2, v: 1, id: 'a' }, { w: 2, id: 'b', v: 1 }] };  // máy chủ trả khóa theo thứ tự khác
  assert.deepEqual(ids(merge3(base, local, remote).xs), ['b']);
  assert.deepEqual(ids(merge3(base, remote, local).xs), ['b']);
});

// ---- vòng đồng bộ với máy chủ giả ----
function fakeServer() {
  const s = { version: 0, data: null, calls: [], failNextPut: 0, offline: false, status: null };
  s.fetch = async (url, opt) => {
    s.calls.push(opt.method);
    if (s.offline) throw new TypeError('fetch failed');
    if (s.status) return { ok: false, status: s.status, json: async () => ({ error: { code: 'x', message: 'lỗi' } }) };
    if (opt.method === 'GET') return { ok: true, status: 200, json: async () => ({ version: s.version, data: s.data }) };
    if (opt.method === 'DELETE') { s.version = 0; s.data = null; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    const b = JSON.parse(opt.body);
    if (s.failNextPut > 0) { s.failNextPut--; s.version++; s.data = { xs: [...(s.data ? s.data.xs : []), r('doi-thu', 1)] }; }
    if (b.baseVersion !== s.version) return { ok: false, status: 409, json: async () => ({ error: { code: 'conflict', message: 'x', details: { version: s.version, data: s.data } } }) };
    s.version++; s.data = b.data;
    return { ok: true, status: 200, json: async () => ({ version: s.version }) };
  };
  return s;
}
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
function device(srv, init) {
  const d = { data: init };
  d.sync = createSync({ app: 'car', getData: () => d.data, setData: async (x) => { d.data = x; }, storage: memStorage(), fetchFn: srv.fetch, now: () => new Date('2026-10-14T00:00:00Z') });
  return d;
}

test('createSync: hai máy đồng bộ qua nhau, xóa và thêm đều lan sang máy kia', async () => {
  const srv = fakeServer();
  const A = device(srv, { xs: [r('a', 1), r('b', 1)] }), B = device(srv, { xs: [] });
  await A.sync.run();                      // đẩy lần đầu
  await B.sync.run();                      // B kéo về
  assert.deepEqual(ids(B.data.xs), ['a', 'b']);
  B.data = { xs: [r('a', 1), r('c', 3)] }; // B xóa b, thêm c
  await B.sync.run();
  A.data = { xs: [...A.data.xs, r('d', 4)] };   // A thêm d (chưa biết B đã xóa b)
  await A.sync.run();
  assert.deepEqual(ids(A.data.xs), ['a', 'c', 'd']);
  await B.sync.run();
  assert.deepEqual(ids(B.data.xs), ['a', 'c', 'd']);
  assert.equal(A.sync.lastAt(), '2026-10-14T00:00:00.000Z');
});

test('createSync: gặp 409 thì đọc lại, gộp và thử lại; dữ liệu của bên kia không bị mất', async () => {
  const srv = fakeServer();
  const A = device(srv, { xs: [r('a', 1)] });
  await A.sync.run();
  srv.failNextPut = 1;                     // đúng lúc A ghi, máy khác chen vào thêm 'doi-thu'
  A.data = { xs: [r('a', 1), r('moi', 2)] };
  await A.sync.run();
  assert.deepEqual(ids(srv.data.xs), ['a', 'doi-thu', 'moi']);
  assert.deepEqual(ids(A.data.xs), ['a', 'doi-thu', 'moi']);
});

test('createSync: lỗi mạng và 401 báo mã lỗi rõ, dữ liệu trên máy không đổi', async () => {
  const srv = fakeServer();
  const A = device(srv, { xs: [r('a', 1)] });
  srv.offline = true;
  await assert.rejects(A.sync.run(), (e) => e.code === 'offline');
  srv.offline = false; srv.status = 401;
  await assert.rejects(A.sync.run(), (e) => e.status === 401);
  assert.equal(await A.sync.probe(), 'chua-dang-nhap');
  srv.status = 500; assert.equal(await A.sync.probe(), 'loi');
  srv.status = null; assert.equal(await A.sync.probe(), 'ok');
  assert.deepEqual(A.data, { xs: [r('a', 1)] });
});

test('createSync: bật/tắt, xóa bản trên máy chủ, tắt thì quên ảnh chụp', async () => {
  const srv = fakeServer();
  const A = device(srv, { xs: [r('a', 1)] });
  assert.equal(A.sync.enabled(), false);
  A.sync.enable(); assert.equal(A.sync.enabled(), true);
  await A.sync.run();
  assert.equal(srv.version, 1);
  await A.sync.deleteRemote(); assert.equal(srv.data, null);
  A.sync.disable(); assert.equal(A.sync.enabled(), false);
});
