import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/quick.js';

const { parseQuick, aisleOf } = globalThis.F9;
const TODAY = '2026-10-05'; // thứ hai
const KIDS = [{ id: 'k1', name: 'Mía' }, { id: 'k2', name: 'Bách' }, { id: 'k3', name: 'Mai' }];
const P = (s, extra) => parseQuick(s, { today: TODAY, kids: KIDS, ...(extra || {}) });

test('câu mẫu của chủ sản phẩm: lớp học thêm hằng tuần vào thứ 7', () => {
  const r = P('Toán tư duy thứ 7 9:30 Mía');
  assert.equal(r.title, 'Toán tư duy');
  assert.deepEqual(r.kidIds, ['k1']);
  assert.equal(r.start, '09:30');
  assert.equal(r.day, '2026-10-10');
  assert.equal(r.recType, 'weekly');
  assert.deepEqual(r.recDays, [6]);
  assert.equal(r.kind, 'hoc_them');
});

test('giờ nhiều kiểu: 9h30, 16h, 5 giờ chiều, 7 giờ rưỡi tối, khoảng giờ', () => {
  assert.equal(P('Piano 9h30').start, '09:30');
  assert.equal(P('Đón 16h').start, '16:00');
  assert.equal(P('Họp 5 giờ chiều').start, '17:00');
  assert.equal(P('Ăn tối 7 giờ rưỡi tối').start, '19:30');
  const r = P('Bóng rổ 8:00-9:30 chủ nhật');
  assert.equal(r.start, '08:00'); assert.equal(r.end, '09:30');
  assert.equal(r.day, '2026-10-11');
  assert.equal(r.recType, 'weekly');
});

test('ngày tương đối: hôm nay, ngày mai, ngày kia; thứ trùng hôm nay là hôm nay', () => {
  assert.equal(P('Khám răng ngày mai 14h Bách').day, '2026-10-06');
  assert.equal(P('Họp phụ huynh ngày kia 19:30').day, '2026-10-07');
  assert.equal(P('Học bơi hôm nay 15:30').day, '2026-10-05');
  assert.equal(P('Họp phụ huynh thứ 2 8h').day, '2026-10-05');
});

test('khám bệnh một lần có nơi, không bị coi là lặp hằng tuần', () => {
  const r = P('Khám răng thứ 6 14h Bách ở Nha khoa Nụ Cười');
  assert.equal(r.kind, 'kham');
  assert.equal(r.recType, 'none');
  assert.equal(r.day, '2026-10-09');
  assert.equal(r.location, 'Nha khoa Nụ Cười');
  assert.equal(r.title, 'Khám răng');
  assert.deepEqual(r.kidIds, ['k2']);
});

test('lặp theo từ khóa: mỗi tuần, hằng ngày, mỗi thứ 4', () => {
  assert.equal(P('Họp nhóm mỗi tuần thứ 4 20h').recType, 'weekly');
  assert.equal(P('Uống thuốc hằng ngày 8h').recType, 'daily');
  const r = P('Dọn nhà mỗi thứ 4 và thứ 6');
  assert.equal(r.recType, "weekly"); assert.deepEqual(r.recDays, [3, 5]);
});

test('sinh nhật hằng năm dương lịch, giỗ hằng năm âm lịch', () => {
  const sn = P('Sinh nhật Bách 12/10');
  assert.equal(sn.recType, 'yearly'); assert.equal(sn.allDay, true); assert.equal(sn.day, '2026-10-12'); assert.equal(sn.kind, 'ngay_quan_trong');
  const gio = P('Giỗ ông nội 20/8 âm lịch');
  assert.equal(gio.recType, 'yearly_lunar'); assert.equal(gio.lunarDay, 20); assert.equal(gio.lunarMonth, 8); assert.equal(gio.allDay, true);
  assert.equal(gio.title, 'Giỗ ông nội');
});

test('ngày đã qua trong năm thì hiểu là năm sau; ngày đầy đủ giữ nguyên năm', () => {
  assert.equal(P('Tiêm phòng 3/2 9h').day, '2027-02-03');
  assert.equal(P('Thi cuối kỳ 20/12/2026').day, '2026-12-20');
  assert.equal(P('Thi 31/2').day, null);
});

test('tên con trùng từ chỉ ngày (Mai) không bị hiểu nhầm; cả hai bé', () => {
  const r = P('Piano Mai thứ 3 17h');
  assert.deepEqual(r.kidIds, ['k3']); assert.equal(r.day, '2026-10-06'); assert.equal(r.title, 'Piano');
  const hai = P('Đi bơi cả hai bé chủ nhật 8h');
  assert.deepEqual(hai.kidIds, ['k1', 'k2', 'k3']);
});

test('chuỗi rỗng, chỉ có chữ, chỉ có số không gây lỗi', () => {
  assert.equal(P('').title, ''); assert.equal(P('   ').day, null);
  const r = P('Mua sách'); assert.equal(r.title, 'Mua sách'); assert.equal(r.day, null); assert.equal(r.start, null);
  assert.equal(P('Lớp 4B 2 con').start, null);
});

test('thuần hàm: cùng đầu vào cho cùng kết quả, không đổi đầu vào', () => {
  const kids = [{ id: 'a', name: 'Na' }]; const copy = JSON.stringify(kids);
  const a = parseQuick('Vẽ thứ 5 16h Na', { today: TODAY, kids }); const b = parseQuick('Vẽ thứ 5 16h Na', { today: TODAY, kids });
  assert.deepEqual(a, b); assert.equal(JSON.stringify(kids), copy);
});

test('nhóm đi chợ theo khu quầy', () => {
  assert.equal(aisleOf('Cà chua'), 'Rau củ quả');
  assert.equal(aisleOf('Thịt bò'), 'Thịt cá');
  assert.equal(aisleOf('Sữa tươi'), 'Sữa, trứng');
  assert.equal(aisleOf('Trứng gà'), 'Sữa, trứng');
  assert.equal(aisleOf('Bột giặt'), 'Gia dụng');
  assert.equal(aisleOf('Bánh mì'), 'Bánh, đồ khô');
  assert.equal(aisleOf('Nước giặt'), 'Gia dụng');
  assert.equal(aisleOf('Cà phê'), 'Bánh, đồ khô');
  assert.equal(aisleOf('Xyz lạ'), 'Khác');
});
