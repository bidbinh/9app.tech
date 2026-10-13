// Thành phần dùng chung giữa các màn: thẻ hũ, dòng chi tiêu, hộp sửa khoản chi, lời nhắn dự báo.
import { h, svg, ICON, dong, dongDau, trieu, thanhTienDo, oTien, moHopThoai, thongBao, truong, idMoi } from './dom.js';
import { DANH_MUC, dmTheoId, huCuaKhoan, HU } from '../lib/spend.js';
import { sua, layState } from '../lib/store.js';
import { dinhDangNgayNgan, thuCua, homNay } from '../lib/dates.js';

/** Lời nhắn dự báo nhẹ nhàng cho tổng hoặc từng hũ. */
export function loiDuBao(d, { ten = 'cả kỳ', duocChi }) {
  if (duocChi <= 0 && d.mucDo === 'tot') return { cls: 'tot', icon: '✓', ngan: 'Ổn', text: 'Chưa có phần ngân sách để chi trong hũ này.' };
  if (d.mucDo === 'vuot') return { cls: 'vuot', icon: '!', ngan: 'Đã vượt', text: `Phần được chi của ${ten} đã dùng hết. Không sao, bạn có thể lấy bớt từ hũ còn dư hoặc điều chỉnh kỳ sau.` };
  if (!d.du) return { cls: 'tot', icon: '✓', ngan: 'Mới đầu kỳ', text: `Mới đầu kỳ nên chưa đủ dữ liệu để dự báo. Mỗi ngày dùng khoảng ${trieu(d.duocChiMoiNgay)} là vừa.` };
  if (d.mucDo === 'sat') return { cls: 'sat', icon: '!', ngan: 'Hơi sát', text: `Với tốc độ hiện tại, ${ten} sẽ chi khoảng ${trieu(d.uocCuoiKy)} vào cuối kỳ, trên phần được chi ${trieu(duocChi)}. Mỗi ngày còn khoảng ${trieu(d.duocChiMoiNgay)} là vừa.` };
  return { cls: 'tot', icon: '✓', ngan: 'Đúng nhịp', text: `Với tốc độ hiện tại, ${ten} dự kiến còn dư khoảng ${trieu(d.duKienDu)} vào cuối kỳ.` };
}

export function nhanTrangThai(l) { return h('span', { class: `badge ${l.cls}` }, `${l.icon} ${l.ngan}`); }

/** Thẻ một hũ. */
export function theHu(j, db, { gon = false } = {}) {
  const muc = db ? (db.mucDo === 'tot' ? '' : db.mucDo) : '';
  const bi = j.loai === 'gop';
  const phanBo = j.phanBo;
  const tyle = bi ? (phanBo > 0 ? j.daChi / phanBo : 0) : j.tyLeDung;
  return h('div', { class: 'jar', 'data-hu': j.id },
    h('div', { class: 'top' },
      h('span', { class: 'nm' }, `${j.ten} `, h('span', { class: 'muted small' }, `${j.phanTram}%`)),
      h('b', { class: 'num' }, bi ? (j.daChi >= phanBo ? 'Đã góp đủ' : `Cần góp thêm ${dong(phanBo - j.daChi)}`) : (j.conLai >= 0 ? `Còn ${dong(j.conLai)}` : `Vượt ${dong(-j.conLai)}`))),
    thanhTienDo(tyle, bi ? '' : muc),
    gon ? null : h('div', { class: 'small muted' },
      bi ? `Đã góp ${dong(j.daChi)} trên ${dong(phanBo)}` : `Phần hũ ${dong(phanBo)}${j.coDinh ? ` · cố định ${dong(j.coDinh)}` : ''} · đã chi ${dong(j.daChi)}`),
    !gon && db && !bi ? h('div', { class: 'small' }, nhanTrangThai(loiDuBao(db, { ten: `hũ ${j.ten}`, duocChi: j.duocChi })), ' ', loiDuBao(db, { ten: `hũ ${j.ten}`, duocChi: j.duocChi }).text) : null);
}

/** Một dòng khoản chi. */
export function dongChi(c, hu, { onXoa, onSua }) {
  const dm = dmTheoId(c.dm);
  const huId = huCuaKhoan(c, hu);
  return h('li', { 'data-id': c.id },
    h('div', { class: 't' }, h('b', {}, dm.ten), h('span', { class: 'small muted' }, `${thuCua(c.ngay)}, ${dinhDangNgayNgan(c.ngay)} · hũ ${HU[huId].ten}`)),
    h('span', { class: 'amt' }, dong(c.soTien)),
    h('button', { type: 'button', class: 'ico-btn', 'aria-label': `Sửa khoản ${dm.ten} ${dong(c.soTien)}`, onclick: () => hopSuaChi(c) }, svg(ICON.edit)),
    h('button', { type: 'button', class: 'ico-btn', 'aria-label': `Xóa khoản ${dm.ten} ${dong(c.soTien)}`, onclick: () => onXoa(c) }, svg(ICON.trash)));
}

export function xoaKhoanChi(c) {
  sua((s) => { s.chi = s.chi.filter((x) => x.id !== c.id); });
  thongBao(`Đã xóa ${dmTheoId(c.dm).ten} ${dong(c.soTien)}`, {
    hoanTac: () => sua((s) => { s.chi.push(c); }),
  });
}

export function hopSuaChi(c) {
  moHopThoai('Sửa khoản chi', (dong_) => {
    let tien = c.soTien;
    const oT = oTien({ nhan: 'Số tiền', value: c.soTien, macDinh: 1000, onDoi: (v) => { tien = v; } });
    const sel = h('select', { id: idMoi('dm') }, DANH_MUC.map((d) => h('option', { value: d.id, selected: d.id === c.dm }, d.ten)));
    const ngay = h('input', { type: 'date', id: idMoi('ng'), value: c.ngay, max: homNay() });
    const loi = h('div', { class: 'hint err', role: 'alert' });
    return h('div', { class: 'stack' }, oT.el, truong('Danh mục', sel), truong('Ngày', ngay), loi,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => dong_() }, 'Hủy'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => {
          if (!(tien >= 1000)) { loi.textContent = 'Số tiền phải từ 1.000 đ trở lên.'; return; }
          if (!ngay.value) { loi.textContent = 'Hãy chọn ngày.'; return; }
          sua((s) => { const x = s.chi.find((k) => k.id === c.id); if (x) { x.soTien = tien; x.dm = sel.value; x.ngay = ngay.value; delete x.hu; } });
          dong_();
        } }, 'Lưu')));
  });
}

/** Lời nhắc sắp tới (thẻ). */
export function theNhac(ds, { tieuDe = 'Nhắc sắp tới' } = {}) {
  if (!ds.length) return null;
  return h('section', { class: 'card', 'aria-label': tieuDe },
    h('div', { class: 'card-h' }, h('h2', {}, tieuDe), h('a', { class: 'chip', href: '#/them/lich' }, 'Lịch')),
    h('ul', { class: 'list' }, ds.map((e) => h('li', {},
      h('div', { class: 't' }, h('b', {}, e.ten), h('span', { class: 'small muted' }, `${thuCua(e.ke)}, ${dinhDangNgayNgan(e.ke)}${e.soTien ? ` · khoảng ${dong(e.soTien)}` : ''}`)),
      h('span', { class: `badge ${e.conNgay === 0 ? 'vuot' : e.conNgay <= 2 ? 'sat' : 'tot'}` }, e.conNgay === 0 ? 'Hôm nay' : e.conNgay === 1 ? 'Ngày mai' : `Còn ${e.conNgay} ngày`)))));
}

export { layState, dongDau };
