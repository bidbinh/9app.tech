// Ghi nhanh chi tiêu: tách số tiền và danh mục từ một câu ("cà phê 45k", "grab 85 nghìn hôm qua"); hũ chi tiêu; dự báo cuối kỳ.
// Thuần hàm. Câu gốc KHÔNG được lưu: chỉ giữ số tiền, danh mục, ngày.
import { khoaTim } from './text.js';
import { manhSo, docDayManh } from './voice-so.js';
import { congNgay, homNay as homNayIso } from './dates.js';

// ---------- Đọc số tiền ----------
function chuanHoaChuoi(text) {
  let s = khoaTim(String(text ?? '')).replace(/[₫]/g, ' ');
  for (let i = 0; i < 3; i++) s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2'); // 45,000 -> 45000
  s = s.replace(/(\d)\s*(tr|m)(?=\d|\b)/g, '$1 trieu ');
  s = s.replace(/(\d)\s*(k|nghin|ngan)(?=\d|\b)/g, '$1 nghin ');
  s = s.replace(/(\d)\s*(ty|ti)(?=\d|\b)/g, '$1 ty ');
  s = s.replace(/(\d)\s*(d|vnd|dong)\b/g, '$1 ');
  s = s.replace(/[^a-z0-9.,\s]/g, ' ');
  return s.split(/\s+/).map((w) => w.replace(/^[.,]+|[.,]+$/g, '')).filter(Boolean);
}

/**
 * Tìm số tiền trong câu. macDinh: nhân với số trần nhỏ hơn 1000 (1000: "cà phê 45" = 45.000đ; 1e6: "lương 12" = 12 triệu).
 * @returns {{v:number, dung:Set<number>, ngam:boolean}|null}
 */
export function timSoTien(text, { macDinh = 1000 } = {}) {
  const tu = chuanHoaChuoi(text);
  const ungVien = [];
  let i = 0;
  while (i < tu.length) {
    const run = [];
    let j = i, prev = null;
    while (j < tu.length) {
      const m = manhSo(tu[j], prev);
      if (!m) break;
      if (!run.length && (m.k === 'le' || m.k === 'ruoi')) break;
      run.push(m); prev = m; j++;
    }
    if (!run.length) { i++; continue; }
    // thử đoạn dài nhất đọc được
    let xong = false;
    for (let len = run.length; len >= 1 && !xong; len--) {
      for (let s = 0; s + len <= run.length && !xong; s++) {
        const doan = run.slice(s, s + len);
        const kq = docDayManh(doan);
        if (!kq || !(kq.v > 0)) continue;
        const coThang = doan.some((x) => x.k === 'scale');
        const coSo = doan.some((x) => x.k === 'lit');
        const chiChu = !coThang && !coSo;
        if (chiChu && !doan.some((x) => x.k === 'tram' || x.k === 'chuc')) continue; // "ba", "sáu", "tư" đơn lẻ: thường là chữ thường
        let v = kq.v;
        let ngam = false;
        if (!coThang && v < 1000 && macDinh > 1) { v *= macDinh; ngam = true; }
        const dung = new Set(); for (let k = i + s; k < i + s + len; k++) dung.add(k);
        const diem = (coThang ? 3 : 0) + (coSo && doan.some((x) => x.k === 'lit' && x.v >= 1000) ? 2 : 0);
        ungVien.push({ v: Math.round(v), dung, ngam, diem });
        xong = true;
      }
    }
    i = j;
  }
  if (!ungVien.length) return null;
  ungVien.sort((a, b) => b.diem - a.diem || b.v - a.v);
  return { ...ungVien[0], tu };
}

/** Số tiền cho ô nhập: chấp nhận "12tr", "12 triệu 5", "12.500.000", "45k". Trả NaN nếu không đọc được. */
export function docTien(text, macDinh = 1) {
  const s = String(text ?? '').trim();
  if (!s) return NaN;
  const kq = timSoTien(s, { macDinh });
  return kq ? kq.v : NaN;
}

// ---------- Danh mục và hũ ----------
export const THU_TU_HU = ['thiet-yeu', 'huong-thu', 'giao-duc', 'cho-di', 'tiet-kiem', 'dau-tu'];
export const HU = {
  'thiet-yeu': { ten: 'Thiết yếu', loai: 'chi', mo: 'Ăn ở, đi lại, hóa đơn, trả góp' },
  'huong-thu': { ten: 'Hưởng thụ', loai: 'chi', mo: 'Cà phê, mua sắm, giải trí' },
  'giao-duc': { ten: 'Học tập', loai: 'chi', mo: 'Sách, khóa học, kỹ năng' },
  'cho-di': { ten: 'Cho đi', loai: 'chi', mo: 'Biếu gia đình, quà, từ thiện' },
  'tiet-kiem': { ten: 'Tiết kiệm', loai: 'gop', mo: 'Quỹ dự phòng, mục tiêu' },
  'dau-tu': { ten: 'Đầu tư', loai: 'gop', mo: 'Chứng chỉ quỹ, vàng, cổ phiếu' },
};
export const MAU_HU = {
  '50-30-20': { ten: '50-30-20', mo: '50% thiết yếu, 30% hưởng thụ, 20% tiết kiệm', hu: { 'thiet-yeu': 50, 'huong-thu': 30, 'tiet-kiem': 20 } },
  '4-hu': { ten: '4 hũ', mo: 'Thiết yếu, tiết kiệm, đầu tư, hưởng thụ', hu: { 'thiet-yeu': 50, 'tiet-kiem': 20, 'dau-tu': 10, 'huong-thu': 20 } },
  '6-hu': { ten: '6 hũ', mo: 'Thêm học tập và cho đi', hu: { 'thiet-yeu': 55, 'giao-duc': 10, 'tiet-kiem': 10, 'dau-tu': 10, 'huong-thu': 10, 'cho-di': 5 } },
};

export const DANH_MUC = [
  { id: 'ca-phe', ten: 'Cà phê, trà sữa', hu: 'huong-thu', tu: ['ca phe', 'cafe', 'coffee', 'tra sua', 'tra dao', 'tra chanh', 'tra da', 'sinh to', 'nuoc mia', 'tra', 'highlands', 'phuc long', 'starbucks'] },
  { id: 'an-uong', ten: 'Ăn uống', hu: 'thiet-yeu', tu: ['an sang', 'an trua', 'an toi', 'an vat', 'an', 'com', 'pho', 'bun', 'mien', 'banh mi', 'banh', 'xoi', 'chao', 'lau', 'nuong', 'bua', 'di cho', 'cho', 'rau', 'thit', 'trung', 'sieu thi', 'bach hoa', 'grabfood', 'shopeefood', 'grab food', 'shopee food', 'giao do an', 'do an', 'tap hoa', 'nuoc uong', 'nuoc'] },
  { id: 'di-lai', ten: 'Đi lại', hu: 'thiet-yeu', tu: ['xang', 'grab', 'be', 'gojek', 'xanh sm', 'taxi', 'xe om', 'gui xe', 've xe', 'xe buyt', 'bus', 'metro', 'sua xe', 'rua xe', 'thay nhot', 'nhot', 'dang kiem', 'phat nguoi', 'etoll', 'phi duong', 'bao duong', 'do xang'] },
  { id: 'nha-o', ten: 'Nhà ở, điện nước', hu: 'thiet-yeu', tu: ['tien nha', 'thue nha', 'tro', 'dien', 'nuoc sinh hoat', 'internet', 'wifi', '4g', '5g', 'nap dien thoai', 'nap tien', 'cuoc', 'gas', 'rac', 'phi chung cu', 'giup viec', 've sinh', 'phi quan ly'] },
  { id: 'mua-sam', ten: 'Mua sắm', hu: 'huong-thu', tu: ['quan ao', 'ao', 'quan', 'giay', 'dep', 'tui', 'shopee', 'lazada', 'tiki', 'tiktok shop', 'mua do', 'my pham', 'son', 'nuoc hoa', 'phu kien', 'dong ho', 'tai nghe', 'do dien tu', 'dien thoai', 'mua sam'] },
  { id: 'giai-tri', ten: 'Giải trí', hu: 'huong-thu', tu: ['nhau', 'bia', 'ruou', 'karaoke', 'phim', 'xem phim', 'rap', 'cgv', 'game', 'du lich', 'netflix', 'spotify', 'youtube', 'choi', 'bar', 'pub', 'picnic', 'massage', 'spa', 've may bay', 'khach san', 'homestay'] },
  { id: 'suc-khoe', ten: 'Sức khỏe', hu: 'thiet-yeu', tu: ['thuoc', 'kham', 'bac si', 'benh vien', 'nha khoa', 'rang', 'gym', 'yoga', 'vitamin', 'bao hiem', 'xet nghiem', 'phong kham'] },
  { id: 'hoc-tap', ten: 'Học tập', hu: 'giao-duc', tu: ['sach', 'khoa hoc', 'hoc phi', 'hoc', 'lop', 'tieng anh', 'ielts', 'course', 'udemy', 'tai lieu', 'chung chi'] },
  { id: 'gia-dinh', ten: 'Gia đình, quà tặng', hu: 'cho-di', tu: ['bieu', 'qua', 'mung cuoi', 'phong bi', 'dam cuoi', 'dam ma', 'dam hieu', 'gui ba me', 'gui nha', 'gui gia dinh', 'tu thien', 'ung ho', 'li xi', 'sinh nhat', 'hieu hi'] },
  { id: 'tiet-kiem', ten: 'Gửi tiết kiệm', hu: 'tiet-kiem', tu: ['gui tiet kiem', 'tiet kiem', 'de danh', 'quy du phong', 'gui so', 'so tiet kiem'] },
  { id: 'dau-tu', ten: 'Đầu tư', hu: 'dau-tu', tu: ['dau tu', 'co phieu', 'chung chi quy', 'vang', 'coin', 'crypto', 'trai phieu'] },
  { id: 'khac', ten: 'Khác', hu: 'thiet-yeu', tu: [] },
];
export const dmTheoId = (id) => DANH_MUC.find((d) => d.id === id) || DANH_MUC[DANH_MUC.length - 1];

export function doanDanhMuc(tuCon) {
  const chuoi = ` ${tuCon.join(' ')} `;
  let tot = null;
  let dai = 0;
  for (const d of DANH_MUC) {
    for (const k of d.tu) {
      if (chuoi.includes(` ${k} `) && k.length > dai) { tot = d; dai = k.length; }
    }
  }
  return tot || dmTheoId('khac');
}

const TU_NGAY = [['hom kia', -2], ['hom qua', -1], ['hom nay', 0], ['bua qua', -1], ['toi qua', -1], ['sang nay', 0], ['trua nay', 0], ['toi nay', 0]];

/**
 * Phân tích một câu ghi chi tiêu.
 * @returns {{ok:true, soTien:number, dm:string, ngay:string, ngam:boolean}|{ok:false, loi:string}}
 */
export function phanTichChiTieu(text, hom = homNayIso()) {
  const goc = String(text ?? '').trim();
  if (!goc) return { ok: false, loi: 'Hãy gõ hoặc nói một câu, ví dụ: cà phê 45k.' };
  const kq = timSoTien(goc, { macDinh: 1000 });
  if (!kq) return { ok: false, loi: 'Chưa thấy số tiền. Thử: "cà phê 45k" hoặc "grab 85 nghìn".' };
  if (kq.v < 1000) return { ok: false, loi: 'Số tiền quá nhỏ. Thử thêm "k" hoặc "nghìn".' };
  if (kq.v > 10_000_000_000) return { ok: false, loi: 'Số tiền quá lớn để ghi nhanh.' };
  let ngay = hom;
  let chuoi = ` ${kq.tu.filter((_, i) => !kq.dung.has(i)).join(' ')} `;
  for (const [k, d] of TU_NGAY) {
    if (chuoi.includes(` ${k} `)) { ngay = congNgay(hom, d); chuoi = chuoi.replace(` ${k} `, ' '); break; }
  }
  const dm = doanDanhMuc(chuoi.trim().split(/\s+/).filter(Boolean));
  return { ok: true, soTien: kq.v, dm: dm.id, ngay, ngam: kq.ngam };
}

// ---------- Hũ ----------
/** Hũ mà một khoản chi thuộc về, theo cấu hình hũ hiện tại. */
export function huCuaKhoan(khoan, hu) {
  if (khoan.hu && hu[khoan.hu] !== undefined) return khoan.hu;
  const goiY = dmTheoId(khoan.dm).hu;
  if (hu[goiY] !== undefined) return goiY;
  if (hu['thiet-yeu'] !== undefined) return 'thiet-yeu';
  return Object.keys(hu).find((k) => HU[k].loai === 'chi') || Object.keys(hu)[0];
}

/**
 * Số liệu từng hũ trong một kỳ.
 * @param {{net:number, hu:Object<string,number>, coDinh:{soTien:number, hu?:string}[], chi:{soTien:number, dm:string, hu?:string, ngay:string}[]}} p
 */
export function tinhHu({ net, hu, coDinh = [], chi = [] }) {
  const ids = THU_TU_HU.filter((k) => hu[k] !== undefined);
  const ds = ids.map((id) => ({ id, ten: HU[id].ten, loai: HU[id].loai, phanTram: hu[id], phanBo: Math.round((net * hu[id]) / 100), coDinh: 0, daChi: 0 }));
  const tim = (id) => ds.find((x) => x.id === id);
  for (const c of coDinh) { const j = tim(huCuaKhoan({ ...c, dm: 'khac' }, hu)); if (j) j.coDinh += c.soTien; }
  for (const c of chi) { const j = tim(huCuaKhoan(c, hu)); if (j) j.daChi += c.soTien; }
  for (const j of ds) {
    j.duocChi = j.phanBo - j.coDinh; // phần còn dùng được sau khoản cố định
    j.conLai = j.duocChi - j.daChi;
    j.tyLeDung = j.duocChi > 0 ? j.daChi / j.duocChi : (j.daChi > 0 || j.coDinh > 0 ? 1 : 0);
  }
  const chiJ = ds.filter((x) => x.loai === 'chi');
  return {
    ds,
    tongTyLe: ids.reduce((s, k) => s + hu[k], 0),
    tongCoDinh: coDinh.reduce((s, c) => s + c.soTien, 0),
    tongDaChi: chiJ.reduce((s, x) => s + x.daChi, 0),
    tongConLai: chiJ.reduce((s, x) => s + x.conLai, 0),
    tongDuocChi: chiJ.reduce((s, x) => s + x.duocChi, 0),
    chiVuotCoDinh: chiJ.filter((x) => x.duocChi < 0).map((x) => x.id),
  };
}

/**
 * Dự báo theo tốc độ chi: chi trung bình mỗi ngày đã qua nhân số ngày của kỳ.
 * Trong 3 ngày đầu kỳ chưa đủ dữ liệu nên chưa ngoại suy (du = false).
 */
export function duBao({ daChi, duocChi, ngayDaQua, soNgay }) {
  const du = ngayDaQua >= 3;
  const toc = ngayDaQua > 0 ? daChi / ngayDaQua : 0;
  const uoc = du ? Math.round(toc * soNgay) : daChi;
  const ngayCon = Math.max(0, soNgay - ngayDaQua);
  const conLai = duocChi - daChi;
  let mucDo = 'tot';
  if (duocChi <= 0) mucDo = daChi > 0 ? 'vuot' : 'tot';
  else if (daChi > duocChi) mucDo = 'vuot';
  else if (du && uoc > duocChi) mucDo = 'sat';
  else if (daChi / duocChi >= 0.85) mucDo = 'sat';
  return {
    du, mucDo, tocMoiNgay: Math.round(toc), uocCuoiKy: uoc, conLai, ngayCon,
    duocChiMoiNgay: Math.floor(Math.max(0, conLai) / (ngayCon + 1)), // chia cho cả hôm nay
    duKienDu: duocChi - uoc,
  };
}

/**
 * Gợi ý tỉ lệ khi khoản cố định chiếm gần hết hũ Thiết yếu: nâng Thiết yếu lên đủ cho khoản cố định cộng khoảng 15% lương net
 * cho ăn uống, đi lại hằng ngày (làm tròn lên bội số của 5, tối đa 80%), các hũ còn lại co theo tỉ lệ cũ. Trả null nếu không cần.
 */
export function goiYTiLe({ net, hu, coDinh }) {
  if (!(net > 0) || hu['thiet-yeu'] === undefined) return null;
  const coDinhTY = coDinh.reduce((s, c) => s + (huCuaKhoan({ ...c, dm: 'khac' }, hu) === 'thiet-yeu' ? c.soTien : 0), 0);
  if (!(coDinhTY > 0)) return null;
  const can = Math.min(80, Math.ceil((coDinhTY / net * 100 + 15) / 5) * 5);
  if (can <= hu['thiet-yeu']) return null;
  const khac = Object.keys(hu).filter((k) => k !== 'thiet-yeu' && hu[k] > 0);
  const tongKhac = khac.reduce((s, k) => s + hu[k], 0);
  const con = 100 - can;
  const moi = { 'thiet-yeu': can };
  if (tongKhac > 0) {
    let dung = 0;
    khac.forEach((k) => { moi[k] = Math.floor((hu[k] * con) / tongKhac); dung += moi[k]; });
    const lon = [...khac].sort((a, b) => hu[b] - hu[a])[0];
    moi[lon] += con - dung;
    for (const k of khac) if (moi[k] <= 0) delete moi[k];
  } else moi['thiet-yeu'] = 100;
  return { tyLe: moi, can, coDinhTY, phanTramCoDinh: Math.round(coDinhTY / net * 100) };
}
