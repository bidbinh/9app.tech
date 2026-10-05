import test from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helper.js';
import { normalizeItem, normalizeList, splitList } from '../src/normalize.js';

// [câu gõ/nói, tên chuẩn hóa, qty, unit, ingredientId, độ tin cậy]
const CASES = [
  // gõ tay
  ['2 bó rau muống', 'rau muống', 2, 'bo', 'rau-muong', 'exact'],
  ['rau muống 2 bó', 'rau muống', 2, 'bo', 'rau-muong', 'exact'],
  ['sữa tươi 1 hộp', 'sữa tươi', 1, 'hop', 'sua-tuoi', 'exact'],
  ['500g thịt ba chỉ', 'thịt ba chỉ', 500, 'g', 'thit-ba-chi', 'exact'],
  ['thịt ba chỉ 500 g', 'thịt ba chỉ', 500, 'g', 'thit-ba-chi', 'exact'],
  ['1,5 kg gạo', 'gạo', 1.5, 'kg', 'gao-te', 'exact'],
  ['gạo 5kg', 'gạo', 5, 'kg', 'gao-te', 'exact'],
  ['1.5kg khoai tây', 'khoai tây', 1.5, 'kg', 'khoai-tay', 'exact'],
  ['cà chua 5 trái', 'cà chua', 5, 'qua', 'ca-chua', 'exact'],
  ['trứng gà 10 quả', 'trứng gà', 10, 'qua', 'trung-ga', 'exact'],
  ['trứng 10', 'trứng', 10, 'qua', 'trung-ga', 'exact'],
  ['2-3 củ cà rốt', 'cà rốt', 3, 'cu', 'ca-rot', 'exact'],
  ['1/2 con gà', 'gà', 0.5, 'con', 'thit-ga', 'exact'],
  ['1 1/2 kg khoai tây', 'khoai tây', 1.5, 'kg', 'khoai-tay', 'exact'],
  ['3 lạng tôm', 'tôm', 300, 'g', 'tom-tuoi', 'exact'],
  ['250ml nước mắm', 'nước mắm', 250, 'ml', 'nuoc-mam', 'exact'],
  ['dầu ăn 1 chai', 'dầu ăn', 1, 'chai', 'dau-an', 'exact'],
  ['2l nước dừa', 'nước dừa', 2, 'l', 'nuoc-dua', 'exact'],
  ['đậu phụ 4 bìa', 'đậu phụ', 4, 'mieng', 'dau-phu', 'exact'],
  ['hành lá 3 bó', 'hành lá', 3, 'bo', 'hanh-la', 'exact'],
  ['cá hồi tươi 400g', 'cá hồi tươi', 400, 'g', 'ca-hoi', 'exact'],
  ['500 gram thịt bò', 'thịt bò', 500, 'g', 'thit-bo', 'exact'],
  ['2 hộp sữa chua', 'sữa chua', 2, 'hop', 'sua-chua', 'exact'],
  ['3 củ hành tây', 'hành tây', 3, 'cu', 'hanh-tay', 'exact'],
  ['4 miếng đậu phụ', 'đậu phụ', 4, 'mieng', 'dau-phu', 'exact'],
  ['xà lách 1 bó', 'xà lách', 1, 'bo', 'xa-lach', 'exact'],
  ['mua 2 quả chanh', 'chanh', 2, 'qua', 'chanh', 'exact'],
  ['bắp cải 1 cái', 'bắp cải', 1, 'cai', 'bap-cai', 'exact'],
  ['nấm hương 50g', 'nấm hương', 50, 'g', 'nam-huong', 'exact'],
  ['miến dong 200 gr', 'miến dong', 200, 'g', 'mien-dong', 'exact'],
  // nói bằng giọng
  ['hai bó rau muống', 'rau muống', 2, 'bo', 'rau-muong', 'exact'],
  ['mua cho mình hai bó rau muống nha', 'rau muống', 2, 'bo', 'rau-muong', 'exact'],
  ['năm quả cà chua', 'cà chua', 5, 'qua', 'ca-chua', 'exact'],
  ['nửa ký thịt bò', 'thịt bò', 0.5, 'kg', 'thit-bo', 'exact'],
  ['thịt ba chỉ nửa ký', 'thịt ba chỉ', 0.5, 'kg', 'thit-ba-chi', 'exact'],
  ['nửa cân thịt bò nhé', 'thịt bò', 0.5, 'kg', 'thit-bo', 'exact'],
  ['một ký rưỡi thịt nạc vai', 'thịt nạc vai', 1.5, 'kg', 'thit-nac-vai', 'exact'],
  ['hai ký rưỡi xương ống', 'xương ống', 2.5, 'kg', 'xuong-ong-heo', 'exact'],
  ['một chục trứng', 'trứng', 10, 'qua', 'trung-ga', 'exact'],
  ['hai chục trứng vịt', 'trứng vịt', 20, 'qua', 'trung-vit', 'exact'],
  ['mười quả trứng', 'trứng', 10, 'qua', 'trung-ga', 'exact'],
  ['hai mươi lăm quả trứng cút', 'trứng cút', 25, 'qua', 'trung-cut', 'exact'],
  ['mười lăm quả chanh', 'chanh', 15, 'qua', 'chanh', 'exact'],
  ['ba lạng tôm', 'tôm', 300, 'g', 'tom-tuoi', 'exact'],
  ['một lạng rưỡi nấm hương', 'nấm hương', 150, 'g', 'nam-huong', 'exact'],
  ['hai lít sữa tươi', 'sữa tươi', 2, 'l', 'sua-tuoi', 'exact'],
  ['rau thơm một mớ', 'rau thơm', 1, 'bo', 'rau-thom', 'exact'],
  ['ba chỉ ba lạng', 'ba chỉ', 300, 'g', 'thit-ba-chi', 'exact'],
  ['ba bốn quả chanh', 'chanh', 4, 'qua', 'chanh', 'exact'],
  ['mua thêm hai hộp sữa chua nha', 'sữa chua', 2, 'hop', 'sua-chua', 'exact'],
  ['nước mắm một chai', 'nước mắm', 1, 'chai', 'nuoc-mam', 'exact'],
  ['cho mình ba bó cải ngọt với', 'cải ngọt', 3, 'bo', 'cai-ngot', 'exact'],
  ['hành 1 bó', 'hành', 1, 'bo', 'hanh-la', 'exact'],
  // không phải thực phẩm / không khớp -> không gộp nhầm
  ['mua thêm pin', 'pin', null, null, null, 'none'],
  ['bánh cho bé', 'bánh cho bé', null, null, null, 'none'],
  ['pin AA 4 viên', 'pin aa', 4, 'vien', null, 'none'],
  ['khăn giấy 2 cuộn', 'khăn giấy', 2, 'cuon', null, 'none'],
  ['nước giặt 1 chai', 'nước giặt', 1, 'chai', null, 'none'],
  ['sữa cho bé', 'sữa cho bé', null, null, 'sua-tuoi', 'partial'],
  ['bánh mì cho bé', 'bánh mì cho bé', null, null, 'banh-mi', 'partial'],
];

test('chuẩn hóa tên + số lượng + đơn vị + nguyên liệu (60+ câu gõ/nói thực tế)', () => {
  assert.ok(CASES.length >= 60);
  for (const [text, name, qty, unit, id, conf] of CASES) {
    const r = normalizeItem(text, { data });
    const msg = JSON.stringify(text) + ' => ' + JSON.stringify(r);
    assert.equal(r.name, name, 'tên ' + msg);
    assert.equal(r.qty, qty, 'qty ' + msg);
    assert.equal(r.unit, unit, 'unit ' + msg);
    assert.equal(r.ingredientId, id, 'id ' + msg);
    assert.equal(r.confidence, conf, 'conf ' + msg);
    assert.equal(r.raw, text);
  }
});

test('không bị nhầm "ba chỉ" (thịt) với số ba, "năm" với tuổi, "mười" ...', () => {
  const r = normalizeItem('thịt ba chỉ', { data });
  assert.equal(r.qty, null);
  assert.equal(r.ingredientId, 'thit-ba-chi');
  assert.equal(normalizeItem('ba chỉ', { data }).qty, null);
  assert.equal(normalizeItem('ba chỉ một ký', { data }).qty, 1);
});

test('lượng mơ hồ: vài, một ít', () => {
  const a = normalizeItem('vài quả ớt', { data });
  assert.equal(a.qty, 3); assert.equal(a.approx, true); assert.equal(a.ingredientId, 'ot');
  const b = normalizeItem('một ít hành lá', { data });
  assert.equal(b.qty, null); assert.equal(b.note, 'một ít'); assert.equal(b.ingredientId, 'hanh-la');
  const c = normalizeItem('2-3 quả chanh', { data });
  assert.equal(c.qty, 3); assert.equal(c.approx, true);
});

test('gõ không dấu, viết hoa, dấu câu thừa', () => {
  const cases = [
    ['2 bo rau muong', 'rau-muong', 2, 'bo'], ['THIT BA CHI 500G', 'thit-ba-chi', 500, 'g'], ['  sua tuoi   1 hop!  ', 'sua-tuoi', 1, 'hop'],
    ['ca chua 5 qua.', 'ca-chua', 5, 'qua'], ['Thịt Bò 1 Ký', 'thit-bo', 1, 'kg'], ['2 bó rau muống,', 'rau-muong', 2, 'bo'], ['trung ga 6 qua', 'trung-ga', 6, 'qua'],
    ['nuoc mam 1 chai', 'nuoc-mam', 1, 'chai'], ['hanh la 2 bo', 'hanh-la', 2, 'bo'], ['dau phu 3 bia', 'dau-phu', 3, 'mieng'],
  ];
  for (const [t, id, q, u] of cases) {
    const r = normalizeItem(t, { data });
    assert.equal(r.ingredientId, id, t); assert.equal(r.qty, q, t); assert.equal(r.unit, u, t);
  }
});

test('alias ưu tiên cụm dài nhất (trứng cút khác trứng gà, sữa chua khác sữa tươi, ớt chuông khác ớt)', () => {
  assert.equal(normalizeItem('trứng cút 20 quả', { data }).ingredientId, 'trung-cut');
  assert.equal(normalizeItem('trứng vịt 5 quả', { data }).ingredientId, 'trung-vit');
  assert.equal(normalizeItem('sữa chua 4 hộp', { data }).ingredientId, 'sua-chua');
  assert.equal(normalizeItem('ớt chuông 2 quả', { data }).ingredientId, 'ot-chuong');
  assert.equal(normalizeItem('bắp cải 1 cái', { data }).ingredientId, 'bap-cai');
  assert.equal(normalizeItem('bắp bò 300g', { data }).ingredientId, 'bap-bo');
  assert.equal(normalizeItem('mắm tôm 1 chai', { data }).ingredientId, 'mam-tom');
  assert.equal(normalizeItem('nước tương 1 chai', { data }).ingredientId, 'nuoc-tuong');
  assert.equal(normalizeItem('đường phèn 200g', { data }).ingredientId, 'duong-phen');
});

test('tách danh sách gõ/nói nhiều mục', () => {
  assert.deepEqual(splitList('2 bó rau muống, 1,5 kg thịt bò và 3 quả cà chua với pin AA'), ['2 bó rau muống', '1,5 kg thịt bò', '3 quả cà chua', 'pin AA']);
  assert.deepEqual(splitList('sữa tươi\nbánh cho bé; 5 quả trứng'), ['sữa tươi', 'bánh cho bé', '5 quả trứng']);
  const out = normalizeList('mua hai bó rau muống với năm quả cà chua nha, nửa ký thịt bò', { data });
  assert.deepEqual(out.map((x) => [x.ingredientId, x.qty, x.unit]), [['rau-muong', 2, 'bo'], ['ca-chua', 5, 'qua'], ['thit-bo', 0.5, 'kg']]);
  assert.deepEqual(splitList(''), []);
});

test('chuỗi rỗng hoặc không phải chuỗi không gây lỗi', () => {
  for (const v of ['', '   ', null, undefined]) {
    const r = normalizeItem(v, { data });
    assert.equal(r.name, ''); assert.equal(r.ingredientId, null); assert.equal(r.confidence, 'none');
  }
  assert.equal(normalizeItem(123, { data }).qty, 123);
});

test('mọi alias trong danh mục tự khớp chính nó (exact)', () => {
  for (const ing of data.ingredients.items) {
    const r = normalizeItem(ing.name.replace(/\s*\(.*?\)\s*/g, ' ').split('/')[0], { data });
    assert.equal(r.ingredientId, ing.id, 'tên "' + ing.name + '" không khớp ' + ing.id);
    assert.equal(r.confidence, 'exact', ing.name);
  }
});
