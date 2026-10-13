import { loadData } from '../src/load-node.js';
import { setData } from '../src/common.js';

export const data = loadData();
setData(data);
export const dishIx = new Map(data.dishes.items.map((d) => [d.id, d]));
export const ingIx = new Map(data.ingredients.items.map((i) => [i.id, i]));
export const SEASON_OF = { 1: 'dong', 2: 'xuan', 3: 'xuan', 4: 'xuan', 5: 'ha', 6: 'ha', 7: 'ha', 8: 'thu', 9: 'thu', 10: 'thu', 11: 'dong', 12: 'dong' };
export const MONTH_OF_SEASON = { xuan: 3, ha: 6, thu: 9, dong: 12 };
export const isVeg = (d) => d.role === 'luoc' || d.role === 'rau' || (d.role === 'xao' && d.protein.length === 1 && d.protein[0] === 'rau');
export const isMan = (d) => d.role === 'man' || d.role === 'chay' || (d.role === 'xao' && !isVeg(d));
export const inSeason = (d, s) => d.seasons.includes(s) || d.seasons.includes('quanh_nam');

/** Các hồ sơ mẫu. */
export const PROFILES = {
  adults: { people: [{ ageYears: 35 }, { ageYears: 33 }], region: 'bac' },
  family: { people: [{ ageYears: 36, role: 'bo' }, { ageYears: 34, role: 'me' }, { ageYears: 7 }, { ageYears: 2 }], region: 'bac' },
  threeGen: { people: [{ ageYears: 38 }, { ageYears: 36 }, { ageYears: 3 }, { ageYears: 70, role: 'ba' }, { ageYears: 72, role: 'ong' }], region: 'bac' },
  elderly: { people: [{ ageYears: 68, role: 'ong' }, { ageYears: 66, role: 'ba' }], region: 'bac' },
  baby: { people: [{ ageYears: 30 }, { ageYears: 29 }, { ageMonths: 8 }], region: 'bac' },
};
