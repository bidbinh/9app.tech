// Ngưỡng THAM KHẢO để tô màu huyết áp và đường huyết. Không chẩn đoán; chỉ gợi ý "nên trao đổi với bác sĩ".
// Nguồn và mức kiểm chứng (xem README):
//   - Huyết áp: tăng huyết áp khi >= 140/90 mmHg (Hội Tim mạch học quốc gia Việt Nam VNHA/VSH 2022, tương đương ESC/ESH; đã đối chiếu qua tìm kiếm).
//     Mức "cao nhẹ" 130-139 / 85-89 theo phân loại "bình thường cao" của ESC/VNHA (từ kiến thức, CHƯA đối chiếu bản gốc).
//     Ngưỡng "thấp" < 90 hoặc < 60 mmHg là quy ước thường dùng (CHƯA kiểm chứng nguồn chính thức).
//     Ngưỡng cần cấp cứu >= 180 hoặc >= 120 (cơn tăng huyết áp, AHA/ESC; CHƯA đối chiếu nguồn Việt Nam).
//   - Đường huyết lúc đói (mmol/L): >= 7,0 mức chẩn đoán đái tháo đường, 6,1-6,9 rối loạn đường huyết lúc đói (WHO; đã đối chiếu qua tìm kiếm); < 3,9 thấp (ADA, 70 mg/dL).
//   - Sau ăn 2 giờ: >= 11,1 (WHO), 7,8-11,0 dung nạp glucose giảm (WHO; đã đối chiếu qua tìm kiếm).
//   - Cảnh báo nặng: < 3,0 mmol/L (ADA hạ đường huyết mức 2, 54 mg/dL) hoặc >= 16,7 (300 mg/dL, ngưỡng cảnh báo của app, CHƯA kiểm chứng nguồn).
// Người đang điều trị có mục tiêu riêng do bác sĩ đặt; mục tiêu đó thay cho ngưỡng chung ở đây.
export const EMERGENCY_TEXT = 'Nếu có triệu chứng nặng hãy đi cấp cứu hoặc gọi 115.';
export const CONSULT_TEXT = 'Nên trao đổi với bác sĩ.';
export const DISCLAIMER = 'Ngưỡng tham khảo chung, không phải chẩn đoán. Người đang điều trị theo mục tiêu riêng của bác sĩ thì theo mục tiêu đó.';

export const mmolToMgdl = (v) => Math.round(v * 18);

// level: ok | low | high | high_mild | severe_high | severe_low
export function classifyBp(sys, dia) {
  if (!(sys > 0) || !(dia > 0)) return { level: 'ok', label: '' };
  if (sys >= 180 || dia >= 120) return { level: 'severe_high', label: 'Rất cao so với ngưỡng tham khảo', emergency: true };
  if (sys >= 140 || dia >= 90) return { level: 'high', label: 'Cao so với ngưỡng tham khảo (từ 140/90)' };
  if (sys >= 130 || dia >= 85) return { level: 'high_mild', label: 'Hơi cao so với ngưỡng tham khảo (130-139/85-89)' };
  if (sys < 90 || dia < 60) return { level: 'low', label: 'Thấp so với ngưỡng tham khảo (dưới 90/60)' };
  return { level: 'ok', label: 'Trong ngưỡng tham khảo' };
}

// ctx: doi (lúc đói) | sau_an (sau ăn 2 giờ) | khac
export function classifyGlucose(mmol, ctx) {
  if (!(mmol > 0)) return { level: 'ok', label: '' };
  if (mmol < 3.0) return { level: 'severe_low', label: 'Rất thấp so với ngưỡng tham khảo', emergency: true };
  if (mmol >= 16.7) return { level: 'severe_high', label: 'Rất cao so với ngưỡng tham khảo', emergency: true };
  if (mmol < 3.9) return { level: 'low', label: 'Thấp so với ngưỡng tham khảo (dưới 3,9 mmol/L)' };
  if (ctx === 'sau_an') {
    if (mmol >= 11.1) return { level: 'high', label: 'Cao so với ngưỡng tham khảo sau ăn (từ 11,1 mmol/L)' };
    if (mmol >= 7.8) return { level: 'high_mild', label: 'Hơi cao so với ngưỡng tham khảo sau ăn (7,8-11,0 mmol/L)' };
    return { level: 'ok', label: 'Trong ngưỡng tham khảo' };
  }
  if (ctx === 'doi') {
    if (mmol >= 7.0) return { level: 'high', label: 'Cao so với ngưỡng tham khảo lúc đói (từ 7,0 mmol/L)' };
    if (mmol >= 6.1) return { level: 'high_mild', label: 'Hơi cao so với ngưỡng tham khảo lúc đói (6,1-6,9 mmol/L)' };
    return { level: 'ok', label: 'Trong ngưỡng tham khảo' };
  }
  // thời điểm khác: chỉ cảnh báo mức rất cao như ngưỡng sau ăn
  if (mmol >= 11.1) return { level: 'high', label: 'Cao so với ngưỡng tham khảo (từ 11,1 mmol/L nếu đo sau ăn)' };
  return { level: 'ok', label: 'Chưa đủ thông tin thời điểm đo để so ngưỡng' };
}

export function classify(m) {
  if (m.kind === 'bp') return classifyBp(Number(m.v1), Number(m.v2));
  if (m.kind === 'glucose') return classifyGlucose(Number(m.v1), m.ctx);
  return { level: 'ok', label: '' };
}
export const needsConsult = (c) => c.level !== 'ok';
