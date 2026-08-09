// Warring Banners - state, map generation and rules. No I/O beyond localStorage (guarded).
var G = (function () {
  var K = HEX.key;

  var TERR = {
    plain:  { name: 'Plain',  cost: 1, def: 1.00, col: '#4d5b3e', col2: '#57663f' },
    forest: { name: 'Forest', cost: 2, def: 1.35, col: '#2f4a33', col2: '#37563b' },
    hill:   { name: 'Hill',   cost: 2, def: 1.25, col: '#5f5945', col2: '#6b644d' },
    ford:   { name: 'Ford',   cost: 2, def: 0.85, col: '#3a5b70', col2: '#41677e' },
    water:  { name: 'River',  cost: 99, def: 1.00, col: '#22394f', col2: '#22394f' }
  };
  var UNITS = {
    spear: { name: 'Spear',   cost: 5, beats: 'cav',   glyph: 'I' },
    cav:   { name: 'Cavalry', cost: 7, beats: 'bow',   glyph: 'A' },
    bow:   { name: 'Bow',     cost: 6, beats: 'spear', glyph: 'Y' }
  };
  var FACTIONS = [
    { name: 'Ashvale',  col: '#5b9bd5', dim: '#33587a', ai: null },
    { name: 'Korrund',  col: '#d2604f', dim: '#7a382e', ai: 'raider' },
    { name: 'Sethmoor', col: '#d7a94b', dim: '#7c622b', ai: 'turtle' },
    { name: 'Vaelin',   col: '#9b7ad2', dim: '#59477a', ai: 'expander' }
  ];
  var KEEPS = [[0, 3], [0, -3], [3, 0], [-3, 0]];
  var EXTRA = [[4, -2], [-4, 2], [2, 2]];
  var TURNS = 12, ARMY_CAP = 6, MOVE_PTS = 2;

  var S = null;              // live state
  var nextId = 1;

  // ---------- persistence (hardening #4) ----------
  var LS_KEY = 'wb.legacy.v1';
  function defLegacy() { return { season: 1, carry: 0, wins: 0, best: 0 }; }
  function num(v, d, lo, hi) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (typeof n !== 'number' || !isFinite(n) || isNaN(n)) return d;
    n = Math.floor(n);
    if (n < lo) n = lo; if (n > hi) n = hi;
    return n;
  }
  function loadLegacy() {
    var d = defLegacy();
    try {
      var ls = window.localStorage;
      var raw = ls ? ls.getItem(LS_KEY) : null;
      if (!raw || typeof raw !== 'string') return d;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
      return {
        season: num(o.season, 1, 1, 999),
        carry:  num(o.carry, 0, 0, 20),
        wins:   num(o.wins, 0, 0, 999),
        best:   num(o.best, 0, 0, 40)
      };
    } catch (e) { return d; }
  }
  function saveLegacy(l) {
    try {
      var ls = window.localStorage;
      if (!ls) return;
      ls.setItem(LS_KEY, JSON.stringify({
        season: num(l.season, 1, 1, 999), carry: num(l.carry, 0, 0, 20),
        wins: num(l.wins, 0, 0, 999), best: num(l.best, 0, 0, 40)
      }));
    } catch (e) {}
  }
  function clearLegacy() {
    try { var ls = window.localStorage; if (ls) ls.removeItem(LS_KEY); } catch (e) {}
  }

  // ---------- map ----------
  function buildMap(seed) {
    var rnd = HEX.rng(seed);
    var hexes = {}, list = [];
    function add(q, r) {
      var h = { q: q, r: r, terr: 'plain', owner: -1, keep: -1 };
      hexes[K(q, r)] = h; list.push(h);
    }
    for (var q = -3; q <= 3; q++) {
      for (var r = -3; r <= 3; r++) {
        if (HEX.dist(q, r, 0, 0) <= 3) add(q, r);
      }
    }
    for (var i = 0; i < EXTRA.length; i++) add(EXTRA[i][0], EXTRA[i][1]);

    // terrain: seeded value noise on axial coords
    function nz(h, o) {
      var v = Math.sin((h.q * 12.9898 + h.r * 78.233 + o + seed * 0.317)) * 43758.5453;
      return v - Math.floor(v);
    }
    for (i = 0; i < list.length; i++) {
      var h = list[i], n = nz(h, 1.7) * 0.6 + rnd() * 0.4;
      if (n < 0.26) h.terr = 'forest';
      else if (n < 0.44) h.terr = 'hill';
      else h.terr = 'plain';
    }
    // a river band across the map -> chokepoints
    var axis = Math.floor(rnd() * 3);
    for (i = 0; i < list.length; i++) {
      var hh = list[i];
      var v = axis === 0 ? hh.q : (axis === 1 ? hh.r : -hh.q - hh.r);
      var d = HEX.dist(hh.q, hh.r, 0, 0);
      if (v === 0 && d > 0 && d < 4) hh.terr = (nz(hh, 5.1) < 0.34) ? 'ford' : 'water';
    }
    // keeps always solid ground
    for (i = 0; i < KEEPS.length; i++) {
      var kh = hexes[K(KEEPS[i][0], KEEPS[i][1])];
      kh.terr = 'plain'; kh.keep = i; kh.owner = i;
    }
    repairConnectivity(hexes, list);
    return { hexes: hexes, list: list };
  }

  // guarantee every keep can reach every other keep on land (fords added as needed)
  function repairConnectivity(hexes, list) {
    for (var guard = 0; guard < 40; guard++) {
      var seen = {}, stack = [KEEPS[0].slice()], n = 0;
      seen[K(KEEPS[0][0], KEEPS[0][1])] = 1;
      while (stack.length) {
        var c = stack.pop(); n++;
        var nb = HEX.neighbors(c[0], c[1]);
        for (var i = 0; i < nb.length; i++) {
          var k = K(nb[i][0], nb[i][1]), h = hexes[k];
          if (!h || seen[k] || h.terr === 'water') continue;
          seen[k] = 1; stack.push([h.q, h.r]);
        }
      }
      var bad = null;
      for (var j = 0; j < list.length; j++) {
        var t = list[j];
        if (t.terr === 'water') continue;
        if (!seen[K(t.q, t.r)]) { bad = t; break; }
      }
      if (!bad) return;
      // convert the water hex nearest the disconnected region into a ford
      var best = null, bd = 1e9;
      for (j = 0; j < list.length; j++) {
        var w = list[j];
        if (w.terr !== 'water') continue;
        var touchesIn = false, touchesOut = false, nb2 = HEX.neighbors(w.q, w.r);
        for (var m = 0; m < nb2.length; m++) {
          var kk = K(nb2[m][0], nb2[m][1]);
          if (!hexes[kk] || hexes[kk].terr === 'water') continue;
          if (seen[kk]) touchesIn = true; else touchesOut = true;
        }
        if (!touchesIn || !touchesOut) continue;
        var dd = HEX.dist(w.q, w.r, bad.q, bad.r);
        if (dd < bd) { bd = dd; best = w; }
      }
      if (!best) {
        // fall back: dry out the stranded hex's cheapest water neighbour
        var nb3 = HEX.neighbors(bad.q, bad.r);
        for (m = 0; m < nb3.length; m++) {
          var h3 = hexes[K(nb3[m][0], nb3[m][1])];
          if (h3 && h3.terr === 'water') { best = h3; break; }
        }
      }
      if (!best) return;
      best.terr = 'ford';
    }
  }

  // ---------- state ----------
  function newSeason(legacy) {
    var seed = (legacy.season * 7919 + 1013) >>> 0;
    var map = buildMap(seed);
    nextId = 1;
    S = {
      season: legacy.season,
      legacy: legacy,
      turn: 1,
      phase: 'player',
      cur: 0,
      hexes: map.hexes,
      list: map.list,
      armies: [],
      gold: [10 + legacy.carry, 10, 10, 10],
      alive: [true, true, true, true],
      supplied: [{}, {}, {}, {}],
      sel: null,
      cursor: { q: KEEPS[0][0], r: KEEPS[0][1] },
      reach: null,
      log: '',
      over: null
    };
    var bonus = Math.min(3, Math.floor(legacy.wins / 2));
    for (var f = 0; f < 4; f++) {
      var kq = KEEPS[f][0], kr = KEEPS[f][1];
      spawn(f, 'spear', kq, kr, 10 + (f === 0 ? bonus : 0));
      // second banner spawns on the outward flank, never pointing into a rival keep
      var nb = HEX.neighbors(kq, kr), pick = null, pickScore = -1e9;
      for (var i = 0; i < nb.length; i++) {
        var h = S.hexes[K(nb[i][0], nb[i][1])];
        if (!h || !passable(h) || armyAt(h.q, h.r)) continue;
        var sc2 = HEX.dist(h.q, h.r, 0, 0) * 3;
        for (var g = 0; g < 4; g++) {
          if (g === f) continue;
          sc2 += Math.min(6, HEX.dist(h.q, h.r, KEEPS[g][0], KEEPS[g][1]));
        }
        if (sc2 > pickScore) { pickScore = sc2; pick = h; }
      }
      if (pick) {
        pick.owner = f;
        spawn(f, (f % 2) ? 'bow' : 'cav', pick.q, pick.r, 10 + (f === 0 ? bonus : 0));
      }
      // small starting holding
      for (i = 0; i < nb.length; i++) {
        var h2 = S.hexes[K(nb[i][0], nb[i][1])];
        if (h2 && passable(h2) && h2.owner === -1 && h2.keep < 0) { h2.owner = f; break; }
      }
    }
    recomputeSupply();
    beginPlayerTurn(true);
    return S;
  }

  function spawn(owner, type, q, r, str) {
    if (countArmies(owner) >= ARMY_CAP) return null;
    var a = { id: nextId++, owner: owner, type: type, str: str, q: q, r: r, mp: MOVE_PTS, sup: true };
    S.armies.push(a);
    return a;
  }
  function countArmies(f) {
    var n = 0;
    for (var i = 0; i < S.armies.length; i++) if (S.armies[i].owner === f) n++;
    return n;
  }
  function armyAt(q, r) {
    for (var i = 0; i < S.armies.length; i++) {
      var a = S.armies[i];
      if (a.q === q && a.r === r) return a;
    }
    return null;
  }
  function armyById(id) {
    for (var i = 0; i < S.armies.length; i++) if (S.armies[i].id === id) return S.armies[i];
    return null;
  }
  function hexAt(q, r) { return S.hexes[K(q, r)] || null; }
  function passable(h) { return !!h && h.terr !== 'water'; }
  function territory(f) {
    var n = 0;
    for (var i = 0; i < S.list.length; i++) if (S.list[i].owner === f) n++;
    return n;
  }

  // ---------- supply ----------
  function recomputeSupply() {
    for (var f = 0; f < 4; f++) {
      var set = {};
      if (S.alive[f]) {
        var kq = KEEPS[f][0], kr = KEEPS[f][1], kk = K(kq, kr);
        var kh = S.hexes[kk];
        if (kh && kh.owner === f) {
          set[kk] = 1;
          var stack = [[kq, kr]];
          while (stack.length) {
            var c = stack.pop(), nb = HEX.neighbors(c[0], c[1]);
            for (var i = 0; i < nb.length; i++) {
              var k2 = K(nb[i][0], nb[i][1]), h = S.hexes[k2];
              if (!h || set[k2] || h.owner !== f || !passable(h)) continue;
              set[k2] = 1; stack.push([h.q, h.r]);
            }
          }
        }
      }
      S.supplied[f] = set;
    }
    for (var j = 0; j < S.armies.length; j++) {
      var a = S.armies[j];
      a.sup = !!S.supplied[a.owner][K(a.q, a.r)];
    }
  }

  // ---------- movement ----------
  // returns {reach:{key:mpLeft}, targets:{key:1}} for an army
  function computeReach(a) {
    var reach = {}, targets = {};
    var start = K(a.q, a.r);
    reach[start] = a.mp;
    var frontier = [[a.q, a.r]];
    while (frontier.length) {
      var c = frontier.pop();
      var left = reach[K(c[0], c[1])];
      if (left <= 0) continue;
      var nb = HEX.neighbors(c[0], c[1]);
      for (var i = 0; i < nb.length; i++) {
        var h = hexAt(nb[i][0], nb[i][1]);
        if (!passable(h)) continue;
        var k = K(h.q, h.r);
        var occ = armyAt(h.q, h.r);
        if (occ) {
          if (occ.owner !== a.owner && left >= 1) targets[k] = 1;
          continue;                       // cannot move through anyone
        }
        var cost = TERR[h.terr].cost;
        if (cost > left) continue;
        var rem = left - cost;
        if (reach[k] === undefined || reach[k] < rem) { reach[k] = rem; frontier.push([h.q, h.r]); }
      }
    }
    delete reach[start];
    return { reach: reach, targets: targets };
  }

  function moveArmy(a, q, r, mpLeft) {
    a.q = q; a.r = r; a.mp = mpLeft;
    var h = hexAt(q, r);
    if (h) {
      if (h.keep >= 0 && h.keep !== a.owner) captureKeep(h.keep, a.owner);
      h.owner = a.owner;
    }
    recomputeSupply();
  }

  // ---------- combat (fully deterministic; math is shown pre-attack) ----------
  function matchup(at, dt) {
    if (UNITS[at].beats === dt) return 1.5;
    if (UNITS[dt].beats === at) return 0.75;
    return 1.0;
  }
  function preview(a, d) {
    var dh = hexAt(d.q, d.r);
    var m = matchup(a.type, d.type);
    var supA = a.sup ? 1.0 : 0.7, supD = d.sup ? 1.0 : 0.7;
    var terr = TERR[dh.terr].def;
    var keepB = (dh.keep === d.owner) ? 1.9 : 1.0;
    var A = a.str * m * supA;
    var D = d.str * terr * supD * keepB;
    var win = A > D;
    var surv = win ? Math.max(1, Math.round(a.str * (1 - D / A)))
                   : Math.max(1, Math.round(d.str * (1 - A / D)));
    return {
      atk: a, def: d, hex: dh, m: m, supA: supA, supD: supD,
      terr: terr, keepB: keepB, A: A, D: D, win: win, surv: surv
    };
  }
  function resolve(p) {
    var a = p.atk, d = p.def, q = d.q, r = d.r;
    if (p.win) {
      a.str = p.surv;
      removeArmy(d);
      moveArmy(a, q, r, 0);
    } else {
      d.str = p.surv;
      removeArmy(a);
      recomputeSupply();
    }
    return p;
  }
  function removeArmy(x) {
    for (var i = 0; i < S.armies.length; i++) {
      if (S.armies[i].id === x.id) { S.armies.splice(i, 1); return; }
    }
  }

  function captureKeep(loser, winner) {
    if (!S.alive[loser]) return;
    S.alive[loser] = false;
    for (var i = S.armies.length - 1; i >= 0; i--) {
      if (S.armies[i].owner === loser) S.armies.splice(i, 1);
    }
    for (var j = 0; j < S.list.length; j++) {
      if (S.list[j].owner === loser) S.list[j].owner = (S.list[j].keep === loser) ? winner : -1;
    }
    if (loser === 0) S.over = 'defeat';
    else {
      var any = false;
      for (var f = 1; f < 4; f++) if (S.alive[f]) any = true;
      if (!any) S.over = 'conquest';
    }
  }

  // ---------- turn flow ----------
  function income(f) {
    return 2 + Math.floor(territory(f) / 2);
  }
  function startTurnFor(f) {
    S.gold[f] += income(f);
    if (S.gold[f] > 99) S.gold[f] = 99;
    var starved = 0;
    for (var i = S.armies.length - 1; i >= 0; i--) {
      var a = S.armies[i];
      if (a.owner !== f) continue;
      a.mp = MOVE_PTS;
      if (!a.sup) {
        a.str -= 2; starved++;
        if (a.str <= 0) S.armies.splice(i, 1);
      }
    }
    return starved;
  }
  function beginPlayerTurn(first) {
    recomputeSupply();
    var st = startTurnFor(0);
    S.phase = 'player'; S.cur = 0; S.sel = null; S.reach = null;
    S.log = first ? '' : (st ? st + ' cut-off army(s) starving!' : '');
    return st;
  }

  function canRecruit(f, type) {
    if (!S.alive[f]) return false;
    if (S.gold[f] < UNITS[type].cost) return false;
    if (countArmies(f) >= ARMY_CAP) return false;
    var kq = KEEPS[f][0], kr = KEEPS[f][1];
    var kh = hexAt(kq, kr);
    if (!kh || kh.owner !== f) return false;
    if (!armyAt(kq, kr)) return true;
    var nb = HEX.neighbors(kq, kr);
    for (var i = 0; i < nb.length; i++) {
      var h = hexAt(nb[i][0], nb[i][1]);
      if (h && passable(h) && h.owner === f && !armyAt(h.q, h.r)) return true;
    }
    return false;
  }
  function recruit(f, type) {
    if (!canRecruit(f, type)) return null;
    var kq = KEEPS[f][0], kr = KEEPS[f][1], tq = kq, tr = kr;
    if (armyAt(kq, kr)) {
      var nb = HEX.neighbors(kq, kr);
      for (var i = 0; i < nb.length; i++) {
        var h = hexAt(nb[i][0], nb[i][1]);
        if (h && passable(h) && h.owner === f && !armyAt(h.q, h.r)) { tq = h.q; tr = h.r; break; }
      }
    }
    var bonus = (f === 0) ? Math.min(3, Math.floor(S.legacy.wins / 2)) : 0;
    var a = spawn(f, type, tq, tr, 10 + bonus);
    if (a) { a.mp = 0; S.gold[f] -= UNITS[type].cost; recomputeSupply(); }
    return a;
  }

  function scores() {
    var out = [];
    for (var f = 0; f < 4; f++) {
      out.push({ f: f, name: FACTIONS[f].name, col: FACTIONS[f].col,
                 terr: S.alive[f] ? territory(f) : 0, alive: S.alive[f] });
    }
    return out;
  }
  function seasonResult() {
    var sc = scores(), best = -1, bestF = -1, tie = false;
    for (var i = 0; i < sc.length; i++) {
      if (sc[i].terr > best) { best = sc[i].terr; bestF = sc[i].f; tie = false; }
      else if (sc[i].terr === best) tie = true;
    }
    var won = (bestF === 0 && !tie) || S.over === 'conquest';
    return { sc: sc, won: won, bestF: bestF, mine: sc[0].terr };
  }
  function bankSeason(res) {
    var l = S.legacy;
    l.best = Math.max(l.best, res.mine);
    if (res.won) { l.wins = Math.min(999, l.wins + 1); l.carry = Math.min(20, 4 + Math.floor(res.mine / 3)); }
    else l.carry = Math.min(20, Math.floor(res.mine / 4));
    l.season = Math.min(999, l.season + 1);
    saveLegacy(l);
    return l;
  }
  function bankDefeat() {
    var l = S.legacy;
    l.carry = Math.max(0, Math.floor(l.carry / 2));
    saveLegacy(l);
    return l;
  }

  return {
    TERR: TERR, UNITS: UNITS, FACTIONS: FACTIONS, KEEPS: KEEPS, TURNS: TURNS,
    ARMY_CAP: ARMY_CAP, MOVE_PTS: MOVE_PTS,
    get state() { return S; },
    newSeason: newSeason, loadLegacy: loadLegacy, saveLegacy: saveLegacy, clearLegacy: clearLegacy,
    defLegacy: defLegacy,
    hexAt: hexAt, armyAt: armyAt, armyById: armyById, passable: passable, territory: territory,
    countArmies: countArmies, computeReach: computeReach, moveArmy: moveArmy,
    preview: preview, resolve: resolve, matchup: matchup, removeArmy: removeArmy,
    recomputeSupply: recomputeSupply, startTurnFor: startTurnFor, beginPlayerTurn: beginPlayerTurn,
    canRecruit: canRecruit, recruit: recruit, income: income, spawn: spawn,
    scores: scores, seasonResult: seasonResult, bankSeason: bankSeason, bankDefeat: bankDefeat
  };
})();
