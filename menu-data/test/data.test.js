import test from 'node:test';
import assert from 'node:assert/strict';
import { data, ingIx, isVeg, isMan, inSeason } from './helper.js';

const dishes = data.dishes.items;
const ings = data.ingredients.items;
const ROLES = ['canh', 'man', 'xao', 'luoc', 'rau', 'mon_nuoc', 'chay', 'chao_bot', 'trang_mieng', 'an_vat'];
const SUIT = ['tre_nho_1_3', 'tre_4_12', 'nguoi_lon', 'nguoi_cao_tuoi', 'de_nhai', 'it_muoi', 'it_duong', 'it_dau_mo', 'tre_duoi_12m'];
const AVOID = ['hai_san', 'trung', 'sua', 'dau_phong', 'gluten', 'thit_heo', 'thit_bo', 'cay', 'dau_nanh'];
const AISLES = ['thit_ca', 'hai_san', 'rau_cu', 'trai_cay', 'trung_dau_phu', 'gia_vi', 'do_kho_gao_bun', 'sua_banh', 'do_uong', 'khac'];
const UNITS = [...data.ingredients.units.weight, ...data.ingredients.units.volume, ...data.ingredients.units.count];
const stripAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

test('số lượng dữ liệu tối thiểu', () => {
  assert.ok(dishes.length >= 150, 'có ' + dishes.length + ' món');
  assert.ok(ings.length >= 100);
});

test('id món và nguyên liệu duy nhất; alias nguyên liệu không trùng nhau', () => {
  assert.equal(new Set(dishes.map((d) => d.id)).size, dishes.length);
  assert.equal(new Set(ings.map((i) => i.id)).size, ings.length);
  for (const d of dishes) assert.match(d.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, d.id);
  const owner = new Map();
  for (const i of ings) for (const a of i.aliases) {
    if (owner.has(a)) assert.equal(owner.get(a), i.id, 'alias trùng "' + a + '"');
    owner.set(a, i.id);
  }
  assert.equal(new Set(ings.map((i) => i.name.toLowerCase())).size, ings.length);
});

test('nguyên liệu: aisle và đơn vị hợp lệ, quy đổi đầy đủ, có alias không dấu và có dấu', () => {
  for (const i of ings) {
    assert.ok(AISLES.includes(i.aisle), i.id + ' aisle');
    assert.ok(UNITS.includes(i.unitDefault), i.id + ' unit');
    assert.ok(['g', 'ml'].includes(i.base), i.id);
    if (!['g', 'ml'].includes(i.unitDefault)) assert.ok(i.conv[i.unitDefault] > 0, i.id + ' thiếu quy đổi ' + i.unitDefault);
    for (const [u, v] of Object.entries(i.conv)) { assert.ok(data.ingredients.units.count.includes(u), i.id + ' conv ' + u); assert.ok(v > 0); }
    assert.equal(typeof i.pantry, 'boolean');
    assert.ok(i.aliases.includes(i.name.toLowerCase()), i.id + ' alias tên');
    assert.ok(i.aliases.some((a) => a === stripAccent(a)), i.id + ' có alias không dấu');
  }
  for (const id of ['muoi', 'duong', 'nuoc-mam', 'dau-an', 'tieu', 'hanh-kho']) assert.ok(ingIx.get(id).pantry, id + ' phải là pantry');
});

test('mọi nguyên liệu trong món tồn tại, đơn vị hợp lệ và quy đổi được, số lượng dương, không lặp trong một món', () => {
  for (const d of dishes) {
    const seen = new Set();
    assert.ok(d.ingredients.length >= 1, d.id);
    for (const i of d.ingredients) {
      const g = ingIx.get(i.id);
      assert.ok(g, d.id + ': thiếu nguyên liệu ' + i.id);
      assert.ok(UNITS.includes(i.unit), d.id + ' đơn vị ' + i.unit);
      assert.ok(Number.isFinite(i.qty) && i.qty > 0, d.id + ' qty');
      if (['g', 'kg'].includes(i.unit)) assert.equal(g.base, 'g', d.id + ':' + i.id);
      else if (['ml', 'l'].includes(i.unit)) assert.equal(g.base, 'ml', d.id + ':' + i.id);
      else assert.ok(g.conv[i.unit], d.id + ': ' + i.id + ' không quy đổi được ' + i.unit);
      assert.ok(!seen.has(i.id), d.id + ' lặp nguyên liệu ' + i.id);
      seen.add(i.id);
    }
  }
});

test('trường bắt buộc, vai trò, mùa hợp lệ', () => {
  for (const d of dishes) {
    assert.ok(d.name && d.name.length >= 2, d.id);
    assert.ok(ROLES.includes(d.role), d.id + ' role');
    assert.ok(d.course.length >= 1 && d.course.every((c) => ['sang', 'trua', 'toi', 'an_vat', 'trang_mieng'].includes(c)), d.id + ' course');
    assert.ok(d.seasons.length >= 1 && d.seasons.every((s) => ['xuan', 'ha', 'thu', 'dong', 'quanh_nam'].includes(s)), d.id + ' mùa');
    if (d.seasons.includes('quanh_nam')) assert.equal(d.seasons.length, 1, d.id);
    assert.ok(d.suitability.every((s) => SUIT.includes(s)) && d.suitability.includes('nguoi_lon'), d.id + ' suitability');
    assert.ok(d.avoid.every((a) => AVOID.includes(a)), d.id + ' avoid');
    assert.ok(Number.isInteger(d.timeMinutes) && d.timeMinutes >= 3 && d.timeMinutes <= 240, d.id + ' time');
    assert.ok([1, 2, 3].includes(d.costLevel), d.id + ' cost');
    assert.ok(d.servingsBase === 4 || (d.servingsBase === 1 && d.role === 'chao_bot'), d.id + ' servingsBase');
    assert.ok(Array.isArray(d.protein) && d.protein.length >= 1);
    assert.equal(typeof d.notes, 'string');
  }
});

test('bước nấu: 3-8 bước, không rỗng', () => {
  for (const d of dishes) {
    assert.ok(d.steps.length >= 3 && d.steps.length <= 8, d.id + ' có ' + d.steps.length + ' bước');
    for (const s of d.steps) { assert.ok(s.trim().length >= 5, d.id + ' bước rỗng/quá ngắn'); assert.ok(s.length <= 420, d.id + ' bước quá dài'); }
  }
});

test('mọi món có ít nhất 1 nguồn hợp lệ (tên + URL)', () => {
  for (const d of dishes) {
    assert.ok(d.sources.length >= 1, d.id + ' thiếu nguồn');
    for (const s of d.sources) {
      assert.ok(s.name && s.name.length > 3, d.id);
      assert.match(s.url, /^https?:\/\/[^\s]+\.[^\s]+/, d.id + ' url');
    }
    assert.ok(['doi_chieu_so_lieu', 'cong_thuc_cung_mon', 'cong_thuc_tuong_tu', 'tham_khao_chung'].includes(d.sourceCheck));
  }
});

test('cờ kiêng/dị ứng (avoid) khớp đúng nguyên liệu', () => {
  for (const d of dishes) {
    const exp = new Set();
    for (const i of d.ingredients) for (const a of ingIx.get(i.id).allergens) { if (a === 'cay' && i.optional) continue; exp.add(a); }
    assert.deepEqual([...exp].sort(), [...d.avoid].sort(), d.id + ' avoid sai');
  }
  const named = (re) => dishes.filter((d) => re.test(d.name.toLowerCase()));
  for (const d of named(/trứng/)) assert.ok(d.avoid.includes('trung'), d.id + ' phải có cờ trứng');
  for (const d of named(/\btôm\b|\bcua\b|ngao|\bốc\b|mực|\bcá\b/)) assert.ok(d.avoid.includes('hai_san'), d.id + ' phải có cờ hải sản');
  for (const d of named(/đậu phụ|đậu hũ/)) assert.ok(d.avoid.includes('dau_nanh'), d.id + ' phải có cờ đậu nành');
  for (const d of named(/\blạc\b/)) assert.ok(d.avoid.includes('dau_phong'), d.id);
  for (const d of named(/sữa chua/)) assert.ok(d.avoid.includes('sua'), d.id);
  for (const d of named(/bánh mì/)) assert.ok(d.avoid.includes('gluten'), d.id);
});

test('tuổi tối thiểu hợp lý và nhất quán với nguyên liệu', () => {
  for (const d of dishes) {
    assert.ok(d.minAgeMonths >= 0 && d.minAgeMonths <= 60, d.id + ' minAge');
    for (const i of d.ingredients) {
      if (i.optional) continue;
      assert.ok(d.minAgeMonths >= ingIx.get(i.id).minAgeMonths, d.id + ': ' + i.id + ' cần tuổi ' + ingIx.get(i.id).minAgeMonths);
    }
  }
});

test('món cho trẻ 1-3 tuổi: không cay, không lạc, tuổi tối thiểu <= 24 tháng, không có nguyên liệu cấm (kể cả tùy chọn)', () => {
  const toddler = dishes.filter((d) => d.suitability.includes('tre_nho_1_3'));
  assert.ok(toddler.length >= 60, 'chỉ có ' + toddler.length);
  for (const d of toddler) {
    assert.ok(!d.avoid.includes('cay'), d.id + ' cay');
    assert.ok(!d.avoid.includes('dau_phong'), d.id + ' lạc');
    assert.ok(d.minAgeMonths <= 24, d.id);
    for (const i of d.ingredients) {
      assert.ok(ingIx.get(i.id).minAgeMonths <= 24, d.id + ' chứa ' + i.id);
      assert.ok(!['mat-ong', 'mam-tom', 'tuong-ot', 'ruou-trang'].includes(i.id), d.id + ' chứa ' + i.id);
    }
    assert.ok(d.suitability.includes('tre_4_12'), d.id + ' trẻ 1-3 phải ăn được cho cả 4-12');
  }
});

test('món cho bé dưới 12 tháng: không muối/nước mắm/đường/mật ong/lạc, có ghi chú hỏi bác sĩ và nguồn dinh dưỡng trẻ nhỏ', () => {
  const baby = dishes.filter((d) => d.role === 'chao_bot');
  assert.ok(baby.length >= 10);
  const forbidden = new Set(['muoi', 'nuoc-mam', 'duong', 'duong-phen', 'mat-ong', 'hat-nem', 'bot-canh', 'nuoc-tuong', 'dau-hao', 'mam-tom', 'tuong-ot', 'tuong-ca', 'dau-phong', 'tieu']);
  for (const d of baby) {
    assert.ok(d.suitability.includes('tre_duoi_12m'), d.id);
    assert.ok(d.minAgeMonths >= 6 && d.minAgeMonths <= 12, d.id + ' minAge ' + d.minAgeMonths);
    assert.equal(d.medicalNote, true, d.id);
    assert.match(d.notes, /hỏi bác sĩ/i, d.id);
    assert.ok(d.sources.some((s) => /soyte\.hatinh|alobacsi/.test(s.url)), d.id + ' thiếu nguồn y tế (Sở Y tế/Alobacsi)');
    for (const i of d.ingredients) assert.ok(!forbidden.has(i.id) && !ingIx.get(i.id).salty, d.id + ' chứa ' + i.id);
    assert.equal(d.servingsBase, 1);
  }
});

test('mùa vụ: seasonal.json hợp lệ và nhất quán với mùa của món', () => {
  const s = data.seasonal;
  for (const it of s.items) {
    assert.ok(ingIx.has(it.ingredientId), it.ingredientId);
    assert.ok(it.peakMonths.every((m) => it.availableMonths.includes(m)), it.ingredientId + ' peak không nằm trong avail');
    assert.ok(it.availableMonths.length >= 1 && it.availableMonths.every((m) => m >= 1 && m <= 12));
  }
  assert.equal(new Set(s.items.map((i) => i.ingredientId)).size, s.items.length, 'trùng mục mùa vụ');
  for (let m = 1; m <= 12; m++) assert.ok(s.months[m].peak.length + s.months[m].available.length >= 20, 'tháng ' + m + ' quá ít');
  const byIng = new Map(s.items.map((i) => [i.ingredientId, i]));
  for (const d of dishes) {
    if (d.role === 'chao_bot') continue;
    for (const i of d.ingredients) {
      if (i.optional) continue;
      const it = byIng.get(i.id);
      if (!it) continue;
      if (d.seasons.includes('quanh_nam')) {
        assert.ok(it.availableMonths.length >= 10, d.id + ' (quanh năm) dùng ' + i.id + ' chỉ có ' + it.availableMonths.length + ' tháng');
      } else {
        for (const se of d.seasons) {
          const n = s.seasonMonths[se].filter((mo) => it.availableMonths.includes(mo)).length;
          assert.ok(n >= 2, d.id + ' mùa ' + se + ' nhưng ' + i.id + ' chỉ có ' + n + '/3 tháng');
        }
      }
    }
  }
});

test('món theo mùa có giải thích (seasonNote)', () => {
  for (const d of dishes) if (!d.seasons.includes('quanh_nam')) assert.ok(d.seasonNote && d.seasonNote.length > 5, d.id);
});

test('đủ số món theo vai trò / mùa / nhóm đối tượng để lập thực đơn', () => {
  const MIN = { canh: 18, man: 40, veg: 18, mon_nuoc: 9 };
  for (const season of ['xuan', 'ha', 'thu', 'dong']) {
    const pool = dishes.filter((d) => inSeason(d, season) && d.role !== 'chao_bot');
    const cnt = {
      canh: pool.filter((d) => d.role === 'canh').length,
      man: pool.filter(isMan).length,
      veg: pool.filter(isVeg).length,
      mon_nuoc: pool.filter((d) => d.role === 'mon_nuoc').length,
    };
    for (const k of Object.keys(MIN)) assert.ok(cnt[k] >= MIN[k], season + ' ' + k + '=' + cnt[k] + ' < ' + MIN[k]);
    for (const tag of ['tre_nho_1_3', 'nguoi_cao_tuoi']) {
      const g = {
        canh: pool.filter((d) => d.role === 'canh' && d.suitability.includes(tag)).length,
        man: pool.filter((d) => isMan(d) && d.suitability.includes(tag)).length,
        veg: pool.filter((d) => isVeg(d) && d.suitability.includes(tag)).length,
      };
      assert.ok(g.canh >= 8 && g.man >= 10 && g.veg >= 8, season + ' ' + tag + ' ' + JSON.stringify(g));
    }
  }
  assert.ok(dishes.filter((d) => d.course.includes('sang')).length >= 15);
  assert.ok(dishes.filter((d) => d.role === 'trang_mieng').length >= 8);
});
