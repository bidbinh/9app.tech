// Biểu mẫu ghi nhật ký (xăng, sạc, bảo dưỡng, chi phí khác) và ô ghi nhanh bằng câu/giọng nói.
import { h, truong, baoLoi, toast, hoi, icon, xoa } from './dom.js';
import { app, hom, chonXe, soKm } from './common.js';
import { kho, xeCua, tenXe, luuNhatKy, xoaNhatKy, khoiPhuc } from '../lib/data.js';
import { LOAI_NHAT_KY, nhomCua } from '../lib/fuel.js';
import { docSo, dinhDangSo } from '../lib/money.js';
import { laIso, addDays, diffDays } from '../lib/dates.js';
import { phanTichCau } from '../lib/parse.js';
import { coGiongNoi, taoNghe } from './voice.js';

const soHienThi = (v, tp = 3) => (v === null || v === undefined || v === '' ? '' : String(Number(Number(v).toFixed(tp))).replace('.', ','));

/**
 * @param {{xeId?:string, loai?:string, nhatKy?:object, truocDien?:object, gon?:boolean, onXong?:(e:object)=>void}} o
 */
export function formNhatKy(o = {}) {
  const sua = o.nhatKy || null;
  const du = sua || o.truocDien || {};
  const xeId0 = (sua && sua.xeId) || o.xeId || (kho.xe[0] && kho.xe[0].id) || '';
  const form = h('form', { novalidate: true, autocomplete: 'off' });
  const selXe = chonXe(xeId0); selXe.name = 'xe';
  const selLoai = h('select', { id: 'loai-nk' }, LOAI_NHAT_KY.map((l) => h('option', { value: l.id, selected: l.id === (du.loai || o.loai || 'xang') }, l.ten)));
  const inNgay = h('input', { type: 'date', id: 'ngay-nk', value: du.ngay || hom(), max: addDays(hom(), 1) });
  const inTien = h('input', { type: 'text', inputmode: 'decimal', id: 'tien-nk', placeholder: 'Ví dụ 300.000 hoặc 300k', value: du.tien ? dinhDangSo(du.tien) : '' });
  const inLuong = h('input', { type: 'text', inputmode: 'decimal', id: 'luong-nk', value: soHienThi(du.luong) });
  const inKm = h('input', { type: 'text', inputmode: 'numeric', id: 'km-nk', value: du.km !== null && du.km !== undefined ? soKm(du.km) : '' });
  const chkDay = h('input', { type: 'checkbox', id: 'day-nk', checked: du.day !== false });
  const inNoi = h('input', { type: 'text', id: 'noi-nk', value: du.noi || '', maxlength: 80 });
  const inHang = h('input', { type: 'text', id: 'hang-nk', value: du.hangMuc || '', maxlength: 80, placeholder: 'Ví dụ: Thay nhớt, lọc gió' });
  const inPhut = h('input', { type: 'text', inputmode: 'numeric', id: 'phut-nk', value: du.phut ?? '' });
  const inGhi = h('textarea', { id: 'ghi-nk', maxlength: 300 }, du.ghiChu || '');
  const giaDon = h('div', { class: 'hint', 'aria-live': 'polite' });
  const kmGoiY = h('div', { class: 'hint' });

  const fLuong = truong('', inLuong);
  const lblLuong = fLuong.querySelector('label');
  const fDay = h('div', { class: 'field' }, h('label', { class: 'check', for: 'day-nk' }, chkDay, 'Đổ đầy bình (hoặc sạc đầy)'),
    h('div', { class: 'hint' }, 'Bật khi bạn đổ đầy. Nhờ vậy 9car tính được mức tiêu hao chính xác giữa hai lần đổ đầy.'));
  const fTien = truong('Số tiền (đồng)', inTien);
  const fKm = truong('Số km trên đồng hồ', inKm);
  fKm.append(kmGoiY);
  const fNoi = truong('', inNoi);
  const fHang = truong('Hạng mục', inHang);
  const fPhut = truong('Thời gian sạc (phút)', inPhut);
  const fNgay = truong('Ngày', inNgay);
  const fXe = truong('Xe', selXe);
  const chiTiet = h('div', {}, fNoi, fHang, fPhut, truong('Ghi chú', inGhi));

  const loai = () => selLoai.value;
  const laNL = () => nhomCua(loai()) === 'nhien-lieu';
  function capNhat() {
    const l = loai(); const nl = laNL(); const xe = xeCua(selXe.value);
    fLuong.hidden = !nl; fDay.hidden = !nl;
    lblLuong.textContent = l === 'sac' ? 'Điện đã sạc (kWh)' : 'Số lít';
    fNoi.querySelector('label').textContent = l === 'sac' ? 'Nơi sạc' : l === 'xang' ? 'Cây xăng' : l === 'gui-xe' ? 'Nơi gửi' : l === 'cau-duong' ? 'Trạm, tuyến đường' : 'Nơi làm (gara, tiệm)';
    fHang.hidden = !(l === 'bao-duong' || l === 'sua-chua');
    fPhut.hidden = l !== 'sac';
    const t = docSo(inTien.value); const lg = docSo(inLuong.value);
    giaDon.textContent = nl && t > 0 && lg > 0 ? `Giá khoảng ${dinhDangSo(Math.round(t / lg))} đ/${l === 'sac' ? 'kWh' : 'lít'}` : '';
    kmGoiY.textContent = xe && xe.km !== null ? `Số km hiện tại của xe: ${soKm(xe.km)}` : '';
  }
  fLuong.append(giaDon);
  [selLoai, selXe, inTien, inLuong].forEach((el) => el.addEventListener('input', capNhat));
  selXe.addEventListener('change', capNhat);
  capNhat();

  const nutLuu = h('button', { class: 'btn block', type: 'submit' }, sua ? 'Lưu thay đổi' : 'Lưu');
  const hang = o.gon
    ? [h('div', { class: 'two keep' }, fTien, fLuong), h('div', { class: 'two keep' }, fKm, fNgay), fDay, h('details', {}, h('summary', {}, 'Thêm chi tiết'), chiTiet)]
    : [fNgay, fTien, fLuong, fDay, fKm, chiTiet];
  form.append(kho.xe.length > 1 ? fXe : h('input', { type: 'hidden', value: xeId0 }), h('div', { class: 'field' }, h('label', { for: 'loai-nk' }, 'Loại khoản'), selLoai), ...hang, nutLuu);
  if (sua) {
    form.append(h('button', { class: 'btn bad block', type: 'button', style: 'margin-top:10px', onclick: async () => {
      const ok = await hoi({ tieuDe: 'Xóa khoản này?', noiDung: 'Bạn có thể hoàn tác ngay sau khi xóa.', ok: 'Xóa', nguyHiem: true });
      if (!ok) return;
      const snap = await xoaNhatKy(sua.id);
      toast('Đã xóa khoản chi', { hoanTac: async () => { await khoiPhuc(snap); app.render(); } });
      app.di('#/nhat-ky');
    } }, icon('trash'), 'Xóa khoản này'));
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const xe = xeCua(selXe.value || xeId0);
    const t = inTien.value.trim() === '' ? 0 : docSo(inTien.value);
    const lg = inLuong.value.trim() === '' ? null : docSo(inLuong.value);
    const km = inKm.value.trim() === '' ? null : docSo(inKm.value.replace(/\./g, ''));
    let loi = false;
    const bao = (f, m) => { baoLoi(f, m); if (m) loi = true; };
    bao(fXe, !xe ? 'Hãy chọn xe.' : '');
    bao(fNgay, !laIso(inNgay.value) ? 'Hãy chọn ngày.' : (diffDays(hom(), inNgay.value) > 1 ? 'Ngày này ở tương lai.' : ''));
    bao(fTien, Number.isNaN(t) || t < 0 ? 'Số tiền chưa đúng. Ví dụ: 300000 hoặc 300k.' : '');
    if (laNL()) bao(fLuong, lg !== null && (Number.isNaN(lg) || lg < 0) ? 'Số lượng chưa đúng.' : '');
    bao(fKm, km !== null && (Number.isNaN(km) || km < 0) ? 'Số km chưa đúng.' : '');
    if (!loi && !(t > 0) && !(lg > 0)) bao(fTien, 'Hãy nhập số tiền' + (laNL() ? ' hoặc số lượng.' : '.'));
    if (loi) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    if (km !== null && xe && xe.km !== null && km < xe.km && !(sua && sua.km === km)) {
      const ok = await hoi({ tieuDe: 'Số km thấp hơn hiện tại', noiDung: `Xe đang ghi ${soKm(xe.km)} km, bạn nhập ${soKm(km)} km. Vẫn lưu khoản này?`, ok: 'Vẫn lưu' });
      if (!ok) { inKm.focus(); return; }
    }
    nutLuu.disabled = true;
    try {
      const truoc = sua ? { ...sua } : null;
      const e = await luuNhatKy({
        id: sua ? sua.id : undefined, xeId: xe.id, loai: loai(), ngay: inNgay.value, tien: t, luong: laNL() ? lg : null,
        km, day: laNL() ? chkDay.checked : true, noi: inNoi.value, hangMuc: (loai() === 'bao-duong' || loai() === 'sua-chua') ? inHang.value : '',
        ghiChu: inGhi.value, phut: loai() === 'sac' && inPhut.value.trim() ? docSo(inPhut.value) : null,
      }, hom());
      toast(sua ? 'Đã cập nhật' : 'Đã lưu khoản chi', {
        hoanTac: async () => { if (truoc) await luuNhatKy(truoc, hom()); else await xoaNhatKy(e.id); app.render(); },
      });
      if (o.onXong) o.onXong(e);
    } catch (err) {
      nutLuu.disabled = false;
      toast(`Không lưu được: ${err.message}`);
    }
  });
  return form;
}

/** Ô ghi nhanh: gõ hoặc nói một câu, soát kết quả rồi lưu. */
export function cauNhanh({ xeId, onLuu } = {}) {
  const card = h('section', { class: 'card', 'aria-labelledby': 'qn-t' });
  const inCau = h('input', { type: 'text', id: 'cau-nhanh', placeholder: 'Ví dụ: đổ xăng 300k 8 lít', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Gõ một câu để ghi nhanh', maxlength: 200 });
  const vstatus = h('div', { class: 'vstatus', role: 'status', 'aria-live': 'polite' });
  const reviewBox = h('div');
  const dsXe = h('div', { class: 'field' });
  let selXe = null;
  if (kho.xe.length > 1) { selXe = chonXe(xeId); selXe.setAttribute('aria-label', 'Chọn xe'); dsXe.append(selXe); }
  const xeDangChon = () => (selXe ? selXe.value : xeId || (kho.xe[0] && kho.xe[0].id));

  const mic = h('button', { class: 'mic', type: 'button', 'aria-label': 'Nói để ghi nhanh', 'data-trang-thai': 'nghi' });
  const veMic = (t) => {
    xoa(mic); mic.dataset.trangThai = t;
    if (t === 'nghi') { mic.append(icon('mic')); mic.setAttribute('aria-label', 'Nói để ghi nhanh'); }
    if (t === 'nghe') { mic.append(h('span', { class: 'pulse' }), 'Dừng'); mic.setAttribute('aria-label', 'Đang nghe. Chạm để dừng.'); }
    if (t === 'xuly') { mic.append(h('span', { class: 'spin' }), 'Xử lý'); mic.setAttribute('aria-label', 'Đang xử lý'); }
    mic.disabled = t === 'xuly';
    vstatus.textContent = t === 'nghe' ? 'Đang nghe... hãy nói, ví dụ "đổ xăng ba trăm nghìn tám lít".' : t === 'xuly' ? 'Đang xử lý...' : vstatus.textContent;
  };
  veMic('nghi');
  function phanTich(cau) {
    const r = phanTichCau(cau);
    xoa(reviewBox);
    if (!r.ok) { vstatus.textContent = r.ghiChu.join(' '); return; }
    vstatus.textContent = 'Đã hiểu. Hãy soát lại rồi bấm Lưu.';
    const truoc = { loai: r.loai, tien: r.tien, luong: r.luong, km: r.km, hangMuc: r.hangMuc, ngay: r.ngay === 'hom-qua' ? addDays(hom(), -1) : hom(), day: true };
    const f = formNhatKy({
      xeId: xeDangChon(), truocDien: truoc, gon: true,
      onXong: (e) => { xoa(reviewBox); inCau.value = ''; vstatus.textContent = 'Đã ghi.'; if (onLuu) onLuu(e); else app.render(); },
    });
    reviewBox.append(h('div', { class: 'review' },
      h('div', { class: 'sub', style: 'margin-bottom:10px' }, 'Kết quả để soát. 9car không lưu câu bạn vừa nói, chỉ lưu các ô dưới đây.'),
      r.ghiChu.length ? h('div', { class: 'banner warn', style: 'margin-bottom:10px' }, r.ghiChu.join(' ')) : null, f));
    f.querySelector('input,select')?.focus();
  }
  let nghe = null;
  if (coGiongNoi()) {
    nghe = taoNghe({ onTrangThai: veMic, onKetQua: (c) => phanTich(c), onLoi: (m) => { vstatus.textContent = m; } });
    mic.addEventListener('click', () => { if (nghe.trangThai === 'nghe') nghe.dung(); else nghe.bat(); });
  } else {
    mic.addEventListener('click', () => { vstatus.textContent = 'Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy gõ câu vào ô bên cạnh.'; inCau.focus(); });
    mic.setAttribute('aria-disabled', 'true'); mic.style.opacity = '.6';
  }
  const linkTay = h('a', { class: 'btn sm sec', href: `#/nhat-ky/moi?xe=${encodeURIComponent(xeDangChon() || '')}` }, 'Nhập tay');
  if (selXe) selXe.addEventListener('change', () => linkTay.setAttribute('href', `#/nhat-ky/moi?xe=${encodeURIComponent(selXe.value)}`));
  const form = h('form', { onsubmit: (e) => { e.preventDefault(); if (!inCau.value.trim()) { vstatus.textContent = 'Hãy gõ hoặc nói một câu, ví dụ "đổ xăng 300k 8 lít".'; inCau.focus(); return; } phanTich(inCau.value); } },
    h('div', { class: 'quick' }, inCau, mic),
    h('div', { class: 'row wrap', style: 'margin-top:10px' },
      h('button', { class: 'btn sm', type: 'submit' }, 'Phân tích câu'),
      linkTay));
  card.append(h('h2', { id: 'qn-t' }, 'Ghi nhanh xăng, sạc, chi phí'), dsXe, form, vstatus, reviewBox);
  return card;
}
