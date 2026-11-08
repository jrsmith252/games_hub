/* Builds Depot Dash levels off the main thread so the game never freezes. */
importScripts('engine.js');
self.onmessage = function (e) {
    var n = e.data && e.data.n;
    try {
        self.postMessage({ n: n, level: self.DepotEngine.generate(n) });
    } catch (err) {
        self.postMessage({ n: n, error: String(err && err.message || err) });
    }
};
