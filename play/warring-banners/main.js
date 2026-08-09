// Warring Banners - input, loop, UI wiring.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var cv = $('cv');
  var elSeason = $('season'), elTurnTx = $('turntx'), elTurnFill = $('turnfill'),
      elGold = $('gold'), elTerr = $('terr'), elHint = $('hint'), elSel = $('selinfo');
  var ovStart = $('ovStart'), ovAttack = $('ovAttack'), ovEnd = $('ovEnd'), ovRot = $('ovRot');

  // ---------- global input state (hardening #2 / #3) ----------
  var pointers = {};          // pointerId -> {x,y,sx,sy,moved}
  var pointerOrder = [];
  var keys = {};
  var TIMERS = [];
  var pinchDist = 0, pinchMid = null;
  var showCursor = false;
  var started = false, paused = false, rotBlocked = false, hiddenBlocked = document.hidden;
  var pendingAttack = null;
  var aiTimer = 0, aiQueue = [], aiBanner = null, aiBannerT = 0;
  var AI_STEP = 0.15;
  var lastTs = 0, running = false;

  function later(fn, ms) { var t = setTimeout(function () { drop(t); fn(); }, ms); TIMERS.push(t); return t; }
  function drop(t) { var i = TIMERS.indexOf(t); if (i >= 0) TIMERS.splice(i, 1); }
  function clearTimers() { for (var i = 0; i < TIMERS.length; i++) clearTimeout(TIMERS[i]); TIMERS.length = 0; }
  function clearInput() {
    pointers = {}; pointerOrder.length = 0;
    for (var k in keys) delete keys[k];
    pinchDist = 0; pinchMid = null;
    pendingAttack = null;
    ovAttack.classList.remove('on');
  }

  // ---------- fx bridge for AI ----------
  var FX = {
    march: function (a, q, r) { R.march(a, q, r); SFX.move(); },
    clash: function (q, r, pv) {
      R.kick(7, 'rgba(240,120,90,.5)');
      R.burst(q, r, '#f0d68a', 16, 90);
      R.burst(q, r, '#e0705a', 10, 70);
      SFX.clash();
    }
  };

  // ---------- boot ----------
  function boot() {
    R.init(cv);
    var legacy = G.loadLegacy();
    G.newSeason(legacy);
    R.fit();
    R.clearFx();
    clearInput();
    clearTimers();
    aiQueue.length = 0; aiTimer = 0; aiBanner = null; aiBannerT = 0; showCursor = false;
    refresh();
    hint('Tap a banner of yours, then tap a lit hex to march.');
  }

  function newSeasonFrom(legacy) {
    G.newSeason(legacy);
    R.fit(); R.clearFx(); clearInput(); clearTimers();
    aiQueue.length = 0; aiTimer = 0; aiBanner = null; aiBannerT = 0; showCursor = false;
    hideAll();
    refresh();
    hint('Season ' + G.state.season + ': hold more hexes than any rival by turn 12.');
  }

  function hideAll() {
    ovAttack.classList.remove('on');
    ovEnd.classList.remove('on');
  }

  // ---------- HUD ----------
  function hint(t) { elHint.textContent = t; }
  function refresh() {
    var S = G.state;
    if (!S) return;
    elSeason.textContent = 'Season ' + S.season;
    elTurnTx.textContent = 'Turn ' + Math.min(S.turn, G.TURNS) + '/' + G.TURNS;
    elTurnFill.style.width = Math.round(Math.min(1, (S.turn - 1) / G.TURNS) * 100) + '%';
    elGold.textContent = S.gold[0] + 'g';

    var html = '';
    for (var f = 0; f < 4; f++) {
      html += '<div class="tchip' + (S.alive[f] ? '' : ' dead') + '">' +
              '<span class="tdot" style="background:' + G.FACTIONS[f].col + '"></span>' +
              (f === 0 ? 'You' : G.FACTIONS[f].name) + ' ' +
              (S.alive[f] ? G.territory(f) : 0) + '</div>';
    }
    elTerr.innerHTML = html;

    var canAct = S.phase === 'player' && !S.over;
    ['cSpear', 'cCav', 'cBow'].forEach(function (id, i) {
      var type = ['spear', 'cav', 'bow'][i];
      $(id).disabled = !(canAct && G.canRecruit(0, type));
    });
    $('endturn').disabled = !canAct;

    var sel = S.sel != null ? G.armyById(S.sel) : null;
    if (sel) {
      var h = G.hexAt(sel.q, sel.r);
      elSel.textContent = G.UNITS[sel.type].name + ' · str ' + sel.str +
        ' · ' + G.TERR[h.terr].name +
        ' · ' + (sel.sup ? 'supplied' : 'CUT OFF (-30% · -2/turn)') +
        ' · ' + sel.mp + ' move';
    } else {
      var n = G.countArmies(0);
      elSel.textContent = n + '/' + G.ARMY_CAP + ' banners · +' + G.income(0) + 'g per turn' +
        (S.log ? ' · ' + S.log : '');
    }
  }

  // ---------- selection / actions ----------
  function selectArmy(a) {
    var S = G.state;
    S.sel = a.id;
    S.reach = G.computeReach(a);
    SFX.select();
    refresh();
    var n = 0, t = 0, k;
    for (k in S.reach.reach) n++;
    for (k in S.reach.targets) t++;
    hint(a.mp > 0
      ? (t ? 'Tap a red-ringed foe to see the full battle math.' : n ? 'Tap a lit hex to march there.' : 'No route left — pick another banner.')
      : 'This banner already acted this turn.');
  }
  function deselect() {
    var S = G.state;
    S.sel = null; S.reach = null; refresh();
  }

  function onHex(q, r) {
    var S = G.state;
    if (!S || S.over || S.phase !== 'player' || paused) return;
    var h = G.hexAt(q, r);
    if (!h) { deselect(); return; }
    S.cursor = { q: q, r: r };
    var occ = G.armyAt(q, r);
    var sel = S.sel != null ? G.armyById(S.sel) : null;

    if (sel && S.reach) {
      var k = HEX.key(q, r);
      if (S.reach.targets[k] && occ && occ.owner !== 0) {
        openAttack(sel, occ); return;
      }
      if (S.reach.reach[k] !== undefined) {
        R.march(sel, q, r); SFX.move();
        G.moveArmy(sel, q, r, S.reach.reach[k]);
        R.burst(q, r, '#dfe6f2', 8, 45);
        if (h.keep >= 0 && h.keep !== 0) {
          R.kick(14, 'rgba(255,220,140,.55)'); R.say(q, r, 'KEEP TAKEN', '#f0d68a');
        }
        if (checkOver()) return;
        if (sel.mp > 0) { S.reach = G.computeReach(sel); }
        else { S.sel = null; S.reach = null; }
        refresh();
        hint(autoHint());
        return;
      }
    }
    if (occ && occ.owner === 0) { selectArmy(occ); return; }
    if (occ) {
      hint(G.FACTIONS[occ.owner].name + ' ' + G.UNITS[occ.type].name + ' · str ' + occ.str +
           ' · ' + G.TERR[h.terr].name + ' (x' + G.TERR[h.terr].def.toFixed(2) + ' def)');
      SFX.tap(); deselect(); return;
    }
    hint(G.TERR[h.terr].name + ' · def x' + G.TERR[h.terr].def.toFixed(2) +
         ' · move cost ' + (h.terr === 'water' ? '—' : G.TERR[h.terr].cost) +
         (h.owner >= 0 ? ' · ' + (h.owner === 0 ? 'yours' : G.FACTIONS[h.owner].name) : ' · unclaimed'));
    SFX.tap();
    deselect();
  }

  // instant-defeat stakes deserve an explicit warning
  function keepWarning() {
    var S = G.state, kq = G.KEEPS[0][0], kr = G.KEEPS[0][1];
    var near = 0, garrison = 0;
    for (var i = 0; i < S.armies.length; i++) {
      var a = S.armies[i], d = HEX.dist(a.q, a.r, kq, kr);
      if (a.owner === 0) { if (d <= 1) garrison++; }
      else if (d <= 2) near++;
    }
    if (!near) return null;
    if (!garrison) return '! YOUR KEEP IS UNDEFENDED and ' + near + ' enemy banner(s) are within reach.';
    return '! ' + near + ' enemy banner(s) closing on your keep (walls give x1.90 defence).';
  }

  function autoHint() {
    var S = G.state, ready = 0;
    for (var i = 0; i < S.armies.length; i++) {
      if (S.armies[i].owner === 0 && S.armies[i].mp > 0) ready++;
    }
    if (ready) return ready + ' banner(s) still ready. Claim hexes to grow income.';
    return 'All banners moved — recruit or End Turn.';
  }

  // ---------- attack modal (all math shown) ----------
  function openAttack(a, d) {
    var pv = G.preview(a, d);
    pendingAttack = pv;
    $('atkTitle').textContent = G.UNITS[a.type].name + ' → ' + G.FACTIONS[d.owner].name + ' ' + G.UNITS[d.type].name;
    var mu = pv.m === 1.5 ? 'counters (x1.50)' : pv.m === 0.75 ? 'countered (x0.75)' : 'even (x1.00)';
    var rows = '';
    function row(l, v, cls) { rows += '<div class="r"><span>' + l + '</span><span class="' + (cls || '') + '">' + v + '</span></div>'; }
    row('Your strength', a.str);
    row('Matchup', mu);
    row('Your supply', pv.supA === 1 ? 'x1.00' : 'CUT OFF x0.70', pv.supA === 1 ? '' : 'lose');
    rows += '<hr>';
    row('Attack power', pv.A.toFixed(2), 'win');
    rows += '<hr>';
    row('Their strength', d.str);
    row(G.TERR[pv.hex.terr].name + ' cover', 'x' + pv.terr.toFixed(2));
    row('Keep walls', 'x' + pv.keepB.toFixed(2));
    row('Their supply', pv.supD === 1 ? 'x1.00' : 'CUT OFF x0.70');
    rows += '<hr>';
    row('Defence power', pv.D.toFixed(2), 'lose');
    rows += '<hr>';
    row('Outcome', pv.win ? 'YOU WIN' : 'YOU LOSE', pv.win ? 'win' : 'lose');
    row(pv.win ? 'Survivors' : 'They keep', pv.surv + ' str', pv.win ? 'win' : 'lose');
    $('mathbox').innerHTML = rows;
    $('btnAtk').textContent = pv.win ? 'Commit Attack' : 'Attack Anyway';
    ovAttack.classList.add('on');
  }
  function doAttack() {
    if (paused || document.hidden) return;
    var pv = pendingAttack;
    ovAttack.classList.remove('on');
    if (!pv) return;
    pendingAttack = null;
    var S = G.state;
    if (!G.armyById(pv.atk.id) || !G.armyById(pv.def.id)) { deselect(); refresh(); return; }
    var tq = pv.def.q, tr = pv.def.r;
    FX.clash(tq, tr, pv);
    G.resolve(pv);
    if (pv.win) {
      R.say(tq, tr, 'ROUTED', '#8fd6a0');
      if (pv.hex.keep >= 0 && pv.hex.keep !== 0) { R.kick(16, 'rgba(255,220,140,.6)'); R.say(tq, tr, 'KEEP TAKEN', '#f0d68a'); }
    } else {
      R.say(tq, tr, 'LOST', '#e88b8b');
      R.kick(10, 'rgba(220,90,80,.45)');
    }
    S.sel = null; S.reach = null;
    if (checkOver()) return;
    refresh(); hint(autoHint());
  }

  // ---------- turn flow ----------
  function endTurn() {
    var S = G.state;
    if (!S || S.over || S.phase !== 'player' || paused) return;
    deselect();
    S.phase = 'ai';
    aiQueue.length = 0;
    for (var f = 1; f < 4; f++) {
      if (!S.alive[f]) continue;
      aiQueue.push({ kind: 'begin', f: f });
      var plan = AI.plan(f);
      for (var i = 0; i < plan.length; i++) aiQueue.push(plan[i]);
    }
    if (aiQueue.length > 400) aiQueue.length = 400;
    aiQueue.push({ kind: 'endround' });
    aiTimer = 0;
    SFX.turn();
    refresh();
    hint('Rival warlords are marching…');
  }

  // returns true when the action deserves a visible beat, false when it is instant
  function aiStep() {
    var S = G.state;
    if (!aiQueue.length) { finishRound(); return true; }
    var act = aiQueue.shift();
    if (act.kind === 'begin') {
      if (!S.alive[act.f]) return false;
      G.recomputeSupply();
      G.startTurnFor(act.f);
      aiBanner = G.FACTIONS[act.f].name + ' moves';
      aiBannerT = 0.45;
      return true;
    }
    if (act.kind === 'recruit') {
      if (S.alive[act.f] && G.recruit(act.f, act.type)) {
        var kq = G.KEEPS[act.f][0], kr = G.KEEPS[act.f][1];
        R.burst(kq, kr, G.FACTIONS[act.f].col, 8, 40);
      }
      return false;
    }
    if (act.kind === 'act') {
      if (!S.alive[act.f]) return false;
      var moved = AI.actArmy(act.f, act.id, FX);
      var a = G.armyById(act.id);
      if (moved && a && a.mp > 0 && (act.tries || 0) < 1) {
        aiQueue.unshift({ kind: 'act', f: act.f, id: act.id, tries: (act.tries || 0) + 1 });
      }
      checkOver();
      refresh();
      return moved;
    }
    if (act.kind === 'done') { aiBanner = null; return false; }
    if (act.kind === 'endround') { finishRound(); return true; }
    return false;
  }

  function finishRound() {
    var S = G.state;
    aiQueue.length = 0; aiBanner = null;
    if (S.over) { showOver(); return; }
    S.turn++;
    if (S.turn > G.TURNS) { seasonEnd(); return; }
    G.beginPlayerTurn(false);
    if (S.log) { R.kick(5, 'rgba(220,90,80,.3)'); SFX.starve(); }
    refresh();
    var warn = keepWarning();
    if (warn) R.kick(6, 'rgba(220,120,80,.35)');
    hint(warn || (S.log ? S.log : 'Turn ' + S.turn + ' — ' + G.income(0) + 'g collected. Push out or dig in.'));
  }

  function checkOver() {
    var S = G.state;
    if (S.over) { showOver(); return true; }
    return false;
  }

  function showOver() {
    var S = G.state;
    var res = G.seasonResult();
    if (S.over === 'defeat') {
      var l = G.bankDefeat();
      $('endTitle').textContent = 'Ashvale Has Fallen';
      $('endTitle').className = 'lose';
      $('endSub').textContent = 'Your keep was taken on turn ' + S.turn + '. Rally what legacy remains and take the field again.';
      $('btnNext').textContent = 'Rally Again';
      SFX.lose();
    } else {
      var l2 = G.bankSeason(res);
      $('endTitle').textContent = 'The Valley Is Yours';
      $('endTitle').className = 'win';
      $('endSub').textContent = 'Every rival keep has fallen. Legacy carried: ' + l2.carry + 'g into Season ' + l2.season + '.';
      $('btnNext').textContent = 'Season ' + l2.season;
      SFX.win();
    }
    fillScores(res);
    S.phase = 'over';
    refresh();
    ovEnd.classList.add('on');
  }

  function seasonEnd() {
    var S = G.state;
    var res = G.seasonResult();
    var l = G.bankSeason(res);
    $('endTitle').textContent = res.won ? 'Season Won' : 'Season Lost';
    $('endTitle').className = res.won ? 'win' : 'lose';
    $('endSub').textContent = (res.won
        ? 'Ashvale holds the most ground.'
        : G.FACTIONS[res.bestF].name + ' holds the most ground.') +
      ' Best ever: ' + l.best + ' hexes. Legacy carried: ' + l.carry + 'g into Season ' + l.season + '.';
    $('btnNext').textContent = 'Season ' + l.season;
    fillScores(res);
    S.phase = 'over'; S.over = res.won ? 'won' : 'lost';
    if (res.won) { SFX.win(); R.kick(8, 'rgba(140,220,160,.4)'); } else SFX.lose();
    refresh();
    ovEnd.classList.add('on');
  }

  function fillScores(res) {
    var html = '';
    var sorted = res.sc.slice().sort(function (a, b) { return b.terr - a.terr; });
    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i];
      html += '<div class="r"><span class="nm"><span class="tdot" style="background:' + s.col +
              ';width:11px;height:11px;border-radius:50%;display:inline-block"></span>' +
              (s.f === 0 ? 'Ashvale (you)' : s.name) + (s.alive ? '' : ' †') +
              '</span><span>' + s.terr + '</span></div>';
    }
    $('scorelist').innerHTML = html;
  }

  // ---------- pointer input (own id per pointer, hardening #3) ----------
  function cssPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e) {
    if (paused || !started) return;
    e.preventDefault();
    var p = cssPos(e);
    pointers[e.pointerId] = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
    if (pointerOrder.indexOf(e.pointerId) < 0) pointerOrder.push(e.pointerId);
    if (pointerOrder.length === 2) startPinch();
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function move(e) {
    var pt = pointers[e.pointerId];
    if (!pt) return;
    e.preventDefault();
    var p = cssPos(e);
    var dx = p.x - pt.x, dy = p.y - pt.y;
    pt.x = p.x; pt.y = p.y;
    if (Math.abs(p.x - pt.sx) > 10 || Math.abs(p.y - pt.sy) > 10) pt.moved = true;
    if (pointerOrder.length >= 2) { updatePinch(); return; }
    if (pt.moved) R.panBy(dx, dy);
  }
  function up(e) {
    var pt = pointers[e.pointerId];
    if (!pt) return;
    e.preventDefault();
    if (paused || document.hidden) { release(e.pointerId); return; }
    var wasPinch = pointerOrder.length >= 2;
    release(e.pointerId);
    if (!wasPinch && !pt.moved) {
      showCursor = false;
      var h = R.pick(pt.x, pt.y);
      onHex(h.q, h.r);
    }
    if (pointerOrder.length === 2) startPinch();
  }
  function cancel(e) { release(e.pointerId); }
  function release(id) {
    delete pointers[id];
    var i = pointerOrder.indexOf(id);
    if (i >= 0) pointerOrder.splice(i, 1);
    if (pointerOrder.length < 2) { pinchDist = 0; pinchMid = null; }
    try { cv.releasePointerCapture(id); } catch (err) {}
  }
  function startPinch() {
    var a = pointers[pointerOrder[0]], b = pointers[pointerOrder[1]];
    if (!a || !b) return;
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function updatePinch() {
    var a = pointers[pointerOrder[0]], b = pointers[pointerOrder[1]];
    if (!a || !b || !pinchMid) return;
    var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinchDist > 0) R.zoomAt(d / pinchDist, mid.x, mid.y);
    R.panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
    pinchDist = d; pinchMid = mid;
  }

  cv.addEventListener('pointerdown', down, { passive: false });
  cv.addEventListener('pointermove', move, { passive: false });
  cv.addEventListener('pointerup', up, { passive: false });
  cv.addEventListener('pointercancel', cancel, { passive: false });
  cv.addEventListener('pointerleave', cancel, { passive: false });
  cv.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = cssPos(e);
    R.zoomAt(e.deltaY < 0 ? 1.12 : 0.89, p.x, p.y);
  }, { passive: false });
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- keyboard ----------
  var ARROW = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  window.addEventListener('keydown', function (e) {
    if (paused || document.hidden) { clearInput(); return; }
    if (!started) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
      return;
    }
    keys[e.key] = 1;
    if (ovAttack.classList.contains('on')) {
      if (e.key === 'Enter') { e.preventDefault(); doAttack(); }
      if (e.key === 'Escape') { e.preventDefault(); pendingAttack = null; ovAttack.classList.remove('on'); }
      return;
    }
    if (ovEnd.classList.contains('on')) {
      if (e.key === 'Enter') { e.preventDefault(); $('btnNext').click(); }
      return;
    }
    if (paused) return;
    var S = G.state;
    if (!S) return;
    if (ARROW[e.key]) {
      e.preventDefault();
      showCursor = true;
      var d = ARROW[e.key], nq = S.cursor.q + d[0], nr = S.cursor.r + d[1];
      if (G.hexAt(nq, nr)) { S.cursor = { q: nq, r: nr }; SFX.tap(); }
      else {
        // slide along the hex diagonal so every cell is reachable with 4 keys
        var alt = e.key === 'ArrowUp' ? [1, -1] : e.key === 'ArrowDown' ? [-1, 1] : null;
        if (alt && G.hexAt(S.cursor.q + alt[0], S.cursor.r + alt[1])) {
          S.cursor = { q: S.cursor.q + alt[0], r: S.cursor.r + alt[1] }; SFX.tap();
        }
      }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); showCursor = true; onHex(S.cursor.q, S.cursor.r); return; }
    if (e.key === 'Escape') { deselect(); return; }
    if (e.key === ' ') { e.preventDefault(); endTurn(); return; }
    if (e.key === '1') { tryRecruit('spear'); return; }
    if (e.key === '2') { tryRecruit('cav'); return; }
    if (e.key === '3') { tryRecruit('bow'); return; }
    if (e.key === '+' || e.key === '=') { R.zoomAt(1.15, cv.clientWidth / 2, cv.clientHeight / 2); return; }
    if (e.key === '-' || e.key === '_') { R.zoomAt(0.87, cv.clientWidth / 2, cv.clientHeight / 2); return; }
    if (e.key === 'f' || e.key === 'F') { R.fit(); return; }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });
  window.addEventListener('blur', function () {
    clearInput();
    for (var k in keys) delete keys[k];
  });
  document.addEventListener('visibilitychange', function () {
    hiddenBlocked = document.hidden;
    if (hiddenBlocked) { clearInput(); clearTimers(); }
    paused = rotBlocked || hiddenBlocked;
    lastTs = 0;
  });

  // ---------- buttons ----------
  function tryRecruit(type) {
    var S = G.state;
    if (!S || S.over || S.phase !== 'player' || paused) return;
    if (!G.canRecruit(0, type)) {
      SFX.deny();
      hint(S.gold[0] < G.UNITS[type].cost ? 'Not enough gold — claim more hexes for income.'
        : G.countArmies(0) >= G.ARMY_CAP ? 'Banner limit reached (' + G.ARMY_CAP + ').'
        : 'No free space at your keep.');
      return;
    }
    var a = G.recruit(0, type);
    if (a) {
      SFX.recruit();
      R.burst(a.q, a.r, G.FACTIONS[0].col, 12, 55);
      R.say(a.q, a.r, '+' + G.UNITS[type].name, '#cfe2ff');
      refresh();
      hint('Recruited a ' + G.UNITS[type].name + '. It marches next turn.');
    }
  }
  $('cSpear').addEventListener('click', function () { tryRecruit('spear'); });
  $('cCav').addEventListener('click', function () { tryRecruit('cav'); });
  $('cBow').addEventListener('click', function () { tryRecruit('bow'); });
  $('endturn').addEventListener('click', endTurn);
  $('btnAtk').addEventListener('click', doAttack);
  $('btnAtkNo').addEventListener('click', function () {
    pendingAttack = null; ovAttack.classList.remove('on'); SFX.tap();
  });
  $('btnNext').addEventListener('click', function () {
    var l = G.loadLegacy();
    newSeasonFrom(l);
  });
  $('btnReset').addEventListener('click', function () {
    G.clearLegacy();
    newSeasonFrom(G.defLegacy());
  });
  $('btnStart').addEventListener('click', start);

  function start() {
    if (started) return;
    started = true;
    SFX.unlock();
    ovStart.classList.remove('on');
    R.resize(); R.fit();
    refresh();
  }

  // ---------- orientation (hardening #1: pauses the sim) ----------
  function checkOrient() {
    var landscape = window.innerWidth > window.innerHeight && window.innerHeight < 480;
    if (landscape !== rotBlocked) {
      rotBlocked = landscape;
      if (landscape) { ovRot.classList.add('on'); clearInput(); }
      else {
        ovRot.classList.remove('on');
        R.resize(); R.fit();
      }
    }
    var nextPaused = rotBlocked || hiddenBlocked;
    if (nextPaused && !paused) { clearInput(); clearTimers(); }
    paused = nextPaused;
    if (!paused) lastTs = 0;
  }

  // ---------- loop ----------
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    if (!paused && !document.hidden) {
      R.step(dt);
      var S = G.state;
      if (started && S && S.phase === 'ai' && !S.over && !ovEnd.classList.contains('on')) {
        if (aiBannerT > 0) aiBannerT -= dt;
        aiTimer += dt;
        var budget = 24;
        while (aiBannerT <= 0 && aiTimer >= AI_STEP && budget > 0 && S.phase === 'ai') {
          aiTimer -= AI_STEP;
          // instant bookkeeping actions resolve for free; only real moves cost a beat
          var slow = aiStep(); budget--;
          while (!slow && budget > 0 && S.phase === 'ai' && aiQueue.length) { slow = aiStep(); budget--; }
        }
      }
    }
    R.draw({
      cursor: G.state ? G.state.cursor : null,
      showCursor: showCursor && G.state && G.state.phase === 'player',
      banner: (aiBannerT > 0 && aiBanner) ? aiBanner : null,
      bannerCol: '#e8eef8'
    });
  }

  window.addEventListener('resize', function () {
    R.resize(); R.clampCam(); checkOrient();
  });
  window.addEventListener('orientationchange', function () {
    later(function () { R.resize(); R.fit(); checkOrient(); }, 260);
  });

  boot();
  checkOrient();
  requestAnimationFrame(frame);
})();
