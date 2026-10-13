// Kiểm thử tính lương. Có hai lớp: (1) ca tính tay (số tiền viết sẵn, tự tính từng bước theo biểu thuế và bảo hiểm đã tra),
// (2) đối chiếu độc lập bằng công thức rút gọn (phần trừ nhanh) viết riêng, khác cách làm của mã nguồn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tinhThang, grossTuNet, quyetToanNam, thueLuyTien, BIEU_MOI, BIEU_CU, luongCoSo, luongToiThieuVung, hanQuyetToan } from '../js/lib/tax.js';

const M = 1_000_000;
const MOI = '2026-10', CU = '2025-06';

// ---------- Lớp 1: ca tính tay ----------
const CA_TAY = [
  ['1. gross 12tr độc thân, mới: dưới ngưỡng, không thuế', { gross: 12 * M, quyDinh: 'moi', thang: MOI }, { bhTong: 1_260_000, thue: 0, net: 10_740_000 }],
  ['2. gross 30tr độc thân, mới', { gross: 30 * M, quyDinh: 'moi', thang: MOI }, { bhTong: 3_150_000, tntt: 11_350_000, thue: 635_000, net: 26_215_000 }],
  ['3. gross 35tr, 2 người phụ thuộc, mới', { gross: 35 * M, phuThuoc: 2, quyDinh: 'moi', thang: MOI }, { bhTong: 3_675_000, tntt: 3_425_000, thue: 171_250, net: 31_153_750 }],
  ['4. gross 80tr, mới (BHXH chạm trần 50,6tr)', { gross: 80 * M, quyDinh: 'moi', thang: MOI }, { bhTong: 5_607_000, tntt: 58_893_000, thue: 8_278_600, net: 66_114_400 }],
  ['5. gross 80tr + thưởng 80tr cùng tháng, mới', { gross: 80 * M, thuong: 80 * M, quyDinh: 'moi', thang: MOI }, { tntt: 138_893_000, thue: 34_112_550, net: 120_280_450 }],
  ['6. gross 12tr, cũ (6/2025)', { gross: 12 * M, quyDinh: 'cu', thang: CU }, { bhTong: 1_260_000, thue: 0, net: 10_740_000 }],
  ['7. gross 30tr, cũ', { gross: 30 * M, quyDinh: 'cu', thang: CU }, { tntt: 15_850_000, thue: 1_627_500, net: 25_222_500 }],
  ['8. gross 35tr, 2 người phụ thuộc, cũ', { gross: 35 * M, phuThuoc: 2, quyDinh: 'cu', thang: CU }, { tntt: 11_525_000, thue: 978_750, net: 30_346_250 }],
  ['9. gross 80tr, cũ (trần BHXH 46,8tr)', { gross: 80 * M, quyDinh: 'cu', thang: CU }, { bhTong: 5_246_000, tntt: 63_754_000, thue: 13_276_200, net: 61_477_800 }],
  ['10. gross 30tr + OT 10 giờ thường, mới: OT miễn toàn bộ', { gross: 30 * M, otGio: { thuong: 10 }, quyDinh: 'moi', thang: MOI }, { thue: 635_000, net: 28_378_462, otMien: 2_163_462 }],
  ['11. gross 30tr + OT 10 giờ thường, cũ: chỉ phần chênh lệch miễn', { gross: 30 * M, otGio: { thuong: 10 }, quyDinh: 'cu', thang: CU }, { tntt: 17_292_308, thue: 1_843_846, net: 27_169_616 }],
  ['12. ăn trưa 1,5tr, mới sau 01/07/2026: miễn tối đa 1,2tr', { gross: 20 * M, anTrua: 1_500_000, quyDinh: 'moi', thang: MOI }, { tntt: 2_700_000, thue: 135_000, net: 19_265_000 }],
  ['13. ăn trưa 1,5tr, tháng 3/2026: còn mức 730k', { gross: 20 * M, anTrua: 1_500_000, quyDinh: 'moi', thang: '2026-03' }, { tntt: 3_170_000, thue: 158_500, net: 19_241_500 }],
  ['14. vùng IV, gross 3tr thấp hơn lương tối thiểu: nâng nền đóng BH lên 3,7tr', { gross: 3 * M, vung: 4, quyDinh: 'moi', thang: MOI }, { bhTong: 388_500, thue: 0, net: 2_611_500 }],
  ['15. gross 120tr, mới (BHTN cũng chạm trần 106,2tr)', { gross: 120 * M, quyDinh: 'moi', thang: MOI }, { bhTong: 5_869_000, tntt: 98_631_000, thue: 20_089_300, net: 94_041_700 }],
  ['16. gross 150tr: BHTN chạm trần 106,2tr; bậc 35%', { gross: 150 * M, quyDinh: 'moi', thang: MOI }, { bhTong: 5_869_000, tntt: 128_631_000, thue: 30_520_850, net: 113_610_150 }],
  ['17. gross 20tr, 3 người phụ thuộc: không thuế', { gross: 20 * M, phuThuoc: 3, quyDinh: 'moi', thang: MOI }, { tntt: 0, thue: 0, net: 17_900_000 }],
  ['18. gross 40tr, 1 phụ thuộc, hưu trí tự nguyện 4tr (trừ tối đa 3tr)', { gross: 40 * M, phuThuoc: 1, huuTri: 4 * M, quyDinh: 'moi', thang: MOI }, { tntt: 11_100_000, thue: 610_000, net: 31_190_000 }],
];
for (const [ten, input, mong] of CA_TAY) {
  test('Ca tay ' + ten, () => {
    const kq = tinhThang(input);
    for (const [k, v] of Object.entries(mong)) assert.equal(kq[k], v, `${k}: được ${kq[k]}, mong ${v}`);
  });
}

test('Ca tay 19-20. Gross từ Net khớp ngược', () => {
  const a = grossTuNet(26_215_000, { quyDinh: 'moi', thang: MOI });
  assert.equal(a.grossTimDuoc, 30 * M); assert.equal(a.net, 26_215_000); assert.equal(a.chenhNet, 0);
  const b = grossTuNet(10_740_000, { quyDinh: 'moi', thang: MOI });
  assert.equal(b.grossTimDuoc, 12 * M);
});

test('Ca tay 21. So sánh mới và cũ cùng gross 30tr cùng tháng: chênh 992.500đ', () => {
  const m = tinhThang({ gross: 30 * M, quyDinh: 'moi', thang: MOI });
  const c = tinhThang({ gross: 30 * M, quyDinh: 'cu', thang: MOI });
  assert.equal(c.thue - m.thue, 992_500);
  assert.equal(m.net - c.net, 992_500);
});

// ---------- Lớp 2: đối chiếu độc lập bằng công thức rút gọn ----------
// Phần trừ nhanh: thuế = tntt * suất - phần trừ.
const RUT_GON_MOI = [[10 * M, 0.05, 0], [30 * M, 0.10, 0.5 * M], [60 * M, 0.20, 3.5 * M], [100 * M, 0.30, 9.5 * M], [Infinity, 0.35, 14.5 * M]];
const RUT_GON_CU = [[5 * M, 0.05, 0], [10 * M, 0.10, 0.25 * M], [18 * M, 0.15, 0.75 * M], [32 * M, 0.20, 1.65 * M], [52 * M, 0.25, 3.25 * M], [80 * M, 0.30, 5.85 * M], [Infinity, 0.35, 9.85 * M]];
function oracle({ gross, vung = 1, pt = 0, qd, thang }) {
  const coSo = thang >= '2026-07' ? 2_530_000 : 2_340_000;
  const ltt = thang >= '2026-01' ? [0, 5_310_000, 4_730_000, 4_140_000, 3_700_000][vung] : [0, 4_960_000, 4_410_000, 3_860_000, 3_450_000][vung];
  const nen = Math.max(gross, ltt);
  const bh = Math.round(Math.min(nen, 20 * coSo) * 0.095) + Math.round(Math.min(nen, 20 * ltt) * 0.01);
  // BHXH 8% + BHYT 1,5% = 9,5% (làm tròn riêng từng khoản trong mã nguồn nên dùng sai số cho phép 1 đồng)
  const gt = qd === 'moi' ? 15.5 * M + 6.2 * M * pt : 11 * M + 4.4 * M * pt;
  const tntt = Math.max(0, gross - bh - gt);
  const bang = qd === 'moi' ? RUT_GON_MOI : RUT_GON_CU;
  const r = bang.find(([den]) => tntt <= den);
  const thue = Math.round(tntt * r[1] - r[2]);
  return { bh, thue, net: gross - bh - thue };
}
const LUOI = [];
for (const gross of [5, 8, 10, 15, 22, 45, 60, 100, 200]) for (const qd of ['moi', 'cu']) LUOI.push({ gross: gross * M, qd });
LUOI.push({ gross: 25 * M, qd: 'moi', vung: 2, pt: 1 }, { gross: 18 * M, qd: 'cu', vung: 3, pt: 2 }, { gross: 55 * M, qd: 'moi', pt: 4 }, { gross: 9 * M, qd: 'moi', vung: 4, pt: 0 });
for (const c of LUOI) {
  const thang = c.qd === 'moi' ? MOI : CU;
  test(`Đối chiếu công thức rút gọn: gross ${c.gross / M}tr, ${c.qd}, vùng ${c.vung || 1}, ${c.pt || 0} phụ thuộc`, () => {
    const kq = tinhThang({ gross: c.gross, vung: c.vung || 1, phuThuoc: c.pt || 0, quyDinh: c.qd, thang });
    const o = oracle({ gross: c.gross, vung: c.vung || 1, pt: c.pt || 0, qd: c.qd, thang });
    assert.ok(Math.abs(kq.bhTong - o.bh) <= 1, `BH ${kq.bhTong} vs ${o.bh}`);
    assert.ok(Math.abs(kq.thue - o.thue) <= 2, `thuế ${kq.thue} vs ${o.thue}`);
    assert.ok(Math.abs(kq.net - o.net) <= 3, `net ${kq.net} vs ${o.net}`);
  });
}

// ---------- Tính chất ----------
test('Net luôn tăng khi gross tăng (đơn điệu) và gross->net->gross khớp trong 1 đồng', () => {
  let truoc = -1;
  for (let g = 0; g <= 250 * M; g += 1_234_567) {
    const n = tinhThang({ gross: g, quyDinh: 'moi', thang: MOI }).net;
    assert.ok(n >= truoc, 'đơn điệu tại ' + g); truoc = n;
  }
  for (const g of [7_000_000, 15_000_000, 33_333_333, 71_000_000, 130_000_000]) {
    const net = tinhThang({ gross: g, quyDinh: 'moi', thang: MOI }).net;
    const kq = grossTuNet(net, { quyDinh: 'moi', thang: MOI });
    assert.ok(kq.grossTimDuoc <= g && g - kq.grossTimDuoc <= 2, `${g} -> ${kq.grossTimDuoc}`);
    assert.ok(kq.chenhNet >= 0 && kq.chenhNet <= 2);
  }
});

test('Biểu thuế: các mốc chuyển bậc liên tục', () => {
  assert.equal(thueLuyTien(10 * M, BIEU_MOI).thue, 500_000);
  assert.equal(thueLuyTien(30 * M, BIEU_MOI).thue, 2_500_000);
  assert.equal(thueLuyTien(60 * M, BIEU_MOI).thue, 8_500_000);
  assert.equal(thueLuyTien(100 * M, BIEU_MOI).thue, 20_500_000);
  assert.equal(thueLuyTien(80 * M, BIEU_CU).thue, 18_150_000);
  assert.equal(thueLuyTien(120 * M, BIEU_MOI, 12).thue, 6 * M);
});

test('Tham số theo tháng: lương cơ sở và lương tối thiểu vùng', () => {
  assert.equal(luongCoSo('2026-06').v, 2_340_000);
  assert.equal(luongCoSo('2026-07').v, 2_530_000);
  assert.equal(luongToiThieuVung('2025-12', 1).v, 4_960_000);
  assert.equal(luongToiThieuVung('2026-01', 1).v, 5_310_000);
  assert.equal(luongToiThieuVung('2026-01', 4).v, 3_700_000);
});

test('Đầu vào xấu: NaN, âm, chuỗi không làm hỏng kết quả', () => {
  const kq = tinhThang({ gross: NaN, phuThuoc: -3, anTrua: 'abc', thuong: -5 });
  assert.equal(kq.net, 0); assert.equal(kq.thue, 0);
  assert.ok(Array.isArray(kq.buoc) && kq.buoc.length > 0);
});

test('Mỗi bước có nhãn, và kết quả cuối khớp net', () => {
  const kq = tinhThang({ gross: 30 * M, quyDinh: 'moi', thang: MOI });
  assert.equal(kq.buoc.at(-1).so, kq.net);
  assert.ok(kq.buoc.every((b) => b.nhan && Number.isFinite(b.so)));
});

// ---------- Quyết toán ----------
test('Quyết toán 2026: 12 tháng gross 30tr, T1-T6 khấu trừ biểu cũ nên được hoàn 1.905.000đ', () => {
  const thang = Array.from({ length: 12 }, () => ({ gross: 30 * M }));
  const q = quyetToanNam({ nam: 2026, thang, chung: {} });
  assert.equal(q.tnttNam, 136_200_000);
  assert.equal(q.thuePhaiNop, 7_620_000);
  assert.equal(q.khauTruUocTinh, 9_525_000);
  assert.equal(q.chenh, 1_905_000);
  assert.equal(q.ketLuan, 'hoan');
});

test('Quyết toán 2025 có thưởng tháng 12 (biểu cũ): được hoàn 1.875.000đ', () => {
  const thang = Array.from({ length: 12 }, (_, i) => ({ gross: 30 * M, thuong: i === 11 ? 30 * M : 0 }));
  const q = quyetToanNam({ nam: 2025, thang, chung: {} });
  assert.equal(q.tnttNam, 220_200_000);
  assert.equal(q.thuePhaiNop, 24_240_000);
  assert.equal(q.khauTruUocTinh, 26_115_000);
  assert.equal(q.chenh, 1_875_000);
});

test('Quyết toán: nhập tay số đã khấu trừ ghi đè ước tính; thiếu thì phải nộp thêm', () => {
  const thang = Array.from({ length: 12 }, () => ({ gross: 30 * M }));
  const q = quyetToanNam({ nam: 2026, thang, chung: {}, daKhauTru: 7_000_000 });
  assert.equal(q.chenh, -620_000); assert.equal(q.ketLuan, 'nop-them'); assert.equal(q.tuNhap, true);
});

test('Quyết toán: làm việc 6 tháng chỉ tính giảm trừ 6 tháng', () => {
  const thang = Array.from({ length: 12 }, (_, i) => ({ gross: i < 6 ? 30 * M : 0 }));
  const q = quyetToanNam({ nam: 2026, thang, chung: {} });
  assert.equal(q.soThangCoLuong, 6); assert.equal(q.giamTruBanThan, 93 * M);
});

test('Hạn quyết toán', () => {
  assert.equal(hanQuyetToan(2025).tuQuyetToan, '2026-04-30');
  assert.equal(hanQuyetToan(2025).uyQuyen, '2026-03-31');
  assert.equal(hanQuyetToan(2026).xm, 'chua');
});
