/* Way Out: puzzle generator and solver.
   Coloured blocks sit on a walled board. Drag a block through free squares; it leaves the board
   through a door of its own colour, as long as the whole block fits through the door.
   Some blocks only move across (h) or only up and down (v).

   Levels are built backwards: each block "enters" through its door and is moved to a spot, so
   undoing that is always possible, and every level is solvable. A search then finds the fewest
   moves it needs, which sets the 3-star target (always achievable).
   Works in the browser (window.WayOutEngine) and in Node (module.exports). */
(function (root) {
    'use strict';

    function rng(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    // Shapes as [row, col] offsets
    var SHAPES = {
        dot: [[0, 0]],
        bar2h: [[0, 0], [0, 1]], bar2v: [[0, 0], [1, 0]],
        bar3h: [[0, 0], [0, 1], [0, 2]], bar3v: [[0, 0], [1, 0], [2, 0]],
        sq: [[0, 0], [0, 1], [1, 0], [1, 1]],
        L3a: [[0, 0], [1, 0], [1, 1]], L3b: [[0, 0], [0, 1], [1, 0]], L3c: [[0, 0], [0, 1], [1, 1]], L3d: [[0, 1], [1, 0], [1, 1]],
        L4a: [[0, 0], [1, 0], [2, 0], [2, 1]], L4b: [[0, 0], [0, 1], [0, 2], [1, 0]], L4c: [[0, 0], [0, 1], [1, 1], [2, 1]], L4d: [[0, 2], [1, 0], [1, 1], [1, 2]],
        T4: [[0, 0], [0, 1], [0, 2], [1, 1]]
    };
    var EASY = ['dot', 'bar2h', 'bar2v', 'bar2h', 'bar2v', 'sq', 'L3a', 'L3b'];
    var ALL = Object.keys(SHAPES);

    // ---------- level plan ----------
    function plan(n) {
        var tough = n >= 10 && n % 5 === 0;
        var p;
        if (n <= 1) p = { R: 5, C: 5, blocks: 3, colours: 2, shapes: EASY, axis: 0, stones: 0, extra: 0 };
        else if (n <= 3) p = { R: 6, C: 5, blocks: 4 + (n - 2), colours: 3, shapes: EASY, axis: 0, stones: 0, extra: 0 };
        else if (n <= 6) p = { R: 6, C: 6, blocks: 6, colours: 3, shapes: EASY, axis: 0, stones: 0, extra: n >= 5 ? 1 : 0 };
        else if (n <= 12) p = { R: 7, C: 6, blocks: 7 + (n % 2), colours: 4, shapes: ALL, axis: 0, stones: n >= 9 ? 1 : 0, extra: 1 };
        else if (n <= 25) p = { R: 8, C: 6, blocks: 9, colours: 4 + (n % 2), shapes: ALL, axis: n >= 15 ? 0.25 : 0, stones: 1, extra: 1 };
        else p = { R: 8, C: 7, blocks: 10 + (n % 3), colours: 5 + (n % 2), shapes: ALL, axis: 0.3, stones: 1 + (n % 2), extra: 1 };
        if (tough) p.extra = 2;
        p.tough = tough;
        return p;
    }
    function isTough(n) { return plan(n).tough; }

    // ---------- geometry ----------
    // level: { R, C, stones:[idx], doors:[{side,start,len,col}], blocks:[{id,col,shape,axis,r,c}] }
    function cellsAt(b, r, c) { var s = SHAPES[b.shape], out = []; for (var i = 0; i < s.length; i++) out.push([r + s[i][0], c + s[i][1]]); return out; }
    function extent(shape) { var s = SHAPES[shape], h = 0, w = 0; s.forEach(function (p) { h = Math.max(h, p[0] + 1); w = Math.max(w, p[1] + 1); }); return { h: h, w: w }; }
    function makeOcc(L, blocks) {
        var occ = []; for (var i = 0; i < L.R * L.C; i++) occ.push(-1);
        L.stones.forEach(function (s) { occ[s] = -2; });
        blocks.forEach(function (b) { if (b.out) return; cellsAt(b, b.r, b.c).forEach(function (p) { occ[p[0] * L.C + p[1]] = b.id; }); });
        return occ;
    }
    function fits(L, occ, b, r, c) {
        var cs = cellsAt(b, r, c);
        for (var i = 0; i < cs.length; i++) {
            var y = cs[i][0], x = cs[i][1];
            if (y < 0 || x < 0 || y >= L.R || x >= L.C) return false;
            var o = occ[y * L.C + x];
            if (o !== -1 && o !== b.id) return false;
        }
        return true;
    }
    var DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    var SIDE_DIR = { top: 'up', bottom: 'down', left: 'left', right: 'right' };
    function axisAllows(b, dir) { return !b.axis || (b.axis === 'h' ? (dir === 'left' || dir === 'right') : (dir === 'up' || dir === 'down')); }
    // Can block b at (r,c) slide straight out through door d?
    function canExitVia(L, occ, b, r, c, d) {
        if (d.col !== b.col) return false;
        var dir = SIDE_DIR[d.side];
        if (!axisAllows(b, dir)) return false;
        var dv = DIRS[dir], e = extent(b.shape), steps = (dir === 'up' || dir === 'down') ? L.R + e.h : L.C + e.w;
        for (var k = 1; k <= steps; k++) {
            var cs = cellsAt(b, r + dv[0] * k, c + dv[1] * k), allOut = true;
            for (var i = 0; i < cs.length; i++) {
                var y = cs[i][0], x = cs[i][1];
                var inside = y >= 0 && x >= 0 && y < L.R && x < L.C;
                if (inside) { allOut = false; var o = occ[y * L.C + x]; if (o !== -1 && o !== b.id) return false; continue; }
                // Outside the board: only allowed through the door's opening
                var along = (d.side === 'top' || d.side === 'bottom') ? x : y;
                var past = d.side === 'top' ? y < 0 : d.side === 'bottom' ? y >= L.R : d.side === 'left' ? x < 0 : x >= L.C;
                if (!past || along < d.start || along >= d.start + d.len) return false;
            }
            if (allOut) return true;
        }
        return false;
    }
    function exitDoor(L, occ, b, r, c) {
        for (var i = 0; i < L.doors.length; i++) if (canExitVia(L, occ, b, r, c, L.doors[i])) return i;
        return -1;
    }
    // Every spot block b can be dragged to (one square at a time), and whether it can leave from any of them
    function reach(L, occ, b) {
        var seen = {}, list = [], q = [[b.r, b.c]], exitFrom = null;
        seen[b.r + ',' + b.c] = 1;
        while (q.length) {
            var p = q.shift();
            list.push(p);
            if (exitFrom === null && exitDoor(L, occ, b, p[0], p[1]) >= 0) exitFrom = p;
            for (var dn in DIRS) {
                if (!axisAllows(b, dn)) continue;
                var nr = p[0] + DIRS[dn][0], nc = p[1] + DIRS[dn][1], key = nr + ',' + nc;
                if (seen[key] || !fits(L, occ, b, nr, nc)) continue;
                seen[key] = 1; q.push([nr, nc]);
            }
        }
        return { spots: list, exitFrom: exitFrom };
    }

    // ---------- solving ----------
    function cloneBlocks(bs) { return bs.map(function (b) { return { id: b.id, col: b.col, shape: b.shape, axis: b.axis, r: b.r, c: b.c, out: b.out }; }); }
    // Take out every block that can leave (leaving early never hurts: it only frees space)
    function greedy(L, blocks, log) {
        var moved = true;
        while (moved) {
            moved = false;
            var occ = makeOcc(L, blocks);
            for (var i = 0; i < blocks.length; i++) {
                var b = blocks[i]; if (b.out) continue;
                var rc = reach(L, occ, b);
                if (rc.exitFrom) { if (log) log.push({ id: b.id, exit: true, r: rc.exitFrom[0], c: rc.exitFrom[1] }); b.out = true; moved = true; break; }
            }
        }
        return blocks.every(function (b) { return b.out; });
    }
    // Fewest "repositioning" moves needed (0..maxExtra), with the plan, or null. Every exit costs one move too.
    function solve(L, blocks, maxExtra, budget) {
        var nodes = 0, best = null;
        budget = budget || 4000;
        function rec(bs, d, path) {
            if (best || nodes > budget) return;
            nodes++;
            var bs2 = cloneBlocks(bs), log = [];
            if (greedy(L, bs2, log)) { best = path.concat(log); return; }
            if (d === 0) return;
            var occ = makeOcc(L, bs2);
            for (var i = 0; i < bs2.length && !best; i++) {
                var b = bs2[i]; if (b.out) continue;
                var spots = reach(L, occ, b).spots;
                for (var s = 1; s < spots.length && !best; s++) {
                    var nb = cloneBlocks(bs2); nb[i].r = spots[s][0]; nb[i].c = spots[s][1];
                    rec(nb, d - 1, path.concat(log, [{ id: b.id, exit: false, r: spots[s][0], c: spots[s][1] }]));
                }
            }
        }
        for (var d = 0; d <= maxExtra && !best && nodes <= budget; d++) rec(blocks, d, []);
        if (!best) return null;
        return { extra: best.filter(function (m) { return !m.exit; }).length, moves: best };
    }

    // ---------- generate (backwards) ----------
    var COLOURS = 8;
    function buildDoors(R, C, k, r) {
        // Pick k non-overlapping openings around the walls
        var slots = [];
        ['top', 'bottom', 'left', 'right'].forEach(function (side) {
            var len = (side === 'top' || side === 'bottom') ? C : R;
            for (var s = 0; s < len; s++) slots.push({ side: side, at: s, len: len });
        });
        var used = {}, doors = [], tries = 0, cols = shuffle([0, 1, 2, 3, 4, 5, 6, 7], r).slice(0, k);
        while (doors.length < k && tries++ < 400) {
            var sl = slots[Math.floor(r() * slots.length)];
            var dl = 1 + Math.floor(r() * 3); // 1-3 wide
            if (sl.at + dl > sl.len) continue;
            var ok = true;
            for (var x = sl.at - 1; x <= sl.at + dl; x++) if (used[sl.side + x]) ok = false;   // keep a gap between doors
            if (!ok) continue;
            for (x = sl.at; x < sl.at + dl; x++) used[sl.side + x] = 1;
            doors.push({ side: sl.side, start: sl.at, len: dl, col: cols[doors.length] });
        }
        return doors.length === k ? doors : null;
    }
    // Shapes that can pass through a door at all
    function shapeFitsDoor(shape, d, axis) {
        var e = extent(shape), dir = SIDE_DIR[d.side];
        if (axis && !axisAllows({ axis: axis }, dir)) return false;
        return (d.side === 'top' || d.side === 'bottom') ? e.w <= d.len : e.h <= d.len;
    }
    function generateOnce(n, P, r) {
        var R = P.R, C = P.C;
        var doors = buildDoors(R, C, P.colours, r); if (!doors) return null;
        var L = { R: R, C: C, stones: [], doors: doors, blocks: [] };
        for (var s = 0; s < P.stones; s++) L.stones.push(1 * C + 1 + Math.floor(r() * (C - 2)) + Math.floor(r() * (R - 2)) * C);
        L.stones = L.stones.filter(function (v, i, a) { return a.indexOf(v) === i; });
        var placed = [], placedOrder = [];
        for (var bi = 0; bi < P.blocks * 3 && placed.length < P.blocks; bi++) {
            var d = doors[Math.floor(r() * doors.length)];
            var axis = r() < P.axis ? (d.side === 'top' || d.side === 'bottom' ? 'v' : 'h') : null;
            var shapes = P.shapes.filter(function (sh) { return shapeFitsDoor(sh, d, axis); });
            if (!shapes.length) continue;
            var b = { id: placed.length, col: d.col, shape: shapes[Math.floor(r() * shapes.length)], axis: axis, r: 0, c: 0 };
            var occ = makeOcc(L, placed);
            // Spots where it could have come in through its door, then everywhere reachable from there
            var entries = [];
            for (var y = 0; y < R; y++) for (var x = 0; x < C; x++) if (fits(L, occ, b, y, x) && canExitVia(L, occ, b, y, x, d)) entries.push([y, x]);
            if (!entries.length) continue;
            var e0 = entries[Math.floor(r() * entries.length)];
            b.r = e0[0]; b.c = e0[1];
            var spots = reach(L, occ, b).spots;
            // Prefer spots well away from the door, so blocks end up in each other's way
            spots.sort(function (a, c2) { return dist(c2, d, R, C) - dist(a, d, R, C); });
            var pick = spots[Math.floor(Math.pow(r(), 2) * Math.min(spots.length, 12))];
            b.r = pick[0]; b.c = pick[1];
            placed.push(b); placedOrder.push(b.id);
            // Sometimes push an earlier block into the newcomer's way out. Played forwards, that block
            // then has to be moved aside first: the "shuffle" moves that make later levels tricky.
            if (P.extra > 0 && placed.length >= 3 && r() < 0.55) blockExit(L, placed, b, r);
        }
        if (placed.length < P.blocks) return null;
        L.blocks = placed;
        return L;
    }
    function blockExit(L, placed, y, r) {
        var others = shuffle(placed.filter(function (x) { return x !== y; }), r);
        for (var i = 0; i < others.length; i++) {
            var x = others[i], occ = makeOcc(L, placed);
            var spots = shuffle(reach(L, occ, x).spots.slice(1), r);
            for (var k = 0; k < spots.length; k++) {
                var or = x.r, oc = x.c;
                x.r = spots[k][0]; x.c = spots[k][1];
                var occ2 = makeOcc(L, placed);
                if (!reach(L, occ2, y).exitFrom) return true;
                x.r = or; x.c = oc;
            }
        }
        return false;
    }
    function dist(p, d, R, C) {
        return d.side === 'top' ? p[0] : d.side === 'bottom' ? R - p[0] : d.side === 'left' ? p[1] : C - p[1];
    }

    var cache = {};
    function generate(n) {
        if (cache[n]) return cache[n];
        var P = plan(n), r = rng(n * 92821 + 7), best = null, bestScore = -1;
        for (var attempt = 0; attempt < 80; attempt++) {
            var L = generateOnce(n, P, r);
            if (!L) continue;
            // Fewest repositioning moves (searching up to the target + 1 more)
            var sol = solve(L, L.blocks, Math.max(P.extra, 1) + 1, 5000);
            if (!sol) continue;   // too tangled to prove a par; try another
            var score = sol.extra >= P.extra ? 100 - Math.abs(sol.extra - P.extra) : sol.extra;
            if (score > bestScore) { best = L; bestScore = score; best.par = L.blocks.length + sol.extra; best.extra = sol.extra; best.plan = sol.moves; }
            if (sol.extra === P.extra) break;
        }
        if (!best) throw new Error('Way Out: no level ' + n);
        best.number = n; best.tough = P.tough;
        cache[n] = best;
        return best;
    }

    // Next move from a position, or null if no plan is found within reach
    function hint(L, blocks) {
        var sol = solve(L, blocks, 3, 6000);
        if (!sol || !sol.moves.length) return null;
        return sol.moves[0];
    }

    var api = { generate: generate, plan: plan, isTough: isTough, SHAPES: SHAPES, cellsAt: cellsAt, extent: extent, makeOcc: makeOcc, fits: fits,
                canExitVia: canExitVia, exitDoor: exitDoor, reach: reach, solve: solve, hint: hint, cloneBlocks: cloneBlocks, axisAllows: axisAllows, DIRS: DIRS, SIDE_DIR: SIDE_DIR };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WayOutEngine = api;
})(this);
