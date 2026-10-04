// Phân tích câu trả lời ngay trên máy (không gửi đi đâu): đếm từ, từ độn, tốc độ nói, kiểm tra nhanh theo STAR.
// Lưu ý: nhận dạng giọng nói của trình duyệt thường tự bỏ "ờ", "à", "ừm" nên số từ độn từ giọng nói là mức tối thiểu.

// Từ độn một tiếng
const SINGLE = ['ờ', 'ờm', 'ừm', 'ừ', 'à', 'ơ', 'ưm', 'ớ', 'uh', 'um', 'uhm', 'hm', 'hừm'];
// Cụm từ độn (xếp dài trước để khớp cụm dài nhất)
const PHRASES = [
  'kiểu như là', 'kiểu như', 'kiểu là', 'đại loại là', 'thì là', 'cái kiểu', 'như kiểu', 'ừ thì',
].map((p) => p.split(' ')).sort((a, b) => b.length - a.length);

// Một "từ": chuỗi chữ (có thể nối bằng gạch ngang, như e-mail) hoặc một số (kể cả 1.500.000, 2,5)
const TOKEN_RE = /\d+(?:[.,]\d+)*|[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu;
export function tokenize(text) {
  return String(text || '').normalize('NFC').toLowerCase().match(TOKEN_RE) || [];
}
// "thì là" là cụm độn, nhưng "rau thì là" là một loại rau
const NOT_AFTER = { 'thì là': ['rau', 'canh', 'lá', 'hạt', 'cá', 'ngò', 'mùi', 'bún', 'chả', 'nấm', 'xào', 'nấu', 'cho', 'thêm'] };

export function countWords(text) {
  return tokenize(text).length;
}

// -> { total, byWord: { 'kiểu như': 2, ... } }
export function countFillers(text) {
  const t = tokenize(text);
  const byWord = {};
  let total = 0;
  for (let i = 0; i < t.length;) {
    let hit = null;
    for (const p of PHRASES) {
      if (p.every((w, k) => t[i + k] === w)) { hit = p; break; }
    }
    if (hit && NOT_AFTER[hit.join(' ')] && NOT_AFTER[hit.join(' ')].includes(t[i - 1])) hit = null;
    if (hit) { const key = hit.join(' '); byWord[key] = (byWord[key] || 0) + 1; total++; i += hit.length; continue; }
    if (SINGLE.includes(t[i])) { byWord[t[i]] = (byWord[t[i]] || 0) + 1; total++; }
    i++;
  }
  return { total, byWord };
}

// Tiếng (âm tiết) mỗi phút. Chỉ có ý nghĩa khi có thời gian nói thật (giọng nói).
export function pacePerMin(words, speakingSec) {
  if (!(speakingSec >= 5) || !(words > 0)) return null;
  return Math.round(words / (speakingSec / 60));
}

// Mức tham khảo do 9interview đặt (không phải chuẩn khoa học), tính theo tiếng/âm tiết. Mỗi người một nhịp: hãy nghe lại chính mình.
export const PACE_NOTE = 'Tốc độ tính theo tiếng (âm tiết) mỗi phút. Khoảng 100 đến 230 chỉ là mức tham khảo của 9interview, không phải chuẩn; nhịp nói còn tùy giọng vùng miền và nội dung.';
export function paceLabel(p) {
  if (p == null) return null;
  if (p < 100) return { level: 'cham', text: 'Nhịp chậm so với mức tham khảo' };
  if (p > 230) return { level: 'nhanh', text: 'Nhịp nhanh so với mức tham khảo' };
  return { level: 'vua', text: 'Trong khoảng tham khảo' };
}

export function durationLabel(sec) {
  if (sec == null) return null;
  if (sec < 30) return { level: 'ngan', text: 'Hơi ngắn: thường nên 1 đến 2 phút với câu hành vi' };
  if (sec > 150) return { level: 'dai', text: 'Hơi dài: hãy cô đọng, ưu tiên phần hành động và kết quả' };
  return { level: 'vua', text: 'Độ dài hợp lý' };
}

// voiceWords: số tiếng thật sự đến từ nhận dạng giọng nói (không tính phần gõ tay / sửa tay). Nếu có và chiếm dưới 70% thì không đo tốc độ.
export function analyzeAnswer({ text, durationSec = null, spoken = false, voiceWords = null }) {
  const words = countWords(text);
  const f = countFillers(text);
  let pace = null, paceSkipped = false;
  if (spoken && durationSec) {
    if (voiceWords == null) pace = pacePerMin(words, durationSec);
    else if (words > 0 && voiceWords / words >= 0.7) pace = pacePerMin(Math.min(voiceWords, words), durationSec);
    else paceSkipped = true;
  }
  return {
    words,
    fillers: f.total,
    fillerByWord: f.byWord,
    fillerPer100: words ? Math.round((f.total / words) * 1000) / 10 : 0,
    pace,
    paceSkipped,
    paceLabel: paceLabel(pace),
    durationSec,
    durationLabel: spoken ? durationLabel(durationSec) : null,
  };
}

const HAS_NUMBER = /\d/;
const RESULT_WORDS = ['kết quả', 'nhờ đó', 'nhờ vậy', 'giúp', 'đạt', 'giảm', 'tăng', 'tiết kiệm', 'hoàn thành', 'thành công', 'cuối cùng', 'sau đó'];
const ACTION_WORDS = ['em đã', 'tôi đã', 'mình đã', 'em làm', 'tôi làm', 'em đề xuất', 'tôi đề xuất', 'em quyết định', 'tôi quyết định', 'em liên hệ', 'tôi liên hệ', 'em lập', 'tôi lập', 'em tự', 'tôi tự', 'em xin', 'em báo', 'tôi báo'];
const SITUATION_WORDS = ['khi ', 'lúc ', 'có lần', 'một lần', 'hồi ', 'tại công ty', 'trong dự án', 'tình huống', 'bối cảnh', 'năm ngoái', 'tháng '];
const TASK_WORDS = ['nhiệm vụ', 'trách nhiệm', 'được giao', 'phụ trách', 'mục tiêu', 'cần phải', 'yêu cầu'];

const has = (txt, list) => list.some((w) => txt.includes(w));

// Kiểm tra nhanh bằng từ khóa: chỉ là gợi ý thô, KHÔNG thay thế chấm của AI.
export function quickCheck(text, { star = false } = {}) {
  const txt = ` ${String(text || '').toLowerCase()} `;
  const words = countWords(text);
  const tips = [];
  const s = star ? {
    situation: has(txt, SITUATION_WORDS), task: has(txt, TASK_WORDS), action: has(txt, ACTION_WORDS), result: has(txt, RESULT_WORDS),
  } : null;
  const numbers = HAS_NUMBER.test(txt);
  if (words < 40) tips.push('Câu trả lời còn ngắn. Hãy thêm một ví dụ cụ thể từ trải nghiệm của bạn.');
  else if (words > 380) tips.push('Câu trả lời khá dài. Hãy cô đọng, giữ ý quan trọng nhất.');
  if (!numbers && words >= 40) tips.push('Chưa thấy con số nào. Nếu có, hãy thêm số liệu thật (thời gian, số lượng, tỷ lệ) để câu trả lời thuyết phục hơn.');
  if (s) {
    if (!s.situation) tips.push('Chưa rõ Tình huống: nêu bối cảnh ngắn gọn (ở đâu, khi nào).');
    if (!s.task) tips.push('Chưa rõ Nhiệm vụ: trách nhiệm hoặc mục tiêu của riêng bạn là gì.');
    if (!s.action) tips.push('Chưa rõ Hành động: hãy nói bạn đã làm gì, dùng "tôi/em" thay vì "chúng tôi".');
    if (!s.result) tips.push('Chưa rõ Kết quả: điều đạt được và bạn học được gì.');
  }
  const tk = tokenize(text);
  let we = 0, me = 0;
  for (let i = 0; i < tk.length; i++) {
    if (tk[i] === 'chúng' && ['tôi', 'em', 'mình', 'ta'].includes(tk[i + 1])) { we++; i++; } else if (['tôi', 'em', 'mình'].includes(tk[i])) me++;
  }
  if (we >= 2 && me < we) tips.push('Bạn đang nói nhiều về "chúng tôi". Hãy nêu rõ phần việc của riêng bạn.');
  return { star: s, numbers, words, tips };
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
