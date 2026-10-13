import test from 'node:test';
import assert from 'node:assert/strict';
import { bangTraNo, guiTietKiem, laiKep, soSanhVay, laiSuatThucNam } from '../js/lib/loan.js';
import { chiaDeu, chiaTheoMon, phanTramCua, laBaoNhieuPhanTram, thayDoiPhanTram, giamGia, vat, tinhTip } from '../js/lib/money.js';

const xap = (a, b, e) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b} (±${e})`);

test('niên kim: 100 triệu, 12%/năm, 12 tháng -> 8.884.879 đ/tháng', () => {
  const r = bangTraNo({ soTien: 100e6, laiNam: 12, soThang: 12, kieu: 'niemkim' });
  xap(r.kyDau, 8884879, 1);
  xap(r.tongLai, 6618546, 12);
  assert.equal(r.hang.length, 12);
  assert.equal(r.hang.at(-1).duNo, 0);
  // tổng gốc phải đúng bằng số vay
  assert.equal(r.hang.reduce((s, h) => s + h.goc, 0), 100e6);
  // kỳ đầu: lãi = 1% của 100 triệu
  assert.equal(r.hang[0].lai, 1000000);
});

test('gốc đều: tổng lãi = P*r*(n+1)/2', () => {
  const r = bangTraNo({ soTien: 120e6, laiNam: 12, soThang: 12, kieu: 'goc-deu' });
  xap(r.tongLai, 7800000, 6);
  assert.equal(r.hang[0].goc, 10000000);
  assert.equal(r.hang[0].tra, 11200000);
  assert.equal(r.hang.at(-1).tra, 10100000);
  assert.equal(r.hang.reduce((s, h) => s + h.goc, 0), 120e6);
});

test('lãi phẳng: lãi mỗi kỳ cố định, lãi suất thực xấp xỉ gần gấp đôi', () => {
  const r = bangTraNo({ soTien: 120e6, laiNam: 12, soThang: 12, kieu: 'lai-phang' });
  assert.equal(r.tongLai, 14400000);
  assert.equal(r.hang[0].tra, 11200000);
  assert.ok(r.laiThucNam > 20 && r.laiThucNam < 24, String(r.laiThucNam));
});

test('lãi 0%: chia đều', () => {
  const r = bangTraNo({ soTien: 12e6, laiNam: 0, soThang: 12 });
  assert.equal(r.tongLai, 0);
  assert.equal(r.kyDau, 1e6);
});

test('1 kỳ và kỳ hạn dài 360 tháng (vay mua nhà)', () => {
  const m = bangTraNo({ soTien: 1e9, laiNam: 9, soThang: 1 });
  assert.equal(m.tongTra, 1e9 + Math.round(1e9 * 0.0075));
  const h = bangTraNo({ soTien: 2e9, laiNam: 9, soThang: 240 });
  xap(h.kyDau, 17994000, 60000); // ~17,99 triệu/tháng
  assert.equal(h.hang.at(-1).duNo, 0);
});

test('đầu vào sai bị từ chối', () => {
  assert.throws(() => bangTraNo({ soTien: 0, laiNam: 10, soThang: 12 }), /lớn hơn 0/);
  assert.throws(() => bangTraNo({ soTien: 1e6, laiNam: 10, soThang: 0 }), /Kỳ hạn/);
  assert.throws(() => bangTraNo({ soTien: 1e6, laiNam: -1, soThang: 12 }), /Lãi suất/);
  assert.throws(() => bangTraNo({ soTien: 1e6, laiNam: 10, soThang: 12, kieu: 'zzz' }), /Kiểu/);
});

test('so sánh hai phương án vay', () => {
  const s = soSanhVay(
    { soTien: 500e6, laiNam: 10, soThang: 60, kieu: 'niemkim' },
    { soTien: 500e6, laiNam: 9, soThang: 60, kieu: 'niemkim' },
  );
  assert.equal(s.reHon, 'B');
  assert.ok(s.chenhTongLai > 0);
  assert.ok(s.chenhKyDau > 0);
  assert.equal(soSanhVay({ soTien: 1e6, laiNam: 5, soThang: 6 }, { soTien: 1e6, laiNam: 5, soThang: 6 }).reHon, 'bang');
});

test('IRR: dòng tiền một kỳ', () => {
  xap(laiSuatThucNam([1010000], 1000000), 12, 0.001);
});

test('gửi tiết kiệm: lãi cuối kỳ và nhập lãi', () => {
  const a = guiTietKiem({ soTien: 100e6, laiNam: 6, soThang: 12 });
  assert.equal(a.lai, 6000000);
  assert.equal(a.tongNhan, 106000000);
  const b = guiTietKiem({ soTien: 100e6, laiNam: 6, soThang: 6 });
  assert.equal(b.lai, 3000000);
  const c = guiTietKiem({ soTien: 100e6, laiNam: 12, soThang: 12, nhapLai: true });
  xap(c.lai, 12682503, 1);
  assert.throws(() => guiTietKiem({ soTien: -1, laiNam: 6, soThang: 12 }));
});

test('lãi kép', () => {
  const a = laiKep({ von: 100e6, laiNam: 12, soNam: 1, kyGhep: 12 });
  xap(a.tong, 112682503, 1);
  const b = laiKep({ von: 100e6, laiNam: 10, soNam: 1, kyGhep: 1 });
  assert.equal(b.tong, 110000000);
  const c = laiKep({ von: 100e6, laiNam: 10, soNam: 10, kyGhep: 1 });
  xap(c.tong, 259374246, 1);
  assert.equal(c.theoNam.length, 10);
  // góp hàng tháng, lãi 0%: chỉ cộng dồn
  const d = laiKep({ von: 0, laiNam: 0, soNam: 2, gopThang: 1e6 });
  assert.equal(d.tong, 24e6);
  assert.equal(d.lai, 0);
  // góp hàng tháng có lãi: lớn hơn tổng đã góp
  const e = laiKep({ von: 0, laiNam: 6, soNam: 5, kyGhep: 12, gopThang: 5e6 });
  assert.ok(e.tong > 300e6 && e.lai > 0);
  xap(e.tong, 5e6 * ((Math.pow(1.005, 60) - 1) / 0.005), 2);
});

// ---------------- chia tiền, phần trăm ----------------
test('chia đều và làm tròn lên', () => {
  const r = chiaDeu({ tong: 1000000, soNguoi: 3, lamTronLen: 1000 });
  assert.equal(r.moiNguoi, 334000);
  assert.equal(r.tongThu, 1002000);
  assert.equal(r.du, 2000);
  assert.equal(chiaDeu({ tong: 900000, soNguoi: 3 }).moiNguoi, 300000);
  assert.equal(chiaDeu({ tong: 900000, soNguoi: 3 }).du, 0);
  assert.equal(chiaDeu({ tong: 100, soNguoi: 1 }).moiNguoi, 100);
  assert.throws(() => chiaDeu({ tong: 100, soNguoi: 0 }), /Số người/);
  assert.throws(() => chiaDeu({ tong: -1, soNguoi: 2 }), /Tổng tiền/);
});

test('chia theo món: phụ phí chia theo tỉ lệ, tổng khớp', () => {
  const r = chiaTheoMon({ nguoi: [{ ten: 'An', tien: 300000 }, { ten: 'Bình', tien: 100000 }], phuPhi: 40000 });
  assert.equal(r.ds[0].tra, 330000);
  assert.equal(r.ds[1].tra, 110000);
  assert.equal(r.tong, 440000);
  // làm tròn lẻ: 3 người, phụ phí 100 -> tổng vẫn khớp
  const q = chiaTheoMon({ nguoi: [{ ten: 'a', tien: 100 }, { ten: 'b', tien: 100 }, { ten: 'c', tien: 100 }], phuPhi: 100 });
  assert.equal(q.ds.reduce((s, x) => s + x.tra, 0), 400);
  // có giảm giá
  const g = chiaTheoMon({ nguoi: [{ ten: 'a', tien: 200 }, { ten: 'b', tien: 200 }], phuPhi: 0, giam: 100 });
  assert.equal(g.ds[0].tra, 150);
  assert.throws(() => chiaTheoMon({ nguoi: [] }));
});

test('phần trăm', () => {
  assert.equal(phanTramCua(10, 2000000), 200000);
  assert.equal(laBaoNhieuPhanTram(50, 200), 25);
  assert.equal(thayDoiPhanTram(100, 120), 20);
  assert.equal(thayDoiPhanTram(200, 150), -25);
  assert.throws(() => laBaoNhieuPhanTram(1, 0));
  assert.throws(() => thayDoiPhanTram(0, 5));
});

test('giảm giá: giảm liên tiếp không cộng dồn', () => {
  const g = giamGia({ gia: 1000000, phanTram: 20 });
  assert.equal(g.giaSau, 800000);
  assert.equal(g.tietKiem, 200000);
  const h = giamGia({ gia: 1000000, phanTram: 20, giamThem: 10 });
  assert.equal(h.giaSau, 720000);
  xap(h.phanTramThucTe, 28, 1e-9);
});

test('VAT: thêm và tách', () => {
  const a = vat({ so: 1000000, thue: 10 });
  assert.equal(a.coVat, 1100000); assert.equal(a.tienThue, 100000);
  const b = vat({ so: 1100000, thue: 10, daGomVat: true });
  xap(b.chuaVat, 1000000, 1e-6); xap(b.tienThue, 100000, 1e-6);
  const c = vat({ so: 1000000, thue: 8 });
  assert.equal(c.coVat, 1080000);
  assert.equal(vat({ so: 100, thue: 0 }).coVat, 100);
});

test('tip', () => {
  const t = tinhTip({ hoaDon: 500000, tipPhanTram: 10, soNguoi: 4 });
  assert.equal(t.tip, 50000); assert.equal(t.tong, 550000); assert.equal(t.moiNguoi, 137500);
  assert.throws(() => tinhTip({ hoaDon: 1, tipPhanTram: 1, soNguoi: 0 }));
});
