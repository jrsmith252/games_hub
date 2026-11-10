/* Game Hub service worker: precache everything so the whole app works offline.
   Pages and assets are fetched network-first, so updates show up straight away when online.
   Bump CACHE_VERSION (and the version in the hub footer) when releasing. */
const CACHE_VERSION = 'v1.16.3';
const CACHE = 'game-hub-' + CACHE_VERSION;

const GAMES = [
  'balance', 'breakout', 'connect-four', 'crackword', 'deduce', 'depot-dash', 'hangman', 'kingdoms', 'lights-out', 'memory-match', 'minesweeper', 'simon',
  'sliding-puzzle', 'snake', 'sudoku', 'tetris', 'tic-tac-toe', 'twenty48', 'way-out', 'word-search'
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
  'games/depot-dash/worker.js',
  'games/deduce/engine.js',
  'games/kingdoms/engine.js',
  'games/balance/engine.js',
  'games/way-out/engine.js',
  'games/crackword/words.js',
  'games/crackword/definitions.js',
  'games/way-out/worker.js',
  'games/way-out/levels.json',
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

// Network first: always load the latest version when online (and refresh the
// offline copy as we go); fall back to the saved copy when offline or very slow.
const NETWORK_TIMEOUT_MS = 4000;

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(req, { cache: 'no-cache' }).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      resolve(res);
    }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fromNetwork(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((hit) =>
        hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
      )
    )
  );
});
