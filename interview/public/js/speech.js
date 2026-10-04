// Đọc câu hỏi (TTS) và nhận dạng giọng nói tiếng Việt (Web Speech API). Có dự phòng gõ chữ ở giao diện.
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text, { onend } = {}) {
  if (!ttsSupported()) { onend && onend(); return false; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    const v = window.speechSynthesis.getVoices().find((x) => /^vi/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = () => onend && onend();
    u.onerror = () => onend && onend();
    window.speechSynthesis.speak(u);
    return true;
  } catch { onend && onend(); return false; }
}
export function stopSpeaking() { try { if (ttsSupported()) window.speechSynthesis.cancel(); } catch { /* bỏ qua */ } }

const Rec = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
export const sttSupported = () => !!Rec();

// Bộ ghi: gom kết quả cuối + kết quả tạm. Tự khởi động lại khi trình duyệt tự dừng (Chrome ngắt sau vài chục giây im lặng).
export class Recorder {
  constructor({ onText, onState, onError }) {
    this.onText = onText; this.onState = onState; this.onError = onError;
    this.finalText = ''; this.interim = ''; this.voiceFinal = ''; this.active = false; this.rec = null;
  }
  // Chỉ phần chữ do nhận dạng giọng nói tạo ra (không gồm chữ gõ tay có sẵn lúc bắt đầu)
  get voiceText() { return (this.voiceFinal + ' ' + this.interim).trim(); }
  get text() { return (this.finalText + ' ' + this.interim).replace(/\s+/g, ' ').trim(); }
  start(initial = '') {
    const R = Rec();
    if (!R) { this.onError && this.onError('unsupported'); return false; }
    this.finalText = initial ? initial.trim() + ' ' : ''; this.interim = ''; this.active = true;
    this._spawn(R);
    this.onState && this.onState('listening');
    return true;
  }
  _spawn(R) {
    const rec = new R();
    rec.lang = 'vi-VN'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { this.finalText += r[0].transcript + ' '; this.voiceFinal += r[0].transcript + ' '; }
        else interim += r[0].transcript;
      }
      this.interim = interim;
      this.onText && this.onText(this.text);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.active = false; this.onError && this.onError('denied'); return; }
      this.onError && this.onError(e.error || 'error');
    };
    rec.onend = () => {
      if (this.interim) { this.finalText += this.interim + ' '; this.voiceFinal += this.interim + ' '; this.interim = ''; this.onText && this.onText(this.text); }
      if (this.active) { try { this._spawn(R); } catch { this.active = false; this.onState && this.onState('stopped'); } } else this.onState && this.onState('stopped');
    };
    this.rec = rec;
    try { rec.start(); } catch (err) { this.active = false; this.onError && this.onError('start_failed'); }
  }
  stop() {
    this.active = false;
    try { this.rec && this.rec.stop(); } catch { /* bỏ qua */ }
    if (this.interim) { this.finalText += this.interim + ' '; this.voiceFinal += this.interim + ' '; this.interim = ''; }
    return this.text;
  }
}
