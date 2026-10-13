// Gộp danh sách đi chợ từ thực đơn: cộng dồn theo nguyên liệu, quy đổi đơn vị, nhân suất, làm tròn để mua.
import { getData, indexes, profileServings, fmtNum } from './common.js';
import { normalizeItem } from './normalize.js';

/**
 * @typedef {Object} ShoppingLine
 * @property {string} id             id dòng (ingredientId hoặc 'extra-N')
 * @property {string|null} ingredientId
 * @property {string} name
 * @property {string} aisle
 * @property {number|null} quantity  số lượng đã làm tròn để mua
 * @property {string|null} unit      'g','kg','ml','l','qua','bo',...
 * @property {string} display        chuỗi hiển thị, ví dụ '1,2 kg'
 * @property {number|null} exactQty  tổng chính xác theo đơn vị cơ sở (g hoặc ml)
 * @property {'g'|'ml'|null} baseUnit
 * @property {boolean} pantry        là đồ thường có sẵn
 * @property {boolean} optional      chỉ có trong công thức dưới dạng tùy chọn
 * @property {boolean} extra         mục ghi thêm ngoài công thức
 * @property {{dishId:string, name:string, qty:number, unit:string}[]} fromDishes  món cần nguyên liệu này (qty theo đơn vị cơ sở)
 * @property {string} [note]
 */

export const AISLE_LABEL = {
  rau_cu: 'Rau củ', thit_ca: 'Thịt, cá', hai_san: 'Hải sản', trung_dau_phu: 'Trứng, đậu phụ', do_kho_gao_bun: 'Gạo, bún, đồ khô',
  gia_vi: 'Gia vị', trai_cay: 'Trái cây', sua_banh: 'Sữa, bánh', do_uong: 'Đồ uống', khac: 'Khác',
};
const AISLE_ORDER = ['rau_cu', 'thit_ca', 'hai_san', 'trung_dau_phu', 'do_kho_gao_bun', 'gia_vi', 'trai_cay', 'sua_banh', 'do_uong', 'khac'];

/** Đổi (qty, unit) của một nguyên liệu sang đơn vị cơ sở (g hoặc ml). Trả null nếu không quy đổi được. */
export function toBase(ing, qty, unit) {
  if (unit === 'g' || unit === 'ml') return ing.base === unit ? qty : null;
  if (unit === 'kg') return ing.base === 'g' ? qty * 1000 : null;
  if (unit === 'l') return ing.base === 'ml' ? qty * 1000 : null;
  if (ing.conv && ing.conv[unit]) return qty * ing.conv[unit];
  return null;
}

/**
 * Làm tròn lượng cơ sở thành số lượng mua hợp lý.
 * g: <100 làm tròn lên 10 g; 100-999 lên 50 g; từ 1000 đổi kg, lên 0,05 kg. ml tương tự (l).
 * Đơn vị đếm (quả, bó, củ...): làm tròn lên số nguyên.
 */
export function roundForShopping(ing, baseQty) {
  const du = ing.unitDefault;
  if (du === 'g' || du === 'ml') {
    const big = du === 'g' ? 'kg' : 'l';
    let q;
    if (baseQty < 100) q = Math.ceil(baseQty / 10 - 1e-9) * 10;
    else if (baseQty < 1000) q = Math.ceil(baseQty / 50 - 1e-9) * 50;
    else q = Math.ceil(baseQty / 50 - 1e-9) * 50;
    if (q >= 1000) return { quantity: Math.round(q / 10) / 100, unit: big };
    return { quantity: q, unit: du };
  }
  const per = ing.conv[du];
  const n = Math.max(1, Math.ceil(baseQty / per - 0.1));
  return { quantity: n, unit: du };
}

const UNIT_LABEL = { g: 'g', kg: 'kg', ml: 'ml', l: 'lít', qua: 'quả', bo: 'bó', cu: 'củ', mieng: 'miếng', hop: 'hộp', goi: 'gói', con: 'con', cay: 'cây', tep: 'tép', tui: 'túi', thia: 'thìa', chai: 'chai', lon: 'lon', vien: 'viên', thung: 'thùng', cai: 'cái', chiec: 'chiếc', cuon: 'cuộn', doi: 'đôi', loc: 'lốc', vi: 'vỉ', lo: 'lọ', tuyp: 'tuýp', nai: 'nải', o: 'ổ', ly: 'ly' };
export function fmtQty(quantity, unit) {
  if (quantity == null) return '';
  return fmtNum(quantity) + ' ' + (UNIT_LABEL[unit] || unit || '');
}

/** Hệ số nhân suất: số suất người lớn tương đương / servingsBase của món. */
function servingsFrom(plan, opts) {
  if (Number.isFinite(opts.servings)) return opts.servings;
  if (Array.isArray(opts.people)) return profileServings({ people: opts.people });
  if (Number.isFinite(opts.people)) return opts.people;
  if (plan.profile) return profileServings(plan.profile);
  throw new Error('Cần servings hoặc people (hoặc plan.profile).');
}

/**
 * Gộp danh sách đi chợ.
 * @param {import('./planner.js').Plan} plan
 * @param {Object} [opts]
 * @param {number} [opts.servings]  số suất người lớn tương đương (ghi đè)
 * @param {(number|import('./common.js').Person[])} [opts.people]  số người hoặc danh sách người (tính theo tuổi)
 * @param {'skip'|'include'|'ask'} [opts.pantryMode='skip']  skip: bỏ đồ có sẵn; include: đưa vào danh sách (đánh dấu); ask: gom riêng vào pantryCheck để hỏi "nhà còn không"
 * @param {string[]} [opts.have]  id nguyên liệu nhà đã có (bỏ khỏi danh sách)
 * @param {boolean} [opts.includeOptional=true]  gồm nguyên liệu tùy chọn (đánh dấu optional)
 * @param {string[]} [opts.skipMeals]  bỏ qua các bữa ('1:trua' = ngày 1 bữa trưa) vì đã ăn ngoài
 * @param {import('./common.js').MenuData} [opts.data]
 */
export function shoppingFromPlan(plan, opts = {}) {
  const data = getData(opts.data);
  const { dish: dishIx, ing: ingIx } = indexes(data);
  const pantryMode = opts.pantryMode || 'skip';
  if (!['skip', 'include', 'ask'].includes(pantryMode)) throw new Error("pantryMode phải là 'skip', 'include' hoặc 'ask'.");
  const have = new Set(opts.have || []);
  const includeOptional = opts.includeOptional !== false;
  const skipMeals = new Set(opts.skipMeals || []);
  const servings = servingsFrom(plan, opts);
  const acc = new Map();
  const unresolved = [];

  const addDish = (dishId, factorServings, slotLabel) => {
    const dish = dishIx.get(dishId);
    if (!dish) { unresolved.push(dishId); return; }
    const factor = factorServings / (dish.servingsBase || 4);
    for (const i of dish.ingredients) {
      if (i.optional && !includeOptional) continue;
      const ing = ingIx.get(i.id);
      if (!ing) continue;
      const base = toBase(ing, i.qty, i.unit);
      if (base == null) continue;
      const q = base * factor;
      let rec = acc.get(i.id);
      if (!rec) { rec = { ing, total: 0, optionalOnly: true, from: new Map() }; acc.set(i.id, rec); }
      rec.total += q;
      if (!i.optional) rec.optionalOnly = false;
      const f = rec.from.get(dishId) || { dishId, name: dish.name, qty: 0, unit: ing.base };
      f.qty += q;
      rec.from.set(dishId, f);
    }
  };

  for (const day of plan.days) {
    for (const [mealKey, meal] of Object.entries(day.meals)) {
      if (skipMeals.has(day.day + ':' + mealKey)) continue;
      for (const it of meal.items) addDish(it.dishId, servings, it.slot);
      for (const b of meal.baby || []) addDish(b.dishId, 1, 'baby');
    }
  }

  const lines = [];
  const pantryCheck = [];
  const haveSkipped = [];
  const pantrySkipped = [];
  for (const [id, rec] of acc) {
    const { ing } = rec;
    if (have.has(id)) { haveSkipped.push(id); continue; }
    if (ing.pantry && pantryMode === 'skip') { pantrySkipped.push(id); continue; }
    const r = roundForShopping(ing, rec.total);
    /** @type {ShoppingLine} */
    const line = {
      id, ingredientId: id, name: ing.name, aisle: ing.aisle,
      quantity: r.quantity, unit: r.unit, display: fmtQty(r.quantity, r.unit),
      exactQty: Math.round(rec.total * 10) / 10, baseUnit: ing.base,
      pantry: !!ing.pantry, optional: rec.optionalOnly, extra: false,
      fromDishes: [...rec.from.values()].map((f) => ({ ...f, qty: Math.round(f.qty * 10) / 10 })),
    };
    // gợi ý số quả/củ xấp xỉ khi mua theo cân
    if ((ing.unitDefault === 'g' || ing.unitDefault === 'ml') && ing.conv) {
      const k = Object.keys(ing.conv).find((u) => ['qua', 'cu', 'bo', 'mieng', 'con', 'cay'].includes(u));
      if (k && ing.unitDefault === 'g') {
        const n = Math.max(1, Math.round(rec.total / ing.conv[k]));
        line.note = '≈ ' + n + ' ' + UNIT_LABEL[k];
      }
    }
    if (ing.pantry && pantryMode === 'ask') pantryCheck.push(line);
    else lines.push(line);
  }
  const cmp = (a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name, 'vi');
  lines.sort(cmp);
  pantryCheck.sort(cmp);
  return buildResult({ servings, pantryMode, lines, pantryCheck, haveSkipped, pantrySkipped, unresolved });
}

function buildResult(r) {
  const byAisle = AISLE_ORDER.map((aisle) => ({ aisle, label: AISLE_LABEL[aisle], lines: r.lines.filter((l) => l.aisle === aisle) })).filter((g) => g.lines.length);
  return { ...r, byAisle };
}

/**
 * Thêm các mục ghi thêm ngoài công thức mà không gộp nhầm.
 * Quy tắc: mục chỉ được cộng vào dòng của một nguyên liệu khi tên khớp CHÍNH XÁC một nguyên liệu (hoặc bí danh)
 * và quy đổi được đơn vị; mọi mục còn lại ('mua thêm pin', 'bánh cho bé', 'sữa cho bé') giữ thành dòng riêng đánh dấu extra.
 * @param {Object|ShoppingLine[]} list  kết quả shoppingFromPlan (hoặc mảng dòng)
 * @param {(string|{name:string, qty?:number, unit?:string, note?:string, aisle?:string})[]} extras
 * @param {{data?:any, mergeExact?:boolean}} [opts]
 */
export function mergeExtraItems(list, extras, opts = {}) {
  const data = getData(opts.data);
  const { ing: ingIx } = indexes(data);
  const mergeExact = opts.mergeExact !== false;
  const isArr = Array.isArray(list);
  const base = isArr ? { lines: list.slice(), pantryCheck: [] } : { ...list, lines: list.lines.map((l) => ({ ...l, fromDishes: l.fromDishes.slice() })) };
  const lines = base.lines;
  let n = lines.filter((l) => l.extra).length;
  for (const ex of extras || []) {
    const it = typeof ex === 'string' ? normalizeItem(ex, { data }) : { ...normalizeItem(ex.name, { data }), ...(ex.qty != null ? { qty: ex.qty } : {}), ...(ex.unit ? { unit: ex.unit } : {}), note: ex.note, aisleHint: ex.aisle };
    const ing = it.ingredientId ? ingIx.get(it.ingredientId) : null;
    if (mergeExact && ing && it.confidence === 'exact' && it.qty != null) {
      const baseQty = toBase(ing, it.qty, it.unit || ing.unitDefault);
      const target = lines.find((l) => l.ingredientId === ing.id && !l.extra);
      if (baseQty != null && target && target.exactQty != null) {
        target.exactQty = Math.round((target.exactQty + baseQty) * 10) / 10;
        const r = roundForShopping(ing, target.exactQty);
        target.quantity = r.quantity; target.unit = r.unit; target.display = fmtQty(r.quantity, r.unit);
        target.optional = false;
        target.fromDishes.push({ dishId: 'extra', name: 'Ghi thêm: ' + it.raw, qty: baseQty, unit: ing.base });
        continue;
      }
      if (baseQty != null && !target) {
        const r = roundForShopping(ing, baseQty);
        lines.push({ id: ing.id, ingredientId: ing.id, name: ing.name, aisle: ing.aisle, quantity: r.quantity, unit: r.unit, display: fmtQty(r.quantity, r.unit), exactQty: baseQty, baseUnit: ing.base, pantry: !!ing.pantry, optional: false, extra: false, fromDishes: [{ dishId: 'extra', name: 'Ghi thêm: ' + it.raw, qty: baseQty, unit: ing.base }] });
        continue;
      }
    }
    // không gộp: giữ thành dòng riêng
    n++;
    const dup = lines.find((l) => l.extra && l.name.toLowerCase() === it.name.toLowerCase() && l.unit === (it.unit || null));
    if (dup && it.qty != null && dup.quantity != null) { dup.quantity += it.qty; dup.display = fmtQty(dup.quantity, dup.unit); continue; }
    lines.push({
      id: 'extra-' + n, ingredientId: ing ? ing.id : null, name: it.name, aisle: (ing && ing.aisle) || it.aisleHint || 'khac',
      quantity: it.qty ?? null, unit: it.unit || null, display: it.qty != null ? fmtQty(it.qty, it.unit) : '', exactQty: null, baseUnit: null,
      pantry: false, optional: false, extra: true, fromDishes: [], note: it.note || (it.confidence === 'partial' ? 'Có thể liên quan: ' + (ing && ing.name) : undefined),
    });
  }
  const AO = AISLE_ORDER;
  lines.sort((a, b) => (a.extra ? 1 : 0) - (b.extra ? 1 : 0) || AO.indexOf(a.aisle) - AO.indexOf(b.aisle) || a.name.localeCompare(b.name, 'vi'));
  if (isArr) return lines;
  return buildResult({ ...base, lines });
}
