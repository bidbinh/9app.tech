// Đếm ngược ngày: kỷ niệm, hạn thẻ, Tết. Lưu trên máy (localStorage).
import { h, xoa, oNgay, chon, nutBam, homNayChuoi, idMoi } from '../ui/dom.js';
import { docNgay, khoangCachNgay, lanKeTiep, hienThiNgay, tenThu, ngayThanhChuoi, amSangDuongObj } from '../lib/dates.js';
import { doc, ghi } from '../lib/store.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/></svg>';

const LAP = [
  { v: 'none', t: 'Chỉ một lần' },
  { v: 'duong', t: 'Hằng năm theo dương lịch (sinh nhật, kỷ niệm)' },
  { v: 'am', t: 'Hằng năm theo âm lịch (giỗ, Tết, rằm)' },
];

const homNayObj = () => docNgay(homNayChuoi());

function tetKeTiep(hn) {
  for (let y = hn.y; y <= hn.y + 1; y++) {
    const t = amSangDuongObj(1, 1, y, false);
    if (t && khoangCachNgay(hn, t) >= 0) return t;
  }
  return null;
}

export default {
  id: 'dem-nguoc',
  ten: 'Đếm ngược',
  mota: 'Còn bao nhiêu ngày tới kỷ niệm, hạn thẻ, Tết; lưu ngay trên máy',
  tuKhoa: 'dem nguoc ngay ky niem sinh nhat han the het han visa tet con bao nhieu ngay nhac',
  icon: ICON,
  render(root) {
    let ds = doc('demnguoc', []);
    if (!Array.isArray(ds)) ds = [];
    let sua = null;

    const danhSach = h('ul', { class: 'cd-list', 'data-testid': 'cd-list' });
    const ten = h('input', { type: 'text', id: idMoi('t'), placeholder: 'Ví dụ: Hạn thẻ ngân hàng, Sinh nhật mẹ', maxlength: '60', autocomplete: 'off', 'aria-label': 'Tên sự kiện' });
    const ngay = oNgay({ nhan: 'Ngày', gia: homNayChuoi() });
    const lap = chon({ nhan: 'Lặp lại', tuyChon: LAP, gia: 'none' });
    const loi = h('div', { class: 'msg err', role: 'alert', hidden: true });
    const nutLuu = nutBam('Thêm', luu, 'btn primary');
    const nutHuy = nutBam('Hủy sửa', () => datForm(null), 'btn ghost');
    nutHuy.hidden = true;

    function datForm(m) {
      sua = m ? m.id : null;
      ten.value = m ? m.ten : '';
      ngay.input.value = m ? m.ngay : homNayChuoi();
      lap.sel.value = m ? m.lap : 'none';
      nutLuu.textContent = m ? 'Lưu thay đổi' : 'Thêm';
      nutHuy.hidden = !m;
      loi.hidden = true;
      if (m) ten.focus();
    }

    function luu() {
      const t = ten.value.trim();
      const g = docNgay(ngay.lay());
      if (!t) { loi.hidden = false; loi.textContent = 'Hãy đặt tên cho sự kiện.'; ten.focus(); return; }
      if (!g) { loi.hidden = false; loi.textContent = 'Hãy chọn ngày hợp lệ.'; return; }
      if ((lap.lay() === 'am') && (g.y < 1900 || g.y > 2100)) { loi.hidden = false; loi.textContent = 'Lặp theo âm lịch chỉ hỗ trợ năm 1900 đến 2100.'; return; }
      loi.hidden = true;
      const muc = { id: sua || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ten: t, ngay: ngayThanhChuoi(g), lap: lap.lay() };
      if (sua) ds = ds.map((x) => (x.id === sua ? muc : x)); else ds.push(muc);
      ghi('demnguoc', ds);
      datForm(null);
      ve();
    }

    function themNhanh(t, n, l) {
      ds.push({ id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ten: t, ngay: ngayThanhChuoi(n), lap: l });
      ghi('demnguoc', ds); ve();
    }

    function ve() {
      xoa(danhSach);
      const hn = homNayObj();
      const hang = ds.map((m) => {
        const k = lanKeTiep(m, hn);
        return { m, k, con: k ? khoangCachNgay(hn, k) : null };
      }).sort((a, b) => {
        // sự kiện sắp tới trước, sự kiện đã qua xuống cuối
        const A = a.con === null ? 1e9 : a.con < 0 ? 1e8 - a.con : a.con;
        const B = b.con === null ? 1e9 : b.con < 0 ? 1e8 - b.con : b.con;
        return A - B;
      });
      if (!hang.length) {
        danhSach.append(h('li', { class: 'empty' }, 'Chưa có sự kiện nào. Thêm bên dưới hoặc chọn nhanh.'));
        return;
      }
      for (const { m, k, con } of hang) {
        let chinh; let phu;
        if (con === null) { chinh = '?'; phu = ''; } else if (con === 0) { chinh = 'Hôm nay'; phu = ''; } else if (con > 0) { chinh = `Còn ${con} ngày`; phu = con >= 14 ? `${Math.floor(con / 7)} tuần ${con % 7} ngày` : ''; } else { chinh = `Đã qua ${-con} ngày`; phu = ''; }
        const lapText = m.lap === 'none' ? '' : m.lap === 'duong' ? ' · lặp hằng năm' : ' · lặp theo âm lịch';
        danhSach.append(h('li', { class: 'cd' + (con !== null && con < 0 ? ' past' : '') + (con === 0 ? ' today' : '') + (con !== null && con > 0 && con <= 7 ? ' soon' : ''), 'data-id': m.id },
          h('div', { class: 'cd-main' },
            h('div', { class: 'cd-name' }, m.ten),
            h('div', { class: 'cd-date' }, k ? `${tenThu(k)}, ${hienThiNgay(k)}${lapText}` : '')),
          h('div', { class: 'cd-count' }, h('b', {}, chinh), phu ? h('span', {}, phu) : null),
          h('div', { class: 'cd-act' },
            h('button', { type: 'button', class: 'icon-b', 'aria-label': `Sửa ${m.ten}`, onclick: () => { datForm(m); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } }, '✎'),
            h('button', { type: 'button', class: 'icon-b', 'aria-label': `Xóa ${m.ten}`, onclick: () => { ds = ds.filter((x) => x.id !== m.id); ghi('demnguoc', ds); ve(); } }, '✕'))));
      }
    }

    const hn0 = homNayObj();
    const nhanh = h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip', onclick: () => { const t = tetKeTiep(homNayObj()); if (t) themNhanh('Tết Nguyên Đán', t, 'am'); } }, '+ Tết Nguyên Đán'),
      h('button', { type: 'button', class: 'chip', onclick: () => { const h0 = homNayObj(); const y = (h0.m === 12 && h0.d > 25) ? h0.y + 1 : h0.y; themNhanh('Giáng sinh', { y, m: 12, d: 25 }, 'duong'); } }, '+ Giáng sinh'),
      h('button', { type: 'button', class: 'chip', onclick: () => { themNhanh('Quốc khánh 2/9', { y: homNayObj().y, m: 9, d: 2 }, 'duong'); } }, '+ Quốc khánh 2/9'),
      h('button', { type: 'button', class: 'chip', onclick: () => { themNhanh('Tết Dương lịch', { y: homNayObj().y + 1, m: 1, d: 1 }, 'duong'); } }, '+ Tết Dương lịch'));
    void hn0;

    root.append(
      h('h1', { class: 'sr-only' }, 'Đếm ngược'),
      h('section', { class: 'card' }, h('h2', {}, 'Sự kiện của bạn'), danhSach),
      h('section', { class: 'card' },
        h('h2', {}, 'Thêm sự kiện'),
        h('div', { class: 'field' }, h('label', { for: ten.id }, 'Tên'), ten),
        h('div', { class: 'grid2' }, ngay.el, lap.el),
        loi,
        h('div', { class: 'row-btns' }, nutLuu, nutHuy),
        h('div', { class: 'hint' }, 'Chọn nhanh:'), nhanh),
      h('div', { class: 'note small' }, 'Dữ liệu lưu ngay trên máy này, trong trình duyệt. Xóa dữ liệu trình duyệt hoặc đổi máy sẽ mất danh sách, và 9unit không gửi dữ liệu đi đâu.'),
    );
    ve();
  },
};
