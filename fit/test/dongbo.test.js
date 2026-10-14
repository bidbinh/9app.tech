import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../js/lib/db.js';
import { layDuLieu, datDuLieu, KHOA_DONG_BO } from '../js/lib/dongbo.js';

test('đồng bộ chỉ gồm nhật ký tập luyện: không có sàng lọc sức khỏe, kế hoạch, cài đặt, bản nháp', async () => {
  await db.khoiTao();
  await db.xoaTatCa();
  await db.ghi('sangloc', { ketQua: 'duoc-phep', ngay: '2026-10-01' });
  await db.ghi('kehoach', { id: 'kh1' });
  await db.ghi('caidat', { chuLon: true });
  await db.ghi('nhap', { x: 1 });
  await db.ghi('choi', [{ id: 'c1', ngay: '2026-10-01', mon: 'Cầu lông', phut: 30, rpe: 5, ghiChu: '' }]);
  const du = layDuLieu();
  assert.deepEqual(Object.keys(du), ['choi']);
  assert.deepEqual(KHOA_DONG_BO, ['buoi', 'choi', 'dodac', 'muctieu', 'test']);
});

test('áp dụng bản đã gộp: làm sạch từng bản ghi, giữ nguyên dữ liệu không đồng bộ', async () => {
  await db.xoaTatCa();
  await db.ghi('sangloc', { ketQua: 'hoi-bac-si', ngay: '2026-10-01' });
  await datDuLieu({ choi: [{ id: 'c1', ngay: '2026-10-01', mon: 'Chạy', phut: 20, rpe: 99, ghiChu: '' }, { id: 'hong', ngay: 'khong-phai-ngay', phut: 5 }], muctieu: { buoiTuan: 3 } });
  const c = db.doc('choi', []);
  assert.equal(c.length, 1, 'bản ghi hỏng bị bỏ');
  assert.equal(c[0].rpe, 10, 'RPE bị kẹp về 10');
  assert.deepEqual(db.doc('sangloc', null), { ketQua: 'hoi-bac-si', ngay: '2026-10-01' }, 'sàng lọc sức khỏe không bị đụng');
  assert.deepEqual(db.doc('muctieu', null), { buoiTuan: 3 });
});

test('khóa vắng mặt trong bản đã gộp (đã xóa ở cả hai bên) thì bị bỏ khỏi máy', async () => {
  await db.xoaTatCa();
  await db.ghi('dodac', [{ id: 'd1', ngay: '2026-10-01', kg: 60, vong: {} }]);
  await datDuLieu({ choi: [] });
  assert.equal(db.doc('dodac', 'khong-con'), 'khong-con');
});
