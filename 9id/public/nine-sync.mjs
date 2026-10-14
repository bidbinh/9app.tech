// Đồng bộ dữ liệu app qua tài khoản 9id (spec docs/superpowers/specs/2026-10-14-dong-bo-9id-design.md).
// Thư viện ES module, không phụ thuộc DOM; mỗi app chép nguyên tệp này vào js/lib/nine-sync.js (nguồn gốc: 9id/public/nine-sync.mjs).
// Gộp ba chiều theo bản ghi ở máy khách; máy chủ chỉ lưu một tài liệu JSON có số phiên bản.

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isIdArray = (v) => Array.isArray(v) && v.every((o) => isPlain(o) && typeof o.id === 'string' && o.id !== '');
const TS = ['capNhat', 'suaLuc', 'updatedAt', 'capnhat', 'updated_at'];
const stamp = (o) => { if (!isPlain(o)) return 0; for (const k of TS) { const t = Date.parse(o[k]); if (Number.isFinite(t)) return t; } return 0; };

// Hai bên cùng sửa một giá trị so với bản gốc: bản có dấu thời gian mới hơn thắng; không có/hòa thì giữ bản của máy này.
function pickBoth(l, r) { return stamp(r) > stamp(l) ? r : l; }

// Gộp một giá trị (nguyên khối) khi mỗi bên có thể thiếu: trả { keep, value }.
function mergeValue(b, l, r) {
  if (same(l, r)) return l;
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  return pickBoth(l, r);
}

function mergeRecords(b, l, r) {
  const idx = (arr) => { const m = new Map(); for (const o of arr || []) m.set(o.id, o); return m; };
  const B = idx(b), L = idx(l), R = idx(r);
  const out = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return; seen.add(id);
    const bi = B.get(id), li = L.get(id), ri = R.get(id);
    if (li && ri) { out.push(mergeValue(bi, li, ri)); return; }
    if (li) { if (bi && same(li, bi)) return; out.push(li); return; }      // bên kia đã xóa: xóa, trừ khi máy này đã sửa
    if (ri) { if (bi && same(ri, bi)) return; out.push(ri); }             // máy này đã xóa: xóa, trừ khi bên kia đã sửa
  };
  for (const o of l || []) visit(o.id);
  for (const o of r || []) visit(o.id);
  return out;
}

// merge3(base, local, remote) -> dữ liệu đã gộp. base có thể là null/undefined (lần đầu: hợp hai bên, không suy ra việc xóa).
export function merge3(base, local, remote) {
  if (isPlain(local) && isPlain(remote)) {
    const b = isPlain(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const k of keys) {
      const inL = Object.prototype.hasOwnProperty.call(local, k), inR = Object.prototype.hasOwnProperty.call(remote, k);
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      if (inL && inR) { out[k] = merge3(b[k], local[k], remote[k]); continue; }
      if (inL) { if (inB && same(local[k], b[k])) continue; out[k] = local[k]; continue; }   // bên kia xóa khóa này
      if (inB && same(remote[k], b[k])) continue;                                            // máy này xóa khóa này
      out[k] = remote[k];
    }
    return out;
  }
  if (isIdArray(local) && isIdArray(remote) && (base === undefined || base === null || isIdArray(base))) return mergeRecords(base, local, remote);
  return mergeValue(base, local, remote);
}

const keyOf = (app, what) => `nine_sync_${app}_${what}`;

// createSync({ app, getData, setData, api, storage, fetchFn, now })
//  - getData(): object thuần của app (đã loại phần không đồng bộ: ảnh, sức khỏe nhạy cảm)
//  - setData(merged): ghi bản đã gộp về máy (app tự lo lưu bền và vẽ lại)
//  - api: tiền tố đường dẫn, mặc định '/id/api/sync/'
export function createSync({ app, getData, setData, api = '/id/api/sync/', storage = (typeof localStorage !== 'undefined' ? localStorage : null), fetchFn = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), now = () => new Date() }) {
  const get = (k) => { try { return storage ? storage.getItem(keyOf(app, k)) : null; } catch { return null; } };
  const set = (k, v) => { try { if (storage) { if (v === null) storage.removeItem(keyOf(app, k)); else storage.setItem(keyOf(app, k), v); } } catch { /* bộ nhớ đầy hoặc bị chặn: bỏ qua */ } };
  const call = async (method, body) => {
    const headers = { accept: 'application/json' };
    if (method !== 'GET') { headers['x-requested-with'] = '9id'; headers['content-type'] = 'application/json'; }
    let r;
    try { r = await fetchFn(api + app, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { const e = new Error('Không kết nối được mạng'); e.code = 'offline'; throw e; }
    let j = null; try { j = await r.json(); } catch { /* không phải JSON */ }
    if (r.ok) return j;
    const e = new Error((j && j.error && j.error.message) || 'Có lỗi xảy ra');
    e.status = r.status; e.code = (j && j.error && j.error.code) || 'error'; e.details = j && j.error && j.error.details;
    throw e;
  };

  const api_ = {
    enabled: () => get('on') === '1',
    enable() { set('on', '1'); },
    // tắt đồng bộ: giữ dữ liệu trên máy; quên ảnh chụp để lần bật sau gộp như lần đầu
    disable() { set('on', null); set('base', null); set('ver', null); },
    lastAt: () => get('at'),
    // trạng thái đăng nhập: 'ok' | 'chua-dang-nhap' | 'loi'
    async probe() {
      try { await call('GET'); return 'ok'; } catch (e) { return e.status === 401 ? 'chua-dang-nhap' : 'loi'; }
    },
    async deleteRemote() { await call('DELETE'); set('base', null); set('ver', null); },
    // chạy một vòng đồng bộ; trả { changedLocal, version }
    async run() {
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await call('GET');
        let base = null; try { base = JSON.parse(get('base') || 'null'); } catch { base = null; }
        const local = getData();
        const merged = remote.data ? merge3(base, local, remote.data) : local;
        const changedLocal = !same(merged, local);
        if (changedLocal) await setData(merged);
        try {
          const put = await call('PUT', { baseVersion: remote.version, data: merged });
          set('base', JSON.stringify(merged)); set('ver', String(put.version)); set('at', now().toISOString());
          return { changedLocal, version: put.version };
        } catch (e) {
          if (e.status !== 409) throw e;
          // máy khác vừa ghi: vòng lặp đọc lại và gộp tiếp; dữ liệu đã gộp về máy ở trên vẫn đúng (gộp có tính kết hợp)
        }
      }
      const e = new Error('Dữ liệu đang được máy khác ghi liên tục, thử lại sau'); e.code = 'busy'; throw e;
    },
  };
  return api_;
}
