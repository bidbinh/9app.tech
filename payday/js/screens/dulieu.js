// Màn "Dữ liệu của tôi": xuất, nhập, xóa sạch.
import { h, thongBao, taiVe, xacNhan, dong, moHopThoai, truong } from '../ui/dom.js';
import { xuatJSON, nhapJSON, xoaSach, luu } from '../lib/store.js';
import { homNay } from '../lib/dates.js';
import { theDongBo } from '../lib/nine-sync-ui.js';
import { dongBo, dangNhapUrl } from '../lib/dongbo.js';

export function ve(st, ctx) {
  const tep = h('input', { type: 'file', accept: 'application/json,.json', id: 'nhap-tep', class: 'sr' });
  const loi = h('div', { class: 'hint err', role: 'alert' });
  tep.addEventListener('change', async () => {
    loi.textContent = '';
    const f = tep.files && tep.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { loi.textContent = 'Tệp quá lớn (trên 20 MB).'; tep.value = ''; return; }
    let text;
    try { text = await f.text(); } catch { loi.textContent = 'Không đọc được tệp.'; return; }
    let o; try { o = JSON.parse(text); } catch { loi.textContent = 'Tệp không phải JSON hợp lệ.'; tep.value = ''; return; }
    if (!o || o.ung_dung !== '9payday') { loi.textContent = 'Đây không phải tệp sao lưu của 9payday.'; tep.value = ''; return; }
    const ok = await xacNhan('Nhập dữ liệu từ tệp?', `Dữ liệu hiện tại trên máy này sẽ được thay bằng nội dung tệp "${f.name}". Nên xuất sao lưu trước nếu bạn chưa có.`, { ok: 'Nhập và thay thế' });
    if (!ok) { tep.value = ''; return; }
    const kq = await nhapJSON(text);
    tep.value = '';
    if (!kq.ok) { loi.textContent = kq.loi; return; }
    thongBao(`Đã nhập dữ liệu (${kq.soChi} khoản chi).`);
  });
  const tong = st.chi.length + st.mucTieu.length + st.vay.length + st.lich.length + st.coDinh.length;

  return {
    tieuDe: 'Dữ liệu của tôi',
    el: h('div', { class: 'stack' },
      h('a', { class: 'btn ghost', href: '#/them' }, '‹ Quay lại'),
      !luu.ok ? h('div', { class: 'note bad', role: 'alert' }, luu.loi) : null,
      h('section', { class: 'card' }, h('h2', {}, 'Dữ liệu nằm ở đâu'),
        h('p', {}, 'Toàn bộ dữ liệu của bạn chỉ nằm trong trình duyệt trên máy này (IndexedDB). Mặc định 9payday không gửi gì lên máy chủ và không cần tài khoản; chỉ khi bạn tự bật đồng bộ bên dưới thì dữ liệu mới được lưu thêm trên máy chủ 9app.'),
        h('p', { class: 'small muted' }, `Hiện có: ${st.chi.length} khoản chi, ${st.coDinh.length} khoản cố định, ${st.mucTieu.length} mục tiêu, ${st.vay.length} khoản vay, ${st.lich.length} nhắc. ${luu.ok ? 'Đang lưu bình thường.' : 'Không lưu được.'}`),
        h('p', { class: 'small muted' }, 'Xóa dữ liệu trình duyệt hoặc đổi máy sẽ mất dữ liệu, nên hãy xuất sao lưu định kỳ.')),
      theDongBo({
        h, sync: dongBo, tenApp: '9payday', dangNhapUrl,
        duLieuGom: 'lương, khoản chi, khoản cố định, mục tiêu, khoản vay, nhắc và quyết toán thuế',
        duLieuKhong: '',
        thongBao, xacNhan: (t, n) => xacNhan(t, n, { ok: 'Xóa bản trên máy chủ' }), lamMoi: () => { /* datLai đã phát sự kiện: màn hình tự vẽ lại */ },
      }),
      h('section', { class: 'card' }, h('h2', {}, 'Xuất sao lưu'),
        h('p', { class: 'sub' }, 'Tải về một tệp JSON chứa mọi thứ. Giữ tệp ở nơi an toàn vì có số liệu tài chính của bạn.'),
        h('button', { type: 'button', class: 'btn primary', 'data-testid': 'xuat-json', onclick: () => {
          taiVe(`9payday-sao-luu-${homNay()}.json`, xuatJSON(), 'application/json');
          thongBao('Đã tạo tệp sao lưu.');
        } }, 'Tải tệp sao lưu (.json)')),
      h('section', { class: 'card' }, h('h2', {}, 'Nhập từ tệp sao lưu'),
        h('p', { class: 'sub' }, 'Dùng để chuyển sang máy khác hoặc khôi phục. Dữ liệu hiện tại sẽ được thay thế.'),
        h('label', { class: 'btn', for: 'nhap-tep', role: 'button', tabindex: '0', 'data-testid': 'nhap-nhan', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tep.click(); } } }, 'Chọn tệp sao lưu'),
        tep, loi),
      h('section', { class: 'card' }, h('h2', {}, 'Xóa sạch dữ liệu'),
        h('p', { class: 'sub' }, `Xóa mọi thứ trên máy này${tong ? ` (${tong} mục)` : ''}. Không thể hoàn tác, nên hãy xuất sao lưu trước.`),
        h('button', { type: 'button', class: 'btn danger', 'data-testid': 'xoa-sach', onclick: () => {
          moHopThoai('Xóa sạch dữ liệu?', (dong_) => {
            const o = h('input', { type: 'text', id: 'xoa-go', autocomplete: 'off', placeholder: 'Gõ XÓA để xác nhận' });
            const nut = h('button', { type: 'button', class: 'btn danger', disabled: true, 'data-testid': 'xoa-xac-nhan', onclick: async () => { await xoaSach(); dong_(); thongBao('Đã xóa sạch dữ liệu trên máy này.'); } }, 'Xóa vĩnh viễn');
            o.addEventListener('input', () => { nut.disabled = o.value.trim().toUpperCase() !== 'XÓA'; });
            return h('div', { class: 'stack' }, h('p', {}, 'Toàn bộ lương, chi tiêu, mục tiêu, khoản vay và nhắc sẽ bị xóa khỏi máy này.'), truong('Để chắc chắn', o),
              h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => dong_() }, 'Hủy'), nut));
          });
        } }, 'Xóa sạch dữ liệu...'))),
  };
}
