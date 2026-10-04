import test from 'node:test';
import assert from 'node:assert/strict';
import { tinhChuoi, tinh, moTa, LoiTinh } from '../js/lib/calc.js';

const v = (s, o) => tinhChuoi(s, o).value;

test('bàn phím: phép tính cơ bản và thứ tự ưu tiên', () => {
  assert.equal(v('2+3'), 5);
  assert.equal(v('2+3×4'), 14);
  assert.equal(v('(2+3)×4'), 20);
  assert.equal(v('10÷4'), 2.5);
  assert.equal(v('10-4-3'), 3);
  assert.equal(v('2*3*4'), 24);
  assert.equal(v('1.5+1.5'), 3);
  assert.equal(v('0.1+0.2'), 0.3);
  assert.equal(v('-5+3'), -2);
  assert.equal(v('2×-3'), -6);
  assert.equal(v('2^10'), 1024);
  assert.equal(v('2^3^2'), 512);
  assert.equal(v('√16'), 4);
  assert.equal(v('3²'), 9);
  assert.equal(v('√9+√16'), 7);
});

test('bàn phím: phần trăm kiểu máy tính', () => {
  assert.equal(v('200+10%'), 220);
  assert.equal(v('200-10%'), 180);
  assert.equal(v('200×10%'), 20);
  assert.equal(v('50%'), 0.5);
  assert.equal(v('1000000+8%'), 1080000);
});

test('bàn phím: nhân ngầm, đóng ngoặc tự động, bỏ phép toán thừa cuối', () => {
  assert.equal(v('2(3+4)'), 14);
  assert.equal(v('(1+2)(3+4)'), 21);
  assert.equal(v('(2+3'), 5);
  assert.equal(v('5+'), 5);
  assert.equal(v('5×'), 5);
});

test('bàn phím: lỗi', () => {
  assert.throws(() => tinhChuoi('5÷0'), /chia được cho 0/);
  assert.throws(() => tinhChuoi(''), LoiTinh);
  assert.throws(() => tinhChuoi('√-4'), /số âm/);
  assert.throws(() => tinhChuoi('1..2'), /không hợp lệ/);
  assert.throws(() => tinhChuoi('2a'), /Ký tự/);
  assert.throws(() => tinhChuoi('2)'), /đóng ngoặc/);
  assert.throws(() => tinhChuoi('9^9^9^9'), /quá lớn/);
});

test('ans: phép toán mở đầu dùng kết quả trước', () => {
  assert.equal(v('+5', { ans: 10 }), 15);
  assert.equal(v('×2', { ans: 10 }), 20);
  assert.equal(v('-3', { ans: 10 }), 7);
  assert.equal(v('2+2', { ans: 10 }), 4);
});

test('moTa', () => {
  assert.equal(moTa([{ t: 'num', v: 3200000 }, { t: 'op', v: '+' }, { t: 'num', v: 50000 }]), '3.200.000 + 50.000');
  assert.equal(moTa([{ t: 'num', v: 10 }, { t: 'pct' }, { t: 'of' }, { t: 'num', v: 200 }]), '10% của 200');
  assert.equal(moTa([{ t: 'sqrt' }, { t: 'num', v: 16 }]), '√16');
  assert.equal(moTa([{ t: 'num', v: 2 }, { t: 'op', v: '*' }, { t: 'num', v: 3 }]), '2 × 3');
});

test('tinh: token trực tiếp', () => {
  assert.equal(tinh([{ t: 'num', v: 2 }, { t: 'pow' }, { t: 'num', v: 3 }]).value, 8);
  assert.throws(() => tinh([{ t: 'num', v: 2 }, { t: 'num', v: 3 }]), /liền nhau/);
  assert.throws(() => tinh([{ t: 'op', v: '*' }, { t: 'num', v: 3 }]), /thiếu số/);
});
