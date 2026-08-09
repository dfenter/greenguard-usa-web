(() => {
  'use strict';

  const W = 390;
  const H = 700;
  const SAVE_KEY = 'harvest-junction-progress-v1';
  const MAX_PARTICLES = 80;
  const MAX_POINTERS = 12;
  const COLORS = {
    ink: '#2b3328',
    forest: '#294c3b',
    forest2: '#365d49',
    leaf: '#6b9b71',
    sage: '#b8d8b4',
    mint: '#e6eddc',
    cream: '#fff8e7',
    paper: '#f7f0df',
    tan: '#ead9b9',
    orange: '#e89962',
    gold: '#f3c56a',
    berry: '#a36b8f',
    sky: '#8bb8c7',
    red: '#e47663',
    white: '#ffffff'
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const rotateScreen = document.getElementById('rotate-screen');

  const crops = [
    { id: 'wheat', label: 'Wheat', icon: 'wheat', color: COLORS.gold, output: 'wheat' },
    { id: 'clover', label: 'Clover', icon: 'clover', color: COLORS.leaf, output: 'milk' },
    { id: 'berries', label: 'Berries', icon: 'berries', color: COLORS.berry, output: 'berries' },
    { id: 'sunroot', label: 'Sunroot', icon: 'sunroot', color: COLORS.orange, output: 'sunroot' }
  ];

  const recipes = [
    { id: 'mill', label: 'Grain Mill', input: 'wheat', output: 'flour', inputLabel: 'wheat', outputLabel: 'flour', color: COLORS.gold },
    { id: 'oven', label: 'Stone Oven', input: 'flour', output: 'bread', inputLabel: 'flour', outputLabel: 'bread', color: COLORS.orange },
    { id: 'dairy', label: 'Dairy Cart', input: 'milk', output: 'cheese', inputLabel: 'milk', outputLabel: 'cheese', color: COLORS.gold },
    { id: 'kettle', label: 'Berry Kettle', input: 'berries', output: 'jam', inputLabel: 'berries', outputLabel: 'jam', color: COLORS.berry }
  ];

  const orders = [
    { title: 'Sunrise Picnic', goods: { bread: 1, cheese: 1, jam: 1 }, capacity: 3, reward: 5, clue: '3 goods · 4 plots · 4 factory slots' },
    { title: 'Market Day', goods: { bread: 1, jam: 1, sunroot: 1 }, capacity: 3, reward: 6, clue: '3 goods · 4 plots · 4 factory slots' },
    { title: 'Lantern Supper', goods: { bread: 2, cheese: 1, jam: 1 }, capacity: 4, reward: 8, clue: '4 goods · 5 plots · 5 factory slots' }
  ];

  const buildings = [
    { name: 'Seed Shed', cost: 2, effect: '+1 plot', kind: 'plot' },
    { name: 'Field Cart', cost: 3, effect: '+1 plot', kind: 'plot' },
    { name: 'Orchard Row', cost: 4, effect: '+1 plot', kind: 'plot' },
    { name: 'River Beds', cost: 5, effect: '+1 plot', kind: 'plot' },
    { name: 'Mill Annex', cost: 3, effect: '+1 slot', kind: 'slot' },
    { name: 'Creamery Bench', cost: 4, effect: '+1 slot', kind: 'slot' },
    { name: 'Kettle House', cost: 5, effect: '+1 slot', kind: 'slot' },
    { name: 'Switchyard', cost: 7, effect: '+1 car space', kind: 'car' }
  ];

  const goodInfo = {
    wheat: { label: 'Wheat', icon: 'wheat', color: COLORS.gold },
    milk: { label: 'Milk', icon: 'milk', color: COLORS.sky },
    berries: { label: 'Berries', icon: 'berries', color: COLORS.berry },
    sunroot: { label: 'Sunroot', icon: 'sunroot', color: COLORS.orange },
    flour: { label: 'Flour', icon: 'flour', color: COLORS.cream },
    bread: { label: 'Bread', icon: 'bread', color: COLORS.orange },
    cheese: { label: 'Cheese', icon: 'cheese', color: COLORS.gold },
    jam: { label: 'Jam', icon: 'jam', color: COLORS.berry }
  };
  const goods = Object.keys(goodInfo);

  let progress = loadProgress();
  let mode = 'play';
  let plots = [];
  let inventory = {};
  let queues = [];
  let loaded = {};
  let particles = [];
  let pointers = new Map();
  let keys = new Set();
  let actionQueue = [];
  let stick = { x: 0, y: 0 };
  let carry = null;
  let toast = null;
  let townFocus = 0;
  let focus = { zone: 'plot', index: 0 };
  let shake = 0;
  let flash = 0;
  let completePulse = 0;
  let sessionOrders = 0;
  let sessionComplete = false;
  let paused = false;
  let orientationBlocked = false;
  let lastFrame = 0;
  let logicalScale = 1;
  let audio = null;
  let pendingTimeouts = new Set();

  function blankPlot() { return { crop: null, stage: 0, pulse: 0 }; }

  function resetSession(isRestart = false) {
    cancelPendingTimeouts();
    pointers.clear();
    keys.clear();
    actionQueue.length = 0;
    stick.x = 0;
    stick.y = 0;
    carry = null;
    plots = Array.from({ length: 8 }, blankPlot);
    inventory = {};
    goods.forEach((id) => { inventory[id] = 0; });
    queues = recipes.map(() => []);
    loaded = {};
    mode = 'play';
    focus = { zone: 'plot', index: 0 };
    townFocus = 0;
    toast = null;
    shake = 0;
    flash = 0;
    completePulse = 0;
    sessionOrders = 0;
    sessionComplete = !isRestart && progress.ordersCompleted >= 3;
    saveProgress();
  }

  function loadProgress() {
    const fallback = { coins: 4, ordersCompleted: 0, buildings: Array(8).fill(false) };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (typeof raw !== 'string' || raw.length < 2) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      const coins = parsed.coins;
      const ordersCompleted = parsed.ordersCompleted;
      const savedBuildings = Array.isArray(parsed.buildings) ? parsed.buildings : [];
      if (typeof coins !== 'number' || typeof ordersCompleted !== 'number' || !Number.isFinite(coins) || !Number.isFinite(ordersCompleted) || coins < 0 || ordersCompleted < 0) return fallback;
      const safeBuildings = Array.from({ length: 8 }, (_, i) => savedBuildings[i] === true);
      return {
        coins: Math.max(0, Math.floor(coins)),
        ordersCompleted: Math.max(0, Math.floor(ordersCompleted)),
        buildings: safeBuildings
      };
    } catch (_) {
      return fallback;
    }
  }

  function saveProgress() {
    const safe = {
      coins: Number.isFinite(progress.coins) ? Math.max(0, Math.floor(progress.coins)) : 0,
      ordersCompleted: Number.isFinite(progress.ordersCompleted) ? Math.max(0, Math.floor(progress.ordersCompleted)) : 0,
      buildings: Array.from({ length: 8 }, (_, i) => progress.buildings[i] === true)
    };
    progress = safe;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(safe));
    } catch (_) {
      // The game remains playable when storage is blocked or full.
    }
  }

  function cancelPendingTimeouts() {
    pendingTimeouts.forEach((id) => clearTimeout(id));
    pendingTimeouts.clear();
  }

  function unlockedPlots() {
    return 4 + buildings.filter((building, i) => building.kind === 'plot' && progress.buildings[i]).length;
  }

  function factorySlotBoost() {
    return buildings.filter((building, i) => building.kind === 'slot' && progress.buildings[i]).length;
  }

  function factorySlots() { return 4 + factorySlotBoost(); }

  function carCapacity() {
    const base = orders[progress.ordersCompleted % orders.length].capacity;
    return Math.min(6, base + (progress.buildings[7] ? 1 : 0));
  }

  function currentOrder() { return orders[progress.ordersCompleted % orders.length]; }

  function filledCount() {
    return Object.values(loaded).reduce((sum, value) => sum + value, 0);
  }

  function setupOrder() { loaded = {}; }

  function setToast(text, color = COLORS.ink) {
    toast = { text: String(text).slice(0, 72), color, ttl: 2.4 };
  }

  function initAudio() {
    if (audio) {
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audio = new AudioCtor();
      audio.resume().catch(() => {});
    } catch (_) {
      audio = null;
    }
  }

  function tone(freq, duration = 0.08, type = 'triangle') {
    if (!audio) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (_) {
      // Audio is an optional layer, never a gameplay dependency.
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = 960 / Math.max(1, Math.max(rect.width, rect.height));
    const backingScale = Math.min(dpr, cap);
    canvas.width = Math.max(1, Math.round(rect.width * backingScale));
    canvas.height = Math.max(1, Math.round(rect.height * backingScale));
    logicalScale = rect.width / W;
    ctx.setTransform(backingScale * logicalScale, 0, 0, backingScale * logicalScale, 0, 0);
    syncOrientation();
  }

  function syncOrientation() {
    const blocked = window.innerWidth > window.innerHeight;
    const wasPaused = paused;
    orientationBlocked = blocked;
    paused = blocked || document.hidden;
    if (paused && !wasPaused) clearInputs();
    lastFrame = 0;
    rotateScreen.hidden = !blocked;
  }

  function rr(x, y, w, h, radius = 12) {
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h, fill = COLORS.cream) {
    ctx.fillStyle = 'rgba(43,51,40,.10)';
    rr(x, y + 3, w, h, 15);
    ctx.fill();
    ctx.fillStyle = fill;
    rr(x, y, w, h, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(43,51,40,.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function text(value, x, y, size = 12, color = COLORS.ink, weight = 600, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function line(x1, y1, x2, y2, color, width = 2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawIcon(id, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = size * 0.5;
    if (id === 'wheat') {
      line(x, y + r * .75, x + r * .1, y - r * .72, COLORS.gold, Math.max(2, size * .09));
      line(x + r * .05, y - r * .2, x - r * .27, y - r * .42, COLORS.gold, Math.max(2, size * .08));
      line(x + r * .08, y - r * .02, x + r * .34, y - r * .25, COLORS.gold, Math.max(2, size * .08));
      line(x + r * .1, y - r * .4, x - r * .14, y - r * .62, COLORS.gold, Math.max(2, size * .08));
      line(x + r * .11, y - r * .56, x + r * .31, y - r * .73, COLORS.gold, Math.max(2, size * .08));
    } else if (id === 'clover') {
      ctx.fillStyle = COLORS.leaf;
      [[-.2,-.15],[.2,-.15],[0,-.42],[0,.1]].forEach(([dx,dy]) => { ctx.beginPath(); ctx.arc(x + dx * size, y + dy * size, size * .2, 0, Math.PI * 2); ctx.fill(); });
      line(x, y + size * .06, x + size * .05, y + size * .42, COLORS.leaf, Math.max(2, size * .08));
    } else if (id === 'berries') {
      ctx.fillStyle = COLORS.berry;
      [[-.28,.08],[.02,.2],[.3,.02],[0,-.16]].forEach(([dx,dy]) => { ctx.beginPath(); ctx.arc(x + dx * size, y + dy * size, size * .2, 0, Math.PI * 2); ctx.fill(); });
      line(x - size * .08, y - size * .28, x + size * .08, y - size * .5, COLORS.leaf, 2);
    } else if (id === 'sunroot') {
      ctx.strokeStyle = COLORS.orange;
      ctx.lineWidth = Math.max(2, size * .08);
      for (let i = 0; i < 8; i += 1) {
        const a = i * Math.PI / 4;
        line(x + Math.cos(a) * size * .25, y + Math.sin(a) * size * .25, x + Math.cos(a) * size * .48, y + Math.sin(a) * size * .48, COLORS.orange, 2);
      }
      ctx.fillStyle = COLORS.gold;
      ctx.beginPath(); ctx.arc(x, y, size * .27, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'flour') {
      ctx.fillStyle = COLORS.cream; ctx.strokeStyle = COLORS.tan; ctx.lineWidth = 2;
      rr(x - size * .3, y - size * .35, size * .6, size * .7, 4); ctx.fill(); ctx.stroke();
      line(x - size * .18, y - size * .1, x + size * .18, y - size * .1, COLORS.tan, 2);
      line(x - size * .14, y + size * .12, x + size * .14, y + size * .12, COLORS.tan, 2);
    } else if (id === 'milk') {
      ctx.fillStyle = COLORS.sky; ctx.strokeStyle = COLORS.forest2; ctx.lineWidth = 2;
      rr(x - size * .24, y - size * .28, size * .48, size * .6, 5); ctx.fill(); ctx.stroke();
      line(x - size * .16, y - size * .4, x + size * .16, y - size * .4, COLORS.forest2, 3);
      line(x - size * .12, y - size * .1, x + size * .12, y - size * .1, COLORS.white, 2);
    } else if (id === 'bread') {
      ctx.fillStyle = COLORS.orange;
      rr(x - size * .4, y - size * .18, size * .8, size * .42, size * .16); ctx.fill();
      line(x - size * .16, y - size * .08, x - size * .06, y + size * .1, '#c86d43', 2);
      line(x + size * .08, y - size * .1, x + size * .18, y + size * .08, '#c86d43', 2);
    } else if (id === 'cheese') {
      ctx.fillStyle = COLORS.gold; ctx.strokeStyle = '#bd8c38'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - size * .4, y + size * .26); ctx.lineTo(x + size * .38, y + size * .26); ctx.lineTo(x + size * .16, y - size * .32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#bd8c38'; ctx.beginPath(); ctx.arc(x + size * .03, y + size * .05, size * .05, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'jam') {
      ctx.fillStyle = COLORS.berry; ctx.strokeStyle = COLORS.forest2; ctx.lineWidth = 2;
      rr(x - size * .3, y - size * .22, size * .6, size * .52, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.gold; rr(x - size * .24, y - size * .38, size * .48, size * .1, 3); ctx.fill();
    }
    ctx.restore();
  }

  function cropById(id) { return crops.find((crop) => crop.id === id) || crops[0]; }

  function plotRect(index) {
    const col = index % 4;
    const row = Math.floor(index / 4);
    return { x: 20 + col * 88, y: 132 + row * 65, w: 82, h: 57 };
  }

  function seedRect(index) { return { x: 17 + index * 89, y: 273, w: 84, h: 48 }; }

  function factoryRect(index) {
    return { x: index % 2 === 0 ? 18 : 201, y: index < 2 ? 366 : 419, w: 171, h: 48 };
  }

  function pantryRect(index) { return { x: 14 + index * 46, y: 525, w: 43, h: 53 }; }

  function carRect() { return { x: 18, y: 625, w: 354, h: 56 }; }

  function townRect(index) {
    return { x: index % 2 === 0 ? 13 : 198, y: 114 + Math.floor(index / 2) * 107, w: 179, h: 96 };
  }

  function inRect(x, y, rect, pad = 0) {
    return x >= rect.x - pad && x <= rect.x + rect.w + pad && y >= rect.y - pad && y <= rect.y + rect.h + pad;
  }

  function drawTopBar() {
    ctx.fillStyle = COLORS.forest;
    ctx.fillRect(0, 0, W, 60);
    ctx.fillStyle = COLORS.forest2;
    ctx.fillRect(0, 55, W, 5);
    text('HARVEST', 16, 20, 13, COLORS.cream, 900);
    text('JUNCTION', 16, 39, 13, COLORS.sage, 900);
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath(); ctx.arc(214, 29, 11, 0, Math.PI * 2); ctx.fill();
    text(String(progress.coins), 214, 29, 12, COLORS.ink, 900, 'center');
    text(`RUN ${String(progress.ordersCompleted + 1).padStart(2, '0')}`, 239, 20, 10, COLORS.sage, 800);
    text(`${Math.min(progress.ordersCompleted, 3)}/3 orders`, 239, 38, 11, COLORS.cream, 700);
    ctx.fillStyle = COLORS.forest2;
    rr(277, 9, 35, 42, 12); ctx.fill();
    text('↻', 294, 30, 18, COLORS.cream, 900, 'center');
    const townButton = { x: 320, y: 9, w: 58, h: 42 };
    ctx.fillStyle = COLORS.cream;
    rr(townButton.x, townButton.y, townButton.w, townButton.h, 12); ctx.fill();
    text('TOWN', 349, 30, 11, COLORS.forest, 900, 'center');
  }

  function drawHint() {
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 60, W, 35);
    const hint = mode === 'town'
      ? 'Spend route coins on helpers — upgrades stay with this town.'
        : sessionComplete
        ? 'The junction is humming; keep shipping or start a fresh run with R.'
        : 'Drag a seed → wake the crop → flow goods through the factories → load the car.';
    text(hint, W / 2, 77, 10, COLORS.forest2, 750, 'center');
  }

  function drawField() {
    panel(14, 98, 362, 235, COLORS.cream);
    text('FIELD ROWS', 25, 113, 11, COLORS.forest, 900);
    text(`${unlockedPlots()} plots`, 365, 113, 10, COLORS.leaf, 800, 'right');
    for (let i = 0; i < unlockedPlots(); i += 1) {
      const p = plots[i];
      const r = plotRect(i);
      const crop = p.crop ? cropById(p.crop) : null;
      ctx.fillStyle = crop ? crop.color : COLORS.mint;
      rr(r.x, r.y, r.w, r.h, 11); ctx.fill();
      ctx.strokeStyle = p.stage === 2 ? COLORS.orange : 'rgba(43,51,40,.16)';
      ctx.lineWidth = p.stage === 2 ? 3 : 1;
      ctx.stroke();
      if (!crop) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(43,51,40,.28)';
        ctx.stroke();
        ctx.setLineDash([]);
        text('+ drag seed', r.x + r.w / 2, r.y + 29, 10, COLORS.leaf, 800, 'center');
      } else {
        drawIcon(crop.icon, r.x + 23, r.y + 27, 28, .95);
        text(crop.label, r.x + 45, r.y + 19, 10, COLORS.ink, 850);
        if (p.stage === 1) {
          text('WAKE', r.x + 45, r.y + 38, 9, COLORS.forest2, 800);
          line(r.x + 46, r.y + 47, r.x + 68, r.y + 47, COLORS.leaf, 3);
        } else {
          text('READY', r.x + 45, r.y + 38, 9, COLORS.forest, 900);
          line(r.x + 46, r.y + 47, r.x + 70, r.y + 47, COLORS.orange, 4);
        }
      }
      if (p.pulse > 0) {
        ctx.strokeStyle = `rgba(255,248,231,${Math.min(.8, p.pulse)})`;
        ctx.lineWidth = 3;
        rr(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 9); ctx.stroke();
      }
    }
    text('SEED CART', 25, 267, 9, COLORS.leaf, 900);
    crops.forEach((crop, i) => {
      const r = seedRect(i);
      ctx.fillStyle = crop.color;
      rr(r.x, r.y, r.w, r.h, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(43,51,40,.14)'; ctx.lineWidth = 1; ctx.stroke();
      drawIcon(crop.icon, r.x + 17, r.y + 24, 25);
      text(crop.label, r.x + 34, r.y + 24, 9, COLORS.ink, 850);
    });
  }

  function drawFactories() {
    panel(14, 341, 362, 143, COLORS.mint);
    text('FACTORY FLOW', 25, 356, 11, COLORS.forest, 900);
    text(`${factorySlots()} slots`, 365, 356, 10, COLORS.leaf, 800, 'right');
    recipes.forEach((recipe, i) => {
      const r = factoryRect(i);
      ctx.fillStyle = COLORS.cream;
      rr(r.x, r.y, r.w, r.h, 11); ctx.fill();
      ctx.strokeStyle = recipe.color; ctx.lineWidth = 2; ctx.stroke();
      drawIcon(goodInfo[recipe.input].icon, r.x + 18, r.y + 24, 22, .9);
      text(recipe.label, r.x + 35, r.y + 15, 10, COLORS.ink, 900);
      text(`${recipe.inputLabel} → ${recipe.outputLabel}`, r.x + 35, r.y + 31, 9, COLORS.forest2, 700);
      const q = queues[i].length;
      text(q ? `QUEUE ${q}/${1 + Math.min(2, factorySlotBoost())}` : 'TAP TO QUEUE', r.x + r.w - 8, r.y + 39, 8, q ? COLORS.orange : COLORS.leaf, 900, 'right');
    });
  }

  function drawPantry() {
    panel(14, 492, 362, 95, COLORS.cream);
    text('PANTRY · drag goods to the car', 25, 508, 10, COLORS.forest, 900);
    goods.forEach((id, i) => {
      const r = pantryRect(i);
      const info = goodInfo[id];
      const active = carry && carry.id === id;
      ctx.fillStyle = active ? COLORS.gold : COLORS.mint;
      rr(r.x, r.y, r.w, r.h, 9); ctx.fill();
      ctx.strokeStyle = active ? COLORS.orange : 'rgba(43,51,40,.14)';
      ctx.lineWidth = active ? 2 : 1; ctx.stroke();
      drawIcon(info.icon, r.x + r.w / 2, r.y + 18, 20, inventory[id] ? 1 : .28);
      text(String(inventory[id] || 0), r.x + r.w / 2, r.y + 42, 11, inventory[id] ? COLORS.ink : 'rgba(43,51,40,.35)', 900, 'center');
    });
  }

  function drawRail() {
    panel(14, 596, 362, 91, COLORS.forest2);
    const order = currentOrder();
    text(`RAIL ORDER · ${order.title}`, 25, 611, 10, COLORS.cream, 900);
    text(`${filledCount()}/${carCapacity()} loaded`, 365, 611, 10, COLORS.sage, 800, 'right');
    const car = carRect();
    ctx.fillStyle = COLORS.forest;
    rr(car.x, car.y, car.w, car.h, 12); ctx.fill();
    const capacity = carCapacity();
    const gap = 3;
    const bayW = (car.w - gap * (capacity + 1)) / capacity;
    const required = Object.keys(order.goods);
    for (let i = 0; i < capacity; i += 1) {
      const x = car.x + gap + i * (bayW + gap);
      const id = required[i];
      const need = id ? order.goods[id] : 0;
      const have = id ? (loaded[id] || 0) : 0;
      ctx.fillStyle = id ? (have >= need ? COLORS.sage : COLORS.cream) : 'rgba(255,248,231,.13)';
      rr(x, car.y + 5, bayW, car.h - 10, 8); ctx.fill();
      if (id) {
        drawIcon(goodInfo[id].icon, x + bayW / 2, car.y + 20, Math.min(21, bayW * .42), have >= need ? .9 : .65);
        text(`${have}/${need}`, x + bayW / 2, car.y + 43, 10, COLORS.ink, 900, 'center');
      } else {
        text('space', x + bayW / 2, car.y + 29, 8, COLORS.sage, 800, 'center');
      }
    }
  }

  function drawFocus() {
    if (mode === 'town') {
      const r = townRect(townFocus);
      ctx.strokeStyle = COLORS.orange;
      ctx.lineWidth = 3;
      rr(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 16); ctx.stroke();
      return;
    }
    let r = null;
    if (focus.zone === 'seed') r = seedRect(focus.index);
    if (focus.zone === 'plot') r = plotRect(focus.index);
    if (focus.zone === 'factory') r = factoryRect(focus.index);
    if (focus.zone === 'pantry') r = pantryRect(focus.index);
    if (focus.zone === 'car') r = carRect();
    if (!r) return;
    ctx.save();
    ctx.strokeStyle = COLORS.orange;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    rr(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 14); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTown() {
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 95, W, H - 95);
    text('TOWN LEDGER', 18, 83, 17, COLORS.forest, 900);
    text(`${progress.coins} route coins`, 372, 83, 11, COLORS.orange, 900, 'right');
    buildings.forEach((building, i) => {
      const r = townRect(i);
      const built = progress.buildings[i];
      ctx.fillStyle = built ? COLORS.sage : COLORS.cream;
      rr(r.x, r.y, r.w, r.h, 14); ctx.fill();
      ctx.strokeStyle = built ? COLORS.leaf : COLORS.tan;
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = built ? COLORS.leaf : COLORS.tan;
      ctx.beginPath(); ctx.arc(r.x + 22, r.y + 23, 12, 0, Math.PI * 2); ctx.fill();
      text(built ? '✓' : String(i + 1), r.x + 22, r.y + 23, 12, built ? COLORS.cream : COLORS.ink, 900, 'center');
      text(building.name, r.x + 41, r.y + 18, 11, COLORS.ink, 900);
      text(building.effect, r.x + 41, r.y + 35, 10, COLORS.forest2, 800);
      if (built) {
        text('BUILT', r.x + 10, r.y + 75, 9, COLORS.leaf, 900);
      } else {
        ctx.fillStyle = progress.coins >= building.cost ? COLORS.orange : COLORS.tan;
        rr(r.x + 91, r.y + 61, 78, 26, 8); ctx.fill();
        text(`BUILD · ${building.cost}`, r.x + 130, r.y + 74, 9, progress.coins >= building.cost ? COLORS.ink : COLORS.forest2, 900, 'center');
      }
    });
    ctx.fillStyle = COLORS.forest;
    rr(14, 636, 92, 48, 12); ctx.fill();
    text('← BACK', 60, 660, 11, COLORS.cream, 900, 'center');
    text('T / ESC', 365, 660, 10, COLORS.leaf, 800, 'right');
  }

  function drawDragGhost() {
    if (!pointers.size) return;
    pointers.forEach((pointer) => {
      if (!pointer.dragging || !pointer.kind) return;
      const id = pointer.kind === 'seed' ? crops[pointer.index].icon : pointer.kind === 'pantry' ? goods[pointer.index] : pointer.kind === 'plot' ? (plots[pointer.index].crop && cropById(plots[pointer.index].crop).icon) : null;
      if (!id) return;
      ctx.save();
      ctx.globalAlpha = .85;
      ctx.fillStyle = COLORS.cream;
      ctx.shadowColor = 'rgba(43,51,40,.25)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 24, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      drawIcon(id, pointer.x, pointer.y, 31);
      ctx.restore();
    });
  }

  function drawToast() {
    if (!toast) return;
    const width = Math.min(340, Math.max(160, ctx.measureText(toast.text).width + 34));
    ctx.fillStyle = COLORS.ink;
    rr((W - width) / 2, 90, width, 30, 15); ctx.fill();
    text(toast.text, W / 2, 105, 10, COLORS.cream, 800, 'center');
  }

  function drawComplete() {
    if (!sessionComplete) return;
    const pulse = Math.sin(completePulse * 2) * 2;
    ctx.fillStyle = 'rgba(41,76,59,.82)';
    rr(23 - pulse, 205 - pulse, 344 + pulse * 2, 218 + pulse * 2, 24); ctx.fill();
    ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 3; ctx.stroke();
    text('JUNCTION COMPLETE', W / 2, 242, 19, COLORS.cream, 950, 'center');
    text('Three orders found their way home.', W / 2, 274, 12, COLORS.sage, 700, 'center');
    text('Your town is open — build, ship,', W / 2, 305, 12, COLORS.cream, 700, 'center');
    text('or start a fresh run.', W / 2, 323, 12, COLORS.cream, 700, 'center');
    ctx.fillStyle = COLORS.gold;
    rr(87, 351, 216, 50, 15); ctx.fill();
    text('NEW RUN · R', W / 2, 376, 13, COLORS.ink, 950, 'center');
  }

  function render() {
    ctx.save();
    const offsetX = shake > 0 ? Math.sin(shake * 44) * Math.min(3, shake * 3) : 0;
    const offsetY = shake > 0 ? Math.cos(shake * 39) * Math.min(2, shake * 2) : 0;
    ctx.translate(offsetX, offsetY);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(-5, -5, W + 10, H + 10);
    drawTopBar();
    drawHint();
    if (mode === 'town') {
      drawTown();
    } else {
      drawField();
      drawFactories();
      drawPantry();
      drawRail();
      drawFocus();
      drawParticles();
      drawDragGhost();
      drawComplete();
    }
    drawToast();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function spawnBurst(x, y, color = COLORS.gold, count = 8) {
    const room = Math.max(0, MAX_PARTICLES - particles.length);
    const total = Math.min(count, room);
    for (let i = 0; i < total; i += 1) {
      const angle = (Math.PI * 2 * i) / Math.max(1, total) + Math.random() * .3;
      const speed = 20 + Math.random() * 45;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
        life: .45 + Math.random() * .45, maxLife: .9, size: 2 + Math.random() * 3, color
      });
    }
  }

  function update(dt) {
    if (toast) {
      toast.ttl -= dt;
      if (toast.ttl <= 0) toast = null;
    }
    shake = Math.max(0, shake - dt);
    flash = Math.max(0, flash - dt);
    completePulse += dt;
    particles.forEach((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 80 * dt;
    });
    particles = particles.filter((particle) => particle.life > 0).slice(-MAX_PARTICLES);
    plots.forEach((plot) => { plot.pulse = Math.max(0, plot.pulse - dt * 1.7); });
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / logicalScale, y: (event.clientY - rect.top) / logicalScale };
  }

  function hitSeed(x, y) {
    for (let i = 0; i < crops.length; i += 1) if (inRect(x, y, seedRect(i), 7)) return i;
    return -1;
  }

  function hitPlot(x, y) {
    for (let i = 0; i < unlockedPlots(); i += 1) if (inRect(x, y, plotRect(i), 6)) return i;
    return -1;
  }

  function hitFactory(x, y) {
    for (let i = 0; i < recipes.length; i += 1) if (inRect(x, y, factoryRect(i), 5)) return i;
    return -1;
  }

  function hitPantry(x, y) {
    for (let i = 0; i < goods.length; i += 1) if (inRect(x, y, pantryRect(i), 6)) return i;
    return -1;
  }

  function hitCar(x, y) { return inRect(x, y, carRect(), 8); }

  function hitTownButton(x, y) { return inRect(x, y, { x: 320, y: 9, w: 58, h: 42 }, 5); }

  function hitBack(x, y) { return inRect(x, y, { x: 14, y: 636, w: 92, h: 48 }, 7); }

  function hitReset(x, y) { return inRect(x, y, { x: 277, y: 9, w: 35, h: 42 }, 5); }

  function hitTownCard(x, y) {
    for (let i = 0; i < buildings.length; i += 1) if (inRect(x, y, townRect(i), 5)) return i;
    return -1;
  }

  function plantPlot(index, cropId) {
    if (index < 0 || index >= unlockedPlots()) return false;
    const plot = plots[index];
    if (plot.crop) {
      setToast('That row is already growing.');
      return false;
    }
    const crop = cropById(cropId);
    plot.crop = crop.id;
    plot.stage = 1;
    plot.pulse = 1;
    focus = { zone: 'plot', index };
    spawnBurst(plotRect(index).x + 41, plotRect(index).y + 28, crop.color, 7);
    tone(430, .07);
    setToast(`${crop.label} planted · tap to wake it`, COLORS.forest2);
    return true;
  }

  function harvestPlot(index) {
    const plot = plots[index];
    if (!plot || !plot.crop || plot.stage !== 2) return false;
    const crop = cropById(plot.crop);
    inventory[crop.output] += 1;
    plot.crop = null;
    plot.stage = 0;
    plot.pulse = 1;
    const r = plotRect(index);
    spawnBurst(r.x + 41, r.y + 28, crop.color, 12);
    shake = .18;
    flash = .12;
    tone(650, .09);
    setToast(`${crop.label} in the pantry`, COLORS.forest2);
    return true;
  }

  function actPlot(index) {
    const plot = plots[index];
    if (!plot) return;
    focus = { zone: 'plot', index };
    if (carry && carry.kind === 'seed' && !plot.crop) {
      const planted = plantPlot(index, carry.id);
      if (planted) carry = null;
      return;
    }
    if (!plot.crop) {
      setToast('Drag a seed from the cart into this row.');
    } else if (plot.stage === 1) {
      plot.stage = 2;
      plot.pulse = 1;
      spawnBurst(plotRect(index).x + 41, plotRect(index).y + 28, COLORS.gold, 7);
      tone(520, .07);
      setToast('Ready! Drag the crop to the pantry.', COLORS.orange);
    } else {
      harvestPlot(index);
    }
  }

  function useFactory(index) {
    const recipe = recipes[index];
    const queue = queues[index];
    const maxQueue = 1 + Math.min(2, factorySlotBoost());
    focus = { zone: 'factory', index };
    if (inventory[recipe.input] > 0 && queue.length < maxQueue) {
      inventory[recipe.input] -= 1;
      queue.push(recipe.input);
      spawnBurst(factoryRect(index).x + 25, factoryRect(index).y + 24, recipe.color, 6);
      tone(380 + index * 45, .07);
      setToast(`${recipe.label} queued · tap when the slot is full`, COLORS.forest2);
    } else if (queue.length) {
      queue.shift();
      inventory[recipe.output] += 1;
      spawnBurst(factoryRect(index).x + 140, factoryRect(index).y + 24, recipe.color, 10);
      shake = .12;
      tone(560 + index * 50, .09);
      setToast(`${recipe.outputLabel} ready`, COLORS.orange);
    } else {
      setToast(`Need ${recipe.inputLabel} for the ${recipe.label.toLowerCase()}.`, COLORS.red);
    }
  }

  function loadGood(id) {
    const order = currentOrder();
    if (!id || !order.goods[id]) {
      setToast('That good is not on this order.', COLORS.red);
      return false;
    }
    const have = loaded[id] || 0;
    if (have >= order.goods[id]) {
      setToast('That bay is full. Try another good.', COLORS.red);
      return false;
    }
    if (filledCount() >= carCapacity()) {
      setToast('The car is at capacity.', COLORS.red);
      return false;
    }
    if (!inventory[id]) {
      setToast(`No ${goodInfo[id].label.toLowerCase()} in the pantry.`, COLORS.red);
      return false;
    }
    inventory[id] -= 1;
    loaded[id] = have + 1;
    carry = null;
    spawnBurst(205, 650, goodInfo[id].color, 7);
    tone(600, .06);
    setToast(`${goodInfo[id].label} loaded`, COLORS.forest2);
    focus = { zone: 'car', index: 0 };
    return true;
  }

  function attemptOrder() {
    const order = currentOrder();
    const missing = Object.keys(order.goods).filter((id) => (loaded[id] || 0) < order.goods[id]);
    if (missing.length) {
      setToast(`Still need ${missing.map((id) => goodInfo[id].label).join(' + ')}`, COLORS.red);
      return;
    }
    progress.coins += order.reward;
    progress.ordersCompleted += 1;
    sessionOrders += 1;
    saveProgress();
    setupOrder();
    spawnBurst(195, 650, COLORS.gold, 24);
    shake = .35;
    flash = .35;
    tone(760, .12);
    tone(980, .15);
    if (sessionOrders >= 3) {
      sessionComplete = true;
      completePulse = 0;
      setToast('Town completion! The junction is yours.', COLORS.gold);
    } else {
      setToast(`Order shipped · +${order.reward} coins`, COLORS.gold);
    }
  }

  function buyBuilding(index) {
    const building = buildings[index];
    if (!building) return;
    townFocus = index;
    if (progress.buildings[index]) {
      setToast(`${building.name} is already built.`);
      return;
    }
    if (progress.coins < building.cost) {
      setToast(`Need ${building.cost - progress.coins} more route coin${building.cost - progress.coins === 1 ? '' : 's'}.`, COLORS.red);
      return;
    }
    progress.coins -= building.cost;
    progress.buildings[index] = true;
    saveProgress();
    spawnBurst(townRect(index).x + 90, townRect(index).y + 47, COLORS.sage, 18);
    tone(720, .1);
    setToast(`${building.name} built · ${building.effect}`, COLORS.forest2);
  }

  function toggleTown() {
    carry = null;
    pointers.clear();
    mode = mode === 'town' ? 'play' : 'town';
    focus = mode === 'town' ? { zone: 'town', index: townFocus } : { zone: 'plot', index: 0 };
    tone(330, .05);
  }

  function restart() {
    resetSession(true);
    setToast('Fresh route · build, flow, ship.');
    tone(420, .08);
  }

  function classifyPointer(pos) {
    if (mode === 'town') {
      if (hitBack(pos.x, pos.y)) return { kind: 'back' };
      const building = hitTownCard(pos.x, pos.y);
      return building >= 0 ? { kind: 'town', index: building } : { kind: 'none' };
    }
    if (hitTownButton(pos.x, pos.y)) return { kind: 'townButton' };
    if (hitReset(pos.x, pos.y)) return { kind: 'reset' };
    const seed = hitSeed(pos.x, pos.y);
    if (seed >= 0) return { kind: 'seed', index: seed };
    const plot = hitPlot(pos.x, pos.y);
    if (plot >= 0) return { kind: 'plot', index: plot };
    const factory = hitFactory(pos.x, pos.y);
    if (factory >= 0) return { kind: 'factory', index: factory };
    const pantry = hitPantry(pos.x, pos.y);
    if (pantry >= 0) return { kind: 'pantry', index: pantry };
    if (hitCar(pos.x, pos.y)) return { kind: 'car' };
    return { kind: 'none' };
  }

  function pointerDown(event) {
    event.preventDefault();
    if (paused || pointers.size >= MAX_POINTERS) return;
    initAudio();
    const pos = pointerPosition(event);
    const hit = classifyPointer(pos);
    const pointer = { pointerId: event.pointerId, x: pos.x, y: pos.y, startX: pos.x, startY: pos.y, dragging: false, ...hit };
    pointers.set(event.pointerId, pointer);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function pointerMove(event) {
    event.preventDefault();
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const pos = pointerPosition(event);
    pointer.x = pos.x; pointer.y = pos.y;
    pointer.dragging = pointer.dragging || Math.hypot(pos.x - pointer.startX, pos.y - pointer.startY) > 8;
  }

  function pointerUp(event) {
    event.preventDefault();
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const pos = pointerPosition(event);
    pointer.x = pos.x; pointer.y = pos.y;
    pointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
    if (paused) return;
    const targetPlot = hitPlot(pos.x, pos.y);
    if (pointer.kind === 'townButton' && !pointer.dragging) { toggleTown(); return; }
    if (pointer.kind === 'reset' && !pointer.dragging) { restart(); return; }
    if (pointer.kind === 'back' && !pointer.dragging) { toggleTown(); return; }
    if (pointer.kind === 'town' && !pointer.dragging) { buyBuilding(pointer.index); return; }
    if (pointer.kind === 'seed') {
      if (targetPlot >= 0) plantPlot(targetPlot, crops[pointer.index].id);
      else if (!pointer.dragging) setToast('Drop that seed into an empty row.');
      return;
    }
    if (pointer.kind === 'plot') {
      if (pointer.dragging && inRect(pos.x, pos.y, { x: 14, y: 492, w: 362, h: 95 }, 8)) harvestPlot(pointer.index);
      else if (!pointer.dragging) actPlot(pointer.index);
      return;
    }
    if (pointer.kind === 'factory' && !pointer.dragging) { useFactory(pointer.index); return; }
    if (pointer.kind === 'pantry') {
      if (pointer.dragging && hitCar(pos.x, pos.y)) loadGood(goods[pointer.index]);
      else if (!pointer.dragging && inventory[goods[pointer.index]] > 0) {
        carry = { kind: 'good', id: goods[pointer.index] };
        focus = { zone: 'pantry', index: pointer.index };
        setToast('Good picked up · drop it on the car.', COLORS.forest2);
      }
      return;
    }
    if (pointer.kind === 'car' && !pointer.dragging) attemptOrder();
  }

  function pointerCancel(event) {
    event.preventDefault();
    pointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  function clearInputs() {
    pointers.clear();
    keys.clear();
    actionQueue.length = 0;
    stick.x = 0;
    stick.y = 0;
    carry = null;
  }

  function zoneLength(zone) {
    if (zone === 'seed') return crops.length;
    if (zone === 'plot') return unlockedPlots();
    if (zone === 'factory') return recipes.length;
    if (zone === 'pantry') return goods.length;
    if (zone === 'car') return carCapacity();
    if (zone === 'town') return buildings.length;
    return 1;
  }

  const zones = ['seed', 'plot', 'factory', 'pantry', 'car'];

  function moveFocus(dx, dy) {
    if (mode === 'town') {
      if (dy !== 0) townFocus = Math.max(0, Math.min(buildings.length - 1, townFocus + dy * 2));
      if (dx !== 0) townFocus = Math.max(0, Math.min(buildings.length - 1, townFocus + dx));
      focus = { zone: 'town', index: townFocus };
      return;
    }
    let zoneIndex = zones.indexOf(focus.zone);
    if (zoneIndex < 0) zoneIndex = 0;
    if (dy !== 0) zoneIndex = Math.max(0, Math.min(zones.length - 1, zoneIndex + (dy > 0 ? 1 : -1)));
    focus.zone = zones[zoneIndex];
    if (dx !== 0 || dy !== 0) {
      const len = zoneLength(focus.zone);
      if (dy !== 0) focus.index = Math.min(focus.index, len - 1);
      if (dx !== 0) focus.index = Math.max(0, Math.min(len - 1, focus.index + dx));
    }
  }

  function keyboardAct() {
    if (mode === 'town') { buyBuilding(townFocus); return; }
    if (focus.zone === 'seed') {
      carry = { kind: 'seed', id: crops[focus.index].id };
      setToast(`${crops[focus.index].label} picked · move to a row and press Space.`);
    } else if (focus.zone === 'plot') actPlot(focus.index);
    else if (focus.zone === 'factory') useFactory(focus.index);
    else if (focus.zone === 'pantry') {
      const id = goods[focus.index];
      if (carry && carry.kind === 'good') loadGood(carry.id);
      else if (inventory[id] > 0) { carry = { kind: 'good', id }; setToast('Good picked up · move to the car and press Space.'); }
    } else if (focus.zone === 'car') {
      if (carry && carry.kind === 'good') loadGood(carry.id);
      else attemptOrder();
    }
  }

  function keyDown(event) {
    const key = event.key.toLowerCase();
    const accepted = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'r', 't', 'escape'];
    if (!accepted.includes(key) && event.code !== 'Space') return;
    event.preventDefault();
    initAudio();
    if (keys.has(key)) return;
    keys.add(key);
    if (key === 'r') { restart(); return; }
    if (key === 't') { toggleTown(); return; }
    if (key === 'escape' && mode === 'town') { toggleTown(); return; }
    if (key === 'arrowleft') moveFocus(-1, 0);
    else if (key === 'arrowright') moveFocus(1, 0);
    else if (key === 'arrowup') moveFocus(0, -1);
    else if (key === 'arrowdown') moveFocus(0, 1);
    else if (key === ' ' || event.code === 'Space') keyboardAct();
  }

  function keyUp(event) { keys.delete(event.key.toLowerCase()); }

  function frame(now) {
    const dt = lastFrame ? Math.min(0.032, Math.max(0, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    if (!paused) update(dt);
    render();
    window.requestAnimationFrame(frame);
  }

  resetSession();
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize, { passive: true });
  document.addEventListener('visibilitychange', syncOrientation);
  window.addEventListener('blur', clearInputs);
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerCancel, { passive: false });
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp, { passive: false });
  window.requestAnimationFrame(frame);
})();
