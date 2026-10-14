// Service worker tối giản: chỉ lưu vỏ giao diện (tệp tĩnh cùng nguồn) để mở nhanh và hiện được khi mất mạng.
// KHÔNG lưu API: dữ liệu phòng/tiền luôn lấy mới từ máy chủ (đặc tả: ngoại tuyến chỉ đọc vỏ, không ghi).
const CACHE = '9stay-shell-v4';
const SHELL = ['./', 'style.css', 'app.js', 'lib.js', 'v-calendar.js', 'v-bookings.js', 'v-create.js', 'v-money.js', 'v-admin.js', 'v-bank.js', 'v-report.js', 'v-ops.js','manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // mạng trước, rơi về bản lưu khi mất mạng
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))));
});
