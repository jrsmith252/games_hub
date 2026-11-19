/* Makes Spot On puzzles and works out hints off the main thread (a hard puzzle can take a second or two). */
importScripts('engine.js');
onmessage = function (e) {
    var d = e.data, S = self.SpotOn;
    if (d.type === 'make') { postMessage({ id: d.id, puzzle: d.day ? S.daily(d.day, d.level) : S.make(d.seed, d.level) }); return; }
    if (d.type === 'solve') { var r = S.countSolutions(d.puzzle, 1, 2000000, d.fixed); postMessage({ id: d.id, tiles: r.count ? r.tiles[0] : null }); }
};
