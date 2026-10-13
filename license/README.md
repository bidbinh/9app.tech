# 9license: ôn thi bằng lái xe

Webapp tĩnh PWA (HTML/CSS/JS thuần, không build). Mở `index.html` qua một máy chủ tĩnh bất kỳ, đặt tại `/license/`.

## Dữ liệu (`data/`)
- `questions.json`: mảng câu hỏi `{ id, ch, q, opts[], a, crit?, img? }`. `a` là chỉ số đáp án đúng (bắt đầu từ 0), `ch` là chương 1..6, `crit: 1` là câu điểm liệt, `img` là tên file trong `data/img/`. **Không bao giờ đảo thứ tự `opts`** (có ý "Cả hai ý trên").
- `sets.json`: tập câu theo hạng `{ A, B1, all }` (và bản sao `A1`), mỗi tập có `pool` (id câu) và `crit` (id câu điểm liệt của hạng đó).
- `meta.json`: nguồn, ngày tra cứu, điều chưa chắc (hiện ở trang "Về dữ liệu"). `tips.json`: mẹo nhớ.

## Lệnh
- `node --test tests/` kiểm thử (trộn đề, chấm điểm, điểm liệt, lặp lại ngắt quãng, dữ liệu, ICS, CSP/SW).
- `node tools/validate.mjs --count=600` kiểm tra bộ dữ liệu (id duy nhất, đáp án thuộc lựa chọn, ảnh tồn tại, tập hạng...). Có lỗi thì không phát hành.
- `node tools/import-questions.mjs bo-de.csv --merge` nạp thêm/ghi đè câu hỏi từ CSV hoặc JSON (xem đầu file công cụ để biết định dạng). Chạy thử với `--dry`.
- `node tools/build-data.mjs` dựng lại dữ liệu từ `tools/source/` (kết quả `tools/extract-600.py` + phụ lục Công văn 2262/CSGT-P5).
- `node scripts/e2e.mjs` kiểm tra giao diện bằng Chrome headless, ảnh chụp ở `shots/`.

## Phát hành bản dữ liệu mới
1. Nạp/ghi dữ liệu, chạy `validate`, cập nhật `data/meta.json` (nguồn, số câu, ngày tra cứu).
2. Tăng `VERSION` trong `sw.js` để máy đã cài nhận bản mới.
3. Đặt `REPORT_EMAIL` trong `js/config.js` nếu muốn nút báo sai gửi thẳng email.

## Tái lập dữ liệu từ PDF nguồn
- PDF bộ 600 câu (Cục CSGT, Bộ Công an): https://khodulieu.sohoa.tuyenquang.gov.vn/congthongtin/media/edb12a6ad8ecfde537ec02cbb7e2a1b1.pdf (bản đăng lại; trang giới thiệu: https://xaydungchinhsach.chinhphu.vn/600-cau-hoi-dung-cho-sat-hach-lai-xe-co-gioi-duong-bo-119250513095211625.htm).
- SHA-256 bản đã dùng: d473be679b53458a33acc52057f3a4fe532ea489e91d88fb86789073cd98a9c5
- Repo không đính kèm file PDF vì quyền phân phối lại chưa được xác nhận. Tải về, kiểm SHA-256, rồi chạy `python tools/extract-600.py <file.pdf>` và `node tools/build-data.mjs`.
- `build-data.mjs` chỉ chuẩn hóa chỉ số trên của đơn vị (`cm 3` thành `cm³`, 5 câu: 119, 123 đến 126); không đổi nội dung hay đáp án.

## Đề thi lý thuyết từ 01/3/2027 (đã đối chiếu văn bản gốc)
- Văn bản gốc: Thông tư 108/2026/TT-BCA (29/6/2026), Phụ lục I (A1, A: 40 câu, 27 phút, đạt 36), Phụ lục II (B1: 50 câu, 33 phút, đạt 45), Phụ lục III (B: 50/33/45; C1: 60/40/54; C: 70/47/63; D1, D2, D: 80/53/72). Áp dụng từ 01/3/2027 (khoản 2 Điều 41). Trích dẫn và URL: `tools/source/thong-tu-108-2026-trich.txt`.
- Chưa xác minh được: số câu điểm liệt và cơ cấu theo chương của đề mới (văn bản không nêu), bộ câu hỏi chính thức cho đề mới, toàn văn Nghị định 94/2026/NĐ-CP, quy định đổi B1/B2 cũ sang B (xem `tools/source/nguon-phu-nd94-hang-b.txt` và mục "Điều chưa chắc" trong `data/meta.json`).
