(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'tide-harbor-save-v1';
  const WORLD = 2100;
  const START = { x: WORLD / 2, y: WORLD / 2 };
  const GOODS = [
    { name: 'Moonkelp', base: 34, color: '#68d4b2' },
    { name: 'Sunspice', base: 56, color: '#f2bd63' },
    { name: 'Brineglass', base: 82, color: '#8ec9f4' },
    { name: 'Emberroot', base: 118, color: '#ee8270' }
  ];
  const HARBOR_NAMES = ['Lumen Quay', 'Kestrel Key', 'Lowtide Reach', 'Morrow Cay', 'Sable Inlet', 'Glasshook', 'Rillhaven'];
  const COLORS = {
    ink: '#102b35', paper: '#f4eedc', muted: '#91b2ae', foam: '#b9e8df', gold: '#f4c66d', coral: '#ef806f', teal: '#4cc9b0'
  };

  let W = 390;
  let H = 700;
  let dpr = 1;
  let lastFrame = 0;
  let elapsed = 0;
  let saveClock = 0;
  let message = 'Tap water • drag trim • dock to trade';
  let messageClock = 7;
  let screenShake = 0;
  let marketOpen = false;
  let activeHarbor = -1;
  let won = false;
  let winDismissed = false;
  let pointer = { x: 0, y: 0, down: false, moved: false, draggingTrim: false, id: null };
  let camera = { x: START.x, y: START.y };
  let bestGold = 0;
  let particles = [];
  let islands = [];
  let storms = [];
  let player;
  let wind = { angle: -0.65, speed: 74 };
  const keys = Object.create(null);

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) { return a + wrapAngle(b - a) * t; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function fmtGold(n) { return Math.max(0, Math.floor(n)).toLocaleString(); }
  function roundedRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function rngFactory(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeWorld() {
    const rand = rngFactory(0x74D3A91);
    islands = [];
    let attempts = 0;
    while (islands.length < 7 && attempts++ < 500) {
      const angle = rand() * TAU;
      const ring = 390 + rand() * 420;
      const r = 62 + rand() * 50;
      const island = {
        x: START.x + Math.cos(angle) * ring,
        y: START.y + Math.sin(angle) * ring,
        r,
        rot: rand() * TAU,
        name: HARBOR_NAMES[islands.length],
        hue: rand(),
        bias: Array.from({ length: GOODS.length }, () => 0.76 + rand() * 0.58),
        marketSeed: rand() * 10,
        harborAngle: rand() * TAU
      };
      island.x = clamp(island.x, 150, WORLD - 150);
      island.y = clamp(island.y, 190, WORLD - 170);
      const clearStart = distance(island, START) > 250;
      const clearOthers = islands.every((other) => distance(island, other) > island.r + other.r + 130);
      if (clearStart && clearOthers) islands.push(island);
    }

    storms = Array.from({ length: 5 }, (_, i) => ({
      x: 260 + rand() * (WORLD - 520),
      y: 250 + rand() * (WORLD - 500),
      size: 112 + rand() * 54,
      drift: (rand() - 0.5) * 0.22,
      seed: rand() * 20,
      hitClock: 5 + i * 0.8,
      entered: false
    }));
  }

  function freshPlayer() {
    return {
      x: START.x,
      y: START.y,
      heading: -0.2,
      targetHeading: -0.2,
      sailTrim: 0.72,
      gold: 240,
      cargo: [0, 0, 0, 0],
      capacity: 16,
      hullLevel: 0,
      speed: 0,
      inStorm: false,
      stormClock: 0,
      wakeClock: 0
    };
  }

  function loadGame() {
    player = freshPlayer();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const save = JSON.parse(raw);
      if (!save || save.v !== 1) return;
      player.x = clamp(Number(save.x) || START.x, 50, WORLD - 50);
      player.y = clamp(Number(save.y) || START.y, 50, WORLD - 50);
      player.heading = Number.isFinite(save.heading) ? save.heading : player.heading;
      player.targetHeading = Number.isFinite(save.targetHeading) ? save.targetHeading : player.heading;
      player.sailTrim = clamp(Number(save.sailTrim) || 0.72, -1.45, 1.45);
      player.gold = Math.max(0, Math.floor(Number(save.gold) || 240));
      player.capacity = clamp(Math.floor(Number(save.capacity) || 16), 16, 40);
      player.hullLevel = clamp(Math.floor(Number(save.hullLevel) || 0), 0, 3);
      if (Array.isArray(save.cargo)) player.cargo = GOODS.map((_, i) => clamp(Math.floor(Number(save.cargo[i]) || 0), 0, player.capacity));
      elapsed = Math.max(0, Number(save.elapsed) || 0);
      bestGold = Math.max(0, Math.floor(Number(save.bestGold) || 0));
      message = 'Saved voyage restored';
      messageClock = 4;
    } catch (_) {
      // A private browsing context may refuse localStorage; the voyage still works.
    }
  }

  function saveGame() {
    bestGold = Math.max(bestGold, player.gold);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, x: player.x, y: player.y, heading: player.heading, targetHeading: player.targetHeading,
        sailTrim: player.sailTrim, gold: player.gold, cargo: player.cargo, capacity: player.capacity,
        hullLevel: player.hullLevel, elapsed, bestGold
      }));
    } catch (_) { /* optional persistence */ }
  }

  function resetGame() {
    makeWorld();
    player = freshPlayer();
    elapsed = 0;
    saveClock = 0;
    marketOpen = false;
    activeHarbor = -1;
    won = false;
    winDismissed = false;
    particles = [];
    wind = { angle: -0.65, speed: 74 };
    pointer = { x: 0, y: 0, down: false, moved: false, draggingTrim: false, id: null };
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    screenShake = 0;
    camera.x = player.x;
    camera.y = player.y;
    message = 'A fresh tide. Tap water to set a course';
    messageClock = 4;
    saveGame();
  }

  function setMessage(text, seconds) {
    message = text;
    messageClock = seconds || 3;
  }

  function harborPoint(harbor) {
    return {
      x: harbor.x + Math.cos(harbor.harborAngle) * (harbor.r + 24),
      y: harbor.y + Math.sin(harbor.harborAngle) * (harbor.r + 24)
    };
  }

  function harborPrice(harbor, index) {
    const drift = Math.sin(elapsed * 0.11 + harbor.marketSeed + index * 1.8) * 0.14;
    const tide = Math.sin(elapsed * 0.037 + harbor.marketSeed * 2.1 + index) * 0.09;
    return Math.max(8, Math.round(GOODS[index].base * clamp(harbor.bias[index] + drift + tide, 0.52, 1.65)));
  }

  function cargoCount() { return player.cargo.reduce((sum, n) => sum + n, 0); }

  function nearbyHarbor() {
    let found = -1;
    let best = 100000;
    islands.forEach((island, i) => {
      const dock = harborPoint(island);
      const d = distance(player, dock);
      if (d < 105 && d < best) { best = d; found = i; }
    });
    return found;
  }

  function dockAt(index) {
    const dock = harborPoint(islands[index]);
    if (distance(player, dock) > 116) {
      setMessage('Come closer to the dock to trade', 2.5);
      return;
    }
    player.x = lerp(player.x, dock.x, 0.14);
    player.y = lerp(player.y, dock.y, 0.14);
    marketOpen = true;
    activeHarbor = index;
    player.speed = 0;
    addBurst(dock.x, dock.y, '#f4c66d', 12, 0.7);
    setMessage(islands[index].name + ' market', 2.5);
    saveGame();
  }

  function tryDock() {
    const index = nearbyHarbor();
    if (index >= 0) dockAt(index);
    else setMessage('No dock in reach', 1.6);
  }

  function buy(index) {
    if (cargoCount() >= player.capacity) { setMessage('Hold is full', 1.6); return; }
    const price = harborPrice(islands[activeHarbor], index);
    if (player.gold < price) { setMessage('Not enough gold', 1.6); return; }
    player.gold -= price;
    player.cargo[index]++;
    bestGold = Math.max(bestGold, player.gold);
    addBurst(player.x, player.y, GOODS[index].color, 7, 0.35);
    setMessage('Bought ' + GOODS[index].name, 1.4);
    saveGame();
  }

  function sell(index) {
    if (player.cargo[index] <= 0) { setMessage('None aboard', 1.6); return; }
    const price = harborPrice(islands[activeHarbor], index);
    player.cargo[index]--;
    player.gold += price;
    bestGold = Math.max(bestGold, player.gold);
    addBurst(player.x, player.y, COLORS.gold, 7, 0.35);
    setMessage('Sold ' + GOODS[index].name + ' for ' + price + 'g', 1.5);
    checkWin();
    saveGame();
  }

  function upgradeCost() {
    return [650, 1700, 3600][player.hullLevel] || 0;
  }

  function upgradeHull() {
    if (player.hullLevel >= 3) { setMessage('Flagship hull fitted', 1.8); return; }
    const price = upgradeCost();
    if (player.gold < price) { setMessage('Trade more gold for the next hull', 1.8); return; }
    player.gold -= price;
    player.hullLevel++;
    player.capacity = 16 + player.hullLevel * 8;
    screenShake = 0.35;
    addBurst(player.x, player.y, COLORS.gold, 24, 1.2);
    setMessage(player.hullLevel === 3 ? 'Flagship hull complete!' : 'Hull upgraded — more room, more speed', 3);
    checkWin();
    saveGame();
  }

  function checkWin() {
    if (!won && !winDismissed && player.gold >= 5000 && player.hullLevel >= 3) {
      won = true;
      marketOpen = false;
      screenShake = 0.55;
      addBurst(player.x, player.y, COLORS.gold, 42, 1.8);
      setMessage('The tide is yours', 5);
      saveGame();
    }
  }

  function keepSailing() {
    won = false;
    winDismissed = true;
    screenShake = 0;
    message = 'The voyage continues';
    messageClock = 3;
    saveGame();
  }

  function worldPoint(sx, sy) {
    return { x: sx + camera.x - W / 2, y: sy + camera.y - H * 0.52 };
  }

  function screenPoint(wx, wy) {
    return { x: wx - camera.x + W / 2, y: wy - camera.y + H * 0.52 };
  }

  function getSailData() {
    const windFrom = wrapAngle(wind.angle + Math.PI - player.heading);
    const point = Math.abs(windFrom);
    const noGo = 0.46;
    const broadReach = 0.18 + 0.74 * Math.sin(clamp(point, 0, Math.PI)) + 0.18 * (1 - Math.cos(point)) / 2;
    const idealTrim = clamp(windFrom * 0.74, -1.42, 1.42);
    const trimError = Math.abs(wrapAngle(player.sailTrim - idealTrim));
    const trimEfficiency = clamp(1 - trimError / 1.42, 0, 1);
    const pointEfficiency = point < noGo ? 0.06 + point / noGo * 0.08 : broadReach;
    const speed = (57 + player.hullLevel * 10) * pointEfficiency * (0.38 + trimEfficiency * 0.62);
    return { windFrom, point, noGo, idealTrim, trimEfficiency, speed };
  }

  function updateWind(dt) {
    elapsed += dt;
    wind.angle = -0.68 + Math.sin(elapsed * 0.022) * 0.48 + Math.sin(elapsed * 0.0061) * 0.24;
    wind.speed = 72 + Math.sin(elapsed * 0.03) * 12 + Math.sin(elapsed * 0.008) * 6;
  }

  function updateStorms(dt) {
    storms.forEach((storm, i) => {
      storm.x += Math.cos(wind.angle) * (4 + i * 0.5) * dt;
      storm.y += Math.sin(wind.angle) * (4 + i * 0.5) * dt;
      if (storm.x < -storm.size) storm.x = WORLD + storm.size;
      if (storm.x > WORLD + storm.size) storm.x = -storm.size;
      if (storm.y < -storm.size) storm.y = WORLD + storm.size;
      if (storm.y > WORLD + storm.size) storm.y = -storm.size;
      storm.hitClock -= dt;
    });
  }

  function update(dt) {
    if (won) {
      updateParticles(dt);
      screenShake = Math.max(0, screenShake - dt * 0.7);
      return;
    }
    updateWind(dt);
    updateStorms(dt);
    if (marketOpen) {
      updateParticles(dt);
      saveClock += dt;
      if (saveClock > 8) { saveClock = 0; saveGame(); }
      return;
    }

    const steer = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0);
    const trim = (keys.ArrowUp || keys.w || keys.W ? 1 : 0) - (keys.ArrowDown || keys.s || keys.S ? 1 : 0);
    if (steer) player.targetHeading = wrapAngle(player.targetHeading + steer * 1.2 * dt);
    if (trim) player.sailTrim = clamp(player.sailTrim + trim * 1.05 * dt, -1.45, 1.45);
    player.heading = lerpAngle(player.heading, player.targetHeading, 1 - Math.exp(-2.5 * dt));
    player.sailTrim = clamp(player.sailTrim, -1.45, 1.45);

    const sailing = getSailData();
    let inStorm = false;
    let stormHit = null;
    for (const storm of storms) {
      if (Math.abs(player.x - storm.x) < storm.size * 0.52 && Math.abs(player.y - storm.y) < storm.size * 0.52) {
        inStorm = true;
        stormHit = storm;
        break;
      }
    }
    player.inStorm = inStorm;
    if (inStorm && stormHit) {
      player.stormClock += dt;
      if (stormHit.hitClock <= 0) {
        stormHit.hitClock = 4.5;
        if (cargoCount() > 0) {
          const loaded = player.cargo.findIndex((n) => n > 0);
          if (loaded >= 0) {
            player.cargo[loaded]--;
            setMessage('Storm took 1 ' + GOODS[loaded].name, 2.2);
            screenShake = 0.2;
            addBurst(player.x, player.y, '#7e8ca9', 12, 0.5);
          }
        }
      }
    } else player.stormClock = 0;

    const stormBoost = inStorm ? 1.28 : 1;
    const targetSpeed = sailing.speed * stormBoost;
    player.speed = lerp(player.speed, targetSpeed, 1 - Math.exp(-3.5 * dt));
    const before = { x: player.x, y: player.y };
    player.x += Math.cos(player.heading) * player.speed * dt;
    player.y += Math.sin(player.heading) * player.speed * dt;
    player.x = clamp(player.x, 46, WORLD - 46);
    player.y = clamp(player.y, 46, WORLD - 46);

    islands.forEach((island) => {
      const dx = player.x - island.x;
      const dy = player.y - island.y;
      const d = Math.hypot(dx, dy);
      const minD = island.r + 14;
      if (d < minD) {
        const nx = d ? dx / d : 1;
        const ny = d ? dy / d : 0;
        player.x = island.x + nx * minD;
        player.y = island.y + ny * minD;
        player.speed *= 0.25;
        player.targetHeading = wrapAngle(Math.atan2(ny, nx) + 0.9);
        screenShake = Math.max(screenShake, 0.07);
      }
    });

    player.wakeClock += dt;
    if (player.wakeClock > 0.06 && distance(before, player) > 0.6) {
      player.wakeClock = 0;
      const p = { x: player.x - Math.cos(player.heading) * 17, y: player.y - Math.sin(player.heading) * 17 };
      particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.8, max: 0.8, color: '#caece7', size: 2 + Math.random() * 2 });
    }
    updateParticles(dt);
    camera.x = lerp(camera.x, player.x, 1 - Math.exp(-4 * dt));
    camera.y = lerp(camera.y, player.y, 1 - Math.exp(-4 * dt));
    screenShake = Math.max(0, screenShake - dt * 0.7);
    saveClock += dt;
    if (saveClock > 6) { saveClock = 0; saveGame(); }
    if (messageClock > 0) messageClock -= dt;
    checkWin();
  }

  function addBurst(wx, wy, color, count, force) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = (12 + Math.random() * 34) * (force || 1);
      particles.push({ x: wx, y: wy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.45 + Math.random() * 0.65, max: 1.1, color, size: 2 + Math.random() * 3 });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.04, dt);
      p.vy *= Math.pow(0.04, dt);
      return p.life > 0;
    });
  }

  function drawText(text, x, y, size, color, align, weight) {
    ctx.fillStyle = color || COLORS.paper;
    ctx.font = (weight || 700) + ' ' + size + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function drawWater() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#1f6571');
    gradient.addColorStop(0.5, '#155467');
    gradient.addColorStop(1, '#0b384f');
    ctx.fillStyle = gradient;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = '#b3e4d8';
    ctx.lineWidth = 1;
    const spacing = 52;
    const shift = (elapsed * 8) % spacing;
    for (let x = -spacing; x < W + spacing; x += spacing) {
      for (let y = -spacing; y < H + spacing; y += spacing) {
        const yy = y + shift + Math.sin((x + y) * 0.02) * 5;
        ctx.beginPath();
        ctx.moveTo(x + 6, yy);
        ctx.quadraticCurveTo(x + 18, yy - 3, x + 30, yy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStorms() {
    storms.forEach((storm, i) => {
      const p = screenPoint(storm.x, storm.y);
      const s = storm.size;
      if (p.x < -s || p.x > W + s || p.y < -s || p.y > H + s) return;
      const pulse = 1 + Math.sin(elapsed * 2.3 + storm.seed) * 0.035;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(elapsed * 0.08 + storm.seed) * 0.08);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#102942';
      roundedRect(ctx, -s * 0.5 * pulse, -s * 0.5 * pulse, s * pulse, s * pulse, 18);
      ctx.fill();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#17243b';
      ctx.lineWidth = 4;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.arc(k * 14, 0, s * (0.19 + k * 0.015), 0.15, Math.PI * 1.45);
        ctx.stroke();
      }
      ctx.restore();
      if (p.x > -s && p.x < W + s && p.y > -s && p.y < H + s) drawText('SQUALL', p.x, p.y, 9, 'rgba(218,224,231,.58)', 'center', 800);
    });
  }

  function drawIsland(island) {
    const p = screenPoint(island.x, island.y);
    const r = island.r;
    if (p.x < -r - 40 || p.x > W + r + 40 || p.y < -r - 60 || p.y > H + r + 60) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(island.rot);
    ctx.fillStyle = 'rgba(4, 23, 27, .34)';
    ctx.beginPath(); ctx.ellipse(5, 9, r * 1.06, r * 0.86, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d2bf82';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const wobble = 0.82 + ((i * 17 + Math.floor(island.hue * 99)) % 7) / 28;
      const rr = r * wobble;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * 0.82;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = island.hue > 0.5 ? '#568a69' : '#4f846e';
    ctx.beginPath(); ctx.ellipse(-r * .12, -r * .08, r * .6, r * .48, -.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8eb07b';
    ctx.beginPath(); ctx.ellipse(r * .22, r * .18, r * .24, r * .13, .2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(36, 82, 66, .48)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(-r * .35 + i * r * .2, r * .18 - (i % 2) * 9, 4 + i % 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const dock = harborPoint(island);
    const d = screenPoint(dock.x, dock.y);
    const close = distance(player, dock) < 105;
    ctx.save();
    if (close) {
      ctx.globalAlpha = .75 + Math.sin(elapsed * 4) * .2;
      ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, 24 + Math.sin(elapsed * 3) * 3, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#f1d98d';
    roundedRect(ctx, d.x - 13, d.y - 9, 26, 18, 5); ctx.fill();
    ctx.fillStyle = '#a86651';
    ctx.fillRect(d.x - 10, d.y - 3, 20, 6);
    ctx.strokeStyle = '#e4f1dc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(d.x + 2, d.y - 6); ctx.lineTo(d.x + 2, d.y - 21); ctx.stroke();
    ctx.fillStyle = GOODS[Math.floor(island.marketSeed) % GOODS.length].color;
    ctx.beginPath(); ctx.moveTo(d.x + 3, d.y - 20); ctx.lineTo(d.x + 15, d.y - 16); ctx.lineTo(d.x + 3, d.y - 12); ctx.closePath(); ctx.fill();
    if (p.x > -100 && p.x < W + 100 && p.y > -100 && p.y < H + 100) {
      drawText(island.name, d.x, d.y + 31, 11, close ? COLORS.paper : 'rgba(231,239,218,.75)', 'center', 800);
      if (close) drawText('DOCK', d.x, d.y + 46, 9, COLORS.gold, 'center', 900);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = screenPoint(player.x, player.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(player.heading);
    ctx.globalAlpha = .3;
    ctx.fillStyle = '#062d3c';
    ctx.beginPath(); ctx.ellipse(-13, 5, 25, 9, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#883f45';
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(6, 10); ctx.lineTo(-19, 7); ctx.lineTo(-24, 0); ctx.lineTo(-19, -7); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2d295';
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-5, 5); ctx.lineTo(-16, 0); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
    const sailAngle = player.sailTrim;
    ctx.save(); ctx.rotate(sailAngle);
    ctx.strokeStyle = '#f5ead1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-3, -34); ctx.stroke();
    ctx.fillStyle = player.inStorm ? '#acb4c7' : '#f0e4bc';
    ctx.beginPath(); ctx.moveTo(-3, -32); ctx.lineTo(-3, 3); ctx.lineTo(-29, -13); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c28e6c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.coral;
    ctx.beginPath(); ctx.arc(-3, 0, 3, 0, TAU); ctx.fill();
    // Telltales flutter from the sail in the live wind direction.
    ctx.save(); ctx.rotate(wrapAngle(wind.angle - player.heading));
    ctx.strokeStyle = '#f4c66d'; ctx.lineWidth = 1.5; ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.moveTo(-5, -16); ctx.lineTo(-13, -20 + Math.sin(elapsed * 8) * 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -22); ctx.lineTo(-12, -26 + Math.sin(elapsed * 7 + 1) * 3); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((p) => {
      const s = screenPoint(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * .8;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, p.size * clamp(p.life / p.max, .25, 1), 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawWindArrow(x, y, size) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(wind.angle);
    ctx.strokeStyle = COLORS.foam; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(size - 8, -6); ctx.moveTo(size, 0); ctx.lineTo(size - 8, 6); ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 25, 35, .73)';
    roundedRect(ctx, 12, 12, Math.min(W - 24, 245), 70, 16); ctx.fill();
    drawText('TIDE HARBOR', 26, 29, 10, COLORS.gold, 'left', 900);
    drawText(fmtGold(player.gold) + 'g', 26, 55, 24, COLORS.paper, 'left', 900);
    drawText('BEST ' + fmtGold(Math.max(bestGold, player.gold)) + 'g', 116, 54, 10, COLORS.muted, 'left', 800);
    drawText('HULL ' + '◆'.repeat(player.hullLevel) + '◇'.repeat(3 - player.hullLevel), 116, 31, 10, COLORS.foam, 'left', 800);

    ctx.fillStyle = 'rgba(7, 25, 35, .73)';
    roundedRect(ctx, W - 115, 12, 103, 70, 16); ctx.fill();
    drawText('HOLD ' + cargoCount() + '/' + player.capacity, W - 63, 30, 10, COLORS.paper, 'center', 900);
    drawWindArrow(W - 96, 51, 11);
    drawText('WIND ' + Math.round(wind.speed), W - 52, 51, 9, COLORS.foam, 'center', 800);
    drawText('TIME ' + formatTime(elapsed), W - 63, 69, 9, COLORS.muted, 'center', 800);
    ctx.fillStyle = 'rgba(7, 25, 35, .54)'; roundedRect(ctx, W - 52, 90, 40, 40, 12); ctx.fill();
    drawText('↻', W - 32, 110, 22, COLORS.paper, 'center', 900);

    drawText('VOYAGE GOALS', 16, 104, 9, COLORS.foam, 'left', 900);
    drawGoal('1,000 GOLD', player.gold >= 1000, 16, 121);
    drawGoal('5,000 GOLD', player.gold >= 5000, 16, 137);
    drawGoal('FLAGSHIP HULL', player.hullLevel >= 3, 16, 153);

    ctx.restore();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function drawGoal(text, complete, x, y) {
    drawText(complete ? '✓' : '○', x, y, 12, complete ? COLORS.gold : COLORS.muted, 'left', 900);
    drawText(text, x + 17, y, 9, complete ? COLORS.paper : COLORS.muted, 'left', 800);
  }

  function drawBottomControls() {
    const dialX = W - 62;
    const dialY = H - 86;
    ctx.save();
    ctx.fillStyle = 'rgba(7, 25, 35, .74)';
    roundedRect(ctx, 12, H - 112, Math.max(152, W - 104), 98, 18); ctx.fill();
    drawText(messageClock > 0 ? message : 'Tap water to steer • trim • dock to trade', 24, H - 88, 10, COLORS.paper, 'left', 700);
    const sail = getSailData();
    const pointName = sail.point < sail.noGo ? 'IN IRONS' : sail.point < 0.9 ? 'CLOSE REACH' : sail.point < 2.1 ? 'BEAM REACH' : 'RUNNING';
    drawText(pointName, 24, H - 59, 11, sail.point < sail.noGo ? COLORS.coral : COLORS.gold, 'left', 900);
    drawText('SAIL ' + Math.round(sail.trimEfficiency * 100) + '%', 24, H - 37, 10, COLORS.muted, 'left', 800);
    if (player.inStorm) drawText('SQUALL BOOST', 106, H - 59, 10, '#c5cce0', 'left', 900);

    ctx.translate(dialX, dialY);
    ctx.fillStyle = 'rgba(19, 59, 66, .95)'; ctx.beginPath(); ctx.arc(0, 0, 45, 0, TAU); ctx.fill();
    ctx.strokeStyle = COLORS.foam; ctx.lineWidth = 2; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(0, 0, 42, -1.45, 1.45); ctx.stroke(); ctx.globalAlpha = 1;
    const angle = player.sailTrim;
    ctx.save(); ctx.rotate(angle);
    ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke();
    ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(0, -35, 7, 0, TAU); ctx.fill();
    ctx.restore();
    drawText('TRIM', 0, 22, 9, COLORS.paper, 'center', 900);
    ctx.restore();
  }

  function drawMarket() {
    ctx.save();
    ctx.fillStyle = 'rgba(3, 17, 26, .68)'; ctx.fillRect(0, 0, W, H);
    const panel = { x: 12, y: Math.max(80, H * .12), w: W - 24, h: Math.min(H - Math.max(92, H * .12) - 12, 560) };
    ctx.fillStyle = '#f0ead8'; roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 22); ctx.fill();
    ctx.fillStyle = COLORS.ink; roundedRect(ctx, panel.x + 3, panel.y + 3, panel.w - 6, panel.h - 6, 20); ctx.fill();
    drawText(islands[activeHarbor].name, panel.x + 20, panel.y + 29, 19, COLORS.paper, 'left', 900);
    drawText('MARKET • shifting tide prices', panel.x + 20, panel.y + 53, 10, COLORS.muted, 'left', 800);
    ctx.fillStyle = 'rgba(244, 198, 109, .16)'; roundedRect(ctx, panel.x + panel.w - 60, panel.y + 13, 42, 42, 12); ctx.fill();
    drawText('×', panel.x + panel.w - 39, panel.y + 34, 24, COLORS.paper, 'center', 800);
    drawText('GOOD', panel.x + 20, panel.y + 82, 9, COLORS.muted, 'left', 900);
    drawText('PRICE', panel.x + panel.w - 143, panel.y + 82, 9, COLORS.muted, 'center', 900);
    drawText('BUY', panel.x + panel.w - 104, panel.y + 82, 9, COLORS.muted, 'center', 900);
    drawText('SELL', panel.x + panel.w - 40, panel.y + 82, 9, COLORS.muted, 'center', 900);
    GOODS.forEach((good, i) => {
      const y = panel.y + 96 + i * 57;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.08)'; roundedRect(ctx, panel.x + 12, y, panel.w - 24, 49, 12); ctx.fill();
      ctx.fillStyle = good.color; ctx.beginPath(); ctx.arc(panel.x + 29, y + 24, 7, 0, TAU); ctx.fill();
      drawText(good.name, panel.x + 44, y + 17, 11, COLORS.paper, 'left', 800);
      drawText('x' + player.cargo[i], panel.x + 44, y + 34, 9, COLORS.muted, 'left', 700);
      drawText(harborPrice(islands[activeHarbor], i) + 'g', panel.x + panel.w - 143, y + 24, 12, COLORS.gold, 'center', 900);
      drawButton('BUY', panel.x + panel.w - 131, y + 6, 54, 37, COLORS.teal);
      drawButton('SELL', panel.x + panel.w - 68, y + 6, 54, 37, '#a76d59');
    });
    const uy = panel.y + 96 + GOODS.length * 57 + 18;
    ctx.strokeStyle = 'rgba(244, 238, 220, .14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(panel.x + 18, uy - 9); ctx.lineTo(panel.x + panel.w - 18, uy - 9); ctx.stroke();
    drawText('SHIPWRIGHT', panel.x + 20, uy + 11, 10, COLORS.foam, 'left', 900);
    const cost = upgradeCost();
    drawText(player.hullLevel >= 3 ? 'FLAGSHIP READY' : 'NEXT HULL  +' + (player.hullLevel + 1) * 8 + ' HOLD', panel.x + 20, uy + 31, 10, COLORS.paper, 'left', 800);
    drawButton(player.hullLevel >= 3 ? 'FITTED' : 'UPGRADE ' + cost + 'g', panel.x + panel.w - 135, uy + 3, 117, 43, player.hullLevel >= 3 ? '#55766f' : COLORS.gold, COLORS.ink);
    drawText('Tap × to cast off', panel.x + panel.w / 2, panel.y + panel.h - 19, 9, COLORS.muted, 'center', 700);
    ctx.restore();
  }

  function drawButton(text, x, y, w, h, fill, textColor) {
    ctx.fillStyle = fill; roundedRect(ctx, x, y, w, h, 11); ctx.fill();
    drawText(text, x + w / 2, y + h / 2 + 1, 10, textColor || COLORS.ink, 'center', 900);
  }

  function drawWin() {
    ctx.save();
    ctx.fillStyle = 'rgba(3, 14, 23, .78)'; ctx.fillRect(0, 0, W, H);
    const x = 22; const y = H * .25; const w = W - 44; const h = 290;
    ctx.fillStyle = '#f0ead8'; roundedRect(ctx, x, y, w, h, 24); ctx.fill();
    ctx.fillStyle = COLORS.ink; roundedRect(ctx, x + 4, y + 4, w - 8, h - 8, 20); ctx.fill();
    drawText('VOYAGE COMPLETE', W / 2, y + 47, 21, COLORS.gold, 'center', 900);
    drawText('The archipelago knows your flag.', W / 2, y + 78, 11, COLORS.paper, 'center', 700);
    drawGoal('1,000 GOLD', true, x + 38, y + 123);
    drawGoal('5,000 GOLD', true, x + 38, y + 150);
    drawGoal('FLAGSHIP HULL', true, x + 38, y + 177);
    drawText('TREASURY ' + fmtGold(player.gold) + 'g  •  ' + formatTime(elapsed), W / 2, y + 207, 11, COLORS.foam, 'center', 800);
    drawButton('KEEP SAILING', x + 22, y + h - 57, w - 44, 42, COLORS.gold);
    drawText('R or ↻ for a new voyage', W / 2, y + h + 24, 10, COLORS.paper, 'center', 700);
    ctx.restore();
  }

  function draw() {
    const shakeX = screenShake ? (Math.random() - .5) * screenShake * 12 : 0;
    const shakeY = screenShake ? (Math.random() - .5) * screenShake * 12 : 0;
    ctx.save(); ctx.translate(shakeX, shakeY);
    drawWater();
    drawStorms();
    islands.forEach(drawIsland);
    drawParticles();
    drawPlayer();
    ctx.restore();
    drawHud();
    drawBottomControls();
    if (marketOpen) drawMarket();
    if (won) drawWin();
  }

  function resize() {
    W = Math.max(320, window.innerWidth);
    H = Math.max(480, window.innerHeight);
    const maxAxis = 960;
    dpr = Math.min(window.devicePixelRatio || 1, 2, maxAxis / Math.max(W, H));
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function isInside(x, y, rx, ry, rw, rh) { return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh; }

  function handlePointerDown(event) {
    event.preventDefault();
    const p = pointerPos(event);
    pointer = { x: p.x, y: p.y, down: true, moved: false, draggingTrim: false, id: event.pointerId };
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    if (!marketOpen && !won && Math.hypot(p.x - (W - 62), p.y - (H - 86)) < 58) {
      pointer.draggingTrim = true;
      updateTrimFromPointer(p.x, p.y);
    }
  }

  function handlePointerMove(event) {
    if (!pointer.down || (pointer.id !== null && event.pointerId !== pointer.id)) return;
    event.preventDefault();
    const p = pointerPos(event);
    if (Math.hypot(p.x - pointer.x, p.y - pointer.y) > 5) pointer.moved = true;
    pointer.x = p.x; pointer.y = p.y;
    if (pointer.draggingTrim) updateTrimFromPointer(p.x, p.y);
  }

  function updateTrimFromPointer(x, y) {
    const dx = x - (W - 62); const dy = y - (H - 86);
    if (Math.hypot(dx, dy) < 10) return;
    const dialAngle = Math.atan2(dy, dx) + Math.PI / 2;
    player.sailTrim = clamp(wrapAngle(dialAngle), -1.45, 1.45);
  }

  function handlePointerUp(event) {
    if (pointer.id !== null && event.pointerId !== pointer.id) return;
    event.preventDefault();
    const p = pointerPos(event);
    const wasTap = pointer.down && !pointer.moved && !pointer.draggingTrim;
    const wasTrim = pointer.draggingTrim;
    pointer.down = false; pointer.draggingTrim = false; pointer.id = null;
    if (wasTrim) { setMessage('Trim set — aim across the wind for speed', 2); return; }
    if (!wasTap) return;
    if (won) {
      if (isInside(p.x, p.y, W / 2 - 135, H * .25 + 290 - 57, 270, 54)) keepSailing();
      return;
    }
    if (marketOpen) { handleMarketTap(p.x, p.y); return; }
    if (isInside(p.x, p.y, W - 58, 86, 52, 52)) { resetGame(); return; }
    const world = worldPoint(p.x, p.y);
    let tappedHarbor = -1;
    islands.forEach((island, i) => {
      const dock = harborPoint(island);
      if (distance(world, dock) < 45) tappedHarbor = i;
    });
    if (tappedHarbor >= 0) { dockAt(tappedHarbor); return; }
    if (p.y > H - 140) return;
    player.targetHeading = Math.atan2(world.y - player.y, world.x - player.x);
    addBurst(world.x, world.y, COLORS.foam, 5, .3);
    setMessage('Course set', 1.2);
  }

  function handleMarketTap(x, y) {
    const panel = { x: 12, y: Math.max(80, H * .12), w: W - 24, h: Math.min(H - Math.max(92, H * .12) - 12, 560) };
    if (isInside(x, y, panel.x + panel.w - 72, panel.y + 8, 60, 56)) { marketOpen = false; activeHarbor = -1; return; }
    GOODS.forEach((_, i) => {
      const rowY = panel.y + 96 + i * 57;
      if (isInside(x, y, panel.x + panel.w - 137, rowY, 62, 49)) buy(i);
      if (isInside(x, y, panel.x + panel.w - 74, rowY, 62, 49)) sell(i);
    });
    const upgradeY = panel.y + 96 + GOODS.length * 57 + 18;
    if (isInside(x, y, panel.x + panel.w - 145, upgradeY, 125, 55)) upgradeHull();
  }

  function keyDown(event) {
    keys[event.key] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(event.key)) event.preventDefault();
    if (event.key === 'r' || event.key === 'R') resetGame();
    if (event.key === 'e' || event.key === 'E' || event.key === ' ' || event.key === 'Enter') {
      if (marketOpen) { marketOpen = false; activeHarbor = -1; }
      else if (!won) tryDock();
    }
  }
  function keyUp(event) { keys[event.key] = false; }

  function loop(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(.033, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', handlePointerUp, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('beforeunload', saveGame);

  resize();
  makeWorld();
  loadGame();
  requestAnimationFrame(loop);
}());
