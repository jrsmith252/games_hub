/* Way Out: puzzle generator and solver.
   Coloured blocks sit on a walled board, packed almost full. Drag a block through free squares; it
   leaves through a door of its own colour if the whole block fits. A few blocks only slide one way
   (they carry an arrow), and some levels have grey crates that never leave.

   Extras (from Block Out!-style levels, mixed in from level 6 on). Each counts "exits": every time a
   block leaves (or sheds its outer colour), the count goes up by one.
     covers   rows hidden under a panel that breaks after so many exits, revealing more blocks
     locked   a door frozen shut until so many exits
     chained  a block that can't move until so many exits
     two-colour  a block with an outer and inner colour: it leaves its outer colour at that door, then
              stays on the board as the inner colour and must leave again

   Why it is hard: with only a handful of empty squares, blocks have to be shuffled through the gaps
   (like a sliding-tile puzzle) before anything can reach its door.

   How levels are made: pack a board, map the positions reachable before anything leaves, and start
   the player at one far from the first exit. A solver then plays it through (always possible: moves
   can be undone and a block leaving only frees space), which proves it and sets the move count.
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

    // Shapes as [row, col] offsets
    var SHAPES = {
        dot: [[0, 0]],
        bar2h: [[0, 0], [0, 1]], bar2v: [[0, 0], [1, 0]],
        bar3h: [[0, 0], [0, 1], [0, 2]], bar3v: [[0, 0], [1, 0], [2, 0]],
        sq: [[0, 0], [0, 1], [1, 0], [1, 1]],
        L3a: [[0, 0], [1, 0], [1, 1]], L3b: [[0, 0], [0, 1], [1, 0]], L3c: [[0, 0], [0, 1], [1, 1]], L3d: [[0, 1], [1, 0], [1, 1]],
        L4a: [[0, 0], [1, 0], [2, 0], [2, 1]], L4b: [[0, 0], [0, 1], [0, 2], [1, 0]], L4c: [[0, 0], [0, 1], [1, 1], [2, 1]], L4d: [[0, 2], [1, 0], [1, 1], [1, 2]],
        J4a: [[0, 1], [1, 1], [2, 0], [2, 1]], J4b: [[0, 0], [1, 0], [1, 1], [1, 2]], J4c: [[0, 0], [0, 1], [1, 0], [2, 0]], J4d: [[0, 0], [0, 1], [0, 2], [1, 2]],
        T4: [[0, 0], [0, 1], [0, 2], [1, 1]], T4u: [[0, 1], [1, 0], [1, 1], [1, 2]], T4l: [[0, 1], [1, 0], [1, 1], [2, 1]], T4r: [[0, 0], [1, 0], [1, 1], [2, 0]],
        S4h: [[0, 1], [0, 2], [1, 0], [1, 1]], S4v: [[0, 0], [1, 0], [1, 1], [2, 1]], Z4h: [[0, 0], [0, 1], [1, 1], [1, 2]], Z4v: [[0, 1], [1, 0], [1, 1], [2, 0]]
    };
    var SMALL = ['bar2h', 'bar2v', 'bar2h', 'bar2v', 'sq', 'L3a', 'L3b', 'L3c', 'L3d', 'bar3h', 'bar3v'];
    var MIXED = SMALL.concat(['L4a', 'L4b', 'L4c', 'L4d', 'J4a', 'J4b', 'J4c', 'J4d', 'T4', 'T4u', 'T4l', 'T4r', 'S4h', 'S4v', 'Z4h', 'Z4v']);

    // ---------- level plan ----------
    function isTough(n) { return n >= 10 && n % 5 === 0; }
    // Which extras a level gets: not every level, and each one is introduced on its own first
    function extras(n) {
        var x = { lock: 0, chain: 0, covers: 0, two: 0 };
        if (n === 6 || (n >= 9 && n % 4 === 1)) x.lock = 1;
        if (n === 11 || (n >= 14 && n % 5 === 4)) x.chain = n >= 40 && n % 2 ? 2 : 1;
        if (n === 16 || (n >= 18 && n % 3 === 2)) x.covers = n >= 30 && n % 2 ? 2 : 1;
        if (n === 21 || (n >= 27 && n % 7 === 6)) x.two = n >= 45 && n % 2 ? 2 : 1;
        // the level that introduces something has nothing else new on it
        var intro = { 6: 'lock', 11: 'chain', 16: 'covers', 21: 'two' }[n];
        if (intro) Object.keys(x).forEach(function (k) { if (k !== intro) x[k] = 0; });
        return x;
    }
    // fill: share of the board covered; want: space-making moves needed (moves beyond one per block);
    // axis: share of one-way blocks; crates: grey crates that never leave
    function plan(n) {
        var p;
        if (n === 1) p = { R: 5, C: 5, fill: 0.5, colours: 2, shapes: SMALL, want: 0 };
        else if (n === 2) p = { R: 5, C: 5, fill: 0.7, colours: 3, shapes: SMALL, want: 1 };
        else if (n <= 4) p = { R: 6, C: 6, fill: 0.8, colours: 3, shapes: SMALL, want: n - 1 };
        else if (n <= 9) p = { R: 6, C: 6, fill: 0.88, colours: 4, shapes: MIXED, want: n - 1 };                    // 4..8
        else if (n <= 19) p = { R: n % 2 ? 7 : 6, C: 6, fill: 0.9, colours: 4 + (n % 2), shapes: MIXED, want: 7 + Math.floor((n - 10) / 3) };   // 7..10
        else if (n <= 39) p = { R: n % 2 ? 7 : 6, C: 6, fill: 0.9, colours: 4 + (n % 2), shapes: MIXED, want: 9 + Math.floor((n - 20) / 7) };  // 9..11
        else p = { R: n % 2 ? 7 : 6, C: 6, fill: 0.9, colours: 4 + (n % 2), shapes: MIXED, want: 11 + (n % 4) };       // 11..14
        if (isTough(n)) p.want += 3;
        var x = extras(n);
        p.lock = x.lock; p.chain = x.chain; p.two = x.two;
        // Covered rows sit above the open board, one or two bands; the jam itself can be a little lighter
        if (x.covers) { p.R = 6; p.bands = x.covers === 1 ? [3] : [2, 2]; p.fill = 0.9; p.bandFill = 0.62; p.want = Math.max(4, p.want - 3); }
        // extras make up for some of the shuffling
        p.want = Math.max(3, p.want - 2 * (x.lock + x.chain + x.two));
        p.axis = n >= 12 && n % 2 === 0 ? 0.12 : 0;
        p.crates = n >= 16 && n % 4 === 0 ? 1 + (n % 8 === 0 ? 1 : 0) : 0;
        p.tough = isTough(n);
        return p;
    }

    // ---------- geometry ----------
    // level: { R, C, stones:[idx], doors:[{side,start,len,col,lock?}], blocks:[{id,col,shape,axis,r,c,chain?,col2?}], covers?:[{r0,r1,at}] }
    // A position is a list of blocks, each also carrying out (gone) and peel (outer colour shed).
    function exitsDone(bs) { var e = 0; for (var i = 0; i < bs.length; i++) { if (bs[i].peel) e++; if (bs[i].out) e++; } return e; }
    function colourOf(b) { return b.peel ? b.col2 : b.col; }
    function coverAt(L, row) { var cv = L.covers || []; for (var i = 0; i < cv.length; i++) if (row >= cv[i].r0 && row <= cv[i].r1) return i; return -1; }
    function hidden(L, b, ex) { var z = coverAt(L, b.r); return z >= 0 && ex < L.covers[z].at; }
    function frozen(L, b, ex) { return hidden(L, b, ex) || (b.chain > 0 && ex < b.chain); }
    function cellsAt(b, r, c) { var s = SHAPES[b.shape], out = []; for (var i = 0; i < s.length; i++) out.push([r + s[i][0], c + s[i][1]]); return out; }
    function extent(shape) { var s = SHAPES[shape], h = 0, w = 0; s.forEach(function (p) { h = Math.max(h, p[0] + 1); w = Math.max(w, p[1] + 1); }); return { h: h, w: w }; }
    function makeOcc(L, blocks) {
        var occ = []; for (var i = 0; i < L.R * L.C; i++) occ.push(-1);
        L.stones.forEach(function (s) { occ[s] = -2; });
        var ex = exitsDone(blocks);
        (L.covers || []).forEach(function (cv) { if (ex < cv.at) for (var y = cv.r0; y <= cv.r1; y++) for (var x = 0; x < L.C; x++) occ[y * L.C + x] = -2; });
        blocks.forEach(function (b) { if (b.out || hidden(L, b, ex)) return; cellsAt(b, b.r, b.c).forEach(function (p) { occ[p[0] * L.C + p[1]] = b.id; }); });
        occ.ex = ex;
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
        if (b.col < 0 || d.col !== colourOf(b)) return false;   // crates (col -1) never leave
        if (d.lock > 0 && occ.ex < d.lock) return false;      // door still frozen
        if (b.chain > 0 && occ.ex < b.chain) return false;    // block still chained
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
        if (frozen(L, b, occ.ex)) return { spots: [[b.r, b.c]], exitFrom: null };
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


    function cloneBlocks(bs) { return bs.map(function (b) { var o = { id: b.id, col: b.col, shape: b.shape, axis: b.axis, r: b.r, c: b.c, out: b.out }; if (b.chain) o.chain = b.chain; if (b.col2 !== undefined && b.col2 !== null) { o.col2 = b.col2; o.peel = !!b.peel; } return o; }); }
    function cleared(bs) { return bs.every(function (b) { return b.out || b.col < 0; }); }
    function key(bs) { var s = ''; for (var i = 0; i < bs.length; i++) s += (bs[i].out ? 'x' : bs[i].r * 16 + bs[i].c) + (bs[i].peel ? 'p' : '') + ','; return s; }
    // Where a block ends up when it sheds its outer colour: slid right up to that door
    function flushAt(L, occ, b, r, c, d) {
        var v = DIRS[SIDE_DIR[d.side]];
        while (fits(L, occ, b, r + v[0], c + v[1])) { r += v[0]; c += v[1]; }
        return [r, c];
    }
    // Apply "block i leaves from spot at": either it goes, or (two-colour) it sheds its outer colour at the door
    function doExit(L, bs, i, at) {
        var b = bs[i], occ = makeOcc(L, bs), di = exitDoor(L, occ, b, at[0], at[1]);
        if (b.col2 !== undefined && b.col2 !== null && !b.peel) { var f = flushAt(L, occ, b, at[0], at[1], L.doors[di]); b.r = f[0]; b.c = f[1]; b.peel = true; }
        else { b.r = at[0]; b.c = at[1]; b.out = true; }
        return di;
    }
    // A coloured block that can leave from this position (after sliding to its door), or null
    function canLeave(L, bs) {
        var occ = makeOcc(L, bs);
        for (var i = 0; i < bs.length; i++) {
            if (bs[i].out || bs[i].col < 0) continue;
            var rc = reach(L, occ, bs[i]);
            if (rc.exitFrom) return { i: i, at: rc.exitFrom };
        }
        return null;
    }

    // ---------- building ----------
    function pack(seed, P) {
        var r = rng(seed), top = (P.bands || []).reduce(function (a, b) { return a + b; }, 0), R = P.R + top, C = P.C, L = { R: R, C: C, stones: [], doors: [], blocks: [] };
        if (top) { L.covers = []; var y0 = 0; P.bands.forEach(function (h) { L.covers.push({ r0: y0, r1: y0 + h - 1, at: 0 }); y0 += h; }); }
        // a block sits wholly under one cover or wholly on the open board
        function oneZone(b) { var z = null, ok = true; cellsAt(b, b.r, b.c).forEach(function (p) { var k = coverAt(L, p[0]); if (z === null) z = k; else if (z !== k) ok = false; }); return ok; }
        var used = {}, tries = 0, sides = ['top', 'bottom', 'left', 'right'];
        while (L.doors.length < P.colours && tries++ < 300) {
            var side = sides[Math.floor(r() * 4)], len = (side === 'top' || side === 'bottom') ? C : R;
            var dl = r() < 0.6 ? 2 : 3, at = Math.floor(r() * (len - dl + 1)), ok = true;   // doors two or three squares wide
            for (var x = at - 1; x <= at + dl; x++) if (used[side + x]) ok = false;   // keep a gap between doors
            if (!ok) continue;
            for (x = at; x < at + dl; x++) used[side + x] = 1;
            L.doors.push({ side: side, start: at, len: dl, col: L.doors.length });
        }
        if (L.doors.length < P.colours) return null;
        // the open board is packed to P.fill; covered rows more loosely, so they don't turn into a second full jam
        var covered = 0, area = (R - top) * C, colArea = {}, bandCovered = 0, bandArea = top * C, bandFill = P.bandFill || 0.7;
        // grey crates first (never leave)
        for (var k = 0, t0 = 0; k < (P.crates || 0) && t0 < 100; t0++) {
            var cs = r() < 0.5 ? 'bar2h' : 'bar2v';
            var crate = { id: L.blocks.length, col: -1, shape: cs, axis: null, r: top + Math.floor(r() * (R - top)), c: Math.floor(r() * C) };
            if (!fits(L, makeOcc(L, L.blocks), crate, crate.r, crate.c) || !oneZone(crate)) continue;
            L.blocks.push(crate); covered += 2; k++;
        }
        for (var t = 0; t < 4000 && (covered < P.fill * area || bandCovered < bandFill * bandArea); t++) {
            var shape = P.shapes[Math.floor(r() * P.shapes.length)], e = extent(shape);
            var fit = L.doors.filter(function (d) { return (d.side === 'top' || d.side === 'bottom') ? e.w <= d.len : e.h <= d.len; });
            // blocks on the open board use doors they can reach before the panels break (not the top, not beside covered rows)
            var openSpot = coverAt(L, Math.floor(r() * R)) < 0;
            if (top && openSpot) fit = fit.filter(function (d) { return d.side !== 'top' && (d.side === 'bottom' || d.start >= top); });
            if (!fit.length) continue;
            if (!fit.length) continue;
            // share the colours out evenly: prefer the fitting colour with the fewest squares so far
            fit.sort(function (a, b) { return (colArea[a.col] || 0) - (colArea[b.col] || 0); });
            var d = fit[r() < 0.75 ? 0 : Math.floor(r() * fit.length)];
            var axis = r() < (P.axis || 0) ? ((d.side === 'top' || d.side === 'bottom') ? 'v' : 'h') : null;
            var b = { id: L.blocks.length, col: d.col, shape: shape, axis: axis, r: top ? (openSpot ? top + Math.floor(r() * (R - top)) : Math.floor(r() * top)) : Math.floor(r() * R), c: Math.floor(r() * C) };
            // a one-way block must already be lined up with its door, or it could never leave
            if (axis === 'v') b.c = d.start + Math.floor(r() * (d.len - e.w + 1));
            if (axis === 'h') b.r = d.start + Math.floor(r() * (d.len - e.h + 1));
            if (!fits(L, makeOcc(L, L.blocks), b, b.r, b.c) || !oneZone(b)) continue;
            var inBand = coverAt(L, b.r) >= 0, sz = SHAPES[shape].length;
            if (inBand ? bandCovered + sz > bandFill * bandArea + 1 : covered >= P.fill * area) continue;
            L.blocks.push(b);
            if (inBand) { bandCovered += sz; colArea[d.col] = (colArea[d.col] || 0) + sz; continue; }
            covered += sz; colArea[d.col] = (colArea[d.col] || 0) + SHAPES[shape].length;
        }
        if (covered < (P.fill - 0.05) * area) return null;
        return decorate(L, P, r) ? L : null;
    }
    // Add the extras: when covers open, a frozen door, chained blocks, two-colour blocks
    function decorate(L, P, r) {
        var open = L.blocks.filter(function (b) { return b.col >= 0 && coverAt(L, b.r) < 0; });
        function pick(list) { return list.length ? list[Math.floor(r() * list.length)] : null; }
        var n = open.length;
        if (L.covers) {
            // the lowest panel breaks once about half the open board has gone; each one above after half of the band below it
            var at = Math.max(2, Math.round(n * (0.4 + 0.25 * r())));
            for (var k = L.covers.length - 1; k >= 0; k--) {
                L.covers[k].at = at;
                var inBand = L.blocks.filter(function (b) { return b.col >= 0 && coverAt(L, b.r) === k; }).length;
                at += Math.max(2, Math.round(inBand * (0.4 + 0.3 * r())));
            }
        }
        if (P.lock) {
            var d = pick(L.doors); if (!d) return false;
            d.lock = 2 + Math.floor(r() * Math.min(4, Math.max(1, n - 3)));
        }
        for (var c = 0; c < (P.chain || 0); c++) {
            var cb = pick(open.filter(function (b) { return !b.chain && b.col2 === undefined; })); if (!cb) return false;
            cb.chain = 2 + Math.floor(r() * Math.min(4, Math.max(1, n - 3)));
        }
        for (var t = 0; t < (P.two || 0); t++) {
            var tb = pick(open.filter(function (b) { return !b.chain && b.col2 === undefined && !b.axis; })); if (!tb) return false;
            var e = extent(tb.shape), others = L.doors.filter(function (d2) { return d2.col !== tb.col && ((d2.side === 'top' || d2.side === 'bottom') ? e.w <= d2.len : e.h <= d2.len); });
            var od = pick(others); if (!od) return false;
            tb.col2 = tb.col; tb.col = od.col; tb.peel = false;   // outer colour first, then its own
        }
        return true;
    }
    // Positions reachable before anything leaves, with each one's distance from "a block can leave"
    function component(L, start, cap) {
        var ids = {}, st = [], adj = [];
        function add(bs) { var k = key(bs); if (ids[k] === undefined) { ids[k] = st.length; st.push(bs); adj.push([]); } return ids[k]; }
        add(cloneBlocks(start));
        for (var h = 0; h < st.length; h++) {
            if (st.length > cap) return null;
            var bs = st[h], occ = makeOcc(L, bs);
            for (var i = 0; i < bs.length; i++) {
                var spots = reach(L, occ, bs[i]).spots;
                for (var s = 1; s < spots.length; s++) { var nb = cloneBlocks(bs); nb[i].r = spots[s][0]; nb[i].c = spots[s][1]; adj[h].push(add(nb)); }
            }
        }
        var dist = st.map(function () { return -1; }), q = [];
        st.forEach(function (bs, i) { if (canLeave(L, bs)) { dist[i] = 0; q.push(i); } });
        for (var qi = 0; qi < q.length; qi++) adj[q[qi]].forEach(function (a) { if (dist[a] < 0) { dist[a] = dist[q[qi]] + 1; q.push(a); } });
        return { st: st, dist: dist };
    }
    // Play it through: shortest way to the next exit, again and again. Returns { moves, stages } or null.
    function playThrough(L, start, cap) {
        var bs = cloneBlocks(start), moves = [], stages = [];
        for (var g = 0; g < 200; g++) {
            if (cleared(bs)) return { moves: moves, stages: stages };
            var ex = canLeave(L, bs), d = 0;
            if (!ex) {
                var seen = {}, frontier = [bs], found = null, count = 1;
                seen[key(bs)] = 0;
                while (frontier.length && !found) {
                    d++; var next = [];
                    for (var f = 0; f < frontier.length && !found; f++) {
                        var cur = frontier[f], occ = makeOcc(L, cur), ck = key(cur);
                        for (var i = 0; i < cur.length && !found; i++) {
                            if (cur[i].out) continue;
                            var spots = reach(L, occ, cur[i]).spots;
                            for (var s = 1; s < spots.length; s++) {
                                var nb = cloneBlocks(cur); nb[i].r = spots[s][0]; nb[i].c = spots[s][1];
                                var k = key(nb); if (seen[k] !== undefined) continue;
                                seen[k] = { prev: ck, mv: { id: i, exit: false, r: spots[s][0], c: spots[s][1] } };
                                if (++count > cap) return null;
                                if (canLeave(L, nb)) { found = nb; break; }
                                next.push(nb);
                            }
                        }
                    }
                    frontier = next;
                }
                if (!found) return null;
                var path = [], kk = key(found);
                while (seen[kk]) { path.unshift(seen[kk].mv); kk = seen[kk].prev; }
                moves = moves.concat(path); bs = found; ex = canLeave(L, bs);
            }
            stages.push(d);
            moves.push({ id: ex.i, exit: true, r: ex.at[0], c: ex.at[1] });
            doExit(L, bs, ex.i, ex.at);
        }
        return null;
    }

    var cache = {};
    // tries: boards to pack and compare (the shipped levels used many more than a phone would)
    function generate(n, tries) {
        if (cache[n] && !tries) return cache[n];
        var P = plan(n), best = null, bestGap = 1e9;
        tries = tries || 12;
        for (var t = 0; t < tries || (!best && t < tries * 20); t++) {
            var L = pack(n * 7919 + t * 104729 + 1, P);
            if (!L) continue;
            var coloured = L.blocks.filter(function (b) { return b.col >= 0; }).length + L.blocks.filter(function (b) { return b.col2 !== undefined; }).length;   // exits needed
            // Candidate starting positions: as packed, and (when the board is tight enough to map)
            // the positions furthest and half-way from the first exit
            var starts = [L.blocks], cm = component(L, L.blocks, 12000);
            if (cm) {
                var far = -1; cm.dist.forEach(function (d, i) { if (d >= 0 && (far < 0 || d > cm.dist[far])) far = i; });
                if (far < 0) continue;   // nothing can ever leave
                starts.push(cm.st[far]);
                var half = Math.floor(cm.dist[far] / 2), mid = -1;
                cm.dist.forEach(function (d, i) { if (mid < 0 && d === half && half > 0) mid = i; });
                if (mid >= 0) starts.push(cm.st[mid]);
            }
            for (var s = 0; s < starts.length; s++) {
                var pt = playThrough(L, starts[s], 25000);
                if (!pt) continue;
                var making = pt.moves.length - coloured;
                var gap = making < P.want ? (P.want - making) * 2 : making - P.want;   // too easy counts double
                if (gap < bestGap) {
                    bestGap = gap;
                    best = { number: n, tough: P.tough, kind: 'sort', R: L.R, C: L.C, stones: [], doors: L.doors, covers: L.covers,
                             blocks: starts[s].map(function (b) { var o = { id: b.id, col: b.col, shape: b.shape, axis: b.axis, r: b.r, c: b.c }; if (b.chain) o.chain = b.chain; if (b.col2 !== undefined) o.col2 = b.col2; return o; }),
                             plan: pt.moves, par: pt.moves.length, extra: making, stages: pt.stages.join('') };
                }
            }
            if (bestGap <= 1) break;
        }
        if (!best) throw new Error('Way Out: no level ' + n);
        cache[n] = best;
        return best;
    }

    // Levels past the shipped ones: an earlier board mirrored (left-right, top-bottom or both)
    function variant(base, n, mode) {
        if (base.covers) mode = 1;   // covered rows stay at the top
        var fh = mode & 1, fv = mode & 2, R = base.R, C = base.C;
        function mir(p) { return [fv ? R - 1 - p[0] : p[0], fh ? C - 1 - p[1] : p[1]]; }
        function norm(cells) {
            var mr = Math.min.apply(null, cells.map(function (p) { return p[0]; })), mc = Math.min.apply(null, cells.map(function (p) { return p[1]; }));
            var rel = cells.map(function (p) { return [p[0] - mr, p[1] - mc]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
            var name = null;
            Object.keys(SHAPES).forEach(function (k) {
                var sh = SHAPES[k].slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
                if (!name && JSON.stringify(sh) === JSON.stringify(rel)) name = k;
            });
            if (!name) { name = 'x' + JSON.stringify(rel); SHAPES[name] = rel; }
            return { shape: name, r: mr, c: mc };
        }
        function at(b, r, c) { return norm(cellsAt(b, r, c).map(mir)); }
        var blocks = base.blocks.map(function (b) { var m = at(b, b.r, b.c), o = { id: b.id, col: b.col, shape: m.shape, axis: b.axis, r: m.r, c: m.c }; if (b.chain) o.chain = b.chain; if (b.col2 !== undefined) o.col2 = b.col2; return o; });
        var doors = base.doors.map(function (d) {
            var vert = d.side === 'top' || d.side === 'bottom', len = vert ? C : R, flipAlong = vert ? fh : fv, flipSide = vert ? fv : fh;
            var opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            var o = { side: flipSide ? opp[d.side] : d.side, start: flipAlong ? len - d.start - d.len : d.start, len: d.len, col: d.col }; if (d.lock) o.lock = d.lock; return o;
        });
        var plan2 = base.plan.map(function (m) { var p = at(base.blocks[m.id], m.r, m.c); return { id: m.id, exit: m.exit, r: p.r, c: p.c }; });
        return { number: n, tough: isTough(n), kind: 'sort', R: R, C: C, stones: [], doors: doors, covers: base.covers, blocks: blocks, plan: plan2, par: base.par, extra: base.extra, stages: base.stages };
    }

    var api = { generate: generate, variant: variant, plan: plan, isTough: isTough, extras: extras, exitsDone: exitsDone, colourOf: colourOf, coverAt: coverAt, hidden: hidden, frozen: frozen, flushAt: flushAt, doExit: doExit, playThrough: playThrough, SHAPES: SHAPES, cellsAt: cellsAt, extent: extent, makeOcc: makeOcc, fits: fits,
                canExitVia: canExitVia, exitDoor: exitDoor, reach: reach, cloneBlocks: cloneBlocks, cleared: cleared, axisAllows: axisAllows, DIRS: DIRS, SIDE_DIR: SIDE_DIR };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WayOutEngine = api;
})(this);
