// Màn "Lịch lương và nhắc": ngày lương, hạn đóng thẻ, hạn vay; nhắc trong app và xuất .ics có VALARM.
import { h, oTien, phanDoan, dong, truong, trong, thongBao, taiVe } from '../ui/dom.js';
import { homNay, dinhDangNgay, thuCua, ngayTrongThang, tach } from '../lib/dates.js';
import { danhSach, choICS } from '../lib/lich.js';
import { taoICS } from '../lib/ics.js';
import { sua, moiId } from '../lib/store.js';

const LOAI = { the: 'Thẻ tín dụng', vay: 'Khoản vay', thue: 'Thuế', khac: 'Khác' };
const NHAC = [[0, 'Ngay sáng hôm đó'], [1, 'Trước 1 ngày'], [2, 'Trước 2 ngày'], [3, 'Trước 3 ngày'], [5, 'Trước 5 ngày'], [7, 'Trước 7 ngày']];

export function ve(st) {
  const hom = homNay();
  const ds = h('ul', { class: 'list', 'data-testid': 'ds-lich' });
  const veDs = () => {
    ds.replaceChildren();
    const l = danhSach(st, hom);
    if (!l.length) { ds.append(h('li', {}, h('div', { class: 't muted' }, 'Chưa có việc nào. Nhập lương net ở Hôm nay để có ngày lương tự động, hoặc thêm việc bên dưới.'))); return; }
    for (const e of l) {
      ds.append(h('li', { 'data-id': e.id },
        h('div', { class: 't' }, h('b', {}, e.ten, e.tuDong ? h('span', { class: 'chip', style: undefined }, ' tự động') : null),
          h('span', { class: 'small muted' }, `${thuCua(e.ke)}, ${dinhDangNgay(e.ke)} · ${e.lap === 'thang' ? 'hằng tháng' : 'một lần'} · nhắc ${e.nhacTruoc === 0 ? 'ngay sáng hôm đó' : `trước ${e.nhacTruoc} ngày`}${e.soTien ? ` · ${dong(e.soTien)}` : ''}`)),
        h('span', { class: `badge ${e.conNgay === 0 ? 'vuot' : e.conNgay <= 3 ? 'sat' : 'tot'}` }, e.conNgay === 0 ? 'Hôm nay' : e.conNgay === 1 ? 'Ngày mai' : `Còn ${e.conNgay} ngày`),
        e.tuDong ? null : h('button', { type: 'button', class: 'ico-btn', 'aria-label': `Xóa nhắc ${e.ten}`, onclick: () => {
          const goc = st.lich.find((x) => x.id === e.id);
          sua((s) => { s.lich = s.lich.filter((x) => x.id !== e.id); }, { im: true }); veDs();
          thongBao(`Đã xóa nhắc ${e.ten}`, { hoanTac: () => { sua((s) => { s.lich.push(goc); }, { im: true }); veDs(); } });
        } }, '✕')));
    }
  };

  // Form
  const ten = h('input', { type: 'text', id: 'lich-ten', maxlength: '80', placeholder: 'Ví dụ: Đóng thẻ Vietcombank', autocomplete: 'off' });
  const loai = h('select', { id: 'lich-loai' }, Object.entries(LOAI).map(([k, v]) => h('option', { value: k }, v)));
  let kieu = 'thang';
  const ngayThang = h('select', { id: 'lich-ngay-thang' }, [...Array.from({ length: 28 }, (_, i) => h('option', { value: String(i + 1) }, `Ngày ${i + 1} hằng tháng`)), h('option', { value: 'cuoi' }, 'Cuối tháng')]);
  const ngayMot = h('input', { type: 'date', id: 'lich-ngay-mot', min: hom, hidden: true });
  const boxThang = truong('Ngày trong tháng', ngayThang); const boxMot = truong('Ngày', ngayMot); boxMot.hidden = true;
  const kieuSeg = phanDoan([{ id: 'thang', nhan: 'Hằng tháng' }, { id: 'mot', nhan: 'Một lần' }], kieu, (id) => { kieu = id; boxThang.hidden = id !== 'thang'; boxMot.hidden = id !== 'mot'; ngayMot.hidden = id !== 'mot'; }, 'Lặp lại');
  const nhac = h('select', { id: 'lich-nhac' }, NHAC.map(([v, t]) => h('option', { value: String(v), selected: v === 3 }, t)));
  let tien = 0;
  const oT = oTien({ nhan: 'Số tiền (tùy chọn)', macDinh: 1e6, onDoi: (v) => { tien = v; }, id: 'lich-tien' });
  const loi = h('div', { class: 'hint err', role: 'alert' });
  const form = h('section', { class: 'card', 'aria-label': 'Thêm nhắc' }, h('h2', {}, 'Thêm việc cần nhắc'),
    truong('Tên', ten), truong('Loại', loai), kieuSeg.el, boxThang, boxMot, truong('Nhắc', nhac), oT.el, loi,
    h('button', { type: 'button', class: 'btn primary', 'data-testid': 'them-nhac', onclick: () => {
      if (!ten.value.trim()) { loi.textContent = 'Hãy nhập tên việc cần nhắc.'; return; }
      let ngay;
      if (kieu === 'mot') { if (!ngayMot.value || ngayMot.value < hom) { loi.textContent = 'Hãy chọn một ngày từ hôm nay trở đi.'; return; } ngay = ngayMot.value; }
      else { const t = tach(hom); ngay = ngayTrongThang(t.y, t.m, ngayThang.value === 'cuoi' ? 'cuoi' : +ngayThang.value); }
      loi.textContent = '';
      sua((s) => { s.lich.push({ id: moiId(), ten: ten.value.trim(), loai: loai.value, ngay, lap: kieu === 'thang' ? 'thang' : 'khong', nhacTruoc: +nhac.value, soTien: tien }); }, { im: true });
      ten.value = ''; oT.dat(0, { im: true }); tien = 0; veDs();
      thongBao('Đã thêm. Nhớ xuất tệp .ics để nhắc cả trên điện thoại.');
    } }, 'Thêm'));

  const xuat = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'xuat-ics', onclick: () => {
    const sk = choICS(st, hom);
    if (!sk.length) { thongBao('Chưa có việc nào để xuất.'); return; }
    taiVe('9payday-lich.ics', taoICS(sk), 'text/calendar;charset=utf-8');
    thongBao(`Đã tạo tệp 9payday-lich.ics gồm ${sk.length} việc. Mở tệp trên điện thoại hoặc máy tính để thêm vào Lịch.`);
  } }, 'Xuất tệp lịch .ics');

  veDs();
  return {
    tieuDe: 'Lịch và nhắc',
    el: h('div', { class: 'stack' },
      h('a', { class: 'btn ghost', href: '#/them' }, '‹ Quay lại'),
      h('section', { class: 'card', 'aria-label': 'Sắp tới' }, h('h2', {}, 'Sắp tới'), ds,
        h('div', { class: 'row' }, xuat),
        h('div', { class: 'hint' }, 'Tệp .ics có sẵn nhắc (báo thức) trước hạn. Mở tệp bằng Lịch của điện thoại hoặc Google Calendar để nhận thông báo kể cả khi không mở 9payday. Ngày lương và việc hằng tháng tự lặp. Trong app, việc đến hạn nhắc sẽ hiện ở màn Hôm nay.')),
      form),
  };
}
