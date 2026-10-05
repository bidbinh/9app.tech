// Service worker của 9payday: lưu vỏ ứng dụng để mở được khi mất mạng.
// Mạng trước, bộ nhớ đệm sau (bản mới tới máy ngay khi có mạng). Đổi CACHE_VERSION mỗi lần phát hành.
// Chỉ lưu tệp của chính app; không bao giờ lưu hay gửi dữ liệu người dùng (dữ liệu nằm trong IndexedDB).
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `9payday-shell-${CACHE_VERSION}`;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './search-index.json', './css/style.css',
  './js/app.js',
  './js/lib/text.js', './js/lib/voice-so.js', './js/lib/spend.js', './js/lib/dates.js', './js/lib/tax.js', './js/lib/vay.js',
  './js/lib/ics.js', './js/lib/lich.js', './js/lib/ky.js', './js/lib/store.js', './js/lib/nguon.js',
  './js/ui/dom.js', './js/ui/chung.js', './js/ui/ghinhanh.js', './js/ui/tuychon.js',
  './js/screens/homnay.js', './js/screens/luong.js', './js/screens/tien.js', './js/screens/muctieu.js', './js/screens/them.js',
  './js/screens/quyettoan.js', './js/screens/lich.js', './js/screens/dulieu.js', './js/screens/nguon.js',
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
    await Promise.all(keys.filter((k) => k.startsWith('9payday-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
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
