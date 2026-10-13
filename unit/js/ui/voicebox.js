// Ô "nói hoặc gõ": nút micro (Web Speech API, vi-VN) + ô gõ lời nói làm dự phòng.
import { h, svg, idMoi } from './dom.js';

export const MIC_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

export function layNhanDang() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

const LOI_NHAN_DANG = {
  'not-allowed': 'Trình duyệt chưa cho phép dùng micro. Hãy bật quyền micro cho trang này, hoặc gõ lời nói vào ô bên dưới.',
  'service-not-allowed': 'Trình duyệt không cho dùng nhận dạng giọng nói ở đây (thường do chưa bật dịch vụ giọng nói của máy). Hãy gõ vào ô bên dưới.',
  'no-speech': 'Chưa nghe thấy tiếng nói. Bấm micro và nói lại, nói gần micro hơn một chút.',
  'audio-capture': 'Không tìm thấy micro. Kiểm tra micro của máy hoặc gõ vào ô bên dưới.',
  network: 'Nhận dạng giọng nói cần mạng (âm thanh được trình duyệt gửi tới dịch vụ của hãng). Hiện không có mạng, hãy gõ vào ô bên dưới.',
  'language-not-supported': 'Trình duyệt này chưa hỗ trợ nhận dạng tiếng Việt. Hãy gõ vào ô bên dưới.',
  aborted: '',
};

/**
 * @param {{placeholder:string, nutText:string, vidu:string[], onNoi:(alts:string[], cuoi:boolean)=>void, tieuDe?:string}} o
 * onNoi được gọi với danh sách lời nói thay thế (đã sắp theo độ tin cậy) và cờ cuoi=true khi đã nói xong hoặc người dùng bấm nút.
 */
export function taoVoiceBox({ placeholder, nutText = 'Tính', vidu = [], onNoi }) {
  const SR = layNhanDang();
  let rec = null;
  let dangNghe = false;

  const input = h('input', {
    type: 'text', id: idMoi('v'), class: 'voice-in', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go',
    'aria-label': 'Ô gõ lời nói',
  });
  const trangThai = h('div', { class: 'voice-status', role: 'status', 'aria-live': 'polite' });
  const mic = h('button', {
    type: 'button', class: 'mic' + (SR ? '' : ' off'), 'aria-label': 'Nói', 'aria-pressed': 'false', title: SR ? 'Bấm để nói' : 'Trình duyệt chưa hỗ trợ giọng nói',
  }, svg(MIC_SVG));
  const nut = h('button', { type: 'button', class: 'btn primary go' }, nutText);

  const thongBao = SR
    ? h('div', { class: 'note small' }, 'Bấm micro rồi nói. Việc nhận giọng nói do trình duyệt của bạn thực hiện (Chrome, Safari có thể gửi âm thanh tới máy chủ của hãng). 9unit không lưu và không gửi đi đâu. Luôn soát lại số và chữ trước khi tin kết quả.')
    : h('div', { class: 'note warn', 'data-testid': 'khong-ho-tro' },
      'Trình duyệt này chưa hỗ trợ nhận giọng nói (Firefox, một số trình duyệt trong ứng dụng, Safari trên iPhone dùng chế độ màn hình chính...). Bạn vẫn dùng được: gõ lời nói vào ô bên dưới, ví dụ "ba triệu cộng hai trăm nghìn", hoặc dùng bàn phím số. Muốn nói, hãy mở bằng Chrome trên Android hoặc máy tính.');

  function dat(t, cls = '') { trangThai.textContent = t; trangThai.className = 'voice-status ' + cls; }

  function gui() {
    const v = input.value.trim();
    if (!v) { dat('Hãy nói hoặc gõ gì đó trước.', 'err'); input.focus(); return; }
    dat('');
    onNoi([v], true);
  }
  nut.addEventListener('click', gui);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gui(); } });

  function dung() {
    try { rec && rec.stop(); } catch { /* đã dừng */ }
  }

  mic.addEventListener('click', () => {
    if (!SR) { dat('Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy gõ vào ô bên dưới.', 'err'); input.focus(); return; }
    if (dangNghe) { dung(); return; }
    try {
      rec = new SR();
    } catch {
      dat('Không khởi động được nhận giọng nói. Hãy gõ vào ô bên dưới.', 'err');
      return;
    }
    rec.lang = 'vi-VN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let daCoCuoi = false;
    rec.onstart = () => {
      dangNghe = true; mic.classList.add('live'); mic.setAttribute('aria-pressed', 'true'); mic.setAttribute('aria-label', 'Dừng nghe');
      dat('Đang nghe... hãy nói.', 'live');
    };
    rec.onresult = (ev) => {
      let tam = ''; let cuoiAlts = null;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          cuoiAlts = [];
          for (let j = 0; j < r.length; j++) cuoiAlts.push(r[j].transcript);
        } else tam += r[0].transcript;
      }
      if (cuoiAlts && cuoiAlts.length) {
        daCoCuoi = true;
        input.value = cuoiAlts[0].trim();
        dat('Đã nghe: "' + input.value + '"', 'ok');
        onNoi(cuoiAlts.map((s) => s.trim()).filter(Boolean), true);
      } else if (tam) {
        input.value = tam.trim();
        dat('Đang nghe: "' + tam.trim() + '"', 'live');
      }
    };
    rec.onerror = (ev) => {
      const m = LOI_NHAN_DANG[ev.error];
      if (m === undefined) dat('Lỗi nhận giọng nói (' + ev.error + '). Hãy gõ vào ô bên dưới.', 'err');
      else if (m) dat(m, 'err');
    };
    rec.onend = () => {
      dangNghe = false; mic.classList.remove('live'); mic.setAttribute('aria-pressed', 'false'); mic.setAttribute('aria-label', 'Nói');
      if (!daCoCuoi && trangThai.className.indexOf('err') < 0) {
        if (input.value.trim()) { dat('Đã dừng. Bấm "' + nutText + '" để dùng lời vừa nghe.', ''); } else dat('Chưa nghe thấy gì. Bấm micro và nói lại.', 'err');
      }
    };
    try { rec.start(); } catch { dat('Không bật được micro. Thử lại hoặc gõ vào ô bên dưới.', 'err'); }
  });

  const chips = vidu.length
    ? h('div', { class: 'chips', 'aria-label': 'Ví dụ' }, vidu.map((v) => h('button', {
      type: 'button', class: 'chip', onclick: () => { input.value = v; gui(); },
    }, v)))
    : null;

  const el = h('section', { class: 'card voice' },
    h('div', { class: 'voice-row' }, mic, input, nut),
    trangThai,
    chips,
    thongBao);
  return {
    el, input, hoTro: !!SR,
    dat: (v) => { input.value = v; },
    thongBao: dat,
    dung,
  };
}
