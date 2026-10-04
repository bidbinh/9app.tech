// Đọc số thành chữ (séc, hợp đồng) và bỏ dấu tiếng Việt.
import { h, xoa, tabs, chon, nutBam, saoChep, idMoi } from '../ui/dom.js';
import { docSo, boDau, chuanHoaSoChuoi, dinhDangSo } from '../lib/text.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2M12 5v14M9 19h6"/></svg>';
const TABS = [{ id: 'doc-so', ten: 'Đọc số thành chữ' }, { id: 'bo-dau', ten: 'Bỏ dấu tiếng Việt' }];

export default {
  id: 'doc-so',
  ten: 'Đọc số, bỏ dấu',
  mota: 'Số thành chữ cho séc, hợp đồng; bỏ dấu tiếng Việt',
  tuKhoa: 'doc so thanh chu bang chu sec hop dong bo dau tieng viet khong dau viet hoa slug dem chu',
  icon: ICON,
  tabs: TABS,
  moTaTab: { 'doc-so': 'doc so thanh chu bang chu sec hop dong tien dong chan', 'bo-dau': 'bo dau tieng viet khong dau viet hoa viet thuong slug dem chu' },
  render(root, tab, nav) {
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    root.append(h('h1', { class: 'sr-only' }, 'Đọc số, bỏ dấu'), tabs(TABS, t.id, (id) => nav(id)));

    if (t.id === 'doc-so') {
      const so = h('input', { type: 'text', id: idMoi('n'), inputmode: 'decimal', placeholder: 'Ví dụ: 3.250.000', autocomplete: 'off', value: '3250000', 'aria-label': 'Số cần đọc' });
      const cbDong = h('input', { type: 'checkbox', id: idMoi('c'), checked: true, onchange: tinh });
      const cbChan = h('input', { type: 'checkbox', id: idMoi('c'), checked: true, onchange: tinh });
      const cbHoa = h('input', { type: 'checkbox', id: idMoi('c'), checked: true, onchange: tinh });
      const nl = (cb, text) => h('label', { class: 'check', for: cb.id }, cb, h('span', {}, text));
      const ra = h('div', { class: 'card result', 'data-testid': 'ds-ketqua', 'aria-live': 'polite' });
      function tinh() {
        xoa(ra);
        const c = chuanHoaSoChuoi(so.value);
        if (!so.value.trim()) return ra.append(h('div', { class: 'hint' }, 'Nhập một số.'));
        if (c === '') return ra.append(h('div', { class: 'msg err', role: 'alert' }, 'Chưa phải số hợp lệ. Chỉ nhập chữ số, dấu chấm hoặc phẩy, ví dụ 1.250.000 hoặc 3,5.'));
        const phanNguyen = c.replace('-', '').split('.')[0];
        if (phanNguyen.length > 27) return ra.append(h('div', { class: 'msg err', role: 'alert' }, 'Số quá lớn (tối đa 27 chữ số).'));
        const thap = c.includes('.');
        const chu = docSo(c, { vietHoa: cbHoa.checked, donVi: cbDong.checked ? 'đồng' : '', chan: cbChan.checked && cbDong.checked && !thap });
        ra.append(
          h('div', { class: 'res-label' }, 'Bằng chữ'),
          h('div', { class: 'res-words big-words', 'data-testid': 'ds-chu' }, chu + (cbChan.checked && cbDong.checked && !thap ? '.' : '')),
          h('div', { class: 'res-sub' }, phanNguyen.length <= 15 ? `Số: ${dinhDangSo(Number(c), 8)}` : `Số: ${c}`),
        );
        const b = nutBam('Chép chữ', () => saoChep(chu, b), 'btn');
        ra.append(h('div', { class: 'row-btns' }, b));
        if (thap) ra.append(h('div', { class: 'hint' }, 'Số có phần thập phân nên không thêm "chẵn". Với tiền đồng, séc và hợp đồng thường chỉ dùng số nguyên.'));
      }
      so.addEventListener('input', tinh);
      root.append(h('section', { class: 'card' },
        h('div', { class: 'field' }, h('label', { for: so.id }, 'Số cần đọc'), so),
        nl(cbDong, 'Thêm "đồng"'), nl(cbChan, 'Thêm "chẵn" (số nguyên tiền đồng)'), nl(cbHoa, 'Viết hoa chữ cái đầu')), ra,
      h('div', { class: 'note small' }, 'Quy ước đọc: 105 là "một trăm lẻ năm", 25 là "hai mươi lăm", 21 là "hai mươi mốt", 1.000.000 là "một triệu". Hãy đọc lại chữ trước khi ghi vào séc hay hợp đồng.'));
      tinh();
    }

    if (t.id === 'bo-dau') {
      const vao = h('textarea', { id: idMoi('t'), rows: '5', placeholder: 'Dán hoặc gõ văn bản tiếng Việt: Nguyễn Văn Đạt, Đường Lê Lợi', 'aria-label': 'Văn bản cần bỏ dấu' });
      const ra = h('textarea', { id: idMoi('t'), rows: '5', readOnly: true, 'aria-label': 'Kết quả không dấu', 'data-testid': 'bd-ra' });
      const kieu = chon({ nhan: 'Kiểu chữ', tuyChon: [{ v: 'giu', t: 'Giữ nguyên hoa thường' }, { v: 'thuong', t: 'chữ thường' }, { v: 'hoa', t: 'CHỮ HOA' }, { v: 'slug', t: 'Dạng liên kết (viet-khong-dau)' }], gia: 'giu', onDoi: tinh });
      const dem = h('div', { class: 'hint' });
      function tinh() {
        let s = boDau(vao.value);
        const k = kieu.lay();
        if (k === 'thuong') s = s.toLowerCase();
        else if (k === 'hoa') s = s.toUpperCase();
        else if (k === 'slug') s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        ra.value = s;
        const tu = vao.value.trim() ? vao.value.trim().split(/\s+/).length : 0;
        dem.textContent = `${vao.value.length} ký tự, ${tu} từ`;
      }
      vao.addEventListener('input', tinh);
      const b = nutBam('Chép kết quả', () => saoChep(ra.value, b), 'btn');
      root.append(h('section', { class: 'card' },
        h('div', { class: 'field' }, h('label', { for: vao.id }, 'Văn bản có dấu'), vao), dem, kieu.el,
        h('div', { class: 'field' }, h('label', { for: ra.id }, 'Không dấu'), ra), h('div', { class: 'row-btns' }, b)));
      tinh();
    }
  },
};
