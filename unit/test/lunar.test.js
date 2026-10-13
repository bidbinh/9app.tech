import test from 'node:test';
import assert from 'node:assert/strict';
import { duongSangAm, amSangDuong, canChiNam, conGiap, canChiNgay, jdTuNgay, ngayTuJd, soNgayThangAm } from '../js/lib/lunar.js';

// Mùng 1 Tết theo lịch Việt Nam (UTC+7), đối chiếu lịch chính thức đã công bố
const TET = {
  2015: [19, 2], 2016: [8, 2], 2017: [28, 1], 2018: [16, 2], 2019: [5, 2], 2020: [25, 1], 2021: [12, 2], 2022: [1, 2], 2023: [22, 1],
  2024: [10, 2], 2025: [29, 1], 2026: [17, 2], 2027: [6, 2], 2028: [26, 1], 2029: [13, 2], 2031: [23, 1], 2032: [11, 2],
};
for (const [nam, [d, m]] of Object.entries(TET)) {
  test(`Tết ${nam}: mùng 1 tháng Giêng = ${d}/${m}/${nam}`, () => {
    assert.deepEqual(amSangDuong(1, 1, +nam), { ngay: d, thang: m, nam: +nam });
    const a = duongSangAm(d, m, +nam);
    assert.deepEqual([a.ngay, a.thang, a.nam, a.nhuan], [1, 1, +nam, false]);
  });
}

test('Tết 2026 (Bính Ngọ) 17/2/2026 và Tết 2027 (Đinh Mùi) 6/2/2027', () => {
  assert.equal(canChiNam(2026), 'Bính Ngọ');
  assert.equal(canChiNam(2027), 'Đinh Mùi');
  assert.equal(conGiap(2026), 'Ngọ');
  assert.equal(conGiap(2027), 'Mùi');
  assert.deepEqual(duongSangAm(16, 2, 2026), { ngay: 29, thang: 12, nam: 2025, nhuan: false }); // tháng Chạp 2025 thiếu: 29 là ngày cuối năm
  assert.deepEqual(duongSangAm(17, 2, 2026), { ngay: 1, thang: 1, nam: 2026, nhuan: false });
});

test('Tết 2030: sóc rơi sát nửa đêm nên Việt Nam (UTC+7) khác Trung Quốc (UTC+8)', () => {
  assert.deepEqual(amSangDuong(1, 1, 2030), { ngay: 2, thang: 2, nam: 2030 });
});

test('tháng nhuận đã biết: 2020 nhuận 4, 2023 nhuận 2, 2025 nhuận 6', () => {
  assert.deepEqual(duongSangAm(23, 5, 2020), { ngay: 1, thang: 4, nam: 2020, nhuan: true });
  assert.deepEqual(duongSangAm(22, 3, 2023), { ngay: 1, thang: 2, nam: 2023, nhuan: true });
  assert.deepEqual(duongSangAm(25, 7, 2025), { ngay: 1, thang: 6, nam: 2025, nhuan: true });
  assert.deepEqual(amSangDuong(1, 4, 2020, true), { ngay: 23, thang: 5, nam: 2020 });
  assert.deepEqual(amSangDuong(1, 2, 2023, true), { ngay: 22, thang: 3, nam: 2023 });
  assert.deepEqual(amSangDuong(1, 6, 2025, true), { ngay: 25, thang: 7, nam: 2025 });
  // tháng không nhuận mà đòi nhuận thì không có
  assert.equal(amSangDuong(1, 5, 2024, true), null);
  assert.equal(amSangDuong(1, 3, 2023, true), null);
});

test('lễ lớn: Giỗ Tổ 10/3, Trung thu 15/8, Rằm tháng Giêng', () => {
  assert.deepEqual(amSangDuong(10, 3, 2026), { ngay: 26, thang: 4, nam: 2026 });
  assert.deepEqual(amSangDuong(15, 8, 2026), { ngay: 25, thang: 9, nam: 2026 });
  assert.deepEqual(amSangDuong(15, 1, 2026), { ngay: 3, thang: 3, nam: 2026 });
  assert.deepEqual(amSangDuong(15, 8, 2025), { ngay: 6, thang: 10, nam: 2025 });
  assert.deepEqual(amSangDuong(10, 3, 2025), { ngay: 7, thang: 4, nam: 2025 });
});

test('hôm nay 04/10/2026 = 24 tháng 8 năm Bính Ngọ', () => {
  assert.deepEqual(duongSangAm(4, 10, 2026), { ngay: 24, thang: 8, nam: 2026, nhuan: false });
});

test('ngày 30 không tồn tại ở tháng thiếu', () => {
  assert.equal(amSangDuong(30, 12, 2025), null); // tháng Chạp 2025 chỉ có 29 ngày
  // tháng 2 âm 2026 có 29 hay 30 ngày: nhất quán với soNgayThangAm
  const n = soNgayThangAm(2, 2026);
  assert.ok(n === 29 || n === 30);
  assert.equal(amSangDuong(31, 2, 2026), null);
});

test('đi về dương -> âm -> dương cho mọi ngày 2000..2040 (bước 7 ngày)', () => {
  let n = 0;
  for (let jd = jdTuNgay(1, 1, 2000); jd < jdTuNgay(1, 1, 2040); jd += 7) {
    const [d, m, y] = ngayTuJd(jd);
    const a = duongSangAm(d, m, y);
    const s = amSangDuong(a.ngay, a.thang, a.nam, a.nhuan);
    assert.deepEqual(s, { ngay: d, thang: m, nam: y }, `${d}/${m}/${y}`);
    n++;
  }
  assert.ok(n > 2000);
});

test('tháng âm liên tiếp tăng đúng: mỗi tháng có 29 hoặc 30 ngày, một năm 12 hoặc 13 tháng', () => {
  for (let y = 2000; y <= 2060; y++) {
    let tong = 0; let soThang = 0;
    for (let m = 1; m <= 12; m++) {
      const n = soNgayThangAm(m, y, false); assert.ok(n === 29 || n === 30, `${m}/${y}`);
      tong += n; soThang++;
      const nn = soNgayThangAm(m, y, true);
      if (nn) { tong += nn; soThang++; }
    }
    assert.ok(soThang === 12 || soThang === 13, `năm ${y}: ${soThang}`);
    assert.ok(tong >= 353 && tong <= 385, `năm ${y}: ${tong} ngày`);
  }
});

test('can chi ngày: 17/2/2026 (mùng 1 Tết Bính Ngọ) là ngày Nhâm Tuất; 1/1/2000 Mậu Ngọ', () => {
  assert.equal(canChiNgay(1, 1, 2000), 'Mậu Ngọ');
  assert.equal(canChiNgay(17, 2, 2026), 'Nhâm Tuất');
});

test('jd chuyển đổi hai chiều', () => {
  assert.equal(jdTuNgay(1, 1, 2000), 2451545);
  assert.deepEqual(ngayTuJd(2451545), [1, 1, 2000]);
});
