// Lưu dữ liệu CHỈ trên máy: IndexedDB (một tài liệu 'state'), có bọc try/catch; nếu trình duyệt chặn thì giữ tạm trong bộ nhớ
// và báo cho người dùng biết để họ xuất tệp JSON. Không gửi dữ liệu đi đâu.
// Chừa chỗ đồng bộ 9id: xem README (mục "Đồng bộ 9id sau này"). Toàn bộ trạng thái nằm trong một đối tượng JSON thuần.
import { MAU_HU } from './spend.js';

export const PHIEN_BAN = 1;
const DB_TEN = '9payday';
const KHO = 'kv';
const KHOA = 'state';

export function macDinh() {
  return {
    v: PHIEN_BAN,
    hoso: { net: 0, ngayLuong: 1 },
    luong: {
      che: 'gross', gross: 0, net: 0, vung: 1, phuThuoc: 0, dongBH: true, luongDongBH: 0,
      anTrua: 0, phuCapKhac: 0, otThuong: 0, otNghi: 0, otLe: 0, thuong: 0, huuTri: 0, quyDinh: 'moi', thang: '',
    },
    hu: { mau: '4-hu', tyLe: { ...MAU_HU['4-hu'].hu } },
    coDinh: [], chi: [], mucTieu: [], vay: [], lich: [],
    quyetToan: { nam: 2026, thang: Array.from({ length: 12 }, () => ({ gross: 0, thuong: 0 })), daKhauTru: null, checklist: {} },
    tuyChon: { chuLon: false, daXemGioiThieu: false },
  };
}

const laObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const chuoi = (x, max = 120) => String(x ?? '').slice(0, max);
const mang = (x) => (Array.isArray(x) ? x : []);
const RE_NGAY = /^\d{4}-\d{2}-\d{2}$/;

/** Làm sạch một trạng thái đọc từ đĩa hoặc tệp nhập: ép kiểu, bỏ phần tử hỏng, bổ sung phần thiếu. */
export function lamSach(raw) {
  const d = macDinh();
  if (!laObj(raw)) return d;
  const o = d;
  if (laObj(raw.hoso)) { o.hoso.net = Math.max(0, num(raw.hoso.net)); o.hoso.ngayLuong = raw.hoso.ngayLuong === 'cuoi' ? 'cuoi' : Math.min(31, Math.max(1, Math.round(num(raw.hoso.ngayLuong, 1)))); }
  if (laObj(raw.luong)) {
    const l = raw.luong;
    for (const k of ['gross', 'net', 'luongDongBH', 'anTrua', 'phuCapKhac', 'otThuong', 'otNghi', 'otLe', 'thuong', 'huuTri']) o.luong[k] = Math.max(0, num(l[k]));
    o.luong.che = l.che === 'net' ? 'net' : 'gross';
    o.luong.vung = Math.min(4, Math.max(1, Math.round(num(l.vung, 1))));
    o.luong.phuThuoc = Math.min(20, Math.max(0, Math.round(num(l.phuThuoc))));
    o.luong.dongBH = l.dongBH !== false;
    o.luong.quyDinh = l.quyDinh === 'cu' ? 'cu' : 'moi';
    o.luong.thang = /^\d{4}-\d{2}$/.test(l.thang || '') ? l.thang : '';
  }
  if (laObj(raw.hu) && laObj(raw.hu.tyLe)) {
    const t = {};
    for (const [k, v] of Object.entries(raw.hu.tyLe)) if (k in { 'thiet-yeu': 1, 'huong-thu': 1, 'giao-duc': 1, 'cho-di': 1, 'tiet-kiem': 1, 'dau-tu': 1 }) t[k] = Math.min(100, Math.max(0, num(v)));
    if (Object.keys(t).length) { o.hu.tyLe = t; o.hu.mau = chuoi(raw.hu.mau, 20); }
  }
  o.coDinh = mang(raw.coDinh).filter(laObj).map((x) => ({ id: chuoi(x.id, 40) || moiId(), ten: chuoi(x.ten, 60), soTien: Math.max(0, num(x.soTien)), hu: chuoi(x.hu, 20) || 'thiet-yeu' })).slice(0, 200);
  o.chi = mang(raw.chi).filter((x) => laObj(x) && RE_NGAY.test(x.ngay || '') && num(x.soTien) > 0).map((x) => ({ id: chuoi(x.id, 40) || moiId(), ngay: x.ngay, soTien: Math.round(num(x.soTien)), dm: chuoi(x.dm, 20) || 'khac', hu: x.hu ? chuoi(x.hu, 20) : undefined })).slice(0, 20000);
  o.mucTieu = mang(raw.mucTieu).filter(laObj).map((x) => ({ id: chuoi(x.id, 40) || moiId(), ten: chuoi(x.ten, 60), mucTieu: Math.max(0, num(x.mucTieu)), daCo: Math.max(0, num(x.daCo)), han: RE_NGAY.test(x.han || '') ? x.han : '', laiNam: Math.max(0, num(x.laiNam, 5)) })).slice(0, 100);
  o.vay = mang(raw.vay).filter(laObj).map((x) => ({ id: chuoi(x.id, 40) || moiId(), ten: chuoi(x.ten, 60), soTien: Math.max(0, num(x.soTien)), laiNam: Math.max(0, num(x.laiNam)), soThang: Math.max(1, Math.round(num(x.soThang, 12))), kieu: x.kieu === 'goc-deu' ? 'goc-deu' : x.kieu === 'lai-phang' ? 'lai-phang' : 'niemkim' })).slice(0, 100);
  o.lich = mang(raw.lich).filter(laObj).map((x) => ({
    id: chuoi(x.id, 40) || moiId(), ten: chuoi(x.ten, 80), loai: ['the', 'vay', 'khac', 'thue'].includes(x.loai) ? x.loai : 'khac',
    ngay: RE_NGAY.test(x.ngay || '') ? x.ngay : '', lap: x.lap === 'thang' ? 'thang' : 'khong', nhacTruoc: Math.min(30, Math.max(0, Math.round(num(x.nhacTruoc, 1)))), soTien: Math.max(0, num(x.soTien)),
  })).filter((x) => x.ten && x.ngay).slice(0, 200);
  if (laObj(raw.quyetToan)) {
    const q = raw.quyetToan;
    o.quyetToan.nam = Math.min(2100, Math.max(2020, Math.round(num(q.nam, 2026))));
    o.quyetToan.thang = Array.from({ length: 12 }, (_, i) => ({ gross: Math.max(0, num(q.thang?.[i]?.gross)), thuong: Math.max(0, num(q.thang?.[i]?.thuong)) }));
    o.quyetToan.daKhauTru = q.daKhauTru === null || q.daKhauTru === undefined || q.daKhauTru === '' ? null : Math.max(0, num(q.daKhauTru));
    if (laObj(q.checklist)) for (const [k, v] of Object.entries(q.checklist)) o.quyetToan.checklist[chuoi(k, 30)] = !!v;
  }
  if (laObj(raw.tuyChon)) { o.tuyChon.chuLon = !!raw.tuyChon.chuLon; o.tuyChon.daXemGioiThieu = !!raw.tuyChon.daXemGioiThieu; }
  return o;
}

export function moiId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Trạng thái trong bộ nhớ ----------
let st = macDinh();
let db = null;
let timer = null;
export const luu = { ok: true, loi: '', daLuuLuc: 0 };
const nguoiNghe = new Set();

export const layState = () => st;
export function theoDoi(fn) { nguoiNghe.add(fn); return () => nguoiNghe.delete(fn); }
const phat = () => nguoiNghe.forEach((f) => { try { f(st); } catch { /* một màn hình lỗi không làm hỏng các màn khác */ } });

function moDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Trình duyệt không có IndexedDB'));
    let req;
    try { req = globalThis.indexedDB.open(DB_TEN, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => { req.result.createObjectStore(KHO); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không mở được IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB bị chặn'));
  });
}
const giaoDich = (mode, fn) => new Promise((resolve, reject) => {
  try {
    const tx = db.transaction(KHO, mode);
    const r = fn(tx.objectStore(KHO));
    tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy'));
  } catch (e) { reject(e); }
});

/** Mở kho và nạp dữ liệu. Không bao giờ ném lỗi: nếu hỏng thì chạy bằng bộ nhớ tạm. */
export async function khoiDong() {
  try {
    db = await moDB();
    const raw = await giaoDich('readonly', (s) => s.get(KHOA));
    st = lamSach(raw);
    luu.ok = true; luu.loi = '';
  } catch (e) {
    db = null; st = macDinh();
    luu.ok = false; luu.loi = 'Trình duyệt này không cho lưu dữ liệu (chế độ riêng tư hoặc đã chặn). Dữ liệu chỉ còn trong phiên này. Hãy dùng "Dữ liệu của tôi" để xuất tệp trước khi đóng.';
  }
  return st;
}

async function ghiXuong() {
  if (!db) return;
  try {
    await giaoDich('readwrite', (s) => s.put(JSON.parse(JSON.stringify(st)), KHOA));
    luu.ok = true; luu.loi = ''; luu.daLuuLuc = Date.now();
  } catch (e) {
    console.warn('ghiXuong lỗi:', e && (e.name + ' ' + e.message));
    luu.ok = false; luu.loi = 'Không ghi được dữ liệu (có thể máy hết dung lượng). Hãy xuất tệp sao lưu.';
    phat();
  }
}

/** Sửa trạng thái: gọi fn(st) rồi lưu (gộp các lần sửa liên tiếp trong 200 ms). */
export function sua(fn, { im = false } = {}) {
  fn(st);
  clearTimeout(timer);
  timer = setTimeout(ghiXuong, 200);
  if (!im) phat();
}
export async function ghiNgay() { clearTimeout(timer); await ghiXuong(); }

export function xuatJSON(now = new Date()) {
  return JSON.stringify({ ung_dung: '9payday', phien_ban: PHIEN_BAN, xuat_luc: now.toISOString(), du_lieu: st }, null, 1);
}

/** Nhập từ văn bản JSON. Trả {ok, loi?, soChi?}. Chỉ thay dữ liệu khi tệp hợp lệ. */
export async function nhapJSON(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { ok: false, loi: 'Tệp không phải JSON hợp lệ.' }; }
  if (!laObj(o) || o.ung_dung !== '9payday' || !laObj(o.du_lieu)) return { ok: false, loi: 'Đây không phải tệp sao lưu của 9payday.' };
  if (num(o.phien_ban, 1) > PHIEN_BAN) return { ok: false, loi: 'Tệp được tạo bởi phiên bản mới hơn của 9payday. Hãy cập nhật ứng dụng.' };
  st = lamSach(o.du_lieu);
  await ghiNgay();
  phat();
  return { ok: true, soChi: st.chi.length };
}

export async function xoaSach() {
  clearTimeout(timer);
  st = macDinh();
  if (db) { try { await giaoDich('readwrite', (s) => s.delete(KHOA)); } catch { /* bỏ qua */ } }
  phat();
}

/** Chỉ dùng cho kiểm thử trong trình duyệt. */
export function datLai(raw) { st = lamSach(raw); phat(); }
