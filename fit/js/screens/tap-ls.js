// Lịch sử buổi tập (xem, sửa, sao chép, xóa có hoàn tác) và ghi buổi chơi môn thể thao.
import { h, xoa, hoi, toast, homNay, chips } from '../ui/dom.js';
import { BAI_THEO_ID } from '../data/exercises.js';
import { MON } from '../data/ex-base.js';
import { ngayVNDayDu, ngayVN, taiBuoiChoi, sRPE, setHopLe } from '../lib/calc.js';
import { soVN } from '../lib/text.js';
import * as S from '../lib/store.js';
import { tomTatBuoi, mocHiep, trangRong } from '../ui/common.js';
import { nhapTuBuoiCu } from './tap-ghi.js';

function dongBuoi(b) {
  const t = tomTatBuoi(b);
  return h('a', { class: 'item', href: `#/tap/lich-su/${b.id}`, 'data-buoi': b.id },
    h('div', { class: 'grow' }, h('div', { class: 't' }, b.ten || 'Buổi tập'), h('div', { class: 's' }, `${ngayVN(b.ngay)} · ${t.soBai} bài · ${t.sets} hiệp${b.phut ? ` · ${b.phut} phút` : ''}`)),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
}

function danhSach(ctx) {
  ctx.datTieuDe('Lịch sử');
  const ds = S.dsBuoi().sort((a, b) => (b.ngay + (b.bd || 0)).toString().localeCompare(a.ngay + (a.bd || 0)));
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/tap' }, '‹ Tập'),
    h('section', { class: 'hero' }, h('h1', {}, 'Lịch sử buổi tập'), h('p', {}, `${ds.length} buổi đã ghi.`)),
    ds.length ? h('div', { class: 'card tight' }, h('ul', { class: 'list', 'data-testid': 'ds-buoi' }, ...ds.map((b) => h('li', {}, dongBuoi(b)))))
      : h('div', { class: 'card' }, trangRong('Chưa có buổi tập nào', 'Ghi buổi đầu tiên của bạn, chỉ mất vài phút.', h('a', { class: 'btn', href: '#/tap/ghi' }, 'Ghi buổi tập'))));
}

function chiTiet(ctx, id) {
  const b = S.layBuoi(id);
  if (!b) { ctx.root.append(trangRong('Không tìm thấy buổi tập', 'Có thể bạn đã xóa buổi này.', h('a', { class: 'btn', href: '#/tap/lich-su' }, 'Về lịch sử'))); return; }
  ctx.datTieuDe(b.ten || 'Buổi tập');
  const t = tomTatBuoi(b);
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/tap/lich-su' }, '‹ Lịch sử'),
    h('section', { class: 'hero' }, h('h1', {}, b.ten || 'Buổi tập'), h('p', {}, ngayVNDayDu(b.ngay))),
    h('div', { class: 'grid3' },
      h('div', { class: 'stat' }, h('b', {}, String(t.sets)), h('span', {}, 'hiệp')),
      h('div', { class: 'stat' }, h('b', {}, soVN(Math.round(t.kg))), h('span', {}, 'kg khối lượng')),
      h('div', { class: 'stat' }, h('b', {}, soVN(t.tai)), h('span', {}, `tải${t.uoc ? ' (ước tính)' : ''}`))),
    ...b.bai.map((e) => h('div', { class: 'card' }, h('h3', {}, h('a', { href: `#/thu-vien/${e.ex}` }, BAI_THEO_ID.get(e.ex)?.ten || e.ex)), h('p', {}, mocHiep(e.sets) || 'Không có số liệu'))),
    b.ghiChu ? h('div', { class: 'card' }, h('h3', {}, 'Ghi chú'), h('p', {}, b.ghiChu)) : null,
    h('div', { class: 'row wrap' },
      h('a', { class: 'btn grow', href: `#/tap/ghi/${b.id}`, 'data-testid': 'sua-buoi' }, 'Sửa'),
      h('button', { type: 'button', class: 'btn ghost grow', 'data-testid': 'sao-chep', onclick: async () => {
        const nhap = S.layNhap();
        if (nhap && nhap.bai.some((e) => e.sets.some((s) => setHopLe(s) || s.xong))) {
          const ok = await hoi('Thay buổi đang ghi dở?', 'Bạn đang có một buổi chưa lưu. Sao chép sẽ thay thế buổi đó.', { ok: 'Thay', huy: 'Giữ lại' });
          if (!ok) return;
        }
        nhapTuBuoiCu(b);
        ctx.dieuHuong('#/tap/ghi');
      } }, 'Sao chép sang hôm nay'),
      h('button', { type: 'button', class: 'btn ghost', 'data-testid': 'xoa-buoi', onclick: async () => {
        const ok = await hoi('Xóa buổi tập này?', 'Bạn có thể hoàn tác ngay sau khi xóa.', { ok: 'Xóa', nguy: true });
        if (!ok) return;
        const cu = JSON.parse(JSON.stringify(b));
        await S.xoaBuoi(b.id);
        location.hash = '#/tap/lich-su';
        toast('Đã xóa buổi tập.', { hoanTac: async () => { await S.luuBuoi(cu); if (location.hash.startsWith('#/tap/lich-su')) ctx.veLai(); } });
      } }, 'Xóa')));
}

// ---------- Buổi chơi ----------
const MOTA_RPE = { 1: 'Rất nhẹ', 2: 'Nhẹ', 3: 'Nhẹ', 4: 'Hơi nhẹ', 5: 'Vừa', 6: 'Khá', 7: 'Nặng', 8: 'Rất nặng', 9: 'Gần tối đa', 10: 'Tối đa' };

function choi(ctx) {
  ctx.datTieuDe('Ghi buổi chơi');
  const st = { mon: 'cau-long', phut: 90, rpe: 6, ngay: homNay(), ghiChu: '' };
  const phut = h('input', { type: 'text', inputmode: 'numeric', id: 'c-phut', value: '90', 'data-testid': 'c-phut', 'aria-label': 'Thời lượng phút' });
  const ngay = h('input', { type: 'date', id: 'c-ngay', value: st.ngay, 'data-testid': 'c-ngay' });
  const note = h('input', { type: 'text', id: 'c-note', maxlength: '120', 'data-testid': 'c-note', placeholder: 'Ví dụ: đánh đôi, 5 hiệp' });
  const lbl = h('div', { class: 'hint', 'aria-live': 'polite', 'data-testid': 'c-rpe-lbl' });
  const tai = h('div', { class: 'sub', 'data-testid': 'c-tai', 'aria-live': 'polite' });
  const capNhat = () => {
    const p = Number(String(phut.value).replace(',', '.'));
    lbl.textContent = `RPE ${st.rpe}: ${MOTA_RPE[st.rpe]}`;
    tai.textContent = p > 0 ? `Tải ước tính của buổi này: ${soVN(sRPE(st.rpe, p))} (RPE × phút)` : '';
  };
  phut.addEventListener('input', capNhat);
  const ds = h('ul', { class: 'list', 'data-testid': 'ds-choi' });
  const veDs = () => {
    xoa(ds);
    const l = S.dsChoi().sort((a, b) => b.ngay.localeCompare(a.ngay)).slice(0, 15);
    if (!l.length) { ds.append(h('li', { class: 'empty' }, 'Chưa ghi buổi chơi nào.')); return; }
    l.forEach((p) => ds.append(h('li', { class: 'item', 'data-choi': p.id },
      h('div', { class: 'grow' }, h('div', { class: 't' }, `${MON[p.mon] || p.mon} · ${p.phut} phút`), h('div', { class: 's' }, `${ngayVN(p.ngay)} · RPE ${p.rpe} · tải ${soVN(taiBuoiChoi(p))}${p.ghiChu ? ` · ${p.ghiChu}` : ''}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Xóa buổi chơi', onclick: async () => { const cu = { ...p }; await S.xoaChoi(p.id); veDs(); toast('Đã xóa buổi chơi.', { hoanTac: async () => { await S.luuChoi(cu); veDs(); } }); } }, '✕'))));
  };
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/tap' }, '‹ Tập'),
    h('section', { class: 'hero' }, h('h1', {}, 'Ghi buổi chơi thể thao'), h('p', {}, 'Buổi chơi cũng là tải tập. Ghi nhanh để 9fit tính tải cả tuần. Sau này có thể nối với 9Sport.')),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Môn'), chips(Object.entries(MON).map(([v, t]) => ({ v, t })), st.mon, (v) => { st.mon = v; }, 'Môn')),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 'c-phut' }, 'Thời lượng (phút)'), phut),
        h('div', { class: 'field' }, h('label', { for: 'c-ngay' }, 'Ngày'), ngay)),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Cảm giác nỗ lực (RPE 1-10)'), chips(Array.from({ length: 10 }, (_, i) => ({ v: i + 1, t: String(i + 1) })), st.rpe, (v) => { st.rpe = Number(v); capNhat(); }, 'RPE'), lbl),
      h('div', { class: 'field' }, h('label', { for: 'c-note' }, 'Ghi chú (không bắt buộc)'), note),
      tai,
      h('button', { type: 'button', class: 'btn block', 'data-testid': 'luu-choi', onclick: async () => {
        const p = Math.round(Number(String(phut.value).replace(',', '.')));
        if (!(p > 0 && p <= 600)) { toast('Nhập thời lượng từ 1 đến 600 phút.'); return; }
        await S.luuChoi({ id: S.taoId(), ngay: ngay.value || homNay(), mon: st.mon, phut: p, rpe: st.rpe, ghiChu: note.value.trim() });
        note.value = '';
        veDs();
        toast('Đã ghi buổi chơi.');
      } }, 'Lưu buổi chơi')),
    h('div', { class: 'sec-h' }, h('h2', {}, 'Gần đây')),
    h('div', { class: 'card tight' }, ds));
  capNhat(); veDs();
}

export default function lichSuVaChoi(ctx, loai, id) {
  if (loai === 'choi') choi(ctx);
  else if (id) chiTiet(ctx, id);
  else danhSach(ctx);
}
