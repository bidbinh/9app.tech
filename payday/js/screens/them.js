// Màn "Thêm": menu, giới thiệu và riêng tư.
import { h, svg, ICON } from '../ui/dom.js';
import { sua } from '../lib/store.js';
import { apDungTuyChon } from '../ui/tuychon.js';

const MUC = [
  ['#/them/quyettoan', ICON.tax, 'Quyết toán thuế cuối năm', 'Ước tính hoàn hay nộp thêm, hạn nộp, danh sách chứng từ'],
  ['#/them/lich', ICON.calendar, 'Lịch lương và nhắc', 'Ngày lương, hạn đóng thẻ, hạn vay; xuất tệp .ics có nhắc'],
  ['#/them/du-lieu', ICON.shield, 'Dữ liệu của tôi', 'Xuất, nhập, xóa sạch. Dữ liệu chỉ nằm trên máy này'],
  ['#/luong/nguon', ICON.book, 'Nguồn quy định và mức xác minh', 'Số điều luật, ngày tra cứu, chỗ nào chưa xác minh'],
  ['#/them/gioi-thieu', ICON.info, 'Giới thiệu và riêng tư', 'App làm gì, không làm gì, lưu gì'],
];

export function ve(st, ctx) {
  const phan = ctx.parts[1] || '';
  if (phan === 'gioi-thieu') return gioiThieu();
  const ck = h('input', { type: 'checkbox', id: 'chu-lon', checked: st.tuyChon.chuLon });
  ck.addEventListener('change', () => { sua((s) => { s.tuyChon.chuLon = ck.checked; }, { im: true }); apDungTuyChon(st); });
  return {
    tieuDe: 'Thêm',
    el: h('div', { class: 'stack' },
      h('section', { class: 'card menu' }, MUC.map(([href, ic, ten, mo]) => h('a', { class: 'item', href },
        h('span', { class: 'ic' }, svg(ic)), h('span', {}, h('b', {}, ten), h('br'), h('span', { class: 'small muted' }, mo)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')))),
      h('section', { class: 'card' }, h('h2', {}, 'Hiển thị'),
        h('label', { class: 'switch', for: 'chu-lon' }, ck, h('span', {}, 'Chữ lớn')),
        h('div', { class: 'hint' }, 'Phóng to chữ toàn app. Sáng/tối theo cài đặt của máy.')),
      h('p', { class: 'small muted' }, '9payday là công cụ ước tính để tham khảo, không phải tư vấn thuế hay tư vấn tài chính.')),
  };
}

function gioiThieu() {
  return {
    tieuDe: 'Giới thiệu',
    el: h('div', { class: 'stack' },
      h('a', { class: 'btn ghost', href: '#/them' }, '‹ Quay lại'),
      h('section', { class: 'card' }, h('h2', {}, '9payday làm gì'),
        h('ul', { class: 'stack' },
          h('li', {}, 'Tính lương Gross và Net theo quy định thuế TNCN mới (Luật 109/2025/QH15), có so sánh với quy định cũ.'),
          h('li', {}, 'Chia lương thành các hũ, ghi nhanh chi tiêu bằng một câu hoặc giọng nói, dự báo cuối kỳ.'),
          h('li', {}, 'Mục tiêu tiết kiệm, máy tính vay và trả nợ sớm, lãi kép.'),
          h('li', {}, 'Ước tính quyết toán thuế cuối năm và nhắc việc bằng tệp lịch .ics.'))),
      h('section', { class: 'card' }, h('h2', {}, 'Riêng tư'),
        h('ul', { class: 'stack' },
          h('li', {}, 'Mọi dữ liệu tài chính chỉ nằm trong trình duyệt của bạn (IndexedDB). App không có máy chủ nhận dữ liệu, không đăng nhập, không theo dõi.'),
          h('li', {}, 'Ghi chi tiêu chỉ lưu số tiền, danh mục và ngày, không lưu nguyên câu bạn gõ hoặc nói.'),
          h('li', {}, 'Nhận giọng nói do trình duyệt thực hiện. Chrome và một số trình duyệt có thể gửi âm thanh tới máy chủ của hãng để nhận dạng. Bạn luôn có thể gõ thay vì nói.'),
          h('li', {}, 'Muốn chuyển sang máy khác: xuất tệp JSON ở "Dữ liệu của tôi" rồi nhập lại. Đồng bộ qua tài khoản 9id sẽ làm sau, và chỉ khi bạn bật.'))),
      h('section', { class: 'card' }, h('h2', {}, 'Giới hạn'),
        h('ul', { class: 'stack' },
          h('li', {}, 'Không phải tư vấn thuế hay tài chính. Số liệu là ước tính theo văn bản đã tra; luật có thể đổi và công ty có thể trả lương theo cách khác.'),
          h('li', {}, 'Chỉ tính thuế từ tiền lương của cá nhân cư trú ký hợp đồng lao động. Chưa tính thu nhập kinh doanh, cho thuê, chuyển nhượng, người nước ngoài, khoản giảm trừ từ thiện hay y tế, giáo dục.'),
          h('li', {}, 'Nhiều số chưa đối chiếu được văn bản gốc, được đánh dấu rõ trong từng bước tính và ở mục "Nguồn quy định".')))),
  };
}
