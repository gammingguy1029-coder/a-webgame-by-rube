/* ============================================================
   service-worker.js — cache core files for offline play.
   ============================================================ */
'use strict';

const CACHE_NAME = 'one-more-floor-v3';

const CORE_ASSETS = [
  '../index.html',
  '../css/style.css',
  '../js/ads.js',
  '../js/ownerMode.js',
  '../js/audio.js',
  '../js/settings.js',
  '../js/save.js',
  '../js/particles.js',
  '../js/input.js',
  '../js/mobileControls.js',
  '../js/weapons.js',
  '../js/player.js',
  '../js/enemies.js',
  '../js/bosses.js',
  '../js/collision.js',
  '../js/camera.js',
  '../js/procedural.js',
  '../js/rooms.js',
  '../js/upgrades.js',
  '../js/dailyChallenge.js',
  '../js/ui.js',
  '../js/game.js',
  '../js/main.js',
  '../pwa/manifest.json',
  '../assets/icons/icon-192.png',
  '../assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first for navigation, HTML, JS, and CSS so that updates to the game
// always take effect (cache-first would serve stale/broken dev files forever).
// Cache-first only for immutable assets (icons).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isStatic = /\.(png|jpg|jpeg|webp|gif|ico)$/.test(url.pathname);

  const networkFirst = () => {
    return fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => {
      // Only serve the app shell for navigation requests; a missing JS/CSS
      // asset should 404 rather than receive the HTML document as its body
      // (which would be a runtime syntax error for scripts).
      if (req.mode === 'navigate') return caches.match('../index.html');
      return caches.match(req);
    });
  };

  if (req.mode === 'navigate' || !isStatic) {
    event.respondWith(networkFirst());
  } else {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
