// Đơn vị (không cần CSDL): bảng WHO, phần trăm, nội suy theo tháng tuổi, lịch tiêm theo tuổi, ngưỡng, ma trận quyền.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lmsAt, zOf, valueAtZ, placeOf, percentOf, ageMonths, curves, analyze, explain, Z_FOR } from '../src/health/who.js';
import { scheduleFor, addMonths, vaccineView, tcmr } from '../src/health/vaccines.js';
import { classifyBp, classifyGlucose } from '../src/health/thresholds.js';
import { accessLevel, sections } from '../src/health/access.js';

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('bảng WHO: trung vị (M) tại 12 tháng khớp bảng chính thức', () => {
  near(lmsAt('wfa', 'nam', 12).M, 9.6479, 1e-4); // cân nặng bé trai 12 tháng
  near(lmsAt('wfa', 'nu', 12).M, 8.9481, 1e-4);
  near(lmsAt('lhfa', 'nam', 12).M, 75.7488, 1e-4); // chiều dài bé trai 12 tháng
  near(lmsAt('lhfa', 'nu', 12).M, 74.015, 1e-4);
  near(lmsAt('hcfa', 'nam', 12).M, 46.0661, 1e-4);
  near(lmsAt('bfa', 'nam', 12).M, 16.7981, 1e-4);
  near(lmsAt('wfa', 'nam', 0).M, 3.3464, 1e-4); // lúc sinh
  near(lmsAt('bfa', 'nam', 61).M, 15.2641, 1e-4); // 5 tuổi 1 tháng (bộ 5-19)
});

test('phần trăm: đúng trung vị thì 50, đúng ngưỡng z thì 3/15/85/97', () => {
  const p = placeOf('wfa', 'nam', 12, 9.6479);
  near(p.pct, 50, 0.1); near(p.z, 0, 0.01);
  const lms = lmsAt('wfa', 'nam', 12);
  near(percentOf(zOf(valueAtZ(lms, Z_FOR.p3), lms)), 3.0, 0.05);
  near(percentOf(zOf(valueAtZ(lms, Z_FOR.p15), lms)), 15.0, 0.1);
  near(percentOf(zOf(valueAtZ(lms, Z_FOR.p85), lms)), 85.0, 0.1);
  near(percentOf(zOf(valueAtZ(lms, Z_FOR.p97), lms)), 97.0, 0.05);
  // -2 SD của bé trai 12 tháng theo bảng WHO là khoảng 7.7 kg (z-score table: SD2neg = 7.7)
  near(valueAtZ(lms, -2), 7.7, 0.05);
  assert.equal(placeOf('wfa', 'nam', 12, 5).band, 'thap');
  assert.equal(placeOf('wfa', 'nam', 12, 14).band, 'cao');
});

test('nội suy theo tháng tuổi giữa hai dòng', () => {
  const a = lmsAt('wfa', 'nam', 6); const b = lmsAt('wfa', 'nam', 7); const m = lmsAt('wfa', 'nam', 6.5);
  near(m.M, (a.M + b.M) / 2, 1e-9); near(m.S, (a.S + b.S) / 2, 1e-9);
});

test('ngoài vùng có chuẩn thì trả null, không bịa', () => {
  assert.equal(lmsAt('wfa', 'nam', 61), null); // cân nặng theo tuổi: không có sau 5 tuổi
  assert.equal(lmsAt('hcfa', 'nu', 70), null);
  assert.equal(lmsAt('lhfa', 'nam', -1), null);
  assert.equal(lmsAt('lhfa', 'nam', 230), null);
  assert.ok(lmsAt('lhfa', 'nam', 150)); // chiều cao 12 tuổi có (bộ 5-19)
  assert.equal(lmsAt('wfa', 'khac', 12), null);
  assert.equal(placeOf('wfa', 'nam', 12, 0), null);
});

test('tuổi tính theo tháng và phân tích tăng trưởng: ẩn đường chuẩn ngoài độ tuổi và nói rõ', () => {
  near(ageMonths('2025-10-05', '2026-10-05'), 12, 0.05);
  const r = analyze({ sex: 'nam', birthDate: '2025-10-05', today: '2026-10-05', measures: [
    { day: '2026-04-05', kind: 'weight', v1: '7.6' }, { day: '2026-10-05', kind: 'weight', v1: '9.6' }, { day: '2026-10-05', kind: 'height', v1: '75.7' }] });
  assert.ok(r.ready);
  assert.equal(r.indicators.weight.points.length, 2);
  near(r.indicators.weight.last.place.pct, 49, 3);
  assert.ok(r.indicators.bmi, 'có BMI từ cân nặng + chiều cao cùng ngày');
  assert.match(r.indicators.weight.last.text, /tham khảo/);
  assert.match(r.indicators.weight.last.text, /không phải chẩn đoán/);
  const old = analyze({ sex: 'nu', birthDate: '2018-01-01', today: '2026-10-05', measures: [{ day: '2026-10-01', kind: 'weight', v1: '25' }, { day: '2026-10-01', kind: 'height', v1: '128' }] });
  assert.equal(old.indicators.weight.last.place, null);
  assert.match(old.indicators.weight.note, /WHO không có đường chuẩn/);
  assert.ok(old.indicators.height.last.place, 'chiều cao 8 tuổi có chuẩn 5-19');
  assert.equal(analyze({ sex: null, birthDate: null, measures: [], today: '2026-10-05' }).ready, false);
  assert.match(explain('Cân nặng', placeOf('wfa', 'nam', 12, 5)), /bác sĩ nhi/);
});

test('đường chuẩn có 5 đường tăng dần và chỉ trong độ tuổi có bảng', () => {
  const c = curves('wfa', 'nam', 0, 80);
  assert.equal(c.p50.length, 61); // 0..60
  for (let i = 0; i < c.p50.length; i++) assert.ok(c.p3[i][1] < c.p15[i][1] && c.p15[i][1] < c.p50[i][1] && c.p50[i][1] < c.p85[i][1] && c.p85[i][1] < c.p97[i][1]);
});

test('dữ liệu WHO ghi nguồn và ngày tra cứu', () => {
  for (const k of ['wfa', 'lhfa', 'hcfa', 'bfa']) {
    const d = JSON.parse(fs.readFileSync(new URL(`../data/who-${k}.json`, import.meta.url), 'utf8'));
    assert.match(d.source, /who\.int/); assert.match(d.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(d.sets.nam.std.length, 61); assert.equal(d.sets.nu.std.length, 61);
  }
});

test('lịch tiêm theo tuổi: mốc tháng, khoảng cách tối thiểu 28 ngày, ngày cuối tháng', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2025-12-15', 2), '2026-02-15');
  const s = Object.fromEntries(scheduleFor('2026-01-31').map((d) => [d.code, d]));
  assert.equal(s.vgb0.dueDate, '2026-01-31');
  assert.equal(s.dpt1.dueDate, '2026-03-31');
  assert.equal(s.dpt2.dueDate, '2026-04-30');
  assert.equal(s.ipv1.dueDate, '2026-06-30');
  assert.equal(s.soi9.dueDate, '2026-10-31');
  assert.equal(s.mr18.dueDate, '2027-07-31');
  assert.equal(s.td7.dueDate, '2033-01-31');
  assert.equal(s.jev2.dueDate, '2027-02-14'); // 14 ngày sau mũi 1 (12 tháng = 2027-01-31)
  assert.equal(s.jev3.dueDate, '2028-01-31');
  for (const [a, b] of [['dpt1', 'dpt2'], ['dpt2', 'dpt3'], ['opv1', 'opv2'], ['rota1', 'rota2']]) {
    assert.ok((Date.parse(s[b].dueDate) - Date.parse(s[a].dueDate)) / 86400000 >= 28, `${a}->${b}`);
  }
  assert.equal(scheduleFor('2026-10-05').length, tcmr().doses.length);
  assert.match(tcmr().legal, /10\/2024\/TT-BYT/);
});

test('trạng thái mũi tiêm và ngày sớm nhất khi mũi trước tiêm muộn', () => {
  const rows = [
    { id: '1', code: 'dpt1', name: 'x', dose_no: 1, due_date: '2026-03-31', done_on: '2026-04-20', note: '' },
    { id: '2', code: 'dpt2', name: 'x', dose_no: 2, due_date: '2026-04-30', done_on: null, note: '' },
    { id: '3', code: 'soi9', name: 'y', dose_no: 1, due_date: '2026-10-31', done_on: null, note: '' },
    { id: '4', code: 'ipv2', name: 'z', dose_no: 2, due_date: '2026-12-31', done_on: null, note: '' },
  ];
  const v = Object.fromEntries(vaccineView(rows, '2026-10-20').map((x) => [x.code, x]));
  assert.equal(v.dpt1.status, 'done');
  assert.equal(v.dpt2.status, 'overdue'); assert.equal(v.dpt2.earliest, '2026-05-18');
  assert.equal(v.soi9.status, 'soon');
  assert.equal(v.ipv2.status, 'later');
});

test('ngưỡng tham khảo huyết áp và đường huyết, cảnh báo nặng', () => {
  assert.equal(classifyBp(118, 76).level, 'ok');
  assert.equal(classifyBp(135, 80).level, 'high_mild');
  assert.equal(classifyBp(145, 85).level, 'high');
  assert.equal(classifyBp(128, 92).level, 'high');
  assert.equal(classifyBp(85, 55).level, 'low');
  assert.equal(classifyBp(190, 100).level, 'severe_high'); assert.ok(classifyBp(190, 100).emergency);
  assert.equal(classifyGlucose(5.2, 'doi').level, 'ok');
  assert.equal(classifyGlucose(6.5, 'doi').level, 'high_mild');
  assert.equal(classifyGlucose(7.2, 'doi').level, 'high');
  assert.equal(classifyGlucose(8.5, 'sau_an').level, 'high_mild');
  assert.equal(classifyGlucose(11.5, 'sau_an').level, 'high');
  assert.equal(classifyGlucose(3.5, 'doi').level, 'low');
  assert.ok(classifyGlucose(2.5, 'doi').emergency);
  assert.ok(classifyGlucose(20, 'khac').emergency);
});

test('ma trận quyền xem hồ sơ sức khỏe (đơn vị)', () => {
  const chu = { id: 'chu', role: 'chu' }; const ql = { id: 'ql', role: 'quan_ly' }; const tv = { id: 'tv', role: 'thanh_vien' }; const tv2 = { id: 'tv2', role: 'thanh_vien' };
  const con1 = { id: 'c1', role: 'con', childIds: ['k1'] }; const con2 = { id: 'c2', role: 'con', childIds: ['k2'] };
  const kid = { child_id: 'k1', member_id: null, shared_with: ['tv'], linked_user_id: 'u1' };
  assert.equal(accessLevel(chu, kid), 'manage'); assert.equal(accessLevel(ql, kid), 'manage');
  assert.equal(accessLevel(tv, kid), 'write'); assert.equal(accessLevel(tv2, kid), null);
  assert.equal(accessLevel(con1, kid), 'limited'); assert.equal(accessLevel(con2, kid), null);
  assert.equal(accessLevel({ ...con1, childIds: [] }, kid), null);
  // người lớn có tài khoản: riêng tư
  const adult = { child_id: null, member_id: 'tv2', shared_with: ['tv'], has_account: true };
  assert.equal(accessLevel(tv2, adult), 'manage');
  assert.equal(accessLevel(tv, adult), 'view');
  assert.equal(accessLevel(chu, adult), null, 'chủ không tự động thấy hồ sơ người lớn có tài khoản');
  assert.equal(accessLevel(ql, adult), null);
  assert.equal(accessLevel(con1, adult), null);
  // người lớn chưa có tài khoản (ông bà nhập hộ): chủ/quản lý quản lý hộ
  const ongba = { child_id: null, member_id: 'ob', shared_with: [], has_account: false };
  assert.equal(accessLevel(chu, ongba), 'manage'); assert.equal(accessLevel(ql, ongba), 'manage');
  assert.equal(accessLevel(tv, ongba), null); assert.equal(accessLevel(con1, ongba), null);
  // phần dữ liệu theo mức
  const lim = sections('limited');
  assert.ok(lim.growth && lim.vaccines && !lim.meds && !lim.visits && !lim.vitals && !lim.write && !lim.notes);
  assert.ok(sections('view').meds && !sections('view').write);
  assert.ok(sections('write').write && !sections('write').manage);
  assert.ok(sections('manage').manage);
});
