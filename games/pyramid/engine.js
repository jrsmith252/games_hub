/* Pyramid rules, dealing and a solver.
   Cards 0-51: suit = floor(c / 13), rank = c % 13 (0 = ace); a card's value is rank + 1 (Jack 11, Queen 12, King 13).
   28 cards make a pyramid of 7 rows; the other 24 are the deck. Take away two uncovered cards that add up to 13
   (a King on its own). The top card of the pile counts as uncovered too. The deck can be gone through three times.
   Clear the pyramid to win.
   State: { pyr: [28], gone: [28 flags], stock: [top last], waste: [top last], passes: redeals used, seed }.
   Moves: { a: 'p<i>' | 'w', b: 'p<i>' | 'w' } (b left out for a King), { draw: true }, { redeal: true }. */
(function (root) {
    'use strict';
    var ROWS = 7, PASSES = 2;
    function rank(c) { return c % 13; }
    function suit(c) { return Math.floor(c / 13); }
    function val(c) { return rank(c) + 1; }
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    var ROW = [], POS = [], COVER = [];
    (function () { var i = 0; for (var r = 0; r < ROWS; r++) for (var k = 0; k <= r; k++) { ROW[i] = r; POS[i] = k; COVER[i] = r < ROWS - 1 ? [(r + 1) * (r + 2) / 2 + k, (r + 1) * (r + 2) / 2 + k + 1] : []; i++; } })();
    function deal(seed) {
        var r = rng(seed), d = []; for (var i = 0; i < 52; i++) d.push(i);
        for (i = 51; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; }
        return { pyr: d.slice(0, 28), gone: d.slice(0, 28).map(function () { return 0; }), stock: d.slice(28), waste: [], passes: 0, seed: seed };
    }
    function clone(s) { return { pyr: s.pyr, gone: s.gone.slice(), stock: s.stock.slice(), waste: s.waste.slice(), passes: s.passes, seed: s.seed }; }
    function free(s, i) { if (s.gone[i]) return false; var c = COVER[i]; for (var k = 0; k < c.length; k++) if (!s.gone[c[k]]) return false; return true; }
    function cardAt(s, t) { if (t === 'w') return s.waste.length ? s.waste[s.waste.length - 1] : -1; var i = +t.slice(1); return free(s, i) ? s.pyr[i] : -1; }
    function canRedeal(s) { return !s.stock.length && s.waste.length > 0 && s.passes < PASSES; }
    function apply(s, m) {
        if (m.draw) { if (!s.stock.length) return false; s.waste.push(s.stock.pop()); return true; }
        if (m.redeal) { if (!canRedeal(s)) return false; s.stock = s.waste.reverse(); s.waste = []; s.passes++; return true; }
        var a = cardAt(s, m.a); if (a < 0) return false;
        if (m.b === undefined || m.b === null) { if (val(a) !== 13) return false; }
        else { if (m.b === m.a) return false; var b = cardAt(s, m.b); if (b < 0 || val(a) + val(b) !== 13) return false; }
        [m.a, m.b].forEach(function (t) { if (t === undefined || t === null) return; if (t === 'w') s.waste.pop(); else s.gone[+t.slice(1)] = 1; });
        return true;
    }
    function left(s) { var n = 0; for (var i = 0; i < 28; i++) if (!s.gone[i]) n++; return n; }
    function won(s) { return left(s) === 0; }
    // every pair or King you could take right now
    function pairs(s) {
        var out = [], open = [], i, j;
        for (i = 0; i < 28; i++) if (free(s, i)) open.push('p' + i);
        if (s.waste.length) open.push('w');
        for (i = 0; i < open.length; i++) {
            var a = cardAt(s, open[i]);
            if (val(a) === 13) { out.push({ a: open[i] }); continue; }
            for (j = i + 1; j < open.length; j++) if (val(a) + val(cardAt(s, open[j])) === 13) out.push({ a: open[i], b: open[j] });
        }
        return out;
    }
    function moves(s) { var out = pairs(s); if (s.stock.length) out.push({ draw: true }); else if (canRedeal(s)) out.push({ redeal: true }); return out; }
    function stuck(s) { return !won(s) && !moves(s).length; }
    // depth-first search; a position is the pyramid cards gone, the deck, the pile and the redeals used
    function key(s) { var m = ''; for (var i = 0; i < 28; i++) m += s.gone[i] ? '1' : '0'; return m + '|' + s.stock.join(',') + '|' + s.waste.join(',') + '|' + s.passes; }
    function solve(start, budget) {
        budget = budget || 100000;
        var seen = {}, count = 0, path = [], found = false;
        function go(s) {
            if (found || count > budget) return;
            if (won(s)) { found = true; return; }
            var k = key(s); if (seen[k]) return; seen[k] = 1; count++;
            // clearing pyramid cards first (higher rows open more), then the pile, then drawing
            var ms = moves(s).sort(function (x, y) { return pri(y) - pri(x); });
            for (var i = 0; i < ms.length && !found; i++) { var n = clone(s); if (!apply(n, ms[i])) continue; path.push(ms[i]); go(n); if (!found) path.pop(); }
        }
        function pri(m) { if (m.draw) return 1; if (m.redeal) return 0; var p = 10; [m.a, m.b].forEach(function (t) { if (t && t !== 'w') p += 2 + (6 - ROW[+t.slice(1)]) * 0.1; }); return p; }
        go(clone(start));
        return { win: found, states: count, first: found ? path[0] : null, path: found ? path.slice() : null };
    }
    function winnableDeal(seed, budget) {
        for (var k = 0; k < 150; k++) { var d = deal(seed + k * 7919); if (solve(d, budget || 40000).win) return d; }
        return deal(seed);
    }
    var api = { VERSION: 1, ROWS: ROWS, PASSES: PASSES, ROW: ROW, POS: POS, COVER: COVER, deal: deal, clone: clone, free: free, cardAt: cardAt, canRedeal: canRedeal, apply: apply, left: left, won: won, pairs: pairs, moves: moves, stuck: stuck, solve: solve, winnableDeal: winnableDeal, rank: rank, suit: suit, val: val };
    root.Pyramid = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
