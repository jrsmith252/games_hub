/* Wanderlings: the simulation.
   The world is a grid of pixels: 0 empty, 1 dirt (can be dug), 2 steel (can't). Water is deadly.
   Wanderlings drop in from a hatch and walk until something stops them. Give them jobs to get enough of them to the exit.
   A wanderling stands at (x, y): y is its lowest pixel; the ground it stands on is at y + 1. It is 8 pixels tall.
   Everything runs in fixed steps (15 a second), with no randomness, so the same moves always give the same result.
   That's how each level's solution is checked: it's replayed step by step. */
(function (root) {
    'use strict';
    var EMPTY = 0, DIRT = 1, STEEL = 2;
    var TPS = 15, TALL = 8, STEP_UP = 6, SPLAT = 54, FLOAT_AFTER = 14, BOMB_TICKS = 5 * TPS;
    var SKILLS = ['climb', 'float', 'bomb', 'block', 'build', 'bash', 'mine', 'dig'];

    // ---------- building a level's terrain ----------
    function build(L) {
        var W = L.W, H = L.H, t = new Uint8Array(W * H);
        function put(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < H) t[y * W + x] = v; }
        (L.terrain || []).forEach(function (s) {
            var k = s[0], v, x, y;
            if (k === 'rect') { v = s[5]; for (y = s[2]; y < s[2] + s[4]; y++) for (x = s[1]; x < s[1] + s[3]; x++) put(x, y, v); }
            else if (k === 'ellipse') { v = s[5]; for (y = Math.floor(s[2] - s[4]); y <= s[2] + s[4]; y++) for (x = Math.floor(s[1] - s[3]); x <= s[1] + s[3]; x++) { var dx = (x - s[1]) / s[3], dy = (y - s[2]) / s[4]; if (dx * dx + dy * dy <= 1) put(x, y, v); } }
            else if (k === 'poly') {
                v = s[2]; var p = s[1], minY = Infinity, maxY = -Infinity, i;
                for (i = 1; i < p.length; i += 2) { minY = Math.min(minY, p[i]); maxY = Math.max(maxY, p[i]); }
                for (y = Math.ceil(minY); y <= maxY; y++) {
                    var xs = [];
                    for (i = 0; i < p.length; i += 2) { var x1 = p[i], y1 = p[i + 1], x2 = p[(i + 2) % p.length], y2 = p[(i + 3) % p.length]; if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1)); }
                    xs.sort(function (a, b) { return a - b; });
                    for (var j = 0; j + 1 < xs.length; j += 2) for (x = Math.ceil(xs[j]); x < xs[j + 1]; x++) put(x, y, v);
                }
            }
        });
        return t;
    }
    function newGame(L) {
        var skills = {}; SKILLS.forEach(function (k) { skills[k] = (L.skills && L.skills[k]) || 0; });
        return { L: L, W: L.W, H: L.H, t: build(L), tick: 0, spawned: 0, saved: 0, dead: 0, all: [], skills: skills, used: 0,
            nuking: false, over: false, limit: (L.time || 300) * TPS, dug: [] };
    }

    // ---------- the world ----------
    function cell(g, x, y) { if (x < 0 || x >= g.W) return STEEL; if (y < 0 || y >= g.H) return EMPTY; return g.t[y * g.W + x]; }
    function solid(g, x, y) { return cell(g, x, y) !== EMPTY; }
    function set(g, x, y, v) { if (x >= 0 && x < g.W && y >= 0 && y < g.H) g.t[y * g.W + x] = v; }
    // remove dirt in a rectangle; true if steel got in the way
    function carve(g, x0, y0, x1, y1) {
        var steel = false;
        for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
            var c = cell(g, x, y); if (c === STEEL && x >= 0 && x < g.W && y >= 0 && y < g.H) steel = true; else if (c === DIRT) { set(g, x, y, EMPTY); g.dug.push(y * g.W + x); }
        }
        return steel;
    }
    function steelIn(g, x0, y0, x1, y1) { for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (x >= 0 && x < g.W && y >= 0 && y < g.H && g.t[y * g.W + x] === STEEL) return true; return false; }
    function dirtIn(g, x0, y0, x1, y1) { for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (cell(g, x, y) === DIRT) return true; return false; }
    function inWater(g, x, y) { return (g.L.water || []).some(function (w) { return x >= w[0] && x < w[0] + w[2] && y >= w[1] && y < w[1] + w[3]; }); }
    function blockerAhead(g, c, nx) { for (var i = 0; i < g.all.length; i++) { var b = g.all[i]; if (b !== c && b.st === 'block' && Math.abs(b.x - nx) <= 2 && Math.abs(b.y - c.y) < TALL && (b.x - c.x) * c.dir > 0) return true; } return false; }

    // ---------- one step of the whole world ----------
    function step(g) {
        if (g.over) return;
        g.dug = [];
        var L = g.L;
        // the hatch lets one out every so often
        if (!g.nuking && g.spawned < L.count && g.tick >= (L.delay || 15) + g.spawned * L.interval) {
            g.all.push({ id: g.spawned, x: L.hatch[0], y: L.hatch[1], dir: L.hatchDir || 1, st: 'fall', fall: 0, climber: false, floater: false, bombAt: -1, n: 0, frame: 0, alive: true });
            g.spawned++;
        }
        for (var i = 0; i < g.all.length; i++) {
            var c = g.all[i]; if (!c.alive) continue;
            c.frame++;
            if (c.bombAt >= 0 && g.tick >= c.bombAt) { explode(g, c); continue; }
            act(g, c);
            if (!c.alive) continue;
            // home, drowned or fallen off the bottom
            if (Math.abs(c.x - L.exit[0]) <= 3 && c.y >= L.exit[1] - 6 && c.y <= L.exit[1] + 1 && c.st !== 'fall' && c.st !== 'float') { c.alive = false; c.home = true; g.saved++; continue; }
            if (inWater(g, c.x, c.y) || c.y >= g.H) { c.alive = false; c.how = inWater(g, c.x, c.y) ? 'drown' : 'fell'; g.dead++; }
        }
        g.tick++;
        // only blockers left standing? nothing more can happen, so the level is over
        var alive = g.all.some(function (c) { return c.alive && c.st !== 'block'; });
        if ((!alive && (g.spawned >= L.count || g.nuking)) || g.tick >= g.limit) {
            g.over = true;
            g.all.forEach(function (c) { if (c.alive) { c.alive = false; c.how = 'time'; } });
        }
    }
    function act(g, c) {
        switch (c.st) {
            case 'walk': walk(g, c); break;
            case 'fall': fall(g, c); break;
            case 'climb': climb(g, c); break;
            case 'block': if (!solid(g, c.x, c.y + 1)) { c.st = 'fall'; c.fall = 0; } break;
            case 'build': buildStep(g, c); break;
            case 'bash': bash(g, c); break;
            case 'mine': mine(g, c); break;
            case 'dig': dig(g, c); break;
            case 'shrug': if (++c.n > 12) { c.st = 'walk'; } break;
        }
    }
    function walk(g, c) {
        var nx = c.x + c.dir;
        if (blockerAhead(g, c, nx)) { c.dir = -c.dir; return; }
        if (solid(g, nx, c.y)) {
            // how tall is what's in front?
            var h = 0; while (h <= STEP_UP && solid(g, nx, c.y - h)) h++;
            if (h <= STEP_UP && !solid(g, nx, c.y - h - TALL + 1)) { c.x = nx; c.y -= h; return; }
            if (c.climber) { c.st = 'climb'; return; }
            c.dir = -c.dir; return;
        }
        // nothing in front at foot level: walk on, down a slope, or off the edge
        var d = 0; while (d < 4 && !solid(g, nx, c.y + 1 + d)) d++;
        c.x = nx;
        if (d < 4) c.y += d; else { c.st = 'fall'; c.fall = 0; }
    }
    function fall(g, c) {
        var speed = c.floater && c.fall >= FLOAT_AFTER ? 1 : 3;
        for (var k = 0; k < speed; k++) {
            if (solid(g, c.x, c.y + 1)) {
                if (c.fall > SPLAT && !c.floater) { c.alive = false; c.how = 'splat'; g.dead++; return; }
                c.st = 'walk'; c.fall = 0; return;
            }
            c.y++; c.fall++;
            if (c.y >= g.H) return;
        }
    }
    function climb(g, c) {
        // banged its head on an overhang: let go
        if (solid(g, c.x, c.y - TALL)) { c.dir = -c.dir; c.st = 'fall'; c.fall = 0; return; }
        c.y--;
        if (!solid(g, c.x + c.dir, c.y)) { c.x += c.dir; c.st = 'walk'; }
    }
    // a builder lays 12 bricks, each one step up and along
    function buildStep(g, c) {
        if (++c.n % 3) return;
        if (c.bricks >= 12) { c.st = 'shrug'; c.n = 0; return; }
        // blocked by a wall or ceiling? stop
        if (solid(g, c.x + c.dir * 2, c.y - 1) || solid(g, c.x + c.dir, c.y - TALL)) { c.st = 'walk'; c.dir = -c.dir; return; }
        for (var k = 0; k < 6; k++) if (!solid(g, c.x + c.dir * k, c.y)) set(g, c.x + c.dir * k, c.y, DIRT);
        c.bricks++; c.y--; c.x += c.dir * 2;
    }
    // a basher tunnels sideways through dirt until there's no more in front
    function bash(g, c) {
        // as fast as walking, so the ones behind don't catch up and turn back
        var x0 = c.x + c.dir, x1 = c.x + c.dir * 4;
        if (steelIn(g, x0, c.y - TALL + 1, x1, c.y)) { c.st = 'walk'; c.dir = -c.dir; return; }
        if (!dirtIn(g, c.x + c.dir, c.y - TALL + 1, c.x + c.dir * 10, c.y)) { c.st = 'walk'; return; }
        carve(g, x0, c.y - TALL + 1, x1, c.y);
        c.x += c.dir;
        if (!solid(g, c.x, c.y + 1)) { c.st = 'fall'; c.fall = 0; }
    }
    // a miner tunnels down at a slant
    function mine(g, c) {
        if (++c.n % 3) return;
        if (steelIn(g, c.x + c.dir, c.y - TALL + 2, c.x + c.dir * 4, c.y + 2)) { c.st = 'walk'; c.dir = -c.dir; return; }
        carve(g, c.x + c.dir, c.y - TALL + 2, c.x + c.dir * 4, c.y + 1);
        c.x += c.dir; c.y++;
        if (!solid(g, c.x, c.y + 1) && !solid(g, c.x + c.dir, c.y + 1)) { c.st = 'fall'; c.fall = 0; }
    }
    // a digger digs straight down
    function dig(g, c) {
        if (++c.n % 2) return;
        if (steelIn(g, c.x - 3, c.y + 1, c.x + 3, c.y + 1)) { c.st = 'walk'; return; }
        if (!dirtIn(g, c.x - 3, c.y + 1, c.x + 3, c.y + 1)) { c.st = 'fall'; c.fall = 0; return; }
        carve(g, c.x - 3, c.y + 1, c.x + 3, c.y + 1); c.y++;
    }
    function explode(g, c) {
        var cx = c.x, cy = c.y - 4, r = 10;
        for (var y = cy - r; y <= cy + r; y++) for (var x = cx - r; x <= cx + r; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r && cell(g, x, y) === DIRT) { set(g, x, y, EMPTY); g.dug.push(y * g.W + x); }
        c.alive = false; c.how = 'bomb'; c.boomAt = g.tick; g.dead++;
    }

    // ---------- giving jobs ----------
    // true if the job was given (and one used up)
    function assign(g, id, skill) {
        var c = g.all[id];
        if (!c || !c.alive || g.over || !g.skills[skill]) return false;
        var busy = c.st === 'walk' || c.st === 'build' || c.st === 'bash' || c.st === 'mine' || c.st === 'dig' || c.st === 'shrug';
        if (skill === 'climb') { if (c.climber) return false; c.climber = true; }
        else if (skill === 'float') { if (c.floater) return false; c.floater = true; }
        else if (skill === 'bomb') { if (c.bombAt >= 0) return false; c.bombAt = g.tick + BOMB_TICKS; }
        else if (skill === 'build' && c.st === 'build') { c.bricks -= 12; }
        else if (!busy || c.st === skill) return false;
        else if (skill === 'block') { c.st = 'block'; }
        else if (skill === 'build') { c.st = 'build'; c.bricks = 0; c.n = 0; }
        else if (skill === 'bash') { if (!dirtIn(g, c.x + c.dir, c.y - TALL + 1, c.x + c.dir * 16, c.y)) return false; c.st = 'bash'; c.n = 0; }
        else if (skill === 'mine') { c.st = 'mine'; c.n = 0; }
        else if (skill === 'dig') { if (!dirtIn(g, c.x - 3, c.y + 1, c.x + 3, c.y + 1)) return false; c.st = 'dig'; c.n = 0; }
        g.skills[skill]--; g.used++;
        return true;
    }
    // everyone left blows up (one after another), and no more come out
    function nuke(g) { if (g.nuking || g.over) return; g.nuking = true; var k = 0; g.all.forEach(function (c) { if (c.alive && c.bombAt < 0) c.bombAt = g.tick + 10 + (k++) * 2; }); }
    // who's nearest a point (for tapping), within reach
    function nearest(g, x, y, reach) {
        var best = null, bd = reach * reach;
        g.all.forEach(function (c) { if (!c.alive) return; var dx = c.x - x, dy = (c.y - 4) - y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = c; } });
        return best;
    }
    // replay a solution: [[tick, id, skill], ...]; returns the finished game
    function replay(L, moves, maxTicks) {
        var g = newGame(L), k = 0, sorted = moves.slice().sort(function (a, b) { return a[0] - b[0]; }), log = [];
        while (!g.over && g.tick < (maxTicks || g.limit)) {
            while (k < sorted.length && sorted[k][0] <= g.tick) { var m = sorted[k++]; log.push(m.concat([m[2] === 'nuke' ? (nuke(g), true) : assign(g, m[1], m[2])])); }
            step(g);
        }
        g.log = log;
        return g;
    }

    var api = { VERSION: 1, EMPTY: EMPTY, DIRT: DIRT, STEEL: STEEL, TPS: TPS, TALL: TALL, SKILLS: SKILLS, build: build, newGame: newGame, step: step, assign: assign, nuke: nuke, nearest: nearest, replay: replay, solid: solid, cell: cell };
    root.Wanderlings = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
