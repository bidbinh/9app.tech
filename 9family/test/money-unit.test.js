// Đơn vị tiền: bộ phân tích câu gõ, làm tròn VND, tổng hợp theo tháng/danh mục, ngân sách, kỳ tiêu vặt, CSV.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/money-parse.js';
import { roundVnd, fmtVnd, summarize, budgetStatus, allowanceBalance, goalProgress, periodKey, toCsv, csvCell } from '../src/money/calc.js';

const { parseMoney } = globalThis.F9;
const P = (s) => parseMoney(s, { today: '2026-10-05' });

test('câu mẫu: chợ 350k, điện 1tr2, triệu rưỡi', () => {
  let r = P('chợ 350k'); assert.equal(r.amount, 350000); assert.equal(r.category, 'di_cho'); assert.equal(r.note, 'Chợ'); assert.equal(r.day, '2026-10-05');
  r = P('điện 1tr2'); assert.equal(r.amount, 1200000); assert.equal(r.category, 'dien_nuoc');
  r = P('điện nước 1 triệu rưỡi'); assert.equal(r.amount, 1500000);
  r = P('2 triệu rưỡi học phí'); assert.equal(r.amount, 2500000); assert.equal(r.category, 'hoc_hanh');
  r = P('triệu rưỡi tiền nhà'); assert.equal(r.amount, 1500000);
  r = P('1tr250 khám'); assert.equal(r.amount, 1250000); assert.equal(r.category, 'y_te');
  r = P('2,5 triệu sách'); assert.equal(r.amount, 2500000);
});

test('số có dấu chấm ngăn nghìn, đơn vị đ, số bằng chữ, nghìn/ngàn', () => {
  assert.equal(P('Học phí 1.200.000').amount, 1200000);
  assert.equal(P('tiền điện 850.000đ').amount, 850000);
  assert.equal(P('xăng 100 nghìn').amount, 100000);
  assert.equal(P('xăng 100 ngàn').amount, 100000);
  assert.equal(P('ăn trưa năm mươi nghìn').amount, 50000);
  assert.equal(P('đi chợ ba trăm năm mươi nghìn').amount, 350000);
  assert.equal(P('điện một triệu hai').amount, 1200000);
  assert.equal(P('một triệu hai trăm nghìn thuốc').amount, 1200000);
  assert.equal(P('hai triệu rưỡi').amount, 2500000);
  assert.equal(P('1k5 kẹo').amount, 1500);
});

test('số trần dưới 1000 hiểu là nghìn đồng và đánh dấu; số đo (kg, con) không bị nhầm là tiền', () => {
  const a = P('cafe 35'); assert.equal(a.amount, 35000); assert.equal(a.assumed, true); assert.equal(a.category, 'an_uong');
  const b = P('mua 2 kg cam 60k'); assert.equal(b.amount, 60000); assert.equal(b.assumed, false);
  assert.equal(P('2 con cá 120k').amount, 120000);
  assert.equal(P('trà sữa 45.000đ').category, 'an_uong');
  assert.equal(P('nạp điện thoại 100k').category, 'khac');
});

test('ngày: hôm qua, hôm kia, 3/10; không lấy ngày tương lai', () => {
  assert.equal(P('chợ 100k hôm qua').day, '2026-10-04');
  assert.equal(P('chợ 100k hôm kia').day, '2026-10-03');
  assert.equal(P('trà sữa 45k 3/10').day, '2026-10-03');
  assert.equal(P('trà sữa 45k 3/10').amount, 45000);
  assert.equal(P('chợ 100k 20/12').day, '2025-12-20');
});

test('không có số tiền thì ok=false; không lưu nguyên câu nói làm ghi chú', () => {
  assert.equal(P('xin chào').ok, false);
  const r = P('chợ 350k'); assert.ok(!/350/.test(r.note));
  assert.equal(P('').ok, false);
  assert.equal(P('999999999999999 tỷ').ok, false, 'quá trần thì từ chối');
});

test('làm tròn và định dạng VND', () => {
  assert.equal(roundVnd(1234.5), 1235); assert.equal(roundVnd('1.200.000'), 1200000); assert.equal(roundVnd(-1), null); assert.equal(roundVnd(NaN), null); assert.equal(roundVnd(1e15), null);
  assert.equal(fmtVnd(1200000), '1.200.000 đ'); assert.equal(fmtVnd(0), '0 đ'); assert.equal(fmtVnd(999), '999 đ');
});

test('tổng hợp theo tháng và danh mục', () => {
  const rows = [
    { day: '2026-10-01', amount: 350000, category: 'di_cho', who: 'a' }, { day: '2026-10-15', amount: '1200000', category: 'dien_nuoc', who: 'b' },
    { day: '2026-10-31', amount: 50000, category: 'an_uong', who: 'a' }, { day: '2026-09-30', amount: 999, category: 'khac', who: 'a' }, { day: '2026-11-01', amount: 7, category: 'khac', who: 'a' },
    { day: '2026-10-20', amount: 10, category: 'la', who: null },
  ];
  const s = summarize(rows, '2026-10');
  assert.equal(s.total, 350000 + 1200000 + 50000 + 10); assert.equal(s.count, 4);
  assert.equal(s.byCat.di_cho, 350000); assert.equal(s.byCat.dien_nuoc, 1200000); assert.equal(s.byCat.khac, 10);
  assert.equal(s.byWho.a, 400000); assert.equal(s.byWho.khong, 10);
  assert.equal(summarize(rows, '2026-12').total, 0);
});

test('ngân sách: nhẹ nhàng, ba mức', () => {
  assert.equal(budgetStatus(100, 0).level, 'none');
  assert.equal(budgetStatus(500, 1000).level, 'ok');
  assert.equal(budgetStatus(800, 1000).level, 'near');
  const o = budgetStatus(1500, 1000); assert.equal(o.level, 'over'); assert.match(o.text, /vượt ngân sách 500 đ/);
});

test('tiêu vặt: số dư, mục tiêu, khóa kỳ tuần/tháng', () => {
  const log = [{ amount: 50000 }, { amount: -12000 }, { amount: 50000 }, { amount: -3000 }];
  assert.equal(allowanceBalance(log), 85000);
  assert.equal(goalProgress(85000, 200000), 42); assert.equal(goalProgress(500000, 200000), 100); assert.equal(goalProgress(-5, 100), 0); assert.equal(goalProgress(5, 0), null);
  assert.equal(periodKey('2026-10-05', 'thang'), '2026-10');
  assert.equal(periodKey('2026-10-05', 'tuan'), periodKey('2026-10-11', 'tuan'));
  assert.notEqual(periodKey('2026-10-11', 'tuan'), periodKey('2026-10-12', 'tuan'));
  assert.equal(periodKey('2026-01-01', 'tuan'), '2026-W01');
  assert.equal(periodKey('2027-01-01', 'tuan'), '2026-W53');
});

test('CSV: ngoặc kép, xuống dòng và chặn công thức', () => {
  assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('a"b'), '"a""b"'); assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  const csv = toCsv(['Ngày', 'Ghi chú'], [['2026-10-05', '+84 gọi']]);
  assert.ok(csv.startsWith('﻿Ngày,Ghi chú\r\n')); assert.match(csv, /'\+84 gọi/);
});
