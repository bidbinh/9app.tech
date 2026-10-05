// Thực đơn tuần: lớp mỏng quanh thư viện menu-data (bản sao ở ./lib, đồng bộ bằng scripts/sync-menu-data.js).
// Mọi hàm ở đây là hàm thuần (không đụng CSDL) nên kiểm thử được độc lập.
import {
  setData, planWeek, swapDish, dishIdsOfPlan, shoppingFromPlan, normalizeItem, normalizeList, splitList,
  analyzeProfile, profileServings, personWeight, seasonOfMonth, SEASON_LABEL, AISLE_LABEL, fmtQty,
} from './lib/src/index.js';
import { loadData } from './lib/src/load-node.js';
import { ApiError } from '../errors.js';
import { intIn, normKey, stripAccents } from '../util.js';
import { addDays, weekdayISO, isValidDay } from '../vn.js';

export const DATA = loadData();
setData(DATA);
export const DISH = new Map(DATA.dishes.items.map((d) => [d.id, d]));
export const ING = new Map(DATA.ingredients.items.map((i) => [i.id, i]));
export { planWeek, swapDish, dishIdsOfPlan, shoppingFromPlan, normalizeItem, normalizeList, splitList, profileServings, fmtQty, AISLE_LABEL, SEASON_LABEL };

export const MEALS = ['sang', 'trua', 'toi'];
export const MEAL_LABEL = { sang: 'Bữa sáng', trua: 'Bữa trưa', toi: 'Bữa tối' };
export const SLOT_LABEL = { canh: 'Canh', man1: 'Món mặn', man2: 'Món mặn thứ hai', rau: 'Rau', mon_nuoc: 'Món nước', sang: 'Đồ ăn sáng', dessert: 'Tráng miệng' };
export const AVOID_LABEL = { hai_san: 'Hải sản', trung: 'Trứng', sua: 'Sữa', dau_phong: 'Đậu phộng (lạc)', gluten: 'Gluten (bột mì)', thit_heo: 'Thịt heo', thit_bo: 'Thịt bò', cay: 'Đồ cay', dau_nanh: 'Đậu nành' };
export const AVOID_KEYS = Object.keys(AVOID_LABEL);
export const DIET_LABEL = { it_muoi: 'Ít muối', it_duong: 'Ít đường', it_dau_mo: 'Ít dầu mỡ', de_nhai: 'Mềm, dễ nhai' };
export const DIET_KEYS = Object.keys(DIET_LABEL);
export const BUDGETS = ['tiet_kiem', 'vua', 'thoai_mai'];
export const BUDGET_LABEL = { tiet_kiem: 'Tiết kiệm', vua: 'Vừa phải', thoai_mai: 'Thoải mái' };
export const SOURCE_CHECK = {
  doi_chieu_so_lieu: { level: 3, kind: 'ok', label: 'Đã đối chiếu số liệu', text: 'Khối lượng nguyên liệu chính đã được so với số liệu của nguồn công thức (sai lệch trong ±50%).' },
  cong_thuc_cung_mon: { level: 2, kind: 'info', label: 'Có công thức cùng món', text: 'Có nguồn công thức của đúng món này, nhưng khối lượng chưa được đối chiếu từng con số.' },
  cong_thuc_tuong_tu: { level: 1, kind: 'warn', label: 'Ước lượng theo món tương tự', text: 'Công thức dựa trên món tương tự; khối lượng là ước lượng theo khẩu phần thông thường, hãy nêm nếm theo khẩu vị nhà bạn.' },
  tham_khao_chung: { level: 0, kind: 'warn', label: 'Chỉ tham khảo chung', text: 'Chưa có công thức nào đối chiếu được, chỉ dựa trên hướng dẫn dinh dưỡng chung. Hãy xem như gợi ý.' },
};
export const DISCLAIMER = 'Gợi ý tham khảo từ kho món ăn miền Bắc, không phải tư vấn y tế hay dinh dưỡng. Nhà có người bệnh (tiểu đường, huyết áp, thận...) hoặc bé dưới 12 tháng: hãy hỏi bác sĩ.';

// ---------- thời gian ----------
export const mondayOf = (day) => addDays(day, 1 - weekdayISO(day));
export const weekMonth = (weekStart) => Number(addDays(weekStart, 3).slice(5, 7));
export function cleanWeekStart(v, fallbackDay) {
  const day = v === undefined || v === null || v === '' ? fallbackDay : v;
  if (!isValidDay(day)) throw new ApiError(400, 'invalid_input', 'Ngày không hợp lệ (cần dạng năm-tháng-ngày)', { field: 'Tuần' });
  return mondayOf(day);
}

// ---------- hồ sơ ăn uống ----------
export function defaultProfile(members = []) {
  const elders = Math.min(2, members.filter((m) => !m.external && (m.relation === 'ong' || m.relation === 'ba')).length);
  const adults = Math.max(1, Math.min(2, members.filter((m) => !m.external && !['ong', 'ba', 'giup_viec', 'don_ho'].includes(m.relation)).length || 2));
  return { adults, elders, meals: ['trua', 'toi'], budget: null, noSpicy: false, diet: [], members: {}, excludeChildren: [], pantryHave: [], shopReminder: { on: false, time: '17:00' }, dessert: false };
}

const bad = (field, msg) => new ApiError(400, 'invalid_input', msg || `${field} không hợp lệ`, { field });
function pickList(v, allowed, field) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad(field);
  const out = [];
  for (const x of v) { if (!allowed.includes(x)) throw bad(field, `${field}: giá trị "${String(x).slice(0, 20)}" không hợp lệ`); if (!out.includes(x)) out.push(x); }
  return out;
}
const labelClean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);

// Kiểm tra nghiêm hồ sơ gửi lên. childIds: id các con của gia đình (khóa lạ bị loại bỏ, không báo lỗi).
export function cleanProfile(b, childIds = []) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Hồ sơ');
  const p = {};
  p.adults = intIn(b.adults ?? 2, { min: 0, max: 8, field: 'Số người lớn' });
  p.elders = intIn(b.elders ?? 0, { min: 0, max: 6, field: 'Số ông bà, người cao tuổi' });
  p.meals = pickList(b.meals ?? ['trua', 'toi'], MEALS, 'Bữa ăn');
  if (!p.meals.length) throw bad('Bữa ăn', 'Hãy chọn ít nhất một bữa cần lên thực đơn');
  p.meals = MEALS.filter((m) => p.meals.includes(m));
  if (b.budget !== undefined && b.budget !== null && b.budget !== '' && !BUDGETS.includes(b.budget)) throw bad('Ngân sách');
  p.budget = BUDGETS.includes(b.budget) ? b.budget : null;
  p.noSpicy = b.noSpicy === true;
  p.dessert = b.dessert === true;
  p.diet = pickList(b.diet, DIET_KEYS, 'Ưu tiên ăn uống');
  p.members = {};
  const raw = b.members && typeof b.members === 'object' && !Array.isArray(b.members) ? b.members : {};
  const okKey = (k) => {
    let m = /^(adult|elder):(\d{1,2})$/.exec(k);
    if (m) return m[1] === 'adult' ? Number(m[2]) >= 1 && Number(m[2]) <= p.adults : Number(m[2]) >= 1 && Number(m[2]) <= p.elders;
    m = /^child:([0-9a-f-]{36})$/i.exec(k);
    return !!m && childIds.includes(m[1].toLowerCase());
  };
  for (const k of Object.keys(raw).slice(0, 40)) {
    if (!okKey(k)) continue;
    const v = raw[k] || {};
    const e = { label: labelClean(v.label), avoid: pickList(v.avoid, AVOID_KEYS, 'Kiêng, dị ứng'), diet: pickList(v.diet, DIET_KEYS, 'Ưu tiên ăn uống') };
    if (k.startsWith('child:') && v.birthMonth !== undefined && v.birthMonth !== null && v.birthMonth !== '') e.birthMonth = intIn(v.birthMonth, { min: 1, max: 12, field: 'Tháng sinh' });
    if (e.label || e.avoid.length || e.diet.length || e.birthMonth) p.members[k.toLowerCase()] = e;
  }
  p.excludeChildren = [...new Set((Array.isArray(b.excludeChildren) ? b.excludeChildren : []).map((x) => String(x).toLowerCase()).filter((x) => childIds.includes(x)))];
  p.pantryHave = [...new Set((Array.isArray(b.pantryHave) ? b.pantryHave : []).filter((x) => ING.has(x)))].slice(0, 80);
  const sr = b.shopReminder && typeof b.shopReminder === 'object' ? b.shopReminder : {};
  const time = typeof sr.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(sr.time) ? sr.time : '17:00';
  p.shopReminder = { on: sr.on === true, time };
  if (p.adults + p.elders + (childIds.length - p.excludeChildren.length) < 1) throw bad('Số người', 'Cần ít nhất một người ăn trong gia đình');
  return p;
}

// Số tháng tuổi của con. Chỉ có năm sinh thì chọn cách an toàn cho bé nhỏ (tuổi thấp nhất có thể).
export function childAgeMonths(child, bm, today) {
  const y = Number(today.slice(0, 4)); const m = Number(today.slice(5, 7));
  const by = child.birth_year ?? child.birthYear;
  if (!by) return { months: 96, approx: true, unknown: true };
  if (bm) return { months: Math.max(0, (y - by) * 12 + (m - bm)), approx: false };
  const diff = y - by;
  if (diff <= 1) return { months: Math.max(0, diff * 12 + m - 12), approx: true };
  return { months: diff * 12 + m - 6, approx: true };
}

// Hồ sơ lưu -> hồ sơ cho planner + danh sách người để hiển thị + cảnh báo
export function buildPlannerProfile(profile, children, today) {
  const warnings = []; const people = [];
  const mem = profile.members || {};
  const add = (key, label, kind, person, extra = {}) => {
    const cfg = mem[key] || {};
    person.avoid = [...new Set([...(cfg.avoid || []), ...(profile.noSpicy ? ['cay'] : [])])];
    person.diet = [...new Set([...(cfg.diet || []), ...(profile.diet || [])])];
    people.push({ key, label: cfg.label || label, kind, ageMonths: Math.round(person.ageMonths ?? (person.ageYears * 12)), avoid: cfg.avoid || [], diet: cfg.diet || [], weight: personWeight(person), ...extra, person });
  };
  for (let i = 1; i <= profile.adults; i++) add(`adult:${i}`, profile.adults === 1 ? 'Người lớn' : `Người lớn ${i}`, 'adult', { ageYears: 36 });
  for (let i = 1; i <= profile.elders; i++) add(`elder:${i}`, profile.elders === 1 ? 'Ông bà' : `Ông bà ${i}`, 'elder', { ageYears: 70, role: 'ba' });
  for (const c of children) {
    if ((profile.excludeChildren || []).includes(c.id)) continue;
    const key = `child:${c.id}`;
    const a = childAgeMonths(c, (mem[key] || {}).birthMonth, today);
    if (a.unknown) warnings.push(`Chưa có năm sinh của ${c.name}: tạm tính 8 tuổi. Hãy nhập năm sinh ở hồ sơ con để thực đơn đúng độ tuổi.`);
    else if (a.approx && a.months < 30) warnings.push(`Chưa biết tháng sinh của ${c.name}: tạm tính ${a.months} tháng tuổi (mức nhỏ nhất có thể). Hãy nhập tháng sinh để chính xác hơn.`);
    add(key, c.name, 'child', { ageMonths: a.months }, { childId: c.id, approx: a.approx });
  }
  if (!people.length) throw bad('Số người', 'Cần ít nhất một người ăn trong gia đình');
  const plannerPeople = people.map((p) => p.person);
  const servings = profileServings({ people: plannerPeople });
  return { profile: { region: 'bac', people: plannerPeople }, people: people.map(({ person, ...rest }) => rest), servings, warnings };
}

// ---------- lập thực đơn ----------
const cellKey = (day, meal, slot) => `${day}:${meal}:${slot}`;
export { cellKey };

export function allergenConflicts(dish, plannerProfile) {
  const pf = analyzeProfile(plannerProfile);
  const hits = dish.avoid.filter((a) => pf.avoid.has(a));
  if (pf.noSpicy && dish.avoid.includes('cay') && !hits.includes('cay')) hits.push('cay');
  return { hits, tooYoung: dish.minAgeMonths > pf.minEaterAge };
}

/**
 * Lập một tuần.
 * @param {{weekStart:string, profile:object, children:object[], today:string, hidden:string[], prevDishIds:string[], gen:number, old?:{plan:object, locks:string[]}}} o
 */
export function buildWeekPlan(o) {
  const built = buildPlannerProfile(o.profile, o.children, o.today);
  const month = weekMonth(o.weekStart);
  const locks = (o.old && o.old.locks) || [];
  const lockedIds = new Set();
  if (o.old) for (const k of locks) { const [d, m, s] = k.split(':'); const it = findItem(o.old.plan, Number(d), m, s); if (it) lockedIds.add(it.dishId); }
  const exclude = [...new Set([...(o.hidden || []), ...(o.prevDishIds || []), ...lockedIds])];
  const seed = `${o.weekStart}|${o.gen}`;
  let plan = planWeek({ month, profile: built.profile, days: 7, meals: o.profile.meals, budget: o.profile.budget, exclude, seed, dessert: !!o.profile.dessert });
  if (o.old && locks.length) plan = overlayLocks(plan, o.old.plan, locks);
  plan.params.weekStart = o.weekStart;
  plan.params.hidden = o.hidden || [];
  return { plan, warnings: [...built.warnings, ...plan.warnings], built };
}

function findItem(plan, day, meal, slot) {
  const m = plan.days[day - 1] && plan.days[day - 1].meals[meal];
  return m ? m.items.find((it) => it.slot === slot) : null;
}

function overlayLocks(fresh, old, locks) {
  const byMeal = new Map();
  for (const k of locks) { const [d, m, s] = k.split(':'); const key = `${d}:${m}`; if (!byMeal.has(key)) byMeal.set(key, new Set()); byMeal.get(key).add(s); }
  for (const [key, slots] of byMeal) {
    const [d, m] = key.split(':'); const day = Number(d);
    const oldMeal = old.days[day - 1] && old.days[day - 1].meals[m];
    const newMeal = fresh.days[day - 1] && fresh.days[day - 1].meals[m];
    if (!oldMeal || !newMeal) continue;
    const items = oldMeal.items.map((it) => {
      if (slots.has(it.slot)) return { ...it, why: [...it.why.filter((w) => !/^Giữ nguyên/.test(w)), 'Giữ nguyên vì bạn đã khóa món này'] };
      return newMeal.items.find((n) => n.slot === it.slot) || it;
    });
    newMeal.items = items;
  }
  return fresh;
}

const RELAXED_RE = /ngoài mùa|dùng lại món|Chưa tránh được/;
export function describeItem(it, locked) {
  const d = DISH.get(it.dishId);
  return {
    slot: it.slot, slotLabel: SLOT_LABEL[it.slot] || it.slot, dishId: it.dishId, name: it.name, why: it.why, locked: !!locked,
    relaxed: it.why.some((w) => RELAXED_RE.test(w)),
    time: d ? d.timeMinutes : null, cost: d ? d.costLevel : null, sourceCheck: d ? d.sourceCheck : null,
  };
}

// Thực đơn lưu -> JSON gửi về trình duyệt (kèm khóa, nhãn, lý do)
export function decoratePlan(plan, locks = []) {
  const lockSet = new Set(locks);
  return {
    month: plan.params.month, season: plan.params.season, seasonLabel: SEASON_LABEL[plan.params.season], meals: plan.params.meals,
    servings: profileServings(plan.profile),
    days: plan.days.map((d) => ({
      day: d.day,
      meals: Object.fromEntries(MEALS.filter((mk) => d.meals[mk]).map((mk) => [mk, d.meals[mk]]).map(([mk, m]) => [mk, {
        meal: mk, label: MEAL_LABEL[mk], items: m.items.map((it) => describeItem(it, lockSet.has(cellKey(d.day, mk, it.slot)))),
        baby: (m.baby || []).map((b) => ({ dishId: b.dishId, name: b.name, ageMonths: b.ageMonths, why: b.why })), notes: m.notes || [],
      }])),
    })),
    warnings: plan.warnings || [],
  };
}

// Đổi món một ô; trả plan mới. hidden: món đã ẩn (luôn bị loại khỏi lựa chọn tự động).
export function swapCell(plan, cell, { dishId, hidden = [], attempt = 0, avoid = [] } = {}) {
  const base = JSON.parse(JSON.stringify(plan));
  base.params.exclude = [...new Set([...(base.params.exclude || []), ...hidden])];
  try {
    return swapDish(base, cell, { dishId, attempt, avoidDishIds: avoid });
  } catch (e) {
    throw new ApiError(400, 'cannot_swap', e.message || 'Không đổi được món này');
  }
}

// 3-5 món thay thế cho một ô (mỗi món kèm lý do); không trả món đang có trong tuần
export function alternativesFor(plan, cell, { hidden = [], max = 5 } = {}) {
  const found = []; const ids = new Set();
  const cur = findItem(plan, cell.day, cell.meal, cell.slot);
  if (!cur) throw new ApiError(404, 'not_found', 'Không có ô này trong thực đơn');
  ids.add(cur.dishId);
  for (let attempt = 0; attempt < 12 && found.length < max; attempt++) {
    let next;
    try { next = swapCell(plan, cell, { hidden, attempt, avoid: [...ids] }); } catch { break; }
    const it = findItem(next, cell.day, cell.meal, cell.slot);
    if (!it || ids.has(it.dishId)) continue;
    // loại món đã nằm ở ô khác trong tuần (planner có thể buộc dùng lại khi hết món)
    const inPlan = dishIdsOfPlan(plan).includes(it.dishId);
    ids.add(it.dishId);
    if (inPlan) continue;
    found.push({ ...describeItem(it, false), why: it.why });
  }
  return found;
}

// Tìm món theo tên để chọn tay (đã lọc dị ứng/tuổi theo hồ sơ), tối đa 20
export function searchDishes(q, role, plannerProfile, hidden = []) {
  const k = normKey(q || '');
  const pf = analyzeProfile(plannerProfile);
  const hide = new Set(hidden);
  const roles = role === 'canh' ? ['canh'] : role === 'man' ? ['man', 'xao', 'chay'] : role === 'rau' ? ['luoc', 'rau', 'xao'] : role === 'mon_nuoc' ? ['mon_nuoc'] : role === 'dessert' ? ['trang_mieng'] : role === 'sang' ? ['an_vat', 'mon_nuoc'] : null;
  const out = [];
  for (const d of DATA.dishes.items) {
    if (d.role === 'chao_bot' || hide.has(d.id)) continue;
    if (roles && !roles.includes(d.role)) continue;
    if (k && !normKey(d.name).includes(k)) continue;
    if (d.avoid.some((a) => pf.avoid.has(a)) || d.minAgeMonths > pf.minEaterAge || (pf.noSpicy && d.avoid.includes('cay'))) continue;
    out.push({ dishId: d.id, name: d.name, time: d.timeMinutes, cost: d.costLevel, sourceCheck: d.sourceCheck });
    if (out.length >= 20) break;
  }
  return out;
}

// ---------- chi tiết món ----------
function niceQty(q, unit) {
  if (unit === 'g' || unit === 'ml') {
    if (q >= 100) return Math.round(q / 5) * 5;
    if (q >= 20) return Math.round(q);
    return Math.round(q * 10) / 10;
  }
  return Math.round(q * 4) / 4 || 0.25;
}
export function dishDetail(id, servings, plannerProfile) {
  const d = DISH.get(id);
  if (!d) return null;
  const factor = servings && d.servingsBase ? servings / d.servingsBase : 1;
  const sc = SOURCE_CHECK[d.sourceCheck] || SOURCE_CHECK.tham_khao_chung;
  const out = {
    id: d.id, name: d.name, role: d.role, seasons: d.seasons, seasonNote: d.seasonNote || '', timeMinutes: d.timeMinutes, costLevel: d.costLevel,
    minAgeMonths: d.minAgeMonths, suitability: d.suitability, avoid: d.avoid, avoidLabels: d.avoid.map((a) => AVOID_LABEL[a] || a), notes: d.notes || '',
    servingsBase: d.servingsBase, servings: servings || d.servingsBase, steps: d.steps,
    sourceCheck: { key: d.sourceCheck, ...sc }, sources: (d.sources || []).map((s) => ({ name: s.name, url: s.url, scope: s.scope })),
    ingredients: d.ingredients.map((i) => {
      const ing = ING.get(i.id);
      const q = niceQty(i.qty * factor, i.unit);
      return { id: i.id, name: ing ? ing.name : i.id, qty: q, unit: i.unit, display: fmtQty(q, i.unit), optional: !!i.optional, pantry: !!(ing && ing.pantry) };
    }),
    babyDish: d.role === 'chao_bot',
  };
  if (plannerProfile) { const c = allergenConflicts(d, plannerProfile); out.conflicts = { avoid: c.hits.map((a) => AVOID_LABEL[a] || a), tooYoung: c.tooYoung }; }
  return out;
}

// ---------- mục đi chợ ----------
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const UNIT_OK = new Set(['g', 'kg', 'ml', 'l', 'qua', 'bo', 'cu', 'mieng', 'hop', 'goi', 'tui', 'con', 'chai', 'lon', 'cai', 'chiec', 'vien', 'cuon', 'doi', 'cay', 'tep', 'thia', 'thung', 'loc', 'vi', 'lo', 'tuyp', 'nai', 'o', 'ly']);

// Chuẩn hóa một mục gõ/nói/Osin. opts.qty/unit ghi đè (Osin gửi số lượng riêng)
export function prepareShopItem(rawText, opts = {}) {
  const text = String(rawText ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const n = normalizeItem(text);
  let qty = n.qty; let unit = n.unit;
  if (opts.qty !== undefined && opts.qty !== null && opts.qty !== '') {
    const q = Number(opts.qty);
    if (!Number.isFinite(q) || q <= 0 || q > 100000) throw bad('Số lượng', 'Số lượng phải là số dương hợp lý');
    qty = Math.round(q * 100) / 100; unit = null;
  }
  if (opts.unit !== undefined && opts.unit !== null && opts.unit !== '') {
    const u = stripAccents(String(opts.unit)).toLowerCase().trim();
    unit = UNIT_OK.has(u) ? u : (({ ky: 'kg', lit: 'l', trai: 'qua', mo: 'bo', bich: 'tui' })[u] || null);
    if (!unit) throw bad('Đơn vị', 'Đơn vị chưa hỗ trợ (ví dụ: g, kg, bó, quả, hộp, gói, chai)');
  }
  const ing = n.ingredientId ? ING.get(n.ingredientId) : null;
  // Tên: dùng tên chuẩn khi người dùng chỉ khác dấu/chữ hoa hoặc sai chính tả nhẹ ("mấm tôm", "rau mống"); còn lại giữ cách gọi của họ ("trứng", "bột ngọt")
  const typed = n.name || '';
  const useCanon = ing && n.canonicalName && (n.fuzzy || (n.confidence === 'exact' && stripAccents(typed).toLowerCase() === stripAccents(n.canonicalName).toLowerCase()));
  let base = (useCanon ? n.canonicalName : typed) || text;
  if (!useCanon) { // giữ chữ viết hoa của từ viết tắt người dùng gõ (AA, USB)
    const caps = new Map(text.split(/\s+/).filter((w) => /^[A-Z0-9]{2,4}$/.test(w)).map((w) => [w.toLowerCase(), w]));
    base = base.split(' ').map((w) => caps.get(w) || w).join(' ');
  }
  const name = cap(base.trim()).slice(0, 60);
  const display = qty != null ? fmtQty(qty, unit) : '';
  const outText = composeText(name, qty, unit);
  return {
    text: outText, name, qty, unit, ingredientId: ing ? ing.id : null, aisle: ing ? ing.aisle : null,
    confidence: n.confidence, review: n.confidence !== 'exact' && !n.fuzzy ? true : !!n.fuzzy, normKey: normKey(name) + '|' + (unit || ''), note: n.note || '', approx: !!n.approx, display, raw: text,
  };
}

// "Nước mắm · 1 chai" (không số lượng: chỉ tên)
export function composeText(name, qty, unit) {
  const d = qty != null ? fmtQty(Number(qty), unit) : '';
  return `${name}${d ? ' · ' + d : ''}`.trim().slice(0, 80);
}

// Dòng thực đơn -> thông tin để ghi vào shopping
export function menuShoppingLines(plan, { haveIds = [], buyPantry = [], includeOptional = true } = {}) {
  const res = shoppingFromPlan(plan, { pantryMode: 'ask', includeOptional });
  const all = [...res.lines, ...res.pantryCheck.filter((l) => buyPantry.includes(l.ingredientId))];
  const have = new Set(haveIds);
  return {
    servings: res.servings,
    lines: all.map((l) => ({
      ingredientId: l.ingredientId, name: l.name, aisle: l.aisle, qty: l.quantity, unit: l.unit, display: l.display, optional: l.optional, pantry: l.pantry,
      fromDishes: [...new Map(l.fromDishes.map((f) => [f.dishId, { dishId: f.dishId, name: f.name }])).values()], note: l.note || '', have: have.has(l.ingredientId),
    })),
    pantryCheck: res.pantryCheck.map((l) => ({ ingredientId: l.ingredientId, name: l.name, aisle: l.aisle })).filter((l) => !buyPantry.includes(l.ingredientId)),
    unresolved: res.unresolved,
  };
}

// Gom thành nhóm theo khu quầy (dùng cho văn bản chia sẻ)
export const AISLE_ORDER = ['rau_cu', 'thit_ca', 'hai_san', 'trung_dau_phu', 'trai_cay', 'do_kho_gao_bun', 'gia_vi', 'sua_banh', 'do_uong', 'gia_dung', 'khac'];
export const AISLE_NAMES = { ...AISLE_LABEL, gia_dung: 'Đồ dùng', khac: 'Khác' };
export { seasonOfMonth };
