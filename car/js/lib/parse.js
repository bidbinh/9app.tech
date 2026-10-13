// Phân tích một câu gõ hoặc nói thành bản ghi nhật ký xe. Ví dụ: "đổ xăng 300k 8 lít" -> {loai:'xang', tien:300000, luong:8}.
// Không trả về và không lưu nguyên câu. Kết quả luôn để người dùng soát trước khi lưu.
export function bo(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

const CHU = { khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
const THANG = { nghin: 1e3, ngan: 1e3, trieu: 1e6, ty: 1e9, ti: 1e9 };
const laTuSo = (w) => Object.prototype.hasOwnProperty.call(CHU, w) || w === 'muoi' || w === 'tram' || w === 'linh' || w === 'le' || Object.prototype.hasOwnProperty.call(THANG, w);

/** Giá trị của một dãy từ số tiếng Việt ("hai trăm năm mươi nghìn" = 250000). null nếu không hiểu. */
export function docDaySo(ws) {
  let tong = 0; let cur = 0; let cho = null; let cuoi = 1; let thayGi = false; let thangCuoi = 1;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (Object.prototype.hasOwnProperty.call(CHU, w)) {
      if (cho !== null) { cur += cho; }
      cho = CHU[w]; cuoi = 1; thayGi = true;
    } else if (w === 'muoi') {
      if (cho !== null) { cur += cho * 10; cho = null; } else cur += 10;
      cuoi = 10; thayGi = true;
    } else if (w === 'tram') {
      cur += (cho !== null ? cho : 1) * 100; cho = null; cuoi = 100; thayGi = true;
    } else if (w === 'linh' || w === 'le') {
      if (cho !== null) { cur += cho; cho = null; }
    } else if (Object.prototype.hasOwnProperty.call(THANG, w)) {
      const nhom = cur + (cho || 0);
      tong += (nhom || 1) * THANG[w]; cur = 0; cho = null; cuoi = THANG[w]; thangCuoi = THANG[w]; thayGi = true;
    } else if (w === 'ruoi') {
      tong += cuoi / 2; // "hai triệu rưỡi", "ba trăm rưỡi"
    } else return null;
  }
  if (!thayGi) return null;
  if (thangCuoi === 1e6 && tong >= 1e6 && cur === 0 && cho !== null && cho >= 1 && cho <= 9 && ws[ws.length - 1] !== 'ruoi' && !ws.includes('le') && !ws.includes('linh')) {
    return tong + cho * 1e5; // "một triệu hai" nói tắt
  }
  return tong + cur + (cho || 0);
}

const TIEN_NHAN = { k: 1e3, nghin: 1e3, ngan: 1e3, tr: 1e6, trieu: 1e6, cu: 1e6, ty: 1e9, d: 1, dong: 1, vnd: 1, ng: 1e3 };
const DON_VI = {
  l: 'lit', lit: 'lit', litre: 'lit', kwh: 'kwh', kw: 'kwh', kilowatt: 'kwh', km: 'km', cay: 'km',
};

function chuanHoa(text) {
  let s = bo(text);
  s = s.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2').replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/(\d+)tr(\d{1,3})\b/g, (_, a, b) => `${a}.${b}tr`);
  s = s.replace(/(\d+(?:\.\d+)?)([a-z]+)/g, '$1 $2');
  s = s.replace(/[,;!?"“”]/g, ' ').replace(/\.(?!\d)/g, ' ');
  return s.split(/\s+/).filter(Boolean);
}

function cutSo(tu) {
  // Trả về danh sách mục: {v, don: 'tien'|'lit'|'kwh'|'km'|null, goc}
  const mucs = [];
  let i = 0;
  while (i < tu.length) {
    const w = tu[i];
    let v = null; let j = i + 1;
    if (/^\d+(\.\d+)?$/.test(w)) v = Number(w);
    else if (laTuSo(w)) {
      let k = i; const run = [];
      while (k < tu.length && (laTuSo(tu[k]) || (tu[k] === 'ruoi' && run.length))) {
        // "ba trăm nghìn tám lít": sau từ thang, dãy số nối liền một đơn vị đo là số mới
        if (run.length && Object.prototype.hasOwnProperty.call(THANG, run[run.length - 1])) {
          let e = k; while (e < tu.length && laTuSo(tu[e])) e++;
          if (DON_VI[tu[e]]) break;
        }
        run.push(tu[k]); k++;
      }
      const kq = docDaySo(run);
      if (kq !== null) { v = kq; j = k; }
    }
    if (v === null) { i++; continue; }
    let don = null; let tienDon = null;
    const nxt = tu[j];
    if (nxt !== undefined) {
      if (TIEN_NHAN[nxt] !== undefined && !(nxt === 'ng')) { tienDon = TIEN_NHAN[nxt]; don = 'tien'; j++; }
      else if (DON_VI[nxt]) { don = DON_VI[nxt]; j++; if (nxt === 'cay' && tu[j] === 'so') j++; }
      else if (nxt === 'kilomet' || nxt === 'kilometer') { don = 'km'; j++; }
    }
    let val = v;
    if (don === 'tien') {
      val = v * tienDon;
      if (tu[j] === 'ruoi') { val += tienDon / 2; j++; } // "hai triệu rưỡi"
      else if (tienDon === 1e6 && /^\d{1,3}$/.test(tu[j] || '') && !DON_VI[tu[j + 1]] && TIEN_NHAN[tu[j + 1]] === undefined) {
        const n = Number(tu[j]); // "1 triệu 2" = 1,2 triệu ; "1 triệu 250" = 1.250.000
        if (n < 10) { val += n * 1e5; j++; } else if (n < 1000) { val += n * 1e3; j++; }
      }
    } else if ((don === 'lit' || don === 'kwh') && tu[j] === 'ruoi') { val += 0.5; j++; }
    mucs.push({ v: val, don, goc: v });
    i = j;
  }
  return mucs;
}

const BD = [
  [/\bnhot\b|\bthay dau\b|\bdau may\b|\bdau nhot\b/, 'Thay dầu nhớt'],
  [/\blop\b|\bvo xe\b/, 'Lốp xe'],
  [/\bac quy\b|\bbinh dien\b/, 'Ắc quy'],
  [/\bbugi\b/, 'Bugi'],
  [/\bloc gio\b/, 'Lọc gió'],
  [/\bphanh\b|\bma phanh\b/, 'Má phanh'],
  [/\bcan bang\b/, 'Cân bằng động'],
  [/\bdao lop\b/, 'Đảo lốp'],
  [/\bbao duong\b/, 'Bảo dưỡng định kỳ'],
];

/**
 * @param {string} text
 * @returns {{ok:boolean, loai:string, tien:number|null, luong:number|null, donViLuong:string|null, km:number|null, hangMuc:string, ngay:'hom-nay'|'hom-qua', ghiChu:string[]}}
 */
export function phanTichCau(text) {
  const tu = chuanHoa(text);
  const chuoi = tu.join(' ');
  const ghiChu = [];
  const mucs = cutSo(tu);
  const co = (re) => re.test(chuoi);

  let loai = null; let hangMuc = '';
  if (co(/\bsac\b|\bcharge\b|\btram sac\b/) || mucs.some((m) => m.don === 'kwh')) loai = 'sac';
  else if (co(/\bxang\b|\bdiesel\b|\bdo dau\b|\bdo day\b|\bdo binh\b|\bdo xe\b.*\b(lit|l)\b/) || co(/\bdo\b/) && mucs.some((m) => m.don === 'lit')) loai = 'xang';
  else if (co(/\bcau duong\b|\btram thu phi\b|\bbot\b|\bepass\b|\betc\b|\bphi cau\b/)) loai = 'cau-duong';
  else if (co(/\brua xe\b|\brua\b/)) loai = 'rua-xe';
  else if (co(/\bgui xe\b|\bgiu xe\b|\bbai xe\b|\bdo xe\b|\bve xe\b|\bhầm\b|\bphi gui\b/)) loai = 'gui-xe';
  else {
    for (const [re, ten] of BD) if (re.test(chuoi)) { loai = co(/\bsua\b|\bhong\b|\bva\b|\bson\b|\bnan\b/) ? 'sua-chua' : 'bao-duong'; hangMuc = ten; break; }
    if (!loai && co(/\bsua\b|\bhong\b|\bva cham\b|\bson\b|\bnan\b|\bgara\b/)) loai = 'sua-chua';
    if (!loai && co(/\bbao duong\b|\bthay\b/)) loai = 'bao-duong';
  }
  if (loai === 'bao-duong' || loai === 'sua-chua') {
    if (!hangMuc) for (const [re, ten] of BD) if (re.test(chuoi)) { hangMuc = ten; break; }
  }
  if (loai === 'xang' && co(/\bdiesel\b|\bdau\b/) && !co(/\bxang\b/)) hangMuc = 'Dầu diesel';

  let tien = null; let luong = null; let donViLuong = null; let km = null;
  const bu = [];
  for (const m of mucs) {
    if (m.don === 'tien' && tien === null) tien = m.v;
    else if ((m.don === 'lit' || m.don === 'kwh') && luong === null) { luong = m.v; donViLuong = m.don; }
    else if (m.don === 'km' && km === null) km = m.v;
    else if (m.don === null) bu.push(m);
  }
  const nhienLieu = loai === 'xang' || loai === 'sac';
  for (const m of bu) {
    if (tien === null && (m.v >= 1000 || !nhienLieu || luong !== null || bu.length === 1)) {
      if (m.v < 1000) { tien = m.v * 1000; ghiChu.push(`Hiểu "${m.goc}" là ${m.v * 1000} đồng (nghìn đồng). Hãy soát lại.`); } else tien = m.v;
    } else if (nhienLieu && luong === null && m.v < 500) { luong = m.v; donViLuong = loai === 'sac' ? 'kwh' : 'lit'; }
    else if (km === null && m.v >= 1000) km = m.v;
    else if (tien === null) tien = m.v < 1000 ? m.v * 1000 : m.v;
  }
  if (nhienLieu && luong !== null && !donViLuong) donViLuong = loai === 'sac' ? 'kwh' : 'lit';
  if (loai === 'xang' && donViLuong === 'kwh') loai = 'sac';
  if (loai === 'sac' && donViLuong === 'lit') loai = 'xang';
  if (!loai && luong !== null) loai = donViLuong === 'kwh' ? 'sac' : 'xang';
  if (!loai && tien !== null) { loai = 'khac'; ghiChu.push('Chưa rõ khoản chi này thuộc loại nào, hãy chọn loại.'); }
  if (loai === 'xang' && hangMuc === '') hangMuc = '';
  const ngay = co(/\bhom qua\b|\bqua\b.*\bhom\b/) ? 'hom-qua' : 'hom-nay';
  const ok = loai !== null && (tien !== null || luong !== null);
  if (!ok) ghiChu.push('Chưa nghe ra số tiền hoặc số lượng. Thử nói "đổ xăng 300 nghìn 8 lít".');
  return { ok, loai: loai || 'khac', tien, luong, donViLuong, km, hangMuc, ngay, ghiChu };
}
