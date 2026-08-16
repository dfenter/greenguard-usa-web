/* Driftlands — Phaser 3 island adventure.
 * Lifecycle, input identity, saves, audio and settings run through GGKit.
 */
(function () {
  'use strict';

  var W = DL.world;
  var MAP = W.MAP, ROOM_W = W.ROOM_W, ROOM_H = W.ROOM_H;
  var TILE = 16;
  var DPR = 1;
  var ZOOM = 2;
  var TAU = Math.PI * 2;
  var clamp = W.clamp, dist = W.dist;
  var FS = 10; // bitmap font cell height; multiply for on screen size

  function px(value) { return value * DPR; }

  var SFX = ['s_swing', 's_hit', 's_kill', 's_hurt', 's_step_grass', 's_step_sand',
    's_step_stone', 's_pickup', 's_heart', 's_sigil', 's_relic', 's_door',
    's_sealed', 's_ui', 's_reveal', 's_chop', 's_boss', 's_win'];
  var MUSIC = { m_title: 1, m_isle: 1, m_deep: 1, m_tide: 1 };

  var GATE_NAMES = ['EMBER GAUNTLET', 'TIDE GAUNTLET', 'HOLLOW GAUNTLET'];

  /* Frame names are baked once at module load. Building them per entity per
   * frame allocated a fresh string for every visible foe every tick, which is
   * pure garbage for the collector to sweep during the long-frame budget. */
  var FR = { mossling: 'moss', skitter: 'skit', brute: 'brut', wisp: 'wisp', guardian: 'guard', tide: 'tide' };
  var E_STATES = ['die', 'hurt', 'atk', 'idle0', 'idle1', 'walk0', 'walk1'];
  var E_FRAME = {};
  Object.keys(FR).forEach(function (type) {
    var key = FR[type], m = {};
    E_STATES.forEach(function (s) { m[s] = 'e_' + key + '_' + s; });
    E_FRAME[type] = m;
  });
  var P_ANIM = {};
  ['idle', 'walk', 'wind', 'atk'].forEach(function (a) {
    var m = {};
    ['down', 'up', 'side'].forEach(function (d) { m[d] = a + '-' + d; });
    P_ANIM[a] = m;
  });

  var game = null;
  var TIDX = null;

  var kit = GGKit.create({
    slug: 'driftlands',
    orientation: 'portrait',
    validateSave: W.validate,
    onPause: function () {
      if (game && game.scene.isActive('play')) {
        var ps = game.scene.getScene('play');
        if (ps) ps.wasAction = false;
        game.scene.pause('play');
      }
    },
    onResume: function () {
      if (game && game.scene.isPaused('play')) {
        var ps = game.scene.getScene('play');
        if (ps) ps.wasAction = false;
        game.scene.resume('play');
      }
    },
    onRestart: function () {
      var ps = game && game.scene.getScene('play');
      if (ps) { ps.wasAction = false; ps.fullRestart(); }
    }
  });
  kit.registerPWA();

  var audioMap = {};
  SFX.forEach(function (n) { audioMap[n] = 'assets/audio/' + n + '.mp3'; });
  Object.keys(MUSIC).forEach(function (n) { audioMap[n] = 'assets/audio/' + n + '.mp3'; });
  kit.audio.register(audioMap);

  DL.interacted = false;
  ['pointerdown', 'keydown'].forEach(function (t) {
    window.addEventListener(t, function () { DL.interacted = true; }, { once: true, passive: true });
  });

  /* ------------------------------------------------------------- settings */
  // GGKit owns the settings shell; Driftlands adds its own rows through the
  // documented extraRows hook so music, effects volume and fullscreen are all
  // reachable and persist through GGKit's own audio preferences.
  var VOL_STEPS = [0, 0.25, 0.5, 0.75, 1];
  function volLabel(v) { return Math.round(v * 100) + '%'; }
  function stepVol(v) {
    var i = 0, best = 9;
    for (var k = 0; k < VOL_STEPS.length; k++) {
      var d = Math.abs(VOL_STEPS[k] - v);
      if (d < best) { best = d; i = k; }
    }
    return VOL_STEPS[(i + 1) % VOL_STEPS.length];
  }
  function openSettings() {
    kit.openSettings([function (box) {
      function button(paint, onClick) {
        var b = document.createElement('button');
        b.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;' +
          'border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
        function refresh() { b.textContent = paint(); }
        b.addEventListener('click', function () { onClick(); refresh(); });
        refresh();
        box.appendChild(b);
        return b;
      }
      button(function () { return 'Music volume: ' + volLabel(kit.audio.prefs.music); },
        function () { kit.audio.setMusicVolume(stepVol(kit.audio.prefs.music)); });
      button(function () { return 'Effects volume: ' + volLabel(kit.audio.prefs.sfx); },
        function () { kit.audio.setSfxVolume(stepVol(kit.audio.prefs.sfx)); kit.audio.sfx('s_ui'); });
      button(function () { return 'Fullscreen'; }, function () { kit.requestFullscreen(); });
    }]);
  }

  // NineSlice exposes resize(); fall back to setSize on older builds.
  function ns(obj, w, h) {
    if (obj.resize) obj.resize(w, h);
    else obj.setSize(w, h);
    return obj;
  }

  var INSET = { top: 0, bottom: 0, left: 0, right: 0 };
  function readInsets() {
    var probe = document.getElementById('inset-probe');
    if (!probe) return;
    var cs = getComputedStyle(probe);
    INSET.top = parseFloat(cs.paddingTop) || 0;
    INSET.bottom = parseFloat(cs.paddingBottom) || 0;
    INSET.left = parseFloat(cs.paddingLeft) || 0;
    INSET.right = parseFloat(cs.paddingRight) || 0;
  }

  /* -------------------------------------------------------- shared drawing */
  // Island silhouette used by the loading screen and the title tableau.
  function islandTexture(scene, key, tiles, scale) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var baked = GGKit.hiDpi.canvas(MAP, MAP);
    var ctx = baked.ctx;
    var cols = ['#0b2f44', '#e2c48b', '#5cae52', '#2a6a3c', '#8894a0', '#7a6b85', '#1d6b7d'];
    for (var i = 0; i < MAP * MAP; i++) {
      var t = tiles[i], x = i % MAP, y = Math.floor(i / MAP);
      if (t === 0) continue;
      var c = cols[t] || cols[2];
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
    // one pixel foam rim so the silhouette has a finished edge
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'rgba(143,215,210,0.9)';
    for (var y = 0; y < MAP; y++) for (var x = 0; x < MAP; x++) {
      if (tiles[y * MAP + x] === 0) continue;
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    return scene.textures.addCanvas(key, baked.canvas);
  }

  // A small tiling swell pattern so the menu sea has surface detail, not a
  // flat colour block across the bottom third of the screen.
  function swellTexture(scene) {
    if (scene.textures.exists('swell')) return;
    var baked = GGKit.hiDpi.canvas(64, 32);
    var c = baked.canvas, g = baked.ctx;
    g.fillStyle = 'rgba(168,228,226,0.62)';
    var marks = [[3, 5, 15], [31, 11, 11], [47, 19, 17], [11, 25, 13], [38, 2, 9], [20, 16, 8]];
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      g.fillRect(m[0], m[1], m[2], 1);
      g.fillRect(m[0] + 2, m[1] + 1, Math.max(1, m[2] - 5), 1);
    }
    scene.textures.addCanvas('swell', c);
  }

  function waterBand(scene, y, h, alpha, speed) {
    // three stacked scrolling bars of authored water colour, plus a tiling
    // swell overlay: cheap, and it gives the menus real motion without a
    // second tilemap.
    swellTexture(scene);
    var g = [];
    var cols = [0x0f3f57, 0x17546e, 0x256f88];
    for (var i = 0; i < 3; i++) {
      var r = scene.add.rectangle(0, y + i * (h / 3), scene.scale.width * 2, h / 3, cols[i], alpha)
        .setOrigin(0, 0);
      r.scrollSpeed = speed * (0.6 + i * 0.35);
      g.push(r);
    }
    var ts = scene.add.tileSprite(0, y, scene.scale.width, h, 'swell').setOrigin(0, 0).setAlpha(0.34);
    ts.tileScaleX = 1; ts.tileScaleY = 1;
    ts.scrollSpeed = speed * 0.9;
    g.push(ts);
    return g;
  }

  // shared scroll for both menu scenes: bars pan, the swell overlay tiles
  function scrollBands(bands, wide, delta) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (b.tilePositionX !== undefined) { b.tilePositionX += b.scrollSpeed * (delta / 1000); continue; }
      b.x -= b.scrollSpeed * (delta / 1000);
      if (b.x < -wide) b.x += wide;
    }
  }

  /* ==================================================================== LOAD */
  var LoadScene = {
    key: 'load',
    preload: function () {
      kit.loader.show('Driftlands');
      var self = this;
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.2); });
      this.load.spritesheet('town', 'assets/img/tiny-town.png', { frameWidth: 16, frameHeight: 16 });
      this.load.spritesheet('dungeon', 'assets/img/tiny-dungeon.png', { frameWidth: 16, frameHeight: 16 });
      this.load.on('loaderror', function () { self.loadFailed = true; });
    },

    create: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height, U = DPR;
      // The bitmap font is the first bake so the Driftlands loading screen can
      // replace the shared DOM overlay immediately.
      DL.buildFont(this);
      kit.loader.hide();

      this.cameras.main.setBackgroundColor('#06202c');

      var saved = kit.save.get(null);
      var seed = saved && typeof saved.seed === 'number' ? saved.seed : (Math.random() * 0xffffffff) >>> 0;
      var tiles = W.generate(seed);
      islandTexture(this, 'isleart', tiles);

      this.bands = waterBand(this, h * 0.52, h * 0.28, 0.85, 26 * U);
      var isle = this.add.image(w / 2, h * 0.42, 'isleart');
      isle.setScale(Math.min(w, h) / (MAP * DPR) * 0.62);
      this.tweens.add({ targets: isle, y: isle.y - 5 * U, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      var title = this.add.bitmapText(w / 2, h * 0.16, 'pix', 'DRIFTLANDS', FS * 3.4 * U).setOrigin(0.5);
      title.setTint(0xf2ffe4);
      var shadow = this.add.bitmapText(w / 2 + 2 * U, h * 0.16 + 3 * U, 'pix', 'DRIFTLANDS', FS * 3.4 * U).setOrigin(0.5);
      shadow.setTint(0x04141c).setDepth(-1);

      // pixel progress track
      var pw = Math.min(w - 60 * U, 300 * U), ph = 12 * U;
      var px0 = (w - pw) / 2, py0 = h * 0.76;
      this.add.rectangle(px0, py0, pw, ph, 0x0a1c24).setOrigin(0, 0).setStrokeStyle(2 * U, 0x4e7d78);
      this.barFill = this.add.rectangle(px0 + 2 * U, py0 + 2 * U, 0, ph - 4 * U, 0x8ee6d8).setOrigin(0, 0);
      this.barW = pw - 4 * U;
      this.pctText = this.add.bitmapText(w / 2, py0 + ph + 10 * U, 'pix', '0%', FS * 1.2 * U).setOrigin(0.5, 0);
      this.pctText.setTint(0x9fd7c8);

      var TIPS = [
        'THE MAP FILLS ONLY WHERE YOU WALK.',
        'CUT THE BRUSH. SOMETHING IS OFTEN UNDER IT.',
        'A WARDED CHEST NEEDS THE ROOM THREE KEY.',
        'HEARTS DROP FROM BEATEN DRIFTERS.',
        'TWELVE SIGILS RAISE YOUR ATTUNEMENT.',
        'THE SEALED RUIN OPENS FOR THREE RELICS.'
      ];
      this.tip = this.add.bitmapText(w / 2, py0 + ph + 34 * U, 'pix', TIPS[(Math.random() * TIPS.length) | 0], FS * 1.1 * U)
        .setOrigin(0.5, 0).setMaxWidth(w - 50 * U);
      this.tip.setTint(0x7fae9f);
      this.time.addEvent({
        delay: 2600, loop: true, callback: function () {
          self.tip.setText(TIPS[(Math.random() * TIPS.length) | 0]);
        }
      });

      /* Real progress. Each step reports when it is actually finished, and the
       * audio decode reports per file, so the bar never reaches 100 percent
       * before the last buffer is decoded. */
      var steps = [];
      steps.push({ w: 3, fn: function () { DL.buildAtlas(self); } });
      steps.push({ w: 6, fn: function () { TIDX = DL.buildTerrain(self); } });
      steps.push({ w: 1, fn: function () { self.buildAnims(); } });
      SFX.forEach(function (n) { steps.push({ w: 0.5, fn: function () { return kit.audio.preload([n]); } }); });
      var total = steps.reduce(function (a, s) { return a + s.w; }, 0);
      var done = 0, i = 0;

      function paint() {
        var f = clamp(0.2 + 0.8 * (done / total), 0, 1);
        self.barFill.width = self.barW * f;
        self.pctText.setText(Math.round(f * 100) + '%');
      }
      paint();

      function step() {
        if (i >= steps.length) {
          done = total; paint();
          self.time.delayedCall(220, function () { self.scene.start('title'); });
          return;
        }
        var s = steps[i++];
        var r;
        try { r = s.fn(); } catch (e) { r = null; }
        var advance = function () { done += s.w; paint(); self.time.delayedCall(16, step); };
        if (r && r.then) r.then(advance, advance);
        else advance();
      }
      this.time.delayedCall(60, step);
    },

    update: function (time, delta) {
      if (!this.bands) return;
      scrollBands(this.bands, this.scale.width, delta);
    },

    buildAnims: function () {
      var self = this;
      function anim(key, frames, rate, repeat) {
        if (self.anims.exists(key)) return;
        self.anims.create({
          key: key, frameRate: rate, repeat: repeat === undefined ? -1 : repeat,
          frames: frames.map(function (f) { return { key: 'dl', frame: f }; })
        });
      }
      [['down', 'd'], ['up', 'u'], ['side', 's']].forEach(function (p) {
        var k = p[1];
        anim('idle-' + p[0], ['dr_' + k + '_idle0', 'dr_' + k + '_idle1'], 2);
        anim('walk-' + p[0], ['dr_' + k + '_walk0', 'dr_' + k + '_idle0', 'dr_' + k + '_walk1', 'dr_' + k + '_idle0'], 9);
        anim('wind-' + p[0], ['dr_' + k + '_wind'], 8, 0);
        anim('atk-' + p[0], ['dr_' + k + '_atk'], 8, 0);
      });
    }
  };

  /* =================================================================== TITLE */
  var TitleScene = {
    key: 'title',
    create: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      var U = DPR;
      this.cameras.main.setBackgroundColor('#06202c');

      var saved = kit.save.get(null);
      var valid = saved && W.validate(saved);
      var seed = valid ? saved.seed : (Math.random() * 0xffffffff) >>> 0;
      var tiles = W.generate(seed);
      islandTexture(this, 'isleart', tiles);

      // composed tableau: sky wash, moving sea, island, landmark pips, palms
      this.add.rectangle(w / 2, h * 0.22, w, h * 0.46, 0x0a2b3a).setOrigin(0.5);
      for (var s = 0; s < 26; s++) {
        var st = this.add.rectangle((Math.random() * w) | 0, (Math.random() * h * 0.34) | 0, 2 * U, 2 * U, 0xbfe7dc, 0.5);
        this.tweens.add({ targets: st, alpha: 0.12, duration: 1200 + Math.random() * 2400, yoyo: true, repeat: -1 });
      }
      this.bands = waterBand(this, h * 0.44, h * 0.56, 1, 22 * U);

      var isleScale = Math.min(w, h) / (MAP * DPR) * 0.66;
      var isle = this.add.image(w / 2, h * 0.46, 'isleart').setScale(isleScale);
      this.tweens.add({ targets: isle, y: isle.y - 4 * U, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      // landmark silhouettes sitting on the isle
      function place(tx, ty, frame, sc) {
        var px = isle.x + (tx - MAP / 2) * DPR * isleScale;
        var py = isle.y + (ty - MAP / 2) * DPR * isleScale;
        return self.add.image(px, py, 'dl', frame).setScale(sc).setOrigin(0.5, 0.9);
      }
      place(W.RUIN_GATE[0], W.RUIN_GATE[1], 'p_ruindoor', 0.42);
      W.GATES.forEach(function (g) { place(g[0], g[1], 'p_gate', 0.34); });
      place(W.CAMP[0] - 3, W.CAMP[1], 'p_shelter', 0.4);
      var fire = place(W.CAMP[0] + 2, W.CAMP[1], 'p_fire0', 0.45);
      this.time.addEvent({
        delay: 130, loop: true, callback: function () {
          fire.setFrame('p_fire' + (((self.time.now / 130) | 0) % 3));
        }
      });
      for (var p = 0; p < 5; p++) {
        var pm = place(W.CAMP[0] - 14 + p * 7, W.CAMP[1] + 5 - (p % 2) * 3, 'p_palm', 0.4);
        pm.phase = p * 1.3;
        (this.palms || (this.palms = [])).push(pm);
      }
      var glow = this.add.image(isle.x, isle.y, 'glow').setScale(7).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, alpha: 0.32, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      // authored title type: pixel font, layered shadow, drift underline
      var ty = h * 0.13;
      this.add.bitmapText(w / 2 + 3 * U, ty + 4 * U, 'pix', 'DRIFTLANDS', FS * 3.6 * U).setOrigin(0.5).setTint(0x03151d);
      var tt = this.add.bitmapText(w / 2, ty, 'pix', 'DRIFTLANDS', FS * 3.6 * U).setOrigin(0.5).setTint(0xf2ffe4);
      this.tweens.add({ targets: tt, y: ty + 3 * U, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add.rectangle(w / 2, ty + 26 * U, 150 * U, 2 * U, 0x8ee6d8, 0.8);
      this.add.bitmapText(w / 2, ty + 34 * U, 'pix', 'AN ISLAND THAT REMEMBERS', FS * 1.15 * U)
        .setOrigin(0.5, 0).setTint(0x8fc3b4);

      // Any valid save is a run in progress. Fresh loading is reserved for the
      // explicit new island action, so a pre tutorial save is never discarded.
      var hasRun = !!valid;
      // The primary CTA sits at 65 percent of the screen height: thumb height
      // on a phone, and clear of both the tableau and the home indicator.
      var y0 = h * 0.65;
      var made = [];

      function button(label, yy, primary, fn) {
        var bw = Math.min(w - 60 * U, 300 * U), bh = 48 * U;
        var box = self.add.nineslice(w / 2, yy, 'dl', primary ? 'ui_btn_hi' : 'ui_btn', bw, bh, 8 * U, 8 * U, 8 * U, 8 * U)
          .setInteractive({ useHandCursor: true });
        var tx = self.add.bitmapText(w / 2, yy - 2 * U, 'pix', label, FS * 1.6 * U).setOrigin(0.5)
          .setTint(primary ? 0x102029 : 0xdff2ea);
        box.on('pointerdown', function () {
          kit.audio.sfx('s_ui');
          self.tweens.add({ targets: [box, tx], scaleX: 0.97, scaleY: 0.9, duration: 70, yoyo: true });
          self.time.delayedCall(90, fn);
        });
        made.push(box);
        return box;
      }

      if (hasRun) {
        button('CONTINUE DRIFT', y0, true, function () { self.begin(false); });
        button('NEW ISLAND', y0 + 58 * U, false, function () { self.begin(true); });
        button('SETTINGS', y0 + 116 * U, false, openSettings);
      } else {
        button('BEGIN THE DRIFT', y0, true, function () { self.begin(true); });
        button('SETTINGS', y0 + 58 * U, false, openSettings);
      }

      this.input.keyboard.on('keydown-SPACE', function () { self.begin(!hasRun); });
      this.input.keyboard.on('keydown-ENTER', function () { self.begin(!hasRun); });

      this.started = false;
      // Music never fetches before the first user gesture (payload law).
      if (DL.interacted) kit.audio.music('m_title', 600);
      /* Decode the island track while the title is idle. Left lazy it landed
       * on the first seconds of gameplay, which is exactly where the long
       * frame budget is tightest. */
      this.time.delayedCall(400, function () { kit.audio.preload(['m_isle']); });

      this.scale.on('resize', this.onResize, this);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize, self); });
    },

    onResize: function () {
      if (this.scene.isActive('title') && !this.started) this.scene.restart();
    },

    update: function (time, delta) {
      if (this.bands) scrollBands(this.bands, this.scale.width, delta);
      if (this.palms) {
        var t = time / 1000;
        for (var p = 0; p < this.palms.length; p++) {
          this.palms[p].setRotation(Math.sin(t * 1.1 + this.palms[p].phase) * 0.05);
        }
      }
    },

    begin: function (fresh) {
      if (this.started) return;
      this.started = true;
      kit.audio.sfx('s_ui');
      this.cameras.main.fadeOut(260, 4, 16, 24);
      var self = this;
      this.cameras.main.once('camerafadeoutcomplete', function () {
        self.scene.start('play', { fresh: fresh });
        self.scene.launch('hud');
      });
    }
  };

  /* ==================================================================== PLAY */
  var PlayScene = {
    key: 'play',

    init: function (data) { this.fresh = !!(data && data.fresh); },

    create: function () {
      var self = this;
      this.wasAction = false;
      this.noSave = false;
      this.transitioning = false;
      this.loadState(this.fresh);
      this.buildScene();
      this.cameras.main.fadeIn(320, 4, 16, 24);
      this.onPageHide = function () { self.saveNow(); };
      window.addEventListener('pagehide', this.onPageHide);
      this.events.once('shutdown', function () {
        self.saveNow();
        window.removeEventListener('pagehide', self.onPageHide);
      });
    },

    /* --------------------------------------------------------------- state */
    loadState: function (fresh) {
      var saved = fresh ? null : kit.save.get(null);
      if (saved && !W.validate(saved)) saved = null;
      var seed = saved ? saved.seed : (Math.random() * 0xffffffff) >>> 0;
      var s = saved || W.blankSave(seed);
      this.save = s;
      this.seed = s.seed;
      this.tiles = W.generate(this.seed);
      this.hashv = W.makeHash(this.seed);
      this.gear = { sword: s.gear.sword, armor: s.gear.armor, speed: s.gear.speed };
      this.relics = s.relics.slice();
      this.keys = s.keys.slice();
      this.sigils = s.sigils.slice();
      this.score = s.score || 0;
      this.best = s.best || 0;
      this.elapsed = s.elapsed || 0;
      this.taught = !!s.taught;
      this.won = !!s.won;

      this.chunks = new Uint8Array(64 * 64);
      if (s.fog && s.fog.length === 64 * 64) {
        for (var i = 0; i < this.chunks.length; i++) this.chunks[i] = s.fog.charCodeAt(i) === 49 ? 1 : 0;
      }
      // fog alpha per chunk, eased towards the target so a reveal unfurls
      this.fogA = new Float32Array(64 * 64);
      this.fogT = new Float32Array(64 * 64);
      for (var f = 0; f < this.fogA.length; f++) {
        this.fogA[f] = this.chunks[f] ? 0 : 1;
        this.fogT[f] = this.fogA[f];
      }
      this.fogDirty = true;
      this.fogEase = [];

      this.enemies = W.spawnEnemies(this.tiles, this.seed);
      this.sigilNodes = W.spawnSigils(this.tiles, this.seed);
      this.hearts = [];
      this.mode = 'world';
      this.runState = 'play';
      this.dungeon = null;
      this.boss = null;
      this.saveClock = 0;
      this.stepClock = 0;
      this.revealClock = 0;
      this.waterClock = 0;
      this.waterFrame = -1;
      this.moved = 0;
      this.tut = this.taught ? -1 : 0;
      this.tutKills = 0;
      this.shake = { x: 0, y: 0, vx: 0, vy: 0 };
      this.dip = 0;
      this.freeze = 0;
      this.player = {
        x: W.CAMP[0], y: W.CAMP[1], hp: 5, maxHp: 5, facing: -Math.PI / 2, dir: 'down',
        hurt: 0, attackCd: 0, attackTime: 0, windup: 0, invuln: 0, walk: 0, vx: 0, vy: 0
      };
      this.applyGear();
      this.message = '';
      this.messageTime = 0;
      this.mmQueue = [];
      this.mmCtx = null;
      this.hpPips = [];
    },

    applyGear: function () {
      var sigilTiers = this.sigils.filter(Boolean).length / 3 | 0;
      this.bonus = sigilTiers;
      var oldMax = this.player.maxHp || 5;
      this.player.maxHp = 5 + this.gear.armor * 2 + sigilTiers;
      this.player.hp = clamp(this.player.hp + (this.player.maxHp - oldMax), 1, this.player.maxHp);
    },

    saveNow: function () {
      // A reset clears the save; the shutdown and pagehide writes must not
      // resurrect it. One shot suppression covers both paths.
      if (this.noSave || !this.chunks) return;
      var a = new Array(this.chunks.length);
      for (var i = 0; i < this.chunks.length; i++) a[i] = this.chunks[i] ? '1' : '0';
      if (this.score > this.best) this.best = this.score;
      kit.save.set({
        v: W.SAVE_V, seed: this.seed, gear: this.gear, relics: this.relics, keys: this.keys,
        sigils: this.sigils, fog: a.join(''), best: Math.floor(this.best), score: Math.floor(this.score),
        elapsed: this.elapsed, taught: this.taught, won: this.won
      });
    },

    fullRestart: function () { this.resetIsland(); },
    newIsland: function () { this.resetIsland(); },

    resetIsland: function () {
      this.noSave = true;
      kit.save.clear();
      window.removeEventListener('pagehide', this.onPageHide);
      kit.input.clearAll();
      this.wasAction = false;
      this.scene.stop('hud');
      this.scene.start('title');
    },

    /* --------------------------------------------------------------- build */
    buildScene: function () {
      var cam = this.cameras.main;
      cam.setZoom(ZOOM);
      cam.setBounds(0, 0, MAP * TILE, MAP * TILE);
      cam.setBackgroundColor('#0a2f43');

      var base = [], edge = [], props = [];
      var y, x;
      for (y = 0; y < MAP; y++) {
        base.push(new Array(MAP));
        edge.push(new Array(MAP));
        props.push(new Array(MAP));
      }
      this.paintTerrain(base, edge, props);

      this.mapBase = this.make.tilemap({ data: base, tileWidth: TILE, tileHeight: TILE });
      var tsT = this.mapBase.addTilesetImage('terrain', 'terrain', TILE, TILE, 0, 0);
      this.layerBase = this.mapBase.createLayer(0, tsT, 0, 0).setDepth(-10);

      this.mapEdge = this.make.tilemap({ data: edge, tileWidth: TILE, tileHeight: TILE });
      this.layerEdge = this.mapEdge.createLayer(0, this.mapEdge.addTilesetImage('terrain', 'terrain', TILE, TILE, 0, 0), 0, 0).setDepth(-9);

      this.mapProps = this.make.tilemap({ data: props, tileWidth: TILE, tileHeight: TILE });
      this.layerProps = this.mapProps.createLayer(0, this.mapProps.addTilesetImage('terrain', 'terrain', TILE, TILE, 0, 0), 0, 0).setDepth(-8);

      /* Fog is a single soft texture, not a 16384 tile layer. It removes a
       * full screen of opaque quads every frame and lets the reveal unfurl
       * with a soft animated edge instead of popping tile by tile. */
      if (!this.textures.exists('fogtex')) {
        var fogBaked = GGKit.hiDpi.canvas(64, 64);
        fogBaked.ctx.imageSmoothingEnabled = true;
        this.textures.addCanvas('fogtex', fogBaked.canvas);
      }
      this.fogTex = this.textures.get('fogtex');
      this.fogCtx = this.fogTex.getContext();
      if (this.fogTex.setFilter) this.fogTex.setFilter(1);
      this.fogImage = this.fogCtx.createImageData(Math.round(64 * DPR), Math.round(64 * DPR));
      this.repaintFog(true);
      this.fogSprite = this.add.image(MAP * TILE / 2, MAP * TILE / 2, 'fogtex')
        .setDisplaySize(MAP * TILE + TILE * 2, MAP * TILE + TILE * 2).setDepth(40);

      // dungeon room layer (rebuilt in place, never re-allocated)
      var droom = [];
      for (y = 0; y < ROOM_H; y++) { droom.push(new Array(ROOM_W)); for (x = 0; x < ROOM_W; x++) droom[y][x] = TIDX.dun[0].floor[0]; }
      this.mapDun = this.make.tilemap({ data: droom, tileWidth: TILE, tileHeight: TILE });
      this.layerDun = this.mapDun.createLayer(0, this.mapDun.addTilesetImage('terrain', 'terrain', TILE, TILE, 0, 0), 0, 0).setDepth(-10);
      this.layerDun.setVisible(false);
      this.dunBlocked = null;

      this.buildLandmarks();

      // entity layer ------------------------------------------------------
      // Every sprite below comes from the one 'dl' atlas, so the whole entity
      // pass batches into a single draw call.
      this.sigilSprites = this.sigilNodes.map(function () { return null; });
      this.heartSprites = [];
      this.pool = [];
      for (var i = 0; i < 24; i++) {
        var sp = this.add.sprite(0, 0, 'dl', 'e_moss_idle0').setVisible(false).setDepth(10);
        sp.setOrigin(0.5, 0.72);
        this.pool.push(sp);
      }
      for (var pp = 0; pp < 24; pp++) {
        this.hpPips.push(this.add.image(0, 0, 'dl', 'fx_shard').setVisible(false).setDepth(11).setScale(0.8));
      }
      this.shadow = this.add.image(0, 0, 'dl', 'fx_puff').setDepth(9).setAlpha(0.25).setTint(0x02141c).setScale(1.6, 0.9);

      this.pSprite = this.add.sprite(this.player.x * TILE, this.player.y * TILE, 'dl', 'dr_d_idle0').setDepth(12);
      this.pSprite.setOrigin(0.5, 0.72);
      this.slash = this.add.image(0, 0, 'dl', 'fx_slash').setDepth(14).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      this.marker = this.add.image(0, 0, 'dl', 'ui_marker').setDepth(30).setVisible(false).setOrigin(0.5, 1);

      this.torch = this.add.image(0, 0, 'torch').setDepth(38).setVisible(false);

      // particle systems ---------------------------------------------------
      this.fxSpark = this.add.particles(0, 0, 'dl', {
        frame: 'fx_spark',
        speed: { min: px(40), max: px(130) }, lifespan: 420, quantity: 6, scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 }, tint: [0xfff0b8, 0xffc46b], emitting: false, maxAliveParticles: 48
      }).setDepth(20);
      this.fxDust = this.add.particles(0, 0, 'dl', {
        frame: 'fx_puff',
        speed: { min: px(6), max: px(26) }, lifespan: 520, quantity: 2, scale: { start: 0.7, end: 0 },
        alpha: { start: 0.5, end: 0 }, tint: 0xe4c98b, emitting: false, maxAliveParticles: 28
      }).setDepth(8);
      this.fxLeaf = this.add.particles(0, 0, 'dl', {
        frame: 'fx_leaf',
        speed: { min: px(20), max: px(70) }, lifespan: 720, gravityY: px(40), quantity: 5,
        scale: { start: 1, end: 0.2 }, rotate: { start: 0, end: 220 },
        alpha: { start: 1, end: 0 }, tint: [0x5cae52, 0x8bd074], emitting: false, maxAliveParticles: 32
      }).setDepth(20);
      this.fxMote = this.add.particles(0, 0, 'dl', {
        frame: 'fx_spark',
        speed: { min: px(8), max: px(34) }, lifespan: 900, quantity: 1, scale: { start: 0.9, end: 0 },
        alpha: { start: 0.8, end: 0 }, tint: [0x8ee6d8, 0xd9f6ee], emitting: false, maxAliveParticles: 36
      }).setDepth(30);
      this.fxShard = this.add.particles(0, 0, 'dl', {
        frame: 'fx_shard',
        speed: { min: px(60), max: px(150) }, lifespan: 340, quantity: 5, scale: { start: 1.1, end: 0.2 },
        rotate: { start: 0, end: 260 },
        alpha: { start: 1, end: 0 }, tint: [0xffd6d6, 0xff8a7a], emitting: false, maxAliveParticles: 32
      }).setDepth(21);

      this.reveal(this.player.x, this.player.y, 13, true);
      this.paintMinimap(true);
      this.spawnTutorial();
      // the two interior tracks decode well before any gate can be reached,
      // so a dungeon or boss transition never pays a decode mid run
      this.time.delayedCall(7000, function () { kit.audio.preload(['m_deep', 'm_tide']); });
      if (this.tut < 0) this.say('The island waits. Follow the shore north.', 3.2);
      kit.audio.music('m_isle', 900);
      this.camTarget = { x: this.player.x * TILE, y: this.player.y * TILE };
    },

    paintTerrain: function (base, edge, props) {
      var t = this.tiles, h = this.hashv;
      var P = {}; P[W.WATER] = 0; P[W.SHALLOW] = 1; P[W.BEACH] = 2; P[W.GRASS] = 3;
      P[W.FOREST] = 4; P[W.ROCK] = 5; P[W.RUIN] = 6;
      var NAME = {}; NAME[W.WATER] = 'water'; NAME[W.SHALLOW] = 'shallow'; NAME[W.BEACH] = 'sand'; NAME[W.GRASS] = 'grass';
      NAME[W.FOREST] = 'forest'; NAME[W.ROCK] = 'rock'; NAME[W.RUIN] = 'ruin';
      // props are drawn from the terrain atlas so the world stays on one texture
      var PROP = { forest: TIDX.propForest, grass: TIDX.propGrass, sand: TIDX.propSand };
      // a share of grass tiles use the animated sway slots, so the open field
      // is never completely still
      var GRASS_BASE = TIDX.grass.concat(TIDX.grassSway);
      var nb = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];

      for (var y = 0; y < MAP; y++) {
        for (var x = 0; x < MAP; x++) {
          var ty = t[y * MAP + x];
          base[y][x] = -1; edge[y][x] = -1; props[y][x] = -1;
          var name = NAME[ty];
          var set = name === 'grass' ? GRASS_BASE : TIDX[name];
          var r = h(x, y, this.seed + 3);
          base[y][x] = (r < 0.82 || set.length <= 3)
            ? set[(r * 3.65) | 0]
            : set[3 + (((r * 91) | 0) % (set.length - 3))];

          var bestP = P[ty], bestT = -1, mask = 0;
          for (var k = 0; k < 4; k++) {
            var nx = x + nb[k][0], ny = y + nb[k][1];
            if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
            var nt = t[ny * MAP + nx];
            if (P[nt] > bestP) { bestP = P[nt]; bestT = nt; }
          }
          if (bestT >= 0) {
            for (var k2 = 0; k2 < 4; k2++) {
              var nx2 = x + nb[k2][0], ny2 = y + nb[k2][1];
              if (nx2 < 0 || ny2 < 0 || nx2 >= MAP || ny2 >= MAP) continue;
              if (t[ny2 * MAP + nx2] === bestT) mask |= nb[k2][2];
            }
            var eset = TIDX[NAME[bestT] + 'Edge'];
            if (eset && mask) edge[y][x] = eset[mask];
          } else if (ty === W.SHALLOW) {
            for (var k3 = 0; k3 < 4; k3++) {
              var nx3 = x + nb[k3][0], ny3 = y + nb[k3][1];
              if (nx3 < 0 || ny3 < 0 || nx3 >= MAP || ny3 >= MAP) { mask |= nb[k3][2]; continue; }
              if (t[ny3 * MAP + nx3] === W.WATER) mask |= nb[k3][2];
            }
            if (mask) edge[y][x] = TIDX.foam[mask];
          }

          var list = PROP[name];
          if (list && list.length) {
            var rp = h(x + 400, y - 400, this.seed + 9);
            var density = name === 'forest' ? 0.42 : name === 'grass' ? 0.2 : 0.06;
            if (rp < density) props[y][x] = list[(h(x, y + 900, this.seed + 12) * list.length) | 0];
          }
        }
      }
      var clearPad = function (cx, cy, r) {
        for (var yy = cy - r; yy <= cy + r; yy++) for (var xx = cx - r; xx <= cx + r; xx++) {
          if (xx >= 0 && yy >= 0 && xx < MAP && yy < MAP) props[yy][xx] = -1;
        }
      };
      clearPad(W.CAMP[0], W.CAMP[1], W.COVE.r);
      clearPad(W.RUIN_GATE[0], W.RUIN_GATE[1], 5);
      W.GATES.forEach(function (p) { clearPad(p[0], p[1], 3); });
    },

    buildLandmarks: function () {
      var self = this;
      var cx = W.CAMP[0] * TILE, cy = W.CAMP[1] * TILE;
      this.glows = [];
      // one depth band for every additive glow so they batch as a group
      function glowAt(x, y, scale, tint, alpha, pulse) {
        var g = self.add.image(x, y, 'glow').setDepth(9.6).setScale(scale)
          .setTint(tint).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD);
        if (pulse) self.tweens.add({ targets: g, alpha: alpha * 1.7, duration: pulse, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        self.glows.push(g);
        return g;
      }

      // The opening cove: shelter, crates, a live fire and staged ground.
      this.add.image(cx - px(30), cy - px(6), 'dl', 'p_shelter').setDepth(6).setOrigin(0.5, 0.9);
      this.add.image(cx + px(26), cy - px(2), 'dl', 'p_crate').setDepth(6).setOrigin(0.5, 0.9);
      this.add.image(cx + px(38), cy + px(4), 'dl', 'p_barrel').setDepth(6).setOrigin(0.5, 0.9);
      // the fire sits south of the spawn tile so the drifter never stands in it
      this.campFire = this.add.image(cx + px(6), cy + px(22), 'dl', 'p_fire0').setDepth(7).setOrigin(0.5, 0.95);
      glowAt(cx + px(6), cy + px(18), 1.1, 0xffb45c, 0.42, 900);

      this.gateSprites = W.GATES.map(function (p, i) {
        var gx = p[0] * TILE, gy = p[1] * TILE;
        var arch = self.add.image(gx, gy - px(2), 'dl', 'p_gate').setDepth(6).setOrigin(0.5, 0.86);
        var lamp = glowAt(gx, gy - px(10), 1.2, 0xffe08a, 0.45, 1400 + i * 210);
        return { arch: arch, lamp: lamp };
      });

      var rx = W.RUIN_GATE[0] * TILE, ry = W.RUIN_GATE[1] * TILE;
      this.ruinDoor = this.add.image(rx, ry - px(4), 'dl', 'p_ruindoor').setDepth(6).setOrigin(0.5, 0.86);
      this.ruinGlow = glowAt(rx, ry - px(14), 2, 0x8f6fb5, 0.32, 2000);

      // palms along the shore, pooled and culled
      this.palms = [];
      var r = W.rng(this.seed ^ 0x7f1e);
      for (var i = 0; i < 30; i++) {
        for (var t = 0; t < 40; t++) {
          var palmX = 10 + r() * 108, palmY = 10 + r() * 108;
          if (this.tiles[(palmY | 0) * MAP + (palmX | 0)] === W.BEACH) {
            var s = this.add.image(palmX * TILE, palmY * TILE, 'dl', 'p_palm').setDepth(7).setOrigin(0.5, 0.92);
            s.phase = r() * TAU;
            this.palms.push(s);
            break;
          }
        }
      }
      this.chest = this.add.image(0, 0, 'dl', 'p_chest0').setDepth(6).setVisible(false).setOrigin(0.5, 0.9);
      this.gateGlow = glowAt(0, 0, 1.6, 0x9ede7a, 0);
      this.gateGlow.setVisible(false);
      this.dunProps = [];
      for (var dp = 0; dp < 12; dp++) {
        this.dunProps.push(this.add.image(0, 0, 'dl', 'p_barrel').setDepth(6).setVisible(false).setOrigin(0.5, 0.9));
      }
    },

    // Authored opening: two staged foes and a heart at fixed cove positions.
    spawnTutorial: function () {
      if (this.tut !== 0) return;
      var cx = W.CAMP[0], cy = W.CAMP[1];
      this.tutFoes = [
        W.makeWorldEnemy('skitter', cx - 5, cy - 5, 900, this.seed),
        W.makeWorldEnemy('skitter', cx + 5, cy - 6, 901, this.seed)
      ];
      this.tutFoes.forEach(function (e) { e.hp = e.maxHp = 2; e.tut = true; e.dormant = true; });
      this.enemies = this.enemies.concat(this.tutFoes);
    },

    /* --------------------------------------------------------------- input */
    // The input record and the knob offset are reused, never re-allocated.
    // Two object literals per frame is two thousand objects a minute of GC
    // pressure, and GC is exactly what the long-frame budget cannot absorb.
    readInput: function () {
      var inp = this.inpRec || (this.inpRec = { x: 0, y: 0, action: false, pressed: false });
      inp.x = 0; inp.y = 0; inp.action = false; inp.pressed = false;
      if (!this.knobOffset) this.knobOffset = { x: 0, y: 0 };
      var sr = this.hudRects ? this.hudRects.stick : null;
      var ar = this.hudRects ? this.hudRects.action : null;
      var stickP = null, actP = null;
      // One zone per pointer, ACTION wins, so a thumb in the overlap of two
      // small responsive rects can never steal the stick pointer.
      kit.input.pointers.forEach(function (p) {
        if (!actP && ar && p.startX >= ar.x && p.startX < ar.x + ar.w && p.startY >= ar.y && p.startY < ar.y + ar.h) { actP = p; return; }
        if (!stickP && sr && p.startX >= sr.x && p.startX < sr.x + sr.w && p.startY >= sr.y && p.startY < sr.y + sr.h) stickP = p;
      });
      if (stickP && sr) {
        var cxp = sr.x + sr.w / 2, cyp = sr.y + sr.h / 2, max = sr.w * 0.34;
        var dx = stickP.x - cxp, dy = stickP.y - cyp;
        var l = Math.hypot(dx, dy);
        if (l > max) { dx = dx / l * max; dy = dy / l * max; }
        inp.x = dx / max; inp.y = dy / max;
        this.knobOffset.x = dx; this.knobOffset.y = dy;
      } else {
        this.knobOffset.x = 0; this.knobOffset.y = 0;
      }
      if (actP) inp.action = true;

      if (Math.abs(inp.x) + Math.abs(inp.y) < 0.05) {
        inp.x = (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight') ? 1 : 0) -
                (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft') ? 1 : 0);
        inp.y = (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown') ? 1 : 0) -
                (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp') ? 1 : 0);
      }
      if (kit.input.keyDown('Space') || kit.input.keyDown('Enter')) inp.action = true;
      var len = Math.hypot(inp.x, inp.y);
      if (len > 1) { inp.x /= len; inp.y /= len; }
      inp.pressed = inp.action && !this.wasAction;
      this.wasAction = inp.action;
      return inp;
    },

    /* --------------------------------------------------------------- frame */
    update: function (time, delta) {
      var dt = Math.min(0.033, delta / 1000);
      // House hit stop: the simulation NEVER skips a step. Only the cosmetic
      // clock freezes, so the view holds for 40 to 70 ms while physics,
      // cooldowns and AI keep running underneath.
      this.freeze = Math.max(0, this.freeze - dt);
      var frozen = this.freeze > 0;

      if (this.runState === 'play') {
        this.elapsed += dt;
        this.step(dt);
        this.saveClock += dt;
        if (this.saveClock >= 8) { this.saveClock = 0; this.saveNow(); }
      } else {
        this.stepCosmetic(dt);
      }
      this.drawFrame(dt, frozen);
      if (this.messageTime > 0) {
        this.messageTime -= dt;
        if (this.messageTime <= 0 && this.hud) this.hud.setToast('');
      }
    },

    step: function (dt) {
      var inp = this.readInput();
      this.updatePlayer(dt, inp);
      if (this.mode === 'world') this.updateWorld(dt);
      else if (this.mode === 'dungeon') this.updateDungeon(dt);
      else this.updateBoss(dt);
      this.updateTutorial();
    },

    stepCosmetic: function (dt) {
      var inp = this.readInput();
      if (inp.pressed && this.runState !== 'play' && this.hud) this.hud.confirmPanel();
    },

    updatePlayer: function (dt, inp) {
      var p = this.player;
      var speed = 5.3 + this.gear.speed * 0.75;
      var acting = p.windup > 0 || p.attackTime > 0;
      if ((inp.x || inp.y) && !acting) {
        p.facing = Math.atan2(inp.y, inp.x);
        p.walk += dt * 10;
        p.vx = inp.x * speed; p.vy = inp.y * speed;
        this.moveEntity(p, inp.x * speed, inp.y * speed, dt, this.mode === 'world');
        this.moved += Math.hypot(inp.x, inp.y) * speed * dt;
        p.dir = Math.abs(inp.x) > Math.abs(inp.y) ? (inp.x > 0 ? 'right' : 'left') : (inp.y > 0 ? 'down' : 'up');
        this.stepClock += dt * Math.hypot(inp.x, inp.y);
        if (this.stepClock > 0.34) { this.stepClock = 0; this.footstep(); }
      } else {
        p.vx = 0; p.vy = 0;
      }
      p.attackCd = Math.max(0, p.attackCd - dt);
      p.attackTime = Math.max(0, p.attackTime - dt);
      p.invuln = Math.max(0, p.invuln - dt);
      p.hurt = Math.max(0, p.hurt - dt);
      // beat one: anticipation. The blade lands when the wind up expires.
      if (p.windup > 0) {
        p.windup -= dt;
        if (p.windup <= 0) { p.windup = 0; this.strike(); }
      }
      if (inp.action || inp.pressed) this.tryAction(inp);
    },

    footstep: function () {
      var t = this.mode === 'world'
        ? this.tiles[(this.player.y | 0) * MAP + (this.player.x | 0)]
        : W.ROCK;
      var name = t === W.BEACH ? 's_step_sand' : (t === W.ROCK || t === W.RUIN || this.mode !== 'world') ? 's_step_stone' : 's_step_grass';
      kit.audio.sfx(name, { volume: 0.32, rate: 0.94 + Math.random() * 0.14 });
      if (kit.juice.enabled) {
        this.fxDust.setParticleTint(t === W.BEACH ? 0xe2c48b : t === W.ROCK ? 0x8894a0 : 0x6fae5c);
        this.fxDust.emitParticleAt(this.player.x * TILE, this.player.y * TILE + px(5), 2);
      }
    },

    blocked: function (x, y) {
      if (this.mode === 'world') return !W.isLand(this.tiles, x, y);
      if (x < 1.4 || y < 1.5 || x > ROOM_W - 1.4 || y > ROOM_H - 1.4) return true;
      if (!this.dunBlocked) return false;
      var tx = x | 0, ty = y | 0;
      if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return true;
      return this.dunBlocked[ty * ROOM_W + tx] === 1;
    },

    moveEntity: function (e, dx, dy, dt, world) {
      var nx = e.x + dx * dt, ny = e.y + dy * dt;
      if (!this.blocked(nx, e.y)) e.x = nx;
      if (!this.blocked(e.x, ny)) e.y = ny;
    },

    // Knockback is routed through the same collision aware move, so a struck
    // enemy can never be shoved into water, a cliff or a dungeon wall.
    applyKnock: function (e, dt) {
      if (!e.kx && !e.ky) return;
      this.moveEntity(e, e.kx, e.ky, dt, this.mode === 'world');
      var damp = Math.pow(0.0006, dt);
      e.kx *= damp; e.ky *= damp;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.ky) < 0.05) { e.kx = 0; e.ky = 0; }
    },

    actionLabel: function () {
      if (this.mode === 'world') {
        var p = this.player;
        for (var i = 0; i < W.GATES.length; i++) {
          if (!this.relics[i] && dist(p.x, p.y, W.GATES[i][0], W.GATES[i][1]) < 2.6) {
            return (i === 0 || this.relics[i - 1]) ? 'ENTER' : 'LOCKED';
          }
        }
        if (dist(p.x, p.y, W.RUIN_GATE[0], W.RUIN_GATE[1]) < 3.4) {
          return this.relics.every(Boolean) ? 'ENTER' : 'SEALED';
        }
      } else if (this.mode === 'dungeon') {
        var d = this.dungeon, q = this.player;
        if (d && d.cleared && d.room === 4 && !d.chestOpen && dist(q.x, q.y, ROOM_W / 2, 4.5) < 2.4) return 'OPEN';
        if (d && d.cleared && d.room < 4 && q.y < 2.6 && Math.abs(q.x - ROOM_W / 2) < 2.2) return 'ENTER';
      }
      return 'SWORD';
    },

    tryAction: function (inp) {
      if (this.runState !== 'play' || this.transitioning) return;
      var p = this.player;
      if (this.mode === 'world') {
        for (var i = 0; i < W.GATES.length; i++) {
          if (!this.relics[i] && dist(p.x, p.y, W.GATES[i][0], W.GATES[i][1]) < 2.6) {
            if (inp.pressed) {
              // gauntlets open in order, and they are ordered by distance
              if (i > 0 && !this.relics[i - 1]) {
                kit.audio.sfx('s_sealed');
                this.say('The ' + GATE_NAMES[i] + ' will not open until the ' + GATE_NAMES[i - 1] + ' gives up its relic.', 3);
              } else {
                this.enterDungeon(i);
              }
            }
            return;
          }
        }
        if (dist(p.x, p.y, W.RUIN_GATE[0], W.RUIN_GATE[1]) < 3.4) {
          if (inp.pressed) {
            if (this.relics.every(Boolean)) this.enterBoss();
            else {
              kit.audio.sfx('s_sealed');
              this.say('A sealed ruin. ' + this.relics.filter(Boolean).length + ' of 3 relics.', 2.4);
            }
          }
          return;
        }
      } else if (this.mode === 'dungeon') {
        var d = this.dungeon;
        if (d.cleared && d.room === 4 && !d.chestOpen && dist(p.x, p.y, ROOM_W / 2, 4.5) < 2.4) {
          if (inp.pressed) this.openChest();
          return;
        }
        if (d.cleared && d.room < 4 && p.y < 2.6 && p.x > ROOM_W / 2 - 2.2 && p.x < ROOM_W / 2 + 2.2) {
          if (inp.pressed) this.nextRoom();
          return;
        }
      }
      this.attack();
    },

    /* Three beat impact: anticipation, contact, follow through. */
    attack: function () {
      var p = this.player;
      if (p.attackCd > 0 || p.windup > 0) return;
      p.attackCd = 0.36; p.windup = 0.07;
      kit.audio.sfx('s_swing', { volume: 0.5, rate: 0.95 + Math.random() * 0.12 });
    },

    strike: function () {
      var p = this.player;
      p.attackTime = 0.22;
      this.impulse(1.1, p.facing);
      var damage = 1 + this.gear.sword + (this.bonus > 2 ? 1 : 0);
      var targets = this.mode === 'world' ? this.enemies : this.mode === 'dungeon' ? this.dungeon.enemies : [this.boss];
      var range = this.mode === 'boss' ? 2.25 : this.mode === 'dungeon' ? 2.0 : 1.85;
      var hitOne = false;
      for (var i = 0; i < targets.length; i++) {
        var e = targets[i];
        if (!e || e.dead || e.hp <= 0) continue;
        var dd = dist(p.x, p.y, e.x, e.y);
        var bearing = Math.atan2(e.y - p.y, e.x - p.x);
        var diff = Math.atan2(Math.sin(bearing - p.facing), Math.cos(bearing - p.facing));
        if (dd < range && Math.abs(diff) < 1.25) {
          e.hp -= damage; e.hit = 0.22; e.show = 2.2;
          // eased knockback with one overshoot instead of a teleport
          var push = this.mode === 'boss' ? 5 : 9;
          e.kx = Math.cos(bearing) * push; e.ky = Math.sin(bearing) * push;
          if (kit.juice.enabled) {
            this.fxSpark.emitParticleAt(e.x * TILE, e.y * TILE - px(4), 6);
            this.fxShard.setParticleTint(0xffe8c0);
            this.fxShard.emitParticleAt(e.x * TILE - Math.cos(bearing) * px(4), e.y * TILE - Math.sin(bearing) * px(4) - px(4), 4);
          }
          hitOne = true;
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      if (hitOne) {
        this.impulse(2.6, p.facing);
        this.dip = 1;
        this.freeze = 0.055;
        kit.audio.sfx('s_hit', { volume: 0.8, rate: 0.92 + Math.random() * 0.16 });
      } else if (this.mode === 'world') {
        var tx = Math.floor(p.x + Math.cos(p.facing)), ty = Math.floor(p.y + Math.sin(p.facing));
        if (tx >= 0 && ty >= 0 && tx < MAP && ty < MAP && this.layerProps.getTileAt(tx, ty)) {
          this.layerProps.removeTileAt(tx, ty);
          if (kit.juice.enabled) this.fxLeaf.emitParticleAt(tx * TILE + px(8), ty * TILE + px(8), 6);
          kit.audio.sfx('s_chop', { volume: 0.45 });
          this.score += 5;
        }
      }
    },

    // Damped camera impulse with a single overshoot, gated by the shared
    // reduced motion preference along with every flash and particle burst.
    impulse: function (mag, angle) {
      if (!kit.juice.enabled) return;
      var a = angle === undefined ? Math.random() * TAU : angle;
      this.shake.vx += Math.cos(a) * mag * px(26);
      this.shake.vy += Math.sin(a) * mag * px(26);
    },

    flash: function (dur, r, g, b) {
      if (!kit.juice.enabled) return;
      this.cameras.main.flash(dur, r, g, b, false);
    },

    killEnemy: function (e) {
      e.dead = true;
      e.dying = 0.42;
      e.respawn = 75;
      this.score += e.boss ? 400 : this.mode === 'boss' ? 500 : 100;
      if (kit.juice.enabled) {
        this.fxShard.setParticleTint(0xff9a8a);
        this.fxShard.emitParticleAt(e.x * TILE, e.y * TILE - px(4), 9);
        this.fxSpark.emitParticleAt(e.x * TILE, e.y * TILE - px(4), 8);
      }
      this.impulse(3.4);
      kit.audio.sfx('s_kill', { volume: 0.7 });
      if (e.tut) this.tutKills++;
      if (this.mode === 'world' && this.hashv(e.x | 0, e.y | 0, this.seed + 71) < 0.38) {
        this.hearts.push({ x: e.x, y: e.y, life: 18, pop: 0 });
      }
      if (this.mode === 'dungeon' && this.dungeon.enemies.every(function (x) { return x.dead || x.hp <= 0; })) {
        this.dungeon.cleared = true;
        if (this.dungeon.room === 2 && !this.keys[this.dungeon.index]) {
          this.keys[this.dungeon.index] = true;
          kit.audio.sfx('s_pickup');
          this.say('Ward key taken. The relic seal will yield.', 3);
          this.saveNow(); // a ward key is never left to the autosave interval
        } else {
          this.say(this.dungeon.room === 4 ? 'The guardian falls. Open the relic chest.' : 'Room clear. The north gate opens.', 3);
        }
        kit.audio.sfx('s_door', { volume: 0.6 });
        this.paintDungeon();
      }
      if (this.mode === 'boss') this.win();
    },

    hurtPlayer: function (amount, fx, fy) {
      var p = this.player;
      if (p.invuln > 0 || this.runState !== 'play') return;
      p.hp -= amount; p.invuln = 0.8; p.hurt = 0.25;
      this.impulse(5);
      this.dip = 1.4;
      this.freeze = 0.07;
      kit.audio.sfx('s_hurt', { volume: 0.85 });
      this.flash(140, 120, 30, 24);
      var a = Math.atan2(p.y - fy, p.x - fx);
      this.moveEntity(p, Math.cos(a) * 1.1, Math.sin(a) * 1.1, 1, this.mode === 'world');
      if (kit.juice.enabled) this.fxShard.emitParticleAt(p.x * TILE, p.y * TILE - px(4), 6);
      if (p.hp <= 0) this.die();
    },

    /* ---------------------------------------------------------- world sim */
    updateWorld: function (dt) {
      var p = this.player;
      this.reveal(p.x, p.y, 11, false);
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead) {
          if (e.dying > 0) e.dying = Math.max(0, e.dying - dt);
          e.respawn -= dt;
          if (e.respawn <= 0 && !e.tut) {
            e.dead = false; e.hp = e.maxHp; e.x = e.homeX; e.y = e.homeY; e.kx = 0; e.ky = 0;
          }
          continue;
        }
        var d = dist(p.x, p.y, e.x, e.y);
        if (d > 26) continue;
        this.applyKnock(e, dt);
        if (e.dormant) { if (d < 7) e.dormant = false; else continue; }
        e.cooldown = Math.max(0, e.cooldown - dt);
        e.hit = Math.max(0, e.hit - dt);
        e.atk = Math.max(0, e.atk - dt);
        if (e.show) e.show = Math.max(0, e.show - dt);
        e.phase += dt;
        var vx = Math.cos(e.phase * 0.7) * 0.2, vy = Math.sin(e.phase * 0.9) * 0.2;
        var sp = 1;
        if (e.type === 'mossling') { if (d < 10) { vx = p.x - e.x; vy = p.y - e.y; } sp = 1.15; }
        else if (e.type === 'skitter') {
          if (d < 9) { var a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.phase * 2) * 0.9; vx = Math.cos(a); vy = Math.sin(a); }
          sp = 1.65;
        } else { if (d < 8) { vx = p.x - e.x; vy = p.y - e.y; } sp = 0.72; }
        sp += e.tier * 0.08;
        var l = Math.hypot(vx, vy) || 1;
        e.moving = true;
        this.moveEntity(e, vx / l * sp, vy / l * sp, dt, true);
        if (d < 0.85 && e.cooldown <= 0) {
          e.cooldown = e.type === 'brute' ? 1.25 : 0.9;
          e.atk = 0.25;
          this.hurtPlayer(e.type === 'brute' ? 2 : 1, e.x, e.y);
        }
      }
      for (var hi = this.hearts.length - 1; hi >= 0; hi--) {
        var h = this.hearts[hi];
        h.life -= dt;
        h.pop = Math.min(1, (h.pop || 0) + dt * 4);
        if (dist(p.x, p.y, h.x, h.y) < 1.1) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          this.score += 25;
          kit.audio.sfx('s_heart');
          if (kit.juice.enabled) this.fxSpark.emitParticleAt(h.x * TILE, h.y * TILE, 8);
          this.hearts.splice(hi, 1);
          if (this.hud) this.hud.pulseHearts();
          this.say('Heart recovered.', 1.2);
        } else if (h.life <= 0) this.hearts.splice(hi, 1);
      }
      for (var si = 0; si < this.sigilNodes.length; si++) {
        var n = this.sigilNodes[si];
        if (this.sigils[n.id]) continue;
        if (dist(p.x, p.y, n.x, n.y) < 1.2) {
          this.sigils[n.id] = true;
          this.score += 150;
          kit.audio.sfx('s_sigil');
          if (kit.juice.enabled) this.fxMote.emitParticleAt(n.x * TILE, n.y * TILE, 16);
          this.impulse(2);
          var before = this.bonus;
          this.applyGear();
          var count = this.sigils.filter(Boolean).length;
          if (this.hud) this.hud.tickSigil(count);
          this.say(this.bonus > before
            ? 'Sigil ' + count + ' of 12. Drift attunement rises.'
            : 'Sigil ' + count + ' of 12.', 2.6);
          this.saveNow();
        }
      }
      this.dropShallowGuard();
    },

    dropShallowGuard: function () {
      var p = this.player;
      if (!W.isLand(this.tiles, p.x, p.y)) {
        p.x = clamp(p.x, 2, MAP - 3); p.y = clamp(p.y, 2, MAP - 3);
        for (var r = 1; r < 8; r++) {
          for (var a = 0; a < 12; a++) {
            var nx = p.x + Math.cos(a / 12 * TAU) * r, ny = p.y + Math.sin(a / 12 * TAU) * r;
            if (W.isLand(this.tiles, nx, ny)) { p.x = nx; p.y = ny; return; }
          }
        }
      }
    },

    /* -------------------------------------------------------------- fog */
    reveal: function (x, y, radius, instant) {
      var cx0 = Math.max(0, Math.floor((x - radius) / 2)), cx1 = Math.min(63, Math.ceil((x + radius) / 2));
      var cy0 = Math.max(0, Math.floor((y - radius) / 2)), cy1 = Math.min(63, Math.ceil((y + radius) / 2));
      var newOnes = 0;
      for (var cy = cy0; cy <= cy1; cy++) {
        for (var cx = cx0; cx <= cx1; cx++) {
          var idx = cy * 64 + cx;
          if (this.chunks[idx]) continue;
          var d = dist(x, y, cx * 2 + 1, cy * 2 + 1);
          if (d > radius) continue;
          this.chunks[idx] = 1;
          this.fogT[idx] = 0;
          if (instant) { this.fogA[idx] = 0; this.fogDirty = true; }
          else if (this.fogEase.length < 2048) this.fogEase.push(idx);
          newOnes++;
          if (this.mmQueue.length < 4096) this.mmQueue.push(idx);
          if (!instant && newOnes < 3 && kit.juice.enabled && this.hashv(cx, cy, this.seed + 17) < 0.5) {
            this.fxMote.emitParticleAt(cx * 2 * TILE + px(8), cy * 2 * TILE + px(8), 1);
          }
        }
      }
      if (newOnes > 0 && !instant && this.revealSfx !== true) {
        this.revealSfx = true;
        var self = this;
        kit.audio.sfx('s_reveal', { volume: 0.22 });
        this.time.delayedCall(2200, function () { self.revealSfx = false; });
      }
    },

    // Bounded per frame ease, then one 64x64 upload. The bilinear filter on
    // the fog texture turns the chunk grid into a soft animated edge.
    stepFog: function (dt) {
      if (this.fogEase.length) {
        var rate = dt * 2.6;
        for (var i = this.fogEase.length - 1; i >= 0; i--) {
          var idx = this.fogEase[i];
          this.fogA[idx] -= rate;
          if (this.fogA[idx] <= 0) { this.fogA[idx] = 0; this.fogEase.splice(i, 1); }
        }
        this.fogDirty = true;
      }
      if (this.fogDirty) { this.repaintFog(false); this.fogDirty = false; }
    },

    repaintFog: function () {
      var d = this.fogImage.data;
      var a = this.fogA;
      var width = this.fogImage.width, height = this.fogImage.height;
      for (var cy = 0; cy < 64; cy++) for (var cx = 0; cx < 64; cx++) {
        var alpha = (a[cy * 64 + cx] * 246) | 0;
        var y0 = Math.round(cy * height / 64), y1 = Math.round((cy + 1) * height / 64);
        var x0 = Math.round(cx * width / 64), x1 = Math.round((cx + 1) * width / 64);
        for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) {
          var i = (yy * width + xx) * 4;
          d[i] = 5; d[i + 1] = 17; d[i + 2] = 26; d[i + 3] = alpha;
        }
      }
      this.fogCtx.putImageData(this.fogImage, 0, 0);
      this.fogTex.refresh();
    },

    mmContext: function () {
      if (this.mmCtx) return this.mmCtx;
      var tex = this.textures.get('minimap');
      if (!tex) return null;
      var img = tex.getSourceImage();
      this.mmTex = tex;
      this.mmCtx = img && img.getContext ? img.getContext('2d') : tex.context;
      return this.mmCtx;
    },

    // The minimap keeps a dim coastline silhouette under the fog so the island
    // shape always reads; revealed chunks are painted in at full value.
    paintMinimap: function (full) {
      var ctx = this.mmContext();
      if (!ctx) return;
      var cols = ['#0b2231', '#e2c48b', '#5cae52', '#2a6a3c', '#8894a0', '#7a6b85', '#164a5c'];
      var dim = ['#08161f', '#3a3327', '#233524', '#1b2a1e', '#2a2e33', '#26222b', '#0d2733'];
      if (full) {
        for (var y = 0; y < MAP; y++) {
          for (var x = 0; x < MAP; x++) {
            ctx.fillStyle = dim[this.tiles[y * MAP + x]] || dim[2];
            ctx.fillRect(x, y, 1, 1);
          }
        }
        this.mmQueue.length = 0;
        for (var i = 0; i < this.chunks.length; i++) if (this.chunks[i]) this.mmQueue.push(i);
      }
      if (!this.mmQueue.length) { if (full && this.mmTex) this.mmTex.refresh(); return; }
      var n = Math.min(this.mmQueue.length, full ? this.mmQueue.length : 260);
      for (var q = 0; q < n; q++) {
        var idx = this.mmQueue[q];
        var cx = idx % 64, cy = (idx / 64) | 0;
        for (var oy = 0; oy < 2; oy++) for (var ox = 0; ox < 2; ox++) {
          ctx.fillStyle = cols[this.tiles[(cy * 2 + oy) * MAP + cx * 2 + ox]] || cols[2];
          ctx.fillRect(cx * 2 + ox, cy * 2 + oy, 1, 1);
        }
      }
      this.mmQueue.splice(0, n);
      this.mmTex.refresh();
    },

    /* ------------------------------------------------------------ dungeon */
    enterDungeon: function (index) {
      var self = this;
      this.transition(function () {
        self.mode = 'dungeon';
        self.dungeon = { index: index, room: 0, cleared: false, chestOpen: false, enemies: W.dungeonRoster(self.seed, index, 0) };
        self.player.x = ROOM_W / 2; self.player.y = ROOM_H - 3; self.player.hp = self.player.maxHp;
        self.showDungeon(true);
        self.paintDungeon();
        self.say(GATE_NAMES[index] + ': five rooms deep.', 2.6);
        kit.audio.sfx('s_door');
        kit.audio.music('m_deep', 900);
      });
    },

    nextRoom: function () {
      var self = this;
      this.transition(function () {
        var d = self.dungeon;
        d.room++; d.cleared = false;
        d.enemies = W.dungeonRoster(self.seed, d.index, d.room);
        self.player.x = ROOM_W / 2; self.player.y = ROOM_H - 3;
        self.paintDungeon();
        self.say('Room ' + (d.room + 1) + ' of 5.', 1.6);
        kit.audio.sfx('s_door');
      });
    },

    openChest: function () {
      var d = this.dungeon, i = d.index, self = this;
      if (!this.keys[i]) {
        kit.audio.sfx('s_sealed');
        this.say('The chest is warded. Find the ward key.', 2.4);
        return;
      }
      d.chestOpen = true;
      this.relics[i] = true;
      var line;
      if (i === 0) { this.gear.sword = Math.max(this.gear.sword, 1); line = 'EMBEREDGE. SLASH POWER UP.'; }
      if (i === 1) { this.gear.armor = Math.max(this.gear.armor, 1); line = 'SHELLMAIL. TWO MORE HEARTS.'; }
      if (i === 2) { this.gear.speed = Math.max(this.gear.speed, 1); line = 'SWIFTSEED. MOVE SPEED UP.'; }
      this.applyGear();
      this.score += 600;
      kit.audio.sfx('s_relic');
      this.impulse(4);
      this.paintDungeon();
      // reward beat: lid pops, icon bursts, and the run holds before returning
      if (kit.juice.enabled) {
        this.fxSpark.emitParticleAt(ROOM_W / 2 * TILE, 4.5 * TILE, 22);
        this.fxMote.emitParticleAt(ROOM_W / 2 * TILE, 4.5 * TILE, 14);
      }
      this.saveNow();
      if (this.hud) this.hud.showReward('RELIC ' + this.relics.filter(Boolean).length + ' OF 3', line);
      this.time.delayedCall(1700, function () {
        if (self.hud) self.hud.hideReward();
        self.transition(function () {
          self.mode = 'world';
          self.dungeon = null;
          self.showDungeon(false);
          self.player.x = W.GATES[i][0];
          self.player.y = W.GATES[i][1] + 2.5;
          self.player.hp = self.player.maxHp;
          self.reveal(self.player.x, self.player.y, 13, true);
          kit.audio.music('m_isle', 900);
          self.say('Relic ' + self.relics.filter(Boolean).length + ' of 3 secured.', 3);
        });
      });
    },

    enterBoss: function () {
      var self = this;
      this.transition(function () {
        self.mode = 'boss';
        self.boss = {
          type: 'tide', x: ROOM_W / 2, y: 5, hp: 20 + self.bonus * 2, maxHp: 20 + self.bonus * 2,
          phase: 0, cooldown: 1.2, hit: 0, pulse: 0, kx: 0, ky: 0, atk: 0, dying: 0, dead: false
        };
        self.player.x = ROOM_W / 2; self.player.y = ROOM_H - 3; self.player.hp = self.player.maxHp;
        self.showDungeon(true);
        self.paintDungeon();
        self.say('The ruin wakes. Break the tide-heart.', 3.2);
        kit.audio.sfx('s_boss');
        kit.audio.music('m_tide', 700);
      });
    },

    // Re-entrant transitions used to let a burst of taps advance several
    // rooms at once and strand the run past room five. One guard, cleared
    // only after the fade in completes.
    transition: function (fn) {
      if (this.transitioning) return;
      this.transitioning = true;
      var cam = this.cameras.main;
      var self = this;
      cam.fadeOut(160, 4, 12, 18);
      cam.once('camerafadeoutcomplete', function () {
        fn();
        self.wasAction = false;
        cam.fadeIn(220, 4, 12, 18);
        cam.once('camerafadeincomplete', function () { self.transitioning = false; });
        // safety net if the fade event is dropped while backgrounded
        self.time.delayedCall(700, function () { self.transitioning = false; });
      });
    },

    showDungeon: function (on) {
      this.layerDun.setVisible(on);
      this.layerBase.setVisible(!on);
      this.layerEdge.setVisible(!on);
      this.layerProps.setVisible(!on);
      this.fogSprite.setVisible(!on);
      this.torch.setVisible(on);
      this.landmarkVisible(!on);
      for (var i = 0; i < this.dunProps.length; i++) this.dunProps[i].setVisible(false);
      if (!on) { this.chest.setVisible(false); this.gateGlow.setVisible(false); }
      if (on) {
        this.cameras.main.setBounds(0, 0, ROOM_W * TILE, ROOM_H * TILE);
        var mood = TIDX.dun[this.mode === 'boss' ? 1 : (this.dungeon ? this.dungeon.index : 0)];
        this.cameras.main.setBackgroundColor(mood.fog);
      } else {
        this.cameras.main.setBounds(0, 0, MAP * TILE, MAP * TILE);
        this.cameras.main.setBackgroundColor('#0a2f43');
      }
    },

    landmarkVisible: function (on) {
      this.ruinDoor.setVisible(on);
      this.campFire.setVisible(on);
      for (var g = 0; g < this.glows.length; g++) this.glows[g].setVisible(on && this.glows[g] !== this.gateGlow);
      this.gateSprites.forEach(function (s) { s.arch.setVisible(on); });
      this.palms.forEach(function (p) { p.setVisible(on); });
    },

    /* Each gauntlet gets its own floor and wall family, accent colour, prop
     * dressing and room silhouette, so the three are not one repainted box. */
    paintDungeon: function () {
      var isBoss = this.mode === 'boss';
      var d = this.dungeon;
      var index = isBoss ? 1 : (d ? d.index : 0);
      var mood = TIDX.dun[index];
      var room = isBoss ? 4 : (d ? d.room : 0);
      var layout = W.roomLayout(index, isBoss ? 3 : room);
      this.dunBlocked = new Uint8Array(ROOM_W * ROOM_H);
      var propI = 0;
      for (var i2 = 0; i2 < this.dunProps.length; i2++) this.dunProps[i2].setVisible(false);

      for (var y = 0; y < ROOM_H; y++) {
        for (var x = 0; x < ROOM_W; x++) {
          var cell = layout[y][x];
          var idx;
          if (cell === 1) {
            idx = mood.wall[(x * 7 + y * 3) % mood.wall.length];
            this.dunBlocked[y * ROOM_W + x] = 1;
          } else {
            idx = mood.floor[(x * 5 + y * 11) % mood.floor.length];
            if (cell === 2) {
              idx = mood.props[(x + y) % mood.props.length];
              if (propI < this.dunProps.length) {
                var pr = this.dunProps[propI++];
                pr.setPosition(x * TILE + px(8), y * TILE + px(14)).setVisible(true)
                  .setFrame((x + y) % 2 ? 'p_barrel' : 'p_crate').setTint(mood.accent);
              }
            }
          }
          this.layerDun.putTileAt(idx, x, y);
        }
      }
      // north gate opening
      if (!isBoss && d && d.cleared && d.room < 4) {
        for (var gx = (ROOM_W >> 1) - 1; gx <= (ROOM_W >> 1) + 1; gx++) {
          this.layerDun.putTileAt(mood.floor[0], gx, 0);
          this.dunBlocked[gx] = 0;
        }
      }
      var showChest = !isBoss && d && d.room === 4;
      this.chest.setVisible(!!showChest);
      if (showChest) {
        this.chest.setPosition(ROOM_W / 2 * TILE, 5.6 * TILE);
        this.chest.setFrame(d.chestOpen ? 'p_chest1' : 'p_chest0');
      }
      var showGate = !isBoss && d && d.cleared && d.room < 4;
      this.gateGlow.setVisible(!!showGate).setAlpha(showGate ? 0.6 : 0);
      if (showGate) this.gateGlow.setPosition(ROOM_W / 2 * TILE, 0.8 * TILE).setTint(mood.accent);
      this.torch.setTint(mood.accent);
      this.dunAccent = mood.accent;
    },

    updateDungeon: function (dt) {
      var p = this.player, d = this.dungeon;
      for (var i = 0; i < d.enemies.length; i++) {
        var e = d.enemies[i];
        if (e.dead || e.hp <= 0) { if (e.dying > 0) e.dying = Math.max(0, e.dying - dt); continue; }
        this.applyKnock(e, dt);
        e.cooldown = Math.max(0, e.cooldown - dt);
        e.hit = Math.max(0, e.hit - dt);
        e.atk = Math.max(0, e.atk - dt);
        if (e.show) e.show = Math.max(0, e.show - dt);
        e.phase += dt;
        var dx = p.x - e.x, dy = p.y - e.y, dd = Math.hypot(dx, dy) || 1;
        var vx = Math.cos(e.phase) * 0.25, vy = Math.sin(e.phase * 0.8) * 0.25;
        var sp;
        if (e.type === 'mossling') { vx = dx / dd; vy = dy / dd; sp = 1.45; }
        else if (e.type === 'skitter') { var a = Math.atan2(dy, dx) + Math.sin(e.phase * 2.4) * 0.85; vx = Math.cos(a); vy = Math.sin(a); sp = 1.45; }
        else if (e.type === 'wisp') { var a2 = Math.atan2(dy, dx) + Math.sin(e.phase) * 1.1; vx = Math.cos(a2); vy = Math.sin(a2); sp = 1.15; }
        else if (e.type === 'guardian') { vx = dx / dd; vy = dy / dd; sp = 0.95 + Math.sin(e.phase * 0.6) * 0.35; }
        else { if (dd < 9) { vx = dx / dd; vy = dy / dd; } sp = 0.75; }
        var l = Math.hypot(vx, vy) || 1;
        this.moveEntity(e, vx / l * sp, vy / l * sp, dt, false);
        var reach = e.type === 'guardian' ? 1.3 : e.type === 'brute' ? 1.1 : 0.75;
        if (dd < reach && e.cooldown <= 0) {
          e.cooldown = e.type === 'brute' ? 1.3 : e.type === 'guardian' ? 1.1 : 0.85;
          e.atk = 0.25;
          this.hurtPlayer(e.type === 'brute' || e.type === 'guardian' ? 2 : 1, e.x, e.y);
        }
      }
    },

    updateBoss: function (dt) {
      var p = this.player, b = this.boss;
      if (!b || b.dead) return;
      this.applyKnock(b, dt);
      b.phase += dt; b.cooldown -= dt;
      b.hit = Math.max(0, b.hit - dt);
      b.atk = Math.max(0, b.atk - dt);
      b.pulse = Math.max(0, b.pulse - dt);
      var dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
      var a = Math.atan2(dy, dx) + Math.sin(b.phase * 1.4) * 0.35;
      this.moveEntity(b, Math.cos(a) * 1.15, Math.sin(a) * 1.15, dt, false);
      if (b.cooldown <= 0) {
        b.cooldown = 2.0; b.pulse = 0.45; b.atk = 0.4;
        if (kit.juice.enabled) this.fxShard.emitParticleAt(b.x * TILE, b.y * TILE, 12);
        kit.audio.sfx('s_boss', { volume: 0.4 });
        this.impulse(2);
      }
      if (b.pulse > 0 && d < 3.3) this.hurtPlayer(1, b.x, b.y);
      if (d < 1.25 && b.cooldown < 1.1 && b.cooldown > 0.8) this.hurtPlayer(2, b.x, b.y);
    },

    /* ------------------------------------------------------------ endings */
    die: function () {
      if (this.runState !== 'play') return;
      this.runState = 'dead';
      this.player.hp = 0;
      this.impulse(7);
      this.flash(320, 140, 30, 30);
      this.saveNow();
      if (this.hud) {
        this.hud.showPanel('THE DRIFT ENDS', 'The tide carries you back to camp. Your gear holds.',
          'RETURN TO CAMP', this.respawn.bind(this));
      }
    },

    respawn: function () {
      var self = this;
      kit.input.clearAll();
      this.wasAction = false;
      this.transition(function () {
        self.runState = 'play';
        self.mode = 'world';
        self.dungeon = null; self.boss = null;
        self.showDungeon(false);
        self.player.x = W.CAMP[0]; self.player.y = W.CAMP[1];
        self.player.hp = self.player.maxHp;
        self.player.invuln = 2;
        self.hearts = [];
        self.reveal(self.player.x, self.player.y, 13, true);
        kit.audio.music('m_isle', 700);
        self.say('Back at camp. Your gear remains.', 3);
        self.saveNow();
      });
    },

    win: function () {
      this.runState = 'won';
      this.won = true;
      this.score += Math.max(0, 3000 - Math.floor(this.elapsed * 2));
      kit.audio.sfx('s_win');
      this.impulse(6);
      this.saveNow();
      if (this.hud) {
        this.hud.showPanel('RUIN RESTORED', 'The island is quiet again. Sigils ' +
          this.sigils.filter(Boolean).length + ' of 12. Score ' + Math.floor(this.score) + '.',
          'SAIL A NEW ISLAND', this.newIsland.bind(this));
      }
    },

    /* ---------------------------------------------------------- tutorial */
    // Spatially gated: each beat has a place in the cove and a world marker.
    updateTutorial: function () {
      if (this.tut < 0) { this.marker.setVisible(false); return; }
      var p = this.player;
      var cx = W.CAMP[0], cy = W.CAMP[1];
      var steps = [
        { text: 'Drag the stick to walk the shore.', at: [cx, cy + 6], done: function (s) { return s.moved > 4; } },
        { text: 'Tap ACTION to swing your blade.', at: [cx, cy + 2], done: function (s) { return s.swung; } },
        { text: 'Two shore crabs. Cut them down.', at: [cx - 5, cy - 5], done: function (s) { return s.tutKills >= 2; } },
        { text: 'Walk over the heart to heal.', at: [cx + 3, cy - 3], done: function (s) { return s.hearts.length === 0 && s.tutHeart; } },
        { text: 'Leave the cove by the north path.', at: [cx, cy - W.COVE.r - 3], done: function (s) { return dist(p.x, p.y, cx, cy) > 15; } }
      ];
      var st = steps[this.tut];
      if (!st) { this.finishTutorial(); return; }
      if (this.tutShown !== this.tut) {
        this.tutShown = this.tut;
        this.say(st.text, 9);
      }
      if (this.player.attackCd > 0) this.swung = true;
      if (this.tut === 3 && !this.tutHeart) {
        this.hearts.push({ x: cx + 3, y: cy - 3, life: 999, pop: 0 });
        this.tutHeart = true;
      }
      var mx = st.at[0] * TILE, my = st.at[1] * TILE;
      this.marker.setVisible(true);
      this.marker.setPosition(mx, my - px(18) + Math.sin(this.time.now / 240) * px(3));
      if (st.done(this)) {
        this.tut++;
        kit.audio.sfx('s_pickup', { volume: 0.5 });
        if (this.tut >= steps.length) this.finishTutorial();
      }
    },

    finishTutorial: function () {
      this.tut = -1;
      this.taught = true;
      this.marker.setVisible(false);
      this.say('Three gauntlets hide relics. The sealed ruin needs all three.', 4.5);
      this.saveNow();
    },

    say: function (text, secs) {
      this.message = text;
      this.messageTime = secs || 2.5;
      if (this.hud) this.hud.setToast(text);
    },

    /* -------------------------------------------------------------- render */
    drawFrame: function (dt, frozen) {
      var p = this.player, cam = this.cameras.main;
      var t = this.time.now / 1000;
      if (!this.hud) {
        var hs = this.scene.get('hud');
        if (hs && hs.built) this.hud = hs;
      }

      // damped camera impulse: spring back with one overshoot, plus a short
      // dip on contact. Frozen frames hold the view without stopping the sim.
      var k = 1 - Math.pow(0.0009, dt);
      if (!frozen) {
        var tx = p.x * TILE + p.vx * px(3.2);
        var ty = p.y * TILE + p.vy * px(3.2);
        this.camTarget.x += (tx - this.camTarget.x) * k;
        this.camTarget.y += (ty - this.camTarget.y) * k;
      }
      var sh = this.shake;
      sh.vx += -sh.x * 900 * dt; sh.vy += -sh.y * 900 * dt;
      var damp = Math.pow(0.0007, dt);
      sh.vx *= damp; sh.vy *= damp;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      this.dip = Math.max(0, this.dip - dt * 6);
      cam.centerOn(this.camTarget.x + sh.x, this.camTarget.y + sh.y + this.dip * px(1.5));

      var view = cam.worldView;
      if (this.mode === 'world') {
        // water, foam and grass all cycle off one small atlas upload
        this.waterClock += dt;
        if (this.waterClock >= 0.16) {
          this.waterClock = 0;
          var wf = (this.waterFrame + 1) & 3;
          this.waterFrame = wf;
          TIDX.animate(wf);
          var tt = this.textures.get('terrain');
          if (tt && tt.refresh) tt.refresh();
        }
        this.stepFog(dt);
        this.campFire.setFrame('p_fire' + (((t * 9) | 0) % 3));
      } else {
        // dungeon light rides the player, tinted by the gauntlet
        this.torch.setPosition(p.x * TILE, p.y * TILE - px(4));
        this.torch.setDisplaySize(view.width * 2.1, view.height * 2.1);
        this.torch.setAlpha(0.94);
      }

      this.revealClock += dt;
      if (this.revealClock > 0.2 && this.mmQueue.length) { this.revealClock = 0; this.paintMinimap(false); }

      if (!frozen) this.drawPlayer(p, t);
      this.drawEntities(p, t, view, frozen);
      this.syncPickups(t);

      if (this.mode === 'world') {
      var vx0 = view.x - px(40), vx1 = view.right + px(40), vy0 = view.y - px(40), vy1 = view.bottom + px(40);
        for (var q = 0; q < this.palms.length; q++) {
          var pl = this.palms[q];
          var on = pl.x > vx0 && pl.x < vx1 && pl.y > vy0 && pl.y < vy1;
          if (pl.visible !== on) pl.setVisible(on);
          if (on) pl.setRotation(Math.sin(t * 1.1 + pl.phase) * 0.05);
        }
        for (var gi = 0; gi < this.gateSprites.length; gi++) {
          this.gateSprites[gi].arch.setTint(this.relics[gi] ? 0x9ede7a : (gi === 0 || this.relics[gi - 1]) ? 0xffffff : 0x6b6478);
        }
        this.ruinDoor.setTint(this.relics.every(Boolean) ? 0xffd9a0 : 0x9a8fa8);
      }

      if (this.hud) this.hud.sync(this);
    },

    drawPlayer: function (p, t) {
      var ps = this.pSprite;
      ps.setPosition(Math.round(p.x * TILE), Math.round(p.y * TILE));
      ps.setDepth(12 + p.y * 0.001);
      var dirKey = p.dir === 'up' ? 'up' : (p.dir === 'left' || p.dir === 'right') ? 'side' : 'down';
      var want = (p.windup > 0 ? P_ANIM.wind
        : p.attackTime > 0 ? P_ANIM.atk
        : (p.vx || p.vy) ? P_ANIM.walk : P_ANIM.idle)[dirKey];
      if (!ps.anims.currentAnim || ps.anims.currentAnim.key !== want) ps.play(want, true);
      ps.setFlipX(p.dir === 'left');
      var wantTint = p.hurt > 0 ? 1 : (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ? 2 : 0;
      if (this.pTintState !== wantTint) {
        this.pTintState = wantTint;
        if (wantTint === 1) { ps.setTintFill(0xffd0d0); ps.setAlpha(1); }
        else if (wantTint === 2) { ps.clearTint(); ps.setAlpha(0.45); }
        else { ps.clearTint(); ps.setAlpha(1); }
      }
      this.shadow.setPosition(ps.x, ps.y + px(3)).setVisible(true);

      if (p.attackTime > 0) {
        var prog = 1 - p.attackTime / 0.22;
        this.slash.setVisible(true);
        this.slash.setPosition(ps.x + Math.cos(p.facing) * px(8), ps.y + Math.sin(p.facing) * px(8) - px(3));
        this.slash.setRotation(p.facing);
        this.slash.setAlpha(1 - prog * prog);
        this.slash.setScale(0.6 + prog * 0.5);
      } else if (this.slash.visible) this.slash.setVisible(false);
    },

    drawEntities: function (p, t, view, frozen) {
      var list;
      if (this.mode === 'world') list = this.enemies;
      else if (this.mode === 'dungeon') list = this.dungeon.enemies;
      else { list = this.bossList || (this.bossList = [null]); list[0] = this.boss; }
      var pi = 0, pipI = 0;
      var vx0 = view.x - px(32), vx1 = view.right + px(32), vy0 = view.y - px(32), vy1 = view.bottom + px(32);
      for (var i = 0; i < list.length && pi < this.pool.length; i++) {
        var e = list[i];
        if (!e) continue;
        if (e.dead && e.dying <= 0) continue;
        if (!e.dead && e.hp <= 0) continue;
        var ex = e.x * TILE, ey = e.y * TILE;
        if (ex < vx0 || ex > vx1 || ey < vy0 || ey > vy1) continue;
        if (this.mode === 'world' && !this.chunks[(e.y >> 1) * 64 + (e.x >> 1)]) continue;
        var s = this.pool[pi++];
        var names = E_FRAME[e.type] || E_FRAME.mossling;
        var state;
        if (e.dead) state = 'die';
        else if (e.hit > 0) state = 'hurt';
        else if (e.atk > 0) state = 'atk';
        else if (e.dormant) state = ((t * 1.6) | 0) % 2 ? 'idle1' : 'idle0';
        else state = ((t * 7 + e.phase) | 0) % 2 ? 'walk0' : 'walk1';
        var frame = names[state];
        if (s.frameName !== frame) { s.setFrame(frame); s.frameName = frame; }
        if (!s.visible) s.setVisible(true);
        var bob = e.dead ? 0 : Math.sin(t * 3 + e.phase) * px(1.2);
        if (!frozen) s.setPosition(Math.round(ex), Math.round(ey + bob));
        s.setDepth(11 + e.y * 0.001);
        var big = e.type === 'tide' ? 3 : e.boss ? 1.7 : 1;
        s.setScale(big, big);
        s.setAlpha(e.dead ? Math.max(0, e.dying / 0.42) : 1);
        s.setAngle(e.type === 'wisp' ? Math.sin(t * 2 + e.phase) * 12 : 0);

        // short HP pips, only while a foe is hurt or freshly targeted
        if (!e.dead && e.maxHp > 1 && (e.show > 0 || e.hit > 0) && pipI + e.maxHp <= this.hpPips.length) {
          for (var k = 0; k < e.maxHp; k++) {
            var pip = this.hpPips[pipI++];
            pip.setVisible(true);
            pip.setPosition(Math.round(ex - px((e.maxHp - 1) * 2 - k * 4)), Math.round(ey - px(14 * big)));
            pip.setTint(k < e.hp ? 0xffe08a : 0x4a3b3b);
            pip.setDepth(13);
          }
        }
      }
      for (; pi < this.pool.length; pi++) if (this.pool[pi].visible) this.pool[pi].setVisible(false);
      for (; pipI < this.hpPips.length; pipI++) if (this.hpPips[pipI].visible) this.hpPips[pipI].setVisible(false);
    },

    syncPickups: function (t) {
      var need = this.hearts.length;
      while (this.heartSprites.length < need) {
        this.heartSprites.push(this.add.image(0, 0, 'dl', 'ui_heart_full').setDepth(11).setScale(1));
      }
      for (var i = 0; i < this.heartSprites.length; i++) {
        var sp = this.heartSprites[i];
        if (i < need && this.mode === 'world') {
          var h = this.hearts[i];
          sp.setVisible(true);
          sp.setPosition(h.x * TILE, h.y * TILE + Math.sin(t * 3 + i) * px(2));
          // ease out back pop on spawn
          var q = h.pop || 0;
          var e2 = q >= 1 ? 1 : 1 + 2.2 * Math.pow(q - 1, 3) + 1.2 * Math.pow(q - 1, 2);
          sp.setScale(0.3 + e2 * 0.9);
          sp.setAlpha(h.life < 3 ? (Math.floor(h.life * 6) % 2 ? 0.3 : 1) : 1);
        } else if (sp.visible) sp.setVisible(false);
      }
      for (var s2 = 0; s2 < this.sigilNodes.length; s2++) {
        var n = this.sigilNodes[s2];
        var vis = this.mode === 'world' && !this.sigils[n.id] && this.chunks[(n.y >> 1) * 64 + (n.x >> 1)];
        if (!this.sigilSprites[s2] && vis) {
          this.sigilSprites[s2] = this.add.image(n.x * TILE, n.y * TILE, 'dl', 'ui_sigil').setDepth(11);
          this.sigilSprites[s2].glow = this.add.image(n.x * TILE, n.y * TILE, 'glow').setDepth(9.6)
            .setScale(0.7).setTint(0x8ee6d8).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
        }
        var ss = this.sigilSprites[s2];
        if (ss) {
          if (ss.visible !== !!vis) { ss.setVisible(!!vis); ss.glow.setVisible(!!vis); }
          if (vis) {
            ss.y = n.y * TILE + Math.sin(t * 2.2 + s2) * px(2.2);
            ss.setRotation(Math.sin(t * 1.4 + s2) * 0.18);
            ss.glow.setAlpha(0.4 + Math.sin(t * 2.6 + s2) * 0.16);
          }
        }
      }
    }
  };

  /* ===================================================================== HUD */
  var HudScene = {
    key: 'hud',

    create: function () {
      var self = this;
      this.U = DPR;
      this.play = this.scene.get('play');
      this.play.hud = this;
      this.panel = null;
      this.reward = null;
      this.built = false;
      this.make2();
      this.layout();
      this.built = true;
      this.scale.on('resize', this.layout, this);
      this.events.on('shutdown', function () {
        self.scale.off('resize', self.layout, self);
        if (self.play) self.play.hud = null;
      });
    },

    // Objects are created once; layout() places them, so an orientation change
    // or a window resize moves both the visuals AND the input rectangles.
    make2: function () {
      var U = this.U, self = this;
      var TXT = 0xdff2ea;

      this.barBg = this.add.nineslice(0, 0, 'dl', 'ui_bar', 10, 10, 6 * U, 6 * U, 6 * U, 6 * U).setOrigin(0.5);
      this.hearts = [];
      for (var i = 0; i < 12; i++) this.hearts.push(this.add.image(0, 0, 'dl', 'ui_heart_full').setVisible(false));
      this.relicIcons = [];
      for (var r = 0; r < 3; r++) this.relicIcons.push(this.add.image(0, 0, 'dl', 'ui_relic_off'));
      this.sigilIcon = this.add.image(0, 0, 'dl', 'ui_sigil');
      this.sigilText = this.add.bitmapText(0, 0, 'pix', '0/12', FS * 1.3 * U).setOrigin(0, 0.5).setTint(0xd9ece2);
      this.timeText = this.add.bitmapText(0, 0, 'pix', '0:00', FS * 1.3 * U).setOrigin(1, 0.5).setTint(0x9fc4b8);

      // gear chips: icon plus value, not a compressed SWD/ARM/SPD string
      this.gearChips = [];
      ['ui_sword', 'ui_shield', 'ui_boot'].forEach(function (f) {
        var ic = self.add.image(0, 0, 'dl', f);
        var tx = self.add.bitmapText(0, 0, 'pix', '1', FS * 1.4 * U).setOrigin(0, 0.5).setTint(0xe9d9a8);
        self.gearChips.push({ icon: ic, text: tx });
      });

      this.mmFrame = this.add.nineslice(0, 0, 'dl', 'ui_bar', 10, 10, 6 * U, 6 * U, 6 * U, 6 * U).setOrigin(0.5);
      this.mm = this.add.image(0, 0, 'minimap');
      this.mmMarks = [];
      for (var m = 0; m < 17; m++) this.mmMarks.push(this.add.image(0, 0, 'dl', 'mm_sigil').setVisible(false));
      this.mmDot = this.add.image(0, 0, 'dl', 'mm_player');
      this.mmLegend = this.add.bitmapText(0, 0, 'pix', 'CAMP GATE RUIN', FS * 0.75 * U).setOrigin(0.5, 0).setTint(0x8fb8ab);

      // message rail sits below the play area, clear of the minimap lane
      this.toastBg = this.add.nineslice(0, 0, 'dl', 'ui_bar', 10, 10, 6 * U, 6 * U, 6 * U, 6 * U).setOrigin(0.5).setVisible(false);
      this.toast = this.add.bitmapText(0, 0, 'pix', '', FS * 1.35 * U).setOrigin(0.5).setTint(0xf2fbe9).setVisible(false);

      this.bossBar = this.add.rectangle(0, 0, 10, 10, 0x25151f).setVisible(false);
      this.bossFill = this.add.rectangle(0, 0, 10, 10, 0xdd6e6e).setOrigin(0, 0.5).setVisible(false);

      this.stickBase = this.add.image(0, 0, 'dl', 'ui_stick_base').setAlpha(0.85);
      this.knob = this.add.image(0, 0, 'dl', 'ui_stick_knob');
      this.actionBtn = this.add.image(0, 0, 'dl', 'ui_action').setAlpha(0.95);
      this.actionLabel = this.add.bitmapText(0, 0, 'pix', 'SWORD', FS * 1.3 * U).setOrigin(0.5).setTint(0xfff4db);
      this.pauseBtn = this.add.image(0, 0, 'dl', 'ui_small').setInteractive({ useHandCursor: true });
      this.pauseIcon = this.add.image(0, 0, 'dl', 'ui_pause');
      this.pauseBtn.on('pointerdown', function () { kit.audio.sfx('s_ui'); self.openPause(); });
      this.input.keyboard.on('keydown-ESC', function () { self.openPause(); });
      this.input.keyboard.on('keydown-P', function () { self.openPause(); });
    },

    layout: function () {
      var U = this.U;
      var w = this.scale.width, h = this.scale.height;
      readInsets();
      var top = (10 + INSET.top) * U, left = (10 + INSET.left) * U;
      var right = w - (10 + INSET.right) * U;

      var barH = 44 * U;
      ns(this.barBg, w - 20 * U - (INSET.left + INSET.right) * U, barH).setPosition(w / 2, top + barH / 2);
      for (var i = 0; i < this.hearts.length; i++) {
        this.hearts[i].setScale(1).setPosition(left + 8 * U + i * 12 * U, top + 12 * U);
      }
      for (var r = 0; r < 3; r++) this.relicIcons[r].setScale(0.9).setPosition(left + 10 * U + r * 14 * U, top + 31 * U);
      this.sigilIcon.setScale(0.8).setPosition(left + 58 * U, top + 31 * U);
      this.sigilText.setPosition(left + 66 * U, top + 31 * U).setFontSize(FS * 1.3 * U);
      this.timeText.setPosition(right - 6 * U, top + 31 * U).setFontSize(FS * 1.3 * U);
      for (var g = 0; g < 3; g++) {
        var cx = right - (76 - g * 26) * U;
        this.gearChips[g].icon.setScale(1).setPosition(cx, top + 12 * U);
        this.gearChips[g].text.setPosition(cx + 7 * U, top + 12 * U).setFontSize(FS * 1.4 * U);
      }

      var mmSize = Math.min(104, Math.round(w / U * 0.28)) * U;
      this.mmSize = mmSize;
      var mmx = right - mmSize / 2, mmy = top + barH + 8 * U + mmSize / 2;
      ns(this.mmFrame, mmSize + 8 * U, mmSize + 20 * U).setPosition(mmx, mmy);
      this.mm.setPosition(mmx, mmy - 5 * U).setDisplaySize(mmSize, mmSize);
      this.mmLegend.setPosition(mmx, mmy + mmSize / 2 - 2 * U).setFontSize(FS * 0.75 * U);
      for (var m = 0; m < this.mmMarks.length; m++) this.mmMarks[m].setScale(0.8);
      this.mmDot.setScale(0.85);

      var stickR = 52, actR = 44;
      var stickCX = (24 + stickR + INSET.left), stickCY = (h / U) - (26 + stickR + INSET.bottom);
      var actCX = (w / U) - (24 + actR + INSET.right), actCY = (h / U) - (30 + actR + INSET.bottom);
      this.stickBase.setScale(stickR * 2 / 56).setPosition(stickCX * U, stickCY * U);
      this.knob.setScale(1).setPosition(stickCX * U, stickCY * U);
      this.stickCX = stickCX * U; this.stickCY = stickCY * U;
      this.actionBtn.setScale(actR * 2 / 66).setPosition(actCX * U, actCY * U);
      this.actionLabel.setPosition(actCX * U, actCY * U).setFontSize(FS * 1.3 * U);
      var pbx = (w / U) - (24 + INSET.right), pby = (h / U) - (30 + actR * 2 + 16 + INSET.bottom);
      this.pauseBtn.setScale(0.8).setPosition(pbx * U, pby * U);
      this.pauseIcon.setScale(0.9).setPosition(pbx * U, pby * U);

      // the message rail clears both the control row and the pause button,
      // so a two line prompt never sits under a tappable control
      var railY = (actCY - actR - 60) * U;
      this.railY = railY;
      this.toastBg.setPosition(w / 2, railY);
      this.toast.setPosition(w / 2, railY).setFontSize(FS * 1.35 * U).setMaxWidth(w - 60 * U);

      this.bossBar.setPosition(w / 2, top + barH + 10 * U).setSize(w * 0.62, 9 * U);
      this.bossFill.setPosition(w / 2 - w * 0.31, top + barH + 10 * U).setSize(w * 0.62, 9 * U);

      // input rectangles in CSS pixels, recomputed with the visuals
      this.play.hudRects = {
        stick: { x: stickCX - stickR, y: stickCY - stickR, w: stickR * 2, h: stickR * 2 },
        action: { x: actCX - actR - 6, y: actCY - actR - 6, w: (actR + 6) * 2, h: (actR + 6) * 2 }
      };
      if (this.panel) { this.closePanel(); this.openPause(); }
    },

    setToast: function (text) {
      if (!text) { this.toast.setVisible(false); this.toastBg.setVisible(false); return; }
      this.toast.setText(text.toUpperCase());
      this.toast.setVisible(true);
      this.toastBg.setVisible(true);
      var bw = Math.min(this.scale.width - 30 * this.U, this.toast.width + 22 * this.U);
      ns(this.toastBg, bw, this.toast.height + 14 * this.U);
      this.toast.setAlpha(0); this.toastBg.setAlpha(0);
      this.toast.y = this.railY + 6 * this.U;
      this.toastBg.y = this.railY + 6 * this.U;
      this.tweens.add({ targets: [this.toast, this.toastBg], alpha: 1, y: this.railY, duration: 200, ease: 'Cubic.easeOut' });
    },

    pulseHearts: function () {
      var live = this.hearts.filter(function (h) { return h.visible; });
      this.tweens.add({ targets: live, scaleX: this.U * 1.3, scaleY: this.U * 1.3, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    },

    tickSigil: function (target) {
      // counter ticks up instead of snapping
      var self = this;
      var from = this.shownSigil || 0;
      if (target <= from) { this.shownSigil = target; return; }
      var step = function () {
        from++;
        self.shownSigil = from;
        self.sigilText.setText(from + '/12');
        if (from < target) self.time.delayedCall(90, step);
      };
      step();
    },

    mmMark: function (wx, wy, frame, tint, on) {
      var mk = this.mmMarks[this.mmI++];
      if (!mk) return;
      if (mk.visible !== !!on) mk.setVisible(!!on);
      if (on) {
        mk.setPosition(this.mmOx + wx * this.mmSc, this.mmOy + wy * this.mmSc);
        if (mk.frameKey !== frame) { mk.setFrame(frame); mk.frameKey = frame; }
        mk.setTint(tint);
      }
    },

    sync: function (p) {
      var U = this.U;
      for (var i = 0; i < this.hearts.length; i++) {
        var on = i < p.player.maxHp;
        if (this.hearts[i].visible !== on) this.hearts[i].setVisible(on);
        if (on) this.hearts[i].setFrame(i < p.player.hp ? 'ui_heart_full' : 'ui_heart_empty');
      }
      for (var r = 0; r < 3; r++) this.relicIcons[r].setFrame(p.relics[r] ? 'ui_relic_on' : 'ui_relic_off');
      var sc = 0;
      for (var sq = 0; sq < p.sigils.length; sq++) if (p.sigils[sq]) sc++;
      if (this.shownSigil === undefined) { this.shownSigil = sc; this.sigilText.setText(sc + '/12'); }
      else if (this.shownSigil !== sc && sc < this.shownSigil) { this.shownSigil = sc; this.sigilText.setText(sc + '/12'); }
      // only build the clock string when the whole second actually changes
      var whole = p.elapsed | 0;
      if (this.lastSec !== whole) {
        this.lastSec = whole;
        var secs = whole % 60;
        this.timeText.setText(((whole / 60) | 0) + ':' + (secs < 10 ? '0' : '') + secs);
      }
      var gear = p.gear;
      for (var g = 0; g < 3; g++) {
        var gvv = (g === 0 ? gear.sword : g === 1 ? gear.armor : gear.speed) + 1;
        if (this.gearChips[g].shown !== gvv) { this.gearChips[g].shown = gvv; this.gearChips[g].text.setText(String(gvv)); }
      }

      var ko = p.knobOffset;
      if (ko) this.knob.setPosition(this.stickCX + ko.x * U, this.stickCY + ko.y * U);
      var label = p.actionLabel ? p.actionLabel() : 'SWORD';
      if (this.lastLabel !== label) { this.lastLabel = label; this.actionLabel.setText(label); }
      var locked = label === 'LOCKED' || label === 'SEALED';
      var pressed = p.player.attackCd > 0.22 || p.player.windup > 0;
      var wantFrame = locked ? 'ui_action_off' : pressed ? 'ui_action_press' : 'ui_action';
      if (this.lastActFrame !== wantFrame) { this.lastActFrame = wantFrame; this.actionBtn.setFrame(wantFrame); }

      var world = p.mode === 'world';
      this.mm.setVisible(world); this.mmFrame.setVisible(world); this.mmDot.setVisible(world);
      this.mmLegend.setVisible(world);
      if (world) {
        var ox = this.mm.x - this.mmSize / 2, oy = this.mm.y - this.mmSize / 2, sc2 = this.mmSize / MAP;
        this.mmDot.setPosition(ox + p.player.x * sc2, oy + p.player.y * sc2);
        // marks are placed through a method, not a closure rebuilt every frame
        this.mmI = 0; this.mmOx = ox; this.mmOy = oy; this.mmSc = sc2;
        var allRelics = p.relics[0] && p.relics[1] && p.relics[2];
        this.mmMark(W.CAMP[0], W.CAMP[1], 'mm_camp', 0xffffff, true);
        for (var gi2 = 0; gi2 < 3; gi2++) {
          this.mmMark(W.GATES[gi2][0], W.GATES[gi2][1], 'mm_gate', p.relics[gi2] ? 0xa4cf91 : 0xffffff,
            p.chunks[(W.GATES[gi2][1] >> 1) * 64 + (W.GATES[gi2][0] >> 1)]);
        }
        this.mmMark(W.RUIN_GATE[0], W.RUIN_GATE[1], 'mm_ruin', allRelics ? 0xef9a6d : 0xffffff,
          p.chunks[(W.RUIN_GATE[1] >> 1) * 64 + (W.RUIN_GATE[0] >> 1)]);
        for (var sg = 0; sg < 12; sg++) {
          var nd = p.sigilNodes[sg];
          this.mmMark(nd.x, nd.y, 'mm_sigil', 0xffffff, !p.sigils[sg] && p.chunks[(nd.y >> 1) * 64 + (nd.x >> 1)]);
        }
      } else {
        for (var mz = 0; mz < this.mmMarks.length; mz++) if (this.mmMarks[mz].visible) this.mmMarks[mz].setVisible(false);
      }

      var boss = p.mode === 'boss' && p.boss && !p.boss.dead;
      this.bossBar.setVisible(!!boss);
      this.bossFill.setVisible(!!boss);
      if (boss) this.bossFill.width = this.scale.width * 0.62 * Math.max(0, p.boss.hp / p.boss.maxHp);
    },

    /* ------------------------------------------------------------ panels */
    openPause: function () {
      if (this.panel || kit.paused) return;
      var self = this;
      kit.pause('menu');
      this.panel = this.makePanel('PAUSED', 'DRIFTLANDS AUTOSAVES AS YOU ROAM.', [
        { label: 'RESUME', primary: true, fn: function () { self.closePanel(); kit.resume('menu'); } },
        { label: 'GEAR AND RELICS', fn: function () { self.closePanel(); self.openGear(); } },
        { label: 'SETTINGS', fn: openSettings },
        { label: 'ABANDON ISLAND', fn: function () { self.closePanel(); kit.resume('menu'); self.play.newIsland(); } }
      ]);
    },

    openGear: function () {
      var self = this, p = this.play;
      var U = this.U, w = this.scale.width, h = this.scale.height;
      var rows = [
        ['ui_sword', 'EMBEREDGE', p.gear.sword + 1, p.gear.sword < 1 ? 'RELIC 1' : 'MAX'],
        ['ui_shield', 'SHELLMAIL', p.gear.armor + 1, p.gear.armor < 1 ? 'RELIC 2' : 'MAX'],
        ['ui_boot', 'SWIFTSEED', p.gear.speed + 1, p.gear.speed < 1 ? 'RELIC 3' : 'MAX']
      ];
      var group = this.add.container(0, 0).setDepth(100);
      group.add(this.add.rectangle(w / 2, h / 2, w, h, 0x06141b, 0.88));
      var pw = Math.min(w - 40 * U, 320 * U), ph = 300 * U;
      group.add(this.add.nineslice(w / 2, h / 2, 'dl', 'ui_panel', pw, ph, 8 * U, 8 * U, 8 * U, 8 * U));
      group.add(this.add.bitmapText(w / 2, h / 2 - ph / 2 + 22 * U, 'pix', 'GEAR AND RELICS', FS * 1.9 * U).setOrigin(0.5, 0).setTint(0xefffe2));
      for (var i = 0; i < rows.length; i++) {
        var yy = h / 2 - ph / 2 + (62 + i * 40) * U;
        group.add(this.add.image(w / 2 - pw / 2 + 26 * U, yy, 'dl', rows[i][0]).setScale(1.4).setTint(p.relics[i] ? 0xffffff : 0x6d7a72));
        group.add(this.add.bitmapText(w / 2 - pw / 2 + 44 * U, yy, 'pix', rows[i][1], FS * 1.3 * U).setOrigin(0, 0.5).setTint(0xd9ece2));
        group.add(this.add.bitmapText(w / 2 + pw / 2 - 26 * U, yy, 'pix', 'LV ' + rows[i][2] + '  ' + rows[i][3], FS * 1.2 * U).setOrigin(1, 0.5).setTint(p.relics[i] ? 0x9ede7a : 0xe9c88a));
      }
      var sig = p.sigils.filter(Boolean).length;
      group.add(this.add.bitmapText(w / 2, h / 2 + 20 * U, 'pix', 'SIGILS ' + sig + ' OF 12', FS * 1.4 * U).setOrigin(0.5).setTint(0x8ee6d8));
      group.add(this.add.bitmapText(w / 2, h / 2 + 40 * U, 'pix', 'ATTUNEMENT TIER ' + p.bonus, FS * 1.1 * U).setOrigin(0.5).setTint(0x9fc4b8));
      var by = h / 2 + ph / 2 - 34 * U;
      var box = this.add.nineslice(w / 2, by, 'dl', 'ui_btn_hi', pw - 44 * U, 42 * U, 8 * U, 8 * U, 8 * U, 8 * U).setInteractive({ useHandCursor: true });
      var tx = this.add.bitmapText(w / 2, by - 2 * U, 'pix', 'BACK', FS * 1.5 * U).setOrigin(0.5).setTint(0x102029);
      box.on('pointerdown', function () {
        kit.audio.sfx('s_ui');
        group.destroy(true);
        self.panel = null;
        self.openPause();
      });
      group.add(box); group.add(tx);
      group.setScale(0.94).setAlpha(0);
      this.tweens.add({ targets: group, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
      this.panel = group;
    },

    showReward: function (title, body) {
      var U = this.U, w = this.scale.width, h = this.scale.height;
      if (this.reward) this.hideReward();
      var g = this.add.container(0, 0).setDepth(96);
      g.add(this.add.nineslice(w / 2, h * 0.42, 'dl', 'ui_panel', Math.min(w - 60 * U, 280 * U), 96 * U, 8 * U, 8 * U, 8 * U, 8 * U));
      g.add(this.add.image(w / 2, h * 0.42 - 22 * U, 'dl', 'ui_relic_on').setScale(2.2));
      g.add(this.add.bitmapText(w / 2, h * 0.42 + 6 * U, 'pix', title, FS * 1.7 * U).setOrigin(0.5).setTint(0xffe28b));
      g.add(this.add.bitmapText(w / 2, h * 0.42 + 26 * U, 'pix', body, FS * 1.1 * U).setOrigin(0.5).setTint(0xd9ece2).setMaxWidth(240 * U));
      g.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
      this.reward = g;
    },

    hideReward: function () {
      if (!this.reward) return;
      this.reward.destroy(true);
      this.reward = null;
    },

    showPanel: function (title, body, button, fn) {
      var self = this;
      if (this.panel) this.closePanel();
      this.panelAction = fn;
      this.panel = this.makePanel(title, body, [
        { label: button, primary: true, fn: function () { self.closePanel(); fn(); } }
      ]);
    },

    confirmPanel: function () {
      if (this.panel && this.panelAction) {
        var fn = this.panelAction;
        this.panelAction = null;
        this.closePanel();
        fn();
      }
    },

    makePanel: function (title, body, buttons) {
      var U = this.U, w = this.scale.width, h = this.scale.height, self = this;
      var group = this.add.container(0, 0).setDepth(100);
      group.add(this.add.rectangle(w / 2, h / 2, w, h, 0x06141b, 0.88));
      var pw = Math.min(w - 40 * U, 320 * U);
      var ph = (130 + buttons.length * 54) * U;
      group.add(this.add.nineslice(w / 2, h / 2, 'dl', 'ui_panel', pw, ph, 8 * U, 8 * U, 8 * U, 8 * U));
      group.add(this.add.bitmapText(w / 2, h / 2 - ph / 2 + 24 * U, 'pix', title, FS * 2.2 * U).setOrigin(0.5, 0).setTint(0xefffe2));
      group.add(this.add.bitmapText(w / 2, h / 2 - ph / 2 + 62 * U, 'pix', body.toUpperCase(), FS * 1.15 * U)
        .setOrigin(0.5, 0).setTint(0xc3d9d2).setMaxWidth(pw - 40 * U).setCenterAlign());
      buttons.forEach(function (b, i) {
        var yy = h / 2 - ph / 2 + (118 + i * 54) * U;
        var box = self.add.nineslice(w / 2, yy, 'dl', b.primary ? 'ui_btn_hi' : 'ui_btn', pw - 44 * U, 44 * U, 8 * U, 8 * U, 8 * U, 8 * U)
          .setInteractive({ useHandCursor: true });
        var tx = self.add.bitmapText(w / 2, yy - 2 * U, 'pix', b.label, FS * 1.4 * U).setOrigin(0.5)
          .setTint(b.primary ? 0x102029 : 0xdff2ea);
        box.on('pointerdown', function () { kit.audio.sfx('s_ui'); b.fn(); });
        group.add(box); group.add(tx);
      });
      group.setScale(0.94);
      group.setAlpha(0);
      this.tweens.add({ targets: group, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
      return group;
    },

    closePanel: function () {
      if (!this.panel) return;
      this.panel.destroy(true);
      this.panel = null;
    }
  };

  /* ==================================================================== BOOT */
  function makeScene(def) {
    var S = function () { Phaser.Scene.call(this, def.key); };
    S.prototype = Object.create(Phaser.Scene.prototype);
    S.prototype.constructor = S;
    // Every method is copied onto the prototype. A plain config object handed
    // to Phaser would drop custom methods; this is the extend path.
    Object.keys(def).forEach(function (k) { if (k !== 'key') S.prototype[k] = def[k]; });
    return S;
  }

  readInsets();
  var config = {
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#06202c',
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.floor(window.innerWidth),
      height: Math.floor(window.innerHeight)
    },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [makeScene(LoadScene), makeScene(TitleScene), makeScene(PlayScene), makeScene(HudScene)]
  };
  var cfg = GGKit.hiDpi.phaser(config);
  DPR = cfg.ggDpr;
  TILE = 16 * DPR;
  DL.dpr = DPR;
  game = new Phaser.Game(cfg);

  // the minimap canvas is created once, on the game texture manager
  game.events.once('ready', function () {
    if (!game.textures.exists('minimap')) {
      var minimapBaked = GGKit.hiDpi.canvas(MAP, MAP);
      minimapBaked.ctx.imageSmoothingEnabled = false;
      game.textures.addCanvas('minimap', minimapBaked.canvas);
    }
  });

  function applySize() {
    if (!game.canvas || !game.scale) return;
    var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    readInsets();
    DPR = GGKit.hiDpi.factor(w, h);
    TILE = 16 * DPR;
    DL.dpr = DPR;
    GGKit.hiDpi.resize(game, w, h);
  }
  game.events.once('ready', applySize);
  window.addEventListener('resize', function () { applySize(); });
  window.addEventListener('orientationchange', function () { setTimeout(applySize, 120); });
})();
