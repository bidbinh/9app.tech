// Service worker của 9fit: lưu toàn bộ vỏ ứng dụng và dữ liệu bài tập để chạy ngoại tuyến.
// Mạng trước, bộ nhớ đệm sau (bản mới tới máy ngay khi có mạng). Đổi CACHE_VERSION mỗi lần phát hành. Tệp này do scripts/make-sw.js sinh ra.
const CACHE_VERSION = 'v3';
const SHELL_CACHE = `9fit-shell-${CACHE_VERSION}`;

const SHELL = [
  "./",
  "./css/style.css",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon-maskable.svg",
  "./icons/icon.svg",
  "./index.html",
  "./js/app.js",
  "./js/data/ex-base.js",
  "./js/data/ex-chan.js",
  "./js/data/ex-core-nhay.js",
  "./js/data/ex-gian-co.js",
  "./js/data/ex-nhanh-thang-bang.js",
  "./js/data/ex-than-tren.js",
  "./js/data/exercises.js",
  "./js/data/functions.js",
  "./js/data/programs.js",
  "./js/data/routines.js",
  "./js/lib/an-toan.js",
  "./js/lib/calc.js",
  "./js/lib/db.js",
  "./js/lib/dongbo.js",
  "./js/lib/fitness.js",
  "./js/lib/nine-sync-ui.js",
  "./js/lib/nine-sync.js",
  "./js/lib/parq.js",
  "./js/lib/routine.js",
  "./js/lib/schema.js",
  "./js/lib/store.js",
  "./js/lib/text.js",
  "./js/screens/hom-nay.js",
  "./js/screens/tap-ct.js",
  "./js/screens/tap-ghi.js",
  "./js/screens/tap-ls.js",
  "./js/screens/tap.js",
  "./js/screens/them-dl.js",
  "./js/screens/them-kd.js",
  "./js/screens/them-sk.js",
  "./js/screens/them.js",
  "./js/screens/thu-vien.js",
  "./js/screens/tien-do.js",
  "./js/ui/bodymap.js",
  "./js/ui/charts.js",
  "./js/ui/common.js",
  "./js/ui/dom.js",
  "./js/ui/rest.js",
  "./js/ui/timer.js",
  "./manifest.webmanifest",
  "./search-index.json"
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
    await Promise.all(keys.filter((k) => k.startsWith('9fit-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;   // /id/ (đồng bộ) không đi qua bộ đệm
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
