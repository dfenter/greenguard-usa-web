/* Parlor Pop AAA runtime. Phaser paints; GGKit owns lifecycle, input, save and audio. */
(function (root) {
  'use strict';
  var PhaserRef = root.Phaser;
  var KitRef = root.GGKit;
  var PP = root.PP || {};
  var E = PP.engine, LEVELS = PP.levels || [], ROOMS = PP.rooms || [], DAILY = PP.daily, META = PP.meta, AUDIO = PP.audio;
  var W = 390, H = 844, CELL = 43.5, HIT_CELL = 44, BOARD_X = 21, BOARD_Y = 232;
  var HIDPI_FACTOR = KitRef && KitRef.hiDpi ? KitRef.hiDpi.factor(W, H) : 1;
  var HIT_BOARD_X = (W - HIT_CELL * 8) / 2, HIT_BOARD_Y = BOARD_Y - (HIT_CELL * 8 - CELL * 8) / 2;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  var PALETTE = [0xF25C68, 0xF7C948, 0x5BCB77, 0x38A8DE, 0x9A7CF3, 0xF29A4A, 0xD86BAA];
  var PALETTE_CSS = ['#F25C68', '#F7C948', '#5BCB77', '#38A8DE', '#9A7CF3', '#F29A4A', '#D86BAA'];
  var SYMBOLS = ['seed', 'sun', 'leaf', 'drop', 'star', 'flame', 'petal'];
  var COLOR_NAMES = ['ROSE', 'SUN', 'LEAF', 'WATER', 'VIOLET', 'EMBER', 'PETAL'];
  var SYMBOL_GLYPHS = ['●', '✦', '❧', '◆', '★', '♠', '✿'];
  var FALLBACK_ROOM = { name: 'Entry Parlor', subtitle: '', accent: PALETTE[0], wall: 0x5A3E53, floor: 0x9B6A4B, grammar: '', reveal: 'A room opens.', slots: [] };
  var FALLBACK_LEVEL = { id: 'entry-01', room: 0, name: 'Open the Drapes', seed: 11031, colors: 6, moves: 30,
    goals: [{ type: 'collect', color: 0, n: 20 }], crates: 0, ivy: 0, plates: 0, dbl: 0, keys: 0, bonuses: { extra: 2, bomb: 1 } };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  function rr(ctx, x, y, w, h, r) {
    var q = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q);
    ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function setTextIfChanged(obj, value) { var s = String(value); if (obj && obj.text !== s) obj.setText(s); return obj; }
  function setColorIfChanged(obj, color) { if (obj && obj.style && obj.style.color !== color) obj.setColor(color); }
  function validObject(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  /* The probe can write force switches before Phaser has booted. Live scenes
     read the same state again, so a test harness never races scene creation. */
  var oldDebug = validObject(root.__pp) && validObject(root.__pp.state) ? root.__pp.state : {};
  var DEBUG = {
    mode: oldDebug.mode || 'title', level: oldDebug.level || 1, levelIndex: 0, moves: 0,
    goals: [], stars: 0, phase: 'boot', forceLevel: oldDebug.forceLevel == null ? null : oldDebug.forceLevel,
    forceGoal: oldDebug.forceGoal == null ? null : oldDebug.forceGoal, room: 0
  };
  function debugValue(key) {
    var host = validObject(root.__pp) && validObject(root.__pp.state) ? root.__pp.state : null;
    return host && host[key] != null ? host[key] : DEBUG[key];
  }
  function forceLevel(value) {
    DEBUG.forceLevel = value;
    if (root.__pp && root.__pp.state) root.__pp.state.forceLevel = value;
    var scene = Game.play;
    if (scene && scene.scene.isActive()) { scene.scene.restart(scene.args); return true; }
    return false;
  }
  function forceGoal(value) {
    DEBUG.forceGoal = value;
    if (root.__pp && root.__pp.state) root.__pp.state.forceGoal = value;
    var scene = Game.play;
    if (scene && scene.scene.isActive()) { scene.scene.restart(scene.args); return true; }
    return false;
  }
  root.__pp = root.__pp || {};
  root.__pp.state = DEBUG;
  root.__pp.forceLevel = forceLevel;
  root.__pp.forceGoal = forceGoal;

  function cloneLevel(src) {
    var base = src || FALLBACK_LEVEL;
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    out.goals = (base.goals || []).map(function (g) { var n = {}; for (var k2 in g) n[k2] = g[k2]; return n; });
    out.bonuses = { extra: base.bonuses && base.bonuses.extra || 0, bomb: base.bonuses && base.bonuses.bomb || 0 };
    return out;
  }
  function levelAt(index) { return LEVELS[clamp(index | 0, 0, Math.max(0, LEVELS.length - 1))] || FALLBACK_LEVEL; }
  function roomAt(index) { return ROOMS[index | 0] || FALLBACK_ROOM; }
  function parseLevelSwitch(v) {
    if (typeof v === 'string') {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === v) return i;
      if (/^\d+$/.test(v)) v = Number(v);
    }
    if (typeof v === 'number' && isFinite(v)) return clamp(Math.floor(v >= 1 ? v - 1 : v), 0, LEVELS.length - 1);
    return null;
  }
  function applyGoalSwitch(level, value) {
    if (value == null || value === '') return level;
    var out = cloneLevel(level), raw = String(value).toLowerCase(), match = raw.match(/^collect(?::|[-])?(\d)$/);
    if (raw === 'plates' || raw === 'plate') out.goals = [{ type: 'plates', n: 0 }];
    else if (raw === 'keys' || raw === 'key') out.goals = [{ type: 'keys', n: 2 }];
    else if (match) out.goals = [{ type: 'collect', color: clamp(Number(match[1]), 0, out.colors - 1), n: 24 }];
    return out;
  }
  function goalLabel(g) {
    if (g.type === 'collect') return COLOR_NAMES[clamp(g.color | 0, 0, COLOR_NAMES.length - 1)] + ' MATCH';
    if (g.type === 'plates') return 'PLATES';
    if (g.type === 'keys') return 'KEYS';
    return 'GOAL';
  }
  function goalIcon(g) { return g.type === 'collect' ? SYMBOL_GLYPHS[clamp(g.color | 0, 0, SYMBOL_GLYPHS.length - 1)] : g.type === 'plates' ? '▣' : '◆'; }
  function goalColor(g) { return g.type === 'collect' ? PALETTE_CSS[clamp(g.color | 0, 0, PALETTE_CSS.length - 1)] : g.type === 'plates' ? '#F7C948' : '#F7FBFF'; }

  var Game = { phaser: null, title: null, play: null };
  var kit = null;
  if (!PhaserRef || !KitRef || !E || !META) {
    DEBUG.phase = 'boot-error';
    return;
  }
  function validateSave(o) {
    return validObject(o) && o.version === 2 && validObject(o.stars) && validObject(o.choices) && validObject(o.boosters);
  }
  kit = KitRef.create({
    slug: 'parlor-pop', orientation: 'portrait', validateSave: validateSave,
    onPause: function () { if (Game.play && Game.play.scene.isActive()) Game.play.scene.pause(); },
    onResume: function () { if (Game.play && Game.play.scene.isPaused()) Game.play.scene.resume(); },
    onRestart: function () { if (Game.play) Game.play.scene.restart(Game.play.args); }
  });
  META.init(kit);
  AUDIO.init(kit);
  kit.registerPWA();
  if (!META.motionConfigured() && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;
  function motionEnabled() { return kit.juice.enabled !== false && META.motionEnabled() !== false; }

  function openSettings(scene) {
    var box = kit.openSettings();
    META.setMotion(kit.juice.enabled !== false);
    if (box) box.style.background = 'radial-gradient(circle at 50% 20%, #5a3e53, #182238 75%)';
    return box;
  }
  function claimPointer(pointer, zone) {
    if (!kit || !kit.input || !kit.input.pointers || !pointer) return;
    var id = pointer.id != null ? pointer.id : pointer.pointerId;
    var e = pointer.event || {};
    var x = Number.isFinite(e.clientX) ? e.clientX : pointer.x || 0, y = Number.isFinite(e.clientY) ? e.clientY : pointer.y || 0;
    kit.input.pointers.set(id, { x: x, y: y, startX: x, startY: y, downAt: Date.now(), zone: zone || null });
  }
  function makeText(scene, x, y, text, size, color, origin) {
    return scene.add.text(x, y, text, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '600', color: color || '#F7FBFF', align: 'center', lineSpacing: 3, resolution: HIDPI_FACTOR }).setOrigin(origin == null ? 0.5 : origin);
  }
  function makeButton(scene, x, y, w, h, label, callback, opts) {
    opts = opts || {};
    var c = scene.add.container(x, y), bg = scene.add.rectangle(0, 0, w, h, opts.fill == null ? 0x314567 : opts.fill, opts.alpha == null ? 1 : opts.alpha);
    bg.setStrokeStyle(opts.strokeWidth || 2, opts.stroke == null ? 0x5D7294 : opts.stroke, 0.95);
    bg.setInteractive(new PhaserRef.Geom.Rectangle(-w / 2, -h / 2, w, h), PhaserRef.Geom.Rectangle.Contains);
    var t = makeText(scene, 0, opts.sub ? -7 : 0, label, opts.size || 13, opts.color || '#F7FBFF');
    c.add([bg, t]); c.bg = bg; c.label = t; c.w = w; c.h = h; c.enabled = true;
    if (opts.sub) { var st = makeText(scene, 0, 12, opts.sub, opts.subSize || 9, opts.subColor || '#AABAD5'); c.add(st); c.sub = st; }
    bg.on('pointerdown', function (pointer) { claimPointer(pointer, 'button'); if (c.enabled && callback) { AUDIO.sfx('ui_click', { volume: 0.4 }); callback(); } });
    bg.on('pointerover', function () { if (c.enabled) c.setScale(1.025); });
    bg.on('pointerout', function () { c.setScale(1); });
    c.setDepth(opts.depth || 20);
    c.setEnabled = function (enabled) { c.enabled = !!enabled; bg.input.enabled = c.enabled; c.setAlpha(c.enabled ? 1 : 0.42); };
    c.setEnabled(opts.enabled !== false);
    return c;
  }
  function destroyList(list) { for (var i = 0; i < list.length; i++) if (list[i] && list[i].destroy) list[i].destroy(true); list.length = 0; }

  /* Scene Systems emits `prerender` immediately before the display list is
     rendered, then `render` after the camera pass. Keep display-list mutation
     in the former hook so the current frame sees the finished draw state. */
  function wireDraw(scene) {
    scene.sys.events.on('prerender', scene.draw, scene);
    if (scene.cameras && scene.cameras.main) {
      scene.cameras.main.visible = true;
      scene.cameras.main.alpha = 1;
      scene.cameras.main.setScroll(0, 0);
    }
  }
  function unwireDraw(scene) {
    if (scene && scene.sys && scene.sys.events && scene.draw) scene.sys.events.off('prerender', scene.draw, scene);
  }

  function bake(scene, key, width, height, draw) {
    var existing = scene.textures.exists(key) ? scene.textures.get(key) : null;
    var source = existing && existing.getSourceImage ? existing.getSourceImage() : null;
    var denseWidth = Math.round(width * HIDPI_FACTOR), denseHeight = Math.round(height * HIDPI_FACTOR);
    if (source && source.width === denseWidth && source.height === denseHeight) return key;
    if (existing && existing.destroy) existing.destroy();
    var baked = KitRef && KitRef.hiDpi ? KitRef.hiDpi.canvas(width, height, HIDPI_FACTOR) : null;
    var canvas = baked ? baked.canvas : document.createElement('canvas');
    if (!baked) { canvas.width = width; canvas.height = height; }
    var ctx = baked ? baked.ctx : canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, width, height); draw(ctx, width, height);
    scene.textures.addCanvas(key, canvas); return key;
  }
  function drawSymbol(ctx, symbol, cx, cy, r, fill) {
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = 2;
    if (symbol === 'seed') { ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - 1.5, cy - r * 0.8, 3, r * 0.4); }
    else if (symbol === 'sun') { ctx.beginPath(); for (var i = 0; i < 8; i++) { var a = -Math.PI / 2 + i * Math.PI / 4, q = i % 2 ? r * 0.58 : r; ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); }
    else if (symbol === 'leaf') { ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.45, r * 0.85, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy + r * 0.45); ctx.lineTo(cx + r * 0.35, cy - r * 0.45); ctx.stroke(); }
    else if (symbol === 'drop') { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.62, cy + r * 0.1); ctx.arc(cx, cy + r * 0.08, r * 0.62, 0, Math.PI); ctx.closePath(); ctx.fill(); }
    else if (symbol === 'star') { ctx.beginPath(); for (var s = 0; s < 10; s++) { var sa = -Math.PI / 2 + s * Math.PI / 5, sr = s % 2 ? r * 0.45 : r * 0.82; ctx.lineTo(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr); } ctx.closePath(); ctx.fill(); }
    else if (symbol === 'flame') { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx + r, cy - r * 0.15, cx + r * 0.3, cy + r); ctx.quadraticCurveTo(cx - r * 0.9, cy + r * 0.65, cx, cy - r); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); }
  }
  function drawTileShape(ctx, ci, x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * .42, i, a, q;
    ctx.beginPath();
    if (ci === 0) {
      ctx.moveTo(cx - r * .55, cy - r); ctx.quadraticCurveTo(cx + r * .9, cy - r * .9, cx + r * .72, cy + r * .25);
      ctx.quadraticCurveTo(cx + r * .45, cy + r, cx - r * .58, cy + r * .72); ctx.quadraticCurveTo(cx - r, cy - r * .05, cx - r * .55, cy - r);
    } else if (ci === 1) {
      for (i = 0; i < 8; i++) { a = -Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    } else if (ci === 2) {
      ctx.ellipse(cx, cy, r * .72, r, -.55, 0, Math.PI * 2);
    } else if (ci === 3) {
      ctx.moveTo(cx, cy - r); ctx.bezierCurveTo(cx + r * .9, cy - r * .05, cx + r * .72, cy + r, cx, cy + r); ctx.bezierCurveTo(cx - r * .72, cy + r, cx - r * .9, cy - r * .05, cx, cy - r);
    } else if (ci === 4) {
      for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; q = i % 2 ? r * .48 : r; ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
    } else if (ci === 5) {
      ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx + r, cy - r * .2, cx + r * .45, cy + r); ctx.quadraticCurveTo(cx - r * .8, cy + r * .72, cx, cy - r);
    } else {
      for (i = 0; i < 6; i++) { a = i * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * r * .72, cy + Math.sin(a) * r * .72); ctx.arc(cx + Math.cos(a) * r * .72, cy + Math.sin(a) * r * .72, r * .42, a + Math.PI, a + Math.PI * 2); }
    }
    ctx.closePath();
  }
  function paintRoom(scene, room, choices, x, y, w, h, depth) {
    var g = scene.add.graphics().setDepth(depth || 18), sx = w / 304, sy = h / 140;
    function X(v) { return x + v * sx; }
    function Y(v) { return y + v * sy; }
    function rect(rx, ry, rw, rh, color, alpha) { g.fillStyle(color, alpha == null ? 1 : alpha); g.fillRect(X(rx), Y(ry), rw * sx, rh * sy); }
    function line(color, width, alpha) { g.lineStyle(width * Math.min(sx, sy), color, alpha == null ? 1 : alpha); }
    var worn = choices.every(function (v) { return v < 0; });
    g.fillStyle(room.wall, 1); g.fillRoundedRect(x, y, w, h, 14 * Math.min(sx, sy));
    rect(0, 98, 304, 42, room.floor);
    rect(13, 12, 278, 74, 0x263453, .62);
    line(room.accent, 2, .9); g.strokeRoundedRect(x, y, w, h, 14 * Math.min(sx, sy));
    line(0xD7E0F0, 1, .35); g.strokeRect(X(18), Y(18), 268 * sx, 64 * sy);
    rect(26, 25, 252, 46, 0xA9D8E5, .32);
    for (var pane = 1; pane < 4; pane++) { line(room.accent, 1, .5); g.lineBetween(X(26 + pane * 63), Y(25), X(26 + pane * 63), Y(71)); }
    line(room.accent, 2, .75); g.lineBetween(X(152), Y(18), X(152), Y(82));
    if (room.id === 'entry') {
      rect(27, 18, 32, 64, room.accent, .7); rect(245, 18, 32, 64, room.accent, .7);
      rect(92, 92, 120, 18, 0x5D354A); rect(102, 86, 100, 17, choices[1] === 1 ? 0x6B7E9E : 0x81465A);
      line(0xF7FBFF, 2, .35); g.strokeRoundedRect(X(101), Y(85), 102 * sx, 20 * sy, 5 * Math.min(sx, sy));
      rect(112, 71, 80, 16, choices[0] === 1 ? 0xC58B43 : 0xA86F4C); rect(120, 60, 64, 13, choices[0] === 1 ? 0xD8B26A : 0x8B5B45);
      rect(47, 104, 8, 18, choices[2] === 1 ? 0xD7E0F0 : 0xF7C948); rect(249, 104, 8, 18, choices[2] === 1 ? 0xD7E0F0 : 0xF7C948);
      g.fillStyle(0xF7C948, .85); g.fillCircle(X(51), Y(101), 4 * Math.min(sx, sy)); g.fillCircle(X(253), Y(101), 4 * Math.min(sx, sy));
    } else if (room.id === 'dining') {
      rect(65, 89, 174, 22, choices[0] === 1 ? 0x9B6A4B : 0x4B2C26); rect(79, 109, 10, 22, 0x3B2630); rect(215, 109, 10, 22, 0x3B2630);
      rect(32, 94, 26, 30, 0x4D3551); rect(246, 94, 26, 30, 0x4D3551);
      g.fillStyle(choices[1] === 1 ? 0xF7C948 : 0x38A8DE, .9); g.fillCircle(X(112), Y(99), 7 * Math.min(sx, sy)); g.fillCircle(X(152), Y(99), 7 * Math.min(sx, sy)); g.fillCircle(X(192), Y(99), 7 * Math.min(sx, sy));
      line(choices[2] === 1 ? 0xF7FBFF : 0xF7C948, 3, .95); g.lineBetween(X(152), Y(16), X(152), Y(42)); g.lineBetween(X(126), Y(42), X(178), Y(42)); for (var lamp = 0; lamp < 5; lamp++) g.fillCircle(X(132 + lamp * 10), Y(49), 3 * Math.min(sx, sy));
    } else if (room.id === 'conservatory') {
      line(0xD7E0F0, 2, .7); for (var window = 0; window < 5; window++) g.strokeRect(X(22 + window * 52), Y(18), 44 * sx, 64 * sy);
      rect(34, 103, 40, 18, 0x8B5B45); rect(230, 103, 40, 18, 0x8B5B45);
      g.fillStyle(choices[0] === 1 ? 0xD7E0F0 : 0x5BCB77, .9); g.fillCircle(X(54), Y(99), 17 * Math.min(sx, sy)); g.fillCircle(X(250), Y(99), 17 * Math.min(sx, sy));
      line(0x5BCB77, 3, .8); g.lineBetween(X(55), Y(101), X(55), Y(71)); g.lineBetween(X(249), Y(101), X(249), Y(67));
      if (choices[1] === 1) { g.fillStyle(0x38A8DE, .9); g.fillEllipse(X(152), Y(111), 48 * sx, 12 * sy); }
      else { g.fillStyle(0x687351, 1); g.fillRect(X(132), Y(102), 40 * sx, 17 * sy); line(0xAABAD5, 2, .7); g.strokeRect(X(132), Y(102), 40 * sx, 17 * sy); }
      line(choices[2] === 1 ? 0xD7E0F0 : 0x687351, 3, .8); g.strokeTriangle(X(100), Y(30), X(204), Y(30), X(152), Y(11));
    } else {
      line(0xD7E0F0, 3, .5); g.strokeRoundedRect(X(38), Y(12), 228 * sx, 108 * sy, 24 * Math.min(sx, sy));
      rect(72, 87, 160, 8, choices[1] === 1 ? 0x38A8DE : 0xF25C68); rect(89, 95, 12, 35, 0x3B2630); rect(203, 95, 12, 35, 0x3B2630);
      for (var frame = 0; frame < 3; frame++) { line(choices[0] === 1 ? 0xD7E0F0 : 0xF7C948, 2, .95); g.strokeRect(X(59 + frame * 93), Y(34), 54 * sx, 30 * sy); g.fillStyle(frame === 1 ? room.accent : room.floor, 1); g.fillRect(X(65 + frame * 93), Y(40), 42 * sx, 18 * sy); }
      g.fillStyle(choices[2] === 1 ? 0x9A7CF3 : 0xF7C948, .9); g.fillCircle(X(152), Y(68), 13 * Math.min(sx, sy)); line(0xF7FBFF, 2, .8); g.strokeCircle(X(152), Y(68), 22 * Math.min(sx, sy));
    }
    if (worn) { rect(0, 0, 304, 140, 0x10182B, .2); line(0xAABAD5, 1, .45); g.strokeRect(X(11), Y(11), 282 * sx, 118 * sy); }
    return g;
  }
  function bakeTextures(scene) {
    bake(scene, 'pp_bg', W, H, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#263453'); g.addColorStop(0.48, '#182238'); g.addColorStop(1, '#10182B'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.11; ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 1;
      for (var x = -h; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#F25C68'; ctx.beginPath(); ctx.arc(38, 180, 90, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5BCB77'; ctx.beginPath(); ctx.arc(360, 650, 120, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    });
    bake(scene, 'pp_play_chrome', W, H, function (ctx) {
      ctx.fillStyle = 'rgba(19,29,49,.95)'; rr(ctx, 13, 223, 364, 364, 19); ctx.fill();
      ctx.strokeStyle = '#B18B5B'; ctx.lineWidth = 2; rr(ctx, 14, 224, 362, 362, 18); ctx.stroke();
      ctx.fillStyle = '#243453'; rr(ctx, 21, 231, 348, 348, 12); ctx.fill();
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#314567' : '#2C3F61'; ctx.fillRect(21 + x * CELL + 2, 232 + y * CELL + 2, CELL - 4, CELL - 4); }
      ctx.strokeStyle = '#5D7294'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
      for (var i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(21 + i * CELL, 232); ctx.lineTo(21 + i * CELL, 580); ctx.stroke(); ctx.beginPath(); ctx.moveTo(21, 232 + i * CELL); ctx.lineTo(369, 232 + i * CELL); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(24,34,56,.86)'; rr(ctx, 14, 82, 362, 86, 16); ctx.fill(); rr(ctx, 14, 612, 362, 74, 16); ctx.fill();
      ctx.fillStyle = 'rgba(24,34,56,.92)'; rr(ctx, 13, 694, 364, 105, 18); ctx.fill();
      ctx.strokeStyle = '#5D7294'; ctx.lineWidth = 1; rr(ctx, 14, 695, 362, 103, 17); ctx.stroke();
    });
    for (var ci = 0; ci < PALETTE.length; ci++) for (var sp = 0; sp < 5; sp++) {
      bake(scene, 'pp_piece_' + ci + '_' + sp, 64, 64, (function (ci, sp) { return function (ctx) {
        ctx.fillStyle = 'rgba(8,13,25,.48)'; drawTileShape(ctx, ci, 8, 10, 49, 49); ctx.fill();
        ctx.fillStyle = hex(PALETTE[ci]); drawTileShape(ctx, ci, 6, 5, 50, 50); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; drawTileShape(ctx, ci, 6, 5, 50, 50); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(ctx, 13, 10, 36, 7, 4); ctx.fill();
        if (sp === 1) { ctx.fillStyle = '#182238'; ctx.fillRect(15, 29, 32, 6); ctx.fillStyle = '#F7FBFF'; ctx.fillRect(26, 22, 12, 20); }
        else if (sp === 2) { ctx.fillStyle = '#182238'; ctx.fillRect(29, 14, 6, 32); ctx.fillStyle = '#F7FBFF'; ctx.fillRect(22, 25, 20, 10); }
        else if (sp === 3) { ctx.fillStyle = '#182238'; ctx.beginPath(); ctx.arc(31, 31, 17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#F7FBFF'; drawSymbol(ctx, 'star', 31, 31, 10, '#F7FBFF'); }
        else if (sp === 4) { ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(31, 31, 15, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#182238'; ctx.beginPath(); ctx.arc(31, 31, 5, 0, Math.PI * 2); ctx.fill(); }
        else drawSymbol(ctx, SYMBOLS[ci] || 'seed', 31, 32, 16, '#182238');
      }; })(ci, sp));
    }
    bake(scene, 'pp_plate', 64, 64, function (ctx) { ctx.strokeStyle = '#F7FBFF'; ctx.globalAlpha = .8; ctx.lineWidth = 3; rr(ctx, 6, 6, 52, 52, 12); ctx.stroke(); ctx.globalAlpha = 1; ctx.strokeStyle = '#B18B5B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(29, 30); ctx.lineTo(24, 44); ctx.moveTo(44, 16); ctx.lineTo(33, 29); ctx.lineTo(40, 47); ctx.stroke(); });
    bake(scene, 'pp_crate', 64, 64, function (ctx) { ctx.fillStyle = '#A86F4C'; rr(ctx, 8, 8, 48, 48, 8); ctx.fill(); ctx.strokeStyle = '#F2C28B'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(50, 50); ctx.moveTo(50, 14); ctx.lineTo(14, 50); ctx.stroke(); });
    bake(scene, 'pp_ivy', 64, 64, function (ctx) { ctx.fillStyle = '#245C49'; rr(ctx, 7, 7, 50, 50, 17); ctx.fill(); for (var i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#8FE0A2' : '#5BCB77'; ctx.beginPath(); ctx.arc(18 + i * 10, 25 + (i % 2) * 10, 8, 0, Math.PI * 2); ctx.fill(); } });
    bake(scene, 'pp_key', 64, 64, function (ctx) { ctx.strokeStyle = '#F7C948'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(25, 27, 10, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(34, 34); ctx.lineTo(50, 50); ctx.moveTo(43, 42); ctx.lineTo(48, 37); ctx.stroke(); });
    bake(scene, 'pp_extra', 64, 64, function (ctx) { ctx.fillStyle = '#F7C948'; ctx.beginPath(); ctx.arc(48, 13, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#182238'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+2', 48, 13); });
    bake(scene, 'pp_focus', 64, 64, function (ctx) { ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = 4; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.stroke(); });
    bake(scene, 'pp_preview', 64, 64, function (ctx) { ctx.strokeStyle = '#F7C948'; ctx.globalAlpha = .85; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); rr(ctx, 8, 8, 48, 48, 13); ctx.stroke(); ctx.globalAlpha = 1; });
    bake(scene, 'pp_preview_invalid', 64, 64, function (ctx) { ctx.strokeStyle = '#F25C68'; ctx.globalAlpha = .95; ctx.lineWidth = 4; ctx.setLineDash([4, 4]); rr(ctx, 7, 7, 50, 50, 10); ctx.stroke(); ctx.globalAlpha = .6; ctx.lineWidth = 2; for (var h = -8; h < 72; h += 12) { ctx.beginPath(); ctx.moveTo(h, 8); ctx.lineTo(h + 48, 56); ctx.stroke(); } ctx.globalAlpha = 1; });
    bake(scene, 'pp_path', 64, 64, function (ctx) { ctx.strokeStyle = '#F7C948'; ctx.globalAlpha = .38; ctx.lineWidth = 3; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(32, 2); ctx.lineTo(32, 62); ctx.stroke(); ctx.globalAlpha = 1; });
    bake(scene, 'pp_dot', 16, 16, function (ctx) { ctx.fillStyle = '#F7FBFF'; ctx.beginPath(); ctx.arc(8, 8, 7, 0, Math.PI * 2); ctx.fill(); });
    bake(scene, 'pp_ring', 96, 96, function (ctx) { ctx.strokeStyle = '#F7C948'; ctx.lineWidth = 5; ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(48, 48, 35, 0, Math.PI * 2); ctx.stroke(); });
    bake(scene, 'pp_particle_cascade', 24, 24, function (ctx) { ctx.fillStyle = '#38A8DE'; ctx.beginPath(); ctx.moveTo(12, 2); ctx.lineTo(22, 12); ctx.lineTo(12, 22); ctx.lineTo(2, 12); ctx.closePath(); ctx.fill(); });
    bake(scene, 'pp_particle_reward', 28, 28, function (ctx) { ctx.fillStyle = '#F7C948'; drawSymbol(ctx, 'star', 14, 14, 12, '#F7C948'); });
  }

  function syncDebug(scene) {
    DEBUG.mode = scene.mode || 'title'; DEBUG.levelIndex = scene.levelIndex == null ? 0 : scene.levelIndex;
    DEBUG.level = DEBUG.levelIndex + 1; DEBUG.room = scene.level ? scene.level.room : 0;
    DEBUG.moves = scene.state ? scene.state.movesLeft : 0; DEBUG.stars = scene.state && scene.state.over === 1 ? scene.state.stars() : 0;
    DEBUG.goals = scene.state ? scene.state.goalSnapshot() : [];
    DEBUG.phase = scene.phase || (scene.mode === 'title' ? 'title' : 'playing');
  }

  class BootScene extends PhaserRef.Scene {
    constructor() { super({ key: 'boot' }); }
    create() {
      this.cameras.main.setZoom(HIDPI_FACTOR);
      bakeTextures(this);
      this.add.image(W / 2, H / 2, 'pp_bg').setDepth(0).setVisible(true);
      this.add.rectangle(W / 2, 392, 300, 180, 0x182238, .9).setStrokeStyle(2, 0xF7C948, .9).setDepth(1);
      makeText(this, W / 2, 342, 'PARLOR POP', 31, '#F7FBFF').setDepth(2);
      makeText(this, W / 2, 382, 'RESTORING THE HOUSE', 11, '#F7C948').setDepth(2);
      this.bootBar = this.add.rectangle(75, 445, 2, 8, 0x5BCB77, 1).setOrigin(0, .5).setDepth(2);
      kit.loader.show('PARLOR POP'); kit.loader.progress(0.68);
      root.__pp.state.phase = 'boot';
      this.time.delayedCall(40, function () {
        this.bootBar.width = 240;
        kit.loader.progress(1); kit.loader.hide(); this.scene.start('title');
      }, [], this);
    }
  }

  class TitleScene extends PhaserRef.Scene {
    constructor() { super({ key: 'title' }); }
    create() {
      this.cameras.main.setZoom(HIDPI_FACTOR);
      Game.title = this; this.view = 'home'; this.roomPage = 0; this.panel = [];
      this.add.image(W / 2, H / 2, 'pp_bg').setDepth(0).setVisible(true);
      this.header = makeText(this, W / 2, 48, 'PARLOR POP', 31, '#F7FBFF');
      this.kicker = makeText(this, W / 2, 79, 'RESTORE THE HOUSE ONE MATCH AT A TIME', 10, '#F7C948');
      wireDraw(this);
      this.draw();
      DEBUG.mode = 'title'; DEBUG.phase = 'title'; syncDebug(this);
    }
    clearPanel() { destroyList(this.panel); this.panel = []; }
    track(obj) { this.panel.push(obj); return obj; }
    nav(label, fn) { return this.track(makeButton(this, 48, 44, 70, 32, label, fn, { size: 11, fill: 0x243453, stroke: 0x5D7294 })); }
    shutdown() { unwireDraw(this); }
    draw() {
      this.clearPanel();
      this.header.setVisible(true); this.kicker.setVisible(true);
      if (this.view === 'home') this.renderHome();
      else if (this.view === 'campaign') this.renderCampaign();
      else if (this.view === 'mastery') this.renderMastery();
      else this.renderRooms();
    }
    renderHome() {
      this.track(makeText(this, W / 2, 135, 'A forgotten Austin parlor is waiting.', 14, '#D7E0F0'));
      this.track(makeText(this, W / 2, 158, 'Swap, clear, furnish, repeat.', 13, '#AABAD5'));
      this.track(makeButton(this, W / 2, 224, 286, 62, 'CAMPAIGN', this.showCampaign.bind(this), { size: 18, fill: 0x5A3E53, stroke: 0xF25C68, sub: '4 ROOMS / 24 AUTHORED LEVELS' }));
      this.track(makeButton(this, W / 2, 300, 286, 52, 'DAILY CHALLENGE', this.startDaily.bind(this), { size: 15, fill: 0x3E4F66, stroke: 0xF7C948, sub: 'ONE FRESH SALON EACH DAY' }));
      this.track(makeButton(this, W / 2, 364, 286, 52, 'BOOSTER-FREE MASTERY', this.showMastery.bind(this), { size: 14, fill: 0x2E554B, stroke: 0x5BCB77, sub: 'MEDALS FOR COMPLETIONISTS' }));
      var total = META.totalStars(), free = META.freeStars();
      this.track(makeText(this, W / 2, 427, 'STARS BANKED  ' + total + '    FREE  ' + free, 12, '#F7C948'));
      for (var r = 0; r < ROOMS.length; r++) {
        var room = roomAt(r), done = META.roomDone(r), unlocked = META.roomUnlocked(r), x = 50 + (r % 2) * 150, y = 498 + Math.floor(r / 2) * 58;
        this.track(makeButton(this, x, y, 136, 44, (unlocked ? '' : 'LOCKED  ') + room.name.toUpperCase(), (function (r) { return function () { if (META.roomUnlocked(r)) { this.roomPage = r; this.view = 'rooms'; this.draw(); } }; }(r)).bind(this), { size: 9, fill: unlocked ? room.wall : 0x25304A, stroke: unlocked ? room.accent : 0x45516B, enabled: unlocked }));
        if (done) this.track(makeText(this, x, y + 29, 'RESTORED', 8, '#F7C948'));
      }
      this.track(makeButton(this, W / 2, 713, 120, 38, 'ATELIER', this.showRooms.bind(this), { size: 11, fill: 0x243453, stroke: 0x9A7CF3 }));
      this.track(makeButton(this, W / 2, 765, 120, 34, 'SETTINGS', function () { openSettings(this); }.bind(this), { size: 10, fill: 0x182238, stroke: 0x5D7294 }));
      this.track(makeText(this, W / 2, 813, 'NO LIVES  /  NO TIMER  /  EVERY LEVEL CLEARABLE', 9, '#8394B1'));
    }
    showCampaign() { this.view = 'campaign'; this.draw(); }
    showMastery() { this.view = 'mastery'; this.draw(); }
    showRooms() { this.view = 'rooms'; this.draw(); }
    startDaily() { AUDIO.unlock(); this.scene.start('play', { mode: 'daily' }); }
    startCampaign(i) { if (!META.levelUnlocked(i)) return; AUDIO.unlock(); this.scene.start('play', { mode: 'campaign', levelIndex: i }); }
    startMastery(i) { if (!META.levelUnlocked(i)) return; AUDIO.unlock(); this.scene.start('play', { mode: 'mastery', levelIndex: i }); }
    renderCampaign() {
      this.nav('BACK', function () { this.view = 'home'; this.draw(); }.bind(this));
      this.header.setText('CAMPAIGN'); this.header.setFontSize(26); this.kicker.setText('LEVEL-GATED ROOMS / STARS FUND FURNISHINGS');
      this.track(makeText(this, W / 2, 118, 'Complete a level to open the next one.', 12, '#D7E0F0'));
      for (var r = 0; r < ROOMS.length; r++) {
        var room = roomAt(r), unlockedRoom = META.roomUnlocked(r), y = 166 + r * 150;
        this.track(makeText(this, 28, y, room.name.toUpperCase(), 13, hex(room.accent), 0));
        this.track(makeText(this, 28, y + 19, room.grammar, 10, '#AABAD5', 0));
        for (var j = 0; j < 6; j++) {
          var index = r * 6 + j, level = levelAt(index), unlocked = unlockedRoom && META.levelUnlocked(index), stars = META.starsFor(level.id);
          var label = unlocked ? String(j + 1).padStart(2, '0') + '  ' + (stars ? '★'.repeat(stars) : '○') : 'LOCK';
          this.track(makeButton(this, 54 + (j % 3) * 104, y + 62 + Math.floor(j / 3) * 42, 92, 34, label, (function (index) { return function () { this.startCampaign(index); }; }(index)).bind(this), { size: 10, fill: unlocked ? room.wall : 0x202B43, stroke: unlocked ? room.accent : 0x45516B, enabled: unlocked }));
        }
      }
      this.track(makeText(this, W / 2, 800, 'Stars carry into room restoration.', 10, '#8394B1'));
    }
    renderMastery() {
      this.nav('BACK', function () { this.view = 'home'; this.draw(); }.bind(this));
      this.header.setText('MASTERY'); this.header.setFontSize(26); this.kicker.setText('BOOSTERS OFF / MEDALS ON');
      this.track(makeText(this, W / 2, 120, 'Replay any unlocked level with a clean toolkit.', 12, '#D7E0F0'));
      for (var i = 0; i < LEVELS.length; i++) {
        var level = levelAt(i), unlocked = META.levelUnlocked(i), stars = META.masteryFor(level.id), x = 54 + (i % 3) * 104, y = 170 + Math.floor(i / 3) * 54;
        this.track(makeButton(this, x, y, 92, 40, unlocked ? String(i + 1).padStart(2, '0') + '  ' + (stars ? '★'.repeat(stars) : 'OPEN') : 'LOCK', (function (i) { return function () { this.startMastery(i); }; }(i)).bind(this), { size: 10, fill: unlocked ? 0x2E554B : 0x202B43, stroke: unlocked ? 0x5BCB77 : 0x45516B, enabled: unlocked }));
      }
      this.track(makeText(this, W / 2, 790, 'No booster inventory is spent in this mode.', 10, '#8394B1'));
    }
    renderRooms() {
      this.nav('BACK', function () { this.view = 'home'; this.draw(); }.bind(this));
      var room = roomAt(this.roomPage), unlocked = META.roomUnlocked(this.roomPage);
      this.header.setText('ATELIER'); this.header.setFontSize(26); this.kicker.setText('RESTORE A ROOM / CHOOSE ITS CHARACTER');
      this.track(makeText(this, W / 2, 118, room.name, 21, hex(room.accent)));
      this.track(makeText(this, W / 2, 145, room.subtitle, 11, '#AABAD5'));
      this.track(makeText(this, W / 2, 176, unlocked ? 'Free stars: ' + META.freeStars() : 'Restore the previous room to unlock this one.', 12, unlocked ? '#F7C948' : '#8394B1'));
      var roomChoices = [];
      for (var roomSlot = 0; roomSlot < 3; roomSlot++) roomChoices.push(META.choiceFor(this.roomPage, roomSlot));
      this.track(paintRoom(this, room, roomChoices, 43, 210, 304, 140, 18));
      this.track(makeText(this, W / 2, 369, META.roomDone(this.roomPage) ? room.reveal : 'The scene brightens as each furnishing is placed.', 12, '#F7FBFF'));
      for (var s = 0; s < 3; s++) {
        var slot = room.slots[s], chosen = META.choiceFor(this.roomPage, s), y = 455 + s * 86;
        this.track(makeText(this, 32, y - 25, slot.name.toUpperCase() + '  /  ' + slot.cost + ' STARS', 10, '#AABAD5', 0));
        for (var v = 0; v < 2; v++) {
          var active = chosen === v, can = unlocked && (active || META.canChoose(this.roomPage, s));
          this.track(makeButton(this, 114 + v * 136, y + 4, 120, 42, slot.options[v], (function (s, v) { return function () { if (META.choose(this.roomPage, s, v)) this.draw(); }; }(s, v)).bind(this), { size: 10, fill: active ? room.accent : 0x243453, color: active ? '#182238' : '#F7FBFF', stroke: active ? 0xF7FBFF : room.accent, enabled: can }));
        }
      }
      this.track(makeButton(this, W / 2, 772, 122, 36, 'NEXT ROOM', function () { this.roomPage = (this.roomPage + 1) % ROOMS.length; this.draw(); }.bind(this), { size: 10, fill: 0x243453, stroke: 0x9A7CF3 }));
    }
  }

  class PlayScene extends PhaserRef.Scene {
    constructor() { super({ key: 'play' }); }
    create(args) {
      this.cameras.main.setZoom(HIDPI_FACTOR);
      Game.play = this; this.args = args || { mode: 'campaign' };
      this.mode = ['campaign', 'daily', 'mastery'].indexOf(this.args.mode) >= 0 ? this.args.mode : 'campaign';
      var forced = parseLevelSwitch(debugValue('forceLevel'));
      this.levelIndex = this.mode === 'daily' ? 0 : (forced == null ? clamp(this.args.levelIndex | 0, 0, LEVELS.length - 1) : forced);
      var raw = this.mode === 'daily' ? DAILY : levelAt(this.levelIndex);
      this.level = applyGoalSwitch(cloneLevel(raw), debugValue('forceGoal'));
      this.state = new E.State(this.level); this.phase = 'playing'; this.accum = 0; this.clock = 0; this.result = null; this.reveal = null;
      this.selection = null; this.cursor = { x: 0, y: 0 }; this.cursorActive = true; this.preview = null; this.previewLegal = false; this.touch = null; this.pending = []; this.armed = ''; this.invalid = 0;
      this.tutorialActive = !META.tutorialSeen() && this.mode === 'campaign' && this.levelIndex === 0; this.tutorialStage = this.tutorialActive ? 0 : 3;
      this.coach = 0; this.coachMax = 0; this.coachKind = 'coach'; this.noticeQueue = [];
      this.banner = { text: '', t: 0, max: 0.9 }; this.rings = []; this.particles = { pop: [], cascade: [], reward: [] }; this.clearPool = [];
      this.combo = 0; this.scorePulse = 0; this.resolveMusicTimer = 0;
      this.records = [];
      for (var i = 0; i < 64; i++) this.records.push({ pop: 0, invalid: 0, key: '', id: 0, motion: null, shown: false });
      for (i = 0; i < 12; i++) this.rings.push({ active: false, x: 0, y: 0, t: 0, max: .4 });
      this.add.image(W / 2, H / 2, 'pp_bg').setDepth(0).setVisible(true);
      this.add.image(W / 2, H / 2, 'pp_play_chrome').setDepth(1).setVisible(true);
      this.buildHud(); this.buildBoard(); this.buildBoosters(); this.bindInput();
      this.say(this.tutorialActive ? 'Match 3+ same-symbol tiles.' : (this.state.cells.some(function (c) { return c.b; }) ? 'Match beside a blocker.' : 'Match the goal symbol above.'));
      AUDIO.music('board'); wireDraw(this); this.draw(); syncDebug(this);
    }
    buildHud() {
      this.back = makeButton(this, 46, 45, 66, 44, 'PARLOR', function () { AUDIO.unlock(); this.scene.start('title'); }.bind(this), { size: 14, fill: 0x243453, stroke: 0x5D7294 });
      this.movesIcon = makeText(this, 322, 43, '↺', 17, '#F7C948');
      this.movesText = makeText(this, 338, 42, '', 21, '#F7C948', 0);
      this.scoreIcon = makeText(this, 177, 88, '★', 14, '#F7C948');
      this.scoreText = makeText(this, 191, 88, '', 14, '#F7C948', 0);
      this.ivyIcon = makeText(this, 255, 88, '❧', 16, '#5BCB77').setVisible(false);
      this.ivyText = makeText(this, 270, 88, '', 14, '#5BCB77', 0).setVisible(false);
      this.goalText = []; this.goalIcons = [];
      for (var i = 0; i < 3; i++) { this.goalText.push(makeText(this, 55 + i * 140, 111, '', 14, '#F7FBFF', 0)); this.goalIcons.push(makeText(this, 30 + i * 140, 111, '', 19, '#F7C948')); }
      this.coachBg = this.add.rectangle(W / 2, 190, 356, 30, 0x182238, .78).setStrokeStyle(1, 0x5D7294, .55);
      this.coachText = makeText(this, W / 2, 190, '', 14, '#D7E0F0');
      this.focus = this.add.image(0, 0, 'pp_focus').setVisible(false).setDepth(12);
      this.previewImage = this.add.image(0, 0, 'pp_preview').setVisible(false).setDepth(11);
      this.bannerBg = this.add.rectangle(W / 2, 636, 270, 45, 0x5A3E53, .98).setStrokeStyle(2, 0xF7C948, .95).setVisible(false).setDepth(30);
      this.bannerText = makeText(this, W / 2, 636, '', 20, '#F7FBFF').setDepth(31).setVisible(false);
    }
    buildBoard() {
      this.tiles = []; this.plates = []; this.obstacles = []; this.bonuses = []; this.keyPaths = [];
      for (var i = 0; i < 64; i++) {
        var path = this.add.image(0, 0, 'pp_path').setDepth(6).setVisible(false), tile = this.add.image(0, 0, 'pp_piece_0_0').setDepth(7), plate = this.add.image(0, 0, 'pp_plate').setDepth(9).setVisible(false), obstacle = this.add.image(0, 0, 'pp_crate').setDepth(10).setVisible(false), bonus = this.add.image(0, 0, 'pp_extra').setDepth(11).setVisible(false);
        this.keyPaths.push(path); this.tiles.push(tile); this.plates.push(plate); this.obstacles.push(obstacle); this.bonuses.push(bonus);
      }
      for (i = 0; i < 28; i++) this.clearPool.push({ active: false, t: 0, max: .28, x: 0, y: 0, id: 0, sprite: this.add.image(0, 0, 'pp_piece_0_0').setDepth(8).setVisible(false) });
      this.particles.pop = this.makeParticlePool('pp_dot', 96, 20);
      this.particles.cascade = this.makeParticlePool('pp_particle_cascade', 48, 21);
      this.particles.reward = this.makeParticlePool('pp_particle_reward', 36, 22);
    }
    makeParticlePool(texture, count, depth) {
      var pool = [];
      for (var i = 0; i < count; i++) pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, max: .5, color: 0xFFFFFF, scale: 1, sprite: this.add.image(0, 0, texture).setDepth(depth).setVisible(false) });
      return pool;
    }
    buildBoosters() {
      var self = this; this.boosterButtons = [];
      var defs = [{ key: 'hammer', icon: '⌕' }, { key: 'rocket', icon: '↔' }, { key: 'shuffle', icon: '⤨' }];
      for (var i = 0; i < defs.length; i++) {
        (function (def, i) {
          self.boosterButtons.push(makeButton(self, 76 + i * 119, 748, 108, 64, def.icon, function () { self.armBooster(def.key); }, { size: 25, fill: 0x243453, stroke: PALETTE[i], sub: '0', subSize: 14 }));
        }(defs[i], i));
      }
    }
    bindInput() {
      var self = this;
      this.input.on('pointerdown', function (pointer) { claimPointer(pointer, 'board'); if (self.phase !== 'playing') return; self.touch = { id: pointer.id, x: pointer.worldX, y: pointer.worldY, sx: pointer.worldX, sy: pointer.worldY }; });
      this.input.on('pointermove', function (pointer) { if (self.touch && self.touch.id === pointer.id) { self.touch.x = pointer.worldX; self.touch.y = pointer.worldY; self.preview = self.boardCell(pointer.worldX, pointer.worldY); self.previewLegal = self.isLegalPreview(self.boardCell(self.touch.sx, self.touch.sy), self.preview); } });
      this.input.on('pointerup', function (pointer) {
        if (!self.touch || self.touch.id !== pointer.id) return;
        var dx = pointer.worldX - self.touch.sx, dy = pointer.worldY - self.touch.sy, start = self.boardCell(self.touch.sx, self.touch.sy), end = self.boardCell(pointer.worldX, pointer.worldY);
        self.touch = null; self.preview = null; self.previewLegal = false;
        if (!start) return;
        self.cursor = { x: start.x, y: start.y };
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 15) { if (Math.abs(dx) > Math.abs(dy)) end = { x: start.x + (dx > 0 ? 1 : -1), y: start.y }; else end = { x: start.x, y: start.y + (dy > 0 ? 1 : -1) }; self.queue({ type: 'swap', a: start, b: end }); }
        else self.queue({ type: 'tap', cell: start });
      });
    }
    queue(action) { if (this.pending.length < 8) this.pending.push(action); }
    boardCell(x, y) { if (x < HIT_BOARD_X || y < HIT_BOARD_Y || x >= HIT_BOARD_X + HIT_CELL * 8 || y >= HIT_BOARD_Y + HIT_CELL * 8) return null; return { x: clamp(Math.floor((x - HIT_BOARD_X) / HIT_CELL), 0, 7), y: clamp(Math.floor((y - HIT_BOARD_Y) / HIT_CELL), 0, 7) }; }
    cellPos(x, y) { return { x: BOARD_X + x * CELL + CELL / 2, y: BOARD_Y + y * CELL + CELL / 2 }; }
    isLegalPreview(start, end) { return !!start && !!end && Math.abs(start.x - end.x) + Math.abs(start.y - end.y) === 1 && this.state.testSwap(start.x, start.y, end.x, end.y); }
    moveCursor(dx, dy) {
      this.cursor = { x: clamp(this.cursor.x + dx, 0, 7), y: clamp(this.cursor.y + dy, 0, 7) }; this.cursorActive = true; AUDIO.sfx('ui_click', { volume: .22 });
    }
    activateCursor() {
      var cell = { x: this.cursor.x, y: this.cursor.y };
      if (this.selection && Math.abs(this.selection.x - cell.x) + Math.abs(this.selection.y - cell.y) === 1) this.queue({ type: 'swap', a: this.selection, b: cell });
      else this.queue({ type: 'tap', cell: cell });
    }
    processGamepad() {
      var pads = root.navigator && root.navigator.getGamepads ? root.navigator.getGamepads() : [], pad = pads && pads[0], prev = this.padPrev || [], now = [], i;
      if (!pad || this.phase !== 'playing') return;
      for (i = 0; i < 16; i++) now[i] = !!(pad.buttons[i] && pad.buttons[i].pressed);
      if (now[12] && !prev[12]) this.moveCursor(0, -1);
      if (now[13] && !prev[13]) this.moveCursor(0, 1);
      if (now[14] && !prev[14]) this.moveCursor(-1, 0);
      if (now[15] && !prev[15]) this.moveCursor(1, 0);
      if (now[0] && !prev[0]) this.activateCursor();
      if (now[1] && !prev[1]) { this.selection = null; this.armed = ''; this.say('Selection cleared.'); }
      this.padPrev = now;
    }
    startNotice(item) {
      var chip = item.kind === 'chip', x = chip ? 310 : W / 2, y = chip ? 145 : 190;
      this.coach = item.max; this.coachMax = item.max; this.coachKind = item.kind; setTextIfChanged(this.coachText, item.text);
      this.coachBg.setPosition(x, y); this.coachBg.setSize(chip ? 148 : 356, chip ? 28 : 30); this.coachText.setPosition(x, y);
    }
    enqueueNotice(text, max, kind) {
      var item = { text: String(text), max: max || 1, kind: kind || 'coach' };
      if (this.coach > 0) {
        if (this.coachText.text === item.text) return;
        if (this.noticeQueue.length < 3) this.noticeQueue.push(item);
        return;
      }
      this.startNotice(item);
    }
    say(text) { this.enqueueNotice(text, 2.8); }
    notify(text) { this.enqueueNotice(text, 1, 'chip'); }
    armBooster(key) {
      if (this.mode === 'mastery') { this.say('Mastery keeps the board booster-free.'); return; }
      if (!META.boosters()[key]) { this.say('Earn this booster with a 3-star finish.'); return; }
      this.armed = this.armed === key ? '' : key; this.say(this.armed ? 'Choose a tile for ' + key.toUpperCase() + '.' : 'Booster holstered.'); AUDIO.sfx('ui_click', { volume: .5 });
    }
    processInput() {
      var keyCodes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'KeyR'];
      for (var i = 0; i < keyCodes.length; i++) {
        var code = keyCodes[i], down = kit.input.keyDown(code), prev = this.keyPrev && this.keyPrev[code];
        if (down && !prev) {
          if (code === 'Escape') { this.scene.start('title'); return; }
          if (code === 'KeyR') { kit.restart(); return; }
          if (code === 'ArrowLeft') this.moveCursor(-1, 0);
          else if (code === 'ArrowRight') this.moveCursor(1, 0);
          else if (code === 'ArrowUp') this.moveCursor(0, -1);
          else if (code === 'ArrowDown') this.moveCursor(0, 1);
          if (code === 'Digit1') this.armBooster('hammer');
          else if (code === 'Digit2') this.armBooster('rocket');
          else if (code === 'Digit3') this.armBooster('shuffle');
          else if (code === 'Enter') this.activateCursor();
        }
        if (!this.keyPrev) this.keyPrev = {};
        this.keyPrev[code] = down;
      }
      this.processGamepad();
      if (this.pending.length) {
        var action = this.pending.shift();
        if (action.type === 'tap') this.tapCell(action.cell); else this.swapCells(action.a, action.b);
      }
    }
    tapCell(cell) {
      if (!cell || !this.state.inb(cell.x, cell.y)) return;
      this.cursor = { x: cell.x, y: cell.y }; this.cursorActive = true;
      if (this.armed) { this.useArmed(cell); return; }
      if (!this.state.canSwapCell(cell.x, cell.y)) { this.flashInvalid(cell); return; }
      if (!this.selection) { this.selection = cell; this.tutorialStage = this.tutorialActive ? Math.max(this.tutorialStage, 1) : this.tutorialStage; this.say(this.tutorialActive ? 'Swap with a neighbor to make 3+.' : 'Tap or swipe a neighbor.'); AUDIO.sfx('ui_click', { volume: .4 }); return; }
      if (this.selection.x === cell.x && this.selection.y === cell.y) { this.selection = null; return; }
      if (Math.abs(this.selection.x - cell.x) + Math.abs(this.selection.y - cell.y) === 1) { this.swapCells(this.selection, cell); this.selection = null; }
      else { this.selection = cell; this.say('That tile is not a neighbor.'); }
    }
    swapCells(a, b) {
      if (!a || !b || !this.state.inb(b.x, b.y)) { this.flashInvalid(a); return; }
      if (!this.state.testSwap(a.x, a.y, b.x, b.y)) { this.flashInvalid(a); this.flashInvalid(b); AUDIO.sfx('invalid_move', { volume: .7 }); this.say('Invalid swap — use a neighbor.'); return; }
      var ev = this.state.playSwap(a.x, a.y, b.x, b.y); AUDIO.sfx('swap_tick', { volume: .65 }); this.applyEvents(ev); this.selection = null; syncDebug(this); if (this.state.over) this.finish();
    }
    useArmed(cell) {
      var key = this.armed, ok = false, ev;
      if (key === 'hammer' && (!cell || !this.state.inb(cell.x, cell.y) || this.state.at(cell.x, cell.y).key)) { this.say('Hammer needs an open tile.'); return; }
      if (key === 'shuffle') { if (META.useBooster(key, this.mode !== 'mastery')) { ev = this.state.shuffle(); ok = true; } }
      else if (META.boosters()[key] && META.useBooster(key, this.mode !== 'mastery')) { ev = key === 'hammer' ? this.state.hammer(cell.x, cell.y) : this.state.rowRocket(cell.y); ok = !!ev; if (!ok) META.refundBooster(key); }
      if (ok) { this.armed = ''; AUDIO.sfx('booster_payoff', { volume: .9 }); this.applyEvents(ev); this.notify(key === 'rocket' ? 'ROW CLEARED' : key === 'hammer' ? 'BLOCKER SMASHED' : 'BOARD FRESH'); syncDebug(this); if (this.state.over) this.finish(); }
      else this.say('That booster cannot target this cell.');
    }
    flashInvalid(cell) { if (!cell || !this.state.inb(cell.x, cell.y)) return; this.records[cell.y * 8 + cell.x].invalid = .34; this.invalid = .34; }
    applyEvents(ev) {
      if (!ev) return;
      if (ev.cleared.length && this.tutorialActive) { this.tutorialStage = 2; this.say('Match the goal symbol above.'); META.markTutorial(); this.tutorialActive = false; }
      this.combo = ev.chain || 0; this.scorePulse = ev.score || 0;
      for (var i = 0; i < ev.cleared.length; i++) { var c = ev.cleared[i], p = this.cellPos(c.x, c.y); this.clearVisual(p.x, p.y, c.c, c.sp, c.id); this.burst(p.x, p.y, PALETTE[c.c] || 0xF7FBFF, c.pickup ? 9 : 5); this.records[c.y * 8 + c.x].pop = motionEnabled() ? .24 : 0; }
      for (i = 0; i < ev.damaged.length; i++) { var d = ev.damaged[i], q = this.cellPos(d.x, d.y); this.burst(q.x, q.y, d.plate ? 0xF7C948 : d.b === E.B_IVY ? 0x5BCB77 : 0xA86F4C, 10); this.records[d.y * 8 + d.x].pop = motionEnabled() ? .2 : 0; if (d.b) AUDIO.sfx(d.b === E.B_IVY ? 'ivy_threat' : 'crate_smash', { volume: .75 }); }
      for (i = 0; i < ev.blasts.length; i++) { var b = ev.blasts[i], bp = this.cellPos(b.x, b.y); this.ring(bp.x, bp.y); }
      for (i = 0; i < ev.moved.length; i++) { var move = ev.moved[i], moveRecord = this.records[move.ty * 8 + move.tx]; moveRecord.id = move.id || moveRecord.id; moveRecord.motion = { from: this.cellPos(move.fx, move.fy), t: 0, max: motionEnabled() ? .24 : 0 }; }
      for (i = 0; i < ev.spawned.length; i++) { var spawn = ev.spawned[i], spawnRecord = this.records[spawn.y * 8 + spawn.x]; spawnRecord.id = spawn.id || spawnRecord.id; spawnRecord.motion = { from: { x: this.cellPos(spawn.x, spawn.y).x, y: BOARD_Y - CELL }, t: 0, max: motionEnabled() ? .3 : 0 }; }
      if (ev.moved.length || ev.spawned.length) { this.cascadeBurst(W / 2, BOARD_Y + CELL * 2, 0x38A8DE, Math.min(18, ev.moved.length + ev.spawned.length)); AUDIO.music('resolve'); this.resolveMusicTimer = 1.35; AUDIO.sfx('cascade', { volume: .35, rate: 1 + Math.min(.25, Math.max(0, (ev.chain || 1) - 1) * .08) }); }
      for (i = 0; i < ev.keys.length; i++) { var kp = this.cellPos(ev.keys[i].x, ev.keys[i].y); this.rewardBurst(kp.x, kp.y, 0xF7C948, 8); AUDIO.sfx('goal_clear', { volume: .75 }); }
      if (ev.bonusMoves) { this.rewardBurst(W / 2, 615, 0xF7C948, 14); this.notify('+2 MOVES'); AUDIO.sfx('goal_clear', { volume: .65 }); }
      if (ev.ivy) this.notify('IVY SPREAD');
      if (ev.chain >= 2) { this.cascadeBurst(W / 2, BOARD_Y + CELL * 4, 0x9A7CF3, 14); this.notify('COMBO x' + ev.chain); AUDIO.music('resolve'); this.resolveMusicTimer = 1.6; AUDIO.sfx('combo', { volume: .65, rate: 1 + Math.min(.25, ev.chain * .04) }); }
      if (ev.blasts.length) { AUDIO.sfx('booster_payoff', { volume: .75 }); if (motionEnabled()) kit.juice.shake(4, 100); }
      else if (ev.cleared.length) AUDIO.sfx('match_pop', { volume: .55, rate: 1 + Math.min(.2, Math.max(0, ev.chain - 1) * .06) });
      if (ev.shuffle) this.notify('SHUFFLED');
    }
    spawnParticles(pool, x, y, color, count, spread) {
      if (!motionEnabled()) return;
      var made = 0, max = Math.min(count, pool.length);
      for (var i = 0; i < pool.length && made < max; i++) if (!pool[i].active) {
        var p = pool[i], a = (i * 2.399 + this.clock * .01) % (Math.PI * 2), speed = spread || 42;
        p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * (speed + (i % 5) * 8); p.vy = Math.sin(a) * (speed + (i % 4) * 7) - speed * .55; p.t = 0; p.max = .35 + (i % 3) * .05; p.color = color; p.scale = .7 + (i % 4) * .14; made++;
      }
    }
    cascadeBurst(x, y, color, count) { this.spawnParticles(this.particles.cascade, x, y, color, count, 55); }
    rewardBurst(x, y, color, count) { this.spawnParticles(this.particles.reward, x, y, color, count, 38); }
    clearVisual(x, y, c, sp, id) {
      for (var i = 0; i < this.clearPool.length; i++) if (!this.clearPool[i].active) {
        var item = this.clearPool[i]; item.active = true; item.t = 0; item.max = motionEnabled() ? .28 : .06; item.x = x; item.y = y; item.id = id || 0; item.sprite.setTexture('pp_piece_' + clamp(c, 0, 6) + '_' + clamp(sp || 0, 0, 4)); return;
      }
    }
    burst(x, y, color, count) {
      this.spawnParticles(this.particles.pop, x, y, color, count, 42);
    }
    ring(x, y) { if (!motionEnabled()) return; for (var i = 0; i < this.rings.length; i++) if (!this.rings[i].active) { this.rings[i] = { active: true, x: x, y: y, t: 0, max: .4 }; break; } }
    banner(text) {
      if (this.phase === 'playing') { this.notify(text === 'EXTRA MOVES' ? '+2 MOVES' : text === 'BOARD SHUFFLED' ? 'SHUFFLED' : text); return; }
      this.banner.text = text; this.banner.t = 0; this.banner.max = .9; this.bannerBg.setVisible(true); this.bannerText.setVisible(true); setTextIfChanged(this.bannerText, text);
    }
    updateParticlePool(pool, dt) {
      for (var i = 0; i < pool.length; i++) if (pool[i].active) { var p = pool[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; if (p.t >= p.max) p.active = false; }
    }
    renderParticlePool(pool) {
      for (var i = 0; i < pool.length; i++) { var p = pool[i]; p.sprite.setVisible(p.active); if (p.active) { p.sprite.setPosition(p.x, p.y); p.sprite.setTint(p.color); p.sprite.setAlpha(1 - p.t / p.max); p.sprite.setScale(.45 * p.scale); } }
    }
    stepSim(dt) {
      this.clock += dt; this.processInput();
      for (var i = 0; i < this.records.length; i++) { this.records[i].pop = Math.max(0, this.records[i].pop - dt); this.records[i].invalid = Math.max(0, this.records[i].invalid - dt); }
      for (i = 0; i < this.records.length; i++) if (this.records[i].motion) { this.records[i].motion.t += dt; if (this.records[i].motion.t >= this.records[i].motion.max) this.records[i].motion = null; }
      this.updateParticlePool(this.particles.pop, dt); this.updateParticlePool(this.particles.cascade, dt); this.updateParticlePool(this.particles.reward, dt);
      for (i = 0; i < this.clearPool.length; i++) if (this.clearPool[i].active) { this.clearPool[i].t += dt; if (this.clearPool[i].t >= this.clearPool[i].max) this.clearPool[i].active = false; }
      for (i = 0; i < this.rings.length; i++) if (this.rings[i].active) { this.rings[i].t += dt; if (this.rings[i].t >= this.rings[i].max) this.rings[i].active = false; }
      this.invalid = Math.max(0, this.invalid - dt);
      if (this.coach > 0) this.coach -= dt;
      if (this.coach <= 0 && this.noticeQueue.length) this.startNotice(this.noticeQueue.shift());
      this.scorePulse = Math.max(0, this.scorePulse - dt * 240);
      if (this.resolveMusicTimer > 0) { this.resolveMusicTimer -= dt; if (this.resolveMusicTimer <= 0) AUDIO.music('board'); }
      if (this.banner.t < this.banner.max) this.banner.t += dt;
      if (this.reveal) { this.reveal.t += dt; if (this.reveal.t > 2.4) { this.reveal = null; this.scene.start('title'); } }
      syncDebug(this);
    }
    finish() {
      if (this.result || this.state.over === 0) return;
      this.phase = this.state.over === 1 ? 'result-win' : 'result-lose';
      var stars = this.state.over === 1 ? this.state.stars() : 0, gained = this.state.over === 1 ? META.record(this.mode, this.level.id, stars, this.state.score) : [];
      this.result = { win: this.state.over === 1, stars: stars, gained: gained, score: this.state.score };
      if (this.result.win) { this.banner(stars === 3 ? 'LEVEL CLEAR / 3 STARS' : 'LEVEL CLEAR'); this.rewardBurst(W / 2, 636, 0xF7C948, 24); AUDIO.sfx('goal_clear', { volume: .8 }); }
      else { this.banner('TRY AGAIN'); AUDIO.sfx('invalid_move', { volume: .8 }); }
      this.buildResult(); syncDebug(this);
    }
    buildResult() {
      var self = this, r = this.result, group = [], shade = this.add.rectangle(W / 2, 440, 330, 270, 0x111A2C, .96).setStrokeStyle(2, r.win ? 0xF7C948 : 0xF25C68, 1).setDepth(40);
      group.push(shade); group.push(makeText(this, W / 2, 338, r.win ? 'A BEAUTIFUL CLEAR' : 'THE PARLOR NEEDS ANOTHER TRY', 15, r.win ? '#F7C948' : '#F25C68'));
      group.push(makeText(this, W / 2, 375, r.win ? '★'.repeat(r.stars) + '  ' + '☆'.repeat(3 - r.stars) : 'No lives lost. The board is ready.', 24, '#F7C948'));
      group.push(makeText(this, W / 2, 414, r.win ? 'SCORE  ' + r.score + '    MOVES LEFT  ' + this.state.movesLeft : 'Instant retry keeps the rhythm moving.', 11, '#D7E0F0'));
      if (r.gained.length) group.push(makeText(this, W / 2, 448, '3-STAR BOOSTER EARNED  /  ' + r.gained[0].toUpperCase(), 10, '#5BCB77'));
      if (r.win && this.mode === 'campaign') {
        var slot = META.nextChoice(this.level.room), room = roomAt(this.level.room);
        if (slot >= 0 && META.canChoose(this.level.room, slot)) {
          group.push(makeText(this, W / 2, 480, 'RESTORE ' + room.name.toUpperCase() + '  /  CHOOSE A ' + room.slots[slot].name.toUpperCase(), 9, '#AABAD5'));
          for (var v = 0; v < 2; v++) group.push(makeButton(this, 118 + v * 145, 522, 128, 38, room.slots[slot].options[v], (function (v) { return function () { if (META.choose(self.level.room, slot, v)) self.showReveal(room); }; }(v)).bind(this), { size: 9, fill: room.wall, stroke: room.accent }));
        }
      }
      var label = r.win ? (this.mode === 'campaign' && this.levelIndex < LEVELS.length - 1 ? 'NEXT LEVEL' : 'BACK TO PARLOR') : 'RETRY LEVEL';
      group.push(makeButton(this, W / 2, 575, 152, 40, label, function () { if (!r.win) self.scene.restart(self.args); else if (self.mode === 'campaign' && self.levelIndex < LEVELS.length - 1) self.scene.start('play', { mode: 'campaign', levelIndex: self.levelIndex + 1 }); else self.scene.start('title'); }.bind(this), { size: 11, fill: r.win ? 0x5A3E53 : 0x3E4F66, stroke: r.win ? 0xF7C948 : 0xF25C68 }));
      this.resultGroup = group;
    }
    showReveal(room) {
      destroyList(this.resultGroup || []); this.resultGroup = []; this.phase = 'reveal';
      this.reveal = { t: 0, room: room };
      this.revealBg = this.add.rectangle(W / 2, H / 2, W, H, room.wall, .98).setDepth(50);
      this.revealCard = this.add.rectangle(W / 2, 400, 330, 300, room.floor, .98).setStrokeStyle(3, room.accent, 1).setDepth(51);
      this.revealTitle = makeText(this, W / 2, 288, 'ROOM RESTORED', 25, '#F7C948').setDepth(52);
      this.revealRoom = makeText(this, W / 2, 330, room.name, 20, '#F7FBFF').setDepth(52);
      this.revealCopy = makeText(this, W / 2, 530, room.reveal, 12, '#F7FBFF').setDepth(52);
      var revealChoices = [];
      for (var slotIndex = 0; slotIndex < 3; slotIndex++) revealChoices.push(META.choiceFor(this.level.room, slotIndex));
      this.revealArt = paintRoom(this, room, revealChoices, 30, 348, 330, 144, 52);
      this.banner('ROOM RESTORED'); AUDIO.music('meta'); AUDIO.sfx('room_reveal', { volume: 1 }); if (motionEnabled()) kit.juice.shake(3, 140);
    }
    draw() {
      var i, c, record, tile, pos, key, scale, alpha, keyStarts = {};
      var juiceFrame = this.juiceFrame || { dx: 0, dy: 0 };
      if (this.cameras && this.cameras.main) this.cameras.main.setScroll(-juiceFrame.dx, -juiceFrame.dy);
      for (i = 0; i < 64; i++) if (this.state.cells[i].key && keyStarts[i % 8] == null) keyStarts[i % 8] = (i / 8) | 0;
      setTextIfChanged(this.movesText, this.state.movesLeft);
      setColorIfChanged(this.movesText, this.state.movesLeft <= 5 ? '#F25C68' : '#F7C948');
      setTextIfChanged(this.scoreText, String(this.state.score));
      setColorIfChanged(this.scoreText, this.scorePulse > 0 ? '#F7FBFF' : '#F7C948');
      for (i = 0; i < 3; i++) {
        c = this.state.goals[i];
        if (c) { setTextIfChanged(this.goalIcons[i], goalIcon(c)); setColorIfChanged(this.goalIcons[i], goalColor(c)); setTextIfChanged(this.goalText[i], c.have + '/' + c.need); setColorIfChanged(this.goalText[i], c.have >= c.need ? '#5BCB77' : '#F7FBFF'); }
        else { this.goalIcons[i].setText(''); this.goalText[i].setText(''); }
      }
      this.focus.setVisible(!!this.cursorActive); if (this.cursorActive) { pos = this.cellPos(this.cursor.x, this.cursor.y); this.focus.setPosition(pos.x, pos.y); this.focus.setTint(this.selection ? 0xF7C948 : 0xF7FBFF); this.focus.setScale(motionEnabled() ? 0.68 + Math.sin(this.clock * 5) * .03 : .68); }
      this.previewImage.setVisible(!!this.preview); if (this.preview) { pos = this.cellPos(this.preview.x, this.preview.y); this.previewImage.setTexture(this.previewLegal ? 'pp_preview' : 'pp_preview_invalid'); this.previewImage.setPosition(pos.x, pos.y); }
      var noticeAlpha = this.coach > 0 ? (motionEnabled() ? clamp(this.coach / Math.min(.45, this.coachMax * .3), 0, 1) : 1) : 0;
      this.coachBg.setVisible(this.phase === 'playing' && this.coach > 0); this.coachBg.setAlpha(noticeAlpha); this.coachText.setAlpha(this.phase === 'playing' ? noticeAlpha : 0);
      var ivyCount = 0, boosts = META.boosters(), keys = ['hammer', 'rocket', 'shuffle'];
      for (i = 0; i < 64; i++) if (this.state.cells[i].b === E.B_IVY) ivyCount++;
      this.ivyIcon.setVisible(ivyCount > 0); this.ivyText.setVisible(ivyCount > 0); if (ivyCount > 0) setTextIfChanged(this.ivyText, ivyCount + '/' + (this.state.ivyMax || ivyCount));
      for (i = 0; i < 3; i++) { var b = this.boosterButtons[i], count = b.sub; setTextIfChanged(count, this.mode === 'mastery' ? '—' : String(boosts[keys[i]] || 0)); if (this.armed === keys[i]) b.setScale(1.05); else if (b.scaleX > 1.03) b.setScale(1); }
      for (i = 0; i < 64; i++) {
        c = this.state.cells[i]; record = this.records[i]; tile = this.tiles[i]; var x = i % 8, y = (i / 8) | 0; pos = this.cellPos(x, y);
        if (record.id !== c.id) { record.id = c.id; record.key = ''; }
        if (c.b) { tile.setVisible(false); this.plates[i].setVisible(false); this.bonuses[i].setVisible(false); this.obstacles[i].setVisible(true); this.obstacles[i].setTexture(c.b === E.B_IVY ? 'pp_ivy' : 'pp_crate'); }
        else if (c.key) { tile.setVisible(false); this.plates[i].setVisible(false); this.bonuses[i].setVisible(false); this.obstacles[i].setVisible(true); this.obstacles[i].setTexture('pp_key'); }
        else { tile.setVisible(true); this.obstacles[i].setVisible(false); key = 'pp_piece_' + clamp(c.c, 0, 6) + '_' + clamp(c.sp || 0, 0, 4); if (record.key !== key) { tile.setTexture(key); record.key = key; } this.bonuses[i].setVisible(c.pickup === 1); }
        this.keyPaths[i].setPosition(pos.x, pos.y); this.keyPaths[i].setVisible(keyStarts[x] != null && y >= keyStarts[x] && !c.b);
        var drawX = pos.x, drawY = pos.y;
        if (record.motion && record.motion.max > 0) { var motionT = clamp(record.motion.t / record.motion.max, 0, 1), motionEase = easeOutCubic(motionT); drawX = record.motion.from.x + (pos.x - record.motion.from.x) * motionEase; drawY = record.motion.from.y + (pos.y - record.motion.from.y) * motionEase; }
        tile.setPosition(drawX, drawY); this.obstacles[i].setPosition(pos.x, pos.y); this.plates[i].setPosition(pos.x, pos.y); this.bonuses[i].setPosition(pos.x + 13, pos.y - 13); this.plates[i].setVisible(!c.b && !c.key && c.plate > 0);
        scale = 0.64 * (motionEnabled() && record.pop > 0 ? 1 + Math.sin((record.pop / .24) * Math.PI) * .08 : 1); if (motionEnabled() && record.invalid > 0) scale *= 1 + Math.sin(record.invalid * 60) * .05;
        tile.setScale(scale); this.obstacles[i].setScale(.68); this.plates[i].setScale(.68); tile.setAlpha(record.invalid > 0 ? .8 : 1);
      }
      this.renderParticlePool(this.particles.pop); this.renderParticlePool(this.particles.cascade); this.renderParticlePool(this.particles.reward);
      for (i = 0; i < this.clearPool.length; i++) { var clear = this.clearPool[i]; clear.sprite.setVisible(clear.active); if (clear.active) { clear.sprite.setPosition(clear.x, clear.y); clear.sprite.setAlpha(1 - clear.t / clear.max); clear.sprite.setScale(motionEnabled() ? .64 + clear.t / clear.max * .12 : .64); } }
      for (i = 0; i < this.rings.length; i++) { var rg = this.rings[i]; if (!rg.sprite) rg.sprite = this.add.image(0, 0, 'pp_ring').setDepth(19); rg.sprite.setVisible(rg.active); if (rg.active) { rg.sprite.setPosition(rg.x, rg.y); rg.sprite.setScale(.25 + rg.t / rg.max * .8); rg.sprite.setAlpha(1 - rg.t / rg.max); } }
      var bt = this.banner.t, show = this.phase !== 'playing' && bt < this.banner.max && this.banner.text; this.bannerBg.setVisible(!!show); this.bannerText.setVisible(!!show); if (show) { var progress = clamp(bt / .3, 0, 1); var s = motionEnabled() ? easeOutBack(progress) : 1; this.bannerBg.setScale(s, 1); this.bannerText.setScale(s, 1); }
      if (this.reveal) { var revealScale = motionEnabled() ? easeOutCubic(clamp(this.reveal.t / .45, 0, 1)) : 1; this.revealCard.setScale(revealScale); this.revealArt.setScale(revealScale); this.revealTitle.setAlpha(motionEnabled() ? clamp(this.reveal.t / .25, 0, 1) : 1); this.revealRoom.setAlpha(motionEnabled() ? clamp(this.reveal.t / .35, 0, 1) : 1); this.revealCopy.setAlpha(motionEnabled() ? clamp((this.reveal.t - .25) / .4, 0, 1) : 1); }
    }
    update(time, delta) {
      this.juiceFrame = kit.juice.frame();
      if (this.juiceFrame.frozen) return;
      if (this.reveal) { this.stepSim(1000 / 60 / 1000); return; }
      if (this.phase === 'result-win' || this.phase === 'result-lose') return;
      var frame = Math.min(Math.max(0, delta || 0), 120); this.accum = Math.min(this.accum + frame, 1000 / 60 * 4);
      var steps = 0, step = 1000 / 60;
      while (this.accum >= step && steps < 4) { this.accum -= step; this.stepSim(step / 1000); steps++; }
    }
    shutdown() { unwireDraw(this); kit.input.clearAll(); destroyList(this.resultGroup || []); }
  }

  var config = {
    type: PhaserRef.AUTO, width: Math.round(W * HIDPI_FACTOR), height: Math.round(H * HIDPI_FACTOR), parent: document.body, backgroundColor: '#10182B',
    render: Object.assign({}, KitRef.renderDefaults),
    scale: { mode: PhaserRef.Scale.FIT, autoCenter: PhaserRef.Scale.CENTER_BOTH, width: Math.round(W * HIDPI_FACTOR), height: Math.round(H * HIDPI_FACTOR) },
    scene: [BootScene, TitleScene, PlayScene]
  };
  Game.phaser = new PhaserRef.Game(config);
})(typeof window !== 'undefined' ? window : globalThis);
