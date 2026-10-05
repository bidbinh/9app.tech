import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dishIx, ingIx } from './helper.js';
import { toBase } from '../src/shopping.js';

// RÀ SOÁT ĐỐI CHIẾU: khối lượng nguyên liệu chính của 36 món so với công thức trong nguồn đã tra cứu (2026-10-04).
// Mỗi dòng: [món, nguyên liệu, lượng trong nguồn, đơn vị, hệ số suất (nguồn/4 suất), khóa nguồn, ghi chú].
// "Lượng trong nguồn" lấy từ phần nguyên liệu mà công cụ tìm kiếm trả về (tóm tắt), không phải bản chép toàn trang.
// Dung sai: lượng của ta nằm trong ±50% so với lượng quy về 4 suất; sai lệch lớn hơn phải được giải thích trong NOTES bên dưới.
import { AUDIT, NOTES } from '../tools/audit-table.js';



test('rà soát đối chiếu ≥ 30 món với nguồn: khối lượng nguyên liệu chính nằm trong ±50%', () => {
  const dishesChecked = new Set(AUDIT.map((r) => r[0]));
  assert.ok(dishesChecked.size >= 30, 'chỉ đối chiếu ' + dishesChecked.size + ' món');
  assert.ok(NOTES.length === 2);
  const bad = [];
  for (const [dishId, ingId, refQty, refUnit, scale, srcKey] of AUDIT) {
    const dish = dishIx.get(dishId);
    assert.ok(dish, dishId);
    const ing = ingIx.get(ingId);
    assert.ok(ing, ingId);
    const line = dish.ingredients.find((i) => i.id === ingId);
    assert.ok(line, dishId + ' không có ' + ingId);
    const mineBase = toBase(ing, line.qty, line.unit); // lượng cho servingsBase của món
    const ref = toBase(ing, refQty, refUnit) * scale;
    const dev = (mineBase - ref) / ref;
    // món ăn dặm: khẩu phần là 1 suất bé, so thẳng
    if (Math.abs(dev) > 0.5) bad.push(dishId + '/' + ingId + ': ta ' + Math.round(mineBase) + ' vs nguồn ' + Math.round(ref) + ' (' + Math.round(dev * 100) + '%) [' + srcKey + ']');
    assert.ok(dish.sources.some((s) => s.url.length > 0), dishId);
  }
  assert.deepEqual(bad, [], 'sai lệch > 50%:\n' + bad.join('\n'));
});

test('mỗi dòng rà soát dẫn tới nguồn có thật, và nguồn đó được ghi ở món', () => {
  const reg = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8')).sources;
  for (const [dishId, , , , , srcKey] of AUDIT) {
    const dish = dishIx.get(dishId);
    assert.ok(reg[srcKey], 'không có nguồn ' + srcKey + ' trong data/sources.json');
    assert.ok(reg[srcKey].url.startsWith('http'));
    assert.ok(dish.sources.some((s) => s.url === reg[srcKey].url), dishId + ' chưa ghi nguồn ' + srcKey);
  }
});
