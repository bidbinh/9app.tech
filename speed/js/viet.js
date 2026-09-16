// Tiếng Việt cho giọng đọc: số thành chữ, câu ngắn khi lái xe.
// Không để số Ả Rập / tiếng Anh lọt vào câu — máy sẽ đọc “sixty”, “kê em trên giờ”.

const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** slug file mp3 trong /voice — khớp tools/build-voice.py */
export const CLIP_ID = {
  'không': 'khong',
  'một': 'mot',
  'hai': 'hai',
  'ba': 'ba',
  'bốn': 'bon',
  'năm': 'nam',
  'sáu': 'sau',
  'bảy': 'bay',
  'tám': 'tam',
  'chín': 'chin',
  'mười': 'muoi',
  'lăm': 'lam',
  'mươi': 'muoi-chuc',
  'mốt': 'mot-lech',
  'tư': 'tu',
  'trăm': 'tram',
  'nghìn': 'nghin',
  'lẻ': 'le',
  'mét': 'met',
  'giờ': 'gio',
  'cách': 'cach',
  'sắp tới': 'sap-toi',
  'phạt tốc độ': 'phat-toc-do',
  'phạt nguội': 'phat-nguoi',
  'cắt đường sắt': 'cat-duong-sat',
  'vượt tốc': 'vuot-toc',
  'giới hạn': 'gioi-han',
  'cấm rẽ': 'cam-re',
  'cấm rẽ phải': 'cam-re-phai',
  'cấm rẽ trái': 'cam-re-trai',
  'cấm quay đầu': 'cam-quay-dau',
  'cấm đi ngược chiều': 'cam-nguoc-chieu',
  'đường cấm': 'duong-cam',
  'cấm ô tô': 'cam-o-to',
  'cấm mô tô': 'cam-mo-to',
  'cấm ô tô mô tô': 'cam-o-to-mo-to',
  'cấm vượt': 'cam-vuot',
  'khung giờ': 'khung-gio',
  'đến': 'den',
  'và': 'va',
  'đã bật giọng đọc': 'da-bat-giong-doc',
};

function duoiMotTram(n) {
  if (n < 10) return CHU_SO[n];
  if (n < 20) {
    if (n === 10) return 'mười';
    if (n === 15) return 'mười lăm';
    return `mười ${n === 11 ? 'một' : CHU_SO[n % 10]}`;
  }
  const chuc = Math.floor(n / 10);
  const don = n % 10;
  let s = `${CHU_SO[chuc]} mươi`;
  if (don === 0) return s;
  if (don === 1) return `${s} mốt`;
  if (don === 4) return `${s} tư`;
  if (don === 5) return `${s} lăm`;
  return `${s} ${CHU_SO[don]}`;
}

function duoiMotNghin(n) {
  if (n < 100) return duoiMotTram(n);
  const tram = Math.floor(n / 100);
  const rest = n % 100;
  let s = `${CHU_SO[tram]} trăm`;
  if (rest === 0) return s;
  if (rest < 10) return `${s} lẻ ${CHU_SO[rest]}`;
  return `${s} ${duoiMotTram(rest)}`;
}

/** Số nguyên không âm → chữ (đủ cho tốc độ và cự ly cảnh báo). */
export function vietInt(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'không';
  if (n < 1000) return duoiMotNghin(n);
  const nghin = Math.floor(n / 1000);
  const rest = n % 1000;
  const dau = nghin === 1 ? 'một nghìn' : `${vietInt(nghin)} nghìn`;
  if (rest === 0) return dau;
  if (rest < 100) return `${dau} không trăm ${rest < 10 ? `lẻ ${CHU_SO[rest]}` : duoiMotTram(rest)}`;
  return `${dau} ${duoiMotNghin(rest)}`;
}

export function vietIntWords(n) {
  return vietInt(n).split(/\s+/).filter(Boolean);
}

/** Cự ly đọc khi lái: làm tròn 10 m, dưới 20 m thì “sắp tới”. */
export function vietCach(meters) {
  const m = Math.max(0, Math.round(Number(meters) / 10) * 10);
  if (m <= 20) return 'sắp tới';
  return `cách ${vietInt(m)} mét`;
}

export function vietCachWords(meters) {
  const m = Math.max(0, Math.round(Number(meters) / 10) * 10);
  if (m <= 20) return ['sắp tới'];
  return ['cách', ...vietIntWords(m), 'mét'];
}

/** Giờ phút trong ngày → “sáu giờ”, “sáu giờ mười lăm”. */
export function vietGio(totalMin) {
  return vietGioWords(totalMin).join(' ');
}

export function vietGioWords(totalMin) {
  const n = Math.max(0, Math.round(Number(totalMin)));
  const h = Math.floor(n / 60) % 24;
  const m = n % 60;
  if (m === 0) return [...vietIntWords(h), 'giờ'];
  return [...vietIntWords(h), 'giờ', ...vietIntWords(m)];
}

/** Rút tên chỗ từ nhãn overlay / OSM cho câu nói ngắn. */
export function noiNgan(label) {
  if (!label) return '';
  let s = String(label)
    .replace(/camera phạt nguội:\s*/i, '')
    .replace(/camera tốc độ\s*/i, '')
    .replace(/km\s*\/\s*h/gi, '')
    .replace(/\bkmh\b/gi, '')
    .trim();
  s = s.split(/\s*[–—]\s*/)[0].trim();
  if (s.length > 40) s = s.slice(0, 38).trim();
  return s;
}

/** Ghép token thành câu đọc: chấm hơi, viết hoa đầu cụm. */
export function cauTu(tokens) {
  const raw = (tokens || []).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  let s = raw
    .replace(/ cách /g, '. Cách ')
    .replace(/ sắp tới/g, '. Sắp tới')
    .replace(/ khung giờ /g, '. Khung giờ ')
    .replace(/ giới hạn /g, '. Giới hạn ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function cauPoiTokens(item) {
  const cach = vietCachWords(item.distance);
  if (item.info?.type === 'railway') return ['cắt đường sắt', ...cach];
  if (item.info?.type === 'ban') {
    const ten = String(item.info.speak || 'cấm rẽ').trim().toLowerCase();
    const out = [ten];
    const spans = item.info.hoursSpans || [];
    if (spans.length) {
      out.push('khung giờ');
      spans.forEach(([a, b], i) => {
        if (i) out.push('và');
        out.push(...vietGioWords(a), 'đến', ...vietGioWords(b));
      });
    }
    return [...out, ...cach];
  }
  if (item.info?.speed) return ['phạt tốc độ', ...vietIntWords(item.info.speed), ...cach];
  return ['phạt nguội', ...cach];
}

export function cauPoi(item) {
  return cauTu(cauPoiTokens(item));
}

export function cauVuotTocTokens(limit) {
  return ['vượt tốc', 'giới hạn', ...vietIntWords(limit)];
}

export function cauVuotToc(limit) {
  return cauTu(cauVuotTocTokens(limit));
}

export function cauBatGiongTokens() {
  return ['đã bật giọng đọc'];
}

export function cauBatGiong() {
  return 'Đã bật giọng đọc';
}

function langVi(lang) {
  const s = String(lang || '').toLowerCase().replace(/_/g, '-');
  return s === 'vi' || s.startsWith('vi-');
}

/**
 * Chỉ nhận giọng tiếng Việt thật (lang vi / vi-VN).
 * Không bao giờ trả giọng Anh/Trung — chúng đọc tiếng Việt thành tiếng bồi.
 */
export function isVietnameseVoice(v) {
  if (!v) return false;
  const lang = String(v.lang || '');
  const name = String(v.name || '').toLowerCase();
  if (!langVi(lang)) return false;
  if (/english|en-us|en-gb|chinese|zh-|japanese|korean|espeak|norsk/.test(`${name} ${lang}`)) return false;
  return true;
}

/**
 * @param {Array<{name:string, lang:string}>} voices
 */
export function pickVietnameseVoice(voices) {
  const vi = [...(voices || [])].filter(isVietnameseVoice);
  const diem = (v) => {
    const n = `${v.name} ${v.lang}`.toLowerCase();
    let s = 0;
    if (/^vi[-_]vn/i.test(v.lang || '')) s += 8;
    if (/google/.test(n)) s += 9;
    if (/hoài my|hoaimy|linh|nam minh|namminh/.test(n)) s += 8;
    if (/neural|natural|online|enhanced/.test(n)) s += 6;
    if (/microsoft/.test(n)) s += 3;
    if (/nữ|female/.test(n)) s += 2;
    if (/compact/.test(n)) s -= 6;
    return s;
  };
  vi.sort((a, b) => diem(b) - diem(a));
  return vi[0] || null;
}

export function voiceRate(voice) {
  const n = `${voice?.name || ''}`.toLowerCase();
  if (/google/.test(n)) return 0.92;
  if (/neural|natural|online/.test(n)) return 0.94;
  return 0.84;
}
