// Tiện ích: tra cứu phạt nguội (chỉ dẫn liên kết), checklist đi xa, tai nạn và cứu hộ, bảo hiểm, sổ giao xe khi bán.
import { h, icon, truong, trong, toast } from '../ui/dom.js';
import { app, hom, chonXe, soKm, tatCaHen, dongHen } from '../ui/common.js';
import { kho, xeCua, tenXe, datMeta } from '../lib/data.js';
import { dinhDang } from '../lib/dates.js';
import { tien, docSo } from '../lib/money.js';

const ngoai = (href, ...kids) => h('a', { class: 'btn sec block', href, target: '_blank', rel: 'noopener noreferrer' }, ...kids);
const dauChamXe = (el) => el;

export function phatNguoi(tham = {}) {
  const xe = tham.xe ? xeCua(tham.xe) : kho.xe[0];
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Tra cứu phạt nguội'),
    h('p', { class: 'sub' }, 'Việc tra cứu do cơ quan nhà nước cung cấp và có bước xác minh riêng. 9car không lấy, không lưu dữ liệu vi phạm của bạn; chỉ giúp bạn mở đúng trang.'));
  const card = h('section', { class: 'card', style: 'margin-top:14px' });
  if (kho.xe.length > 1) { const s = chonXe(xe && xe.id, { onDoi: (v) => app.di(`#/phat-nguoi?xe=${v}`) }); s.setAttribute('aria-label', 'Chọn xe'); card.append(h('div', { class: 'field' }, s)); }
  if (xe && xe.bienSo) {
    card.append(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'plate', 'data-testid': 'bien-so' }, xe.bienSo),
      h('button', { class: 'btn sm sec', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(xe.bienSo); toast('Đã chép biển số, dán vào ô tra cứu.'); } catch { toast('Không chép tự động được. Bạn gõ biển số vào ô tra cứu.'); }
      } }, 'Chép biển số')));
  } else if (xe) card.append(h('p', { class: 'sub', style: 'margin-bottom:12px' }, 'Xe này chưa có biển số. Hãy thêm biển số trong phần sửa thông tin xe.'));
  card.append(h('div', { class: 'stack' },
    ngoai('https://csgt.bocongan.gov.vn/tra-cuu-phat-nguoi', icon('search'), 'Trang tra cứu phạt nguội chính thức'),
    ngoai('https://csgt.bocongan.gov.vn/', icon('link'), 'Cổng Cục Cảnh sát giao thông (csgt.vn)'),
    h('a', { class: 'btn sec block', href: '../speed/' }, icon('speed'), 'Mở 9speed: cảnh báo tốc độ, tránh bị phạt')));
  el.append(card, h('div', { class: 'banner' }, 'Mức phạt cụ thể thay đổi theo từng thời kỳ và từng lỗi. Hãy xem Nghị định hiện hành hoặc hỏi cơ quan có thẩm quyền; 9car không đưa ra con số phạt để tránh sai lệch.'));
  return { tieuDe: 'Phạt nguội', quayVe: '#/them', el };
}

// ---- Checklist
const CHUNG = [
  ['giay-to', 'Giấy tờ', ['Giấy đăng ký xe', 'Giấy phép lái xe còn hạn', 'Giấy chứng nhận bảo hiểm bắt buộc còn hạn', 'Tem hoặc giấy kiểm định còn hạn (ô tô)']],
  ['dien-thoai', 'Liên lạc', ['Điện thoại đầy pin, có sạc dự phòng', 'Lưu số cứu hộ và số bảo hiểm']],
];
const OTO = [
  ['lop', 'Lốp', ['Áp suất bốn lốp theo hướng dẫn của hãng', 'Gai lốp còn đủ, không phồng, nứt', 'Lốp dự phòng còn hơi, có đồ thay lốp']],
  ['may', 'Máy và nước', ['Mực dầu động cơ', 'Nước làm mát', 'Nước rửa kính', 'Dầu phanh', 'Ắc quy: cọc sạch, khởi động nhạy']],
  ['an-toan', 'An toàn', ['Đèn pha, cos, xi nhan, đèn phanh', 'Gạt mưa còn tốt', 'Phanh đúng độ, không kêu lạ', 'Tam giác phản quang, bình chữa cháy nhỏ', 'Dây câu bình hoặc dây kéo xe']],
  ['nang-luong', 'Nhiên liệu', ['Đủ nhiên liệu hoặc pin cho chặng đầu, biết cây xăng, trạm sạc trên đường']],
];
const XEMAY = [
  ['lop', 'Lốp', ['Áp suất hai lốp', 'Gai lốp còn đủ, không nứt']],
  ['may', 'Máy', ['Mực nhớt máy', 'Xích hoặc dây curoa', 'Ắc quy, bugi khởi động tốt']],
  ['an-toan', 'An toàn', ['Phanh trước, sau', 'Đèn pha, đèn phanh, xi nhan, còi', 'Gương chiếu hậu', 'Mũ bảo hiểm đạt chuẩn, áo mưa']],
  ['nang-luong', 'Nhiên liệu', ['Đủ xăng hoặc pin cho chặng đầu']],
];

export function checklist(tham = {}) {
  const xe = tham.xe ? xeCua(tham.xe) : kho.xe[0];
  const xm = xe && xe.loai === 'xemay';
  const nhom = [...CHUNG.filter((g) => !(xm && g[0] === 'giay-to') || true), ...(xm ? XEMAY : OTO)];
  const trangThai = (kho.meta.checklist && kho.meta.checklist[xe ? xe.id : '_'] ) || {};
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Kiểm tra trước chuyến đi xa'), h('p', { class: 'sub' }, 'Chạm để đánh dấu từng mục. Trạng thái được nhớ trên máy.'));
  if (kho.xe.length > 1) { const s = chonXe(xe.id, { onDoi: (v) => app.di(`#/checklist?xe=${v}`) }); s.setAttribute('aria-label', 'Chọn xe'); el.append(h('div', { class: 'field', style: 'margin-top:12px' }, s)); }
  const dem = h('div', { class: 'banner', style: 'margin:12px 0', 'aria-live': 'polite' });
  const tong = nhom.reduce((s, g) => s + g[2].length, 0);
  const capDem = () => { const n = Object.values(trangThai).filter(Boolean).length; dem.textContent = n === tong ? 'Đã kiểm tra đủ. Chúc bạn thượng lộ bình an!' : `Đã kiểm tra ${n}/${tong} mục.`; };
  capDem(); el.append(dem);
  nhom.forEach(([gid, ten, ds]) => {
    const c = h('section', { class: 'card', 'aria-label': ten }, h('h2', {}, ten));
    ds.forEach((muc, i) => {
      const k = `${gid}-${i}`;
      const chk = h('input', { type: 'checkbox', id: `cl-${k}`, checked: !!trangThai[k] });
      chk.addEventListener('change', async () => {
        trangThai[k] = chk.checked; capDem();
        await datMeta('checklist', { ...(kho.meta.checklist || {}), [xe ? xe.id : '_']: { ...trangThai } });
      });
      c.append(h('label', { class: 'check', for: `cl-${k}` }, chk, muc));
    });
    el.append(c);
  });
  el.append(h('button', { class: 'btn line block', type: 'button', onclick: async () => {
    await datMeta('checklist', { ...(kho.meta.checklist || {}), [xe ? xe.id : '_']: {} }); app.render();
  } }, 'Bỏ chọn tất cả để dùng cho chuyến sau'));
  return { tieuDe: 'Checklist đi xa', quayVe: '#/them', el };
}

// ---- Tai nạn nhỏ, cứu hộ
export function taiNan(tham = {}) {
  const xe = tham.xe ? xeCua(tham.xe) : kho.xe[0];
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Gặp sự cố, tai nạn'));
  el.append(h('div', { class: 'sos', role: 'group', 'aria-label': 'Số điện thoại khẩn cấp' },
    h('a', { href: 'tel:113', 'aria-label': 'Gọi 113, Công an' }, '113', h('small', {}, 'Công an')),
    h('a', { href: 'tel:114', 'aria-label': 'Gọi 114, Cứu hỏa và cứu nạn' }, '114', h('small', {}, 'Cứu hỏa, cứu nạn')),
    h('a', { href: 'tel:115', 'aria-label': 'Gọi 115, Cấp cứu' }, '115', h('small', {}, 'Cấp cứu'))));
  el.append(h('section', { class: 'card', style: 'margin-top:14px' }, h('h2', {}, 'Việc cần làm theo thứ tự'),
    h('ol', { class: 'steps' }, [
      'Dừng xe an toàn, tắt máy, bật đèn khẩn cấp. Không đứng giữa đường.',
      'Kiểm tra người trong xe và người xung quanh. Có người bị thương: gọi 115 ngay, không di chuyển người bị nạn nếu không cần thiết.',
      'Có cháy, khói, rò rỉ nhiên liệu hoặc pin xe điện nóng, bốc khói: ra xa xe và gọi 114.',
      'Đặt tam giác phản quang phía sau xe (ô tô) hoặc nhờ người báo hiệu, rồi dời xe vào lề nếu xe còn chạy được và không có người bị thương nặng.',
      'Chụp ảnh hiện trường, biển số các xe, giấy tờ, vị trí. Ghi tên và số điện thoại của người liên quan và nhân chứng.',
      'Va chạm có thiệt hại lớn, có người bị thương hoặc hai bên không thống nhất: gọi 113 để cơ quan chức năng xử lý. Không rời hiện trường khi chưa được phép.',
      'Gọi hotline bảo hiểm (số ghi trên giấy chứng nhận) để được hướng dẫn hồ sơ bồi thường. Giữ nguyên hiện trường theo hướng dẫn nếu cần.',
      'Cần kéo xe: gọi cứu hộ. Hỏi giá trước khi kéo và chụp ảnh biển số xe cứu hộ.',
    ].map((t) => h('li', {}, t)))));
  const so = [];
  if (xe && xe.hotlineBH) so.push(['Hotline bảo hiểm', xe.hotlineBH]);
  if (xe && xe.hotlineCuuHo) so.push(['Cứu hộ', xe.hotlineCuuHo]);
  el.append(h('section', { class: 'card' }, h('h2', {}, `Số của bạn${xe ? ` (${tenXe(xe)})` : ''}`),
    so.length ? so.map(([t, s]) => h('a', { class: 'item', href: `tel:${s.replace(/[^\d+]/g, '')}` }, h('span', { class: 'ic' }, icon('phone')), h('span', { class: 'grow' }, h('div', { class: 't' }, t), h('div', { class: 'd' }, s)), icon('chev')))
      : h('p', { class: 'sub' }, 'Chưa lưu số hotline bảo hiểm hoặc cứu hộ. Lưu trước để lúc gấp không phải tìm.'),
    xe ? h('a', { class: 'btn sm sec', href: `#/xe/${xe.id}/sua` }, icon('edit'), 'Lưu số hotline') : null));
  el.append(h('p', { class: 'sub' }, 'Đây là hướng dẫn chung, không thay thế chỉ dẫn của cơ quan chức năng. Số 113, 114, 115 là số khẩn cấp chung của Công an, Cứu hỏa cứu nạn và Cấp cứu.'));
  return { tieuDe: 'Sự cố, cứu hộ', quayVe: '#/them', el };
}

// ---- Bảo hiểm
export function baoHiem() {
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Bảo hiểm xe'));
  el.append(h('div', { class: 'card' }, h('h2', {}, 'Cần biết'),
    h('ul', { style: 'padding-left:20px;margin:0' }, [
      'Bảo hiểm trách nhiệm dân sự bắt buộc (TNDS) là loại pháp luật yêu cầu chủ xe phải có. Mức phí do nhà nước quy định theo biểu phí, nên các công ty gần như giống nhau; hãy cẩn thận lời mời chiết khấu quá lớn.',
      'Bảo hiểm vật chất (thân vỏ) là tự nguyện, giá và quyền lợi khác nhau giữa các nơi. Hãy so sánh nhiều nơi, đọc kỹ phạm vi, mức miễn thường và gara sửa chữa.',
      'Mua trực tiếp từ công ty bảo hiểm hoặc đại lý có giấy phép. Kiểm tra giấy chứng nhận bằng tra cứu chính thức.',
      'Nên gia hạn trước hạn để không bị gián đoạn bảo hiểm.',
    ].map((t) => h('li', { style: 'margin-bottom:8px' }, t)))));
  const ds = tatCaHen().filter((x) => x.hen.kind === 'tnds' || x.hen.kind === 'vat-chat');
  const c = h('section', { class: 'card' }, h('h2', {}, 'Bảo hiểm của bạn'));
  if (ds.length) ds.forEach((x) => c.append(dongHen(x)));
  else c.append(h('p', { class: 'sub' }, 'Chưa có mục nhắc bảo hiểm nào.'), kho.xe.length ? h('a', { class: 'btn sm', href: '#/hen/moi?kind=tnds' }, icon('plus'), 'Thêm nhắc bảo hiểm') : h('a', { class: 'btn sm', href: '#/xe/moi' }, 'Thêm xe trước'));
  el.append(c, h('div', { class: 'stack' },
    h('a', { class: 'btn sec block', href: 'https://csgt.bocongan.gov.vn/tra-cuu-bao-hiem-xe', target: '_blank', rel: 'noopener noreferrer' }, icon('shield'), 'Tra cứu bảo hiểm bắt buộc (trang chính thức)')),
    h('p', { class: 'sub', style: 'margin-top:12px' }, '9car không bán bảo hiểm và không đưa lời khuyên tài chính, bảo hiểm. Thông tin chỉ để bạn nhớ hạn và hỏi đúng câu hỏi.'));
  return { tieuDe: 'Bảo hiểm', quayVe: '#/them', el };
}

// ---- Sổ giao xe khi bán
const GIAY_TO = ['Giấy đăng ký xe (cà vẹt)', 'Giấy chứng nhận kiểm định còn hạn', 'Giấy bảo hiểm bắt buộc', 'Sổ bảo dưỡng, sổ hướng dẫn', 'Chìa khóa chính và chìa dự phòng', 'Hóa đơn, chứng từ mua xe'];
export function banXe(tham = {}) {
  const xe = tham.xe ? xeCua(tham.xe) : kho.xe[0];
  const el = h('div', {}, h('h1', { class: 'h1 no-print' }, 'Sổ giao xe khi bán'));
  if (!xe) { el.append(h('div', { class: 'card' }, trong('car', 'Cần thêm xe trước', '', h('a', { class: 'btn', href: '#/xe/moi' }, 'Thêm xe')))); return { tieuDe: 'Sổ giao xe', quayVe: '#/them', el }; }
  const f = {};
  const mk = (id, nhan, v = '', kieu = 'text') => { f[id] = h('input', { type: kieu, id: `bx-${id}`, value: v, maxlength: 120 }); return truong(nhan, f[id]); };
  const ngayGiao = hom();
  const form = h('form', { class: 'card no-print', onsubmit: (e) => e.preventDefault() },
    kho.xe.length > 1 ? h('div', { class: 'field' }, (() => { const s = chonXe(xe.id, { onDoi: (v) => app.di(`#/ban-xe?xe=${v}`) }); s.setAttribute('aria-label', 'Chọn xe'); return s; })()) : null,
    h('p', { class: 'sub', style: 'margin-bottom:12px' }, 'Thông tin người bán, người mua chỉ nằm trên màn hình này để in, 9car không lưu lại.'),
    mk('ban', 'Người bán (họ tên)'), mk('mua', 'Người mua (họ tên)'), mk('gia', 'Giá thỏa thuận (đồng)'), mk('ngay', 'Ngày giao xe', ngayGiao, 'date'),
    mk('km', 'Số km trên đồng hồ khi giao', xe.km !== null ? soKm(xe.km) : ''),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Giấy tờ, phụ kiện bàn giao'), GIAY_TO.map((g, i) => h('label', { class: 'check', for: `bx-g${i}` }, h('input', { type: 'checkbox', id: `bx-g${i}`, checked: i < 3, 'data-giay': g }), g))),
    h('div', { class: 'field' }, h('label', { for: 'bx-tt' }, 'Tình trạng xe, ghi chú'), (f.tt = h('textarea', { id: 'bx-tt', maxlength: 400, placeholder: 'Ví dụ: Xe chạy tốt, trầy nhẹ cản sau, đã thay lốp tháng 8.' }))),
    h('button', { class: 'btn block', type: 'button', onclick: () => { ve(); document.getElementById('so-giao-xe').scrollIntoView(); } }, icon('doc'), 'Xem bản in'));
  const kq = h('section', { class: 'card giao-xe', id: 'so-giao-xe', hidden: true });
  const ve = () => {
    const g = [...form.querySelectorAll('input[data-giay]')].filter((c) => c.checked).map((c) => c.dataset.giay);
    const gia = f.gia.value.trim() ? docSo(f.gia.value) : null;
    kq.hidden = false; kq.replaceChildren(
      h('h2', { style: 'text-align:center;font-size:1.25rem' }, 'BIÊN BẢN GIAO NHẬN XE'),
      h('p', { style: 'text-align:center' }, `Ngày ${dinhDang(f.ngay.value) || '......'}`),
      h('table', { class: 't' }, h('tbody', {},
        [['Loại xe', [xe.hang, xe.dong].filter(Boolean).join(' ') || '......'], ['Biển số', xe.bienSo || '......'], ['Năm sản xuất', xe.namSX || '......'], ['Số km đồng hồ', f.km.value || '......'],
          ['Người bán', f.ban.value || '..........................'], ['Người mua', f.mua.value || '..........................'], ['Giá thỏa thuận', gia && !Number.isNaN(gia) ? tien(gia) : '..........................']]
          .map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, String(v)))))),
      h('h3', { style: 'margin-top:12px' }, 'Giấy tờ, phụ kiện đã bàn giao'), h('ul', {}, g.length ? g.map((t) => h('li', {}, t)) : h('li', {}, '......')),
      h('h3', {}, 'Tình trạng xe'), h('p', {}, f.tt.value || '......'),
      h('p', { class: 'sub' }, 'Mẫu tham khảo, không thay thế hợp đồng mua bán và thủ tục sang tên, đổi chủ theo quy định. Hai bên nên hoàn tất thủ tục tại cơ quan có thẩm quyền.'),
      h('div', { class: 'two', style: 'text-align:center;margin-top:28px' }, h('div', {}, h('b', {}, 'Người bán'), h('p', { class: 'sub' }, '(ký, ghi rõ họ tên)'), h('div', { style: 'height:64px' })), h('div', {}, h('b', {}, 'Người mua'), h('p', { class: 'sub' }, '(ký, ghi rõ họ tên)'), h('div', { style: 'height:64px' }))),
      h('button', { class: 'btn block no-print', type: 'button', onclick: () => window.print() }, icon('print'), 'In hoặc lưu thành PDF'));
  };
  el.append(form, kq);
  return { tieuDe: 'Sổ giao xe', quayVe: '#/them', el };
}
