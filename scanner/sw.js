// Service worker 9scanner: vỏ ứng dụng lưu sẵn để mở được khi mất mạng; dữ liệu OCR (vendor/) lưu khi dùng lần đầu.
// Đổi CACHE_VERSION mỗi lần phát hành.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `9scanner-shell-${CACHE_VERSION}`;
const VENDOR_CACHE = `9scanner-vendor-${CACHE_VERSION}`;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/geom.js', './js/edges.js', './js/filters.js', './js/pdf.js', './js/compress.js', './js/store.js',
  './js/render.js', './js/camera.js', './js/cropper.js', './js/sign.js', './js/ocr.js', './js/export.js', './js/idlayout.js', './js/textutil.js', './js/jpeg.js', './js/signmath.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/icon-maskable-512.png',
  '/js/homebar.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, VENDOR_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('9scanner-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vendor/')) {
    // Cache-first: tệp lớn, không đổi
    event.respondWith((async () => {
      const cache = await caches.open(VENDOR_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }
  // Network-first, lỗi mạng thì lấy từ cache
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' }); // luôn xác thực lại với máy chủ, tránh trộn phiên bản module từ cache HTTP
      if (res.ok && (req.url.startsWith(self.registration.scope) || url.pathname === '/js/homebar.js')) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) {
      const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      if (hit) return hit;
      throw e;
    }
  })());
});
