/* Pick & Mix: match-3 rules.
   Board cells are numbered r * C + c. Each cell has:
     t     the sweet: 0..5 a colour, 7 a rainbow sweet (colour bomb), 9 a cherry, -1 empty
     sp    0 plain, 1 striped across (clears its row), 2 striped down (clears its column), 3 wrapped (clears a 3x3 area),
           4 rainbow (with t = 7)
     id    a number that follows the sweet as it moves (for animation)
     jelly 0..2 layers under the sweet, crate 0..2 strength (a crate fills the cell; no sweet)
   Match 3 or more in a line. 4 in a line makes a striped sweet, an L or T makes a wrapped sweet, 5 in a line makes a
   rainbow sweet. Swapping two specials together sets off a bigger combo.
   Everything random comes from a seeded generator, so a level plays the same way for the same seed. */
(function (root) {
    'use strict';
    var RAINBOW = 7, CHERRY = 9;
    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    // ---------- making a game ----------
    // level: { R, C, k (colours), moves, mask: string of '.' (square) and ' ' (gap), jelly: string of '0'..'2',
    //          crate: string of '0'..'2', goals: [{ type: 'score'|'colour'|'jelly'|'crate'|'cherry', n, c }], cherries }
    function newGame(level, seed) {
        var R = level.R, C = level.C, N = R * C, s = {
            R: R, C: C, k: level.k, movesLeft: level.moves, moves: 0, score: 0, nextId: 1, seedBase: seed >>> 0,
            mask: [], t: [], sp: [], id: [], jelly: [], crate: [], goals: level.goals.map(function (g) { return { type: g.type, n: g.n, c: g.c }; }),
            collected: [0, 0, 0, 0, 0, 0], cherriesIn: 0, cherriesToCome: level.cherries || 0, cherriesDone: 0,
            won: false, lost: false
        };
        s.rand = rng(seed);
        for (var i = 0; i < N; i++) {
            s.mask[i] = !level.mask || level.mask[i] !== ' ';
            s.jelly[i] = s.mask[i] && level.jelly ? +level.jelly[i] || 0 : 0;
            s.crate[i] = s.mask[i] && level.crate ? +level.crate[i] || 0 : 0;
            s.t[i] = -1; s.sp[i] = 0; s.id[i] = 0;
        }
        // fill without ready-made matches, and make sure there's a move
        for (var tries = 0; tries < 50; tries++) {
            for (i = 0; i < N; i++) if (open(s, i)) { s.t[i] = -1; s.sp[i] = 0; }
            for (i = 0; i < N; i++) if (open(s, i)) { var c, guard = 0; do { c = Math.floor(s.rand() * s.k); } while (guard++ < 20 && wouldMatch(s, i, c)); s.t[i] = c; s.id[i] = s.nextId++; }
            // a couple of cherries start in the top rows
            var start = Math.min(s.cherriesToCome, 2);
            for (var q = 0; q < start; q++) { var cand = []; for (i = 0; i < C * 2; i++) if (open(s, i) && s.t[i] !== CHERRY) cand.push(i); if (cand.length) { var at = cand[Math.floor(s.rand() * cand.length)]; s.t[at] = CHERRY; s.cherriesIn++; s.cherriesToCome--; } }
            if (!findGroups(s).length && hasMove(s)) break;
            s.cherriesToCome += s.cherriesIn; s.cherriesIn = 0;
        }
        return s;
    }
    function clone(s) {
        var o = {}; for (var k in s) o[k] = Array.isArray(s[k]) ? s[k].slice() : s[k];
        o.goals = s.goals.map(function (g) { return { type: g.type, n: g.n, c: g.c }; });
        o.rand = rng(Math.floor(s.rand() * 4294967296)); s.rand = rng(Math.floor(s.rand() * 4294967296));
        return o;
    }
    // a copy that rolls its own dice (for trying a move out without peeking at what will really fall)
    function cloneBlind(s, seed) { var o = clone(s); o.rand = rng(seed); return o; }
    function open(s, i) { return s.mask[i] && !s.crate[i]; }
    function colourOf(s, i) { var t = s.t[i]; return t >= 0 && t < 6 ? t : -1; }
    function wouldMatch(s, i, c) {
        var C = s.C, r = Math.floor(i / C), x = i % C;
        if (x >= 2 && colourOf(s, i - 1) === c && colourOf(s, i - 2) === c) return true;
        if (r >= 2 && colourOf(s, i - C) === c && colourOf(s, i - 2 * C) === c) return true;
        return false;
    }
    function neighbours(s, a, b) { var C = s.C; return (Math.abs(a - b) === 1 && Math.floor(a / C) === Math.floor(b / C)) || Math.abs(a - b) === C; }
    function movable(s, i) { return open(s, i) && s.t[i] >= 0; }

    // ---------- finding matches ----------
    // groups of touching runs of 3+ in one colour: { cells, h (longest across), v (longest down), runs }
    function findGroups(s) {
        var R = s.R, C = s.C, runs = [], r, c;
        for (r = 0; r < R; r++) for (c = 0; c < C;) {
            var col = colourOf(s, r * C + c), e = c + 1;
            if (col < 0) { c++; continue; }
            while (e < C && colourOf(s, r * C + e) === col) e++;
            if (e - c >= 3) { var cs = []; for (var x = c; x < e; x++) cs.push(r * C + x); runs.push({ cells: cs, dir: 'h', col: col }); }
            c = e;
        }
        for (c = 0; c < C; c++) for (r = 0; r < R;) {
            var col2 = colourOf(s, r * C + c), e2 = r + 1;
            if (col2 < 0) { r++; continue; }
            while (e2 < R && colourOf(s, e2 * C + c) === col2) e2++;
            if (e2 - r >= 3) { var cs2 = []; for (var y = r; y < e2; y++) cs2.push(y * C + c); runs.push({ cells: cs2, dir: 'v', col: col2 }); }
            r = e2;
        }
        // join runs that share a square
        var groups = [];
        runs.forEach(function (run) {
            var into = null;
            for (var g = 0; g < groups.length; g++) if (groups[g].col === run.col && run.cells.some(function (x) { return groups[g].set[x]; })) { into = groups[g]; break; }
            if (!into) { into = { cells: [], set: {}, h: 0, v: 0, runs: [], col: run.col }; groups.push(into); }
            run.cells.forEach(function (x) { if (!into.set[x]) { into.set[x] = 1; into.cells.push(x); } });
            into.runs.push(run); if (run.dir === 'h') into.h = Math.max(into.h, run.cells.length); else into.v = Math.max(into.v, run.cells.length);
        });
        return groups;
    }
    function hasMove(s) { return !!anyMove(s); }
    // every swap that does something
    function allMoves(s) {
        var out = [], N = s.R * s.C;
        for (var i = 0; i < N; i++) {
            if (!movable(s, i)) continue;
            [i % s.C < s.C - 1 ? i + 1 : -1, i + s.C].forEach(function (j) { if (j >= 0 && j < N && movable(s, j) && swapWorks(s, i, j)) out.push([i, j]); });
        }
        return out;
    }
    function anyMove(s) { var m = allMoves(s); return m.length ? m[0] : null; }
    function swapWorks(s, a, b) {
        if (s.t[a] === CHERRY && s.t[b] === CHERRY) return false;
        if ((s.sp[a] && s.sp[b]) || s.t[a] === RAINBOW || s.t[b] === RAINBOW) return s.t[a] !== CHERRY && s.t[b] !== CHERRY;
        swapCells(s, a, b); var ok = matchAt(s, a) || matchAt(s, b); swapCells(s, a, b);
        return ok;
    }
    function matchAt(s, i) {
        var c = colourOf(s, i); if (c < 0) return false;
        var C = s.C, r = Math.floor(i / C), x = i % C, n = 1, k;
        for (k = x - 1; k >= 0 && colourOf(s, r * C + k) === c; k--) n++;
        for (k = x + 1; k < C && colourOf(s, r * C + k) === c; k++) n++;
        if (n >= 3) return true; n = 1;
        for (k = r - 1; k >= 0 && colourOf(s, k * C + x) === c; k--) n++;
        for (k = r + 1; k < s.R && colourOf(s, k * C + x) === c; k++) n++;
        return n >= 3;
    }
    function swapCells(s, a, b) { ['t', 'sp', 'id'].forEach(function (f) { var t = s[f][a]; s[f][a] = s[f][b]; s[f][b] = t; }); }

    // ---------- playing a move ----------
    // Returns null if the swap does nothing, otherwise a list of steps for the screen to animate:
    // { kind: 'swap'|'clear'|'fall'|'shuffle', snap, cleared: [{ i, id, t, sp }], blasts: [{ i, sp }], made: [ids], ... }
    function play(s, a, b) {
        if (s.won || s.lost || !neighbours(s, a, b) || !movable(s, a) || !movable(s, b) || !swapWorks(s, a, b)) return null;
        var steps = [];
        swapCells(s, a, b); s.moves++; s.movesLeft--;
        steps.push({ kind: 'swap', snap: snap(s) });
        var cascade = 1, first = true;
        // specials swapped together (or a rainbow swapped with anything)
        var combo = comboCells(s, a, b);
        if (combo) { clearStep(s, steps, [], combo.cells, combo.convert, cascade, combo.spent); cascade++; first = false; fall(s, steps); }
        for (var guard = 0; guard < 60; guard++) {
            var groups = findGroups(s);
            if (!groups.length) break;
            clearStep(s, steps, groups, [], null, cascade, null, first ? [a, b] : null);
            cascade++; first = false;
            fall(s, steps);
        }
        if (!hasMove(s)) { shuffle(s); steps.push({ kind: 'shuffle', snap: snap(s) }); }
        checkEnd(s);
        return steps;
    }
    // what a special-special (or rainbow) swap clears: { cells, convert, spent }
    function comboCells(s, a, b) {
        var A = { t: s.t[a], sp: s.sp[a] }, B = { t: s.t[b], sp: s.sp[b] }, R = s.R, C = s.C, cells = [], N = R * C, i;
        if (A.t !== RAINBOW && B.t !== RAINBOW && !(A.sp && B.sp)) return null;
        var spent = {}; spent[a] = 1; spent[b] = 1;
        function row(r) { for (var x = 0; x < C; x++) cells.push(r * C + x); }
        function colm(c) { for (var y = 0; y < R; y++) cells.push(y * C + c); }
        if (A.t === RAINBOW && B.t === RAINBOW) { for (i = 0; i < N; i++) cells.push(i); return { cells: cells, spent: spent }; }
        if (A.t === RAINBOW || B.t === RAINBOW) {
            var other = A.t === RAINBOW ? B : A, self = A.t === RAINBOW ? a : b, col = other.t;
            cells.push(a, b);
            // every sweet of that colour goes; if the other was striped or wrapped, they all turn into that first
            var convert = other.sp ? {} : null;
            for (i = 0; i < N; i++) if (colourOf(s, i) === col) { cells.push(i); if (convert) convert[i] = other.sp === 3 ? 3 : (s.rand() < 0.5 ? 1 : 2); }
            return { cells: cells, convert: convert, spent: spent };
        }
        // two specials
        var r0 = Math.floor(b / C), c0 = b % C, line = function (sp) { return sp === 1 || sp === 2; };
        if (line(A.sp) && line(B.sp)) { row(r0); colm(c0); }
        else if ((line(A.sp) && B.sp === 3) || (A.sp === 3 && line(B.sp))) { for (var d = -1; d <= 1; d++) { if (r0 + d >= 0 && r0 + d < R) row(r0 + d); if (c0 + d >= 0 && c0 + d < C) colm(c0 + d); } }
        else { for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) { var y = r0 + dy, x = c0 + dx; if (y >= 0 && y < R && x >= 0 && x < C) cells.push(y * C + x); } }
        cells.push(a, b);
        return { cells: cells, spent: spent };
    }
    // clear matched groups (making specials) plus extra cells, setting off any specials caught up in it
    function clearStep(s, steps, groups, extra, convert, cascade, spent, swapCellsHint) {
        var C = s.C, R = s.R, clear = {}, queue = [], made = [], blasts = [], hitCrate = {}, cleared = [];
        spent = spent || {};
        if (convert) Object.keys(convert).forEach(function (k) { s.sp[k] = convert[k]; });
        groups.forEach(function (g) {
            // where a special appears: the square you swapped into, if it's in the group; otherwise the middle
            var at = -1;
            if (swapCellsHint) swapCellsHint.forEach(function (x) { if (at < 0 && g.set[x]) at = x; });
            if (at < 0) { var inter = g.cells.filter(function (x) { return g.runs.filter(function (rn) { return rn.cells.indexOf(x) >= 0; }).length > 1; }); at = inter.length ? inter[0] : g.cells[Math.floor(g.cells.length / 2)]; }
            var kind = 0, five = g.runs.some(function (rn) { return rn.cells.length >= 5; });
            if (five) kind = 4; else if (g.h >= 3 && g.v >= 3) kind = 3; else if (g.h === 4) kind = 2; else if (g.v === 4) kind = 1;
            g.cells.forEach(function (x) {
                // crates next to a match get knocked
                [x - C, x + C, x % C ? x - 1 : -1, x % C < C - 1 ? x + 1 : -1].forEach(function (q) { if (q >= 0 && q < R * C && s.crate[q]) hitCrate[q] = 1; });
                if (x === at && kind) return;
                queue.push(x);
            });
            if (kind) {
                // the sweet already in that square might itself be special: it goes off, and the new one takes its place
                if (s.sp[at]) queue.push(at);
                made.push({ i: at, t: kind === 4 ? RAINBOW : g.col, sp: kind });
                s.score += [0, 120, 120, 200, 300][kind];
            }
        });
        extra.forEach(function (x) { queue.push(x); });
        var madeAt = {}; made.forEach(function (m) { madeAt[m.i] = 1; });
        while (queue.length) {
            var x = queue.shift();
            if (clear[x] || x < 0 || x >= R * C || !s.mask[x]) continue;
            if (s.crate[x]) { hitCrate[x] = 1; continue; }
            if (s.t[x] === CHERRY) continue;   // cherries can't be blown up: they have to reach the bottom
            if (s.t[x] < 0 && !madeAt[x]) continue;
            if (madeAt[x] && s.sp[x] === 0) continue;
            clear[x] = 1;
            var sp = s.sp[x];
            if (sp && !spent[x]) {
                // a special caught in the blast goes off too
                spent[x] = 1; blasts.push({ i: x, sp: sp });
                var r = Math.floor(x / C), c = x % C, y, xx;
                if (sp === 1) for (xx = 0; xx < C; xx++) queue.push(r * C + xx);
                else if (sp === 2) for (y = 0; y < R; y++) queue.push(y * C + c);
                else if (sp === 3) { for (y = r - 1; y <= r + 1; y++) for (xx = c - 1; xx <= c + 1; xx++) if (y >= 0 && y < R && xx >= 0 && xx < C) queue.push(y * C + xx); }
                else if (sp === 4) { var col = mostCommon(s); for (var q = 0; q < R * C; q++) if (colourOf(s, q) === col) queue.push(q); }
            }
        }
        Object.keys(clear).forEach(function (k) {
            var x = +k;
            cleared.push({ i: x, id: s.id[x], t: s.t[x], sp: s.sp[x] });
            if (colourOf(s, x) >= 0) s.collected[colourOf(s, x)]++;
            if (s.jelly[x]) { s.jelly[x]--; s.score += 100; }
            s.score += 20 * cascade;
            s.t[x] = -1; s.sp[x] = 0; s.id[x] = 0;
        });
        Object.keys(hitCrate).forEach(function (k) { var q = +k; if (s.crate[q]) { s.crate[q]--; s.score += 100; } });
        made.forEach(function (m) { s.t[m.i] = m.t; s.sp[m.i] = m.sp; s.id[m.i] = s.nextId++; });
        steps.push({ kind: 'clear', snap: snap(s), cleared: cleared, blasts: blasts, made: made.map(function (m) { return s.id[m.i]; }), crates: Object.keys(hitCrate).map(Number), cascade: cascade });
    }
    function mostCommon(s) { var n = [0, 0, 0, 0, 0, 0], best = 0; for (var i = 0; i < s.R * s.C; i++) { var c = colourOf(s, i); if (c >= 0) n[c]++; } for (var c2 = 1; c2 < 6; c2++) if (n[c2] > n[best]) best = c2; return best; }

    // ---------- sweets fall and new ones drop in ----------
    function fall(s, steps) {
        var R = s.R, C = s.C, N = R * C, changed = true, guard = 0, spawned = [], dropped = [];
        function fillable(i) { return s.mask[i] && !s.crate[i] && s.t[i] < 0; }
        // the top square of each column, where new sweets come in
        var spawnAt = []; for (var c = 0; c < C; c++) for (var r = 0; r < R; r++) { var i0 = r * C + c; if (s.mask[i0]) { if (!s.crate[i0]) spawnAt.push(i0); break; } }
        while (changed && guard++ < 400) {
            changed = false;
            // straight down
            for (var i = N - 1 - C; i >= 0; i--) if (movable(s, i) && fillable(i + C)) { moveTo(s, i, i + C); changed = true; }
            if (changed) continue;
            // new sweets at the top
            spawnAt.forEach(function (q) { if (fillable(q)) { spawn(s, q); spawned.push(s.id[q]); changed = true; } });
            if (changed) continue;
            // a gap with nothing able to fall straight into it takes a sweet sliding in from beside
            for (i = N - 1; i >= C && !changed; i--) {
                if (!fillable(i) || feedsFromAbove(s, i)) continue;
                var x = i % C, cands = [x > 0 ? i - C - 1 : -1, x < C - 1 ? i - C + 1 : -1];
                for (var k = 0; k < 2 && !changed; k++) { var q2 = cands[k]; if (q2 >= 0 && movable(s, q2)) { moveTo(s, q2, i); changed = true; } }
            }
            // cherries that reach the bottom are collected
            if (!changed) for (i = 0; i < N; i++) if (s.t[i] === CHERRY && atBottom(s, i)) { dropped.push({ i: i, id: s.id[i] }); s.t[i] = -1; s.sp[i] = 0; s.id[i] = 0; s.cherriesIn--; s.cherriesDone++; s.score += 1000; changed = true; }
        }
        steps.push({ kind: 'fall', snap: snap(s), spawned: spawned, dropped: dropped });
    }
    function moveTo(s, from, to) { s.t[to] = s.t[from]; s.sp[to] = s.sp[from]; s.id[to] = s.id[from]; s.t[from] = -1; s.sp[from] = 0; s.id[from] = 0; }
    // could something still fall straight down into this square?
    function feedsFromAbove(s, i) {
        for (var q = i - s.C; q >= 0; q -= s.C) { if (!s.mask[q] || s.crate[q]) return false; if (s.t[q] >= 0) return true; }
        // reached the top: a spawner feeds it if the column's top square is open
        var top = i % s.C; while (top < i && !s.mask[top]) top += s.C;
        return s.mask[top] && !s.crate[top];
    }
    function atBottom(s, i) { var q = i + s.C; return q >= s.R * s.C || !s.mask[q]; }
    function spawn(s, q) {
        // a cherry now and then, while there are cherries to come and fewer than two on the board
        if (s.cherriesToCome > 0 && s.cherriesIn < 2 && s.rand() < 0.2) { s.t[q] = CHERRY; s.cherriesToCome--; s.cherriesIn++; }
        else s.t[q] = Math.floor(s.rand() * s.k);
        s.sp[q] = 0; s.id[q] = s.nextId++;
    }
    // no moves left: mix the sweets up (specials and cherries included) until there's a move and no ready-made match
    function shuffle(s) {
        var N = s.R * s.C, cells = [], items = [], i;
        for (i = 0; i < N; i++) if (movable(s, i)) { cells.push(i); items.push({ t: s.t[i], sp: s.sp[i], id: s.id[i] }); }
        for (var tries = 0; tries < 100; tries++) {
            for (i = items.length - 1; i > 0; i--) { var j = Math.floor(s.rand() * (i + 1)); var t = items[i]; items[i] = items[j]; items[j] = t; }
            cells.forEach(function (c, k) { s.t[c] = items[k].t; s.sp[c] = items[k].sp; s.id[c] = items[k].id; });
            if (!findGroups(s).length && hasMove(s)) return;
        }
        // very crowded boards: recolour plain sweets
        for (i = 0; i < N; i++) if (movable(s, i) && !s.sp[i] && s.t[i] < 6) s.t[i] = Math.floor(s.rand() * s.k);
        if (findGroups(s).length || !hasMove(s)) shuffle(s);
    }
    // a hammer smashes one square: a sweet (setting off a special), or a knock on a crate
    function smash(s, i) {
        if (s.won || s.lost || !s.mask[i]) return null;
        if (!s.crate[i] && (s.t[i] < 0 || s.t[i] === CHERRY)) return null;
        var steps = [];
        clearStep(s, steps, [], [i], null, 1, null);
        fall(s, steps);
        for (var g = 0, cascade = 2; g < 60; g++, cascade++) { var groups = findGroups(s); if (!groups.length) break; clearStep(s, steps, groups, [], null, cascade); fall(s, steps); }
        if (!hasMove(s)) { shuffle(s); steps.push({ kind: 'shuffle', snap: snap(s) }); }
        checkEnd(s);
        return steps;
    }
    function shuffleNow(s) { shuffle(s); return [{ kind: 'shuffle', snap: snap(s) }]; }
    function addMoves(s, n) { s.movesLeft += n; s.lost = false; }

    // ---------- goals ----------
    function goalLeft(s, g) {
        if (g.type === 'score') return Math.max(0, g.n - s.score);
        if (g.type === 'colour') return Math.max(0, g.n - s.collected[g.c]);
        if (g.type === 'jelly') { var n = 0; for (var i = 0; i < s.jelly.length; i++) n += s.jelly[i]; return n; }
        if (g.type === 'crate') { var m = 0; for (var j = 0; j < s.crate.length; j++) if (s.crate[j]) m++; return m; }
        if (g.type === 'cherry') return Math.max(0, g.n - s.cherriesDone);
        return 0;
    }
    function goalsMet(s) { return s.goals.every(function (g) { return goalLeft(s, g) === 0; }); }
    function checkEnd(s) { if (goalsMet(s)) s.won = true; else if (s.movesLeft <= 0) s.lost = true; }
    // finishing early: every move left over is worth a bonus
    function finishBonus(s) { var b = s.movesLeft * 250; s.score += b; return b; }

    function snap(s) { return { t: s.t.slice(), sp: s.sp.slice(), id: s.id.slice(), jelly: s.jelly.slice(), crate: s.crate.slice(), score: s.score, collected: s.collected.slice(), cherriesDone: s.cherriesDone }; }
    // saving and picking up a game: everything but the dice, which get a fresh seed
    function save(s) { var o = {}; for (var k in s) if (k !== 'rand') o[k] = s[k]; return JSON.parse(JSON.stringify(o)); }
    function revive(o, seed) { o.rand = rng(seed); return o; }

    // ---------- a computer player, used to make sure levels are fair ----------
    // Tries every swap on a copy that rolls its own dice (no peeking at what will drop in), and picks the one that
    // does the most for the goals.
    function botMove(s, seed) {
        var moves = allMoves(s), best = null, bestV = -1e9;
        for (var k = 0; k < moves.length; k++) {
            var t = cloneBlind(s, seed + k * 7919), before = progress(t);
            if (!play(t, moves[k][0], moves[k][1])) continue;
            var v = progress(t) - before + t.score / 2000;
            for (var i = 0; i < t.sp.length; i++) if (t.sp[i]) v += t.sp[i] === 4 ? 6 : t.sp[i] === 3 ? 4 : 3;
            if (t.won) v += 1000;
            if (v > bestV) { bestV = v; best = moves[k]; }
        }
        return best;
    }
    function progress(s) {
        var v = 0, i;
        s.goals.forEach(function (g) {
            if (g.type === 'score') v += Math.min(s.score, g.n) / 150;
            else if (g.type === 'colour') v += Math.min(s.collected[g.c], g.n) * 3;
            else if (g.type === 'jelly') v -= goalLeft(s, g) * 6;
            else if (g.type === 'crate') { for (i = 0; i < s.crate.length; i++) v -= s.crate[i] * 5; }
            else if (g.type === 'cherry') { v += s.cherriesDone * 40; for (i = 0; i < s.t.length; i++) if (s.t[i] === CHERRY) v += Math.floor(i / s.C) * 3; }
        });
        return v;
    }
    // play a level to the end: { won, score, movesUsed }
    function botGame(level, seed) {
        var s = newGame(level, seed), guard = 0;
        while (!s.won && !s.lost && guard++ < 200) { var m = botMove(s, seed + guard * 31); if (!m) break; play(s, m[0], m[1]); }
        if (s.won) finishBonus(s);
        return { won: s.won, score: s.score, movesUsed: s.moves, s: s };
    }

    var api = { VERSION: 1, RAINBOW: RAINBOW, CHERRY: CHERRY, newGame: newGame, clone: clone, play: play, smash: smash, shuffleNow: shuffleNow, addMoves: addMoves,
        allMoves: allMoves, hasMove: hasMove, swapWorks: swapWorks, neighbours: neighbours, movable: movable, goalLeft: goalLeft, goalsMet: goalsMet,
        finishBonus: finishBonus, save: save, revive: revive, findGroups: findGroups, botMove: botMove, botGame: botGame, snap: snap };
    root.PickMix = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
