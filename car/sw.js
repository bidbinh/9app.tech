// Service worker của 9car: lưu vỏ ứng dụng để mở được khi mất mạng. Mạng trước, bộ nhớ đệm sau.
// Không bao giờ lưu hay gửi dữ liệu người dùng (dữ liệu nằm ở IndexedDB). Đổi CACHE_VERSION mỗi lần phát hành.
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `9car-shell-${CACHE_VERSION}`;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './search-index.json', './css/style.css',
  './js/app.js',
  './js/lib/dates.js', './js/lib/money.js', './js/lib/rules.js', './js/lib/fuel.js', './js/lib/schedule.js', './js/lib/ics.js',
  './js/lib/parse.js', './js/lib/db.js', './js/lib/data.js',
  './js/ui/dom.js', './js/ui/common.js', './js/ui/chart.js', './js/ui/voice.js', './js/ui/formnk.js', './js/ui/lich.js', './js/ui/caidat.js',
  './js/screens/home.js', './js/screens/xe.js', './js/screens/hen.js', './js/screens/nhatky.js', './js/screens/chiphi.js',
  './js/screens/sac.js', './js/screens/tienich.js', './js/screens/them.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/icon-maskable-512.png',
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
    await Promise.all(keys.filter((k) => k.startsWith('9car-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
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
      if (res && res.ok) { const cache = await caches.open(SHELL_CACHE); cache.put(req, res.clone()).catch(() => {}); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const home = await caches.match('./index.html'); if (home) return home; }
      return new Response('Đang ngoại tuyến.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
