// Mục Tập: chương trình đang theo, ghi buổi tập, lịch sử, buổi chơi.
import { h, svg } from '../ui/dom.js';
import * as S from '../lib/store.js';
import { bannerAnToan } from '../ui/common.js';
import ghi from './tap-ghi.js';
import chuongTrinh, { khungKeHoach } from './tap-ct.js';
import lichSuVaChoi from './tap-ls.js';
import { ngayVN, hiepDaLam } from '../lib/calc.js';

const IC = {
  ghi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  ct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  ls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>',
  choi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5 7c4 1 8 5 9 12M19 7c-4 1-8 5-9 12"/></svg>',
};
const tile = (hash, ic, ten, mo, tid) => h('a', { class: 'tile', href: hash, 'data-testid': tid }, h('div', { class: 'ic' }, svg(IC[ic])), h('b', {}, ten), h('span', { class: 'd' }, mo));

export default function tap(ctx) {
  const [muc, id] = ctx.parts;
  if (muc === 'ghi') return ghi(ctx, id || null);
  if (muc === 'chuong-trinh') return chuongTrinh(ctx, id || null);
  if (muc === 'lich-su' || muc === 'choi') return lichSuVaChoi(ctx, muc, id || null);
  ctx.datTieuDe('Tập');
  const nhap = S.layNhap();
  const coNhap = nhap && nhap.bai.length;
  const kh = S.layKeHoach();
  const bn = bannerAnToan();
  const dsBuoi = S.dsBuoi();
  ctx.root.append(
    h('section', { class: 'hero' }, h('h1', {}, 'Tập'), h('p', {}, 'Theo chương trình hoặc ghi buổi tự do. Dữ liệu chỉ nằm trên máy bạn.')),
    bn,
    coNhap && S.trangThaiSangLoc() !== 'dung-lai' ? h('div', { class: 'card hl', 'data-testid': 'nhap-dang-ghi' },
      h('h2', {}, 'Buổi đang ghi dở'),
      h('p', {}, `${nhap.ten} · ${nhap.bai.length} bài · ${nhap.bai.reduce((a, e) => a + hiepDaLam(e.sets).length, 0)} hiệp đã làm (${ngayVN(nhap.ngay)})`),
      h('a', { class: 'btn', href: '#/tap/ghi', 'data-testid': 'tiep-tuc' }, 'Tiếp tục ghi')) : null,
    kh ? khungKeHoach(ctx, kh) : null,
    h('div', { class: 'tiles' },
      S.trangThaiSangLoc() === 'dung-lai' ? null : tile('#/tap/ghi', 'ghi', coNhap ? 'Mở buổi đang ghi' : 'Ghi buổi tập', 'Chọn bài, ghi hiệp, lần, mức tạ', 'o-ghi'),
      tile('#/tap/chuong-trinh', 'ct', 'Chương trình mẫu', 'Theo môn và mục tiêu, 2 đến 4 tuần', 'o-ct'),
      tile('#/tap/lich-su', 'ls', 'Lịch sử', `${dsBuoi.length} buổi đã ghi`, 'o-ls'),
      tile('#/tap/choi', 'choi', 'Ghi buổi chơi', 'Cầu lông, pickleball, bóng đá, chạy bộ', 'o-choi')));
}
