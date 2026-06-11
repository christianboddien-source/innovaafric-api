const CACHE = 'innovaafric-v8';
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
