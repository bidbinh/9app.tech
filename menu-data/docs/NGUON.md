# Nguồn dữ liệu của menu-data

> Tệp này được sinh tự động bằng `node tools/gen-nguon.js` từ `data/sources.json`, `data/dishes.json` và `tools/audit-table.js`. Đừng sửa tay.

Ngày tra cứu: **2026-10-04** (toàn bộ nguồn). Dữ liệu là bản **tổng hợp và diễn đạt lại bằng lời của chúng tôi**, không sao chép nguyên văn nội dung có bản quyền; chỉ lấy các thông tin mang tính sự kiện (tên món, danh sách nguyên liệu, khối lượng điển hình, thời gian nấu) rồi chuẩn hóa về khẩu phần 4 người.

## Cách tra cứu và mức tin cậy

- `access = fetch`: đã đọc trang bằng WebFetch (2 nguồn: Sở Y tế Hà Tĩnh về ăn dặm, và trang lịch trồng rau miền Bắc của hatgiongtot.net).
- `access = search`: **chỉ đọc tiêu đề và phần tóm tắt nguyên liệu do công cụ tìm kiếm trả về**, không đọc toàn trang. Vì vậy đối chiếu khối lượng là theo tóm tắt đó.
- Ghi chú từng món trong `dishes.json` có trường `sources` (kèm `scope`) và `sourceCheck`:
  - `doi_chieu_so_lieu`: khối lượng nguyên liệu chính được so với số liệu của nguồn trong bảng rà soát bên dưới và test (`test/audit.test.js`), dung sai ±50%.
  - `cong_thuc_cung_mon`: có ít nhất một nguồn là công thức của đúng món đó (hoặc biến thể sát), nhưng khối lượng không nằm trong bảng rà soát số liệu.
  - `cong_thuc_tuong_tu`: nguồn chỉ là món tương tự hoặc cùng kỹ thuật; khối lượng ước theo tỉ lệ nấu ăn thông thường cho 4 người. **Độ tin cậy thấp hơn.**
  - `tham_khao_chung`: chỉ có nguồn y tế/dinh dưỡng chung (không có công thức nào tra được).
- `scope` của từng nguồn trong món: `cung_mon` | `tuong_tu` | `chung` (nguồn y tế/mùa vụ).

## Y tế, dinh dưỡng (6 nguồn)

| Khóa | Nguồn | Truy cập | Số món dùng |
|---|---|---|---|
| `soyte-hatinh-andam` | [Sở Y tế Hà Tĩnh - Những điều nên và không nên khi cho bé ăn dặm lần đầu (theo PGS.TS.BS Nguyễn Thị Lâm; WHO/Viện Dinh dưỡng)](https://soyte.hatinh.gov.vn/tin-tuc-su-kien/thong-tin-y-te/nhung-dieu-nen-va-khong-nen-khi-cho-be-an-dam-lan-dau.html) | fetch | 15 |
| `alobacsi-giavi` | [Alobacsi - Nên nêm gia vị cho bé ăn dặm khi nào](https://alobacsi.com/nen-nem-gia-vi-cho-be-an-dam-khi-nao-cac-loai-gia-vi-an-toan-cho-be.html) | search | 13 |
| `vinmec-caotuoi` | [Vinmec - Lời khuyên dinh dưỡng cho người cao tuổi](https://www.vinmec.com/vie/bai-viet/loi-khuyen-dinh-duong-cho-nguoi-cao-tuoi-vi) | search | 3 |
| `skds-monmem` | [Sức khỏe & Đời sống - Gợi ý một số món ăn mềm dễ nấu cho người cao tuổi](https://suckhoedoisong.vn/goi-y-mot-so-mon-an-mem-de-nau-cho-nguoi-cao-tuoi-169250808222724827.htm) | search | 20 |
| `vinmec-rauluoc` | [Vinmec - Các món rau luộc ngon](https://www.vinmec.com/vie/bai-viet/cac-mon-rau-luoc-ngon-vi) | search | 6 |
| `yte-nghean-raucumuadong` | [Sở Y tế Nghệ An - 7 loại rau củ mùa đông tốt nhất cho sức khỏe](https://yte.nghean.gov.vn/cam-nang-suc-khoe/7-loai-rau-cu-mua-dong-tot-nhat-cho-suc-khoe-703907) | search | 3 |

## Mùa vụ rau củ quả (7 nguồn)

| Khóa | Nguồn | Truy cập | Số món dùng |
|---|---|---|---|
| `hatgiongtot-lichtrongrau` | [Hạt giống tốt - Lịch trồng rau ở miền Bắc theo mùa xuân - hạ - thu - đông](https://hatgiongtot.net/lich-trong-rau-o-mien-bac.html) | fetch | 1 |
| `sinhhocaq-lichtrongrau` | [Sinh học AQ - Lịch trồng rau miền Bắc theo từng tháng](https://nguyenlieusinhhoc.com/lich-trong-rau-mien-bac/) | search | 1 |
| `kingbio-lichtrongrau` | [Kingbio - Lịch trồng rau miền Bắc theo tháng](https://kingbio.vn/lich-trong-rau-mien-bac-theo-thang) | search | 1 |
| `hachi-lichtrongrau` | [Hachi - Lịch trồng rau miền Bắc theo tháng dương lịch](https://hachi.com.vn/lich-trong-rau-mien-bac/) | search | 1 |
| `vuonxanh-lichtrongrau` | [Vườn Xanh Của Bạn - Lịch trồng rau miền Bắc](https://vuonxanhcuaban.com/detail/lich-trong-rau-mien-bac.html) | search | 1 |
| `shophoaqua-miennam` | [Shophoaqua - Gợi ý trái cây miền Bắc theo mùa](https://shophoaqua.vn/goi-y-trai-cay-mien-bac-theo-mua-phu-hop-theo-so-thich-va-nhu-cau/ar114.html) | search | 9 |
| `shophoaqua-lichmua` | [Shophoaqua - Trái cây vào mùa từ tháng 1-12](https://shophoaqua.vn/lich-trai-cay-vao-mua-tai-viet-nam-tu-thang-1-den-thang-12/ar125.html) | search | 9 |

## Công thức, ẩm thực (155 nguồn)

| Khóa | Nguồn | Truy cập | Số món dùng |
|---|---|---|---|
| `kidsplaza-chao-bo-7t` | [KidsPlaza - Các loại cháo thịt bò ăn dặm cho bé 7 tháng](https://www.kidsplaza.vn/blog/mach-me-top-chao-thit-bo-an-dam-cho-be-7-thang-tuoi.html) | search | 12 |
| `eva-chao-carot` | [Eva - 9 cách nấu cháo cà rốt cho bé 6 tháng ăn dặm](https://eva.vn/nuoi-con/9-cach-nau-chao-ca-rot-cho-be-6-thang-an-dam-don-gian-nhat-c13a481230.html) | search | 2 |
| `longchau-chao-ga` | [Nhà thuốc Long Châu - 7 công thức nấu cháo gà cho bé ăn dặm](https://nhathuoclongchau.com.vn/bai-viet/7-cong-thuc-nau-chao-ga-cho-be-an-dam-don-gian-de-lam-62743.html) | search | 4 |
| `longchau-chao-bido` | [Nhà thuốc Long Châu - Cách nấu cháo bí đỏ cho bé ăn dặm](https://nhathuoclongchau.com.vn/bai-viet/mach-me-cach-nau-chao-bi-do-cho-be-an-dam-sieu-hap-dan-63391.html) | search | 3 |
| `monte-chao-ga-bido` | [Monte - Cháo gà bí đỏ cho bé ăn dặm](https://www.monte.com/vn/thong-tin-dinh-duong/chi-tiet/chao-ga-bi-do-cho-be-an-dam/) | search | 6 |
| `dmx-canhcua` | [Điện máy xanh - Cách nấu canh cua rau đay mướp](https://www.dienmayxanh.com/vao-bep/cach-nau-canh-cua-rau-day-muop-ngot-mat-thom-lung-giai-nhiet-13271) | search | 10 |
| `cookpad-canhcua` | [Cookpad - Canh cua rau đay mướp (JinSu Mommy)](https://cookpad.com/vn/cong-thuc/16995077) | search | 1 |
| `dmx-bidao-thitbam` | [Điện máy xanh - Cách nấu canh bí đao thịt bằm](https://www.dienmayxanh.com/vao-bep/cach-nau-canh-bi-dao-thit-bam-thom-ngon-thanh-dam-ngay-tai-11767) | search | 6 |
| `fptshop-bidao` | [FPT Shop - Cách nấu canh bí đao với thịt heo, xương heo](https://fptshop.com.vn/tin-tuc/dien-may/cach-nau-canh-bi-dao-164646) | search | 3 |
| `cookbeo-ngot-thitbam` | [Cookbeo - Cách nấu canh rau ngót thịt bằm](https://cookbeo.com/recipes/cach-nau-canh-rau-ngot-thit-bam) | search | 8 |
| `cookbeo-cai-thitbam` | [Cookbeo - Cách nấu canh cải thịt băm](https://cookbeo.com/recipes/cach-nau-canh-cai-thit-bam) | search | 27 |
| `vne-cai-cuc` | [VnExpress Cooking - Canh cải cúc thịt băm](https://vnexpress.net/doi-song-cooking-canh-cai-cuc-thit-bam-4534981.html) | search | 5 |
| `mnmn-khoaiso` | [Món Ngon Mỗi Ngày - Canh sườn khoai sọ](https://monngonmoingay.com/canh-suon-khoai-so/) | search | 16 |
| `cet-khoaiso` | [CET - Cách nấu canh khoai sọ](https://www.cet.edu.vn/cach-nau-canh-khoai-so) | search | 2 |
| `vne-canhbautom` | [VnExpress Cooking - Canh bầu tôm](https://vnexpress.net/doi-song-cooking-canh-bau-tom-4481255.html) | search | 2 |
| `dmx-canhbau-tomkho` | [Điện máy xanh - Canh bầu nấu với tôm khô](https://www.dienmayxanh.com/vao-bep/cach-nau-canh-bau-nau-voi-tom-kho-thom-ngon-thanh-dam-kho-13223) | search | 3 |
| `cookbeo-canhbau` | [Cookbeo - Canh bầu nấu tôm khô](https://cookbeo.com/recipes/canh-bau-nau-tom-kho) | search | 3 |
| `mnmn-canhchua-mang` | [Món Ngon Mỗi Ngày - Canh chua măng](https://monngonmoingay.com/canh-chua-mang/) | search | 5 |
| `mnmn-canhchuaca-mang` | [Món Ngon Mỗi Ngày - Canh chua cá nấu măng](https://monngonmoingay.com/canh-chua-ca-nau-mang/) | search | 1 |
| `mnmn-canhga-mangchua` | [Món Ngon Mỗi Ngày - Canh gà măng chua](https://monngonmoingay.com/canh-ga-mang-chua/) | search | 3 |
| `vne-canhca-mang` | [VnExpress Cooking - Canh cá nấu măng chua](https://vnexpress.net/doi-song-cooking-canh-ca-nau-mang-chua-mua-mua-bao-4791815.html) | search | 1 |
| `cookpad-susucarot` | [Cookpad - Canh su cà rốt](https://cookpad.com/vn/tim-kiem/canh%20su%20c%C3%A0%20r%E1%BB%91t) | search | 7 |
| `cookpad-canhsuonchua` | [Cookpad - Canh sườn nấu chua](https://cookpad.com/vn/tim-kiem/canh%20s%C6%B0%E1%BB%9Dn%20n%E1%BA%A5u%20chua) | search | 3 |
| `huongnghiep-thitkho` | [Hướng nghiệp Á Âu - Cách nấu thịt kho tàu](https://www.huongnghiepaau.com/thit-kho-tau) | search | 3 |
| `tiki-thitkho` | [Tiki - Cách làm thịt kho tàu](https://tiki.vn/blog/thit-kho-tau/) | search | 2 |
| `bluestone-thitkho` | [Bluestone - Cách nấu thịt kho tàu](https://www.bluestone.com.vn/blogs/vao-bep/thit-kho-tau) | search | 1 |
| `dmx-cakhorieng` | [Điện máy xanh - Cách nấu cá kho riềng chuẩn vị miền Bắc](https://www.dienmayxanh.com/vao-bep/cach-nau-ca-kho-rieng-dam-da-chac-thit-chuan-vi-mien-bac-voi-23079) | search | 4 |
| `vne-catramrieng` | [VnExpress Cooking - Cá trắm kho riềng kiểu phố cổ Hà Nội](https://vnexpress.net/doi-song-cooking-ca-tram-kho-rieng-kieu-pho-co-ha-noi-4700557.html) | search | 1 |
| `vietnamnet-cakhorieng` | [VietNamNet - Cách làm cá kho riềng](https://vietnamnet.vn/cach-lam-ca-kho-rieng-thom-bui-cuc-ngon-2194461.html) | search | 1 |
| `cookbeo-daus` | [Cookbeo - Đậu phụ sốt cà chua](https://cookbeo.com/recipes/dau-sot-ca-chua) | search | 19 |
| `afamily-dausot` | [Afamily - Đậu phụ sốt cà chua](https://afamily.vn/mon-dau-phu-sot-ca-chua-cho-them-mot-nguyen-lieu-se-khien-huong-vi-bung-no-ngap-tran-vi-ngon-ngot-236260322220903495.chn) | search | 1 |
| `cellphones-daus` | [CellphoneS - 3 cách làm đậu sốt cà chua chay, mặn](https://cellphones.com.vn/sforum/cach-lam-dau-sot-ca-chua) | search | 5 |
| `vietnamnet-thitrang` | [VietNamNet - Cách làm thịt rang cháy cạnh mềm ngon](https://vietnamnet.vn/cach-lam-thit-rang-chay-canh-mem-ngon-va-khong-bi-kho-2079147.html) | search | 5 |
| `vne-thitrang` | [VnExpress Cooking - Thịt ba chỉ rang cháy cạnh](https://vnexpress.net/doi-song-cooking-cach-lam-thit-ba-chi-rang-chay-canh-don-gian-4298428.html) | search | 1 |
| `pasgo-thitrang` | [Pasgo - Thịt rang cháy cạnh kiểu Bắc](https://pasgo.vn/blog/cach-lam-thit-rang-chay-canh-chuan-vi-bac-dung-dieu-ngon-3052) | search | 1 |
| `vietnamnet-chalalot` | [VietNamNet - Cách làm chả lá lốt](https://vietnamnet.vn/cach-lam-cha-la-lot-dam-vi-thom-ngon-tai-nha-2166907.html) | search | 3 |
| `fptshop-chalalot` | [FPT Shop - Cách làm chả lá lốt thịt heo](https://fptshop.com.vn/tin-tuc/dien-may/cach-lam-cha-la-lot-162760) | search | 1 |
| `hnaau-chalalot-chay` | [Hướng nghiệp Á Âu - Chả lá lốt chay](https://www.huongnghiepaau.com/cha-la-lot-chay) | search | 1 |
| `vietnamnet-chatrunghap` | [VietNamNet - Cách làm chả trứng hấp](https://vietnamnet.vn/cach-lam-cha-trung-hap-thom-ngon-cho-ngay-ban-ron-2093127.html) | search | 1 |
| `vietnamnet-trungducthit` | [VietNamNet - Cách làm trứng đúc thịt](https://vietnamnet.vn/cach-lam-trung-duc-thit-don-gian-ma-ngon-tai-nha-2246671.html) | search | 5 |
| `vne-trungducthit` | [VnExpress Cooking - Trứng đúc thịt](https://vnexpress.net/doi-song-cooking-trung-duc-thit-4860439.html) | search | 1 |
| `fptshop-trungchungthit` | [FPT Shop - Trứng chưng thịt](https://fptshop.com.vn/tin-tuc/dien-may/trung-chung-thit-179766) | search | 4 |
| `dmx-trungchungthit` | [Điện máy xanh - Trứng chưng thịt băm](https://www.dienmayxanh.com/vao-bep/cach-lam-trung-chung-thit-bam-mem-min-bang-noi-com-dien-tai-23353) | search | 1 |
| `vne-rantrung` | [VnExpress Cooking - Bí quyết rán trứng mềm xốp](https://vnexpress.net/doi-song-cooking-ran-trung-4651981.html) | search | 3 |
| `dmx-trungchienhanhtay` | [Điện máy xanh - Trứng chiên hành tây](https://www.dienmayxanh.com/vao-bep/cach-lam-trung-chien-hanh-tay-thom-ngon-danh-cho-cac-ban-10664) | search | 2 |
| `phunutoday-dauphunhoi` | [Phụ nữ Today - Đậu phụ nhồi thịt tẩm hành](https://phunutoday.vn/cach-lam-dau-phu-nhoi-thit-tam-hanh-thom-ngon-d506529.html) | search | 1 |
| `vinid-dauphunhoi` | [VinID - 3 cách chế biến đậu phụ nhồi thịt](https://vinid.net/blog/3-cach-che-bien-mon-dau-phu-nhoi-thit-cho-bua-com-hang-ngay/) | search | 2 |
| `bepanvanphong-bundau` | [Bếp ăn văn phòng - Bún đậu mắm tôm Hà Nội](https://bepanvanphong.vn/Cach-lam-mon-bun-dau-mam-tom-Ha-Noi) | search | 3 |
| `wiki-nemran` | [Wikipedia tiếng Việt - Nem rán](https://vi.wikipedia.org/wiki/Nem_r%C3%A1n) | search | 1 |
| `cookpad-chagio` | [Cookpad - Chả giò (nem rán) của Vomi Khanh](https://cookpad.com/vn/cong-thuc/6445579) | search | 1 |
| `rapido-nemran` | [Rapido - 4 cách làm nem rán truyền thống](https://rapido.vn/4-cach-lam-nem-ran-truyen-thong-gion-ngon-don-gian-tai-nha/) | search | 1 |
| `vietnamnet-suonxao` | [VietNamNet - Sườn xào chua ngọt](https://vietnamnet.vn/cach-lam-suon-xao-chua-ngot-vo-cung-don-gian-tai-nha-2067168.html) | search | 2 |
| `dmx-suonxao` | [Điện máy xanh - Sườn xào chua ngọt](https://www.dienmayxanh.com/vao-bep/cach-lam-suon-xao-chua-ngot-cho-mam-com-hang-ngay-00689) | search | 2 |
| `mnmn-carokhoto` | [Món Ngon Mỗi Ngày - Cá rô kho tộ](https://monngonmoingay.com/ca-ro-kho-to/) | search | 1 |
| `vne-carokhoto` | [VnExpress Cooking - Cá rô kho tộ](https://vnexpress.net/doi-song-cooking-ca-ro-kho-to-kieu-nam-bo-4511289.html) | search | 1 |
| `pasgo-carokhoto` | [Pasgo - Cá rô kho tộ](https://pasgo.vn/blog/cach-lam-ca-ro-kho-to-ngon-khong-tanh-mem-ruc-xuong-hoamkt-1123-5553) | search | 1 |
| `hnaau-caichepomdua` | [Hướng nghiệp Á Âu - Cá chép om dưa](https://www.huongnghiepaau.com/ca-chep-om-dua) | search | 4 |
| `cakhobakien-ca-ro-phi-om-dua` | [Cá kho Bà Kiên - Cá rô phi om dưa](https://cakhobakien.com/ca-kho/ca-ro-phi-om-dua/) | search | 2 |
| `cookbeo-gakholachanh` | [Cookbeo - Gà kho lá chanh](https://cookbeo.com/recipes/ga-kho-la-chanh) | search | 2 |
| `chefstudio-gakhogung` | [Chef Studio - 6 cách làm gà kho gừng](https://chefstudio.vn/cach-lam-ga-kho-gung-don-gian-ma-ngon-xuyt-xoa.html) | search | 3 |
| `cookbeo-gaxaosaot` | [Cookbeo - Gà xào sả ớt](https://cookbeo.com/recipes/ga-xao-sa-ot) | search | 3 |
| `fptshop-garanglachanh` | [FPT Shop - Gà rang lá chanh](https://fptshop.com.vn/tin-tuc/dien-may/ga-rang-la-chanh-mon-163874) | search | 1 |
| `cookbeo-boxaohanhtay` | [Cookbeo - Thịt bò xào hành tây](https://cookbeo.com/recipes/cach-lam-thit-bo-xao-hanh-tay) | search | 4 |
| `pasgo-boxaohanhtay` | [Pasgo - Thịt bò xào hành tây](https://pasgo.vn/blog/cach-lam-thit-bo-xao-hanh-tay-khong-hang-ngot-mem-nhanh-gon-thumkt-1023-5518) | search | 1 |
| `bluestone-boxaocantay` | [Bluestone - Thịt bò xào hành tây cần tây](https://www.bluestone.com.vn/blogs/vao-bep/thit-bo-xao-hanh-tay-can-tay) | search | 2 |
| `hnaau-rauxaotoi` | [Hướng nghiệp Á Âu - Rau muống xào tỏi](https://www.huongnghiepaau.com/rau-muong-xao-toi) | search | 33 |
| `tuoitre-rauxaotoi` | [Tuổi Trẻ - Rau muống xào tỏi lọt top 100 món xào ngon nhất thế giới](https://tuoitre.vn/rau-muong-xao-toi-mien-xao-cua-lot-top-100-mon-xao-ngon-nhat-the-gioi-20240729181929525.htm) | search | 1 |
| `kingfood-ramuongbo` | [Kingfoodmart - Rau muống xào thịt bò](https://kingfoodmart.com/bai-viet/cong-thuc-rau-muong-xao-thit-bo-dam-da-dua-com) | search | 1 |
| `websosanh-ramuong` | [Websosanh - 34 món ăn từ rau muống](https://websosanh.vn/tin-tuc/34-mon-an-tu-rau-muong-tron-xao-nau-canh-deu-ngon-hon-nha-hang-c36-20200701033255892.htm) | search | 1 |
| `nongsan-rauLang` | [Nông sản Dũng Hà - Cách luộc rau khoai lang](https://nongsandungha.com/bi-quyet-vang-cach-luoc-rau-khoai-lang-khong-bi-den/) | search | 2 |
| `vne-luoc-ramuong` | [VnExpress Cooking - Luộc rau muống kiểu Hà Nội](https://vnexpress.net/doi-song-cooking-cach-luoc-rau-muong-kieu-ha-noi-theo-loi-xua-4752379.html) | search | 3 |
| `laodongthudo-luocramuong` | [Lao động Thủ đô - Cách luộc rau muống giòn ngon](https://laodongthudo.vn/cach-luoc-rau-muong-gion-ngon-khong-bi-tham-92453.html) | search | 1 |
| `tiki-luocrau` | [Tiki - Cách luộc rau ngon, xanh giòn](https://tiki.vn/blog/cach-luoc-rau/) | search | 34 |
| `lemon8-luoccaingot` | [Lemon8 - Luộc rau cải ngọt xanh tươi](https://www.lemon8-app.com/@gon0phaicuaai/7349380813986759169?region=vn) | search | 3 |
| `sohuutritue-nom` | [Sở hữu trí tuệ - Cách làm 5 món nộm rau củ](https://sohuutritue.net.vn/cach-lam-5-mon-nom-rau-cu-ngon-xuat-sac-cho-bua-com-gia-dinh-d37815.html) | search | 9 |
| `pasgo-nom` | [Pasgo - Cách làm 14 món nộm ngon](https://pasgo.vn/blog/cach-lam-14-mon-nom-ngon-de-lam-an-mai-khong-ngan-3272) | search | 5 |
| `btaskee-nom` | [bTaskee - 19 cách làm các món nộm](https://www.btaskee.com/kinh-nghiem-hay/cac-mon-nom-ngon/) | search | 3 |
| `dmx-caphao` | [Điện máy xanh - Cà pháo muối xổi](https://www.dienmayxanh.com/vao-bep/cach-lam-ca-phao-muoi-xoi-an-lien-chua-cay-gion-ngon-don-gian-13205) | search | 1 |
| `beptruong-caphao` | [Bếp trưởng - Cà pháo muối xổi chua ngọt chuẩn vị Bắc](https://beptruong.edu.vn/cach-lam-ca-muoi-xoi) | search | 1 |
| `pasgo-duamuoi` | [Pasgo - 15 cách làm dưa muối](https://pasgo.vn/blog/tong-hop-15-cach-lam-dua-muoi-gion-ngon-cuc-hap-dan-3511) | search | 5 |
| `blog-cookpad-muoidua` | [Cookpad blog - Cách muối dưa giòn ngon](https://blog.cookpad.com/vn/cach-muoi-dua-gion-ngon/) | search | 1 |
| `fptshop-kimchi` | [FPT Shop - 3 cách muối kim chi cải thảo](https://fptshop.com.vn/tin-tuc/dien-may/3-cach-muoi-kim-chi-cai-thao-chuan-vi-han-quoc-169743) | search | 1 |
| `genk-kimchi-duachuot` | [GenK - Kim chi dưa chuột](https://genk.vn/cong-thuc-lam-kim-chi-dua-chuot-muoi-chuan-vi-han-20180730220500066.chn) | search | 1 |
| `vne-bunthang` | [VnExpress Cooking - Cách làm bún thang kiểu Hà Nội cổ](https://vnexpress.net/doi-song-cooking-bun-thang-4566080.html) | search | 1 |
| `dmx-bunthang` | [Điện máy xanh - 2 cách nấu bún thang chuẩn vị Hà Nội](https://www.dienmayxanh.com/vao-bep/huong-dan-cach-nau-bun-thang-ngon-chuan-vi-ha-noi-01298) | search | 1 |
| `tuoitre-bunthang` | [Tuổi Trẻ - Bếp bà Hòa chỉ cách nấu bún thang chuẩn Hà Nội](https://tuoitre.vn/bep-ba-hoa-chi-cach-nau-bun-thang-chuan-ha-noi-chinh-thuc-het-tet-20250217212744693.htm) | search | 1 |
| `fptshop-bunrieu` | [FPT Shop - Cách nấu bún riêu cua Hà Nội](https://fptshop.com.vn/tin-tuc/dien-may/cach-nau-bun-rieu-cua-ha-noi-159240) | search | 2 |
| `mmvn-bunrieu` | [MM Mega Market - Cách nấu bún riêu cua](https://online.mmvietnam.com/blog/cach-nau-bun-rieu-cua) | search | 1 |
| `mnmn-bunrieu` | [Món Ngon Mỗi Ngày - Bún riêu cua](https://monngonmoingay.com/bun-rieu-cua/) | search | 2 |
| `fpt-bunoc` | [FPT Shop - Cách nấu bún ốc](https://fptshop.com.vn/tin-tuc/dien-may/cach-nau-bun-oc-thom-ngon-hap-dan-175272) | search | 1 |
| `elmich-bunoc` | [Elmich - Công thức nấu bún ốc](https://shop.elmich.vn/bun-oc) | search | 1 |
| `vietnamnet-bunoc` | [VietNamNet - Cách nấu bún ốc Hà Nội](https://vietnamnet.vn/cach-nau-bun-oc-ha-noi-chuan-vi-2028976.html) | search | 1 |
| `vne-buncha` | [VnExpress - Cách làm bún chả Hà Nội](https://vnexpress.net/cach-lam-bun-cha-chuan-vi-ha-noi-4218318.html) | search | 2 |
| `dmx-pho` | [Điện máy xanh - Cách nấu phở bò Hà Nội](https://www.dienmayxanh.com/vao-bep/cach-nau-pho-bo-ha-noi-chuan-vi-nuoc-dung-ngot-thanh-don-gian-22475) | search | 2 |
| `vne-pho` | [VnExpress Cooking - Cách nấu phở bò truyền thống](https://vnexpress.net/doi-song-cooking-cach-nau-pho-bo-truyen-thong-chuan-vi-ha-noi-4965047.html) | search | 2 |
| `elmich-pho` | [Elmich - 2 cách nấu phở bò](https://shop.elmich.vn/pho-bo) | search | 1 |
| `vietnamnet-chehatsen` | [VietNamNet - Chè hạt sen đậu xanh](https://vietnamnet.vn/cach-nau-che-hat-sen-dau-xanh-thom-mat-va-bo-duong-2144083.html) | search | 2 |
| `dmx-chedauxanh-hatsen` | [Điện máy xanh - Chè đậu xanh hạt sen](https://www.dienmayxanh.com/vao-bep/cach-nau-che-dau-xanh-hat-sen-thom-mat-bui-ngot-cho-ca-gia-08341) | search | 1 |
| `cet-chebido` | [CET - Cách nấu chè bí đỏ](https://www.cet.edu.vn/cach-nau-che-bi-do) | search | 1 |
| `vietnamnet-chebido` | [VietNamNet - 3 cách nấu chè bí đỏ](https://vietnamnet.vn/3-cach-nau-che-bi-do-thom-ngon-bo-duong-giai-nhiet-ngay-he-755722.html) | search | 1 |
| `cachnauche-chebido` | [Cách nấu chè - chè bí đỏ đậu xanh](https://cachnauche.com/cach-nau-che-bi-do-dau-xanh-ngon/) | search | 1 |
| `pasgo-che` | [Pasgo - Tất tần tật các món chè](https://pasgo.vn/blog/tat-tan-tat-cac-mon-che-ngon-duoc-yeu-thich-nhat-kem-cach-lam-3207) | search | 1 |
| `eva-xoi-dauxanh` | [Eva - Cách nấu xôi đậu xanh bằng nồi cơm điện, bếp ga](https://eva.vn/bep-eva/cach-nau-xoi-dau-xanh-bang-noi-com-dien-bep-ga-deo-thom-khong-lo-nhao-c162a515451.html) | search | 1 |
| `vtv-xoigac` | [VTV - Cách nấu xôi gấc đỗ xanh](https://vtv.vn/doi-song/cach-nau-xoi-gac-do-xanh-vua-ngon-vua-dep-mat-20240412103610609.htm) | search | 2 |
| `vne-xoigac` | [VnExpress Cooking - Cách nấu xôi gấc](https://vnexpress.net/doi-song-cooking-xoi-gac-4686519.html) | search | 1 |
| `chefstudio-xoigac` | [Chef Studio - 3 cách nấu xôi gấc](https://chefstudio.vn/cach-nau-xoi-gac-ngon.html) | search | 1 |
| `xoi-tonghop` | [Tổng hợp cách nấu 33 món xôi (Vietfoodshop)](https://vietfoodshop.com/tong-hop-cach-nau-33-mon-xoi-dac-biet-mem-deo-thom-ngon/) | search | 1 |
| `vne-chaosuon` | [VnExpress Cooking - Cháo sườn Hà Nội](https://vnexpress.net/doi-song-cooking-chao-suon-ha-noi-4816507.html) | search | 1 |
| `hnaau-chaosuon` | [Hướng nghiệp Á Âu - Cách nấu cháo sườn](https://www.huongnghiepaau.com/cach-nau-chao-suon) | search | 1 |
| `vne-cathusot` | [VnExpress Cooking - Cá thu sốt cà chua](https://vnexpress.net/doi-song-cooking-ca-thu-sot-ca-chua-4555370.html) | search | 2 |
| `vietnamnet-cathusot` | [VietNamNet - 3 cách làm cá thu sốt cà chua](https://vietnamnet.vn/3-cach-lam-ca-thu-sot-ca-chua-ngon-dam-da-tai-nha-2215085.html) | search | 1 |
| `infonet-mienga` | [Infonet - Cách nấu miến gà nấm hương](https://infonet.vietnamnet.vn/cach-nau-mien-ga-nam-huong-thom-ngon-ngay-tet-120228.html) | search | 2 |
| `dienmayhtech-mienga` | [Dienmayhtech - Cách nấu miến gà nấm hương mộc nhĩ](https://dienmayhtech.com/tin-tuc/bep/cach-nau-mien-ga-don-gian-tai-nha-voi-voi-nam-huong-moc-nhi-chi-1h15p) | search | 1 |
| `cookpad-mienga` | [Cookpad - Miến gà nấm hương (Lan Vy)](https://cookpad.com/vn/cong-thuc/24368203) | search | 2 |
| `dmx-canhngao` | [Điện máy xanh - Canh ngao nấu chua](https://www.dienmayxanh.com/vao-bep/3-cach-lam-mon-canh-ngao-ngheu-nau-chua-ngon-mieng-dua-com-01495) | search | 1 |
| `eva-canhngao` | [Eva - Canh ngao rau muống nấu chua](https://eva.vn/bep-eva/canh-ngao-rau-muong-nau-chua-c162a138270.html) | search | 1 |
| `dmx-galuoc` | [Điện máy xanh - Cách làm gà luộc lá chanh](https://www.dienmayxanh.com/vao-bep/cach-lam-ga-luoc-la-chanh-thom-ngon-da-vang-gion-khong-bi-nut-24337) | search | 1 |
| `cooponline-galuoc` | [Co.opOnline - Gà luộc lá chanh](https://cooponline.vn/cong-thuc-nau-an/ga-luoc-la-chanh-mon-an-truyen-thong-thom-ngon-chuan-vi-viet/) | search | 1 |
| `vne-bunmoc` | [VnExpress Cooking - Cách nấu bún mọc](https://vnexpress.net/doi-song-cooking-bun-moc-4215257.html) | search | 1 |
| `tiki-bunmoc` | [Tiki - 4 cách nấu bún mọc](https://tiki.vn/blog/bun-moc/) | search | 1 |
| `hnaau-canhbido` | [Hướng nghiệp Á Âu - Canh bí đỏ thịt bằm](https://www.huongnghiepaau.com/canh-bi-do-thit-bam) | search | 3 |
| `cookbeo-canhbido` | [Cookbeo - Canh bí đỏ thịt bằm](https://cookbeo.com/recipes/canh-bi-do-thit-bam) | search | 2 |
| `cet-canhbido` | [CET - Canh bí đỏ hầm xương, thịt bằm, tôm khô](https://www.cet.edu.vn/cach-nau-canh-bi-do-ham-xuong) | search | 2 |
| `kingfood-canhkhoaitay` | [Kingfoodmart - Canh cà rốt khoai tây thịt bằm](https://kingfoodmart.com/bai-viet/cong-thuc-nau-an/canh-ca-rot-khoai-tay-thit-bam) | search | 3 |
| `bluestone-canhkhoaitay` | [Bluestone - Canh khoai tây cà rốt thịt băm](https://www.bluestone.com.vn/blogs/vao-bep/cach-nau-canh-khoai-tay-ca-rot-thit-bam) | search | 2 |
| `tapchimonngon-canhsuonsuhao` | [Tạp chí món ngon - Canh sườn nấu su hào, cà rốt](http://tapchimonngon.com/mon-ngon/ngay-thuong/1428-canh-suon-nau-su-hao-ca-rot.html) | search | 5 |
| `afamily-canhraucusuon` | [Afamily - Canh rau củ nấu sườn](https://afamily.vn/canh-rau-cu-nau-suon-bo-duong-20101125090832162.chn) | search | 4 |
| `vietnamnet-nemran` | [VietNamNet - Cách làm nem rán truyền thống Hà Nội](https://vietnamnet.vn/bi-quyet-lam-nem-chuan-vi-ha-noi-cong-thuc-duoc-hang-nghin-nguoi-tan-dong-704296.html) | search | 1 |
| `vinid-nemran` | [VinID - Làm nem rán Hà Nội ngon](https://vinid.net/blog/lam-nem-ran-ha-noi-ngon-mon-an-co-truyen-cua-nguoi-ha-thanh/) | search | 1 |
| `vne-dauphunhoi` | [VnExpress Cooking - Đậu phụ nhồi thịt sốt cà chua](https://vnexpress.net/doi-song-cooking-dau-phu-nhoi-thit-sot-ca-chua-4503398.html) | search | 1 |
| `fptshop-dauphunhoi` | [FPT Shop - Đậu phụ nhồi thịt sốt cà chua](https://fptshop.com.vn/tin-tuc/dien-may/dau-phu-nhoi-thit-sot-ca-chua-173425) | search | 1 |
| `pasgo-tomhapsa` | [Pasgo - Tôm hấp bia sả](https://pasgo.vn/blog/bat-mi-cach-lam-tom-hap-bia-sa-cuc-ngon-ma-rat-don-gian-4519) | search | 1 |
| `dmx-tomhap` | [Điện máy xanh - 3 cách chế biến món tôm hấp](https://www.dienmayxanh.com/vao-bep/3-cach-che-bien-mon-tom-hap-ngon-don-gian-nhanh-chong-01741) | search | 1 |
| `afamily-tomhapsa` | [Afamily - Công thức làm tôm hấp sả](https://afamily.vn/bat-mi-cong-thuc-lam-mon-tom-hap-sa-thom-nuc-mui-thit-ngon-ngot-20240229213021327.chn) | search | 1 |
| `vne-tomrang` | [VnExpress Cooking - Tôm rang thịt ba chỉ](https://vnexpress.net/doi-song-cooking-tom-rang-thit-mon-an-quoc-dan-ngay-nong-4455371.html) | search | 2 |
| `dmx-tomrang` | [Điện máy xanh - Tôm rang thịt ba chỉ](https://www.dienmayxanh.com/vao-bep/3-cong-thuc-cho-mon-tom-rang-thit-la-ma-quen-dam-da-hao-com--01449) | search | 1 |
| `eva-tomrim` | [Eva - Tôm rim thịt](https://eva.vn/bep-eva/tom-rim-thit-ngon-dam-da-cho-bua-com-gia-dinh-c162a399784.html) | search | 1 |
| `dmx-muchapgung` | [Điện máy xanh - Mực trứng hấp gừng](https://www.dienmayxanh.com/vao-bep/huong-dan-cach-lam-mon-muc-hap-gung-thom-ngon-01423) | search | 1 |
| `gofood-muchapgung` | [Gofood - Cách làm mực hấp gừng](https://gofood.vn/tin-tuc/cach-lam-muc-hap-gung.html) | search | 1 |
| `haisanloccantho-mucxaocantay` | [Hải sản Lộc Cần Thơ - Mực xào cần tây](https://haisanloccantho.com/muc-xao-can-tay-mon-ngon-de-lam/) | search | 1 |
| `phunuvagiadinh-mucxaocantay` | [Phụ nữ & Gia đình - Mực xào cần tây](https://www.phunuvagiadinh.vn/vao-bep-346/huong-dan-cach-lam-muc-xao-can-tay-ngon-tuyet-dinh-cuc-chuan-vi-394302) | search | 1 |
| `vne-ngaohapsa` | [VnExpress - Nghêu (ngao) hấp sả](https://vnexpress.net/ngheu-ngao-hap-sa-thom-ngon-cho-ngay-cuoi-tuan-3555157.html) | search | 1 |
| `eva-ngaohapsagung` | [Eva - Ngao hấp sả gừng](https://eva.vn/bep-eva/ngao-hap-sa-gung-cho-chi-em-nham-nhi-c162a230989.html) | search | 1 |
| `ivivu-vitluoc` | [iVIVU - Vịt luộc chấm mắm gừng](https://www.ivivu.com/blog/2021/05/bi-quyet-lam-vit-luoc-cham-mam-gung-ngon-mien-ban/) | search | 1 |
| `afamily-vitluoc` | [Afamily - Cách luộc vịt ngon, mềm, không hôi](https://afamily.vn/cach-luoc-vit-ngon-thit-mem-ngot-khong-hoi-20250603105743078.chn) | search | 1 |
| `elmich-bohamkhoaitay` | [Elmich - Cách nấu bò hầm khoai tây](https://shop.elmich.vn/bo-ham-khoai-tay) | search | 2 |
| `bluestone-bapbohamkhoaitay` | [Bluestone - Bắp bò hầm khoai tây](https://www.bluestone.com.vn/blogs/vao-bep/bap-bo-ham-khoai-tay) | search | 1 |
| `cookpad-bokho` | [Cookpad - Bò kho khoai tây cà rốt (Doan Phuong)](https://cookpad.com/vn/cong-thuc/14691880) | search | 1 |
| `dmx-cahap` | [Điện máy xanh - Cá hấp với hành và gừng tươi](https://www.dienmayxanh.com/vao-bep/cach-lam-mon-ca-hap-voi-hanh-va-gung-tuoi-an-lay-hen-dau-nam-00458) | search | 1 |
| `ivivu-canuchap` | [iVIVU - Cá nục hấp hành gừng](https://www.ivivu.com/blog/2020/10/bi-quyet-lam-mon-ca-nuc-hap-hanh-gung-thom-ngon-khong-bi-tanh/) | search | 1 |
| `eva-cahapgunghanh` | [Eva - Cá hấp gừng hành](https://eva.vn/bep-eva/ca-hap-gung-hanh-nong-hoi-nhin-them-chay-nuoc-mieng-c162a295095.html) | search | 1 |
| `vietnamnet-thitkhotieu` | [VietNamNet - Cách làm thịt kho tiêu](https://vietnamnet.vn/cach-lam-thit-kho-tieu-ngon-va-dam-da-cho-bua-com-gia-dinh-2074516.html) | search | 1 |
| `fptshop-thitkhotieu` | [FPT Shop - Thịt kho tiêu](https://fptshop.com.vn/tin-tuc/dien-may/thit-kho-tieu-162725) | search | 1 |
| `tiki-thitkhotieu` | [Tiki - Thịt kho tiêu](https://tiki.vn/blog/thit-kho-tieu/) | search | 1 |
| `dienmaynewsun-thitvien` | [Điện máy Newsun - Thịt viên sốt cà chua](https://dienmaynewsun.com/thit-vien-sot-ca-chua) | search | 1 |

## Nguồn đã tra nhưng không gắn vào món cụ thể

- [Vinmec - Khuyến nghị của WHO về sử dụng muối ăn](https://www.vinmec.com/vie/bai-viet/khuyen-nghi-cua-who-ve-su-dung-muoi-vi) — dùng làm căn cứ cho giới hạn muối khi viết ghi chú/README (WHO: dưới 5 g muối/ngày với người lớn, dưới 3 g với trẻ dưới 5 tuổi; Bộ Y tế VN: 1,5 g/ngày cho trẻ 1-3 tuổi, 1,9 g/ngày cho 4-8 tuổi — theo bài tổng hợp, cần đối chiếu văn bản gốc).
- [CDC Quảng Ninh - Lượng muối cho bé theo từng độ tuổi](https://www.quangninhcdc.vn/luong-muoi-cho-be-theo-tung-do-tuoi/) — dùng làm căn cứ cho giới hạn muối khi viết ghi chú/README (WHO: dưới 5 g muối/ngày với người lớn, dưới 3 g với trẻ dưới 5 tuổi; Bộ Y tế VN: 1,5 g/ngày cho trẻ 1-3 tuổi, 1,9 g/ngày cho 4-8 tuổi — theo bài tổng hợp, cần đối chiếu văn bản gốc).

## Căn cứ y tế/dinh dưỡng đã dùng

- Bắt đầu ăn dặm từ 6 tháng; dưới 12 tháng không cho mật ong, hạt nguyên, đồ cứng; không nêm muối/đường/nước mắm/ớt vào thức ăn của bé dưới 12 tháng; giới thiệu từng thực phẩm mới (Sở Y tế Hà Tĩnh trích PGS.TS.BS Nguyễn Thị Lâm; Alobacsi).
- Trẻ dưới 4 tuổi: tránh hạt nguyên, nho/cà chua bi nguyên quả, miếng thịt lớn (cùng nguồn Hà Tĩnh) — các món có lạc/hạt được gắn `minAgeMonths` cao và cờ `dau_phong`.
- Người cao tuổi: ưu tiên món mềm, hấp/luộc/hầm hơn chiên rán, giảm muối và nước chấm mặn, tránh đồ muối/kho mặn (Vinmec; Sức khỏe & Đời sống).
- Mùa vụ: ước lượng từ **lịch gieo trồng** rau miền Bắc (hatgiongtot.net, nguyenlieusinhhoc.com, kingbio.vn, hachi.com.vn, vuonxanhcuaban.com) quy ra tháng thu hoạch theo thời gian sinh trưởng thông thường, và lịch trái cây (shophoaqua.vn). Đây là ước lượng thực dụng, **không phải số liệu thống kê**.

## Bảng rà soát đối chiếu khối lượng (46 món, 96 dòng)

Khối lượng của ta nằm trong ±50% so với số liệu nguồn đã quy về 4 suất. Test `test/audit.test.js` kiểm tra tự động bảng này.

| Món | Nguyên liệu | Nguồn (lượng) | Ta | Khóa nguồn | Ghi chú |
|---|---|---|---|---|---|
| Canh cua rau đay mướp | Cua đồng | 200 g | 250 g | `dmx-canhcua` | 4 người |
| Canh cua rau đay mướp | Rau đay | 300 g | 300 g | `dmx-canhcua` |  |
| Canh cua rau đay mướp | Mướp hương | 2 qua | 2 qua | `dmx-canhcua` |  |
| Thịt kho tàu (kho trứng) | Thịt ba chỉ | 500 g | 500 g | `huongnghiep-thitkho` |  |
| Thịt kho tàu (kho trứng) | Trứng vịt | 5 qua | 5 qua | `huongnghiep-thitkho` |  |
| Thịt kho tàu (kho trứng) | Nước dừa tươi | 400 ml | 400 ml | `huongnghiep-thitkho` |  |
| Cá kho riềng | Cá trắm | 800 g | 700 g | `dmx-cakhorieng` | riềng thái 50 g + giã 150 g |
| Cá kho riềng | Thịt ba chỉ | 300 g | 200 g | `dmx-cakhorieng` |  |
| Cá kho riềng | Riềng | 200 g | 120 g | `dmx-cakhorieng` |  |
| Đậu phụ sốt cà chua | Đậu phụ | 4 mieng | 4 mieng | `cookbeo-daus` | 2-3 người |
| Đậu phụ sốt cà chua | Cà chua | 3 qua | 3 qua | `cookbeo-daus` |  |
| Thịt rang cháy cạnh | Thịt ba chỉ | 500 g | 500 g | `vietnamnet-thitrang` | hành tím nguồn 8 củ, các nguồn khác 3-4 củ nên không đưa vào đối chiếu |
| Bún chả Hà Nội | Thịt nạc vai | 500 g | 350 g | `vne-buncha` | nguồn: 500 g nạc vai + 500 g ba chỉ cho 4-5 người |
| Bún chả Hà Nội | Thịt ba chỉ | 500 g | 350 g | `vne-buncha` |  |
| Bún riêu cua | Cua đồng | 1000 g | 700 g | `fptshop-bunrieu` | nguồn 1 kg cua đồng cho 4 người; riêu thu được chỉ là một phần |
| Bún riêu cua | Cà chua | 4 qua | 4 qua | `fptshop-bunrieu` | nguồn 3-5 quả |
| Bún riêu cua | Đậu phụ | 2 mieng | 2 mieng | `fptshop-bunrieu` | nguồn 2-3 miếng |
| Canh bí đao thịt bằm | Bí xanh (bí đao) | 300 g | 400 g | `dmx-bidao-thitbam` |  |
| Canh bí đao thịt bằm | Thịt nạc băm | 200 g | 150 g | `dmx-bidao-thitbam` |  |
| Canh cải cúc thịt bằm | Cải cúc (tần ô) | 400 g | 300 g | `vne-cai-cuc` | nguồn 2 bó, giả định 1 bó = 200 g |
| Canh cải cúc thịt bằm | Thịt nạc băm | 150 g | 150 g | `vne-cai-cuc` |  |
| Canh rau ngót thịt bằm | Rau ngót | 250 g | 250 g | `cookbeo-ngot-thitbam` | 1 bó |
| Canh rau ngót thịt bằm | Thịt nạc băm | 250 g | 200 g | `cookbeo-ngot-thitbam` |  |
| Canh khoai sọ nấu sườn | Khoai sọ | 400 g | 400 g | `mnmn-khoaiso` |  |
| Canh khoai sọ nấu sườn | Sườn non | 250 g | 250 g | `mnmn-khoaiso` |  |
| Canh khoai sọ nấu sườn | Cà rốt | 50 g | 50 g | `mnmn-khoaiso` |  |
| Sườn xào chua ngọt | Sườn non | 500 g | 500 g | `vietnamnet-suonxao` |  |
| Cà pháo muối xổi | Cà pháo | 500 g | 500 g | `dmx-caphao` | nước mắm nguồn rất nhiều (2/3 chén), ta dùng ít hơn nên không đưa vào đối chiếu |
| Chả lá lốt | Thịt nạc băm | 400 g | 400 g | `vietnamnet-chalalot` | 20-30 lá lốt |
| Chả trứng hấp | Trứng gà | 6 qua | 6 qua | `vietnamnet-chatrunghap` |  |
| Chả trứng hấp | Thịt nạc băm | 180 g | 180 g | `vietnamnet-chatrunghap` |  |
| Chả trứng hấp | Mộc nhĩ (khô) | 18 g | 10 g | `vietnamnet-chatrunghap` |  |
| Chả trứng hấp | Miến dong | 12 g | 15 g | `vietnamnet-chatrunghap` |  |
| Thịt bò xào hành tây | Thịt bò | 300 g | 300 g | `cookbeo-boxaohanhtay` |  |
| Thịt bò xào hành tây | Hành tây | 1 cu | 1 cu | `cookbeo-boxaohanhtay` |  |
| Cháo gà bí đỏ (7 tháng) | Gạo tẻ | 20 g | 20 g | `longchau-chao-ga` | 1 suất bé: 20 g gạo, 20 g gà, 20 g bí đỏ, 200 ml nước |
| Cháo gà bí đỏ (7 tháng) | Ức gà | 20 g | 20 g | `longchau-chao-ga` |  |
| Cháo gà bí đỏ (7 tháng) | Bí đỏ (bí ngô) | 20 g | 20 g | `longchau-chao-ga` |  |
| Cháo thịt bằm cà rốt (7 tháng) | Gạo tẻ | 40 g | 25 g | `kidsplaza-chao-bo-7t` | 1/4 chén gạo ≈ 40 g |
| Cháo thịt bằm cà rốt (7 tháng) | Thịt nạc băm | 30 g | 25 g | `kidsplaza-chao-bo-7t` | nguồn dùng thịt bò 30 g |
| Cháo thịt bằm cà rốt (7 tháng) | Cà rốt | 20 g | 20 g | `kidsplaza-chao-bo-7t` |  |
| Chè bí đỏ nếp | Bí đỏ (bí ngô) | 500 g | 400 g | `vietnamnet-chebido` |  |
| Chè bí đỏ nếp | Đậu xanh | 150 g | 100 g | `vietnamnet-chebido` |  |
| Chè bí đỏ nếp | Gạo nếp | 100 g | 80 g | `vietnamnet-chebido` | đường nguồn 200 g, ta giảm còn 100 g có chủ ý nên không đưa vào đối chiếu |
| Chè đậu xanh hạt sen | Hạt sen khô | 300 g (x0.67) | 150 g | `vietnamnet-chehatsen` | nguồn cho nồi lớn (~6 người) nên quy về 4 suất |
| Chè đậu xanh hạt sen | Đậu xanh | 200 g (x0.67) | 150 g | `vietnamnet-chehatsen` |  |
| Xôi đỗ xanh | Gạo nếp | 400 g | 400 g | `eva-xoi-dauxanh` |  |
| Xôi đỗ xanh | Đậu xanh | 200 g | 150 g | `eva-xoi-dauxanh` |  |
| Xôi gấc | Gạo nếp | 300 g | 300 g | `vtv-xoigac` |  |
| Xôi gấc | Gấc (xôi gấc) | 200 g | 200 g | `vtv-xoigac` |  |
| Xôi lạc | Gạo nếp | 300 g | 300 g | `xoi-tonghop` |  |
| Xôi lạc | Lạc (đậu phộng) | 150 g | 150 g | `xoi-tonghop` |  |
| Canh bầu nấu tôm khô | Tôm khô | 50 g | 40 g | `dmx-canhbau-tomkho` |  |
| Cá thu sốt cà chua | Cá thu | 500 g | 500 g | `vne-cathusot` |  |
| Cá thu sốt cà chua | Cà chua | 4 qua | 4 qua | `vne-cathusot` |  |
| Miến gà | Miến dong | 200 g | 200 g | `infonet-mienga` | 4-5 người |
| Miến gà | Nấm hương (khô) | 50 g | 25 g | `infonet-mienga` | nấm hương khô; nhiều nguồn dùng 20-50 g |
| Miến gà | Mộc nhĩ (khô) | 30 g | 15 g | `infonet-mienga` |  |
| Canh ngao nấu chua | Ngao/nghêu | 500 g | 500 g | `dmx-canhngao` | một công thức khác dùng 1 kg cho 4 người |
| Gà ta luộc lá chanh | Gà ta nguyên con | 1200 g | 1 con | `dmx-galuoc` | gà 1,2-1,5 kg |
| Gà ta luộc lá chanh | Gừng | 60 g | 40 g | `dmx-galuoc` | 2 củ gừng |
| Bún mọc | Thịt nạc băm | 300 g | 250 g | `vne-bunmoc` |  |
| Bún mọc | Xương ống heo | 1000 g | 700 g | `vne-bunmoc` |  |
| Canh bí đỏ thịt bằm | Bí đỏ (bí ngô) | 450 g | 400 g | `hnaau-canhbido` |  |
| Canh bí đỏ thịt bằm | Thịt nạc băm | 250 g | 150 g | `hnaau-canhbido` | nguồn nhiều thịt hơn; ta lấy 150 g (-40%) |
| Canh khoai tây cà rốt thịt bằm | Khoai tây | 250 g | 250 g | `kingfood-canhkhoaitay` |  |
| Canh khoai tây cà rốt thịt bằm | Cà rốt | 250 g | 150 g | `kingfood-canhkhoaitay` |  |
| Canh khoai tây cà rốt thịt bằm | Thịt nạc băm | 100 g | 100 g | `kingfood-canhkhoaitay` |  |
| Canh sườn nấu su hào cà rốt | Sườn non | 500 g (x0.8) | 300 g | `tapchimonngon-canhsuonsuhao` | nguồn cho 4-5 người |
| Canh sườn nấu su hào cà rốt | Su hào | 600 g (x0.8) | 350 g | `tapchimonngon-canhsuonsuhao` | 2 củ |
| Nem rán (chả giò) | Thịt nạc băm | 300 g | 300 g | `vietnamnet-nemran` |  |
| Nem rán (chả giò) | Miến dong | 50 g | 40 g | `vietnamnet-nemran` |  |
| Nem rán (chả giò) | Cà rốt | 100 g | 100 g | `vietnamnet-nemran` |  |
| Nem rán (chả giò) | Trứng gà | 2 qua | 2 qua | `vietnamnet-nemran` |  |
| Đậu phụ nhồi thịt sốt cà chua | Đậu phụ | 5 mieng | 5 mieng | `vne-dauphunhoi` |  |
| Đậu phụ nhồi thịt sốt cà chua | Thịt nạc băm | 150 g | 150 g | `vne-dauphunhoi` |  |
| Đậu phụ nhồi thịt sốt cà chua | Cà chua | 3.5 qua | 4 qua | `vne-dauphunhoi` | 3-4 quả |
| Bún thang | Giò lụa | 125 g | 100 g | `vne-bunthang` | 100-150 g |
| Bún thang | Trứng gà | 1.5 qua | 2 qua | `vne-bunthang` | 1-2 quả |
| Rau muống xào thịt bò | Thịt bò | 200 g | 200 g | `kingfood-ramuongbo` | nguồn: 200 g thăn bò |
| Tôm hấp sả | Tôm tươi | 300 g | 300 g | `pasgo-tomhapsa` | tôm sú 300 g, sả 5 củ |
| Tôm hấp sả | Sả | 90 g | 3 cay | `pasgo-tomhapsa` | 3 cây sả |
| Tôm rang thịt | Tôm tươi | 400 g | 400 g | `vne-tomrang` |  |
| Tôm rang thịt | Thịt ba chỉ | 200 g | 200 g | `vne-tomrang` |  |
| Mực hấp gừng | Mực | 300 g | 300 g | `dmx-muchapgung` | mực trứng 300 g |
| Mực xào cần tây | Mực | 300 g | 300 g | `haisanloccantho-mucxaocantay` |  |
| Mực xào cần tây | Cần tây | 100 g | 150 g | `haisanloccantho-mucxaocantay` |  |
| Ngao hấp sả ớt | Ngao/nghêu | 500 g | 500 g | `vne-ngaohapsa` |  |
| Vịt luộc chấm gừng | Thịt vịt | 2000 g (x0.5) | 1000 g | `ivivu-vitluoc` | nguồn: 1 con vịt xiêm ~2 kg cho nhà đông; quy 4 suất = 1 kg |
| Bò hầm khoai tây cà rốt | Bắp bò | 500 g | 500 g | `bluestone-bapbohamkhoaitay` |  |
| Bò hầm khoai tây cà rốt | Khoai tây | 300 g | 300 g | `bluestone-bapbohamkhoaitay` | 4-5 củ nhỏ cho nồi lớn, quy 2 củ |
| Bò hầm khoai tây cà rốt | Cà rốt | 200 g | 200 g | `elmich-bohamkhoaitay` | 2 củ |
| Thịt kho tiêu | Thịt ba chỉ | 500 g | 500 g | `vietnamnet-thitkhotieu` |  |
| Thịt viên sốt cà chua | Thịt nạc băm | 300 g | 300 g | `dienmaynewsun-thitvien` |  |
| Thịt viên sốt cà chua | Cà chua | 3 qua | 3 qua | `dienmaynewsun-thitvien` |  |
| Cá hấp gừng hành | Gừng | 20 g | 20 g | `dmx-cahap` | cá 300 g trong nguồn, ta dùng cá lớn hơn cho 4 suất |

## Điều chỉnh sau khi đối chiếu

Các điều chỉnh khối lượng/thời gian đã thực hiện sau khi đối chiếu (bản nháp đầu dựa vào kinh nghiệm chung): canh cua rau đay mướp (mướp 1 -> 2 quả); thịt kho tàu (trứng 4 -> 5, nước dừa 300 -> 400 ml); cá kho riềng (cá 600 -> 700 g, ba chỉ 150 -> 200 g, riềng 60 -> 120 g); thịt rang cháy cạnh (hành khô 15 -> 40 g); bún chả (thịt 500 -> 700 g); bún riêu cua (cua 500 -> 700 g, cà chua 3 -> 4 quả, bún 500 -> 600 g); canh bí đao (thịt 120 -> 150 g); canh cải cúc (200 -> 300 g); canh rau ngót (thịt 150 -> 200 g); canh khoai sọ (khoai 350 -> 400 g); chả trứng hấp (thịt 150 -> 180 g, mộc nhĩ 5 -> 10 g); cháo bò/thịt cà rốt cho bé (gạo 20 -> 25 g, thịt 20 -> 25 g); chè bí đỏ nếp; chè đậu xanh hạt sen; canh bầu tôm khô (tôm khô 30 -> 40 g); cá thu sốt cà chua (cà chua 3 -> 4 quả); miến gà (nấm hương 10 -> 25 g, mộc nhĩ 5 -> 15 g, gà 400 -> 500 g); bún mọc (xương 500 -> 700 g, thêm giò sống); canh bí đỏ thịt bằm (bí 300 -> 400 g, thịt 120 -> 150 g); canh khoai tây cà rốt thịt bằm; canh su hào cà rốt sườn; nem rán (thịt 250 -> 300 g, thêm su hào, trứng 1 -> 2); đậu phụ nhồi thịt sốt cà chua (cà chua 3 -> 4); tôm hấp sả (sả 1 -> 3 cây); mực hấp gừng (mực 400 -> 300 g, hấp 5-6 phút); ngao hấp sả ớt (600 -> 500 g); vịt luộc chấm gừng (800 -> 1000 g, luộc 25-30 phút); bò hầm khoai tây cà rốt (bắp bò 400 -> 500 g, khoai tây 200 -> 300 g, cà rốt 150 -> 200 g); thịt kho tiêu (400 -> 500 g); thịt viên sốt cà chua (thêm trứng); gà luộc lá chanh (thời gian luộc theo nguồn: tắt bếp ủ).

Một số sai khác có chủ ý: lượng đường trong chè (giảm nhiều so với nguồn), nước mắm trong cà pháo muối xổi (nguồn rất mặn), số củ hành tím trong thịt rang cháy cạnh (nguồn khác nhau 3-8 củ), xem cột Ghi chú.

## Nguồn nêu sai/khác biệt đáng lưu ý

- Một nguồn gộp thời gian luộc "đậu đũa (đậu bắp) 2-3 phút" — đậu bắp (okra) và đậu đũa khác nhau; ta lấy 4-5 phút cho đậu đũa (phải chín kỹ).
- Các nguồn nấu phở/bún ốc/bún riêu thường cho nồi lớn (8-10 bát), ta quy về 4 suất theo kinh nghiệm chung, **không** coi là đã đối chiếu số liệu cho phở bò và bún ốc.

## Giới hạn

- Đây **không phải tư vấn y tế hay dinh dưỡng cá nhân**. Cờ dị ứng/kiêng được suy ra tự động từ danh sách nguyên liệu; nước mắm, hạt nêm, dầu hào, tương có thể chứa cá/gluten/đậu nành nên không được coi là cờ riêng ngoại trừ các nguyên liệu đã gắn cờ (dầu hào = hải sản, nước tương = gluten + đậu nành, mắm tôm = hải sản). Người dị ứng cá/hải sản cần tự kiểm tra nước mắm và gia vị.
- Món cho trẻ dưới 12 tháng chỉ mang tính tham khảo, luôn kèm ghi chú "hỏi bác sĩ".
- Khối lượng là khẩu phần gia đình điển hình (4 người), không phải nhu cầu dinh dưỡng tính toán. Không có thông tin calo/chất dinh dưỡng.
- Dữ liệu chỉ cho ẩm thực **miền Bắc**; chưa có miền khác.
- Các URL có thể thay đổi hoặc biến mất; đã lưu tên bài và URL tại thời điểm tra cứu.
