// Britto's service worker. It only shows price alerts: it caches nothing, because a stale
// price is worse than a slow page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil((async () => {
    await self.registration.showNotification(m.title || 'Britto', {
      body: m.body || '',
      icon: '/icon-192.png',
      tag: m.tag || undefined,
      data: { url: m.url || '/' },
    });
    // Open Britto tabs hear about it too (the alerts page refreshes; tests read it).
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'britto-push', message: m });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return; // only ever opens our own pages
  event.waitUntil(self.clients.openWindow(url.href));
});
