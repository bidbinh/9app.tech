import test from 'node:test';
import assert from 'node:assert/strict';
import { trangThai, mauBaoDuong, hanNgay, hanKm } from '../js/lib/schedule.js';
import { addMonths, addDays, diffDays, nThangGan, laIso, dinhDang } from '../js/lib/dates.js';

const HOM = '2026-10-05';
test('ngày tháng: cộng tháng kẹp cuối tháng, hiệu số ngày', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonths('2026-03-15', -4), '2025-11-15');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-10-05', '2026-11-04'), 30);
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.ok(laIso('2026-02-28')); assert.ok(!laIso('2026-02-30')); assert.ok(!laIso('x'));
  assert.equal(dinhDang('2026-10-05'), '05/10/2026');
  assert.equal(nThangGan('2026-10-05', 1)[0], '2026-10');
});
test('trạng thái theo ngày: xanh/vàng/đỏ với mốc 30 và 7 ngày', () => {
  const t = (han) => trangThai({ han }, null, HOM);
  assert.equal(t('2026-12-31').mau, 'xanh');
  assert.equal(t('2026-11-04').mau, 'vang'); // 30 ngày
  assert.equal(t('2026-11-05').mau, 'xanh'); // 31 ngày
  assert.equal(t('2026-10-12').mau, 'do'); // 7 ngày
  assert.equal(t('2026-10-13').mau, 'vang'); // 8 ngày
  assert.equal(t('2026-10-05').mau, 'do'); assert.equal(t('2026-10-05').nhan, 'Hạn là hôm nay');
  assert.equal(t('2026-10-01').nhan, 'Quá hạn 4 ngày'); assert.equal(t('2026-10-01').mau, 'do');
  assert.equal(t('2026-10-06').nhan, 'Còn 1 ngày');
  assert.equal(trangThai({}, null, HOM).mau, 'xam');
});
test('hạn bảo dưỡng theo thời gian từ lần cuối', () => {
  const hen = { ngayLanCuoi: '2026-04-05', chuKyThang: 6 };
  assert.equal(hanNgay(hen), '2026-10-05');
  assert.equal(trangThai(hen, null, HOM).mau, 'do');
  assert.equal(hanNgay({ han: '2027-01-01', ngayLanCuoi: '2026-04-05', chuKyThang: 6 }), '2027-01-01');
});
test('hạn bảo dưỡng theo km, cái nào đến trước thì lấy', () => {
  const xe = { km: 14600 };
  const hen = { kmLanCuoi: 10000, chuKyKm: 5000, ngayLanCuoi: '2026-08-01', chuKyThang: 6 };
  assert.equal(hanKm(hen), 15000);
  const t = trangThai(hen, xe, HOM);
  assert.equal(t.conKm, 400); assert.equal(t.mau, 'vang'); // còn 400 km <= max(300, 10% chu kỳ = 500)
  assert.ok(t.nhan.includes('Còn 400 km'));
  assert.equal(trangThai(hen, { km: 15100 }, HOM).mau, 'do');
  assert.ok(trangThai(hen, { km: 15100 }, HOM).nhan.startsWith('Quá 100 km'));
  assert.equal(trangThai(hen, { km: 11000 }, HOM).mau, 'xanh');
});
test('ước km mỗi ngày làm hạn km gấp hơn', () => {
  const xe = { km: 12000 };
  const hen = { kmLanCuoi: 10000, chuKyKm: 5000 }; // còn 3000 km
  assert.equal(trangThai(hen, xe, HOM).mau, 'xanh');
  assert.equal(trangThai(hen, xe, HOM, 20).mau, 'xanh'); // 150 ngày
});
test('ước km mỗi ngày: 15 ngày thành vàng, 5 ngày thành đỏ', () => {
  const xe = { km: 12000 };
  const hen = { kmLanCuoi: 10000, chuKyKm: 5000 };
  assert.equal(trangThai(hen, xe, HOM, 200).mau, 'vang');
  assert.equal(trangThai(hen, xe, HOM, 1000).mau, 'do');
});
test('hạn ngày và km cùng có: lấy mức gấp hơn, ghi cả hai khi cùng mức', () => {
  const xe = { km: 14000 };
  const hen = { kmLanCuoi: 10000, chuKyKm: 5000, han: '2026-10-20' };
  const t = trangThai(hen, xe, HOM);
  assert.equal(t.mau, 'vang');
  assert.ok(t.nhan.includes('15 ngày'));
});
test('mẫu bảo dưỡng theo loại xe', () => {
  const xm = mauBaoDuong({ loai: 'xemay', nhienLieu: 'xang' });
  assert.ok(xm.some((m) => /nhớt/i.test(m.ten) && m.chuKyKm === 2000));
  const dien = mauBaoDuong({ loai: 'oto', nhienLieu: 'dien' });
  assert.ok(!dien.some((m) => /dầu động cơ/i.test(m.ten)));
  const ds = mauBaoDuong({ loai: 'oto', nhienLieu: 'diesel' });
  assert.equal(ds[0].chuKyKm, 7500);
  const xg = mauBaoDuong({ loai: 'oto', nhienLieu: 'xang' });
  assert.equal(xg[0].chuKyKm, 5000);
});

test('đúng mốc km thì ghi "Đến hạn", không ghi "Quá 0 km"', () => {
  const hen = { kmLanCuoi: 10000, chuKyKm: 5000 };
  const t = trangThai(hen, { km: 15000 }, HOM);
  assert.equal(t.mau, 'do'); assert.ok(t.nhan.startsWith('Đến hạn')); assert.ok(!t.nhan.includes('Quá 0'));
  assert.ok(trangThai(hen, { km: 15001 }, HOM).nhan.startsWith('Quá 1 km'));
});
