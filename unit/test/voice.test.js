import test from 'node:test';
import assert from 'node:assert/strict';
import { phanTichLoiNoi as pt, chuanHoaCau } from '../js/lib/voice.js';

const tinh = (s, opt) => { const r = pt(s, opt); assert.ok(r.ok, `"${s}" -> lỗi: ${r.loi}`); return r; };
const gan = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

// [câu nói, kết quả mong đợi]
const PHEP_TINH = [
  // ---- số đơn
  ['không', 0], ['một', 1], ['mười', 10], ['mười lăm', 15], ['hai mươi mốt', 21], ['hai mươi tư', 24], ['hai mươi lăm', 25],
  ['một trăm', 100], ['một trăm linh năm', 105], ['một trăm lẻ năm', 105], ['một trăm mười lăm', 115], ['chín trăm chín mươi chín', 999],
  ['trăm nghìn', 100000], ['nghìn', 1000], ['một nghìn', 1000], ['một ngàn', 1000], ['mười lăm nghìn', 15000],
  ['một nghìn linh năm', 1005], ['một nghìn không trăm lẻ năm', 1005], ['hai nghìn không trăm mười lăm', 2015],
  ['ba triệu hai trăm nghìn', 3200000], ['ba triệu hai trăm năm mươi nghìn', 3250000], ['một triệu', 1e6], ['mười triệu', 1e7],
  ['một trăm hai mươi lăm nghìn', 125000], ['hai trăm năm mươi nghìn', 250000],
  ['một tỷ', 1e9], ['một tỉ', 1e9], ['hai tỷ năm trăm triệu', 2.5e9], ['một nghìn tỷ', 1e12],
  ['ba tỷ bốn trăm năm mươi sáu triệu bảy trăm tám mươi chín nghìn một trăm hai mươi ba', 3456789123],
  // ---- nói tắt
  ['rưỡi', 0.5], ['một rưỡi', 1.5], ['hai nghìn rưỡi', 2500], ['một triệu rưỡi', 1.5e6], ['ba tỷ rưỡi', 3.5e9], ['ba trăm rưỡi', 350],
  ['một tỷ hai', 1.2e9], ['hai triệu hai', 2.2e6], ['ba triệu năm trăm', 3.5e6], ['hai tỷ năm', 2.5e9], ['một nghìn hai', 1200], ['hai nghìn năm trăm', 2500],
  ['hai lẻ năm', 205], ['một lẻ năm', 105], ['ba trăm tám', 380], ['hai trăm năm nghìn', 250000],
  ['ba chục', 30], ['hai chục nghìn', 20000], ['hai chục', 20],
  ['hai củ', 2e6], ['năm củ rưỡi', 5.5e6],
  // ---- số viết bằng chữ số
  ['3 triệu 200 nghìn', 3200000], ['3 triệu 2 trăm nghìn', 3200000], ['500k', 500000], ['500 k', 500000], ['2tr', 2e6], ['2tr5', 2.5e6], ['2tr500', 2.5e6],
  ['1,5 triệu', 1.5e6], ['3.200.000', 3200000], ['3200000', 3200000], ['12,5', 12.5],
  // ---- phép toán cơ bản
  ['ba triệu hai trăm nghìn cộng năm mươi nghìn', 3250000],
  ['hai cộng ba', 5], ['mười trừ bốn', 6], ['năm nhân sáu', 30], ['hai mươi chia bốn', 5], ['một trăm chia ba', 100 / 3],
  ['hai lẻ năm nhân ba', 615], ['hai x ba', 6], ['2+3', 5], ['10-4', 6], ['6×7', 42], ['8÷2', 4], ['3 * 4', 12],
  ['năm cộng thêm ba', 8], ['mười nhân với ba', 30], ['chia hai mươi cho bốn', 5], ['hai mươi chia cho bốn', 5],
  ['hai cộng ba nhân bốn', 14], ['hai nhân ba cộng bốn', 10], ['mười trừ hai trừ ba', 5],
  ['mở ngoặc hai cộng ba đóng ngoặc nhân bốn', 20],
  ['âm năm cộng ba', -2], ['trừ năm cộng ba', -2],
  ['ba cộng năm bằng bao nhiêu', 8], ['tính giúp mình hai cộng hai', 4], ['cho mình hỏi năm nhân năm', 25],
  // ---- phần trăm
  ['mười phần trăm của hai triệu', 200000], ['năm mươi phần trăm của bốn trăm', 200], ['bảy phần trăm', 0.07],
  ['hai triệu cộng mười phần trăm', 2200000], ['hai triệu trừ mười lăm phần trăm', 1700000], ['hai trăm nhân mười phần trăm', 20],
  ['200 + 10%', 220], ['200 - 10%', 180], ['10% của 50', 5],
  // ---- chia đôi, gấp đôi, nửa
  ['chia đôi bốn trăm tám mươi nghìn', 240000], ['bốn trăm tám mươi nghìn chia đôi', 240000], ['gấp đôi năm mươi nghìn', 100000],
  ['một nửa của hai triệu', 1e6], ['nửa của một trăm', 50], ['chia 100 cho 4', 25], ['chia một trăm cho bốn', 25],
  // ---- lũy thừa, căn
  ['ba bình phương', 9], ['bình phương của ba', 9], ['bình phương năm', 25], ['hai lập phương', 8], ['hai mũ mười', 1024], ['hai mũ ba', 8],
  ['căn của mười sáu', 4], ['căn mười sáu', 4], ['căn bậc hai của chín', 3], ['căn bậc ba của hai mươi bảy', 3], ['căn hai nhân căn hai', 2],
  ['năm nhân ba bình phương', 45],
];

for (const [cau, kq] of PHEP_TINH) {
  test(`nói "${cau}" -> ${kq}`, () => {
    const r = tinh(cau);
    assert.ok(gan(r.value, kq), `được ${r.value}, cần ${kq} (hiểu: ${r.moTa})`);
  });
}

test('nhận dạng sai thanh điệu và không dấu vẫn tính đúng', () => {
  const bien = [
    'ba triệu hai trăm nghìn cộng năm mươi nghìn',
    'ba trieu hai tram nghin cong nam muoi nghin',
    'Ba Triệu Hai Trăm Ngàn Cọng Năm Mươi Nghìn',
    'ba triệu hai trăm nghin cộng năm mươi nghìn.',
    'ba triệu, hai trăm nghìn, cộng năm mươi nghìn',
    'ba  triệu   hai trăm nghìn  cộng  năm  mươi  nghìn',
    'ba triệu hai trăm nghìn + năm mươi nghìn',
    '3 triệu 2 trăm nghìn cộng 50 nghìn',
    '3,2 triệu cộng 50k',
    '3200000 cộng 50000',
    '3.200.000 + 50.000',
  ];
  for (const c of bien) assert.equal(tinh(c).value, 3250000, c);
});

test('mười/mươi, năm/lăm, mốt/một phân giải theo vị trí', () => {
  assert.equal(tinh('muoi lam').value, 15);
  assert.equal(tinh('hai muoi lam').value, 25);
  assert.equal(tinh('hai muoi mot').value, 21);
  assert.equal(tinh('mot tram muoi').value, 110);
  assert.equal(tinh('mot tram hai muoi').value, 120);
  assert.equal(tinh('nam muoi').value, 50);
  assert.equal(tinh('chin muoi chin').value, 99);
});

test('kết quả có chữ và số để người dùng soát', () => {
  const r = tinh('ba triệu hai trăm nghìn cộng năm mươi nghìn');
  assert.equal(r.moTa, '3.200.000 + 50.000');
  assert.equal(r.bangChu, 'ba triệu hai trăm năm mươi nghìn');
  assert.deepEqual(r.toanHang.map((x) => x.so), [3200000, 50000]);
  assert.equal(r.toanHang[0].chu, 'ba triệu hai trăm nghìn');
});

test('dùng kết quả trước khi mở đầu bằng phép toán', () => {
  const r = tinh('cộng năm mươi nghìn', { ans: 3000000 });
  assert.equal(r.value, 3050000);
  assert.equal(r.dungAns, true);
  assert.equal(tinh('nhân hai', { ans: 21 }).value, 42);
  assert.equal(tinh('chia đôi', { ans: 100 }).value, 50);
  assert.equal(tinh('trừ năm', { ans: 3 }).value, -2);
  // có số mở đầu thì bỏ qua ans
  assert.equal(tinh('hai cộng hai', { ans: 100 }).value, 4);
});

test('nói tắt "hai trăm năm" là 250 và có ghi chú cho người dùng', () => {
  const r = tinh('hai trăm năm');
  assert.equal(r.value, 250);
  assert.ok(r.ghiChu.some((g) => g.includes('250')));
  assert.equal(tinh('hai trăm lẻ năm').value, 205);
});

const LOI = [
  ['', 'Chưa có lời nói'], ['   ', 'Chưa có lời nói'], ['xin chào các bạn', 'Không tìm thấy số'],
  ['một trăm chia không', 'chia được cho 0'], ['hai cộng', 'chưa đầy đủ'], ['hai nhân nhân ba', 'liền nhau'],
  ['căn của âm chín', 'số âm'],
];
for (const [cau, mong] of LOI) {
  test(`lỗi rõ ràng: "${cau}"`, () => {
    const r = pt(cau);
    assert.equal(r.ok, false);
    assert.ok(r.loi.includes(mong), r.loi);
  });
}

test('từ lạ được báo là bỏ qua, không làm hỏng phép tính', () => {
  const r = tinh('hai cộng ba alo alo');
  assert.equal(r.value, 5);
  assert.deepEqual(r.boQua, ['alo', 'alo']);
});

// ---- quy đổi bằng giọng nói
const QUY_DOI = [
  ['ba chỉ vàng bằng bao nhiêu gram', 11.25, 'g'],
  ['ba chi vang bang bao nhieu gram', 11.25, 'g'],
  ['một lượng vàng bằng bao nhiêu chỉ', 10, 'chi'],
  ['một cây vàng bằng bao nhiêu gam', 37.5, 'g'],
  ['hai cây vàng ra chỉ', 20, 'chi'],
  ['năm chỉ vàng', 18.75, 'g'],
  ['mười gram bằng mấy chỉ', 10 / 3.75, 'chi'],
  ['năm sào bắc bộ bằng bao nhiêu mét vuông', 1800, 'm2'],
  ['hai sào trung bộ sang mét vuông', 1000, 'm2'],
  ['một héc ta bằng bao nhiêu mét vuông', 10000, 'm2'],
  ['một ha bằng bao nhiêu sào bắc bộ', 10000 / 360, 'sao_bb'],
  ['ba mươi lăm độ c sang độ f', 95, 'f'],
  ['một trăm độ c bằng bao nhiêu độ f', 212, 'f'],
  ['bốn mươi hai độ f sang độ c', (42 - 32) * 5 / 9, 'c'],
  ['âm mười độ c sang độ f', 14, 'f'],
  ['mười ký bằng bao nhiêu pound', 10 * 1000 / 453.59237, 'lb'],
  ['năm mươi kg ra lb', 50000 / 453.59237, 'lb'],
  ['mười cây số bằng bao nhiêu dặm', 10000 / 1609.344, 'dam'],
  ['hai mươi lít bằng bao nhiêu gallon', 20 / 3.785411784, 'gal'],
  ['sáu mươi km/h bằng bao nhiêu m/s', 60 / 3.6, 'ms'],
  ['5k m2 sang ha', 0.5, 'ha'],
];
for (const [cau, kq, den] of QUY_DOI) {
  test(`quy đổi nói: "${cau}"`, () => {
    const r = tinh(cau);
    assert.equal(r.kind, 'unit');
    assert.equal(r.den, den);
    assert.ok(gan(r.value, kq), `được ${r.value}, cần ${kq}`);
  });
}

test('sào/công không nói vùng có cảnh báo, không đoán âm thầm', () => {
  const r = tinh('hai sào bằng bao nhiêu mét vuông');
  assert.equal(r.value, 720);
  assert.ok(r.ghiChu.some((g) => g.includes('Bắc Bộ')));
  const c = tinh('ba công đất bằng bao nhiêu mét vuông');
  assert.equal(c.value, 3000);
  assert.ok(c.ghiChu.some((g) => g.includes('1.296')));
});

test('"cộng" không bị nhầm thành "công" đất, "căn" không nhầm "cân"', () => {
  assert.equal(tinh('ba cộng năm').kind, 'calc');
  assert.equal(tinh('ba công năm').value, 8);
  assert.equal(tinh('căn chín').kind, 'calc');
  const k = tinh('năm cân bằng bao nhiêu pound');
  assert.equal(k.kind, 'unit');
});

test('đổi khác loại bị từ chối', () => {
  const r = pt('ba chỉ vàng bằng bao nhiêu mét vuông');
  assert.equal(r.ok, false);
  assert.ok(r.loi.includes('khác loại'));
});

test('chuanHoaCau', () => {
  assert.deepEqual(chuanHoaCau('Ba triệu, hai trăm!'), ['ba', 'trieu', 'hai', 'tram']);
  assert.deepEqual(chuanHoaCau('2tr5 + 300k'), ['2', 'trieu', '5', '+', '300', 'nghin']);
});
