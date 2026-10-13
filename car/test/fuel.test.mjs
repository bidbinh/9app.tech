import test from 'node:test';
import assert from 'node:assert/strict';
import { tieuHao, chiPhiMoiKm, thongKeThang, theoNhom, tongChiPhiSoHuu, uocKmNgay, soSanhDienXang } from '../js/lib/fuel.js';
import { dinhDangSo, tien, docSo, tienGon } from '../js/lib/money.js';

const xang = (ngay, km, luong, tienVnd, day = true) => ({ loai: 'xang', ngay, km, luong, tien: tienVnd, day });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('tiêu hao: đổ đầy - đổ đầy', () => {
  const r = tieuHao([xang('2026-01-01', 10000, 30, 0), xang('2026-01-15', 10400, 28, 0), xang('2026-02-01', 10800, 32, 0)]);
  // đoạn 1: 400 km dùng 28 lít = 7,0 ; đoạn 2: 400 km dùng 32 lít = 8,0 ; tổng 800 km, 60 lít = 7,5
  assert.equal(r.doan.length, 2);
  near(r.per100, 7.5); near(r.gan, 8); assert.equal(r.tongKm, 800);
});
test('tiêu hao: đổ lẻ giữa hai lần đầy được cộng vào', () => {
  const r = tieuHao([xang('2026-01-01', 1000, 40, 0), xang('2026-01-08', 1200, 10, 0, false), xang('2026-01-15', 1500, 25, 0)]);
  near(r.per100, (35 / 500) * 100); // 10 + 25 lít trên 500 km = 7
});
test('tiêu hao: thứ tự nhập lộn xộn vẫn đúng, thiếu dữ liệu thì báo cần thêm', () => {
  const r = tieuHao([xang('2026-02-01', 800, 32, 0), xang('2026-01-01', 0, 30, 0), xang('2026-01-15', 400, 28, 0)]);
  near(r.per100, 7.5);
  const r1 = tieuHao([xang('2026-01-01', 1000, 30, 0)]);
  assert.equal(r1.per100, null); assert.ok(r1.canThem.length > 0);
  assert.equal(tieuHao([]).per100, null);
});
test('tiêu hao: km không tăng hoặc lượng 0 bị bỏ qua', () => {
  const r = tieuHao([xang('2026-01-01', 1000, 30, 0), xang('2026-01-02', 1000, 10, 0), { loai: 'xang', ngay: '2026-01-03', km: null, luong: 10, tien: 0 }]);
  assert.equal(r.per100, null);
});
test('tiêu hao điện kWh/100km', () => {
  const r = tieuHao([{ loai: 'sac', ngay: '2026-01-01', km: 5000, luong: 40, tien: 0 }, { loai: 'sac', ngay: '2026-01-10', km: 5200, luong: 30, tien: 0 }]);
  near(r.per100, 15);
});
test('chi phí mỗi km', () => {
  const es = [xang('2026-01-01', 1000, 30, 600000), xang('2026-01-20', 1500, 35, 700000), { loai: 'sua-chua', ngay: '2026-01-25', km: 1600, tien: 300000 }];
  const r = chiPhiMoiKm(es);
  // mốc đầu 1000 km (đổ trước mốc không tính): 700k + 300k = 1.000.000 / 600 km
  near(r.moiKm, 1000000 / 600); assert.equal(r.km, 600);
  assert.equal(chiPhiMoiKm([xang('2026-01-01', 1000, 30, 1)]).moiKm, null);
});
test('thống kê theo tháng và theo nhóm', () => {
  const es = [
    { loai: 'xang', ngay: '2026-10-02', tien: 300000 }, { loai: 'sac', ngay: '2026-10-03', tien: 100000 },
    { loai: 'rua-xe', ngay: '2026-09-30', tien: 50000 }, { loai: 'bao-duong', ngay: '2025-09-30', tien: 999 },
    { loai: 'sua-chua', ngay: '2025-10-01', tien: 2000000 },
  ];
  const th = thongKeThang(es, '2026-10-05', 12);
  assert.equal(th.length, 12); assert.equal(th[11].ym, '2026-10'); assert.equal(th[0].ym, '2025-11');
  assert.equal(th[11].tong, 400000); assert.equal(th[10].tong, 50000);
  assert.equal(th.reduce((s, m) => s + m.tong, 0), 450000); // 2 khoản ngoài 12 tháng bị loại
  const g = theoNhom(es);
  assert.equal(g[0].id, 'sua-chua'); assert.equal(g.find((x) => x.id === 'nhien-lieu').tong, 400000);
});
test('thống kê tháng qua ranh giới năm', () => {
  const th = thongKeThang([{ loai: 'xang', ngay: '2026-01-15', tien: 5 }], '2026-02-10', 3);
  assert.deepEqual(th.map((m) => m.ym), ['2025-12', '2026-01', '2026-02']);
  assert.equal(th[1].tong, 5);
});
test('tổng chi phí sở hữu', () => {
  const xe = { ngayMua: '2025-10-05', giaMua: 500000000 };
  const r = tongChiPhiSoHuu(xe, [{ tien: 1000000, ngay: '2026-01-01' }, { tien: 500000, ngay: '2026-02-01' }], '2026-10-05');
  assert.equal(r.vanHanh, 1500000); assert.equal(r.thang, 12); assert.equal(r.moiThang, 125000); assert.equal(r.tatCa, 501500000);
  const r2 = tongChiPhiSoHuu({}, [], '2026-10-05');
  assert.equal(r2.vanHanh, 0); assert.equal(r2.moiThang, null); assert.equal(r2.tatCa, null);
});
test('ước km mỗi ngày cần đủ 30 ngày dữ liệu', () => {
  near(uocKmNgay([{ km: 1000, ngay: '2026-01-01' }, { km: 1300, ngay: '2026-01-31' }]), 10);
  assert.equal(uocKmNgay([{ km: 1000, ngay: '2026-01-01' }, { km: 1100, ngay: '2026-01-10' }]), null);
  assert.equal(uocKmNgay([{ km: 1000, ngay: '2026-01-01' }]), null);
});
test('so sánh điện và xăng chỉ tính khi đủ số, không bịa giá', () => {
  const r = soSanhDienXang({ kwh100: 15, giaDien: 3000, l100: 7, giaXang: 24000 });
  near(r.dienMoiKm, 450); near(r.xangMoiKm, 1680); near(r.tietKiem1000km, 1230000);
  const thieu = soSanhDienXang({ kwh100: 15, giaDien: null, l100: 7, giaXang: 24000 });
  assert.equal(thieu.dienMoiKm, null); assert.equal(thieu.tietKiem1000km, null);
});
test('định dạng tiền và đọc số', () => {
  assert.equal(dinhDangSo(1234567), '1.234.567');
  assert.equal(dinhDangSo(7.5, 1), '7,5');
  assert.equal(tien(300000), '300.000 đ');
  assert.equal(tienGon(1250000), '1,3 tr'); assert.equal(tienGon(350000), '350 k');
  assert.equal(docSo('300k'), 300000); assert.equal(docSo('1.250.000'), 1250000);
  assert.equal(docSo('7,5'), 7.5); assert.equal(docSo('2tr'), 2000000); assert.ok(Number.isNaN(docSo('abc')));
  assert.equal(docSo('45,000'), 45000);
});

test('tiêu hao báo lần đổ thiếu km và số km lùi thay vì lặng lẽ bỏ qua', () => {
  const r = tieuHao([xang('2026-01-01', 1000, 30, 0), { loai: 'xang', ngay: '2026-01-10', km: null, luong: 10, tien: 0 }, { loai: 'xang', ngay: '2026-01-12', km: null, luong: 5, tien: 0 }, xang('2026-01-20', 1400, 28, 0)]);
  assert.ok(r.canhBao.some((m) => m.startsWith('2 lần đổ chưa có số km')));
  const lui = tieuHao([xang('2026-01-01', 5000, 30, 0), xang('2026-01-10', 5400, 28, 0), xang('2026-01-20', 540, 28, 0)]); // gõ nhầm 540
  assert.ok(lui.canhBao.some((m) => m.includes('nhỏ hơn lần trước')));
  assert.deepEqual(tieuHao([xang('2026-01-01', 1000, 30, 0), xang('2026-01-10', 1400, 28, 0)]).canhBao, []);
});
