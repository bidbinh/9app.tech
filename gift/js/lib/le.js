// Sổ lễ: loại sự kiện, sổ nợ lễ (ai mừng mình chưa đáp, ai mình mừng chưa nhận lại), thống kê, CSV. Thuần hàm.
import { khoaTim } from './text.js';

/** nhom: 'hy' (việc vui) | 'hieu' (tang lễ, tách riêng) | 'khac'. dapLe: mặc định có đáp lễ không. */
export const SU_KIEN = [
  { id: 'cuoi', ten: 'Đám cưới', nhom: 'hy', dapLe: true },
  { id: 'hoi', ten: 'Đám hỏi', nhom: 'hy', dapLe: true },
  { id: 'dayThang', ten: 'Đầy tháng', nhom: 'hy', dapLe: true },
  { id: 'thoiNoi', ten: 'Thôi nôi', nhom: 'hy', dapLe: true },
  { id: 'tanGia', ten: 'Tân gia', nhom: 'hy', dapLe: true },
  { id: 'khaiTruong', ten: 'Khai trương', nhom: 'hy', dapLe: true },
  { id: 'tang', ten: 'Tang lễ, phúng viếng', nhom: 'hieu', dapLe: true },
  { id: 'gio', ten: 'Đám giỗ', nhom: 'hieu', dapLe: false },
  { id: 'mungTho', ten: 'Mừng thọ', nhom: 'hy', dapLe: false },
  { id: 'sinhNhat', ten: 'Sinh nhật', nhom: 'khac', dapLe: false },
  { id: 'thangChuc', ten: 'Thăng chức', nhom: 'khac', dapLe: false },
  { id: 'totNghiep', ten: 'Tốt nghiệp', nhom: 'khac', dapLe: false },
  { id: 'thamBenh', ten: 'Thăm bệnh', nhom: 'khac', dapLe: false },
  { id: 'liXi', ten: 'Lì xì, mừng tuổi', nhom: 'khac', dapLe: false },
  { id: 'leTet', ten: 'Lễ Tết', nhom: 'khac', dapLe: false },
  { id: 'khac', ten: 'Khác', nhom: 'khac', dapLe: false },
];
// Object không prototype: khóa người dùng như 'constructor', '__proto__', 'toString' không tra ra gì
export const SU_KIEN_THEO_ID = Object.assign(Object.create(null), Object.fromEntries(SU_KIEN.map((s) => [s.id, s])));
export const tenSuKien = (id) => (SU_KIEN_THEO_ID[id] ? SU_KIEN_THEO_ID[id].ten : 'Khác');
export const dapLeMacDinh = (id) => !!(SU_KIEN_THEO_ID[id] && SU_KIEN_THEO_ID[id].dapLe);
export const nhomLe = (id) => (SU_KIEN_THEO_ID[id] ? SU_KIEN_THEO_ID[id].nhom : 'khac');

/**
 * Một khoản lễ: {id, huong:'di'|'den', ngay, personId, tenNguoi, suKien, soTien, qua, ghiChu, khongDap}
 * 'di' = mình đã đi mừng; 'den' = mình đã nhận.
 * khongDap = true: người dùng đánh dấu "không cần đáp" (hoặc sự kiện mặc định không đáp lễ).
 */
export function canDapLe(e) {
  if (e.khongDap === true) return false;
  if (e.khongDap === false) return true;
  return dapLeMacDinh(e.suKien);
}

const khoaNguoi = (e) => (e.personId ? `p:${e.personId}` : `t:${khoaTim(e.tenNguoi || '')}`);

/**
 * Ghép đôi các khoản theo từng người, theo thứ tự thời gian: một khoản "nhận" ghép với khoản "đi" gần nhất sau nó
 * (cùng nhóm: việc vui với việc vui, tang lễ với tang lễ), và ngược lại. Khoản không ghép được là còn nợ lễ.
 * @returns {{chuaDap: object[], chuaNhan: object[]}} chuaDap: họ đã mừng mình, mình chưa đáp. chuaNhan: mình đã mừng, họ chưa mừng lại.
 */
export function tinhNoLe(entries) {
  const nhom = new Map();
  for (const e of entries) {
    if (!canDapLe(e)) continue;
    if (!(e.huong === 'di' || e.huong === 'den')) continue;
    if (!e.personId && !(e.tenNguoi || '').trim()) continue;
    const k = `${khoaNguoi(e)}|${nhomLe(e.suKien) === 'hieu' ? 'hieu' : 'hy'}`;
    if (!nhom.has(k)) nhom.set(k, []);
    nhom.get(k).push(e);
  }
  const chuaDap = []; const chuaNhan = [];
  for (const ds of nhom.values()) {
    ds.sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : String(a.id).localeCompare(String(b.id))));
    const moDi = []; const moDen = [];
    for (const e of ds) {
      const doi = e.huong === 'di' ? moDen : moDi;
      if (doi.length) doi.shift();
      else (e.huong === 'di' ? moDi : moDen).push(e);
    }
    chuaNhan.push(...moDi); chuaDap.push(...moDen);
  }
  const sx = (a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0);
  return { chuaDap: chuaDap.sort(sx), chuaNhan: chuaNhan.sort(sx) };
}

/**
 * Gợi ý mức đáp lễ, CHỈ ĐỂ THAM KHẢO. Không có mức "đúng": tùy quan hệ, hoàn cảnh, địa phương.
 * @returns {{bangSoNhan:number, lamTron:number, muc:number|null}}
 */
export function goiYDapLe(soDaNhan, mucNhap = null) {
  const n = Math.max(0, Math.round(Number(soDaNhan) || 0));
  const lamTron = n % 100000 === 0 ? n : Math.ceil(n / 100000) * 100000;
  return { bangSoNhan: n, lamTron, muc: Number.isFinite(mucNhap) && mucNhap > 0 ? Math.round(mucNhap) : null };
}

/** Thống kê theo năm và theo loại sự kiện. */
export function thongKe(entries) {
  const theoNam = new Map(); const theoSuKien = new Map();
  let tongDi = 0; let tongDen = 0; let soDi = 0; let soDen = 0;
  for (const e of entries) {
    const so = Number(e.soTien) || 0;
    const nam = Number(String(e.ngay || '').slice(0, 4)) || 0;
    if (!theoNam.has(nam)) theoNam.set(nam, { nam, di: 0, den: 0, soDi: 0, soDen: 0 });
    const y = theoNam.get(nam);
    const s = theoSuKien.has(e.suKien) ? theoSuKien.get(e.suKien) : theoSuKien.set(e.suKien, { suKien: e.suKien, di: 0, den: 0, soLan: 0 }).get(e.suKien);
    s.soLan++;
    if (e.huong === 'di') { y.di += so; y.soDi++; s.di += so; tongDi += so; soDi++; } else { y.den += so; y.soDen++; s.den += so; tongDen += so; soDen++; }
  }
  return {
    theoNam: [...theoNam.values()].sort((a, b) => a.nam - b.nam),
    theoSuKien: [...theoSuKien.values()].sort((a, b) => (b.di + b.den) - (a.di + a.den)),
    tongDi, tongDen, soDi, soDen,
  };
}

/** Chống chèn công thức khi mở bằng Excel: ô văn bản bắt đầu bằng = + - @ thì thêm dấu nháy. */
export function lamSachCsv(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV sổ lễ (có BOM để Excel đọc đúng tiếng Việt). nguoi: map id -> tên. */
export function sangCsv(entries, tenNguoiTheoId = {}, { anTien = false } = {}) {
  const dau = ['Ngày', 'Chiều', 'Người', 'Sự kiện', 'Số tiền (đ)', 'Quà', 'Ghi chú'];
  const dong = [...entries].sort((a, b) => (a.ngay < b.ngay ? -1 : 1)).map((e) => [
    e.ngay, e.huong === 'di' ? 'Đã đi' : 'Đã nhận', (e.personId && tenNguoiTheoId[e.personId]) || e.tenNguoi || '', tenSuKien(e.suKien), anTien ? '***' : (Number(e.soTien) || 0), e.qua || '', e.ghiChu || '',
  ].map(lamSachCsv).join(','));
  return `﻿sep=,\r\n${[dau.join(','), ...dong].join('\r\n')}\r\n`; // dòng sep=, giúp Excel (kể cả bản vi-VN dùng dấu chấm phẩy) tách cột đúng
}

/** Động từ đúng theo nhóm: việc vui "mừng", hiếu "phúng viếng", sinh nhật/lễ Tết/thăm bệnh "tặng". */
export function dongTuLe(suKien) {
  const n = nhomLe(suKien);
  return n === 'hy' ? 'mừng' : n === 'hieu' ? 'phúng viếng' : 'tặng';
}
/** Nhãn chiều theo ngữ cảnh: "Mình mừng", "Họ phúng viếng", "Họ tặng mình"... */
export function nhanChieu(huong, suKien) {
  const v = dongTuLe(suKien);
  if (huong === 'di') return `Mình ${v}`;
  return v === 'tặng' ? 'Họ tặng mình' : `Họ ${v}`;
}
/** Tổng tách theo nhóm: hy (việc vui), hieu (tang lễ, giỗ), khac (sinh nhật, lễ Tết, quà). */
export function thongKeTheoNhom(entries) {
  const out = { hy: { di: 0, den: 0 }, hieu: { di: 0, den: 0 }, khac: { di: 0, den: 0 } };
  for (const e of entries) out[nhomLe(e.suKien)][e.huong === 'den' ? 'den' : 'di'] += Number(e.soTien) || 0;
  return out;
}
