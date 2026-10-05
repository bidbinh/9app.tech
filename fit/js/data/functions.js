// Nguồn của chỉ mục tìm kiếm chức năng (search-index.json). Chạy: node scripts/make-search-index.js
import { BAI_TAP } from './exercises.js';
import { CHUONG_TRINH } from './programs.js';
import { CHUOI } from './routines.js';
import { boDau } from '../lib/text.js';
import { NHOM, DUNG_CU } from './ex-base.js';

const fold = (s) => boDau(s).toLowerCase();
function kw(...ds) {
  const out = [];
  for (const d of ds) for (const t of [].concat(d)) {
    const a = String(t).toLowerCase().trim();
    for (const v of [a, fold(a)]) if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export function danhSachChucNang() {
  const L = [
    { name: 'Hôm nay', keywords: kw('hôm nay', 'buổi tập hôm nay', 'bắt đầu nhanh', 'tải tuần'), path: '#/', blurb: 'Buổi tập hôm nay, tải tập tuần này và nút bắt đầu nhanh.' },
    { name: 'Tập', keywords: kw('tập', 'luyện tập', 'chương trình và nhật ký'), path: '#/tap', blurb: 'Chương trình đang theo, ghi buổi tập, lịch sử.' },
    { name: 'Tập: Ghi buổi tập', keywords: kw('ghi buổi tập', 'nhật ký tập', 'ghi hiệp lần mức tạ', 'hẹn giờ nghỉ', 'nghỉ giữa hiệp', 'bản nháp'), path: '#/tap/ghi', blurb: 'Chọn bài, ghi hiệp, lần, mức tạ hoặc RPE; hẹn giờ nghỉ giữa hiệp.' },
    { name: 'Tập: Lịch sử buổi tập', keywords: kw('lịch sử', 'buổi tập cũ', 'sao chép buổi', 'kỷ lục', 'pr'), path: '#/tap/lich-su', blurb: 'Xem, sửa, xóa và sao chép các buổi tập đã ghi.' },
    { name: 'Tập: Ghi buổi chơi thể thao', keywords: kw('buổi chơi', 'ghi buổi chơi', 'cầu lông', 'pickleball', 'bóng đá', 'chạy bộ', 'rpe'), path: '#/tap/choi', blurb: 'Ghi nhanh môn, thời lượng và cường độ để tính tải tập tổng.' },
    { name: 'Tập: Chương trình mẫu', keywords: kw('chương trình', 'chương trình mẫu', 'lịch tập tuần', 'giảm tải trước giải'), path: '#/tap/chuong-trinh', blurb: 'Chương trình 2 đến 4 tuần theo môn và theo mục tiêu.' },
    { name: 'Thư viện bài tập', keywords: kw('thư viện', 'bài tập', 'tại nhà không dụng cụ', 'lọc bài tập', 'nhóm cơ', 'dụng cụ'), path: '#/thu-vien', blurb: `${BAI_TAP.length} bài tập tiếng Việt, lọc theo nhóm cơ, dụng cụ, mức độ, môn.` },
    { name: 'Tiến độ', keywords: kw('tiến độ', 'biểu đồ', 'theo dõi'), path: '#/tien-do', blurb: 'Tải tập, khối lượng, cân nặng, vòng đo và bài kiểm tra thể lực.' },
    { name: 'Tiến độ: Tải tập tuần', keywords: kw('tải tập', 'tải tuần', 'srpe', 'quá tải', 'tăng tải', 'acute chronic'), path: '#/tien-do/tai', blurb: 'Tải tập tổng (buổi tập và buổi chơi) và cảnh báo nhẹ khi tăng tải nhanh.' },
    { name: 'Tiến độ: Khối lượng theo nhóm cơ', keywords: kw('khối lượng', 'khối lượng tập', 'hiệp lần kg', 'nhóm cơ mỗi tuần'), path: '#/tien-do/khoi-luong', blurb: 'Số hiệp và khối lượng theo nhóm cơ mỗi tuần.' },
    { name: 'Tiến độ: Cân nặng và vòng đo', keywords: kw('cân nặng', 'vòng eo', 'vòng đo', 'mục tiêu cân nặng'), path: '#/tien-do/do', blurb: 'Ghi cân nặng, vòng đo và xem biểu đồ.' },
    { name: 'Tiến độ: Kiểm tra thể lực', keywords: kw('kiểm tra thể lực', 'chống đẩy tối đa', 'plank', 'nhảy cao', 'chạy 12 phút', 'cooper', '1,6 km', 'ngồi đứng 30 giây'), path: '#/tien-do/test', blurb: 'Bài kiểm tra định kỳ, so sánh với chính bạn.' },
    { name: 'Thêm', keywords: kw('thêm', 'tiện ích khác'), path: '#/them', blurb: 'Hẹn giờ, khởi động, sức khỏe và dữ liệu.' },
    { name: 'Khởi động, giãn cơ, phục hồi', keywords: kw('khởi động', 'giãn cơ', 'phục hồi', 'hẹn giờ từng động tác', 'đọc to', 'yoga'), path: '#/them/khoi-dong', blurb: 'Chuỗi 5 đến 30 phút theo môn, có hẹn giờ và giọng đọc.' },
    { name: 'Sàng lọc sức khỏe (PAR-Q+)', keywords: kw('sàng lọc', 'sức khỏe', 'par-q', 'parq', 'an toàn', 'khi nào dừng tập', 'không phải tư vấn y tế'), path: '#/them/suc-khoe', blurb: 'Câu hỏi sức khỏe lần đầu và hướng dẫn an toàn.' },
    { name: 'Dữ liệu của tôi', keywords: kw('dữ liệu', 'xuất dữ liệu', 'nhập dữ liệu', 'sao lưu', 'xóa dữ liệu', 'quyền riêng tư', 'chữ lớn'), path: '#/them/du-lieu', blurb: 'Xuất, nhập, xóa dữ liệu; dữ liệu chỉ nằm trên máy bạn.' },
    { name: 'Giới thiệu và nguồn tham khảo', keywords: kw('giới thiệu', 'nguồn', 'nguồn tham khảo', 'acsm', 'nsca', 'who'), path: '#/them/ve', blurb: 'Nguồn kiến thức, giới hạn và cách 9fit xử lý dữ liệu.' },
  ];
  for (const ct of CHUONG_TRINH) {
    L.push({ name: `Chương trình: ${ct.ten}`, keywords: kw(ct.ten, ct.mon ? ct.mon.replace('-', ' ') : '', 'chương trình'), path: `#/tap/chuong-trinh/${ct.id}`, blurb: ct.mota.split('. ')[0].replace(/\.$/, '') + '.' });
  }
  for (const c of CHUOI) {
    if (c.mon !== 'chung' && c.phut !== 10 && c.phut !== 20) continue;
    if (c.mon === 'chung' && c.loai !== 'yoga' && c.phut !== 10 && c.phut !== 20) continue;
    L.push({ name: `${c.loai === 'khoi-dong' ? 'Khởi động' : c.loai === 'yoga' ? 'Yoga' : 'Phục hồi'}: ${c.ten}`, keywords: kw(c.ten, c.loai === 'yoga' ? ['yoga', 'giãn cơ'] : c.loai === 'khoi-dong' ? ['khởi động'] : ['giãn cơ', 'phục hồi']), path: `#/them/khoi-dong/${c.id}`, blurb: 'Chuỗi có hẹn giờ từng động tác, chạy được khi mất mạng.' });
  }
  for (const b of BAI_TAP) {
    L.push({ name: `Bài tập: ${b.ten}`, keywords: kw(b.ten, b.nhomChinh.map((n) => NHOM[n]), b.dungCu.map((d) => DUNG_CU[d])), path: `#/thu-vien/${b.id}`, blurb: `${b.nhomChinh.map((n) => NHOM[n]).join(', ')}. ${b.buoc[0]}` });
  }
  return L;
}
