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
        easy: { n: [5, 6], W: 5, H: 5, maxRegion: 3, blank: 0.1, exact: 0.6, trial: false },
        medium: { n: [7, 8], W: 6, H: 6, maxRegion: 4, blank: 0.2, exact: 0.45, trial: false },
        hard: { n: [10, 11], W: 6, H: 7, maxRegion: 4, blank: 0.25, exact: 0.35, trial: true }
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


    // ---------- solving by reasoning alone ----------
    // Works the way a person does, with no blind guessing:
    //  - each square keeps a list of numbers it could still be; a rule crosses off numbers that can't fit
    //    (a total of 3 over two squares rules out anything above 3; "all the same" needs a number every square can take)
    //  - a square that can only join one neighbour must join it; a domino that only fits one place goes there;
    //    if every place a domino can go covers a square, nothing else can go on that square
    //  - with `trial` on (Hard), it may also try a placement and cross it off if that leads straight to a contradiction
    // Returns { solved, stuck: [squares not worked out], trial: whether the try-it step was needed }.
    function logicSolve(p, trial) {
        var W = p.W, set = {}, pls = [], byCell = {}, byKind = [];
        p.cells.forEach(function (c) { set[c] = 1; byCell[c] = []; });
        p.dominoes.forEach(function (d, k) {
            byKind[k] = [];
            p.cells.forEach(function (a) {
                [a % W < W - 1 ? a + 1 : -1, a + W].forEach(function (b) {
                    if (b < 0 || !set[b]) return;
                    var ways = d[0] === d[1] ? [[d[0], d[1]]] : [[d[0], d[1]], [d[1], d[0]]];
                    ways.forEach(function (w) { var id = pls.length; pls.push({ k: k, a: a, b: b, va: w[0], vb: w[1] }); byCell[a].push(id); byCell[b].push(id); byKind[k].push(id); });
                });
            });
        });
        var regionRules = p.regions.filter(function (g) { return g.rule.type !== 'none'; }), ruleOf = {};
        regionRules.forEach(function (g) { g.cells.forEach(function (c) { ruleOf[c] = g; }); });
        function valAt(pl, c) { return pl.a === c ? pl.va : pl.vb; }
        function other(pl, c) { return pl.a === c ? pl.b : pl.a; }
        // alive: array of 0/1 per placement. Returns false if something is impossible.
        function propagate(alive) {
            var changed = true, guard = 0;
            function kill(id) { if (alive[id]) { alive[id] = 0; changed = true; } }
            while (changed && guard++ < 500) {
                changed = false;
                // numbers each square could still be (as bits)
                var cand = {};
                for (var ci = 0; ci < p.cells.length; ci++) { var c = p.cells[ci], m = 0; byCell[c].forEach(function (id) { if (alive[id]) m |= 1 << valAt(pls[id], c); }); if (!m) return false; cand[c] = m; }
                // rules cross off numbers
                for (var ri = 0; ri < regionRules.length; ri++) {
                    var g = regionRules[ri], rule = g.rule;
                    for (var i = 0; i < g.cells.length; i++) {
                        var c2 = g.cells[i], lo = 0, hi = 0, others = [];
                        for (var j = 0; j < g.cells.length; j++) if (j !== i) { var m2 = cand[g.cells[j]]; lo += lowBit(m2); hi += highBit(m2); others.push(m2); }
                        for (var v = 0; v <= 6; v++) {
                            if (!(cand[c2] & (1 << v))) continue;
                            var ok = rule.type === 'sum' ? v + lo <= rule.n && v + hi >= rule.n
                                : rule.type === 'lt' ? v + lo < rule.n
                                : rule.type === 'gt' ? v + hi > rule.n
                                : rule.type === 'eq' ? others.every(function (m3) { return m3 & (1 << v); })
                                : rule.type === 'ne' ? others.every(function (m3) { return m3 !== (1 << v); }) : true;
                            if (!ok) byCell[c2].forEach(function (id) { if (alive[id] && valAt(pls[id], c2) === v) kill(id); });
                        }
                    }
                }
                if (changed) continue;
                // a whole domino in one spot: would it break a rule, given what the other squares could be?
                for (var pi = 0; pi < pls.length; pi++) {
                    if (!alive[pi]) continue;
                    var pl0 = pls[pi], fixedV = {}; fixedV[pl0.a] = pl0.va; fixedV[pl0.b] = pl0.vb;
                    var regsHit = []; [pl0.a, pl0.b].forEach(function (c4) { var g4 = ruleOf[c4]; if (g4 && regsHit.indexOf(g4) < 0) regsHit.push(g4); });
                    for (var h = 0; h < regsHit.length; h++) {
                        var g5 = regsHit[h], lo5 = 0, hi5 = 0, ms = [], fv = [];
                        g5.cells.forEach(function (c5) { if (fixedV[c5] !== undefined) { lo5 += fixedV[c5]; hi5 += fixedV[c5]; fv.push(fixedV[c5]); } else { var m5 = cand[c5]; lo5 += lowBit(m5); hi5 += highBit(m5); ms.push(m5); } });
                        var t5 = g5.rule.type, n5 = g5.rule.n, bad = false;
                        if (t5 === 'sum') bad = lo5 > n5 || hi5 < n5;
                        else if (t5 === 'lt') bad = lo5 >= n5;
                        else if (t5 === 'gt') bad = hi5 <= n5;
                        else if (t5 === 'eq') bad = fv.some(function (x) { return x !== fv[0]; }) || ms.some(function (m6) { return !(m6 & (1 << fv[0])); });
                        else if (t5 === 'ne') bad = fv.length === 2 && fv[0] === fv[1] || ms.some(function (m6) { return fv.some(function (x) { return m6 === (1 << x); }); });
                        if (bad) { kill(pi); break; }
                    }
                }
                if (changed) continue;
                // squares: which neighbour, which domino
                for (ci = 0; ci < p.cells.length; ci++) {
                    var cc = p.cells[ci], live = byCell[cc].filter(function (id) { return alive[id]; });
                    if (!live.length) return false;
                    var partner = other(pls[live[0]], cc), kind = pls[live[0]].k;
                    var samePartner = live.every(function (id) { return other(pls[id], cc) === partner; });
                    var sameKind = live.every(function (id) { return pls[id].k === kind; });
                    // only one neighbour possible: that neighbour can't join anything else
                    if (samePartner) byCell[partner].forEach(function (id) { if (alive[id] && other(pls[id], partner) !== cc) kill(id); });
                    // only one domino possible here: it can't go anywhere else
                    if (sameKind) byKind[kind].forEach(function (id) { if (alive[id] && pls[id].a !== cc && pls[id].b !== cc) kill(id); });
                }
                for (var k = 0; k < byKind.length; k++) {
                    var lk = byKind[k].filter(function (id) { return alive[id]; });
                    if (!lk.length) return false;
                    // every place this domino could go covers square q: nothing else can go on q
                    [pls[lk[0]].a, pls[lk[0]].b].forEach(function (q) {
                        if (lk.every(function (id) { return pls[id].a === q || pls[id].b === q; })) byCell[q].forEach(function (id) { if (alive[id] && pls[id].k !== k) kill(id); });
                    });
                }
            }
            return true;
        }
        function lowBit(m) { for (var v = 0; v <= 6; v++) if (m & (1 << v)) return v; return 0; }
        function highBit(m) { for (var v = 6; v >= 0; v--) if (m & (1 << v)) return v; return 0; }
        function settled(alive) { return p.cells.every(function (c) { return byCell[c].filter(function (id) { return alive[id]; }).length === 1; }); }
        var alive = pls.map(function () { return 1; }), usedTrial = false;
        if (!propagate(alive)) return { solved: false, stuck: p.cells.slice(), trial: false, broken: true };
        var tries = 0;
        // the try-it step, as a person would use it: only on a square that's down to two possibilities
        while (trial && !settled(alive) && tries < 80) {
            var progress = false;
            var two = {}; p.cells.forEach(function (c) { if (byCell[c].filter(function (x) { return alive[x]; }).length === 2) two[c] = 1; });
            for (var id = 0; id < pls.length && !progress && tries < 80; id++) {
                if (!alive[id] || !(two[pls[id].a] || two[pls[id].b])) continue;
                tries++;
                var test = alive.slice(), pl = pls[id];
                // assume this placement: everything clashing with it goes
                for (var q = 0; q < pls.length; q++) if (q !== id && test[q] && (pls[q].k === pl.k || pls[q].a === pl.a || pls[q].a === pl.b || pls[q].b === pl.a || pls[q].b === pl.b)) test[q] = 0;
                if (!propagate(test)) { alive[id] = 0; usedTrial = true; progress = true; if (!propagate(alive)) return { solved: false, stuck: p.cells.slice(), trial: true, broken: true }; }
            }
            if (!progress) break;
        }
        var stuck = p.cells.filter(function (c) { return byCell[c].filter(function (id) { return alive[id]; }).length !== 1; });
        var result = { solved: !stuck.length, stuck: stuck, trial: usedTrial };
        if (result.solved) { result.values = {}; p.cells.forEach(function (c) { var id = byCell[c].filter(function (x) { return alive[x]; })[0]; result.values[c] = valAt(pls[id], c); }); }
        return result;
    }

    // ---------- maker ----------
    function make(seed, level, batch) {
        var L = LEVELS[level] || LEVELS.easy;
        // make a batch and keep the most interesting: few single-square regions, a good mix of rule types
        var best = null, bestScore = 1e9, made = 0;
        for (var attempt = 0; attempt < (batch || 25) * 5 && made < (batch || 25); attempt++) {
            var r = rng(seed * 31 + attempt * 7919 + 1), p = tryMake(r, L);
            if (!p) continue; made++;
            var sc = quality(p) - (L.trial && p.trial ? 4 : 0);
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
        // 6. tighten rules until the whole board can be worked out by reasoning alone (so there's exactly one answer)
        var dominoes = shuffle(tiles.map(function (t) { return r() < 0.5 ? [val[t[0]], val[t[1]]] : [val[t[1]], val[t[0]]]; }), r);
        var p = { W: W, H: H, cells: cells, regions: regions, dominoes: dominoes }, res;
        for (var step = 0; ; step++) {
            res = logicSolve(p, L.trial);
            if (res.broken || step > 60) return null;
            if (res.solved) break;
            // tighten a rule next to the squares that couldn't be worked out
            var stuck = {}; res.stuck.forEach(function (c) { stuck[c] = -1; });
            var other = {}; p.cells.forEach(function (c) { other[c] = stuck[c] === -1 ? -1 : val[c]; });
            if (!tighten(p, val, r, other)) return null;
        }
        // reasoning must arrive at the answer we laid out (a safety check on the solver)
        if (p.cells.some(function (c) { return res.values[c] !== val[c]; })) return null;
        var needTrial = res.trial;
        var minX = W, minY = H, maxX = 0, maxY = 0;
        cells.forEach(function (c) { var x = c % W, y = Math.floor(c / W); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
        // trim the board to the squares used
        var nw = maxX - minX + 1, nh = maxY - minY + 1, map = function (c) { return (Math.floor(c / W) - minY) * nw + (c % W - minX); };
        var ans = {}; cells.forEach(function (c) { ans[map(c)] = val[c]; });
        return { W: nw, H: nh, cells: cells.map(map).sort(function (x, y) { return x - y; }),
            regions: regions.map(function (g) { return { cells: g.cells.map(map).sort(function (x, y) { return x - y; }), rule: g.rule }; }),
            dominoes: dominoes, answer: ans, trial: needTrial };
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

    // ---------- compact text form, for the puzzle bank ----------
    // "W H|squares|rules|dominoes": a square is one character (code 48 + index); each rule is a letter, a number
    // character and its squares; dominoes are pairs of digits.
    var RT = { sum: 's', eq: 'e', ne: 'n', lt: 'l', gt: 'g', none: 'x' }, TR = { s: 'sum', e: 'eq', n: 'ne', l: 'lt', g: 'gt', x: 'none' };
    function ch(n) { return String.fromCharCode(48 + n); }
    function un(c) { return c.charCodeAt(0) - 48; }
    function encode(p) {
        return p.W + ' ' + p.H + '|' + p.cells.map(ch).join('') + '|' +
            p.regions.map(function (g) { return RT[g.rule.type] + ch(g.rule.n || 0) + g.cells.map(ch).join(''); }).join(' ') + '|' +
            p.dominoes.map(function (d) { return '' + d[0] + d[1]; }).join('');
    }
    function decode(str) {
        var parts = str.split('|'), wh = parts[0].split(' ');
        return { W: +wh[0], H: +wh[1], cells: parts[1].split('').map(un),
            regions: parts[2].split(' ').map(function (t) { var type = TR[t[0]], rule = { type: type }; if (type === 'sum' || type === 'lt' || type === 'gt') rule.n = un(t[1]); return { rule: rule, cells: t.slice(2).split('').map(un) }; }),
            dominoes: parts[3].match(/../g).map(function (x) { return [+x[0], +x[1]]; }) };
    }
    var api = { encode: encode, decode: decode, VERSION: 2, logicSolve: logicSolve, LEVELS: LEVELS, check: check, countSolutions: countSolutions, make: make, daily: daily, dayNumber: dayNumber };
    root.SpotOn = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
