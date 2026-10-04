// Vay, gửi tiết kiệm, lãi kép, trả góp. Thuần hàm. Tiền tính theo đồng, làm tròn đến 1 đồng khi hiển thị.

const lamTron = (x) => Math.round(x);

/**
 * Bảng trả nợ.
 * @param {{soTien:number, laiNam:number, soThang:number, kieu:'niemkim'|'goc-deu'|'lai-phang'}} p
 *  - niemkim: gốc + lãi chia đều mỗi kỳ (tiền trả mỗi tháng bằng nhau), lãi tính trên dư nợ còn lại
 *  - goc-deu: mỗi kỳ trả gốc bằng nhau, lãi tính trên dư nợ giảm dần (tiền trả giảm dần)
 *  - lai-phang: lãi tính trên dư nợ ban đầu mỗi kỳ (kiểu trả góp tiêu dùng "lãi phẳng"); lãi suất thực cao hơn con số công bố
 * @returns {{hang:object[], tongLai:number, tongTra:number, kyDau:number, kyCuoi:number, laiThucNam:number|null}}
 */
export function bangTraNo({ soTien, laiNam, soThang, kieu = 'niemkim' }) {
  if (!(soTien > 0)) throw new Error('Số tiền vay phải lớn hơn 0.');
  if (!Number.isInteger(soThang) || soThang < 1 || soThang > 1200) throw new Error('Kỳ hạn phải từ 1 đến 1200 tháng.');
  if (!(laiNam >= 0) || laiNam > 1000) throw new Error('Lãi suất không hợp lệ.');
  const r = laiNam / 100 / 12;
  const hang = [];
  let du = soTien;
  let tongLai = 0;
  const pmt = kieu === 'niemkim'
    ? (r === 0 ? soTien / soThang : (soTien * r) / (1 - Math.pow(1 + r, -soThang)))
    : 0;
  for (let k = 1; k <= soThang; k++) {
    let goc; let lai;
    if (kieu === 'niemkim') {
      lai = du * r;
      goc = k === soThang ? du : pmt - lai;
    } else if (kieu === 'goc-deu') {
      lai = du * r;
      goc = k === soThang ? du : soTien / soThang;
    } else if (kieu === 'lai-phang') {
      lai = soTien * r;
      goc = k === soThang ? du : soTien / soThang;
    } else throw new Error('Kiểu trả nợ không hợp lệ.');
    // Gốc làm tròn theo hiệu hai số dư đã làm tròn để tổng gốc đúng bằng số vay
    const duTruoc = lamTron(du);
    du = du - goc;
    const gocR = duTruoc - lamTron(du);
    const laiR = lamTron(lai);
    tongLai += lai;
    hang.push({ ky: k, goc: gocR, lai: laiR, tra: gocR + laiR, duNo: Math.max(0, lamTron(du)) });
  }
  const tongLaiR = hang.reduce((s, h) => s + h.lai, 0);
  const tongTra = hang.reduce((s, h) => s + h.tra, 0);
  return {
    hang,
    tongLai: tongLaiR,
    tongTra,
    kyDau: hang[0].tra,
    kyCuoi: hang[hang.length - 1].tra,
    laiThucNam: kieu === 'lai-phang' && laiNam > 0 ? laiSuatThucNam(hang.map((h) => h.tra), soTien) : null,
  };
}

/** Lãi suất thực theo năm (IRR hàng tháng đổi sang năm, nhân 12) cho dòng tiền trả đều/không đều. */
export function laiSuatThucNam(dongTra, soTien) {
  const f = (i) => dongTra.reduce((s, c, k) => s + c / Math.pow(1 + i, k + 1), 0) - soTien;
  let lo = 0; let hi = 1;
  while (f(hi) > 0 && hi < 1000) hi *= 2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

/** Gửi tiết kiệm. nhapLai=false: lãi trả cuối kỳ, đơn; nhapLai=true: lãi nhập gốc mỗi tháng (lãi kép tháng). */
export function guiTietKiem({ soTien, laiNam, soThang, nhapLai = false }) {
  if (!(soTien > 0) || !Number.isInteger(soThang) || soThang < 1 || !(laiNam >= 0)) throw new Error('Thông tin gửi không hợp lệ.');
  const r = laiNam / 100;
  let lai;
  if (!nhapLai) lai = soTien * r * (soThang / 12);
  else lai = soTien * Math.pow(1 + r / 12, soThang) - soTien;
  return { lai: lamTron(lai), tongNhan: lamTron(soTien + lai) };
}

/**
 * Lãi kép có góp thêm hàng tháng (góp vào cuối mỗi tháng).
 * @param {{von:number, laiNam:number, soNam:number, kyGhep:number, gopThang?:number}} p  kyGhep: số kỳ ghép lãi/năm (1, 2, 4, 12, 365)
 */
export function laiKep({ von, laiNam, soNam, kyGhep = 12, gopThang = 0 }) {
  if (!(von >= 0) || !(soNam > 0) || !(laiNam >= 0) || !(kyGhep >= 1)) throw new Error('Thông tin không hợp lệ.');
  // lãi suất hiệu dụng theo tháng
  const im = Math.pow(1 + laiNam / 100 / kyGhep, kyGhep / 12) - 1;
  const soThang = Math.round(soNam * 12);
  let so = von;
  const theoNam = [];
  for (let m = 1; m <= soThang; m++) {
    so = so * (1 + im) + gopThang;
    if (m % 12 === 0 || m === soThang) {
      const daGop = von + gopThang * m;
      theoNam.push({ nam: Math.ceil(m / 12), soDu: lamTron(so), daGop: lamTron(daGop), lai: lamTron(so - daGop) });
    }
  }
  const daGop = von + gopThang * soThang;
  return { tong: lamTron(so), daGop: lamTron(daGop), lai: lamTron(so - daGop), theoNam };
}

/** So sánh hai phương án vay. Trả chênh lệch tổng lãi, tổng trả, kỳ đầu. */
export function soSanhVay(a, b) {
  const A = bangTraNo(a); const B = bangTraNo(b);
  return {
    A, B,
    chenhTongLai: A.tongLai - B.tongLai,
    chenhTongTra: A.tongTra - B.tongTra,
    chenhKyDau: A.kyDau - B.kyDau,
    reHon: A.tongTra === B.tongTra ? 'bang' : A.tongTra < B.tongTra ? 'A' : 'B',
  };
}
