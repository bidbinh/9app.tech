import { h, toast, copyText } from '../ui.js';
import * as store from '../store.js';
import { CHECKLIST, ASK_BACK, SALARY, SALARY_SCRIPTS, STAR, SENSITIVE } from '../data/guides.js';
import { QUESTIONS } from '../data/index.js';

let sub = 'checklist';
const TABS = [['checklist', 'Checklist'], ['hoilai', 'Hỏi lại nhà tuyển dụng'], ['luong', 'Đàm phán lương'], ['star', 'Cách dùng STAR'], ['nhaycam', 'Câu hỏi nhạy cảm']];

export function renderPrepare(root) {
  const body = h('div', { id: 'prep-body' });
  const seg = h('div', { class: 'chips scroll', role: 'tablist' }, TABS.map(([id, label]) =>
    h('button', { class: `chip${sub === id ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(sub === id), 'data-sub': id, onclick: () => { sub = id; [...seg.children].forEach((c) => { const on = c.dataset.sub === id; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); }); draw(); } }, label)));

  function draw() {
    if (sub === 'checklist') body.replaceChildren(checklist());
    else if (sub === 'hoilai') body.replaceChildren(askBack());
    else if (sub === 'luong') body.replaceChildren(salary());
    else if (sub === 'nhaycam') body.replaceChildren(sensitive());
    else body.replaceChildren(starGuide());
  }
  root.replaceChildren(h('div', { class: 'page' }, h('h1', { text: 'Chuẩn bị phỏng vấn' }), seg, body));
  draw();
}

function checklist() {
  const st = store.get().checklist;
  const total = CHECKLIST.reduce((a, g) => a + g.items.length, 0);
  const prog = h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', { id: 'chk-count' }), h('span', { class: 'sp' }), h('button', { class: 'btn ghost small', type: 'button', id: 'chk-reset', onclick: () => { for (const k of Object.keys(st)) delete st[k]; store.save(); document.querySelectorAll('#prep-body input[type=checkbox]').forEach((c) => { c.checked = false; }); upd(); } }, 'Bỏ chọn hết')), h('div', { class: 'bar' }, h('div', { class: 'bar-fill', id: 'chk-bar' })));
  const upd = () => {
    const done = CHECKLIST.reduce((a, g) => a + g.items.filter((_, i) => st[`${g.id}.${i}`]).length, 0);
    prog.querySelector('#chk-count').textContent = `Đã xong ${done}/${total} việc`;
    prog.querySelector('#chk-bar').style.width = `${(done / total) * 100}%`;
  };
  const el = h('div', null, prog, CHECKLIST.map((g) => h('div', { class: 'card' }, h('h2', { class: 'sec', text: g.title }),
    g.items.map((t, i) => { const id = `${g.id}.${i}`; return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!st[id], 'data-id': id, onchange: (e) => { if (e.target.checked) st[id] = true; else delete st[id]; store.save(); upd(); } }), h('span', { text: t })); }))));
  upd();
  return el;
}

function askBack() {
  return h('div', null,
    h('p', { class: 'lead', text: 'Cuối buổi phỏng vấn, nhà tuyển dụng thường hỏi "Bạn có câu hỏi nào không?". Chuẩn bị 3 đến 5 câu từ danh sách dưới đây, chọn những câu phù hợp.' }),
    ASK_BACK.map((g, gi) => h('div', { class: `card${gi === ASK_BACK.length - 1 ? ' avoid' : ''}` }, h('h2', { class: 'sec', text: g.title }), h('ul', { class: 'bul' }, g.items.map((t) => h('li', { text: t }))))));
}

function salary() {
  return h('div', null,
    h('p', { class: 'lead', text: 'Đàm phán lương là kỹ năng luyện được. 9interview không đưa ra số liệu lương thị trường vì dễ lỗi thời và khác nhau theo ngành, thành phố, công ty. Bạn hãy tự tìm mức tham khảo từ nhiều nguồn đáng tin.' }),
    SALARY.map((g) => h('div', { class: 'card' }, h('h2', { class: 'sec', text: g.title }), h('ul', { class: 'bul' }, g.items.map((t) => h('li', { text: t }))))),
    h('h2', { class: 'sec', text: 'Câu mẫu (thay phần trong ngoặc vuông bằng thông tin thật của bạn)' }),
    SALARY_SCRIPTS.map((s) => h('div', { class: 'card script' }, h('div', { class: 'eyebrow', text: s.title }), h('p', { text: s.text }),
      h('button', { class: 'btn small', type: 'button', onclick: async () => toast((await copyText(s.text)) ? 'Đã sao chép' : 'Không sao chép được') }, 'Sao chép'))));
}

function starGuide() {
  return h('div', null,
    h('p', { class: 'lead', text: 'Với câu hỏi hành vi ("Hãy kể về một lần..."), kể theo bốn bước STAR để câu chuyện rõ ràng và thuyết phục.' }),
    h('div', { class: 'card' }, STAR.map((s) => h('div', { class: 'star-item' }, h('b', { class: 'star-k', text: s.k }), h('div', null, h('strong', { text: s.name }), h('p', { text: s.desc }))))),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Mẹo' }), h('ul', { class: 'bul' },
      h('li', { text: 'Chuẩn bị sẵn 4 đến 5 câu chuyện thật của bạn; mỗi câu chuyện có thể trả lời nhiều câu hỏi khác nhau.' }),
      h('li', { text: 'Dùng "tôi/em" cho phần Hành động. Người phỏng vấn muốn biết bạn làm gì, không phải cả nhóm làm gì.' }),
      h('li', { text: 'Có con số thật thì nêu (thời gian, số lượng, tỷ lệ). Không có thì mô tả thay đổi quan sát được. Đừng bịa số.' }),
      h('li', { text: 'Giữ trong 1 đến 2 phút. Kết bằng điều bạn học được.' }))),
    h('a', { class: 'btn primary', href: '#/luyen' }, 'Luyện nói ngay'));
}

function sensitive() {
  return h('div', null,
    h('p', { class: 'lead', text: 'Có những câu hỏi về đời tư mà nhà tuyển dụng không nên hỏi, nhưng bạn vẫn có thể gặp. Chuẩn bị trước để trả lời bình tĩnh và khéo léo.' }),
    SENSITIVE.map((g) => h('div', { class: 'card' }, h('h2', { class: 'sec', text: g.title }), h('ul', { class: 'bul' }, g.items.map((t) => h('li', { text: t }))))),
    h('h2', { class: 'sec', text: 'Luyện các câu thường gặp' }),
    QUESTIONS.filter((q) => q.sensitive).map((q) => h('a', { class: 'qitem', href: '#/hoi/' + q.id }, h('span', { class: 'qtext', text: q.q }))),
    h('p', { class: 'muted small', text: 'Đây là ghi chú chung, không phải tư vấn pháp lý.' }));
}
