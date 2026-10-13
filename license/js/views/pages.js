// Các màn hình: trang chủ, học, điểm liệt, biển báo, thi thử (giới thiệu), ôn lại.
import { h, mount, icon, openSheet, confirmSheet, fmtDate } from '../ui.js';
import { D, cfg, hang, poolIds, critIds, isCrit, counts, spec, profileId, states, CHAPTERS, CHAPTER_SHORT } from '../state.js';
import { store } from '../store.js';
import { shuffle, dayKey, daysUntil, isMastered, dueList, wrongList, DAY } from '../core.js';
import { HANGS, PROFILES, NGAY_DOI_QUY_DINH } from '../rules.js';
import { startPractice, startExam, examCur, questionCard, nav, submitExam } from './quiz.js';
import { SIGN_GROUPS, signGroup } from '../signs.js';
import { imageUrls, cachedSet, progress as prefetchProgress, onProgress as onPrefetch } from '../prefetch.js';

const GROUP_NAMES = {
  rules: 'quy tắc giao thông', crit: 'điểm liệt', culture: 'văn hóa, đạo đức', tech: 'kỹ thuật lái xe', build: 'cấu tạo, sửa chữa', signs: 'biển báo', sahinh: 'sa hình',
};

function bar(total, mastered, seen) {
  const m = (mastered / total) * 100;
  const s = ((seen - mastered) / total) * 100;
  return h('div', { class: 'bar', role: 'img', 'aria-label': `${mastered} câu vững, ${seen} câu đã làm trên ${total}` }, h('i', { style: `width:${m}%` }), h('i', { class: 'seen', style: `width:${Math.max(0, s)}%` }));
}

function statusClass(id) {
  const st = states()[id];
  if (!st || !st.s) return '';
  return st.l === 1 ? 'ok' : 'bad';
}

export function quickIds(n = 20) {
  const ids = poolIds();
  const st = states();
  const due = dueList(st, ids);
  const unseen = shuffle(ids.filter((id) => !st[id] || !st[id].s));
  const rest = shuffle(ids.filter((id) => st[id] && st[id].s && !due.includes(id)));
  return [...due, ...unseen, ...rest].slice(0, n);
}

// ---------- Trang chủ ----------
export function viewHome(root) {
  const h0 = hang();
  const c = counts();
  const sp = spec();
  const examDate = cfg().examDate;
  const left = examDate ? daysUntil(examDate) : null;
  const today = store.get().days[dayKey(Date.now())] || 0;
  const goal = cfg().goal || 20;
  const pid = profileId();
  const showChange = pid === 'hien-hanh';
  const nextSpec = PROFILES.moi.exams[h0];

  const hero = h('section', { class: 'card hero' },
    examDate
      ? h('div', null,
        left >= 0 ? h('div', { class: 'row' }, h('div', { class: 'big-num' }, String(left)), h('div', null, h('b', null, left === 0 ? 'Hôm nay là ngày thi' : 'ngày nữa là thi'), h('div', { class: 'small' }, `Hạng ${h0} · ${fmtDate(examDate)}`)))
          : h('div', null, h('b', null, 'Ngày thi đã qua'), h('div', { class: 'small' }, `${fmtDate(examDate)}. Đặt ngày mới nếu bạn thi lại.`)))
      : h('div', null, h('h1', null, `Ôn thi bằng lái hạng ${h0}`), h('p', { class: 'small' }, 'Đặt ngày thi để có đếm ngược và lịch nhắc ôn hằng ngày.')),
    h('div', { class: 'rules' },
      h('span', { class: 'pill' }, `${sp.n} câu`), h('span', { class: 'pill' }, `${sp.min} phút`), h('span', { class: 'pill' }, `đạt ${sp.pass}/${sp.n}`), h('span', { class: 'pill' }, 'sai câu điểm liệt là trượt')),
    h('div', { class: 'btns mt' },
      h('a', { class: 'btn', href: '#/thi' }, 'Thi thử ngay'),
      h('a', { class: 'btn sec', href: '#/cai-dat' }, examDate ? 'Đổi ngày thi' : 'Đặt ngày thi')));

  const banners = [];
  if (showChange && (!examDate || examDate < NGAY_DOI_QUY_DINH)) {
    banners.push(h('div', { class: 'banner' }, `Từ ngày 01/03/2027, đề lý thuyết hạng ${h0} theo Thông tư 108/2026/TT-BCA là ${nextSpec.n} câu, ${nextSpec.min} phút, đạt ${nextSpec.pass}. `, h('a', { href: '#/du-lieu' }, 'Xem nguồn và độ chắc chắn')));
  }
  const exp = cfg().gplxExpiry;
  if (exp) {
    const dl = daysUntil(exp);
    banners.push(h('div', { class: 'banner' }, dl < 0 ? `Giấy phép lái xe hiện có đã hết hạn từ ${fmtDate(exp)}.` : dl <= 90 ? `Giấy phép lái xe hiện có hết hạn sau ${dl} ngày (${fmtDate(exp)}): chuẩn bị đổi giấy phép.` : `Giấy phép lái xe hiện có hết hạn ngày ${fmtDate(exp)} (còn ${dl} ngày).`));
  }
  if (!store.persistent) banners.push(h('div', { class: 'banner' }, 'Trình duyệt đang chặn lưu dữ liệu: tiến độ chỉ giữ trong phiên này.'));

  const todayCard = h('section', { class: 'card stack' },
    h('div', { class: 'row between' }, h('h2', null, 'Hôm nay'), h('span', { class: 'pill' }, `${Math.min(today, goal)}/${goal} câu`)),
    h('div', { class: 'bar', role: 'img', 'aria-label': `Đã làm ${today} trên mục tiêu ${goal} câu hôm nay` }, h('i', { style: `width:${Math.min(100, (today / goal) * 100)}%` })),
    c.due.length
      ? h('button', { class: 'btn block', type: 'button', onclick: () => startPractice({ title: 'Ôn câu đến hạn', ids: c.due.slice(0, 30), back: '#/', mode: 'on' }) }, icon('redo', 20), `Ôn ${Math.min(30, c.due.length)} câu đến hạn`)
      : h('button', { class: 'btn block', type: 'button', onclick: () => startPractice({ title: 'Luyện nhanh', ids: quickIds(goal > 20 ? 20 : goal), back: '#/' }) }, icon('bolt', 20), 'Luyện nhanh ' + Math.min(20, goal) + ' câu'),
    h('p', { class: 'muted small' }, c.due.length ? `${c.due.length} câu đến hạn ôn theo lịch lặp lại ngắt quãng.` : 'Chưa có câu nào đến hạn. Học thêm câu mới để đều tay mỗi ngày.'));

  const pct = Math.round((c.mastered / c.total) * 100);
  const progressCard = h('section', { class: 'card row' },
    h('div', { class: 'ring', style: `--p:${pct}`, role: 'img', 'aria-label': `Đã vững ${pct}%` }, h('span', null, pct + '%')),
    h('div', { class: 'grow' },
      h('b', null, `Đã vững ${c.mastered}/${c.total} câu`),
      h('div', { class: 'muted small' }, `Đã làm ${c.seen} câu · còn ${c.total - c.seen} câu chưa làm`),
      h('div', { class: 'mt' }, bar(c.total, c.mastered, c.seen))));

  const critC = critIds();
  const critSeen = critC.filter((id) => states()[id] && states()[id].s).length;
  const tiles = h('div', { class: 'tiles' },
    tile('book', 'Học theo chương', `${poolIds().length} câu, 6 chương`, '#/hoc'),
    tile('test', 'Thi thử', `${sp.n} câu, ${sp.min} phút`, '#/thi'),
    tile('warn', 'Câu điểm liệt', `${critC.length} câu · ${critSeen} đã làm`, '#/hoc/diem-liet', true),
    tile('redo', 'Ôn câu sai', c.wrong.length ? `${c.wrong.length} câu cần ôn` : 'Chưa có câu sai', '#/on'),
    tile('sign', 'Biển báo', 'Tra cứu theo nhóm', '#/hoc/bien-bao'),
    tile('chart', 'Tiến độ', 'Thống kê, lịch sử thi', '#/tien-do'));

  mount(root, h('div', { class: 'stack' }, hero, banners, todayCard, progressCard, tiles, h('p', { class: 'muted small center' }, 'Dữ liệu: bộ 600 câu của Cục Cảnh sát giao thông. Chỉ để tham khảo, luôn đối chiếu quy định chính thức. ', h('a', { href: '#/du-lieu' }, 'Về dữ liệu'))));
}

function tile(ic, title, sub, href, crit) {
  return h('a', { class: 'tile' + (crit ? ' crit' : ''), href }, h('span', { class: 'ico' }, icon(ic, 20)), h('b', null, title), h('span', { class: 's' }, sub));
}

// ---------- Học ----------
export function viewLearn(root) {
  const ids = poolIds();
  const st = states();
  const rows = [1, 2, 3, 4, 5, 6].map((c) => {
    const list = ids.filter((id) => D.byId.get(id).ch === c);
    if (!list.length) return null;
    const seen = list.filter((id) => st[id] && st[id].s).length;
    const mastered = list.filter((id) => isMastered(st[id])).length;
    return h('a', { class: 'item', href: '#/hoc/c/' + c, 'aria-label': `Chương ${c}: ${CHAPTERS[c]}, ${list.length} câu` },
      h('div', { class: 'grow' }, h('b', null, `Chương ${c}. ${CHAPTER_SHORT[c]}`), h('div', { class: 'muted small' }, `${list.length} câu · ${seen} đã làm · ${mastered} vững`), h('div', { class: 'mt' }, bar(list.length, mastered, seen))),
      h('span', { class: 'chev' }, icon('next', 18)));
  });
  const imgBanner = h('div', { class: 'banner', hidden: true, id: 'img-banner', role: 'status' });
  const urls = imageUrls(D.questions);
  const refresh = async () => {
    if (!document.body.contains(imgBanner)) { off(); return; }
    if (!('caches' in window)) return;
    const haveSet = await cachedSet(urls);
    const have = haveSet.size;
    const missing = urls.length - have;
    let offline = navigator.onLine === false;
    if (!offline && missing > 0) {
      // navigator.onLine không đáng tin ở mọi trình duyệt: thử tải đúng một hình còn thiếu để biết có mạng thật không.
      try { const r = await fetch(urls.find((u) => !haveSet.has(u))); offline = !r.ok; } catch { offline = true; }
    }
    const text = offline && missing > 0 ? `Đang ngoại tuyến: ${missing}/${urls.length} hình chưa có trên máy nên các câu biển báo, sa hình tương ứng sẽ chưa hiện hình. Kết nối mạng để tải thêm.`
      : prefetchProgress.running ? `Đang tải nền hình để dùng ngoại tuyến: ${have}/${urls.length}.` : '';
    imgBanner.textContent = text;
    imgBanner.hidden = !text;
  };
  const off = onPrefetch(refresh);
  window.addEventListener('online', refresh, { once: true });
  window.addEventListener('offline', refresh, { once: true });
  queueMicrotask(refresh); // sau khi trang đã gắn vào DOM
  mount(root, h('div', { class: 'stack' },
    h('h1', null, `Học theo chương · hạng ${hang()}`),
    imgBanner,
    h('p', { class: 'muted' }, hang() === 'A1' || hang() === 'A' ? 'Hạng A1 và A dùng chung 250 câu chọn lọc từ bộ 600 câu.' : hang() === 'B1' ? 'Hạng B1 dùng 300 câu chọn lọc từ bộ 600 câu.' : 'Hạng này dùng toàn bộ 600 câu.'),
    h('div', { class: 'list' }, rows),
    h('h2', { class: 'sec-title' }, 'Chuyên đề'),
    h('div', { class: 'list' },
      h('a', { class: 'item', href: '#/hoc/diem-liet' }, h('span', { class: 'pill crit' }, 'Liệt'), h('div', { class: 'grow' }, h('b', null, 'Câu điểm liệt'), h('div', { class: 'muted small' }, `${critIds().length} câu: sai một câu là trượt`)), h('span', { class: 'chev' }, icon('next', 18))),
      h('a', { class: 'item', href: '#/hoc/bien-bao' }, icon('sign', 24), h('div', { class: 'grow' }, h('b', null, 'Tra cứu biển báo'), h('div', { class: 'muted small' }, 'Tìm theo từ khóa hoặc nhóm biển')), h('span', { class: 'chev' }, icon('next', 18))))));
}

function numberGrid(list, onOpen) {
  return h('div', { class: 'ngrid' }, list.map((id, i) => h('button', {
    class: 'ncell ' + statusClass(id) + (isCrit(id) ? ' liet' : ''), type: 'button', 'aria-label': `Câu ${id}${isCrit(id) ? ', điểm liệt' : ''}${statusClass(id) === 'ok' ? ', làm đúng' : statusClass(id) === 'bad' ? ', làm sai' : ', chưa làm'}`,
    onclick: () => onOpen(i),
  }, String(id))));
}

export function viewChapter(root, c) {
  c = +c;
  if (!CHAPTERS[c]) { nav.go('#/hoc'); return; }
  const all = poolIds().filter((id) => D.byId.get(id).ch === c).sort((a, b) => a - b);
  let filter = 'all';
  const holder = h('div');
  const seg = h('div', { class: 'segs', role: 'group', 'aria-label': 'Lọc câu' });
  const pick = () => {
    const st = states();
    if (filter === 'new') return all.filter((id) => !st[id] || !st[id].s);
    if (filter === 'wrong') return all.filter((id) => st[id] && st[id].l === 0);
    if (filter === 'mastered') return all.filter((id) => isMastered(st[id]));
    return all;
  };
  function draw() {
    const list = pick();
    mount(seg, [['all', 'Tất cả'], ['new', 'Chưa làm'], ['wrong', 'Đang sai'], ['mastered', 'Đã vững']].map(([k, t]) => h('button', { class: 'seg', type: 'button', 'aria-pressed': filter === k ? 'true' : 'false', onclick: () => { filter = k; draw(); } }, t)));
    mount(holder, list.length ? numberGrid(list, (i) => startPractice({ title: `Chương ${c}: ${CHAPTER_SHORT[c]}`, ids: list, i, back: '#/hoc/c/' + c })) : h('p', { class: 'muted center' }, 'Không có câu nào trong mục này.'));
  }
  const st = states();
  const firstNew = all.findIndex((id) => !st[id] || !st[id].s);
  mount(root, h('div', { class: 'stack' },
    h('a', { class: 'btn ghost sm', href: '#/hoc' }, icon('back', 18), 'Các chương'),
    h('h1', null, `Chương ${c}. ${CHAPTERS[c]}`),
    h('p', { class: 'muted' }, `${all.length} câu trong hạng ${hang()}. Chạm vào số câu để làm.`),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', type: 'button', onclick: () => startPractice({ title: `Chương ${c}: ${CHAPTER_SHORT[c]}`, ids: all, i: Math.max(0, firstNew), back: '#/hoc/c/' + c }) }, firstNew >= 0 ? 'Tiếp tục từ câu chưa làm' : 'Làm lại từ đầu'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => startPractice({ title: `Chương ${c} (ngẫu nhiên)`, ids: shuffle(all).slice(0, 20), back: '#/hoc/c/' + c }) }, '20 câu ngẫu nhiên')),
    seg, holder,
    h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--ok-bg)' }), 'Lần gần nhất đúng'), h('span', null, h('i', { style: 'background:var(--bad-bg)' }), 'Lần gần nhất sai'), h('span', null, h('i', { style: 'background:var(--crit)' }), 'Điểm liệt'))));
  draw();
}

export function viewCrit(root) {
  const ids = critIds().slice().sort((a, b) => a - b);
  const st = states();
  const notMastered = ids.filter((id) => !isMastered(st[id]));
  mount(root, h('div', { class: 'stack' },
    h('a', { class: 'btn ghost sm', href: '#/hoc' }, icon('back', 18), 'Học'),
    h('h1', null, 'Câu điểm liệt'),
    h('div', { class: 'card' },
      h('p', null, `Mỗi đề thi có đúng 1 câu điểm liệt chọn trong ${ids.length} câu dưới đây (hạng ${hang()}). Chọn sai câu này là không đạt phần lý thuyết, dù các câu khác đúng hết.`),
      h('p', { class: 'muted small mt' }, 'Đây là các tình huống mất an toàn giao thông nghiêm trọng: rượu bia, ma túy, vượt sai, nhường đường, xe máy, lùi xe, điện thoại khi lái, phanh và ga… Học thuộc cả 20-60 câu này trước.')),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', type: 'button', onclick: () => startPractice({ title: 'Câu điểm liệt', ids: shuffle(ids), back: '#/hoc/diem-liet' }) }, `Làm tất cả ${ids.length} câu`),
      h('button', { class: 'btn sec', type: 'button', disabled: !notMastered.length, onclick: () => startPractice({ title: 'Điểm liệt chưa vững', ids: shuffle(notMastered), back: '#/hoc/diem-liet' }) }, `Chỉ câu chưa vững (${notMastered.length})`)),
    numberGrid(ids, (i) => startPractice({ title: 'Câu điểm liệt', ids, i, back: '#/hoc/diem-liet' })),
    h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--ok-bg)' }), 'Lần gần nhất đúng'), h('span', null, h('i', { style: 'background:var(--bad-bg)' }), 'Lần gần nhất sai'))));
}

export function viewSigns(root) {
  const list = poolIds().filter((id) => D.byId.get(id).ch === 5).sort((a, b) => a - b).map((id) => D.byId.get(id));
  const groupOf = new Map(list.map((q) => [q.id, signGroup(q)]));
  let g = 'all';
  let text = '';
  const holder = h('div', { class: 'signs' });
  const chips = h('div', { class: 'segs', role: 'group', 'aria-label': 'Nhóm biển' });
  const input = h('input', { type: 'search', placeholder: 'Tìm: cấm rẽ trái, đường sắt, tốc độ…', 'aria-label': 'Tìm biển báo', oninput: (e) => { text = e.target.value.trim().toLowerCase(); draw(); } });
  const count = h('p', { class: 'muted small' });
  const startBtn = h('button', { class: 'btn', type: 'button' }, 'Luyện nhóm này');
  function filtered() {
    return list.filter((q) => (g === 'all' || groupOf.get(q.id) === g) && (!text || (q.q + ' ' + q.opts[q.a]).toLowerCase().includes(text)));
  }
  function draw() {
    const f = filtered();
    mount(chips, [{ id: 'all', ten: 'Tất cả' }, ...SIGN_GROUPS].map((x) => h('button', { class: 'seg', type: 'button', 'aria-pressed': g === x.id ? 'true' : 'false', onclick: () => { g = x.id; draw(); } }, x.ten)));
    count.textContent = `${f.length} câu về biển báo`;
    startBtn.onclick = () => startPractice({ title: 'Biển báo', ids: f.map((q) => q.id), back: '#/hoc/bien-bao' });
    startBtn.disabled = !f.length;
    mount(holder, f.length ? f.map((q) => h('button', {
      class: 'sign', type: 'button', onclick: () => openSheet([
        questionCard({ q, chosen: q.a, reveal: true, lookup: true }),
        h('p', { class: 'muted small mt' }, 'Đây là chế độ tra cứu: đáp án đúng đã được hiện sẵn.'),
        h('div', { class: 'btns mt' }, h('button', { class: 'btn sec', type: 'button', onclick: (e) => e.target.closest('.overlay').remove() }, 'Đóng')),
      ]),
    },
    h('img', { src: 'data/img/' + q.img, alt: `Hình của câu ${q.id}`, loading: 'lazy', decoding: 'async' }),
    h('span', { class: 'grow' }, h('b', null, `Câu ${q.id}. ${q.q}`), q.opts[q.a]))) : h('p', { class: 'muted center' }, 'Không tìm thấy câu phù hợp.'));
  }
  mount(root, h('div', { class: 'stack' },
    h('a', { class: 'btn ghost sm', href: '#/hoc' }, icon('back', 18), 'Học'),
    h('h1', null, 'Tra cứu biển báo'),
    h('p', { class: 'muted small' }, 'Lấy từ chương V của bộ câu hỏi (báo hiệu đường bộ). Nhóm được gợi ý tự động theo từ khóa trong câu hỏi, chỉ để tra cứu nhanh.'),
    input, chips, count, startBtn, holder));
  draw();
}

// ---------- Thi thử ----------
export function viewExamIntro(root) {
  const h0 = hang();
  const sp = spec();
  const pid = profileId();
  const cur = examCur();
  const exams = store.get().exams.map((e, i) => ({ e, i })).reverse().slice(0, 10);
  const groupsText = Object.entries(sp.groups).map(([k, n]) => `${n} câu ${GROUP_NAMES[k]}`).join(', ');
  const profile = PROFILES[pid];
  mount(root, h('div', { class: 'stack' },
    h('h1', null, `Thi thử hạng ${h0}`),
    h('section', { class: 'card stack' },
      h('div', { class: 'rules' }, h('span', { class: 'pill' }, `${sp.n} câu`), h('span', { class: 'pill' }, `${sp.min} phút`), h('span', { class: 'pill ok' }, `đạt từ ${sp.pass}/${sp.n}`), h('span', { class: 'pill crit' }, 'sai câu điểm liệt là trượt')),
      h('p', { class: 'muted small' }, `Cơ cấu đề: ${groupsText}.${pid === 'moi' ? ' (Đề mới: cơ cấu chia theo tỉ lệ cơ cấu hiện hành vì chưa có công bố chi tiết.)' : ''}`),
      h('p', { class: 'muted small' }, `Quy định áp dụng: ${profile.ten} · ${profile.vanBan}. `, h('a', { href: '#/du-lieu' }, 'Nguồn và ngày tra cứu')),
      cur
        ? h('div', { class: 'stack' }, h('div', { class: 'banner' }, `Bạn đang có bài thi dở (hạng ${cur.hang}, ${Object.keys(cur.answers).length}/${cur.ids.length} câu đã trả lời).`),
          h('div', { class: 'btns' },
            h('button', { class: 'btn', type: 'button', onclick: () => nav.go('#/thi/lam') }, 'Làm tiếp'),
            h('button', { class: 'btn sec', type: 'button', onclick: async () => { if (await confirmSheet({ title: 'Nộp bài đang làm?', text: 'Bài sẽ được chấm ngay với những câu đã trả lời.', ok: 'Nộp bài' })) submitExam(false); } }, 'Nộp bài ngay'),
            h('button', { class: 'btn sec', type: 'button', onclick: async () => { if (await confirmSheet({ title: 'Bỏ bài đang làm?', text: 'Kết quả sẽ không được lưu.', ok: 'Bỏ bài', danger: true })) { store.update((d) => { d.cur = null; }); viewExamIntro(root); } } }, 'Bỏ bài')))
        : h('button', { class: 'btn block', type: 'button', onclick: () => startExam() }, 'Bắt đầu thi thử'),
      h('p', { class: 'muted small' }, 'Đề được trộn ngẫu nhiên từ ngân hàng câu hỏi của hạng, đồng hồ đếm ngược. Hết giờ bài tự nộp. Thứ tự đáp án giữ nguyên như đề gốc.')),
    h('h2', { class: 'sec-title' }, 'Lịch sử thi thử'),
    exams.length ? h('div', { class: 'list' }, exams.map(({ e, i }) => h('a', { class: 'item', href: '#/thi/ket-qua/' + i },
      h('span', { class: 'pill ' + (e.pass ? 'ok' : 'bad') }, e.pass ? 'Đạt' : 'Trượt'),
      h('div', { class: 'grow' }, h('b', null, `${e.score}/${e.total} · hạng ${e.hang}`), h('div', { class: 'muted small' }, new Date(e.t).toLocaleString('vi-VN') + (e.failReason === 'diem-liet' ? ' · sai câu điểm liệt' : ''))),
      h('span', { class: 'chev' }, icon('next', 18)))))
      : h('p', { class: 'muted' }, 'Chưa có bài thi thử nào.')));
}

// ---------- Ôn lại ----------
export function viewReview(root) {
  const c = counts();
  const st = states();
  const ids = poolIds();
  const now = Date.now();
  const upcoming = [1, 3, 7].map((d) => ({ d, n: ids.filter((id) => st[id] && st[id].s && st[id].d > now && st[id].d <= now + d * DAY).length }));
  const hardest = ids.filter((id) => st[id] && st[id].w > 0).sort((a, b) => st[b].w - st[a].w || a - b).slice(0, 10);
  mount(root, h('div', { class: 'stack' },
    h('h1', null, 'Ôn lại'),
    h('section', { class: 'card stack' },
      h('div', { class: 'row between' }, h('h2', null, 'Đến hạn ôn'), h('span', { class: 'pill' + (c.due.length ? ' warn' : '') }, `${c.due.length} câu`)),
      h('p', { class: 'muted small' }, 'Lặp lại ngắt quãng: làm đúng thì lần sau cách xa dần (1, 3, 7, 14, 30 ngày), làm sai thì quay lại ôn ngay.'),
      h('button', { class: 'btn block', type: 'button', disabled: !c.due.length, onclick: () => startPractice({ title: 'Ôn câu đến hạn', ids: c.due.slice(0, 40), back: '#/on', mode: 'on' }) }, c.due.length ? `Ôn ${Math.min(40, c.due.length)} câu` : 'Chưa có câu đến hạn'),
      h('p', { class: 'muted small' }, 'Sắp đến hạn thêm: ' + upcoming.map((u) => `${u.n} câu trong ${u.d} ngày tới`).join(' · '))),
    h('section', { class: 'card stack' },
      h('div', { class: 'row between' }, h('h2', null, 'Câu đã làm sai'), h('span', { class: 'pill' + (c.wrong.length ? ' bad' : '') }, `${c.wrong.length} câu`)),
      h('p', { class: 'muted small' }, 'Gồm câu lần gần nhất sai và câu từng sai nhưng chưa vững. Làm đúng nhiều lần liên tiếp thì câu sẽ rời danh sách.'),
      h('button', { class: 'btn block', type: 'button', disabled: !c.wrong.length, onclick: () => startPractice({ title: 'Ôn câu sai', ids: c.wrong.slice(0, 40), back: '#/on' }) }, c.wrong.length ? `Ôn ${Math.min(40, c.wrong.length)} câu sai` : 'Chưa có câu sai')),
    hardest.length ? h('section', { class: 'stack' },
      h('h2', { class: 'sec-title' }, 'Câu hay sai nhất'),
      h('div', { class: 'list' }, hardest.map((id) => {
        const q = D.byId.get(id);
        return h('button', { class: 'item', type: 'button', onclick: () => openSheet([questionCard({ q, chosen: q.a, reveal: true, lookup: true }), h('div', { class: 'btns mt' }, h('button', { class: 'btn sec', type: 'button', onclick: (e) => e.target.closest('.overlay').remove() }, 'Đóng'))]) },
          h('span', { class: 'pill bad' }, `sai ${st[id].w} lần`), h('div', { class: 'grow' }, h('b', null, `Câu ${id}`), h('div', { class: 'muted small' }, q.q.length > 90 ? q.q.slice(0, 90) + '…' : q.q)));
      }))) : null,
    h('button', { class: 'btn sec block', type: 'button', onclick: () => startPractice({ title: 'Luyện nhanh', ids: quickIds(20), back: '#/on' }) }, icon('bolt', 20), 'Luyện nhanh 20 câu (trộn câu mới và câu đến hạn)')));
}
