// Mục nhắc: thêm, sửa, gia hạn / đã làm xong.
import { h, icon, truong, baoLoi, trong, toast, hoi, the } from '../ui/dom.js';
import { app, hom, soKm, chonXe, iconHen } from '../ui/common.js';
import { kho, xeCua, tenXe, luuHen, xoaHen, khoiPhuc, luuNhatKy } from '../lib/data.js';
import { LOAI_HEN, trangThai, tenKind, hanNgay } from '../lib/schedule.js';
import { chuKyDangKiem, hanKiemDinh, thoiHanGPLX, MOC_KHI_THAI, LUU_Y_HAN } from '../lib/rules.js';
import { addMonths, dinhDang, laIso } from '../lib/dates.js';
import { docSo, dinhDangSo } from '../lib/money.js';
import { icsMotHen } from '../ui/lich.js';
import { tatCaHen } from '../ui/common.js';

export default function bieuMauHen(id, tham = {}) {
  const sua = id && id !== 'moi' ? kho.hen.find((x) => x.id === id) : null;
  if (id && id !== 'moi' && !sua) return { tieuDe: 'Nhắc hạn', quayVe: '#/', el: h('div', { class: 'card' }, trong('alert', 'Không tìm thấy mục nhắc', 'Mục này có thể đã bị xóa.', h('a', { class: 'btn', href: '#/' }, 'Về Hôm nay'))) };
  if (!kho.xe.length && !(sua || tham.kind === 'gplx')) return { tieuDe: 'Nhắc hạn', quayVe: '#/', el: h('div', { class: 'card' }, trong('car', 'Cần thêm xe trước', 'Mục nhắc gắn với một chiếc xe.', h('a', { class: 'btn', href: '#/xe/moi' }, 'Thêm xe'))) };
  const x0 = sua || { xeId: tham.xe || (kho.xe[0] && kho.xe[0].id) || '', kind: tham.kind || 'dang-kiem', ten: '', han: '', chuKyThang: null, chuKyKm: null, ngayLanCuoi: '', kmLanCuoi: null, ghiChu: '' };
  const el = h('div', {});
  el.append(h('h1', { class: 'h1' }, sua ? sua.ten : 'Thêm mục nhắc'));

  const xeHienTai = () => xeCua(selXe.value);
  const selXe = h('select', { id: 'h-xe' }, h('option', { value: '' }, 'Không gắn xe (ví dụ giấy phép lái xe)'), kho.xe.map((x) => h('option', { value: x.id, selected: x.id === x0.xeId }, tenXe(x))));
  const selKind = h('select', { id: 'h-kind' }, LOAI_HEN.map((k) => h('option', { value: k.id, selected: k.id === x0.kind }, k.ten)));
  const inTen = h('input', { type: 'text', id: 'h-ten', value: x0.ten, maxlength: 80, placeholder: 'Tên mục nhắc' });
  const inHan = h('input', { type: 'date', id: 'h-han', value: x0.han || '' });
  const inCKT = h('input', { type: 'text', inputmode: 'numeric', id: 'h-ckt', value: x0.chuKyThang || '', placeholder: 'Ví dụ 6' });
  const inCKK = h('input', { type: 'text', inputmode: 'numeric', id: 'h-ckk', value: x0.chuKyKm ? soKm(x0.chuKyKm) : '', placeholder: 'Ví dụ 5.000' });
  const inLC = h('input', { type: 'date', id: 'h-lc', value: x0.ngayLanCuoi || '', max: hom() });
  const inKmLC = h('input', { type: 'text', inputmode: 'numeric', id: 'h-kmlc', value: x0.kmLanCuoi !== null && x0.kmLanCuoi !== undefined ? soKm(x0.kmLanCuoi) : '' });
  const inGhi = h('textarea', { id: 'h-ghi', maxlength: 300 }, x0.ghiChu || '');
  const fKind = truong('Loại', selKind); const fTen = truong('Tên', inTen);
  const fHan = truong('Hạn (ngày)', inHan);
  const ghiChuRule = h('div', { class: 'banner', style: 'margin-bottom:14px' });
  const khoiDinhKy = h('div', {},
    h('div', { class: 'two' }, truong('Lặp lại sau (tháng)', inCKT), truong('Hoặc sau (km)', inCKK)),
    h('div', { class: 'two' }, truong('Lần làm gần nhất', inLC), truong('Số km lần đó', inKmLC)),
    h('p', { class: 'sub', style: 'margin-bottom:12px' }, 'Hạn sẽ tính theo ngày hoặc km, cái nào đến trước.'));
  const kinhNgay = () => (LOAI_HEN.find((k) => k.id === selKind.value) || {}).loai === 'ngay';
  function capNhat() {
    const ngay = kinhNgay();
    fHan.hidden = !ngay; khoiDinhKy.hidden = ngay;
    const xe = xeHienTai();
    if (!sua && (!inTen.value || LOAI_HEN.some((k) => k.ten === inTen.value) || inTen.dataset.tuDat)) { inTen.value = selKind.value === 'dang-kiem' && xe && xe.loai === 'xemay' ? 'Kiểm định khí thải' : tenKind(selKind.value); inTen.dataset.tuDat = '1'; }
    ghiChuRule.hidden = true;
    if (selKind.value === 'dang-kiem' && xe) {
      ghiChuRule.hidden = false;
      const r = chuKyDangKiem(xe, { ngay: hom(), lanDau: false });
      if (xe.loai === 'xemay') {
        const moc = xe.khuVuc ? MOC_KHI_THAI[xe.khuVuc] : null;
        const batDau = moc ? `Với khu vực của bạn (${moc.ten}), nghĩa vụ này bắt đầu từ ${dinhDang(moc.ngay)} (Quyết định 13/2026/QĐ-TTg).` : 'Nghĩa vụ này bắt đầu từ 01/07/2027 (Hà Nội, TP. Hồ Chí Minh), 01/07/2028 (thành phố trực thuộc trung ương khác), 01/07/2030 (tỉnh còn lại). Chọn khu vực trong phần sửa thông tin xe.';
        ghiChuRule.textContent = `Xe máy chưa phải kiểm định cho đến khi nghĩa vụ khí thải bắt đầu. ${batDau}${r.thang ? ` Sau khi bắt đầu, chu kỳ dự kiến của xe này là ${r.thang} tháng (chưa đối chiếu nguyên văn).` : ''} Chỉ đặt nhắc nếu bạn muốn tự nhắc sớm.`;
      } else {
        ghiChuRule.textContent = r.thang ? `Chu kỳ hiện hành cho xe này: ${r.thang} tháng. ${r.ghiChu}${r.xacMinh ? '' : ' (chưa xác minh)'}` : r.ghiChu;
      }
      ghiChuRule.textContent += ` ${LUU_Y_HAN}`;
    }
    if (selKind.value === 'gplx') { ghiChuRule.hidden = false; ghiChuRule.textContent = 'Hạng A1, A, B1: không thời hạn. Hạng B, C1: 10 năm. Hạng C, D và các hạng có rơ moóc: 5 năm kể từ ngày cấp (Luật Trật tự, an toàn giao thông đường bộ 2024). Thẻ cấp trước đây dùng đến hết hạn ghi trên thẻ. Hãy nhập hạn ghi trên thẻ của bạn.'; }
    if (selKind.value === 'tnds') { ghiChuRule.hidden = false; ghiChuRule.textContent = 'Bảo hiểm trách nhiệm dân sự bắt buộc: thời hạn tối thiểu 1 năm, tối đa 3 năm (Nghị định 67/2023/NĐ-CP). Ngày hết hạn ghi trên giấy chứng nhận. Nhớ so sánh nhiều nơi trước khi mua vật chất tự nguyện.'; }
  }
  selKind.addEventListener('change', () => { delete inTen.dataset.tuDat; if (!sua) inTen.value = ''; capNhat(); });
  selXe.addEventListener('change', capNhat);
  const form = h('form', { novalidate: true },
    truong('Xe', selXe), fKind, fTen, ghiChuRule, fHan, khoiDinhKy, truong('Ghi chú', inGhi),
    h('button', { class: 'btn block', type: 'submit' }, sua ? 'Lưu thay đổi' : 'Lưu mục nhắc'));
  capNhat();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ngay = kinhNgay();
    const ckt = inCKT.value.trim() ? docSo(inCKT.value) : null;
    const ckk = inCKK.value.trim() ? docSo(inCKK.value.replace(/\./g, '')) : null;
    const kmlc = inKmLC.value.trim() ? docSo(inKmLC.value.replace(/\./g, '')) : null;
    let loi = false; const bao = (f, m) => { baoLoi(f, m); if (m) loi = true; };
    bao(fTen, !inTen.value.trim() ? 'Hãy đặt tên cho mục nhắc.' : '');
    bao(fHan, ngay && inHan.value && !laIso(inHan.value) ? 'Ngày chưa đúng.' : '');
    if (!ngay) {
      const f2 = inCKT.closest('.field');
      bao(f2, (ckt !== null && (Number.isNaN(ckt) || ckt <= 0)) || (ckk !== null && (Number.isNaN(ckk) || ckk <= 0)) ? 'Chu kỳ phải là số lớn hơn 0.' : '');
      if (!loi && ckt === null && ckk === null) bao(f2, 'Hãy nhập chu kỳ theo tháng hoặc theo km.');
    }
    if (loi) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const truoc = sua ? { ...sua } : null;
    const hen = await luuHen({
      ...(sua || {}), id: sua ? sua.id : undefined, xeId: selXe.value, kind: selKind.value, ten: inTen.value,
      han: ngay ? inHan.value : '', chuKyThang: ngay ? null : ckt, chuKyKm: ngay ? null : ckk,
      ngayLanCuoi: ngay ? '' : inLC.value, kmLanCuoi: ngay ? null : kmlc, ghiChu: inGhi.value,
    });
    toast(sua ? 'Đã lưu mục nhắc' : 'Đã thêm mục nhắc', { hoanTac: async () => { if (truoc) await luuHen(truoc); else await xoaHen(hen.id); app.render(); } });
    app.di(hen.xeId ? `#/xe/${hen.xeId}` : '#/');
  });

  if (sua) {
    const xe = sua.xeId ? xeCua(sua.xeId) : null;
    const tt = tatCaHen().find((x) => x.hen.id === sua.id).tt;
    el.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'item' }, h('span', { class: 'ic' }, iconHen(sua.kind))), h('div', { class: 'grow' },
        h('div', { class: 't', style: 'font-weight:700' }, tenKind(sua.kind)), h('div', { class: 'sub' }, xe ? tenXe(xe) : 'Không gắn xe'), tt.han ? h('div', { class: 'sub' }, `Hạn ${dinhDang(tt.han)}`) : null),
        the(tt.mau, tt.nhan)),
      h('div', { class: 'row wrap', style: 'margin-top:12px' },
        h('button', { class: 'btn', type: 'button', onclick: () => { document.getElementById('gia-han').hidden = false; document.getElementById('gia-han').scrollIntoView({ block: 'center' }); document.getElementById('gh-ngay')?.focus(); } }, icon('check'), kinhNgayCua(sua) ? 'Đã gia hạn' : 'Đã làm xong'),
        tt.han ? h('button', { class: 'btn sec', type: 'button', onclick: () => icsMotHen(sua.id) }, icon('cal'), 'Tải vào lịch (.ics)') : null)));
    el.append(giaHan(sua, xe));
  }
  el.append(h('div', { class: 'card' }, form));
  if (sua) el.append(h('button', { class: 'btn bad block', type: 'button', onclick: async () => {
    const ok = await hoi({ tieuDe: 'Xóa mục nhắc?', noiDung: `Xóa "${sua.ten}". Bạn có thể hoàn tác ngay sau đó.`, ok: 'Xóa', nguyHiem: true });
    if (!ok) return;
    const snap = await xoaHen(sua.id);
    toast('Đã xóa mục nhắc', { hoanTac: async () => { await khoiPhuc(snap); app.render(); } });
    app.di(sua.xeId ? `#/xe/${sua.xeId}` : '#/');
  } }, icon('trash'), 'Xóa mục nhắc'));
  return { tieuDe: 'Nhắc hạn', quayVe: sua && sua.xeId ? `#/xe/${sua.xeId}` : '#/', el };
}
const kinhNgayCua = (hen) => (LOAI_HEN.find((k) => k.id === hen.kind) || {}).loai === 'ngay';

function giaHan(hen, xe) {
  const ngay = kinhNgayCua(hen);
  const box = h('section', { class: 'card', id: 'gia-han', hidden: true, 'aria-label': ngay ? 'Gia hạn' : 'Ghi đã làm xong' });
  const inNgay = h('input', { type: 'date', id: 'gh-ngay', value: hom(), max: hom() });
  const inHan = h('input', { type: 'date', id: 'gh-han', value: '' });
  const chkDau = h('input', { type: 'checkbox', id: 'gh-dau' });
  const inKm = h('input', { type: 'text', inputmode: 'numeric', id: 'gh-km', value: xe && xe.km !== null ? soKm(xe.km) : '' });
  const inTien = h('input', { type: 'text', inputmode: 'decimal', id: 'gh-tien', placeholder: 'Không bắt buộc' });
  const goiY = h('div', { class: 'hint', 'aria-live': 'polite' });
  const fNgay = truong(hen.kind === 'dang-kiem' ? 'Ngày kiểm định' : hen.kind === 'gplx' ? 'Ngày cấp thẻ mới' : ngay ? 'Ngày gia hạn' : 'Ngày làm', inNgay);
  const fHan = truong('Hạn mới', inHan, '');
  const selHang = h('select', { id: 'gh-hang' }, ['B', 'C1', 'C', 'D1', 'D2', 'D', 'BE', 'A1', 'A', 'B1'].map((x) => h('option', { value: x }, `Hạng ${x}`)));
  selHang.addEventListener('change', () => tinh());
  function tinh() {
    if (!ngay) return;
    let han = '';
    if (hen.kind === 'dang-kiem' && xe) {
      const r = chuKyDangKiem(xe, { ngay: inNgay.value || hom(), lanDau: chkDau.checked });
      if (r.thang && laIso(inNgay.value)) { han = hanKiemDinh(inNgay.value, r.thang); goiY.textContent = `Chu kỳ ${r.thang} tháng${r.xacMinh ? '' : ' (chưa xác minh)'}. Hạn gợi ý ${dinhDang(han)}. ${LUU_Y_HAN}`; }
      else goiY.textContent = `${r.ghiChu} ${LUU_Y_HAN}`;
    } else if (hen.kind === 'gplx') {
      const th = thoiHanGPLX(selHang.value);
      if (th && th.nam && laIso(inNgay.value)) { han = addMonths(inNgay.value, th.nam * 12); goiY.textContent = `${th.ghiChu} Hạn gợi ý ${dinhDang(han)}, hãy đối chiếu với thẻ mới.`; }
      else goiY.textContent = th ? `${th.ghiChu} Không cần đặt nhắc hạn cho hạng này.` : 'Hãy nhập hạn ghi trên thẻ.';
    } else {
      const thang = hen.kind === 'tra-gop' ? 1 : 12;
      const goc = hen.han && hen.han > hom() ? hen.han : (laIso(inNgay.value) ? inNgay.value : hom());
      han = addMonths(goc, thang);
      goiY.textContent = `Gợi ý cộng ${thang} tháng. Sửa lại theo giấy tờ mới nhận.`;
    }
    inHan.value = han;
  }
  inNgay.addEventListener('change', tinh); chkDau.addEventListener('change', tinh);
  const nutXong = h('button', { class: 'btn block', type: 'submit' }, 'Xác nhận');
  const dauRow = hen.kind === 'dang-kiem' && xe && xe.loai !== 'xemay' ? h('label', { class: 'check', for: 'gh-dau' }, chkDau, 'Đây là lần kiểm định đầu của xe mới') : null;
  const form = h('form', { novalidate: true }, ngay ? [hen.kind === 'gplx' ? truong('Hạng giấy phép lái xe mới', selHang) : null, fNgay, dauRow, fHan, goiY, truong('Chi phí (không bắt buộc, sẽ ghi vào nhật ký)', inTien)] : [fNgay, truong('Số km lúc làm', inKm), truong('Chi phí (không bắt buộc, sẽ ghi vào nhật ký)', inTien)], nutXong);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!laIso(inNgay.value)) { baoLoi(fNgay, 'Hãy chọn ngày.'); return; }
    if (ngay && !laIso(inHan.value)) { baoLoi(fHan, 'Hãy nhập hạn mới.'); inHan.focus(); return; }
    const t = inTien.value.trim() ? docSo(inTien.value) : 0;
    if (Number.isNaN(t) || t < 0) { baoLoi(inTien.closest('.field'), 'Số tiền chưa đúng.'); return; }
    const truoc = { ...hen };
    const km = ngay ? null : (inKm.value.trim() ? docSo(inKm.value.replace(/\./g, '')) : null);
    if (km !== null && Number.isNaN(km)) { baoLoi(inKm.closest('.field'), 'Số km chưa đúng.'); return; }
    const moi = ngay ? { ...hen, han: inHan.value } : { ...hen, ngayLanCuoi: inNgay.value, kmLanCuoi: km !== null ? km : hen.kmLanCuoi };
    await luuHen(moi);
    let nk = null;
    if (t > 0 && hen.xeId) {
      const loai = ['bao-duong', 'dau', 'lop', 'ac-quy'].includes(hen.kind) ? 'bao-duong' : 'khac';
      nk = await luuNhatKy({ xeId: hen.xeId, loai, ngay: inNgay.value, tien: t, km, hangMuc: hen.ten, ghiChu: ngay ? `Gia hạn: ${hen.ten}` : '' }, hom());
    }
    toast(ngay ? 'Đã cập nhật hạn mới' : 'Đã ghi bảo dưỡng, hạn kế tiếp đã được tính lại', { hoanTac: async () => { await luuHen(truoc); if (nk) { const { xoaNhatKy } = await import('../lib/data.js'); await xoaNhatKy(nk.id); } app.render(); } });
    app.di(hen.xeId ? `#/xe/${hen.xeId}` : '#/');
  });
  if (ngay) tinh();
  box.append(h('h2', {}, ngay ? 'Gia hạn' : 'Ghi đã làm xong'), form);
  return box;
}
