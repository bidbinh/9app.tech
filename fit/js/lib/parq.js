// Sàng lọc sức khỏe RÚT GỌN, do 9fit tự diễn đạt lại theo ý của PAR-Q+ (Physical Activity Readiness Questionnaire for Everyone,
// Warburton và cộng sự; Canadian Society for Exercise Physiology). Đây KHÔNG phải bản PAR-Q+ chính thức và không thay thế bác sĩ.
// Ba mức kết quả: 'duoc-phep', 'hoi-bac-si' (nên hỏi bác sĩ, chỉ tập nhẹ, không bật nhảy hay tối đa), 'dung-lai' (không tạo chương trình).
export const CAU_HOI = [
  { id: 'tim', muc: 'dung', chu: 'Bác sĩ từng nói bạn có bệnh tim hoặc huyết áp cao, hoặc chỉ nên vận động khi có người giám sát y tế?' },
  { id: 'nguc-gang-suc', muc: 'dung', chu: 'Bạn có thấy đau, tức hoặc nặng ở ngực khi vận động?' },
  { id: 'nguc-nghi', muc: 'dung', chu: 'Trong 12 tháng qua, bạn có đau ngực khi đang nghỉ ngơi (không vận động)?' },
  { id: 'choang', muc: 'dung', chu: 'Trong 12 tháng qua, bạn có hay bị chóng mặt, choáng, mất thăng bằng hoặc từng ngất xỉu?' },
  { id: 'thai', muc: 'dung', chu: 'Bạn đang mang thai hoặc mới sinh trong vài tháng gần đây?' },
  { id: 'xuong-khop', muc: 'hoi', chu: 'Bạn có vấn đề về xương, khớp hoặc cơ (kể cả chấn thương mới, đang đau) mà vận động có thể làm nặng thêm?' },
  { id: 'man-tinh', muc: 'hoi', chu: 'Bạn có bệnh mạn tính khác đang điều trị, như tiểu đường, hen, bệnh phổi, động kinh, bệnh thận, ung thư?' },
  { id: 'thuoc', muc: 'hoi', chu: 'Bạn đang dùng thuốc theo toa cho huyết áp, tim mạch, tiểu đường, hen, động kinh, thuốc chống đông hoặc bệnh mạn tính khác?' },
  { id: 'khac', muc: 'hoi', chu: 'Bạn có lý do khác khiến bác sĩ hoặc chính bạn nghĩ nên hạn chế vận động (ví dụ mới phẫu thuật)?' },
  { id: 'it-van-dong', muc: 'luuy', chu: 'Hiện bạn ít vận động (ngồi nhiều, dưới khoảng 30 phút vận động mỗi ngày)?' },
];

export const TUOI_TOI_THIEU = 16;
export const TUOI_NEN_HOI = 65;
export const TUOI_TOI_DA = 100;

const HD = {
  tre: 'Dưới 16 tuổi: 9fit không tạo chương trình tập. Hãy hỏi huấn luyện viên của đội hoặc câu lạc bộ, phụ huynh hoặc bác sĩ để có chương trình phù hợp lứa tuổi. Bạn vẫn xem được thư viện bài tập để tham khảo.',
  thai: 'Mang thai hoặc mới sinh: hãy trao đổi với bác sĩ sản khoa về loại và mức vận động an toàn trước khi tập. 9fit không tạo chương trình cho giai đoạn này, nhưng bạn vẫn xem được thư viện.',
  tim: 'Các dấu hiệu về tim, ngực, chóng mặt cần được bác sĩ đánh giá trước khi tập. Hãy đi khám và hỏi rõ mức vận động cho phép.',
  hoi: 'Bạn nên hỏi bác sĩ trước khi tăng mức vận động. Trong lúc chờ, chỉ nên tập nhẹ: 9fit tạm không cho thêm bài khó, bật nhảy hay bài kiểm tra thể lực tối đa.',
};

/**
 * tuoi: số hoặc null. traLoi: { [id]: true | false }.
 * Trả về { ketQua, lyDo[], huongDan[], luuY[] }; ketQua 'thieu' nếu chưa đủ thông tin.
 */
export function danhGiaSangLoc(tuoi, traLoi) {
  if (!Number.isFinite(tuoi) || tuoi <= 0) return { ketQua: 'thieu', lyDo: ['Chưa nhập tuổi.'], huongDan: [], luuY: [] };
  if (tuoi > TUOI_TOI_DA) return { ketQua: 'thieu', lyDo: [`Tuổi nên nằm trong khoảng 1 đến ${TUOI_TOI_DA}.`], huongDan: [], luuY: [] };
  if (CAU_HOI.some((c) => traLoi?.[c.id] === undefined)) return { ketQua: 'thieu', lyDo: ['Chưa trả lời hết các câu hỏi.'], huongDan: [], luuY: [] };
  const dung = []; const hoi = []; const huongDan = []; const luuY = [];
  if (tuoi < TUOI_TOI_THIEU) { dung.push(`Dưới ${TUOI_TOI_THIEU} tuổi.`); huongDan.push(HD.tre); }
  for (const c of CAU_HOI) {
    if (traLoi[c.id] !== true) continue;
    if (c.muc === 'dung') { dung.push(c.chu); huongDan.push(c.id === 'thai' ? HD.thai : HD.tim); } else if (c.muc === 'hoi') hoi.push(c.chu);
    else luuY.push('Bạn đang ít vận động: hãy bắt đầu với 2 buổi nhẹ mỗi tuần, tăng chậm trong vài tuần.');
  }
  if (tuoi >= TUOI_NEN_HOI) hoi.push(`Từ ${TUOI_NEN_HOI} tuổi trở lên nên hỏi bác sĩ trước khi bắt đầu hoặc tăng mức tập.`);
  if (dung.length) return { ketQua: 'dung-lai', lyDo: [...dung], huongDan: [...new Set(huongDan)], luuY };
  if (hoi.length) return { ketQua: 'hoi-bac-si', lyDo: hoi, huongDan: [HD.hoi], luuY };
  return { ketQua: 'duoc-phep', lyDo: [], huongDan: [], luuY };
}
