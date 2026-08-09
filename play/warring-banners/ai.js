// Warring Banners - three warlord personalities. Produces a queue of discrete actions.
var AI = (function () {
  var K = HEX.key;

  var PROF = {
    turtle:   { unit: 'spear', want: 5, leash: 2, greed: 0.6, aggro: 1.30, defend: 4.0, claim: 2.0 },
    raider:   { unit: 'cav',   want: 6, leash: 9, greed: 1.6, aggro: 1.02, defend: 1.0, claim: 1.4 },
    expander: { unit: 'bow',   want: 5, leash: 9, greed: 1.0, aggro: 1.35, defend: 1.6, claim: 3.2 }
  };

  function prof(f) { return PROF[G.FACTIONS[f].ai] || PROF.raider; }

  function nearestEnemyDist(S, f, q, r) {
    var best = 99;
    for (var i = 0; i < S.armies.length; i++) {
      var a = S.armies[i];
      if (a.owner === f) continue;
      var d = HEX.dist(q, r, a.q, a.r);
      if (d < best) best = d;
    }
    return best;
  }
  function weakestRival(S, f) {
    var best = -1, bs = 1e9;
    for (var g = 0; g < 4; g++) {
      if (g === f || !S.alive[g]) continue;
      var s = G.territory(g) * 2;
      for (var i = 0; i < S.armies.length; i++) if (S.armies[i].owner === g) s += S.armies[i].str / 4;
      if (s < bs) { bs = s; best = g; }
    }
    return best;
  }
  // distance from (q,r) to the nearest hex this faction owns
  function distToOwn(S, f, q, r) {
    var best = 99;
    for (var i = 0; i < S.list.length; i++) {
      var h = S.list[i];
      if (h.owner !== f) continue;
      var d = HEX.dist(q, r, h.q, h.r);
      if (d < best) { best = d; if (d === 0) break; }
    }
    return best;
  }
  function threatAt(S, f, q, r) {
    var t = 0;
    for (var i = 0; i < S.armies.length; i++) {
      var a = S.armies[i];
      if (a.owner === f) continue;
      if (HEX.dist(q, r, a.q, a.r) <= 2) t += a.str;
    }
    return t;
  }

  // Build the full action list for faction f this turn.
  function plan(f) {
    var S = G.state, acts = [];
    if (!S || !S.alive[f]) return acts;
    var p = prof(f), kq = G.KEEPS[f][0], kr = G.KEEPS[f][1];
    var target = weakestRival(S, f);

    // 1. recruit
    var gold = S.gold[f], have = G.countArmies(f);
    var order = [p.unit, 'spear', 'bow', 'cav'];
    for (var pass = 0; pass < 3 && have < p.want; pass++) {
      var got = false;
      for (var u = 0; u < order.length; u++) {
        var t = order[u];
        if (gold >= G.UNITS[t].cost && have < p.want) {
          acts.push({ kind: 'recruit', f: f, type: t });
          gold -= G.UNITS[t].cost; have++; got = true; break;
        }
      }
      if (!got) break;
    }

    // 2. per-army action (evaluated against a shadow of occupancy via live state at exec time)
    var mine = [];
    for (var i = 0; i < S.armies.length; i++) if (S.armies[i].owner === f) mine.push(S.armies[i].id);
    for (i = 0; i < mine.length; i++) acts.push({ kind: 'act', f: f, id: mine[i] });
    acts.push({ kind: 'done', f: f });
    return acts;
  }

  // how many of this faction's armies sit on or beside the home keep
  function guards(S, f) {
    var kq = G.KEEPS[f][0], kr = G.KEEPS[f][1], n = 0;
    for (var i = 0; i < S.armies.length; i++) {
      var a = S.armies[i];
      if (a.owner === f && HEX.dist(a.q, a.r, kq, kr) <= 1) n++;
    }
    return n;
  }

  // Decide + perform one army's action right now (state is live).
  function actArmy(f, id, fx) {
    var S = G.state;
    var a = G.armyById(id);
    if (!a || a.owner !== f || a.mp <= 0) return false;
    var p = prof(f), kq = G.KEEPS[f][0], kr = G.KEEPS[f][1];
    var rt = G.computeReach(a);
    // last defender must not wander off the keep
    var myDk = HEX.dist(a.q, a.r, kq, kr);
    var homeGuards = guards(S, f);
    var isLastGuard = (myDk <= 1) && (homeGuards <= 1);

    // --- attacks ---
    var bestAtk = null, bestAtkScore = 0;
    for (var k in rt.targets) {
      var parts = k.split(','), q = parseInt(parts[0], 10), r = parseInt(parts[1], 10);
      var d = G.armyAt(q, r);
      if (!d) continue;
      var pv = G.preview(a, d);
      if (!pv.win) continue;
      if (pv.A < pv.D * p.aggro) continue;
      // the last guard only strikes at foes right next to the keep
      if (isLastGuard && HEX.dist(q, r, kq, kr) > 1) continue;
      var sc = pv.surv + (pv.hex.keep >= 0 ? 22 : 0) + (pv.hex.owner === f ? 0 : 5);
      sc += (d.owner === weakestRival(S, f) ? 4 : 0) * p.greed;
      if (HEX.dist(q, r, kq, kr) <= 2) sc += p.defend * 3;
      if (sc > bestAtkScore) { bestAtkScore = sc; bestAtk = { d: d, pv: pv }; }
    }
    if (bestAtk) {
      if (fx) fx.clash(bestAtk.d.q, bestAtk.d.r, bestAtk.pv);
      G.resolve(bestAtk.pv);
      return true;
    }

    // --- moves ---
    var bestK = null, bestScore = -1e9;
    for (var mk in rt.reach) {
      var pp = mk.split(','), mq = parseInt(pp[0], 10), mr = parseInt(pp[1], 10);
      var h = G.hexAt(mq, mr);
      if (!h) continue;
      var s = 0;
      if (h.owner === -1) s += 6 * p.claim;
      else if (h.owner !== f) s += 5 * p.greed + (h.owner === weakestRival(S, f) ? 3 : 0);
      else s += 0.4;
      if (h.keep >= 0 && h.keep !== f) s += 30;
      // supply hygiene: reward staying connected
      var conn = 0, nb = HEX.neighbors(mq, mr);
      for (var n = 0; n < nb.length; n++) {
        var hn = G.hexAt(nb[n][0], nb[n][1]);
        if (hn && hn.owner === f) conn++;
      }
      s += conn * 1.8;
      s += G.TERR[h.terr].def * 2.0;
      // leash to keep
      var dk = HEX.dist(mq, mr, kq, kr);
      if (isLastGuard && dk > 1) s -= 400;          // never abandon an empty keep
      if (homeGuards === 0) s += 50 - dk * 9;       // an empty keep pulls the nearest banner back
      if (dk > p.leash) s -= (dk - p.leash) * 6;
      s -= dk * (0.9 - p.greed * 0.4);
      // press toward the weakest rival
      var tgt = weakestRival(S, f);
      if (tgt >= 0 && p.greed > 1) {
        s -= HEX.dist(mq, mr, G.KEEPS[tgt][0], G.KEEPS[tgt][1]) * 0.7 * p.greed;
      }
      // defend the home keep when threatened
      var homeThreat = threatAt(S, f, kq, kr);
      if (homeThreat > 0 && dk <= 2) s += p.defend * homeThreat * 0.25;
      // avoid parking under a bigger stack
      var th = threatAt(S, f, mq, mr);
      if (th > a.str * 1.4) s -= (th - a.str) * 0.5;
      s -= distToOwn(S, f, mq, mr) * 1.2;
      s += (rt.reach[mk] > 0 ? 0.5 : 0);
      if (s > bestScore) { bestScore = s; bestK = { q: mq, r: mr, mp: rt.reach[mk] }; }
    }
    if (bestK && bestScore > 0) {
      if (fx) fx.march(a, bestK.q, bestK.r);
      G.moveArmy(a, bestK.q, bestK.r, bestK.mp);
      return true;
    }
    a.mp = 0;
    return false;
  }

  return { plan: plan, actArmy: actArmy, PROF: PROF };
})();
