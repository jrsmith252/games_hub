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

    // ---------- geometry: free-angle vehicles ----------
    // Units are depot "cells". A vehicle is a rectangle centred on (x, y) heading at angle a
    // (degrees; 0 = right, 90 = down). Angles are multiples of 15 and use a fixed trig table,
    // so the arithmetic is identical on every device.
    var TYPES = {
        car:   { len: 1.35, wid: 0.80, cap: 4,  name: 'car' },
        mini:  { len: 2.00, wid: 0.86, cap: 6,  name: 'minibus' },
        coach: { len: 2.85, wid: 0.92, cap: 10, name: 'coach' }
    };
    var COS15 = [1, 0.965925826289, 0.866025403784, 0.707106781187, 0.5, 0.258819045103, 0,
                 -0.258819045103, -0.5, -0.707106781187, -0.866025403784, -0.965925826289,
                 -1, -0.965925826289, -0.866025403784, -0.707106781187, -0.5, -0.258819045103, 0,
                 0.258819045103, 0.5, 0.707106781187, 0.866025403784, 0.965925826289];
    function cosD(a) { return COS15[(((a / 15) % 24) + 24) % 24]; }
    function sinD(a) { return cosD(a - 90); }
    function axesOf(v) { var c = cosD(v.a), s2 = sinD(v.a); return { hx: c, hy: s2, nx: -s2, ny: c }; }
    function rectPoly(v, back, front, hw) {
        var ax = axesOf(v);
        return [
            [v.x + ax.hx * front + ax.nx * hw, v.y + ax.hy * front + ax.ny * hw],
            [v.x + ax.hx * front - ax.nx * hw, v.y + ax.hy * front - ax.ny * hw],
            [v.x - ax.hx * back - ax.nx * hw, v.y - ax.hy * back - ax.ny * hw],
            [v.x - ax.hx * back + ax.nx * hw, v.y - ax.hy * back + ax.ny * hw]
        ];
    }
    function polyOf(v, pad) { pad = pad || 0; return rectPoly(v, v.len / 2 + pad, v.len / 2 + pad, v.wid / 2 + pad); }
    function sweptPoly(v, t) { return rectPoly(v, v.len / 2, v.len / 2 + t, v.wid / 2); }
    // Separating-axis test for two convex quads (touching does not count as overlapping)
    function intersects(A, B) {
        var polys = [A, B];
        for (var p = 0; p < 2; p++) {
            var P = polys[p];
            for (var i = 0; i < 4; i++) {
                var a = P[i], b = P[(i + 1) % 4];
                var nx = a[1] - b[1], ny = b[0] - a[0];
                var minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity, k, d;
                for (k = 0; k < 4; k++) { d = A[k][0] * nx + A[k][1] * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
                for (k = 0; k < 4; k++) { d = B[k][0] * nx + B[k][1] * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
                if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
            }
        }
        return true;
    }
    // How far v can drive forward before touching w (null if w is never in its way)
    function blockDist(level, v, w) {
        var D = level.cols + level.rows + 4;
        var wp = polyOf(w);
        if (!intersects(sweptPoly(v, D), wp)) return null;
        var lo = 0, hi = D;
        for (var it = 0; it < 24; it++) {
            var mid = (lo + hi) / 2;
            if (intersects(sweptPoly(v, mid), wp)) hi = mid; else lo = mid;
        }
        return hi;
    }
    // Distance from the front of v to the edge of the depot along its heading
    function edgeDist(level, v) {
        var ax = axesOf(v);
        var fx = v.x + ax.hx * v.len / 2, fy = v.y + ax.hy * v.len / 2, t = Infinity;
        if (ax.hx > 1e-9) t = Math.min(t, (level.cols - fx) / ax.hx);
        if (ax.hx < -1e-9) t = Math.min(t, -fx / ax.hx);
        if (ax.hy > 1e-9) t = Math.min(t, (level.rows - fy) / ax.hy);
        if (ax.hy < -1e-9) t = Math.min(t, -fy / ax.hy);
        return Math.max(0, t);
    }
    // Blocker lists: for each vehicle, every other vehicle in its path, nearest first.
    // Computed once per level, so checking a tap is just a walk down a short list.
    function addBlocks(level, k) {
        var B = level.block, vs = level.buses, list = [];
        for (var i = 0; i < vs.length; i++) {
            if (i === k) continue;
            var d = blockDist(level, vs[k], vs[i]);
            if (d !== null) list.push({ j: i, d: d });
            var d2 = blockDist(level, vs[i], vs[k]);
            if (d2 !== null) { B[i].push({ j: k, d: d2 }); B[i].sort(function (x, y) { return x.d - y.d; }); }
        }
        list.sort(function (x, y) { return x.d - y.d; });
        B[k] = list;
    }
    function dropBlocks(level, k) {
        level.block.length = k;
        for (var i = 0; i < k; i++) level.block[i] = level.block[i].filter(function (e) { return e.j !== k; });
    }
    function computeBlocks(level) {
        level.block = [];
        for (var k = 0; k < level.buses.length; k++) { level.block.push([]); addBlocks(level, k); }
    }
    function exitInfo(level, removed, i) {
        var L = level.block[i];
        for (var k = 0; k < L.length; k++) {
            if (!removed || !removed[L[k].j]) return { clear: false, dist: L[k].d, blocker: L[k].j };
        }
        return { clear: true, dist: edgeDist(level, level.buses[i]) };
    }
    // Removing a vehicle never puts anything new in another's way, so greedy removal finds a
    // full clearance whenever one exists.
    function fullyRemovable(level) {
        var removed = new Array(level.buses.length).fill(false);
        var left = level.buses.length, progress = true;
        while (left > 0 && progress) {
            progress = false;
            for (var i = 0; i < level.buses.length; i++) {
                if (!removed[i] && exitInfo(level, removed, i).clear) { removed[i] = true; left--; progress = true; }
            }
        }
        return left === 0;
    }
    function inDepot(level, v) {
        var m = 0.06;
        return polyOf(v).every(function (c) { return c[0] >= m && c[1] >= m && c[0] <= level.cols - m && c[1] <= level.rows - m; });
    }
    function fits(level, v) {
        if (!inDepot(level, v)) return false;
        var vp = polyOf(v, 0.05);
        for (var i = 0; i < level.buses.length; i++) if (intersects(vp, polyOf(level.buses[i], 0.05))) return false;
        return true;
    }

    // ---------- difficulty curve ----------
    // Depot shapes (height / width) the game can fit to the screen; same area, so same difficulty.
    var SHAPES = [1.0, 1.15, 1.3, 1.45];
    function shapeFor(ratio) {
        var best = SHAPES[0];
        SHAPES.forEach(function (sh) { if (Math.abs(sh - ratio) < Math.abs(best - ratio)) best = sh; });
        return best;
    }
    function params(n, shape) {
        // The depot keeps growing for the first ~25 levels (about 130 square units, ~40-50 vehicles)
        var baseCols = Math.min(10, 4 + Math.floor((n + 1) / 4));     // 4..10
        var baseRows = Math.min(13, 5 + Math.floor(n / 3));           // 5..13
        var area = baseCols * baseRows;
        var sh = shape || 1.3;
        var cols = Math.max(4, Math.round(Math.sqrt(area / sh) * 2) / 2);   // half-unit steps
        var rows = Math.max(5, Math.round(area / cols * 2) / 2);
        var colours = Math.min(6, 2 + Math.floor((n + 1) / 4));   // 2..6
        var maxBuses = Math.floor(cols * rows / 2.3);
        var buses = Math.max(3, Math.min(maxBuses, 3 + Math.floor(n * 1.15)));
        // How many buses the intended solution parks at once (bays are 5)
        var maxPark = n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : n <= 15 ? 4 : 5;
        // The solution must genuinely need this many bays at its busiest moment
        var minPeak = n <= 2 ? 1 : n <= 5 ? 2 : n <= 12 ? 3 : 4;
        var removeBias = Math.min(0.85, 0.4 + n * 0.03);
        // Vehicle mix: cars and minibuses first, coaches from level 6
        var mix = n <= 5 ? { car: 0.5, mini: 0.5, coach: 0 } : n <= 12 ? { car: 0.4, mini: 0.42, coach: 0.18 } : { car: 0.36, mini: 0.39, coach: 0.25 };
        // Angles: square to the depot at first, diagonals from level 3, any 15-degree angle from level 9
        var angles = n <= 2 ? 'square' : n <= 8 ? 'diagonal' : 'any';
        var minBlocked = n <= 2 ? 0 : 0.3;
        // Level type: "single" = strict single-file queue; "platform" = pick from a platform of waiting passengers
        var mode = (n <= 2 || n % 4 === 0) ? 'single' : 'platform';
        // Platform grows into a crowd; bigger levels mix passengers for more buses at once
        // Everyone on the platform (four rows) can board
        var platform = mode === 'single' ? 1 : n <= 8 ? 12 : n <= 16 ? 16 : 20;
        var mixGroup = n <= 16 ? 3 : 4;
        return { cols: cols, rows: rows, colours: colours, buses: buses, maxPark: maxPark, minPeak: minPeak,
                 mode: mode, platform: platform, mixGroup: mixGroup,
                 removeBias: removeBias, mix: mix, angles: angles, minBlocked: minBlocked, bays: BASE_BAYS };
    }

    // ---------- game state (shared by the UI and by level verification) ----------
    // The platform holds the passengers who can board right now (queue indices, left to right).
    // A single-file level is simply a platform with room for one.
    function createState(level) {
        var W = level.platform || 1, plat = [], q = 0;
        while (plat.length < W && q < level.queue.length) plat.push(q++);
        return {
            level: level,
            removed: new Array(level.buses.length).fill(false),
            bays: new Array(level.bays).fill(null),
            platform: plat, q: q, moves: 0,
            undoLeft: UNDO_PER_LEVEL, extraUsed: false, boostsUsed: 0,
            history: []
        };
    }
    function snapshot(st) {
        return {
            removed: st.removed.slice(),
            bays: st.bays.map(function (b) { return b ? { bus: b.bus, colour: b.colour, cap: b.cap, filled: b.filled } : null; }),
            platform: st.platform.slice(), q: st.q, moves: st.moves
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
    // Who boards next: the left-most platform passenger whose colour has a bus in the bays,
    // onto the left-most bus of that colour. Returns { slot, bay } or null.
    function peekStep(st) {
        var Q = st.level.queue;
        for (var s = 0; s < st.platform.length; s++) {
            var c = Q[st.platform[s]];
            for (var i = 0; i < st.bays.length; i++) {
                if (st.bays[i] && st.bays[i].colour === c) return { slot: s, bay: i };
            }
        }
        return null;
    }
    function peekBoard(st) { var p = peekStep(st); return p ? p.bay : -1; }
    function boardOne(st) {
        var p = peekStep(st);
        if (!p) return null;
        var Q = st.level.queue;
        var pid = st.platform[p.slot], c = Q[pid];
        var bay = st.bays[p.bay];
        bay.filled++;
        st.platform.splice(p.slot, 1);
        var added = null;
        if (st.q < Q.length) { added = st.q; st.platform.push(st.q++); }  // the next passenger steps up
        var departed = bay.filled >= bay.cap;
        if (departed) st.bays[p.bay] = null;
        return { bay: p.bay, colour: c, departed: departed, bus: bay.bus, filled: bay.filled, cap: bay.cap,
                 passenger: pid, slot: p.slot, added: added };
    }
    function isWon(st) { return st.platform.length === 0 && st.q >= st.level.queue.length; }
    function isStuck(st) {
        if (isWon(st) || st.bays.indexOf(null) !== -1) return false;
        return !peekStep(st);
    }
    function undo(st) {
        if (!st.history.length || st.undoLeft <= 0) return false;
        var s = st.history.pop();
        var n = st.bays.length;
        st.removed = s.removed; st.bays = s.bays; st.platform = s.platform; st.q = s.q; st.moves = s.moves;
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
        var lvl = { number: n, cols: p.cols, rows: p.rows, bays: p.bays, mode: p.mode, platform: p.platform, buses: [], queue: [], block: [] };
        function pickType() {
            var x = r();
            if (x < p.mix.car) return 'car';
            if (x < p.mix.car + p.mix.mini) return 'mini';
            return 'coach';
        }
        function pickAngle() {
            var x = r();
            if (p.angles === 'square' || (p.angles !== 'square' && x < 0.5)) return 90 * Math.floor(r() * 4);
            if (p.angles === 'diagonal' || x < 0.8) return 45 + 90 * Math.floor(r() * 4);
            return 15 * Math.floor(r() * 24);
        }
        function tryAdd(v) {
            if (!fits(lvl, v)) return false;
            lvl.buses.push(v); lvl.block.push([]);
            var k = lvl.buses.length - 1;
            addBlocks(lvl, k);
            if (!fullyRemovable(lvl)) { lvl.buses.pop(); dropBlocks(lvl, k); return false; }
            return true;
        }
        var tries = 0;
        while (lvl.buses.length < p.buses && tries < 3000) {
            tries++;
            var type = pickType(), T = TYPES[type], ang = pickAngle();
            var cx = 0.5 + r() * (p.cols - 1), cy = 0.5 + r() * (p.rows - 1);
            // Sometimes park a neat row of matching vehicles side by side, like a real depot
            var rowLen = r() < 0.35 ? 2 + Math.floor(r() * 3) : 1;
            var nx = -sinD(ang), ny = cosD(ang), gap = T.wid + 0.14;
            for (var q2 = 0; q2 < rowLen && lvl.buses.length < p.buses; q2++) {
                var v = { x: cx + nx * gap * q2, y: cy + ny * gap * q2, a: ang, type: type, len: T.len, wid: T.wid, cap: T.cap };
                if (!tryAdd(v) && q2 === 0) break;
            }
        }
        var N = lvl.buses.length;
        if (N < Math.max(3, Math.floor(p.buses * 0.7))) return null;

        // Require a real jam: some vehicles must start blocked
        var blocked = 0;
        for (var i = 0; i < N; i++) if (!exitInfo(lvl, null, i).clear) blocked++;
        if (blocked < Math.floor(N * p.minBlocked)) return null;

        // Colours: use every colour at least once, then random
        var k = Math.min(p.colours, N);
        shuffle(range(N), r).forEach(function (id, idx) {
            lvl.buses[id].colour = idx < k ? idx : Math.floor(r() * k);
        });

        // A valid removal order (random among currently-free buses)
        var removed = new Array(N).fill(false), plan = [];
        while (plan.length < N) {
            var cand = [];
            for (var j = 0; j < N; j++) if (!removed[j] && exitInfo(lvl, removed, j).clear) cand.push(j);
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
        if (p.mode === 'single') {
            service.forEach(function (id) {
                for (var s = 0; s < lvl.buses[id].cap; s++) lvl.queue.push(lvl.buses[id].colour);
            });
        } else {
            // Platform levels: passengers for the next few buses arrive mixed together in short runs,
            // so several colours are on the platform at once and the player chooses what to serve.
            for (var g = 0; g < service.length; g += p.mixGroup) {
                var pools = service.slice(g, g + p.mixGroup).map(function (id) { return { c: lvl.buses[id].colour, n: lvl.buses[id].cap }; });
                for (;;) {
                    var avail = pools.filter(function (x) { return x.n > 0; });
                    if (!avail.length) break;
                    var pk = avail[Math.floor(r() * avail.length)];
                    var run = Math.min(pk.n, 1 + Math.floor(r() * 3));
                    for (var t = 0; t < run; t++) lvl.queue.push(pk.c);
                    pk.n -= run;
                }
            }
        }

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
                 platform: st.platform.slice(), q: st.q, moves: st.moves, undoLeft: 0, extraUsed: true, boostsUsed: 0, history: [] };
    }
    function freeBuses(st) {
        var out = [];
        for (var i = 0; i < st.level.buses.length; i++) {
            if (!st.removed[i] && exitInfo(st.level, st.removed, i).clear) out.push(i);
        }
        return out;
    }
    // How soon a colour is wanted: 0 if someone of that colour is on the platform, else queue distance.
    function nextNeed(st, colour) {
        var Q = st.level.queue;
        for (var s = 0; s < st.platform.length; s++) if (Q[st.platform[s]] === colour) return 0;
        for (var i = st.q; i < Q.length; i++) if (Q[i] === colour) return 1 + i - st.q;
        return 1e9;
    }
    function platformHas(st, colour) {
        var Q = st.level.queue;
        for (var s = 0; s < st.platform.length; s++) if (Q[st.platform[s]] === colour) return true;
        return false;
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
                st.bays.map(function (b) { return b ? b.colour + ':' + b.cap + ':' + b.filled : '-'; }).join(',') + '|' + st.q + '|' +
                st.platform.map(function (pi) { return L.queue[pi]; }).join('');
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
                var free = [], match = [];
                for (var i = 0; i < level.buses.length; i++) {
                    if (!st.removed[i] && exitInfo(level, st.removed, i).clear) {
                        free.push(i);
                        if (platformHas(st, level.buses[i].colour)) match.push(i);
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
                var free = freeBuses(st);
                var pick = free.filter(function (i) { return platformHas(st, level.buses[i].colour); });
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
        // Platform levels offer more choice, so they get less slack (a breather every third level)
        if (params(n).mode === 'platform' && n > 6) return n % 3 === 1 ? 1 : 0;
        if (n <= 14) return 1;
        return n % 4 === 1 ? 1 : 0;
    }
    // Levels must need at least this many bays even when played perfectly (so parking matters).
    function minNeeded(n) {
        // With the whole platform boardable, lots of bays make levels easy: keep platform levels tighter
        if (params(n).mode === 'platform') return n <= 2 ? 1 : n <= 14 ? 2 : 3;
        return n <= 2 ? 1 : n <= 5 ? 2 : n <= 14 ? 3 : 4;
    }
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
    function generate(n, shape) {
        n = Math.max(1, Math.floor(n) || 1);
        var p = params(n, shape), band = targetBand(n);
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
            if (solverCalls >= 9) break;
            solverCalls++;
            if (!exactFit(lvl, n)) {
                // Solver ran out of budget: still valid (plan proven by simulate), but rank it below exact ones
                lvl.smart = smartWinRate(lvl, 16);
                var fb = smartBand(n), fgap = lvl.smart < fb[0] ? fb[0] - lvl.smart : lvl.smart > fb[1] ? lvl.smart - fb[1] : 0;
                if (200 + fgap < bestScore) { best = lvl; bestScore = 200 + fgap; }
                continue;
            }
            var short = Math.max(0, minNeeded(n) - lvl.minBays);
            var sb = smartBand(n);
            lvl.smart = smartWinRate(lvl, 16);
            var sgap = lvl.smart < sb[0] ? sb[0] - lvl.smart : lvl.smart > sb[1] ? lvl.smart - sb[1] : 0;
            var score = short * 25 + sgap;
            if (score < bestScore) { best = lvl; bestScore = score; }
            if (score === 0) break;
        }
        if (!best) {
            // Fallback: an easier recipe (still verified by simulate)
            var easy = params(Math.max(1, Math.floor(n / 2)), shape);
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
        params: params, generate: generate, shapeFor: shapeFor, SHAPES: SHAPES, exitInfo: exitInfo, polyOf: polyOf, intersects: intersects, inDepot: inDepot,
        TYPES: TYPES, cosD: cosD, sinD: sinD, computeBlocks: computeBlocks,
        createState: createState, tap: tap, boardOne: boardOne, peekBoard: peekBoard, peekStep: peekStep, isWon: isWon, isStuck: isStuck,
        undo: undo, addBay: addBay, starsFor: starsFor, simulate: simulate,
        naiveWinRate: naiveWinRate, targetBand: targetBand, isTough: isTough, spareBays: spareBays,
        minBays: minBays, solveWith: solveWith, smartWinRate: smartWinRate, smartBand: smartBand
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DepotEngine = api;
})(typeof window !== 'undefined' ? window : this);
