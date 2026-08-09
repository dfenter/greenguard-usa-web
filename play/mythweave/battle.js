/* Mythweave - battle model */
(function () {
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  M.makeBattle = function (chIdx, bIdx, party, lv) {
    var ch = M.CHAPTERS[chIdx], def = ch.battles[bIdx];
    var B = {
      ch: chIdx, bi: bIdx, def: def,
      party: party.slice(0, 3),
      maxhp: 62 + chIdx * 10, hp: 62 + chIdx * 10,
      block: 0, power: 0, frail: 0,
      deck: [], pile: [], hand: [], sel: [],
      foes: [], target: 0, turn: 1, phase: 'pick',
      log: [], resolved: 0, ultName: null
    };
    /* deck */
    var srcs = ['weaver'].concat(B.party);
    for (var i = 0; i < srcs.length; i++) {
      var sid = srcs[i], sp = M.SPIRITS[sid], l = (lv && lv[sid]) || 1;
      for (var c = 0; c < sp.cards.length; c++) {
        for (var k = 0; k < 2; k++) {
          var card = M.scaleCard(sp.cards[c], sid === 'weaver' ? 1 : l);
          card.s = sid; card.lv = sid === 'weaver' ? 1 : l;
          B.deck.push(card);
        }
      }
    }
    shuffle(B.deck);
    /* foes */
    for (var f = 0; f < def.foes.length && f < 3; f++) {
      var fd = M.FOES[def.foes[f]];
      B.foes.push({
        d: fd, name: fd.name, hp: fd.hp, maxhp: fd.hp, block: 0, weak: 0, burn: 0,
        atk: 0, mi: f % fd.moves.length, x: 0, y: 0, w: 0, h: 0, hitT: 0, dead: false
      });
    }
    B.log.push('The weave tightens.');
    M.drawHand(B);
    return B;
  };

  M.drawHand = function (B) {
    B.hand.length = 0; B.sel.length = 0;
    for (var i = 0; i < 5; i++) {
      if (!B.deck.length) { B.deck = shuffle(B.pile); B.pile = []; }
      if (!B.deck.length) break;
      B.hand.push(B.deck.pop());
    }
    if (B.pile.length > 90) B.pile.length = 90;
  };

  M.logAdd = function (B, s) {
    B.log.push(s);
    while (B.log.length > 3) B.log.shift();
  };

  M.aliveFoes = function (B) { return B.foes.filter(function (f) { return !f.dead; }); };

  M.fixTarget = function (B) {
    if (!B.foes[B.target] || B.foes[B.target].dead) {
      for (var i = 0; i < B.foes.length; i++) if (!B.foes[i].dead) { B.target = i; return; }
    }
  };

  function hurtFoe(B, f, amt, pierce) {
    if (f.dead || amt <= 0) return 0;
    var a = amt;
    if (!pierce && f.block > 0) {
      var ab = Math.min(f.block, a); f.block -= ab; a -= ab;
      if (ab > 0) M.float(f.x + f.w / 2 - 16, f.y + 22, '-' + ab + ' blk', '#9fd4ff');
    }
    if (a > 0) {
      f.hp -= a; f.hitT = 0.28;
      M.float(f.x + f.w / 2 + (Math.random() * 20 - 10), f.y + 40, '-' + a, '#ffd36b');
      M.burst(f.x + f.w / 2, f.y + f.h / 2, 8, f.d.col, 150, 0.45);
      M.kick(5);
      M.sfx('hit');
    }
    if (f.hp <= 0) {
      f.hp = 0; f.dead = true;
      M.burst(f.x + f.w / 2, f.y + f.h / 2, 26, '#fff', 220, 0.7);
      M.kick(9, '#ffffff');
      M.sfx('big');
      M.logAdd(B, f.name + ' unravels.');
    }
    return a;
  }
  M.hurtFoe = hurtFoe;

  function healP(B, v) {
    if (v <= 0) return;
    B.hp = Math.min(B.maxhp, B.hp + v);
    M.float(195, 336, '+' + v, '#7fe6a0'); M.sfx('heal');
    M.burst(195, 345, 10, '#7fe6a0', 90, 0.5);
  }

  /* apply one card. returns nothing; fx immediate */
  M.applyCard = function (B, c, isUlt) {
    var t = B.foes[B.target];
    if (!t || t.dead) { M.fixTarget(B); t = B.foes[B.target]; }
    var pw = B.power, i;
    var alive = M.aliveFoes(B);
    if (c.b) { B.block += c.b; M.sfx('block'); M.float(195, 320, '+' + c.b + ' blk', '#9fd4ff'); }
    if (c.p) { B.power += c.p; M.float(230, 320, '+' + c.p + ' pow', '#ffb0e0'); }
    if (c.h) healP(B, c.h);
    if (c.sd) { B.hp = Math.max(1, B.hp - c.sd); M.float(160, 336, '-' + c.sd, '#ff8080'); }
    if (c.d && t) {
      var hits = c.hits || 1;
      var base = c.d + pw + (c.chain ? c.chain * B.resolved : 0);
      for (i = 0; i < hits; i++) hurtFoe(B, t, base, c.ig);
    }
    if (c.dr && t) {
      var got = hurtFoe(B, t, c.dr + pw, false);
      healP(B, got);
    }
    if (c.ad) {
      for (i = 0; i < alive.length; i++) hurtFoe(B, alive[i], c.ad + pw, c.ig);
    }
    if (c.bu) {
      if (isUlt || c.wa) { for (i = 0; i < alive.length; i++) { alive[i].burn += c.bu; } }
      else if (t) t.burn += c.bu;
      M.sfx('block');
    }
    if (c.w && t) { t.weak += c.w; M.float(t.x + t.w / 2, t.y + 60, 'WEAK', '#c9a9ff'); }
    if (c.wa) { for (i = 0; i < alive.length; i++) alive[i].weak += 1; }
    B.resolved++;
  };

  M.checkEnd = function (B) {
    if (M.aliveFoes(B).length === 0) { B.phase = 'won'; return 'won'; }
    if (B.hp <= 0) { B.hp = 0; B.phase = 'lost'; return 'lost'; }
    return null;
  };

  /* enemy single action */
  M.foeAct = function (B, f) {
    if (f.dead) return;
    f.block = 0;
    var mv = f.d.moves[f.mi % f.d.moves.length];
    f.mi = (f.mi + 1) % f.d.moves.length;
    var mul = f.weak > 0 ? 0.6 : 1;
    if (mv.t === 'grd') {
      f.block += mv.v; M.float(f.x + f.w / 2, f.y + 30, '+' + mv.v + ' blk', '#9fd4ff'); M.sfx('block');
    } else if (mv.t === 'buf') {
      f.atk += mv.v; M.float(f.x + f.w / 2, f.y + 30, 'RAGE', '#ff6b6b'); M.sfx('block');
    } else if (mv.t === 'hex') {
      B.frail += mv.v; B.power = Math.max(0, B.power - 2);
      M.float(195, 320, 'FRAYED', '#ff8fd0'); M.sfx('hurt');
      M.logAdd(B, f.name + ' frays your thread.');
    } else {
      var n = mv.t === 'atk2' ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var dmg = Math.max(1, Math.round((mv.v + f.atk) * mul * (B.frail > 0 ? 1.3 : 1)));
        if (B.block > 0) {
          var ab = Math.min(B.block, dmg); B.block -= ab; dmg -= ab;
          M.float(170, 320, '-' + ab + ' blk', '#9fd4ff');
        }
        if (dmg > 0) {
          B.hp -= dmg;
          M.float(195, 336, '-' + dmg, '#ff6b6b');
          M.kick(8, '#ff3b3b'); M.sfx('hurt');
          M.burst(195, 345, 12, '#ff6b6b', 160, 0.5);
        } else { M.sfx('block'); }
      }
    }
  };

  M.endRound = function (B) {
    var al = M.aliveFoes(B);
    for (var i = 0; i < al.length; i++) {
      var f = al[i];
      if (f.burn > 0) {
        hurtFoe(B, f, f.burn, true);
        f.burn = Math.max(0, f.burn - 1);
      }
      if (f.weak > 0) f.weak--;
    }
    if (B.frail > 0) B.frail--;
  };

  M.startTurn = function (B) {
    B.block = 0;
    B.power = Math.max(0, B.power - 1);
    B.resolved = 0;
    B.turn++;
    for (var i = 0; i < B.hand.length; i++) B.pile.push(B.hand[i]);
    M.drawHand(B);
    M.fixTarget(B);
    B.phase = 'pick';
  };

  M.intentOf = function (f) {
    var mv = f.d.moves[f.mi % f.d.moves.length];
    var mul = f.weak > 0 ? 0.6 : 1;
    if (mv.t === 'grd') return { s: 'GUARD ' + mv.v, c: '#9fd4ff' };
    if (mv.t === 'buf') return { s: 'ENRAGE', c: '#ff9a45' };
    if (mv.t === 'hex') return { s: 'FRAY', c: '#ff8fd0' };
    var v = Math.max(1, Math.round((mv.v + f.atk) * mul));
    return { s: (mv.t === 'atk2' ? v + ' x2' : 'HIT ' + v), c: '#ff8080' };
  };
})();
