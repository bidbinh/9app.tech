// Service worker: cache vỏ ứng dụng để mở được khi mất mạng.
//
// Nguyên tắc:
//   - HTML/JS/CSS: network-first, fallback cache (bản mới tới máy; offline vẫn mở được).
//   - Tile bản đồ: stale-while-revalidate, giới hạn số lượng.
//   - Overpass API: KHÔNG cache ở đây (đã có IndexedDB trong app lo việc đó).
//   - data/*.bin Range: đi thẳng ra mạng (IndexedDB đã cache từng ô).
//   - Đổi CACHE_VERSION mỗi lần phát hành để máy đã cài PWA nhận worker mới.

const CACHE_VERSION = 'v9';
const SHELL_CACHE = `9speed-shell-${CACHE_VERSION}`;
const TILE_CACHE = `9speed-tiles-${CACHE_VERSION}`;
const TILE_LIMIT = 600;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/geoutils.js',
  './js/geo.js',
  './js/sim.js',
  './js/matcher.js',
  './js/speedlimit.js',
  './js/poi.js',
  './js/hours.js',
  './js/alerts.js',
  './js/viet.js',
  './js/voicebank.js',
  './js/overpass.js',
  './js/tiles.js',
  './js/overlay.js',
  './js/vnname.js',
  './js/store.js',
  './js/mapview.js',
  './js/vnislands.js',
  './icons/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll thất bại toàn bộ nếu một file lỗi, nên thêm từng file riêng
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('9speed-') && k !== SHELL_CACHE && k !== TILE_CACHE)
        .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const key of keys.slice(0, keys.length - limit)) await cache.delete(key);
}

async function networkFirst(request, cacheName, { navigateFallback = false } = {}) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (navigateFallback && request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.pathname.includes('/api/interpreter')) return; // Overpass: luôn đi thẳng ra mạng

  // Bộ dữ liệu đường được lấy theo đoạn byte. Nếu service worker trả về bản
  // cache đầy đủ (200) cho một yêu cầu Range thì client sẽ giải nén nhầm dữ
  // liệu, nên để những yêu cầu này đi thẳng ra mạng. App đã tự cache từng ô
  // trong IndexedDB rồi.
  if (request.headers.has('range') || url.pathname.includes('/data/s/')) return;

  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(request);
      const network = fetch(request).then((res) => {
        if (res.ok) { cache.put(request, res.clone()); trimCache(TILE_CACHE, TILE_LIMIT); }
        return res;
      }).catch(() => hit);
      return hit || network;
    })());
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE, { navigateFallback: true }));
});
