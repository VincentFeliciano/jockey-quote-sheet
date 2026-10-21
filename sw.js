/* Offline shell. The shop has bad signal; the app should still open. */
var CACHE = 'quote-sheet-v6';
var SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/schema.js',
  'js/store.js',
  'js/photos.js',
  'js/ui.js',
  'js/print.js',
  'js/sync.js',
  'js/app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/plymr.png',
  'icons/cg.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Code and markup go network-first, so a fresh push is what you actually get
   when online; the cache is the fallback for bad signal. Icons and images stay
   cache-first, since they never change under the same name.
   Serving stale JS next to fresh HTML is what breaks an update, so code is
   never allowed to come from the cache while there is a network. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  function fromCache() {
    return caches.match(req).then(function (hit) {
      return hit || caches.match('./') || caches.match('index.html');
    });
  }

  function networkFirst() {
    return fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(fromCache);
  }

  var isCode = /\.(js|css|json|html)$/i.test(url.pathname) ||
               req.mode === 'navigate' ||
               url.pathname === '/' ||
               url.pathname.slice(-1) === '/';

  if (isCode) {
    e.respondWith(networkFirst());
    return;
  }

  /* images: cache-first, refreshed in the background */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || fresh;
    })
  );
});
