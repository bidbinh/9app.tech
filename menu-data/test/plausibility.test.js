import test from 'node:test';
import assert from 'node:assert/strict';
import { data, ingIx } from './helper.js';
import { toBase } from '../src/shopping.js';

const dishes = data.dishes.items;

// Khối lượng thực phẩm (không tính đồ có sẵn) cho servingsBase suất, đơn vị g/ml.
function foodMass(d) {
  let g = 0;
  for (const i of d.ingredients) {
    const ing = ingIx.get(i.id);
    if (ing.pantry || i.optional) continue;
    g += toBase(ing, i.qty, i.unit);
  }
  return g;
}
function protein(d) {
  let g = 0;
  for (const i of d.ingredients) {
    const ing = ingIx.get(i.id);
    if (i.optional) continue;
    if (['thit_ca', 'hai_san', 'trung_dau_phu'].includes(ing.aisle) && !/xuong|mo-lon|huyet/.test(ing.id)) g += toBase(ing, i.qty, i.unit);
  }
  return g;
}
const RANGE = {
  canh: [150, 1100], man: [250, 1500], xao: [200, 1000], luoc: [250, 800], rau: [100, 900], chay: [250, 900],
  mon_nuoc: [700, 2600], trang_mieng: [60, 1200], an_vat: [100, 1300],
};

test('tổng khối lượng thực phẩm của mỗi món nằm trong khoảng hợp lý cho 4 suất (1 suất với cháo bột trẻ nhỏ)', () => {
  const bad = [];
  for (const d of dishes) {
    const m = foodMass(d);
    if (d.role === 'chao_bot') { if (m < 40 || m > 200) bad.push(d.id + ' ' + m + ' g/suất'); continue; }
    const [lo, hi] = d.id.startsWith('chao-') ? [300, 1200] : RANGE[d.role];
    if (m < lo || m > hi) bad.push(d.id + ' (' + d.role + ') ' + Math.round(m) + ' g, mong đợi ' + lo + '-' + hi);
  }
  assert.deepEqual(bad, []);
});

test('món mặn từ thịt/cá/trứng/đậu có đủ đạm: >= 60 g mỗi suất (4 suất >= 240 g) trừ món ăn kèm', () => {
  const bad = [];
  for (const d of dishes) {
    if (d.role !== 'man') continue;
    if (d.id === 'goi-ga-bap-cai') continue;
    const p = protein(d);
    if (p < 240) bad.push(d.id + ' chỉ ' + Math.round(p) + ' g đạm-nguyên liệu');
  }
  assert.deepEqual(bad, []);
});

test('thịt nạc/cá không quá 400 g mỗi suất; nước mắm không quá 60 ml mỗi món (trừ nước chấm của món nước)', () => {
  const bad = [];
  for (const d of dishes) {
    if (d.role === 'chao_bot') continue;
    if (protein(d) / d.servingsBase > 400) bad.push(d.id + ' đạm quá nhiều');
    const nm = d.ingredients.find((i) => i.id === 'nuoc-mam');
    if (nm && nm.qty > 60 && !['bun-cha'].includes(d.id)) bad.push(d.id + ' nước mắm ' + nm.qty);
  }
  assert.deepEqual(bad, []);
});

test('món gắn nhãn ít muối có lượng muối ước tính <= 1,6 g mỗi suất (ước lượng thô)', () => {
  const SALT = { 'nuoc-mam': 0.24, 'nuoc-tuong': 0.15, muoi: 1, 'bot-canh': 0.6, 'mam-tom': 0.2, 'dau-hao': 0.1 };
  const bad = [];
  for (const d of dishes) {
    if (!d.suitability.includes('it_muoi')) continue;
    let salt = 0;
    for (const i of d.ingredients) if (SALT[i.id] && !i.optional) salt += toBase(ingIx.get(i.id), i.qty, i.unit) * SALT[i.id];
    const per = salt / d.servingsBase;
    if (per > 1.6) bad.push(d.id + ' ~' + per.toFixed(2) + ' g muối/suất');
  }
  assert.deepEqual(bad, []);
});

test('thời gian nấu hợp lý so với kỹ thuật (hầm >= 40 phút, canh rau nhanh <= 40 phút)', () => {
  for (const d of dishes) {
    if (/hầm|kho riềng|kho tàu/i.test(d.name)) assert.ok(d.timeMinutes >= 40, d.id + ' thời gian ' + d.timeMinutes);
    if (d.role === 'luoc') assert.ok(d.timeMinutes <= 30, d.id);
    if (d.role === 'canh' && !/xương|sườn|hầm|khoai sọ|măng|gà|nhồi|hạt sen/i.test(d.name)) assert.ok(d.timeMinutes <= 40, d.id + ' ' + d.timeMinutes);
  }
});

test('mỗi món có ít nhất một nguyên liệu không phải đồ có sẵn', () => {
  for (const d of dishes) assert.ok(d.ingredients.some((i) => !ingIx.get(i.id).pantry && !i.optional), d.id);
});
