// Lưu dữ liệu trên máy bằng IndexedDB (kho khóa-giá trị), có bộ nhớ đệm và dự phòng trong bộ nhớ khi trình duyệt chặn.
// Mọi thao tác bọc try/catch: nếu IndexedDB không dùng được, app vẫn chạy nhưng dữ liệu mất khi đóng trang (có cảnh báo).
const TEN_DB = '9fit';
const KHO = 'kv';
export const KHOA = ['sangloc', 'caidat', 'buoi', 'choi', 'dodac', 'muctieu', 'test', 'kehoach', 'nhap'];
export const PHIEN_BAN = 1;

import { lamSachMang, kehoach as lamSachKeHoach } from './schema.js';

const dem = new Map();
let db = null;
let baoLoi = null;
/** Đăng ký hàm được gọi khi ghi IndexedDB thất bại (để hiện cảnh báo toàn cục). */
export const datBaoLoi = (f) => { baoLoi = f; };
const loiGhi = () => { const truoc = trangThai.luuBen; trangThai.luuBen = false; if (truoc) { try { baoLoi?.(); } catch { /* bỏ qua */ } } };
export const trangThai = { luuBen: false, loi: '' };

function moDB() {
  return new Promise((ok, loi) => {
    let r;
    try { r = globalThis.indexedDB.open(TEN_DB, 1); } catch (e) { loi(e); return; }
    r.onupgradeneeded = () => { try { r.result.createObjectStore(KHO); } catch { /* đã có */ } };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => loi(r.error);
    r.onblocked = () => loi(new Error('bị chặn'));
    setTimeout(() => loi(new Error('IndexedDB không phản hồi')), 4000);
  });
}

export async function khoiTao() {
  try {
    db = await moDB();
    await new Promise((ok, loi) => {
      const tx = db.transaction(KHO, 'readonly');
      const cur = tx.objectStore(KHO).openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { dem.set(c.key, c.value); c.continue(); } };
      tx.oncomplete = ok; tx.onerror = () => loi(tx.error); tx.onabort = () => loi(tx.error);
    });
    trangThai.luuBen = true;
  } catch (e) {
    db = null; trangThai.luuBen = false; trangThai.loi = String(e?.message || e);
  }
}

const sao = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
export function doc(khoa, macDinh) {
  return dem.has(khoa) ? sao(dem.get(khoa)) : macDinh;
}

let hangDoi = Promise.resolve();
export function ghi(khoa, giaTri) {
  dem.set(khoa, sao(giaTri));
  if (!db) { loiGhi(); return Promise.resolve(false); }
  hangDoi = hangDoi.then(() => new Promise((ok) => {
    try {
      const tx = db.transaction(KHO, 'readwrite');
      tx.objectStore(KHO).put(sao(giaTri), khoa);
      tx.oncomplete = () => ok(true);
      tx.onerror = () => { loiGhi(); ok(false); };
      tx.onabort = () => { loiGhi(); ok(false); };
    } catch { loiGhi(); ok(false); }
  }));
  return hangDoi;
}
export function xongGhi() { return hangDoi; }

export function bo(khoa) {
  dem.delete(khoa);
  if (!db) return Promise.resolve();
  hangDoi = hangDoi.then(() => new Promise((ok) => {
    try {
      const tx = db.transaction(KHO, 'readwrite');
      tx.objectStore(KHO).delete(khoa);
      tx.oncomplete = () => ok(); tx.onerror = () => ok(); tx.onabort = () => ok();
    } catch { ok(); }
  }));
  return hangDoi;
}

export async function xoaTatCa() {
  for (const k of [...dem.keys()]) dem.delete(k);
  if (!db) return;
  hangDoi = hangDoi.then(() => new Promise((ok) => {
    try {
      const tx = db.transaction(KHO, 'readwrite');
      tx.objectStore(KHO).clear();
      tx.oncomplete = () => ok(); tx.onerror = () => ok(); tx.onabort = () => ok();
    } catch { ok(); }
  }));
  await hangDoi;
}

/** Gói dữ liệu để sao lưu (JSON). */
export function xuat(now = new Date()) {
  const du = {};
  for (const k of KHOA) if (dem.has(k)) du[k] = sao(dem.get(k));
  return { ungDung: '9fit', phienBan: PHIEN_BAN, xuatLuc: now.toISOString(), duLieu: du };
}

const LA_MANG = new Set(['buoi', 'choi', 'dodac', 'test']);
const LA_DOI_TUONG = new Set(['sangloc', 'caidat', 'muctieu', 'kehoach', 'nhap']);

/** Kiểm tra gói nhập. Trả về { ok, loi, soMuc }. */
export function kiemTraGoi(goi) {
  if (!goi || typeof goi !== 'object' || goi.ungDung !== '9fit') return { ok: false, loi: 'Đây không phải tệp sao lưu của 9fit.' };
  if (!Number.isInteger(goi.phienBan) || goi.phienBan > PHIEN_BAN) return { ok: false, loi: 'Tệp từ phiên bản mới hơn, hãy cập nhật 9fit.' };
  const du = goi.duLieu;
  if (!du || typeof du !== 'object' || Array.isArray(du)) return { ok: false, loi: 'Tệp thiếu phần dữ liệu.' };
  let soMuc = 0; let bo = 0;
  const sach = {};
  for (const [k, v] of Object.entries(du)) {
    if (!KHOA.includes(k)) continue;
    if (LA_MANG.has(k) && !Array.isArray(v)) return { ok: false, loi: `Mục "${k}" sai định dạng.` };
    if (LA_DOI_TUONG.has(k) && (v === null || typeof v !== 'object' || Array.isArray(v))) return { ok: false, loi: `Mục "${k}" sai định dạng.` };
    if (LA_MANG.has(k)) { const r = lamSachMang(k, v); sach[k] = r.ds; soMuc += r.ds.length; bo += r.bo; } else if (k === 'kehoach') {
      const kh = lamSachKeHoach(v);
      if (!kh) { bo++; } else sach[k] = kh;
    } else sach[k] = v;
  }
  return { ok: true, soMuc, bo, sach };
}

/** Thay toàn bộ dữ liệu bằng gói đã kiểm tra. */
export async function nhap(goi) {
  const kt = kiemTraGoi(goi);
  if (!kt.ok) throw new Error(kt.loi);
  await xoaTatCa();
  for (const k of KHOA) if (k in kt.sach) await ghi(k, kt.sach[k]);
  return kt;
}
