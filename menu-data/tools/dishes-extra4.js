import { D } from './dsl.js';

// ================= BỔ SUNG: rau mùa xuân-đông và canh không dùng thịt heo =================
D('cai-cuc-xao-toi', 'Cải cúc xào tỏi', 'xao', 'dong xuan', 'k13 soft t8 c1',
  'cai-cuc 300g; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Cải cúc nhặt, rửa, cắt khúc.|Phi tỏi, xào cải lửa to.|Nêm nhạt, tắt bếp khi cải vừa mềm.',
  'Xào nhanh để giữ hương.', 'hnaau-rauxaotoi vne-cai-cuc', 'Cải cúc vụ đông-xuân.');
D('cai-thao-luoc', 'Cải thảo luộc', 'luoc', 'dong xuan', 'k13 eld soft ls lf t10 c1',
  'cai-thao 400g; nuoc-mam 10ml; muoi 2g',
  'Cải thảo rửa, cắt miếng lớn.|Luộc nước sôi có chút muối 4-5 phút.|Vớt ra, chấm nước mắm nhạt.',
  'Ngọt mềm.', 'tiki-luocrau vinmec-rauluoc', 'Cải thảo vụ đông-xuân.');
D('ca-rot-khoai-tay-hap', 'Cà rốt khoai tây hấp', 'luoc', 'q', 'k13 eld soft ls lf lsug t25 c1',
  'ca-rot 150g; khoai-tay 250g; muoi 1g',
  'Cà rốt, khoai tây gọt vỏ, cắt miếng vừa.|Hấp 15-20 phút đến mềm.|Ăn nóng, chấm chút muối vừng hoặc dùng nguyên.',
  'Không cần gia vị, hợp bé nhỏ và người lớn tuổi.', 'tiki-luocrau skds-monmem', 'Củ có quanh năm.');
D('su-hao-ca-rot-xao', 'Su hào cà rốt xào', 'xao', 'dong xuan', 'k13 soft t15 c1',
  'su-hao 250g; ca-rot 100g; toi 10g; dau-an 20ml; nuoc-mam 10ml',
  'Su hào, cà rốt gọt vỏ, thái sợi.|Phi tỏi, xào cà rốt trước rồi su hào.|Thêm chút nước, đậy nắp vài phút cho mềm.|Nêm nhạt.',
  'Giòn ngọt.', 'cookpad-susucarot hnaau-rauxaotoi', 'Su hào vụ đông-xuân.');
D('cai-thia-xao-nam', 'Cải thìa xào nấm', 'xao', 'dong xuan', 'k13 soft t12 c1',
  'cai-thia 300g; nam-bao-ngu 150g; toi 10g; dau-an 20ml; nuoc-mam 10ml',
  'Cải thìa rửa, bổ đôi. Nấm xé nhỏ.|Phi tỏi, xào nấm đến săn.|Cho cải vào xào lửa to.|Nêm nhạt.',
  'Chay nhẹ.', 'hnaau-rauxaotoi', 'Cải thìa vụ đông-xuân.');
D('bap-cai-xao-ca-chua', 'Bắp cải xào cà chua', 'xao', 'dong xuan', 'k13 soft t12 c1',
  'bap-cai 300g; ca-chua 2qua; hanh-kho 10g; dau-an 20ml; nuoc-mam 10ml',
  'Bắp cải thái miếng. Cà chua cắt múi.|Phi hành, xào cà chua ra nước.|Cho bắp cải vào xào lửa vừa đến mềm.|Nêm vừa.',
  'Chua ngọt nhẹ.', 'tiki-luocrau cookbeo-daus', 'Bắp cải vụ đông.');
D('dau-ha-lan-xao-ca-rot', 'Đậu Hà Lan xào cà rốt', 'xao', 'dong xuan', 'k13 soft t10 c2',
  'dau-ha-lan 200g; ca-rot 100g; toi 10g; dau-an 20ml; nuoc-mam 10ml',
  'Đậu Hà Lan nhặt, rửa sạch. Cà rốt thái hạt lựu.|Phi tỏi, xào cà rốt trước.|Cho đậu vào xào lửa to 3 phút.|Nêm nhạt.',
  'Đậu chín kỹ; với trẻ nhỏ nên xay/dằm nhỏ hoặc bỏ vỏ.', 'hnaau-rauxaotoi', 'Đậu Hà Lan vụ đông-xuân.');

// ----- canh không dùng thịt heo (gà, bò, đậu phụ, nấm) -----
D('canh-rau-ngot-thit-ga', 'Canh rau ngót thịt gà băm', 'canh', 'xuan ha thu', 'k13 eld soft ls t25 c2',
  'rau-ngot 250g; thit-ga 150g; +sl',
  'Thịt gà băm nhỏ, ướp nước mắm, tiêu.|Phi hành, xào gà chín.|Đổ nước đun sôi, hớt bọt.|Cho rau ngót vào, nêm nhạt, sôi lại tắt bếp.',
  'Biến thể không dùng thịt heo của canh rau ngót thịt bằm.', 'cookbeo-ngot-thitbam', 'Rau ngót vụ xuân-hạ-thu.');
D('canh-bi-dao-thit-ga', 'Canh bí đao nấu gà', 'canh', 'ha thu', 'k13 eld soft ls lf t30 c2',
  'bi-dao 400g; thit-ga 200g; gung 5g; hanh-la 10g; +sl',
  'Gà chặt nhỏ, chần sơ.|Phi hành, gừng, xào gà thơm.|Đổ nước nấu 15 phút, cho bí vào nấu mềm.|Nêm nhạt, rắc hành lá.',
  'Biến thể không dùng thịt heo của canh bí đao.', 'dmx-bidao-thitbam fptshop-bidao', 'Bí đao vụ hè-thu.');
D('canh-cai-cuc-thit-bo', 'Canh cải cúc thịt bò băm', 'canh', 'dong xuan', 'k13 eld soft ls t15 c3',
  'cai-cuc 250g; thit-bo-bam 120g; +sl',
  'Thịt bò băm ướp nước mắm, tiêu.|Phi hành, xào bò chín.|Đổ nước đun sôi, hớt bọt.|Cho cải cúc vào, nêm nhạt, sôi lại tắt bếp.',
  'Biến thể không dùng thịt heo của canh cải cúc thịt bằm.', 'vne-cai-cuc kidsplaza-chao-bo-7t', 'Cải cúc vụ đông-xuân.');
D('canh-cai-xanh-thit-bo', 'Canh cải xanh thịt bò băm', 'canh', 'thu dong xuan', 'k13 eld soft ls t15 c3',
  'cai-xanh 300g; thit-bo-bam 120g; +sl',
  'Thịt bò băm ướp nước mắm, tiêu.|Phi hành, xào bò chín.|Đổ nước đun sôi, hớt bọt.|Cho cải vào, nêm nhạt, sôi lại tắt bếp.',
  'Biến thể không dùng thịt heo của canh cải thịt bằm.', 'cookbeo-cai-thitbam', 'Cải xanh vụ thu-đông-xuân.');
D('canh-bap-cai-thit-ga', 'Canh bắp cải nấu gà', 'canh', 'dong xuan', 'k13 eld soft ls t30 c2',
  'bap-cai 300g; thit-ga 200g; hanh-la 10g; +sl',
  'Gà chặt nhỏ, chần sơ.|Phi hành, xào gà, đổ nước nấu 15 phút.|Cho bắp cải vào nấu 8 phút.|Nêm nhạt, rắc hành lá.',
  'Ngọt nước gà.', 'cookbeo-cai-thitbam tiki-luocrau', 'Bắp cải vụ đông.');
D('canh-bi-do-thit-ga', 'Canh bí đỏ nấu gà', 'canh', 'thu dong', 'k13 eld soft ls t35 c2',
  'bi-do 300g; thit-ga 200g; hanh-la 10g; +sl',
  'Gà chặt nhỏ, chần sơ.|Phi hành, xào gà, đổ nước nấu 15 phút.|Cho bí đỏ vào nấu mềm 12 phút.|Nêm nhạt, rắc hành lá.',
  'Ngọt, mềm, rất hợp bé nhỏ.', 'hnaau-canhbido cookbeo-canhbido monte-chao-ga-bido', 'Bí đỏ vụ thu-đông.');
D('canh-khoai-tay-ca-rot-thit-bo', 'Canh khoai tây cà rốt bò băm', 'canh', 'q', 'k13 eld soft ls t30 c3',
  'khoai-tay 250g; ca-rot 150g; thit-bo-bam 100g; hanh-la 10g; +sl',
  'Khoai tây, cà rốt gọt vỏ, cắt hạt lựu.|Phi hành, xào bò băm chín.|Đổ nước đun sôi, cho cà rốt rồi khoai vào.|Nấu mềm 12 phút, nêm nhạt.',
  'Biến thể không dùng thịt heo.', 'kingfood-canhkhoaitay bluestone-canhkhoaitay', 'Củ có quanh năm.');
D('canh-su-su-thit-ga', 'Canh su su nấu gà', 'canh', 'thu dong', 'k13 eld soft ls t30 c2',
  'su-su 300g; thit-ga 200g; hanh-la 10g; +sl',
  'Gà chặt nhỏ, chần sơ, xào với hành khô.|Đổ nước nấu 15 phút.|Cho su su cắt miếng vào nấu mềm.|Nêm nhạt, rắc hành lá.',
  'Ngọt thanh.', 'cookpad-susucarot cookbeo-cai-thitbam', 'Su su vụ thu-đông.');
D('canh-nam-rom-dau-hu', 'Canh nấm đậu hũ non', 'canh', 'q', 'k13 eld soft ls t15 c2',
  'nam-kim-cham 120g; nam-bao-ngu 100g; dau-phu-non 1hop; ca-chua 1qua; hanh-la 10g; +sl',
  'Nấm cắt gốc, tách rời. Đậu hũ non cắt khối.|Phi hành, xào cà chua.|Đổ nước đun sôi, cho nấm vào 4 phút.|Cho đậu hũ vào nhẹ tay, nêm nhạt.',
  'Chay, không thịt heo. Chứa đậu nành.', 'cookbeo-daus', 'Nấm có quanh năm.');
