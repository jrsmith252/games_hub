/* Moving In: level generator and solver.
   A house is a set of square cells cut into rooms. Doors sit on the edge between two cells of different rooms
   (or, for the front door, between a cell and the outside). Some rooms are taken out as pieces; the player puts
   them back. A placement is right when every cell is filled and every door lines up: wherever two rooms meet, a
   door on one side must be a door on the other, and only the front door may open to the outside.
   Every level is checked by the solver to have exactly one answer (identical pieces count as the same). */
(function (root) {
    'use strict';
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // up, right, down, left

    function plan(n) {
        if (n <= 3) return { R: 5, C: 5, rooms: 6, pieces: 2, rotate: false, cuts: 2 };
        if (n <= 8) return { R: 6, C: 5, rooms: 7, pieces: 3, rotate: false, cuts: 3 };
        if (n <= 15) return { R: 6, C: 6, rooms: 8, pieces: 3, rotate: n >= 12, cuts: 3 };
        if (n <= 30) return { R: 7, C: 6, rooms: 9, pieces: 4, rotate: true, cuts: 4 };
        return { R: 7, C: 7, rooms: 10, pieces: n % 3 === 0 ? 5 : 4, rotate: true, cuts: 5 };
    }

    // ---------- house shape: a rectangle with a few cells nibbled from the edge ----------
    function shape(P, r) {
        var inside = [], R = P.R, C = P.C;
        for (var i = 0; i < R * C; i++) inside.push(true);
        var cuts = 0, tries = 0;
        while (cuts < P.cuts && tries++ < 200) {
            // nibble a 1x1 or 1x2 bite from a corner or an edge
            var y = r() < 0.5 ? 0 : R - 1, x = Math.floor(r() * C);
            if (r() < 0.5) { x = r() < 0.5 ? 0 : C - 1; y = Math.floor(r() * R); }
            var bite = [[y, x]];
            if (r() < 0.5) bite.push(y === 0 || y === R - 1 ? [y, x + (x < C - 1 ? 1 : -1)] : [y + (y < R - 1 ? 1 : -1), x]);
            var save = inside.slice();
            bite.forEach(function (b) { inside[b[0] * C + b[1]] = false; });
            if (!connected(inside, R, C)) { inside = save; continue; }
            cuts++;
        }
        return inside;
    }
    function connected(inside, R, C) {
        var start = inside.indexOf(true); if (start < 0) return false;
        var seen = {}, q = [start], n = 0; seen[start] = 1;
        while (q.length) { var c = q.pop(); n++; var y = Math.floor(c / C), x = c % C;
            DIRS.forEach(function (d) { var yy = y + d[0], xx = x + d[1], k = yy * C + xx; if (yy >= 0 && yy < R && xx >= 0 && xx < C && inside[k] && !seen[k]) { seen[k] = 1; q.push(k); } }); }
        return n === inside.filter(Boolean).length;
    }

    // ---------- rooms: grow regions from seeds ----------
    function partition(P, inside, r) {
        var R = P.R, C = P.C, owner = inside.map(function (v) { return v ? -1 : -2; });
        var cells = []; inside.forEach(function (v, i) { if (v) cells.push(i); });
        var seeds = shuffle(cells.slice(), r).slice(0, P.rooms);
        seeds.forEach(function (s, i) { owner[s] = i; });
        var size = seeds.map(function () { return 1; }), cap = Math.ceil(cells.length / P.rooms) + 2;
        var progress = true;
        while (progress) {
            progress = false;
            shuffle(seeds.map(function (s, i) { return i; }), r).forEach(function (room) {
                if (size[room] >= cap) return;
                var front = [];
                owner.forEach(function (o, c) { if (o !== room) return; var y = Math.floor(c / C), x = c % C;
                    DIRS.forEach(function (d) { var yy = y + d[0], xx = x + d[1], k = yy * C + xx; if (yy >= 0 && yy < R && xx >= 0 && xx < C && owner[k] === -1) front.push(k); }); });
                if (!front.length) return;
                owner[front[Math.floor(r() * front.length)]] = room; size[room]++; progress = true;
            });
        }
        // any cell left over joins a neighbour
        var left = true;
        while (left) { left = false; owner.forEach(function (o, c) { if (o !== -1) return; left = true; var y = Math.floor(c / C), x = c % C;
            for (var d = 0; d < 4; d++) { var yy = y + DIRS[d][0], xx = x + DIRS[d][1], k = yy * C + xx; if (yy >= 0 && yy < R && xx >= 0 && xx < C && owner[k] >= 0) { owner[c] = owner[k]; size[owner[k]]++; break; } } }); }
        if (size.some(function (s) { return s < 2; })) return null;   // no one-cell cupboards
        return { owner: owner, n: seeds.length, size: size };
    }

    // ---------- doors ----------
    // an edge between cell a and the cell in direction d; stored as "a:d" with a the lower index for inner edges
    function edgeKey(c, d, C) { var y = Math.floor(c / C), x = c % C, yy = y + DIRS[d][0], xx = x + DIRS[d][1]; var k = yy * C + xx; return d === 1 || d === 2 ? c + ':' + d : k + ':' + (d + 2) % 4; }
    function doors(P, H, r) {
        var R = P.R, C = P.C, owner = H.owner, shared = {};   // "i-j" -> list of edge keys
        owner.forEach(function (o, c) { if (o < 0) return; var y = Math.floor(c / C), x = c % C;
            [1, 2].forEach(function (d) { var yy = y + DIRS[d][0], xx = x + DIRS[d][1]; if (yy >= R || xx >= C) return; var o2 = owner[yy * C + xx]; if (o2 < 0 || o2 === o) return;
                var a = Math.min(o, o2), b = Math.max(o, o2); (shared[a + '-' + b] = shared[a + '-' + b] || []).push(edgeKey(c, d, C)); }); });
        // the hall: the room touching the most others
        var deg = []; for (var i = 0; i < H.n; i++) deg.push(0);
        Object.keys(shared).forEach(function (k) { var p = k.split('-'); deg[+p[0]]++; deg[+p[1]]++; });
        var hall = deg.indexOf(Math.max.apply(null, deg));
        // a spanning tree from the hall, so every room can be reached; plus one extra door in bigger houses
        var inTree = {}, list = [], doorSet = {}; inTree[hall] = 1;
        var edges = shuffle(Object.keys(shared), r);
        var added = true;
        while (added) { added = false; for (var e = 0; e < edges.length; e++) { var p = edges[e].split('-'), a = +p[0], b = +p[1];
            if (!!inTree[a] === !!inTree[b]) continue; inTree[a] = inTree[b] = 1; list.push(edges[e]); added = true; } }
        if (Object.keys(inTree).length !== H.n) return null;
        if (H.n >= 9) { var spare = edges.filter(function (k) { return list.indexOf(k) < 0; }); if (spare.length) list.push(spare[0]); }
        list.forEach(function (k) { var opts = shared[k]; doorSet[opts[Math.floor(r() * opts.length)]] = 1; });
        // the front door: on an outside wall of a room touching the hall (or the hall itself)
        var outside = [];
        owner.forEach(function (o, c) { if (o < 0) return; var y = Math.floor(c / C), x = c % C;
            DIRS.forEach(function (d, di) { var yy = y + d[0], xx = x + d[1]; var out = yy < 0 || yy >= R || xx < 0 || xx >= C || owner[yy * C + xx] === -2; if (out) outside.push({ c: c, d: di, room: o }); }); });
        var near = outside.filter(function (e) { return e.room !== hall && (shared[Math.min(e.room, hall) + '-' + Math.max(e.room, hall)] || []).some(function (k) { return doorSet[k]; }); });
        var fd = (near.length ? near : outside)[Math.floor(r() * (near.length ? near.length : outside.length))];
        return { set: doorSet, hall: hall, front: fd, deg: deg };
    }

    // ---------- names ----------
    function names(H, D, r) {
        var nm = []; for (var i = 0; i < H.n; i++) nm.push('');
        nm[D.hall] = 'Hall';
        nm[D.front.room] = D.front.room === D.hall ? 'Hall' : 'Entry';
        var rest = []; for (i = 0; i < H.n; i++) if (!nm[i]) rest.push(i);
        rest.sort(function (a, b) { return H.size[b] - H.size[a]; });
        var big = ['Living Room', 'Kitchen', 'Bedroom', 'Dining Room', 'Bedroom', 'Study', 'Bedroom'], small = ['Bath', 'Storage', 'Toilet', 'Utility', 'Pantry', 'Closet'];
        var bi = 0, si = 0;
        rest.forEach(function (k) { nm[k] = H.size[k] >= 4 ? big[bi++ % big.length] : small[si++ % small.length]; });
        return nm;
    }

    // ---------- pieces ----------
    // a piece is a room's cells (relative) plus which of its outer edges are doors; it can be rotated
    function pieceOf(room, H, D, P) {
        var C = P.C, cells = [], minY = 99, minX = 99;
        H.owner.forEach(function (o, c) { if (o === room) { var y = Math.floor(c / C), x = c % C; cells.push([y, x]); minY = Math.min(minY, y); minX = Math.min(minX, x); } });
        var drs = [];
        cells.forEach(function (p) { DIRS.forEach(function (d, di) {
            var c = p[0] * C + p[1], yy = p[0] + d[0], xx = p[1] + d[1], inRoom = yy >= 0 && yy < P.R && xx >= 0 && xx < P.C && H.owner[yy * C + xx] === room;
            if (inRoom) return;
            var isFront = D.front.c === c && D.front.d === di;
            var inHouse = yy >= 0 && yy < P.R && xx >= 0 && xx < P.C && H.owner[yy * C + xx] >= 0;
            if (isFront || (inHouse && D.set[edgeKey(c, di, C)])) drs.push([p[0] - minY, p[1] - minX, di, isFront ? 1 : 0]);
        }); });
        return { cells: cells.map(function (p) { return [p[0] - minY, p[1] - minX]; }), doors: drs, at: [minY, minX] };
    }
    function rotate(pc) {   // 90 degrees clockwise
        var h = Math.max.apply(null, pc.cells.map(function (c) { return c[0]; }));
        var cells = pc.cells.map(function (c) { return [c[1], h - c[0]]; });
        var doors = pc.doors.map(function (d) { return [d[1], h - d[0], (d[2] + 1) % 4, d[3]]; });
        return norm({ cells: cells, doors: doors });
    }
    function norm(pc) {
        var my = Math.min.apply(null, pc.cells.map(function (c) { return c[0]; })), mx = Math.min.apply(null, pc.cells.map(function (c) { return c[1]; }));
        return { cells: pc.cells.map(function (c) { return [c[0] - my, c[1] - mx]; }), doors: pc.doors.map(function (d) { return [d[0] - my, d[1] - mx, d[2], d[3]]; }) };
    }
    function sig(pc) { return pc.cells.map(String).sort().join(';') + '|' + pc.doors.map(String).sort().join(';'); }
    function orientations(pc, allow) {
        var out = [pc], seen = {}; seen[sig(pc)] = 1;
        if (!allow) return out;
        var cur = pc;
        for (var i = 0; i < 3; i++) { cur = rotate(cur); var s = sig(cur); if (!seen[s]) { seen[s] = 1; out.push(cur); } }
        return out;
    }

    // ---------- checking a layout ----------
    // grid: cell -> room id (-1 empty, -2 outside); doorsAt: "cell:dir" for every door a room shows on its edge
    // returns the list of door problems (edges where the two sides disagree, or a door opening to the outside)
    function problems(L, grid, doorMap) {
        var bad = [], C = L.C, R = L.R;
        for (var c = 0; c < R * C; c++) {
            if (grid[c] < 0) continue;
            var y = Math.floor(c / C), x = c % C;
            for (var d = 0; d < 4; d++) {
                var yy = y + DIRS[d][0], xx = x + DIRS[d][1], k = yy * C + xx, out = yy < 0 || yy >= R || xx < 0 || xx >= C || L.inside[k] === false;
                var mine = !!doorMap[c + ':' + d];
                if (out) { if (mine && !doorMap[c + ':' + d + ':front']) bad.push([c, d]); continue; }
                if (grid[k] === grid[c] || grid[k] === -1) continue;
                var theirs = !!doorMap[k + ':' + (d + 2) % 4];
                if (mine !== theirs) bad.push([c, d]);
            }
        }
        return bad;
    }

    // ---------- solver: how many ways can the pieces go back? (stops at 2) ----------
    function countSolutions(L) {
        var R = L.R, C = L.C, grid = L.fixedGrid.slice(), doorMap = Object.assign({}, L.fixedDoors), found = 0;
        var empty = []; grid.forEach(function (v, i) { if (v === -1) empty.push(i); });
        var opts = L.pieces.map(function (p) { return orientations(p, L.rotate); });
        var used = L.pieces.map(function () { return false; });
        // identical pieces (same shape and doors) are interchangeable: only try the first unused one of each kind
        var kind = L.pieces.map(function (p, i) { var s = orientations(p, L.rotate).map(sig).sort()[0]; return s; });
        function fits(o, at) {
            var cs = [];
            for (var i = 0; i < o.cells.length; i++) { var y = at[0] + o.cells[i][0], x = at[1] + o.cells[i][1]; if (y < 0 || y >= R || x < 0 || x >= C || grid[y * C + x] !== -1) return null; cs.push(y * C + x); }
            return cs;
        }
        function localOk(cs, o, at, id) {
            // check the new room's edges against everything already there
            var mine = {}; o.doors.forEach(function (d) { mine[((at[0] + d[0]) * C + at[1] + d[1]) + ':' + d[2]] = d[3] ? 2 : 1; });
            for (var i = 0; i < cs.length; i++) { var c = cs[i], y = Math.floor(c / C), x = c % C;
                for (var d = 0; d < 4; d++) { var yy = y + DIRS[d][0], xx = x + DIRS[d][1], k = yy * C + xx, out = yy < 0 || yy >= R || xx < 0 || xx >= C || !L.inside[k];
                    var m = mine[c + ':' + d];
                    if (out) { if (m === 1) return false; continue; }
                    if (cs.indexOf(k) >= 0 || grid[k] === -1) continue;
                    if (!!m !== !!doorMap[k + ':' + (d + 2) % 4]) return false; } }
            return true;
        }
        function go() {
            if (found > 1) return;
            var cell = -1; for (var e = 0; e < empty.length; e++) if (grid[empty[e]] === -1) { cell = empty[e]; break; }
            if (cell < 0) { found++; return; }
            var tried = {};
            for (var p = 0; p < L.pieces.length; p++) {
                if (used[p] || tried[kind[p]]) continue; tried[kind[p]] = 1;
                for (var oi = 0; oi < opts[p].length; oi++) { var o = opts[p][oi];
                    // the first empty cell (reading order) must be the piece's own first cell
                    var f = o.cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; })[0];
                    var at = [Math.floor(cell / C) - f[0], cell % C - f[1]], cs = fits(o, at);
                    if (!cs || !localOk(cs, o, at, p)) continue;
                    cs.forEach(function (c) { grid[c] = 100 + p; });
                    var added = o.doors.map(function (d) { var k = ((at[0] + d[0]) * C + at[1] + d[1]) + ':' + d[2]; doorMap[k] = 1; return k; });
                    used[p] = true; go(); used[p] = false;
                    cs.forEach(function (c) { grid[c] = -1; }); added.forEach(function (k) { delete doorMap[k]; });
                    if (found > 1) return;
                }
            }
        }
        go();
        return found;
    }

    function generate(n) {
        var P = plan(n);
        for (var attempt = 0; attempt < 500; attempt++) {
            var r = rng(n * 7919 + attempt * 104729 + 3);
            var inside = shape(P, r), H = partition(P, inside, r); if (!H) continue;
            var D = doors(P, H, r); if (!D) continue;
            var nm = names(H, D, r);
            // which rooms come out: never the hall; more pieces as levels go on
            var cand = shuffle(Array.from({ length: H.n }, function (_, i) { return i; }).filter(function (i) { return i !== D.hall; }), r).slice(0, P.pieces);
            var fixedGrid = H.owner.map(function (o) { return o >= 0 && cand.indexOf(o) >= 0 ? -1 : o; });
            var fixedDoors = {};
            H.owner.forEach(function (o, c) { if (o < 0 || cand.indexOf(o) >= 0) return;
                for (var d = 0; d < 4; d++) { var isFront = D.front.c === c && D.front.d === d; if (isFront || D.set[edgeKey(c, d, P.C)]) { var y = Math.floor(c / P.C), x = c % P.C, yy = y + DIRS[d][0], xx = x + DIRS[d][1];
                    if (isFront || (yy >= 0 && yy < P.R && xx >= 0 && xx < P.C && H.owner[yy * P.C + xx] !== o)) { fixedDoors[c + ':' + d] = 1; if (isFront) fixedDoors[c + ':' + d + ':front'] = 1; } } } });
            var pieces = cand.map(function (room) { var pc = pieceOf(room, H, D, P); return { cells: pc.cells, doors: pc.doors, name: nm[room], room: room, at: pc.at }; });
            var L = { number: n, R: P.R, C: P.C, rotate: P.rotate, inside: inside, owner: H.owner, names: nm, front: D.front, fixedGrid: fixedGrid, fixedDoors: fixedDoors, pieces: pieces, doorSet: D.set };
            // the pieces start in a random turn (when turning is on), so the picture isn't a giveaway
            if (P.rotate) pieces.forEach(function (pc) { var t = Math.floor(r() * 4); for (var i = 0; i < t; i++) { var rr = rotate(pc); pc.cells = rr.cells; pc.doors = rr.doors; } pc.turns = t; });
            if (countSolutions(L) !== 1) continue;
            L.attempts = attempt;
            return L;
        }
        return null;
    }

    var api = { generate: generate, plan: plan, rotate: rotate, orientations: orientations, problems: problems, countSolutions: countSolutions, DIRS: DIRS, edgeKey: edgeKey };
    root.MovingIn = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
