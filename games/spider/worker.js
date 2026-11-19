/* Deals and hints for Spider, worked out off the main thread. */
importScripts('engine.js');
onmessage = function (e) {
    var d = e.data, P = self.Spider;
    if (d.type === 'solve') { var r = P.solve(d.g, 25000); postMessage({ id: d.id, type: 'solve', win: r.win, path: r.path }); return; }
    var deal = d.winnable ? P.winnableDeal(d.seed, d.suits) : null;
    postMessage({ id: d.id, type: 'deal', deal: deal || P.deal(d.seed, d.suits) });
};
