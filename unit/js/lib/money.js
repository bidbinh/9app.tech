// Chia tiền, phần trăm, giảm giá, VAT, tip. Thuần hàm. Mọi kết quả tiền là số đồng (nguyên) khi có làm tròn.

/** Chia đều. lamTronLen: bội số làm tròn lên cho mỗi người (vd 1000). Trả phần mỗi người và số dư. */
export function chiaDeu({ tong, soNguoi, lamTronLen = 1 }) {
  if (!(tong >= 0)) throw new Error('Tổng tiền không hợp lệ.');
  if (!Number.isInteger(soNguoi) || soNguoi < 1 || soNguoi > 1000) throw new Error('Số người phải từ 1 đến 1000.');
  const b = lamTronLen > 0 ? lamTronLen : 1;
  const chuaTron = tong / soNguoi;
  const moiNguoi = Math.ceil(Math.round(chuaTron * 1e6) / 1e6 / b) * b;
  const tongThu = moiNguoi * soNguoi;
  return { moiNguoi, chuaTron, tongThu, du: tongThu - tong };
}

/**
 * Chia theo món: mỗi người có phần riêng; phụ phí chung (VAT, phí phục vụ, tip) chia theo tỉ lệ phần riêng.
 * @param {{nguoi:{ten:string, tien:number}[], phuPhi:number, giam?:number}} p  giam: số tiền giảm chung (tính như phụ phí âm)
 */
export function chiaTheoMon({ nguoi, phuPhi = 0, giam = 0 }) {
  if (!nguoi.length) throw new Error('Cần ít nhất một người.');
  const tongRieng = nguoi.reduce((s, n) => s + (n.tien || 0), 0);
  const chung = phuPhi - giam;
  const ds = nguoi.map((n) => {
    const tyLe = tongRieng > 0 ? (n.tien || 0) / tongRieng : 1 / nguoi.length;
    const phan = (n.tien || 0) + chung * tyLe;
    return { ten: n.ten, rieng: n.tien || 0, phanChung: chung * tyLe, tra: Math.round(phan) };
  });
  // Cân lại phần dư làm tròn vào người trả nhiều nhất để tổng khớp
  const can = Math.round(tongRieng + chung);
  const lech = can - ds.reduce((s, x) => s + x.tra, 0);
  if (lech !== 0 && ds.length) {
    let idx = 0;
    ds.forEach((x, i) => { if (x.tra > ds[idx].tra) idx = i; });
    ds[idx].tra += lech;
  }
  return { ds, tongRieng, tong: can };
}

/** A% của B. */
export const phanTramCua = (a, b) => (a / 100) * b;
/** A là bao nhiêu % của B. */
export function laBaoNhieuPhanTram(a, b) {
  if (b === 0) throw new Error('Không chia được cho 0.');
  return (a / b) * 100;
}
/** Thay đổi % từ giá cũ sang giá mới (dương: tăng). */
export function thayDoiPhanTram(cu, moi) {
  if (cu === 0) throw new Error('Giá trị cũ bằng 0 nên không tính được %.');
  return ((moi - cu) / Math.abs(cu)) * 100;
}

/** Giảm giá, có thể giảm liên tiếp nhiều lần (vd 20% rồi thêm 10% = giảm tổng 28%, không phải 30%). */
export function giamGia({ gia, phanTram, giamThem = 0 }) {
  if (!(gia >= 0)) throw new Error('Giá không hợp lệ.');
  const sau1 = gia * (1 - phanTram / 100);
  const sau = sau1 * (1 - giamThem / 100);
  return { giaSau: sau, tietKiem: gia - sau, phanTramThucTe: gia > 0 ? (1 - sau / gia) * 100 : 0 };
}

/** VAT. Từ giá chưa VAT -> có VAT, hoặc từ giá đã gồm VAT tách ra. */
export function vat({ so, thue, daGomVat = false }) {
  if (!(so >= 0) || !(thue >= 0)) throw new Error('Số liệu không hợp lệ.');
  if (daGomVat) {
    const chua = so / (1 + thue / 100);
    return { chuaVat: chua, tienThue: so - chua, coVat: so };
  }
  const tien = (so * thue) / 100;
  return { chuaVat: so, tienThue: tien, coVat: so + tien };
}

/** Tip và chia đầu người. */
export function tinhTip({ hoaDon, tipPhanTram, soNguoi = 1 }) {
  if (!(hoaDon >= 0) || !(tipPhanTram >= 0)) throw new Error('Số liệu không hợp lệ.');
  if (!Number.isInteger(soNguoi) || soNguoi < 1) throw new Error('Số người không hợp lệ.');
  const tip = (hoaDon * tipPhanTram) / 100;
  const tong = hoaDon + tip;
  return { tip, tong, moiNguoi: tong / soNguoi };
}
