// Danh bạ người thân, bạn bè, đồng nghiệp: danh sách, biểu mẫu, chi tiết (ngày quan trọng, sổ lễ, quà).
import { h, chon, truong, phanDoan, thongBao, hoi, trong, chuDau, tien, lamLai, svg } from '../ui/dom.js';
import { IC } from '../ui/icons.js';
import { layDs, layMot, luu, xoa } from '../lib/kho.js';
import { QUAN_HE, tenQuanHe, nhomCuaQuanHe, DIP } from '../data/dip.js';
import { timNguoi, sapXepTen } from '../lib/tim.js';
import { lanKeTiep, LOAI_NGAY } from '../lib/nhac.js';
import { amCua, chuoiAm, ngayVn, homNayIso, tachIso, amSangIso, chenhNgay, tenThu, hopLe, iso } from '../lib/ngay.js';
import { canChiNam } from '../lib/lunar.js';
import { tenSuKien, tinhNoLe, thongKe, nhanChieu } from '../lib/le.js';
import { khoaTim } from '../lib/text.js';
import { conLaiChu, kiemTrungQua, themQua, nguoiTheoId } from '../lib/chung.js';

const loc = { q: '', nhom: '' };
const NHOM_GOI_Y = ['Họ nội', 'Họ ngoại', 'Gia đình nhỏ', 'Công ty', 'Bạn học', 'Hàng xóm'];

export default function ve(root, ctx) {
  const [a, b] = ctx.seg;
  if (a === 'moi') return form(root, ctx, null);
  if (a && b === 'sua') {
    const p = layMot('people', a);
    if (!p) return khongThay(root);
    return form(root, ctx, p);
  }
  if (a) {
    const p = layMot('people', a);
    if (!p) return khongThay(root);
    return chiTiet(root, ctx, p);
  }
  return danhSach(root);
}
const khongThay = (root) => root.append(trong('Không tìm thấy người này', 'Có thể bạn đã xóa họ khỏi danh bạ.', h('a', { class: 'btn primary', href: '#/ban' }, 'Về Danh bạ')));

// ---------- Danh sách ----------
function danhSach(root) {
  const tatCa = layDs('people');
  root.append(h('div', { class: 'sec-head' }, h('h1', {}, `Danh bạ (${tatCa.length})`), h('a', { class: 'btn primary sm', href: '#/ban/moi', 'data-testid': 'them-nguoi' }, 'Thêm người')));
  if (!tatCa.length) {
    root.append(trong('Danh bạ còn trống', 'Thêm người thân, bạn bè, đồng nghiệp. Chỉ cần tên là đủ, ngày sinh có thể thêm sau. Dữ liệu chỉ nằm trên máy bạn.', h('a', { class: 'btn primary', href: '#/ban/moi' }, 'Thêm người đầu tiên')));
    return;
  }
  const nhoms = [...new Set(tatCa.map((p) => p.nhom).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'vi'));
  const tim = h('input', { type: 'search', placeholder: 'Tìm theo tên, nhóm, ghi chú (không cần dấu)', 'aria-label': 'Tìm trong danh bạ', value: loc.q, 'data-testid': 'tim-ban' });
  const ds = h('div', { class: 'stack' });
  const chips = h('div', { class: 'chips', 'aria-label': 'Lọc theo nhóm' });
  const veChips = () => {
    chips.replaceChildren(h('button', { type: 'button', class: 'chip', 'aria-pressed': loc.nhom === '' ? 'true' : 'false', onclick: () => { loc.nhom = ''; ve2(); } }, 'Tất cả'),
      ...nhoms.map((n) => h('button', { type: 'button', class: 'chip', 'aria-pressed': loc.nhom === n ? 'true' : 'false', onclick: () => { loc.nhom = n; ve2(); } }, n)));
  };
  root.append(tim, nhoms.length ? chips : null, ds);
  tim.addEventListener('input', () => { loc.q = tim.value; ve2(); });
  function ve2() {
    veChips();
    let l = timNguoi(tatCa, loc.q);
    if (loc.nhom) l = l.filter((p) => p.nhom === loc.nhom);
    l = sapXepTen(l);
    ds.replaceChildren();
    if (!l.length) { ds.append(trong('Không thấy ai khớp', 'Thử gõ ít chữ hơn, hoặc bỏ lọc nhóm.')); return; }
    ds.append(h('ul', { class: 'list', 'data-testid': 'ds-ban' }, l.map((p) => {
      const ln = p.sinh ? lanKeTiep(p.sinh, homNayIso()) : null;
      return h('li', {}, h('a', { class: 'item', href: `#/ban/${encodeURIComponent(p.id)}`, 'data-testid': 'nguoi' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, chuDau(p.ten)),
        h('span', { class: 'item-main' }, h('span', { class: 'item-t blk' }, p.ten), h('span', { class: 'item-s blk' }, [tenQuanHe(p.quanHe), p.nhom].filter(Boolean).join(' · '))),
        ln ? h('span', { class: 'tag' }, `Sinh nhật ${ln.iso.slice(8)}/${ln.iso.slice(5, 7)}`) : null));
    })));
  }
  ve2();
}

// ---------- Biểu mẫu ----------
function form(root, ctx, p) {
  ctx.datTieuDe(p ? 'Sửa thông tin' : 'Thêm người');
  const sinh = p && p.sinh;
  const ten = h('input', { type: 'text', id: 'p-ten', value: p ? p.ten : '', maxlength: 80, autocomplete: 'off', placeholder: 'Ví dụ: Nguyễn Văn Hùng', 'data-testid': 'p-ten' });
  const goi = h('input', { type: 'text', id: 'p-goi', value: p ? p.cachGoi : '', maxlength: 40, placeholder: 'Ví dụ: anh Hùng (dùng khi viết lời chúc)', 'data-testid': 'p-goi' });
  const qh = chon(QUAN_HE.map((q) => ({ v: q.id, t: q.ten })), p ? p.quanHe : 'ban-be', { id: 'p-qh', 'data-testid': 'p-qh' });
  const nhomDl = h('datalist', { id: 'dl-nhom' }, [...new Set([...NHOM_GOI_Y, ...layDs('people').map((x) => x.nhom).filter(Boolean)])].map((n) => h('option', { value: n })));
  const nhom = h('input', { type: 'text', id: 'p-nhom', list: 'dl-nhom', value: p ? p.nhom : '', maxlength: 40, placeholder: 'Ví dụ: Họ nội, Công ty', 'data-testid': 'p-nhom' });
  let kieu = sinh ? sinh.kieu : 'khong';
  const phanKieu = phanDoan([{ id: 'khong', ten: 'Chưa nhập' }, { id: 'duong', ten: 'Dương lịch' }, { id: 'am', ten: 'Âm lịch' }], kieu, (v) => { kieu = v; capNhat(); }, 'Kiểu ngày sinh');
  const nNgay = h('input', { type: 'text', inputmode: 'numeric', id: 'p-ngay', value: sinh ? sinh.ngay : '', maxlength: 2, placeholder: 'Ngày', 'aria-label': 'Ngày sinh', 'data-testid': 'p-sn-ngay' });
  const nThang = h('input', { type: 'text', inputmode: 'numeric', id: 'p-thang', value: sinh ? sinh.thang : '', maxlength: 2, placeholder: 'Tháng', 'aria-label': 'Tháng sinh', 'data-testid': 'p-sn-thang' });
  const nNam = h('input', { type: 'text', inputmode: 'numeric', id: 'p-nam', value: sinh && sinh.nam ? sinh.nam : '', maxlength: 4, placeholder: 'Năm (nếu nhớ)', 'aria-label': 'Năm sinh', 'data-testid': 'p-sn-nam' });
  const nhuan = h('input', { type: 'checkbox', id: 'p-nhuan', checked: !!(sinh && sinh.nhuan) });
  const nhuanBox = h('label', { class: 'check', for: 'p-nhuan' }, nhuan, 'Sinh vào tháng nhuận');
  const xem = h('div', { class: 'hint', 'aria-live': 'polite', 'data-testid': 'p-sn-xem' });
  const sdt = h('input', { type: 'tel', id: 'p-sdt', value: p ? p.sdt : '', maxlength: 20, placeholder: 'Không bắt buộc', autocomplete: 'off' });
  const ghi = h('textarea', { id: 'p-ghi', maxlength: 600, placeholder: 'Sở thích, dị ứng, món hay dùng, người nhà…' }, p ? p.ghiChu : '');
  const truoc = h('input', { type: 'text', inputmode: 'numeric', id: 'p-truoc', value: p && p.nhacTruoc !== null && p.nhacTruoc !== undefined ? p.nhacTruoc : '', maxlength: 2, placeholder: 'Mặc định 3' });
  const loi = h('div', { class: 'err', role: 'alert', hidden: true });

  const docSinh = () => {
    if (kieu === 'khong') return { ok: true, sinh: null };
    const d = Number(nNgay.value); const m = Number(nThang.value); const n = nNam.value.trim() ? Number(nNam.value) : null;
    if (!Number.isInteger(d) || !Number.isInteger(m) || d < 1 || m < 1 || m > 12) return { ok: false, loi: 'Hãy nhập ngày và tháng sinh bằng số, ví dụ 15 và 8.' };
    if (n !== null && (!Number.isInteger(n) || n < 1800 || n > 2100)) return { ok: false, loi: 'Năm sinh chưa đúng, hãy nhập 4 chữ số hoặc để trống.' };
    if (kieu === 'duong' && !hopLe(n || 2000, m, d)) return { ok: false, loi: 'Ngày dương lịch này không có trong tháng, hãy kiểm tra lại.' };
    if (kieu === 'am' && d > 30) return { ok: false, loi: 'Ngày âm lịch chỉ có tối đa 30 ngày.' };
    return { ok: true, sinh: { kieu, ngay: d, thang: m, nam: n, nhuan: kieu === 'am' && nhuan.checked } };
  };
  function capNhat() {
    const am = kieu === 'am';
    for (const e of [nNgay, nThang, nNam]) e.disabled = kieu === 'khong';
    nhuanBox.hidden = !am;
    const r = docSinh();
    xem.textContent = '';
    if (!r.ok || !r.sinh) { if (kieu !== 'khong' && nNgay.value && nThang.value && !r.ok) xem.textContent = r.loi; return; }
    const hn = homNayIso();
    const ln = lanKeTiep(r.sinh, hn);
    if (!ln) return;
    if (am) xem.textContent = `Lần tới rơi vào ${tenThu(ln.iso)} ${ngayVn(ln.iso)} dương lịch.${r.sinh.nhuan ? ' Sinh tháng nhuận: app nhắc theo tháng thường cùng số.' : ''}`;
    else { const a = amCua(ln.iso); xem.textContent = `Lần tới: ${tenThu(ln.iso)} ${ngayVn(ln.iso)}, tức ${chuoiAm(a)} âm lịch.`; }
  }
  for (const e of [nNgay, nThang, nNam]) e.addEventListener('input', capNhat);
  nhuan.addEventListener('change', capNhat);

  const luuLai = async () => {
    loi.hidden = true;
    const t = ten.value.trim();
    if (!t) { loi.textContent = 'Hãy nhập tên.'; loi.hidden = false; ten.focus(); return; }
    const s = docSinh();
    if (!s.ok) { loi.textContent = s.loi; loi.hidden = false; nNgay.focus(); return; }
    let tr = null;
    if (truoc.value.trim()) { tr = Number(truoc.value); if (!Number.isInteger(tr) || tr < 0 || tr > 60) { loi.textContent = 'Số ngày nhắc trước từ 0 đến 60.'; loi.hidden = false; truoc.focus(); return; } }
    const kt = khoaTim(t); const kg = khoaTim(goi.value);
    const trung = layDs('people').filter((x) => (!p || x.id !== p.id) && (khoaTim(x.ten) === kt || (kg && khoaTim(x.cachGoi || '') === kg) || (kg && khoaTim(x.ten) === kg)));
    if (trung.length && !(await hoi({ tieuDe: 'Trong danh bạ đã có người trùng tên', noiDung: `Đã có ${trung.map((x) => x.ten).join(', ')}. Nếu là cùng một người, hãy hủy và mở người đó để sửa. Nếu là hai người khác nhau, bấm Vẫn thêm; khi ghi sổ lễ app sẽ hỏi bạn chọn đúng người.`, xacNhan: 'Vẫn lưu', huy: 'Quay lại' }))) return;
    const luuP = luu('people', { ...(p || {}), ten: t, cachGoi: goi.value.trim(), quanHe: qh.value, nhom: nhom.value.trim(), sinh: s.sinh, ghiChu: ghi.value.trim(), sdt: sdt.value.trim(), nhacTruoc: tr });
    thongBao(p ? 'Đã lưu thay đổi.' : `Đã thêm ${t} vào danh bạ.`, p ? {} : { hoanTac: () => { xoa('people', luuP.id); lamLai(); } });
    location.hash = p ? `#/ban/${encodeURIComponent(luuP.id)}` : '#/ban';
  };
  root.append(h('h1', {}, p ? 'Sửa thông tin' : 'Thêm người'));
  root.append(h('form', { class: 'card', novalidate: true, onsubmit: (e) => { e.preventDefault(); luuLai(); } },
    truong('Tên', ten), truong('Cách gọi', goi), truong('Quan hệ', qh), h('div', { class: 'field' }, h('label', { for: 'p-nhom' }, 'Nhóm'), nhom, nhomDl),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Ngày sinh'), phanKieu, h('div', { class: 'grid3 mt10' }, nNgay, nThang, nNam), nhuanBox, xem),
    truong('Số điện thoại', sdt, 'Chỉ lưu trên máy bạn.'), truong('Sở thích, dị ứng, ghi chú', ghi), truong('Nhắc trước (ngày)', truoc, 'Số ngày nhắc chuẩn bị quà trước sinh nhật. Để trống là 3 ngày.'),
    loi,
    h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'btn primary', 'data-testid': 'p-luu' }, 'Lưu'), h('a', { class: 'btn ghost', href: p ? `#/ban/${encodeURIComponent(p.id)}` : '#/ban' }, 'Hủy'))));
  capNhat();
  void nhomCuaQuanHe; void tachIso; void amSangIso; void chenhNgay; void iso; void canChiNam;
}

// ---------- Chi tiết ----------
function chiTiet(root, ctx, p) {
  ctx.datTieuDe(p.cachGoi || p.ten);
  const hn = homNayIso();
  root.append(h('section', { class: 'card' },
    h('div', { class: 'item p0' }, h('span', { class: 'avatar' }, chuDau(p.ten)),
      h('div', { class: 'item-main' }, h('h1', { 'data-testid': 'ten-nguoi' }, p.ten), h('div', { class: 'item-s' }, [p.cachGoi && p.cachGoi !== p.ten ? `Gọi là ${p.cachGoi}` : '', tenQuanHe(p.quanHe), p.nhom].filter(Boolean).join(' · ')))),
    h('div', { class: 'row-actions' },
      p.sdt ? h('a', { class: 'btn sm', href: `tel:${p.sdt.replace(/[^\d+]/g, '')}` }, svg(IC.goi), 'Gọi') : null,
      h('a', { class: 'btn sm', href: `#/ban/${encodeURIComponent(p.id)}/sua`, 'data-testid': 'sua-nguoi' }, svg(IC.sua), 'Sửa'),
      h('a', { class: 'btn sm', href: `#/qua?p=${encodeURIComponent(p.id)}` }, 'Gợi ý quà'),
      h('a', { class: 'btn sm', href: `#/qua/chuc?p=${encodeURIComponent(p.id)}` }, 'Lời chúc'))));

  if (p.ghiChu) root.append(h('div', { class: 'note', 'data-testid': 'ghi-chu-nguoi' }, h('strong', {}, 'Cần nhớ: '), p.ghiChu));

  // Ngày quan trọng
  const cacNgay = [];
  if (p.sinh) cacNgay.push({ ten: 'Sinh nhật', spec: p.sinh, nam: p.sinh.nam, loai: 'sinhNhat' });
  for (const d of layDs('dates').filter((x) => x.personId === p.id)) cacNgay.push({ ten: d.ten || LOAI_NGAY[d.loai].ten, spec: d, nam: d.nam, loai: d.loai, id: d.id });
  const ngayKhung = h('section', { class: 'card stack', 'aria-labelledby': 'nq-t' }, h('div', { class: 'sec-head' }, h('h2', { id: 'nq-t' }, 'Ngày quan trọng'), h('a', { class: 'link-btn', href: `#/them/ngay/moi?p=${encodeURIComponent(p.id)}` }, 'Thêm')));
  if (!cacNgay.length) ngayKhung.append(h('p', { class: 'muted' }, 'Chưa có ngày nào. Thêm ngày sinh (bấm Sửa) hoặc ngày giỗ, ngày cưới.'));
  for (const n of cacNgay) {
    const ln = lanKeTiep(n.spec, hn);
    const dong = ln ? `${tenThu(ln.iso)} ${ngayVn(ln.iso)} · ${conLaiChu(chenhNgay(hn, ln.iso)).toLowerCase()}` : 'Ngày chưa hợp lệ';
    ngayKhung.append(h('div', { class: 'item p0 h56' },
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, `${n.ten} · ${n.spec.kieu === 'am' ? `${n.spec.ngay}/${n.spec.thang} âm${n.spec.nhuan ? ' (nhuận)' : ''}` : `${String(n.spec.ngay).padStart(2, '0')}/${String(n.spec.thang).padStart(2, '0')}`}${n.nam ? ` · ${n.nam}` : ''}`), h('div', { class: 'item-s' }, dong)),
      n.id ? h('a', { class: 'link-btn', href: `#/them/ngay/sua/${encodeURIComponent(n.id)}` }, 'Sửa') : null));
  }
  root.append(ngayKhung);

  // Sổ lễ
  const ls = layDs('entries').filter((e) => e.personId === p.id).sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const t = thongKe(ls);
  const no = tinhNoLe(layDs('entries')).chuaDap.filter((e) => e.personId === p.id);
  const sole = h('section', { class: 'card stack', 'aria-labelledby': 'sl-t' }, h('div', { class: 'sec-head' }, h('h2', { id: 'sl-t' }, 'Sổ lễ với người này'), h('a', { class: 'link-btn', href: `#/le/moi?p=${encodeURIComponent(p.id)}` }, 'Ghi khoản')));
  if (!ls.length) sole.append(h('p', { class: 'muted' }, 'Chưa có khoản nào.'));
  else {
    sole.append(h('dl', { class: 'kv' }, h('dt', {}, 'Bạn đã đi (mừng, phúng, tặng)'), h('dd', { class: 'di' }, tien(t.tongDi)), h('dt', {}, 'Bạn đã nhận'), h('dd', { class: 'den' }, tien(t.tongDen))));
    if (no.length) sole.append(h('p', { class: 'tag amber' }, `Chưa đáp lễ: ${no.map((e) => `${tenSuKien(e.suKien)} ${ngayVn(e.ngay)}`).join('; ')}`));
    sole.append(h('ul', { class: 'list' }, ls.slice(0, 5).map((e) => h('li', {}, h('a', { class: 'item', href: `#/le/sua/${encodeURIComponent(e.id)}` },
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, tenSuKien(e.suKien)), h('div', { class: 'item-s' }, ngayVn(e.ngay))),
      h('div', { class: `item-r ${e.huong}` }, e.soTien ? tien(e.soTien) : 'Quà', h('small', {}, nhanChieu(e.huong, e.suKien))))))));
  }
  root.append(sole);

  // Quà
  const gifts = layDs('gifts').filter((g) => g.personId === p.id);
  const y = gifts.filter((g) => g.trangThai === 'y-tuong'); const da = gifts.filter((g) => g.trangThai === 'da-tang');
  const oQua = h('input', { type: 'text', id: 'qua-moi', maxlength: 120, placeholder: 'Ví dụ: khăn len màu xám', 'data-testid': 'qua-y-tuong' });
  const canh = h('div', { class: 'hint', role: 'status', 'data-testid': 'qua-canh-bao' });
  const them = (trang) => {
    const t = oQua.value.trim();
    if (!t) { canh.textContent = 'Hãy gõ tên món quà.'; oQua.focus(); return; }
    const trung = kiemTrungQua(p.id, t);
    if (trung && trang === 'y-tuong' && canh.dataset.xacNhan !== t) { canh.textContent = `${trung} Bấm lại để vẫn lưu ý tưởng này.`; canh.dataset.xacNhan = t; canh.classList.add('loi-chu'); return; }
    themQua({ personId: p.id, ten: t, trangThai: trang });
    thongBao(trang === 'da-tang' ? 'Đã ghi món quà đã tặng.' : 'Đã lưu ý tưởng quà.');
    lamLai();
  };
  const hangQua = (g) => h('li', {}, h('div', { class: 'item' },
    h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, g.ten), g.ngay ? h('div', { class: 'item-s' }, `Tặng ngày ${ngayVn(g.ngay)}`) : null),
    g.trangThai === 'y-tuong' ? h('button', { type: 'button', class: 'btn sm', onclick: () => { luu('gifts', { ...g, trangThai: 'da-tang', ngay: homNayIso() }); thongBao('Đã chuyển sang quà đã tặng.'); lamLai(); } }, 'Đã tặng') : null,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Xóa ${g.ten}`, onclick: () => { const cu = xoa('gifts', g.id); thongBao('Đã xóa món quà.', { hoanTac: () => { luu('gifts', cu); lamLai(); } }); lamLai(); } }, svg(IC.xoa))));
  root.append(h('section', { class: 'card stack', 'aria-labelledby': 'q-t' }, h('h2', { id: 'q-t' }, 'Quà'),
    h('div', { class: 'field' }, h('label', { for: 'qua-moi' }, 'Thêm món quà'), oQua, canh),
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn sm primary', 'data-testid': 'luu-y-tuong', onclick: () => them('y-tuong') }, 'Lưu làm ý tưởng'), h('button', { type: 'button', class: 'btn sm', 'data-testid': 'luu-da-tang', onclick: () => them('da-tang') }, 'Ghi đã tặng hôm nay')),
    y.length ? h('div', {}, h('h3', {}, 'Muốn tặng'), h('ul', { class: 'list', 'data-testid': 'ds-y-tuong' }, y.map(hangQua))) : null,
    da.length ? h('div', {}, h('h3', {}, 'Đã tặng, tránh tặng trùng'), h('ul', { class: 'list', 'data-testid': 'ds-da-tang' }, da.map(hangQua))) : null));

  root.append(h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn', 'data-testid': 'gop-nguoi', onclick: () => gopNguoi(p) }, 'Gộp với người khác'), h('button', { type: 'button', class: 'btn danger', 'data-testid': 'xoa-nguoi', onclick: async () => {
    const ok = await hoi({ tieuDe: `Xóa ${p.ten} khỏi danh bạ?`, noiDung: 'Các khoản trong sổ lễ vẫn được giữ, ghi theo tên. Bạn có thể hoàn tác ngay sau khi xóa.', xacNhan: 'Xóa', nguyHiem: true });
    if (!ok) return;
    const cuP = xoa('people', p.id);
    const cuE = layDs('entries').filter((e) => e.personId === p.id).map((e) => ({ ...e }));
    const cuD = layDs('dates').filter((d) => d.personId === p.id).map((d) => ({ ...d }));
    const cuG = layDs('gifts').filter((g) => g.personId === p.id).map((g) => ({ ...g }));
    cuE.forEach((e) => luu('entries', { ...e, personId: null, tenNguoi: cuP.ten }));
    cuD.forEach((d) => luu('dates', { ...d, personId: null, ten: d.ten || cuP.cachGoi || cuP.ten }));
    cuG.forEach((g) => xoa('gifts', g.id));
    thongBao(`Đã xóa ${cuP.ten}.`, { hoanTac: () => { luu('people', cuP); cuE.forEach((e) => luu('entries', e)); cuD.forEach((d) => luu('dates', d)); cuG.forEach((g) => luu('gifts', g)); lamLai(); } });
    location.hash = '#/ban';
  } }, 'Xóa khỏi danh bạ')));
  void nguoiTheoId; void DIP;
}

/** Gộp bản ghi trùng (ví dụ "anh Hùng" và "Hùng"): chuyển sổ lễ, ngày quan trọng, quà sang người này, rồi xóa bản kia. Có hoàn tác. */
function gopNguoi(p) {
  const khac = layDs('people').filter((x) => x.id !== p.id);
  const d = h('dialog', { 'aria-labelledby': 'gop-t' });
  if (!khac.length) { thongBao('Danh bạ chưa có người nào khác để gộp.'); return; }
  const sel = h('select', { id: 'gop-sel', 'data-testid': 'gop-sel' }, khac.slice().sort((a, b) => a.ten.localeCompare(b.ten, 'vi')).map((x) => h('option', { value: x.id }, `${x.ten}${x.cachGoi ? ` (${x.cachGoi})` : ''}`)));
  const dong = () => { try { d.close(); } catch { /* đã đóng */ } d.remove(); };
  d.append(h('h2', { id: 'gop-t' }, `Gộp vào ${p.ten}`), h('p', {}, 'Chọn bản trùng. Sổ lễ, ngày quan trọng và quà của người đó sẽ chuyển sang người này, rồi người đó bị xóa khỏi danh bạ. Ô còn trống ở người này sẽ lấy từ bản kia.'),
    h('div', { class: 'field' }, h('label', { for: 'gop-sel' }, 'Người trùng'), sel),
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: dong }, 'Hủy'),
      h('button', { type: 'button', class: 'btn primary', 'data-testid': 'gop-ok', onclick: () => {
        const o = layMot('people', sel.value); dong();
        if (!o) return;
        const cuP = { ...p }; const cuO = { ...o };
        const cuE = layDs('entries').filter((e) => e.personId === o.id).map((e) => ({ ...e }));
        const cuD = layDs('dates').filter((e) => e.personId === o.id).map((e) => ({ ...e }));
        const cuG = layDs('gifts').filter((e) => e.personId === o.id).map((e) => ({ ...e }));
        luu('people', { ...p, cachGoi: p.cachGoi || o.cachGoi, nhom: p.nhom || o.nhom, sdt: p.sdt || o.sdt, sinh: p.sinh || o.sinh, ghiChu: [p.ghiChu, o.ghiChu].filter((x, i, a) => x && a.indexOf(x) === i).join('\n') });
        cuE.forEach((e) => luu('entries', { ...e, personId: p.id }));
        cuD.forEach((e) => luu('dates', { ...e, personId: p.id }));
        cuG.forEach((e) => luu('gifts', { ...e, personId: p.id }));
        xoa('people', o.id);
        thongBao(`Đã gộp ${o.ten} vào ${p.ten}.`, { hoanTac: () => { luu('people', cuP); luu('people', cuO); cuE.forEach((e) => luu('entries', e)); cuD.forEach((e) => luu('dates', e)); cuG.forEach((e) => luu('gifts', e)); lamLai(); } });
        lamLai();
      } }, 'Gộp')));
  d.addEventListener('cancel', (e) => { e.preventDefault(); dong(); });
  document.body.append(d);
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
