// Phần thuần: VietQR, kiểm tra đầu vào, ngày tháng, chồng giờ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, vietQrPayload, transferContent } from '../src/transfer.js';
import * as u from '../src/util.js';
import { overlaps } from '../src/util.js';
import { flagOverlaps } from '../src/schedule.js';
import { feeFor } from '../src/ledger.js';
import { reminderMessage } from '../src/routes/money.js';
import { deviceLabel } from '../src/auth.js';

test('CRC16 CCITT-FALSE đúng vector chuẩn', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('VietQR: payload có CRC hợp lệ, đủ trường, số tiền và nội dung', () => {
  const p = vietQrPayload({ bin: '970436', account: '0011004012345', amount: 450000, content: '9TABC234' });
  assert.equal(crc16(p.slice(0, -4)), p.slice(-4));
  assert.ok(p.startsWith('000201010212'));
  assert.ok(p.includes('5303704'));
  assert.ok(p.includes('540645' + '0000'));
  assert.ok(p.includes('0010A000000727'));
  assert.ok(p.includes('970436') && p.includes('0011004012345'));
  assert.ok(p.includes('0808' + '9TABC234'));
  // không số tiền: mã tĩnh (11), không có trường 54
  const q = vietQrPayload({ bin: '970436', account: '123456', content: '9TX' });
  assert.ok(q.startsWith('000201010211'));
  assert.ok(!q.includes('5406'));
  assert.equal(crc16(q.slice(0, -4)), q.slice(-4));
});

test('nội dung chuyển khoản: không dấu, chữ hoa, không chứa tên, ≤ 25 ký tự', () => {
  assert.equal(transferContent('abc-234'), '9TABC234');
  assert.ok(transferContent('x'.repeat(100)).length <= 25);
  assert.equal(transferContent('Đặng Việt'), '9TDANGVIET');
});

test('cleanText: bỏ ký tự điều khiển và ký tự đảo chiều, gộp khoảng trắng, giới hạn độ dài', () => {
  assert.equal(u.cleanText('  An   ‮\u0007 Bình \n', { max: 50 }), 'An Bình');
  assert.throws(() => u.cleanText('x'.repeat(61), { max: 60, field: 'Tên' }), /tối đa 60/);
  assert.throws(() => u.cleanText('   ', { max: 60, min: 1, field: 'Tên' }), /không được để trống/);
  assert.throws(() => u.cleanText(123, { max: 60 }));
  assert.throws(() => u.cleanText({ a: 1 }, { max: 60 }));
  assert.equal(u.cleanText('a\n\n\n\nb\r\nc', { max: 50, multiline: true }), 'a\n\nb\nc');
  assert.equal([...u.cleanText('😀'.repeat(5), { max: 5 })].length, 5);
});

test('cleanDay: ngày thật mới được nhận', () => {
  assert.equal(u.cleanDay('2026-10-04'), '2026-10-04');
  for (const bad of ['2026-02-31', '2026-13-01', '2026-1-1', '26-10-04', '', null, 20261004, '2026-10-04T00:00', '1999-01-01', '2101-01-01']) assert.throws(() => u.cleanDay(bad), /Ngày/, String(bad));
  assert.equal(u.cleanDay('2028-02-29'), '2028-02-29');
  assert.throws(() => u.cleanDay('2027-02-29'));
});

test('cleanMonth, monthRange, addMonths', () => {
  assert.equal(u.cleanMonth('2026-10'), '2026-10');
  assert.throws(() => u.cleanMonth('2026-13'));
  assert.throws(() => u.cleanMonth('2026-1'));
  assert.deepEqual(u.monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28', nextFrom: '2026-03-01' });
  assert.deepEqual(u.monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29', nextFrom: '2028-03-01' });
  assert.equal(u.monthRange('2026-12').to, '2026-12-31');
  assert.equal(u.addMonths('2026-01', -1), '2025-12');
  assert.equal(u.addMonths('2026-10', -5), '2026-05');
  assert.equal(u.addMonths('2026-11', 14), '2028-01');
});

test('thứ ISO và todayVN theo giờ Việt Nam', () => {
  assert.equal(u.isoWeekday('2026-10-04'), 7); // chủ nhật
  assert.equal(u.isoWeekday('2026-10-05'), 1);
  assert.equal(u.isoWeekday('2026-10-10'), 6);
  // 17:30 UTC ngày 3 là 00:30 ngày 4 ở Việt Nam
  assert.equal(u.todayVN(Date.parse('2026-10-03T17:30:00Z')), '2026-10-04');
  assert.equal(u.todayVN(Date.parse('2026-10-03T16:59:00Z')), '2026-10-03');
  assert.equal(u.addDays('2026-12-31', 1), '2027-01-01');
});

test('số điện thoại: chuẩn hóa, từ chối rác, đổi sang dạng quốc tế', () => {
  assert.equal(u.cleanPhone('0912 345.678'), '0912345678');
  assert.equal(u.cleanPhone(''), '');
  assert.throws(() => u.cleanPhone('abc'));
  assert.throws(() => u.cleanPhone('12'));
  assert.throws(() => u.cleanPhone('1'.repeat(20)));
  assert.equal(u.intlPhone('0912345678'), '84912345678');
  assert.equal(u.intlPhone('+84912345678'), '84912345678');
  assert.equal(u.intlPhone('84912345678'), '84912345678');
  assert.equal(u.intlPhone(''), '');
});

test('intIn: chỉ nhận số nguyên an toàn trong khoảng, chuỗi số cũng được', () => {
  assert.equal(u.intIn('200000', { min: 0, max: 1e9 }), 200000);
  for (const bad of [-1, 1.5, '1e3', NaN, Infinity, 1e12, '', null, undefined, {}, [], '12abc', true]) assert.throws(() => u.intIn(bad, { min: 0, max: 1e9, field: 'X' }), String(bad));
});

test('cleanBank: đủ ba phần hoặc trống hết', () => {
  assert.deepEqual(u.cleanBank({ bin: '970436', account: '0011 0040.12345', holder: ' nguyen van a ' }), { bin: '970436', account: '0011004012345', holder: 'nguyen van a' });
  assert.deepEqual(u.cleanBank({ bin: '', account: '', holder: '' }), { bin: null, account: null, holder: null });
  assert.throws(() => u.cleanBank({ bin: '970436', account: '', holder: 'A' }));
  assert.throws(() => u.cleanBank({ bin: '12', account: '123456', holder: 'A' }));
  assert.throws(() => u.cleanBank({ bin: '970436', account: '12', holder: 'A' }));
  assert.throws(() => u.cleanBank('x'));
});

test('mã khôi phục: 25 ký tự chia 5 nhóm, chuẩn hóa nhập tay; token 128 bit', () => {
  const c = u.newRecoveryCode();
  assert.match(c, /^([A-HJ-NP-Z2-9]{5}-){4}[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(u.normCode(c.toLowerCase().replace(/-/g, ' ')), c.replace(/-/g, ''));
  assert.notEqual(u.newRecoveryCode(), c);
  assert.match(u.newToken(16), u.TOKEN_RE);
  assert.match(u.newPairCode(), /^[A-HJ-NP-Z2-9]{12}$/);
});

test('chồng giờ: kề nhau không tính là trùng', () => {
  assert.equal(overlaps(480, 60, 540, 60), false);
  assert.equal(overlaps(480, 60, 539, 60), true);
  assert.equal(overlaps(480, 60, 420, 60), false);
  assert.equal(overlaps(480, 60, 450, 60), true);
  assert.equal(overlaps(480, 120, 500, 10), true);
});

test('flagOverlaps: chỉ buổi chưa hủy trong cùng ngày mới trùng', () => {
  const L = (id, day, s, d, st = 'du_kien') => ({ id, day, startMin: s, durationMin: d, status: st });
  const list = flagOverlaps([L(1, 'd1', 480, 60), L(2, 'd1', 500, 60), L(3, 'd1', 480, 60, 'gs_huy'), L(4, 'd2', 480, 60), L(5, 'd1', 540, 30)]);
  assert.deepEqual(list.map((l) => l.overlap), [true, true, false, false, true]);
});

test('học phí một buổi theo mô hình', () => {
  assert.deepEqual(feeFor({ fee_model: 'buoi', fee_amount: 200000 }), { billing: 'buoi', fee: 200000 });
  assert.deepEqual(feeFor({ fee_model: 'buoi', fee_amount: 200000 }, 150000), { billing: 'buoi', fee: 150000 });
  assert.deepEqual(feeFor({ fee_model: 'thang', fee_amount: 2000000 }), { billing: 'thang', fee: 0 });
  assert.deepEqual(feeFor({ fee_model: 'goi', fee_amount: 2000000 }, 5), { billing: 'goi', fee: 0 });
});

test('tin nhắc học phí: nêu đúng số, tài khoản và nội dung; không nhắc chuyển khoản khi không còn nợ', () => {
  const st = { name: 'Minh', subject: 'Toán', parent_name: 'Hoa' };
  const tutor = { bank_bin: '970436', bank_account: '0011004012345', bank_holder: 'NGUYEN VAN A' };
  const m1 = reminderMessage(st, tutor, { total: 1000000, paid: 400000, balance: 600000 }, '9TABC234');
  assert.match(m1, /anh\/chị Hoa/); assert.match(m1, /600\.000đ/); assert.match(m1, /Vietcombank/); assert.match(m1, /0011004012345/); assert.match(m1, /9TABC234/);
  const m2 = reminderMessage(st, tutor, { total: 1000000, paid: 1000000, balance: 0 }, '9TABC234');
  assert.ok(!/chuyển khoản/.test(m2)); assert.match(m2, /đủ/);
  const m3 = reminderMessage(st, tutor, { total: 100, paid: 500000, balance: -499900 }, 'X');
  assert.match(m3, /đóng trước/);
});

test('nhãn thiết bị từ User-Agent', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1'), 'Safari trên iPhone/iPad');
  assert.match(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537'), /Chrome trên Windows/);
  assert.equal(deviceLabel(''), 'Trình duyệt trên Thiết bị');
});
