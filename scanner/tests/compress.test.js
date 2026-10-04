import test from 'node:test';
import assert from 'node:assert/strict';
import { fitToBudget, parseSize, formatSize, budgetTarget } from '../js/compress.js';

// Mô hình dung lượng: tỉ lệ với (scale^2) và tăng theo quality (hàm mũ nhẹ), như JPEG thật
const model = (base) => (s, q) => Math.round(base * s * s * (0.12 + 0.88 * Math.pow(q, 2.2)));

test('parseSize hiểu KB/MB, dấu phẩy thập phân, không đơn vị = KB', () => {
  assert.equal(parseSize('500 KB'), 512000);
  assert.equal(parseSize('1,5 MB'), 1572864);
  assert.equal(parseSize('2mb'), 2097152);
  assert.equal(parseSize('300'), 307200);
  assert.equal(parseSize(1000), 1000);
  assert.equal(parseSize('abc'), null);
  assert.equal(parseSize('0'), null);
  assert.equal(parseSize(''), null);
});

test('formatSize', () => {
  assert.equal(formatSize(500), '500 B');
  assert.equal(formatSize(2048), '2 KB');
  assert.equal(formatSize(1572864), '1,50 MB');
  assert.equal(formatSize(5 * 1073741824), '5,0 GB');
});

test('đủ nhỏ ngay ở chất lượng cao thì giữ nguyên chất lượng và độ phân giải', async () => {
  const r = await fitToBudget(model(1_000_000), 2_000_000);
  assert.equal(r.scale, 1); assert.ok(r.quality >= 0.92 - 1e-9); assert.ok(r.ok);
});

test('luôn nằm trong giới hạn và dùng gần hết ngân sách (không nén thừa)', async () => {
  for (const target of [900_000, 500_000, 300_000, 150_000]) {
    const m = model(2_500_000);
    const r = await fitToBudget(m, target);
    assert.ok(r.ok, `target ${target}`);
    assert.ok(r.size <= target, `${r.size} > ${target}`);
    assert.equal(r.size, m(r.scale, r.quality));
    assert.ok(r.size > target * 0.7, `nén thừa: ${r.size} so với ${target}`);
  }
});

test('giới hạn rất nhỏ: thu nhỏ độ phân giải, chất lượng không xuống dưới sàn', async () => {
  const r = await fitToBudget(model(2_500_000), 60_000);
  assert.ok(r.ok);
  assert.ok(r.scale < 0.6, `scale ${r.scale}`);
  assert.ok(r.quality >= 0.15 - 1e-9);
});

test('không thể đạt: trả ok=false với cài đặt nhỏ nhất', async () => {
  const r = await fitToBudget(model(50_000_000), 1000);
  assert.equal(r.ok, false);
  assert.equal(r.scale, 0.12);
});

test('số lần đo bị chặn (hiệu năng trên điện thoại)', async () => {
  const r = await fitToBudget(model(3_000_000), 400_000);
  assert.ok(r.tries <= 30, `tries ${r.tries}`);
});

test('giới hạn 30/60/100/150/200 KB với 1, 3, 8, 20 trang: luôn <= giới hạn x 1024, hoặc báo ok=false', async () => {
  for (const kb of [30, 60, 100, 150, 200]) {
    for (const pages of [1, 3, 8, 20]) {
      const limit = kb * 1024;
      const base = model(400_000 * pages);
      const m = (s, q) => base(s, q) + 1500; // overhead cấu trúc PDF nằm trong phép đo như ở app
      const r = await fitToBudget(m, budgetTarget(limit));
      const real = m(r.scale, r.quality);
      if (r.ok) assert.ok(real <= limit, kb + 'KB x' + pages + ': ' + real + ' > ' + limit);
      else assert.ok(r.size > budgetTarget(limit) * 0.9, 'báo không đạt phải có lý do: ' + kb + 'KB x' + pages);
    }
  }
});

test('budgetTarget = 97% giới hạn và bắt được 101.609 byte vượt 100 KB x 0,97', () => {
  assert.equal(budgetTarget(102400), 99328);
  assert.ok(101609 > budgetTarget(102400));
});

test('parseSize hiểu số kiểu Việt: dấu chấm/phẩy ngăn nghìn khi đúng 3 chữ số sau dấu', () => {
  assert.equal(parseSize('1.500 KB'), 1500 * 1024);
  assert.equal(parseSize('1,500 KB'), 1500 * 1024);
  assert.equal(parseSize('2.048'), 2048 * 1024);
  assert.equal(parseSize('1.500,5 KB'), Math.round(1500.5 * 1024));
  assert.equal(parseSize('1,5 MB'), 1572864);
  assert.equal(parseSize('1.5 MB'), 1572864);
  assert.equal(parseSize('0,5 MB'), 524288);
  assert.equal(parseSize('1 500 KB'), null);
  assert.equal(parseSize('1.2.3 KB'), null);
});

test('MIN_LIMIT_BYTES = 5 KB', async () => {
  const { MIN_LIMIT_BYTES } = await import('../js/compress.js');
  assert.equal(MIN_LIMIT_BYTES, 5120);
});
