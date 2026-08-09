/* Silkwind - 1v1 stance duels. Vanilla JS + canvas. */
'use strict';
(function () {
  /* ---------- dom ---------- */
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d', { alpha: false });
  var stage = document.getElementById('stage'), hintEl = document.getElementById('hint');
  var ovBoot = document.getElementById('boot'), ovEnd = document.getElementById('end');
  var ovLad = document.getElementById('ladder'), ovRot = document.getElementById('rot');
  var elEndT = document.getElementById('endT'), elEndP = document.getElementById('endP');
  var elLadList = document.getElementById('ladList'), elBurst = document.getElementById('bBurst');
  var chips = [document.getElementById('s0'), document.getElementById('s1'), document.getElementById('s2')];

  /* ---------- const ---------- */
  var STC = ['#7fd4ff', '#ff8a6a', '#9fe08a'];
  var STN = ['CRANE', 'TIGER', 'SERPENT'];
  var DASH_COST = 20, BURST_COST = 50;
  var MAXP = 150;
  function beats(a, b) { return (a + 1) % 3 === b; }
  function sf(a, b) { return beats(a, b) ? 1.5 : (beats(b, a) ? 0.65 : 1); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------- timers (all cancellable) ---------- */
  var timers = [];
  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); fn();
    }, ms);
    timers.push(id); return id;
  }
  function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers.length = 0; }

  /* ---------- save ---------- */
  var KEY = 'silkwind.save.v1';
  function ci(v, lo, hi, d) {
    var n = (typeof v === 'number') ? v : (typeof v === 'string' ? parseInt(v, 10) : NaN);
    if (typeof n !== 'number' || !isFinite(n) || isNaN(n)) return d;
    n = Math.floor(n); return n < lo ? lo : (n > hi ? hi : n);
  }
  function defSave() { return { rank: 0, wins: 0, losses: 0 }; }
  function loadSave() {
    try {
      var raw = localStorage.getItem(KEY);
      if (typeof raw !== 'string' || !raw) return defSave();
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return defSave();
      return { rank: ci(o.rank, 0, 8, 0), wins: ci(o.wins, 0, 99999, 0), losses: ci(o.losses, 0, 99999, 0) };
    } catch (e) { return defSave(); }
  }
  function saveNow() { try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) {} }
  var SAVE = loadSave();

  /* ---------- world ---------- */
  var W = 390, H = 540, SCALE = 1;
  var G = {
    phase: 'boot', mi: 0, roundNo: 1, rp: 0, re: 0,
    paused: false, rotate: false, over: 0, overKind: '',
    banner: '', bannerT: 0, sub: '', freeze: 0,
    shake: 0, flash: 0, flashC: '#fff', hitstop: 0, time: 60, hint: ''
  };
  var P = null, E = null, M = null;
  var range = 0, rangeV = 0;
  var parts = [], bamboo = [];

  function mkP() {
    return { hp: 100, max: 100, stance: 0, breath: 40, act: null, flash: 0, hurtT: 0,
             guard: 'high', facing: 1, bob: Math.random() * 6, lastMsg: '', msgT: 0 };
  }
  function mkE(m) {
    return { hp: m.hp, max: m.hp, stance: m.stance, breath: 0, act: null, flash: 0, hurtT: 0,
             guard: 'high', facing: -1, si: 0, wait: 900, bob: Math.random() * 6, lastMsg: '', msgT: 0 };
  }
  function setAct(f, kind, win, act, rec, d) {
    f.act = { kind: kind, t: 0, win: win, act: act, rec: rec, total: win + act + rec, resolved: false, d: d || null };
  }
  function phaseOf(f) {
    if (!f.act) return 'idle';
    var a = f.act;
    if (a.t < a.win) return 'wind';
    if (a.t < a.win + a.act) return 'active';
    return 'rec';
  }

  /* ---------- fx ---------- */
  function part(x, y, vx, vy, life, col, size, kind) {
    if (parts.length >= MAXP) parts.splice(0, parts.length - MAXP + 1);
    parts.push({ x: x, y: y, vx: vx, vy: vy, l: life, m: life, c: col, s: size, k: kind || 'spark' });
  }
  function burstFx(x, y, n, col, spd) {
    n = Math.min(n, 26);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = spd * (0.35 + Math.random());
      part(x, y, Math.cos(a) * s, Math.sin(a) * s - 30, 260 + Math.random() * 320, col, 1.4 + Math.random() * 2.4);
    }
  }
  function ring(x, y, col, r) { part(x, y, 0, 0, 300, col, r || 10, 'ring'); }
  function shake(v) { G.shake = Math.min(26, G.shake + v); }
  function flash(c, a) { G.flash = Math.max(G.flash, a); G.flashC = c; }
  function say(f, t) { f.lastMsg = t; f.msgT = 700; }
  function banner(t, sub, ms) { G.banner = t; G.sub = sub || ''; G.bannerT = ms || 1100; }

  /* ---------- geometry ---------- */
  function groundY() { return H * 0.80; }
  function posP() { return W * (0.30 - 0.13 * rangeV); }
  function posE() { return W * (0.70 + 0.13 * rangeV); }

  /* ---------- combat ---------- */
  function dealToPlayer(base, kind, mult) {
    var d = base * sf(E.stance, P.stance) * (mult || 1) * (1 + G.mi * 0.035);
    d = Math.max(1, Math.round(d));
    P.hp = Math.max(0, P.hp - d);
    P.flash = 1; P.hurtT = 260;
    setAct(P, 'hurt', 0, 0, kind === 'B' ? 520 : (kind === 'G' ? 420 : 300));
    range = 1; /* every clean hit breaks the measure apart */
    shake(d * 0.55); flash('#ff5a5a', 0.30);
    if (d > 12) G.hitstop = 60;
    burstFx(posP(), groundY() - 70, 12, '#ff7a6a', 130);
    SND.hit(d > 13);
    return d;
  }
  /* damage that does NOT interrupt whatever the enemy is doing */
  function grazeEnemy(base, mult, label) {
    var d = Math.max(1, Math.round(base * sf(P.stance, E.stance) * (mult || 1)));
    E.hp = Math.max(0, E.hp - d);
    E.flash = 0.7; shake(3);
    burstFx(posE(), groundY() - 70, 5, STC[P.stance], 90);
    SND.block();
    if (label) say(E, label);
    return d;
  }
  /* whiffing or bouncing off leaves you rooted */
  function overextend(ms) {
    if (!P.act) return;
    P.act.rec += ms; P.act.total += ms;
  }
  function dealToEnemy(base, mult, label) {
    var d = base * sf(P.stance, E.stance) * (mult || 1);
    d = Math.max(1, Math.round(d));
    E.hp = Math.max(0, E.hp - d);
    E.flash = 1; E.hurtT = 240;
    setAct(E, 'hurt', 0, 0, 280 + Math.min(220, d * 8));
    E.wait = 260;
    range = 1; /* every clean hit breaks the measure apart */
    shake(d * 0.5); flash('#ffffff', 0.22);
    if (d > 12) G.hitstop = 60;
    burstFx(posE(), groundY() - 70, 12, STC[P.stance], 140);
    SND.hit(d > 13);
    if (label) say(E, label);
    return d;
  }

  /* enemy attack lands */
  function enemyResolve(a) {
    var k = a.kind;
    var pa = P.act, pp = phaseOf(P);
    var base = (k === 'H' || k === 'L') ? 10 : k === 'T' ? 8 : k === 'G' ? 13 : 18;

    /* evade beats everything */
    if (pa && pa.kind === 'evade' && pp !== 'rec') {
      P.breath = Math.min(100, P.breath + 8);
      say(P, 'EVADE'); SND.whoosh(); ring(posE(), groundY() - 70, '#9fb6ff', 16);
      return;
    }
    /* parry: works on strikes only */
    if (pa && pa.kind === 'parry' && pp === 'active') {
      if (k === 'H' || k === 'L' || k === 'T') {
        P.breath = Math.min(100, P.breath + 25);
        setAct(E, 'stagger', 0, 0, 900); E.wait = 200;
        say(P, 'PERFECT PARRY'); say(E, 'STAGGER');
        SND.parry(); flash('#ffe9a0', 0.42); shake(7);
        ring((posP() + posE()) / 2, groundY() - 72, '#ffe9a0', 12);
        burstFx((posP() + posE()) / 2, groundY() - 72, 16, '#ffe9a0', 150);
        return;
      }
      /* grab / burst break parries */
      dealToPlayer(base, k, 1.25); say(E, k === 'G' ? 'PARRY BROKEN' : 'ART BREAKS GUARD');
      return;
    }
    /* burst super-armour */
    if (pa && pa.kind === 'burst' && pp !== 'rec' && k !== 'B') {
      var dd = Math.max(1, Math.round(base * 0.45));
      P.hp = Math.max(0, P.hp - dd); P.flash = 1; shake(5); SND.block();
      say(P, 'ART HOLDS'); return;
    }
    /* trade with a strike */
    if (pa && pa.kind === 'strike' && pp !== 'rec') {
      if (k === 'G') { say(P, 'STRIKE BEATS GRAB'); E.act.resolved = true; dealToEnemy(11, 1.1, ''); return; }
      if (k === 'B') { dealToPlayer(base, k, 1); say(E, 'ART OVERWHELMS'); return; }
      if (beats(P.stance, E.stance)) {
        E.act.resolved = true; setAct(E, 'hurt', 0, 0, 340);
        say(P, 'STANCE WINS'); dealToEnemy(11, 1.15, ''); return;
      }
      if (beats(E.stance, P.stance)) { dealToPlayer(base, k, 1.1); say(E, 'STANCE WINS'); return; }
      /* mirror clash */
      P.hp = Math.max(0, P.hp - 3); E.hp = Math.max(0, E.hp - 3);
      P.breath = Math.min(100, P.breath + 12);
      setAct(P, 'hurt', 0, 0, 220); setAct(E, 'hurt', 0, 0, 220);
      say(P, 'CLASH'); SND.clash(); shake(6); flash('#cfe6ff', 0.24);
      burstFx((posP() + posE()) / 2, groundY() - 74, 14, '#dff0ff', 170);
      return;
    }
    /* open */
    if (!pa) {
      if (k === 'H' || k === 'L' || k === 'T') {
        var d2 = Math.max(1, Math.round(base * 0.38 * sf(E.stance, P.stance)));
        P.hp = Math.max(0, P.hp - d2); P.flash = 0.7; shake(3.5); SND.block();
        say(P, 'GUARDED'); ring(posP() + 16, groundY() - 74, '#9fb6ff', 8);
        return;
      }
      dealToPlayer(base, k, 1);
      return;
    }
    dealToPlayer(base, k, 1.4); /* caught recovering */
  }

  /* player action lands */
  function playerResolve(a) {
    var k = a.kind, dir = a.d;
    if (range === 1 && k !== 'burst') { say(P, 'TOO FAR'); SND.whoosh(); overextend(180); return; }
    if (k === 'burst') { range = 0; }
    var ep = phaseOf(E), ek = E.act ? E.act.kind : null;

    if (k === 'burst') {
      if (E.act) E.act.resolved = true;
      SND.burst(); flash('#ffd76a', 0.5); shake(14);
      burstFx(posE(), groundY() - 74, 24, '#ffd76a', 230);
      ring(posE(), groundY() - 74, '#ffd76a', 26);
      dealToEnemy(24, 1, 'ART LANDS'); return;
    }
    var atk = (ek === 'H' || ek === 'L' || ek === 'T' || ek === 'G' || ek === 'B');
    if (k === 'grab') {
      if (ek === 'P' && ep === 'active') { dealToEnemy(15, 1, 'GRABBED'); SND.grab(); return; }
      if (ep === 'wind' && atk) { say(P, 'WHIFF'); SND.whoosh(); overextend(200); return; }
      if (ep === 'rec' || ek === 'stagger' || ek === 'hurt') { dealToEnemy(11, 1.3, 'GRABBED'); SND.grab(); return; }
      dealToEnemy(8, 1, 'GRABBED'); SND.grab(); return;
    }
    /* strike */
    if (ek === 'P' && ep === 'active') {
      setAct(P, 'stagger', 0, 0, 760); say(E, 'PARRIED'); say(P, 'OPEN');
      SND.parry(); flash('#ffe9a0', 0.3); shake(6); return;
    }
    if (ep === 'wind' && atk) {
      /* a committed form is armoured: swinging into a tell roots you for the hit */
      grazeEnemy(dir === 'T' ? 8 : 10, 0.25, 'ARMOURED');
      overextend(300); return;
    }
    if (ep === 'rec' || ek === 'stagger' || ek === 'hurt') {
      dealToEnemy(dir === 'T' ? 8 : 10, 1.6, 'PUNISH'); return;
    }
    /* guarded idle */
    if (dir === 'T') { dealToEnemy(7, 1, 'THRUST'); return; }
    var gd = (dir === 'H') ? 'high' : 'low';
    if (E.guard === gd) {
      grazeEnemy(2, 1, 'BLOCKED');
      ring(posE() - 16, groundY() - (gd === 'high' ? 96 : 46), '#9fb6ff', 8);
      overextend(200); return;
    }
    dealToEnemy(10, 1.55, 'GUARD BREAK');
  }

  /* ---------- player inputs ---------- */
  function canAct() {
    if (G.phase !== 'fight' || G.paused || G.rotate || G.freeze > 0 || G.over > 0) return false;
    var p = phaseOf(P);
    if (!P.act) return true;
    if (P.act.kind === 'hurt' || P.act.kind === 'stagger') return false;
    return p === 'rec' && P.act.t > P.act.win + P.act.act + P.act.rec * 0.55;
  }
  function doStrike(dir) {
    if (!canAct()) return;
    setAct(P, 'strike', 150, 90, 300, dir);
    SND.whoosh();
  }
  function doParry() {
    if (!canAct()) return;
    setAct(P, 'parry', 0, 210, 250);
    ring(posP() + 20, groundY() - 74, '#dff0ff', 9);
    SND.ui();
  }
  function doGrab() {
    if (!canAct()) return;
    setAct(P, 'grab', 230, 110, 470);
    SND.whoosh();
  }
  function doEvade() {
    if (!canAct()) return;
    setAct(P, 'evade', 0, 240, 150);
    range = 1;
    P.breath = Math.min(100, P.breath + 4);
    for (var i = 0; i < 6; i++) part(posP(), groundY() - 20 - i * 10, 60 + Math.random() * 60, -10, 260, '#7f8ba8', 2);
    SND.whoosh();
  }
  function doDash() {
    if (!canAct()) return;
    if (range === 0) { doStrike('T'); return; }
    if (P.breath < DASH_COST) { say(P, 'NO BREATH'); return; }
    P.breath -= DASH_COST;
    range = 0;
    setAct(P, 'dash', 0, 200, 70);
    for (var i = 0; i < 8; i++) part(posP() - i * 6, groundY() - 30 - Math.random() * 60, -80, -20, 300, '#9fd6ff', 2.2);
    SND.dash();
  }
  function doBurst() {
    if (!canAct()) return;
    if (P.breath < BURST_COST) { say(P, 'NEED 50 BREATH'); SND.block(); return; }
    P.breath -= BURST_COST;
    setAct(P, 'burst', 260, 120, 360);
    ring(posP(), groundY() - 74, STC[P.stance], 14);
    SND.gong();
  }
  function setStance(i) {
    if (G.phase !== 'fight' || G.paused) return;
    if (P.stance === i) return;
    P.stance = i;
    for (var k = 0; k < 3; k++) chips[k].classList.toggle('on', k === i);
    ring(posP(), groundY() - 74, STC[i], 10);
    SND.stance(i);
  }

  /* ---------- enemy ai ---------- */
  function nextToken() {
    var s = M.seq;
    var tk = s[E.si % s.length];
    E.si++;
    if (Math.random() < M.loose) tk = s[(Math.random() * s.length) | 0];
    /* never retreat when already far */
    if (tk === 'R' && range === 1) tk = 'H';
    return tk;
  }
  function enemyStanceLogic(tk) {
    if (M.stanceMode === 'cycle') { if (tk === 'S' || Math.random() < 0.22) E.stance = (E.stance + 1) % 3; }
    else if (M.stanceMode === 'counter') {
      if (tk === 'S' || Math.random() < 0.30) E.stance = (P.stance + 2) % 3;
    }
  }
  function enemyStart() {
    var tk = nextToken();
    enemyStanceLogic(tk);
    var tell = M.tell;
    if (tk === 'S') { setAct(E, 'S', 0, 200, 80); ring(posE(), groundY() - 74, STC[E.stance], 12); SND.stance(E.stance); return; }
    if (tk === 'R') { setAct(E, 'R', 0, 240, 140); range = 1; SND.whoosh(); return; }
    if (tk === 'P') { setAct(E, 'P', 70, 620, 240); return; }
    if (tk === 'G') { setAct(E, 'G', tell * 1.12, 100, 340); }
    else if (tk === 'B') { setAct(E, 'B', tell * 1.5, 120, 430); SND.gong(); }
    else {
      if (M.guardMode === 'alt') E.guard = (E.guard === 'high') ? 'low' : 'high';
      else if (M.guardMode === 'rand') E.guard = Math.random() < 0.5 ? 'high' : 'low';
      setAct(E, tk, tell, 90, 280);
    }
    if (range === 1) range = 0; /* closes in as it commits */
    SND.whoosh();
  }

  /* ---------- round / match ---------- */
  function startMatch(mi) {
    clearTimers(); resetInput();
    G.mi = clamp(mi | 0, 0, MASTERS.length - 1);
    M = MASTERS[G.mi];
    G.rp = 0; G.re = 0; G.roundNo = 1;
    G.phase = 'fight'; G.paused = false;
    hideAll();
    startRound(true);
  }
  function startRound(first) {
    clearTimers();
    var st = P ? P.stance : 0;
    P = mkP(); P.stance = first ? 0 : st;
    for (var k = 0; k < 3; k++) chips[k].classList.toggle('on', k === P.stance);
    E = mkE(M);
    range = 0; rangeV = 0;
    parts.length = 0;
    G.over = 0; G.overKind = ''; G.time = 60;
    G.freeze = 1200; G.shake = 0; G.flash = 0; G.hitstop = 0;
    banner('ROUND ' + G.roundNo, M.name, 1200);
    resetInput();
  }
  function endRound(who) {
    if (G.over) return;
    G.over = 1700; G.overKind = who;
    if (who === 'p') { G.rp++; SND.win(); banner('ROUND WON', '', 1500); }
    else if (who === 'e') { G.re++; SND.ko(); banner('ROUND LOST', '', 1500); }
    else {
      if (P.hp >= E.hp) { G.rp++; banner('TIME - ROUND WON', '', 1500); SND.win(); }
      else { G.re++; banner('TIME - ROUND LOST', '', 1500); SND.ko(); }
    }
    shake(16); flash('#ffffff', 0.4);
    burstFx(who === 'p' ? posE() : posP(), groundY() - 70, 24, '#ffffff', 220);
  }
  function afterRound() {
    if (G.rp >= 2) return matchEnd(true);
    if (G.re >= 2) return matchEnd(false);
    G.roundNo++;
    startRound(false);
  }
  function matchEnd(won) {
    G.phase = 'over';
    resetInput(); clearTimers();
    if (won) {
      SAVE.wins++;
      if (G.mi + 1 > SAVE.rank) SAVE.rank = G.mi + 1;
      saveNow();
      if (SAVE.rank >= MASTERS.length && G.mi === MASTERS.length - 1) {
        elEndT.textContent = 'GRANDMASTER';
        elEndP.innerHTML = 'The Silkwind bows. All eight gates are open to you.<br>Ladder cleared &mdash; duels ' + SAVE.wins + ' won.';
        SND.gong(); SND.win();
      } else {
        elEndT.textContent = 'MASTER DEFEATED';
        var nm = MASTERS[Math.min(SAVE.rank, MASTERS.length - 1)];
        elEndP.innerHTML = M.name + ' yields ' + G.rp + '&ndash;' + G.re + '.<br>Rank ' + SAVE.rank + ' of 8. Next: ' + nm.name + '.';
        SND.win();
      }
    } else {
      SAVE.losses++; saveNow();
      elEndT.textContent = 'DEFEATED';
      elEndP.innerHTML = M.name + ' wins ' + G.re + '&ndash;' + G.rp + '.<br><i style="color:#ffd76a">' + M.tip + '</i>';
      SND.lose();
    }
    var nxt = document.getElementById('bNext');
    if (won && SAVE.rank < MASTERS.length) { nxt.style.display = ''; nxt.textContent = 'NEXT MASTER'; }
    else if (won) { nxt.style.display = ''; nxt.textContent = 'OPEN THE LADDER'; }
    else { nxt.style.display = 'none'; }
    ovEnd.classList.add('show');
  }

  /* ---------- overlays ---------- */
  function hideAll() {
    ovBoot.classList.remove('show'); ovEnd.classList.remove('show'); ovLad.classList.remove('show');
  }
  function buildLadder() {
    elLadList.innerHTML = '';
    ladRels.length = 0;
    for (var i = 0; i < MASTERS.length; i++) {
      (function (i) {
        var m = MASTERS[i], b = document.createElement('button');
        b.className = 'lrow' + (i > SAVE.rank ? ' lock' : '');
        var st = i < SAVE.rank ? 'DEFEATED' : (i === SAVE.rank ? 'NEXT' : 'LOCKED');
        b.innerHTML = '<div><b>' + (i + 1) + '. ' + m.name + '</b><span>' + m.title + '</span></div><i>' + st + '</i>';
        if (i <= SAVE.rank) bindBtn(b, function () { SND.ui(); startMatch(i); }, ladRels);
        elLadList.appendChild(b);
      })(i);
    }
  }

  /* ---------- input ---------- */
  var keys = Object.create(null);
  var pt = { id: null, x0: 0, y0: 0, x: 0, y: 0, t0: 0, fired: false };
  var btnRels = [], ladRels = [];
  function resetInput() {
    pt.id = null; pt.fired = false; pt.x0 = pt.y0 = pt.x = pt.y = 0; pt.t0 = 0;
    for (var k in keys) delete keys[k];
    for (var i = 0; i < btnRels.length; i++) btnRels[i]();
    for (var j = 0; j < ladRels.length; j++) ladRels[j]();
  }
  function bindBtn(el, fn, list) {
    var pid = null;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (pid !== null) return;
      if (document.hidden || G.rotate) return;
      pid = e.pointerId; el.classList.add('dn');
      try { el.setPointerCapture(pid); } catch (_) {}
      unlockAudio(); fn();
    }, { passive: false });
    function rel(e) {
      if (pid === null) return;
      if (e && typeof e.pointerId === 'number' && e.pointerId !== pid) return;
      pid = null; el.classList.remove('dn');
    }
    el.addEventListener('pointerup', rel);
    el.addEventListener('pointercancel', rel);
    el.addEventListener('lostpointercapture', rel);
    el.addEventListener('pointerleave', rel);
    (list || btnRels).push(function () { pid = null; el.classList.remove('dn'); });
  }
  function anyOverlay() {
    return ovBoot.classList.contains('show') || ovEnd.classList.contains('show') ||
           ovLad.classList.contains('show') || G.rotate;
  }
  function menuRect() { return { x: W - 54, y: 6, w: 48, h: 48 }; }
  function inRect(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  stage.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    unlockAudio();
    if (document.hidden || G.paused || G.phase !== 'fight' || anyOverlay()) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (inRect(menuRect(), x, y)) { SND.ui(); buildLadder(); ovLad.classList.add('show'); G.paused = true; resetInput(); return; }
    if (pt.id !== null) return;
    pt.id = e.pointerId; pt.x0 = pt.x = x; pt.y0 = pt.y = y; pt.t0 = performance.now(); pt.fired = false;
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  }, { passive: false });

  stage.addEventListener('pointermove', function (e) {
    if (pt.id !== e.pointerId) return;
    e.preventDefault();
    var r = cv.getBoundingClientRect();
    pt.x = e.clientX - r.left; pt.y = e.clientY - r.top;
    if (pt.fired) return;
    var dx = pt.x - pt.x0, dy = pt.y - pt.y0;
    if (dx * dx + dy * dy > 26 * 26) {
      pt.fired = true;
      if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0) doDash(); else doEvade(); }
      else { if (dy < 0) doStrike('H'); else doStrike('L'); }
    }
  }, { passive: false });

  function ptEnd(e, up) {
    if (pt.id !== e.pointerId) return;
    e.preventDefault();
    if (up && !pt.fired) {
      var dt = performance.now() - pt.t0;
      var dx = pt.x - pt.x0, dy = pt.y - pt.y0;
      if (dt < 300 && dx * dx + dy * dy < 26 * 26) doParry();
    }
    pt.id = null; pt.fired = false;
  }
  stage.addEventListener('pointerup', function (e) { ptEnd(e, true); }, { passive: false });
  stage.addEventListener('pointercancel', function (e) { ptEnd(e, false); }, { passive: false });
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { G.paused = true; resetInput(); clearTimers(); }
    else if (!ovLad.classList.contains('show') && !G.rotate) G.paused = false;
  });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(k) >= 0) e.preventDefault();
    if (document.hidden || G.rotate) { resetInput(); return; }
    if (keys[k]) return;
    keys[k] = 1;
    unlockAudio();
    if (G.rotate || document.hidden) return;
    if (G.phase === 'boot') { if (k === 'Enter' || k === ' ') startMatch(Math.min(SAVE.rank, MASTERS.length - 1)); return; }
    if (ovLad.classList.contains('show')) { if (k === 'Escape' || k === 'l' || k === 'L') closeLadder(); return; }
    if (G.phase === 'over') {
      if (k === 'Enter') { var n = document.getElementById('bNext'); if (n.style.display !== 'none') n.click(); else document.getElementById('bAgain').click(); }
      if (k === 'r' || k === 'R') document.getElementById('bAgain').click();
      if (k === 'l' || k === 'L') document.getElementById('bLad').click();
      return;
    }
    if (k === 'ArrowUp') doStrike('H');
    else if (k === 'ArrowDown') doStrike('L');
    else if (k === 'ArrowRight') doDash();
    else if (k === 'ArrowLeft') doEvade();
    else if (k === 'j' || k === 'J') doParry();
    else if (k === 'k' || k === 'K') doGrab();
    else if (k === ' ') doBurst();
    else if (k === '1') setStance(0);
    else if (k === '2') setStance(1);
    else if (k === '3') setStance(2);
    else if (k === 'r' || k === 'R') startMatch(G.mi);
    else if (k === 'l' || k === 'L') { buildLadder(); ovLad.classList.add('show'); G.paused = true; resetInput(); }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  /* ---------- audio unlock ---------- */
  var audioOn = false;
  function unlockAudio() { if (audioOn) return; audioOn = true; SND.init(); SND.resume(); }

  /* ---------- buttons ---------- */
  bindBtn(document.getElementById('bStart'), function () { startMatch(Math.min(SAVE.rank, MASTERS.length - 1)); });
  bindBtn(document.getElementById('bParry'), doParry);
  bindBtn(document.getElementById('bGrab'), doGrab);
  bindBtn(elBurst, doBurst);
  for (var ci2 = 0; ci2 < 3; ci2++) (function (i) { bindBtn(chips[i], function () { setStance(i); }); })(ci2);
  bindBtn(document.getElementById('bNext'), function () {
    if (G.rp >= 2 && SAVE.rank < MASTERS.length) startMatch(SAVE.rank);
    else { buildLadder(); ovEnd.classList.remove('show'); ovLad.classList.add('show'); }
  });
  bindBtn(document.getElementById('bAgain'), function () { startMatch(G.mi); });
  bindBtn(document.getElementById('bLad'), function () { buildLadder(); ovLad.classList.add('show'); });
  function closeLadder() { ovLad.classList.remove('show'); if (G.phase === 'fight') G.paused = false; SND.ui(); }
  bindBtn(document.getElementById('bClose'), closeLadder);
  bindBtn(document.getElementById('bWipe'), function () {
    SAVE = defSave(); saveNow(); buildLadder(); SND.block();
  });

  /* ---------- resize ---------- */
  function resize() {
    var r = stage.getBoundingClientRect();
    W = Math.max(200, Math.round(r.width)); H = Math.max(200, Math.round(r.height));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = dpr, lng = Math.max(W, H) * s;
    if (lng > 960) s = s * 960 / lng;
    SCALE = s;
    cv.width = Math.round(W * s); cv.height = Math.round(H * s);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(s, 0, 0, s, 0, 0);
    bamboo.length = 0;
    var n = Math.min(16, Math.round(W / 26));
    for (var i = 0; i < n; i++) {
      bamboo.push({ x: (i + 0.5) / n * W + (Math.random() - 0.5) * 14, w: 3 + Math.random() * 5,
                    h: 0.35 + Math.random() * 0.42, d: 0.3 + Math.random() * 0.7, ph: Math.random() * 6.28 });
    }
    checkRotate();
  }
  function checkRotate() {
    var land = window.innerWidth > window.innerHeight * 1.05 && window.innerHeight < 560;
    if (land !== G.rotate) {
      G.rotate = land;
      ovRot.classList.toggle('show', land);
      if (land) resetInput();
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { later(resize, 120); });

  /* ---------- update ---------- */
  function stepFighter(f, dt, isP) {
    f.flash = Math.max(0, f.flash - dt * 0.005);
    f.hurtT = Math.max(0, f.hurtT - dt);
    f.msgT = Math.max(0, f.msgT - dt);
    f.bob += dt * 0.004;
    var a = f.act; if (!a) return;
    a.t += dt;
    if (!a.resolved && a.t >= a.win) {
      a.resolved = true;
      if (isP) { if (a.kind === 'strike' || a.kind === 'grab' || a.kind === 'burst') playerResolve(a); }
      else { if (a.kind === 'H' || a.kind === 'L' || a.kind === 'T' || a.kind === 'G' || a.kind === 'B') enemyResolve(a); }
    }
    if (a.t >= a.total) f.act = null;
  }

  function update(dt) {
    /* HARDENING 1: rotate overlay freezes the whole simulation */
    if (G.rotate) return;
    G.shake = Math.max(0, G.shake - dt * 0.045);
    G.flash = Math.max(0, G.flash - dt * 0.004);
    G.bannerT = Math.max(0, G.bannerT - dt);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.l -= dt;
      if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt * 0.001; p.y += p.vy * dt * 0.001;
      if (p.k !== 'ring') { p.vy += dt * 0.35; }
    }
    if (parts.length > MAXP) parts.splice(0, parts.length - MAXP);

    if (G.phase !== 'fight' || G.paused) return;

    rangeV += (range - rangeV) * Math.min(1, dt * 0.009);

    if (G.over > 0) {
      G.over -= dt;
      if (G.over <= 0) { G.over = 0; afterRound(); }
      return;
    }
    if (G.freeze > 0) { G.freeze -= dt; return; }
    if (G.hitstop > 0) { G.hitstop -= dt; return; }

    G.time = Math.max(0, G.time - dt * 0.001);

    P.breath = Math.min(100, P.breath + dt * 0.006);
    elBurst.classList.toggle('off', P.breath < BURST_COST);

    stepFighter(P, dt, true);
    stepFighter(E, dt, false);

    /* hold-to-grab */
    if (pt.id !== null && !pt.fired) {
      var dx = pt.x - pt.x0, dy = pt.y - pt.y0;
      if (dx * dx + dy * dy < 26 * 26 && performance.now() - pt.t0 >= 300) { pt.fired = true; doGrab(); }
    }

    /* enemy brain */
    if (!E.act) {
      E.wait -= dt;
      if (E.wait <= 0) { enemyStart(); E.wait = M.gap * (0.85 + Math.random() * 0.3); }
    }

    /* mist */
    if (Math.random() < dt * 0.004) {
      part(Math.random() * W, groundY() - Math.random() * 40, (Math.random() - 0.5) * 20, -6, 1600, 'rgba(150,175,210,0.16)', 8 + Math.random() * 14, 'mist');
    }

    if (P.hp <= 0) endRound('e');
    else if (E.hp <= 0) endRound('p');
    else if (G.time <= 0) endRound('t');

    updateHint();
  }

  function updateHint() {
    var h;
    var ek = E.act ? E.act.kind : null, ep = phaseOf(E);
    if (ek === 'B' && ep === 'wind') h = 'BURST ART — SWIPE ◀ TO EVADE';
    else if (ek === 'G' && ep === 'wind') h = 'GRAB — SWIPE ◀ TO EVADE';
    else if ((ek === 'H' || ek === 'L' || ek === 'T') && ep === 'wind') h = 'STRIKE INCOMING — TAP TO PARRY';
    else if (ek === 'P') h = 'THEY WAIT — HOLD TO GRAB';
    else if (range === 1) h = 'TOO FAR — SWIPE ▶ TO DASH IN (' + DASH_COST + ')';
    else if (ek === 'stagger' || ek === 'hurt' || ep === 'rec') h = 'OPENING — SWIPE ▲ / ▼ TO STRIKE';
    else if (beats(E.stance, P.stance)) h = 'STANCE LOSS — TAP ' + STN[(E.stance + 2) % 3];
    else if (P.breath >= BURST_COST) h = 'BREATH FULL — BURST ART READY';
    else h = 'STRIKE ' + (E.guard === 'high' ? '▼ LOW' : '▲ HIGH') + ' — THEY GUARD ' + E.guard.toUpperCase();
    if (h !== G.hint) { G.hint = h; hintEl.textContent = h; }
  }

  /* ---------- render ---------- */
  function bar(x, y, w, h, v, col, bg) {
    ctx.fillStyle = bg || '#1a2032'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(v, 0, 1), h);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }

  function drawFighter(f, x, isP) {
    var gy = groundY(), a = f.act, ph = phaseOf(f), col = STC[f.stance];
    var face = isP ? 1 : -1;
    var lean = 0, reach = 0, crouch = 0, ry = -74, sink = 0;
    if (a) {
      var k = a.kind, t = a.t;
      if (k === 'strike' || k === 'burst') {
        var w = a.win, tot = a.win + a.act;
        reach = t < w ? -0.35 * (t / w) : (t < tot ? 1 : Math.max(0, 1 - (t - tot) / a.rec));
        lean = reach * 10;
        ry = (a.d === 'L') ? -46 : (a.d === 'T' ? -70 : -96);
        if (k === 'burst') { ry = -70; reach *= 1.25; }
      } else if (k === 'grab') {
        reach = t < a.win ? 0.2 : 0.9; ry = -70; lean = 6;
      } else if (k === 'parry') { reach = 0.35; ry = -76; lean = -3; }
      else if (k === 'evade') { lean = -12; sink = 6; }
      else if (k === 'dash') { lean = 14; }
      else if (k === 'hurt') { lean = -10; sink = 4; }
      else if (k === 'stagger') { lean = -14; sink = 8; crouch = 6; }
      else if (k === 'H' || k === 'L' || k === 'T' || k === 'G' || k === 'B') {
        var w2 = a.win, tot2 = a.win + a.act;
        reach = t < w2 ? -0.4 * (t / w2) : (t < tot2 ? 1 : Math.max(0, 1 - (t - tot2) / a.rec));
        lean = reach * 10;
        ry = (k === 'L') ? -46 : (k === 'T' ? -70 : -96);
        if (k === 'G') { ry = -70; }
        if (k === 'B') { ry = -70; reach *= 1.2; }
      } else if (k === 'R') { lean = -12; }
    }
    var bobY = Math.sin(f.bob) * 2;
    var hipY = gy - 40 + sink + bobY, shY = gy - 84 + sink + crouch + bobY;
    var sx = x + lean * face;

    /* shadow */
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath(); ctx.ellipse(x, gy + 3, 24, 6, 0, 0, 6.3); ctx.fill();

    /* stance aura */
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(f.bob * 1.4);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, gy - 52, 32, f.bob * 0.6, f.bob * 0.6 + 2.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, gy - 52, 26, f.bob * -0.5 + 3, f.bob * -0.5 + 4.6); ctx.stroke();
    ctx.restore();

    var body = f.flash > 0.05 ? '#ffffff' : (isP ? '#dfe6f2' : '#c3ccdd');
    ctx.lineCap = 'round';
    /* legs */
    ctx.strokeStyle = body; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 2, hipY); ctx.lineTo(x - 13 - crouch * 0.5, gy);
    ctx.moveTo(x + 2, hipY); ctx.lineTo(x + 13 + crouch * 0.5, gy);
    ctx.stroke();
    /* torso */
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(sx, shY); ctx.stroke();
    /* head */
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(sx + face * 2, shY - 13, 9, 0, 6.3); ctx.fill();
    /* sash */
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = .85;
    ctx.beginPath();
    ctx.moveTo(sx - face * 4, shY + 4);
    ctx.quadraticCurveTo(x - face * 22, hipY + 4 + Math.sin(f.bob * 2) * 5, x - face * 34, hipY + 16 + Math.cos(f.bob * 1.7) * 6);
    ctx.stroke(); ctx.globalAlpha = 1;

    /* arms + blade */
    var ax = sx + face * (10 + 34 * Math.max(0, reach));
    var ay = gy + ry + sink + bobY * .5;
    ctx.strokeStyle = body; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx, shY + 4); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shY + 6); ctx.lineTo(sx - face * 12, shY + 20); ctx.stroke();

    /* ribbon blade */
    if (a && (a.kind === 'strike' || a.kind === 'burst' || a.kind === 'H' || a.kind === 'L' || a.kind === 'T' || a.kind === 'B')) {
      ctx.strokeStyle = col; ctx.lineWidth = (a.kind === 'burst' || a.kind === 'B') ? 5 : 3;
      ctx.globalAlpha = ph === 'active' ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ax + face * 26, ay - 12, ax + face * 40, ay + (ry < -70 ? 14 : -14));
      ctx.stroke();
      if (ph === 'active') {
        ctx.globalAlpha = .5; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(sx, shY, 46, face > 0 ? -0.9 : 2.2, face > 0 ? 0.9 : 4.1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    /* guard bracket */
    if (!isP) {
      var gyy = E.guard === 'high' ? gy - 96 : gy - 48;
      ctx.strokeStyle = 'rgba(160,190,255,.75)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 24, gyy - 8); ctx.lineTo(x - 30, gyy); ctx.lineTo(x - 24, gyy + 8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,190,255,.55)'; ctx.font = '8px ui-monospace,monospace'; ctx.textAlign = 'right';
      ctx.fillText('GUARD', x - 34, gyy + 3);
    }
    /* parry glow */
    if (a && a.kind === 'parry' && ph === 'active') {
      ctx.strokeStyle = '#dff0ff'; ctx.lineWidth = 3; ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.arc(x + face * 16, gy - 70, 22, -1.1, 1.1); ctx.stroke(); ctx.globalAlpha = 1;
    }
    /* float msg */
    if (f.msgT > 0 && f.lastMsg) {
      ctx.globalAlpha = Math.min(1, f.msgT / 300);
      ctx.fillStyle = isP ? '#9fe0ff' : '#ffd0c0';
      ctx.font = 'bold 11px ui-monospace,monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.lastMsg, x, gy - 118 - (700 - f.msgT) * 0.03);
      ctx.globalAlpha = 1;
    }
  }

  var TELLTXT = { H: 'HIGH', L: 'LOW', T: 'THRUST', G: 'GRAB', B: 'BURST ART', P: 'GUARD', R: 'STEP BACK', S: 'SHIFT' };
  function drawTell(x) {
    var a = E.act; if (!a) return;
    var txt = TELLTXT[a.kind]; if (!txt) return;
    var showing = (a.kind === 'P' || a.kind === 'R' || a.kind === 'S') ? true : (a.t < a.win);
    if (!showing) return;
    var w = 96, h = 30, bx = x - w / 2, by = groundY() - 172;
    bx = clamp(bx, 4, W - w - 4);
    var danger = a.kind === 'B' ? '#ff8a5a' : (a.kind === 'G' ? '#ffd76a' : '#9fd8ff');
    ctx.fillStyle = 'rgba(8,10,18,.85)'; ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = danger; ctx.lineWidth = 1.5; ctx.strokeRect(bx + .5, by + .5, w - 1, h - 1);
    ctx.fillStyle = danger; ctx.font = 'bold 12px ui-monospace,monospace'; ctx.textAlign = 'center';
    ctx.fillText(txt, bx + w / 2, by + 14);
    var pr = a.win > 0 ? clamp(a.t / a.win, 0, 1) : clamp(a.t / (a.act || 1), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(bx + 6, by + 20, w - 12, 5);
    ctx.fillStyle = danger; ctx.fillRect(bx + 6, by + 20, (w - 12) * pr, 5);
    ctx.beginPath(); ctx.moveTo(bx + w / 2 - 5, by + h); ctx.lineTo(bx + w / 2 + 5, by + h); ctx.lineTo(bx + w / 2, by + h + 7);
    ctx.fillStyle = 'rgba(8,10,18,.85)'; ctx.fill();
  }

  function drawHUD() {
    var pad = 8, bw = (W - pad * 3) / 2;
    /* names + hp */
    ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb0cc'; ctx.fillText('YOU', pad, 14);
    bar(pad, 18, bw, 9, P.hp / P.max, P.hp / P.max < 0.28 ? '#ff6a5a' : '#7fd4ff');
    ctx.fillStyle = STC[P.stance]; ctx.fillText(STN[P.stance], pad, 39);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb0cc'; ctx.fillText(M.name, W - pad - 52, 14);
    bar(pad * 2 + bw, 18, bw - 52, 9, E.hp / E.max, E.hp / E.max < 0.28 ? '#ff6a5a' : (M.hue || '#ff8a6a'));
    ctx.fillStyle = STC[E.stance]; ctx.fillText(STN[E.stance], W - pad - 52, 39);

    /* breath */
    ctx.textAlign = 'left'; ctx.fillStyle = '#8fa2c4'; ctx.fillText('BREATH', pad, 54);
    bar(pad + 46, 46, bw + 20, 8, P.breath / 100, P.breath >= BURST_COST ? '#ffd76a' : '#7f9dff');

    /* round pips */
    var cxp = W / 2;
    for (var i = 0; i < 2; i++) {
      ctx.fillStyle = i < G.rp ? '#7fd4ff' : '#242c40';
      ctx.beginPath(); ctx.arc(cxp - 26 + i * 12, 62, 4, 0, 6.3); ctx.fill();
      ctx.fillStyle = i < G.re ? '#ff8a6a' : '#242c40';
      ctx.beginPath(); ctx.arc(cxp + 26 - i * 12, 62, 4, 0, 6.3); ctx.fill();
    }
    ctx.fillStyle = '#c9d4e8'; ctx.font = 'bold 12px ui-monospace,monospace'; ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(G.time), cxp, 66);
    ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = '#6b7a96';
    ctx.fillText('RANK ' + SAVE.rank + '/8  ·  GATE ' + (G.mi + 1), cxp, 80);

    /* menu button */
    var r = menuRect();
    ctx.strokeStyle = '#2a3145'; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 10.5, r.y + 8.5, 27, 27);
    ctx.strokeStyle = '#8fa2c4'; ctx.lineWidth = 2;
    for (var j = 0; j < 3; j++) {
      ctx.beginPath(); ctx.moveTo(r.x + 16, r.y + 15 + j * 7); ctx.lineTo(r.x + 32, r.y + 15 + j * 7); ctx.stroke();
    }
  }

  function render() {
    ctx.save();
    if (G.shake > 0.2) ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
    /* sky */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0f1c'); g.addColorStop(0.55, '#131b2c'); g.addColorStop(1, '#080a12');
    ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, H + 60);
    /* moon */
    ctx.fillStyle = 'rgba(230,236,255,.10)';
    ctx.beginPath(); ctx.arc(W * 0.74, H * 0.20, 46, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(230,236,255,.16)';
    ctx.beginPath(); ctx.arc(W * 0.74, H * 0.20, 34, 0, 6.3); ctx.fill();
    /* bamboo */
    var gy = groundY();
    for (var i = 0; i < bamboo.length; i++) {
      var b = bamboo[i];
      var sway = Math.sin(perf * 0.0006 + b.ph) * 6 * b.d;
      ctx.strokeStyle = 'rgba(70,92,120,' + (0.16 + b.d * 0.22) + ')';
      ctx.lineWidth = b.w;
      ctx.beginPath(); ctx.moveTo(b.x, gy + 8);
      ctx.quadraticCurveTo(b.x + sway * .5, gy - H * b.h * .5, b.x + sway, gy - H * b.h);
      ctx.stroke();
    }
    /* ground */
    ctx.fillStyle = '#0d1220'; ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = 'rgba(140,170,210,.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, gy + .5); ctx.lineTo(W, gy + .5); ctx.stroke();
    for (var q = 0; q < 5; q++) {
      ctx.strokeStyle = 'rgba(120,150,190,.06)';
      ctx.beginPath(); ctx.moveTo(0, gy + 14 + q * 16); ctx.lineTo(W, gy + 14 + q * 16); ctx.stroke();
    }

    /* mist particles behind */
    for (var m = 0; m < parts.length; m++) {
      var p = parts[m];
      if (p.k !== 'mist') continue;
      ctx.globalAlpha = (p.l / p.m) * 0.5; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s * 2, p.s * .7, 0, 0, 6.3); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (P && E && M) {
      drawFighter(P, posP(), true);
      drawFighter(E, posE(), false);
      drawTell(posE());
      drawHUD();
    }

    /* fg particles */
    for (var n = 0; n < parts.length; n++) {
      var q2 = parts[n];
      if (q2.k === 'mist') continue;
      var al = clamp(q2.l / q2.m, 0, 1);
      ctx.globalAlpha = al;
      if (q2.k === 'ring') {
        ctx.strokeStyle = q2.c; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(q2.x, q2.y, q2.s + (1 - al) * 34, 0, 6.3); ctx.stroke();
      } else {
        ctx.fillStyle = q2.c;
        ctx.fillRect(q2.x - q2.s / 2, q2.y - q2.s / 2, q2.s, q2.s);
      }
    }
    ctx.globalAlpha = 1;

    /* banner */
    if (G.bannerT > 0 && G.banner) {
      var al2 = Math.min(1, G.bannerT / 260);
      ctx.globalAlpha = al2;
      ctx.fillStyle = 'rgba(6,8,14,.55)'; ctx.fillRect(0, H * 0.36, W, 62);
      ctx.fillStyle = '#f2f4fa'; ctx.font = 'bold 20px ui-monospace,monospace'; ctx.textAlign = 'center';
      ctx.fillText(G.banner, W / 2, H * 0.36 + 30);
      if (G.sub) { ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = '#9fb0cc'; ctx.fillText(G.sub, W / 2, H * 0.36 + 48); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (G.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.7, G.flash); ctx.fillStyle = G.flashC;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }

  /* ---------- loop ---------- */
  var last = 0, perf = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = ts - last; last = ts;
    if (dt > 50) dt = 50;
    if (dt < 0) dt = 0;
    perf = ts;
    update(dt);
    render();
  }

  /* ---------- boot ---------- */
  resize();
  M = MASTERS[Math.min(SAVE.rank, MASTERS.length - 1)];
  P = mkP(); E = mkE(M);
  buildLadder();
  requestAnimationFrame(frame);
})();
