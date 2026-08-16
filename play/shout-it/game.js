/* Shout It! - pass-the-phone party word game.
 * Phaser 3 (from /play/_shared/) + GGKit for lifecycle, input, audio, saves,
 * juice. Design resolution 390x844, portrait, Scale.FIT.
 *
 * Render laws this build holds to (fix round 1):
 *  1. Every surface is an AUTHORED baked texture. Nothing ships as a PNG
 *     sprite: the card faces/backs, deck motifs, mascot, FX primitives and
 *     the whole background are drawn once into the texture manager at boot
 *     and reused as tinted Images. Phaser re-tessellates a Graphics command
 *     buffer every frame, which a UI-dense title cannot afford under the
 *     4x-CPU feel gate.
 *  2. Overdraw is the frame budget. The gate renders through software GL,
 *     so every additive full-screen layer costs milliseconds. The background
 *     is ONE opaque baked image; the card is ONE image with its shadow baked
 *     in; there are no large ADD-blended sprites in the steady state.
 *  3. FX are pooled. Bursts recycle a fixed pool of primitive quads driven
 *     by one integrator, so a celebration allocates nothing.
 */
(function () {
  'use strict';

  var DW = 390, DH = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(DW, DH);
  /* internal safe content bounds in design units. The canvas parent already
   * carries env(safe-area-inset-*), these keep controls off the very edge. */
  var BOUND_TOP = 10, BOUND_BOT = 806;
  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  /* ---------------------------------------------------------- palette
   * Colour semantics: the four saturated team hues (coral/aqua/lime/amber)
   * are RESERVED for team identity. Calls to action are neutral paper, the
   * brand accent is violet, crimson means "the buzzer is close". Nothing
   * else may borrow a team hue. */
  var C = {
    deep: 0x120a2c, mid: 0x1b1046, lift: 0x2c1a63,
    paper: 0xfff6ec, paperEdge: 0xe9d9c6,
    ink: 0x1a0f3d,
    bad: 0xe11d48, badLo: 0x7c1030,
    violet: 0x8b5cf6, violetLo: 0x4c2f96,
    slate: 0x3a2a70, slateDark: 0x241857,
    calm: 0x9f8fe0
  };
  var HEX = {
    white: '#ffffff', ink: '#1a0f3d', inkSoft: '#5b4a91',
    accent: '#c4b5fd', accentDeep: '#8b5cf6',
    bad: '#ff8098', dim: '#c2b6ea', dimmer: '#a294d8',
    paper: '#fff6ec'
  };

  /* ---------------------------------------------------------- type scale
   * One disciplined role scale. Sizes, weights, tracking and line height are
   * SET on every string; nothing uses a browser default and no call site
   * invents a size outside this table (the phrase display has its own
   * bounded step ladder below). */
  var TY = {
    display: { size: 62, weight: '900', ls: -2, lh: 0 },
    h1: { size: 38, weight: '900', ls: -1, lh: 2 },
    h2: { size: 27, weight: '800', ls: -0.4, lh: 2 },
    h3: { size: 20, weight: '800', ls: 0.2, lh: 2 },
    btnLg: { size: 30, weight: '900', ls: 1.5, lh: 0 },
    btnMd: { size: 20, weight: '900', ls: 0.5, lh: 0 },
    btnSm: { size: 15, weight: '800', ls: 1, lh: 0 },
    btnSub: { size: 11, weight: '700', ls: 1.2, lh: 0 },
    body: { size: 15, weight: '600', ls: 0.2, lh: 6 },
    small: { size: 13, weight: '600', ls: 0.2, lh: 5 },
    label: { size: 11, weight: '800', ls: 2.6, lh: 0 },
    micro: { size: 10, weight: '800', ls: 1.6, lh: 0 }
  };
  var PHRASE_STEPS = [46, 39, 33, 28, 24];   // bounded display ladder
  var PHRASE_LH = 4;

  /* ------------------------------------------------------ audio table */
  var AUDIO = {
    music_lobby: 'assets/audio/music_lobby.mp3',
    music_round: 'assets/audio/music_round.mp3',
    tap: 'assets/audio/sfx_tap.mp3',
    select: 'assets/audio/sfx_select.mp3',
    back: 'assets/audio/sfx_back.mp3',
    got: 'assets/audio/sfx_got.mp3',
    pass: 'assets/audio/sfx_pass.mp3',
    tick: 'assets/audio/sfx_tick.mp3',
    tickHi: 'assets/audio/sfx_tick_hi.mp3',
    buzzer: 'assets/audio/sfx_buzzer.mp3',
    fanfare: 'assets/audio/sfx_fanfare.mp3',
    win: 'assets/audio/sfx_win.mp3',
    card: 'assets/audio/sfx_card.mp3',
    shuffle: 'assets/audio/sfx_shuffle.mp3',
    handoff: 'assets/audio/sfx_handoff.mp3',
    unlock: 'assets/audio/sfx_unlock.mp3',
    countdown: 'assets/audio/sfx_countdown.mp3',
    crowd: 'assets/audio/sfx_crowd.mp3'
  };
  var SFX_NAMES = ['tap', 'select', 'back', 'got', 'pass', 'tick', 'tickHi', 'buzzer',
    'fanfare', 'win', 'card', 'shuffle', 'handoff', 'unlock', 'countdown', 'crowd'];

  /* ------------------------------------------------------------ rules */
  var MIN_T = 45, MAX_T = 75;          // hidden round clock band (prototype)
  var HANDOFF_T = 1.35;                // privacy curtain, fully input-blocking
  var HANDOFF_MIN_TAP = 0.45;          // earliest a tap may release the curtain
  /* tension states, driven off elapsed time against the EARLIEST possible
   * buzzer. The clock itself stays hidden: nothing on screen ever resolves
   * to "seconds remaining". */
  var TENSE_AT = MIN_T * 0.6;          // 27 s: the round stops feeling new
  var IMMINENT_AT = MIN_T - 4;         // 41 s: the buzzer can now land any moment

  var DECK_BY_ID = {};
  SHOUT_DECKS.forEach(function (d) { DECK_BY_ID[d.id] = d; });
  var DECK_INDEX = {};
  SHOUT_DECKS.forEach(function (d, i) { DECK_INDEX[d.id] = i; });

  /* ------------------------------------------------------------- save */
  var DEFAULT_SAVE = {
    v: 1, games: 0, rounds: 0, bestRun: 0, phrases: 0, tutorial: 0,
    teamCount: 2, targetIdx: 1, decks: ['objects', 'animals', 'moods'], tilt: 0
  };
  function isInt(n) { return typeof n === 'number' && isFinite(n) && n >= 0 && n < 1e7; }
  function isFlag(n) { return n === 0 || n === 1; }
  function validateSave(o) {
    if (!o || typeof o !== 'object' || o.v !== 1) return false;
    if (!isInt(o.games) || !isInt(o.rounds) || !isInt(o.bestRun) || !isInt(o.phrases)) return false;
    if (!isFlag(o.tutorial) || !isFlag(o.tilt)) return false;
    if (!isInt(o.teamCount) || o.teamCount < 2 || o.teamCount > 4) return false;
    /* targetIdx is legacy save data from the prototype; the live target is
     * always seven and the old picker is no longer exposed. */
    if (!isInt(o.targetIdx) || o.targetIdx > 2) return false;
    if (!Array.isArray(o.decks) || !o.decks.length || o.decks.length > SHOUT_DECKS.length) return false;
    var seen = {};
    for (var i = 0; i < o.decks.length; i++) {
      var id = o.decks[i];
      if (typeof id !== 'string' || !DECK_BY_ID[id] || seen[id]) return false;
      seen[id] = 1;
    }
    return true;
  }

  var game = null, activeKey = null, pauseOpen = false, musicWant = null, musicArmed = false;
  var playScene = null;          // live gameplay scene, for settings <-> tilt sync
  var pressReg = [];             // every live press-state releaser

  var kit = GGKit.create({
    slug: 'shout-it',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () {
      releaseAllPresses();
      if (game && activeKey && game.scene.isActive(activeKey)) game.scene.pause(activeKey);
    },
    onResume: function () { if (game && activeKey && game.scene.isPaused(activeKey)) game.scene.resume(activeKey); },
    onRestart: function () { releaseAllPresses(); if (game) { closePause(); goto('title'); } }
  });
  kit.registerPWA();

  var SAVE = kit.save.get(null);
  if (!SAVE) {
    SAVE = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    // Carry the prototype's best team run forward, then hand the value to the
    // guarded save layer immediately and drop the legacy key: there is exactly
    // one storage owner in this title and it is GGKit.
    try {
      var legacy = parseInt(localStorage.getItem('shoutit.best.v1') || '0', 10);
      if (isFinite(legacy) && legacy > 0 && legacy < 1e6) SAVE.bestRun = legacy;
      localStorage.removeItem('shoutit.best.v1');
    } catch (e) { /* private mode */ }
    kit.save.set(SAVE);
  }
  function saveNow() { kit.save.set(SAVE); }
  function activeDecks() {
    var ids = SAVE.decks.filter(function (id) { return !!DECK_BY_ID[id]; });
    if (!ids.length) ids = ['objects'];
    return ids;
  }

  /* ------------------------------------------------- reduced motion policy
   * One switch (GGKit's accessibility toggle) governs EVERY non-essential
   * motion: shake, flashes, particle bursts, ring pulses, mascot spins,
   * idle loops, staggered reveals. Reduced mode keeps the information and
   * drops the movement, it never removes state. */
  function motionOK() { return kit.juice.enabled !== false; }
  function md(ms) { return motionOK() ? ms : Math.min(ms, 90); }   // duration
  function loopTween(sc, cfg) {
    if (!motionOK()) return { remove: function () {}, pause: function () {}, resume: function () {}, timeScale: 1 };
    return sc.tweens.add(cfg);
  }

  /* ---------------------------------------------------------- press state */
  function registerPress(sc, release) {
    pressReg.push(release);
    sc.events.once('shutdown', function () {
      var i = pressReg.indexOf(release);
      if (i >= 0) pressReg.splice(i, 1);
    });
  }
  function releaseAllPresses() {
    for (var i = 0; i < pressReg.length; i++) { try { pressReg[i](); } catch (e) { /* gone */ } }
  }

  /* ------------------------------------------------- baked texture kit */
  function bake(sc, key, w, h, draw) {
    if (!sc.textures.exists(key)) {
      var g = sc.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    }
    return key;
  }
  function canvasTex(sc, key, w, h, draw) {
    if (sc.textures.exists(key)) return key;
    var cv = sc.textures.createCanvas(key, w, h);
    draw(cv.getContext(), w, h);
    cv.refresh();
    return key;
  }
  function texRR(sc, w, h, r) {
    w = Math.round(w); h = Math.round(h); r = Math.round(r);
    return bake(sc, 'rr' + w + '_' + h + '_' + r, w, h, function (g) {
      g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, w, h, r);
    });
  }
  function texRRTop(sc, w, h, r) {
    w = Math.round(w); h = Math.round(h); r = Math.round(r);
    return bake(sc, 'rt' + w + '_' + h + '_' + r, w, h, function (g) {
      g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, w, h, { tl: r, tr: r, bl: 0, br: 0 });
    });
  }
  function texRRLine(sc, w, h, r, lw) {
    w = Math.round(w); h = Math.round(h); r = Math.round(r);
    return bake(sc, 'rl' + w + '_' + h + '_' + r + '_' + lw, w, h, function (g) {
      g.lineStyle(lw, 0xffffff, 1); g.strokeRoundedRect(lw / 2, lw / 2, w - lw, h - lw, r);
    });
  }
  function texCircle(sc, rad) {
    rad = Math.round(rad);
    return bake(sc, 'ci' + rad, rad * 2, rad * 2, function (g) {
      g.fillStyle(0xffffff, 1); g.fillCircle(rad, rad, rad);
    });
  }
  function texCircleLine(sc, rad, lw) {
    rad = Math.round(rad);
    return bake(sc, 'cl' + rad + '_' + lw, rad * 2, rad * 2, function (g) {
      g.lineStyle(lw, 0xffffff, 1); g.strokeCircle(rad, rad, rad - lw / 2);
    });
  }
  function texPx(sc) {
    return bake(sc, 'px', 8, 8, function (g) { g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 8, 8); });
  }

  /* ------------------------------------------------ canvas draw helpers */
  function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /* deterministic pseudo-random so every bake is byte-identical run to run */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* Eight original deck motifs. Abstract marks only, drawn from primitives,
   * one per deck, used on the card band, the card corner and the deck-select
   * tiles so every deck reads as its own object. */
  function drawMotif(ctx, kind, cx, cy, s) {
    var i, a;
    ctx.lineWidth = Math.max(1.4, s * 0.13);
    ctx.lineCap = 'round';
    if (kind === 0) {                       // stacked rings (everyday objects)
      for (i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, s * (0.28 + i * 0.22), 0, Math.PI * 2); ctx.stroke();
      }
    } else if (kind === 1) {                // clapper bars (made-up movies)
      for (i = 0; i < 4; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.5);
        ctx.fillRect(-s * 0.72 + i * s * 0.4, -s * 0.6, s * 0.2, s * 1.2);
        ctx.restore();
      }
    } else if (kind === 2) {                // paw dots (animal situations)
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.24, s * 0.36, 0, Math.PI * 2); ctx.fill();
      for (i = 0; i < 3; i++) {
        a = -Math.PI / 2 + (i - 1) * 0.72;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * s * 0.56, cy + Math.sin(a) * s * 0.56 + s * 0.1, s * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 3) {                // fork tines (food mashups)
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.38 + i * s * 0.38, cy - s * 0.62);
        ctx.lineTo(cx - s * 0.38 + i * s * 0.38, cy - s * 0.05);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(cx - s * 0.42, cy - s * 0.05); ctx.lineTo(cx + s * 0.42, cy - s * 0.05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.05); ctx.lineTo(cx, cy + s * 0.66); ctx.stroke();
    } else if (kind === 4) {                // rooftops (around town)
      for (i = 0; i < 3; i++) {
        var w = s * 0.34, x = cx - s * 0.66 + i * s * 0.48, hh = s * (0.4 + (i % 2) * 0.32);
        ctx.fillRect(x, cy + s * 0.5 - hh, w, hh);
      }
    } else if (kind === 5) {                // wave arcs (feelings and moods)
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.5, s * (0.3 + i * 0.26), Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    } else if (kind === 6) {                // pennant triangles (sports)
      for (i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.6 + i * s * 0.62, cy + s * 0.6);
        ctx.lineTo(cx - s * 0.24 + i * s * 0.62, cy - s * 0.6);
        ctx.lineTo(cx + s * 0.12 + i * s * 0.62, cy + s * 0.6);
        ctx.closePath(); ctx.fill();
      }
    } else {                                // circuit nodes (gadgets)
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy); ctx.lineTo(cx + s * 0.6, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.6); ctx.lineTo(cx, cy + s * 0.6); ctx.stroke();
      for (i = 0; i < 4; i++) {
        a = i * Math.PI / 2;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6, s * 0.15, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function motifKey(sc, idx) {
    return canvasTex(sc, 'motif' + idx, 64, 64, function (ctx) {
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
      drawMotif(ctx, idx % 8, 32, 32, 22);
    });
  }

  /* rounded panel with layered lighting: fill, top gloss, hairline edge */
  function panel(sc, x, y, w, h, r, color, alpha) {
    var im = sc.add.image(x, y, texRR(sc, w, h, r));
    im.setDisplaySize(w, h);
    if (color != null) im.setTint(color);
    if (alpha != null) im.setAlpha(alpha);
    return im;
  }
  function skinPanel(sc, x, y, w, h, r, color, alpha) {
    var fill = panel(sc, x, y, w, h, r, color, alpha);
    var gh = Math.max(8, h * 0.4);
    var gloss = sc.add.image(x, y - h / 2 + gh / 2, texRRTop(sc, w - 4, gh, Math.max(3, r - 2)))
      .setDisplaySize(w - 4, gh).setAlpha((alpha == null ? 1 : alpha) * 0.32);
    var hair = sc.add.image(x, y, texRRLine(sc, w, h, r, 2))
      .setDisplaySize(w, h).setAlpha(0.16);
    var c = sc.add.container(0, 0, [fill, gloss, hair]);
    c.fill = fill; c.hair = hair; c.gloss = gloss;
    c.paint = function (col, a) {
      fill.setTint(col); fill.setAlpha(a);
      gloss.setAlpha(a * 0.32);
    };
    return c;
  }
  function bar(sc, x, y, w, h, color, alpha) {
    var im = sc.add.image(x, y, texPx(sc));
    im.setDisplaySize(w, h).setTint(color);
    if (alpha != null) im.setAlpha(alpha);
    return im;
  }

  /* --------------------------------------------------------- helpers */
  function txt(sc, x, y, s, o) {
    o = o || {};
    var st = {
      fontFamily: FONT,
      fontSize: (o.size || TY.body.size) + 'px',
      fontStyle: o.weight || TY.body.weight,
      color: o.color || HEX.white,
      align: o.align || 'center',
      resolution: RETINA_FACTOR
    };
    if (o.wrap) { st.wordWrap = { width: o.wrap, useAdvancedWrap: true }; }
    var t = sc.add.text(x, y, s, st);
    if (o.ls) t.setLetterSpacing(o.ls);
    if (o.lh) t.setLineSpacing(o.lh);
    t.setOrigin(o.ox == null ? 0.5 : o.ox, o.oy == null ? 0.5 : o.oy);
    if (o.shadow) t.setShadow(0, 3, 'rgba(0,0,0,0.35)', 6);
    return t;
  }
  function ty(style, extra) {
    var o = { size: style.size, weight: style.weight, ls: style.ls, lh: style.lh };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function hexOf(intCol) { return '#' + ('000000' + intCol.toString(16)).slice(-6); }
  function shade(col, f) {
    var r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return (r << 16) | (g << 8) | b;
  }
  function fitText(t, maxW) {
    // auto-fit tracking then size so a long team name never clips
    t.setLetterSpacing(TY.label.ls);
    if (t.width <= maxW) return;
    t.setLetterSpacing(0.4);
    if (t.width <= maxW) return;
    t.setFontSize(TY.micro.size);
    if (t.width <= maxW) return;
    var s = t.text;
    while (s.length > 3 && t.width > maxW) { s = s.slice(0, -1); t.setText(s.replace(/\s+$/, '')); }
  }

  /* ------------------------------------------------- press component
   * ONE shared press/release behaviour for every hit target: buttons, icon
   * buttons, deck rows and the card. Press-down is 0.96 with a 5 px settle,
   * release pops with ease-out-back. Commit is bound to the pointer id that
   * started the press, and pointercancel / up-outside / pause all release
   * without committing. */
  function attachPress(sc, hit, moving, cfg) {
    cfg = cfg || {};
    var downScale = cfg.scale == null ? 0.96 : cfg.scale;
    var sinkY = cfg.sink == null ? 5 : cfg.sink;
    var baseY = moving.y;
    /* `armed` (the commit token) is deliberately separate from `down` (the
     * visual). On touch, Phaser processes the out event before the up event
     * of the same tap, so clearing the token on out would eat every tap. The
     * token is only dropped when the pointer is genuinely still down and has
     * left the target, or on cancel / pause / restart. */
    var st = { down: false, armed: false, pid: -1, enabled: true };
    hit.pressState = st;

    function visualDown() {
      st.down = true;
      sc.tweens.killTweensOf(moving);
      moving.y = baseY + sinkY;
      moving.setScale(downScale);
    }
    function visualUp(pop) {
      if (!st.down) return;
      st.down = false;
      sc.tweens.killTweensOf(moving);
      moving.y = baseY;
      if (pop && motionOK()) {
        sc.tweens.add({ targets: moving, scale: { from: downScale, to: 1 }, duration: 220, ease: 'Back.easeOut' });
      } else {
        moving.setScale(1);
      }
    }
    function release(pop) { st.armed = false; st.pid = -1; visualUp(pop); }
    st.release = release;
    registerPress(sc, function () { release(false); });

    function blocked() { return (kit.paused && !cfg.ignorePause) || !st.enabled || (cfg.blocked && cfg.blocked()); }

    hit.on('pointerdown', function (pointer) {
      if (blocked() || st.armed) return;
      st.armed = true; st.pid = pointer.id;
      visualDown();
      if (cfg.onDown) cfg.onDown();
    });
    hit.on('pointerup', function (pointer) {
      if (!st.armed || pointer.id !== st.pid) return;
      var wasBlocked = blocked();
      release(true);
      if (!wasBlocked && cfg.onClick) cfg.onClick();
    });
    hit.on('pointerupoutside', function (pointer) {
      if (st.armed && pointer && pointer.id !== st.pid) return;
      release(true);
    });
    hit.on('pointerout', function (pointer) {
      // a real drag off the target cancels; a touch ending on the target
      // reports out first and must NOT cancel
      if (pointer && pointer.isDown) release(true); else visualUp(true);
    });
    hit.on('pointercancel', function () { release(false); });
    return st;
  }

  /* Chunky flat button: baked face, depth shadow, gloss, press component */
  function makeBtn(sc, cfg) {
    var w = cfg.w, h = cfg.h, r = cfg.radius == null ? 18 : cfg.radius;
    var tok = cfg.ty || TY.btnMd;
    var c = sc.add.container(cfg.x, cfg.y);
    var shadow = sc.add.image(0, 7, texRR(sc, w, h, r)).setDisplaySize(w, h);
    var face = sc.add.image(0, 0, texRR(sc, w, h, r)).setDisplaySize(w, h);
    var gloss = sc.add.image(0, -h / 2 + 3 + h * 0.21, texRRTop(sc, w - 6, Math.max(6, h * 0.42), Math.max(4, r - 3)))
      .setDisplaySize(w - 6, h * 0.42).setAlpha(0.15);
    var label = txt(sc, 0, cfg.sub ? -9 : 0, cfg.label, ty(tok, { color: cfg.color || HEX.white }));
    var sub = cfg.sub ? txt(sc, 0, 15, cfg.sub, ty(TY.btnSub, { color: cfg.subColor || 'rgba(255,255,255,0.72)' })) : null;
    var kids = [face, gloss, label];
    if (sub) kids.push(sub);
    var inner = sc.add.container(0, 0, kids);
    c.add([shadow, inner]);
    c.state = { fill: cfg.fill, enabled: true };

    function paint() {
      var fill = c.state.enabled ? c.state.fill : shade(c.state.fill, 0.45);
      shadow.setTint(shade(fill, 0.42));
      face.setTint(fill);
      label.setAlpha(c.state.enabled ? 1 : 0.45);
      if (sub) sub.setAlpha(c.state.enabled ? 1 : 0.35);
    }
    paint();

    c.setSize(w, h + 7);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h + 7), Phaser.Geom.Rectangle.Contains);
    var st = attachPress(sc, c, inner, {
      ignorePause: cfg.ignorePause,
      blocked: cfg.blocked,
      onDown: function () { kit.audio.sfx('tap', { volume: 0.5 }); },
      onClick: cfg.onClick
    });

    c.setFill = function (f) { c.state.fill = f; paint(); };
    c.setEnabled = function (v) { c.state.enabled = !!v; st.enabled = !!v; paint(); };
    c.setLabel = function (s) { label.setText(s); };
    c.setSub = function (s) { if (sub) sub.setText(s); };
    c.labelObj = label;
    c.inner = inner;
    return c;
  }

  function makeSegments(sc, x, y, w, h, items, initial, onPick) {
    var c = sc.add.container(x, y);
    var gap = 8, n = items.length;
    var bw = (w - gap * (n - 1)) / n;
    var btns = [];
    c.value = initial;
    function repaint() {
      btns.forEach(function (b, i) {
        b.setFill(i === c.value ? C.violet : C.slateDark);
        b.labelObj.setColor(i === c.value ? HEX.white : HEX.dim);
      });
    }
    items.forEach(function (it, i) {
      var bx = -w / 2 + bw / 2 + i * (bw + gap);
      var b = makeBtn(sc, {
        x: bx, y: 0, w: bw, h: h, radius: 14, label: it, ty: TY.btnSm,
        fill: C.slateDark,
        onClick: function () { c.value = i; repaint(); kit.audio.sfx('select', { volume: 0.5 }); if (onPick) onPick(i); }
      });
      btns.push(b); c.add(b);
    });
    repaint();
    c.select = function (i) { c.value = i; repaint(); };
    return c;
  }

  function makeIconBtn(sc, x, y, glyph, onClick) {
    var c = sc.add.container(x, y);
    var disc = sc.add.image(0, 0, texCircle(sc, 19)).setAlpha(0.14);
    var ring = sc.add.image(0, 0, texCircleLine(sc, 19, 2)).setAlpha(0.3);
    var t = txt(sc, 0, 1, glyph, ty(TY.micro, { color: HEX.white }));
    var inner = sc.add.container(0, 0, [disc, ring, t]);
    c.add(inner);
    c.setSize(44, 44);
    c.setInteractive(new Phaser.Geom.Rectangle(-22, -22, 44, 44), Phaser.Geom.Rectangle.Contains);
    attachPress(sc, c, inner, {
      sink: 2,
      onDown: function () { kit.audio.sfx('tap', { volume: 0.4 }); },
      onClick: onClick
    });
    c.label = t;
    return c;
  }

  /* --------------------------------------------------- authored mascot */
  function bakeMascot(sc) {
    canvasTex(sc, 'mascotBody', 128, 112, function (ctx) {
      ctx.clearRect(0, 0, 128, 112);
      // handle
      ctx.fillStyle = '#e5d8ff';
      rrPath(ctx, 10, 42, 22, 30, 8); ctx.fill();
      // cone with a soft internal light ramp
      var g = ctx.createLinearGradient(28, 0, 100, 0);
      g.addColorStop(0, '#fff6ec'); g.addColorStop(1, '#e2d2ff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(28, 34); ctx.lineTo(98, 8); ctx.lineTo(98, 104); ctx.lineTo(28, 78);
      ctx.closePath(); ctx.fill();
      // bell rim
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath(); ctx.ellipse(98, 56, 10, 48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(26,15,61,0.25)';
      ctx.beginPath(); ctx.ellipse(98, 56, 6, 40, 0, 0, Math.PI * 2); ctx.fill();
      // face
      ctx.fillStyle = '#1a0f3d';
      ctx.beginPath(); ctx.arc(58, 50, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(76, 43, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a0f3d'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(67, 66, 10, 0.15, Math.PI - 0.15); ctx.stroke();
      // rim light
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(30, 36); ctx.lineTo(96, 11); ctx.stroke();
    });
    canvasTex(sc, 'mascotArcs', 132, 112, function (ctx) {
      ctx.clearRect(0, 0, 132, 112);
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        ctx.lineWidth = 5 - i * 0.6;
        ctx.globalAlpha = 0.9 - i * 0.22;
        ctx.beginPath(); ctx.arc(10, 56, 18 + i * 14, -0.75, 0.75); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }
  function makeMascot(sc, x, y, scale) {
    bakeMascot(sc);
    var c = sc.add.container(x, y);
    var arcs = sc.add.image(52, 0, 'mascotArcs').setOrigin(0, 0.5).setAlpha(0.85).setTint(C.violet);
    var body = sc.add.image(-6, 0, 'mascotBody');
    c.add([arcs, body]);
    c.setScale(scale);
    var idle = loopTween(sc, {
      targets: c, y: y - 7, angle: 2.5, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    var pulse = loopTween(sc, {
      targets: arcs, scaleX: 1.14, scaleY: 1.1, alpha: 0.6,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    c.anim = function (state) {
      if (!motionOK()) return;
      if (state === 'shout') {
        sc.tweens.killTweensOf(body);
        body.setScale(1);
        sc.tweens.add({ targets: body, scaleX: 1.22, scaleY: 0.84, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        pulse.timeScale = 3.2;
        sc.time.delayedCall(600, function () { pulse.timeScale = 1; });
      } else if (state === 'sulk') {
        sc.tweens.add({ targets: c, angle: -16, duration: 260, ease: 'Back.easeOut', yoyo: true, hold: 700 });
        pulse.timeScale = 0.35;
        sc.time.delayedCall(1200, function () { pulse.timeScale = 1; });
      } else if (state === 'cheer') {
        sc.tweens.add({ targets: c, y: { from: y, to: y - 34 }, duration: 260, yoyo: true, repeat: 2, ease: 'Quad.easeOut' });
        sc.tweens.add({ targets: body, angle: 360, duration: 620, ease: 'Cubic.easeInOut' });
        pulse.timeScale = 2.4;
        sc.time.delayedCall(1400, function () { pulse.timeScale = 1; });
      }
    };
    c.once('destroy', function () { idle.remove(); pulse.remove(); });
    return c;
  }

  /* ------------------------------------------------ FX: pooled primitives
   * No PNG sprite is used for any effect. Five families, each built from
   * baked primitive quads (strips, diamonds, triangles, rings, burst arcs),
   * 10-16 instances per burst, recycled from one pool and advanced by a
   * single integrator so a celebration allocates nothing. */
  function bakeFx(sc) {
    bake(sc, 'fxStrip', 16, 6, function (g) { g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 16, 6, 3); });
    bake(sc, 'fxDiamond', 16, 16, function (g) {
      g.fillStyle(0xffffff, 1);
      g.beginPath(); g.moveTo(8, 0); g.lineTo(16, 8); g.lineTo(8, 16); g.lineTo(0, 8); g.closePath(); g.fillPath();
    });
    bake(sc, 'fxTri', 16, 16, function (g) {
      g.fillStyle(0xffffff, 1);
      g.beginPath(); g.moveTo(8, 0); g.lineTo(16, 15); g.lineTo(0, 15); g.closePath(); g.fillPath();
    });
    bake(sc, 'fxRing', 20, 20, function (g) { g.lineStyle(3, 0xffffff, 1); g.strokeCircle(10, 10, 8); });
    bake(sc, 'fxArc', 24, 24, function (g) {
      g.lineStyle(4, 0xffffff, 1);
      g.beginPath(); g.arc(12, 12, 9, -0.9, 0.9); g.strokePath();
    });
    bake(sc, 'fxDot', 12, 12, function (g) { g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 6); });
  }

  function makeFX(sc, depth, cap) {
    bakeFx(sc);
    var MAX = cap || 96;
    var pool = [], live = [];
    for (var i = 0; i < MAX; i++) {
      var im = sc.add.image(-999, -999, 'fxStrip').setVisible(false).setDepth(depth == null ? 40 : depth);
      pool.push(im);
    }
    function take() { return pool.length ? pool.pop() : null; }
    function give(p) { p.im.setVisible(false).setPosition(-999, -999); pool.push(p.im); }
    var shockPool = [], shockLive = [];
    for (var si = 0; si < 4; si++) {
      shockPool.push({ im: sc.add.image(-999, -999, texCircleLine(sc, 60, 8))
        .setVisible(false).setDepth(55).setBlendMode(Phaser.BlendModes.ADD) });
    }
    function giveShock(s) {
      s.im.setVisible(false).setPosition(-999, -999);
      shockPool.push(s);
    }

    var FAM = {
      /* correct guess: team-coloured strips + diamonds, thrown up and out */
      correct: { shapes: ['fxStrip', 'fxStrip', 'fxDiamond'], n: 16, spd: [180, 430], ang: [200, 340], g: 980, life: [0.75, 1.25], sc: [0.5, 1.0], spin: [-9, 9], flutter: true },
      /* pass: cool rings + triangles pushed straight outward, no gravity */
      pass: { shapes: ['fxRing', 'fxTri'], n: 12, spd: [90, 240], ang: [0, 360], g: 0, life: [0.35, 0.6], sc: [0.4, 0.9], spin: [-5, 5], grow: 1.9 },
      /* buzzer: hot burst arcs + triangles, heavy, radial, contact-coloured */
      buzzer: { shapes: ['fxArc', 'fxTri', 'fxDot'], n: 16, spd: [220, 560], ang: [0, 360], g: 760, life: [0.5, 0.95], sc: [0.6, 1.3], spin: [-14, 14] },
      /* victory: long-lived confetti, team-aware, flutters as it falls */
      victory: { shapes: ['fxStrip', 'fxStrip', 'fxDiamond', 'fxTri'], n: 16, spd: [150, 420], ang: [200, 340], g: 520, life: [1.6, 2.4], sc: [0.5, 1.1], spin: [-8, 8], flutter: true },
    };

    function rand(r) { return r[0] + Math.random() * (r[1] - r[0]); }

    var api = {
      burst: function (kind, x, y, tints, dirDeg, power) {
        if (!motionOK()) return;
        var f = FAM[kind];
        if (!f) return;
        var n = Math.round(f.n * (power == null ? 1 : power));
        for (var i = 0; i < n; i++) {
          var im = take();
          if (!im) return;
          var sh = f.shapes[(Math.random() * f.shapes.length) | 0];
          var a = dirDeg == null
            ? Phaser.Math.DegToRad(rand(f.ang))
            : Phaser.Math.DegToRad(dirDeg + (Math.random() * 70 - 35));
          var sp = rand(f.spd);
          var s0 = rand(f.sc);
          im.setTexture(sh).setVisible(true).setPosition(x, y).setAlpha(1);
          im.setTint(tints && tints.length ? tints[(Math.random() * tints.length) | 0] : 0xffffff);
          im.setScale(s0).setAngle(Math.random() * 360);
          im.setBlendMode(kind === 'buzzer' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
          live.push({
            im: im, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: f.g,
            t: 0, life: rand(f.life), s0: s0, grow: f.grow || 1,
            vr: rand(f.spin) * 57, flutter: !!f.flutter, ph: Math.random() * 6.28
          });
        }
      },
      /* expanding shockwave ring, used for the buzzer contact beat */
      shock: function (x, y, col, size, ms) {
        if (!motionOK()) return;
        var s = shockPool.pop();
        if (!s) return;
        var ring = s.im;
        ring.setVisible(true).setPosition(x, y).setDisplaySize(40, 40).setTint(col).setAlpha(1);
        shockLive.push(s);
        sc.tweens.add({
          targets: ring, displayWidth: size, displayHeight: size, alpha: 0,
          duration: ms, ease: 'Cubic.easeOut', onComplete: function () {
            var at = shockLive.indexOf(s);
            if (at >= 0) shockLive.splice(at, 1);
            giveShock(s);
          }
        });
      },
      update: function (dt) {
        for (var i = live.length - 1; i >= 0; i--) {
          var p = live[i];
          p.t += dt;
          if (p.t >= p.life) { give(p); live.splice(i, 1); continue; }
          p.vy += p.g * dt;
          var im = p.im;
          im.x += p.vx * dt;
          im.y += p.vy * dt;
          im.angle += p.vr * dt;
          var k = p.t / p.life;
          im.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
          var s = p.s0 * (1 + (p.grow - 1) * k);
          if (p.flutter) im.setScale(s * Math.cos(p.ph + p.t * 11) * 0.9 + s * 0.1, s);
          else im.setScale(s);
        }
      },
      clear: function () {
        for (var i = live.length - 1; i >= 0; i--) { give(live[i]); }
        live.length = 0;
        for (var j = shockLive.length - 1; j >= 0; j--) {
          sc.tweens.killTweensOf(shockLive[j].im);
          giveShock(shockLive[j]);
        }
        shockLive.length = 0;
      },
      liveCount: function () { return live.length; }
    };
    sc.events.once('shutdown', function () {
      live.length = 0; pool.length = 0; shockLive.length = 0; shockPool.length = 0;
    });
    return api;
  }

  /* ------------------------------------------------------ match state */
  var M = {
    teams: [], target: 7, holder: 0, roundNo: 1, history: [], winner: -1,
    pool: [], pi: 0, cur: null, dur: 60, left: 60, skips: 0
  };

  /* Small, stable verification surface. It describes the live game state,
   * never a second debug view or a renderer-owned entity. */
  var SI_STATE = { mode: 'title', clue: '', scores: [], timerRunning: false };
  var forceBuzzPending = false;
  function syncSI(mode) {
    if (mode) SI_STATE.mode = mode;
    SI_STATE.clue = M.cur ? M.cur.text : '';
    SI_STATE.scores = M.teams.map(function (t) { return t.pts; });
    SI_STATE.timerRunning = !!(playScene && playScene.clkRunning && playScene.handoff <= 0);
  }
  function requestForceBuzz() {
    if (playScene && typeof playScene.forceBuzz === 'function') playScene.forceBuzz();
    else forceBuzzPending = true;
  }
  if (typeof window !== 'undefined') {
    window.__si = { state: SI_STATE, forceBuzzNow: requestForceBuzz };
    Object.defineProperty(window.__si, 'forceBuzz', {
      configurable: true,
      get: function () { return false; },
      set: function (v) { if (v) requestForceBuzz(); }
    });
    Object.defineProperty(SI_STATE, 'forceBuzz', {
      configurable: true,
      get: function () { return false; },
      set: function (v) { if (v) requestForceBuzz(); }
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function buildPool() {
    var out = [];
    activeDecks().forEach(function (id) {
      var d = DECK_BY_ID[id];
      d.phrases.forEach(function (p) { out.push({ text: p, cat: d.name, col: d.color, mi: DECK_INDEX[id] }); });
    });
    M.pool = shuffle(out); M.pi = 0;
  }
  function nextPhrase() {
    if (M.pi >= M.pool.length) {
      var prev = M.cur;
      buildPool();
      // never repeat the just-shown phrase across a reshuffle (prototype rule)
      if (prev && M.pool.length > 1 && M.pool[0].text === prev.text) {
        var sw = M.pool[0]; M.pool[0] = M.pool[1]; M.pool[1] = sw;
      }
    }
    M.cur = M.pool[M.pi++];
  }
  function newMatch() {
    var n = SAVE.teamCount;
    var names = shuffle(SHOUT_TEAM_NAMES.slice()).slice(0, n);
    M.teams = [];
    for (var i = 0; i < n; i++) {
      var t = SHOUT_TEAM_COLORS[i];
      M.teams.push({
        name: names[i], color: t.color, glow: t.glow, hex: hexOf(t.color),
        pts: 0, got: 0, roundGot: 0
      });
    }
    M.target = 7;
    M.roundNo = 1; M.history = []; M.winner = -1;
    M.holder = (Math.random() * n) | 0;
    buildPool();
    startRound();
  }
  function startRound() {
    M.teams.forEach(function (t) { t.roundGot = 0; });
    var hi = Math.max(55, MAX_T - 4 * (M.roundNo - 1));   // ramp; band stays inside 45-75
    M.dur = MIN_T + Math.random() * (hi - MIN_T);
    M.left = M.dur;
    M.skips = 0;
    nextPhrase();
    if (playScene) {
      playScene.tickAcc = 0;
      playScene.crowdAcc = 0;
      playScene.tense = 0;
    }
    syncSI();
  }
  function nextHolder(i) { return (i + 1) % M.teams.length; }
  function teamTints(t) {
    return t ? [t.color, C.paper, C.violet, shade(t.color, 1.3)] : [C.paper, C.violet];
  }

  /* ------------------------------------------------------ scene utils */
  function wantMusic(name) {
    musicWant = name;
    if (musicArmed) kit.audio.music(name, 700);
  }
  function armMusic() {
    if (musicArmed) return;
    musicArmed = true;
    if (musicWant) kit.audio.music(musicWant, 700);
  }
  function goto(key, data) {
    if (activeKey && game.scene.isActive(activeKey)) game.scene.stop(activeKey);
    activeKey = key;
    game.scene.start(key, data);
  }
  /* Defect class: an orientation/visibility pause raised before Phaser
   * existed leaves the first scene running. Re-apply the kit state on every
   * scene entry AND once the game instance is ready. */
  function syncPause() {
    if (!game || !activeKey) return;
    if (kit.paused) { if (game.scene.isActive(activeKey)) game.scene.pause(activeKey); }
    else if (game.scene.isPaused(activeKey)) game.scene.resume(activeKey);
  }
  function sceneEnter(sc) {
    sc.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    sc.time.delayedCall(0, syncPause);
  }
  function juiceFrame(sc) {
    var j = kit.juice.frame();
    sc.cameras.main.setScroll(j.dx, j.dy);
    return j;
  }
  function bindKeys(sc, map) {
    var kb = sc.input.keyboard;
    function on(list, fn) {
      if (!fn) return;
      list.forEach(function (k) {
        kb.on('keydown-' + k, function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (!kit.paused) fn();
        });
      });
    }
    // preserved prototype mapping
    on(['SPACE', 'ENTER', 'RIGHT', 'UP', 'D', 'W'], map.got || map.confirm);
    on(['LEFT', 'DOWN', 'A', 'S', 'P', 'BACKSPACE'], map.pass || map.cancel);
    on(['R'], map.restart);
    on(['ESC'], map.pause || map.cancel);
    kb.on('keydown-M', function () { kit.audio.setMute(!kit.audio.prefs.mute); if (map.mute) map.mute(); });
    kb.on('keydown', armMusic);
  }
  function shakeText(sc, obj) {
    if (!motionOK()) return;
    sc.tweens.add({ targets: obj, x: obj.x + 6, duration: 55, yoyo: true, repeat: 2 });
  }
  /* ----------------------------------------------- themed shell surfaces
   * GGKit remains the only loader / settings / lifecycle implementation.
   * These two functions re-skin the shells it creates so they speak the
   * title's visual language instead of the kit's system look. */
  function shellStyles() {
    if (document.getElementById('si-shell-css')) return;
    var s = document.createElement('style');
    s.id = 'si-shell-css';
    s.textContent =
      '@keyframes si-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}' +
      '@keyframes si-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}' +
      '.si-cone{width:0;height:0;border-top:26px solid transparent;border-bottom:26px solid transparent;' +
      'border-left:52px solid #fff6ec;border-radius:6px;animation:si-bob 1.8s ease-in-out infinite}' +
      '@media (prefers-reduced-motion: reduce){.si-cone{animation:none}}';
    document.head.appendChild(s);
  }
  function brandLoader() {
    shellStyles();
    var box = document.querySelector('div[style*="z-index:9000"]');
    if (!box) return;
    box.style.background = 'linear-gradient(170deg,#3a1f7a 0%,#241456 46%,#100826 100%)';
    box.style.color = '#fff6ec';
    box.style.gap = '0';
    var kids = box.children;
    var h = kids[0], track = kids[1];
    if (h) h.style.display = 'none';
    var art = document.createElement('div');
    art.style.cssText = 'display:flex;align-items:center;justify-content:center;margin-bottom:26px;';
    var cone = document.createElement('div');
    cone.className = 'si-cone';
    art.appendChild(cone);
    var lock = document.createElement('div');
    lock.style.cssText = 'font-weight:900;letter-spacing:-1.5px;line-height:0.92;text-align:left;margin-left:14px;';
    lock.innerHTML = '<div style="font-size:38px;color:#fff6ec">SHOUT</div>' +
      '<div style="font-size:38px;color:#c4b5fd">IT!</div>';
    art.appendChild(lock);
    box.insertBefore(art, track || null);
    if (track) {
      track.style.cssText = 'width:min(66vw,300px);height:10px;border-radius:5px;' +
        'background:rgba(255,255,255,0.14);overflow:hidden;position:relative;';
      var bar = track.firstElementChild;
      if (bar) {
        bar.style.background = 'linear-gradient(90deg,#8b5cf6,#c4b5fd)';
        bar.style.borderRadius = '5px';
        bar.style.transition = 'width .18s ease-out';
      }
      var sweep = document.createElement('div');
      sweep.style.cssText = 'position:absolute;inset:0;background:linear-gradient(90deg,' +
        'transparent,rgba(255,255,255,0.35),transparent);animation:si-sweep 1.5s linear infinite;';
      track.appendChild(sweep);
    }
    var tag = document.createElement('div');
    tag.style.cssText = 'margin-top:20px;font-size:11px;font-weight:800;letter-spacing:2.6px;color:#a294d8;';
    tag.textContent = 'MIXING THE CATEGORIES';
    box.appendChild(tag);
  }
  function themeSettings(box) {
    if (!box) return;
    box.style.background = 'linear-gradient(170deg,rgba(58,31,122,0.97) 0%,rgba(18,10,44,0.98) 100%)';
    box.style.color = '#fff6ec';
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.tagName === 'BUTTON') {
        var isClose = i === kids.length - 1;
        k.style.cssText = 'font:inherit;font-size:16px;font-weight:800;letter-spacing:0.4px;' +
          (isClose
            ? 'color:#1a0f3d;background:#fff6ec;'
            : 'color:#fff6ec;background:rgba(255,255,255,0.09);border:2px solid rgba(255,255,255,0.16);') +
          'border-radius:16px;padding:14px 18px;min-width:min(72vw,290px);' +
          (isClose ? 'border:0;margin-top:6px;' : '');
      } else if (i === 0) {
        k.style.cssText = 'font-size:27px;font-weight:900;letter-spacing:-0.4px;color:#fff6ec;margin-bottom:4px;';
      }
    }
  }
  function openSettings() {
    var box = kit.openSettings([function (b, row) {
      var fs = document.createElement('button');
      fs.textContent = 'Fullscreen';
      fs.addEventListener('click', function () { kit.requestFullscreen(); });
      b.appendChild(fs);
    }]);
    themeSettings(box);
    return box;
  }

  /* ------------------------------------------------------------ boot
   * The background is ONE opaque baked image: gradient, colour blooms,
   * vignette and grain are all resolved at bake time. Under the gate's
   * software renderer, three live ADD-blended blooms cost more than the
   * whole rest of the frame. */
  function bakeBackground(sc) {
    canvasTex(sc, 'bgGrad', DW, DH, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, DW * 0.4, DH);
      g.addColorStop(0, '#3a1f7a');
      g.addColorStop(0.42, '#241456');
      g.addColorStop(1, '#100826');
      ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);

      var blooms = [
        [70, 150, 210, 'rgba(255,93,115,0.20)'],
        [332, 386, 250, 'rgba(34,211,238,0.15)'],
        [150, 726, 290, 'rgba(139,92,246,0.24)'],
        [300, 560, 180, 'rgba(196,181,253,0.10)']
      ];
      ctx.globalCompositeOperation = 'lighter';
      blooms.forEach(function (b) {
        var r = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
        r.addColorStop(0, b[3]);
        r.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = r; ctx.fillRect(b[0] - b[2], b[1] - b[2], b[2] * 2, b[2] * 2);
      });
      ctx.globalCompositeOperation = 'source-over';

      var v = ctx.createRadialGradient(DW / 2, DH * 0.42, DW * 0.25, DW / 2, DH * 0.5, DH * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, DW, DH);

      var rd = rng(9137);
      ctx.fillStyle = 'rgba(255,255,255,0.028)';
      for (var i = 0; i < 1800; i++) {
        ctx.fillRect((rd() * DW) | 0, (rd() * DH) | 0, 1, 1);
      }
    });
    canvasTex(sc, 'softGlow', 96, 96, function (ctx) {
      var r = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.45, 'rgba(255,255,255,0.32)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, 96, 96);
    });
  }

  /* --------------------------------------------------- authored card art */
  var CARD = { w: 344, h: 410, r: 28, x: DW / 2, y: 396 };
  var CARD_PAD_X = 18, CARD_PAD_TOP = 10, CARD_PAD_BOT = 30;
  var CARD_TEX_W = CARD.w + CARD_PAD_X * 2;
  var CARD_TEX_H = CARD.h + CARD_PAD_TOP + CARD_PAD_BOT;

  function bakeCard(sc) {
    var W = CARD.w, H = CARD.h, R = CARD.r, X = CARD_PAD_X, Y = CARD_PAD_TOP;
    /* FACE: paper stock with fibre grain, layered lighting, an inner edge
     * treatment and a soft drop shadow, all in ONE texture so the card is a
     * single quad on screen. */
    canvasTex(sc, 'cardFace', CARD_TEX_W, CARD_TEX_H, function (ctx) {
      ctx.save();
      ctx.shadowColor = 'rgba(5,2,18,0.55)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 14;
      rrPath(ctx, X, Y, W, H, R);
      ctx.fillStyle = '#fff6ec'; ctx.fill();
      ctx.restore();

      ctx.save();
      rrPath(ctx, X, Y, W, H, R); ctx.clip();
      var g = ctx.createLinearGradient(0, Y, 0, Y + H);
      g.addColorStop(0, '#fffcf6');
      g.addColorStop(0.55, '#fff4e7');
      g.addColorStop(1, '#f0e1d0');
      ctx.fillStyle = g; ctx.fillRect(X, Y, W, H);
      // key light from the upper left
      var kl = ctx.createRadialGradient(X + W * 0.24, Y + H * 0.16, 10, X + W * 0.24, Y + H * 0.16, W * 0.95);
      kl.addColorStop(0, 'rgba(255,255,255,0.75)');
      kl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = kl; ctx.fillRect(X, Y, W, H);
      // paper fibre grain
      var rd = rng(20260806);
      ctx.fillStyle = 'rgba(90,60,30,0.05)';
      for (var i = 0; i < 2400; i++) ctx.fillRect(X + rd() * W, Y + rd() * H, 1, 1);
      ctx.strokeStyle = 'rgba(120,86,52,0.045)'; ctx.lineWidth = 1;
      for (i = 0; i < 90; i++) {
        var fx = X + rd() * W, fy = Y + rd() * H, fl = 8 + rd() * 26, fa = rd() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
        ctx.stroke();
      }
      // bottom shade so the stock reads as a physical slab
      var sh = ctx.createLinearGradient(0, Y + H - 130, 0, Y + H);
      sh.addColorStop(0, 'rgba(80,50,20,0)');
      sh.addColorStop(1, 'rgba(80,50,20,0.10)');
      ctx.fillStyle = sh; ctx.fillRect(X, Y, W, H);
      ctx.restore();

      // inner edge treatment: bright inset then a hairline ink keyline
      ctx.save();
      rrPath(ctx, X + 4, Y + 4, W - 8, H - 8, R - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
      rrPath(ctx, X + 9, Y + 9, W - 18, H - 18, R - 8);
      ctx.strokeStyle = 'rgba(26,15,61,0.09)'; ctx.lineWidth = 1.5; ctx.stroke();
      rrPath(ctx, X + 0.75, Y + 0.75, W - 1.5, H - 1.5, R);
      ctx.strokeStyle = 'rgba(26,15,61,0.14)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    });

    /* BACK: an original reversible pattern. The tile grid is drawn once and
     * then drawn again rotated 180 degrees about the card centre, so a
     * face-down card is identical either way up and leaks no orientation. */
    canvasTex(sc, 'cardBack', CARD_TEX_W, CARD_TEX_H, function (ctx) {
      ctx.save();
      ctx.shadowColor = 'rgba(5,2,18,0.55)';
      ctx.shadowBlur = 20; ctx.shadowOffsetY = 14;
      rrPath(ctx, X, Y, W, H, R);
      ctx.fillStyle = '#2c1a63'; ctx.fill();
      ctx.restore();

      ctx.save();
      rrPath(ctx, X, Y, W, H, R); ctx.clip();
      var g = ctx.createLinearGradient(X, Y, X + W, Y + H);
      g.addColorStop(0, '#3d2585');
      g.addColorStop(1, '#1c1046');
      ctx.fillStyle = g; ctx.fillRect(X, Y, W, H);

      function halfPattern() {
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        for (var ry = 0; ry < 7; ry++) {
          for (var rx = 0; rx < 6; rx++) {
            var px = X + 30 + rx * 58, py = Y + 34 + ry * 58;
            ctx.beginPath();
            ctx.moveTo(px - 11, py + 7); ctx.lineTo(px, py - 7); ctx.lineTo(px + 11, py + 7);
            ctx.stroke();
            ctx.fillStyle = 'rgba(196,181,253,0.14)';
            ctx.beginPath(); ctx.arc(px + 29, py + 29, 3.2, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      halfPattern();
      ctx.save();
      ctx.translate(X + W / 2, Y + H / 2); ctx.rotate(Math.PI); ctx.translate(-(X + W / 2), -(Y + H / 2));
      halfPattern();
      ctx.restore();

      // centre emblem, itself 180-degree symmetric
      ctx.save();
      ctx.translate(X + W / 2, Y + H / 2);
      ctx.strokeStyle = 'rgba(255,246,236,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(196,181,253,0.42)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,246,236,0.72)';
      for (var q = 0; q < 2; q++) {
        ctx.save(); ctx.rotate(Math.PI * q);
        ctx.beginPath();
        ctx.moveTo(-6, -34); ctx.lineTo(30, -12); ctx.lineTo(-6, -12);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      var vg = ctx.createRadialGradient(X + W / 2, Y + H / 2, W * 0.2, X + W / 2, Y + H / 2, W * 0.9);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = vg; ctx.fillRect(X, Y, W, H);
      ctx.restore();

      ctx.save();
      rrPath(ctx, X + 4, Y + 4, W - 8, H - 8, R - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    });

    /* deck-select tile: card back at thumbnail scale */
    canvasTex(sc, 'backTile', 96, 96, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, 96, 96);
      g.addColorStop(0, '#3d2585'); g.addColorStop(1, '#1c1046');
      rrPath(ctx, 0, 0, 96, 96, 16); ctx.fillStyle = g; ctx.fill();
      ctx.save(); rrPath(ctx, 0, 0, 96, 96, 16); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (var ry = 0; ry < 3; ry++) {
        for (var rx = 0; rx < 3; rx++) {
          var px = 20 + rx * 30, py = 22 + ry * 30;
          ctx.beginPath();
          ctx.moveTo(px - 7, py + 5); ctx.lineTo(px, py - 5); ctx.lineTo(px + 7, py + 5);
          ctx.stroke();
        }
      }
      ctx.restore();
      rrPath(ctx, 1.2, 1.2, 93.6, 93.6, 15);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2.4; ctx.stroke();
    });

  }

  var BootScene = {
    key: 'boot',
    preload: function () {
      kit.loader.show('Shout It!');
      brandLoader();
    },
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      var self = this;
      kit.audio.register(AUDIO);
      /* Every bake is a discrete step on its own frame. One monolithic boot
       * create is the single largest spike a Phaser title can produce. */
      var bakes = [
        function () { bakeBackground(self); },
        function () { bakeCard(self); },
        function () { bakeMascot(self); bakeFx(self); texPx(self); },
        function () { for (var i = 0; i < SHOUT_DECKS.length; i++) motifKey(self, i); },
        function () {
          // pre-bake every rounded surface the game will ask for later, so no
          // scene create ever pays for a Graphics tessellation
          var rr = [[344, 62, 28], [292, 100, 26], [300, 96, 26], [300, 92, 24], [280, 76, 22],
            [280, 64, 20], [250, 62, 20], [250, 58, 18], [220, 58, 18], [200, 52, 16],
            [168, 66, 20], [168, 52, 16], [175, 52, 14], [175, 46, 14], [122, 108, 24],
            [220, 108, 24], [120, 40, 14], [342, 64, 16], [342, 104, 18], [342, 116, 20],
            [96, 32, 10], [46, 46, 12], [8, 64, 4], [64, 116, 8], [76, 132, 12]];
          rr.forEach(function (d) { texRR(self, d[0], d[1], d[2]); });
          [[342, 64, 16, 2], [342, 116, 20, 2], [342, 66, 18, 2], [175, 52, 14, 2], [175, 46, 14, 2],
            [46, 46, 12, 2]].forEach(function (d) { texRRLine(self, d[0], d[1], d[2], d[3]); });
          [19, 17, 11, 60, 34, 32].forEach(function (r) { texCircle(self, r); });
          [[19, 2], [60, 8], [32, 9], [34, 4]].forEach(function (d) { texCircleLine(self, d[0], d[1]); });
        }
      ];
      var fonts = [
        [62, 38, 30], [27, 20, 15], [13, 11, 10], PHRASE_STEPS
      ];

      var warm = this.add.container(-900, -900);
      var stage = 0, total = bakes.length + fonts.length + SFX_NAMES.length;
      function progress(n) { kit.loader.progress(Math.min(1, n / total)); }

      function stepBake() {
        if (stage < bakes.length) {
          bakes[stage]();
          stage++;
          progress(stage);
          self.time.delayedCall(0, stepBake);
          return;
        }
        var fi = stage - bakes.length;
        if (fi < fonts.length) {
          fonts[fi].forEach(function (s) {
            warm.add(self.add.text(0, 0, 'Shout It 0123', { fontFamily: FONT, fontSize: s + 'px', fontStyle: '900', resolution: RETINA_FACTOR }));
          });
          stage++;
          progress(stage);
          self.time.delayedCall(0, stepBake);
          return;
        }
        stepAudio(0);
      }
      function stepAudio(i) {
        if (i >= SFX_NAMES.length) {
          progress(total);
          self.time.delayedCall(120, function () {
            warm.destroy(true);
            kit.loader.hide();
            self.scene.launch('bg');
            activeKey = 'title';
            self.scene.start('title');
          });
          return;
        }
        kit.audio.preload([SFX_NAMES[i]]).then(function () {
          progress(bakes.length + fonts.length + i + 1);
          stepAudio(i + 1);
        });
      }
      stepBake();
    }
  };

  /* ------------------------------------------- persistent background
   * One opaque baked image plus four small drifting accents. Nothing here
   * blends across more than a few thousand pixels a frame. */
  var BgScene = {
    key: 'bg',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      this.add.image(0, 0, 'bgGrad').setOrigin(0, 0);
      var self = this;
      var accents = [
        { x: 74, y: 190, s: 1.15, c: 0xff5d73, a: 0.16 },
        { x: 322, y: 420, s: 1.3, c: 0x22d3ee, a: 0.13 },
        { x: 150, y: 690, s: 1.45, c: 0x8b5cf6, a: 0.18 }
      ];
      accents.forEach(function (b, i) {
        var s = self.add.image(b.x, b.y, 'softGlow').setScale(b.s).setTint(b.c)
          .setAlpha(b.a).setBlendMode(Phaser.BlendModes.ADD);
        loopTween(self, {
          targets: s, x: b.x + (i % 2 ? -52 : 62), y: b.y + (i % 2 ? 52 : -44),
          scale: b.s * 1.16, duration: 9000 + i * 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      });
      // ambient motes: the one live particle system, tiny quads only
      if (motionOK()) {
        this.add.particles(0, 0, 'fxDot', {
          x: { min: 0, max: DW }, y: DH + 20,
          lifespan: 9000, speedY: { min: -34, max: -14 }, speedX: { min: -10, max: 10 },
          scale: { start: 0.5, end: 0.05 }, alpha: { start: 0.3, end: 0 },
          tint: [0xc4b5fd, 0xfff6ec],
          frequency: 900, quantity: 1
        });
      }
    }
  };

  /* ------------------------------------------------------ title menu */
  var TitleScene = {
    key: 'title',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      var self = this;
      sceneEnter(this);
      wantMusic('music_lobby');
      this.input.once('pointerdown', armMusic);

      var lg1 = txt(this, DW / 2, 128, 'SHOUT', ty(TY.display, { color: HEX.paper, shadow: 1 }));
      var lg2 = txt(this, DW / 2, 194, 'IT!', ty(TY.display, { color: HEX.accent, shadow: 1 }));
      [lg1, lg2].forEach(function (o, i) {
        if (!motionOK()) return;
        o.setScale(0.4); o.setAlpha(0);
        self.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 520, delay: i * 110, ease: 'Back.easeOut' });
        self.tweens.add({ targets: o, y: o.y - 5, duration: 2200 + i * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 600 });
      });
      bar(this, DW / 2, 234, 124, 7, C.violet);
      txt(this, DW / 2, 262, 'PASS THE DEVICE. SHOUT THE CLUE.', ty(TY.label, { color: HEX.dim }));

      this.mascot = makeMascot(this, DW / 2 - 14, 336, 0.8);
      this.time.addEvent({
        delay: 3600, loop: true,
        callback: function () { self.mascot.anim('shout'); kit.audio.sfx('tap', { volume: 0.16 }); }
      });

      makeBtn(this, {
        x: DW / 2, y: 430, w: 292, h: 100, radius: 26, label: 'PLAY', sub: 'choose categories',
        ty: { size: 40, weight: '900', ls: 2, lh: 0 },
        fill: C.paper, color: HEX.ink, subColor: 'rgba(26,15,61,0.66)',
        onClick: function () { kit.audio.sfx('select'); goto('setup'); }
      });
      makeBtn(this, {
        x: DW / 2, y: 552, w: 250, h: 62, radius: 20, label: 'SETTINGS', ty: TY.btnSm, fill: C.slateDark,
        onClick: function () { openSettings(); }
      });

      skinPanel(this, DW / 2, 731, DW - 48, 62, 18, 0xffffff, 0.09);
      txt(this, 96, 718, 'BEST TEAM RUN', ty(TY.label, { color: HEX.dim }));
      txt(this, 96, 742, SAVE.bestRun + ' clues', ty(TY.small, { color: HEX.accent, weight: '800' }));
      txt(this, 282, 718, 'TARGET', ty(TY.label, { color: HEX.dim }));
      txt(this, 282, 742, '7 points', ty(TY.small, { color: HEX.white, weight: '800' }));
      txt(this, DW / 2, 790, 'SPACE = next   ·   LEFT = skip   ·   ESC = pause',
        ty(TY.micro, { color: HEX.dimmer }));

      bindKeys(this, { confirm: function () { kit.audio.sfx('select'); goto('setup'); } });
    },
    update: function () { juiceFrame(this); }
  };

  /* ------------------------------------------------------ compact setup */
  var SetupScene = {
    key: 'setup',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      var self = this;
      sceneEnter(this);
      wantMusic('music_lobby');
      txt(this, DW / 2, 48, 'CHOOSE CATEGORIES', ty(TY.h1, { color: HEX.white }));
      txt(this, DW / 2, 86, 'Pick the clue mix for this game', ty(TY.small, { color: HEX.dim }));

      var pickerNames = ['OBJECTS', 'MOVIES', 'ANIMALS', 'FOOD', 'TOWN', 'MOODS', 'SPORTS', 'GADGETS'];
      var picker = [];
      function selected(id) { return SAVE.decks.indexOf(id) >= 0; }
      function repaint() {
        picker.forEach(function (b) {
          var on = selected(b.deck.id);
          b.setFill(on ? C.violet : C.slateDark);
          b.labelObj.setColor(on ? HEX.white : HEX.dim);
          b.setSub(on ? b.deck.phrases.length + ' clues' : 'tap to add');
        });
      }
      SHOUT_DECKS.forEach(function (d, i) {
        var b = makeBtn(self, {
          x: i % 2 ? 285 : 105, y: 142 + Math.floor(i / 2) * 72,
          w: 156, h: 58, radius: 16, label: pickerNames[i], sub: '', ty: TY.btnSm,
          fill: C.slateDark,
          onClick: function () {
            var idx = SAVE.decks.indexOf(d.id);
            if (idx >= 0) {
              if (SAVE.decks.length === 1) { kit.audio.sfx('back'); shakeText(self, b.labelObj); return; }
              SAVE.decks.splice(idx, 1);
              kit.audio.sfx('pass', { volume: 0.6 });
            } else {
              SAVE.decks.push(d.id);
              kit.audio.sfx('select', { volume: 0.7 });
            }
            saveNow(); repaint();
          }
        });
        b.deck = d; picker.push(b);
      });
      repaint();

      txt(this, 30, 456, 'TEAMS', ty(TY.label, { color: HEX.dim, ox: 0 }));
      makeSegments(this, DW / 2, 492, DW - 60, 48, ['2 TEAMS', '3 TEAMS', '4 TEAMS'],
        SAVE.teamCount - 2, function (i) { SAVE.teamCount = i + 2; saveNow(); });
      txt(this, DW / 2, 548, 'First to 7 points wins. The buzzer chooses the point.',
        ty(TY.small, { color: HEX.dim }));

      function start() {
        kit.audio.sfx('shuffle');
        saveNow();
        newMatch();
        goto('play');
      }
      makeBtn(this, {
        x: DW / 2, y: 636, w: 300, h: 88, radius: 24, label: 'START GAME',
        ty: TY.btnLg, fill: C.paper, color: HEX.ink, subColor: 'rgba(26,15,61,0.66)',
        onClick: start
      });
      makeBtn(this, {
        x: DW / 2, y: 738, w: 220, h: 52, radius: 18, label: 'BACK', ty: TY.btnSm, fill: C.slateDark,
        onClick: function () { kit.audio.sfx('back'); goto('title'); }
      });
      txt(this, DW / 2, 802, 'ENTER = start   ·   ESC = back',
        ty(TY.micro, { color: HEX.dimmer }));

      bindKeys(this, { confirm: start, cancel: function () { goto('title'); } });
    },
    update: function () { juiceFrame(this); }
  };

  /* --------------------------------------------------- live board */
  var SimplePlayScene = {
    key: 'play',

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      var self = this;
      sceneEnter(this);
      playScene = this;
      wantMusic('music_round');
      armMusic();

      this.running = false;
      this.handoff = 0;
      this.actionLock = false;
      this.tickAcc = 0;
      this.crowdAcc = 0;
      this.duckUntil = 0;
      this.tense = 0;
      this.clkRemain = 0;
      this.clkRunning = false;
      this.clkDeadline = 0;
      this.forceBuzzAfterPass = false;
      this.fx = makeFX(this, 45, 96);

      txt(this, 24, 44, 'SHOUT IT!', ty(TY.h3, { color: HEX.paper, ox: 0 }));
      makeIconBtn(this, DW - 30, 44, 'SET', function () { openSettings(); });

      this.buildHud();
      this.card = this.buildSimpleCard();
      this.stats = txt(this, DW / 2, CARD.y + CARD.h / 2 + 20, '',
        ty(TY.small, { color: HEX.dimmer }));

      this.skipBtn = makeBtn(this, {
        x: 76, y: 722, w: 126, h: 82, radius: 22, label: 'SKIP', sub: '2 LEFT',
        ty: TY.h3, fill: C.slate, onClick: function () { self.doSkip(); },
        blocked: function () { return self.handoff > 0; }
      });
      this.nextBtn = makeBtn(this, {
        x: 260, y: 722, w: 206, h: 98, radius: 24, label: 'NEXT', sub: 'PASS THE DEVICE',
        ty: TY.btnLg, fill: C.paper, color: HEX.ink, subColor: 'rgba(26,15,61,0.7)',
        onClick: function () { self.doNext(); },
        blocked: function () { return self.handoff > 0; }
      });
      this.nextBtn.labelObj.setFontSize(38);

      this.wash = this.add.image(DW / 2, DH / 2, texPx(this)).setDisplaySize(DW, DH)
        .setAlpha(0).setDepth(60);
      this.buzzText = txt(this, DW / 2, 642, '', ty(TY.h2, { color: HEX.bad })).setDepth(70).setAlpha(0);
      this.passBox = this.buildPassBeat();
      this.winBox = this.buildWinner();

      this.refreshHud();
      this.paintSimpleCard();
      this.clockSet(M.dur);
      this.showPass();

      bindKeys(this, {
        got: function () { self.doNext(); },
        pass: function () { self.doSkip(); },
        restart: function () { kit.restart(); },
        pause: function () { openPause(self); },
        mute: function () {}
      });
      this.events.on(Phaser.Scenes.Events.PAUSE, function () { self.clockHold(); syncSI(); });
      this.events.on(Phaser.Scenes.Events.RESUME, function () {
        if (self.running && self.handoff <= 0) self.clockRun();
        syncSI();
      });
      this.events.once('shutdown', function () { if (playScene === self) playScene = null; });
      if (forceBuzzPending) {
        forceBuzzPending = false;
        this.time.delayedCall(120, function () { self.forceBuzz(); });
      }
    },

    clockSet: function (sec) {
      this.clkRemain = Math.max(0, sec * 1000);
      this.clkRunning = false;
      syncSI();
    },
    clockRun: function () {
      if (!this.clkRunning) {
        this.clkDeadline = performance.now() + this.clkRemain;
        this.clkRunning = true;
      }
      syncSI('play');
    },
    clockHold: function () {
      if (this.clkRunning) {
        this.clkRemain = Math.max(0, this.clkDeadline - performance.now());
        this.clkRunning = false;
      }
      syncSI();
    },
    clockLeft: function () {
      return this.clkRunning ? Math.max(0, this.clkDeadline - performance.now()) : this.clkRemain;
    },

    buildHud: function () {
      var n = M.teams.length;
      var cols = n <= 2 ? n : 2;
      var rows = Math.ceil(n / cols);
      var gap = 8, side = 20;
      var pw = (DW - side * 2 - (cols - 1) * gap) / cols;
      var ph = n <= 2 ? 60 : 52;
      var top = 88, rowGap = 6;
      this.pills = [];
      for (var i = 0; i < n; i++) {
        var cx = side + (i % cols) * (pw + gap) + pw / 2;
        var cy = top + Math.floor(i / cols) * (ph + rowGap) + ph / 2;
        var skin = skinPanel(this, cx, cy, pw, ph, 14, 0xffffff, 0.08);
        var edge = this.add.image(cx, cy, texRRLine(this, Math.round(pw), Math.round(ph), 14, 2))
          .setDisplaySize(pw, ph).setAlpha(0);
        var caret = this.add.image(cx, cy - ph / 2 - 5, 'fxTri').setDisplaySize(14, 9).setAlpha(0);
        var nameT = txt(this, cx - pw / 2 + 12, cy - ph / 2 + 13, M.teams[i].name,
          ty(TY.label, { ox: 0 }));
        fitText(nameT, pw - 78);
        var ptsT = txt(this, cx + pw / 2 - 12, cy - ph / 2 + 13, '0', ty(TY.h3, { ox: 1 }));
        var pips = [];
        for (var pi = 0; pi < 7; pi++) {
          var pip = this.add.image(cx - pw / 2 + 17 + pi * 19, cy + ph / 2 - 14, texCircle(this, 7))
            .setDisplaySize(10, 10).setAlpha(0.22);
          pips.push(pip);
        }
        this.pills.push({ skin: skin, edge: edge, caret: caret, nameT: nameT, ptsT: ptsT,
          pips: pips, team: M.teams[i] });
      }
      this.hudBottom = top + rows * ph + (rows - 1) * rowGap;
      var cardTop = this.hudBottom + 22;
      CARD.y = Math.round(cardTop + CARD.h / 2);
    },

    refreshHud: function () {
      var self = this;
      M.teams.forEach(function (t, i) {
        var p = self.pills[i], active = i === M.holder;
        p.skin.paint(active ? t.color : 0xffffff, active ? 1 : 0.08);
        p.edge.setAlpha(active ? 0.95 : 0);
        p.caret.setTint(t.color).setAlpha(active ? 1 : 0);
        p.nameT.setColor(active ? HEX.ink : t.glow);
        p.ptsT.setText(String(t.pts)).setColor(active ? HEX.ink : HEX.white);
        p.pips.forEach(function (pip, pi) {
          pip.setTint(pi < t.pts ? t.color : 0xffffff).setAlpha(pi < t.pts ? 1 : 0.22);
        });
      });
      var left = Math.max(0, 2 - M.skips);
      this.stats.setText(M.teams[M.holder].name + ' HOLDS  ·  ' + left + ' SKIP' + (left === 1 ? '' : 'S') + ' LEFT');
      this.skipBtn.setSub(left + ' LEFT');
      this.skipBtn.setEnabled(left > 0);
      syncSI();
    },

    buildSimpleCard: function () {
      var c = this.add.container(CARD.x, CARD.y);
      var flip = this.add.container(0, 0);
      var face = this.add.image(0, (CARD_PAD_TOP - CARD_PAD_BOT) / 2, 'cardFace');
      var band = this.add.image(0, -CARD.h / 2 + 6, texRRTop(this, CARD.w - 12, 58, CARD.r - 6))
        .setOrigin(0.5, 0).setDisplaySize(CARD.w - 12, 58);
      var bandShade = this.add.image(0, -CARD.h / 2 + 60, texPx(this))
        .setOrigin(0.5, 0).setDisplaySize(CARD.w - 12, 4).setTint(0x000000).setAlpha(0.18);
      var motif = this.add.image(CARD.w / 2 - 40, -CARD.h / 2 + 35, 'motif0')
        .setDisplaySize(34, 34).setAlpha(0.35).setTint(0x1a0f3d);
      var chip = txt(this, -CARD.w / 2 + 26, -CARD.h / 2 + 35, '', ty(TY.label, { color: '#241a12', ox: 0 }));
      var phrase = txt(this, 0, -2, '', {
        size: PHRASE_STEPS[0], weight: '900', color: HEX.ink,
        wrap: CARD.w - 44, ls: -0.5, lh: PHRASE_LH
      });
      var rule = this.add.image(0, CARD.h / 2 - 62, texPx(this))
        .setDisplaySize(CARD.w - 92, 2).setTint(0x1a0f3d).setAlpha(0.12);
      var foot = txt(this, 0, CARD.h / 2 - 40, '', ty(TY.small, { color: HEX.inkSoft }));
      flip.add([face, band, bandShade, motif, chip, phrase, rule, foot]);
      c.add(flip);
      c.parts = { band: band, motif: motif, chip: chip, phrase: phrase, foot: foot };
      c.setSize(CARD.w, CARD.h);
      return c;
    },

    paintSimpleCard: function () {
      var p = this.card.parts, clue = M.cur;
      if (!clue) return;
      p.band.setTint(Phaser.Display.Color.HexStringToColor(clue.col).color);
      p.motif.setTexture('motif' + clue.mi);
      p.chip.setText(clue.cat.toUpperCase());
      var step = 0;
      for (; step < PHRASE_STEPS.length; step++) {
        p.phrase.setStyle({ fontFamily: FONT, fontSize: PHRASE_STEPS[step] + 'px',
          fontStyle: '900', color: HEX.ink, align: 'center', wordWrap: {
            width: CARD.w - 44, useAdvancedWrap: true
          } });
        p.phrase.setLineSpacing(PHRASE_LH);
        p.phrase.setText(clue.text);
        if (p.phrase.height <= CARD.h - 190) break;
      }
      this.stats.setText(M.teams[M.holder].name + ' HOLDS  ·  ' +
        Math.max(0, 2 - M.skips) + ' SKIPS LEFT');
      syncSI();
    },

    buildPassBeat: function () {
      var box = this.add.container(0, 0).setDepth(100).setVisible(false);
      var bg = this.add.image(DW / 2, DH / 2, texPx(this)).setDisplaySize(DW, DH)
        .setTint(C.deep).setAlpha(1).setInteractive();
      var wash = this.add.image(DW / 2, 238, 'softGlow').setScale(3.8).setAlpha(0.22);
      var lock = txt(this, DW / 2, 176, 'ANSWER HIDDEN', ty(TY.label, { color: HEX.dimmer }));
      var cardBack = this.add.image(DW / 2, 330, 'backTile').setDisplaySize(108, 108).setTint(C.violet);
      var title = txt(this, DW / 2, 470, 'PASS TO', ty(TY.display, { color: HEX.paper }));
      var team = txt(this, DW / 2, 548, '', ty(TY.h1, { color: HEX.accent }));
      var prompt = txt(this, DW / 2, 650, 'TAP WHEN READY', ty(TY.label, { color: HEX.dim }));
      var hint = txt(this, DW / 2, 684, 'the clock is paused', ty(TY.small, { color: HEX.dimmer }));
      box.add([bg, wash, lock, cardBack, title, team, prompt, hint]);
      box.parts = { bg: bg, wash: wash, team: team, prompt: prompt, cardBack: cardBack };
      var self = this;
      bg.on('pointerup', function () {
        if (self.handoff > 0 && HANDOFF_T - self.handoff >= HANDOFF_MIN_TAP) self.endHandoff();
      });
      return box;
    },

    showPass: function () {
      var self = this, b = this.passBox, t = M.teams[M.holder];
      this.clockHold();
      this.running = false;
      this.handoff = HANDOFF_T;
      b.parts.team.setText(t.name).setColor(t.glow);
      b.parts.cardBack.setTint(t.color);
      b.parts.wash.setTint(t.color);
      b.setVisible(true).setAlpha(1);
      b.parts.bg.setInteractive();
      b.parts.prompt.setText('TAP WHEN READY');
      kit.audio.sfx('handoff', { volume: 0.8 });
      this.duckUntil = performance.now() + 700;
      syncSI('pass');
      this.refreshHud();
      this.time.delayedCall(HANDOFF_T * 1000 + 40, function () { if (self.handoff > 0) self.endHandoff(); });
    },

    endHandoff: function () {
      if (this.handoff <= 0) return;
      this.handoff = 0;
      this.passBox.parts.bg.disableInteractive();
      this.passBox.setVisible(false);
      if (M.winner >= 0) return;
      this.actionLock = false;
      this.running = true;
      this.clockRun();
      this.refreshHud();
      syncSI('play');
      if (this.forceBuzzAfterPass) {
        this.forceBuzzAfterPass = false;
        this.time.delayedCall(0, this.forceBuzz.bind(this));
      }
    },

    canAct: function () {
      return !kit.paused && !pauseOpen && !this.actionLock && this.handoff <= 0 &&
        this.running && this.clockLeft() > 0 && M.winner < 0;
    },

    doNext: function () {
      if (!this.canAct()) return;
      this.actionLock = true;
      this.clockHold();
      kit.audio.sfx('got', { volume: 0.7 });
      this.duckUntil = performance.now() + 600;
      this.fx.burst('correct', this.card.x, this.card.y - 28, teamTints(M.teams[M.holder]), null, 0.65);
      this.flash(C.violet, 0.18);
      M.teams[M.holder].got++;
      if (M.teams[M.holder].got > SAVE.bestRun) SAVE.bestRun = M.teams[M.holder].got;
      SAVE.phrases++;
      M.holder = nextHolder(M.holder);
      nextPhrase();
      saveNow();
      this.paintSimpleCard();
      this.refreshHud();
      this.showPass();
    },

    doSkip: function () {
      if (!this.canAct() || M.skips >= 2) return;
      this.actionLock = true;
      M.skips++;
      nextPhrase();
      kit.audio.sfx('pass', { volume: 0.7 });
      this.duckUntil = performance.now() + 450;
      this.fx.burst('pass', this.card.x, this.card.y, [C.violet, C.paper], null, 0.7);
      this.flash(C.violet, 0.14);
      this.paintSimpleCard();
      this.refreshHud();
      this.actionLock = false;
      syncSI('play');
    },

    flash: function (col, alpha) {
      if (!motionOK()) return;
      this.wash.setTint(col).setAlpha(alpha);
      this.tweens.add({ targets: this.wash, alpha: 0, duration: 280, ease: 'Cubic.easeOut' });
    },

    endRound: function () {
      if (!this.running || this.actionLock) return;
      var self = this, loser = M.holder, winners = [];
      this.running = false;
      this.clockHold();
      this.actionLock = true;
      M.teams.forEach(function (t, i) { if (i !== loser) { t.pts++; winners.push(i); } });
      M.history.push({ n: M.roundNo, loser: loser, winners: winners });
      SAVE.rounds++;
      this.refreshHud();
      kit.audio.sfx('buzzer', { volume: 1 });
      this.duckUntil = performance.now() + 700;
      kit.juice.hitStop(60);
      this.wash.setTint(0xffffff).setAlpha(motionOK() ? 0.92 : 0.35);
      this.tweens.add({ targets: this.wash, alpha: 0, duration: 240, ease: 'Quad.easeOut' });
      this.fx.burst('buzzer', DW / 2, CARD.y, [C.bad, C.paper, M.teams[loser].color]);
      this.fx.shock(DW / 2, CARD.y, C.bad, 620, 560);
      kit.juice.shake(12, 420);
      var pointText = winners.length === 1 ? 'POINT TO ' + M.teams[winners[0]].name : 'POINT TO THE OTHER TEAMS';
      this.buzzText.setText('BUZZ!  ' + pointText).setAlpha(1).setColor(HEX.bad);
      this.time.delayedCall(240, function () { kit.audio.sfx('fanfare', { volume: 0.65 }); });
      saveNow();
      this.time.delayedCall(660, function () {
        var champ = -1;
        M.teams.forEach(function (t, i) { if (t.pts >= M.target && champ < 0) champ = i; });
        if (champ >= 0) {
          M.winner = champ;
          self.showWinner();
        } else {
          M.holder = nextHolder(loser);
          M.roundNo++;
          startRound();
          self.clockSet(M.dur);
          self.paintSimpleCard();
          self.refreshHud();
          self.showPass();
        }
      });
      syncSI('pass');
    },

    showWinner: function () {
      var w = M.teams[M.winner];
      this.running = false;
      this.actionLock = true;
      this.winBox.parts.name.setText(w.name).setColor(w.glow);
      this.winBox.parts.bg.setTint(w.color);
      this.winBox.setVisible(true).setAlpha(1);
      this.passBox.setVisible(false);
      SAVE.games++;
      saveNow();
      kit.audio.sfx('win', { volume: 1 });
      this.fx.burst('victory', DW / 2, 164, teamTints(w));
      syncSI('win');
    },

    buildWinner: function () {
      var self = this;
      var box = this.add.container(0, 0).setDepth(110).setVisible(false);
      var bg = this.add.image(DW / 2, DH / 2, texPx(this)).setDisplaySize(DW, DH)
        .setTint(C.violet).setAlpha(0.96).setInteractive();
      var cap = txt(this, DW / 2, 154, 'FIRST TO 7', ty(TY.label, { color: HEX.dim }));
      var title = txt(this, DW / 2, 246, 'WINNER', ty(TY.display, { color: HEX.paper }));
      var name = txt(this, DW / 2, 336, '', ty(TY.h1, { color: HEX.accent }));
      var sub = txt(this, DW / 2, 390, 'THE BUZZER COULD NOT CATCH YOU',
        ty(TY.small, { color: HEX.dim }));
      var again = makeBtn(this, {
        x: DW / 2, y: 584, w: 300, h: 88, radius: 24, label: 'PLAY AGAIN', ty: TY.btnLg,
        fill: C.paper, color: HEX.ink, onClick: function () { kit.audio.sfx('shuffle'); newMatch(); goto('play'); }
      });
      var setup = makeBtn(this, {
        x: DW / 2, y: 688, w: 230, h: 56, radius: 18, label: 'CHANGE CATEGORIES', ty: TY.btnSub,
        fill: C.slateDark, onClick: function () { kit.audio.sfx('back'); goto('setup'); }
      });
      box.add([bg, cap, title, name, sub, again, setup]);
      box.parts = { bg: bg, name: name };
      return box;
    },

    forceBuzz: function () {
      if (this.canAct()) this.endRound();
      else if (this.handoff > 0) this.forceBuzzAfterPass = true;
    },

    update: function (time, delta) {
      var j = juiceFrame(this);
      var dt = Math.min(0.05, delta / 1000);
      this.fx.update(dt);
      if (j.frozen) return;
      if (this.handoff > 0) {
        this.handoff = Math.max(0, this.handoff - dt);
        if (this.handoff <= 0) this.endHandoff();
        syncSI();
        return;
      }
      if (!this.running || M.winner >= 0) { syncSI(); return; }

      M.left = this.clockLeft() / 1000;
      var elapsed = M.dur - M.left;
      var progress = Math.max(0, Math.min(1, elapsed / M.dur));
      var tense = elapsed >= IMMINENT_AT ? 2 : (elapsed >= TENSE_AT ? 1 : 0);
      if (tense !== this.tense) {
        this.tense = tense;
        if (tense === 2) {
          kit.audio.sfx('countdown', { volume: 0.4, rate: 1.25 });
          this.flash(C.bad, 0.16);
        }
      }
      this.tickAcc += dt;
      var interval = Math.max(0.11, 1.10 * Math.pow(0.085, progress));
      if (this.tickAcc >= interval) {
        this.tickAcc = 0;
        kit.audio.sfx(tense === 2 ? 'tickHi' : 'tick', {
          volume: (0.2 + 0.34 * progress) * (tense === 2 ? 1.25 : 1),
          rate: 1 + progress * 0.35 + (tense === 2 ? 0.1 : 0)
        });
      }
      this.crowdAcc += dt;
      if (this.crowdAcc >= 3.6) {
        this.crowdAcc = 0;
        var duck = performance.now() < this.duckUntil ? 0.35 : 1;
        kit.audio.sfx('crowd', { volume: (0.1 + 0.16 * progress + (tense === 2 ? 0.08 : 0)) * duck });
      }
      syncSI('play');
      if (M.left <= 0) this.endRound();
    }
  };

  /* ------------------------------------------------------ pause menu */
  function openPause(sc) {
    if (pauseOpen) return;
    pauseOpen = true;
    kit.pause('menu');
    game.scene.launch('pause', { back: sc.scene.key });
  }
  function closePause() {
    if (!pauseOpen) return;
    pauseOpen = false;
    game.scene.stop('pause');
    kit.resume('menu');
  }
  var PauseScene = {
    key: 'pause',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      var self = this;
      var scrim = this.add.image(DW / 2, DH / 2, texPx(this)).setDisplaySize(DW, DH)
        .setTint(0x0a0520).setAlpha(0).setInteractive();
      var card = this.add.container(0, 0);
      card.add(skinPanel(this, DW / 2, 430, DW - 52, 470, 26, C.lift, 0.96));
      card.add(txt(this, DW / 2, 244, 'PAUSED', ty(TY.h1, { color: HEX.white })));
      card.add(txt(this, DW / 2, 282, 'THE CLOCK IS STOPPED', ty(TY.label, { color: HEX.dim })));
      card.add(makeBtn(this, {
        x: DW / 2, y: 368, w: 280, h: 76, radius: 22, label: 'RESUME', ty: TY.h3, ignorePause: true,
        fill: C.paper, color: HEX.ink, onClick: function () { self.close(); }
      }));
      card.add(makeBtn(this, {
        x: DW / 2, y: 460, w: 280, h: 64, radius: 20, label: 'SETTINGS', ty: TY.btnSm, fill: C.slate,
        ignorePause: true, onClick: function () { openSettings(); }
      }));
      card.add(makeBtn(this, {
        x: DW / 2, y: 540, w: 280, h: 64, radius: 20, label: 'RESTART GAME', ty: TY.btnSm, fill: C.slate,
        ignorePause: true, onClick: function () { self.close(function () { newMatch(); goto('play'); }); }
      }));
      card.add(makeBtn(this, {
        x: DW / 2, y: 620, w: 280, h: 64, radius: 20, label: 'QUIT TO TITLE', ty: TY.btnSm, fill: C.slateDark,
        ignorePause: true, onClick: function () { self.close(function () { goto('title'); }); }
      }));
      // explicit enter choreography: slide up with one controlled overshoot
      if (motionOK()) {
        card.y = 44; card.setAlpha(0);
        this.tweens.add({ targets: scrim, alpha: 0.88, duration: 180, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: card, y: 0, alpha: 1, duration: 320, ease: 'Back.easeOut' });
      } else {
        scrim.setAlpha(0.88);
      }
      this.card = card; this.scrim = scrim;
      this.input.keyboard.on('keydown-ESC', function () { self.close(); });
    },
    close: function (then) {
      var self = this;
      if (this.closing) return;
      this.closing = true;
      if (!motionOK()) { closePause(); if (then) then(); return; }
      this.tweens.add({ targets: this.scrim, alpha: 0, duration: 160, ease: 'Cubic.easeIn' });
      this.tweens.add({
        targets: this.card, y: 30, alpha: 0, duration: 160, ease: 'Cubic.easeIn',
        onComplete: function () { closePause(); if (then) then(); }
      });
    }
  };

  /* Object literals above become real Scene subclasses so helper methods
   * live on the prototype (a plain config object only wires lifecycle, and
   * custom methods on it are NOT copied onto the scene). */
  function mkScene(cfg) {
    var S = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    S.prototype = Object.create(Phaser.Scene.prototype);
    S.prototype.constructor = S;
    for (var k in cfg) { if (k !== 'key') S.prototype[k] = cfg[k]; }
    return S;
  }

  var config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#120a2c',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DW, height: DH
    },
    // antialiasGL off: MSAA is pure cost under the gate's software renderer.
    // Texture filtering stays linear, which is what the baked art needs.
    render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: true },
    scene: [BootScene, BgScene, TitleScene, SetupScene, SimplePlayScene, PauseScene].map(mkScene)
  };
  config.scale.width = Math.round(DW * RETINA_FACTOR);
  config.scale.height = Math.round(DH * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  game = new Phaser.Game(config);
  // Defect class: a pause raised before Phaser existed must still apply.
  game.events.once(Phaser.Core.Events.READY, syncPause);
})();
