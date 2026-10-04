import { h, toast, download, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import { getConfig } from '../api.js';

export function renderSettings(root) {
  const s = store.get();
  const aiLine = h('p', { class: 'muted', id: 'ai-line', text: 'Đang kiểm tra...' });
  getConfig().then((c) => { aiLine.textContent = c.ai ? 'AI chấm bài và gợi ý CV: đang bật trên máy chủ này.' : 'AI chấm bài và gợi ý CV: đang tắt trên máy chủ này. Mọi tính năng khác vẫn dùng được.'; });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', id: 'import-file', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJson(await f.text()); toast('Đã nhập dữ liệu'); location.hash = '#/'; window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (err) { toast(err.message || 'Không nhập được tệp'); }
  } });
  root.replaceChildren(h('div', { class: 'page' }, h('h1', { text: 'Dữ liệu và quyền riêng tư' }),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Dữ liệu lưu ở đâu?' }),
      h('ul', { class: 'bul' },
        h('li', { text: 'CV, thư xin việc, checklist và lịch sử luyện tập được lưu trong trình duyệt trên thiết bị này (localStorage). Chúng không được gửi lên máy chủ.' }),
        h('li', { text: 'Xóa dữ liệu trình duyệt hoặc đổi thiết bị thì dữ liệu sẽ mất. Hãy xuất tệp sao lưu nếu cần.' }),
        h('li', { text: 'Ghi âm giọng nói không được lưu. Nhận dạng giọng nói do trình duyệt thực hiện (Chrome, Edge có thể gửi âm thanh tới dịch vụ của nhà cung cấp trình duyệt).' })),
      store.isMemoryOnly() ? h('p', { class: 'err', text: 'Trình duyệt đang chặn lưu trữ cục bộ nên dữ liệu chỉ tồn tại đến khi bạn đóng trang.' }) : null),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Khi nào nội dung được gửi đi?' }),
      aiLine,
      h('ul', { class: 'bul' },
        h('li', { text: 'Chỉ khi bạn chủ động bấm "Chấm bằng AI" hoặc "Gợi ý viết lại bằng AI".' }),
        h('li', { text: 'Chấm bằng AI gửi: câu hỏi và nội dung câu trả lời (chữ). Gợi ý CV gửi: phần mô tả kinh nghiệm bạn chọn, vị trí và tin tuyển dụng bạn dán. Họ tên, email, số điện thoại không được gửi.' }),
        h('li', { text: 'Máy chủ 9interview chuyển tiếp tới Google Gemini để xử lý, không lưu nội dung và không ghi nội dung vào nhật ký. Phía Google xử lý theo chính sách của họ.' }),
        h('li', { text: 'Đừng đưa thông tin nhạy cảm (số căn cước, tài khoản ngân hàng, bí mật công ty cũ) vào nội dung gửi AI.' })),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'consent-ai', checked: !!(s.settings.consentAi && s.settings.consentCv), onchange: (e) => { s.settings.consentAi = e.target.checked; s.settings.consentCv = e.target.checked; store.save(); } }), h('span', { text: 'Không hỏi lại trước khi gửi cho AI' }))),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Quản lý dữ liệu' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', id: 'btn-export', onclick: () => { download('9interview-sao-luu.json', store.exportJson()); toast('Đã tạo tệp sao lưu'); } }, 'Xuất tệp sao lưu'),
        h('button', { class: 'btn', type: 'button', id: 'btn-import', onclick: () => fileIn.click() }, 'Nhập từ tệp sao lưu'), fileIn),
      h('div', { class: 'row' }, h('button', { class: 'btn danger', type: 'button', id: 'btn-wipe', onclick: async () => {
        if (await confirmDialog('Xóa toàn bộ dữ liệu?', 'CV, thư, checklist và lịch sử luyện tập trên thiết bị này sẽ bị xóa vĩnh viễn.', 'Xóa hết', true)) { store.clearAll(); toast('Đã xóa dữ liệu'); location.hash = '#/'; window.dispatchEvent(new HashChangeEvent('hashchange')); }
      } }, 'Xóa toàn bộ dữ liệu'))),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Về nội dung' }),
      h('p', { class: 'muted', text: 'Câu hỏi, ý đồ và ví dụ trả lời do 9interview tự biên soạn để tham khảo. Ví dụ chỉ là minh họa. Không có số liệu lương thị trường. Không có gì ở đây thay thế tư vấn pháp lý hay nghề nghiệp chuyên nghiệp.' }))));
}
