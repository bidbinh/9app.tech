import { h } from '../ui.js';
import * as store from '../store.js';
import { GROUPS, QUESTIONS, pickSession } from '../data/index.js';
import { getConfig } from '../api.js';

export function groupPicker(onChange) {
  const s = store.get().settings;
  return h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Nhóm nghề' }, GROUPS.filter((g) => g.id !== 'chung').map((g) =>
    h('button', { class: `chip${s.group === g.id ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(s.group === g.id), 'data-group': g.id, onclick: () => { s.group = g.id; store.save(); onChange && onChange(g.id); } }, g.name)));
}

export function renderHome(root) {
  const s = store.get();
  const hist = s.history;
  const days = new Set(hist.map((x) => new Date(x.ts).toDateString())).size;
  const totalFill = hist.reduce((a, x) => a + (x.fillers || 0), 0);
  const aiChip = h('span', { class: 'pill', id: 'ai-pill', text: 'Đang kiểm tra AI...' });
  getConfig().then((c) => { aiChip.textContent = c.ai ? 'AI chấm bài: bật' : 'AI chấm bài: tắt (vẫn luyện được)'; aiChip.classList.toggle('on', !!c.ai); });

  const pick = () => pickSession(s.settings.group, 1)[0] || QUESTIONS[0];
  let todayQ = pick();
  const qBox = h('div', { class: 'card today' });
  const drawToday = () => {
    qBox.replaceChildren(
      h('div', { class: 'eyebrow', text: 'Câu hỏi hôm nay' }),
      h('p', { class: 'today-q', text: todayQ.q }),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/luyen/q/${todayQ.id}` }, 'Luyện câu này'),
        h('button', { class: 'btn', type: 'button', id: 'btn-other', onclick: () => { todayQ = pick(); drawToday(); } }, 'Đổi câu khác')));
  };
  drawToday();

  root.replaceChildren(h('div', { class: 'page' },
    h('section', { class: 'hero' },
      h('h1', { text: 'Sẵn sàng cho buổi phỏng vấn' }),
      h('p', { class: 'lead', text: 'Luyện trả lời bằng giọng nói, nhận góp ý, và làm CV gọn đẹp ngay trên điện thoại. Dữ liệu cá nhân của bạn ở lại trên máy bạn.' }),
      aiChip),
    h('section', null,
      h('h2', { class: 'sec', text: 'Bạn ứng tuyển nhóm nghề nào?' }),
      groupPicker(() => { todayQ = pick(); drawToday(); document.querySelectorAll('.chips .chip').forEach((c) => { const on = c.dataset.group === s.settings.group; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); }); })),
    qBox,
    h('section', { class: 'grid3' },
      h('a', { class: 'tile', href: '#/luyen' }, h('strong', { text: 'Luyện nói' }), h('span', { text: 'Bộ 5 câu, hẹn giờ, đếm từ độn, AI chấm' })),
      h('a', { class: 'tile', href: '#/hoi' }, h('strong', { text: `Ngân hàng ${QUESTIONS.length} câu hỏi` }), h('span', { text: 'Ý đồ nhà tuyển dụng và cách trả lời mẫu' })),
      h('a', { class: 'tile', href: '#/cv' }, h('strong', { text: 'Tạo CV, thư xin việc' }), h('span', { text: '4 mẫu chuẩn ATS, xuất PDF' })),
      h('a', { class: 'tile', href: '#/chuanbi' }, h('strong', { text: 'Chuẩn bị ngày phỏng vấn' }), h('span', { text: 'Checklist, câu hỏi hỏi lại, đàm phán lương' }))),
    h('section', { class: 'card' },
      h('h2', { class: 'sec', text: 'Tiến độ luyện tập của bạn' }),
      hist.length
        ? h('div', { class: 'stats' },
          h('div', null, h('b', { text: String(hist.length) }), h('span', { text: 'lần luyện đã lưu' })),
          h('div', null, h('b', { text: String(days) }), h('span', { text: 'ngày đã luyện' })),
          h('div', null, h('b', { text: String(totalFill) }), h('span', { text: 'từ độn đã phát hiện' })))
        : h('p', { class: 'muted', text: 'Chưa có lần luyện nào. Bắt đầu với câu hỏi hôm nay ở trên nhé.' })),
    h('p', { class: 'muted small' }, 'CV và lịch sử luyện tập lưu trong trình duyệt của bạn. ', h('a', { href: '#/caidat' }, 'Xem quyền riêng tư và quản lý dữ liệu'), '.')));
}
