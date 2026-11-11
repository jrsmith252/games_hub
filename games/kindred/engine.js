/* Kindred level builder.
   A level is k groups of four words. The builder makes sure every word belongs to exactly one group on the board:
   - two groups on one board never share a theme (Birds and Farm animals could both claim "hen")
   - a word is never used if it is listed under another group on the board (orange: Fruits and Colours), including the
     "~" extras each group lists as "fits, but don't use"
   - wordplay groups with a spelling rule (double letters, rhymes, palindromes, hidden numbers) keep away any word on
     the board that would also match the rule
   Levels are seeded by number, so level 12 is the same on every device. */
(function (root) {
    'use strict';
    var RAW = root.KINDRED_CATEGORIES || (typeof require !== 'undefined' ? (require('./categories.js'), root.KINDRED_CATEGORIES) : []);

    var RULES = {
        'Double letters': function (w) { return /([a-z])\1/.test(w); },
        'Rhymes with cat': function (w) { return /at$/.test(w); },
        'Rhymes with tree': function (w) { return /(ee|ea|ey|ki|ee|i)$/.test(w) && w.length <= 7; },
        'Rhymes with night': function (w) { return /(ight|ite|eight)$/.test(w); },
        'Same backwards': function (w) { var x = w.replace(/ /g, ''); return x.length > 2 && x === x.split('').reverse().join(''); },
        'Hidden numbers': function (w) { return /(one|two|three|four|five|six|seven|eight|nine|ten)/.test(w.replace(/ /g, '')); },
        'Sound like letters': function (w) { return /^(bee|sea|see|tea|pea|you|ewe|why|eye|queue|cue|are|jay|owe|oh|gee|ell|em|en|ex)$/.test(w); }
    };

    var CATS = RAW.map(function (row, i) {
        var words = [], extra = [];
        row.slice(3).forEach(function (w) { w = String(w).toLowerCase().trim(); if (!w) return; if (w[0] === '~') extra.push(w.slice(1)); else if (words.indexOf(w) < 0) words.push(w); });
        return { id: i, theme: row[0], tier: row[1], name: row[2], words: words, all: words.concat(extra), rule: RULES[row[2]] || null };
    }).filter(function (c) { return c.words.length >= 4; });

    function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    // How a level is made up: number of groups, and how many from each tier
    function plan(n) {
        var k = n <= 2 ? 3 : n <= 9 ? 4 : n <= 24 ? 5 : n <= 49 ? 6 : n % 3 === 0 ? 7 : 6;
        var t3 = n < 12 ? 0 : n < 30 ? (n % 3 === 0 ? 1 : 0) : n < 60 ? (n % 2 === 0 ? 1 : 0) + (n % 5 === 0 ? 1 : 0) : 1 + (n % 3 === 0 ? 1 : 0);
        var t2 = n <= 4 ? 0 : n <= 10 ? 1 : n <= 25 ? 2 : Math.min(k - t3, 3 + (n % 2));
        t2 = Math.min(t2, k - t3);
        return { k: k, t1: k - t2 - t3, t2: t2, t3: t3, tough: n >= 10 && n % 10 === 0 };
    }

    // does word w (from group a) clash with group b?
    function clash(w, b) { return b.all.indexOf(w) >= 0 || (b.rule && b.rule(w)); }

    function build(n) {
        var P = plan(n);
        for (var attempt = 0; attempt < 400; attempt++) {
            var r = rng(n * 7919 + attempt * 104729 + 17), picked = [], themes = {};
            var want = [[1, P.t1], [2, P.t2], [3, P.t3]], ok = true;
            for (var w = 0; w < want.length && ok; w++) {
                var pool = shuffle(CATS.filter(function (c) { return c.tier === want[w][0] && !themes[c.theme]; }), r);
                for (var q = 0; q < want[w][1]; q++) {
                    var c = null;
                    while (pool.length && !c) { var x = pool.pop(); if (!themes[x.theme]) c = x; }
                    if (!c) { ok = false; break; }
                    themes[c.theme] = 1; picked.push(c);
                }
            }
            if (!ok) continue;
            // choose four words per group that no other group on the board could also claim
            var groups = [], used = {};
            for (var g = 0; g < picked.length && ok; g++) {
                var cat = picked[g];
                var cand = shuffle(cat.words.filter(function (word) {
                    if (used[word]) return false;
                    for (var h = 0; h < picked.length; h++) if (h !== g && clash(word, picked[h])) return false;
                    return true;
                }), r);
                if (cand.length < 4) { ok = false; break; }
                var four = cand.slice(0, 4); four.forEach(function (x) { used[x] = 1; });
                groups.push({ name: cat.name, tier: cat.tier, words: four });
            }
            if (!ok) continue;
            // rule groups: their words mustn't match any other rule on the board either (checked above via clash);
            // and words from other groups mustn't match a rule group's rule (also clash). Board order:
            var bubbles = [];
            groups.forEach(function (gr, gi) { gr.words.forEach(function (word) { bubbles.push({ word: word, g: gi }); }); });
            shuffle(bubbles, r);
            var spare = Math.max(4, P.k + (n <= 10 ? 2 : 1));
            return { number: n, tough: P.tough, groups: groups, order: bubbles, moves: 3 * P.k + spare, need: 3 * P.k };
        }
        return null;
    }

    var api = { build: build, plan: plan, categories: CATS, rules: RULES, clash: clash };
    root.KindredEngine = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
