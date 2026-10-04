/* 9family: Service Worker chỉ để nhận Web Push và mở đúng màn khi bấm thông báo. Không lưu đệm dữ liệu. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: '9family', body: event.data ? event.data.text() : '' }; }
  var title = String(data.title || '9family').slice(0, 100);
  var opts = {
    body: String(data.body || '').slice(0, 200),
    icon: 'icon.png', badge: 'icon.png',
    tag: String(data.tag || 'f9'), renotify: true,
    data: { url: typeof data.url === 'string' ? data.url : '' },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var rel = (event.notification.data && event.notification.data.url) || '';
  var target = new URL('./' + (/^#\//.test(rel) ? rel : ''), self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) {
        if ('navigate' in list[i]) list[i].navigate(target);
        return list[i].focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
