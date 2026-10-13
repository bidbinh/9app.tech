// Tiện ích dùng chung (ES module thuần, chạy được cả Node 20 và trình duyệt, không phụ thuộc).

/**
 * @typedef {Object} Person
 * @property {number} [ageMonths]  Tuổi tính bằng tháng (ưu tiên hơn ageYears).
 * @property {number} [ageYears]   Tuổi tính bằng năm.
 * @property {string} [role]       Vai trò tự do: 'ong', 'ba', 'bo', 'me', 'be', 'con'...
 * @property {string[]} [diet]     Ưu tiên ăn uống: 'it_muoi','it_duong','it_dau_mo','de_nhai'.
 * @property {string[]} [avoid]    Kiêng/dị ứng TUYỆT ĐỐI: 'hai_san','trung','sua','dau_phong','gluten','thit_heo','thit_bo','cay','dau_nanh'.
 *
 * @typedef {Object} Profile
 * @property {Person[]} people
 * @property {string} [region]  Hiện chỉ hỗ trợ 'bac'.
 *
 * @typedef {Object} MenuData
 * @property {{items: any[]}} dishes
 * @property {{items: any[]}} ingredients
 * @property {any} [seasonal]
 */

/** @type {MenuData|null} */
let defaultData = null;

/** Đăng ký bộ dữ liệu mặc định (đã nạp từ data/*.json). */
export function setData(data) { defaultData = data; }

/** Lấy bộ dữ liệu: ưu tiên tham số, sau đó bộ đã đăng ký bằng setData. */
export function getData(data) {
  const d = data || defaultData;
  if (!d) throw new Error('Chưa có dữ liệu món ăn: gọi setData({dishes, ingredients, seasonal}) hoặc truyền { data }.');
  return d;
}

const indexCache = new WeakMap();
/** Chỉ mục id -> món / nguyên liệu (có cache theo đối tượng dữ liệu). */
export function indexes(data) {
  let ix = indexCache.get(data);
  if (!ix) {
    ix = {
      dish: new Map(data.dishes.items.map((d) => [d.id, d])),
      ing: new Map(data.ingredients.items.map((i) => [i.id, i])),
    };
    indexCache.set(data, ix);
  }
  return ix;
}

/** Bỏ dấu tiếng Việt, chữ thường. */
export function ascii(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

/** Tháng (1-12) -> mùa miền Bắc theo quy ước: xuân 2-4, hạ 5-7, thu 8-10, đông 11-1. */
export function seasonOfMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Tháng phải là số nguyên 1-12.');
  if (month >= 2 && month <= 4) return 'xuan';
  if (month >= 5 && month <= 7) return 'ha';
  if (month >= 8 && month <= 10) return 'thu';
  return 'dong';
}
export const SEASON_LABEL = { xuan: 'xuân', ha: 'hè', thu: 'thu', dong: 'đông', quanh_nam: 'quanh năm' };

/** Băm chuỗi/số thành số nguyên 32 bit (cho seed). */
export function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Bộ sinh số giả ngẫu nhiên tất định (mulberry32). */
export function makeRng(seed) {
  let a = hashSeed(seed);
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ELDER_ROLES = /^(ong|ba|cu|ong_noi|ba_noi|ong_ngoai|ba_ngoai|nguoi_gia|cao_tuoi)/;

/** Tuổi tháng của một người; không rõ tuổi thì coi là người lớn (30 tuổi) trừ khi vai trò là ông/bà. */
export function ageMonthsOf(p) {
  if (Number.isFinite(p.ageMonths)) return p.ageMonths;
  if (Number.isFinite(p.ageYears)) return Math.round(p.ageYears * 12);
  if (p.role && ELDER_ROLES.test(String(p.role))) return 70 * 12;
  return 30 * 12;
}

/** Phân tích hồ sơ gia đình. */
export function analyzeProfile(profile) {
  const people = (profile && profile.people) || [];
  if (!people.length) throw new Error('profile.people không được rỗng.');
  const avoid = new Set();
  const diet = new Set();
  let elderly = false, toddlers = 0, kids = 0, under10 = 0, babies = [], minEaterAge = Infinity;
  people.forEach((p, idx) => {
    const m = ageMonthsOf(p);
    (p.avoid || []).forEach((a) => avoid.add(a));
    (p.diet || []).forEach((a) => diet.add(a));
    if (m >= 720 || m >= 60 * 12) elderly = true;
    if (p.role && ELDER_ROLES.test(String(p.role))) elderly = true;
    if (m < 12) { if (m >= 6) babies.push({ index: idx, ageMonths: m, avoid: p.avoid || [] }); }
    else {
      minEaterAge = Math.min(minEaterAge, m);
      if (m < 120) under10++;
      if (m < 48) toddlers++;
      else if (m < 156) kids++;
    }
  });
  if (!Number.isFinite(minEaterAge)) minEaterAge = 30 * 12;
  if (elderly) { diet.add('it_muoi'); diet.add('de_nhai'); }
  const noSpicy = avoid.has('cay') || under10 > 0; // nhà có trẻ dưới 10 tuổi: không nấu món cay
  return { avoid, diet, elderly, toddlers, kids, babies, minEaterAge, noSpicy, portions: profileServings(profile) };
}

/** Trọng số suất ăn theo tuổi (tương đương người lớn). */
export function personWeight(p) {
  const m = ageMonthsOf(p);
  if (m < 6) return 0;
  if (m < 12) return 0.2;
  if (m < 48) return 0.5;
  if (m < 120) return 0.7;
  if (m < 192) return 0.9;
  if (m >= 60 * 12 || (p.role && ELDER_ROLES.test(String(p.role)))) return 0.8;
  return 1;
}

/** Tổng số suất (người lớn tương đương) của một hồ sơ. */
export function profileServings(profile) {
  const total = ((profile && profile.people) || []).reduce((s, p) => s + personWeight(p), 0);
  return Math.round(total * 100) / 100;
}

/** Định dạng số kiểu Việt: dấu phẩy thập phân. */
export function fmtNum(n) {
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}
