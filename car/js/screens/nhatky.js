// Nhật ký: xăng, sạc, bảo dưỡng, sửa chữa, phí khác.
import { h, icon, trong } from '../ui/dom.js';
import { app, hom, soKm, chonXe } from '../ui/common.js';
import { formNhatKy } from '../ui/formnk.js';
import { kho, xeCua, tenXe } from '../lib/data.js';
import { tenLoai, nhomCua, tieuHao } from '../lib/fuel.js';
import { tien, dinhDangSo } from '../lib/money.js';
import { dinhDang } from '../lib/dates.js';

const BIEU_TUONG = { 'nhien-lieu': 'fuel', 'bao-duong': 'wrench', 'sua-chua': 'wrench', 'gui-xe': 'car', 'cau-duong': 'map', 'rua-xe': 'car', khac: 'list' };
const LOC = [['tat-ca', 'Tất cả'], ['nhien-lieu', 'Xăng, sạc'], ['bao', 'Bảo dưỡng, sửa'], ['phi', 'Phí khác']];
const khop = (loc, e) => {
  const g = nhomCua(e.loai);
  return loc === 'tat-ca' || (loc === 'nhien-lieu' && g === 'nhien-lieu') || (loc === 'bao' && (g === 'bao-duong' || g === 'sua-chua')) || (loc === 'phi' && ['gui-xe', 'cau-duong', 'rua-xe', 'khac'].includes(g));
};

export function danhSachNhatKy(tham = {}) {
  const el = h('div', {});
  el.append(h('div', { class: 'row' }, h('h1', { class: 'h1 grow' }, 'Nhật ký'), kho.xe.length ? h('a', { class: 'btn sm', href: `#/nhat-ky/moi${tham.xe ? `?xe=${tham.xe}` : ''}` }, icon('plus'), 'Ghi mới') : null));
  if (!kho.xe.length) {
    el.append(h('div', { class: 'card' }, trong('book', 'Chưa có xe', 'Thêm xe trước để ghi nhật ký đổ xăng, sạc và bảo dưỡng.', h('a', { class: 'btn', href: '#/xe/moi' }, 'Thêm xe'))));
    return { tieuDe: 'Nhật ký', el };
  }
  const xeId = tham.xe && xeCua(tham.xe) ? tham.xe : '';
  const loc = LOC.some(([k]) => k === tham.loc) ? tham.loc : 'tat-ca';
  const dich = (xe, l) => `#/nhat-ky?${new URLSearchParams({ ...(xe ? { xe } : {}), ...(l && l !== 'tat-ca' ? { loc: l } : {}) })}`;
  if (kho.xe.length > 1) {
    const sel = chonXe(xeId, { them: 'Tất cả xe', onDoi: (v) => app.di(dich(v, loc)) });
    sel.setAttribute('aria-label', 'Lọc theo xe');
    el.append(h('div', { class: 'field' }, sel));
  }
  el.append(h('div', { class: 'chips', role: 'group', 'aria-label': 'Lọc theo loại' }, LOC.map(([k, v]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === loc), onclick: () => app.di(dich(xeId, k)) }, v))));

  let ds = kho.nhatKy.filter((e) => (!xeId || e.xeId === xeId) && khop(loc, e)).sort((a, b) => b.ngay.localeCompare(a.ngay) || (b.km || 0) - (a.km || 0));
  if (xeId) {
    const xe = xeCua(xeId);
    const nl = xe.nhienLieu === 'dien' ? 'sac' : 'xang';
    const th = tieuHao(kho.nhatKy.filter((e) => e.xeId === xeId && e.loai === nl));
    el.append(h('div', { class: 'banner', style: 'margin:12px 0' }, th.per100 !== null
      ? `Tiêu hao trung bình ${dinhDangSo(th.per100, 1)} ${nl === 'sac' ? 'kWh' : 'lít'}/100 km (lần gần nhất ${dinhDangSo(th.gan, 1)}).`
      : th.canThem, ...th.canhBao.map((m) => ` ${m}`)));
  }
  if (!ds.length) {
    el.append(h('div', { class: 'card', style: 'margin-top:12px' }, trong('book', 'Chưa có khoản nào', 'Ghi lần đổ xăng, sạc hoặc bảo dưỡng đầu tiên. Bạn cũng có thể gõ hoặc nói ngay ở màn Hôm nay.',
      h('a', { class: 'btn', href: `#/nhat-ky/moi${xeId ? `?xe=${xeId}` : ''}` }, icon('plus'), 'Ghi khoản đầu tiên'))));
    return { tieuDe: 'Nhật ký', el };
  }
  let thang = ''; let card = null;
  for (const e of ds.slice(0, 300)) {
    const t = e.ngay.slice(0, 7);
    if (t !== thang) {
      thang = t;
      el.append(h('div', { class: 'sec-title' }, `Tháng ${t.slice(5)}/${t.slice(0, 4)}`));
      card = h('div', { class: 'card' }); el.append(card);
    }
    const xe = xeCua(e.xeId);
    const chiTiet = [dinhDang(e.ngay), e.luong ? `${dinhDangSo(e.luong, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1')} ${e.loai === 'sac' ? 'kWh' : 'lít'}` : '', e.km !== null ? `${soKm(e.km)} km` : '', e.noi, kho.xe.length > 1 ? tenXe(xe) : ''].filter(Boolean).join(' · ');
    card.append(h('a', { class: 'item', href: `#/nhat-ky/${e.id}` },
      h('span', { class: 'ic' }, icon(BIEU_TUONG[nhomCua(e.loai)] || 'list')),
      h('span', { class: 'grow' }, h('div', { class: 't' }, e.hangMuc ? `${tenLoai(e.loai)}: ${e.hangMuc}` : tenLoai(e.loai)), h('div', { class: 'd' }, chiTiet)),
      h('b', {}, e.tien ? tien(e.tien) : '')));
  }
  if (ds.length > 300) el.append(h('p', { class: 'sub' }, `Đang hiện 300 khoản mới nhất trong ${ds.length}.`));
  return { tieuDe: 'Nhật ký', el };
}

export function formMoi(tham = {}) {
  if (!kho.xe.length) return { tieuDe: 'Ghi nhật ký', quayVe: '#/nhat-ky', el: h('div', { class: 'card' }, trong('car', 'Cần thêm xe trước', '', h('a', { class: 'btn', href: '#/xe/moi' }, 'Thêm xe'))) };
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Ghi khoản mới'));
  const truocDien = {};
  for (const k of ['tien', 'luong', 'km']) if (tham[k] && !Number.isNaN(Number(tham[k]))) truocDien[k] = Number(tham[k]);
  if (tham.loai) truocDien.loai = tham.loai;
  const f = formNhatKy({ xeId: tham.xe, loai: tham.loai, truocDien, onXong: (e) => app.di(`#/nhat-ky?xe=${e.xeId}`) });
  el.append(h('div', { class: 'card' }, f));
  return { tieuDe: 'Ghi nhật ký', quayVe: '#/nhat-ky', el };
}
export function formSua(id) {
  const e = kho.nhatKy.find((x) => x.id === id);
  if (!e) return { tieuDe: 'Nhật ký', quayVe: '#/nhat-ky', el: h('div', { class: 'card' }, trong('alert', 'Không tìm thấy khoản này', 'Có thể đã bị xóa.', h('a', { class: 'btn', href: '#/nhat-ky' }, 'Về nhật ký'))) };
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Sửa khoản'));
  el.append(h('div', { class: 'card' }, formNhatKy({ nhatKy: e, onXong: () => app.di(`#/nhat-ky?xe=${e.xeId}`) })));
  return { tieuDe: 'Sửa khoản', quayVe: '#/nhat-ky', el };
}
