/* Spot On puzzle maker and solver.
   A puzzle is an odd-shaped board of squares, a set of dominoes (each half 0-6 spots, no two the same) that exactly
   covers it, and coloured regions with rules: an exact total, "all equal", "all different", "less than" or "more than".
   The maker lays the dominoes out first, so there's always an answer, then adds rules until the spots on every square
   can only be filled in one way. Puzzles are seeded, so a day's puzzles are the same for everyone. */
(function (root) {
    'use strict';
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var LEVELS = {
        easy: { n: [5, 6], W: 5, H: 5, maxRegion: 3, blank: 0.1, exact: 0.6, answers: 3 },
        medium: { n: [7, 8], W: 6, H: 6, maxRegion: 4, blank: 0.2, exact: 0.45, answers: 2 },
        hard: { n: [10, 11], W: 6, H: 7, maxRegion: 4, blank: 0.25, exact: 0.35, answers: 2 }
    };
    // all 28 dominoes of a double-six set, as [low, high]
    var SET = []; for (var a = 0; a <= 6; a++) for (var b = a; b <= 6; b++) SET.push([a, b]);

    // ---------- checking a region against its rule (empty squares are null) ----------
    function check(rule, vals) {
        var s = 0, k = 0, seen = {}, first = null, i, v;
        for (i = 0; i < vals.length; i++) { v = vals[i]; if (v === null || v === undefined) { k++; continue; } s += v; }
        var full = k === 0;
        switch (rule.type) {
            case 'sum': if (s > rule.n || s + 6 * k < rule.n) return 'bad'; return full ? 'ok' : 'open';
            case 'lt': if (s >= rule.n) return 'bad'; return full ? 'ok' : 'open';
            case 'gt': if (s + 6 * k <= rule.n) return 'bad'; return full ? (s > rule.n ? 'ok' : 'bad') : 'open';
            case 'eq': for (i = 0; i < vals.length; i++) { v = vals[i]; if (v === null || v === undefined) continue; if (first === null) first = v; else if (v !== first) return 'bad'; } return full ? 'ok' : 'open';
            case 'ne': for (i = 0; i < vals.length; i++) { v = vals[i]; if (v === null || v === undefined) continue; if (seen[v]) return 'bad'; seen[v] = 1; } return full ? 'ok' : 'open';
            default: return full ? 'ok' : 'open';
        }
    }

    // ---------- solver: how many different ways can the spots be filled in? (stops at `limit`) ----------
    // p: { W, H, cells: [indexes], regions: [{ cells, rule }], dominoes: [[a,b]] }
    function countSolutions(p, limit, budget, fixed) {
        var W = p.W, cellSet = {}, regionOf = {}, vals = {}, used = [], count = 0, steps = 0, grids = {};
        limit = limit || 2; budget = budget || 400000;
        p.cells.forEach(function (c) { cellSet[c] = 1; vals[c] = null; });
        p.regions.forEach(function (r, ri) { r.cells.forEach(function (c) { regionOf[c] = ri; }); });
        var order = p.cells.slice().sort(function (x, y) { return x - y; });
        // dominoes of the same kind are interchangeable, so group them
        var kinds = {}, kindList = [];
        p.dominoes.forEach(function (d) { var k = Math.min(d[0], d[1]) + ',' + Math.max(d[0], d[1]); if (!kinds[k]) { kinds[k] = { a: Math.min(d[0], d[1]), b: Math.max(d[0], d[1]), n: 0 }; kindList.push(kinds[k]); } kinds[k].n++; });
        var tiles = [], tileSols = {};
        // dominoes already on the board count as placed
        var fixedOk = true;
        (fixed || []).forEach(function (f) {
            if (!fixedOk) return;
            var k2 = Math.min(f.v[0], f.v[1]) + ',' + Math.max(f.v[0], f.v[1]);
            if (!kinds[k2] || !kinds[k2].n || vals[f.a] !== null || vals[f.b] !== null) { fixedOk = false; return; }
            kinds[k2].n--; vals[f.a] = f.v[0]; vals[f.b] = f.v[1];
        });
        if (fixedOk) for (var fc in vals) if (vals[fc] !== null && !regionOk(+fc)) { fixedOk = false; break; }
        function emptyNbrs(c) { var x = c % W, out = []; if (x > 0 && cellSet[c - 1] && vals[c - 1] === null) out.push(c - 1); if (x + 1 < W && cellSet[c + 1] && vals[c + 1] === null) out.push(c + 1); if (cellSet[c - W] && vals[c - W] === null) out.push(c - W); if (cellSet[c + W] && vals[c + W] === null) out.push(c + W); return out; }
        function regionOk(c) { var ri = regionOf[c]; if (ri === undefined) return true; var r = p.regions[ri]; return check(r.rule, r.cells.map(function (x) { return vals[x]; })) !== 'bad'; }
        function go() {
            if (count >= limit || steps > budget) return;
            steps++;
            // fill the square with the fewest empty neighbours first: a square with none means a dead end
            var c = -1, nbrs = null;
            for (var i = 0; i < order.length; i++) {
                var q = order[i]; if (vals[q] !== null) continue;
                var nn = emptyNbrs(q);
                if (!nn.length) return;
                if (!nbrs || nn.length < nbrs.length) { c = q; nbrs = nn; if (nn.length === 1) break; }
            }
            if (c < 0) { var key = order.map(function (x) { return vals[x]; }).join(''); if (!grids[key]) { grids[key] = order.map(function (x) { return vals[x]; }); tileSols[key] = tiles.slice(); count++; } return; }
            for (var j = 0; j < nbrs.length; j++) {
                var d = nbrs[j];
                for (var k = 0; k < kindList.length; k++) {
                    var kd = kindList[k]; if (!kd.n) continue;
                    var opts = kd.a === kd.b ? [[kd.a, kd.b]] : [[kd.a, kd.b], [kd.b, kd.a]];
                    for (var o = 0; o < opts.length; o++) {
                        vals[c] = opts[o][0]; vals[d] = opts[o][1];
                        if (regionOk(c) && regionOk(d)) { kd.n--; tiles.push({ a: c, b: d, v: [vals[c], vals[d]] }); go(); tiles.pop(); kd.n++; }
                        vals[c] = null; vals[d] = null;
                        if (count >= limit) return;
                    }
                }
            }
        }
        if (fixedOk) go();
        var found = Object.keys(grids).map(function (k) { var g = {}; order.forEach(function (c, i) { g[c] = grids[k][i]; }); return g; });
        return { count: count, complete: steps <= budget, grids: found, tiles: Object.keys(tileSols).map(function (k) { return tileSols[k]; }) };
    }

    // ---------- maker ----------
    function make(seed, level) {
        var L = LEVELS[level] || LEVELS.easy;
        // make a batch and keep the most interesting: few single-square regions, a good mix of rule types
        var best = null, bestScore = 1e9, made = 0;
        for (var attempt = 0; attempt < 120 && made < 25; attempt++) {
            var r = rng(seed * 31 + attempt * 7919 + 1), p = tryMake(r, L);
            if (!p) continue; made++;
            var sc = quality(p);
            if (sc < bestScore) { bestScore = sc; best = p; }
        }
        if (best) { best.seed = seed; best.level = level; }
        return best;
    }
    function tryMake(r, L) {
        var W = L.W, H = L.H, n = L.n[0] + Math.floor(r() * (L.n[1] - L.n[0] + 1));
        // 1. grow a domino tiling outwards from the middle
        var taken = {}, tiles = [];
        function free(c) { var x = c % W, y = Math.floor(c / W); return x >= 0 && y >= 0 && y < H && !taken[c]; }
        function nb(c) { var x = c % W, out = []; if (x > 0) out.push(c - 1); if (x < W - 1) out.push(c + 1); if (c - W >= 0) out.push(c - W); if (c + W < W * H) out.push(c + W); return out; }
        var c0 = Math.floor(H / 2) * W + Math.floor(W / 2) - 1;
        taken[c0] = taken[c0 + 1] = 1; tiles.push([c0, c0 + 1]);
        var guard = 0;
        while (tiles.length < n && guard++ < 2000) {
            var edge = []; Object.keys(taken).forEach(function (k) { nb(+k).forEach(function (q) { if (free(q)) edge.push(q); }); });
            if (!edge.length) return null;
            var a = edge[Math.floor(r() * edge.length)], opts = nb(a).filter(free);
            if (!opts.length) continue;
            var b = opts[Math.floor(r() * opts.length)]; taken[a] = taken[b] = 1; tiles.push([a, b]);
        }
        if (tiles.length < n) return null;
        var cells = Object.keys(taken).map(Number);
        // 2. regions: connected groups of 2-4 squares (the odd single square)
        var regionOf = {}, regions = [];
        shuffle(cells.slice(), r).forEach(function (c) {
            if (regionOf[c] !== undefined) return;
            var size = r() < 0.12 ? 1 : 2 + Math.floor(r() * (L.maxRegion - 1)), group = [c]; regionOf[c] = regions.length;
            while (group.length < size) {
                var cand = []; group.forEach(function (g) { nb(g).forEach(function (q) { if (taken[q] && regionOf[q] === undefined && cand.indexOf(q) < 0) cand.push(q); }); });
                if (!cand.length) break;
                var q = cand[Math.floor(r() * cand.length)]; regionOf[q] = regions.length; group.push(q);
            }
            regions.push({ cells: group });
        });
        // 3. what kind of rule each region gets, before the spots are chosen
        regions.forEach(function (g) {
            var k = g.cells.length, x = r();
            g.kind = k === 1 ? (x < 0.5 ? 'sum' : x < 0.5 + L.blank ? 'none' : 'cmp')
                : x < 0.22 && k <= 3 ? 'eq' : x < 0.34 && k >= 3 ? 'ne' : x < 0.34 + L.blank ? 'none' : x < 0.34 + L.blank + L.exact * 0.5 ? 'sum' : 'cmp';
        });
        // 4. spots: different dominoes from the set, laid so "all equal" and "all different" regions come out right
        var val = {}, usedKind = {}, order = shuffle(tiles.slice(), r);
        function fitsKinds(c) {
            var g = regions[regionOf[c]], vs = g.cells.map(function (q) { return val[q] === undefined ? null : val[q]; });
            return g.kind === 'eq' ? check({ type: 'eq' }, vs) !== 'bad' : g.kind === 'ne' ? check({ type: 'ne' }, vs) !== 'bad' : true;
        }
        var tries = 0;
        function fill(i) {
            if (i === order.length) return true;
            if (tries++ > 20000) return false;
            var t = order[i], doms = shuffle(SET.slice(), r);
            for (var k = 0; k < doms.length; k++) {
                var d = doms[k], key = d[0] + ',' + d[1]; if (usedKind[key]) continue;
                var ways = d[0] === d[1] ? [d] : r() < 0.5 ? [d, [d[1], d[0]]] : [[d[1], d[0]], d];
                for (var w = 0; w < ways.length; w++) {
                    val[t[0]] = ways[w][0]; val[t[1]] = ways[w][1];
                    if (fitsKinds(t[0]) && fitsKinds(t[1])) { usedKind[key] = 1; if (fill(i + 1)) return true; usedKind[key] = 0; }
                    delete val[t[0]]; delete val[t[1]];
                }
            }
            return false;
        }
        if (!fill(0)) return null;
        // 5. the rules themselves, worked out from the answer
        regions.forEach(function (g) {
            var vs = g.cells.map(function (c) { return val[c]; }), sm = vs.reduce(function (a, b) { return a + b; }, 0);
            if (g.kind === 'eq' && vs.length > 1) g.rule = { type: 'eq' };
            else if (g.kind === 'ne') g.rule = { type: 'ne' };
            else if (g.kind === 'none') g.rule = { type: 'none' };
            else if (g.kind === 'sum' || g.kind === 'eq') g.rule = { type: 'sum', n: sm };
            else {
                // a comparison with a little slack; a total of 0 can only be "less than", a full house only "more than"
                var gap = 1 + Math.floor(r() * 3), max = 6 * vs.length;
                if ((r() < 0.5 && sm - gap >= 0) || sm + gap > max) g.rule = { type: 'gt', n: Math.max(0, sm - gap) };
                else g.rule = { type: 'lt', n: sm + gap };
                if (g.rule.type === 'gt' && sm === 0) g.rule = { type: 'lt', n: gap };
            }
        });
        // 6. tighten rules until there's only one way to fill in the spots
        var dominoes = shuffle(tiles.map(function (t) { return r() < 0.5 ? [val[t[0]], val[t[1]]] : [val[t[1]], val[t[0]]]; }), r);
        var p = { W: W, H: H, cells: cells, regions: regions, dominoes: dominoes };
        for (var step = 0; ; step++) {
            var res = countSolutions(p, L.answers + 1, 300000);
            if (!res.complete || step > 60) return null;
            if (res.count <= L.answers) break;
            var other = res.grids.filter(function (gr) { return p.cells.some(function (c) { return gr[c] !== val[c]; }); })[0];
            if (!tighten(p, val, r, other)) return null;
        }
        var minX = W, minY = H, maxX = 0, maxY = 0;
        cells.forEach(function (c) { var x = c % W, y = Math.floor(c / W); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
        // trim the board to the squares used
        var nw = maxX - minX + 1, nh = maxY - minY + 1, map = function (c) { return (Math.floor(c / W) - minY) * nw + (c % W - minX); };
        var ans = {}; cells.forEach(function (c) { ans[map(c)] = val[c]; });
        return { W: nw, H: nh, cells: cells.map(map).sort(function (x, y) { return x - y; }),
            regions: regions.map(function (g) { return { cells: g.cells.map(map).sort(function (x, y) { return x - y; }), rule: g.rule }; }),
            dominoes: dominoes, answer: ans };
    }
    function quality(p) {
        var sc = 0, kinds = {};
        p.regions.forEach(function (g) { var t = g.rule.type; kinds[t] = 1;
            if (g.cells.length === 1) sc += t === 'sum' ? 3 : 1.5;
            else sc += t === 'sum' ? 0.6 : t === 'none' ? 0.3 : -0.8; });
        return sc - Object.keys(kinds).length * 1.5 + p.regions.length * 0.3;
    }
    // make one rule stricter, keeping the variety: a blank region gets a comparison, a comparison gets
    // narrower, and only then does something become an exact total
    function tighten(p, val, r, other) {
        function vs(g) { return g.cells.map(function (c) { return val[c]; }); }
        function sm(g) { return vs(g).reduce(function (a, b) { return a + b; }, 0); }
        // only regions where the other answer differs are worth tightening
        var differs = function (g) { return !other || g.cells.some(function (c) { return other[c] !== val[c]; }); };
        var regs = p.regions.filter(differs); if (!regs.length) regs = p.regions;
        var blank = regs.filter(function (g) { return g.rule.type === 'none'; });
        var cmp = regs.filter(function (g) { return (g.rule.type === 'lt' && g.rule.n > sm(g) + 1) || (g.rule.type === 'gt' && g.rule.n < sm(g) - 1); });
        var exactable = regs.filter(function (g) { return g.rule.type === 'lt' || g.rule.type === 'gt'; });
        if (!exactable.length) exactable = regs.filter(function (g) { return g.rule.type === 'ne' || (g.rule.type === 'eq' && g.cells.length === 2); });
        var x = r();
        if (blank.length && (x < 0.4 || (!cmp.length && x < 0.7))) {
            var g = blank[Math.floor(r() * blank.length)], s = sm(g);
            g.rule = vs(g).length > 1 && vs(g).every(function (v) { return v === vs(g)[0]; }) ? { type: 'eq' } : s === 0 ? { type: 'lt', n: 1 } : s >= 6 * g.cells.length ? { type: 'gt', n: s - 1 } : r() < 0.5 ? { type: 'lt', n: s + 1 } : { type: 'gt', n: s - 1 };
            return true;
        }
        if (cmp.length && x < 0.8) { var h = cmp[Math.floor(r() * cmp.length)], t = sm(h); h.rule = h.rule.type === 'lt' ? { type: 'lt', n: t + 1 } : { type: 'gt', n: t - 1 }; return true; }
        var pool = exactable.length ? exactable : blank;
        if (!pool.length) {
            // everything here is already exact: split a region in two, each with its own total
            var big = regs.filter(function (g) { return g.cells.length > 1; }).sort(function (a, b) { return b.cells.length - a.cells.length; });
            for (var bi = 0; bi < big.length; bi++) {
                var bg = big[bi];
                for (var tries = 0; tries < 12; tries++) {
                    var cs = shuffle(bg.cells.slice(), r), part = [cs[0]];
                    var want = 1 + Math.floor(r() * (cs.length - 1));
                    while (part.length < want) { var add = cs.filter(function (c) { return part.indexOf(c) < 0 && part.some(function (q) { return q === c - 1 || q === c + 1 || q === c - p.W || q === c + p.W; }); }); if (!add.length) break; part.push(add[0]); }
                    var rest = bg.cells.filter(function (c) { return part.indexOf(c) < 0; });
                    if (!rest.length || !connected(part, p.W) || !connected(rest, p.W)) continue;
                    var tot = function (q) { return q.reduce(function (a, c) { return a + val[c]; }, 0); };
                    bg.cells = part; bg.rule = { type: 'sum', n: tot(part) };
                    p.regions.push({ cells: rest, rule: { type: 'sum', n: tot(rest) } });
                    return true;
                }
            }
            return false;
        }
        var e = pool[Math.floor(r() * pool.length)]; e.rule = { type: 'sum', n: sm(e) };
        return true;
    }
    function connected(cs, W) {
        if (!cs.length) return false;
        var seen = {}, stack = [cs[0]], set = {}; cs.forEach(function (c) { set[c] = 1; }); seen[cs[0]] = 1;
        while (stack.length) { var c = stack.pop(), x = c % W; [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W].forEach(function (q) { if (q >= 0 && set[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }); }
        return Object.keys(seen).length === cs.length;
    }
    // the daily puzzle number: #1 was 19 Nov 2026 (by the phone's own date)
    var EPOCH = Date.UTC(2026, 10, 19);
    function dayNumber(d) { d = d || new Date(); var t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); return Math.floor((t - EPOCH) / 86400000) + 1; }
    function daily(day, level) { return make(900001 + day * 3 + (level === 'easy' ? 0 : level === 'medium' ? 1 : 2), level); }

    var api = { VERSION: 1, LEVELS: LEVELS, check: check, countSolutions: countSolutions, make: make, daily: daily, dayNumber: dayNumber };
    root.SpotOn = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
