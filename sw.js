/* ====== Nimbus Nav Service Worker ====== */
/* Cache-first for static assets; network-first for HTML and API calls. */

var CACHE_NAME = 'nimbus-nav-v1';
var STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './db.js',
  './sync.js',
  './search-utils.js',
  './bookmark-utils.js',
  './favicon.ico',
  './icon-16.png',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // Pass through Supabase API calls (auth, database).
  if (url.indexOf('supabase.co') >= 0 || url.indexOf('supabase.io') >= 0) {
    return;
  }

  // Pass through CDN (supabase-js) — allow network-only.
  if (url.indexOf('cdn.jsdelivr.net') >= 0) {
    return;
  }

  // For navigation (HTML), try network first then cache fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Cache-first for all other same-origin requests.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
