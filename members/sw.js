/* Grundimpuls Members Hub — Service Worker
   Strategy: Cache-first for assets, Network-first for the HTML page.
   This means the app loads instantly from cache, and content updates
   silently in the background when a connection is available.
*/

const CACHE_NAME = 'gi-hub-v1';

// Resources to pre-cache on install (the app shell)
const PRECACHE_URLS = [
  '/members/',
  '/members/index.html',
  '/members/assets/icon-192.png',
  '/members/assets/icon-512.png',
  '/members/assets/favicon_blue.png',
  '/members/assets/drop_light.svg',
  '/members/assets/drop_dark.svg',
  '/members/assets/drop_orange.png'
];

// ── Install: pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ─────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and non-http(s) requests (e.g. chrome-extension)
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // For the HTML page itself: network-first so updates land quickly
  if (url.pathname === '/members/' || url.pathname === '/members/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh version
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For everything else (assets, fonts, CDN): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch and cache for next time
      return fetch(event.request).then(response => {
        // Only cache successful same-origin or CORS responses
        if (!response || response.status !== 200 ||
            (response.type !== 'basic' && response.type !== 'cors')) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Nothing in cache and no network — return a simple offline message
        // only for navigation requests (page loads)
        if (event.request.destination === 'document') {
          return new Response(
            '<html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
            '<h2>You are offline</h2>' +
            '<p>Open the hub when you have a connection and it will be available offline from then on.</p>' +
            '</body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      });
    })
  );
});
