/* Case Closed: logic-grid puzzle engine. Themes, clue writing, a human-style deduction
   solver (every step has a reason, used for hints), and a generator that only ships
   puzzles the solver can finish by pure deduction, which also proves the answer is unique.
   No DOM access: runs in the browser and in Node tests. */
(function (root) {
    'use strict';

    // ---------- seeded random ----------
    function rng(seed) {
        var a = (seed >>> 0) || 1;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function shuffle(arr, r) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function plural(d, word) { return d + ' ' + word + (d === 1 ? '' : 's'); }

    // ---------- themes (everyday mix) ----------
    // Each category: name, items, ref (how to name the person/thing with that value in a sentence),
    // pred (how to say "is ..."). Ordered categories add comparison phrases and numeric values.
    function T(s) { return function (v) { return s.replace('{v}', v); }; }
    function clock(v) { return v < 12 ? v + 'am' : v === 12 ? '12pm' : (v - 12) + 'pm'; }
    var THEMES = [
        { id: 'dogs', title: 'The village dog show', who: 'dogs',
          intro: 'The {n} dogs at this year\'s village show each have a different {cats}. Can you work out which is which?',
          cats: [
            { name: 'Dog', items: ['Biscuit', 'Pepper', 'Bramble', 'Toffee', 'Maple', 'Juniper'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Breed', items: ['Beagle', 'Corgi', 'Poodle', 'Collie', 'Dachshund', 'Whippet'], ref: T('the {v}'), pred: T('the {v}') },
            { name: 'Age', ordered: true, values: [1, 2, 3, 4, 5, 6, 7, 8], label: function (v) { return v + ' yrs'; },
              ref: function (v) { return 'the ' + v + '-year-old'; }, pred: function (v) { return v + ' years old'; },
              more: 'is older than', less: 'is younger than', max: 'is the oldest', min: 'is the youngest',
              diff: function (P, Q, d) { return P + ' is exactly ' + plural(d, 'year') + ' older than ' + Q; } },
            { name: 'Trick', items: ['roll over', 'high five', 'play dead', 'spin', 'sit pretty', 'wave'], label: T('{v}'),
              ref: T('the dog who can {v}'), pred: T('the one who can {v}') }
          ] },
        { id: 'cafe', title: 'Saturday at the café', who: 'customers',
          intro: '{n} customers each ordered a different {cats}. Use the clues to match them up.',
          cats: [
            { name: 'Customer', items: ['Priya', 'Tom', 'Grace', 'Omar', 'Hannah', 'Leo'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Drink', items: ['latte', 'tea', 'mocha', 'smoothie', 'cocoa', 'flat white'], ref: T('the {v} drinker'), pred: T('the one drinking {v}') },
            { name: 'Table', ordered: true, values: [1, 2, 3, 4, 5, 6, 7, 8], label: function (v) { return 'Table ' + v; },
              ref: function (v) { return 'whoever is at table ' + v; }, pred: function (v) { return 'at table ' + v; },
              more: 'is at a higher-numbered table than', less: 'is at a lower-numbered table than', max: 'is at the highest-numbered table', min: 'is at the lowest-numbered table',
              diff: function (P, Q, d) { return P + ' is exactly ' + plural(d, 'table') + ' further along than ' + Q; } },
            { name: 'Cake', items: ['scone', 'brownie', 'flapjack', 'carrot cake', 'éclair', 'muffin'], ref: T('the {v} eater'), pred: T('the one having a {v}') }
          ] },
        { id: 'holiday', title: 'Summer holidays', who: 'friends',
          intro: '{n} friends are each going away, with a different {cats}. Who is going where?',
          cats: [
            { name: 'Friend', items: ['Amira', 'Josh', 'Ellie', 'Sam', 'Nadia', 'Callum'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Place', items: ['Cornwall', 'Skye', 'Lisbon', 'Venice', 'Dublin', 'Bruges'], ref: T('the {v} traveller'), pred: T('going to {v}') },
            { name: 'Month', ordered: true, values: [3, 4, 5, 6, 7, 8, 9, 10],
              label: function (v) { return ['', '', '', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][v]; },
              ref: function (v) { return 'whoever goes in ' + MONTHS[v]; }, pred: function (v) { return 'going in ' + MONTHS[v]; },
              more: 'is going later in the year than', less: 'is going earlier in the year than', max: 'is the last to go away', min: 'is the first to go away',
              diff: function (P, Q, d) { return P + ' goes exactly ' + plural(d, 'month') + ' after ' + Q; } },
            { name: 'Travel', items: ['train', 'ferry', 'plane', 'coach', 'car', 'bike'], ref: T('whoever goes by {v}'), pred: T('travelling by {v}') }
          ] },
        { id: 'allotment', title: 'The allotment show', who: 'gardeners',
          intro: '{n} gardeners each entered a different {cats}. Sort out the results.',
          cats: [
            { name: 'Gardener', items: ['Doris', 'Raj', 'Fiona', 'Bill', 'Mei', 'Arthur'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Crop', items: ['marrow', 'leeks', 'onions', 'tomatoes', 'beans', 'pumpkin'], ref: T('the {v} grower'), pred: T('the one who grew the {v}') },
            { name: 'Plot', ordered: true, values: [1, 2, 3, 4, 5, 6, 7, 8], label: function (v) { return 'Plot ' + v; },
              ref: function (v) { return 'whoever has plot ' + v; }, pred: function (v) { return 'on plot ' + v; },
              more: 'is on a higher-numbered plot than', less: 'is on a lower-numbered plot than', max: 'is on the highest-numbered plot', min: 'is on the lowest-numbered plot',
              diff: function (P, Q, d) { return P + '\'s plot number is exactly ' + d + ' more than that of ' + Q; } },
            { name: 'Prize', items: ['rosette', 'cup', 'medal', 'ribbon', 'shield', 'certificate'], ref: T('the {v} winner'), pred: T('the one who won the {v}') }
          ] },
        { id: 'football', title: 'Five-a-side night', who: 'players',
          intro: '{n} players turned up for five-a-side, each with a different {cats}. Who is who?',
          cats: [
            { name: 'Player', items: ['Kofi', 'Ryan', 'Megan', 'Luca', 'Zara', 'Dan'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Position', items: ['keeper', 'defender', 'winger', 'striker', 'midfielder', 'sub'], ref: T('the {v}'), pred: T('the {v}') },
            { name: 'Goals', ordered: true, values: [0, 1, 2, 3, 4, 5, 6, 7], label: function (v) { return plural(v, 'goal'); },
              ref: function (v) { return 'whoever scored ' + plural(v, 'goal'); }, pred: function (v) { return 'the one who scored ' + plural(v, 'goal'); },
              more: 'scored more goals than', less: 'scored fewer goals than', max: 'scored the most goals', min: 'scored the fewest goals',
              diff: function (P, Q, d) { return P + ' scored exactly ' + plural(d, 'goal') + ' more than ' + Q; } },
            { name: 'Boots', items: ['red', 'white', 'black', 'gold', 'green', 'pink'], ref: T('the player in {v} boots'), pred: T('wearing {v} boots') }
          ] },
        { id: 'depot', title: 'Early shift at the bus depot', who: 'drivers',
          intro: '{n} drivers start the early shift, each with a different {cats}. Get the rota straight.',
          cats: [
            { name: 'Driver', items: ['Pat', 'Marcus', 'Wendy', 'Gary', 'Tasha', 'Neil'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Route', items: ['the 1', 'the 5', 'the 12', 'the 25', 'the 36', 'the 58'], label: T('{v}'), ref: T('whoever drives {v}'), pred: T('the driver of {v}') },
            { name: 'Start time', ordered: true, values: [5, 6, 7, 8, 9, 10, 11, 12], label: clock,
              ref: function (v) { return 'whoever starts at ' + clock(v); }, pred: function (v) { return 'the one starting at ' + clock(v); },
              more: 'starts later than', less: 'starts earlier than', max: 'is the last to start', min: 'is the first to start',
              diff: function (P, Q, d) { return P + ' starts exactly ' + plural(d, 'hour') + ' after ' + Q; } },
            { name: 'Bus', items: ['double-decker', 'single-decker', 'minibus', 'electric bus', 'hybrid', 'coach'], ref: T('the {v} driver'), pred: T('driving the {v}') }
          ] },
        { id: 'bakeoff', title: 'The charity bake sale', who: 'bakers',
          intro: '{n} bakers each brought a different {cats}. Match the bakes to the bakers.',
          cats: [
            { name: 'Baker', items: ['Ruth', 'Ade', 'Holly', 'Jamal', 'Bea', 'Frank'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Bake', items: ['sponge', 'tart', 'cupcakes', 'cookies', 'pie', 'roulade'], ref: T('the {v} baker'), pred: T('the one who made the {v}') },
            { name: 'Score', ordered: true, values: [3, 4, 5, 6, 7, 8, 9, 10], label: function (v) { return v + '/10'; },
              ref: function (v) { return 'whoever scored ' + v + '/10'; }, pred: function (v) { return 'the one who scored ' + v + '/10'; },
              more: 'scored higher than', less: 'scored lower than', max: 'got the top score', min: 'got the lowest score',
              diff: function (P, Q, d) { return P + ' scored exactly ' + plural(d, 'point') + ' more than ' + Q; } },
            { name: 'Flavour', items: ['lemon', 'cherry', 'ginger', 'coffee', 'raspberry', 'vanilla'], ref: T('the {v} baker'), pred: T('the one who baked with {v}') }
          ] },
        { id: 'books', title: 'Book club', who: 'members',
          intro: '{n} book club members each chose a different {cats}. Who picked what?',
          cats: [
            { name: 'Member', items: ['Iris', 'Ben', 'Sofia', 'Hugh', 'Lena', 'Kwame'], ref: T('{v}'), pred: T('{v}') },
            { name: 'Genre', items: ['mystery', 'sci-fi', 'romance', 'history', 'poetry', 'fantasy'], ref: T('the {v} fan'), pred: T('the one who chose {v}') },
            { name: 'Pages', ordered: true, values: [100, 200, 300, 400, 500, 600, 700, 800], step: 100, label: function (v) { return v + 'pp'; },
              ref: function (v) { return 'the reader of the ' + v + '-page book'; }, pred: function (v) { return 'the one reading the ' + v + '-page book'; },
              more: 'is reading a longer book than', less: 'is reading a shorter book than', max: 'is reading the longest book', min: 'is reading the shortest book',
              diff: function (P, Q, d) { return P + '\'s book is exactly ' + d + ' pages longer than the one read by ' + Q; } },
            { name: 'Snack', items: ['biscuits', 'grapes', 'crisps', 'olives', 'nuts', 'fudge'], ref: T('whoever brought {v}'), pred: T('the one who brought {v}') }
          ] }
    ];
    var MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // ---------- level recipe ----------
    function isTricky(n) { return n >= 6 && n % 5 === 0; }
    function recipe(n) {
        var k = n <= 8 ? 2 : n <= 30 ? 3 : 4;                    // categories
        var size = n <= 3 ? 3 : n <= 8 ? 4 : n <= 16 ? 4 : n <= 30 ? 5 : 4;   // items per category (4 categories stay at 4 to fit phones)
        var types = { is: 1, not: 1, either: 0, neither: 0, order: 0, diff: 0, sup: 0 };
        if (n >= 4) { types.either = 1; types.neither = 1; }
        if (n >= 9) { types.order = 1; types.sup = 1; }
        if (n >= 14) types.diff = 1;
        var isWeight = n <= 3 ? 3 : n <= 8 ? 1.2 : n <= 20 ? 0.6 : 0.35;
        if (isTricky(n)) isWeight = 0.08;
        return { k: k, size: size, types: types, isWeight: isWeight, tricky: isTricky(n) };
    }

    // ---------- knowledge grid ----------
    // K[a][b][i*size+j] for categories a<b: 0 unknown, 1 yes, -1 no
    function newKnowledge(k, size) {
        var K = [];
        for (var a = 0; a < k; a++) { K.push([]); for (var b = 0; b < k; b++) K[a].push(a < b ? new Array(size * size).fill(0) : null); }
        return K;
    }
    function getK(P, a, i, b, j) {
        if (a === b) return i === j ? 1 : -1;
        return a < b ? P.K[a][b][i * P.size + j] : P.K[b][a][j * P.size + i];
    }
    function setK(P, a, i, b, j, v) {
        if (a < b) P.K[a][b][i * P.size + j] = v; else P.K[b][a][j * P.size + i] = v;
    }
    function cloneK(K) { return K.map(function (row) { return row.map(function (g) { return g ? g.slice() : null; }); }); }

    // ---------- clues ----------
    // A clue term is { c: category, v: value index }.
    function termRef(pz, t) { return pz.cats[t.c].ref(pz.cats[t.c].show[t.v]); }
    function termPred(pz, t) { return pz.cats[t.c].pred(pz.cats[t.c].show[t.v]); }
    function clueText(pz, cl) {
        var O = pz.ordered >= 0 ? pz.cats[pz.ordered] : null;
        switch (cl.t) {
            case 'is': return cap(termRef(pz, cl.p)) + ' is ' + termPred(pz, cl.q) + '.';
            case 'not': return cap(termRef(pz, cl.p)) + ' is not ' + termPred(pz, cl.q) + '.';
            case 'either': return cap(termRef(pz, cl.p)) + ' is either ' + termPred(pz, cl.q1) + ' or ' + termPred(pz, cl.q2) + '.';
            case 'neither': return 'Neither ' + termRef(pz, cl.p1) + ' nor ' + termRef(pz, cl.p2) + ' is ' + termPred(pz, cl.q) + '.';
            case 'order': return cap(termRef(pz, cl.p)) + ' ' + (cl.gt ? O.more : O.less) + ' ' + termRef(pz, cl.q) + '.';
            case 'diff': return cap(O.diff(termRef(pz, cl.p), termRef(pz, cl.q), cl.d)) + '.';
            case 'sup': return cap(termRef(pz, cl.p)) + ' ' + (cl.max ? O.max : O.min) + '.';
        }
        return '';
    }

    // ---------- solver: human techniques, each deduction with a reason ----------
    function label(pz, c, v) { return pz.cats[c].labels[v]; }
    function cellName(pz, a, i, b, j) { return label(pz, a, i) + ' / ' + label(pz, b, j); }
    // Possible ordered values for a term: indexes o in the ordered category not ruled out
    function possibleO(P, t) {
        var O = P.pz.ordered, out = [];
        if (t.c === O) return [t.v];
        for (var o = 0; o < P.size; o++) if (getK(P, t.c, t.v, O, o) !== -1) out.push(o);
        return out;
    }

    // Each rule returns deductions [{a,i,b,j,val,why}] given the current knowledge P.
    // P = { pz, k, size, K }
    function deduceGrid(P, out, limit) {
        var n = P.size;
        for (var a = 0; a < P.k; a++) for (var b = a + 1; b < P.k; b++) {
            for (var i = 0; i < n; i++) {
                // row of a's value i against category b
                var yesJ = -1, unknown = [], nos = 0;
                for (var j = 0; j < n; j++) { var v = getK(P, a, i, b, j); if (v === 1) yesJ = j; else if (v === 0) unknown.push(j); else nos++; }
                if (yesJ >= 0) unknown.forEach(function (j) { out.push({ a: a, i: i, b: b, j: j, val: -1, why: label(P.pz, a, i) + ' is already matched with ' + label(P.pz, b, yesJ) + ', so it can\'t be ' + label(P.pz, b, j) + '.' }); });
                else if (unknown.length === 1) out.push({ a: a, i: i, b: b, j: unknown[0], val: 1, why: label(P.pz, b, unknown[0]) + ' is the only ' + P.pz.cats[b].name.toLowerCase() + ' left for ' + label(P.pz, a, i) + '.' });
                if (out.length >= limit) return;
            }
            for (var j2 = 0; j2 < n; j2++) {
                var yesI = -1, unk = [];
                for (var i2 = 0; i2 < n; i2++) { var w = getK(P, a, i2, b, j2); if (w === 1) yesI = i2; else if (w === 0) unk.push(i2); }
                if (yesI >= 0) unk.forEach(function (i3) { out.push({ a: a, i: i3, b: b, j: j2, val: -1, why: label(P.pz, b, j2) + ' is already matched with ' + label(P.pz, a, yesI) + ', so it can\'t be ' + label(P.pz, a, i3) + '.' }); });
                else if (unk.length === 1) out.push({ a: a, i: unk[0], b: b, j: j2, val: 1, why: label(P.pz, a, unk[0]) + ' is the only ' + P.pz.cats[a].name.toLowerCase() + ' left for ' + label(P.pz, b, j2) + '.' });
                if (out.length >= limit) return;
            }
        }
    }
    function deduceTransitive(P, out, limit) {
        var n = P.size;
        for (var a = 0; a < P.k; a++) for (var b = 0; b < P.k; b++) for (var c = 0; c < P.k; c++) {
            if (a === b || b === c || a === c || a > c) continue;
            for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
                if (getK(P, a, i, b, j) !== 1) continue;
                for (var m = 0; m < n; m++) {
                    var bc = getK(P, b, j, c, m), ac = getK(P, a, i, c, m);
                    if (ac !== 0 || bc === 0) continue;
                    out.push({ a: a, i: i, b: c, j: m, val: bc, why: label(P.pz, a, i) + ' goes with ' + label(P.pz, b, j) + ', and ' + label(P.pz, b, j) +
                        (bc === 1 ? ' goes with ' : ' does not go with ') + label(P.pz, c, m) + ', so ' + label(P.pz, a, i) + (bc === 1 ? ' goes with ' : ' does not go with ') + label(P.pz, c, m) + '.' });
                    if (out.length >= limit) return;
                }
            }
        }
    }
    function pushIf(P, out, a, i, b, j, val, why) {
        if (a === b) return;
        if (getK(P, a, i, b, j) === 0) out.push({ a: a, i: i, b: b, j: j, val: val, why: why });
    }
    function deduceClues(P, out, limit) {
        var pz = P.pz, O = pz.ordered;
        for (var ci = 0; ci < pz.clues.length && out.length < limit; ci++) {
            var cl = pz.clues[ci], num = 'Clue ' + (ci + 1);
            if (cl.t === 'is') pushIf(P, out, cl.p.c, cl.p.v, cl.q.c, cl.q.v, 1, num + ' says so directly.');
            else if (cl.t === 'not') pushIf(P, out, cl.p.c, cl.p.v, cl.q.c, cl.q.v, -1, num + ' rules it out directly.');
            else if (cl.t === 'neither') {
                pushIf(P, out, cl.p1.c, cl.p1.v, cl.q.c, cl.q.v, -1, num + ' rules it out.');
                pushIf(P, out, cl.p2.c, cl.p2.v, cl.q.c, cl.q.v, -1, num + ' rules it out.');
            } else if (cl.t === 'either') {
                var qc = cl.q1.c;
                for (var r = 0; r < P.size; r++) if (r !== cl.q1.v && r !== cl.q2.v)
                    pushIf(P, out, cl.p.c, cl.p.v, qc, r, -1, num + ' says it must be ' + label(pz, qc, cl.q1.v) + ' or ' + label(pz, qc, cl.q2.v) + '.');
                var k1 = getK(P, cl.p.c, cl.p.v, qc, cl.q1.v), k2 = getK(P, cl.p.c, cl.p.v, qc, cl.q2.v);
                if (k1 === -1) pushIf(P, out, cl.p.c, cl.p.v, qc, cl.q2.v, 1, num + ' leaves only ' + label(pz, qc, cl.q2.v) + ' once ' + label(pz, qc, cl.q1.v) + ' is ruled out.');
                if (k2 === -1) pushIf(P, out, cl.p.c, cl.p.v, qc, cl.q1.v, 1, num + ' leaves only ' + label(pz, qc, cl.q1.v) + ' once ' + label(pz, qc, cl.q2.v) + ' is ruled out.');
            } else if (cl.t === 'sup') {
                pushIf(P, out, cl.p.c, cl.p.v, O, cl.max ? P.size - 1 : 0, 1, num + ' says so.');
            } else if (cl.t === 'order' || cl.t === 'diff') {
                // p and q are different people
                pushIf(P, out, cl.p.c, cl.p.v, cl.q.c, cl.q.v, -1, num + ' compares them, so they are different people.');
                var pp = possibleO(P, cl.p), pq = possibleO(P, cl.q);
                if (!pp.length || !pq.length) continue;
                var vals = pz.cats[O].vals;
                if (cl.t === 'order') {
                    // gt: O(p) > O(q)
                    var hi = cl.gt ? cl.p : cl.q, lo = cl.gt ? cl.q : cl.p;
                    var phi = cl.gt ? pp : pq, plo = cl.gt ? pq : pp;
                    var maxLo = Math.max.apply(null, plo), minHi = Math.min.apply(null, phi);
                    for (var o = 0; o < P.size; o++) {
                        if (o <= Math.min.apply(null, plo) && hi.c !== O) pushIf(P, out, hi.c, hi.v, O, o, -1, num + ': ' + label(pz, hi.c, hi.v) + ' must be above ' + label(pz, O, o) + ' here.');
                        if (o >= Math.max.apply(null, phi) && lo.c !== O) pushIf(P, out, lo.c, lo.v, O, o, -1, num + ': ' + label(pz, lo.c, lo.v) + ' must be below ' + label(pz, O, o) + ' here.');
                    }
                    void maxLo; void minHi;
                } else {
                    // diff: value(p) = value(q) + d (in real units)
                    for (var o2 = 0; o2 < P.size; o2++) {
                        var needQ = vals[o2] - cl.d, needP = vals[o2] + cl.d;
                        var okP = pq.some(function (x) { return vals[x] === needQ; });
                        var okQ = pp.some(function (x) { return vals[x] === needP; });
                        if (!okP && cl.p.c !== O) pushIf(P, out, cl.p.c, cl.p.v, O, o2, -1, num + ': ' + label(pz, cl.p.c, cl.p.v) + ' can\'t be ' + label(pz, O, o2) + ', as nothing fits exactly ' + cl.d + ' below it.');
                        if (!okQ && cl.q.c !== O) pushIf(P, out, cl.q.c, cl.q.v, O, o2, -1, num + ': ' + label(pz, cl.q.c, cl.q.v) + ' can\'t be ' + label(pz, O, o2) + ', as nothing fits exactly ' + cl.d + ' above it.');
                    }
                }
            }
        }
    }
    // One round of deductions, in the order a person would usually spot them.
    function deductions(P, limit) {
        var out = [];
        limit = limit || Infinity;
        deduceClues(P, out, limit);
        if (out.length < limit) deduceGrid(P, out, limit);
        if (out.length < limit) deduceTransitive(P, out, limit);
        return out;
    }
    function apply(P, d) { setK(P, d.a, d.i, d.b, d.j, d.val); }
    function complete(P) {
        for (var b = 1; b < P.k; b++) for (var i = 0; i < P.size; i++) {
            var yes = 0;
            for (var j = 0; j < P.size; j++) if (getK(P, 0, i, b, j) === 1) yes++;
            if (yes !== 1) return false;
        }
        return true;
    }
    // Solve from scratch; returns { solved, rounds, contradiction }
    function solve(pz, K) {
        var P = { pz: pz, k: pz.k, size: pz.size, K: K || newKnowledge(pz.k, pz.size) };
        var rounds = 0;
        for (;;) {
            var ds = deductions(P);
            if (!ds.length) break;
            rounds++;
            for (var x = 0; x < ds.length; x++) {
                var d = ds[x], cur = getK(P, d.a, d.i, d.b, d.j);
                if (cur !== 0 && cur !== d.val) return { solved: false, contradiction: true, rounds: rounds, P: P };
                apply(P, d);
            }
            if (rounds > 400) break;
        }
        return { solved: complete(P), rounds: rounds, P: P };
    }

    // ---------- generation ----------
    function entityOf(pz, c, v) { return c === 0 ? v : pz.inv[c][v]; }
    function valueOf(pz, c, e) { return c === 0 ? e : pz.sol[c][e]; }
    function candidateClues(pz, rc, r) {
        var out = [], k = pz.k, n = pz.size, O = pz.ordered;
        var term = function (c, v) { return { c: c, v: v }; };
        var w = rc.types;
        for (var a = 0; a < k; a++) for (var b = a + 1; b < k; b++) {
            if (a === O || b === O) {
                // direct facts about the ordered category are fine, but less interesting
            }
            for (var e = 0; e < n; e++) {
                var i = valueOf(pz, a, e), j = valueOf(pz, b, e);
                if (w.is) out.push({ t: 'is', p: term(a, i), q: term(b, j), w: rc.isWeight });
                for (var e2 = 0; e2 < n; e2++) if (e2 !== e) {
                    var j2 = valueOf(pz, b, e2);
                    if (w.not) out.push({ t: 'not', p: term(a, i), q: term(b, j2), w: 0.5 });
                    if (w.either) out.push({ t: 'either', p: term(a, i), q1: term(b, r() < 0.5 ? j : j2), q2: null, _t: j, _f: j2, w: 0.7 });
                    if (w.neither && e2 > e) {
                        var e3 = Math.floor(r() * n);
                        if (e3 !== e && e3 !== e2) out.push({ t: 'neither', p1: term(a, i), p2: term(a, valueOf(pz, a, e2)), q: term(b, valueOf(pz, b, e3)), w: 0.5 });
                    }
                }
            }
        }
        // either clues: put the true option in a random position
        out.forEach(function (cl) {
            if (cl.t !== 'either') return;
            var t = term(cl.q1.c, cl._t), f = term(cl.q1.c, cl._f);
            if (r() < 0.5) { cl.q1 = t; cl.q2 = f; } else { cl.q1 = f; cl.q2 = t; }
            delete cl._t; delete cl._f;
        });
        if (O >= 0) {
            var vals = pz.cats[O].vals, step = pz.cats[O].step || 1;
            var nonO = []; for (var c = 0; c < k; c++) if (c !== O) nonO.push(c);
            for (var x = 0; x < nonO.length; x++) for (var y = 0; y < nonO.length; y++) for (var e4 = 0; e4 < n; e4++) for (var e5 = 0; e5 < n; e5++) {
                if (e4 === e5) continue;
                var ca = nonO[x], cb = nonO[y];
                var pv = valueOf(pz, ca, e4), qv = valueOf(pz, cb, e5);
                var op = valueOf(pz, O, e4), oq = valueOf(pz, O, e5);
                if (w.order && r() < 0.35) out.push({ t: 'order', p: term(ca, pv), q: term(cb, qv), gt: op > oq, w: 0.9 });
                var d = vals[op] - vals[oq];
                if (w.diff && d > 0 && d <= 2 * step && r() < 0.5) out.push({ t: 'diff', p: term(ca, pv), q: term(cb, qv), d: d, w: 0.9 });
            }
            if (w.sup) for (var e6 = 0; e6 < n; e6++) {
                var o6 = valueOf(pz, O, e6);
                if (o6 === 0 || o6 === n - 1) nonO.forEach(function (cc) { out.push({ t: 'sup', p: term(cc, valueOf(pz, cc, e6)), max: o6 === n - 1, w: 0.6 }); });
            }
        }
        return out;
    }
    function weightedOrder(list, r) {
        // Efraimidis-Spirakis weighted shuffle
        return list.map(function (x) { return { x: x, key: Math.pow(r(), 1 / Math.max(0.01, x.w)) }; })
            .sort(function (p, q) { return q.key - p.key; }).map(function (o) { return o.x; });
    }
    function clueKey(cl) { return JSON.stringify(cl); }

    function buildPuzzle(n, attempt) {
        var rc = recipe(n);
        var r = rng(Math.imul(n, 2654435761) + Math.imul(attempt, 40503) + 7);
        var theme = THEMES[(n * 5 + Math.floor(n / 8)) % THEMES.length];
        // categories: anchor first; include the ordered one when order clues are allowed
        var others = [1, 2, 3];
        var orderedIdx = theme.cats.findIndex(function (c) { return c.ordered; });
        var chosen = [0];
        if (rc.types.order && rc.k >= 3) chosen.push(orderedIdx);
        shuffle(others.filter(function (c) { return chosen.indexOf(c) === -1; }), r).forEach(function (c) { if (chosen.length < rc.k) chosen.push(c); });
        chosen = [0].concat(chosen.slice(1).sort());
        var size = rc.size;
        var cats = chosen.map(function (ci) {
            var src = theme.cats[ci], show, vals;
            if (src.ordered) {
                var start = Math.floor(r() * (src.values.length - size + 1));
                vals = src.values.slice(start, start + size);
                show = vals.slice();
            } else {
                show = shuffle(src.items, r).slice(0, size);
                if (ci !== 0) show.sort();
                vals = null;
            }
            var labels = show.map(function (v) { return src.label ? src.label(v) : String(v); });
            return { name: src.name, show: show, vals: vals, step: src.step, labels: labels, ref: src.ref, pred: src.pred,
                     ordered: !!src.ordered, more: src.more, less: src.less, max: src.max, min: src.min, diff: src.diff };
        });
        var pz = { number: n, theme: theme.id, title: theme.title, k: rc.k, size: size, cats: cats, clues: [], tricky: rc.tricky };
        pz.ordered = cats.findIndex(function (c) { return c.ordered; });
        // solution: anchor entity e has value sol[c][e] in category c
        pz.sol = [null]; pz.inv = [null];
        for (var c = 1; c < rc.k; c++) {
            var perm = shuffle(Array.from({ length: size }, function (_, i) { return i; }), r);
            pz.sol.push(perm);
            var inv = new Array(size); perm.forEach(function (v, e) { inv[v] = e; }); pz.inv.push(inv);
        }
        var pool = weightedOrder(candidateClues(pz, rc, r), r);
        // add clues until the solver can finish by deduction alone
        var seen = {};
        for (var x = 0; x < pool.length; x++) {
            var key = clueKey(pool[x]);
            if (seen[key]) continue; seen[key] = true;
            pz.clues.push(pool[x]);
            if (pz.clues.length >= 3 && solve(pz).solved) break;
        }
        if (!solve(pz).solved) return null;
        // prune: drop any clue that isn't needed
        shuffle(pz.clues.map(function (_, i) { return i; }), r).forEach(function () { /* order only */ });
        var order = shuffle(pz.clues.slice(), r);
        order.forEach(function (cl) {
            var idx = pz.clues.indexOf(cl);
            var trial = pz.clues.slice(0, idx).concat(pz.clues.slice(idx + 1));
            var saved = pz.clues; pz.clues = trial;
            if (!solve(pz).solved) pz.clues = saved;
        });
        pz.clues = shuffle(pz.clues, r);
        pz.clues.forEach(function (cl) { delete cl.w; cl.text = clueText(pz, cl); });
        pz.rounds = solve(pz).rounds;
        var whoN = ['', 'one', 'two', 'three', 'four', 'five', 'six'][size];   // lower case: the sentence is capitalised below
        var catNames = cats.slice(1).map(function (cc) { return cc.name.toLowerCase(); });
        var catsTxt = catNames.length === 1 ? catNames[0] : catNames.slice(0, -1).join(', ') + ' and ' + catNames[catNames.length - 1];
        pz.intro = cap(theme.intro.replace('{n}', whoN).replace('{cats}', catsTxt));
        return pz;
    }
    function generate(n) {
        n = Math.max(1, Math.floor(n) || 1);
        var best = null;
        // try a few, preferring longer chains of reasoning on tricky cases
        var tries = isTricky(n) ? 4 : 2;
        for (var a = 0; a < 40 && tries > 0; a++) {
            var pz = buildPuzzle(n, a);
            if (!pz) continue;
            tries--;
            if (!best || pz.rounds > best.rounds) best = pz;
        }
        if (!best) throw new Error('Could not build case ' + n);
        return best;
    }

    // ---------- player helpers ----------
    // Is the player's grid finished? (every anchor grid has exactly the right ticks)
    function isSolved(pz, K) {
        for (var b = 1; b < pz.k; b++) for (var e = 0; e < pz.size; e++) for (var j = 0; j < pz.size; j++) {
            var want = pz.sol[b][e] === j ? 1 : -1;
            var have = getK({ K: K, size: pz.size }, 0, e, b, j);
            if (want === 1 && have !== 1) return false;
            if (have === 1 && want !== 1) return false;
        }
        return true;
    }
    function truth(pz, a, i, b, j) {
        if (a === b) return i === j ? 1 : -1;
        return entityOf(pz, a, i) === entityOf(pz, b, j) ? 1 : -1;
    }
    // Next helpful step for the player: first a mistake (if any), else the next deduction.
    function hint(pz, K) {
        for (var a = 0; a < pz.k; a++) for (var b = a + 1; b < pz.k; b++) for (var i = 0; i < pz.size; i++) for (var j = 0; j < pz.size; j++) {
            var have = K[a][b][i * pz.size + j];
            if (have !== 0 && have !== truth(pz, a, i, b, j)) return { mistake: true, a: a, i: i, b: b, j: j, val: truth(pz, a, i, b, j),
                why: 'This mark is wrong: ' + cellName(pz, a, i, b, j) + ' should be ' + (truth(pz, a, i, b, j) === 1 ? 'a ✓' : 'a ✗') + '.' };
        }
        var P = { pz: pz, k: pz.k, size: pz.size, K: cloneK(K) };
        var ds = deductions(P, 1);
        if (!ds.length) return null;
        var d = ds[0];
        return { mistake: false, a: d.a, i: d.i, b: d.b, j: d.j, val: d.val, why: d.why };
    }

    var api = { THEMES: THEMES, recipe: recipe, isTricky: isTricky, generate: generate, solve: solve, newKnowledge: newKnowledge,
                getK: getK, setK: setK, cloneK: cloneK, isSolved: isSolved, hint: hint, truth: truth, clueText: clueText };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CaseEngine = api;
})(typeof window !== 'undefined' ? window : this);
