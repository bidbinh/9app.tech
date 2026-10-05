// Lịch lương và nhắc: tính lần xảy ra kế tiếp, danh sách sắp tới, danh sách sự kiện để xuất .ics. Thuần hàm.
import { tach, lanKeTiep, soNgayGiua, ngayTrongThang } from './dates.js';

/** Ngày trong tháng dùng cho lặp: 29-31 hiểu là ngày cuối tháng. */
const ngayLap = (d) => (d >= 29 ? 'cuoi' : d);

/** Sự kiện tự có: nhận lương theo cài đặt hồ sơ. */
export function suKienTuDong(st, hom) {
  const nl = st.hoso.ngayLuong;
  if (!(st.hoso.net > 0)) return [];
  const dd = nl === 'cuoi' ? 'cuoi' : nl;
  const t = tach(hom);
  return [{ id: 'tu-dong-luong', ten: 'Nhận lương', loai: 'luong', ngay: ngayTrongThang(t.y, t.m, dd), lap: 'thang', nhacTruoc: 0, soTien: st.hoso.net, tuDong: true, cuoiThang: dd === 'cuoi' }];
}

/** Lần xảy ra kế tiếp của sự kiện (>= hom), hoặc null nếu sự kiện một lần đã qua. */
export function lanKe(e, hom) {
  const t = tach(e.ngay);
  if (!t) return null;
  if (e.lap === 'thang') return lanKeTiep(hom, e.cuoiThang ? 'cuoi' : ngayLap(t.d));
  return e.ngay >= hom ? e.ngay : null;
}

/** Tất cả sự kiện kèm ngày kế tiếp và số ngày còn lại, sắp theo ngày. */
export function danhSach(st, hom) {
  return [...suKienTuDong(st, hom), ...st.lich]
    .map((e) => {
      const ke = lanKe(e, hom);
      return { ...e, ke, conNgay: ke ? soNgayGiua(hom, ke) : null };
    })
    .filter((e) => e.ke)
    .sort((a, b) => a.conNgay - b.conNgay || a.ten.localeCompare(b.ten, 'vi'));
}

/** Những việc cần nhắc ngay trong app: còn <= số ngày nhắc trước của chính nó. */
export function canNhac(st, hom) {
  return danhSach(st, hom).filter((e) => e.conNgay <= e.nhacTruoc);
}

/** Danh sách để xuất .ics (ngày bắt đầu = lần kế tiếp). */
export function choICS(st, hom) {
  return danhSach(st, hom).map((e) => ({
    id: e.id, ten: e.ten, ngay: e.ke, lap: e.lap, cuoiThang: e.lap === 'thang' && (e.cuoiThang || tach(e.ngay).d >= 29),
    nhacTruoc: e.nhacTruoc > 0 ? [e.nhacTruoc, 0] : [0],
    moTa: e.soTien ? `Số tiền khoảng ${Math.round(e.soTien).toLocaleString('vi-VN')} đ. Nhắc từ 9payday, dữ liệu chỉ trên máy bạn.` : 'Nhắc từ 9payday, dữ liệu chỉ trên máy bạn.',
  }));
}
