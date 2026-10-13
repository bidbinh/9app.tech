// Tìm chức năng trong các app: đọc chỉ mục tìm kiếm của launcher (launcher-search/search/*.json) và vannien/search-index.json.
// Mặc định dùng ảnh chụp trong data/search (npm run sync-search để làm mới). Định dạng: vannien/docs/SEARCH-INDEX.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold } from '../util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIR = path.join(here, '..', '..', 'data', 'search');

// Tên hiển thị và đường dẫn gốc của từng app (khớp js/catalog.js của launcher)
export const APP_BASES = {
  unit: { name: '9unit', base: '/unit/' },
  license: { name: '9license', base: '/license/' },
  english: { name: '9english', base: '/english/' },
  race: { name: '9race', base: '/race/' },
  interview: { name: '9interview', base: '/interview/' },
  hire: { name: '9hire', base: '/hire/' },
  swap: { name: '9swap', base: '/swap/' },
  lunch: { name: '9lunch', base: '/lunch/' },
  ship: { name: '9Ship', base: '/9ship/' },
  scanner: { name: '9scanner', base: '/scanner/' },
  speed: { name: '9speed', base: '/speed/' },
  vannien: { name: 'Vạn Niên', base: '/vannien/' },
  osin: { name: 'Osin', base: '/osin/' },
};
export const KNOWN_BASES = Object.entries(APP_BASES).filter(([id]) => id !== 'osin').map(([, a]) => a.base); // liên kết tới app khác (origin khác), không gồm Osin

const PATH_OK = /^(?:|[#?][A-Za-z0-9_\-/.=&%?]{0,200})$/;

export function loadSearchIndex(dir = DEFAULT_DIR) {
  const entries = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch { return entries; }
  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    const meta = APP_BASES[id];
    if (!meta) continue;
    let list;
    try { list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e || typeof e.name !== 'string' || typeof e.path !== 'string' || !PATH_OK.test(e.path)) continue;
      const keywords = Array.isArray(e.keywords) ? e.keywords.filter((k) => typeof k === 'string').slice(0, 40) : [];
      entries.push({
        app: id, appName: meta.name, name: e.name, blurb: typeof e.blurb === 'string' ? e.blurb : '',
        link: meta.base + e.path, fname: fold(e.name), fkeys: keywords.map(fold), fblurb: fold(e.blurb || ''),
      });
    }
  }
  return entries;
}

export function searchFeatures(entries, query, limit = 5) {
  const words = fold(query).split(' ').filter((w) => w.length >= 1).slice(0, 8);
  if (!words.length) return [];
  const scored = [];
  for (const e of entries) {
    let total = 0; let ok = true;
    for (const w of words) {
      let s = 0;
      if (e.fkeys.includes(w) || e.fname === w) s = 100;
      else if (e.fkeys.some((k) => k.startsWith(w)) || e.fname.startsWith(w)) s = 50;
      else if (e.fkeys.some((k) => k.includes(w))) s = 30;
      else if (e.fname.includes(w)) s = 25;
      else if (e.fblurb.includes(w)) s = 5;
      else { ok = false; break; }
      total += s;
    }
    if (ok) scored.push({ e, total });
  }
  // cụm đầy đủ khớp từ khóa thì ưu tiên thêm
  const full = words.join(' ');
  for (const x of scored) if (x.e.fkeys.includes(full)) x.total += 100;
  scored.sort((a, b) => b.total - a.total || a.e.link.length - b.e.link.length);
  return scored.slice(0, limit).map(({ e }) => ({ app: e.app, appName: e.appName, name: e.name, blurb: e.blurb, link: e.link }));
}
