(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const startScreen = document.getElementById('start-screen');
  const rotateScreen = document.getElementById('rotate-screen');
  const status = document.getElementById('sr-status');
  const startButton = document.getElementById('start-button');

  const TAU = Math.PI * 2;
  const MAX_PARTICLES = 220;
  const SAVE_KEY = 'vault-raiders-profile-v1';
  const COLORS = { ink:'#f5f0de', muted:'#9ba89e', panel:'#17231f', panel2:'#203029', line:'#596a5c', acid:'#d7f36a', orange:'#ff955e', blue:'#8ee8ff', violet:'#d4a5ff', red:'#ff6e68', gold:'#ffd36e' };
  const SYMBOLS = [
    { id:'coins', label:'COINS', icon:'¢', color:COLORS.gold, weight:52 },
    { id:'attack', label:'ATTACK', icon:'↗', color:COLORS.orange, weight:22 },
    { id:'shield', label:'SHIELD', icon:'◆', color:COLORS.blue, weight:18 },
    { id:'raid', label:'RAID', icon:'⌁', color:COLORS.violet, weight:8 }
  ];
  const BUILDINGS = [
    { name:'SENTRY', sub:'signal mast', mark:'⌁' },
    { name:'SILO', sub:'coin cache', mark:'▦' },
    { name:'HATCH', sub:'trapdoor', mark:'⌄' },
    { name:'GARDEN', sub:'glow crops', mark:'✣' },
    { name:'VAULT', sub:'core room', mark:'⬡' }
  ];
  const COSTS = [30, 70, 130];
  const BOT_NAMES = ['Pip Coil','Moss Byte','Rook Nine','Ada Bramble','Kite Fallow','Nix Puddle','Bex Quill','Odo Static','Sable Mint','Juniper Hex','Cato Latch','Mara Loop','Venn Crumb','Iris Knob','Tully Arc','Omi Flint','Zed Pollen','Cinder Rue','Ludo Finch','Vera Plink'];
  const BOT_COLORS = ['#d5f36c','#8ee8ff','#ff955e','#d4a5ff','#ffd36e'];

  let W = 390, H = 700, scale = 1, dpr = 1;
  let lastTime = 0, running = true, started = true, orientationPaused = false;
  let screenShake = 0, flash = 0;
  let particles = [];
  let timers = new Set();
  let pointers = new Map();
  let controlPointers = new Map();
  let keys = new Set();
  let profile = loadProfile();
  let state = freshState(profile.completed);

  function freshState(completed) {
    const village = Math.min(19, Math.max(0, Number.isInteger(completed) ? completed : 0));
    return {
      village,
      coins: 80,
      attack: 0,
      shields: 0,
      raids: 0,
      spins: 8,
      bestSpins: 8,
      buildings: [0,0,0,0,0],
      spinBusy: false,
      spinTime: 0,
      reels: [0,1,2],
      reelFinal: [0,1,2],
      reelStop: [0,0,0],
      message: 'Choose a build slot. A complete village climbs the ladder.',
      messageTime: 0,
      phase: 'build',
      raidState: null,
      raidLoot: 0,
      raidFound: [],
      raidPicks: 0,
      lastReward: '',
      totalRaids: 0,
      elapsed: 0,
      winBanner: 0,
      gameOver: false
    };
  }

  function loadProfile() {
    const fallback = { completed: 0, best: 0 };
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(SAVE_KEY);
      if (typeof raw !== 'string' || raw.length > 1000) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      const completed = Number(parsed.completed);
      const best = Number(parsed.best);
      return {
        completed: Number.isInteger(completed) ? Math.max(0, Math.min(20, completed)) : 0,
        best: Number.isFinite(best) ? Math.max(0, Math.min(999999, best)) : 0
      };
    } catch (_) { return fallback; }
  }

  function saveProfile() {
    try {
      if (typeof localStorage === 'undefined') return;
      const safe = {
        completed: Number.isInteger(profile.completed) ? Math.max(0, Math.min(20, profile.completed)) : 0,
        best: Number.isFinite(profile.best) ? Math.max(0, Math.min(999999, profile.best)) : 0
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(safe));
    } catch (_) { /* private mode and blocked storage are valid play modes */ }
  }

  function schedule(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }

  function resetInput() {
    pointers.clear();
    controlPointers.clear();
    keys.clear();
  }

  function restart(village = state.village) {
    clearTimers();
    resetInput();
    particles.length = 0;
    state = freshState(village);
    state.message = 'New vault loaded. Spin, build, and raid for more spins.';
    state.messageTime = 3.5;
    screenShake = 0;
    flash = 0;
    announce('New village started.');
  }

  function begin() {
    started = true;
    startScreen.hidden = true;
    unlockAudio();
    announce('Game started. Build your first village.');
  }

  function unlockAudio() {
    try {
      if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
    } catch (_) { /* audio is a flourish, not a dependency */ }
  }

  const audio = {
    ctx: null,
    beep(freq, duration, type='sine', volume=.035) {
      try {
        unlockAudio();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
      } catch (_) {}
    },
    spin() { this.beep(190, .08, 'square', .025); },
    coin() { this.beep(520, .1, 'triangle', .04); schedule(() => this.beep(780, .1, 'triangle', .03), 55); },
    hit() { this.beep(100, .14, 'sawtooth', .045); },
    good() { this.beep(420, .12, 'sine', .045); schedule(() => this.beep(630, .18, 'sine', .04), 70); }
  };

  function announce(text) {
    status.textContent = text;
  }

  function weightedSymbol() {
    let roll = Math.random() * 100;
    for (let i = 0; i < SYMBOLS.length; i++) {
      roll -= SYMBOLS[i].weight;
      if (roll <= 0) return i;
    }
    return SYMBOLS.length - 1;
  }

  function spin() {
    if (!started || orientationPaused || state.spinBusy || state.phase !== 'build' || state.gameOver) return;
    if (state.spins <= 0) setMessage('Rack empty — emergency spins are free until a raid refills it.', 3);
    else state.spins--;
    state.bestSpins = Math.max(0, state.spins);
    state.spinBusy = true;
    state.spinTime = 0;
    state.reelFinal = [weightedSymbol(), weightedSymbol(), weightedSymbol()];
    state.reelStop = [0.37, 0.53, 0.69];
    state.lastReward = '';
    audio.spin();
    for (let i = 0; i < 12; i++) burst(W * .5 + (Math.random()-.5)*80, 196, SYMBOLS[state.reelFinal[i%3]].color, 1);
    announce('Reels spinning.');
  }

  function resolveSpin() {
    const tally = { coins:0, attack:0, shield:0, raid:0 };
    state.reelFinal.forEach((index) => { tally[SYMBOLS[index].id]++; });
    const rewards = [];
    if (tally.coins) { const amount = tally.coins * 12; state.coins += amount; rewards.push('+' + amount + ' coins'); }
    if (tally.attack) { state.attack += tally.attack; rewards.push('+' + tally.attack + ' attack'); }
    if (tally.shield) { state.shields += tally.shield; rewards.push('+' + tally.shield + ' shield'); }
    if (tally.raid) { state.raids += tally.raid; rewards.push('+' + tally.raid + ' raid'); }
    state.lastReward = rewards.join('  •  ');
    state.spinBusy = false;
    state.messageTime = 4;
    setMessage(state.lastReward + '. Build or raid.', 4);
    audio.coin();
    burst(W * .5, 220, COLORS.acid, 22);
    bump(3);
  }

  function setMessage(text, time=3) {
    state.message = text;
    state.messageTime = time;
    announce(text);
  }

  function buildingCost(slot) {
    const tier = state.buildings[slot];
    return COSTS[tier] || 0;
  }

  function build(slot) {
    if (!started || orientationPaused || state.phase !== 'build' || state.spinBusy || state.gameOver) return;
    if (!Number.isInteger(slot) || slot < 0 || slot >= BUILDINGS.length) return;
    const tier = state.buildings[slot];
    if (tier >= 3) { setMessage(BUILDINGS[slot].name + ' is fully fortified.', 2.5); return; }
    const cost = buildingCost(slot);
    if (state.coins < cost) {
      setMessage('Need ' + cost + ' coins for ' + BUILDINGS[slot].name + '. Spin for more.', 3);
      bump(2); audio.hit(); return;
    }
    state.coins -= cost;
    state.buildings[slot]++;
    const newTier = state.buildings[slot];
    const msg = BUILDINGS[slot].name + ' reached tier ' + newTier + '.';
    setMessage(msg, 3);
    burst(buildX(slot) + 52, 445, COLORS.acid, 18);
    audio.good(); bump(4);
    if (state.buildings.every((value) => value >= 3)) winVillage();
  }

  function winVillage() {
    state.phase = 'win';
    state.winBanner = 4;
    profile.completed = Math.max(profile.completed, Math.min(20, state.village + 1));
    profile.best = Math.max(profile.best, profile.completed);
    saveProfile();
    setMessage(profile.completed >= 20 ? 'Ladder complete. You own the skyline.' : 'Village complete. Next rung unlocked.', 6);
    burst(W * .5, 270, COLORS.gold, 38);
    audio.good(); bump(8);
  }

  function openRaid() {
    if (!started || orientationPaused || state.gameOver || state.phase !== 'build') return;
    if (state.raids <= 0) {
      setMessage('No raid charges. Spin until the wheel shows RAID.', 3);
      bump(2); return;
    }
    state.raids--;
    state.phase = 'raid';
    state.raidState = makeRaid(state.village, state.totalRaids);
    state.raidFound = [];
    state.raidPicks = 0;
    setMessage('Pick 3 vault spots. The map hints at the hot route.', 5);
    audio.beep(260, .12, 'triangle', .035);
    burst(W * .5, 370, COLORS.violet, 20);
  }

  function makeRaid(village, raidNumber) {
    const hot = (village * 5 + raidNumber * 3 + 2) % 12;
    const second = (hot + 5 + (village % 3)) % 12;
    const third = (hot + 9) % 12;
    const values = Array.from({ length: 12 }, (_, i) => i === hot ? 36 : i === second ? 22 : i === third ? 14 : (i % 3) + 3);
    return { hot, second, third, values, picked: new Array(12).fill(false) };
  }

  function dig(index) {
    if (!started || orientationPaused || state.phase !== 'raid' || !state.raidState) return;
    if (!Number.isInteger(index) || index < 0 || index >= 12) return;
    const raid = state.raidState;
    if (raid.picked[index] || state.raidPicks >= 3) return;
    raid.picked[index] = true;
    state.raidPicks++;
    state.raidFound.push(index);
    state.raidLoot += raid.values[index];
    const isHot = index === raid.hot;
    burst(digX(index) + 17, digY(index) + 17, isHot ? COLORS.gold : COLORS.violet, isHot ? 18 : 8);
    if (isHot) { setMessage('HOT SPOT! +' + raid.values[index] + ' coins.', 2.5); audio.good(); bump(5); }
    else { setMessage('Dig ' + state.raidPicks + '/3: +' + raid.values[index] + ' coins.', 2); audio.coin(); }
    if (state.raidPicks >= 3) finishRaid();
  }

  function finishRaid() {
    const loot = state.raidLoot;
    state.coins += loot;
    state.spins = Math.min(15, state.spins + 2);
    state.totalRaids++;
    state.phase = 'raidDone';
    setMessage('Raid banked +' + loot + ' coins and +2 spins. Back to the village.', 5);
    announce('Raid complete. Two spins recharged.');
    audio.good(); bump(6);
    burst(W * .5, 350, COLORS.gold, 28);
  }

  function leaveRaid() {
    if (state.phase === 'raidDone') {
      state.phase = 'build';
      state.raidState = null;
      state.raidLoot = 0;
      state.raidFound = [];
      setMessage('The vault is empty. Spend your haul on a build slot.', 4);
    }
  }

  function nextVillage() {
    if (state.phase !== 'win') return;
    if (state.village >= 19) {
      state.gameOver = true;
      setMessage('Ladder complete. Restart to run it again.', 8);
      return;
    }
    const next = state.village + 1;
    restart(next);
    state.spins = 10;
    state.coins = 95 + next * 3;
    state.message = 'Rung ' + (next + 1) + '/20. Bots are getting clever.';
    state.messageTime = 5;
    announce(state.message);
  }

  function attackBot() {
    if (!started || orientationPaused || state.phase !== 'build' || state.spinBusy || state.gameOver) return;
    if (state.attack <= 0) { setMessage('No attack tokens. Spin for an ATTACK reel.', 3); bump(2); return; }
    state.attack--;
    const target = botTarget(state.village);
    if (target.shielded) {
      setMessage(target.name + ' blocked the hit with a shield.', 3.5);
      audio.hit(); bump(4); burst(W * .78, 352, COLORS.blue, 14);
    } else {
      setMessage('Direct hit on ' + target.name + ' — ' + target.building + ' cracked.', 3.5);
      audio.hit(); bump(7); burst(W * .78, 352, COLORS.orange, 24);
    }
  }

  function botTarget(village) {
    const index = (village * 7 + state.totalRaids * 2 + state.buildings.reduce((a,b)=>a+b,0)) % 5;
    const name = BOT_NAMES[village % BOT_NAMES.length];
    const tier = Math.min(3, 1 + Math.floor(village / 7));
    const shielded = ((village * 11 + state.totalRaids + index) % 4) === 0;
    return { name, building: BUILDINGS[index].name + ' T' + tier, shielded };
  }

  function buildX(i) { return 18 + (i % 3) * 119 + (i >= 3 ? 59 : 0); }
  function buildY(i) { return i >= 3 ? 442 : 442; }
  function digX(i) { return 42 + (i % 4) * 77; }
  function digY(i) { return 310 + Math.floor(i / 4) * 58; }

  function hitTest(x, y) {
    if (state.phase === 'raid') {
      for (let i = 0; i < 12; i++) if (x >= digX(i)-10 && x <= digX(i)+46 && y >= digY(i)-10 && y <= digY(i)+46) return { type:'dig', index:i };
      return null;
    }
    if (state.phase === 'raidDone') {
      return { type:'leaveRaid' };
    }
    if (state.phase === 'win') return { type:'next' };
    if (x >= 28 && x <= W-28 && y >= 174 && y <= 274) return { type:'spin' };
    for (let i = 0; i < 5; i++) {
      const bx = buildX(i), by = buildY(i);
      if (x >= bx-6 && x <= bx+104 && y >= by-8 && y <= by+92) return { type:'build', index:i };
    }
    if (x >= 23 && x <= W*.5-5 && y >= 558 && y <= 616) return { type:'raid' };
    if (x >= W*.5+5 && x <= W-23 && y >= 558 && y <= 616) return { type:'attack' };
    if (x >= W-96 && x <= W-16 && y >= 20 && y <= 72) return { type:'restart' };
    return null;
  }

  function dispatchHit(hit) {
    if (!hit) return;
    if (hit.type === 'spin') spin();
    if (hit.type === 'build') build(hit.index);
    if (hit.type === 'raid') openRaid();
    if (hit.type === 'attack') attackBot();
    if (hit.type === 'dig') dig(hit.index);
    if (hit.type === 'leaveRaid') leaveRaid();
    if (hit.type === 'next') nextVillage();
    if (hit.type === 'restart') restart(state.village);
  }

  function pointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    return { x:(e.clientX - rect.left) * W / rect.width, y:(e.clientY - rect.top) * H / rect.height };
  }

  function pointerDown(e) {
    e.preventDefault();
    if (!started || orientationPaused) return;
    const p = pointerPosition(e);
    const hit = hitTest(p.x, p.y);
    if (!hit) return;
    const control = hit.type + (hit.index == null ? '' : ':' + hit.index);
    if (controlPointers.has(control)) return;
    controlPointers.set(control, e.pointerId);
    pointers.set(e.pointerId, { control, hit });
    if (pointers.size > 8) { const oldId = pointers.keys().next().value, old = pointers.get(oldId); controlPointers.delete(old.control); pointers.delete(oldId); }
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    dispatchHit(hit);
  }

  function pointerUp(e) {
    e.preventDefault();
    const tracked = pointers.get(e.pointerId);
    if (tracked) controlPointers.delete(tracked.control);
    pointers.delete(e.pointerId);
  }

  function pointerCancel(e) {
    const tracked = pointers.get(e.pointerId);
    if (tracked) controlPointers.delete(tracked.control);
    pointers.delete(e.pointerId);
  }

  function keyDown(e) {
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (!started) return;
    if (e.code === 'Space') spin();
    if (e.code === 'KeyR') restart(state.village);
    if (e.code === 'KeyV') openRaid();
    if (e.code === 'KeyA') attackBot();
    if (e.code === 'Enter' && state.phase === 'win') nextVillage();
    if (state.phase === 'build' && /^Digit[1-5]$/.test(e.code)) build(Number(e.code.slice(-1))-1);
    if (state.phase === 'raid' && /^Digit([1-9]|1[0-2])$/.test(e.code)) dig(Number(e.code.slice(5))-1);
  }

  function keyUp(e) { keys.delete(e.code); }

  function resize() {
    W = Math.max(320, Math.min(540, window.innerWidth));
    H = Math.max(568, Math.min(900, window.innerHeight));
    const wasOrientationPaused = orientationPaused;
    orientationPaused = window.innerWidth > window.innerHeight;
    if (orientationPaused && !wasOrientationPaused) resetInput();
    rotateScreen.hidden = !orientationPaused;
    const maxAxis = 960;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = Math.min(maxAxis / Math.max(W, H), 1);
    canvas.width = Math.round(W * dpr * scale);
    canvas.height = Math.round(H * dpr * scale);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  function update(dt) {
    if (!started || orientationPaused || document.hidden) return;
    state.elapsed += dt;
    state.messageTime = Math.max(0, state.messageTime - dt);
    screenShake = Math.max(0, screenShake - dt * 20);
    flash = Math.max(0, flash - dt * 3);
    if (state.spinBusy) {
      state.spinTime += dt;
      for (let i = 0; i < 3; i++) {
        if (state.spinTime < state.reelStop[i]) state.reels[i] = Math.floor(state.spinTime * (15+i*3)) % SYMBOLS.length;
        else state.reels[i] = state.reelFinal[i];
      }
      if (state.spinTime >= 1.0) resolveSpin();
    }
    if (state.winBanner > 0) state.winBanner -= dt;
    updateParticles(dt);
  }

  function bump(amount) { screenShake = Math.min(14, screenShake + amount); flash = Math.min(1, flash + .16); }

  function burst(x, y, color, count) {
    const room = Math.max(0, MAX_PARTICLES - particles.length);
    const total = Math.min(count, room);
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * TAU, speed = 20 + Math.random() * 120;
      particles.push({ x, y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed-35, life:.35+Math.random()*.7, max:.7, size:2+Math.random()*4, color });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 115 * dt;
    }
  }

  function roundedRect(x,y,w,h,r,fill,stroke) {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function text(value, x, y, size, color=COLORS.ink, align='left', weight=700) {
    ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
  }

  function wrap(value, x, y, maxWidth, lineHeight, size, color) {
    ctx.font = '700 ' + size + 'px Arial, Helvetica, sans-serif';
    ctx.fillStyle = color;
    const words = value.split(' '); let line = ''; let yy = y;
    words.forEach((word) => { const test = line ? line + ' ' + word : word; if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, yy); line = word; yy += lineHeight; } else line = test; });
    if (line) ctx.fillText(line, x, yy);
  }

  function draw() {
    ctx.save();
    const sx = screenShake ? (Math.random()-.5)*screenShake : 0;
    const sy = screenShake ? (Math.random()-.5)*screenShake : 0;
    ctx.translate(sx, sy);
    ctx.fillStyle = '#0d1713'; ctx.fillRect(-20,-20,W+40,H+40);
    drawBackground();
    if (!started) drawAttract();
    else if (state.phase === 'raid' || state.phase === 'raidDone') drawRaid();
    else drawVillage();
    drawParticles();
    if (flash > 0) { ctx.fillStyle = 'rgba(245,240,222,' + (flash*.055) + ')'; ctx.fillRect(0,0,W,H); }
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0, '#1b3026'); gradient.addColorStop(.55, '#12231d'); gradient.addColorStop(1, '#0b1512');
    ctx.fillStyle = gradient; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = .13; ctx.strokeStyle = COLORS.acid; ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 34) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(215,243,106,.035)';
    ctx.beginPath(); ctx.arc(W*.14, H*.28, 120, 0, TAU); ctx.fill();
  }

  function drawAttract() {
    roundedRect(24, 196, W-48, 82, 16, 'rgba(8,14,12,.62)', 'rgba(215,243,106,.28)');
    text('SCOUT WHEEL READY', W*.5, 223, 14, COLORS.acid, 'center', 900);
    text('Tap START above to unlock the soundboard', W*.5, 251, 12, COLORS.muted, 'center', 700);
    drawTinySpinner(W*.5, 360);
  }

  function drawHeader() {
    text('VAULT RAIDERS', 18, 29, 17, COLORS.ink, 'left', 900);
    text('RUNG ' + String(state.village+1).padStart(2,'0') + '/20', 18, 51, 10, COLORS.acid, 'left', 900);
    text('BEST ' + String(profile.best).padStart(2,'0') + '/20', W-18, 51, 10, COLORS.gold, 'right', 900);
    roundedRect(W-94, 20, 76, 34, 9, 'rgba(8,14,12,.62)', COLORS.line);
    text('↻  NEW', W-56, 37, 10, COLORS.ink, 'center', 900);
    ctx.fillStyle = COLORS.line; ctx.fillRect(18, 70, W-36, 1);
    const metrics = [
      { label:'COINS', value:state.coins, color:COLORS.gold },
      { label:'ATK', value:state.attack, color:COLORS.orange },
      { label:'SHD', value:state.shields, color:COLORS.blue },
      { label:'RAID', value:state.raids, color:COLORS.violet },
      { label:'SPINS', value:state.spins, color:COLORS.acid }
    ];
    const cell = (W-36)/metrics.length;
    metrics.forEach((m,i) => { const x = 18 + cell*i + cell*.5; text(m.value, x, 91, 18, m.color, 'center', 900); text(m.label, x, 108, 8, COLORS.muted, 'center', 900); });
  }

  function drawVillage() {
    drawHeader();
    text('YOUR OUTPOST', 20, 133, 11, COLORS.muted, 'left', 900);
    text('build a 5-room escape plan', W-20, 133, 10, COLORS.muted, 'right', 700);
    drawSpinner();
    text('FORTIFY THE ROOMS', 20, 414, 11, COLORS.muted, 'left', 900);
    text('tap a slot  •  cost rises by tier', W-20, 414, 10, COLORS.muted, 'right', 700);
    for (let i = 0; i < 5; i++) drawBuilding(i);
    drawActionBar();
    drawHint();
    if (state.phase === 'win') drawWin();
  }

  function drawSpinner() {
    roundedRect(18, 148, W-36, 136, 18, 'rgba(10,18,15,.72)', COLORS.line);
    text('SCOUT WHEEL', 32, 166, 9, COLORS.muted, 'left', 900);
    const reelW = Math.min(83, (W-92)/3), gap = 8, left = (W - (reelW*3+gap*2))/2;
    for (let i = 0; i < 3; i++) {
      const x = left + i*(reelW+gap); const sym = SYMBOLS[state.reels[i]];
      roundedRect(x, 181, reelW, 68, 11, 'rgba(35,50,42,.9)', state.spinBusy && state.spinTime < state.reelStop[i] ? COLORS.acid : COLORS.line);
      text(sym.icon, x+reelW/2, 205, 27, sym.color, 'center', 900);
      text(sym.label, x+reelW/2, 232, 8, sym.color, 'center', 900);
    }
    roundedRect(W-105, 256, 87, 20, 7, state.spinBusy ? 'rgba(155,168,158,.16)' : COLORS.acid, null);
    text(state.spinBusy ? 'ROLLING…' : 'TAP / SPACE', W-61.5, 266, 8, state.spinBusy ? COLORS.muted : '#17231f', 'center', 900);
    if (state.lastReward) text(state.lastReward, W*.5, 296, 11, COLORS.acid, 'center', 900);
  }

  function drawTinySpinner(x,y) {
    for (let i=0;i<3;i++) { const sym=SYMBOLS[i]; roundedRect(x-90+i*62,y-25,52,50,9,'rgba(35,50,42,.9)',sym.color); text(sym.icon,x-64+i*62,y-4,22,sym.color,'center',900); text(sym.label.slice(0,4),x-64+i*62,y+14,7,sym.color,'center',900); }
  }

  function drawBuilding(i) {
    const x = buildX(i), y = buildY(i), tier = state.buildings[i], cost = buildingCost(i);
    const color = tier >= 3 ? COLORS.acid : tier > 0 ? COLORS.blue : COLORS.line;
    roundedRect(x, y, 104, 88, 12, tier ? 'rgba(34,53,43,.92)' : 'rgba(18,29,24,.82)', color);
    ctx.fillStyle = color; ctx.globalAlpha = tier ? .14 : .05; ctx.fillRect(x+1,y+1,102,86); ctx.globalAlpha=1;
    text(BUILDINGS[i].mark, x+17, y+23, 22, color, 'center', 900);
    text(BUILDINGS[i].name, x+32, y+18, 9, COLORS.ink, 'left', 900);
    text(BUILDINGS[i].sub, x+32, y+32, 8, COLORS.muted, 'left', 700);
    text('TIER ' + tier + '/3', x+10, y+58, 9, color, 'left', 900);
    if (tier < 3) text(cost + '¢', x+94, y+58, 10, COLORS.gold, 'right', 900);
    else text('SECURE', x+94, y+58, 8, COLORS.acid, 'right', 900);
    for (let t=0;t<3;t++) { roundedRect(x+10+t*13,y+72,10,5,2,t<tier?color:'rgba(155,168,158,.18)',null); }
  }

  function drawActionBar() {
    const y = 558, half = W*.5;
    roundedRect(23,y,half-28,58,12,'rgba(212,165,255,.13)',COLORS.violet);
    roundedRect(half+5,y,W-half-28,58,12,'rgba(255,149,94,.13)',COLORS.orange);
    text('⌁', 42, y+28, 23, COLORS.violet, 'center', 900); text('RAID VAULT', 60, y+21, 10, COLORS.ink, 'left', 900); text('V  ' + state.raids + ' charge', 60, y+39, 9, COLORS.violet, 'left', 900);
    text('↗', half+24, y+28, 23, COLORS.orange, 'center', 900); text('ATTACK', half+42, y+21, 10, COLORS.ink, 'left', 900); text('A  ' + state.attack + ' token', half+42, y+39, 9, COLORS.orange, 'left', 900);
  }

  function drawHint() {
    const hint = state.messageTime > 0 ? state.message : 'Hint: RAID recharges +2 spins; attack is blocked by bot shields.';
    roundedRect(18,H-53,W-36,34,9,'rgba(8,14,12,.75)',null);
    text('›', 30, H-36, 18, COLORS.acid, 'center', 900);
    wrap(hint, 43, H-40, W-62, 12, 10, COLORS.ink);
  }

  function drawRaid() {
    drawHeader();
    text('BOT VAULT // ' + BOT_NAMES[state.village % BOT_NAMES.length].toUpperCase(), 20, 134, 11, COLORS.violet, 'left', 900);
    text('PICK ' + Math.max(0,3-state.raidPicks) + ' MORE', W-20, 134, 10, COLORS.muted, 'right', 900);
    roundedRect(18, 151, W-36, 126, 16, 'rgba(10,18,15,.76)', COLORS.violet);
    text('LOOT MAP', 34, 174, 9, COLORS.muted, 'left', 900);
    text('HOT', W-34, 174, 9, COLORS.gold, 'right', 900);
    ctx.strokeStyle = 'rgba(212,165,255,.34)'; ctx.lineWidth=2; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(42, 229); ctx.lineTo(W-42, 201); ctx.lineTo(W-67, 250); ctx.lineTo(118, 248); ctx.stroke(); ctx.setLineDash([]);
    text('route signal:  ◆  →  ◆  →  ◆', W*.5, 221, 13, COLORS.violet, 'center', 900);
    wrap('The brightest node is always on the map, but not every shiny node is a jackpot.', 34, 250, W-68, 13, 10, COLORS.muted);
    text('3-DIG VAULT', 20, 292, 11, COLORS.muted, 'left', 900);
    for (let i=0;i<12;i++) drawDigSpot(i);
    if (state.phase === 'raidDone') drawRaidDone();
    else {
      roundedRect(18,H-53,W-36,34,9,'rgba(8,14,12,.75)',null);
      text('›',30,H-36,18,COLORS.violet,'center',900);
      text(state.messageTime > 0 ? state.message : 'Map hint: follow the three connected ◆ marks.',43,H-36,10,COLORS.ink,'left',700);
    }
  }

  function drawDigSpot(i) {
    const raid = state.raidState, x=digX(i), y=digY(i), picked=raid && raid.picked[i];
    const hot = raid && i === raid.hot;
    const color = picked ? COLORS.muted : hot ? COLORS.gold : COLORS.violet;
    roundedRect(x,y,46,46,12,picked?'rgba(155,168,158,.1)':'rgba(42,30,58,.75)',color);
    text(picked ? '✓' : '◆', x+23, y+18, picked?18:17, color, 'center', 900);
    text(picked ? '+'+raid.values[i] : String(i+1).padStart(2,'0'), x+23, y+35, 9, color, 'center', 900);
  }

  function drawRaidDone() {
    ctx.fillStyle='rgba(9,15,12,.78)'; ctx.fillRect(0,290,W,160);
    roundedRect(35,300,W-70,130,16,'rgba(38,51,39,.96)',COLORS.gold);
    text('VAULT CRACKED',W*.5,326,16,COLORS.gold,'center',900);
    text('+'+state.raidLoot+'¢   +2 SPINS',W*.5,359,23,COLORS.ink,'center',900);
    text('Tap anywhere to return',W*.5,398,11,COLORS.muted,'center',700);
  }

  function drawWin() {
    ctx.fillStyle='rgba(9,15,12,.78)'; ctx.fillRect(0,115,W,H-155);
    roundedRect(27,190,W-54,240,20,'rgba(28,47,35,.98)',COLORS.acid);
    text(state.village >= 19 ? 'THE SKYLINE IS YOURS' : 'VILLAGE COMPLETE',W*.5,235,20,COLORS.acid,'center',900);
    text(state.village >= 19 ? '20 / 20 RUNG' : 'RUNG '+(state.village+1)+' CLEARED',W*.5,276,12,COLORS.gold,'center',900);
    text('◆  ◆  ◆  ◆  ◆',W*.5,324,22,COLORS.ink,'center',900);
    wrap(state.village >= 19 ? 'Every bot vault is now a story you tell.' : 'The next bot has a brighter lock and a worse attitude.',W*.5,368,W-100,16,11,COLORS.muted);
    roundedRect(65,388,W-130,28,8,COLORS.acid,null);
    text(state.village >= 19 ? 'R  RESTART RUN' : 'ENTER  NEXT VILLAGE',W*.5,402,10,'#17231f','center',900);
  }

  function drawParticles() {
    particles.forEach((p) => { ctx.globalAlpha = Math.max(0, p.life/p.max); ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,p.size,p.size); });
    ctx.globalAlpha=1;
  }

  function loop(now) {
    const dt = lastTime ? Math.min(.05, Math.max(0, (now-lastTime)/1000)) : 0;
    lastTime = now;
    update(dt); draw();
    requestAnimationFrame(loop);
  }

  startButton.addEventListener('click', begin);
  canvas.addEventListener('pointerdown', pointerDown, { passive:false });
  canvas.addEventListener('pointerup', pointerUp, { passive:false });
  canvas.addEventListener('pointercancel', pointerCancel, { passive:false });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') pointerUp(e); }, { passive:false });
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive:false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive:false });
  window.addEventListener('keydown', keyDown, { passive:false });
  window.addEventListener('keyup', keyUp, { passive:false });
  window.addEventListener('blur', resetInput);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); resetInput(); });

  resize();
  requestAnimationFrame(loop);
})();
