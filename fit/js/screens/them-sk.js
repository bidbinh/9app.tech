// Sức khỏe và an toàn: sàng lọc rút gọn theo ý PAR-Q+, hướng dẫn dừng tập, lưu ý.
import { h, xoa, toast, homNay } from '../ui/dom.js';
import { CAU_HOI, TUOI_TOI_THIEU, danhGiaSangLoc } from '../lib/parq.js';
import * as S from '../lib/store.js';
import { ngayVNDayDu } from '../lib/calc.js';

function ketQuaThe(sl) {
  if (!sl) return null;
  const ds = (arr) => (arr && arr.length ? h('ul', { class: 'bul mt' }, ...arr.map((l) => h('li', {}, l))) : null);
  if (sl.ketQua === 'duoc-phep') {
    return h('div', { class: 'note ok', 'data-testid': 'kq-ok' }, h('b', {}, 'Bạn không có yếu tố rủi ro trong các câu hỏi này. '),
      'Hãy bắt đầu nhẹ và tăng dần. Đây không phải là xác nhận y tế; nếu có bất kỳ lo ngại nào, hãy hỏi bác sĩ trước khi tập.', ds(sl.luuY),
      h('div', { class: 'row wrap' }, h('a', { class: 'btn sm', href: '#/tap/chuong-trinh' }, 'Xem chương trình mẫu'), h('a', { class: 'btn sm ghost', href: '#/thu-vien' }, 'Mở thư viện')));
  }
  if (sl.ketQua === 'hoi-bac-si') {
    return h('div', { class: 'note warn', 'data-testid': 'kq-hoi' }, h('b', {}, 'Nên hỏi bác sĩ, và trong lúc chờ chỉ tập nhẹ. '),
      'Bạn vẫn dùng được các bài nhẹ, khởi động, giãn cơ và chương trình nhẹ (Linh hoạt, Phục hồi, Giảm mỡ vận động nhẹ). 9fit tạm không cho thêm bài khó, bật nhảy và bài kiểm tra thể lực tối đa.',
      ds(sl.lyDo), ds(sl.huongDan), ds(sl.luuY),
      h('div', { class: 'row wrap' }, h('a', { class: 'btn sm ghost', href: '#/tap/chuong-trinh' }, 'Chương trình nhẹ'), h('a', { class: 'btn sm ghost', href: '#/thu-vien' }, 'Mở thư viện')));
  }
  return h('div', { class: 'note bad', 'data-testid': 'kq-dung' }, h('b', {}, 'Bạn nên gặp bác sĩ hoặc huấn luyện viên có chuyên môn trước khi tập. '),
    '9fit sẽ không tạo chương trình tập và không mở màn ghi buổi tập cho bạn lúc này. Bạn vẫn xem được thư viện bài tập để tham khảo.',
    ds(sl.lyDo), ds(sl.huongDan),
    h('div', { class: 'row wrap' }, h('a', { class: 'btn sm ghost', href: '#/thu-vien' }, 'Xem thư viện')));
}

function sangLoc(ctx) {
  ctx.datTieuDe('Sàng lọc sức khỏe');
  const cu = S.laySangLoc();
  const tuoi = h('input', { type: 'text', inputmode: 'numeric', id: 'sl-tuoi', 'data-testid': 'sl-tuoi', autocomplete: 'off', value: cu?.tuoi ? String(cu.tuoi) : '', maxlength: '3' });
  const tra = { ...(cu?.traLoi || {}) };
  const loi = h('div', { class: 'note bad', role: 'alert', hidden: true, 'data-testid': 'sl-loi' });
  const kq = h('div', { 'aria-live': 'polite' });
  const form = h('div', { class: 'card stack', 'data-testid': 'sl-form' },
    h('div', { class: 'field' }, h('label', { for: 'sl-tuoi' }, 'Tuổi của bạn'), tuoi),
    ...CAU_HOI.map((c, idx) => h('fieldset', { class: 'field', style: null, 'data-q': c.id, 'aria-describedby': `q-${c.id}` },
      h('legend', { class: 'lbl', id: `q-${c.id}` }, `${idx + 1}. ${c.chu}`),
      h('div', { class: 'chips', role: 'radiogroup', 'aria-label': `Câu ${idx + 1}` },
        ...[[true, 'Có'], [false, 'Không']].map(([v, t]) => h('label', { class: 'chip', 'aria-pressed': String(tra[c.id] === v), 'data-testid': `q-${c.id}-${v ? 'co' : 'khong'}` },
          h('input', { type: 'radio', name: `q-${c.id}`, value: v ? '1' : '0', class: 'offscreen', checked: tra[c.id] === v, onchange: (e) => {
            tra[c.id] = v;
            for (const l of e.target.closest('.chips').children) l.setAttribute('aria-pressed', String(l.contains(e.target)));
          } }), t))))),
    loi,
    h('button', { type: 'button', class: 'btn block', 'data-testid': 'sl-gui', onclick: () => {
      const t = Number(String(tuoi.value).trim());
      const r = danhGiaSangLoc(t, tra);
      if (r.ketQua === 'thieu') { loi.hidden = false; loi.textContent = r.lyDo[0] + ' Hãy nhập tuổi và trả lời hết các câu hỏi.'; return; }
      loi.hidden = true;
      const b = S.luuSangLoc(t, tra, homNay());
      xoa(kq); kq.append(ketQuaThe(b));
      kq.firstChild.scrollIntoView({ block: 'center' });
      toast('Đã lưu kết quả sàng lọc trên máy.');
    } }, 'Xem kết quả'));
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/them/suc-khoe' }, '‹ Sức khỏe và an toàn'),
    h('section', { class: 'hero' }, h('h1', {}, 'Sàng lọc sức khỏe'), h('p', {}, 'Trả lời trung thực. Câu trả lời chỉ lưu trên máy bạn và không gửi đi đâu.')),
    h('div', { class: 'note' }, 'Đây là bản PAR-Q rút gọn do 9fit tự diễn đạt lại theo ý của bộ câu hỏi PAR-Q+ (Physical Activity Readiness Questionnaire for Everyone), có thêm vài câu về bệnh mạn tính và mức vận động. Không phải bản PAR-Q+ chính thức, không phải tư vấn y tế. Kết quả có 3 mức: được phép, nên hỏi bác sĩ (chỉ tập nhẹ), dừng lại.'),
    cu ? h('div', { class: 'stack' }, h('p', { class: 'sub' }, `Lần làm gần nhất: ${ngayVNDayDu(cu.ngay)}`), ketQuaThe(cu)) : null,
    form, kq,
    h('p', { class: 'hint' }, `Dưới ${TUOI_TOI_THIEU} tuổi: 9fit không tạo chương trình; hãy tập cùng huấn luyện viên hoặc người lớn có kinh nghiệm.`));
}

function tongQuan(ctx) {
  ctx.datTieuDe('Sức khỏe và an toàn');
  const tt = S.trangThaiSangLoc(); const sl = S.laySangLoc();
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/them' }, '‹ Thêm'),
    h('section', { class: 'hero' }, h('h1', {}, 'Sức khỏe và an toàn')),
    h('div', { class: 'note warn' }, h('b', {}, 'Không phải tư vấn y tế. '), '9fit là công cụ ghi chép và gợi ý chung. Nó không chẩn đoán, không điều trị và không thay thế bác sĩ hay huấn luyện viên.'),
    h('div', { class: 'card stack', 'data-testid': 'trang-thai-sl' },
      h('h2', {}, 'Sàng lọc sức khỏe'),
      tt === 'chua' ? h('p', {}, 'Bạn chưa làm sàng lọc. Nên làm trước khi tập theo chương trình.') : [h('p', { class: 'sub' }, `Làm lần gần nhất: ${ngayVNDayDu(sl.ngay)}. Nên làm lại khi sức khỏe thay đổi hoặc sau khoảng 12 tháng.`), ketQuaThe(sl)],
      h('a', { class: 'btn', href: '#/them/suc-khoe/sang-loc', 'data-testid': 'lam-sang-loc' }, tt === 'chua' ? 'Làm sàng lọc' : 'Làm lại sàng lọc')),
    h('div', { class: 'card' }, h('h2', {}, 'Dừng tập ngay khi'),
      h('ul', { class: 'bul' },
        h('li', {}, 'Đau, tức hoặc nặng ở ngực, lan ra tay hoặc hàm.'),
        h('li', {}, 'Chóng mặt, choáng váng, buồn nôn, mắt tối sầm.'),
        h('li', {}, 'Khó thở bất thường, không nói nổi một câu ngắn.'),
        h('li', {}, 'Đau nhói ở khớp, cơ hoặc gân; tê hoặc yếu đột ngột.'),
        h('li', {}, 'Tim đập loạn nhịp hoặc cảm giác bất thường khác.')),
      h('p', { class: 'mt' }, 'Nếu đau ngực kéo dài, khó thở nặng hoặc ngất, hãy gọi cấp cứu 115.')),
    h('div', { class: 'card' }, h('h2', {}, 'Thói quen an toàn'),
      h('ul', { class: 'bul' },
        h('li', {}, 'Khởi động động 5 đến 10 phút trước khi tập hoặc chơi; làm nguội và giãn nhẹ sau đó.'),
        h('li', {}, 'Tăng dần số hiệp, mức tạ và thời gian; không tăng đột ngột cả ba.'),
        h('li', {}, 'Mỏi cơ âm ỉ 1 đến 2 ngày sau tập là bình thường; đau nhói, sưng hoặc đau kéo dài thì cần nghỉ và hỏi chuyên viên.'),
        h('li', {}, 'Không tập khi đang sốt, ốm nặng hoặc quá mệt; mang giày phù hợp, sàn không trơn; bù nước đủ.'),
        h('li', {}, 'Bài khó (bật nhảy, Nordic, đơn chân) chỉ làm khi đã vững bài nền, tốt nhất có người hướng dẫn.'))),
    h('div', { class: 'card' }, h('h2', {}, 'Nên hỏi bác sĩ trước khi tập'),
      h('ul', { class: 'bul' },
        h('li', {}, 'Có bệnh tim mạch, huyết áp, tiểu đường, hen nặng, bệnh xương khớp.'),
        h('li', {}, 'Đang mang thai hoặc mới sinh.'),
        h('li', {}, 'Mới chấn thương, mới phẫu thuật hoặc đau kéo dài hơn 1 đến 2 tuần.'),
        h('li', {}, 'Dưới 16 tuổi hoặc lớn tuổi, đã lâu không vận động.'))),
    h('div', { class: 'note' }, 'Ứng dụng không đưa ra lời khuyên về chế độ ăn, thực phẩm chức năng hay thuốc. Với những vấn đề này, hãy hỏi bác sĩ hoặc chuyên gia dinh dưỡng.'));
}

export default function sucKhoe(ctx, sub) {
  if (sub === 'sang-loc') return sangLoc(ctx);
  return tongQuan(ctx);
}
