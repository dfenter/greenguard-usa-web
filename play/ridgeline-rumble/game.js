/* Ridgeline Rumble — a compact, original, no-network lane brawler. */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var W = 390, H = 700, dpr = 1, laneY = 350;
  var TAU = Math.PI * 2;
  var STORAGE_KEY = 'ridgeline-rumble-profile-v1';
  var MAX_ENTITIES = 48, MAX_PARTICLES = 220, MAX_FLOATERS = 24;
  var mode = 'select', selected = 0, elapsed = 0, result = '';
  var nextWave = 0, waveNo = 0, idSeq = 1, shake = 0, flash = 0;
  var entities = [], particles = [], floaters = [], towers = [], abilityQueue = [];
  var keys = new Set(), pointerMap = new Map(), abilityPointer = [null, null, null];
  var stickId = null, stick = { x: 0, y: 0 }, lastFrame = 0, audio = null;
  var profile;
  var shop = [
    { name: 'IRON BARK', cost: 80, color: '#e8aa63', text: '+55 max health', key: 'health' },
    { name: 'QUICK COIL', cost: 100, color: '#79d9bf', text: '20% move speed', key: 'speed' },
    { name: 'SPARK LENS', cost: 120, color: '#f58d8d', text: '+8 attack power', key: 'power' }
  ];
  var heroes = [
    { name: 'MOSSJAW', role: 'TANK / HOOK', color: '#80d38b', dark: '#275d4d', hp: 155, damage: 11, range: 88, speed: 105, cool: .78, ability: 'ANCHOR FANG', desc: 'Hook a foe close. Stuns hard.', icon: 'H', kit: 'hook' },
    { name: 'ZIP', role: 'ASSASSIN / DASH', color: '#e77dba', dark: '#71365e', hp: 112, damage: 15, range: 92, speed: 145, cool: .64, ability: 'BLINK BITE', desc: 'Dash through the nearest foe.', icon: 'D', kit: 'dash' },
    { name: 'CINDER', role: 'MAGE / BURST', color: '#ff9a66', dark: '#7a3c3c', hp: 105, damage: 12, range: 125, speed: 102, cool: .82, ability: 'SUNFLARE', desc: 'Burst a small hot circle.', icon: 'B', kit: 'burst' },
    { name: 'VELUNE', role: 'MARKSMAN / RANGE', color: '#f1d26e', dark: '#806c36', hp: 108, damage: 17, range: 188, speed: 110, cool: .72, ability: 'LONG ECHO', desc: 'A clean shot across the lane.', icon: 'R', kit: 'shot' },
    { name: 'HALOPEARL', role: 'SUPPORT / SHIELD', color: '#8cdde3', dark: '#2d6879', hp: 128, damage: 9, range: 105, speed: 104, cool: .88, ability: 'SOFTWALL', desc: 'Shield the ally who needs it.', icon: 'S', kit: 'shield' },
    { name: 'RIDGEBACK', role: 'BRUISER / SPIN', color: '#bd9af4', dark: '#533b80', hp: 142, damage: 13, range: 82, speed: 112, cool: .76, ability: 'WHEEL RUSH', desc: 'Spin and slow every nearby foe.', icon: 'W', kit: 'spin' }
  ];
  profile = loadProfile();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
  function validNum(v, fallback, min, max) {
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
  }
  function loadProfile() {
    var fresh = { wins: 0, losses: 0, best: 0, mastery: {} };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fresh;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fresh;
      fresh.wins = Math.floor(validNum(parsed.wins, 0, 0, 999999));
      fresh.losses = Math.floor(validNum(parsed.losses, 0, 0, 999999));
      fresh.best = validNum(parsed.best, 0, 0, 240);
      if (parsed.mastery && typeof parsed.mastery === 'object' && !Array.isArray(parsed.mastery)) {
        heroes.forEach(function (hero) { fresh.mastery[hero.name] = Math.floor(validNum(parsed.mastery[hero.name], 0, 0, 999999)); });
      }
    } catch (e) { return { wins: 0, losses: 0, best: 0, mastery: {} }; }
    return fresh;
  }
  function saveProfile() {
    try {
      var safeMastery = {};
      heroes.forEach(function (hero) { safeMastery[hero.name] = Math.floor(validNum(profile.mastery[hero.name], 0, 0, 999999)); });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        wins: Math.floor(validNum(profile.wins, 0, 0, 999999)),
        losses: Math.floor(validNum(profile.losses, 0, 0, 999999)),
        best: validNum(profile.best, 0, 0, 240), mastery: safeMastery
      }));
    } catch (e) { /* Storage is optional. */ }
  }
  function resize() {
    W = Math.max(280, window.innerWidth || 390);
    H = Math.max(420, window.innerHeight || 700);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var longAxis = Math.max(W, H);
    if (longAxis * dpr > 960) dpr = 960 / longAxis;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    laneY = clamp(H * .49, 270, 405);
  }
  function unlockAudio() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  function beep(kind) {
    if (!audio) return;
    try {
      var now = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      var tones = { hit: [160, .045], cast: [420, .11], dash: [760, .1], win: [640, .28], lose: [90, .3], buy: [300, .09] };
      var tone = tones[kind] || tones.hit;
      o.type = kind === 'lose' ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(tone[0], now);
      o.frequency.exponentialRampToValueAtTime(Math.max(45, tone[0] * (kind === 'win' ? 1.7 : .62)), now + tone[1]);
      g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.055, now + .012); g.gain.exponentialRampToValueAtTime(.0001, now + tone[1]);
      o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + tone[1] + .02);
    } catch (e) { /* Audio is optional. */ }
  }
  function clearWorld() { entities.length = 0; particles.length = 0; floaters.length = 0; towers.length = 0; }
  function resetInput() {
    pointerMap.clear(); abilityPointer[0] = abilityPointer[1] = abilityPointer[2] = null;
    stickId = null; stick.x = 0; stick.y = 0; keys.clear(); abilityQueue.length = 0;
  }
  function addEntity(e) {
    if (entities.length >= MAX_ENTITIES) {
      var removable = entities.findIndex(function (x) { return x.type === 'minion' && x.hp <= 0; });
      if (removable >= 0) entities.splice(removable, 1); else return null;
    }
    e.id = idSeq++; e.alive = true; entities.push(e); return e;
  }
  function makeHero(team, x, y, hero, role, isPlayer) {
    var difficulty = 1 + Math.min(.34, profile.wins * .055);
    var hp = hero.hp * (isPlayer ? 1 : team === 'red' ? difficulty : 1);
    return addEntity({ type: 'hero', team: team, x: x, y: y, hp: hp, maxHp: hp, radius: 16, hero: hero,
      role: role, isPlayer: !!isPlayer, damage: hero.damage * (isPlayer ? 1 : team === 'red' ? difficulty : 1),
      range: hero.range, speed: hero.speed, attackCd: .2 + Math.random() * .25, abilityCd: 0,
      stun: 0, slow: 0, shield: 0, respawn: 0, face: team === 'blue' ? 1 : -1 });
  }
  function makeMinion(team, x, y, ranged) {
    var difficulty = 1 + Math.min(.25, profile.wins * .04);
    return addEntity({ type: 'minion', team: team, x: x, y: y + (Math.random() - .5) * 30, hp: (ranged ? 42 : 56) * (team === 'red' ? difficulty : 1),
      maxHp: (ranged ? 42 : 56) * (team === 'red' ? difficulty : 1), radius: ranged ? 9 : 11, ranged: !!ranged,
      damage: (ranged ? 7 : 9) * (team === 'red' ? difficulty : 1), range: ranged ? 95 : 34, speed: ranged ? 33 : 43,
      attackCd: Math.random() * .7, stun: 0, slow: 0, face: team === 'blue' ? 1 : -1 });
  }
  function setupMatch() {
    clearWorld(); resetInput(); elapsed = 0; nextWave = 0; waveNo = 0; result = ''; shake = 0; flash = 0;
    var hero = heroes[selected];
    var player = makeHero('blue', 104, laneY + 34, hero, 'player', true); player.items = { health: false, speed: false, power: false }; player.gold = 120;
    makeHero('blue', 74, laneY - 34, heroes[0], 'guard', false);
    makeHero('blue', 118, laneY - 69, heroes[4], 'support', false);
    makeHero('red', 286, laneY + 32, heroes[5], 'bruiser', false);
    makeHero('red', 320, laneY - 28, heroes[1], 'flank', false);
    makeHero('red', 352, laneY + 58, heroes[2], 'caster', false);
    towers = [
      { team: 'blue', x: 42, y: laneY - 2, hp: 390, maxHp: 390, alive: true, far: false },
      { team: 'blue', x: 92, y: laneY - 2, hp: 450, maxHp: 450, alive: true, far: true },
      { team: 'red', x: W - 92, y: laneY - 2, hp: 450, maxHp: 450, alive: true, far: false },
      { team: 'red', x: W - 42, y: laneY - 2, hp: 390, maxHp: 390, alive: true, far: true }
    ];
    mode = 'playing'; spawnWave(); nextWave = 20; beep('cast');
  }
  function spawnWave() {
    if (entities.filter(function (e) { return e.type === 'minion'; }).length > 30) return;
    waveNo++;
    for (var i = 0; i < 3; i++) { makeMinion('blue', 122 - i * 16, laneY + (i - 1) * 22, i === 2); makeMinion('red', W - 122 + i * 16, laneY + (i - 1) * 22, i === 2); }
    addFloater(W / 2, laneY - 86, 'WAVE ' + waveNo, '#d7f2d4');
  }
  function playerEntity() { return entities.find(function (e) { return e.isPlayer; }); }
  function teamAlive(team, kind) { return entities.filter(function (e) { return e.alive && e.team === team && (!kind || e.type === kind); }); }
  function nearestEnemy(source, maxRange, filter) {
    var best = null, bestD = maxRange == null ? Infinity : maxRange;
    entities.forEach(function (e) {
      if (!e.alive || e.team === source.team || e === source || (filter && !filter(e))) return;
      var d = dist(source, e) - source.radius - e.radius;
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }
  function nearestTower(source, maxRange) {
    var best = null, bestD = maxRange == null ? Infinity : maxRange;
    towers.forEach(function (t) {
      if (!t.alive || t.team === source.team) return;
      var d = Math.abs(t.x - source.x) - 16;
      if (d < bestD) { bestD = d; best = t; }
    });
    return best;
  }
  function moveToward(e, tx, ty, amount, dt) {
    var dx = tx - e.x, dy = ty - e.y, m = Math.hypot(dx, dy) || 1;
    var slow = e.slow > 0 ? .58 : 1;
    e.x += dx / m * amount * slow * dt; e.y += dy / m * amount * slow * dt;
    e.x = clamp(e.x, 25, W - 25); e.y = clamp(e.y, laneY - 78, laneY + 78);
    e.face = dx >= 0 ? 1 : -1;
  }
  function hurt(target, amount, source, text) {
    if (!target || !target.alive) return;
    if (target.shield > 0) { var blocked = Math.min(target.shield, amount); target.shield -= blocked; amount -= blocked; }
    if (amount <= 0) { addFloater(target.x, target.y - 24, 'BLOCK', '#baf6ed'); return; }
    target.hp -= amount; target.lastHitBy = source || null; addParticles(target.x, target.y, target.team === 'blue' ? '#ffcf80' : '#ff8f9d', 6, 55);
    if (text) addFloater(target.x, target.y - 25, text, '#fff1ae');
    shake = Math.min(10, shake + 1.6); flash = Math.min(.18, flash + .05); beep('hit');
    if (target.hp <= 0) killEntity(target, source);
  }
  function killEntity(e, source) {
    if (!e.alive) return;
    e.alive = false; addParticles(e.x, e.y, e.team === 'blue' ? '#65d8c3' : '#ff6f86', 18, 120); shake = Math.min(14, shake + 4);
    if (source && source.isPlayer && e.type === 'minion') { source.gold = Math.min(9999, source.gold + 22); addFloater(source.x, source.y - 34, '+22 GOLD', '#ffd56a'); }
    if (e.type === 'hero') {
      if (e.isPlayer) { e.respawn = 5; e.hp = 0; addFloater(e.x, e.y - 28, 'DOWN 5s', '#ffb0a8'); }
      else if (source && source.isPlayer) { source.gold = Math.min(9999, source.gold + 65); addFloater(source.x, source.y - 34, '+65 GOLD', '#ffd56a'); }
    }
  }
  function doBasicAttack(e) {
    if (!e.alive || e.respawn > 0 || e.attackCd > 0 || e.stun > 0) return;
    var target = nearestEnemy(e, e.range, function (x) { return x.type === 'hero' || x.type === 'minion'; });
    if (target) { hurt(target, e.damage, e, '-' + Math.round(e.damage)); addParticles(target.x, target.y, e.team === 'blue' ? '#b8fff0' : '#ffb0b8', 4, 35); e.attackCd = e.isPlayer ? e.hero.cool : .82; return; }
    var tower = nearestTower(e, e.range + 20);
    if (tower) { tower.hp -= e.damage; tower.lastHitBy = e; e.attackCd = e.isPlayer ? e.hero.cool : .92; addParticles(tower.x, tower.y - 20, '#f3cc78', 4, 28); shake = Math.min(8, shake + 1); if (tower.hp <= 0) { tower.alive = false; addFloater(tower.x, tower.y - 36, 'TOWER DOWN', '#ffe09b'); addParticles(tower.x, tower.y - 20, '#ffd36c', 32, 150); } }
  }
  function useAbility(player, n) {
    if (!player || !player.alive || player.respawn > 0 || player.abilityCd > 0 || player.stun > 0) return;
    var kit = player.hero.kit, target, list, i, d;
    if (kit === 'hook') {
      target = nearestEnemy(player, 235, function (x) { return x.type === 'hero' || x.type === 'minion'; });
      if (!target) return;
      target.x = lerp(target.x, player.x + player.face * 26, .36); target.y = lerp(target.y, player.y, .42); hurt(target, 22, player, 'HOOK'); target.stun = 1.15;
      addParticles(target.x, target.y, '#9af0be', 16, 90); player.abilityCd = 8; beep('cast');
    } else if (kit === 'dash') {
      target = nearestEnemy(player, 215, function (x) { return x.type === 'hero' || x.type === 'minion'; });
      if (!target) return;
      var oldx = player.x; player.x = clamp(target.x - player.face * 34, 25, W - 25); player.y = target.y; hurt(target, 32, player, 'BITE');
      addParticles(oldx, player.y, '#ff9fd3', 20, 150); player.abilityCd = 6.5; beep('dash');
    } else if (kit === 'burst') {
      target = nearestEnemy(player, 225, function (x) { return x.type === 'hero' || x.type === 'minion'; });
      if (!target) return;
      entities.forEach(function (e) { if (e.alive && e.team !== player.team && Math.hypot(e.x - target.x, e.y - target.y) < 62) hurt(e, 27, player, 'BURST'); });
      addParticles(target.x, target.y, '#ffb36e', 32, 125); player.abilityCd = 7; beep('cast');
    } else if (kit === 'shot') {
      target = nearestEnemy(player, 390, function (x) { return x.type === 'hero' || x.type === 'minion'; });
      if (!target) return;
      hurt(target, 36, player, 'ECHO'); addParticles(target.x, target.y, '#fff09e', 22, 180); player.abilityCd = 5.8; beep('cast');
    } else if (kit === 'shield') {
      list = teamAlive(player.team, 'hero').filter(function (x) { return x.alive && x.respawn <= 0; });
      target = list.sort(function (a, b) { return (a.hp + a.shield) / a.maxHp - (b.hp + b.shield) / b.maxHp; })[0] || player;
      target.shield = Math.min(80, target.shield + 46); target.hp = Math.min(target.maxHp, target.hp + 12); addFloater(target.x, target.y - 28, 'SHIELDED', '#b5fff1');
      addParticles(target.x, target.y, '#a3eff2', 22, 100); player.abilityCd = 7.4; beep('cast');
    } else if (kit === 'spin') {
      for (i = entities.length - 1; i >= 0; i--) { var foe = entities[i]; if (foe.alive && foe.team !== player.team && Math.hypot(foe.x - player.x, foe.y - player.y) < 78) { hurt(foe, 25, player, 'SPIN'); foe.slow = 2.2; } }
      addParticles(player.x, player.y, '#c7a5ff', 34, 130); player.abilityCd = 6.8; beep('dash');
    }
  }
  function botThink(e, dt) {
    if (!e.alive || e.respawn > 0 || e.stun > 0) return;
    var own = teamAlive(e.team), foes = teamAlive(e.team === 'blue' ? 'red' : 'blue');
    var low = e.hp / e.maxHp < .27, nearFoe = nearestEnemy(e, 165, function (x) { return x.type === 'hero' || x.type === 'minion'; });
    var ownPower = own.reduce(function (s, x) { return s + x.hp / x.maxHp; }, 0), foePower = foes.reduce(function (s, x) { return s + x.hp / x.maxHp; }, 0);
    var home = e.team === 'blue' ? 65 : W - 65;
    if (low) { moveToward(e, home, laneY + (e.role === 'support' ? -42 : 38), e.speed * 1.1, dt); return; }
    if (e.role === 'support') {
      var ally = own.filter(function (x) { return x !== e && x.type === 'hero' && x.hp / x.maxHp < .68; }).sort(function (a, b) { return a.hp / a.maxHp - b.hp / b.maxHp; })[0];
      if (ally && dist(e, ally) > 80) moveToward(e, ally.x, ally.y, e.speed, dt);
      else if (e.abilityCd <= 0) useBotShield(e, ally || e);
    } else if (nearFoe) {
      if (e.role === 'flank' && e.abilityCd <= 0 && ownPower > foePower * .8) useBotDash(e, nearFoe);
      else if (e.role === 'caster' && e.abilityCd <= 0) useBotBurst(e, nearFoe);
      else if (dist(e, nearFoe) > e.range * .72) moveToward(e, nearFoe.x, nearFoe.y, e.speed, dt);
    } else {
      var tower = nearestTower(e, e.range + 30);
      var canDive = ownPower > foePower * 1.16 && e.hp / e.maxHp > .63;
      if (tower && (!tower.far || canDive)) { if (Math.abs(tower.x - e.x) > e.range) moveToward(e, tower.x, laneY, e.speed, dt); }
      else moveToward(e, e.team === 'blue' ? W - 70 : 70, laneY + (e.role === 'guard' ? 30 : -15), e.speed, dt);
    }
    doBasicAttack(e);
  }
  function useBotDash(e, t) { e.x = clamp(t.x - e.face * 31, 25, W - 25); hurt(t, 19, e, 'DASH'); e.abilityCd = 7; addParticles(e.x, e.y, '#ff9fd3', 10, 75); }
  function useBotBurst(e, t) { entities.forEach(function (x) { if (x.alive && x.team !== e.team && Math.hypot(x.x - t.x, x.y - t.y) < 48) hurt(x, 16, e, 'POP'); }); e.abilityCd = 8; addParticles(t.x, t.y, '#ffb36e', 14, 75); }
  function useBotShield(e, t) { t.shield = Math.min(70, t.shield + 30); e.abilityCd = 8; addParticles(t.x, t.y, '#a3eff2', 10, 55); }
  function update(dt) {
    if (mode !== 'playing') return;
    elapsed += dt; if (elapsed >= 240) { finish(false); return; }
    if (elapsed >= nextWave) { spawnWave(); nextWave = elapsed + 20; }
    var player = playerEntity();
    if (player) {
      if (player.respawn > 0) { player.respawn -= dt; if (player.respawn <= 0) { player.respawn = 0; player.alive = true; player.hp = player.maxHp; player.x = 104; player.y = laneY + 34; player.shield = 0; addFloater(player.x, player.y - 25, 'BACK IN', '#baf6ed'); } }
      else if (player.stun <= 0) {
        var vx = stick.x, vy = stick.y;
        if (keys.has('a')) vx -= 1; if (keys.has('d')) vx += 1; if (keys.has('w')) vy -= 1; if (keys.has('s')) vy += 1;
        var mag = Math.hypot(vx, vy); if (mag > 1) { vx /= mag; vy /= mag; }
        var speed = player.speed * (player.items.speed ? 1.2 : 1); player.x = clamp(player.x + vx * speed * dt, 25, W - 25); player.y = clamp(player.y + vy * speed * dt, laneY - 78, laneY + 78); if (vx) player.face = vx > 0 ? 1 : -1;
        while (abilityQueue.length) useAbility(player, abilityQueue.shift()); doBasicAttack(player);
      }
    }
    entities.forEach(function (e) {
      if (!e.alive) return;
      e.attackCd = Math.max(0, e.attackCd - dt); e.abilityCd = Math.max(0, e.abilityCd - dt); e.stun = Math.max(0, e.stun - dt); e.slow = Math.max(0, e.slow - dt); e.shield = Math.max(0, e.shield - dt * 7);
      if (e.type === 'minion') updateMinion(e, dt); else if (e.type === 'hero' && !e.isPlayer) botThink(e, dt);
    });
    entities = entities.filter(function (e) { return e.alive || (e.type === 'hero' && e.isPlayer); });
    if (!towers[3].alive) { finish(true); return; }
    if (!towers[1].alive) { finish(false); return; }
    updateParticles(dt); updateFloaters(dt); shake = Math.max(0, shake - dt * 22); flash = Math.max(0, flash - dt);
  }
  function updateMinion(e, dt) {
    if (e.stun > 0) return;
    var target = nearestEnemy(e, e.range + 2, function (x) { return x.type === 'hero' || x.type === 'minion'; });
    if (target) { if (dist(e, target) > e.range + 4) moveToward(e, target.x, target.y, e.speed, dt); doBasicAttack(e); return; }
    var tower = nearestTower(e, e.range + 14);
    if (tower) { if (Math.abs(tower.x - e.x) > e.range + 3) moveToward(e, tower.x, laneY, e.speed, dt); doBasicAttack(e); }
    else moveToward(e, e.team === 'blue' ? W - 25 : 25, laneY, e.speed, dt);
  }
  function finish(win) {
    if (mode !== 'playing') return;
    mode = win ? 'win' : 'loss'; result = win ? 'RIDGE HELD' : 'LANE LOST';
    if (win) { profile.wins++; profile.mastery[heroes[selected].name] = (profile.mastery[heroes[selected].name] || 0) + 1; if (!profile.best || elapsed < profile.best) profile.best = elapsed; beep('win'); }
    else { profile.losses++; beep('lose'); }
    saveProfile(); resetInput(); flash = .28; render();
  }
  function buy(index) {
    var p = playerEntity(), item = shop[index]; if (!p || p.items[item.key] || p.gold < item.cost) return;
    p.gold -= item.cost; p.items[item.key] = true; if (item.key === 'health') { p.maxHp += 55; p.hp += 55; } if (item.key === 'power') p.damage += 8; addFloater(p.x, p.y - 35, item.name, item.color); addParticles(p.x, p.y, item.color, 15, 85); beep('buy');
  }
  function addParticles(x, y, color, count, speed) {
    count = Math.min(count, MAX_PARTICLES - particles.length); if (count <= 0) return;
    for (var i = 0; i < count; i++) { var a = Math.random() * TAU, s = speed * (.35 + Math.random() * .65); particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .32 + Math.random() * .52, max: .85, color: color, size: 1.5 + Math.random() * 3.5 }); }
  }
  function addFloater(x, y, text, color) {
    if (floaters.length >= MAX_FLOATERS) floaters.shift(); floaters.push({ x: x, y: y, text: String(text).slice(0, 24), color: color, life: 1.15 });
  }
  function updateParticles(dt) { particles = particles.filter(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy = p.vy * .985 + 20 * dt; return p.life > 0; }); }
  function updateFloaters(dt) { floaters = floaters.filter(function (f) { f.life -= dt; f.y -= 17 * dt; return f.life > 0; }); }
  function roundRect(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : (ctx.rect(x, y, w, h)); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
  function text(str, x, y, size, color, align, weight) { ctx.font = (weight || 700) + ' ' + size + 'px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillStyle = color || '#fff'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y); }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    ctx.save(); ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); drawArena(); if (mode === 'playing' || mode === 'win' || mode === 'loss') drawHud(); if (mode === 'playing' || mode === 'win' || mode === 'loss') drawEntities(); drawParticles(); drawFloaters(); if (mode === 'playing') drawControls(); ctx.restore();
    if (mode === 'select') drawSelect(); else if (mode === 'win' || mode === 'loss') drawResult();
    if (window.innerWidth > window.innerHeight) drawRotate();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,231,167,' + flash + ')'; ctx.fillRect(0, 0, W, H); }
  }
  function drawBackdrop() {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#091c2b'); g.addColorStop(.48, '#123143'); g.addColorStop(1, '#07151e'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(157,218,194,.07)'; ctx.beginPath(); ctx.moveTo(0, laneY - 105); ctx.lineTo(55, laneY - 166); ctx.lineTo(105, laneY - 112); ctx.lineTo(168, laneY - 179); ctx.lineTo(238, laneY - 111); ctx.lineTo(302, laneY - 157); ctx.lineTo(W, laneY - 98); ctx.lineTo(W, laneY - 6); ctx.lineTo(0, laneY - 6); ctx.fill();
    ctx.strokeStyle = 'rgba(181,236,206,.12)'; ctx.lineWidth = 2; ctx.beginPath(); for (var i = -10; i < W + 20; i += 30) { ctx.moveTo(i, laneY + 100); ctx.lineTo(i + 26, laneY + 77); } ctx.stroke();
  }
  function drawArena() {
    ctx.fillStyle = '#0d402f'; roundRect(16, laneY - 83, W - 32, 166, 24, '#0e3b32');
    ctx.fillStyle = '#174b3a'; roundRect(18, laneY - 49, W - 36, 98, 22, '#174b3a');
    ctx.strokeStyle = 'rgba(203,241,193,.15)'; ctx.lineWidth = 2; ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.moveTo(24, laneY); ctx.lineTo(W - 24, laneY); ctx.stroke(); ctx.setLineDash([]);
    towers.forEach(drawTower);
  }
  function drawTower(t) {
    if (!t.alive) { ctx.globalAlpha = .28; ctx.fillStyle = '#59666b'; ctx.beginPath(); ctx.arc(t.x, t.y - 6, 19, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; return; }
    var c = t.team === 'blue' ? '#66d6c2' : '#f07d91';
    ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = c; roundRect(t.x - 10, t.y - 24, 20, 42, 5, c); ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8f6de'; ctx.beginPath(); ctx.arc(t.x, t.y - 27, 10, Math.PI, 0); ctx.fill(); ctx.fillStyle = t.team === 'blue' ? '#2e8576' : '#9c405d'; ctx.fillRect(t.x - 2, t.y - 34, 4, 16);
    ctx.fillStyle = 'rgba(2,8,12,.62)'; roundRect(t.x - 22, t.y - 48, 44, 5, 2, 'rgba(2,8,12,.62)'); ctx.fillStyle = c; ctx.fillRect(t.x - 22, t.y - 48, 44 * clamp(t.hp / t.maxHp, 0, 1), 5);
  }
  function drawHud() {
    var p = playerEntity(), hero = heroes[selected], timer = fmtTime(240 - elapsed);
    ctx.fillStyle = 'rgba(3,11,18,.7)'; roundRect(10, 10, W - 20, 54, 16, 'rgba(3,11,18,.7)');
    text('RIDGELINE', 22, 26, 10, '#8bd9bf', 'left', 800); text(timer, W / 2, 28, 19, timer === '00:00' ? '#ff8a8a' : '#f2f3d4', 'center', 900); text('HEAT ' + (1 + Math.floor(profile.wins / 3)), W - 21, 26, 10, '#f0c778', 'right', 800);
    text(hero.name, 22, 49, 10, hero.color, 'left', 800); text(p ? Math.max(0, Math.floor(p.gold)) + 'G' : '0G', W - 21, 49, 12, '#ffd56a', 'right', 900);
    if (p) { ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRect(110, 44, 132, 7, 4, 'rgba(0,0,0,.45)'); ctx.fillStyle = '#75d5b1'; ctx.fillRect(110, 44, 132 * clamp(p.hp / p.maxHp, 0, 1), 7); }
    shop.forEach(function (item, i) { var x = 9 + i * ((W - 18) / 3), w = (W - 30) / 3, bought = p && p.items[item.key], can = p && p.gold >= item.cost; ctx.globalAlpha = bought ? .42 : 1; roundRect(x, 73, w, 42, 11, bought ? '#274038' : can ? '#173c3c' : '#172832', bought ? '#496e63' : can ? item.color : '#32474d'); text(bought ? 'OWNED' : item.name, x + 8, 86, 9, bought ? '#b8d4c7' : item.color, 'left', 900); text(bought ? '✓' : item.cost + 'G', x + w - 8, 86, 9, bought ? '#b8fff0' : '#ffd56a', 'right', 900); text(item.text, x + 8, 103, 8, '#b1c6c1', 'left', 600); ctx.globalAlpha = 1; });
  }
  function drawEntities() {
    var alive = entities.filter(function (e) { return e.alive; }).sort(function (a, b) { return a.y - b.y; });
    alive.forEach(function (e) {
      if (e.type === 'minion') drawMinion(e); else drawHero(e);
    });
  }
  function drawMinion(e) {
    var c = e.team === 'blue' ? '#70cdb2' : '#e97989'; ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 7; if (e.ranged) { ctx.beginPath(); ctx.moveTo(-9, 8); ctx.lineTo(0, -10); ctx.lineTo(9, 8); ctx.closePath(); ctx.fill(); } else { ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, TAU); ctx.fill(); } ctx.shadowBlur = 0; ctx.fillStyle = '#f3f0c8'; ctx.fillRect(e.face * 3 - 2, -4, 4, 3); ctx.restore(); drawBar(e.x, e.y - 16, 24, e.hp / e.maxHp, c);
  }
  function drawHero(e) {
    var h = e.hero, c = h.color; ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = e.respawn > 0 ? .32 : 1; ctx.shadowColor = c; ctx.shadowBlur = e.isPlayer ? 16 : 8; ctx.fillStyle = h.dark; ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = c; ctx.lineWidth = e.isPlayer ? 3 : 2; ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#102029'; ctx.beginPath(); ctx.arc(e.face * 4 - 3, -3, 2.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#f4f4d2'; ctx.fillRect(e.face * 4 - 1, -4, 2, 2); ctx.restore();
    drawBar(e.x, e.y - 28, 38, e.hp / e.maxHp, e.team === 'blue' ? '#67d7be' : '#f57c8e'); if (e.shield > 0) { ctx.strokeStyle = '#bcfff2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 24, 0, TAU); ctx.stroke(); }
    if (e.isPlayer) { ctx.strokeStyle = 'rgba(255,244,175,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(e.x, e.y, 23 + Math.sin(elapsed * 5) * 2, 0, TAU); ctx.stroke(); }
  }
  function drawBar(x, y, w, ratio, color) { ctx.fillStyle = 'rgba(0,0,0,.58)'; roundRect(x - w / 2, y, w, 4, 2, 'rgba(0,0,0,.58)'); ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * clamp(ratio, 0, 1), 4); }
  function drawParticles() { particles.forEach(function (p) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }); ctx.globalAlpha = 1; }
  function drawFloaters() { floaters.forEach(function (f) { ctx.globalAlpha = clamp(f.life, 0, 1); text(f.text, f.x, f.y, 9, f.color, 'center', 900); }); ctx.globalAlpha = 1; }
  function drawControls() {
    var sy = H - 104, sx = 71, r = 54;
    ctx.globalAlpha = .8; ctx.fillStyle = 'rgba(5,15,22,.66)'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6aa394'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(128,211,176,.48)'; ctx.beginPath(); ctx.arc(sx + stick.x * 25, sy + stick.y * 25, 23, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; text('MOVE', sx, sy + 1, 9, '#d3e7d2', 'center', 800);
    var p = playerEntity(), hero = heroes[selected]; for (var i = 0; i < 3; i++) { var x = W - 173 + i * 57, y = H - 103, ready = p && p.abilityCd <= 0 && p.respawn <= 0; ctx.globalAlpha = ready ? 1 : .55; ctx.shadowColor = hero.color; ctx.shadowBlur = ready ? 10 : 0; roundRect(x, y - 26, 50, 52, 14, hero.dark, hero.color); ctx.shadowBlur = 0; text(hero.icon, x + 25, y - 5, 18, hero.color, 'center', 900); var label = i === 0 ? 'J' : i === 1 ? 'K' : 'L'; text(label, x + 8, y + 16, 9, '#f5efd0', 'left', 900); var cd = p ? Math.ceil(p.abilityCd) : 0; text(i === 0 ? hero.ability : cd ? cd + 's' : 'READY', x + 25, y + 16, 7, cd ? '#ffd096' : '#d8f5df', 'center', 800); ctx.globalAlpha = 1; }
    text('AUTO HITS NEAREST', W / 2, H - 28, 9, '#96b7ae', 'center', 700);
  }
  function drawSelect() {
    ctx.fillStyle = 'rgba(3,12,19,.66)'; ctx.fillRect(0, 0, W, H);
    text('RIDGELINE', W / 2, 42, 27, '#d9f3d0', 'center', 900); text('RUMBLE', W / 2, 70, 27, '#f0c778', 'center', 900); text('ONE LANE. SIX WAYS TO PUSH.', W / 2, 99, 10, '#8bd9bf', 'center', 800);
    text('PICK YOUR RUNNER', W / 2, 125, 11, '#eef5d4', 'center', 900);
    var gap = 8, cw = (W - 28 - gap) / 2, ch = 63, top = 143;
    heroes.forEach(function (h, i) { var col = i % 2, row = Math.floor(i / 2), x = 14 + col * (cw + gap), y = top + row * (ch + gap), active = i === selected; ctx.globalAlpha = active ? 1 : .76; roundRect(x, y, cw, ch, 14, active ? h.dark : 'rgba(14,36,44,.92)', active ? h.color : '#36525a'); ctx.globalAlpha = 1; ctx.fillStyle = h.color; ctx.beginPath(); ctx.arc(x + 25, y + 31, 16, 0, TAU); ctx.fill(); text(h.icon, x + 25, y + 32, 14, '#12232b', 'center', 900); text(h.name, x + 49, y + 21, 11, h.color, 'left', 900); text(h.role, x + 49, y + 38, 7, '#e0ecd3', 'left', 800); text(h.desc, x + 49, y + 52, 7, '#a9c9bf', 'left', 600); });
    var choice = heroes[selected]; text(choice.name + ' · ' + choice.ability, W / 2, 362, 11, choice.color, 'center', 900); text('WINS ' + profile.wins + '   LOSSES ' + profile.losses + (profile.best ? '   BEST ' + fmtTime(profile.best) : ''), W / 2, 385, 9, '#bdd2c9', 'center', 700); text('FIRST TAP WAKES AUDIO', W / 2, H - 119, 9, '#8aa9a0', 'center', 700);
    roundRect(32, H - 96, W - 64, 56, 17, choice.color, choice.color); text('TAP A KIT TO DROP IN', W / 2, H - 68, 14, '#10232a', 'center', 900); text('WASD + JKL WORK TOO', W / 2, H - 17, 9, '#9ec4b8', 'center', 700);
  }
  function drawResult() {
    ctx.fillStyle = 'rgba(3,11,17,.72)'; ctx.fillRect(0, 0, W, H); var win = mode === 'win', col = win ? '#baffce' : '#ff9c9c';
    text(result, W / 2, H * .34, 28, col, 'center', 900); text(win ? 'THE FAR TOWER FELL.' : 'THE CLOCK OR FAR TOWER WON.', W / 2, H * .34 + 36, 10, '#d9e8d8', 'center', 800); text(win ? '+1 MASTERY  ·  BOTS HEATEN' : 'RUN IT BACK  ·  FIND THE LAST HITS', W / 2, H * .34 + 61, 9, '#ffd56a', 'center', 800);
    roundRect(32, H * .54, W - 64, 54, 16, col, col); text('RUMBLE AGAIN', W / 2, H * .54 + 27, 14, '#10232a', 'center', 900); text('TAP TO PICK A NEW RUNNER', W / 2, H * .54 + 86, 9, '#a8c6bd', 'center', 700); text('MASTERY ' + heroes[selected].name + ': ' + (profile.mastery[heroes[selected].name] || 0), W / 2, H * .54 + 113, 10, heroes[selected].color, 'center', 800);
  }
  function drawRotate() { ctx.fillStyle = 'rgba(2,8,13,.96)'; ctx.fillRect(0, 0, W, H); text('PORTRAIT MODE', W / 2, H / 2 - 24, 22, '#e8f3d6', 'center', 900); text('TURN YOUR PHONE UPRIGHT', W / 2, H / 2 + 15, 10, '#8bd9bf', 'center', 800); text('THE RUMBLE IS PAUSED', W / 2, H / 2 + 42, 9, '#9bb4aa', 'center', 700); }
  function localPoint(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  function heroAt(pt) { var gap = 8, cw = (W - 28 - gap) / 2, ch = 63, top = 143; for (var i = 0; i < heroes.length; i++) { var x = 14 + (i % 2) * (cw + gap), y = top + Math.floor(i / 2) * (ch + gap); if (pt.x >= x && pt.x <= x + cw && pt.y >= y && pt.y <= y + ch) return i; } return -1; }
  function controlAt(pt) {
    if (mode === 'select') { var hi = heroAt(pt); if (hi >= 0) return { type: 'hero', index: hi }; return null; }
    if (mode === 'win' || mode === 'loss') { if (pt.y > H * .50 && pt.y < H * .50 + 80) return { type: 'restart' }; if (pt.y > H * .50 + 76 && pt.y < H * .50 + 136) return { type: 'select' }; return null; }
    if (mode !== 'playing' || window.innerWidth > window.innerHeight) return null;
    for (var i = 0; i < 3; i++) { var bx = W - 173 + i * 57; if (pt.x >= bx - 8 && pt.x <= bx + 58 && pt.y >= H - 137 && pt.y <= H - 42) return { type: 'ability', index: i }; }
    for (var j = 0; j < shop.length; j++) { var sx = 9 + j * ((W - 18) / 3), sw = (W - 30) / 3; if (pt.x >= sx && pt.x <= sx + sw && pt.y >= 69 && pt.y <= 121) return { type: 'shop', index: j }; }
    if (Math.hypot(pt.x - 71, pt.y - (H - 104)) <= 72) return { type: 'stick' };
    return null;
  }
  function pointerDown(e) {
    e.preventDefault(); unlockAudio(); var pt = localPoint(e), c = controlAt(pt); if (!c) return;
    if (pointerMap.size >= 8) releaseAllInput();
    if (c.type === 'stick' && stickId !== null) return;
    if (c.type === 'ability' && abilityPointer[c.index] !== null) return;
    pointerMap.set(e.pointerId, c); try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (c.type === 'stick') { stickId = e.pointerId; updateStick(pt); }
    else if (c.type === 'ability') { abilityPointer[c.index] = e.pointerId; abilityQueue.push(c.index); if (abilityQueue.length > 4) abilityQueue.shift(); }
    else if (c.type === 'hero') { selected = c.index; setupMatch(); }
    else if (c.type === 'restart') { setupMatch(); }
    else if (c.type === 'select') { mode = 'select'; resetInput(); }
    else if (c.type === 'shop') { buy(c.index); }
  }
  function updateStick(pt) { var dx = pt.x - 71, dy = pt.y - (H - 104), m = Math.hypot(dx, dy); if (m > 48) { dx = dx / m * 48; dy = dy / m * 48; } stick.x = dx / 48; stick.y = dy / 48; }
  function pointerMove(e) { var c = pointerMap.get(e.pointerId); if (c && c.type === 'stick') { e.preventDefault(); updateStick(localPoint(e)); } }
  function pointerUp(e) { var c = pointerMap.get(e.pointerId); if (!c) return; e.preventDefault(); if (c.type === 'stick') { stickId = null; stick.x = 0; stick.y = 0; } if (c.type === 'ability') abilityPointer[c.index] = null; pointerMap.delete(e.pointerId); try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
  function releaseAllInput() { resetInput(); }
  canvas.addEventListener('pointerdown', pointerDown, { passive: false }); canvas.addEventListener('pointermove', pointerMove, { passive: false }); canvas.addEventListener('pointerup', pointerUp, { passive: false }); canvas.addEventListener('pointercancel', pointerUp, { passive: false });
  window.addEventListener('blur', releaseAllInput); document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAllInput(); });
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', function () { resize(); releaseAllInput(); });
  window.addEventListener('keydown', function (e) { var k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'j', 'k', 'l', ' '].indexOf(k) >= 0) e.preventDefault(); unlockAudio(); if (keys.size < 16) keys.add(k); if ((k === 'j' || k === 'k' || k === 'l') && !e.repeat && mode === 'playing') { abilityQueue.push(k === 'j' ? 0 : k === 'k' ? 1 : 2); if (abilityQueue.length > 4) abilityQueue.shift(); } if (k === ' ' && (mode === 'select' || mode === 'win' || mode === 'loss')) { if (mode === 'select') setupMatch(); else { mode = 'select'; resetInput(); } } });
  window.addEventListener('keyup', function (e) { keys.delete(e.key.toLowerCase()); });
  function frame(ts) { if (!lastFrame) lastFrame = ts; var dt = Math.min(.05, Math.max(0, (ts - lastFrame) / 1000)); lastFrame = ts; var rotated = window.innerWidth > window.innerHeight; if (!rotated) update(dt); render(); requestAnimationFrame(frame); }
  resize(); render(); requestAnimationFrame(frame);
}());
