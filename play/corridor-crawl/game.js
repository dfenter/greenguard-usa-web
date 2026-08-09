/* Corridor Crawl - turn-based roguelike. Vanilla JS + canvas. */
(function (g) {
  'use strict';
  var CC = g.CC, T = CC.TILE, DIRS = CC.DIRS;
  var canvas = document.getElementById('c'), ctx = canvas.getContext('2d', { alpha: false });

  /* ------------------------------------------------------------------ *
   * Layout
   * ------------------------------------------------------------------ */
  var L = { w: 390, h: 700, ts: 36, cols: 10, rows: 12, mapY: 88, mapH: 400, barY: 600, barH: 92 };

  function resize() {
    var vw = Math.max(240, window.innerWidth), vh = Math.max(360, window.innerHeight);
    var cw = Math.min(vw, 520), ch = vh;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    dpr = Math.min(dpr, 960 / Math.max(cw, ch));
    dpr = Math.max(1, dpr);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    L.w = cw; L.h = ch;
    L.hudH = 56; L.logH = 32;
    L.mapY = L.hudH + L.logH;
    L.barH = Math.min(96, Math.max(74, Math.round(ch * 0.13)));
    L.barY = ch - L.barH;
    L.mapH = L.barY - L.mapY;
    var ts = Math.floor(Math.min(cw / 9, L.mapH / 12));
    L.ts = Math.max(48, ts);
    L.cols = Math.min(CC.MAPW, Math.max(5, Math.floor(cw / L.ts)));
    L.rows = Math.min(CC.MAPH, Math.max(5, Math.floor(L.mapH / L.ts)));
    L.mapX0 = Math.round((cw - L.cols * L.ts) / 2);
    L.mapY0 = Math.round(L.mapY + (L.mapH - L.rows * L.ts) / 2);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  /* ------------------------------------------------------------------ *
   * Content: items
   * ------------------------------------------------------------------ */
  var POTIONS = {
    mend: { name: 'Mending', col: '#4ee08a', desc: 'Knits your wounds shut.' },
    fury: { name: 'Fury', col: '#ff7a4d', desc: 'Rage sharpens every swing.' },
    quick: { name: 'Quickening', col: '#ffe14d', desc: 'The dungeon slows around you.' },
    bile: { name: 'Bile', col: '#8f5bd6', desc: 'It burns going down.' },
    sight: { name: 'Clarity', col: '#4dc9ff', desc: 'The floor lays itself bare.' }
  };
  var SCROLLS = {
    blink: { name: 'Displacement', desc: 'Folds you elsewhere on the floor.' },
    flame: { name: 'Scorching', desc: 'Burns everything you can see.' },
    ward: { name: 'Warding', desc: 'A shell of hardened air.' },
    terror: { name: 'Terror', desc: 'Nearby things forget their courage.' },
    mapping: { name: 'Surveying', desc: 'Draws the whole floor in your mind.' }
  };
  var SHADES = ['Murky', 'Fizzing', 'Amber', 'Violet', 'Silver', 'Ashen', 'Teal', 'Rust'];
  var GLYPHS = ['ZUX MOR', 'VELN ATH', 'KIRRA DOM', 'OSSE VAIL', 'THRAN EKO', 'UMBEL RIX', 'NAAD SOLM'];

  /* ------------------------------------------------------------------ *
   * Content: monsters
   * ------------------------------------------------------------------ */
  var MON = {
    rat: { name: 'Gnaw Rat', hp: 5, dmg: [1, 3], def: 0, xp: 2, spd: 1, col: '#b98a5a', min: 1, w: 5, pack: [2, 4] },
    ooze: { name: 'Split Ooze', hp: 11, dmg: [2, 4], def: 1, xp: 6, spd: 0.75, col: '#66d97a', min: 1, w: 4 },
    archer: { name: 'Quill Archer', hp: 8, dmg: [2, 5], def: 0, xp: 7, spd: 1, col: '#e0d24a', min: 2, w: 4 },
    stalker: { name: 'Hollow Stalker', hp: 10, dmg: [3, 6], def: 1, xp: 9, spd: 1, col: '#c96de0', min: 3, w: 3 },
    brute: { name: 'Rubble Brute', hp: 22, dmg: [4, 9], def: 2, xp: 14, spd: 0.5, col: '#9aa4b4', min: 3, w: 3 },
    thief: { name: 'Ash Cutpurse', hp: 7, dmg: [1, 2], def: 1, xp: 8, spd: 1, col: '#5ad6d6', min: 2, w: 3 }
  };
  var MONKEYS = Object.keys(MON);

  /* ------------------------------------------------------------------ *
   * Game state
   * ------------------------------------------------------------------ */
  var S = null, parts = new CC.Particles(), shake = 0, flash = 0, flashCol = '#f00';
  var best = 0;
  try { var storedBest = parseInt(localStorage.getItem('cc_best') || '0', 10); best = Number.isFinite(storedBest) && storedBest >= 0 ? storedBest : 0; } catch (e) { best = 0; }

  function log(msg, col) {
    S.log.push({ t: msg, c: col || '#c8d0e0' });
    if (S.log.length > 6) S.log.shift();
  }

  function newGame() {
    parts.clear(); shake = 0; flash = 0;
    press = null; pressId = null; mouseDown = false;
    var seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    S = {
      seed: seed, rng: new CC.RNG(seed),
      depth: 1, maxDepth: 1, turn: 0, kills: 0, gold: 0,
      state: 'play', log: [], hasCrown: false, ascending: false,
      p: {
        x: 0, y: 0, ax: 0, ay: 0, hp: 26, maxhp: 26, atk: [2, 5], def: 0,
        lvl: 1, xp: 0, next: 12, food: 900, might: 0, haste: 0, ward: 0, regen: 0
      },
      inv: [], ident: {}, shade: {}, glyph: {},
      level: null, mons: [], projectiles: [], hintT: 0, inspect: null
    };
    // randomised appearances per run
    var sh = S.rng.shuffle(SHADES.slice()), gl = S.rng.shuffle(GLYPHS.slice()), i = 0;
    for (var k in POTIONS) S.shade[k] = sh[i++];
    i = 0; for (var k2 in SCROLLS) S.glyph[k2] = gl[i++];
    S.inv.push({ key: 'ration', kind: 'food', n: 1 });
    S.inv.push({ key: 'mend', kind: 'potion', n: 1 });
    genFloor(1, false);
    log('Depth 1. Something below is humming.', '#9fb0c8');
  }

  function genFloor(depth, arriveAtDown) {
    var lvl = new CC.Level(depth, S.rng);
    S.level = lvl; S.mons = []; S.projectiles = [];
    lvl.items = []; lvl.golds = [];
    var p = S.p;
    if (arriveAtDown) { p.x = lvl.downx; p.y = lvl.downy; }
    else { p.x = lvl.upx; p.y = lvl.upy; }
    p.ax = p.x; p.ay = p.y;

    var extra = S.hasCrown ? 4 : 0;
    var count = 4 + Math.floor(depth * 0.9) + extra;
    var cap = 20 + extra;
    var avoid = [{ x: p.x, y: p.y }];
    var attempts = 0;
    for (var i = 0; i < count && S.mons.length < cap; i++) {
      var key = pickMonster(depth);
      var spot = lvl.randomFloor(S.rng, avoid);
      if (CC.dist(spot.x, spot.y, p.x, p.y) < 6 && attempts++ < 60) { i--; avoid.push(spot); continue; }
      if (monAt(spot.x, spot.y)) { if (attempts++ < 60) { i--; } continue; }
      spawnMon(key, spot.x, spot.y, depth);
      if (MON[key].pack) {
        var n = S.rng.int(MON[key].pack[0], MON[key].pack[1]);
        for (var j = 0; j < n; j++) {
          var d = S.rng.pick(DIRS), nx = spot.x + d[0], ny = spot.y + d[1];
          if (lvl.walkable(nx, ny) && !monAt(nx, ny)) spawnMon(key, nx, ny, depth);
        }
      }
    }
    // items
    var nit = S.rng.int(2, 4) + (depth > 3 ? 1 : 0);
    for (var q = 0; q < nit; q++) {
      var s2 = lvl.randomFloor(S.rng);
      lvl.items.push({ x: s2.x, y: s2.y, key: randomItemKey() });
    }
    var ng = S.rng.int(2, 4);
    for (var q2 = 0; q2 < ng; q2++) {
      var s3 = lvl.randomFloor(S.rng);
      lvl.golds.push({ x: s3.x, y: s3.y, amt: S.rng.int(4, 12) + depth * 3 });
    }
    if (depth >= 8 && !S.hasCrown) {
      var r = lvl.rooms[lvl.rooms.length - 1];
      lvl.items.push({ x: r.cx, y: r.cy - 1 >= r.y ? r.cy - 1 : r.cy, key: 'crown' });
      for (var b = 0; b < 3; b++) {
        var d2 = DIRS[b * 2], bx = r.cx + d2[0] * 2, by = r.cy + d2[1] * 2;
        if (lvl.walkable(bx, by) && !monAt(bx, by)) spawnMon('brute', bx, by, depth);
      }
    }
    lvl.computeFov(p.x, p.y, fovRadius());
    updateMonsterSight();
  }

  function fovRadius() { return 7; }

  function pickMonster(depth) {
    var pool = [];
    for (var i = 0; i < MONKEYS.length; i++) {
      var k = MONKEYS[i], m = MON[k];
      if (depth < m.min) continue;
      var w = m.w + (depth >= m.min + 2 ? 1 : 0);
      for (var j = 0; j < w; j++) pool.push(k);
    }
    if (!pool.length) pool.push('rat');
    return S.rng.pick(pool);
  }

  function spawnMon(key, x, y, depth, hpOverride, size) {
    var t = MON[key];
    var hp = hpOverride != null ? hpOverride : t.hp + Math.floor((depth - 1) * 1.6);
    var m = {
      key: key, name: t.name, x: x, y: y, ax: x, ay: y,
      hp: hp, maxhp: Math.max(hp, t.hp), dmg: [t.dmg[0] + Math.floor((depth - 1) * 0.4), t.dmg[1] + Math.floor((depth - 1) * 0.6)],
      def: t.def + (depth > 5 ? 1 : 0), xp: t.xp, spd: t.spd, col: t.col,
      energy: 0, awake: false, fear: 0, loot: null, size: size == null ? 2 : size, hurt: 0
    };
    S.mons.push(m);
    return m;
  }

  function randomItemKey() {
    var r = S.rng.f();
    if (r < 0.20) return 'ration';
    if (r < 0.62) {
      var pk = Object.keys(POTIONS);
      var wts = { mend: 5, fury: 2, quick: 2, bile: 2, sight: 2 };
      var pool = []; pk.forEach(function (k) { for (var i = 0; i < wts[k]; i++) pool.push(k); });
      return S.rng.pick(pool);
    }
    return S.rng.pick(Object.keys(SCROLLS));
  }

  function itemKind(key) {
    if (key === 'ration') return 'food';
    if (key === 'crown') return 'crown';
    if (POTIONS[key]) return 'potion';
    return 'scroll';
  }
  function itemName(key) {
    var k = itemKind(key);
    if (k === 'food') return 'Dry Ration';
    if (k === 'crown') return 'Crown of Echoes';
    if (k === 'potion') return S.ident[key] ? 'Potion of ' + POTIONS[key].name : S.shade[key] + ' Potion';
    return S.ident[key] ? 'Scroll of ' + SCROLLS[key].name : 'Scroll "' + S.glyph[key] + '"';
  }
  function itemDesc(key) {
    var k = itemKind(key);
    if (k === 'food') return 'Chewy. Quiets the hunger.';
    if (k === 'crown') return 'It repeats what it hears. Carry it up and out.';
    if (!S.ident[key]) return 'You have not tried this one yet.';
    return (POTIONS[key] || SCROLLS[key]).desc;
  }
  function itemColor(key) {
    var k = itemKind(key);
    if (k === 'food') return '#c9a86a';
    if (k === 'crown') return '#ffd24d';
    if (k === 'potion') return POTIONS[key].col;
    return '#dfe6f2';
  }

  function addItem(key) {
    for (var i = 0; i < S.inv.length; i++) if (S.inv[i].key === key) { S.inv[i].n++; return true; }
    if (S.inv.length >= 6) return false;
    S.inv.push({ key: key, kind: itemKind(key), n: 1 });
    return true;
  }

  function monAt(x, y) {
    for (var i = 0; i < S.mons.length; i++) if (S.mons[i].x === x && S.mons[i].y === y && S.mons[i].hp > 0) return S.mons[i];
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Player actions
   * ------------------------------------------------------------------ */
  function playerMove(dx, dy) {
    if (S.state !== 'play') return;
    var p = S.p, nx = p.x + dx, ny = p.y + dy;
    if (dx === 0 && dy === 0) { useStairsIfAny(true); return; }
    var m = monAt(nx, ny);
    if (m) { playerAttack(m); endTurn(); return; }
    if (!S.level.walkable(nx, ny)) { return; }
    // no cutting diagonal corners through walls
    if (dx !== 0 && dy !== 0 && !S.level.walkable(p.x + dx, p.y) && !S.level.walkable(p.x, p.y + dy)) return;
    p.x = nx; p.y = ny;
    CC.SFX.step();
    pickupHere();
    endTurn();
    useStairsIfAny(false);
  }

  function pickupHere() {
    var lvl = S.level, p = S.p, i;
    for (i = lvl.golds.length - 1; i >= 0; i--) {
      if (lvl.golds[i].x === p.x && lvl.golds[i].y === p.y) {
        S.gold += lvl.golds[i].amt;
        log('+' + lvl.golds[i].amt + ' gold.', '#ffd24d');
        parts.text(sx(p.x) + L.ts / 2, sy(p.y), '+' + lvl.golds[i].amt, '#ffd24d');
        lvl.golds.splice(i, 1); CC.SFX.pickup();
      }
    }
    for (i = lvl.items.length - 1; i >= 0; i--) {
      var it = lvl.items[i];
      if (it.x !== p.x || it.y !== p.y) continue;
      if (it.key === 'crown') {
        S.hasCrown = true; lvl.items.splice(i, 1);
        log('The Crown of Echoes is yours. CLIMB.', '#ffd24d');
        CC.SFX.win(); shake = 14;
        parts.burst(sx(p.x) + L.ts / 2, sy(p.y) + L.ts / 2, '#ffd24d', 34, 170, 0.9);
        // the floor wakes up
        for (var q = 0; q < S.mons.length; q++) S.mons[q].awake = true;
        continue;
      }
      if (addItem(it.key)) {
        log('Picked up ' + itemName(it.key) + '.', '#a9e6ff');
        CC.SFX.pickup(); lvl.items.splice(i, 1);
      } else { log('Your pack is full.', '#ff8a6a'); }
    }
  }

  function useStairsIfAny(explicit) {
    if (S.state !== 'play') return false;
    var t = S.level.at(S.p.x, S.p.y);
    if (t === T.DOWN) { descend(); return true; }
    if (t === T.UP) { ascend(); return true; }
    if (explicit) { endTurn(); }
    return false;
  }

  function descend() {
    S.depth++; if (S.depth > S.maxDepth) S.maxDepth = S.depth;
    CC.SFX.stairs();
    genFloor(S.depth, false);
    log('Depth ' + S.depth + '.', '#9fb0c8');
    if (S.depth === 8 && !S.hasCrown) log('The humming is right here.', '#ffd24d');
  }
  function ascend() {
    if (S.depth === 1) {
      if (S.hasCrown) { winGame(); }
      else { log('The way out stays shut without the Crown.', '#ff8a6a'); }
      return;
    }
    S.depth--; CC.SFX.stairs();
    genFloor(S.depth, true);
    log('Depth ' + S.depth + (S.hasCrown ? '. It follows you up.' : '.'), S.hasCrown ? '#ffb04d' : '#9fb0c8');
  }

  function playerAttack(m) {
    var p = S.p;
    var dmg = S.rng.int(p.atk[0], p.atk[1]) + p.might;
    dmg = Math.max(1, dmg - S.rng.int(0, m.def));
    hurtMon(m, dmg, true);
  }

  function hurtMon(m, dmg, byPlayer) {
    m.hp -= dmg; m.awake = true; m.hurt = 0.22;
    parts.text(sx(m.x) + L.ts / 2, sy(m.y) + L.ts * 0.3, '' + dmg, '#ffdf6a');
    parts.burst(sx(m.x) + L.ts / 2, sy(m.y) + L.ts / 2, m.col, 8, 100, 0.35);
    shake = Math.max(shake, 5);
    CC.SFX.hit();
    if (m.key === 'ooze' && m.hp > 1 && m.size > 0) splitOoze(m);
    if (m.hp <= 0) killMon(m, byPlayer);
  }

  function splitOoze(m) {
    var free = [];
    for (var i = 0; i < DIRS.length; i++) {
      var nx = m.x + DIRS[i][0], ny = m.y + DIRS[i][1];
      if (S.level.walkable(nx, ny) && !monAt(nx, ny) && !(S.p.x === nx && S.p.y === ny)) free.push([nx, ny]);
    }
    if (!free.length) return;
    var half = Math.max(1, Math.floor(m.hp / 2));
    m.hp = Math.max(1, m.hp - half);
    m.size--;
    var spot = S.rng.pick(free);
    var c = spawnMon('ooze', spot[0], spot[1], S.depth, half, m.size);
    c.awake = true; c.name = 'Split Ooze';
    parts.burst(sx(spot[0]) + L.ts / 2, sy(spot[1]) + L.ts / 2, '#66d97a', 10, 110, 0.4);
    log('The ooze splits.', '#66d97a');
  }

  function killMon(m, byPlayer) {
    m.hp = 0;
    parts.burst(sx(m.x) + L.ts / 2, sy(m.y) + L.ts / 2, m.col, 18, 150, 0.6);
    CC.SFX.kill();
    if (m.loot) {
      if (m.loot.gold) { S.gold += m.loot.gold; log('You take back ' + m.loot.gold + ' gold.', '#ffd24d'); }
      if (m.loot.item) { addItem(m.loot.item); log('You take back the ' + itemName(m.loot.item) + '.', '#a9e6ff'); }
    }
    if (byPlayer) {
      S.kills++;
      S.p.xp += m.xp;
      while (S.p.xp >= S.p.next) {
        S.p.xp -= S.p.next; S.p.lvl++; S.p.next = 10 + S.p.lvl * 8;
        S.p.maxhp += 5; S.p.hp = Math.min(S.p.maxhp, S.p.hp + 5);
        S.p.atk[0]++; S.p.atk[1]++;
        log('You steady. Level ' + S.p.lvl + '.', '#4ee08a');
        parts.text(sx(S.p.x) + L.ts / 2, sy(S.p.y) - 6, 'LEVEL UP', '#4ee08a');
      }
    }
    var i = S.mons.indexOf(m); if (i >= 0) S.mons.splice(i, 1);
  }

  function hurtPlayer(dmg, src) {
    var p = S.p;
    dmg = Math.max(1, dmg - p.ward - S.rng.int(0, p.def));
    p.hp -= dmg;
    parts.text(sx(p.x) + L.ts / 2, sy(p.y) + L.ts * 0.3, '-' + dmg, '#ff6a6a');
    shake = Math.max(shake, 8); flash = 0.25; flashCol = '#ff3b3b';
    CC.SFX.hurt();
    if (p.hp <= 0) { p.hp = 0; die(src); }
  }

  function die(src) {
    if (S.state !== 'play') return;
    S.state = 'dead';
    S.finalScore = score();
    saveBest(S.finalScore);
    S.deathBy = src || 'the dark';
    CC.SFX.die(); shake = 16;
  }
  function winGame() {
    S.state = 'won';
    S.finalScore = score() + 100;
    saveBest(S.finalScore);
    CC.SFX.win(); shake = 10;
  }
  function score() { return S.maxDepth * 10 + S.kills * 3 + S.gold; }
  function saveBest(v) {
    if (v > best) { best = v; try { localStorage.setItem('cc_best', String(best)); } catch (e) { } }
  }

  /* ------------------------------------------------------------------ *
   * Items in use
   * ------------------------------------------------------------------ */
  function useSlot(i) {
    if (S.state !== 'play') return;
    var slot = S.inv[i]; if (!slot) return;
    var key = slot.key;
    slot.n--; if (slot.n <= 0) S.inv.splice(i, 1);
    applyItem(key);
    endTurn();
  }

  function applyItem(key) {
    var p = S.p, kind = itemKind(key);
    if (kind === 'food') {
      p.food = Math.min(1200, p.food + 550);
      log('You eat. Steadier now.', '#c9a86a'); CC.SFX.quaff(); return;
    }
    var wasNew = !S.ident[key];
    S.ident[key] = true;
    if (kind === 'potion') {
      CC.SFX.quaff();
      parts.burst(sx(p.x) + L.ts / 2, sy(p.y) + L.ts / 2, POTIONS[key].col, 16, 110, 0.6);
      if (key === 'mend') {
        var heal = Math.floor((p.maxhp - p.hp) * 0.6) + 8;
        p.hp = Math.min(p.maxhp, p.hp + heal);
        log('Mending: +' + heal + ' HP.', '#4ee08a');
      } else if (key === 'fury') { p.might += 3; p.furyT = 24; log('Fury: your swings bite.', '#ff7a4d'); }
      else if (key === 'quick') { p.haste = 14; log('Quickening: the dungeon lags.', '#ffe14d'); }
      else if (key === 'bile') { log('Bile! That was a mistake.', '#ff6a6a'); CC.SFX.bad(); hurtPlayer(6 + S.depth, 'a bad draught'); }
      else if (key === 'sight') {
        p.sight = 40; log('Clarity: you see further.', '#4dc9ff');
      }
    } else {
      CC.SFX.scroll();
      parts.burst(sx(p.x) + L.ts / 2, sy(p.y) + L.ts / 2, '#dfe6f2', 16, 120, 0.6);
      if (key === 'blink') {
        var s = S.level.randomFloor(S.rng);
        p.x = s.x; p.y = s.y; p.ax = s.x; p.ay = s.y;
        log('Displacement: elsewhere.', '#a9e6ff');
      } else if (key === 'flame') {
        var n = 0;
        for (var i = S.mons.length - 1; i >= 0; i--) {
          var m = S.mons[i];
          if (CC.dist(m.x, m.y, p.x, p.y) <= 5 && S.level.los(p.x, p.y, m.x, m.y)) {
            hurtMon(m, 9 + S.depth, true); n++;
          }
        }
        shake = 12; flash = 0.2; flashCol = '#ff9a3b';
        log(n ? 'Scorching: ' + n + ' seared.' : 'Scorching: nothing to burn.', '#ff9a3b');
      } else if (key === 'ward') { p.ward = 3; p.wardT = 22; log('Warding: blows glance off.', '#4dc9ff'); }
      else if (key === 'terror') {
        var c = 0;
        for (var j = 0; j < S.mons.length; j++) {
          var mm = S.mons[j];
          if (CC.dist(mm.x, mm.y, p.x, p.y) <= 7) { mm.fear = 12; c++; }
        }
        log(c ? 'Terror: ' + c + ' turn to flee.' : 'Terror: nothing hears it.', '#c96de0');
      } else if (key === 'mapping') {
        S.level.seen.fill(1);
        log('Surveying: the floor unfolds.', '#a9e6ff');
      }
    }
    if (wasNew) log('It was ' + itemName(key) + '.', '#9fb0c8');
  }

  /* ------------------------------------------------------------------ *
   * Turn resolution
   * ------------------------------------------------------------------ */
  function endTurn() {
    if (S.state !== 'play') return;
    var p = S.p;
    S.turn++;

    // hunger + regen
    p.food--;
    if (p.food <= 0) {
      p.food = 0;
      if (S.turn % 6 === 0) { p.hp -= 1; parts.text(sx(p.x) + L.ts / 2, sy(p.y), 'starving', '#ff8a6a'); if (p.hp <= 0) { die('hunger'); return; } }
    } else {
      var rate = p.food > 300 ? 11 : 22;
      p.regen++;
      if (p.regen >= rate && p.hp < p.maxhp) { p.regen = 0; p.hp++; }
    }
    if (p.food === 200) log('Hunger gnaws. Regeneration slows.', '#ff8a6a');
    if (p.food === 1) log('You are starving.', '#ff6a6a');

    // buff timers
    if (p.furyT > 0) { p.furyT--; if (p.furyT === 0) { p.might = Math.max(0, p.might - 3); log('The fury fades.', '#9fb0c8'); } }
    if (p.wardT > 0) { p.wardT--; if (p.wardT === 0) { p.ward = 0; log('The ward fades.', '#9fb0c8'); } }
    if (p.haste > 0) p.haste--;
    if (p.sight > 0) p.sight--;

    S.level.computeFov(p.x, p.y, p.sight > 0 ? 12 : fovRadius());
    updateMonsterSight();

    // monsters act
    var gain = p.haste > 0 ? 0.5 : 1;
    for (var i = S.mons.length - 1; i >= 0; i--) {
      var m = S.mons[i];
      if (m.hp <= 0) continue;
      m.energy += m.spd * gain;
      var guard = 0;
      while (m.energy >= 1 && m.hp > 0 && S.state === 'play' && guard++ < 3) {
        m.energy -= 1;
        monTurn(m);
      }
      if (m.fear > 0) m.fear--;
    }
    S.level.computeFov(p.x, p.y, p.sight > 0 ? 12 : fovRadius());
    updateMonsterSight();
  }

  function updateMonsterSight() {
    for (var i = 0; i < S.mons.length; i++) {
      var m = S.mons[i];
      if (!m.awake && CC.dist(m.x, m.y, S.p.x, S.p.y) <= 8 && S.level.los(m.x, m.y, S.p.x, S.p.y)) m.awake = true;
    }
  }

  function monTurn(m) {
    var p = S.p, d = CC.dist(m.x, m.y, p.x, p.y);
    if (!m.awake) {
      if (S.rng.chance(0.25)) wander(m);
      return;
    }
    if (m.fear > 0) { fleeFrom(m, p.x, p.y); return; }

    switch (m.key) {
      case 'archer': return archerTurn(m, d);
      case 'thief': return thiefTurn(m, d);
      case 'rat': return ratTurn(m, d);
      case 'brute': return bruteTurn(m, d);
      case 'stalker': return stalkerTurn(m, d);
      default:
        if (d <= 1) monAttack(m); else moveToward(m, p.x, p.y);
    }
  }

  function ratTurn(m, d) {
    if (d <= 1) {
      var bonus = 0;
      for (var i = 0; i < S.mons.length; i++) {
        var o = S.mons[i];
        if (o !== m && o.key === 'rat' && CC.dist(o.x, o.y, S.p.x, S.p.y) <= 1) bonus++;
      }
      monAttack(m, bonus, bonus ? 'the pack' : null);
    } else moveToward(m, S.p.x, S.p.y);
  }

  function bruteTurn(m, d) {
    if (d <= 1) {
      monAttack(m, 0, null, true);
    } else moveToward(m, S.p.x, S.p.y);
  }

  function stalkerTurn(m, d) {
    if (d <= 1) monAttack(m);
    else moveToward(m, S.p.x, S.p.y);
  }

  function archerTurn(m, d) {
    var p = S.p;
    if (d <= 1) { fleeFrom(m, p.x, p.y); return; }
    if (d <= 6 && S.level.los(m.x, m.y, p.x, p.y)) {
      if (d < 3 && S.rng.chance(0.5)) { fleeFrom(m, p.x, p.y); return; }
      if (S.rng.chance(0.7)) {
        for (var q = 1; q <= 6; q++) {
          var f = q / 7;
          parts.burst(sx(m.x + (p.x - m.x) * f) + L.ts / 2, sy(m.y + (p.y - m.y) * f) + L.ts / 2, '#e0d24a', 2, 22, 0.3);
        }
        var dmg = S.rng.int(m.dmg[0], m.dmg[1]);
        log(m.name + ' looses a quill.', '#e0d24a');
        hurtPlayer(dmg, m.name);
        return;
      }
      return; // hold position
    }
    moveToward(m, p.x, p.y);
  }

  function thiefTurn(m, d) {
    var p = S.p;
    if (m.loot) {
      fleeFrom(m, p.x, p.y); fleeFrom(m, p.x, p.y);
      if (CC.dist(m.x, m.y, p.x, p.y) >= 13) {
        log(m.name + ' vanishes with your things.', '#ff8a6a');
        var i = S.mons.indexOf(m); if (i >= 0) S.mons.splice(i, 1);
      }
      return;
    }
    if (d <= 1) {
      if (S.gold > 0 && S.rng.chance(0.6)) {
        var take = Math.max(1, Math.floor(S.gold * 0.5));
        S.gold -= take; m.loot = { gold: take };
        log(m.name + ' snatches ' + take + ' gold!', '#ff8a6a');
      } else if (S.inv.length) {
        var si = S.rng.int(0, S.inv.length - 1), s = S.inv[si];
        m.loot = { item: s.key };
        s.n--; if (s.n <= 0) S.inv.splice(si, 1);
        log(m.name + ' lifts your ' + itemName(m.loot.item) + '!', '#ff8a6a');
      } else { monAttack(m); return; }
      CC.SFX.bad(); flash = 0.2; flashCol = '#5ad6d6';
      fleeFrom(m, p.x, p.y);
      return;
    }
    moveToward(m, p.x, p.y);
  }

  function monAttack(m, bonus, why, knock) {
    var dmg = S.rng.int(m.dmg[0], m.dmg[1]) + (bonus || 0);
    parts.burst(sx(S.p.x) + L.ts / 2, sy(S.p.y) + L.ts / 2, m.col, 8, 90, 0.35);
    log(m.name + (why ? ' (with ' + why + ')' : '') + ' hits you.', '#ff8a6a');
    hurtPlayer(dmg, m.name);
    if (knock && S.state === 'play') {
      var dx = CC.sign(S.p.x - m.x), dy = CC.sign(S.p.y - m.y);
      var nx = S.p.x + dx, ny = S.p.y + dy;
      if (S.level.walkable(nx, ny) && !monAt(nx, ny)) {
        S.p.x = nx; S.p.y = ny; shake = 12;
        log('You are shoved back.', '#9aa4b4');
        S.level.computeFov(S.p.x, S.p.y, S.p.sight > 0 ? 12 : fovRadius());
      }
    }
  }

  function stepOk(m, nx, ny) {
    if (!S.level.walkable(nx, ny)) return false;
    if (monAt(nx, ny)) return false;
    if (S.p.x === nx && S.p.y === ny) return false;
    return true;
  }

  function moveToward(m, tx, ty) {
    var dx = CC.sign(tx - m.x), dy = CC.sign(ty - m.y);
    var opts = [[dx, dy], [dx, 0], [0, dy]];
    if (Math.abs(tx - m.x) < Math.abs(ty - m.y)) opts = [[dx, dy], [0, dy], [dx, 0]];
    opts.push([dx, dy === 0 ? (S.rng.chance(0.5) ? 1 : -1) : 0]);
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      if (o[0] === 0 && o[1] === 0) continue;
      var nx = m.x + o[0], ny = m.y + o[1];
      if (nx === S.p.x && ny === S.p.y) { monAttack(m); return; }
      if (stepOk(m, nx, ny)) { m.x = nx; m.y = ny; return; }
    }
  }

  function fleeFrom(m, tx, ty) {
    var dx = -CC.sign(tx - m.x), dy = -CC.sign(ty - m.y);
    var opts = [[dx, dy], [dx, 0], [0, dy], [dy, dx], [-dy, -dx]];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      if (o[0] === 0 && o[1] === 0) continue;
      var nx = m.x + o[0], ny = m.y + o[1];
      if (stepOk(m, nx, ny)) { m.x = nx; m.y = ny; return; }
    }
  }

  function wander(m) {
    var d = S.rng.pick(DIRS);
    if (stepOk(m, m.x + d[0], m.y + d[1])) { m.x += d[0]; m.y += d[1]; }
  }

  /* ------------------------------------------------------------------ *
   * Camera & coords
   * ------------------------------------------------------------------ */
  var cam = { x: 0, y: 0 };
  function updateCam(inst) {
    var tx = CC.clamp(S.p.ax - (L.cols - 1) / 2, 0, Math.max(0, CC.MAPW - L.cols));
    var ty = CC.clamp(S.p.ay - (L.rows - 1) / 2, 0, Math.max(0, CC.MAPH - L.rows));
    if (inst) { cam.x = tx; cam.y = ty; }
    else { cam.x = CC.lerp(cam.x, tx, 0.25); cam.y = CC.lerp(cam.y, ty, 0.25); }
  }
  function sx(tx) { return L.mapX0 + (tx - cam.x) * L.ts; }
  function sy(ty) { return L.mapY0 + (ty - cam.y) * L.ts; }
  function screenToTile(px, py) {
    return { x: Math.floor((px - L.mapX0) / L.ts + cam.x), y: Math.floor((py - L.mapY0) / L.ts + cam.y) };
  }

  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */
  var press = null, LONG = 430;

  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function onDown(x, y, id) {
    if (press) return;
    CC.audioInit(); CC.resumeAudio();
    press = { id: id, x: x, y: y, t: performance.now(), moved: false, fired: false };
  }
  function onMove(x, y, id) {
    if (!press || press.id !== id) return;
    if (Math.abs(x - press.x) > 14 || Math.abs(y - press.y) > 14) press.moved = true;
  }
  function onUp(x, y, id) {
    if (!press || press.id !== id) return;
    var p = press; press = null;
    pressId = null;
    if (p.fired) return;
    handleTap(p.x, p.y);
  }

  function handleTap(x, y) {
    if (S.inspect) { S.inspect = null; return; }
    if (S.state === 'dead' || S.state === 'won') { newGame(); updateCam(true); return; }
    // mute toggle
    if (x > L.w - 48 && y < 48) { CC.setMuted(!CC.isMuted()); return; }
    if (y >= L.barY) { tapBar(x, y); return; }
    if (y < L.mapY) return;
    var t = screenToTile(x, y);
    var dx = CC.clamp(t.x - S.p.x, -1, 1), dy = CC.clamp(t.y - S.p.y, -1, 1);
    if (t.x === S.p.x && t.y === S.p.y) { playerMove(0, 0); return; }
    playerMove(dx, dy);
  }

  function tapBar(x, y) {
    var n = 6, pad = 6;
    var slotW = (L.w - pad * (n + 1)) / n;
    for (var i = 0; i < n; i++) {
      var bx = pad + i * (slotW + pad);
      if (x >= bx - pad / 2 && x <= bx + slotW + pad / 2) { useSlot(i); return; }
    }
  }

  function inspectAt(x, y) {
    if (y >= L.barY) {
      var n = 6, pad = 6, slotW = (L.w - pad * (n + 1)) / n;
      var i = Math.floor((x - pad) / (slotW + pad));
      var s = S.inv[i];
      if (s) S.inspect = { title: itemName(s.key), body: itemDesc(s.key) + '\n\nYou carry ' + s.n + '.' };
      return;
    }
    if (y < L.mapY) return;
    var t = screenToTile(x, y);
    var lvl = S.level;
    if (t.x < 0 || t.y < 0 || t.x >= CC.MAPW || t.y >= CC.MAPH || !lvl.seen[t.y * CC.MAPW + t.x]) {
      S.inspect = { title: 'Unknown', body: 'You have not been there.' }; return;
    }
    if (t.x === S.p.x && t.y === S.p.y) {
      S.inspect = {
        title: 'You', body: 'Level ' + S.p.lvl + '  HP ' + S.p.hp + '/' + S.p.maxhp +
          '\nDamage ' + (S.p.atk[0] + S.p.might) + '-' + (S.p.atk[1] + S.p.might) +
          '\nGold ' + S.gold + '  Kills ' + S.kills + (S.hasCrown ? '\nYou carry the Crown of Echoes.' : '')
      };
      return;
    }
    var m = monAt(t.x, t.y);
    var vis = lvl.vis[t.y * CC.MAPW + t.x];
    if (m && vis && (m.key !== 'stalker' || CC.dist(m.x, m.y, S.p.x, S.p.y) <= 1)) {
      S.inspect = { title: m.name, body: monDesc(m.key) + '\n\nHP ' + m.hp + '/' + m.maxhp + '  hits for ' + m.dmg[0] + '-' + m.dmg[1] };
      return;
    }
    var it = null;
    for (var i = 0; i < lvl.items.length; i++) if (lvl.items[i].x === t.x && lvl.items[i].y === t.y) it = lvl.items[i];
    if (it) { S.inspect = { title: itemName(it.key), body: itemDesc(it.key) }; return; }
    for (var j = 0; j < lvl.golds.length; j++) if (lvl.golds[j].x === t.x && lvl.golds[j].y === t.y) {
      S.inspect = { title: 'Gold', body: 'A loose pile: ' + lvl.golds[j].amt + '.' }; return;
    }
    var tt = lvl.at(t.x, t.y);
    if (tt === T.WALL) S.inspect = { title: 'Wall', body: 'Cold cut stone.' };
    else if (tt === T.DOWN) S.inspect = { title: 'Stairs Down', body: 'Step on them to go deeper.' };
    else if (tt === T.UP) S.inspect = { title: 'Stairs Up', body: 'Step on them to climb.' };
    else S.inspect = { title: 'Floor', body: 'Grit and old dust.' };
  }

  function monDesc(k) {
    return {
      rat: 'Hunts in packs and hits harder with friends beside it.',
      ooze: 'Cut it and it becomes two smaller problems.',
      archer: 'Keeps its distance and looses quills down open lines.',
      stalker: 'Unseen until it is already next to you.',
      brute: 'Slow, heavy, and it shoves you off your feet.',
      thief: 'Takes gold or gear and runs. Kill it to get them back.'
    }[k] || '';
  }

  var pressId = null, mouseDown = false;
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (pressId !== null) return;
    pressId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    var p = canvasPos(e); onDown(p.x, p.y, e.pointerId);
  }, { passive: false });
  canvas.addEventListener('pointermove', function (e) {
    if (pressId !== e.pointerId) return;
    e.preventDefault();
    var p = canvasPos(e); onMove(p.x, p.y, e.pointerId);
  }, { passive: false });
  canvas.addEventListener('pointerup', function (e) {
    if (pressId !== e.pointerId) return;
    e.preventDefault();
    var p = canvasPos(e); onUp(p.x, p.y, e.pointerId);
  }, { passive: false });
  canvas.addEventListener('pointercancel', function (e) {
    if (pressId === e.pointerId) { press = null; pressId = null; }
  }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  var KEYMAP = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
    q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0]
  };
  window.addEventListener('keydown', function (e) {
    CC.audioInit(); CC.resumeAudio();
    if (S.inspect) { S.inspect = null; e.preventDefault(); return; }
    if (S.state !== 'play') {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'r' || e.key === 'R') { newGame(); updateCam(true); e.preventDefault(); }
      return;
    }
    var k = e.key;
    if (KEYMAP[k]) { playerMove(KEYMAP[k][0], KEYMAP[k][1]); e.preventDefault(); return; }
    if (k === ' ' || k === '.' || k === 'Enter') { playerMove(0, 0); e.preventDefault(); return; }
    if (k >= '1' && k <= '6') { useSlot(parseInt(k, 10) - 1); e.preventDefault(); return; }
    if (k === 'm' || k === 'M') { CC.setMuted(!CC.isMuted()); }
  });

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */
  var F = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function draw(dt) {
    var w = L.w, h = L.h;
    ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, w, h);

    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawMap();
    ctx.restore();

    drawHud();
    drawLog();
    drawBar();

    if (flash > 0) {
      ctx.globalAlpha = flash * 0.55; ctx.fillStyle = flashCol;
      ctx.fillRect(0, L.mapY, w, L.mapH); ctx.globalAlpha = 1;
    }

    if (S.turn < 8 && S.state === 'play') {
      var a = S.turn < 6 ? 1 : 1 - (S.turn - 6) / 2;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(6,8,14,0.72)';
      ctx.fillRect(0, L.mapY + L.mapH - 30, w, 30);
      ctx.fillStyle = '#cfe0ff'; ctx.font = '12px ' + F;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Tap a tile to move · tap yourself to wait', w / 2, L.mapY + L.mapH - 15);
      ctx.globalAlpha = 1;
    }

    if (S.inspect) drawInspect();
    if (S.state === 'dead') drawEnd(false);
    if (S.state === 'won') drawEnd(true);
  }

  function drawMap() {
    var lvl = S.level, ts = L.ts;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, L.mapY, L.w, L.mapH); ctx.clip();
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, L.mapY, L.w, L.mapH);

    var x0 = Math.floor(cam.x) - 1, y0 = Math.floor(cam.y) - 1;
    var x1 = x0 + L.cols + 3, y1 = y0 + L.rows + 3;

    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= CC.MAPW || y >= CC.MAPH) continue;
        var i = y * CC.MAPW + x;
        if (!lvl.seen[i]) continue;
        var v = lvl.vis[i];
        var px = sx(x), py = sy(y);
        if (px > L.w || py > L.mapY + L.mapH || px + ts < 0 || py + ts < -ts) continue;
        var t = lvl.tiles[i];
        if (t === T.WALL) {
          ctx.fillStyle = v ? '#333b52' : '#171d29';
          ctx.fillRect(px, py, ts, ts);
          ctx.fillStyle = v ? '#4a5674' : '#1e2534';
          ctx.fillRect(px, py, ts, Math.max(2, ts * 0.16));
        } else {
          ctx.fillStyle = v ? '#121722' : '#0c0f16';
          ctx.fillRect(px, py, ts, ts);
          ctx.fillStyle = v ? '#1c2334' : '#11151d';
          ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
          if (v) {
            ctx.fillStyle = 'rgba(120,140,180,0.10)';
            ctx.fillRect(px + ts * 0.45, py + ts * 0.45, 2, 2);
          }
          if (t === T.DOWN) drawStairs(px, py, ts, v, true);
          else if (t === T.UP) drawStairs(px, py, ts, v, false);
        }
      }
    }

    // gold + items
    var i2;
    for (i2 = 0; i2 < lvl.golds.length; i2++) {
      var gp = lvl.golds[i2]; if (!lvl.seen[gp.y * CC.MAPW + gp.x]) continue;
      var vg = lvl.vis[gp.y * CC.MAPW + gp.x];
      ctx.globalAlpha = vg ? 1 : 0.4;
      ctx.fillStyle = '#ffd24d';
      var gx = sx(gp.x) + ts / 2, gy = sy(gp.y) + ts / 2;
      ctx.beginPath(); ctx.arc(gx, gy, ts * 0.15, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(gx - ts * 0.12, gy + ts * 0.08, ts * 0.10, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (i2 = 0; i2 < lvl.items.length; i2++) {
      var it = lvl.items[i2]; if (!lvl.seen[it.y * CC.MAPW + it.x]) continue;
      var vi = lvl.vis[it.y * CC.MAPW + it.x];
      ctx.globalAlpha = vi ? 1 : 0.4;
      drawItemGlyph(sx(it.x) + ts / 2, sy(it.y) + ts / 2, ts * 0.34, it.key);
      ctx.globalAlpha = 1;
    }

    // monsters
    for (i2 = 0; i2 < S.mons.length; i2++) {
      var m = S.mons[i2];
      if (!lvl.vis[m.y * CC.MAPW + m.x]) continue;
      if (m.key === 'stalker' && CC.dist(m.x, m.y, S.p.x, S.p.y) > 1) continue;
      drawMon(m);
    }

    drawPlayer();
    parts.draw(ctx);
    ctx.restore();
  }

  function drawStairs(px, py, ts, v, down) {
    ctx.globalAlpha = v ? 1 : 0.45;
    ctx.fillStyle = down ? '#5f7dff' : '#5fd0a0';
    for (var s = 0; s < 3; s++) {
      var f = down ? s : 2 - s;
      ctx.fillRect(px + ts * 0.16 + f * ts * 0.08, py + ts * 0.20 + s * ts * 0.20, ts * (0.68 - f * 0.16), ts * 0.14);
    }
    ctx.globalAlpha = 1;
  }

  function drawItemGlyph(cx, cy, r, key) {
    var kind = itemKind(key), col = itemColor(key);
    ctx.fillStyle = col;
    if (kind === 'potion') {
      ctx.fillRect(cx - r * 0.28, cy - r, r * 0.56, r * 0.4);
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.25, r * 0.72, 0, 6.283); ctx.fill();
    } else if (kind === 'scroll') {
      ctx.fillRect(cx - r * 0.85, cy - r * 0.7, r * 1.7, r * 1.4);
      ctx.fillStyle = '#8894aa';
      ctx.fillRect(cx - r * 0.5, cy - r * 0.25, r, 2);
      ctx.fillRect(cx - r * 0.5, cy + r * 0.15, r * 0.7, 2);
    } else if (kind === 'food') {
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.9, r * 0.6, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#8a6b3a'; ctx.fillRect(cx - r * 0.5, cy - 1, r, 2);
    } else if (kind === 'crown') {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy + r * 0.7); ctx.lineTo(cx - r, cy - r * 0.5);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.05); ctx.lineTo(cx, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.45, cy + r * 0.05); ctx.lineTo(cx + r, cy - r * 0.5);
      ctx.lineTo(cx + r, cy + r * 0.7); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(performance.now() / 220);
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.9, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawMon(m) {
    var ts = L.ts, cx = sx(m.ax) + ts / 2, cy = sy(m.ay) + ts / 2, r = ts * 0.34;
    var col = m.hurt > 0 ? '#ffffff' : m.col;
    ctx.fillStyle = col;
    switch (m.key) {
      case 'rat':
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.85, r * 0.62, 0, 0, 6.283); ctx.fill();
        ctx.fillRect(cx + r * 0.7, cy - 1, r * 0.8, 2);
        break;
      case 'ooze':
        ctx.beginPath();
        var wob = 1 + 0.08 * Math.sin(performance.now() / 260 + m.x);
        ctx.ellipse(cx, cy + r * 0.15, r * 0.95 * wob, r * 0.8, 0, 0, 6.283); ctx.fill();
        break;
      case 'archer':
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.85, cy + r * 0.7);
        ctx.lineTo(cx - r * 0.85, cy + r * 0.7); ctx.closePath(); ctx.fill();
        break;
      case 'stalker':
        ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.05); ctx.lineTo(cx + r * 0.75, cy);
        ctx.lineTo(cx, cy + r * 1.05); ctx.lineTo(cx - r * 0.75, cy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#120a18'; ctx.fillRect(cx - r * 0.28, cy - r * 0.22, r * 0.56, r * 0.16);
        break;
      case 'brute':
        ctx.fillRect(cx - r, cy - r * 0.9, r * 2, r * 1.9);
        ctx.fillStyle = '#5c6577';
        ctx.fillRect(cx - r * 0.6, cy - r * 0.5, r * 1.2, r * 0.35);
        break;
      case 'thief':
        ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.95); ctx.lineTo(cx + r * 0.7, cy);
        ctx.lineTo(cx, cy + r * 0.95); ctx.lineTo(cx - r * 0.7, cy); ctx.closePath(); ctx.fill();
        if (m.loot) { ctx.fillStyle = '#ffd24d'; ctx.fillRect(cx - 2, cy - 2, 4, 4); }
        break;
    }
    // hp pip
    if (m.hp < m.maxhp) {
      var f = Math.max(0, m.hp / m.maxhp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - r, cy - ts * 0.44, r * 2, 3);
      ctx.fillStyle = f > 0.5 ? '#6ad07a' : (f > 0.25 ? '#e0c04a' : '#e05a5a');
      ctx.fillRect(cx - r, cy - ts * 0.44, r * 2 * f, 3);
    }
    if (m.fear > 0) {
      ctx.fillStyle = '#c96de0'; ctx.font = '10px ' + F; ctx.textAlign = 'center';
      ctx.fillText('!', cx, cy - ts * 0.5);
    }
  }

  function drawPlayer() {
    var ts = L.ts, p = S.p, cx = sx(p.ax) + ts / 2, cy = sy(p.ay) + ts / 2, r = ts * 0.33;
    ctx.fillStyle = 'rgba(120,170,255,0.10)';
    ctx.beginPath(); ctx.arc(cx, cy, ts * 0.62, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e9f2ff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2b3a55';
    ctx.fillRect(cx - r * 0.5, cy - r * 0.25, r, r * 0.22);
    if (S.hasCrown) {
      ctx.fillStyle = '#ffd24d';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.75); ctx.lineTo(cx - r * 0.35, cy - r * 1.25);
      ctx.lineTo(cx, cy - r * 0.8); ctx.lineTo(cx + r * 0.35, cy - r * 1.25);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.75); ctx.closePath(); ctx.fill();
    }
    if (S.p.ward > 0) {
      ctx.strokeStyle = 'rgba(77,201,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, 6.283); ctx.stroke();
    }
    if (S.p.haste > 0) {
      ctx.fillStyle = 'rgba(255,225,77,0.5)';
      ctx.fillRect(cx - r * 1.4, cy + r * 1.2, r * 2.8, 2);
    }
  }

  function drawHud() {
    var w = L.w, p = S.p;
    ctx.fillStyle = '#101420'; ctx.fillRect(0, 0, w, L.hudH);
    ctx.fillStyle = '#1b2233'; ctx.fillRect(0, L.hudH - 1, w, 1);

    // hp bar
    var bx = 10, by = 10, bw = w * 0.46, bh = 14;
    ctx.fillStyle = '#26160f'; ctx.fillRect(bx, by, bw, bh);
    var f = p.hp / p.maxhp;
    ctx.fillStyle = f > 0.5 ? '#4ee08a' : (f > 0.25 ? '#e0c04a' : '#e05a5a');
    ctx.fillRect(bx, by, bw * Math.max(0, f), bh);
    ctx.strokeStyle = '#333d52'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#dfe8f7'; ctx.font = 'bold 11px ' + F;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('HP ' + p.hp + '/' + p.maxhp, bx + 5, by + bh / 2 + 0.5);

    // xp bar
    ctx.fillStyle = '#141a28'; ctx.fillRect(bx, by + bh + 4, bw, 5);
    ctx.fillStyle = '#5f7dff'; ctx.fillRect(bx, by + bh + 4, bw * CC.clamp(p.xp / p.next, 0, 1), 5);

    // right column
    ctx.textAlign = 'right'; ctx.fillStyle = '#cfd9ea'; ctx.font = '11px ' + F;
    ctx.fillText('DEPTH ' + S.depth + '   LV ' + p.lvl, w - 52, 14);
    ctx.fillStyle = '#ffd24d';
    ctx.fillText(S.gold + 'g', w - 52, 28);
    ctx.fillStyle = '#9fb0c8';
    ctx.fillText('kills ' + S.kills + '  best ' + best, w - 52, 42);

    // food pip
    var fx = bx, fy = by + bh + 13;
    ctx.textAlign = 'left';
    var fs = p.food > 600 ? ['fed', '#6ad07a'] : p.food > 300 ? ['ok', '#c8d0e0'] : p.food > 0 ? ['hungry', '#e0a04a'] : ['starving', '#e05a5a'];
    ctx.fillStyle = fs[1]; ctx.font = '10px ' + F;
    ctx.fillText('food: ' + fs[0], fx, fy + 4);
    if (S.hasCrown) { ctx.fillStyle = '#ffd24d'; ctx.fillText('  • CROWN', fx + 66, fy + 4); }

    // mute button
    ctx.fillStyle = CC.isMuted() ? '#4a5468' : '#8ea4c8';
    var mx = w - 30, my = 20;
    ctx.beginPath(); ctx.moveTo(mx - 7, my - 3); ctx.lineTo(mx - 3, my - 3); ctx.lineTo(mx + 2, my - 8);
    ctx.lineTo(mx + 2, my + 8); ctx.lineTo(mx - 3, my + 3); ctx.lineTo(mx - 7, my + 3); ctx.closePath(); ctx.fill();
    if (CC.isMuted()) { ctx.strokeStyle = '#e05a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx - 9, my + 9); ctx.lineTo(mx + 9, my - 9); ctx.stroke(); }
  }

  function drawLog() {
    ctx.fillStyle = '#0a0d15'; ctx.fillRect(0, L.hudH, L.w, L.logH);
    ctx.font = '11px ' + F; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var n = S.log.length;
    for (var i = 0; i < 2; i++) {
      var e = S.log[n - 2 + i];
      if (!e) continue;
      ctx.globalAlpha = i === 1 ? 1 : 0.55;
      ctx.fillStyle = e.c;
      ctx.fillText(clip(e.t, L.w - 16), 8, L.hudH + 9 + i * 14);
    }
    ctx.globalAlpha = 1;
  }
  function clip(t, w) {
    var max = Math.floor(w / 6.2);
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  function drawBar() {
    var w = L.w, y = L.barY, h = L.barH;
    ctx.fillStyle = '#101420'; ctx.fillRect(0, y, w, h);
    ctx.fillStyle = '#1b2233'; ctx.fillRect(0, y, w, 1);
    var n = 6, pad = 6, slotW = (w - pad * (n + 1)) / n, slotH = Math.min(h - 20, slotW);
    for (var i = 0; i < n; i++) {
      var bx = pad + i * (slotW + pad), by = y + 8;
      ctx.fillStyle = '#161c2b'; ctx.fillRect(bx, by, slotW, slotH);
      ctx.strokeStyle = '#28324a'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, slotW - 1, slotH - 1);
      var s = S.inv[i];
      if (s) {
        drawItemGlyph(bx + slotW / 2, by + slotH / 2 - 2, Math.min(slotW, slotH) * 0.26, s.key);
        if (s.n > 1) {
          ctx.fillStyle = '#dfe8f7'; ctx.font = 'bold 10px ' + F; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText('x' + s.n, bx + slotW - 3, by + slotH - 2);
        }
      }
      ctx.fillStyle = '#4a5468'; ctx.font = '9px ' + F; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('' + (i + 1), bx + 3, by + 2);
    }
    var lbl = S.inv.length ? 'tap an item to use · hold anything to inspect' : 'no items — walk over things to pick them up';
    ctx.fillStyle = '#5b6883'; ctx.font = '10px ' + F; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(lbl, w / 2, y + h - 3);
  }

  function drawInspect() {
    var w = L.w;
    ctx.fillStyle = 'rgba(4,6,12,0.82)'; ctx.fillRect(0, 0, w, L.h);
    var bw = Math.min(320, w - 40), bh = 190, bx = (w - bw) / 2, by = (L.h - bh) / 2;
    ctx.fillStyle = '#141a28'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#38445e'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = '#e9f2ff'; ctx.font = 'bold 15px ' + F; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(S.inspect.title, w / 2, by + 18);
    ctx.font = '12px ' + F; ctx.fillStyle = '#a9b6cc';
    wrapText(S.inspect.body, w / 2, by + 52, bw - 34, 17);
    ctx.fillStyle = '#5b6883'; ctx.font = '11px ' + F;
    ctx.fillText('tap to close', w / 2, by + bh - 24);
  }

  function wrapText(text, cx, y, maxw, lh) {
    var paras = String(text).split('\n');
    for (var p = 0; p < paras.length; p++) {
      var words = paras[p].split(' '), line = '';
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxw && line) { ctx.fillText(line, cx, y); y += lh; line = words[i]; }
        else line = test;
      }
      ctx.fillText(line, cx, y); y += lh;
    }
    return y;
  }

  function drawEnd(won) {
    var w = L.w;
    ctx.fillStyle = won ? 'rgba(20,16,4,0.88)' : 'rgba(10,4,6,0.88)';
    ctx.fillRect(0, 0, w, L.h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = won ? '#ffd24d' : '#ff6a6a';
    ctx.font = 'bold 26px ' + F;
    ctx.fillText(won ? 'YOU ESCAPED' : 'YOU DIED', w / 2, L.h * 0.24);
    ctx.font = '12px ' + F; ctx.fillStyle = '#a9b6cc';
    var sub = won ? 'The Crown of Echoes is out of the dark.' : 'Killed by ' + (S.deathBy || 'the dark') + ' on depth ' + S.depth + '.';
    wrapText(sub, w / 2, L.h * 0.24 + 40, w - 60, 17);
    ctx.font = '13px ' + F; ctx.fillStyle = '#dfe8f7';
    var y = L.h * 0.44;
    ctx.fillText('deepest  ' + S.maxDepth, w / 2, y);
    ctx.fillText('kills  ' + S.kills, w / 2, y + 22);
    ctx.fillText('gold  ' + S.gold, w / 2, y + 44);
    ctx.font = 'bold 20px ' + F; ctx.fillStyle = '#4ee08a';
    ctx.fillText('SCORE ' + S.finalScore, w / 2, y + 78);
    ctx.font = '12px ' + F; ctx.fillStyle = '#9fb0c8';
    ctx.fillText('best ' + best, w / 2, y + 106);
    ctx.font = '13px ' + F; ctx.fillStyle = '#e9f2ff';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 350);
    ctx.fillText('tap anywhere to crawl again', w / 2, L.h * 0.80);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * Main loop
   * ------------------------------------------------------------------ */
  var last = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;

    // long-press detection
    if (press && !press.fired && !press.moved && now - press.t > LONG) {
      press.fired = true; inspectAt(press.x, press.y);
    }

    // ease display positions
    var k = 1 - Math.pow(0.001, dt);
    S.p.ax = CC.lerp(S.p.ax, S.p.x, Math.min(1, k * 1.6));
    S.p.ay = CC.lerp(S.p.ay, S.p.y, Math.min(1, k * 1.6));
    for (var i = 0; i < S.mons.length; i++) {
      var m = S.mons[i];
      m.ax = CC.lerp(m.ax, m.x, Math.min(1, k * 1.4));
      m.ay = CC.lerp(m.ay, m.y, Math.min(1, k * 1.4));
      if (m.hurt > 0) m.hurt -= dt;
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 42);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    parts.update(dt);
    updateCam(false);

    draw(dt);
    requestAnimationFrame(frame);
  }

  resize();
  newGame();
  updateCam(true);
  requestAnimationFrame(function (t) { last = t; frame(t); });
})(window);
