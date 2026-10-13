import { h, toast, dialog } from '../ui.js';
import * as store from '../store.js';
import { GROUPS, QUESTIONS, TYPES, pickSession } from '../data/index.js';
import { STAR } from '../data/guides.js';
import { analyzeAnswer, quickCheck, fmtTime, countWords, PACE_NOTE } from '../analysis.js';
import { speak, stopSpeaking, ttsSupported, sttSupported, Recorder } from '../speech.js';
import { getConfig, requestFeedback } from '../api.js';
import { groupPicker } from './home.js';

export const session = { queue: [], i: 0, results: [] };

export function renderSetup(root) {
  const s = store.get().settings;
  let n = 5;
  const nSel = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Số câu' }, [3, 5, 8].map((v) =>
    h('button', { class: `chip${v === n ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(v === n), 'data-n': v, onclick: (e) => { n = v; [...nSel.children].forEach((c) => { c.classList.toggle('on', c === e.currentTarget); c.setAttribute('aria-checked', String(c === e.currentTarget)); }); } }, `${v} câu`)));
  root.replaceChildren(h('div', { class: 'page' },
    h('h1', { text: 'Luyện nói' }),
    h('p', { class: 'lead', text: 'Mỗi lượt là một bộ câu hỏi ngẫu nhiên. Bạn nghe câu hỏi, trả lời bằng giọng nói (hoặc gõ chữ), rồi xem phân tích: số từ, từ độn, tốc độ nói.' }),
    h('h2', { class: 'sec', text: 'Nhóm nghề' }), groupPicker(),
    h('h2', { class: 'sec', text: 'Số câu' }), nSel,
    h('div', { class: 'row' }, h('button', { class: 'btn primary big', type: 'button', id: 'btn-start', onclick: () => {
      session.queue = pickSession(s.group, n); session.i = 0; session.results = [];
      location.hash = '#/luyen/phien';
    } }, 'Bắt đầu luyện')),
    h('p', { class: 'muted small', text: sttSupported() ? 'Trình duyệt của bạn hỗ trợ nhận dạng giọng nói. Lần đầu bạn sẽ được hỏi quyền dùng micro.' : 'Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Bạn vẫn luyện được bằng cách gõ câu trả lời (khuyên dùng Chrome hoặc Edge để nói).' }),
    h('p', { class: 'muted small' }, 'Muốn luyện một câu cụ thể? Chọn trong ', h('a', { href: '#/hoi' }, 'Ngân hàng câu hỏi'), '.')));
}

export function renderSessionEnd(root) {
  if (!session.results.length) { location.hash = '#/luyen'; return; }
  root.replaceChildren(h('div', { class: 'page' },
    h('h1', { text: 'Hoàn thành bộ câu hỏi' }),
    h('div', { class: 'list' }, session.results.map((r) => h('div', { class: 'card' },
      h('p', { class: 'qtext', text: r.q.q }),
      h('div', { class: 'stats small' },
        h('div', null, h('b', { text: String(r.a.words) }), h('span', { text: 'từ' })),
        h('div', null, h('b', { text: String(r.a.fillers) }), h('span', { text: 'từ độn' })),
        h('div', null, h('b', { text: r.a.pace ? String(r.a.pace) : '-' }), h('span', { text: 'tiếng/phút' })),
        h('div', null, h('b', { text: r.ai != null ? `${r.ai}/10` : '-' }), h('span', { text: 'AI chấm' })))))),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/luyen' }, 'Luyện bộ mới'), h('a', { class: 'btn', href: '#/hoi' }, 'Xem ngân hàng câu hỏi'))));
}

// qid: luyện một câu lẻ; không có qid thì chạy theo session.queue
export function renderPractice(root, qid) {
  let q, inSession = false;
  if (qid) q = QUESTIONS.find((x) => x.id === qid);
  else { inSession = true; q = session.queue[session.i]; }
  if (!q) { location.hash = '#/luyen'; return null; }

  const st = { limit: 120, recording: false, spokenSec: 0, startedAt: 0, usedVoice: false, timer: null, analysis: null, aiOverall: null, rec: null, finishing: false };
  const timeEl = h('div', { class: 'timer', id: 'timer', 'aria-live': 'off', text: '0:00' });
  const barFill = h('div', { class: 'bar-fill' });
  const status = h('p', { class: 'muted small', id: 'rec-status', role: 'status', text: '' });
  const ta = h('textarea', { class: 'input answer', id: 'answer', rows: '7', placeholder: sttSupported() ? 'Bấm "Bắt đầu nói" rồi trả lời. Chữ sẽ hiện ở đây, bạn có thể sửa lại. Hoặc gõ trực tiếp.' : 'Gõ câu trả lời của bạn ở đây.', 'aria-label': 'Câu trả lời của bạn' });
  const resultBox = h('div', { id: 'result' });
  const recBtn = h('button', { class: 'btn primary big', type: 'button', id: 'btn-rec' }, 'Bắt đầu nói');
  const doneBtn = h('button', { class: 'btn', type: 'button', id: 'btn-analyze' }, 'Xem phân tích');
  const ttsBtn = h('button', { class: 'btn', type: 'button', id: 'btn-tts', onclick: () => {
    if (!ttsSupported()) { toast('Trình duyệt chưa hỗ trợ đọc câu hỏi'); return; }
    speak(q.q);
  } }, 'Nghe câu hỏi');

  const elapsed = () => st.spokenSec + (st.recording ? (performance.now() - st.startedAt) / 1000 : 0);
  const tick = () => {
    const e = elapsed();
    timeEl.textContent = fmtTime(e);
    barFill.style.width = `${Math.min(100, (e / st.limit) * 100)}%`;
    barFill.classList.toggle('warn', e > st.limit * 0.85);
    if (st.recording && e >= st.limit) stopRec(true);
  };

  const rec = sttSupported() ? new Recorder({
    onText: (t) => { ta.value = t; },
    onState: () => {},
    onError: (code) => {
      st.recording = false; recBtn.textContent = 'Bắt đầu nói'; recBtn.classList.remove('rec');
      status.textContent = code === 'denied' ? 'Chưa được cấp quyền micro. Bạn có thể cho phép micro trong cài đặt trình duyệt, hoặc gõ câu trả lời.' : 'Nhận dạng giọng nói gặp lỗi. Bạn thử lại hoặc gõ câu trả lời.';
    },
  }) : null;
  st.rec = rec;

  function startRec() {
    if (!rec) { toast('Trình duyệt chưa hỗ trợ nhận dạng giọng nói, hãy gõ câu trả lời'); ta.focus(); return; }
    stopSpeaking();
    if (!rec.start(ta.value)) return;
    st.recording = true; st.usedVoice = true; st.startedAt = performance.now();
    recBtn.textContent = 'Dừng'; recBtn.classList.add('rec');
    status.textContent = 'Đang nghe... Nói tự nhiên như trong buổi phỏng vấn.';
    clearInterval(st.timer); st.timer = setInterval(tick, 250);
  }
  function stopRec(auto) {
    if (!st.recording) return;
    st.spokenSec += (performance.now() - st.startedAt) / 1000;
    st.recording = false;
    rec.stop();
    ta.value = rec.text || ta.value;
    recBtn.textContent = 'Nói tiếp'; recBtn.classList.remove('rec');
    status.textContent = auto ? 'Hết giờ hẹn. Bạn có thể sửa lại chữ rồi xem phân tích.' : 'Đã dừng. Sửa lại chữ nếu máy nghe sai, rồi xem phân tích.';
    tick();
    // kết quả cuối có thể đến muộn một chút sau khi dừng
    setTimeout(() => { if (!st.recording && rec.text && rec.text.length > ta.value.length) ta.value = rec.text; }, 600);
  }
  recBtn.addEventListener('click', () => (st.recording ? stopRec(false) : startRec()));

  const limitSel = h('select', { class: 'input small-sel', id: 'limit', 'aria-label': 'Hẹn giờ', onchange: (e) => { st.limit = parseInt(e.target.value, 10); tick(); } },
    [60, 90, 120, 180].map((v) => h('option', { value: v, selected: v === st.limit }, `Hẹn giờ ${v / 60 >= 1 && v % 60 === 0 ? v / 60 + ' phút' : v + ' giây'}`)));

  async function analyze() {
    if (st.recording) stopRec(false);
    const text = ta.value.trim();
    if (text.length < 5) { toast('Hãy trả lời trước đã (nói hoặc gõ)'); return; }
    const spoken = st.usedVoice && st.spokenSec >= 5;
    const a = analyzeAnswer({ text, durationSec: spoken ? Math.round(st.spokenSec) : null, spoken, voiceWords: spoken && rec ? countWords(rec.voiceText) : null });
    st.analysis = a;
    store.addHistory({ ts: Date.now(), qid: q.id, words: a.words, fillers: a.fillers, durationSec: spoken ? Math.round(st.spokenSec) : null, pace: a.pace, text: text.slice(0, 1500) });
    if (inSession) { const prev = session.results.find((r) => r.q.id === q.id); if (prev) { prev.a = a; } else session.results.push({ q, a, ai: null }); }
    drawResult(text);
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  doneBtn.addEventListener('click', analyze);

  function statTile(label, value, sub) { return h('div', { class: 'stat' }, h('b', { text: value }), h('span', { text: label }), sub ? h('small', { text: sub }) : null); }

  function drawResult(text) {
    const a = st.analysis;
    const qc = quickCheck(text, { star: !!q.star });
    const fillerChips = Object.entries(a.fillerByWord).map(([w, n]) => h('span', { class: 'tag warn', text: `"${w}" x${n}` }));
    const aiBox = h('div', { id: 'ai-box' });
    resultBox.replaceChildren(h('div', { class: 'card result' },
      h('h2', { class: 'sec', text: 'Phân tích câu trả lời' }),
      h('div', { class: 'stats' },
        statTile('từ', String(a.words)),
        statTile('từ độn', String(a.fillers), a.words ? `${a.fillerPer100} trên 100 từ` : ''),
        statTile('tiếng/phút', a.pace ? String(a.pace) : '-', a.paceLabel ? a.paceLabel.text : 'Chỉ đo khi bạn nói'),
        statTile('thời lượng', a.durationSec != null ? fmtTime(a.durationSec) : '-', a.durationLabel ? a.durationLabel.text : '')),
      fillerChips.length ? h('div', { class: 'chips wrap' }, fillerChips) : h('p', { class: 'muted small', text: 'Không phát hiện từ độn trong chữ ghi được.' }),
      a.paceSkipped ? h('p', { class: 'muted small', text: 'Không đo tốc độ vì phần lớn chữ do bạn gõ hoặc sửa tay, không phải từ giọng nói.' }) : null,
      a.pace ? h('p', { class: 'muted small', text: PACE_NOTE }) : null,
      a.durationSec != null ? h('p', { class: 'muted small', text: 'Lưu ý: nhận dạng giọng nói của trình duyệt thường tự bỏ "ờ", "à", "ừm", nên số từ độn từ giọng nói chỉ là mức tối thiểu. Hãy nghe lại chính mình để tự đánh giá thêm.' }) : null,
      qc.tips.length ? h('div', null, h('h3', { text: 'Gợi ý nhanh (kiểm tra bằng từ khóa)' }), h('ul', { class: 'bul' }, qc.tips.map((t) => h('li', { text: t })))) : h('p', { class: 'ok', text: 'Cấu trúc nhìn ổn theo kiểm tra nhanh. Đọc ví dụ và nhờ AI chấm để biết thêm.' }),
      qc.star ? h('div', { class: 'starrow', 'aria-label': 'STAR' }, STAR.map((s, i) => { const key = ['situation', 'task', 'action', 'result'][i]; return h('span', { class: `star${qc.star[key] ? ' yes' : ''}`, text: `${s.k} ${qc.star[key] ? 'có' : 'thiếu'}` }); })) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', id: 'btn-ai', onclick: () => runAi(text, aiBox) }, 'Chấm bằng AI'),
        h('button', { class: 'btn', type: 'button', onclick: () => showModel() }, 'Xem ý đồ và ví dụ mẫu')),
      aiBox,
      nextRow()));
    getConfig().then((c) => { if (!c.ai) { const b = document.getElementById('btn-ai'); if (b) { b.disabled = true; b.textContent = 'AI chấm bài đang tắt'; } } });
  }

  function nextRow() {
    const last = !inSession || session.i >= session.queue.length - 1;
    return h('div', { class: 'row end' },
      h('button', { class: 'btn', type: 'button', id: 'btn-retry', onclick: () => { stopSpeaking(); renderRoute(); } }, 'Làm lại câu này'),
      inSession ? h('button', { class: 'btn primary', type: 'button', id: 'btn-next', onclick: () => { if (last) location.hash = '#/luyen/xong'; else { session.i++; location.hash = '#/luyen/phien'; renderRoute(); } } }, last ? 'Hoàn thành' : 'Câu tiếp theo') : h('a', { class: 'btn primary', href: '#/hoi' }, 'Về ngân hàng câu hỏi'));
  }
  // vẽ lại cùng route khi chỉ đổi chỉ số câu
  function renderRoute() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

  function showModel() {
    dialog({ title: 'Ý đồ và ví dụ mẫu', body: h('div', { class: 'model' },
      h('div', { class: 'eyebrow', text: 'Nhà tuyển dụng muốn biết' }), h('p', { text: q.intent }),
      h('div', { class: 'eyebrow', text: 'Cách trả lời' }), h('ul', { class: 'bul' }, q.tips.map((t) => h('li', { text: t }))),
      h('div', { class: 'eyebrow', text: 'Ví dụ (minh họa, hãy dùng trải nghiệm thật của bạn)' }), h('p', { text: q.sample })),
    actions: [{ id: 'ok', label: 'Đóng', kind: 'primary' }] });
  }

  async function ensureConsent() {
    const s = store.get().settings;
    if (s.consentAi) return true;
    const r = await dialog({ title: 'Gửi câu trả lời cho AI?', body: h('div', null,
      h('p', { text: 'Khi bấm chấm bằng AI, câu hỏi và nội dung câu trả lời của bạn (chữ, không phải ghi âm) sẽ được gửi tới máy chủ 9interview rồi chuyển tới dịch vụ AI Google Gemini để nhận xét.' }),
      h('p', { text: 'Máy chủ 9interview không lưu nội dung này. Google xử lý theo chính sách riêng của họ. Đừng ghi tên thật, số điện thoại hay thông tin nhạy cảm vào câu trả lời.' })),
    actions: [{ id: 'cancel', label: 'Không gửi' }, { id: 'ok', label: 'Đồng ý, chấm giúp tôi', kind: 'primary' }] });
    if (r === 'ok') { s.consentAi = true; store.save(); return true; }
    return false;
  }

  async function runAi(text, box) {
    if (!(await ensureConsent())) return;
    const btn = document.getElementById('btn-ai'); btn.disabled = true; btn.textContent = 'Đang chấm...';
    box.replaceChildren(h('p', { class: 'muted', role: 'status', text: 'AI đang đọc câu trả lời của bạn, khoảng vài giây...' }));
    try {
      const fb = await requestFeedback({ question: q.q, answer: text, group: q.g, type: q.t, intent: q.intent, durationSec: st.analysis.durationSec ?? undefined, fillers: st.analysis.fillers });
      st.aiOverall = fb.overall;
      const r = session.results.find((x) => x.q.id === q.id); if (r) r.ai = fb.overall;
      box.replaceChildren(drawFeedback(fb));
      btn.textContent = 'Chấm lại bằng AI'; btn.disabled = false;
    } catch (e) {
      box.replaceChildren(h('p', { class: 'err', role: 'alert', text: e.message }));
      btn.textContent = 'Thử chấm lại'; btn.disabled = e.code === 'ai_disabled';
    }
  }

  function drawFeedback(fb) {
    return h('div', { class: 'feedback', id: 'feedback' },
      h('div', { class: 'score' }, h('b', { text: String(fb.overall) }), h('span', { text: '/10' })),
      fb.summary ? h('p', { class: 'fb-sum', text: fb.summary }) : null,
      q.star ? h('div', { class: 'starrow' }, STAR.map((s, i) => { const key = ['situation', 'task', 'action', 'result'][i]; return h('span', { class: `star${fb.star[key] ? ' yes' : ''}`, text: `${s.k} ${fb.star[key] ? 'có' : 'thiếu'}` }); })) : null,
      h('div', { class: 'crit' }, fb.criteria.map((c) => h('div', { class: 'crit-row' },
        h('div', { class: 'crit-head' }, h('span', { text: c.label }), h('b', { text: `${c.score}/10` })),
        h('div', { class: 'meter' }, h('i', { style: `width:${c.score * 10}%` })),
        c.comment ? h('p', { class: 'small', text: c.comment }) : null))),
      fb.strengths.length ? h('div', null, h('h3', { text: 'Điểm tốt' }), h('ul', { class: 'bul' }, fb.strengths.map((t) => h('li', { text: t })))) : null,
      fb.improvements.length ? h('div', null, h('h3', { text: 'Nên cải thiện' }), h('ul', { class: 'bul' }, fb.improvements.map((t) => h('li', { text: t })))) : null,
      fb.rewriteHint ? h('div', null, h('h3', { text: 'Gợi ý sắp xếp lại ý' }), h('p', { text: fb.rewriteHint })) : null,
      fb.rewriteHintDropped ? h('p', { class: 'muted small', text: 'Một gợi ý của AI bị bỏ vì chứa con số không có trong câu trả lời của bạn.' }) : null,
      h('p', { class: 'muted small', text: 'AI có thể sai hoặc đánh giá chưa trọn vẹn. Hãy xem đây là một góc nhìn tham khảo.' }));
  }

  const head = inSession ? h('div', { class: 'progress', 'aria-label': 'Tiến độ' }, `Câu ${session.i + 1} / ${session.queue.length}`) : null;
  root.replaceChildren(h('div', { class: 'page practice' },
    head,
    h('div', { class: 'card qcard' },
      h('div', { class: 'qmeta' }, h('span', { class: 'tag', text: (GROUPS.find((g) => g.id === q.g) || {}).name }), h('span', { class: 'tag alt', text: TYPES[q.t] })),
      h('h1', { class: 'qbig', id: 'q-text', text: q.q }),
      h('div', { class: 'row' }, ttsBtn, limitSel)),
    h('div', { class: 'timerbox' }, timeEl, h('div', { class: 'bar' }, barFill)),
    h('div', { class: 'row' }, recBtn, doneBtn),
    status, ta,
    h('p', { class: 'muted small' }, sttSupported() ? 'Giọng nói được nhận dạng ngay trong trình duyệt của bạn (có thể do nhà cung cấp trình duyệt xử lý). Ghi âm không được lưu.' : 'Hãy luyện nói to rồi gõ lại ý chính, hoặc dùng Chrome, Edge để nhận dạng giọng nói.'),
    resultBox));

  return () => { clearInterval(st.timer); try { rec && st.recording && rec.stop(); } catch { /* bỏ qua */ } stopSpeaking(); };
}
