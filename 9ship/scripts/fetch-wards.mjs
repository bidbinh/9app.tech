// Tải danh mục tỉnh/thành và phường/xã (34 tỉnh, 2 cấp) từ provinces.open-api.vn và ghi public/data/vn-wards.json.
// Chạy lại khi danh mục hành chính thay đổi: node scripts/fetch-wards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVINCES, slug } from '../src/geo.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'vn-wards.json');
const strip = (n) => n.replace(/^(Thành phố|Tỉnh)\s+/i, '');
const list = await (await fetch('https://provinces.open-api.vn/api/v2/p/')).json();
const result = {};
const unmatched = [];
for (const p of list) {
  const full = await (await fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`)).json();
  const name = strip(full.name);
  const mine = PROVINCES.find((x) => slug(x.name.replace(/^TP\s+/, '')) === slug(name)) || PROVINCES.find((x) => slug(x.name) === slug(name));
  if (!mine) { unmatched.push(full.name); continue; }
  result[mine.code] = {
    name: mine.name, officialName: full.name, type: full.division_type,
    wards: full.wards.map((w) => w.name).sort((a, b) => a.localeCompare(b, 'vi')),
  };
}
const missing = PROVINCES.filter((p) => !result[p.code]).map((p) => p.name);
console.log('tỉnh khớp:', Object.keys(result).length, '| không khớp từ nguồn:', unmatched, '| thiếu so với app:', missing);
console.log('tổng phường/xã:', Object.values(result).reduce((a, p) => a + p.wards.length, 0));
if (unmatched.length || missing.length) { console.error('Danh mục tỉnh lệch: sửa src/geo.js rồi chạy lại'); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'provinces.open-api.vn/api/v2', fetchedAt: new Date().toISOString().slice(0, 10), provinces: result }));
console.log('đã ghi', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
