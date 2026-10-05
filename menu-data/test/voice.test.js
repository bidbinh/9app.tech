// Câu nói/gõ thực tế (có dấu và không dấu, lỗi nhận dạng giọng nói thường gặp) -> các mục đã tách:
// [tên (đã bỏ từ đệm), số lượng, đơn vị, id nguyên liệu, độ tin cậy]. Dùng để chặn hồi quy bộ chuẩn hóa dùng cho ô nhập và nút micro.
import test from 'node:test';
import assert from 'node:assert/strict';
import './helper.js';
import { normalizeList, normalizeItem, splitList } from '../src/normalize.js';

const CASES = [
  ["Mua một chai nước mắm",[["nước mắm",1,"chai","nuoc-mam","exact"]]],
  ["Giấy vệ sinh nữa",[["giấy vệ sinh",null,null,null,"none"]]],
  ["thêm cho tôi hai bó rau muống với nửa ký thịt ba chỉ",[["rau muống",2,"bo","rau-muong","exact"],["thịt ba chỉ",0.5,"kg","thit-ba-chi","exact"]]],
  ["mua giúp mình 3 hộp sữa chua nhé",[["sữa chua",3,"hop","sua-chua","exact"]]],
  ["nhớ mua dầu ăn một chai",[["dầu ăn",1,"chai","dau-an","exact"]]],
  ["cần mua muối i ốt",[["muối i ốt",null,null,"muoi","partial"]]],
  ["còn thiếu đường",[["đường",null,null,"duong","exact"]]],
  ["hết trứng rồi mua một chục",[["trứng",10,"qua","trung-ga","exact"]]],
  ["mua mười quả trứng gà",[["trứng gà",10,"qua","trung-ga","exact"]]],
  ["lấy cho em hai lạng tôm",[["tôm",200,"g","tom-tuoi","exact"]]],
  ["một cân cà chua",[["cà chua",1,"kg","ca-chua","exact"]]],
  ["hai ký khoai tây ạ",[["khoai tây",2,"kg","khoai-tay","exact"]]],
  ["rau muống ạ",[["rau muống",null,null,"rau-muong","exact"]]],
  ["mua rau mống hai bó",[["rau mống",2,"bo","rau-muong","partial"]]],
  ["mua mấm tôm một lọ",[["mấm tôm",1,"lo","mam-tom","exact"]]],
  ["nước mắm một chai với dầu ăn một chai",[["nước mắm",1,"chai","nuoc-mam","exact"],["dầu ăn",1,"chai","dau-an","exact"]]],
  ["gạo mười ký",[["gạo",10,"kg","gao-te","exact"]]],
  ["mua nửa ký đậu phụ",[["đậu phụ",0.5,"kg","dau-phu","exact"]]],
  ["mua 1 chục trứng",[["trứng",10,"qua","trung-ga","exact"]]],
  ["sữa tươi hai hộp và bánh mì ba ổ",[["sữa tươi",2,"hop","sua-tuoi","exact"],["bánh mì",3,"o","banh-mi","exact"]]],
  ["mua thêm pin AA",[["pin aa",null,null,null,"none"]]],
  ["mua thêm tã cho bé",[["tã cho bé",null,null,null,"none"]]],
  ["bánh cho bé",[["bánh cho bé",null,null,null,"none"]]],
  ["sữa cho bé một hộp",[["sữa cho bé",1,"hop","sua-tuoi","partial"]]],
  ["nước rửa chén một chai",[["nước rửa chén",1,"chai",null,"none"]]],
  ["bột giặt một túi",[["bột giặt",1,"tui",null,"none"]]],
  ["mua giùm mình ba bó hành lá",[["hành lá",3,"bo","hanh-la","exact"]]],
  ["thịt bò nửa ký nhé",[["thịt bò",0.5,"kg","thit-bo","exact"]]],
  ["mua cải thảo một cây",[["cải thảo",1,"cay","cai-thao","exact"]]],
  ["một quả bí đỏ",[["bí đỏ",1,"qua","bi-do","exact"]]],
  ["mua hai trái chanh",[["chanh",2,"qua","chanh","exact"]]],
  ["hai chục quả trứng vịt",[["trứng vịt",20,"qua","trung-vit","exact"]]],
  ["mua bia sáu lon",[["bia",6,"lon",null,"none"]]],
  ["mua nước suối một thùng",[["nước suối",1,"thung",null,"none"]]],
  ["khăn giấy hai gói",[["khăn giấy",2,"goi",null,"none"]]],
  ["mua ba mớ rau ngót",[["rau ngót",3,"bo","rau-ngot","exact"]]],
  ["rau ngót ba mớ cho mình nhé",[["rau ngót",3,"bo","rau-ngot","exact"]]],
  ["mua vài quả ớt",[["ớt",3,"qua","ot","exact"]]],
  ["mua một ít hành",[["hành",null,null,"hanh-la","exact"]]],
  ["ba lạng thịt nạc băm",[["thịt nạc băm",300,"g","thit-nac-bam","exact"]]],
  ["nửa ký tôm tươi",[["tôm tươi",0.5,"kg","tom-tuoi","exact"]]],
  ["mua mười lăm quả trứng",[["trứng",15,"qua","trung-ga","exact"]]],
  ["mua tỏi một củ",[["tỏi",1,"cu","toi","exact"]]],
  ["mua 2kg gạo nếp",[["gạo nếp",2,"kg","gao-nep","exact"]]],
  ["mua 500g thịt bò",[["thịt bò",500,"g","thit-bo","exact"]]],
  ["mua 1,5 lít sữa",[["sữa",1.5,"l","sua-tuoi","exact"]]],
  ["mua gừng một củ nhỏ",[["gừng nhỏ",1,"cu","gung","exact"]]],
  ["hành tây ba củ",[["hành tây",3,"cu","hanh-tay","exact"]]],
  ["mua nấm hương năm mươi gam",[["nấm hương",50,"g","nam-huong","exact"]]],
  ["giấy vệ sinh hai cuộn",[["giấy vệ sinh",2,"cuon",null,"none"]]],
  ["bàn chải đánh răng",[["bàn chải đánh răng",null,null,null,"none"]]],
  ["kem đánh răng một tuýp",[["kem đánh răng",1,"tuyp",null,"none"]]],
  ["mua dưa chuột hai quả và cà rốt ba củ",[["dưa chuột",2,"qua","dua-chuot","exact"],["cà rốt",3,"cu","ca-rot","exact"]]],
  ["thêm sữa đặc một lon",[["sữa đặc",1,"lon","sua-tuoi","partial"]]],
  ["mua giúp tôi một bó rau cải",[["rau cải",1,"bo",null,"none"]]],
  ["cho mình một cân thịt gà",[["thịt gà",1,"kg","thit-ga","exact"]]],
  ["mua mướp hai quả với đậu phụ ba bìa",[["mướp",2,"qua","muop","exact"],["đậu phụ",3,"mieng","dau-phu","exact"]]],
  ["mua hai chai nước tương",[["nước tương",2,"chai","nuoc-tuong","exact"]]],
  ["chanh 3 quả, ớt 2 quả, tỏi 1 củ",[["chanh",3,"qua","chanh","exact"],["ớt",2,"qua","ot","exact"],["tỏi",1,"cu","toi","exact"]]],
  ["muoi mot goi",[["muoi",1,"goi","muoi","exact"]]],
  ["mua mot chai nuoc mam",[["nuoc mam",1,"chai","nuoc-mam","exact"]]],
  ["hai bo rau muong va nua ky thit ba chi",[["rau muong",2,"bo","rau-muong","exact"],["thit ba chi",0.5,"kg","thit-ba-chi","exact"]]],
  ["mua trung ga mot chuc",[["trung ga",10,"qua","trung-ga","exact"]]],
  ["nho mua banh mi hai o",[["banh mi",2,"o","banh-mi","exact"]]],
  ["lay them hai hop sua tuoi",[["sua tuoi",2,"hop","sua-tuoi","exact"]]],
  ["Mua  một  chai nước mắm   nhé!",[["nước mắm",1,"chai","nuoc-mam","exact"]]],
  ["mua giùm mình 2 chai dầu ăn",[["dầu ăn",2,"chai","dau-an","exact"]]],
  ["mua mấm tôm một hộp",[["mấm tôm",1,"hop","mam-tom","exact"]]],
  ["mua rau muống hai bó ạ",[["rau muống",2,"bo","rau-muong","exact"]]],
  ["cần mua hai hộp sữa chua",[["sữa chua",2,"hop","sua-chua","exact"]]],
  ["còn thiếu muối một gói",[["muối",1,"goi","muoi","exact"]]],
  ["lấy thêm ba quả cà chua với hai củ hành tây",[["cà chua",3,"qua","ca-chua","exact"],["hành tây",2,"cu","hanh-tay","exact"]]],
  ["mua thịt heo nửa ký rồi mua cá chép một con",[["thịt heo",0.5,"kg","thit-nac-vai","exact"],["cá chép",1,"con","ca-chep","exact"]]],
  ["sữa tươi 2 hộp",[["sữa tươi",2,"hop","sua-tuoi","exact"]]],
  ["2 hộp sữa tươi",[["sữa tươi",2,"hop","sua-tuoi","exact"]]],
  ["mua một cân xoài",[["xoài",1,"kg","xoai","exact"]]],
  ["mua chuối hai nải",[["chuối",2,"nai","chuoi","exact"]]],
  ["mua dưa hấu một quả",[["dưa hấu",1,"qua","dua-hau","exact"]]],
  ["mua hai bìa đậu phụ nhé",[["đậu phụ",2,"mieng","dau-phu","exact"]]],
  ["mua cà phê một gói",[["cà phê",1,"goi",null,"none"]]],
  ["nhớ mua nho một ký",[["nho",1,"kg",null,"none"]]],
];

test(`${CASES.length} câu nói thực tế được tách đúng tên, số lượng, đơn vị`, () => {
  assert.ok(CASES.length >= 60);
  for (const [text, want] of CASES) {
    const got = normalizeList(text).map((x) => [x.name, x.qty, x.unit, x.ingredientId, x.confidence]);
    assert.deepEqual(got, want, 'câu: ' + text);
  }
});

test('hồi quy: "Mua một chai nước mắm" -> Nước mắm, 1, chai (không giữ nguyên câu)', () => {
  const [it, ...rest] = normalizeList('Mua một chai nước mắm');
  assert.equal(rest.length, 0);
  assert.equal(it.name, 'nước mắm'); assert.equal(it.canonicalName, 'Nước mắm'); assert.equal(it.qty, 1); assert.equal(it.unit, 'chai'); assert.equal(it.confidence, 'exact');
});

test('hồi quy: "Giấy vệ sinh nữa" -> giấy vệ sinh (bỏ "nữa")', () => {
  const [it] = normalizeList('Giấy vệ sinh nữa');
  assert.equal(it.name, 'giấy vệ sinh'); assert.equal(it.qty, null);
});

test('hồi quy: hai món trong một câu nói', () => {
  const r = normalizeList('thêm cho tôi hai bó rau muống với nửa ký thịt ba chỉ');
  assert.deepEqual(r.map((x) => [x.name, x.qty, x.unit]), [['rau muống', 2, 'bo'], ['thịt ba chỉ', 0.5, 'kg']]);
});

test('splitList: dấu phẩy thập phân không bị tách; "nửa" khác "nữa"; từ đệm đứng một mình bị bỏ', () => {
  assert.deepEqual(splitList('1,5 kg gạo, 2 chai dầu'), ['1,5 kg gạo', '2 chai dầu']);
  assert.deepEqual(splitList('mua nửa ký thịt'), ['mua nửa ký thịt']);
  assert.deepEqual(splitList('rau muống nữa thịt nữa'), ['rau muống', 'thịt nữa']);
  assert.deepEqual(splitList('mua thêm pin'), ['pin']);
  assert.deepEqual(splitList('rau muong va thit'), ['rau muong', 'thit']);
});

test('sai một ký tự do nhận dạng giọng nói -> gợi ý nguyên liệu (partial, fuzzy), không tự gộp', () => {
  const it = normalizeItem('rau mống hai bó');
  assert.equal(it.ingredientId, 'rau-muong'); assert.equal(it.confidence, 'partial'); assert.equal(it.fuzzy, true);
});

test('từ đệm không ăn mất tên nguyên liệu trùng khi bỏ dấu (tỏi, nho, cân, nghệ, nhĩ)', () => {
  assert.equal(normalizeItem('tỏi 1 củ').ingredientId, 'toi');
  assert.equal(normalizeItem('Bột nghệ').ingredientId, 'bot-nghe');
  assert.equal(normalizeItem('một cân cà chua').qty, 1);
  assert.equal(normalizeItem('nho 2 kg').name, 'nho');
});
