import test from 'node:test';
import assert from 'node:assert/strict';
import { data, ingIx, PROFILES } from './helper.js';
import { planWeek } from '../src/planner.js';
import { shoppingFromPlan, mergeExtraItems, roundForShopping, toBase, fmtQty } from '../src/shopping.js';

// Món thử nghiệm để kiểm tra phép tính chính xác.
const T1 = {
  id: 't1', name: 'Món thử 1', role: 'man', servingsBase: 4,
  ingredients: [
    { id: 'rau-muong', qty: 1, unit: 'bo' }, { id: 'thit-ba-chi', qty: 500, unit: 'g' }, { id: 'trung-ga', qty: 3, unit: 'qua' },
    { id: 'ca-chua', qty: 2, unit: 'qua' }, { id: 'nuoc-mam', qty: 15, unit: 'ml' }, { id: 'muoi', qty: 5, unit: 'g' }, { id: 'ot', qty: 2, unit: 'qua', optional: true },
  ],
};
const T2 = {
  id: 't2', name: 'Món thử 2', role: 'canh', servingsBase: 4,
  ingredients: [
    { id: 'rau-muong', qty: 300, unit: 'g' }, { id: 'thit-ba-chi', qty: 1, unit: 'kg' }, { id: 'trung-ga', qty: 4, unit: 'qua' },
    { id: 'ca-chua', qty: 150, unit: 'g' }, { id: 'nuoc-mam', qty: 0.1, unit: 'l' }, { id: 'ot', qty: 8, unit: 'g', optional: true },
  ],
};
const BABY = {
  id: 't-baby', name: 'Cháo thử', role: 'chao_bot', servingsBase: 1,
  ingredients: [{ id: 'gao-te', qty: 20, unit: 'g' }, { id: 'ca-rot', qty: 20, unit: 'g' }],
};
const fix = { ...data, dishes: { ...data.dishes, items: [...data.dishes.items, T1, T2, BABY] } };
const mkPlan = (ids, babyIds = []) => ({
  version: 1, params: {}, profile: PROFILES.adults, warnings: [],
  days: ids.map((id, i) => ({ day: i + 1, meals: { trua: { meal: 'trua', items: [{ slot: 'man1', dishId: id, name: id, why: [] }], baby: babyIds[i] ? [{ dishId: babyIds[i] }] : [], notes: [] } } })),
});
const line = (r, id) => r.lines.find((l) => l.ingredientId === id) || (r.pantryCheck || []).find((l) => l.ingredientId === id);

test('cộng dồn đúng và quy đổi đơn vị: bó<->g, kg<->g, quả<->g, l<->ml', () => {
  const r = shoppingFromPlan(mkPlan(['t1', 't2']), { servings: 4, pantryMode: 'include', data: fix });
  assert.equal(line(r, 'rau-muong').exactQty, 700);            // 1 bó (400 g) + 300 g
  assert.equal(line(r, 'rau-muong').display, '700 g');
  assert.equal(line(r, 'thit-ba-chi').exactQty, 1500);          // 500 g + 1 kg
  assert.equal(line(r, 'thit-ba-chi').quantity, 1.5);
  assert.equal(line(r, 'thit-ba-chi').unit, 'kg');
  assert.equal(line(r, 'thit-ba-chi').display, '1,5 kg');
  assert.equal(line(r, 'trung-ga').quantity, 7);                // 3 + 4 quả, mua theo quả
  assert.equal(line(r, 'trung-ga').unit, 'qua');
  assert.equal(line(r, 'ca-chua').exactQty, 350);               // 2 quả (200 g) + 150 g
  assert.equal(line(r, 'nuoc-mam').exactQty, 115);              // 15 ml + 0,1 l
});

test('mỗi dòng ghi rõ món nào cần nguyên liệu (fromDishes)', () => {
  const r = shoppingFromPlan(mkPlan(['t1', 't2']), { servings: 4, data: fix });
  const l = line(r, 'rau-muong');
  assert.deepEqual(l.fromDishes.map((f) => f.dishId).sort(), ['t1', 't2']);
  assert.equal(l.fromDishes.find((f) => f.dishId === 't1').qty, 400);
  assert.equal(l.fromDishes.find((f) => f.dishId === 't2').qty, 300);
  assert.equal(l.fromDishes.find((f) => f.dishId === 't1').name, 'Món thử 1');
});

test('nhân theo số suất; servings so với servingsBase', () => {
  const p = mkPlan(['t1']);
  assert.equal(line(shoppingFromPlan(p, { servings: 8, data: fix }), 'thit-ba-chi').exactQty, 1000);
  assert.equal(line(shoppingFromPlan(p, { servings: 2, data: fix }), 'thit-ba-chi').exactQty, 250);
  assert.equal(line(shoppingFromPlan(p, { servings: 6, data: fix }), 'thit-ba-chi').exactQty, 750);
  // mặc định theo profile (2 người lớn = 2 suất)
  assert.equal(shoppingFromPlan(p, { data: fix }).servings, 2);
  // people là số
  assert.equal(line(shoppingFromPlan(p, { people: 3, data: fix }), 'thit-ba-chi').exactQty, 375);
  // people là mảng: 2 người lớn + 1 bé 2 tuổi (0,5) + 1 người cao tuổi (0,8)
  const r = shoppingFromPlan(p, { people: [{ ageYears: 30 }, { ageYears: 30 }, { ageYears: 2 }, { ageYears: 70 }], data: fix });
  assert.equal(r.servings, 3.3);
  assert.equal(line(r, 'thit-ba-chi').exactQty, 412.5);
});

test('món ăn dặm của bé tính 1 suất bé, không nhân theo số người lớn', () => {
  const r = shoppingFromPlan(mkPlan(['t1', 't1'], ['t-baby', 't-baby']), { servings: 4, data: fix });
  assert.equal(line(r, 'gao-te').exactQty, 40);
  assert.equal(line(r, 'ca-rot').exactQty, 40);
  const r2 = shoppingFromPlan(mkPlan(['t1', 't1'], ['t-baby', 't-baby']), { servings: 10, data: fix });
  assert.equal(line(r2, 'gao-te').exactQty, 40);
});

test('làm tròn để đi chợ', () => {
  const g = ingIx.get('thit-ba-chi');
  const R = (n) => roundForShopping(g, n);
  assert.deepEqual(R(43), { quantity: 50, unit: 'g' });
  assert.deepEqual(R(40), { quantity: 40, unit: 'g' });
  assert.deepEqual(R(99), { quantity: 100, unit: 'g' });
  assert.deepEqual(R(101), { quantity: 150, unit: 'g' });
  assert.deepEqual(R(480), { quantity: 500, unit: 'g' });
  assert.deepEqual(R(999), { quantity: 1, unit: 'kg' });
  assert.deepEqual(R(1000), { quantity: 1, unit: 'kg' });
  assert.deepEqual(R(1230), { quantity: 1.25, unit: 'kg' });
  assert.deepEqual(R(2010), { quantity: 2.05, unit: 'kg' });
  const egg = ingIx.get('trung-ga');
  assert.deepEqual(roundForShopping(egg, 5.2 * 55), { quantity: 6, unit: 'qua' });
  assert.deepEqual(roundForShopping(egg, 5.05 * 55), { quantity: 5, unit: 'qua' });
  assert.deepEqual(roundForShopping(egg, 10), { quantity: 1, unit: 'qua' });
  const ml = ingIx.get('nuoc-mam');
  assert.deepEqual(roundForShopping(ml, 1230), { quantity: 1.25, unit: 'l' });
  assert.equal(fmtQty(0.05, 'kg'), '0,05 kg');
  assert.equal(fmtQty(1.25, 'kg'), '1,25 kg');
});

test('toBase: quy đổi đơn vị và từ chối đơn vị không hợp lệ', () => {
  const rm = ingIx.get('rau-muong');
  assert.equal(toBase(rm, 2, 'bo'), 800);
  assert.equal(toBase(rm, 1.5, 'kg'), 1500);
  assert.equal(toBase(rm, 1, 'l'), null);
  assert.equal(toBase(rm, 1, 'qua'), null);
  assert.equal(toBase(ingIx.get('nuoc-mam'), 2, 'l'), 2000);
});

test('đồ có sẵn (pantry): skip / include / ask', () => {
  const p = mkPlan(['t1', 't2']);
  const skip = shoppingFromPlan(p, { servings: 4, pantryMode: 'skip', data: fix });
  assert.equal(line(skip, 'nuoc-mam'), undefined);
  assert.equal(line(skip, 'muoi'), undefined);
  assert.ok(skip.pantrySkipped.includes('nuoc-mam') && skip.pantrySkipped.includes('muoi'));
  assert.ok(line(skip, 'rau-muong'));
  const inc = shoppingFromPlan(p, { servings: 4, pantryMode: 'include', data: fix });
  assert.equal(line(inc, 'nuoc-mam').pantry, true);
  assert.ok(inc.byAisle.find((g) => g.aisle === 'gia_vi').lines.some((l) => l.ingredientId === 'muoi'));
  const ask = shoppingFromPlan(p, { servings: 4, pantryMode: 'ask', data: fix });
  assert.equal(ask.lines.find((l) => l.ingredientId === 'nuoc-mam'), undefined);
  assert.ok(ask.pantryCheck.some((l) => l.ingredientId === 'nuoc-mam' && l.pantry));
  assert.throws(() => shoppingFromPlan(p, { servings: 4, pantryMode: 'xx', data: fix }), /pantryMode/);
});

test('đồ nhà đã có (have) bị loại khỏi danh sách', () => {
  const r = shoppingFromPlan(mkPlan(['t1', 't2']), { servings: 4, have: ['thit-ba-chi', 'nuoc-mam'], pantryMode: 'include', data: fix });
  assert.equal(line(r, 'thit-ba-chi'), undefined);
  assert.equal(line(r, 'nuoc-mam'), undefined);
  assert.deepEqual(r.haveSkipped.sort(), ['nuoc-mam', 'thit-ba-chi']);
});

test('nguyên liệu tùy chọn được đánh dấu, hoặc bỏ khi includeOptional=false', () => {
  const p = mkPlan(['t1', 't2']);
  const r = shoppingFromPlan(p, { servings: 4, data: fix });
  assert.equal(line(r, 'ot').optional, true);
  assert.equal(line(r, 'ot').exactQty, 24);    // 2 quả x 8 g + 8 g
  assert.equal(line(r, 'rau-muong').optional, false);
  const r2 = shoppingFromPlan(p, { servings: 4, includeOptional: false, data: fix });
  assert.equal(line(r2, 'ot'), undefined);
});

test('nhóm theo aisle và sắp xếp theo thứ tự đi chợ', () => {
  const r = shoppingFromPlan(mkPlan(['t1', 't2']), { servings: 4, pantryMode: 'include', data: fix });
  assert.deepEqual(r.byAisle.map((g) => g.aisle), ['rau_cu', 'thit_ca', 'trung_dau_phu', 'gia_vi']);
  for (const g of r.byAisle) { assert.ok(g.label); assert.ok(g.lines.every((l) => l.aisle === g.aisle)); }
});

test('bỏ qua các bữa đã ăn ngoài (skipMeals)', () => {
  const r = shoppingFromPlan(mkPlan(['t1', 't2']), { servings: 4, skipMeals: ['2:trua'], data: fix });
  assert.equal(line(r, 'thit-ba-chi').exactQty, 500);
});

test('thực đơn thật: danh sách gộp đầy đủ và nhất quán với thực đơn', () => {
  const plan = planWeek({ month: 3, profile: PROFILES.threeGen, seed: 77 });
  const r = shoppingFromPlan(plan, { pantryMode: 'include' });
  assert.ok(r.lines.length >= 25);
  const ids = new Set();
  plan.days.forEach((d) => Object.values(d.meals).forEach((m) => { m.items.forEach((i) => ids.add(i.dishId)); m.baby.forEach((b) => ids.add(b.dishId)); }));
  for (const l of r.lines) {
    assert.ok(l.fromDishes.length >= 1);
    assert.ok(l.quantity > 0 && l.display.length > 0);
    for (const f of l.fromDishes) assert.ok(ids.has(f.dishId), 'món ' + f.dishId + ' không có trong thực đơn');
    assert.ok(l.quantity * (l.unit === 'kg' || l.unit === 'l' ? 1000 : 1) >= 0 && l.exactQty > 0);
  }
  // không dòng nào trùng nguyên liệu
  assert.equal(new Set(r.lines.map((l) => l.ingredientId)).size, r.lines.length);
  // tổng lượng đủ: số suất lớn hơn thì khối lượng tăng
  const small = shoppingFromPlan(plan, { servings: 2, pantryMode: 'include' });
  const big = shoppingFromPlan(plan, { servings: 8, pantryMode: 'include' });
  const gao = (x) => (x.lines.find((l) => l.ingredientId === 'thit-nac-bam') || { exactQty: 0 }).exactQty;
  assert.ok(gao(big) >= gao(small) * 3.9 || gao(small) === 0);
});

test('mergeExtraItems: mục ghi thêm giữ riêng, chỉ cộng khi khớp chính xác nguyên liệu', () => {
  const base = shoppingFromPlan(mkPlan(['t1', 't2']), { servings: 4, data: fix });
  const snapshot = JSON.stringify(base);
  const r = mergeExtraItems(base, ['mua thêm pin', 'bánh cho bé', 'sữa cho bé', '2 bó rau muống', 'sữa tươi 1 hộp', 'pin AA 4 viên'], { data: fix });
  assert.equal(JSON.stringify(base), snapshot, 'không được sửa danh sách gốc');
  // rau muống được cộng: 700 g + 800 g = 1,5 kg
  const rm = line(r, 'rau-muong');
  assert.equal(rm.exactQty, 1500);
  assert.equal(rm.display, '1,5 kg');
  assert.ok(rm.fromDishes.some((f) => f.dishId === 'extra'));
  // các mục tự do không bị gộp nhầm
  const extras = r.lines.filter((l) => l.extra);
  assert.deepEqual(extras.map((l) => l.name).sort(), ['bánh cho bé', 'pin', 'pin aa', 'sữa cho bé'].sort());
  assert.ok(!extras.some((l) => l.ingredientId === 'sua-tuoi' && l.confidence === 'exact'));
  // 'sữa cho bé' không được cộng vào sữa tươi; 'sữa tươi 1 hộp' tạo dòng nguyên liệu riêng (vì chưa có trong thực đơn)
  const milk = r.lines.find((l) => l.ingredientId === 'sua-tuoi' && !l.extra);
  assert.ok(milk && milk.fromDishes[0].dishId === 'extra');
  const babyMilk = r.lines.find((l) => l.name === 'sữa cho bé');
  assert.equal(babyMilk.extra, true);
  assert.notEqual(babyMilk.id, milk.id);
  // mục ghi thêm nằm cuối danh sách
  const lastIdx = r.lines.findIndex((l) => l.extra);
  assert.ok(r.lines.slice(lastIdx).every((l) => l.extra));
  assert.ok(r.byAisle.some((g) => g.aisle === 'khac'));
});

test('mergeExtraItems: đối tượng ghi thêm, trùng tên thì cộng số lượng, nhận mảng dòng', () => {
  const base = shoppingFromPlan(mkPlan(['t1']), { servings: 4, data: fix });
  const r = mergeExtraItems(base, [{ name: 'pin AA', qty: 4, unit: 'vien' }, { name: 'pin AA', qty: 2, unit: 'vien' }, { name: 'giấy ăn', note: 'loại mềm' }], { data: fix });
  const pin = r.lines.find((l) => l.name === 'pin AA' || l.name === 'pin aa');
  assert.equal(pin.quantity, 6);
  assert.equal(pin.unit, 'vien');
  assert.equal(r.lines.find((l) => l.name === 'giấy ăn').note, 'loại mềm');
  const arr = mergeExtraItems(base.lines, ['mua thêm pin'], { data: fix });
  assert.ok(Array.isArray(arr) && arr.some((l) => l.extra && l.name === 'pin'));
  // gọi lại với cùng đầu vào cho kết quả giống nhau (tất định)
  assert.deepEqual(mergeExtraItems(base, ['mua thêm pin'], { data: fix }), mergeExtraItems(base, ['mua thêm pin'], { data: fix }));
});
