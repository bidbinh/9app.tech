import test from 'node:test';
import assert from 'node:assert/strict';
import { suKienTuDong, lanKe, danhSach, canNhac, choICS } from '../js/lib/lich.js';
import { macDinh, lamSach, xuatJSON, nhapJSON, layState, datLai } from '../js/lib/store.js';
import { taoICS } from '../js/lib/ics.js';

const st = () => { const s = macDinh(); s.hoso.net = 20e6; s.hoso.ngayLuong = 5; return s; };

test('Lịch: ngày lương tự lặp hằng tháng', () => {
  const s = st();
  assert.equal(danhSach(s, '2026-10-05')[0].ke, '2026-10-05');
  assert.equal(danhSach(s, '2026-10-06')[0].ke, '2026-11-05');
  assert.equal(danhSach(s, '2026-12-20')[0].ke, '2027-01-05');
});
test('Lịch: chưa có lương thì không có sự kiện tự động', () => {
  assert.equal(suKienTuDong(macDinh(), '2026-10-05').length, 0);
});
test('Lịch: ngày lương cuối tháng', () => {
  const s = st(); s.hoso.ngayLuong = 'cuoi';
  assert.equal(danhSach(s, '2026-02-10')[0].ke, '2026-02-28');
});
test('Lịch: thẻ ngày 25 nhắc trước 3 ngày, sự kiện một lần đã qua bị bỏ', () => {
  const s = st();
  s.lich.push({ id: 'a', ten: 'Đóng thẻ', loai: 'the', ngay: '2026-09-25', lap: 'thang', nhacTruoc: 3, soTien: 0 });
  s.lich.push({ id: 'b', ten: 'Cũ', loai: 'khac', ngay: '2026-01-01', lap: 'khong', nhacTruoc: 1, soTien: 0 });
  assert.equal(canNhac(s, '2026-10-21').length, 0);
  const n = canNhac(s, '2026-10-22');
  assert.equal(n.length, 1); assert.equal(n[0].conNgay, 3);
  assert.ok(!danhSach(s, '2026-10-22').some((e) => e.id === 'b'));
});
test('Lịch: ngày 31 hiểu là ngày cuối tháng', () => {
  assert.equal(lanKe({ ngay: '2026-01-31', lap: 'thang' }, '2026-02-10'), '2026-02-28');
});
test('Lịch: xuất .ics có VALARM cho từng việc', () => {
  const s = st();
  s.lich.push({ id: 'a', ten: 'Đóng thẻ', loai: 'the', ngay: '2026-09-25', lap: 'thang', nhacTruoc: 3, soTien: 5e6 });
  const ics = taoICS(choICS(s, '2026-10-05'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok((ics.match(/BEGIN:VALARM/g) || []).length >= 3);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261025'));
});

test('Lưu trữ: làm sạch dữ liệu hỏng, bổ sung phần thiếu', () => {
  const s = lamSach({ hoso: { net: 'abc', ngayLuong: 99 }, chi: [{ ngay: 'x', soTien: 5 }, { ngay: '2026-10-01', soTien: 45000, dm: 'ca-phe' }, null], luong: { vung: 9, phuThuoc: -2 } });
  assert.equal(s.hoso.net, 0); assert.equal(s.hoso.ngayLuong, 31);
  assert.equal(s.chi.length, 1); assert.equal(s.luong.vung, 4); assert.equal(s.luong.phuThuoc, 0);
  assert.equal(s.quyetToan.thang.length, 12);
  assert.deepEqual(lamSach(null), macDinh());
  assert.deepEqual(lamSach('x'), macDinh());
});
test('Lưu trữ: xuất rồi nhập lại khớp từng trường; tệp sai bị từ chối mà không mất dữ liệu', async () => {
  const s = macDinh(); s.hoso.net = 15e6; s.chi.push({ id: 'z', ngay: '2026-10-01', soTien: 45000, dm: 'ca-phe' });
  datLai(s);
  const txt = xuatJSON(new Date(Date.UTC(2026, 9, 5)));
  datLai(macDinh());
  const kq = await nhapJSON(txt);
  assert.equal(kq.ok, true);
  assert.equal(layState().hoso.net, 15e6); assert.equal(layState().chi[0].soTien, 45000);
  assert.equal((await nhapJSON('khong phai json')).ok, false);
  assert.equal((await nhapJSON('{"ung_dung":"khac"}')).ok, false);
  assert.equal(layState().hoso.net, 15e6, 'không được mất dữ liệu khi nhập lỗi');
  assert.ok(!txt.includes('"cau"'), 'không lưu câu gốc');
});
