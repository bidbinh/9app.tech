import test from 'node:test';
import assert from 'node:assert/strict';
import { doi, DON_VI, NHOM, layDonVi, quetDonVi, MAC_DINH_DICH, donViCuaNhom } from '../js/lib/units.js';

const gan = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('vàng: 1 chỉ = 3,75 g; 1 lượng = 10 chỉ = 37,5 g', () => {
  gan(doi(1, 'chi', 'g'), 3.75);
  gan(doi(3, 'chi', 'g'), 11.25);
  gan(doi(1, 'luong', 'chi'), 10);
  gan(doi(1, 'luong', 'g'), 37.5);
  gan(doi(1, 'phan', 'chi'), 0.1);
  gan(doi(37.5, 'g', 'luong'), 1);
  gan(doi(1, 'ozt', 'g'), 31.1034768);
  gan(doi(1, 'ozt', 'luong'), 31.1034768 / 37.5);
});

test('khối lượng thông dụng', () => {
  gan(doi(1, 'kg', 'g'), 1000);
  gan(doi(1, 'ta', 'kg'), 100);
  gan(doi(1, 'yen', 'kg'), 10);
  gan(doi(1, 'tan', 'ta'), 10);
  gan(doi(1, 'lb', 'g'), 453.59237);
  gan(doi(1, 'kg', 'lb'), 2.2046226218, 1e-9);
  gan(doi(16, 'oz', 'lb'), 1, 1e-12);
});

test('diện tích đất theo vùng', () => {
  gan(doi(1, 'sao_bb', 'm2'), 360);
  gan(doi(1, 'sao_tb', 'm2'), 500);
  gan(doi(1, 'mau_bb', 'sao_bb'), 10);
  gan(doi(1, 'mau_tb', 'sao_tb'), 10);
  gan(doi(1, 'cong', 'm2'), 1000);
  gan(doi(1, 'ha', 'm2'), 10000);
  gan(doi(1, 'km2', 'ha'), 100);
  gan(doi(1, 'ha', 'cong'), 10);
  gan(doi(1, 'acre', 'm2'), 4046.8564224);
  gan(doi(1, 'ft2', 'm2'), 0.09290304);
});

test('độ dài', () => {
  gan(doi(1, 'dam', 'km'), 1.609344);
  gan(doi(1, 'inch', 'cm'), 2.54);
  gan(doi(1, 'ft', 'inch'), 12);
  gan(doi(1, 'yard', 'ft'), 3);
  gan(doi(1, 'hl', 'm'), 1852);
  gan(doi(10, 'km', 'dam'), 6.2137119224, 1e-9);
});

test('nhiệt độ C, F, K', () => {
  gan(doi(0, 'c', 'f'), 32);
  gan(doi(100, 'c', 'f'), 212);
  gan(doi(37, 'c', 'f'), 98.6);
  gan(doi(-40, 'c', 'f'), -40);
  gan(doi(-40, 'f', 'c'), -40);
  gan(doi(32, 'f', 'c'), 0);
  gan(doi(0, 'c', 'k'), 273.15);
  gan(doi(0, 'k', 'c'), -273.15);
  gan(doi(212, 'f', 'k'), 373.15);
});

test('thể tích và tốc độ', () => {
  gan(doi(1, 'gal', 'l'), 3.785411784);
  gan(doi(1, 'galuk', 'l'), 4.54609);
  gan(doi(1, 'm3', 'l'), 1000);
  gan(doi(1000, 'ml', 'l'), 1);
  gan(doi(36, 'kmh', 'ms'), 10);
  gan(doi(60, 'mph', 'kmh'), 96.56064);
  gan(doi(1, 'knot', 'kmh'), 1.852);
});

test('khác nhóm bị từ chối, id sai bị từ chối', () => {
  assert.throws(() => doi(1, 'kg', 'm2'), /khác loại/);
  assert.throws(() => doi(1, 'xxx', 'm2'), /không tồn tại/);
});

test('tính đối xứng: đổi đi đổi về không đổi (mọi cặp cùng nhóm)', () => {
  for (const n of NHOM) {
    const ds = donViCuaNhom(n.id);
    for (const a of ds) for (const b of ds) {
      const x = 123.456;
      gan(doi(doi(x, a.id, b.id), b.id, a.id), x, 1e-9);
    }
  }
});

test('dữ liệu: id duy nhất, mọi đơn vị có nhóm và ký hiệu; đơn vị có hệ số dương', () => {
  const ids = new Set();
  for (const u of DON_VI) {
    assert.ok(!ids.has(u.id), 'trùng id ' + u.id); ids.add(u.id);
    assert.ok(NHOM.some((n) => n.id === u.nhom), u.id);
    assert.ok(u.kh && u.ten && Array.isArray(u.alias));
    if (u.nhom !== 'nhietdo') assert.ok(u.he > 0, u.id);
  }
  for (const [tu, den] of Object.entries(MAC_DINH_DICH)) {
    assert.equal(layDonVi(tu).nhom, layDonVi(den).nhom, `${tu}->${den} khác nhóm`);
  }
});

test('đơn vị theo vùng có ghi chú rõ vùng', () => {
  assert.match(layDonVi('sao_bb').ghiChu, /Bắc Bộ/);
  assert.match(layDonVi('sao_tb').ghiChu, /Trung Bộ/);
  assert.match(layDonVi('cong').ghiChu, /1\.296/);
  assert.match(layDonVi('chi').ghiChu, /3,75 g/);
});

test('quetDonVi: khớp dài nhất', () => {
  assert.equal(quetDonVi(['chi', 'vang', 'bang'], 0).soTu, 2);
  assert.equal(quetDonVi(['met', 'vuong'], 0).id, 'm2');
  assert.equal(quetDonVi(['met', 'khoi'], 0).id, 'm3');
  assert.equal(quetDonVi(['do', 'f'], 0).id, 'f');
  assert.equal(quetDonVi(['xyz'], 0), null);
  assert.ok(quetDonVi(['sao'], 0).canhBao);
});
