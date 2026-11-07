/* Depot Dash game engine: level generation and rules. No DOM access, so the
   same code runs in the browser and in the Node test suite. */
(function (root) {
    'use strict';

    var PALETTE = [
        { name: 'Red',    hex: '#ef4444', sym: '●', ink: '#ffffff' },
        { name: 'Blue',   hex: '#3b82f6', sym: '▲', ink: '#ffffff' },
        { name: 'Yellow', hex: '#facc15', sym: '■', ink: '#1f2937' },
        { name: 'Green',  hex: '#22c55e', sym: '◆', ink: '#052e16' },
        { name: 'Purple', hex: '#a855f7', sym: '★', ink: '#ffffff' },
        { name: 'Orange', hex: '#fb923c', sym: '✚', ink: '#431407' }
    ];
    var DIRV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    var BASE_BAYS = 5;
    var UNDO_PER_LEVEL = 3;

    // ---------- seeded random (mulberry32) ----------
    function rng(seed) {
        var a = (seed >>> 0) || 1;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function shuffle(arr, r) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(r() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

    // ---------- geometry ----------
    function isHoriz(b) { return b.dir === 'L' || b.dir === 'R'; }
    function cellsOf(b) {
        var out = [];
        for (var i = 0; i < b.len; i++) out.push(isHoriz(b) ? [b.x + i, b.y] : [b.x, b.y + i]);
        return out;
    }
    function frontOf(b) {
        switch (b.dir) {
            case 'R': return [b.x + b.len - 1, b.y];
            case 'D': return [b.x, b.y + b.len - 1];
            default: return [b.x, b.y]; // L and U: front is the first cell
        }
    }
    function occupancy(level, removed) {
        var g = new Array(level.cols * level.rows);
        for (var k = 0; k < g.length; k++) g[k] = -1;
        level.buses.forEach(function (b, i) {
            if (removed && removed[i]) return;
            cellsOf(b).forEach(function (c) { g[c[1] * level.cols + c[0]] = i; });
        });
        return g;
    }
    // Is the road from bus i's front to the edge of the depot clear?
    function exitInfo(level, removed, i, occ) {
        occ = occ || occupancy(level, removed);
        var b = level.buses[i];
        var v = DIRV[b.dir];
        var p = frontOf(b);
        var x = p[0], y = p[1], dist = 0;
        for (;;) {
            x += v[0]; y += v[1];
            if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return { clear: true, dist: dist };
            var o = occ[y * level.cols + x];
            if (o !== -1) return { clear: false, dist: dist, blocker: o };
            dist++;
        }
    }
    // Removing a bus only ever frees cells, so greedy removal finds a full
    // clearance whenever one exists.
    function fullyRemovable(level) {
        var removed = new Array(level.buses.length).fill(false);
        var left = level.buses.length, progress = true;
        while (left > 0 && progress) {
            progress = false;
            var occ = occupancy(level, removed);
            for (var i = 0; i < level.buses.length; i++) {
                if (!removed[i] && exitInfo(level, removed, i, occ).clear) {
                    removed[i] = true; left--; progress = true;
                    occ = occupancy(level, removed);
                }
            }
        }
        return left === 0;
    }

    // ---------- difficulty curve ----------
    function params(n) {
        var cols = Math.min(7, 4 + Math.floor((n + 1) / 6));      // 4..7
        var rows = Math.min(9, 5 + Math.floor(n / 5));            // 5..9
        var colours = Math.min(6, 2 + Math.floor((n + 1) / 4));   // 2..6
        var maxBuses = Math.floor(cols * rows / 2.5);
        var buses = Math.max(3, Math.min(maxBuses, 3 + Math.floor(n * 0.8)));
        // How many buses the intended solution parks at once (bays are 5)
        var maxPark = n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : n <= 15 ? 4 : 5;
        // The solution must genuinely need this many bays at its busiest moment
        var minPeak = n <= 2 ? 1 : n <= 5 ? 2 : n <= 12 ? 3 : 4;
        var removeBias = Math.min(0.85, 0.4 + n * 0.03);
        var longChance = n <= 2 ? 0 : Math.min(0.5, 0.15 + n * 0.012);
        var minBlocked = n <= 2 ? 0 : 0.3;
        return { cols: cols, rows: rows, colours: colours, buses: buses, maxPark: maxPark, minPeak: minPeak,
                 removeBias: removeBias, longChance: longChance, minBlocked: minBlocked, bays: BASE_BAYS };
    }

    // ---------- game state (shared by the UI and by level verification) ----------
    function createState(level) {
        return {
            level: level,
            removed: new Array(level.buses.length).fill(false),
            bays: new Array(level.bays).fill(null),
            q: 0, moves: 0,
            undoLeft: UNDO_PER_LEVEL, extraUsed: false, boostsUsed: 0,
            history: []
        };
    }
    function snapshot(st) {
        return {
            removed: st.removed.slice(),
            bays: st.bays.map(function (b) { return b ? { bus: b.bus, colour: b.colour, cap: b.cap, filled: b.filled } : null; }),
            q: st.q, moves: st.moves
        };
    }
    function tap(st, i) {
        if (st.removed[i]) return { type: 'gone' };
        var ex = exitInfo(st.level, st.removed, i);
        if (!ex.clear) return { type: 'blocked', dist: ex.dist, blocker: ex.blocker };
        var free = st.bays.indexOf(null);
        if (free === -1) return { type: 'full' };
        st.history.push(snapshot(st));
        st.removed[i] = true;
        var b = st.level.buses[i];
        st.bays[free] = { bus: i, colour: b.colour, cap: b.cap, filled: 0 };
        st.moves++;
        return { type: 'exit', bay: free, dist: ex.dist };
    }
    // Board the next passenger onto the left-most bay bus of their colour.
    function boardOne(st) {
        var Q = st.level.queue;
        if (st.q >= Q.length) return null;
        var c = Q[st.q];
        var bi = -1;
        for (var i = 0; i < st.bays.length; i++) {
            if (st.bays[i] && st.bays[i].colour === c) { bi = i; break; }
        }
        if (bi === -1) return null;
        var bay = st.bays[bi];
        bay.filled++; st.q++;
        var departed = bay.filled >= bay.cap;
        if (departed) st.bays[bi] = null;
        return { bay: bi, colour: c, departed: departed, bus: bay.bus, filled: bay.filled, cap: bay.cap };
    }
    function isWon(st) { return st.q >= st.level.queue.length; }
    function isStuck(st) {
        if (isWon(st) || st.bays.indexOf(null) !== -1) return false;
        var c = st.level.queue[st.q];
        return !st.bays.some(function (b) { return b && b.colour === c; });
    }
    function undo(st) {
        if (!st.history.length || st.undoLeft <= 0) return false;
        var s = st.history.pop();
        var n = st.bays.length;
        st.removed = s.removed; st.bays = s.bays; st.q = s.q; st.moves = s.moves;
        while (st.bays.length < n) st.bays.push(null);
        st.undoLeft--; st.boostsUsed++;
        return true;
    }
    function addBay(st) {
        if (st.extraUsed) return false;
        st.bays.push(null); st.extraUsed = true; st.boostsUsed++;
        return true;
    }
    function starsFor(st) { return st.boostsUsed === 0 ? 3 : st.boostsUsed <= 2 ? 2 : 1; }

    // Play a level by tapping buses in `plan` order whenever nobody can board.
    // Uses the exact same rules as the game, so success proves the level is solvable.
    function simulate(level, plan) {
        var st = createState(level), pi = 0, peak = 0;
        for (;;) {
            while (boardOne(st)) { /* board everyone who can */ }
            if (isWon(st)) return { ok: true, peak: peak, moves: st.moves };
            if (pi >= plan.length) return { ok: false };
            var res = tap(st, plan[pi++]);
            if (res.type !== 'exit') return { ok: false };
            var used = 0;
            st.bays.forEach(function (b) { if (b) used++; });
            if (used > peak) peak = used;
        }
    }

    // ---------- generation ----------
    function tryGenerate(n, p, r) {
        var lvl = { number: n, cols: p.cols, rows: p.rows, bays: p.bays, buses: [], queue: [] };
        var occ = new Array(p.cols * p.rows).fill(-1);
        var tries = 0;
        while (lvl.buses.length < p.buses && tries < 900) {
            tries++;
            var len = r() < p.longChance ? 3 : 2;
            var dir = 'UDLR'.charAt(Math.floor(r() * 4));
            var horiz = dir === 'L' || dir === 'R';
            var maxX = horiz ? p.cols - len : p.cols - 1;
            var maxY = horiz ? p.rows - 1 : p.rows - len;
            var b = { x: Math.floor(r() * (maxX + 1)), y: Math.floor(r() * (maxY + 1)), len: len, dir: dir };
            var cs = cellsOf(b);
            if (cs.some(function (c) { return occ[c[1] * p.cols + c[0]] !== -1; })) continue;
            lvl.buses.push(b);
            if (!fullyRemovable(lvl)) { lvl.buses.pop(); continue; }
            var id = lvl.buses.length - 1;
            cs.forEach(function (c) { occ[c[1] * p.cols + c[0]] = id; });
        }
        var N = lvl.buses.length;
        if (N < Math.max(3, Math.floor(p.buses * 0.7))) return null;

        // Require a real jam: some buses must start blocked
        var blocked = 0;
        var occ0 = occupancy(lvl, null);
        for (var i = 0; i < N; i++) if (!exitInfo(lvl, null, i, occ0).clear) blocked++;
        if (blocked < Math.floor(N * p.minBlocked)) return null;

        // Colours: use every colour at least once, then random
        var k = Math.min(p.colours, N);
        shuffle(range(N), r).forEach(function (id, idx) {
            lvl.buses[id].colour = idx < k ? idx : Math.floor(r() * k);
        });
        lvl.buses.forEach(function (bb) { bb.cap = bb.len === 3 ? 6 : 4; });

        // A valid removal order (random among currently-free buses)
        var removed = new Array(N).fill(false), plan = [];
        while (plan.length < N) {
            var o = occupancy(lvl, removed), cand = [];
            for (var j = 0; j < N; j++) if (!removed[j] && exitInfo(lvl, removed, j, o).clear) cand.push(j);
            if (!cand.length) return null;
            var pick = cand[Math.floor(r() * cand.length)];
            removed[pick] = true; plan.push(pick);
        }

        // Service order: buses get "parked" (removed but not yet served) up to maxPark at once.
        // Serving them in a different order from their removal is what makes players plan ahead.
        var parked = [], service = [], idx2 = 0;
        while (service.length < N) {
            var canRemove = idx2 < N && parked.length < p.maxPark;
            if (canRemove && (parked.length === 0 || r() < p.removeBias)) {
                parked.push(plan[idx2++]);
            } else {
                service.push(parked.splice(Math.floor(r() * parked.length), 1)[0]);
            }
        }
        service.forEach(function (id) {
            for (var s = 0; s < lvl.buses[id].cap; s++) lvl.queue.push(lvl.buses[id].colour);
        });

        var sim = simulate(lvl, plan);
        if (!sim.ok || sim.peak < p.minPeak) return null;
        lvl.plan = plan;       // a known solution (removal order), kept for future hints
        lvl.peak = sim.peak;
        return lvl;
    }

    // A deliberately simple player: taps a free bus matching the next passenger if
    // there is one, otherwise any free bus. Its win rate is our difficulty gauge.
    function naiveWinRate(level, runs) {
        var wins = 0;
        for (var s = 1; s <= runs; s++) {
            var a = (Math.imul(level.number, 2654435761) + s * 40503) >>> 0 || 1;
            var r = function () { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
            var st = createState(level), ok = false;
            for (var guard = 0; guard < 400; guard++) {
                while (boardOne(st)) { /* board */ }
                if (isWon(st)) { ok = true; break; }
                if (isStuck(st)) break;
                var occ = occupancy(level, st.removed), free = [], match = [];
                var front = level.queue[st.q];
                for (var i = 0; i < level.buses.length; i++) {
                    if (!st.removed[i] && exitInfo(level, st.removed, i, occ).clear) {
                        free.push(i);
                        if (level.buses[i].colour === front) match.push(i);
                    }
                }
                var pool = match.length ? match : free;
                if (tap(st, pool[Math.floor(r() * pool.length)]).type !== 'exit') break;
            }
            if (ok) wins++;
        }
        return Math.round(100 * wins / runs);
    }

    function isTough(n) { return n >= 5 && n % 5 === 0; }
    // Target band for the naive player's win rate (%): lower = harder.
    function targetBand(n) {
        if (isTough(n)) return n <= 10 ? [5, 35] : [0, 25];
        if (n <= 2) return [80, 100];
        if (n <= 4) return [45, 90];
        if (n <= 9) return [30, 70];
        if (n <= 19) return [20, 60];
        if (n <= 40) return [10, 50];
        return [5, 40];
    }

    var NAIVE_RUNS = 12;
    function spareBays(n) { return isTough(n) ? 0 : n <= 2 ? 2 : 1; }
    // Shrink the bays to the solution's peak plus the spare allowance, then re-prove it.
    function fitBays(lvl, n) {
        lvl.bays = Math.max(2, Math.min(BASE_BAYS, lvl.peak + spareBays(n)));
        var sim = simulate(lvl, lvl.plan);
        if (!sim.ok) { lvl.bays = BASE_BAYS; } // cannot happen (same strategy, same peak), but never ship an unsolvable level
    }
    function generate(n) {
        n = Math.max(1, Math.floor(n) || 1);
        var p = params(n), band = targetBand(n);
        var best = null, bestGap = Infinity;
        for (var attempt = 0; attempt < 60; attempt++) {
            var lvl = tryGenerate(n, p, rng(Math.imul(n, 7919) + Math.imul(attempt, 104729) + 17));
            if (!lvl) continue;
            lvl.attempt = attempt;
            fitBays(lvl, n);
            lvl.naive = naiveWinRate(lvl, NAIVE_RUNS);
            var gap = lvl.naive < band[0] ? band[0] - lvl.naive : lvl.naive > band[1] ? lvl.naive - band[1] : 0;
            if (gap < bestGap) { best = lvl; bestGap = gap; }
            if (gap === 0) break;
        }
        if (!best) {
            // Fallback: an easier recipe (still verified by simulate)
            var easy = params(Math.max(1, Math.floor(n / 2)));
            for (var a2 = 0; a2 < 200 && !best; a2++) {
                best = tryGenerate(n, easy, rng(Math.imul(n, 31337) + a2));
                if (best) { best.attempt = 1000 + a2; fitBays(best, n); }
            }
        }
        if (!best) throw new Error('Could not generate level ' + n);
        best.tough = isTough(n);
        return best;
    }

    var api = {
        PALETTE: PALETTE, BASE_BAYS: BASE_BAYS, UNDO_PER_LEVEL: UNDO_PER_LEVEL,
        params: params, generate: generate, exitInfo: exitInfo, cellsOf: cellsOf,
        createState: createState, tap: tap, boardOne: boardOne, isWon: isWon, isStuck: isStuck,
        undo: undo, addBay: addBay, starsFor: starsFor, simulate: simulate,
        naiveWinRate: naiveWinRate, targetBand: targetBand, isTough: isTough, spareBays: spareBays
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DepotEngine = api;
})(typeof window !== 'undefined' ? window : this);
