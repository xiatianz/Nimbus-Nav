/* ====== Nimbus Nav Service Worker ====== */
/* Cache-first for static assets; network-first for HTML and API calls. */

// CACHE_NAME 每次修改静态资源时应递增 build 版本号，activate 阶段会自动
// 清理旧缓存，避免用户长期停留在缓存的旧代码上。
var BUILD_VERSION = '2026-07-21-a7013fab';
var CACHE_NAME = 'nimbus-nav-' + BUILD_VERSION;
var CDN_CACHE_NAME = 'nimbus-nav-cdn-' + BUILD_VERSION;

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
      return Promise.allSettled(
        STATIC_ASSETS.map(function (asset) {
          return cache.add(asset).catch(function (err) {
            console.warn('SW: failed to cache ' + asset + ':', err.message);
          });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  var keepKeys = { };
  keepKeys[CACHE_NAME] = true;
  keepKeys[CDN_CACHE_NAME] = true;
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return !keepKeys[key]; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// stale-while-revalidate：立即返回缓存，同时后台刷新最新版本。
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var networkFetch = fetch(request).then(function (response) {
        // 只缓存成功响应，避免把 5xx 或 opaque 错误也缓存下来
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone()).catch(function () {});
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || networkFetch;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = request.url;

  // Pass through Supabase API calls (auth, database) — 永远走网络，不缓存动态数据。
  if (url.indexOf('supabase.co') >= 0 || url.indexOf('supabase.io') >= 0) {
    return;
  }

  // supabase-js CDN：使用 stale-while-revalidate，离线时也能读到上次的 bundle
  // （URL 已按版本锁定，无需担心版本漂移）。
  if (url.indexOf('cdn.jsdelivr.net') >= 0) {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE_NAME));
    return;
  }

  // For navigation (HTML), network-first with timeout + cache fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetch(request).then(function (response) {
          // 缓存成功响应，下次离线/超时可兜底
          if (response && response.ok) {
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put('./index.html', response.clone()).catch(function () {});
            }).catch(function () {});
          }
          return response;
        }),
        new Promise(function (resolve, reject) {
          setTimeout(function () { reject(new Error('nav-timeout')); }, 4000);
        })
      ]).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          if (cached) return cached;
          // 最后兜底：返回一个最小 HTML，避免刷新一直转
          return new Response(
            '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="1"></head><body></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
    return;
  }

  // Cache-first for all other same-origin requests.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, clone);
        }).catch(function () {});
        return response;
      });
    })
  );
});

// 允许页面主动触发 skipWaiting（例如提示用户 "有新版本" 后点更新）。
self.addEventListener('message', function (event) {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
