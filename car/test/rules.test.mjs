import test from 'node:test';
import assert from 'node:assert/strict';
import { chuKyDangKiem, hanKiemDinh, uocHanDau, thoiHanGPLX, MOC_KHI_THAI } from '../js/lib/rules.js';

const oto = (namSX, extra = {}) => ({ loai: 'oto', namSX, ...extra });
const ck = (xe, ngay, lanDau = false) => chuKyDangKiem(xe, { ngay, lanDau });

// Ô tô con không kinh doanh: lần đầu 36; định kỳ đến 7 năm 24; trên 7 đến 20 năm 12; trên 20 năm 6 (tuổi = năm kiểm định - năm sản xuất)
test('ô tô con không kinh doanh: chu kỳ đầu 36 tháng', () => {
  assert.equal(ck(oto(2025), '2025-05-10', true).thang, 36);
  assert.equal(ck(oto(2024), '2026-01-01', true).thang, 36);
});
test('ô tô con không kinh doanh: định kỳ theo tuổi, các mốc biên', () => {
  const casos = [
    [2025, '2028-05-01', 24], // tuổi 3
    [2019, '2026-10-05', 24], // tuổi 7 (đến 7 năm)
    [2018, '2026-10-05', 12], // tuổi 8
    [2010, '2026-10-05', 12], // tuổi 16
    [2006, '2026-10-05', 12], // tuổi 20
    [2005, '2026-10-05', 6], // tuổi 21
    [1990, '2026-10-05', 6],
    [2026, '2026-01-02', 24], // tuổi 0
  ];
  for (const [nsx, ngay, mong] of casos) assert.equal(ck(oto(nsx), ngay).thang, mong, `${nsx} @ ${ngay}`);
});
test('tuổi xe tính theo năm: sản xuất 2025 là 2 tuổi đến 31/12/2027, 3 tuổi từ 1/1/2028', () => {
  // cùng chu kỳ 24 tháng nhưng kiểm tra không lỗi biên năm
  assert.equal(ck(oto(2025), '2027-12-31').thang, 24);
  assert.equal(ck(oto(2025), '2028-01-01').thang, 24);
  assert.equal(ck(oto(2019), '2026-12-31').thang, 24);
  assert.equal(ck(oto(2019), '2027-01-01').thang, 12); // sang năm 2027: tuổi 8
});
test('ô tô kinh doanh vận tải ≤ 8 chỗ: đầu 24; đến 5 năm 12; trên 5 năm 6', () => {
  assert.equal(ck(oto(2025, { kinhDoanh: true }), '2025-06-01', true).thang, 24);
  assert.equal(ck(oto(2021, { kinhDoanh: true }), '2026-06-01').thang, 12); // tuổi 5
  assert.equal(ck(oto(2020, { kinhDoanh: true }), '2026-06-01').thang, 6); // tuổi 6
});
test('ô tô chở người trên 8 chỗ: đầu 24; đến 5 năm 12; trên 5 năm 6', () => {
  const x = (n) => ({ loai: 'oto-khach', namSX: n });
  assert.equal(ck(x(2025), '2025-06-01', true).thang, 24);
  assert.equal(ck(x(2022), '2026-06-01').thang, 12);
  assert.equal(ck(x(2015), '2026-06-01').thang, 6);
});
test('xe cải tạo: đầu 12, sau 6, ghi rõ chưa xác minh', () => {
  const a = ck(oto(2023, { caiTao: true }), '2026-01-01', true);
  const b = ck(oto(2023, { caiTao: true }), '2027-01-01');
  assert.equal(a.thang, 12); assert.equal(b.thang, 6);
  assert.equal(a.xacMinh, false);
});
test('xe máy chỉ kiểm định khí thải: 60/24/12 tháng', () => {
  const xm = (n) => ({ loai: 'xemay', namSX: n });
  assert.equal(ck(xm(2023), '2028-01-01').thang, 60); // tuổi 5
  assert.equal(ck(xm(2022), '2028-01-01').thang, 24); // tuổi 6
  assert.equal(ck(xm(2016), '2028-01-01').thang, 24); // tuổi 12
  assert.equal(ck(xm(2015), '2028-01-01').thang, 12); // tuổi 13
  assert.equal(ck(xm(2023), '2028-01-01').khiThai, true);
});
test('ô tô tải và xe chuyên dùng: chưa xác minh, buộc nhập tay', () => {
  const r = ck({ loai: 'oto-tai', namSX: 2020 }, '2026-01-01');
  assert.equal(r.thang, null); assert.equal(r.xacMinh, false);
});
test('thiếu năm sản xuất: không đoán, yêu cầu nhập', () => {
  assert.equal(ck({ loai: 'oto', namSX: null }, '2026-01-01').thang, null);
  assert.equal(ck({ loai: 'xemay' }, '2026-01-01').thang, null);
  // nhưng lần đầu của ô tô không cần năm sản xuất
  assert.equal(ck({ loai: 'oto', namSX: null }, '2026-01-01', true).thang, 36);
});
test('hạn kiểm định = ngày cấp + chu kỳ - 1 ngày (ví dụ trong Thông tư)', () => {
  assert.equal(hanKiemDinh('2025-05-10', 36), '2028-05-09');
  assert.equal(hanKiemDinh('2025-05-10', 24), '2027-05-09');
  assert.equal(hanKiemDinh('2026-03-31', 6), '2026-09-29'); // 31/3 + 6 tháng = 30/9, trừ 1 ngày
  assert.equal(hanKiemDinh('2024-02-29', 12), '2025-02-27'); // kẹp ngày cuối tháng 2
});
test('uocHanDau gợi ý hạn đầu từ ngày gốc', () => {
  const r = uocHanDau(oto(2026), '2026-02-01');
  assert.equal(r.thang, 36); assert.equal(r.han, '2029-01-31'); assert.equal(r.uoc, true);
  assert.equal(uocHanDau({ loai: 'oto-tai', namSX: 2026 }, '2026-02-01').han, null);
});
test('mốc kiểm định khí thải xe máy theo khu vực', () => {
  assert.equal(MOC_KHI_THAI['hn-hcm'].ngay, '2027-07-01');
  assert.equal(MOC_KHI_THAI.tptw.ngay, '2028-07-01');
  assert.equal(MOC_KHI_THAI.tinh.ngay, '2030-07-01');
});
test('thời hạn GPLX theo hạng', () => {
  assert.equal(thoiHanGPLX('A1').nam, null);
  assert.equal(thoiHanGPLX('a').nam, null);
  assert.equal(thoiHanGPLX('B1').nam, null);
  assert.equal(thoiHanGPLX('B').nam, 10);
  assert.equal(thoiHanGPLX('C1').nam, 10);
  assert.equal(thoiHanGPLX('C').nam, 5);
  assert.equal(thoiHanGPLX('D2').nam, 5);
  assert.equal(thoiHanGPLX('Z'), null);
});

import { LUU_Y_HAN, LOAI_XE } from '../js/lib/rules.js';
test('ô tô trên 8 chỗ: số liệu gợi ý nhưng KHÔNG đánh dấu đã xác minh', () => {
  const x = { loai: 'oto-khach', namSX: 2020 };
  for (const lanDau of [true, false]) {
    const r = ck(x, '2026-06-01', lanDau);
    assert.equal(r.xacMinh, false); assert.ok(/CHƯA XÁC MINH/.test(r.ghiChu));
  }
  assert.equal(ck(x, '2026-06-01', true).thang, 24);
});
test('xe đến 8 chỗ kinh doanh vẫn xác minh, nhãn loại xe dùng chữ "đến 8 chỗ"', () => {
  assert.equal(ck(oto(2024, { kinhDoanh: true }), '2026-06-01').xacMinh, true);
  assert.equal(LOAI_XE.find((l) => l.id === 'oto').ten, 'Ô tô chở người đến 8 chỗ');
});
test('lưu ý hạn gợi ý có chữ yêu cầu đối chiếu tem', () => {
  assert.match(LUU_Y_HAN, /Hạn gợi ý, hãy đối chiếu với tem\/giấy kiểm định/);
  assert.match(LUU_Y_HAN, /niên hạn/);
});
