// Ô "ghi nhanh bằng một câu": gõ hoặc nói (Web Speech API, vi-VN). Không lưu câu gốc, chỉ chuyển kết quả sang biểu mẫu để soát.
import { h, svg } from './dom.js';
import { IC } from './icons.js';
import { phanTichCau } from '../lib/cau.js';
import { layDs } from '../lib/kho.js';

let tamLe = null;
/** Kết quả phân tích đang chờ soát (chỉ giữ trong bộ nhớ, không ghi ra đâu). */
export const datTamLe = (v) => { tamLe = v; };
export function layTamLe() { const v = tamLe; tamLe = null; return v; }

const LOI = {
  'not-allowed': 'Trình duyệt chưa cho dùng micro. Hãy bật quyền micro cho trang này, hoặc gõ câu vào ô bên cạnh.',
  'service-not-allowed': 'Trình duyệt không cho dùng nhận giọng nói ở đây. Hãy gõ câu vào ô bên cạnh.',
  'no-speech': 'Chưa nghe thấy tiếng nói. Bấm micro và nói lại, gần micro hơn một chút.',
  'audio-capture': 'Không tìm thấy micro. Kiểm tra micro của máy, hoặc gõ câu vào ô bên cạnh.',
  network: 'Nhận giọng nói cần mạng (âm thanh được trình duyệt gửi tới dịch vụ của hãng). Hiện không có mạng, hãy gõ câu vào ô bên cạnh.',
  'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận tiếng Việt. Hãy gõ câu vào ô bên cạnh.',
  aborted: '',
};
const VIDU = ['mừng cưới anh Hùng 1 triệu 2', 'chị Lan mừng mình 2 triệu đám cưới', 'phúng viếng bác Ba 500k'];
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

export function nhapNhanh({ khiXong }) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  let rec = null; let trang = 'nghi';
  const input = h('input', { type: 'text', id: 'nhap-nhanh', placeholder: 'Gõ một câu, hoặc bấm micro', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Gõ một câu để ghi nhanh', 'data-testid': 'nhap-nhanh' });
  const mic = h('button', { type: 'button', class: 'mic', 'data-testid': 'mic', 'aria-label': 'Nói để ghi nhanh', 'aria-pressed': 'false', title: SR ? 'Bấm để nói' : 'Trình duyệt này chưa hỗ trợ giọng nói' }, svg(IC.mic));
  const go = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'nhap-soat' }, 'Xem kết quả');
  const tt = h('div', { class: 'mic-status', role: 'status', 'aria-live': 'polite', 'data-testid': 'mic-trang-thai' });

  function dat(t, text = '', cls = '') {
    trang = t;
    tt.className = `mic-status ${cls}`.trim();
    tt.replaceChildren(...(t === 'xu-ly' ? [h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, text)] : [h('span', {}, text)]));
    mic.classList.toggle('live', t === 'nghe');
    mic.classList.toggle('busy', t === 'xu-ly');
    mic.setAttribute('aria-pressed', t === 'nghe' ? 'true' : 'false');
    mic.setAttribute('aria-label', t === 'nghe' ? 'Dừng nghe' : 'Nói để ghi nhanh');
    go.disabled = t === 'xu-ly'; mic.disabled = t === 'xu-ly';
    tt.dataset.trang = t;
  }

  async function xuLy(text) {
    const cau = String(text || '').trim();
    if (!cau) { dat('loi', 'Hãy nói hoặc gõ một câu trước, ví dụ “mừng cưới anh Hùng 1 triệu 2”.', 'err'); input.focus(); return; }
    dat('xu-ly', 'Đang xử lý…');
    await nghi(450); // đủ lâu để người dùng thấy máy đang làm việc
    const kq = phanTichCau(cau, { nguoi: layDs('people') });
    input.value = ''; // không giữ lại câu gốc
    dat('nghi', '');
    khiXong(kq);
  }
  go.addEventListener('click', () => xuLy(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); xuLy(input.value); } });

  mic.addEventListener('click', () => {
    if (!SR) { dat('loi', 'Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy gõ câu vào ô bên cạnh.', 'err'); input.focus(); return; }
    if (trang === 'nghe') { try { rec && rec.stop(); } catch { /* đã dừng */ } return; }
    try { rec = new SR(); } catch { dat('loi', 'Không khởi động được nhận giọng nói. Hãy gõ câu vào ô bên cạnh.', 'err'); return; }
    rec.lang = 'vi-VN'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 3;
    let cuoi = null; let daLoi = false;
    rec.onstart = () => dat('nghe', 'Đang nghe… hãy nói, ví dụ “mừng cưới anh Hùng 1 triệu 2”.', 'live');
    rec.onresult = (ev) => {
      let tam = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) cuoi = r[0].transcript; else tam += r[0].transcript;
      }
      if (cuoi) input.value = cuoi.trim(); else if (tam) input.value = tam.trim();
    };
    rec.onerror = (ev) => {
      daLoi = true;
      const m = LOI[ev.error];
      if (m === undefined) dat('loi', `Lỗi nhận giọng nói (${ev.error}). Hãy gõ câu vào ô bên cạnh.`, 'err');
      else if (m) dat('loi', m, 'err'); else dat('nghi', '');
    };
    rec.onend = () => {
      if (daLoi) return;
      if (cuoi) xuLy(cuoi);
      else if (input.value.trim()) xuLy(input.value);
      else dat('loi', 'Chưa nghe thấy gì. Bấm micro và nói lại.', 'err');
    };
    try { rec.start(); } catch { dat('loi', 'Không bật được micro. Thử lại hoặc gõ câu vào ô bên cạnh.', 'err'); }
  });

  const el = h('section', { class: 'card', 'aria-labelledby': 'nn-t' },
    h('h2', { id: 'nn-t' }, 'Ghi nhanh bằng một câu'),
    h('div', { class: 'quick-row' }, input, mic),
    h('div', { class: 'row-actions' }, go),
    tt,
    h('div', { class: 'chips', 'aria-label': 'Câu ví dụ' }, VIDU.map((v) => h('button', { type: 'button', class: 'chip', onclick: () => { input.value = v; xuLy(v); } }, v))),
    h('p', { class: 'hint' }, SR
      ? 'Bấm micro rồi nói. Việc nhận giọng nói do trình duyệt thực hiện (Chrome, Safari có thể gửi âm thanh tới máy chủ của hãng). 9gift không lưu câu bạn nói, chỉ giữ kết quả bạn bấm Lưu. Luôn soát lại số tiền.'
      : 'Trình duyệt này chưa hỗ trợ nhận giọng nói, bạn vẫn gõ câu vào ô được. Muốn nói, hãy mở bằng Chrome trên Android hoặc máy tính.'));
  return { el, input };
}
