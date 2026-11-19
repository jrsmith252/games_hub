/* Shared bits for the card games (TriPeaks, FreeCell, Spider, Pyramid): card faces, toasts, pop-ups, stats, confetti.
   Cards are numbers: suit = floor(c / 13) % 4 (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = c % 13 (0 = ace),
   unless a game passes its own suit. */
(function (root) {
    'use strict';
    var S = root.HubStorage;
    var CK = {
        SUITS: ['♠︎', '♥︎', '♦︎', '♣︎'], SUIT_NAMES: ['spades', 'hearts', 'diamonds', 'clubs'],
        RANKS: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
        RANK_NAMES: ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King']
    };
    function $(id) { return document.getElementById(id); }
    CK.$ = $;
    CK.isRed = function (suit) { return suit === 1 || suit === 2; };
    CK.name = function (rank, suit) { return CK.RANK_NAMES[rank] + ' of ' + CK.SUIT_NAMES[suit]; };
    // the inside of a face-up card. Small cards (Spider, TriPeaks on a phone) get a bigger corner so they stay readable.
    CK.faceHTML = function (rank, suit, cw) {
        var r = CK.RANKS[rank], s = CK.SUITS[suit], small = cw < 44;
        var fs = Math.round(cw * (small ? 0.42 : 0.34)), mid = Math.round(cw * (small ? 0.5 : rank >= 10 ? 0.5 : 0.55));
        return '<span class="tl" style="font-size:' + fs + 'px">' + r + '<i>' + s + '</i></span><span class="mid" style="font-size:' + mid + 'px">' + (rank >= 10 && !small ? r + s : s) + '</span>';
    };
    // set an element up as a face-up or face-down card (only rebuilds the inside when it changes)
    CK.face = function (el, rank, suit, up, cw, extra) {
        var want = up ? 'u' + cw : 'd';
        if (el.dataset.f !== want) { el.dataset.f = want; el.innerHTML = up ? CK.faceHTML(rank, suit, cw) : ''; }
        el.className = 'card' + (up ? (CK.isRed(suit) ? ' r' : '') + ' s' + suit : ' back') + (extra || '');
        el.setAttribute('aria-label', up ? CK.name(rank, suit) : 'Face-down card');
    };
    CK.place = function (el, x, y, w, h, z) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; if (z !== undefined) el.style.zIndex = z; };
    CK.toast = function (m, ms) { var t = $('toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(CK.toast._t); CK.toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 1500); };
    CK.announce = function (m) { var a = $('announce'); if (a) a.textContent = m; };
    CK.buzz = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };
    CK.shake = function (el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); CK.buzz(20); };
    CK.pulse = function (els, ms) { els.forEach(function (el) { if (!el) return; el.classList.remove('hint'); void el.offsetWidth; el.classList.add('hint'); }); setTimeout(function () { els.forEach(function (el) { if (el) el.classList.remove('hint'); }); }, ms || 2800); };
    CK.fmt = function (ms) { var t = Math.floor(ms / 1000), m = Math.floor(t / 60); t %= 60; return m + ':' + (t < 10 ? '0' : '') + t; };
    CK.reduced = function () { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
    CK.confetti = function () {
        if (CK.reduced()) return;
        var cols = ['#f2c94c', '#ffffff', '#c62828', '#4fc3f7', '#81c784'];
        for (var i = 0; i < 50; i++) { var c = document.createElement('span'); c.className = 'confetti'; c.style.left = (Math.random() * 100) + 'vw'; c.style.background = cols[i % cols.length]; document.body.appendChild(c); if (!c.animate) { c.remove(); continue; }
            var a = c.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(' + ((Math.random() - 0.5) * 160) + 'px,' + (innerHeight * (0.7 + Math.random() * 0.4)) + 'px) rotate(' + ((Math.random() - 0.5) * 900) + 'deg)' }], { duration: 1500 + Math.random() * 900, delay: Math.random() * 300, fill: 'forwards' });
            a.onfinish = (function (x) { return function () { x.remove(); }; })(c); }
    };
    // pop-ups: every .modal-overlay; a tap on the dark background or a [data-close] button closes them
    CK.open = function (id) { $(id).classList.add('active'); var b = $(id).querySelector('.btn'); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } } };
    CK.closeAll = function () { Array.prototype.forEach.call(document.querySelectorAll('.modal-overlay'), function (m) { m.classList.remove('active'); }); };
    CK.anyOpen = function () { return !!document.querySelector('.modal-overlay.active'); };
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-close]')) { CK.closeAll(); return; }
        if (e.target.classList && e.target.classList.contains('modal-overlay') && !e.target.hasAttribute('data-sticky')) CK.closeAll();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && CK.anyOpen()) CK.closeAll(); });
    // stats, kept per mode: { mode: { played, won, streak, best, fastest, fewest, top } }
    CK.stats = function (key, modes) {
        var o; try { o = JSON.parse(S.getString(key, 'null')); } catch (e) { o = null; }
        if (!o || typeof o !== 'object') o = {};
        modes.forEach(function (m) { if (!o[m] || typeof o[m] !== 'object') o[m] = {}; ['played', 'won', 'streak', 'best', 'fastest', 'fewest', 'top'].forEach(function (k) { if (typeof o[m][k] !== 'number' || !isFinite(o[m][k])) o[m][k] = 0; }); });
        return o;
    };
    CK.saveStats = function (key, o) { S.setString(key, JSON.stringify(o)); };
    CK.statRow = function (st) { return '<div>' + st.played + '<small>Played</small></div><div>' + (st.played ? Math.round(100 * st.won / st.played) : 0) + '<small>Win %</small></div><div>' + st.streak + '<small>Streak</small></div><div>' + (st.fastest ? CK.fmt(st.fastest) : '–') + '<small>Fastest</small></div>'; };
    // four-colour suits: the game's own setting, or the hub-wide colour-blind setting
    CK.fourColour = function (key) { var on = S.getFlag(key) || S.getFlag('hub_colourBlindShapes'); document.body.classList.toggle('four', on); return on; };
    // a play clock that only runs while you're actually looking at the game
    CK.clock = function (onTick) {
        var c = { elapsed: 0, running: false, last: 0 };
        setInterval(function () { var now = Date.now(); if (c.running && !document.hidden && !CK.anyOpen()) c.elapsed += Math.min(now - c.last, 2000); c.last = now; if (onTick) onTick(); }, 500);
        c.start = function () { if (!c.running) { c.running = true; c.last = Date.now(); } };
        c.stop = function () { c.running = false; };
        return c;
    };
    // seeded random numbers and a shuffled deck (n decks of 52)
    CK.rng = function (seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    CK.newSeed = function () { return ((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0; };
    root.CardKit = CK;
})(typeof window !== 'undefined' ? window : self);
