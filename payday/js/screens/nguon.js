// Màn "Nguồn quy định và mức xác minh".
import { h } from '../ui/dom.js';
import { NGUON, NHAN_XM, NGAY_TRA_CUU } from '../lib/nguon.js';

const KY = { goc: '✓', 'thu-cap': '≈', chua: '?' };

export function ve() {
  return {
    tieuDe: 'Nguồn quy định',
    el: h('div', { class: 'stack' },
      h('a', { class: 'btn ghost', href: '#/luong' }, '‹ Quay lại Lương'),
      h('section', { class: 'card' }, h('h2', {}, 'Nguồn quy định và mức xác minh'),
        h('p', { class: 'sub' }, `Ngày tra cứu: ${NGAY_TRA_CUU}. Chỗ nào không xác minh được từ văn bản gốc thì app ghi rõ, không đoán.`),
        h('ul', { class: 'stack small' },
          h('li', {}, h('span', { class: 'badge goc' }, `${KY.goc} ${NHAN_XM.goc}`), ' đã tải và đọc trực tiếp văn bản.'),
          h('li', {}, h('span', { class: 'badge thu-cap' }, `${KY['thu-cap']} Nguồn thứ cấp`), ' nhiều bài báo/cổng pháp luật khớp nhau, chưa đọc văn bản gốc.'),
          h('li', {}, h('span', { class: 'badge chua' }, `${KY.chua} ${NHAN_XM.chua}`), ' không tìm được hoặc nguồn mâu thuẫn.'))),
      NGUON.map((g) => h('section', { class: 'card', 'data-testid': 'nguon-nhom' }, h('h2', {}, g.nhom),
        h('ul', { class: 'list' }, g.muc.map((m) => h('li', {}, h('div', { class: 't' },
          h('b', {}, m.nd), h('span', { class: 'small muted' }, `Căn cứ: ${m.cd}`),
          h('span', { class: 'small' }, h('span', { class: `badge ${m.xm}` }, `${KY[m.xm]} ${NHAN_XM[m.xm]}`), m.gc ? ` ${m.gc}` : ''))))))),
      h('p', { class: 'small muted' }, 'Không phải tư vấn thuế. Khi cần số chính xác, hãy hỏi kế toán công ty hoặc cơ quan thuế.')),
  };
}
