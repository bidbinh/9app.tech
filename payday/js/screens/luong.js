// Màn "Lương": gross <-> net, từng bước trừ, so sánh quy định mới và cũ.
import { h, oTien, boDem, phanDoan, dong, so, truong, thongBao, idMoi, phanTram } from '../ui/dom.js';
import { tinhThang, grossTuNet, QUY_DINH } from '../lib/tax.js';
import { homNay } from '../lib/dates.js';
import { sua } from '../lib/store.js';

const NHAN_XM = { goc: 'Đã đối chiếu văn bản gốc', 'thu-cap': 'Nguồn thứ cấp', chua: 'Chưa xác minh' };
const KY_HIEU_XM = { goc: '✓', 'thu-cap': '≈', chua: '?' };

export function thamSoTuState(l, thangMacDinh) {
  return {
    gross: l.gross, vung: l.vung, phuThuoc: l.phuThuoc, dongBH: l.dongBH, luongDongBH: l.luongDongBH,
    anTrua: l.anTrua, phuCapKhac: l.phuCapKhac, otGio: { thuong: l.otThuong, nghi: l.otNghi, le: l.otLe },
    thuong: l.thuong, huuTri: l.huuTri, quyDinh: l.quyDinh, thang: l.thang || thangMacDinh,
  };
}

export function tinhTuState(l, thangMacDinh) {
  const p = thamSoTuState(l, thangMacDinh);
  return l.che === 'net' ? grossTuNet(l.net, p) : tinhThang(p);
}

export function danhSachBuoc(buoc) {
  return h('ul', { class: 'steps', 'data-testid': 'tung-buoc' }, buoc.map((b) => {
    const dau = b.loai === 'cong' ? '+ ' : b.loai === 'tru' ? '− ' : '';
    const v = h('span', { class: `v ${b.loai === 'tru' ? 'tru' : b.loai === 'cong' ? 'cong' : ''}` }, `${dau}${dong(b.so)}`);
    return h('li', { class: b.loai === 'tong' ? 'tong' : b.loai === 'ketqua' ? 'ketqua' : b.loai === 'thue' ? 'thue' : '' },
      h('span', { class: 'lb' }, b.nhan), v,
      b.ghiChu ? h('span', { class: 'gc' }, b.ghiChu) : null,
      b.ref ? h('span', { class: 'gc' }, 'Căn cứ: ', b.ref, ' ', b.xm ? h('span', { class: `badge ${b.xm}` }, `${KY_HIEU_XM[b.xm]} ${NHAN_XM[b.xm]}`) : null) : null);
  }));
}

export function ve(st) {
  const hom = homNay();
  const thangNay = hom.slice(0, 7);
  const l = st.luong;
  const luu = () => sua(() => {}, { im: true });
  const kq = h('div', { class: 'stack', 'aria-live': 'polite' });

  // ---- Các ô nhập ----
  const oChinh = oTien({
    nhan: l.che === 'net' ? 'Lương Net mong muốn (thực nhận/tháng)' : 'Lương Gross (theo hợp đồng/tháng)', value: l.che === 'net' ? l.net : l.gross, macDinh: 1e6,
    ghiChu: 'Ví dụ 15000000 hoặc 15tr', onDoi: (v) => { if (l.che === 'net') l.net = v; else l.gross = v; luu(); tinhLai(); }, id: 'o-chinh',
  });
  const phanDoanChe = phanDoan([{ id: 'gross', nhan: 'Gross → Net' }, { id: 'net', nhan: 'Net → Gross' }], l.che, (id) => {
    l.che = id; luu();
    oChinh.dat(id === 'net' ? l.net : l.gross, { im: true });
    oChinh.el.querySelector('label').textContent = id === 'net' ? 'Lương Net mong muốn (thực nhận/tháng)' : 'Lương Gross (theo hợp đồng/tháng)';
    tinhLai();
  }, 'Chiều tính');
  const phanDoanQD = phanDoan([{ id: 'moi', nhan: QUY_DINH.moi.ngan }, { id: 'cu', nhan: QUY_DINH.cu.ngan }], l.quyDinh, (id) => { l.quyDinh = id; luu(); tinhLai(); }, 'Quy định thuế');
  const vung = h('select', { id: 'o-vung' }, [1, 2, 3, 4].map((v) => h('option', { value: String(v), selected: l.vung === v }, `Vùng ${['', 'I', 'II', 'III', 'IV'][v]}`)));
  vung.addEventListener('change', () => { l.vung = +vung.value; luu(); tinhLai(); });
  const phuThuoc = boDem({ nhan: 'Người phụ thuộc đã đăng ký', value: l.phuThuoc, max: 10, onDoi: (v) => { l.phuThuoc = v; luu(); tinhLai(); } });
  const thang = h('input', { type: 'month', id: 'o-thang', value: l.thang || thangNay });
  thang.addEventListener('change', () => { l.thang = /^\d{4}-\d{2}$/.test(thang.value) ? thang.value : ''; luu(); tinhLai(); });

  const oAn = oTien({ nhan: 'Phụ cấp ăn trưa/tháng', value: l.anTrua, macDinh: 1000, onDoi: (v) => { l.anTrua = v; luu(); tinhLai(); }, id: 'o-an' });
  const oPhuCap = oTien({ nhan: 'Phụ cấp chịu thuế khác (xăng, điện thoại...)', value: l.phuCapKhac, macDinh: 1000, onDoi: (v) => { l.phuCapKhac = v; luu(); tinhLai(); }, id: 'o-phucap' });
  const gioT = boDem({ nhan: 'Giờ làm thêm ngày thường (150%)', value: l.otThuong, max: 100, donVi: 'giờ', onDoi: (v) => { l.otThuong = v; luu(); tinhLai(); } });
  const gioN = boDem({ nhan: 'Giờ làm thêm ngày nghỉ tuần (200%)', value: l.otNghi, max: 100, donVi: 'giờ', onDoi: (v) => { l.otNghi = v; luu(); tinhLai(); } });
  const gioL = boDem({ nhan: 'Giờ làm thêm ngày lễ, Tết (300%)', value: l.otLe, max: 100, donVi: 'giờ', onDoi: (v) => { l.otLe = v; luu(); tinhLai(); } });
  const oThuong = oTien({ nhan: 'Thưởng nhận trong tháng này (tháng 13, dự án...)', value: l.thuong, macDinh: 1e6, onDoi: (v) => { l.thuong = v; luu(); tinhLai(); }, id: 'o-thuong' });
  const ckBH = h('input', { type: 'checkbox', id: 'o-bh', checked: l.dongBH });
  const oBH = oTien({ nhan: 'Mức lương đóng bảo hiểm (nếu khác gross)', value: l.luongDongBH, macDinh: 1e6, ghiChu: 'Để trống nếu bằng gross', onDoi: (v) => { l.luongDongBH = v; luu(); tinhLai(); }, id: 'o-lbh' });
  ckBH.addEventListener('change', () => { l.dongBH = ckBH.checked; oBH.el.hidden = !ckBH.checked; luu(); tinhLai(); });
  oBH.el.hidden = !l.dongBH;
  const oHuuTri = oTien({ nhan: 'Đóng quỹ hưu trí bổ sung tự nguyện/tháng', value: l.huuTri, macDinh: 1000, onDoi: (v) => { l.huuTri = v; luu(); tinhLai(); }, id: 'o-huutri' });

  const form = h('section', { class: 'card', 'aria-label': 'Nhập lương' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Tính lương Gross và Net')),
    phanDoanChe.el, oChinh.el,
    h('div', { class: 'grid2 keep' }, truong('Vùng làm việc', vung, 'Tra vùng theo địa bàn tại NĐ 293/2025'), phuThuoc.el),
    h('div', { class: 'lbl' }, 'Quy định thuế áp dụng'), phanDoanQD.el,
    h('details', { class: 'more', open: !!(l.anTrua || l.phuCapKhac || l.otThuong || l.otNghi || l.otLe || l.thuong || l.huuTri || !l.dongBH || l.luongDongBH) },
      h('summary', {}, 'Thêm khoản khác: ăn trưa, làm thêm giờ, thưởng...'),
      h('div', { class: 'stack' },
        truong('Tháng tính', thang, 'Mức trần bảo hiểm và mức ăn trưa miễn thuế thay đổi theo tháng'),
        oAn.el, oPhuCap.el, gioT.el, gioN.el, gioL.el, oThuong.el,
        h('label', { class: 'switch', for: 'o-bh' }, ckBH, h('span', {}, 'Có đóng BHXH, BHYT, BHTN bắt buộc')), oBH.el, oHuuTri.el)));

  function tinhLai() {
    const hienTai = (l.che === 'net' ? l.net : l.gross);
    kq.replaceChildren();
    if (!(hienTai > 0)) {
      kq.append(h('section', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'Nhập lương để xem kết quả'), l.che === 'net' ? 'Nhập mức Net bạn muốn nhận, app tìm Gross cần thương lượng.' : 'Nhập lương Gross trong hợp đồng, app tính Net thực nhận và từng khoản trừ.')));
      return;
    }
    const thangTinh = l.thang || thangNay;
    const r = tinhTuState(l, thangNay);
    const pBase = thamSoTuState(l, thangNay);
    const m = tinhThang({ ...pBase, gross: r.gross, quyDinh: 'moi' });
    const c = tinhThang({ ...pBase, gross: r.gross, quyDinh: 'cu' });
    const chenh = m.net - c.net;

    const hero = h('section', { class: 'card hero', 'aria-label': 'Kết quả' },
      h('div', { class: 'sub' }, l.che === 'net' ? 'Để nhận Net mong muốn, Gross cần' : 'Lương Net thực nhận mỗi tháng'),
      h('div', { class: 'big', 'data-testid': 'kq-chinh' }, dong(l.che === 'net' ? r.gross : r.net)),
      l.che === 'net' ? h('div', { class: 'small' }, 'Net này là tổng thực nhận cả tháng, đã gồm thưởng, làm thêm giờ và phụ cấp bạn nhập ở phần "Thêm khoản khác".') : null,
      h('div', { class: 'small', 'data-testid': 'kq-phu' }, l.che === 'net'
        ? `Net thực nhận ${dong(r.net)}${r.chenhNet ? ` (lệch ${dong(r.chenhNet)} do làm tròn đồng)` : ''}`
        : `Gross ${dong(r.gross)} · giữ lại ${phanTram(r.tyLeThucNhan)} tổng thu nhập`),
      h('div', { class: 'small' }, `Thuế TNCN ${dong(r.thue)} · bảo hiểm ${dong(r.bhTong)}${r.thue === 0 ? ' · không phải nộp thuế TNCN' : ''}`),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', 'data-testid': 'dung-cho-tien', onclick: () => {
          const cu = st.hoso.net;
          sua((s) => { s.hoso.net = r.net; }, { im: true });
          location.hash = '#/';
          thongBao(`Đã đặt lương net ${dong(r.net)} cho phần Tiền và Hôm nay`, { hoanTac: () => sua((s) => { s.hoso.net = cu; }) });
        } }, 'Dùng Net này cho phần Tiền'),
        h('a', { class: 'btn', href: '#/them/quyettoan' }, 'Ước tính quyết toán')));
    kq.append(hero);

    r.canhBao.forEach((t) => kq.append(h('div', { class: 'note warn' }, t)));
    if (l.quyDinh === 'cu' && thangTinh >= '2026-01') kq.append(h('div', { class: 'note warn' }, 'Quy định cũ không còn áp dụng cho kỳ tính thuế 2026 trở đi. Kết quả này chỉ để so sánh.'));
    if (l.quyDinh === 'moi' && thangTinh < '2026-01') kq.append(h('div', { class: 'note warn' }, 'Bạn chọn tháng trước 2026 nhưng đang xem quy định mới. Với lương trước 2026, hãy chuyển sang "Cũ ≤2025".'));

    kq.append(h('section', { class: 'card', 'aria-label': 'Từng bước' },
      h('div', { class: 'card-h' }, h('h2', {}, 'Từng bước tính'), h('span', { class: 'chip' }, QUY_DINH[l.quyDinh].ngan)),
      danhSachBuoc(r.buoc),
      h('div', { class: 'small muted' }, 'Dấu ✓ là đã đối chiếu văn bản gốc, ≈ là theo nguồn thứ cấp, ? là chưa xác minh. ', h('a', { href: '#/luong/nguon' }, 'Xem nguồn và mức xác minh'))));

    if (l.thuong > 0) {
      const khong = tinhThang({ ...pBase, gross: r.gross, thuong: 0 });
      const them = r.thue - khong.thue;
      kq.append(h('section', { class: 'card', 'aria-label': 'Thuế do thưởng' }, h('h2', {}, 'Phần thưởng bị thuế bao nhiêu?'),
        h('p', {}, `Thưởng ${dong(l.thuong)} làm thuế tăng thêm ${dong(them)}, bạn giữ lại ${dong(l.thuong - them)} (${phanTram((l.thuong - them) / l.thuong)}).`),
        h('p', { class: 'small muted' }, 'Tính như thưởng cộng vào thu nhập của tháng nhận. Cuối năm quyết toán có thể điều chỉnh lại vì thuế tính theo cả năm.')));
    }

    kq.append(h('section', { class: 'card', 'aria-label': 'So sánh quy định' },
      h('h2', {}, 'So sánh: quy định mới và cũ'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'tb', 'data-testid': 'so-sanh' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Mới 2026'), h('th', {}, 'Cũ ≤2025'))),
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Giảm trừ bản thân'), h('td', {}, so(QUY_DINH.moi.giamTruBanThan)), h('td', {}, so(QUY_DINH.cu.giamTruBanThan))),
          h('tr', {}, h('td', {}, 'Giảm trừ mỗi người phụ thuộc'), h('td', {}, so(QUY_DINH.moi.giamTruPhuThuoc)), h('td', {}, so(QUY_DINH.cu.giamTruPhuThuoc))),
          h('tr', {}, h('td', {}, 'Thu nhập tính thuế'), h('td', {}, so(m.tntt)), h('td', {}, so(c.tntt))),
          h('tr', {}, h('td', {}, 'Thuế TNCN'), h('td', {}, so(m.thue)), h('td', {}, so(c.thue))),
          h('tr', {}, h('td', {}, h('b', {}, 'Net thực nhận')), h('td', {}, h('b', {}, so(m.net))), h('td', {}, h('b', {}, so(c.net))))))),
      h('p', { 'data-testid': 'so-sanh-chu' }, chenh > 0 ? `Với cùng khoản thu nhập này, quy định mới giúp bạn nhận thêm ${dong(chenh)} mỗi tháng (khoảng ${dong(chenh * 12)} mỗi năm nếu tháng nào cũng như vậy).`
        : chenh < 0 ? `Quy định mới làm Net thấp hơn ${dong(-chenh)} mỗi tháng trong trường hợp này.` : 'Hai quy định cho cùng kết quả trong trường hợp này.'),
      h('p', { class: 'small muted' }, 'So sánh dùng cùng bảo hiểm và cùng tháng, chỉ khác biểu thuế, giảm trừ, miễn thuế làm thêm giờ và mức ăn trưa. Luật 109/2025/QH15 có hiệu lực 01/07/2026 nhưng phần tiền lương áp dụng từ kỳ tính thuế 2026 (Điều 29).')));

    kq.append(h('p', { class: 'small muted', 'data-testid': 'mien-tru' }, 'Đây là công cụ ước tính để tham khảo, không phải tư vấn thuế. Số thực tế phụ thuộc cách công ty trả lương và hướng dẫn của cơ quan thuế.'));
  }
  tinhLai();
  return { el: h('div', { class: 'stack' }, form, kq), tieuDe: 'Lương' };
}
