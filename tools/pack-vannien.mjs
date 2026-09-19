// Đóng gói lịch vạn niên vào /vannien để 9app.tech phục vụ cùng origin.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(HUB, 'vannien');
const SRC = [
  path.resolve(HUB, '..', 'Lịch vạn niên'),
  'D:\\Lịch vạn niên',
].find((p) => fs.existsSync(p));

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

if (!SRC) {
  console.error('Không thấy thư mục Lịch vạn niên');
  process.exit(1);
}

const built = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build'],
  { cwd: SRC, stdio: 'inherit', env: { ...process.env, VITE_BASE: '/vannien/' } },
);
if (built.status !== 0) process.exit(built.status || 1);

const dist = path.join(SRC, 'dist');
fs.rmSync(DEST, { recursive: true, force: true });
copy(dist, DEST);
fs.copyFileSync(path.join(DEST, 'index.html'), path.join(DEST, '404.html'));

let html = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
if (!html.includes('/js/homebar.js')) {
  html = html.replace('</body>', '<script src="/js/homebar.js"></script></body>');
  fs.writeFileSync(path.join(DEST, 'index.html'), html);
  fs.writeFileSync(path.join(DEST, '404.html'), html);
}
console.log('Đã đóng gói Vạn Niên →', DEST);
