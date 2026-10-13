// Sinh search-index.json theo định dạng vannien/docs/SEARCH-INDEX.md. Chạy: node scripts/gen-search-index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const goc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// [name, path, blurb, [từ khóa có dấu]]
const M = [
  ['Hôm nay: còn lại trong kỳ lương', '#/', 'Số tiền còn dùng được trong kỳ lương, mỗi ngày, các hũ và nhắc việc.', ['hôm nay', 'còn lại', 'số dư kỳ lương', 'trợ lý lương', '9payday', 'payday']],
  ['Ghi nhanh chi tiêu bằng một câu hoặc giọng nói', '#/', 'Gõ hoặc nói "cà phê 45k", app tách số tiền và danh mục.', ['ghi nhanh chi tiêu', 'ghi chi tiêu', 'giọng nói', 'cà phê 45k', 'sổ chi tiêu', 'ghi chép chi tiêu']],
  ['Lương: tính Gross sang Net', '#/luong', 'Tính lương thực nhận từ lương gross: bảo hiểm, giảm trừ gia cảnh, thuế TNCN từng bước.', ['lương', 'tính lương', 'gross sang net', 'gross net', 'lương thực nhận', 'thuế thu nhập cá nhân', 'thuế tncn', 'bảo hiểm xã hội', 'giảm trừ gia cảnh', 'người phụ thuộc', 'làm thêm giờ', 'thưởng tháng 13', 'phụ cấp ăn trưa']],
  ['Lương: tính Net sang Gross', '#/luong', 'Muốn nhận net bao nhiêu thì gross cần bao nhiêu khi thương lượng lương.', ['net sang gross', 'thương lượng lương', 'tìm gross', 'lương net mong muốn']],
  ['Lương: so sánh thuế mới và cũ', '#/luong', 'So sánh thuế TNCN biểu 5 bậc mới (giảm trừ 15,5 triệu) với quy định cũ.', ['so sánh thuế mới cũ', 'luật thuế tncn mới', 'biểu thuế 5 bậc', 'giảm trừ 15,5 triệu', 'thuế 2026']],
  ['Lương: nguồn quy định và mức xác minh', '#/luong/nguon', 'Số điều luật, ngày tra cứu, chỗ nào chưa xác minh được.', ['nguồn quy định', 'điều luật', 'luật 109/2025', 'nghị quyết 110', 'xác minh']],
  ['Tiền: hũ chi tiêu và dự báo dòng tiền', '#/tien', 'Chia lương thành các hũ, xem còn bao nhiêu mỗi hũ và dự báo cuối kỳ.', ['hũ chi tiêu', 'dòng tiền', 'dự báo chi tiêu', 'quản lý chi tiêu', 'ngân sách tháng', 'chi tiêu']],
  ['Tiền: chỉnh hũ và khoản cố định', '#/tien/cai-dat', 'Mẫu 50-30-20, 4 hũ, 6 hũ; khoản cố định như thuê nhà, trả góp.', ['50-30-20', '6 hũ', 'chia hũ', 'khoản cố định', 'tiền thuê nhà', 'ngày nhận lương']],
  ['Mục tiêu: tiết kiệm theo hạn', '#/muctieu', 'Mục tiêu cần bao nhiêu tiền, hạn nào, mỗi tháng cần để dành bao nhiêu.', ['mục tiêu tiết kiệm', 'để dành mỗi tháng', 'quỹ dự phòng', 'tiết kiệm mua nhà', 'tiết kiệm mua xe']],
  ['Vay: máy tính trả góp và trả nợ sớm', '#/muctieu/vay', 'Tiền trả mỗi tháng, tổng lãi, bảng trả nợ, so sánh trả nợ trước hạn.', ['máy tính vay', 'trả góp', 'vay mua nhà', 'vay mua xe', 'lãi suất vay', 'trả nợ sớm', 'trả nợ trước hạn', 'niên kim', 'gốc đều']],
  ['Gửi tiết kiệm và lãi kép', '#/muctieu/gui', 'Số tiền sau vài năm khi gửi vốn và góp thêm mỗi tháng.', ['lãi kép', 'gửi tiết kiệm', 'lãi suất gửi', 'tính lãi tiết kiệm']],
  ['Thêm: quyết toán thuế TNCN cuối năm', '#/them/quyettoan', 'Ước tính hoàn hay nộp thêm thuế, hạn nộp, danh sách chứng từ cần gom.', ['quyết toán thuế', 'quyết toán thuế tncn', 'hoàn thuế', 'hạn quyết toán', 'chứng từ khấu trừ', 'ủy quyền quyết toán']],
  ['Thêm: lịch lương và nhắc', '#/them/lich', 'Ngày nhận lương, hạn đóng thẻ, hạn vay; xuất tệp .ics có nhắc.', ['lịch lương', 'nhắc đóng thẻ', 'nhắc trả nợ', 'tệp ics', 'nhắc ngày lương', 'hạn thẻ tín dụng']],
  ['Thêm: dữ liệu của tôi', '#/them/du-lieu', 'Xuất, nhập, xóa sạch dữ liệu. Dữ liệu chỉ nằm trên máy bạn.', ['dữ liệu của tôi', 'xuất dữ liệu', 'sao lưu', 'xóa dữ liệu', 'riêng tư']],
  ['Thêm: giới thiệu và riêng tư', '#/them/gioi-thieu', 'App làm gì, không làm gì, lưu gì và không lưu gì.', ['giới thiệu', 'riêng tư', 'chữ lớn']],
];

const gop = new Map();
for (const [name, p, blurb, kws] of M) { if (!gop.has(p)) gop.set(p, [name, p, blurb, [...kws, name.split(': ').pop()]]); else gop.get(p)[3].push(...kws, name.split(': ').pop()); }
const out = [...gop.values()].map(([name, p, blurb, kws]) => {
  const set = [];
  for (const k of kws) { const a = k.toLowerCase(); for (const v of [a, fold(a)]) if (!set.includes(v)) set.push(v); }
  return { name, keywords: set, path: p, blurb };
});
const paths = out.map((x) => x.path);
if (new Set(paths).size !== paths.length) throw new Error('Trùng mục');
fs.writeFileSync(path.join(goc, 'search-index.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Đã sinh search-index.json với', out.length, 'mục');
