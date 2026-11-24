/* Level designer's helper: node tools/try.js <level number> [--watch id[,id]] [--map tick] 
   Replays the level's solution and reports who was saved; --watch prints where those wanderlings are every 10 steps;
   --map prints the world as text at that step (# dirt, S steel, ~ water, o wanderling, E exit, H hatch). */
global.window = global; require('../levels.js');
const W = require('../engine.js'), args = process.argv.slice(2), n = +args[0], L = window.WANDERLINGS_LEVELS[n - 1];
const watch = (args[args.indexOf('--watch') + 1] || '').split(',').filter(x => args.includes('--watch')).map(Number);
const mapAt = args.includes('--map') ? +args[args.indexOf('--map') + 1] : -1;
const g = W.newGame(L), moves = (L.solution || []).slice().sort((a, b) => a[0] - b[0]); let k = 0;
function map() { let out = ''; for (let y = 0; y < g.H; y += 4) { let row = ''; for (let x = 0; x < g.W; x += 2) { let ch = ' '; const c = W.cell(g, x, y) || W.cell(g, x + 1, y) || W.cell(g, x, y + 2); if (c === 1) ch = '#'; if (c === 2) ch = 'S'; if ((L.water || []).some(w => x >= w[0] && x < w[0] + w[2] && y >= w[1] && y < w[1] + w[3])) ch = '~';
    if (Math.abs(x - L.exit[0]) <= 2 && Math.abs(y - L.exit[1]) <= 4) ch = 'E'; if (Math.abs(x - L.hatch[0]) <= 2 && Math.abs(y - L.hatch[1]) <= 4) ch = 'H';
    g.all.forEach(c2 => { if (c2.alive && Math.abs(c2.x - x) <= 1 && c2.y >= y && c2.y < y + 4) ch = 'o'; }); row += ch; } out += row.replace(/\s+$/, '') + '\n'; } return out; }
while (!g.over) {
    while (k < moves.length && moves[k][0] <= g.tick) { const m = moves[k++]; const ok = m[2] === 'nuke' ? (W.nuke(g), true) : W.assign(g, m[1], m[2]); const c = g.all[m[1]]; console.log('tick', g.tick, 'give', m[2], 'to', m[1], ok ? 'OK' : 'REFUSED', c ? `(at ${c.x},${c.y} ${c.st})` : '(not out yet)'); }
    if (watch.length && g.tick % 10 === 0) watch.forEach(id => { const c = g.all[id]; if (c) console.log(' t' + g.tick, 'id' + id, c.alive ? `${c.x},${c.y} ${c.st} dir${c.dir}` : (c.home ? 'HOME' : 'gone:' + c.how)); });
    if (g.tick === mapAt) console.log(map());
    W.step(g);
}
const how = {}; g.all.forEach(c => { const h = c.home ? 'home' : c.how; how[h] = (how[h] || 0) + 1; });
console.log(`Level ${n} "${L.name}": saved ${g.saved}/${L.count}, needed ${L.need} -> ${g.saved >= L.need ? 'PASS' : 'FAIL'} | at tick ${g.tick} | ${JSON.stringify(how)} | jobs left ${JSON.stringify(g.skills)}`);
if (mapAt === -2) console.log(map());
