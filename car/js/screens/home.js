// Màn Hôm nay: hạn sắp tới (xanh/vàng/đỏ) và ghi nhanh xăng, sạc.
import { h, icon, trong } from '../ui/dom.js';
import { app, hom, tatCaHen, dongHen } from '../ui/common.js';
import { cauNhanh } from '../ui/formnk.js';
import { kho } from '../lib/data.js';
import { diffDays, parse } from '../lib/dates.js';
import { tenXe } from '../lib/data.js';
import { TEN_MAU } from '../lib/schedule.js';

const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export default function home() {
  const ngay = hom();
  const d = parse(ngay);
  const el = h('div', {});
  el.append(h('h1', { class: 'h1' }, 'Hôm nay'), h('p', { class: 'sub' }, `${THU[d.getDay()]}, ${ngay.slice(8, 10)}/${ngay.slice(5, 7)}/${ngay.slice(0, 4)}`));

  if (kho.luuTru === 'tam') {
    el.append(h('div', { class: 'banner bad', style: 'margin-top:12px', role: 'alert' }, 'Trình duyệt đang chặn lưu dữ liệu trên máy (có thể do chế độ riêng tư). Dữ liệu sẽ mất khi đóng trang. Hãy tải bản sao lưu ở mục Dữ liệu của tôi.'));
  }
  if (!kho.xe.length) {
    el.append(h('div', { class: 'card', style: 'margin-top:14px' }, trong('car', 'Thêm chiếc xe đầu tiên',
      'Nhập biển số và vài thông tin cơ bản. 9car sẽ nhắc đăng kiểm, bảo hiểm, bảo dưỡng và ghi chi phí xăng, sạc. Dữ liệu chỉ nằm trên máy của bạn.',
      h('a', { class: 'btn', href: '#/xe/moi' }, icon('plus'), 'Thêm xe'),
      h('a', { class: 'btn sec', href: '#/du-lieu' }, icon('up'), 'Nhập bản sao lưu'))));
    return { tieuDe: 'Hôm nay', el };
  }
  const ds = tatCaHen(ngay);
  const nhom = { do: [], vang: [], xanh: [], xam: [] };
  ds.forEach((x) => nhom[x.tt.mau].push(x));

  const tong = h('div', { class: 'banner', style: 'margin-top:12px', 'data-testid': 'tong-quan' });
  if (nhom.do.length) { tong.className = 'banner bad'; tong.textContent = `${nhom.do.length} mục cần làm ngay` + (nhom.vang.length ? `, ${nhom.vang.length} mục sắp đến hạn.` : '.'); }
  else if (nhom.vang.length) { tong.className = 'banner warn'; tong.textContent = `${nhom.vang.length} mục sắp đến hạn trong 30 ngày tới.`; }
  else if (ds.length && nhom.xanh.length) tong.textContent = 'Mọi thứ còn xa hạn. Bạn không cần làm gì hôm nay.';
  else tong.textContent = 'Chưa có mục nhắc nào. Vào trang của xe để thiết lập đăng kiểm, bảo hiểm và bảo dưỡng.';
  el.append(tong);

  const homNayXong = kho.xe.length > 0 ? cauNhanh({ xeId: kho.xe[0].id }) : null;
  el.append(h('div', { style: 'margin-top:14px' }, homNayXong));

  for (const [mau, tieuDe, toiDa] of [['do', 'Cần làm ngay', 20], ['vang', 'Sắp đến hạn', 20], ['xanh', 'Còn xa', 5]]) {
    if (!nhom[mau].length) continue;
    const card = h('section', { class: 'card', 'aria-label': tieuDe });
    card.append(h('h2', {}, `${tieuDe} (${nhom[mau].length})`));
    nhom[mau].slice(0, toiDa).forEach((x) => card.append(dongHen(x, { hienXe: kho.xe.length > 1 })));
    if (nhom[mau].length > toiDa) card.append(h('details', {}, h('summary', {}, `Xem thêm ${nhom[mau].length - toiDa} mục`), ...nhom[mau].slice(toiDa).map((x) => dongHen(x, { hienXe: kho.xe.length > 1 }))));
    el.append(card);
  }
  if (nhom.xam.length) {
    el.append(h('section', { class: 'card', 'aria-label': TEN_MAU.xam },
      h('h2', {}, `Chưa đặt hạn (${nhom.xam.length})`),
      ...nhom.xam.slice(0, 4).map((x) => dongHen(x, { hienXe: kho.xe.length > 1 })),
      h('p', { class: 'sub' }, 'Mở từng mục để nhập hạn.')));
  }
  // nhắc cập nhật km
  for (const x of kho.xe) {
    const coKm = kho.hen.some((hh) => hh.xeId === x.id && hh.chuKyKm);
    if (coKm && x.kmNgay && diffDays(x.kmNgay, ngay) > 45) {
      el.append(h('div', { class: 'banner warn', style: 'margin-bottom:12px' },
        `Số km của ${tenXe(x)} cập nhật từ ${diffDays(x.kmNgay, ngay)} ngày trước. `, h('a', { href: `#/xe/${x.id}`, style: 'text-decoration:underline;font-weight:700' }, 'Cập nhật số km'), ' để nhắc bảo dưỡng chính xác.'));
    }
  }
  el.append(h('p', { class: 'sub' }, 'Hạn tính theo thông tin bạn nhập. Hãy đối chiếu với tem, giấy tờ thật. 9car không phải là tư vấn pháp lý, bảo hiểm hay tài chính.'));
  return { tieuDe: 'Hôm nay', el };
}
