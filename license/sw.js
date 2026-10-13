// Service worker 9license: mở được khi không có mạng.
// - Vỏ app (HTML/CSS/JS/dữ liệu JSON/icon): lưu sẵn khi cài; lấy từ mạng trước, lỗi mạng thì dùng bản lưu.
// - Hình minh họa câu hỏi (data/img): lưu dần khi xem (hoặc tải sẵn trong Cài đặt), ưu tiên bản đã lưu.
// Đổi VERSION mỗi lần phát hành để máy đã cài nhận bản mới.
const VERSION = 'v3';
// Chờ mạng tối đa bấy nhiêu ms; quá hạn mà đã có bản lưu thì dùng bản lưu (mạng yếu không làm app đơ).
const NET_TIMEOUT = (self.__SW_TEST && self.__SW_TEST.timeout) || 3500;
const SHELL_CACHE = `9license-shell-${VERSION}`;
const IMG_CACHE = '9license-img-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/core.js',
  './js/ics.js',
  './js/rules.js',
  './js/prefetch.js',
  './js/signs.js',
  './js/state.js',
  './js/store.js',
  './js/ui.js',
  './js/views/pages.js',
  './js/views/pages2.js',
  './js/views/quiz.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './data/questions.json',
  './data/sets.json',
  './data/meta.json',
  './data/tips.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('9license-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/data/img/')) {
    e.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  e.respondWith(networkFirst(req));
});

// Mạng trước, có hạn chót. Bản tải được (dù đến muộn) luôn được ghi lại vào bộ nhớ đệm cho lần sau.
function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true });
    const done = (res) => { if (!settled && res) { settled = true; resolve(res); return true; } return false; };
    const timer = setTimeout(async () => { done(await fromCache()); }, NET_TIMEOUT);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      done(res);
    }).catch(async () => {
      clearTimeout(timer);
      if (done(await fromCache())) return;
      if (req.mode === 'navigate') done(await caches.match('./index.html'));
      done(Response.error());
    });
  });
}
