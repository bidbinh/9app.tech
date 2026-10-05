import test from 'node:test';
import assert from 'node:assert/strict';
import { phanTichCau, docDaySo } from '../js/lib/parse.js';

test('đổ xăng 300k 8 lít', () => {
  const r = phanTichCau('đổ xăng 300k 8 lít');
  assert.equal(r.ok, true); assert.equal(r.loai, 'xang'); assert.equal(r.tien, 300000); assert.equal(r.luong, 8); assert.equal(r.donViLuong, 'lit');
});
test('viết dính đơn vị và dấu chấm nghìn', () => {
  const r = phanTichCau('Đổ xăng 450.000đ 17,5l');
  assert.equal(r.tien, 450000); assert.equal(r.luong, 17.5); assert.equal(r.loai, 'xang');
  const r2 = phanTichCau('xăng 200k 8l 45.230km');
  assert.equal(r2.tien, 200000); assert.equal(r2.luong, 8); assert.equal(r2.km, 45230);
});
test('đọc số bằng chữ', () => {
  const r = phanTichCau('đổ xăng ba trăm nghìn tám lít');
  assert.equal(r.tien, 300000); assert.equal(r.luong, 8);
  const r2 = phanTichCau('đổ xăng hai trăm năm mươi nghìn mười hai lít');
  assert.equal(r2.tien, 250000); assert.equal(r2.luong, 12);
  const r3 = phanTichCau('đổ xăng một triệu rưỡi');
  assert.equal(r3.tien, 1500000);
  const r4 = phanTichCau('đổ xăng bốn mươi nghìn ba lít rưỡi');
  assert.equal(r4.tien, 40000); assert.equal(r4.luong, 3.5);
});
test('docDaySo', () => {
  assert.equal(docDaySo(['hai', 'muoi', 'lam']), 25);
  assert.equal(docDaySo(['mot', 'tram', 'linh', 'nam']), 105);
  assert.equal(docDaySo(['muoi', 'nghin']), 10000);
  assert.equal(docDaySo(['hai', 'trieu', 'ruoi']), 2500000);
  assert.equal(docDaySo(['xin']), null);
});
test('sạc điện', () => {
  const r = phanTichCau('sạc 150 nghìn 20 kwh');
  assert.equal(r.loai, 'sac'); assert.equal(r.tien, 150000); assert.equal(r.luong, 20); assert.equal(r.donViLuong, 'kwh');
  const r2 = phanTichCau('sạc xe 85k');
  assert.equal(r2.loai, 'sac'); assert.equal(r2.tien, 85000);
});
test('bảo dưỡng và hạng mục', () => {
  const r = phanTichCau('thay nhớt 250k');
  assert.equal(r.loai, 'bao-duong'); assert.equal(r.tien, 250000); assert.equal(r.hangMuc, 'Thay dầu nhớt');
  const r2 = phanTichCau('thay lốp 2 triệu 400');
  assert.equal(r2.loai, 'bao-duong'); assert.equal(r2.hangMuc, 'Lốp xe');
  const r3 = phanTichCau('sửa điều hòa 1tr2');
  assert.equal(r3.loai, 'sua-chua'); assert.equal(r3.tien, 1200000);
});
test('gửi xe, cầu đường, rửa xe', () => {
  assert.equal(phanTichCau('gửi xe 5k').loai, 'gui-xe');
  assert.equal(phanTichCau('gửi xe 5k').tien, 5000);
  assert.equal(phanTichCau('qua trạm thu phí 35 nghìn').loai, 'cau-duong');
  assert.equal(phanTichCau('rửa xe 50 nghìn').loai, 'rua-xe');
});
test('số trần dưới 1000 hiểu là nghìn đồng và có ghi chú để soát', () => {
  const r = phanTichCau('đổ xăng 300 8 lít');
  assert.equal(r.tien, 300000); assert.equal(r.luong, 8);
  assert.ok(r.ghiChu.some((g) => g.includes('300')));
});
test('dầu diesel và hôm qua', () => {
  const r = phanTichCau('hôm qua đổ dầu diesel 500k 20 lít');
  assert.equal(r.loai, 'xang'); assert.equal(r.hangMuc, 'Dầu diesel'); assert.equal(r.ngay, 'hom-qua');
});
test('câu không hiểu: ok=false, có hướng dẫn, không giữ nguyên câu', () => {
  const r = phanTichCau('hôm nay trời đẹp quá');
  assert.equal(r.ok, false); assert.ok(r.ghiChu.length > 0);
  assert.ok(!JSON.stringify(r).includes('trời đẹp'));
  assert.equal(phanTichCau('').ok, false);
});
test('kết quả không chứa nguyên câu gốc', () => {
  const r = phanTichCau('đổ xăng 300k 8 lít ở cây xăng Petrolimex đường Lê Lợi');
  assert.ok(!JSON.stringify(r).toLowerCase().includes('petrolimex'));
});

test('"1 triệu 2" nói tắt là 1.200.000 và km đi kèm', () => {
  const r = phanTichCau('xăng 1 triệu 2 12000km');
  assert.equal(r.tien, 1200000); assert.equal(r.km, 12000);
  assert.equal(phanTichCau('đổ xăng một triệu hai').tien, 1200000);
  assert.equal(phanTichCau('sửa xe 1 triệu 250').tien, 1250000);
  assert.equal(phanTichCau('đổ xăng 1 triệu 8 lít').tien, 1000000);
  assert.equal(phanTichCau('đổ xăng 1 triệu 8 lít').luong, 8);
  assert.equal(phanTichCau('đổ xăng hai triệu rưỡi').tien, 2500000);
  assert.equal(docDaySo(['mot', 'trieu', 'hai']), 1200000);
});
