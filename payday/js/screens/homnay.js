// Màn "Hôm nay": còn lại trong kỳ, ghi nhanh, hũ, nhắc, khoản chi gần đây.
import { h, oTien, dong, dongDau, thanhTienDo, trieu, trong, thongBao } from '../ui/dom.js';
import { ghiNhanh } from '../ui/ghinhanh.js';
import { theHu, loiDuBao, nhanTrangThai, dongChi, xoaKhoanChi, theNhac } from '../ui/chung.js';
import { soLieuKy } from '../lib/ky.js';
import { homNay, dinhDangNgayNgan, thuCua, dinhDangNgay } from '../lib/dates.js';
import { danhSach, canNhac } from '../lib/lich.js';
import { sua } from '../lib/store.js';

function chonNgayLuong(hien) {
  const sel = h('select', { id: 'ngay-luong-on', 'aria-label': 'Ngày nhận lương' });
  for (let d = 1; d <= 28; d++) sel.append(h('option', { value: String(d), selected: String(hien) === String(d) }, `Ngày ${d}`));
  sel.append(h('option', { value: 'cuoi', selected: hien === 'cuoi' }, 'Cuối tháng'));
  return sel;
}

function batDau() {
  let net = 0;
  const o = oTien({ nhan: 'Lương net hằng tháng (thực nhận)', macDinh: 1e6, ghiChu: 'Ví dụ 15000000 hoặc 15tr. Chưa biết net? Tính từ gross ở mục Lương.', onDoi: (v) => { net = v; } });
  const sel = chonNgayLuong(5);
  const loi = h('div', { class: 'hint err', role: 'alert' });
  return h('section', { class: 'card' },
    h('h2', {}, 'Chào bạn, bắt đầu nhanh nhé'),
    h('p', { class: 'sub' }, 'Chỉ cần lương net và ngày nhận lương. 9payday chia sẵn thành các hũ và tính số còn dùng được mỗi ngày. Dữ liệu chỉ nằm trên máy bạn.'),
    o.el,
    h('div', { class: 'field' }, h('label', { for: 'ngay-luong-on' }, 'Ngày nhận lương'), sel),
    loi,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary grow', 'data-testid': 'bat-dau', onclick: () => {
        if (!(net >= 1e6)) { loi.textContent = 'Hãy nhập lương net từ 1 triệu đồng trở lên.'; return; }
        sua((s) => { s.hoso.net = net; s.hoso.ngayLuong = sel.value === 'cuoi' ? 'cuoi' : +sel.value; });
      } }, 'Bắt đầu'),
      h('a', { class: 'btn', href: '#/luong' }, 'Tính từ gross')));
}

export function ve(st) {
  const hom = homNay();
  const root = h('div', { class: 'stack' });
  if (!(st.hoso.net > 0)) {
    root.append(batDau(), h('section', { class: 'card' }, h('h2', {}, 'Bạn sẽ có gì ở đây'),
      h('ul', { class: 'stack small' },
        h('li', {}, 'Số tiền còn dùng được trong kỳ lương và mỗi ngày.'),
        h('li', {}, 'Ghi chi tiêu bằng một câu hoặc giọng nói: "cà phê 45k".'),
        h('li', {}, 'Tính lương gross và net theo thuế TNCN mới, bảo hiểm, người phụ thuộc.'),
        h('li', {}, 'Nhắc ngày lương, hạn đóng thẻ, hạn vay qua lịch điện thoại.'))));
    return { el: root, tieuDe: 'Hôm nay' };
  }
  const sl = soLieuKy(st, hom);
  const { k, hu, tong } = sl;
  const l = loiDuBao(tong, { ten: 'cả kỳ', duocChi: hu.tongDuocChi });
  const tyle = hu.tongDuocChi > 0 ? hu.tongDaChi / hu.tongDuocChi : (hu.tongDaChi > 0 ? 1 : 0);

  root.append(h('section', { class: 'card hero', 'aria-label': 'Còn lại trong kỳ' },
    h('div', { class: 'sub' }, `${thuCua(hom)}, ${dinhDangNgay(hom)}`),
    h('div', { class: 'sub' }, 'Còn lại để chi trong kỳ'),
    h('div', { class: 'big', 'data-testid': 'con-lai' }, dongDau(hu.tongConLai)),
    thanhTienDo(tyle, tong.mucDo === 'tot' ? '' : tong.mucDo),
    h('div', { class: 'small' }, `Đã chi ${dong(hu.tongDaChi)} trên ${dong(hu.tongDuocChi)} được chi (sau khoản cố định).`),
    h('div', { class: 'small' }, `Kỳ ${dinhDangNgayNgan(k.tu)} đến ${dinhDangNgayNgan(k.den)} · còn ${k.ngayCon + 1} ngày tính cả hôm nay, đến ngày lương ${dinhDangNgayNgan(k.luongKe)}. `, h('a', { href: '#/tien/cai-dat' }, 'Đổi ngày lương')),
    h('div', { class: 'small' }, hu.tongConLai > 0 ? `Mỗi ngày dùng khoảng ${dong(tong.duocChiMoiNgay)} là vừa.` : 'Hôm nay hãy chi thật cần thiết, hũ khác có thể bù nếu còn dư.')));

  root.append(h('div', { class: `note ${l.cls === 'vuot' ? 'bad' : l.cls === 'sat' ? 'warn' : 'good'}`, role: 'status' }, h('b', {}, `${l.icon} ${l.ngan}. `), l.text));
  if (hu.chiVuotCoDinh.length) root.append(h('div', { class: 'note warn' }, 'Khoản cố định đã vượt phần hũ Thiết yếu. Hãy chỉnh tỉ lệ hũ hoặc rà lại khoản cố định.', ' ', h('a', { href: '#/tien/cai-dat' }, 'Chỉnh hũ')));

  root.append(ghiNhanh());

  const nhac = canNhac(st, hom);
  const nt = theNhac(nhac, { tieuDe: 'Cần nhớ' });
  if (nt) root.append(nt);

  root.append(h('section', { class: 'card', 'aria-label': 'Các hũ' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Các hũ'), h('a', { class: 'chip', href: '#/tien' }, 'Chi tiết')),
    hu.ds.map((j) => theHu(j, sl.duBaoHu[j.id], { gon: true }))));

  const gan = [...sl.chi].sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : b.id.localeCompare(a.id))).slice(0, 5);
  root.append(h('section', { class: 'card', 'aria-label': 'Chi tiêu gần đây' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Chi tiêu gần đây'), h('a', { class: 'chip', href: '#/tien' }, 'Tất cả')),
    gan.length ? h('ul', { class: 'list', 'data-testid': 'gan-day' }, gan.map((c) => dongChi(c, st.hu.tyLe, { onXoa: xoaKhoanChi })))
      : trong('Chưa có khoản chi nào trong kỳ', 'Gõ "cà phê 45k" ở ô ghi nhanh phía trên để bắt đầu.')));
  return { el: root, tieuDe: 'Hôm nay' };
}
