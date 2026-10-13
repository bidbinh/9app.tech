import { D } from './dsl.js';

// ================= CANH BỔ SUNG (không hải sản) để đủ món cho gia đình có dị ứng hải sản/trứng =================
D('canh-bi-do-xuong', 'Canh bí đỏ nấu xương', 'canh', 'thu dong', 'k13 eld soft ls t50 c1',
  'bi-do 300g; xuong-ong-heo 300g; hanh-la 10g; +sl',
  'Xương chần sơ, hầm 35 phút lấy nước ngọt.|Bí đỏ gọt vỏ, cắt miếng.|Cho bí vào nấu 12 phút đến mềm.|Nêm nhạt, rắc hành lá.',
  'Ngọt tự nhiên, rất mềm.', 'cet-canhbido hnaau-canhbido', 'Bí đỏ vụ thu-đông.');
D('canh-bau-xuong', 'Canh bầu nấu sườn', 'canh', 'ha thu', 'k13 eld soft ls t45 c2',
  'bau 1qua; suon-non 250g; hanh-la 10g; +sl',
  'Sườn chần sơ, hầm 25 phút.|Bầu gọt vỏ, cắt miếng.|Cho bầu vào nấu 8 phút.|Nêm nhạt, rắc hành lá.',
  'Mát, ngọt.', 'cookbeo-canhbau mnmn-khoaiso', 'Bầu vụ hè-thu.');
D('canh-muop-thit-bam', 'Canh mướp thịt bằm', 'canh', 'ha thu', 'k13 eld soft ls t20 c1',
  'muop 2qua; thit-nac-bam 120g; +sl',
  'Mướp gọt vỏ, cắt vát.|Thịt băm ướp nước mắm, tiêu.|Phi hành, xào thịt, đổ nước đun sôi.|Cho mướp vào nấu mềm, nêm nhạt.',
  'Mát, ngọt.', 'dmx-canhcua cookbeo-cai-thitbam', 'Mướp vụ hè-thu.');
D('canh-rau-muong-thit-bam', 'Canh rau muống thịt bằm', 'canh', 'xuan ha thu', 'k13 eld soft ls t20 c1',
  'rau-muong 300g; thit-nac-bam 120g; ca-chua 1qua?; +sl',
  'Rau muống nhặt, rửa, bẻ đoạn.|Thịt băm ướp nước mắm, tiêu; xào chín với hành khô.|Đổ nước đun sôi, cho cà chua nếu dùng.|Cho rau vào, nêm nhạt, sôi lại tắt bếp.',
  'Món quen thuộc hè-thu.', 'vne-luoc-ramuong cookbeo-ngot-thitbam', 'Rau muống vụ hè-thu.');
D('canh-rau-ngot-suon', 'Canh rau ngót nấu sườn', 'canh', 'xuan ha thu', 'k13 eld soft ls t45 c2',
  'rau-ngot 250g; suon-non 250g; +sl',
  'Sườn chần sơ, hầm 25 phút.|Rau ngót tuốt lá, rửa sạch, vò nhẹ.|Nêm nhạt rồi cho rau vào.|Sôi lại là tắt bếp.',
  'Rau ngót mềm, ngọt.', 'cookbeo-ngot-thitbam mnmn-khoaiso', 'Rau ngót vụ xuân-hạ-thu.');
D('canh-cai-cuc-suon', 'Canh cải cúc nấu sườn', 'canh', 'dong xuan', 'k13 eld soft ls t45 c2',
  'cai-cuc 250g; suon-non 250g; +sl',
  'Sườn chần sơ, hầm 25 phút.|Cải cúc nhặt, rửa sạch.|Nêm nhạt nồi canh sườn.|Cho cải cúc vào, sôi lại tắt bếp.',
  'Thơm đặc trưng, hợp ngày lạnh.', 'vne-cai-cuc mnmn-khoaiso', 'Cải cúc vụ đông-xuân.');
D('canh-khoai-so-thit-bam', 'Canh khoai sọ thịt bằm', 'canh', 'thu dong', 'k13 eld soft ls t35 c1',
  'khoai-so 300g; thit-nac-bam 120g; hanh-la 10g; +sl',
  'Khoai sọ gọt vỏ, cắt miếng vừa.|Thịt băm ướp nước mắm; xào chín với hành khô.|Đổ nước, cho khoai vào nấu mềm bở 20 phút.|Nêm nhạt, rắc hành lá.',
  'Khoai sọ bở ngọt.', 'mnmn-khoaiso cet-khoaiso', 'Khoai sọ vụ thu-đông.');
D('canh-bap-cai-thit-bam', 'Canh bắp cải thịt bằm', 'canh', 'dong xuan', 'k13 eld soft ls t20 c1',
  'bap-cai 300g; thit-nac-bam 120g; +sl',
  'Bắp cải rửa, cắt miếng.|Thịt băm ướp nước mắm, tiêu; xào chín với hành khô.|Đổ nước đun sôi, cho bắp cải vào nấu 8 phút.|Nêm nhạt.',
  'Ngọt thanh.', 'cookbeo-cai-thitbam tiki-luocrau', 'Bắp cải vụ đông.');
D('canh-su-su-thit-bam', 'Canh su su thịt bằm', 'canh', 'thu dong', 'k13 eld soft ls t25 c1',
  'su-su 300g; thit-nac-bam 120g; hanh-la 10g; +sl',
  'Su su gọt vỏ, cắt miếng hoặc sợi.|Thịt băm ướp nước mắm; xào chín với hành khô.|Đổ nước, cho su su vào nấu mềm.|Nêm nhạt, rắc hành lá.',
  'Ngọt mềm.', 'cookpad-susucarot cookbeo-cai-thitbam', 'Su su vụ thu-đông.');
D('canh-nam-kim-cham-thit-bam', 'Canh nấm kim châm thịt bằm', 'canh', 'q', 'k13 eld soft ls t20 c2',
  'nam-kim-cham 150g; thit-nac-bam 100g; ca-chua 1qua; hanh-la 10g; +sl',
  'Nấm cắt gốc, tách rời. Thịt băm ướp nhạt.|Phi hành, xào cà chua và thịt.|Đổ nước đun sôi, cho nấm vào nấu 4 phút.|Nêm nhạt, rắc hành lá.',
  'Nấm chín kỹ.', 'cookbeo-daus cookbeo-cai-thitbam', 'Nấm kim châm có quanh năm.');
D('canh-mong-toi-suon', 'Canh mồng tơi nấu sườn', 'canh', 'ha thu', 'k13 eld soft ls t45 c2',
  'mong-toi 250g; suon-non 250g; +sl',
  'Sườn chần sơ, hầm 25 phút.|Mồng tơi tuốt lá, rửa sạch.|Nêm nhạt nồi canh sườn.|Cho mồng tơi vào, sôi lại tắt bếp.',
  'Mát.', 'cookbeo-ngot-thitbam mnmn-khoaiso', 'Mồng tơi vụ hè.');
D('canh-du-du-xanh-suon', 'Canh đu đủ xanh nấu sườn', 'canh', 'q', 'k13 eld soft ls t50 c2',
  'du-du-xanh 300g; suon-non 250g; hanh-la 10g; +sl',
  'Sườn chần sơ, hầm 25 phút.|Đu đủ xanh gọt vỏ, bỏ ruột, cắt miếng.|Cho đu đủ vào nấu mềm 12 phút.|Nêm nhạt, rắc hành lá.',
  'Đu đủ xanh có quanh năm; món bổ cho mẹ sau sinh theo kinh nghiệm dân gian (không phải khuyến cáo y tế).', 'mnmn-khoaiso afamily-canhraucusuon', 'Đu đủ xanh có quanh năm.');
D('canh-su-hao-thit-bam', 'Canh su hào thịt bằm', 'canh', 'dong xuan', 'k13 eld soft ls t25 c1',
  'su-hao 300g; thit-nac-bam 120g; hanh-la 10g; +sl',
  'Su hào gọt vỏ, thái miếng mỏng.|Thịt băm ướp nước mắm; xào chín với hành khô.|Đổ nước, cho su hào vào nấu mềm 12 phút.|Nêm nhạt, rắc hành lá.',
  'Su hào ngọt giòn.', 'mnmn-khoaiso tapchimonngon-canhsuonsuhao', 'Su hào vụ đông-xuân.');
