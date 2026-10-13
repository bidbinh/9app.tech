// Sinh fit/search-index.json từ js/data/functions.js (định dạng như vannien/docs/SEARCH-INDEX.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { danhSachChucNang } from '../js/data/functions.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ds = danhSachChucNang();
fs.writeFileSync(path.join(root, 'search-index.json'), JSON.stringify(ds, null, 1) + '\n', 'utf8');
console.log('đã ghi search-index.json:', ds.length, 'mục');
