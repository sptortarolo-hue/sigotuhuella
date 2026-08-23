/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
self.addEventListener('activate', () => {
  self.clients.claim();
});

// El precache cubre TODOS los assets de dist/ (incluye chunks lazy).
// No agregar rutas runtime para scripts: sirven chunks viejos tras un deploy.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Sigo tu Huella', body: event.data?.text() ?? 'Nueva notificación' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Sigo tu Huella', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    } as NotificationOptions)
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
