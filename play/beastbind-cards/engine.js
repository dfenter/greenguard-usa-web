/* Beastbind Cards - battle rules engine, undo history and ladder AI.
 * Pure logic: no rendering, no DOM, no timers. */
(function (root) {
  'use strict';
  var D = root.BB_CARDS;
  var C = D.CARDS;

  var MAX_LOG = 30;
  var MAX_FX = 32;
  var MAX_UNDO = 12;
  var BENCH = 3;
  var PRIZES = 3;
  var HAND_CAP = 12;
  var ENERGY_CAP = 6;
  var OPENING = 6;

  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function card(id) { return C[id] || null; }

  function mkSide(deckIds, isAI, name, weights, skill) {
    return {
      deck: shuffle(deckIds.slice()), hand: [], disc: [],
      active: null, bench: [null, null, null],
      prizes: 0, energyLeft: 1, boost: 0, quick: false,
      isAI: !!isAI, name: name, w: weights || null, skill: skill == null ? 0.5 : skill,
      setupDone: false
    };
  }

  function mkCr(cardId, turn) {
    return { c: cardId, d: 0, e: [], pt: turn, sh: 0, fz: false, fzn: false, imm: false, uid: (mkCr.n = (mkCr.n || 0) + 1) };
  }

  function maxHp(cr) { return cr ? C[cr.c].hp : 0; }
  function curHp(cr) { return cr ? C[cr.c].hp - cr.d : 0; }

  // ---------------------------------------------------------------- state
  // foe: {n, el, arch, tell, ai, skill, d}
  function create(playerDeck, foe, opts) {
    opts = opts || {};
    var G = {
      foe: foe, rung: opts.rung == null ? -1 : opts.rung, mode: opts.mode || 'gauntlet',
      turn: 1, who: 'p', over: 0, // 0 running, 1 win, 2 loss
      p: mkSide(playerDeck, false, 'You', null, 1),
      o: mkSide(foe.d, true, foe.n, foe.ai, foe.skill),
      log: [], fx: [], hint: '', await: null, started: false,
      pendingEnd: false, history: [], actionsThisTurn: 0
    };
    openingHand(G.p); openingHand(G.o);
    aiSetup(G, G.o);
    G.hint = 'Drag a Stage 1 beast onto the ACTIVE slot';
    return G;
  }

  function openingHand(S) {
    for (var tries = 0; tries < 14; tries++) {
      S.hand.forEach(function (c) { S.deck.push(c); });
      S.hand = [];
      shuffle(S.deck);
      for (var i = 0; i < OPENING && S.deck.length; i++) S.hand.push(S.deck.pop());
      if (hasBasic(S.hand)) return;
    }
  }
  function hasBasic(h) {
    for (var i = 0; i < h.length; i++) if (C[h[i]] && C[h[i]].t === 'c' && C[h[i]].s === 1) return true;
    return false;
  }

  function log(G, s) {
    G.log.push(s);
    while (G.log.length > MAX_LOG) G.log.shift();
  }
  function fx(G, kind, side, slot, value, extra) {
    G.fx.push({ k: kind, side: side, slot: slot === undefined ? -1 : slot, v: value || 0, x: extra || null });
    while (G.fx.length > MAX_FX) G.fx.shift();
  }
  function sideKey(G, S) { return S === G.p ? 'p' : 'o'; }

  // ------------------------------------------------------------ undo
  // Snapshot every reversible player action so a misdrop never costs a game.
  function snapshot(G) {
    return JSON.stringify({
      turn: G.turn, who: G.who, over: G.over, await: G.await, pendingEnd: G.pendingEnd,
      actionsThisTurn: G.actionsThisTurn,
      p: sideSnap(G.p), o: sideSnap(G.o), log: G.log.slice(-MAX_LOG)
    });
  }
  function sideSnap(S) {
    return {
      deck: S.deck.slice(), hand: S.hand.slice(), disc: S.disc.slice(),
      active: S.active ? crSnap(S.active) : null,
      bench: S.bench.map(function (b) { return b ? crSnap(b) : null; }),
      prizes: S.prizes, energyLeft: S.energyLeft, boost: S.boost, quick: S.quick, setupDone: S.setupDone
    };
  }
  function crSnap(cr) {
    return { c: cr.c, d: cr.d, e: cr.e.slice(), pt: cr.pt, sh: cr.sh, fz: cr.fz, fzn: cr.fzn, imm: cr.imm, uid: cr.uid };
  }
  function pushUndo(G) {
    G.history.push(snapshot(G));
    while (G.history.length > MAX_UNDO) G.history.shift();
  }
  function clearUndo(G) { G.history.length = 0; }
  function canUndo(G) { return !G.over && G.who === 'p' && G.history.length > 0; }
  function undo(G) {
    if (!canUndo(G)) return false;
    var s;
    try { s = JSON.parse(G.history.pop()); } catch (e) { return false; }
    G.turn = s.turn; G.who = s.who; G.over = s.over; G.await = s.await;
    G.pendingEnd = s.pendingEnd; G.actionsThisTurn = s.actionsThisTurn;
    restoreSide(G.p, s.p); restoreSide(G.o, s.o);
    G.log = s.log.slice();
    G.fx.length = 0;
    fx(G, 'undo', 'p', -1, 0);
    return true;
  }
  function restoreSide(S, s) {
    S.deck = s.deck.slice(); S.hand = s.hand.slice(); S.disc = s.disc.slice();
    S.active = s.active ? crSnap(s.active) : null;
    S.bench = s.bench.map(function (b) { return b ? crSnap(b) : null; });
    S.prizes = s.prizes; S.energyLeft = s.energyLeft; S.boost = s.boost;
    S.quick = s.quick; S.setupDone = s.setupDone;
  }

  // ---------------------------------------------------------------- placement
  function canPlaceBasic(S, cardId) {
    var c = card(cardId);
    return !!c && c.t === 'c' && c.s === 1;
  }

  function placeActive(G, S, handIdx) {
    var id = S.hand[handIdx];
    if (id === undefined || !canPlaceBasic(S, id) || S.active) return false;
    S.hand.splice(handIdx, 1);
    S.active = mkCr(id, G.turn);
    log(G, (S.isAI ? G.foe.n : 'You') + ' sent out ' + C[id].n);
    fx(G, 'place', sideKey(G, S), -1);
    return true;
  }

  function placeBench(G, S, handIdx, slot) {
    var id = S.hand[handIdx];
    if (id === undefined || !canPlaceBasic(S, id)) return false;
    if (slot < 0 || slot >= BENCH || S.bench[slot]) return false;
    S.hand.splice(handIdx, 1);
    S.bench[slot] = mkCr(id, G.turn);
    log(G, (S.isAI ? G.foe.n : 'You') + ' benched ' + C[id].n);
    fx(G, 'place', sideKey(G, S), slot);
    return true;
  }

  function evoTarget(S, slot) { return slot < 0 ? S.active : S.bench[slot]; }

  function canEvolve(G, S, cardId, cr) {
    if (!cr) return false;
    var c = card(cardId);
    if (!c || c.t !== 'c' || c.s === 1) return false;
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
    fx(G, 'evolve', sideKey(G, S), slot);
    return true;
  }

  function attachEnergy(G, S, slot, el) {
    if (S.energyLeft <= 0) return false;
    var cr = evoTarget(S, slot);
    if (!cr) return false;
    if (cr.e.length >= ENERGY_CAP) return false;
    if (el === undefined || el === null) el = C[cr.c].e;
    cr.e.push(el);
    S.energyLeft--;
    fx(G, 'energy', sideKey(G, S), slot);
    return true;
  }

  function energyPay(cr, atk) {
    if (!cr || !atk) return false;
    var el = C[cr.c].e, match = 0, i;
    for (i = 0; i < cr.e.length; i++) if (cr.e[i] === el) match++;
    return cr.e.length >= atk.c && match >= atk.m;
  }

  function retreatCost(cr) { return cr ? C[cr.c].rt : 0; }

  function canRetreat(G, S, slot) {
    if (!S.active || slot < 0 || slot >= BENCH || !S.bench[slot]) return false;
    if (S.active.fzn) return false;
    return S.active.e.length >= retreatCost(S.active);
  }

  function retreat(G, S, slot, free) {
    if (!S.active || slot < 0 || slot >= BENCH || !S.bench[slot]) return false;
    if (!free && S.active.fzn) return false;
    var cost = free ? 0 : retreatCost(S.active);
    if (S.active.e.length < cost) return false;
    for (var i = 0; i < cost; i++) S.active.e.pop();
    var t = S.active; S.active = S.bench[slot]; S.bench[slot] = t;
    S.active.fzn = false;
    log(G, (S.isAI ? G.foe.n : 'You') + ' switched to ' + C[S.active.c].n);
    fx(G, 'swap', sideKey(G, S), slot);
    return true;
  }

  // ---------------------------------------------------------------- handlers
  function handlerNeedsTarget(fxc) { return fxc === 'REBIND' || fxc === 'SWAPSELF'; }

  function canPlayHandler(G, S, handIdx) {
    var id = S.hand[handIdx];
    var c = card(id);
    if (!c || c.t !== 'h') return false;
    var O = (S === G.p) ? G.o : G.p, i;
    switch (c.fx) {
      case 'DRAW2': case 'DRAW3': case 'SCOUT': return S.deck.length > 0;
      case 'HEAL30': case 'HEAL60': return !!S.active && S.active.d > 0;
      case 'SHIELD20': return !!S.active;
      case 'BOOST40': return !!S.active && S.active.e.length > 0;
      case 'SWAPSELF': return firstBench(S) >= 0 && !!S.active;
      case 'GUST': return firstBench(O) >= 0 && !!O.active;
      case 'SEARCH':
        for (i = 0; i < S.deck.length; i++) if (C[S.deck[i]].t === 'c' && C[S.deck[i]].s === 1) return true;
        return false;
      case 'RECYCLE': return S.disc.length > 0;
      case 'REBIND':
        if (!S.active || S.active.e.length >= ENERGY_CAP) return false;
        for (i = 0; i < BENCH; i++) if (S.bench[i] && S.bench[i].e.length) return true;
        return false;
      default: return true;
    }
  }

  function playHandler(G, S, handIdx, arg) {
    var id = S.hand[handIdx];
    var c = card(id);
    if (!c || c.t !== 'h') return false;
    var f = c.fx, O = (S === G.p) ? G.o : G.p, i, n;
    var did = true;
    switch (f) {
      case 'DRAW2': did = draw(G, S, 2); break;
      case 'DRAW3': did = draw(G, S, 3); break;
      case 'HEAL30': did = heal(G, S, 30); break;
      case 'HEAL60': did = heal(G, S, 60); break;
      case 'SCOUT': did = draw(G, S, 1); heal(G, S, 20); break;
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
        if (opts.length && O.active) { forceSwap(G, O, opts[rnd(opts.length)]); did = true; }
        break;
      case 'SWAPSELF':
        did = retreat(G, S, (arg === undefined || arg === null ? firstBench(S) : arg), true); break;
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
    log(G, (S.isAI ? G.foe.n : 'You') + ' played ' + c.n);
    fx(G, 'handler', sideKey(G, S), -1, 0, f);
    return true;
  }

  function firstBench(S) { for (var i = 0; i < BENCH; i++) if (S.bench[i]) return i; return -1; }

  function rebind(G, S, slot) {
    var src = null, i;
    if (slot !== undefined && slot !== null && slot >= 0 && S.bench[slot] && S.bench[slot].e.length) src = S.bench[slot];
    if (!src) for (i = 0; i < BENCH; i++) if (S.bench[i] && S.bench[i].e.length) { src = S.bench[i]; break; }
    if (!src || !S.active || S.active.e.length >= ENERGY_CAP) return false;
    S.active.e.push(src.e.pop());
    fx(G, 'energy', sideKey(G, S), -1);
    return true;
  }

  function heal(G, S, n) {
    if (!S.active || S.active.d <= 0) return false;
    S.active.d = Math.max(0, S.active.d - n);
    fx(G, 'heal', sideKey(G, S), -1, n);
    return true;
  }

  function forceSwap(G, S, slot) {
    if (!S.active || !S.bench[slot]) return false;
    var t = S.active; S.active = S.bench[slot]; S.bench[slot] = t;
    S.active.fzn = false;
    log(G, C[S.active.c].n + ' was dragged forward');
    fx(G, 'swap', S.isAI ? 'o' : 'p', slot);
    return true;
  }

  function draw(G, S, n) {
    var got = 0;
    for (var i = 0; i < n; i++) {
      if (!S.deck.length) break;
      if (S.hand.length >= HAND_CAP) { S.disc.push(S.deck.pop()); continue; }
      S.hand.push(S.deck.pop());
      got++;
    }
    if (got) fx(G, 'draw', sideKey(G, S), -1, got);
    return got > 0;
  }

  // ---------------------------------------------------------------- combat
  function isWeak(G, S, O) {
    if (!S.active || !O.active) return false;
    return D.WEAK_TO[C[O.active.c].e] === C[S.active.c].e;
  }
  function damageOf(G, S, O, atk) {
    var A = S.active, Dn = O.active;
    if (!A || !Dn || !atk) return 0;
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
    var side = sideKey(G, S), foeSide = side === 'p' ? 'o' : 'p';
    var weak = isWeak(G, S, O);
    var dmg = damageOf(G, S, O, atk);
    log(G, C[A.c].n + ' used ' + atk.n + (dmg ? ' for ' + dmg : ''));
    fx(G, 'strike', side, -1, idx, atk.n);
    if (dmg > 0) {
      O.active.d += dmg;
      fx(G, 'hit', foeSide, -1, dmg, weak ? 'weak' : null);
    }
    if (atk.x) {
      var p = atk.x.split(':'), v = parseInt(p[1], 10) || 0, i, k;
      if (p[0] === 'recoil') { A.d += v; fx(G, 'hit', side, -1, v, 'recoil'); }
      else if (p[0] === 'heal') { A.d = Math.max(0, A.d - v); fx(G, 'heal', side, -1, v); }
      else if (p[0] === 'drain') { var got = Math.min(v, dmg); A.d = Math.max(0, A.d - got); if (got) fx(G, 'heal', side, -1, got); }
      else if (p[0] === 'draw') { draw(G, S, 1); }
      else if (p[0] === 'shield') { A.sh += v; fx(G, 'shield', side, -1, v); }
      else if (p[0] === 'stall') {
        if (O.active) {
          if (O.active.imm) log(G, C[O.active.c].n + ' shrugs off the bind');
          else { O.active.fz = true; log(G, C[O.active.c].n + ' is bound'); fx(G, 'bind', foeSide, -1, 0); }
        }
      }
      else if (p[0] === 'bench') {
        var any = false;
        for (i = 0; i < BENCH; i++) if (O.bench[i]) { O.bench[i].d += v; any = true; fx(G, 'hit', foeSide, i, v, 'spread'); }
        if (any) log(G, 'Bench took ' + v + ' spread damage');
      }
      else if (p[0] === 'gust') {
        var gopts = [];
        for (k = 0; k < BENCH; k++) if (O.bench[k]) gopts.push(k);
        if (gopts.length) forceSwap(G, O, gopts[rnd(gopts.length)]);
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
          var bid = S.bench[i].c;
          log(G, C[bid].n + ' was knocked out on the bench');
          discardCr(S, S.bench[i]); S.bench[i] = null;
          O.prizes++; fx(G, 'ko', k, i, bid);
        }
      }
      if (S.active && curHp(S.active) <= 0) {
        var aid = S.active.c;
        log(G, C[aid].n + ' was knocked out');
        discardCr(S, S.active); S.active = null;
        O.prizes++; fx(G, 'ko', k, -1, aid);
      }
    });
    ['p', 'o'].forEach(function (k) {
      var S = G[k];
      if (!S.active) {
        var b = firstBench(S);
        if (b >= 0) {
          if (S.isAI) {
            var pick = bestBenchIdx(S);
            if (pick < 0) pick = b;
            S.active = S.bench[pick]; S.bench[pick] = null; S.active.fzn = false;
            log(G, G.foe.n + ' promoted ' + C[S.active.c].n);
          } else G.await = 'promote';
        }
      }
    });
    checkOver(G);
  }

  function promote(G, slot) {
    var S = G.p;
    if (S.active || slot < 0 || slot >= BENCH || !S.bench[slot]) return false;
    S.active = S.bench[slot]; S.bench[slot] = null; S.active.fzn = false;
    G.await = null;
    log(G, 'You promoted ' + C[S.active.c].n);
    fx(G, 'place', 'p', -1);
    checkOver(G);
    if (!G.over && G.pendingEnd) { G.pendingEnd = false; advanceTurn(G); }
    return true;
  }

  function countCr(S) {
    var n = S.active ? 1 : 0;
    for (var i = 0; i < BENCH; i++) if (S.bench[i]) n++;
    return n;
  }

  function discardCr(S, cr) {
    S.disc.push(cr.c);
    while (S.disc.length > 90) S.disc.shift();
  }

  function checkOver(G) {
    if (G.over) return;
    if (G.p.prizes >= PRIZES) { G.over = 1; log(G, 'You take the third prize marker. Win.'); return; }
    if (G.o.prizes >= PRIZES) { G.over = 2; log(G, G.foe.n + ' takes the third marker.'); return; }
    if (!G.o.active && countCr(G.o) === 0) { G.over = 1; log(G, G.foe.n + ' has nothing left. Win.'); return; }
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
      all[i].imm = all[i].fzn; // cannot be bound on back to back turns
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
    if (S === G.p) { G.actionsThisTurn = 0; clearUndo(G); }
  }

  function allCr(S) {
    var a = [];
    if (S.active) a.push(S.active);
    for (var i = 0; i < BENCH; i++) if (S.bench[i]) a.push(S.bench[i]);
    return a;
  }

  function advanceTurn(G) {
    G.who = (G.who === 'p') ? 'o' : 'p';
    G.turn++;
    startTurn(G, G[G.who], false);
    checkOver(G);
  }

  function endTurn(G) {
    if (G.over) return;
    resolveKOs(G);
    if (G.over) return;
    if (G.await === 'promote') { G.pendingEnd = true; return; }
    advanceTurn(G);
  }

  // ---------------------------------------------------------------- AI
  function aiSetup(G, S) {
    var order = S.hand.map(function (id, i) { return { id: id, i: i }; })
      .filter(function (x) { return C[x.id].t === 'c' && C[x.id].s === 1; })
      .sort(function (a, b) { return C[b.id].hp - C[a.id].hp; });
    if (!order.length) return;
    placeActive(G, S, order[0].i);
    var n = 0;
    for (var guard = 0; guard < 8 && n < BENCH; guard++) {
      var idx = -1;
      for (var i = 0; i < S.hand.length; i++) if (C[S.hand[i]].t === 'c' && C[S.hand[i]].s === 1) { idx = i; break; }
      if (idx < 0) break;
      if (!placeBench(G, S, idx, n)) break;
      n++;
    }
    S.setupDone = true;
  }

  // Skill scales how reliably the AI takes its best line.
  function takes(S, base) {
    var p = base * (0.45 + 0.55 * S.skill) + S.skill * 0.25;
    return Math.random() < Math.min(0.99, p);
  }

  // one discrete AI action per call; returns false when the turn is finished
  function aiStep(G) {
    var S = G.o, O = G.p, w = S.w, i, k;
    if (G.over || G.who !== 'o') return false;

    // 1. promote if needed
    if (!S.active) {
      var b = bestBenchIdx(S);
      if (b >= 0) {
        S.active = S.bench[b]; S.bench[b] = null; S.active.fzn = false;
        log(G, G.foe.n + ' promoted ' + C[S.active.c].n);
        fx(G, 'place', 'o', -1);
        return true;
      }
      checkOver(G); return false;
    }

    // 2. lethal first: if an attack wins the game outright, take it
    var lethal = bestAttack(G, S, O, true);
    if (lethal.idx >= 0 && lethal.ko && S.prizes + 1 >= PRIZES && takes(S, 0.9)) {
      attack(G, S, lethal.idx); return false;
    }

    // 3. evolve, front first
    for (k = -1; k < BENCH; k++) {
      var cr = evoTarget(S, k);
      if (!cr) continue;
      for (i = 0; i < S.hand.length; i++) {
        if (canEvolve(G, S, S.hand[i], cr)) {
          if (takes(S, 0.25 + 0.45 * w.evolve)) { evolve(G, S, i, k); return true; }
        }
      }
    }
    // 3b. quick evolve handler
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

    // 4. bench basics
    var open = -1;
    for (i = 0; i < BENCH; i++) if (!S.bench[i]) { open = i; break; }
    if (open >= 0) {
      for (i = 0; i < S.hand.length; i++) {
        if (C[S.hand[i]].t === 'c' && C[S.hand[i]].s === 1) {
          if (takes(S, 0.3 + 0.4 * w.bench)) { placeBench(G, S, i, open); return true; }
        }
      }
    }

    // 5. handlers with real conditions
    for (i = 0; i < S.hand.length; i++) {
      var h = C[S.hand[i]];
      if (h.t !== 'h' || !canPlayHandler(G, S, i)) continue;
      var want = false;
      switch (h.fx) {
        case 'DRAW2': case 'DRAW3': want = S.hand.length <= 5; break;
        case 'SCOUT': want = S.hand.length <= 6 || S.active.d >= 20; break;
        case 'HEAL30': want = S.active.d >= 30; break;
        case 'HEAL60': want = S.active.d >= 50; break;
        case 'EXTRA_E': want = true; break;
        case 'BOOST20': want = koReachable(G, S, O, 20); break;
        case 'BOOST40': want = S.active.e.length > bestAtkCost(S) && koReachable(G, S, O, 40); break;
        case 'SHIELD20': want = !!O.active && S.active.d > 0 && w.retreat > 0.4; break;
        case 'GUST': want = countCr(O) > 1 && (w.bench > 1.1 || gustGain(G, S, O)); break;
        case 'SEARCH': want = !hasBasic(S.hand) && open >= 0; break;
        case 'RECYCLE': want = S.deck.length < 5 && S.disc.length >= 2; break;
        case 'SWAPSELF': want = S.active.d > maxHp(S.active) * 0.7 && firstBench(S) >= 0; break;
        case 'REBIND': want = S.active.e.length < bestAtkCost(S); break;
        case 'QUICKEVO': want = false; break;
      }
      if (want && takes(S, 0.75) && playHandler(G, S, i)) return true;
    }

    // 6. energy placement
    if (S.energyLeft > 0) {
      var target = energyTarget(G, S, O, w);
      var tcr = evoTarget(S, target);
      attachEnergy(G, S, target, C[(tcr || S.active).c].e);
      return true;
    }

    // 7. retreat a doomed active into a real threat
    if (S.active.d > maxHp(S.active) * 0.72 && Math.random() < w.retreat) {
      var bb = bestBenchIdx(S);
      if (bb >= 0 && canRetreat(G, S, bb) && takes(S, 0.7)) { retreat(G, S, bb, false); return true; }
    }

    // 8. attack
    var pick = bestAttack(G, S, O, false);
    if (pick.idx >= 0) {
      var atks = C[S.active.c].a;
      // bomb archetypes may hold one turn for a much bigger swing
      if (w.big > 1.6 && pick.idx === 0 && atks.length > 1 && S.active.e.length === atks[1].c - 1 &&
        !pick.ko && Math.random() < 0.45 * S.skill + 0.15) {
        endTurn(G); return false;
      }
      attack(G, S, pick.idx);
      return false;
    }
    endTurn(G);
    return false;
  }

  function bestAttack(G, S, O, lethalOnly) {
    var atks = S.active ? C[S.active.c].a : [];
    var best = { idx: -1, dmg: 0, ko: false, score: -1 };
    for (var i = 0; i < atks.length; i++) {
      if (!canAttack(G, S, i)) continue;
      var dm = damageOf(G, S, O, atks[i]);
      var ko = !!(O.active && dm >= curHp(O.active));
      if (lethalOnly && !ko) continue;
      var sc = dm + (ko ? 500 : 0);
      if (atks[i].x && atks[i].x.indexOf('recoil') === 0 && !ko) sc -= parseInt(atks[i].x.split(':')[1], 10) || 0;
      if (atks[i].x && atks[i].x.indexOf('bench') === 0) sc += 20;
      if (atks[i].x === 'gust' || (atks[i].x && atks[i].x.indexOf('stall') === 0)) sc += 25;
      // weaker skill picks noisily
      sc *= 1 + (1 - S.skill) * (Math.random() * 0.5 - 0.25);
      if (sc > best.score) best = { idx: i, dmg: dm, ko: ko, score: sc };
    }
    return best;
  }

  function energyTarget(G, S, O, w) {
    // -1 is the active slot. High skill charges whatever gets to lethal soonest.
    var slots = [-1], i;
    for (i = 0; i < BENCH; i++) if (S.bench[i]) slots.push(i);
    if (S.skill < 0.35) return -1;
    var best = -1, bestVal = -1e9;
    for (i = 0; i < slots.length; i++) {
      var cr = evoTarget(S, slots[i]);
      if (!cr || cr.e.length >= ENERGY_CAP) continue;
      var atks = C[cr.c].a;
      var need = atks.length ? atks[atks.length - 1].c : 1;
      var gap = Math.max(0, need - cr.e.length);
      var val = valueOf(cr) - gap * 4 - cr.d / 20;
      if (slots[i] === -1) val += 6;                       // the active swings now
      if (w.big > 1.3 && slots[i] !== -1) val += 3;        // bomb decks charge the back
      if (S.active && S.active.d > maxHp(S.active) * 0.75 && slots[i] !== -1) val += 5;
      if (val > bestVal) { bestVal = val; best = slots[i]; }
    }
    return best;
  }

  function gustGain(G, S, O) {
    // pulling out a fat charged bench beast is only good if it is softer than the active
    if (!O.active) return false;
    for (var i = 0; i < BENCH; i++) {
      if (O.bench[i] && curHp(O.bench[i]) < curHp(O.active) * 0.6) return true;
    }
    return false;
  }

  function bestAtkCost(S) {
    if (!S.active) return 1;
    var a = C[S.active.c].a;
    return a.length ? a[a.length - 1].c : 1;
  }
  function valueOf(cr) { return C[cr.c].hp / 10 + C[cr.c].s * 3; }
  function bestBenchIdx(S) {
    var b = -1, v = -1e9;
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
      var base = damageOf(G, S, O, a[i]);
      if (base + bonus >= curHp(O.active) && base < curHp(O.active)) return true;
    }
    return false;
  }

  // -------------------------------------------------------- legal-move query
  // The view uses this for highlighting and for the drag snap targets.
  function legalTargets(G, handIdx) {
    var S = G.p, out = { active: false, bench: [], evolve: [], handler: false, reason: '' };
    if (G.over || G.who !== 'p' || G.await) return out;
    var id = S.hand[handIdx];
    var c = card(id);
    if (!c) return out;
    if (c.t === 'h') {
      out.handler = canPlayHandler(G, S, handIdx);
      if (!out.handler) out.reason = 'No legal target';
      return out;
    }
    if (c.s === 1) {
      if (!S.active) out.active = true;
      for (var i = 0; i < BENCH; i++) if (!S.bench[i]) out.bench.push(i);
      if (!out.active && !out.bench.length) out.reason = 'No open slot';
      return out;
    }
    for (var k = -1; k < BENCH; k++) {
      if (canEvolve(G, S, id, evoTarget(S, k))) out.evolve.push(k);
    }
    if (!out.evolve.length) out.reason = 'Nothing to evolve';
    return out;
  }

  root.BB_ENGINE = {
    BENCH: BENCH, PRIZES: PRIZES, ENERGY_CAP: ENERGY_CAP, HAND_CAP: HAND_CAP,
    create: create, beginBattle: beginBattle,
    placeActive: placeActive, placeBench: placeBench, evolve: evolve, canEvolve: canEvolve,
    canPlaceBasic: canPlaceBasic, attachEnergy: attachEnergy, retreat: retreat, canRetreat: canRetreat,
    playHandler: playHandler, canPlayHandler: canPlayHandler, handlerNeedsTarget: handlerNeedsTarget,
    attack: attack, canAttack: canAttack, damageOf: damageOf, energyPay: energyPay, isWeak: isWeak,
    endTurn: endTurn, aiStep: aiStep, promote: promote, evoTarget: evoTarget,
    curHp: curHp, maxHp: maxHp, countCr: countCr, allCr: allCr, shuffle: shuffle,
    retreatCost: retreatCost, log: log, legalTargets: legalTargets,
    pushUndo: pushUndo, undo: undo, canUndo: canUndo, clearUndo: clearUndo, firstBench: firstBench
  };
})(window);
