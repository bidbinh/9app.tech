import test from 'node:test';
import assert from 'node:assert/strict';
import { boDau, khoaTim, docSo, dinhDangSo, chuanHoaSoChuoi } from '../js/lib/text.js';

test('boDau: bỏ dấu tiếng Việt, đ thành d', () => {
  assert.equal(boDau('Nguyễn Thị Hương, Đà Nẵng'), 'Nguyen Thi Huong, Da Nang');
  assert.equal(boDau('ĐƯỜNG Ơ Ư Ê Ô'), 'DUONG O U E O');
  assert.equal(boDau('abc 123'), 'abc 123');
  assert.equal(boDau(''), '');
  assert.equal(boDau(null), '');
  // dạng tổ hợp (NFD) cũng bỏ được
  assert.equal(boDau('Việt Nam'), 'Viet Nam');
});

test('khoaTim: dùng cho tìm kiếm không dấu', () => {
  assert.equal(khoaTim('  Đổi   Đơn Vị '), 'doi don vi');
});

const CA = [
  [0, 'không'], [1, 'một'], [4, 'bốn'], [5, 'năm'], [9, 'chín'],
  [10, 'mười'], [11, 'mười một'], [14, 'mười bốn'], [15, 'mười lăm'], [19, 'mười chín'],
  [20, 'hai mươi'], [21, 'hai mươi mốt'], [24, 'hai mươi bốn'], [25, 'hai mươi lăm'], [35, 'ba mươi lăm'], [99, 'chín mươi chín'],
  [100, 'một trăm'], [101, 'một trăm lẻ một'], [105, 'một trăm lẻ năm'], [110, 'một trăm mười'], [115, 'một trăm mười lăm'], [120, 'một trăm hai mươi'], [999, 'chín trăm chín mươi chín'],
  [1000, 'một nghìn'], [1001, 'một nghìn không trăm lẻ một'], [1005, 'một nghìn không trăm lẻ năm'], [1010, 'một nghìn không trăm mười'], [1100, 'một nghìn một trăm'], [2015, 'hai nghìn không trăm mười lăm'],
  [10000, 'mười nghìn'], [21000, 'hai mươi mốt nghìn'], [100000, 'một trăm nghìn'], [250000, 'hai trăm năm mươi nghìn'],
  [1000000, 'một triệu'], [1000001, 'một triệu không trăm lẻ một'], [1200000, 'một triệu hai trăm nghìn'], [3250000, 'ba triệu hai trăm năm mươi nghìn'],
  [10000000, 'mười triệu'], [999999999, 'chín trăm chín mươi chín triệu chín trăm chín mươi chín nghìn chín trăm chín mươi chín'],
  [1000000000, 'một tỷ'], [1000005000, 'một tỷ không trăm lẻ năm nghìn'], [2500000000, 'hai tỷ năm trăm triệu'], [1000000000000, 'một nghìn tỷ'],
  [-12, 'âm mười hai'], [3.5, 'ba phẩy năm'], [0.05, 'không phẩy không năm'],
];
for (const [n, s] of CA) {
  test(`docSo(${n}) = ${s}`, () => assert.equal(docSo(n), s));
}

test('docSo: chuỗi kiểu Việt và tuỳ chọn', () => {
  assert.equal(docSo('1.234.567'), 'một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy');
  assert.equal(docSo('3,5'), 'ba phẩy năm');
  assert.equal(docSo(1500000, { vietHoa: true, donVi: 'đồng', chan: true }), 'Một triệu năm trăm nghìn đồng chẵn');
  assert.equal(docSo('abc'), '');
  assert.equal(docSo(NaN), '');
  assert.equal(docSo(1234567890123n), 'một nghìn hai trăm ba mươi bốn tỷ năm trăm sáu mươi bảy triệu tám trăm chín mươi nghìn một trăm hai mươi ba');
});

test('chuanHoaSoChuoi', () => {
  assert.equal(chuanHoaSoChuoi('3.200.000'), '3200000');
  assert.equal(chuanHoaSoChuoi('1.000'), '1000');
  assert.equal(chuanHoaSoChuoi('3,5'), '3.5');
  assert.equal(chuanHoaSoChuoi('1.234,56'), '1234.56');
  assert.equal(chuanHoaSoChuoi('1,234.56'), '1234.56');
  assert.equal(chuanHoaSoChuoi('-12'), '-12');
  assert.equal(chuanHoaSoChuoi('12a'), '');
  assert.equal(chuanHoaSoChuoi(''), '');
});

test('dinhDangSo', () => {
  assert.equal(dinhDangSo(3250000), '3.250.000');
  assert.equal(dinhDangSo(1234.5), '1.234,5');
  assert.equal(dinhDangSo(0.1 + 0.2), '0,3');
  assert.equal(dinhDangSo(-1500), '-1.500');
  assert.equal(dinhDangSo(0), '0');
  assert.equal(dinhDangSo(1 / 3, 4), '0,3333');
});
