// In thống kê số món theo vai trò / mùa / nhóm đối tượng / mức đối chiếu nguồn. Chạy: node tools/stats.js
import { readFileSync } from 'node:fs';
const dishes = JSON.parse(readFileSync(new URL('../data/dishes.json', import.meta.url), 'utf8')).items;
const cnt = (arr, f) => arr.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
const SEASONS = ['xuan', 'ha', 'thu', 'dong'];
console.log('Tổng số món:', dishes.length);
console.log('Theo vai trò:', cnt(dishes, (d) => d.role));
console.log('Theo mùa (rõ rệt):', Object.fromEntries(SEASONS.map((s) => [s, dishes.filter((d) => d.seasons.includes(s)).length])), 'quanh năm:', dishes.filter((d) => d.seasons.includes('quanh_nam')).length);
console.log('Vai trò x mùa (gồm quanh năm):');
for (const s of SEASONS) console.log(' ', s, cnt(dishes.filter((d) => d.seasons.includes(s) || d.seasons.includes('quanh_nam')), (d) => d.role));
const tags = ['tre_duoi_12m', 'tre_nho_1_3', 'tre_4_12', 'nguoi_lon', 'nguoi_cao_tuoi', 'de_nhai', 'it_muoi', 'it_duong', 'it_dau_mo'];
console.log('Theo nhóm đối tượng:', Object.fromEntries(tags.map((t) => [t, dishes.filter((d) => d.suitability.includes(t)).length])));
console.log('Theo cờ kiêng:', Object.fromEntries(['hai_san', 'trung', 'sua', 'dau_phong', 'gluten', 'thit_heo', 'thit_bo', 'cay', 'dau_nanh'].map((t) => [t, dishes.filter((d) => d.avoid.includes(t)).length])));
console.log('Mức đối chiếu nguồn:', cnt(dishes, (d) => d.sourceCheck));
console.log('Nguồn riêng biệt (URL):', new Set(dishes.flatMap((d) => d.sources.map((s) => s.url))).size);
