import { D } from './dsl.js';

// ================= BỔ SUNG CHO MÙA HÈ-THU =================
D('rau-day-luoc', 'Rau đay luộc', 'luoc', 'ha', 'k13 eld soft ls lf t8 c1',
  'rau-day 350g; nuoc-mam 10ml; muoi 2g; ca-phao 3qua?',
  'Rau đay nhặt lấy lá, rửa sạch.|Luộc nước sôi có chút muối 2 phút.|Vớt ra, chấm nước mắm hoặc ăn kèm cà pháo.',
  'Nhớt, mát, dễ nuốt.', 'tiki-luocrau dmx-canhcua', 'Rau đay vụ hè.');
D('rau-den-luoc', 'Rau dền luộc', 'luoc', 'ha thu', 'k13 eld soft ls lf t8 c1',
  'rau-den 350g; nuoc-mam 10ml; muoi 2g; toi 5g?',
  'Rau dền nhặt, rửa sạch.|Luộc nước sôi có chút muối 2-3 phút.|Vớt ra, chấm nước mắm tỏi nhạt.',
  'Nước luộc có màu đỏ, uống được.', 'tiki-luocrau vinmec-rauluoc', 'Rau dền vụ hè.');
D('muop-xao-toi', 'Mướp xào tỏi', 'xao', 'ha thu', 'k13 eld soft t10 c1',
  'muop 2qua; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Mướp gọt vỏ, thái lát vát.|Phi tỏi, xào mướp lửa to.|Nêm nhạt, xào đến mềm.',
  'Mướp ra nước, xào nhanh.', 'hnaau-rauxaotoi', 'Mướp vụ hè-thu.');
D('bau-xao-toi', 'Bầu xào tỏi', 'xao', 'ha thu', 'k13 eld soft t10 c1',
  'bau 1qua; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Bầu gọt vỏ, thái sợi.|Phi tỏi, xào bầu lửa vừa.|Nêm nhạt, xào đến mềm.',
  'Mát, ngọt.', 'hnaau-rauxaotoi', 'Bầu vụ hè-thu.');
D('bi-xanh-xao-toi', 'Bí xanh xào tỏi', 'xao', 'ha thu', 'k13 eld soft lf t12 c1',
  'bi-dao 400g; toi 10g; dau-an 15ml; nuoc-mam 10ml',
  'Bí gọt vỏ, bỏ ruột, thái lát mỏng.|Phi tỏi, xào bí lửa vừa.|Nêm nhạt, xào mềm.',
  'Mát, ít calo.', 'hnaau-rauxaotoi', 'Bí xanh vụ hè-thu.');
D('dau-dua-xao-toi', 'Đậu đũa xào tỏi', 'xao', 'ha thu', 'k13 soft t12 c1',
  'dau-dua 300g; toi 10g; dau-an 20ml; nuoc-mam 10ml',
  'Đậu cắt đoạn, chần sơ.|Phi tỏi, xào đậu lửa vừa.|Nêm vừa, đậy nắp vài phút cho mềm chín.',
  'Đậu phải chín kỹ.', 'hnaau-rauxaotoi', 'Đậu đũa vụ hè.');
D('salad-ca-chua-dua-chuot', 'Cà chua dưa chuột trộn', 'rau', 'ha', 'k13 lf lsug t10 c1',
  'ca-chua 2qua; dua-chuot 2qua; hanh-kho 5g; giam 15ml; duong 5g; dau-an 10ml; muoi 1g',
  'Cà chua, dưa chuột rửa sạch, thái lát.|Pha giấm, đường, muối, dầu.|Trộn đều với hành khô thái mỏng.|Ăn ngay.',
  'Rửa kỹ rau sống; cắt nhỏ cho bé.', 'sohuutritue-nom btaskee-nom', 'Dưa chuột, cà chua vụ hè.');
D('dau-co-ve-luoc', 'Đậu cô ve luộc', 'luoc', 'xuan ha thu', 'k13 eld soft ls lf t10 c1',
  'dau-co-ve 300g; nuoc-mam 10ml; muoi 2g',
  'Đậu nhặt, cắt đoạn.|Luộc nước sôi có chút muối 4-5 phút cho chín mềm.|Vớt ra, chấm nước mắm nhạt hoặc muối vừng.',
  'Đậu phải chín kỹ.', 'tiki-luocrau vinmec-rauluoc', 'Đậu cô ve hè-thu.');
D('ca-dieu-hong-chien', 'Cá điêu hồng chiên', 'man', 'q', 'k13 t30 c2',
  'ca-dieu-hong 500g; gung 10g; dau-an 80ml; muoi 3g; nuoc-mam 20ml; chanh 1qua',
  'Cá làm sạch, ướp muối, gừng.|Để thật ráo, chiên vàng giòn hai mặt.|Chấm nước mắm chanh gừng.',
  'Gỡ xương kỹ cho bé.', 'hnaau-caichepomdua cakhobakien-ca-ro-phi-om-dua', 'Quanh năm.');
D('goi-ga-bap-cai', 'Nộm gà bắp cải', 'man', 'dong xuan', 'k13 t30 c2',
  'thit-ga 300g; bap-cai 200g; ca-rot 50g; hanh-tay 0.5cu; rau-ram 10g; chanh 1qua; duong 20g; nuoc-mam 30ml',
  'Luộc gà chín, xé nhỏ.|Bắp cải, cà rốt, hành tây thái sợi, bóp muối vắt ráo.|Pha nước chua ngọt.|Trộn gà với rau, rắc rau răm.',
  'Gà phải chín kỹ.', 'sohuutritue-nom pasgo-nom', 'Bắp cải vụ đông.');
D('thit-vien-hap', 'Thịt viên hấp nấm', 'man', 'q', 'k13 eld soft ls t35 c2',
  'thit-nac-bam 250g; nam-huong 8g; hanh-la 10g; trung-ga 1qua; nuoc-mam 10ml; tieu 1g',
  'Nấm hương ngâm mềm, thái nhỏ.|Trộn thịt băm, nấm, trứng, hành, gia vị.|Vo viên, xếp vào đĩa.|Hấp 15 phút đến chín.',
  'Mềm, ít dầu.', 'fptshop-trungchungthit skds-monmem', 'Quanh năm.');
D('thit-bo-xao-dau-cove', 'Thịt bò xào đậu cô ve', 'xao', 'xuan ha thu', 'k13 t15 c3',
  'thit-bo 200g; dau-co-ve 250g; toi 10g; dau-an 20ml; nuoc-mam 15ml; tieu 1g',
  'Bò thái mỏng, ướp tỏi, tiêu.|Đậu cắt đoạn, chần sơ.|Xào bò lửa to, vớt ra.|Xào đậu rồi cho bò vào đảo, nêm.',
  'Chín kỹ.', 'cookbeo-boxaohanhtay hnaau-rauxaotoi', 'Đậu hè-thu.');
D('thit-xao-bau', 'Thịt nạc xào bầu', 'xao', 'ha thu', 'k13 eld soft t15 c1',
  'bau 1qua; thit-nac-vai 150g; toi 10g; dau-an 20ml; nuoc-mam 15ml',
  'Bầu thái sợi. Thịt thái mỏng ướp nước mắm.|Phi tỏi, xào thịt chín.|Cho bầu vào xào mềm, nêm vừa.',
  'Mềm, ngọt.', 'hnaau-rauxaotoi', 'Bầu vụ hè-thu.');
D('tom-rang-me', 'Tôm rang me', 'man', 'q', 'k13 t20 c2',
  'tom-tuoi 300g; me-chua 20g; hanh-kho 10g; nuoc-mam 20ml; duong 15g; dau-an 15ml',
  'Hòa me với nước nóng, lọc lấy nước.|Phi hành, xào tôm chuyển màu.|Cho nước me, nước mắm, đường, rim đến sánh.',
  'Hải sản.', 'vietnamnet-thitrang', 'Quanh năm.');
