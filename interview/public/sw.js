// Service worker: lưu vỏ ứng dụng để mở được khi mất mạng. HTML/JS/CSS: ưu tiên mạng, dự phòng bộ nhớ đệm.
// Không bao giờ lưu đệm /api/ (nội dung người dùng đi qua đó). Đổi VERSION mỗi lần phát hành.
const VERSION = 'v1';
const CACHE = `9interview-${VERSION}`;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('9interview-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/healthz')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match(new URL('./', self.registration.scope).href) : null);
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
