// Mục Thêm: danh sách tiện ích, Dữ liệu của tôi, nguồn quy định.
import { h, icon, toast, hoi, taiTep } from '../ui/dom.js';
import { app, hom } from '../ui/common.js';
import { kho, xuat, nhap, xoaSach } from '../lib/data.js';
import { icsTatCa } from '../ui/lich.js';
import { layTheme, datTheme, layChuLon, datChuLon } from '../ui/caidat.js';
import { dinhDang } from '../lib/dates.js';

const MUC = [
  ['sac', '#/sac', 'bolt', 'Sạc xe điện', 'Ghi buổi sạc, so chi phí với xăng'],
  ['phat', '#/phat-nguoi', 'search', 'Tra phạt nguội', 'Mở trang chính thức, kèm 9speed'],
  ['cl', '#/checklist', 'check', 'Kiểm tra trước chuyến đi xa', 'Lốp, dầu, nước, giấy tờ'],
  ['tn', '#/tai-nan', 'phone', 'Sự cố, tai nạn, cứu hộ', 'Số khẩn cấp 113, 114, 115 và các bước xử lý'],
  ['bh', '#/bao-hiem', 'shield', 'Bảo hiểm xe', 'Nhắc gia hạn, lưu ý khi mua'],
  ['bx', '#/ban-xe', 'doc', 'Sổ giao xe khi bán', 'Biên bản bàn giao, in hoặc lưu PDF'],
  ['gplx', '#/hen/moi?kind=gplx', 'doc', 'Nhắc hạn giấy phép lái xe', 'Hạng B, C, D có thời hạn'],
];

export function them() {
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Thêm'));
  const c = h('div', { class: 'card' });
  MUC.forEach(([id, href, ic, ten, mt]) => c.append(h('a', { class: 'item', href, 'data-muc': id }, h('span', { class: 'ic' }, icon(ic)), h('span', { class: 'grow' }, h('div', { class: 't' }, ten), h('div', { class: 'd' }, mt)), icon('chev', 'chev'))));
  c.append(h('button', { class: 'item', type: 'button', onclick: () => icsTatCa() }, h('span', { class: 'ic' }, icon('cal')), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Tải lịch nhắc (.ics)'), h('div', { class: 'd' }, 'Nhắc trước 30, 7 và 1 ngày trong lịch điện thoại')), icon('down')));
  el.append(c);
  const c2 = h('div', { class: 'card' });
  c2.append(h('a', { class: 'item', href: '#/du-lieu' }, h('span', { class: 'ic' }, icon('lock')), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Dữ liệu của tôi'), h('div', { class: 'd' }, 'Sao lưu, nhập lại, xóa sạch, giao diện')), icon('chev', 'chev')));
  c2.append(h('a', { class: 'item', href: '#/nguon' }, h('span', { class: 'ic' }, icon('book')), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Nguồn quy định'), h('div', { class: 'd' }, 'Chu kỳ đăng kiểm, mức đã xác minh')), icon('chev', 'chev')));
  c2.append(h('a', { class: 'item', href: '../license/' }, h('span', { class: 'ic' }, icon('flag')), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Ôn thi bằng lái (9license)'), h('div', { class: 'd' }, 'Bộ câu hỏi lý thuyết')), icon('chev', 'chev')));
  c2.append(h('a', { class: 'item', href: '../speed/' }, h('span', { class: 'ic' }, icon('speed')), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Cảnh báo tốc độ (9speed)'), h('div', { class: 'd' }, 'Biển báo, camera, tốc độ tối đa')), icon('chev', 'chev')));
  el.append(c2);
  el.append(h('p', { class: 'sub' }, '9car không bán bảo hiểm, không tư vấn pháp lý, bảo hiểm hay tài chính. Dữ liệu chỉ nằm trên máy bạn.'));
  return { tieuDe: 'Thêm', el };
}

export function duLieu() {
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Dữ liệu của tôi'));
  const dem = `${kho.xe.length} xe, ${kho.nhatKy.length} khoản nhật ký, ${kho.hen.length} mục nhắc`;
  el.append(h('section', { class: 'card' }, h('h2', {}, 'Riêng tư'),
    h('p', {}, 'Mọi dữ liệu của 9car (xe, biển số, ảnh, chi phí, nhắc hạn) chỉ lưu trong trình duyệt trên máy này (IndexedDB). Không có máy chủ nhận dữ liệu của bạn, không có quảng cáo hay theo dõi.'),
    h('p', { class: 'sub', style: 'margin-top:8px' }, `Hiện có: ${dem}.`),
    kho.luuTru === 'tam' ? h('div', { class: 'banner bad', style: 'margin-top:10px', role: 'alert' }, 'Trình duyệt đang chặn lưu trữ nên dữ liệu chỉ tồn tại tạm thời. Hãy tải bản sao lưu thường xuyên.') : null,
    h('p', { class: 'sub', style: 'margin-top:8px' }, 'Xóa dữ liệu trình duyệt hoặc gỡ ứng dụng sẽ làm mất dữ liệu, nên hãy sao lưu định kỳ.')));
  const inFile = h('input', { type: 'file', accept: 'application/json,.json', id: 'nhap-tep', style: 'display:none' });
  const tb = h('div', { role: 'status', 'aria-live': 'polite', class: 'sub', style: 'margin-top:8px' });
  inFile.addEventListener('change', async () => {
    const f = inFile.files && inFile.files[0]; inFile.value = '';
    if (!f) return;
    let obj;
    try {
      if (f.size > 40 * 1024 * 1024) throw new Error('Tệp quá lớn.');
      obj = JSON.parse(await f.text());
    } catch { tb.textContent = 'Không đọc được tệp. Hãy chọn tệp .json do 9car xuất ra.'; return; }
    if (!obj || obj.ung !== '9car' || !Array.isArray(obj.xe) || !Array.isArray(obj.nhatKy) || !Array.isArray(obj.hen)) { tb.textContent = 'Tệp này không phải bản sao lưu của 9car.'; return; }
    tb.textContent = '';
    const thay = await hoi({ tieuDe: 'Nhập bản sao lưu', noiDung: 'Chọn "Thay thế" để xóa dữ liệu hiện tại rồi nhập, hoặc "Gộp" để giữ dữ liệu hiện có và thêm dữ liệu từ tệp.', ok: 'Thay thế', huy: 'Gộp', nguyHiem: true });
    const r = await nhap(obj, thay ? 'thay' : 'gop');
    if (!r.ok) { tb.textContent = r.loi; return; }
    toast(`Đã nhập ${r.xe} xe, ${r.nhatKy} khoản, ${r.hen} mục nhắc`); app.render();
  });
  el.append(h('section', { class: 'card' }, h('h2', {}, 'Sao lưu và chuyển máy'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn block', type: 'button', id: 'xuat-json', onclick: () => { taiTep(`9car-sao-luu-${hom()}.json`, JSON.stringify(xuat(), null, 1), 'application/json'); toast('Đã tạo tệp sao lưu'); } }, icon('down'), 'Tải bản sao lưu (.json)'),
      h('button', { class: 'btn sec block', type: 'button', onclick: () => inFile.click() }, icon('up'), 'Nhập từ bản sao lưu'), inFile, tb),
    h('p', { class: 'sub', style: 'margin-top:10px' }, 'Đồng bộ giữa nhiều thiết bị qua tài khoản 9id sẽ có sau. Hiện tại hãy dùng tệp sao lưu để chuyển sang máy khác.')));
  const selT = h('select', { id: 'chu-de', 'aria-label': 'Giao diện' }, [['auto', 'Theo hệ thống'], ['light', 'Sáng'], ['dark', 'Tối']].map(([k, v]) => h('option', { value: k, selected: layTheme() === k }, v)));
  selT.addEventListener('change', () => datTheme(selT.value));
  const chk = h('input', { type: 'checkbox', id: 'chu-lon', checked: layChuLon() });
  chk.addEventListener('change', () => datChuLon(chk.checked));
  el.append(h('section', { class: 'card' }, h('h2', {}, 'Giao diện'),
    h('div', { class: 'field' }, h('label', { for: 'chu-de' }, 'Màu nền'), selT),
    h('label', { class: 'check', for: 'chu-lon' }, chk, 'Chữ lớn')));
  el.append(h('section', { class: 'card' }, h('h2', {}, 'Xóa sạch'),
    h('p', { class: 'sub', style: 'margin-bottom:10px' }, 'Xóa toàn bộ xe, nhật ký, nhắc hạn và cài đặt khỏi máy này. Không thể hoàn tác, hãy tải bản sao lưu trước.'),
    h('button', { class: 'btn bad block', type: 'button', id: 'xoa-het', onclick: async () => {
      const ok = await hoi({ tieuDe: 'Xóa toàn bộ dữ liệu?', noiDung: 'Mọi dữ liệu 9car trên máy này sẽ bị xóa vĩnh viễn.', ok: 'Xóa sạch', nguyHiem: true });
      if (!ok) return;
      await xoaSach(); toast('Đã xóa sạch dữ liệu trên máy này'); app.di('#/');
    } }, icon('trash'), 'Xóa toàn bộ dữ liệu')));
  return { tieuDe: 'Dữ liệu của tôi', quayVe: '#/them', el };
}

export function nguon() {
  const el = h('div', {}, h('h1', { class: 'h1' }, 'Nguồn quy định'),
    h('p', { class: 'sub' }, 'Tra cứu ngày 05/10/2026. Chi tiết đầy đủ trong tệp docs/NGUON.md của ứng dụng. Chưa đối chiếu nguyên văn bản gốc trên cổng văn bản nhà nước: các mục dưới đây dựa trên nhiều bài tổng hợp của báo chính thống và cổng thông tin pháp luật.'));
  const hang = (ten, nd, mau, nhan) => h('div', { class: 'item', style: 'align-items:flex-start' }, h('span', { class: 'grow' }, h('div', { class: 't' }, ten), h('div', { class: 'd' }, nd)), h('span', { class: `tag ${mau}` }, nhan));
  el.append(h('div', { class: 'card' },
    hang('Chu kỳ đăng kiểm ô tô con không kinh doanh', 'Thông tư 47/2024/TT-BGTVT (hiệu lực 01/01/2025): chu kỳ đầu 36 tháng; sản xuất đến 7 năm 24 tháng; trên 7 đến 20 năm 12 tháng; trên 20 năm 6 tháng.', 'xanh', 'Nhiều nguồn khớp'),
    hang('Ô tô đến 8 chỗ kinh doanh vận tải', 'Xe đến 8 chỗ kinh doanh vận tải: chu kỳ đầu 24 tháng; đến 5 năm 12 tháng; trên 5 năm 6 tháng.', 'xanh', 'Nhiều nguồn khớp'),
    hang('Xe cải tạo', 'Chu kỳ đầu 12 tháng, sau đó 6 tháng.', 'vang', 'Một nguồn'),
    hang('Ô tô tải, xe chuyên dùng', 'Các nguồn không thống nhất, 9car để bạn nhập hạn theo tem.', 'xam', 'Chưa xác minh'),
    hang('Xe máy: kiểm định khí thải', 'Luật Trật tự, an toàn giao thông đường bộ 2024: xe mô tô, xe gắn máy chỉ kiểm định khí thải. Chu kỳ 60/24/12 tháng theo thời gian sản xuất (đến 5 năm / trên 5 đến 12 năm / trên 12 năm).', 'vang', 'Qua tổng hợp'),
    hang('Mốc kiểm định khí thải xe máy', 'Quyết định 13/2026/QĐ-TTg: từ 01/7/2027 Hà Nội và TP. Hồ Chí Minh; từ 01/7/2028 các thành phố trực thuộc trung ương khác; từ 01/7/2030 các tỉnh còn lại.', 'vang', 'Một nguồn'),
    hang('Thời hạn bằng lái', 'Hạng A1, A, B1: không thời hạn; B, C1: 10 năm; C, D và hạng có rơ moóc: 5 năm (Luật 2024).', 'xanh', 'Nhiều nguồn khớp'),
    hang('Bảo hiểm TNDS bắt buộc', 'Nghị định 67/2023/NĐ-CP: thời hạn tối thiểu 1 năm, tối đa 3 năm. 9car không đưa mức phí.', 'vang', 'Qua tổng hợp'),
    hang('Chu kỳ đăng kiểm ô tô trên 8 chỗ', 'Nguồn tổng hợp mâu thuẫn (mốc 5 năm với 7 hoặc 15 năm). 9car để bạn nhập hạn theo tem, giấy kiểm định; chu kỳ gợi ý ghi rõ "chưa xác minh".', 'xam', 'Chưa xác minh'),
    hang('Phí sử dụng đường bộ', 'Từ 01/01/2026 áp dụng Nghị định 364/2025/NĐ-CP (thay Thông tư 70/2021/TT-BTC): nộp theo chu kỳ kiểm định hoặc theo năm dương lịch, không còn nộp theo tháng 6/18/30 tháng, không còn tem phí riêng (qua tổng hợp, kể cả Báo Chính phủ). Một bài ghi xe có chu kỳ 24 hoặc 36 tháng chọn nộp 12 tháng hoặc cả chu kỳ. Đối tượng chịu phí: nguồn nói ô tô được cấp đăng ký, biển số và giấy kiểm định, trừ trường hợp không chịu phí (trong đó có nhóm "xe bốn bánh có gắn động cơ"). CHƯA XÁC MINH ô tô con cá nhân có thuộc nhóm không chịu phí hay không (một nguồn ghi vẫn chịu 130.000 đ/tháng). 9car không đưa mức phí, bạn tự nhập hạn theo biên lai.', 'xam', 'Chưa xác minh đối tượng'),
    hang('Mẫu bảo dưỡng', 'Chỉ là gợi ý thông dụng, không phải quy định. Hãy theo sổ bảo hành của hãng xe.', 'xam', 'Không phải quy định')));
  el.append(h('p', { class: 'sub' }, 'Quy định có thể thay đổi. Luôn đối chiếu hạn với tem, giấy tờ thật và hướng dẫn của cơ quan đăng kiểm.'));
  return { tieuDe: 'Nguồn quy định', quayVe: '#/them', el };
}
