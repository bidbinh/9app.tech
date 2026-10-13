// Bộ phân tích một câu nói/gõ tiếng Việt thành khoản lễ. Thuần hàm, không lưu câu gốc.
// Ví dụ: "mừng cưới anh Hùng 1 triệu 2" -> {huong:'di', suKien:'cuoi', tenNguoi:'anh Hùng', soTien:1200000}
// Cách làm: bỏ dấu từng từ rồi so khớp, nên sai thanh điệu của nhận dạng giọng nói không thành lỗi.
import { khoaTim } from './text.js';
import { homNayIso, congNgay, iso, hopLe, tachIso } from './ngay.js';

const SO = { khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
const DON_VI = { ty: 1e9, trieu: 1e6, tr: 1e6, nghin: 1e3, ngan: 1e3, k: 1e3 };
const TIEU_DE = new Set(['anh', 'chi', 'em', 'co', 'chu', 'bac', 'di', 'cau', 'mo', 'thim', 'duong', 'ong', 'ba', 'con', 'chau', 'ban', 'sep', 'thay', 'cu']);
const TU_DUNG = new Set(['cho', 'cua', 'tu', 'minh', 'toi', 'va', 'o', 'tai', 'ngay', 'hom', 'nay', 'qua', 'kia', 'dam', 'cuoi', 'hoi', 'tang', 'mung', 'phung', 'vieng', 'li', 'xi', 'sinh', 'nhat', 'tan', 'gia', 'khai', 'truong', 'day', 'thang', 'thoi', 'noi', 'het', 'luc', 'khi', 'nhan', 'duoc', 'phong', 'tien', 'dong', 'nhe', 'nha', 'voi', 'gui', 'tet', 'tho', 'chuc', 'tot', 'nghiep', 'tham', 'benh', 'om', 'moi', 'gio', 'xe', 'cung', 'di', 'bo', 'bieu', 'vao']);
const DONG_TU = new Set(['mung', 'tang', 'phung', 'bo', 'gui', 'bieu']);

export const SU_KIEN_TU = [
  ['dayThang', ['day thang', 'day cu']],
  ['thoiNoi', ['thoi noi']],
  ['tanGia', ['tan gia', 'nha moi', 'nhap trach']],
  ['khaiTruong', ['khai truong']],
  ['hoi', ['an hoi', 'dam hoi', 'dam ngo', 'le hoi']],
  ['cuoi', ['dam cuoi', 'tiec cuoi', 'cuoi']],
  ['tang', ['phung vieng', 'phung dieu', 'dam tang', 'dam ma', 'tang le', 'dua tang', 'phan uu', 'chia buon', 'phung', 'vieng']],
  ['mungTho', ['mung tho', 'chuc tho', 'le tho']],
  ['thangChuc', ['thang chuc', 'len chuc', 'thang tien', 'nhan chuc']],
  ['totNghiep', ['tot nghiep']],
  ['thamBenh', ['tham benh', 'tham om', 'nhap vien', 'nam vien']],
  ['sinhNhat', ['sinh nhat']],
  ['liXi', ['li xi', 'mung tuoi']],
  ['leTet', ['bieu tet', 'le tet', 'qua tet']],
];

// ---------- Đọc số tiền ----------
const laChuSo = (k) => Object.prototype.hasOwnProperty.call(SO, k);
const laSoKhac0 = (k) => laChuSo(k) && k !== 'khong';

function soTuChuoi(s) {
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+[.,]\d{3}$/.test(s)) return Number(s.replace(/[.,]/, ''));
  return null;
}

// Sau "trăm": "hai trăm năm mươi" = 250, "hai trăm năm" = 250 (cách nói về tiền), "một trăm linh năm" = 105, "hai trăm rưỡi" = 250.
function docSauTram(keys, i, v, chuSo) {
  let n = i;
  const k = keys[n];
  if (k === 'linh' || k === 'le') {
    if (laChuSo(keys[n + 1])) return { v: v + SO[keys[n + 1]], next: n + 2, chuSo, coTram: true };
    return { v, next: n + 1, chuSo, coTram: true };
  }
  if (k === 'muoi') {
    v += 10; n++;
    if (laSoKhac0(keys[n])) { v += SO[keys[n]]; n++; }
    return { v, next: n, chuSo, coTram: true };
  }
  if (laSoKhac0(k)) {
    if (keys[n + 1] === 'muoi') {
      v += SO[k] * 10; n += 2;
      if (laSoKhac0(keys[n])) { v += SO[keys[n]]; n++; }
      return { v, next: n, chuSo, coTram: true };
    }
    if (keys[n + 1] !== 'tram') return { v: v + SO[k] * 10, next: n + 1, chuSo, coTram: true };
  }
  if (k === 'ruoi') return { v: v + 50, next: n + 1, chuSo, coTram: true };
  return { v, next: n, chuSo, coTram: true };
}

/** Đọc một nhóm số (dưới 1.000, hoặc số có chữ số) bắt đầu tại i. */
function docNhom(keys, i) {
  const k = keys[i];
  if (k === undefined) return null;
  if (/^\d/.test(k)) {
    let m = /^(\d+)(?:tr|trieu)(\d{1,3})$/.exec(k);
    if (m) return { v: Number(`${m[1]}.${m[2]}`), next: i + 1, chuSo: true, donVi: 1e6 };
    m = /^(\d+(?:[.,]\d+)*)(k|tr|trieu|nghin|ngan|ty|d|dong|vnd)?$/.exec(k);
    if (!m) return null;
    const val = soTuChuoi(m[1]);
    if (val === null) return null;
    if (m[2] && DON_VI[m[2]]) return { v: val, next: i + 1, chuSo: true, donVi: DON_VI[m[2]] };
    if (keys[i + 1] === 'tram' && Number.isInteger(val) && val < 10) return docSauTram(keys, i + 2, val * 100, true);
    return { v: val, next: i + (m[2] ? 1 : 1), chuSo: true };
  }
  if (k === 'muoi') {
    let v = 10; let n = i + 1;
    if (laSoKhac0(keys[n])) { v += SO[keys[n]]; n++; }
    return { v, next: n, chuSo: false, coTram: true };
  }
  if (laSoKhac0(k)) {
    if (keys[i + 1] === 'tram') return docSauTram(keys, i + 2, SO[k] * 100, false);
    if (keys[i + 1] === 'muoi') {
      let v = SO[k] * 10; let n = i + 2;
      if (laSoKhac0(keys[n])) { v += SO[keys[n]]; n++; }
      return { v, next: n, chuSo: false, coTram: true };
    }
    return { v: SO[k], next: i + 1, chuSo: false };
  }
  return null;
}

/**
 * Đọc cụm tiền bắt đầu tại i. Trả {soTien, den, ngamNghin, coDonVi} hoặc null.
 * "1 triệu 2" = 1.200.000; "2 triệu rưỡi" = 2.500.000; "500" trần = 500.000 (ngầm hiểu nghìn).
 */
export function docCumTien(keys, i) {
  let tong = 0; let n = i; let donViCuoi = null;
  let coDonVi = false; let coChuSo = false; let coTramMuoi = false; let daCoSo = false;
  while (n < keys.length) {
    if (keys[n] === 'ruoi' && donViCuoi) { tong += donViCuoi / 2; donViCuoi = null; n++; continue; }
    const g = docNhom(keys, n);
    if (!g) break;
    const dvk = keys[g.next];
    const dungDonVi = g.donVi || DON_VI[dvk];
    if (!dungDonVi && !(donViCuoi && Number.isInteger(g.v)) && daCoSo) break; // số trần thứ hai: không thuộc cụm tiền
    if (g.chuSo) coChuSo = true;
    if (g.coTram) coTramMuoi = true;
    daCoSo = true;
    if (g.donVi) { tong += g.v * g.donVi; donViCuoi = g.donVi; coDonVi = true; n = g.next; continue; }
    if (DON_VI[dvk]) { tong += g.v * DON_VI[dvk]; donViCuoi = DON_VI[dvk]; coDonVi = true; n = g.next + 1; continue; }
    let nx = g.next;
    if (dvk === 'dong' || dvk === 'd' || dvk === 'vnd') nx++;
    if (donViCuoi && Number.isInteger(g.v)) { // "1 triệu 2" = 1,2 triệu; "1 triệu 250" = 1,25 triệu
      tong += (g.v / (10 ** String(g.v).length)) * donViCuoi; donViCuoi = null; n = nx; continue;
    }
    tong += g.v; n = nx;
  }
  if (n === i || !daCoSo) return null;
  if (!coDonVi && !coChuSo && !coTramMuoi) return null; // "ba", "năm" trần: có thể là tên
  let ngamNghin = false;
  if (!coDonVi && tong > 0 && tong < 1000) { tong *= 1000; ngamNghin = true; }
  if (!(tong > 0)) return null;
  return { soTien: Math.round(tong), den: n, ngamNghin, coDonVi };
}

/** Tìm cụm tiền trong cả câu. Bỏ qua số đứng ngay sau danh xưng khi nó có thể là tên (anh Ba, chị Sáu). */
export function timTien(keys) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (TIEU_DE.has(k) && laChuSo(keys[i + 1]) && !DON_VI[keys[i + 2]] && keys[i + 2] !== 'tram' && keys[i + 2] !== 'muoi') { i++; continue; }
    if (/^\d/.test(k) || laChuSo(k) || k === 'muoi') {
      const r = docCumTien(keys, i);
      if (r) return { ...r, tu: i };
    }
  }
  return null;
}

function tachTu(text) {
  const goc = String(text ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const keys = goc.map((t) => khoaTim(t).replace(/^[("'“]+|[)"'”.,;:!?]+$/g, ''));
  return { goc, keys };
}

/** Đọc số tiền từ một đoạn chữ ("một triệu hai"). NaN nếu không thấy. */
export function phanTichTien(text) {
  const r = timTien(tachTu(text).keys);
  return r ? r.soTien : NaN;
}

const HOA = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Phân tích câu. nguoi: [{id, ten, cachGoi}] để khớp danh bạ. Không lưu câu gốc.
 * @returns {{huong:'di'|'den', suKien:string|null, soTien:number|null, tenNguoi:string, personId:string|null, ngay:string, ngamNghin:boolean, canSoat:string[]}}
 */
export function phanTichCau(text, { nguoi = [], homNay = homNayIso() } = {}) {
  const { goc, keys } = tachTu(text);
  const chuoi = ` ${keys.join(' ')} `;
  const goiThuong = String(text ?? '').toLowerCase();
  const canSoat = [];

  // sự kiện
  let suKien = null;
  for (const [id, tus] of SU_KIEN_TU) {
    if (tus.some((t) => chuoi.includes(` ${t} `))) { suKien = id; break; }
  }
  if (!suKien && /giỗ/.test(goiThuong)) suKien = 'gio';
  if (!suKien && /(^|\s)tết(\s|$)/.test(goiThuong)) suKien = 'leTet';

  // tiền
  const tien = timTien(keys);
  const dungTien = new Set();
  if (tien) for (let i = tien.tu; i < tien.den; i++) dungTien.add(i);

  // hướng: mặc định là mình đi mừng
  let huong = 'di';
  if (/(^|\s)(nhan|duoc mung|duoc tang|duoc li xi|duoc phung)(\s|$)/.test(chuoi)) huong = 'den';
  if (/(mừng|tặng|phúng|lì xì|gửi|biếu|cho) (mình|tôi|nhà mình|gia đình mình|vợ chồng mình|hai vợ chồng)(\s|$)/.test(goiThuong)) huong = 'den';

  // người: khớp danh bạ trước
  let personId = null; let tenNguoi = ''; let viTriTen = -1;
  let tot = null;
  for (const p of nguoi) {
    for (const ten of [p.cachGoi, p.ten]) {
      if (!ten) continue;
      const kt = khoaTim(ten);
      if (kt.length < 2) continue;
      if (chuoi.includes(` ${kt} `) && (!tot || kt.length > tot.len)) tot = { p, len: kt.length, ten: kt };
    }
  }
  if (!tot) {
    const ung = [];
    for (const p of nguoi) {
      const cuoi = khoaTim(p.cachGoi || p.ten).split(' ').pop();
      if (cuoi && cuoi.length >= 3 && !TIEU_DE.has(cuoi) && keys.includes(cuoi)) ung.push({ p, cuoi });
    }
    if (ung.length === 1) tot = { p: ung[0].p, len: 0, ten: ung[0].cuoi };
    else if (ung.length > 1) canSoat.push('nhieu-nguoi');
  }
  if (tot) {
    personId = tot.p.id; tenNguoi = tot.p.cachGoi || tot.p.ten;
    const tk = tot.ten.split(' ');
    for (let i = 0; i + tk.length <= keys.length; i++) {
      if (tk.every((t, j) => keys[i + j] === t)) { viTriTen = i; break; }
    }
  } else {
    // danh xưng + tên ("anh Hùng", "bác Ba", "chị Lan Anh")
    for (let i = 0; i < keys.length - 1; i++) {
      if (dungTien.has(i) || !TIEU_DE.has(keys[i])) continue;
      const nx = keys[i + 1];
      if (dungTien.has(i + 1) || (TU_DUNG.has(nx) && nx !== 'tu') || !/^[a-z]+$/.test(nx)) continue;
      if (TIEU_DE.has(nx) && /^[a-z]+$/.test(keys[i + 2] || '') && !dungTien.has(i + 2)) continue; // "con anh Nam": lấy danh xưng sau
      const phan = [goc[i], goc[i + 1]];
      let j = i + 2;
      while (j < keys.length && phan.length < 4 && !dungTien.has(j) && !TU_DUNG.has(keys[j]) && !TIEU_DE.has(keys[j]) && /^[a-z]+$/.test(keys[j])) { phan.push(goc[j]); j++; }
      tenNguoi = phan.map((t, idx) => (idx === 0 ? t.toLowerCase() : HOA(t.toLowerCase()))).join(' ');
      viTriTen = i;
      break;
    }
    // "của Lan", "từ Lan"
    if (!tenNguoi) {
      for (let i = 0; i < keys.length - 1; i++) {
        if (['cua', 'tu'].includes(keys[i]) && !dungTien.has(i + 1) && /^[a-z]+$/.test(keys[i + 1]) && !TU_DUNG.has(keys[i + 1])) {
          tenNguoi = HOA(goc[i + 1].toLowerCase()); viTriTen = i + 1; break;
        }
      }
    }
  }
  // chủ ngữ đứng trước động từ ("chị Lan mừng 2 triệu") -> mình nhận
  if (viTriTen >= 0 && huong === 'di') {
    const iv = keys.findIndex((k) => DONG_TU.has(k));
    if (iv > viTriTen && !keys.slice(0, viTriTen).some((k) => DONG_TU.has(k))) huong = 'den';
  }

  // ngày
  let ngay = homNay;
  if (/ hom qua /.test(chuoi)) ngay = congNgay(homNay, -1);
  else if (/ hom kia /.test(chuoi)) ngay = congNgay(homNay, -2);
  else {
    const m = /(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?/.exec(String(text ?? ''));
    if (m) {
      const d = +m[1]; const mo = +m[2]; let y = m[3] ? +m[3] : tachIso(homNay).y;
      if (y < 100) y += 2000;
      if (hopLe(y, mo, d)) ngay = iso(y, mo, d);
    }
  }

  if (/(^| )(khong|chua|dung|huy|bo qua) (di |co |se )?(mung|tang|phung|li xi|gui|bieu|viet)( |$)/.test(chuoi)) canSoat.push('phu-dinh');
  if (!tien) canSoat.push('khong-co-tien');
  if (tien && tien.ngamNghin) canSoat.push('ngam-nghin');
  if (!personId && !tenNguoi) canSoat.push('khong-co-nguoi');
  if (!suKien) canSoat.push('khong-co-su-kien');
  return { huong, suKien, soTien: tien ? tien.soTien : null, tenNguoi, personId, ngay, ngamNghin: !!(tien && tien.ngamNghin), canSoat };
}
