/* Spider rules, dealing and a solver.
   Two decks: cards 0-103, rank = c % 13 (0 = ace). With 1 suit every card is a spade, with 2 suits spades and hearts,
   with 4 suits the usual four. State: { cols: [10 arrays], down: [10 counts face down], stock: [cards, top last],
   done: [suit of each finished run], suits, seed }.
   Any card can go on a card one rank higher, but only a run all in one suit moves together. A full King-to-Ace run in
   one suit leaves the table. Tap the deck to deal one card onto every column (not while a column is empty). */
(function (root) {
    'use strict';
    var MAP = { 1: [0, 0, 0, 0], 2: [0, 1, 0, 1], 4: [0, 1, 2, 3] };
    function rank(c) { return c % 13; }
    function suitOf(n, c) { return MAP[n][Math.floor(c / 13) % 4]; }
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    // variant > 0 rearranges a deal without changing whether it can be won: the four long columns swap places among
    // themselves, so do the six short ones (the deck is dealt out to match), and with two suits spades and hearts can swap
    function deal(seed, suits, variant) {
        suits = MAP[suits] ? suits : 1;
        var r = rng(seed), d = []; for (var i = 0; i < 104; i++) d.push(i);
        for (i = 103; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; }
        var cols = [], down = [], k = 0;
        for (var c = 0; c < 10; c++) { var n = c < 4 ? 6 : 5; cols.push(d.slice(k, k + n)); down.push(n - 1); k += n; }
        var stock = d.slice(k);
        if (variant) {
            var vr = rng(variant * 2654435761 + 12345), perm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (i = 3; i > 0; i--) { j = Math.floor(vr() * (i + 1)); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
            for (i = 9; i > 4; i--) { j = 4 + Math.floor(vr() * (i - 3)); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
            var nc = [], ns = stock.slice();
            for (c = 0; c < 10; c++) nc.push(cols[perm[c]]);
            for (var dl = 0; dl < 5; dl++) for (c = 0; c < 10; c++) ns[49 - (10 * dl + c)] = stock[49 - (10 * dl + perm[c])];
            cols = nc; stock = ns;
            if (suits === 2 && vr() < 0.5) { var sw = function (x) { return (Math.floor(x / 13) ^ 1) * 13 + x % 13; }; cols = cols.map(function (col) { return col.map(sw); }); stock = stock.map(sw); }
        }
        return { cols: cols, down: down, stock: stock, done: [], suits: suits, seed: seed, variant: variant || 0 };
    }
    function clone(s) { return { cols: s.cols.map(function (c) { return c.slice(); }), down: s.down.slice(), stock: s.stock.slice(), done: s.done.slice(), suits: s.suits, seed: s.seed, variant: s.variant || 0 }; }
    function suit(s, c) { return suitOf(s.suits, c); }
    // cards from i to the end are face up, one suit, each one lower than the last
    function runOk(s, col, i) {
        var t = s.cols[col]; if (i < s.down[col] || i >= t.length) return false;
        for (var k = i; k < t.length - 1; k++) if (rank(t[k]) !== rank(t[k + 1]) + 1 || suit(s, t[k]) !== suit(s, t[k + 1])) return false;
        return true;
    }
    function runStart(s, col) { var t = s.cols[col], i = t.length - 1; if (i < 0) return -1; while (i > s.down[col] && rank(t[i - 1]) === rank(t[i]) + 1 && suit(s, t[i - 1]) === suit(s, t[i])) i--; return i; }
    function fits(s, col, c) { var t = s.cols[col]; return !t.length || rank(t[t.length - 1]) === rank(c) + 1; }
    function flip(s, col) { if (s.down[col] > 0 && s.down[col] >= s.cols[col].length) s.down[col] = s.cols[col].length - 1; }
    // a finished King-to-Ace run at the end of a column leaves the table
    function clear(s, col) {
        var t = s.cols[col]; if (t.length < 13) return false;
        var i = t.length - 13; if (rank(t[i]) !== 12 || !runOk(s, col, i)) return false;
        s.done.push(suit(s, t[i])); t.length = i; flip(s, col); return true;
    }
    function canDeal(s) { if (!s.stock.length) return false; for (var c = 0; c < 10; c++) if (!s.cols[c].length) return false; return true; }
    // moves: { deal: true } or { from: col, i, to: col }
    function apply(s, m) {
        if (m.deal) {
            if (!canDeal(s)) return false;
            for (var c = 0; c < 10; c++) s.cols[c].push(s.stock.pop());
            for (c = 0; c < 10; c++) clear(s, c);
            return true;
        }
        if (m.from === m.to || !runOk(s, m.from, m.i) || !fits(s, m.to, s.cols[m.from][m.i])) return false;
        var cards = s.cols[m.from].slice(m.i); s.cols[m.from].length = m.i; flip(s, m.from);
        Array.prototype.push.apply(s.cols[m.to], cards); clear(s, m.to);
        return true;
    }
    function won(s) { return s.done.length === 8; }
    function moves(s) {
        var out = [], firstEmpty = -1, col, to;
        for (col = 0; col < 10; col++) if (!s.cols[col].length) { firstEmpty = col; break; }
        for (col = 0; col < 10; col++) {
            var t = s.cols[col]; if (!t.length) continue;
            var st = runStart(s, col);
            for (var j = st; j < t.length; j++) {
                var c = t[j], below = j > s.down[col] ? t[j - 1] : -1;
                // already sitting on the next card up: only worth moving to join its own suit
                var seated = below >= 0 && rank(below) === rank(c) + 1;
                for (to = 0; to < 10; to++) {
                    if (to === col || !s.cols[to].length) continue;
                    var top = s.cols[to][s.cols[to].length - 1];
                    if (rank(top) !== rank(c) + 1) continue;
                    var same = suit(s, top) === suit(s, c);
                    if (seated && !(same && suit(s, below) !== suit(s, c))) continue;
                    if (j > st && !same) continue;   // breaking up a run only to join the same suit
                    out.push({ m: { from: col, i: j, to: to }, p: (same ? 6 : 3) + (j === s.down[col] && s.down[col] ? 4 : 0) + (j === 0 ? 2 : 0) });
                }
                if (firstEmpty >= 0 && j > 0 && j === st && !seated) out.push({ m: { from: col, i: j, to: firstEmpty }, p: j === s.down[col] && s.down[col] ? 3 : 1 });
            }
        }
        if (canDeal(s)) out.push({ m: { deal: true }, p: 0 });
        out.sort(function (a, b) { return b.p - a.p; });
        return out.map(function (o) { return o.m; });
    }
    // ---------- solver: best-first search ----------
    function key(s) { return s.cols.map(function (c, i) { return s.down[i] + ':' + c.map(rank).join(',') + '/' + c.map(function (x) { return suit(s, x); }).join(''); }).join('|') + '#' + s.stock.length; }
    function score(s) {
        var h = (8 - s.done.length) * 60 + s.stock.length;
        for (var col = 0; col < 10; col++) {
            var t = s.cols[col]; h += s.down[col] * 8;
            if (!t.length) { h -= 10; continue; }
            // long runs in one suit are what you want: reward them more the longer they get
            var run = 1;
            for (var j = s.down[col] + 1; j < t.length; j++) {
                if (rank(t[j - 1]) === rank(t[j]) + 1 && suit(s, t[j - 1]) === suit(s, t[j])) run++;
                else { h += rank(t[j - 1]) === rank(t[j]) + 1 ? 2 : 5; h -= run * run * 0.3; run = 1; }
            }
            h -= run * run * 0.3;
        }
        return h;
    }
    // the search only tries moves that join a suit, turn a card over, use an empty column or deal
    function useful(s, m) {
        if (m.deal) return true;
        var to = s.cols[m.to]; if (!to.length) return true;
        return suit(s, to[to.length - 1]) === suit(s, s.cols[m.from][m.i]) || m.i === s.down[m.from];
    }
    function Heap() { this.a = []; }
    Heap.prototype.push = function (x) { var a = this.a; a.push(x); var i = a.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
    Heap.prototype.pop = function () { var a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } } return top; };
    function solve(start, budget) {
        budget = budget || 30000;
        var s0 = clone(start), seen = {}, heap = new Heap(), count = 0;
        if (won(s0)) return { win: true, states: 0, path: [], first: null };
        heap.push({ f: score(s0), n: { s: s0, parent: null, m: null, g: 0 } }); seen[key(s0)] = 1;
        while (heap.a.length && count < budget) {
            var node = heap.pop().n; count++;
            var ms = moves(node.s);
            for (var i = 0; i < ms.length; i++) {
                if (!useful(node.s, ms[i])) continue;
                var n = clone(node.s); if (!apply(n, ms[i])) continue;
                var k = key(n); if (seen[k]) continue; seen[k] = 1;
                var child = { s: n, parent: node, m: ms[i], g: node.g + 1 };
                if (won(n)) { var path = []; for (var x = child; x.parent; x = x.parent) path.unshift(x.m); return { win: true, states: count, path: path, first: path[0] }; }
                heap.push({ f: score(n), n: child });
            }
        }
        return { win: false, states: count, path: null, first: null };
    }
    function winnableDeal(seed, suits, budget, tries) {
        for (var k = 0; k < (tries || 30); k++) { var d = deal(seed + k * 7919, suits); if (solve(d, budget || 25000).win) return d; }
        return null;
    }
    var api = { VERSION: 1, deal: deal, clone: clone, apply: apply, won: won, runOk: runOk, runStart: runStart, fits: fits, canDeal: canDeal, moves: moves, solve: solve, winnableDeal: winnableDeal, rank: rank, suitOf: suitOf, suit: suit };
    root.Spider = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
