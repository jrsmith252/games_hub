/* Kingdoms: puzzle generator and solver.
   Rules: an N x N board is split into N coloured kingdoms. Place N crowns so that every row,
   every column and every kingdom has exactly one, and no two crowns touch (not even corner to corner).

   Every puzzle is checked to have exactly one answer, and to be solvable step by step with
   the reasoning a person uses (no guessing). The same solver explains each step for hints.
   Works in the browser (window.KingdomsEngine) and in Node (module.exports). */
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
    function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

    // ---------- level plan ----------
    function sizeFor(n) { return n <= 3 ? 5 : n <= 10 ? 6 : n <= 25 ? 7 : n <= 50 ? 8 : 9; }
    // Every 5th level from 10 is a tough one: it needs the harder reasoning
    function isTough(n) { return n >= 10 && n % 5 === 0; }
    // Highest reasoning level a puzzle may need, and the level it should need
    function wantLevel(n) {
        if (n <= 3) return { max: 1, min: 1 };
        if (isTough(n)) return { max: 3, min: 3 };
        if (n <= 25) return { max: 2, min: 2 };
        // From 26, every other level needs the harder reasoning too
        return { max: 3, min: n % 2 === 0 ? 3 : 2 };
    }

    // ---------- building a board ----------
    // Crowns with one per row and column, none touching (rows next to each other differ by 2+ columns)
    function randomCrowns(N, r) {
        var cols = [], used = [];
        (function rec(row) {
            if (row === N) return true;
            var order = shuffle(range(N), r);
            for (var k = 0; k < N; k++) {
                var c = order[k];
                if (used[c] || (row > 0 && Math.abs(c - cols[row - 1]) < 2)) continue;
                used[c] = true; cols[row] = c;
                if (rec(row + 1)) return true;
                used[c] = false;
            }
            return false;
        })(0);
        return cols;
    }
    function nbrs4(N, i) {
        var r = Math.floor(i / N), c = i % N, out = [];
        if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N);
        if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1);
        return out;
    }
    // Grow one kingdom from each crown. Uneven growth rates give a mix of big and small kingdoms.
    function growRegions(N, cols, r) {
        var reg = []; for (var i = 0; i < N * N; i++) reg.push(-1);
        for (var k = 0; k < N; k++) reg[k * N + cols[k]] = k;
        var w = []; for (k = 0; k < N; k++) w.push(0.15 + r() * r() * 3);
        var left = N * N - N;
        while (left > 0) {
            var front = []; for (k = 0; k < N; k++) front.push([]);
            for (i = 0; i < N * N; i++) if (reg[i] === -1) {
                var ns = nbrs4(N, i);
                for (var q = 0; q < ns.length; q++) if (reg[ns[q]] >= 0 && front[reg[ns[q]]].indexOf(i) < 0) front[reg[ns[q]]].push(i);
            }
            var tot = 0; for (k = 0; k < N; k++) if (front[k].length) tot += w[k];
            var x = r() * tot, pick = -1;
            for (k = 0; k < N; k++) if (front[k].length) { x -= w[k]; pick = k; if (x <= 0) break; }
            var cell = front[pick][Math.floor(r() * front[pick].length)];
            reg[cell] = pick; left--;
        }
        return reg;
    }
    function countSingles(N, reg) {
        var c = {}; reg.forEach(function (g) { c[g] = (c[g] || 0) + 1; });
        return Object.keys(c).filter(function (k) { return c[k] === 1; }).length;
    }
    // Find a solution other than `not` (or any solution when `not` is null). Returns cols array or null.
    function findSolution(N, reg, not) {
        var cols = [], usedC = 0, usedR = 0, found = null;
        (function rec(row) {
            if (found) return;
            if (row === N) {
                if (!not || cols.some(function (c, i) { return c !== not[i]; })) found = cols.slice();
                return;
            }
            for (var c = 0; c < N; c++) {
                if (usedC & (1 << c)) continue;
                var g = reg[row * N + c];
                if (usedR & (1 << g)) continue;
                if (row > 0 && Math.abs(c - cols[row - 1]) < 2) continue;
                cols[row] = c; usedC |= 1 << c; usedR |= 1 << g;
                rec(row + 1);
                usedC &= ~(1 << c); usedR &= ~(1 << g);
                if (found) return;
            }
        })(0);
        return found;
    }
    function countSolutions(N, reg, cap) {
        var cols = [], usedC = 0, usedR = 0, count = 0;
        (function rec(row) {
            if (count >= cap) return;
            if (row === N) { count++; return; }
            for (var c = 0; c < N; c++) {
                if (usedC & (1 << c)) continue;
                var g = reg[row * N + c];
                if (usedR & (1 << g)) continue;
                if (row > 0 && Math.abs(c - cols[row - 1]) < 2) continue;
                cols[row] = c; usedC |= 1 << c; usedR |= 1 << g;
                rec(row + 1);
                usedC &= ~(1 << c); usedR &= ~(1 << g);
            }
        })(0);
        return count;
    }
    function connectedWithout(N, reg, k, skip) {
        var cells = []; for (var i = 0; i < N * N; i++) if (reg[i] === k && i !== skip) cells.push(i);
        if (!cells.length) return false;
        var seen = {}; seen[cells[0]] = 1; var stack = [cells[0]], n = 1;
        while (stack.length) {
            var x = stack.pop(), ns = nbrs4(N, x);
            for (var q = 0; q < ns.length; q++) { var y = ns[q]; if (y !== skip && reg[y] === k && !seen[y]) { seen[y] = 1; n++; stack.push(y); } }
        }
        return n === cells.length;
    }
    // Reshape kingdoms until the intended crowns are the only answer
    function makeUnique(N, reg, sol, r) {
        var seeds = {}; for (var k = 0; k < N; k++) seeds[k * N + sol[k]] = 1;
        for (var it = 0; it < 400; it++) {
            var alt = findSolution(N, reg, sol);
            if (!alt) return true;
            // Move one of the other answer's crown squares into a neighbouring kingdom:
            // that kingdom then holds two of its crowns, so that answer stops working.
            var rows = shuffle(range(N).filter(function (rw) { return alt[rw] !== sol[rw]; }), r), moved = false;
            for (var a = 0; a < rows.length && !moved; a++) {
                var x = rows[a] * N + alt[rows[a]];
                if (seeds[x]) continue;
                var opts = shuffle(nbrs4(N, x).map(function (y) { return reg[y]; }).filter(function (g) { return g !== reg[x]; }), r);
                if (!opts.length || !connectedWithout(N, reg, reg[x], x)) continue;
                reg[x] = opts[0]; moved = true;
            }
            if (!moved) return false;
        }
        return false;
    }

    // ---------- the human solver ----------
    function groupsOf(N, reg) {
        var g = [];
        for (var r = 0; r < N; r++) g.push({ kind: 'row', idx: r, cells: range(N).map(function (c) { return r * N + c; }) });
        for (var c = 0; c < N; c++) g.push({ kind: 'col', idx: c, cells: range(N).map(function (rr) { return rr * N + c; }) });
        for (var k = 0; k < N; k++) g.push({ kind: 'region', idx: k, cells: range(N * N).filter(function (i) { return reg[i] === k; }) });
        return g;
    }
    // Names in reasons use placeholders the page fills in: {R3} kingdom 3, {r2} row 2, {c4} column 4
    function gname(g) { return g.kind === 'row' ? '{r' + g.idx + '}' : g.kind === 'col' ? '{c' + g.idx + '}' : '{R' + g.idx + '}'; }
    // Squares a crown at i rules out (its row, column, kingdom and the eight around it)
    function shadow(pz, i) {
        var N = pz.N, r = Math.floor(i / N), c = i % N, out = [];
        for (var j = 0; j < N * N; j++) {
            if (j === i) continue;
            var rr = Math.floor(j / N), cc = j % N;
            if (rr === r || cc === c || pz.reg[j] === pz.reg[i] || (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1)) out.push(j);
        }
        return out;
    }
    function newState(pz) { var s = { cand: [], crown: [] }; for (var i = 0; i < pz.N * pz.N; i++) { s.cand.push(true); s.crown.push(false); } return s; }
    function placeCrown(pz, s, i) { s.crown[i] = true; s.cand[i] = false; shadow(pz, i).forEach(function (j) { s.cand[j] = false; }); }
    function groupHasCrown(s, g) { return g.cells.some(function (i) { return s.crown[i]; }); }
    function candsIn(s, g) { return g.cells.filter(function (i) { return s.cand[i]; }); }
    function rowOf(pz, i) { return Math.floor(i / pz.N); }
    function colOf(pz, i) { return i % pz.N; }
    function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
    // Several groups as one placeholder: {rs1.2.3} rows, {cs0.4} columns, otherwise a list of kingdoms
    function groupList(gs) {
        var kind = gs[0].kind, idx = gs.map(function (g) { return g.idx; }).sort(function (a, b) { return a - b; });
        if (kind === 'row') return '{rs' + idx.join('.') + '}';
        if (kind === 'col') return '{cs' + idx.join('.') + '}';
        return listNames(gs.map(gname));
    }
    function listNames(names) { return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }

    // The next deduction from state s, or null. { kind: 'crown'|'x', cells, why, level }
    function nextStep(pz, s, maxLevel) {
        var N = pz.N, G = pz.groups, gi, g, c;
        // Level 1: a row, column or kingdom with only one square left
        for (gi = 0; gi < G.length; gi++) {
            g = G[gi]; if (groupHasCrown(s, g)) continue;
            c = candsIn(s, g);
            if (c.length === 1) return { kind: 'crown', cells: c, level: 1, why: cap(gname(g)) + ' has only one square left, so its crown goes there.' };
        }
        if (maxLevel < 2) return null;
        // Level 2: a kingdom squeezed into one row/column (or a row/column into one kingdom)
        for (gi = 0; gi < G.length; gi++) {
            g = G[gi]; if (groupHasCrown(s, g)) continue;
            c = candsIn(s, g); if (c.length < 2) continue;
            var lines = g.kind === 'region' ? ['row', 'col'] : ['region'];
            for (var li = 0; li < lines.length; li++) {
                var kind = lines[li];
                var keys = uniq(c.map(function (i) { return kind === 'row' ? rowOf(pz, i) : kind === 'col' ? colOf(pz, i) : pz.reg[i]; }));
                if (keys.length !== 1) continue;
                var other = G.filter(function (h) { return h.kind === kind && h.idx === keys[0]; })[0];
                var out = candsIn(s, other).filter(function (i) { return g.cells.indexOf(i) < 0; });
                if (!out.length) continue;
                return { kind: 'x', cells: out, level: 2, focus: c,
                    why: 'Every square left in ' + gname(g) + ' is in ' + gname(other) + ', so ' +
                        (g.kind === 'region' ? gname(g) + '\'s crown will be the one in ' + gname(other) : gname(other) + '\'s crown will be in ' + gname(g)) +
                        '. Cross out the rest of ' + gname(other) + '.' };
            }
        }
        // Level 2: a square whose crown would leave some row, column or kingdom with nowhere to go
        for (var i = 0; i < N * N; i++) {
            if (!s.cand[i]) continue;
            var sh = shadow(pz, i), gone = {}; sh.forEach(function (j) { gone[j] = 1; }); gone[i] = 1;
            for (gi = 0; gi < G.length; gi++) {
                g = G[gi]; if (groupHasCrown(s, g) || g.cells.indexOf(i) >= 0) continue;
                c = candsIn(s, g);
                if (c.length && c.every(function (j) { return gone[j]; }))
                    return { kind: 'x', cells: [i], level: 2, focus: c, why: 'A crown here would rule out every square left in ' + gname(g) + ', so it can\'t go here.' };
            }
        }
        if (maxLevel < 3) return null;
        // Level 3: k kingdoms that only fit in k rows (or columns), or k rows/columns that only reach k kingdoms
        var pairs = [['region', 'row'], ['region', 'col'], ['row', 'region'], ['col', 'region']];
        for (var pi = 0; pi < pairs.length; pi++) {
            var A = G.filter(function (h) { return h.kind === pairs[pi][0] && !groupHasCrown(s, h); });
            var B = pairs[pi][1];
            var keyOf = function (i) { return B === 'row' ? rowOf(pz, i) : B === 'col' ? colOf(pz, i) : pz.reg[i]; };
            var info = A.map(function (h) { return { g: h, keys: uniq(candsIn(s, h).map(keyOf)) }; });
            var maxK = Math.min(A.length - 1, Math.floor(N / 2));
            for (var k = 2; k <= maxK; k++) {
                var res = subsetSearch(info, k, function (set) {
                    var keys = uniq([].concat.apply([], set.map(function (x) { return x.keys; })));
                    if (keys.length !== k) return null;
                    var inSet = {}; set.forEach(function (x) { x.g.cells.forEach(function (j) { inSet[j] = 1; }); });
                    var others = G.filter(function (h) { return h.kind === B && keys.indexOf(h.idx) >= 0; });
                    var out = [];
                    others.forEach(function (h) { candsIn(s, h).forEach(function (j) { if (!inSet[j]) out.push(j); }); });
                    if (!out.length) return null;
                    var an = groupList(set.map(function (x) { return x.g; })), bn = groupList(others);
                    var focus = []; set.forEach(function (x) { candsIn(s, x.g).forEach(function (j) { focus.push(j); }); });
                    return { kind: 'x', cells: uniq(out), level: 3, focus: focus,
                        why: cap(an) + ' only have squares left in ' + bn + ', so between them their ' + k + ' crowns are the ones for ' + bn +
                            '. Cross out everything else in ' + bn + '.' };
                });
                if (res) return res;
            }
        }
        return null;
    }
    function subsetSearch(items, k, test) {
        var pick = [], found = null;
        (function rec(start) {
            if (found) return;
            if (pick.length === k) { found = test(pick.slice()); return; }
            for (var i = start; i < items.length && !found; i++) { pick.push(items[i]); rec(i + 1); pick.pop(); }
        })(0);
        return found;
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function applyStep(pz, s, st) {
        if (st.kind === 'crown') placeCrown(pz, s, st.cells[0]);
        else st.cells.forEach(function (i) { s.cand[i] = false; });
    }
    // Solve from scratch with human steps; returns { solved, level, steps, hard }
    function solveHuman(pz, maxLevel) {
        var s = newState(pz), level = 0, steps = 0, hard = 0;
        for (var guard = 0; guard < 500; guard++) {
            if (s.crown.filter(Boolean).length === pz.N) break;
            var st = nextStep(pz, s, maxLevel);
            if (!st) break;
            level = Math.max(level, st.level); steps++; if (st.level === 3) hard++;
            applyStep(pz, s, st);
        }
        var ok = s.crown.filter(Boolean).length === pz.N && pz.sol.every(function (c, r) { return s.crown[r * pz.N + c]; });
        return { solved: ok, level: level, steps: steps, hard: hard };
    }

    // ---------- generate ----------
    var cache = {};
    function generate(n) {
        if (cache[n]) return cache[n];
        var N = sizeFor(n), want = wantLevel(n), r = rng(n * 7919 + 17), best = null;
        for (var attempt = 0; attempt < 400; attempt++) {
            var sol = randomCrowns(N, r);
            var reg = growRegions(N, sol, r);
            // Lots of one-square kingdoms make it too easy (each is a free crown)
            if (n > 3 && countSingles(N, reg) > 1) continue;
            if (!makeUnique(N, reg, sol, r)) continue;
            var pz = { number: n, N: N, reg: reg, sol: sol, tough: isTough(n) };
            pz.groups = groupsOf(N, reg);
            var res = solveHuman(pz, want.max);
            if (!res.solved) continue;
            pz.level = res.level; pz.steps = res.steps; pz.attempts = attempt + 1;
            if (res.level >= want.min) { best = pz; break; }
            if (!best) best = pz;   // fallback: easier than planned, but still fair
        }
        if (!best) throw new Error('Kingdoms: no puzzle for level ' + n);
        cache[n] = best;
        return best;
    }

    // ---------- play helpers (marks: 0 empty, 1 cross, 2 crown) ----------
    function isSolved(pz, marks) {
        for (var i = 0; i < pz.N * pz.N; i++) {
            var want = pz.sol[Math.floor(i / pz.N)] === i % pz.N;
            if (want !== (marks[i] === 2)) return false;
        }
        return true;
    }
    // Squares breaking a rule: two crowns in a row/column/kingdom, or crowns touching
    function conflicts(pz, marks) {
        var N = pz.N, bad = {}, crowns = [];
        for (var i = 0; i < N * N; i++) if (marks[i] === 2) crowns.push(i);
        for (var a = 0; a < crowns.length; a++) for (var b = a + 1; b < crowns.length; b++) {
            var x = crowns[a], y = crowns[b];
            var rx = Math.floor(x / N), ry = Math.floor(y / N), cx = x % N, cy = y % N;
            if (rx === ry || cx === cy || pz.reg[x] === pz.reg[y] || (Math.abs(rx - ry) <= 1 && Math.abs(cx - cy) <= 1)) { bad[x] = 1; bad[y] = 1; }
        }
        return Object.keys(bad).map(Number);
    }
    // Next useful step from the player's marks: a wrong mark first, otherwise the next deduction
    function hint(pz, marks) {
        var N = pz.N, i;
        function isSol(i) { return pz.sol[Math.floor(i / N)] === i % N; }
        // Wrong crowns first (a wrong crown's auto-crosses can hide the right square)
        for (i = 0; i < N * N; i++) if (marks[i] === 2 && !isSol(i)) return { mistake: true, cells: [i], why: 'This crown can\'t be right. Take it off and look again.' };
        for (i = 0; i < N * N; i++) if (marks[i] === 1 && isSol(i)) return { mistake: true, cells: [i], why: 'This square is crossed out, but a crown belongs here. Clear the cross and look again.' };
        var s = newState(pz);
        for (i = 0; i < N * N; i++) if (marks[i] === 1) s.cand[i] = false;
        for (i = 0; i < N * N; i++) if (marks[i] === 2) placeCrown(pz, s, i);
        // Squares already ruled out by the player's crowns but not yet crossed
        var implied = [];
        for (i = 0; i < N * N; i++) if (marks[i] === 0 && !s.cand[i] && !s.crown[i]) implied.push(i);
        var st = nextStep(pz, s, 3);
        if (st) return { mistake: false, kind: st.kind, cells: st.cells, focus: st.focus || [], why: st.why };
        if (implied.length) return { mistake: false, kind: 'x', cells: implied, focus: [], why: 'These squares share a row, column or kingdom with one of your crowns, or touch it, so they can be crossed out.' };
        return null;
    }

    var api = { generate: generate, sizeFor: sizeFor, isTough: isTough, isSolved: isSolved, conflicts: conflicts, hint: hint,
                countSolutions: countSolutions, solveHuman: solveHuman, shadow: shadow };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.KingdomsEngine = api;
})(this);
