// Sạc xe điện (9charge): buổi sạc, chi phí mỗi km so với xăng, không có bản đồ trạm.
import { h, icon, truong, baoLoi, trong, toast } from '../ui/dom.js';
import { app, hom, chonXe, soKm, laXeDien } from '../ui/common.js';
import { cauNhanh } from '../ui/formnk.js';
import { kho, xeCua, tenXe, datMeta } from '../lib/data.js';
import { tieuHao, soSanhDienXang, chiPhiMoiKm } from '../lib/fuel.js';
import { tien, dinhDangSo, docSo } from '../lib/money.js';
import { dinhDang, diffDays } from '../lib/dates.js';

const MAPS = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('trạm sạc xe điện gần đây');

export default function sac(tham = {}) {
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Sạc xe điện'));
  const xeDien = kho.xe.filter(laXeDien);
  const xe = (tham.xe && xeCua(tham.xe)) || xeDien[0] || kho.xe[0];
  if (!xe) {
    el.append(h('div', { class: 'card' }, trong('bolt', 'Chưa có xe', 'Thêm xe điện để ghi buổi sạc và so sánh chi phí với xăng.', h('a', { class: 'btn', href: '#/xe/moi' }, 'Thêm xe'))));
    return { tieuDe: 'Sạc xe điện', quayVe: '#/them', el };
  }
  el.append(h('p', { class: 'sub' }, 'Ghi buổi sạc, xem chi phí mỗi km và so với xe xăng. 9car không có bản đồ trạm sạc; dùng nút bên dưới để mở bản đồ tìm trạm gần bạn.'));
  if (kho.xe.length > 1) { const s = chonXe(xe.id, { onDoi: (v) => app.di(`#/sac?xe=${v}`) }); s.setAttribute('aria-label', 'Chọn xe'); el.append(h('div', { class: 'field', style: 'margin-top:12px' }, s)); }
  if (!laXeDien(xe)) el.append(h('div', { class: 'banner warn', style: 'margin:12px 0' }, `${tenXe(xe)} đang để loại nhiên liệu là ${xe.nhienLieu === 'diesel' ? 'diesel' : 'xăng'}. Muốn theo dõi sạc, hãy `, h('a', { href: `#/xe/${xe.id}/sua`, style: 'text-decoration:underline;font-weight:700' }, 'đổi sang xe điện'), '.'));

  el.append(h('a', { class: 'btn sec block', style: 'margin:12px 0', href: MAPS, target: '_blank', rel: 'noopener noreferrer' }, icon('map'), 'Tìm trạm sạc gần đây (Google Maps)'));

  const buoi = kho.nhatKy.filter((e) => e.xeId === xe.id && e.loai === 'sac').sort((a, b) => b.ngay.localeCompare(a.ngay));
  const th = tieuHao(buoi);
  const cp = chiPhiMoiKm(kho.nhatKy.filter((e) => e.xeId === xe.id), (e) => e.loai === 'sac');
  const gia = kho.meta.giaNangLuong || {};

  // So sánh
  const inDien = h('input', { type: 'text', inputmode: 'decimal', id: 'gia-dien', value: gia.dien ? dinhDangSo(gia.dien) : '', placeholder: 'Ví dụ 3.000' });
  const inXang = h('input', { type: 'text', inputmode: 'decimal', id: 'gia-xang', value: gia.xang ? dinhDangSo(gia.xang) : '', placeholder: 'Nhập giá bạn đang đổ' });
  const inL100 = h('input', { type: 'text', inputmode: 'decimal', id: 'xang-l100', value: gia.l100 ? dinhDangSo(gia.l100, 1) : '', placeholder: 'Ví dụ 7' });
  const kq = h('div', { 'aria-live': 'polite', 'data-testid': 'so-sanh' });
  const fD = truong('Giá điện bạn trả (đồng/kWh)', inDien); const fX = truong('Giá xăng (đồng/lít)', inXang); const fL = truong('Xe xăng tương đương uống (lít/100 km)', inL100);
  const gioKq = () => {
    const kwh100 = th.per100 !== null ? th.per100 : null;
    const r = soSanhDienXang({ kwh100, giaDien: docSo(inDien.value), l100: docSo(inL100.value), giaXang: docSo(inXang.value) });
    kq.replaceChildren(
      h('div', { class: 'stat' },
        h('div', {}, h('div', { class: 'n' }, r.dienMoiKm !== null ? `${dinhDangSo(Math.round(r.dienMoiKm))} đ` : '—'), h('div', { class: 'k' }, 'Xe điện, mỗi km')),
        h('div', {}, h('div', { class: 'n' }, r.xangMoiKm !== null ? `${dinhDangSo(Math.round(r.xangMoiKm))} đ` : '—'), h('div', { class: 'k' }, 'Xe xăng, mỗi km'))),
      r.tietKiem1000km !== null ? h('p', { style: 'margin-top:10px;font-weight:700' }, r.tietKiem1000km >= 0 ? `Mỗi 1.000 km xe điện rẻ hơn khoảng ${tien(r.tietKiem1000km)}.` : `Mỗi 1.000 km xe điện đắt hơn khoảng ${tien(-r.tietKiem1000km)}.`)
        : h('p', { class: 'sub', style: 'margin-top:10px' }, th.per100 === null ? 'Cần ít nhất hai buổi sạc đầy có ghi số km để biết xe uống bao nhiêu kWh/100 km.' : 'Nhập đủ ba ô giá và mức uống để so sánh.'));
  };
  [inDien, inXang, inL100].forEach((i) => i.addEventListener('input', gioKq));
  const cu = gia.ngay ? diffDays(gia.ngay, hom()) : null;
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const v = { dien: docSo(inDien.value), xang: docSo(inXang.value), l100: docSo(inL100.value) };
    for (const [k, i] of [['dien', inDien], ['xang', inXang], ['l100', inL100]]) if (i.value.trim() && (Number.isNaN(v[k]) || v[k] <= 0)) { baoLoi(i.closest('.field'), 'Số chưa đúng.'); i.focus(); return; }
    await datMeta('giaNangLuong', { dien: v.dien || null, xang: v.xang || null, l100: v.l100 || null, ngay: hom() });
    toast('Đã lưu giá, ghi ngày cập nhật hôm nay'); app.render();
  } }, fD, fX, fL,
  h('p', { class: 'sub', style: 'margin-bottom:10px', 'data-testid': 'ngay-gia' }, gia.ngay ? `Giá cập nhật ngày ${dinhDang(gia.ngay)}${cu > 60 ? `, đã ${cu} ngày. Hãy cập nhật lại giá.` : '.'}` : 'Chưa nhập giá. 9car không có sẵn giá điện, giá xăng: bạn nhập giá thực tế của mình để so sánh đúng.'),
  h('button', { class: 'btn sm', type: 'submit' }, 'Lưu giá'));
  gioKq();

  el.append(h('section', { class: 'card' }, h('h2', {}, 'Chi phí sạc so với xăng'),
    h('div', { class: 'stat', style: 'margin-bottom:12px' },
      h('div', {}, h('div', { class: 'n' }, th.per100 !== null ? dinhDangSo(th.per100, 1) : '—'), h('div', { class: 'k' }, 'kWh/100 km trung bình')),
      h('div', {}, h('div', { class: 'n' }, cp.moiKm !== null ? `${dinhDangSo(Math.round(cp.moiKm))} đ` : '—'), h('div', { class: 'k' }, 'Tiền sạc thực tế mỗi km'))),
    kq, h('div', { style: 'margin-top:14px' }, form)));

  el.append(cauNhanh({ xeId: xe.id }));
  const c = h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0' }, `Buổi sạc (${buoi.length})`), h('a', { class: 'btn sm', href: `#/nhat-ky/moi?xe=${xe.id}&loai=sac` }, icon('plus'), 'Ghi buổi sạc')));
  if (!buoi.length) c.append(h('p', { class: 'sub', style: 'margin-top:8px' }, 'Chưa có buổi sạc nào.'));
  buoi.slice(0, 20).forEach((e) => c.append(h('a', { class: 'item', href: `#/nhat-ky/${e.id}` }, h('span', { class: 'ic' }, icon('bolt')),
    h('span', { class: 'grow' }, h('div', { class: 't' }, e.noi || 'Buổi sạc'), h('div', { class: 'd' }, [dinhDang(e.ngay), e.luong ? `${dinhDangSo(e.luong, 1)} kWh` : '', e.phut ? `${e.phut} phút` : '', e.km !== null ? `${soKm(e.km)} km` : ''].filter(Boolean).join(' · '))), h('b', {}, e.tien ? tien(e.tien) : ''))));
  el.append(c);
  return { tieuDe: 'Sạc xe điện', quayVe: '#/them', el };
}
