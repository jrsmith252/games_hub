/* Flip Side: Reversi rules and a computer player.
   The board is 64 squares, numbered r * 8 + c. 0 empty, 1 black, 2 white. Black moves first.
   A move must trap one or more of the other side's discs in a straight line between the new disc and one of yours;
   the trapped discs flip. If you can't move you pass; when neither side can move the game ends and most discs wins. */
(function (root) {
    'use strict';
    var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    function start() { var b = []; for (var i = 0; i < 64; i++) b.push(0); b[27] = 2; b[28] = 1; b[35] = 1; b[36] = 2; return { b: b, turn: 1, passes: 0, moves: [] }; }
    function other(p) { return 3 - p; }
    // the discs a move at i would flip (empty if it isn't a legal move)
    function flips(b, i, p) {
        if (b[i]) return [];
        var r = i >> 3, c = i & 7, out = [];
        for (var d = 0; d < 8; d++) {
            var dr = DIRS[d][0], dc = DIRS[d][1], y = r + dr, x = c + dc, line = [];
            while (y >= 0 && y < 8 && x >= 0 && x < 8 && b[y * 8 + x] === other(p)) { line.push(y * 8 + x); y += dr; x += dc; }
            if (line.length && y >= 0 && y < 8 && x >= 0 && x < 8 && b[y * 8 + x] === p) Array.prototype.push.apply(out, line);
        }
        return out;
    }
    function legal(b, p) { var out = []; for (var i = 0; i < 64; i++) if (!b[i] && flips(b, i, p).length) out.push(i); return out; }
    function count(b) { var n = [0, 0, 0]; for (var i = 0; i < 64; i++) n[b[i]]++; return n; }
    // play a move (or a pass, i = -1). Returns the discs flipped, or null if it isn't allowed.
    function play(s, i) {
        if (over(s)) return null;
        var mine = legal(s.b, s.turn);
        if (i === -1) { if (mine.length) return null; s.moves.push(-1); s.turn = other(s.turn); s.passes++; return []; }
        var f = flips(s.b, i, s.turn); if (!f.length) return null;
        s.b[i] = s.turn; f.forEach(function (q) { s.b[q] = s.turn; });
        s.moves.push(i); s.turn = other(s.turn); s.passes = 0;
        return f;
    }
    // after a move: if the side to play has no moves but the other does, that's a pass
    function mustPass(s) { return !over(s) && !legal(s.b, s.turn).length; }
    function over(s) { return !legal(s.b, 1).length && !legal(s.b, 2).length; }
    function winner(s) { var n = count(s.b); return n[1] > n[2] ? 1 : n[2] > n[1] ? 2 : 0; }
    function clone(s) { return { b: s.b.slice(), turn: s.turn, passes: s.passes, moves: s.moves.slice() }; }
    // rebuild a game from its list of moves; null if any move is illegal (a tampered or broken link)
    function replay(moves) {
        var s = start();
        for (var k = 0; k < moves.length; k++) { if (play(s, moves[k]) === null) return null; }
        return s;
    }

    // ---------- the computer ----------
    // squares by how good they are to hold: corners great, the squares next to an empty corner bad
    var W = [
        100, -20, 10, 5, 5, 10, -20, 100,
        -20, -50, -2, -2, -2, -2, -50, -20,
        10, -2, 1, 1, 1, 1, -2, 10,
        5, -2, 1, 0, 0, 1, -2, 5,
        5, -2, 1, 0, 0, 1, -2, 5,
        10, -2, 1, 1, 1, 1, -2, 10,
        -20, -50, -2, -2, -2, -2, -50, -20,
        100, -20, 10, 5, 5, 10, -20, 100];
    var CORNER_OF = { 1: 0, 8: 0, 9: 0, 6: 7, 15: 7, 14: 7, 48: 56, 57: 56, 49: 56, 55: 63, 62: 63, 54: 63 };
    function evaluate(b, p) {
        var o = other(p), pos = 0, n = count(b), empties = n[0];
        for (var i = 0; i < 64; i++) {
            if (!b[i]) continue;
            var w = W[i];
            // once a corner is taken, the squares beside it stop being dangerous
            if (w < 0 && CORNER_OF[i] !== undefined && b[CORNER_OF[i]]) w = 4;
            pos += b[i] === p ? w : -w;
        }
        var mob = legal(b, p).length - legal(b, o).length;
        // late in the game, discs are what count
        var discs = n[p] - n[o];
        return empties > 14 ? pos + 6 * mob : empties > 6 ? pos + 4 * mob + 2 * discs : discs * 10 + pos * 0.2;
    }
    function search(b, p, depth, alpha, beta, me, passed) {
        var moves = legal(b, p);
        if (depth === 0 || (!moves.length && passed)) {
            if (!moves.length && passed) { var n = count(b), d = n[me] - n[other(me)]; return d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0; }
            return evaluate(b, me);
        }
        if (!moves.length) return search(b, other(p), depth, alpha, beta, me, true);
        // try the most promising squares first, so the search can cut more
        moves.sort(function (x, y) { return W[y] - W[x]; });
        var maxing = p === me, best = maxing ? -Infinity : Infinity;
        for (var k = 0; k < moves.length; k++) {
            var nb = b.slice(), f = flips(nb, moves[k], p); nb[moves[k]] = p; f.forEach(function (q) { nb[q] = p; });
            var v = search(nb, other(p), depth - 1, alpha, beta, me, false);
            if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
            else { if (v < best) best = v; if (best < beta) beta = best; }
            if (beta <= alpha) break;
        }
        return best;
    }
    // level: 'easy' | 'medium' | 'hard'. rand: a random number function (for variety).
    function bestMove(s, level, rand) {
        rand = rand || Math.random;
        var p = s.turn, moves = legal(s.b, p);
        if (!moves.length) return -1;
        if (level === 'easy') {
            // mostly grabs whatever flips the most, with plenty of mistakes; never deliberately clever
            if (rand() < 0.35) return moves[Math.floor(rand() * moves.length)];
            var best = -1, bv = -1; moves.forEach(function (m) { var v = flips(s.b, m, p).length + rand() * 2; if (v > bv) { bv = v; best = m; } });
            return best;
        }
        var empties = count(s.b)[0];
        var depth = level === 'hard' ? (empties <= 12 ? 12 : 5) : 2;
        var scored = moves.map(function (m) {
            var nb = s.b.slice(), f = flips(nb, m, p); nb[m] = p; f.forEach(function (q) { nb[q] = p; });
            return { m: m, v: search(nb, other(p), depth - 1, -Infinity, Infinity, p, false) + rand() * (level === 'medium' ? 8 : 0.5) };
        });
        scored.sort(function (a, b) { return b.v - a.v; });
        return scored[0].m;
    }
    function name(i) { return 'ABCDEFGH'[i & 7] + ((i >> 3) + 1); }

    var api = { VERSION: 1, start: start, flips: flips, legal: legal, count: count, play: play, mustPass: mustPass, over: over, winner: winner, clone: clone, replay: replay, bestMove: bestMove, name: name, other: other };
    root.FlipSide = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
