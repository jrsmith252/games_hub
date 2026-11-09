/* Way Out: puzzle generator and solver.
   Coloured blocks and grey crates sit on a walled board. Every piece slides along its length only.
   A coloured block leaves through the door of its colour (the whole block must fit through the
   opening). Crates never leave: you shuffle them to make space. Clear every coloured block.

   Levels are made the way hard Rush Hour puzzles are: pack a board, map every position reachable
   from it, work out each one's exact distance from solved, and start the player at a position with
   the wanted number of moves. So the 3-star target is the true minimum, and every level is solvable.
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

    var SHAPES = {
        bar2h: [[0, 0], [0, 1]], bar2v: [[0, 0], [1, 0]],
        bar3h: [[0, 0], [0, 1], [0, 2]], bar3v: [[0, 0], [1, 0], [2, 0]]
    };

    // ---------- level plan ----------
    function isTough(n) { return n >= 10 && n % 5 === 0; }
    // want: space-making moves needed (moves beyond one per coloured block)
    function plan(n) {
        var p;
        if (n === 1) p = { colours: 1, per: 1, fill: 0.45, want: 0 };
        else if (n === 2) p = { colours: 2, per: 1, fill: 0.55, want: 1 };
        else if (n <= 4) p = { colours: 2, per: 1, fill: 0.62, want: n - 1 };
        else if (n <= 9) p = { colours: 2, per: 1, fill: 0.7, want: 3 + Math.floor((n - 5) / 2) };     // 3..5
        else if (n <= 19) p = { colours: 2 + (n % 2), per: 1, fill: 0.75, want: 5 + Math.floor((n - 10) / 2) };   // 5..9
        else if (n <= 39) p = { colours: 2 + (n % 2), per: 1, fill: 0.78, want: 9 + Math.floor((n - 20) / 4) };   // 9..13
        else p = { colours: 2 + (n % 3 === 0 ? 1 : 0), per: 1, fill: 0.78, want: 12 + (n % 5) };
        if (isTough(n)) p.want += n < 20 ? 3 : 5;
        p.R = 6; p.C = 6; p.tough = isTough(n);
        return p;
    }

    // ---------- geometry ----------
    // level: { R, C, stones:[idx], doors:[{side,start,len,col}], blocks:[{id,col,shape,axis,r,c}] }  (col -1 = crate)
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
        if (b.col < 0 || d.col !== b.col) return false;   // crates (col -1) never leave
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

    function cloneBlocks(bs) { return bs.map(function (b) { return { id: b.id, col: b.col, shape: b.shape, axis: b.axis, r: b.r, c: b.c, out: b.out }; }); }
    function cleared(bs) { return bs.every(function (b) { return b.out || b.col < 0; }); }

    // ---------- building ----------
    function pack(seed, P) {
        var r = rng(seed), R = P.R, C = P.C, L = { R: R, C: C, stones: [], doors: [], blocks: [] };
        var sides = ['top', 'right', 'bottom', 'left'], first = Math.floor(r() * 4);
        for (var k = 0; k < P.colours; k++) {
            var side = sides[(first + k * (P.colours === 2 ? 2 : 1)) % 4], len = (side === 'top' || side === 'bottom') ? C : R;
            L.doors.push({ side: side, start: 1 + Math.floor(r() * (len - 3)), len: 2, col: k });
        }
        // coloured blocks: two-long, lined up with their door
        L.doors.forEach(function (d) {
            for (var j = 0; j < P.per; j++) {
                var vert = d.side === 'top' || d.side === 'bottom';
                for (var t = 0; t < 60; t++) {
                    var b = { id: L.blocks.length, col: d.col, shape: vert ? 'bar2v' : 'bar2h', axis: vert ? 'v' : 'h', r: 0, c: 0 };
                    var y = vert ? Math.floor(r() * (R - 1)) : d.start + Math.floor(r() * d.len);
                    var x = vert ? d.start + Math.floor(r() * d.len) : Math.floor(r() * (C - 1));
                    if (!fits(L, makeOcc(L, L.blocks), b, y, x)) continue;
                    b.r = y; b.c = x; L.blocks.push(b); break;
                }
            }
        });
        // crates: one-way bars packed around them
        var covered = L.blocks.length * 2;
        for (var t2 = 0; t2 < 800 && covered < P.fill * R * C; t2++) {
            var h = r() < 0.5, shape = (r() < 0.35 ? 'bar3' : 'bar2') + (h ? 'h' : 'v');
            var cb = { id: L.blocks.length, col: -1, shape: shape, axis: h ? 'h' : 'v', r: Math.floor(r() * R), c: Math.floor(r() * C) };
            if (!fits(L, makeOcc(L, L.blocks), cb, cb.r, cb.c)) continue;
            L.blocks.push(cb); covered += SHAPES[shape].length;
        }
        return L;
    }
    function key(bs) { var s = ''; for (var i = 0; i < bs.length; i++) s += (bs[i].out ? 'x' : bs[i].r * 8 + bs[i].c) + ','; return s; }
    // Every position reachable from the packed board, with each one's exact distance from solved
    function mapPositions(L, cap) {
        var ids = {}, states = [], edges = [], count = 0;
        function add(bs) { var k = key(bs); if (ids[k] !== undefined) return ids[k]; ids[k] = states.length; states.push(bs); edges.push([]); return states.length - 1; }
        add(cloneBlocks(L.blocks));
        for (var h = 0; h < states.length; h++) {
            if (states.length > cap) return null;
            var bs = states[h], occ = makeOcc(L, bs);
            for (var i = 0; i < bs.length; i++) {
                var b = bs[i]; if (b.out) continue;
                var rc = reach(L, occ, b);
                for (var s = 1; s < rc.spots.length; s++) {
                    var nb = cloneBlocks(bs); nb[i].r = rc.spots[s][0]; nb[i].c = rc.spots[s][1];
                    edges[h].push([add(nb), { id: i, exit: false, r: rc.spots[s][0], c: rc.spots[s][1] }]);
                }
                if (b.col >= 0 && rc.exitFrom) {
                    var ob = cloneBlocks(bs); ob[i].out = true;
                    edges[h].push([add(ob), { id: i, exit: true, r: rc.exitFrom[0], c: rc.exitFrom[1] }]);
                }
            }
        }
        var rev = states.map(function () { return []; });
        edges.forEach(function (es, a) { es.forEach(function (e) { rev[e[0]].push(a); }); });
        var dist = states.map(function () { return -1; }), q = [];
        states.forEach(function (bs, i) { if (cleared(bs)) { dist[i] = 0; q.push(i); } });
        for (var qi = 0; qi < q.length; qi++) rev[q[qi]].forEach(function (a) { if (dist[a] < 0) { dist[a] = dist[q[qi]] + 1; q.push(a); } });
        void count;
        return { states: states, edges: edges, dist: dist };
    }
    function pathFrom(m, i) {
        var path = [], cur = i;
        while (m.dist[cur] > 0) {
            var e = m.edges[cur].filter(function (x) { return m.dist[x[0]] === m.dist[cur] - 1; })[0];
            path.push(e[1]); cur = e[0];
        }
        return path;
    }

    var cache = {};
    // tries: boards to pack (the shipped levels used more); cap: positions mapped per board
    function generate(n, tries, cap) {
        if (cache[n] && !tries) return cache[n];
        var P = plan(n), coloured = P.colours * P.per, best = null, bestGap = 1e9;
        tries = tries || 40; cap = cap || 60000;
        // keep going past the usual number of tries if nothing usable has turned up yet
        for (var t = 0; t < tries || (!best && t < tries * 6); t++) {
            var L = pack(n * 7919 + t * 104729 + 1, P);
            if (L.blocks.filter(function (b) { return b.col >= 0; }).length < coloured) continue;
            var m = mapPositions(L, cap);
            if (!m) continue;
            // Pick a starting position (all coloured blocks still in, none able to leave straight away
            // when we want a challenge) whose minimum is as close as possible to the plan
            var target = coloured + P.want, pick = -1, gap = 1e9;
            for (var i = 0; i < m.states.length; i++) {
                var bs = m.states[i];
                if (m.dist[i] < 0 || bs.some(function (b) { return b.out; })) continue;
                var g = Math.abs(m.dist[i] - target) * (m.dist[i] < target ? 2 : 1);
                if (g < gap || (g === gap && i < pick)) { gap = g; pick = i; }
            }
            if (pick < 0) continue;
            if (gap < bestGap) {
                bestGap = gap;
                var start = m.states[pick];
                best = { number: n, tough: P.tough, R: L.R, C: L.C, stones: [], doors: L.doors,
                         blocks: start.map(function (b) { return { id: b.id, col: b.col, shape: b.shape, axis: b.axis, r: b.r, c: b.c }; }),
                         plan: pathFrom(m, pick), par: m.dist[pick], extra: m.dist[pick] - coloured };
            }
            if (bestGap === 0) break;
        }
        if (!best) throw new Error('Way Out: no level ' + n);
        cache[n] = best;
        return best;
    }

    // Levels past the shipped ones: an earlier board turned a quarter (and later mirrored), so it plays fresh
    function variant(base, n) {
        var turns = (Math.floor((n - 1) / 150) % 4) || 1, mirror = Math.floor((n - 1) / 600) % 2 === 1;
        var N = base.R;   // square boards
        function rot(r, c) { var y = r, x = c; for (var t = 0; t < turns; t++) { var ny = x, nx = N - 1 - y; y = ny; x = nx; } if (mirror) x = N - 1 - x; return [y, x]; }
        function moveBlock(b, r, c) {
            var cs = cellsAt(b, r, c).map(function (p) { return rot(p[0], p[1]); });
            var minR = Math.min.apply(null, cs.map(function (p) { return p[0]; })), minC = Math.min.apply(null, cs.map(function (p) { return p[1]; }));
            return [minR, minC];
        }
        var flip = turns % 2 === 1;
        function sh(shape) { return flip ? shape.replace(/h$/, 'H').replace(/v$/, 'h').replace(/H$/, 'v') : shape; }
        var blocks = base.blocks.map(function (b) { var p = moveBlock(b, b.r, b.c); return { id: b.id, col: b.col, shape: sh(b.shape), axis: b.axis ? (flip ? (b.axis === 'h' ? 'v' : 'h') : b.axis) : null, r: p[0], c: p[1] }; });
        var doors = base.doors.map(function (d) {
            var cells = []; for (var k = 0; k < d.len; k++) cells.push(d.side === 'top' ? [-1, d.start + k] : d.side === 'bottom' ? [N, d.start + k] : d.side === 'left' ? [d.start + k, -1] : [d.start + k, N]);
            var t = cells.map(function (p) { return rot(p[0], p[1]); });
            var side = t[0][0] < 0 ? 'top' : t[0][0] >= N ? 'bottom' : t[0][1] < 0 ? 'left' : 'right';
            var along = t.map(function (p) { return side === 'top' || side === 'bottom' ? p[1] : p[0]; });
            return { side: side, start: Math.min.apply(null, along), len: d.len, col: d.col };
        });
        var plan2 = (base.plan || []).map(function (m) { var p = moveBlock(base.blocks[m.id], m.r, m.c); return { id: m.id, exit: m.exit, r: p[0], c: p[1] }; });
        return { number: n, tough: isTough(n), R: base.R, C: base.C, stones: [], doors: doors, blocks: blocks, plan: plan2, par: base.par, extra: base.extra };
    }

    var api = { variant: variant, generate: generate, plan: plan, isTough: isTough, SHAPES: SHAPES, cellsAt: cellsAt, extent: extent, makeOcc: makeOcc, fits: fits,
                canExitVia: canExitVia, exitDoor: exitDoor, reach: reach, cloneBlocks: cloneBlocks, cleared: cleared, axisAllows: axisAllows,
                DIRS: DIRS, SIDE_DIR: SIDE_DIR, mapPositions: mapPositions };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WayOutEngine = api;
})(this);
