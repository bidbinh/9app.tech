import { h } from '../ui.js';
import { GROUPS, TYPES, QUESTIONS } from '../data/index.js';
import { STAR } from '../data/guides.js';

const view = { group: 'all', type: 'all', q: '' };
const norm = (s) => String(s).normalize('NFC').toLowerCase();
const groupName = (id) => (GROUPS.find((g) => g.id === id) || {}).name || id;

export function filterQuestions({ group, type, q }) {
  const needle = norm(q || '').trim();
  return QUESTIONS.filter((x) => (group === 'all' || x.g === group) && (type === 'all' || x.t === type) && (!needle || norm(x.q).includes(needle) || norm(x.intent).includes(needle)));
}

export function renderBank(root) {
  const list = h('div', { class: 'list', id: 'q-list' });
  const count = h('p', { class: 'muted small', id: 'q-count' });
  const draw = () => {
    const items = filterQuestions(view);
    count.textContent = `${items.length} câu hỏi`;
    list.replaceChildren(...items.map((x) => h('a', { class: 'qitem', href: `#/hoi/${x.id}` },
      h('span', { class: 'qtext', text: x.q }),
      h('span', { class: 'qmeta' }, h('span', { class: 'tag', text: groupName(x.g) }), h('span', { class: 'tag alt', text: TYPES[x.t] || '' })))));
    if (!items.length) list.replaceChildren(h('p', { class: 'muted', text: 'Không có câu hỏi phù hợp. Thử bỏ bớt bộ lọc.' }));
  };
  const chip = (id, label, key) => h('button', { class: `chip${view[key] === id ? ' on' : ''}`, type: 'button', 'data-v': id, onclick: (e) => { view[key] = id; [...e.target.parentNode.children].forEach((c) => c.classList.toggle('on', c === e.target)); draw(); } }, label);
  root.replaceChildren(h('div', { class: 'page' },
    h('h1', { text: 'Ngân hàng câu hỏi' }),
    h('input', { class: 'input', type: 'search', id: 'q-search', placeholder: 'Tìm câu hỏi...', value: view.q, 'aria-label': 'Tìm câu hỏi', oninput: (e) => { view.q = e.target.value; draw(); } }),
    h('div', { class: 'chips scroll', id: 'f-group' }, chip('all', 'Tất cả', 'group'), GROUPS.map((g) => chip(g.id, g.short, 'group'))),
    h('div', { class: 'chips scroll', id: 'f-type' }, chip('all', 'Mọi dạng', 'type'), Object.entries(TYPES).map(([id, label]) => chip(id, label, 'type'))),
    count, list));
  draw();
}

export function renderQuestion(root, id) {
  const idx = QUESTIONS.findIndex((x) => x.id === id);
  const q = QUESTIONS[idx];
  if (!q) { root.replaceChildren(h('div', { class: 'page' }, h('p', { text: 'Không tìm thấy câu hỏi.' }), h('a', { class: 'btn', href: '#/hoi' }, 'Về danh sách'))); return; }
  const sampleBox = h('div', { class: 'card sample hidden', id: 'sample-box' },
    h('div', { class: 'eyebrow', text: 'Ví dụ trả lời (minh họa)' }),
    h('p', { text: q.sample }),
    h('p', { class: 'muted small', text: 'Đây chỉ là ví dụ để hình dung cấu trúc. Hãy thay bằng trải nghiệm thật của bạn, đừng học thuộc, vì nhà tuyển dụng sẽ hỏi sâu thêm.' }));
  const toggle = h('button', { class: 'btn', type: 'button', id: 'btn-sample', 'aria-expanded': 'false', onclick: () => { const hid = sampleBox.classList.toggle('hidden'); toggle.setAttribute('aria-expanded', String(!hid)); toggle.textContent = hid ? 'Xem ví dụ trả lời' : 'Ẩn ví dụ trả lời'; } }, 'Xem ví dụ trả lời');
  const prev = QUESTIONS[idx - 1], next = QUESTIONS[idx + 1];
  root.replaceChildren(h('div', { class: 'page' },
    h('a', { class: 'back', href: '#/hoi' }, '‹ Danh sách'),
    h('div', { class: 'qmeta' }, h('span', { class: 'tag', text: groupName(q.g) }), h('span', { class: 'tag alt', text: TYPES[q.t] })),
    h('h1', { class: 'qbig', text: q.q }),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow', text: 'Nhà tuyển dụng muốn biết gì?' }), h('p', { text: q.intent })),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow', text: 'Cách trả lời' }), h('ul', { class: 'bul' }, q.tips.map((t) => h('li', { text: t })))),
    q.star ? h('div', { class: 'card' }, h('div', { class: 'eyebrow', text: 'Khung STAR' }), h('ul', { class: 'bul' }, STAR.map((s) => h('li', null, h('b', { text: `${s.k} - ${s.name}: ` }), s.desc)))) : null,
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: `#/luyen/q/${q.id}` }, 'Luyện nói câu này'), toggle),
    sampleBox,
    h('div', { class: 'pager' }, prev ? h('a', { class: 'btn ghost', href: `#/hoi/${prev.id}` }, '‹ Câu trước') : h('span'), next ? h('a', { class: 'btn ghost', href: `#/hoi/${next.id}` }, 'Câu sau ›') : h('span'))));
}
