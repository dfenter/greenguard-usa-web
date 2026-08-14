/* Backstreet Reckoning, fleet F7 AAA rebuild.
 * Phaser renders the authored procedural sheets and baked street boards.
 * GGKit owns lifecycle, input identity, save validation, audio buses, PWA,
 * pause, and reduced-motion policy. The simulation advances only in fixed
 * steps, so a slow device becomes slow motion instead of skipping time.
 */
(function () {
  'use strict';
  function addTo(parent, child) { parent.add(child); return child; }

  var Phaser = window.Phaser;
  var GGKit = window.GGKit;
  var VW = 1280;
  var VH = 720;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var BLOCK_W = 1800;
  var WORLD_W = BLOCK_W * 4;
  var FLOOR_TOP = 470;
  var FLOOR_BOTTOM = 640;
  var LANES = [0.22, 0.50, 0.78];
  var LANE_TOL = 0.105;
  var GRAVITY = 1700;
  var ACTOR_W = 96;
  var ACTOR_H = 136;
  var FRAME_COUNT = 9;
  var FONT = 'Trebuchet MS, Arial, sans-serif';
  var SAVE_VERSION = 2;
  var UPGRADE_DEFS = {
    power: { label: 'IMPACT', copy: '+4 strike damage', color: 0xff895d, max: 3 },
    armor: { label: 'LINING', copy: '-12% incoming damage', color: 0x72f6e2, max: 3 },
    agility: { label: 'FOOTWORK', copy: 'faster dodge, longer i-frames', color: 0xc5a0ff, max: 3 }
  };

  var C = {
    ink: 0x070a12, panel: 0x101827, panel2: 0x18263a,
    white: 0xf4f7fb, dim: 0x9eb1c8, cyan: 0x72f6e2,
    yellow: 0xffd166, orange: 0xff895d, red: 0xff5d72,
    violet: 0xc5a0ff, green: 0x83e8a8, steel: 0x53677d,
    black: 0x060912
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function laneY(z) { return FLOOR_TOP + (FLOOR_BOTTOM - FLOOR_TOP) * z; }
  function scaleZ(z) { return 0.82 + z * 0.22; }
  function laneMatch(a, b) { return Math.abs(a.z - b.z) <= LANE_TOL; }
  function setTextIfChanged(text, value) {
    var next = String(value);
    if (text && text.text !== next) text.setText(next);
  }
  function setColorIfChanged(text, color) {
    if (text && text.__brColor !== color) { text.setColor(color); text.__brColor = color; }
  }
  function rgba(hex, alpha) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function seeded(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Four authored identities: three street blocks and a boss alley. */
  var BLOCKS = [
    {
      id: 'alley-opener', name: 'ALLEY OPENER', landmark: 'NEON LAUNDROMAT',
      copy: 'Narrow lanes. Fast rushers. Cache behind the washer.',
      sky: ['#11172a', '#241b3d'], ground: '#182331', neon: '#72f6e2', hazard: 'puddle',
      waves: [['scrapper', 'scrapper'], ['flicker', 'scrapper', 'scrapper']], weapon: 'pipe'
    },
    {
      id: 'market-block', name: 'MARKET BLOCK', landmark: 'NIGHT MARKET',
      copy: 'Crowded stalls. Tossers split your lane. Crates hide health.',
      sky: ['#201426', '#432039'], ground: '#2a2430', neon: '#ffba68', hazard: 'slick',
      waves: [['scrapper', 'flicker', 'scrapper'], ['acrobat', 'scrapper', 'flicker'], ['heavy', 'scrapper']], weapon: 'crate'
    },
    {
      id: 'rooftop-approach', name: 'ROOFTOP APPROACH', landmark: 'WATER TOWER 07',
      copy: 'Steam vents pulse. Heavies armor through the first jab.',
      sky: ['#0d2034', '#123e58'], ground: '#1c2f3b', neon: '#9ea7ff', hazard: 'steam',
      waves: [['acrobat', 'acrobat', 'scrapper'], ['heavy', 'flicker', 'scrapper'], ['heavy', 'acrobat', 'flicker']], weapon: 'pipe'
    },
    {
      id: 'reckoning-alley', name: 'RECKONING ALLEY', landmark: 'THE RED GATE',
      copy: 'Boss alley. Break the gate. Leave no debt unpaid.',
      sky: ['#220d1d', '#5b182c'], ground: '#30202e', neon: '#ff5d72', hazard: 'gate',
      waves: [['scrapper', 'flicker', 'heavy'], ['boss']], weapon: 'crate'
    }
  ];

  var FOES = {
    scrapper: { name: 'SCRAPPER', hp: 38, speed: 168, damage: 9, score: 120, tint: 0xff805d, tint2: 0xa73d3b, width: 34, range: 75 },
    flicker: { name: 'FLICKER', hp: 32, speed: 122, damage: 8, score: 155, tint: 0x77e5c5, tint2: 0x1e7c75, width: 32, range: 72 },
    acrobat: { name: 'VAULT TWIN', hp: 30, speed: 208, damage: 8, score: 145, tint: 0xc8a1ff, tint2: 0x643f99, width: 31, range: 74 },
    heavy: { name: 'HAULER', hp: 92, speed: 88, damage: 17, score: 270, tint: 0xffc657, tint2: 0x8f5d20, width: 46, range: 88 },
    boss: { name: 'MARLO STEEL', hp: 360, speed: 105, damage: 23, score: 1300, tint: 0xff5d72, tint2: 0x8a1d41, width: 58, range: 104 }
  };
  var BOSS_NAMES = ['MARLO STEEL', 'CROW VANCE', 'DUTCH RAMONE', 'SABLE KURTZ', 'THE RECKONING'];

  var DEFAULT_SAVE = {
    v: SAVE_VERSION, medals: [0, 0, 0, 0, 0, 0], bossRush: false,
    finalBoss: false, runs: 0, bestGauntlet: 0, bestScore: 0, upgrades: { power: 0, armor: 0, agility: 0 }
  };
  function validSave(o) {
    if (!o || typeof o !== 'object' || (o.v !== 1 && o.v !== SAVE_VERSION) || !Array.isArray(o.medals) || o.medals.length !== 6) return false;
    if (o.bossRush !== true && o.bossRush !== false) return false;
    if (o.finalBoss !== true && o.finalBoss !== false) return false;
    if (!Number.isInteger(o.runs) || o.runs < 0 || o.runs > 999999) return false;
    if (!Number.isInteger(o.bestGauntlet) || o.bestGauntlet < 0 || o.bestGauntlet > 999999999) return false;
    if (o.v === SAVE_VERSION && (!Number.isInteger(o.bestScore) || o.bestScore < 0 || o.bestScore > 999999999)) return false;
    for (var i = 0; i < o.medals.length; i++) if (!Number.isInteger(o.medals[i]) || o.medals[i] < 0 || o.medals[i] > 3) return false;
    if (o.finalBoss !== (o.medals[0] > 0 && o.medals[1] > 0 && o.medals[2] > 0)) return false;
    if (o.v === SAVE_VERSION) {
      if (!o.upgrades || typeof o.upgrades !== 'object') return false;
      for (var key in UPGRADE_DEFS) if (!Number.isInteger(o.upgrades[key]) || o.upgrades[key] < 0 || o.upgrades[key] > UPGRADE_DEFS[key].max) return false;
    }
    return true;
  }
  function freshSave() {
    return { v: SAVE_VERSION, medals: DEFAULT_SAVE.medals.slice(), bossRush: false, finalBoss: false, runs: 0, bestGauntlet: 0, bestScore: 0, upgrades: { power: 0, armor: 0, agility: 0 } };
  }
  function normalizeSave(o) {
    var next = freshSave();
    if (!o || typeof o !== 'object') return next;
    next.medals = o.medals.slice(); next.bossRush = o.bossRush === true; next.runs = o.runs; next.bestGauntlet = o.bestGauntlet; next.bestScore = clamp(Number(o.bestScore) || 0, 0, 999999999);
    next.finalBoss = next.medals[0] > 0 && next.medals[1] > 0 && next.medals[2] > 0;
    if (o.upgrades) for (var key in UPGRADE_DEFS) next.upgrades[key] = clamp(Number(o.upgrades[key]) || 0, 0, UPGRADE_DEFS[key].max);
    return next;
  }

  var state = {
    mode: 'title', screen: 'title', stage: 1, block: 0, blockName: BLOCKS[0].name,
    lives: 3, score: 0, runTime: 0, stageTime: 0, combo: 0, maxCombo: 0,
    deaths: 0, camLocked: false, bossName: '', seed: 7331, blockClear: false,
    forceMessage: '', upgradeChoice: null, hazardHits: 0
  };
  /* The orchestrator can mutate these before Phaser is live. The same object
   * remains live after create, so boot fallback and scene switches agree. */
  var debugBridge = window.__br || {};
  debugBridge.state = state;
  if (!Object.prototype.hasOwnProperty.call(debugBridge, 'forceBlock')) debugBridge.forceBlock = false;
  if (!Object.prototype.hasOwnProperty.call(debugBridge, 'forceBoss')) debugBridge.forceBoss = false;
  window.__br = debugBridge;

  var sceneRef = null;
  var profile;
  var kit = GGKit.create({
    slug: 'backstreet-reckoning',
    orientation: 'landscape',
    validateSave: validSave,
    onPause: function () {
      state.screen = 'pause';
      if (sceneRef) sceneRef.paintPause(true);
    },
    onResume: function () {
      if (state.screen === 'pause') state.screen = 'play';
      if (sceneRef) sceneRef.paintPause(false);
    },
    onRestart: function () {
      if (sceneRef) sceneRef.returnTitle();
    }
  });
  kit.audio.register({
    punch: 'assets/audio/punch.mp3', grab: 'assets/audio/grab.mp3',
    weapon: 'assets/audio/weapon.mp3', crowd: 'assets/audio/crowd.mp3', clear: 'assets/audio/clear.mp3',
    hit: 'assets/audio/punch.mp3', hurt: 'assets/audio/punch.mp3', dodge: 'assets/audio/weapon.mp3',
    pickup: 'assets/audio/clear.mp3', break: 'assets/audio/weapon.mp3', boss: 'assets/audio/punch.mp3',
    ui: 'assets/audio/clear.mp3', danger: 'assets/audio/crowd.mp3'
  });
  kit.registerPWA();
  kit.loader.show('BACKSTREET RECKONING');
  profile = normalizeSave(kit.save.get(null));
  kit.save.set(profile);
  kit.audio.preload(['punch', 'grab', 'weapon', 'crowd', 'clear', 'hit', 'hurt', 'dodge', 'pickup', 'break', 'boss', 'ui', 'danger']);

  var input = {
    punchQueued: false, jumpQueued: false, dodgeQueued: false, swipe: null,
    pauseQueued: false, restartQueued: false, prevPunch: false, prevJump: false, prevDodge: false, prevEnter: false,
    stickId: null, ix: 0, iz: 0, padPrev: { punch: false, jump: false, dodge: false, pause: false, restart: false }
  };

  function motionOn() { return kit.juice.enabled !== false; }
  function choose(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
  function copyState() {
    return {
      mode: state.mode, stage: state.stage, block: state.block,
      lives: state.lives, score: state.score
    };
  }
  function saveNow() {
    kit.save.set(profile);
  }

  function textureCanvas(sc, key, w, h, draw) {
    if (sc.textures.exists(key)) return key;
    var tex = sc.textures.createCanvas(key, w, h);
    draw(tex.getContext(), w, h);
    tex.refresh();
    return key;
  }
  function rect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  function line(ctx, x1, y1, x2, y2, width, stroke) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function drawBackground(ctx, w, h, block, seed) {
    var rng = seeded(seed);
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, block.sky[0]); grad.addColorStop(0.60, block.sky[1]); grad.addColorStop(1, block.ground);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 36; i++) {
      var bx = Math.floor(rng() * w), by = 150 + Math.floor(rng() * 210), bw = 42 + Math.floor(rng() * 100);
      var bh = 90 + Math.floor(rng() * 170);
      rect(ctx, bx, by, bw, bh, i % 3 ? 'rgba(4,8,16,.62)' : 'rgba(13,17,34,.78)');
      for (var wy = by + 16; wy < by + bh - 8; wy += 22) if (rng() > 0.35) rect(ctx, bx + 10 + Math.floor(rng() * Math.max(1, bw - 22)), wy, 8, 5, rgba(parseInt(block.neon.slice(1), 16), 0.48));
    }
    for (var s = 0; s < 7; s++) {
      var sx = 100 + s * 250 + Math.floor(rng() * 80);
      line(ctx, sx, 110 + Math.floor(rng() * 90), sx + 74, 90 + Math.floor(rng() * 60), 3, 'rgba(120,155,190,.28)');
      line(ctx, sx + 74, 90 + Math.floor(rng() * 60), sx + 138, 130 + Math.floor(rng() * 65), 2, 'rgba(120,155,190,.18)');
    }
    var landmarkX = block.id === 'reckoning-alley' ? 1250 : 780;
    var landmarkGrad = ctx.createLinearGradient(0, 250, 0, 440); landmarkGrad.addColorStop(0, 'rgba(8,11,24,.96)'); landmarkGrad.addColorStop(1, 'rgba(19,29,45,.78)');
    ctx.fillStyle = landmarkGrad; ctx.fillRect(landmarkX, 252, 360, 182); ctx.strokeStyle = rgba(parseInt(block.neon.slice(1), 16), 0.54); ctx.lineWidth = 3; ctx.strokeRect(landmarkX + 2, 254, 356, 178);
    rect(ctx, landmarkX + 14, 268, 332, 13, rgba(parseInt(block.neon.slice(1), 16), 0.75));
    rect(ctx, landmarkX + 28, 310, 304, 76, 'rgba(16,22,34,.92)');
    for (var wline = 0; wline < 9; wline++) rect(ctx, landmarkX + 42 + wline * 32, 327 + (wline % 2) * 18, 13, 8, rgba(parseInt(block.neon.slice(1), 16), 0.48));
    /* The landmark stays readable as a visual shape, not an always-on text tag. */
    if (block.id === 'alley-opener') { ctx.strokeStyle = '#72f6e2'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(landmarkX + 86, 360, 24, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(landmarkX + 154, 360, 24, 0, Math.PI * 2); ctx.stroke(); }
    if (block.id === 'market-block') { for (var aw = 0; aw < 4; aw++) { ctx.fillStyle = aw % 2 ? '#ff895d' : '#ffd166'; ctx.beginPath(); ctx.moveTo(landmarkX + 48 + aw * 68, 390); ctx.lineTo(landmarkX + 78 + aw * 68, 390); ctx.lineTo(landmarkX + 64 + aw * 68, 412); ctx.lineTo(landmarkX + 34 + aw * 68, 412); ctx.closePath(); ctx.fill(); } }
    if (block.id === 'rooftop-approach') { ctx.fillStyle = '#9ea7ff'; ctx.beginPath(); ctx.arc(landmarkX + 296, 233, 32, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0d2034'; ctx.beginPath(); ctx.arc(landmarkX + 308, 224, 28, 0, Math.PI * 2); ctx.fill(); }
    if (block.id === 'reckoning-alley') { ctx.strokeStyle = '#ff5d72'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(landmarkX + 40, 416); ctx.lineTo(landmarkX + 40, 285); ctx.lineTo(landmarkX + 320, 285); ctx.lineTo(landmarkX + 320, 416); ctx.stroke(); }
    rect(ctx, 0, 430, w, 290, block.ground);
    var floorGrad = ctx.createLinearGradient(0, 450, 0, 720);
    floorGrad.addColorStop(0, 'rgba(22,30,44,.22)'); floorGrad.addColorStop(1, 'rgba(2,5,12,.82)');
    ctx.fillStyle = floorGrad; ctx.fillRect(0, 430, w, 290);
    for (var l = 0; l < 3; l++) {
      var y = laneY(LANES[l]);
      line(ctx, 0, y + 27, w, y + 27, 2, rgba(parseInt(block.neon.slice(1), 16), 0.16));
      line(ctx, 0, y + 29, w, y + 29, 1, 'rgba(0,0,0,.6)');
    }
    for (var tile = -1; tile < 20; tile++) line(ctx, tile * 105, 465, tile * 105 + 70, 720, 1, 'rgba(130,160,180,.06)');
    for (var drain = 0; drain < 8; drain++) { rect(ctx, 100 + drain * 220, 676, 76, 4, 'rgba(2,5,12,.62)'); line(ctx, 106 + drain * 220, 671, 166 + drain * 220, 671, 2, 'rgba(120,155,190,.18)'); }
    if (block.hazard === 'puddle') {
      ctx.fillStyle = 'rgba(31,150,170,.24)'; ctx.beginPath(); ctx.ellipse(330, 580, 190, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(110,244,240,.55)'; ctx.beginPath(); ctx.ellipse(330, 575, 90, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (block.hazard === 'slick') {
      ctx.fillStyle = 'rgba(224,145,60,.24)'; ctx.beginPath(); ctx.ellipse(1050, 558, 230, 24, -0.1, 0, Math.PI * 2); ctx.fill();
      line(ctx, 880, 568, 1210, 538, 4, 'rgba(255,192,92,.35)');
    } else if (block.hazard === 'steam') {
      for (var vent = 0; vent < 3; vent++) {
        rect(ctx, 300 + vent * 420, 575, 74, 14, 'rgba(3,6,12,.82)');
        for (var puff = 0; puff < 4; puff++) { ctx.fillStyle = 'rgba(180,236,255,.16)'; ctx.beginPath(); ctx.arc(325 + vent * 420 + puff * 12, 550 - puff * 12, 18 - puff * 2, 0, Math.PI * 2); ctx.fill(); }
      }
    } else {
      rect(ctx, 1360, 270, 8, 275, 'rgba(255,57,87,.75)'); rect(ctx, 1450, 270, 8, 275, 'rgba(255,57,87,.75)');
      line(ctx, 1360, 270, 1458, 270, 8, 'rgba(255,57,87,.75)');
    }
    ctx.textAlign = 'left';
  }

  function drawFighterFrame(ctx, frame, colors, variant) {
    var cx = 48, ground = 130, lean = frame === 3 || frame === 5 ? 7 : 0;
    var walk = frame === 1 || frame === 2;
    var punch = frame === 3, grab = frame === 4, thrown = frame === 5, hurt = frame === 6, ko = frame === 7;
    var weapon = frame === 8;
    if (ko) {
      ctx.save(); ctx.translate(6, 102); ctx.rotate(-0.09); rect(ctx, 18, 0, 63, 23, colors.body); rect(ctx, 5, 7, 22, 13, colors.head); rect(ctx, 66, 6, 24, 8, colors.accent); ctx.restore();
      return;
    }
    ctx.save(); ctx.translate(lean, 0); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(cx, ground + 1, 29, 7, 0, 0, Math.PI * 2); ctx.fill();
    var legA = walk ? (frame === 1 ? 8 : -8) : 0;
    ctx.fillStyle = colors.dark; ctx.beginPath(); ctx.moveTo(cx - 18 + legA, 82); ctx.lineTo(cx - 5 + legA, 84); ctx.lineTo(cx - 8 + legA, 124); ctx.lineTo(cx - 24 + legA, 128); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 5 - legA, 84); ctx.lineTo(cx + 18 - legA, 82); ctx.lineTo(cx + 25 - legA, 126); ctx.lineTo(cx + 7 - legA, 128); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colors.accent; ctx.fillRect(cx - 24 + legA, 123, 20, 7); ctx.fillRect(cx + 5 - legA, 123, 22, 7);
    var bodyGrad = ctx.createLinearGradient(cx - 24, 45, cx + 24, 98); bodyGrad.addColorStop(0, colors.highlight); bodyGrad.addColorStop(0.48, colors.body); bodyGrad.addColorStop(1, colors.dark);
    ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.moveTo(cx - 25, 52); ctx.lineTo(cx - 16, 44); ctx.lineTo(cx + 16, 44); ctx.lineTo(cx + 25, 55); ctx.lineTo(cx + 19, 98); ctx.lineTo(cx - 20, 98); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = colors.highlight; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = colors.accent; ctx.fillRect(cx - 20, 84, 40, 6); ctx.fillStyle = colors.dark; ctx.fillRect(cx - 17, 91, 34, 4);
    ctx.fillStyle = colors.head; ctx.beginPath(); ctx.arc(cx, 36, 18, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = colors.dark; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = colors.dark; ctx.beginPath(); ctx.moveTo(cx - 19, 29); ctx.lineTo(cx - 11, 18); ctx.lineTo(cx + 12, 21); ctx.lineTo(cx + 19, 29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colors.eye; ctx.fillRect(cx - 15, 35, 7, 5); ctx.fillRect(cx + 8, 35, 7, 5);
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 18, 62); ctx.lineTo(cx - (punch ? 43 : 33), 73 + (grab ? -8 : 0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 18, 62); ctx.lineTo(cx + (punch ? 45 : thrown ? 34 : 30), 75 + (hurt ? 14 : 0)); ctx.stroke();
    ctx.fillStyle = colors.highlight; ctx.beginPath(); ctx.arc(cx - (punch ? 43 : 33), 73 + (grab ? -8 : 0), 6, 0, Math.PI * 2); ctx.fill();
    if (variant === 'player') { ctx.strokeStyle = colors.glow || colors.highlight; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 12, 47); ctx.lineTo(cx - 30, 58); ctx.lineTo(cx - 18, 64); ctx.stroke(); }
    if (variant === 'flicker') { ctx.strokeStyle = colors.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 22, 50); ctx.lineTo(cx - 36, 38); ctx.lineTo(cx - 26, 29); ctx.stroke(); }
    if (variant === 'acrobat') { ctx.strokeStyle = colors.accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx + 16, 50); ctx.quadraticCurveTo(cx + 37, 39, cx + 42, 20); ctx.stroke(); }
    if (variant === 'heavy' || variant === 'boss') { ctx.fillStyle = colors.accent; ctx.fillRect(cx - 29, 51, 9, 19); ctx.fillRect(cx + 20, 51, 9, 19); }
    if (weapon) {
      ctx.strokeStyle = colors.weapon || '#e4eff6'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(cx + 22, 75); ctx.lineTo(cx + 62, 30); ctx.stroke();
      ctx.strokeStyle = colors.glow || '#f7fbff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 27, 73); ctx.lineTo(cx + 67, 28); ctx.stroke();
    }
    if (thrown) { ctx.strokeStyle = colors.accent; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 12, 52); ctx.lineTo(cx + 44, 46); ctx.stroke(); }
    if (hurt) { ctx.strokeStyle = '#f4f7fb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 34, 25); ctx.lineTo(cx - 25, 34); ctx.moveTo(cx + 34, 25); ctx.lineTo(cx + 25, 34); ctx.stroke(); }
    ctx.restore();
  }

  function makeFighterSheet(sc, key, colors, variant) {
    if (sc.textures.exists(key)) return key;
    var cv = document.createElement('canvas'); cv.width = ACTOR_W * FRAME_COUNT; cv.height = ACTOR_H;
    var ctx = cv.getContext('2d');
    for (var i = 0; i < FRAME_COUNT; i++) { ctx.save(); ctx.translate(i * ACTOR_W, 0); drawFighterFrame(ctx, i, colors, variant); ctx.restore(); }
    sc.textures.addSpriteSheet(key, cv, { frameWidth: ACTOR_W, frameHeight: ACTOR_H, endFrame: FRAME_COUNT - 1 });
    return key;
  }

  function makeSceneClass(cfg) {
    function S() { Phaser.Scene.call(this, { key: cfg.key }); }
    S.prototype = Object.create(Phaser.Scene.prototype);
    S.prototype.constructor = S;
    Object.keys(cfg).forEach(function (k) { if (k !== 'key') S.prototype[k] = cfg[k]; });
    return S;
  }

  var MainScene = makeSceneClass({
    key: 'main',

    create: function () {
      sceneRef = this;
      this.cameras.main.setBounds(0, 0, WORLD_W, VH);
      this.cameras.main.setScroll(0, 0);
      this.baseCamX = 0;
      this.accum = 0;
      this.rng = seeded(state.seed);
      this.foes = [];
      this.props = [];
      this.items = [];
      this.hazards = [];
      this.cacheBank = [];
      this.projectiles = [];
      this.popups = [];
      this.onboard = { moved: false, punched: false, dodged: false, jumped: false, hazard: false, lastHint: 0 };
      this.lastPadTime = 0;
      this.musicIntensity = '';
      this.makeTextures();
      this.makeFx();
      this.makeWorld();
      this.makeHud();
      this.bindGGInput();
      this.showTitle();
      kit.loader.progress(1);
      kit.loader.hide();
      kit.audio.music('crowd', 800);
    },

    makeTextures: function () {
      var self = this;
      textureCanvas(this, 'pixel', 8, 8, function (ctx) { rect(ctx, 0, 0, 8, 8, '#ffffff'); });
      textureCanvas(this, 'shadow', 100, 24, function (ctx) { ctx.fillStyle = 'rgba(0,0,0,.46)'; ctx.beginPath(); ctx.ellipse(50, 12, 47, 10, 0, 0, Math.PI * 2); ctx.fill(); });
      textureCanvas(this, 'food', 46, 46, function (ctx) { ctx.fillStyle = '#7dffa8'; ctx.beginPath(); ctx.arc(23, 23, 17, 0, Math.PI * 2); ctx.fill(); rect(ctx, 17, 8, 13, 7, '#f4ffbd'); rect(ctx, 13, 21, 20, 9, '#1b703f'); });
      textureCanvas(this, 'pipe', 70, 30, function (ctx) { ctx.strokeStyle = '#e5edf2'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(8, 22); ctx.lineTo(53, 8); ctx.stroke(); ctx.strokeStyle = '#6b7c8e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(8, 22); ctx.lineTo(53, 8); ctx.stroke(); });
      textureCanvas(this, 'crate', 52, 52, function (ctx) { rect(ctx, 5, 5, 42, 42, '#c47a49'); line(ctx, 8, 9, 44, 43, 5, '#e7ae65'); line(ctx, 44, 9, 8, 43, 5, '#e7ae65'); });
      textureCanvas(this, 'bin', 52, 70, function (ctx) { rect(ctx, 10, 14, 32, 50, '#53677d'); rect(ctx, 6, 8, 40, 9, '#8598aa'); line(ctx, 17, 22, 17, 57, 3, '#a7bacb'); line(ctx, 35, 22, 35, 57, 3, '#263442'); });
      textureCanvas(this, 'barrel', 54, 70, function (ctx) { ctx.fillStyle = '#a76643'; ctx.beginPath(); ctx.ellipse(27, 35, 21, 29, 0, 0, Math.PI * 2); ctx.fill(); line(ctx, 7, 24, 47, 24, 5, '#e5b56e'); line(ctx, 7, 47, 47, 47, 5, '#e5b56e'); });
      textureCanvas(this, 'upgrade', 64, 64, function (ctx) {
        ctx.save(); ctx.translate(32, 32); ctx.rotate(Math.PI / 4);
        var g = ctx.createLinearGradient(-22, -22, 22, 22); g.addColorStop(0, '#f4f7fb'); g.addColorStop(0.38, '#c5a0ff'); g.addColorStop(1, '#5d3e9b');
        ctx.fillStyle = g; ctx.shadowColor = '#c5a0ff'; ctx.shadowBlur = 18; ctx.fillRect(-18, -18, 36, 36); ctx.shadowBlur = 0; ctx.strokeStyle = '#f4f7fb'; ctx.lineWidth = 3; ctx.strokeRect(-13, -13, 26, 26); ctx.restore();
      });
      textureCanvas(this, 'puddle-hazard', 220, 52, function (ctx) { ctx.fillStyle = 'rgba(41,208,222,.35)'; ctx.beginPath(); ctx.ellipse(110, 28, 100, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#72f6e2'; ctx.globalAlpha = 0.72; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(110, 24, 60, 5, 0, 0, Math.PI * 2); ctx.stroke(); });
      textureCanvas(this, 'slick-hazard', 240, 60, function (ctx) { ctx.fillStyle = 'rgba(255,137,93,.34)'; ctx.beginPath(); ctx.ellipse(120, 30, 110, 19, -0.08, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(35, 37); ctx.lineTo(201, 21); ctx.stroke(); });
      textureCanvas(this, 'steam-hazard', 90, 120, function (ctx) { ctx.fillStyle = '#101827'; ctx.fillRect(12, 95, 66, 13); ctx.strokeStyle = 'rgba(180,236,255,.7)'; ctx.lineWidth = 7; ctx.globalAlpha = .65; ctx.beginPath(); ctx.arc(28, 65, 18, Math.PI, Math.PI * 2); ctx.arc(51, 42, 17, Math.PI, Math.PI * 2); ctx.stroke(); });
      makeFighterSheet(this, 'sheet-player', { body: '#2b5e7d', highlight: '#55c7d9', head: '#ffd2aa', dark: '#152638', accent: '#ffe077', eye: '#081421', weapon: '#eef5f9', glow: '#b7fff3' }, 'player');
      makeFighterSheet(this, 'sheet-scrapper', { body: '#a73d3b', highlight: '#ff805d', head: '#e5b39a', dark: '#251423', accent: '#ffb16a', eye: '#fff1b8', weapon: '#dce7ee' }, 'scrapper');
      makeFighterSheet(this, 'sheet-flicker', { body: '#1e7c75', highlight: '#77e5c5', head: '#b8e4c4', dark: '#0d252b', accent: '#a1ffe5', eye: '#eaffff', weapon: '#dce7ee' }, 'flicker');
      makeFighterSheet(this, 'sheet-acrobat', { body: '#643f99', highlight: '#c8a1ff', head: '#ddc2ad', dark: '#191632', accent: '#f1d7ff', eye: '#fff', weapon: '#dce7ee' }, 'acrobat');
      makeFighterSheet(this, 'sheet-heavy', { body: '#8f5d20', highlight: '#ffc657', head: '#d6a27f', dark: '#241c13', accent: '#ffe5a1', eye: '#fff3bc', weapon: '#dce7ee' }, 'heavy');
      makeFighterSheet(this, 'sheet-boss', { body: '#8a1d41', highlight: '#ff5d72', head: '#e1b18f', dark: '#260d1d', accent: '#ffabb7', eye: '#fff', weapon: '#eef5f9', glow: '#ff7d9c' }, 'boss');
      self = this;
    },

    makeFx: function () {
      this.fx = {
        sparks: this.add.particles(0, 0, 'pixel', { lifespan: { min: 180, max: 360 }, speed: { min: 90, max: 250 }, scale: { start: 0.55, end: 0.04 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 110 }).setDepth(600),
        dust: this.add.particles(0, 0, 'pixel', { lifespan: { min: 260, max: 560 }, speed: { min: 18, max: 75 }, gravityY: 85, scale: { start: 0.85, end: 0.06 }, alpha: { start: 0.58, end: 0 }, rotate: { min: 0, max: 360 }, tint: 0x93a8bd, emitting: false, maxAliveParticles: 72 }).setDepth(120),
        rings: this.add.particles(0, 0, 'pixel', { lifespan: 480, speed: { min: 30, max: 62 }, scale: { start: 0.18, end: 0.04 }, alpha: { start: 0.8, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 48 }).setDepth(590),
        dodge: this.add.particles(0, 0, 'pixel', { lifespan: { min: 220, max: 420 }, speed: { min: 20, max: 110 }, scale: { start: 0.72, end: 0.04 }, alpha: { start: 0.9, end: 0 }, tint: [0x72f6e2, 0xc5a0ff], blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 56 }).setDepth(580),
        loot: this.add.particles(0, 0, 'pixel', { lifespan: { min: 260, max: 540 }, speed: { min: 45, max: 150 }, gravityY: 100, scale: { start: 0.8, end: 0.05 }, alpha: { start: 1, end: 0 }, tint: [0xffd166, 0xc5a0ff, 0x72f6e2], blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 72 }).setDepth(610),
        death: this.add.particles(0, 0, 'pixel', { lifespan: { min: 240, max: 620 }, speed: { min: 90, max: 320 }, scale: { start: 1.1, end: 0.04 }, alpha: { start: 1, end: 0 }, tint: [0xff5d72, 0xffd166, 0xf4f7fb], blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 96 }).setDepth(620)
      };
    },

    makeWorld: function () {
      this.world = this.add.container(0, 0).setDepth(-30);
      for (var i = 0; i < BLOCKS.length; i++) {
        var key = 'street-' + i;
        textureCanvas(this, key, BLOCK_W, VH, function (ctx, w, h) { drawBackground(ctx, w, h, BLOCKS[i], state.seed + i * 991); }.bind(this));
        addTo(this.world, this.add.image(i * BLOCK_W + BLOCK_W / 2, VH / 2, key).setOrigin(0.5));
      }
    },

    makeHud: function () {
      var fixed = this.add.container(0, 0).setScrollFactor(0).setDepth(1000);
      this.ui = { root: fixed, screen: 'title', menuButtons: [], resultButtons: [], upgradeButtons: [], bannerUntil: 0, bannerWallUntil: 0, coachUntil: 0, safeX: 0, safeY: 0, comboValue: 0, transient: null, transientQueue: [] };
      addTo(fixed, this.add.rectangle(VW / 2, 30, VW, 58, C.black, 0.78));
      addTo(fixed, this.add.rectangle(VW / 2, 58, VW, 1, C.cyan, 0.28));
      this.ui.brand = addTo(fixed, this.add.text(28, 19, 'BACKSTREET', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 3 }));
      this.ui.sub = addTo(fixed, this.add.text(29, 47, 'RECKONING // FLEET F7', { fontFamily: FONT, fontSize: '10px', color: '#72f6e2', letterSpacing: 2 }));
      this.ui.stage = addTo(fixed, this.add.text(190, 16, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffd166' }));
      this.ui.block = addTo(fixed, this.add.text(190, 39, '', { fontFamily: FONT, fontSize: '14px', color: '#9eb1c8' }));
      this.ui.score = addTo(fixed, this.add.text(632, 16, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#f4f7fb' }).setOrigin(0.5, 0));
      this.ui.combo = addTo(fixed, this.add.text(632, 39, '', { fontFamily: FONT, fontSize: '14px', color: '#ff895d' }).setOrigin(0.5, 0));
      this.ui.healthBack = addTo(fixed, this.add.rectangle(790, 21, 190, 13, C.panel2, 1).setOrigin(0, 0.5));
      this.ui.healthFill = addTo(fixed, this.add.rectangle(790, 21, 190, 13, C.green, 1).setOrigin(0, 0.5));
      this.ui.health = addTo(fixed, this.add.text(990, 13, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#f4f7fb' }));
      this.ui.weapon = addTo(fixed, this.add.text(990, 37, '', { fontFamily: FONT, fontSize: '13px', color: '#9eb1c8' }));
      this.ui.lives = addTo(fixed, this.add.text(1110, 14, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ff5d72' }));
      this.ui.pause = addTo(fixed, this.add.text(1218, 14, 'II', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f4f7fb' }).setOrigin(0.5, 0));
      this.ui.damageFlash = addTo(fixed, this.add.rectangle(VW / 2, VH / 2, VW, VH, C.red, 0).setDepth(20));
      this.ui.comboChipBack = addTo(fixed, this.add.rectangle(632, 68, 190, 20, C.orange, 0.20).setStrokeStyle(1, C.orange, 0.7).setVisible(false));
      this.ui.comboChip = addTo(fixed, this.add.text(632, 68, '', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#ffd166', letterSpacing: 1 }).setOrigin(0.5).setVisible(false));
      this.ui.coach = addTo(fixed, this.add.text(VW / 2, 73, '', { fontFamily: FONT, fontSize: '16px', color: '#c9d8e8', backgroundColor: '#0d1522', padding: { left: 12, right: 12, top: 4, bottom: 4 } }).setOrigin(0.5).setAlpha(0));
      this.ui.eventBack = addTo(fixed, this.add.rectangle(1072, 84, 330, 30, C.black, 0.86).setStrokeStyle(1, C.cyan, 0.65).setOrigin(0.5).setVisible(false));
      this.ui.event = addTo(fixed, this.add.text(1072, 84, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#f4f7fb', align: 'right', letterSpacing: 1 }).setOrigin(0.5).setVisible(false));
      this.ui.bannerBack = addTo(fixed, this.add.rectangle(VW / 2, 174, 620, 78, C.black, 0.9).setVisible(false));
      this.ui.bannerLine = addTo(fixed, this.add.rectangle(VW / 2, 135, 620, 3, C.cyan, 1).setVisible(false));
      this.ui.banner = addTo(fixed, this.add.text(VW / 2, 162, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 2, align: 'center', wordWrap: { width: 580 } }).setOrigin(0.5).setVisible(false));
      this.ui.bannerSub = addTo(fixed, this.add.text(VW / 2, 205, '', { fontFamily: FONT, fontSize: '13px', color: '#9eb1c8', letterSpacing: 1, align: 'center', wordWrap: { width: 570 } }).setOrigin(0.5).setVisible(false));
      this.ui.stick = addTo(fixed, this.add.circle(146, 606, 92, C.panel, 0.5).setStrokeStyle(3, C.cyan, 0.45));
      this.ui.stickRing = addTo(fixed, this.add.circle(146, 606, 52, C.panel2, 0.85).setStrokeStyle(2, C.white, 0.22));
      this.ui.stickDot = addTo(fixed, this.add.circle(146, 606, 21, C.cyan, 0.8));
      this.ui.punchButton = addTo(fixed, this.add.rectangle(1130, 604, 150, 92, C.orange, 0.88).setStrokeStyle(3, C.yellow, 0.8));
      this.ui.punchLabel = addTo(fixed, this.add.text(1130, 604, 'PUNCH', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#070a12', letterSpacing: 2 }).setOrigin(0.5));
      this.ui.jumpButton = addTo(fixed, this.add.rectangle(955, 604, 135, 72, C.panel2, 0.9).setStrokeStyle(2, C.cyan, 0.72));
      this.ui.jumpLabel = addTo(fixed, this.add.text(955, 604, 'JUMP', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 2 }).setOrigin(0.5));
      this.ui.dodgeButton = addTo(fixed, this.add.rectangle(800, 604, 120, 62, C.panel2, 0.9).setStrokeStyle(2, C.violet, 0.72));
      this.ui.dodgeLabel = addTo(fixed, this.add.text(800, 604, 'DODGE', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 2 }).setOrigin(0.5));
      this.makeTitlePanel();
      this.makeResultPanel();
      this.makeUpgradePanel();
      this.resizeHud();
      this.paintHud(false);
    },

    makeButton: function (x, y, w, h, label, color) {
      var r = addTo(this.ui.root, this.add.rectangle(x, y, w, h, color || C.panel2, 0.95).setStrokeStyle(2, C.cyan, 0.55));
      var t = addTo(this.ui.root, this.add.text(x, y, label, { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#f4f7fb', align: 'center', letterSpacing: 1, wordWrap: { width: w - 28 } }).setOrigin(0.5));
      return { x: x, y: y, w: w, h: h, rect: r, text: t, label: label, enabled: true, action: null };
    },

    resizeHud: function () {
      if (!this.ui || !this.game || !this.game.canvas) return;
      var canvas = this.game.canvas, r = canvas.getBoundingClientRect(), vw = Math.max(1, r.width), vh = Math.max(1, r.height);
      var ratio = Math.min(vw / VW, vh / VH), compact = vw < 720;
      var vv = window.visualViewport, leftInset = vv ? Math.max(0, vv.offsetLeft) : 0, topInset = vv ? Math.max(0, vv.offsetTop) : 0;
      var safeX = Math.min(42, Math.max(10, leftInset / ratio + 10)), safeY = Math.min(30, Math.max(8, topInset / ratio + 8));
      if (safeX === this.ui.safeX && safeY === this.ui.safeY && compact === this.ui.compact) return;
      this.ui.safeX = safeX; this.ui.safeY = safeY; this.ui.compact = compact; this.ui.root.setPosition(safeX, safeY);
      this.ui.brand.setFontSize(compact ? '15px' : '18px'); this.ui.sub.setFontSize(compact ? '8px' : '10px');
      this.ui.stage.setFontSize(compact ? '14px' : '15px'); this.ui.block.setFontSize(compact ? '13px' : '14px');
      this.ui.score.setFontSize(compact ? '15px' : '16px'); this.ui.combo.setFontSize(compact ? '13px' : '14px');
      this.ui.health.setFontSize(compact ? '14px' : '14px'); this.ui.weapon.setFontSize(compact ? '13px' : '13px'); this.ui.lives.setFontSize(compact ? '15px' : '16px');
      this.ui.coach.setFontSize(compact ? '15px' : '16px'); this.ui.event.setFontSize(compact ? '15px' : '16px'); this.ui.banner.setFontSize(compact ? '22px' : '24px');
      this.ui.help.setFontSize(compact ? '9px' : '11px'); this.ui.unlock.setFontSize(compact ? '10px' : '12px');
      this.ui.dodgeButton.setScale(compact ? 0.92 : 1); this.ui.dodgeLabel.setScale(compact ? 0.92 : 1);
    },

    makeTitlePanel: function () {
      var u = this.ui;
      u.titleBack = addTo(u.root, this.add.rectangle(VW / 2, 395, 1090, 430, C.black, 0.78));
      u.titleRule = addTo(u.root, this.add.rectangle(VW / 2, 225, 730, 3, C.cyan, 0.8));
      u.title = addTo(u.root, this.add.text(VW / 2, 178, 'BACKSTREET RECKONING', { fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 6 }).setOrigin(0.5));
      u.titleKicker = addTo(u.root, this.add.text(VW / 2, 244, 'A SEEDED STREET RUN IN THREE LANES', { fontFamily: FONT, fontSize: '13px', color: '#72f6e2', letterSpacing: 3 }).setOrigin(0.5));
      u.titleCopy = addTo(u.root, this.add.text(VW / 2, 286, 'Line up your depth. Build the three-hit rhythm.\nGrab a downed rival, then throw them through the gang.', { fontFamily: FONT, fontSize: '16px', color: '#c9d8e8', align: 'center', lineSpacing: 7 }).setOrigin(0.5));
      u.menuButtons = [this.makeButton(400, 420, 240, 84, 'STREET RUN\n3 BLOCKS + BOSS', C.panel2), this.makeButton(665, 420, 240, 84, 'GAUNTLET\nCHAIN STAGES', C.panel2), this.makeButton(930, 420, 240, 84, 'BOSS RUSH\nLOCKED', C.panel2)];
      u.menuButtons[0].action = 'street'; u.menuButtons[1].action = 'gauntlet'; u.menuButtons[2].action = 'bossrush';
      u.help = addTo(u.root, this.add.text(VW / 2, 535, 'DRAG LEFT HALF OR WASD MOVE   PUNCH J   JUMP K   DODGE SHIFT   SWIPE TO THROW', { fontFamily: FONT, fontSize: '11px', color: '#9eb1c8', letterSpacing: 1, align: 'center' }).setOrigin(0.5));
      u.unlock = addTo(u.root, this.add.text(VW / 2, 578, '', { fontFamily: FONT, fontSize: '12px', color: '#ffd166', align: 'center' }).setOrigin(0.5));
    },

    makeResultPanel: function () {
      var u = this.ui;
      u.resultBack = addTo(u.root, this.add.rectangle(VW / 2, 394, 850, 420, C.black, 0.9).setVisible(false));
      u.resultTitle = addTo(u.root, this.add.text(VW / 2, 245, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 4, align: 'center' }).setOrigin(0.5).setVisible(false));
      u.resultCopy = addTo(u.root, this.add.text(VW / 2, 310, '', { fontFamily: FONT, fontSize: '15px', color: '#c9d8e8', align: 'center', lineSpacing: 9 }).setOrigin(0.5).setVisible(false));
      u.resultButtons = [this.makeButton(490, 478, 230, 72, 'CONTINUE', C.panel2), this.makeButton(790, 478, 230, 72, 'TITLE', C.panel2)];
      u.resultButtons.forEach(function (b) { b.rect.setVisible(false); b.text.setVisible(false); });
      u.resultButtons[0].action = 'continue'; u.resultButtons[1].action = 'title';
    },

    makeUpgradePanel: function () {
      var u = this.ui;
      u.upgradeBack = addTo(u.root, this.add.rectangle(VW / 2, 395, 1030, 390, C.black, 0.95).setVisible(false));
      u.upgradeTitle = addTo(u.root, this.add.text(VW / 2, 248, 'CACHE CHOICE', { fontFamily: FONT, fontSize: '31px', fontStyle: 'bold', color: '#f4f7fb', letterSpacing: 4, align: 'center' }).setOrigin(0.5).setVisible(false));
      u.upgradeCopy = addTo(u.root, this.add.text(VW / 2, 303, 'Choose one permanent street upgrade', { fontFamily: FONT, fontSize: '15px', color: '#c9d8e8', align: 'center' }).setOrigin(0.5).setVisible(false));
      u.upgradeButtons = Object.keys(UPGRADE_DEFS).map(function (key, i) {
        var def = UPGRADE_DEFS[key]; var b = this.makeButton(350 + i * 290, 448, 240, 128, def.label + '\nTIER 0/3\n' + def.copy, def.color);
        b.action = key; b.rect.setFillStyle(C.panel2, 0.98); b.rect.setStrokeStyle(2, def.color, 0.85); b.rect.setVisible(false); b.text.setVisible(false); return b;
      }, this);
    },

    bindGGInput: function () {
      var self = this;
      var canvas = this.game.canvas;
      var pointerMeta = {};
      function point(e) {
        var r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * VW / Math.max(1, r.width), y: (e.clientY - r.top) * VH / Math.max(1, r.height) };
      }
      function seedPointer(e, zone) {
        var p = kit.input.pointers.get(e.pointerId);
        if (!p) {
          p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: null };
          kit.input.pointers.set(e.pointerId, p);
        }
        p.zone = zone; pointerMeta[e.pointerId] = { zone: zone, startX: e.clientX, startY: e.clientY };
        return p;
      }
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        var q = point(e), zone = 'menu';
        if (self.ui.screen === 'play' && !kit.paused) {
          if (q.x < VW * 0.5 && q.y > 100) zone = 'stick';
          else if (q.x > 1060 && q.y > 540) zone = 'punch';
          else if (q.x > 875 && q.y > 545) zone = 'jump';
          else if (q.x > 735 && q.x <= 875 && q.y > 555) zone = 'dodge';
          else if (q.x > 1175 && q.y < 90) zone = 'pause';
          else zone = 'world';
        } else if (self.ui.screen === 'pause') zone = 'resume';
        else if (self.ui.screen === 'upgrade') zone = 'upgrade';
        var p = seedPointer(e, zone);
        if (zone === 'punch') input.punchQueued = true;
        if (zone === 'jump') input.jumpQueued = true;
        if (zone === 'dodge') input.dodgeQueued = true;
        if (zone === 'stick') input.stickId = e.pointerId;
        if (zone === 'pause') self.togglePause();
        if (zone === 'resume') self.togglePause();
        if (p) p.zone = zone;
      }, { passive: false });
      canvas.addEventListener('pointerup', function (e) {
        e.preventDefault();
        var p = kit.input.pointers.get(e.pointerId) || pointerMeta[e.pointerId];
        if (p && p.zone === 'punch') {
          var dx = e.clientX - p.startX, dy = e.clientY - p.startY;
          if (Math.hypot(dx, dy) > 42) input.swipe = { dx: dx, dy: dy };
        }
        if (p && p.zone === 'stick' && input.stickId === e.pointerId) { input.stickId = null; input.ix = 0; input.iz = 0; }
        var q = point(e);
        if (self.ui.screen === 'title') self.handleMenuTap(q.x, q.y);
        else if (self.ui.screen === 'result') self.handleResultTap(q.x, q.y);
        else if (self.ui.screen === 'upgrade') self.handleUpgradeTap(q.x, q.y);
        else if (self.ui.screen === 'play' && q.x > 1175 && q.y < 90) self.togglePause();
        delete pointerMeta[e.pointerId];
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }, { passive: false });
      canvas.addEventListener('pointercancel', function (e) {
        if (input.stickId === e.pointerId) { input.stickId = null; input.ix = 0; input.iz = 0; }
        delete pointerMeta[e.pointerId];
        kit.input.pointers.delete(e.pointerId);
      }, { passive: true });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      window.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        if (e.code === 'Escape') input.pauseQueued = true;
        if (e.code === 'KeyR') input.restartQueued = true;
      });
    },

    handleMenuTap: function (x, y) {
      var buttons = this.ui.menuButtons;
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2) {
          if (b.action === 'bossrush' && !profile.bossRush) return;
          this.startRun(b.action); return;
        }
      }
    },

    handleResultTap: function (x, y) {
      for (var i = 0; i < this.ui.resultButtons.length; i++) {
        var b = this.ui.resultButtons[i];
        if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2) {
          if (b.action === 'title') this.returnTitle();
          else this.resultContinue();
        }
      }
    },

    handleUpgradeTap: function (x, y) {
      if (state.screen !== 'upgrade') return;
      for (var i = 0; i < this.ui.upgradeButtons.length; i++) {
        var b = this.ui.upgradeButtons[i];
        if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2) { this.chooseUpgrade(b.action); return; }
      }
    },

    togglePause: function () {
      if (state.screen === 'pause') kit.resume('manual');
      else if (state.screen === 'play') kit.pause('manual');
    },

    showTitle: function () {
      state.screen = 'title'; state.mode = 'title';
      this.ui.screen = 'title';
      this.ui.bannerBack.setVisible(false); this.ui.bannerLine.setVisible(false); this.ui.banner.setVisible(false); this.ui.bannerSub.setVisible(false); this.clearTransients();
      this.ui.titleBack.setVisible(true); this.ui.titleRule.setVisible(true); this.ui.title.setVisible(true); this.ui.titleKicker.setVisible(true); this.ui.titleCopy.setVisible(true); this.ui.help.setVisible(true); this.ui.unlock.setVisible(true);
      this.ui.menuButtons.forEach(function (b) { b.rect.setVisible(true); b.text.setVisible(true); });
      this.ui.resultBack.setVisible(false); this.ui.resultTitle.setVisible(false); this.ui.resultCopy.setVisible(false); this.ui.resultButtons.forEach(function (b) { b.rect.setVisible(false); b.text.setVisible(false); });
      this.ui.upgradeBack.setVisible(false); this.ui.upgradeTitle.setVisible(false); this.ui.upgradeCopy.setVisible(false); this.ui.upgradeButtons.forEach(function (b) { b.rect.setVisible(false); b.text.setVisible(false); });
      this.ui.comboChipBack.setVisible(false); this.ui.comboChip.setVisible(false);
      this.baseCamX = 0; this.cameras.main.setScroll(0, 0); this.ui.bannerUntil = 0; this.ui.bannerWallUntil = 0;
      this.popups.forEach(function (p) { p.destroy(); }); this.popups.length = 0;
      if (this.tweens && this.tweens.killAll) this.tweens.killAll();
      var unlockText = profile.bossRush ? 'BOSS RUSH ONLINE' : 'CLEAR A STAGE TO UNLOCK BOSS RUSH';
      if (profile.finalBoss) unlockText += '   //   THE RECKONING IS OPEN';
      unlockText += '   //   BEST SCORE ' + profile.bestScore;
      setTextIfChanged(this.ui.unlock, unlockText);
      var rush = this.ui.menuButtons[2];
      setTextIfChanged(rush.text, profile.bossRush ? 'BOSS RUSH\n' + (profile.finalBoss ? 'RECKONING OPEN' : '3 BOSS ALLEYS') : 'BOSS RUSH\nLOCKED');
      rush.rect.setFillStyle(profile.bossRush ? C.panel2 : C.black, 0.95); rush.rect.setStrokeStyle(2, profile.bossRush ? C.red : C.steel, 0.65);
      this.paintHud(false);
    },

    returnTitle: function () {
      this.clearActors();
      state.lives = 3; state.score = 0; state.combo = 0; state.block = 0; state.stage = 1;
      state.screen = 'title'; state.upgradeChoice = null; input.pauseQueued = false; input.restartQueued = false;
      if (kit.paused) kit.resume('manual');
      this.showTitle();
    },

    startRun: function (mode) {
      if (mode === 'bossrush' && !profile.bossRush) return;
      this.clearTransients(); this.clearActors();
      state.mode = mode; state.screen = 'play'; this.ui.screen = 'play'; state.stage = 1; state.block = 0; state.lives = 3; state.score = 0; state.runTime = 0; state.stageTime = 0; state.deaths = 0; state.combo = 0; state.maxCombo = 0; state.seed = 7331 + profile.runs * 101 + (mode === 'gauntlet' ? 9001 : mode === 'bossrush' ? 17001 : 0); profile.runs++; saveNow();
      this.hideMenuPanels();
      if (mode === 'bossrush') { state.bossRushIndex = 0; this.buildStage(1, true); }
      else this.buildStage(1, false);
      kit.audio.music('crowd', 500);
    },

    showUpgradeChoice: function () {
      state.screen = 'upgrade'; this.ui.screen = 'upgrade'; state.upgradeChoice = true;
      this.ui.upgradeBack.setVisible(true); this.ui.upgradeTitle.setVisible(true); this.ui.upgradeCopy.setVisible(true);
      this.ui.upgradeButtons.forEach(function (b) {
        var level = profile.upgrades[b.action] || 0, def = UPGRADE_DEFS[b.action];
        setTextIfChanged(b.text, def.label + '\nTIER ' + level + '/' + def.max + '\n' + (level >= def.max ? 'MAXED' : def.copy));
        b.enabled = level < def.max; b.rect.setAlpha(level >= def.max ? 0.38 : 1); b.text.setAlpha(level >= def.max ? 0.55 : 1); b.rect.setVisible(true); b.text.setVisible(true);
      });
      this.clearTransients();
      this.paintHud(true);
      kit.audio.sfx('pickup', { volume: 0.8, rate: 1.2 });
    },
    chooseUpgrade: function (key) {
      var def = UPGRADE_DEFS[key]; if (!def || !state.upgradeChoice || (profile.upgrades[key] || 0) >= def.max) return;
      profile.upgrades[key] = Math.min(def.max, (profile.upgrades[key] || 0) + 1); saveNow();
      state.upgradeChoice = null; state.screen = 'play'; this.ui.screen = 'play';
      this.ui.upgradeBack.setVisible(false); this.ui.upgradeTitle.setVisible(false); this.ui.upgradeCopy.setVisible(false); this.ui.upgradeButtons.forEach(function (b) { b.rect.setVisible(false); b.text.setVisible(false); });
      this.ui.bannerUntil = 0; this.ui.bannerWallUntil = 0; this.showEvent(def.label + ' TIER ' + profile.upgrades[key], def.color, 0.9);
      this.fx.loot.emitParticleAt(this.player.x, laneY(this.player.z) - 70, motionOn() ? 16 : 5); kit.audio.sfx('pickup', { volume: 0.85, rate: 1.35 });
    },

    hideMenuPanels: function () {
      this.ui.titleBack.setVisible(false); this.ui.titleRule.setVisible(false); this.ui.title.setVisible(false); this.ui.titleKicker.setVisible(false); this.ui.titleCopy.setVisible(false); this.ui.help.setVisible(false); this.ui.unlock.setVisible(false); this.ui.menuButtons.forEach(function (b) { b.rect.setVisible(false); b.text.setVisible(false); });
    },

    buildStage: function (stage, bossRushOnly) {
      state.stage = stage; state.stageTime = 0; state.block = bossRushOnly ? 3 : 0; state.bossName = BOSS_NAMES[Math.min(BOSS_NAMES.length - 1, stage - 1)];
      this.clearActors();
      var p = this.spawnPlayer(BLOCK_W * state.block + 170, LANES[1]);
      this.player = p; this.buildBlock(state.block, bossRushOnly);
      this.showBoundary('STAGE ' + stage, bossRushOnly ? 'BOSS RUSH' : 'STREET RUN', C.cyan, 1.8);
    },

    buildBlock: function (index, bossRushOnly) {
      index = clamp(index, 0, 3); state.block = index; state.blockName = BLOCKS[index].name; state.camLocked = false; state.blockClear = false; state.blockExitX = (index + 1) * BLOCK_W - 170; state.forceMessage = '';
      this.waveDefs = this.makeWaveDefs(index, bossRushOnly); this.waveIndex = 0; this.waveActive = false; this.pending = []; this.spawnTimer = 0; this.waveClearTimer = 0; this.blockAdvanceTimer = 0;
      this.rng = seeded(state.seed + state.stage * 3571 + index * 887);
      this.clearPropsAndItems();
      if (!this.player) this.player = this.spawnPlayer(index * BLOCK_W + 170, LANES[1]);
      this.player.x = index * BLOCK_W + 170; this.player.z = LANES[1]; this.player.y = 0; this.player.vy = 0; this.player.state = 'idle'; this.player.action = null; this.player.carry = null; this.player.weapon = null; this.player.hp = Math.min(this.player.maxhp, this.player.hp + 28);
      var start = index * BLOCK_W;
      var b = BLOCKS[index];
      for (var i = 0; i < 7; i++) this.spawnProp(start + 270 + i * 190 + Math.floor(this.rng() * 80), choose(LANES, this.rng), i % 3 === 0 ? 'barrel' : 'bin');
      this.spawnItem(b.weapon, start + 900, LANES[index % 3]);
      this.spawnItem('food', start + 1110, LANES[(index + 1) % 3]);
      this.spawnItem('score', start + 1400, LANES[(index + 2) % 3]);
      this.spawnItem('upgrade', start + 1260, LANES[(index + 2) % 3]);
      if (this.cacheBank.length) {
        var carried = this.cacheBank.splice(0);
        for (var c = 0; c < carried.length; c++) this.spawnItem(carried[c], start + 220 + c * 92, LANES[c % LANES.length]);
      }
      var hazardX = [start + 540, start + 1080, start + 1370];
      for (var h = 0; h < hazardX.length; h++) this.spawnHazard(b.hazard, hazardX[h], LANES[(h + index) % LANES.length], h);
      this.paintHud(true);
    },

    makeWaveDefs: function (index, bossRushOnly) {
      var source = BLOCKS[index].waves;
      if (bossRushOnly || index === 3) return [{ trigger: 220, list: ['scrapper', 'flicker', 'heavy'] }, { trigger: 510, list: ['boss'] }];
      var out = [];
      for (var i = 0; i < source.length; i++) {
        var list = source[i].slice();
        if (state.stage > 1 && i === source.length - 1) list.push(state.stage > 2 ? 'heavy' : 'scrapper');
        if (state.stage > 2 && index > 0) list.push('flicker');
        out.push({ trigger: 310 + i * 465, list: list });
      }
      return out;
    },

    clearActors: function () {
      if (this.foes) this.foes.forEach(function (f) { if (f.render) { f.render.sprite.destroy(); f.render.shadow.destroy(); } });
      if (this.props) this.props.forEach(function (p) { if (p.render) p.render.destroy(); });
      if (this.items) this.items.forEach(function (it) { if (it.render) it.render.destroy(); });
      if (this.hazards) this.hazards.forEach(function (h) { if (h.render) h.render.destroy(); });
      if (this.projectiles) this.projectiles.length = 0;
      this.foes = []; this.props = []; this.items = []; this.hazards = []; this.cacheBank = [];
      if (this.player && this.player.render) { this.player.render.sprite.destroy(); this.player.render.shadow.destroy(); }
      this.player = null;
    },
    clearPropsAndItems: function () {
      this.props.forEach(function (p) { if (p.render) p.render.destroy(); });
      this.items.forEach(function (it) { if (it.render) it.render.destroy(); });
      this.props.length = 0; this.items.length = 0;
      this.hazards.forEach(function (h) { if (h.render) h.render.destroy(); }); this.hazards.length = 0;
      this.foes.forEach(function (f) { if (f.render) { f.render.sprite.destroy(); f.render.shadow.destroy(); } });
      this.foes.length = 0; this.projectiles.length = 0;
    },

    preserveLoot: function () {
      for (var i = 0; i < this.items.length; i++) this.cacheBank.push(this.items[i].kind);
    },

    spawnPlayer: function (x, z) {
      var p = { kind: 'player', type: 'player', x: x, z: z, y: 0, vy: 0, vx: 0, vz: 0, face: 1, hp: 120, maxhp: 120, state: 'idle', action: null, inv: 1, carry: null, weapon: null, comboStep: 0, comboTimer: 0, downTimer: 0, anim: 0, render: null };
      p.width = 48; p.dodgeTimer = 0; p.hazardCooldown = 0; p.stats = profile.upgrades;
      p.render = this.makeActorRender(p, 'sheet-player');
      return p;
    },
    spawnFoe: function (type, side) {
      var def = FOES[type] || FOES.scrapper;
      var x = clamp((this.cameras.main.scrollX || 0) + (side > 0 ? 1030 : 120), state.block * BLOCK_W + 90, (state.block + 1) * BLOCK_W - 100);
      var f = { kind: 'foe', type: type, x: x, z: choose(LANES, this.rng), y: 0, vy: 0, vx: 0, vz: 0, face: side > 0 ? -1 : 1, hp: Math.round(def.hp * (1 + (state.stage - 1) * 0.18)), maxhp: Math.round(def.hp * (1 + (state.stage - 1) * 0.18)), speed: def.speed * (1 + Math.min(0.35, (state.stage - 1) * 0.08)), damage: Math.round(def.damage * (1 + (state.stage - 1) * 0.12)), score: def.score, width: def.width || 36, state: 'idle', action: null, inv: 0.16, downTimer: 0, deadTimer: 0, hitStack: 0, aiTimer: 0.3 + this.rng() * 0.8, aiPhase: this.rng() * Math.PI * 2, targetLane: 0.5, telegraph: 0, anim: this.rng() * 5, render: null };
      f.targetLane = f.z;
      if (type === 'boss') { f.name = BOSS_NAMES[Math.min(BOSS_NAMES.length - 1, state.stage - 1)]; f.maxhp = Math.round(def.hp * (1 + (state.stage - 1) * 0.45)); f.hp = f.maxhp; f.width = 60; state.bossName = f.name; }
      f.render = this.makeActorRender(f, 'sheet-' + (type === 'acrobat' ? 'acrobat' : type));
      this.foes.push(f); return f;
    },
    makeActorRender: function (e, sheet) {
      var shadow = this.add.image(e.x, laneY(e.z) + 5, 'shadow').setOrigin(0.5, 0.5).setDepth(80);
      var sprite = this.add.sprite(e.x, laneY(e.z), sheet, 0).setOrigin(0.5, 1).setDepth(200);
      return { sprite: sprite, shadow: shadow };
    },
    spawnProp: function (x, z, kind) {
      var p = { x: x, z: z, kind: kind, width: kind === 'barrel' ? 54 : 48, hp: 2, hit: 0, render: this.add.image(x, laneY(z), kind).setOrigin(0.5, 1).setDepth(90) };
      p.render.setScale(scaleZ(z)); this.props.push(p); return p;
    },
    spawnHazard: function (kind, x, z, index) {
      var key = kind === 'puddle' ? 'puddle-hazard' : kind === 'slick' ? 'slick-hazard' : kind === 'steam' ? 'steam-hazard' : 'slick-hazard';
      var h = { kind: kind, x: x, z: z, width: kind === 'steam' ? 72 : 210, damage: kind === 'gate' ? 16 : 10, timer: index * 0.6, cycle: kind === 'steam' ? 2.8 : 0, active: kind !== 'steam', warning: 0, render: this.add.image(x, laneY(z) + 2, key).setOrigin(0.5, 1).setDepth(75) };
      h.render.setScale(scaleZ(z)); h.render.setAlpha(kind === 'steam' ? 0.42 : 0.68); this.hazards.push(h); return h;
    },
    spawnItem: function (kind, x, z) {
      var key = kind === 'food' ? 'food' : kind === 'pipe' ? 'pipe' : kind === 'upgrade' ? 'upgrade' : 'crate';
      var it = { kind: kind, x: x, z: z, bob: this.rng() * 5, render: this.add.image(x, laneY(z) - 18, key).setOrigin(0.5, 1).setDepth(110) };
      if (kind === 'score') { it.render.setTint(C.yellow); it.render.setScale(0.78); }
      if (kind === 'upgrade') it.render.setScale(0.72);
      this.items.push(it); return it;
    },

    step: function (dt) {
      if (state.screen !== 'play' || kit.paused) return;
      state.runTime += dt; state.stageTime += dt;
      this.readInput();
      this.consumeDebugSwitches();
      var commands = { punch: input.punchQueued, jump: input.jumpQueued, dodge: input.dodgeQueued, swipe: input.swipe };
      input.punchQueued = false; input.jumpQueued = false; input.dodgeQueued = false; input.swipe = null;
      this.updatePlayer(this.player, dt, commands);
      this.updateFoes(dt);
      this.updateProjectiles(dt);
      this.updateProps(dt);
      this.updateItems(dt);
      this.updateHazards(dt);
      this.updateWaves(dt);
      this.updateOnboarding();
      this.updateCamera();
      this.updateRender(dt);
      this.paintHud(true);
    },

    readInput: function () {
      var k = kit.input;
      var punch = k.keyDown('KeyJ') || k.keyDown('Space') || k.keyDown('KeyX');
      var jump = k.keyDown('KeyK') || k.keyDown('KeyZ');
      var dodge = k.keyDown('ShiftLeft') || k.keyDown('ShiftRight') || k.keyDown('ControlLeft') || k.keyDown('KeyL');
      if (punch && !input.prevPunch) input.punchQueued = true;
      if (jump && !input.prevJump) input.jumpQueued = true;
      if (dodge && !input.prevDodge) input.dodgeQueued = true;
      if (k.keyDown('Enter') && !input.prevEnter && state.screen === 'title') this.startRun('street');
      input.prevPunch = punch; input.prevJump = jump; input.prevDodge = dodge; input.prevEnter = k.keyDown('Enter');
      input.ix = 0; input.iz = 0;
      var best = null;
      kit.input.pointers.forEach(function (p, id) {
        if (p.zone === 'stick' && (input.stickId === null || input.stickId === id)) best = p;
      });
      if (best) {
        var canvas = this.game.canvas, r = canvas.getBoundingClientRect();
        var sx = (best.startX - r.left) * VW / Math.max(1, r.width), sy = (best.startY - r.top) * VH / Math.max(1, r.height);
        var x = (best.x - r.left) * VW / Math.max(1, r.width), y = (best.y - r.top) * VH / Math.max(1, r.height);
        input.ix = clamp((x - sx) / 84, -1, 1); input.iz = clamp((y - sy) / 84, -1, 1);
      }
      var kmx = (k.keyDown('ArrowLeft') || k.keyDown('KeyA') ? -1 : 0) + (k.keyDown('ArrowRight') || k.keyDown('KeyD') ? 1 : 0);
      var kmz = (k.keyDown('ArrowUp') || k.keyDown('KeyW') ? -1 : 0) + (k.keyDown('ArrowDown') || k.keyDown('KeyS') ? 1 : 0);
      if (kmx || kmz) { input.ix = clamp(input.ix + kmx, -1, 1); input.iz = clamp(input.iz + kmz, -1, 1); }
      if (input.padX || input.padZ) { input.ix = clamp(input.ix + input.padX, -1, 1); input.iz = clamp(input.iz + input.padZ, -1, 1); }
    },

    pollGamepad: function () {
      var pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      var pad = null; for (var i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
      input.padX = 0; input.padZ = 0;
      if (!pad) { input.padPrev = { punch: false, jump: false, dodge: false, pause: false, restart: false }; return; }
      function axis(n) { var v = Number(pad.axes[n]) || 0; return Math.abs(v) < 0.18 ? 0 : clamp(v, -1, 1); }
      function button(n) { return !!(pad.buttons[n] && pad.buttons[n].pressed); }
      input.padX = axis(0); input.padZ = axis(1);
      var now = { punch: button(2) || button(3), jump: button(0), dodge: button(1), pause: button(9), restart: button(8) };
      if (now.punch && !input.padPrev.punch) input.punchQueued = true;
      if (now.jump && !input.padPrev.jump) input.jumpQueued = true;
      if (now.dodge && !input.padPrev.dodge) input.dodgeQueued = true;
      if (now.pause && !input.padPrev.pause) input.pauseQueued = true;
      if (now.restart && !input.padPrev.restart) input.restartQueued = true;
      input.padPrev = now;
    },

    processGlobalInput: function () {
      this.pollGamepad();
      if (state.screen === 'upgrade') {
        if (kit.input.keyDown('Digit1')) this.chooseUpgrade('power');
        else if (kit.input.keyDown('Digit2')) this.chooseUpgrade('armor');
        else if (kit.input.keyDown('Digit3')) this.chooseUpgrade('agility');
      }
      if (input.pauseQueued) { input.pauseQueued = false; if (state.screen === 'title') this.startRun('street'); else if (state.screen === 'result') this.resultContinue(); else if (state.screen === 'play' || state.screen === 'pause') this.togglePause(); }
      if (input.restartQueued) {
        input.restartQueued = false;
        if (state.screen === 'pause' || state.screen === 'result') this.returnTitle();
        else if (state.screen === 'title') this.startRun('street');
      }
    },

    consumeDebugSwitches: function () {
      if (debugBridge.forceBoss) { debugBridge.forceBoss = false; this.forceBoss(); return; }
      if (debugBridge.forceBlock !== false && debugBridge.forceBlock !== 0 && debugBridge.forceBlock !== null) {
        var n = Number(debugBridge.forceBlock); debugBridge.forceBlock = false;
        this.forceBlock(Number.isFinite(n) ? n : state.block + 1);
      }
    },
    forceBlock: function (n) {
      if (state.screen !== 'play') return;
      var index = clamp(Math.round(n > 0 ? n - 1 : n), 0, 2);
      this.buildBlock(index, false); this.showEvent('BLOCK ' + (index + 1), C.cyan, 0.9);
    },
    forceBoss: function () {
      if (state.screen !== 'play') return;
      this.buildBlock(3, true); this.showEvent('BOSS ' + state.bossName, C.red, 0.9);
    },

    updatePlayer: function (p, dt, cmd) {
      if (!p) return;
      p.anim += dt * 8; if (p.inv > 0) p.inv -= dt; if (p.comboTimer > 0) p.comboTimer -= dt; if (p.hazardCooldown > 0) p.hazardCooldown -= dt;
      if (p.state === 'dodge') {
        p.dodgeTimer -= dt; p.x += p.vx * dt; p.z = clamp(p.z + p.vz * dt, 0.08, 0.94); p.vx *= 0.86; p.inv = Math.max(p.inv, 0.08);
        if (p.dodgeTimer <= 0) { p.state = 'idle'; p.inv = Math.max(p.inv, 0.12); }
        this.clampPlayer(p); return;
      }
      if (p.state === 'down') {
        p.downTimer += dt; p.y += p.vy * dt; p.vy += GRAVITY * dt; p.x += p.vx * dt; p.vx *= 0.88;
        if (p.y >= 0) { p.y = 0; p.vy = 0; p.vx *= 0.45; }
        if (p.downTimer > 0.95) { if (p.hp <= 0) { this.loseLife(); return; } p.state = 'idle'; p.inv = 1.2; p.downTimer = 0; }
        this.clampPlayer(p); return;
      }
      if (p.state === 'hurt') { p.x += p.vx * dt; p.vx *= 0.84; p.downTimer -= dt; if (p.downTimer <= 0) p.state = 'idle'; this.clampPlayer(p); return; }
      if (p.action) {
        if (p.action.kind === 'grab' && (cmd.swipe || cmd.punch)) { p.action = null; this.beginThrow(p, cmd.swipe || { dx: p.face * 100, dy: 0 }); return; }
        p.action.t += dt;
        if (!p.action.struck && p.action.t >= p.action.strike) { p.action.struck = true; if (p.action.kind === 'throw') this.releaseThrow(p); else if (p.action.kind !== 'grab') this.resolvePlayerAttack(p); }
        if (p.action.t >= p.action.dur) { p.action = null; if (p.state !== 'down') p.state = 'idle'; }
        if (p.y < -2 || p.vy < 0) { p.y += p.vy * dt; p.vy += GRAVITY * dt; if (p.y >= 0) { p.y = 0; p.vy = 0; if (!p.action) p.state = 'idle'; } }
        if (p.action && p.action.kind === 'throw') { this.clampPlayer(p); return; }
        if (p.action) { var attackPrevX = p.x; p.x += p.face * (p.action.kind === 'weapon' ? 54 : p.action.kind === 'kick' ? 42 : 25) * dt; this.resolvePropCollision(p, attackPrevX); this.clampPlayer(p); return; }
      }
      var airborne = p.y < -2 || p.vy < 0;
      if (airborne) {
        p.y += p.vy * dt; p.vy += GRAVITY * dt;
        if (p.y >= 0) { p.y = 0; p.vy = 0; p.state = 'idle'; this.fx.dust.emitParticleAt(p.x, laneY(p.z), motionOn() ? 5 : 2); }
      } else if (cmd.dodge) { this.beginDodge(p); return; }
      else if (cmd.jump) { p.vy = -650; p.y = -2; p.state = 'jump'; this.onboard.jumped = true; this.fx.dust.emitParticleAt(p.x, laneY(p.z), 4); kit.audio.sfx('ui', { volume: 0.35, rate: 1.35 }); }
      if (cmd.punch) this.handlePunch(p, airborne);
      if (!p.action) {
        var m = Math.hypot(input.ix, input.iz); if (m > 1) { input.ix /= m; input.iz /= m; }
        p.vx = input.ix * (p.carry ? 95 : 220); p.vz = input.iz * (p.carry ? 0.22 : 0.58);
        if (Math.abs(input.ix) > 0.2) p.face = sign(input.ix);
        var prevX = p.x; p.x += p.vx * dt; if (!airborne) p.z = clamp(p.z + p.vz * dt, 0.08, 0.94); this.resolvePropCollision(p, prevX);
        if (!airborne) p.state = m > 0.12 ? 'walk' : 'idle';
        if (m > 0.12) this.onboard.moved = true;
      }
      if (p.carry && cmd.swipe) this.beginThrow(p, cmd.swipe);
      this.collectItems(p);
      this.clampPlayer(p);
    },
    beginDodge: function (p) {
      if (p.state === 'down' || p.action || p.y < -2 || p.dodgeTimer > 0) return;
      var agility = profile.upgrades.agility || 0; p.state = 'dodge'; p.dodgeTimer = 0.34 + agility * 0.035; p.inv = 0.28 + agility * 0.05; p.vx = p.face * (330 + agility * 28); p.vz = clamp(input.iz, -1, 1) * 0.78; this.onboard.dodged = true;
      this.fx.dodge.emitParticleAt(p.x - p.face * 22, laneY(p.z) - 48, motionOn() ? 9 : 3); kit.audio.sfx('dodge', { volume: 0.65, rate: 1.1 + agility * 0.05 }); this.showEvent('I-FRAMES', C.cyan, 0.8);
    },
    resolvePropCollision: function (actor, previousX) {
      for (var i = 0; i < this.props.length; i++) {
        var prop = this.props[i]; if (Math.abs(prop.z - actor.z) > LANE_TOL || Math.abs(actor.y) > 24) continue;
        var gap = (actor.width || 48) * 0.5 + prop.width * 0.5, dx = actor.x - prop.x;
        if (Math.abs(dx) >= gap) continue;
        if (previousX <= prop.x) actor.x = prop.x - gap; else actor.x = prop.x + gap;
      }
    },
    clampPlayer: function (p) { var min = state.block * BLOCK_W + 86, max = (state.block + 1) * BLOCK_W - 86; p.x = clamp(p.x, min, max); },
    handlePunch: function (p, airborne) {
      this.onboard.punched = true;
      if (p.carry) { this.beginThrow(p, { dx: p.face * 100, dy: 0 }); return; }
      if (airborne) { this.startAttack(p, { kind: 'kick', dur: 0.40, strike: 0.12, damage: 24, reach: 112, knock: true }); return; }
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i]; if (it.kind === 'food' || it.kind === 'score' || it.kind === 'upgrade') continue;
        if (Math.abs(it.x - p.x) < 74 && Math.abs(it.z - p.z) < 0.14) { p.weapon = { kind: it.kind, uses: it.kind === 'pipe' ? 7 : 3 }; this.removeItem(it); kit.audio.sfx('weapon', { volume: 0.7 }); this.popup(p.x, laneY(p.z) - 100, it.kind === 'pipe' ? 'PIPE READY' : 'CRATE READY', C.yellow); return; }
      }
      for (var j = 0; j < this.foes.length; j++) {
        var f = this.foes[j]; if (f.state === 'down' && f.hp > 0 && laneMatch(p, f) && Math.abs(f.x - p.x) < 86) { f.state = 'carried'; f.carryBy = p; p.carry = f; p.action = { kind: 'grab', t: 0, dur: 0.32, strike: 0.18, struck: true }; p.state = 'grab'; kit.audio.sfx('grab', { volume: 0.9 }); this.popup(p.x, laneY(p.z) - 150, 'GRAB', C.yellow); return; }
      }
      if (p.comboTimer <= 0) p.comboStep = 0;
      var attack = p.weapon ? { kind: 'weapon', weaponKind: p.weapon.kind, dur: p.weapon.kind === 'pipe' ? 0.38 : 0.48, strike: p.weapon.kind === 'pipe' ? 0.13 : 0.17, damage: p.weapon.kind === 'pipe' ? 27 : 35, reach: p.weapon.kind === 'pipe' ? 142 : 126, knock: true } : p.comboStep === 0 ? { kind: 'jab', dur: 0.27, strike: 0.09, damage: 11, reach: 96, knock: false } : p.comboStep === 1 ? { kind: 'cross', dur: 0.29, strike: 0.10, damage: 14, reach: 102, knock: false } : { kind: 'finisher', dur: 0.43, strike: 0.14, damage: 25, reach: 120, knock: true };
      p.comboStep = (p.comboStep + 1) % 3; p.comboTimer = 0.68; this.startAttack(p, attack);
    },
    startAttack: function (p, attack) { p.action = { kind: attack.kind, weaponKind: attack.weaponKind, dur: attack.dur, strike: attack.strike, damage: attack.damage + (profile.upgrades.power || 0) * 4, reach: attack.reach, knock: attack.knock, t: 0, struck: false }; p.state = attack.kind === 'grab' ? 'grab' : 'attack'; p.vx = p.face * (attack.kind === 'weapon' ? 82 : attack.kind === 'kick' ? 64 : 52); kit.audio.sfx(attack.kind === 'weapon' ? 'weapon' : 'punch', { volume: 0.45, rate: attack.kind === 'kick' ? 0.82 : attack.kind === 'weapon' ? 0.9 : attack.kind === 'finisher' ? 0.72 : 1 }); },
    beginThrow: function (p, swipe) { if (!p.carry || p.action) return; var d = Math.hypot(swipe.dx, swipe.dy) || 1; p.face = sign(swipe.dx) || p.face; p.action = { kind: 'throw', t: 0, dur: 0.48, strike: 0.25, damage: 28, dx: swipe.dx / d, dy: swipe.dy / d, struck: false }; p.state = 'throw'; kit.audio.sfx('grab', { volume: 0.8, rate: 0.76 }); this.showEvent('RELEASE', C.yellow, 0.8); },
    releaseThrow: function (p) {
      var f = p.carry; if (!f) return; p.carry = null; f.carryBy = null; f.state = 'thrown'; f.inv = 0; f.vx = p.face * 470; f.vz = (p.action.dy || 0) * 0.74; f.vy = -320; f.y = -66; this.projectiles.push({ foe: f, x: f.x, z: f.z, y: f.y, vx: f.vx, vz: f.vz, vy: f.vy, life: 1.0, hit: false }); this.fx.sparks.emitParticleAt(f.x, laneY(f.z) - 70, motionOn() ? 10 : 4); kit.juice.shake(5, 150); },
    resolvePlayerAttack: function (p) {
      var a = p.action, hit = false;
      for (var i = 0; i < this.foes.length; i++) {
        var f = this.foes[i]; if (f.state === 'carried' || f.state === 'thrown' || f.state === 'ko') continue;
        if (!laneMatch(p, f) || Math.abs(f.y - p.y) > 95 || !this.inFront(p, f, a.reach)) continue;
        if (this.damageFoe(f, a.damage + (p.weapon ? 9 : 0), a.knock || !!p.weapon, p.face)) hit = true;
      }
      for (var j = this.props.length - 1; j >= 0; j--) { var prop = this.props[j]; if (Math.abs(prop.z - p.z) <= LANE_TOL && this.inFront(p, prop, a.reach)) { this.smashProp(prop); hit = true; } }
      if (hit) { kit.juice.hitStop(38); kit.juice.shake(a.knock ? 6 : 2.6, a.knock ? 190 : 90); this.fx.sparks.emitParticleAt(p.x + p.face * a.reach * 0.65, laneY(p.z) - 78, motionOn() ? (a.knock ? 18 : 8) : 3); }
      if (p.weapon && hit) { p.weapon.uses--; if (p.weapon.uses <= 0) { p.weapon = null; this.popup(p.x, laneY(p.z) - 120, 'WEAPON BROKE', C.dim); } }
    },
    inFront: function (a, b, reach) { var dx = b.x - a.x, half = ((a.width || 48) + (b.width || 36)) * 0.5; return (a.face > 0 ? dx > -half && dx < reach + half : dx < half && dx > -reach - half); },
    damageFoe: function (f, damage, knock, dir) {
      if (f.inv > 0 || f.state === 'down' || f.state === 'dead') return false;
      if (f.type === 'heavy' || f.type === 'boss') { f.hitStack++; if (!knock && f.hitStack < (f.type === 'boss' ? 4 : 3)) damage = Math.round(damage * 0.6); else if (knock) f.hitStack = 0; }
      f.hp -= damage; f.inv = 0.13; f.vx = dir * (knock ? 255 : 120); this.fx.sparks.emitParticleAt(f.x, laneY(f.z) - 83, motionOn() ? 8 : 3);
      if (f.hp <= 0) { f.hp = 0; f.state = 'ko'; f.deadTimer = f.type === 'boss' ? 1.25 : 0.72; f.vy = -330; f.vx = dir * 290; f.downTimer = 0; state.score += f.score; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.comboTimer = 1.45; this.popup(f.x, laneY(f.z) - 150, '+' + f.score, C.yellow); this.fx.death.emitParticleAt(f.x, laneY(f.z) - 70, motionOn() ? (f.type === 'boss' ? 34 : 18) : 5); this.fx.sparks.emitParticleAt(f.x, laneY(f.z) - 70, motionOn() ? 22 : 5); kit.juice.hitStop(f.type === 'boss' ? 74 : 42); kit.juice.shake(f.type === 'boss' ? 10 : 5, f.type === 'boss' ? 320 : 150); kit.audio.sfx(f.type === 'boss' ? 'boss' : 'break', { volume: f.type === 'boss' ? 1 : 0.7, rate: f.type === 'boss' ? 0.62 : 0.86 }); if (f.type === 'boss') this.showEvent('BOSS BROKEN', C.red, 0.95); }
      else if (knock) { f.state = 'down'; f.downTimer = 0; f.vy = -310; kit.audio.sfx('hit', { volume: 0.9, rate: 0.68 }); }
      else { f.state = 'hurt'; f.downTimer = 0.22; kit.audio.sfx('hit', { volume: 0.55, rate: 1.15 }); }
      return true;
    },
    damagePlayer: function (p, damage, knock, dir) {
      if (p.inv > 0 || p.state === 'down' || state.screen !== 'play') return;
      if (p.carry) p.carry.state = 'down'; p.carry = null; damage *= Math.max(0.4, 1 - (profile.upgrades.armor || 0) * 0.12); p.hp -= damage; p.inv = 0.7 + (profile.upgrades.armor || 0) * 0.04; state.combo = 0; state.deaths += p.hp <= 0 ? 1 : 0; p.vx = dir * (knock ? 250 : 125); p.vy = knock ? -350 : -120; p.state = knock ? 'down' : 'hurt'; p.downTimer = 0; this.fx.sparks.emitParticleAt(p.x, laneY(p.z) - 78, motionOn() ? 14 : 4); this.showDamageFlash(); kit.juice.shake(knock ? 8 : 4, knock ? 250 : 130); kit.audio.sfx('hurt', { volume: 0.9, rate: 0.58 });
    },
    showDamageFlash: function () {
      var flash = this.ui.damageFlash; if (!flash) return; flash.alpha = 0.36; if (motionOn()) this.tweens.add({ targets: flash, alpha: 0, duration: 260, ease: 'Cubic.Out' }); else flash.alpha = 0;
    },
    loseLife: function () {
      state.lives--; if (state.lives <= 0) { this.gameOver(); return; }
      this.projectiles.forEach(function (q) { if (q.foe) { q.foe.state = 'ko'; q.foe.y = 0; } }); this.projectiles.length = 0; this.player.carry = null; this.player.hp = this.player.maxhp; this.player.x = state.block * BLOCK_W + 170; this.player.z = LANES[1]; this.player.state = 'idle'; this.player.inv = 2.0; this.waveActive = false; this.pending = []; this.waveIndex = Math.max(0, this.waveIndex - 1); this.foes.forEach(function (f) { if (f.render) { f.render.sprite.destroy(); f.render.shadow.destroy(); } }); this.foes.length = 0; state.camLocked = false; this.showEvent('SECOND WIND · ' + state.lives, C.green, 0.95); kit.audio.sfx('clear', { volume: 0.65, rate: 0.9 });
    },

    queueFoeAttack: function (f, spec) { f.state = 'telegraph'; f.telegraph = spec.windup || 0.22; f.pendingAttack = { kind: spec.kind || 'foe', t: 0, dur: spec.dur, strike: spec.strike, reach: spec.reach, knock: spec.knock, struck: false }; },
    updateFoes: function (dt) {
      var p = this.player;
      for (var i = this.foes.length - 1; i >= 0; i--) {
        var f = this.foes[i]; if (f.inv > 0) f.inv -= dt; f.anim += dt * (f.type === 'acrobat' ? 11 : 7); f.aiTimer -= dt;
        if (f.state === 'carried') { f.x = p.x + p.face * 18; f.z = p.z; f.y = -72; f.face = p.face; continue; }
        if (f.state === 'thrown') continue;
        if (f.state === 'ko') { f.y += f.vy * dt; f.vy += GRAVITY * dt; f.x += f.vx * dt; f.vx *= 0.92; if (f.y >= 0) { f.y = 0; f.vy = 0; } f.deadTimer -= dt; if (f.deadTimer <= 0) { this.removeFoe(f); continue; } continue; }
        if (f.state === 'down') { f.downTimer += dt; f.y += f.vy * dt; f.vy += GRAVITY * dt; if (f.y >= 0) { f.y = 0; f.vy = 0; f.vx *= 0.45; } var downX = f.x; f.x += f.vx * dt; this.resolvePropCollision(f, downX); f.vx *= 0.86; if (f.downTimer > 1.05) f.state = 'idle'; continue; }
        if (f.state === 'hurt') { var hurtX = f.x; f.x += f.vx * dt; this.resolvePropCollision(f, hurtX); f.vx *= 0.8; f.downTimer -= dt; if (f.downTimer <= 0) f.state = 'idle'; continue; }
        if (f.state === 'vault') { f.y += f.vy * dt; f.vy += GRAVITY * dt; var vaultX = f.x; f.x += f.vx * dt; f.z += sign(f.targetLane - f.z) * 1.05 * dt; this.resolvePropCollision(f, vaultX); if (f.y >= 0) { f.y = 0; f.vy = 0; f.state = 'attack'; f.action = { kind: 'vault', t: 0, dur: 0.32, strike: 0.06, reach: 116, knock: true, struck: false }; } continue; }
        if (f.state === 'telegraph') { f.telegraph -= dt; if (f.telegraph <= 0) { f.action = f.pendingAttack; f.pendingAttack = null; f.state = 'attack'; } continue; }
        if (f.action) { f.action.t += dt; if (!f.action.struck && f.action.t >= f.action.strike) { f.action.struck = true; if (laneMatch(f, p) && this.inFront(f, p, f.action.reach)) this.damagePlayer(p, f.damage, f.action.knock, f.face); } if (f.action.t >= f.action.dur) { f.action = null; f.state = 'idle'; f.aiTimer = f.type === 'boss' ? 0.75 : 0.42; } continue; }
        var dx = p.x - f.x; var dz = p.z - f.z; f.face = dx < 0 ? -1 : 1;
        if (f.type === 'acrobat' && f.aiTimer <= 0 && Math.abs(dx) < 620) { f.targetLane = p.z; f.vy = -565; f.vx = sign(dx) * 270; f.y = -2; f.state = 'vault'; f.aiTimer = 1.65; continue; }
        if (f.type === 'boss' && f.aiTimer <= 0 && f.hp < f.maxhp * 0.58) { f.targetLane = choose(LANES, this.rng); f.z = f.targetLane; f.aiTimer = 1.25; this.showEvent('BOSS LANE SHIFT', C.red, 0.8); }
        var close = Math.abs(dx) < (f.type === 'boss' ? 138 : f.type === 'heavy' ? 128 : 108) && Math.abs(dz) < LANE_TOL * 1.1;
        if (close) {
          if (f.aiTimer <= 0) {
            if (f.type === 'heavy') this.queueFoeAttack(f, { kind: 'charge', dur: 0.82, strike: 0.46, reach: 132, knock: true, windup: 0.34 });
            else if (f.type === 'boss') this.queueFoeAttack(f, { kind: 'boss-slam', dur: 0.86, strike: 0.44, reach: 146, knock: true, windup: 0.38 });
            else if (f.type === 'flicker') this.queueFoeAttack(f, { kind: 'feint', dur: 0.48, strike: 0.20, reach: 82, knock: false, windup: 0.16 });
            else this.queueFoeAttack(f, { kind: 'scrap', dur: 0.54, strike: 0.27, reach: FOES[f.type].range, knock: false, windup: 0.19 });
          }
        } else {
          var desiredLane = f.type === 'flicker' ? f.targetLane : p.z;
          if (f.type === 'flicker' && f.aiTimer <= 0) { f.targetLane = choose(LANES, this.rng); f.aiTimer = 0.82; desiredLane = f.targetLane; }
          if (f.type === 'boss' && Math.abs(dx) < 420 && f.aiTimer <= 0) { f.targetLane = choose(LANES, this.rng); f.aiTimer = 0.8; desiredLane = f.targetLane; }
          var speed = f.type === 'heavy' && Math.abs(dx) < 360 ? f.speed * 1.5 : f.type === 'flicker' ? f.speed * 1.08 : f.speed;
          var walkX = f.x; f.x += sign(dx) * speed * dt; f.z += clamp(desiredLane - f.z, -0.08, 0.08) * dt * (f.type === 'flicker' ? 8 : 5); this.resolvePropCollision(f, walkX); f.state = 'walk';
          if (f.type === 'scrapper' && Math.abs(dx) < 420 && this.rng() < dt * 0.24) f.targetLane = choose(LANES, this.rng);
        }
        this.separateFoes(f);
        f.x = clamp(f.x, state.block * BLOCK_W + 70, (state.block + 1) * BLOCK_W - 60); f.z = clamp(f.z, 0.08, 0.94);
      }
      if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 0; }
    },
    separateFoes: function (actor) {
      for (var i = 0; i < this.foes.length; i++) { var other = this.foes[i]; if (other === actor || other.state === 'ko' || other.state === 'thrown' || Math.abs(other.z - actor.z) > LANE_TOL * 0.72) continue; var dx = actor.x - other.x, gap = (actor.width + other.width) * 0.5; if (Math.abs(dx) < gap) actor.x += dx < 0 ? -gap * 0.08 : gap * 0.08; }
    },
    removeFoe: function (f) { var i = this.foes.indexOf(f); if (i >= 0) this.foes.splice(i, 1); if (f.render) { f.render.sprite.destroy(); f.render.shadow.destroy(); } },

    updateProjectiles: function (dt) {
      for (var i = this.projectiles.length - 1; i >= 0; i--) {
        var q = this.projectiles[i], f = q.foe; q.life -= dt; q.x += q.vx * dt; q.z = clamp(q.z + q.vz * dt, 0.06, 0.94); q.y += q.vy * dt; q.vy += GRAVITY * dt; f.x = q.x; f.z = q.z; f.y = q.y; f.vy = q.vy; f.vx = q.vx; if (!q.hit) for (var j = 0; j < this.foes.length; j++) { var target = this.foes[j]; if (target !== f && target.state !== 'ko' && target.state !== 'down' && laneMatch(f, target) && Math.abs(target.x - q.x) < 62) { q.hit = true; this.damageFoe(target, 36, true, sign(q.vx) || 1); this.fx.sparks.emitParticleAt(target.x, laneY(target.z) - 60, motionOn() ? 14 : 4); } } if (q.y >= 0 || q.life <= 0 || q.x < state.block * BLOCK_W - 100 || q.x > (state.block + 1) * BLOCK_W + 100) { f.y = 0; f.vy = 0; f.state = 'ko'; f.deadTimer = 0.5; this.fx.dust.emitParticleAt(q.x, laneY(q.z), motionOn() ? 8 : 2); this.projectiles.splice(i, 1); }
      }
    },

    updateProps: function (dt) { for (var i = 0; i < this.props.length; i++) { var p = this.props[i]; if (p.hit > 0) p.hit -= dt; if (p.render) { p.render.x = p.x; p.render.y = laneY(p.z); p.render.setScale(scaleZ(p.z) * (p.hit > 0 ? 1.08 : 1)); } } },
    smashProp: function (p) {
      p.hp--; p.hit = 0.12; this.fx.dust.emitParticleAt(p.x, laneY(p.z) - 35, motionOn() ? 7 : 2); if (p.hp > 0) return;
      state.score += 20; var roll = this.rng(); if (roll < 0.68) this.spawnItem('food', p.x, p.z); else if (roll < 0.84) this.spawnItem(this.rng() < 0.62 ? 'pipe' : 'crate', p.x, p.z); else if (roll < 0.91) this.spawnItem('upgrade', p.x, p.z); this.popup(p.x, laneY(p.z) - 88, roll < 0.68 ? 'HEALTH DROP' : roll < 0.91 ? 'CACHE DROP' : 'EMPTY BIN', C.green); var i = this.props.indexOf(p); if (i >= 0) this.props.splice(i, 1); if (p.render) p.render.destroy(); kit.audio.sfx('break', { volume: 0.5, rate: 1.15 }); kit.juice.shake(2.5, 100);
    },
    updateItems: function (dt) { for (var i = 0; i < this.items.length; i++) { var it = this.items[i]; it.bob += dt * 4; if (it.render) { it.render.y = laneY(it.z) - 18 + Math.sin(it.bob) * 5; it.render.setAlpha(0.88 + Math.sin(it.bob) * 0.12); } } },
    updateHazards: function (dt) {
      var p = this.player;
      for (var i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i]; h.timer += dt;
        if (h.cycle) { var phase = h.timer % h.cycle; h.warning = phase > 0.65 && phase < 1.05; h.active = phase >= 1.05 && phase < 2.05; }
        if (h.render) { h.render.setAlpha(h.active ? 0.72 : h.warning ? 0.38 : 0.18); h.render.setTint(h.warning ? C.yellow : h.active ? C.red : 0xffffff); }
        if (!p || !h.active || p.hazardCooldown > 0 || p.state === 'dodge' || p.y < -30) continue;
        if (Math.abs(h.x - p.x) < h.width * 0.5 + p.width * 0.35 && Math.abs(h.z - p.z) < LANE_TOL) { p.hazardCooldown = 0.68; state.hazardHits++; this.onboard.hazard = true; this.damagePlayer(p, h.damage, h.kind === 'steam' || h.kind === 'gate', sign(p.x - h.x) || -1); this.fx.sparks.emitParticleAt(p.x, laneY(p.z) - 36, motionOn() ? 10 : 3); }
      }
    },
    collectItems: function (p) {
      for (var i = this.items.length - 1; i >= 0; i--) { var it = this.items[i]; if (Math.abs(it.x - p.x) > 55 || Math.abs(it.z - p.z) > 0.14) continue; if (it.kind === 'food') { p.hp = Math.min(p.maxhp, p.hp + 42); state.score += 30; this.popup(p.x, laneY(p.z) - 110, '+42 HEALTH', C.green); kit.audio.sfx('pickup', { volume: 0.5, rate: 1.5 }); this.fx.loot.emitParticleAt(p.x, laneY(p.z) - 60, 6); this.removeItem(it); } else if (it.kind === 'score') { state.score += 250; this.popup(p.x, laneY(p.z) - 100, '+250 BONUS', C.yellow); kit.audio.sfx('pickup', { volume: 0.7, rate: 1.2 }); this.fx.loot.emitParticleAt(p.x, laneY(p.z) - 60, 8); this.removeItem(it); } else if (it.kind === 'upgrade') { this.removeItem(it); this.showUpgradeChoice(); return; } }
    },
    removeItem: function (it) { var i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); if (it.render) it.render.destroy(); },

    updateWaves: function (dt) {
      if (state.blockClear) { if (this.player.x >= state.blockExitX) this.finishBlock(); return; }
      var def = this.waveDefs[this.waveIndex];
      if (!this.waveActive && def && this.player.x >= state.block * BLOCK_W + def.trigger) this.startWave(def);
      if (this.waveActive) {
        this.spawnTimer -= dt;
        while (this.pending.length && this.spawnTimer <= 0 && this.liveFoes() < 6) { this.spawnFoe(this.pending.shift(), this.spawnSide); this.spawnSide *= -1; this.spawnTimer += 0.22; }
        if (!this.pending.length && this.liveFoes() === 0) { this.waveActive = false; this.waveClearTimer = 0.72; state.camLocked = false; this.waveIndex++; this.showEvent('WAVE CLEAR', C.green, 0.95); }
      } else if (this.waveClearTimer > 0) { this.waveClearTimer -= dt; }
      if (!this.waveActive && !this.waveClearTimer && !this.waveDefs[this.waveIndex] && !state.blockClear) { state.blockClear = true; this.blockAdvanceTimer = 0; state.camLocked = false; state.score += 500 + state.combo * 30; this.showEvent('CACHE · EXIT →', C.yellow, 0.95); }
      var intensity = this.waveActive ? 'danger' : 'crowd'; if (this.musicIntensity !== intensity) { this.musicIntensity = intensity; kit.audio.music(intensity, 420); }
    },
    liveFoes: function () { var n = 0; for (var i = 0; i < this.foes.length; i++) if (this.foes[i].state !== 'ko') n++; return n; },
    updateOnboarding: function () {
      if (state.runTime > 60 || state.screen !== 'play' || !this.onboard) return;
      var hint = '';
      if (state.runTime < 7 && !this.onboard.moved) hint = 'DRAG THE LEFT HALF TO MOVE // FOLLOW GO RIGHT';
      else if (state.runTime >= 7 && state.runTime < 18 && !this.onboard.punched) hint = 'TAP PUNCH OR PRESS J // LINE UP YOUR LANE';
      else if (this.onboard.hazard && !this.onboard.dodged) hint = 'DODGE HAZARDS WITH SHIFT OR THE DODGE BUTTON';
      else if (state.runTime >= 18 && !this.onboard.jumped) hint = 'JUMP STEAM AND HAZARDS // DODGE GIVES I-FRAMES';
      if (hint && (state.runTime - this.onboard.lastHint > 2.8)) { this.onboard.lastHint = state.runTime; this.showCoach(hint, 3.2); }
    },
    startWave: function (def) { this.waveActive = true; this.pending = def.list.slice(); this.spawnSide = 1; this.spawnTimer = 0.05; state.camLocked = true; this.lockX = clamp(this.player.x - 430, state.block * BLOCK_W, (state.block + 1) * BLOCK_W - VW); this.showEvent(def.list.indexOf('boss') >= 0 ? 'BOSS · ' + state.bossName : 'WAVE ' + (this.waveIndex + 1), def.list.indexOf('boss') >= 0 ? C.red : C.orange, 0.95); if (state.runTime < 20) this.showCoach('PUNCH WHEN THE RED RING CLOSES · DODGE THE TELEGRAPH', 3.0); },
    finishBlock: function () { state.blockClear = false; this.blockAdvanceTimer = 0; this.preserveLoot(); if (state.block < 3 && state.mode !== 'bossrush') this.buildBlock(state.block + 1, false); else this.completeStage(); },

    updateCamera: function () {
      var target = state.camLocked ? this.lockX : this.player.x - 330;
      target = clamp(target, 0, WORLD_W - VW); this.baseCamX = Math.round(target); this.cameras.main.setScroll(this.baseCamX, 0);
    },
    updateRender: function (dt) {
      var self = this;
      function paint(e) {
        if (!e || !e.render) return;
        var s = e.render.sprite, sh = e.render.shadow, frame = e.state === 'ko' ? 7 : e.state === 'hurt' ? 6 : e.state === 'grab' ? 4 : e.state === 'throw' || e.state === 'thrown' || e.state === 'vault' ? 5 : e.state === 'telegraph' ? 3 : e.state === 'attack' ? (e.action && e.action.kind === 'weapon' ? 8 : e.action && e.action.kind === 'kick' ? 5 : 3) : e.state === 'walk' ? (Math.floor(e.anim) % 2) + 1 : e.weapon ? 8 : 0;
        var zScale = scaleZ(e.z), y = laneY(e.z) + e.y;
        s.setFrame(frame); s.x = e.x; s.y = y; s.setScale(zScale * (e.type === 'boss' ? 1.22 : 1) * (e.state === 'telegraph' ? 1 + Math.sin(e.telegraph * 36) * 0.045 : 1)); s.setFlipX(e.face < 0); s.setAlpha(e.inv > 0 && Math.floor(e.inv * 18) % 2 === 0 ? 0.45 : e.state === 'telegraph' ? 0.82 : 1); s.setDepth(200 + e.z * 100 + (e.type === 'boss' ? 10 : 0)); sh.x = e.x; sh.y = laneY(e.z) + 4; sh.setScale(zScale * (e.type === 'boss' ? 1.35 : 1)); sh.setDepth(80 + e.z * 20); sh.setAlpha(e.y < -2 ? 0.18 : 0.48);
      }
      paint(this.player); this.foes.forEach(paint);
      this.ui.stickDot.x = 146 + input.ix * 34; this.ui.stickDot.y = 606 + input.iz * 34;
      var now = performance.now(), u = this.ui;
      if (now >= u.bannerWallUntil) { u.bannerBack.setVisible(false); u.bannerLine.setVisible(false); u.banner.setVisible(false); u.bannerSub.setVisible(false); }
      if (u.transient && now >= u.transient.until) this.finishTransient();
    },

    showBanner: function (title, sub, color, seconds) {
      this.showEvent(sub ? title + ' · ' + sub : title, color, Math.min(1, seconds));
    },
    showBoundary: function (title, sub, color, seconds) {
      var u = this.ui, now = performance.now();
      this.clearTransients();
      u.bannerUntil = state.runTime + seconds; u.bannerWallUntil = now + seconds * 1000;
      setTextIfChanged(u.banner, title); setTextIfChanged(u.bannerSub, sub || ''); setColorIfChanged(u.banner, '#' + color.toString(16).padStart(6, '0'));
      u.bannerBack.setFillStyle(C.black, 0.9); u.bannerLine.setFillStyle(color, 1); u.bannerBack.setVisible(true); u.bannerLine.setVisible(true); u.banner.setVisible(true); u.bannerSub.setVisible(!!sub);
      u.bannerBack.scaleX = 0.94; u.bannerLine.scaleX = 0.94; u.banner.setScale(0.98); u.bannerSub.setScale(0.98);
      if (motionOn()) { this.tweens.killTweensOf([u.bannerBack, u.bannerLine, u.banner, u.bannerSub]); this.tweens.add({ targets: [u.bannerBack, u.bannerLine], scaleX: 1, duration: 180, ease: 'Cubic.Out' }); this.tweens.add({ targets: [u.banner, u.bannerSub], scale: 1, duration: 180, ease: 'Cubic.Out' }); }
      else { u.bannerBack.scaleX = 1; u.bannerLine.scaleX = 1; u.banner.setScale(1); u.bannerSub.setScale(1); }
    },
    enqueueTransient: function (kind, text, color, seconds) {
      var u = this.ui, item = { kind: kind, text: text, color: color, seconds: Math.min(kind === 'coach' ? 3.2 : 1.0, seconds), until: 0 };
      if (!text || item.seconds <= 0) return;
      if (performance.now() < u.bannerWallUntil) return;
      if ((u.transient && u.transient.text === text) || u.transientQueue.some(function (q) { return q.text === text; })) return;
      if (u.transientQueue.length >= 3) u.transientQueue.shift();
      if (u.transient) u.transientQueue.push(item); else this.presentTransient(item);
    },
    presentTransient: function (item) {
      var u = this.ui, now = performance.now();
      u.transient = item; item.until = now + item.seconds * 1000; u.coachUntil = item.until;
      this.tweens.killTweensOf([u.coach, u.event, u.eventBack]);
      u.coach.setAlpha(0); u.eventBack.setVisible(false); u.event.setVisible(false);
      if (item.kind === 'coach') {
        setTextIfChanged(u.coach, item.text); u.coach.setAlpha(1);
        if (motionOn()) this.tweens.add({ targets: u.coach, alpha: 0.18, delay: Math.max(0, item.seconds * 1000 - 520), duration: 500, ease: 'Cubic.Out' });
      } else {
        setTextIfChanged(u.event, item.text); setColorIfChanged(u.event, '#' + item.color.toString(16).padStart(6, '0')); u.eventBack.setStrokeStyle(1, item.color, 0.7); u.eventBack.setVisible(true); u.event.setVisible(true); u.event.setAlpha(1); u.eventBack.setAlpha(1);
        if (motionOn()) this.tweens.add({ targets: [u.event, u.eventBack], alpha: 0, delay: Math.max(0, item.seconds * 1000 - 180), duration: 180, ease: 'Cubic.Out' });
      }
    },
    finishTransient: function () {
      var u = this.ui; this.tweens.killTweensOf([u.coach, u.event, u.eventBack]); u.coach.setAlpha(0); u.eventBack.setVisible(false); u.event.setVisible(false); u.transient = null;
      if (u.transientQueue.length) this.presentTransient(u.transientQueue.shift());
    },
    clearTransients: function () {
      var u = this.ui; this.tweens.killTweensOf([u.coach, u.event, u.eventBack]); u.transient = null; u.transientQueue.length = 0; u.coach.setAlpha(0); u.eventBack.setVisible(false); u.event.setVisible(false);
    },
    showEvent: function (text, color, seconds) { this.enqueueTransient('event', text, color, Math.min(1, seconds)); },
    showCoach: function (text, seconds) { this.enqueueTransient('coach', text, C.cyan, Math.min(3.2, seconds)); },
    popup: function (x, y, text, color) { this.showEvent(text, color, 0.95); },

    paintHud: function (active) {
      var p = this.player, u = this.ui;
      setTextIfChanged(u.stage, active ? 'S' + state.stage : 'READY');
      setTextIfChanged(u.block, active ? 'B' + (state.block + 1) + '/4' + (state.blockClear ? '  → EXIT' : '') : 'SEEDED STREET RUN');
      setTextIfChanged(u.score, active ? '◆ ' + state.score.toString().padStart(7, '0') : '');
      setTextIfChanged(u.combo, active && state.combo > 1 ? '×' + state.combo : '');
      u.comboChipBack.setVisible(false); u.comboChip.setVisible(false); u.comboValue = 0;
      setTextIfChanged(u.health, p && active ? String(Math.max(0, Math.ceil(p.hp))) : '');
      setTextIfChanged(u.weapon, p && active && p.carry ? '↗ THROW' : p && active && p.weapon ? '▣ ' + p.weapon.uses : '');
      u.healthFill.width = 190 * (p ? clamp(p.hp / p.maxhp, 0, 1) : 0); u.healthFill.fillColor = p && p.hp / p.maxhp < 0.32 ? C.red : C.green;
      setTextIfChanged(u.lives, active ? '♥ ' + state.lives : '');
      var showControls = active && state.screen === 'play'; u.stick.setVisible(showControls); u.stickRing.setVisible(showControls); u.stickDot.setVisible(showControls); u.punchButton.setVisible(showControls); u.punchLabel.setVisible(showControls); u.jumpButton.setVisible(showControls); u.jumpLabel.setVisible(showControls); u.dodgeButton.setVisible(showControls); u.dodgeLabel.setVisible(showControls); u.pause.setVisible(showControls);
      u.brand.setVisible(!active); u.sub.setVisible(!active); u.stage.setVisible(active); u.block.setVisible(active); u.score.setVisible(active); u.combo.setVisible(active && state.combo > 1); u.healthBack.setVisible(active); u.healthFill.setVisible(active); u.health.setVisible(active); u.weapon.setVisible(active && !!(p && (p.weapon || p.carry))); u.lives.setVisible(active);
    },
    paintPause: function (on) {
      if (on) { this.ui.screen = 'pause'; this.showBoundary('PAUSED', 'TAP II TO RESUME', C.cyan, 9999); this.ui.bannerUntil = state.runTime + 9999; this.ui.bannerWallUntil = performance.now() + 9999000; this.paintHud(true); }
      else { this.ui.screen = 'play'; this.ui.bannerUntil = 0; this.ui.bannerWallUntil = 0; this.ui.bannerBack.setVisible(false); this.ui.bannerLine.setVisible(false); this.ui.banner.setVisible(false); this.ui.bannerSub.setVisible(false); this.paintHud(true); }
    },

    completeStage: function () {
      state.screen = 'result'; this.ui.screen = 'result'; this.clearTransients(); var medal = this.medalForRun(); var idx = Math.min(5, state.stage - 1); if (medal > (profile.medals[idx] || 0)) profile.medals[idx] = medal; profile.bossRush = true; profile.finalBoss = profile.medals[0] > 0 && profile.medals[1] > 0 && profile.medals[2] > 0; profile.bestScore = Math.max(profile.bestScore, state.score); if (state.mode === 'gauntlet') profile.bestGauntlet = Math.max(profile.bestGauntlet, state.stage); saveNow();
      var tier = medal === 3 ? 'GOLD' : medal === 2 ? 'SILVER' : medal === 1 ? 'BRONZE' : 'NO MEDAL';
      var copy = 'TIME ' + this.formatTime(state.stageTime) + '   //   NO-DEATH ' + (state.deaths === 0 ? 'YES' : 'NO') + '   //   MAX CHAIN ' + state.maxCombo + '\n' + tier + ' MEDAL   //   SCORE ' + state.score + '   //   BEST ' + profile.bestScore + '   //   BOSS RUSH ' + (profile.bossRush ? 'UNLOCKED' : 'LOCKED') + (profile.finalBoss ? '\nTHE RECKONING BOSS IS NOW OPEN.' : '');
      setTextIfChanged(this.ui.resultTitle, 'STAGE ' + state.stage + ' CLEAR'); setTextIfChanged(this.ui.resultCopy, copy); this.ui.resultBack.setVisible(true); this.ui.resultTitle.setVisible(true); this.ui.resultCopy.setVisible(true); this.ui.resultButtons.forEach(function (b) { b.rect.setVisible(true); b.text.setVisible(true); }); setTextIfChanged(this.ui.resultButtons[0].text, state.mode === 'gauntlet' || state.mode === 'bossrush' ? 'NEXT STAGE' : 'RUN AGAIN'); kit.audio.sfx('clear', { volume: 1, rate: medal === 3 ? 1.08 : 0.92 });
    },
    medalForRun: function () { var t = state.stageTime, noDeath = state.deaths === 0, chain = state.maxCombo; if (noDeath && chain >= 10 && t <= 115) return 3; if (chain >= 6 && t <= 170) return 2; if (t <= 240 || chain >= 3) return 1; return 0; },
    formatTime: function (t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); },
    resultContinue: function () {
      this.ui.resultBack.setVisible(false); this.ui.resultTitle.setVisible(false); this.ui.resultCopy.setVisible(false); this.ui.resultButtons.forEach(function (b) { b.rect.setVisible(false); b.text.setVisible(false); });
      if (state.mode === 'gauntlet') { this.buildStage(state.stage + 1, false); return; }
      if (state.mode === 'bossrush') { if (state.bossRushIndex < (profile.finalBoss ? 4 : 3)) { state.bossRushIndex++; this.buildStage(state.bossRushIndex + 1, true); return; } }
      this.returnTitle();
    },
    gameOver: function () {
      profile.bestScore = Math.max(profile.bestScore, state.score); saveNow(); state.screen = 'result'; this.ui.screen = 'result'; this.clearTransients(); setTextIfChanged(this.ui.resultTitle, 'RUN ENDS HERE'); setTextIfChanged(this.ui.resultCopy, 'SCORE ' + state.score + '   //   BEST ' + profile.bestScore + '\nThe street keeps its secrets. Clear a block to earn your next medal.'); this.ui.resultBack.setVisible(true); this.ui.resultTitle.setVisible(true); this.ui.resultCopy.setVisible(true); this.ui.resultButtons.forEach(function (b) { b.rect.setVisible(true); b.text.setVisible(true); }); setTextIfChanged(this.ui.resultButtons[0].text, 'RUN AGAIN'); kit.audio.sfx('punch', { volume: 1, rate: 0.45 });
    },

    update: function (_time, delta) {
      this.resizeHud(); this.processGlobalInput();
      if (state.screen === 'title') {
        var enter = kit.input.keyDown('Enter');
        if (enter && !input.prevEnter) this.startRun('street');
        input.prevEnter = enter;
      }
      if (state.screen === 'title' && (debugBridge.forceBoss || debugBridge.forceBlock !== false && debugBridge.forceBlock !== 0 && debugBridge.forceBlock !== null)) {
        this.startRun('street');
        if (debugBridge.forceBoss) this.forceBoss();
        else this.forceBlock(Number(debugBridge.forceBlock));
        debugBridge.forceBoss = false; debugBridge.forceBlock = false;
      }
      var dt = clamp(delta / 1000, 0, 0.12); this.accum += dt; if (this.accum > 0.12) this.accum = 0.12;
      var juice = kit.juice.frame(); var steps = 0;
      while (this.accum >= STEP && steps < MAX_STEPS) { if (!juice.frozen) this.step(STEP); this.accum -= STEP; steps++; }
      var shakeX = juice.dx || 0, shakeY = juice.dy || 0; this.cameras.main.setScroll(Math.round(this.baseCamX + shakeX), Math.round(shakeY));
      if (state.screen === 'title') { this.updateRender(0); this.paintHud(false); }
      else if (state.screen === 'result') { this.updateRender(0); this.paintHud(false); }
      else if (state.screen === 'upgrade') this.paintHud(true);
    }
  });

  var game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#070a12',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VW, height: VH },
    render: { antialias: false, antialiasGL: false, roundPixels: true, powerPreference: 'high-performance' },
    scene: [MainScene]
  });
  window.__br.game = game;
  game.events.once(Phaser.Core.Events.READY, function () { if (kit.paused && sceneRef) sceneRef.paintPause(true); });
})();
