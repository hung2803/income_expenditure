/* global self, URL */
self.addEventListener('push', (event) => {
  let data = { title: 'Thu Chi', body: 'Bạn có thông báo mới. Mở ứng dụng để xem.', url: '/notifications' };
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === 'object') data = { ...data, ...parsed };
  } catch { /* Keep the generic safe notification. */ }
  event.waitUntil(self.registration.showNotification(String(data.title).slice(0, 80), {
    body: String(data.body).slice(0, 160),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'thu-chi-reminder',
    data: { url: '/notifications' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/notifications', self.location.origin).href;
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) { await client.focus(); if ('navigate' in client) await client.navigate(target); return; }
    }
    await self.clients.openWindow(target);
  })());
});
