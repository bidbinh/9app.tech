// Truy cập dữ liệu người dùng (buổi tập, buổi chơi, số đo, kế hoạch...). Mọi dữ liệu nằm trên máy.
import * as db from './db.js';
import { danhGiaSangLoc } from './parq.js';
import { lamSachMang, kehoach as lamSachKeHoach } from './schema.js';

export const taoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const mang = (k) => lamSachMang(k, db.doc(k, [])).ds; // bỏ dòng hỏng để không làm sập màn hình

// ----- Buổi tập
export const dsBuoi = () => mang('buoi');
export const layBuoi = (id) => dsBuoi().find((b) => b.id === id) || null;
export function luuBuoi(b) {
  const ds = dsBuoi();
  const i = ds.findIndex((x) => x.id === b.id);
  if (i >= 0) ds[i] = b; else ds.push(b);
  return db.ghi('buoi', ds);
}
export function xoaBuoi(id) { return db.ghi('buoi', dsBuoi().filter((b) => b.id !== id)); }

// ----- Bản nháp buổi đang ghi
export const layNhap = () => { const v = db.doc('nhap', null); return v && typeof v === 'object' ? v : null; };
export const luuNhap = (b) => db.ghi('nhap', b);
export const xoaNhap = () => db.bo('nhap');

// ----- Buổi chơi
export const dsChoi = () => mang('choi');
export function luuChoi(p) { const ds = dsChoi(); const i = ds.findIndex((x) => x.id === p.id); if (i >= 0) ds[i] = p; else ds.push(p); return db.ghi('choi', ds); }
export function xoaChoi(id) { return db.ghi('choi', dsChoi().filter((p) => p.id !== id)); }

// ----- Số đo cơ thể: { id, ngay, kg, vong: {eo, nguc, mong, dui, tay} }
export const dsDo = () => mang('dodac');
export function luuDo(d) { const ds = dsDo(); const i = ds.findIndex((x) => x.id === d.id); if (i >= 0) ds[i] = d; else ds.push(d); return db.ghi('dodac', ds); }
export function xoaDo(id) { return db.ghi('dodac', dsDo().filter((d) => d.id !== id)); }
export const layMucTieu = () => db.doc('muctieu', {}) || {};
export const luuMucTieu = (m) => db.ghi('muctieu', m);

// ----- Bài kiểm tra thể lực: { id, ngay, loai, v }
export const dsTest = () => mang('test');
export function luuTest(t) { const ds = dsTest(); ds.push(t); return db.ghi('test', ds); }
export function xoaTest(id) { return db.ghi('test', dsTest().filter((t) => t.id !== id)); }

// ----- Kế hoạch chương trình đang áp dụng
export const layKeHoach = () => lamSachKeHoach(db.doc('kehoach', null));
export const luuKeHoach = (k) => db.ghi('kehoach', k);
export const xoaKeHoach = () => db.bo('kehoach');

// ----- Sàng lọc sức khỏe
export const laySangLoc = () => { const v = db.doc('sangloc', null); return v && v.ketQua ? v : null; };
export const luuSangLoc = (tuoi, traLoi, ngay) => {
  const r = danhGiaSangLoc(tuoi, traLoi);
  if (r.ketQua === 'thieu') return null;
  const b = { ngay, tuoi, traLoi, ketQua: r.ketQua, lyDo: r.lyDo, huongDan: r.huongDan, luuY: r.luuY };
  db.ghi('sangloc', b);
  return b;
};
/** 'chua' | 'duoc-phep' | 'hoi-bac-si' | 'dung-lai' */
export const trangThaiSangLoc = () => { const k = laySangLoc()?.ketQua; return ['duoc-phep', 'hoi-bac-si', 'dung-lai'].includes(k) ? k : 'chua'; };

export const tatCaNgayHoatDong = () => [...dsBuoi().map((b) => b.ngay), ...dsChoi().map((p) => p.ngay)];
