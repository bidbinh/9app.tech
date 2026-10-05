// Sinh gift/search-index.json theo định dạng vannien/docs/SEARCH-INDEX.md.
// Mỗi từ khóa có dấu luôn kèm bản không dấu; không trùng nhau. Chạy: node scripts/make-search-index.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const M = [
  ['9gift: Sắp tới 30 ngày', '#/', 'Việc cần chuẩn bị và các dịp trong 30 ngày tới: sinh nhật, ngày giỗ, kỷ niệm, lễ Tết.', ['sắp tới', 'nhắc ngày', 'nhắc sinh nhật', 'ngày quan trọng', 'việc cần làm', 'nhắc quà', '9gift', 'sổ lễ']],
  ['9gift: Sổ lễ', '#/le', 'Sổ ghi phong bì mừng cưới, hiếu hỉ đã đi và đã nhận, lọc theo năm, xuất CSV, in.', ['sổ lễ', 'sổ mừng', 'mừng cưới', 'phong bì', 'phong bì cưới', 'hiếu hỉ', 'sổ mừng cưới', 'xuất csv sổ lễ', 'in sổ lễ']],
  ['9gift: Ghi khoản lễ', '#/le/moi', 'Ghi nhanh một khoản mừng hoặc phúng viếng bằng một câu nói hoặc biểu mẫu.', ['ghi khoản lễ', 'ghi phong bì', 'phúng viếng', 'tân gia', 'đầy tháng', 'thôi nôi', 'ghi bằng giọng nói', 'nói để ghi', 'thêm khoản mừng']],
  ['9gift: Nợ lễ', '#/le/no', 'Ai đã mừng mình mà chưa đáp lễ, ai mình đã mừng mà chưa nhận lại, gợi ý mức đáp lễ tham khảo.', ['nợ lễ', 'đáp lễ', 'chưa đáp lễ', 'trả lễ', 'có đi có lại', 'ai mừng mình', 'mức mừng', 'mừng bao nhiêu']],
  ['9gift: Thống kê sổ lễ', '#/le/thong-ke', 'Tổng chi mừng theo năm và theo loại sự kiện, biểu đồ.', ['thống kê', 'tổng chi mừng', 'chi mừng cưới theo năm', 'biểu đồ phong bì', 'đã chi đã nhận']],
  ['9gift: Danh bạ người thân', '#/ban', 'Danh bạ người thân, bạn bè, đồng nghiệp với ngày sinh dương hoặc âm, sở thích, dị ứng.', ['danh bạ', 'người thân', 'bạn bè', 'đồng nghiệp', 'họ nội', 'họ ngoại', 'ngày sinh', 'dị ứng', 'sở thích']],
  ['9gift: Thêm người vào danh bạ', '#/ban/moi', 'Thêm người thân với ngày sinh dương lịch hoặc âm lịch để được nhắc sinh nhật.', ['thêm người', 'thêm người thân', 'sinh nhật âm lịch', 'ngày sinh âm', 'thêm bạn']],
  ['9gift: Gợi ý quà', '#/qua', 'Gợi ý quà theo người nhận, dịp và ngân sách, kèm mẹo nhỏ. Không liên kết bán hàng.', ['gợi ý quà', 'tặng quà gì', 'quà sinh nhật', 'quà tân gia', 'quà 8/3', 'quà 20/10', 'quà 20/11', 'quà tết', 'quà trung thu', 'quà tặng', 'mua gì tặng']],
  ['9gift: Lời chúc', '#/qua/chuc', 'Lời chúc mẫu theo dịp và giọng văn: trang trọng, thân mật, hài hước nhẹ; lời chia buồn đúng chuẩn.', ['lời chúc', 'chúc sinh nhật', 'chúc mừng đám cưới', 'chúc tết', 'chúc mừng năm mới', 'lời chia buồn', 'phân ưu', 'chúc 8/3', 'chúc 20/11', 'chúc tân gia', 'chúc khai trương', 'chúc thăng chức']],
  ['9gift: Quà của tôi', '#/qua/cua-toi', 'Ý tưởng quà muốn tặng và quà đã tặng cho từng người, tránh tặng trùng.', ['quà của tôi', 'ý tưởng quà', 'quà đã tặng', 'tránh tặng trùng', 'danh sách quà']],
  ['9gift: Ngày quan trọng', '#/them/ngay', 'Ngày giỗ, ngày cưới, kỷ niệm theo dương hoặc âm lịch, nhắc lại mỗi năm.', ['ngày giỗ', 'giỗ', 'kỷ niệm ngày cưới', 'ngày cưới', 'nhắc giỗ', 'giỗ âm lịch', 'kỷ niệm']],
  ['9gift: Dịp lễ cần nhắc', '#/them/dip', 'Bật nhắc 8/3, 20/10, 20/11, Tết, Trung thu, Vu Lan, Ngày của Mẹ, Ngày của Cha.', ['dịp lễ', '8/3', '20/10', '20/11', 'trung thu', 'vu lan', 'ngày của mẹ', 'ngày của cha', 'valentine']],
  ['9gift: Nhắc qua lịch điện thoại', '#/them/nhac', 'Tải tệp .ics có lời nhắc để điện thoại báo đúng ngày sinh nhật, ngày giỗ.', ['ics', 'nhắc qua lịch', 'thêm vào google calendar', 'lịch điện thoại', 'báo thức sinh nhật', 'xuất lịch']],
  ['9gift: Dữ liệu của tôi', '#/them/du-lieu', 'Sao lưu, nhập lại, xuất CSV và xóa sạch dữ liệu. Dữ liệu chỉ nằm trên máy.', ['dữ liệu của tôi', 'sao lưu', 'nhập sao lưu', 'xóa dữ liệu', 'xuất dữ liệu', 'riêng tư', 'quyền riêng tư']],
  ['9gift: Giao diện, chữ lớn', '#/them/giao-dien', 'Chữ lớn dễ đọc, chế độ sáng tối, ẩn số tiền.', ['chữ lớn', 'chế độ tối', 'giao diện', 'ẩn số tiền']],
  ['9gift: Về 9gift', '#/them/gioi-thieu', 'Riêng tư, cách nhắc ngày âm, nguồn nội dung và lưu ý.', ['giới thiệu', 'về 9gift', 'nguồn nội dung', 'lưu ý']],
];
const out = M.map(([name, path, blurb, kws]) => {
  const set = [];
  for (const k of kws.map((x) => x.toLowerCase())) { for (const v of [k, fold(k)]) if (!set.includes(v)) set.push(v); }
  return { name, keywords: set, path, blurb };
});
fs.writeFileSync(fileURLToPath(new URL('../search-index.json', import.meta.url)), `${JSON.stringify(out, null, 2)}\n`);
console.log('đã tạo search-index.json với', out.length, 'mục');
