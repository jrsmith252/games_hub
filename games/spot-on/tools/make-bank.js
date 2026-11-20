/* Builds the Spot On puzzle bank: node tools/make-bank.js <level> <count> <firstSeed> <out.txt>
   Each puzzle is the best of a large batch, can be worked out by reasoning alone (Hard may need the "try it" step),
   and is double-checked by brute force to have exactly one answer. One encoded puzzle per line. */
const S = require('../engine.js'), fs = require('fs');
const [level, count, first, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
let made = 0;
for (let seed = first; made < count; seed++) {
    const p = S.make(seed, level, 60);
    if (!p) continue;
    const q = S.decode(S.encode(p));
    if (S.countSolutions(q, 2, 8000000).count !== 1) continue;
    if (!S.logicSolve(q, level === 'hard').solved) continue;
    fs.appendFileSync(out, S.encode(p) + '\n'); made++;
}
