/* Finds a winnable Pyramid deal off the main thread. */
importScripts('engine.js');
onmessage = function (e) { var d = e.data; postMessage({ id: d.id, deal: d.winnable ? self.Pyramid.winnableDeal(d.seed) : self.Pyramid.deal(d.seed) }); };
