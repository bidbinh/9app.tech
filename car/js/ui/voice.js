// Nhận giọng nói (SpeechRecognition của trình duyệt). Lời nói chỉ dùng để phân tích rồi bỏ, không lưu.
// Trạng thái nút: 'nghi' -> 'nghe' (đang nghe) -> 'xuly' (đang xử lý, xoay xoay) -> 'nghi'.
export function coGiongNoi() {
  return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
}
const LOI = {
  'not-allowed': 'Chưa được cấp quyền dùng micro. Bạn có thể gõ câu vào ô bên cạnh.',
  'service-not-allowed': 'Trình duyệt không cho dùng nhận giọng nói. Hãy gõ câu vào ô bên cạnh.',
  'no-speech': 'Không nghe thấy gì. Chạm micro và nói lại, ví dụ: đổ xăng ba trăm nghìn tám lít.',
  'audio-capture': 'Không tìm thấy micro trên máy này.',
  'network': 'Nhận giọng nói cần mạng và hiện không kết nối được. Hãy gõ câu thay thế.',
  'aborted': '',
};

/**
 * @param {{onTrangThai:(t:string)=>void, onKetQua:(lan:string)=>void, onLoi:(msg:string)=>void}} cb
 */
export function taoNghe(cb) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  let rec = null; let trangThai = 'nghi'; let loi = ''; let lan = ''; let hen = null;
  const dat = (t) => { trangThai = t; cb.onTrangThai(t); };
  function ket() {
    clearTimeout(hen);
    const l = lan; const e = loi; lan = ''; loi = ''; rec = null;
    if (e) { dat('nghi'); cb.onLoi(e); return; }
    if (!l) { dat('nghi'); cb.onLoi(LOI['no-speech']); return; }
    dat('xuly');
    // trả lại giao diện một nhịp để hiện trạng thái đang xử lý trước khi hiện kết quả
    setTimeout(() => { dat('nghi'); cb.onKetQua(l); }, 250);
  }
  return {
    get trangThai() { return trangThai; },
    bat() {
      if (trangThai !== 'nghi' || !SR) return;
      try {
        rec = new SR();
        rec.lang = 'vi-VN'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
        rec.onresult = (ev) => { lan = Array.from(ev.results).map((r) => r[0].transcript).join(' ').trim(); };
        rec.onerror = (ev) => { loi = LOI[ev.error] ?? 'Không nhận được giọng nói. Hãy gõ câu thay thế.'; if (ev.error === 'aborted') loi = ''; };
        rec.onend = ket;
        rec.start();
        dat('nghe');
        hen = setTimeout(() => { try { rec.stop(); } catch { /* đã dừng */ } }, 12000);
      } catch {
        rec = null; dat('nghi'); cb.onLoi('Không bật được micro. Hãy gõ câu vào ô bên cạnh.');
      }
    },
    dung() { if (rec && trangThai === 'nghe') { dat('xuly'); try { rec.stop(); } catch { ket(); } } },
  };
}
