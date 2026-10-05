// Màn "Tiền": dự báo dòng tiền, hũ, danh sách chi tiêu; và phần cài đặt hũ, khoản cố định.
import { h, oTien, phanDoan, dong, trieu, trong, thongBao, truong, phanTram, idMoi } from '../ui/dom.js';
import { ghiNhanh } from '../ui/ghinhanh.js';
import { theHu, loiDuBao, nhanTrangThai, dongChi, xoaKhoanChi } from '../ui/chung.js';
import { soLieuKy } from '../lib/ky.js';
import { homNay, dinhDangNgayNgan, thuCua, dinhDangNgay } from '../lib/dates.js';
import { THU_TU_HU, HU, MAU_HU, goiYTiLe } from '../lib/spend.js';
import { sua, moiId } from '../lib/store.js';

let luiKy = 0; // 0 = kỳ này, 1 = kỳ trước

function trangChinh(st, ctx) {
  const hom = homNay();
  const root = h('div', { class: 'stack' });
  if (!(st.hoso.net > 0)) {
    root.append(h('section', { class: 'card' }, trong('Chưa có lương net', 'Nhập lương net và ngày nhận lương để chia hũ và dự báo.'), h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/' }, 'Nhập ở Hôm nay'), h('a', { class: 'btn', href: '#/luong' }, 'Tính từ gross'))));
    return { el: root, tieuDe: 'Tiền' };
  }
  const sl = soLieuKy(st, hom, luiKy);
  const { k, hu, tong } = sl;
  const seg = phanDoan([{ id: '0', nhan: 'Kỳ này' }, { id: '1', nhan: 'Kỳ trước' }], String(luiKy), (id) => { luiKy = +id; ctx.veLai(); }, 'Chọn kỳ');

  root.append(seg.el);
  root.append(h('section', { class: 'card', 'aria-label': 'Thu nhập kỳ' },
    h('div', { class: 'card-h' }, h('h2', {}, `Kỳ ${dinhDangNgayNgan(k.tu)} đến ${dinhDangNgayNgan(k.den)}`), h('a', { class: 'chip', href: '#/tien/cai-dat' }, 'Chỉnh hũ')),
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'small muted' }, 'Lương net'), h('b', { class: 'num' }, dong(st.hoso.net))),
      h('div', {}, h('div', { class: 'small muted' }, 'Khoản cố định'), h('b', { class: 'num' }, dong(hu.tongCoDinh)))),
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'small muted' }, 'Được chi (sau cố định)'), h('b', { class: 'num' }, dong(hu.tongDuocChi))),
      h('div', {}, h('div', { class: 'small muted' }, 'Đã chi'), h('b', { class: 'num' }, dong(hu.tongDaChi))))));

  const l = loiDuBao(tong, { ten: 'cả kỳ', duocChi: hu.tongDuocChi });
  if (luiKy === 0) {
    root.append(h('section', { class: 'card', 'aria-label': 'Dự báo cuối kỳ' },
      h('div', { class: 'card-h' }, h('h2', {}, 'Dự báo cuối kỳ'), nhanTrangThai(l)),
      h('p', { 'data-testid': 'du-bao' }, l.text),
      h('div', { class: 'grid2' },
        h('div', {}, h('div', { class: 'small muted' }, 'Chi trung bình mỗi ngày'), h('b', { class: 'num' }, dong(tong.tocMoiNgay))),
        h('div', {}, h('div', { class: 'small muted' }, tong.du ? 'Ước chi cả kỳ' : 'Đã chi'), h('b', { class: 'num' }, dong(tong.uocCuoiKy)))),
      h('div', { class: 'small muted' }, `Còn ${k.ngayCon + 1} ngày tính cả hôm nay. Dự báo = chi trung bình mỗi ngày x số ngày của kỳ, cần ít nhất 3 ngày dữ liệu. Chỉ là ước lượng, chi tiêu thực tế có lúc dồn một khoản lớn.`)));
    root.append(ghiNhanh());
  }
  root.append(h('section', { class: 'card', 'aria-label': 'Các hũ' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Các hũ'), h('span', { class: 'chip' }, MAU_HU[st.hu.mau]?.ten || 'Tùy chỉnh')),
    hu.ds.map((j) => theHu(j, sl.duBaoHu[j.id])),
    hu.tongTyLe !== 100 ? h('div', { class: 'note warn' }, `Tổng tỉ lệ các hũ đang là ${hu.tongTyLe}%, chưa đủ 100%. `, h('a', { href: '#/tien/cai-dat' }, 'Chỉnh lại')) : null));

  const nhom = {};
  [...sl.chi].sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : b.id.localeCompare(a.id))).forEach((c) => { (nhom[c.ngay] ||= []).push(c); });
  const ngays = Object.keys(nhom);
  root.append(h('section', { class: 'card', 'aria-label': 'Chi tiêu' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Chi tiêu trong kỳ'), h('span', { class: 'small muted' }, `${sl.chi.length} khoản`)),
    ngays.length ? ngays.map((n) => h('div', { 'data-ngay': n },
      h('div', { class: 'small muted', style: undefined }, `${thuCua(n)}, ${dinhDangNgay(n)} · ${dong(nhom[n].reduce((s, c) => s + c.soTien, 0))}`),
      h('ul', { class: 'list' }, nhom[n].map((c) => dongChi(c, st.hu.tyLe, { onXoa: xoaKhoanChi })))))
      : trong('Chưa có khoản chi nào', luiKy === 0 ? 'Gõ hoặc nói một câu ở ô ghi nhanh, ví dụ "cà phê 45k".' : 'Kỳ trước không có khoản chi nào được ghi.')));
  return { el: root, tieuDe: 'Tiền' };
}

function caiDat(st, ctx) {
  const root = h('div', { class: 'stack' });
  root.append(h('a', { class: 'btn ghost', href: '#/tien' }, '‹ Quay lại Tiền'));

  // Thu nhập
  const oNet = oTien({ nhan: 'Lương net hằng tháng', value: st.hoso.net, macDinh: 1e6, onDoi: (v) => { sua((s) => { s.hoso.net = v; }, { im: true }); capNhatTong(); } });
  const sel = h('select', { id: 'ngay-luong' });
  for (let d = 1; d <= 28; d++) sel.append(h('option', { value: String(d), selected: String(st.hoso.ngayLuong) === String(d) }, `Ngày ${d}`));
  sel.append(h('option', { value: 'cuoi', selected: st.hoso.ngayLuong === 'cuoi' }, 'Cuối tháng'));
  sel.addEventListener('change', () => sua((s) => { s.hoso.ngayLuong = sel.value === 'cuoi' ? 'cuoi' : +sel.value; }, { im: true }));
  root.append(h('section', { class: 'card' }, h('h2', {}, 'Thu nhập'), oNet.el, truong('Ngày nhận lương', sel, 'Kỳ chi tiêu chạy từ ngày lương này đến trước ngày lương kế tiếp, tự lặp mỗi tháng.')));

  // Hũ
  const tongEl = h('div', { class: 'note', role: 'status', 'data-testid': 'tong-hu' });
  const lop = h('div', { class: 'stack' });
  const goiYEl = h('div', { class: 'note warn', hidden: true, 'data-testid': 'goi-y', role: 'status' });
  function veGoiY() {
    const g = goiYTiLe({ net: st.hoso.net, hu: st.hu.tyLe, coDinh: st.coDinh });
    goiYEl.hidden = !g;
    if (!g) return;
    goiYEl.replaceChildren(h('p', {}, `Khoản cố định hũ Thiết yếu là ${dong(g.coDinhTY)}, bằng ${g.phanTramCoDinh}% lương net, nhưng hũ Thiết yếu chỉ có ${st.hu.tyLe['thiet-yeu']}% nên gần như không còn tiền ăn uống, đi lại. Gợi ý nâng Thiết yếu lên ${g.can}% và co các hũ khác theo tỉ lệ cũ.`), h('button', { type: 'button', class: 'btn sm', 'data-testid': 'ap-dung-goi-y', onclick: () => { sua((s) => { s.hu.tyLe = { ...g.tyLe }; s.hu.mau = 'tuy-chinh'; }, { im: true }); veHu(); capNhatTong(); mauNut.dat('tuy-chinh'); } }, 'Áp dụng gợi ý'));
  }
  const inputs = {};
  const veHu = () => {
    lop.replaceChildren();
    for (const id of THU_TU_HU) {
      const inp = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '100', step: '1', id: `hu-${id}`, value: String(st.hu.tyLe[id] ?? 0), 'aria-label': `Tỉ lệ hũ ${HU[id].ten}, phần trăm` });
      inputs[id] = inp;
      inp.addEventListener('input', () => {
        const v = Math.min(100, Math.max(0, Math.round(+inp.value || 0)));
        sua((s) => { if (v > 0) s.hu.tyLe[id] = v; else delete s.hu.tyLe[id]; s.hu.mau = 'tuy-chinh'; }, { im: true });
        capNhatTong();
      });
      lop.append(h('div', { class: 'row between' }, h('label', { for: inp.id, class: 'grow' }, h('b', {}, HU[id].ten), h('br'), h('span', { class: 'small muted' }, HU[id].mo)), h('div', { style: undefined, class: 'hu-in' }, inp)));
    }
  };
  function capNhatTong() {
    const t = Object.values(st.hu.tyLe).reduce((a, b) => a + b, 0);
    const net = st.hoso.net;
    tongEl.className = 'note ' + (t === 100 ? 'good' : 'warn');
    veGoiY();
    tongEl.textContent = t === 100 ? `Tổng 100%. Đủ.` : t < 100 ? `Tổng ${t}%, còn thiếu ${100 - t}%. ${net ? `Phần này (${dong(Math.round(net * (100 - t) / 100))}) chưa được chia vào hũ nào.` : ''}` : `Tổng ${t}%, đang vượt ${t - 100}%.`;
  }
  const mauNut = phanDoan([...Object.entries(MAU_HU).map(([id, m]) => ({ id, nhan: m.ten })), { id: 'tuy-chinh', nhan: 'Tùy chỉnh' }], st.hu.mau, (id) => {
    if (id !== 'tuy-chinh') sua((s) => { s.hu.tyLe = { ...MAU_HU[id].hu }; s.hu.mau = id; }, { im: true });
    else sua((s) => { s.hu.mau = 'tuy-chinh'; }, { im: true });
    veHu(); capNhatTong();
  }, 'Mẫu hũ');
  root.append(h('section', { class: 'card', 'aria-label': 'Chia hũ' },
    h('h2', {}, 'Chia hũ'),
    h('p', { class: 'sub' }, 'Chọn mẫu rồi chỉnh tỉ lệ nếu muốn. Số 0 nghĩa là không dùng hũ đó.'),
    mauNut.el, lop, tongEl, goiYEl,
    h('button', { type: 'button', class: 'btn', onclick: () => {
      const t = Object.values(st.hu.tyLe).reduce((a, b) => a + b, 0);
      if (t === 100) return;
      sua((s) => { s.hu.tyLe['thiet-yeu'] = Math.max(0, (s.hu.tyLe['thiet-yeu'] || 0) + 100 - t); s.hu.mau = 'tuy-chinh'; }, { im: true });
      veHu(); capNhatTong(); mauNut.dat('tuy-chinh');
    } }, 'Đưa phần chênh vào Thiết yếu để đủ 100%')));
  veHu(); capNhatTong();

  // Khoản cố định
  const ds = h('ul', { class: 'list', 'data-testid': 'co-dinh' });
  const veDs = () => {
    ds.replaceChildren();
    if (!st.coDinh.length) { ds.append(h('li', {}, h('div', { class: 't muted' }, 'Chưa có khoản cố định nào.'))); return; }
    st.coDinh.forEach((c) => ds.append(h('li', {},
      h('div', { class: 't' }, h('b', {}, c.ten), h('span', { class: 'small muted' }, `Hũ ${HU[c.hu]?.ten || 'Thiết yếu'}`)),
      h('span', { class: 'amt' }, dong(c.soTien)),
      h('button', { type: 'button', class: 'ico-btn', 'aria-label': `Xóa khoản cố định ${c.ten}`, onclick: () => {
        sua((s) => { s.coDinh = s.coDinh.filter((x) => x.id !== c.id); }, { im: true });
        veDs(); capNhatTong2();
        thongBao(`Đã xóa ${c.ten}`, { hoanTac: () => { sua((s) => { s.coDinh.push(c); }, { im: true }); veDs(); capNhatTong2(); } });
      } }, '✕'))));
  };
  const tong2 = h('div', { class: 'small muted', 'aria-live': 'polite' });
  function capNhatTong2() { veGoiY(); const t = st.coDinh.reduce((a, c) => a + c.soTien, 0); tong2.textContent = st.hoso.net ? `Tổng cố định ${dong(t)}, bằng ${phanTram(t / st.hoso.net)} lương net.` : `Tổng cố định ${dong(t)}.`; }
  const ten = h('input', { type: 'text', id: 'cd-ten', placeholder: 'Ví dụ: Thuê nhà', maxlength: '60', autocomplete: 'off' });
  let tien = 0;
  const oT = oTien({ nhan: 'Số tiền mỗi tháng', macDinh: 1e6, onDoi: (v) => { tien = v; }, id: 'cd-tien' });
  const selHu = h('select', { id: 'cd-hu' }, THU_TU_HU.filter((id) => HU[id].loai === 'chi').map((id) => h('option', { value: id }, HU[id].ten)));
  const loi = h('div', { class: 'hint err', role: 'alert' });
  const goiY = ['Thuê nhà', 'Trả góp xe', 'Bảo hiểm', 'Gửi gia đình', 'Điện nước, internet'].map((t) => h('button', { type: 'button', class: 'chip', onclick: () => { ten.value = t; ten.focus(); } }, t));
  root.append(h('section', { class: 'card', 'aria-label': 'Khoản cố định' },
    h('h2', {}, 'Khoản cố định mỗi tháng'),
    h('p', { class: 'sub' }, 'Thuê nhà, trả góp, bảo hiểm, tiền gửi gia đình... được trừ trước vào hũ tương ứng.'),
    ds, tong2,
    h('div', { class: 'stack' },
      truong('Tên khoản', ten), h('div', { class: 'row' }, goiY), oT.el, truong('Trừ vào hũ', selHu), loi,
      h('button', { type: 'button', class: 'btn primary', 'data-testid': 'them-co-dinh', onclick: () => {
        const t = ten.value.trim();
        if (!t) { loi.textContent = 'Hãy nhập tên khoản.'; return; }
        if (!(tien > 0)) { loi.textContent = 'Hãy nhập số tiền lớn hơn 0.'; return; }
        loi.textContent = '';
        sua((s) => { s.coDinh.push({ id: moiId(), ten: t, soTien: tien, hu: selHu.value }); }, { im: true });
        ten.value = ''; oT.dat(0, { im: true }); tien = 0; veDs(); capNhatTong2();
        thongBao(`Đã thêm khoản cố định ${t}`);
      } }, 'Thêm khoản cố định'))));
  veDs(); capNhatTong2();
  return { el: root, tieuDe: 'Chỉnh hũ' };
}

export function ve(st, ctx) {
  return ctx.parts[1] === 'cai-dat' ? caiDat(st, ctx) : trangChinh(st, ctx);
}
