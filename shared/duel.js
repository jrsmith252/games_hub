/* Play a friend, with no server: the whole game travels in a link.
   You move, then send the link (WhatsApp, Messages, anything). Your friend opens it, moves, and sends it back.
   Each phone remembers which side it's playing, so it knows whose turn it is.

   A link looks like  games/<game>/index.html?g=<id>&a=<name of side 1>&b=<name of side 2>&m=<moves>
   Moves are one character each (a square 0-63 as a letter, digit, - or _; '.' for a pass), so a whole game fits
   easily in a link. Games replay the moves from the start, so a broken or edited link is caught.

   Used by any game that offers "Play a friend": HubDuel.forGame('flipside') gives that game's helpers. */
(function () {
    'use strict';
    var S = window.HubStorage;
    var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    function encodeMoves(moves) { return moves.map(function (m) { return m < 0 ? '.' : ABC[m]; }).join(''); }
    function decodeMoves(str) {
        var out = [];
        for (var i = 0; i < (str || '').length; i++) { var ch = str[i]; if (ch === '.') out.push(-1); else { var k = ABC.indexOf(ch); if (k < 0) return null; out.push(k); } }
        return out;
    }
    function json(k, d) { try { var v = JSON.parse(S.getString(k, 'null')); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
    function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20); }
    function newId() { var s = ''; for (var i = 0; i < 8; i++) s += ABC[Math.floor(Math.random() * 62)]; return s; }

    function forGame(key) {
        var STORE = key + '_duels';
        var api = {
            encodeMoves: encodeMoves, decodeMoves: decodeMoves,
            // your name, shared by every game, so you only type it once
            myName: function () { return cleanName(S.getString('hub_name', '')); },
            setMyName: function (n) { S.setString('hub_name', cleanName(n)); },
            // the games you have going with friends: { id: { side, a, b, moves, updated, done } }
            all: function () { var o = json(STORE, {}); return o && typeof o === 'object' ? o : {}; },
            get: function (id) { return api.all()[id] || null; },
            save: function (rec) {
                var o = api.all(); rec.updated = Date.now(); o[rec.id] = rec;
                // keep the 30 most recent
                var ids = Object.keys(o).sort(function (x, y) { return o[y].updated - o[x].updated; });
                ids.slice(30).forEach(function (x) { delete o[x]; });
                S.setString(STORE, JSON.stringify(o));
            },
            remove: function (id) { var o = api.all(); delete o[id]; S.setString(STORE, JSON.stringify(o)); },
            newGame: function (side, myName) { var rec = { id: newId(), side: side, a: side === 1 ? cleanName(myName) : '', b: side === 2 ? cleanName(myName) : '', moves: '', done: false }; api.save(rec); return rec; },
            // what this page was opened with, if it's a game link
            fromLink: function () {
                try {
                    var q = new URLSearchParams(location.search), id = q.get('g');
                    if (!id || !/^[A-Za-z0-9]{4,16}$/.test(id)) return null;
                    var moves = decodeMoves(q.get('m') || '');
                    if (!moves) return { id: id, broken: true };
                    return { id: id, a: cleanName(q.get('a')), b: cleanName(q.get('b')), moves: moves, m: q.get('m') || '' };
                } catch (e) { return null; }
            },
            // tidy the address bar once a link has been read, so reloading doesn't re-open it
            clearLink: function () { try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* ignore */ } },
            link: function (rec) {
                var q = new URLSearchParams(); q.set('g', rec.id); if (rec.a) q.set('a', rec.a); if (rec.b) q.set('b', rec.b); q.set('m', rec.moves);
                return location.origin + location.pathname + '?' + q.toString();
            },
            // the phone's share sheet where there is one, otherwise copy the link
            share: function (title, text, url) {
                if (navigator.share) return navigator.share({ title: title, text: text, url: url }).then(function () { return 'shared'; }, function (e) { return e && e.name === 'AbortError' ? 'cancelled' : copy(text + '\n' + url); });
                return copy(text + '\n' + url);
            }
        };
        return api;
    }
    function copy(text) {
        try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return 'copied'; }, function () { return 'failed'; }); } catch (e) { /* fall through */ }
        return Promise.resolve('failed');
    }
    window.HubDuel = { forGame: forGame, encodeMoves: encodeMoves, decodeMoves: decodeMoves };
})();
