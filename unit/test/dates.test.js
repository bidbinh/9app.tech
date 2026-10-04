import test from 'node:test';
import assert from 'node:assert/strict';
import {
  docNgay, congNgay, khoangCachNgay, congThang, congKhoang, khoangNamThangNgay, tenThu, soNgay, tuSoNgay,
  demNgayLamViec, congNgayLamViec, ngayLeCoDinh, tinhTuoi, tinhThai, ngayThanhChuoi, hienThiNgay, lanKeTiep, hopLe,
} from '../js/lib/dates.js';

const D = (y, m, d) => ({ y, m, d });
const chuoi = ngayThanhChuoi;

test('docNgay: hợp lệ và không hợp lệ', () => {
  assert.deepEqual(docNgay('2026-10-04'), D(2026, 10, 4));
  assert.equal(docNgay('2026-02-30'), null);
  assert.equal(docNgay('2025-02-29'), null);
  assert.deepEqual(docNgay('2024-02-29'), D(2024, 2, 29));
  assert.equal(docNgay('abc'), null);
  assert.equal(docNgay(''), null);
  assert.equal(docNgay('2026-13-01'), null);
  assert.equal(hopLe(D(1900, 2, 29)), false);
  assert.equal(hopLe(D(2000, 2, 29)), true);
});

test('thứ trong tuần', () => {
  assert.equal(tenThu(D(2026, 10, 4)), 'Chủ nhật');
  assert.equal(tenThu(D(2000, 1, 1)), 'Thứ bảy');
  assert.equal(tenThu(D(1970, 1, 1)), 'Thứ năm');
  assert.equal(tenThu(D(1945, 9, 2)), 'Chủ nhật');
  assert.equal(tenThu(D(1975, 4, 30)), 'Thứ tư');
  assert.equal(tenThu(D(2026, 2, 17)), 'Thứ ba'); // mùng 1 Tết Bính Ngọ
});

test('cộng trừ ngày qua năm nhuận và qua năm', () => {
  assert.equal(chuoi(congNgay(D(2026, 10, 4), 100)), '2027-01-12');
  assert.equal(chuoi(congNgay(D(2026, 10, 4), -100)), '2026-06-26');
  assert.equal(chuoi(congNgay(D(2024, 2, 28), 1)), '2024-02-29');
  assert.equal(chuoi(congNgay(D(2025, 2, 28), 1)), '2025-03-01');
  assert.equal(chuoi(congNgay(D(2026, 12, 31), 1)), '2027-01-01');
  assert.equal(chuoi(congNgay(D(2026, 10, 4), 0)), '2026-10-04');
  assert.equal(chuoi(congNgay(D(2026, 10, 4), 36500)), '2126-10-04'.replace('2126-10-04', chuoi(tuSoNgay(soNgay(D(2026, 10, 4)) + 36500))));
});

test('khoảng cách hai ngày', () => {
  assert.equal(khoangCachNgay(D(2026, 1, 1), D(2026, 12, 31)), 364);
  assert.equal(khoangCachNgay(D(2024, 1, 1), D(2025, 1, 1)), 366);
  assert.equal(khoangCachNgay(D(2026, 10, 4), D(2026, 10, 4)), 0);
  assert.equal(khoangCachNgay(D(2026, 10, 5), D(2026, 10, 4)), -1);
  assert.equal(khoangCachNgay(D(1945, 9, 2), D(2026, 10, 4)), 29617);
  // chạy qua thời điểm đổi giờ mùa hè không lệch
  assert.equal(khoangCachNgay(D(2026, 3, 1), D(2026, 4, 1)), 31);
});

test('cộng tháng giữ ngày cuối tháng', () => {
  assert.equal(chuoi(congThang(D(2026, 1, 31), 1)), '2026-02-28');
  assert.equal(chuoi(congThang(D(2024, 1, 31), 1)), '2024-02-29');
  assert.equal(chuoi(congThang(D(2026, 10, 4), 3)), '2027-01-04');
  assert.equal(chuoi(congThang(D(2026, 1, 15), -2)), '2025-11-15');
  assert.equal(chuoi(congThang(D(2024, 2, 29), 12)), '2025-02-28');
  assert.equal(chuoi(congKhoang(D(2026, 10, 4), { nam: 1, thang: 2, tuan: 1, ngay: 3 })), '2027-12-14');
});

test('khoảng năm - tháng - ngày', () => {
  assert.deepEqual(khoangNamThangNgay(D(1990, 5, 15), D(2026, 10, 4)), { nam: 36, thang: 4, ngay: 19, tongNgay: 13291 });
  assert.deepEqual(khoangNamThangNgay(D(2026, 1, 31), D(2026, 3, 1)), { nam: 0, thang: 1, ngay: 1, tongNgay: 29 });
  assert.deepEqual(khoangNamThangNgay(D(2026, 10, 4), D(2026, 10, 4)), { nam: 0, thang: 0, ngay: 0, tongNgay: 0 });
  // đảo thứ tự vẫn cho kết quả dương
  assert.equal(khoangNamThangNgay(D(2026, 10, 4), D(2025, 10, 4)).nam, 1);
});

test('ngày làm việc (T2-T6, bao gồm hai đầu)', () => {
  // Thứ hai 5/10/2026 tới thứ sáu 9/10/2026
  assert.equal(demNgayLamViec(D(2026, 10, 5), D(2026, 10, 9)).lam, 5);
  // thứ hai tới thứ hai tuần sau
  assert.equal(demNgayLamViec(D(2026, 10, 5), D(2026, 10, 12)).lam, 6);
  // chỉ cuối tuần
  assert.equal(demNgayLamViec(D(2026, 10, 3), D(2026, 10, 4)).lam, 0);
  assert.equal(demNgayLamViec(D(2026, 10, 3), D(2026, 10, 4)).cuoiTuan, 2);
  // thứ bảy làm việc
  assert.equal(demNgayLamViec(D(2026, 10, 5), D(2026, 10, 10), { thuBayLaLamViec: true }).lam, 6);
  // một tháng
  assert.equal(demNgayLamViec(D(2026, 10, 1), D(2026, 10, 31)).lam, 22);
  // không bao gồm hai đầu
  assert.equal(demNgayLamViec(D(2026, 10, 5), D(2026, 10, 9), { baoGomHaiDau: false }).lam, 3);
  // đảo thứ tự
  assert.equal(demNgayLamViec(D(2026, 10, 9), D(2026, 10, 5)).lam, 5);
});

test('trừ ngày lễ cố định', () => {
  // 30/4/2026 (thứ năm) và 1/5/2026 (thứ sáu) là lễ
  const kq = demNgayLamViec(D(2026, 4, 27), D(2026, 5, 1), { truLe: true });
  assert.equal(kq.lam, 3);
  assert.equal(kq.nghiLe, 2);
  assert.equal(demNgayLamViec(D(2026, 4, 27), D(2026, 5, 1)).lam, 5);
});

test('ngày lễ cố định gồm Tết âm lịch và Giỗ Tổ', () => {
  const le = ngayLeCoDinh(2026);
  assert.ok(le.has('2026-01-01'));
  assert.ok(le.has('2026-04-30'));
  assert.ok(le.has('2026-05-01'));
  assert.ok(le.has('2026-09-02'));
  assert.ok(le.has('2026-04-26')); // 10/3 âm
  for (const d of ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20']) assert.ok(le.has(d), d);
  assert.ok(!le.has('2026-02-21'));
});

test('cộng ngày làm việc', () => {
  assert.equal(chuoi(congNgayLamViec(D(2026, 10, 5), 5)), '2026-10-12'); // T2 + 5 ngày làm = T2 sau
  assert.equal(chuoi(congNgayLamViec(D(2026, 10, 9), 1)), '2026-10-12'); // T6 + 1 = T2
  assert.equal(chuoi(congNgayLamViec(D(2026, 10, 12), -1)), '2026-10-09');
  assert.equal(chuoi(congNgayLamViec(D(2026, 10, 5), 0)), '2026-10-05');
  assert.equal(chuoi(congNgayLamViec(D(2026, 4, 29), 1, { truLe: true })), '2026-05-04'); // bỏ 30/4, 1/5, cuối tuần
});

test('tính tuổi', () => {
  const t = tinhTuoi(D(1990, 5, 15), D(2026, 10, 4));
  assert.equal(t.nam, 36); assert.equal(t.thang, 4); assert.equal(t.ngay, 19);
  assert.equal(chuoi(t.sinhNhatKe), '2027-05-15');
  assert.equal(t.conLai, 223);
  assert.equal(t.thuSinh, 'Thứ ba');
  // đúng ngày sinh nhật
  const s = tinhTuoi(D(2000, 10, 4), D(2026, 10, 4));
  assert.equal(s.nam, 26); assert.equal(s.conLai, 0);
  // sinh 29/2: năm không nhuận sinh nhật rơi vào 28/2
  const n = tinhTuoi(D(2000, 2, 29), D(2026, 2, 28));
  assert.equal(n.nam, 26);
  assert.equal(n.conLai, 0);
  assert.equal(chuoi(n.sinhNhatKe), '2026-02-28');
  // chưa sinh
  assert.equal(tinhTuoi(D(2030, 1, 1), D(2026, 10, 4)), null);
  // can chi & tuổi mụ: sinh 1990 (Canh Ngọ) trước Tết 1990 (27/1/1990) thuộc năm âm 1989
  assert.equal(tinhTuoi(D(1990, 5, 15), D(2026, 10, 4)).canChiSinh, 'Canh Ngọ');
  assert.equal(tinhTuoi(D(1990, 1, 10), D(2026, 10, 4)).canChiSinh, 'Kỷ Tỵ');
  assert.equal(tinhTuoi(D(1990, 5, 15), D(2026, 10, 4)).tuoiMu, 37);
});

test('tuần thai theo quy tắc 280 ngày', () => {
  const t = tinhThai({ kinhCuoi: D(2026, 1, 1) }, D(2026, 10, 4));
  assert.equal(chuoi(t.duSinh), '2026-10-08');
  assert.equal(t.tuan, 39); assert.equal(t.ngayLe, 3);
  assert.equal(t.tongNgay, 276);
  assert.equal(t.conLai, 4);
  assert.equal(t.thaiKy, 3);
  assert.equal(chuoi(t.ngayThuThai), '2026-01-15');
  const u = tinhThai({ duSinh: D(2026, 10, 8) }, D(2026, 10, 4));
  assert.equal(chuoi(u.kinhCuoi), '2026-01-01');
  assert.equal(u.tuan, 39);
  const dau = tinhThai({ kinhCuoi: D(2026, 9, 1) }, D(2026, 10, 4));
  assert.equal(dau.tuan, 4); assert.equal(dau.ngayLe, 5); assert.equal(dau.thaiKy, 1);
  const chua = tinhThai({ kinhCuoi: D(2026, 11, 1) }, D(2026, 10, 4));
  assert.equal(chua.tuan, null); assert.equal(chua.thaiKy, 'chua');
});

test('lần kế tiếp của mục đếm ngược', () => {
  const homNay = D(2026, 10, 4);
  assert.equal(chuoi(lanKeTiep({ ngay: '2027-01-01', lap: 'none' }, homNay)), '2027-01-01');
  // lặp theo dương: sinh nhật 15/5/1990 -> 15/5/2027
  assert.equal(chuoi(lanKeTiep({ ngay: '1990-05-15', lap: 'duong' }, homNay)), '2027-05-15');
  // chưa tới trong năm nay
  assert.equal(chuoi(lanKeTiep({ ngay: '1990-12-25', lap: 'duong' }, homNay)), '2026-12-25');
  // đúng hôm nay vẫn là hôm nay
  assert.equal(chuoi(lanKeTiep({ ngay: '2000-10-04', lap: 'duong' }, homNay)), '2026-10-04');
  // 29/2 lặp vào 28/2 năm thường
  assert.equal(chuoi(lanKeTiep({ ngay: '2024-02-29', lap: 'duong' }, homNay)), '2027-02-28');
  // lặp theo âm lịch: mùng 1 Tết 2026 (17/2/2026) -> mùng 1 Tết 2027 = 6/2/2027
  assert.equal(chuoi(lanKeTiep({ ngay: '2026-02-17', lap: 'am' }, homNay)), '2027-02-06');
  // ngày gốc ở tương lai thì chính nó
  assert.equal(chuoi(lanKeTiep({ ngay: '2030-06-01', lap: 'duong' }, homNay)), '2030-06-01');
  assert.equal(lanKeTiep({ ngay: 'xx', lap: 'none' }, homNay), null);
});

test('định dạng ngày', () => {
  assert.equal(hienThiNgay(D(2026, 1, 5)), '05/01/2026');
});
