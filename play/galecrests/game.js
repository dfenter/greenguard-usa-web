(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 390;
  const H = 700;
  const SAVE_KEY = 'galecrests-save-v1';
  const MAX_PARTICLES = 100;
  const MAX_HISTORY = 12;
  const MAX_QUEUE = 16;
  const TAU = Math.PI * 2;
  const COLORS = {
    ink: '#0b1024',
    panel: '#172348',
    panel2: '#1d2d58',
    text: '#f2f6ff',
    muted: '#9eafd1',
    cyan: '#67e8f9',
    lime: '#b9f36a',
    orange: '#ffb45e',
    pink: '#ff7caa',
    red: '#ff6f7d',
    line: '#314576',
    track: '#6a789b'
  };

  const TRAINING = [
    { id:'speed', label:'Wind Sprints', sub:'Launch faster', color:COLORS.orange, base:3, bold:5, safeFatigue:2, boldFatigue:5 },
    { id:'stamina', label:'Marsh Circuits', sub:'Hold the lead', color:COLORS.lime, base:3, bold:5, safeFatigue:2, boldFatigue:5 },
    { id:'wing', label:'Reed Katas', sub:'Turn on a wing', color:COLORS.cyan, base:2, bold:4, safeFatigue:1, boldFatigue:4 },
    { id:'focus', label:'Stillwater', sub:'Pick the moment', color:COLORS.pink, base:3, bold:5, safeFatigue:1, boldFatigue:4 }
  ];

  const MENTORS = [
    { id:'iron-reed', name:'Iron Reed', icon:'IR', desc:'Stamina training gains +1. Race anchor +3.', stat:'stamina', train:1, race:3 },
    { id:'skyglass-eye', name:'Skyglass Eye', icon:'SE', desc:'Focus training gains +1. Race anchor +2.', stat:'focus', train:1, race:2 },
    { id:'tailwind-sash', name:'Tailwind Sash', icon:'TS', desc:'Wing training gains +1. Race anchor +4.', stat:'wing', train:1, race:4 }
  ];

  const FIELD_NAMES = ['Brasswhistle', 'Mossglide', 'Sunkeel', 'Rillflare', 'Pondprism', 'Thornwake'];
  const FIELD_COLORS = ['#ff8a7a', '#a991ff', '#f7dc72', '#64d9bd', '#ff9bd0', '#7eb7ff'];

  let viewW = 390;
  let viewH = 700;
  let dpr = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let orientationBlocked = false;
  let lastFrame = 0;
  let shake = 0;
  let flash = 0;
  let audio = null;
  let save = readSave();
  let state = null;
  let hitAreas = [];
  let particles = [];
  let actionQueue = [];
  let pendingTimeouts = new Set();
  const keys = new Set();
  const controlPointers = Object.create(null);
  const activePointers = new Map();
  const pendingPointerActions = new Map();

  function finite(value, fallback, min, max) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function cleanStats(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const result = {};
    for (const id of ['speed', 'stamina', 'wing', 'focus']) result[id] = finite(input[id], 0, 0, 40);
    return result;
  }

  function readSave() {
    const fallback = { best:0, legacy:null, runs:0 };
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (typeof raw !== 'string' || raw.length > 10000) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      const legacyStats = parsed.legacy && cleanStats(parsed.legacy.bonus);
      return {
        best: finite(parsed.best, 0, 0, 999999),
        runs: Math.round(finite(parsed.runs, 0, 0, 999999)),
        legacy: legacyStats ? {
          name: typeof parsed.legacy.name === 'string' ? parsed.legacy.name.slice(0, 24) : 'Unnamed line',
          bonus: legacyStats,
          score: finite(parsed.legacy.score, 0, 0, 999999)
        } : null
      };
    } catch (_) {
      return fallback;
    }
  }

  function writeSave() {
    const cleanLegacy = save.legacy && cleanStats(save.legacy.bonus);
    const payload = {
      best: finite(save.best, 0, 0, 999999),
      runs: Math.round(finite(save.runs, 0, 0, 999999)),
      legacy: cleanLegacy ? {
        name: typeof save.legacy.name === 'string' ? save.legacy.name.slice(0, 24) : 'Unnamed line',
        bonus: cleanLegacy,
        score: finite(save.legacy.score, 0, 0, 999999)
      } : null
    };
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (_) {
      // The run stays playable when storage is blocked or full.
    }
  }

  function resetInput() {
    keys.clear();
    actionQueue.length = 0;
    for (const id of Object.keys(controlPointers)) delete controlPointers[id];
    activePointers.clear();
    pendingPointerActions.clear();
    for (const timer of pendingTimeouts) clearTimeout(timer);
    pendingTimeouts.clear();
  }

  function schedule(fn, delay) {
    const timer = setTimeout(() => {
      pendingTimeouts.delete(timer);
      if (orientationBlocked || document.hidden) { schedule(fn, 120); return; }
      fn();
    }, delay);
    pendingTimeouts.add(timer);
    return timer;
  }

  function queueAction(action) {
    if (actionQueue.length < MAX_QUEUE) actionQueue.push({ fn: action, screen: state ? state.screen : null });
  }

  function isLandscape() {
    return viewW > viewH * 1.04;
  }

  function resizeCanvas() {
    const wasBlocked = orientationBlocked;
    viewW = Math.max(1, window.innerWidth);
    viewH = Math.max(1, window.innerHeight);
    const rawDpr = Math.min(2, window.devicePixelRatio || 1);
    const longAxis = Math.max(viewW, viewH) * rawDpr;
    dpr = longAxis > 960 ? rawDpr * (960 / longAxis) : rawDpr;
    canvas.width = Math.max(1, Math.round(viewW * dpr));
    canvas.height = Math.max(1, Math.round(viewH * dpr));
    scale = Math.min(viewW / W, viewH / H);
    offsetX = (viewW - W * scale) / 2;
    offsetY = (viewH - H * scale) / 2;
    orientationBlocked = isLandscape();
    if (orientationBlocked !== wasBlocked) resetInput();
  }

  function hashSeed(value) {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seeded(seed) {
    let n = hashSeed(seed) || 1;
    return () => {
      n += 0x6D2B79F5;
      let t = n;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createBirdName() {
    const first = ['Aster', 'Brindle', 'Cinder', 'Dapple', 'Fable', 'Hush', 'Kestrel', 'Lumen', 'Mica', 'Nettle'];
    const second = ['Vale', 'Quill', 'Crown', 'Drift', 'Loam', 'Gleam', 'Rook', 'Thimble', 'Skylark', 'Briar'];
    const rng = seeded(save.runs + 19);
    return first[Math.floor(rng() * first.length)] + ' ' + second[Math.floor(rng() * second.length)];
  }

  function newCareer() {
    resetInput();
    save.runs = Math.round(finite(save.runs, 0, 0, 999999)) + 1;
    writeSave();
    const inherited = save.legacy ? cleanStats(save.legacy.bonus) : { speed:0, stamina:0, wing:0, focus:0 };
    state = {
      screen:'prep',
      birdName:createBirdName(),
      season:1,
      turn:0,
      stats:{
        speed:8 + inherited.speed,
        stamina:9 + inherited.stamina,
        wing:8 + inherited.wing,
        focus:8 + inherited.focus,
        fatigue:0
      },
      inherited,
      mentors:[],
      lastRace:null,
      race:null,
      raceHistory:[],
      selectedTraining:null,
      pendingMentor:null,
      careerScore:0,
      finalScore:0,
      won:false,
      hint:'Pick a card. Its exact gain and fatigue cost are always shown.'
    };
    particles.length = 0;
    flash = 0;
    shake = 0;
    beep(392, 0.08, 'sine');
  }

  function begin() {
    resetInput();
    unlockAudio();
    newCareer();
  }

  function unlockAudio() {
    if (!audio) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audio = new AudioContextClass();
      } catch (_) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
  }

  function beep(frequency, duration, type) {
    if (!audio) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (_) { /* Audio is decorative. */ }
  }

  function mentorBonus(stat) {
    if (!state) return 0;
    return state.mentors.reduce((total, id) => {
      const mentor = MENTORS.find(item => item.id === id);
      return total + (mentor && mentor.stat === stat ? mentor.train : 0);
    }, 0);
  }

  function raceAnchor() {
    return state.mentors.reduce((total, id) => {
      const mentor = MENTORS.find(item => item.id === id);
      return total + (mentor ? mentor.race : 0);
    }, 0);
  }

  function trainingCard(id) {
    return TRAINING.find(card => card.id === id) || TRAINING[0];
  }

  function applyTraining(id, bold) {
    const card = trainingCard(id);
    const gain = (bold ? card.bold : card.base) + mentorBonus(id);
    const fatigue = bold ? card.boldFatigue : card.safeFatigue;
    state.stats[id] = clamp(state.stats[id] + gain, 0, 40);
    state.stats.fatigue = clamp(state.stats.fatigue + fatigue, 0, 20);
    state.turn = Math.min(2, state.turn + 1);
    state.hint = bold
      ? `${card.label}: +${gain} ${id}, +${fatigue} fatigue. Big wings, thin margin.`
      : `${card.label}: +${gain} ${id}, +${fatigue} fatigue. Steady work compounds.`;
    flash = 0.22;
    shake = 0.08;
    burst(170 + Math.random() * 50, 250, card.color, 10);
    beep(bold ? 520 : 420, 0.09, bold ? 'square' : 'triangle');
    state.selectedTraining = null;
    state.screen = 'prep';
  }

  function applyRest(deep) {
    const fatigue = deep ? 7 : 3;
    const stamina = deep ? 1 : 0;
    const focus = deep ? 0 : 1;
    state.stats.fatigue = clamp(state.stats.fatigue - fatigue, 0, 20);
    state.stats.stamina = clamp(state.stats.stamina + stamina, 0, 40);
    state.stats.focus = clamp(state.stats.focus + focus, 0, 40);
    state.turn = Math.min(2, state.turn + 1);
    state.hint = deep
      ? `Deep rest: -${fatigue} fatigue, +${stamina} stamina. The safest route to race day.`
      : `Light rest: -${fatigue} fatigue, +${focus} focus. Keep the mind bright.`;
    flash = 0.16;
    burst(250, 228, COLORS.cyan, 8);
    beep(deep ? 280 : 340, 0.1, 'sine');
    state.screen = 'prep';
  }

  function trainingDecision(id) {
    state.selectedTraining = id;
    state.screen = 'decision';
    beep(300, 0.05, 'sine');
  }

  function openRest() {
    state.screen = 'rest';
    beep(300, 0.05, 'sine');
  }

  function paceModifier(strategy) {
    if (strategy === 'front') return state.stats.speed * 0.16 - state.stats.stamina * 0.04;
    if (strategy === 'stalk') return state.stats.stamina * 0.14 + state.stats.focus * 0.12;
    return state.stats.wing * 0.1 + state.stats.focus * 0.18;
  }

  function playerPower(strategy) {
    const s = state.stats;
    const base = s.speed * 2 + s.stamina * 1.25 + s.wing * 0.85 + s.focus * 0.65;
    const fatiguePenalty = s.fatigue * 1.4;
    return base - fatiguePenalty + paceModifier(strategy) + raceAnchor() + state.season * 2;
  }

  function enterRace(strategy) {
    const rng = seeded(`${save.runs}:${state.season}:field`);
    const rivalScores = [];
    for (let i = 0; i < 5; i++) {
      rivalScores.push(49 + state.season * 4 + Math.round(rng() * 13) + i * 0.12);
    }
    const player = {
      name:state.birdName,
      score:playerPower(strategy),
      player:true,
      color:COLORS.lime,
      progress:0,
      lane:2
    };
    const rivals = rivalScores.map((score, index) => ({
      name:FIELD_NAMES[index],
      score,
      player:false,
      color:FIELD_COLORS[index],
      progress:0,
      lane:index < 2 ? index : index + 1
    }));
    state.race = {
      strategy,
      t:0,
      duration:4.6,
      cheers:0,
      field:[...rivals.slice(0, 2), player, ...rivals.slice(2)],
      rivals,
      seed:`${save.runs}:${state.season}:field`
    };
    state.screen = 'race';
    flash = 0.2;
    beep(strategy === 'front' ? 620 : strategy === 'stalk' ? 480 : 390, 0.13, 'triangle');
  }

  function cheer() {
    if (!state || state.screen !== 'race' || !state.race) return;
    if (state.race.cheers >= 12) return;
    state.race.cheers++;
    const x = 58 + state.race.cheers * 22;
    burst(x, 560, COLORS.orange, 9);
    shake = 0.14;
    beep(540 + state.race.cheers * 18, 0.06, 'square');
  }

  function finishRace() {
    const race = state.race;
    if (!race) return;
    const cheerBonus = Math.min(8, race.cheers * 0.6);
    const ranked = [
      { name:state.birdName, score:playerPower(race.strategy) + cheerBonus, player:true, color:COLORS.lime },
      ...race.rivals.map(rival => ({ ...rival }))
    ].sort((a, b) => b.score - a.score);
    const place = ranked.findIndex(bird => bird.player) + 1;
    const points = Math.max(8, 72 - (place - 1) * 12) + (place === 1 ? 18 : 0) + state.season * 4;
    state.careerScore += points;
    state.stats.fatigue = clamp(state.stats.fatigue - 3, 0, 20);
    state.lastRace = {
      season:state.season,
      strategy:race.strategy,
      place,
      points,
      cheerBonus,
      ranked:ranked.slice(0, 6)
    };
    state.raceHistory.push({ season:state.season, place, points });
    if (state.raceHistory.length > MAX_HISTORY) state.raceHistory.splice(0, state.raceHistory.length - MAX_HISTORY);
    state.race = null;
    flash = place === 1 ? 0.65 : 0.25;
    shake = place === 1 ? 0.3 : 0.12;
    beep(place === 1 ? 740 : 220, place === 1 ? 0.3 : 0.16, place === 1 ? 'triangle' : 'sawtooth');
    if (state.season === 3) {
      state.won = place === 1;
      state.finalScore = state.careerScore + Math.round(state.stats.speed + state.stats.stamina + state.stats.wing + state.stats.focus);
      if (state.finalScore > save.best) {
        save.best = state.finalScore;
        writeSave();
      }
      state.screen = 'final';
      if (state.won) burst(195, 300, COLORS.lime, 36);
      return;
    }
    const mentor = MENTORS.find(item => !state.mentors.includes(item.id));
    state.pendingMentor = place === 1 ? mentor || null : null;
    state.screen = state.pendingMentor ? 'mentor' : 'summary';
  }

  function chooseMentor() {
    if (!state.pendingMentor) return advanceSeason();
    state.mentors.push(state.pendingMentor.id);
    if (state.mentors.length > MENTORS.length) state.mentors.splice(0, state.mentors.length - MENTORS.length);
    state.hint = `${state.pendingMentor.name} is active. This buff is earned, permanent, and shown in the math.`;
    state.pendingMentor = null;
    state.screen = 'summary';
    burst(195, 250, COLORS.cyan, 18);
    beep(660, 0.18, 'triangle');
  }

  function advanceSeason() {
    if (state.season >= 3) return;
    state.season++;
    state.turn = 0;
    state.screen = 'prep';
    state.hint = `Season ${state.season}: two prep turns, then choose your pace for the race.`;
    state.lastRace = state.lastRace;
    flash = 0.24;
  }

  function retireBird() {
    const s = state.stats;
    const bonus = {
      speed:clamp(Math.floor(s.speed * 0.18), 1, 7),
      stamina:clamp(Math.floor(s.stamina * 0.18), 1, 7),
      wing:clamp(Math.floor(s.wing * 0.18), 1, 7),
      focus:clamp(Math.floor(s.focus * 0.18), 1, 7)
    };
    save.legacy = { name:state.birdName, bonus, score:state.finalScore };
    writeSave();
    state.screen = 'legacy';
    state.hint = 'Legacy saved locally. Your next chick will show these inherited points at launch.';
    burst(195, 320, COLORS.pink, 28);
    beep(560, 0.24, 'sine');
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#111b3b');
    gradient.addColorStop(0.58, '#0d1730');
    gradient.addColorStop(1, '#090e21');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(103,232,249,0.04)';
    for (let x = 18; x < W; x += 36) ctx.fillRect(x, 76, 1, 510);
    ctx.fillStyle = 'rgba(185,243,106,0.05)';
    for (let y = 92; y < H; y += 36) ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = 'rgba(255,180,94,0.08)';
    ctx.beginPath();
    ctx.arc(325, 112, 82, 0, TAU);
    ctx.fill();
  }

  function setFont(size, weight) {
    ctx.font = `${weight || 600} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  }

  function text(value, x, y, size, color, align, weight) {
    setFont(size, weight);
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function wrap(value, x, y, maxWidth, lineHeight, size, color, weight) {
    setFont(size, weight);
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const words = String(value).split(' ');
    let line = '';
    let row = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + row * lineHeight);
        line = word;
        row++;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y + row * lineHeight);
    return row + 1;
  }

  function roundRect(x, y, w, h, r, fill, stroke, lineWidth) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function addHit(id, x, y, w, h, action) {
    hitAreas.push({ id, x, y, w, h, action });
  }

  function button(id, label, x, y, w, h, action, fill, color) {
    roundRect(x, y, w, h, 14, fill || COLORS.panel2, COLORS.line, 1);
    text(label, x + w / 2, y + h / 2 + 6, 14, color || COLORS.text, 'center', 800);
    addHit(id, x, y, w, h, action);
  }

  function pill(label, x, y, w, color) {
    roundRect(x, y, w, 25, 12, color || COLORS.panel2);
    text(label, x + w / 2, y + 17, 11, COLORS.ink, 'center', 850);
  }

  function statBar(id, label, x, y, value, accent, compact) {
    const width = compact ? 160 : 166;
    const max = 32;
    text(label.toUpperCase(), x, y, 10, COLORS.muted, 'left', 800);
    text(String(Math.round(value)), x + width, y, 12, COLORS.text, 'right', 850);
    roundRect(x, y + 7, width, 7, 3, '#0b122a');
    roundRect(x, y + 7, width * clamp(value / max, 0, 1), 7, 3, accent);
  }

  function drawTop(title, subtitle) {
    text('GALECRESTS', 17, 28, 17, COLORS.lime, 'left', 900);
    text(title, 17, 52, 23, COLORS.text, 'left', 850);
    text(subtitle, 373, 28, 11, COLORS.muted, 'right', 700);
    line(16, 65, 374, 65, COLORS.line, 1);
  }

  function drawBird(x, y, color, wingOpen, bob) {
    const lift = Math.sin((performance.now() / 240) + (bob || 0)) * 2;
    ctx.save();
    ctx.translate(x, y + lift);
    ctx.strokeStyle = color || COLORS.lime;
    ctx.fillStyle = color || COLORS.lime;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 10); ctx.lineTo(0, 66);
    ctx.moveTo(0, 55); ctx.lineTo(-16, 80);
    ctx.moveTo(0, 55); ctx.lineTo(17, 80);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 25, 26, 34, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.ellipse(-7, 10, 5, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color || COLORS.lime;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(22, 4); ctx.lineTo(45, 1); ctx.lineTo(24, 13);
    ctx.stroke();
    ctx.fillStyle = color || COLORS.lime;
    ctx.beginPath();
    if (wingOpen) {
      ctx.moveTo(-16, 20); ctx.quadraticCurveTo(-62, -24, -48, 25); ctx.quadraticCurveTo(-32, 39, -10, 42);
    } else {
      ctx.moveTo(-16, 23); ctx.quadraticCurveTo(-40, 22, -34, 50); ctx.quadraticCurveTo(-23, 42, -10, 39);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawStatsPanel() {
    roundRect(16, 78, 358, 112, 18, COLORS.panel, COLORS.line, 1);
    drawBird(63, 96, COLORS.lime, state.screen === 'race', 1);
    text(state.birdName, 112, 102, 16, COLORS.text, 'left', 850);
    text(state.inherited.speed + state.inherited.stamina + state.inherited.wing + state.inherited.focus > 0 ? 'LEGACY CHICK' : 'FRESH HATCHLING', 112, 121, 10, COLORS.orange, 'left', 850);
    statBar('speed', 'speed', 112, 143, state.stats.speed, COLORS.orange, true);
    statBar('stamina', 'stamina', 112, 164, state.stats.stamina, COLORS.lime, true);
    text('FATIGUE', 285, 102, 10, COLORS.muted, 'left', 800);
    text(`${Math.round(state.stats.fatigue)}/20`, 356, 102, 12, state.stats.fatigue > 10 ? COLORS.red : COLORS.text, 'right', 850);
    roundRect(285, 109, 71, 8, 4, '#0b122a');
    roundRect(285, 109, 71 * clamp(state.stats.fatigue / 20, 0, 1), 8, 4, state.stats.fatigue > 10 ? COLORS.red : COLORS.orange);
    statBar('wing', 'wing', 285, 143, state.stats.wing, COLORS.cyan, true);
    statBar('focus', 'focus', 285, 164, state.stats.focus, COLORS.pink, true);
  }

  function drawPrep() {
    drawTop(`SEASON ${state.season}`, `${state.careerScore} SCORE`);
    text('RAISE YOUR CRANE-BIRD', 17, 91, 12, COLORS.orange, 'left', 850);
    text(`PREP TURN ${state.turn + 1} / 2`, 373, 91, 11, COLORS.muted, 'right', 800);
    drawStatsPanel();
    text('TRAINING CARDS', 17, 218, 11, COLORS.muted, 'left', 850);
    text('Tap a card to choose steady or bold', 373, 218, 10, COLORS.muted, 'right', 600);
    for (let i = 0; i < TRAINING.length; i++) {
      const card = TRAINING[i];
      const x = 16 + (i % 2) * 183;
      const y = 232 + Math.floor(i / 2) * 91;
      const gainSafe = card.base + mentorBonus(card.id);
      const gainBold = card.bold + mentorBonus(card.id);
      roundRect(x, y, 174, 80, 14, COLORS.panel, COLORS.line, 1);
      ctx.fillStyle = card.color;
      ctx.fillRect(x, y, 5, 80);
      text(`${i + 1}`, x + 16, y + 23, 12, card.color, 'left', 900);
      text(card.label, x + 35, y + 23, 13, COLORS.text, 'left', 850);
      text(card.sub, x + 35, y + 41, 10, COLORS.muted, 'left', 650);
      text(`SAFE  +${gainSafe} / +${card.safeFatigue}F`, x + 16, y + 63, 10, COLORS.lime, 'left', 800);
      text(`BOLD  +${gainBold} / +${card.boldFatigue}F`, x + 100, y + 63, 10, COLORS.orange, 'left', 800);
      addHit(`train-${card.id}`, x, y, 174, 80, () => trainingDecision(card.id));
    }
    button('rest', 'REST / RECOVER', 16, 428, 174, 58, openRest, COLORS.panel2, COLORS.cyan);
    button('race', state.turn >= 2 ? 'ENTER SEASON RACE' : 'RACE EARLY', 200, 428, 174, 58, () => { state.screen = 'strategy'; }, state.turn >= 2 ? COLORS.orange : COLORS.panel2, state.turn >= 2 ? COLORS.ink : COLORS.orange);
    const active = state.mentors.length ? state.mentors.map(id => MENTORS.find(m => m.id === id).icon).join(' · ') : 'none earned yet';
    text(`MENTORS  ${active}`, 17, 517, 10, COLORS.cyan, 'left', 800);
    wrap(state.hint, 17, 548, 356, 16, 11, COLORS.text, 650);
    text('1–4 cards   5 rest   R race', 17, 676, 10, COLORS.muted, 'left', 700);
    text(`BEST ${Math.round(save.best)}`, 373, 676, 10, COLORS.muted, 'right', 800);
  }

  function drawDecision() {
    drawPrep();
    const card = trainingCard(state.selectedTraining);
    roundRect(18, 145, 354, 440, 22, '#101a38', COLORS.line, 2);
    text('CHOOSE YOUR EDGE', 195, 180, 12, card.color, 'center', 900);
    text(card.label, 195, 215, 24, COLORS.text, 'center', 900);
    text(card.sub, 195, 238, 12, COLORS.muted, 'center', 650);
    drawBird(195, 255, card.color, true, 2);
    roundRect(40, 350, 145, 138, 14, COLORS.panel, COLORS.line, 1);
    text('STEADY', 53, 376, 13, COLORS.lime, 'left', 900);
    text(`+${card.base + mentorBonus(card.id)} ${card.id}`, 53, 398, 10, COLORS.text, 'left', 700);
    text(`+${card.safeFatigue} fatigue`, 53, 414, 10, COLORS.muted, 'left', 700);
    button('safe', 'TAKE STEADY', 40, 428, 145, 54, () => applyTraining(card.id, false), COLORS.lime, COLORS.ink);
    roundRect(200, 350, 150, 138, 14, COLORS.panel, COLORS.line, 1);
    text('BOLD', 213, 376, 13, COLORS.orange, 'left', 900);
    text(`+${card.bold + mentorBonus(card.id)} ${card.id}`, 213, 398, 10, COLORS.text, 'left', 700);
    text(`+${card.boldFatigue} fatigue`, 213, 414, 10, COLORS.muted, 'left', 700);
    button('bold', 'PUSH LUCK', 200, 428, 150, 54, () => applyTraining(card.id, true), COLORS.orange, COLORS.ink);
    button('back', 'BACK', 40, 520, 145, 48, () => { state.selectedTraining = null; state.screen = 'prep'; }, COLORS.panel2, COLORS.text);
    text('No hidden rolls: gain versus fatigue.', 195, 608, 10, COLORS.muted, 'center', 650);
  }

  function drawRest() {
    drawPrep();
    roundRect(18, 174, 354, 310, 22, '#101a38', COLORS.line, 2);
    text('REST IS TRAINING TOO', 195, 211, 12, COLORS.cyan, 'center', 900);
    drawBird(195, 230, COLORS.cyan, false, 1);
    text('How much runway does your bird need?', 195, 332, 13, COLORS.text, 'center', 700);
    button('deep', 'DEEP REST  -7F / +1 STA', 40, 363, 310, 52, () => applyRest(true), COLORS.cyan, COLORS.ink);
    button('light', 'LIGHT REST  -3F / +1 FOCUS', 40, 425, 310, 52, () => applyRest(false), COLORS.panel2, COLORS.text);
    button('back', 'BACK', 40, 506, 145, 48, () => { state.screen = 'prep'; }, COLORS.panel2, COLORS.text);
    text('F = fatigue. Every cost stays visible.', 195, 590, 10, COLORS.muted, 'center', 650);
  }

  function drawStrategy() {
    drawTop(`SEASON ${state.season} RACE`, 'SEE THE MATH');
    drawStatsPanel();
    text('PICK A PACE STRATEGY', 17, 218, 12, COLORS.orange, 'left', 900);
    text('Then cheer during the seeded replay', 373, 218, 10, COLORS.muted, 'right', 650);
    const items = [
      ['front', 'FRONT-RUN', 'speed × .16 − stamina × .04'],
      ['stalk', 'STALK', 'stamina × .14 + focus × .12'],
      ['close', 'CLOSE LATE', 'wing × .10 + focus × .18']
    ];
    items.forEach((item, index) => {
      const y = 240 + index * 83;
      const color = index === 0 ? COLORS.orange : index === 1 ? COLORS.cyan : COLORS.pink;
      roundRect(16, y, 358, 68, 15, COLORS.panel, COLORS.line, 1);
      text(String(index + 1), 34, y + 28, 13, color, 'left', 900);
      text(item[1], 61, y + 27, 14, COLORS.text, 'left', 850);
      text(item[2], 61, y + 47, 10, COLORS.muted, 'left', 650);
      const mod = paceModifier(item[0]);
      text(`${mod >= 0 ? '+' : ''}${mod.toFixed(1)} anchor`, 355, y + 36, 11, color, 'right', 850);
      addHit(`pace-${item[0]}`, 16, y, 358, 68, () => enterRace(item[0]));
    });
    roundRect(16, 504, 358, 102, 15, '#101a38', COLORS.line, 1);
    const base = state.stats.speed * 2 + state.stats.stamina * 1.25 + state.stats.wing * 0.85 + state.stats.focus * 0.65;
    text('RACE POWER PREVIEW', 31, 530, 10, COLORS.muted, 'left', 900);
    text(`base ${base.toFixed(1)}  − fatigue ${(state.stats.fatigue * 1.4).toFixed(1)}  + mentor ${raceAnchor()}`, 31, 553, 11, COLORS.text, 'left', 700);
    text('Field is seeded per season. Cheer adds up to +8.', 31, 578, 10, COLORS.orange, 'left', 750);
    button('back', 'BACK TO PREP', 16, 625, 160, 48, () => { state.screen = 'prep'; }, COLORS.panel2, COLORS.text);
    text('1 front   2 stalk   3 close', 373, 653, 10, COLORS.muted, 'right', 700);
  }

  function drawTrackBird(bird, x, y, bob) {
    const color = bird.player ? COLORS.lime : bird.color;
    ctx.save();
    ctx.translate(x, y + Math.sin(performance.now() / 170 + bob) * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 9, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, -3); ctx.lineTo(21, -7); ctx.lineTo(11, 1);
    ctx.moveTo(-6, 5); ctx.lineTo(-10, 15); ctx.moveTo(3, 5); ctx.lineTo(7, 15);
    ctx.stroke();
    ctx.restore();
  }

  function drawRace() {
    drawTop(`SEASON ${state.season} AUTO-RACE`, state.race.strategy.toUpperCase());
    const race = state.race;
    const progress = clamp(race.t / race.duration, 0, 1);
    text('SEE THE LINE. TAP CHEER TO LIFT YOUR BIRD.', 17, 90, 11, COLORS.orange, 'left', 850);
    text(`${Math.ceil(Math.max(0, race.duration - race.t)).toFixed(0)}s`, 373, 90, 12, COLORS.text, 'right', 850);
    roundRect(16, 108, 358, 352, 18, COLORS.panel, COLORS.line, 1);
    text('MARSHLIGHT CIRCUIT  /  SEEDED FIELD', 31, 133, 10, COLORS.muted, 'left', 850);
    line(55, 151, 55, 438, COLORS.orange, 3);
    line(342, 151, 342, 438, COLORS.lime, 3);
    for (let i = 0; i < 6; i++) {
      const y = 168 + i * 46;
      line(55, y, 342, y, '#304064', 1);
      text(`${i + 1}`, 35, y + 4, 10, COLORS.muted, 'center', 800);
    }
    for (const bird of race.field) {
      const speed = bird.player ? 0.77 + (playerPower(race.strategy) / 180) : 0.78 + bird.score / 190;
      bird.progress = Math.min(0.94, progress * speed);
      drawTrackBird(bird, 58 + 280 * bird.progress, 168 + bird.lane * 46, bird.lane);
      text(bird.player ? 'YOU' : bird.name, 61, 164 + bird.lane * 46, 9, bird.player ? COLORS.lime : COLORS.muted, 'left', 800);
    }
    text(progress < 1 ? 'FLY, FLY, FLY!' : 'PHOTO FINISH', 195, 487, 18, progress < 1 ? COLORS.cyan : COLORS.orange, 'center', 900);
    roundRect(16, 502, 358, 47, 14, COLORS.panel2);
    text(`CHEERS  ${race.cheers} / 12`, 30, 532, 12, COLORS.orange, 'left', 850);
    text(`LIFT +${Math.min(8, race.cheers * 0.6).toFixed(1)}`, 360, 532, 11, COLORS.lime, 'right', 850);
    button('cheer', 'TAP TO CHEER  (SPACE)', 16, 565, 358, 66, cheer, COLORS.orange, COLORS.ink);
    text('The race runs itself. Your timing is the only input.', 195, 660, 10, COLORS.muted, 'center', 650);
  }

  function drawResultsHeader() {
    if (!state.lastRace) return;
    const last = state.lastRace;
    const placeText = last.place === 1 ? 'WINNER' : `PLACE ${last.place}`;
    text(`SEASON ${last.season} RESULT`, 17, 91, 11, COLORS.muted, 'left', 850);
    text(placeText, 373, 91, 12, last.place === 1 ? COLORS.lime : COLORS.orange, 'right', 900);
    roundRect(16, 106, 358, 112, 18, last.place === 1 ? 'rgba(185,243,106,0.12)' : COLORS.panel, COLORS.line, 1);
    text(last.place === 1 ? 'THE LINE HELD.' : 'A USEFUL READ.', 31, 137, 20, last.place === 1 ? COLORS.lime : COLORS.orange, 'left', 900);
    text(`${last.strategy.toUpperCase()}  ·  +${last.points} career points`, 31, 163, 11, COLORS.text, 'left', 750);
    text(`CHEER LIFT +${last.cheerBonus.toFixed(1)}  ·  fatigue recovers 3`, 31, 187, 10, COLORS.muted, 'left', 650);
  }

  function drawSummary() {
    drawTop('RACE LOG', `SCORE ${state.careerScore}`);
    drawResultsHeader();
    text('ORDER', 28, 250, 10, COLORS.muted, 'left', 900);
    text('POWER', 345, 250, 10, COLORS.muted, 'right', 900);
    state.lastRace.ranked.forEach((bird, index) => {
      const y = 268 + index * 42;
      roundRect(16, y - 20, 358, 34, 10, bird.player ? 'rgba(185,243,106,0.12)' : COLORS.panel);
      text(`${index + 1}`, 31, y + 2, 12, bird.player ? COLORS.lime : COLORS.muted, 'center', 900);
      text(bird.name, 53, y + 2, 12, bird.player ? COLORS.lime : COLORS.text, 'left', 750);
      text(bird.score.toFixed(1), 345, y + 2, 11, COLORS.muted, 'right', 700);
    });
    if (state.season < 3) {
      button('next-season', `CONTINUE TO SEASON ${state.season + 1}`, 16, 560, 358, 58, advanceSeason, COLORS.cyan, COLORS.ink);
      text('Your fatigue is visible. Spend the next prep turns wisely.', 195, 644, 10, COLORS.muted, 'center', 650);
    }
    text('ENTER / TAP TO CONTINUE', 195, 680, 10, COLORS.muted, 'center', 800);
  }

  function drawMentor() {
    drawTop('MENTOR UNLOCKED', `WINS ${state.mentors.length + 1}`);
    drawResultsHeader();
    const mentor = state.pendingMentor;
    roundRect(24, 252, 342, 244, 22, '#111b3b', COLORS.cyan, 2);
    pill('EARNED BY WIN', 134, 273, 122, COLORS.lime);
    text(mentor.icon, 195, 348, 34, COLORS.cyan, 'center', 900);
    text(mentor.name, 195, 386, 24, COLORS.text, 'center', 900);
    wrap(mentor.desc, 56, 418, 278, 18, 12, COLORS.muted, 650);
    text('No roll. No shop. This exact buff is yours.', 195, 476, 10, COLORS.orange, 'center', 800);
    button('equip-mentor', 'EQUIP MENTOR', 40, 524, 310, 56, chooseMentor, COLORS.lime, COLORS.ink);
    text('1 / ENTER', 195, 645, 10, COLORS.muted, 'center', 800);
  }

  function drawFinal() {
    drawTop(state.won ? 'GRAND CUP CLEARED' : 'CAREER COMPLETE', `BEST ${Math.round(save.best)}`);
    roundRect(16, 88, 358, 154, 20, state.won ? 'rgba(185,243,106,0.13)' : COLORS.panel, state.won ? COLORS.lime : COLORS.line, 2);
    text(state.won ? 'THE SKY REMEMBERS.' : 'THE LINE ENDS HERE.', 195, 126, 21, state.won ? COLORS.lime : COLORS.orange, 'center', 900);
    drawBird(195, 141, state.won ? COLORS.lime : COLORS.orange, state.won, 3);
    text(`CAREER SCORE  ${state.finalScore}`, 195, 224, 14, COLORS.text, 'center', 850);
    text(state.won ? 'Season 3 grand cup · first across the reedline' : 'Season 3 grand cup · every run becomes data', 195, 265, 11, COLORS.muted, 'center', 650);
    roundRect(16, 285, 358, 155, 16, COLORS.panel, COLORS.line, 1);
    text('FINAL BUILD', 31, 311, 10, COLORS.muted, 'left', 900);
    statBar('speed', 'speed', 31, 335, state.stats.speed, COLORS.orange, false);
    statBar('stamina', 'stamina', 31, 369, state.stats.stamina, COLORS.lime, false);
    statBar('wing', 'wing', 31, 403, state.stats.wing, COLORS.cyan, false);
    statBar('focus', 'focus', 205, 335, state.stats.focus, COLORS.pink, false);
    text(`MENTORS  ${state.mentors.length}`, 205, 381, 10, COLORS.cyan, 'left', 800);
    text(`RACES  ${state.raceHistory.length}`, 205, 404, 10, COLORS.muted, 'left', 800);
    button('retire', 'RETIRE + RAISE CHICK', 16, 482, 218, 58, retireBird, COLORS.pink, COLORS.ink);
    button('restart', 'INSTANT RESTART', 246, 482, 128, 58, newCareer, COLORS.panel2, COLORS.text);
    text('1 retire   2 restart', 195, 596, 10, COLORS.muted, 'center', 800);
    text('Best and legacy line persist when storage allows.', 195, 638, 10, COLORS.muted, 'center', 650);
  }

  function drawLegacy() {
    drawTop('LEGACY LINE', 'PERSISTED');
    roundRect(16, 90, 358, 330, 20, '#111b3b', COLORS.line, 2);
    text('A CHICK FROM THE GALE', 195, 128, 18, COLORS.pink, 'center', 900);
    drawBird(195, 152, COLORS.pink, true, 4);
    text(`${state.birdName}'s inheritance`, 195, 260, 14, COLORS.text, 'center', 800);
    text('Next career starts with:', 195, 288, 11, COLORS.muted, 'center', 650);
    const ids = ['speed', 'stamina', 'wing', 'focus'];
    ids.forEach((id, index) => {
      const x = 45 + index * 82;
      text(id.toUpperCase(), x, 327, 9, COLORS.muted, 'center', 850);
      text(`+${save.legacy.bonus[id]}`, x, 353, 22, COLORS.pink, 'center', 900);
    });
    text('Inherited points are fixed, visible, and earned from this retirement.', 195, 390, 10, COLORS.orange, 'center', 700);
    button('new-line', 'START THE NEXT LINE', 16, 464, 358, 62, newCareer, COLORS.pink, COLORS.ink);
    text(`Best score  ${Math.round(save.best)}  ·  legacy saved locally`, 195, 574, 11, COLORS.muted, 'center', 700);
    text('ENTER / TAP TO FLY AGAIN', 195, 634, 10, COLORS.muted, 'center', 800);
  }

  function drawStart() {
    text('GALECRESTS', 195, 164, 43, COLORS.lime, 'center', 950);
    text('a crane-bird career game', 195, 192, 13, COLORS.muted, 'center', 650);
    drawBird(195, 225, COLORS.lime, true, 5);
    roundRect(28, 352, 334, 146, 20, COLORS.panel, COLORS.line, 1);
    text('RAISE  ·  RACE  ·  REMEMBER', 195, 389, 15, COLORS.orange, 'center', 900);
    wrap('Three seasons. Four visible training cards. One seeded field. Retire your bird to pass its edge to the next chick.', 55, 421, 280, 18, 12, COLORS.text, 650);
    button('start', 'TAP TO START', 52, 534, 286, 62, begin, COLORS.lime, COLORS.ink);
    text('A single tap unlocks the tiny soundtrack.', 195, 627, 10, COLORS.muted, 'center', 650);
    text('KEYBOARD: 1–4  ·  ENTER  ·  SPACE', 195, 660, 10, COLORS.muted, 'center', 800);
  }

  function drawOrientationOverlay() {
    ctx.fillStyle = 'rgba(7,10,24,0.97)';
    ctx.fillRect(0, 0, W, H);
    text('TURN THE SKY UPRIGHT', 195, 268, 26, COLORS.cyan, 'center', 900);
    text('Galecrests is portrait-only.', 195, 307, 14, COLORS.text, 'center', 650);
    ctx.save();
    ctx.translate(195, 390);
    ctx.rotate(-Math.PI / 2);
    roundRect(-32, -55, 64, 110, 12, COLORS.panel, COLORS.orange, 3);
    line(-18, 33, 18, 33, COLORS.orange, 3);
    ctx.restore();
    text('The race and every timer are paused.', 195, 500, 12, COLORS.muted, 'center', 650);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    drawBackground();
    hitAreas = [];
    if (!state) drawStart();
    else if (state.screen === 'prep') drawPrep();
    else if (state.screen === 'decision') drawDecision();
    else if (state.screen === 'rest') drawRest();
    else if (state.screen === 'strategy') drawStrategy();
    else if (state.screen === 'race') drawRace();
    else if (state.screen === 'summary') drawSummary();
    else if (state.screen === 'mentor') drawMentor();
    else if (state.screen === 'final') drawFinal();
    else if (state.screen === 'legacy') drawLegacy();
    drawParticles();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(flash * 0.13, 0, 0.14)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (orientationBlocked) drawOrientationOverlay();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(x, y, color, count) {
    const amount = Math.min(count || 8, MAX_PARTICLES - particles.length);
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * TAU;
      const speed = 20 + Math.random() * 80;
      particles.push({ x, y, vx:Math.cos(angle) * speed, vy:Math.sin(angle) * speed - 30, life:0.5 + Math.random() * 0.5, max:1, color, size:2 + Math.random() * 3 });
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }

  function update(dt) {
    if (orientationBlocked || document.hidden) return;
    updateParticles(dt);
    shake = Math.max(0, shake - dt);
    flash = Math.max(0, flash - dt);
    if (actionQueue.length) {
      const action = actionQueue.shift();
      if (action && typeof action.fn === 'function' && (!state ? action.screen === null : action.screen === state.screen)) action.fn();
    }
    if (!state) return;
    if (state.screen === 'race' && state.race) {
      state.race.t += dt;
      if (state.race.t >= state.race.duration) finishRace();
    }
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x:(event.clientX - rect.left - offsetX) / scale, y:(event.clientY - rect.top - offsetY) / scale };
  }

  function controlAt(point) {
    for (let i = hitAreas.length - 1; i >= 0; i--) {
      const area = hitAreas[i];
      if (point.x >= area.x && point.x <= area.x + area.w && point.y >= area.y && point.y <= area.y + area.h) return area;
    }
    return null;
  }

  function onPointerDown(event) {
    event.preventDefault();
    if (orientationBlocked || document.hidden) { resetInput(); return; }
    unlockAudio();
    const point = canvasPoint(event);
    const area = controlAt(point);
    if (!area || controlPointers[area.id] != null) return;
    controlPointers[area.id] = event.pointerId;
    activePointers.set(event.pointerId, area.id);
    pendingPointerActions.set(event.pointerId, { id: area.id, action: area.action, screen: state ? state.screen : null });
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function releasePointer(event) {
    const areaId = activePointers.get(event.pointerId);
    if (!areaId) return;
    const pending = pendingPointerActions.get(event.pointerId);
    pendingPointerActions.delete(event.pointerId);
    if (controlPointers[areaId] === event.pointerId) delete controlPointers[areaId];
    activePointers.delete(event.pointerId);
    if (event.type !== 'pointerup') return;
    if (!pending || orientationBlocked || document.hidden) return;
    const point = canvasPoint(event);
    const area = controlAt(point);
    if (area && area.id === pending.id && (!state ? pending.screen === null : pending.screen === state.screen)) queueAction(pending.action);
  }

  function onKeyDown(event) {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    if (orientationBlocked || document.hidden) { resetInput(); return; }
    if (keys.has(event.key)) return;
    keys.add(event.key);
    if (orientationBlocked) return;
    unlockAudio();
    if (!state) {
      if (event.key === 'Enter' || event.key === ' ') queueAction(begin);
      return;
    }
    const key = event.key.toLowerCase();
    if (state.screen === 'prep') {
      if (['1','2','3','4'].includes(event.key)) queueAction(() => trainingDecision(TRAINING[Number(event.key) - 1].id));
      else if (event.key === '5') queueAction(openRest);
      else if (key === 'r' || event.key === 'Enter') queueAction(() => { state.screen = 'strategy'; });
    } else if (state.screen === 'decision') {
      if (event.key === '1') queueAction(() => applyTraining(state.selectedTraining, false));
      else if (event.key === '2') queueAction(() => applyTraining(state.selectedTraining, true));
      else if (event.key === 'Escape') queueAction(() => { state.screen = 'prep'; });
    } else if (state.screen === 'rest') {
      if (event.key === '1') queueAction(() => applyRest(true));
      else if (event.key === '2') queueAction(() => applyRest(false));
      else if (event.key === 'Escape') queueAction(() => { state.screen = 'prep'; });
    } else if (state.screen === 'strategy') {
      if (event.key === '1') queueAction(() => enterRace('front'));
      else if (event.key === '2') queueAction(() => enterRace('stalk'));
      else if (event.key === '3') queueAction(() => enterRace('close'));
      else if (event.key === 'Escape') queueAction(() => { state.screen = 'prep'; });
    } else if (state.screen === 'race') {
      if (event.key === ' ' || key === 'c') queueAction(cheer);
    } else if (state.screen === 'summary') {
      if (event.key === 'Enter' || event.key === ' ') queueAction(advanceSeason);
    } else if (state.screen === 'mentor') {
      if (event.key === '1' || event.key === 'Enter' || event.key === ' ') queueAction(chooseMentor);
    } else if (state.screen === 'final') {
      if (event.key === '1') queueAction(retireBird);
      else if (event.key === '2' || event.key === 'Enter' || event.key === ' ') queueAction(newCareer);
    } else if (state.screen === 'legacy') {
      if (event.key === 'Enter' || event.key === ' ') queueAction(newCareer);
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive:false });
  canvas.addEventListener('pointerup', releasePointer, { passive:false });
  canvas.addEventListener('pointercancel', releasePointer, { passive:false });
  canvas.addEventListener('pointerout', releasePointer, { passive:false });
  window.addEventListener('keydown', onKeyDown, { passive:false });
  window.addEventListener('keyup', event => keys.delete(event.key), { passive:false });
  window.addEventListener('blur', resetInput);
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
  document.addEventListener('visibilitychange', () => { resetInput(); if (!document.hidden) lastFrame = performance.now(); });

  resizeCanvas();
  function frame(timestamp) {
    const dt = lastFrame ? Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000)) : 0;
    lastFrame = timestamp;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
})();
