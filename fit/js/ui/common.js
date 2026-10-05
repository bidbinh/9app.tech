// Thành phần giao diện dùng chung giữa các màn hình.
import { h } from './dom.js';
import { bodyMap } from './bodymap.js';
import { BAI_THEO_ID } from '../data/exercises.js';
import { NHOM, LOAI, MUC, moTaDem } from '../data/ex-base.js';
import { ngayVN, taiBuoiTap, tongKhoiLuong, setHopLe } from '../lib/calc.js';
import { soVN } from '../lib/text.js';
import * as S from '../lib/store.js';

export const tenBai = (id) => BAI_THEO_ID.get(id)?.ten || id;
export const nhomChu = (ex) => ex.nhomChinh.map((n) => NHOM[n]).join(', ');

export function thumb(ex) {
  return h('div', { class: 'thumb' }, bodyMap(ex.nhomChinh, ex.nhomPhu, { nhan: `Nhóm cơ của bài ${ex.ten}` }));
}

export function hangBai(ex, { href = `#/thu-vien/${ex.id}`, phu = '' } = {}) {
  return h('a', { class: 'item', href, 'data-ex': ex.id },
    thumb(ex),
    h('div', { class: 'grow' },
      h('div', { class: 't' }, ex.ten),
      h('div', { class: 's' }, `${nhomChu(ex)} · ${LOAI[ex.loai]} · ${MUC[ex.mucDo]}`),
      h('div', { class: 's' }, phu || moTaDem(ex.dem))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
}

export function mocHiep(sets) {
  const ok = (sets || []).filter(setHopLe);
  if (!ok.length) return '';
  const dau = ok[0];
  const dong = ok.every((s) => s.lan === dau.lan && s.kg === dau.kg && s.giay === dau.giay);
  const mo = (s) => (s.giay ? `${s.giay} giây` : `${s.lan}${s.kg ? ` × ${soVN(s.kg, 2)} kg` : ' lần'}`);
  return dong ? `${ok.length} × ${mo(dau)}` : ok.map(mo).join(', ');
}

export function tomTatBuoi(b) {
  const sets = (b.bai || []).reduce((a, e) => a + (e.sets || []).filter(setHopLe).length, 0);
  const kg = (b.bai || []).reduce((a, e) => a + tongKhoiLuong(e.sets), 0);
  const t = taiBuoiTap(b);
  return { sets, kg, tai: t.tai, uoc: t.uoc, soBai: (b.bai || []).length };
}

/** Thẻ cảnh báo khi chưa sàng lọc hoặc kết quả là dừng lại. */
export function bannerAnToan({ ngan = false } = {}) {
  const tt = S.trangThaiSangLoc();
  if (tt === 'duoc-phep') return null;
  if (tt === 'hoi-bac-si') {
    return h('div', { class: 'note warn', role: 'note', 'data-testid': 'banner-nhe' },
      h('b', {}, 'Nên hỏi bác sĩ trước khi tăng mức tập. '),
      'Trong lúc chờ, chỉ tập nhẹ: chưa có bài khó, bật nhảy hay bài kiểm tra tối đa.',
      h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: '#/them/suc-khoe' }, 'Xem hướng dẫn')));
  }
  if (tt === 'dung-lai') {
    return h('div', { class: 'note warn', role: 'note', 'data-testid': 'banner-dung' },
      h('b', {}, 'Chưa nên tập theo chương trình. '),
      'Câu trả lời sàng lọc cho thấy bạn nên hỏi bác sĩ hoặc huấn luyện viên trước. Bạn vẫn xem được thư viện bài tập.',
      h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: '#/them/suc-khoe' }, 'Xem hướng dẫn')));
  }
  return h('div', { class: 'note warn', role: 'note', 'data-testid': 'banner-chua' },
    h('b', {}, 'Làm sàng lọc sức khỏe trước khi tập. '),
    ngan ? '' : 'Chỉ mất khoảng 1 phút. Ứng dụng không phải tư vấn y tế.',
    h('div', { class: 'row' }, h('a', { class: 'btn sm', href: '#/them/suc-khoe/sang-loc' }, 'Làm sàng lọc')));
}

export const dongNgay = (n) => ngayVN(n);

export function trangRong(tieuDe, noiDung, nut) {
  return h('div', { class: 'empty' }, h('b', {}, tieuDe), noiDung, nut ? h('div', { class: 'mt' }, nut) : null);
}

/** Thẻ giải thích cảnh báo tải. cb là kết quả của canhBaoTai. */
export function ghiChuTai(cb) {
  if (cb.muc === 'chua-du') return h('div', { class: 'note', 'data-testid': 'tai-cb' }, 'Chưa đủ dữ liệu để so sánh: cần ít nhất 2 tuần trước đó có ghi buổi tập hoặc buổi chơi.');
  const lan = soVN(cb.ti, 2);
  if (cb.muc === 'cao') return h('div', { class: 'note bad', role: 'status', 'data-testid': 'tai-cb' }, h('b', {}, `Tải tuần này gấp ${lan} lần trung bình 4 tuần trước. `), 'Tăng nhanh như vậy thường làm cơ thể khó thích nghi. Hãy cân nhắc nghỉ thêm, giảm số hiệp hoặc chơi nhẹ hơn trong vài ngày. Đây chỉ là gợi ý, không phải chẩn đoán.');
  if (cb.muc === 'luu-y') return h('div', { class: 'note warn', role: 'status', 'data-testid': 'tai-cb' }, h('b', {}, `Tải tuần này gấp ${lan} lần trung bình 4 tuần trước. `), 'Hơi nhanh. Nếu thấy mệt hoặc đau, hãy giảm bớt. Đây chỉ là gợi ý, không phải chẩn đoán.');
  return h('div', { class: 'note ok', 'data-testid': 'tai-cb' }, `Tải tuần này khoảng ${lan} lần trung bình 4 tuần trước: trong mức ổn định.`);
}
