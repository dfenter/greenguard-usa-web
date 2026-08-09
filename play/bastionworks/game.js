(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const startButton = document.getElementById('startButton');
  const audioOverlay = document.getElementById('audioOverlay');
  const rotateOverlay = document.getElementById('rotateOverlay');
  const DESIGN_W = 390;
  const DESIGN_H = 700;
  const SAVE_KEY = 'bastionworks-save-v1';
  const MAX_PARTICLES = 180;
  const MAX_FLOATERS = 36;
  const MAX_UNITS = 72;
  const MAX_BUILDINGS = 42;
  const MAX_DEFENSE_LOG = 20;
  const MAX_TIMEOUTS = 12;
  const COLORS = {
    ink: '#08111d', panel: '#101c2c', panel2: '#16263a', line: '#31465d', text: '#e9f2ff',
    muted: '#8194ad', aqua: '#7fe7c6', gold: '#ffca68', mana: '#86b9ff', danger: '#ff7586',
    orange: '#ff9b62', violet: '#bd9bff', enemy: '#f27782', wall: '#8390a3'
  };
  const GRID = { x: 43, y: 151, cell: 38, cols: 8, rows: 8 };
  const BOARD = { x: 20, y: 111, w: 350, h: 414 };
  const RAID_BOARD = { x: 14, y: 91, w: 362, h: 460 };
  const BUILDING_META = {
    gold: { label: 'AURIC MINE', short: 'MINE', color: COLORS.gold, icon: 'G', gold: 70, mana: 0, max: 3 },
    elixir: { label: 'MIST VAT', short: 'VAT', color: COLORS.violet, icon: 'E', gold: 0, mana: 70, max: 3 },
    cannon: { label: 'CANNON', short: 'CANNON', color: COLORS.orange, icon: 'C', gold: 105, mana: 0, max: 3 },
    archer: { label: 'LOOKOUT', short: 'LOOKOUT', color: COLORS.aqua, icon: 'A', gold: 0, mana: 105, max: 3 },
    wall: { label: 'WALL SEGMENT', short: 'WALL', color: COLORS.wall, icon: 'W', gold: 18, mana: 0, max: 40 }
  };
  const TROOPS = [
    { key: 'bruiser', label: 'BRUISER', color: '#ff946b', hp: 72, damage: 15, speed: 27, range: 23, count: 6, role: 'melee' },
    { key: 'archer', label: 'ARCHER', color: '#7fe7c6', hp: 38, damage: 9, speed: 22, range: 105, count: 8, role: 'ranged' },
    { key: 'breaker', label: 'WALL-BREAKER', color: '#ffca68', hp: 45, damage: 38, speed: 38, range: 24, count: 2, role: 'breaker' },
    { key: 'healer', label: 'HEALER', color: '#f4f7fb', hp: 48, damage: 0, speed: 19, range: 75, count: 2, role: 'healer' },
    { key: 'giant', label: 'GIANT', color: '#bd9bff', hp: 165, damage: 21, speed: 14, range: 26, count: 3, role: 'giant' }
  ];

  // Static, authored rivals. Their layouts are deliberately small enough for a phone screen.
  const VILLAGES = [
    { name: 'Rookfen', tier: 'Copper', loot: [130, 90], plan: [['core', 195, 320], ['storage', 195, 252], ['gold', 130, 212], ['elixir', 260, 212], ['cannon', 118, 354], ['archer', 272, 354], ['wall', 195, 208], ['wall', 156, 320], ['wall', 234, 320]] },
    { name: 'Brine Hollow', tier: 'Copper', loot: [155, 108], plan: [['core', 195, 320], ['storage', 195, 242], ['gold', 123, 195], ['elixir', 268, 195], ['gold', 123, 424], ['cannon', 105, 300], ['cannon', 285, 300], ['archer', 195, 153], ['archer', 195, 470], ['wall', 157, 320], ['wall', 233, 320]] },
    { name: 'Cinderhook', tier: 'Iron', loot: [180, 124], plan: [['core', 195, 326], ['storage', 195, 246], ['gold', 125, 218], ['elixir', 265, 218], ['cannon', 107, 184], ['cannon', 282, 184], ['archer', 106, 442], ['archer', 284, 442], ['wall', 157, 326], ['wall', 233, 326], ['wall', 195, 284]] },
    { name: 'Mosswake', tier: 'Iron', loot: [205, 140], plan: [['core', 195, 323], ['storage', 195, 244], ['gold', 127, 197], ['elixir', 263, 197], ['gold', 127, 448], ['elixir', 263, 448], ['cannon', 101, 318], ['cannon', 289, 318], ['archer', 195, 151], ['wall', 157, 323], ['wall', 233, 323], ['wall', 195, 281]] },
    { name: 'Amber Crag', tier: 'Steel', loot: [235, 156], plan: [['core', 195, 320], ['storage', 195, 237], ['gold', 126, 193], ['elixir', 264, 193], ['gold', 126, 447], ['elixir', 264, 447], ['cannon', 93, 258], ['cannon', 297, 258], ['archer', 93, 397], ['archer', 297, 397], ['wall', 157, 320], ['wall', 233, 320], ['wall', 195, 278]] },
    { name: 'Wickerdeep', tier: 'Steel', loot: [260, 178], plan: [['core', 195, 323], ['storage', 195, 245], ['gold', 128, 197], ['elixir', 262, 197], ['gold', 128, 447], ['cannon', 88, 220], ['cannon', 302, 220], ['archer', 88, 430], ['archer', 302, 430], ['wall', 155, 323], ['wall', 235, 323], ['wall', 195, 282], ['wall', 195, 364]] },
    { name: 'Glass Mire', tier: 'Silver', loot: [290, 200], plan: [['core', 195, 322], ['storage', 195, 232], ['gold', 119, 190], ['elixir', 271, 190], ['gold', 119, 452], ['elixir', 271, 452], ['cannon', 87, 277], ['cannon', 303, 277], ['archer', 87, 407], ['archer', 303, 407], ['wall', 156, 322], ['wall', 234, 322], ['wall', 195, 277], ['wall', 195, 367]] },
    { name: 'Sable Narrows', tier: 'Silver', loot: [320, 224], plan: [['core', 195, 320], ['storage', 195, 231], ['gold', 119, 191], ['elixir', 271, 191], ['gold', 119, 451], ['elixir', 271, 451], ['cannon', 76, 230], ['cannon', 314, 230], ['archer', 76, 424], ['archer', 314, 424], ['wall', 156, 320], ['wall', 234, 320], ['wall', 195, 274], ['wall', 195, 366], ['wall', 156, 414], ['wall', 234, 226]] },
    { name: 'Fallow Crown', tier: 'Gold', loot: [355, 250], plan: [['core', 195, 320], ['storage', 195, 228], ['gold', 118, 187], ['elixir', 272, 187], ['gold', 118, 454], ['elixir', 272, 454], ['cannon', 78, 245], ['cannon', 312, 245], ['archer', 78, 418], ['archer', 312, 418], ['wall', 156, 320], ['wall', 234, 320], ['wall', 195, 274], ['wall', 195, 366], ['wall', 145, 226], ['wall', 245, 414]] },
    { name: 'Oxblood Step', tier: 'Gold', loot: [395, 276], plan: [['core', 195, 320], ['storage', 195, 228], ['gold', 112, 184], ['elixir', 278, 184], ['gold', 112, 457], ['elixir', 278, 457], ['cannon', 70, 235], ['cannon', 320, 235], ['cannon', 70, 428], ['archer', 320, 428], ['archer', 195, 145], ['wall', 156, 320], ['wall', 234, 320], ['wall', 195, 274], ['wall', 195, 366], ['wall', 145, 226], ['wall', 245, 414]] },
    { name: 'Night Orchard', tier: 'Platinum', loot: [440, 308], plan: [['core', 195, 320], ['storage', 195, 228], ['gold', 112, 184], ['elixir', 278, 184], ['gold', 112, 457], ['elixir', 278, 457], ['cannon', 68, 235], ['cannon', 322, 235], ['cannon', 68, 428], ['archer', 322, 428], ['archer', 195, 145], ['wall', 155, 320], ['wall', 235, 320], ['wall', 195, 272], ['wall', 195, 368], ['wall', 143, 226], ['wall', 247, 414]] },
    { name: 'The Last Lantern', tier: 'Crown', loot: [500, 350], plan: [['core', 195, 320], ['storage', 195, 225], ['gold', 110, 180], ['elixir', 280, 180], ['gold', 110, 460], ['elixir', 280, 460], ['cannon', 66, 230], ['cannon', 324, 230], ['cannon', 66, 430], ['archer', 324, 430], ['archer', 195, 138], ['archer', 195, 490], ['wall', 155, 320], ['wall', 235, 320], ['wall', 195, 268], ['wall', 195, 372], ['wall', 140, 222], ['wall', 250, 418]] }
  ];

  const state = {
    started: false, screen: 'base', orientationPaused: false, hiddenPaused: false,
    gold: 460, mana: 360, trophies: 0, progressStars: Array(12).fill(0), crown: false,
    baseBuildings: [], defenseLog: [], lastSeen: 0, selectedBuild: null, selectedVillage: 0,
    particles: [], floaters: [], popups: [], raid: null, shake: 0, flash: 0, time: 0,
    input: { keys: new Set(), pointers: new Map(), controls: new Map(), drag: null },
    pendingTimeouts: []
  };

  let view = { scale: 1, ox: 0, oy: 0, cssW: 390, cssH: 700, dpr: 1 };
  let audioContext = null;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function finiteNumber(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  }
  function finiteInt(value, fallback, min, max) {
    return Number.isFinite(value) && Number.isInteger(value) ? clamp(value, min, max) : fallback;
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function nowLabel(time) {
    if (!Number.isFinite(time)) return 'RECENT';
    const mins = Math.max(1, Math.floor((Date.now() - time) / 60000));
    return mins < 60 ? `${mins}m AGO` : `${Math.floor(mins / 60)}h AGO`;
  }

  function perimeter() {
    const result = [];
    for (let c = 0; c < 8; c++) { result.push({ type: 'wall', col: c, row: 0, level: 1 }); result.push({ type: 'wall', col: c, row: 7, level: 1 }); }
    for (let r = 1; r < 7; r++) { result.push({ type: 'wall', col: 0, row: r, level: 1 }); result.push({ type: 'wall', col: 7, row: r, level: 1 }); }
    return result;
  }
  function defaultBuildings() {
    return perimeter().concat([
      { type: 'core', col: 3, row: 3, level: 1 }, { type: 'storage', col: 4, row: 3, level: 1 },
      { type: 'gold', col: 2, row: 2, level: 1 }, { type: 'elixir', col: 5, row: 2, level: 1 },
      { type: 'cannon', col: 2, row: 5, level: 1 }, { type: 'archer', col: 5, row: 5, level: 1 }
    ]);
  }
  function defaultDefenseLog() {
    return [
      { at: Date.now() - 28 * 60000, bot: 'Nettlepost', result: 'REPELLED', loss: 0, note: 'walls held' },
      { at: Date.now() - 95 * 60000, bot: 'Lantern Jack', result: 'SCOUTED', loss: 18, note: 'small purse' }
    ];
  }

  function isKnownBaseType(type) { return type === 'core' || type === 'storage' || !!BUILDING_META[type]; }
  function validateSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const buildings = Array.isArray(value.baseBuildings) ? value.baseBuildings.slice(0, MAX_BUILDINGS).filter(item => item && typeof item === 'object' && isKnownBaseType(item.type)) : [];
    const safeBuildings = buildings.map(item => ({
      type: item.type, col: finiteInt(item.col, 0, 0, 7), row: finiteInt(item.row, 0, 0, 7), level: finiteInt(item.level, 1, 1, 5)
    }));
    const stars = Array.isArray(value.progressStars) ? value.progressStars.slice(0, 12).map(n => finiteInt(n, 0, 0, 3)) : Array(12).fill(0);
    while (stars.length < 12) stars.push(0);
    const logs = Array.isArray(value.defenseLog) ? value.defenseLog.slice(0, MAX_DEFENSE_LOG).filter(item => item && typeof item === 'object').map(item => ({
      at: finiteNumber(item.at, Date.now(), 0, Date.now() + 86400000), bot: typeof item.bot === 'string' ? item.bot.slice(0, 24) : 'Unknown scout',
      result: typeof item.result === 'string' ? item.result.slice(0, 16) : 'SCOUTED', loss: finiteInt(item.loss, 0, 0, 9999), note: typeof item.note === 'string' ? item.note.slice(0, 28) : 'quiet night'
    })) : [];
    return {
      gold: finiteInt(value.gold, 460, 0, 999999), mana: finiteInt(value.mana, 360, 0, 999999), trophies: finiteInt(value.trophies, 0, 0, 9999),
      progressStars: stars, crown: stars.every(n => n > 0), baseBuildings: safeBuildings.length ? safeBuildings : defaultBuildings(),
      defenseLog: logs.length ? logs : defaultDefenseLog(), lastSeen: finiteNumber(value.lastSeen, Date.now(), 0, Date.now() + 86400000)
    };
  }
  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return validateSave(JSON.parse(raw));
    } catch (error) { return null; }
  }
  function saveGame() {
    try {
      const payload = {
        gold: finiteInt(state.gold, 0, 0, 999999), mana: finiteInt(state.mana, 0, 0, 999999), trophies: finiteInt(state.trophies, 0, 0, 9999),
        progressStars: state.progressStars.slice(0, 12).map(n => finiteInt(n, 0, 0, 3)), crown: !!state.crown,
        baseBuildings: state.baseBuildings.slice(0, MAX_BUILDINGS), defenseLog: state.defenseLog.slice(0, MAX_DEFENSE_LOG), lastSeen: Date.now()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (error) { /* private mode and full storage are valid play conditions */ }
  }
  function simulateBetweenSessions() {
    const previous = state.lastSeen;
    const gap = Date.now() - previous;
    if (previous > 0 && gap > 90000) {
      const index = Math.floor(previous / 3600000) % 12;
      const bot = VILLAGES[index].name;
      const loss = Math.min(state.gold, 16 + (index * 7) % 34);
      state.gold = Math.max(0, state.gold - loss);
      state.defenseLog.unshift({ at: Date.now(), bot, result: loss ? 'SCRAPED' : 'REPELLED', loss, note: loss ? 'fair simulated raid' : 'walls held' });
      state.defenseLog = state.defenseLog.slice(0, MAX_DEFENSE_LOG);
    }
    state.lastSeen = Date.now();
  }

  function resetInput() {
    state.input.keys.clear();
    state.input.pointers.forEach((info, id) => { try { canvas.releasePointerCapture(id); } catch (error) {} if (info) state.input.controls.delete(info.control); });
    state.input.pointers.clear();
    state.input.controls.clear();
    state.input.drag = null;
  }
  function cancelPending() {
    state.pendingTimeouts.forEach(id => clearTimeout(id));
    state.pendingTimeouts.length = 0;
  }
  function fullReset() {
    cancelPending();
    resetInput();
    state.gold = 460; state.mana = 360; state.trophies = 0; state.progressStars = Array(12).fill(0); state.crown = false;
    state.baseBuildings = defaultBuildings(); state.defenseLog = defaultDefenseLog(); state.selectedBuild = null; state.raid = null;
    state.screen = 'base'; state.particles.length = 0; state.floaters.length = 0; state.popups.length = 0; saveGame();
  }

  const stored = readSave();
  if (stored) Object.assign(state, stored);
  else { state.baseBuildings = defaultBuildings(); state.defenseLog = defaultDefenseLog(); }
  simulateBetweenSessions();
  state.crown = state.progressStars.every(n => n > 0);

  function unlockAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      tone(220, 0.07, 'sine', 0.025);
    } catch (error) { audioContext = null; }
  }
  function tone(frequency, duration, wave, volume) {
    if (!audioContext) return;
    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = wave || 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume || 0.03, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {}
  }
  function sound(kind) {
    if (kind === 'build') { tone(310, .06, 'triangle', .035); tone(480, .1, 'sine', .025); }
    else if (kind === 'hit') tone(90, .045, 'square', .018);
    else if (kind === 'win') { tone(420, .1, 'triangle', .04); tone(630, .18, 'triangle', .035); }
    else if (kind === 'select') tone(260, .04, 'sine', .02);
  }

  function resize() {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, 960 / Math.max(cssW, cssH), window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(cssW * dpr)); canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const scale = Math.min(cssW / DESIGN_W, cssH / DESIGN_H);
    view = { scale, ox: (cssW - DESIGN_W * scale) / 2, oy: (cssH - DESIGN_H * scale) / 2, cssW, cssH, dpr };
    updateOrientation();
  }
  function updateOrientation() {
    const blocked = window.innerWidth > window.innerHeight;
    state.orientationPaused = blocked;
    rotateOverlay.setAttribute('aria-hidden', String(!blocked));
    if (blocked) resetInput();
  }
  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - view.ox) / view.scale, y: (event.clientY - rect.top - view.oy) / view.scale };
  }
  function inRect(point, x, y, w, h) { return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h; }

  function emit(x, y, color, amount, size) {
    for (let i = 0; i < amount; i++) {
      state.particles.push({ x, y, vx: (Math.random() - .5) * 90, vy: (Math.random() - .75) * 100, life: .35 + Math.random() * .5, max: .85, color, size: size || 2 + Math.random() * 3 });
    }
    if (state.particles.length > MAX_PARTICLES) state.particles.splice(0, state.particles.length - MAX_PARTICLES);
  }
  function floatText(text, x, y, color) {
    state.floaters.push({ text: String(text).slice(0, 32), x, y, color: color || COLORS.text, life: 1, max: 1 });
    if (state.floaters.length > MAX_FLOATERS) state.floaters.splice(0, state.floaters.length - MAX_FLOATERS);
  }
  function popup(text, color) {
    state.popups.push({ text: String(text).slice(0, 36), color: color || COLORS.aqua, life: 1.6, max: 1.6 });
    if (state.popups.length > 5) state.popups.shift();
  }
  function spend(gold, mana) {
    if (state.gold < gold || state.mana < mana) { popup('NEED MORE LOOT', COLORS.danger); sound('hit'); return false; }
    state.gold -= gold; state.mana -= mana; return true;
  }

  function roundRect(x, y, w, h, r, fill, stroke, width) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }
  function text(value, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text; ctx.font = `${weight || 600} ${size || 12}px Arial, sans-serif`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(value), x, y);
  }
  function label(value, x, y, size, color, align) { text(value, x, y, size || 10, color || COLORS.muted, 700, align || 'left'); }
  function line(x1, y1, x2, y2, color, width) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.stroke(); }
  function panel(x, y, w, h, fill, stroke) { roundRect(x, y, w, h, 12, fill || COLORS.panel, stroke || COLORS.line, 1); }
  function chip(x, y, w, value, color, icon) {
    roundRect(x, y, w, 26, 8, '#142438', '#2b4159', 1);
    ctx.beginPath(); ctx.arc(x + 13, y + 13, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    text(`${icon || ''}${value}`, x + 24, y + 18, 12, COLORS.text, 800);
  }
  function navButton(x, value, active) {
    roundRect(x, 15, 52, 42, 10, active ? '#25435a' : '#111e2e', active ? COLORS.aqua : COLORS.line, 1);
    label(value, x + 26, 40, 9, active ? COLORS.aqua : COLORS.muted, 'center');
  }
  function drawBackground(kind) {
    const gradient = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
    if (kind === 'raid') { gradient.addColorStop(0, '#0a1321'); gradient.addColorStop(.7, '#111b29'); gradient.addColorStop(1, '#0c1523'); }
    else { gradient.addColorStop(0, '#0c1727'); gradient.addColorStop(1, '#080f1b'); }
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.globalAlpha = .15;
    for (let y = 0; y < DESIGN_H; y += 32) line(0, y, DESIGN_W, y, '#46617d', 1);
    for (let x = 0; x < DESIGN_W; x += 32) line(x, 0, x, DESIGN_H, '#46617d', 1);
    ctx.globalAlpha = 1;
  }
  function drawHeader(active) {
    text('BASTION', 16, 26, 18, COLORS.text, 900); text('WORKS', 16, 45, 18, COLORS.gold, 900);
    chip(91, 15, 88, state.gold, COLORS.gold, '✦ '); chip(184, 15, 88, state.mana, COLORS.mana, '◆ ');
    navButton(278, 'BASE', active === 'base'); navButton(334, active === 'log' ? 'MAP' : 'LOG', active === 'log');
  }
  function drawBottomNav(active) {
    navButton(278, 'BASE', active === 'base'); navButton(334, active === 'log' ? 'MAP' : 'LOG', active === 'log');
  }
  function drawBase() {
    drawBackground('base'); drawHeader('base');
    label('YOUR OUTPOST', 18, 81, 10, COLORS.aqua); text('FORTIFY THE LINE', 18, 102, 17, COLORS.text, 800);
    panel(18, 112, 354, 416, '#0e1a29', '#30485e');
    label('INSTANT BUILD // NO TIMERS', 34, 136, 9, COLORS.gold);
    // Board grid and tile glow.
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const x = GRID.x + c * GRID.cell, y = GRID.y + r * GRID.cell;
      ctx.fillStyle = (r + c) % 2 ? '#17293a' : '#142536'; ctx.fillRect(x, y, GRID.cell - 1, GRID.cell - 1);
      ctx.strokeStyle = '#294159'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, GRID.cell - 2, GRID.cell - 2);
    }
    if (state.selectedBuild) {
      label(`PLACING ${BUILDING_META[state.selectedBuild].short}`, 34, 477, 9, BUILDING_META[state.selectedBuild].color);
    } else label('SELECT A KIT BELOW', 34, 477, 9, COLORS.muted);
    line(34, 488, 356, 488, COLORS.line, 1);
    drawBaseBuildings();
    text('Tap empty tile to build  •  Tap a structure to upgrade  •  Drag to reposition', 18, 551, 10, COLORS.muted, 600);
    drawBuildPalette(); drawBottomNav('base');
    drawPopups();
  }
  function tileRect(col, row) { return { x: GRID.x + col * GRID.cell + 3, y: GRID.y + row * GRID.cell + 3, w: GRID.cell - 7, h: GRID.cell - 7 }; }
  function drawBaseBuildings() {
    state.baseBuildings.slice(0, MAX_BUILDINGS).forEach((building, index) => {
      const box = tileRect(building.col, building.row); const meta = BUILDING_META[building.type];
      const selected = state.input.drag && state.input.drag.index === index;
      if (selected) { ctx.globalAlpha = .42; roundRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10, 10, meta ? meta.color : COLORS.aqua); ctx.globalAlpha = 1; }
      if (building.type === 'wall') {
        roundRect(box.x + 3, box.y + 8, box.w - 6, box.h - 16, 4, '#66758a', '#b4c0cf', 1);
        line(box.x + 9, box.y + 10, box.x + 9, box.y + box.h - 10, '#47566c', 1); line(box.x + box.w - 9, box.y + 10, box.x + box.w - 9, box.y + box.h - 10, '#47566c', 1);
      } else {
        const color = meta ? meta.color : building.type === 'core' ? COLORS.gold : COLORS.mana;
        roundRect(box.x, box.y, box.w, box.h, 7, '#1c3246', color, 2);
        ctx.beginPath(); ctx.arc(box.x + box.w / 2, box.y + box.h / 2 - 1, 9, 0, Math.PI * 2); ctx.fillStyle = color; ctx.globalAlpha = .22; ctx.fill(); ctx.globalAlpha = 1;
        text(meta ? meta.icon : building.type === 'core' ? 'K' : 'S', box.x + box.w / 2, box.y + 20, 16, color, 900, 'center');
      }
      if (building.type !== 'wall') label(`L${building.level}`, box.x + box.w / 2, box.y + box.h - 4, 8, COLORS.text, 'center');
    });
    if (state.input.drag && state.input.drag.dragging && state.input.drag.preview) {
      const p = tileRect(state.input.drag.preview.col, state.input.drag.preview.row);
      ctx.globalAlpha = .48; roundRect(p.x, p.y, p.w, p.h, 8, COLORS.aqua, COLORS.aqua, 2); ctx.globalAlpha = 1;
    }
  }
  function drawBuildPalette() {
    const types = ['gold', 'elixir', 'cannon', 'archer', 'wall'];
    types.forEach((type, index) => {
      const meta = BUILDING_META[type], x = 5 + index * 77, y = 570, selected = state.selectedBuild === type;
      roundRect(x, y, 72, 116, 10, selected ? '#203d49' : '#111e2e', selected ? meta.color : COLORS.line, selected ? 2 : 1);
      ctx.beginPath(); ctx.arc(x + 36, y + 27, 15, 0, Math.PI * 2); ctx.fillStyle = meta.color; ctx.globalAlpha = .2; ctx.fill(); ctx.globalAlpha = 1;
      text(meta.icon, x + 36, y + 33, 17, meta.color, 900, 'center'); label(meta.short, x + 36, y + 55, 8, COLORS.text, 'center');
      text(`${meta.gold ? `✦${meta.gold}` : ''}${meta.mana ? `◆${meta.mana}` : ''}`, x + 36, y + 75, 9, meta.gold ? COLORS.gold : COLORS.mana, 800, 'center');
      label(index + 1, x + 36, y + 101, 9, selected ? meta.color : COLORS.muted, 'center');
    });
  }
  function baseCellAt(point) {
    const col = Math.floor((point.x - GRID.x) / GRID.cell), row = Math.floor((point.y - GRID.y) / GRID.cell);
    return col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows ? { col, row } : null;
  }
  function buildingAt(cell) {
    if (!cell) return -1;
    for (let i = state.baseBuildings.length - 1; i >= 0; i--) if (state.baseBuildings[i].col === cell.col && state.baseBuildings[i].row === cell.row) return i;
    return -1;
  }
  function upgradeBase(index) {
    const building = state.baseBuildings[index], meta = BUILDING_META[building.type];
    if (!building || !meta || building.level >= 5) { popup('MAXIMUM RANK', COLORS.muted); return; }
    const gold = meta.gold ? meta.gold * (building.level + 1) : 0, mana = meta.mana ? meta.mana * (building.level + 1) : 0;
    if (!spend(gold, mana)) return;
    building.level += 1; state.flash = .14; state.shake = .12; emit(GRID.x + building.col * GRID.cell + 19, GRID.y + building.row * GRID.cell + 19, meta.color, 14, 3); floatText('UPGRADED', GRID.x + building.col * GRID.cell + 19, GRID.y + building.row * GRID.cell + 9, meta.color); popup(`${meta.short} RANK ${building.level}`, meta.color); sound('build'); saveGame();
  }
  function placeBase(type, cell) {
    const meta = BUILDING_META[type];
    if (!meta || !cell || buildingAt(cell) >= 0) { popup('TILE OCCUPIED', COLORS.danger); return; }
    const count = state.baseBuildings.filter(item => item.type === type).length;
    if (count >= meta.max) { popup('KIT LIMIT REACHED', COLORS.danger); return; }
    if (!spend(meta.gold, meta.mana)) return;
    state.baseBuildings.push({ type, col: cell.col, row: cell.row, level: 1 });
    if (state.baseBuildings.length > MAX_BUILDINGS) state.baseBuildings.splice(0, state.baseBuildings.length - MAX_BUILDINGS);
    state.selectedBuild = null; state.flash = .12; state.shake = .1; emit(GRID.x + cell.col * GRID.cell + 19, GRID.y + cell.row * GRID.cell + 19, meta.color, 12, 3); popup(`${meta.short} BUILT`, meta.color); sound('build'); saveGame();
  }
  function basePointerDown(point, control) {
    if (control === 'basePalette') {
      const index = clamp(Math.floor((point.x - 5) / 77), 0, 4), type = ['gold', 'elixir', 'cannon', 'archer', 'wall'][index];
      state.selectedBuild = state.selectedBuild === type ? null : type; sound('select'); return;
    }
    const cell = baseCellAt(point); if (!cell) return;
    const index = buildingAt(cell);
    if (index >= 0) state.input.drag = { index, startX: point.x, startY: point.y, dragging: false, preview: cell };
    else if (state.selectedBuild) placeBase(state.selectedBuild, cell);
  }
  function basePointerMove(point) {
    const drag = state.input.drag; if (!drag) return;
    if (!drag.dragging && dist(point.x, point.y, drag.startX, drag.startY) > 9) drag.dragging = true;
    if (drag.dragging) drag.preview = baseCellAt(point);
  }
  function basePointerUp(point) {
    const drag = state.input.drag; state.input.drag = null;
    if (!drag) return;
    if (!drag.dragging) { upgradeBase(drag.index); return; }
    const cell = baseCellAt(point), occupied = buildingAt(cell);
    if (!cell || (occupied >= 0 && occupied !== drag.index)) { popup('MOVE BLOCKED', COLORS.danger); return; }
    state.baseBuildings[drag.index].col = cell.col; state.baseBuildings[drag.index].row = cell.row; emit(GRID.x + cell.col * GRID.cell + 19, GRID.y + cell.row * GRID.cell + 19, COLORS.aqua, 8, 2); popup('POSITION SET', COLORS.aqua); sound('select'); saveGame();
  }

  function drawLadder() {
    drawBackground('base'); drawHeader('ladder');
    label('AUTHORED MATCHMAKING', 18, 81, 10, COLORS.aqua); text('THE TWELVE RIVALS', 18, 102, 17, COLORS.text, 800);
    text(state.crown ? 'LADDER CROWN EARNED' : `TROPHY TIER  ${tierForTrophies()}`, 372, 101, 10, state.crown ? COLORS.gold : COLORS.muted, 800, 'right');
    for (let i = 0; i < VILLAGES.length; i++) {
      const village = VILLAGES[i], y = 113 + i * 45, cleared = state.progressStars[i] > 0, unlocked = i === 0 || state.progressStars[i - 1] > 0;
      roundRect(18, y, 354, 40, 9, cleared ? '#162f36' : unlocked ? '#142438' : '#101a27', cleared ? '#427e75' : unlocked ? COLORS.line : '#202d3e', 1);
      roundRect(28, y + 6, 29, 28, 7, cleared ? '#255749' : '#1b2d41', cleared ? COLORS.aqua : COLORS.line, 1);
      text(String(i + 1).padStart(2, '0'), 42, y + 25, 11, cleared ? COLORS.aqua : COLORS.muted, 900, 'center');
      text(village.name, 68, y + 17, 12, unlocked ? COLORS.text : COLORS.muted, 800); label(village.tier, 68, y + 31, 8, cleared ? COLORS.aqua : COLORS.muted);
      text(`✦${village.loot[0]}  ◆${village.loot[1]}`, 232, y + 17, 9, unlocked ? COLORS.gold : COLORS.muted, 700, 'right');
      const stars = state.progressStars[i]; text(stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : unlocked ? 'OPEN' : 'LOCKED', 355, y + 29, 11, stars === 3 ? COLORS.gold : unlocked ? COLORS.aqua : COLORS.muted, 800, 'right');
    }
    text('Tap an open rival to raid. Arrow keys browse in battle; 1–5 choose a troop.', 18, 671, 10, COLORS.muted, 600);
    drawPopups();
  }
  function tierForTrophies() {
    if (state.trophies >= 1800) return 'CROWN'; if (state.trophies >= 1200) return 'PLATINUM'; if (state.trophies >= 700) return 'GOLD'; if (state.trophies >= 350) return 'SILVER'; if (state.trophies >= 150) return 'STEEL'; return 'COPPER';
  }
  function drawDefenseLog() {
    drawBackground('base'); drawHeader('log');
    label('BETWEEN-SESSION SIMULATION', 18, 81, 10, COLORS.aqua); text('DEFENSE LOG', 18, 102, 17, COLORS.text, 800);
    text('FAIR LOSSES // NO TIMER WALLS', 372, 101, 9, COLORS.muted, 800, 'right');
    state.defenseLog.slice(0, 6).forEach((record, index) => {
      const y = 117 + index * 73, good = record.loss === 0;
      panel(18, y, 354, 62, '#111e2e', '#2b4159');
      roundRect(28, y + 12, 37, 37, 9, good ? '#1d473f' : '#472b38', good ? '#4fbea2' : COLORS.danger, 1);
      text(good ? '✓' : '!', 46, y + 37, 18, good ? COLORS.aqua : COLORS.danger, 900, 'center');
      text(`${record.bot.toUpperCase()}  //  ${record.result}`, 78, y + 25, 11, COLORS.text, 800); label(nowLabel(record.at), 78, y + 43, 9, COLORS.muted);
      text(record.loss ? `-${record.loss} ✦` : 'NO LOSS', 354, y + 25, 11, record.loss ? COLORS.gold : COLORS.aqua, 800, 'right'); label(record.note.toUpperCase(), 354, y + 43, 9, COLORS.muted, 'right');
    });
    panel(18, 570, 354, 57, '#0f1a29', '#2b4159'); text('Your base keeps working while you are away.', 34, 594, 11, COLORS.text, 700); label('NEXT REPORT IS GENERATED ON A LATER SESSION', 34, 612, 9, COLORS.muted);
    text('BASE returns to your outpost. MAP returns to the authored ladder.', 18, 671, 10, COLORS.muted, 600);
    drawPopups();
  }

  function raidHp(type, level) {
    const base = { core: 245, storage: 145, gold: 90, elixir: 90, cannon: 125, archer: 105, wall: 105 }[type] || 80;
    return base * (1 + ((level || 1) - 1) * .18);
  }
  function raidDamage(type, level) {
    return ({ cannon: 17, archer: 11 }[type] || 0) * (1 + ((level || 1) - 1) * .18);
  }
  function startRaid(index) {
    const village = VILLAGES[index]; if (!village) return;
    cancelPending(); resetInput(); state.selectedVillage = index;
    state.raid = {
      index, village, elapsed: 0, over: false, aborted: false, stars: 0, percent: 0, lootGold: 0, lootMana: 0,
      hand: TROOPS.map(item => item.count), selected: 0, units: [], buildings: village.plan.map((entry, order) => ({ type: entry[0], x: entry[1], y: entry[2], level: entry[3] || 1, order, hp: raidHp(entry[0], entry[3] || 1), alive: true, cooldown: .2 + order * .03 })),
      cursor: { x: 195, y: RAID_BOARD.y + 7 }, result: ''
    };
    state.screen = 'raid'; sound('select'); popup(`${village.name.toUpperCase()} // DEPLOY`, COLORS.aqua);
  }
  function drawRaid() {
    const raid = state.raid; if (!raid) { state.screen = 'ladder'; drawLadder(); return; }
    drawBackground('raid');
    roundRect(8, 11, 56, 48, 11, '#122238', COLORS.line, 1); text('←', 36, 43, 24, COLORS.aqua, 900, 'center');
    label('RAIDING', 77, 25, 9, COLORS.aqua); text(raid.village.name, 77, 45, 17, COLORS.text, 800); label(`TIER ${raid.village.tier.toUpperCase()}`, 77, 57, 8, COLORS.muted);
    text(`00:${String(Math.max(0, Math.ceil(90 - raid.elapsed))).padStart(2, '0')}`, 371, 28, 14, raid.elapsed > 75 ? COLORS.danger : COLORS.gold, 900, 'right');
    label(`${Math.floor(raid.percent)}% DESTROYED`, 371, 46, 9, COLORS.aqua, 'right');
    panel(RAID_BOARD.x, RAID_BOARD.y, RAID_BOARD.w, RAID_BOARD.h, '#0c1b25', '#3b5a62');
    // The deploy rim is always visible, so a tap has a generous physical target.
    ctx.setLineDash([5, 5]); roundRect(RAID_BOARD.x + 7, RAID_BOARD.y + 7, RAID_BOARD.w - 14, RAID_BOARD.h - 14, 10, null, '#5d8d89', 1); ctx.setLineDash([]);
    for (let i = 0; i < 8; i++) { const x = RAID_BOARD.x + 25 + i * 44; ctx.beginPath(); ctx.arc(x, RAID_BOARD.y + 8, 3, 0, Math.PI * 2); ctx.fillStyle = COLORS.aqua; ctx.globalAlpha = .55; ctx.fill(); ctx.globalAlpha = 1; }
    drawRaidBuildings(raid); drawRaidUnits(raid); drawDeployCursor(raid);
    text('Tap the rim to deploy  •  Arrows move the cursor  •  1–5 choose a troop  •  SPACE deploys', 18, 568, 9, COLORS.muted, 600);
    drawTroopHand(raid); drawPopups();
    if (raid.over) drawRaidResult(raid);
  }
  function drawRaidBuildings(raid) {
    raid.buildings.forEach(building => {
      if (!building.alive) return;
      const color = building.type === 'wall' ? COLORS.wall : building.type === 'cannon' ? COLORS.orange : building.type === 'archer' ? COLORS.aqua : building.type === 'core' ? COLORS.gold : COLORS.violet;
      if (building.type === 'wall') {
        roundRect(building.x - 14, building.y - 7, 28, 14, 4, '#68798d', '#b6c2d1', 1);
        line(building.x - 6, building.y - 6, building.x - 6, building.y + 6, '#425269', 1); line(building.x + 6, building.y - 6, building.x + 6, building.y + 6, '#425269', 1);
      } else {
        roundRect(building.x - 17, building.y - 17, 34, 34, 8, '#183044', color, building.type === 'core' ? 3 : 2);
        text(building.type === 'core' ? 'K' : BUILDING_META[building.type] ? BUILDING_META[building.type].icon : 'S', building.x, building.y + 6, 15, color, 900, 'center');
      }
      const ratio = clamp(building.hp / raidHp(building.type, building.level), 0, 1);
      ctx.fillStyle = '#07111b'; ctx.fillRect(building.x - 19, building.y + 22, 38, 3); ctx.fillStyle = color; ctx.fillRect(building.x - 19, building.y + 22, 38 * ratio, 3);
    });
  }
  function drawRaidUnits(raid) {
    raid.units.forEach(unit => {
      if (unit.dead) return;
      const troop = TROOPS[unit.slot], color = troop.color;
      ctx.beginPath(); ctx.arc(unit.x, unit.y, unit.slot === 4 ? 11 : 8, 0, Math.PI * 2); ctx.fillStyle = '#14293a'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      text(unit.slot === 0 ? 'B' : unit.slot === 1 ? 'A' : unit.slot === 2 ? 'W' : unit.slot === 3 ? '+' : 'G', unit.x, unit.y + 4, 9, color, 900, 'center');
      const ratio = clamp(unit.hp / unit.maxHp, 0, 1); ctx.fillStyle = '#07111b'; ctx.fillRect(unit.x - 10, unit.y - 16, 20, 2); ctx.fillStyle = COLORS.aqua; ctx.fillRect(unit.x - 10, unit.y - 16, 20 * ratio, 2);
    });
  }
  function drawDeployCursor(raid) {
    const p = raid.cursor; ctx.globalAlpha = .22; ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fillStyle = COLORS.aqua; ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.strokeStyle = COLORS.aqua; ctx.lineWidth = 2; ctx.stroke(); line(p.x - 16, p.y, p.x + 16, p.y, COLORS.aqua, 1); line(p.x, p.y - 16, p.x, p.y + 16, COLORS.aqua, 1);
  }
  function drawTroopHand(raid) {
    TROOPS.forEach((troop, index) => {
      const x = 5 + index * 77, y = 582, selected = raid.selected === index;
      roundRect(x, y, 72, 108, 10, selected ? '#203d49' : '#111e2e', selected ? troop.color : COLORS.line, selected ? 2 : 1);
      ctx.beginPath(); ctx.arc(x + 36, y + 25, 14, 0, Math.PI * 2); ctx.fillStyle = troop.color; ctx.globalAlpha = .2; ctx.fill(); ctx.globalAlpha = 1;
      text(index + 1, x + 12, y + 15, 9, selected ? troop.color : COLORS.muted, 900); text(troop.key === 'breaker' ? 'W' : troop.key[0].toUpperCase(), x + 36, y + 31, 17, troop.color, 900, 'center');
      label(troop.label === 'WALL-BREAKER' ? 'BREAKER' : troop.label, x + 36, y + 52, 7, COLORS.text, 'center');
      text(`x${raid.hand[index]}`, x + 36, y + 74, 13, raid.hand[index] ? troop.color : COLORS.danger, 900, 'center'); label(troop.role.toUpperCase(), x + 36, y + 94, 7, COLORS.muted, 'center');
    });
  }
  function drawRaidResult(raid) {
    ctx.globalAlpha = .9; roundRect(29, 184, 332, 220, 16, '#0b1422', '#5a7386', 2); ctx.globalAlpha = 1;
    label(raid.result === 'VICTORY' ? 'VILLAGE BREACHED' : 'RAID ENDED', 195, 218, 10, raid.result === 'VICTORY' ? COLORS.aqua : COLORS.danger, 'center');
    text(raid.result, 195, 250, 28, COLORS.text, 900, 'center');
    text(raid.stars ? '★'.repeat(raid.stars) + '☆'.repeat(3 - raid.stars) : '☆☆☆', 195, 284, 24, raid.stars === 3 ? COLORS.gold : COLORS.aqua, 900, 'center');
    text(`${Math.floor(raid.percent)}% destroyed`, 195, 311, 12, COLORS.muted, 700, 'center');
    text(`+${raid.lootGold} ✦    +${raid.lootMana} ◆`, 195, 337, 14, COLORS.gold, 900, 'center');
    roundRect(47, 357, 137, 38, 9, '#1d3e4d', COLORS.aqua, 1); label('REPLAY', 115, 381, 10, COLORS.aqua, 'center');
    roundRect(206, 357, 137, 38, 9, '#18273b', COLORS.line, 1); label('LADDER', 274, 381, 10, COLORS.text, 'center');
  }

  function nearestRaidTarget(unit, raid) {
    const alive = raid.buildings.filter(item => item.alive);
    if (!alive.length) return null;
    let candidates = alive;
    if (TROOPS[unit.slot].role === 'breaker') {
      const walls = alive.filter(item => item.type === 'wall'); candidates = walls.length ? walls : alive;
    } else if (TROOPS[unit.slot].role === 'giant') {
      const defenses = alive.filter(item => item.type === 'cannon' || item.type === 'archer'); candidates = defenses.length ? defenses : alive;
    } else if (TROOPS[unit.slot].role === 'healer') {
      const wounded = raid.units.filter(item => !item.dead && item.slot !== 3 && item.hp < item.maxHp * .9);
      if (wounded.length) { wounded.sort((a, b) => dist(unit.x, unit.y, a.x, a.y) - dist(unit.x, unit.y, b.x, b.y)); return wounded[0]; }
      const friends = raid.units.filter(item => !item.dead && item.slot !== 3); if (friends.length) { friends.sort((a, b) => dist(unit.x, unit.y, a.x, a.y) - dist(unit.x, unit.y, b.x, b.y)); return friends[0]; }
      return null;
    }
    candidates.sort((a, b) => dist(unit.x, unit.y, a.x, a.y) - dist(unit.x, unit.y, b.x, b.y)); return candidates[0];
  }
  function finishRaid(raid) {
    if (raid.over) return;
    const total = raid.buildings.length, destroyed = raid.buildings.filter(item => !item.alive).length;
    raid.percent = total ? destroyed / total * 100 : 0;
    const coreGone = raid.buildings.some(item => item.type === 'core' && !item.alive);
    raid.stars = coreGone ? 1 : 0; if (raid.percent >= 50) raid.stars = Math.max(raid.stars, 2); if (raid.percent >= 99.9) raid.stars = 3;
    const village = raid.village, previous = state.progressStars[raid.index] || 0, newStars = Math.max(previous, raid.stars);
    const starGain = Math.max(0, newStars - previous);
    raid.lootGold = Math.round(village.loot[0] * raid.percent / 100); raid.lootMana = Math.round(village.loot[1] * raid.percent / 100);
    state.gold += raid.lootGold; state.mana += raid.lootMana; state.progressStars[raid.index] = newStars; state.trophies += starGain * 70 + (starGain ? Math.floor(raid.percent / 20) : 0); state.crown = state.progressStars.every(n => n > 0);
    raid.result = raid.stars ? 'VICTORY' : 'HOLD FAILED'; raid.over = true; state.shake = .22; state.flash = .18; emit(195, 320, raid.stars ? COLORS.gold : COLORS.danger, 24, 4); popup(raid.stars ? `${raid.stars} STAR CLEAR` : 'NO STARS', raid.stars ? COLORS.gold : COLORS.danger); sound(raid.stars ? 'win' : 'hit'); saveGame();
  }
  function deployPoint(point) {
    const left = RAID_BOARD.x + 8, right = RAID_BOARD.x + RAID_BOARD.w - 8, top = RAID_BOARD.y + 8, bottom = RAID_BOARD.y + RAID_BOARD.h - 8;
    const p = { x: clamp(point.x, left, right), y: clamp(point.y, top, bottom) };
    const distances = [{ edge: 'top', d: Math.abs(p.y - top) }, { edge: 'right', d: Math.abs(p.x - right) }, { edge: 'bottom', d: Math.abs(p.y - bottom) }, { edge: 'left', d: Math.abs(p.x - left) }];
    distances.sort((a, b) => a.d - b.d); const edge = distances[0].edge;
    if (edge === 'top') p.y = top; else if (edge === 'right') p.x = right; else if (edge === 'bottom') p.y = bottom; else p.x = left;
    return p;
  }
  function deploySelected(raid, point) {
    const slot = raid.selected, troop = TROOPS[slot];
    if (raid.over || !troop || raid.hand[slot] <= 0) { popup('NO TROOPS LEFT', COLORS.danger); return; }
    if (raid.units.length >= MAX_UNITS) { popup('DEPLOY LIMIT', COLORS.danger); return; }
    const edge = deployPoint(point), unit = { slot, x: edge.x + (Math.random() - .5) * 5, y: edge.y + (Math.random() - .5) * 5, hp: troop.hp, maxHp: troop.hp, cooldown: .1, dead: false };
    raid.units.push(unit); raid.hand[slot] -= 1; raid.cursor = edge; emit(edge.x, edge.y, troop.color, 8, 3); sound('select');
    if (raid.hand[slot] <= 0) { const next = raid.hand.findIndex(n => n > 0); if (next >= 0) raid.selected = next; }
  }
  function updateRaid(raid, dt) {
    if (!raid || raid.over) return;
    raid.elapsed += dt;
    raid.buildings.forEach(building => {
      if (!building.alive || (building.type !== 'cannon' && building.type !== 'archer')) return;
      building.cooldown -= dt; if (building.cooldown > 0) return;
      const target = raid.units.filter(unit => !unit.dead && dist(building.x, building.y, unit.x, unit.y) < 145).sort((a, b) => dist(building.x, building.y, a.x, a.y) - dist(building.x, building.y, b.x, b.y))[0];
      if (!target) { building.cooldown = .25; return; }
      target.hp -= raidDamage(building.type, building.level); building.cooldown = building.type === 'cannon' ? 1.35 : .82; emit(target.x, target.y, building.type === 'cannon' ? COLORS.orange : COLORS.aqua, 3, 2); state.shake = .04; sound('hit');
      if (target.hp <= 0) { target.dead = true; emit(target.x, target.y, COLORS.danger, 10, 3); }
    });
    raid.units.forEach(unit => {
      if (unit.dead) return;
      const troop = TROOPS[unit.slot], target = nearestRaidTarget(unit, raid);
      if (!target) return;
      const targetX = target.x, targetY = target.y, d = dist(unit.x, unit.y, targetX, targetY), range = troop.range;
      if (troop.role === 'healer') {
        if (d <= range) { const healTarget = target; healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + 18 * dt); emit(unit.x, unit.y, troop.color, 1, 1); }
        else { unit.x += (targetX - unit.x) / Math.max(d, 1) * troop.speed * dt; unit.y += (targetY - unit.y) / Math.max(d, 1) * troop.speed * dt; }
        return;
      }
      if (d > range) { unit.x += (targetX - unit.x) / Math.max(d, 1) * troop.speed * dt; unit.y += (targetY - unit.y) / Math.max(d, 1) * troop.speed * dt; }
      else { unit.cooldown -= dt; if (unit.cooldown <= 0) { const bonus = troop.role === 'breaker' && target.type === 'wall' ? 1.9 : 1; target.hp -= troop.damage * bonus; unit.cooldown = unit.slot === 1 ? .72 : .95; emit(target.x, target.y, troop.color, 3, 2); state.shake = .025; if (target.hp <= 0) { target.alive = false; target.hp = 0; const color = target.type === 'wall' ? COLORS.wall : COLORS.gold; emit(target.x, target.y, color, 16, 3); floatText('BREACHED', target.x, target.y - 16, color); sound('hit'); } } }
    });
    raid.units = raid.units.filter(unit => !unit.dead || Math.random() > dt * 2.5);
    const destroyed = raid.buildings.filter(item => !item.alive).length; raid.percent = destroyed / raid.buildings.length * 100;
    const active = raid.units.some(unit => !unit.dead), handEmpty = raid.hand.every(count => count <= 0);
    if (raid.percent >= 99.9 || (handEmpty && !active) || raid.elapsed >= 90) finishRaid(raid);
  }

  function drawPopups() {
    state.popups.forEach((item, index) => { const alpha = clamp(item.life / .35, 0, 1) * clamp(item.life, 0, 1); ctx.globalAlpha = alpha; roundRect(92, 113 + index * 28, 206, 23, 8, '#132438', item.color, 1); label(item.text, 195, 129 + index * 28, 9, item.color, 'center'); });
    ctx.globalAlpha = 1;
  }
  function updateEffects(dt) {
    state.time += dt; state.shake = Math.max(0, state.shake - dt); state.flash = Math.max(0, state.flash - dt);
    state.particles.forEach(item => { item.life -= dt; item.x += item.vx * dt; item.y += item.vy * dt; item.vy += 110 * dt; });
    state.particles = state.particles.filter(item => item.life > 0).slice(-MAX_PARTICLES);
    state.floaters.forEach(item => { item.life -= dt; item.y -= 18 * dt; }); state.floaters = state.floaters.filter(item => item.life > 0).slice(-MAX_FLOATERS);
    state.popups.forEach(item => item.life -= dt); state.popups = state.popups.filter(item => item.life > 0).slice(-5);
  }
  function drawEffects() {
    state.particles.forEach(item => { ctx.globalAlpha = clamp(item.life / item.max, 0, 1); ctx.fillStyle = item.color; ctx.fillRect(item.x, item.y, item.size, item.size); });
    state.floaters.forEach(item => { ctx.globalAlpha = clamp(item.life / item.max, 0, 1); text(item.text, item.x, item.y, 10, item.color, 900, 'center'); });
    ctx.globalAlpha = 1;
    if (state.flash > 0) { ctx.globalAlpha = state.flash * 1.6; ctx.fillStyle = '#d9fff4'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H); ctx.globalAlpha = 1; }
  }

  function controlAt(point) {
    if (state.screen === 'raid') {
      if (state.raid && state.raid.over) {
        if (inRect(point, 47, 357, 137, 38)) return 'raidReplay'; if (inRect(point, 206, 357, 137, 38)) return 'raidLadder';
      }
      if (inRect(point, 8, 11, 56, 48)) return 'raidBack';
      for (let i = 0; i < 5; i++) if (inRect(point, 5 + i * 77, 582, 72, 108)) return `raidSlot${i}`;
      if (inRect(point, RAID_BOARD.x, RAID_BOARD.y, RAID_BOARD.w, RAID_BOARD.h)) return 'raidBoard';
      return null;
    }
    if (inRect(point, 278, 15, 52, 42)) return 'navBase';
    if (inRect(point, 334, 15, 52, 42)) return state.screen === 'log' ? 'navLadder' : 'navLog';
    if (state.screen === 'base') {
      if (point.y >= 570 && point.y <= 695) return 'basePalette' + clamp(Math.floor((point.x - 5) / 77), 0, 4);
      if (inRect(point, 18, 112, 354, 416)) return 'baseBoard';
    } else if (state.screen === 'ladder') {
      for (let i = 0; i < 12; i++) if (inRect(point, 18, 113 + i * 45, 354, 40)) return `ladderRow${i}`;
    }
    return null;
  }
  function goToScreen(screen) {
    cancelPending(); resetInput(); state.screen = screen; if (screen !== 'raid') state.raid = screen === 'base' || screen === 'ladder' || screen === 'log' ? state.raid : null; sound('select');
  }
  function handleControlDown(control, point) {
    if (control === 'baseBoard') basePointerDown(point, control);
    else if (control.startsWith('basePalette')) { const index = Number(control.slice(-1)); const types = ['gold', 'elixir', 'cannon', 'archer', 'wall']; state.selectedBuild = state.selectedBuild === types[index] ? null : types[index]; sound('select'); }
    else if (control === 'raidBoard' && state.raid && !state.raid.over) state.raid.cursor = deployPoint(point);
    else if (control.startsWith('raidSlot') && state.raid && !state.raid.over) { state.raid.selected = Number(control.slice(-1)); sound('select'); }
  }
  function handleControlMove(control, point) {
    if (control === 'baseBoard') basePointerMove(point);
    else if (control === 'raidBoard' && state.raid && !state.raid.over) state.raid.cursor = deployPoint(point);
  }
  function handleControlUp(control, point, cancelled) {
    if (cancelled) { if (control === 'baseBoard') state.input.drag = null; return; }
    if (control === 'baseBoard') basePointerUp(point);
    else if (control === 'raidBoard' && state.raid && !state.raid.over) deploySelected(state.raid, state.raid.cursor);
    else if (control === 'raidBack') goToScreen('ladder');
    else if (control === 'raidReplay' && state.raid) startRaid(state.raid.index);
    else if (control === 'raidLadder') goToScreen('ladder');
    else if (control === 'navBase') goToScreen('base');
    else if (control === 'navLog') goToScreen('log');
    else if (control === 'navLadder') goToScreen('ladder');
    else if (control.startsWith('ladderRow')) {
      const index = Number(control.slice(10)), unlocked = index === 0 || state.progressStars[index - 1] > 0;
      if (unlocked) startRaid(index); else popup('CLEAR THE PRIOR RIVAL', COLORS.danger);
    }
  }
  function pointerDown(event) {
    event.preventDefault(); if (!state.started || state.orientationPaused || state.hiddenPaused) return;
    const point = pointFromEvent(event), control = controlAt(point); if (!control || state.input.controls.has(control)) return;
    state.input.controls.set(control, event.pointerId); state.input.pointers.set(event.pointerId, { control, point });
    try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
    handleControlDown(control, point);
  }
  function pointerMove(event) {
    event.preventDefault(); const info = state.input.pointers.get(event.pointerId); if (!info || state.orientationPaused) return;
    const point = pointFromEvent(event); info.point = point; handleControlMove(info.control, point);
  }
  function pointerUp(event, cancelled) {
    event.preventDefault(); const info = state.input.pointers.get(event.pointerId); if (!info) return;
    const point = pointFromEvent(event); state.input.pointers.delete(event.pointerId); if (state.input.controls.get(info.control) === event.pointerId) state.input.controls.delete(info.control);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) {}
    handleControlUp(info.control, point, cancelled);
  }
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', event => pointerUp(event, false), { passive: false });
  canvas.addEventListener('pointercancel', event => pointerUp(event, true), { passive: false });
  canvas.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', event => event.preventDefault(), { passive: false });

  function moveRaidCursor(dx, dy) {
    const raid = state.raid; if (!raid || raid.over) return;
    raid.cursor = deployPoint({ x: raid.cursor.x + dx * 22, y: raid.cursor.y + dy * 22 });
  }
  function keyDown(event) {
    if (!state.started || state.orientationPaused) return;
    state.input.keys.add(event.key);
    if (state.screen === 'raid' && state.raid && !state.raid.over) {
      if (/^[1-5]$/.test(event.key)) { state.raid.selected = Number(event.key) - 1; sound('select'); event.preventDefault(); }
      else if (event.key === 'ArrowLeft') { moveRaidCursor(-1, 0); event.preventDefault(); }
      else if (event.key === 'ArrowRight') { moveRaidCursor(1, 0); event.preventDefault(); }
      else if (event.key === 'ArrowUp') { moveRaidCursor(0, -1); event.preventDefault(); }
      else if (event.key === 'ArrowDown') { moveRaidCursor(0, 1); event.preventDefault(); }
      else if (event.key === ' ' || event.key === 'Enter') { deploySelected(state.raid, state.raid.cursor); event.preventDefault(); }
      else if (event.key === 'Escape') goToScreen('ladder');
    } else if (event.key.toLowerCase() === 'b') { goToScreen('base'); event.preventDefault(); }
    else if (event.key.toLowerCase() === 'l') { goToScreen('ladder'); event.preventDefault(); }
    else if (event.key.toLowerCase() === 'd') { goToScreen('log'); event.preventDefault(); }
    else if (event.key.toLowerCase() === 'n') { fullReset(); popup('NEW OUTPOST', COLORS.aqua); event.preventDefault(); }
  }
  function keyUp(event) { state.input.keys.delete(event.key); }
  window.addEventListener('keydown', keyDown, { passive: false }); window.addEventListener('keyup', keyUp, { passive: false });
  window.addEventListener('blur', resetInput); window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => { state.hiddenPaused = document.visibilityState !== 'visible'; if (state.hiddenPaused) { resetInput(); saveGame(); } });
  window.addEventListener('beforeunload', saveGame);

  function startGame() { unlockAudio(); state.started = true; audioOverlay.style.display = 'none'; state.lastSeen = Date.now(); saveGame(); popup('BUILD A STRONGHOLD', COLORS.aqua); }
  startButton.addEventListener('click', startGame);

  function update(dt) {
    updateEffects(dt);
    if (state.screen === 'raid') updateRaid(state.raid, dt);
  }
  function render() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.fillStyle = COLORS.ink; ctx.fillRect(0, 0, view.cssW, view.cssH);
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.ox * view.dpr, view.oy * view.dpr);
    ctx.save(); if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake * 14, (Math.random() - .5) * state.shake * 14);
    if (state.screen === 'base') drawBase(); else if (state.screen === 'ladder') drawLadder(); else if (state.screen === 'log') drawDefenseLog(); else drawRaid();
    drawEffects(); ctx.restore();
  }
  let lastTime = performance.now();
  function frame(time) {
    const dt = clamp((time - lastTime) / 1000, 0, .05); lastTime = time;
    if (state.started && !state.orientationPaused && !state.hiddenPaused) update(dt);
    render(); requestAnimationFrame(frame);
  }
  resize(); requestAnimationFrame(frame);
})();
