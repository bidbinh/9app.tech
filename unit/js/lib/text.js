// Xử lý chữ tiếng Việt: bỏ dấu, đọc số thành chữ. Thuần hàm, không phụ thuộc trình duyệt.

/** Bỏ dấu tiếng Việt (đ -> d). Giữ nguyên chữ hoa/thường. */
export function boDau(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

/** Dạng khóa tìm kiếm: bỏ dấu, chữ thường, gọn khoảng trắng. */
export function khoaTim(s) {
  return boDau(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

// Đọc một nhóm 3 chữ số (0..999). dayDu = true: nhóm không đứng đầu nên "không trăm" được đọc.
function docNhom(n, dayDu) {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  const out = [];
  if (tram > 0 || dayDu) out.push(CHU_SO[tram], 'trăm');
  if (chuc === 0) {
    if (donvi > 0) {
      if (tram > 0 || dayDu) out.push('lẻ');
      out.push(CHU_SO[donvi]);
    }
  } else if (chuc === 1) {
    out.push('mười');
    if (donvi === 5) out.push('lăm');
    else if (donvi > 0) out.push(CHU_SO[donvi]);
  } else {
    out.push(CHU_SO[chuc], 'mươi');
    if (donvi === 1) out.push('mốt');
    else if (donvi === 5) out.push('lăm');
    else if (donvi > 0) out.push(CHU_SO[donvi]);
  }
  return out.join(' ');
}

// Đọc số 0..999.999.999; truoc = đã có phần lớn hơn đứng trước (cần đọc "không trăm").
function docDuoiTy(v, truoc) {
  const g = [Math.floor(v / 1000000), Math.floor((v % 1000000) / 1000), v % 1000];
  const nhan = ['triệu', 'nghìn', ''];
  const seg = [];
  let daCo = truoc;
  for (let j = 0; j < 3; j++) {
    if (g[j] === 0) continue;
    seg.push((docNhom(g[j], daCo) + ' ' + nhan[j]).trim());
    daCo = true;
  }
  return seg.join(' ');
}

// Đọc số nguyên không âm (BigInt) thành chữ. Trên 1 tỷ: "<phần cao> tỷ <phần thấp>" (đệ quy: nghìn tỷ, triệu tỷ...).
function docNguyen(big) {
  if (big === 0n) return 'không';
  const TY = 1000000000n;
  if (big < TY) return docDuoiTy(Number(big), false);
  const hi = big / TY;
  const lo = Number(big % TY);
  return docNguyen(hi) + ' tỷ' + (lo ? ' ' + docDuoiTy(lo, true) : '');
}

/**
 * Đọc số thành chữ tiếng Việt.
 * @param {number|string|bigint} so  số nguyên hoặc thập phân (dùng "." hoặc "," làm dấu thập phân khi là chuỗi có đúng một dấu phân cách không phải nhóm nghìn)
 * @param {{vietHoa?:boolean, donVi?:string, chan?:boolean, phanThapPhan?:number}} opt
 */
export function docSo(so, opt = {}) {
  let s;
  if (typeof so === 'bigint') s = so.toString();
  else if (typeof so === 'number') {
    if (!Number.isFinite(so)) return '';
    s = so.toString();
    if (/e/i.test(s)) s = so.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  } else s = String(so ?? '').trim();
  s = chuanHoaSoChuoi(s);
  if (!s) return '';
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  const [nguyen, thap] = s.split('.');
  let out = docNguyen(BigInt(nguyen || '0'));
  if (thap && /[1-9]/.test(thap)) {
    const t = opt.phanThapPhan ? thap.slice(0, opt.phanThapPhan) : thap;
    out += ' phẩy ' + t.split('').map((c) => CHU_SO[+c]).join(' ');
  }
  if (neg && out !== 'không') out = 'âm ' + out;
  if (opt.donVi) out += ' ' + opt.donVi;
  if (opt.chan) out += ' chẵn';
  if (opt.vietHoa) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/** Chuẩn hóa chuỗi số kiểu Việt ("3.200.000", "3,5", "-12") về dạng "3200000" / "3.5". Trả '' nếu không hợp lệ. */
export function chuanHoaSoChuoi(raw) {
  let s = String(raw).trim().replace(/\s+/g, '');
  if (!s) return '';
  let neg = false;
  if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return '';
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let out;
  if (dots && commas) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const grp = dec === '.' ? ',' : '.';
    out = s.split(grp).join('').replace(dec, '.');
  } else if (dots + commas === 0) {
    out = s;
  } else {
    const sep = dots ? '.' : ',';
    const cnt = dots || commas;
    const parts = s.split(sep);
    const last = parts[parts.length - 1];
    if (cnt > 1) out = parts.join('');                       // 3.200.000
    else if (last.length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && sep === '.') out = parts.join(''); // 1.000 -> 1000 (kiểu Việt)
    else out = parts.join('.');                              // 3,5 / 3.25
  }
  if (!/^\d+(\.\d+)?$/.test(out)) return '';
  out = out.replace(/^0+(?=\d)/, '');
  return (neg ? '-' : '') + out;
}

/** Định dạng số kiểu Việt: 3.250.000 / 1.234,5 */
export function dinhDangSo(n, toiDaThapPhan = 8) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  let v = Number(Number(n).toPrecision(14));
  const neg = v < 0;
  v = Math.abs(v);
  let str = v.toFixed(toiDaThapPhan);
  if (/e/i.test(String(v))) str = v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: toiDaThapPhan });
  let [i, f = ''] = str.split('.');
  f = f.replace(/0+$/, '');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const res = f ? `${i},${f}` : i;
  return (neg && res !== '0' ? '-' : '') + res;
}

/** Như dinhDangSo nhưng giữ ~6 chữ số có nghĩa cho số nhỏ (0,000112 thay vì 0). */
export function dinhDangGon(n, chuSoCoNghia = 6) {
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) >= 1) return dinhDangSo(n, 6);
  const dec = Math.min(14, chuSoCoNghia - Math.floor(Math.log10(Math.abs(n))) - 1);
  return dinhDangSo(n, dec);
}
