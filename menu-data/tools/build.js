// Sinh data/ingredients.json, data/dishes.json, data/seasonal.json từ các file nguồn trong tools/.
// Chạy: node tools/build.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INGREDIENT_LINES } from './ingredients-src.js';
import { SEASON_LINES } from './seasonal-src.js';
import { SOURCES, COVERS } from './sources.js';
import { AUDIT } from './audit-table.js';
import { rawDishes } from './dsl.js';
import './dishes-canh.js';
import './dishes-man.js';
import './dishes-xao.js';
import './dishes-rau.js';
import './dishes-nuoc.js';
import './dishes-extra.js';
import './dishes-extra2.js';
import './dishes-extra3.js';
import './dishes-extra4.js';
import { EXTRA_SRC, OVERRIDE_SRC } from './extra-src.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AISLE = { tc: 'thit_ca', hs: 'hai_san', rc: 'rau_cu', tq: 'trai_cay', td: 'trung_dau_phu', gv: 'gia_vi', dk: 'do_kho_gao_bun', sb: 'sua_banh', du: 'do_uong', kh: 'khac' };
const ALLERGENS = ['hai_san', 'trung', 'sua', 'dau_phong', 'gluten', 'thit_heo', 'thit_bo', 'cay', 'dau_nanh'];
const COUNT_UNITS = ['qua', 'bo', 'cu', 'mieng', 'hop', 'goi', 'con', 'cay', 'tep', 'tui', 'thia'];
const SEASONS = ['xuan', 'ha', 'thu', 'dong'];
const errors = [];
const err = (m) => errors.push(m);

const ascii = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// ---------- nguyên liệu ----------
const ingredients = [];
const ingById = new Map();
for (const line of INGREDIENT_LINES) {
  const [id, name, aliasStr, aisleCode, unit, convStr, flagStr] = line.split('|');
  if (!id || !name || !AISLE[aisleCode] || !unit) { err('Dòng nguyên liệu sai: ' + line); continue; }
  if (ingById.has(id)) { err('Trùng id nguyên liệu: ' + id); continue; }
  const base = unit === 'ml' ? 'ml' : 'g';
  const conv = {};
  for (const kv of (convStr || '').split(',').filter(Boolean)) {
    const [u, v] = kv.split('=');
    conv[u] = Number(v);
  }
  const flags = (flagStr || '').split(/\s+/).filter(Boolean);
  const allergens = flags.filter((f) => ALLERGENS.includes(f));
  const ageFlag = flags.find((f) => /^age\d+$/.test(f));
  const aliasSet = new Set();
  const addAlias = (a) => { a = a.trim().toLowerCase(); if (a) { aliasSet.add(a); aliasSet.add(ascii(a)); } };
  addAlias(name);
  addAlias(name.replace(/\s*\(.*?\)\s*/g, ' '));
  name.split('/').forEach(addAlias);
  (aliasStr || '').split(';').forEach(addAlias);
  const ing = {
    id, name,
    aliases: [...aliasSet],
    aisle: AISLE[aisleCode],
    base,
    unitDefault: unit,
    conv, // 1 đơn vị đếm = bao nhiêu g (hoặc ml); kg/l ngầm hiểu = 1000
    pantry: flags.includes('P'),
    allergens,
    minAgeMonths: ageFlag ? Number(ageFlag.slice(3)) : 0,
    salty: flags.includes('salty'),
  };
  if (COUNT_UNITS.includes(unit) && !conv[unit]) err('Nguyên liệu ' + id + ' mua theo ' + unit + ' nhưng thiếu quy đổi');
  ingredients.push(ing);
  ingById.set(id, ing);
}

{
  const seen = new Map();
  for (const g of ingredients) for (const a of g.aliases) {
    if (seen.has(a) && seen.get(a) !== g.id) err('Alias trùng: "' + a + '" giữa ' + seen.get(a) + ' và ' + g.id);
    seen.set(a, g.id);
  }
}
// ---------- món ăn ----------
const ROLE_COURSE = {
  canh: ['trua', 'toi'], man: ['trua', 'toi'], xao: ['trua', 'toi'], luoc: ['trua', 'toi'], rau: ['trua', 'toi'], chay: ['trua', 'toi'],
  mon_nuoc: ['sang', 'trua', 'toi'], chao_bot: ['sang', 'trua', 'toi'], trang_mieng: ['trang_mieng'], an_vat: ['an_vat'],
};
const PROTEIN_OF = (ing) => {
  const id = ing.id;
  if (['thit-ga', 'ga-ta', 'uc-ga', 'canh-ga', 'long-ga', 'xuong-ga'].includes(id)) return 'ga';
  if (id === 'thit-vit') return 'vit';
  if (ing.allergens.includes('thit_bo')) return 'bo';
  if (ing.allergens.includes('thit_heo') && ing.aisle === 'thit_ca' && !['xuong-ong-heo', 'mo-lon'].includes(id)) return 'heo';
  if (ing.aisle === 'thit_ca' && ing.allergens.includes('hai_san')) return 'ca';
  if (ing.aisle === 'hai_san') return 'hai_san';
  if (ing.allergens.includes('trung') && ing.aisle === 'trung_dau_phu') return 'trung';
  if (ing.aisle === 'trung_dau_phu') return 'dau_phu';
  return null;
};

const dishes = [];
const auditedDishes = new Set(AUDIT.map((a) => a[0]));
const usedIng = new Set();
const usedSrc = new Set();
const seenIds = new Set();
for (const r of rawDishes) {
  if (seenIds.has(r.id)) { err('Trùng id món: ' + r.id); continue; }
  seenIds.add(r.id);
  const toks = r.tags.split(/\s+/).filter(Boolean);
  const has = (t) => toks.includes(t);
  const num = (p) => { const t = toks.find((x) => new RegExp('^' + p + '\\d+$').test(x)); return t ? Number(t.slice(p.length)) : null; };
  const seasons = r.seasons === 'q' ? ['quanh_nam'] : r.seasons.split(/\s+/).filter(Boolean);
  for (const s of seasons) if (s !== 'quanh_nam' && !SEASONS.includes(s)) err(r.id + ': mùa sai ' + s);
  const timeMinutes = num('t'), costLevel = num('c');
  if (timeMinutes == null || costLevel == null) err(r.id + ': thiếu t/c');
  const ings = r.ingredients.map((i) => {
    const g = ingById.get(i.id);
    if (!g) { err(r.id + ': nguyên liệu không có trong danh mục: ' + i.id); return i; }
    usedIng.add(i.id);
    const okUnit = ['g', 'kg', 'ml', 'l'].includes(i.unit) ? ((i.unit === 'g' || i.unit === 'kg') ? g.base === 'g' : g.base === 'ml') : !!g.conv[i.unit];
    if (!okUnit) err(r.id + ': đơn vị ' + i.unit + ' không hợp lệ cho ' + i.id);
    return i;
  });
  // cờ kiêng: gộp từ nguyên liệu (nguyên liệu tùy chọn: bỏ qua 'cay')
  const avoid = new Set();
  let ingMin = 0;
  for (const i of ings) {
    const g = ingById.get(i.id);
    if (!g) continue;
    for (const a of g.allergens) { if (a === 'cay' && i.optional) continue; avoid.add(a); }
    if (!i.optional) ingMin = Math.max(ingMin, g.minAgeMonths);
  }
  const explicitMin = num('m') ?? 0;
  const minAgeMonths = Math.max(explicitMin, ingMin);
  let protein = [];
  for (const i of ings) { if (i.optional) continue; const g = ingById.get(i.id); const p = g && PROTEIN_OF(g); if (p && !protein.includes(p)) protein.push(p); }
  if (protein.length === 0) protein = ['rau'];
  const suitability = ['nguoi_lon'];
  if (!has('nok412')) suitability.push('tre_4_12');
  if (has('k13')) suitability.push('tre_nho_1_3');
  if (has('baby')) suitability.push('tre_duoi_12m');
  if (has('eld')) suitability.push('nguoi_cao_tuoi');
  if (has('soft')) suitability.push('de_nhai');
  if (has('ls')) suitability.push('it_muoi');
  // ít đường / ít dầu mỡ: tự suy ra từ nguyên liệu (món mặn, canh, rau), cộng với thẻ chỉ định tay
  const ids = ings.filter((i) => !i.optional);
  const sugary = ids.some((i) => ['duong', 'duong-phen', 'mat-ong', 'tuong-ca', 'nuoc-cot-dua'].includes(i.id));
  const fatty = ids.some((i) => ['thit-ba-chi', 'mo-lon', 'chan-gio', 'thit-vit', 'suon-non'].includes(i.id));
  const oilMl = (ids.find((i) => i.id === 'dau-an') || { qty: 0 }).qty;
  const plainRole = !['trang_mieng', 'an_vat', 'chao_bot'].includes(r.role);
  if (has('lsug') || (plainRole && !sugary)) suitability.push('it_duong');
  if (has('lf') || (plainRole && !fatty && oilMl <= 20 && !/chiên|rán|rang|xào chua/i.test(r.name))) suitability.push('it_dau_mo');
  let course = ROLE_COURSE[r.role];
  const ov = ['sang', 'trua', 'toi', 'anvat', 'trangmieng'].filter((c) => has('@' + c)).map((c) => ({ anvat: 'an_vat', trangmieng: 'trang_mieng' }[c] || c));
  if (ov.length) course = ov;
  const srcKeys = OVERRIDE_SRC[r.id] ? [...OVERRIDE_SRC[r.id]] : [...new Set([...r.src, ...(EXTRA_SRC[r.id] || [])])];
  if (r.role === 'chao_bot') for (const k of ['soyte-hatinh-andam', 'alobacsi-giavi']) if (!srcKeys.includes(k)) srcKeys.push(k);
  const srcs = srcKeys.map((k) => {
    const s = SOURCES[k];
    if (!s) { err(r.id + ': khóa nguồn không có: ' + k); return null; }
    usedSrc.add(k);
    const scope = s.kind !== 'recipe' ? 'chung' : (COVERS[k] || []).includes(r.id) ? 'cung_mon' : 'tuong_tu';
    return { name: s.name, url: s.url, kind: s.kind, scope };
  }).filter(Boolean);
  const sameDish = srcs.filter((s) => s.scope === 'cung_mon').length;
  const similar = srcs.filter((s) => s.scope === 'tuong_tu').length;
  const sourceCheck = auditedDishes.has(r.id) ? 'doi_chieu_so_lieu' : sameDish >= 1 ? 'cong_thuc_cung_mon' : similar >= 1 ? 'cong_thuc_tuong_tu' : 'tham_khao_chung';
  let notes = r.notes;
  const medical = minAgeMonths < 12 && (has('baby') || r.role === 'chao_bot');
  if (medical) notes += ' [Tham khảo, hỏi bác sĩ/chuyên gia dinh dưỡng trước khi áp dụng cho trẻ dưới 12 tháng; theo khuyến cáo chung của Viện Dinh dưỡng Quốc gia/Bộ Y tế/WHO, không nêm muối, đường, nước mắm, mật ong cho trẻ dưới 12 tháng.]';
  dishes.push({
    id: r.id, name: r.name, role: r.role, course, seasons, seasonNote: r.seasonNote,
    suitability, avoid: [...avoid].sort(), minAgeMonths,
    timeMinutes, costLevel, servingsBase: has('sb1') ? 1 : 4,
    protein, ingredients: ings, steps: r.steps, notes: notes.trim(),
    medicalNote: medical || undefined,
    sources: srcs.map(({ name, url, scope }) => ({ name, url, scope })), sourceCheck,
  });
}

// ---------- mùa vụ ----------
function months(spec) {
  if (spec === 'all') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const [a, b] = spec.split('-').map(Number);
  const out = [];
  for (let m = a; ; m = (m % 12) + 1) { out.push(m); if (m === b) break; if (out.length > 12) break; }
  return out;
}
const seasonItems = [];
for (const line of SEASON_LINES) {
  const [id, type, peak, avail, note] = line.split('|');
  if (!ingById.has(id)) { err('seasonal: nguyên liệu không có: ' + id); continue; }
  const peakMonths = months(peak), availableMonths = [...new Set([...months(avail), ...peakMonths])].sort((x, y) => x - y);
  seasonItems.push({ ingredientId: id, type, peakMonths, availableMonths, note: note || '' });
}
const byMonth = {};
for (let m = 1; m <= 12; m++) {
  const rec = { peak: [], available: [] };
  for (const it of seasonItems) {
    if (it.peakMonths.includes(m)) rec.peak.push(it.ingredientId);
    else if (it.availableMonths.includes(m)) rec.available.push(it.ingredientId);
  }
  byMonth[m] = rec;
}
const seasonal = {
  version: 1,
  region: 'bac',
  seasonMonths: { xuan: [2, 3, 4], ha: [5, 6, 7], thu: [8, 9, 10], dong: [11, 12, 1] },
  basis: 'Ước lượng từ lịch gieo trồng rau miền Bắc và lịch trái cây theo mùa (xem sources); không phải số liệu thống kê. Nhiều loại hiện có quanh năm nhờ nhà kính/nhập vùng cao.',
  sources: ['hatgiongtot-lichtrongrau', 'sinhhocaq-lichtrongrau', 'kingbio-lichtrongrau', 'hachi-lichtrongrau', 'vuonxanh-lichtrongrau', 'shophoaqua-miennam', 'shophoaqua-lichmua', 'yte-nghean-raucumuadong'].map((k) => { usedSrc.add(k); return { name: SOURCES[k].name, url: SOURCES[k].url }; }),
  items: seasonItems,
  months: byMonth,
};

// ---------- ghi ----------
const unused = ingredients.filter((i) => !usedIng.has(i.id)).map((i) => i.id);
const unusedSrc = Object.keys(SOURCES).filter((k) => !usedSrc.has(k));
if (errors.length) {
  console.error('LỖI:\n' + errors.join('\n'));
  process.exit(1);
}
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const w = (f, o) => fs.writeFileSync(path.join(root, 'data', f), JSON.stringify(o, null, 1) + '\n');
w('ingredients.json', { version: 1, units: { weight: ['g', 'kg'], volume: ['ml', 'l'], count: COUNT_UNITS }, aisles: Object.values(AISLE), items: ingredients });
w('dishes.json', { version: 1, region: 'bac', servingsBase: 4, roles: Object.keys(ROLE_COURSE), items: dishes });
w('seasonal.json', seasonal);
const allSources = {};
for (const k of Object.keys(SOURCES)) allSources[k] = { name: SOURCES[k].name, url: SOURCES[k].url, kind: SOURCES[k].kind, access: SOURCES[k].access, accessed: SOURCES[k].accessed };
w('sources.json', { version: 1, sources: allSources });
console.log('Đã sinh: ' + ingredients.length + ' nguyên liệu, ' + dishes.length + ' món, ' + seasonItems.length + ' mục mùa vụ.');
if (unused.length) console.log('Nguyên liệu chưa dùng trong món (' + unused.length + '): ' + unused.join(', '));
if (unusedSrc.length) console.log('Nguồn chưa dùng: ' + unusedSrc.join(', '));
