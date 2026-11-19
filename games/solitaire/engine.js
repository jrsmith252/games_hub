/* Solitaire (Klondike) rules, dealing and a solver.
   Cards are numbers 0-51: suit = floor(c / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = c % 13 (0 = ace).
   A game state: { cols: [7 arrays, bottom first], down: [7 counts of face-down cards at the bottom of each column],
   stock: [cards, top last], waste: [cards, top last], found: [4 counts: how many of each suit are home], draw: 1|3 }.
   The solver plays the deal out in its head; "winnable deals" are only dealt if it finds a win. */
(function (root) {
    'use strict';
    function suit(c) { return Math.floor(c / 13); }
    function rank(c) { return c % 13; }
    function red(c) { var s = suit(c); return s === 1 || s === 2; }
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    function deal(seed, draw) {
        var r = rng(seed), deck = []; for (var i = 0; i < 52; i++) deck.push(i);
        for (i = 51; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
        var cols = [], down = [], k = 0;
        for (var c = 0; c < 7; c++) { cols.push(deck.slice(k, k + c + 1)); k += c + 1; down.push(c); }
        return { cols: cols, down: down, stock: deck.slice(k).reverse(), waste: [], found: [0, 0, 0, 0], draw: draw || 1, seed: seed };
    }
    function clone(s) { return { cols: s.cols.map(function (c) { return c.slice(); }), down: s.down.slice(), stock: s.stock.slice(), waste: s.waste.slice(), found: s.found.slice(), draw: s.draw, seed: s.seed }; }

    // ---------- rules ----------
    function canFound(s, c) { return s.found[suit(c)] === rank(c); }
    function canStack(s, col, c) {   // put card c (with anything on it) onto column col
        var t = s.cols[col];
        if (!t.length) return rank(c) === 12;   // only a king on an empty column
        var top = t[t.length - 1];
        return s.down[col] < t.length && rank(top) === rank(c) + 1 && red(top) !== red(c);
    }
    // a run that can be lifted from column col starting at index i (all face up, descending, alternating)
    function runOk(s, col, i) {
        var t = s.cols[col]; if (i < s.down[col] || i >= t.length) return false;
        for (var k = i; k < t.length - 1; k++) if (rank(t[k]) !== rank(t[k + 1]) + 1 || red(t[k]) === red(t[k + 1])) return false;
        return true;
    }
    function flip(s, col) { if (s.down[col] > 0 && s.down[col] >= s.cols[col].length) s.down[col] = s.cols[col].length - 1; }
    // Moves: { from: 'w' | 'f0'..'f3' | 0..6, i (index in column), to: 'f' | 0..6 } or { draw: true }
    function apply(s, m) {
        if (m.draw) {
            if (!s.stock.length) { s.stock = s.waste.reverse(); s.waste = []; return true; }
            for (var n = 0; n < s.draw && s.stock.length; n++) s.waste.push(s.stock.pop());
            return true;
        }
        var cards;
        if (m.from === 'w') { if (!s.waste.length) return false; cards = [s.waste[s.waste.length - 1]]; }
        else if (typeof m.from === 'string' && m.from[0] === 'f') { var fs = +m.from[1]; if (!s.found[fs]) return false; cards = [fs * 13 + s.found[fs] - 1]; }
        else { if (!runOk(s, m.from, m.i)) return false; cards = s.cols[m.from].slice(m.i); }
        if (m.to === 'f') { if (cards.length !== 1 || !canFound(s, cards[0])) return false; }
        else { if (m.to === m.from || !canStack(s, m.to, cards[0])) return false; }
        // take them off
        if (m.from === 'w') s.waste.pop();
        else if (typeof m.from === 'string') s.found[+m.from[1]]--;
        else { s.cols[m.from].length = m.i; flip(s, m.from); }
        if (m.to === 'f') s.found[suit(cards[0])]++;
        else Array.prototype.push.apply(s.cols[m.to], cards);
        return true;
    }
    function won(s) { return s.found.every(function (f) { return f === 13; }); }
    // everything face up and the stock gone: the rest is just tidying away
    function allOpen(s) { return !s.stock.length && !s.waste.length && s.down.every(function (d) { return d === 0; }); }

    // ---------- solver ----------
    // Depth-first search over sensible moves, remembering positions already seen. Returns true if it finds a win
    // within the budget. The stock is treated as a fixed cycle so positions can be compared cheaply.
    function key(s) { return s.cols.map(function (c, i) { return s.down[i] + ':' + c.join(','); }).sort().join('|') + '#' + s.stock.join(',') + '/' + s.waste.join(',') + '#' + s.found.join(','); }
    function safeHome(s, c) { var rk = rank(c); if (rk <= 1) return true; var opp = red(c) ? [0, 3] : [1, 2]; return s.found[opp[0]] >= rk - 1 && s.found[opp[1]] >= rk - 1; }
    function moves(s) {
        var out = [], c, i, col;
        // to the foundations
        if (s.waste.length && canFound(s, s.waste[s.waste.length - 1])) out.push({ m: { from: 'w', to: 'f' }, p: 9 });
        for (col = 0; col < 7; col++) { var t = s.cols[col]; if (t.length && s.down[col] < t.length && canFound(s, t[t.length - 1])) out.push({ m: { from: col, i: t.length - 1, to: 'f' }, p: t.length - 1 === s.down[col] && s.down[col] ? 10 : 8 }); }
        // between columns: only moves that turn over a card, empty a column for a king, or free a card for home
        for (col = 0; col < 7; col++) {
            var tc = s.cols[col]; if (!tc.length || s.down[col] >= tc.length) continue;
            for (i = s.down[col]; i < tc.length; i++) {
                if (!runOk(s, col, i)) continue;
                for (var to = 0; to < 7; to++) {
                    if (to === col || !canStack(s, to, tc[i])) continue;
                    var reveals = i === s.down[col] && s.down[col] > 0, empties = i === 0, freesHome = i > s.down[col] && canFound(s, tc[i - 1]);
                    if (empties && !s.cols[to].length) continue;            // king from one empty spot to another
                    if (!s.cols[to].length && i === 0) continue;
                    if (reveals) out.push({ m: { from: col, i: i, to: to }, p: 7 + Math.min(2, s.down[col] / 3) });
                    else if (empties) out.push({ m: { from: col, i: i, to: to }, p: 5 });
                    else if (freesHome) out.push({ m: { from: col, i: i, to: to }, p: 4 });
                }
            }
        }
        // waste to a column
        if (s.waste.length) { c = s.waste[s.waste.length - 1]; for (col = 0; col < 7; col++) if (canStack(s, col, c)) out.push({ m: { from: 'w', to: col }, p: s.cols[col].length ? 6 : 3 }); }
        // back down from a foundation, only to make room for a card that's waiting
        for (var f = 0; f < 4; f++) { if (!s.found[f]) continue; c = f * 13 + s.found[f] - 1; if (rank(c) < 2) continue; for (col = 0; col < 7; col++) if (s.cols[col].length && canStack(s, col, c)) out.push({ m: { from: 'f' + f, to: col }, p: 1 }); }
        if (s.stock.length || s.waste.length) out.push({ m: { draw: true }, p: 2 });
        out.sort(function (a, b) { return b.p - a.p; });
        return out.map(function (o) { return o.m; });
    }
    function solve(start, budget) {
        var seen = {}, count = 0, s0 = clone(start), path = [];
        // play safe moves to the foundations straight away
        // returns the moves it made, so they count as part of the answer (a hint can then say "put this home")
        function autoHome(s) { var made = [], did = true; while (did) { did = false;
            if (s.waste.length && canFound(s, s.waste[s.waste.length - 1]) && safeHome(s, s.waste[s.waste.length - 1])) { var m0 = { from: 'w', to: 'f' }; apply(s, m0); made.push(m0); did = true; continue; }
            for (var col = 0; col < 7; col++) { var t = s.cols[col]; if (t.length && s.down[col] < t.length && canFound(s, t[t.length - 1]) && safeHome(s, t[t.length - 1])) { var m1 = { from: col, i: t.length - 1, to: 'f' }; apply(s, m1); made.push(m1); did = true; } } }
            return made; }
        var found = false;
        function go(s, depth) {
            if (found || count > budget) return;
            var auto = autoHome(s); Array.prototype.push.apply(path, auto);
            if (won(s) || allOpen(s)) { found = true; return; }
            var k = key(s);
            if (!seen[k]) { seen[k] = 1; count++;
                var ms = moves(s);
                for (var i = 0; i < ms.length && !found; i++) {
                    var n = clone(s); if (!apply(n, ms[i])) continue;
                    path.push(ms[i]); go(n, depth + 1); if (!found) path.pop();
                } }
            if (!found) path.length -= auto.length;
        }
        go(s0, 0);
        return { win: found, states: count, first: found ? path[0] : null, path: found ? path.slice() : null };
    }
    // a winnable deal: try seeds from the given one until the solver wins
    function winnableDeal(seed, draw, budget) {
        for (var k = 0; k < 60; k++) { var d = deal(seed + k * 7919, draw), r = solve(d, budget || 60000); if (r.win) { d.seed = seed + k * 7919; return d; } }
        return deal(seed, draw);
    }

    var api = { VERSION: 1, deal: deal, clone: clone, apply: apply, won: won, allOpen: allOpen, canFound: canFound, canStack: canStack, runOk: runOk, solve: solve, winnableDeal: winnableDeal, moves: moves, suit: suit, rank: rank, red: red };
    root.Solitaire = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
