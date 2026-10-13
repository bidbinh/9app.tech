// Service worker của 9unit: lưu vỏ ứng dụng để mở được khi mất mạng.
// Mạng trước, bộ nhớ đệm sau (bản mới tới máy ngay khi có mạng). Đổi CACHE_VERSION mỗi lần phát hành.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `9unit-shell-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/lib/text.js',
  './js/lib/calc.js',
  './js/lib/voice.js',
  './js/lib/units.js',
  './js/lib/lunar.js',
  './js/lib/dates.js',
  './js/lib/loan.js',
  './js/lib/money.js',
  './js/lib/store.js',
  './js/ui/dom.js',
  './js/ui/voicebox.js',
  './js/screens/maytinh.js',
  './js/screens/doidonvi.js',
  './js/screens/ngaythang.js',
  './js/screens/vaylai.js',
  './js/screens/chiatien.js',
  './js/screens/demnguoc.js',
  './js/screens/docso.js',
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
    await Promise.all(keys.filter((k) => k.startsWith('9unit-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
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
