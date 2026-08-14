/* Aftergate - input adapter + UI kit.
 *
 * UI_LAW compliance lives here:
 *   - ONE transient at a time (banner queue of one, chip queue of one)
 *   - centre banners ONLY at run boundaries (Banner.show refuses during
 *     live play unless boundary:true)
 *   - in-play events are corner chips anchored to the HUD, <=24px text,
 *     <=1.0s hold, fast fade, reduced-motion aware
 *   - tutorial coaching is one thin fading strip at the TOP edge
 *   - safe-area insets are read from the real env() values
 *   - every touch target is >=44 CSS px
 *
 * Input is GGKit's pointer map and nothing else. This layer only derives
 * frame deltas, taps and key edges from kit.input; it never opens its own
 * pointer bookkeeping.
 */
'use strict';
var AG = window.AG || {};
window.AG = AG;

/* ==================================================================== */
/* INPUT ADAPTER                                                        */
/* ==================================================================== */
AG.input = {
  kit: null, game: null,
  actives: [], downs: [], ups: [],
  pad: null,
  _store: new Map(),
  _pendingUps: [],
  _rect: null,
  _keys: {},
  _prevKeys: {},
  KEYS: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS',
    'Space', 'Enter', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'KeyR', 'KeyP', 'Escape'],

  attach: function (kit, game) {
    this.kit = kit; this.game = game;
    var self = this;
    // Capture phase so we read GGKit's pointer entry BEFORE its own
    // pointerup handler deletes it. This reads kit state, it does not
    // maintain a second pointer map.
    function release(e) {
      var raw = kit.input.pointers.get(e.pointerId);
      if (!raw) return;
      var d = self.toDesign(raw.x, raw.y);
      var s = self.toDesign(raw.startX, raw.startY);
      var dist = Math.abs(raw.x - raw.startX) + Math.abs(raw.y - raw.startY);
      var age = (performance.now() - raw.downAt) / 1000;
      self._pendingUps.push({
        id: e.pointerId, x: d.x, y: d.y, sx: s.x, sy: s.y,
        zone: raw.zone, tap: dist < 14 && age < 0.7, cancelled: e.type === 'pointercancel'
      });
      if (self._pendingUps.length > 12) self._pendingUps.shift();
    }
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('resize', function () { self._rect = null; });
    window.addEventListener('orientationchange', function () { self._rect = null; });
  },

  rect: function () {
    if (!this._rect && this.game && this.game.canvas) {
      var r = this.game.canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this._rect = r;
    }
    return this._rect;
  },
  toDesign: function (cx, cy) {
    var r = this.rect();
    if (!r) return { x: AG.DW / 2, y: AG.DH / 2 };
    return { x: (cx - r.left) / r.width * AG.DW, y: (cy - r.top) / r.height * AG.DH };
  },

  poll: function () {
    var kit = this.kit, i;
    this.actives.length = 0; this.downs.length = 0;
    this.ups = this._pendingUps.slice();
    this._pendingUps.length = 0;
    if (!kit) return;
    this.pad = kit.input.gamepad ? kit.input.gamepad() : null;
    var seen = this._seen || (this._seen = new Set());
    seen.clear();
    var now = performance.now();
    var it = kit.input.pointers.entries(), step;
    while (!(step = it.next()).done) {
      var id = step.value[0], raw = step.value[1];
      seen.add(id);
      var d = this.toDesign(raw.x, raw.y);
      var s = this.toDesign(raw.startX, raw.startY);
      var prev = this._store.get(id), fresh = false;
      if (!prev) { prev = { x: d.x, y: d.y }; this._store.set(id, prev); fresh = true; }
      var rec = {
        id: id, raw: raw, x: d.x, y: d.y,
        dx: d.x - prev.x, dy: d.y - prev.y,
        sx: s.x, sy: s.y, age: (now - raw.downAt) / 1000,
        moved: Math.abs(d.x - s.x) + Math.abs(d.y - s.y) > 12,
        zone: raw.zone
      };
      prev.x = d.x; prev.y = d.y;
      this.actives.push(rec);
      if (fresh) this.downs.push(rec);
    }
    var dead = [];
    var kit2 = this._store.keys(), st2;
    while (!(st2 = kit2.next()).done) if (!seen.has(st2.value)) dead.push(st2.value);
    for (i = 0; i < dead.length; i++) this._store.delete(dead[i]);

    // key edges
    for (i = 0; i < this.KEYS.length; i++) {
      var k = this.KEYS[i];
      this._prevKeys[k] = this._keys[k];
      this._keys[k] = kit.input.keyDown(k);
    }
  },
  down: function (code) { return !!this._keys[code]; },
  pressed: function (code) { return !!this._keys[code] && !this._prevKeys[code]; },
  clear: function () {
    this.actives.length = 0; this.downs.length = 0; this.ups.length = 0;
    this._pendingUps.length = 0; this._store.clear();
    this.pad = null;
    if (this.kit && this.kit.input && this.kit.input.gamepad && this.kit.input.gamepad.reset) this.kit.input.gamepad.reset();
    for (var i = 0; i < this.KEYS.length; i++) { this._keys[this.KEYS[i]] = false; this._prevKeys[this.KEYS[i]] = false; }
  },
  /* claim a pointer so other systems ignore it (bug class: DOM handlers
   * must seed the kit pointer at claim time, not invent their own) */
  claim: function (rec, zone) { if (rec && rec.raw) { rec.raw.zone = zone; rec.zone = zone; } }
};

/* ==================================================================== */
/* UI KIT                                                               */
/* ==================================================================== */
AG.ui = {
  reduced: false,
  safe: { top: 0, right: 0, bottom: 0, left: 0 },

  init: function () {
    try {
      this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { this.reduced = false; }
    this.measureSafe();
    var self = this;
    window.addEventListener('resize', function () { self.measureSafe(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { self.measureSafe(); }, 150); });
  },

  /* real env() insets, converted from CSS px into design units */
  measureSafe: function () {
    var probe = document.getElementById('ag-safe');
    if (!probe) return;
    var cs = window.getComputedStyle(probe);
    var t = parseFloat(cs.paddingTop) || 0, r = parseFloat(cs.paddingRight) || 0;
    var b = parseFloat(cs.paddingBottom) || 0, l = parseFloat(cs.paddingLeft) || 0;
    var rect = AG.input.rect();
    var kx = rect && rect.width ? AG.DW / rect.width : 1;
    var ky = rect && rect.height ? AG.DH / rect.height : 1;
    this.safe.top = Math.min(120, t * ky);
    this.safe.bottom = Math.min(120, b * ky);
    this.safe.left = Math.min(120, l * kx);
    this.safe.right = Math.min(120, r * kx);
  },

  /* CSS px -> design units (touch targets must stay >=44 CSS px) */
  minTouch: function () {
    var rect = AG.input.rect();
    var ky = rect && rect.height ? AG.DH / rect.height : (AG.DH / 844);
    return Math.max(44, 44 * ky);
  },

  /* ---- change-guarded setters (setText AND setColor both guarded) ---- */
  setText: function (obj, str) {
    if (!obj) return;
    if (obj.__t !== str) { obj.__t = str; obj.setText(str); }
  },
  setColor: function (obj, css) {
    if (!obj) return;
    if (obj.__c !== css) { obj.__c = css; obj.setColor(css); }
  },
  setTint: function (obj, color) {
    if (!obj) return;
    if (obj.__tint !== color) { obj.__tint = color; obj.setTint(color); }
  },
  setVis: function (obj, v) {
    if (!obj) return;
    if (obj.visible !== v) obj.setVisible(v);
  },

  font: function (size, weight) {
    return {
      fontFamily: '"Trebuchet MS", "Lucida Grande", Verdana, system-ui, sans-serif',
      fontSize: Math.round(size) + 'px',
      fontStyle: weight || 'bold',
      color: '#e8edf5'
    };
  },
  label: function (scene, x, y, str, size, css, origin) {
    var t = scene.add.text(x, y, str, this.font(size));
    t.setColor(css || '#e8edf5');
    t.__t = str; t.__c = css || '#e8edf5';
    t.setOrigin(origin === undefined ? 0.5 : origin, 0.5);
    t.setResolution(2);
    return t;
  },
  strong: function (scene, x, y, str, size, css, origin) {
    var t = this.label(scene, x, y, str, size, css, origin);
    t.setStroke('#05070c', Math.max(3, size * 0.18));
    t.setShadow(0, 3, 'rgba(0,0,0,0.55)', 4, false, true);
    return t;
  }
};

/* ------------------------------------------------------------- meter */
AG.ui.Meter = function (scene, x, y, w, h, bg, fg) {
  this.back = scene.add.nineslice(x, y, 'bar9', null, w, h, 5, 5, 5, 5).setOrigin(0, 0.5).setTint(bg);
  this.fill = scene.add.nineslice(x + 2, y, 'bar9', null, Math.max(6, w - 4), h - 4, 5, 5, 5, 5).setOrigin(0, 0.5).setTint(fg);
  this.w = w - 4; this.h = h - 4; this._f = -1; this._tint = fg;
};
AG.ui.Meter.prototype.set = function (frac, tint) {
  frac = AG.clamp(frac, 0, 1);
  if (Math.abs(frac - this._f) > 0.002) {
    this._f = frac;
    this.fill.setSize(Math.max(4, this.w * frac), this.h);
  }
  if (tint !== undefined && tint !== this._tint) { this._tint = tint; this.fill.setTint(tint); }
};
AG.ui.Meter.prototype.setDepth = function (d) { this.back.setDepth(d); this.fill.setDepth(d + 1); return this; };
AG.ui.Meter.prototype.setScrollFactor = function (s) { this.back.setScrollFactor(s); this.fill.setScrollFactor(s); return this; };

/* ------------------------------------------------------------ button */
/* Touch targets are grown to the 44 CSS px floor even when the art is small. */
AG.ui.Button = function (scene, opts) {
  this.scene = scene;
  this.x = opts.x; this.y = opts.y;
  this.w = opts.w; this.h = opts.h;
  this.onTap = opts.onTap || function () { };
  this.enabled = opts.enabled !== false;
  var c = scene.add.container(opts.x, opts.y);
  this.c = c;
  this.bg = scene.add.nineslice(0, 0, opts.texture || 'btn9', null, opts.w, opts.h, 13, 13, 13, 13);
  if (opts.tint) this.bg.setTint(opts.tint);
  c.add(this.bg);
  if (opts.icon) {
    this.icon = scene.add.image(opts.iconX === undefined ? -opts.w / 2 + 34 : opts.iconX, opts.iconY || 0, opts.icon);
    if (opts.iconScale) this.icon.setScale(opts.iconScale);
    c.add(this.icon);
  }
  if (opts.text !== undefined) {
    this.text = AG.ui.label(scene, opts.textX === undefined ? (opts.icon ? 14 : 0) : opts.textX,
      opts.textY || 0, opts.text, opts.size || 22, opts.color || '#e8edf5');
    c.add(this.text);
  }
  if (opts.sub) {
    this.sub = AG.ui.label(scene, opts.textX === undefined ? (opts.icon ? 14 : 0) : opts.textX,
      (opts.textY || 0) + 24, opts.sub, 15, '#9fb0c6');
    c.add(this.sub);
  }
  this._pressed = false;
  this.setEnabled(this.enabled);
};
AG.ui.Button.prototype.setEnabled = function (v) {
  this.enabled = !!v;
  this.c.setAlpha(v ? 1 : 0.42);
  return this;
};
AG.ui.Button.prototype.setDepth = function (d) { this.c.setDepth(d); return this; };
AG.ui.Button.prototype.hit = function (x, y) {
  var minT = AG.ui.minTouch();
  var w = Math.max(this.w, minT), h = Math.max(this.h, minT);
  return x >= this.x - w / 2 && x <= this.x + w / 2 && y >= this.y - h / 2 && y <= this.y + h / 2;
};
AG.ui.Button.prototype.press = function (on) {
  if (this._pressed === on) return;
  this._pressed = on;
  this.c.setScale(on ? 0.96 : 1);
};
AG.ui.Button.prototype.destroy = function () { this.c.destroy(); };

/* --------------------------------------------------------- HUD chips */
/* Small corner toast anchored beside the HUD cluster. ONE at a time. */
AG.ui.Chips = function (scene, x, y, originX) {
  this.scene = scene;
  this.x = x; this.y = y;
  this.q = [];
  this.t = 0;
  this.live = false;
  var c = scene.add.container(x, y);
  c.setDepth(900).setAlpha(0).setScrollFactor(0);
  this.c = c;
  this.bg = scene.add.nineslice(0, 0, 'chip9', null, 150, 38, 10, 10, 10, 10).setOrigin(originX === undefined ? 1 : originX, 0.5);
  c.add(this.bg);
  this.icon = scene.add.image(0, 0, 'p_dot').setVisible(false);
  c.add(this.icon);
  this.text = AG.ui.label(scene, 0, 0, '', 19, '#e8edf5', 0);
  c.add(this.text);
  this.originX = originX === undefined ? 1 : originX;
};
AG.ui.Chips.prototype.push = function (text, css, icon) {
  this.q.push({ text: text, css: css || '#e8edf5', icon: icon || null });
  if (this.q.length > 3) this.q.shift();
};
AG.ui.Chips.prototype.update = function (dt) {
  if (this.live) {
    this.t -= dt;
    var hold = AG.ui.reduced ? 0.7 : 1.0;
    if (this.t > hold - 0.12) this.c.setAlpha(AG.clamp((hold + 0.12 - this.t) / 0.12, 0, 1));
    else if (this.t < 0.18) this.c.setAlpha(AG.clamp(this.t / 0.18, 0, 1));
    else this.c.setAlpha(1);
    if (this.t <= 0) { this.live = false; this.c.setAlpha(0); }
    return;
  }
  if (!this.q.length) return;
  var item = this.q.shift();
  AG.ui.setText(this.text, item.text);
  AG.ui.setColor(this.text, item.css);
  var tw = Math.max(74, this.text.width + (item.icon ? 58 : 32));
  this.bg.setSize(tw, 38);
  // originX 1: the chip hangs to the LEFT of the anchor; 0: to the right.
  var left = this.originX === 1 ? -tw : 0;
  if (item.icon) {
    this.icon.setTexture(item.icon).setVisible(true).setScale(0.68);
    this.icon.x = left + 22;
    this.text.x = left + 42;
  } else {
    this.icon.setVisible(false);
    this.text.x = left + 16;
  }
  this.live = true;
  this.t = (AG.ui.reduced ? 0.7 : 1.0) + 0.12;
  this.c.setAlpha(0);
};
AG.ui.Chips.prototype.clear = function () { this.q.length = 0; this.live = false; this.c.setAlpha(0); };

/* ------------------------------------------------------ centre banner */
/* Run-boundary only. show() refuses anything not flagged as a boundary
 * beat, which is what keeps live play clear of 60% width slabs. */
AG.ui.Banner = function (scene) {
  this.scene = scene;
  var w = Math.round(AG.DW * 0.60);
  var c = scene.add.container(AG.DW / 2, AG.DH * 0.40);
  c.setDepth(950).setVisible(false).setScrollFactor(0);
  this.c = c;
  this.bg = scene.add.nineslice(0, 0, 'banner9', null, w, 128, 16, 16, 16, 16);
  c.add(this.bg);
  this.medal = scene.add.image(0, -34, 'medal_gold').setVisible(false);
  c.add(this.medal);
  this.title = AG.ui.strong(scene, 0, -18, '', 34, '#ffd479');
  c.add(this.title);
  this.sub = AG.ui.label(scene, 0, 26, '', 18, '#9fb0c6');
  c.add(this.sub);
  this.t = 0; this.live = false;
  this.w = w;
};
AG.ui.Banner.prototype.show = function (opts) {
  if (!opts || !opts.boundary) return false;   // UI_LAW rule 2
  var scene = this.scene;
  AG.ui.setText(this.title, opts.title || '');
  AG.ui.setColor(this.title, opts.color || '#ffd479');
  // auto-fit: a long site name must never spill past the slab
  var size = 34;
  this.title.setFontSize(size);
  while (this.title.width > this.w - 34 && size > 18) {
    size -= 2;
    this.title.setFontSize(size);
  }
  AG.ui.setText(this.sub, opts.sub || '');
  AG.ui.setVis(this.sub, !!opts.sub);
  if (opts.medal && AG.MEDAL_ORDER[opts.medal]) {
    this.medal.setTexture('medal_' + opts.medal).setVisible(true);
    this.title.y = 6; this.sub.y = 42;
    this.bg.setSize(this.w, 158);
    this.medal.y = -44;
  } else {
    this.medal.setVisible(false);
    this.title.y = opts.sub ? -16 : 0; this.sub.y = 24;
    this.bg.setSize(this.w, opts.sub ? 122 : 96);
  }
  this.c.y = opts.y || AG.DH * 0.38;
  this.c.setVisible(true).setAlpha(1);
  this.live = true;
  this.t = opts.hold === undefined ? 1.7 : opts.hold;
  scene.tweens.killTweensOf(this.c);
  if (AG.ui.reduced) {
    this.c.setScale(1);
  } else {
    this.c.setScale(0.72, 0.5);
    scene.tweens.add({ targets: this.c, scaleX: 1, scaleY: 1, duration: 380, ease: 'Back.easeOut' });
  }
  return true;
};
AG.ui.Banner.prototype.update = function (dt) {
  if (!this.live) return;
  this.t -= dt;
  if (this.t < 0.3) this.c.setAlpha(AG.clamp(this.t / 0.3, 0, 1));
  if (this.t <= 0) { this.live = false; this.c.setVisible(false); }
};
AG.ui.Banner.prototype.hide = function () { this.live = false; this.c.setVisible(false); };

/* ------------------------------------------------------ coach strip */
/* One thin line at the TOP edge, fades to nothing. Never centre, never
 * over the controls, never two at once. */
AG.ui.Coach = function (scene) {
  this.scene = scene;
  var y = 0;
  var c = scene.add.container(AG.DW / 2, y);
  c.setDepth(880).setAlpha(0).setScrollFactor(0);
  this.c = c;
  this.bg = scene.add.nineslice(0, 0, 'strip9', null, AG.DW - 24, 40, 8, 8, 8, 8);
  c.add(this.bg);
  this.text = AG.ui.label(scene, 0, 0, '', 17, '#ffd479');
  c.add(this.text);
  this.t = 0; this.live = false; this.msg = '';
};
AG.ui.Coach.prototype.queue = function (msg, hold) {
  this._pending = { msg: msg, hold: hold };
};
AG.ui.Coach.prototype.pump = function (blocked) {
  if (blocked || !this._pending) return;
  var p = this._pending; this._pending = null;
  this.say(p.msg, p.hold);
};
AG.ui.Coach.prototype.say = function (msg, hold) {
  if (this.live && this.msg === msg) return;
  this.msg = msg;
  AG.ui.setText(this.text, msg);
  var w = AG.clamp(this.text.width + 40, 180, AG.DW - 24);
  this.bg.setSize(w, 40);
  this.live = true;
  this.tMax = hold === undefined ? 3.0 : hold;
  this.t = this.tMax;
};
AG.ui.Coach.prototype.place = function (y) { this.c.y = y; };
AG.ui.Coach.prototype.update = function (dt) {
  if (!this.live) { if (this.c.alpha > 0) this.c.setAlpha(Math.max(0, this.c.alpha - dt * 4)); return; }
  this.t -= dt;
  var fadeIn = AG.clamp((this.tMax - this.t) / 0.25, 0, 1);
  var fadeOut = AG.clamp(this.t / 0.9, 0, 1);
  this.c.setAlpha(Math.min(fadeIn, fadeOut) * 0.95);
  if (this.t <= 0) { this.live = false; this.msg = ''; }
};
AG.ui.Coach.prototype.clear = function () { this.live = false; this.t = 0; this.msg = ''; this.c.setAlpha(0); };

/* ---------------------------------------------------- popup pool ---- */
/* World-space number feedback next to the squad. Small, pooled, capped. */
AG.ui.Popups = function (scene, max) {
  this.scene = scene;
  this.pool = [];
  this.max = max || 14;
  for (var i = 0; i < this.max; i++) {
    var t = AG.ui.strong(scene, 0, 0, '', 24, '#ffffff');
    t.setVisible(false).setDepth(700);
    this.pool.push({ t: t, life: 0, dur: 0, vy: 0 });
  }
  this.i = 0;
};
AG.ui.Popups.prototype.pop = function (x, y, str, css, size) {
  var p = this.pool[this.i];
  this.i = (this.i + 1) % this.pool.length;
  var t = p.t;
  t.setFontSize(Math.round(size || 24));
  AG.ui.setText(t, str);
  AG.ui.setColor(t, css || '#ffffff');
  t.setPosition(x, y).setVisible(true).setAlpha(1).setScale(AG.ui.reduced ? 1 : 0.6);
  p.life = 0.85; p.dur = 0.85; p.vy = -52;
  if (!AG.ui.reduced) {
    this.scene.tweens.killTweensOf(t);
    this.scene.tweens.add({ targets: t, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
  }
};
AG.ui.Popups.prototype.update = function (dt) {
  for (var i = 0; i < this.pool.length; i++) {
    var p = this.pool[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.t.setVisible(false); continue; }
    p.t.y += p.vy * dt;
    p.vy *= 0.94;
    var f = p.life / p.dur;
    if (f < 0.4) p.t.setAlpha(f / 0.4);
  }
};
AG.ui.Popups.prototype.clear = function () {
  for (var i = 0; i < this.pool.length; i++) { this.pool[i].life = 0; this.pool[i].t.setVisible(false); }
};

/* ------------------------------------------------------- fixed step */
/* Degraded devices get slow motion, never a time skip: the accumulator is
 * clamped, so no clock can ever advance past the stepped sim. */
AG.ui.Stepper = function (maxSteps) {
  this.acc = 0;
  this.max = maxSteps || 4;
  this.simTime = 0;
};
AG.ui.Stepper.prototype.steps = function (dtMs) {
  var dt = dtMs / 1000;
  if (!isFinite(dt) || dt < 0) dt = 0;
  if (dt > 0.25) dt = 0.25;
  this.acc += dt;
  var n = 0;
  while (this.acc >= AG.STEP && n < this.max) { this.acc -= AG.STEP; n++; }
  if (this.acc > AG.STEP * this.max) this.acc = AG.STEP * this.max; // drop, never skip
  this.simTime += n * AG.STEP;
  return n;
};
