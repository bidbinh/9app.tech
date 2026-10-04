// Service worker 9race.
// - Vỏ ứng dụng (HTML/CSS/JS/icon): precache theo phiên bản, phục vụ từ cache (nhất quán một bộ tệp).
//   Bản mới cài xong sẽ CHỜ; trang hiện banner "Tải lại", người dùng bấm thì mới kích hoạt.
// - data/races.json: stale-while-revalidate; có bản khác thì báo trang qua postMessage.
// Đổi CACHE_VERSION mỗi lần phát hành vỏ ứng dụng.

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `9race-shell-${CACHE_VERSION}`;
const DATA_CACHE = '9race-data';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/util.js',
  './js/model.js',
  './js/ics.js',
  './js/store.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    // Không skipWaiting ở đây: chờ người dùng đồng ý (xem message SKIP_WAITING).
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('9race-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function notifyClients(msg) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) => c.postMessage(msg));
}

async function staleWhileRevalidateData(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  // Đọc nội dung bản cũ trước khi trả cho trang (body chỉ đọc được một lần).
  const cachedText = cached ? await cached.clone().text() : null;
  const network = fetch(request).then(async (res) => {
    if (res && res.ok) {
      const forCache = res.clone();
      const text = await res.clone().text();
      await cache.put(request, forCache);
      if (cachedText !== null && cachedText !== text) notifyClients({ type: 'data-updated' });
    }
    return res;
  }).catch(() => null);
  if (cached) { network.catch(() => {}); return cached; }
  const res = await network;
  return res || new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/races.json')) {
    event.respondWith(staleWhileRevalidateData(req));
    return;
  }

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
