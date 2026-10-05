// Làm mới ảnh chụp chỉ mục tìm kiếm trong data/search từ các thư mục cùng kho (launcher-search/search và vannien/search-index.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.join(root, '..');
const out = path.join(root, 'data', 'search');
fs.mkdirSync(out, { recursive: true });
let n = 0;
const srcDir = path.join(repo, 'launcher-search', 'search');
if (fs.existsSync(srcDir)) {
  for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith('.json'))) { fs.copyFileSync(path.join(srcDir, f), path.join(out, f)); n++; }
}
const vn = path.join(repo, 'vannien', 'search-index.json');
if (fs.existsSync(vn)) { fs.copyFileSync(vn, path.join(out, 'vannien.json')); n++; }
console.log(`Đã chép ${n} tệp chỉ mục vào data/search`);
