// Phân nhóm gợi ý cho các câu chương V (báo hiệu đường bộ) theo từ khóa, để tra cứu nhanh.
// Chỉ là gợi ý tự động trên nội dung câu hỏi, không phải phân loại chính thức của QCVN 41.
export const SIGN_GROUPS = [
  { id: 'cam', ten: 'Biển cấm, hạn chế' },
  { id: 'nguy', ten: 'Biển nguy hiểm, cảnh báo' },
  { id: 'lenh', ten: 'Biển hiệu lệnh' },
  { id: 'chidan', ten: 'Biển chỉ dẫn' },
  { id: 'phu', ten: 'Biển phụ, hiệu lực' },
  { id: 'vach', ten: 'Vạch kẻ đường' },
];

export function signGroup(q) {
  const qq = q.q.toLowerCase();
  const t = qq + ' ' + (q.opts[q.a] || '').toLowerCase();
  if (/vạch/.test(qq)) return 'vach';
  if (/biển phụ|hiệu lực|biển số \d|ba biển này|hai biển này|các biển này/.test(qq)) return 'phu';
  if (/chỉ dẫn|cao tốc|hầm chui|khu dân cư|ưu tiên qua|được quyền ưu tiên|làn đường cứu nạn|bến|cầu vượt|đường cụt|cắt qua|liên thông|địa giới|tên đường/.test(t)) return 'chidan';
  if (/cấm|hết mọi lệnh|hết tốc độ|hạn chế|không (được|cho phép)|được phép|cho phép|dừng lại|nhường đường cho người đi bộ|tốc độ tối đa|cự ly/.test(t)) return 'cam';
  if (/nguy hiểm|cảnh báo|giao nhau|cầu hẹp|đường hẹp|thu hẹp|dốc|trẻ em|đường sắt|kè|vực|lề đường|gồ ghề|trơn|thận trọng|đi chậm|đường đôi|hai chiều|ngoặt|đường cong|thường xảy ra|đường hầm|cầu quay|chướng ngại|cửa chui|đang tiến hành|đường ưu tiên/.test(t)) return 'nguy';
  if (/phải|bắt buộc|hướng|vòng xuyến|đảo an toàn|chạy vòng|dành cho|tốc độ tối thiểu|rẽ|đi thẳng|quay đầu/.test(t)) return 'lenh';
  return 'chidan';
}
