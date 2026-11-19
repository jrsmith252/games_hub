/* FreeCell rules, dealing and a solver.
   Cards 0-51: suit = floor(c / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = c % 13 (0 = ace).
   State: { cols: [8 arrays, bottom first], cells: [4 cards or -1], found: [4 counts], seed }.
   Moves: { from: 0..7 | 'c0'..'c3', i (index in the column), to: 0..7 | 'c' (any free cell) | 'f' }. */
(function (root) {
    'use strict';
    function suit(c) { return Math.floor(c / 13); }
    function rank(c) { return c % 13; }
    function red(c) { var s = suit(c); return s === 1 || s === 2; }
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function deal(seed) {
        var r = rng(seed), d = []; for (var i = 0; i < 52; i++) d.push(i);
        for (i = 51; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; }
        var cols = [[], [], [], [], [], [], [], []];
        d.forEach(function (c, k) { cols[k % 8].push(c); });
        return { cols: cols, cells: [-1, -1, -1, -1], found: [0, 0, 0, 0], seed: seed };
    }
    function clone(s) { return { cols: s.cols.map(function (c) { return c.slice(); }), cells: s.cells.slice(), found: s.found.slice(), seed: s.seed }; }
    function canFound(s, c) { return s.found[suit(c)] === rank(c); }
    function fits(s, col, c) { var t = s.cols[col]; if (!t.length) return true; var top = t[t.length - 1]; return rank(top) === rank(c) + 1 && red(top) !== red(c); }
    function runOk(s, col, i) { var t = s.cols[col]; if (i < 0 || i >= t.length) return false; for (var k = i; k < t.length - 1; k++) if (rank(t[k]) !== rank(t[k + 1]) + 1 || red(t[k]) === red(t[k + 1])) return false; return true; }
    function freeCells(s) { var n = 0; for (var k = 0; k < 4; k++) if (s.cells[k] < 0) n++; return n; }
    function emptyCols(s, except) { var n = 0; for (var k = 0; k < 8; k++) if (k !== except && !s.cols[k].length) n++; return n; }
    // how many cards can move together onto column `to`, using free cells and empty columns as stepping stones
    function capacity(s, to) { return (freeCells(s) + 1) * Math.pow(2, emptyCols(s, to)); }
    function isCell(f) { return typeof f === 'string' && f[0] === 'c'; }
    function apply(s, m) {
        var cards;
        if (isCell(m.from)) { var k = +m.from[1]; if (s.cells[k] < 0) return false; cards = [s.cells[k]]; }
        else { if (!runOk(s, m.from, m.i)) return false; cards = s.cols[m.from].slice(m.i); }
        if (m.to === 'f') { if (cards.length !== 1 || !canFound(s, cards[0])) return false; }
        else if (m.to === 'c') { if (cards.length !== 1 || isCell(m.from) || !freeCells(s)) return false; }
        else { if (m.to === m.from || !fits(s, m.to, cards[0]) || cards.length > capacity(s, m.to)) return false; }
        if (isCell(m.from)) s.cells[+m.from[1]] = -1; else s.cols[m.from].length = m.i;
        if (m.to === 'f') s.found[suit(cards[0])]++;
        else if (m.to === 'c') s.cells[s.cells.indexOf(-1)] = cards[0];
        else Array.prototype.push.apply(s.cols[m.to], cards);
        return true;
    }
    function won(s) { return s.found[0] + s.found[1] + s.found[2] + s.found[3] === 52; }
    // a card is safe to send home once nothing still out could need to go on it
    function safeHome(s, c) { var rk = rank(c); if (rk <= 1) return true; var opp = red(c) ? [0, 3] : [1, 2]; return s.found[opp[0]] >= rk && s.found[opp[1]] >= rk; }
    // send every safe card home; returns the moves made
    function autoHome(s) {
        var made = [], did = true;
        while (did) { did = false;
            for (var k = 0; k < 4; k++) { var c = s.cells[k]; if (c >= 0 && canFound(s, c) && safeHome(s, c)) { var m = { from: 'c' + k, to: 'f' }; apply(s, m); made.push(m); did = true; } }
            for (var col = 0; col < 8; col++) { var t = s.cols[col]; if (t.length && canFound(s, t[t.length - 1]) && safeHome(s, t[t.length - 1])) { var m2 = { from: col, i: t.length - 1, to: 'f' }; apply(s, m2); made.push(m2); did = true; } }
        }
        return made;
    }
    // all sensible moves
    function moves(s) {
        var out = [], col, k, to, firstEmpty = -1;
        for (col = 0; col < 8; col++) if (!s.cols[col].length) { firstEmpty = col; break; }
        for (k = 0; k < 4; k++) { var c = s.cells[k]; if (c < 0) continue;
            if (canFound(s, c)) out.push({ from: 'c' + k, to: 'f' });
            for (to = 0; to < 8; to++) if (s.cols[to].length && fits(s, to, c)) out.push({ from: 'c' + k, to: to });
            if (firstEmpty >= 0) out.push({ from: 'c' + k, to: firstEmpty }); }
        for (col = 0; col < 8; col++) {
            var t = s.cols[col]; if (!t.length) continue;
            if (canFound(s, t[t.length - 1])) out.push({ from: col, i: t.length - 1, to: 'f' });
            // the longest movable run, and every shorter tail of it
            var i = t.length - 1; while (i > 0 && rank(t[i - 1]) === rank(t[i]) + 1 && red(t[i - 1]) !== red(t[i])) i--;
            for (var j = i; j < t.length; j++) {
                for (to = 0; to < 8; to++) { if (to === col || !s.cols[to].length) continue; if (fits(s, to, t[j]) && t.length - j <= capacity(s, to)) out.push({ from: col, i: j, to: to }); }
                if (firstEmpty >= 0 && j > 0 && t.length - j <= capacity(s, firstEmpty)) out.push({ from: col, i: j, to: firstEmpty });
            }
            if (freeCells(s)) out.push({ from: col, i: t.length - 1, to: 'c' });
        }
        return out;
    }
    // ---------- solver: best-first search, guided by how close a position looks to being solved ----------
    function key(s) { return s.cols.map(function (c) { return c.join(','); }).sort().join('|') + '#' + s.cells.filter(function (c) { return c >= 0; }).sort(function (a, b) { return a - b; }).join(',') + '#' + s.found.join(','); }
    function score(s) {
        var h = (52 - s.found[0] - s.found[1] - s.found[2] - s.found[3]) * 3;
        for (var col = 0; col < 8; col++) { var t = s.cols[col], low = 99;
            for (var j = 0; j < t.length; j++) { var r = rank(t[j]); if (r > low) h += 2; low = Math.min(low, r); }
            if (!t.length) h -= 3; }
        h += (4 - freeCells(s)) * 1.5;
        return h;
    }
    function Heap() { this.a = []; }
    Heap.prototype.push = function (x) { var a = this.a; a.push(x); var i = a.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
    Heap.prototype.pop = function () { var a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } } return top; };
    function solve(start, budget) {
        budget = budget || 40000;
        var s0 = clone(start), first = autoHome(s0), seen = {}, heap = new Heap(), count = 0;
        var root0 = { s: s0, parent: null, moves: first, g: 0 };
        if (won(s0)) return { win: true, states: 0, path: first, first: first[0] || null };
        heap.push({ f: score(s0), n: root0 }); seen[key(s0)] = 1;
        while (heap.a.length && count < budget) {
            var node = heap.pop().n; count++;
            var ms = moves(node.s);
            for (var i = 0; i < ms.length; i++) {
                var n = clone(node.s); if (!apply(n, ms[i])) continue;
                var made = [ms[i]].concat(autoHome(n));
                var k = key(n); if (seen[k]) continue; seen[k] = 1;
                var child = { s: n, parent: node, moves: made, g: node.g + 1 };
                if (won(n)) { var path = []; for (var x = child; x; x = x.parent) path = x.moves.concat(path); return { win: true, states: count, path: path, first: path[0] || null }; }
                heap.push({ f: score(n) + child.g * 0.05, n: child });
            }
        }
        return { win: false, states: count, path: null, first: null };
    }
    function winnableDeal(seed, budget) {
        for (var k = 0; k < 40; k++) { var d = deal(seed + k * 7919); if (solve(d, budget || 30000).win) return d; }
        return deal(seed);
    }
    var api = { VERSION: 1, deal: deal, clone: clone, apply: apply, won: won, canFound: canFound, fits: fits, runOk: runOk, capacity: capacity, freeCells: freeCells, safeHome: safeHome, autoHome: autoHome, moves: moves, solve: solve, winnableDeal: winnableDeal, suit: suit, rank: rank, red: red };
    root.FreeCell = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
