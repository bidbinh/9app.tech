// Danh mục quy định và mức xác minh. Dùng cho màn "Nguồn và mức xác minh" và để sinh docs/NGUON.md (node scripts/gen-nguon.mjs).
// Mức xác minh: goc = đọc từ văn bản gốc (tệp PDF Luật 109/2025/QH15 tải về và đọc) ; thu-cap = đối chiếu qua nhiều bài của báo/cổng pháp luật,
// chưa đọc văn bản gốc ; chua = chưa xác minh được.
export const NGAY_TRA_CUU = '05/10/2026';

export const NGUON = [
  { nhom: 'Thuế TNCN từ tiền lương (quy định mới)', muc: [
    { nd: 'Biểu thuế lũy tiến từng phần 5 bậc theo tháng: đến 10 triệu 5%, trên 10 đến 30 triệu 10%, trên 30 đến 60 triệu 20%, trên 60 đến 100 triệu 30%, trên 100 triệu 35% (theo năm: 120 / 360 / 720 / 1.200 triệu)', cd: 'Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 9 khoản 2', xm: 'goc', gc: 'Đọc trực tiếp bảng trong tệp văn bản Luật. Lưu ý: một bài báo tra cứu (Vietnamnet) ghi sai các ngưỡng 10/20/50/100 triệu, app KHÔNG dùng số đó.' },
    { nd: 'Giảm trừ gia cảnh: bản thân 15,5 triệu/tháng (186 triệu/năm); mỗi người phụ thuộc 6,2 triệu/tháng', cd: 'Luật 109/2025/QH15 Điều 10 khoản 1; cũng là mức của Nghị quyết 110/2025/UBTVQH15 ngày 17/10/2025', xm: 'goc', gc: 'Mức trong Luật đọc từ văn bản gốc. Nghị quyết 110 chỉ đối chiếu qua nguồn thứ cấp.' },
    { nd: 'Hiệu lực: Luật có hiệu lực 01/07/2026; các quy định về thu nhập từ tiền lương, tiền công của cá nhân cư trú áp dụng từ kỳ tính thuế năm 2026; Luật 04/2007/QH12 hết hiệu lực phần tiền lương từ kỳ tính thuế 2026', cd: 'Luật 109/2025/QH15 Điều 29 khoản 1, 2, 3', xm: 'goc', gc: 'Vì vậy "quy định mới" là quy định đang áp dụng cho thu nhập tiền lương năm 2026.' },
    { nd: 'Thu nhập tính thuế từ tiền lương = tổng thu nhập chịu thuế trừ khoản đóng BHXH, BHYT, BHTN (và các khoản bảo hiểm bắt buộc khác), quỹ hưu trí bổ sung, và các khoản giảm trừ', cd: 'Luật 109/2025/QH15 Điều 8 khoản 2', xm: 'goc', gc: '' },
    { nd: 'Miễn thuế tiền lương làm việc ban đêm, làm thêm giờ (toàn bộ, theo đúng quy định pháp luật lao động) và tiền lương trả cho ngày không nghỉ phép', cd: 'Luật 109/2025/QH15 Điều 4 khoản 8; hướng dẫn tại Nghị định 253/2026/NĐ-CP Điều 26', xm: 'goc', gc: 'Điều luật đọc từ văn bản gốc. Nghị định 253 chỉ qua nguồn thứ cấp.' },
    { nd: 'Tiền ăn giữa ca, ăn trưa: chi bằng tiền thì miễn thuế tối đa 1,2 triệu đồng/người/tháng (trước đó 730.000đ); doanh nghiệp tự tổ chức bữa ăn hoặc cấp phiếu ăn thì không khống chế mức. Hiệu lực 01/07/2026', cd: 'Nghị định 253/2026/NĐ-CP (ban hành 30/06/2026) Điều 8 khoản 2', xm: 'thu-cap', gc: 'Các bài viết ghi điểm g hoặc điểm k, chưa thống nhất. Chưa đọc văn bản gốc.' },
    { nd: 'Đóng quỹ hưu trí bổ sung tự nguyện được trừ tối đa 3 triệu/tháng (trước đó 1 triệu)', cd: 'Nghị định 253/2026/NĐ-CP Điều 46 khoản 2 điểm a', xm: 'thu-cap', gc: 'Chỉ qua nguồn thứ cấp.' },
    { nd: 'Giảm trừ chi phí y tế, giáo dục tối đa 23 và 24 triệu/năm', cd: 'Nghị định 253/2026/NĐ-CP Điều 49 khoản 2', xm: 'thu-cap', gc: 'App chưa tính khoản này. Nguồn thứ cấp.' },
    { nd: 'Phụ cấp xăng xe, điện thoại, đi lại: mức miễn thuế', cd: 'Không tìm được văn bản gốc', xm: 'chua', gc: 'App coi là thu nhập chịu thuế, không tự miễn. Nếu công ty hoàn chi theo chứng từ và quy chế thì có thể khác.' },
  ] },
  { nhom: 'Quy định cũ (chỉ dùng để so sánh và quyết toán năm 2025 trở về trước)', muc: [
    { nd: 'Biểu thuế 7 bậc theo tháng: 5 / 10 / 18 / 32 / 52 / 80 triệu với thuế suất 5, 10, 15, 20, 25, 30, 35%', cd: 'Luật Thuế TNCN 04/2007/QH12 Điều 22 (sửa đổi), hướng dẫn tại TT 111/2013/TT-BTC', xm: 'thu-cap', gc: 'Nhiều nguồn khớp nhau; chưa đọc văn bản gốc.' },
    { nd: 'Giảm trừ gia cảnh bản thân 11 triệu/tháng, người phụ thuộc 4,4 triệu/tháng', cd: 'Nghị quyết 954/2020/UBTVQH14', xm: 'thu-cap', gc: '' },
    { nd: 'Tiền làm thêm giờ, ban đêm: chỉ phần chênh lệch cao hơn tiền lương giờ làm việc bình thường được miễn thuế', cd: 'Thông tư 111/2013/TT-BTC', xm: 'thu-cap', gc: 'Luật mới thay bằng miễn toàn bộ.' },
    { nd: 'Tiền ăn giữa ca miễn thuế tối đa 730.000đ/tháng (áp dụng trước 01/07/2026)', cd: 'TT 26/2016/TT-BLĐTBXH, TT 111/2013/TT-BTC', xm: 'thu-cap', gc: '' },
  ] },
  { nhom: 'Bảo hiểm bắt buộc của người lao động', muc: [
    { nd: 'Tỷ lệ người lao động đóng: BHXH 8%, BHYT 1,5%, BHTN 1% (tổng 10,5%)', cd: 'Luật BHXH 2024 số 41/2024/QH15, Luật BHYT, Luật Việc làm 2025', xm: 'thu-cap', gc: 'Số điều chưa xác minh.' },
    { nd: 'Mức lương tối đa tính đóng BHXH và BHYT: 20 lần lương cơ sở', cd: 'Luật BHXH 2024 (41/2024/QH15)', xm: 'thu-cap', gc: 'Số điều chưa xác minh.' },
    { nd: 'Lương cơ sở: 2.340.000đ (từ 01/07/2024), 2.530.000đ (từ 01/07/2026) nên trần BHXH/BHYT là 46,8 triệu rồi 50,6 triệu', cd: 'Nghị định 73/2024/NĐ-CP; Nghị định 161/2026/NĐ-CP (ban hành 15/05/2026)', xm: 'thu-cap', gc: 'Nhiều nguồn khớp nhau.' },
    { nd: 'Mức lương tối đa tính đóng BHTN: 20 lần lương tối thiểu tháng theo vùng', cd: 'Luật Việc làm (số điều chưa xác minh)', xm: 'thu-cap', gc: '' },
    { nd: 'Lương tối thiểu tháng theo vùng từ 01/01/2026: vùng I 5.310.000; II 4.730.000; III 4.140.000; IV 3.700.000', cd: 'Nghị định 293/2025/NĐ-CP (ban hành 10/11/2025)', xm: 'thu-cap', gc: 'Nhiều nguồn khớp nhau.' },
    { nd: 'Lương tối thiểu tháng theo vùng từ 01/07/2024 đến 31/12/2025: 4.960.000; 4.410.000; 3.860.000; 3.450.000', cd: 'Nghị định 74/2024/NĐ-CP', xm: 'thu-cap', gc: 'Nhiều nguồn khớp nhau.' },
    { nd: 'Mức lương đóng bảo hiểm không thấp hơn lương tối thiểu vùng (app nâng nền lên mức này)', cd: 'Luật BHXH 2024', xm: 'thu-cap', gc: 'Đơn giản hóa: bỏ qua trường hợp lao động qua đào tạo và các cách tính đặc thù.' },
  ] },
  { nhom: 'Các giả định của app', muc: [
    { nd: 'Hệ số làm thêm giờ ít nhất 150% (ngày thường), 200% (nghỉ hằng tuần), 300% (lễ, Tết, chưa kể lương ngày lễ)', cd: 'Bộ luật Lao động 2019 Điều 98 khoản 1', xm: 'thu-cap', gc: 'App dùng đúng mức tối thiểu, chưa tính phụ trội ban đêm (30% và 20%).' },
    { nd: 'Tiền một giờ = lương gross / 208 giờ (26 ngày x 8 giờ)', cd: 'Giả định của app', xm: 'chua', gc: 'Công ty có thể dùng 22 ngày, 24 ngày hoặc cách khác.' },
    { nd: 'Thưởng được cộng vào thu nhập chịu thuế của tháng nhận', cd: 'Nguyên tắc chung của Luật 109/2025/QH15 Điều 8', xm: 'goc', gc: 'Cách công ty khấu trừ tạm tính trong năm có thể khác, cuối năm quyết toán điều chỉnh.' },
  ] },
  { nhom: 'Quyết toán thuế năm', muc: [
    { nd: 'Quyết toán dùng biểu thuế theo năm (bằng biểu tháng nhân 12) và giảm trừ cả năm', cd: 'Luật 109/2025/QH15 Điều 9, Điều 10 (bảng có cột thu nhập tính thuế/năm)', xm: 'goc', gc: '' },
    { nd: 'Hạn nộp hồ sơ quyết toán: chậm nhất ngày cuối cùng của tháng thứ 3 (tổ chức quyết toán thay theo ủy quyền) hoặc tháng thứ 4 (cá nhân tự quyết toán) kể từ khi kết thúc năm dương lịch; trùng ngày nghỉ thì dời sang ngày làm việc kế tiếp', cd: 'Luật Quản lý thuế 38/2019/QH14 Điều 44 khoản 2; TT 80/2021/TT-BTC Điều 86', xm: 'thu-cap', gc: 'Theo các nguồn đã tra, dùng cho kỳ tính thuế 2025. Luật Quản lý thuế 108/2025/QH15 có hiệu lực 01/07/2026; chưa xác minh được hạn cho kỳ tính thuế 2026.' },
    { nd: 'Tháng 1 đến tháng 6/2026 công ty khấu trừ tạm tính theo biểu 7 bậc cũ (với giảm trừ mới), từ tháng 7/2026 theo biểu 5 bậc; quyết toán 2026 dùng biểu 5 bậc', cd: 'Theo các bài báo pháp luật; Luật 109 Điều 29 khoản 2 chỉ nói áp dụng từ kỳ tính thuế 2026', xm: 'chua', gc: 'App dùng giả định này để ước tính "thuế đã khấu trừ" của năm 2026 và cho bạn sửa tay bằng số trên chứng từ khấu trừ của công ty.' },
  ] },
];

export const NHAN_XM = { goc: 'Đã đối chiếu văn bản gốc', 'thu-cap': 'Nguồn thứ cấp (chưa đọc văn bản gốc)', chua: 'Chưa xác minh' };

export function sinhMarkdown() {
  const L = [];
  L.push('# Nguồn quy định của 9payday', '');
  L.push(`Ngày tra cứu: ${NGAY_TRA_CUU}. File này được sinh từ \`js/lib/nguon.js\` bằng \`node scripts/gen-nguon.mjs\`, đừng sửa tay.`, '');
  L.push('Mức xác minh:', '', '- **Đã đối chiếu văn bản gốc**: đã tải và đọc trực tiếp văn bản (Luật Thuế thu nhập cá nhân số 109/2025/QH15, bản PDF trên luatvietnam.vn).', '- **Nguồn thứ cấp**: nhiều bài của báo/cổng pháp luật (thuvienphapluat.vn, baochinhphu, chinhphu.vn, báo kinh tế...) khớp nhau nhưng chưa đọc văn bản gốc.', '- **Chưa xác minh**: không tìm được hoặc các nguồn mâu thuẫn; app đánh dấu rõ và chọn cách ước tính thận trọng.', '');
  L.push('Đây là công cụ ước tính, không phải tư vấn thuế. Khi cần số chính xác, hãy hỏi kế toán công ty hoặc cơ quan thuế.', '');
  for (const g of NGUON) {
    L.push(`## ${g.nhom}`, '');
    for (const m of g.muc) {
      L.push(`- ${m.nd}`);
      L.push(`  - Căn cứ: ${m.cd}`);
      L.push(`  - Mức xác minh: **${NHAN_XM[m.xm]}**${m.gc ? `. ${m.gc}` : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}
