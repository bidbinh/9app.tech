// Kiểm tra và làm sạch dữ liệu người dùng (từ IndexedDB hoặc tệp nhập), để dòng hỏng không làm sập màn hình. Thuần hàm.
import { BAI_TEST } from './fitness.js';

const NGAY = /^\d{4}-\d{2}-\d{2}$/;
const la = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const so = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const chu = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

function hiep(s) {
  if (!la(s)) return null;
  const o = {};
  for (const k of ['lan', 'kg', 'rpe', 'giay']) { const v = so(s[k]); if (v !== null) o[k] = k === 'rpe' ? Math.min(10, Math.max(1, v)) : Math.max(0, v); }
  return o;
}
export function buoi(b) {
  if (!la(b) || typeof b.ngay !== 'string' || !NGAY.test(b.ngay)) return null;
  const bai = (Array.isArray(b.bai) ? b.bai : []).filter((e) => la(e) && typeof e.ex === 'string' && Array.isArray(e.sets))
    .map((e) => ({ ex: e.ex, ...(la(e.dem) ? { dem: e.dem } : {}), sets: e.sets.map(hiep).filter(Boolean) }));
  return { id: chu(b.id, 40) || `b${b.ngay}`, ngay: b.ngay, ten: chu(b.ten, 60) || 'Buổi tập', bd: so(b.bd), phut: so(b.phut) ? Math.min(600, b.phut) : null, rpe: so(b.rpe) ? Math.min(10, Math.max(1, b.rpe)) : null, ghiChu: chu(b.ghiChu, 500), bai, ct: typeof b.ct === 'string' ? b.ct : null };
}
export function choi(p) {
  if (!la(p) || typeof p.ngay !== 'string' || !NGAY.test(p.ngay) || !(so(p.phut) > 0)) return null;
  return { id: chu(p.id, 40) || `c${p.ngay}`, ngay: p.ngay, mon: chu(p.mon, 20), phut: Math.min(600, p.phut), rpe: Math.min(10, Math.max(1, so(p.rpe) || 5)), ghiChu: chu(p.ghiChu, 120) };
}
export function dodac(d) {
  if (!la(d) || typeof d.ngay !== 'string' || !NGAY.test(d.ngay)) return null;
  const vong = {};
  if (la(d.vong)) for (const [k, v] of Object.entries(d.vong)) if (so(v) > 0) vong[k] = v;
  return { id: chu(d.id, 40) || `d${d.ngay}`, ngay: d.ngay, kg: so(d.kg) > 0 ? d.kg : null, vong };
}
export function test(t) {
  if (!la(t) || typeof t.ngay !== 'string' || !NGAY.test(t.ngay) || !BAI_TEST[t.loai] || !(so(t.v) > 0)) return null;
  return { id: chu(t.id, 40) || `t${t.ngay}`, ngay: t.ngay, loai: t.loai, v: t.v, bt: typeof t.bt === 'string' ? t.bt : null, vo2: so(t.vo2) };
}
export function kehoach(k) {
  if (!la(k) || typeof k.ctId !== 'string' || !Array.isArray(k.muc)) return null;
  const muc = k.muc.filter((m) => la(m) && typeof m.key === 'string' && NGAY.test(m.ngay || '') && Number.isInteger(m.khoi) && Number.isInteger(m.phienIdx)).map((m) => ({ key: m.key, ngay: m.ngay, khoi: m.khoi, phienIdx: m.phienIdx, giamTai: !!m.giamTai }));
  return { ...k, muc, xong: la(k.xong) ? k.xong : {}, thu: Array.isArray(k.thu) ? k.thu.filter((x) => Number.isInteger(x)) : [] };
}
export const LAM_SACH_MANG = { buoi, choi, dodac, test };

/** Làm sạch một mảng; trả về { ds, bo } với bo là số dòng bị loại. */
export function lamSachMang(khoa, v) {
  const f = LAM_SACH_MANG[khoa];
  if (!Array.isArray(v)) return { ds: [], bo: 0 };
  const ds = v.map(f).filter(Boolean);
  return { ds, bo: v.length - ds.length };
}
