/* Re-sets each level's 2 and 3 star scores (keeping its moves) by having the computer player play it again:
   node tools/restar.js > levels.js. Used when scoring changes, e.g. the sugar rush finale. */
global.window = global; require('../levels.js');
const P = require('../engine.js'), L = window.PICKMIX_LEVELS;
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
L.forEach((lv, i) => {
    const wins = []; for (let g = 0; g < 30; g++) { const r = P.botGame(lv, (i + 1) * 5000 + g * 977); if (r.won) wins.push(r.score); }
    const s1 = lv.stars[0], s2 = Math.max(s1 + 500, Math.round(pct(wins, 0.35) / 500) * 500), s3 = Math.max(s2 + 1500, Math.round(pct(wins, 0.7) / 500) * 500);
    lv.stars = [s1, s2, s3];
    process.stderr.write((i + 1) + ' ' + wins.length + '/30 ' + JSON.stringify(lv.stars) + '\n');
});
process.stdout.write('/* Pick & Mix levels, made by tools/make-levels.js (star scores re-set by tools/restar.js). Each one has been played by a\n   computer player many times to set a fair move limit and star scores. Don\'t reorder: level numbers would change. */\nwindow.PICKMIX_LEVELS = ' + JSON.stringify(L) + ';\n');
