(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var audioGate = document.getElementById('audioGate');
  var openKitchen = document.getElementById('openKitchen');
  var rotateOverlay = document.getElementById('rotateOverlay');
  var W = 390;
  var H = 700;
  var view = { cssW: 390, cssH: 700, scale: 1, ox: 0, oy: 0, dpr: 1 };
  var audioContext = null;
  var audioUnlocked = false;
  var lastFrame = 0;
  var pendingTimeouts = new Set();
  var activePointers = new Map();
  var heldKeys = new Set();
  var queuedActions = [];
  var nextPlateId = 1;
  var nextCustomerId = 1;
  var rngState = 93271;
  var palette = {
    ink: '#101a24',
    ink2: '#162632',
    wall: '#1d3440',
    wall2: '#284654',
    cream: '#fff5d8',
    muted: '#9bb0b9',
    gold: '#f4c973',
    coral: '#ef8069',
    mint: '#76d1ae',
    blue: '#8ec4e6',
    red: '#ef676b',
    shadow: 'rgba(5, 11, 16, .32)'
  };
  var upgradeNames = [
    'Sharp tools', 'Hire a prepper', 'Prep rhythm', 'Heat lamps',
    'Auto-bake oven', 'Second prepper', 'Counter runner', 'Order rail',
    'Dining bell', 'Roomy tables', 'Shift captain', 'Full service'
  ];
  var upgradeCosts = [18, 34, 54, 78, 112, 154, 204, 266, 342, 434, 548, 688];
  var upgradeShort = ['tools', 'prepper', 'rhythm', 'lamps', 'auto-bake', 'prepper II', 'runner', 'rail', 'bell', 'tables', 'captain', 'crew'];
  var tableRects = [
    { x: 16, y: 151, w: 171, h: 104 },
    { x: 203, y: 151, w: 171, h: 104 },
    { x: 109, y: 285, w: 171, h: 104 }
  ];
  var stationRects = [
    { x: 12, y: 405, w: 116, h: 96 },
    { x: 137, y: 405, w: 116, h: 96 },
    { x: 262, y: 405, w: 116, h: 96 }
  ];
  var game = null;

  function finiteNumber(value, fallback, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function safeLoad() {
    var fallback = { best: 0, prestige: 0, totalServed: 0, shopTier: 0, wave: 1, gold: 0, upgrades: 0, score: 0 };
    try {
      var raw = localStorage.getItem('slice-rush-save-v1');
      if (typeof raw !== 'string' || raw.length > 2048) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      return {
        best: Math.floor(finiteNumber(parsed.best, 0, 0, 9999999)),
        prestige: Math.floor(finiteNumber(parsed.prestige, 0, 0, 99)),
        totalServed: Math.floor(finiteNumber(parsed.totalServed, 0, 0, 9999999)),
        shopTier: Math.floor(finiteNumber(parsed.shopTier, 0, 0, 99)),
        wave: Math.floor(finiteNumber(parsed.wave, 1, 1, 99)),
        gold: Math.floor(finiteNumber(parsed.gold, 0, 0, 999999)),
        upgrades: Math.floor(finiteNumber(parsed.upgrades, 0, 0, 12)),
        score: Math.floor(finiteNumber(parsed.score, 0, 0, 9999999))
      };
    } catch (error) {
      return fallback;
    }
  }

  function safeSave() {
    if (!game) return;
    try {
      var record = {
        best: Math.floor(finiteNumber(game.best, 0, 0, 9999999)),
        prestige: Math.floor(finiteNumber(game.prestige, 0, 0, 99)),
        totalServed: Math.floor(finiteNumber(game.totalServed, 0, 0, 9999999)),
        shopTier: Math.floor(finiteNumber(game.shopTier, 0, 0, 99)),
        wave: Math.floor(finiteNumber(game.wave, 1, 1, 99)),
        gold: Math.floor(finiteNumber(game.gold, 0, 0, 999999)),
        upgrades: Math.floor(finiteNumber(game.upgrades, 0, 0, 12)),
        score: Math.floor(finiteNumber(game.score, 0, 0, 9999999))
      };
      localStorage.setItem('slice-rush-save-v1', JSON.stringify(record));
    } catch (error) {
      // Storage is a bonus. The game remains playable when it is unavailable.
    }
  }

  function random() {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  }

  function choose(list) {
    return list[Math.floor(random() * list.length)];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundRect(context, x, y, w, h, radius) {
    var r = Math.min(radius, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function text(value, x, y, size, color, weight, align) {
    ctx.fillStyle = color || palette.cream;
    ctx.font = (weight || 600) + ' ' + size + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function makeGame() {
    var save = safeLoad();
    game = {
      state: 'rush',
      orientationPaused: false,
      wave: save.wave,
      waveTimer: 34,
      waveLength: 34,
      targetCustomers: 5,
      spawned: 0,
      servedThisWave: 0,
      walkouts: 0,
      score: save.score,
      gold: save.gold,
      best: save.best,
      prestige: save.prestige,
      totalServed: save.totalServed,
      shopTier: save.shopTier,
      speed: 1 + save.prestige * 0.12,
      upgrades: save.upgrades,
      selectedStation: 0,
      selectedTable: 0,
      spawnTimer: .8,
      prepProgress: 0,
      ovenProgress: 0,
      prepStock: 0,
      bakedStock: 0,
      plates: [],
      customers: [],
      particles: [],
      floaters: [],
      shake: 0,
      flash: 0,
      elapsed: 0,
      waveMessage: '',
      messageTimer: 0,
      stationPulse: [0, 0, 0],
      keyboardPlate: null,
      keyboardDrag: false
    };
    if (game.upgrades >= upgradeNames.length) game.state = 'prestige';
    clearInputState();
    cancelTimers();
  }

  function resetWave() {
    clearInputState();
    cancelTimers();
    game.state = 'rush';
    game.waveLength = 32 + Math.min(12, game.wave * 1.8);
    game.waveTimer = game.waveLength;
    game.targetCustomers = Math.min(8, 4 + game.wave);
    game.spawned = 0;
    game.servedThisWave = 0;
    game.walkouts = 0;
    game.spawnTimer = .65;
    game.prepProgress = 0;
    game.ovenProgress = 0;
    game.prepStock = 0;
    game.bakedStock = 0;
    game.plates.length = 0;
    game.customers.length = 0;
    game.particles.length = 0;
    game.floaters.length = 0;
    game.shake = 0;
    game.flash = 0;
    game.messageTimer = 0;
  }

  function startFresh() {
    var best = game.best;
    var prestige = game.prestige;
    var totalServed = game.totalServed;
    var shopTier = game.shopTier;
    makeGame();
    game.best = best;
    game.prestige = prestige;
    game.totalServed = totalServed;
    game.shopTier = shopTier;
    game.speed = 1 + prestige * .12;
    resetWave();
    playSound('start');
  }

  function cancelTimers() {
    pendingTimeouts.forEach(function (timer) { clearTimeout(timer); });
    pendingTimeouts.clear();
  }

  function schedule(callback, delay) {
    var timer = setTimeout(function () {
      pendingTimeouts.delete(timer);
      callback();
    }, delay);
    pendingTimeouts.add(timer);
    return timer;
  }

  function clearInputState() {
    activePointers.clear();
    heldKeys.clear();
    queuedActions.length = 0;
    if (game) {
      game.keyboardPlate = null;
      game.keyboardDrag = false;
    }
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        audioContext = new AudioCtor();
        if (audioContext.state === 'suspended') audioContext.resume();
        var gain = audioContext.createGain();
        gain.gain.value = .0001;
        gain.connect(audioContext.destination);
        var oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 440;
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + .02);
      }
    } catch (error) {
      audioContext = null;
    }
    audioUnlocked = true;
    audioGate.hidden = true;
    playSound('start');
  }

  function playSound(kind) {
    if (!audioUnlocked || !audioContext) return;
    try {
      var now = audioContext.currentTime;
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      var frequencies = { tap: 290, prep: 190, bake: 420, serve: 660, miss: 110, upgrade: 530, start: 350, prestige: 780 };
      oscillator.type = kind === 'miss' ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(frequencies[kind] || 300, now);
      oscillator.frequency.exponentialRampToValueAtTime((frequencies[kind] || 300) * (kind === 'miss' ? .72 : 1.18), now + .12);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'miss' ? .04 : .055, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + .18);
    } catch (error) {
      // Audio must never interrupt play.
    }
  }

  function stationAction(station) {
    if (!game || game.state !== 'rush' || game.orientationPaused) return;
    game.stationPulse[station] = .28;
    if (station === 0) {
      game.prepProgress += .34 + game.upgrades * .012;
      playSound('tap');
      if (game.prepProgress >= 1) {
        game.prepProgress -= 1;
        game.prepStock = Math.min(4, game.prepStock + 1);
        burst(58, 453, palette.mint, 5);
        playSound('prep');
      }
    } else if (station === 1) {
      if (game.prepStock <= 0) {
        game.waveMessage = 'Prep something first';
        game.messageTimer = 1.1;
        playSound('miss');
        return;
      }
      game.ovenProgress += .31 + game.upgrades * .01;
      playSound('tap');
      if (game.ovenProgress >= 1) {
        game.ovenProgress -= 1;
        game.prepStock -= 1;
        finishBake();
      }
    } else {
      game.waveMessage = game.plates.length ? 'Drag a hot plate to a table' : 'The counter is empty';
      game.messageTimer = 1.1;
      playSound(game.plates.length ? 'tap' : 'miss');
    }
  }

  function finishBake() {
    if (game.plates.length >= 5) return;
    game.bakedStock += 1;
    game.plates.push({ id: nextPlateId++, bob: random() * Math.PI * 2, age: 0 });
    burst(194, 453, palette.gold, 8);
    game.flash = .14;
    playSound('bake');
  }

  function autoWork(dt) {
    var multiplier = game.speed;
    if (game.upgrades >= 2) {
      game.prepProgress += dt * (.43 + (game.upgrades >= 6 ? .34 : 0)) * multiplier;
      if (game.prepProgress >= 1) {
        game.prepProgress -= 1;
        game.prepStock = Math.min(4, game.prepStock + 1);
        burst(58, 453, palette.mint, 2);
      }
    }
    if (game.upgrades >= 5 && game.prepStock > 0) {
      game.ovenProgress += dt * .62 * multiplier;
      if (game.ovenProgress >= 1) {
        game.ovenProgress -= 1;
        game.prepStock -= 1;
        finishBake();
      }
    }
  }

  function spawnCustomer() {
    if (game.customers.length >= 3 || game.spawned >= game.targetCustomers) return;
    var occupied = game.customers.map(function (customer) { return customer.table; });
    var options = [0, 1, 2].filter(function (table) { return occupied.indexOf(table) === -1; });
    if (!options.length) return;
    var table = choose(options);
    var moods = [
      { color: palette.coral, hair: '#252b37', order: 'ember bun' },
      { color: palette.blue, hair: '#5b3d55', order: 'golden slice' },
      { color: palette.mint, hair: '#263f43', order: 'herb stack' },
      { color: palette.gold, hair: '#6d473d', order: 'sunny tart' }
    ];
    var mood = choose(moods);
    game.customers.push({
      id: nextCustomerId++,
      table: table,
      patience: Math.max(8.5, 14 - game.wave * .55) / game.speed,
      maxPatience: Math.max(8.5, 14 - game.wave * .55) / game.speed,
      color: mood.color,
      hair: mood.hair,
      order: mood.order,
      served: false,
      leaving: false,
      leave: 0,
      bounce: 0
    });
    game.spawned += 1;
    burst(tableRects[table].x + tableRects[table].w / 2, tableRects[table].y + 63, palette.cream, 5);
  }

  function serveCustomer(customer) {
    if (!customer || customer.served || customer.leaving) return false;
    customer.served = true;
    customer.leave = .75;
    game.servedThisWave += 1;
    game.totalServed += 1;
    var tip = 7 + game.wave * 2 + Math.ceil(customer.patience);
    var streakBonus = Math.min(10, game.servedThisWave);
    game.gold += tip;
    game.score += tip * 10 + streakBonus * 3;
    game.best = Math.max(game.best, game.score);
    game.flash = .18;
    game.shake = Math.max(game.shake, 2.5);
    var rect = tableRects[customer.table];
    burst(rect.x + rect.w / 2, rect.y + 58, palette.gold, 14);
    floatText('+' + tip + ' coins', rect.x + rect.w / 2, rect.y + 20, palette.gold);
    playSound('serve');
    safeSave();
    return true;
  }

  function updateRush(dt) {
    game.elapsed += dt;
    game.waveTimer -= dt;
    game.spawnTimer -= dt;
    if (game.messageTimer > 0) game.messageTimer -= dt;
    game.shake = Math.max(0, game.shake - dt * 9);
    game.flash = Math.max(0, game.flash - dt * 2.8);
    for (var s = 0; s < game.stationPulse.length; s += 1) game.stationPulse[s] = Math.max(0, game.stationPulse[s] - dt);

    if (game.spawnTimer <= 0 && game.spawned < game.targetCustomers) {
      spawnCustomer();
      game.spawnTimer = (2.1 - Math.min(.55, game.wave * .08)) / game.speed;
    }
    autoWork(dt);

    for (var c = game.customers.length - 1; c >= 0; c -= 1) {
      var customer = game.customers[c];
      customer.bounce = Math.max(0, customer.bounce - dt * 3);
      if (customer.served) {
        customer.leave -= dt;
        if (customer.leave <= 0) game.customers.splice(c, 1);
      } else if (!customer.leaving) {
        customer.patience -= dt;
        if (customer.patience <= 0) {
          customer.leaving = true;
          customer.leave = .65;
          game.walkouts += 1;
          game.score = Math.max(0, game.score - 40);
          game.shake = 6;
          game.flash = .12;
          var walkRect = tableRects[customer.table];
          burst(walkRect.x + walkRect.w / 2, walkRect.y + 55, palette.red, 12);
          floatText('walkout!', walkRect.x + walkRect.w / 2, walkRect.y + 18, palette.red);
          playSound('miss');
          if (game.walkouts >= 3) {
            game.state = 'failed';
            clearInputState();
            safeSave();
            return;
          }
        }
      } else {
        customer.leave -= dt;
        if (customer.leave <= 0) game.customers.splice(c, 1);
      }
    }

    for (var p = 0; p < game.plates.length; p += 1) game.plates[p].age += dt;
    if (game.waveTimer <= 0 && game.spawned >= game.targetCustomers && game.customers.length === 0) {
      game.state = 'waveClear';
      clearInputState();
      game.best = Math.max(game.best, game.score);
      safeSave();
      playSound('upgrade');
    }
  }

  function buyUpgrade() {
    if (!game || game.state !== 'rush') return;
    if (game.upgrades >= upgradeNames.length) return;
    var cost = upgradeCosts[game.upgrades];
    if (game.gold < cost) {
      game.waveMessage = 'Serve a few more tables';
      game.messageTimer = 1.2;
      playSound('miss');
      return;
    }
    game.gold -= cost;
    game.upgrades += 1;
    game.flash = .3;
    burst(195, 602, palette.gold, 18);
    floatText('SYSTEM +' + game.upgrades, 195, 567, palette.gold);
    playSound('upgrade');
    safeSave();
    if (game.upgrades >= upgradeNames.length) {
      game.state = 'prestige';
      clearInputState();
    }
  }

  function nextWave() {
    game.wave += 1;
    resetWave();
    safeSave();
    playSound('start');
  }

  function prestige() {
    game.prestige += 1;
    game.shopTier = Math.min(9, game.shopTier + 1);
    game.speed = 1 + game.prestige * .12;
    game.gold = 0;
    game.wave = 1;
    game.score = 0;
    game.upgrades = 0;
    game.state = 'rush';
    safeSave();
    resetWave();
    burst(195, 278, palette.gold, 32);
    playSound('prestige');
  }

  function burst(x, y, color, count) {
    var amount = Math.min(count, 24);
    for (var i = 0; i < amount; i += 1) {
      if (game.particles.length >= 120) game.particles.shift();
      var angle = random() * Math.PI * 2;
      var speed = 18 + random() * 55;
      game.particles.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18, life: .35 + random() * .45, max: .8, size: 1.5 + random() * 3.2, color: color });
    }
  }

  function floatText(value, x, y, color) {
    if (game.floaters.length >= 20) game.floaters.shift();
    game.floaters.push({ value: value, x: x, y: y, color: color || palette.cream, life: 1 });
  }

  function updateEffects(dt) {
    for (var i = game.particles.length - 1; i >= 0; i -= 1) {
      var particle = game.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 72 * dt;
      if (particle.life <= 0) game.particles.splice(i, 1);
    }
    for (var j = game.floaters.length - 1; j >= 0; j -= 1) {
      var floater = game.floaters[j];
      floater.life -= dt * .9;
      floater.y -= dt * 24;
      if (floater.life <= 0) game.floaters.splice(j, 1);
    }
  }

  function roundedBar(x, y, w, h, ratio, fill, back) {
    ctx.fillStyle = back || 'rgba(255,255,255,.08)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = fill;
      roundRect(ctx, x, y, Math.max(h, w * clamp(ratio, 0, 1)), h, h / 2);
      ctx.fill();
    }
  }

  function drawBackground() {
    var tier = game.shopTier;
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, tier >= 3 ? '#202844' : palette.ink);
    bg.addColorStop(.72, tier >= 3 ? '#142a38' : '#14232e');
    bg.addColorStop(1, '#0e1922');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = tier >= 3 ? 'rgba(161,147,227,.08)' : 'rgba(244,201,115,.055)';
    ctx.fillRect(0, 76, W, 326);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (var x = 8; x < W; x += 29) ctx.fillRect(x, 89, 1, 303);
  }

  function drawHeader() {
    ctx.fillStyle = 'rgba(9, 15, 21, .6)';
    ctx.fillRect(0, 0, W, 76);
    ctx.fillStyle = palette.gold;
    ctx.fillRect(15, 17, 4, 27);
    text('LANTERN & LADLE', 28, 22, 11, palette.cream, 800);
    text('SHOP ' + roman(game.shopTier + 1), 28, 39, 9, palette.muted, 800);
    text('WAVE ' + String(game.wave).padStart(2, '0'), 157, 22, 10, palette.muted, 800, 'center');
    roundedBar(124, 34, 66, 5, game.waveTimer / game.waveLength, palette.coral, 'rgba(255,255,255,.08)');
    text(formatNumber(game.gold), 292, 22, 15, palette.gold, 800, 'right');
    text('COINS', 292, 40, 8, palette.muted, 800, 'right');
    text(formatNumber(game.score), 370, 22, 15, palette.cream, 800, 'right');
    text('SCORE', 370, 40, 8, palette.muted, 800, 'right');
    text('BEST ' + formatNumber(game.best), 370, 61, 8, palette.muted, 700, 'right');
  }

  function roman(number) {
    var values = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return values[Math.min(values.length - 1, number - 1)] || 'X';
  }

  function formatNumber(number) {
    return Math.floor(number).toLocaleString('en-US');
  }

  function drawHint() {
    var hint = game.messageTimer > 0 ? game.waveMessage : 'Tap prep → oven. Drag hot plates to waiting tables.';
    text(hint, 195, 98, 10, game.messageTimer > 0 ? palette.gold : palette.muted, 700, 'center');
    if (game.prestige > 0) {
      var label = 'SPEED ×' + game.speed.toFixed(2);
      roundRect(ctx, 14, 110, 87, 22, 11);
      ctx.fillStyle = 'rgba(118,209,174,.12)';
      ctx.fill();
      text(label, 57, 121, 9, palette.mint, 800, 'center');
    }
  }

  function drawTable(table, index) {
    var rect = tableRects[index];
    var selected = game.selectedTable === index;
    ctx.save();
    ctx.fillStyle = selected ? 'rgba(244,201,115,.13)' : 'rgba(5, 12, 17, .22)';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18);
    ctx.fill();
    ctx.strokeStyle = selected ? 'rgba(244,201,115,.66)' : 'rgba(142,196,230,.14)';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = selected ? 'rgba(244,201,115,.24)' : 'rgba(142,196,230,.09)';
    roundRect(ctx, rect.x + 10, rect.y + 36, rect.w - 20, 44, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    roundRect(ctx, rect.x + 14, rect.y + 78, rect.w - 28, 7, 4);
    ctx.fill();
    text('TABLE ' + (index + 1), rect.x + 13, rect.y + 16, 8, palette.muted, 800);
    var customer = game.customers.find(function (item) { return item.table === index; });
    if (customer) drawCustomer(customer, rect);
    else text('open seat', rect.x + rect.w / 2, rect.y + 59, 11, 'rgba(255,255,255,.23)', 700, 'center');
    ctx.restore();
  }

  function drawCustomer(customer, rect) {
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + 59 - (customer.bounce > 0 ? 3 : 0);
    if (customer.leaving) ctx.globalAlpha = clamp(customer.leave / .65, 0, 1);
    ctx.fillStyle = customer.color;
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = customer.hair;
    ctx.beginPath();
    ctx.arc(cx, cy - 16, 14, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,21,27,.64)';
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 12, 1.4, 0, Math.PI * 2);
    ctx.arc(cx + 5, cy - 12, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = customer.served ? palette.mint : palette.cream;
    roundRect(ctx, cx - 43, cy + 6, 86, 16, 8);
    ctx.fill();
    text(customer.served ? 'lovely!' : customer.order, cx, cy + 14, 8, palette.ink, 800, 'center');
    if (!customer.served) {
      roundedBar(rect.x + 22, rect.y + 89, rect.w - 44, 5, customer.patience / customer.maxPatience, customer.patience < customer.maxPatience * .35 ? palette.red : palette.mint);
    }
    ctx.globalAlpha = 1;
  }

  function drawStations() {
    var labels = ['PREP', 'OVEN', 'COUNTER'];
    var subtitles = ['tap to chop', 'tap to bake', 'drag to table'];
    var fills = [palette.mint, palette.coral, palette.gold];
    for (var i = 0; i < stationRects.length; i += 1) {
      var rect = stationRects[i];
      var selected = game.selectedStation === i;
      ctx.fillStyle = selected ? 'rgba(255,255,255,.13)' : 'rgba(5,12,17,.28)';
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
      ctx.fill();
      ctx.strokeStyle = selected ? fills[i] : 'rgba(255,255,255,.1)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
      text(labels[i], rect.x + 12, rect.y + 18, 10, palette.cream, 800);
      text(subtitles[i], rect.x + 12, rect.y + 33, 8, palette.muted, 700);
      ctx.fillStyle = fills[i];
      ctx.globalAlpha = game.stationPulse[i] > 0 ? 1 : .7;
      if (i === 0) drawPrepIcon(rect.x + 58, rect.y + 62);
      if (i === 1) drawOvenIcon(rect.x + 58, rect.y + 62);
      if (i === 2) drawCounterIcon(rect.x + 58, rect.y + 63);
      ctx.globalAlpha = 1;
      if (i === 0) roundedBar(rect.x + 12, rect.y + 82, 92, 5, game.prepProgress, fills[i]);
      if (i === 1) roundedBar(rect.x + 12, rect.y + 82, 92, 5, game.ovenProgress, fills[i]);
      if (i === 2) {
        text(String(game.plates.length) + '/5', rect.x + 104, rect.y + 18, 10, palette.gold, 800, 'right');
        drawPlateStack(rect.x + 58, rect.y + 66);
      }
    }
    if (game.upgrades >= 2) drawStaff(38, 375, false);
    if (game.upgrades >= 6) drawStaff(87, 371, true);
    if (game.upgrades >= 5) {
      ctx.fillStyle = 'rgba(239,128,105,.18)';
      ctx.beginPath();
      ctx.arc(194, 449, 29 + Math.sin(game.elapsed * 5) * 2, 0, Math.PI * 2);
      ctx.fill();
      text('AUTO', 194, 391, 8, palette.coral, 800, 'center');
    }
  }

  function drawPrepIcon(x, y) {
    ctx.fillStyle = palette.mint;
    roundRect(ctx, x - 25, y - 12, 45, 16, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(16,26,36,.52)';
    ctx.fillRect(x - 17, y - 7, 28, 3);
    ctx.strokeStyle = palette.mint;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 15, y - 7);
    ctx.lineTo(x + 26, y - 23);
    ctx.stroke();
    ctx.fillStyle = palette.cream;
    ctx.beginPath();
    ctx.arc(x + 27, y - 25, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOvenIcon(x, y) {
    ctx.fillStyle = palette.coral;
    roundRect(ctx, x - 23, y - 20, 46, 34, 7);
    ctx.fill();
    ctx.fillStyle = '#15232b';
    roundRect(ctx, x - 15, y - 12, 30, 19, 4);
    ctx.fill();
    ctx.fillStyle = palette.gold;
    ctx.beginPath();
    ctx.arc(x, y - 2, 6 + Math.sin(game.elapsed * 4) * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.cream;
    ctx.beginPath();
    ctx.arc(x - 12, y + 10, 2, 0, Math.PI * 2);
    ctx.arc(x - 5, y + 10, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCounterIcon(x, y) {
    ctx.fillStyle = palette.gold;
    ctx.beginPath();
    ctx.ellipse(x, y - 3, 25, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e4a956';
    ctx.beginPath();
    ctx.ellipse(x, y - 5, 19, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.mint;
    ctx.beginPath();
    ctx.arc(x - 5, y - 6, 3, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlateStack(x, y) {
    var count = Math.min(3, game.plates.length);
    for (var i = 0; i < count; i += 1) {
      var plate = game.plates[i];
      var bob = Math.sin(game.elapsed * 3 + plate.bob) * 1.2;
      ctx.fillStyle = 'rgba(255,245,216,.85)';
      ctx.beginPath();
      ctx.ellipse(x + i * 4 - (count - 1) * 2, y - i * 3 + bob, 21, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = [palette.coral, palette.mint, palette.blue][i % 3];
      ctx.beginPath();
      ctx.arc(x + i * 4 - (count - 1) * 2, y - 5 - i * 3 + bob, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStaff(x, y, second) {
    ctx.save();
    var bob = Math.sin(game.elapsed * 3 + (second ? 1 : 0)) * 1.5;
    ctx.fillStyle = second ? palette.blue : palette.mint;
    ctx.beginPath();
    ctx.arc(x, y - 15 + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = second ? '#34425c' : '#274a47';
    roundRect(ctx, x - 7, y - 8 + bob, 14, 22, 5);
    ctx.fill();
    ctx.strokeStyle = palette.cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 7, y - 1 + bob);
    ctx.lineTo(x + 16, y - 8 + bob);
    ctx.stroke();
    ctx.restore();
  }

  function drawUpgrades() {
    var y = 522;
    ctx.fillStyle = 'rgba(8, 14, 19, .92)';
    ctx.fillRect(0, y, W, H - y);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(0, y, W, 1);
    text('AUTOMATION PATH', 14, y + 18, 10, palette.cream, 800);
    text(game.upgrades + '/12', 376, y + 18, 10, palette.gold, 800, 'right');
    var cellW = 115;
    var cellH = 28;
    for (var i = 0; i < 12; i += 1) {
      var col = i % 3;
      var row = Math.floor(i / 3);
      var x = 12 + col * 125;
      var cellY = y + 35 + row * 29;
      var active = i < game.upgrades;
      var next = i === game.upgrades;
      ctx.fillStyle = active ? 'rgba(118,209,174,.16)' : (next ? 'rgba(244,201,115,.12)' : 'rgba(255,255,255,.045)');
      roundRect(ctx, x, cellY, cellW, cellH - 3, 8);
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(118,209,174,.5)' : (next ? 'rgba(244,201,115,.5)' : 'rgba(255,255,255,.06)');
      ctx.lineWidth = 1;
      ctx.stroke();
      text((i + 1).toString().padStart(2, '0'), x + 8, cellY + 12, 8, active ? palette.mint : palette.muted, 800);
      text(upgradeShort[i], x + 28, cellY + 12, 8, active ? palette.cream : '#80919a', 700);
      if (next) text(upgradeCosts[i] + '¢', x + cellW - 7, cellY + 12, 8, palette.gold, 800, 'right');
      if (active) text('✓', x + cellW - 8, cellY + 12, 10, palette.mint, 800, 'right');
    }
    var action = game.upgrades >= 12 ? 'READY — TAP TO PRESTIGE' : 'BUY NEXT AUTOMATION';
    var actionColor = game.upgrades >= 12 ? palette.mint : (game.gold >= upgradeCosts[game.upgrades] ? palette.gold : '#70818a');
    ctx.fillStyle = game.upgrades >= 12 ? 'rgba(118,209,174,.18)' : 'rgba(244,201,115,.1)';
    roundRect(ctx, 12, 672, 366, 20, 10);
    ctx.fill();
    text(action, 195, 682, 9, actionColor, 800, 'center');
  }

  function drawEffects() {
    for (var i = 0; i < game.particles.length; i += 1) {
      var particle = game.particles[i];
      ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    for (var j = 0; j < game.floaters.length; j += 1) {
      var floater = game.floaters[j];
      ctx.globalAlpha = clamp(floater.life, 0, 1);
      text(floater.value, floater.x, floater.y, 10, floater.color, 800, 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawDraggedPlate(pointer) {
    if (!pointer || pointer.kind !== 'plate') return;
    ctx.save();
    ctx.globalAlpha = .92;
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = palette.cream;
    ctx.beginPath();
    ctx.ellipse(pointer.x, pointer.y, 27, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = palette.coral;
    ctx.beginPath();
    ctx.arc(pointer.x - 5, pointer.y - 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.mint;
    ctx.beginPath();
    ctx.arc(pointer.x + 7, pointer.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOverlay() {
    if (game.state === 'rush') return;
    ctx.fillStyle = 'rgba(6, 12, 17, .75)';
    ctx.fillRect(0, 0, W, 700);
    var panelY = game.state === 'prestige' ? 154 : 185;
    var panelH = game.state === 'prestige' ? 340 : 290;
    ctx.fillStyle = '#1c2c36';
    roundRect(ctx, 25, panelY, 340, panelH, 24);
    ctx.fill();
    ctx.strokeStyle = game.state === 'failed' ? 'rgba(239,103,107,.5)' : 'rgba(244,201,115,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (game.state === 'failed') drawFailPanel(panelY);
    if (game.state === 'waveClear') drawClearPanel(panelY);
    if (game.state === 'prestige') drawPrestigePanel(panelY);
  }

  function drawFailPanel(y) {
    text('RUSH LOST', 195, y + 45, 25, palette.red, 800, 'center');
    text('The room hit three walkouts.', 195, y + 79, 12, palette.muted, 600, 'center');
    text('WAVE ' + game.wave + '  ·  ' + game.servedThisWave + ' served', 195, y + 113, 11, palette.cream, 800, 'center');
    text('Your automation stays on the books.', 195, y + 139, 10, palette.muted, 600, 'center');
    drawButton(55, y + 178, 280, 47, 'RETRY WAVE', palette.gold);
    text('Press R or Enter', 195, y + 247, 10, palette.muted, 700, 'center');
  }

  function drawClearPanel(y) {
    text('WAVE CLEAR', 195, y + 46, 25, palette.mint, 800, 'center');
    text(game.servedThisWave + ' tables kept warm', 195, y + 80, 12, palette.cream, 700, 'center');
    text('+' + (game.wave * 8 + game.servedThisWave * 5) + '¢ rush bonus is ready', 195, y + 112, 11, palette.gold, 800, 'center');
    drawButton(55, y + 157, 280, 47, 'NEXT WAVE  →', palette.mint);
    text('Press Enter or tap the card', 195, y + 239, 10, palette.muted, 700, 'center');
  }

  function drawPrestigePanel(y) {
    text('FULL SERVICE', 195, y + 45, 25, palette.gold, 800, 'center');
    text('The floor runs without you.', 195, y + 80, 12, palette.cream, 700, 'center');
    text('Open a fancier shop and keep your speed.', 195, y + 105, 10, palette.muted, 600, 'center');
    ctx.fillStyle = 'rgba(244,201,115,.1)';
    roundRect(ctx, 65, y + 132, 260, 55, 15);
    ctx.fill();
    text('NEW SPEED', 195, y + 147, 9, palette.muted, 800, 'center');
    text('×' + (game.speed + .12).toFixed(2), 195, y + 169, 23, palette.gold, 800, 'center');
    drawButton(55, y + 215, 280, 47, 'OPEN SHOP ' + roman(game.shopTier + 2), palette.gold);
    text('Upgrades reset · prestige stays', 195, y + 299, 10, palette.muted, 700, 'center');
  }

  function drawButton(x, y, w, h, label, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    text(label, x + w / 2, y + h / 2 + 1, 12, palette.ink, 800, 'center');
  }

  function draw() {
    if (!game) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.cssW, view.cssH);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.save();
    if (game.shake > 0) ctx.translate((random() - .5) * game.shake, (random() - .5) * game.shake);
    drawBackground();
    drawHeader();
    drawHint();
    for (var i = 0; i < tableRects.length; i += 1) drawTable(tableRects[i], i);
    drawStations();
    drawUpgrades();
    drawEffects();
    activePointers.forEach(function (pointer) { drawDraggedPlate(pointer); });
    ctx.restore();
    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(255,245,216,' + (game.flash * .14) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    drawOverlay();
    ctx.restore();
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    view.cssW = Math.max(1, rect.width);
    view.cssH = Math.max(1, rect.height);
    view.scale = Math.min(view.cssW / W, view.cssH / H);
    view.ox = (view.cssW - W * view.scale) / 2;
    view.oy = (view.cssH - H * view.scale) / 2;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(view.cssW, view.cssH));
    canvas.width = Math.max(1, Math.floor(view.cssW * view.dpr));
    canvas.height = Math.max(1, Math.floor(view.cssH * view.dpr));
  }

  function syncOrientation() {
    var isLandscape = window.innerWidth > window.innerHeight;
    rotateOverlay.hidden = !isLandscape;
    if (game.orientationPaused !== isLandscape) {
      game.orientationPaused = isLandscape;
      clearInputState();
      lastFrame = performance.now();
    }
  }

  function toWorld(event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left - view.ox) / view.scale, 0, W),
      y: clamp((event.clientY - rect.top - view.oy) / view.scale, 0, H)
    };
  }

  function inside(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function tableAt(point) {
    for (var i = 0; i < tableRects.length; i += 1) if (inside(point, tableRects[i])) return i;
    return -1;
  }

  function plateAt(point) {
    if (!inside(point, stationRects[2])) return null;
    if (!game.plates.length) return null;
    var centerX = stationRects[2].x + 58;
    var centerY = stationRects[2].y + 63;
    if (Math.abs(point.x - centerX) < 42 && Math.abs(point.y - centerY) < 27) return game.plates[game.plates.length - 1];
    return null;
  }

  function pointerDown(event) {
    event.preventDefault();
    if (game.orientationPaused || document.hidden) return;
    var point = toWorld(event);
    var pointer = { id: event.pointerId, kind: 'none', x: point.x, y: point.y, station: -1, plateId: null, nextAction: 0 };
    var table = tableAt(point);
    if (game.state !== 'rush') {
      if (game.state === 'failed' && point.x >= 45 && point.x <= 345 && point.y >= 350 && point.y <= 650) restartFromFail();
      else if (game.state === 'waveClear') nextWave();
      else if (game.state === 'prestige') prestige();
      return;
    }
    if (point.y >= 648) {
      buyUpgrade();
      return;
    }
    var plate = plateAt(point);
    if (plate) {
      pointer.kind = 'plate';
      pointer.plateId = plate.id;
      pointer.x = point.x;
      pointer.y = point.y;
      activePointers.set(event.pointerId, pointer);
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
      return;
    }
    for (var i = 0; i < stationRects.length; i += 1) {
      if (inside(point, stationRects[i])) {
        game.selectedStation = i;
        pointer.kind = 'station';
        pointer.station = i;
        pointer.nextAction = 0;
        activePointers.set(event.pointerId, pointer);
        try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
        stationAction(i);
        return;
      }
    }
    if (table >= 0) {
      game.selectedTable = table;
      var customer = game.customers.find(function (item) { return item.table === table && !item.served && !item.leaving; });
      if (customer) customer.bounce = .3;
    }
    activePointers.set(event.pointerId, pointer);
  }

  function pointerMove(event) {
    event.preventDefault();
    var pointer = activePointers.get(event.pointerId);
    if (!pointer) return;
    if (document.hidden || game.orientationPaused) { activePointers.delete(event.pointerId); return; }
    var point = toWorld(event);
    pointer.x = point.x;
    pointer.y = point.y;
  }

  function pointerUp(event) {
    event.preventDefault();
    var pointer = activePointers.get(event.pointerId);
    if (!pointer) return;
    if (!document.hidden && !game.orientationPaused && pointer.kind === 'plate' && game.state === 'rush') {
      var table = tableAt({ x: pointer.x, y: pointer.y });
      var plateIndex = game.plates.findIndex(function (plate) { return plate.id === pointer.plateId; });
      if (plateIndex >= 0 && table >= 0) {
        var customer = game.customers.find(function (item) { return item.table === table; });
        if (serveCustomer(customer)) {
          game.plates.splice(plateIndex, 1);
          game.bakedStock = Math.max(0, game.bakedStock - 1);
        }
      }
    }
    activePointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
  }

  function pointerCancel(event) {
    event.preventDefault();
    activePointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
  }

  function restartFromFail() {
    resetWave();
    playSound('start');
  }

  function keyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].indexOf(event.code) >= 0 || /^Digit[123]$/.test(event.code) || event.code === 'KeyR') event.preventDefault();
    if (heldKeys.has(event.code)) return;
    if (document.hidden || game.orientationPaused) return;
    heldKeys.add(event.code);
    if (game.orientationPaused) return;
    if (game.state !== 'rush') {
      if (event.code === 'KeyR' || event.code === 'Enter' || event.code === 'Space') {
        if (game.state === 'failed') restartFromFail();
        else if (game.state === 'waveClear') nextWave();
        else if (game.state === 'prestige') prestige();
      }
      return;
    }
    if (event.code === 'Digit1') { game.selectedStation = 0; stationAction(0); }
    if (event.code === 'Digit2') { game.selectedStation = 1; stationAction(1); }
    if (event.code === 'Digit3') { game.selectedStation = 2; }
    if (event.code === 'ArrowLeft') game.selectedStation = (game.selectedStation + 2) % 3;
    if (event.code === 'ArrowRight') game.selectedStation = (game.selectedStation + 1) % 3;
    if (event.code === 'ArrowUp') { game.selectedTable = (game.selectedTable + 2) % 3; }
    if (event.code === 'ArrowDown') { game.selectedTable = (game.selectedTable + 1) % 3; }
    if (event.code === 'Space' || event.code === 'Enter') {
      if (game.selectedStation === 2) {
        var customer = game.customers.find(function (item) { return item.table === game.selectedTable; });
        var plate = game.plates[game.plates.length - 1];
        if (plate && serveCustomer(customer)) {
          game.plates.pop();
          game.bakedStock = Math.max(0, game.bakedStock - 1);
        }
      } else stationAction(game.selectedStation);
    }
  }

  function keyUp(event) {
    heldKeys.delete(event.code);
  }

  function loop(now) {
    if (!lastFrame) lastFrame = now;
    var dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!game.orientationPaused && !document.hidden) {
      if (game.state === 'rush') updateRush(dt);
      updateEffects(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  openKitchen.addEventListener('click', function () {
    unlockAudio();
    canvas.focus();
  });
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerCancel, { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp, { passive: false });
  window.addEventListener('blur', clearInputState);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInputState(); lastFrame = performance.now(); } });
  window.addEventListener('resize', function () { resize(); syncOrientation(); });
  window.addEventListener('orientationchange', function () { resize(); syncOrientation(); });

  makeGame();
  resize();
  syncOrientation();
  requestAnimationFrame(loop);
})();
