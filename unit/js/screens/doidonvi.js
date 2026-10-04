// Đổi đơn vị kiểu Việt Nam: chỉ/cây/lượng vàng, sào/công/ha, độ C/F, kg/lb, km/dặm, lít/gallon.
import { h, xoa, oSo, chon, nutBam, tabs } from '../ui/dom.js';
import { taoVoiceBox } from '../ui/voicebox.js';
import { NHOM, donViCuaNhom, layDonVi, doi, ghiChuCap } from '../lib/units.js';
import { phanTichLoiNoi } from '../lib/voice.js';
import { dinhDangSo, dinhDangGon, docSo } from '../lib/text.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg>';
const VIDU = ['ba chỉ vàng bằng bao nhiêu gram', 'một lượng vàng bằng bao nhiêu chỉ', 'năm sào bắc bộ bằng bao nhiêu mét vuông', 'ba mươi lăm độ C sang độ F'];

// Giá trị gợi ý ban đầu cho từng nhóm
const MAC_DINH = {
  khoiluong: ['chi', 'g', 1], dientich: ['sao_bb', 'm2', 1], dodai: ['km', 'dam', 1], nhietdo: ['c', 'f', 30], thetich: ['l', 'gal', 1], tocdo: ['kmh', 'mph', 60],
};

let choDat = null; // kết quả nói cần áp dụng sau khi chuyển sang nhóm khác

export default {
  id: 'doi-don-vi',
  ten: 'Đổi đơn vị',
  mota: 'Chỉ, cây, lượng vàng; sào, công, héc-ta; độ C/F; kg/lb; dặm; gallon',
  tuKhoa: 'doi don vi chi vang cay luong gram sao cong hecta met vuong do c f kg lb dam gallon lit quy doi',
  icon: ICON,
  tabs: NHOM.map((n) => ({ id: n.id, ten: n.ten })),
  moTaTab: { khoiluong: 'chi vang cay luong gram kg tan ta yen pound ounce', dientich: 'sao cong mau hecta ha met vuong acre dat', dodai: 'km met dam mile inch feet hai ly cay so', nhietdo: 'do c do f kelvin nhiet do', thetich: 'lit gallon ml met khoi', tocdo: 'km/h m/s mph knot toc do' },
  render(root, tab, nav) {
    const nhom = NHOM.find((n) => n.id === tab) || NHOM[0];
    const ds = donViCuaNhom(nhom.id);
    const mac = MAC_DINH[nhom.id];

    const kq = h('div', { class: 'card result', 'data-testid': 'dv-ketqua' });
    const bangNhanh = h('div', { class: 'card' });
    const ghiChu = h('div', { class: 'notes' });

    const gt = oSo({ nhan: 'Số lượng', macDinh: mac[2], onDoi: tinhLai });
    const opts = ds.map((u) => ({ v: u.id, t: `${u.ten} (${u.kh})` }));
    const tu = chon({ nhan: 'Từ', tuyChon: opts, gia: mac[0], onDoi: tinhLai });
    const den = chon({ nhan: 'Sang', tuyChon: opts, gia: mac[1], onDoi: tinhLai });
    const dao = h('button', {
      type: 'button', class: 'swap', 'aria-label': 'Đảo hai đơn vị', onclick: () => {
        const a = tu.sel.value; tu.sel.value = den.sel.value; den.sel.value = a; tinhLai();
      },
    }, '⇅');

    function tinhLai() {
      const v = gt.lay();
      xoa(kq); xoa(bangNhanh); xoa(ghiChu);
      if (!Number.isFinite(v)) { kq.append(h('div', { class: 'hint' }, 'Nhập số lượng để đổi.')); bangNhanh.hidden = true; return; }
      const a = tu.sel.value; const b = den.sel.value;
      const r = doi(v, a, b);
      const ua = layDonVi(a); const ub = layDonVi(b);
      kq.append(
        h('div', { class: 'res-expr' }, `${dinhDangSo(v, 8)} ${ua.kh}`),
        h('div', { class: 'res-big', 'data-testid': 'dv-so' }, `= ${dinhDangGon(r)} ${ub.kh}`),
        h('div', { class: 'res-words' }, Number.isFinite(r) && Math.abs(r) < 1e15 ? 'Bằng chữ: ' + docSo(Number(r.toPrecision(10))) + ' ' + ub.ten : ''),
      );
      ghiChuCap(a, b).forEach((g) => ghiChu.append(h('div', { class: 'note small' }, g)));
      // bảng nhanh: sang mọi đơn vị cùng nhóm
      bangNhanh.hidden = false;
      bangNhanh.append(h('h2', {}, `${dinhDangSo(v, 8)} ${ua.kh} bằng`));
      const ul = h('ul', { class: 'list' });
      ds.filter((u) => u.id !== a).forEach((u) => {
        ul.append(h('li', { class: u.id === b ? 'on' : '' }, h('span', {}, u.ten), h('b', {}, `${dinhDangGon(doi(v, a, u.id))} ${u.kh}`)));
      });
      bangNhanh.append(ul);
    }

    function apDungNoi() {
      const c = choDat; choDat = null;
      if (!c) return;
      tu.sel.value = c.tu; den.sel.value = c.den; gt.dat(c.gt); tinhLai();
      vb.dat(c.nguon);
      thongBaoNoi.hidden = false; xoa(thongBaoNoi);
      thongBaoNoi.className = 'note small';
      thongBaoNoi.append(`Đã hiểu: ${c.moTa}.` + (c.macDinhDich ? ' Bạn chưa nói đơn vị đích nên app chọn đơn vị thường dùng.' : ''));
      (c.ghiChu || []).filter((g) => /Bắc Bộ|Trung Bộ|1\.296|Nói "/.test(g)).forEach((g) => thongBaoNoi.append(h('div', {}, g)));
    }

    // Nói / gõ
    const thongBaoNoi = h('div', { class: 'note small', hidden: true, role: 'status' });
    const vb = taoVoiceBox({
      placeholder: 'Nói hoặc gõ: ba chỉ vàng bằng bao nhiêu gram',
      nutText: 'Đổi',
      vidu: VIDU,
      onNoi(alts) {
        let chonKq = null; let loi = null; let dung = null;
        for (const a of alts) {
          const r = phanTichLoiNoi(a);
          if (r.ok && r.kind === 'unit') { chonKq = r; dung = a; break; }
          if (!loi) loi = r;
        }
        thongBaoNoi.hidden = false; xoa(thongBaoNoi);
        if (!chonKq) {
          thongBaoNoi.className = 'msg err';
          thongBaoNoi.append(loi && loi.ok ? 'Đây là phép tính chứ không phải đổi đơn vị. ' : (loi && loi.loi ? loi.loi + ' ' : 'Chưa hiểu. '), loi && loi.ok ? h('a', { href: '#/may-tinh' }, 'Mở Máy tính') : 'Thử nói: "ba chỉ vàng bằng bao nhiêu gram".');
          return;
        }
        if (dung !== vb.input.value) vb.dat(dung);
        choDat = { ...chonKq, nguon: dung };
        if (layDonVi(chonKq.tu).nhom !== nhom.id) nav(layDonVi(chonKq.tu).nhom); else apDungNoi();
      },
    });

    root.append(
      h('h1', { class: 'sr-only' }, 'Đổi đơn vị'),
      vb.el, thongBaoNoi,
      tabs(NHOM.map((n) => ({ id: n.id, ten: n.ten })), nhom.id, (id) => nav(id)),
      h('section', { class: 'card' },
        gt.el,
        h('div', { class: 'pair' }, tu.el, dao, den.el),
      ),
      kq, ghiChu, bangNhanh,
    );
    tinhLai();
    if (choDat && layDonVi(choDat.tu).nhom === nhom.id) apDungNoi();
  },
};
