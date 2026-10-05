// Sổ lễ: danh sách khoản mừng, sổ nợ lễ, thống kê, biểu mẫu ghi khoản.
import { h, tabLink, phanDoan, chon, truong, oTien, tien, thongBao, hoi, trong, tai, lamLai, svg } from '../ui/dom.js';
import { IC } from '../ui/icons.js';
import { nhapNhanh, datTamLe, layTamLe } from '../ui/nhapnhanh.js';
import { bieuDoNam, bieuDoSuKien } from '../ui/bieudo.js';
import { layDs, layMot, luu, xoa, layCaiDat } from '../lib/kho.js';
import { SU_KIEN, tenSuKien, dapLeMacDinh, tinhNoLe, goiYDapLe, thongKe, sangCsv, canDapLe, nhanChieu, dongTuLe, thongKeTheoNhom } from '../lib/le.js';
import { homNayIso, ngayVn } from '../lib/ngay.js';
import { khoaTim } from '../lib/text.js';
import { dong, docOTienNoi, tienGon } from '../lib/tien.js';
import { timKhoanLe } from '../lib/tim.js';
import { tenCuaKhoan, nguoiTheoId, goiNguoi } from '../lib/chung.js';

const loc = { huong: 'tat', nam: 'tat', q: '' };
const idMuc = (id) => `muc-${String(id).replace(/[^\w-]/g, '')}`;

export default function ve(root, ctx) {
  const [muc, id] = ctx.seg;
  if (muc === 'moi') return form(root, ctx, null);
  if (muc === 'sua') {
    const k = layMot('entries', id);
    if (!k) { root.append(trong('Không tìm thấy khoản này', 'Có thể bạn đã xóa nó.', h('a', { class: 'btn primary', href: '#/le' }, 'Về Sổ lễ'))); return; }
    return form(root, ctx, k);
  }
  const tab = muc === 'no' ? 'no' : muc === 'thong-ke' ? 'tk' : 'ds';
  root.append(tabLink([{ id: 'ds', ten: 'Khoản lễ', href: '#/le' }, { id: 'no', ten: 'Nợ lễ', href: '#/le/no' }, { id: 'tk', ten: 'Thống kê', href: '#/le/thong-ke' }], tab, 'Các phần của Sổ lễ'));
  if (tab === 'no') return veNo(root);
  if (tab === 'tk') return veThongKe(root);
  return veDs(root);
}

// ---------- Danh sách ----------
function veDs(root) {
  const nn = nhapNhanh({ khiXong: (kq) => { datTamLe(kq); location.hash = '#/le/moi?nhap=1'; } });
  root.append(nn.el);
  root.append(h('a', { class: 'btn primary block', href: '#/le/moi', 'data-testid': 'them-khoan' }, 'Ghi khoản lễ'));

  const tatCa = layDs('entries');
  if (!tatCa.length) {
    root.append(trong('Sổ lễ còn trống', 'Ghi phong bì đã đi và đã nhận để biết ai còn nợ lễ. Có thể gõ hoặc nói một câu ở ô phía trên.'));
    return;
  }
  const nam = [...new Set(tatCa.map((e) => e.ngay.slice(0, 4)))].sort().reverse();
  const bo = h('div', { class: 'stack' });
  const ketQua = h('div', { class: 'stack' });
  const tim = h('input', { type: 'search', placeholder: 'Tìm theo tên, sự kiện, quà…', 'aria-label': 'Tìm trong sổ lễ', value: loc.q, 'data-testid': 'tim-le' });
  const selNam = chon([{ v: 'tat', t: 'Mọi năm' }, ...nam.map((n) => ({ v: n, t: `Năm ${n}` }))], loc.nam, { 'aria-label': 'Lọc theo năm' });
  bo.append(tim, h('div', { class: 'grid2' }, selNam,
    chon([{ v: 'tat', t: 'Cả đi và nhận' }, { v: 'di', t: 'Mình đã đi (mừng, phúng, tặng)' }, { v: 'den', t: 'Mình đã nhận' }], loc.huong, { 'aria-label': 'Lọc theo chiều', onchange: (e) => { loc.huong = e.target.value; ve2(); } })));
  selNam.addEventListener('change', () => { loc.nam = selNam.value; ve2(); });
  tim.addEventListener('input', () => { loc.q = tim.value; ve2(); });
  root.append(bo, ketQua);

  function ve2() {
    ketQua.replaceChildren();
    let ds = tatCa;
    if (loc.nam !== 'tat') ds = ds.filter((e) => e.ngay.startsWith(loc.nam));
    if (loc.huong !== 'tat') ds = ds.filter((e) => e.huong === loc.huong);
    ds = timKhoanLe(ds, layDs('people'), loc.q).slice().sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
    const g = thongKeTheoNhom(ds);
    const dong3 = [['hy', 'Việc vui (cưới, hỏi, tân gia…)'], ['hieu', 'Tang lễ, giỗ (phúng viếng)'], ['khac', 'Sinh nhật, lễ Tết, quà khác']].filter(([k]) => g[k].di || g[k].den);
    ketQua.append(h('div', { class: 'card' }, h('dl', { class: 'kv', 'data-testid': 'tong' },
      dong3.flatMap(([k, ten]) => [h('dt', {}, ten), h('dd', {}, h('span', { class: 'di' }, `đi ${tien(g[k].di)}`), ' · ', h('span', { class: 'den' }, `nhận ${tien(g[k].den)}`))]))));
    if (!ds.length) { ketQua.append(trong('Không có khoản nào khớp', 'Thử bỏ bớt bộ lọc hoặc gõ từ khác.')); return; }
    ketQua.append(h('ul', { class: 'list', 'data-testid': 'ds-khoan' }, ds.map((e) => h('li', {},
      h('a', { class: 'item', href: `#/le/sua/${encodeURIComponent(e.id)}`, 'data-testid': 'khoan' },
        h('div', { class: 'item-main' },
          h('div', { class: 'item-t' }, tenCuaKhoan(e)),
          h('div', { class: 'item-s' }, `${tenSuKien(e.suKien)} · ${ngayVn(e.ngay)}${e.qua ? ` · ${e.qua}` : ''}`)),
        h('div', { class: `item-r ${e.huong}` }, e.soTien ? tien(e.soTien) : 'Quà', h('small', {}, nhanChieu(e.huong, e.suKien))))))));
    ketQua.append(h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn sm', 'data-testid': 'xuat-csv', onclick: async () => {
        let an = false;
        if (layCaiDat().anTien) { const v = await hoi({ tieuDe: 'Đang bật Ẩn số tiền', noiDung: 'Tệp CSV có thể ghi số tiền thật hoặc ẩn bằng dấu sao.', xacNhan: 'Ghi số tiền thật', phu: 'Ẩn số tiền trong tệp', huy: 'Hủy' }); if (!v) return; an = v === 'phu'; }
        tai(`so-le-9gift-${homNayIso()}.csv`, sangCsv(ds, Object.fromEntries(layDs('people').map((p) => [p.id, p.ten])), { anTien: an }), 'text/csv;charset=utf-8'); thongBao('Đã tạo tệp CSV trong thư mục tải về.');
      } }, 'Xuất CSV'),
      h('button', { type: 'button', class: 'btn sm', 'data-testid': 'in-so', onclick: () => inSo(ds) }, 'In hoặc lưu PDF')));
  }
  ve2();
}

function inSo(ds) {
  const bang = h('section', { id: 'in-an', class: 'in-an' },
    h('h1', {}, 'Sổ lễ 9gift'), h('p', {}, `In ngày ${ngayVn(homNayIso())}. Dữ liệu từ máy của bạn.`),
    h('table', {}, h('thead', {}, h('tr', {}, ['Ngày', 'Chiều', 'Người', 'Sự kiện', 'Số tiền', 'Quà, ghi chú'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ds.slice().sort((a, b) => (a.ngay < b.ngay ? -1 : 1)).map((e) => h('tr', {}, h('td', {}, ngayVn(e.ngay)), h('td', {}, e.huong === 'di' ? 'Đã đi' : 'Đã nhận'), h('td', {}, tenCuaKhoan(e)), h('td', {}, tenSuKien(e.suKien)), h('td', { class: 'so' }, layCaiDat().anTien ? '***' : dong(e.soTien)), h('td', {}, [e.qua, e.ghiChu].filter(Boolean).join('; ')))))));
  document.body.append(bang);
  const don = () => { bang.remove(); window.removeEventListener('afterprint', don); };
  window.addEventListener('afterprint', don);
  setTimeout(() => { try { window.print(); } finally { if (!('onafterprint' in window)) don(); } }, 50);
}

// ---------- Nợ lễ ----------
function veNo(root) {
  const no = tinhNoLe(layDs('entries'));
  root.append(h('div', { class: 'note info' }, 'Gợi ý mức đáp lễ chỉ để tham khảo, là phép tính đơn giản (bằng số họ đã gửi, hoặc làm tròn lên 100 nghìn). Không có mức “đúng”: tùy quan hệ, hoàn cảnh và từng vùng. Bạn nhập mức khác nếu muốn.'));
  root.append(h('p', { class: 'hint', 'data-testid': 'ghep-theo-so-khoan' }, 'Cách tính nợ: ghép theo số khoản, không theo số tiền. Một khoản đi được coi là đáp lại một khoản nhận của cùng người (cùng nhóm: việc vui với việc vui, tang lễ với tang lễ), dù số tiền khác nhau. Nếu không muốn tính một khoản, bấm “Không cần đáp”.'));
  const hangDap = (e) => {
    const gy = goiYDapLe(e.soTien);
    const o = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ví dụ: 1.000.000',  'data-testid': 'muc-dap' });
    return h('li', { 'data-testid': 'no-dap' },
      h('div', { class: 'item' },
        h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, tenCuaKhoan(e)), h('div', { class: 'item-s' }, `${tenSuKien(e.suKien)} · ${ngayVn(e.ngay)}${e.qua ? ` · ${e.qua}` : ''}`)),
        h('div', { class: 'item-r den' }, e.soTien ? tien(e.soTien) : 'Quà', h('small', {}, nhanChieu('den', e.suKien).toLowerCase()))),
      h('div', { class: 'pad-no' },
        e.soTien ? h('p', { class: 'hint mb8' }, `Tham khảo: bằng số họ đã gửi (${tien(gy.bangSoNhan)})${gy.lamTron !== gy.bangSoNhan ? `, hoặc làm tròn ${tien(gy.lamTron)}` : ''}. Chỉ là gợi ý.`) : h('p', { class: 'hint mb8' }, 'Khoản này là quà, chưa có số tiền để tham khảo.'),
        h('label', { class: 'lbl', for: (o.id = idMuc(e.id)) }, 'Mức bạn định đáp (để trống là dùng số tham khảo)'), o),
      h('div', { class: 'item-act' },
        h('button', { type: 'button', class: 'btn sm primary', 'data-testid': 'ghi-da-dap', onclick: () => {
          const r = docOTienNoi(o.value);
          const muc = Number.isFinite(r.v) && r.v > 0 ? r.v : gy.bangSoNhan;
          const qs = new URLSearchParams({ huong: 'di', sk: e.suKien, tien: String(muc) });
          if (e.personId) qs.set('p', e.personId); else qs.set('ten', e.tenNguoi || '');
          location.hash = `#/le/moi?${qs}`;
        } }, 'Ghi đã đáp lễ'),
        boQua(e, 'Không cần đáp')));
  };
  const hangNhan = (e) => h('li', { 'data-testid': 'no-nhan' },
    h('div', { class: 'item' },
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, tenCuaKhoan(e)), h('div', { class: 'item-s' }, `${tenSuKien(e.suKien)} · ${ngayVn(e.ngay)}${e.qua ? ` · ${e.qua}` : ''}`)),
      h('div', { class: 'item-r di' }, e.soTien ? tien(e.soTien) : 'Quà', h('small', {}, nhanChieu('di', e.suKien).toLowerCase()))),
    h('div', { class: 'item-act' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => {
        const qs = new URLSearchParams({ huong: 'den', sk: e.suKien });
        if (e.personId) qs.set('p', e.personId); else qs.set('ten', e.tenNguoi || '');
        location.hash = `#/le/moi?${qs}`;
      } }, 'Họ đã đáp lại'),
      boQua(e, 'Bỏ qua')));
  function boQua(e, nhan) {
    return h('button', { type: 'button', class: 'btn sm ghost', onclick: () => {
      const cu = layMot('entries', e.id);
      luu('entries', { ...cu, khongDap: true });
      thongBao('Đã bỏ khoản này khỏi sổ nợ lễ.', { hoanTac: () => { luu('entries', cu); lamLai(); } });
      lamLai();
    } }, nhan);
  }
  root.append(h('section', { class: 'stack' }, h('h2', {}, `Họ đã mừng hoặc phúng viếng bạn, bạn chưa đáp lễ (${no.chuaDap.length})`),
    no.chuaDap.length ? h('ul', { class: 'list', 'data-testid': 'ds-chua-dap' }, no.chuaDap.map(hangDap)) : trong('Không còn khoản nào', 'Mọi khoản người khác đã gửi bạn đều đã được đáp lại hoặc bị bỏ qua.')));
  root.append(h('section', { class: 'stack' }, h('h2', {}, `Bạn đã mừng hoặc phúng viếng, họ chưa đáp lại (${no.chuaNhan.length})`),
    no.chuaNhan.length ? h('ul', { class: 'list', 'data-testid': 'ds-chua-nhan' }, no.chuaNhan.map(hangNhan)) : trong('Không có khoản nào', 'Chưa có khoản bạn đã gửi mà đang chờ họ đáp lại.')));
  root.append(h('p', { class: 'hint' }, 'Sinh nhật, lì xì, lễ Tết mặc định không tính nợ lễ. Bạn đổi được ở từng khoản, ô “Tính vào sổ nợ lễ”.'));
}

// ---------- Thống kê ----------
function veThongKe(root) {
  const tatCa = layDs('entries');
  if (!tatCa.length) { root.append(trong('Chưa có số liệu', 'Ghi vài khoản lễ để xem tổng chi theo năm và theo loại sự kiện.', h('a', { class: 'btn primary', href: '#/le/moi' }, 'Ghi khoản lễ'))); return; }
  const tk = thongKe(tatCa);
  const nam = tk.theoNam.map((x) => String(x.nam));
  const sel = chon([{ v: 'tat', t: 'Mọi năm' }, ...nam.slice().reverse().map((n) => ({ v: n, t: `Năm ${n}` }))], loc.nam, { 'aria-label': 'Năm cho biểu đồ theo loại sự kiện' });
  const theoSk = h('div', { class: 'stack' });
  const bang = h('div', { class: 'table-wrap' });
  function veSk() {
    theoSk.replaceChildren();
    const ds = loc.nam === 'tat' ? tatCa : tatCa.filter((e) => e.ngay.startsWith(loc.nam));
    const t = thongKe(ds);
    theoSk.append(bieuDoSuKien(t.theoSuKien));
    bang.replaceChildren(h('table', { class: 'bang' }, h('thead', {}, h('tr', {}, ['Loại', 'Đã chi', 'Đã nhận', 'Lần'].map((x) => h('th', {}, x)))),
      h('tbody', {}, t.theoSuKien.map((x) => h('tr', {}, h('td', {}, tenSuKien(x.suKien)), h('td', {}, tien(x.di)), h('td', {}, tien(x.den)), h('td', {}, String(x.soLan)))))));
  }
  sel.addEventListener('change', () => { loc.nam = sel.value; veSk(); });
  root.append(h('div', { class: 'card' }, h('dl', { class: 'kv', 'data-testid': 'tk-tong' },
    h('dt', {}, 'Tổng đã chi'), h('dd', { class: 'di' }, tien(tk.tongDi)), h('dt', {}, 'Tổng đã nhận'), h('dd', { class: 'den' }, tien(tk.tongDen)), h('dt', {}, 'Chênh lệch (nhận trừ chi)'), h('dd', {}, tien(tk.tongDen - tk.tongDi)))));
  root.append(h('section', { class: 'card', 'aria-labelledby': 'bd-nam' },
    h('h2', { id: 'bd-nam' }, 'Theo năm'),
    h('div', { class: 'legend' }, h('span', { class: 'l-di' }, h('i'), 'Đã chi'), h('span', { class: 'l-den' }, h('i'), 'Đã nhận')),
    bieuDoNam(tk.theoNam),
    h('details', {}, h('summary', {}, 'Xem bảng số liệu'), h('div', { class: 'table-wrap' }, h('table', { class: 'bang' }, h('thead', {}, h('tr', {}, ['Năm', 'Đã chi', 'Đã nhận'].map((x) => h('th', {}, x)))), h('tbody', {}, tk.theoNam.map((x) => h('tr', {}, h('td', {}, String(x.nam)), h('td', {}, tien(x.di)), h('td', {}, tien(x.den)))))))),
    h('p', { class: 'hint' }, 'Hiển thị tối đa 6 năm gần nhất.')));
  root.append(h('section', { class: 'card', 'aria-labelledby': 'bd-sk' }, h('h2', { id: 'bd-sk' }, 'Theo loại sự kiện'),
    h('div', { class: 'field' }, h('label', { for: (sel.id = 'sel-nam-sk') }, 'Năm'), sel),
    h('div', { class: 'legend' }, h('span', { class: 'l-di' }, h('i'), 'Đã chi'), h('span', { class: 'l-den' }, h('i'), 'Đã nhận')),
    theoSk, h('details', {}, h('summary', {}, 'Xem bảng số liệu'), bang)));
  veSk();
}

// ---------- Biểu mẫu ----------
function form(root, ctx, khoan) {
  ctx.datTieuDe(khoan ? 'Sửa khoản lễ' : 'Ghi khoản lễ');
  const q = ctx.q;
  const tam = q.get('nhap') ? layTamLe() : null;
  const danhBa = layDs('people');
  let huong = khoan ? khoan.huong : (q.get('huong') || (tam && tam.huong) || 'di');
  let suKien = khoan ? khoan.suKien : (q.get('sk') || (tam && tam.suKien) || 'cuoi');
  let khongDap = khoan ? khoan.khongDap : undefined;

  const pId0 = khoan ? khoan.personId : (q.get('p') || (tam && tam.personId) || null);
  const nguoi0 = pId0 ? nguoiTheoId(pId0) : null;
  const tenBanDau = nguoi0 ? nguoi0.ten : (khoan ? khoan.tenNguoi : (q.get('ten') || (tam && tam.tenNguoi) || ''));

  const dsId = 'ds-nguoi';
  const dl = h('datalist', { id: dsId }, danhBa.flatMap((p) => [h('option', { value: p.ten }), p.cachGoi && p.cachGoi !== p.ten ? h('option', { value: p.cachGoi }) : null]));
  const oNguoi = h('input', { type: 'text', id: 'f-nguoi', list: dsId, value: tenBanDau, autocomplete: 'off', placeholder: 'Gõ tên hoặc chọn trong danh bạ', 'data-testid': 'f-nguoi' });
  const ngay = h('input', { type: 'date', id: 'f-ngay', value: khoan ? khoan.ngay : ((tam && tam.ngay) || homNayIso()), max: '2100-12-31', min: '1990-01-01', 'data-testid': 'f-ngay' });
  const selSk = chon([
    { nhom: 'Việc vui', ds: SU_KIEN.filter((s) => s.nhom === 'hy').map((s) => ({ v: s.id, t: s.ten })) },
    { nhom: 'Hiếu', ds: SU_KIEN.filter((s) => s.nhom === 'hieu').map((s) => ({ v: s.id, t: s.ten })) },
    { nhom: 'Dịp khác', ds: SU_KIEN.filter((s) => s.nhom === 'khac').map((s) => ({ v: s.id, t: s.ten })) },
  ], suKien, { id: 'f-sk', 'data-testid': 'f-sk' });
  const soTien = oTien({ nhan: 'Số tiền', gia: khoan ? khoan.soTien : (q.get('tien') ? Number(q.get('tien')) : (tam && tam.soTien) || null) });
  soTien.input.setAttribute('data-testid', 'f-tien');
  const oQua = h('input', { type: 'text', id: 'f-qua', value: khoan ? khoan.qua : '', placeholder: 'Ví dụ: hộp trà, lẵng hoa (nếu có)', maxlength: 200 });
  const oGhiChu = h('textarea', { id: 'f-ghichu', maxlength: 600, placeholder: 'Ví dụ: đi cùng ai, mừng theo mâm, nhờ người đưa hộ…' }, khoan ? khoan.ghiChu : '');
  const luuDb = h('input', { type: 'checkbox', id: 'f-luu-db', checked: true });
  const luuDbBox = h('label', { class: 'check', for: 'f-luu-db', hidden: true }, luuDb, 'Lưu người này vào danh bạ');
  const dap = h('input', { type: 'checkbox', id: 'f-dap', checked: khongDap === undefined ? dapLeMacDinh(suKien) : khongDap !== true });
  const loi = h('div', { class: 'err', role: 'alert', hidden: true, 'data-testid': 'f-loi' });
  const goiY = h('div', { class: 'stack', 'data-testid': 'f-goiy' });
  const phanHuong = phanDoan([{ id: 'di', ten: 'Mình đã đi' }, { id: 'den', ten: 'Mình nhận' }], huong, (v) => { huong = v; capNhat(); }, 'Chiều khoản lễ');

  let chonId = pId0 || null;
  function ungVien() {
    const k = khoaTim(oNguoi.value);
    if (!k) return [];
    return danhBa.filter((p) => khoaTim(p.ten) === k || (p.cachGoi && khoaTim(p.cachGoi) === k));
  }
  function timNguoiNhap() {
    const u = ungVien();
    if (!u.length) return null;
    if (u.length > 1) return u.find((p) => p.id === chonId) || null;
    return u[0];
  }
  /** Gõ "Hùng" mà danh bạ có "anh Hùng" hoặc "Nguyễn Văn Hùng": gợi ý đúng người, tránh tạo bản trùng. */
  function ganDung() {
    const k = khoaTim(oNguoi.value);
    if (k.length < 2) return [];
    const ket = (t) => t && (' ' + khoaTim(t)).endsWith(' ' + k);
    return danhBa.filter((p) => ket(p.ten) || ket(p.cachGoi));
  }
  let datTayDap = khoan ? khongDap !== undefined : false;
  function capNhat() {
    const p = timNguoiNhap();
    luuDbBox.hidden = !!p || !oNguoi.value.trim();
    if (!ungVien().some((x) => x.id === chonId)) chonId = null;
    if (!datTayDap) dap.checked = dapLeMacDinh(selSk.value);
    // gợi ý theo lịch sử
    goiY.replaceChildren();
    const khoaTen = khoaTim(oNguoi.value);
    if (!khoaTen) return;
    const u = ungVien();
    if (u.length > 1) {
      goiY.append(h('div', { class: 'note', role: 'alert', 'data-testid': 'trung-ten' }, h('p', {}, `Có ${u.length} người trùng tên trong danh bạ. Hãy chọn đúng người:`),
        h('div', { class: 'row-actions mt8' }, u.map((x) => h('button', { type: 'button', class: 'btn sm', 'aria-pressed': x.id === chonId ? 'true' : 'false', onclick: () => { chonId = x.id; capNhat(); } }, `${x.ten}${x.nhom ? ` (${x.nhom})` : ''}${x.id === chonId ? ' ✓' : ''}`)))));
    } else if (!u.length) {
      const g = ganDung().slice(0, 3);
      if (g.length) goiY.append(h('div', { class: 'note info', 'data-testid': 'goi-y-gop-ten' }, h('p', {}, 'Có phải bạn muốn chọn một người đã có trong danh bạ?'),
        h('div', { class: 'row-actions mt8' }, g.map((x) => h('button', { type: 'button', class: 'btn sm', onclick: () => { oNguoi.value = x.ten; chonId = x.id; capNhat(); } }, `${x.ten}${x.cachGoi ? ` (${x.cachGoi})` : ''}`)))));
    }
    const cung = (e) => (p ? e.personId === p.id : (!e.personId && khoaTim(e.tenNguoi) === khoaTen));
    const ls = layDs('entries').filter((e) => cung(e) && (!khoan || e.id !== khoan.id)).sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
    if (huong === 'di') {
      const no = tinhNoLe(layDs('entries').filter((e) => !khoan || e.id !== khoan.id)).chuaDap.filter(cung);
      for (const e of no.slice(0, 2)) {
        goiY.append(h('div', { class: 'note info', 'data-testid': 'goi-y-dap-le' },
          h('p', {}, `${p ? goiNguoi(p) : oNguoi.value} đã ${dongTuLe(e.suKien)} bạn ${e.soTien ? tien(e.soTien) : 'một món quà'} (${tenSuKien(e.suKien)}, ${ngayVn(e.ngay)}) mà bạn chưa đáp. Mức tham khảo: bằng số đó, tùy bạn quyết.`),
          e.soTien ? h('button', { type: 'button', class: 'btn sm mt8', onclick: () => soTien.dat(e.soTien) }, `Dùng ${tien(e.soTien)}`) : null));
      }
    }
    if (ls.length) {
      goiY.append(h('details', {}, h('summary', {}, `Lịch sử với người này (${ls.length})`),
        h('ul', { class: 'list' }, ls.slice(0, 6).map((e) => h('li', {}, h('div', { class: 'item' }, h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, `${e.huong === 'di' ? `Bạn ${dongTuLe(e.suKien)}` : 'Bạn nhận'} ${e.soTien ? tien(e.soTien) : (e.qua || 'quà')}`), h('div', { class: 'item-s' }, `${tenSuKien(e.suKien)} · ${ngayVn(e.ngay)}`))))))));
    }
  }
  oNguoi.addEventListener('input', capNhat); oNguoi.addEventListener('change', capNhat);
  selSk.addEventListener('change', capNhat);
  dap.addEventListener('change', () => { datTayDap = true; });

  if (tam) {
    const dau = [];
    if (tam.canSoat.includes('phu-dinh')) dau.push('câu có từ phủ định (không, chưa… mừng), hãy kiểm tra chiều và số tiền');
    if (tam.canSoat.includes('khong-co-tien')) dau.push('chưa thấy số tiền');
    if (tam.canSoat.includes('ngam-nghin')) dau.push('số tiền được hiểu theo nghìn đồng');
    if (tam.canSoat.includes('khong-co-nguoi')) dau.push('chưa thấy tên người');
    if (tam.canSoat.includes('khong-co-su-kien')) dau.push('chưa rõ sự kiện');
    if (tam.canSoat.includes('nhieu-nguoi')) dau.push('có nhiều người trùng tên');
    root.append(h('div', { class: 'note', 'data-testid': 'ket-qua-soat' }, h('strong', {}, 'Kết quả để soát. '), 'Máy đã hiểu câu của bạn như bên dưới, chưa lưu gì cả. ', dau.length ? `Cần xem lại: ${dau.join(', ')}.` : 'Hãy kiểm tra số tiền và tên rồi bấm Lưu.'));
    if (!tam.soTien) soTien.input.classList.add('filled');
    else if (tam.ngamNghin) soTien.input.classList.add('filled');
    if (!tenBanDau) oNguoi.classList.add('filled');
  }

  const luuKhoan = async () => {
    loi.hidden = true;
    const ten = oNguoi.value.trim();
    const v = soTien.lay();
    const qua = oQua.value.trim();
    if (!ten) { hienLoi('Hãy nhập tên người. Ví dụ: anh Hùng.', oNguoi); return; }
    if (ungVien().length > 1 && !timNguoiNhap()) { hienLoi('Có nhiều người trùng tên, hãy chọn đúng người ở phần gợi ý bên dưới ô tên.', oNguoi); return; }
    if (!ngay.value) { hienLoi('Hãy chọn ngày.', ngay); return; }
    if ((!Number.isFinite(v) || v <= 0) && !qua) { hienLoi('Hãy nhập số tiền, hoặc ghi món quà nếu không mừng bằng tiền.', soTien.input); return; }
    if (v > 1e11) { hienLoi('Số tiền quá lớn, hãy kiểm tra lại số 0.', soTien.input); return; }
    let p = timNguoiNhap();
    if (!p && luuDb.checked && !luuDbBox.hidden) {
      p = luu('people', { ten, cachGoi: '', quanHe: 'khac', nhom: '', sinh: null, ghiChu: '', sdt: '', nhacTruoc: null });
    }
    const ban = {
      ...(khoan || {}), huong, ngay: ngay.value, personId: p ? p.id : null, tenNguoi: p ? '' : ten, suKien: selSk.value,
      soTien: Number.isFinite(v) && v > 0 ? Math.round(v) : 0, qua, ghiChu: oGhiChu.value.trim(),
      khongDap: dap.checked === dapLeMacDinh(selSk.value) ? undefined : !dap.checked,
    };
    const da = luu('entries', ban);
    thongBao('Đã lưu khoản lễ.', { hoanTac: khoan ? () => { luu('entries', khoan); lamLai(); } : () => { xoa('entries', da.id); lamLai(); } });
    location.hash = '#/le';
  };
  function hienLoi(m, el) { loi.textContent = m; loi.hidden = false; el && el.focus(); el && el.classList.add('dang-sai'); setTimeout(() => el && el.classList.remove('dang-sai'), 2500); }

  root.append(h('h1', {}, khoan ? 'Sửa khoản lễ' : 'Ghi khoản lễ'));
  root.append(h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); luuKhoan(); }, novalidate: true },
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Chiều'), phanHuong),
    truong('Ngày', ngay),
    h('div', { class: 'field' }, h('label', { for: 'f-nguoi' }, 'Người'), oNguoi, dl, luuDbBox),
    goiY,
    truong('Sự kiện', selSk),
    soTien.el,
    truong('Quà (nếu có)', oQua),
    truong('Ghi chú', oGhiChu),
    h('label', { class: 'check', for: 'f-dap' }, dap, 'Tính vào sổ nợ lễ (cần đáp lại)'),
    loi,
    h('div', { class: 'row-actions' },
      h('button', { type: 'submit', class: 'btn primary', 'data-testid': 'f-luu' }, 'Lưu'),
      h('a', { class: 'btn ghost', href: '#/le' }, 'Hủy'),
      khoan ? h('button', { type: 'button', class: 'btn danger', 'data-testid': 'f-xoa', onclick: async () => {
        const ok = await hoi({ tieuDe: 'Xóa khoản lễ này?', noiDung: 'Bạn có thể hoàn tác ngay sau khi xóa.', xacNhan: 'Xóa', nguyHiem: true });
        if (!ok) return;
        const cu = xoa('entries', khoan.id);
        thongBao('Đã xóa khoản lễ.', { hoanTac: () => { luu('entries', cu); lamLai(); } });
        location.hash = '#/le';
      } }, 'Xóa') : null)));
  capNhat();
  void svg; void IC; void canDapLe; void tienGon;
}
