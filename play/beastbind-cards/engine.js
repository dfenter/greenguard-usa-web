/* Beastbind Cards - battle rules engine + ladder AI. Pure logic, no rendering. */
(function (root) {
  'use strict';
  var D = root.BB_CARDS;
  var C = D.CARDS;

  var MAX_LOG = 30;
  var BENCH = 3;
  var PRIZES = 3;

  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function mkSide(deckIds, isAI, name, weights) {
    return {
      deck: shuffle(deckIds.slice()), hand: [], disc: [],
      active: null, bench: [null, null, null],
      prizes: 0, energyLeft: 1, boost: 0, quick: false,
      isAI: !!isAI, name: name, w: weights || null, setupDone: false
    };
  }

  function mkCr(cardId, turn) {
    return { c: cardId, d: 0, e: [], pt: turn, sh: 0, fz: false, fzn: false, fx: 0 };
  }

  function maxHp(cr) { return C[cr.c].hp; }
  function curHp(cr) { return C[cr.c].hp - cr.d; }

  // ---------------------------------------------------------------- state
  function create(playerDeck, rung) {
    var L = D.LADDER[rung];
    var G = {
      rung: rung, foe: L, turn: 1, who: 'p', over: 0, // 0 running, 1 win, 2 loss
      p: mkSide(playerDeck, false, 'You', null),
      o: mkSide(L.d, true, L.n, L.ai),
      log: [], fx: [], hint: '', await: null, started: false
    };
    openingHand(G.p); openingHand(G.o);
    // AI sets up immediately; player places their own Active
    aiSetup(G, G.o);
    G.hint = 'Drag a creature card onto your ACTIVE slot';
    return G;
  }

  function openingHand(S) {
    for (var tries = 0; tries < 14; tries++) {
      S.hand.forEach(function (c) { S.deck.push(c); });
      S.hand = [];
      shuffle(S.deck);
      for (var i = 0; i < 6 && S.deck.length; i++) S.hand.push(S.deck.pop());
      if (hasBasic(S.hand)) return;
    }
  }
  function hasBasic(h) {
    for (var i = 0; i < h.length; i++) if (C[h[i]].t === 'c' && C[h[i]].s === 1) return true;
    return false;
  }

  function log(G, s) {
    G.log.push(s);
    while (G.log.length > MAX_LOG) G.log.shift();
  }
  function fx(G, kind, a, b) {
    G.fx.push({ k: kind, a: a, b: b });
    while (G.fx.length > 24) G.fx.shift();
  }

  // ---------------------------------------------------------------- placement
  function canPlaceBasic(S, cardId) {
    var c = C[cardId];
    return c.t === 'c' && c.s === 1;
  }

  function placeActive(G, S, handIdx) {
    var id = S.hand[handIdx];
    if (id === undefined || !canPlaceBasic(S, id) || S.active) return false;
    S.hand.splice(handIdx, 1);
    S.active = mkCr(id, G.turn);
    log(G, (S.isAI ? G.foe.n : 'You') + ' sent out ' + C[id].n);
    fx(G, 'place', S.isAI ? 'o' : 'p', -1);
    return true;
  }

  function placeBench(G, S, handIdx, slot) {
    var id = S.hand[handIdx];
    if (id === undefined || !canPlaceBasic(S, id)) return false;
    if (slot < 0 || slot >= BENCH || S.bench[slot]) return false;
    S.hand.splice(handIdx, 1);
    S.bench[slot] = mkCr(id, G.turn);
    log(G, (S.isAI ? G.foe.n : 'You') + ' benched ' + C[id].n);
    fx(G, 'place', S.isAI ? 'o' : 'p', slot);
    return true;
  }

  function evoTarget(S, slot) { return slot < 0 ? S.active : S.bench[slot]; }

  function canEvolve(G, S, cardId, cr) {
    if (!cr) return false;
    var c = C[cardId];
    if (c.t !== 'c' || c.s === 1) return false;
    if (c.ev !== cr.c) return false;
    if (!S.quick && cr.pt >= G.turn) return false;
    return true;
  }

  function evolve(G, S, handIdx, slot) {
    var id = S.hand[handIdx];
    var cr = evoTarget(S, slot);
    if (id === undefined || !canEvolve(G, S, id, cr)) return false;
    S.hand.splice(handIdx, 1);
    S.disc.push(cr.c);
    cr.c = id; cr.pt = G.turn; cr.fz = false; cr.fzn = false;
    log(G, (S.isAI ? G.foe.n : 'You') + ' evolved into ' + C[id].n);
    fx(G, 'evolve', S.isAI ? 'o' : 'p', slot);
    return true;
  }

  function attachEnergy(G, S, slot, el) {
    if (S.energyLeft <= 0) return false;
    var cr = evoTarget(S, slot);
    if (!cr) return false;
    if (cr.e.length >= 6) return false; // cap
    if (el === undefined || el === null) el = C[cr.c].e;
    cr.e.push(el);
    S.energyLeft--;
    fx(G, 'energy', S.isAI ? 'o' : 'p', slot);
    return true;
  }

  function energyPay(cr, atk) {
    // returns true if attached energy satisfies cost
    var el = C[cr.c].e, match = 0, i;
    for (i = 0; i < cr.e.length; i++) if (cr.e[i] === el) match++;
    return cr.e.length >= atk.c && match >= atk.m;
  }

  function retreatCost(cr) { return C[cr.c].rt; }

  function retreat(G, S, slot, free) {
    if (!S.active || slot < 0 || slot >= BENCH || !S.bench[slot]) return false;
    var cost = free ? 0 : retreatCost(S.active);
    if (S.active.e.length < cost) return false;
    for (var i = 0; i < cost; i++) S.active.e.pop();
    var t = S.active; S.active = S.bench[slot]; S.bench[slot] = t;
    S.active.fzn = false;
    log(G, (S.isAI ? G.foe.n : 'You') + ' switched to ' + C[S.active.c].n);
    fx(G, 'swap', S.isAI ? 'o' : 'p', slot);
    return true;
  }

  // ---------------------------------------------------------------- handlers
  function handlerNeedsTarget(fxc) {
    return fxc === 'REBIND' || fxc === 'SWAPSELF';
  }

  function playHandler(G, S, handIdx, arg) {
    var id = S.hand[handIdx];
    if (id === undefined || C[id].t !== 'h') return false;
    var f = C[id].fx, O = (S === G.p) ? G.o : G.p, i, n;
    var did = true;
    switch (f) {
      case 'DRAW2': draw(G, S, 2); break;
      case 'DRAW3': draw(G, S, 3); break;
      case 'HEAL30': did = heal(G, S, 30); break;
      case 'HEAL60': did = heal(G, S, 60); break;
      case 'SCOUT': draw(G, S, 1); heal(G, S, 20); break;
      case 'EXTRA_E': S.energyLeft++; break;
      case 'BOOST20': S.boost += 20; break;
      case 'BOOST40':
        if (!S.active || S.active.e.length < 1) { did = false; break; }
        S.active.e.pop(); S.boost += 40; break;
      case 'SHIELD20': if (!S.active) { did = false; break; } S.active.sh += 20; break;
      case 'QUICKEVO': S.quick = true; break;
      case 'GUST':
        did = false;
        var opts = [];
        for (i = 0; i < BENCH; i++) if (O.bench[i]) opts.push(i);
        if (opts.length) { forceSwap(G, O, opts[rnd(opts.length)]); did = true; }
        break;
      case 'SWAPSELF':
        did = retreat(G, S, (arg === undefined ? firstBench(S) : arg), true); break;
      case 'SEARCH':
        did = false;
        for (i = 0; i < S.deck.length; i++) {
          if (C[S.deck[i]].t === 'c' && C[S.deck[i]].s === 1) {
            S.hand.push(S.deck.splice(i, 1)[0]); shuffle(S.deck); did = true; break;
          }
        }
        break;
      case 'RECYCLE':
        n = 0;
        while (S.disc.length && n < 2) { S.deck.push(S.disc.pop()); n++; }
        shuffle(S.deck); did = n > 0; break;
      case 'REBIND':
        did = rebind(G, S, arg); break;
      default: did = false;
    }
    if (!did) return false;
    S.hand.splice(handIdx, 1);
    S.disc.push(id);
    log(G, (S.isAI ? G.foe.n : 'You') + ' played ' + C[id].n);
    fx(G, 'handler', S.isAI ? 'o' : 'p', -1);
    return true;
  }

  function firstBench(S) { for (var i = 0; i < BENCH; i++) if (S.bench[i]) return i; return -1; }

  function rebind(G, S, slot) {
    // move one energy from a benched creature to the active (or vice-versa if active is full)
    var src = null, i;
    if (slot !== undefined && slot !== null && slot >= 0 && S.bench[slot] && S.bench[slot].e.length) src = S.bench[slot];
    if (!src) for (i = 0; i < BENCH; i++) if (S.bench[i] && S.bench[i].e.length) { src = S.bench[i]; break; }
    if (!src || !S.active || S.active.e.length >= 6) return false;
    S.active.e.push(src.e.pop());
    return true;
  }

  function heal(G, S, n) {
    if (!S.active || S.active.d <= 0) return false;
    S.active.d = Math.max(0, S.active.d - n);
    fx(G, 'heal', S === G.p ? 'p' : 'o', -1);
    return true;
  }

  function forceSwap(G, S, slot) {
    if (!S.active || !S.bench[slot]) return false;
    var t = S.active; S.active = S.bench[slot]; S.bench[slot] = t;
    S.active.fzn = false;
    log(G, C[S.active.c].n + ' was dragged forward');
    fx(G, 'swap', S === G.p ? 'p' : 'o', slot);
    return true;
  }

  function draw(G, S, n) {
    for (var i = 0; i < n; i++) {
      if (!S.deck.length) return false;
      if (S.hand.length >= 12) { S.disc.push(S.deck.pop()); continue; } // hand cap
      S.hand.push(S.deck.pop());
    }
    return true;
  }

  // ---------------------------------------------------------------- combat
  function damageOf(G, S, O, atk) {
    var A = S.active, Dn = O.active;
    var dmg = atk.d;
    if (dmg <= 0) return 0;
    dmg += S.boost;
    if (D.WEAK_TO[C[Dn.c].e] === C[A.c].e) dmg *= 2;
    dmg -= Dn.sh;
    return Math.max(0, dmg);
  }

  function canAttack(G, S, idx) {
    var O = (S === G.p) ? G.o : G.p;
    if (!S.active || !O.active || G.over) return false;
    if (S.active.fzn) return false;
    var atk = C[S.active.c].a[idx];
    if (!atk) return false;
    return energyPay(S.active, atk);
  }

  function attack(G, S, idx) {
    if (!canAttack(G, S, idx)) return false;
    var O = (S === G.p) ? G.o : G.p;
    var A = S.active, atk = C[A.c].a[idx];
    var side = S === G.p ? 'p' : 'o';
    var dmg = damageOf(G, S, O, atk);
    log(G, C[A.c].n + ' used ' + atk.n + (dmg ? ' for ' + dmg : ''));
    if (dmg > 0) {
      O.active.d += dmg;
      fx(G, 'hit', side === 'p' ? 'o' : 'p', dmg);
    }
    // effects
    if (atk.x) {
      var p = atk.x.split(':'), v = parseInt(p[1], 10) || 0;
      if (p[0] === 'recoil') { A.d += v; fx(G, 'hit', side, v); }
      else if (p[0] === 'heal') { A.d = Math.max(0, A.d - v); fx(G, 'heal', side, -1); }
      else if (p[0] === 'drain') { A.d = Math.max(0, A.d - Math.min(v, dmg)); fx(G, 'heal', side, -1); }
      else if (p[0] === 'draw') { draw(G, S, 1); }
      else if (p[0] === 'shield') { A.sh += v; }
      else if (p[0] === 'stall') {
        if (O.active) {
          if (O.active.imm) log(G, C[O.active.c].n + ' shrugs off the bind');
          else { O.active.fz = true; log(G, C[O.active.c].n + ' is bound'); }
        }
      }
      else if (p[0] === 'bench') {
        for (var i = 0; i < BENCH; i++) if (O.bench[i]) O.bench[i].d += v;
        fx(G, 'benchhit', side === 'p' ? 'o' : 'p', v);
      }
      else if (p[0] === 'gust') {
        var opts = [];
        for (var k = 0; k < BENCH; k++) if (O.bench[k]) opts.push(k);
        if (opts.length) forceSwap(G, O, opts[rnd(opts.length)]);
      }
    }
    resolveKOs(G);
    if (!G.over) endTurn(G);
    return true;
  }

  function resolveKOs(G) {
    ['p', 'o'].forEach(function (k) {
      var S = G[k], O = G[k === 'p' ? 'o' : 'p'], i;
      for (i = 0; i < BENCH; i++) {
        if (S.bench[i] && curHp(S.bench[i]) <= 0) {
          discardCr(S, S.bench[i]); S.bench[i] = null;
          O.prizes++; fx(G, 'ko', k, i);
          log(G, (S.isAI ? G.foe.n : 'You') + ' lost a benched creature');
        }
      }
      if (S.active && curHp(S.active) <= 0) {
        log(G, C[S.active.c].n + ' was knocked out');
        discardCr(S, S.active); S.active = null;
        O.prizes++; fx(G, 'ko', k, -1);
      }
    });
    // promote
    ['p', 'o'].forEach(function (k) {
      var S = G[k];
      if (!S.active) {
        var b = firstBench(S);
        if (b >= 0) {
          if (S.isAI) { S.active = S.bench[b]; S.bench[b] = null; S.active.fzn = false; log(G, G.foe.n + ' promoted ' + C[S.active.c].n); }
          else if (countCr(S) > 0) { G.await = 'promote'; }
        }
      }
    });
    checkOver(G);
  }

  function promote(G, slot) {
    var S = G.p;
    if (S.active || !S.bench[slot]) return false;
    S.active = S.bench[slot]; S.bench[slot] = null; S.active.fzn = false;
    G.await = null;
    log(G, 'You promoted ' + C[S.active.c].n);
    checkOver(G);
    return true;
  }

  function countCr(S) {
    var n = S.active ? 1 : 0;
    for (var i = 0; i < BENCH; i++) if (S.bench[i]) n++;
    return n;
  }

  function discardCr(S, cr) {
    S.disc.push(cr.c);
    while (S.disc.length > 80) S.disc.shift();
  }

  function checkOver(G) {
    if (G.over) return;
    if (G.p.prizes >= PRIZES) { G.over = 1; log(G, 'You take the third prize marker. WIN!'); return; }
    if (G.o.prizes >= PRIZES) { G.over = 2; log(G, G.foe.n + ' takes the third marker.'); return; }
    if (!G.o.active && countCr(G.o) === 0) { G.over = 1; log(G, G.foe.n + ' has nothing left. WIN!'); return; }
    if (!G.p.active && countCr(G.p) === 0) { G.over = 2; log(G, 'You have nothing left to send out.'); return; }
  }

  // ---------------------------------------------------------------- turns
  function beginBattle(G) {
    if (G.started) return;
    G.started = true;
    G.who = 'p';
    G.turn = 1;
    startTurn(G, G.p, true);
  }

  function startTurn(G, S, first) {
    var all = allCr(S), i;
    for (i = 0; i < all.length; i++) {
      all[i].sh = 0;
      all[i].fzn = all[i].fz;
      all[i].fz = false;
      all[i].imm = all[i].fzn; // cannot be bound on back-to-back turns
    }
    S.energyLeft = 1; S.boost = 0; S.quick = false;
    if (!first) {
      if (!S.deck.length) {
        G.over = (S === G.p) ? 2 : 1;
        log(G, (S === G.p ? 'Your' : G.foe.n + "'s") + ' deck is empty.');
        return;
      }
      draw(G, S, 1);
    }
    G.hint = (S === G.p) ? 'Tap ENERGY then a creature, then tap an attack' : '';
  }

  function allCr(S) {
    var a = [];
    if (S.active) a.push(S.active);
    for (var i = 0; i < BENCH; i++) if (S.bench[i]) a.push(S.bench[i]);
    return a;
  }

  function endTurn(G) {
    if (G.over) return;
    resolveKOs(G);
    if (G.over) return;
    if (G.await === 'promote') { G.pendingEnd = true; return; }
    G.who = (G.who === 'p') ? 'o' : 'p';
    G.turn++;
    startTurn(G, G[G.who], false);
    checkOver(G);
  }

  // ---------------------------------------------------------------- AI
  function aiSetup(G, S) {
    // active = best basic (highest hp), then fill bench
    var order = S.hand.map(function (id, i) { return { id: id, i: i }; })
      .filter(function (x) { return C[x.id].t === 'c' && C[x.id].s === 1; })
      .sort(function (a, b) { return C[b.id].hp - C[a.id].hp; });
    if (!order.length) return;
    placeActive(G, S, order[0].i);
    var n = 0;
    for (var guard = 0; guard < 6 && n < BENCH; guard++) {
      var idx = -1;
      for (var i = 0; i < S.hand.length; i++) if (C[S.hand[i]].t === 'c' && C[S.hand[i]].s === 1) { idx = i; break; }
      if (idx < 0) break;
      if (!placeBench(G, S, idx, n)) break;
      n++;
    }
    S.setupDone = true;
  }

  // one discrete AI action per call; returns false when the turn should end
  function aiStep(G) {
    var S = G.o, O = G.p, w = S.w, i, k;
    if (G.over || G.who !== 'o') return false;

    // 1. promote if needed
    if (!S.active) {
      var b = bestBenchIdx(S);
      if (b >= 0) { S.active = S.bench[b]; S.bench[b] = null; S.active.fzn = false; log(G, G.foe.n + ' promoted ' + C[S.active.c].n); return true; }
      checkOver(G); return false;
    }

    // 2. evolve (front first)
    for (k = -1; k < BENCH; k++) {
      var cr = evoTarget(S, k);
      if (!cr) continue;
      for (i = 0; i < S.hand.length; i++) {
        if (canEvolve(G, S, S.hand[i], cr)) {
          if (Math.random() < 0.15 + 0.6 * w.evolve) { evolve(G, S, i, k); return true; }
        }
      }
    }
    // 2b. quick-evolve handler
    if (!S.quick && w.evolve > 1.4) {
      for (i = 0; i < S.hand.length; i++) {
        if (C[S.hand[i]].t === 'h' && C[S.hand[i]].fx === 'QUICKEVO') {
          for (k = -1; k < BENCH; k++) {
            var cr2 = evoTarget(S, k);
            if (!cr2) continue;
            for (var q = 0; q < S.hand.length; q++) {
              if (q !== i && C[S.hand[q]].t === 'c' && C[S.hand[q]].ev === cr2.c) {
                if (playHandler(G, S, i)) return true;
              }
            }
          }
        }
      }
    }

    // 3. bench basics
    var open = -1;
    for (i = 0; i < BENCH; i++) if (!S.bench[i]) { open = i; break; }
    if (open >= 0) {
      for (i = 0; i < S.hand.length; i++) {
        if (C[S.hand[i]].t === 'c' && C[S.hand[i]].s === 1) {
          if (Math.random() < 0.3 + 0.5 * w.bench) { placeBench(G, S, i, open); return true; }
        }
      }
    }

    // 4. handlers
    for (i = 0; i < S.hand.length; i++) {
      var h = C[S.hand[i]];
      if (h.t !== 'h') continue;
      var want = false;
      switch (h.fx) {
        case 'DRAW2': case 'DRAW3': want = S.hand.length <= 5; break;
        case 'SCOUT': want = S.hand.length <= 6; break;
        case 'HEAL30': want = S.active.d >= 30; break;
        case 'HEAL60': want = S.active.d >= 50; break;
        case 'EXTRA_E': want = true; break;
        case 'BOOST20': want = koReachable(G, S, O, 20); break;
        case 'BOOST40': want = S.active.e.length > bestAtkCost(S) && koReachable(G, S, O, 40); break;
        case 'SHIELD20': want = O.active && S.active.d > 0 && w.retreat > 0.4; break;
        case 'GUST': want = countCr(O) > 1 && w.bench > 1.1; break;
        case 'SEARCH': want = !hasBasic(S.hand) && open >= 0; break;
        case 'RECYCLE': want = S.deck.length < 5 && S.disc.length >= 2; break;
        case 'SWAPSELF': want = S.active.d > maxHp(S.active) * 0.7 && firstBench(S) >= 0; break;
        case 'REBIND': want = S.active.e.length < bestAtkCost(S); break;
        case 'QUICKEVO': want = false; break;
      }
      if (want && playHandler(G, S, i)) return true;
    }

    // 5. energy - to active unless it is doomed and a bench threat exists
    if (S.energyLeft > 0) {
      var target = -1;
      if (w.big > 1.3) {
        // bomb decks charge the biggest thing they have
        var bestSlot = -1, bestVal = valueOf(S.active) - (S.active.d / 10);
        for (i = 0; i < BENCH; i++) if (S.bench[i] && valueOf(S.bench[i]) > bestVal + 2) { bestVal = valueOf(S.bench[i]); bestSlot = i; }
        target = bestSlot;
      }
      attachEnergy(G, S, target, C[evoTarget(S, target) ? evoTarget(S, target).c : S.active.c].e);
      return true;
    }

    // 6. retreat a doomed active
    if (S.active.d > maxHp(S.active) * 0.72 && Math.random() < w.retreat) {
      var bb = bestBenchIdx(S);
      if (bb >= 0 && S.active.e.length >= retreatCost(S.active)) { retreat(G, S, bb, false); return true; }
    }

    // 7. attack
    var atks = C[S.active.c].a, choice = -1, bestScore = -1;
    for (i = 0; i < atks.length; i++) {
      if (!canAttack(G, S, i)) continue;
      var dm = damageOf(G, S, O, atks[i]);
      var sc = dm;
      if (O.active && dm >= curHp(O.active)) sc += 500;
      if (i === atks.length - 1) sc *= (0.8 + 0.2 * w.big);
      if (sc > bestScore) { bestScore = sc; choice = i; }
    }
    if (choice >= 0) {
      // bomb archetypes may hold for the bigger attack
      if (w.big > 1.6 && choice === 0 && atks.length > 1 && S.active.e.length === atks[1].c - 1 && Math.random() < 0.5) {
        endTurn(G); return false;
      }
      attack(G, S, choice);
      return false;
    }
    endTurn(G);
    return false;
  }

  function bestAtkCost(S) {
    var a = C[S.active.c].a;
    return a.length ? a[a.length - 1].c : 1;
  }
  function valueOf(cr) { return C[cr.c].hp / 10 + C[cr.c].s * 3; }
  function bestBenchIdx(S) {
    var b = -1, v = -1;
    for (var i = 0; i < BENCH; i++) if (S.bench[i]) {
      var val = valueOf(S.bench[i]) - S.bench[i].d / 20 + S.bench[i].e.length;
      if (val > v) { v = val; b = i; }
    }
    return b;
  }
  function koReachable(G, S, O, bonus) {
    if (!O.active || !S.active) return false;
    var a = C[S.active.c].a;
    for (var i = 0; i < a.length; i++) {
      if (!energyPay(S.active, a[i])) continue;
      var d = damageOf(G, S, O, a[i]) + bonus;
      if (d >= curHp(O.active) && damageOf(G, S, O, a[i]) < curHp(O.active)) return true;
    }
    return false;
  }

  root.BB_ENGINE = {
    BENCH: BENCH, PRIZES: PRIZES,
    create: create, beginBattle: beginBattle,
    placeActive: placeActive, placeBench: placeBench, evolve: evolve, canEvolve: canEvolve,
    canPlaceBasic: canPlaceBasic, attachEnergy: attachEnergy, retreat: retreat,
    playHandler: playHandler, handlerNeedsTarget: handlerNeedsTarget,
    attack: attack, canAttack: canAttack, damageOf: damageOf, energyPay: energyPay,
    endTurn: endTurn, aiStep: aiStep, promote: promote, evoTarget: evoTarget,
    curHp: curHp, maxHp: maxHp, countCr: countCr, allCr: allCr, shuffle: shuffle,
    retreatCost: retreatCost, log: log
  };
})(window);
