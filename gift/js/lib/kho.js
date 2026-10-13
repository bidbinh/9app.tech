// Kho dữ liệu: IndexedDB trên máy, có bản sao trong bộ nhớ để đọc nhanh.
// Dữ liệu nhạy cảm (danh bạ người thân, số tiền phong bì) KHÔNG rời khỏi máy. IndexedDB bị chặn thì vẫn chạy bằng bộ nhớ tạm và báo cho người dùng.
// Chỗ chừa đồng bộ 9id: xem README ("Đồng bộ 9id"). Mọi bản ghi có id ổn định, taoLuc và suaLuc để sau này gộp được.
import { DIP_LE } from '../data/dip.js';
import { SU_KIEN_THEO_ID } from './le.js';
import { QUAN_HE } from '../data/dip.js';
import { hopLe, tachIso } from './ngay.js';

const TEN_DB = '9gift';
const PHIEN_BAN = 1;
export const KHO = ['people', 'entries', 'dates', 'gifts'];
export const VERSION_XUAT = 1;

const cache = { people: [], entries: [], dates: [], gifts: [] };
let caiDat = macDinhCaiDat();
let db = null;
let ben = false;
let loiGhi = '';
const nguoiNghe = new Set();
let hangDoi = Promise.resolve();

export function macDinhCaiDat() {
  return { dipBat: null, nhacTruoc: 3, anTien: false, daSaoLuu: null, taoLuc: new Date().toISOString() };
}
export const trangThaiKho = () => ({ ben, loiGhi });
export const onDoi = (fn) => { nguoiNghe.add(fn); return () => nguoiNghe.delete(fn); };
function phat() { for (const fn of [...nguoiNghe]) { try { fn(); } catch { /* người nghe lỗi không làm hỏng kho */ } } }

export const taoId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* dùng dự phòng */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

function moDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Không có IndexedDB')); return; }
    let rq;
    try { rq = globalThis.indexedDB.open(TEN_DB, PHIEN_BAN); } catch (e) { reject(e); return; }
    rq.onupgradeneeded = () => {
      const d = rq.result;
      for (const k of KHO) if (!d.objectStoreNames.contains(k)) d.createObjectStore(k, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error || new Error('Không mở được IndexedDB'));
    rq.onblocked = () => reject(new Error('IndexedDB bị chặn'));
  });
}
const tatCa = (store) => new Promise((resolve, reject) => {
  const rq = db.transaction(store, 'readonly').objectStore(store).getAll();
  rq.onsuccess = () => resolve(rq.result || []);
  rq.onerror = () => reject(rq.error);
});
function ghiDb(fn) {
  hangDoi = hangDoi.then(() => new Promise((resolve) => {
    if (!db) { resolve(); return; }
    try {
      const tx = db.transaction([...KHO, 'meta'], 'readwrite');
      fn(tx);
      tx.oncomplete = () => { loiGhi = ''; resolve(); };
      tx.onerror = () => { loiGhi = 'Không ghi được vào bộ nhớ trình duyệt. Hãy xuất bản sao lưu.'; phat(); resolve(); };
      tx.onabort = tx.onerror;
    } catch { loiGhi = 'Không ghi được vào bộ nhớ trình duyệt. Hãy xuất bản sao lưu.'; phat(); resolve(); }
  }));
  return hangDoi;
}

/** Mở kho và nạp dữ liệu. Không bao giờ ném lỗi: nếu IndexedDB hỏng thì dùng bộ nhớ tạm. */
export async function moKho() {
  try {
    db = await moDb();
    for (const k of KHO) cache[k] = await tatCa(k);
    const meta = await tatCa('meta');
    const cd = meta.find((m) => m.id === 'caiDat');
    if (cd && cd.gia) caiDat = { ...macDinhCaiDat(), ...cd.gia };
    ben = true;
    db.onversionchange = () => { try { db.close(); } catch { /* bỏ qua */ } };
  } catch {
    db = null; ben = false;
  }
  return ben;
}

export const layDs = (store) => cache[store];
export const layMot = (store, id) => cache[store].find((x) => x.id === id) || null;
export const layCaiDat = () => caiDat;

export function luu(store, obj) {
  const bay = new Date().toISOString();
  const b = { ...obj };
  if (!b.id) { b.id = taoId(); b.taoLuc = bay; }
  b.suaLuc = bay;
  const i = cache[store].findIndex((x) => x.id === b.id);
  if (i >= 0) cache[store][i] = b; else cache[store].push(b);
  ghiDb((tx) => tx.objectStore(store).put(b));
  phat();
  return b;
}
export function xoa(store, id) {
  const i = cache[store].findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [cu] = cache[store].splice(i, 1);
  ghiDb((tx) => tx.objectStore(store).delete(id));
  phat();
  return cu;
}
export function datCaiDat(phan) {
  caiDat = { ...caiDat, ...phan };
  ghiDb((tx) => tx.objectStore('meta').put({ id: 'caiDat', gia: caiDat }));
  phat();
}
export async function xoaSach() {
  for (const k of KHO) cache[k] = [];
  caiDat = macDinhCaiDat();
  await ghiDb((tx) => { for (const k of KHO) tx.objectStore(k).clear(); tx.objectStore('meta').clear(); });
  phat();
}

// ---------- Làm sạch dữ liệu nhập ----------
const chuoi = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
const so = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null; };
const ngayIso = (v) => (typeof v === 'string' && tachIso(v) ? v : null);
const idHopLe = (v) => (typeof v === 'string' && /^[\w.-]{1,64}$/.test(v) ? v : null);

function sinhSach(s) {
  if (!s || typeof s !== 'object') return null;
  const kieu = s.kieu === 'am' ? 'am' : 'duong';
  const ngay = so(s.ngay, 1, kieu === 'am' ? 30 : 31); const thang = so(s.thang, 1, 12);
  if (!ngay || !thang) return null;
  const nam = so(s.nam, 1800, 2200);
  if (kieu === 'duong' && !hopLe(nam || 2000, thang, ngay)) return null;
  return { kieu, ngay, thang, nam: nam || null, nhuan: kieu === 'am' && !!s.nhuan };
}

export const LAM_SACH = {
  people(r) {
    const id = idHopLe(r.id); const ten = chuoi(r.ten, 80);
    if (!id || !ten) return null;
    const qh = QUAN_HE.some((q) => q.id === r.quanHe) ? r.quanHe : 'khac';
    return { id, ten, cachGoi: chuoi(r.cachGoi, 40), quanHe: qh, nhom: chuoi(r.nhom, 40), sinh: sinhSach(r.sinh), ghiChu: chuoi(r.ghiChu, 600), sdt: chuoi(r.sdt, 20), nhacTruoc: so(r.nhacTruoc, 0, 60), taoLuc: chuoi(r.taoLuc, 40), suaLuc: chuoi(r.suaLuc, 40) };
  },
  entries(r) {
    const id = idHopLe(r.id); const ngay = ngayIso(r.ngay);
    if (!id || !ngay) return null;
    return {
      id, huong: r.huong === 'den' ? 'den' : 'di', ngay, personId: idHopLe(r.personId), tenNguoi: chuoi(r.tenNguoi, 80),
      suKien: SU_KIEN_THEO_ID[r.suKien] ? r.suKien : 'khac', soTien: so(r.soTien, 0, 1e12) ?? 0, qua: chuoi(r.qua, 200), ghiChu: chuoi(r.ghiChu, 600),
      khongDap: r.khongDap === true ? true : r.khongDap === false ? false : undefined, taoLuc: chuoi(r.taoLuc, 40), suaLuc: chuoi(r.suaLuc, 40),
    };
  },
  dates(r) {
    const id = idHopLe(r.id); const s = sinhSach({ kieu: r.kieu, ngay: r.ngay, thang: r.thang, nam: r.nam, nhuan: r.nhuan });
    if (!id || !s) return null;
    return { id, personId: idHopLe(r.personId), loai: ['gio', 'cuoi', 'kyNiem', 'khac', 'sinhNhat'].includes(r.loai) ? r.loai : 'khac', ten: chuoi(r.ten, 80), ...s, truoc: so(r.truoc, 0, 60), ghiChu: chuoi(r.ghiChu, 600), taoLuc: chuoi(r.taoLuc, 40), suaLuc: chuoi(r.suaLuc, 40) };
  },
  gifts(r) {
    const id = idHopLe(r.id); const ten = chuoi(r.ten, 120);
    if (!id || !ten) return null;
    return { id, personId: idHopLe(r.personId), trangThai: r.trangThai === 'da-tang' ? 'da-tang' : 'y-tuong', ten, dip: chuoi(r.dip, 30), ngay: ngayIso(r.ngay), ghiChu: chuoi(r.ghiChu, 400), taoLuc: chuoi(r.taoLuc, 40), suaLuc: chuoi(r.suaLuc, 40) };
  },
};

/** Đối tượng sao lưu. */
export function xuat() {
  return {
    app: '9gift', version: VERSION_XUAT, xuatLuc: new Date().toISOString(),
    caiDat: { ...caiDat, dipBat: caiDat.dipBat ? [...caiDat.dipBat] : null },
    people: cache.people, entries: cache.entries, dates: cache.dates, gifts: cache.gifts,
  };
}

/**
 * Nhập từ đối tượng JSON. che: 'gop' (giữ cái cũ, thêm/ghi đè theo id) hoặc 'thay' (xóa hết rồi nhập).
 * Làm sạch và kiểm TRƯỚC; 'thay' chỉ xóa khi có ít nhất một bản ghi hợp lệ.
 * @returns {{ok:boolean, loi?:string, them:number, boQua:number, daSua:number, lyDo:string[]}}
 */
export async function nhap(obj, che = 'gop') {
  const kq = (ok, loi, them = 0, boQua = 0, daSua = 0, lyDo = []) => ({ ok, loi, them, boQua, daSua, lyDo });
  if (!obj || typeof obj !== 'object' || obj.app !== '9gift') return kq(false, 'Tệp này không phải bản sao lưu của 9gift.');
  if (!Number.isInteger(obj.version) || obj.version > VERSION_XUAT) return kq(false, 'Bản sao lưu từ phiên bản mới hơn, hãy cập nhật ứng dụng.');
  const sach = { people: [], entries: [], dates: [], gifts: [] };
  let boQua = 0; let daSua = 0;
  const lyDo = new Set();
  for (const k of KHO) {
    const ds = Array.isArray(obj[k]) ? obj[k] : [];
    for (const r of ds.slice(0, 20000)) {
      const s = r && typeof r === 'object' ? LAM_SACH[k](r) : null;
      if (!s) { boQua++; lyDo.add(`${TEN_KHO[k]}: thiếu mã, thiếu tên hoặc ngày không hợp lệ`); continue; }
      if (k === 'entries') {
        const goc = Number(r.soTien);
        if (r.soTien !== undefined && r.soTien !== null && !(Number.isFinite(goc) && goc >= 0 && goc <= 1e12)) { daSua++; lyDo.add('số tiền âm hoặc quá lớn đã đổi thành 0 đồng'); }
      }
      sach[k].push(s);
    }
  }
  const tong = KHO.reduce((n, k) => n + sach[k].length, 0);
  if (!tong) return kq(false, 'Tệp không có bản ghi hợp lệ nào, dữ liệu hiện có được giữ nguyên.', 0, boQua, daSua, [...lyDo]);
  if (che === 'thay') await xoaSach();
  for (const k of KHO) for (const s of sach[k]) luu(k, s);
  if (obj.caiDat && typeof obj.caiDat === 'object' && che === 'thay') {
    const c = obj.caiDat;
    datCaiDat({
      dipBat: Array.isArray(c.dipBat) ? c.dipBat.filter((x) => DIP_LE.some((d) => d.id === x)) : null,
      nhacTruoc: so(c.nhacTruoc, 0, 60) ?? 3, anTien: !!c.anTien, daSaoLuu: chuoi(c.daSaoLuu, 40) || null,
    });
  }
  return kq(true, undefined, tong, boQua, daSua, [...lyDo]);
}
const TEN_KHO = { people: 'danh bạ', entries: 'khoản lễ', dates: 'ngày quan trọng', gifts: 'quà' };
export const daDanhDauSaoLuu = () => datCaiDat({ daSaoLuu: new Date().toISOString() });
