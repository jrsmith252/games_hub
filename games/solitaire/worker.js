/* Finds a winnable deal off the main thread so the screen never stalls. */
importScripts('engine.js');
self.onmessage = function (e) {
    var d = e.data, deal = d.winnable ? self.Solitaire.winnableDeal(d.seed, d.draw, 20000) : self.Solitaire.deal(d.seed, d.draw);
    self.postMessage({ id: d.id, deal: deal });
};
