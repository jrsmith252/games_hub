/* Depot Dash game engine: level generation and rules. No DOM access, so the
   same code runs in the browser and in the Node test suite. */
(function (root) {
    'use strict';

    var PALETTE = [
        { name: 'Red',    hex: '#ef4444', sym: '●', ink: '#ffffff' },
        { name: 'Blue',   hex: '#3b82f6', sym: '♥', ink: '#ffffff' },
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
    // Which bay the next passenger would board (-1 if none): the left-most bus of their colour.
    function peekBoard(st) {
        var Q = st.level.queue;
        if (st.q >= Q.length) return -1;
        var c = Q[st.q];
        for (var i = 0; i < st.bays.length; i++) {
            if (st.bays[i] && st.bays[i].colour === c) return i;
        }
        return -1;
    }
    function boardOne(st) {
        var bi = peekBoard(st);
        if (bi === -1) return null;
        var c = st.level.queue[st.q];
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

    // ---------- exact solver ----------
    function cloneState(st) {
        return { level: st.level, removed: st.removed.slice(),
                 bays: st.bays.map(function (b) { return b ? { bus: b.bus, colour: b.colour, cap: b.cap, filled: b.filled } : null; }),
                 q: st.q, moves: st.moves, undoLeft: 0, extraUsed: true, boostsUsed: 0, history: [] };
    }
    function freeBuses(st) {
        var occ = occupancy(st.level, st.removed), out = [];
        for (var i = 0; i < st.level.buses.length; i++) {
            if (!st.removed[i] && exitInfo(st.level, st.removed, i, occ).clear) out.push(i);
        }
        return out;
    }
    function nextNeed(st, colour) {
        var Q = st.level.queue;
        for (var i = st.q; i < Q.length; i++) if (Q[i] === colour) return i - st.q;
        return 1e9;
    }
    // Find a winning tap sequence with K bays (depth-first, memo of dead states, node cap).
    // Returns { ok: true, taps } / { ok: false } / { ok: null } when the cap is hit.
    function solveWith(level, K, cap) {
        var L = {}; for (var k in level) L[k] = level[k];
        L.bays = K;
        var failed = {}, nodes = 0, path = [];
        function dfs(st) {
            while (boardOne(st)) { /* board */ }
            if (isWon(st)) return true;
            if (isStuck(st) || st.bays.indexOf(null) === -1) return false;
            if (++nodes > cap) throw new Error('cap');
            var key = st.removed.map(function (r) { return r ? 1 : 0; }).join('') + '|' +
                st.bays.map(function (b) { return b ? b.colour + ':' + b.cap + ':' + b.filled : '-'; }).join(',') + '|' + st.q;
            if (failed[key]) return false;
            var moves = freeBuses(st).sort(function (a, b) {
                return nextNeed(st, L.buses[a].colour) - nextNeed(st, L.buses[b].colour) || a - b;
            });
            for (var m = 0; m < moves.length; m++) {
                var s2 = cloneState(st);
                tap(s2, moves[m]);
                path.push(moves[m]);
                if (dfs(s2)) return true;
                path.pop();
            }
            failed[key] = true;
            return false;
        }
        try { return dfs(createState(L)) ? { ok: true, taps: path.slice(), nodes: nodes } : { ok: false, nodes: nodes }; }
        catch (e) { return { ok: null, nodes: nodes }; }
    }
    // Fewest bays the level can be solved with (null if the search was too big to finish).
    var SOLVER_CAP = 25000;
    function minBays(level) {
        for (var K = 1; K <= BASE_BAYS; K++) {
            var r = solveWith(level, K, SOLVER_CAP);
            if (r.ok === true) return { K: K, taps: r.taps };
            if (r.ok === null) return null;
        }
        return null;
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

    // A human-like player: boards the next passenger if a free bus matches; otherwise goes for the
    // bus whose colour is needed soonest, clearing whatever blocks it. Random tie-breaks.
    function smartWinRate(level, runs) {
        var wins = 0;
        for (var s = 1; s <= runs; s++) {
            var a = (Math.imul(level.number, 40503) + s * 2654435761) >>> 0 || 1;
            var r = function () { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
            var st = createState(level), ok = false;
            for (var g = 0; g < 500; g++) {
                while (boardOne(st)) { /* board */ }
                if (isWon(st)) { ok = true; break; }
                if (isStuck(st)) break;
                var free = freeBuses(st), front = level.queue[st.q];
                var pick = free.filter(function (i) { return level.buses[i].colour === front; });
                if (!pick.length) {
                    var rem = [];
                    for (var i = 0; i < level.buses.length; i++) if (!st.removed[i]) rem.push({ i: i, need: nextNeed(st, level.buses[i].colour), t: r() });
                    rem.sort(function (x, y) { return x.need - y.need || x.t - y.t; });
                    var target = rem[0].i, guard = 0;
                    while (free.indexOf(target) === -1 && guard++ < 30) target = exitInfo(level, st.removed, target).blocker;
                    pick = free.indexOf(target) !== -1 ? [target] : free;
                }
                if (tap(st, pick[Math.floor(r() * pick.length)]).type !== 'exit') break;
            }
            if (ok) wins++;
        }
        return Math.round(100 * wins / runs);
    }
    // Target win rate (%) for the human-like player at the level's actual bays: lower = harder.
    function smartBand(n) {
        if (isTough(n)) return n <= 10 ? [10, 55] : [0, 30];
        if (n <= 2) return [80, 100];
        if (n <= 4) return [50, 100];
        if (n <= 9) return [35, 85];
        if (n <= 19) return [20, 60];
        if (n <= 40) return [10, 50];
        return [5, 45];
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
    // Spare bays on top of the exact minimum: generous while learning, none once you know the game.
    function spareBays(n) {
        if (n <= 2) return 2;
        if (isTough(n)) return 0;
        if (n <= 8) return 1;
        if (n <= 14) return n % 2 ? 0 : 1;
        return n % 4 === 1 ? 1 : 0;
    }
    // Levels must need at least this many bays even when played perfectly (so parking matters).
    function minNeeded(n) { return n <= 2 ? 1 : n <= 9 ? 2 : 3; }
    // Coarse fit from the generator's own plan (always valid); refined later by the exact solver.
    function fitBays(lvl, n) {
        lvl.bays = Math.max(2, Math.min(BASE_BAYS, lvl.peak + spareBays(n)));
        if (!simulate(lvl, lvl.plan).ok) lvl.bays = BASE_BAYS;
    }
    // Exact fit: bays = true minimum + spare. The solver's tap sequence proves it is solvable.
    function exactFit(lvl, n) {
        var m = minBays(lvl);
        if (!m) return false;
        lvl.minBays = m.K;
        lvl.solution = m.taps;
        lvl.bays = Math.max(2, Math.min(BASE_BAYS, m.K + spareBays(n)));
        return true;
    }
    function generate(n) {
        n = Math.max(1, Math.floor(n) || 1);
        var p = params(n), band = targetBand(n);
        var best = null, bestScore = Infinity, solverCalls = 0;
        for (var attempt = 0; attempt < 60; attempt++) {
            var lvl = tryGenerate(n, p, rng(Math.imul(n, 7919) + Math.imul(attempt, 104729) + 17));
            if (!lvl) continue;
            lvl.attempt = attempt;
            fitBays(lvl, n);
            lvl.naive = naiveWinRate(lvl, NAIVE_RUNS);
            var gap = lvl.naive < band[0] ? band[0] - lvl.naive : lvl.naive > band[1] ? lvl.naive - band[1] : 0;
            if (gap > 0 && solverCalls === 0 && attempt < 40) { if (gap < bestScore) { best = lvl; bestScore = gap + 1000; } continue; }
            // Candidate is in band (or we're running out of attempts): measure it exactly
            if (solverCalls >= 7) break;
            solverCalls++;
            if (!exactFit(lvl, n)) { if (bestScore > 500) { best = lvl; bestScore = 500; } continue; }
            var short = Math.max(0, minNeeded(n) - lvl.minBays);
            var sb = smartBand(n);
            lvl.smart = smartWinRate(lvl, 16);
            var sgap = lvl.smart < sb[0] ? sb[0] - lvl.smart : lvl.smart > sb[1] ? lvl.smart - sb[1] : 0;
            var score = short * 100 + sgap;
            if (score < bestScore) { best = lvl; bestScore = score; }
            if (score === 0) break;
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
        createState: createState, tap: tap, boardOne: boardOne, peekBoard: peekBoard, isWon: isWon, isStuck: isStuck,
        undo: undo, addBay: addBay, starsFor: starsFor, simulate: simulate,
        naiveWinRate: naiveWinRate, targetBand: targetBand, isTough: isTough, spareBays: spareBays,
        minBays: minBays, solveWith: solveWith, smartWinRate: smartWinRate, smartBand: smartBand
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DepotEngine = api;
})(typeof window !== 'undefined' ? window : this);
