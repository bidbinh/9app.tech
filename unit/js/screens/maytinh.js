// Máy tính thường + máy tính giọng nói.
import { h, xoa, svg, nutBam, saoChep } from '../ui/dom.js';
import { taoVoiceBox } from '../ui/voicebox.js';
import { phanTichLoiNoi } from '../lib/voice.js';
import { tinhChuoi } from '../lib/calc.js';
import { dinhDangSo } from '../lib/text.js';
import { doc, ghi } from '../lib/store.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="3"/><rect x="7" y="5.5" width="10" height="4" rx="1"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/></svg>';
const VIDU = [
  'ba triệu hai trăm nghìn cộng năm mươi nghìn',
  'mười phần trăm của hai triệu',
  'chia đôi bốn trăm tám mươi nghìn',
  'hai lẻ năm nhân ba',
  'ba chỉ vàng bằng bao nhiêu gram',
  'căn bậc hai của một trăm sáu mươi chín',
];
const LICH_SU_TOI_DA = 40;

const soThanhChuoi = (v) => {
  let s = String(Number(v.toPrecision(14)));
  if (/e/i.test(s)) s = v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 10 });
  return s;
};

/** Hiển thị biểu thức bàn phím: nhóm nghìn kiểu Việt, dấu phẩy thập phân. */
export function hienThiBieuThuc(s) {
  return s.replace(/\d+(\.\d*)?/g, (m) => {
    const [i, f] = m.split('.');
    const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return f !== undefined ? `${g},${f}` : g;
  });
}

export default {
  id: 'may-tinh',
  ten: 'Máy tính',
  mota: 'Bàn phím số và nói tiếng Việt: "ba triệu cộng hai trăm nghìn"',
  tuKhoa: 'may tinh calculator giong noi noi cong tru nhan chia phan tram can bac hai binh phuong',
  icon: ICON,
  render(root) {
    let bt = '';
    let vuaTinh = false;
    let lichSu = doc('lichsu', []);
    if (!Array.isArray(lichSu)) lichSu = [];
    const ans = () => (lichSu.length && Number.isFinite(lichSu[0].v) ? lichSu[0].v : null);

    // ---------- Giọng nói ----------
    const ketQua = h('section', { class: 'card result', 'data-testid': 'ket-qua-noi', hidden: true });
    const vb = taoVoiceBox({
      placeholder: 'Nói hoặc gõ: ba triệu hai trăm nghìn cộng năm mươi nghìn',
      nutText: 'Tính',
      vidu: VIDU,
      onNoi(alts) {
        let chon = null; let loi = null; let dung = null;
        for (const a of alts) {
          const r = phanTichLoiNoi(a, { ans: ans() });
          if (r.ok) { chon = r; dung = a; break; }
          if (!loi) loi = r;
        }
        if (chon) { if (dung !== vb.input.value) vb.dat(dung); hienKetQua(chon); } else hienLoi(loi, alts[0]);
      },
    });

    function hienLoi(r, nguon) {
      xoa(ketQua); ketQua.hidden = false; ketQua.classList.add('is-err');
      ketQua.append(
        h('div', { class: 'res-label' }, 'Chưa tính được'),
        h('div', { class: 'msg err', role: 'alert' }, r.loi),
        r.moTa ? h('div', { class: 'res-sub' }, 'Đã hiểu một phần: ' + r.moTa) : '',
        h('div', { class: 'res-sub' }, 'Lời nghe được: "' + (nguon || '') + '"'),
        h('div', { class: 'hint' }, 'Thử nói chậm hơn, hoặc sửa chữ trong ô rồi bấm Tính. Ví dụ: "hai triệu rưỡi cộng năm trăm nghìn".'),
      );
    }

    function hienKetQua(r) {
      xoa(ketQua); ketQua.hidden = false; ketQua.classList.remove('is-err');
      const lsMoi = { t: Date.now(), v: r.kind === 'calc' ? r.value : null };
      if (r.kind === 'calc') {
        ketQua.append(
          h('div', { class: 'res-label' }, 'Hiểu là'),
          h('div', { class: 'res-expr', 'data-testid': 'hieu-la' }, r.moTa),
          h('div', { class: 'res-big', 'data-testid': 'ket-qua-so' }, '= ' + dinhDangSo(r.value, 8)),
          h('div', { class: 'res-words', 'data-testid': 'ket-qua-chu' }, 'Bằng chữ: ' + r.bangChu),
        );
        if (r.toanHang.length > 1 || (r.toanHang.length === 1 && r.dungAns)) {
          ketQua.append(h('ul', { class: 'operands' }, r.toanHang.map((x) => h('li', {}, h('span', { class: 'w' }, x.chu), h('span', { class: 'n' }, dinhDangSo(x.so, 8))))));
        }
        if (r.dungAns) ketQua.append(h('div', { class: 'hint' }, 'Phép toán mở đầu nên đã lấy kết quả lần trước làm số đầu.'));
        lsMoi.bt = r.moTa; lsMoi.kq = dinhDangSo(r.value, 8);
        ketQua.append(h('div', { class: 'row-btns' },
          nutBam('Dùng kết quả', () => { bt = soThanhChuoi(r.value); vuaTinh = true; veManHinh(); window.scrollTo({ top: document.querySelector('.keypad').offsetTop - 80, behavior: 'smooth' }); }, 'btn'),
          (() => { const b = nutBam('Chép kết quả', () => saoChep(dinhDangSo(r.value, 8), b), 'btn ghost'); return b; })(),
        ));
      } else {
        ketQua.append(
          h('div', { class: 'res-label' }, 'Quy đổi'),
          h('div', { class: 'res-big', 'data-testid': 'ket-qua-so' }, r.moTa),
          h('div', { class: 'res-words' }, 'Bằng chữ: ' + r.bangChu),
        );
        lsMoi.bt = r.moTa.split(' = ')[0]; lsMoi.kq = r.moTa.split(' = ')[1];
        if (r.macDinhDich) ketQua.append(h('div', { class: 'hint' }, 'Bạn chưa nói đổi sang đơn vị nào nên app chọn đơn vị thường dùng. Nói thêm "sang ..." nếu cần đơn vị khác.'));
        ketQua.append(h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/doi-don-vi' }, 'Mở Đổi đơn vị')));
      }
      (r.ghiChu || []).forEach((g) => ketQua.append(h('div', { class: 'note small' }, g)));
      if (r.boQua && r.boQua.length) ketQua.append(h('div', { class: 'hint' }, 'Từ không hiểu, đã bỏ qua: ' + r.boQua.join(', ')));
      ketQua.append(h('div', { class: 'hint' }, 'Hãy soát lại số và chữ ở trên có đúng điều bạn nói không trước khi dùng.'));
      lichSu.unshift(lsMoi);
      lichSu = lichSu.slice(0, LICH_SU_TOI_DA);
      ghi('lichsu', lichSu);
      veLichSu();
    }

    // ---------- Bàn phím ----------
    const dispExpr = h('div', { class: 'disp-expr', 'data-testid': 'bt' });
    const dispKq = h('div', { class: 'disp-res', 'data-testid': 'kq-phim' }, '0');
    const man = h('div', { class: 'display', 'aria-live': 'polite' }, dispExpr, dispKq);

    function veManHinh() {
      dispExpr.textContent = bt ? hienThiBieuThuc(bt) : '';
      let kq = '';
      if (bt) {
        try { kq = dinhDangSo(tinhChuoi(bt).value, 10); } catch { kq = ''; }
      }
      dispKq.textContent = kq || (bt ? '' : '0');
      dispKq.classList.toggle('dim', !vuaTinh);
    }

    const LA_TOAN_TU = /[+\-−×÷^]$/;
    function bam(k) {
      if (/^\d$/.test(k)) {
        if (vuaTinh) { bt = ''; vuaTinh = false; }
        bt += k;
      } else if (k === '.') {
        if (vuaTinh) { bt = ''; vuaTinh = false; }
        const phanCuoi = bt.split(/[+\-−×÷^()%√²]/).pop();
        if (phanCuoi.includes('.')) return;
        bt += phanCuoi === '' ? '0.' : '.';
      } else if (['+', '−', '×', '÷', '^'].includes(k)) {
        vuaTinh = false;
        if (!bt) { if (k === '−') bt = '−'; else if (ans() !== null) bt = soThanhChuoi(ans()) + k; return veManHinh(); }
        if (LA_TOAN_TU.test(bt)) bt = bt.slice(0, -1) + k; else bt += k;
      } else if (k === '(' || k === ')') {
        if (vuaTinh && k === '(') { bt = ''; vuaTinh = false; }
        bt += k;
      } else if (k === '%' || k === '²') {
        if (bt && !LA_TOAN_TU.test(bt)) { bt += k; vuaTinh = false; }
      } else if (k === '√') {
        if (vuaTinh) { bt = ''; vuaTinh = false; }
        bt += '√';
      } else if (k === 'Ans') {
        if (ans() !== null) { if (vuaTinh) { bt = ''; vuaTinh = false; } bt += soThanhChuoi(ans()); }
      } else if (k === 'del') {
        if (vuaTinh) { bt = ''; vuaTinh = false; } else bt = bt.slice(0, -1);
      } else if (k === 'C') {
        bt = ''; vuaTinh = false;
      } else if (k === '=') {
        if (!bt) return;
        try {
          const r = tinhChuoi(bt);
          const moTa = hienThiBieuThuc(bt);
          lichSu.unshift({ t: Date.now(), bt: moTa, kq: dinhDangSo(r.value, 10), v: r.value });
          lichSu = lichSu.slice(0, LICH_SU_TOI_DA);
          ghi('lichsu', lichSu);
          bt = soThanhChuoi(r.value);
          vuaTinh = true;
          veLichSu();
        } catch (e) {
          dispKq.textContent = e.message;
          dispKq.classList.add('dim');
          return;
        }
      }
      veManHinh();
    }

    const PHIM = [
      ['C', 'C', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['del', '⌫', 'fn'],
      ['√', '√', 'fn'], ['²', 'x²', 'fn'], ['^', 'xʸ', 'fn'], ['÷', '÷', 'op'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['×', '×', 'op'],
      ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−', 'op'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
      ['%', '%', 'fn'], ['0', '0'], ['.', ','], ['=', '=', 'eq'],
    ];
    const luoi = h('div', { class: 'keypad', role: 'group', 'aria-label': 'Bàn phím số' },
      PHIM.map(([k, nhan, loai]) => h('button', {
        type: 'button', class: 'key ' + (loai || ''), 'data-k': k, 'aria-label': k === 'del' ? 'Xóa một ký tự' : k === 'C' ? 'Xóa hết' : undefined, onclick: () => bam(k),
      }, nhan)));
    const hangAns = h('div', { class: 'ans-row' },
      nutBam('Ans: dùng kết quả trước', () => bam('Ans'), 'btn ghost small'),
    );

    // ---------- Lịch sử ----------
    const dsLichSu = h('ul', { class: 'history', 'data-testid': 'lich-su' });
    const khungLichSu = h('section', { class: 'card' },
      h('div', { class: 'card-h' }, h('h2', {}, 'Lịch sử'), nutBam('Xóa', () => { lichSu = []; ghi('lichsu', lichSu); veLichSu(); }, 'btn ghost small')),
      dsLichSu);
    function veLichSu() {
      xoa(dsLichSu);
      khungLichSu.hidden = !lichSu.length;
      lichSu.forEach((it) => {
        dsLichSu.append(h('li', {}, h('button', {
          type: 'button', class: 'hist-b', onclick: () => {
            if (Number.isFinite(it.v)) { bt = soThanhChuoi(it.v); vuaTinh = true; veManHinh(); }
          },
        }, h('span', { class: 'hb' }, it.bt), h('span', { class: 'hk' }, '= ' + it.kq))));
      });
    }

    // Bàn phím vật lý
    function phimVatLy(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (t && t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      const m = { '*': '×', x: '×', '/': '÷', '-': '−', ',': '.', Enter: '=', '=': '=', Backspace: 'del', Escape: 'C', Delete: 'C' };
      const k = m[e.key] || e.key;
      if (/^\d$/.test(k) || ['+', '−', '×', '÷', '.', '(', ')', '%', '^', '=', 'del', 'C'].includes(k)) { e.preventDefault(); if (t && t.blur && t.tagName === 'BUTTON') t.blur(); bam(k); }
    }
    document.addEventListener('keydown', phimVatLy);

    root.append(
      h('h1', { class: 'sr-only' }, 'Máy tính'),
      vb.el, ketQua,
      h('section', { class: 'card calc' }, man, luoi, hangAns),
      khungLichSu,
    );
    veManHinh(); veLichSu();
    return () => { document.removeEventListener('keydown', phimVatLy); vb.dung(); };
  },
};
