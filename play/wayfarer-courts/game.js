(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const audioGate = document.getElementById('audioGate');
  const rotateCover = document.getElementById('rotate');
  const beginButton = document.getElementById('begin');
  const W = 390;
  const H = 700;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'wayfarer-courts-v1';
  const MAX_PARTICLES = 110;
  const MAX_TEXTS = 28;
  const MAX_TIMERS = 32;
  const colors = {
    ink: '#11172a', ink2: '#1a2340', panel: '#202b4a', panel2: '#2c395d',
    line: '#60709a', cream: '#f5f0df', dim: '#aeb8d2', gold: '#f2c15a',
    mint: '#79e0c0', pink: '#f18b9f', sky: '#8dc9f4', orange: '#f49a5d',
    red: '#e46d7b', green: '#86d78f'
  };

  const pets = [
    { id: 'pebblewink', name: 'Pebblewink', glyph: '◈', color: '#d89c6a', maxHp: 54, atk: 9, def: 2, passive: 'Stonewarm', passiveText: '+8 max party HP' },
    { id: 'brinebell', name: 'Brinebell', glyph: '◌', color: '#6db9df', maxHp: 48, atk: 8, def: 3, passive: 'Tidecall', passiveText: '+8% catch odds' },
    { id: 'flickeroot', name: 'Flickeroot', glyph: '✦', color: '#ed9a58', maxHp: 42, atk: 12, def: 1, passive: 'Kindle', passiveText: '+2 party attack' },
    { id: 'mothmoss', name: 'Mothmoss', glyph: '⌁', color: '#a9c879', maxHp: 50, atk: 7, def: 4, passive: 'Softstep', passiveText: '12% back-row evade' },
    { id: 'gloomlet', name: 'Gloomlet', glyph: '☾', color: '#a990d7', maxHp: 45, atk: 10, def: 2, passive: 'Duskwink', passiveText: '+4% catch odds' },
    { id: 'thimblehorn', name: 'Thimblehorn', glyph: '♢', color: '#e2cc7a', maxHp: 60, atk: 8, def: 5, passive: 'Buttonhide', passiveText: '+2 party defense' },
    { id: 'cloudpup', name: 'Cloudpup', glyph: '☁', color: '#a7d9e8', maxHp: 46, atk: 9, def: 2, passive: 'Driftstep', passiveText: 'heal 3 after each fight' },
    { id: 'emberfin', name: 'Emberfin', glyph: '❖', color: '#ee7665', maxHp: 40, atk: 14, def: 1, passive: 'Brightbite', passiveText: '+5 party attack' }
  ];
  const companions = [
    { name: 'Mira', title: 'field mender', glyph: '+', color: colors.mint, baseMax: 66, atk: 10, def: 4, row: 'back', skill: 'heal' },
    { name: 'Rook', title: 'road striker', glyph: '/', color: colors.orange, baseMax: 74, atk: 13, def: 3, row: 'front', skill: 'strike' },
    { name: 'Pax', title: 'quiet ward', glyph: '◐', color: colors.sky, baseMax: 70, atk: 9, def: 6, row: 'back', skill: 'ward' }
  ];
  const courts = [
    { name: 'The Cinder Bench', judge: 'Veyra Ashglass', glyph: '△', color: '#e98861', hp: 142, atk: 17, def: 5, line: 'A verdict can be a doorway.' },
    { name: 'The Moonwell Bench', judge: 'Orren Vell', glyph: '○', color: '#a58bdf', hp: 176, atk: 20, def: 7, line: 'The quiet road still remembers.' },
    { name: 'The Greenwake Bench', judge: 'Seln of the Reeds', glyph: '✧', color: '#73c991', hp: 214, atk: 23, def: 9, line: 'Bring us a kinder ending.' }
  ];
  const actPlans = [
    [['start', 'start', 'start'], ['fight', 'spring', 'fight'], ['merchant', 'fight', 'spring'], ['fight', 'merchant', 'fight'], ['court', 'court', 'court']],
    [['start', 'start', 'start'], ['spring', 'fight', 'merchant'], ['fight', 'merchant', 'spring'], ['merchant', 'fight', 'fight'], ['court', 'court', 'court']],
    [['start', 'start', 'start'], ['fight', 'merchant', 'spring'], ['fight', 'fight', 'merchant'], ['spring', 'fight', 'merchant'], ['court', 'court', 'court']]
  ];
  const stars = Array.from({ length: 42 }, (_, i) => ({ x: (i * 83) % W, y: 105 + ((i * 47) % 565), r: i % 7 === 0 ? 1.8 : 1, a: .2 + (i % 5) * .08 }));
  const input = {
    pointers: new Map(),
    controlPointers: new Map(),
    keys: new Set(),
    queuedAction: null,
    stick: { x: 0, y: 0 }
  };
  const game = {
    screen: 'map', running: false, orientationBlocked: false, orientationStarted: 0, elapsed: 0, runStart: 0,
    act: 0, mapCol: 0, mapLane: 1, score: 0, courtsBeaten: 0, wildCursor: 0,
    luckyBonus: false, rationBonus: false,
    owned: [], activePet: null, party: [], map: [], battle: null,
    particles: [], texts: [], shake: 0, flash: 0, message: 'Choose a glowing road node.', messageTimer: 4,
    pendingTimers: new Set(), best: { courts: 0, pets: 0, score: 0 }
  };
  let view = { cssW: W, cssH: H, pixelScale: 1, x: 0, y: 0, fit: 1 };
  let audioContext = null;
  let audioUnlocked = false;
  let lastFrame = performance.now();

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function intIn(n, min, max, fallback) { return Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max ? n : fallback; }
  function numIn(n, min, max, fallback) { return Number.isFinite(n) && n >= min && n <= max ? n : fallback; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pushCapped(arr, value, max) { arr.push(value); if (arr.length > max) arr.splice(0, arr.length - max); }
  function petById(id) { return pets.find(p => p.id === id) || null; }
  function activePassive() { return game.owned.filter(id => id !== game.activePet).map(petById).filter(Boolean); }
  function partyBonuses() {
    const passives = activePassive();
    return {
      maxHp: passives.filter(p => p.id === 'pebblewink').length * 8,
      atk: passives.filter(p => p.id === 'flickeroot').length * 2 + passives.filter(p => p.id === 'emberfin').length * 5,
      def: passives.filter(p => p.id === 'thimblehorn').length * 2,
      catchOdds: passives.filter(p => p.id === 'brinebell').length * .08 + passives.filter(p => p.id === 'gloomlet').length * .04,
      evade: passives.some(p => p.id === 'mothmoss'),
      cloudHeal: passives.some(p => p.id === 'cloudpup')
    };
  }
  function applyPartyBonuses(healDelta) {
    const bonus = partyBonuses();
    game.party.forEach(member => {
      const oldMax = member.maxHp || member.baseMax;
      member.maxHp = member.baseMax + bonus.maxHp;
      if (healDelta) member.hp = clamp(member.hp + (member.maxHp - oldMax) + healDelta, 0, member.maxHp);
      else member.hp = clamp(member.hp, 0, member.maxHp);
    });
  }
  function storageGet(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } }
  function storageSet(key, value) { try { window.localStorage.setItem(key, value); } catch (_) {} }
  function storageRemove(key) { try { window.localStorage.removeItem(key); } catch (_) {} }

  function clearInput() {
    for (const pointerId of input.pointers.keys()) {
      try { canvas.releasePointerCapture(pointerId); } catch (_) {}
    }
    input.pointers.clear();
    input.controlPointers.clear();
    input.keys.clear();
    input.queuedAction = null;
    input.stick.x = 0;
    input.stick.y = 0;
  }
  function clearAllTimers() {
    for (const id of inputTimers()) window.clearTimeout(id);
    game.pendingTimers.clear();
  }
  function inputTimers() { return Array.from(game.pendingTimers).slice(0, MAX_TIMERS); }
  function schedule(fn, delay) {
    if (game.pendingTimers.size >= MAX_TIMERS) return 0;
    let id = 0;
    const wrapped = () => {
      game.pendingTimers.delete(id);
      if (game.orientationBlocked || document.hidden) { schedule(fn, 120); return; }
      fn();
    };
    id = window.setTimeout(wrapped, clamp(delay, 0, 5000));
    game.pendingTimers.add(id);
    return id;
  }
  function resetRun() {
    clearInput();
    clearAllTimers();
    game.screen = 'map';
    game.elapsed = 0;
    game.runStart = performance.now();
    game.act = 0;
    game.mapCol = 0;
    game.mapLane = 1;
    game.score = 0;
    game.courtsBeaten = 0;
    game.wildCursor = 0;
    game.owned = [];
    game.activePet = null;
    game.luckyBonus = false;
    game.rationBonus = false;
    game.battle = null;
    game.orientationStarted = game.orientationBlocked ? performance.now() : 0;
    game.particles.length = 0;
    game.texts.length = 0;
    game.shake = 0;
    game.flash = 0;
    game.best = readBest();
    game.party = makeParty();
    buildMap();
    setMessage('Choose a glowing road node.', 4);
    saveGame();
  }
  function makeParty() {
    const bonus = partyBonuses();
    const base = [{ name: 'You', title: 'wayfarer', glyph: '◆', color: colors.gold, baseMax: 82, atk: 15, def: 4, row: 'front', skill: 'hero' }].concat(companions);
    return base.map(member => {
      const baseMax = member.baseMax + (game.rationBonus ? 18 : 0);
      return { ...member, baseMax, maxHp: baseMax + bonus.maxHp, hp: baseMax + bonus.maxHp, guarding: false, turns: 0 };
    });
  }
  function buildMap() {
    game.map = [];
    const plan = actPlans[clamp(game.act, 0, 2)];
    for (let col = 0; col < plan.length; col++) for (let lane = 0; lane < 3; lane++) {
      pushCapped(game.map, { col, lane, type: plan[col][lane] }, 30);
    }
  }
  function readBest() {
    const raw = storageGet(SAVE_KEY + ':best');
    if (typeof raw !== 'string' || !raw) return { courts: 0, pets: 0, score: 0 };
    let data;
    try { data = JSON.parse(raw); } catch (_) { return { courts: 0, pets: 0, score: 0 }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { courts: 0, pets: 0, score: 0 };
    return {
      courts: intIn(data.courts, 0, 3, 0),
      pets: intIn(data.pets, 0, pets.length, 0),
      score: intIn(data.score, 0, 9999999, 0)
    };
  }
  function saveBest() {
    game.best = {
      courts: Math.max(game.best.courts, game.courtsBeaten),
      pets: Math.max(game.best.pets, game.owned.length),
      score: Math.max(game.best.score, Math.floor(game.score))
    };
    storageSet(SAVE_KEY + ':best', JSON.stringify(game.best));
  }
  function saveGame() {
    saveBest();
    const data = {
      v: 1, act: game.act, mapCol: game.mapCol, mapLane: game.mapLane, score: Math.floor(game.score),
      courtsBeaten: game.courtsBeaten, wildCursor: game.wildCursor, owned: game.owned.slice(0, pets.length),
      activePet: game.activePet, luckyBonus: game.luckyBonus, rationBonus: game.rationBonus,
      elapsed: Number.isFinite(game.elapsed) ? game.elapsed : 0,
      hp: game.party.map(p => Math.round(p.hp))
    };
    storageSet(SAVE_KEY, JSON.stringify(data));
  }
  function loadGame() {
    const raw = storageGet(SAVE_KEY);
    if (typeof raw !== 'string' || !raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch (_) { return false; }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.v !== 1) return false;
    const ids = Array.isArray(data.owned) ? data.owned.filter(id => typeof id === 'string' && !!petById(id)).slice(0, pets.length) : [];
    game.act = intIn(data.act, 0, 2, 0);
    game.mapCol = intIn(data.mapCol, 0, 4, 0);
    game.mapLane = intIn(data.mapLane, 0, 2, 1);
    game.score = intIn(data.score, 0, 9999999, 0);
    game.courtsBeaten = intIn(data.courtsBeaten, 0, 3, game.act);
    game.wildCursor = intIn(data.wildCursor, 0, 9999, 0);
    game.owned = Array.from(new Set(ids));
    game.activePet = typeof data.activePet === 'string' && game.owned.includes(data.activePet) ? data.activePet : (game.owned[0] || null);
    game.luckyBonus = data.luckyBonus === true;
    game.rationBonus = data.rationBonus === true;
    game.elapsed = numIn(data.elapsed, 0, 864000, 0);
    buildMap();
    game.party = makeParty();
    if (Array.isArray(data.hp)) data.hp.slice(0, game.party.length).forEach((hp, i) => { game.party[i].hp = numIn(hp, 0, game.party[i].maxHp, game.party[i].maxHp); });
    game.runStart = performance.now() - game.elapsed * 1000;
    game.orientationStarted = game.orientationBlocked ? performance.now() : 0;
    game.screen = 'map';
    setMessage(game.owned.length ? 'Your road remembers. Choose a glowing node.' : 'Choose a glowing road node.', 4);
    return true;
  }
  function setMessage(text, seconds) { game.message = text; game.messageTimer = seconds || 3; }
  function unlockAudio() {
    if (!audioContext) {
      try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioContext = null; }
    }
    if (audioContext) { try { audioContext.resume(); } catch (_) {} }
    audioUnlocked = true;
    audioGate.hidden = true;
    game.running = true;
    if (!game.runStart) game.runStart = performance.now();
    sound('start');
  }
  function sound(kind) {
    if (!audioUnlocked || !audioContext) return;
    const settings = { hit: [160, .07, 'square'], catch: [620, .16, 'sine'], heal: [390, .12, 'triangle'], start: [240, .16, 'triangle'], win: [520, .3, 'sine'], fail: [90, .18, 'sawtooth'] }[kind];
    if (!settings) return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = settings[2]; osc.frequency.value = settings[0]; gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.045, audioContext.currentTime + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + settings[1]);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + settings[1] + .02);
    } catch (_) {}
  }
  function resize() {
    view.cssW = Math.max(1, window.innerWidth);
    view.cssH = Math.max(1, window.innerHeight);
    view.pixelScale = Math.min(2, 960 / Math.max(view.cssW, view.cssH));
    canvas.width = Math.max(1, Math.round(view.cssW * view.pixelScale));
    canvas.height = Math.max(1, Math.round(view.cssH * view.pixelScale));
    view.fit = Math.min(view.cssW / W, view.cssH / H);
    view.x = (view.cssW - W * view.fit) / 2;
    view.y = (view.cssH - H * view.fit) / 2;
    updateOrientation();
  }
  function updateOrientation() {
    const wasBlocked = game.orientationBlocked;
    const blocked = window.innerWidth > window.innerHeight;
    if (blocked && !game.orientationBlocked) game.orientationStarted = performance.now();
    if (!blocked && game.orientationBlocked && game.orientationStarted) {
      game.runStart += performance.now() - game.orientationStarted;
      game.orientationStarted = 0;
    }
    game.orientationBlocked = blocked;
    rotateCover.hidden = !blocked;
    if (blocked !== wasBlocked) clearInput();
  }
  function rr(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function text(str, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = color || colors.cream; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
  }
  function bar(x, y, w, h, value, color) {
    rr(x, y, w, h, h / 2, colors.ink);
    rr(x, y, w * clamp(value, 0, 1), h, h / 2, color);
  }
  function drawBackground() {
    ctx.fillStyle = colors.ink; ctx.fillRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#1a2340'); grad.addColorStop(.55, '#111a32'); grad.addColorStop(1, '#0c1224'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    stars.forEach(s => { ctx.globalAlpha = s.a * (.75 + .25 * Math.sin(game.elapsed * 1.4 + s.x)); ctx.fillStyle = colors.cream; ctx.fillRect(s.x, s.y, s.r, s.r); }); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#32405f44'; ctx.lineWidth = 1;
    for (let y = 115; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  function drawTop(kicker) {
    text('WAYFARER COURTS', 18, 22, 15, colors.cream, 'left', 900);
    text(kicker, 18, 43, 11, colors.dim, 'left', 700);
    text(`SCORE ${String(Math.floor(game.score)).padStart(5, '0')}`, 372, 21, 11, colors.gold, 'right', 800);
    text(`RUN ${formatTime(game.elapsed)}`, 372, 42, 11, colors.dim, 'right', 700);
    ctx.strokeStyle = colors.line; ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(18, 60); ctx.lineTo(372, 60); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function formatTime(seconds) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function nodePos(col, lane) { return { x: 60 + lane * 135, y: 152 + col * 84 }; }
  function typeName(type) { return ({ fight: 'SKIRMISH', spring: 'SPRING', merchant: 'WAYSTALL', court: 'TRIAL', start: 'CAMP' })[type] || type; }
  function nodeColor(type) { return ({ fight: colors.pink, spring: colors.mint, merchant: colors.gold, court: colors.orange, start: colors.sky })[type] || colors.cream; }
  function drawPartyStrip(y) {
    game.party.forEach((member, i) => {
      const x = 16 + i * 91;
      rr(x, y, 82, 42, 10, colors.panel, i === 0 ? colors.gold : colors.line);
      text(member.glyph, x + 14, y + 20, 17, member.color, 'center', 800);
      text(member.name, x + 28, y + 13, 10, member.hp > 0 ? colors.cream : colors.red, 'left', 800);
      bar(x + 28, y + 25, 43, 5, member.hp / member.maxHp, member.hp > member.maxHp * .3 ? colors.mint : colors.red);
    });
  }
  function drawMap() {
    drawTop(`ACT ${game.act + 1} · ${['EMBERMARCH', 'MOONBRIDGE', 'GREENWAKE'][game.act]}`);
    drawPartyStrip(71);
    text(game.owned.length ? `${game.owned.length}/8 spirits · active ${petById(game.activePet)?.name || 'none'}` : 'No spirit-pet bonded yet', 18, 130, 11, colors.dim, 'left', 700);
    text('CHOOSE YOUR NEXT NODE', 372, 130, 10, colors.gold, 'right', 800);
    for (let col = 0; col < 4; col++) for (let lane = 0; lane < 3; lane++) {
      const a = nodePos(col, lane); const next = nodePos(col + 1, lane);
      ctx.strokeStyle = col < game.mapCol ? '#60709a66' : '#53648766'; ctx.lineWidth = col === game.mapCol ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    }
    for (const n of game.map) {
      const p = nodePos(n.col, n.lane); const isCurrent = n.col === game.mapCol && n.lane === game.mapLane; const available = n.col === game.mapCol + 1; const past = n.col < game.mapCol;
      const active = isCurrent || available;
      ctx.globalAlpha = past ? .34 : 1;
      if (active) { ctx.shadowBlur = 16; ctx.shadowColor = nodeColor(n.type); }
      ctx.fillStyle = active ? colors.panel2 : colors.panel; ctx.beginPath(); ctx.arc(p.x, p.y, isCurrent ? 28 : 24, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = isCurrent ? colors.gold : active ? nodeColor(n.type) : colors.line; ctx.lineWidth = isCurrent ? 3 : 1; ctx.stroke();
      text(n.type === 'court' ? courts[game.act].glyph : ({ fight: '!', spring: '+', merchant: '¤', start: '•' }[n.type] || '?'), p.x, p.y - 3, 19, nodeColor(n.type), 'center', 900);
      text(typeName(n.type), p.x, p.y + 39, 8, active ? colors.cream : colors.dim, 'center', 800);
      ctx.globalAlpha = 1;
    }
    rr(18, 598, 354, 38, 12, '#15203a', colors.line);
    text(game.messageTimer > 0 ? game.message : 'Tap a glowing node to move.', 195, 617, 11, colors.cream, 'center', 700);
    text('1–4 battle commands · tap party cards to swap rows', 195, 664, 10, colors.dim, 'center', 600);
    drawButton('NEW RUN', 284, 86, 88, 32, 'new', colors.panel2, colors.cream, 10);
  }
  function drawButton(label, x, y, w, h, id, fill, color, size) {
    const held = Array.from(input.pointers.values()).some(c => c === id);
    rr(x, y + (held ? 2 : 0), w, h, 10, fill, held ? colors.gold : colors.line);
    text(label, x + w / 2, y + h / 2 + (held ? 2 : 0), size || 13, color || colors.cream, 'center', 850);
  }
  function drawBattle() {
    const b = game.battle; const enemy = b.enemy;
    drawTop(b.kind === 'court' ? `TRIAL ${game.courtsBeaten + 1}/3 · ${courts[game.act].name.toUpperCase()}` : 'WILD ROAD · SPIRIT SIGHTED');
    rr(18, 74, 354, 151, 16, '#17223e', enemy.color);
    text(enemy.glyph, 52, 120, 42, enemy.color, 'center', 900);
    text(enemy.name, 84, 101, 18, colors.cream, 'left', 900);
    text(enemy.subtitle, 84, 124, 10, colors.dim, 'left', 650);
    bar(84, 151, 260, 13, enemy.hp / enemy.maxHp, enemy.color);
    text(`${Math.max(0, Math.ceil(enemy.hp))} / ${enemy.maxHp} VITAL`, 84, 180, 10, colors.dim, 'left', 700);
    if (b.kind === 'wild') text(`CATCH ODDS ${Math.round(catchOdds() * 100)}%`, 344, 180, 10, colors.gold, 'right', 850);
    else text('COURT BANNER · NO CATCH', 344, 180, 10, colors.orange, 'right', 800);
    text(b.phase === 'player' ? 'YOUR TURN' : b.phase === 'allies' ? 'YOUR COMPANY MOVES' : b.phase === 'enemy' ? 'THE ROAD ANSWERS' : 'TURNING TIDE', 195, 242, 11, b.phase === 'player' ? colors.gold : colors.dim, 'center', 850);
    drawCombatRows();
    const disabled = b.phase !== 'player';
    drawButton('1  STRIKE', 18, 494, 168, 52, 'attack', disabled ? '#26304b' : '#314064', disabled ? '#7d88a6' : colors.cream, 13);
    drawButton('2  ART', 204, 494, 168, 52, 'art', disabled ? '#26304b' : '#49355c', disabled ? '#7d88a6' : colors.pink, 13);
    drawButton('3  GUARD', 18, 554, 168, 52, 'defend', disabled ? '#26304b' : '#274b55', disabled ? '#7d88a6' : colors.mint, 13);
    drawButton(b.kind === 'wild' ? `4  CATCH ${Math.round(catchOdds() * 100)}%` : '4  APPEAL', 204, 554, 168, 52, 'catch', disabled ? '#26304b' : '#55452a', disabled ? '#7d88a6' : colors.gold, 12);
    rr(18, 621, 354, 37, 11, '#15203a', colors.line);
    text(game.messageTimer > 0 ? game.message : 'Choose a command.', 195, 639, 10, colors.cream, 'center', 700);
    text('Tap a party card to move it front/back.', 195, 680, 9, colors.dim, 'center', 600);
  }
  function drawCombatRows() {
    const alive = game.party.filter(p => p.hp > 0);
    const front = game.party.filter(p => p.row === 'front');
    const back = game.party.filter(p => p.row === 'back');
    text('FRONT', 18, 271, 9, colors.orange, 'left', 800); text('BACK', 18, 350, 9, colors.sky, 'left', 800);
    drawMemberRow(front, 282); drawMemberRow(back, 361);
    if (!alive.length) text('THE COMPANY HAS FALLEN', 195, 325, 13, colors.red, 'center', 900);
  }
  function drawMemberRow(members, y) {
    members.forEach(member => {
      const i = game.party.indexOf(member); const x = 42 + i * 85;
      rr(x, y, 76, 58, 10, member.hp > 0 ? colors.panel : '#271f32', member.hp > 0 ? member.color : colors.red);
      text(member.glyph, x + 14, y + 28, 17, member.color, 'center', 900);
      text(member.name, x + 29, y + 16, 10, member.hp > 0 ? colors.cream : colors.red, 'left', 850);
      bar(x + 29, y + 29, 37, 6, member.hp / member.maxHp, member.hp > member.maxHp * .3 ? colors.mint : colors.red);
      text(`${Math.ceil(member.hp)}`, x + 29, y + 46, 9, colors.dim, 'left', 700);
    });
  }
  function drawUtility(kind) {
    drawTop(kind === 'spring' ? 'QUIET SPRING · TAKE A BREATH' : 'WAYSTALL · EVERYTHING IS PLAY-EARNED');
    drawPartyStrip(80);
    if (kind === 'spring') {
      text('A spring remembers every tired traveler.', 195, 190, 17, colors.mint, 'center', 850);
      text('Restore 28 vitality to everyone. No price. No timer.', 195, 220, 11, colors.dim, 'center', 600);
      rr(38, 274, 314, 120, 18, '#21494e', colors.mint);
      text('+  SPRINGWATER  +', 195, 311, 17, colors.cream, 'center', 900);
      text('a small kindness, carried forward', 195, 344, 11, colors.dim, 'center', 650);
      drawButton('DRINK & CONTINUE', 58, 448, 274, 56, 'utility', colors.mint, colors.ink, 13);
    } else {
      text('Choose one road gift. Keep it forever.', 195, 180, 17, colors.gold, 'center', 850);
      drawChoice('LUCKY LATTICE', '+10% catch odds', 'lucky', 238, colors.gold);
      drawChoice('TRAIL RATION', '+18 max party HP', 'ration', 354, colors.mint);
    }
    rr(18, 598, 354, 38, 12, '#15203a', colors.line);
    text('Tap a gift to return to the map.', 195, 617, 11, colors.cream, 'center', 700);
    text('Free choices shape the road.', 195, 664, 10, colors.dim, 'center', 600);
  }
  function drawChoice(label, detail, id, y, color) {
    const held = Array.from(input.pointers.values()).some(c => c === id);
    rr(30, y + (held ? 2 : 0), 330, 92, 16, colors.panel, held ? colors.gold : color);
    text(label, 54, y + 30, 15, color, 'left', 900);
    text(detail, 54, y + 59, 11, colors.cream, 'left', 650);
    text('›', 332, y + 45, 27, colors.cream, 'center', 400);
  }
  function drawEnd(kind) {
    drawTop(kind === 'win' ? 'THE THREE BENCHES HAVE OPENED' : 'THE ROAD KNOCKED YOU DOWN');
    const win = kind === 'win';
    ctx.globalAlpha = .16; ctx.fillStyle = win ? colors.mint : colors.red; ctx.beginPath(); ctx.arc(195, 245, 118 + Math.sin(game.elapsed * 2) * 6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    text(win ? '✧' : '×', 195, 220, 78, win ? colors.gold : colors.red, 'center', 900);
    text(win ? 'THE ROAD REMAINS' : 'THE ROAD REMAINS', 195, 310, 24, colors.cream, 'center', 900);
    text(win ? 'Three rivals yielded. Your company is still kind.' : 'A wipe only costs a moment. Retry the node.', 195, 345, 11, colors.dim, 'center', 650);
    text(`Courts ${game.courtsBeaten}/3  ·  Spirits ${game.owned.length}/8`, 195, 390, 13, colors.gold, 'center', 800);
    text(`Score ${Math.floor(game.score)}  ·  Run ${formatTime(game.elapsed)}`, 195, 418, 11, colors.cream, 'center', 700);
    text(`Best ${game.best.courts} courts  ·  ${game.best.pets} spirits  ·  ${game.best.score} score`, 195, 446, 10, colors.dim, 'center', 600);
    drawButton(win ? 'BEGIN A NEW ROAD' : 'RETRY NODE', 55, 500, 280, 56, win ? 'restart' : 'retry', win ? colors.mint : colors.red, colors.ink, 13);
    drawButton('NEW RUN', 120, 572, 150, 42, 'restart', colors.panel2, colors.cream, 11);
    text('Keyboard: R restarts · 1–4 choose battle commands', 195, 664, 10, colors.dim, 'center', 600);
  }
  function render() {
    ctx.setTransform(view.pixelScale, 0, 0, view.pixelScale, 0, 0);
    ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, view.cssW, view.cssH);
    const sx = game.shake ? (Math.random() - .5) * game.shake : 0;
    const sy = game.shake ? (Math.random() - .5) * game.shake : 0;
    ctx.save(); ctx.translate(view.x + sx, view.y + sy); ctx.scale(view.fit, view.fit);
    drawBackground();
    if (game.screen === 'map') drawMap();
    else if (game.screen === 'battle') drawBattle();
    else if (game.screen === 'spring' || game.screen === 'merchant') drawUtility(game.screen);
    else drawEnd(game.screen);
    drawParticles(); drawTexts();
    if (game.flash > 0) { ctx.globalAlpha = clamp(game.flash / .18, 0, .45); ctx.fillStyle = colors.cream; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.restore();
  }
  function drawParticles() {
    for (const p of game.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life / p.max), 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawTexts() { for (const t of game.texts) { ctx.globalAlpha = clamp(t.life / t.max, 0, 1); text(t.value, t.x, t.y, t.size, t.color, 'center', 900); } ctx.globalAlpha = 1; }
  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) pushCapped(game.particles, { x, y, vx: (Math.random() - .5) * 130, vy: (Math.random() - .5) * 130, size: 2 + Math.random() * 4, life: .45 + Math.random() * .35, max: .8, color }, MAX_PARTICLES);
  }
  function floatText(value, x, y, color) { pushCapped(game.texts, { value, x, y, size: 15, life: .8, max: .8, color }, MAX_TEXTS); }
  function update(dt) {
    if (!game.running || game.orientationBlocked || document.hidden) return;
    if (game.screen !== 'win' && game.screen !== 'wipe') game.elapsed += dt;
    game.messageTimer = Math.max(0, game.messageTimer - dt);
    game.shake = Math.max(0, game.shake - dt * 28);
    game.flash = Math.max(0, game.flash - dt);
    for (let i = game.particles.length - 1; i >= 0; i--) { const p = game.particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; if (p.life <= 0) game.particles.splice(i, 1); }
    for (let i = game.texts.length - 1; i >= 0; i--) { const t = game.texts[i]; t.life -= dt; t.y -= 22 * dt; if (t.life <= 0) game.texts.splice(i, 1); }
    if (input.queuedAction) { const action = input.queuedAction; input.queuedAction = null; handleAction(action); }
  }
  function catchOdds() {
    if (!game.battle || game.battle.kind !== 'wild') return 0;
    const e = game.battle.enemy; const weakened = 1 - e.hp / e.maxHp;
    return clamp(.06 + weakened * .72 + partyBonuses().catchOdds + (game.battle.lucky ? .1 : 0), .05, .94);
  }
  function mapAction(type, lane) { input.queuedAction = { type, lane }; }
  function handleAction(action) {
    if (!action) return;
    if (action.type === 'new') { resetRun(); game.running = true; return; }
    if (action.type === 'restart') { resetRun(); game.running = true; return; }
    if (action.type === 'retry') { retryNode(); return; }
    if (action.type === 'row') { toggleRow(action.index); return; }
    if (action.type === 'node') { selectNode(action.lane); return; }
    if (action.type === 'spring') { useSpring(); return; }
    if (action.type === 'lucky' || action.type === 'ration') { takeGift(action.type); return; }
    if (['attack', 'art', 'defend', 'catch'].includes(action.type)) { combatAction(action.type); return; }
  }
  function selectNode(lane) {
    if (game.screen !== 'map' || lane < 0 || lane > 2 || game.mapCol >= 4) return;
    const node = game.map.find(n => n.col === game.mapCol + 1 && n.lane === lane);
    if (!node) return;
    clearInput();
    game.mapLane = lane; game.mapCol++;
    spawnBurst(nodePos(game.mapCol, lane).x, nodePos(game.mapCol, lane).y, nodeColor(node.type), 16);
    setMessage(`${typeName(node.type)}: ${node.type === 'fight' ? 'something stirs' : 'step closer'}.`, 2);
    resolveNode(node.type);
    saveGame();
  }
  function resolveNode(type) {
    if (type === 'fight') startBattle('wild');
    else if (type === 'court') startBattle('court');
    else if (type === 'spring' || type === 'merchant') game.screen = type;
  }
  function useSpring() {
    if (game.screen !== 'spring') return;
    game.party.forEach(p => { p.hp = clamp(p.hp + 28, 0, p.maxHp); p.guarding = false; });
    game.score += 25; game.screen = 'map'; setMessage('The spring fills every cup. Onward.', 3); spawnBurst(195, 330, colors.mint, 24); sound('heal'); saveGame();
  }
  function takeGift(kind) {
    if (game.screen !== 'merchant') return;
    if (kind === 'lucky') game.luckyBonus = true;
    if (kind === 'ration') { game.rationBonus = true; applyPartyBonuses(18); }
    game.score += 40; game.battle = null; game.screen = 'map'; setMessage(kind === 'lucky' ? 'The lucky lattice hums. Catch odds rise.' : 'The trail ration is shared. Everyone stands taller.', 3); spawnBurst(195, 330, kind === 'lucky' ? colors.gold : colors.mint, 20); saveGame();
  }
  function toggleRow(index) {
    if (game.screen !== 'battle' || !game.party[index] || game.party[index].hp <= 0 || game.battle.phase !== 'player') return;
    game.party[index].row = game.party[index].row === 'front' ? 'back' : 'front';
    setMessage(`${game.party[index].name} moves to the ${game.party[index].row} row.`, 2); spawnBurst(60 + index * 85, game.party[index].row === 'front' ? 310 : 389, game.party[index].color, 8); sound('heal');
  }
  function startBattle(kind, enemyOverride) {
    clearAllTimers();
    applyPartyBonuses(0);
    let enemy;
    if (enemyOverride) {
      enemy = { ...enemyOverride, hp: enemyOverride.maxHp };
    } else if (kind === 'court') {
      const c = courts[game.act]; enemy = { name: c.judge, subtitle: c.name, glyph: c.glyph, color: c.color, hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, boss: true };
    } else {
      const p = pets[game.wildCursor % pets.length]; game.wildCursor++;
      const scale = 1 + game.act * .18; const hp = Math.round(p.maxHp * scale + 22);
      enemy = { name: p.name, subtitle: `${p.passive} spirit · weaken then catch`, glyph: p.glyph, color: p.color, hp, maxHp: hp, atk: Math.round(p.atk * scale + 5), def: p.def + game.act, petId: p.id, boss: false };
    }
    game.battle = { kind, enemy, phase: 'player', turn: 1, lucky: game.luckyBonus, lastKind: kind };
    game.screen = 'battle'; setMessage(kind === 'court' ? 'A rival bench calls for your answer.' : 'Weaken the spirit. Its odds are posted.', 4); spawnBurst(195, 140, enemy.color, 18);
  }
  function combatAction(action) {
    const b = game.battle; if (game.screen !== 'battle' || !b || b.phase !== 'player') return;
    if (action === 'catch' && b.kind !== 'wild') {
      b.phase = 'allies'; applyEnemyDamage(7 + game.act * 2, colors.gold, 'APPEAL');
      if (b.enemy.hp <= 0) { winBattle(); return; }
      beginAllies(); return;
    }
    if (action === 'catch' && b.enemy.hp / b.enemy.maxHp > .82) { setMessage('Too lively to catch. Weaken it first.', 2); b.phase = 'allies'; beginAllies(); return; }
    b.phase = 'allies';
    if (action === 'attack' || action === 'art') {
      const hero = game.party[0]; const bonus = partyBonuses(); const art = action === 'art';
      const raw = hero.atk + bonus.atk + (art ? 13 : 0) + Math.floor(Math.random() * 7) - 3;
      const damage = Math.max(1, Math.round(raw * (hero.row === 'front' ? 1.1 : .92) - b.enemy.def * .25));
      applyEnemyDamage(damage, art ? colors.pink : colors.gold, art ? 'ARC ART' : 'STRIKE');
    } else if (action === 'defend') {
      game.party[0].guarding = true; setMessage('You brace the company behind a bright edge.', 2); spawnBurst(55, 310, colors.mint, 10); sound('heal');
    } else if (action === 'catch') {
      const odds = catchOdds();
      if (Math.random() < odds) { captureSpirit(); return; }
      setMessage(`The spirit slips free. ${Math.round(odds * 100)}% was not enough.`, 2); floatText('SLIPPED', 195, 156, colors.red); sound('fail');
    }
    if (b.enemy.hp <= 0) { winBattle(); return; }
    beginAllies();
  }
  function applyEnemyDamage(damage, color, label) {
    const e = game.battle.enemy; e.hp = Math.max(0, e.hp - damage); game.shake = 7; game.flash = .08; floatText(`-${damage}`, 195, 153, color); setMessage(`${label} lands for ${damage}.`, 1.6); spawnBurst(195, 153, color, 14); sound('hit');
  }
  function beginAllies() { schedule(() => allyAction(1), 260); }
  function allyAction(index) {
    const b = game.battle; if (!b || game.screen !== 'battle' || b.enemy.hp <= 0) { winBattle(); return; }
    if (index >= game.party.length) { petAction(); return; }
    const member = game.party[index];
    if (member.hp > 0) {
      if (member.skill === 'heal' && (game.party.some(p => p.hp > 0 && p.hp < p.maxHp * .62))) {
        const target = game.party.filter(p => p.hp > 0).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0]; target.hp = clamp(target.hp + 10, 0, target.maxHp); floatText('+10', 60 + game.party.indexOf(target) * 85, 310, colors.mint); setMessage(`${member.name} mends ${target.name}.`, 1.3); spawnBurst(60 + game.party.indexOf(target) * 85, 330, colors.mint, 8); sound('heal');
      } else {
        const raw = member.atk + partyBonuses().atk + Math.floor(Math.random() * 5); const damage = Math.max(1, Math.round(raw * (member.row === 'front' ? 1.08 : .9) - b.enemy.def * .2)); applyEnemyDamage(damage, member.color, member.name.toUpperCase());
      }
    }
    schedule(() => allyAction(index + 1), 210);
  }
  function petAction() {
    const p = petById(game.activePet); const b = game.battle;
    if (p && b && b.enemy.hp > 0) { const damage = Math.max(1, Math.round(p.atk + game.act * 2 - b.enemy.def * .15)); applyEnemyDamage(damage, p.color, p.name.toUpperCase()); }
    schedule(enemyTurn, 260);
  }
  function enemyTurn() {
    const b = game.battle; if (!b || game.screen !== 'battle') return;
    if (b.enemy.hp <= 0) { winBattle(); return; }
    const front = game.party.filter(p => p.hp > 0 && p.row === 'front'); const back = game.party.filter(p => p.hp > 0 && p.row === 'back'); const candidates = front.length ? front : back;
    if (!candidates.length) { wipeBattle(); return; }
    const target = pick(candidates); let damage = Math.max(1, Math.round(b.enemy.atk - target.def * .2 + Math.random() * 4));
    if (target.row === 'back' && partyBonuses().evade && Math.random() < .12) { setMessage(`${target.name} vanishes behind the mosslight.`, 1.5); floatText('EVADE', 60 + game.party.indexOf(target) * 85, 390, colors.mint); schedule(nextPlayerTurn, 350); return; }
    if (target.row === 'back') damage = Math.max(1, Math.round(damage * .84)); if (target.guarding) damage = Math.max(1, Math.round(damage * .55));
    target.hp = clamp(target.hp - damage, 0, target.maxHp); target.guarding = false; game.shake = 8; game.flash = .1; floatText(`-${damage}`, 60 + game.party.indexOf(target) * 85, target.row === 'front' ? 310 : 389, colors.red); spawnBurst(60 + game.party.indexOf(target) * 85, 330, colors.red, 12); sound('hit'); setMessage(`${b.enemy.name} strikes ${target.name} for ${damage}.`, 1.5);
    if (game.party.every(p => p.hp <= 0)) wipeBattle(); else schedule(nextPlayerTurn, 430);
  }
  function nextPlayerTurn() {
    if (!game.battle || game.screen !== 'battle') return; game.battle.phase = 'player'; game.battle.turn++; game.party.forEach(p => { p.guarding = false; p.turns++; }); if (partyBonuses().cloudHeal) game.party.forEach(p => { if (p.hp > 0) p.hp = clamp(p.hp + 3, 0, p.maxHp); }); setMessage('Your turn. The road is listening.', 2); saveGame();
  }
  function captureSpirit() {
    const b = game.battle; const id = b.enemy.petId; if (id && !game.owned.includes(id)) game.owned.push(id); if (!game.activePet) game.activePet = id; applyPartyBonuses(0); game.score += 140; b.phase = 'caught'; setMessage(`${b.enemy.name} joins the wayfarers.`, 3); floatText('CAUGHT!', 195, 153, colors.gold); spawnBurst(195, 153, colors.gold, 34); sound('catch'); saveBest(); schedule(() => finishBattle(), 650);
  }
  function winBattle() {
    const b = game.battle; if (!b || b.phase === 'won' || b.phase === 'caught') return; b.phase = 'won'; game.score += b.kind === 'court' ? 450 : 90; floatText('CLEAR', 195, 153, colors.mint); spawnBurst(195, 153, colors.mint, 26); sound('win'); schedule(() => finishBattle(), 650);
  }
  function finishBattle() {
    const b = game.battle; if (!b) return;
    if (b.kind === 'court') {
      game.courtsBeaten = Math.max(game.courtsBeaten, game.act + 1);
      if (game.act >= 2) { game.screen = 'win'; saveGame(); saveBest(); sound('win'); return; }
      game.act++; game.mapCol = 0; game.mapLane = 1; buildMap(); game.screen = 'map'; setMessage(`${courts[game.act - 1].name} yields. A new act opens.`, 4);
    } else {
      if (partyBonuses().cloudHeal) game.party.forEach(p => { if (p.hp > 0) p.hp = clamp(p.hp + 3, 0, p.maxHp); });
      game.screen = 'map'; setMessage('The road clears. Choose the next glowing node.', 3);
    }
    game.battle = null; saveGame();
  }
  function wipeBattle() { if (!game.battle) return; game.battle.phase = 'wipe'; game.screen = 'wipe'; saveBest(); sound('fail'); clearAllTimers(); setMessage('The company needs one more try.', 4); }
  function retryNode() {
    if (game.screen !== 'wipe' || !game.battle) return;
    clearInput();
    game.party.forEach(p => { p.hp = Math.max(1, Math.round(p.maxHp * .72)); p.guarding = false; });
    const kind = game.battle.kind; const enemy = { ...game.battle.enemy }; game.battle = null; game.runStart = performance.now() - game.elapsed * 1000; startBattle(kind, enemy); game.running = true;
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    return { x: (x - view.x) / view.fit, y: (y - view.y) / view.fit };
  }
  function controlAt(p) {
    if (!p || p.x < 0 || p.x > W || p.y < 0 || p.y > H) return null;
    if (game.screen === 'map') {
      if (p.x >= 284 && p.x <= 372 && p.y >= 80 && p.y <= 124) return 'new';
      if (game.mapCol < 4) for (let lane = 0; lane < 3; lane++) { const n = nodePos(game.mapCol + 1, lane); if (Math.hypot(p.x - n.x, p.y - n.y) < 34) return `node-${lane}`; }
    } else if (game.screen === 'battle') {
      if (p.y >= 494 && p.y <= 546) return p.x < 195 ? 'attack' : 'art';
      if (p.y >= 554 && p.y <= 610) return p.x < 195 ? 'defend' : 'catch';
      if (p.y >= 278 && p.y <= 425) for (let i = 0; i < game.party.length; i++) { const x = 42 + i * 85; if (p.x >= x && p.x <= x + 76) return `row-${i}`; }
    } else if (game.screen === 'spring') {
      if (p.x >= 58 && p.x <= 332 && p.y >= 448 && p.y <= 504) return 'spring';
    } else if (game.screen === 'merchant') {
      if (p.x >= 30 && p.x <= 360 && p.y >= 238 && p.y <= 330) return 'lucky';
      if (p.x >= 30 && p.x <= 360 && p.y >= 354 && p.y <= 446) return 'ration';
    } else if (game.screen === 'wipe') {
      if (p.x >= 55 && p.x <= 335 && p.y >= 500 && p.y <= 556) return 'retry';
      if (p.x >= 120 && p.x <= 270 && p.y >= 572 && p.y <= 614) return 'restart';
    } else if (game.screen === 'win') {
      if (p.x >= 55 && p.x <= 335 && p.y >= 500 && p.y <= 556) return 'restart';
      if (p.x >= 120 && p.x <= 270 && p.y >= 572 && p.y <= 614) return 'restart';
    }
    return null;
  }
  function queueControl(control) {
    if (!control) return;
    if (control.startsWith('node-')) mapAction('node', Number(control.slice(5)));
    else if (control.startsWith('row-')) mapAction('row', Number(control.slice(4)));
    else input.queuedAction = { type: control };
  }
  function pointerDown(e) {
    e.preventDefault(); if (game.orientationBlocked || document.hidden) { clearInput(); return; } const control = controlAt(pointFromEvent(e)); if (!control) return;
    if (input.pointers.size >= 16) return;
    if (input.controlPointers.has(control)) return;
    input.pointers.set(e.pointerId, control); input.controlPointers.set(control, e.pointerId);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function pointerUp(e) {
    e.preventDefault(); const control = input.pointers.get(e.pointerId); if (!control) return;
    input.pointers.delete(e.pointerId); if (input.controlPointers.get(control) === e.pointerId) input.controlPointers.delete(control);
    if (game.orientationBlocked || document.hidden) return;
    const now = controlAt(pointFromEvent(e)); if (now === control) queueControl(control);
  }
  function pointerCancel(e) {
    e.preventDefault(); const control = input.pointers.get(e.pointerId); input.pointers.delete(e.pointerId); if (control && input.controlPointers.get(control) === e.pointerId) input.controlPointers.delete(control);
  }
  function preventTouch(e) { e.preventDefault(); }
  function onKeyDown(e) {
    if (['1', '2', '3', '4', 'r', 'R', 'q', 'Q', 'e', 'E'].includes(e.key)) e.preventDefault();
    if (game.orientationBlocked || document.hidden) { clearInput(); return; }
    if (input.keys.size < 32) input.keys.add(e.key);
    if (e.repeat) return;
    if (e.key === '1') input.queuedAction = { type: 'attack' };
    if (e.key === '2') input.queuedAction = { type: 'art' };
    if (e.key === '3') input.queuedAction = { type: 'defend' };
    if (e.key === '4') input.queuedAction = { type: 'catch' };
    if (e.key === 'r' || e.key === 'R') input.queuedAction = { type: 'restart' };
    if ((e.key === 'q' || e.key === 'Q') && game.screen === 'battle') input.queuedAction = { type: 'row', index: 0 };
    if ((e.key === 'e' || e.key === 'E') && game.screen === 'battle') input.queuedAction = { type: 'row', index: 1 };
  }
  function frame(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, .05); lastFrame = now; update(dt); render(); window.requestAnimationFrame(frame);
  }

  beginButton.addEventListener('click', unlockAudio);
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerCancel, { passive: false });
  canvas.addEventListener('touchstart', preventTouch, { passive: false });
  canvas.addEventListener('touchmove', preventTouch, { passive: false });
  canvas.addEventListener('touchend', preventTouch, { passive: false });
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', e => input.keys.delete(e.key));
  window.addEventListener('blur', clearInput);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => { clearInput(); if (!document.hidden) lastFrame = performance.now(); });

  resize();
  resetRun();
  loadGame();
  game.running = false;
  window.requestAnimationFrame(frame);
})();
