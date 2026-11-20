/* Works out Spot On hints and answers off the main thread. */
importScripts('engine.js');
onmessage = function (e) {
    var d = e.data, S = self.SpotOn;
    if (d.type === 'solve') { var r = S.countSolutions(d.puzzle, 1, 2000000, d.fixed); postMessage({ id: d.id, tiles: r.count ? r.tiles[0] : null }); }
};
