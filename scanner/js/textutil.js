// Tiện ích văn bản thuần (kiểm thử được trong Node).

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Tên tệp an toàn trên Windows/Android/iOS: bỏ ký tự cấm, tên dành riêng, dấu chấm/khoảng trắng cuối; cắt theo ký tự Unicode (không cắt đôi cặp surrogate). */
export function safeName(s) {
  let n = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  n = Array.from(n).slice(0, 80).join('');
  n = n.replace(/[. ]+$/, '').replace(/^\.+/, '');
  if (RESERVED.test(n.split('.')[0])) n = '_' + n;
  return n || 'tai-lieu';
}

/** Bỏ các từ OCR độ tin cậy thấp khỏi lớp chữ PDF (tránh chép ra rác). */
export function filterWords(words, minConf = 40) {
  return words.filter((w) => w.conf == null || w.conf >= minConf);
}

/** Độ tin cậy trung bình (0..100) của các trang đã OCR; null nếu không có. */
export function avgConfidence(ocrs) {
  const v = ocrs.map((o) => o && o.confidence).filter((c) => typeof c === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
