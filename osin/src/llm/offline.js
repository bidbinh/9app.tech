// Chế độ không có khóa AI: nhận dạng lệnh đơn giản bằng quy tắc rồi gọi đúng công cụ nội bộ.
// Cùng giao diện LlmProvider nên đi qua cùng vòng lặp (kiểm tham số, giới hạn, log) như chế độ AI.
import { fold } from '../util.js';

const HELP = 'Osin chưa bật AI trên máy chủ này nên mình chỉ làm được vài lệnh đơn giản. Bạn thử: "đổi 3 chỉ vàng ra gram", "tính 12*(3+4)", "hôm nay âm lịch ngày mấy", "đổi 15/10/2026 sang âm lịch", hoặc "mở lịch giải chạy".';

function lastUserText(contents) {
  for (let i = contents.length - 1; i >= 0; i--) {
    const c = contents[i];
    if (c.role === 'user') { const t = (c.parts || []).map((p) => p.text).filter(Boolean).join(' '); if (t) return t; }
  }
  return '';
}
const lastIsFunctionResponse = (contents) => (contents[contents.length - 1]?.parts || []).some((p) => p.functionResponse);

export function route(text) {
  const raw = text.trim();
  const f = fold(raw);
  let m;
  // đổi lịch: 15/10/2026 sang âm / 20/9/2026 âm sang dương
  if ((m = f.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)) && /\b(am|duong)\b/.test(f)) {
    const amToDuong = /\bam\b.*\b(sang|ra)\b.*\bduong\b/.test(f);
    return { name: 'osin__doi_lich', args: { chieu: amToDuong ? 'am_sang_duong' : 'duong_sang_am', ngay: +m[1], thang: +m[2], nam: +m[3] } };
  }
  // đổi đơn vị: "đổi 3 chỉ vàng ra gram", "3 sào bắc bộ bằng bao nhiêu m2"
  if ((m = raw.match(/^(?:đổi\s+)?(-?\d+(?:[.,]\d+)?)\s*([^\d].*?)\s+(?:ra|sang|thành|bằng bao nhiêu)\s+(.+?)\s*\??$/i))) {
    return { name: 'osin__quy_doi_don_vi', args: { gia_tri: Number(m[1].replace(',', '.')), tu: m[2].trim(), den: m[3].trim() } };
  }
  // tính toán
  if ((m = raw.match(/^(?:tính|tinh)\s+(.+)$/i))) return { name: 'osin__may_tinh', args: { bieu_thuc: m[1].replace(/\s*(?:bằng bao nhiêu|=)?\s*\??$/i, '').trim() } };
  if ((m = raw.match(/^([\d\s.+\-*/x×÷:^%()]+?)\s*(?:bằng bao nhiêu|=)?\s*\??$/i)) && /\d/.test(m[1]) && /[+\-*/x×÷:^%]/.test(m[1])) {
    return { name: 'osin__may_tinh', args: { bieu_thuc: m[1].trim() } };
  }
  // mở / tìm chức năng
  if ((m = raw.match(/^(?:mở|mo|tìm|tim|vào|chức năng)\s+(.+)$/i))) return { name: 'osin__tim_chuc_nang', args: { tu_khoa: m[1].trim() } };
  // thời gian
  if (/(hom nay|bay gio|may gio|ngay may|thu may|am lich|ngay bao nhieu)/.test(f)) return { name: 'osin__thoi_gian', args: {} };
  return null;
}

export function createOfflineProvider() {
  return {
    kind: 'offline',
    external: false,
    async generate({ contents }) {
      if (lastIsFunctionResponse(contents)) {
        const resp = contents[contents.length - 1].parts.find((p) => p.functionResponse).functionResponse.response || {};
        const d = resp.du_lieu_tu_cong_cu;
        const text = (d && (d.hien_thi || d.text)) || resp.loi || 'Mình chưa lấy được kết quả.';
        return { content: { role: 'model', parts: [{ text }] }, calls: [], text, tokens: 0, finish: 'STOP' };
      }
      const r = route(lastUserText(contents));
      if (r) return { content: { role: 'model', parts: [{ functionCall: { name: r.name, args: r.args } }] }, calls: [r], text: '', tokens: 0, finish: 'STOP' };
      return { content: { role: 'model', parts: [{ text: HELP }] }, calls: [], text: HELP, tokens: 0, finish: 'STOP' };
    },
  };
}
