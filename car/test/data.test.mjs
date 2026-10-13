import test from 'node:test';
import assert from 'node:assert/strict';
import { kho, khoiDong, luuXe, luuNhatKy, luuHen, xoaXe, khoiPhuc, xuat, nhap, xoaSach, loXe, loNhatKy, loHen, datMeta } from '../js/lib/data.js';

test('khởi động ở bộ nhớ tạm khi không có IndexedDB (Node)', async () => {
  await khoiDong();
  assert.equal(kho.luuTru, 'tam');
  assert.equal(kho.xe.length, 0);
});
test('lọc dữ liệu xe: kẹp độ dài, bỏ giá trị sai kiểu', () => {
  const x = loXe({ id: 'x1', loai: 'tau-bay', bienSo: '51k-123.45', namSX: 'abc', km: -5, anh: 'javascript:alert(1)', hang: 'A'.repeat(500) });
  assert.equal(x.loai, 'oto'); assert.equal(x.bienSo, '51K-123.45'); assert.equal(x.namSX, null); assert.equal(x.km, null);
  assert.equal(x.anh, ''); assert.equal(x.hang.length, 40);
  assert.equal(loXe(null), null);
});
test('lọc nhật ký và nhắc', () => {
  assert.equal(loNhatKy({ xeId: 'x', ngay: '2026-13-40' }), null);
  assert.equal(loNhatKy({ ngay: '2026-01-01' }), null);
  const e = loNhatKy({ xeId: 'x', ngay: '2026-01-01', loai: 'xang', tien: '300', luong: 8 });
  assert.equal(e.tien, 0); assert.equal(e.luong, 8); assert.equal(e.day, true);
  const h = loHen({ kind: 'la', ten: '', han: '2026-02-30' });
  assert.equal(h.kind, 'khac'); assert.equal(h.han, ''); assert.equal(h.ten, 'Mục nhắc');
});
test('lưu, cập nhật số km của xe theo nhật ký, xóa và hoàn tác', async () => {
  await xoaSach();
  const x = await luuXe({ id: 'xe1', loai: 'oto', bienSo: '30A-111.11', km: 1000, kmNgay: '2026-01-01' });
  await luuNhatKy({ xeId: 'xe1', ngay: '2026-02-01', loai: 'xang', tien: 300000, luong: 8, km: 1500 }, '2026-10-05');
  assert.equal(kho.xe[0].km, 1500);
  await luuNhatKy({ xeId: 'xe1', ngay: '2026-02-02', loai: 'khac', tien: 1, km: 900 }, '2026-10-05');
  assert.equal(kho.xe[0].km, 1500); // km thấp hơn không kéo lùi
  await luuHen({ xeId: 'xe1', kind: 'dang-kiem', ten: 'Đăng kiểm', han: '2027-01-01' });
  const snap = await xoaXe('xe1');
  assert.equal(kho.xe.length, 0); assert.equal(kho.nhatKy.length, 0); assert.equal(kho.hen.length, 0);
  assert.equal(snap.nhatKy.length, 2);
  await khoiPhuc(snap);
  assert.equal(kho.xe.length, 1); assert.equal(kho.nhatKy.length, 2); assert.equal(kho.hen.length, 1);
  assert.ok(x.id);
});
test('xuất rồi nhập thay thế cho kết quả giống hệt', async () => {
  const goc = JSON.parse(JSON.stringify(xuat(new Date('2026-10-05T00:00:00Z'))));
  assert.equal(goc.ung, '9car');
  await xoaSach();
  assert.equal(kho.xe.length, 0);
  const r = await nhap(JSON.parse(JSON.stringify(goc)), 'thay');
  assert.equal(r.ok, true); assert.equal(r.xe, 1); assert.equal(r.nhatKy, 2); assert.equal(r.hen, 1);
  const sau = xuat(new Date('2026-10-05T00:00:00Z'));
  assert.deepEqual(JSON.parse(JSON.stringify(sau)).nhatKy.sort((a, b) => a.id.localeCompare(b.id)), goc.nhatKy.sort((a, b) => a.id.localeCompare(b.id)));
});
test('nhập gộp không nhân đôi, nhập sai định dạng bị từ chối', async () => {
  const goc = JSON.parse(JSON.stringify(xuat()));
  const r = await nhap(goc, 'gop');
  assert.equal(r.ok, true);
  assert.equal(kho.xe.length, 1); assert.equal(kho.nhatKy.length, 2);
  assert.equal((await nhap({ foo: 1 })).ok, false);
  assert.equal((await nhap(null)).ok, false);
  assert.equal((await nhap({ ung: '9car', phienBan: 99, xe: [], nhatKy: [], hen: [] })).ok, false);
});
test('nhập bỏ nhật ký mồ côi và dữ liệu độc hại', async () => {
  await xoaSach();
  const r = await nhap({ ung: '9car', phienBan: 1, xe: [{ id: 'a', bienSo: '<img onerror=x>' }], nhatKy: [{ xeId: 'khong-co', ngay: '2026-01-01', loai: 'xang' }], hen: [], meta: { 'bad key!': 1, giaDien: { gia: 3000 } } }, 'thay');
  assert.equal(r.ok, true); assert.equal(r.nhatKy, 0);
  assert.equal(kho.meta.giaDien.gia, 3000); assert.equal(kho.meta['bad key!'], undefined);
  await datMeta('chuLon', true);
  assert.equal(kho.meta.chuLon, true);
  await xoaSach();
  assert.equal(Object.keys(kho.meta).length, 0);
});

import { tinhLaiKm, xeCua, GIOI_HAN } from '../js/lib/data.js';
import { xoaNhatKy as xoaNK } from '../js/lib/data.js';
test('nhập JSON từ chối số quá lớn và khóa __proto__', async () => {
  await xoaSach();
  const r = await nhap({ ung: '9car', phienBan: 1, xe: [{ id: 'a', km: 1e300, giaMua: 1e300, bienSo: 'X' }], nhatKy: [{ xeId: 'a', ngay: '2026-01-01', loai: 'xang', tien: 1e300, luong: 1e300, km: 1e300 }],
    hen: [{ xeId: 'a', kind: 'khac', ten: 'h', chuKyKm: 1e300, chuKyThang: 1e300 }], meta: JSON.parse('{"__proto__":{"x":1},"constructor":2,"ok":3}') }, 'thay');
  assert.equal(r.ok, true);
  assert.equal(kho.xe[0].km, null); assert.equal(kho.xe[0].giaMua, null);
  assert.equal(kho.nhatKy[0].tien, 0); assert.equal(kho.nhatKy[0].luong, null); assert.equal(kho.nhatKy[0].km, null);
  assert.equal(kho.hen[0].chuKyKm, null); assert.equal(kho.hen[0].chuKyThang, null);
  assert.equal(kho.meta.ok, 3); assert.equal(Object.getPrototypeOf(kho.meta), Object.prototype); assert.equal(({}).x, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(kho.meta, 'constructor'));
  assert.ok(GIOI_HAN.km < 1e7);
});
test('sửa lùi hoặc xóa lần ghi đã nâng số km thì tính lại số km xe', async () => {
  await xoaSach();
  await luuXe({ id: 'k1', loai: 'oto', bienSo: 'K', km: 1000, kmNgay: '2026-01-01' });
  const e1 = await luuNhatKy({ xeId: 'k1', ngay: '2026-02-01', loai: 'xang', tien: 1, luong: 5, km: 1500 }, '2026-10-05');
  const e2 = await luuNhatKy({ xeId: 'k1', ngay: '2026-03-01', loai: 'xang', tien: 1, luong: 5, km: 91500 }, '2026-10-05'); // gõ nhầm thừa số 9
  assert.equal(xeCua('k1').km, 91500);
  await luuNhatKy({ ...e2, km: 1900 }, '2026-10-05'); // sửa lại cho đúng
  assert.equal(xeCua('k1').km, 1900);
  const snap = await xoaNK(e2.id, '2026-10-05');
  assert.equal(xeCua('k1').km, 1500);
  await khoiPhuc(snap);
  assert.equal(xeCua('k1').km, 1900);
  // số km nhập tay cao hơn lần ghi thì không bị hạ
  await luuXe({ ...xeCua('k1'), km: 5000 });
  await xoaNK(e1.id, '2026-10-05');
  assert.equal(xeCua('k1').km, 5000);
  await tinhLaiKm('khong-co', '2026-10-05');
});
