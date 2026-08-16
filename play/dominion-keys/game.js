/* Dominion Keys, a pin-pull chamber puzzle with a keep to rebuild.
 * Phaser 3 draws; DKSim owns the deterministic chamber; GGKit owns lifecycle,
 * pointer identity, saves, audio buses, settings, loading and the juice budget.
 *
 * Rendering contract: nothing in this file draws with Phaser Graphics during a
 * frame. Every piece of board chrome, HUD, menu and keep art is baked once into
 * a canvas texture and repainted only when the value behind it changes. Cells,
 * particles and pins are pooled sprites sharing one atlas per chapter, so a
 * full board is a single draw batch.
 */
(function () {
  'use strict';

  var S = window.DKSim;
  var LEVELS = window.DKLevels;
  var BLUEPRINT = window.DKBlueprint;

  var DW = 390, DH = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(DW, DH);
  var CELL = 23, BX = 45, BY = 138;
  var BW = S.W * CELL, BH = S.H * CELL;   // 299 x 506
  var PAD = 8;                            // board frame padding baked into dk-board
  var STEP = 1 / 16;                      // tuned sim step, preserved from the prototype
  var MAX_STEPS = 4;
  var SAVE_VERSION = 3;
  var NL = LEVELS.length;                 // 60
  var CHAPTERS = 5, PER_CH = 12;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------- palettes
  var INK = '#141a28', PAPER = '#f2f6ff', DIM = '#93a6c6', BRASS = '#f3bc50';

  var CH = [
    { id: 'vault',  name: 'Vault Deep',     sky: ['#0b0f1a', '#1d2745'], board: '#243453', cell: '#2d4062', rim: '#5d7294',
      wall: '#2b3247', wallLit: '#3d4867', accent: '#f3bc50', motif: 'arches',
      lava: ['#e64a1c', '#ff8a30', '#ffd178'], water: ['#2f86e0', '#5fb2ff', '#bfe4ff'], gas: ['#4fbf6b', '#86e79a', '#d3ffdd'] },
    { id: 'river',  name: 'Riverworks',     sky: ['#07141c', '#123648'], board: '#1b3d4e', cell: '#245265', rim: '#4f8ea3',
      wall: '#22404e', wallLit: '#32606f', accent: '#38a8de', motif: 'wheel',
      lava: ['#d8471f', '#f77f2c', '#ffc86a'], water: ['#2ea6f0', '#79ceff', '#ddf2ff'], gas: ['#46b678', '#7fdfa4', '#cdfbe0'] },
    { id: 'molten', name: 'Molten Deep',    sky: ['#170a0e', '#3d1c1c'], board: '#3d2430', cell: '#50313b', rim: '#8d5a54',
      wall: '#452a2c', wallLit: '#5f3b38', accent: '#f29a4a', motif: 'vents',
      lava: ['#ff5412', '#ffa63c', '#fff0b4'], water: ['#3a94d6', '#72bcf2', '#cfe9ff'], gas: ['#57c072', '#93eaa2', '#ddffe4'] },
    { id: 'marsh',  name: 'Marshfen Reach', sky: ['#09140f', '#1d3a2b'], board: '#223a2f', cell: '#2e4d3d', rim: '#5b8f70',
      wall: '#2a4437', wallLit: '#3b5c49', accent: '#5bcb77', motif: 'reeds',
      lava: ['#e05420', '#ff8f34', '#ffd98a'], water: ['#2d97b6', '#63c4d8', '#c6f0f7'], gas: ['#7ade5a', '#b5f581', '#e8ffcf'] },
    { id: 'crown',  name: 'Crown Keep',     sky: ['#100c1c', '#2c2444'], board: '#2e2748', cell: '#3c3460', rim: '#7d6fb0',
      wall: '#3a3050', wallLit: '#4e4374', accent: '#9a7cf3', motif: 'banners',
      lava: ['#ec4a2a', '#ff8f4a', '#ffd9a0'], water: ['#4f8ff0', '#8bb8ff', '#dbe9ff'], gas: ['#63cf8a', '#9df0b4', '#dcffe8'] }
  ];
  var GOLD = ['#c98f16', '#ffd34d', '#fff3bd'];
  var MON = ['#5d2a7a', '#a94bd8', '#e7bcff'];
  var STONE = ['#4a5468', '#66718a', '#98a4bb'];

  var BUILD = [
    { n: 'Palisade',   k: 'wall',     blurb: 'A rampart the chambers cannot reach' },
    { n: 'Well',       k: 'well',     blurb: 'Clean water for the lower ward' },
    { n: 'Woodshed',   k: 'shed',     blurb: 'Seasoned timber, stacked and dry' },
    { n: 'Granary',    k: 'granary',  blurb: 'Grain against a long winter' },
    { n: 'Market',     k: 'market',   blurb: 'Traders return to the square' },
    { n: 'Stables',    k: 'stables',  blurb: 'Horses for the outer road' },
    { n: 'Smithy',     k: 'smithy',   blurb: 'Brass keys are cut here' },
    { n: 'Barracks',   k: 'barracks', blurb: 'A garrison that sleeps indoors' },
    { n: 'Watchtower', k: 'tower',    blurb: 'Sight lines over the fen' },
    { n: 'Chapel',     k: 'chapel',   blurb: 'Bells for every rescue' },
    { n: 'Library',    k: 'library',  blurb: 'Chamber plans, copied and kept' },
    { n: 'Great Hall', k: 'hall',     blurb: 'The seat of the dominion' }
  ];
  var NB = BUILD.length;
  var MAX_TIER = 3;
  var MAX_KEEP = NB * MAX_TIER;              // 36

  function tierCost(b, t) {
    return {
      s: Math.round((6 + b) * (1 + t * 1.5)),
      t: Math.round((4 + b * 0.8) * (1 + t * 1.5)),
      b: Math.round((1 + Math.floor(b / 2)) * (1 + t))
    };
  }
  // Keep tier required to open each chapter, alongside 9 clears in the one before.
  var CH_GATE = [0, 3, 9, 16, 24];
  var BP_GATE = { keep: 12, cleared: 30 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lvChapter(i) { return (i / PER_CH) | 0; }

  // ---------------------------------------------------------------- save
  function blank() {
    return {
      version: SAVE_VERSION,
      stars: new Array(NL).fill(0),
      best: new Array(NL).fill(0),
      bp: new Array(BLUEPRINT.length).fill(0),
      mat: { s: 0, t: 0, b: 0 },
      build: new Array(NB).fill(0),
      tut: false,
      hints: true,
      seen: 0
    };
  }
  function intArr(a, len, hi) {
    if (!Array.isArray(a) || a.length !== len) return false;
    for (var i = 0; i < len; i++) {
      var v = a[i];
      if (!Number.isInteger(v) || v < 0 || v > hi) return false;
    }
    return true;
  }
  function validSave(o) {
    if (!o || o.version !== SAVE_VERSION) return false;
    if (!intArr(o.stars, NL, 3) || !intArr(o.best, NL, 999)) return false;
    if (!intArr(o.bp, BLUEPRINT.length, 3) || !intArr(o.build, NB, MAX_TIER)) return false;
    if (!o.mat || !Number.isInteger(o.mat.s) || !Number.isInteger(o.mat.t) || !Number.isInteger(o.mat.b)) return false;
    if (o.mat.s < 0 || o.mat.t < 0 || o.mat.b < 0) return false;
    if (typeof o.tut !== 'boolean' || typeof o.hints !== 'boolean') return false;
    if (!Number.isInteger(o.seen) || o.seen < 0 || o.seen >= NL) return false;
    return true;
  }

  var kit = GGKit.create({
    slug: 'dominion-keys',
    orientation: 'portrait',
    validateSave: validSave,
    onPause: function () { if (scene) scene.onKitPause(); },
    onResume: function () { if (scene) scene.onKitResume(); },
    onRestart: function () { if (scene) scene.retry(); }
  });

  kit.audio.register({
    vault: 'assets/music_vault.mp3',
    keep: 'assets/music_keep.mp3',
    tap: 'assets/sfx_tap.mp3',
    pull: 'assets/sfx_pull.mp3',
    coin: 'assets/sfx_coin.mp3',
    steam: 'assets/sfx_steam.mp3',
    ignite: 'assets/sfx_ignite.mp3',
    slay: 'assets/sfx_slay.mp3',
    burn: 'assets/sfx_burn.mp3',
    fail: 'assets/sfx_fail.mp3',
    win: 'assets/sfx_win.mp3',
    build: 'assets/sfx_build.mp3'
  });
  kit.registerPWA();

  var profile = kit.save.get(blank());
  var scene = null;

  function motionOn() {
    if (!kit.juice.enabled) return false;
    return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function persist() { kit.save.set(profile); }

  // ------------------------------------------------------ progress helpers
  function clearedIn(ch) {
    var n = 0;
    for (var i = ch * PER_CH; i < (ch + 1) * PER_CH; i++) if (profile.stars[i] > 0) n++;
    return n;
  }
  function totalCleared() {
    var n = 0;
    for (var i = 0; i < NL; i++) if (profile.stars[i] > 0) n++;
    return n;
  }
  function keepTier() {
    var n = 0;
    for (var i = 0; i < NB; i++) n += profile.build[i];
    return n;
  }
  function chapterOpen(ch) {
    if (ch === 0) return true;
    return clearedIn(ch - 1) >= 9 && keepTier() >= CH_GATE[ch];
  }
  function levelOpen(i) {
    var ch = lvChapter(i);
    if (!chapterOpen(ch)) return false;
    if (i % PER_CH === 0) return true;
    return profile.stars[i - 1] > 0;
  }
  function blueprintOpen() { return keepTier() >= BP_GATE.keep && totalCleared() >= BP_GATE.cleared; }
  function nextUnsolved() {
    for (var i = 0; i < NL; i++) if (!profile.stars[i] && levelOpen(i)) return i;
    for (i = NL - 1; i >= 0; i--) if (levelOpen(i)) return i;
    return 0;
  }
  function starsFor(i, bp) { return bp ? profile.bp[i] : profile.stars[i]; }

  // ============================================================== painting
  // Every helper below runs at bake time only, never inside a frame.
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function txt(c, s, x, y, size, col, align, weight, ls) {
    c.fillStyle = col;
    c.font = (weight || 600) + ' ' + size + 'px ' + FONT;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    if (ls) {
      var total = 0, i;
      for (i = 0; i < s.length; i++) total += c.measureText(s[i]).width + ls;
      total -= ls;
      var px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
      c.textAlign = 'left';
      for (i = 0; i < s.length; i++) { c.fillText(s[i], px, y); px += c.measureText(s[i]).width + ls; }
      return;
    }
    c.fillText(s, x, y);
  }
  function vgrad(c, x, y, w, h, a, b) {
    var g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fillRect(x, y, w, h);
  }

  // canvas-texture helper: create or fetch, hand back a 2D context
  function canvasTex(sc, key, w, h) {
    var existing = sc.textures.exists(key);
    var t = existing ? sc.textures.get(key) : sc.textures.addCanvas(key, GGKit.hiDpi.canvas(w, h, RETINA_FACTOR).canvas);
    return t;
  }
  function ctxOf(t) { return t.getSourceImage().getContext('2d'); }

  // ---------------------------------------------------------- cell atlas
  var A_COLS = 8, A_CELL = 24;
  var FRAMES = ['gold', 'lava0', 'lava1', 'lava2', 'lava3', 'water0', 'water1', 'water2',
    'gas0', 'gas1', 'gas2', 'stone', 'mon0', 'mon1', 'hero0', 'hero1', 'hero2', 'pin'];

  function paintCell(c, name, th) {
    var Z = CELL, h = Z / 2;
    c.save();
    if (name === 'gold') {
      c.fillStyle = 'rgba(0,0,0,.28)';
      c.beginPath(); c.ellipse(h, Z - 3.2, Z * 0.34, 2.1, 0, 0, TAU); c.fill();
      var g = c.createRadialGradient(h - 2.6, h - 3.4, 1, h, h, Z * 0.42);
      g.addColorStop(0, GOLD[2]); g.addColorStop(0.55, GOLD[1]); g.addColorStop(1, GOLD[0]);
      c.fillStyle = g;
      c.beginPath(); c.arc(h, h - 0.5, Z * 0.39, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(90,58,6,.55)'; c.lineWidth = 1;
      c.beginPath(); c.arc(h, h - 0.5, Z * 0.39, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath(); c.ellipse(h - 2.8, h - 4.2, 2.6, 1.7, -0.5, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(120,80,10,.5)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(h - 3, h + 2.5); c.lineTo(h + 3, h + 2.5); c.stroke();
    } else if (name.indexOf('lava') === 0) {
      var f = +name.charAt(4), L = th.lava;
      c.fillStyle = L[0]; c.fillRect(0, 0, Z, Z);
      c.fillStyle = L[1];
      for (var i = 0; i < 3; i++) {
        var yy = 3 + i * 6 + Math.sin((f + i) * 1.4) * 1.6;
        c.fillRect(0, yy, Z, 3.4);
      }
      c.fillStyle = L[2];
      c.globalAlpha = 0.55 + 0.2 * Math.sin(f * 1.57);
      c.beginPath();
      c.ellipse(h + Math.sin(f * 2.1) * 3, 6 + Math.cos(f * 1.7) * 1.5, 5.2, 2.4, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(0, 0, Z, 1.6);
    } else if (name.indexOf('water') === 0) {
      var wf = +name.charAt(5), Wc = th.water;
      c.fillStyle = Wc[0]; c.fillRect(0, 0, Z, Z);
      c.fillStyle = Wc[1];
      c.beginPath();
      c.moveTo(0, 4 + Math.sin(wf * 2) * 2);
      for (var x = 0; x <= Z; x += 2) c.lineTo(x, 4 + Math.sin(wf * 2 + x * 0.42) * 2);
      c.lineTo(Z, Z); c.lineTo(0, Z); c.closePath(); c.fill();
      c.fillStyle = Wc[2]; c.globalAlpha = 0.6;
      c.fillRect(2, 3 + wf, Z - 4, 1.5);
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(255,255,255,.22)';
      c.beginPath(); c.arc(6 + wf * 3, Z - 6, 1.5, 0, TAU); c.fill();
    } else if (name.indexOf('gas') === 0) {
      var gf = +name.charAt(3), G = th.gas;
      c.globalAlpha = 0.62;
      c.fillStyle = G[0];
      c.beginPath(); c.arc(h, h + Math.sin(gf * 2.1) * 1.8, Z * 0.45, 0, TAU); c.fill();
      c.globalAlpha = 0.8;
      c.fillStyle = G[1];
      c.beginPath(); c.arc(h - 2 + gf, h - 2 + Math.cos(gf * 1.9) * 1.6, Z * 0.24, 0, TAU); c.fill();
      c.globalAlpha = 1;
      c.fillStyle = G[2];
      c.beginPath(); c.arc(h + 3, h + 3, 1.7, 0, TAU); c.fill();
    } else if (name === 'stone') {
      c.fillStyle = STONE[0];
      rr(c, 1, 1, Z - 2, Z - 2, 4.5); c.fill();
      c.fillStyle = STONE[1];
      rr(c, 1.8, 1.8, Z - 3.6, Z - 7, 4); c.fill();
      c.fillStyle = STONE[2]; c.globalAlpha = 0.6;
      c.fillRect(3.5, 3.2, Z - 7, 1.6);
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(20,26,40,.45)';
      c.fillRect(5, Z - 8, Z - 10, 1.2);
      c.fillRect(7, Z - 12, 4, 1.2);
    } else if (name.indexOf('mon') === 0) {
      var mf = +name.charAt(3), lift = mf ? 1.2 : 0;
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.beginPath(); c.ellipse(h, Z - 2.4, Z * 0.32, 1.9, 0, 0, TAU); c.fill();
      c.fillStyle = MON[0];
      rr(c, 1.6, 2.4 - lift, Z - 3.2, Z - 5, 7.5); c.fill();
      c.fillStyle = MON[1];
      rr(c, 2.6, 3.2 - lift, Z - 5.2, Z - 8, 6.5); c.fill();
      c.fillStyle = MON[2];
      c.beginPath(); c.arc(h - 3.6, h - 1.6 - lift, 2.4 + mf * 0.3, 0, TAU); c.fill();
      c.beginPath(); c.arc(h + 3.6, h - 1.6 - lift, 2.4 + mf * 0.3, 0, TAU); c.fill();
      c.fillStyle = '#2a0e3c';
      c.beginPath(); c.arc(h - 3.6, h - 1.4 - lift, 1.1, 0, TAU); c.fill();
      c.beginPath(); c.arc(h + 3.6, h - 1.4 - lift, 1.1, 0, TAU); c.fill();
      c.strokeStyle = '#2a0e3c'; c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(h - 4, Z - 6 - lift);
      c.lineTo(h - 1.4, Z - 7.6 - lift); c.lineTo(h + 1.4, Z - 6 - lift); c.lineTo(h + 4, Z - 7.6 - lift);
      c.stroke();
    } else if (name.indexOf('hero') === 0) {
      var hf = +name.charAt(4);        // 0 idle, 1 cheer, 2 slump
      var dy = hf === 1 ? -1.4 : hf === 2 ? 2.2 : 0;
      var body = hf === 2 ? '#7d8598' : '#3fe3c4';
      c.fillStyle = 'rgba(0,0,0,.32)';
      c.beginPath(); c.ellipse(h, Z - 2.2, Z * 0.3, 1.8, 0, 0, TAU); c.fill();
      c.fillStyle = body;
      rr(c, 4, 4.5 + dy, Z - 8, Z - 9, 5.5); c.fill();
      c.fillStyle = hf === 2 ? '#9aa2b4' : '#8bfae4';
      rr(c, 5.2, 5.4 + dy, Z - 10.4, 5.4, 3); c.fill();
      c.fillStyle = '#08222c';
      if (hf === 2) {
        c.fillRect(6.6, 9.4 + dy, 3.6, 1.3);
        c.fillRect(Z - 10.2, 9.4 + dy, 3.6, 1.3);
      } else {
        c.fillRect(7, 9 + dy, 2.6, 2.8);
        c.fillRect(Z - 9.6, 9 + dy, 2.6, 2.8);
      }
      c.fillStyle = BRASS;
      c.fillRect(5, Z - 7.5 + dy, Z - 10, 2.6);
      if (hf === 1) {
        c.strokeStyle = body; c.lineWidth = 2.2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(4.5, 9 + dy); c.lineTo(1.8, 4 + dy); c.stroke();
        c.beginPath(); c.moveTo(Z - 4.5, 9 + dy); c.lineTo(Z - 1.8, 4 + dy); c.stroke();
      }
    } else if (name === 'pin') {
      c.fillStyle = '#8f6d26'; c.fillRect(0, 5, Z, Z - 10);
      var pg = c.createLinearGradient(0, 5, 0, Z - 5);
      pg.addColorStop(0, '#ffe6a8'); pg.addColorStop(0.4, '#e0b354'); pg.addColorStop(1, '#a17a2a');
      c.fillStyle = pg; c.fillRect(0, 5.6, Z, Z - 11.2);
      c.fillStyle = 'rgba(255,246,214,.7)'; c.fillRect(0, 6.4, Z, 1.4);
      c.fillStyle = 'rgba(60,40,6,.35)';
      c.fillRect(Z / 2 - 0.7, 5.6, 1.4, Z - 11.2);
    }
    c.restore();
  }

  function bakeCells(sc, ch) {
    var key = 'dk-cells-' + ch;
    if (sc.textures.exists(key)) return key;
    var rows = Math.ceil(FRAMES.length / A_COLS);
    var t = canvasTex(sc, key, A_COLS * A_CELL, rows * A_CELL);
    var c = ctxOf(t);
    c.clearRect(0, 0, A_COLS * A_CELL, rows * A_CELL);
    for (var i = 0; i < FRAMES.length; i++) {
      var cx = (i % A_COLS) * A_CELL, cy = ((i / A_COLS) | 0) * A_CELL;
      c.save(); c.translate(cx, cy);
      paintCell(c, FRAMES[i], CH[ch]);
      c.restore();
      // second arg is the SOURCE INDEX, not an x offset
      t.add(FRAMES[i], 0, Math.round(cx * RETINA_FACTOR), Math.round(cy * RETINA_FACTOR), Math.round(CELL * RETINA_FACTOR), Math.round(CELL * RETINA_FACTOR));
    }
    t.refresh();
    return key;
  }

  // ------------------------------------------------------- particle atlas
  var PFRAMES = ['spark', 'steam', 'ember', 'shard', 'ribbon', 'villager', 'bird'];
  function bakeFx(sc) {
    var key = 'dk-fx';
    if (sc.textures.exists(key)) return key;
    var t = canvasTex(sc, key, 7 * 16, 16);
    var c = ctxOf(t);
    c.clearRect(0, 0, 112, 16);
    // spark: soft round core
    var g = c.createRadialGradient(8, 8, 0, 8, 8, 7);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 16, 16);
    // steam: wide soft puff
    g = c.createRadialGradient(24, 8, 1, 24, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(0.6, 'rgba(255,255,255,.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(16, 0, 16, 16);
    // ember: teardrop flake
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(40, 2); c.quadraticCurveTo(45.5, 8, 40, 14); c.quadraticCurveTo(34.5, 8, 40, 2);
    c.closePath(); c.fill();
    // shard: angular chip
    c.beginPath();
    c.moveTo(56, 2.5); c.lineTo(61.5, 7); c.lineTo(58, 13.5); c.lineTo(51.5, 10);
    c.closePath(); c.fill();
    // ribbon: flat bar with a soft end
    rr(c, 66, 5.5, 12, 5, 2.5); c.fill();
    // villager: a hooded figure small enough to read as a person at 8px
    c.beginPath(); c.arc(88, 5.4, 2.5, 0, TAU); c.fill();
    c.beginPath();
    c.moveTo(85, 15); c.lineTo(86.4, 7.6); c.quadraticCurveTo(88, 6.4, 89.6, 7.6);
    c.lineTo(91, 15); c.closePath(); c.fill();
    // bird: a two stroke gull silhouette
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(98, 9); c.quadraticCurveTo(101, 5.4, 104, 9);
    c.moveTo(104, 9); c.quadraticCurveTo(107, 5.4, 110, 9);
    c.stroke();
    for (var i = 0; i < PFRAMES.length; i++) t.add(PFRAMES[i], 0, Math.round(i * 16 * RETINA_FACTOR), 0, Math.round(16 * RETINA_FACTOR), Math.round(16 * RETINA_FACTOR));
    t.refresh();
    return key;
  }

  // ------------------------------------------------------------ UI atlas
  var UI = {
    handle: [0, 0, 44, 44], handleSel: [44, 0, 44, 44], handleOut: [88, 0, 44, 44],
    chev: [132, 0, 26, 26], cross: [158, 0, 26, 26], star: [184, 0, 22, 22],
    starOff: [206, 0, 22, 22], gear: [228, 0, 28, 28],
    iUndo: [0, 44, 30, 30], iRetry: [30, 44, 30, 30], iMap: [60, 44, 30, 30], iKeep: [90, 44, 30, 30],
    iStone: [120, 44, 22, 22], iTimber: [142, 44, 22, 22], iBrass: [164, 44, 22, 22],
    iBeast: [186, 44, 22, 22], iKey: [208, 44, 22, 22], lock: [230, 44, 22, 22],
    crown: [0, 74, 34, 26], warn: [34, 74, 26, 26]
  };
  function bakeUI(sc) {
    var key = 'dk-ui';
    if (sc.textures.exists(key)) return key;
    var t = canvasTex(sc, key, 256, 104);
    var c = ctxOf(t);
    c.clearRect(0, 0, 256, 104);

    function keyHandle(ox, tone, ring) {
      c.save(); c.translate(ox + 22, 22);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath(); c.arc(0, 2.4, 15, 0, TAU); c.fill();
      var g = c.createRadialGradient(-4, -5, 1.5, 0, 0, 15);
      g.addColorStop(0, '#fff2c8'); g.addColorStop(0.5, tone); g.addColorStop(1, '#8f6a1f');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 14.5, 0, TAU); c.fill();
      c.fillStyle = '#221a0a';
      c.beginPath(); c.arc(0, 0, 5.2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,244,214,.55)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, 0, 9.4, 0, TAU); c.stroke();
      c.strokeStyle = ring; c.lineWidth = 2.4;
      c.beginPath(); c.arc(0, 0, 19, 0, TAU); c.stroke();
      c.restore();
    }
    keyHandle(0, '#e0b354', 'rgba(255,240,200,.45)');
    keyHandle(44, '#ffdf90', '#fff6d5');
    keyHandle(88, '#8a8f9e', 'rgba(160,170,190,.4)');

    // chevron, the pull direction mark
    c.save(); c.translate(145, 13);
    c.strokeStyle = '#fff6d5'; c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-5, -6); c.lineTo(4, 0); c.lineTo(-5, 6); c.stroke();
    c.restore();
    // cross hatch, the blocked mark
    c.save(); c.translate(171, 13);
    c.strokeStyle = '#ffb45c'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-5.5, -5.5); c.lineTo(5.5, 5.5); c.moveTo(5.5, -5.5); c.lineTo(-5.5, 5.5); c.stroke();
    c.restore();

    function star(ox, on) {
      c.save(); c.translate(ox + 11, 11);
      c.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 9.2;
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fillStyle = on ? BRASS : 'rgba(150,168,200,.22)'; c.fill();
      c.strokeStyle = on ? '#fff3c8' : 'rgba(150,168,200,.4)'; c.lineWidth = 1.2; c.stroke();
      c.restore();
    }
    star(184, true); star(206, false);

    // gear
    c.save(); c.translate(242, 14);
    c.fillStyle = '#c7d6ef';
    for (var i = 0; i < 8; i++) {
      c.save(); c.rotate(i * TAU / 8);
      rr(c, -2.2, -12, 4.4, 5.4, 1.4); c.fill();
      c.restore();
    }
    c.beginPath(); c.arc(0, 0, 8.4, 0, TAU); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(0, 0, 3.6, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.restore();

    function icon(box, draw) {
      c.save(); c.translate(box[0] + box[2] / 2, box[1] + box[3] / 2);
      draw();
      c.restore();
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    icon(UI.iUndo, function () {
      c.strokeStyle = PAPER; c.lineWidth = 2.6;
      c.beginPath(); c.arc(1, 1, 7.5, Math.PI * 0.85, Math.PI * 2.15); c.stroke();
      c.fillStyle = PAPER;
      c.beginPath(); c.moveTo(-9, -4.5); c.lineTo(-2.5, -5.5); c.lineTo(-6, 1.5); c.closePath(); c.fill();
    });
    icon(UI.iRetry, function () {
      c.strokeStyle = PAPER; c.lineWidth = 2.6;
      c.beginPath(); c.arc(0, 1, 7.5, Math.PI * 0.75, Math.PI * 2.35); c.stroke();
      c.fillStyle = PAPER;
      c.beginPath(); c.moveTo(8.5, -5); c.lineTo(2.5, -6.5); c.lineTo(6, 1); c.closePath(); c.fill();
    });
    icon(UI.iMap, function () {
      c.fillStyle = PAPER;
      c.beginPath();
      c.moveTo(-10, -6); c.lineTo(-3, -8.5); c.lineTo(3, -6); c.lineTo(10, -8.5);
      c.lineTo(10, 7); c.lineTo(3, 9.5); c.lineTo(-3, 7); c.lineTo(-10, 9.5);
      c.closePath(); c.fill();
      c.strokeStyle = '#2a3450'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-3, -8.5); c.lineTo(-3, 7); c.moveTo(3, -6); c.lineTo(3, 9.5); c.stroke();
    });
    icon(UI.iKeep, function () {
      c.fillStyle = PAPER;
      c.fillRect(-9, -2, 18, 10);
      for (var i = 0; i < 4; i++) c.fillRect(-9 + i * 5, -6, 3, 4);
      c.fillStyle = '#2a3450';
      c.fillRect(-2, 1, 4, 7);
    });
    icon(UI.iStone, function () {
      c.fillStyle = STONE[1];
      rr(c, -8, -5, 16, 10, 3); c.fill();
      c.fillStyle = STONE[2]; rr(c, -6.4, -3.6, 12.8, 3, 1.5); c.fill();
    });
    icon(UI.iTimber, function () {
      c.fillStyle = '#a86f4c';
      rr(c, -8, -6, 16, 5, 2.2); c.fill();
      rr(c, -8, 1, 16, 5, 2.2); c.fill();
      c.fillStyle = '#d09a6c';
      c.fillRect(-6, -5, 12, 1.4); c.fillRect(-6, 2, 12, 1.4);
    });
    icon(UI.iBrass, function () {
      var g2 = c.createRadialGradient(-2, -3, 1, 0, 0, 8);
      g2.addColorStop(0, '#fff3c0'); g2.addColorStop(1, '#c8901f');
      c.fillStyle = g2;
      c.beginPath(); c.arc(0, 0, 7.6, 0, TAU); c.fill();
      c.fillStyle = 'rgba(90,60,4,.5)';
      c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
    });
    icon(UI.iBeast, function () {
      c.fillStyle = MON[1];
      rr(c, -7.5, -6, 15, 13, 5.5); c.fill();
      c.fillStyle = MON[2];
      c.beginPath(); c.arc(-3, -1, 2, 0, TAU); c.fill();
      c.beginPath(); c.arc(3, -1, 2, 0, TAU); c.fill();
    });
    icon(UI.iKey, function () {
      c.strokeStyle = BRASS; c.lineWidth = 2.6;
      c.beginPath(); c.arc(-3.5, 0, 4.2, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(0.4, 0); c.lineTo(8.5, 0); c.stroke();
      c.beginPath(); c.moveTo(6, 0); c.lineTo(6, 4); c.stroke();
    });
    icon(UI.lock, function () {
      c.strokeStyle = '#8fa0c0'; c.lineWidth = 2.2;
      c.beginPath(); c.arc(0, -2.5, 4, Math.PI, 0); c.stroke();
      c.fillStyle = '#8fa0c0';
      rr(c, -6, -2, 12, 9, 2); c.fill();
    });
    icon(UI.crown, function () {
      c.fillStyle = BRASS;
      c.beginPath();
      c.moveTo(-14, 8); c.lineTo(-11, -7); c.lineTo(-4.5, 1.5); c.lineTo(0, -10);
      c.lineTo(4.5, 1.5); c.lineTo(11, -7); c.lineTo(14, 8);
      c.closePath(); c.fill();
      c.fillStyle = '#fff3c8';
      c.beginPath(); c.arc(0, -10, 2, 0, TAU); c.fill();
    });
    icon(UI.warn, function () {
      c.fillStyle = '#ffb45c';
      c.beginPath(); c.moveTo(0, -9); c.lineTo(10, 8.5); c.lineTo(-10, 8.5); c.closePath(); c.fill();
      c.fillStyle = '#2a1c06';
      c.fillRect(-1.4, -4.5, 2.8, 7.5);
      c.beginPath(); c.arc(0, 5.6, 1.5, 0, TAU); c.fill();
    });

    for (var k in UI) {
      if (!Object.prototype.hasOwnProperty.call(UI, k)) continue;
      var b = UI[k];
      t.add(k, 0, Math.round(b[0] * RETINA_FACTOR), Math.round(b[1] * RETINA_FACTOR), Math.round(b[2] * RETINA_FACTOR), Math.round(b[3] * RETINA_FACTOR));
    }
    t.refresh();
    return key;
  }

  // ============================================================ particles
  var POOLS = { spark: 64, steam: 34, ember: 44, shard: 32, ribbon: 44 };

  function ParticleEngine(sc, parent) {
    this.list = [];
    this.byKind = {};
    var self = this;
    Object.keys(POOLS).forEach(function (kind) {
      var arr = [];
      for (var i = 0; i < POOLS[kind]; i++) {
        var img = sc.add.image(0, 0, 'dk-fx', kind).setScale(1 / RETINA_FACTOR);
        img.setVisible(false).setActive(false);
        parent.add(img);
        var p = { img: img, kind: kind, live: false, x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 1, s0: 1, s1: 0, rot: 0, spin: 0, g: 0 };
        arr.push(p); self.list.push(p);
      }
      self.byKind[kind] = { arr: arr, next: 0 };
    });
  }
  ParticleEngine.prototype.take = function (kind) {
    var pool = this.byKind[kind];
    if (!pool) return null;
    var arr = pool.arr, n = arr.length;
    for (var i = 0; i < n; i++) {
      var p = arr[(pool.next + i) % n];
      if (!p.live) { pool.next = (pool.next + i + 1) % n; return p; }
    }
    var oldest = arr[pool.next];
    pool.next = (pool.next + 1) % n;
    return oldest;
  };
  ParticleEngine.prototype.burst = function (kind, x, y, n, o) {
    o = o || {};
    var reduced = !motionOn();
    if (reduced) n = Math.max(1, Math.round(n * 0.4));
    for (var i = 0; i < n; i++) {
      var p = this.take(kind);
      if (!p) return;
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1.2) : Math.random() * TAU;
      var sp = (o.speed || 90) * (0.45 + Math.random() * 0.9);
      p.live = true;
      p.x = x + (Math.random() - 0.5) * (o.jitter || 6);
      p.y = y + (Math.random() - 0.5) * (o.jitter || 6);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp + (o.rise || 0);
      p.m = (o.life || 0.55) * (0.7 + Math.random() * 0.6);
      p.l = p.m;
      p.s0 = (o.scale || 1) * (0.7 + Math.random() * 0.6);
      p.s1 = o.scaleEnd != null ? o.scaleEnd : 0;
      p.g = o.gravity != null ? o.gravity : 280;
      p.rot = Math.random() * TAU;
      p.spin = o.spin ? (Math.random() - 0.5) * o.spin : 0;
      var img = p.img;
      img.setVisible(true).setActive(true);
      img.setTint(o.tint != null ? o.tint : 0xffffff);
      img.setBlendMode(o.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      img.setPosition(p.x, p.y);
      img.setScale(p.s0 / RETINA_FACTOR);
      img.setAlpha(o.alpha != null ? o.alpha : 1);
      img.setRotation(p.rot);
    }
  };
  ParticleEngine.prototype.update = function (dt) {
    var list = this.list;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.live) continue;
      p.l -= dt;
      if (p.l <= 0) {
        p.live = false;
        p.img.setVisible(false).setActive(false);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var u = p.l / p.m;
      var img = p.img;
      img.x = p.x; img.y = p.y;
      img.rotation = p.rot;
      img.setScale((p.s1 + (p.s0 - p.s1) * u) / RETINA_FACTOR);
      img.setAlpha(u > 0.75 ? 1 : u / 0.75);
    }
  };
  ParticleEngine.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      if (!p.live) continue;
      p.live = false;
      p.img.setVisible(false).setActive(false);
    }
  };

  // ======================================================== verification
  var DK_STATE = {
    mode: 'boot', chapter: 0, chapterName: '', level: 1, levelName: '', blueprint: false,
    pulls: 0, par: 0, target: 0, collected: 0, lost: 0, beasts: 0, undos: 0,
    stars: 0, over: '', settled: true, keepTier: 0, keepMax: MAX_KEEP,
    materials: { s: 0, t: 0, b: 0 }, cleared: 0, levels: NL, reducedMotion: false, ready: false
  };
  var DK = {
    state: DK_STATE,
    forceMode: null,      // 'title' | 'map' | 'play' | 'keep' | 'blueprint'
    forceStage: null,     // 1-based chamber number
    catalog: LEVELS.map(function (l, i) {
      return { id: i + 1, name: l.n, chapter: l.c + 1, chapterName: CH[l.c].name, target: l.t, par: l.p, keys: l.r.length };
    }),
    buildings: BUILD.map(function (b, i) {
      return { id: b.k, name: b.n, tiers: [tierCost(i, 0), tierCost(i, 1), tierCost(i, 2)] };
    })
  };
  window.__dk = DK;

  // =============================================================== scene
  var DominionScene = class extends Phaser.Scene {
    constructor() { super({ key: 'dominion' }); }

    preload() {
      kit.loader.show('DOMINION KEYS');
      kit.loader.progress(0.05);
    }

    create() {
      var self = this;
      this.cameras.main.setZoom(RETINA_FACTOR);
      this.mode = 'title';
      this.st = null;
      this.level = 0;
      this.blueprint = false;
      this.pins = [];
      this.sel = 0;
      this.pulls = 0;
      this.undos = 0;
      this.over = null;
      this.overT = 0;
      this.failCause = null;
      this.failCell = null;
      this.settled = true;
      this.acc = 0;
      this.time0 = 0;
      this.checked = false;
      this.history = [];
      this.animFrame = 0;
      this.animAcc = 0;
      this.selState = 'ready';
      this.selT = 0;
      this.coachText = '';
      this.coachLife = 0;
      this.tutStep = profile.tut ? 99 : 0;
      this.banner = null;
      this.bannerT = 0;
      this.chipText = '';
      this.chipLife = 0;
      this.pendingReward = null;
      this.musicName = null;
      this.keyHeld = {};
      this.pressed = Object.create(null);
      this.gestures = new Map();
      this.pointerClaims = new Map();
      this.hudSig = '';
      this.barSig = '';
      this.mapSig = '';
      this.keepSig = '';
      this.titleSig = '';
      this.chipSig = '';
      this.bannerSig = '';
      this.coachSig = '';
      this.pausedByKit = false;
      this.bgChapter = -1;
      this.sfxBudget = {};
      this.mapChapter = 0;
      this.hitRects = [];
      this.keepFlash = 0;
      this.selPulse = 0;
      this.audioReady = false;
      scene = this;

      // --- bake everything the first frame needs ---
      bakeUI(this);
      kit.loader.progress(0.18);
      bakeFx(this);
      kit.loader.progress(0.26);
      for (var c = 0; c < CHAPTERS; c++) {
        bakeCells(this, c);
        this.bakeBackground(c);
        kit.loader.progress(0.26 + 0.34 * (c + 1) / CHAPTERS);
      }
      canvasTex(this, 'dk-board', BW + PAD * 2, BH + PAD * 2);
      canvasTex(this, 'dk-hud', DW, 140);
      canvasTex(this, 'dk-bar', DW, 80);
      canvasTex(this, 'dk-coach', DW, 44);
      canvasTex(this, 'dk-chip', 300, 34);
      canvasTex(this, 'dk-banner', 320, 300);
      canvasTex(this, 'dk-keep', DW, 376);
      canvasTex(this, 'dk-page', DW, DH);
      kit.loader.progress(0.66);

      // --- display list ---
      this.bg = this.add.image(0, 0, 'dk-bg-0').setOrigin(0, 0).setScale(1 / RETINA_FACTOR);
      this.page = this.add.image(0, 0, 'dk-page').setOrigin(0, 0).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.keepImg = this.add.image(0, 78, 'dk-keep').setOrigin(0, 0).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.keepLive = this.add.container(0, 78).setVisible(false);

      this.boardRoot = this.add.container(BX - PAD, BY - PAD);
      this.boardImg = this.add.image(0, 0, 'dk-board').setOrigin(0, 0).setScale(1 / RETINA_FACTOR);
      this.boardRoot.add(this.boardImg);

      this.cellLayer = this.add.container(PAD, PAD);
      this.boardRoot.add(this.cellLayer);
      this.cells = [];
      for (var i = 0; i < 190; i++) {
        var img = this.add.image(0, 0, 'dk-cells-0', 'gold').setScale(1 / RETINA_FACTOR);
        img.setVisible(false);
        this.cellLayer.add(img);
        this.cells.push(img);
      }

      this.pinLayer = this.add.container(0, 0);
      this.boardRoot.add(this.pinLayer);
      this.pinViews = [];
      for (i = 0; i < 6; i++) {
        var v = {
          bar: this.add.tileSprite(0, 0, CELL * 3, CELL, 'dk-cells-0', 'pin').setOrigin(0, 0.5).setTileScale(1 / RETINA_FACTOR, 1 / RETINA_FACTOR),
          handle: this.add.image(0, 0, 'dk-ui', 'handle').setOrigin(0.5).setScale(1 / RETINA_FACTOR),
          chev: this.add.image(0, 0, 'dk-ui', 'chev').setOrigin(0.5).setScale(1 / RETINA_FACTOR)
        };
        v.bar.setVisible(false); v.handle.setVisible(false); v.chev.setVisible(false);
        this.pinLayer.add(v.bar); this.pinLayer.add(v.handle); this.pinLayer.add(v.chev);
        this.pinViews.push(v);
      }
      this.selRing = this.add.image(0, 0, 'dk-ui', 'handleSel').setOrigin(0.5).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.selMark = this.add.image(0, 0, 'dk-ui', 'chev').setOrigin(0.5).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.pinLayer.add(this.selRing);
      this.pinLayer.add(this.selMark);

      this.fxLayer = this.add.container(PAD, PAD);
      this.boardRoot.add(this.fxLayer);
      this.fx = new ParticleEngine(this, this.fxLayer);
      kit.loader.progress(0.78);

      this.buildKeepLive();

      this.causeRing = this.add.image(0, 0, 'dk-ui', 'warn').setOrigin(0.5).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.fxLayer.add(this.causeRing);

      this.dim = this.add.rectangle(BX - PAD, BY - PAD, BW + PAD * 2, BH + PAD * 2, 0x080c14, 0.55)
        .setOrigin(0, 0).setVisible(false);

      this.hud = this.add.image(0, 0, 'dk-hud').setOrigin(0, 0).setScale(1 / RETINA_FACTOR);
      this.coach = this.add.image(DW / 2, 116, 'dk-coach').setOrigin(0.5).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.chip = this.add.image(DW / 2, 660, 'dk-chip').setOrigin(0.5).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.bar = this.add.image(0, 688, 'dk-bar').setOrigin(0, 0).setScale(1 / RETINA_FACTOR);
      this.bannerImg = this.add.image(DW / 2, 420, 'dk-banner').setOrigin(0.5).setScale(1 / RETINA_FACTOR).setVisible(false);
      this.flash = this.add.rectangle(0, 0, DW, DH, 0xfff0c8, 0).setOrigin(0, 0).setVisible(false);

      // --- input ---
      this.bindPointer();
      this.bindKeys();

      // --- audio: sfx during the loading screen, music lazily after a gesture ---
      kit.audio.preload(['tap', 'pull', 'coin', 'steam', 'ignite', 'slay', 'burn', 'fail', 'win', 'build'])
        .then(function () {
          kit.loader.progress(1);
          kit.loader.hide();
          self.booted = true;
          DK_STATE.ready = true;
        });

      this.applyForce(true);
      if (this.mode === 'title') this.showTitle();
      this.syncState();
    }

    // -------------------------------------------------- keep ambient layer
    // One ambient motion per prop class: hearth smoke, gulls, and villagers
    // walking the market road. Pooled sprites, no allocation after create.
    buildKeepLive() {
      var i;
      this.smoke = [];
      var vents = [
        { b: 6, x: 56, y: 250 }, { b: 6, x: 62, y: 250 },
        { b: 11, x: 190, y: 196 }, { b: 11, x: 196, y: 198 },
        { b: 3, x: 108, y: 258 }, { b: 8, x: 340, y: 214 }
      ];
      for (i = 0; i < vents.length; i++) {
        var sp = this.add.image(vents[i].x, vents[i].y, 'dk-fx', 'steam');
        sp.setTint(0xdfe6f2).setScale(1 / RETINA_FACTOR).setAlpha(0).setVisible(false);
        this.keepLive.add(sp);
        this.smoke.push({ img: sp, b: vents[i].b, x: vents[i].x, y: vents[i].y, ph: i * 0.37 });
      }
      this.birds = [];
      for (i = 0; i < 3; i++) {
        var bd = this.add.image(0, 0, 'dk-fx', 'bird');
        bd.setTint(0x27385c).setScale(0.9 / RETINA_FACTOR).setVisible(false);
        this.keepLive.add(bd);
        this.birds.push({ img: bd, ph: i * 2.1, y: 70 + i * 26, sp: 22 + i * 7 });
      }
      this.villagers = [];
      for (i = 0; i < 8; i++) {
        var vg = this.add.image(0, 0, 'dk-fx', 'villager');
        vg.setTint(i % 3 === 0 ? 0xf3bc50 : i % 3 === 1 ? 0xec6b62 : 0xdbe6ff);
        vg.setScale(0.8 / RETINA_FACTOR).setVisible(false);
        this.keepLive.add(vg);
        this.villagers.push({ img: vg, ph: i * 0.83, sp: 15 + (i % 4) * 5, lane: i % 2 });
      }
    }

    updateKeepLive() {
      var t = this.time0, i, live = motionOn();
      var tier = keepTier();
      for (i = 0; i < this.smoke.length; i++) {
        var sm = this.smoke[i];
        var on = profile.build[sm.b] > 0;
        sm.img.setVisible(on);
        if (!on) continue;
        var u = ((t * 0.42 + sm.ph) % 1);
        sm.img.x = sm.x + Math.sin((t + sm.ph) * 1.4) * 5 * u;
        sm.img.y = sm.y - u * 46;
        sm.img.setScale((0.45 + u * 0.95) / RETINA_FACTOR);
        sm.img.setAlpha((1 - u) * 0.42);
      }
      for (i = 0; i < this.birds.length; i++) {
        var bd = this.birds[i];
        bd.img.setVisible(true);
        var bx = ((t * bd.sp + bd.ph * 130) % 430) - 20;
        bd.img.x = bx;
        bd.img.y = bd.y + Math.sin(t * 0.9 + bd.ph) * 9;
        bd.img.setScale(0.85 / RETINA_FACTOR, (live ? 0.7 + Math.abs(Math.sin(t * 5 + bd.ph)) * 0.45 : 0.9) / RETINA_FACTOR);
        bd.img.setAlpha(0.55);
      }
      var count = tier === 0 ? 0 : Math.min(this.villagers.length, 1 + Math.floor(tier / 4));
      for (i = 0; i < this.villagers.length; i++) {
        var vg = this.villagers[i];
        if (i >= count) { vg.img.setVisible(false); continue; }
        vg.img.setVisible(true);
        var vu = ((t * vg.sp + vg.ph * 90) % 300) / 300;
        vg.img.x = 148 + vg.lane * 26 + vu * (vg.lane ? -8 : 8) + Math.sin(vg.ph) * 6;
        vg.img.y = 258 + vu * 108;
        vg.img.setScale((0.6 + vu * 0.45) / RETINA_FACTOR);
        vg.img.setAlpha(0.95);
        if (live) vg.img.y -= Math.abs(Math.sin(t * 6 + vg.ph)) * 1.6;
      }
    }

    // ------------------------------------------------------- force switches
    applyForce(atBoot) {
      var m = DK.forceMode, s = DK.forceStage;
      var acted = false;
      if (typeof s === 'number' && s >= 1 && s <= NL && (atBoot || s !== this.forcedStage)) {
        this.forcedStage = s;
        this.startLevel(s - 1, false);
        acted = true;
      }
      if (typeof m === 'string' && (atBoot || m !== this.forcedMode)) {
        this.forcedMode = m;
        if (m === 'play') { if (!acted) this.startLevel(this.forcedStage ? this.forcedStage - 1 : nextUnsolved(), false); }
        else if (m === 'keep') this.showKeep();
        else if (m === 'map') this.showMap(false);
        else if (m === 'blueprint') this.showMap(true);
        else if (m === 'title') this.showTitle();
        acted = true;
      }
      return acted;
    }

    // -------------------------------------------------------------- audio
    sfx(name, opts) {
      var n = this.sfxBudget[name] || 0;
      if (n >= 2) return;
      this.sfxBudget[name] = n + 1;
      kit.audio.sfx(name, opts);
    }
    music(name) {
      if (this.musicName === name) return;
      this.musicName = name;
      if (!this.audioReady) return;      // deferred until the first gesture
      kit.audio.music(name, 700);
    }
    startAudio() {
      if (this.audioReady) return;
      this.audioReady = true;
      if (this.musicName) kit.audio.music(this.musicName, 700);
    }

    // ------------------------------------------------------------- levels
    descOf(i) {
      var L = LEVELS[i], res = [], ramps = [], k;
      for (k = 0; k < L.r.length; k++) {
        var a = L.r[k];
        res.push({ id: a[0], cx: a[1], py: a[2], anchor: a[3], mat: a[4], count: a[5] });
      }
      for (k = 0; k < L.m.length; k++) {
        var b = L.m[k];
        ramps.push({ x: b[0], y: b[1], d: b[2], len: b[3], noShaft: b[4] });
      }
      return { res: res, ramps: ramps };
    }

    startLevel(i, blueprint) {
      i = clamp(i | 0, 0, NL - 1);
      this.mode = 'play';
      this.level = i;
      this.blueprint = !!blueprint;
      this.bpIndex = this.blueprint ? BLUEPRINT.indexOf(i) : -1;
      if (this.blueprint && this.bpIndex < 0) this.blueprint = false;
      var L = LEVELS[i], d = this.descOf(i);
      var st = S.buildDesc(d);
      st.events = null;
      S.settle(st, 220);                    // the exact starting point the solver validated
      for (var h = 0; h < 8; h++) st.hist[h] = 0;
      st.hi = 0;
      st.events = [];
      this.st = st;
      this.target = L.t;
      this.par = L.p;
      this.pulls = 0;
      this.undos = 0;
      this.over = null;
      this.overT = 0;
      this.failCause = null;
      this.failCell = null;
      this.settled = true;
      this.checked = false;
      this.acc = 0;
      this.history.length = 0;
      this.fx.clear();
      this.gestures.clear();
      this.pointerClaims.clear();
      this.selState = 'ready';
      this.selT = 0;
      this.chipLife = 0;
      this.coachLife = 0;
      this.coach.setVisible(false);
      this.banner = null;
      this.dim.setVisible(false);
      this.causeRing.setVisible(false);
      this.bannerImg.setVisible(false);
      this.page.setVisible(false);
      this.keepImg.setVisible(false);
      this.keepLive.setVisible(false);
      this.boardRoot.setVisible(true);
      this.hud.setVisible(true);
      this.bar.setVisible(true);
      this.flash.setAlpha(0).setVisible(false);

      // pin views from the descriptor
      this.pins = [];
      for (var k = 0; k < d.res.length; k++) {
        var r = d.res[k], cells = [], x;
        for (x = r.x0; x <= r.x1; x++) if (st.pins[r.py * S.W + x] === r.id) cells.push(x);
        if (!cells.length) continue;
        this.pins.push({
          id: r.id, py: r.py, anchor: r.anchor, mat: r.mat,
          lo: Math.min.apply(null, cells), hi: Math.max.apply(null, cells),
          out: 0, t: 0
        });
      }
      this.pins.sort(function (a, b) { return a.py - b.py || a.anchor - b.anchor; });
      this.sel = 0;

      this.setChapterArt(L.c);
      this.paintBoardStatic();
      this.layoutPins();
      this.hudSig = ''; this.barSig = '';
      this.music('vault');
      this.coachForLevel();
      this.syncState();
    }

    retry() {
      if (this.mode !== 'play') return;
      this.sfx('tap', { volume: 0.4, rate: 0.9 });
      this.startLevel(this.level, this.blueprint);
    }

    undo() {
      if (this.mode !== 'play' || this.blueprint) return;
      if (!this.history.length) { this.showChip('Nothing to undo', 'warn'); return; }
      var h = this.history.pop();
      S.restore(this.st, h.snap);
      this.pulls = h.pulls;
      this.undos++;
      for (var i = 0; i < this.pins.length; i++) {
        this.pins[i].out = h.out[i];
        this.pins[i].t = h.out[i] ? 1 : 0;
      }
      this.over = null;
      this.overT = 0;
      this.failCause = null;
      this.failCell = null;
      this.settled = true;
      this.checked = false;
      this.acc = 0;
      this.dim.setVisible(false);
      this.causeRing.setVisible(false);
      this.bannerImg.setVisible(false);
      this.banner = null;
      this.fx.clear();
      this.selState = 'resolve';
      this.selT = 0;
      this.layoutPins();
      this.sfx('pull', { volume: 0.3, rate: 1.35 });
      this.showChip('Key returned', 'iUndo');
      this.hudSig = ''; this.barSig = '';
      this.syncState();
    }

    // ------------------------------------------------------------ pulling
    canPull() {
      return this.mode === 'play' && !this.over && !kit.paused && !this.pausedByKit;
    }

    pullPin(p) {
      if (!p || p.out || !this.canPull()) return false;
      this.history.push({
        snap: S.snapshot(this.st),
        pulls: this.pulls,
        out: this.pins.map(function (q) { return q.out; })
      });
      if (this.history.length > 40) this.history.shift();
      p.out = 1;
      p.t = 0;
      for (var k = 0; k < 8; k++) this.st.hist[k] = 0;   // cycle memory is per pull, as in the solver
      this.st.hi = 0;
      S.pull(this.st, p.id);
      this.pulls++;
      this.settled = false;
      this.checked = false;
      this.selState = 'resolve';
      this.selT = 0;
      this.sfx('pull', { volume: 0.62 });
      kit.juice.shake(2.4, 130);
      var hp = this.handleLocal(p);
      this.fx.burst('shard', hp[0], hp[1], 6, {
        angle: p.anchor < 0 ? Math.PI : 0, spread: 1.5, speed: 130, life: 0.5,
        scale: 0.85, spin: 9, tint: 0xe6bd63
      });
      this.fx.burst('spark', hp[0], hp[1], 5, {
        speed: 90, life: 0.35, scale: 0.6, tint: 0xfff0c0, additive: true
      });
      if (this.tutStep === 0) this.tutAdvance(1);
      this.hudSig = ''; this.barSig = '';
      this.syncState();
      return true;
    }

    // --------------------------------------------------------- sim events
    drainEvents() {
      var e = this.st.events;
      if (!e || !e.length) return;
      for (var i = 0; i < e.length; i += 3) {
        var t = e[i], gx = e[i + 1], gy = e[i + 2];
        var px = (gx + 0.5) * CELL, py = (gy + 0.5) * CELL;
        if (t === 1) {
          this.fx.burst('spark', px, py, 7, { speed: 110, life: 0.5, scale: 0.7, tint: 0xffe07a, additive: true, rise: -40 });
          this.fx.burst('ribbon', px, py, 2, { speed: 80, life: 0.7, scale: 0.5, spin: 8, tint: 0xffd34d, gravity: 200 });
          this.sfx('coin', { volume: 0.5, rate: 1 + Math.min(0.3, this.st.collected * 0.05) });
          if (this.tutStep === 2) this.tutAdvance(3);
        } else if (t === 2) {
          this.fx.burst('steam', px, py, 6, { speed: 34, life: 0.9, scale: 0.8, scaleEnd: 1.7, gravity: -70, tint: 0xdff0ff, alpha: 0.75 });
          this.sfx('steam', { volume: 0.45 });
          kit.juice.shake(1.6, 90);
        } else if (t === 3) {
          this.fx.burst('ember', px, py, 9, { speed: 130, life: 0.6, scale: 0.85, gravity: -40, tint: 0xff9a3c, additive: true, spin: 6 });
          this.sfx('ignite', { volume: 0.6 });
          kit.juice.shake(3.6, 150);
          kit.juice.hitStop(45);
        } else if (t === 4) {
          this.fx.burst('ember', px, py, 16, { speed: 170, life: 0.8, scale: 1, gravity: 60, tint: 0xff4b3a, additive: true, spin: 8 });
          kit.juice.shake(6, 220);
          kit.juice.hitStop(70);
        } else if (t === 6) {
          this.fx.burst('ember', px, py, 5, { speed: 70, life: 0.45, scale: 0.7, gravity: -30, tint: 0xff9a3c, additive: true });
          this.sfx('burn', { volume: 0.4 });
        } else if (t === 7) {
          this.fx.burst('shard', px, py, 10, { speed: 140, life: 0.65, scale: 0.9, spin: 12, tint: 0xc07bff });
          this.fx.burst('spark', px, py, 6, { speed: 110, life: 0.4, scale: 0.6, tint: 0xe7bcff, additive: true });
          this.sfx('slay', { volume: 0.55 });
          kit.juice.shake(3, 140);
        }
      }
      e.length = 0;
    }

    // -------------------------------------------------------- outcome
    firstCellOf(mat) {
      var g = this.st.grid;
      for (var i = 0; i < S.N; i++) if (g[i] === mat) return [i % S.W, (i / S.W) | 0];
      return null;
    }

    checkOutcome() {
      if (this.over) return;
      var st = this.st;
      if (!st.dead && st.monsters === 0 && st.collected >= this.target) return this.win();
      if (st.dead) return this.fail('The chamber reached Rell', [6, 20]);
      if (!this.settled) return;
      var goldLeft = S.countMat(st.grid, S.GOLD);
      var heat = S.countMat(st.grid, S.LAVA) + S.countMat(st.grid, S.GAS);
      var pinsLeft = 0, i;
      for (i = 0; i < this.pins.length; i++) if (!this.pins[i].out) pinsLeft++;
      if (st.collected + goldLeft < this.target) return this.fail('Treasure lost to the fire', this.failHint(S.GOLD));
      if (st.monsters > 0 && heat === 0) return this.fail('Nothing left to slay the beasts', this.firstCellOf(S.MONSTER));
      if (pinsLeft === 0) return this.fail('Out of keys', null);
      if (this.checked) return;
      this.checked = true;
      if (pinsLeft > 3) return;
      var rem = [];
      for (i = 0; i < this.pins.length; i++) if (!this.pins[i].out) rem.push(this.pins[i].id);
      var an = S.analyze(S.clone(st), rem, 120, true, this.target);
      if (!an || an.best < this.target) this.fail('No key order reaches the vault', null);
    }

    failHint(mat) {
      var c = this.firstCellOf(mat);
      return c || [6, 18];
    }

    fail(reason, cell) {
      this.over = 'fail';
      this.overT = 0;
      this.failCause = reason;
      this.failCell = cell;
      this.selState = 'blocked';
      this.selT = 0;
      this.sfx('fail', { volume: 0.6 });
      kit.juice.shake(5, 240);
      this.dim.setVisible(true).setAlpha(0);
      if (cell) {
        this.causeRing.setPosition((cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL);
        this.causeRing.setVisible(true).setAlpha(0);
      } else {
        this.causeRing.setVisible(false);
      }
      this.showChip(reason, 'warn', true);
      this.hudSig = ''; this.barSig = '';
      this.syncState();
    }

    win() {
      this.over = 'win';
      this.overT = 0;
      this.selState = 'goal';
      this.selT = 0;
      var stars = 1;
      if (this.st.lost === 0) stars++;
      if (this.pulls <= this.par) stars++;
      this.stars = stars;

      var ch = LEVELS[this.level].c;
      var arr = this.blueprint ? profile.bp : profile.stars;
      var idx = this.blueprint ? this.bpIndex : this.level;
      var first = arr[idx] === 0;
      var gain = { s: 0, t: 0, b: 0 };
      var mult = this.blueprint ? 2 : 1;
      if (first) {
        gain.s = (8 + 4 * ch) * mult;
        gain.t = (6 + 3 * ch) * mult;
        gain.b = stars * (1 + ch) * mult;
      } else {
        gain.s = Math.round((8 + 4 * ch) * 0.25 * mult);
        gain.t = Math.round((6 + 3 * ch) * 0.25 * mult);
        var delta = Math.max(0, stars - arr[idx]);
        gain.b = delta * (1 + ch) * mult;
      }
      profile.mat.s += gain.s;
      profile.mat.t += gain.t;
      profile.mat.b += gain.b;
      if (stars > arr[idx]) arr[idx] = stars;
      if (!this.blueprint) {
        if (!profile.best[this.level] || this.pulls < profile.best[this.level]) profile.best[this.level] = this.pulls;
        profile.seen = Math.max(profile.seen, Math.min(NL - 1, this.level));
      }
      profile.tut = true;
      persist();
      this.pendingReward = gain;

      this.sfx('win', { volume: 0.75 });
      kit.juice.shake(3.4, 180);
      kit.juice.hitStop(110);
      if (motionOn()) { this.flash.setVisible(true).setAlpha(0.32); }
      var wellX = 6 * CELL + CELL / 2, wellY = 19 * CELL;
      this.fx.burst('ribbon', wellX, wellY, 20, { speed: 230, life: 1.4, scale: 0.8, spin: 10, gravity: 300, tint: 0xffd34d, jitter: 40 });
      this.fx.burst('spark', wellX, wellY, 18, { speed: 190, life: 0.9, scale: 0.8, tint: 0xfff3bd, additive: true });
      this.showBanner();
      if (this.tutStep >= 3 && this.tutStep < 5) this.tutAdvance(5);
      this.hudSig = ''; this.barSig = '';
      this.syncState();
    }

    advance() {
      if (this.blueprint) { this.showMap(true); return; }
      var nx = this.level + 1;
      if (nx < NL && levelOpen(nx)) { this.startLevel(nx, false); return; }
      if (nx < NL) { this.showKeep(); return; }
      this.showKeep();
    }

    // ------------------------------------------------------------- coach
    showCoach(text, life) {
      if (!profile.hints && this.tutStep >= 99) return;
      if (this.coachText === text && this.coachLife > 0.4) return;
      this.coachText = text;
      this.coachLife = life || 3.4;
      if (this.coachSig !== text) {
        this.coachSig = text;
        var t = this.textures.get('dk-coach'), c = ctxOf(t);
        c.clearRect(0, 0, DW, 44);
        var g = c.createLinearGradient(0, 0, DW, 0);
        g.addColorStop(0, 'rgba(20,26,40,0)');
        g.addColorStop(0.16, 'rgba(20,26,40,.82)');
        g.addColorStop(0.84, 'rgba(20,26,40,.82)');
        g.addColorStop(1, 'rgba(20,26,40,0)');
        c.fillStyle = g; c.fillRect(0, 6, DW, 32);
        txt(c, text, DW / 2, 22, 15, '#dbe6ff', 'center', 600);
        t.refresh();
      }
      this.coach.setVisible(true);
    }
    coachForLevel() {
      if (this.tutStep < 99) { this.tutAdvance(this.tutStep); return; }
      if (!profile.hints) return;
      var ch = LEVELS[this.level].c, slot = this.level % PER_CH;
      if (slot !== 0) return;
      var lines = [
        'Pull keys in the order that saves the treasure',
        'Water freezes lava into stone on contact',
        'Molten rock burns anything it touches',
        'Marshgas catches fire the moment lava reaches it',
        'Every hazard at once. Read the chamber first'
      ];
      this.showCoach(lines[ch], 4.4);
    }
    tutAdvance(step) {
      this.tutStep = step;
      var lines = [
        'Drag a brass key outward, or tap it',
        'Lava drains into the side pits',
        'Now free the treasure above the well',
        'Rell keeps every coin that reaches him',
        'Beasts die in lava, never near Rell',
        'Materials from each chamber rebuild your keep'
      ];
      if (step >= lines.length) { profile.tut = true; persist(); this.tutStep = 99; return; }
      this.showCoach(lines[step], 4.2);
      if (step === 1) this.tutStep = 2;
      // the closing line plays once, on the chamber that earned it
      if (step === lines.length - 1) { profile.tut = true; persist(); this.tutStep = 99; }
    }

    // -------------------------------------------------------------- chips
    showChip(text, icon, sticky) {
      this.chipText = text;
      this.chipIcon = icon;
      this.chipLife = sticky ? 1e9 : 1.0;
      var sig = text + '|' + icon;
      if (this.chipSig !== sig) {
        this.chipSig = sig;
        var t = this.textures.get('dk-chip'), c = ctxOf(t);
        c.clearRect(0, 0, 300, 34);
        c.font = '650 15px ' + FONT;
        var w = Math.min(292, c.measureText(text).width + 54);
        var x0 = (300 - w) / 2;
        c.fillStyle = 'rgba(16,22,36,.9)';
        rr(c, x0, 2, w, 30, 15); c.fill();
        c.strokeStyle = 'rgba(120,140,180,.4)'; c.lineWidth = 1; c.stroke();
        var img = this.textures.get('dk-ui').getSourceImage(), box = UI[icon] || UI.warn;
        c.drawImage(img, box[0], box[1], box[2], box[3], x0 + 8, 17 - 10, 20, 20);
        txt(c, text, x0 + 34, 17, 15, '#dbe6ff', 'left', 650);
        t.refresh();
      }
      this.chip.setVisible(true);
    }

    // ------------------------------------------------------------ banners
    showBanner() {
      this.banner = 'win';
      this.bannerT = 0;
      var g = this.pendingReward || { s: 0, t: 0, b: 0 };
      var sig = 'win|' + this.stars + '|' + g.s + '|' + g.t + '|' + g.b + '|' + this.pulls + '|' + this.par;
      if (this.bannerSig !== sig) {
        this.bannerSig = sig;
        var t = this.textures.get('dk-banner'), c = ctxOf(t);
        var W2 = 320, H2 = 300;
        c.clearRect(0, 0, W2, H2);
        var th = CH[LEVELS[this.level].c];
        c.fillStyle = 'rgba(10,14,24,.94)';
        rr(c, 10, 20, W2 - 20, H2 - 60, 20); c.fill();
        c.strokeStyle = th.accent; c.lineWidth = 2; c.stroke();
        vgrad(c, 12, 22, W2 - 24, 60, 'rgba(255,255,255,.07)', 'rgba(255,255,255,0)');
        txt(c, this.blueprint ? 'BLUEPRINT CLEARED' : 'CHAMBER CLEARED', W2 / 2, 50, 13, th.accent, 'center', 800, 1.6);
        txt(c, LEVELS[this.level].n, W2 / 2, 78, 24, PAPER, 'center', 800);
        var ui = this.textures.get('dk-ui').getSourceImage();
        for (var i = 0; i < 3; i++) {
          var b = i < this.stars ? UI.star : UI.starOff;
          c.drawImage(ui, b[0], b[1], b[2], b[3], W2 / 2 - 51 + i * 34, 100, 30, 30);
        }
        var lines = [
          ['Keys used', this.pulls + ' of ' + this.par + ' par'],
          ['Treasure', (this.target - this.st.lost) + ' saved, ' + this.st.lost + ' lost'],
          ['Rell', 'safe']
        ];
        for (i = 0; i < lines.length; i++) {
          txt(c, lines[i][0], 34, 156 + i * 22, 14, DIM, 'left', 550);
          txt(c, lines[i][1], W2 - 34, 156 + i * 22, 14, PAPER, 'right', 700);
        }
        c.fillStyle = 'rgba(255,255,255,.07)';
        rr(c, 26, 222, W2 - 52, 34, 10); c.fill();
        var mats = [['iStone', g.s], ['iTimber', g.t], ['iBrass', g.b]];
        for (i = 0; i < 3; i++) {
          var bx = 40 + i * 92, bb = UI[mats[i][0]];
          c.drawImage(ui, bb[0], bb[1], bb[2], bb[3], bx, 228, 22, 22);
          txt(c, '+' + mats[i][1], bx + 26, 239, 15, PAPER, 'left', 750);
        }
        txt(c, 'Tap to continue', W2 / 2, 274, 13, DIM, 'center', 550);
        t.refresh();
      }
      this.bannerImg.setVisible(true).setAlpha(0).setScale(0.86 / RETINA_FACTOR);
    }

    // ==================================================== board painting
    bakeBackground(ch) {
      var key = 'dk-bg-' + ch;
      if (this.textures.exists(key)) return key;
      var th = CH[ch];
      var t = canvasTex(this, key, DW, DH), c = ctxOf(t);
      c.clearRect(0, 0, DW, DH);
      vgrad(c, 0, 0, DW, DH, th.sky[1], th.sky[0]);
      var rg = c.createRadialGradient(DW / 2, 380, 60, DW / 2, 420, 520);
      rg.addColorStop(0, 'rgba(255,255,255,.06)');
      rg.addColorStop(1, 'rgba(0,0,0,.4)');
      c.fillStyle = rg; c.fillRect(0, 0, DW, DH);
      this.paintMotif(c, th);
      var bt = c.createLinearGradient(0, 610, 0, DH);
      bt.addColorStop(0, 'rgba(6,9,16,0)');
      bt.addColorStop(0.32, 'rgba(6,9,16,.62)');
      bt.addColorStop(1, 'rgba(6,9,16,.88)');
      c.fillStyle = bt; c.fillRect(0, 610, DW, DH - 610);
      t.refresh();
      return key;
    }

    setChapterArt(ch) {
      if (this.bgChapter === ch) return;
      this.bgChapter = ch;
      this.bg.setTexture('dk-bg-' + ch);
      // pooled cell sprites move to this chapter's atlas
      var key = 'dk-cells-' + ch;
      for (var i = 0; i < this.cells.length; i++) this.cells[i].setTexture(key, 'gold');
      for (i = 0; i < this.pinViews.length; i++) this.pinViews[i].bar.setTexture(key, 'pin');
    }

    paintMotif(c, th) {
      c.save();
      c.globalAlpha = 0.28;
      if (th.motif === 'arches') {
        c.strokeStyle = th.rim; c.lineWidth = 3;
        for (var i = 0; i < 4; i++) {
          var x = 46 + i * 100, y = 690;
          c.beginPath();
          c.moveTo(x - 28, y + 74);
          c.lineTo(x - 28, y);
          c.arc(x, y, 28, Math.PI, 0);
          c.lineTo(x + 28, y + 74);
          c.stroke();
          c.beginPath();
          c.arc(x, y, 14, Math.PI, 0);
          c.stroke();
        }
      } else if (th.motif === 'wheel') {
        c.strokeStyle = th.rim; c.lineWidth = 4;
        c.beginPath(); c.arc(320, 744, 70, 0, TAU); c.stroke();
        c.lineWidth = 3;
        c.beginPath(); c.arc(320, 744, 48, 0, TAU); c.stroke();
        for (i = 0; i < 12; i++) {
          var ang = i * TAU / 12;
          c.beginPath();
          c.moveTo(320 + Math.cos(ang) * 48, 744 + Math.sin(ang) * 48);
          c.lineTo(320 + Math.cos(ang) * 70, 744 + Math.sin(ang) * 70);
          c.stroke();
        }
        c.fillStyle = th.rim; c.globalAlpha = 0.14;
        c.fillRect(0, 796, DW, 48);
      } else if (th.motif === 'vents') {
        for (i = 0; i < 5; i++) {
          var vx = 30 + i * 84;
          var vg = c.createLinearGradient(vx, 812, vx, 630);
          vg.addColorStop(0, 'rgba(255,120,40,.55)');
          vg.addColorStop(1, 'rgba(255,120,40,0)');
          c.fillStyle = vg;
          c.beginPath();
          c.moveTo(vx - 6, 812); c.lineTo(vx + 6, 812); c.lineTo(vx + 22, 636); c.lineTo(vx - 22, 636);
          c.closePath(); c.fill();
        }
      } else if (th.motif === 'reeds') {
        c.strokeStyle = th.rim; c.lineWidth = 3; c.lineCap = 'round';
        for (i = 0; i < 22; i++) {
          var rx = 8 + i * 18, hgt = 56 + (i * 37 % 66);
          c.beginPath();
          c.moveTo(rx, 816);
          c.quadraticCurveTo(rx + (i % 2 ? 12 : -12), 816 - hgt * 0.6, rx + (i % 2 ? 20 : -20), 816 - hgt);
          c.stroke();
        }
      } else {
        for (i = 0; i < 3; i++) {
          var bxp = 60 + i * 130;
          c.fillStyle = i === 1 ? th.accent : th.rim;
          c.beginPath();
          c.moveTo(bxp - 24, 636); c.lineTo(bxp + 24, 636); c.lineTo(bxp + 24, 748);
          c.lineTo(bxp, 726); c.lineTo(bxp - 24, 748);
          c.closePath(); c.fill();
          c.fillStyle = 'rgba(255,255,255,.16)';
          c.fillRect(bxp - 24, 636, 48, 7);
        }
      }
      c.restore();
    }

    paintBoardStatic() {
      var t = this.textures.get('dk-board'), c = ctxOf(t);
      var th = CH[LEVELS[this.level].c];
      var TW = BW + PAD * 2, TH2 = BH + PAD * 2;
      c.clearRect(0, 0, TW, TH2);

      // frame: slate plate with a brass rim and a quiet contact shadow
      c.fillStyle = 'rgba(0,0,0,.42)';
      rr(c, 3, 6, TW - 6, TH2 - 6, 16); c.fill();
      c.fillStyle = th.board;
      rr(c, 0, 0, TW, TH2, 15); c.fill();
      c.strokeStyle = th.rim; c.lineWidth = 2;
      rr(c, 1, 1, TW - 2, TH2 - 2, 14); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1;
      rr(c, 2.5, 2.5, TW - 5, TH2 - 5, 12.5); c.stroke();

      // cell field: a calm two-value rhythm so rows and columns read at a glance
      c.save();
      rr(c, PAD - 2, PAD - 2, BW + 4, BH + 4, 8); c.clip();
      c.fillStyle = th.cell;
      c.fillRect(PAD, PAD, BW, BH);
      c.fillStyle = 'rgba(0,0,0,.10)';
      for (var y = 0; y < S.H; y++) if (y % 2) c.fillRect(PAD, PAD + y * CELL, BW, CELL);
      c.fillStyle = 'rgba(255,255,255,.045)';
      for (var x = 0; x < S.W; x++) if (x % 2 === 0) c.fillRect(PAD + x * CELL, PAD, 1, BH);
      var fg = c.createLinearGradient(0, PAD, 0, PAD + BH);
      fg.addColorStop(0, 'rgba(255,255,255,.06)');
      fg.addColorStop(0.5, 'rgba(0,0,0,0)');
      fg.addColorStop(1, 'rgba(0,0,0,.22)');
      c.fillStyle = fg; c.fillRect(PAD, PAD, BW, BH);

      // walls, carved slate blocks
      var g = this.st.grid;
      for (y = 0; y < S.H; y++) {
        for (x = 0; x < S.W; x++) {
          var v = g[y * S.W + x];
          var px = PAD + x * CELL, py = PAD + y * CELL;
          if (v === S.WALL) {
            c.fillStyle = th.wall;
            c.fillRect(px, py, CELL, CELL);
            c.fillStyle = th.wallLit;
            c.fillRect(px, py, CELL, 3);
            c.fillStyle = 'rgba(0,0,0,.30)';
            c.fillRect(px, py + CELL - 2.5, CELL, 2.5);
            c.fillStyle = 'rgba(255,255,255,.05)';
            c.fillRect(px + 2, py + 5, CELL - 4, 1);
            if (((x * 7 + y * 13) % 5) === 0) {
              c.fillStyle = 'rgba(0,0,0,.18)';
              c.fillRect(px + 4, py + 9, CELL - 9, 1.4);
            }
          } else if (v === S.CUP) {
            c.fillStyle = '#0e1422';
            c.fillRect(px, py, CELL, CELL);
            c.fillStyle = 'rgba(255,211,77,.07)';
            c.fillRect(px, py, CELL, CELL);
          }
        }
      }
      // the well mouth: brass lintel and a warm glow so the goal reads instantly
      var wx = PAD + 5 * CELL, wy = PAD + 17 * CELL, ww = 3 * CELL, wh = 4 * CELL;
      var wg = c.createLinearGradient(0, wy, 0, wy + wh);
      wg.addColorStop(0, 'rgba(255,211,77,.10)');
      wg.addColorStop(1, 'rgba(255,211,77,.02)');
      c.fillStyle = wg; c.fillRect(wx, wy, ww, wh);
      c.fillStyle = th.accent;
      c.fillRect(wx - 3, wy - 4, ww + 6, 4);
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(wx - 3, wy - 4, ww + 6, 1.4);
      c.strokeStyle = 'rgba(255,211,77,.30)'; c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(wx + 1, wy); c.lineTo(wx + 1, wy + wh);
      c.moveTo(wx + ww - 1, wy); c.lineTo(wx + ww - 1, wy + wh);
      c.stroke();
      c.strokeStyle = 'rgba(255,211,77,.13)'; c.lineWidth = 1;
      for (var sy = 1; sy < 4; sy++) {
        c.beginPath();
        c.moveTo(wx + 4, wy + sy * CELL); c.lineTo(wx + ww - 4, wy + sy * CELL);
        c.stroke();
      }
      c.fillStyle = 'rgba(255,211,77,.16)';
      c.fillRect(wx + 2, wy + wh - 6, ww - 4, 6);
      c.restore();
      t.refresh();
    }

    // ------------------------------------------------------------ layout
    handleLocal(p) {
      // board-local coordinates (the pin layer sits at the board texture origin)
      var y = PAD + (p.py + 0.5) * CELL;
      var x = p.anchor < 0 ? PAD - 24 : PAD + BW + 24;
      return [x, y];
    }

    layoutPins() {
      for (var i = 0; i < this.pinViews.length; i++) {
        var v = this.pinViews[i], p = this.pins[i];
        if (!p) { v.bar.setVisible(false); v.handle.setVisible(false); v.chev.setVisible(false); continue; }
        var hp = this.handleLocal(p);
        var x0 = PAD + p.lo * CELL, x1 = PAD + (p.hi + 1) * CELL;
        v.bar.setPosition(x0, PAD + (p.py + 0.5) * CELL);
        v.bar.setSize(x1 - x0, CELL);
        v.bar.setVisible(!p.out || p.t < 0.55);
        v.handle.setPosition(hp[0], hp[1]);
        v.handle.setVisible(true);
        v.handle.setTexture('dk-ui', p.out ? 'handleOut' : 'handle');
        v.handle.setAlpha(p.out ? 0.45 : 1);
        v.chev.setPosition(hp[0] + (p.anchor < 0 ? -16 : 16), hp[1]);
        v.chev.setFlipX(p.anchor < 0);
        v.chev.setVisible(false);
      }
    }

    // ============================================================== input
    designXY(px, py) { return [px, py]; }

    bindPointer() {
      var self = this;
      // Window level, added AFTER GGKit init, so a pointer claim survives the
      // kit's own pointerdown bookkeeping.
      window.addEventListener('pointerdown', function (e) {
        if (kit.paused) return;
        if (!kit.input.pointers.has(e.pointerId)) {
          kit.input.pointers.set(e.pointerId, {
            x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
            downAt: performance.now(), zone: 'game'
          });
        } else {
          var rec = kit.input.pointers.get(e.pointerId);
          rec.zone = 'game';
        }
        self.pointerClaims.set(e.pointerId, true);
        self.startAudio();
      }, { passive: true });
      window.addEventListener('pointerup', function (e) { self.pointerClaims.delete(e.pointerId); }, { passive: true });
      window.addEventListener('pointercancel', function (e) { self.pointerClaims.delete(e.pointerId); }, { passive: true });

      this.input.on('pointerdown', function (p) {
        if (kit.paused || self.pausedByKit) return;
        self.gestures.set(p.id, { sx: p.x, sy: p.y, pin: -1, drag: false });
        if (self.mode === 'play' && !self.over) {
          var i = self.pinAt(p.x, p.y);
          if (i >= 0) {
            var g = self.gestures.get(p.id);
            g.pin = i;
            self.sel = i;
            self.selState = 'preview';
            self.selT = 0;
            self.sfx('tap', { volume: 0.24, rate: 1.2 });
          }
        }
      });
      this.input.on('pointermove', function (p) {
        var g = self.gestures.get(p.id);
        if (!g || kit.paused || self.pausedByKit) return;
        if (g.pin < 0) return;
        var pin = self.pins[g.pin];
        if (!pin || pin.out) { g.pin = -1; return; }
        var dx = p.x - g.sx;
        if (Math.abs(dx) > 5) g.drag = true;
        if (dx * pin.anchor > 16) {
          self.pullPin(pin);
          g.pin = -1;
        }
      });
      this.input.on('pointerup', function (p) {
        var g = self.gestures.get(p.id);
        self.gestures.delete(p.id);
        if (!g || kit.paused || self.pausedByKit) return;
        if (g.pin >= 0 && !g.drag) {
          self.pullPin(self.pins[g.pin]);   // forgiving tap
          return;
        }
        if (g.pin >= 0) { self.selState = 'ready'; return; }
        if (!g.drag) self.tap(g.sx, g.sy);
      });
      this.input.on('pointercancel', function (p) {
        self.gestures.delete(p.id);
        if (self.selState === 'preview') self.selState = 'ready';
      });
    }

    pinAt(x, y) {
      var lx = x - (BX - PAD), ly = y - (BY - PAD);
      for (var i = 0; i < this.pins.length; i++) {
        var p = this.pins[i];
        if (p.out) continue;
        var h = this.handleLocal(p);
        var dx = lx - h[0], dy = ly - h[1];
        if (dx * dx + dy * dy < 30 * 30) return i;
      }
      // a generous strip over the bar itself also grabs the key
      for (i = 0; i < this.pins.length; i++) {
        p = this.pins[i];
        if (p.out) continue;
        var by = PAD + (p.py + 0.5) * CELL;
        if (Math.abs(ly - by) < 15 && lx > PAD + p.lo * CELL - 6 && lx < PAD + (p.hi + 1) * CELL + 6) return i;
      }
      return -1;
    }

    hit(x, y, r) { return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }

    tap(x, y) {
      var i;
      if (this.mode === 'play') {
        if (this.banner === 'win') { if (this.bannerT > 0.3) { this.sfx('tap', { volume: 0.4 }); this.advance(); } return; }
        if (this.hit(x, y, [332, 6, 52, 52])) { this.sfx('tap', { volume: 0.4 }); this.openSettings(); return; }
        var bar = this.barRects();
        for (i = 0; i < bar.length; i++) {
          if (this.hit(x, y, bar[i].r)) {
            this.sfx('tap', { volume: 0.4 });
            if (bar[i].id === 'undo') this.undo();
            else if (bar[i].id === 'retry') this.retry();
            else if (bar[i].id === 'map') this.showMap(this.blueprint);
            else if (bar[i].id === 'keep') this.showKeep();
            return;
          }
        }
        return;
      }
      for (i = 0; i < this.hitRects.length; i++) {
        var h = this.hitRects[i];
        if (this.hit(x, y, h.r)) { this.sfx('tap', { volume: 0.4 }); this.pageAction(h); return; }
      }
    }

    barRects() {
      var y = 696, h = 58, ids = ['undo', 'retry', 'map', 'keep'];
      var out = [];
      for (var i = 0; i < 4; i++) out.push({ id: ids[i], r: [18 + i * 90, y, 82, h] });
      return out;
    }

    openSettings() {
      kit.openSettings([function (box, row) {
        row('Coach hints', function () { return profile.hints; }, function (v) { profile.hints = v; persist(); });
      }]);
    }

    bindKeys() {
      this.keyMap = {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
        confirm: 'Enter', space: 'Space', undo: 'KeyZ', retry: 'KeyR',
        map: 'Escape', keep: 'KeyK', settings: 'KeyP', next: 'Tab'
      };
      // GGKit stays the authority on whether a key is held and on pause state.
      // This window listener only buffers the press EDGE, so a keypress shorter
      // than one frame is never dropped between polls. Registered after GGKit
      // init, mirroring the pointer claim rule.
      var self = this;
      var SWALLOW = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Tab: 1 };
      this.pressed = Object.create(null);
      window.addEventListener('keydown', function (e) {
        if (SWALLOW[e.code]) e.preventDefault();
        if (kit.paused || e.repeat) return;
        self.startAudio();
        self.pressed[e.code] = true;
      }, { passive: false });
      window.addEventListener('blur', function () { self.pressed = Object.create(null); self.keyHeld = {}; });
    }

    // True on the frame a key goes down, whether the press was seen by the
    // buffer or is still held when this frame samples GGKit.
    edge(name, codeOrDown) {
      var code = typeof codeOrDown === 'string' ? codeOrDown : null;
      var down = code ? kit.input.keyDown(code) : !!codeOrDown;
      var buffered = code ? !!this.pressed[code] : false;
      var was = !!this.keyHeld[name];
      this.keyHeld[name] = down;
      return buffered || (down && !was);
    }

    pollKeys() {
      var K = this.keyMap;
      var confirm = this.edge('confirm', K.confirm) || this.edge('space', K.space);
      var up = this.edge('up', K.up), down = this.edge('down', K.down);
      var left = this.edge('left', K.left), right = this.edge('right', K.right);
      var settings = this.edge('settings', K.settings);
      var mapK = this.edge('map', K.map), keepK = this.edge('keep', K.keep);
      var retryK = this.edge('retry', K.retry), undoK = this.edge('undo', K.undo);
      var nextK = this.edge('nextTab', K.next);
      this.pressed = Object.create(null);

      if (settings) { this.openSettings(); return; }
      if (this.mode !== 'play') {
        var moved = 0;
        if (left) moved = -1;
        else if (right) moved = 1;
        else if (up) moved = -3;
        else if (down) moved = 3;
        if (moved) { this.movePageFocus(moved); return; }
        if (confirm || nextK) { this.activatePageFocus(); return; }
        if (mapK) { if (this.mode !== 'title') this.showTitle(); return; }
        if (keepK) { this.showKeep(); return; }
        return;
      }
      if (this.banner === 'win') {
        if (confirm && this.bannerT > 0.3) this.advance();
        return;
      }
      if (retryK) { this.retry(); return; }
      if (undoK) { this.undo(); return; }
      if (mapK) { this.showMap(this.blueprint); return; }
      if (keepK) { this.showKeep(); return; }
      var live = [];
      for (var i = 0; i < this.pins.length; i++) if (!this.pins[i].out) live.push(i);
      if (!live.length) return;
      if (live.indexOf(this.sel) < 0) this.sel = live[0];
      var idx = live.indexOf(this.sel);
      if (down || nextK) {
        this.sel = live[(idx + 1) % live.length]; this.selState = 'preview'; this.selT = 0;
        this.sfx('tap', { volume: 0.2, rate: 1.3 });
      } else if (up) {
        this.sel = live[(idx + live.length - 1) % live.length]; this.selState = 'preview'; this.selT = 0;
        this.sfx('tap', { volume: 0.2, rate: 1.3 });
      } else if (left) {
        var p = this.pins[this.sel];
        if (p && p.anchor < 0) this.pullPin(p); else { this.selState = 'preview'; this.selT = 0; }
      } else if (right) {
        p = this.pins[this.sel];
        if (p && p.anchor > 0) this.pullPin(p); else { this.selState = 'preview'; this.selT = 0; }
      } else if (confirm) {
        this.pullPin(this.pins[this.sel]);
      }
    }

    // ============================================================== pages
    showTitle() {
      this.mode = 'title';
      this.teardownPlay();
      this.setChapterArt(LEVELS[clamp(profile.seen, 0, NL - 1)].c);
      this.music('vault');
      this.paintTitle();
      this.syncState();
    }
    showMap(bp) {
      this.mode = 'map';
      this.blueprint = !!bp && blueprintOpen();
      this.teardownPlay();
      if (!this.blueprint) this.mapChapter = clamp(lvChapter(profile.seen), 0, CHAPTERS - 1);
      this.setChapterArt(this.blueprint ? 4 : this.mapChapter);
      this.music('vault');
      this.paintMap();
      this.syncState();
    }
    showKeep() {
      this.mode = 'keep';
      this.teardownPlay();
      this.music('keep');
      this.paintKeep();
      this.paintKeepPage();
      this.keepImg.setVisible(true);
      this.keepLive.setVisible(true);
      this.syncState();
    }
    teardownPlay() {
      this.boardRoot.setVisible(false);
      this.hud.setVisible(false);
      this.bar.setVisible(false);
      this.coach.setVisible(false);
      this.chip.setVisible(false);
      this.bannerImg.setVisible(false);
      this.dim.setVisible(false);
      this.flash.setAlpha(0).setVisible(false);
      this.keepImg.setVisible(false);
      this.keepLive.setVisible(false);
      this.page.setVisible(true);
      this.banner = null;
      this.fx.clear();
      this.gestures.clear();
      this.focusIndex = 0;
    }

    pageCtx(opaqueFrom) {
      var t = this.textures.get('dk-page'), c = ctxOf(t);
      c.clearRect(0, 0, DW, DH);
      if (opaqueFrom != null) {
        var g = c.createLinearGradient(0, opaqueFrom - 26, 0, opaqueFrom + 40);
        g.addColorStop(0, 'rgba(10,14,24,0)');
        g.addColorStop(1, 'rgba(10,14,24,.94)');
        c.fillStyle = g; c.fillRect(0, opaqueFrom - 26, DW, 66);
        c.fillStyle = 'rgba(10,14,24,.94)';
        c.fillRect(0, opaqueFrom + 40, DW, DH - opaqueFrom - 40);
      }
      this.hitRects.length = 0;
      return { t: t, c: c };
    }
    uiImg() { return this.textures.get('dk-ui').getSourceImage(); }
    drawIcon(c, name, x, y, w, h) {
      var b = UI[name];
      if (!b) return;
      c.drawImage(this.uiImg(), b[0], b[1], b[2], b[3], x, y, w, h);
    }
    button(c, r, label, tone, enabled, icon) {
      c.fillStyle = enabled === false ? 'rgba(255,255,255,.05)' : (tone || 'rgba(255,255,255,.10)');
      rr(c, r[0], r[1], r[2], r[3], 12); c.fill();
      c.strokeStyle = enabled === false ? 'rgba(150,168,200,.18)' : 'rgba(255,255,255,.22)';
      c.lineWidth = 1.4; c.stroke();
      var tx = r[0] + r[2] / 2;
      if (icon) {
        this.drawIcon(c, icon, r[0] + 16, r[1] + r[3] / 2 - 11, 22, 22);
        tx += 10;
      }
      txt(c, label, tx, r[1] + r[3] / 2, 17, enabled === false ? 'rgba(160,178,208,.5)' : PAPER, 'center', 700);
    }

    paintTitle() {
      var p = this.pageCtx(432), c = p.c;
      var th = CH[this.bgChapter];
      // crest
      c.save();
      c.translate(DW / 2, 214);
      var mg = c.createLinearGradient(0, -72, 0, 72);
      mg.addColorStop(0, '#39456b');
      mg.addColorStop(1, '#1b2137');
      c.fillStyle = mg;
      c.beginPath(); c.arc(0, 0, 72, 0, TAU); c.fill();
      var sheen = c.createRadialGradient(-24, -32, 4, 0, 0, 76);
      sheen.addColorStop(0, 'rgba(255,246,214,.30)');
      sheen.addColorStop(1, 'rgba(255,246,214,0)');
      c.fillStyle = sheen;
      c.beginPath(); c.arc(0, 0, 72, 0, TAU); c.fill();
      c.strokeStyle = th.accent; c.lineWidth = 3.5;
      c.beginPath(); c.arc(0, 0, 71, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,246,214,.35)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, 0, 64, 0, TAU); c.stroke();
      // twelve keep marks around the rim, one per building
      for (var m = 0; m < 12; m++) {
        var ma = -Math.PI / 2 + m * TAU / 12;
        c.fillStyle = m % 3 === 0 ? th.accent : 'rgba(200,216,244,.45)';
        c.beginPath();
        c.arc(Math.cos(ma) * 57, Math.sin(ma) * 57, m % 3 === 0 ? 3 : 2, 0, TAU);
        c.fill();
      }
      c.restore();
      // the hero key, drawn large across the medallion
      c.save();
      c.translate(DW / 2 - 16, 214);
      c.rotate(-0.14);
      c.fillStyle = 'rgba(0,0,0,.4)';
      rr(c, -30, 1, 84, 15, 6); c.fill();
      var kg = c.createLinearGradient(0, -12, 0, 14);
      kg.addColorStop(0, '#fff0bc'); kg.addColorStop(0.5, '#e6bd63'); kg.addColorStop(1, '#9a721f');
      c.fillStyle = kg;
      rr(c, -6, -6, 62, 13, 5); c.fill();
      rr(c, 34, 4, 11, 17, 3.5); c.fill();
      rr(c, 50, 4, 9, 12, 3); c.fill();
      c.lineWidth = 12; c.strokeStyle = kg;
      c.beginPath(); c.arc(-18, 0, 15, 0, TAU); c.stroke();
      c.fillStyle = '#1b2137';
      c.beginPath(); c.arc(-18, 0, 6.5, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,250,225,.75)';
      rr(c, -4, -5, 56, 3, 1.5); c.fill();
      c.restore();

      txt(c, 'DOMINION', DW / 2, 330, 38, PAPER, 'center', 800, 3);
      txt(c, 'KEYS', DW / 2, 372, 38, th.accent, 'center', 800, 10);
      txt(c, 'Pull the keys. Save the hoard. Rebuild the realm.', DW / 2, 408, 14, DIM, 'center', 550);

      var cleared = totalCleared(), tier = keepTier();
      var rows = [
        { id: 'play', label: cleared ? 'Continue' : 'Begin', r: [65, 452, 260, 60], tone: 'rgba(243,188,80,.20)' },
        { id: 'map', label: 'Chambers', r: [65, 524, 260, 54], icon: 'iMap' },
        { id: 'keep', label: 'The Keep', r: [65, 588, 260, 54], icon: 'iKeep' },
        { id: 'settings', label: 'Settings', r: [65, 652, 260, 54], icon: 'gear' }
      ];
      if (blueprintOpen()) {
        rows.push({ id: 'bp', label: 'Blueprint', r: [65, 716, 260, 54], icon: 'star' });
      }
      for (var i = 0; i < rows.length; i++) {
        this.button(c, rows[i].r, rows[i].label, rows[i].tone, true, rows[i].icon);
        this.hitRects.push({ id: rows[i].id, r: rows[i].r });
      }
      var footY = blueprintOpen() ? 796 : 740;
      txt(c, cleared + ' of ' + NL + ' chambers   ·   keep tier ' + tier + ' of ' + MAX_KEEP,
        DW / 2, footY, 13, DIM, 'center', 550);
      p.t.refresh();
      this.paintFocus();
    }

    paintMap() {
      var p = this.pageCtx(140), c = p.c;
      var bp = this.blueprint;
      var th = CH[bp ? 4 : this.mapChapter];
      txt(c, bp ? 'BLUEPRINT' : 'CHAMBERS', 20, 36, 13, th.accent, 'left', 800, 2);
      var head = bp ? 'Ten tightest chambers' : CH[this.mapChapter].name, hs = 24;
      c.font = '800 24px ' + FONT;
      if (c.measureText(head).width > 286) hs = 20;
      txt(c, head, 20, 62, hs, PAPER, 'left', 800);
      this.button(c, [318, 18, 52, 52], '', null, true, 'iKeep');
      this.hitRects.push({ id: 'keep', r: [318, 18, 52, 52] });

      var i, r;
      if (!bp) {
        for (i = 0; i < CHAPTERS; i++) {
          r = [16 + i * 72, 88, 66, 40];
          var open = chapterOpen(i), on = i === this.mapChapter;
          c.fillStyle = on ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.05)';
          rr(c, r[0], r[1], r[2], r[3], 10); c.fill();
          if (on) { c.strokeStyle = CH[i].accent; c.lineWidth = 1.6; c.stroke(); }
          if (!open) this.drawIcon(c, 'lock', r[0] + r[2] / 2 - 9, r[1] + 8, 18, 18);
          else txt(c, String(i + 1), r[0] + r[2] / 2, r[1] + 20, 17, on ? PAPER : DIM, 'center', 750);
          this.hitRects.push({ id: 'ch' + i, r: r });
        }
        if (!chapterOpen(this.mapChapter)) {
          var need = CH_GATE[this.mapChapter];
          c.fillStyle = 'rgba(255,255,255,.06)';
          rr(c, 20, 150, DW - 40, 96, 14); c.fill();
          this.drawIcon(c, 'lock', DW / 2 - 11, 168, 22, 22);
          txt(c, 'Sealed', DW / 2, 208, 19, PAPER, 'center', 750);
          txt(c, 'Clear 9 chambers in ' + CH[this.mapChapter - 1].name + ' and reach keep tier ' + need,
            DW / 2, 230, 13, DIM, 'center', 550);
          txt(c, 'You are at keep tier ' + keepTier() + ' with ' + clearedIn(this.mapChapter - 1) + ' cleared',
            DW / 2, 250, 13, DIM, 'center', 550);
          this.paintMapSummary(c);
          this.paintMapFoot(c);
          p.t.refresh();
          this.paintFocus();
          return;
        }
      }

      var list = bp ? BLUEPRINT : null;
      var count = bp ? BLUEPRINT.length : PER_CH;
      for (i = 0; i < count; i++) {
        var li = bp ? list[i] : this.mapChapter * PER_CH + i;
        var col = i % 3, row = (i / 3) | 0;
        r = [16 + col * 121, 150 + row * 96, 113, 86];
        var openL = bp ? true : levelOpen(li);
        var st = bp ? profile.bp[i] : profile.stars[li];
        c.fillStyle = openL ? (st ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.07)') : 'rgba(255,255,255,.035)';
        rr(c, r[0], r[1], r[2], r[3], 12); c.fill();
        c.strokeStyle = st ? th.accent : 'rgba(160,178,208,.22)';
        c.lineWidth = st ? 1.6 : 1;
        rr(c, r[0], r[1], r[2], r[3], 12); c.stroke();
        if (!openL) {
          this.drawIcon(c, 'lock', r[0] + r[2] / 2 - 10, r[1] + 32, 20, 20);
        } else {
          txt(c, String(bp ? i + 1 : li + 1), r[0] + 10, r[1] + 20, 20, st ? PAPER : DIM, 'left', 800);
          var name = LEVELS[li].n;
          c.font = '600 11px ' + FONT;
          while (c.measureText(name).width > r[2] - 18 && name.length > 4) name = name.slice(0, -2);
          txt(c, name, r[0] + 10, r[1] + 42, 11, DIM, 'left', 600);
          for (var s = 0; s < 3; s++) {
            this.drawIcon(c, s < st ? 'star' : 'starOff', r[0] + 10 + s * 20, r[1] + 56, 18, 18);
          }
          var bestv = bp ? 0 : profile.best[li];
          if (bestv) txt(c, String(bestv), r[0] + r[2] - 10, r[1] + 66, 12, DIM, 'right', 650);
        }
        this.hitRects.push({ id: 'lv', level: li, bpIndex: bp ? i : -1, open: openL, r: r });
      }
      this.paintMapSummary(c);
      this.paintMapFoot(c);
      p.t.refresh();
      this.paintFocus();
    }

    // A quiet progress card fills the space under the grid: what this chapter
    // has given up so far, and exactly what the next one is waiting on.
    paintMapSummary(c) {
      var bp = this.blueprint;
      var y0 = bp ? 550 : 542;
      var got = 0, max, done, name, blurb;
      var i;
      if (bp) {
        for (i = 0; i < BLUEPRINT.length; i++) got += profile.bp[i];
        max = BLUEPRINT.length * 3;
        done = profile.bp.filter(function (n) { return n > 0; }).length;
        name = 'Blueprint';
        blurb = 'No undo. Par is the only path to three stars.';
      } else {
        var ch = this.mapChapter;
        for (i = ch * PER_CH; i < (ch + 1) * PER_CH; i++) got += profile.stars[i];
        max = PER_CH * 3;
        done = clearedIn(ch);
        name = CH[ch].name;
        blurb = ['Lava drains, treasure falls, beasts wait behind bars.',
          'Water freezes lava into stone the moment they meet.',
          'Everything here runs hot. Cool it or lose the hoard.',
          'Marshgas rises and catches fire on contact with lava.',
          'Every hazard at once, and the crown behind the last bar.'][ch];
      }
      c.fillStyle = 'rgba(255,255,255,.055)';
      rr(c, 16, y0, DW - 32, 176, 14); c.fill();
      c.strokeStyle = 'rgba(160,178,208,.16)'; c.lineWidth = 1; c.stroke();
      txt(c, name, 32, y0 + 26, 17, PAPER, 'left', 750);
      txt(c, blurb, 32, y0 + 48, 12.5, DIM, 'left', 550);

      // star meter
      c.fillStyle = 'rgba(160,178,208,.18)';
      rr(c, 32, y0 + 66, DW - 64, 8, 4); c.fill();
      c.fillStyle = BRASS;
      rr(c, 32, y0 + 66, Math.max(4, (DW - 64) * got / max), 8, 4); c.fill();
      this.drawIcon(c, 'star', 32, y0 + 82, 18, 18);
      txt(c, got + ' of ' + max + ' stars', 54, y0 + 91, 13, PAPER, 'left', 700);
      txt(c, done + ' of ' + (bp ? BLUEPRINT.length : PER_CH) + ' cleared', DW - 32, y0 + 91, 13, DIM, 'right', 650);

      var nx = bp ? -1 : this.mapChapter + 1;
      c.fillStyle = 'rgba(255,255,255,.05)';
      rr(c, 26, y0 + 108, DW - 52, 54, 11); c.fill();
      if (nx >= 0 && nx < CHAPTERS) {
        var openNext = chapterOpen(nx);
        this.drawIcon(c, openNext ? 'crown' : 'lock', 40, y0 + 124, openNext ? 26 : 20, openNext ? 20 : 20);
        txt(c, openNext ? CH[nx].name + ' is open' : 'To open ' + CH[nx].name,
          74, y0 + 126, 13.5, openNext ? '#8fe0a8' : PAPER, 'left', 700);
        txt(c, openNext ? 'Nine cleared here and keep tier ' + CH_GATE[nx] + ' met'
          : 'Clear ' + Math.max(0, 9 - clearedIn(this.mapChapter)) + ' more here and reach keep tier ' +
            CH_GATE[nx] + ' (now ' + keepTier() + ')',
          74, y0 + 145, 12, DIM, 'left', 550);
      } else {
        this.drawIcon(c, bp ? 'star' : 'crown', 40, y0 + 122, bp ? 22 : 26, bp ? 22 : 20);
        txt(c, bp ? 'Hardest chambers in the realm' : 'The last chapter',
          74, y0 + 126, 13.5, PAPER, 'left', 700);
        txt(c, bp ? 'Clear all ten to master the keys' : 'Clear it to earn the crown',
          74, y0 + 145, 12, DIM, 'left', 550);
      }
    }

    paintMapFoot(c) {
      var r = [16, 764, 170, 56];
      this.button(c, r, 'Title', null, true, null);
      this.hitRects.push({ id: 'title', r: r });
      var r2 = [204, 764, 170, 56];
      if (blueprintOpen()) {
        this.button(c, r2, this.blueprint ? 'Chambers' : 'Blueprint', 'rgba(243,188,80,.16)', true, 'star');
        this.hitRects.push({ id: 'togglebp', r: r2 });
      } else {
        this.button(c, r2, 'Blueprint', null, false, 'lock');
      }
    }

    paintKeep() {
      var t = this.textures.get('dk-keep'), c = ctxOf(t);
      var W2 = DW, H2 = 376;
      c.clearRect(0, 0, W2, H2);
      // three readable depth layers: sky, far ridge, then the ward floor
      vgrad(c, 0, 0, W2, 232, '#33406c', '#6b7ba6');
      vgrad(c, 0, 150, W2, 82, 'rgba(255,206,150,0)', 'rgba(255,206,150,.34)');
      var sun = c.createRadialGradient(308, 62, 6, 308, 62, 106);
      sun.addColorStop(0, 'rgba(255,236,182,.75)');
      sun.addColorStop(0.35, 'rgba(255,226,160,.35)');
      sun.addColorStop(1, 'rgba(255,226,160,0)');
      c.fillStyle = sun; c.fillRect(0, 0, W2, 232);
      c.fillStyle = 'rgba(255,248,232,.16)';
      var clouds = [[54, 46, 34], [120, 34, 22], [214, 74, 26], [286, 108, 18], [40, 104, 20]];
      for (var q = 0; q < clouds.length; q++) {
        var cl = clouds[q];
        c.beginPath();
        c.ellipse(cl[0], cl[1], cl[2], cl[2] * 0.34, 0, 0, TAU); c.fill();
        c.beginPath();
        c.ellipse(cl[0] + cl[2] * 0.5, cl[1] - cl[2] * 0.16, cl[2] * 0.6, cl[2] * 0.26, 0, 0, TAU); c.fill();
      }
      // far ridge with a distant abbey silhouette so the horizon has a story
      c.fillStyle = '#2e3d63';
      c.beginPath(); c.moveTo(0, 236); c.quadraticCurveTo(110, 162, 244, 218);
      c.quadraticCurveTo(320, 248, 390, 214); c.lineTo(390, 246); c.lineTo(0, 246); c.fill();
      c.fillStyle = '#26345a';
      c.fillRect(300, 186, 9, 30);
      c.fillRect(316, 196, 22, 20);
      c.beginPath(); c.moveTo(298, 186); c.lineTo(304.5, 172); c.lineTo(311, 186); c.fill();
      for (q = 0; q < 7; q++) {
        var tx2 = 18 + q * 27, ty2 = 224 + (q % 3) * 4;
        c.fillStyle = '#22375a';
        c.beginPath(); c.moveTo(tx2 - 7, ty2); c.lineTo(tx2, ty2 - 20 - (q % 3) * 5); c.lineTo(tx2 + 7, ty2); c.fill();
      }
      // ward floor, two grass values plus the market road
      c.fillStyle = '#3f7150';
      c.beginPath(); c.moveTo(0, 244); c.quadraticCurveTo(190, 210, 390, 252);
      c.lineTo(390, H2); c.lineTo(0, H2); c.fill();
      c.fillStyle = '#4d8259';
      c.beginPath(); c.moveTo(0, 296); c.quadraticCurveTo(200, 274, 390, 304);
      c.lineTo(390, H2); c.lineTo(0, H2); c.fill();
      c.fillStyle = 'rgba(198,168,118,.55)';
      c.beginPath();
      c.moveTo(150, 250); c.quadraticCurveTo(178, 296, 132, H2);
      c.lineTo(214, H2); c.quadraticCurveTo(212, 296, 178, 250);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.06)';
      for (q = 0; q < 26; q++) {
        c.fillRect(6 + (q * 61) % 380, 262 + (q * 37) % 100, 5, 2);
      }

      var B = profile.build;
      var self = this;
      function shadow(x, y, w) {
        c.fillStyle = 'rgba(20,30,20,.28)';
        c.beginPath(); c.ellipse(x, y, w, w * 0.22, 0, 0, TAU); c.fill();
      }
      function roof(x, y, w, h, col) {
        c.fillStyle = col;
        c.beginPath(); c.moveTo(x - w, y); c.lineTo(x, y - h); c.lineTo(x + w, y); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.12)';
        c.beginPath(); c.moveTo(x - w, y); c.lineTo(x, y - h); c.lineTo(x - w * 0.2, y); c.closePath(); c.fill();
      }
      function box(x, y, w, h, col, lit) {
        c.fillStyle = col; c.fillRect(x - w / 2, y - h, w, h);
        c.fillStyle = lit || 'rgba(255,255,255,.10)';
        c.fillRect(x - w / 2, y - h, w * 0.34, h);
      }
      function win(x, y, n, w) {
        c.fillStyle = '#ffd98a';
        for (var i = 0; i < n; i++) c.fillRect(x - (n - 1) * (w + 4) / 2 + i * (w + 4) - w / 2, y, w, w * 1.3);
      }
      function stub(x, y, w) {
        // a surveyed site: cut stone footing, corner stakes and a rope line
        c.fillStyle = 'rgba(20,30,20,.24)';
        c.beginPath(); c.ellipse(x, y + 1, w * 0.62, w * 0.16, 0, 0, TAU); c.fill();
        c.fillStyle = '#6d7182';
        c.fillRect(x - w / 2, y - 5, w, 5);
        c.fillStyle = '#868c9e';
        c.fillRect(x - w / 2, y - 5, w, 1.6);
        c.fillStyle = 'rgba(20,26,40,.35)';
        for (var q2 = 1; q2 < 3; q2++) c.fillRect(x - w / 2 + q2 * w / 3, y - 6, 1.2, 6);
        c.strokeStyle = '#c9a06a'; c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(x - w / 2 - 4, y - 15); c.lineTo(x + w / 2 + 4, y - 15);
        c.stroke();
        c.fillStyle = '#8a5f3d';
        c.fillRect(x - w / 2 - 5, y - 17, 2.2, 12);
        c.fillRect(x + w / 2 + 3, y - 17, 2.2, 12);
        c.fillStyle = '#e8dcc2';
        c.fillRect(x - 4, y - 24, 9, 7);
        c.fillStyle = '#8fa0c0';
        c.fillRect(x - 2.5, y - 22, 6, 1);
        c.fillRect(x - 2.5, y - 20, 4, 1);
      }

      // Palisade: the wall grows from posts to a crenellated rampart
      var wallT = B[0];
      if (wallT === 0) {
        for (var i = 0; i < 7; i++) stub(26 + i * 56, 352, 15);
      } else {
        var wh = 16 + wallT * 10;
        c.fillStyle = '#5c6274';
        c.fillRect(8, 352 - wh, 374, wh);
        c.fillStyle = '#727a90';
        c.fillRect(8, 352 - wh, 374, 4);
        if (wallT >= 2) for (i = 0; i < 13; i++) c.fillRect(10 + i * 29, 352 - wh - 8, 15, 8);
        if (wallT >= 3) {
          c.fillStyle = '#3f4454';
          c.fillRect(168, 352 - wh, 54, wh);
          c.fillStyle = '#7c6ab0';
          c.fillRect(172, 352 - wh + 6, 46, 6);
        }
        c.fillStyle = 'rgba(20,26,40,.25)';
        for (i = 0; i < 13; i++) c.fillRect(10 + i * 29, 352 - wh + 6, 1.5, wh - 6);
      }

      var SPOT = [
        null,
        { x: 48, y: 330, k: 'well' },
        { x: 340, y: 332, k: 'shed' },
        { x: 108, y: 306, k: 'granary' },
        { x: 182, y: 336, k: 'market' },
        { x: 276, y: 306, k: 'stables' },
        { x: 52, y: 286, k: 'smithy' },
        { x: 140, y: 274, k: 'barracks' },
        { x: 340, y: 276, k: 'tower' },
        { x: 246, y: 268, k: 'chapel' },
        { x: 96, y: 248, k: 'library' },
        { x: 190, y: 240, k: 'hall' }
      ];
      function paintBuilding(sp, T) {
        var x = sp.x, y = sp.y, i;
        shadow(x, y + 1, 16 + T * 5);
        if (sp.k === 'well') {
          box(x, y, 22 + T * 4, 12 + T * 4, '#6f7688');
          c.fillStyle = '#2b3a5a';
          c.fillRect(x - 8 - T, y - 12 - T * 4, 16 + T * 2, 5);
          if (T >= 2) { roof(x, y - 14 - T * 4, 16 + T * 2, 12, '#a86f4c'); }
          if (T >= 3) { c.fillStyle = BRASS; c.fillRect(x - 1.5, y - 32, 3, 12); }
        } else if (sp.k === 'shed') {
          box(x, y, 26 + T * 6, 14 + T * 5, '#8a5f3d');
          roof(x, y - 14 - T * 5, 16 + T * 4, 8 + T * 3, '#6b4a2f');
          if (T >= 2) { c.fillStyle = '#c08a5a'; for (i = 0; i < 3; i++) c.fillRect(x + 12 + T * 2, y - 6 - i * 5, 12, 4); }
        } else if (sp.k === 'granary') {
          box(x, y, 24 + T * 5, 20 + T * 7, '#b8935e');
          roof(x, y - 20 - T * 7, 15 + T * 3, 12 + T * 3, '#c4753c');
          if (T >= 2) win(x, y - 16 - T * 4, 1, 5);
          if (T >= 3) { c.fillStyle = '#e8c98c'; c.fillRect(x - 18, y - 4, 36, 4); }
        } else if (sp.k === 'market') {
          c.fillStyle = '#a86f4c';
          c.fillRect(x - 20 - T * 4, y - 4, 40 + T * 8, 4);
          for (i = 0; i < 2 + T; i++) {
            c.fillStyle = i % 2 ? '#ec6b62' : '#f3bc50';
            c.fillRect(x - 20 - T * 4 + i * (14 + T), y - 20 - T * 3, 12 + T, 6 + T);
          }
          if (T >= 2) { c.fillStyle = '#5db7d8'; c.fillRect(x - 6, y - 12, 12, 8); }
          if (T >= 3) { c.fillStyle = '#fff2c0'; c.fillRect(x - 24 - T * 4, y - 26 - T * 3, 48 + T * 8, 3); }
        } else if (sp.k === 'stables') {
          box(x, y, 30 + T * 6, 16 + T * 5, '#7d5a3c');
          roof(x, y - 16 - T * 5, 19 + T * 4, 9 + T * 2, '#5e4029');
          c.fillStyle = '#2b1e12';
          c.fillRect(x - 5, y - 12 - T * 2, 10, 12 + T * 2);
          if (T >= 2) { c.fillStyle = '#d8c39a'; c.fillRect(x + 12 + T * 2, y - 6, 8, 6); }
        } else if (sp.k === 'smithy') {
          box(x, y, 24 + T * 5, 18 + T * 5, '#4e5464');
          roof(x, y - 18 - T * 5, 15 + T * 3, 8 + T * 2, '#3a4050');
          c.fillStyle = '#ff8a30';
          c.fillRect(x - 5, y - 12, 10, 9);
          if (T >= 2) { c.fillStyle = '#6b7183'; c.fillRect(x + 10 + T, y - 30 - T * 4, 7, 16 + T * 4); }
          if (T >= 3) { c.fillStyle = 'rgba(255,180,110,.4)'; c.beginPath(); c.arc(x + 13 + T, y - 34 - T * 4, 8, 0, TAU); c.fill(); }
        } else if (sp.k === 'barracks') {
          box(x, y, 40 + T * 8, 18 + T * 5, '#5b6272');
          roof(x, y - 18 - T * 5, 25 + T * 5, 9 + T * 2, '#404757');
          win(x, y - 14 - T * 2, 2 + T, 5);
          if (T >= 3) { c.fillStyle = '#ec6b62'; c.fillRect(x - 24 - T * 4, y - 30 - T * 5, 5, 14); }
        } else if (sp.k === 'tower') {
          box(x, y, 20 + T * 3, 34 + T * 14, '#5f6678');
          if (T >= 2) for (i = 0; i < 3; i++) c.fillRect(x - 10 - T * 1.5 + i * (8 + T), y - 42 - T * 14, 5, 6);
          win(x, y - 30 - T * 8, 1, 5);
          if (T >= 3) { roof(x, y - 34 - T * 14, 15, 16, '#7c6ab0'); c.fillStyle = BRASS; c.fillRect(x - 1, y - 62 - T * 14, 2, 12); }
        } else if (sp.k === 'chapel') {
          box(x, y, 24 + T * 5, 20 + T * 6, '#8d94a8');
          roof(x, y - 20 - T * 6, 15 + T * 3, 14 + T * 4, '#5b6272');
          if (T >= 2) { c.fillStyle = '#5db7d8'; c.beginPath(); c.arc(x, y - 14 - T * 3, 4 + T, 0, TAU); c.fill(); }
          if (T >= 3) {
            c.fillStyle = BRASS;
            c.fillRect(x - 1.4, y - 46 - T * 6, 2.8, 14);
            c.fillRect(x - 5, y - 42 - T * 6, 10, 2.8);
          }
        } else if (sp.k === 'library') {
          box(x, y, 30 + T * 6, 22 + T * 6, '#6c7488');
          roof(x, y - 22 - T * 6, 19 + T * 4, 10 + T * 2, '#4a5163');
          win(x, y - 16 - T * 3, 2 + T, 4);
          if (T >= 3) { c.fillStyle = '#9a7cf3'; c.fillRect(x - 16 - T * 3, y - 4, 32 + T * 6, 3); }
        } else if (sp.k === 'hall') {
          box(x, y, 46 + T * 12, 26 + T * 8, '#7c8398');
          roof(x, y - 26 - T * 8, 30 + T * 7, 16 + T * 5, '#a8543c');
          win(x, y - 20 - T * 4, 3, 6);
          if (T >= 2) { c.fillStyle = BRASS; c.fillRect(x - 3, y - 14, 6, 14); }
          if (T >= 3) {
            self.drawIcon(c, 'crown', x - 17, y - 56 - T * 8, 34, 26);
            c.fillStyle = '#9a7cf3';
            c.fillRect(x - 26 - T * 5, y - 30 - T * 8, 5, 18);
            c.fillRect(x + 21 + T * 5, y - 30 - T * 8, 5, 18);
          }
        }
      }
      var FOOT = [0, 22, 26, 24, 34, 30, 24, 38, 20, 24, 30, 44];
      for (var b = 1; b < NB; b++) {
        var sp = SPOT[b], T = B[b];
        if (!sp) continue;
        if (T === 0) {
          stub(sp.x, sp.y, FOOT[b]);
          // the plan for what goes here, drawn as a faint ghost
          c.save();
          c.globalAlpha = 0.3;
          paintBuilding(sp, 1);
          c.restore();
        } else {
          paintBuilding(sp, T);
        }
      }
      t.refresh();
    }

    paintKeepPage() {
      var p = this.pageCtx(null), c = p.c;
      c.fillStyle = 'rgba(10,14,24,.94)';
      c.fillRect(0, 0, DW, 80);
      c.fillRect(0, 452, DW, DH - 452);
      var tier = keepTier();
      txt(c, 'THE KEEP', 20, 30, 13, BRASS, 'left', 800, 2);
      txt(c, 'Tier ' + tier + ' of ' + MAX_KEEP, 20, 54, 22, PAPER, 'left', 800);
      var mats = [['iStone', profile.mat.s], ['iTimber', profile.mat.t], ['iBrass', profile.mat.b]];
      for (var i = 0; i < 3; i++) {
        var bx = 154 + i * 78;
        c.fillStyle = 'rgba(255,255,255,.07)';
        rr(c, bx, 26, 72, 32, 10); c.fill();
        this.drawIcon(c, mats[i][0], bx + 6, 31, 22, 22);
        txt(c, String(mats[i][1]), bx + 32, 43, 15, PAPER, 'left', 750);
      }

      var B = profile.build;
      for (i = 0; i < NB; i++) {
        var col = i % 3, row = (i / 3) | 0;
        var r = [12 + col * 123, 462 + row * 74, 115, 66];
        var T = B[i];
        var max = T >= MAX_TIER;
        var cost = max ? null : tierCost(i, T);
        var can = !max && profile.mat.s >= cost.s && profile.mat.t >= cost.t && profile.mat.b >= cost.b;
        c.fillStyle = can ? 'rgba(243,188,80,.14)' : 'rgba(255,255,255,.055)';
        rr(c, r[0], r[1], r[2], r[3], 11); c.fill();
        c.strokeStyle = can ? 'rgba(243,188,80,.55)' : 'rgba(160,178,208,.18)';
        c.lineWidth = can ? 1.6 : 1;
        rr(c, r[0], r[1], r[2], r[3], 11); c.stroke();
        var nm = BUILD[i].n, fs = 13;
        c.font = '750 13px ' + FONT;
        if (c.measureText(nm).width > r[2] - 44) { fs = 11.5; c.font = '750 11.5px ' + FONT; }
        txt(c, nm, r[0] + 9, r[1] + 15, fs, PAPER, 'left', 750);
        for (var s = 0; s < MAX_TIER; s++) {
          c.fillStyle = s < T ? BRASS : 'rgba(160,178,208,.25)';
          rr(c, r[0] + r[2] - 32 + s * 9, r[1] + 10, 6, 10, 2); c.fill();
        }
        if (max) {
          txt(c, 'Complete', r[0] + 9, r[1] + 42, 13, '#8fe0a8', 'left', 700);
          var bl = BUILD[i].blurb;
          c.font = '550 11px ' + FONT;
          if (c.measureText(bl).width > r[2] - 18) bl = 'Fully built';
          txt(c, bl, r[0] + 9, r[1] + 56, 11, DIM, 'left', 550);
        } else {
          var costs = [['iStone', cost.s], ['iTimber', cost.t], ['iBrass', cost.b]];
          for (s = 0; s < 3; s++) {
            var cx = r[0] + 7 + s * 36;
            this.drawIcon(c, costs[s][0], cx, r[1] + 28, 16, 16);
            var have = s === 0 ? profile.mat.s : s === 1 ? profile.mat.t : profile.mat.b;
            txt(c, String(costs[s][1]), cx + 17, r[1] + 36, 12, have >= costs[s][1] ? PAPER : '#ff8f7a', 'left', 700);
          }
          txt(c, can ? 'Build tier ' + (T + 1) : 'Gather more', r[0] + 9, r[1] + 54, 12, can ? BRASS : DIM, 'left', 650);
        }
        this.hitRects.push({ id: 'build', build: i, can: can, r: r });
      }
      var r1 = [12, 764, 170, 56], r2 = [204, 764, 174, 56];
      this.button(c, r1, 'Chambers', null, true, 'iMap');
      this.hitRects.push({ id: 'map', r: r1 });
      this.button(c, r2, 'Play', 'rgba(243,188,80,.20)', true, null);
      this.hitRects.push({ id: 'play', r: r2 });
      p.t.refresh();
      this.paintFocus();
    }

    paintFocus() {
      this.focusIndex = clamp(this.focusIndex || 0, 0, Math.max(0, this.hitRects.length - 1));
    }
    movePageFocus(d) {
      if (!this.hitRects.length) return;
      var n = this.hitRects.length;
      this.focusIndex = ((this.focusIndex + d) % n + n) % n;
      this.sfx('tap', { volume: 0.2, rate: 1.25 });
    }
    activatePageFocus() {
      if (!this.hitRects.length) return;
      this.sfx('tap', { volume: 0.4 });
      this.pageAction(this.hitRects[this.focusIndex]);
    }

    pageAction(h) {
      if (h.id === 'play') { this.startLevel(nextUnsolved(), false); return; }
      if (h.id === 'map') { this.showMap(false); return; }
      if (h.id === 'keep') { this.showKeep(); return; }
      if (h.id === 'title') { this.showTitle(); return; }
      if (h.id === 'settings') { this.openSettings(); return; }
      if (h.id === 'bp') { this.showMap(true); return; }
      if (h.id === 'togglebp') { this.showMap(!this.blueprint); return; }
      if (h.id.indexOf('ch') === 0 && h.id.length <= 3) {
        this.mapChapter = +h.id.slice(2);
        this.setChapterArt(this.mapChapter);
        this.paintMap();
        return;
      }
      if (h.id === 'lv') {
        if (!h.open) { this.showChip('Chamber sealed', 'lock'); return; }
        this.startLevel(h.level, h.bpIndex >= 0);
        return;
      }
      if (h.id === 'build') { this.upgrade(h.build); return; }
    }

    upgrade(i) {
      var T = profile.build[i];
      if (T >= MAX_TIER) return;
      var cost = tierCost(i, T);
      if (profile.mat.s < cost.s || profile.mat.t < cost.t || profile.mat.b < cost.b) {
        this.sfx('tap', { volume: 0.3, rate: 0.7 });
        this.showChip('Not enough materials', 'warn');
        return;
      }
      profile.mat.s -= cost.s;
      profile.mat.t -= cost.t;
      profile.mat.b -= cost.b;
      profile.build[i] = T + 1;
      persist();
      this.sfx('build', { volume: 0.7 });
      kit.juice.shake(2.6, 150);
      this.keepFlash = 0.5;
      this.paintKeep();
      this.paintKeepPage();
      this.fx.clear();
      var openedNow = -1;
      for (var ch = 1; ch < CHAPTERS; ch++) if (chapterOpen(ch) && keepTier() - 1 < CH_GATE[ch]) openedNow = ch;
      this.showChip(openedNow >= 0 ? CH[openedNow].name + ' opens' : BUILD[i].n + ' tier ' + (T + 1),
        openedNow >= 0 ? 'crown' : 'iKeep');
      this.syncState();
    }

    // ============================================================ HUD sync
    syncHud() {
      if (this.mode !== 'play' || !this.st) return;
      var L = LEVELS[this.level];
      var sig = [this.level, this.blueprint ? 1 : 0, this.st.collected, this.target, this.pulls,
        this.par, this.st.monsters, this.st.lost, this.over || ''].join('|');
      if (sig === this.hudSig) return;
      this.hudSig = sig;
      var t = this.textures.get('dk-hud'), c = ctxOf(t);
      var th = CH[L.c];
      c.clearRect(0, 0, DW, 140);
      c.fillStyle = 'rgba(10,14,24,.55)';
      c.fillRect(0, 0, DW, 96);
      c.fillStyle = 'rgba(255,255,255,.06)';
      c.fillRect(0, 95, DW, 1);

      txt(c, (this.blueprint ? 'BLUEPRINT' : th.name.toUpperCase()) + '  ' +
        (this.blueprint ? this.bpIndex + 1 : (this.level % PER_CH) + 1) + '/' +
        (this.blueprint ? BLUEPRINT.length : PER_CH), 18, 24, 12, th.accent, 'left', 750, 1.4);
      var nm = L.n;
      c.font = '800 19px ' + FONT;
      while (c.measureText(nm).width > 250 && nm.length > 4) nm = nm.slice(0, -2);
      txt(c, nm, 18, 48, 19, PAPER, 'left', 800);

      // treasure meter: one pip per coin the chamber must deliver
      var cellsImg = this.textures.get('dk-cells-' + L.c).getSourceImage();
      var gi = FRAMES.indexOf('gold');
      var gx = (gi % A_COLS) * A_CELL, gy = ((gi / A_COLS) | 0) * A_CELL;
      for (var i = 0; i < this.target; i++) {
        var px = 18 + i * 24, py = 62;
        if (i < this.st.collected) {
          c.drawImage(cellsImg, gx, gy, CELL, CELL, px, py, 20, 20);
        } else {
          c.strokeStyle = 'rgba(255,211,77,.30)'; c.lineWidth = 1.6;
          c.beginPath(); c.arc(px + 10, py + 10, 8, 0, TAU); c.stroke();
        }
      }
      if (this.st.lost) {
        this.drawIcon(c, 'warn', 18 + this.target * 24 + 4, 62, 20, 20);
        txt(c, String(this.st.lost), 18 + this.target * 24 + 26, 73, 13, '#ff8f7a', 'left', 700);
      }
      // keys used against par, right cluster
      this.drawIcon(c, 'iKey', DW - 118, 62, 20, 20);
      txt(c, this.pulls + '/' + this.par, DW - 94, 73, 16, this.pulls > this.par ? '#ff9a7a' : PAPER, 'left', 750);
      if (this.st.monsters > 0) {
        this.drawIcon(c, 'iBeast', DW - 46, 62, 20, 20);
        txt(c, String(this.st.monsters), DW - 24, 73, 14, MON[2], 'left', 700);
      }
      this.drawIcon(c, 'gear', 344, 18, 28, 28);
      t.refresh();
    }

    syncBar() {
      if (this.mode !== 'play') return;
      var canUndo = this.history.length > 0 && !this.blueprint;
      var sig = [canUndo ? 1 : 0, this.over || '', this.blueprint ? 1 : 0].join('|');
      if (sig === this.barSig) return;
      this.barSig = sig;
      var t = this.textures.get('dk-bar'), c = ctxOf(t);
      c.clearRect(0, 0, DW, 80);
      var plate = c.createLinearGradient(0, 0, 0, 80);
      plate.addColorStop(0, 'rgba(10,14,24,.0)');
      plate.addColorStop(0.18, 'rgba(10,14,24,.72)');
      plate.addColorStop(1, 'rgba(10,14,24,.86)');
      c.fillStyle = plate; c.fillRect(0, 0, DW, 80);
      var rects = this.barRects();
      var labels = { undo: 'Undo', retry: 'Retry', map: 'Map', keep: 'Keep' };
      var icons = { undo: 'iUndo', retry: 'iRetry', map: 'iMap', keep: 'iKeep' };
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i].r, id = rects[i].id;
        var on = id !== 'undo' || canUndo;
        var hot = this.over === 'fail' && (id === 'undo' ? canUndo : id === 'retry');
        c.fillStyle = hot ? 'rgba(243,188,80,.20)' : on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)';
        rr(c, r[0], r[1] - 688, r[2], r[3], 12); c.fill();
        c.strokeStyle = hot ? 'rgba(243,188,80,.6)' : on ? 'rgba(255,255,255,.18)' : 'rgba(160,178,208,.12)';
        c.lineWidth = hot ? 1.6 : 1;
        rr(c, r[0], r[1] - 688, r[2], r[3], 12); c.stroke();
        c.save();
        c.globalAlpha = on ? 1 : 0.4;
        this.drawIcon(c, icons[id], r[0] + r[2] / 2 - 13, r[1] - 688 + 11, 26, 26);
        txt(c, labels[id], r[0] + r[2] / 2, r[1] - 688 + 47, 12, on ? DIM : 'rgba(160,178,208,.45)', 'center', 650);
        c.restore();
      }
      t.refresh();
    }

    // =========================================================== frame
    onKitPause() {
      this.pausedByKit = true;
      this.acc = 0;
      this.gestures.clear();
      this.pointerClaims.clear();
      this.keyHeld = {};
      this.pressed = Object.create(null);
    }
    onKitResume() {
      this.pausedByKit = false;
      this.acc = 0;
      this.keyHeld = {};
      this.pressed = Object.create(null);
    }

    syncState() {
      var L = this.mode === 'play' && this.st ? LEVELS[this.level] : LEVELS[clamp(profile.seen, 0, NL - 1)];
      DK_STATE.mode = this.mode;
      DK_STATE.chapter = L.c + 1;
      DK_STATE.chapterName = CH[L.c].name;
      DK_STATE.level = this.mode === 'play' ? this.level + 1 : 0;
      DK_STATE.levelName = this.mode === 'play' ? L.n : '';
      DK_STATE.blueprint = !!this.blueprint;
      DK_STATE.pulls = this.pulls;
      DK_STATE.par = this.mode === 'play' ? this.par : 0;
      DK_STATE.target = this.mode === 'play' ? this.target : 0;
      DK_STATE.collected = this.st ? this.st.collected : 0;
      DK_STATE.lost = this.st ? this.st.lost : 0;
      DK_STATE.beasts = this.st ? this.st.monsters : 0;
      DK_STATE.undos = this.undos;
      DK_STATE.stars = this.mode === 'play' ? starsFor(this.blueprint ? this.bpIndex : this.level, this.blueprint) : 0;
      DK_STATE.over = this.over || '';
      DK_STATE.settled = this.settled;
      DK_STATE.keepTier = keepTier();
      DK_STATE.materials.s = profile.mat.s;
      DK_STATE.materials.t = profile.mat.t;
      DK_STATE.materials.b = profile.mat.b;
      DK_STATE.cleared = totalCleared();
      DK_STATE.reducedMotion = !motionOn();
    }

    stepSim() {
      if (this.over) return;
      if (!this.settled) {
        var changed = S.step(this.st);
        this.drainEvents();
        if (!changed) this.settled = true;
        else {
          var h = S.hash(this.st.grid), rep = 0;
          for (var k = 0; k < 8; k++) if (this.st.hist[k] === h) rep = 1;
          this.st.hist[this.st.hi] = h;
          this.st.hi = (this.st.hi + 1) & 7;
          if (rep) this.settled = true;
        }
      }
      this.checkOutcome();
    }

    renderCells() {
      var g = this.st.grid, n = 0, cells = this.cells, cap = cells.length;
      var heroFrame = this.st.dead ? 'hero2' : (this.over === 'win' ? 'hero1' : 'hero0');
      var lavaF = 'lava' + (this.animFrame & 3);
      var waterF = 'water' + (this.animFrame % 3);
      var gasF = 'gas' + (this.animFrame % 3);
      var monF = 'mon' + (this.animFrame & 1);
      for (var y = 0; y < S.H; y++) {
        for (var x = 0; x < S.W; x++) {
          var v = g[y * S.W + x];
          if (v === S.EMPTY || v === S.WALL || v === S.CUP) continue;
          var frame = null;
          if (v === S.GOLD) frame = 'gold';
          else if (v === S.LAVA) frame = lavaF;
          else if (v === S.WATER) frame = waterF;
          else if (v === S.GAS) frame = gasF;
          else if (v === S.STONE) frame = 'stone';
          else if (v === S.MONSTER) frame = monF;
          else if (v === S.HERO) frame = heroFrame;
          else if (v === S.PIN) frame = 'pin';
          if (!frame) continue;
          if (n >= cap) break;
          var img = cells[n++];
          img.setVisible(true);
          img.setFrame(frame);
          img.setPosition(x * CELL + CELL / 2, y * CELL + CELL / 2);
        }
      }
      for (var i = n; i < cap; i++) {
        if (!cells[i].visible) break;
        cells[i].setVisible(false);
      }
      this.liveCells = n;
    }

    renderPins(dt) {
      var breathe = 1 + Math.sin(this.time0 * 3.1) * 0.035;
      for (var i = 0; i < this.pinViews.length; i++) {
        var v = this.pinViews[i], p = this.pins[i];
        if (!p) continue;
        if (p.out) p.t += dt;
        var slide = p.out ? Math.min(1, p.t / 0.22) : 0;
        var ease = 1 - Math.pow(1 - slide, 3);
        var off = ease * 96 * p.anchor;
        var fade = p.out ? Math.max(0, 1 - p.t / 0.55) : 1;
        var hp = this.handleLocal(p);
        var x0 = PAD + p.lo * CELL;
        v.bar.setVisible(fade > 0.02);
        v.bar.x = x0 + off;
        v.bar.setAlpha(fade);
        v.handle.x = hp[0] + off;
        v.handle.y = hp[1];
        v.handle.setAlpha(p.out ? fade * 0.9 : 1);
        v.handle.setScale((p.out ? 1 : (i === this.sel ? breathe : 1)) / RETINA_FACTOR);
        v.chev.setVisible(false);
      }
    }

    renderSelector(dt) {
      var p = this.pins[this.sel];
      var live = p && !p.out && !this.over;
      if (!live) {
        this.selRing.setVisible(false);
        this.selMark.setVisible(false);
        return;
      }
      this.selT += dt;
      var hp = this.handleLocal(p);
      var state = this.selState;
      if (state === 'resolve' && this.selT > 0.4) { state = this.selState = 'ready'; this.selT = 0; }
      if (state === 'preview' && this.selT > 2.2) { state = this.selState = 'ready'; this.selT = 0; }
      if (this.over) state = 'blocked';
      if (!this.settled) state = 'blocked';

      var lean = 0, scale = 1, alpha = 1, mark = 'chev', markOff = 0, tint = 0xffffff;
      if (state === 'ready') {
        scale = 1 + Math.sin(this.time0 * 3.1) * 0.045;
        alpha = 0.72 + Math.sin(this.time0 * 3.1) * 0.18;
        markOff = 16;
      } else if (state === 'preview') {
        lean = 5 * p.anchor;
        scale = 1.12;
        alpha = 1;
        markOff = 20 + Math.sin(this.time0 * 11) * 3;
      } else if (state === 'resolve') {
        var u = clamp(this.selT / 0.4, 0, 1);
        var back = 1 + 2.2 * Math.pow(1 - u, 2) * Math.sin(u * Math.PI * 1.6);
        scale = 1 + 0.28 * (1 - u);
        lean = 16 * p.anchor * (1 - u);
        alpha = 1 - u * 0.4;
        markOff = 22 * (1 - u) + 12;
        void back;
      } else if (state === 'blocked') {
        scale = 0.96;
        alpha = 0.5;
        mark = 'cross';
        markOff = 15;
        tint = 0xffb45c;
      } else if (state === 'goal') {
        scale = 1.2 + Math.sin(this.time0 * 9) * 0.12;
        alpha = 1;
        markOff = 24;
        tint = 0xffe9a8;
      }
      if (!motionOn()) { scale = state === 'preview' ? 1.1 : 1; lean = state === 'preview' ? 4 * p.anchor : 0; }

      this.selRing.setVisible(true);
      this.selRing.setPosition(hp[0] + lean, hp[1]);
      this.selRing.setScale(scale / RETINA_FACTOR);
      this.selRing.setAlpha(alpha);
      this.selRing.setTint(tint);
      this.selMark.setVisible(true);
      this.selMark.setTexture('dk-ui', mark);
      this.selMark.setPosition(hp[0] + lean + markOff * p.anchor, hp[1]);
      this.selMark.setFlipX(p.anchor < 0);
      this.selMark.setTint(tint);
      this.selMark.setAlpha(alpha);
      this.selMark.setScale((state === 'preview' ? 1.15 : 1) / RETINA_FACTOR);
    }

    update(_time, delta) {
      // never let any clock advance past the stepped sim
      if (kit.paused || this.pausedByKit) { this.acc = 0; return; }
      var frame = kit.juice.frame();
      var dt = Math.min(0.05, Math.max(0, delta / 1000));

      this.sfxBudget = {};
      this.applyForce(false);
      this.pollKeys();

      this.time0 += dt;
      this.animAcc += dt;
      if (this.animAcc >= 0.105) {
        this.animAcc -= 0.105;
        this.animFrame = (this.animFrame + 1) & 15;
      }
      this.fx.update(dt);

      if (this.coachLife > 0) {
        this.coachLife -= dt;
        var ca = this.coachLife > 0.7 ? 1 : Math.max(0, this.coachLife / 0.7);
        this.coach.setAlpha(ca * (this.mode === 'play' ? 1 : 0));
        this.coach.setVisible(this.mode === 'play' && ca > 0.01);
      } else if (this.coach.visible) {
        this.coach.setVisible(false);
      }
      if (this.chipLife > 0) {
        this.chipLife -= dt;
        var pa = this.chipLife > 0.35 ? 1 : Math.max(0, this.chipLife / 0.35);
        this.chip.setAlpha(pa);
        this.chip.setVisible(pa > 0.01 && (this.mode === 'play' || this.mode === 'keep'));
        this.chip.y = this.mode === 'play' ? 662 : 428;
      } else if (this.chip.visible) {
        this.chip.setVisible(false);
      }
      if (this.keepFlash > 0) {
        this.keepFlash -= dt;
        if (this.mode === 'keep') {
          this.keepImg.setAlpha(1);
          if (motionOn()) this.keepImg.setScale((1 + Math.max(0, this.keepFlash) * 0.012) / RETINA_FACTOR);
          else this.keepImg.setScale(1 / RETINA_FACTOR);
        }
      } else if (this.mode === 'keep') this.keepImg.setScale(1 / RETINA_FACTOR);
      if (this.mode === 'keep') this.updateKeepLive();

      if (this.mode !== 'play') {
        if (this.flash.alpha > 0) this.flash.setAlpha(0).setVisible(false);
        return;
      }

      if (!frame.frozen) {
        this.acc += dt;
        var steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS) {
          this.acc -= STEP;
          steps++;
          this.stepSim();
          if (this.over) break;
        }
        if (this.acc > 0.4) this.acc = 0;
      }

      if (this.over) {
        this.overT += dt;
        if (this.over === 'fail') {
          this.dim.setAlpha(Math.min(0.55, this.overT * 2.2));
          if (this.causeRing.visible) {
            this.causeRing.setAlpha(Math.min(1, this.overT * 3));
            var pulse = 1 + Math.sin(this.time0 * 6) * (motionOn() ? 0.22 : 0.06);
            this.causeRing.setScale(pulse / RETINA_FACTOR);
          }
        } else if (this.banner === 'win') {
          this.bannerT += dt;
          var u = clamp(this.bannerT / 0.42, 0, 1);
          var e = 1 + 2.2 * Math.pow(1 - u, 3) - 2.2 * Math.pow(1 - u, 3) * (1 - u);
          var sc = motionOn() ? 0.86 + (1 - 0.86) * (1 - Math.pow(1 - u, 3)) + Math.sin(u * Math.PI) * 0.05 : 1;
          this.bannerImg.setAlpha(Math.min(1, u * 1.4));
          this.bannerImg.setScale(sc / RETINA_FACTOR);
          void e;
        }
      }
      if (this.flash.alpha > 0.002) {
        this.flash.setVisible(true);
        this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 1.6));
      } else if (this.flash.visible) {
        this.flash.setAlpha(0).setVisible(false);
      }

      this.renderCells();
      this.renderPins(dt);
      this.renderSelector(dt);
      this.syncHud();
      this.syncBar();

      this.boardRoot.x = BX - PAD + frame.dx;
      this.boardRoot.y = BY - PAD + frame.dy;
      this.syncState();
    }
  };

  var config = {
    type: Phaser.AUTO,
    parent: document.body,
    width: DW,
    height: DH,
    backgroundColor: '#0b0f1a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 4096 },
    fps: { target: 60, min: 30 },
    scene: [DominionScene]
  };
  config.scale.width = Math.round(DW * RETINA_FACTOR);
  config.scale.height = Math.round(DH * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  var game = new Phaser.Game(config);
  game.events.once('ready', function () { scene = game.scene.getScene('dominion'); });
})();
