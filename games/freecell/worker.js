/* Deals and hints for FreeCell, worked out off the main thread. */
importScripts('engine.js');
onmessage = function (e) {
    var d = e.data, F = self.FreeCell;
    if (d.type === 'solve') { var r = F.solve(d.g, 60000); postMessage({ id: d.id, type: 'solve', win: r.win, path: r.path }); return; }
    postMessage({ id: d.id, type: 'deal', deal: d.winnable ? F.winnableDeal(d.seed) : F.deal(d.seed) });
};
