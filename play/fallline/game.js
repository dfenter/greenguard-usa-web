(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('playfield');
  const ctx = canvas.getContext('2d', { alpha: false });
  const gameEl = $('game');
  const TAU = Math.PI * 2;
  const WORLD = 1800;
  const MATCH_LENGTH = 240;
  const MAX_PARTICLES = 240;
  const MAX_BULLETS = 160;
  const MAX_LOOT = 115;
  const MAX_FEED = 8;
  const STORAGE_KEY = 'fallline.run02.stats';

  const weaponDefs = {
    pistol: { name: 'Rivet Pistol', short: 'PISTOL', damage: 21, rate: .34, speed: 690, range: 670, mag: 12, reserve: 48, pellets: 1, spread: .035, color: '#d7ff5c', tier: 1 },
    smg: { name: 'Spark SMG', short: 'SMG', damage: 12, rate: .115, speed: 650, range: 540, mag: 30, reserve: 90, pellets: 1, spread: .09, color: '#72e7ff', tier: 2 },
    rifle: { name: 'Branch Rifle', short: 'RIFLE', damage: 34, rate: .42, speed: 900, range: 880, mag: 18, reserve: 54, pellets: 1, spread: .025, color: '#ffc86b', tier: 3 },
    shotgun: { name: 'Brass Scatter', short: 'SHOTGUN', damage: 10, rate: .72, speed: 560, range: 390, mag: 6, reserve: 30, pellets: 7, spread: .29, color: '#ff896f', tier: 2 }
  };
  const botNames = ['Mica Vale', 'Rook Nellis', 'Tansy Quill', 'Juno Pike', 'Vex Rowan', 'Nori Flint', 'Sable Kest', 'Odo Brant', 'Lumen Fox', 'Pip Rusk', 'Kite Moss', 'Orla Venn', 'Bram Coil', 'Yara Slate', 'Cinder Poe', 'Glim Rell', 'Iris Knott', 'Wren Dusk', 'Moss Calder', 'Tavi Wisp', 'Zed Lark', 'Fenn Arlo', 'Cora Drift'];
  const botColors = ['#fd9b76', '#b6ee69', '#85d8ff', '#e1a3ff', '#ffd26b', '#68e0c0'];
  const personalities = ['looter', 'camper', 'hunter', 'edge-runner'];
  const stormStarts = [0, 48, 102, 156, 210];
  const stormRadii = [790, 620, 430, 240, 90];

  const input = {
    keys: new Set(), pointers: new Map(), queued: { interact: false },
    stick: { id: null, x: 0, y: 0 }, fire: { id: null, held: false }, interact: { id: null }
  };

  let audio = null;
  function unlockAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
    if (audio) beep(220, .045, 'sine', .018);
    $('audioOverlay').setAttribute('aria-hidden', 'true');
  }
  function beep(freq, duration, type, volume) {
    if (!audio) return;
    const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.type = type || 'square'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || .03, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  }

  function defaultStats() { return { wins: 0, kills: 0, best: 0 }; }
  function loadStats() {
    const fallback = defaultStats();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== 'string' || !raw) return fallback;
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
      for (const key of ['wins', 'kills', 'best']) {
        if (typeof value[key] !== 'number') return fallback;
        const n = value[key];
        if (!Number.isFinite(n) || n < 0 || n > 999999 || !Number.isInteger(n)) return fallback;
      }
      return { wins: value.wins, kills: value.kills, best: value.best };
    } catch (_) { return fallback; }
  }
  function saveStats(stats) {
    try {
      const clean = { wins: Number.isInteger(stats.wins) && stats.wins >= 0 ? stats.wins : 0, kills: Number.isInteger(stats.kills) && stats.kills >= 0 ? stats.kills : 0, best: Number.isInteger(stats.best) && stats.best >= 0 ? stats.best : 0 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (_) {}
  }
  function capPush(list, item, max) { list.push(item); if (list.length > max) list.splice(0, list.length - max); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  function copyWeapon(kind) { const d = weaponDefs[kind]; return { kind, name: d.name, ammo: d.mag, reserve: d.reserve, cooldown: 0, reload: 0 }; }

  class RNG {
    constructor(seed) { this.seed = seed >>> 0; }
    next() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    pick(list) { return list[Math.floor(this.next() * list.length)]; }
  }

  class Fallline {
    constructor() {
      this.stats = loadStats(); this.seed = 0xF4111E; this.rng = new RNG(this.seed);
      this.viewW = 390; this.viewH = 700; this.scale = 1; this.camera = { x: 900, y: 900 };
      this.state = 'active'; this.paused = false; this.lastFrame = performance.now(); this.matchTime = 0; this.alive = 24;
      this.bots = []; this.loot = []; this.bullets = []; this.particles = []; this.feed = []; this.buildings = []; this.replayT = 0; this.deathShot = null; this.timers = new Set();
      this.player = null; this.shake = 0; this.flash = 0; this.prevPhase = 0;
      this.bind(); this.resize(); this.resetMatch(); requestAnimationFrame(t => this.frame(t));
    }

    bind() {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => this.resize());
      window.addEventListener('blur', () => this.resetInput());
      window.addEventListener('keydown', e => {
        unlockAudio();
        if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', ' ', 'e', 'E', 'r', 'R', 'Enter'].includes(e.key)) e.preventDefault();
        this.keysDown(e.key, true);
      }, { passive: false });
      window.addEventListener('keyup', e => this.keysDown(e.key, false));
      this.bindPointer($('stick'), 'stick'); this.bindPointer($('fire'), 'fire'); this.bindPointer($('interact'), 'interact');
      $('audioButton').addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); });
      $('requeue').addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); this.resetMatch(); });
      $('requeue').addEventListener('click', () => { unlockAudio(); this.resetMatch(); });
      $('audioOverlay').addEventListener('pointerdown', () => unlockAudio(), { passive: true });
      canvas.addEventListener('pointerdown', () => unlockAudio(), { passive: true });
    }

    bindPointer(el, kind) {
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); unlockAudio();
        if (input[kind].id !== null) return;
        if (input.pointers.size >= 8) return;
        input[kind].id = e.pointerId; input.pointers.set(e.pointerId, kind);
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        if (kind === 'fire') { input.fire.held = true; el.classList.add('held'); }
        if (kind === 'interact') input.queued.interact = true;
        if (kind === 'stick') this.updateStick(e);
      }, { passive: false });
      el.addEventListener('pointermove', e => { if (input[kind].id === e.pointerId && kind === 'stick') { e.preventDefault(); this.updateStick(e); } }, { passive: false });
      const release = e => { if (input[kind].id !== e.pointerId) return; e.preventDefault(); this.releasePointer(kind, e.pointerId, el); };
      el.addEventListener('pointerup', release, { passive: false }); el.addEventListener('pointercancel', release, { passive: false });
    }

    releasePointer(kind, id, el) {
      input.pointers.delete(id); input[kind].id = null;
      if (kind === 'fire') { input.fire.held = false; el.classList.remove('held'); }
      if (kind === 'stick') { input.stick.x = 0; input.stick.y = 0; $('stickKnob').style.transform = 'translate(0, 0)'; }
    }
    updateStick(e) {
      const r = $('stick').getBoundingClientRect(); const max = 31;
      let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); const len = Math.hypot(x, y);
      if (len > max) { x = x / len * max; y = y / len * max; }
      input.stick.x = clamp(x / max, -1, 1); input.stick.y = clamp(y / max, -1, 1); $('stickKnob').style.transform = `translate(${x}px, ${y}px)`;
    }
    keysDown(key, down) {
      if (down) input.keys.add(key.toLowerCase()); else input.keys.delete(key.toLowerCase());
      if (down && key.toLowerCase() === 'e') input.queued.interact = true;
      if (down && key.toLowerCase() === 'r') this.startReload(this.player, true);
      if (down && key === 'Enter' && this.state !== 'active' && !this.isLandscape()) this.resetMatch();
    }
    resetInput() {
      for (const [id, kind] of input.pointers) {
        const el = kind === 'stick' ? $('stick') : kind === 'fire' ? $('fire') : $('interact');
        try { el.releasePointerCapture(id); } catch (_) {}
      }
      input.keys.clear(); input.queued.interact = false; input.pointers.clear();
      input.stick.id = null; input.stick.x = 0; input.stick.y = 0; input.fire.id = null; input.fire.held = false; input.interact.id = null;
      $('stickKnob').style.transform = 'translate(0, 0)'; $('fire').classList.remove('held');
    }
    setTimer(fn, ms) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); return id; }
    clearTimers() { for (const id of this.timers) clearTimeout(id); this.timers.clear(); }

    resize() {
      this.viewW = Math.max(1, window.innerWidth); this.viewH = Math.max(1, window.innerHeight);
      const longAxis = Math.max(this.viewW, this.viewH); this.scale = Math.min(window.devicePixelRatio || 1, 2, 960 / longAxis);
      canvas.width = Math.max(1, Math.floor(this.viewW * this.scale)); canvas.height = Math.max(1, Math.floor(this.viewH * this.scale));
      canvas.style.width = `${this.viewW}px`; canvas.style.height = `${this.viewH}px`; ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      const landscape = this.isLandscape(); this.paused = landscape;
      $('rotateOverlay').setAttribute('aria-hidden', landscape ? 'false' : 'true');
      if (landscape) this.resetInput();
    }
    isLandscape() { return this.viewW > this.viewH; }

    resetMatch() {
      this.clearTimers(); this.resetInput(); this.rng = new RNG(this.seed); this.state = 'active'; this.matchTime = 0; this.prevPhase = 0; this.replayT = 0; this.deathShot = null; this.shake = 0; this.flash = 0; this.feed.length = 0; this.bullets.length = 0; this.particles.length = 0;
      $('resultOverlay').setAttribute('aria-hidden', 'true'); this.makeMap(); this.spawnActors(); this.updateHud();
    }
    makeMap() {
      this.buildings.length = 0; this.loot.length = 0;
      const layouts = [[180,180,170,110],[490,165,220,130],[850,130,150,220],[1240,190,230,120],[1500,410,120,220],[1210,520,210,160],[1500,850,170,130],[1210,1010,250,150],[1450,1260,180,220],[1090,1430,230,120],[650,1430,190,150],[180,1260,230,130],[120,850,150,210],[420,570,230,130],[730,790,170,170],[910,460,130,110]];
      for (const [x, y, w, h] of layouts) this.buildings.push({ x, y, w, h, tone: this.rng.int(0, 2) });
      for (let i = 0; i < 78; i++) {
        let p = this.findOpen(70); if (!p) continue;
        const roll = this.rng.next(); let type = roll < .44 ? 'weapon' : roll < .72 ? 'ammo' : roll < .88 ? 'armor' : 'med';
        let kind = null; if (type === 'weapon') kind = this.rng.pick(['pistol', 'smg', 'rifle', 'shotgun']);
        capPush(this.loot, { x: p.x, y: p.y, type, kind, taken: false, bob: this.rng.range(0, TAU) }, MAX_LOOT);
      }
    }
    findOpen(margin) {
      for (let tries = 0; tries < 20; tries++) { const p = { x: this.rng.range(margin, WORLD - margin), y: this.rng.range(margin, WORLD - margin) }; if (!this.blocked(p.x, p.y, 18)) return p; }
      return null;
    }
    spawnActors() {
      this.player = { x: 900, y: 900, r: 14, hp: 100, shield: 0, alive: true, weapon: copyWeapon('pistol'), medkits: 0, kills: 0, color: '#d7ff5c', name: 'YOU', lastAim: -Math.PI / 2, hitFlash: 0 };
      if (this.blocked(this.player.x, this.player.y, 16)) { const p = this.findOpen(60); if (p) Object.assign(this.player, p); }
      this.bots.length = 0;
      for (let i = 0; i < 23; i++) {
        let p = this.findActorSpawn(); if (!p) p = { x: 900 + (i % 5) * 35, y: 900 + Math.floor(i / 5) * 35 };
        const personality = personalities[i % personalities.length]; const kind = this.rng.pick(['pistol', 'pistol', 'smg', 'rifle', 'shotgun']);
        this.bots.push({ x: p.x, y: p.y, r: 13, hp: 100, shield: this.rng.next() < .3 ? 25 : 0, alive: true, weapon: copyWeapon(kind), medkits: this.rng.next() < .25 ? 1 : 0, name: botNames[i], color: botColors[i % botColors.length], personality, target: null, wander: null, think: this.rng.range(0, 1), kills: 0, hitFlash: 0, dir: this.rng.range(0, TAU) });
      }
      this.alive = 24; this.camera.x = this.player.x; this.camera.y = this.player.y; this.addFeed('DROP COMPLETE — 23 RIVALS IN THE FALLLINE', 'system');
    }
    findActorSpawn() {
      for (let i = 0; i < 40; i++) { const p = this.findOpen(90); if (p && dist(p, this.player) > 180 && this.bots.every(b => dist(p, b) > 65)) return p; }
      return this.findOpen(90) || { x: 200, y: 200 };
    }

    frame(now) {
      const raw = Math.max(0, (now - this.lastFrame) / 1000); this.lastFrame = now; const dt = Math.min(raw, .05);
      if (!this.isLandscape()) {
        if (this.state === 'active') this.update(dt); else if (this.state === 'death') this.replayT += dt;
      }
      this.render(); requestAnimationFrame(t => this.frame(t));
    }
    update(dt) {
      if (!this.player.alive) return;
      this.matchTime = Math.min(MATCH_LENGTH, this.matchTime + dt); this.shake = Math.max(0, this.shake - dt * 2.8); this.flash = Math.max(0, this.flash - dt); this.player.hitFlash = Math.max(0, this.player.hitFlash - dt);
      for (const b of this.bots) b.hitFlash = Math.max(0, b.hitFlash - dt);
      const phase = this.stormPhase(); if (phase !== this.prevPhase && this.matchTime > 0) { this.prevPhase = phase; this.addFeed(`STORM PHASE ${phase}/4 — MOVE WITH THE RING`, 'storm'); beep(120, .12, 'sawtooth', .025); }
      this.updatePlayer(dt); for (const bot of this.bots) if (bot.alive) this.updateBot(bot, dt); this.updateBullets(dt); this.updateStorm(dt); this.updateParticles(dt);
      this.camera.x += (this.player.x - this.camera.x) * Math.min(1, dt * 8); this.camera.y += (this.player.y - this.camera.y) * Math.min(1, dt * 8);
      this.updateHud();
      if (this.matchTime >= MATCH_LENGTH && this.player.alive) this.win();
      if (this.alive <= 1 && this.player.alive) this.win();
    }
    movementInput() {
      let x = input.stick.x, y = input.stick.y; if (!x && !y) { x = (input.keys.has('d') ? 1 : 0) - (input.keys.has('a') ? 1 : 0); y = (input.keys.has('s') ? 1 : 0) - (input.keys.has('w') ? 1 : 0); }
      const len = Math.hypot(x, y); return len > 1 ? { x: x / len, y: y / len } : { x, y };
    }
    updatePlayer(dt) {
      const p = this.player; p.weapon.cooldown = Math.max(0, p.weapon.cooldown - dt); const m = this.movementInput(); this.moveEntity(p, m.x * 210 * dt, m.y * 210 * dt); if (m.x || m.y) p.lastAim = Math.atan2(m.y, m.x);
      this.startReload(p); if (input.fire.held || input.keys.has(' ')) this.shoot(p, true); if (input.queued.interact) { input.queued.interact = false; this.interact(p); }
      if (p.weapon.reload > 0) { p.weapon.reload -= dt; if (p.weapon.reload <= 0) this.finishReload(p); }
    }
    updateBot(bot, dt) {
      bot.think -= dt; bot.weapon.cooldown = Math.max(0, bot.weapon.cooldown - dt);
      if (bot.weapon.reload > 0) { bot.weapon.reload -= dt; if (bot.weapon.reload <= 0) this.finishReload(bot); }
      if (bot.think <= 0) { bot.think = bot.personality === 'hunter' ? .25 : .55 + this.rng.range(0, .4); bot.target = this.findNearestTarget(bot); bot.wander = this.botDestination(bot); }
      const target = bot.target && bot.target.alive ? bot.target : null; const targetDist = target ? dist(bot, target) : 9999; let dx = 0, dy = 0;
      if (target && targetDist < 760 && this.hasLine(bot, target)) {
        const a = angleTo(bot, target); const want = bot.personality === 'camper' ? (targetDist < 230 ? a + Math.PI : 0) : bot.personality === 'hunter' ? a : targetDist < 250 ? a + Math.PI : a + Math.PI / 2;
        if (bot.personality === 'camper' && targetDist > 170) { dx = Math.cos(bot.dir); dy = Math.sin(bot.dir); } else { dx = Math.cos(want); dy = Math.sin(want); }
        if (targetDist <= weaponDefs[bot.weapon.kind].range * 1.05) this.shoot(bot, false, target);
      } else if (bot.wander) { const a = angleTo(bot, bot.wander); dx = Math.cos(a); dy = Math.sin(a); }
      if (bot.personality === 'edge-runner') { const r = this.safeRadius(); const d = Math.hypot(bot.x - WORLD / 2, bot.y - WORLD / 2); if (d < r - 80) { const a = Math.atan2(bot.y - WORLD / 2, bot.x - WORLD / 2); dx = Math.cos(a); dy = Math.sin(a); } }
      if (Math.hypot(dx, dy) > .1) this.moveEntity(bot, dx * (bot.personality === 'hunter' ? 138 : 108) * dt, dy * (bot.personality === 'hunter' ? 138 : 108) * dt);
      this.botLoot(bot); this.startReload(bot);
    }
    botDestination(bot) {
      if (bot.personality === 'looter') { const loot = this.nearestLoot(bot); if (loot) return loot; }
      if (bot.personality === 'edge-runner') { const a = this.rng.range(0, TAU), r = Math.max(90, this.safeRadius() - 50); return { x: WORLD / 2 + Math.cos(a) * r, y: WORLD / 2 + Math.sin(a) * r }; }
      if (bot.personality === 'camper') return { x: clamp(bot.x + this.rng.range(-80, 80), 50, WORLD - 50), y: clamp(bot.y + this.rng.range(-80, 80), 50, WORLD - 50) };
      return { x: this.rng.range(80, WORLD - 80), y: this.rng.range(80, WORLD - 80) };
    }
    findNearestTarget(me) { let best = null, bestD = Infinity; const candidates = [this.player, ...this.bots]; for (const e of candidates) if (e !== me && e.alive) { const d = dist(me, e); if (d < bestD) { bestD = d; best = e; } } return best; }
    nearestLoot(e) { let best = null, bestD = 330; for (const item of this.loot) if (!item.taken) { const d = dist(e, item); if (d < bestD) { bestD = d; best = item; } } return best; }
    botLoot(bot) { const item = this.nearestLoot(bot); if (!item || dist(bot, item) > 31) return; item.taken = true; if (item.type === 'weapon' && item.kind && weaponDefs[item.kind].tier >= weaponDefs[bot.weapon.kind].tier) bot.weapon = copyWeapon(item.kind); else if (item.type === 'ammo') bot.weapon.reserve = Math.min(180, bot.weapon.reserve + 24); else if (item.type === 'armor') bot.shield = Math.min(50, bot.shield + 25); else if (item.type === 'med') bot.medkits = Math.min(2, bot.medkits + 1); }

    shoot(shooter, isPlayer, target) {
      if (!shooter.alive || shooter.weapon.reload > 0 || shooter.weapon.cooldown > 0) return;
      const d = weaponDefs[shooter.weapon.kind]; if (shooter.weapon.ammo <= 0) { this.startReload(shooter); return; }
      shooter.weapon.ammo--; shooter.weapon.cooldown = d.rate; const aim = target && target.alive ? angleTo(shooter, target) : shooter.lastAim || 0; shooter.lastAim = aim;
      for (let i = 0; i < d.pellets; i++) {
        const spread = (this.rng.next() - .5) * d.spread; const a = aim + spread; const bullet = { x: shooter.x + Math.cos(a) * 18, y: shooter.y + Math.sin(a) * 18, px: shooter.x, py: shooter.y, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed, ttl: d.range / d.speed, damage: d.damage, owner: shooter, color: d.color, from: { x: shooter.x, y: shooter.y } }; capPush(this.bullets, bullet, MAX_BULLETS); }
      this.burst(shooter.x + Math.cos(aim) * 17, shooter.y + Math.sin(aim) * 17, d.color, 3); if (isPlayer) { this.shake = Math.min(1, this.shake + .12); beep(d.short === 'SHOTGUN' ? 92 : 180, .045, 'square', .035); }
    }
    startReload(e, force) { if (!e || !e.alive || e.weapon.reload > 0 || e.weapon.reserve <= 0 || (!force && e.weapon.ammo > 0) || e.weapon.ammo >= weaponDefs[e.weapon.kind].mag) return; e.weapon.reload = .76; }
    finishReload(e) { if (!e || !e.weapon) return; const d = weaponDefs[e.weapon.kind]; const take = Math.min(d.mag - e.weapon.ammo, e.weapon.reserve); e.weapon.ammo += take; e.weapon.reserve -= take; e.weapon.reload = 0; if (e === this.player) beep(440, .05, 'triangle', .02); }
    updateBullets(dt) {
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i]; b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
        if (b.ttl <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD || this.blocked(b.x, b.y, 1)) { this.burst(b.x, b.y, '#bdcec2', 2); this.bullets.splice(i, 1); continue; }
        let hit = null; for (const e of [this.player, ...this.bots]) if (e !== b.owner && e.alive && this.segmentDistance(b.px, b.py, b.x, b.y, e.x, e.y) < e.r + 3) { hit = e; break; }
        if (hit) { this.damage(hit, b.damage, b.owner, b); this.burst(hit.x, hit.y, b.color, 7); this.bullets.splice(i, 1); }
      }
    }
    segmentDistance(x1, y1, x2, y2, px, py) { const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy; const t = len ? clamp(((px - x1) * dx + (py - y1) * dy) / len, 0, 1) : 0; return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
    damage(target, amount, owner, bullet) {
      if (!target.alive) return; let left = amount; if (target.shield > 0) { const absorbed = Math.min(target.shield, left); target.shield -= absorbed; left -= absorbed; } target.hp -= left; target.hitFlash = .14;
      if (target === this.player) { this.flash = .12; this.shake = Math.min(1, this.shake + .22); beep(75, .07, 'sawtooth', .03); }
      if (target.hp <= 0) this.eliminate(target, owner, bullet);
    }
    eliminate(victim, killer, bullet) {
      if (!victim.alive) return; victim.alive = false; this.alive = Math.max(0, this.alive - 1); if (killer) { killer.kills = (killer.kills || 0) + 1; if (killer === this.player) { this.stats.kills++; saveStats(this.stats); } }
      const killerName = killer ? killer.name : 'THE STORM'; this.addFeed(`${killerName} › ${victim.name}`, victim === this.player ? 'danger' : killer === this.player ? 'player' : 'bot'); this.burst(victim.x, victim.y, victim.color || '#fff', 22);
      if (victim === this.player) { this.deathShot = bullet ? { from: bullet.from, to: { x: victim.x, y: victim.y }, color: bullet.color || '#ff8066', killer: killerName } : null; this.state = 'death'; this.replayT = 0; this.showResult(false); beep(48, .3, 'sawtooth', .04); }
      else if (this.alive <= 1 && this.player.alive) this.win();
    }
    updateStorm(dt) {
      const r = this.safeRadius(), center = { x: WORLD / 2, y: WORLD / 2 };
      for (const e of [this.player, ...this.bots]) if (e.alive && dist(e, center) > r) { this.damage(e, 7 * dt, null, null); }
    }
    safeRadius() { const t = this.matchTime; for (let i = 0; i < stormStarts.length - 1; i++) if (t < stormStarts[i + 1]) { const a = (t - stormStarts[i]) / (stormStarts[i + 1] - stormStarts[i]); return stormRadii[i] + (stormRadii[i + 1] - stormRadii[i]) * clamp(a, 0, 1); } return stormRadii[4]; }
    stormPhase() { let phase = 1; for (let i = 1; i < stormStarts.length - 1; i++) if (this.matchTime >= stormStarts[i]) phase = i + 1; return clamp(phase, 1, 4); }

    interact(p) {
      let best = null, bestD = 62; for (const item of this.loot) if (!item.taken) { const d = dist(p, item); if (d < bestD) { best = item; bestD = d; } }
      if (!best) return; best.taken = true;
      if (best.type === 'weapon' && best.kind) { const old = p.weapon.kind; p.weapon = copyWeapon(best.kind); this.addFeed(`FOUND ${weaponDefs[best.kind].name}`, 'loot'); if (old !== best.kind) this.flash = .07; }
      if (best.type === 'ammo') { p.weapon.reserve = Math.min(240, p.weapon.reserve + 36); this.addFeed('AMMO +36', 'loot'); }
      if (best.type === 'armor') { p.shield = Math.min(75, p.shield + 25); this.addFeed('ARMOR PLATE +25', 'loot'); }
      if (best.type === 'med') { p.medkits = Math.min(3, p.medkits + 1); this.addFeed('MEDKIT SECURED', 'loot'); }
      this.burst(best.x, best.y, '#d7ff5c', 10); beep(580, .08, 'triangle', .024);
    }
    updateParticles(dt) { for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; if (p.life <= 0) this.particles.splice(i, 1); } }
    burst(x, y, color, count) { for (let i = 0; i < count; i++) { const a = this.rng.range(0, TAU), s = this.rng.range(22, 110); capPush(this.particles, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: this.rng.range(.18, .52), max: .52, color, size: this.rng.range(1, 3.5) }, MAX_PARTICLES); } }
    addFeed(text, type) { capPush(this.feed, { text, type: type || 'bot', age: 0 }, MAX_FEED); }
    win() { if (this.state !== 'active' || !this.player.alive) return; this.state = 'win'; this.stats.wins++; this.stats.best = Math.max(this.stats.best, this.player.kills); saveStats(this.stats); this.showResult(true); this.burst(this.player.x, this.player.y, '#d7ff5c', 45); beep(660, .12, 'triangle', .04); this.setTimer(() => beep(880, .18, 'triangle', .04), 130); }

    updateHud() {
      const p = this.player; if (!p) return; $('aliveReadout').textContent = `${this.alive} ALIVE`; $('healthReadout').textContent = `${Math.max(0, Math.ceil(p.hp))}`; $('shieldReadout').textContent = `${Math.max(0, Math.ceil(p.shield))}`;
      $('healthBar').style.width = `${clamp(p.hp, 0, 100)}%`; $('shieldBar').style.width = `${clamp(p.shield, 0, 75) / .75}%`; $('weaponReadout').textContent = p.weapon.reload > 0 ? 'RELOADING…' : weaponDefs[p.weapon.kind].name.toUpperCase(); $('ammoReadout').textContent = p.weapon.ammo; $('reserveReadout').textContent = `/ ${p.weapon.reserve}`; $('medReadout').textContent = `MEDKITS ${p.medkits}`;
      const phase = this.stormPhase(), next = phase < 4 ? stormStarts[phase] : MATCH_LENGTH; const remain = Math.max(0, next - this.matchTime); $('stormReadout').textContent = `STORM PHASE ${phase}/4`; $('stormTimer').textContent = phase < 4 ? `COLLAPSES ${this.clock(remain)}` : 'FINAL RING'; $('matchTimer').textContent = this.clock(Math.max(0, MATCH_LENGTH - this.matchTime));
      const loot = this.nearestLoot(p), prompt = loot && dist(p, loot) < 62; $('interactPrompt').style.opacity = prompt ? '1' : '0'; $('interactPrompt').textContent = prompt ? `E  ${loot.type === 'weapon' ? weaponDefs[loot.kind].short : loot.type.toUpperCase()}` : 'INTERACT';
      const target = this.findNearestTarget(p), reticle = $('reticle'); if (target && dist(p, target) < 840) { const s = this.toScreen(target.x, target.y); reticle.style.left = `${s.x}px`; reticle.style.top = `${s.y}px`; reticle.style.opacity = '1'; } else reticle.style.opacity = '0';
      this.feed.forEach(f => f.age += .016); $('feed').innerHTML = this.feed.map(f => `<div class="${f.type === 'bot' ? 'bot' : ''}">${this.escape(f.text)}</div>`).join('');
    }
    showResult(won) {
      const placement = won ? 1 : Math.min(24, this.alive + 1); $('resultOverlay').setAttribute('aria-hidden', 'false'); $('resultEyebrow').textContent = won ? 'LAST SIGNAL STANDING' : 'LINE LOST'; $('resultTitle').textContent = won ? 'YOU HELD THE FALLLINE' : 'RUN ENDED'; $('resultCopy').textContent = won ? 'The ring closed. Every rival is down.' : `Eliminated by ${this.deathShot ? this.deathShot.killer : 'the storm'}. No spectating — queue another drop.`; $('placementReadout').textContent = `#${placement}`; $('killsReadout').textContent = this.player.kills; $('timeReadout').textContent = this.clock(this.matchTime); $('careerReadout').textContent = `${this.stats.wins} WINS · ${this.stats.kills} KILLS`; }
    clock(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    escape(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    moveEntity(e, dx, dy) {
      const nx = clamp(e.x + dx, e.r + 10, WORLD - e.r - 10); if (!this.blocked(nx, e.y, e.r)) e.x = nx;
      const ny = clamp(e.y + dy, e.r + 10, WORLD - e.r - 10); if (!this.blocked(e.x, ny, e.r)) e.y = ny;
    }
    blocked(x, y, r) { for (const b of this.buildings) if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true; return false; }
    hasLine(a, b) { const d = dist(a, b), steps = Math.ceil(d / 32); for (let i = 1; i < steps; i++) { const t = i / steps; if (this.blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 2)) return false; } return true; }
    toScreen(x, y) { return { x: x - this.camera.x + this.viewW / 2, y: y - this.camera.y + this.viewH / 2 }; }
    drawWorld() {
      const shakeX = Math.sin(this.matchTime * 91.1) * this.shake * 4, shakeY = Math.cos(this.matchTime * 77.3) * this.shake * 4; ctx.save(); ctx.translate(shakeX, shakeY);
      ctx.fillStyle = '#253b31'; ctx.fillRect(0, 0, this.viewW, this.viewH);
      const left = this.camera.x - this.viewW / 2 - 60, top = this.camera.y - this.viewH / 2 - 60;
      ctx.strokeStyle = '#8fbe7540'; ctx.lineWidth = 1; for (let x = Math.floor(left / 90) * 90; x < left + this.viewW + 120; x += 90) { const s = this.toScreen(x, 0); ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, this.viewH); ctx.stroke(); } for (let y = Math.floor(top / 90) * 90; y < top + this.viewH + 120; y += 90) { const s = this.toScreen(0, y); ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(this.viewW, s.y); ctx.stroke(); }
      for (const b of this.buildings) this.drawBuilding(b); this.drawLandmarks(); for (const item of this.loot) if (!item.taken) this.drawLoot(item); for (const b of this.bots) if (b.alive) this.drawActor(b, false); if (this.player.alive) this.drawActor(this.player, true); for (const b of this.bullets) this.drawBullet(b); for (const p of this.particles) this.drawParticle(p);
      this.drawStorm(); ctx.restore();
    }
    drawBuilding(b) { const s = this.toScreen(b.x, b.y); ctx.fillStyle = ['#1a2b2b', '#203030', '#172727'][b.tone]; ctx.fillRect(s.x, s.y, b.w, b.h); ctx.strokeStyle = '#a9d0aa55'; ctx.lineWidth = 2; ctx.strokeRect(s.x + 2, s.y + 2, b.w - 4, b.h - 4); ctx.fillStyle = '#c4e5af18'; for (let x = s.x + 20; x < s.x + b.w - 10; x += 34) for (let y = s.y + 19; y < s.y + b.h - 8; y += 34) ctx.fillRect(x, y, 12, 7); ctx.fillStyle = '#07131366'; ctx.fillRect(s.x + 7, s.y + b.h / 2 - 5, 15, 10); }
    drawLandmarks() { const points = [[900,260,'NORTH RIDGE'],[300,1020,'PINE FIELD'],[1030,1180,'DRY CREEK'],[1530,1050,'ECHO YARD']]; for (const [x,y,label] of points) { const s = this.toScreen(x,y); ctx.fillStyle = '#b8e28d25'; ctx.beginPath(); ctx.arc(s.x,s.y,46,0,TAU); ctx.fill(); ctx.fillStyle='#b8d2a777'; ctx.font='9px Arial'; ctx.fillText(label,s.x-32,s.y+65); } }
    drawLoot(item) { const s = this.toScreen(item.x, item.y), bob = Math.sin(this.matchTime * 3 + item.bob) * 3; const color = item.type === 'weapon' ? weaponDefs[item.kind].color : item.type === 'armor' ? '#69f2ce' : item.type === 'med' ? '#ff86b1' : '#ffc86b'; ctx.save(); ctx.translate(s.x, s.y + bob); ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#11201b'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(item.type === 'weapon' ? weaponDefs[item.kind].short[0] : item.type === 'armor' ? 'A' : item.type === 'med' ? '+' : '•', 0, 1); ctx.restore(); }
    drawActor(e, player) { const s = this.toScreen(e.x, e.y); ctx.save(); ctx.translate(s.x,s.y); ctx.shadowColor = e.hitFlash > 0 ? '#fff' : e.color; ctx.shadowBlur = player ? 14 : 6; ctx.fillStyle = e.hitFlash > 0 ? '#fff' : e.color; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = player ? '#f6ffbc' : '#0c1716'; ctx.lineWidth = player ? 3 : 2; ctx.stroke(); const a = e.lastAim || e.dir || 0; ctx.strokeStyle = '#e8f3e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Math.cos(a)*7, Math.sin(a)*7); ctx.lineTo(Math.cos(a)*18, Math.sin(a)*18); ctx.stroke(); if (e.shield > 0) { ctx.strokeStyle='#69f2ceaa'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,e.r+4,-Math.PI*.8,Math.PI*.25); ctx.stroke(); } if (!player) { ctx.fillStyle='#06100f'; ctx.fillRect(-14,-23,28,3); ctx.fillStyle='#ff8066'; ctx.fillRect(-14,-23,28*clamp(e.hp/100,0,1),3); } ctx.restore(); }
    drawBullet(b) { const a = Math.atan2(b.vy,b.vx), p = this.toScreen(b.x,b.y), q = this.toScreen(b.px,b.py); ctx.strokeStyle=b.color; ctx.globalAlpha=.9; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.globalAlpha=1; }
    drawParticle(p) { const s=this.toScreen(p.x,p.y); ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(s.x-p.size/2,s.y-p.size/2,p.size,p.size);ctx.globalAlpha=1; }
    drawStorm() { const center=this.toScreen(WORLD/2,WORLD/2), r=this.safeRadius(); ctx.save(); ctx.fillStyle='#5965c52e'; ctx.beginPath();ctx.rect(0,0,this.viewW,this.viewH);ctx.arc(center.x,center.y,r,0,TAU,true);ctx.fill('evenodd'); ctx.strokeStyle='#92a5ffcc';ctx.lineWidth=3;ctx.setLineDash([12,8]);ctx.beginPath();ctx.arc(center.x,center.y,r,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.restore(); }
    drawKillCam() { if (!this.deathShot || this.replayT > 2.6) return; const a=this.toScreen(this.deathShot.from.x,this.deathShot.from.y), b=this.toScreen(this.deathShot.to.x,this.deathShot.to.y), t=clamp(this.replayT/1.15,0,1); ctx.save();ctx.strokeStyle=this.deathShot.color;ctx.shadowColor=this.deathShot.color;ctx.shadowBlur=12;ctx.lineWidth=3;ctx.globalAlpha=.95;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,5,0,TAU);ctx.fill();ctx.restore(); }
    render() { ctx.setTransform(this.scale,0,0,this.scale,0,0); this.drawWorld(); if (this.state === 'death') this.drawKillCam(); if (this.flash > 0) { ctx.fillStyle=`rgba(255,100,70,${this.flash*1.5})`;ctx.fillRect(0,0,this.viewW,this.viewH); } }
  }

  new Fallline();
})();
