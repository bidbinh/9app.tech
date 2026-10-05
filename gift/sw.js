// Service worker của 9gift: lưu vỏ ứng dụng để mở được khi mất mạng.
// Mạng trước, bộ nhớ đệm sau (bản mới tới máy ngay khi có mạng). Đổi CACHE_VERSION mỗi lần phát hành.
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `9gift-shell-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './search-index.json',
  './css/style.css',
  './js/boot.js',
  './js/app.js',
  './js/lib/lunar.js',
  './js/lib/text.js',
  './js/lib/ngay.js',
  './js/lib/tien.js',
  './js/lib/cau.js',
  './js/lib/le.js',
  './js/lib/nhac.js',
  './js/lib/kho.js',
  './js/lib/tim.js',
  './js/lib/chung.js',
  './js/data/dip.js',
  './js/data/qua.js',
  './js/data/loichuc.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/nhapnhanh.js',
  './js/ui/bieudo.js',
  './js/screens/saptoi.js',
  './js/screens/sole.js',
  './js/screens/danhba.js',
  './js/screens/quachuc.js',
  './js/screens/them.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

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
    await Promise.all(keys.filter((k) => k.startsWith('9gift-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
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
