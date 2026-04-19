const CACHE = 'scout-v25';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete all old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;

  const url = new URL(e.request.url);

  // Hashed Vite bundles (/assets/*) are immutable — cache-first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            // Clone synchronously, BEFORE the async caches.open() resolves —
            // otherwise the body may already be consumed when .put() runs.
            const resClone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, resClone));
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML and everything else — network-first so deploys are always picked up
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        // Same pattern: clone before the async put() so the body isn't
        // consumed by the browser before we get a chance to cache it.
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(r => r || caches.match('/index.html'))
    )
  );
});

// ── Web Push: Editor's Note drop ────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { title: 'Scout', body: e.data ? e.data.text() : '' }; }

  const title = data.title || 'Scout';
  const body  = data.body  || '';
  const date  = data.date  || '';

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      tag:   date ? `scout-edition-${date}` : 'scout-edition',
      data:  { date },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const date = e.notification.data?.date || '';
  const target = date ? `/?note=${encodeURIComponent(date)}` : '/';

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin) {
        await client.focus();
        client.postMessage({ type: 'open-note', date });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
