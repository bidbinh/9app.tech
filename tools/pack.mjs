// Copy 9speed vào /speed để GitHub Pages / host tĩnh phục vụ cùng origin với launcher.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.resolve(HUB, '..', '9speed.tech');
const DEST = path.join(HUB, 'speed');
const KEEP = new Set([
  'index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js',
  'data', 'overlay', 'voice',
]);

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === '.' || name === '..') continue;
      copy(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(SRC)) {
  console.error('Không thấy', SRC);
  process.exit(1);
}
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const name of fs.readdirSync(SRC)) {
  if (!KEEP.has(name)) continue;
  copy(path.join(SRC, name), path.join(DEST, name));
}
console.log('Đã đóng gói 9speed →', DEST);
