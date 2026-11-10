# Game Hub

Twenty relaxing puzzle, word and arcade games in one installable, offline-capable web app. No ads, no accounts, no tracking; progress is saved on the device only.

Plain HTML/CSS/JavaScript, no build step. Each game is a self-contained page in `games/<name>/index.html`. Shared code lives in `shared/`:

- `hub.js`: safe storage (never throws), seeded random numbers, tab-visibility helper, service-worker registration
- `base.css`: mobile hardening (safe areas, dynamic viewport height, tap targets, reduced motion)
- `fonts.css` + `fonts/`: bundled DM Sans and Fraunces (SIL OFL 1.1), so no third-party requests

## Run locally

    python3 -m http.server 8000

Then open http://localhost:8000 (a service worker needs `http://localhost`, not `file://`).

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/pages.yml`, which publishes the static files. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.

## Shipping an update

Edit any file, then bump `CACHE_VERSION` in `sw.js` so installed copies refresh.

## Adding a game

1. Create `games/<name>/index.html` using an existing game's `<head>` (it loads the shared CSS/JS).
2. Add a card to `index.html` and the page to `PRECACHE` in `sw.js`.
3. Use `HubStorage` for saves, never `localStorage` directly.

## Games

Crackword (guess the hidden 4, 5 or 6-letter word; daily and practice; word lists from SCOWL in `games/crackword/words.js`, licence in `SCOWL-LICENSE.txt`), Way Out (slide coloured blocks out through matching doors; generator and par solver in `games/way-out/engine.js`), Leaf & Drop (two-symbol balancing logic puzzle with = and × signs; generator and solver in `games/balance/engine.js`), Kingdoms (one crown per row, column and kingdom; generator and solver in `games/kingdoms/engine.js`), Deduce: Logic Grids (logic-grid deduction puzzles; generator and solver in `games/deduce/engine.js`), Depot Dash (bus-jam puzzle with endless generated levels; logic in `games/depot-dash/engine.js`), Sliding Puzzle, 2048, Light Switch, Sudoku, Block Drop, Memory Match, Color Sequence, Mine Finder, Word Search, Hangman, Tic Tac Toe, Four in a Row, Snake, Brick Breaker.
