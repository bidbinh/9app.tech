// Hồ sơ xe: danh sách, chi tiết, biểu mẫu, thiết lập nhắc nhanh.
import { h, icon, truong, baoLoi, trong, toast, hoi, nenAnh, taiTep, xoa, the } from '../ui/dom.js';
import { app, hom, anhXe, tatCaHen, dongHen, soKm, laXeDien } from '../ui/common.js';
import { kho, xeCua, tenXe, luuXe, xoaXe, khoiPhuc, luuHen, nhatKyCua, henCua } from '../lib/data.js';
import { LOAI_XE, MOC_KHI_THAI, uocHanDau, chuKyDangKiem } from '../lib/rules.js';
import { mauBaoDuong, tenKind } from '../lib/schedule.js';
import { tieuHao, chiPhiMoiKm, thongKeThang, tongTien, uocKmNgay } from '../lib/fuel.js';
import { dinhDangSo, tien, docSo } from '../lib/money.js';
import { dinhDang, laIso, diffDays } from '../lib/dates.js';
import { icsChoXe } from '../ui/lich.js';

const TEN_LOAI = Object.fromEntries(LOAI_XE.map((l) => [l.id, l.ten]));
const TEN_NL = { xang: 'Xăng', diesel: 'Diesel', dien: 'Điện', hybrid: 'Hybrid, xăng lai điện' };

function mauTe(xeId) {
  const ds = tatCaHen().filter((x) => x.hen.xeId === xeId && x.tt.mau !== 'xam');
  return ds.length ? ds[0].tt : null;
}

export function danhSachXe() {
  const el = h('div', {});
  el.append(h('div', { class: 'row' }, h('h1', { class: 'h1 grow' }, 'Xe của bạn'), kho.xe.length ? h('a', { class: 'btn sm', href: '#/xe/moi' }, icon('plus'), 'Thêm xe') : null));
  if (!kho.xe.length) {
    el.append(h('div', { class: 'card' }, trong('car', 'Chưa có xe nào', 'Thêm ô tô hoặc xe máy để bắt đầu nhắc hạn và ghi chi phí.', h('a', { class: 'btn', href: '#/xe/moi' }, icon('plus'), 'Thêm xe'))));
    return { tieuDe: 'Xe', el };
  }
  const card = h('div', { class: 'card' });
  kho.xe.forEach((x) => {
    const tt = mauTe(x.id);
    card.append(h('a', { class: 'item', href: `#/xe/${x.id}` }, anhXe(x),
      h('span', { class: 'grow' }, h('div', { class: 't' }, x.ten || [x.hang, x.dong].filter(Boolean).join(' ') || 'Xe chưa đặt tên'),
        h('div', { class: 'd' }, [x.bienSo, x.km !== null ? `${soKm(x.km)} km` : ''].filter(Boolean).join(' · '))),
      tt ? the(tt.mau, tt.nhan) : h('span', { class: 'sub' }, 'Chưa có hạn')));
  });
  el.append(card);
  return { tieuDe: 'Xe', el };
}

export function chiTietXe(id) {
  const xe = xeCua(id);
  if (!xe) return { tieuDe: 'Xe', quayVe: '#/xe', el: h('div', { class: 'card' }, trong('alert', 'Không tìm thấy xe', 'Xe này có thể đã bị xóa.', h('a', { class: 'btn', href: '#/xe' }, 'Về danh sách xe'))) };
  const el = h('div', {});
  const nk = nhatKyCua(id);
  el.append(h('div', { class: 'card' },
    h('div', { class: 'row' }, anhXe(xe), h('div', { class: 'grow' },
      h('h1', { class: 'h1', style: 'margin:0' }, xe.ten || [xe.hang, xe.dong].filter(Boolean).join(' ') || 'Xe'),
      xe.bienSo ? h('span', { class: 'plate' }, xe.bienSo) : null,
      h('p', { class: 'sub', style: 'margin-top:6px' }, [TEN_LOAI[xe.loai], TEN_NL[xe.nhienLieu], xe.namSX ? `sản xuất ${xe.namSX}` : '', xe.ngayDangKy ? `đăng ký ${dinhDang(xe.ngayDangKy)}` : ''].filter(Boolean).join(' · ')))),
    h('div', { class: 'row wrap', style: 'margin-top:12px' },
      h('a', { class: 'btn sm sec', href: `#/xe/${id}/sua` }, icon('edit'), 'Sửa thông tin'),
      h('a', { class: 'btn sm sec', href: `#/nhat-ky/moi?xe=${id}&loai=${laXeDien(xe) && xe.nhienLieu === 'dien' ? 'sac' : 'xang'}` }, icon(xe.nhienLieu === 'dien' ? 'bolt' : 'fuel'), xe.nhienLieu === 'dien' ? 'Ghi buổi sạc' : 'Ghi đổ xăng'))));

  // Số km
  const inKm = h('input', { type: 'text', inputmode: 'numeric', id: 'km-moi', value: xe.km !== null ? soKm(xe.km) : '', placeholder: 'Số km trên đồng hồ' });
  const fKm = truong('Số km hiện tại', inKm, xe.kmNgay ? `Cập nhật ${dinhDang(xe.kmNgay)}` : 'Chưa có. Nhập để 9car tính hạn bảo dưỡng theo km.');
  el.append(h('form', { class: 'card', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const v = docSo(inKm.value.replace(/\./g, ''));
    if (Number.isNaN(v) || v < 0) { baoLoi(fKm, 'Số km chưa đúng.'); inKm.focus(); return; }
    baoLoi(fKm, '');
    const truoc = { ...xe };
    await luuXe({ ...xe, km: v, kmNgay: hom() });
    toast('Đã cập nhật số km', { hoanTac: async () => { await luuXe(truoc); app.render(); } });
    app.render();
  } }, fKm, h('button', { class: 'btn sm', type: 'submit' }, 'Cập nhật số km')));

  // Nhắc hạn
  const ds = tatCaHen().filter((x) => x.hen.xeId === id);
  const cardHen = h('section', { class: 'card', 'aria-label': 'Nhắc hạn' }, h('h2', {}, `Nhắc hạn (${ds.length})`));
  if (!ds.length) cardHen.append(h('p', { class: 'sub' }, 'Chưa có mục nhắc nào cho xe này.'));
  ds.forEach((x) => cardHen.append(dongHen(x, { hienXe: false })));
  cardHen.append(h('div', { class: 'row wrap', style: 'margin-top:12px' },
    h('a', { class: 'btn sm', href: `#/xe/${id}/thiet-lap` }, icon('bell'), ds.length ? 'Thêm nhắc theo mẫu' : 'Thiết lập nhắc'),
    h('a', { class: 'btn sm sec', href: `#/hen/moi?xe=${id}` }, icon('plus'), 'Thêm mục nhắc'),
    ds.some((x) => x.tt.han) ? h('button', { class: 'btn sm line', type: 'button', onclick: () => icsChoXe(id) }, icon('cal'), 'Tải lịch (.ics)') : null));
  el.append(cardHen);

  if (xe.loai === 'xemay') {
    const moc = xe.khuVuc ? MOC_KHI_THAI[xe.khuVuc] : null;
    el.append(h('div', { class: 'banner', style: 'margin-bottom:14px' },
      'Xe máy theo Luật Trật tự, an toàn giao thông đường bộ 2024 chỉ phải kiểm định khí thải. ',
      moc ? `Khu vực của bạn (${moc.ten}) bắt đầu kiểm định từ ${dinhDang(moc.ngay)} theo Quyết định 13/2026/QĐ-TTg.` : 'Chọn khu vực trong phần sửa thông tin để xem mốc áp dụng.', ' ', h('a', { href: '#/nguon', style: 'text-decoration:underline;font-weight:700' }, 'Xem nguồn quy định')));
  }

  // Thống kê
  const loaiNL = xe.nhienLieu === 'dien' ? 'sac' : 'xang';
  const th = tieuHao(nk.filter((e) => e.loai === loaiNL));
  const cp = chiPhiMoiKm(nk);
  const t12 = thongKeThang(nk, hom(), 12).reduce((s, m) => s + m.tong, 0);
  const don = loaiNL === 'sac' ? 'kWh/100 km' : 'lít/100 km';
  el.append(h('section', { class: 'card', 'aria-label': 'Thống kê' }, h('h2', {}, 'Thống kê'),
    h('div', { class: 'stat' },
      h('div', {}, h('div', { class: 'n' }, th.per100 !== null ? dinhDangSo(th.per100, 1) : '—'), h('div', { class: 'k' }, `Tiêu hao trung bình (${don})`)),
      h('div', {}, h('div', { class: 'n' }, th.gan !== null ? dinhDangSo(th.gan, 1) : '—'), h('div', { class: 'k' }, 'Lần gần nhất')),
      h('div', {}, h('div', { class: 'n' }, cp.moiKm !== null ? `${dinhDangSo(Math.round(cp.moiKm))} đ` : '—'), h('div', { class: 'k' }, 'Chi phí mỗi km')),
      h('div', {}, h('div', { class: 'n' }, tien(t12)), h('div', { class: 'k' }, 'Chi 12 tháng qua'))),
    th.canThem ? h('p', { class: 'sub', style: 'margin-top:10px' }, th.canThem) : null,
    ...th.canhBao.map((m) => h('div', { class: 'banner warn', style: 'margin-top:10px' }, m)),
    h('div', { class: 'row wrap', style: 'margin-top:12px' }, h('a', { class: 'btn sm sec', href: `#/nhat-ky?xe=${id}` }, icon('book'), 'Xem nhật ký'), h('a', { class: 'btn sm sec', href: `#/chi-phi?xe=${id}` }, icon('chart'), 'Xem chi phí'))));

  el.append(h('button', { class: 'btn bad block', type: 'button', onclick: async () => {
    const ok = await hoi({ tieuDe: `Xóa ${tenXe(xe)}?`, noiDung: `Sẽ xóa cả ${nk.length} khoản trong nhật ký và ${henCua(id).length} mục nhắc của xe này. Bạn có thể hoàn tác ngay sau đó.`, ok: 'Xóa xe', nguyHiem: true });
    if (!ok) return;
    const snap = await xoaXe(id);
    toast('Đã xóa xe', { hoanTac: async () => { await khoiPhuc(snap); app.render(); } });
    app.di('#/xe');
  } }, icon('trash'), 'Xóa xe này'));
  return { tieuDe: 'Chi tiết xe', quayVe: '#/xe', el };
}

export function bieuMauXe(id) {
  const sua = id ? xeCua(id) : null;
  if (id && !sua) return { tieuDe: 'Xe', quayVe: '#/xe', el: h('div', { class: 'card' }, trong('alert', 'Không tìm thấy xe', '', h('a', { class: 'btn', href: '#/xe' }, 'Về danh sách xe'))) };
  const x = sua || { loai: 'oto', nhienLieu: 'xang', khuVuc: '' };
  const el = h('div', {});
  el.append(h('h1', { class: 'h1' }, sua ? 'Sửa thông tin xe' : 'Thêm xe'));
  const selLoai = h('select', { id: 'x-loai' }, LOAI_XE.map((l) => h('option', { value: l.id, selected: l.id === x.loai }, l.ten)));
  const inBien = h('input', { type: 'text', id: 'x-bien', value: x.bienSo || '', placeholder: 'Ví dụ 30A-123.45', autocapitalize: 'characters', maxlength: 15 });
  const inTen = h('input', { type: 'text', id: 'x-ten', value: x.ten || '', placeholder: 'Ví dụ: Xe nhà, Xe đi làm', maxlength: 40 });
  const inHang = h('input', { type: 'text', id: 'x-hang', value: x.hang || '', placeholder: 'Ví dụ: Toyota, Honda', maxlength: 40 });
  const inDong = h('input', { type: 'text', id: 'x-dong', value: x.dong || '', placeholder: 'Ví dụ: Vios 2020, Vision', maxlength: 40 });
  const inNam = h('input', { type: 'text', inputmode: 'numeric', id: 'x-nam', value: x.namSX || '', placeholder: 'Ví dụ 2020', maxlength: 4 });
  const selNL = h('select', { id: 'x-nl' }, Object.entries(TEN_NL).map(([k, v]) => h('option', { value: k, selected: k === x.nhienLieu }, v)));
  const inDK = h('input', { type: 'date', id: 'x-dk', value: x.ngayDangKy || '' });
  const inKm = h('input', { type: 'text', inputmode: 'numeric', id: 'x-km', value: x.km !== null && x.km !== undefined ? soKm(x.km) : '' });
  const inGia = h('input', { type: 'text', inputmode: 'decimal', id: 'x-gia', value: x.giaMua ? dinhDangSo(x.giaMua) : '', placeholder: 'Không bắt buộc' });
  const chkKD = h('input', { type: 'checkbox', id: 'x-kd', checked: x.kinhDoanh });
  const chkCT = h('input', { type: 'checkbox', id: 'x-ct', checked: x.caiTao });
  const selKV = h('select', { id: 'x-kv' }, [['', 'Chưa chọn'], ['hn-hcm', 'Hà Nội, TP. Hồ Chí Minh'], ['tptw', 'Thành phố trực thuộc trung ương khác'], ['tinh', 'Tỉnh khác']].map(([k, v]) => h('option', { value: k, selected: k === x.khuVuc }, v)));
  const inBH = h('input', { type: 'tel', id: 'x-bh', value: x.hotlineBH || '', placeholder: 'Số ghi trên giấy bảo hiểm', maxlength: 30 });
  const inCH = h('input', { type: 'tel', id: 'x-ch', value: x.hotlineCuuHo || '', placeholder: 'Số cứu hộ bạn hay dùng', maxlength: 30 });
  let anh = x.anh || '';
  const preview = h('span', { class: 'photo' });
  const veAnh = () => { xoa(preview); if (anh) preview.append(h('img', { src: anh, alt: 'Ảnh xe' })); else preview.append(icon(selLoai.value === 'xemay' ? 'bike' : 'car')); };
  veAnh();
  const inAnh = h('input', { type: 'file', accept: 'image/*', id: 'x-anh', style: 'display:none' });
  inAnh.addEventListener('change', async () => {
    const f = inAnh.files && inAnh.files[0]; if (!f) return;
    try { anh = await nenAnh(f); veAnh(); thongBaoAnh.textContent = 'Ảnh được nén và chỉ lưu trên máy bạn.'; } catch (e) { thongBaoAnh.textContent = e.message; }
  });
  const thongBaoAnh = h('div', { class: 'hint', role: 'status' }, 'Không bắt buộc. Ảnh được thu nhỏ và chỉ lưu trên máy bạn.');
  const nutAnh = h('button', { class: 'btn sm sec', type: 'button', onclick: () => inAnh.click() }, icon('camera'), 'Chọn ảnh');
  const nutBoAnh = h('button', { class: 'btn sm line', type: 'button', onclick: () => { anh = ''; veAnh(); } }, 'Bỏ ảnh');

  const fBien = truong('Biển số', inBien);
  const fNam = truong('Năm sản xuất', inNam, 'Cần để tính chu kỳ đăng kiểm. Xem trên giấy đăng ký xe.');
  const fKm = truong('Số km hiện tại', inKm);
  const fDK = truong('Ngày đăng ký lần đầu', inDK, 'Để trống nếu không nhớ.');
  const fKinhDoanh = h('div', { class: 'field' }, h('label', { class: 'check', for: 'x-kd' }, chkKD, 'Xe kinh doanh vận tải (taxi, xe công nghệ, cho thuê)'),
    h('label', { class: 'check', for: 'x-ct' }, chkCT, 'Xe có cải tạo (đổi kết cấu)'));
  const fKV = truong('Khu vực sinh sống (để biết mốc kiểm định khí thải)', selKV);
  const vung = h('div', {});
  const capNhat = () => {
    const xm = selLoai.value === 'xemay';
    fKinhDoanh.hidden = xm || selLoai.value !== 'oto'; fKV.hidden = !xm;
    if (!anh) veAnh();
  };
  selLoai.addEventListener('change', capNhat);
  const form = h('form', { novalidate: true, autocomplete: 'off' },
    truong('Loại xe', selLoai, 'Chọn "Ô tô chở người đến 8 chỗ" cho xe 4 đến 8 chỗ. Cách đếm chỗ (có tính chỗ người lái hay không) khi phân loại để tính chu kỳ đăng kiểm: CHƯA XÁC MINH, hãy xem số chỗ ghi trên giấy đăng ký, giấy kiểm định.'), fBien, truong('Tên gọi (tùy chọn)', inTen),
    h('div', { class: 'two' }, truong('Hãng', inHang), truong('Dòng xe, đời', inDong)),
    h('div', { class: 'two' }, fNam, truong('Nhiên liệu', selNL)),
    fKinhDoanh, fKV, fDK, fKm,
    truong('Giá mua (tùy chọn, để tính tổng chi phí sở hữu)', inGia),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Ảnh chân dung xe'), h('div', { class: 'row' }, preview, nutAnh, nutBoAnh), inAnh, thongBaoAnh),
    h('details', { class: 'field' }, h('summary', {}, 'Số điện thoại bảo hiểm, cứu hộ (dùng khi gặp sự cố)'), truong('Hotline bảo hiểm', inBH), truong('Số cứu hộ', inCH)),
    h('button', { class: 'btn block', type: 'submit' }, sua ? 'Lưu thay đổi' : 'Lưu xe'));
  capNhat();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nam = inNam.value.trim() === '' ? null : Number(inNam.value);
    const km = inKm.value.trim() === '' ? null : docSo(inKm.value.replace(/\./g, ''));
    const gia = inGia.value.trim() === '' ? null : docSo(inGia.value);
    let loi = false;
    const bao = (f, m) => { baoLoi(f, m); if (m) loi = true; };
    bao(fBien, !inBien.value.trim() && !inHang.value.trim() && !inTen.value.trim() ? 'Hãy nhập biển số hoặc hãng xe để dễ nhận ra xe.' : '');
    bao(fNam, nam !== null && (!Number.isInteger(nam) || nam < 1950 || nam > Number(hom().slice(0, 4)) + 1) ? 'Năm sản xuất chưa đúng.' : '');
    bao(fKm, km !== null && (Number.isNaN(km) || km < 0) ? 'Số km chưa đúng.' : '');
    bao(fDK, inDK.value && !laIso(inDK.value) ? 'Ngày chưa đúng.' : '');
    if (loi) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const xm = selLoai.value === 'xemay';
    const moi = await luuXe({
      ...(sua || {}), id: sua ? sua.id : undefined, loai: selLoai.value, bienSo: inBien.value, ten: inTen.value, hang: inHang.value, dong: inDong.value,
      namSX: nam, nhienLieu: selNL.value, ngayDangKy: inDK.value, km, kmNgay: km !== null && (!sua || sua.km !== km) ? hom() : (sua ? sua.kmNgay : ''),
      giaMua: gia === null || Number.isNaN(gia) ? null : gia, kinhDoanh: !xm && chkKD.checked, caiTao: !xm && chkCT.checked, khuVuc: xm ? selKV.value : '',
      hotlineBH: inBH.value, hotlineCuuHo: inCH.value, anh,
    });
    toast(sua ? 'Đã lưu thông tin xe' : 'Đã thêm xe');
    app.di(sua ? `#/xe/${moi.id}` : `#/xe/${moi.id}/thiet-lap`);
  });
  el.append(h('div', { class: 'card' }, form));
  return { tieuDe: sua ? 'Sửa xe' : 'Thêm xe', quayVe: sua ? `#/xe/${id}` : '#/xe', el, vung };
}

export function thietLapNhac(id) {
  const xe = xeCua(id);
  if (!xe) return { tieuDe: 'Xe', quayVe: '#/xe', el: h('div', { class: 'card' }, trong('alert', 'Không tìm thấy xe', '', h('a', { class: 'btn', href: '#/xe' }, 'Về danh sách xe'))) };
  const xm = xe.loai === 'xemay';
  const el = h('div', {});
  el.append(h('h1', { class: 'h1' }, 'Thiết lập nhắc'), h('p', { class: 'sub' }, `${tenXe(xe)}. Chọn mục cần nhắc. Bạn có thể bỏ qua và nhập sau; mọi hạn đều sửa được.`));
  const hang = [];
  const them = (o) => { hang.push(o); };

  // Hạn theo ngày
  const goiY = xe.ngayDangKy ? uocHanDau(xe, xe.ngayDangKy) : null;
  const mucNgay = [];
  if (!xm) mucNgay.push({ kind: 'dang-kiem', ten: 'Đăng kiểm', han: goiY && goiY.han && goiY.han >= hom() ? goiY.han : '', goiY: goiY && goiY.han && goiY.han >= hom() ? `Gợi ý ${dinhDang(goiY.han)} (ước tính từ ngày đăng ký, hãy đối chiếu với tem đăng kiểm).` : 'Nhập hạn ghi trên tem hoặc giấy chứng nhận kiểm định.', bat: true });
  else mucNgay.push({ kind: 'dang-kiem', ten: 'Kiểm định khí thải', han: '', goiY: 'Xe máy chưa phải kiểm định trước các mốc trong Quyết định 13/2026/QĐ-TTg. Chỉ bật nếu bạn muốn tự nhắc.', bat: false });
  mucNgay.push({ kind: 'tnds', ten: 'Bảo hiểm bắt buộc (TNDS)', han: '', goiY: 'Ngày hết hạn ghi trên giấy chứng nhận bảo hiểm.', bat: true });
  if (!xm) mucNgay.push({ kind: 'phi-duong', ten: 'Phí sử dụng đường bộ', han: '', goiY: 'Ngày hết hạn ghi trên biên lai. Cách thu từ 2026 đã đổi (xem Nguồn quy định), hãy theo biên lai của bạn.', bat: true });
  mucNgay.push({ kind: 'vat-chat', ten: 'Bảo hiểm vật chất (thân vỏ)', han: '', goiY: 'Tự nguyện. Chỉ bật nếu bạn có mua.', bat: false });
  const cardNgay = h('section', { class: 'card' }, h('h2', {}, 'Giấy tờ có hạn'));
  mucNgay.forEach((m, i) => {
    const chk = h('input', { type: 'checkbox', id: `tl-c${i}`, checked: m.bat });
    const inD = h('input', { type: 'date', id: `tl-d${i}`, value: m.han });
    hang.push({ chk, inD, m, loai: 'ngay' });
    cardNgay.append(h('div', { class: 'field' }, h('label', { class: 'check', for: `tl-c${i}` }, chk, m.ten), h('label', { for: `tl-d${i}`, class: 'visually-hidden', style: 'position:absolute;left:-9999px' }, `Hạn ${m.ten}`), inD, h('div', { class: 'hint' }, m.goiY)));
  });
  el.append(cardNgay);

  // Bảo dưỡng theo mẫu
  const mau = mauBaoDuong(xe);
  const inLanCuoi = h('input', { type: 'date', id: 'tl-lc', value: hom(), max: hom() });
  const cardBD = h('section', { class: 'card' }, h('h2', {}, 'Bảo dưỡng theo mẫu'),
    h('p', { class: 'sub' }, 'Đây chỉ là mẫu thông dụng. Mỗi hãng khác nhau, hãy chỉnh theo sổ bảo hành của xe. Nhắc theo ngày hoặc km, cái nào đến trước.'),
    truong('Lần bảo dưỡng gần nhất', inLanCuoi, 'Nếu không nhớ, giữ hôm nay: 9car tính hạn từ hôm nay.'));
  mau.forEach((m, i) => {
    const chk = h('input', { type: 'checkbox', id: `tl-b${i}`, checked: i < 3 });
    hang.push({ chk, m, loai: 'bd' });
    cardBD.append(h('label', { class: 'check', for: `tl-b${i}` }, chk, h('span', {}, h('b', {}, m.ten), h('span', { class: 'sub' }, ` · mỗi ${m.chuKyThang} tháng${m.chuKyKm ? ` hoặc ${soKm(m.chuKyKm)} km` : ''}`))));
  });
  el.append(cardBD);
  el.append(h('button', { class: 'btn block', type: 'button', onclick: async (e) => {
    e.currentTarget.disabled = true;
    let dem = 0;
    for (const r of hang) {
      if (!r.chk.checked) continue;
      if (r.loai === 'ngay') {
        await luuHen({ xeId: id, kind: r.m.kind, ten: r.m.ten, han: r.inD.value && laIso(r.inD.value) ? r.inD.value : '' }); dem++;
      } else {
        await luuHen({ xeId: id, kind: r.m.kind, ten: r.m.ten, chuKyThang: r.m.chuKyThang, chuKyKm: r.m.chuKyKm, ngayLanCuoi: laIso(inLanCuoi.value) ? inLanCuoi.value : hom(), kmLanCuoi: xe.km }); dem++;
      }
    }
    toast(dem ? `Đã thêm ${dem} mục nhắc` : 'Chưa chọn mục nào');
    app.di(`#/xe/${id}`);
  } }, icon('check'), 'Tạo các mục nhắc đã chọn'), h('a', { class: 'btn line block', style: 'margin-top:10px', href: `#/xe/${id}` }, 'Để sau'));
  return { tieuDe: 'Thiết lập nhắc', quayVe: `#/xe/${id}`, el };
}
