// Kho dữ liệu trong bộ nhớ, ghi xuyên qua IndexedDB. Có kiểm tra, xuất/nhập JSON, hoàn tác.
import * as db from './db.js';
import { laIso } from './dates.js';
import { LOAI_NHAT_KY } from './fuel.js';
import { LOAI_HEN } from './schedule.js';

export const kho = { xe: [], nhatKy: [], hen: [], meta: {}, luuTru: '' };
export const PHIEN_BAN = 1;
const MAX_ANH = 450_000;

export const idMoi = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const chu = (v, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const so = (v, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null);
/** Mã định danh chỉ gồm chữ, số, gạch dưới, chấm, gạch ngang (chặn xuống dòng, ký tự điều khiển khi nhập từ JSON). */
export const loId = (v) => (typeof v === 'string' ? v.trim().replace(/[^\w.-]/g, '-').slice(0, 40) : '');
export const GIOI_HAN = { km: 3_000_000, tien: 1e11, luong: 1e5, gia: 1e12, thang: 600, chuKyKm: 1e6 };
const KHOA_CAM = new Set(['__proto__', 'constructor', 'prototype']);
const ngay = (v) => (typeof v === 'string' && laIso(v) ? v : '');
const trong = (v, ds, mac) => (ds.includes(v) ? v : mac);

export function loXe(o) {
  if (!o || typeof o !== 'object') return null;
  const anh = typeof o.anh === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(o.anh) && o.anh.length <= MAX_ANH ? o.anh : '';
  return {
    id: loId(o.id) || idMoi(),
    loai: trong(o.loai, ['oto', 'oto-khach', 'oto-tai', 'xemay'], 'oto'),
    bienSo: chu(o.bienSo, 15).toUpperCase(),
    ten: chu(o.ten, 40),
    hang: chu(o.hang, 40), dong: chu(o.dong, 40),
    namSX: so(o.namSX) && o.namSX >= 1950 && o.namSX <= 2100 ? Math.round(o.namSX) : null,
    nhienLieu: trong(o.nhienLieu, ['xang', 'diesel', 'dien', 'hybrid'], 'xang'),
    ngayDangKy: ngay(o.ngayDangKy), ngayMua: ngay(o.ngayMua),
    km: so(o.km, GIOI_HAN.km) !== null && o.km >= 0 ? o.km : null, kmNgay: ngay(o.kmNgay),
    giaMua: so(o.giaMua, GIOI_HAN.gia) !== null && o.giaMua >= 0 ? o.giaMua : null,
    kinhDoanh: !!o.kinhDoanh, caiTao: !!o.caiTao,
    khuVuc: trong(o.khuVuc, ['', 'hn-hcm', 'tptw', 'tinh'], ''),
    hotlineBH: chu(o.hotlineBH, 30), hotlineCuuHo: chu(o.hotlineCuuHo, 30),
    anh,
    tao: chu(o.tao, 30),
  };
}
export function loNhatKy(o) {
  if (!o || typeof o !== 'object') return null;
  const ids = LOAI_NHAT_KY.map((l) => l.id);
  const e = {
    id: loId(o.id) || idMoi(),
    xeId: loId(o.xeId),
    loai: trong(o.loai, ids, 'khac'),
    ngay: ngay(o.ngay),
    tien: so(o.tien, GIOI_HAN.tien) !== null && o.tien >= 0 ? o.tien : 0,
    luong: so(o.luong, GIOI_HAN.luong) !== null && o.luong >= 0 ? o.luong : null,
    km: so(o.km, GIOI_HAN.km) !== null && o.km >= 0 ? o.km : null,
    day: o.day === false ? false : true,
    noi: chu(o.noi, 80), hangMuc: chu(o.hangMuc, 80), ghiChu: chu(o.ghiChu, 300),
    phut: so(o.phut, 10000) !== null && o.phut >= 0 ? o.phut : null,
  };
  return e.ngay && e.xeId ? e : null;
}
export function loHen(o) {
  if (!o || typeof o !== 'object') return null;
  const ids = LOAI_HEN.map((l) => l.id);
  return {
    id: loId(o.id) || idMoi(),
    xeId: loId(o.xeId),
    kind: trong(o.kind, ids, 'khac'),
    ten: chu(o.ten, 80) || 'Mục nhắc',
    han: ngay(o.han),
    chuKyThang: so(o.chuKyThang, GIOI_HAN.thang) !== null && o.chuKyThang > 0 ? o.chuKyThang : null,
    chuKyKm: so(o.chuKyKm, GIOI_HAN.chuKyKm) !== null && o.chuKyKm > 0 ? o.chuKyKm : null,
    ngayLanCuoi: ngay(o.ngayLanCuoi),
    kmLanCuoi: so(o.kmLanCuoi, GIOI_HAN.km) !== null && o.kmLanCuoi >= 0 ? o.kmLanCuoi : null,
    ghiChu: chu(o.ghiChu, 300),
    hang: chu(o.hang, 10),
  };
}

export async function khoiDong() {
  kho.luuTru = await db.mo();
  const [x, n, h, m] = await Promise.all([db.tatCa('xe'), db.tatCa('nhatKy'), db.tatCa('hen'), db.tatCa('meta')]);
  kho.xe = x.map(loXe).filter(Boolean);
  kho.nhatKy = n.map(loNhatKy).filter(Boolean);
  kho.hen = h.map(loHen).filter(Boolean);
  kho.meta = {};
  for (const r of m) if (r.id !== '_kiemTra' && !KHOA_CAM.has(r.id)) kho.meta[r.id] = r.v;
  return kho;
}

export const xeCua = (id) => kho.xe.find((x) => x.id === id) || null;
export const nhatKyCua = (xeId) => kho.nhatKy.filter((e) => e.xeId === xeId);
export const henCua = (xeId) => kho.hen.filter((h) => h.xeId === xeId);
export const tenXe = (x) => (x ? (x.ten || [x.hang, x.dong].filter(Boolean).join(' ') || 'Xe') + (x.bienSo ? ` · ${x.bienSo}` : '') : 'Xe đã xóa');

export async function luuXe(o) {
  const x = loXe(o); if (!x) throw new Error('Dữ liệu xe không hợp lệ');
  if (!x.tao) x.tao = new Date().toISOString();
  const i = kho.xe.findIndex((y) => y.id === x.id);
  if (i >= 0) kho.xe[i] = x; else kho.xe.push(x);
  await db.ghi('xe', x);
  return x;
}
export async function luuNhatKy(o, hom) {
  const e = loNhatKy(o); if (!e) throw new Error('Cần chọn xe và ngày');
  const i = kho.nhatKy.findIndex((y) => y.id === e.id);
  const cu = i >= 0 ? kho.nhatKy[i] : null;
  if (i >= 0) kho.nhatKy[i] = e; else kho.nhatKy.push(e);
  await db.ghi('nhatKy', e);
  const xe = xeCua(e.xeId);
  if (xe && e.km !== null && (xe.km === null || e.km >= xe.km)) {
    await luuXe({ ...xe, km: e.km, kmNgay: e.ngay > hom ? hom : e.ngay });
  } else if (xe && cu && cu.km !== null && cu.km === xe.km) {
    await tinhLaiKm(xe.id, hom); // sửa lùi số km của chính lần ghi đã nâng số km xe
  }
  return e;
}
export async function luuHen(o) {
  const h = loHen(o);
  const i = kho.hen.findIndex((y) => y.id === h.id);
  if (i >= 0) kho.hen[i] = h; else kho.hen.push(h);
  await db.ghi('hen', h);
  return h;
}
/** Đặt lại số km của xe theo nhật ký còn lại (khi xóa hoặc sửa lùi lần ghi đã nâng số km). Không hạ số km nhập tay cao hơn nếu không phải do lần ghi đó. */
export async function tinhLaiKm(xeId, hom) {
  const xe = xeCua(xeId); if (!xe) return;
  const kms = kho.nhatKy.filter((y) => y.xeId === xeId && y.km !== null);
  if (!kms.length) return;
  const cao = kms.reduce((a, y) => (y.km > a.km ? y : a), kms[0]);
  if (xe.km === null || cao.km < xe.km) await luuXe({ ...xe, km: cao.km, kmNgay: cao.ngay > hom ? hom : cao.ngay });
}
export async function xoaNhatKy(id, hom = new Date().toISOString().slice(0, 10)) {
  const e = kho.nhatKy.find((y) => y.id === id); if (!e) return null;
  kho.nhatKy = kho.nhatKy.filter((y) => y.id !== id);
  await db.xoa('nhatKy', id);
  const xe = xeCua(e.xeId);
  const snap = { nhatKy: [e] };
  if (xe && e.km !== null && e.km === xe.km) { snap.xeTruoc = { ...xe }; await tinhLaiKm(xe.id, hom); }
  return snap;
}
export async function xoaHen(id) {
  const h = kho.hen.find((y) => y.id === id); if (!h) return null;
  kho.hen = kho.hen.filter((y) => y.id !== id);
  await db.xoa('hen', id);
  return { hen: [h] };
}
export async function xoaXe(id) {
  const xe = xeCua(id); if (!xe) return null;
  const snap = { xe: [xe], nhatKy: nhatKyCua(id), hen: henCua(id) };
  kho.xe = kho.xe.filter((y) => y.id !== id);
  kho.nhatKy = kho.nhatKy.filter((y) => y.xeId !== id);
  kho.hen = kho.hen.filter((y) => y.xeId !== id);
  await db.xoa('xe', id);
  for (const e of snap.nhatKy) await db.xoa('nhatKy', e.id);
  for (const h of snap.hen) await db.xoa('hen', h.id);
  return snap;
}
/** Hoàn tác một lần xóa: nhận lại ảnh chụp trả về từ xoa*(). */
export async function khoiPhuc(snap) {
  if (!snap) return;
  for (const x of snap.xe || []) await luuXe(x);
  for (const e of snap.nhatKy || []) { kho.nhatKy.push(e); await db.ghi('nhatKy', e); }
  for (const h of snap.hen || []) { kho.hen.push(h); await db.ghi('hen', h); }
  if (snap.xeTruoc) await luuXe(snap.xeTruoc);
}
export async function datMeta(k, v) {
  kho.meta[k] = v;
  await db.ghi('meta', { id: k, v });
}

export function xuat(now = new Date()) {
  return { ung: '9car', phienBan: PHIEN_BAN, xuatLuc: now.toISOString(), xe: kho.xe, nhatKy: kho.nhatKy, hen: kho.hen, meta: kho.meta };
}
/**
 * Nhập từ đối tượng JSON đã phân tích. cheDo: 'gop' (giữ dữ liệu hiện có, thêm/cập nhật theo id) hoặc 'thay' (xóa sạch rồi nhập).
 */
export async function nhap(obj, cheDo = 'gop') {
  if (!obj || typeof obj !== 'object' || obj.ung !== '9car' || !Array.isArray(obj.xe) || !Array.isArray(obj.nhatKy) || !Array.isArray(obj.hen)) {
    return { ok: false, loi: 'Tệp này không phải bản sao lưu của 9car.' };
  }
  if (typeof obj.phienBan === 'number' && obj.phienBan > PHIEN_BAN) return { ok: false, loi: 'Bản sao lưu từ phiên bản mới hơn, hãy cập nhật ứng dụng.' };
  const xe = obj.xe.map(loXe).filter(Boolean);
  const idXe = new Set(xe.map((x) => x.id));
  const nk = obj.nhatKy.map(loNhatKy).filter((e) => e && idXe.has(e.xeId) || (e && kho.xe.some((x) => x.id === e.xeId) && cheDo === 'gop'));
  const hen = obj.hen.map(loHen).filter((h) => h && (!h.xeId || idXe.has(h.xeId) || (cheDo === 'gop' && kho.xe.some((x) => x.id === h.xeId))));
  if (cheDo === 'thay') await xoaSach();
  for (const x of xe) await luuXe(x);
  for (const e of nk) { const i = kho.nhatKy.findIndex((y) => y.id === e.id); if (i >= 0) kho.nhatKy[i] = e; else kho.nhatKy.push(e); await db.ghi('nhatKy', e); }
  for (const h of hen) await luuHen(h);
  if (obj.meta && typeof obj.meta === 'object') {
    for (const [k, v] of Object.entries(obj.meta)) {
      if (/^[a-zA-Z0-9_.-]{1,40}$/.test(k) && !KHOA_CAM.has(k) && JSON.stringify(v ?? null).length < 20000) await datMeta(k, v);
    }
  }
  return { ok: true, xe: xe.length, nhatKy: nk.length, hen: hen.length };
}
export async function xoaSach() {
  kho.xe = []; kho.nhatKy = []; kho.hen = []; kho.meta = {};
  await db.xoaSachKho();
}
