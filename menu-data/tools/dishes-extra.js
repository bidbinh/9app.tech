import { D } from './dsl.js';

// ================= BỔ SUNG (đủ món để lập thực đơn 4 tuần không lặp trong mọi mùa) =================
D('canh-khoai-tay-suon', 'Canh khoai tây nấu sườn', 'canh', 'q', 'k13 eld soft ls t45 c2',
  'suon-non 250g; khoai-tay 250g; ca-rot 100g; hanh-la 10g; +sl',
  'Sườn chần sơ, hầm khoảng 25 phút.|Khoai tây, cà rốt gọt vỏ, cắt miếng.|Cho khoai và cà rốt vào nấu mềm 12 phút.|Nêm nhạt, rắc hành lá.',
  'Mềm, ngọt, hợp mọi lứa tuổi.', 'kingfood-canhkhoaitay tapchimonngon-canhsuonsuhao', 'Khoai tây, cà rốt có quanh năm.');
D('canh-ca-rot-suon', 'Canh sườn nấu cà rốt', 'canh', 'q', 'k13 eld soft ls t45 c2',
  'suon-non 250g; ca-rot 250g; hanh-la 10g; rau-thom 10g?; +sl',
  'Sườn chần sơ rồi hầm 25 phút.|Cà rốt gọt vỏ, cắt miếng.|Cho cà rốt vào nấu mềm 12 phút.|Nêm nhạt, rắc hành lá, rau thơm.',
  'Ngọt tự nhiên.', 'tapchimonngon-canhsuonsuhao afamily-canhraucusuon', 'Cà rốt có quanh năm.');
D('canh-xuong-ham-rau-cu', 'Canh xương hầm rau củ', 'canh', 'q', 'k13 eld soft ls t60 c2',
  'xuong-ong-heo 400g; ca-rot 100g; khoai-tay 150g; hanh-tay 0.5cu; hanh-la 10g; +sl',
  'Xương chần sơ, hầm 40 phút lấy nước ngọt.|Rau củ gọt vỏ, cắt miếng vừa.|Cho cà rốt, khoai, hành tây vào nấu 12 phút.|Nêm nhạt, rắc hành lá.',
  'Hợp trẻ nhỏ và người lớn tuổi.', 'afamily-canhraucusuon tapchimonngon-canhsuonsuhao', 'Rau củ có quanh năm.');
D('canh-cai-thao-thit-vien', 'Canh cải thảo thịt viên', 'canh', 'dong xuan', 'k13 eld soft ls t30 c1',
  'cai-thao 300g; thit-nac-bam 150g; hanh-la 10g; +sl',
  'Thịt băm trộn hành, chút nước mắm và tiêu, vo viên nhỏ.|Đun nước sôi, thả thịt viên vào nấu chín.|Cho cải thảo vào nấu mềm 6-8 phút.|Nêm nhạt.',
  'Viên nhỏ mềm cho bé.', 'cookbeo-cai-thitbam', 'Cải thảo vụ đông-xuân.');
D('canh-ga-nau-nam', 'Canh gà nấu nấm', 'canh', 'q', 'k13 eld soft ls t40 c2',
  'thit-ga 300g; nam-bao-ngu 150g; nam-kim-cham 100g; gung 10g; hanh-la 10g; +sl',
  'Gà chặt miếng nhỏ, chần sơ.|Phi hành, xào gà với gừng cho thơm.|Đổ nước, nấu 20 phút cho gà chín mềm.|Cho nấm vào nấu 5 phút, nêm nhạt, rắc hành lá.',
  'Gà chín kỹ.', 'skds-monmem cookpad-mienga', 'Nấm có quanh năm.');
D('canh-bong-cai-tom', 'Canh súp lơ nấu tôm', 'canh', 'dong xuan', 'k13 soft ls t15 c2',
  'bong-cai 250g; tom-tuoi 100g; ca-rot 50g?; +sl',
  'Súp lơ tách nhánh nhỏ. Tôm bóc vỏ.|Phi hành, xào tôm chín.|Đổ nước, đun sôi, cho cà rốt rồi súp lơ vào.|Nấu 5 phút, nêm nhạt.',
  'Hải sản.', 'tiki-luocrau cookbeo-cai-thitbam', 'Súp lơ vụ đông.');
D('canh-bap-cai-tom', 'Canh bắp cải nấu tôm', 'canh', 'dong xuan', 'k13 soft ls t15 c1',
  'bap-cai 300g; tom-tuoi 100g; +sl',
  'Bắp cải rửa, cắt miếng.|Tôm bóc vỏ, xào qua với hành khô.|Đổ nước đun sôi, cho bắp cải vào.|Nấu 8 phút cho mềm, nêm nhạt.',
  'Hải sản.', 'tiki-luocrau cookbeo-cai-thitbam', 'Bắp cải vụ đông.');
D('canh-cai-thia-thit-bam', 'Canh cải thìa thịt bằm', 'canh', 'dong xuan', 'k13 eld soft ls t15 c1',
  'cai-thia 300g; thit-nac-bam 120g; +sl',
  'Cải thìa rửa, cắt khúc.|Thịt băm ướp nước mắm, tiêu.|Phi hành, xào thịt, đổ nước đun sôi.|Cho cải vào, nêm nhạt, sôi lại tắt bếp.',
  'Ngọt, mềm.', 'cookbeo-cai-thitbam', 'Cải thìa vụ đông-xuân.');
D('canh-dau-hu-non-thit-bam', 'Canh đậu hũ non thịt bằm', 'canh', 'q', 'k13 eld soft ls t15 c1',
  'dau-phu-non 1hop; thit-nac-bam 100g; hanh-la 10g; +sl',
  'Đậu hũ non cắt khối nhỏ.|Thịt băm ướp nước mắm, tiêu; xào chín với hành khô.|Đổ nước đun sôi, cho đậu vào nhẹ tay.|Nấu 5 phút, nêm nhạt, rắc hành lá.',
  'Chứa đậu nành. Rất mềm.', 'cookbeo-daus', 'Quanh năm.');
D('canh-nam-huong-thit-bam', 'Canh nấm hương thịt bằm', 'canh', 'q', 'k13 eld soft ls t25 c2',
  'nam-huong 10g; thit-nac-bam 150g; hanh-la 10g; +sl',
  'Nấm hương ngâm mềm, thái nhỏ, giữ nước ngâm.|Xào thịt băm với hành khô và nấm.|Đổ nước ngâm nấm và nước lọc, đun sôi.|Nấu 10 phút, nêm nhạt, rắc hành lá.',
  'Thơm, ngọt nước; nấu nhạt.', 'infonet-mienga skds-monmem', 'Quanh năm.');
D('canh-cai-ngot-trung', 'Canh cải ngọt trứng đánh', 'canh', 'q', 'k13 soft ls t12 c1',
  'cai-ngot 250g; trung-ga 2qua; hanh-kho 10g; dau-an 10ml; nuoc-mam 8ml',
  'Cải ngọt rửa, cắt khúc.|Phi hành, đổ nước đun sôi.|Cho cải vào, sôi lại thì đánh trứng, rót từ từ vào, khuấy nhẹ.|Nêm nhạt.',
  'Có trứng.', 'vietnamnet-trungducthit cookbeo-cai-thitbam', 'Cải ngọt có gần quanh năm.');
D('canh-sup-lo-trang-thit-bam', 'Canh súp lơ trắng thịt bằm', 'canh', 'dong xuan', 'k13 eld soft ls t20 c1',
  'sup-lo-trang 300g; thit-nac-bam 100g; ca-rot 50g?; +sl',
  'Súp lơ tách nhánh nhỏ.|Xào thịt băm với hành khô.|Đổ nước đun sôi, cho cà rốt rồi súp lơ vào.|Nấu 8 phút cho mềm, nêm nhạt.',
  'Ngọt, mềm.', 'cookbeo-cai-thitbam tiki-luocrau', 'Súp lơ vụ đông.');
D('canh-bi-xanh-xuong', 'Canh bí xanh nấu xương', 'canh', 'ha thu', 'k13 eld soft ls lf t50 c1',
  'bi-dao 400g; xuong-ong-heo 300g; hanh-la 10g; +sl',
  'Xương chần sơ, hầm 35 phút.|Bí gọt vỏ, cắt miếng.|Cho bí vào nấu 10 phút đến mềm.|Nêm nhạt, rắc hành lá.',
  'Mát, thanh.', 'dmx-bidao-thitbam fptshop-bidao', 'Bí xanh vụ hè-thu.');
D('canh-ca-chua-dau-phu', 'Canh cà chua đậu phụ', 'canh', 'q', 'k13 soft ls t15 c1',
  'ca-chua 2qua; dau-phu 2mieng; hanh-la 10g; hanh-kho 10g; dau-an 10ml; nuoc-mam 8ml',
  'Đậu phụ cắt miếng nhỏ. Cà chua cắt múi cau.|Phi hành, xào cà chua ra nước.|Đổ nước đun sôi, cho đậu vào nấu 5 phút.|Nêm nhạt, rắc hành lá.',
  'Chứa đậu nành.', 'cookbeo-daus', 'Quanh năm.');
D('canh-cu-cai-tom-kho', 'Canh củ cải nấu tôm khô', 'canh', 'dong xuan', 'eld soft t30 c1',
  'cu-cai 300g; tom-kho 20g; hanh-la 10g; +sl',
  'Củ cải gọt vỏ, thái miếng hoặc sợi.|Tôm khô ngâm mềm, giã dập, phi với hành.|Đổ nước đun sôi, cho củ cải vào nấu mềm.|Nêm nhạt, rắc hành lá.',
  'Tôm khô mặn nên nêm rất ít.', 'dmx-canhbau-tomkho mnmn-khoaiso', 'Củ cải vụ đông-xuân.');

// ----- rau, xào, mặn bổ sung -----
D('cai-thia-luoc', 'Cải thìa luộc', 'luoc', 'dong xuan', 'k13 eld soft ls lf t8 c1',
  'cai-thia 400g; nuoc-mam 10ml; muoi 2g',
  'Cải thìa nhặt, rửa, bổ đôi.|Luộc nước sôi có chút muối 2-3 phút.|Vớt ra, ăn với nước mắm nhạt.',
  'Giữ màu xanh.', 'tiki-luocrau lemon8-luoccaingot', 'Cải thìa vụ đông-xuân.');
D('rau-bina-xao-toi', 'Rau chân vịt xào tỏi', 'xao', 'dong xuan', 'k13 soft t8 c1',
  'rau-bina 300g; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Rau chân vịt rửa sạch, cắt đoạn.|Phi tỏi, xào rau lửa to.|Nêm nhạt, tắt bếp ngay khi rau vừa mềm.',
  'Xào nhanh để rau không ra nhiều nước.', 'hnaau-rauxaotoi yte-nghean-raucumuadong', 'Rau chân vịt mùa đông.');
D('cai-xoong-xao-toi', 'Cải xoong xào tỏi', 'xao', 'dong xuan', 'k13 soft t8 c1',
  'cai-xoong 250g; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Cải xoong rửa, cắt khúc.|Phi tỏi, xào cải lửa to.|Nêm vừa, tắt bếp khi cải vừa tái.',
  'Hơi hăng nhẹ.', 'hnaau-rauxaotoi', 'Cải xoong vụ đông-xuân.');
D('sup-lo-trang-xao-toi', 'Súp lơ trắng xào tỏi', 'xao', 'dong xuan', 'k13 soft t12 c1',
  'sup-lo-trang 350g; ca-rot 50g; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Súp lơ tách nhánh, chần sơ.|Phi tỏi, xào súp lơ và cà rốt.|Nêm vừa, đậy nắp vài phút cho mềm.',
  'Chần trước để rau mềm đều.', 'tiki-luocrau hnaau-rauxaotoi', 'Súp lơ vụ đông.');
D('nam-bao-ngu-xao-toi', 'Nấm bào ngư xào tỏi', 'xao', 'q', 'k13 soft t10 c2',
  'nam-bao-ngu 300g; toi 10g; hanh-la 10g; dau-an 20ml; nuoc-mam 10ml',
  'Nấm xé nhỏ.|Phi tỏi, xào nấm lửa to đến săn.|Nêm vừa, rắc hành lá.',
  'Nấm chín kỹ.', 'hnaau-rauxaotoi', 'Nấm có quanh năm.');
D('ca-rot-xao-trung', 'Cà rốt xào trứng', 'xao', 'q', 'k13 soft t12 c1',
  'ca-rot 250g; trung-ga 2qua; toi 5g; dau-an 15ml; nuoc-mam 10ml',
  'Cà rốt gọt vỏ, nạo hoặc thái sợi.|Phi tỏi, xào cà rốt gần mềm.|Đổ trứng đánh tan vào đảo đều.|Nêm vừa.',
  'Có trứng. Hợp trẻ nhỏ.', 'hnaau-rauxaotoi', 'Cà rốt có quanh năm.');
D('thit-lon-luoc-gung', 'Thịt luộc chấm nước mắm gừng', 'man', 'q', 'k13 eld soft lf t30 c1',
  'thit-nac-vai 400g; gung 20g; nuoc-mam 30ml; chanh 1qua; duong 10g; muoi 3g',
  'Luộc thịt trong nước sôi có chút muối, gừng đến chín mềm.|Vớt ra để nguội vừa, thái lát mỏng.|Pha nước chấm: nước mắm, gừng, chanh, đường, nước ấm.|Ăn kèm rau luộc.',
  'Nước chấm pha nhạt hơn cho trẻ nhỏ.', 'vietnamnet-thitrang tiki-luocrau', 'Quanh năm.');
D('ga-ham-ca-rot-khoai-tay', 'Gà hầm cà rốt khoai tây', 'man', 'dong xuan', 'k13 eld soft t60 c2',
  'thit-ga 500g; ca-rot 150g; khoai-tay 200g; hanh-kho 10g; gung 10g; nuoc-mam 20ml; tieu 1g',
  'Gà chặt miếng nhỏ, chần sơ.|Xào gà với hành, gừng cho săn.|Thêm nước, hầm nhỏ lửa 25 phút.|Cho cà rốt, khoai tây vào nấu thêm 15 phút, nêm nhạt.',
  'Mềm, hợp bé nhỏ và người già.', 'skds-monmem kidsplaza-chao-bo-7t', 'Món hầm mùa lạnh.');
D('bo-xao-rau-cu', 'Bò xào rau củ', 'man', 'dong xuan', 'k13 t20 c3',
  'thit-bo 250g; ca-rot 80g; bong-cai 150g; hanh-tay 0.5cu; toi 10g; dau-an 25ml; nuoc-mam 15ml; tieu 1g',
  'Bò thái mỏng, ướp tỏi, tiêu, chút nước mắm.|Rau củ cắt miếng vừa, chần sơ súp lơ.|Xào bò lửa to, vớt ra.|Xào rau củ rồi cho bò vào đảo đều, nêm.',
  'Chín kỹ thịt bò cho trẻ.', 'cookbeo-boxaohanhtay bluestone-boxaocantay', 'Rau củ vụ đông.');
D('dau-phu-chien-sa', 'Đậu phụ chiên sả', 'man', 'q', 'k13 t20 c1',
  'dau-phu 5mieng; sa 1cay; hanh-kho 10g; nuoc-mam 10ml; dau-an 50ml; muoi 2g',
  'Đậu cắt miếng, thấm khô.|Sả băm nhỏ trộn muối.|Chiên đậu vàng hai mặt, cho sả vào đảo thơm.|Nêm nước mắm, tắt bếp.',
  'Chứa đậu nành.', 'cookbeo-daus cellphones-daus', 'Quanh năm.');
D('ca-basa-sot-ca-chua', 'Cá basa sốt cà chua', 'man', 'q', 'k13 soft t30 c1',
  'ca-basa 400g; ca-chua 3qua; hanh-la 10g; hanh-kho 10g; nuoc-mam 15ml; duong 5g; dau-an 40ml',
  'Cá cắt miếng, ướp muối tiêu, rán vàng.|Phi hành, xào cà chua thành sốt.|Cho cá vào sốt om 8 phút.|Nêm vừa, rắc hành lá.',
  'Cá basa ít xương.', 'vne-cathusot cookbeo-daus', 'Quanh năm.');
D('trung-kho-thit', 'Trứng kho thịt', 'man', 'q', 'k13 soft t45 c1',
  'trung-vit 4qua; thit-ba-chi 250g; nuoc-mau 10ml; hanh-kho 10g; nuoc-mam 25ml; duong 10g; tieu 1g',
  'Luộc trứng, bóc vỏ. Thịt cắt miếng, ướp nước mắm.|Thắng nước màu, xào thịt cho săn.|Thêm nước, cho trứng vào kho nhỏ lửa 25 phút.|Nêm lại cho vừa.',
  'Mặn vừa; cho bé ít nước kho.', 'huongnghiep-thitkho tiki-thitkho', 'Quanh năm.');
