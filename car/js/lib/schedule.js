// Nhắc hạn: mẫu hạng mục theo loại xe, tính hạn theo ngày hoặc km (cái nào đến trước), trạng thái xanh/vàng/đỏ.
import { addMonths, diffDays } from './dates.js';

export const LOAI_HEN = [
  { id: 'dang-kiem', ten: 'Đăng kiểm', loai: 'ngay' },
  { id: 'tnds', ten: 'Bảo hiểm bắt buộc (TNDS)', loai: 'ngay' },
  { id: 'vat-chat', ten: 'Bảo hiểm vật chất (thân vỏ)', loai: 'ngay' },
  { id: 'phi-duong', ten: 'Phí sử dụng đường bộ', loai: 'ngay' },
  { id: 'gplx', ten: 'Giấy phép lái xe', loai: 'ngay' },
  { id: 'tra-gop', ten: 'Trả góp xe', loai: 'ngay' },
  { id: 'bao-duong', ten: 'Bảo dưỡng định kỳ', loai: 'bd' },
  { id: 'dau', ten: 'Thay dầu nhớt', loai: 'bd' },
  { id: 'lop', ten: 'Lốp xe', loai: 'bd' },
  { id: 'ac-quy', ten: 'Ắc quy', loai: 'bd' },
  { id: 'khac', ten: 'Mục khác', loai: 'bd' },
];
export const tenKind = (k) => (LOAI_HEN.find((x) => x.id === k) || { ten: k }).ten;

/**
 * Mẫu bảo dưỡng gợi ý. CHỈ là gợi ý thông dụng; mỗi hãng khác nhau, hãy chỉnh theo sổ bảo hành của xe.
 */
export function mauBaoDuong(xe) {
  const xm = xe.loai === 'xemay';
  const dien = xe.nhienLieu === 'dien';
  if (xm && dien) {
    return [
      { kind: 'bao-duong', ten: 'Kiểm tra tổng quát, phanh, hệ thống điện', chuKyThang: 6, chuKyKm: 3000 },
      { kind: 'lop', ten: 'Kiểm tra, đảo hoặc thay lốp', chuKyThang: 12, chuKyKm: 10000 },
      { kind: 'ac-quy', ten: 'Kiểm tra pin, ắc quy phụ', chuKyThang: 12, chuKyKm: null },
    ];
  }
  if (xm) {
    return [
      { kind: 'dau', ten: 'Thay nhớt máy', chuKyThang: 3, chuKyKm: 2000 },
      { kind: 'bao-duong', ten: 'Thay nhớt hộp số (xe tay ga)', chuKyThang: 6, chuKyKm: 6000 },
      { kind: 'bao-duong', ten: 'Vệ sinh, thay lọc gió', chuKyThang: 12, chuKyKm: 12000 },
      { kind: 'bao-duong', ten: 'Kiểm tra, thay má phanh', chuKyThang: 12, chuKyKm: 10000 },
      { kind: 'bao-duong', ten: 'Bugi', chuKyThang: 18, chuKyKm: 10000 },
      { kind: 'lop', ten: 'Kiểm tra, thay lốp', chuKyThang: 36, chuKyKm: 20000 },
      { kind: 'ac-quy', ten: 'Ắc quy', chuKyThang: 24, chuKyKm: null },
    ];
  }
  if (dien) {
    return [
      { kind: 'bao-duong', ten: 'Kiểm tra tổng quát, hệ thống làm mát pin', chuKyThang: 12, chuKyKm: 15000 },
      { kind: 'lop', ten: 'Đảo lốp', chuKyThang: 6, chuKyKm: 10000 },
      { kind: 'bao-duong', ten: 'Cân bằng động, cân chỉnh góc đặt bánh', chuKyThang: 12, chuKyKm: 20000 },
      { kind: 'bao-duong', ten: 'Lọc gió điều hòa', chuKyThang: 12, chuKyKm: 15000 },
      { kind: 'bao-duong', ten: 'Kiểm tra má phanh, dầu phanh', chuKyThang: 24, chuKyKm: 40000 },
      { kind: 'ac-quy', ten: 'Ắc quy phụ 12V', chuKyThang: 36, chuKyKm: null },
    ];
  }
  return [
    { kind: 'dau', ten: 'Thay dầu động cơ và lọc dầu', chuKyThang: 6, chuKyKm: xe.nhienLieu === 'diesel' ? 7500 : 5000 },
    { kind: 'lop', ten: 'Đảo lốp', chuKyThang: 6, chuKyKm: 10000 },
    { kind: 'bao-duong', ten: 'Cân bằng động, cân chỉnh góc đặt bánh', chuKyThang: 12, chuKyKm: 20000 },
    { kind: 'bao-duong', ten: 'Lọc gió động cơ, lọc gió điều hòa', chuKyThang: 12, chuKyKm: 15000 },
    { kind: 'bao-duong', ten: 'Kiểm tra má phanh, dầu phanh', chuKyThang: 24, chuKyKm: 30000 },
    { kind: 'bao-duong', ten: 'Nước làm mát', chuKyThang: 24, chuKyKm: 40000 },
    { kind: 'ac-quy', ten: 'Ắc quy', chuKyThang: 30, chuKyKm: null },
  ];
}

const coSo = (v) => typeof v === 'number' && Number.isFinite(v);

export function hanNgay(hen) {
  if (hen.han) return hen.han;
  if (hen.ngayLanCuoi && coSo(hen.chuKyThang) && hen.chuKyThang > 0) return addMonths(hen.ngayLanCuoi, hen.chuKyThang);
  return null;
}
export function hanKm(hen) {
  return coSo(hen.kmLanCuoi) && coSo(hen.chuKyKm) && hen.chuKyKm > 0 ? hen.kmLanCuoi + hen.chuKyKm : null;
}

const MUC = { do: 3, vang: 2, xanh: 1, xam: 0 };
const nhanNgay = (n) => (n < 0 ? `Quá hạn ${-n} ngày` : n === 0 ? 'Hạn là hôm nay' : n === 1 ? 'Còn 1 ngày' : `Còn ${n} ngày`);
const soKm = (n) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const nhanKm = (n) => (n === 0 ? 'Đến hạn (đúng mốc km)' : n < 0 ? `Quá ${soKm(n)} km` : `Còn ${soKm(n)} km`);

/**
 * Trạng thái một mục nhắc. hom: ISO hôm nay. kmNgay: số km ước đi mỗi ngày (hoặc null).
 * Trả {mau: 'do'|'vang'|'xanh'|'xam', nhan, han, hanKm, conNgay, conKm, uuTien}. uuTien nhỏ = gấp hơn.
 */
export function trangThai(hen, xe, hom, kmNgay = null) {
  const han = hanNgay(hen);
  const kmHan = hanKm(hen);
  const conNgay = han ? diffDays(hom, han) : null;
  const conKm = kmHan !== null && xe && coSo(xe.km) ? kmHan - xe.km : null;
  const cac = [];
  if (conNgay !== null) {
    const mau = conNgay <= 7 ? 'do' : conNgay <= 30 ? 'vang' : 'xanh';
    cac.push({ mau, nhan: nhanNgay(conNgay), ngayTuongDuong: conNgay });
  }
  if (conKm !== null) {
    let mau = conKm <= Math.max(0, 0) ? 'do' : conKm <= Math.max(300, 0.1 * hen.chuKyKm) ? 'vang' : 'xanh';
    let ngayTD = kmNgay && kmNgay > 0 ? conKm / kmNgay : null;
    if (ngayTD !== null) {
      if (ngayTD <= 7) mau = 'do';
      else if (ngayTD <= 30 && mau === 'xanh') mau = 'vang';
    }
    cac.push({ mau, nhan: nhanKm(conKm), ngayTuongDuong: ngayTD !== null ? ngayTD : (conKm <= 0 ? conKm : 9999) });
  }
  if (!cac.length) return { mau: 'xam', nhan: 'Chưa đặt hạn', han, hanKm: kmHan, conNgay, conKm, uuTien: 1e6 };
  cac.sort((a, b) => MUC[b.mau] - MUC[a.mau] || a.ngayTuongDuong - b.ngayTuongDuong);
  const dau = cac[0];
  const nhan = cac.length > 1 && cac[1].mau === dau.mau ? `${dau.nhan} · ${cac[1].nhan}` : dau.nhan;
  return { mau: dau.mau, nhan, han, hanKm: kmHan, conNgay, conKm, uuTien: Math.min(...cac.map((c) => c.ngayTuongDuong)) };
}

export const TEN_MAU = { do: 'Cần làm ngay', vang: 'Sắp đến hạn', xanh: 'Còn xa', xam: 'Chưa đặt hạn' };
