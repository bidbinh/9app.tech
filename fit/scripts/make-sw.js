// Sinh sw.js với danh sách tệp vỏ ứng dụng lấy từ cây thư mục. Chạy: node scripts/make-sw.js [phiên bản]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ver = process.argv[2] || 'v1';
const ds = [];
const quet = (d) => {
  for (const f of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const rel = `${d}/${f.name}`;
    if (f.isDirectory()) quet(rel); else ds.push(`./${rel}`);
  }
};
for (const d of ['css', 'js', 'icons']) quet(d);
ds.push('./', './index.html', './manifest.webmanifest', './search-index.json');
ds.sort();
const noi = `// Service worker của 9fit: lưu toàn bộ vỏ ứng dụng và dữ liệu bài tập để chạy ngoại tuyến.
// Mạng trước, bộ nhớ đệm sau (bản mới tới máy ngay khi có mạng). Đổi CACHE_VERSION mỗi lần phát hành. Tệp này do scripts/make-sw.js sinh ra.
const CACHE_VERSION = '${ver}';
const SHELL_CACHE = \`9fit-shell-\${CACHE_VERSION}\`;

const SHELL = ${JSON.stringify(ds, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('9fit-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = await caches.match('./index.html');
        if (home) return home;
      }
      return new Response('Đang ngoại tuyến.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
`;
fs.writeFileSync(path.join(root, 'sw.js'), noi, 'utf8');
console.log('đã ghi sw.js:', ds.length, 'tệp');
