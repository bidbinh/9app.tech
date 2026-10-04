import test from 'node:test';
import assert from 'node:assert/strict';
import { ID_SIZES, SHEETS, mmToPx, cropRect, layoutSheet } from '../js/idlayout.js';

test('mmToPx: 3x4 cm ở 300 dpi = 354x472', () => {
  assert.equal(mmToPx(ID_SIZES['3x4'].w), 354);
  assert.equal(mmToPx(ID_SIZES['3x4'].h), 472);
  assert.equal(mmToPx(ID_SIZES['4x6'].w), 472);
  assert.equal(mmToPx(ID_SIZES['4x6'].h), 709);
});

test('cropRect: đúng tỉ lệ, nằm trong ảnh, kẹp theo biên', () => {
  const r = cropRect(1000, 800, 3 / 4, 1);
  assert.ok(Math.abs(r.w / r.h - 0.75) < 1e-9);
  assert.equal(r.h, 800);
  const z = cropRect(1000, 800, 3 / 4, 2, 5, 5);
  assert.equal(z.x, 0); assert.equal(z.y, 0);
  assert.ok(Math.abs(z.w - 300) < 1e-9);
  const far = cropRect(1000, 800, 3 / 4, 2, 5000, 5000);
  assert.ok(far.x + far.w <= 1000 + 1e-9 && far.y + far.h <= 800 + 1e-9);
  const wide = cropRect(400, 1000, 2 / 3, 1);
  assert.equal(wide.w, 400);
});

test('layoutSheet: tờ 10x15 cm với ảnh 3x4 xếp được 6 tấm không chồng nhau, nằm trong tờ', () => {
  const sheet = SHEETS['10x15'], photo = ID_SIZES['3x4'];
  const L = layoutSheet(sheet, photo, { gap: 2, margin: 5 });
  assert.ok(L.max >= 6, `max ${L.max}`);
  assert.equal(L.positions.length, L.count);
  for (const p of L.positions) {
    assert.ok(p.x >= 5 - 1e-9 && p.y >= 5 - 1e-9);
    assert.ok(p.x + L.pw <= sheet.w - 5 + 1e-9 && p.y + L.ph <= sheet.h - 5 + 1e-9);
  }
  for (let i = 0; i < L.positions.length; i++) for (let j = i + 1; j < L.positions.length; j++) {
    const a = L.positions[i], b = L.positions[j];
    const overlap = a.x < b.x + L.pw && b.x < a.x + L.pw && a.y < b.y + L.ph && b.y < a.y + L.ph;
    assert.equal(overlap, false);
  }
});

test('layoutSheet: giới hạn số bản và A4 chứa nhiều hơn', () => {
  const L4 = layoutSheet(SHEETS.A4, ID_SIZES['3x4'], { copies: 8 });
  assert.equal(L4.count, 8);
  const all = layoutSheet(SHEETS.A4, ID_SIZES['3x4']);
  assert.ok(all.max >= 30, `max ${all.max}`);
  const six = layoutSheet(SHEETS['10x15'], ID_SIZES['4x6']);
  assert.ok(six.max >= 2);
  const over = layoutSheet(SHEETS['10x15'], ID_SIZES['3x4'], { copies: 100 });
  assert.equal(over.count, over.max);
});
