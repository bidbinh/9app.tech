// Service worker: lưu vỏ ứng dụng để mở được khi mất mạng.
// Mạng trước, bộ nhớ đệm dự phòng, để bản mới tới máy ngay; đổi CACHE_VERSION mỗi lần phát hành.
const CACHE_VERSION = 'v1';
const CACHE = `9english-${CACHE_VERSION}`;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/sm2.js', './js/shuffle.js', './js/match.js', './js/streak.js', './js/route.js', './js/vocab.js',
  './js/ui.js', './js/store.js', './js/speech.js', './js/practice.js',
  './js/view-home.js', './js/view-learn.js', './js/view-talk.js', './js/view-listen.js', './js/view-test.js', './js/view-more.js', './js/app.js',
  './data/vocab-email.js', './data/vocab-meeting.js', './data/vocab-report.js', './data/vocab-travel.js',
  './data/vocab-interview.js', './data/vocab-finance.js', './data/vocab-tech.js',
  './data/phrases.js', './data/templates.js', './data/dialogs.js', './data/listening.js', './data/placement.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('9english-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Tệp dùng chung của hệ 9app (nút về 9app): mạng trước, không bắt buộc có trong bộ nhớ đệm
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await caches.match('./index.html'); if (idx) return idx; }
      throw err;
    }
  })());
});
