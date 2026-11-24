/* Checks every level: its solution passes, doing nothing fails (when it gives you jobs), and how much slack the
   timing of each move has (the range of steps it can be given and still pass, with the other moves unchanged). */
global.window = global; require('../levels.js');
const W = require('../engine.js'); let bad = 0;
window.WANDERLINGS_LEVELS.forEach((L, i) => {
    const sol = L.solution || [], g = W.replay(L, sol), pass = g.saved >= L.need;
    const jobs = Object.values(L.skills || {}).reduce((a, b) => a + b, 0);
    const idle = jobs ? W.replay(L, []).saved : null;
    if (!pass || (jobs && idle >= L.need)) bad++;
    const windows = sol.map((m, k) => { let lo = 0, hi = 0;
        while (lo < 60 && W.replay(L, sol.map((x, j) => j === k ? [x[0] - lo - 1, x[1], x[2]] : x)).saved >= L.need) lo++;
        while (hi < 60 && W.replay(L, sol.map((x, j) => j === k ? [x[0] + hi + 1, x[1], x[2]] : x)).saved >= L.need) hi++;
        return lo + hi + 1; });
    const tightest = windows.length ? Math.min(...windows) : null;
    console.log(String(i + 1).padStart(2), L.name.padEnd(18), 'solution saves', g.saved + '/' + L.count, 'need', L.need, pass ? 'PASS' : 'FAIL',
        jobs ? '| doing nothing saves ' + idle + (idle >= L.need ? ' (TOO EASY)' : '') : '', tightest !== null ? '| tightest timing window ' + (tightest / W.TPS).toFixed(1) + 's' : '');
});
console.log(bad ? bad + ' problem(s)' : 'All levels OK');
process.exit(bad ? 1 : 0);
