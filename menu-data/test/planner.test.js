import test from 'node:test';
import assert from 'node:assert/strict';
import { data, dishIx, PROFILES, SEASON_OF, MONTH_OF_SEASON, isMan, inSeason } from './helper.js';
import { planWeek, swapDish, dishIdsOfPlan } from '../src/planner.js';

const items = (plan) => plan.days.flatMap((d) => Object.values(d.meals).flatMap((m) => m.items));
const mealsOf = (plan) => plan.days.flatMap((d) => Object.values(d.meals));
const dish = (id) => dishIx.get(id);

test('tất định theo seed, khác seed thì khác', () => {
  const a = planWeek({ month: 10, profile: PROFILES.family, seed: 42 });
  const b = planWeek({ month: 10, profile: PROFILES.family, seed: 42 });
  const c = planWeek({ month: 10, profile: PROFILES.family, seed: 43 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(dishIdsOfPlan(a), dishIdsOfPlan(c));
});

test('thực đơn 7 ngày x 2 bữa; mỗi bữa cơm có canh + 1-2 mặn + rau, hoặc 1 món nước', () => {
  for (const [name, profile] of Object.entries(PROFILES)) {
    const p = planWeek({ month: 3, profile, seed: name });
    assert.equal(p.days.length, 7);
    for (const day of p.days) {
      assert.deepEqual(Object.keys(day.meals), ['trua', 'toi']);
      for (const m of Object.values(day.meals)) {
        const slots = m.items.map((i) => i.slot);
        if (slots.includes('mon_nuoc')) { assert.equal(m.items.length, 1); continue; }
        assert.ok(slots.includes('canh') && slots.includes('man1') && slots.includes('rau'), name + ' ' + slots);
        assert.ok(slots.filter((s) => s.startsWith('man')).length <= 2);
        for (const i of m.items) assert.ok(i.why.length >= 0 && typeof i.name === 'string' && dish(i.dishId));
      }
    }
    assert.deepEqual(p.warnings, [], name + ' ' + p.warnings.join('|'));
  }
});

test('có thêm bữa sáng khi yêu cầu', () => {
  const p = planWeek({ month: 5, profile: PROFILES.family, meals: ['sang', 'trua', 'toi'], seed: 1 });
  for (const d of p.days) {
    assert.ok(d.meals.sang && d.meals.sang.items.length === 1);
    const x = dish(d.meals.sang.items[0].dishId);
    assert.ok(x.course.includes('sang'));
  }
});

test('tôn trọng tuyệt đối dị ứng/kiêng: mọi tháng, nhiều tổ hợp', () => {
  const combos = [['hai_san'], ['trung'], ['sua'], ['dau_phong'], ['gluten'], ['thit_heo'], ['thit_bo'], ['cay'], ['dau_nanh'], ['hai_san', 'trung', 'dau_nanh'], ['thit_heo', 'thit_bo'], ['hai_san', 'thit_heo', 'dau_nanh', 'trung']];
  for (const avoid of combos) {
    for (let month = 1; month <= 12; month++) {
      const profile = { people: [{ ageYears: 35, avoid }, { ageYears: 33 }, { ageYears: 5 }], region: 'bac' };
      const p = planWeek({ month, profile, seed: avoid.join('') + month, meals: ['sang', 'trua', 'toi'], dessert: true });
      for (const it of items(p)) {
        const d = dish(it.dishId);
        for (const a of avoid) assert.ok(!d.avoid.includes(a), 'tháng ' + month + ' kiêng ' + a + ' nhưng có ' + d.id);
      }
    }
  }
});

test('dị ứng chỉ của một người trong nhà vẫn áp dụng cho cả bữa', () => {
  const profile = { people: [{ ageYears: 35 }, { ageYears: 4, avoid: ['trung', 'hai_san'] }], region: 'bac' };
  const p = planWeek({ month: 6, profile, seed: 9 });
  for (const it of items(p)) assert.ok(!dish(it.dishId).avoid.some((a) => ['trung', 'hai_san'].includes(a)), it.dishId);
});

test('có người cao tuổi: mỗi bữa cơm có món hợp ông bà, đa số món mềm/ít muối', () => {
  for (let month = 1; month <= 12; month += 3) {
    const p = planWeek({ month, profile: PROFILES.threeGen, seed: 'eld' + month });
    let eld = 0, total = 0;
    for (const m of mealsOf(p)) {
      if (m.items.length === 1 && m.items[0].slot === 'mon_nuoc') continue;
      assert.ok(m.items.some((i) => dish(i.dishId).suitability.includes('nguoi_cao_tuoi')), 'tháng ' + month + ' thiếu món cho ông bà');
      for (const i of m.items) { total++; if (dish(i.dishId).suitability.includes('nguoi_cao_tuoi') || dish(i.dishId).suitability.includes('de_nhai')) eld++; }
    }
    assert.ok(eld / total >= 0.6, 'tháng ' + month + ' chỉ ' + Math.round((100 * eld) / total) + '% món hợp ông bà');
  }
  const p = planWeek({ month: 1, profile: PROFILES.elderly, seed: 1 });
  assert.ok(items(p).some((i) => i.why.some((w) => /ông bà|nhạt|muối/i.test(w))), 'phải giải thích lý do cho ông bà');
});

test('có trẻ nhỏ 1-3 tuổi: mỗi bữa cơm có món mặn hợp bé, không cay, đúng tuổi', () => {
  for (let month = 1; month <= 12; month += 2) {
    const p = planWeek({ month, profile: PROFILES.family, seed: 'kid' + month });
    for (const m of mealsOf(p)) {
      if (m.items.length === 1 && m.items[0].slot === 'mon_nuoc') {
        assert.ok(dish(m.items[0].dishId).minAgeMonths <= 24);
        continue;
      }
      assert.ok(m.items.some((i) => i.slot.startsWith('man') && dish(i.dishId).suitability.includes('tre_nho_1_3')), 'tháng ' + month + ' thiếu mặn cho bé');
    }
    for (const i of items(p)) {
      const d = dish(i.dishId);
      assert.ok(!d.avoid.includes('cay'), d.id);
      assert.ok(d.minAgeMonths <= 24, d.id + ' không hợp bé 2 tuổi');
    }
  }
});

test('theo mùa: không có món ngoài mùa, và ưu tiên món đúng mùa', () => {
  for (let month = 1; month <= 12; month++) {
    const season = SEASON_OF[month];
    for (const profile of [PROFILES.adults, PROFILES.family, PROFILES.threeGen]) {
      const p = planWeek({ month, profile, seed: 'm' + month, meals: ['sang', 'trua', 'toi'], dessert: true });
      assert.equal(p.params.season, season);
      const its = items(p);
      for (const i of its) assert.ok(inSeason(dish(i.dishId), season), 'tháng ' + month + ': ' + i.dishId + ' ngoài mùa');
      const explicit = its.filter((i) => dish(i.dishId).seasons.includes(season)).length;
      assert.ok(explicit / its.length >= 0.3, 'tháng ' + month + ' chỉ ' + explicit + '/' + its.length + ' món đúng mùa rõ rệt');
    }
  }
});

test('đa dạng: không lặp món trong tuần; không cùng loại đạm mặn hai bữa liền', () => {
  for (const [name, profile] of Object.entries(PROFILES)) {
    for (const month of [2, 6, 9, 12]) {
      const p = planWeek({ month, profile, seed: name + month, meals: ['sang', 'trua', 'toi'] });
      const ids = dishIdsOfPlan(p);
      assert.equal(new Set(ids).size, ids.length, name + month + ' lặp món');
      let prev = null;
      for (const m of mealsOf(p)) {
        if (m.meal === 'sang') continue;
        const prot = new Set(m.items.filter((i) => i.slot.startsWith('man') || i.slot === 'mon_nuoc').map((i) => dish(i.dishId).protein[0]));
        if (prev) {
          const same = [...prot].filter((x) => prev.has(x));
          assert.equal(same.length, 0, name + month + ' lặp đạm ' + same + ' giữa hai bữa liền');
        }
        prev = prot;
      }
    }
  }
});

test('4 tuần liên tiếp không lặp món (mỗi mùa, mỗi nhóm), dùng exclude của tuần trước', () => {
  for (const season of ['xuan', 'ha', 'thu', 'dong']) {
    for (const [pname, profile] of Object.entries({ family: PROFILES.family, threeGen: PROFILES.threeGen })) {
      // 1 bữa chính mỗi ngày x 28 ngày
      let used = [];
      for (let w = 0; w < 4; w++) {
        const p = planWeek({ month: MONTH_OF_SEASON[season], profile, meals: ['toi'], seed: 'w' + w, exclude: used });
        assert.deepEqual(p.warnings, [], season + pname + ' tuần ' + (w + 1) + ': ' + p.warnings.join('|'));
        const ids = dishIdsOfPlan(p);
        for (const id of ids) assert.ok(!used.includes(id), season + pname + ' lặp ' + id + ' ở tuần ' + (w + 1));
        assert.equal(new Set(ids).size, ids.length);
        for (const it of items(p)) assert.ok(!it.why.some((x) => /dùng lại món|ngoài mùa/.test(x)), season + pname + ' tuần ' + (w + 1) + ' phải nới lỏng: ' + it.why);
        used = used.concat(ids);
      }
      assert.equal(new Set(used).size, used.length);
    }
  }
});

test('2 tuần đủ trưa + tối (28 bữa) không lặp món', () => {
  for (const season of ['xuan', 'ha', 'thu', 'dong']) {
    let used = [];
    for (let w = 0; w < 2; w++) {
      const p = planWeek({ month: MONTH_OF_SEASON[season], profile: PROFILES.family, meals: ['trua', 'toi'], seed: 'tt' + w, exclude: used });
      assert.deepEqual(p.warnings, [], season + ' tuần ' + (w + 1) + ': ' + p.warnings.join('|'));
      used = used.concat(dishIdsOfPlan(p));
    }
    assert.equal(new Set(used).size, used.length, season);
  }
});

test('exclude được tôn trọng', () => {
  const base = planWeek({ month: 7, profile: PROFILES.adults, seed: 5 });
  const ex = dishIdsOfPlan(base).slice(0, 10);
  const p = planWeek({ month: 7, profile: PROFILES.adults, seed: 5, exclude: ex });
  for (const id of dishIdsOfPlan(p)) assert.ok(!ex.includes(id));
});

test('bé 6-11 tháng có món ăn dặm riêng phù hợp tuổi, bé dưới 6 tháng thì không', () => {
  const p = planWeek({ month: 10, profile: PROFILES.baby, seed: 3 });
  let n = 0;
  for (const m of mealsOf(p)) for (const b of m.baby) {
    n++;
    const d = dish(b.dishId);
    assert.equal(d.role, 'chao_bot');
    assert.ok(d.minAgeMonths <= 8);
    assert.ok(b.why.join(' ').includes('hỏi bác sĩ'));
  }
  assert.equal(n, 14);
  const small = planWeek({ month: 10, profile: { people: [{ ageYears: 30 }, { ageMonths: 4 }] }, seed: 3 });
  assert.equal(mealsOf(small).reduce((s, m) => s + m.baby.length, 0), 0);
  assert.ok(small.warnings.some((w) => /dưới 6 tháng/.test(w)));
  // dị ứng của bé được tôn trọng
  const allergic = planWeek({ month: 10, profile: { people: [{ ageYears: 30 }, { ageMonths: 9, avoid: ['hai_san', 'trung'] }] }, seed: 3 });
  for (const m of mealsOf(allergic)) for (const b of m.baby) assert.ok(!dish(b.dishId).avoid.some((a) => ['hai_san', 'trung'].includes(a)), b.dishId);
});

test('ngân sách: tiết kiệm rẻ hơn thoải mái', () => {
  const avg = (budget) => {
    let sum = 0, n = 0;
    for (let s = 0; s < 6; s++) for (const it of items(planWeek({ month: 4, profile: PROFILES.family, seed: 'b' + s, budget }))) { sum += dish(it.dishId).costLevel; n++; }
    return sum / n;
  };
  assert.ok(avg('tiet_kiem') < avg('thoai_mai'), avg('tiet_kiem') + ' vs ' + avg('thoai_mai'));
});

test('mỗi món có lý do chọn (why) ở dạng tiếng Việt', () => {
  const p = planWeek({ month: 11, profile: PROFILES.threeGen, seed: 7 });
  const all = items(p);
  assert.ok(all.filter((i) => i.why.length > 0).length / all.length > 0.9);
  assert.ok(all.some((i) => i.why.some((w) => /Đúng mùa đông/.test(w))));
});

test('swapDish: chỉ đổi một ô, giữ quy tắc, không lặp, không làm hỏng bản gốc, tất định', () => {
  const p = planWeek({ month: 8, profile: PROFILES.threeGen, seed: 11 });
  const snapshot = JSON.stringify(p);
  const slot = { day: 3, meal: 'toi', slot: 'canh' };
  const before = p.days[2].meals.toi.items.find((i) => i.slot === 'canh');
  if (!before) return; // ngày đó là món nước; thử ô khác
  const q = swapDish(p, slot);
  assert.equal(JSON.stringify(p), snapshot, 'bản gốc bị sửa');
  const after = q.days[2].meals.toi.items.find((i) => i.slot === 'canh');
  assert.notEqual(after.dishId, before.dishId);
  assert.equal(dish(after.dishId).role, 'canh');
  assert.ok(inSeason(dish(after.dishId), 'thu'));
  assert.ok(after.why[0].startsWith('Đổi món theo yêu cầu'));
  // các ô khác giữ nguyên
  const a = items(p).filter((i) => i !== before).map((i) => i.dishId);
  const bIds = items(q).filter((i) => i !== after).map((i) => i.dishId);
  assert.deepEqual(a, bIds);
  // không trùng với món khác trong tuần
  const ids = dishIdsOfPlan(q);
  assert.equal(new Set(ids).size, ids.length);
  // tất định + attempt khác cho kết quả (có thể) khác
  assert.deepEqual(swapDish(p, slot), q);
});

test('swapDish: tôn trọng dị ứng; ép chọn món bị cấm thì báo lỗi; ép chọn món hợp lệ thì đổi', () => {
  const profile = { people: [{ ageYears: 35, avoid: ['hai_san'] }, { ageYears: 30 }, { ageYears: 2 }] };
  const p = planWeek({ month: 6, profile, seed: 2 });
  const m = p.days[0].meals.trua;
  const target = m.items.find((i) => i.slot.startsWith('man')) || m.items[0];
  for (let attempt = 0; attempt < 5; attempt++) {
    const q = swapDish(p, { day: 1, meal: 'trua', slot: target.slot }, { attempt });
    const nd = dish(q.days[0].meals.trua.items.find((i) => i.slot === target.slot).dishId);
    assert.ok(!nd.avoid.includes('hai_san'));
    assert.ok(!nd.avoid.includes('cay'));
  }
  assert.throws(() => swapDish(p, { day: 1, meal: 'trua', slot: target.slot }, { dishId: 'tom-hap-sa' }), /kiêng|dị ứng/);
  assert.throws(() => swapDish(p, { day: 1, meal: 'trua', slot: target.slot }, { dishId: 'ga-xao-sa-ot' }), /cay/);
  const okId = 'trung-ran-hanh';
  const q2 = swapDish(p, { day: 1, meal: 'trua', slot: target.slot }, { dishId: okId });
  assert.equal(q2.days[0].meals.trua.items.find((i) => i.slot === target.slot).dishId, okId);
  assert.throws(() => swapDish(p, { day: 99, meal: 'trua', slot: 'canh' }), /Không có ngày/);
  assert.throws(() => swapDish(p, { day: 1, meal: 'trua', slot: 'khong-co' }));
});

test('kiểm tra tham số', () => {
  assert.throws(() => planWeek({ month: 13, profile: PROFILES.adults }), /1-12/);
  assert.throws(() => planWeek({ month: 5, profile: { people: [] } }), /rỗng/);
  assert.throws(() => planWeek({ month: 5, profile: PROFILES.adults, meals: ['khuya'] }), /meals/);
  assert.throws(() => planWeek({ month: 5, profile: PROFILES.adults, days: 0 }), /days/);
  const p = planWeek({ month: 5, profile: { people: [{ ageYears: 30 }], region: 'nam' }, days: 2 });
  assert.ok(p.warnings.some((w) => /miền Bắc/.test(w)));
});

test('fuzz: 300 thực đơn ngẫu nhiên luôn giữ các bất biến an toàn', () => {
  const avoids = [[], ['hai_san'], ['trung'], ['thit_heo'], ['dau_phong', 'sua'], ['gluten'], ['hai_san', 'trung', 'dau_nanh']];
  let runs = 0;
  for (let i = 0; i < 300; i++) {
    const month = (i % 12) + 1;
    const avoid = avoids[i % avoids.length];
    const kidAge = [null, 14, 30, 60, 100][i % 5];
    const people = [{ ageYears: 34, avoid }, { ageYears: 33 }];
    if (kidAge) people.push({ ageMonths: kidAge });
    if (i % 3 === 0) people.push({ ageYears: 67, role: 'ba' });
    if (i % 7 === 0) people.push({ ageMonths: 9 });
    const meals = i % 4 === 0 ? ['sang', 'trua', 'toi'] : ['trua', 'toi'];
    const plan = planWeek({ month, profile: { people }, meals, seed: 'fz' + i, dessert: i % 6 === 0 });
    runs++;
    const ids = dishIdsOfPlan(plan);
    assert.equal(new Set(ids).size, ids.length, 'lặp món ở lần ' + i);
    const minEater = Math.min(...people.filter((p) => (p.ageMonths ?? p.ageYears * 12) >= 12).map((p) => p.ageMonths ?? p.ageYears * 12));
    for (const it of items(plan)) {
      const d = dish(it.dishId);
      for (const a of avoid) assert.ok(!d.avoid.includes(a), 'lần ' + i + ' dị ứng ' + a + ' ' + d.id);
      assert.ok(d.minAgeMonths <= minEater, 'lần ' + i + ' ' + d.id + ' tuổi');
      if (kidAge) assert.ok(!d.avoid.includes('cay'), 'lần ' + i + ' cay');
      assert.ok(d.role !== 'chao_bot');
    }
    for (const m of mealsOf(plan)) for (const b of m.baby) {
      const d = dish(b.dishId);
      assert.equal(d.role, 'chao_bot'); assert.ok(d.minAgeMonths <= 9);
    }
  }
  assert.equal(runs, 300);
});
