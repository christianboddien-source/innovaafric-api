const CACHE = 'innovaafric-v14';
const PAGES = ['/app', '/', '/money', '/shop', '/delivery', '/bigshop', '/perfil', '/circular', '/representante', '/rider', '/comercio'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PAGES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // solo cachear GET de páginas propias
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('/v1/')) return; // no cachear API

  // RED PRIMERO para páginas y scripts: las actualizaciones llegan al instante;
  // la caché solo se usa sin conexión. (Antes era cache-first y los móviles
  // se quedaban con versiones viejas de la app.)
  e.respondWith(
    fetch(e.request).then(res => {
      if(res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// ── Web Push: mostrar la notificación recibida ───────────────
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'INNOVAAFRIC';
  const opts = {
    body: d.body || '',
    icon: d.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
    vibrate: [80, 40, 80]
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// ── Click en la notificación: abrir/enfocar la app ───────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        // si ya hay una ventana de la app abierta, la enfocamos
        if ('focus' in c) { c.focus(); if ('navigate' in c && target !== '/') c.navigate(target).catch(() => {}); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
