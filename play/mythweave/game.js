/* Mythweave - screens, flow, render */
(function () {
  var W = M.W, H = M.H;
  var S = null;          /* save state */
  var B = null;          /* battle */
  var screen = 'map';
  var story = null;      /* {pages, i, then} */
  var result = null;     /* {kind, lines, then} */
  var pending = { ch: 0, bi: 0 };
  var partySel = [], partyFrom = 'map';
  var inspect = 'vulmar';
  var t = 0, ddt = 0, banner = null, hint = '';

  /* ---------------- save / flow ---------------- */
  function fresh() {
    return { ch: 0, cleared: {}, lv: {}, best: 0, roster: ['vulmar'], party: ['vulmar'], turns: 0 };
  }
  function persist() { M.save(S); }
  function key(c, b) { return c + '-' + b; }
  function cleared(c, b) { return !!S.cleared[key(c, b)]; }
  function unlocked(c, b) {
    if (c > S.ch) return false;
    if (b === 0) return true;
    if (b === 1) return cleared(c, 0);
    if (b === 2) return cleared(c, 0);
    return cleared(c, 0) && cleared(c, 2);
  }

  function resetAll() {
    M.clearTimers(); M.releaseAll(); M.clearFx();
    banner = null; story = null; result = null; B = null;
  }

  function goStory(pages, then) {
    resetAll();
    story = { pages: pages, i: 0, then: then };
    screen = 'story';
  }

  function startBattle(c, b) {
    resetAll();
    pending = { ch: c, bi: b };
    var party = S.party.filter(function (p) { return S.roster.indexOf(p) >= 0; }).slice(0, 3);
    if (!party.length) party = S.roster.slice(0, 3);
    S.party = party; persist();
    B = M.makeBattle(c, b, party, S.lv);
    screen = 'battle';
    hint = 'Tap 3 cards, then RESOLVE. 3 of one spirit = ULTIMATE.';
  }

  function battleIntro(c, b) {
    var d = M.CHAPTERS[c].battles[b];
    var pages = [];
    if (b === 0 && !cleared(c, 0)) pages.push({ t: M.CHAPTERS[c].name, x: M.CHAPTERS[c].story });
    pages.push({ t: d.n, x: d.story });
    goStory(pages, function () { startBattle(c, b); });
  }

  function afterWin() {
    var c = pending.ch, b = pending.bi, d = M.CHAPTERS[c].battles[b];
    var first = !cleared(c, b);
    S.cleared[key(c, b)] = true;
    S.turns += B.turn;
    var pages = [];
    if (d.bond && first) {
      var ups = d.bond === 'any' ? S.party.slice() : [d.bond];
      var names = [];
      for (var i = 0; i < ups.length; i++) {
        var id = ups[i], lv = (S.lv[id] || 1);
        if (lv < 3) { S.lv[id] = lv + 1; names.push(M.SPIRITS[id].name + ' -> Lv' + (lv + 1)); }
        else names.push(M.SPIRITS[id].name + ' is already at peak.');
      }
      pages.push({ t: 'BOND DEEPENED', x: names.join('. ') + '. Their command cards hit harder for the rest of the run.' });
    }
    if (d.reward && first && S.roster.indexOf(d.reward) < 0) {
      S.roster.push(d.reward);
      if (S.party.length < 3) S.party.push(d.reward);
      pages.push({ t: M.SPIRITS[d.reward].name.toUpperCase(), x: d.rstory + ' ' + M.SPIRITS[d.reward].lore });
      M.sfx('join');
    }
    if (d.finale) {
      if (!S.best || S.turns < S.best) S.best = S.turns;
      persist();
      pages.push({ t: 'THE WEAVE HOLDS', x: 'The cut closes. Eight myth-spirits settle into the loom-halls and the thread runs whole again. Run finished in ' + S.turns + ' turns.' });
      goStory(pages, function () { screen = 'end'; });
      return;
    }
    if (b === 3 && S.ch === c && c < 2) { S.ch = c + 1; }
    persist();
    if (pages.length) goStory(pages, function () { screen = 'map'; });
    else { resetAll(); screen = 'map'; }
  }

  /* ---------------- battle turn flow ---------------- */
  function seq(steps, done) {
    var i = 0;
    function nx() {
      if (!B) return;
      if (B.phase === 'won' || B.phase === 'lost') { endBattle(); return; }
      if (i >= steps.length) { done(); return; }
      var s = steps[i++];
      s.fn();
      if (M.checkEnd(B)) { M.after(0.7, endBattle); return; }
      M.after(s.d, nx);
    }
    nx();
  }

  function endBattle() {
    M.clearTimers();
    if (B.phase === 'won') {
      M.sfx('win');
      result = { kind: 'won', ttl: 'BATTLE WON', lines: ['Turns used: ' + B.turn, 'HP left: ' + B.hp + '/' + B.maxhp], btn: 'CONTINUE' };
    } else {
      M.sfx('lose');
      result = { kind: 'lost', ttl: 'THE WEAVE SNAPS', lines: ['You fell on turn ' + B.turn + '.', 'Retry free - no cost, ever.'], btn: 'RETRY BATTLE' };
    }
    screen = 'result';
  }

  function doResolve() {
    if (!B || B.phase !== 'pick' || B.sel.length !== 3) return;
    B.phase = 'resolve';
    var picks = B.sel.map(function (i) { return B.hand[i]; });
    var same = picks[0].s === picks[1].s && picks[1].s === picks[2].s;
    var steps = [];
    if (same) {
      var sp = M.SPIRITS[picks[0].s];
      var ult = M.scaleCard(sp.ult, picks[0].s === 'weaver' ? 1 : (S.lv[picks[0].s] || 1));
      banner = { s: 'ULTIMATE  ' + sp.ult.n.toUpperCase(), c: sp.col, l: 1.6 };
      M.sfx('ult'); M.kick(12, sp.col);
      M.burst(195, 200, 40, sp.col, 260, 0.9);
      M.logAdd(B, sp.name.split(',')[0] + ' unleashes ' + sp.ult.n + '!');
      steps.push({ d: 0.7, fn: function () { M.applyCard(B, ult, true); } });
    } else {
      picks.forEach(function (p) {
        steps.push({
          d: 0.42, fn: function () {
            M.applyCard(B, p, false);
            M.logAdd(B, p.n);
            M.burst(195, 430, 8, M.SPIRITS[p.s].col, 120, 0.4);
          }
        });
      });
    }
    /* discard played */
    var played = picks.slice();
    steps.push({
      d: 0.45, fn: function () {
        for (var i = 0; i < played.length; i++) {
          var ix = B.hand.indexOf(played[i]);
          if (ix >= 0) { B.pile.push(B.hand[ix]); B.hand.splice(ix, 1); }
        }
        B.sel.length = 0;
        B.phase = 'foe';
      }
    });
    var al = M.aliveFoes(B);
    al.forEach(function (f) {
      steps.push({ d: 0.6, fn: function () { if (!f.dead) M.foeAct(B, f); } });
    });
    steps.push({ d: 0.5, fn: function () { M.endRound(B); } });
    seq(steps, function () {
      if (!B) return;
      if (M.checkEnd(B)) { endBattle(); return; }
      M.startTurn(B);
    });
  }

  function toggleCard(i) {
    if (!B || B.phase !== 'pick') return;
    if (!B.hand[i]) return;
    var p = B.sel.indexOf(i);
    if (p >= 0) { B.sel.splice(p, 1); M.sfx('unpick'); }
    else if (B.sel.length < 3) { B.sel.push(i); M.sfx('pick'); }
    inspect = B.hand[i].s;
  }

  /* ---------------- input handling ---------------- */
  function handle(id) {
    if (screen === 'story') { story.i++; if (story.i >= story.pages.length) { var f = story.then; story = null; f(); } return; }
    if (screen === 'result') {
      if (id === 'ok') {
        if (result.kind === 'won') { result = null; afterWin(); }
        else { result = null; startBattle(pending.ch, pending.bi); }
      } else if (id === 'party') { result = null; partyFrom = 'result'; partySel = S.party.slice(); screen = 'party'; }
      return;
    }
    if (screen === 'end') {
      if (id === 'again') { var best = S.best; M.wipe(); S = fresh(); S.best = best; persist(); battleIntro(0, 0); }
      return;
    }
    if (screen === 'map') {
      if (id && id.indexOf('node') === 0) {
        var b = +id.slice(4);
        if (unlocked(S.ch, b)) battleIntro(S.ch, b);
      } else if (id === 'party') { partyFrom = 'map'; partySel = S.party.slice(); screen = 'party'; }
      else if (id === 'reset') { var bb = S.best; M.wipe(); S = fresh(); S.best = bb; persist(); battleIntro(0, 0); }
      return;
    }
    if (screen === 'party') {
      if (id && id.indexOf('sp') === 0) {
        var sid = id.slice(2);
        inspect = sid;
        var ix = partySel.indexOf(sid);
        if (ix >= 0) partySel.splice(ix, 1);
        else if (partySel.length < 3) partySel.push(sid);
        M.sfx('pick');
      } else if (id === 'done') {
        if (!partySel.length) return;
        S.party = partySel.slice(0, 3); persist();
        if (partyFrom === 'result') startBattle(pending.ch, pending.bi);
        else screen = 'map';
      }
      return;
    }
    if (screen === 'battle') {
      if (id && id.indexOf('card') === 0) toggleCard(+id.slice(4));
      else if (id === 'resolve') doResolve();
      else if (id && id.indexOf('foe') === 0) {
        var fi = +id.slice(3);
        if (B.foes[fi] && !B.foes[fi].dead) { B.target = fi; M.sfx('pick'); }
      }
    }
  }

  function handleKey(k) {
    if (screen === 'story' || screen === 'result' || screen === 'end') {
      if (k === 'Enter' || k === ' ' || k === 'r' || k === 'R') handle(screen === 'end' ? 'again' : 'ok');
      return;
    }
    if (screen === 'battle') {
      if (k >= '1' && k <= '5') toggleCard(+k - 1);
      else if (k === 'Enter' || k === ' ') doResolve();
      else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        var al = [];
        for (var i = 0; i < B.foes.length; i++) if (!B.foes[i].dead) al.push(i);
        if (al.length) {
          var p = al.indexOf(B.target);
          p = (p + (k === 'ArrowRight' ? 1 : al.length - 1) + al.length) % al.length;
          B.target = al[p]; M.sfx('pick');
        }
      }
      return;
    }
    if (screen === 'map' && k >= '1' && k <= '4') handle('node' + (+k - 1));
    if (screen === 'party' && (k === 'Enter' || k === ' ')) handle('done');
  }

  /* ---------------- art ---------------- */
  function glyph(c, x, y, s, g, col) {
    c.save(); c.translate(x, y);
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(2, s * 0.09);
    c.lineCap = 'round'; c.lineJoin = 'round';
    var u = s / 2, i;
    switch (g % 10) {
      case 0: /* weaver: spool + threads */
        c.fillRect(-u * 0.5, -u * 0.7, u, u * 1.4);
        c.beginPath(); c.moveTo(-u, -u); c.lineTo(u, u); c.moveTo(u, -u); c.lineTo(-u, u); c.stroke();
        break;
      case 1: /* titan: anvil block */
        c.fillRect(-u, -u * 0.2, u * 2, u * 0.9);
        c.fillRect(-u * 0.45, -u, u * 0.9, u * 0.85);
        c.fillRect(-u * 0.6, u * 0.7, u * 1.2, u * 0.35);
        break;
      case 2: /* serpent: wave */
        c.beginPath(); c.moveTo(-u, u * 0.6);
        c.quadraticCurveTo(-u * 0.3, -u * 1.1, 0, 0);
        c.quadraticCurveTo(u * 0.3, u * 1.1, u, -u * 0.6);
        c.stroke();
        c.beginPath(); c.arc(u * 0.85, -u * 0.6, u * 0.3, 0, 7); c.fill();
        break;
      case 3: /* raven: wings */
        c.beginPath(); c.moveTo(0, -u * 0.3); c.lineTo(-u, u * 0.3); c.lineTo(-u * 0.3, u * 0.35);
        c.lineTo(0, u * 0.9); c.lineTo(u * 0.3, u * 0.35); c.lineTo(u, u * 0.3); c.closePath(); c.fill();
        c.beginPath(); c.arc(0, -u * 0.65, u * 0.3, 0, 7); c.fill();
        break;
      case 4: /* hound: blocky quadruped */
        c.fillRect(-u * 0.9, -u * 0.3, u * 1.6, u * 0.8);
        c.fillRect(u * 0.35, -u * 0.8, u * 0.6, u * 0.6);
        c.fillRect(-u * 0.8, u * 0.5, u * 0.3, u * 0.5);
        c.fillRect(u * 0.3, u * 0.5, u * 0.3, u * 0.5);
        break;
      case 5: /* stag: antlers */
        c.beginPath(); c.arc(0, u * 0.4, u * 0.42, 0, 7); c.fill();
        c.beginPath();
        c.moveTo(-u * 0.3, 0); c.lineTo(-u * 0.7, -u * 0.9); c.moveTo(-u * 0.55, -u * 0.5); c.lineTo(-u, -u * 0.55);
        c.moveTo(u * 0.3, 0); c.lineTo(u * 0.7, -u * 0.9); c.moveTo(u * 0.55, -u * 0.5); c.lineTo(u, -u * 0.55);
        c.stroke();
        break;
      case 6: /* wyrm: coils */
        for (i = 0; i < 3; i++) {
          c.beginPath(); c.arc(-u * 0.5 + i * u * 0.5, (i % 2 ? -1 : 1) * u * 0.25, u * 0.42 - i * u * 0.07, 0, 7); c.stroke();
        }
        break;
      case 7: /* moth */
        c.beginPath(); c.ellipse(-u * 0.5, 0, u * 0.5, u * 0.85, -0.3, 0, 7); c.fill();
        c.beginPath(); c.ellipse(u * 0.5, 0, u * 0.5, u * 0.85, 0.3, 0, 7); c.fill();
        c.fillRect(-u * 0.12, -u * 0.8, u * 0.24, u * 1.6);
        break;
      case 8: /* bones */
        for (i = 0; i < 4; i++) c.fillRect(-u * (0.9 - i * 0.12), -u * 0.9 + i * u * 0.5, u * 2 * (0.9 - i * 0.12) / 1, u * 0.22);
        break;
      case 9: /* rift */
        c.beginPath();
        for (i = 0; i < 10; i++) {
          var a = i / 10 * Math.PI * 2, r = i % 2 ? u * 0.4 : u;
          c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill();
        break;
    }
    c.restore();
  }

  function bg(c) {
    c.fillStyle = '#0a0710'; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.5;
    for (var i = 0; i < 22; i++) {
      var y = ((i * 53 + t * 9) % (H + 40)) - 20;
      c.fillStyle = i % 3 ? '#1a1226' : '#241a35';
      c.fillRect((i * 71) % W, y, 2, 26);
    }
    c.globalAlpha = 1;
  }

  function button(c, x, y, w, h, id, label, col, on) {
    var down = M.isDown(id);
    M.hit(x, y, w, h, id);
    M.panel(c, x, y + (down ? 2 : 0), w, h - (down ? 2 : 0), on === false ? '#1b1526' : '#33224f', col || '#a97bff', 12);
    M.txt(c, label, x + w / 2, y + h / 2 + (down ? 1 : 0), 17, on === false ? '#6b5f80' : '#f0e6ff', 'center');
  }

  /* ---------------- screens ---------------- */
  function drawStory(c) {
    bg(c);
    var p = story.pages[story.i];
    M.hit(0, 0, W, H, 'story');
    M.panel(c, 20, 150, 350, 380, '#150e22', '#5a3f8c', 16);
    glyph(c, 195, 235, 74, (story.i * 3 + 9) % 10, '#7a5aa8');
    M.txt(c, p.t, 195, 320, 20, '#e9d9ff', 'center');
    M.wrap(c, p.x, 195, 372, 300, 15, '#b9a8d4', 23, 'center');
    M.txt(c, 'TAP TO CONTINUE', 195, 570, 13, '#7a6a92', 'center');
    M.txt(c, (story.i + 1) + ' / ' + story.pages.length, 195, 596, 12, '#4d4160', 'center');
  }

  function drawMap(c) {
    bg(c);
    var ch = M.CHAPTERS[S.ch];
    M.txt(c, 'MYTHWEAVE', 195, 30, 15, '#6d5f88', 'center');
    M.txt(c, ch.name, 195, 58, 21, '#c9a9ff', 'center');
    for (var i = 0; i < 4; i++) {
      var d = ch.battles[i], y = 88 + i * 84, ok = unlocked(S.ch, i), done = cleared(S.ch, i);
      var id = 'node' + i;
      if (ok) M.hit(20, y, 350, 74, id);
      var pressed = M.isDown(id);
      M.panel(c, 20, y + (pressed ? 2 : 0), 350, 74, done ? '#17251c' : (ok ? '#1d1430' : '#120e1a'),
        done ? '#4f8a5c' : (ok ? '#a97bff' : '#2a2238'), 12);
      glyph(c, 56, y + 37, 40, M.FOES[d.foes[0]].g, ok ? M.FOES[d.foes[0]].col : '#2e2740');
      M.txt(c, d.n, 92, y + 24, 16, ok ? '#f0e6ff' : '#4a4060');
      var sub = d.bond ? 'BOND FIGHT - optional upgrade' : (d.boss ? 'BOSS' : 'Story battle');
      M.txt(c, done ? 'CLEARED - ' + sub : (ok ? sub : 'Locked'), 92, y + 46, 12, done ? '#6fbf7f' : (ok ? '#9d8fb8' : '#3d3550'), 'left', false);
      var fl = d.foes.length;
      M.txt(c, fl + ' foe' + (fl > 1 ? 's' : ''), 356, y + 24, 11, '#6d5f88', 'right', false);
    }
    /* party strip */
    M.txt(c, 'PARTY', 24, 440, 12, '#6d5f88');
    for (var p = 0; p < 3; p++) {
      var sid = S.party[p], x = 20 + p * 118;
      M.panel(c, x, 452, 110, 74, '#150e22', sid ? M.SPIRITS[sid].col : '#2a2238', 10);
      if (sid) {
        glyph(c, x + 28, 489, 36, M.SPIRITS[sid].g, M.SPIRITS[sid].col);
        M.txt(c, M.SPIRITS[sid].short, x + 52, 478, 14, '#f0e6ff');
        M.txt(c, 'Lv' + (S.lv[sid] || 1), x + 52, 498, 12, '#9d8fb8', 'left', false);
      } else M.txt(c, 'empty', x + 55, 489, 12, '#3d3550', 'center', false);
    }
    button(c, 20, 538, 350, 56, 'party', 'CHANGE PARTY  (' + S.roster.length + ' bound)');
    M.txt(c, 'Chapter ' + (S.ch + 1) + '/3   Turns this run: ' + S.turns + (S.best ? '   Best run: ' + S.best : ''), 195, 616, 12, '#6d5f88', 'center', false);
    button(c, 115, 634, 160, 48, 'reset', 'NEW RUN', '#5a4470');
    M.txt(c, 'Everything here is earned by playing. No shops, no gates.', 195, 692, 11, '#4d4160', 'center', false);
  }

  function drawParty(c) {
    bg(c);
    M.txt(c, 'BIND UP TO 3 SPIRITS', 195, 30, 19, '#c9a9ff', 'center');
    M.txt(c, 'Fewer spirits = a purer hand = more ultimates.', 195, 52, 12, '#9d8fb8', 'center', false);
    for (var i = 0; i < M.ORDER.length; i++) {
      var sid = M.ORDER[i], have = S.roster.indexOf(sid) >= 0, sp = M.SPIRITS[sid];
      var x = 20 + (i % 2) * 178, y = 72 + Math.floor(i / 2) * 80;
      var on = partySel.indexOf(sid) >= 0;
      if (have) M.hit(x, y, 172, 72, 'sp' + sid);
      M.panel(c, x, y, 172, 72, on ? '#2a1c42' : '#150e22', have ? (on ? sp.col : '#3a2f52') : '#221c2e', 10);
      glyph(c, x + 28, y + 36, 34, sp.g, have ? sp.col : '#2e2740');
      M.txt(c, have ? sp.short : '???', x + 52, y + 22, 14, have ? '#f0e6ff' : '#3d3550');
      M.txt(c, have ? sp.name.split(',')[1] || 'Weaver' : 'not yet bound', x + 52, y + 40, 10.5, '#9d8fb8', 'left', false);
      if (have) {
        for (var l = 0; l < 3; l++) {
          c.fillStyle = l < (S.lv[sid] || 1) ? sp.col : '#332a48';
          c.fillRect(x + 52 + l * 12, y + 52, 9, 9);
        }
        if (on) { M.txt(c, String(partySel.indexOf(sid) + 1), x + 158, y + 20, 15, sp.col, 'center'); }
      }
    }
    /* inspect */
    var isp = M.SPIRITS[inspect] || M.SPIRITS.vulmar;
    M.panel(c, 20, 400, 350, 172, '#120c1c', isp.col, 12);
    M.txt(c, isp.name, 34, 420, 14, isp.col);
    var lv = inspect === 'weaver' ? 1 : (S.lv[inspect] || 1);
    for (var k = 0; k < 3; k++) {
      var cd = M.scaleCard(isp.cards[k], lv);
      M.txt(c, cd.n, 34, 446 + k * 24, 13, '#e9d9ff');
      M.txt(c, cd.tag, 356, 446 + k * 24, 12, '#9d8fb8', 'right', false);
    }
    M.txt(c, 'ULT  ' + isp.ult.n, 34, 526, 13, '#ffd36b');
    M.txt(c, M.scaleCard(isp.ult, lv).tag, 356, 526, 12, '#c9a9ff', 'right', false);
    M.txt(c, 'Bond fights raise card quality, up to Lv3.', 34, 552, 11, '#6d5f88', 'left', false);
    button(c, 20, 588, 350, 56, 'done', partySel.length ? 'CONFIRM PARTY (' + partySel.length + '/3)' : 'PICK AT LEAST ONE', null, !!partySel.length);
    M.txt(c, 'Tap a spirit to bind or release. Tap again to inspect.', 195, 664, 11, '#4d4160', 'center', false);
  }

  function drawCard(c, cd, x, y, w, h, sel, ord, num, dim) {
    var sp = M.SPIRITS[cd.s];
    c.save();
    if (sel) { c.shadowColor = sp.col; c.shadowBlur = 12; }
    M.panel(c, x, y, w, h, dim ? '#0f0b16' : sp.dark, sel ? '#fff' : sp.col, 9);
    c.restore();
    /* header */
    M.rr(c, x + 3, y + 3, w - 6, 15, 5); c.fillStyle = sp.col; c.fill();
    M.txt(c, sp.short, x + w / 2, y + 11, 10, '#150e22', 'center');
    glyph(c, x + w / 2, y + 38, 26, sp.g, sp.col);
    c.font = 'bold 10px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    var ln = M.wrap(c, cd.n, x + w / 2, y + 62, w - 8, 10, '#ffffff', 12, 'center');
    M.wrap(c, cd.tag, x + w / 2, y + 66 + ln * 12 + 6, w - 8, 9, '#cbb8e8', 11, 'center');
    M.txt(c, String(num), x + w / 2, y + h - 11, 11, '#8a7aa8', 'center');
    if (sel) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x + w - 11, y + 26, 10, 0, 7); c.fill();
      M.txt(c, String(ord), x + w - 11, y + 26, 12, '#150e22', 'center');
    }
  }

  function drawBattle(c) {
    bg(c);
    var i;
    c.save();
    if (M.shake > 0) c.translate((Math.random() - 0.5) * M.shake, (Math.random() - 0.5) * M.shake);

    /* header */
    M.txt(c, M.CHAPTERS[B.ch].name.split('. ')[1] + ' - ' + B.def.n, 16, 20, 13, '#9d8fb8');
    M.txt(c, 'TURN ' + B.turn, 374, 20, 13, '#6d5f88', 'right');

    /* foes */
    var al = B.foes.length;
    var fw = al === 1 ? 190 : (al === 2 ? 160 : 118);
    var gap = al === 1 ? 0 : (al === 2 ? 14 : 8);
    var tot = al * fw + (al - 1) * gap, sx = (W - tot) / 2;
    for (i = 0; i < al; i++) {
      var f = B.foes[i];
      f.x = sx + i * (fw + gap); f.y = 40; f.w = fw; f.h = 200;
      if (f.dead) {
        c.globalAlpha = 0.22;
        glyph(c, f.x + fw / 2, f.y + 96, 54, f.d.g, '#4a4060');
        c.globalAlpha = 1;
        continue;
      }
      var isT = i === B.target;
      M.hit(f.x, f.y, fw, 200, 'foe' + i);
      if (isT) { M.panel(c, f.x, f.y, fw, 200, 'rgba(255,255,255,0.035)', '#ffd36b', 12); }
      if (f.hitT > 0) { f.hitT -= ddt; c.globalAlpha = 0.5 + Math.random() * 0.5; }
      var bobY = f.y + 96 + Math.sin(t * 2 + i) * 4;
      glyph(c, f.x + fw / 2, bobY, al === 3 ? 52 : 64, f.d.g, f.d.col);
      c.globalAlpha = 1;
      /* intent */
      var it = M.intentOf(f);
      M.panel(c, f.x + fw / 2 - 40, f.y + 6, 80, 22, '#150e22', it.c, 8);
      M.txt(c, it.s, f.x + fw / 2, f.y + 17, 12, it.c, 'center');
      /* name + hp */
      M.txt(c, f.name, f.x + fw / 2, f.y + 148, al === 3 ? 10 : 12, '#e9d9ff', 'center');
      M.bar(c, f.x + 8, f.y + 160, fw - 16, 10, f.hp / f.maxhp, '#2a1c2c', '#e0556b');
      M.txt(c, f.hp + '/' + f.maxhp, f.x + fw / 2, f.y + 165, 9, '#ffdde3', 'center');
      var badge = [];
      if (f.block > 0) badge.push(['BLK ' + f.block, '#9fd4ff']);
      if (f.burn > 0) badge.push(['BURN ' + f.burn, '#ff9a45']);
      if (f.weak > 0) badge.push(['WEAK ' + f.weak, '#c9a9ff']);
      if (f.atk > 0) badge.push(['ATK+' + f.atk, '#ff6b6b']);
      for (var bq = 0; bq < badge.length && bq < 3; bq++) {
        M.txt(c, badge[bq][0], f.x + fw / 2, f.y + 180 + bq * 12, 9.5, badge[bq][1], 'center');
      }
      if (isT) M.txt(c, '▼', f.x + fw / 2, f.y + 38, 12, '#ffd36b', 'center');
    }

    /* player band */
    M.panel(c, 12, 252, 366, 74, '#130d1e', '#3a2f52', 12);
    glyph(c, 40, 289, 34, 0, '#c9a9ff');
    M.bar(c, 66, 268, 236, 14, B.hp / B.maxhp, '#2a1c2c', '#4fd18b');
    M.txt(c, B.hp + ' / ' + B.maxhp + ' HP', 68, 275, 11, '#0b2418');
    var bx = 66;
    function stat(label, col) { M.panel(c, bx, 292, 76, 24, '#1c1430', col, 7); M.txt(c, label, bx + 38, 304, 11, col, 'center'); bx += 82; }
    stat('BLOCK ' + B.block, B.block > 0 ? '#9fd4ff' : '#3a3350');
    stat('POWER ' + B.power, B.power > 0 ? '#ffb0e0' : '#3a3350');
    stat(B.frail > 0 ? 'FRAYED ' + B.frail : 'STEADY', B.frail > 0 ? '#ff8fd0' : '#3a3350');
    M.txt(c, 'deck ' + B.deck.length, 366, 268, 10, '#6d5f88', 'right', false);
    M.txt(c, 'used ' + B.pile.length, 366, 282, 10, '#6d5f88', 'right', false);

    /* log */
    for (i = 0; i < B.log.length; i++) {
      M.txt(c, B.log[i], 195, 340 + i * 15, 11.5, i === B.log.length - 1 ? '#cbb8e8' : '#5f5378', 'center', false);
    }

    /* ultimate preview */
    var picks = B.sel.map(function (k) { return B.hand[k]; });
    var same = picks.length === 3 && picks[0].s === picks[1].s && picks[1].s === picks[2].s;
    if (same) {
      var sp = M.SPIRITS[picks[0].s];
      M.panel(c, 40, 386, 310, 26, '#241636', sp.col, 8);
      M.txt(c, 'ULTIMATE READY: ' + sp.ult.n, 195, 399, 13, sp.col, 'center');
    } else if (B.sel.length === 3) {
      M.txt(c, 'Chain 3 cards from one spirit for their ultimate.', 195, 399, 11.5, '#6d5f88', 'center', false);
    } else {
      M.txt(c, hint, 195, 399, 11.5, '#6d5f88', 'center', false);
    }

    /* hand */
    var cw = 70, cg = 8, hx = (W - (5 * cw + 4 * cg)) / 2;
    for (i = 0; i < 5; i++) {
      var cd = B.hand[i];
      if (!cd) { M.panel(c, hx + i * (cw + cg), 424, cw, 148, '#0d0914', '#1e1830', 9); continue; }
      var s = B.sel.indexOf(i), lift = s >= 0 ? 10 : 0;
      var cx = hx + i * (cw + cg), cy = 424 - lift;
      if (B.phase === 'pick') M.hit(cx, 424 - 12, cw, 160, 'card' + i);
      drawCard(c, cd, cx, cy, cw, 148, s >= 0, s + 1, i + 1, B.phase !== 'pick');
    }

    /* resolve */
    var ready = B.sel.length === 3 && B.phase === 'pick';
    if (B.phase === 'pick') {
      button(c, 70, 582, 250, 56, 'resolve', ready ? (same ? 'UNLEASH ULTIMATE' : 'RESOLVE 3 CARDS') : 'PICK ' + (3 - B.sel.length) + ' MORE', same ? M.SPIRITS[picks[0].s].col : '#a97bff', ready);
    } else {
      M.panel(c, 70, 582, 250, 56, '#160f22', '#3a2f52', 12);
      M.txt(c, 'RESOLVING...', 195, 610, 16, '#7a6a92', 'center');
    }
    M.txt(c, 'Tap a foe to target it. Keys 1-5 pick, Enter resolves.', 195, 654, 11, '#4d4160', 'center', false);
    M.txt(c, 'Party: ' + B.party.map(function (p) { return M.SPIRITS[p].short + (S.lv[p] > 1 ? '★' + S.lv[p] : ''); }).join('  '), 195, 676, 11, '#5f5378', 'center', false);

    M.drawFx(c);
    c.restore();

    if (banner) {
      banner.l -= ddt;
      if (banner.l <= 0) banner = null;
      else {
        var a = Math.min(1, banner.l * 2);
        c.globalAlpha = a;
        M.panel(c, 10, 176, 370, 56, '#150e22', banner.c, 12);
        M.txt(c, banner.s, 195, 204, 18, banner.c, 'center');
        c.globalAlpha = 1;
      }
    }
    if (M.flash > 0) {
      c.globalAlpha = M.flash * 1.6; c.fillStyle = M.flashCol; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    }
  }

  function drawResult(c) {
    if (B) drawBattle(c);
    c.fillStyle = 'rgba(6,4,12,0.82)'; c.fillRect(0, 0, W, H);
    var col = result.kind === 'won' ? '#7fe6a0' : '#ff6b6b';
    M.panel(c, 30, 210, 330, 250, '#140d20', col, 16);
    M.txt(c, result.ttl, 195, 254, 24, col, 'center');
    for (var i = 0; i < result.lines.length; i++) M.txt(c, result.lines[i], 195, 300 + i * 24, 14, '#b9a8d4', 'center', false);
    button(c, 60, 358, 270, 56, 'ok', result.btn, col);
    if (result.kind === 'lost') button(c, 60, 424, 270, 48, 'party', 'CHANGE PARTY', '#a97bff');
    else M.txt(c, 'Progress saved.', 195, 440, 12, '#6d5f88', 'center', false);
  }

  function drawEnd(c) {
    bg(c);
    M.txt(c, 'MYTHWEAVE', 195, 120, 30, '#c9a9ff', 'center');
    M.txt(c, 'THE WEAVE HOLDS', 195, 158, 18, '#7fe6a0', 'center');
    M.panel(c, 30, 200, 330, 210, '#140d20', '#5a3f8c', 16);
    M.txt(c, 'Run finished in ' + S.turns + ' turns', 195, 240, 16, '#e9d9ff', 'center');
    M.txt(c, 'Best run: ' + (S.best || S.turns) + ' turns', 195, 270, 14, '#ffd36b', 'center');
    M.txt(c, 'Spirits bound: ' + S.roster.length + ' / 8', 195, 300, 14, '#b9a8d4', 'center');
    var lvs = M.ORDER.filter(function (s) { return (S.lv[s] || 1) > 1; }).length;
    M.txt(c, 'Bonds deepened: ' + lvs, 195, 326, 14, '#b9a8d4', 'center');
    M.wrap(c, 'Every spirit was story loot. Nothing was sold to you.', 195, 366, 290, 12, '#6d5f88', 16, 'center');
    for (var i = 0; i < 8; i++) {
      var sp = M.SPIRITS[M.ORDER[i]];
      glyph(c, 42 + (i % 4) * 102, 450 + Math.floor(i / 4) * 74, 40, sp.g, S.roster.indexOf(M.ORDER[i]) >= 0 ? sp.col : '#2e2740');
    }
    button(c, 70, 590, 250, 56, 'again', 'WEAVE AGAIN', '#a97bff');
    M.txt(c, 'A fresh run keeps your best time.', 195, 668, 11, '#4d4160', 'center', false);
  }

  /* ---------------- loop ---------------- */
  M.update = function (dt) {
    t += dt;
    if (!S) { M.takeClicks(); M.takeKeys(); return; }
    var cl = M.takeClicks();
    for (var i = 0; i < cl.length; i++) handle(cl[i]);
    var ks = M.takeKeys();
    for (var j = 0; j < ks.length; j++) handleKey(ks[j]);
  };

  M.draw = function (dt) {
    ddt = dt || 0;
    var c = M.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#07050c'; c.fillRect(0, 0, M.bw, M.bh);
    c.setTransform(M.s, 0, 0, M.s, M.ox, M.oy);
    M.beginFrame();
    if (!S) { bg(c); M.endFrame(); return; }
    if (screen === 'story' && story) drawStory(c);
    else if (screen === 'map') drawMap(c);
    else if (screen === 'party') drawParty(c);
    else if (screen === 'battle' && B) drawBattle(c);
    else if (screen === 'result' && result) drawResult(c);
    else if (screen === 'end') drawEnd(c);
    else drawMap(c);
    M.endFrame();
  };

  /* ---------------- boot ---------------- */
  function begin() {
    M.audioOn();
    document.getElementById('boot').classList.remove('on');
    M.started = true;
    M.resize();
    S = M.load();
    if (!S || !S.roster || !S.roster.length) {
      S = fresh(); persist();
      battleIntro(0, 0);
    } else {
      S.turns = 0;
      if (!S.party.length) S.party = S.roster.slice(0, 3);
      screen = 'map';
    }
  }

  window.addEventListener('load', function () {
    M.boot();
    var go = document.getElementById('boot');
    var fire = function (e) { e.preventDefault(); if (M.paused || M.hidden || M.landscape || document.hidden) return; go.removeEventListener('pointerdown', fire); begin(); };
    go.addEventListener('pointerdown', fire, { passive: false });
    window.addEventListener('keydown', function k(e) {
      if (M.started) return;
      if (M.paused || M.hidden || M.landscape || document.hidden) { e.preventDefault(); return; }
      window.removeEventListener('keydown', k); begin();
    });
  });
})();
