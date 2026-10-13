// Chia tiền nhanh, phần trăm, giảm giá, VAT, tip.
import { h, xoa, oSo, chon, tabs, bangKetQua, baoLoi, dong, nutBam, saoChep } from '../ui/dom.js';
import { chiaDeu, chiaTheoMon, phanTramCua, laBaoNhieuPhanTram, thayDoiPhanTram, giamGia, vat, tinhTip } from '../lib/money.js';
import { dinhDangSo, docSo } from '../lib/text.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="16.5" r="3.2"/><path d="M19 5 5 19"/></svg>';

const TABS = [
  { id: 'chia-deu', ten: 'Chia đều' },
  { id: 'chia-mon', ten: 'Chia theo món' },
  { id: 'phan-tram', ten: 'Phần trăm' },
  { id: 'giam-gia', ten: 'Giảm giá' },
  { id: 'vat', ten: 'VAT' },
  { id: 'tip', ten: 'Tip' },
];

const khungKq = () => h('div', { class: 'card result', 'data-testid': 'ct-ketqua', 'aria-live': 'polite' });
const so = (v) => (Number.isFinite(v) ? v : 0);

export default {
  id: 'chia-tien',
  ten: 'Chia tiền, %',
  mota: 'Chia đều, chia theo món, tính phần trăm, giảm giá, VAT, tip',
  tuKhoa: 'chia tien chia deu chia theo mon an nhau phan tram giam gia khuyen mai vat thue tip bo tien',
  icon: ICON,
  tabs: TABS,
  moTaTab: { 'chia-deu': 'chia tien deu an nhau bao nhieu nguoi', 'chia-mon': 'chia tien theo mon moi nguoi mot phan phi phuc vu', 'phan-tram': 'phan tram % cua bao nhieu tang giam', 'giam-gia': 'giam gia khuyen mai sale tiet kiem', vat: 'vat thue gia tri gia tang 8% 10%', tip: 'tip bo tien phuc vu hoa don' },
  render(root, tab, nav) {
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    root.append(h('h1', { class: 'sr-only' }, 'Chia tiền và phần trăm'), tabs(TABS, t.id, (id) => nav(id)));
    const ra = khungKq();

    if (t.id === 'chia-deu') {
      const tong = oSo({ nhan: 'Tổng tiền (đồng)', macDinh: 1250000, docChu: 'đồng', onDoi: tinh });
      const n = oSo({ nhan: 'Số người', macDinh: 4, onDoi: tinh });
      const tip = oSo({ nhan: 'Tip / phụ phí thêm', macDinh: 0, donVi: '%', onDoi: tinh });
      const tron = chon({ nhan: 'Làm tròn lên mỗi người đến', tuyChon: [{ v: '1', t: 'Không làm tròn' }, { v: '1000', t: '1.000 đ' }, { v: '5000', t: '5.000 đ' }, { v: '10000', t: '10.000 đ' }], gia: '1000', onDoi: tinh });
      function tinh() {
        xoa(ra);
        try {
          const goc = tong.lay(); const nn = n.lay();
          if (!Number.isFinite(goc) || !Number.isFinite(nn)) throw new Error('Nhập tổng tiền và số người.');
          const co = goc * (1 + so(tip.lay()) / 100);
          const r = chiaDeu({ tong: co, soNguoi: Math.trunc(nn), lamTronLen: +tron.lay() });
          ra.append(
            h('div', { class: 'res-label' }, 'Mỗi người trả'), h('div', { class: 'res-big', 'data-testid': 'ct-so' }, dong(r.moiNguoi)),
            h('div', { class: 'res-words' }, docSo(r.moiNguoi, { donVi: 'đồng' })),
            bangKetQua([['Tổng cần trả', dong(co)], ['Tổng thu được', dong(r.tongThu)], ['Dư ra do làm tròn', dong(r.du)]]),
          );
          const b = nutBam('Chép để gửi nhóm', () => saoChep(`Tổng ${dinhDangSo(Math.round(co))} đ, ${Math.trunc(nn)} người: mỗi người ${dinhDangSo(r.moiNguoi)} đ`, b), 'btn ghost');
          ra.append(h('div', { class: 'row-btns' }, b));
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, tong.el, h('div', { class: 'grid2' }, n.el, tip.el), tron.el), ra);
      tinh();
    }

    if (t.id === 'chia-mon') {
      const dong0 = [{ ten: 'An', tien: 300000 }, { ten: 'Bình', tien: 150000 }, { ten: 'Chi', tien: 250000 }];
      const ds = h('div', { class: 'people' });
      const hang = [];
      const phu = oSo({ nhan: 'Phụ phí chung (VAT, phục vụ, tip)', macDinh: 70000, docChu: 'đồng', onDoi: tinh });
      const giam = oSo({ nhan: 'Giảm giá chung', macDinh: 0, docChu: 'đồng', onDoi: tinh });
      function themHang(g = { ten: '', tien: '' }) {
        const ten = h('input', { type: 'text', value: g.ten, placeholder: 'Tên', 'aria-label': 'Tên người', autocomplete: 'off', oninput: tinh });
        const tien = oSo({ nhan: 'Tiền món', macDinh: g.tien, onDoi: tinh });
        const bo = h('button', { type: 'button', class: 'icon-b', 'aria-label': 'Xóa người này', onclick: () => { hang.splice(hang.indexOf(rw), 1); rw.row.remove(); tinh(); } }, '✕');
        const row = h('div', { class: 'person' }, ten, tien.input, bo);
        tien.input.setAttribute('aria-label', 'Tiền món');
        tien.input.placeholder = 'Tiền món';
        const rw = { ten, tien, row };
        hang.push(rw); ds.append(row);
      }
      dong0.forEach(themHang);
      function tinh() {
        xoa(ra);
        try {
          const nguoi = hang.map((x, i) => ({ ten: x.ten.value.trim() || `Người ${i + 1}`, tien: so(x.tien.lay()) }));
          const r = chiaTheoMon({ nguoi, phuPhi: so(phu.lay()), giam: so(giam.lay()) });
          ra.append(
            h('div', { class: 'res-label' }, 'Mỗi người trả'),
            h('table', { class: 'tbl cmp', 'data-testid': 'ct-bang' },
              h('thead', {}, h('tr', {}, ['Tên', 'Tiền món', 'Phần chung', 'Phải trả'].map((x) => h('th', {}, x)))),
              h('tbody', {}, r.ds.map((x) => h('tr', {}, h('th', {}, x.ten), h('td', {}, dinhDangSo(x.rieng)), h('td', {}, dinhDangSo(Math.round(x.phanChung))), h('td', {}, h('b', {}, dinhDangSo(x.tra)))))),
              h('tfoot', {}, h('tr', {}, h('th', {}, 'Tổng'), h('th', {}, dinhDangSo(r.tongRieng)), h('th', {}, ''), h('th', {}, dinhDangSo(r.tong))))),
            h('div', { class: 'note small' }, 'Phụ phí và giảm giá chung được chia theo tỉ lệ tiền món của từng người. Phần lẻ làm tròn đã được cân vào người trả nhiều nhất để tổng khớp.'),
          );
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, h('h2', {}, 'Mỗi người ăn bao nhiêu'), ds, nutBam('+ Thêm người', () => { themHang(); }, 'btn ghost'), h('div', { class: 'grid2' }, phu.el, giam.el)), ra);
      tinh();
    }

    if (t.id === 'phan-tram') {
      const khung = (tieuDe, ...kids) => h('section', { class: 'card' }, h('h2', {}, tieuDe), ...kids);
      const a1 = oSo({ nhan: 'Phần trăm', macDinh: 15, donVi: '%', onDoi: c1 }); const b1 = oSo({ nhan: 'Của số', macDinh: 2000000, onDoi: c1 }); const r1 = h('div', { class: 'res-line', 'data-testid': 'pt-1' });
      const a2 = oSo({ nhan: 'Số', macDinh: 30, onDoi: c2 }); const b2 = oSo({ nhan: 'Trên tổng', macDinh: 120, onDoi: c2 }); const r2 = h('div', { class: 'res-line', 'data-testid': 'pt-2' });
      const a3 = oSo({ nhan: 'Giá trị cũ', macDinh: 80, onDoi: c3 }); const b3 = oSo({ nhan: 'Giá trị mới', macDinh: 100, onDoi: c3 }); const r3 = h('div', { class: 'res-line', 'data-testid': 'pt-3' });
      function c1() { const v = phanTramCua(a1.lay(), b1.lay()); r1.textContent = Number.isFinite(v) ? `${dinhDangSo(a1.lay(), 6)}% của ${dinhDangSo(b1.lay(), 6)} là ${dinhDangSo(v, 6)}` : 'Nhập đủ hai số.'; }
      function c2() { try { const v = laBaoNhieuPhanTram(a2.lay(), b2.lay()); r2.textContent = Number.isFinite(v) ? `${dinhDangSo(a2.lay(), 6)} là ${dinhDangSo(v, 4)}% của ${dinhDangSo(b2.lay(), 6)}` : 'Nhập đủ hai số.'; } catch (e) { r2.textContent = e.message; } }
      function c3() { try { const v = thayDoiPhanTram(a3.lay(), b3.lay()); r3.textContent = Number.isFinite(v) ? `${v >= 0 ? 'Tăng' : 'Giảm'} ${dinhDangSo(Math.abs(v), 4)}% (từ ${dinhDangSo(a3.lay(), 6)} lên ${dinhDangSo(b3.lay(), 6)})` : 'Nhập đủ hai số.'; } catch (e) { r3.textContent = e.message; } }
      root.append(
        khung('A% của B', h('div', { class: 'grid2' }, a1.el, b1.el), r1),
        khung('A là bao nhiêu % của B', h('div', { class: 'grid2' }, a2.el, b2.el), r2),
        khung('Tăng hay giảm bao nhiêu %', h('div', { class: 'grid2' }, a3.el, b3.el), r3),
      );
      c1(); c2(); c3();
    }

    if (t.id === 'giam-gia') {
      const gia = oSo({ nhan: 'Giá gốc (đồng)', macDinh: 1500000, docChu: 'đồng', onDoi: tinh });
      const pt = oSo({ nhan: 'Giảm', macDinh: 30, donVi: '%', onDoi: tinh });
      const them = oSo({ nhan: 'Giảm thêm (nếu có)', macDinh: 0, donVi: '%', onDoi: tinh });
      function tinh() {
        xoa(ra);
        try {
          const g = gia.lay();
          if (!Number.isFinite(g)) throw new Error('Nhập giá gốc.');
          const r = giamGia({ gia: g, phanTram: so(pt.lay()), giamThem: so(them.lay()) });
          ra.append(
            h('div', { class: 'res-label' }, 'Giá sau giảm'), h('div', { class: 'res-big', 'data-testid': 'ct-so' }, dong(r.giaSau)),
            bangKetQua([['Tiết kiệm được', dong(r.tietKiem)], ['Giảm thực tế', `${dinhDangSo(r.phanTramThucTe, 2)}%`]]),
            so(them.lay()) > 0 ? h('div', { class: 'note small' }, 'Giảm thêm được tính trên giá đã giảm lần đầu, nên 30% rồi 10% thêm là giảm 37%, không phải 40%.') : '',
          );
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, gia.el, h('div', { class: 'grid2' }, pt.el, them.el)), ra);
      tinh();
    }

    if (t.id === 'vat') {
      const sotien = oSo({ nhan: 'Số tiền (đồng)', macDinh: 1000000, docChu: 'đồng', onDoi: tinh });
      const thue = oSo({ nhan: 'Thuế suất VAT', macDinh: 10, donVi: '%', onDoi: tinh });
      const kieu = chon({ nhan: 'Số tiền trên là', tuyChon: [{ v: 'chua', t: 'Giá chưa có VAT (cần cộng VAT)' }, { v: 'co', t: 'Giá đã gồm VAT (cần tách VAT)' }], gia: 'chua', onDoi: tinh });
      const nhanh = h('div', { class: 'chips' }, [5, 8, 10].map((x) => h('button', { type: 'button', class: 'chip', onclick: () => { thue.dat(x); tinh(); } }, `${x}%`)));
      function tinh() {
        xoa(ra);
        try {
          const s = sotien.lay(); const th = thue.lay();
          if (!Number.isFinite(s) || !Number.isFinite(th)) throw new Error('Nhập số tiền và thuế suất.');
          const r = vat({ so: s, thue: th, daGomVat: kieu.lay() === 'co' });
          ra.append(
            h('div', { class: 'res-label' }, 'Tiền thuế VAT'), h('div', { class: 'res-big', 'data-testid': 'ct-so' }, dong(r.tienThue)),
            bangKetQua([['Giá chưa VAT', dong(r.chuaVat)], ['Giá có VAT', dong(r.coVat)]]),
            h('div', { class: 'note small' }, 'Thuế suất VAT có thể thay đổi theo chính sách và theo loại hàng hóa. Hãy nhập đúng mức áp dụng cho hóa đơn của bạn (các nút 5%, 8%, 10% chỉ là mức nhập nhanh).'),
          );
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, sotien.el, thue.el, nhanh, kieu.el), ra);
      tinh();
    }

    if (t.id === 'tip') {
      const hd = oSo({ nhan: 'Hóa đơn (đồng)', macDinh: 850000, docChu: 'đồng', onDoi: tinh });
      const pt = oSo({ nhan: 'Tip', macDinh: 10, donVi: '%', onDoi: tinh });
      const n = oSo({ nhan: 'Chia cho', macDinh: 3, donVi: 'người', onDoi: tinh });
      const nhanh = h('div', { class: 'chips' }, [0, 5, 10, 15].map((x) => h('button', { type: 'button', class: 'chip', onclick: () => { pt.dat(x); tinh(); } }, `${x}%`)));
      function tinh() {
        xoa(ra);
        try {
          const b = hd.lay();
          if (!Number.isFinite(b)) throw new Error('Nhập hóa đơn.');
          const r = tinhTip({ hoaDon: b, tipPhanTram: so(pt.lay()), soNguoi: Math.trunc(so(n.lay()) || 1) });
          ra.append(
            h('div', { class: 'res-label' }, 'Mỗi người trả'), h('div', { class: 'res-big', 'data-testid': 'ct-so' }, dong(r.moiNguoi)),
            bangKetQua([['Tiền tip', dong(r.tip)], ['Tổng cộng', dong(r.tong)]]),
          );
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, hd.el, pt.el, nhanh, n.el), ra);
      tinh();
    }
  },
};
