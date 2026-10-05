// Chỉ mục tìm kiếm chức năng của Osin cho launcher (định dạng: vannien/docs/SEARCH-INDEX.md).
import { fold } from './util.js';

const raw = [
  { name: 'Osin: Trợ lý AI', words: ['osin', 'trợ lý', 'trợ lý ai', 'chatbot', 'chat ai', 'hỏi đáp', 'hỏi osin', 'nói chuyện với ai'], path: '', blurb: 'Hỏi bằng chữ hoặc giọng nói, Osin tra cứu giúp bạn trong các app 9app.' },
  { name: 'Osin: Cài đặt và đọc to câu trả lời', words: ['cài đặt osin', 'đọc to', 'đọc trả lời', 'giọng nói', 'micro', 'nhập bằng giọng nói'], path: '#/cai-dat', blurb: 'Bật đọc to câu trả lời, chọn gia đình, xuất hoặc xóa dữ liệu trò chuyện.' },
  { name: 'Osin: Quyền riêng tư và xóa lịch sử', words: ['xóa lịch sử osin', 'quyền riêng tư osin', 'xóa lịch sử trò chuyện', 'dữ liệu trò chuyện'], path: '#/rieng-tu', blurb: 'Xem dữ liệu nào được lưu, gửi đi đâu, và xóa lịch sử trò chuyện.' },
];

export const OSIN_SEARCH_INDEX = raw.map((e) => {
  const kw = [];
  for (const w of e.words) for (const k of [w, fold(w)]) if (!kw.includes(k)) kw.push(k);
  return { name: e.name, keywords: kw, path: e.path, blurb: e.blurb };
});
