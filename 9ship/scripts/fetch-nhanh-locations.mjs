// Dựng bảng đổi tỉnh/phường của 9Ship sang mã địa danh 2 cấp (v2) của Nhanh.vn.
// Chạy: NHANH_APP_ID=... NHANH_BUSINESS_ID=... NHANH_ACCESS_TOKEN=... node scripts/fetch-nhanh-locations.mjs
import fs from 'node:fs';
import { PROVINCES, wardsOf, slug } from '../src/geo.js';

const { NHANH_APP_ID: app, NHANH_BUSINESS_ID: biz, NHANH_ACCESS_TOKEN: tok } = process.env;
if (!app || !biz || !tok) { console.error('Thiếu NHANH_APP_ID / NHANH_BUSINESS_ID / NHANH_ACCESS_TOKEN'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function loc(filters) {
  const res = await fetch(`https://pos.open.nhanh.vn/v3.0/shipping/location?appId=${app}&businessId=${biz}`, {
    method: 'POST', headers: { Authorization: tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: { locationVersion: 'v2', ...filters } }),
  });
  const j = await res.json();
  if (j.code !== 1) throw new Error(JSON.stringify(j).slice(0, 200));
  await sleep(250);
  return j.data;
}
const bare = (s) => slug(s).replace(/^(thanh-pho|tinh|tp)-/, '');
const wardKey = (s) => slug(s).replace(/^(phuong|xa|dac-khu|thi-tran)-/, '');

const cities = await loc({ type: 'CITY' });
const out = { fetchedAt: new Date().toISOString(), provinces: {} };
const report = [];
for (const p of PROVINCES) {
  const c = cities.find((x) => bare(x.name) === bare(p.name) || bare(x.name) === p.code);
  if (!c) { report.push(`KHÔNG KHỚP tỉnh: ${p.name}`); continue; }
  const nw = await loc({ type: 'WARD', parentId: c.id });
  const byFull = new Map(nw.map((w) => [slug(w.name), w.id]));
  const byBare = new Map();
  for (const w of nw) { const k = wardKey(w.name); byBare.set(k, byBare.has(k) ? null : w.id); }
  const wards = {}; let miss = 0;
  for (const name of wardsOf(p.code)) {
    const id = byFull.get(slug(name)) ?? byBare.get(wardKey(name));
    if (id) wards[name] = id; else miss++;
  }
  out.provinces[p.code] = { cityId: c.id, wards };
  report.push(`${p.name}: city ${c.id}, ${Object.keys(wards).length}/${wardsOf(p.code).length} phường khớp${miss ? ` (thiếu ${miss})` : ''}`);
}
fs.writeFileSync(new URL('../src/carriers/data/nhanh-locations.json', import.meta.url), JSON.stringify(out));
console.log(report.join('\n'));
