/* game.js - Curbside presentation layer.
 *
 * Phaser 3 renders, GGKit owns lifecycle / input identity / audio / saves /
 * loading / settings, cb_world.js owns the simulation and cb_data.js owns the
 * content. This file never decides a rule; it draws what the sim did and
 * plays the sound for it.
 *
 * DEFECT CLASSES THIS BUILD IS EXPLICITLY BUILT AGAINST
 *  1. Debug views separate from preallocated pools. CB_DEBUG_STATE.livePickups
 *     is its OWN preallocated record array, copied into each frame. A harness
 *     reading it can never truncate or alias a live sim pool.
 *  2. Per-entity render state on the entity passed to the renderer. Sim
 *     records carry no sprite handles. Every frame rebinds sprites to records
 *     in immediate mode (bindPool), so the sim stays render-free.
 *  3. DOM control handlers must seed kit.input.pointers at claim time. This
 *     title ships NO DOM gameplay controls - all play input is read from
 *     kit.input, and the only DOM surface is GGKit's own settings overlay.
 *     If a DOM control is ever added, seedPointer() below is the required
 *     entry point.
 *  4. Camera splits must create the second camera. This title uses ONE camera
 *     and never splits; there is no second viewport to forget.
 *  5. Phaser plain-config scenes need extend: for custom methods. Every scene
 *     here is a plain object with its methods under `extend`.
 *  6. Test switches readable from the boot fallback AND the live scene.
 *     CB_DEBUG_STATE is created once at module scope, published immediately,
 *     and thereafter only MUTATED - never replaced - so a switch set before
 *     the scene exists is still honoured.
 *  7. No clock may advance past the stepped sim. stepSim() runs a fixed 60 Hz
 *     accumulator with a hard MAX_STEPS ceiling; a degraded device gets
 *     slow motion, never a time skip. The cosmetic clock is separate and is
 *     the only thing hit-stop freezes.
 *  8. Guarded fallbacks on keyed lookups. Every content lookup goes through
 *     the CB_DATA resolvers, which fall back instead of returning undefined.
 *  9. Coach UI is a thin fading strip pinned under the top HUD band. It never
 *     covers the centre of the play area or the bottom half.
 * 10. sw.js precaches only files that exist (see sw.js ASSETS).
 */
(function () {
  'use strict';

  var CB = window.CB_DATA;
  var SIM = window.CB_SIM;
  var T = SIM.TUNING;
  var clamp = SIM.clamp;
  var TAU = SIM.TAU;

  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var SAVE_VERSION = 2;

  // ---------------------------------------------------------------- debug
  // Created once, published once, mutated forever. Boot fallback and the
  // live scene are the SAME object.
  var CB_CHALLENGE_COUNT = CB.CHALLENGES.length;
  var MAX_DEBUG_PICKUPS = 16;
  var DEBUG_PICKUPS = new Array(MAX_DEBUG_PICKUPS);
  for (var dbi = 0; dbi < MAX_DEBUG_PICKUPS; dbi++) {
    DEBUG_PICKUPS[dbi] = { kind: '', x: 0, y: 0, taken: false };
  }

  var CB_DEBUG_STATE = {
    scene: 'boot',
    ready: false,
    mode: '',
    modeName: '',
    district: '',
    districtName: '',
    districtIndex: 0,
    score: 0,
    combo: 0,
    multiplier: 1,
    distance: 0,
    speed: 0,
    riderState: '',
    landing: '',
    balance: 0,
    grinding: false,
    wobbleShown: false,
    airTime: 0,
    timeLeft: 0,
    gapsCleared: 0,
    gapNames: [],
    beatsHit: 0,
    beatsTotal: 0,
    shortcutsFound: 0,
    saves: 0,
    boost: 0,
    prompt: '',
    livePickups: DEBUG_PICKUPS,
    livePickupCount: 0,
    medals: (function () {
      var a = new Array(CB_CHALLENGE_COUNT);
      for (var i = 0; i < CB_CHALLENGE_COUNT; i++) a[i] = -1;
      return a;
    })(),
    unlockedCount: 1,
    lastBanner: '',
    lastEvent: '',
    // Preallocated ring of the last dozen sim events, oldest first. Purely a
    // debug view; it never aliases the sim's own event ring.
    recentEvents: (function () { var a = new Array(12); for (var i = 0; i < 12; i++) a[i] = ''; return a; })(),
    bestScore: 0,
    over: false,
    result: '',
    medalIndex: -1,
    reducedMotion: false,
    // ------- test switches, readable and writable at any time -------
    forceEvent: '',
    forceDistrict: '',
    forceMode: '',
    forceGenerousDrops: false,
    forceUnlockAll: false
  };

  window.__cb = {
    state: CB_DEBUG_STATE,
    forceEvent: function (name) { CB_DEBUG_STATE.forceEvent = String(name || ''); },
    forceDistrict: function (key) { CB_DEBUG_STATE.forceDistrict = String(key || ''); },
    forceMode: function (key) { CB_DEBUG_STATE.forceMode = String(key || ''); },
    version: '1.0.0'
  };

  // ------------------------------------------------------------ preferences
  var reducedMotion = false;
  try {
    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = !!(mq && mq.matches);
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function (e) {
        reducedMotion = !!e.matches;
        CB_DEBUG_STATE.reducedMotion = reducedMotion;
      });
    }
  } catch (e) { reducedMotion = false; }
  CB_DEBUG_STATE.reducedMotion = reducedMotion;

  // ---------------------------------------------------------------- saves
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      medals: {},          // challengeKey -> 0..2
      bests: {},           // challengeKey -> best medal value
      completed: {},       // challengeKey -> finished at any result except bail
      shortcuts: {},       // district key -> discovered high-line name
      livery: 'slate',
      seenCoach: false,
      totalMedals: 0
    };
  }

  // Persisted ids must validate against the live registries, never be trusted.
  function validateSave(o) {
    if (!o || typeof o !== 'object') return false;
    if (o.v !== SAVE_VERSION) return false;
    if (!o.medals || typeof o.medals !== 'object') return false;
    if (!o.bests || typeof o.bests !== 'object') return false;
    if (typeof o.livery !== 'string') return false;
    return true;
  }

  function sanitiseSave(o) {
    var out = defaultSave();
    if (!o) return out;
    var i, k;
    for (i = 0; i < CB.CHALLENGES.length; i++) {
      k = CB.CHALLENGES[i].key;
      var m = o.medals ? o.medals[k] : undefined;
      if (typeof m === 'number' && m >= 0 && m <= 2) out.medals[k] = m | 0;
      var b = o.bests ? o.bests[k] : undefined;
      if (typeof b === 'number' && isFinite(b) && b >= 0) out.bests[k] = Math.min(99999999, b);
      if (o.completed && o.completed[k] === true) out.completed[k] = true;
    }
    for (i = 0; i < CB.DISTRICTS.length; i++) {
      var district = CB.DISTRICTS[i];
      if (o.shortcuts && o.shortcuts[district.key] === district.shortcut) {
        out.shortcuts[district.key] = district.shortcut;
      }
    }
    // livery id must exist in the registry or it degrades to the default
    out.livery = CB.livery(o.livery).key;
    out.seenCoach = !!o.seenCoach;
    out.totalMedals = 0;
    for (k in out.medals) out.totalMedals += (out.medals[k] + 1);
    return out;
  }

  // --------------------------------------------------------------- GGKit
  var Game = { phaser: null, play: null, menu: null, insets: { top: 0, right: 0, bottom: 0, left: 0 } };

  var kit = GGKit.create({
    slug: 'curbside',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () {
      var s = Game.play;
      if (s && s.scene && s.scene.isActive()) { s.clearControl(); s.scene.pause(); }
    },
    onResume: function () {
      var s = Game.play;
      if (s && s.scene && s.scene.isPaused()) s.scene.resume();
    },
    onRestart: function () {
      var s = Game.play;
      if (s) { s.clearControl(); s.scene.restart(s.launchData); }
    }
  });

  var profile = sanitiseSave(kit.save.get(null));
  function persist() { kit.save.set(profile); }

  // Straight-line unlock chain over CB.CHALLENGES. Index 0 is always open;
  // index i opens once index i-1 has any medal. The finale line is the last
  // entry, so clearing the chain is what reaches it.
  function unlockedCount() {
    if (CB_DEBUG_STATE.forceUnlockAll) return CB.CHALLENGES.length;
    var n = 1;
    for (var i = 0; i < CB.CHALLENGES.length; i++) {
      var k = CB.CHALLENGES[i].key;
      if (profile.completed[k] === true) n = Math.min(CB.CHALLENGES.length, i + 2);
      else break;
    }
    return n;
  }
  function isUnlocked(index) { return index < unlockedCount(); }

  function totalMedalPoints() {
    var t = 0;
    for (var k in profile.medals) {
      if (profile.medals[k] >= 0) t += (profile.medals[k] + 1);
    }
    return t;
  }
  function discoveredShortcutCount() {
    var n = 0;
    for (var i = 0; i < CB.DISTRICTS.length; i++) {
      var d = CB.DISTRICTS[i];
      if (profile.shortcuts && profile.shortcuts[d.key] === d.shortcut) n++;
    }
    return n;
  }
  function liveryUnlocked(l) { return totalMedalPoints() >= l.need; }

  // ---------------------------------------------------------------- audio
  var AUDIO = {
    music_street: 'assets/music_street.mp3',
    music_night: 'assets/music_night.mp3',
    music_menu: 'assets/music_menu.mp3',
    // The heat bed is a separate GGKit music key so the bus crossfades into
    // the pressure layer as speed and danger rise. It uses the authored night
    // stem already shipped by this title, keeping the payload audio-only.
    music_heat: 'assets/music_night.mp3',
    sfx_roll: 'assets/sfx_roll.mp3',
    sfx_grind: 'assets/sfx_grind.mp3',
    sfx_pop: 'assets/sfx_pop.mp3',
    sfx_land_clean: 'assets/sfx_land_clean.mp3',
    sfx_land_sketchy: 'assets/sfx_land_sketchy.mp3',
    sfx_bail: 'assets/sfx_bail.mp3',
    sfx_trick: 'assets/sfx_trick.mp3',
    sfx_pickup: 'assets/sfx_pickup.mp3',
    sfx_boost: 'assets/sfx_boost.mp3',
    sfx_combo: 'assets/sfx_combo.mp3',
    sfx_bank: 'assets/sfx_bank.mp3',
    sfx_gap: 'assets/sfx_gap.mp3',
    sfx_medal: 'assets/sfx_medal.mp3',
    sfx_ui: 'assets/sfx_ui.mp3',
    sfx_prompt: 'assets/sfx_prompt.mp3',
    sfx_fail: 'assets/sfx_fail.mp3',
    sfx_horn: 'assets/sfx_horn.mp3',
    sfx_wobble: 'assets/sfx_wobble.mp3',
    sfx_district: 'assets/sfx_district.mp3'
  };
  kit.audio.register(AUDIO);

  function addVolumeControl(parent, title, get, set) {
    var wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:min(70vw,280px);' +
      'font:inherit;font-size:14px;color:#e8eef4;text-align:left;';
    var caption = document.createElement('span');
    var range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '1'; range.step = '0.05';
    range.value = String(get());
    range.setAttribute('aria-label', title);
    function paint() { caption.textContent = title + ': ' + Math.round(get() * 100) + '%'; }
    range.addEventListener('input', function () { set(Number(range.value)); paint(); });
    wrap.appendChild(caption); wrap.appendChild(range); parent.appendChild(wrap); paint();
  }

  function openSettings() {
    kit.openSettings([function (box) {
      addVolumeControl(box, 'Music volume', function () { return kit.audio.prefs.music; },
        function (v) { kit.audio.setMusicVolume(v); });
      addVolumeControl(box, 'SFX volume', function () { return kit.audio.prefs.sfx; },
        function (v) { kit.audio.setSfxVolume(v); });
    }]);
  }

  // ------------------------------------------------------------- helpers
  var FONT = 'Verdana, Geneva, system-ui, sans-serif';

  function label(scene, x, y, text, size, color, weight) {
    return scene.add.text(x, y, text, {
      fontFamily: FONT,
      fontSize: size + 'px',
      fontStyle: weight || 'normal',
      color: color || '#f2ecff'
    });
  }

  function setTextIfChanged(obj, value) {
    var next = String(value);
    if (obj.text !== next) obj.setText(next);
    return obj;
  }

  function fitLabel(obj, maxWidth, maxSize, minSize) {
    var size = maxSize || 14;
    var floor = minSize || 9;
    obj.setFontSize(size + 'px');
    while (size > floor && obj.width > maxWidth) {
      size -= 1;
      obj.setFontSize(size + 'px');
    }
    return obj;
  }

  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;';
    document.body.appendChild(probe);
    var cs = window.getComputedStyle(probe);
    var out = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    probe.remove();
    return out;
  }

  // Required entry point if a DOM control is ever added: a DOM handler must
  // seed kit.input.pointers at claim time, otherwise the pointer identity map
  // never sees the touch and the sim reads a dead control.
  function seedPointer(e) {
    if (!e || e.pointerId == null) return;
    if (kit.input.pointers.has(e.pointerId)) return;
    kit.input.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
      downAt: performance.now(), zone: 'dom'
    });
  }
  window.__cbSeedPointer = seedPointer;

  // A Phaser Graphics object re-submits its whole command list every frame,
  // and a rounded rectangle is a tessellated path. Static chrome built from
  // Graphics therefore costs real milliseconds on a throttled CPU for a
  // picture that never changes. Every static panel in this title is baked
  // ONCE into a white texture, cached by geometry, and drawn as a tinted
  // quad instead. This was the single biggest win in the feel pass.
  var PANEL_PAD = 3;
  function panelTexture(scene, w, h, radius) {
    w = Math.max(4, Math.round(w));
    h = Math.max(4, Math.round(h));
    radius = Math.round(radius);
    var key = 'ui_' + w + 'x' + h + 'r' + radius;
    if (scene.textures.exists(key + '_f')) return key;
    var tw = w + PANEL_PAD * 2, th = h + PANEL_PAD * 2;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(PANEL_PAD, PANEL_PAD, w, h, radius);
    g.generateTexture(key + '_f', tw, th);
    g.clear();
    g.lineStyle(2.5, 0xffffff, 1);
    g.strokeRoundedRect(PANEL_PAD, PANEL_PAD, w, h, radius);
    g.generateTexture(key + '_s', tw, th);
    g.destroy();
    return key;
  }

  // Returns {c, fill, stroke}: a container holding the two tinted quads.
  function panel(scene, x, y, w, h, radius, fillColor, fillAlpha, strokeColor, strokeAlpha) {
    var key = panelTexture(scene, w, h, radius == null ? 12 : radius);
    var c = scene.add.container(x, y);
    var f = scene.add.image(0, 0, key + '_f').setOrigin(0.5)
      .setTint(fillColor == null ? 0x171331 : fillColor)
      .setAlpha(fillAlpha == null ? 0.92 : fillAlpha);
    var st = scene.add.image(0, 0, key + '_s').setOrigin(0.5)
      .setTint(strokeColor == null ? 0x6eebff : strokeColor)
      .setAlpha(strokeAlpha == null ? 0.9 : strokeAlpha);
    c.add(f); c.add(st);
    c.pFill = f; c.pStroke = st;
    return c;
  }

  // Vertical gradients are baked the same way: a canvas texture written once
  // per district, then stretched, instead of forty-odd fillRects per frame.
  function gradientTexture(scene, key, top, bottom, steps) {
    if (scene.textures.exists(key)) return key;
    steps = steps || 64;
    var tex = scene.textures.createCanvas(key, 4, steps);
    var ctx = tex.getContext();
    var ct = Phaser.Display.Color.IntegerToColor(top);
    var cb = Phaser.Display.Color.IntegerToColor(bottom);
    for (var i = 0; i < steps; i++) {
      var c = Phaser.Display.Color.Interpolate.ColorWithColor(ct, cb, steps - 1, i);
      ctx.fillStyle = 'rgb(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ')';
      ctx.fillRect(0, i, 4, 1);
    }
    tex.refresh();
    return key;
  }

  function button(scene, x, y, w, h, text, onTap, opts) {
    var o = opts || {};
    var c = scene.add.container(x, y);
    var fill = o.fill == null ? 0x241d4a : o.fill;
    var stroke = o.stroke == null ? 0x6eebff : o.stroke;
    var key = panelTexture(scene, w, h, o.radius == null ? 12 : o.radius);
    c.add(scene.add.image(0, 0, key + '_f').setOrigin(0.5).setTint(fill)
      .setAlpha(o.alpha == null ? 0.96 : o.alpha));
    c.add(scene.add.image(0, 0, key + '_s').setOrigin(0.5).setTint(stroke)
      .setAlpha(o.disabled ? 0.30 : 0.95));
    var t = label(scene, 0, 0, text, o.size || 15, o.disabled ? '#7a7398' : (o.color || '#f2ecff'), 'bold')
      .setOrigin(0.5);
    fitLabel(t, w - 20, o.size || 15, 9);
    c.add(t);
    c.tLabel = t;
    if (!o.disabled) {
      c.setSize(w, h);
      // Phaser's pointer manager is deliberately not used for controls. The
      // button is registered as a visual hit rectangle and pollButtons reads
      // the per-pointer identity map owned by GGKit.
      scene.__ggButtons = scene.__ggButtons || [];
      scene.__ggButtons.push({ c: c, w: w, h: h, onTap: onTap });
    }
    return c;
  }

  function visibleInTree(obj) {
    var p = obj;
    while (p) {
      if (!p.visible) return false;
      p = p.parentContainer;
    }
    return true;
  }

  function pollButtons(scene) {
    if (!scene.__ggButtons || !scene.scene.isActive()) return false;
    var canvas = scene.sys.game.canvas;
    var rect = canvas.getBoundingClientRect();
    var pointers = kit.input.pointers;
    for (var it = pointers.values(), nx = it.next(); !nx.done; nx = it.next()) {
      var p = nx.value;
      var px = p.x - rect.left, py = p.y - rect.top;
      for (var i = scene.__ggButtons.length - 1; i >= 0; i--) {
        var b = scene.__ggButtons[i];
        if (!visibleInTree(b.c)) continue;
        var bounds = b.c.getBounds();
        if (px < bounds.x || px > bounds.right || py < bounds.y || py > bounds.bottom) continue;
        kit.input.clearAll();
        kit.audio.sfx('sfx_ui', { volume: 0.5 });
        scene.tweens.add({ targets: b.c, scale: 0.94, duration: 70, yoyo: true });
        if (b.onTap) b.onTap();
        return true;
      }
    }
    return false;
  }

  // =============================================================== boot
  var BootScene = {
    key: 'Boot',
    preload: function () {
      CB_DEBUG_STATE.scene = 'boot';
      kit.loader.show('CURBSIDE');
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.75); });
      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      this.load.image('ground', 'assets/ground.png');
      this.load.image('logo', 'assets/logo.png');
      this.load.image('surface_rail', 'assets/surface_rail.svg');
      this.load.image('surface_ledge', 'assets/surface_ledge.svg');
      this.load.image('surface_deck', 'assets/surface_deck.svg');
      this.load.image('surface_step', 'assets/surface_step.svg');
      this.load.image('surface_ramp', 'assets/surface_ramp.svg');
      var i, d;
      for (i = 0; i < CB.DISTRICTS.length; i++) {
        d = CB.DISTRICTS[i];
        this.load.image(d.bgFar, 'assets/' + d.bgFar + '.png');
        this.load.image(d.bgNear, 'assets/' + d.bgNear + '.png');
      }
      var parts = ['p_dust', 'p_chalk', 'p_spark', 'p_smoke', 'p_glow', 'p_ring'];
      for (i = 0; i < parts.length; i++) this.load.image(parts[i], 'assets/' + parts[i] + '.png');
    },
    create: function () {
      var self = this;
      // Decode a small, useful slice of audio before the menu appears; the
      // rest lazy-decodes on first play so the boot frame stays cheap.
      kit.audio.preload(['sfx_ui', 'sfx_pop', 'sfx_roll', 'music_menu']).then(function () {
        kit.loader.progress(1);
        kit.loader.hide();
        CB_DEBUG_STATE.ready = true;
        self.scene.start('Menu');
      });
      kit.registerPWA();
    },
    extend: {}
  };

  // =============================================================== menu
  var MenuScene = {
    key: 'Menu',
    create: function () {
      Game.menu = this;
      CB_DEBUG_STATE.scene = 'menu';
      CB_DEBUG_STATE.over = false;
      var W = this.scale.width, H = this.scale.height;
      this.W = W; this.H = H;
      var ins = Game.insets;
      this.selected = Math.max(0, unlockedCount() - 1);

      this.cameras.main.setBackgroundColor(0x120f26);
      this.buildBackdrop();

      var logo = this.add.image(W / 2, ins.top + 86, 'logo').setOrigin(0.5);
      logo.setScale(Math.min(1, (W - 48) / logo.width));
      this.tweens.add({
        targets: logo, y: logo.y + (reducedMotion ? 0 : 5), duration: 2400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });

      var tag = label(this, W / 2, ins.top + 136, 'ENDLESS STREET SKATING', 11, '#9c92c8')
        .setOrigin(0.5);
      tag.setLetterSpacing ? tag.setLetterSpacing(2) : null;

      this.listTop = ins.top + 168;
      this.listH = H - this.listTop - ins.bottom - 148;
      this.buildList();
      this.buildFooter();

      kit.audio.music('music_menu', 900);
      this.menuKeys = { up: false, down: false, confirm: false, escape: false };

      this.scale.on('resize', this.onResize, this);
      this.events.once('shutdown', function () {
        this.scale.off('resize', this.onResize, this);
        Game.menu = null;
      }, this);
    },
    update: function () {
      if (pollButtons(this)) return;
      this.readMenuKeyboard();
      // Test switches are honoured from the menu too, so a harness can jump
      // straight into any district without walking the unlock chain.
      var s = CB_DEBUG_STATE;
      if (s.forceDistrict || s.forceMode) {
        var dk = s.forceDistrict || CB.CHALLENGES[this.selected].district;
        var mk = s.forceMode || CB.CHALLENGES[this.selected].mode;
        s.forceDistrict = ''; s.forceMode = '';
        this.startRun(CB.district(dk).key, CB.mode(mk).key, true);
      }
      s.unlockedCount = unlockedCount();
      s.bestScore = profile.bests[CB.CHALLENGES[this.selected].key] || 0;
    },
    extend: {
      buildBackdrop: function () {
        var W = this.W, H = this.H;
        var d = CB.district(CB.CHALLENGES[Math.min(this.selected, CB.CHALLENGES.length - 1)].district);
        this.skyImg = this.add.image(0, 0, gradientTexture(this,
          'sky_' + d.key, d.sky[0], d.sky[1]))
          .setOrigin(0, 0).setDisplaySize(W, H).setDepth(-20);
        this.far = this.add.tileSprite(0, H * 0.42, W, 224, d.bgFar)
          .setOrigin(0, 0).setDepth(-18).setAlpha(0.55);
        this.near = this.add.tileSprite(0, H * 0.56, W, 224, d.bgNear)
          .setOrigin(0, 0).setDepth(-17).setAlpha(0.75);
        this.tileDrift = 0;
      },
      buildList: function () {
        var W = this.W;
        this.rows = [];
        this.listBox = this.add.container(0, 0);
        var rowH = 62, gap = 8;
        var perPage = Math.max(3, Math.floor(this.listH / (rowH + gap)));
        this.perPage = perPage;
        this.pageTop = 0;
        for (var i = 0; i < perPage; i++) {
          var y = this.listTop + i * (rowH + gap) + rowH / 2;
          var c = this.add.container(W / 2, y);
          var rowKey = panelTexture(this, W - 28, rowH, 12);
          var rf = this.add.image(0, 0, rowKey + '_f').setOrigin(0.5);
          var rs = this.add.image(0, 0, rowKey + '_s').setOrigin(0.5);
          c.add(rf); c.add(rs);
          var name = label(this, -W / 2 + 58, -17, '', 15, '#f2ecff', 'bold');
          var sub = label(this, -W / 2 + 58, 3, '', 10, '#9c92c8');
          var badge = this.add.image(-W / 2 + 34, 0, 'atlas', 'medal_bronze').setOrigin(0.5);
          var lock = this.add.image(-W / 2 + 34, 0, 'atlas', 'lock').setOrigin(0.5);
          var best = label(this, W / 2 - 20, -6, '', 11, '#6eebff').setOrigin(1, 0.5);
          c.add(badge); c.add(lock); c.add(name); c.add(sub); c.add(best);
          c.setSize(W - 28, rowH);
          (function (scene, idx, cont) {
            // One tap drops in. Making the player select and then confirm
            // bought nothing on a list of runs, and it left the first tap on
            // the street map doing nothing visible.
            scene.__ggButtons = scene.__ggButtons || [];
            scene.__ggButtons.push({ c: cont, w: W - 28, h: rowH, onTap: function () {
              var real = scene.pageTop + idx;
              if (real >= CB.CHALLENGES.length) return;
              // Tapping a locked run takes you to the run you actually have
              // to clear to unlock it, rather than doing nothing.
              if (!isUnlocked(real)) real = Math.max(0, unlockedCount() - 1);
              scene.selected = real;
              scene.paintList();
              scene.launch();
            }});
          })(this, i, c);
          this.rows.push({ c: c, rf: rf, rs: rs, name: name, sub: sub,
                           badge: badge, lock: lock, best: best, h: rowH });
        }
        this.paintList();
      },
      paintList: function () {
        var W = this.W;
        var uc = unlockedCount();
        // keep the selection on screen
        if (this.selected < this.pageTop) this.pageTop = this.selected;
        if (this.selected >= this.pageTop + this.perPage) this.pageTop = this.selected - this.perPage + 1;
        this.pageTop = clamp(this.pageTop, 0, Math.max(0, CB.CHALLENGES.length - this.perPage));

        for (var i = 0; i < this.rows.length; i++) {
          var r = this.rows[i];
          var real = this.pageTop + i;
          if (real >= CB.CHALLENGES.length) { r.c.setVisible(false); continue; }
          r.c.setVisible(true);
          var chal = CB.CHALLENGES[real];
          var dist = CB.district(chal.district);
          var mode = CB.mode(chal.mode);
          var open = real < uc;
          var med = profile.medals[chal.key];
          var sel = (real === this.selected);

          r.rf.setTint(sel ? 0x2a2358 : 0x1a1636).setAlpha(open ? 0.94 : 0.55);
          r.rs.setTint(open ? dist.accent : 0x4a4470).setAlpha(sel ? 1 : 0.5);

          setTextIfChanged(r.name, dist.name + '  ' + mode.short);
          r.name.setColor(open ? '#f2ecff' : '#7a7398');
          setTextIfChanged(r.sub, open ? mode.blurb : 'Clear the run above to unlock');
          fitLabel(r.name, W - 130, 15, 10);
          fitLabel(r.sub, W - 120, 10, 8);

          r.lock.setVisible(!open);
          r.badge.setVisible(open && med != null);
          if (open && med != null) {
            r.badge.setFrame(['medal_bronze', 'medal_silver', 'medal_gold'][clamp(med, 0, 2)]);
          }
          var bestVal = profile.bests[chal.key] || 0;
          setTextIfChanged(r.best, open && bestVal
            ? (chal.mode === 'score' ? bestVal.toLocaleString() : String(bestVal))
            : '');
        }
        // repaint the backdrop tint for the selected district
        var d = CB.district(CB.CHALLENGES[this.selected].district);
        if (this.far.texture.key !== d.bgFar) {
          this.far.setTexture(d.bgFar);
          this.near.setTexture(d.bgNear);
          this.skyImg.setTexture(gradientTexture(this, 'sky_' + d.key, d.sky[0], d.sky[1]));
          this.skyImg.setDisplaySize(this.W, this.H);
        }
      },
      buildFooter: function () {
        var W = this.W, H = this.H, ins = Game.insets;
        var y = H - ins.bottom - 96;
        this.deckPreview = this.add.image(W / 2 - 96, y + 6, 'atlas',
          CB.livery(profile.livery).frame).setOrigin(0.5).setScale(1.05);
        this.deckName = label(this, W / 2 - 96, y + 34, CB.livery(profile.livery).name, 9, '#9c92c8')
          .setOrigin(0.5);
        var self = this;
        button(this, W / 2 - 96, y - 30, 148, 34, 'CHANGE DECK', function () {
          self.cycleLivery();
        }, { size: 12, fill: 0x1d1840 });
        button(this, W / 2 + 88, y, 150, 58, 'DROP IN', function () { self.launch(); },
          { size: 19, fill: 0x2a3f6b, stroke: 0x8cf5c8, color: '#8cf5c8' });

        this.hint = label(this, W / 2, H - ins.bottom - 30,
          'Hold to crouch, release to ollie. Swipe in the air for tricks. Swipe up over a rail to grind.',
          9, '#8a82ad').setOrigin(0.5);
        this.hint.setWordWrapWidth(W - 40);
        this.hint.setAlign('center');
        this.hint.setY(H - ins.bottom - 34);

        button(this, W - ins.right - 34, Game.insets.top + 24, 52, 34, 'SET', function () {
          openSettings();
        }, { size: 11, fill: 0x1d1840 });

        var mp = totalMedalPoints();
        this.medalCount = label(this, ins.left + 20, Game.insets.top + 24,
          'MEDALS ' + mp, 11, '#ffc660').setOrigin(0, 0.5);
        this.mapCount = label(this, ins.left + 20, Game.insets.top + 42,
          'HIGH LINES ' + discoveredShortcutCount() + '/' + CB.DISTRICTS.length,
          9, '#8cf5c8').setOrigin(0, 0.5);
      },
      cycleLivery: function () {
        var list = CB.LIVERIES;
        var at = 0, i;
        for (i = 0; i < list.length; i++) if (list[i].key === profile.livery) at = i;
        for (i = 1; i <= list.length; i++) {
          var cand = list[(at + i) % list.length];
          if (liveryUnlocked(cand)) {
            profile.livery = cand.key;
            persist();
            this.deckPreview.setFrame(cand.frame);
            setTextIfChanged(this.deckName, cand.name);
            return;
          }
        }
        setTextIfChanged(this.deckName, 'EARN MEDALS TO UNLOCK MORE');
      },
      readMenuKeyboard: function () {
        var up = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
        var down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
        var confirm = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
        var escape = kit.input.keyDown('Escape');
        if (up && !this.menuKeys.up) this.movePick(-1);
        if (down && !this.menuKeys.down) this.movePick(1);
        if (confirm && !this.menuKeys.confirm) this.launch();
        if (escape && !this.menuKeys.escape) openSettings();
        this.menuKeys.up = up; this.menuKeys.down = down;
        this.menuKeys.confirm = confirm; this.menuKeys.escape = escape;
      },
      movePick: function (dir) {
        var uc = unlockedCount();
        this.selected = clamp(this.selected + dir, 0, uc - 1);
        kit.audio.sfx('sfx_ui', { volume: 0.4 });
        this.paintList();
      },
      launch: function () {
        var chal = CB.CHALLENGES[this.selected];
        if (!isUnlocked(this.selected)) {
          kit.audio.sfx('sfx_fail', { volume: 0.4 });
          return;
        }
        this.startRun(chal.district, chal.mode, false);
      },
      startRun: function (districtKey, modeKey, forced) {
        kit.input.clearAll();
        kit.audio.stopMusic(400);
        var data = { district: districtKey, mode: modeKey, forced: !!forced };
        this.scene.start('Play', data);
      },
      // RESIZE mode fires on every layout settle, including ones where
      // nothing actually changed. Restarting on those was a self-inflicted
      // stutter, so a real dimension change is required first.
      onResize: function (size) {
        var w = Math.round(size ? size.width : this.scale.width);
        var h = Math.round(size ? size.height : this.scale.height);
        if (Math.abs(w - this.W) < 8 && Math.abs(h - this.H) < 8) return;
        kit.input.clearAll();
        this.scene.restart();
      }
    }
  };

  // =============================================================== play
  var PlayScene = {
    key: 'Play',

    init: function (data) {
      this.launchData = data || { district: 'downtown', mode: 'score' };
      this.districtKey = CB.district(this.launchData.district).key;
      this.modeKey = CB.mode(this.launchData.mode).key;
    },

    create: function () {
      Game.play = this;
      CB_DEBUG_STATE.scene = 'play';
      var W = this.scale.width, H = this.scale.height;
      this.W = W; this.H = H;
      this.ins = Game.insets;

      this.district = CB.district(this.districtKey);
      this.mode = CB.mode(this.modeKey);
      this.challenge = CB.challenge(this.districtKey + ':' + this.modeKey);
      this.baseY = 640;

      this.run = new SIM.Run({
        district: this.districtKey,
        mode: this.modeKey,
        seed: (Date.now() & 0x7fffffff) ^ 0x51ceb0,
        baseY: this.baseY
      });
      this.ctl = SIM.makeControl();
      this.claimed = null;      // {id, sx, sy, fired, downAt}
      this.keyHeld = false;
      this.pendingSwipe = 0;
      this.simTime = 0;
      this.acc = 0;
      this.cosmetic = 0;
      this.rollTimer = 0;
      this.grindTimer = 0;
      this.heat = 0;
      this.audioLayer = '';
      this.cameraDip = 0;
      this.camZoom = 1;
      this.crowdReact = 0;
      this.crowdReactMode = 'cheer';
      this.fxRng = new SIM.Rng(this.run.seed ^ 0x2c5f9a17);
      this.padState = { left: false, right: false, up: false, down: false };
      this.resultKeys = { confirm: false, escape: false };
      this.overAt = -1;
      this.finished = false;
      this.noticeQueue = [];
      this.noticeKind = '';
      this.noticeLife = 0;

      this.cameras.main.setBackgroundColor(this.district.sky[1]);
      this.buildSky();
      this.buildLayers();
      this.buildParticles();
      this.buildSkater();
      this.buildHud();
      this.buildBanner();
      this.buildCoach();
      this.buildResult();

      this.camX = 0; this.camY = 0;
      this.syncCamera(true);

      kit.audio.music(this.district.music, 700);
      this.audioLayer = this.district.music;
      // Run-boundary announcement only; active-play events use the notice chip.
      this.showBanner(this.district.name, this.mode.name, this.district.accent);
      kit.audio.sfx('sfx_district', { volume: 0.7 });

      if (!profile.seenCoach) {
        this.coachLesson = { step: 0, active: true };
        this.coachSay('1/4  Hold + release to ollie');
      } else {
        this.coachLesson = null;
      }

      this.scale.on('resize', this.onResize, this);
      this.events.once('shutdown', function () {
        this.scale.off('resize', this.onResize, this);
        Game.play = null;
      }, this);

      this.syncDebug();
    },

    update: function (time, delta) {
      if (pollButtons(this)) return;
      if (this.readPauseKeys()) return;
      this.consumeSwitches();
      this.readControl();

      var juice = kit.juice.frame();
      var dt = Math.min(0.10, delta / 1000);
      // COSMETIC clock: the only thing hit-stop is allowed to freeze.
      if (!juice.frozen) this.cosmetic += dt;

      this.stepSim(dt);
      this.syncCamera(false);
      this.drawStreet();
      this.bindEntities();
      this.drawSkater();
      this.updateHud(dt);
      this.updateCoach(dt);
      this.updateAudio(dt);
      if (this.crowdReact > 0) this.crowdReact = Math.max(0, this.crowdReact - dt * 1.8);
      this.applyShake(juice);
      this.syncDebug();
    },

    extend: {
      // ------------------------------------------------------ fixed sim
      // A degraded device runs the sim SLOWLY. It never skips time: the
      // accumulator is capped, the leftover is discarded, and no other clock
      // in this scene is allowed to run ahead of the steps that actually ran.
      stepSim: function (dt) {
        if (this.run.over && this.finished) return;
        this.acc += dt;
        var steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS) {
          this.run.step(STEP, this.ctl);
          this.acc -= STEP;
          steps++;
          this.simTime += STEP;
          // one-shot control edges are consumed by exactly one sim step
          this.ctl.swipe = 0;
          this.ctl.press = false;
          this.ctl.release = false;
        }
        if (this.acc > STEP * MAX_STEPS) this.acc = STEP * MAX_STEPS;
        this.run.drainEvents(this.onSimEvent, this);
        if (this.run.over && !this.finished) this.onRunOver();
      },

      // ------------------------------------------------------- controls
      // All gameplay input comes from GGKit's per-pointer identity map plus
      // its keyboard set. A second finger can never steal the first one's
      // claim, and a restart clears the claim before onRestart runs.
      readControl: function () {
        var ctl = this.ctl;
        ctl.balAxis = 0;
        ctl.tap = false;
        var W = this.W, H = this.H;

        // ---- keyboard ----
        var kUp = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
        var kDown = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
        var kLeft = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA');
        var kRight = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD');
        var kPop = kit.input.keyDown('Space') || kit.input.keyDown('Enter');

        var sk = this.run.skater;
        if (sk.state === 'grind') {
          if (kLeft) ctl.balAxis = -1;
          else if (kRight) ctl.balAxis = 1;
        } else {
          if (kLeft && !this.kLeftWas) this.pendingSwipe = 1;
          if (kRight && !this.kRightWas) this.pendingSwipe = 2;
        }
        if (kUp && !this.kUpWas) this.pendingSwipe = 3;
        if (kDown && !this.kDownWas) this.pendingSwipe = 4;
        this.kLeftWas = kLeft; this.kRightWas = kRight;
        this.kUpWas = kUp; this.kDownWas = kDown;

        // ---- gamepad bridge -----------------------------------------
        // Gamepad state is sampled into the same control record as GGKit's
        // pointer and keyboard state. It never owns pause, restart, or UI.
        var padHeld = false;
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        var gp = pads && pads[0];
        if (gp) {
          var px = Math.abs(gp.axes[0] || 0) > 0.35 ? (gp.axes[0] || 0) : 0;
          var py = Math.abs(gp.axes[1] || 0) > 0.35 ? (gp.axes[1] || 0) : 0;
          var pLeft = px < -0.35, pRight = px > 0.35;
          var pUp = py < -0.35, pDown = py > 0.35;
          if (sk.state === 'grind') ctl.balAxis = px;
          else {
            if (pLeft && !this.padState.left) this.pendingSwipe = 1;
            if (pRight && !this.padState.right) this.pendingSwipe = 2;
          }
          if (pUp && !this.padState.up) this.pendingSwipe = 3;
          if (pDown && !this.padState.down) this.pendingSwipe = 4;
          this.padState.left = pLeft; this.padState.right = pRight;
          this.padState.up = pUp; this.padState.down = pDown;
          padHeld = !!(gp.buttons[0] && gp.buttons[0].pressed);
        }

        // ---- pointer, claimed by identity ----
        var live = null;
        if (this.claimed) {
          live = kit.input.pointers.get(this.claimed.id) || null;
          if (!live) {
            // released: a short, still touch is a tap
            var held = performance.now() - this.claimed.downAt;
            if (!this.claimed.fired && held < 260 && this.claimed.moved < 18) ctl.tap = true;
            this.claimed = null;
          }
        }
        if (!this.claimed) {
          var it = kit.input.pointers.entries();
          var nx = it.next();
          while (!nx.done) {
            var id = nx.value[0], p = nx.value[1];
            if (p.y > this.hudBottom) {
              this.claimed = { id: id, sx: p.startX, sy: p.startY, fired: false,
                               downAt: p.downAt, moved: 0 };
              live = p;
              break;
            }
            nx = it.next();
          }
        }

        if (live && this.claimed) {
          var dx = live.x - this.claimed.sx;
          var dy = live.y - this.claimed.sy;
          var mag = Math.sqrt(dx * dx + dy * dy);
          if (mag > this.claimed.moved) this.claimed.moved = mag;
          if (sk.state === 'grind') {
            // micro-drag correction: small, live, and continuous
            ctl.balAxis = clamp(dx / 46, -1, 1);
          } else if (!this.claimed.fired && mag > 26) {
            this.claimed.fired = true;
            if (Math.abs(dx) > Math.abs(dy)) this.pendingSwipe = dx < 0 ? 1 : 2;
            else this.pendingSwipe = dy < 0 ? 3 : 4;
          }
        }

        var pointerHeld = !!(live && !this.claimed.fired) || (live && sk.state === 'grind');
        ctl.held = !!(kPop || pointerHeld || padHeld);
        ctl.swipe = this.pendingSwipe;
        this.pendingSwipe = 0;
      },

      clearControl: function () {
        this.claimed = null;
        this.pendingSwipe = 0;
        this.ctl.held = false;
        this.ctl.swipe = 0;
        this.ctl.tap = false;
        this.ctl.press = false;
        this.ctl.release = false;
        this.ctl.balAxis = 0;
        this.kLeftWas = this.kRightWas = this.kUpWas = this.kDownWas = false;
        this.padState.left = this.padState.right = this.padState.up = this.padState.down = false;
        if (this.run) this.run.cancelCharge();
      },

      readPauseKeys: function () {
        var escape = kit.input.keyDown('Escape');
        var pause = kit.input.keyDown('KeyP');
        var confirm = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
        if (!this.pauseKeys) this.pauseKeys = { escape: false, pause: false };
        if (this.run.over && this.result.visible) {
          if (confirm && !this.resultKeys.confirm) { kit.restart(); return true; }
          else if (escape && !this.resultKeys.escape) {
            kit.input.clearAll();
            kit.audio.stopMusic(300);
            this.scene.start('Menu');
            return true;
          }
          this.resultKeys.confirm = confirm; this.resultKeys.escape = escape;
          return false;
        }
        if ((escape && !this.pauseKeys.escape) || (pause && !this.pauseKeys.pause)) {
          openSettings();
          return true;
        }
        this.pauseKeys.escape = escape; this.pauseKeys.pause = pause;
        return false;
      },

      // ---------------------------------------------------- test switches
      consumeSwitches: function () {
        var s = CB_DEBUG_STATE;
        if (s.forceDistrict) {
          var dk = CB.district(s.forceDistrict).key;
          s.forceDistrict = '';
          if (dk !== this.districtKey) {
            this.scene.start('Play', { district: dk, mode: this.modeKey, forced: true });
            return;
          }
        }
        if (s.forceMode) {
          var mk = CB.mode(s.forceMode).key;
          s.forceMode = '';
          if (mk !== this.modeKey) {
            this.scene.start('Play', { district: this.districtKey, mode: mk, forced: true });
            return;
          }
        }
        if (s.forceGenerousDrops) {
          this.run.world.streetGaps = Math.max(this.run.world.streetGaps, 0.5);
          this.run.saves = Math.max(this.run.saves, 3);
          this.run.boost = Math.max(this.run.boost, 2);
        }
        if (s.forceEvent) {
          var ev = s.forceEvent;
          s.forceEvent = '';
          this.applyForcedEvent(ev);
        }
      },

      applyForcedEvent: function (ev) {
        var run = this.run;
        if (ev === 'bail') run.bail('forced');
        else if (ev === 'save') { run.saves++; run.emit('save', 'forced'); }
        else if (ev === 'gap') {
          run.gapsCleared++;
          run.score += 900;
          this.onSimEvent({ type: 'gap', a: 'FORCED GAP', b: 900 });
        } else if (ev === 'shortcut') {
          run.shortcutsFound++;
          this.onSimEvent({ type: 'shortcut', a: 'FORCED LINE', b: 750 });
        } else if (ev === 'combo') {
          for (var i = 0; i < 5; i++) run.combo.addTrick('FORCED', 200);
          this.onSimEvent({ type: 'trick', a: 'FORCED', b: 200 });
        } else if (ev === 'bank') {
          run.score += run.combo.bank();
          this.onSimEvent({ type: 'bank', a: 5000, b: 'FORCED' });
        } else if (ev === 'prompt') {
          run.prompt = { trick: 'kickflip', name: 'Gutter Whip', dir: 'left' };
          run.promptTime = T.PROMPT_TIME;
          this.onSimEvent({ type: 'prompt', a: 'Gutter Whip', b: 'left' });
        } else if (ev === 'boost') {
          run.boost = 3.2;
          this.onSimEvent({ type: 'pickup', a: 'boost', b: 'SPEED BOOST' });
        } else if (ev === 'grind') {
          var w = run.world, best = null;
          for (var gi = 0; gi < w.segs.n; gi++) {
            var seg = w.segs.items[gi];
            if (seg.k !== 'rail' && seg.k !== 'ledge' && seg.k !== 'deck') continue;
            if (seg.x1 < run.skater.x + 40) continue;
            if (!best || seg.x0 < best.x0) best = seg;
          }
          if (best) {
            run.skater.x = Math.max(best.x0 + 24, run.skater.x);
            w.grindHit.seg = best;
            w.grindHit.y = SIM.segY(best, run.skater.x);
            run.enterGrind(w.grindHit);
          }
        } else if (ev === 'wobble') {
          run.skater.bal = 0.85;
          this.onSimEvent({ type: 'wobble', a: 0.85 });
        } else if (ev === 'over') run.finish('forced');
        else if (ev === 'banner') this.queueNotice('event', 'TEST BANNER', this.district.accent);
        CB_DEBUG_STATE.lastEvent = 'forced:' + ev;
      },

      // ------------------------------------------------------------ sky
      buildSky: function () {
        var W = this.W, H = this.H, d = this.district;
        this.skyImg = this.add.image(0, 0, gradientTexture(this,
          'sky_' + d.key, d.sky[0], d.sky[1]))
          .setOrigin(0, 0).setDisplaySize(W, H).setScrollFactor(0).setDepth(-40);
        this.far = this.add.tileSprite(0, 0, W, 224, d.bgFar)
          .setOrigin(0, 0).setScrollFactor(0).setDepth(-32).setAlpha(0.62);
        this.near = this.add.tileSprite(0, 0, W, 224, d.bgNear)
          .setOrigin(0, 0).setScrollFactor(0).setDepth(-30).setAlpha(0.86);
      },

      // ---------------------------------------------------------- layers
      buildLayers: function () {
        var W = this.W, H = this.H;
        // crowd and props sit behind the street surface
        this.crowdPool = this.makeSpritePool('atlas', 'crowd_0', 26, -24, 0.5, 1);
        this.propPool = this.makeSpritePool('atlas', 'sign', 22, -22, 0.5, 1);

        // asphalt: a tiling ground texture clipped to the street shape
        // Preallocated scratch for the street renderer: polygon points and
        // the visible-segment list. Both are reused every frame.
        var polyCap = Math.ceil((this.W + 240) / 10) + 8;
        this.polyStore = new Array(polyCap);
        for (var pi = 0; pi < polyCap; pi++) this.polyStore[pi] = { x: 0, y: 0 };
        this.polyView = [];
        this.visSegs = new Array(48);
        // Column grid for the street heightfield, sized to the viewport once.
        this.COL_STEP = 10;
        this.streetCols = new Array(Math.ceil((this.W + 200) / 10) + 4);

        this.streetMaskG = this.make.graphics({ x: 0, y: 0, add: false });
        this.streetTile = this.add.tileSprite(0, 0, W + 96, H + 96, 'ground')
          .setOrigin(0, 0).setDepth(-16).setTint(this.district.asphalt);
        this.streetTile.setMask(this.streetMaskG.createGeometryMask());
        // Visible street features are authored textures. The only Graphics
        // object here is an invisible geometry mask for the textured asphalt.
        this.surfacePool = this.makeSpritePool('surface_rail', null, 42, -13, 0, 0);
        this.stepPool = this.makeSpritePool('surface_step', null, 42, -14, 0, 0);

        this.carPool = this.makeSpritePool('atlas', 'car_sedan', 14, -12, 0, 0);
        this.obsPool = this.makeSpritePool('atlas', 'cone', 34, -10, 0.5, 1);
        this.pickPool = this.makeSpritePool('atlas', 'pk_combo', 26, -8, 0.5, 0.5);
        this.flagPool = this.makeSpritePool('atlas', 'gapflag', 10, -14, 0.5, 1);
        this.beatPool = this.makeSpritePool('atlas', 'gapflag', 12, -12, 0.5, 1);
      },

      // Immediate-mode sprite binding. Sim records never hold a sprite; each
      // frame we walk the live records and lease sprites off the front of a
      // preallocated pool, then hide the leftovers.
      makeSpritePool: function (tex, frame, count, depth, ox, oy) {
        var pool = { list: new Array(count), used: 0, depth: depth };
        for (var i = 0; i < count; i++) {
          var s = (frame == null ? this.add.image(0, 0, tex) : this.add.image(0, 0, tex, frame))
            .setOrigin(ox, oy).setDepth(depth).setVisible(false);
          pool.list[i] = s;
        }
        return pool;
      },
      leaseSprite: function (pool) {
        if (pool.used >= pool.list.length) return null;
        var s = pool.list[pool.used++];
        s.setVisible(true);
        return s;
      },
      finishPool: function (pool) {
        for (var i = pool.used; i < pool.list.length; i++) {
          if (pool.list[i].visible) pool.list[i].setVisible(false);
        }
        pool.used = 0;
      },

      // ------------------------------------------------------- particles
      buildParticles: function () {
        var d = this.district;
        var lowFx = reducedMotion;
        this.pDust = this.add.particles(0, 0, 'p_dust', {
          lifespan: lowFx ? 260 : 460, speed: { min: 30, max: 110 }, angle: { min: 170, max: 300 },
          scale: { start: 0.42, end: 0 }, alpha: { start: 0.55, end: 0 },
          gravityY: 240, quantity: 1, emitting: false, tint: 0xe6e0d2
        }).setDepth(-8);
        this.pChalk = this.add.particles(0, 0, 'p_chalk', {
          lifespan: lowFx ? 300 : 620, speed: { min: 40, max: 150 }, angle: { min: 150, max: 250 },
          scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
          gravityY: 420, quantity: 1, emitting: false, tint: 0xf4f0ff
        }).setDepth(6);
        this.pSpark = this.add.particles(0, 0, 'p_spark', {
          lifespan: lowFx ? 220 : 420, speed: { min: 120, max: 340 }, angle: { min: 150, max: 215 },
          scale: { start: 0.9, end: 0.1 }, alpha: { start: 1, end: 0 },
          gravityY: 620, quantity: 1, emitting: false, tint: 0xffe4a0,
          blendMode: 'ADD'
        }).setDepth(7);
        this.pSmoke = this.add.particles(0, 0, 'p_smoke', {
          lifespan: lowFx ? 400 : 900, speed: { min: 10, max: 70 }, angle: { min: 200, max: 340 },
          scale: { start: 0.5, end: 1.5 }, alpha: { start: 0.35, end: 0 },
          gravityY: -30, quantity: 1, emitting: false, tint: 0x9a92b8
        }).setDepth(5);
        this.pGlow = this.add.particles(0, 0, 'p_glow', {
          lifespan: lowFx ? 260 : 520, speed: { min: 20, max: 130 },
          scale: { start: 0.5, end: 0 }, alpha: { start: 0.9, end: 0 },
          quantity: 1, emitting: false, tint: d.accent, blendMode: 'ADD'
        }).setDepth(8);
        this.pRing = this.add.particles(0, 0, 'p_ring', {
          lifespan: 420, speed: 0, scale: { start: 0.15, end: 1.15 },
          alpha: { start: 0.85, end: 0 }, quantity: 1, emitting: false,
          tint: d.accent, blendMode: 'ADD'
        }).setDepth(9);
      },

      burst: function (emitter, x, y, n) {
        if (reducedMotion) n = Math.max(1, Math.round(n * 0.45));
        emitter.emitParticleAt(x, y, n);
      },

      // ---------------------------------------------------------- skater
      buildSkater: function () {
        var liv = CB.livery(profile.livery);
        this.rig = this.add.container(0, 0).setDepth(12);
        // The rig origin sits on the deck plank. The deck art is 76x22 with
        // the plank at y 4..11 and the wheels at y 12..21, so an origin of
        // 0.28 puts the pivot in the plank and the rider's feet land at -2.
        this.deck = this.add.image(0, 0, 'atlas', liv.frame).setOrigin(0.5, 0.28);
        // The rider anchor is the DECK LINE inside the pose art (y=84 of 92),
        // not the sprite's bottom edge. Every pose is drawn against that same
        // line, so a rolling pose plants its shoes on the plank while a tuck
        // or a grab lifts the feet off it, which is exactly what should
        // happen. Anchoring to the sprite edge instead made the whole rider
        // float above the board.
        this.rider = this.add.image(2, -2, 'atlas', 'rider_roll').setOrigin(0.5, 84 / 92);
        this.rig.add(this.deck);
        this.rig.add(this.rider);
        this.shadow = this.add.ellipse(0, 0, 54, 12, 0x000000, 0.34).setDepth(11);

        // ragdoll: its own preallocated part sprites, hidden until a bail
        this.rag = [];
        var parts = ['rag_torso', 'rag_head', 'rag_arm', 'rag_arm', 'rag_leg', 'rag_leg'];
        for (var i = 0; i < parts.length; i++) {
          var jx = i === 1 ? 0 : i === 2 ? -18 : i === 3 ? 18 : i === 4 ? -10 : i === 5 ? 10 : 0;
          var jy = i === 1 ? -30 : i === 2 || i === 3 ? -12 : i === 4 || i === 5 ? 22 : 0;
          this.rag.push({
            spr: this.add.image(0, 0, 'atlas', parts[i]).setOrigin(0.5).setDepth(13).setVisible(false),
            x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, jointX: jx, jointY: jy
          });
        }
        this.ragDeck = {
          spr: this.add.image(0, 0, 'atlas', liv.frame).setOrigin(0.5).setDepth(13).setVisible(false),
          x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0
        };
        this.ragActive = false;
        // One flat list built once, so the per-frame ragdoll step never
        // allocates an array to iterate.
        this.ragAll = this.rag.slice();
        this.ragAll.push(this.ragDeck);

        // wobble meter rides just above the skater during a grind
        this.wob = this.add.container(0, 0).setDepth(60).setVisible(false);
        this.wobBg = this.add.rectangle(0, 0, 86, 9, 0x120f26, 0.86).setStrokeStyle(1.5, 0x6eebff, 0.9);
        this.wobFill = this.add.rectangle(0, 0, 6, 5, 0x8cf5c8);
        this.wobTickL = this.add.rectangle(-30, 0, 2, 9, 0xff688a, 0.8);
        this.wobTickR = this.add.rectangle(30, 0, 2, 9, 0xff688a, 0.8);
        this.wob.add([this.wobBg, this.wobTickL, this.wobTickR, this.wobFill]);
      },

      // ------------------------------------------------------------- hud
      buildHud: function () {
        var W = this.W, ins = this.ins;
        var top = ins.top + 10;
        this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

        var bandW = W - ins.left - ins.right - 16;
        var band = panel(this, ins.left + 8 + bandW / 2, top + 27, bandW, 54, 12,
          0x0e0b1e, 0.72, this.district.accent, 0.5);
        this.hud.add(band);

        this.tScore = label(this, ins.left + 22, top + 8, '★ 0', 22, '#f2ecff', 'bold');
        this.tRight = label(this, W - ins.right - 22, top + 8, '', 18, this.district.accentCss, 'bold')
          .setOrigin(1, 0);
        this.tMid = label(this, W / 2, top + 37, '', 14, '#8a82ad').setOrigin(0.5, 0);
        this.hud.add([this.tScore, this.tRight, this.tMid]);

        // combo chip + decay bar
        this.chip = this.add.container(ins.left + 18, top + 78);
        var chipKey = panelTexture(this, 100, 24, 8);
        var chipG = this.add.image(50, 0, chipKey + '_f').setOrigin(0.5).setTint(0x2a1f52).setAlpha(0.95);
        var chipS = this.add.image(50, 0, chipKey + '_s').setOrigin(0.5).setTint(0xbc8cff).setAlpha(0.9);
        this.tMult = label(this, 8, -9, 'x1.0', 14, '#bc8cff', 'bold');
        this.decayTrack = this.add.rectangle(54, 0, 36, 6, 0x140f2c).setOrigin(0, 0.5);
        this.decayBar = this.add.rectangle(54, 0, 36, 6, 0xbc8cff).setOrigin(0, 0.5);
        this.chip.add([chipG, chipS, this.tMult, this.decayTrack, this.decayBar]);
        this.chip.setAlpha(0);
        this.hud.add(this.chip);

        // saves + boost indicators: icons carry the meaning; values carry the state
        this.tSaves = label(this, W - ins.right - 22, top + 73, '', 14, '#8cf5c8').setOrigin(1, 0);
        this.tBoost = label(this, W - ins.right - 22, top + 90, '', 14, '#6eebff').setOrigin(1, 0);
        this.hud.add([this.tSaves, this.tBoost]);

        // bonus-trick prompt: compact HUD state, never a second callout
        this.promptBox = this.add.container(W / 2, top + 104).setAlpha(0);
        this.promptW = Math.min(160, W - 32);
        var pKey = panelTexture(this, this.promptW, 24, 8);
        this.tPrompt = label(this, 0, 0, '', 14, '#ffc660', 'bold').setOrigin(0.5);
        this.promptBox.add([
          this.add.image(0, 0, pKey + '_f').setOrigin(0.5).setTint(0x3a2a10).setAlpha(0.94),
          this.add.image(0, 0, pKey + '_s').setOrigin(0.5).setTint(0xffc660).setAlpha(0.95),
          this.tPrompt
        ]);
        this.hud.add(this.promptBox);

        this.hudBottom = top + 160;

        // pause / settings, top right, below the notice slot
        var self = this;
        this.pauseBtn = button(this, W - ins.right - 34, top + 181, 52, 44, 'II', function () {
          openSettings();
        }, { size: 13, fill: 0x1d1840 });
        this.pauseBtn.setScrollFactor(0).setDepth(101);
      },

      buildBanner: function () {
        var W = this.W, H = this.H;
        var bw = Math.round(W * 0.60);
        this.bannerW = bw;
        // Below the coach strip, above the play centre: the two used to
        // overlap at 0.26H and print through each other.
        this.banner = this.add.container(W / 2, H * 0.36)
          .setScrollFactor(0).setDepth(120).setVisible(false);
        var bKey = panelTexture(this, bw, 68, 12);
        this.bannerFill = this.add.image(0, 0, bKey + '_f').setOrigin(0.5).setTint(0x0e0b1e).setAlpha(0.94);
        this.bannerEdge = this.add.image(0, 0, bKey + '_s').setOrigin(0.5).setTint(0x6eebff);
        this.bannerT1 = label(this, 0, -16, '', 18, '#f2ecff', 'bold').setOrigin(0.5, 0);
        this.bannerT2 = label(this, 0, 8, '', 10, '#9c92c8').setOrigin(0.5, 0);
        this.banner.add([this.bannerFill, this.bannerEdge, this.bannerT1, this.bannerT2]);
        this.bannerLife = 0;
      },

      // COACH STRIP: thin, top-anchored, fades. It must never sit over the
      // centre of the play area or anywhere in the bottom half.
      buildCoach: function () {
        var W = this.W;
        // One shared transient slot. Coach copy is a thin top strip; event
        // copy is a small corner chip in the same slot, never both.
        var top = this.ins.top + 10;
        var coachY = top + 137;
        var toastW = Math.min(224, W - this.ins.left - this.ins.right - 28);
        var toastRight = W - this.ins.right - 14;
        this.coach = this.add.container(0, 0)
          .setScrollFactor(0).setDepth(110).setAlpha(0).setVisible(false);
        var cKey = panelTexture(this, W - 44, 26, 8);
        this.coachBg = this.add.image(W / 2, coachY, cKey + '_f').setOrigin(0.5)
          .setTint(0x0e0b1e).setAlpha(0.80);
        this.tCoach = label(this, W / 2, coachY, '', 14, '#cfc6f0').setOrigin(0.5);
        var tKey = panelTexture(this, toastW, 26, 8);
        this.toastBg = this.add.image(toastRight - toastW / 2, coachY, tKey + '_f')
          .setOrigin(0.5).setTint(0x0e0b1e).setAlpha(0.92);
        this.tToast = label(this, toastRight - 12, coachY, '', 14, '#f2ecff', 'bold')
          .setOrigin(1, 0.5);
        this.coach.add([this.coachBg, this.tCoach, this.toastBg, this.tToast]);
      },

      buildResult: function () {
        var W = this.W, H = this.H;
        this.result = this.add.container(W / 2, H * 0.44)
          .setScrollFactor(0).setDepth(140).setVisible(false);
        var cw = Math.min(W - 40, 340);
        this.resultW = cw;
        var rKey = panelTexture(this, cw, 312, 18);
        var rFill = this.add.image(0, 0, rKey + '_f').setOrigin(0.5).setTint(0x120f26).setAlpha(0.97);
        var rEdge = this.add.image(0, 0, rKey + '_s').setOrigin(0.5).setTint(this.district.accent);
        this.rTitle = label(this, 0, -138, '', 20, '#f2ecff', 'bold').setOrigin(0.5, 0);
        this.rSub = label(this, 0, -112, '', 10, '#9c92c8').setOrigin(0.5, 0);
        this.rMedal = this.add.image(0, -66, 'atlas', 'medal_bronze').setOrigin(0.5).setScale(1.5);
        this.rValue = label(this, 0, -32, '', 30, '#6eebff', 'bold').setOrigin(0.5, 0);
        this.rValueCap = label(this, 0, 4, '', 9, '#8a82ad').setOrigin(0.5, 0);
        this.rLines = [];
        for (var i = 0; i < 4; i++) {
          this.rLines.push(label(this, -cw / 2 + 24, 26 + i * 17, '', 11, '#cfc6f0'));
        }
        this.result.add([rFill, rEdge, this.rTitle, this.rSub, this.rMedal, this.rValue, this.rValueCap]);
        for (i = 0; i < this.rLines.length; i++) this.result.add(this.rLines[i]);

        var self = this;
        this.rAgain = button(this, -cw / 4 - 4, 124, cw / 2 - 16, 46, 'RUN AGAIN', function () {
          kit.restart();
        }, { size: 14, fill: 0x2a3f6b, stroke: 0x8cf5c8, color: '#8cf5c8' });
        this.rMenu = button(this, cw / 4 + 4, 124, cw / 2 - 16, 46, 'STREET MAP', function () {
          kit.input.clearAll();
          kit.audio.stopMusic(300);
          self.scene.start('Menu');
        }, { size: 14 });
        this.result.add([this.rAgain, this.rMenu]);
      },

      // ---------------------------------------------------------- camera
      syncCamera: function (snap) {
        var sk = this.run.skater;
        var W = this.W, H = this.H;
        var lead = clamp((sk.vx - T.SPEED_BASE) * 0.24, -18, 112);
        var tx = sk.x - W * 0.32 + lead;
        var ty = sk.y - H * 0.72 + (reducedMotion ? 0 : this.cameraDip);
        var speedZoom = 1 - clamp((sk.vx - T.SPEED_BASE) / 520, 0, 1) * 0.055;
        this.camZoom += (speedZoom - this.camZoom) * 0.10;
        this.cameraDip += (0 - this.cameraDip) * 0.13;
        // keep the street from sitting under the HUD band on tall drops
        ty = clamp(ty, this.baseY - H * 0.95, this.baseY - H * 0.34);
        if (snap) { this.camX = tx; this.camY = ty; }
        else {
          this.camX += (tx - this.camX) * 0.42;
          this.camY += (ty - this.camY) * 0.14;
        }
        this.cameras.main.setScroll(this.camX, this.camY);
        this.cameras.main.setZoom(this.camZoom);
        this.far.tilePositionX = this.camX * 0.16;
        this.near.tilePositionX = this.camX * 0.34;
        this.far.y = clamp(this.baseY - this.camY - 300, -220, this.H * 0.5);
        this.near.y = clamp(this.baseY - this.camY - 214, -160, this.H * 0.62);
      },

      applyShake: function (juice) {
        if (!kit.juice.enabled || reducedMotion) { this.cameras.main.setScroll(this.camX, this.camY); return; }
        this.cameras.main.setScroll(this.camX + juice.dx, this.camY + juice.dy);
      },

      // ---------------------------------------------------------- street
      // FEEL BUDGET NOTE. The first cut of this drew one fill and two strokes
      // per segment and built a fresh {x,y} array per polygon, which meant
      // ~150 path batches and a few hundred object allocations EVERY FRAME.
      // On a 4x throttled CPU that alone blew the whole frame budget. The
      // rewrite does two things: contiguous street segments are merged into
      // RUNS so the ground is a handful of polygons instead of forty, and
      // every stroke of the same style shares ONE beginPath/strokePath. All
      // polygon points come from a preallocated store, so the hot path
      // allocates nothing at all.
      streetRun: function (target, closeShape) {
        var v = this.polyView;
        if (v.length > 2) target.fillPoints(v, closeShape !== false);
      },
      pushPt: function (x, y) {
        var store = this.polyStore, v = this.polyView;
        var i = v.length;
        if (i >= store.length) return;
        var p = store[i];
        p.x = x; p.y = y;
        v.push(p);
      },

      drawStreet: function () {
        var w = this.run.world, W = this.W, H = this.H;
        var x0 = this.camX - 80, x1 = this.camX + W + 80;
        var bottom = this.camY + H + 90;
        var i, s;

        this.streetTile.setPosition(this.camX - 48, this.camY - 48);
        this.streetTile.tilePositionX = this.camX;
        this.streetTile.tilePositionY = this.camY;

        var m = this.streetMaskG;
        m.clear();
        m.fillStyle(0xffffff, 1);

        // ---- collect the visible ground segments, in world order ----
        var vis = this.visSegs;
        var n = 0;
        for (i = 0; i < w.segs.n; i++) {
          s = w.segs.items[i];
          if (s.x1 < x0 || s.x0 > x1) continue;
          if (s.k !== 'street' && s.k !== 'stair' && s.k !== 'ramp') continue;
          if (n < vis.length) vis[n++] = s;
        }
        // insertion sort: n is small (about a dozen) and already near-sorted
        for (i = 1; i < n; i++) {
          var key = vis[i], j = i - 1;
          while (j >= 0 && vis[j].x0 > key.x0) { vis[j + 1] = vis[j]; j--; }
          vis[j + 1] = key;
        }

        // ---- ground as a sampled heightfield -------------------------
        // Segments overlap on purpose (feature lead-ins are laid backwards
        // over the street that precedes them), so stitching raw segment
        // endpoints into a polygon produced self-intersecting, zig-zagging
        // fills. Sampling the TOP surface on a fixed column grid is immune
        // to that: it always yields a simple, monotonic-in-x polygon, and a
        // column with no surface under it is a gap that breaks the run.
        var cols = this.streetCols;
        var step = this.COL_STEP;
        var nc = Math.min(cols.length, Math.ceil((x1 - x0) / step) + 1);
        for (i = 0; i < nc; i++) {
          var cx = x0 + i * step;
          var top = null;
          for (var si = 0; si < n; si++) {
            var vs = vis[si];
            if (cx < vs.x0 || cx > vs.x1) continue;
            var vy = SIM.segY(vs, cx);
            if (top === null || vy < top) top = vy;
          }
          cols[i] = top;
        }

        var runStart = -1;
        for (i = 0; i <= nc; i++) {
          var has = (i < nc && cols[i] !== null);
          if (has && runStart < 0) runStart = i;
          if (!has && runStart >= 0) {
            this.polyView.length = 0;
            for (var ci = runStart; ci < i; ci++) this.pushPt(x0 + ci * step, cols[ci]);
            this.pushPt(x0 + (i - 1) * step, bottom);
            this.pushPt(x0 + runStart * step, bottom);
            this.streetRun(m, true);
            runStart = -1;
          }
        }

        // ---- authored feature surfaces --------------------------------
        // Ground remains an authored asphalt texture clipped to the playable
        // heightfield. Stairs, ramps, ledges, decks, and rails are all
        // materialized authored textures, never runtime line art.
        this.finishPool(this.surfacePool);
        this.finishPool(this.stepPool);
        for (i = 0; i < n; i++) {
          s = vis[i];
          if (s.k !== 'stair' && s.k !== 'ramp') continue;
          var stepSprite = this.leaseSprite(this.stepPool);
          if (!stepSprite) break;
          stepSprite.setTexture(s.k === 'stair' ? 'surface_step' : 'surface_ramp');
          stepSprite.setOrigin(0, 0);
          stepSprite.setRotation(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
          stepSprite.setPosition(s.x0, s.k === 'stair' ? s.y1 : s.y0 - 4);
          stepSprite.setDisplaySize(Math.max(12, s.x1 - s.x0), s.k === 'stair' ? 44 : 58);
          stepSprite.setAlpha(1);
        }
        for (i = 0; i < w.segs.n; i++) {
          s = w.segs.items[i];
          if (s.x1 < x0 || s.x0 > x1) continue;
          if (s.k !== 'ledge' && s.k !== 'deck' && s.k !== 'rail') continue;
          var feature = this.leaseSprite(this.surfacePool);
          if (!feature) break;
          var texture = s.k === 'rail' ? 'surface_rail' : (s.k === 'deck' ? 'surface_deck' : 'surface_ledge');
          feature.setTexture(texture);
          feature.setOrigin(0, s.k === 'rail' ? 0.5 : 0);
          feature.setRotation(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
          feature.setPosition(s.x0, s.k === 'rail' ? s.y0 : s.y0 - 4);
          feature.setDisplaySize(Math.max(16, s.x1 - s.x0), s.k === 'rail' ? 30 : (s.k === 'deck' ? 64 : 48));
          feature.setAlpha(1);
        }

        // ---- named gaps announce themselves before you reach them ----
        this.flagPool.used = 0;
        for (i = 0; i < w.gaps.n; i++) {
          var gp = w.gaps.items[i];
          if (!gp.name || gp.x1 < x0 || gp.x0 > x1) continue;
          var fl = this.leaseSprite(this.flagPool);
          if (fl) {
            fl.setPosition(gp.x0 - 10, gp.floor);
            fl.setAlpha(gp.cleared ? 0.35 : 1);
          }
        }
        this.finishPool(this.flagPool);

        // ---- Line Run beat telegraph: icon-only ----------------------
        this.beatPool.used = 0;
        if (this.modeKey === 'line') {
          var sk = this.run.skater;
          for (i = 0; i < w.beats.n; i++) {
            var beat = w.beats.items[i];
            if (beat.x1 < x0 || beat.x0 > x1) continue;
            var marker = this.leaseSprite(this.beatPool);
            if (marker) {
              var active = !beat.hit && sk.x >= beat.x0 && sk.x <= beat.x1;
              marker.setPosition(beat.x0, w.streetLevel(beat.x0) - 54);
              marker.setTint(beat.hit ? 0x67708e : (active ? 0xffc660 : 0x6eebff));
              marker.setAlpha(beat.hit ? 0.32 : 1).setScale(active ? 1.18 : 1);
            }
          }
        }
        this.finishPool(this.beatPool);
      },

      // ------------------------------------------------------- entities
      bindEntities: function () {
        var w = this.run.world, i;
        var x0 = this.camX - 200, x1 = this.camX + this.W + 200;

        for (i = 0; i < w.crowd.n; i++) {
          var cw = w.crowd.items[i];
          if (cw.x < x0 || cw.x > x1) continue;
          var cs = this.leaseSprite(this.crowdPool);
          if (!cs) break;
          cs.setFrame('crowd_' + (cw.frame % 4));
          cs.setPosition(cw.x, cw.y + 4);
          cs.setAlpha(this.district.crowd * 0.8);
          cs.setScale(0.9 + (cw.frame % 3) * 0.08);
          cs.setRotation(0);
          // crowd sway is cosmetic only and is flattened for reduced motion
          cs.y += reducedMotion ? 0 : Math.sin(this.cosmetic * 2.1 + cw.phase) * 1.6;
          if (this.crowdReact > 0 && !reducedMotion) {
            var react = this.crowdReact * (0.55 + (cw.frame % 3) * 0.12);
            if (this.crowdReactMode === 'flinch') {
              cs.y += react * 6;
              cs.setRotation((cw.frame % 2 ? -1 : 1) * react * 0.035);
            } else {
              cs.y -= react * 5;
              cs.setScale(cs.scaleX + react * 0.08, cs.scaleY + react * 0.08);
            }
          }
        }
        this.finishPool(this.crowdPool);

        for (i = 0; i < w.props.n; i++) {
          var pr = w.props.items[i];
          if (pr.x < x0 || pr.x > x1) continue;
          var ps = this.leaseSprite(this.propPool);
          if (!ps) break;
          ps.setFrame(pr.kind);
          ps.setPosition(pr.x, pr.y + 2);
          ps.setAlpha(1);
        }
        this.finishPool(this.propPool);

        for (i = 0; i < w.cars.n; i++) {
          var c = w.cars.items[i];
          if (c.x + c.w < x0 || c.x > x1) continue;
          var carS = this.leaseSprite(this.carPool);
          if (!carS) break;
          carS.setFrame(c.kind);
          carS.setPosition(c.x, c.y);
          carS.setAlpha(1);
        }
        this.finishPool(this.carPool);

        for (i = 0; i < w.obs.n; i++) {
          var o = w.obs.items[i];
          if (o.kind === 'face') continue;   // faces are drawn by the street
          if (o.x + o.w < x0 || o.x > x1) continue;
          var os = this.leaseSprite(this.obsPool);
          if (!os) break;
          var def = SIM.obsDef(o.kind);
          os.setFrame(def.frame || 'cone');
          os.setPosition(o.x + o.w / 2, o.y + o.h + 2);
        }
        this.finishPool(this.obsPool);

        var dbgN = 0;
        for (i = 0; i < w.picks.n; i++) {
          var p = w.picks.items[i];
          if (p.x < x0 || p.x > x1) continue;
          if (dbgN < MAX_DEBUG_PICKUPS) {
            // Debug view records are OUR OWN array, copied by value. A
            // harness reading livePickups can never touch the sim pool.
            var dr = DEBUG_PICKUPS[dbgN++];
            dr.kind = p.kind; dr.x = p.x; dr.y = p.y; dr.taken = p.taken;
          }
          if (p.taken) continue;
          var pk = this.leaseSprite(this.pickPool);
          if (!pk) break;
          var pdef = CB.pickup(p.kind);
          pk.setFrame(pdef.frame);
          pk.setPosition(p.x, p.y + (reducedMotion ? 0 : Math.sin(p.bob) * 5));
          pk.setScale(1 + (reducedMotion ? 0 : Math.sin(p.bob * 1.7) * 0.06));
        }
        this.finishPool(this.pickPool);
        CB_DEBUG_STATE.livePickupCount = dbgN;
        for (i = dbgN; i < MAX_DEBUG_PICKUPS; i++) {
          DEBUG_PICKUPS[i].kind = '';
          DEBUG_PICKUPS[i].taken = false;
        }
      },

      // --------------------------------------------------------- skater
      drawSkater: function () {
        var sk = this.run.skater;
        if (this.ragActive) { this.drawRagdoll(); return; }

        this.rig.setVisible(true);
        this.shadow.setVisible(true);
        this.rig.setPosition(sk.x, sk.y - 15);
        this.rig.setRotation(sk.rot);
        // anticipation squash: compress on the way down, stretch on the pop
        var sq = sk.squash;
        var stretch = sk.state === 'air' && sk.airTime < 0.14 ? 0.10 : 0;
        this.rig.setScale(1 + sq * 0.55 - stretch * 0.4, 1 - sq + stretch);
        this.deck.setFrame(CB.livery(profile.livery).frame);
        this.rider.setFrame('rider_' + (sk.pose || 'roll'));
        this.rider.y = -2 + sq * 22;

        var ground = this.run.world.streetLevel(sk.x);
        var fall = clamp((ground - sk.y) / 260, 0, 1);
        this.shadow.setPosition(sk.x, ground + 2);
        this.shadow.setScale(1 - fall * 0.45, 1);
        this.shadow.setAlpha(0.34 * (1 - fall * 0.7));

        // wobble meter, only while the balance skill is live
        if (sk.state === 'grind') {
          this.wob.setVisible(true).setPosition(sk.x, sk.y - 104);
          var b = clamp(sk.bal, -1, 1);
          this.wobFill.x = b * 40;
          var hot = Math.abs(b) > T.BAL_WARN;
          this.wobFill.setFillStyle(hot ? 0xff688a : 0x8cf5c8);
          this.wobBg.setStrokeStyle(1.5, hot ? 0xff688a : this.district.accent, 0.95);
          this.wob.setScale(hot && !reducedMotion ? 1 + Math.sin(this.cosmetic * 26) * 0.05 : 1);
        } else if (this.wob.visible) {
          this.wob.setVisible(false);
        }
      },

      startRagdoll: function () {
        var sk = this.run.skater;
        this.ragActive = true;
        this.rig.setVisible(false);
        this.wob.setVisible(false);
        var seedVx = sk.vx * 0.5;
        for (var i = 0; i < this.rag.length; i++) {
          var r = this.rag[i];
          r.x = sk.x + (i - 2.5) * 5;
          r.y = sk.y - 30 - (i % 3) * 14;
          r.vx = seedVx + (this.fxRng.next() * 2 - 1) * 130;
          r.vy = -220 - this.fxRng.next() * 240;
          r.rot = this.fxRng.next() * TAU;
          r.spin = (this.fxRng.next() * 2 - 1) * 9;
          r.spr.setVisible(true);
        }
        this.ragDeck.x = sk.x; this.ragDeck.y = sk.y - 6;
        this.ragDeck.vx = seedVx + 120; this.ragDeck.vy = -300;
        this.ragDeck.rot = sk.rot; this.ragDeck.spin = 7.5;
        this.ragDeck.spr.setFrame(CB.livery(profile.livery).frame).setVisible(true);
      },

      drawRagdoll: function () {
        var dt = STEP;
        var ground = this.run.world.streetLevel(this.run.skater.x) + 2;
        var all = this.ragAll;
        for (var i = 0; i < all.length; i++) {
          var r = all[i];
          r.vy += 2000 * dt;
          r.x += r.vx * dt;
          r.y += r.vy * dt;
          r.rot += r.spin * dt;
          if (r.y > ground) {
            r.y = ground;
            r.vy *= -0.28;
            r.vx *= 0.68;
            r.spin *= 0.55;
          }
          r.spr.setPosition(r.x, r.y);
          r.spr.setRotation(r.rot);
        }
        // Lightweight joint constraints keep the authored parts readable
        // while preserving the loose tumble of a bail.
        var root = this.rag[0];
        var cos = Math.cos(root.rot), sin = Math.sin(root.rot);
        for (i = 1; i < this.rag.length; i++) {
          var child = this.rag[i];
          var tx = root.x + child.jointX * cos - child.jointY * sin;
          var ty = root.y + child.jointX * sin + child.jointY * cos;
          child.x += (tx - child.x) * 0.42;
          child.y += (ty - child.y) * 0.42;
          child.vx = root.vx * 0.62;
          child.vy = root.vy * 0.62;
          child.rot += SIM.angNorm(root.rot - child.rot) * 0.24;
        }
        var deckTx = root.x + 22 * cos - 16 * sin;
        var deckTy = root.y + 22 * sin + 16 * cos;
        this.ragDeck.x += (deckTx - this.ragDeck.x) * 0.32;
        this.ragDeck.y += (deckTy - this.ragDeck.y) * 0.32;
        this.ragDeck.vx = root.vx * 0.78;
        this.ragDeck.vy = root.vy * 0.78;
        this.ragDeck.rot += SIM.angNorm(root.rot - this.ragDeck.rot) * 0.18;
        this.shadow.setVisible(false);
      },

      // ------------------------------------------------------------ HUD
      updateHud: function (dt) {
        var run = this.run, sk = run.skater;
        setTextIfChanged(this.tScore, '★ ' + run.score.toLocaleString());

        if (this.modeKey === 'line') {
          setTextIfChanged(this.tRight, '◆ ' + run.beatsHit + '/' + run.beatsTotal);
          setTextIfChanged(this.tMid, '');
        } else if (this.modeKey === 'gap') {
          setTextIfChanged(this.tRight, '◈ ' + run.gapsCleared);
          setTextIfChanged(this.tMid, '⏱ ' + Math.max(0, Math.ceil(run.time)) + 's · ' + Math.round(run.metres) + 'm');
        } else {
          setTextIfChanged(this.tRight, '⏱ ' + Math.max(0, Math.ceil(run.time)) + 's');
          setTextIfChanged(this.tMid, '↗ ' + Math.round(run.metres) + 'm');
        }

        var live = run.combo.count > 0;
        this.chip.setAlpha(live ? 1 : Math.max(0, this.chip.alpha - dt * 3));
        if (live) {
          setTextIfChanged(this.tMult, 'x' + run.combo.mult.toFixed(1));
          var f = run.comboFreeze > 0 ? 1 : clamp(run.combo.decay / run.combo.decayMax, 0, 1);
          this.decayBar.width = 36 * f;
          this.decayBar.setFillStyle(run.comboFreeze > 0 ? 0x8cf5c8 : (f < 0.34 ? 0xff688a : 0xbc8cff));
        }

        setTextIfChanged(this.tSaves, run.saves > 0 ? ('♥ ' + run.saves) : '');
        setTextIfChanged(this.tBoost, run.boost > 0 ? ('⚡ ' + run.boost.toFixed(1) + 's') : '');

        if (run.prompt) {
          this.promptBox.setAlpha(1);
          var arrow = run.prompt.dir === 'left' ? '←' : run.prompt.dir === 'right' ? '→' :
            run.prompt.dir === 'up' ? '↑' : '↓';
          setTextIfChanged(this.tPrompt, '★ ' + arrow + ' ' + run.prompt.name.toUpperCase());
          fitLabel(this.tPrompt, this.promptW - 18, 14, 14);
        } else {
          this.promptBox.setAlpha(Math.max(0, this.promptBox.alpha - dt * 3));
        }

        // banner life is on the cosmetic clock, with an overshoot settle
        if (this.bannerLife > 0) {
          this.bannerLife -= dt;
          var age = this.bannerTotal - this.bannerLife;
          var s = 1;
          if (!reducedMotion) {
            s = age < 0.30 ? 0.72 + 0.42 * (age / 0.30) : (age < 0.46 ? 1.14 - 0.14 * ((age - 0.30) / 0.16) : 1);
          }
          this.banner.setScale(s);
          this.banner.setAlpha(this.bannerLife < 0.4 ? this.bannerLife / 0.4 : 1);
          if (this.bannerLife <= 0) this.banner.setVisible(false);
        }
      },

      showBanner: function (t1, t2, color) {
        // Center banners are reserved for run boundaries.
        var bw = this.bannerW;
        this.bannerEdge.setTint(color == null ? 0x6eebff : color);
        setTextIfChanged(this.bannerT1, t1);
        setTextIfChanged(this.bannerT2, t2 || '');
        fitLabel(this.bannerT1, bw - 22, 18, 10);
        fitLabel(this.bannerT2, bw - 22, 10, 8);
        this.banner.setVisible(true).setAlpha(1).setScale(reducedMotion ? 1 : 0.72);
        this.bannerTotal = 1.6;
        this.bannerLife = 1.6;
        CB_DEBUG_STATE.lastBanner = t1 + '|' + (t2 || '');
      },

      updateCoach: function (dt) {
        if (this.noticeLife > 0) {
          this.noticeLife -= dt;
          var fade = reducedMotion ? 0 : (this.noticeKind === 'coach' ? 0.55 : 0.18);
          this.coach.setAlpha(fade && this.noticeLife < fade ? this.noticeLife / fade : 1);
          if (this.noticeLife <= 0) {
            this.coach.setAlpha(0).setVisible(false);
            this.noticeKind = '';
          }
        }
        if (this.noticeLife <= 0 && this.bannerLife <= 0 && this.noticeQueue.length) {
          this.startNotice(this.noticeQueue.shift());
        }
      },

      startNotice: function (notice) {
        this.noticeKind = notice.kind;
        this.noticeLife = notice.kind === 'coach' ? 3.6 : 1.0;
        this.coach.setVisible(true).setAlpha(1);
        this.coachBg.setVisible(notice.kind === 'coach');
        this.tCoach.setVisible(notice.kind === 'coach');
        this.toastBg.setVisible(notice.kind === 'event');
        this.tToast.setVisible(notice.kind === 'event');
        if (notice.kind === 'coach') {
          setTextIfChanged(this.tCoach, notice.text);
          fitLabel(this.tCoach, this.W - 56, 14, 14);
        } else {
          this.toastBg.setTint(notice.color == null ? 0x0e0b1e : notice.color);
          setTextIfChanged(this.tToast, notice.text);
          fitLabel(this.tToast, this.toastBg.displayWidth - 22, 14, 14);
          this.tToast.setColor('#f2ecff');
        }
      },

      queueNotice: function (kind, text, color) {
        var notice = { kind: kind, text: String(text), color: color };
        if (this.noticeKind === kind && this.tCoach.visible && kind === 'coach' && this.tCoach.text === notice.text) return;
        if (this.noticeKind === kind && this.tToast.visible && kind === 'event' && this.tToast.text === notice.text) return;
        if (this.noticeLife <= 0 && this.bannerLife <= 0) {
          this.startNotice(notice);
          return;
        }
        for (var i = 0; i < this.noticeQueue.length; i++) {
          if (this.noticeQueue[i].kind === kind && this.noticeQueue[i].text === notice.text) return;
        }
        this.noticeQueue.push(notice);
        if (this.noticeQueue.length > 6) this.noticeQueue.shift();
      },

      coachEvent: function (e) {
        var lesson = this.coachLesson;
        if (!lesson || !lesson.active) return;
        var next = lesson.step;
        if (next === 0 && e.type === 'pop' && !e.b) {
          lesson.step = 1;
          this.coachSay('2/4  Swipe in air for a trick');
        } else if (next === 1 && e.type === 'trick') {
          lesson.step = 2;
          this.coachSay('3/4  Swipe up at a rail; balance');
        } else if (next === 2 && e.type === 'grindcomplete') {
          lesson.step = 3;
          this.coachSay('4/4  Land level to bank');
        } else if (next === 3 && (e.type === 'bank' || (e.type === 'land' && e.a === 'clean'))) {
          lesson.step = 4;
          lesson.active = false;
          profile.seenCoach = true;
          persist();
          this.coachSay('RUN READY  Run the line');
        }
      },

      coachSay: function (text) {
        this.queueNotice('coach', text);
      },

      // ---------------------------------------------------------- audio
      // Rolling and grinding are continuous, so they are granulated on the
      // SFX bus: short grains fired back to back at a rate and pitch tied to
      // board speed. That keeps GGKit's single music channel free for the
      // district bed, which also carries the street ambience layer.
      updateAudio: function (dt) {
        var run = this.run, sk = run.skater;
        if (kit.paused) return;
        var speedF = clamp(sk.vx / T.SPEED_MAX, 0.2, 1.2);
        var targetHeat = clamp((sk.vx - T.SPEED_BASE) / 240, 0, 1);
        targetHeat += sk.state === 'grind' ? 0.24 : 0;
        targetHeat += Math.abs(sk.bal) > T.BAL_WARN ? 0.24 : 0;
        targetHeat += clamp(run.metres / 1800, 0, 1) * 0.16;
        this.heat += (clamp(targetHeat, 0, 1) - this.heat) * Math.min(1, dt * 3.5);
        var wantedLayer = this.heat > 0.62 ? 'music_heat' : this.district.music;
        if (wantedLayer !== this.audioLayer) {
          kit.audio.music(wantedLayer, 650);
          this.audioLayer = wantedLayer;
        }
        if (sk.state === 'roll' || sk.state === 'air') {
          this.rollTimer -= dt;
          if (sk.state === 'roll' && this.rollTimer <= 0) {
            this.rollTimer = 0.15 / speedF;
            kit.audio.sfx('sfx_roll', { volume: 0.20 * speedF, rate: 0.82 + speedF * 0.42 });
          }
        }
        if (sk.state === 'grind') {
          this.grindTimer -= dt;
          if (this.grindTimer <= 0) {
            this.grindTimer = 0.085;
            kit.audio.sfx('sfx_grind', {
              volume: 0.24 + Math.abs(sk.bal) * 0.12,
              rate: 0.9 + speedF * 0.3 + Math.abs(sk.bal) * 0.2
            });
          }
        }
      },

      // ---------------------------------------------------- sim events
      onSimEvent: function (e) {
        var run = this.run, sk = run.skater, d = this.district;
        this.coachEvent(e);
        CB_DEBUG_STATE.lastEvent = e.type;
        var trail = CB_DEBUG_STATE.recentEvents;
        for (var ti = 0; ti < trail.length - 1; ti++) trail[ti] = trail[ti + 1];
        trail[trail.length - 1] = e.type + (e.a != null ? (':' + e.a) : '');
        switch (e.type) {
          case 'pop':
            kit.audio.sfx('sfx_pop', { volume: 0.55 + e.a * 0.3, rate: 0.94 + e.a * 0.2 });
            this.burst(this.pDust, sk.x - 10, sk.y + 2, 6);
            break;
          case 'trick':
            kit.audio.sfx('sfx_trick', { volume: 0.42 });
            kit.audio.sfx('sfx_combo', { volume: 0.24, rate: 0.9 + Math.min(8, run.combo.count) * 0.06 });
            this.queueNotice('event', e.a, 0xbc8cff);
            this.burst(this.pGlow, sk.x, sk.y - 40, 3);
            break;
          case 'trickstart':
            this.queueNotice('event', e.a, 0xbc8cff);
            this.burst(this.pGlow, sk.x, sk.y - 40, 2);
            break;
          case 'bonus':
            this.queueNotice('event', 'BONUS ' + e.a.toUpperCase(), 0xffc660);
            kit.audio.sfx('sfx_bank', { volume: 0.6 });
            this.burst(this.pRing, sk.x, sk.y - 40, 1);
            break;
          case 'grindstart':
            kit.audio.sfx('sfx_pop', { volume: 0.4, rate: 1.25 });
            this.queueNotice('event', e.a + (e.b ? (' · ' + e.b) : ''), 0x8cf5c8);
            this.burst(this.pSpark, sk.x - 16, sk.y + 4, 8);
            break;
          case 'grindtick':
            // chalk dust and sparks are the grind's signature FX
            if (!reducedMotion || (this.cosmetic * 60) % 3 < 1) {
              this.burst(this.pChalk, e.a - 18, e.b + 4, 1);
              if (this.fxRng.next() < 0.55) this.burst(this.pSpark, e.a - 18, e.b + 4, 1);
            }
            break;
          case 'grindend':
            break;
          case 'grindcomplete':
            this.crowdReact = 1;
            this.crowdReactMode = 'cheer';
            this.queueNotice('event', e.a + ' +' + e.b, 0x8cf5c8);
            this.burst(this.pSpark, sk.x - 16, sk.y + 4, 5);
            break;
          case 'wobble':
            kit.audio.sfx('sfx_wobble', { volume: 0.35, rate: 1 + Math.abs(e.a) * 0.4 });
            if (kit.juice.enabled && !reducedMotion) kit.juice.shake(2.2, 90);
            break;
          case 'land':
            if (!reducedMotion) this.cameraDip = e.a === 'clean' ? 16 : 8;
            if (e.a === 'clean') {
              kit.audio.sfx('sfx_land_clean', { volume: 0.5 });
              this.burst(this.pDust, sk.x - 8, sk.y + 2, 5);
            } else {
              kit.audio.sfx('sfx_land_sketchy', { volume: 0.55 });
              this.burst(this.pDust, sk.x - 8, sk.y + 2, 10);
              this.burst(this.pSmoke, sk.x - 8, sk.y - 6, 2);
              this.queueNotice('event', 'SKETCHY', 0xff688a);
              if (kit.juice.enabled) kit.juice.shake(3, 110);
            }
            break;
          case 'bank':
            this.crowdReact = 1;
            this.crowdReactMode = 'cheer';
            if (!reducedMotion) this.cameraDip = Math.max(this.cameraDip, 12);
            kit.audio.sfx('sfx_bank', { volume: 0.7 });
            this.queueNotice('event', 'BANK +' + Number(e.a).toLocaleString(), 0x8cf5c8);
            this.burst(this.pRing, sk.x, sk.y - 44, 1);
            this.burst(this.pGlow, sk.x, sk.y - 44, 8);
            if (kit.juice.enabled && !reducedMotion) kit.juice.hitStop(Math.min(70, 20 + e.a / 400));
            break;
          case 'decay':
            this.chip.setScale(1.12);
            this.tweens.add({ targets: this.chip, scale: 1, duration: 160 });
            break;
          case 'pickup':
            kit.audio.sfx('sfx_pickup', { volume: 0.55 });
            this.burst(this.pGlow, e.c || sk.x, sk.y - 46, 8);
            this.queueNotice('event', CB.pickup(e.a).name, CB.pickup(e.a).color);
            if (e.a === 'boost') kit.audio.sfx('sfx_boost', { volume: 0.6 });
            break;
          case 'prompt':
            kit.audio.sfx('sfx_prompt', { volume: 0.6 });
            break;
          case 'promptend':
            break;
          case 'gap':
            this.crowdReact = 1;
            this.crowdReactMode = 'cheer';
            kit.audio.sfx('sfx_gap', { volume: 0.7 });
            this.queueNotice('event', e.a + ' +' + e.b, 0xffc660);
            this.burst(this.pRing, sk.x, sk.y - 40, 1);
            if (kit.juice.enabled) kit.juice.shake(4, 160);
            break;
          case 'shortcut':
            this.crowdReact = 0.8;
            this.crowdReactMode = 'cheer';
            profile.shortcuts[this.districtKey] = e.a;
            persist();
            kit.audio.sfx('sfx_medal', { volume: 0.6 });
            this.queueNotice('event', 'HIGH LINE +' + e.b, 0x8cf5c8);
            break;
          case 'beat':
            kit.audio.sfx('sfx_combo', { volume: 0.6, rate: 1.1 });
            this.queueNotice('event', e.a, 0x6eebff);
            break;
          case 'scuffhit':
            kit.audio.sfx('sfx_land_sketchy', { volume: 0.5, rate: 0.86 });
            this.burst(this.pDust, e.b, e.c, 9);
            this.queueNotice('event', 'SCUFF', 0xff9a6e);
            if (kit.juice.enabled) kit.juice.shake(4.5, 150);
            break;
          case 'scuff':
            this.burst(this.pDust, e.a - 8, e.b, 2);
            break;
          case 'honk':
            kit.audio.sfx('sfx_horn', { volume: 0.35 });
            break;
          case 'save':
            kit.audio.sfx('sfx_medal', { volume: 0.55 });
            this.queueNotice('event', 'BAIL SAVE', 0x8cf5c8);
            this.burst(this.pRing, sk.x, sk.y - 40, 1);
            break;
          case 'bail':
            this.crowdReact = 1;
            this.crowdReactMode = 'flinch';
            kit.audio.sfx('sfx_bail', { volume: 0.8 });
            this.burst(this.pSmoke, sk.x, sk.y - 20, 10);
            this.burst(this.pDust, sk.x, sk.y, 16);
            this.startRagdoll();
            if (kit.juice.enabled) {
              kit.juice.shake(9, 320);
              if (!reducedMotion) kit.juice.hitStop(90);
            }
            break;
          case 'over':
            break;
        }
      },

      // ------------------------------------------------------- run over
      onRunOver: function () {
        this.finished = true;
        var run = this.run;
        var value = run.medalValue();
        var medal = run.medalIndex();
        var key = this.challenge.key;
        var prevBest = profile.bests[key] || 0;
        var prevMedal = profile.medals[key];
        var improved = value > prevBest;
        if (improved) profile.bests[key] = value;
        if (medal >= 0 && (prevMedal == null || medal > prevMedal)) profile.medals[key] = medal;
        // Completion unlocks the next link, but it is not itself a bronze
        // medal. Only a cleared tier writes to the medal registry.
        if (run.result !== 'bail') profile.completed[key] = true;
        persist();

        var self = this;
        this.time.delayedCall(reducedMotion ? 350 : 900, function () {
          self.showResult(value, medal, improved);
        });

        if (medal >= 0) kit.audio.sfx('sfx_medal', { volume: 0.75 });
        else kit.audio.sfx('sfx_fail', { volume: 0.6 });
      },

      showResult: function (value, medal, improved) {
        var run = this.run;
        var cw = this.resultW;
        setTextIfChanged(this.rTitle, medal >= 0 ? CB.MEDAL_NAMES[medal] : 'RUN OVER');
        setTextIfChanged(this.rSub, this.district.name + '  ' + this.mode.name);
        this.rMedal.setVisible(medal >= 0);
        if (medal >= 0) this.rMedal.setFrame(['medal_bronze', 'medal_silver', 'medal_gold'][medal]);
        setTextIfChanged(this.rValue, Number(value).toLocaleString());
        setTextIfChanged(this.rValueCap,
          this.modeKey === 'score' ? 'SCORE' : this.modeKey === 'gap' ? 'GAPS CLEARED' : 'BEATS LANDED');

        var tiers = this.challenge.tiers;
        var highLine = profile.shortcuts[this.districtKey] || 'not found';
        var lines = [
          'Distance ' + Math.round(run.metres) + ' m',
          'Gaps ' + run.gapsCleared + (run.gapNames.length ? ('  (' + run.gapNames.slice(-2).join(', ') + ')') : ''),
          'High line ' + highLine + '   Bonus tricks ' + run.bonusHits,
          'Map ' + discoveredShortcutCount() + '/' + CB.DISTRICTS.length + '   Next tier ' +
            (medal < 2 ? tiers[medal + 1] : 'all cleared') + (improved ? '   NEW BEST' : '')
        ];
        for (var i = 0; i < this.rLines.length; i++) {
          setTextIfChanged(this.rLines[i], lines[i] || '');
          fitLabel(this.rLines[i], cw - 44, 11, 8);
        }
        this.result.setVisible(true).setScale(reducedMotion ? 1 : 0.86).setAlpha(0);
        this.tweens.add({
          targets: this.result, alpha: 1, scale: 1,
          duration: reducedMotion ? 140 : 320,
          ease: reducedMotion ? 'Linear' : 'Back.easeOut'
        });
        CB_DEBUG_STATE.medalIndex = medal;
      },

      // -------------------------------------------------------- debug
      syncDebug: function () {
        var s = CB_DEBUG_STATE, run = this.run, sk = run.skater;
        s.mode = this.modeKey;
        s.modeName = this.mode.name;
        s.district = this.districtKey;
        s.districtName = this.district.name;
        s.districtIndex = CB.districtIndex(this.districtKey);
        s.score = run.score;
        s.combo = run.combo.count;
        s.multiplier = run.combo.mult;
        s.distance = Math.round(run.metres);
        s.speed = Math.round(sk.vx);
        s.riderState = sk.state;
        s.landing = run.landingTier;
        s.balance = sk.bal;
        s.grinding = sk.state === 'grind';
        s.wobbleShown = this.wob.visible;
        s.airTime = sk.airTime;
        s.timeLeft = run.time;
        s.gapsCleared = run.gapsCleared;
        s.gapNames = run.gapNames;
        s.beatsHit = run.beatsHit;
        s.beatsTotal = run.beatsTotal;
        s.shortcutsFound = run.shortcutsFound;
        s.saves = run.saves;
        s.boost = run.boost;
        s.prompt = run.prompt ? run.prompt.name : '';
        s.over = run.over;
        s.result = run.result;
        s.unlockedCount = unlockedCount();
        s.bestScore = profile.bests[this.challenge.key] || 0;
        // Preallocated, filled in place. `map` here allocated a fresh array
        // sixty times a second purely so a harness could read it.
        var medals = s.medals;
        for (var mi = 0; mi < CB.CHALLENGES.length; mi++) {
          var mv = profile.medals[CB.CHALLENGES[mi].key];
          medals[mi] = (mv == null) ? -1 : mv;
        }
      },

      onResize: function (size) {
        var w = Math.round(size ? size.width : this.scale.width);
        var h = Math.round(size ? size.height : this.scale.height);
        if (Math.abs(w - this.W) < 8 && Math.abs(h - this.H) < 8) return;
        kit.input.clearAll();
        this.clearControl();
        this.scene.restart(this.launchData);
      }
    }
  };

  // ============================================================== boot up
  function boot() {
    Game.insets = readInsets();
    var W = Math.max(320, Math.floor(window.innerWidth));
    var H = Math.max(480, Math.floor(window.innerHeight));
    Game.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: document.body,
      backgroundColor: '#120f26',
      scale: { mode: Phaser.Scale.RESIZE, width: W, height: H },
      // antialias keeps LINEAR filtering, which the supersampled art needs.
      // antialiasGL:false drops multisampling on the default framebuffer:
      // pure cost on a software rasteriser and worth nothing when every edge
      // already comes out of a filtered texture. batchSize keeps the street
      // graphics and the sprite fleet inside one draw batch.
      render: {
        antialias: true, antialiasGL: false, powerPreference: 'high-performance',
        roundPixels: false, batchSize: 4096
      },
      fps: { target: 60, min: 30 },
      scene: [BootScene, MenuScene, PlayScene]
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
