/* TriPeaks rules, dealing and a solver.
   Cards 0-51: suit = floor(c / 13), rank = c % 13 (0 = ace). 28 cards make three peaks (rows of 3, 6, 9 and 10);
   the other 24 are the deck. Play any uncovered peak card that is one higher or one lower than the pile card
   (King and Ace count as next to each other). Clear all three peaks to win. */
(function (root) {
    'use strict';
    function rank(c) { return c % 13; }
    function suit(c) { return Math.floor(c / 13); }
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    // which positions sit on top of each position. Rows: 0-2 (peak tops), 3-8, 9-17, 18-27 (bottom row)
    var COVER = [], ROW = [], COL = [];
    (function () {
        var p, k, i;
        for (p = 0; p < 3; p++) { COVER[p] = [3 + 2 * p, 4 + 2 * p]; ROW[p] = 0; }
        for (i = 0; i < 6; i++) { p = Math.floor(i / 2); k = i % 2; COVER[3 + i] = [9 + 3 * p + k, 10 + 3 * p + k]; ROW[3 + i] = 1; }
        for (i = 0; i < 9; i++) { COVER[9 + i] = [18 + i, 19 + i]; ROW[9 + i] = 2; }
        for (i = 0; i < 10; i++) { COVER[18 + i] = []; ROW[18 + i] = 3; }
        // horizontal place in half-card steps, used for drawing: bottom row is 0,2,4..18
        for (i = 0; i < 10; i++) COL[18 + i] = 2 * i;
        for (i = 0; i < 9; i++) COL[9 + i] = 2 * i + 1;
        for (i = 0; i < 6; i++) { p = Math.floor(i / 2); k = i % 2; COL[3 + i] = 6 * p + 2 * k + 2; }
        for (p = 0; p < 3; p++) COL[p] = 6 * p + 3;
    })();
    function deal(seed) {
        var r = rng(seed), d = []; for (var i = 0; i < 52; i++) d.push(i);
        for (i = 51; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; }
        var stock = d.slice(28);
        return { tab: d.slice(0, 28), gone: d.slice(0, 28).map(function () { return 0; }), stock: stock.slice(0, 23), waste: [stock[23]], seed: seed };
    }
    function clone(s) { return { tab: s.tab, gone: s.gone.slice(), stock: s.stock.slice(), waste: s.waste.slice(), seed: s.seed }; }
    function free(s, i) { if (s.gone[i]) return false; var c = COVER[i]; for (var k = 0; k < c.length; k++) if (!s.gone[c[k]]) return false; return true; }
    function faceUp(s, i) { return free(s, i) || ROW[i] === 3; }
    function next(a, b) { var d = Math.abs(rank(a) - rank(b)); return d === 1 || d === 12; }
    function top(s) { return s.waste[s.waste.length - 1]; }
    function canPlay(s, i) { return free(s, i) && next(s.tab[i], top(s)); }
    // moves: { t: position } plays a peak card; { draw: true } turns the next deck card onto the pile
    function apply(s, m) {
        if (m.draw) { if (!s.stock.length) return false; s.waste.push(s.stock.pop()); return true; }
        if (!canPlay(s, m.t)) return false;
        s.gone[m.t] = 1; s.waste.push(s.tab[m.t]); return true;
    }
    function left(s) { var n = 0; for (var i = 0; i < 28; i++) if (!s.gone[i]) n++; return n; }
    function won(s) { return left(s) === 0; }
    function playable(s) { var out = []; for (var i = 0; i < 28; i++) if (canPlay(s, i)) out.push(i); return out; }
    function stuck(s) { return !s.stock.length && !playable(s).length && !won(s); }
    function peakDone(s, p) { return !!s.gone[p]; }

    // Depth-first search over plays and draws. A position is the set of cards gone, how much deck is left and the
    // pile card, so positions are cheap to remember.
    function key(s) { var m = ''; for (var i = 0; i < 28; i++) m += s.gone[i] ? '1' : '0'; return m + s.stock.length + ',' + top(s); }
    function solve(start, budget) {
        var seen = {}, count = 0, path = [], found = false;
        budget = budget || 200000;
        function go(s) {
            if (found || count > budget) return;
            if (won(s)) { found = true; return; }
            var k = key(s); if (seen[k]) return; seen[k] = 1; count++;
            // plays that open more cards first, bottom row last
            var ps = playable(s).sort(function (a, b) { return ROW[a] - ROW[b]; });
            for (var i = 0; i < ps.length && !found; i++) { var n = clone(s); apply(n, { t: ps[i] }); path.push({ t: ps[i] }); go(n); if (!found) path.pop(); }
            if (!found && s.stock.length && left(s) <= s.stock.length * 4 + 28) { var d = clone(s); apply(d, { draw: true }); path.push({ draw: true }); go(d); if (!found) path.pop(); }
        }
        go(clone(start));
        return { win: found, states: count, first: found ? path[0] : null, path: found ? path.slice() : null };
    }
    function winnableDeal(seed, budget) {
        for (var k = 0; k < 80; k++) { var d = deal(seed + k * 7919); if (solve(d, budget || 60000).win) return d; }
        return deal(seed);
    }
    var api = { VERSION: 1, COVER: COVER, ROW: ROW, COL: COL, deal: deal, clone: clone, free: free, faceUp: faceUp, next: next, top: top, canPlay: canPlay, apply: apply, left: left, won: won, playable: playable, stuck: stuck, peakDone: peakDone, solve: solve, winnableDeal: winnableDeal, rank: rank, suit: suit };
    root.TriPeaks = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
