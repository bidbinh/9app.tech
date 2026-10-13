// Vay trả góp, gửi tiết kiệm, lãi kép, so sánh hai phương án vay.
import { h, xoa, oSo, chon, tabs, bangKetQua, baoLoi, dong, saoChep, idMoi } from '../ui/dom.js';
import { bangTraNo, guiTietKiem, laiKep, soSanhVay } from '../lib/loan.js';
import { dinhDangSo } from '../lib/text.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>';

const TABS = [
  { id: 'tra-gop', ten: 'Vay trả góp' },
  { id: 'tiet-kiem', ten: 'Gửi tiết kiệm' },
  { id: 'lai-kep', ten: 'Lãi kép' },
  { id: 'so-sanh', ten: 'So sánh 2 vay' },
];
const KIEU = [
  { v: 'niemkim', t: 'Gốc + lãi chia đều mỗi tháng (niên kim)' },
  { v: 'goc-deu', t: 'Gốc đều, lãi theo dư nợ giảm dần' },
  { v: 'lai-phang', t: 'Lãi tính trên số vay ban đầu (lãi phẳng)' },
];
const KIEU_TEN = { niemkim: 'Niên kim', 'goc-deu': 'Gốc đều', 'lai-phang': 'Lãi phẳng' };

function bieuMauVay(tien, lai, thang, kieu, onDoi) {
  const so = oSo({ nhan: 'Số tiền vay (đồng)', macDinh: tien, docChu: 'đồng', onDoi });
  const ls = oSo({ nhan: 'Lãi suất mỗi năm', macDinh: lai, donVi: '%/năm', onDoi });
  const kh = oSo({ nhan: 'Kỳ hạn', macDinh: thang, donVi: 'tháng', onDoi });
  const ki = chon({ nhan: 'Cách trả', tuyChon: KIEU, gia: kieu, onDoi });
  return {
    el: h('div', {}, so.el, h('div', { class: 'grid2' }, ls.el, kh.el), ki.el),
    lay: () => ({ soTien: so.lay(), laiNam: ls.lay(), soThang: kh.lay(), kieu: ki.lay() }),
  };
}

function tinhVay(p) {
  if (![p.soTien, p.laiNam, p.soThang].every(Number.isFinite)) throw new Error('Nhập đủ số tiền, lãi suất và kỳ hạn.');
  return bangTraNo({ ...p, soThang: Math.trunc(p.soThang) });
}

function bangHtml(r) {
  const tb = h('table', { class: 'tbl', 'data-testid': 'bang-tra-no' },
    h('thead', {}, h('tr', {}, ['Kỳ', 'Gốc', 'Lãi', 'Tổng trả', 'Dư nợ'].map((x) => h('th', {}, x)))),
    h('tbody', {}, r.hang.map((x) => h('tr', {}, [x.ky, dinhDangSo(x.goc), dinhDangSo(x.lai), dinhDangSo(x.tra), dinhDangSo(x.duNo)].map((c) => h('td', {}, String(c)))))),
    h('tfoot', {}, h('tr', {}, h('th', {}, 'Tổng'), h('th', {}, dinhDangSo(r.hang.reduce((s, x) => s + x.goc, 0))), h('th', {}, dinhDangSo(r.tongLai)), h('th', {}, dinhDangSo(r.tongTra)), h('th', {}, ''))));
  return h('div', { class: 'tbl-wrap' }, tb);
}

export default {
  id: 'vay-lai',
  ten: 'Vay, gửi, lãi',
  mota: 'Trả góp có bảng trả nợ, gửi tiết kiệm, lãi kép, so sánh hai khoản vay',
  tuKhoa: 'vay lai tra gop bang tra no gui tiet kiem lai kep lai suat ngan hang so sanh khoan vay mua nha mua xe',
  icon: ICON,
  tabs: TABS,
  moTaTab: { 'tra-gop': 'vay tra gop bang tra no nien kim goc deu lai phang', 'tiet-kiem': 'gui tiet kiem lai suat ky han so tiet kiem', 'lai-kep': 'lai kep dau tu gop hang thang', 'so-sanh': 'so sanh hai khoan vay phuong an' },
  render(root, tab, nav) {
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    root.append(h('h1', { class: 'sr-only' }, 'Vay, gửi, lãi'), tabs(TABS, t.id, (id) => nav(id)));
    const ra = h('div', { class: 'card result', 'data-testid': 'vl-ketqua', 'aria-live': 'polite' });
    const bang = h('div', { 'data-testid': 'vl-bang' });

    if (t.id === 'tra-gop') {
      const f = bieuMauVay(500000000, 9, 120, 'niemkim', tinh);
      let mo = false;
      function tinh() {
        xoa(ra); xoa(bang);
        try {
          const p = f.lay(); const r = tinhVay(p);
          const hang = [
            [p.kieu === 'niemkim' ? 'Mỗi tháng trả' : 'Tháng đầu trả', dong(r.kyDau), 'lon'],
          ];
          if (p.kieu === 'goc-deu') hang.push(['Tháng cuối trả', dong(r.kyCuoi)]);
          hang.push(['Tổng tiền lãi', dong(r.tongLai)], ['Tổng phải trả', dong(r.tongTra)]);
          if (r.laiThucNam) hang.push(['Lãi suất thực tế ước tính', `${dinhDangSo(r.laiThucNam, 1)}%/năm`]);
          ra.append(h('div', { class: 'res-label' }, `${KIEU_TEN[p.kieu]}, ${p.soThang} tháng`), bangKetQua(hang));
          if (p.kieu === 'lai-phang') ra.append(h('div', { class: 'note small' }, 'Lãi phẳng tính lãi trên toàn bộ số vay ban đầu dù bạn đã trả dần gốc, nên lãi suất thực tế cao hơn con số công bố. Hãy so với lãi suất thực khi chọn khoản vay.'));
          const bt = h('button', { type: 'button', class: 'btn', 'data-testid': 'xem-bang', onclick: () => { mo = !mo; ve(); } }, mo ? 'Ẩn bảng trả nợ' : 'Xem bảng trả nợ');
          const ch = h('button', { type: 'button', class: 'btn ghost', onclick: () => saoChep(['Kỳ\tGốc\tLãi\tTổng trả\tDư nợ', ...r.hang.map((x) => [x.ky, x.goc, x.lai, x.tra, x.duNo].join('\t'))].join('\n'), ch) }, 'Chép bảng');
          ra.append(h('div', { class: 'row-btns' }, bt, ch));
          ve = () => { bt.textContent = mo ? 'Ẩn bảng trả nợ' : 'Xem bảng trả nợ'; xoa(bang); if (mo) bang.append(bangHtml(r)); };
          ve();
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      let ve = () => {};
      root.append(h('section', { class: 'card' }, f.el), ra, bang, h('div', { class: 'note small' }, 'Kết quả mang tính tham khảo. Ngân hàng có thể tính lãi theo số ngày thực tế, phí và ân hạn gốc, nên số thực tế có thể khác đôi chút.'));
      tinh();
    }

    if (t.id === 'tiet-kiem') {
      const so = oSo({ nhan: 'Số tiền gửi (đồng)', macDinh: 100000000, docChu: 'đồng', onDoi: tinh });
      const ls = oSo({ nhan: 'Lãi suất', macDinh: 5.5, donVi: '%/năm', onDoi: tinh });
      const kh = oSo({ nhan: 'Kỳ hạn', macDinh: 12, donVi: 'tháng', onDoi: tinh });
      const kieu = chon({ nhan: 'Cách nhận lãi', tuyChon: [{ v: 'cuoi', t: 'Lãi nhận cuối kỳ' }, { v: 'nhap', t: 'Lãi nhập gốc mỗi tháng' }], gia: 'cuoi', onDoi: tinh });
      function tinh() {
        xoa(ra);
        try {
          const p = { soTien: so.lay(), laiNam: ls.lay(), soThang: Math.trunc(kh.lay()), nhapLai: kieu.lay() === 'nhap' };
          if (![p.soTien, p.laiNam, p.soThang].every(Number.isFinite)) throw new Error('Nhập đủ số tiền, lãi suất và kỳ hạn.');
          const r = guiTietKiem(p);
          ra.append(
            h('div', { class: 'res-label' }, 'Tiền lãi nhận được'), h('div', { class: 'res-big', 'data-testid': 'vl-so' }, dong(r.lai)),
            bangKetQua([['Tổng nhận cuối kỳ', dong(r.tongNhan)], ['Lãi trung bình mỗi tháng', dong(r.lai / p.soThang)]]),
            h('div', { class: 'note small' }, 'Lãi đơn tính theo tháng chia 12. Một số ngân hàng tính theo số ngày thực gửi chia 365 nên chênh nhẹ. Chưa trừ thuế hay phí (nếu có).'),
          );
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, so.el, h('div', { class: 'grid2' }, ls.el, kh.el), kieu.el), ra);
      tinh();
    }

    if (t.id === 'lai-kep') {
      const von = oSo({ nhan: 'Vốn ban đầu (đồng)', macDinh: 100000000, docChu: 'đồng', onDoi: tinh });
      const gop = oSo({ nhan: 'Góp thêm mỗi tháng (đồng)', macDinh: 5000000, docChu: 'đồng', onDoi: tinh });
      const ls = oSo({ nhan: 'Lãi suất', macDinh: 8, donVi: '%/năm', onDoi: tinh });
      const nam = oSo({ nhan: 'Thời gian', macDinh: 10, donVi: 'năm', onDoi: tinh });
      const ghep = chon({ nhan: 'Ghép lãi', tuyChon: [{ v: '12', t: 'Mỗi tháng' }, { v: '4', t: 'Mỗi quý' }, { v: '2', t: 'Mỗi 6 tháng' }, { v: '1', t: 'Mỗi năm' }, { v: '365', t: 'Mỗi ngày' }], gia: '12', onDoi: tinh });
      const bangNam = h('div', {});
      function tinh() {
        xoa(ra); xoa(bangNam);
        try {
          const p = { von: von.lay() || 0, gopThang: gop.lay() || 0, laiNam: ls.lay(), soNam: nam.lay(), kyGhep: +ghep.lay() };
          if (![p.laiNam, p.soNam].every(Number.isFinite)) throw new Error('Nhập lãi suất và thời gian.');
          if (p.soNam > 100) throw new Error('Thời gian tối đa 100 năm.');
          const r = laiKep(p);
          ra.append(
            h('div', { class: 'res-label' }, `Sau ${dinhDangSo(p.soNam)} năm có`), h('div', { class: 'res-big', 'data-testid': 'vl-so' }, dong(r.tong)),
            bangKetQua([['Tổng đã bỏ vào', dong(r.daGop)], ['Tiền lãi sinh ra', dong(r.lai)]]),
          );
          bangNam.append(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {}, ['Năm', 'Đã bỏ vào', 'Lãi', 'Số dư'].map((x) => h('th', {}, x)))),
            h('tbody', {}, r.theoNam.map((x) => h('tr', {}, [x.nam, dinhDangSo(x.daGop), dinhDangSo(x.lai), dinhDangSo(x.soDu)].map((c) => h('td', {}, String(c)))))))));
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(h('section', { class: 'card' }, von.el, gop.el, h('div', { class: 'grid2' }, ls.el, nam.el), ghep.el), ra, bangNam, h('div', { class: 'note small' }, 'Khoản góp thêm được cộng vào cuối mỗi tháng. Đây là phép tính lý thuyết, chưa trừ thuế, phí hay lạm phát.'));
      tinh();
    }

    if (t.id === 'so-sanh') {
      const A = bieuMauVay(500000000, 10, 120, 'niemkim', tinh);
      const B = bieuMauVay(500000000, 9, 120, 'goc-deu', tinh);
      function tinh() {
        xoa(ra);
        try {
          const a = tinhVay(A.lay()); const b = tinhVay(B.lay());
          const s = soSanhVay(A.lay(), B.lay());
          const ten = { A: 'Phương án A', B: 'Phương án B' };
          ra.append(
            h('div', { class: 'res-label' }, 'Kết luận'),
            h('div', { class: 'res-big', 'data-testid': 'vl-so' }, s.reHon === 'bang' ? 'Hai phương án trả bằng nhau' : `${ten[s.reHon]} rẻ hơn ${dong(Math.abs(s.chenhTongTra))}`),
            h('table', { class: 'tbl cmp' },
              h('thead', {}, h('tr', {}, ['', 'A', 'B'].map((x) => h('th', {}, x)))),
              h('tbody', {},
                [['Trả tháng đầu', dong(a.kyDau), dong(b.kyDau)], ['Trả tháng cuối', dong(a.kyCuoi), dong(b.kyCuoi)], ['Tổng tiền lãi', dong(a.tongLai), dong(b.tongLai)], ['Tổng phải trả', dong(a.tongTra), dong(b.tongTra)]]
                  .map((r) => h('tr', {}, r.map((c, i) => (i === 0 ? h('th', {}, c) : h('td', {}, c))))))),
            h('div', { class: 'note small' }, 'So sánh theo tổng tiền phải trả. Một khoản có thể rẻ hơn về tổng nhưng nặng hơn ở các tháng đầu, hãy xem dòng "Trả tháng đầu" khi cân đối dòng tiền.'),
          );
        } catch (e) { ra.append(baoLoi(e.message)); }
      }
      root.append(
        h('div', { class: 'two-col' },
          h('section', { class: 'card' }, h('h2', {}, 'Phương án A'), A.el),
          h('section', { class: 'card' }, h('h2', {}, 'Phương án B'), B.el)),
        ra);
      tinh();
    }
  },
};
