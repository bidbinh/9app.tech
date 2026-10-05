// Màn "Quyết toán thuế cuối năm" (ước tính mức cơ bản).
import { h, oTien, dong, dongDau, so, truong, thongBao, phanDoan } from '../ui/dom.js';
import { quyetToanNam, hanQuyetToan, QUY_DINH } from '../lib/tax.js';
import { dinhDangNgay, homNay, thuCua } from '../lib/dates.js';
import { sua, moiId } from '../lib/store.js';
import { danhSachBuoc } from './luong.js';

const CHECKLIST = [
  ['ct-khautru', 'Chứng từ khấu trừ thuế TNCN năm do công ty cấp (nếu công ty cấp một chứng từ cho cả năm, hoặc từng tháng)'],
  ['ct-mst', 'Mã số thuế cá nhân và căn cước công dân'],
  ['ct-npt', 'Hồ sơ người phụ thuộc: đã đăng ký mã số thuế người phụ thuộc, giấy khai sinh/giấy tờ chứng minh quan hệ, CCCD của họ'],
  ['ct-nhieu-noi', 'Chứng từ khấu trừ của mọi nơi trả thu nhập nếu trong năm bạn đổi việc hoặc làm nhiều nơi'],
  ['ct-bh', 'Bảng kê hoặc xác nhận đã đóng BHXH, BHYT, BHTN bắt buộc'],
  ['ct-huutri', 'Chứng từ đóng quỹ hưu trí bổ sung tự nguyện (nếu có)'],
  ['ct-tuthien', 'Chứng từ đóng góp từ thiện, nhân đạo, khuyến học đúng quy định (nếu có)'],
  ['ct-hoan', 'Số tài khoản ngân hàng nhận tiền hoàn thuế (nếu được hoàn)'],
];

export function ve(st) {
  const q = st.quyetToan;
  const l = st.luong;
  const hom = homNay();
  const luu = () => sua(() => {}, { im: true });
  const kq = h('div', { class: 'stack', 'aria-live': 'polite' });
  const o = {};

  const namSel = h('select', { id: 'qt-nam' }, [2024, 2025, 2026].map((n) => h('option', { value: String(n), selected: q.nam === n }, `Năm ${n}`)));
  namSel.addEventListener('change', () => { q.nam = +namSel.value; luu(); ra(); });

  const chung = () => ({
    vung: l.vung, phuThuoc: l.phuThuoc, dongBH: l.dongBH, luongDongBH: l.luongDongBH, anTrua: l.anTrua, phuCapKhac: l.phuCapKhac,
    otGio: { thuong: l.otThuong, nghi: l.otNghi, le: l.otLe }, huuTri: l.huuTri,
  });

  const tatCaTrong = q.thang.every((t) => !t.gross && !t.thuong);
  if (tatCaTrong && l.gross > 0) { q.thang.forEach((t) => { t.gross = l.gross; }); luu(); }
  const dsThang = h('div', { class: 'stack' });
  for (let i = 0; i < 12; i++) {
    const t = q.thang[i];
    const g = oTien({ nhan: `Tháng ${i + 1}: lương gross`, value: t.gross, macDinh: 1e6, onDoi: (v) => { t.gross = v; luu(); ra(); }, id: `qt-g${i}` });
    const b = oTien({ nhan: `Tháng ${i + 1}: thưởng, thu nhập khác chịu thuế`, value: t.thuong, macDinh: 1e6, onDoi: (v) => { t.thuong = v; luu(); ra(); }, id: `qt-b${i}` });
    o[i] = { g, b };
    dsThang.append(h('div', { class: 'grid2 keep' }, g.el, b.el));
  }
  const oChung = oTien({ nhan: 'Lương gross mỗi tháng (áp dụng cho cả 12 tháng)', value: q.thang.find((t) => t.gross)?.gross || 0, macDinh: 1e6, ghiChu: 'Lấy sẵn từ mục Lương. Tháng nào khác (đổi việc, nghỉ không lương), mở phần chỉnh từng tháng bên dưới.', onDoi: (v) => { q.thang.forEach((t, i) => { t.gross = v; o[i].g.dat(v, { im: true }); }); luu(); ra(); }, id: 'qt-gross-chung' });
  const oCuoi = oTien({ nhan: 'Thưởng cuối năm nhận ở tháng 12 (nếu có)', value: q.thang[11].thuong, macDinh: 1e6, onDoi: (v) => { q.thang[11].thuong = v; o[11].b.dat(v, { im: true }); luu(); ra(); }, id: 'qt-thuong-cuoi' });
  const oKhauTru = oTien({ nhan: 'Tổng thuế đã khấu trừ theo chứng từ (nếu bạn có số thật)', value: q.daKhauTru || 0, macDinh: 1e6, ghiChu: 'Để trống để app tự ước tính từ lương từng tháng', onDoi: (v) => { q.daKhauTru = v > 0 ? v : null; luu(); ra(); }, id: 'qt-khau-tru' });


  const han = () => hanQuyetToan(q.nam);

  function ra() {
    kq.replaceChildren();
    const r = quyetToanNam({ nam: q.nam, thang: q.thang, chung: chung(), daKhauTru: q.daKhauTru });
    if (!r.soThangCoLuong) {
      kq.append(h('section', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'Nhập lương các tháng để ước tính'), 'Nhập lương gross mỗi tháng ở trên, hoặc nhập ở mục Lương trước.')));
      return;
    }
    const qd = QUY_DINH[r.quyDinh];
    const nhan = r.ketLuan === 'hoan' ? 'Có thể được hoàn / bù trừ' : r.ketLuan === 'nop-them' ? 'Có thể phải nộp thêm' : 'Gần như khớp, không hoàn không nộp thêm';
    kq.append(h('section', { class: `card hero`, 'aria-label': 'Kết quả ước tính' },
      h('div', { class: 'sub' }, `Ước tính quyết toán năm ${q.nam}`),
      h('div', { class: 'sub' }, nhan),
      h('div', { class: 'big', 'data-testid': 'qt-ket-qua' }, r.ketLuan === 'khop' ? '0 đ' : dong(Math.abs(r.chenh))),
      h('div', { class: 'small' }, `Thuế phải nộp cả năm ${dong(r.thuePhaiNop)} · đã khấu trừ ${dong(r.daKhauTru)}${r.tuNhap ? ' (số bạn nhập)' : ' (ước tính)'}`)));
    const buoc = [
      { loai: 'cong', nhan: 'Tổng thu nhập chịu thuế cả năm', so: r.tongChiuThue },
      { loai: 'tru', nhan: 'Trừ bảo hiểm bắt buộc đã đóng', so: r.tongBH },
      ...(r.tongHuuTri ? [{ loai: 'tru', nhan: 'Trừ quỹ hưu trí bổ sung tự nguyện', so: r.tongHuuTri }] : []),
      { loai: 'tru', nhan: `Giảm trừ bản thân (${r.soThangCoLuong} tháng x ${so(qd.giamTruBanThan)})`, so: r.giamTruBanThan, ref: qd.refGiamTru, xm: qd.xmGiamTru },
      ...(r.giamTruPT ? [{ loai: 'tru', nhan: `Giảm trừ người phụ thuộc (${r.soThangCoLuong} tháng x ${l.phuThuoc} người x ${so(qd.giamTruPhuThuoc)})`, so: r.giamTruPT, ref: qd.refGiamTru, xm: qd.xmGiamTru }] : []),
      { loai: 'tong', nhan: 'Thu nhập tính thuế cả năm', so: r.tnttNam },
      ...r.bacThue.filter((b) => b.phan > 0).map((b) => ({ loai: 'thue', nhan: `Bậc ${b.bac}: ${b.suat}% x ${so(b.phan)}`, so: b.thue, ghiChu: `Biểu theo năm: ${b.tu === 0 ? 'đến' : 'trên'} ${so(b.tu / 1e6)}${Number.isFinite(b.den) ? ` đến ${so(b.den / 1e6)}` : ''} triệu` })),
      { loai: 'tru', nhan: 'Thuế TNCN phải nộp cả năm', so: r.thuePhaiNop, ref: qd.refBieu, xm: qd.xmBieu },
      { loai: 'cong', nhan: 'Thuế đã khấu trừ trong năm', so: r.daKhauTru },
      { loai: 'ketqua', nhan: r.chenh >= 0 ? 'Đã khấu trừ nhiều hơn phải nộp' : 'Còn phải nộp thêm', so: Math.abs(r.chenh) },
    ];
    kq.append(h('section', { class: 'card', 'aria-label': 'Chi tiết quyết toán' }, h('h2', {}, 'Chi tiết'), danhSachBuoc(buoc),
      r.nam >= 2026 ? h('div', { class: 'note warn' }, 'Với năm 2026, ước tính "đã khấu trừ" giả định tháng 1 đến 6 công ty khấu trừ theo biểu 7 bậc cũ (với giảm trừ mới) và từ tháng 7 theo biểu 5 bậc. Giả định này CHƯA XÁC MINH từ văn bản gốc. Hãy nhập số thật trên chứng từ khấu trừ vào ô phía trên.') : null,
      r.dong.filter((d) => !d.bo).length ? h('details', { class: 'more' }, h('summary', {}, 'Thuế khấu trừ ước tính từng tháng'),
        h('div', { class: 'scroll-x' }, h('table', { class: 'tb' }, h('thead', {}, h('tr', {}, ['Tháng', 'Gross', 'Thưởng', 'Khấu trừ'].map((t) => h('th', {}, t)))),
          h('tbody', {}, r.dong.filter((d) => !d.bo).map((d) => h('tr', {}, h('td', {}, d.thang.slice(5)), h('td', {}, so(d.gross)), h('td', {}, so(d.thuong)), h('td', {}, so(d.khauTru)))))))) : null));
  }

  const hanThongTin = han();
  const suKienHan = () => {
    const ngay = hanThongTin.tuQuyetToan;
    if (st.lich.some((x) => x.id === `qt-${q.nam}`)) { thongBao('Đã có nhắc này trong Lịch.'); return; }
    sua((s) => { s.lich.push({ id: `qt-${q.nam}`, ten: `Hạn quyết toán thuế TNCN năm ${q.nam}`, loai: 'thue', ngay, lap: 'khong', nhacTruoc: 7, soTien: 0 }); }, { im: true });
    thongBao(`Đã thêm nhắc hạn ${dinhDangNgay(ngay)} vào Lịch (nhắc trước 7 ngày)`);
  };
  const hanEl = h('section', { class: 'card', 'aria-label': 'Hạn quyết toán' });
  function veHan() {
    const hh = han();
    hanEl.replaceChildren(h('h2', {}, 'Hạn nộp'),
      h('ul', { class: 'stack' },
        h('li', {}, 'Ủy quyền cho công ty quyết toán thay: chậm nhất ', h('b', {}, `${thuCua(hh.uyQuyen)}, ${dinhDangNgay(hh.uyQuyen)}`), '.'),
        h('li', {}, 'Tự quyết toán với cơ quan thuế: chậm nhất ', h('b', {}, `${thuCua(hh.tuQuyetToan)}, ${dinhDangNgay(hh.tuQuyetToan)}`), '. Nếu rơi vào ngày nghỉ lễ thì dời sang ngày làm việc kế tiếp.')),
      h('div', { class: 'small muted' }, `Căn cứ: ${hh.ref} `, h('span', { class: `badge ${hh.xm}` }, hh.xm === 'chua' ? '? Chưa xác minh' : '≈ Nguồn thứ cấp')),
      hh.luuY ? h('div', { class: 'note warn' }, hh.luuY) : null,
      h('button', { type: 'button', class: 'btn', onclick: suKienHan }, 'Thêm nhắc hạn này vào Lịch'));
  }
  namSel.addEventListener('change', veHan);

  const ds = h('ul', { class: 'stack', 'data-testid': 'checklist' }, CHECKLIST.map(([id, t]) => {
    const ck = h('input', { type: 'checkbox', id: `cl-${id}`, checked: !!q.checklist[id] });
    ck.addEventListener('change', () => { q.checklist[id] = ck.checked; luu(); });
    return h('li', {}, h('label', { class: 'switch', for: ck.id }, ck, h('span', {}, t)));
  }));

  veHan(); ra();
  return {
    tieuDe: 'Quyết toán thuế',
    el: h('div', { class: 'stack' },
      h('a', { class: 'btn ghost', href: '#/them' }, '‹ Quay lại'),
      h('div', { class: 'note warn' }, 'Chỉ là ước tính mức cơ bản cho thu nhập từ tiền lương. Không phải tư vấn thuế và không thay cho việc khai quyết toán chính thức. Dùng số trên chứng từ khấu trừ của công ty khi nộp thật.'),
      h('section', { class: 'card', 'aria-label': 'Nhập dữ liệu năm' }, h('h2', {}, 'Dữ liệu năm'), truong('Năm tính thuế', namSel),
        h('p', { class: 'small muted' }, `Dùng chung vùng ${l.vung}, ${l.phuThuoc} người phụ thuộc, ăn trưa, làm thêm giờ từ mục `, h('a', { href: '#/luong' }, 'Lương'), '. Nhập lương gross và thưởng bên dưới.'),
        oChung.el, oCuoi.el,
        h('details', { class: 'more' }, h('summary', {}, 'Chỉnh từng tháng (đổi việc, thưởng nhiều lần)'), dsThang),
        oKhauTru.el),
      kq, hanEl,
      h('section', { class: 'card', 'aria-label': 'Chứng từ cần gom' }, h('h2', {}, 'Chứng từ cần gom'), ds,
        h('div', { class: 'small muted' }, 'Danh sách gợi ý theo thông lệ, hãy đối chiếu thêm với hướng dẫn của cơ quan thuế hoặc kế toán công ty.'))),
  };
}
