# Nguồn quy định của 9payday

Ngày tra cứu: 05/10/2026. File này được sinh từ `js/lib/nguon.js` bằng `node scripts/gen-nguon.mjs`, đừng sửa tay.

Mức xác minh:

- **Đã đối chiếu văn bản gốc**: đã tải và đọc trực tiếp văn bản (Luật Thuế thu nhập cá nhân số 109/2025/QH15, bản PDF trên luatvietnam.vn).
- **Nguồn thứ cấp**: nhiều bài của báo/cổng pháp luật (thuvienphapluat.vn, baochinhphu, chinhphu.vn, báo kinh tế...) khớp nhau nhưng chưa đọc văn bản gốc.
- **Chưa xác minh**: không tìm được hoặc các nguồn mâu thuẫn; app đánh dấu rõ và chọn cách ước tính thận trọng.

Đây là công cụ ước tính, không phải tư vấn thuế. Khi cần số chính xác, hãy hỏi kế toán công ty hoặc cơ quan thuế.

## Thuế TNCN từ tiền lương (quy định mới)

- Biểu thuế lũy tiến từng phần 5 bậc theo tháng: đến 10 triệu 5%, trên 10 đến 30 triệu 10%, trên 30 đến 60 triệu 20%, trên 60 đến 100 triệu 30%, trên 100 triệu 35% (theo năm: 120 / 360 / 720 / 1.200 triệu)
  - Căn cứ: Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 9 khoản 2
  - Mức xác minh: **Đã đối chiếu văn bản gốc**. Đọc trực tiếp bảng trong tệp văn bản Luật. Lưu ý: một bài báo tra cứu (Vietnamnet) ghi sai các ngưỡng 10/20/50/100 triệu, app KHÔNG dùng số đó.
- Giảm trừ gia cảnh: bản thân 15,5 triệu/tháng (186 triệu/năm); mỗi người phụ thuộc 6,2 triệu/tháng
  - Căn cứ: Luật 109/2025/QH15 Điều 10 khoản 1; cũng là mức của Nghị quyết 110/2025/UBTVQH15 ngày 17/10/2025
  - Mức xác minh: **Đã đối chiếu văn bản gốc**. Mức trong Luật đọc từ văn bản gốc. Nghị quyết 110 chỉ đối chiếu qua nguồn thứ cấp.
- Hiệu lực: Luật có hiệu lực 01/07/2026; các quy định về thu nhập từ tiền lương, tiền công của cá nhân cư trú áp dụng từ kỳ tính thuế năm 2026; Luật 04/2007/QH12 hết hiệu lực phần tiền lương từ kỳ tính thuế 2026
  - Căn cứ: Luật 109/2025/QH15 Điều 29 khoản 1, 2, 3
  - Mức xác minh: **Đã đối chiếu văn bản gốc**. Vì vậy "quy định mới" là quy định đang áp dụng cho thu nhập tiền lương năm 2026.
- Thu nhập tính thuế từ tiền lương = tổng thu nhập chịu thuế trừ khoản đóng BHXH, BHYT, BHTN (và các khoản bảo hiểm bắt buộc khác), quỹ hưu trí bổ sung, và các khoản giảm trừ
  - Căn cứ: Luật 109/2025/QH15 Điều 8 khoản 2
  - Mức xác minh: **Đã đối chiếu văn bản gốc**
- Miễn thuế tiền lương làm việc ban đêm, làm thêm giờ (toàn bộ, theo đúng quy định pháp luật lao động) và tiền lương trả cho ngày không nghỉ phép
  - Căn cứ: Luật 109/2025/QH15 Điều 4 khoản 8; hướng dẫn tại Nghị định 253/2026/NĐ-CP Điều 26
  - Mức xác minh: **Đã đối chiếu văn bản gốc**. Điều luật đọc từ văn bản gốc. Nghị định 253 chỉ qua nguồn thứ cấp.
- Tiền ăn giữa ca, ăn trưa: chi bằng tiền thì miễn thuế tối đa 1,2 triệu đồng/người/tháng (trước đó 730.000đ); doanh nghiệp tự tổ chức bữa ăn hoặc cấp phiếu ăn thì không khống chế mức. Hiệu lực 01/07/2026
  - Căn cứ: Nghị định 253/2026/NĐ-CP (ban hành 30/06/2026) Điều 8 khoản 2
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Các bài viết ghi điểm g hoặc điểm k, chưa thống nhất. Chưa đọc văn bản gốc.
- Đóng quỹ hưu trí bổ sung tự nguyện được trừ tối đa 3 triệu/tháng (trước đó 1 triệu)
  - Căn cứ: Nghị định 253/2026/NĐ-CP Điều 46 khoản 2 điểm a
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Chỉ qua nguồn thứ cấp.
- Giảm trừ chi phí y tế, giáo dục tối đa 23 và 24 triệu/năm
  - Căn cứ: Nghị định 253/2026/NĐ-CP Điều 49 khoản 2
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. App chưa tính khoản này. Nguồn thứ cấp.
- Phụ cấp xăng xe, điện thoại, đi lại: mức miễn thuế
  - Căn cứ: Không tìm được văn bản gốc
  - Mức xác minh: **Chưa xác minh**. App coi là thu nhập chịu thuế, không tự miễn. Nếu công ty hoàn chi theo chứng từ và quy chế thì có thể khác.

## Quy định cũ (chỉ dùng để so sánh và quyết toán năm 2025 trở về trước)

- Biểu thuế 7 bậc theo tháng: 5 / 10 / 18 / 32 / 52 / 80 triệu với thuế suất 5, 10, 15, 20, 25, 30, 35%
  - Căn cứ: Luật Thuế TNCN 04/2007/QH12 Điều 22 (sửa đổi), hướng dẫn tại TT 111/2013/TT-BTC
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Nhiều nguồn khớp nhau; chưa đọc văn bản gốc.
- Giảm trừ gia cảnh bản thân 11 triệu/tháng, người phụ thuộc 4,4 triệu/tháng
  - Căn cứ: Nghị quyết 954/2020/UBTVQH14
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**
- Tiền làm thêm giờ, ban đêm: chỉ phần chênh lệch cao hơn tiền lương giờ làm việc bình thường được miễn thuế
  - Căn cứ: Thông tư 111/2013/TT-BTC
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Luật mới thay bằng miễn toàn bộ.
- Tiền ăn giữa ca miễn thuế tối đa 730.000đ/tháng (áp dụng trước 01/07/2026)
  - Căn cứ: TT 26/2016/TT-BLĐTBXH, TT 111/2013/TT-BTC
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**

## Bảo hiểm bắt buộc của người lao động

- Tỷ lệ người lao động đóng: BHXH 8%, BHYT 1,5%, BHTN 1% (tổng 10,5%)
  - Căn cứ: Luật BHXH 2024 số 41/2024/QH15, Luật BHYT, Luật Việc làm 2025
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Số điều chưa xác minh.
- Mức lương tối đa tính đóng BHXH và BHYT: 20 lần lương cơ sở
  - Căn cứ: Luật BHXH 2024 (41/2024/QH15)
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Số điều chưa xác minh.
- Lương cơ sở: 2.340.000đ (từ 01/07/2024), 2.530.000đ (từ 01/07/2026) nên trần BHXH/BHYT là 46,8 triệu rồi 50,6 triệu
  - Căn cứ: Nghị định 73/2024/NĐ-CP; Nghị định 161/2026/NĐ-CP (ban hành 15/05/2026)
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Nhiều nguồn khớp nhau.
- Mức lương tối đa tính đóng BHTN: 20 lần lương tối thiểu tháng theo vùng
  - Căn cứ: Luật Việc làm (số điều chưa xác minh)
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**
- Lương tối thiểu tháng theo vùng từ 01/01/2026: vùng I 5.310.000; II 4.730.000; III 4.140.000; IV 3.700.000
  - Căn cứ: Nghị định 293/2025/NĐ-CP (ban hành 10/11/2025)
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Nhiều nguồn khớp nhau.
- Lương tối thiểu tháng theo vùng từ 01/07/2024 đến 31/12/2025: 4.960.000; 4.410.000; 3.860.000; 3.450.000
  - Căn cứ: Nghị định 74/2024/NĐ-CP
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Nhiều nguồn khớp nhau.
- Mức lương đóng bảo hiểm không thấp hơn lương tối thiểu vùng (app nâng nền lên mức này)
  - Căn cứ: Luật BHXH 2024
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Đơn giản hóa: bỏ qua trường hợp lao động qua đào tạo và các cách tính đặc thù.

## Các giả định của app

- Hệ số làm thêm giờ ít nhất 150% (ngày thường), 200% (nghỉ hằng tuần), 300% (lễ, Tết, chưa kể lương ngày lễ)
  - Căn cứ: Bộ luật Lao động 2019 Điều 98 khoản 1
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. App dùng đúng mức tối thiểu, chưa tính phụ trội ban đêm (30% và 20%).
- Tiền một giờ = lương gross / 208 giờ (26 ngày x 8 giờ)
  - Căn cứ: Giả định của app
  - Mức xác minh: **Chưa xác minh**. Công ty có thể dùng 22 ngày, 24 ngày hoặc cách khác.
- Thưởng được cộng vào thu nhập chịu thuế của tháng nhận
  - Căn cứ: Nguyên tắc chung của Luật 109/2025/QH15 Điều 8
  - Mức xác minh: **Đã đối chiếu văn bản gốc**. Cách công ty khấu trừ tạm tính trong năm có thể khác, cuối năm quyết toán điều chỉnh.

## Quyết toán thuế năm

- Quyết toán dùng biểu thuế theo năm (bằng biểu tháng nhân 12) và giảm trừ cả năm
  - Căn cứ: Luật 109/2025/QH15 Điều 9, Điều 10 (bảng có cột thu nhập tính thuế/năm)
  - Mức xác minh: **Đã đối chiếu văn bản gốc**
- Hạn nộp hồ sơ quyết toán: chậm nhất ngày cuối cùng của tháng thứ 3 (tổ chức quyết toán thay theo ủy quyền) hoặc tháng thứ 4 (cá nhân tự quyết toán) kể từ khi kết thúc năm dương lịch; trùng ngày nghỉ thì dời sang ngày làm việc kế tiếp
  - Căn cứ: Luật Quản lý thuế 38/2019/QH14 Điều 44 khoản 2; TT 80/2021/TT-BTC Điều 86
  - Mức xác minh: **Nguồn thứ cấp (chưa đọc văn bản gốc)**. Theo các nguồn đã tra, dùng cho kỳ tính thuế 2025. Luật Quản lý thuế 108/2025/QH15 có hiệu lực 01/07/2026; chưa xác minh được hạn cho kỳ tính thuế 2026.
- Tháng 1 đến tháng 6/2026 công ty khấu trừ tạm tính theo biểu 7 bậc cũ (với giảm trừ mới), từ tháng 7/2026 theo biểu 5 bậc; quyết toán 2026 dùng biểu 5 bậc
  - Căn cứ: Theo các bài báo pháp luật; Luật 109 Điều 29 khoản 2 chỉ nói áp dụng từ kỳ tính thuế 2026
  - Mức xác minh: **Chưa xác minh**. App dùng giả định này để ước tính "thuế đã khấu trừ" của năm 2026 và cho bạn sửa tay bằng số trên chứng từ khấu trừ của công ty.

