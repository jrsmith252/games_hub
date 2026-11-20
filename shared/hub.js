/* Shared helpers for all Game Hub pages. Plain script (no modules) so it works
   from file://, GitHub Pages and inside a native WebView. */
(function () {
    'use strict';

    // ---- Safe storage: never throws, falls back to memory when storage is blocked ----
    var memory = {};
    function rawGet(key) {
        try { var v = window.localStorage.getItem(key); return v === null ? (key in memory ? memory[key] : null) : v; }
        catch (e) { return key in memory ? memory[key] : null; }
    }
    function rawSet(key, value) {
        memory[key] = String(value);
        try { window.localStorage.setItem(key, String(value)); } catch (e) { /* storage blocked: memory only */ }
    }
    function rawRemove(key) {
        delete memory[key];
        try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }

    var HubStorage = {
        getString: function (key, fallback) { var v = rawGet(key); return v === null ? fallback : v; },
        setString: rawSet,
        remove: rawRemove,
        // Integer >= min, else fallback (handles NaN, null, junk, negatives)
        getInt: function (key, fallback, min) {
            var n = parseInt(rawGet(key), 10);
            if (!isFinite(n) || n < (min === undefined ? 0 : min)) return fallback === undefined ? 0 : fallback;
            return n;
        },
        setInt: function (key, n) { rawSet(key, String(Math.floor(Number(n) || 0))); },
        getFlag: function (key) { return rawGet(key) === 'true'; },
        setFlag: function (key, on) { rawSet(key, on ? 'true' : 'false'); },
        // JSON object merged over defaults; wrong-shaped or corrupt data falls back to defaults.
        // `validators` (optional): { field: function(value) -> boolean } — invalid fields reset to default.
        getObject: function (key, defaults, validators) {
            var out = JSON.parse(JSON.stringify(defaults || {}));
            var parsed = null;
            try { parsed = JSON.parse(rawGet(key)); } catch (e) { parsed = null; }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
            Object.keys(out).forEach(function (field) {
                if (!(field in parsed)) return;
                var v = parsed[field];
                var ok = validators && validators[field]
                    ? validators[field](v)
                    : typeof v === typeof out[field] && !(typeof v === 'number' && !isFinite(v));
                if (ok) out[field] = v;
            });
            return out;
        },
        setObject: function (key, obj) { try { rawSet(key, JSON.stringify(obj)); } catch (e) { /* ignore */ } }
    };
    // Validator: positive integer (puzzle numbers, level numbers)
    HubStorage.isPosInt = function (v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1; };
    HubStorage.isNonNegInt = function (v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0; };
    window.HubStorage = HubStorage;

    // ---- Seeded RNG (mulberry32) — identical on every device/browser ----
    window.HubRandom = {
        create: function (seed) {
            var a = (Math.floor(Number(seed)) || 1) >>> 0;
            return function () {
                a = (a + 0x6D2B79F5) >>> 0;
                var t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        },
        // Unbiased Fisher-Yates using a supplied random function
        shuffle: function (arr, rnd) {
            var a = arr.slice();
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(rnd() * (i + 1));
                var t = a[i]; a[i] = a[j]; a[j] = t;
            }
            return a;
        }
    };

    // ---- Pause helper: call HubPause.onChange(fn(paused)) — fires on tab hide/show ----
    var listeners = [];
    window.HubPause = {
        onChange: function (fn) { listeners.push(fn); },
        isHidden: function () { return document.hidden; }
    };
    document.addEventListener('visibilitychange', function () {
        listeners.forEach(function (fn) { try { fn(document.hidden); } catch (e) { /* ignore */ } });
    });
    window.addEventListener('pagehide', function () {
        listeners.forEach(function (fn) { try { fn(true); } catch (e) { /* ignore */ } });
    });

    // ---- Keep the phone's swipe-from-the-edge "back" gesture out of a play area ----
    // Games where you drag things call HubNoSwipeBack(theirPlayArea). Leaving is what the ‹ button is for.
    window.HubNoSwipeBack = function (el, opts) {
        opts = opts || {};
        var EDGE = 30, start = null;
        if (el) {
            // iOS Safari: a touch that starts right at the screen edge won't begin the back swipe. Stopping it also
            // stops the tap's click, so a tap there is passed on by hand.
            el.addEventListener('touchstart', function (e) {
                var t = e.touches[0]; start = null;
                if (!t || e.touches.length > 1) return;
                if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) { e.preventDefault(); start = { x: t.clientX, y: t.clientY, target: e.target }; }
            }, { passive: false });
            el.addEventListener('touchend', function (e) {
                var t = e.changedTouches[0], s0 = start; start = null;
                if (s0 && t && Math.abs(t.clientX - s0.x) < 10 && Math.abs(t.clientY - s0.y) < 10 && s0.target && s0.target.click) s0.target.click();
            });
        }
        // anything that still goes "back" (Android's gesture, a mouse's back button) stays in the game
        try {
            if (!history.state || !history.state.hubStay) history.pushState({ hubStay: 1 }, '');
            window.addEventListener('popstate', function () { history.pushState({ hubStay: 1 }, ''); if (opts.onBlocked) opts.onBlocked(); });
        } catch (e) { /* ignore */ }
    };

    // ---- Remember which games you play (for the dashboard's "Jump back in" and suggestions) ----
    // hub_plays: { slug: { n: times opened, last: time last opened } }. Stays on this device, like everything else.
    try {
        var m = location.pathname.match(/\/games\/([\w-]+)\//);
        if (m) {
            var plays = JSON.parse(HubStorage.getString('hub_plays', '{}')) || {};
            var rec = plays[m[1]] && typeof plays[m[1]] === 'object' ? plays[m[1]] : { n: 0, last: 0 };
            rec.n = (rec.n | 0) + 1; rec.last = Date.now(); plays[m[1]] = rec;
            HubStorage.setString('hub_plays', JSON.stringify(plays));
        }
    } catch (e) { /* ignore */ }

    // ---- Register service worker (PWA / offline). Safe no-op where unsupported or on file:// ----
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        window.addEventListener('load', function () {
            var base = (document.querySelector('meta[name="hub-root"]') || {}).content || './';
            navigator.serviceWorker.register(base + 'sw.js').catch(function () { /* ignore */ });
        });
    }
})();
