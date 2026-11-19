/* Finds a winnable TriPeaks deal off the main thread. */
importScripts('engine.js');
onmessage = function (e) { var d = e.data; postMessage({ id: d.id, deal: d.winnable ? self.TriPeaks.winnableDeal(d.seed) : self.TriPeaks.deal(d.seed) }); };
