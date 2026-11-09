/* Leaf & Drop: puzzle generator and solver.
   Rules: fill every square with one of two symbols so that
     - each row and each column has the same number of each symbol,
     - no more than two of the same symbol sit next to each other in a row or column,
     - squares joined by "=" are the same, squares joined by "×" are different.
   Every puzzle is built so it can be solved one deduction at a time (which also means it
   has exactly one answer). The same solver explains each step for hints.
   Symbols are 0 and 1; reasons use {A}/{B} (one) and {As}/{Bs} (several), {r2} row, {c3} column. */
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

    // ---------- level plan ----------
    function sizeFor(n) { return n <= 25 ? 6 : n % 2 === 0 ? 8 : 6; }
    function isTough(n) { return n >= 10 && n % 5 === 0; }
    // Spare clues left in on top of the minimum (more = gentler), and whether the level must need line reasoning
    function plan(n) {
        if (n <= 2) return { spare: 6, needHard: false, maxLevel: 1 };
        if (n <= 5) return { spare: 3, needHard: false, maxLevel: 1 };
        if (isTough(n)) return { spare: 0, needHard: true, maxLevel: 2, minHard: sizeFor(n) === 8 ? 8 : 5 };
        if (n <= 12) return { spare: 2, needHard: n % 2 === 0, maxLevel: 2, minHard: 1 };
        return { spare: n <= 30 ? 1 : 0, needHard: true, maxLevel: 2, minHard: 1 };
    }

    // ---------- lines ----------
    var lineCache = {};
    // Every valid way to fill a line of length N (as arrays of 0/1)
    function allLines(N) {
        if (lineCache[N]) return lineCache[N];
        var out = [];
        for (var m = 0; m < (1 << N); m++) {
            var a = [], ones = 0, ok = true;
            for (var i = 0; i < N; i++) { a.push((m >> i) & 1); ones += a[i]; }
            if (ones !== N / 2) continue;
            for (i = 2; i < N && ok; i++) if (a[i] === a[i - 1] && a[i] === a[i - 2]) ok = false;
            if (ok) out.push(a);
        }
        return (lineCache[N] = out);
    }
    function lineCells(N, kind, idx) {
        var c = []; for (var k = 0; k < N; k++) c.push(kind === 'row' ? idx * N + k : k * N + idx); return c;
    }

    // ---------- a full answer ----------
    function randomGrid(N, r) {
        var lines = allLines(N), g = [];
        // fill row by row, checking columns as we go
        function colsOk(rows) {
            for (var c = 0; c < N; c++) {
                var ones = 0, zeros = 0;
                for (var k = 0; k < rows.length; k++) {
                    var v = rows[k][c]; if (v) ones++; else zeros++;
                    if (k >= 2 && v === rows[k - 1][c] && v === rows[k - 2][c]) return false;
                }
                if (ones > N / 2 || zeros > N / 2) return false;
            }
            return true;
        }
        var rows = [];
        (function rec() {
            if (rows.length === N) return true;
            var order = shuffle(lines.slice(), r);
            for (var i = 0; i < order.length; i++) {
                rows.push(order[i]);
                if (colsOk(rows) && rec()) return true;
                rows.pop();
            }
            return false;
        })();
        rows.forEach(function (row) { row.forEach(function (v) { g.push(v); }); });
        return g;
    }

    // ---------- the human solver ----------
    // pz: { N, given[], signs: [{a, b, t:'eq'|'x'}] }; v: current values (-1 unknown)
    function makeLines(N) {
        var L = [];
        for (var i = 0; i < N; i++) L.push({ kind: 'row', idx: i, cells: lineCells(N, 'row', i) });
        for (i = 0; i < N; i++) L.push({ kind: 'col', idx: i, cells: lineCells(N, 'col', i) });
        return L;
    }
    function lname(l) { return '{' + (l.kind === 'row' ? 'r' : 'c') + l.idx + '}'; }
    function sym(v, many) { return '{' + (v ? 'B' : 'A') + (many ? 's' : '') + '}'; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // Next deduction: { sets: [[cell, value], ...], why, level, focus }
    function nextStep(pz, v, maxLevel) {
        var N = pz.N, L = pz.lines, i, s;
        // Level 1a: signs
        for (i = 0; i < pz.signs.length; i++) {
            s = pz.signs[i];
            var va = v[s.a], vb = v[s.b];
            if ((va < 0) === (vb < 0)) continue;
            var known = va >= 0 ? s.a : s.b, other = va >= 0 ? s.b : s.a, kv = v[known];
            var nv = s.t === 'eq' ? kv : 1 - kv;
            return { sets: [[other, nv]], level: 1, focus: [known],
                why: s.t === 'eq' ? 'The = sign means these two squares match, so this one is ' + sym(nv) + ' too.'
                                  : 'The × sign means these two squares are different, so this one is ' + sym(nv) + '.' };
        }
        // Level 1b: never three in a row
        for (var li = 0; li < L.length; li++) {
            var c = L[li].cells;
            for (var k = 0; k + 2 < N; k++) {
                var a = v[c[k]], b = v[c[k + 1]], d = v[c[k + 2]];
                // two the same, then a gap on either end
                if (a >= 0 && a === b && d < 0) return pairStep(c[k + 2], 1 - a, [c[k], c[k + 1]]);
                if (b >= 0 && b === d && a < 0) return pairStep(c[k], 1 - b, [c[k + 1], c[k + 2]]);
                // same, gap, same: the gap must differ
                if (a >= 0 && a === d && b < 0)
                    return { sets: [[c[k + 1], 1 - a]], level: 1, focus: [c[k], c[k + 2]],
                        why: 'Two ' + sym(a, true) + ' with a gap between them: a third ' + sym(a) + ' in the middle would make three in a row, so it\'s ' + sym(1 - a) + '.' };
            }
        }
        // Level 1c: a line that already has half of one symbol
        for (li = 0; li < L.length; li++) {
            c = L[li].cells;
            var cnt = [0, 0], empty = [];
            c.forEach(function (x) { if (v[x] >= 0) cnt[v[x]]++; else empty.push(x); });
            if (!empty.length) continue;
            for (var sv = 0; sv < 2; sv++) if (cnt[sv] === N / 2)
                return { sets: empty.map(function (x) { return [x, 1 - sv]; }), level: 1, focus: c.filter(function (x) { return v[x] === sv; }),
                    why: cap(lname(L[li])) + ' already has its ' + (N / 2) + ' ' + sym(sv, true) + ', so the rest are ' + sym(1 - sv, true) + '.' };
        }
        if (maxLevel < 2) return null;
        // Level 2: every way to finish a line agrees on a square
        for (li = 0; li < L.length; li++) {
            c = L[li].cells;
            if (c.every(function (x) { return v[x] >= 0; })) continue;
            var inLine = {}; c.forEach(function (x, p) { inLine[x] = p; });
            var sg = pz.signs.filter(function (q) { return inLine[q.a] !== undefined && inLine[q.b] !== undefined; });
            var opts = allLines(N).filter(function (o) {
                for (var p = 0; p < N; p++) if (v[c[p]] >= 0 && v[c[p]] !== o[p]) return false;
                for (var q = 0; q < sg.length; q++) {
                    var x1 = o[inLine[sg[q].a]], x2 = o[inLine[sg[q].b]];
                    if ((sg[q].t === 'eq') !== (x1 === x2)) return false;
                }
                return true;
            });
            if (!opts.length) continue;
            for (var p = 0; p < N; p++) {
                if (v[c[p]] >= 0) continue;
                var first = opts[0][p];
                if (opts.every(function (o) { return o[p] === first; }))
                    return { sets: [[c[p], first]], level: 2, focus: c.filter(function (x) { return v[x] < 0 && x !== c[p]; }),
                        why: cap(lname(L[li])) + ' needs ' + (N / 2) + ' of each, with no three in a row' + (sg.length ? ' and its signs kept' : '') +
                            '. Try finishing it: every way that works puts ' + sym(first) + ' here.' };
            }
        }
        return null;
    }
    function pairStep(cell, val, focus) {
        return { sets: [[cell, val]], level: 1, focus: focus,
            why: 'Two ' + sym(1 - val, true) + ' are already side by side. A third would make three in a row, so this one is ' + sym(val) + '.' };
    }

    function solveHuman(pz, maxLevel) {
        var v = pz.given.slice(), level = 0, hard = 0, steps = 0;
        for (var guard = 0; guard < 400; guard++) {
            if (v.every(function (x) { return x >= 0; })) break;
            var st = nextStep(pz, v, maxLevel);
            if (!st) break;
            st.sets.forEach(function (sv) { v[sv[0]] = sv[1]; });
            level = Math.max(level, st.level); if (st.level === 2) hard++; steps++;
        }
        var ok = v.every(function (x, i) { return x === pz.sol[i]; });
        return { solved: ok, level: level, hard: hard, steps: steps };
    }

    // ---------- generate ----------
    function allClues(N, sol) {
        var out = [];
        for (var i = 0; i < N * N; i++) out.push({ kind: 'cell', i: i });
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
            var i0 = r * N + c;
            if (c < N - 1) out.push({ kind: 'sign', a: i0, b: i0 + 1, t: sol[i0] === sol[i0 + 1] ? 'eq' : 'x' });
            if (r < N - 1) out.push({ kind: 'sign', a: i0, b: i0 + N, t: sol[i0] === sol[i0 + N] ? 'eq' : 'x' });
        }
        return out;
    }
    function puzzleFrom(N, sol, clues) {
        var given = []; for (var i = 0; i < N * N; i++) given.push(-1);
        var signs = [];
        clues.forEach(function (q) { if (q.kind === 'cell') given[q.i] = sol[q.i]; else signs.push({ a: q.a, b: q.b, t: q.t }); });
        return { N: N, sol: sol, given: given, signs: signs, lines: makeLines(N) };
    }
    var cache = {};
    function generate(n) {
        if (cache[n]) return cache[n];
        var N = sizeFor(n), P = plan(n), r = rng(n * 104729 + 3), best = null, bestScore = -1;
        for (var attempt = 0; attempt < 60; attempt++) {
            var sol = randomGrid(N, r);
            // Pool of possible clues: about as many signs as given squares
            var pool = shuffle(allClues(N, sol), r);
            var chosen = [], pz = null;
            for (var k = 0; k < pool.length; k++) {
                chosen.push(pool[k]);
                if (chosen.length < N) continue;
                pz = puzzleFrom(N, sol, chosen);
                if (solveHuman(pz, P.maxLevel).solved) break;
            }
            // Take clues away while it stays solvable by reasoning
            var order = shuffle(chosen.slice(), r);
            for (k = 0; k < order.length; k++) {
                var trial = chosen.filter(function (q) { return q !== order[k]; });
                if (solveHuman(puzzleFrom(N, sol, trial), P.maxLevel).solved) chosen = trial;
            }
            // Gentler levels: put some spare clues back
            var spare = shuffle(pool.filter(function (q) { return chosen.indexOf(q) < 0; }), r).slice(0, P.spare);
            chosen = chosen.concat(spare);
            pz = puzzleFrom(N, sol, chosen);
            var res = solveHuman(pz, P.maxLevel);
            if (!res.solved) continue;
            pz.number = n; pz.tough = isTough(n); pz.level = res.level; pz.hard = res.hard; pz.attempts = attempt + 1;
            var meets = !P.needHard || res.hard >= (P.minHard || 1);
            var score = (meets ? 100 : 0) + res.hard;
            if (score > bestScore) { best = pz; bestScore = score; }
            if (meets && (!P.needHard || res.hard >= (P.minHard || 1))) break;
        }
        if (!best) throw new Error('Leaf & Drop: no puzzle for level ' + n);
        delete best.lines; best.lines = makeLines(N);
        cache[n] = best;
        return best;
    }

    // ---------- play helpers (marks: -1 empty, 0 / 1 symbols) ----------
    function isSolved(pz, marks) { return marks.every(function (x, i) { return x === pz.sol[i]; }); }
    // Squares breaking a rule right now
    function conflicts(pz, marks) {
        var N = pz.N, bad = {};
        pz.lines.forEach(function (l) {
            var c = l.cells, cnt = [0, 0];
            c.forEach(function (x) { if (marks[x] >= 0) cnt[marks[x]]++; });
            for (var s = 0; s < 2; s++) if (cnt[s] > N / 2) c.forEach(function (x) { if (marks[x] === s) bad[x] = 1; });
            for (var k = 0; k + 2 < N; k++) {
                var a = marks[c[k]];
                if (a >= 0 && a === marks[c[k + 1]] && a === marks[c[k + 2]]) { bad[c[k]] = bad[c[k + 1]] = bad[c[k + 2]] = 1; }
            }
        });
        var badSigns = [];
        pz.signs.forEach(function (s, idx) {
            var a = marks[s.a], b = marks[s.b];
            if (a < 0 || b < 0) return;
            if ((s.t === 'eq') !== (a === b)) { bad[s.a] = bad[s.b] = 1; badSigns.push(idx); }
        });
        return { cells: Object.keys(bad).map(Number), signs: badSigns };
    }
    function hint(pz, marks) {
        var i;
        for (i = 0; i < marks.length; i++) if (marks[i] >= 0 && marks[i] !== pz.sol[i])
            return { mistake: true, cells: [i], why: 'This square isn\'t right. Clear it and look again.' };
        var st = nextStep(pz, marks.slice(), 2);
        if (!st) return null;
        return { mistake: false, cells: st.sets.map(function (s) { return s[0]; }), vals: st.sets.map(function (s) { return s[1]; }), focus: st.focus || [], why: st.why };
    }

    var api = { generate: generate, sizeFor: sizeFor, isTough: isTough, isSolved: isSolved, conflicts: conflicts, hint: hint, solveHuman: solveHuman, allLines: allLines };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.BalanceEngine = api;
})(this);
