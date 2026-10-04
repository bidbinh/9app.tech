// Đóng gói lịch vạn niên vào /vannien để 9app.tech phục vụ cùng origin.
//
// Chạy:  node tools/pack-vannien.mjs            (build rồi đóng gói)
//        node tools/pack-vannien.mjs --dry-run  (chỉ in việc sẽ làm, không build, không đụng tệp nào)
//
// Thư mục vannien\ chứa cả bản dựng (do script này sinh) lẫn mô-đun Văn khấn, Mâm cúng viết riêng
// (mod\, search-index.json, scripts\, test\, docs\, shots\, package.json). Script CHỈ thay các tệp của
// bản dựng, giữ nguyên phần còn lại, rồi chèn lại hai thẻ của mô-đun vào index.html và 404.html.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(HUB, 'vannien');

/** Những mục do bản dựng sinh ra; chỉ chúng bị xóa và thay. Mọi thứ khác trong vannien\ được giữ. */
export const BUILD_OWNED = ['assets', 'index.html', '404.html', 'favicon.svg', 'manifest.webmanifest', '.nojekyll'];

/** Số phiên bản chống bộ nhớ đệm của mô-đun, đọc từ mod/app.js (do vannien/scripts/bump-version.mjs ghi). */
export function moduleVersion(dest = DEST) {
  try {
    return /const VERSION = '(\d+)'/.exec(fs.readFileSync(path.join(dest, 'mod', 'app.js'), 'utf8'))?.[1] || '1';
  } catch {
    return '1';
  }
}

/** Chèn thẻ <link> và <script> của mô-đun. Chạy lại nhiều lần vẫn ra cùng một kết quả. */
export function injectModuleTags(html, version = '1') {
  const css = `<link rel="stylesheet" href="/vannien/mod/mod.css?v=${version}" />`;
  const js = `<script type="module" src="/vannien/mod/app.js?v=${version}"></script>`;
  html = html
    .replace(/\s*<link rel="stylesheet" href="\/vannien\/mod\/mod\.css[^"]*" \/>/g, '')
    .replace(/\s*<script type="module" src="\/vannien\/mod\/app\.js[^"]*"><\/script>/g, '');
  const block = `\n    ${css}\n    ${js}`;
  const m = /<link rel="stylesheet"[^>]*assets\/[^>]*\.css"?\s*\/?>/.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + block + html.slice(m.index + m[0].length);
  return html.replace('</head>', `${block.trimStart()}\n  </head>`);
}

/** Chèn nút về 9app (như trước đây) rồi thẻ mô-đun. */
export function finalizeHtml(html, version) {
  if (!html.includes('/js/homebar.js')) html = html.replace('</body>', '<script src="/js/homebar.js"></script></body>');
  return injectModuleTags(html, version);
}

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dest, name));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/** Mô tả việc sẽ làm (dùng cho --dry-run và kiểm thử). Không ghi gì. */
export function plan(dest = DEST) {
  const exists = fs.existsSync(dest) ? fs.readdirSync(dest) : [];
  return {
    remove: BUILD_OWNED.filter((n) => exists.includes(n)),
    keep: exists.filter((n) => !BUILD_OWNED.includes(n)),
    version: moduleVersion(dest),
  };
}

function main() {
  const dry = process.argv.includes('--dry-run');
  const p = plan();
  console.log(`Sẽ thay: ${p.remove.join(', ') || '(không)'}`);
  console.log(`Giữ nguyên: ${p.keep.join(', ') || '(không)'}`);
  console.log(`Chèn lại thẻ mô-đun (?v=${p.version}) vào index.html và 404.html`);
  if (dry) {
    console.log('--dry-run: không build, không ghi gì.');
    return;
  }

  const SRC = [path.resolve(HUB, '..', 'Lịch vạn niên'), 'D:\\Lịch vạn niên'].find((q) => fs.existsSync(q));
  if (!SRC) {
    console.error('Không thấy thư mục Lịch vạn niên');
    process.exit(1);
  }
  const built = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: SRC,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: '/vannien/' },
  });
  if (built.status !== 0) process.exit(built.status || 1);

  const dist = path.join(SRC, 'dist');
  fs.mkdirSync(DEST, { recursive: true });
  for (const n of BUILD_OWNED) fs.rmSync(path.join(DEST, n), { recursive: true, force: true });
  for (const n of fs.readdirSync(dist)) copy(path.join(dist, n), path.join(DEST, n));

  const html = finalizeHtml(fs.readFileSync(path.join(DEST, 'index.html'), 'utf8'), p.version);
  fs.writeFileSync(path.join(DEST, 'index.html'), html);
  fs.writeFileSync(path.join(DEST, '404.html'), html);
  console.log('Đã đóng gói Vạn Niên →', DEST);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
