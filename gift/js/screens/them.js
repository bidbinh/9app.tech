// Mục "Thêm": ngày quan trọng, dịp lễ, nhắc qua .ics, dữ liệu của tôi, giao diện, giới thiệu.
import { h, chon, truong, phanDoan, thongBao, hoi, trong, tai, lamLai, svg, tien } from '../ui/dom.js';
import { IC } from '../ui/icons.js';
import { layDs, layMot, luu, xoa, layCaiDat, datCaiDat, xuat, nhap, xoaSach, trangThaiKho, daDanhDauSaoLuu } from '../lib/kho.js';
import { DIP_LE } from '../data/dip.js';
import { lanKeTiep, ngayDip, LOAI_NGAY, taoIcs, sapToi } from '../lib/nhac.js';
import { homNayIso, ngayVn, tenThu, amCua, chuoiAm, hopLe, chenhNgay } from '../lib/ngay.js';
import { sangCsv } from '../lib/le.js';
import { QUA } from '../data/qua.js';
import { demLoiChuc } from '../data/loichuc.js';
import { conLaiChu, nguoiTheoId, goiNguoi, sapToiHienTai, dipBatHienTai } from '../lib/chung.js';
import { dinhDangSo } from '../lib/text.js';

export default function ve(root, ctx) {
  const [muc, a, b] = ctx.seg;
  if (!muc) return menu(root);
  const map = { ngay: () => ngayQuanTrong(root, ctx, a, b), dip: () => dipLe(root), nhac: () => nhacIcs(root), 'du-lieu': () => duLieu(root), 'giao-dien': () => giaoDien(root), 'gioi-thieu': () => gioiThieu(root) };
  if (!map[muc]) return menu(root);
  root.append(h('a', { class: 'link-btn', href: '#/them' }, '‹ Thêm'));
  return map[muc]();
}

function menu(root) {
  const m = [
    ['#/them/ngay', 'Ngày quan trọng', 'Ngày giỗ, ngày cưới, kỷ niệm theo dương hoặc âm lịch'],
    ['#/them/dip', 'Dịp lễ cần nhắc', 'Bật hoặc tắt 8/3, 20/10, 20/11, Tết, Trung thu, Vu Lan…'],
    ['#/them/nhac', 'Nhắc qua lịch điện thoại', 'Tải tệp .ics để điện thoại báo đúng ngày'],
    ['#/them/du-lieu', 'Dữ liệu của tôi', 'Sao lưu, nhập lại, xuất CSV, xóa sạch'],
    ['#/them/giao-dien', 'Giao diện', 'Chữ lớn, sáng hoặc tối, ẩn số tiền'],
    ['#/them/gioi-thieu', 'Về 9gift', 'Quyền riêng tư, nguồn nội dung, lưu ý'],
  ];
  root.append(h('h1', {}, 'Thêm'));
  root.append(h('ul', { class: 'list', 'data-testid': 'menu-them' }, m.map(([href, t, s]) => h('li', {}, h('a', { class: 'item', href }, h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, t), h('div', { class: 'item-s' }, s)), svg(IC.phai))))));
}

// ---------- Ngày quan trọng ----------
function ngayQuanTrong(root, ctx, a, b) {
  if (a === 'moi') return formNgay(root, ctx, null);
  if (a === 'sua') { const d = layMot('dates', b); if (!d) { root.append(trong('Không tìm thấy ngày này', 'Có thể bạn đã xóa.', h('a', { class: 'btn primary', href: '#/them/ngay' }, 'Về danh sách'))); return; } return formNgay(root, ctx, d); }
  const hn = homNayIso();
  const ds = layDs('dates').map((d) => ({ d, ln: lanKeTiep(d, hn) })).sort((x, y) => ((x.ln && x.ln.iso) || '9') < ((y.ln && y.ln.iso) || '9') ? -1 : 1);
  root.append(h('div', { class: 'sec-head' }, h('h1', {}, 'Ngày quan trọng'), h('a', { class: 'btn primary sm', href: '#/them/ngay/moi', 'data-testid': 'them-ngay' }, 'Thêm ngày')));
  root.append(h('p', { class: 'muted' }, 'Sinh nhật của từng người nhập ở Danh bạ. Ở đây là ngày giỗ, ngày cưới và các ngày khác, nhắc lại mỗi năm theo dương hoặc âm lịch.'));
  if (!ds.length) { root.append(trong('Chưa có ngày nào', 'Thêm ngày giỗ ông bà, ngày cưới của anh chị, hoặc kỷ niệm của hai vợ chồng.', h('a', { class: 'btn primary', href: '#/them/ngay/moi' }, 'Thêm ngày đầu tiên'))); return; }
  root.append(h('ul', { class: 'list', 'data-testid': 'ds-ngay' }, ds.map(({ d, ln }) => {
    const p = d.personId ? nguoiTheoId(d.personId) : null;
    const ten = d.ten || (p ? goiNguoi(p) : '');
    return h('li', {}, h('a', { class: 'item', href: `#/them/ngay/sua/${encodeURIComponent(d.id)}` },
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, `${LOAI_NGAY[d.loai].ten}: ${ten}`),
        h('div', { class: 'item-s' }, `${d.kieu === 'am' ? `${d.ngay}/${d.thang} âm lịch${d.nhuan ? ' (nhuận)' : ''}` : `${d.ngay}/${d.thang} dương lịch`}${ln ? ` · tới ${tenThu(ln.iso)} ${ngayVn(ln.iso)}` : ''}`)),
      ln ? h('span', { class: 'tag' }, conLaiChu(chenhNgay(hn, ln.iso))) : null));
  })));
}

function formNgay(root, ctx, d) {
  ctx.datTieuDe(d ? 'Sửa ngày' : 'Thêm ngày');
  const q = ctx.q;
  let kieu = d ? d.kieu : 'am';
  const loai = chon(['gio', 'cuoi', 'kyNiem', 'khac'].map((k) => ({ v: k, t: LOAI_NGAY[k].ten })), d ? d.loai : 'gio', { id: 'd-loai', 'data-testid': 'd-loai' });
  const nguoi = chon([{ v: '', t: 'Không gắn với ai trong danh bạ' }, ...layDs('people').slice().sort((x, y) => x.ten.localeCompare(y.ten, 'vi')).map((p) => ({ v: p.id, t: p.ten }))], d ? d.personId || '' : (q.get('p') || ''), { id: 'd-nguoi' });
  const ten = h('input', { type: 'text', id: 'd-ten', maxlength: 80, value: d ? d.ten : '', placeholder: 'Ví dụ: Ông nội, vợ chồng anh Hai', 'data-testid': 'd-ten' });
  const phanKieu = phanDoan([{ id: 'am', ten: 'Âm lịch' }, { id: 'duong', ten: 'Dương lịch' }], kieu, (v) => { kieu = v; cn(); }, 'Kiểu ngày');
  const nNgay = h('input', { type: 'text', inputmode: 'numeric', value: d ? d.ngay : '', maxlength: 2, placeholder: 'Ngày', 'aria-label': 'Ngày', 'data-testid': 'd-ngay' });
  const nThang = h('input', { type: 'text', inputmode: 'numeric', value: d ? d.thang : '', maxlength: 2, placeholder: 'Tháng', 'aria-label': 'Tháng', 'data-testid': 'd-thang' });
  const nNam = h('input', { type: 'text', inputmode: 'numeric', value: d && d.nam ? d.nam : '', maxlength: 4, placeholder: 'Năm gốc', 'aria-label': 'Năm gốc (không bắt buộc)', 'data-testid': 'd-nam' });
  const nhuan = h('input', { type: 'checkbox', id: 'd-nhuan', checked: !!(d && d.nhuan) });
  const nhuanBox = h('label', { class: 'check', for: 'd-nhuan' }, nhuan, 'Rơi vào tháng nhuận');
  const truoc = h('input', { type: 'text', inputmode: 'numeric', id: 'd-truoc', value: d && d.truoc !== null && d.truoc !== undefined ? d.truoc : '', maxlength: 2, placeholder: 'Mặc định theo loại' });
  const xem = h('div', { class: 'hint', 'aria-live': 'polite', 'data-testid': 'd-xem' });
  const loi = h('div', { class: 'err', role: 'alert', hidden: true });
  const nhanNam = h('span', {});
  function doc() {
    const dd = Number(nNgay.value); const mm = Number(nThang.value); const n = nNam.value.trim() ? Number(nNam.value) : null;
    if (!Number.isInteger(dd) || !Number.isInteger(mm) || dd < 1 || mm < 1 || mm > 12) return { loi: 'Hãy nhập ngày và tháng bằng số.' };
    if (n !== null && (!Number.isInteger(n) || n < 1800 || n > 2100)) return { loi: 'Năm gốc chưa đúng, nhập 4 chữ số hoặc để trống.' };
    if (kieu === 'duong' && !hopLe(n || 2000, mm, dd)) return { loi: 'Ngày dương lịch này không có trong tháng.' };
    if (kieu === 'am' && dd > 30) return { loi: 'Ngày âm lịch tối đa 30.' };
    return { ok: { kieu, ngay: dd, thang: mm, nam: n, nhuan: kieu === 'am' && nhuan.checked } };
  }
  function cn() {
    nhuanBox.hidden = kieu !== 'am';
    nhanNam.textContent = loai.value === 'gio' ? 'Năm mất (không bắt buộc, để đếm giỗ lần thứ mấy)' : loai.value === 'cuoi' ? 'Năm cưới (để đếm kỷ niệm mấy năm)' : 'Năm gốc (không bắt buộc)';
    const r = doc();
    xem.textContent = '';
    if (!r.ok) return;
    const ln = lanKeTiep(r.ok, homNayIso());
    if (!ln) return;
    xem.textContent = kieu === 'am'
      ? `Lần tới: ${tenThu(ln.iso)} ${ngayVn(ln.iso)} dương lịch.${r.ok.nhuan ? ' Tháng nhuận: nhắc theo tháng thường cùng số.' : ''}${r.ok.ngay === 30 ? ' Tháng thiếu (29 ngày) thì nhắc vào ngày 29.' : ''}`
      : `Lần tới: ${tenThu(ln.iso)} ${ngayVn(ln.iso)}, tức ${chuoiAm(amCua(ln.iso))} âm lịch.`;
  }
  [nNgay, nThang, nNam].forEach((e) => e.addEventListener('input', cn)); loai.addEventListener('change', cn); nhuan.addEventListener('change', cn);
  nguoi.addEventListener('change', () => { const p = nguoiTheoId(nguoi.value); if (p && !ten.value.trim()) ten.value = goiNguoi(p); });
  const luuNgay = () => {
    loi.hidden = true;
    const r = doc();
    if (!r.ok) { loi.textContent = r.loi; loi.hidden = false; nNgay.focus(); return; }
    let tr = null;
    if (truoc.value.trim()) { tr = Number(truoc.value); if (!Number.isInteger(tr) || tr < 0 || tr > 60) { loi.textContent = 'Số ngày nhắc trước từ 0 đến 60.'; loi.hidden = false; return; } }
    const t = ten.value.trim() || (nguoiTheoId(nguoi.value) ? goiNguoi(nguoiTheoId(nguoi.value)) : '');
    if (!t) { loi.textContent = 'Hãy nhập tên người hoặc tên ngày này.'; loi.hidden = false; ten.focus(); return; }
    const sv = luu('dates', { ...(d || {}), personId: nguoi.value || null, loai: loai.value, ten: ten.value.trim(), ...r.ok, truoc: tr });
    thongBao('Đã lưu ngày.', d ? {} : { hoanTac: () => { xoa('dates', sv.id); lamLai(); } });
    location.hash = '#/them/ngay';
  };
  root.append(h('h1', {}, d ? 'Sửa ngày' : 'Thêm ngày quan trọng'));
  root.append(h('form', { class: 'card', novalidate: true, onsubmit: (e) => { e.preventDefault(); luuNgay(); } },
    truong('Loại', loai), truong('Người liên quan', nguoi), truong('Tên (ông nội, vợ chồng anh Hai…)', ten),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Ngày'), phanKieu, h('div', { class: 'grid3 mt10' }, nNgay, nThang, nNam), h('div', { class: 'hint' }, nhanNam), nhuanBox, xem),
    truong('Nhắc trước (ngày)', truoc, 'Số ngày nhắc chuẩn bị. Để trống là theo loại: giỗ và sinh nhật 3 ngày, ngày cưới 7 ngày.'),
    loi,
    h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'btn primary', 'data-testid': 'd-luu' }, 'Lưu'), h('a', { class: 'btn ghost', href: '#/them/ngay' }, 'Hủy'),
      d ? h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (!(await hoi({ tieuDe: 'Xóa ngày này?', xacNhan: 'Xóa', nguyHiem: true }))) return; const cu = xoa('dates', d.id); thongBao('Đã xóa ngày.', { hoanTac: () => { luu('dates', cu); lamLai(); } }); location.hash = '#/them/ngay'; } }, 'Xóa') : null)));
  cn();
}

// ---------- Dịp lễ ----------
function dipLe(root) {
  const bat = dipBatHienTai() || new Set(DIP_LE.filter((x) => x.macDinh).map((x) => x.id));
  const nam = Number(homNayIso().slice(0, 4));
  root.append(h('h1', {}, 'Dịp lễ cần nhắc'), h('p', { class: 'muted' }, 'Bật những dịp bạn hay tặng quà hoặc gửi lời chúc. App sẽ nhắc trước vài ngày ở màn Sắp tới.'));
  root.append(h('ul', { class: 'list', 'data-testid': 'ds-dip' }, DIP_LE.map((dp) => {
    const hn = homNayIso();
    let d = ngayDip(dp, nam); if (d && d < hn) d = ngayDip(dp, nam + 1);
    const cb = h('input', { type: 'checkbox', id: `dip-${dp.id}`, checked: bat.has(dp.id), onchange: () => { if (cb.checked) bat.add(dp.id); else bat.delete(dp.id); datCaiDat({ dipBat: [...bat] }); } });
    return h('li', {}, h('label', { class: 'item', for: `dip-${dp.id}` }, cb,
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, dp.ten), h('div', { class: 'item-s' }, `${d ? `${tenThu(d)} ${ngayVn(d)} · ` : ''}${dp.doiTuong}`))));
  })));
}

// ---------- Nhắc .ics ----------
function nhacIcs(root) {
  let soThang = 12;
  const cd = layCaiDat();
  const dem = h('p', { class: 'muted', 'data-testid': 'ics-dem' });
  const dsEv = () => sapToiHienTai(Math.round(soThang * 30.5));
  const cn = () => { dem.textContent = `Sẽ tạo ${dsEv().length} sự kiện trong ${soThang} tháng tới.`; };
  const truoc = h('input', { type: 'text', inputmode: 'numeric', id: 'n-truoc', value: String(cd.nhacTruoc), maxlength: 2 });
  truoc.addEventListener('change', () => { const v = Number(truoc.value); if (Number.isInteger(v) && v >= 0 && v <= 60) { datCaiDat({ nhacTruoc: v }); thongBao('Đã lưu số ngày nhắc trước.'); cn(); } else { truoc.value = String(layCaiDat().nhacTruoc); } });
  root.append(h('h1', {}, 'Nhắc qua lịch điện thoại'),
    h('div', { class: 'card' },
      h('p', {}, 'Web app không tự báo khi đã đóng. Để điện thoại nhắc đúng ngày, hãy tải tệp lịch .ics rồi mở bằng Lịch (Google Calendar, Apple Calendar). Mỗi sự kiện có hai lời nhắc: trước vài ngày để chuẩn bị quà, và sáng đúng ngày.'),
      h('p', { class: 'muted' }, 'Ngày âm được đổi sang ngày dương cho từng năm, nên giỗ và sinh nhật âm vẫn nhắc đúng. Khi thêm người mới hoặc sau một năm, hãy tải lại tệp.'),
      truong('Nhắc chuẩn bị trước (ngày) cho người trong danh bạ', truoc, 'Áp dụng cho sinh nhật. Từng người hoặc từng ngày có thể đặt riêng.'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Tạo lịch cho'), phanDoan([{ id: 6, ten: '6 tháng' }, { id: 12, ten: '12 tháng' }, { id: 24, ten: '24 tháng' }], soThang, (v) => { soThang = v; cn(); }, 'Số tháng')),
      dem,
      h('button', { type: 'button', class: 'btn primary block', 'data-testid': 'tai-ics', onclick: () => {
        const ev = dsEv();
        if (!ev.length) { thongBao('Chưa có sự kiện nào để tạo lịch. Hãy thêm người hoặc bật dịp lễ.'); return; }
        tai('9gift-nhac-ngay.ics', taoIcs(ev), 'text/calendar;charset=utf-8');
        thongBao(`Đã tạo tệp lịch với ${ev.length} sự kiện.`);
      } }, 'Tải tệp lịch (.ics)'),
      h('div', { class: 'note' }, 'Tệp .ics chứa tên người thân của bạn. Nó nằm trong máy bạn; đừng gửi cho người lạ.')),
    h('details', { class: 'card' }, h('summary', {}, 'Cách thêm vào lịch'),
      h('ul', { class: 'stack' }, h('li', {}, 'Android: mở tệp vừa tải trong thư mục Tải xuống, chọn Google Calendar rồi bấm Nhập hoặc Thêm.'),
        h('li', {}, 'iPhone: mở tệp từ Tệp hoặc thông báo tải về, chọn Thêm tất cả, chọn lịch muốn thêm.'),
        h('li', {}, 'Máy tính: vào calendar.google.com, chọn Cài đặt, Nhập và xuất, chọn tệp .ics.'),
        h('li', {}, 'Nên tạo một lịch riêng tên “9gift” để khi cần xóa chỉ việc xóa lịch đó.'))));
  cn();
  void sapToi; void taoIcs;
}

// ---------- Dữ liệu của tôi ----------
let ketQuaNhap = null;
function duLieu(root) {
  const cd = layCaiDat(); const tt = trangThaiKho();
  const dem = { p: layDs('people').length, e: layDs('entries').length, d: layDs('dates').length, g: layDs('gifts').length };
  const hn = homNayIso();
  root.append(h('h1', {}, 'Dữ liệu của tôi'));
  if (ketQuaNhap) {
    const k = ketQuaNhap;
    root.append(h('div', { class: k.daSua || k.boQua ? 'note' : 'note ok', 'data-testid': 'ket-qua-nhap' }, h('strong', {}, `Lần nhập vừa rồi: ${k.them} mục được nhập. `), k.daSua ? `${k.daSua} khoản có số tiền không hợp lệ (âm hoặc quá lớn) đã được đổi thành 0 đồng. ` : '', k.boQua ? `${k.boQua} mục bị bỏ qua vì hỏng. ` : '', k.lyDo.length ? `Lý do: ${k.lyDo.join('; ')}.` : ''));
  }
  root.append(h('div', { class: 'card stack' },
    h('p', {}, 'Mọi dữ liệu (danh bạ người thân, số tiền phong bì, ghi chú) chỉ nằm trong trình duyệt của máy này. 9gift không có máy chủ nhận dữ liệu, không thống kê, không gửi đi đâu.'),
    h('dl', { class: 'kv', 'data-testid': 'dem-du-lieu' }, h('dt', {}, 'Người trong danh bạ'), h('dd', {}, String(dem.p)), h('dt', {}, 'Khoản lễ'), h('dd', {}, String(dem.e)), h('dt', {}, 'Ngày quan trọng'), h('dd', {}, String(dem.d)), h('dt', {}, 'Món quà'), h('dd', {}, String(dem.g)),
      h('dt', {}, 'Sao lưu lần cuối'), h('dd', {}, cd.daSaoLuu ? `${ngayVn(cd.daSaoLuu.slice(0, 10))} (${chenhNgay(cd.daSaoLuu.slice(0, 10), hn)} ngày trước)` : 'Chưa bao giờ')),
    tt.ben ? null : h('div', { class: 'err' }, 'Trình duyệt này không cho lưu lâu dài. Hãy xuất bản sao lưu trước khi đóng trang.')));

  const boxLuuBen = h('div', { class: 'stack' });
  const veLuuBen = async () => {
    boxLuuBen.replaceChildren();
    let ben = null;
    try { if (navigator.storage && navigator.storage.persisted) ben = await navigator.storage.persisted(); } catch { ben = null; }
    if (ben === null) return;
    boxLuuBen.append(h('div', { class: ben ? 'note ok' : 'note' }, ben ? 'Trình duyệt đã đồng ý giữ dữ liệu lâu dài.' : 'Trình duyệt có thể xóa dữ liệu khi máy đầy bộ nhớ. Bạn có thể xin giữ lâu dài, và vẫn nên sao lưu.'),
      ben ? null : h('button', { type: 'button', class: 'btn sm', 'data-testid': 'xin-ben', onclick: async () => { try { const ok = await navigator.storage.persist(); thongBao(ok ? 'Trình duyệt sẽ giữ dữ liệu lâu dài.' : 'Trình duyệt chưa đồng ý. Hãy sao lưu thường xuyên.'); } catch { thongBao('Không xin được.'); } veLuuBen(); } }, 'Xin giữ dữ liệu lâu dài'));
  };
  veLuuBen();
  root.append(boxLuuBen);

  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'visually', id: 'nhap-file', 'data-testid': 'nhap-file', tabindex: '-1' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { thongBao('Tệp quá lớn (trên 20 MB), không phải bản sao lưu của 9gift.'); return; }
    let obj;
    try { obj = JSON.parse(await f.text()); } catch { thongBao('Không đọc được tệp. Hãy chọn tệp .json đã xuất từ 9gift.'); return; }
    if (!obj || obj.app !== '9gift') { thongBao('Tệp này không phải bản sao lưu của 9gift.'); return; }
    const n = ['people', 'entries', 'dates', 'gifts'].map((k) => (Array.isArray(obj[k]) ? obj[k].length : 0));
    const chon3 = await hoi({ tieuDe: 'Nhập bản sao lưu', noiDung: `Tệp có ${n[0]} người, ${n[1]} khoản lễ, ${n[2]} ngày quan trọng, ${n[3]} món quà. “Gộp thêm” giữ dữ liệu hiện có và thêm từ tệp (an toàn). “Thay thế” xóa dữ liệu hiện có trên máy rồi nhập từ tệp, nhưng bạn có thể hoàn tác ngay sau đó.`, xacNhan: 'Gộp thêm', phu: 'Thay thế', huy: 'Hủy' });
    if (!chon3) return;
    const thay = chon3 === 'phu';
    const truocKhi = thay ? JSON.parse(JSON.stringify(xuat())) : null;
    const kq = await nhap(obj, thay ? 'thay' : 'gop');
    if (!kq.ok) { thongBao(kq.loi, { ms: 10000 }); return; }
    ketQuaNhap = { them: kq.them, boQua: kq.boQua, daSua: kq.daSua, lyDo: kq.lyDo };
    thongBao(`Đã nhập ${kq.them} mục.${kq.daSua ? ` Đã sửa ${kq.daSua} khoản.` : ''}${kq.boQua ? ` Bỏ qua ${kq.boQua} mục hỏng.` : ''}`, { ms: 12000, hoanTac: truocKhi ? async () => { await nhap(truocKhi, 'thay'); ketQuaNhap = null; lamLai(); } : null });
    lamLai();
  });
  root.append(h('div', { class: 'card stack' }, h('h2', {}, 'Sao lưu và khôi phục'),
    h('button', { type: 'button', class: 'btn primary', 'data-testid': 'xuat-json', onclick: () => { tai(`9gift-sao-luu-${hn}.json`, JSON.stringify(xuat(), null, 1), 'application/json'); daDanhDauSaoLuu(); thongBao('Đã tạo tệp sao lưu trong thư mục tải về. Cất ở nơi an toàn, tệp có thông tin người thân.'); lamLai(); } }, 'Xuất bản sao lưu (JSON)'),
    h('button', { type: 'button', class: 'btn', onclick: () => file.click() }, 'Nhập từ bản sao lưu'), file,
    h('button', { type: 'button', class: 'btn', onclick: async () => {
      let an = false;
      if (layCaiDat().anTien) { const v = await hoi({ tieuDe: 'Đang bật Ẩn số tiền', noiDung: 'Tệp CSV có thể ghi số tiền thật hoặc ẩn bằng dấu sao.', xacNhan: 'Ghi số tiền thật', phu: 'Ẩn số tiền trong tệp', huy: 'Hủy' }); if (!v) return; an = v === 'phu'; }
      tai(`so-le-9gift-${hn}.csv`, sangCsv(layDs('entries'), Object.fromEntries(layDs('people').map((p) => [p.id, p.ten])), { anTien: an }), 'text/csv;charset=utf-8'); thongBao('Đã tạo tệp CSV sổ lễ.');
    } }, 'Xuất sổ lễ ra CSV (mở bằng Excel)')));

  root.append(h('div', { class: 'card stack' }, h('h2', {}, 'Xóa sạch'), h('p', {}, 'Xóa toàn bộ người, khoản lễ, ngày quan trọng, quà và cài đặt dịp lễ khỏi máy này. Không thể hoàn tác, hãy xuất sao lưu trước.'),
    h('button', { type: 'button', class: 'btn danger', 'data-testid': 'xoa-sach', onclick: async () => {
      if (!(await hoi({ tieuDe: 'Xóa sạch mọi dữ liệu?', noiDung: `Sẽ xóa ${dem.p} người, ${dem.e} khoản lễ, ${dem.d} ngày quan trọng và ${dem.g} món quà. Không thể hoàn tác.`, xacNhan: 'Xóa sạch', nguyHiem: true }))) return;
      if (!(await hoi({ tieuDe: 'Chắc chắn chứ?', noiDung: 'Đây là lần xác nhận cuối.', xacNhan: 'Vâng, xóa sạch', nguyHiem: true }))) return;
      await xoaSach();
      thongBao('Đã xóa sạch dữ liệu trên máy này.');
      location.hash = '#/';
    } }, 'Xóa sạch dữ liệu')));
  void dinhDangSo; void tien;
}

// ---------- Giao diện ----------
export function layUi() { try { return JSON.parse(localStorage.getItem('9gift.ui') || '{}'); } catch { return {}; } }
function ghiUi(phan) {
  const u = { ...layUi(), ...phan };
  try { localStorage.setItem('9gift.ui', JSON.stringify(u)); } catch { /* bị chặn: chỉ áp dụng cho phiên này */ }
  const r = document.documentElement;
  if (u.theme === 'light' || u.theme === 'dark') r.setAttribute('data-theme', u.theme); else r.removeAttribute('data-theme');
  if (u.chuLon) r.setAttribute('data-chu', 'lon'); else r.removeAttribute('data-chu');
}
function giaoDien(root) {
  const u = layUi(); const cd = layCaiDat();
  const lon = h('input', { type: 'checkbox', id: 'gd-lon', checked: !!u.chuLon, 'data-testid': 'chu-lon', onchange: () => ghiUi({ chuLon: lon.checked }) });
  const an = h('input', { type: 'checkbox', id: 'gd-an', checked: !!cd.anTien, 'data-testid': 'an-tien', onchange: () => { datCaiDat({ anTien: an.checked }); } });
  root.append(h('h1', {}, 'Giao diện'),
    h('div', { class: 'card stack' },
      h('label', { class: 'check', for: 'gd-lon' }, lon, 'Chữ lớn (dễ đọc hơn)'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Màu nền'), phanDoan([{ id: 'auto', ten: 'Theo máy' }, { id: 'light', ten: 'Sáng' }, { id: 'dark', ten: 'Tối' }], u.theme === 'light' || u.theme === 'dark' ? u.theme : 'auto', (v) => ghiUi({ theme: v }), 'Màu nền')),
      h('label', { class: 'check', for: 'gd-an' }, an, 'Ẩn số tiền (khi đưa điện thoại cho người khác xem)'),
      h('p', { class: 'hint' }, 'Phạm vi: ẩn trên mọi màn hình và bản in. Khi xuất CSV app sẽ hỏi lại. Tệp sao lưu JSON luôn có số thật, hãy cất cẩn thận'),
      h('p', { class: 'hint' }, 'Hiệu ứng chuyển động tự giảm nếu máy bạn bật “giảm chuyển động”.')));
}

// ---------- Giới thiệu ----------
function gioiThieu(root) {
  root.append(h('h1', {}, 'Về 9gift'),
    h('div', { class: 'card stack' }, h('h2', {}, 'Riêng tư'),
      h('p', {}, 'Dữ liệu chỉ nằm trên máy bạn (IndexedDB của trình duyệt). 9gift không đăng nhập, không có máy chủ nhận dữ liệu, không quảng cáo, không theo dõi. Khi nói vào micro, việc nhận giọng nói do trình duyệt thực hiện và có thể gửi âm thanh tới dịch vụ của hãng trình duyệt; 9gift không lưu câu bạn nói.'),
      h('p', {}, 'Đồng bộ giữa các máy qua tài khoản 9id sẽ có sau, chỉ khi bạn chủ động bật. Hiện tại hãy dùng bản sao lưu JSON để chuyển máy.')),
    h('div', { class: 'card stack' }, h('h2', {}, 'Cách nhắc ngày'),
      h('p', {}, 'Ngày âm được tính bằng thuật toán lịch âm Việt Nam (múi giờ UTC+7), cùng bộ tính với Vạn Niên. Sinh nhật hoặc ngày giỗ ở tháng nhuận được nhắc theo tháng thường cùng số. Ngày 30 gặp tháng thiếu thì nhắc vào ngày 29. Ngày 29/2 dương gặp năm không nhuận thì nhắc 28/2. Đây là quy ước phổ biến; nhà nào làm khác có thể đặt ngày cụ thể.')),
    h('div', { class: 'card stack' }, h('h2', {}, 'Nội dung gợi ý'),
      h('p', {}, `Gợi ý quà (${QUA.length} món) và lời chúc (${demLoiChuc()} lời) do 9gift tự biên soạn, không có liên kết bán hàng và không nêu giá. Mức đáp lễ chỉ để tham khảo, không có mức “đúng”: tùy quan hệ, hoàn cảnh, từng nơi. Điều kiêng kỵ là quan niệm dân gian, tùy từng gia đình. Nội dung về tang lễ và tín ngưỡng cần người am hiểu địa phương xem lại trước khi dùng cho nghi lễ.`),
      h('p', {}, 'Văn khấn, mâm cúng giỗ và Tết xem ở ', h('a', { href: '../vannien/' }, 'Vạn Niên'), '.')),
    h('p', { class: 'muted small' }, '9gift 1.0 · một phần của 9app.tech'));
}
