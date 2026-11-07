/* Game Hub service worker: precache everything so the whole app works offline.
   Bump CACHE_VERSION whenever any file changes so players get the update. */
const CACHE_VERSION = 'v1.1.0';
const CACHE = 'game-hub-' + CACHE_VERSION;

const GAMES = [
  'breakout', 'connect-four', 'depot-dash', 'hangman', 'lights-out', 'memory-match', 'minesweeper', 'simon',
  'sliding-puzzle', 'snake', 'sudoku', 'tetris', 'tic-tac-toe', 'twenty48', 'word-search'
];

const PRECACHE = [
  './',
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'shared/base.css',
  'shared/fonts.css',
  'shared/hub.js',
  'shared/fonts/dm-sans-latin-400-normal.woff2',
  'shared/fonts/dm-sans-latin-500-normal.woff2',
  'shared/fonts/dm-sans-latin-600-normal.woff2',
  'shared/fonts/fraunces-latin-600-normal.woff2',
  'shared/fonts/fraunces-latin-700-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'games/depot-dash/engine.js',
  ...GAMES.map((g) => 'games/' + g + '/index.html')
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('game-hub-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
