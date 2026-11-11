/* British or American spelling for Crackword and Fourfold (hub-wide setting "hub_spelling": 'uk' or 'us').
   Word lists come from words.js; definitions from definitions.js are in American spelling and are switched here. */
(function () {
    'use strict';
    var UK = [[/\bfavor/g, 'favour'], [/\bcolor/g, 'colour'], [/\blabor/g, 'labour'], [/\bhonor/g, 'honour'], [/\bbehavior/g, 'behaviour'], [/\bneighbor/g, 'neighbour'],
        [/\bharbor/g, 'harbour'], [/\bhumor/g, 'humour'], [/\bflavor/g, 'flavour'], [/\bcenter/g, 'centre'], [/\btheater/g, 'theatre'], [/\bliter\b/g, 'litre'],
        [/\bgray/g, 'grey'], [/\bjewelry/g, 'jewellery'], [/\bdefense/g, 'defence'], [/\boffense/g, 'offence'], [/\bmovie/g, 'film'], [/\borganiz/g, 'organis'],
        [/\brecogniz/g, 'recognis'], [/\brealiz/g, 'realis'], [/\banalyz/g, 'analys'], [/\bmold/g, 'mould'], [/\bplow/g, 'plough'], [/\btraveled/g, 'travelled'],
        [/\bcatalog\b/g, 'catalogue'], [/\bpajama/g, 'pyjama'], [/\baluminum/g, 'aluminium'], [/\bcookie/g, 'biscuit'], [/\bfiber/g, 'fibre'], [/\bcozy/g, 'cosy']];
    function get() { var v = window.HubStorage ? window.HubStorage.getString('hub_spelling', 'uk') : 'uk'; return v === 'us' ? 'us' : 'uk'; }
    function set(v) { if (window.HubStorage) window.HubStorage.setString('hub_spelling', v === 'us' ? 'us' : 'uk'); }
    // answers and accepted guesses for one word length in the chosen spelling
    function lists(n, sp) {
        var W = window.CRACKWORD_WORDS[n], side = (sp || get()) === 'us' ? 'US' : 'UK';
        var answers = W.a.split(' ').concat((W['a' + side] || '').split(' ')).filter(Boolean), valid = {};
        [W.g, W['g' + side] || ''].forEach(function (s) { s.split(' ').forEach(function (w) { if (w) valid[w] = 1; }); });
        answers.forEach(function (w) { valid[w] = 1; });
        return { answers: answers, valid: valid };
    }
    // text in the chosen spelling
    function text(t, sp) {
        t = String(t || '').replace(/`/g, "'");
        return (sp || get()) === 'us' ? t : UK.reduce(function (a, r) { return a.replace(r[0], r[1]); }, t);
    }
    window.CrackSpelling = { get: get, set: set, lists: lists, text: text };
})();
