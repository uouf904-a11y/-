const VERSION = 'v1';
const CACHE = 'athar-' + VERSION;
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap';
const FILES = ['./', './index.html', './manifest.webmanifest', './storage.js', './check.html',
  './icon-192.png', './icon-512.png', './maskable-192.png', './maskable-512.png',
  './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES);
    // best-effort: cache Google font CSS + font files for offline use
    try {
      const r = await fetch(FONT_CSS, { mode: 'cors' });
      if (r.ok) {
        const css = await r.clone().text();
        await c.put(FONT_CSS, r);
        const urls = [...new Set((css.match(/https:\/\/fonts\.gstatic\.com[^)'"\s]+/g) || []))];
        await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(x => x.ok && c.put(u, x)).catch(() => {})));
      }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('athar-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // page navigations: network-first, fall back to cached index.html offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r && r.ok && url.origin === location.origin) {
          const c = await caches.open(CACHE); c.put(req, r.clone());
        }
        return r;
      } catch (_) {
        return (await caches.match(req, { ignoreSearch: true })) ||
               (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // fonts: cache-first, fill cache at runtime
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        const c = await caches.open(CACHE); c.put(req, r.clone());
        return r;
      } catch (_) { return Response.error(); }
    })());
    return;
  }

  // same-origin files: cache-first, update in background
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      const net = fetch(req).then(async r => {
        if (r && r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
        return r;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
  }
});
