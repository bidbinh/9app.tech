// Chi phí: biểu đồ theo tháng và hạng mục, chi phí mỗi km, tổng chi phí sở hữu.
import { h, icon, trong } from '../ui/dom.js';
import { app, hom, chonXe } from '../ui/common.js';
import { bieuDoCot, bangThang, thanhNgang } from '../ui/chart.js';
import { kho, xeCua } from '../lib/data.js';
import { thongKeThang, theoNhom, chiPhiMoiKm, tongChiPhiSoHuu, tieuHao, tongTien } from '../lib/fuel.js';
import { tien, tienOHep, dinhDangSo } from '../lib/money.js';
import { dinhDang, addMonths } from '../lib/dates.js';

export default function chiPhi(tham = {}) {
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Chi phí'));
  if (!kho.xe.length) {
    el.append(h('div', { class: 'card' }, trong('chart', 'Chưa có số liệu', 'Thêm xe và ghi vài khoản chi để xem biểu đồ.', h('a', { class: 'btn', href: '#/xe/moi' }, 'Thêm xe'))));
    return { tieuDe: 'Chi phí', el };
  }
  const xeId = tham.xe && xeCua(tham.xe) ? tham.xe : '';
  const kyHan = tham.ky === 'tat' ? 'tat' : '12';
  const dich = (xe, ky) => `#/chi-phi?${new URLSearchParams({ ...(xe ? { xe } : {}), ...(ky === 'tat' ? { ky } : {}) })}`;
  if (kho.xe.length > 1) { const sel = chonXe(xeId, { them: 'Tất cả xe', onDoi: (v) => app.di(dich(v, kyHan)) }); sel.setAttribute('aria-label', 'Chọn xe'); el.append(h('div', { class: 'field' }, sel)); }
  el.append(h('div', { class: 'chips', role: 'group', 'aria-label': 'Khoảng thời gian' },
    [['12', '12 tháng gần nhất'], ['tat', 'Tất cả']].map(([k, v]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === kyHan), onclick: () => app.di(dich(xeId, k)) }, v))));

  const tatCa = kho.nhatKy.filter((e) => !xeId || e.xeId === xeId);
  const tu = kyHan === '12' ? addMonths(hom().slice(0, 7) + '-01', -11) : '';
  const trongKy = tatCa.filter((e) => !tu || e.ngay >= tu);
  const tong = tongTien(trongKy);
  if (!tatCa.length) {
    el.append(h('div', { class: 'card', style: 'margin-top:12px' }, trong('chart', 'Chưa có khoản chi nào', 'Ghi đổ xăng, sạc hoặc bảo dưỡng ở màn Hôm nay hoặc Nhật ký.', h('a', { class: 'btn', href: '#/nhat-ky/moi' }, icon('plus'), 'Ghi khoản đầu tiên'))));
    return { tieuDe: 'Chi phí', el };
  }
  const nThang = kyHan === '12' ? 12 : Math.min(24, Math.max(3, Math.ceil((new Date(hom()) - new Date(tatCa.map((e) => e.ngay).sort()[0])) / (30.4375 * 86400000)) + 1));
  const thang = thongKeThang(trongKy, hom(), nThang);
  const soThangCoSo = Math.max(1, thang.filter((t) => t.tong > 0).length);
  const cp = chiPhiMoiKm(tatCa);
  const ten = xeId ? xeCua(xeId) : null;

  el.append(h('div', { class: 'card', style: 'margin-top:12px' },
    h('div', { class: 'stat' },
      h('div', {}, h('div', { class: 'n', 'data-testid': 'tong-chi' }, tien(tong)), h('div', { class: 'k' }, kyHan === '12' ? 'Tổng 12 tháng qua' : 'Tổng cộng')),
      h('div', {}, h('div', { class: 'n' }, tien(tong / (kyHan === '12' ? 12 : Math.max(1, nThang)))), h('div', { class: 'k' }, 'Trung bình mỗi tháng')),
      h('div', {}, h('div', { class: 'n' }, cp.moiKm !== null ? `${dinhDangSo(Math.round(cp.moiKm))} đ` : '—'), h('div', { class: 'k' }, 'Chi phí mỗi km')),
      h('div', {}, h('div', { class: 'n' }, cp.km ? `${dinhDangSo(cp.km)} km` : '—'), h('div', { class: 'k' }, 'Quãng đường đã ghi'))),
    cp.moiKm === null ? h('p', { class: 'sub', style: 'margin-top:8px' }, 'Chi phí mỗi km cần ít nhất hai khoản có ghi số km đồng hồ.') : null));

  el.append(h('section', { class: 'card', 'aria-label': 'Chi phí theo tháng' }, h('h2', {}, 'Theo tháng'), bieuDoCot(thang), bangThang(thang)));
  const nhom = theoNhom(trongKy);
  el.append(h('section', { class: 'card', 'aria-label': 'Chi phí theo hạng mục' }, h('h2', {}, 'Theo hạng mục'), nhom.length ? thanhNgang(nhom) : h('p', { class: 'sub' }, 'Chưa có khoản nào trong khoảng này.')));

  if (xeId) {
    const t = tongChiPhiSoHuu(ten, tatCa, hom());
    el.append(h('section', { class: 'card', 'aria-label': 'Tổng chi phí sở hữu' }, h('h2', {}, 'Tổng chi phí sở hữu'),
      h('div', { class: 'stat' },
        h('div', {}, h('div', { class: 'n' }, tienOHep(t.vanHanh)), h('div', { class: 'k' }, 'Chi vận hành đã ghi')),
        h('div', {}, h('div', { class: 'n' }, t.moiThang !== null ? tien(t.moiThang) : '—'), h('div', { class: 'k' }, `Mỗi tháng${t.thang ? ` (${t.thang} tháng)` : ''}`)),
        h('div', {}, h('div', { class: 'n' }, t.giaMua ? tienOHep(t.giaMua) : '—'), h('div', { class: 'k' }, 'Giá mua')),
        h('div', {}, h('div', { class: 'n' }, t.tatCa ? tienOHep(t.tatCa) : '—'), h('div', { class: 'k' }, 'Tổng gồm giá mua'))),
      h('p', { class: 'sub', style: 'margin-top:8px' }, t.giaMua ? 'Chưa trừ giá bán lại khi bạn bán xe.' : 'Nhập giá mua trong phần sửa thông tin xe để xem tổng gồm giá mua.')));
  }
  return { tieuDe: 'Chi phí', el };
}
