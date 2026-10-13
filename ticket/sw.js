// Service worker 9ticket: precache vỏ ứng dụng theo phiên bản, phục vụ từ cache (chạy được khi không có mạng).
// Đổi CACHE_VERSION mỗi lần phát hành. Bản mới cài xong sẽ chờ đến khi mọi tab đóng.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `9ticket-shell-${CACHE_VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/time.js', './js/model.js', './js/store.js', './js/airport.js', './js/split.js',
  './js/ics.js', './js/parse.js', './js/status.js', './js/sample.js',
  './data/stations.json',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('9ticket-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    try { return await fetch(req); } catch { return new Response('Không có mạng.', { status: 503 }); }
  })());
});
