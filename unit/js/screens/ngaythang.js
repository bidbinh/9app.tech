// Ngày tháng: cộng/trừ ngày, khoảng cách, ngày làm việc, tuổi, tuần thai, dương <-> âm.
import { h, xoa, oSo, oNgay, chon, tabs, bangKetQua, baoLoi, homNayChuoi, idMoi } from '../ui/dom.js';
import {
  docNgay, congKhoang, khoangCachNgay, khoangNamThangNgay, demNgayLamViec, congNgayLamViec, tinhTuoi, tinhThai,
  duongSangAmDayDu, amSangDuongObj, hienThiNgay, tenThu, soNgayThangAm, ngayThanhChuoi, ngayLeCoDinh,
} from '../lib/dates.js';
import { dinhDangSo } from '../lib/text.js';
import { canChiNam, conGiap } from '../lib/lunar.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>';

const TABS = [
  { id: 'cong-ngay', ten: 'Cộng/trừ ngày' },
  { id: 'khoang-cach', ten: 'Khoảng cách' },
  { id: 'ngay-lam-viec', ten: 'Ngày làm việc' },
  { id: 'tuoi', ten: 'Tuổi' },
  { id: 'tuan-thai', ten: 'Tuần thai' },
  { id: 'am-duong', ten: 'Âm - Dương' },
];

const hienAm = (a) => `${a.ngay}/${a.thang}${a.nhuan ? ' (nhuận)' : ''} năm ${canChiNam(a.nam)}`;
const dayDu = (o) => `${tenThu(o)}, ${hienThiNgay(o)}`;

function khung(ghiChuCuoi) {
  const ra = h('div', { class: 'card result', 'data-testid': 'nt-ketqua', 'aria-live': 'polite' });
  return { ra, ghiChuCuoi };
}

export default {
  id: 'ngay-thang',
  ten: 'Ngày tháng',
  mota: 'Cộng trừ ngày, ngày làm việc, tuổi, tuần thai, đổi dương sang âm lịch',
  tuKhoa: 'ngay thang cong tru ngay khoang cach ngay lam viec tuoi tuan thai du sinh am lich duong lich tet',
  icon: ICON,
  tabs: TABS,
  moTaTab: {
    'cong-ngay': 'cong tru ngay thang nam sau bao lau', 'khoang-cach': 'khoang cach hai ngay bao nhieu ngay', 'ngay-lam-viec': 'ngay lam viec tru le cuoi tuan',
    tuoi: 'tuoi sinh nhat con giap can chi', 'tuan-thai': 'tuan thai ngay du sinh bau mang thai', 'am-duong': 'am lich duong lich doi ngay am tet ram mung mot',
  },
  render(root, tab, nav) {
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    root.append(h('h1', { class: 'sr-only' }, 'Ngày tháng'), tabs(TABS, t.id, (id) => nav(id)));
    const hn = homNayChuoi();
    const { ra } = khung();

    if (t.id === 'cong-ngay') {
      const ngay = oNgay({ nhan: 'Từ ngày', gia: hn, onDoi: tinh });
      const huong = chon({ nhan: 'Phép tính', tuyChon: [{ v: '1', t: 'Cộng thêm' }, { v: '-1', t: 'Trừ đi' }], gia: '1', onDoi: tinh });
      const nam = oSo({ nhan: 'Năm', macDinh: 0, onDoi: tinh });
      const thang = oSo({ nhan: 'Tháng', macDinh: 0, onDoi: tinh });
      const tuan = oSo({ nhan: 'Tuần', macDinh: 0, onDoi: tinh });
      const ng = oSo({ nhan: 'Ngày', macDinh: 100, onDoi: tinh });
      function tinh() {
        xoa(ra);
        const g = docNgay(ngay.lay());
        if (!g) return ra.append(baoLoi('Chọn ngày bắt đầu.'));
        const s = +huong.lay();
        const v = [nam, thang, tuan, ng].map((x) => { const y = x.lay(); return Number.isFinite(y) ? Math.trunc(y) : 0; });
        const kq = congKhoang(g, { nam: s * v[0], thang: s * v[1], tuan: s * v[2], ngay: s * v[3] });
        if (kq.y < 1 || kq.y > 9999) return ra.append(baoLoi('Kết quả vượt quá năm 1 đến 9999.'));
        const am = duongSangAmDayDu(kq);
        ra.append(
          h('div', { class: 'res-label' }, 'Kết quả'),
          h('div', { class: 'res-big', 'data-testid': 'nt-so' }, dayDu(kq)),
          bangKetQua([['Âm lịch', hienAm(am)], ['Cách ngày bắt đầu', `${Math.abs(khoangCachNgay(g, kq))} ngày`]]),
        );
      }
      root.append(h('section', { class: 'card' }, ngay.el, huong.el, h('div', { class: 'grid4' }, nam.el, thang.el, tuan.el, ng.el)), ra);
      tinh();
    }

    if (t.id === 'khoang-cach') {
      const a = oNgay({ nhan: 'Từ ngày', gia: hn, onDoi: tinh });
      const b = oNgay({ nhan: 'Đến ngày', gia: '', onDoi: tinh });
      function tinh() {
        xoa(ra);
        const x = docNgay(a.lay()); const y = docNgay(b.lay());
        if (!x || !y) return ra.append(h('div', { class: 'hint' }, 'Chọn cả hai ngày.'));
        const n = khoangCachNgay(x, y);
        const k = khoangNamThangNgay(x, y);
        ra.append(
          h('div', { class: 'res-label' }, n >= 0 ? 'Từ ngày đầu tới ngày sau' : 'Ngày sau nằm trước ngày đầu'),
          h('div', { class: 'res-big', 'data-testid': 'nt-so' }, `${dinhDangSo(Math.abs(n))} ngày`),
          bangKetQua([
            ['Tuần và ngày', `${Math.floor(Math.abs(n) / 7)} tuần ${Math.abs(n) % 7} ngày`],
            ['Năm, tháng, ngày', `${k.nam} năm ${k.thang} tháng ${k.ngay} ngày`],
            ['Ngày đầu', dayDu(x)], ['Ngày sau', dayDu(y)],
          ]),
        );
      }
      root.append(h('section', { class: 'card' }, h('div', { class: 'grid2' }, a.el, b.el)), ra);
      tinh();
    }

    if (t.id === 'ngay-lam-viec') {
      const a = oNgay({ nhan: 'Từ ngày', gia: hn, onDoi: tinh });
      const b = oNgay({ nhan: 'Đến ngày', gia: '', onDoi: tinh });
      const cbT7 = h('input', { type: 'checkbox', id: idMoi('c'), onchange: tinh });
      const cbLe = h('input', { type: 'checkbox', id: idMoi('c'), onchange: tinh });
      const cbDau = h('input', { type: 'checkbox', id: idMoi('c'), checked: true, onchange: tinh });
      const nl = (cb, text) => h('label', { class: 'check', for: cb.id }, cb, h('span', {}, text));
      const opt = () => ({ thuBayLaLamViec: cbT7.checked, truLe: cbLe.checked, baoGomHaiDau: cbDau.checked });
      function tinh() {
        xoa(ra);
        const x = docNgay(a.lay()); const y = docNgay(b.lay());
        if (!x || !y) return ra.append(h('div', { class: 'hint' }, 'Chọn cả hai ngày.'));
        const r = demNgayLamViec(x, y, opt());
        ra.append(
          h('div', { class: 'res-label' }, 'Số ngày làm việc'),
          h('div', { class: 'res-big', 'data-testid': 'nt-so' }, `${r.lam} ngày`),
          bangKetQua([['Tổng số ngày', `${r.tong}`], ['Ngày cuối tuần nghỉ', `${r.cuoiTuan}`], ['Ngày lễ nghỉ', cbLe.checked ? `${r.nghiLe}` : 'chưa trừ']]),
        );
        if (cbLe.checked) ra.append(h('div', { class: 'note small' }, 'Ngày lễ gồm 1/1, 30/4, 1/5, 2/9, Giỗ Tổ 10/3 âm lịch và Tết Âm lịch (1 ngày cuối năm âm lịch + mùng 1 đến mùng 4). Chưa gồm ngày nghỉ bù và ngày liền kề Quốc khánh do Chính phủ công bố mỗi năm, nên hãy đối chiếu thông báo nghỉ lễ chính thức.'));
        if (!cbDau.checked && r.tong <= 2) ra.append(h('div', { class: 'hint' }, 'Bỏ hai đầu mút nên khoảng này không còn ngày nào.'));
      }
      // Cộng N ngày làm việc
      const g0 = oNgay({ nhan: 'Từ ngày', gia: hn, onDoi: tinh2 });
      const n0 = oSo({ nhan: 'Cộng thêm (ngày làm việc; số âm để lùi)', macDinh: 10, onDoi: tinh2 });
      const ra2 = h('div', { class: 'card result', 'data-testid': 'nt-ketqua2', 'aria-live': 'polite' });
      function tinh2() {
        xoa(ra2);
        const x = docNgay(g0.lay()); const n = n0.lay();
        if (!x || !Number.isFinite(n) || Math.abs(n) > 5000) return ra2.append(h('div', { class: 'hint' }, 'Chọn ngày và nhập số ngày làm việc (tối đa 5000).'));
        const kq = congNgayLamViec(x, Math.trunc(n), opt());
        ra2.append(h('div', { class: 'res-label' }, `${Math.trunc(n) >= 0 ? 'Cộng' : 'Trừ'} ${Math.abs(Math.trunc(n))} ngày làm việc`), h('div', { class: 'res-big', 'data-testid': 'nt-so2' }, dayDu(kq)));
      }
      cbT7.addEventListener('change', tinh2); cbLe.addEventListener('change', tinh2);
      root.append(
        h('section', { class: 'card' }, h('h2', {}, 'Đếm ngày làm việc'), h('div', { class: 'grid2' }, a.el, b.el), nl(cbT7, 'Thứ bảy là ngày làm việc'), nl(cbLe, 'Trừ ngày lễ cố định'), nl(cbDau, 'Tính cả ngày đầu và ngày cuối')),
        ra,
        h('section', { class: 'card' }, h('h2', {}, 'Cộng ngày làm việc'), g0.el, n0.el), ra2,
      );
      tinh(); tinh2();
    }

    if (t.id === 'tuoi') {
      const sinh = oNgay({ nhan: 'Ngày sinh', gia: '', onDoi: tinh });
      const den = oNgay({ nhan: 'Tính đến ngày', gia: hn, onDoi: tinh });
      function tinh() {
        xoa(ra);
        const s = docNgay(sinh.lay()); const d = docNgay(den.lay());
        if (!s || !d) return ra.append(h('div', { class: 'hint' }, 'Chọn ngày sinh.'));
        const r = tinhTuoi(s, d);
        if (!r) return ra.append(baoLoi('Ngày sinh nằm sau ngày tính.'));
        ra.append(
          h('div', { class: 'res-label' }, 'Tuổi'),
          h('div', { class: 'res-big', 'data-testid': 'nt-so' }, `${r.nam} tuổi`),
          bangKetQua([
            ['Chi tiết', `${r.nam} năm ${r.thang} tháng ${r.ngay} ngày`],
            ['Tổng số ngày đã sống', dinhDangSo(r.tongNgay)],
            ['Sinh nhật kế tiếp', r.conLai === 0 ? 'Hôm nay!' : `${dayDu(r.sinhNhatKe)} (còn ${r.conLai} ngày)`],
            ['Sinh vào', r.thuSinh],
            ['Năm âm lịch sinh', `${r.canChiSinh} (tuổi ${r.conGiapSinh})`],
            ['Tuổi mụ (tuổi ta)', `${r.tuoiMu}`],
          ]),
        );
      }
      root.append(h('section', { class: 'card' }, h('div', { class: 'grid2' }, sinh.el, den.el)), ra);
      tinh();
    }

    if (t.id === 'tuan-thai') {
      const kieu = chon({ nhan: 'Tôi biết', tuyChon: [{ v: 'lmp', t: 'Ngày đầu kỳ kinh cuối' }, { v: 'edd', t: 'Ngày dự sinh' }], gia: 'lmp', onDoi: tinh });
      const ng = oNgay({ nhan: 'Ngày đó là', gia: '', onDoi: tinh });
      const den = oNgay({ nhan: 'Tính đến ngày', gia: hn, onDoi: tinh });
      function tinh() {
        xoa(ra);
        const g = docNgay(ng.lay()); const d = docNgay(den.lay());
        if (!g || !d) return ra.append(h('div', { class: 'hint' }, 'Chọn ngày để tính.'));
        const r = tinhThai(kieu.lay() === 'lmp' ? { kinhCuoi: g } : { duSinh: g }, d);
        if (r.tuan === null) return ra.append(baoLoi('Ngày tính nằm trước ngày đầu kỳ kinh cuối.'));
        if (r.tongNgay > 300) return ra.append(baoLoi('Quá 42 tuần: hãy kiểm tra lại ngày nhập.'));
        ra.append(
          h('div', { class: 'res-label' }, 'Tuổi thai ước tính'),
          h('div', { class: 'res-big', 'data-testid': 'nt-so' }, `${r.tuan} tuần ${r.ngayLe} ngày`),
          bangKetQua([
            ['Ngày dự sinh (40 tuần)', dayDu(r.duSinh)],
            ['Còn lại', r.conLai >= 0 ? `${r.conLai} ngày (${Math.floor(r.conLai / 7)} tuần ${r.conLai % 7} ngày)` : `Đã quá ngày dự sinh ${-r.conLai} ngày`],
            ['Giai đoạn', `Tam cá nguyệt thứ ${r.thaiKy}`],
            ['Ngày thụ thai ước tính', dayDu(r.ngayThuThai)],
            ...r.moc.map((m) => [m.ten, dayDu(m.ngay)]),
          ]),
          h('div', { class: 'note small' }, 'Đây chỉ là ước tính theo quy tắc 40 tuần (280 ngày) tính từ ngày đầu kỳ kinh cuối, với chu kỳ 28 ngày. Tuổi thai chính thức do bác sĩ xác định bằng siêu âm. Đừng dùng kết quả này để quyết định điều trị.'),
        );
      }
      root.append(h('section', { class: 'card' }, kieu.el, h('div', { class: 'grid2' }, ng.el, den.el)), ra);
      tinh();
    }

    if (t.id === 'am-duong') {
      const dg = oNgay({ nhan: 'Ngày dương lịch', gia: hn, onDoi: tinhDa });
      const raD = h('div', { class: 'card result', 'data-testid': 'nt-ketqua', 'aria-live': 'polite' });
      function tinhDa() {
        xoa(raD);
        const g = docNgay(dg.lay());
        if (!g) return raD.append(h('div', { class: 'hint' }, 'Chọn ngày dương lịch.'));
        if (g.y < 1900 || g.y > 2100) return raD.append(baoLoi('Lịch âm chỉ tính trong khoảng năm 1900 đến 2100.'));
        const a = duongSangAmDayDu(g);
        raD.append(
          h('div', { class: 'res-label' }, `${dayDu(g)} là`),
          h('div', { class: 'res-big', 'data-testid': 'nt-so' }, `${a.ngay}/${a.thang}${a.nhuan ? ' nhuận' : ''}/${a.nam} âm lịch`),
          bangKetQua([['Năm', `${a.canChiNam} (con ${a.conGiap})`], ['Tháng', a.nhuan ? 'Tháng nhuận' : 'Tháng thường']]),
        );
      }
      const ad = oSo({ nhan: 'Ngày', macDinh: 1, onDoi: tinhAm });
      const am = oSo({ nhan: 'Tháng', macDinh: 1, onDoi: tinhAm });
      const an = oSo({ nhan: 'Năm âm lịch', macDinh: new Date().getFullYear() + 1, onDoi: tinhAm });
      const cbN = h('input', { type: 'checkbox', id: idMoi('c'), onchange: tinhAm });
      const raA = h('div', { class: 'card result', 'data-testid': 'nt-ketqua2', 'aria-live': 'polite' });
      function tinhAm() {
        xoa(raA);
        const [d, m, y] = [ad.lay(), am.lay(), an.lay()].map((x) => Math.trunc(x));
        if (![d, m, y].every(Number.isFinite)) return raA.append(h('div', { class: 'hint' }, 'Nhập ngày, tháng, năm âm lịch.'));
        if (y < 1900 || y > 2100) return raA.append(baoLoi('Lịch âm chỉ tính trong khoảng năm 1900 đến 2100.'));
        if (m < 1 || m > 12 || d < 1 || d > 30) return raA.append(baoLoi('Ngày phải từ 1 đến 30, tháng từ 1 đến 12.'));
        const r = amSangDuongObj(d, m, y, cbN.checked);
        if (!r) {
          const so = soNgayThangAm(m, y, cbN.checked);
          return raA.append(baoLoi(so === 0 ? (cbN.checked ? `Năm ${y} không có tháng ${m} nhuận.` : `Không có tháng ${m} năm ${y}.`) : `Tháng ${m}${cbN.checked ? ' nhuận' : ''} năm ${y} âm lịch chỉ có ${so} ngày.`));
        }
        raA.append(
          h('div', { class: 'res-label' }, `${d}/${m}${cbN.checked ? ' nhuận' : ''}/${y} âm lịch là`),
          h('div', { class: 'res-big', 'data-testid': 'nt-so2' }, dayDu(r)),
          bangKetQua([['Năm', `${canChiNam(y)} (con ${conGiap(y)})`]]),
        );
      }
      root.append(
        h('section', { class: 'card' }, h('h2', {}, 'Dương lịch sang âm lịch'), dg.el), raD,
        h('section', { class: 'card' }, h('h2', {}, 'Âm lịch sang dương lịch'), h('div', { class: 'grid3' }, ad.el, am.el, an.el),
          h('label', { class: 'check', for: cbN.id }, cbN, h('span', {}, 'Tháng nhuận'))), raA,
        h('div', { class: 'note small' }, 'Lịch âm tính theo múi giờ Việt Nam (UTC+7) bằng thuật toán thiên văn, khoảng năm 1900 đến 2100. Có thể lệch với lịch Trung Quốc ở những năm trăng mới rơi sát nửa đêm (ví dụ Tết 2030).'),
      );
      tinhDa(); tinhAm();
    }
  },
};
