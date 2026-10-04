// Luyện tập từng câu (có đáp án ngay) và thi thử (chấm khi nộp bài).
import { h, mount, icon, toast, openSheet, confirmSheet, fmtTime } from '../ui.js';
import { D, cfg, hang, isCrit, record, profileId, spec, states, CHAPTER_SHORT } from '../state.js';
import { store } from '../store.js';
import { buildExam, gradeExam, srsUpdates } from '../core.js';
import { examSpec } from '../rules.js';
import { REPORT_EMAIL } from '../config.js';

export const nav = { go: (hash) => { location.hash = hash; }, focus: (on) => document.body.classList.toggle('focus', !!on) };

// ---------- mẹo nhớ ----------
export function tipFor(q) {
  const t = D.tipByQ.get(q.id);
  if (t) return { title: t.tieu_de, text: t.noi_dung };
  if (/^Cả (hai|ba) ý trên/.test(q.opts[q.a])) {
    const g = D.tips.chu_de.find((x) => x.id === 'thieu-tuy-tien');
    if (g) return { title: g.tieu_de, text: g.noi_dung };
  }
  return null;
}

// ---------- thẻ câu hỏi ----------
export function questionCard({ q, chosen, reveal, onPick, flagged, onFlag, label, lookup, hangId }) {
  const crit = isCrit(q.id, hangId || hang());
  const opts = q.opts.map((o, i) => {
    let cls = 'opt';
    if (reveal) {
      if (i === q.a) cls += ' right';
      else if (i === chosen) cls += ' wrong';
    } else if (i === chosen) cls += ' sel';
    return h('button', {
      class: cls, type: 'button', 'data-i': i, disabled: reveal || !onPick, 'aria-pressed': !reveal && i === chosen ? 'true' : 'false',
      onclick: () => onPick && onPick(i),
    }, h('span', { class: 'k' }, String(i + 1)), h('span', { class: 't' }, o));
  });
  const head = h('div', { class: 'qhead' },
    h('span', { class: 'qnum' }, label || `Câu ${q.id}`),
    h('span', { class: 'pill' }, CHAPTER_SHORT[q.ch]),
    crit ? h('span', { class: 'pill crit', title: 'Sai câu này là trượt phần lý thuyết' }, 'Điểm liệt') : null,
    h('span', { class: 'grow' }),
    onFlag ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': flagged ? 'Bỏ đánh dấu câu này' : 'Đánh dấu xem lại', 'aria-pressed': flagged ? 'true' : 'false', onclick: onFlag, style: flagged ? 'color:#c98a00' : null }, icon('flag', 20)) : null);
  const img = q.img ? h('img', {
    class: 'qimg', src: 'data/img/' + q.img, alt: `Hình minh họa của câu ${q.id}`, loading: 'eager', decoding: 'async',
    onclick: () => zoomImg(q),
    onerror: (e) => {
      const miss = h('div', { class: 'qimg-missing', role: 'img', 'aria-label': `Hình của câu ${q.id} chưa tải về máy` }, 'Hình của câu này chưa có trên máy và chưa tải được (đang ngoại tuyến hoặc mạng lỗi). Kết nối mạng để xem hình.');
      e.target.replaceWith(miss);
    },
  }) : null;
  const card = h('div', { class: 'card qcard' }, head, h('p', { class: 'qtext' }, q.q), img, h('div', { class: 'opts', role: 'group', 'aria-label': 'Các đáp án' }, opts));
  if (reveal) {
    const ok = chosen === q.a;
    const ex = h('div', { class: 'explain ' + (ok ? 'ok' : 'bad'), role: 'status' },
      lookup ? `Đáp án đúng: ${q.a + 1}.` : ok ? 'Chính xác.' : (chosen === undefined || chosen === null ? 'Bạn chưa chọn đáp án. ' : 'Chưa đúng. ') + `Đáp án đúng: ${q.a + 1}.`);
    card.append(ex);
    const tip = tipFor(q);
    if (tip) card.append(h('div', { class: 'tip' }, h('b', null, 'Mẹo nhớ: ' + tip.title), tip.text));
    card.append(h('div', { class: 'row mt' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => reportSheet(q) }, 'Báo sai dữ liệu câu này')));
  }
  return card;
}

export function zoomImg(q) {
  const img = h('img', { src: 'data/img/' + q.img, alt: `Hình của câu ${q.id}, phóng to` });
  openSheet(img, { zoom: true });
}

export function reportSheet(q) {
  const ta = h('textarea', { id: 'rp-note', placeholder: 'Ví dụ: đáp án đúng phải là 2 vì…, hoặc hình bị lỗi, thiếu chữ…', 'aria-label': 'Mô tả lỗi' });
  const body = () => [
    '[9license] Báo sai dữ liệu',
    q ? `Câu ${q.id} (${CHAPTER_SHORT[q.ch]})` : 'Báo chung về dữ liệu',
    q ? `Nội dung: ${q.q}` : '',
    q ? `Đáp án trong app: ${q.a + 1}. ${q.opts[q.a]}` : '',
    `Ghi chú: ${ta.value.trim() || '(chưa ghi)'}`,
    `Phiên bản dữ liệu: ${D.meta.version}`,
    `Bộ câu hỏi: ${D.meta.bo_cau_hoi.van_ban}`,
  ].filter(Boolean).join('\n');
  const done = () => {
    store.update((d) => d.reports.push({ t: Date.now(), id: q ? q.id : 0, note: ta.value.trim() }));
  };
  const children = [
    h('h2', null, q ? `Báo sai câu ${q.id}` : 'Báo sai dữ liệu'),
    h('p', { class: 'muted small' }, 'Dữ liệu lấy từ bộ 600 câu chính thức; nếu bạn thấy khác với văn bản chính thức hoặc file gốc, hãy ghi lại để chủ sản phẩm kiểm tra. App không tự gửi gì đi: bạn sao chép hoặc chia sẻ nội dung bên dưới.'),
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'rp-note' }, 'Mô tả lỗi'), ta),
    h('div', { class: 'btns mt' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        done();
        try { await navigator.clipboard.writeText(body()); toast('Đã sao chép nội dung báo sai'); } catch { toast('Không sao chép được, hãy chọn và chép thủ công'); }
      } }, 'Sao chép nội dung'),
      navigator.share ? h('button', { class: 'btn sec', type: 'button', onclick: async () => { done(); try { await navigator.share({ title: '9license: báo sai dữ liệu', text: body() }); } catch { /* người dùng hủy */ } } }, 'Chia sẻ') : null,
      REPORT_EMAIL ? h('a', { class: 'btn sec', href: 'mailto:' + REPORT_EMAIL + '?subject=' + encodeURIComponent('9license: báo sai dữ liệu') + '&body=' + encodeURIComponent(body()), onclick: done }, 'Gửi email') : null),
  ];
  openSheet(children);
}

// ---------- phiên luyện tập ----------
let session = null;
export const getSession = () => session;

export function startPractice({ title, ids, back = '#/hoc', i = 0, mode = 'luyen' }) {
  if (!ids.length) { toast('Không có câu nào để làm'); return; }
  session = { title, ids: ids.slice(), i, chosen: {}, back, mode, right: 0, done: 0 };
  nav.go('#/luyen');
}

function gridSheet(list, curIdx, statusOf, onJump, hangId) {
  const cells = list.map((id, idx) => {
    const st = statusOf(id, idx);
    return h('button', { class: 'ncell ' + st + (idx === curIdx ? ' cur' : '') + (isCrit(id, hangId || hang()) ? ' liet' : ''), type: 'button', 'aria-label': `Câu thứ ${idx + 1}, số ${id}${st === 'ok' ? ', đúng' : st === 'bad' ? ', sai' : st === 'done' ? ', đã chọn' : ''}`, onclick: () => { close(); onJump(idx); } }, String(idx + 1));
  });
  const close = openSheet([
    h('h2', null, 'Danh sách câu'),
    h('div', { class: 'ngrid' }, cells),
    h('div', { class: 'legend mt' }, h('span', null, h('i', { style: 'background:var(--ok-bg)' }), 'Đúng'), h('span', null, h('i', { style: 'background:var(--bad-bg)' }), 'Sai'), h('span', null, h('i', { style: 'background:var(--primary-weak)' }), 'Đã chọn'), h('span', null, h('i', { style: 'background:var(--crit)' }), 'Điểm liệt')),
    h('div', { class: 'btns mt' }, h('button', { class: 'btn sec', type: 'button', onclick: () => close() }, 'Đóng')),
  ]);
}

export function viewPractice(root) {
  if (!session) { nav.go('#/hoc'); return; }
  nav.focus(true);
  const s = session;
  const holder = h('div');
  const bar = h('div', { class: 'topbar' });
  const navBar = h('div', { class: 'qnav run' });
  mount(root, bar, holder, navBar);

  const onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (document.querySelector('#modal-root .overlay')) return;
    const q = D.byId.get(s.ids[s.i]);
    if (/^[1-4]$/.test(e.key)) { const n = +e.key - 1; if (n < q.opts.length) pick(n); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    else if (e.key === 'ArrowLeft') go(s.i - 1);
  };
  document.addEventListener('keydown', onKey);

  function pick(n) {
    const id = s.ids[s.i];
    if (s.chosen[id] !== undefined) return;
    const q = D.byId.get(id);
    s.chosen[id] = n;
    s.done++;
    const ok = n === q.a;
    if (ok) s.right++;
    record(id, ok);
    draw();
  }
  function go(i) {
    if (i < 0 || i >= s.ids.length) return;
    s.i = i;
    draw();
    window.scrollTo(0, 0);
  }
  function next() {
    if (s.i + 1 >= s.ids.length) return finish();
    go(s.i + 1);
  }
  function finish() {
    const wrongIds = s.ids.filter((id) => s.chosen[id] !== undefined && s.chosen[id] !== D.byId.get(id).a);
    const pct = s.done ? Math.round((s.right / s.done) * 100) : 0;
    mount(holder,
      h('div', { class: 'card result stack' },
        h('h1', null, 'Xong phiên luyện'),
        h('div', { class: 'score' }, `${s.right}/${s.done}`),
        h('p', { class: 'muted' }, s.done ? `Đúng ${pct}% số câu đã làm. Câu sai được đưa vào danh sách ôn lại.` : 'Bạn chưa trả lời câu nào.'),
        h('div', { class: 'btns' },
          wrongIds.length ? h('button', { class: 'btn', type: 'button', onclick: () => startPractice({ title: 'Làm lại câu vừa sai', ids: wrongIds, back: s.back }) }, `Làm lại ${wrongIds.length} câu sai`) : null,
          h('button', { class: 'btn sec', type: 'button', onclick: () => { session = null; nav.go(s.back); } }, 'Quay lại'))));
    mount(navBar);
    mount(bar, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: () => { session = null; nav.go(s.back); } }, icon('x')), h('div', { class: 'ttl' }, s.title));
  }
  function draw() {
    const id = s.ids[s.i];
    const q = D.byId.get(id);
    const chosen = s.chosen[id];
    mount(bar,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Thoát phiên luyện', onclick: () => { session = null; nav.go(s.back); } }, icon('x')),
      h('div', { class: 'ttl' }, s.title),
      h('button', { class: 'btn sec sm', type: 'button', 'aria-label': 'Xem danh sách câu', onclick: () => gridSheet(s.ids, s.i, (cid) => (s.chosen[cid] === undefined ? '' : s.chosen[cid] === D.byId.get(cid).a ? 'ok' : 'bad'), go) }, icon('grid', 18), `${s.i + 1}/${s.ids.length}`));
    mount(holder, questionCard({ q, chosen, reveal: chosen !== undefined, onPick: pick }));
    mount(navBar,
      h('button', { class: 'btn sec', type: 'button', disabled: s.i === 0, onclick: () => go(s.i - 1), 'aria-label': 'Câu trước' }, icon('back', 20), 'Trước'),
      h('button', { class: 'btn grow', type: 'button', onclick: next }, chosen === undefined ? 'Bỏ qua' : s.i + 1 >= s.ids.length ? 'Hoàn thành' : 'Câu tiếp', icon('next', 20)));
  }
  draw();
  return () => { document.removeEventListener('keydown', onKey); nav.focus(false); };
}

// ---------- thi thử ----------
export const examCur = () => store.get().cur;

export function startExam() {
  const h0 = hang();
  const p = profileId();
  let ex;
  try { ex = buildExam({ hang: h0, profile: p, questions: D.byId, sets: D.sets }); } catch (e) { toast('Không dựng được đề: ' + e.message); return; }
  store.update((d) => {
    d.cur = { ...ex, startedAt: Date.now(), answers: {}, flags: {}, i: 0 };
  });
  nav.go('#/thi/lam');
}

export function submitExam(auto) {
  const cur = store.get().cur;
  if (!cur) return;
  const g = gradeExam(cur, cur.answers, D.byId);
  const used = Math.min(cur.minutes * 60, Math.round((Date.now() - cur.startedAt) / 1000));
  const rec = {
    t: Date.now(), hang: cur.hang, profile: cur.profile, score: g.correct, total: g.total, passMark: cur.passMark, pass: g.pass,
    failReason: g.failReason, critWrong: g.critWrong, used, auto: !!auto, ids: cur.ids, ans: cur.ids.map((id) => (cur.answers[id] === undefined ? -1 : cur.answers[id])),
  };
  store.update((d) => {
    // Câu bỏ trống/chưa xem không ghi vào lặp lại ngắt quãng (không tính là "sai").
    for (const u of srsUpdates(cur, cur.answers, D.byId)) record(u.id, u.correct, rec.t);
    d.exams.push(rec);
    d.cur = null;
  });
  nav.go('#/thi/ket-qua/' + (store.get().exams.length - 1));
}

export function viewExam(root) {
  const cur = store.get().cur;
  if (!cur) { nav.go('#/thi'); return; }
  nav.focus(true);
  const holder = h('div');
  const bar = h('div', { class: 'topbar' });
  const navBar = h('div', { class: 'qnav exam' });
  mount(root, bar, holder, navBar);
  const total = cur.minutes * 60;
  const timerEl = h('span', { class: 'timer', role: 'timer', 'aria-label': 'Thời gian còn lại' }, '');
  let warned5 = false;
  let warned1 = false;
  let submitted = false;

  function remaining() { return total - (Date.now() - cur.startedAt) / 1000; }
  function tick() {
    const r = remaining();
    timerEl.textContent = fmtTime(r);
    timerEl.classList.toggle('low', r <= 60);
    if (r <= 300 && !warned5 && total > 600) { warned5 = true; toast('Còn 5 phút'); }
    if (r <= 60 && !warned1) { warned1 = true; toast('Còn 1 phút'); }
    if (r <= 0 && !submitted) { submitted = true; submitExam(true); }
  }
  const iv = setInterval(tick, 1000);
  tick();

  const onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (document.querySelector('#modal-root .overlay')) return;
    const q = D.byId.get(cur.ids[cur.i]);
    if (/^[1-4]$/.test(e.key)) { const n = +e.key - 1; if (n < q.opts.length) pick(n); }
    else if (e.key === 'ArrowRight') go(cur.i + 1);
    else if (e.key === 'ArrowLeft') go(cur.i - 1);
  };
  document.addEventListener('keydown', onKey);

  function pick(n) {
    const id = cur.ids[cur.i];
    cur.answers[id] = n;
    store.save();
    draw();
  }
  function go(i) {
    if (i < 0 || i >= cur.ids.length) return;
    cur.i = i;
    store.save();
    draw();
    window.scrollTo(0, 0);
  }
  async function askSubmit() {
    const un = cur.ids.filter((id) => cur.answers[id] === undefined).length;
    const fl = cur.ids.filter((id) => cur.flags[id]).length;
    const ok = await confirmSheet({
      title: 'Nộp bài?',
      text: un ? `Còn ${un} câu chưa trả lời${fl ? `, ${fl} câu đang đánh dấu` : ''}. Câu bỏ trống tính là sai. Nộp bài ngay?` : fl ? `Bạn còn ${fl} câu đánh dấu xem lại. Nộp bài ngay?` : 'Bạn đã trả lời hết các câu. Nộp bài ngay?',
      ok: 'Nộp bài', cancel: 'Làm tiếp',
    });
    if (ok && !submitted) { submitted = true; submitExam(false); }
  }
  function draw() {
    const id = cur.ids[cur.i];
    const q = D.byId.get(id);
    const answered = cur.ids.filter((x) => cur.answers[x] !== undefined).length;
    mount(bar,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Thoát bài thi', onclick: async () => {
        const ok = await confirmSheet({ title: 'Thoát bài thi?', text: 'Bài làm dở vẫn được giữ, bạn có thể làm tiếp. Đồng hồ vẫn chạy.', ok: 'Thoát', cancel: 'Ở lại' });
        if (ok) nav.go('#/thi');
      } }, icon('x')),
      h('div', { class: 'ttl' }, `Thi thử hạng ${cur.hang} · ${answered}/${cur.ids.length}`),
      timerEl,
      h('button', { class: 'btn sec sm', type: 'button', 'aria-label': 'Xem danh sách câu', onclick: () => gridSheet(cur.ids, cur.i, (cid) => (cur.answers[cid] === undefined ? '' : 'done') + (cur.flags[cid] ? ' flag' : ''), go, cur.hang) }, icon('grid', 18)));
    mount(holder, questionCard({
      q, hangId: cur.hang, chosen: cur.answers[id], reveal: false, onPick: pick, label: `Câu ${cur.i + 1}/${cur.ids.length}`,
      flagged: !!cur.flags[id], onFlag: () => { cur.flags[id] = !cur.flags[id]; store.save(); draw(); },
    }));
    const last = cur.i + 1 >= cur.ids.length;
    mount(navBar,
      h('button', { class: 'btn sec', type: 'button', disabled: cur.i === 0, onclick: () => go(cur.i - 1), 'aria-label': 'Câu trước' }, icon('back', 20)),
      last ? h('button', { class: 'btn grow', type: 'button', onclick: askSubmit }, 'Nộp bài')
        : h('button', { class: 'btn grow', type: 'button', onclick: () => go(cur.i + 1) }, 'Câu tiếp', icon('next', 20)),
      !last ? h('button', { class: 'btn sec', type: 'button', onclick: askSubmit }, 'Nộp') : null);
  }
  draw();
  return () => { clearInterval(iv); document.removeEventListener('keydown', onKey); nav.focus(false); };
}

export function viewResult(root, idx) {
  const exams = store.get().exams;
  const r = exams[idx];
  if (!r) { nav.go('#/thi'); return; }
  const h0 = r.hang;
  const reasonText = r.pass ? 'Bạn đạt phần lý thuyết thi thử.'
    : r.failReason === 'diem-liet' ? 'Trượt vì sai (hoặc bỏ trống) câu điểm liệt, dù điểm số có thể đủ.'
      : `Chưa đủ điểm: cần tối thiểu ${r.passMark}/${r.total}.`;
  const cells = r.ids.map((id, k) => {
    const q = D.byId.get(id);
    const ok = r.ans[k] === q.a;
    const liet = r.critWrong.includes(id) || (q.crit && isCrit(id, h0));
    return h('button', {
      class: 'ncell ' + (ok ? 'ok' : 'bad') + (liet ? ' liet' : ''), type: 'button', 'aria-label': `Câu thứ ${k + 1}, ${ok ? 'đúng' : r.ans[k] === -1 ? 'bỏ trống' : 'sai'}`,
      onclick: () => openSheet([
        questionCard({ q, hangId: h0, chosen: r.ans[k] === -1 ? undefined : r.ans[k], reveal: true, label: `Câu ${k + 1}/${r.total}` }),
        h('div', { class: 'btns mt' }, h('button', { class: 'btn sec', type: 'button', onclick: (e) => e.target.closest('.overlay').remove() }, 'Đóng')),
      ]),
    }, String(k + 1));
  });
  const wrongIds = r.ids.filter((id, k) => r.ans[k] !== D.byId.get(id).a);
  mount(root, h('div', { class: 'stack' },
    h('div', { class: 'card result ' + (r.pass ? 'pass' : 'fail') },
      h('p', { class: 'muted' }, `Thi thử hạng ${h0} · ${new Date(r.t).toLocaleString('vi-VN')}`),
      h('div', { class: 'score' }, `${r.score}/${r.total}`),
      h('div', { class: 'badge-big' }, r.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'),
      h('p', null, reasonText),
      h('p', { class: 'muted small' }, `Điểm đạt: ${r.passMark}/${r.total} · Thời gian làm: ${fmtTime(r.used)}/${fmtTime(examSpec(r.profile, h0).min * 60)} · ${r.profile === 'moi' ? 'Cấu trúc đề mới (từ 01/3/2027)' : 'Cấu trúc đề hiện hành'}`)),
    h('div', { class: 'btns' },
      wrongIds.length ? h('button', { class: 'btn', type: 'button', onclick: () => startPractice({ title: 'Ôn câu sai bài thi', ids: wrongIds, back: '#/thi/ket-qua/' + idx }) }, `Ôn lại ${wrongIds.length} câu sai`) : null,
      h('button', { class: 'btn sec', type: 'button', onclick: () => startExam() }, 'Thi lại đề khác'),
      h('a', { class: 'btn sec', href: '#/thi' }, 'Về trang thi thử')),
    h('div', null, h('h2', { class: 'sec-title' }, 'Xem lại từng câu'), h('div', { class: 'ngrid' }, cells),
      h('div', { class: 'legend mt' }, h('span', null, h('i', { style: 'background:var(--ok-bg)' }), 'Đúng'), h('span', null, h('i', { style: 'background:var(--bad-bg)' }), 'Sai hoặc bỏ trống'), h('span', null, h('i', { style: 'background:var(--crit)' }), 'Điểm liệt'))),
  ));
}
