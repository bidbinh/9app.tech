// Đồng bộ dữ liệu app qua tài khoản 9id (spec docs/superpowers/specs/2026-10-14-dong-bo-9id-design.md).
// Thư viện ES module, không phụ thuộc DOM; mỗi app chép nguyên tệp này vào js/lib/nine-sync.js (nguồn gốc: 9id/public/nine-sync.mjs).
// Gộp ba chiều theo bản ghi ở máy khách; máy chủ chỉ lưu một tài liệu JSON có số phiên bản.

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// So sánh giá trị theo nội dung, KHÔNG phụ thuộc thứ tự khóa (máy chủ lưu jsonb nên trả khóa theo thứ tự khác)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : isPlain(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const isIdArray = (v) => Array.isArray(v) && v.every((o) => isPlain(o) && typeof o.id === 'string' && o.id !== '');
const TS = ['capNhat', 'suaLuc', 'updatedAt', 'capnhat', 'updated_at'];
const stamp = (o) => { if (!isPlain(o)) return 0; for (const k of TS) { const t = Date.parse(o[k]); if (Number.isFinite(t)) return t; } return 0; };

// Hai bên cùng sửa một giá trị so với bản gốc: bản có dấu thời gian mới hơn thắng; không có/hòa thì theo `pref`
// ('local' = bản của máy đang đồng bộ; 'remote' = bản trên máy chủ, dùng ở lần đồng bộ đầu để máy mới mang giá trị mặc định không ghi đè dữ liệu đã có).
function pickBoth(l, r, pref) { const sl = stamp(l), sr = stamp(r); if (sr !== sl) return sr > sl ? r : l; return pref === 'remote' ? r : l; }

function mergeValue(b, l, r, o) {
  if (same(l, r)) return l;
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  return pickBoth(l, r, o.pref);
}

function mergeRecords(b, l, r, o) {
  const idx = (arr) => { const m = new Map(); for (const x of arr || []) m.set(x.id, x); return m; };
  const B = idx(b), L = idx(l), R = idx(r);
  const out = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return; seen.add(id);
    const bi = B.get(id), li = L.get(id), ri = R.get(id);
    if (li && ri) { out.push(mergeValue(bi, li, ri, o)); return; }
    if (li) { if (bi && same(li, bi)) return; out.push(li); return; }      // bên kia đã xóa: xóa, trừ khi máy này đã sửa
    if (ri) { if (bi && same(ri, bi)) return; out.push(ri); }             // máy này đã xóa: xóa, trừ khi bên kia đã sửa
  };
  for (const x of l || []) visit(x.id);
  for (const x of r || []) visit(x.id);
  return out;
}

// merge3(base, local, remote, { pref }) -> dữ liệu đã gộp. base null/undefined: lần đầu, hợp hai bên, không suy ra việc xóa.
export function merge3(base, local, remote, opts = {}) {
  const o = { pref: opts.pref === 'remote' ? 'remote' : 'local' };
  if (isPlain(local) && isPlain(remote)) {
    const b = isPlain(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const k of keys) {
      const has = (x) => Object.prototype.hasOwnProperty.call(x, k);
      const inL = has(local), inR = has(remote), inB = has(b);
      if (inL && inR) { out[k] = merge3(b[k], local[k], remote[k], o); continue; }
      if (inL) { if (inB && same(local[k], b[k])) continue; out[k] = local[k]; continue; }   // bên kia xóa khóa này
      if (inB && same(remote[k], b[k])) continue;                                            // máy này xóa khóa này
      out[k] = remote[k];
    }
    return out;
  }
  const bOk = (x) => x === undefined || x === null;
  if (isIdArray(local) && isIdArray(remote) && (bOk(base) || isIdArray(base))) return mergeRecords(base, local, remote, o);
  // mảng không có id nhưng cùng độ dài (ví dụ 12 tháng): gộp theo vị trí, để hai máy sửa hai phần tử khác nhau không mất một bên
  if (Array.isArray(local) && Array.isArray(remote) && local.length === remote.length && local.length > 0 && (bOk(base) || (Array.isArray(base) && base.length === local.length))) {
    return local.map((x, i) => merge3(bOk(base) ? undefined : base[i], x, remote[i], o));
  }
  return mergeValue(base, local, remote, o);
}

// Số bản ghi (phần tử của mảng bản ghi có id) trong một tài liệu: dùng cho chốt an toàn chống mất dữ liệu hàng loạt
export function countRecords(v) {
  if (Array.isArray(v)) return isIdArray(v) ? v.length : v.reduce((n, x) => n + countRecords(x), 0);
  if (isPlain(v)) return Object.values(v).reduce((n, x) => n + countRecords(x), 0);
  return 0;
}

const keyOf = (app, what) => `nine_sync_${app}_${what}`;
const loi = (code, message) => { const e = new Error(message); e.code = code; return e; };

// createSync({ app, getData, setData, sanSang, api, storage, fetchFn, now })
//  - getData(): object thuần của app (đã loại phần không đồng bộ: ảnh, sức khỏe nhạy cảm)
//  - setData(merged): ghi bản đã gộp về máy (app tự lo lưu bền và vẽ lại)
//  - sanSang(): false khi app đang chạy bằng bộ nhớ tạm (trình duyệt chặn lưu): không đồng bộ để dữ liệu rỗng không bị hiểu là "đã xóa hết"
//  - api: tiền tố đường dẫn, mặc định '/id/api/sync/'
// Mã lỗi: offline, busy, khong-luu-ben, khac-tai-khoan (đã tắt đồng bộ), da-xoa-o-may-khac (đã tắt đồng bộ), mat-nhieu, khong-luu-nho, hoặc lỗi HTTP (status).
export function createSync({ app, getData, setData, sanSang = () => true, api = '/id/api/sync/', storage = (typeof localStorage !== 'undefined' ? localStorage : null), fetchFn = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), now = () => new Date() }) {
  const get = (k) => { try { return storage ? storage.getItem(keyOf(app, k)) : null; } catch { return null; } };
  const set = (k, v) => { try { if (storage) { if (v === null || v === undefined) storage.removeItem(keyOf(app, k)); else storage.setItem(keyOf(app, k), v); } } catch { /* bộ nhớ đầy hoặc bị chặn: kiểm lại ở nơi cần */ } };
  const meUrl = api.replace(/sync\/?$/, '') + 'me';
  const call = async (method, body) => {
    const headers = { accept: 'application/json' };
    if (method !== 'GET') { headers['x-requested-with'] = '9id'; headers['content-type'] = 'application/json'; }
    let r;
    try { r = await fetchFn(api + app, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw loi('offline', 'Không kết nối được mạng'); }
    let j = null; try { j = await r.json(); } catch { /* không phải JSON */ }
    if (r.ok) return j;
    const e = new Error((j && j.error && j.error.message) || 'Có lỗi xảy ra');
    e.status = r.status; e.code = (j && j.error && j.error.code) || 'error'; e.details = j && j.error && j.error.details;
    throw e;
  };
  // GET <api>/../me luôn 200 (user:null khi chưa đăng nhập) nên người chưa đăng nhập không sinh lỗi 401 trong console
  const who = async () => {
    let r;
    try { r = await fetchFn(meUrl, { method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' } }); } catch { throw loi('offline', 'Không kết nối được mạng'); }
    if (!r.ok) { const e = new Error('Dịch vụ tài khoản chưa sẵn sàng'); e.status = r.status; e.code = 'error'; throw e; }
    let j = null; try { j = await r.json(); } catch { /* */ }
    return j && j.user && j.user.id ? String(j.user.id) : null;
  };

  const s = {
    enabled: () => get('on') === '1',
    enable() { set('on', '1'); },
    // tắt đồng bộ: giữ dữ liệu trên máy; quên ảnh chụp để lần bật sau gộp như lần đầu
    disable() { for (const k of ['on', 'base', 'ver', 'epoch', 'uid']) set(k, null); },
    lastAt: () => get('at'),
    // trạng thái đăng nhập: 'ok' | 'chua-dang-nhap' | 'loi'
    async probe() {
      try { return (await who()) ? 'ok' : 'chua-dang-nhap'; } catch { return 'loi'; }
    },
    async deleteRemote() { await call('DELETE'); for (const k of ['base', 'ver', 'epoch']) set(k, null); },
    // chạy một vòng đồng bộ; trả { changedLocal, version }
    async run() {
      if (!sanSang()) throw loi('khong-luu-ben', 'Trình duyệt đang không lưu bền dữ liệu, chưa đồng bộ để tránh làm mất dữ liệu.');
      const uid = await who();
      if (!uid) { const e = new Error('Chưa đăng nhập'); e.status = 401; e.code = 'unauthorized'; throw e; }
      const was = get('uid');
      if (was && was !== uid) { s.disable(); throw loi('khac-tai-khoan', 'Trình duyệt này đã đồng bộ với một tài khoản khác. Đồng bộ đã tắt, hãy bật lại nếu bạn muốn dùng tài khoản này.'); }
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await call('GET');
        const ver = Number(get('ver') || 0);
        if (!remote.data && ver > 0) { s.disable(); throw loi('da-xoa-o-may-khac', 'Bản trên máy chủ đã bị xóa từ một máy khác. Đồng bộ đã tắt trên máy này, dữ liệu trên máy giữ nguyên.'); }
        let base = null; try { base = JSON.parse(get('base') || 'null'); } catch { base = null; }
        if (base && remote.data && get('epoch') && remote.epoch && remote.epoch !== get('epoch')) base = null;   // tài liệu đã được tạo lại: ảnh chụp cũ vô giá trị
        const first = !base;
        const local = getData();
        const merged = remote.data ? merge3(base, local, remote.data, { pref: first ? 'remote' : 'local' }) : local;
        if (remote.data && !first) {
          const rc = countRecords(remote.data), mc = countRecords(merged);
          if (rc >= 5 && mc < rc * 0.5) throw loi('mat-nhieu', 'Lần đồng bộ này sẽ làm mất hơn một nửa số bản ghi, nên đã dừng lại. Hãy kiểm tra dữ liệu trên máy; nếu muốn bắt đầu lại, tắt đồng bộ rồi bật lại.');
        }
        let put;
        try { put = await call('PUT', { baseVersion: remote.version, data: merged }); }
        catch (e) {
          if (e.status !== 409) throw e;
          continue;   // máy khác vừa ghi: đọc lại và gộp tiếp (gộp từ bản gốc cũ nên vẫn đúng)
        }
        // ghi nhớ trạng thái đồng bộ TRƯỚC khi áp dụng về máy: giao diện vẽ lại khi áp dụng sẽ thấy giờ đồng bộ mới
        const prev = { base: get('base'), ver: get('ver'), at: get('at'), epoch: get('epoch'), uid: get('uid') };
        const baseStr = JSON.stringify(merged);
        set('base', baseStr); set('ver', String(put.version)); set('epoch', put.epoch || null); set('uid', uid); set('at', now().toISOString());
        if (get('base') !== baseStr) throw loi('khong-luu-nho', 'Không ghi nhớ được trạng thái đồng bộ (bộ nhớ trình duyệt đầy hoặc bị chặn).');
        // người dùng có thể đã sửa dữ liệu trong lúc chờ mạng: giữ bản sửa đó (gộp lại), lần đồng bộ sau sẽ đẩy lên
        const cur = getData();
        const final = same(cur, local) ? merged : merge3(local, cur, merged, { pref: 'local' });
        const changedLocal = !same(final, cur);
        if (changedLocal) {
          try { await setData(final); }
          catch (e) { for (const k of Object.keys(prev)) set(k, prev[k]); throw e; }   // không áp dụng được: quay lại ảnh chụp cũ để lần sau không hiểu nhầm là đã xóa
        }
        return { changedLocal, version: put.version };
      }
      throw loi('busy', 'Dữ liệu đang được máy khác ghi liên tục, thử lại sau');
    },
  };
  return s;
}
