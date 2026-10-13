// Tính lương Gross <-> Net, bảo hiểm bắt buộc, thuế TNCN từ tiền lương. Thuần hàm, không phụ thuộc trình duyệt.
// Nguồn và mức xác minh từng con số: xem docs/NGUON.md. Chỉ là công cụ ước tính, không phải tư vấn thuế.
//
// Quy ước làm tròn: mỗi khoản bảo hiểm làm tròn đến 1 đồng (Math.round); thuế TNCN tính chính xác trên thu nhập
// tính thuế rồi làm tròn đến 1 đồng ở bước cuối. Tiền là số đồng nguyên.

const TR = 1_000_000;

// Mức xác minh: 'goc' = đọc từ văn bản gốc trong phiên tra cứu; 'thu-cap' = đối chiếu qua bài của báo/cổng pháp luật, chưa đọc văn bản gốc;
// 'chua' = chưa xác minh được.
export const XM = { goc: 'goc', thuCap: 'thu-cap', chua: 'chua' };

/** Biểu thuế lũy tiến từng phần theo THÁNG: [{den, suat}] (den = cận trên, đơn vị đồng). */
export const BIEU_MOI = [
  { den: 10 * TR, suat: 5 }, { den: 30 * TR, suat: 10 }, { den: 60 * TR, suat: 20 },
  { den: 100 * TR, suat: 30 }, { den: Infinity, suat: 35 },
];
export const BIEU_CU = [
  { den: 5 * TR, suat: 5 }, { den: 10 * TR, suat: 10 }, { den: 18 * TR, suat: 15 }, { den: 32 * TR, suat: 20 },
  { den: 52 * TR, suat: 25 }, { den: 80 * TR, suat: 30 }, { den: Infinity, suat: 35 },
];

/**
 * Bộ quy định thuế. 'moi' = Luật 109/2025/QH15 (phần tiền lương áp dụng từ kỳ tính thuế 2026).
 * 'cu' = Luật 04/2007/QH12 và các văn bản hướng dẫn (đến hết kỳ tính thuế 2025).
 * 'khauTru2026' = chỉ dùng để ước tính số công ty khấu trừ tạm tính T1-T6/2026 (biểu cũ + giảm trừ mới): CHƯA XÁC MINH.
 */
export const QUY_DINH = {
  moi: {
    id: 'moi',
    ten: 'Quy định mới (từ kỳ tính thuế 2026)',
    ngan: 'Mới 2026',
    bieu: BIEU_MOI,
    giamTruBanThan: 15.5 * TR,
    giamTruPhuThuoc: 6.2 * TR,
    otMienToanBo: true,
    huuTriTran: 3 * TR,
    refBieu: 'Luật 109/2025/QH15 Điều 9 khoản 2', xmBieu: XM.goc,
    refGiamTru: 'Luật 109/2025/QH15 Điều 10 khoản 1 (cùng mức tại NQ 110/2025/UBTVQH15)', xmGiamTru: XM.goc,
    refOT: 'Luật 109/2025/QH15 Điều 4 khoản 8 (miễn thuế tiền lương làm việc ban đêm, làm thêm giờ); NĐ 253/2026/NĐ-CP Điều 26', xmOT: XM.goc,
  },
  cu: {
    id: 'cu',
    ten: 'Quy định cũ (đến hết kỳ tính thuế 2025)',
    ngan: 'Cũ ≤2025',
    bieu: BIEU_CU,
    giamTruBanThan: 11 * TR,
    giamTruPhuThuoc: 4.4 * TR,
    otMienToanBo: false,
    huuTriTran: 1 * TR,
    refBieu: 'Luật 04/2007/QH12 Điều 22 (biểu 7 bậc), được hướng dẫn tại TT 111/2013/TT-BTC', xmBieu: XM.thuCap,
    refGiamTru: 'NQ 954/2020/UBTVQH14 Điều 1', xmGiamTru: XM.thuCap,
    refOT: 'TT 111/2013/TT-BTC (chỉ phần tiền trả cao hơn tiền lương giờ làm việc bình thường được miễn)', xmOT: XM.thuCap,
  },
  khauTru2026: {
    id: 'khauTru2026',
    ten: 'Khấu trừ tạm tính T1-T6/2026 (biểu cũ, giảm trừ mới)',
    ngan: 'Tạm tính',
    bieu: BIEU_CU,
    giamTruBanThan: 15.5 * TR,
    giamTruPhuThuoc: 6.2 * TR,
    otMienToanBo: true,
    huuTriTran: 1 * TR,
    refBieu: 'Chưa xác minh từ văn bản gốc: nguồn báo cho biết T1-T6/2026 vẫn khấu trừ theo biểu 7 bậc', xmBieu: XM.chua,
    refGiamTru: 'NQ 110/2025/UBTVQH15 (áp dụng từ kỳ tính thuế 2026)', xmGiamTru: XM.thuCap,
    refOT: 'Chưa xác minh', xmOT: XM.chua,
  },
};

// ---------- Tham số bảo hiểm theo tháng ----------
const TL = { BHXH: 8, BHYT: 1.5, BHTN: 1 };
export const TY_LE_BH = TL;

/** Lương cơ sở (đồng/tháng) tại tháng 'YYYY-MM'. */
export function luongCoSo(thang) {
  if (thang >= '2026-07') return { v: 2_530_000, ref: 'NĐ 161/2026/NĐ-CP (từ 01/07/2026)', xm: XM.thuCap };
  if (thang >= '2024-07') return { v: 2_340_000, ref: 'NĐ 73/2024/NĐ-CP (01/07/2024 đến 30/06/2026)', xm: XM.thuCap };
  return { v: 1_800_000, ref: 'NĐ 24/2023/NĐ-CP (trước 01/07/2024)', xm: XM.thuCap };
}

/** Lương tối thiểu tháng theo vùng (1..4) tại tháng 'YYYY-MM'. */
export function luongToiThieuVung(thang, vung) {
  const v = Math.min(4, Math.max(1, Math.round(vung) || 1));
  if (thang >= '2026-01') return { v: [0, 5_310_000, 4_730_000, 4_140_000, 3_700_000][v], ref: 'NĐ 293/2025/NĐ-CP (từ 01/01/2026)', xm: XM.thuCap };
  return { v: [0, 4_960_000, 4_410_000, 3_860_000, 3_450_000][v], ref: 'NĐ 74/2024/NĐ-CP (01/07/2024 đến 31/12/2025)', xm: XM.thuCap };
}

export function thamSoBaoHiem(thang, vung) {
  const cs = luongCoSo(thang);
  const tt = luongToiThieuVung(thang, vung);
  return { luongCoSo: cs, toiThieu: tt, tranBHXH: 20 * cs.v, tranBHTN: 20 * tt.v, san: tt.v };
}

// ---------- Thuế lũy tiến ----------
/** Thuế theo biểu (cận trên đã nhân hệ số kỳ: 1 cho tháng, 12 cho năm). Trả tổng đã làm tròn và chi tiết từng bậc. */
export function thueLuyTien(tntt, bieu, heSo = 1) {
  const x = Math.max(0, tntt);
  let truoc = 0;
  let tong = 0;
  const bac = [];
  bieu.forEach((b, i) => {
    const den = b.den * heSo;
    const phan = Math.max(0, Math.min(x, den) - truoc);
    const thue = (phan * b.suat) / 100;
    bac.push({ bac: i + 1, tu: truoc, den, suat: b.suat, phan, thue });
    tong += thue;
    truoc = den;
  });
  return { thue: Math.round(tong), bac };
}

// ---------- Tính một tháng ----------
const so = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);
export const GIO_CHUAN_THANG = 26 * 8; // 26 ngày x 8 giờ: giả định để suy ra tiền một giờ làm việc
export const HE_SO_OT = { thuong: 1.5, nghi: 2, le: 3 }; // BLLĐ 2019 Điều 98 khoản 1: tối thiểu 150%, 200%, 300% (chưa tính lương ngày lễ)

export function mienAnTrua(qd, thang) {
  if (qd.id === 'moi' && thang >= '2026-07') return { tran: 1_200_000, ref: 'NĐ 253/2026/NĐ-CP Điều 8 khoản 2 (hiệu lực 01/07/2026; nguồn thứ cấp ghi điểm g hoặc k)', xm: XM.thuCap };
  return { tran: 730_000, ref: qd.id === 'moi' ? 'Mức 730.000đ/tháng áp dụng trước 01/07/2026 (TT 26/2016/TT-BLĐTBXH, TT 111/2013/TT-BTC)' : 'Mức 730.000đ/tháng (TT 26/2016/TT-BLĐTBXH, TT 111/2013/TT-BTC)', xm: XM.thuCap };
}

/**
 * @param {object} p
 *  gross: lương gross theo hợp đồng (tháng)
 *  vung: 1..4; phuThuoc: số người phụ thuộc đã đăng ký
 *  dongBH: có đóng BHXH/BHYT/BHTN bắt buộc; luongDongBH: mức lương đóng (mặc định = gross)
 *  anTrua: phụ cấp ăn trưa; phuCapKhac: phụ cấp chịu thuế khác (xăng, điện thoại...)
 *  otGio: {thuong, nghi, le} số giờ làm thêm trong tháng; thuong: thưởng/thu nhập chịu thuế khác nhận trong tháng
 *  huuTri: đóng góp quỹ hưu trí bổ sung tự nguyện (nếu có)
 *  quyDinh: 'moi' | 'cu' | 'khauTru2026'; thang: 'YYYY-MM'
 */
export function tinhThang(p) {
  const qd = QUY_DINH[p.quyDinh || 'moi'];
  const thang = p.thang || '2026-10';
  const gross = Math.round(so(p.gross));
  const phuThuoc = Math.max(0, Math.floor(so(p.phuThuoc)));
  const anTrua = Math.round(so(p.anTrua));
  const phuCapKhac = Math.round(so(p.phuCapKhac));
  const thuong = Math.round(so(p.thuong));
  const huuTri = Math.round(so(p.huuTri));
  const ot = p.otGio || {};
  const gioThuong = so(ot.thuong), gioNghi = so(ot.nghi), gioLe = so(ot.le);
  const dongBH = p.dongBH !== false;
  const bh = thamSoBaoHiem(thang, p.vung || 1);
  const canhBao = [];
  const buoc = [];

  // 1. Thu nhập
  buoc.push({ loai: 'cong', nhan: 'Lương gross theo hợp đồng', so: gross });
  if (anTrua) buoc.push({ loai: 'cong', nhan: 'Phụ cấp ăn trưa', so: anTrua });
  if (phuCapKhac) buoc.push({ loai: 'cong', nhan: 'Phụ cấp chịu thuế khác (xăng, điện thoại...)', so: phuCapKhac, ghiChu: 'Coi là chịu thuế. Ngưỡng miễn thuế cho phụ cấp xăng, điện thoại chưa xác minh được từ văn bản gốc nên app không tự miễn.', xm: XM.chua });
  const gioTh = gross / GIO_CHUAN_THANG;
  const otCoBan = Math.round((gioThuong + gioNghi + gioLe) * gioTh);
  const otTong = Math.round(gioTh * (gioThuong * HE_SO_OT.thuong + gioNghi * HE_SO_OT.nghi + gioLe * HE_SO_OT.le));
  if (otTong) buoc.push({ loai: 'cong', nhan: `Tiền làm thêm giờ (${gioThuong + gioNghi + gioLe} giờ)`, so: otTong, ghiChu: `Tiền một giờ = gross / ${GIO_CHUAN_THANG} giờ (26 ngày x 8 giờ), nhân 150% / 200% / 300%.` });
  if (thuong) buoc.push({ loai: 'cong', nhan: 'Thưởng và thu nhập chịu thuế khác nhận trong tháng', so: thuong });
  const tongThuNhap = gross + anTrua + phuCapKhac + otTong + thuong;
  buoc.push({ loai: 'tong', nhan: 'Tổng tiền công ty chi trả (trước khấu trừ)', so: tongThuNhap });

  // 2. Bảo hiểm bắt buộc
  let luongDong = 0, bhxh = 0, bhyt = 0, bhtn = 0;
  if (dongBH && gross > 0) {
    const goc = so(p.luongDongBH) || gross;
    luongDong = Math.max(goc, bh.san);
    if (goc < bh.san) canhBao.push(`Mức lương đóng bảo hiểm thấp hơn lương tối thiểu vùng nên được nâng lên ${bh.san.toLocaleString('vi-VN')} đ.`);
    const nenXH = Math.min(luongDong, bh.tranBHXH);
    const nenTN = Math.min(luongDong, bh.tranBHTN);
    bhxh = Math.round(nenXH * TL.BHXH / 100);
    bhyt = Math.round(nenXH * TL.BHYT / 100);
    bhtn = Math.round(nenTN * TL.BHTN / 100);
    buoc.push({ loai: 'tru', nhan: `BHXH ${TL.BHXH}%`, so: bhxh, ghiChu: `Trên ${nenXH.toLocaleString('vi-VN')} đ${luongDong > bh.tranBHXH ? ` (đã chạm trần 20 x lương cơ sở ${bh.luongCoSo.v.toLocaleString('vi-VN')} đ)` : ''}.`, ref: 'Luật BHXH 2024 (41/2024/QH15), trần 20 lần lương cơ sở: ' + bh.luongCoSo.ref, xm: XM.thuCap });
    buoc.push({ loai: 'tru', nhan: `BHYT ${TL.BHYT}%`, so: bhyt, ghiChu: `Trên ${nenXH.toLocaleString('vi-VN')} đ.`, ref: 'Luật BHYT, cùng căn cứ và trần với BHXH', xm: XM.thuCap });
    buoc.push({ loai: 'tru', nhan: `BHTN ${TL.BHTN}%`, so: bhtn, ghiChu: `Trên ${nenTN.toLocaleString('vi-VN')} đ${luongDong > bh.tranBHTN ? ` (đã chạm trần 20 x lương tối thiểu vùng ${bh.toiThieu.v.toLocaleString('vi-VN')} đ)` : ''}.`, ref: 'Luật Việc làm; trần 20 lần lương tối thiểu vùng: ' + bh.toiThieu.ref, xm: XM.thuCap });
  } else {
    buoc.push({ loai: 'thongtin', nhan: 'Không đóng bảo hiểm bắt buộc', so: 0, ghiChu: 'Ví dụ thử việc theo hợp đồng dịch vụ hoặc làm tự do. Nếu có hợp đồng lao động từ 1 tháng trở lên thường phải đóng.' });
  }
  const bhTong = bhxh + bhyt + bhtn;

  // 3. Thu nhập chịu thuế và giảm trừ
  const an = mienAnTrua(qd, thang);
  const anMien = Math.min(anTrua, an.tran);
  const anChiu = anTrua - anMien;
  const otMien = qd.otMienToanBo ? otTong : Math.max(0, otTong - otCoBan);
  const otChiu = otTong - otMien;
  const chiuThue = gross + phuCapKhac + anChiu + otChiu + thuong;
  if (anTrua) buoc.push({ loai: 'thongtin', nhan: `Phụ cấp ăn trưa miễn thuế tối đa ${an.tran.toLocaleString('vi-VN')} đ/tháng`, so: anMien, ghiChu: anChiu ? `Phần vượt ${anChiu.toLocaleString('vi-VN')} đ tính vào thu nhập chịu thuế.` : 'Không vượt mức nên không tính thuế. Nếu công ty tự tổ chức bữa ăn hoặc cấp phiếu ăn thì không bị khống chế mức này.', ref: an.ref, xm: an.xm });
  if (otTong) buoc.push({ loai: 'thongtin', nhan: qd.otMienToanBo ? 'Tiền làm thêm giờ: miễn thuế toàn bộ' : 'Tiền làm thêm giờ: chỉ phần chênh lệch so với giờ thường được miễn', so: otMien, ghiChu: qd.otMienToanBo ? 'Theo luật mới, toàn bộ tiền lương làm thêm giờ, làm việc ban đêm được miễn thuế (với điều kiện đúng quy định pháp luật lao động).' : `Phần ${otChiu.toLocaleString('vi-VN')} đ (tiền giờ thường) vẫn chịu thuế.`, ref: qd.refOT, xm: qd.xmOT });
  buoc.push({ loai: 'tong', nhan: 'Thu nhập chịu thuế', so: chiuThue, ghiChu: 'Lương + phụ cấp chịu thuế + phần ăn trưa vượt mức + phần làm thêm giờ chịu thuế + thưởng.' });
  if (bhTong) buoc.push({ loai: 'tru', nhan: 'Trừ bảo hiểm bắt buộc', so: bhTong, ref: 'Luật 109/2025/QH15 Điều 8 khoản 2 (khoản đóng BHXH, BHYT, BHTN được trừ khi tính thu nhập tính thuế)', xm: XM.goc });
  const huuTriTru = Math.min(huuTri, qd.huuTriTran);
  if (huuTriTru) buoc.push({ loai: 'tru', nhan: `Trừ đóng quỹ hưu trí bổ sung tự nguyện (tối đa ${qd.huuTriTran.toLocaleString('vi-VN')} đ/tháng)`, so: huuTriTru, ref: qd.id === 'cu' ? 'TT 111/2013/TT-BTC (tối đa 1 triệu/tháng)' : 'NĐ 253/2026/NĐ-CP Điều 46 khoản 2 điểm a (tối đa 3 triệu/tháng)', xm: XM.thuCap });
  buoc.push({ loai: 'tru', nhan: 'Giảm trừ gia cảnh bản thân', so: qd.giamTruBanThan, ref: qd.refGiamTru, xm: qd.xmGiamTru });
  const giamPT = qd.giamTruPhuThuoc * phuThuoc;
  if (phuThuoc) buoc.push({ loai: 'tru', nhan: `Giảm trừ ${phuThuoc} người phụ thuộc (${qd.giamTruPhuThuoc.toLocaleString('vi-VN')} đ/người)`, so: giamPT, ghiChu: 'Mỗi người phụ thuộc chỉ tính giảm trừ một lần vào một người nộp thuế, và cần đăng ký mã số thuế người phụ thuộc.', ref: qd.refGiamTru, xm: qd.xmGiamTru });
  const giamTru = qd.giamTruBanThan + giamPT;
  const tntt = Math.max(0, chiuThue - bhTong - huuTriTru - giamTru);
  buoc.push({ loai: 'tong', nhan: 'Thu nhập tính thuế', so: tntt, ghiChu: chiuThue - bhTong - huuTriTru - giamTru <= 0 ? 'Bằng 0 nên không phải nộp thuế TNCN.' : undefined });

  // 4. Thuế
  const lt = thueLuyTien(tntt, qd.bieu);
  lt.bac.filter((b) => b.phan > 0).forEach((b) => {
    const mo = b.tu === 0 ? 'Đến' : `Trên ${(b.tu / TR).toLocaleString('vi-VN')} triệu đến`;
    const hi = Number.isFinite(b.den) ? `${(b.den / TR).toLocaleString('vi-VN')} triệu` : 'không giới hạn';
    buoc.push({ loai: 'thue', nhan: `Bậc ${b.bac}: ${b.suat}% x ${Math.round(b.phan).toLocaleString('vi-VN')} đ`, so: b.thue, ghiChu: `Phần thu nhập tính thuế ${mo} ${hi}` });
  });
  buoc.push({ loai: 'tru', nhan: 'Thuế TNCN phải nộp', so: lt.thue, ref: qd.refBieu, xm: qd.xmBieu });

  const net = tongThuNhap - bhTong - huuTri - lt.thue;
  buoc.push({ loai: 'ketqua', nhan: 'Lương Net thực nhận', so: net, ghiChu: huuTri ? 'Đã trừ cả khoản đóng quỹ hưu trí tự nguyện.' : undefined });

  return {
    quyDinh: qd.id, thang, gross, net, tongThuNhap,
    bhxh, bhyt, bhtn, bhTong, luongDongBH: luongDong,
    chiuThue, anMien, otMien, giamTru, huuTriTru, tntt, thue: lt.thue, bacThue: lt.bac,
    thueTrenGross: gross ? lt.thue / gross : 0,
    tyLeThucNhan: tongThuNhap ? net / tongThuNhap : 0,
    thamSo: bh, canhBao, buoc,
  };
}

/** Từ Net mong muốn tìm Gross nhỏ nhất (theo đồng) cho ra Net >= mục tiêu, các khoản khác giữ nguyên. */
export function grossTuNet(netMucTieu, p) {
  const muc = Math.round(so(netMucTieu));
  const f = (g) => tinhThang({ ...p, gross: g }).net;
  if (muc <= 0) return { ...tinhThang({ ...p, gross: 0 }), grossTimDuoc: 0, chenhNet: 0 };
  // Net đơn điệu tăng theo gross nên dùng nhị phân.
  let lo = 0, hi = 1;
  while (f(hi) < muc && hi < 1e12) hi *= 2;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (f(mid) >= muc) hi = mid; else lo = mid + 1;
  }
  const kq = tinhThang({ ...p, gross: lo });
  return { ...kq, grossTimDuoc: lo, chenhNet: kq.net - muc };
}

// ---------- Quyết toán năm (ước tính) ----------
/**
 * Ước tính quyết toán thuế TNCN từ tiền lương cho một năm.
 * @param {{nam:number, thang:{gross:number, thuong?:number}[], chung:object, daKhauTru?:number|null}} p
 *  chung: các tham số dùng chung mọi tháng (vung, phuThuoc, anTrua, phuCapKhac, otGio, huuTri, dongBH).
 * Khấu trừ hằng tháng được mô phỏng: năm <= 2025 theo quy định cũ; năm 2026: T1-T6 'khauTru2026', T7-T12 'moi'.
 * Quyết toán năm 2026 trở đi dùng biểu năm = biểu tháng x 12 (120/360/720/1200 triệu) theo Điều 9 Luật 109/2025/QH15.
 */
export function quyetToanNam({ nam, thang, chung = {}, daKhauTru = null }) {
  const qdNam = nam >= 2026 ? QUY_DINH.moi : QUY_DINH.cu;
  const dong = [];
  let tongChiuThue = 0, tongBH = 0, tongHuuTri = 0, khauTruUocTinh = 0, soThangPT = 0, soThangCoLuong = 0;
  const gioiHanPT = Math.max(0, Math.floor(so(chung.phuThuoc)));
  for (let i = 0; i < 12; i++) {
    const t = thang[i] || {};
    const tm = `${nam}-${String(i + 1).padStart(2, '0')}`;
    const g = Math.round(so(t.gross));
    const thuongT = Math.round(so(t.thuong));
    if (g === 0 && thuongT === 0) { dong.push({ thang: tm, bo: true }); continue; }
    const qdKhauTru = nam >= 2026 ? (i < 6 ? 'khauTru2026' : 'moi') : 'cu';
    const pThang = { ...chung, gross: g, thuong: thuongT, thang: tm };
    const kt = tinhThang({ ...pThang, quyDinh: qdKhauTru });
    const nam_ = tinhThang({ ...pThang, quyDinh: qdNam.id });
    tongChiuThue += nam_.chiuThue;
    tongBH += nam_.bhTong;
    tongHuuTri += nam_.huuTriTru;
    khauTruUocTinh += kt.thue;
    soThangPT += gioiHanPT;
    soThangCoLuong += 1;
    dong.push({ thang: tm, gross: g, thuong: thuongT, chiuThue: nam_.chiuThue, bh: nam_.bhTong, khauTru: kt.thue, qdKhauTru });
  }
  const giamTruBanThan = qdNam.giamTruBanThan * soThangCoLuong;
  const giamTruPT = qdNam.giamTruPhuThuoc * soThangPT;
  const tnttNam = Math.max(0, tongChiuThue - tongBH - tongHuuTri - giamTruBanThan - giamTruPT);
  const lt = thueLuyTien(tnttNam, qdNam.bieu, 12);
  const daNop = daKhauTru === null || daKhauTru === undefined || daKhauTru === '' || !Number.isFinite(+daKhauTru) ? khauTruUocTinh : Math.round(+daKhauTru);
  const chenh = daNop - lt.thue; // dương: đã khấu trừ nhiều hơn phải nộp (có thể được hoàn/bù trừ); âm: phải nộp thêm
  return {
    nam, quyDinh: qdNam.id, dong, soThangCoLuong,
    tongChiuThue, tongBH, tongHuuTri, giamTruBanThan, giamTruPT, tnttNam,
    thuePhaiNop: lt.thue, bacThue: lt.bac,
    khauTruUocTinh, daKhauTru: daNop, tuNhap: daNop !== khauTruUocTinh,
    chenh,
    ketLuan: chenh > 0 ? 'hoan' : chenh < 0 ? 'nop-them' : 'khop',
  };
}

/** Hạn quyết toán thuế TNCN năm (theo Điều 44 khoản 2 Luật Quản lý thuế 38/2019/QH14; năm 2026 trở đi chưa xác minh theo Luật 108/2025/QH15). */
export function hanQuyetToan(nam) {
  return {
    uyQuyen: `${nam + 1}-03-31`,
    tuQuyetToan: `${nam + 1}-04-30`,
    ref: 'Luật Quản lý thuế 38/2019/QH14 Điều 44 khoản 2: chậm nhất ngày cuối cùng của tháng thứ 3 (tổ chức trả thu nhập quyết toán thay) hoặc tháng thứ 4 (cá nhân trực tiếp quyết toán) kể từ khi kết thúc năm dương lịch. Nếu trùng ngày nghỉ thì dời sang ngày làm việc kế tiếp.',
    xm: nam >= 2026 ? XM.chua : XM.thuCap,
    luuY: nam >= 2026 ? 'Luật Quản lý thuế 108/2025/QH15 có hiệu lực 01/07/2026; chưa xác minh được hạn cho kỳ tính thuế 2026 có đổi hay không. Hãy xem thông báo của cơ quan thuế.' : null,
  };
}
