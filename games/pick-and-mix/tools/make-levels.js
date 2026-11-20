/* Builds Pick & Mix's 100 levels: node tools/make-levels.js > levels.js
   Each level's move limit is set by playing it with the computer player many times with different sweets: the
   smallest limit it wins at least the target share of games with, plus a little slack. Star scores come from the
   scores it reached. */
const P = require('../engine.js');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// board shapes, 8x8 ('.' square, ' ' gap)
const SHAPES = {
    full: ['........', '........', '........', '........', '........', '........', '........', '........'],
    corners: [' ...... ', '........', '........', '........', '........', '........', '........', ' ...... '],
    bigcorners: ['  ....  ', ' ...... ', '........', '........', '........', '........', ' ...... ', '  ....  '],
    plus: ['  ....  ', '  ....  ', '........', '........', '........', '........', '  ....  ', '  ....  '],
    holes: ['........', '........', '..    ..', '........', '........', '..    ..', '........', '........'],
    hourglass: ['........', ' ...... ', '  ....  ', '   ..   ', '  ....  ', ' ...... ', '........', '........'],
    pillars: ['........', '........', '. .. . .', '. .. . .', '........', '........', '........', '........'],
    vase: [' ...... ', ' ...... ', '........', '........', '........', ' ...... ', ' ...... ', '  ....  '],
};
const flat = rows => rows.join('');
// patterns over an 8x8 board, as functions (r, c) -> layer
const JELLY = {
    centre: (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 1 : 0,
    bottom: (r, c) => r >= 5 ? 1 : 0,
    ring: (r, c) => (r === 1 || r === 6 || c === 1 || c === 6) && r >= 1 && r <= 6 && c >= 1 && c <= 6 ? 1 : 0,
    cross: (r, c) => r === 3 || r === 4 || c === 3 || c === 4 ? 1 : 0,
    all: () => 1,
    doublecentre: (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 2 : (r >= 1 && r <= 6 && c >= 1 && c <= 6 ? 1 : 0),
    stripes: (r, c) => r % 2 === 0 ? 1 : 0,
};
const CRATE = {
    bottom1: (r, c) => r === 7 ? 1 : 0,
    bottom2: (r, c) => r >= 6 ? (r === 7 ? 2 : 1) : 0,
    centre: (r, c) => r >= 3 && r <= 4 && c >= 2 && c <= 5 ? 1 : 0,
    centre2: (r, c) => r >= 3 && r <= 4 && c >= 2 && c <= 5 ? 2 : 0,
    sides: (r, c) => (c === 0 || c === 7) && r >= 3 ? 1 : 0,
    scatter: (r, c) => ((r * 3 + c * 5) % 7 === 0 && r >= 2) ? 1 : 0,
    band: (r, c) => r === 4 && c !== 3 && c !== 4 ? 2 : 0,
};
function layer(fn, mask) { let s = ''; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s += mask[r * 8 + c] === ' ' ? '0' : String(fn(r, c)); return s; }

// what each level asks for
function design(n, R) {
    const pick = arr => arr[Math.floor(R() * arr.length)];
    const k = n <= 25 ? 5 : n <= 45 ? (n % 3 === 0 ? 6 : 5) : (n % 3 === 0 ? 5 : 6);
    let shape = n <= 8 ? 'full' : n <= 20 ? pick(['full', 'full', 'corners', 'bigcorners']) : pick(Object.keys(SHAPES));
    const mask = flat(SHAPES[shape]);
    const L = { R: 8, C: 8, k, mask, goals: [] };
    let kind;
    if (n <= 3) kind = 'score';
    else if (n <= 6) kind = 'colour';
    else if (n <= 10) kind = 'jelly';
    else if (n <= 15) kind = 'crate';
    else if (n <= 20) kind = 'cherry';
    else kind = pick(['score', 'colour', 'jelly', 'jelly', 'crate', 'crate', 'cherry', 'jelly+crate', 'cherry+jelly', 'colour+crate']);
    const parts = kind.split('+');
    parts.forEach(p => {
        if (p === 'colour') { const a = Math.floor(R() * k); let b = (a + 1 + Math.floor(R() * (k - 1))) % k; const amt = 15 + Math.min(25, Math.floor(n / 3)); L.goals.push({ type: 'colour', c: a, n: amt }); if (n > 5 && R() < 0.6) L.goals.push({ type: 'colour', c: b, n: amt }); }
        if (p === 'jelly') { const pat = n <= 8 ? 'centre' : pick(n < 30 ? ['centre', 'bottom', 'ring', 'cross'] : Object.keys(JELLY)); L.jelly = layer(JELLY[pat], mask); L.goals.push({ type: 'jelly' }); }
        if (p === 'crate') { const pat = n <= 12 ? 'bottom1' : pick(n < 30 ? ['bottom1', 'centre', 'sides', 'scatter'] : Object.keys(CRATE)); L.crate = layer(CRATE[pat], mask); L.goals.push({ type: 'crate' }); }
        if (p === 'cherry') { L.cherries = n <= 17 ? 2 : 3 + (n > 50 ? 1 : 0); L.goals.push({ type: 'cherry', n: L.cherries }); }
    });
    if (kind === 'score') L.goals.push({ type: 'score', n: 0 });   // amount set after testing
    // a crate can't sit where jelly is
    if (L.jelly && L.crate) L.jelly = L.jelly.split('').map((j, i) => L.crate[i] !== '0' ? '0' : j).join('');
    return { L, kind, shape };
}
function trial(L, moves, games, seed) { const T = Object.assign({}, L, { moves }); const res = []; for (let g = 0; g < games; g++) res.push(P.botGame(T, seed + g * 977)); return res; }
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const out = [];
for (let n = 1; n <= 100; n++) {
    const R = rng(n * 7919 + 13);
    let lv, info;
    for (let attempt = 0; attempt < 25; attempt++) {
        const d = design(n, R); const L = d.L;
        const target = n <= 10 ? 0.95 : n <= 40 ? 0.85 : 0.75, slack = n <= 10 ? 3 : n <= 40 ? 2 : 1, games = 24;
        if (L.goals[0].type === 'score') {
            const moves = 15 + Math.min(10, Math.floor(n / 8));
            const res = trial(L, moves, games, n * 1000);
            L.goals[0].n = Math.round(pct(res.map(r => r.score), 1 - target) * 0.9 / 500) * 500;
            L.moves = moves;
        } else {
            // the fewest moves the computer player wins with, often enough
            let lo = 6, hi = 40, ok = null;
            while (lo <= hi) { const mid = (lo + hi) >> 1; const res = trial(L, mid, games, n * 1000); const rate = res.filter(r => r.won).length / games; if (rate >= target) { ok = mid; hi = mid - 1; } else lo = mid + 1; }
            if (!ok || ok > 32) continue;
            L.moves = ok + slack;
        }
        // stars: 1 for finishing, 2 and 3 from how well the computer player scored with the final move limit
        const final = trial(L, L.moves, games, n * 1000 + 55);
        const wins = final.filter(r => r.won).map(r => r.score);
        if (wins.length < games * 0.6) continue;
        const s1 = L.goals[0].type === 'score' ? L.goals[0].n : 0;
        const s2 = Math.max(s1 + 500, Math.round(pct(wins, 0.35) / 500) * 500), s3 = Math.max(s2 + 1000, Math.round(pct(wins, 0.7) / 500) * 500);
        L.stars = [s1, s2, s3];
        lv = L; info = { n, kind: d.kind, shape: d.shape, moves: L.moves, win: Math.round(100 * wins.length / games) + '%', stars: L.stars };
        break;
    }
    if (!lv) throw new Error('level ' + n + ' failed');
    out.push(lv);
    process.stderr.write(JSON.stringify(info) + '\n');
}
process.stdout.write('/* Pick & Mix levels, made by tools/make-levels.js. Each one has been played by a computer player many times\n   to set a fair move limit and star scores. Don\'t reorder: level numbers would change. */\nwindow.PICKMIX_LEVELS = ' + JSON.stringify(out) + ';\n');
