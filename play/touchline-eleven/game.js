(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var W = 390, H = 700, cssW = W, cssH = H, pxScale = 1, viewScale = 1, viewX = 0, viewY = 0;
  var field = { l: 24, r: 366, t: 116, b: 588, mid: 352 };
  var state = 'menu';
  var previous = performance.now();
  var blockedByOrientation = false;
  var match = null;
  var pendingTimeouts = new Set();
  var activePointers = new Map();
  var controlPointers = { stick: null, pass: null, shoot: null, switch: null, gesture: null };
  var keys = new Set();
  var particles = [], texts = [], sparks = [];
  var shake = 0, flash = 0;
  var audio = null;

  var SQUAD_NAMES = [
    ['Northstar Rovers', 'park', 'A compact wall that waits for one clean break.'],
    ['Aero Borough', 'wing', 'Fast wide runners stretch every blade of grass.'],
    ['Redline Union', 'press', 'Five shirts, one swarm, no quiet first touch.'],
    ['Copper Vale', 'wing', 'Early crosses and late midfield arrivals.'],
    ['Night Orchard', 'park', 'Patient, narrow, and prickly near the box.'],
    ['Signal Athletic', 'press', 'The tempo never leaves the red zone.'],
    ['Morrow City', 'wing', 'A final seeded test with two-way fullbacks.']
  ];
  var FIRST_NAMES = ['Rook', 'Mica', 'Juniper', 'Bramble', 'Kite', 'Sable', 'Nix', 'Tern', 'Pollen', 'Cobalt', 'Vela', 'Moss', 'Quill', 'Lumen', 'Fable', 'Twill'];
  var ROLES = ['GK', 'DF', 'DF', 'MF', 'FW', 'MF', 'DF', 'FW', 'MF', 'FW', 'DF', 'MF', 'FW', 'DF'];

  var saveData = loadSave();
  var roster = makeRoster(saveData.roster);
  var selected = saveData.selected.slice();
  var selectedSet = new Set(selected);
  var lineupMessage = 'Pick five fresh legs for the next fixture.';
  var menuPulse = 0;
  var hitAreas = {};

  selected = selected.filter(function (i) { return Number.isInteger(i) && i >= 0 && i < roster.length; }).slice(0, 5);
  while (selected.length < 5) {
    var nextPick = selected.length;
    if (!selected.includes(nextPick) && nextPick < roster.length) selected.push(nextPick); else break;
  }
  selectedSet = new Set(selected);
  saveData.selected = selected.slice();

  var COLORS = {
    ink: '#d7f7e8', muted: '#86a69c', panel: '#10262a', panel2: '#153238',
    mint: '#8df1bc', lime: '#d8f36b', coral: '#ff786d', yellow: '#ffd166',
    blue: '#42b5ff', blueDark: '#1765a1', red: '#ff5e73', redDark: '#8d2c48',
    grass: '#164f45', grass2: '#1b5b4d', line: '#9ce0b3'
  };

  function finiteNumber(value, fallback, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (Number.isFinite(max)) n = Math.min(max, n);
    return n;
  }

  function defaultSave() {
    return { cup: 1, fixture: 0, wins: 0, trophies: [], roster: [], selected: [0, 1, 2, 3, 4], history: [] };
  }

  function loadSave() {
    var base = defaultSave();
    try {
      var raw = localStorage.getItem('touchline-eleven-save');
      if (!raw) return base;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return base;
      base.cup = Math.floor(finiteNumber(data.cup, 1, 1, 99));
      base.fixture = Math.floor(finiteNumber(data.fixture, 0, 0, 6));
      base.wins = Math.floor(finiteNumber(data.wins, 0, 0, 99));
      if (Array.isArray(data.trophies)) base.trophies = data.trophies.filter(function (t) { return typeof t === 'string'; }).slice(-32);
      if (Array.isArray(data.roster)) base.roster = data.roster.filter(function (p) { return p && typeof p === 'object' && typeof p.name === 'string'; }).slice(0, 14);
      if (Array.isArray(data.selected)) base.selected = data.selected.filter(function (n) { return Number.isInteger(n) && n >= 0 && n < 14; }).slice(0, 5);
      if (Array.isArray(data.history)) base.history = data.history.filter(function (h) { return h && typeof h === 'object'; }).slice(-7);
      if (base.selected.length !== 5) base.selected = [0, 1, 2, 3, 4];
    } catch (e) { return defaultSave(); }
    return base;
  }

  function save() {
    var safe = {
      cup: Math.floor(finiteNumber(saveData.cup, 1, 1, 99)),
      fixture: Math.floor(finiteNumber(saveData.fixture, 0, 0, 6)),
      wins: Math.floor(finiteNumber(saveData.wins, 0, 0, 99)),
      trophies: saveData.trophies.filter(function (t) { return typeof t === 'string'; }).slice(-32),
      roster: roster.slice(0, 14).map(function (p) { return { name: p.name, role: p.role, pace: p.pace, nerve: p.nerve, stamina: p.stamina }; }),
      selected: selected.slice(0, 5),
      history: saveData.history.slice(-7)
    };
    try { localStorage.setItem('touchline-eleven-save', JSON.stringify(safe)); } catch (e) {}
  }

  function makeRoster(saved) {
    var list = [];
    for (var i = 0; i < 14; i++) {
      var p = saved && saved[i];
      list.push({
        id: i,
        name: p && typeof p.name === 'string' ? p.name.slice(0, 16) : FIRST_NAMES[i],
        role: p && typeof p.role === 'string' ? p.role.slice(0, 3) : ROLES[i],
        pace: finiteNumber(p && p.pace, 0.85 + (i % 4) * 0.05, 0.75, 1.2),
        nerve: finiteNumber(p && p.nerve, 0.86 + ((i + 2) % 3) * 0.06, 0.72, 1.2),
        stamina: finiteNumber(p && p.stamina, 1, 0.25, 1)
      });
    }
    return list.slice(0, Math.max(8, Math.min(14, saved && saved.length ? saved.length : 8)));
  }

  function later(fn, ms) {
    var id = setTimeout(function () { pendingTimeouts.delete(id); fn(); }, ms);
    pendingTimeouts.add(id);
    return id;
  }

  function cancelPendingTimeouts() {
    pendingTimeouts.forEach(function (id) { clearTimeout(id); });
    pendingTimeouts.clear();
  }

  function resetInputs() {
    activePointers.clear();
    controlPointers.stick = controlPointers.pass = controlPointers.shoot = controlPointers.switch = controlPointers.gesture = null;
    keys.clear();
    if (match) { match.stick.x = 0; match.stick.y = 0; match.drag = null; }
  }

  function unlockAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume().catch(function () {});
  }

  function tone(freq, duration, type, volume) {
    if (!audio) return;
    try {
      var osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type || 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume || 0.04, audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration + 0.02);
    } catch (e) {}
  }

  function sound(kind) {
    if (kind === 'kick') tone(130, 0.08, 'triangle', 0.08);
    else if (kind === 'pass') tone(310, 0.1, 'sine', 0.045);
    else if (kind === 'tackle') { tone(92, 0.07, 'square', 0.05); tone(170, 0.06, 'triangle', 0.03); }
    else if (kind === 'goal') { tone(400, 0.12, 'sine', 0.06); tone(560, 0.16, 'sine', 0.035); }
    else if (kind === 'ui') tone(520, 0.05, 'sine', 0.025);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function norm(x, y) { var l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function selectedPlayers() { return selected.map(function (i) { return roster[i]; }).filter(Boolean); }

  function makePlayers() {
    var chosen = selectedPlayers();
    while (chosen.length < 5) { if (!roster[chosen.length]) break; chosen.push(roster[chosen.length]); }
    var ownSlots = [{ x: 195, y: 536 }, { x: 111, y: 487 }, { x: 278, y: 487 }, { x: 150, y: 420 }, { x: 240, y: 420 }];
    var oppSlots = [{ x: 195, y: 168 }, { x: 111, y: 216 }, { x: 278, y: 216 }, { x: 150, y: 285 }, { x: 240, y: 285 }];
    var own = chosen.slice(0, 5).map(function (p, i) {
      return { id: p.id, name: p.name, role: p.role, team: 'own', x: ownSlots[i].x, y: ownSlots[i].y, homeX: ownSlots[i].x, homeY: ownSlots[i].y, vx: 0, vy: 0, stamina: p.stamina, pace: p.pace, nerve: p.nerve, cooldown: 0, active: i === 0 };
    });
    var opp = oppSlots.map(function (pos, i) {
      return { id: 100 + i, name: ['Vale', 'Ibis', 'Rime', 'Silo', 'Pike'][i], role: ['GK', 'DF', 'DF', 'MF', 'FW'][i], team: 'opp', x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, vx: 0, vy: 0, stamina: 1, pace: 0.84 + i * 0.035, nerve: 0.82 + i * 0.04, cooldown: 0, active: false };
    });
    return { own: own, opp: opp };
  }

  function makeMatch() {
    var squad = SQUAD_NAMES[saveData.fixture % SQUAD_NAMES.length];
    var players = makePlayers();
    return {
      clock: 180, ownScore: 0, oppScore: 0, paused: false, ended: false,
      fixture: saveData.fixture, cup: saveData.cup, squad: squad[0], style: squad[1], styleNote: squad[2],
      difficulty: 0.84 + saveData.cup * 0.045 + saveData.fixture * 0.018,
      own: players.own, opp: players.opp, active: 0, possession: 'own', carrier: 4,
      ball: { x: 195, y: 420, vx: 0, vy: 0, owner: 'own', ownerIndex: 4, spin: 0, trail: [] },
      kickCooldown: 0, aiCooldown: rand(1, 2), restartDelay: 0, banner: 'KICKOFF', bannerTime: 1.8,
      lastAction: 'Move your selected player into the play.', stick: { x: 0, y: 0 }, drag: null,
      substitutions: 0, scoreFlash: 0
    };
  }

  function startMatch() {
    resetInputs(); cancelPendingTimeouts(); match = makeMatch(); state = 'match'; sound('ui');
  }

  function newCup() {
    cancelPendingTimeouts(); resetInputs();
    saveData.fixture = 0; saveData.wins = 0; saveData.history = [];
    selected = [0, 1, 2, 3, 4].filter(function (n) { return n < roster.length; });
    while (selected.length < 5) selected.push(selected.length);
    selectedSet = new Set(selected); save(); state = 'lineup'; lineupMessage = 'New cup ready. Set your starting five.'; sound('ui');
  }

  function replayMatch() { cancelPendingTimeouts(); resetInputs(); match = makeMatch(); state = 'match'; sound('ui'); }

  function recordMatchStamina() {
    var used = new Set(selected);
    roster.forEach(function (p) {
      if (used.has(p.id)) {
        var played = match && match.own.find(function (q) { return q.id === p.id; });
        p.stamina = clamp(played ? played.stamina : p.stamina, 0.25, 1);
      } else p.stamina = clamp(p.stamina + 0.18, 0.35, 1);
    });
  }

  function finishMatch() {
    if (!match || match.ended) return;
    match.ended = true; cancelPendingTimeouts(); resetInputs();
    recordMatchStamina();
    var win = match.ownScore > match.oppScore;
    var draw = match.ownScore === match.oppScore;
    if (win) {
      saveData.wins++;
      saveData.history.push({ cup: saveData.cup, fixture: saveData.fixture, own: match.ownScore, opp: match.oppScore });
      saveData.history = saveData.history.slice(-7);
      saveData.fixture++;
      if (saveData.fixture >= 7) {
        saveData.trophies.push('Cup ' + saveData.cup + ' · ' + new Date().toISOString().slice(0, 10));
        saveData.trophies = saveData.trophies.slice(-32);
        saveData.cup = Math.min(99, saveData.cup + 1); saveData.fixture = 0; saveData.wins = 0;
        for (var i = 0; i < 2 && roster.length < 14; i++) {
          var id = roster.length;
          roster.push({ id: id, name: FIRST_NAMES[id], role: ROLES[id], pace: 0.92 + (id % 3) * 0.04, nerve: 0.95, stamina: 1 });
        }
        save(); state = 'trophy'; sound('goal'); shake = 8; flash = 1;
      } else {
        save(); lineupMessage = 'Win secured. Rotate tired legs before fixture ' + (saveData.fixture + 1) + '.'; state = 'lineup'; sound('goal');
      }
    } else {
      saveData.history.push({ cup: saveData.cup, fixture: saveData.fixture, own: match.ownScore, opp: match.oppScore });
      saveData.history = saveData.history.slice(-7); save(); state = 'loss'; sound('tackle'); shake = 6;
    }
    if (draw) lineupMessage = 'A level score is a replay. Find the opening.';
  }

  function update(dt) {
    menuPulse += dt; shake = Math.max(0, shake - dt * 18); flash = Math.max(0, flash - dt * 2.5);
    updateParticles(dt); updateTexts(dt);
    if (state !== 'match' || !match || match.ended) return;
    if (match.bannerTime > 0) match.bannerTime -= dt;
    match.scoreFlash = Math.max(0, match.scoreFlash - dt);
    match.kickCooldown = Math.max(0, match.kickCooldown - dt);
    match.aiCooldown = Math.max(0, match.aiCooldown - dt);
    match.clock = Math.max(0, match.clock - dt);
    if (match.restartDelay > 0) {
      match.restartDelay = Math.max(0, match.restartDelay - dt);
      if (match.restartDelay === 0 && !match.ended) {
        match.ball.owner = 'own'; match.ball.ownerIndex = match.own[4].id; match.ball.x = match.own[4].x; match.ball.y = match.own[4].y - 13;
      }
    }
    updateStickFromKeys();
    updatePlayers(dt);
    updateBall(dt);
    if (match.clock <= 0) finishMatch();
  }

  function updateStickFromKeys() {
    var x = 0, y = 0;
    if (keys.has('ArrowLeft')) x -= 1; if (keys.has('ArrowRight')) x += 1;
    if (keys.has('ArrowUp')) y -= 1; if (keys.has('ArrowDown')) y += 1;
    if (x || y) match.stick = norm(x, y); else if (controlPointers.stick === null) match.stick = { x: 0, y: 0 };
  }

  function updatePlayers(dt) {
    var m = match, active = m.own[m.active], all = m.own.concat(m.opp);
    m.own.forEach(function (p, i) {
      p.cooldown = Math.max(0, p.cooldown - dt); p.stamina = clamp(p.stamina - dt * (i === m.active ? 0.0008 : 0.00025), 0.35, 1);
      var targetX = p.homeX, targetY = p.homeY;
      if (p.id === m.ball.ownerIndex && m.ball.owner === 'own') { targetX = m.ball.x; targetY = m.ball.y; }
      else if (i === m.active) { targetX += m.stick.x * 70; targetY += m.stick.y * 70; }
      else { targetX += clamp((m.ball.x - 195) * 0.16, -32, 32); targetY += clamp((m.ball.y - 352) * 0.11, -28, 28); }
      targetX = clamp(targetX, field.l + 18, field.r - 18); targetY = clamp(targetY, field.mid + 12, field.b - 18);
      moveToward(p, targetX, targetY, (p.pace * 72 + 20) * dt);
    });
    var style = m.style;
    m.opp.forEach(function (p, i) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      var targetX = p.homeX, targetY = p.homeY;
      if (m.ball.owner === 'opp' && m.ball.ownerIndex === p.id) { targetX = m.ball.x; targetY = m.ball.y; }
      else if (style === 'press') { targetX = clamp(m.ball.x + (i - 2) * 14, field.l + 16, field.r - 16); targetY = clamp(m.ball.y - 78 + i * 18, field.t + 22, field.mid - 12); }
      else if (style === 'wing') { targetX = clamp((i === 1 || i === 4) ? (i === 1 ? field.l + 22 : field.r - 22) : m.ball.x, field.l + 16, field.r - 16); targetY = clamp(m.ball.y - 48 + i * 14, field.t + 18, field.mid - 12); }
      else { targetX += clamp((m.ball.x - 195) * 0.24, -30, 30); targetY += clamp((m.ball.y - 170) * 0.06, -14, 20); }
      if (m.ball.owner === 'own' && dist(p, m.ball) < (style === 'press' ? 45 : 34) && p.cooldown <= 0) trySteal(p);
      if (m.ball.owner === 'opp' && m.ball.ownerIndex === p.id && p.cooldown <= 0 && m.ball.y > field.b - 140) {
        aiKick(p, true);
      }
      targetX = clamp(targetX, field.l + 16, field.r - 16); targetY = clamp(targetY, field.t + 18, field.mid - 12);
      moveToward(p, targetX, targetY, (p.pace * 58 + 18) * dt);
    });
    if (m.ball.owner === 'own') {
      var carrier = m.own.find(function (p) { return p.id === m.ball.ownerIndex; });
      if (carrier) { m.ball.x = carrier.x; m.ball.y = carrier.y - 13; m.ball.vx = carrier.vx; m.ball.vy = carrier.vy; }
    } else if (m.ball.owner === 'opp') {
      var oc = m.opp.find(function (p) { return p.id === m.ball.ownerIndex; });
      if (oc) { m.ball.x = oc.x; m.ball.y = oc.y + 13; m.ball.vx = oc.vx; m.ball.vy = oc.vy; }
    }
    if (active && active.stamina < 0.42) addText(active.x, active.y - 28, 'TIRED', COLORS.yellow, 0.8);
  }

  function moveToward(p, tx, ty, step) {
    var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 0.5) { var n = norm(dx, dy); p.vx = n.x * Math.min(d, step) / 0.016; p.vy = n.y * Math.min(d, step) / 0.016; p.x += n.x * Math.min(d, step); p.y += n.y * Math.min(d, step); }
    else { p.vx *= 0.8; p.vy *= 0.8; }
  }

  function updateBall(dt) {
    var b = match.ball;
    if (b.owner) return;
    b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= Math.pow(0.25, dt); b.vy *= Math.pow(0.25, dt); b.spin += dt * 5;
    b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 9) b.trail.shift();
    if (b.x < field.l + 8 || b.x > field.r - 8) { b.x = clamp(b.x, field.l + 8, field.r - 8); b.vx *= -0.75; }
    if (b.y < field.t + 6) { if (b.x > 146 && b.x < 244) scoreGoal('own'); else { b.y = field.t + 6; b.vy *= -0.72; } }
    if (b.y > field.b - 6) { if (b.x > 146 && b.x < 244) scoreGoal('opp'); else { b.y = field.b - 6; b.vy *= -0.72; } }
    if (Math.hypot(b.vx, b.vy) < 12) {
      var candidates = match.own.concat(match.opp).filter(function (p) { return dist(p, b) < 18; });
      if (candidates.length) { var p = candidates[0]; b.owner = p.team; b.ownerIndex = p.id; match.possession = p.team; addBurst(b.x, b.y, p.team === 'own' ? COLORS.blue : COLORS.red, 5); }
    }
  }

  function scoreGoal(team) {
    if (match.scoreFlash > 0) return;
    if (team === 'own') match.ownScore++; else match.oppScore++;
    match.scoreFlash = 1.1; match.banner = team === 'own' ? 'GOAL!  NICE FINISH' : 'CAUGHT ON THE BREAK'; match.bannerTime = 1.5; shake = 11; flash = 0.9;
    addBurst(195, team === 'own' ? field.t + 14 : field.b - 14, team === 'own' ? COLORS.blue : COLORS.red, 28); sound(team === 'own' ? 'goal' : 'tackle');
    match.ball.owner = null; match.ball.ownerIndex = null; match.ball.x = 195; match.ball.y = 352; match.ball.vx = 0; match.ball.vy = 0;
    match.possession = team === 'own' ? 'opp' : 'own';
    match.restartDelay = 0.7;
  }

  function passBall(vx, vy, curve) {
    if (!match || match.kickCooldown > 0 || match.ball.owner !== 'own') return;
    var carrier = match.own.find(function (p) { return p.id === match.ball.ownerIndex; });
    if (!carrier) return;
    var n = norm(vx, vy); var target = findPassTarget(carrier, n);
    match.ball.owner = null; match.ball.ownerIndex = null; match.ball.x = carrier.x; match.ball.y = carrier.y - 13;
    match.ball.vx = n.x * 240 + (target.x - carrier.x) * 0.55; match.ball.vy = n.y * 240 + (target.y - carrier.y) * 0.55;
    match.ball.spin = curve || 0; match.kickCooldown = 0.22; match.lastAction = 'PASS LANE  ·  bend the next one'; carrier.cooldown = 0.25; addBurst(carrier.x, carrier.y - 10, COLORS.mint, 9); sound('pass');
  }

  function shootBall(vx, vy, curve) {
    if (!match || match.kickCooldown > 0 || match.ball.owner !== 'own') return;
    var carrier = match.own.find(function (p) { return p.id === match.ball.ownerIndex; });
    if (!carrier) return;
    var n = norm(vx, vy); if (n.y > -0.12) n.y = -0.72;
    n = norm(n.x, n.y); match.ball.owner = null; match.ball.ownerIndex = null; match.ball.x = carrier.x; match.ball.y = carrier.y - 13;
    var power = 350 + carrier.nerve * 50; match.ball.vx = n.x * power; match.ball.vy = n.y * power; match.ball.spin = (curve || 0) * 1.8;
    match.kickCooldown = 0.38; match.lastAction = 'SHOT  ·  curve follows your swipe'; carrier.cooldown = 0.45; addBurst(carrier.x, carrier.y - 12, COLORS.yellow, 12); sound('kick'); shake = 2;
  }

  function findPassTarget(carrier, n) {
    var candidates = match.own.filter(function (p) { return p !== carrier; });
    var best = candidates[0], score = -Infinity;
    candidates.forEach(function (p) { var d = norm(p.x - carrier.x, p.y - carrier.y); var s = d.x * n.x + d.y * n.y - dist(p, carrier) / 500; if (s > score) { score = s; best = p; } });
    return best || carrier;
  }

  function aiKick(player, urgent) {
    if (!match || match.ball.owner !== 'opp') return;
    var target = match.style === 'wing' ? (player.x < 195 ? field.l + 58 : field.r - 58) : 195;
    var n = norm(target - player.x, field.b + 50 - player.y);
    match.ball.owner = null; match.ball.ownerIndex = null; match.ball.x = player.x; match.ball.y = player.y + 13;
    if (urgent || Math.random() < 0.36 + saveData.cup * 0.03) { match.ball.vx = n.x * (205 + match.difficulty * 25); match.ball.vy = n.y * (205 + match.difficulty * 25); match.lastAction = 'THEIR BREAK IS ON'; }
    else { match.ball.vx = (Math.random() - 0.5) * 180; match.ball.vy = 150; match.lastAction = 'WIN IT BACK'; }
    player.cooldown = 1.1; addBurst(player.x, player.y + 10, COLORS.red, 7); sound('kick');
  }

  function trySteal(defender) {
    if (!match || match.ball.owner !== 'own' || !defender) return;
    var carrier = match.own.find(function (p) { return p.id === match.ball.ownerIndex; });
    if (!carrier || dist(defender, carrier) > 43) return;
    if (Math.random() < 0.4) { match.ball.owner = 'opp'; match.ball.ownerIndex = defender.id; match.possession = 'opp'; addBurst(defender.x, defender.y, COLORS.red, 8); }
  }

  function tackle() {
    if (!match) return;
    var p = match.own[match.active];
    if (!p) return;
    var target = match.opp.reduce(function (best, q) { return !best || dist(p, q) < dist(p, best) ? q : best; }, null);
    if (target && dist(p, target) < 48) {
      if (match.ball.owner === 'opp' && match.ball.ownerIndex === target.id) { match.ball.owner = 'own'; match.ball.ownerIndex = p.id; match.possession = 'own'; match.lastAction = 'CLEAN TACKLE'; addBurst(target.x, target.y, COLORS.mint, 14); sound('tackle'); shake = 3; }
      else { target.x += (target.x - p.x) * 0.35; target.y += (target.y - p.y) * 0.35; addBurst(p.x, p.y, COLORS.yellow, 6); sound('tackle'); }
    }
  }

  function switchDefender(x, y) {
    if (!match) return;
    var target = null;
    if (Number.isFinite(x)) target = match.own.reduce(function (best, p) { return !best || dist({ x: x, y: y }, p) < dist({ x: x, y: y }, best) ? p : best; }, null);
    if (target) { match.active = match.own.indexOf(target); match.own.forEach(function (p, i) { p.active = i === match.active; }); match.lastAction = target.name + ' selected'; }
    tackle();
  }

  function actionDirection() {
    var x = 0, y = -1;
    if (keys.has('ArrowLeft')) x -= 1; if (keys.has('ArrowRight')) x += 1; if (keys.has('ArrowDown')) y += 1;
    if (x || y !== -1) return norm(x, y);
    return { x: 0, y: -1 };
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: clamp(((e.clientX - rect.left) - viewX) / viewScale, 0, W), y: clamp(((e.clientY - rect.top) - viewY) / viewScale, 0, H) };
  }

  function inRect(p, r) { return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function setControl(name, id) { if (controlPointers[name] === null) { controlPointers[name] = id; return true; } return false; }
  function releaseControl(id) { Object.keys(controlPointers).forEach(function (k) { if (controlPointers[k] === id) controlPointers[k] = null; }); }

  function onPointerDown(e) {
    e.preventDefault(); unlockAudio();
    if (blockedByOrientation || document.hidden) return;
    var p = pointerPos(e); activePointers.set(e.pointerId, { x: p.x, y: p.y, points: [{ x: p.x, y: p.y }], mode: null });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (state === 'match' && match) {
      if (inRect(p, hitAreas.stick) && setControl('stick', e.pointerId)) { activePointers.get(e.pointerId).mode = 'stick'; updateStick(p); return; }
      if (inRect(p, hitAreas.pass) && setControl('pass', e.pointerId)) { activePointers.get(e.pointerId).mode = 'pass'; return; }
      if (inRect(p, hitAreas.shoot) && setControl('shoot', e.pointerId)) { activePointers.get(e.pointerId).mode = 'shoot'; return; }
      if (inRect(p, hitAreas.switch) && setControl('switch', e.pointerId)) { activePointers.get(e.pointerId).mode = 'switch'; return; }
      if (p.y >= field.t && p.y <= field.b && setControl('gesture', e.pointerId)) {
        var carrier = match.own.find(function (q) { return q.id === match.ball.ownerIndex; });
        if (carrier && dist(p, carrier) < 64) { activePointers.get(e.pointerId).mode = 'gesture'; match.drag = { start: p, points: [{ x: p.x, y: p.y }] }; }
        else { activePointers.get(e.pointerId).mode = 'defender'; }
      }
    } else { activePointers.get(e.pointerId).mode = 'ui'; }
  }

  function updateStick(p) {
    if (!match) return;
    var c = { x: 64, y: 650 }, v = norm(p.x - c.x, p.y - c.y), d = clamp(Math.hypot(p.x - c.x, p.y - c.y) / 44, 0, 1);
    match.stick = { x: v.x * d, y: v.y * d };
  }

  function onPointerMove(e) {
    e.preventDefault(); var rec = activePointers.get(e.pointerId); if (!rec || blockedByOrientation || document.hidden) return; var p = pointerPos(e);
    if (rec.points.length < 20) rec.points.push({ x: p.x, y: p.y });
    if (rec.mode === 'stick') updateStick(p);
    if (rec.mode === 'gesture' && match && match.drag) match.drag.points = rec.points.slice(-20);
  }

  function onPointerUp(e, cancelled) {
    e.preventDefault(); var rec = activePointers.get(e.pointerId); if (!rec) return; var p = pointerPos(e);
    activePointers.delete(e.pointerId); releaseControl(e.pointerId);
    if (cancelled || blockedByOrientation || document.hidden) { if (rec.mode === 'stick' && match) match.stick = { x: 0, y: 0 }; if (match) match.drag = null; return; }
    if (state === 'match' && match) {
      if (rec.mode === 'pass') passBall(actionDirection().x, actionDirection().y, 0);
      else if (rec.mode === 'shoot') shootBall(0, -1, 0);
      else if (rec.mode === 'switch') switchDefender(match.ball.x, match.ball.y);
      else if (rec.mode === 'stick') match.stick = { x: 0, y: 0 };
      else if (rec.mode === 'gesture') {
        var start = rec.points[0], dx = p.x - start.x, dy = p.y - start.y, len = Math.hypot(dx, dy);
        var curve = rec.points.reduce(function (acc, q, i) { if (!i) return acc; var prev = rec.points[i - 1]; return acc + (q.x - prev.x) * (q.y - start.y) - (q.y - prev.y) * (q.x - start.x); }, 0) / 5000;
        if (len > 18) { if (dy < -22 && Math.abs(dy) > Math.abs(dx) * 0.45) shootBall(dx, dy, clamp(curve, -1, 1)); else passBall(dx, dy, clamp(curve, -1, 1)); }
        else { switchDefender(p.x, p.y); }
        match.drag = null;
      } else if (rec.mode === 'defender') switchDefender(p.x, p.y);
    } else handleUiTap(p);
  }

  function handleUiTap(p) {
    var area = Object.keys(hitAreas).find(function (key) { return key !== 'stick' && key !== 'pass' && key !== 'shoot' && inRect(p, hitAreas[key]); });
    if (area === 'start') { if (state === 'menu') state = 'lineup'; else if (state === 'loss') replayMatch(); else if (state === 'trophy') newCup(); sound('ui'); }
    else if (area === 'fixture') { if (state === 'lineup' && selected.length === 5) startMatch(); }
    else if (area && area.indexOf('player-') === 0) togglePlayer(Number(area.slice(7)));
  }

  function togglePlayer(index) {
    if (index < 0 || index >= roster.length) return;
    if (selectedSet.has(index)) { if (selected.length <= 5) return; selected = selected.filter(function (n) { return n !== index; }); selectedSet.delete(index); }
    else if (selected.length < 5) { selected.push(index); selectedSet.add(index); }
    save(); sound('ui');
  }

  function keyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'k', 'J', 'K', ' '].indexOf(e.key) >= 0) e.preventDefault();
    if (blockedByOrientation || document.hidden) return;
    unlockAudio();
    if (e.key === 'j' || e.key === 'J') { keys.add('j'); if (state === 'match') passBall(actionDirection().x, actionDirection().y, 0); }
    else if (e.key === 'k' || e.key === 'K') { keys.add('k'); if (state === 'match') shootBall(actionDirection().x, actionDirection().y, 0); }
    else if (e.key === ' ') { if (state === 'match') tackle(); else { var target = state === 'lineup' ? hitAreas.fixture : hitAreas.start; if (target) handleUiTap({ x: target.x + target.w / 2, y: target.y + target.h / 2 }); } }
    else keys.add(e.key);
  }

  function keyUp(e) { keys.delete(e.key); }

  function draw() {
    ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
    ctx.fillStyle = '#091217'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.setTransform(pxScale * viewScale, 0, 0, pxScale * viewScale, pxScale * viewX, pxScale * viewY);
    var sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save(); ctx.translate(sx, sy); drawScene(); ctx.restore();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,245,201,' + Math.min(0.22, flash * 0.18) + ')'; ctx.fillRect(0, 0, W, H); }
    if (blockedByOrientation) drawRotateOverlay();
  }

  function drawScene() {
    hitAreas = {};
    ctx.fillStyle = '#091217'; ctx.fillRect(0, 0, W, H);
    if (state === 'menu') drawMenu();
    else if (state === 'lineup') drawLineup();
    else if (state === 'match') drawMatch();
    else if (state === 'loss') drawResult(false);
    else if (state === 'trophy') drawResult(true);
    drawParticles(); drawTexts();
  }

  function text(str, x, y, size, color, align, weight) {
    ctx.fillStyle = color || COLORS.ink; ctx.font = (weight || 600) + ' ' + (size || 14) + 'px system-ui, sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
  }
  function roundedPath(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function roundRect(x, y, w, h, r, fill, stroke) {
    roundedPath(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function pill(label, x, y, w, color) { roundRect(x, y, w, 27, 13, color || COLORS.panel2); text(label, x + w / 2, y + 14, 11, COLORS.ink, 'center', 750); }

  function drawHeader(title, kicker) {
    text(kicker || 'TOUCHLINE ELEVEN', 24, 25, 11, COLORS.mint, 'left', 800); text(title, 24, 54, 25, COLORS.ink, 'left', 800);
    ctx.strokeStyle = '#1d3b3c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(24, 80); ctx.lineTo(366, 80); ctx.stroke();
  }

  function drawMenu() {
    drawHeader('A pocket cup built for one thumb.', 'TOUCHLINE ELEVEN  /  CUP ' + saveData.cup);
    text('5-A-SIDE ARCADE FOOTBALL', 24, 118, 12, COLORS.yellow, 'left', 800);
    roundRect(24, 150, 342, 178, 18, COLORS.panel, '#214447');
    text('YOUR CLUB', 45, 180, 11, COLORS.muted, 'left', 800); text('Lantern Athletic', 45, 211, 28, COLORS.ink, 'left', 800);
    text('7 MATCHES  ·  3 MINUTES  ·  NO PACKS', 45, 248, 12, COLORS.lime, 'left', 750);
    text('Wins add new players. Trophies stay on this device.', 45, 281, 12, COLORS.muted, 'left', 550);
    for (var i = 0; i < 5; i++) drawMiniPlayer(70 + i * 59, 365, i, i === 0 ? COLORS.blue : COLORS.mint);
    text('A clean, free football loop.', 195, 425, 15, COLORS.ink, 'center', 700);
    hitAreas.start = { x: 62, y: 470, w: 266, h: 72 };
    roundRect(62, 470, 266, 72, 18, COLORS.mint); text('TAP TO PLAY', 195, 501, 19, '#09201e', 'center', 900); text('first tap also wakes the stadium', 195, 526, 11, '#1a5345', 'center', 650);
    text(saveData.trophies.length ? saveData.trophies.length + ' TROPH' + (saveData.trophies.length === 1 ? 'Y' : 'IES') + ' EARNED' : 'NO TROPHIES YET  ·  YOUR RUN STARTS HERE', 195, 581, 11, COLORS.muted, 'center', 750);
    text('Drag • swipe • tap • arrows + J/K', 195, 644, 13, COLORS.ink, 'center', 650);
    text('portrait play / auto-run positioning', 195, 669, 11, COLORS.muted, 'center', 550);
  }

  function drawLineup() {
    drawHeader('Set the starting five.', 'CUP ' + saveData.cup + '  /  FIXTURE ' + (saveData.fixture + 1) + ' OF 7');
    text(lineupMessage, 24, 103, 12, COLORS.muted, 'left', 550);
    var squad = SQUAD_NAMES[saveData.fixture % SQUAD_NAMES.length];
    roundRect(24, 122, 342, 58, 14, COLORS.panel, '#214447');
    text('SEEDED OPPONENT', 42, 141, 10, COLORS.muted, 'left', 800); text(squad[0], 42, 163, 18, COLORS.ink, 'left', 800); pill(squad[1].toUpperCase(), 286, 138, 61, squad[1] === 'press' ? '#4a2842' : squad[1] === 'wing' ? '#27435a' : '#31442d');
    text(squad[2], 24, 201, 11, COLORS.muted, 'left', 550);
    text(selected.length + '/5 STARTERS', 24, 228, 12, COLORS.lime, 'left', 800); text('TAP CARDS TO ROTATE', 366, 228, 10, COLORS.muted, 'right', 800);
    hitAreas = { fixture: { x: 24, y: 598, w: 342, h: 65 } };
    roster.forEach(function (p, i) {
      var col = i % 2, row = Math.floor(i / 2), x = 24 + col * 174, y = 246 + row * 53, isSel = selectedSet.has(i);
      hitAreas['player-' + i] = { x: x, y: y, w: 164, h: 48 };
      roundRect(x, y, 164, 48, 10, isSel ? '#163d3d' : '#0e2025', isSel ? COLORS.mint : '#1c3437');
      ctx.fillStyle = isSel ? COLORS.blue : '#30454a'; ctx.beginPath(); ctx.arc(x + 23, y + 23, 13, 0, Math.PI * 2); ctx.fill();
      text(String(i + 1).padStart(2, '0'), x + 23, y + 24, 9, '#07161a', 'center', 900);
      text(p.name, x + 44, y + 18, 13, COLORS.ink, 'left', 750); text(p.role + '  ·  ' + Math.round(p.stamina * 100) + '%', x + 44, y + 34, 10, isSel ? COLORS.mint : COLORS.muted, 'left', 650);
      if (isSel) text('ON', x + 148, y + 23, 9, COLORS.lime, 'center', 900);
    });
    roundRect(24, 598, 342, 65, 16, selected.length === 5 ? COLORS.mint : '#253337'); text(selected.length === 5 ? 'KICK OFF FIXTURE ' + (saveData.fixture + 1) : 'SELECT ' + (5 - selected.length) + ' MORE', 195, 621, 17, selected.length === 5 ? '#09201e' : COLORS.muted, 'center', 900); text(selected.length === 5 ? 'tap to enter the three-minute match' : 'a team needs five on the pitch', 195, 645, 11, selected.length === 5 ? '#1a5345' : COLORS.muted, 'center', 600);
  }

  function drawMatch() {
    drawMatchHud(); drawPitch(); drawControls();
    if (match.bannerTime > 0) { roundRect(49, 303, 292, 54, 17, 'rgba(7,21,24,.92)', COLORS.mint); text(match.banner, 195, 330, 16, COLORS.lime, 'center', 900); }
  }

  function drawMatchHud() {
    text('CUP ' + match.cup + '  /  GAME ' + (match.fixture + 1) + ' OF 7', 24, 25, 10, COLORS.mint, 'left', 800);
    text(formatTime(match.clock), 195, 42, 25, COLORS.ink, 'center', 850);
    text(match.ownScore + '  —  ' + match.oppScore, 195, 70, 20, COLORS.lime, 'center', 850);
    text('LANTERN', 70, 69, 10, COLORS.blue, 'center', 800); text(match.squad.toUpperCase(), 320, 69, 9, COLORS.coral, 'center', 800);
    ctx.strokeStyle = '#1d3b3c'; ctx.beginPath(); ctx.moveTo(24, 88); ctx.lineTo(366, 88); ctx.stroke();
  }

  function formatTime(seconds) { var s = Math.ceil(seconds); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function drawPitch() {
    roundRect(field.l, field.t, field.r - field.l, field.b - field.t, 17, COLORS.grass, '#7bc696');
    ctx.save(); roundedPath(field.l, field.t, field.r - field.l, field.b - field.t, 17); ctx.clip();
    for (var y = field.t; y < field.b; y += 46) { ctx.fillStyle = (Math.floor((y - field.t) / 46) % 2) ? COLORS.grass2 : COLORS.grass; ctx.fillRect(field.l, y, field.r - field.l, 46); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(180,244,192,.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(field.l, field.mid); ctx.lineTo(field.r, field.mid); ctx.stroke(); ctx.beginPath(); ctx.arc(195, field.mid, 42, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(200,255,210,.7)'; ctx.beginPath(); ctx.arc(195, field.mid, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeRect(101, field.t, 188, 70); ctx.strokeRect(101, field.b - 70, 188, 70); ctx.strokeRect(143, field.t, 104, 33); ctx.strokeRect(143, field.b - 33, 104, 33);
    ctx.fillStyle = COLORS.ink; ctx.fillRect(146, field.t - 4, 98, 4); ctx.fillRect(146, field.b, 98, 4);
    drawBall(match.ball);
    match.own.forEach(function (p, i) { drawPlayer(p, i === match.active); });
    match.opp.forEach(function (p) { drawPlayer(p, false); });
    if (match.drag && match.drag.points.length > 1) { ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); match.drag.points.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke(); ctx.setLineDash([]); }
  }

  function drawPlayer(p, active) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 9, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (active) { ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = p.team === 'own' ? COLORS.blue : COLORS.red; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.team === 'own' ? COLORS.blueDark : COLORS.redDark; ctx.fillRect(-8, 3, 16, 6);
    text(p.role, 0, 1, 8, '#f5fff8', 'center', 900); ctx.restore();
  }

  function drawBall(b) {
    b.trail.forEach(function (q, i) { ctx.fillStyle = 'rgba(255,241,177,' + (i / 30) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, 2 + i * 0.12, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#fff5c6'; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#6b6b4c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#263c38'; ctx.beginPath(); ctx.arc(b.x - 2, b.y - 1, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(b.x + 2, b.y + 2, 1.2, 0, Math.PI * 2); ctx.fill();
  }

  function drawControls() {
    hitAreas.stick = { x: 20, y: 610, w: 88, h: 80 }; hitAreas.pass = { x: 122, y: 622, w: 72, h: 52 }; hitAreas.shoot = { x: 202, y: 622, w: 82, h: 52 };
    ctx.fillStyle = '#0b191d'; ctx.fillRect(0, 606, W, 94);
    ctx.fillStyle = '#122a2e'; ctx.beginPath(); ctx.arc(64, 650, 34, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#315454'; ctx.stroke();
    var knobX = 64 + match.stick.x * 18, knobY = 650 + match.stick.y * 18; ctx.fillStyle = COLORS.mint; ctx.beginPath(); ctx.arc(knobX, knobY, 15, 0, Math.PI * 2); ctx.fill(); text('MOVE', 64, 650, 8, '#09201e', 'center', 900);
    roundRect(122, 622, 72, 52, 13, '#17383a', '#37645d'); text('PASS', 158, 646, 12, COLORS.mint, 'center', 850); text('J', 158, 662, 10, COLORS.muted, 'center', 700);
    roundRect(202, 622, 82, 52, 13, '#3b3030', '#815051'); text('SHOOT', 243, 646, 12, COLORS.coral, 'center', 850); text('K', 243, 662, 10, '#c28d8d', 'center', 700);
    hitAreas.switch = { x: 294, y: 622, w: 72, h: 52 }; roundRect(294, 622, 72, 52, 13, '#17383a', '#37645d'); text('SWITCH', 330, 646, 11, COLORS.yellow, 'center', 850); text('TAP', 330, 662, 9, COLORS.muted, 'center', 700);
    text(match.lastAction, 195, 601, 10, COLORS.muted, 'center', 650);
  }

  function drawResult(wonCup) {
    drawHeader(wonCup ? 'The cup is yours.' : 'One more run.', wonCup ? 'FINAL WHISTLE  /  CUP ' + (saveData.cup - 1) : 'FINAL WHISTLE  /  CUP ' + saveData.cup);
    var last = saveData.history[saveData.history.length - 1] || { own: 0, opp: 0 };
    roundRect(24, 127, 342, 152, 18, wonCup ? '#193c36' : COLORS.panel, wonCup ? COLORS.lime : '#214447');
    text(wonCup ? 'CHAMPIONS' : 'FIXTURE LOST', 195, 163, 13, wonCup ? COLORS.lime : COLORS.coral, 'center', 900);
    text(last.own + '  —  ' + last.opp, 195, 214, 39, COLORS.ink, 'center', 900);
    text(wonCup ? 'Two new players joined the squad.' : 'The fixture is waiting for a rematch.', 195, 252, 12, COLORS.muted, 'center', 600);
    if (wonCup) { drawTrophy(195, 355); text('TROPHIES', 195, 446, 11, COLORS.muted, 'center', 800); text(String(saveData.trophies.length), 195, 482, 34, COLORS.lime, 'center', 900); text('Cup ' + (saveData.cup - 1) + ' is on the shelf.', 195, 516, 13, COLORS.ink, 'center', 650); }
    else { text('No stamina or energy wall. Learn the pattern,', 195, 353, 14, COLORS.ink, 'center', 650); text('rotate the five, and take the same opponent apart.', 195, 379, 14, COLORS.ink, 'center', 650); }
    hitAreas.start = { x: 52, y: 548, w: 286, h: 72 }; roundRect(52, 548, 286, 72, 18, COLORS.mint); text(wonCup ? 'START CUP ' + saveData.cup : 'REPLAY FIXTURE', 195, 578, 18, '#09201e', 'center', 900); text(wonCup ? 'new seed / same free squad' : 'try a different lane', 195, 601, 11, '#1a5345', 'center', 650);
  }

  function drawTrophy(x, y) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 38, 0.25, Math.PI - 0.25); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-17, 29); ctx.lineTo(-8, 52); ctx.lineTo(8, 52); ctx.lineTo(17, 29); ctx.stroke(); ctx.fillStyle = COLORS.yellow; ctx.fillRect(-26, 52, 52, 7); ctx.fillStyle = 'rgba(255,209,102,.18)'; ctx.beginPath(); ctx.arc(0, 4, 24, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawMiniPlayer(x, y, index, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0b2524'; ctx.fillRect(x - 10, y + 2, 20, 9); text(String(index + 1), x, y + 2, 10, '#eaffdf', 'center', 900); }

  function drawRotateOverlay() {
    ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
    ctx.fillStyle = 'rgba(3,10,13,.96)'; ctx.fillRect(0, 0, cssW, cssH);
    text('ROTATE TO PLAY', cssW / 2, cssH / 2 - 38, 24, COLORS.lime, 'center', 900); text('Touchline Eleven is portrait-first.', cssW / 2, cssH / 2 + 4, 14, COLORS.muted, 'center', 600); text('The match is paused safely.', cssW / 2, cssH / 2 + 30, 12, COLORS.mint, 'center', 700);
  }

  function addBurst(x, y, color, count) {
    count = Math.min(count || 8, 30);
    for (var i = 0; i < count; i++) particles.push({ x: x, y: y, vx: rand(-100, 100), vy: rand(-100, 100), life: rand(0.3, 0.8), max: 0.8, color: color, size: rand(2, 5) });
    if (particles.length > 160) particles.splice(0, particles.length - 160);
  }
  function addText(x, y, value, color, life) { texts.push({ x: x, y: y, value: value, color: color, life: life || 1, max: life || 1 }); if (texts.length > 24) texts.shift(); }
  function updateParticles(dt) { particles.forEach(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }); particles = particles.filter(function (p) { return p.life > 0; }).slice(-160); }
  function updateTexts(dt) { texts.forEach(function (t) { t.life -= dt; t.y -= 18 * dt; }); texts = texts.filter(function (t) { return t.life > 0; }).slice(-24); }
  function drawParticles() { particles.forEach(function (p) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }); ctx.globalAlpha = 1; }
  function drawTexts() { texts.forEach(function (t) { ctx.globalAlpha = clamp(t.life / t.max, 0, 1); text(t.value, t.x, t.y, 11, t.color, 'center', 800); }); ctx.globalAlpha = 1; }

  function resize() {
    var rect = canvas.getBoundingClientRect(); cssW = rect.width || W; cssH = rect.height || H;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), longAxis = Math.max(cssW, cssH); pxScale = Math.min(dpr, 960 / Math.max(1, longAxis));
    viewScale = Math.min(cssW / W, cssH / H); viewX = (cssW - W * viewScale) / 2; viewY = (cssH - H * viewScale) / 2;
    canvas.width = Math.max(1, Math.floor(cssW * pxScale)); canvas.height = Math.max(1, Math.floor(cssH * pxScale));
    var nextBlocked = window.innerWidth > window.innerHeight;
    if (nextBlocked !== blockedByOrientation) resetInputs();
    blockedByOrientation = nextBlocked;
    previous = performance.now();
  }

  function loop(now) {
    var dt = Math.min(0.05, Math.max(0, (now - previous) / 1000)); previous = now;
    if (!blockedByOrientation && !document.hidden) update(dt);
    draw(); requestAnimationFrame(loop);
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', function (e) { onPointerUp(e, false); }, { passive: false });
  canvas.addEventListener('pointercancel', function (e) { onPointerUp(e, true); }, { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false }); window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', resetInputs); window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) resetInputs(); previous = performance.now(); });
  resize(); requestAnimationFrame(loop);
}());
