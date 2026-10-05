// Ô ghi nhanh chi tiêu: gõ một câu hoặc nói (vi-VN) -> tách số tiền và danh mục. Không lưu nguyên câu.
import { h, svg, ICON, idMoi, dong, thongBao } from './dom.js';
import { phanTichChiTieu, dmTheoId, HU } from '../lib/spend.js';
import { homNay, dinhDangNgayNgan } from '../lib/dates.js';
import { sua, moiId } from '../lib/store.js';

export function layNhanDang() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

const LOI_GIONG = {
  'not-allowed': 'Trình duyệt chưa cho dùng micro. Hãy bật quyền micro cho trang này, hoặc gõ vào ô bên cạnh.',
  'service-not-allowed': 'Trình duyệt không cho dùng nhận giọng nói ở đây. Hãy gõ vào ô bên cạnh.',
  'no-speech': 'Chưa nghe thấy tiếng nói. Bấm micro và nói lại, gần micro hơn một chút.',
  'audio-capture': 'Không thấy micro. Hãy kiểm tra micro hoặc gõ vào ô bên cạnh.',
  network: 'Nhận giọng nói cần mạng (trình duyệt gửi âm thanh tới dịch vụ của hãng). Hiện không có mạng, hãy gõ.',
  'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận tiếng Việt. Hãy gõ vào ô bên cạnh.',
  aborted: '',
};

export function themKhoanChi(p, { thongBaoXong = true } = {}) {
  const id = moiId();
  sua((s) => { s.chi.push({ id, ngay: p.ngay, soTien: p.soTien, dm: p.dm }); });
  if (thongBaoXong) {
    const dm = dmTheoId(p.dm);
    thongBao(`Đã ghi ${dm.ten}: ${dong(p.soTien)}${p.ngay !== homNay() ? ` (ngày ${dinhDangNgayNgan(p.ngay)})` : ''}`, {
      hoanTac: () => sua((s) => { s.chi = s.chi.filter((c) => c.id !== id); }),
    });
  }
  return id;
}

export function ghiNhanh({ vidu = ['cà phê 45k', 'ăn trưa 50k', 'grab 80k', 'siêu thị 350k'] } = {}) {
  const SR = layNhanDang();
  let rec = null;
  let trang = 'nghi'; // nghi | nghe | xuly
  const input = h('input', {
    type: 'text', class: 'voice-in', id: idMoi('gn'), placeholder: 'Ví dụ: cà phê 45k', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    'aria-label': 'Ghi nhanh một khoản chi, gõ cả câu',
  });
  const status = h('div', { class: 'voice-status', role: 'status', 'aria-live': 'polite', hidden: true });
  const preview = h('div', { class: 'preview', hidden: true, 'aria-live': 'polite' });
  const mic = h('button', {
    type: 'button', class: 'mic' + (SR ? '' : ' off'), 'aria-label': 'Nói để ghi chi tiêu', 'aria-pressed': 'false',
    title: SR ? 'Bấm để nói' : 'Trình duyệt chưa hỗ trợ giọng nói',
  }, svg(ICON.mic));
  const nut = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'ghi' }, 'Ghi');

  const dat = (t, cls = '', spin = false) => { status.className = 'voice-status ' + cls; status.hidden = !t; status.replaceChildren(...(spin ? [h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', {}, t)] : [t])); };
  function datTrang(t) {
    trang = t;
    mic.classList.toggle('live', t === 'nghe');
    mic.classList.toggle('busy', t === 'xuly');
    mic.setAttribute('aria-pressed', String(t === 'nghe'));
    mic.setAttribute('aria-label', t === 'nghe' ? 'Dừng nghe' : t === 'xuly' ? 'Đang xử lý lời nói' : 'Nói để ghi chi tiêu');
    mic.replaceChildren(t === 'xuly' ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : svg(ICON.mic));
  }

  function capNhatXem() {
    const v = input.value.trim();
    preview.hidden = !v;
    if (!v) return null;
    const kq = phanTichChiTieu(v);
    if (!kq.ok) { preview.replaceChildren(h('span', { class: 'muted' }, 'Gõ thêm số tiền, ví dụ 45k hoặc 45 nghìn')); return kq; }
    const dm = dmTheoId(kq.dm);
    preview.replaceChildren(h('span', {}, 'Sẽ ghi: '), h('b', {}, dong(kq.soTien)), h('span', {}, '·'), h('b', {}, dm.ten), h('span', { class: 'muted' }, `· hũ ${HU[dm.hu].ten}`),
      kq.ngay !== homNay() ? h('span', { class: 'muted' }, `· ngày ${dinhDangNgayNgan(kq.ngay)}`) : null,
      kq.ngam ? h('span', { class: 'muted' }, '(hiểu là nghìn đồng)') : null);
    return kq;
  }
  input.addEventListener('input', () => { if (trang === 'nghi') dat(''); capNhatXem(); });

  function ghi() {
    const v = input.value.trim();
    if (!v) { dat('Hãy gõ hoặc nói một câu trước, ví dụ: cà phê 45k.', 'err'); input.focus(); return; }
    const kq = phanTichChiTieu(v);
    if (!kq.ok) { dat(kq.loi, 'err'); input.focus(); return; }
    nut.disabled = true;
    themKhoanChi(kq);
    input.value = '';
    preview.hidden = true;
  }
  nut.addEventListener('click', ghi);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ghi(); } });

  mic.addEventListener('click', () => {
    if (!SR) { dat('Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy gõ vào ô bên cạnh.', 'err'); input.focus(); return; }
    if (trang === 'nghe') { try { rec && rec.stop(); } catch { /* đã dừng */ } return; }
    if (trang === 'xuly') return;
    try { rec = new SR(); } catch { dat('Không bật được nhận giọng nói. Hãy gõ vào ô bên cạnh.', 'err'); return; }
    rec.lang = 'vi-VN'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 3;
    let coKetQua = false;
    rec.onstart = () => { datTrang('nghe'); dat('Đang nghe... hãy nói, ví dụ: cà phê bốn mươi lăm nghìn', 'live'); };
    rec.onspeechend = () => { if (trang === 'nghe') { datTrang('xuly'); dat('Đang xử lý lời nói...', 'busy', true); } };
    rec.onresult = (ev) => {
      let tam = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          // chọn phương án đầu tiên đọc ra được số tiền
          const alts = []; for (let j = 0; j < r.length; j++) alts.push(r[j].transcript.trim());
          const chon = alts.find((a) => phanTichChiTieu(a).ok) || alts[0];
          coKetQua = true;
          input.value = chon; datTrang('nghi');
          const kq = capNhatXem();
          if (kq && kq.ok) dat(`Đã nghe: "${chon}". Kiểm tra rồi bấm Ghi.`, 'ok');
          else dat(`Đã nghe: "${chon}" nhưng chưa thấy số tiền. Sửa lại trong ô hoặc nói lại.`, 'err');
        } else tam += r[0].transcript;
      }
      if (!coKetQua && tam) { input.value = tam.trim(); dat(`Đang nghe: "${tam.trim()}"`, 'live'); capNhatXem(); }
    };
    rec.onerror = (ev) => {
      const m = LOI_GIONG[ev.error];
      datTrang('nghi');
      dat(m === undefined ? `Lỗi nhận giọng nói (${ev.error}). Hãy gõ vào ô bên cạnh.` : m, m === '' ? '' : 'err');
      coKetQua = true; // đã báo lỗi, không báo thêm ở onend
    };
    rec.onend = () => {
      const dangXuLy = trang !== 'nghi';
      datTrang('nghi');
      if (!coKetQua && dangXuLy) dat('Chưa nghe rõ. Bấm micro và nói lại, hoặc gõ vào ô bên cạnh.', 'err');
    };
    try { rec.start(); } catch { datTrang('nghi'); dat('Không bật được micro. Thử lại hoặc gõ vào ô bên cạnh.', 'err'); }
  });

  const chips = h('div', { class: 'row', 'aria-label': 'Ví dụ' }, vidu.map((v) => h('button', { type: 'button', class: 'chip', onclick: () => { input.value = v; capNhatXem(); input.focus(); } }, v)));

  const el = h('section', { class: 'card', 'aria-label': 'Ghi nhanh chi tiêu' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Ghi nhanh chi tiêu')),
    h('div', { class: 'voice-row' }, input, mic, nut),
    status, preview, chips,
    h('div', { class: 'hint' }, SR ? 'Chỉ lưu số tiền, danh mục và ngày, không lưu nguyên câu. Giọng nói do trình duyệt xử lý (Chrome có thể gửi âm thanh tới máy chủ của hãng).' : 'Trình duyệt này chưa hỗ trợ giọng nói, bạn vẫn gõ được. Chỉ lưu số tiền, danh mục và ngày.'));
  return el;
}
