/* Builds Way Out levels off the main thread so the screen never freezes. */
importScripts('engine.js');
self.onmessage = function (e) {
    var n = e.data;
    try { self.postMessage({ n: n, level: self.WayOutEngine.generate(n) }); }
    catch (err) { self.postMessage({ n: n, error: String(err) }); }
};
