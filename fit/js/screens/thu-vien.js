// Thư viện bài tập: tìm không dấu, lọc, trang chi tiết có sơ đồ nhóm cơ.
import { h, xoa, chips, toast } from '../ui/dom.js';
import { BAI_TAP, BAI_THEO_ID } from '../data/exercises.js';
import { NHOM, DUNG_CU, LOAI, MUC, MON, TAI_NHA, moTaDem } from '../data/ex-base.js';
import { khoaTim, khop } from '../lib/text.js';
import { hangBai, nhomChu, trangRong } from '../ui/common.js';
import { bodyMap, BIEU_TUONG } from '../ui/bodymap.js';
import { svg } from '../ui/dom.js';
import { lichSuBai, tinhPR } from '../lib/calc.js';
import * as S from '../lib/store.js';
import { themVaoNhap } from './tap-ghi.js';
import { soVN } from '../lib/text.js';
import { choPhepBai } from '../lib/an-toan.js';

const KHOA = new Map(BAI_TAP.map((b) => [b.id, khoaTim(`${b.ten} ${nhomChu(b)} ${b.nhomPhu.map((n) => NHOM[n]).join(' ')} ${b.dungCu.map((d) => DUNG_CU[d]).join(' ')} ${LOAI[b.loai]} ${b.mon.map((m) => MON[m]).join(' ')}`)]));
const loc = { q: '', nhom: '', dungCu: '', muc: '', mon: '', loai: '', taiNha: false, soHien: 40 };

export function locBai(l) {
  return BAI_TAP.filter((b) => {
    if (l.q && !khop(KHOA.get(b.id), l.q)) return false;
    if (l.nhom && !(b.nhomChinh.includes(l.nhom) || b.nhomPhu.includes(l.nhom))) return false;
    if (l.dungCu && !b.dungCu.includes(l.dungCu)) return false;
    if (l.muc && String(b.mucDo) !== String(l.muc)) return false;
    if (l.mon && !b.mon.includes(l.mon)) return false;
    if (l.loai && b.loai !== l.loai) return false;
    if (l.taiNha && !(b.dungCu.includes('khong') || b.dungCu.every((d) => TAI_NHA.includes(d)))) return false;
    return true;
  });
}

function chon(nhan, muc, gia, khiDoi, id) {
  const sel = h('select', { id, 'data-testid': id }, h('option', { value: '' }, 'Tất cả'), ...muc.map(([v, t]) => h('option', { value: v }, t)));
  sel.value = gia;
  sel.addEventListener('change', () => khiDoi(sel.value));
  return h('div', { class: 'field' }, h('label', { for: id }, nhan), sel);
}

function danhSach(root, ctx) {
  const ketQua = h('div', { class: 'card tight' });
  const dem = h('div', { class: 'sub', 'aria-live': 'polite', 'data-testid': 'lib-count' });
  const ve = () => {
    const ds = locBai(loc);
    dem.textContent = `${ds.length} bài`;
    xoa(ketQua);
    if (!ds.length) { ketQua.append(trangRong('Không có bài nào khớp', 'Thử bỏ bớt bộ lọc hoặc gõ từ khác.', h('button', { type: 'button', class: 'btn sm', onclick: () => { Object.assign(loc, { q: '', nhom: '', dungCu: '', muc: '', mon: '', loai: '', taiNha: false }); ctx.veLai(); } }, 'Xóa bộ lọc'))); return; }
    const ul = h('ul', { class: 'list' });
    ds.slice(0, loc.soHien).forEach((b) => ul.append(h('li', {}, hangBai(b))));
    ketQua.append(ul);
    if (ds.length > loc.soHien) ketQua.append(h('button', { type: 'button', class: 'btn ghost block mt', 'data-testid': 'lib-more', onclick: () => { loc.soHien += 40; ve(); } }, `Hiện thêm (còn ${ds.length - loc.soHien})`));
  };
  const o = h('input', { type: 'search', class: 'search', id: 'lib-q', 'aria-label': 'Tìm bài tập', placeholder: 'Tìm bài: squat, vai, dây kháng lực...', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', value: loc.q });
  o.addEventListener('input', () => { loc.q = o.value; loc.soHien = 40; ve(); });
  const lanDoi = (k) => (v) => { loc[k] = v; loc.soHien = 40; ve(); };
  root.append(
    h('section', { class: 'hero' }, h('h1', {}, 'Thư viện bài tập'), h('p', {}, `${BAI_TAP.length} bài tiếng Việt do 9fit tự biên soạn, kèm sơ đồ nhóm cơ.`)),
    o,
    h('div', { class: 'row wrap' }, chips([{ v: '1', t: 'Tại nhà, không dụng cụ' }], loc.taiNha ? '1' : '', (v) => { loc.taiNha = !loc.taiNha; loc.soHien = 40; ve(); const b = root.querySelector('[data-v="1"]'); if (b) b.setAttribute('aria-pressed', String(loc.taiNha)); }, 'Bộ lọc nhanh')),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Môn' }, ...[['', 'Mọi môn'], ...Object.entries(MON)].map(([v, t]) => h('button', {
      type: 'button', class: 'chip', 'data-mon': v, 'aria-pressed': String(loc.mon === v), onclick: (e) => { loc.mon = v; loc.soHien = 40; for (const c of e.currentTarget.parentNode.children) c.setAttribute('aria-pressed', String(c.dataset.mon === v)); ve(); },
    }, t))),
    h('details', { class: 'card tight', open: !!(loc.nhom || loc.dungCu || loc.muc || loc.loai) },
      h('summary', { class: 'lnk' }, 'Thêm bộ lọc: nhóm cơ, dụng cụ, mức độ, loại'),
      h('div', { class: 'grid2 mt' },
        chon('Nhóm cơ', Object.entries(NHOM), loc.nhom, lanDoi('nhom'), 'f-nhom'),
        chon('Dụng cụ', Object.entries(DUNG_CU), loc.dungCu, lanDoi('dungCu'), 'f-dungcu'),
        chon('Mức độ', Object.entries(MUC), loc.muc, lanDoi('muc'), 'f-muc'),
        chon('Loại bài', Object.entries(LOAI), loc.loai, lanDoi('loai'), 'f-loai'))),
    dem, ketQua,
    h('div', { class: 'note' }, 'Sơ đồ nhóm cơ do 9fit tự vẽ. Video hướng dẫn tự quay sẽ được bổ sung sau. Mọi bài chỉ mang tính tham khảo, xem mục an toàn trong Thêm.'));
  ve();
}

function chiTiet(root, ctx, id) {
  const b = BAI_THEO_ID.get(id);
  if (!b) {
    ctx.datTieuDe('Không tìm thấy bài');
    root.append(trangRong('Không tìm thấy bài tập này', 'Có thể liên kết đã cũ.', h('a', { class: 'btn', href: '#/thu-vien' }, 'Về thư viện')));
    return;
  }
  ctx.datTieuDe(b.ten);
  const ls = tinhPR(lichSuBai(S.dsBuoi(), id));
  const prDong = [];
  if (ls.kg) prDong.push(`Mức tạ cao nhất: ${soVN(ls.kg.kg, 2)} kg × ${ls.kg.lan} lần`);
  if (ls.lan) prDong.push(`Nhiều lần nhất (không tạ): ${ls.lan.lan} lần`);
  if (ls.giay) prDong.push(`Giữ lâu nhất: ${ls.giay.giay} giây`);
  const tag = (t, cls = '') => h('span', { class: `tag ${cls}` }, t);
  root.append(
    h('a', { class: 'lnk', href: '#/thu-vien' }, '‹ Thư viện'),
    h('section', { class: 'hero' }, h('h1', {}, b.ten), h('p', {}, `${nhomChu(b)}${b.nhomPhu.length ? ` (phụ: ${b.nhomPhu.map((n) => NHOM[n]).join(', ')})` : ''}`)),
    h('div', { class: 'big-map' }, bodyMap(b.nhomChinh, b.nhomPhu)),
    h('div', { class: 'tags' },
      h('span', { class: 'tag g' }, svg(BIEU_TUONG[b.loai] || BIEU_TUONG['suc-manh']), LOAI[b.loai]),
      tag(`Mức: ${MUC[b.mucDo]}`),
      ...b.dungCu.map((d) => tag(DUNG_CU[d])),
      ...b.mon.map((m) => tag(MON[m], 'g'))),
    h('div', { class: 'card' }, h('h2', {}, 'Cách đếm gợi ý'), h('p', { 'data-testid': 'cach-dem' }, moTaDem(b.dem))),
    h('div', { class: 'card' }, h('h2', {}, 'Các bước thực hiện'), h('ol', { class: 'steps' }, ...b.buoc.map((s) => h('li', {}, s)))),
    h('div', { class: 'card' }, h('h2', {}, 'Lỗi thường gặp'), h('ul', { class: 'bul' }, ...b.loi.map((s) => h('li', {}, s)))),
    h('div', { class: 'card' }, h('h2', {}, 'Biến thể'),
      h('p', {}, h('b', {}, 'Dễ hơn: '), b.de, b.deId ? [' ', h('a', { href: `#/thu-vien/${b.deId}` }, `(xem: ${BAI_THEO_ID.get(b.deId).ten})`)] : ''),
      h('p', {}, h('b', {}, 'Khó hơn: '), b.kho, b.khoId ? [' ', h('a', { href: `#/thu-vien/${b.khoId}` }, `(xem: ${BAI_THEO_ID.get(b.khoId).ten})`)] : '')),
    h('div', { class: 'note warn' }, h('b', {}, 'An toàn: '), b.luuY, ' Dừng ngay nếu đau nhói, chóng mặt hoặc khó thở.'),
    prDong.length ? h('div', { class: 'card hl' }, h('h2', {}, 'Kỷ lục của bạn'), h('ul', { class: 'bul' }, ...prDong.map((s) => h('li', {}, s)))) : null,
    (() => { const kt = choPhepBai(S.trangThaiSangLoc(), b); return kt.ok ? null : h('div', { class: 'note warn', 'data-testid': 'bai-han-che' }, kt.ly); })(),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn grow', 'data-testid': 'them-vao-buoi', onclick: () => { const kq = themVaoNhap(b.id); toast(kq.ok ? 'Đã thêm vào buổi đang ghi.' : kq.ly); } }, 'Thêm vào buổi tập'),
      h('a', { class: 'btn ghost grow', href: '#/tap/ghi' }, 'Mở buổi đang ghi')));
}

export default function thuVien(ctx) {
  const id = ctx.parts[0];
  if (id) chiTiet(ctx.root, ctx, id);
  else { ctx.datTieuDe('Thư viện'); danhSach(ctx.root, ctx); }
}
