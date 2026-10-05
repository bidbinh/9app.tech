// Lập thực đơn tuần cho gia đình miền Bắc. Tất định theo seed, không phụ thuộc, chạy Node 20 + trình duyệt.
import { getData, indexes, analyzeProfile, seasonOfMonth, SEASON_LABEL, makeRng, ageMonthsOf } from './common.js';

/**
 * @typedef {Object} PlanItem
 * @property {string} slot     'canh' | 'man1' | 'man2' | 'rau' | 'mon_nuoc' | 'sang' | 'dessert'
 * @property {string} dishId
 * @property {string} name
 * @property {string[]} why    Lý do chọn (tiếng Việt)
 * @typedef {Object} PlanMeal
 * @property {string} meal           'sang' | 'trua' | 'toi'
 * @property {PlanItem[]} items
 * @property {{personIndex:number, ageMonths:number, dishId:string, name:string, why:string[]}[]} baby  Món ăn dặm riêng cho bé 6-11 tháng
 * @property {string[]} notes
 * @typedef {Object} Plan
 * @property {number} version
 * @property {{month:number, season:string, days:number, meals:string[], seed:(string|number), budget:any, exclude:string[], nuocRate:number, dessert:boolean}} params
 * @property {import('./common.js').Profile} profile
 * @property {{day:number, meals:Object<string, PlanMeal>}[]} days
 * @property {string[]} warnings
 */

const MEALS = ['sang', 'trua', 'toi'];
const COMMON_ING = new Set(['ca-chua', 'hanh-la', 'rau-thom', 'gung', 'toi', 'hanh-kho', 'chanh', 'trung-ga', 'dau-phu', 'ca-rot', 'thit-nac-bam', 'ot', 'dau-phong']);
const PROTEIN_LABEL = { heo: 'thịt heo', bo: 'thịt bò', ga: 'thịt gà', vit: 'thịt vịt', ca: 'cá', hai_san: 'hải sản', trung: 'trứng', dau_phu: 'đậu phụ', rau: 'rau củ' };

function budgetCap(budget) {
  if (budget == null) return 3;
  if (typeof budget === 'number') return Math.min(3, Math.max(1, Math.round(budget)));
  return { tiet_kiem: 1, vua: 2, thoai_mai: 3 }[budget] || 3;
}

const isVegSide = (d) => d.role === 'luoc' || d.role === 'rau' || (d.role === 'xao' && d.protein.length === 1 && d.protein[0] === 'rau');
const isMan = (d) => d.role === 'man' || d.role === 'chay' || (d.role === 'xao' && !isVegSide(d));

const mainCache = new WeakMap();
/** Nguyên liệu chính của món (bỏ đồ có sẵn, đồ tùy chọn, và nguyên liệu dùng quá phổ biến). */
function mainIngredients(dish, ctx) {
  let c = mainCache.get(dish);
  if (!c) {
    c = dish.ingredients.filter((i) => {
      if (i.optional || COMMON_ING.has(i.id)) return false;
      const g = ctx && ctx.ingIx.get(i.id);
      return !(g && g.pantry);
    }).map((i) => i.id);
    mainCache.set(dish, c);
  }
  return c;
}

/** Bối cảnh lập thực đơn (dùng chung cho planWeek và swapDish). */
function makeContext(params, profile, data) {
  const { dish: dishIx, ing: ingIx } = indexes(data);
  const pf = analyzeProfile(profile);
  const season = seasonOfMonth(params.month);
  const cap = budgetCap(params.budget);
  const exclude = new Set(params.exclude || []);
  const all = data.dishes.items.filter((d) => d.role !== 'chao_bot');
  const allowed = all.filter((d) => {
    if (exclude.has(d.id)) return false;
    if (d.avoid.some((a) => pf.avoid.has(a))) return false;
    if (d.minAgeMonths > pf.minEaterAge) return false;
    if (pf.noSpicy && d.avoid.includes('cay')) return false;
    return true;
  });
  return { pf, season, cap, exclude, dishIx, ingIx, allowed, data };
}

const seasonStatus = (d, season) => (d.seasons.includes(season) ? 'in' : d.seasons.includes('quanh_nam') ? 'all' : 'out');

function scoreDish(d, ctx, st) {
  const { pf, season, cap } = ctx;
  let s = 10;
  const why = [];
  const ss = seasonStatus(d, season);
  if (ss === 'in') { s += 4; why.push('Đúng mùa ' + SEASON_LABEL[season] + (d.seasonNote ? ' (' + d.seasonNote.replace(/\.$/, '') + ')' : '')); }
  else if (ss === 'all') { s += 1; }
  else { s -= 6; why.push('Món ngoài mùa (không còn món trong mùa phù hợp)'); }
  if (pf.elderly) {
    if (d.suitability.includes('nguoi_cao_tuoi')) { s += 3; why.push('Mềm, dễ ăn cho ông bà'); }
    if (d.suitability.includes('it_muoi')) { s += 2; why.push('Có thể nêm nhạt, ít muối'); }
    if (d.suitability.includes('de_nhai')) s += 1;
  }
  if (pf.toddlers) {
    if (d.suitability.includes('tre_nho_1_3')) { s += 3; why.push('Hợp bé 1-3 tuổi'); }
  }
  if (pf.kids && !d.suitability.includes('tre_4_12')) s -= 4;
  if (pf.toddlers && !pf.kids && !d.suitability.includes('tre_4_12')) s -= 3;
  if (pf.diet.has('it_muoi') && d.suitability.includes('it_muoi') && !pf.elderly) { s += 3; why.push('Ít muối theo nhu cầu của gia đình'); }
  if (pf.diet.has('it_duong') && d.suitability.includes('it_duong')) { s += 3; why.push('Ít đường'); }
  if (pf.diet.has('it_dau_mo') && d.suitability.includes('it_dau_mo')) { s += 3; why.push('Ít dầu mỡ'); }
  if (pf.diet.has('de_nhai') && d.suitability.includes('de_nhai') && !pf.elderly) { s += 3; why.push('Mềm, dễ nhai'); }
  if (d.costLevel > cap) { s -= 4 * (d.costLevel - cap); } else if (cap < 3 && d.costLevel <= cap) { s += 1; if (d.costLevel === 1) why.push('Giá vừa túi tiền'); }
  if (st && st.lastIngredients) {
    const overlap = mainIngredients(d, ctx).filter((i) => st.lastIngredients.has(i)).length;
    s -= 1.5 * Math.min(overlap, 3);
  }
  if (st && st.mealIngredients) {
    const overlap = mainIngredients(d, ctx).filter((i) => st.mealIngredients.has(i)).length;
    s -= 3 * Math.min(overlap, 3);
  }
  if (d.role === 'chay') s -= 2;
  return { score: s, why };
}

/**
 * Chọn một món cho một ô, thử các mức nới lỏng dần.
 * @returns {{dish:any, why:string[]}|null}
 */
function choose(ctx, rng, st, opts) {
  const { pool, extra, avoidProtein, softProtein, requireToddler, maxLevel = 4 } = opts;
  const used = st.used;
  const tries = [
    { protein: true, season: true, used: true, toddler: true },
    { protein: true, season: true, used: true, toddler: false },
    { protein: false, season: true, used: true, toddler: false },
    { protein: false, season: false, used: true, toddler: false },
    { protein: false, season: false, used: false, toddler: false },
  ];
  for (let lvl = 0; lvl < tries.length && lvl <= maxLevel; lvl++) {
    const t = tries[lvl];
    let c = pool.filter((d) => (!t.used || !used.has(d.id)) && !st.pending.has(d.id) && (!extra || extra(d)));
    if (t.season) c = c.filter((d) => seasonStatus(d, ctx.season) !== 'out');
    if (t.protein && avoidProtein && avoidProtein.size) c = c.filter((d) => !avoidProtein.has(d.protein[0]));
    if (lvl <= 3 && st.mealIngredients && st.mealIngredients.size) c = c.filter((d) => !mainIngredients(d, ctx).some((i) => st.mealIngredients.has(i)));
    if (t.toddler && requireToddler && ctx.pf.toddlers) c = c.filter((d) => d.suitability.includes('tre_nho_1_3'));
    if (!c.length) continue;
    let best = null;
    for (const d of c) {
      const r = scoreDish(d, ctx, st);
      const total = r.score + rng() * 3 - (softProtein && softProtein.has(d.protein[0]) ? 3 : 0);
      if (!best || total > best.total) best = { total, d, why: r.why };
    }
    const why = best.why.slice();
    if (lvl >= 2 && !t.protein && avoidProtein && avoidProtein.size) why.push('Chưa tránh được trùng loại đạm (với bữa trước hoặc món mặn cùng bữa) do thiếu món phù hợp');
    if (lvl === 4) why.push('Phải dùng lại món đã có trong tuần vì không còn món phù hợp');
    return { dish: best.d, why, level: lvl };
  }
  return null;
}

function proteinSet(items, ctx) {
  const s = new Set();
  for (const it of items) {
    const d = ctx.dishIx.get(it.dishId);
    if (d && (it.slot.startsWith('man') || it.slot === 'mon_nuoc')) s.add(d.protein[0]);
  }
  return s;
}
function ingSet(items, ctx) {
  const s = new Set();
  for (const it of items) { const d = ctx.dishIx.get(it.dishId); if (d) mainIngredients(d, ctx).forEach((i) => s.add(i)); }
  return s;
}

function mkItem(slot, dish, why) {
  return { slot, dishId: dish.id, name: dish.name, why };
}

function pickBaby(ctx, rng, st, lastBabyByPerson) {
  const out = [];
  for (const b of ctx.pf.babies) {
    const recent = lastBabyByPerson[b.index] || (lastBabyByPerson[b.index] = []);
    const pool = ctx.data.dishes.items.filter((d) => d.role === 'chao_bot' && d.minAgeMonths <= b.ageMonths && !d.avoid.some((a) => b.avoid.includes(a)) && !recent.includes(d.id) && !(d.ingredients.some((i) => i.id === 'gan-heo') && (st.liver || 0) >= 2));
    if (!pool.length) continue;
    let best = null;
    for (const d of pool) {
      const ss = seasonStatus(d, ctx.season);
      const total = 10 + (ss === 'in' ? 3 : ss === 'all' ? 1 : -5) + rng() * 3 + (d.minAgeMonths === b.ageMonths ? 1 : 0);
      if (!best || total > best.total) best = { total, d, ss };
    }
    if (best.d.ingredients.some((i) => i.id === 'gan-heo')) st.liver = (st.liver || 0) + 1;
    recent.push(best.d.id); if (recent.length > 4) recent.shift();
    const why = ['Món ăn dặm riêng cho bé ' + b.ageMonths + ' tháng (không nêm muối/nước mắm; tham khảo, hỏi bác sĩ)'];
    if (best.ss === 'in') why.push('Đúng mùa ' + SEASON_LABEL[ctx.season]);
    out.push({ personIndex: b.index, ageMonths: b.ageMonths, dishId: best.d.id, name: best.d.name, why });
  }
  return out;
}

/** Chọn các món cho một bữa. st: trạng thái (used, lastProteins, lastIngredients, pending). */
function composeMeal(ctx, rng, st, meal, params) {
  const items = [];
  const notes = [];
  const pool = ctx.allowed;
  const byRole = (fn) => pool.filter(fn);
  const courseOk = (d) => d.course.includes(meal);
  const portions = ctx.pf.portions;
  st.mealIngredients = new Set();
  const add = (slot, r) => {
    items.push(mkItem(slot, r.dish, r.why));
    if (r.level >= 3) notes.push('"' + r.dish.name + '": ' + (r.level === 3 ? 'phải dùng món ngoài mùa' : 'phải dùng lại món đã có trong tuần') + ' do thiếu món phù hợp.');
    st.used.add(r.dish.id);
    mainIngredients(r.dish, ctx).forEach((i) => st.mealIngredients.add(i));
  };
  if (meal === 'sang') {
    const nuoc = byRole((d) => d.role === 'mon_nuoc' && courseOk(d));
    const vat = byRole((d) => d.role === 'an_vat' && courseOk(d));
    const first = rng() < 0.6 ? [nuoc, vat] : [vat, nuoc];
    for (const maxLevel of [2, 4]) {
      for (const p of first) {
        const r = choose(ctx, rng, st, { pool: p, requireToddler: false, maxLevel });
        if (r) { add(r.dish.role === 'mon_nuoc' ? 'mon_nuoc' : 'sang', r); break; }
      }
      if (items.length) break;
    }
    if (!items.length) notes.push('Không tìm được món sáng phù hợp.');
    return { items, notes };
  }
  // bữa trưa / tối
  const nuocPool = byRole((d) => d.role === 'mon_nuoc' && courseOk(d));
  const useNuoc = nuocPool.length && rng() < params.nuocRate;
  if (useNuoc) {
    const r = choose(ctx, rng, st, { pool: nuocPool, requireToddler: false, avoidProtein: st.lastProteins, maxLevel: 1 });
    if (r) {
      const nr = { dish: r.dish, level: r.level, why: r.why.concat(['Đổi bữa bằng một món nước/bún/phở cho đỡ ngán']) };
      add('mon_nuoc', nr);
      return { items, notes };
    }
  }
  const nMan = portions >= 3 && budgetCap(params.budget) >= 2 ? 2 : 1;
  const manPool = byRole((d) => isMan(d) && courseOk(d));
  const chosenProt = new Set();
  for (let k = 1; k <= nMan; k++) {
    const avoidP = new Set([...(st.lastProteins || []), ...chosenProt]);
    const r = choose(ctx, rng, st, { pool: manPool, avoidProtein: avoidP, requireToddler: k === 1 });
    if (!r) { notes.push('Thiếu món mặn phù hợp.'); break; }
    if (!st.lastProteins || !st.lastProteins.has(r.dish.protein[0])) {
      if (st.lastProteins && st.lastProteins.size) r.why.push('Đổi đạm so với bữa trước (' + [...st.lastProteins].map((p) => PROTEIN_LABEL[p] || p).join(', ') + ' -> ' + (PROTEIN_LABEL[r.dish.protein[0]] || r.dish.protein[0]) + ')');
    }
    chosenProt.add(r.dish.protein[0]);
    add('man' + k, r);
  }
  const canhPool = byRole((d) => d.role === 'canh' && courseOk(d));
  const rc = choose(ctx, rng, st, { pool: canhPool, softProtein: chosenProt, requireToddler: true });
  if (rc) add('canh', rc); else notes.push('Thiếu món canh phù hợp.');
  const vegPool = byRole((d) => isVegSide(d) && courseOk(d));
  const rv = choose(ctx, rng, st, { pool: vegPool, requireToddler: true });
  if (rv) add('rau', rv); else notes.push('Thiếu món rau phù hợp.');
  // sắp xếp hiển thị: canh, mặn, rau
  const order = { canh: 0, man1: 1, man2: 2, rau: 3 };
  items.sort((a, b) => (order[a.slot] ?? 9) - (order[b.slot] ?? 9));
  return { items, notes };
}

function checkParams(opts) {
  const { month, days = 7, meals = ['trua', 'toi'] } = opts;
  seasonOfMonth(month);
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error('days phải là số nguyên 1-31.');
  if (!Array.isArray(meals) || !meals.length || meals.some((m) => !MEALS.includes(m))) throw new Error("meals chỉ gồm 'sang','trua','toi'.");
}

/**
 * Lập thực đơn nhiều ngày.
 * @param {Object} opts
 * @param {number} opts.month 1-12
 * @param {import('./common.js').Profile} opts.profile
 * @param {number} [opts.days=7]
 * @param {string[]} [opts.meals=['trua','toi']]  tùy chọn thêm 'sang'
 * @param {(number|'tiet_kiem'|'vua'|'thoai_mai')} [opts.budget]  mức giá tối đa ưu tiên (1-3)
 * @param {string[]} [opts.exclude]  id món loại trừ (ví dụ món của các tuần trước)
 * @param {(string|number)} [opts.seed=1]
 * @param {number} [opts.nuocRate=0.25]  tỉ lệ bữa là món nước/bún/phở
 * @param {boolean} [opts.dessert=false] thêm trái cây/chè tráng miệng ở bữa tối
 * @param {import('./common.js').MenuData} [opts.data]
 * @returns {Plan}
 */
export function planWeek(opts) {
  checkParams(opts);
  const data = getData(opts.data);
  const params = {
    month: opts.month, season: seasonOfMonth(opts.month), days: opts.days ?? 7, meals: (opts.meals || ['trua', 'toi']).slice(),
    seed: opts.seed ?? 1, budget: opts.budget ?? null, exclude: (opts.exclude || []).slice(), nuocRate: opts.nuocRate ?? 0.25, dessert: !!opts.dessert,
  };
  const profile = JSON.parse(JSON.stringify(opts.profile));
  const ctx = makeContext(params, profile, data);
  const rng = makeRng('plan|' + params.seed + '|' + params.month);
  const warnings = [];
  if (profile.region && profile.region !== 'bac') warnings.push('Dữ liệu hiện chỉ có món miền Bắc; vùng "' + profile.region + '" chưa hỗ trợ.');
  ctx.pf.babies.length === 0 && profile.people.some((p) => ageMonthsOf(p) < 6) && warnings.push('Có bé dưới 6 tháng: chưa ăn dặm, không có món riêng.');
  const st = { used: new Set(), pending: new Set(), lastProteins: null, lastIngredients: null };
  const lastBaby = {};
  const out = [];
  const mealOrder = MEALS.filter((m) => params.meals.includes(m));
  for (let day = 1; day <= params.days; day++) {
    const dayMeals = {};
    for (const meal of mealOrder) {
      const res = composeMeal(ctx, rng, st, meal, params);
      const pm = { meal, items: res.items, baby: [], notes: res.notes };
      if (meal !== 'sang') pm.baby = pickBaby(ctx, rng, st, lastBaby);
      else if (ctx.pf.babies.length) pm.baby = pickBaby(ctx, rng, st, lastBaby);
      if (params.dessert && meal === 'toi') {
        const r = choose(ctx, rng, st, { pool: ctx.allowed.filter((d) => d.role === 'trang_mieng'), requireToddler: false, maxLevel: 2 });
        if (r) { pm.items.push(mkItem('dessert', r.dish, r.why)); st.used.add(r.dish.id); }
      }
      res.notes.forEach((n) => warnings.push('Ngày ' + day + ' (' + meal + '): ' + n));
      const mainProt = proteinSet(res.items, ctx);
      if (meal !== 'sang' && mainProt.size) st.lastProteins = mainProt;
      st.lastIngredients = ingSet(res.items, ctx);
      dayMeals[meal] = pm;
    }
    out.push({ day, meals: dayMeals });
  }
  return { version: 1, params, profile, days: out, warnings };
}

function findSlot(plan, slot) {
  const day = plan.days[(slot.day || 0) - 1];
  if (!day) throw new Error('Không có ngày ' + slot.day + ' trong thực đơn.');
  const meal = day.meals[slot.meal];
  if (!meal) throw new Error('Không có bữa "' + slot.meal + '" ở ngày ' + slot.day + '.');
  const idx = meal.items.findIndex((it) => it.slot === slot.slot);
  if (idx < 0) throw new Error('Không có ô "' + slot.slot + '" trong bữa này.');
  return { day, meal, idx };
}

/**
 * Đổi món ở một ô, giữ nguyên các ô khác. Trả về thực đơn mới (không sửa bản gốc).
 * @param {Plan} plan
 * @param {{day:number, meal:string, slot:string}} slot  day tính từ 1; slot: 'canh','man1','man2','rau','mon_nuoc','sang','dessert'
 * @param {{dishId?:string, avoidDishIds?:string[], attempt?:number, data?:any}} [options]  dishId: ép chọn món cụ thể (vẫn kiểm tra dị ứng/tuổi)
 * @returns {Plan}
 */
export function swapDish(plan, slot, options = {}) {
  const data = getData(options.data);
  const next = JSON.parse(JSON.stringify(plan));
  const { meal, idx } = findSlot(next, slot);
  const ctx = makeContext(next.params, next.profile, data);
  const current = meal.items[idx];
  const used = new Set();
  next.days.forEach((d) => Object.values(d.meals).forEach((m) => m.items.forEach((it) => { if (it !== current) used.add(it.dishId); })));
  (options.avoidDishIds || []).forEach((id) => used.add(id));
  used.add(current.dishId);
  // bữa trước để tránh trùng đạm
  const flat = [];
  next.days.forEach((d) => Object.values(d.meals).forEach((m) => flat.push(m)));
  let mi = flat.indexOf(meal) - 1;
  while (mi >= 0 && flat[mi].meal === 'sang') mi--;
  const prev = mi >= 0 ? flat[mi] : null;
  const st = {
    used, pending: new Set(),
    lastProteins: prev ? proteinSet(prev.items, ctx) : null,
    lastIngredients: prev ? ingSet(prev.items, ctx) : null,
    mealIngredients: ingSet(meal.items.filter((it) => it !== current), ctx),
  };
  if (options.dishId) {
    const d = ctx.dishIx.get(options.dishId);
    if (!d) throw new Error('Không có món "' + options.dishId + '".');
    if (d.avoid.some((a) => ctx.pf.avoid.has(a))) throw new Error('Món "' + d.name + '" chứa thành phần cần kiêng/dị ứng của gia đình.');
    if (d.minAgeMonths > ctx.pf.minEaterAge) throw new Error('Món "' + d.name + '" chưa phù hợp với độ tuổi nhỏ nhất trong nhà.');
    if (ctx.pf.noSpicy && d.avoid.includes('cay')) throw new Error('Món "' + d.name + '" cay, không phù hợp.');
    meal.items[idx] = mkItem(current.slot, d, ['Đổi theo lựa chọn của bạn']);
    return next;
  }
  const rng = makeRng('swap|' + next.params.seed + '|' + slot.day + slot.meal + slot.slot + '|' + (options.attempt || 0) + '|' + current.dishId);
  const old = ctx.dishIx.get(current.dishId);
  const wantRole = (d) => {
    if (current.slot === 'canh') return d.role === 'canh';
    if (current.slot.startsWith('man')) return isMan(d);
    if (current.slot === 'rau') return isVegSide(d);
    if (current.slot === 'mon_nuoc') return d.role === 'mon_nuoc';
    if (current.slot === 'dessert') return d.role === 'trang_mieng';
    if (current.slot === 'sang') return d.role === 'an_vat' || d.role === 'mon_nuoc';
    return d.role === old.role;
  };
  const otherProt = new Set(meal.items.filter((it) => it !== current && it.slot.startsWith('man')).map((it) => ctx.dishIx.get(it.dishId).protein[0]));
  const avoidP = current.slot.startsWith('man') ? new Set([...(st.lastProteins || []), ...otherProt]) : null;
  const softP = current.slot === 'canh' ? otherProt : null;
  const r = choose(ctx, rng, st, { pool: ctx.allowed.filter((d) => wantRole(d) && d.course.includes(slot.meal)), avoidProtein: avoidP, softProtein: softP, requireToddler: current.slot !== 'dessert' && current.slot !== 'mon_nuoc' });
  if (!r) throw new Error('Không còn món phù hợp để đổi.');
  r.why.unshift('Đổi món theo yêu cầu (thay ' + current.name + ')');
  meal.items[idx] = mkItem(current.slot, r.dish, r.why);
  return next;
}

/** Danh sách món không lặp của cả thực đơn (tiện dùng làm `exclude` cho tuần kế tiếp). */
export function dishIdsOfPlan(plan) {
  const ids = [];
  plan.days.forEach((d) => Object.values(d.meals).forEach((m) => m.items.forEach((it) => ids.push(it.dishId))));
  return ids;
}
