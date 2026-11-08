/* Builds Depot Dash levels off the main thread so the game never freezes. */
importScripts('engine.js');
self.onmessage = function (e) {
    var n = e.data && e.data.n, shape = e.data && e.data.shape;
    try {
        self.postMessage({ n: n, shape: shape, level: self.DepotEngine.generate(n, shape) });
    } catch (err) {
        self.postMessage({ n: n, shape: shape, error: String(err && err.message || err) });
    }
};
