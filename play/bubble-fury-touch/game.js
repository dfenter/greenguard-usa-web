/* Bubble Fury Touch - AAA rebuild.
 *
 * Twin-stick top-down survival shooter. Phaser 3 (vendored, /play/_shared/)
 * for rendering only; GGKit is the sole lifecycle, input, save and audio
 * implementation. Authored content lives in bf_data.js.
 *
 * ARCHITECTURE
 *   Boot   -> loads the atlas, floors, particles and every audio cue.
 *   Menu   -> mode chain, medals, unlock ladder, arena picker, settings.
 *   Game   -> the whole simulation. Fixed 60 Hz step, pooled everything.
 *   Hud    -> screen space only. Reads Game, never writes it.
 *
 * DEFECT CLASSES DELIBERATELY CLOSED (all shipped broken once somewhere in
 * the fleet, see the brief):
 *   1. The debug view draws from the SAME preallocated pools as the game
 *      (drawDebug walks this.pool.* and nothing else).
 *   2. No per-entity render state rides on the sim entity. Sim state lives
 *      in sprite.d, is reset in full by resetEntity() on every spawn, and
 *      the renderer only ever writes x/y/rotation/alpha/tint back.
 *   3. There are no DOM control handlers; the sticks are claimed out of
 *      kit.input.pointers at claim time inside ctl.sample(), which
 *      stamps p.zone on the pointer the frame it appears.
 *   4. No camera split exists, so there is no second camera to forget. HUD
 *      notices and meters are drawn in the Hud scene in screen space.
 *   5. Every scene is a real class extending Phaser.Scene, so no plain
 *      config object needs an `extend:` block for its custom methods.
 *   6. Test switches are readable BOTH from the boot fallback (query string
 *      parsed before Phaser exists, parked on __bf.pending) and from the
 *      live scene (forceWave/forceArena reach into the running Game).
 *   7. No clock outruns the stepped sim: delta is clamped, at most three
 *      fixed steps run per frame, and the leftover accumulator is capped -
 *      a degraded device gets slow motion and never a time skip.
 *   8. Every keyed lookup against variant content goes through look(),
 *      which returns a guaranteed fallback instead of undefined.
 *   9. Active-play notices share one queued, thin edge surface; it never
 *      covers the play area centre or the bottom half.
 *  10. sw.js precaches only files that exist (see sw.js, kept in step with
 *      the asset list below).
 */
(function () {
  'use strict';

  var D = window.BF_DATA || {};
  var VW = (D.VIEW_W || 960), VH = (D.VIEW_H || 540);
  var RETINA_FACTOR = window.GGKit.hiDpi.factor(VW, VH);
  var STEP = 1 / 60;
  var MAX_STEPS = 3;
  var VERSION = '2026-08-10-declutter1';

  // ------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    t = clamp(t, 0, 1);
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /* Guarded table lookup. A miss returns the declared fallback, never
   * undefined: a FAMILY[variant] miss hard-froze a shipped title. */
  function look(table, key, fallbackKey) {
    if (table && key != null && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    if (table && fallbackKey != null && Object.prototype.hasOwnProperty.call(table, fallbackKey)) {
      return table[fallbackKey];
    }
    var k;
    for (k in table) { if (Object.prototype.hasOwnProperty.call(table, k)) return table[k]; }
    return null;
  }

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* setTextIfChanged: Phaser text updates retessellate the glyph run, so a
   * per-frame identical assignment is pure waste on a phone. */
  function setTextIf(obj, str) {
    if (obj && obj.text !== str) obj.setText(str);
  }
  function setVisIf(obj, vis) {
    if (obj && obj.visible !== vis) obj.setVisible(vis);
  }

  function fmt(n) {
    n = Math.floor(n);
    var s = String(n), out = '', c = 0, i;
    for (i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      if (++c % 3 === 0 && i > 0) out = ',' + out;
    }
    return out;
  }

  var FONT = '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  function tstyle(size, color, weight) {
    return { fontFamily: FONT, fontSize: size + 'px', color: color || '#eaf7ff',
             fontStyle: (weight || '800') === '800' ? 'bold' : weight };
  }

  // ------------------------------------------------------------ progress
  var SAVE_V = 3;
  var MEDAL_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };

  function blankSave() {
    return { v: SAVE_V, tut: 0, modes: {}, pockets: {}, hints: {} };
  }
  function isRecord(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function validCount(n) { return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n; }
  function validScore(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }
  function validateSave(o) {
    var i, k, p, modeKeys, pocketKeys, hintKeys, mode;
    if (!isRecord(o) || o.v !== SAVE_V || !validCount(o.tut) || o.tut > 1
        || !isRecord(o.modes) || !isRecord(o.pockets) || !isRecord(o.hints)) return false;
    modeKeys = Object.keys(o.modes);
    for (i = 0; i < modeKeys.length; i++) {
      k = modeKeys[i];
      if (!D.MODES || !Object.prototype.hasOwnProperty.call(D.MODES, k)) return false;
      p = o.modes[k];
      if (!isRecord(p) || !validScore(p.best) || !validCount(p.wave)
          || !validCount(p.cleared) || p.cleared > 1 || !validCount(p.runs)
          || typeof p.medal !== 'string' || !Object.prototype.hasOwnProperty.call(MEDAL_RANK, p.medal)) {
        return false;
      }
    }
    pocketKeys = Object.keys(o.pockets);
    for (i = 0; i < pocketKeys.length; i++) {
      k = pocketKeys[i];
      if (!D.ARENAS || !Object.prototype.hasOwnProperty.call(D.ARENAS, k)
          || !validCount(o.pockets[k]) || o.pockets[k] > 1) return false;
    }
    hintKeys = Object.keys(o.hints);
    for (i = 0; i < hintKeys.length; i++) {
      k = hintKeys[i];
      mode = k.indexOf('unlock_') === 0 ? k.slice(7) : '';
      if (!mode || !D.MODES || !Object.prototype.hasOwnProperty.call(D.MODES, mode)
          || !validCount(o.hints[k]) || o.hints[k] > 1) return false;
    }
    return true;
  }

  var reduceMotion = false;
  try {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduceMotion = false; }

  var kit = window.GGKit.create({
    slug: 'bubble-fury-touch',
    orientation: 'landscape',
    validateSave: validateSave,
    onPause: function () { if (Game.live) Game.live.onKitPause(); },
    onResume: function () { if (Game.live) Game.live.onKitResume(); },
    onRestart: function () { if (Game.live) Game.live.restartRun(); }
  });

  // prefers-reduced-motion is the DEFAULT for the shake toggle, not an
  // override: a player who has already chosen in Settings keeps their choice.
  try {
    if (reduceMotion && localStorage.getItem('gg-bubble-fury-touch-ui') == null) {
      kit.juice.enabled = false;
    }
  } catch (e) { /* private mode: leave the kit default */ }

  var save = kit.save.get(blankSave());
  if (!validateSave(save)) save = blankSave();
  function persist() { kit.save.set(save); }

  function progressFor(mode) {
    var p = save.modes[mode];
    if (!p || typeof p !== 'object') {
      p = { best: 0, wave: 0, cleared: 0, medal: 'none', runs: 0 };
      save.modes[mode] = p;
    }
    if (typeof p.best !== 'number') p.best = 0;
    if (typeof p.wave !== 'number') p.wave = 0;
    if (!MEDAL_RANK[p.medal]) p.medal = p.medal === 'none' ? 'none' : 'none';
    return p;
  }

  function medalFor(modeKey, score) {
    var m = look(D.MODES, modeKey, 'standard');
    var t = (m && m.medals) || { bronze: 1e9, silver: 1e9, gold: 1e9 };
    if (score >= t.gold) return 'gold';
    if (score >= t.silver) return 'silver';
    if (score >= t.bronze) return 'bronze';
    return 'none';
  }

  function reqMet(r) {
    if (!r) return true;
    var p = progressFor(r.mode);
    if (r.cleared && !p.cleared) return false;
    if (r.medal && MEDAL_RANK[p.medal] < MEDAL_RANK[r.medal]) return false;
    if (r.wave && p.wave < r.wave) return false;
    return true;
  }
  function modeUnlocked(key) {
    var m = look(D.MODES, key, 'standard');
    if (!m || !m.requires) return true;
    if (m.requires.all) {
      var i;
      for (i = 0; i < m.requires.all.length; i++) if (!reqMet(m.requires.all[i])) return false;
      return true;
    }
    return reqMet(m.requires);
  }

  // -------------------------------------------------- verification hook
  // Installed before Phaser exists so an orchestrator can read state even if
  // boot fails, and so ?wave= / ?arena= / ?mode= are honoured from the boot
  // fallback as well as from the live scene.
  var hook = {
    version: VERSION,
    ready: false,
    error: null,
    state: {
      phase: 'boot', mode: null, arena: null, wave: 0, waves: 0,
      hp: 0, maxHp: 0, score: 0, best: 0, mult: 1, weapon: 'spread',
      enemies: 0, boss: 0, bossHp: 0, bossPhase: 0, alive: 0, time: 0, kitPaused: 0,
      pickups: 0, medal: 'none', tutorial: 0, fps: 0,
      pool: { enemy: 0, bullet: 0, ebullet: 0, pickup: 0, fx: 0, pop: 0, pendingDrops: 0 }
    },
    pending: { wave: 0, arena: null, mode: null, god: 0, auto: 0 },
    forceWave: function (n) {
      n = Math.max(1, Math.floor(Number(n) || 1));
      hook.pending.wave = n;
      if (Game.live) { Game.live.forceWave(n); return true; }
      return false;
    },
    forceArena: function (id) {
      if (!D.ARENAS || !D.ARENAS[id]) return false;
      hook.pending.arena = id;
      if (Game.live) { Game.live.forceArena(id); return true; }
      return false;
    },
    forceMode: function (m) {
      if (!D.MODES || !D.MODES[m]) return false;
      hook.pending.mode = m;
      return true;
    },
    start: function (mode, arena, wave) {
      if (mode) hook.forceMode(mode);
      if (arena) hook.pending.arena = arena;
      if (wave) hook.pending.wave = Math.max(1, Math.floor(wave));
      if (hook.game) {
        kit.input.clearAll();
        kit.resume('menu');
        hook.game.scene.stop('game');
        hook.game.scene.stop('hud');
        hook.game.scene.start('game', {
          mode: hook.pending.mode || 'standard',
          arena: hook.pending.arena,
          wave: hook.pending.wave || 1
        });
        return true;
      }
      return false;
    },
    setGod: function (on) {
      hook.pending.god = on ? 1 : 0;
      if (Game.live) Game.live.god = !!on;
      return true;
    },
    kill: function () { if (Game.live) { Game.live.damagePlayer(99999, 0, 0, 'hook'); return true; } return false; },
    clearWave: function () { if (Game.live) { Game.live.debugClearWave(); return true; } return false; },
    debug: function (on) { if (Game.live) { Game.live.debugView = !!on; return true; } return false; },
    unlockAll: function () {
      var i, k;
      for (i = 0; i < (D.MODE_ORDER || []).length; i++) {
        k = D.MODE_ORDER[i];
        var p = progressFor(k);
        p.cleared = 1; p.medal = 'gold'; p.wave = Math.max(p.wave, 20);
      }
      persist();
      return true;
    },
    resetSave: function () { save = blankSave(); persist(); return true; },
    snapshot: function () { return JSON.parse(JSON.stringify(hook.state)); }
  };
  window.__bf = hook;

  (function readBootSwitches() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    var w = parseInt(q.get('wave'), 10);
    if (w > 0) hook.pending.wave = w;
    var a = q.get('arena');
    if (a && D.ARENAS && D.ARENAS[a]) hook.pending.arena = a;
    var m = q.get('mode');
    if (m && D.MODES && D.MODES[m]) hook.pending.mode = m;
    if (q.get('god') === '1') hook.pending.god = 1;
    if (q.get('auto') === '1') hook.pending.auto = 1;
  })();

  // ======================================================== asset tables
  var IMG = [
    ['floor_plaza', 'assets/floor_plaza.jpg'],
    ['floor_yard', 'assets/floor_yard.jpg'],
    ['floor_choke', 'assets/floor_choke.jpg'],
    ['floor_night', 'assets/floor_night.jpg'],
    ['floor_furnace', 'assets/floor_furnace.jpg'],
    ['disc', 'assets/disc.png'],
    ['p_spark', 'assets/p_spark.png'],
    ['p_smoke', 'assets/p_smoke.png'],
    ['p_ring', 'assets/p_ring.png'],
    ['p_shard', 'assets/p_shard.png'],
    ['p_star', 'assets/p_star.png'],
    ['p_ember', 'assets/p_ember.png'],
    ['nightmask', 'assets/nightmask.png'],
    ['logo', 'assets/logo.png']
  ];

  var SFX = ['fire_spread', 'fire_beam', 'fire_bounce', 'fire_flak', 'fire_rail',
    'enemy_shoot', 'enemy_death', 'elite_death', 'boss_roar', 'boss_hit',
    'boss_death', 'hurt', 'pickup_weapon', 'pickup_health', 'pickup_mult',
    'wave_start', 'wave_clear', 'ui_tick', 'ui_select', 'defeat', 'victory',
    'medal', 'unlock', 'dash'];
  var MUS = ['music_arena', 'music_boss', 'amb_arena'];

  (function registerAudio() {
    var map = {}, i;
    for (i = 0; i < SFX.length; i++) map[SFX[i]] = 'assets/sfx_' + SFX[i] + '.mp3';
    for (i = 0; i < MUS.length; i++) map[MUS[i]] = 'assets/' + MUS[i] + '.mp3';
    kit.audio.register(map);
  })();

  function sfx(name, vol, rate) { kit.audio.sfx(name, { volume: vol == null ? 1 : vol, rate: rate || 1 }); }

  // ------------------------------------------------------- safe area
  var safe = { top: 0, right: 0, bottom: 0, left: 0 };
  function readSafeArea(scaleMgr) {
    var probe = document.getElementById('safearea');
    if (!probe) return;
    var cs = window.getComputedStyle(probe);
    var sx = 1, sy = 1;
    if (scaleMgr && scaleMgr.displayScale) { sx = scaleMgr.displayScale.x; sy = scaleMgr.displayScale.y; }
    safe.top = Math.min(60, (parseFloat(cs.paddingTop) || 0) * sy);
    safe.bottom = Math.min(60, (parseFloat(cs.paddingBottom) || 0) * sy);
    safe.left = Math.min(90, (parseFloat(cs.paddingLeft) || 0) * sx);
    safe.right = Math.min(90, (parseFloat(cs.paddingRight) || 0) * sx);
  }

  // ============================================================== Boot
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); },

    preload: function () {
      var self = this;
      kit.loader.show('Bubble Fury Touch');
      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      var i;
      for (i = 0; i < IMG.length; i++) this.load.image(IMG[i][0], IMG[i][1]);
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.75); });
      this.load.on('loaderror', function (f) {
        hook.error = 'asset ' + (f && f.key);
      });
    },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var self = this;
      this.buildAnims();
      readSafeArea(this.scale);
      this.scale.on('resize', function () { readSafeArea(self.scale); });

      // Audio decodes through the GGKit bus, not Phaser's, so the whole
      // title has exactly one audio implementation.
      // Keep music lazy. SFX are small and safe to warm during the loader;
      // loops begin loading only after the first menu interaction.
      kit.audio.preload(SFX).then(function () {
        kit.loader.progress(1);
        kit.loader.hide();
        hook.ready = true;
        self.go();
      }).catch(function () {
        kit.loader.hide();
        hook.ready = true;
        self.go();
      });
      // Never let a stalled decode strand the player on the loader.
      this.time.delayedCall(6000, function () {
        if (!hook.ready) { kit.loader.hide(); hook.ready = true; self.go(); }
      });
      kit.registerPWA();
    },

    go: function () {
      if (this.went) return;
      this.went = true;
      if (hook.pending.auto || hook.pending.mode || hook.pending.wave) {
        this.scene.start('game', {
          mode: hook.pending.mode || 'standard',
          arena: hook.pending.arena,
          wave: hook.pending.wave || 1
        });
      } else {
        this.scene.start('menu');
      }
    },

    buildAnims: function () {
      var a = this.anims, i, k, def;
      if (!a.exists('player_idle')) {
        a.create({ key: 'player_idle', frames: [{ key: 'atlas', frame: 'player0' }, { key: 'atlas', frame: 'player1' },
          { key: 'atlas', frame: 'player2' }], frameRate: 6, repeat: -1 });
      }
      if (!a.exists('player_move')) {
        a.create({ key: 'player_move', frames: [{ key: 'atlas', frame: 'player1' }, { key: 'atlas', frame: 'player2' },
          { key: 'atlas', frame: 'player3' }, { key: 'atlas', frame: 'player2' }], frameRate: 14, repeat: -1 });
      }
      if (!a.exists('player_fire')) {
        a.create({ key: 'player_fire', frames: [{ key: 'atlas', frame: 'player2' }, { key: 'atlas', frame: 'player3' },
          { key: 'atlas', frame: 'player2' }], frameRate: 20, repeat: -1 });
      }
      if (!a.exists('player_hit')) {
        a.create({ key: 'player_hit', frames: [{ key: 'atlas', frame: 'player3' }, { key: 'atlas', frame: 'player2' }],
          frameRate: 18, repeat: -1 });
      }
      var ids = ['rusher', 'orbiter', 'spitter', 'shielder', 'splitter', 'lancer', 'mini'];
      for (i = 0; i < ids.length; i++) {
        k = ids[i];
        def = look(D.ENEMIES, k, 'rusher');
        if (!a.exists(k + '_idle')) {
          a.create({
            key: k + '_idle',
            frames: [{ key: 'atlas', frame: def.frames[0] }, { key: 'atlas', frame: def.frames[1] }],
            frameRate: 4, repeat: -1
          });
        }
        if (!a.exists(k + '_move')) {
          a.create({ key: k + '_move', frames: [{ key: 'atlas', frame: def.frames[0] },
            { key: 'atlas', frame: def.frames[1] }, { key: 'atlas', frame: def.frames[0] }], frameRate: 9, repeat: -1 });
        }
        if (!a.exists(k + '_attack')) {
          a.create({ key: k + '_attack', frames: [{ key: 'atlas', frame: def.frames[1] },
            { key: 'atlas', frame: def.frames[0] }, { key: 'atlas', frame: def.frames[1] }], frameRate: 15, repeat: -1 });
        }
        if (!a.exists(k + '_hit')) {
          a.create({ key: k + '_hit', frames: [{ key: 'atlas', frame: def.frames[1] },
            { key: 'atlas', frame: def.frames[1] }, { key: 'atlas', frame: def.frames[0] }], frameRate: 18, repeat: -1 });
        }
      }
      if (!a.exists('scuzz_idle')) {
        a.create({ key: 'scuzz_idle', frames: [{ key: 'atlas', frame: 'scuzz0' }, { key: 'atlas', frame: 'scuzz1' }], frameRate: 4, repeat: -1 });
      }
      if (!a.exists('scuzz_move')) {
        a.create({ key: 'scuzz_move', frames: [{ key: 'atlas', frame: 'scuzz0' }, { key: 'atlas', frame: 'scuzz1' },
          { key: 'atlas', frame: 'scuzz0' }], frameRate: 7, repeat: -1 });
      }
      if (!a.exists('scuzz_spiral')) {
        a.create({ key: 'scuzz_spiral', frames: [{ key: 'atlas', frame: 'scuzz1' }, { key: 'atlas', frame: 'scuzz1' },
          { key: 'atlas', frame: 'scuzz2' }], frameRate: 7, repeat: -1 });
      }
      if (!a.exists('scuzz_attack')) {
        a.create({ key: 'scuzz_attack', frames: [{ key: 'atlas', frame: 'scuzz1' }, { key: 'atlas', frame: 'scuzz2' },
          { key: 'atlas', frame: 'scuzz1' }], frameRate: 12, repeat: -1 });
      }
      if (!a.exists('scuzz_hit')) {
        a.create({ key: 'scuzz_hit', frames: [{ key: 'atlas', frame: 'scuzz2' }, { key: 'atlas', frame: 'scuzz1' }],
          frameRate: 16, repeat: -1 });
      }
      if (!a.exists('scuzz_fury')) {
        a.create({ key: 'scuzz_fury', frames: [{ key: 'atlas', frame: 'scuzz2' }, { key: 'atlas', frame: 'scuzz1' },
          { key: 'atlas', frame: 'scuzz2' }], frameRate: 9, repeat: -1 });
      }
    }
  });

  // ============================================================== Menu
  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'menu' }); },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var self = this;
      readSafeArea(this.scale);
      this.cameras.main.setBackgroundColor('#070c18');
      this.pickArena = null;
      this.selMode = 'standard';
      this.menuAudioStarted = false;
      this.menuKeyDown = false;

      // drifting bubble bed so the menu is never a static plate
      this.bubbles = [];
      var i, s;
      for (i = 0; i < 26; i++) {
        s = this.add.image(Math.random() * VW, Math.random() * VH, 'disc')
          .setTint(i % 3 === 0 ? 0xff76a2 : 0x7aeeff)
          .setAlpha(0.05 + Math.random() * 0.07)
          .setScale(0.4 + Math.random() * 1.6)
          .setBlendMode(Phaser.BlendModes.ADD);
        s.vy = -(6 + Math.random() * 16);
        this.bubbles.push(s);
      }

      this.add.image(VW * 0.5, 78 + safe.top * 0.5, 'logo').setScale(0.62).setOrigin(0.5);

      this.cards = [];
      var order = D.MODE_ORDER || ['standard'];
      var cw = 214, gap = 14;
      var total = order.length * cw + (order.length - 1) * gap;
      var x0 = (VW - total) / 2;
      for (i = 0; i < order.length; i++) {
        this.cards.push(this.buildCard(order[i], x0 + i * (cw + gap), 156, cw, 210));
      }

      this.detail = this.add.text(VW / 2, 388, '', tstyle(13, '#9fc0d8'))
        .setOrigin(0.5).setAlign('center').setWordWrapWidth(760);

      // arena picker (used by Endless and by the practice start)
      this.add.text(VW / 2, 418, 'STARTING ARENA', tstyle(10, '#5f7d96')).setOrigin(0.5);
      this.arenaChips = [];
      var chips = ['auto'].concat(D.ARENA_ORDER || []);
      var chw = 118, cgap = 8;
      var ctotal = chips.length * chw + (chips.length - 1) * cgap;
      var cx0 = (VW - ctotal) / 2;
      for (i = 0; i < chips.length; i++) {
        this.arenaChips.push(this.buildChip(chips[i], cx0 + i * (chw + cgap), 436, chw, 30));
      }

      this.playBtn = this.buildButton(VW / 2, 490, 300, 44, 'START RUN', function () {
        self.launch();
      }, 0x7aeeff, '#06141f');

      this.setBtn = this.buildButton(VW - 78 - safe.right, 30 + safe.top, 120, 34, 'SETTINGS', function () {
        self.startMenuAudio();
        sfx('ui_select', 0.6);
        kit.openSettings();
      }, 0x1b2b3d, '#bfe3f2', 12);

      this.add.text(VW / 2, VH - 12 - safe.bottom,
        'Left half moves. Right half aims and fires. Keyboard: WASD move, arrows aim, Space fire. Gamepad not supported.',
        tstyle(10, '#4f6c85')).setOrigin(0.5, 0.5);

      this.select('standard');
      hook.state.phase = 'menu';
      hook.state.mode = null;

    },

    buildCard: function (key, x, y, w, h) {
      var self = this;
      var m = look(D.MODES, key, 'standard');
      var p = progressFor(key);
      var unlocked = modeUnlocked(key);
      var c = this.add.container(x, y);
      var g = this.add.graphics();
      c.add(g);
      var title = this.add.text(w / 2, 18, m.label, tstyle(15, unlocked ? '#eaf7ff' : '#63798c')).setOrigin(0.5);
      c.add(title);
      var body = this.add.text(w / 2, 66, m.blurb, tstyle(11, unlocked ? '#93b6cd' : '#546a7d'))
        .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w - 26);
      c.add(body);
      if (unlocked) {
        var mk = p.medal && p.medal !== 'none' ? p.medal : null;
        if (mk) c.add(this.add.image(w / 2, h - 62, 'atlas', 'medal_' + mk).setScale(0.9));
        c.add(this.add.text(w / 2, h - 36, 'BEST ' + fmt(p.best), tstyle(12, '#ffe082')).setOrigin(0.5));
        c.add(this.add.text(w / 2, h - 18, p.cleared ? 'CLEARED' : (p.wave ? 'REACHED WAVE ' + p.wave : 'NOT RUN'),
          tstyle(10, '#6f8ca3')).setOrigin(0.5));
      } else {
        c.add(this.add.image(w / 2, h - 58, 'atlas', 'lock').setScale(1.0).setAlpha(0.8));
        c.add(this.add.text(w / 2, h - 26, m.requiresText || 'Locked', tstyle(10, '#7d93a6'))
          .setOrigin(0.5).setAlign('center').setWordWrapWidth(w - 22));
      }
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', function () {
        self.startMenuAudio();
        if (!unlocked) { sfx('ui_tick', 0.5, 0.8); self.flash(c); self.select(key); return; }
        sfx('ui_select', 0.7);
        self.select(key);
      });
      c.gfx = g; c.w = w; c.h = h; c.key = key; c.unlocked = unlocked;
      this.paintCard(c, false);
      return c;
    },

    paintCard: function (c, on) {
      var g = c.gfx;
      g.clear();
      var edge = c.unlocked ? (on ? 0x7aeeff : 0x2c4a63) : 0x2a3b4b;
      g.fillStyle(on ? 0x14283c : 0x0e1a29, on ? 0.98 : 0.9);
      g.fillRoundedRect(0, 0, c.w, c.h, 14);
      g.lineStyle(on ? 2.5 : 1.5, c.unlocked ? (on ? 0x7aeeff : 0x2c4a63) : 0x2a3b4b, 1);
      g.strokeRoundedRect(0, 0, c.w, c.h, 14);
    },

    flash: function (c) {
      this.tweens.add({ targets: c, x: c.x + 6, duration: 60, yoyo: true, repeat: 1 });
    },

    buildChip: function (key, x, y, w, h) {
      var self = this;
      var label = key === 'auto' ? 'AUTO' : (look(D.ARENAS, key, 'plaza').name || key).toUpperCase();
      var c = this.add.container(x, y);
      var g = this.add.graphics();
      c.add(g);
      c.add(this.add.text(w / 2, h / 2, label, tstyle(10, '#bcd8e8')).setOrigin(0.5));
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', function () {
        self.startMenuAudio();
        sfx('ui_tick', 0.6);
        self.pickArena = key === 'auto' ? null : key;
        self.paintChips();
      });
      c.gfx = g; c.w = w; c.h = h; c.key = key;
      return c;
    },

    paintChips: function () {
      var i, c, on;
      for (i = 0; i < this.arenaChips.length; i++) {
        c = this.arenaChips[i];
        on = (c.key === 'auto' && !this.pickArena) || c.key === this.pickArena;
        c.gfx.clear();
        c.gfx.fillStyle(on ? 0x1d3550 : 0x101d2c, 1);
        c.gfx.fillRoundedRect(0, 0, c.w, c.h, 8);
        c.gfx.lineStyle(on ? 2 : 1, on ? 0x7aeeff : 0x27405a, 1);
        c.gfx.strokeRoundedRect(0, 0, c.w, c.h, 8);
      }
    },

    buildButton: function (cx, cy, w, h, label, cb, fill, textCol, size) {
      var c = this.add.container(cx - w / 2, cy - h / 2);
      var g = this.add.graphics();
      g.fillStyle(fill, 1);
      g.fillRoundedRect(0, 0, w, h, 12);
      c.add(g);
      c.add(this.add.text(w / 2, h / 2, label, tstyle(size || 15, textCol || '#06141f')).setOrigin(0.5));
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', function () { cb(); });
      return c;
    },

    select: function (key) {
      var i, m, p;
      this.selMode = key;
      for (i = 0; i < this.cards.length; i++) this.paintCard(this.cards[i], this.cards[i].key === key);
      this.paintChips();
      m = look(D.MODES, key, 'standard');
      p = progressFor(key);
      var t = m.medals || {};
      var line = modeUnlocked(key)
        ? ('Medals: bronze ' + fmt(t.bronze) + ' / silver ' + fmt(t.silver) + ' / gold ' + fmt(t.gold)
           + '   Your best: ' + fmt(p.best) + (p.medal !== 'none' ? '  (' + p.medal + ')' : ''))
        : (m.requiresText || 'Locked.');
      setTextIf(this.detail, line);
    },

    launch: function () {
      if (!modeUnlocked(this.selMode)) { sfx('ui_tick', 0.5, 0.7); return; }
      this.startMenuAudio();
      sfx('ui_select', 0.9);
      this.scene.start('game', { mode: this.selMode, arena: this.pickArena, wave: 1 });
    },

    startMenuAudio: function () {
      if (this.menuAudioStarted) return;
      this.menuAudioStarted = true;
      kit.audio.music('amb_arena', 900);
    },

    update: function (time, delta) {
      var i, b, dt = Math.min(delta, 100) / 1000;
      var menuKey = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
      if (menuKey && !this.menuKeyDown) this.launch();
      this.menuKeyDown = menuKey;
      for (i = 0; i < this.bubbles.length; i++) {
        b = this.bubbles[i];
        b.y += b.vy * dt;
        if (b.y < -60) { b.y = VH + 60; b.x = Math.random() * VW; }
      }
    }
  });

  // ============================================================== Game
  var Game = { live: null };

  var GameScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function GameScene() { Phaser.Scene.call(this, { key: 'game' }); },

    init: function (data) {
      this.modeKey = (data && data.mode) || hook.pending.mode || 'standard';
      if (!D.MODES || !D.MODES[this.modeKey]) this.modeKey = 'standard';
      this.mode = look(D.MODES, this.modeKey, 'standard');
      this.startArena = (data && data.arena) || hook.pending.arena || null;
      this.startWave = Math.max(1, (data && data.wave) || hook.pending.wave || 1);
      this.god = !!hook.pending.god;
      this.debugView = false;
      // Phaser reuses the scene instance across restarts, so anything that
      // is not rebuilt in create() must be cleared here or it leaks forward.
      this.arenaOverride = null;
      this.pendingNotices = [];
      this.arena = null;
      this.hud = null;
    },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var self = this;
      Game.live = this;
      readSafeArea(this.scale);

      this.simT = 0;
      this.acc = 0;
      this.frozenUntilDrain = false;
      this.simPaused = !!kit.paused;
      this.cosmeticFrozen = false;
      this.visualPauseSet = false;
      this.renderDt = STEP;
      this.camLookX = 0;
      this.camLookY = 0;
      this.camVelX = 0;
      this.camVelY = 0;
      this.camDip = 0;
      this.camDipVel = 0;
      this.camZoom = 1.3;
      this.poolStats = { enemy: 0, bullet: 0, ebullet: 0, pickup: 0, fx: 0, pop: 0 };
      this.pendingDrops = [];
      this.over = null;              // null | 'dead' | 'clear'
      this.rng = mulberry32(0xBF0000 ^ Date.now());
      this.waveRng = mulberry32(0x51D5);

      this.cameras.main.setBackgroundColor('#05080f');

      this.buildPools();
      this.buildFx();
      this.ctl = makeControls(this);

      this.run = {
        wave: this.startWave,
        score: 0,
        kills: 0,
        mult: 0,             // index into D.MULT.steps
        multT: 0,
        best: progressFor(this.modeKey).best,
        arena: null,
        clearedWaves: 0,
        waveTimer: 0,
        intermission: 0,
        spawnQueue: [],
        bossPending: 0,
        dripT: 0,
        bossAlive: null,
        intensity: false,
        started: false
      };

      this.tutorial = (!save.tut && this.modeKey === 'standard' && this.startWave === 1)
        ? { i: 0, t: 0, flags: {} } : null;

      this.player = this.makePlayer();
      this.buildArena(this.arenaForWave(this.run.wave));
      this.placePlayerSafe();

      this.scene.launch('hud');
      this.hud = this.scene.get('hud');

      this.beginWave(this.run.wave, true);
      kit.audio.music('music_arena', 700);

      hook.state.phase = 'play';
      hook.state.mode = this.modeKey;
      hook.state.waves = this.mode.waves || 0;

      this.events.on('shutdown', function () {
        if (Game.live === self) Game.live = null;
      });

      this.pauseKeyDown = false;
      this.restartKeyDown = false;
    },

    // ---------------------------------------------------------- pools
    // Every moving thing comes out of a preallocated pool. The debug view
    // walks these same arrays, so it can never disagree with the sim.
    buildPools: function () {
      var self = this;
      this.pool = { bullets: [], ebullets: [], enemies: [], pickups: [], fx: [] };
      var i, s;

      function mk(list, n, frame, depth, maker) {
        var j, sp;
        for (j = 0; j < n; j++) {
          sp = maker ? maker() : self.add.sprite(-999, -999, 'atlas', frame);
          sp.setActive(false).setVisible(false).setDepth(depth);
          sp.d = {};
          list.push(sp);
        }
      }
      mk(this.pool.bullets, 320, 'bolt_cyan', 40);
      mk(this.pool.ebullets, 384, 'orb_violet', 39);
      mk(this.pool.enemies, 96, 'rusher0', 30);
      mk(this.pool.pickups, 80, 'pk_health', 22);
      mk(this.pool.fx, 96, 'mz_spread', 45);
      this.beams = [];
      for (i = 0; i < 12; i++) this.beams.push({ on: 0, x: 0, y: 0, a: 0, r: 0, w: 0, life: 0, max: 1, col: 0xffffff });
      this.gfx = this.add.graphics().setDepth(44);
      this.debugGfx = this.add.graphics().setDepth(90);
    },

    grab: function (list, stat) {
      var i;
      for (i = 0; i < list.length; i++) if (!list[i].active) return list[i];
      if (stat && this.poolStats && this.poolStats[stat] != null) this.poolStats[stat]++;
      return null;                    // pool exhausted: drop the spawn, never grow
    },

    buildFx: function () {
      var add = Phaser.BlendModes.ADD;
      this.emHit = this.add.particles(0, 0, 'p_spark', {
        speed: { min: 90, max: 300 }, lifespan: { min: 160, max: 340 },
        scale: { start: 0.55, end: 0 }, quantity: 1, blendMode: add, emitting: false
      }).setDepth(46);
      this.emDeath = this.add.particles(0, 0, 'p_shard', {
        speed: { min: 70, max: 320 }, lifespan: { min: 260, max: 620 },
        scale: { start: 0.9, end: 0 }, rotate: { start: 0, end: 360 },
        quantity: 1, blendMode: add, emitting: false
      }).setDepth(46);
      this.emSmoke = this.add.particles(0, 0, 'p_smoke', {
        speed: { min: 20, max: 90 }, lifespan: { min: 420, max: 900 },
        scale: { start: 0.6, end: 1.5 }, alpha: { start: 0.5, end: 0 },
        quantity: 1, emitting: false
      }).setDepth(24);
      this.emSpark = this.add.particles(0, 0, 'p_ember', {
        speed: { min: 40, max: 180 }, lifespan: { min: 200, max: 520 },
        scale: { start: 0.9, end: 0 }, quantity: 1, blendMode: add, emitting: false
      }).setDepth(46);
      this.emStar = this.add.particles(0, 0, 'p_star', {
        speed: { min: 30, max: 120 }, lifespan: { min: 300, max: 620 },
        scale: { start: 0.5, end: 0 }, quantity: 1, blendMode: add, emitting: false
      }).setDepth(47);
      this.emTrail = this.add.particles(0, 0, 'p_ember', {
        speed: { min: 5, max: 30 }, lifespan: { min: 160, max: 300 },
        scale: { start: 0.5, end: 0 }, quantity: 1, blendMode: add, emitting: false
      }).setDepth(23);
    },

    burst: function (em, x, y, n, tint) {
      if (tint != null) em.setParticleTint(tint);
      em.emitParticleAt(x, y, n);
    },

    // ---------------------------------------------------------- arena
    arenaForWave: function (n) {
      if (this.arenaOverride) return this.arenaOverride;
      if (this.startArena && (this.mode.endless || n < 4)) return this.startArena;
      var list = D.WAVES || [];
      if (n >= 1 && n <= list.length && !this.mode.endless) return list[n - 1].arena;
      var pool = D.ENDLESS_ARENAS || ['plaza'];
      return pool[Math.floor((n - 1) / 3) % pool.length];
    },

    buildArena: function (key) {
      var self = this, i, o, s;
      var a = look(D.ARENAS, key, 'plaza');
      if (this.arena) this.teardownArena();
      this.arena = a;
      this.run.arena = a.key;

      this.floor = this.add.tileSprite(0, 0, a.w, a.h, a.floor).setOrigin(0, 0).setDepth(0);

      this.props = [];      // {kind, x, y, r|w/h, sprite, hp}
      this.arenaObjs = [this.floor];

      // spawn lane chevrons: the designer's declared approaches, painted so
      // a player can learn where a wave comes from.
      this.laneMarks = [];
      for (i = 0; i < (a.lanes || []).length; i++) {
        o = a.lanes[i];
        s = this.add.image(o.x, o.y, 'atlas', 'lane').setDepth(1).setAlpha(0.28);
        s.setRotation(Math.atan2(a.h / 2 - o.y, a.w / 2 - o.x));
        this.arenaObjs.push(s);
        this.laneMarks.push(s);
      }

      // safe pockets
      this.pockets = [];
      for (i = 0; i < (a.pockets || []).length; i++) {
        o = a.pockets[i];
        s = this.add.image(o.x, o.y, 'atlas', 'pocket').setDepth(2).setAlpha(0.5);
        s.setScale((o.r * 2) / 72);
        this.arenaObjs.push(s);
        this.pockets.push({ x: o.x, y: o.y, r: o.r, name: o.name || 'Safe pocket', spr: s });
      }

      // hazards
      this.hazards = [];
      for (i = 0; i < (a.hazards || []).length; i++) {
        o = a.hazards[i];
        s = this.add.image(o.x, o.y, 'atlas', o.type === 'vent' ? 'vent' : 'telegraph').setDepth(2);
        s.setScale((o.r * 2) / (o.type === 'vent' ? 64 : 96));
        s.setAlpha(o.type === 'vent' ? 0.85 : 0.4);
        if (o.type === 'slow') s.setTint(0x5f7ad8);
        if (o.type === 'burn') s.setTint(0xff8a5c);
        this.arenaObjs.push(s);
        this.hazards.push({ x: o.x, y: o.y, r: o.r, type: o.type, dps: o.dps || 0,
                            period: o.period || 0, phase: o.phase || 0, hot: 0, spr: s, label: o.label });
      }

      // static cover
      for (i = 0; i < (a.pillars || []).length; i++) {
        o = a.pillars[i];
        s = this.add.image(o.x, o.y, 'atlas', 'pillar').setDepth(20);
        s.setScale((o.r * 2) / 50);
        this.arenaObjs.push(s);
        this.props.push({ kind: 'circle', x: o.x, y: o.y, r: o.r, spr: s, solid: 1 });
      }
      for (i = 0; i < (a.crates || []).length; i++) {
        o = a.crates[i];
        s = this.add.image(o.x, o.y, 'atlas', 'crate').setDepth(20);
        this.arenaObjs.push(s);
        this.props.push({ kind: 'rect', x: o.x - 22, y: o.y - 22, w: 44, h: 44, spr: s, solid: 1 });
      }
      for (i = 0; i < (a.walls || []).length; i++) {
        o = a.walls[i];
        // Walls carry the arena accent and a hatched face so a blocker
        // never reads as a flat UI panel dropped on the arena.
        s = this.add.graphics().setDepth(19);
        s.fillStyle(0x101b28, 1);
        s.fillRoundedRect(o.x, o.y, o.w, o.h, 7);
        s.fillStyle(a.accent, 0.10);
        s.fillRoundedRect(o.x + 3, o.y + 3, o.w - 6, Math.max(4, o.h * 0.34), 5);
        s.lineStyle(1, a.accent, 0.35);
        var hx, hstep = 18;
        for (hx = -o.h; hx < o.w; hx += hstep) {
          var x0 = o.x + Math.max(0, hx), y0 = o.y + Math.max(0, -hx);
          var x1 = o.x + Math.min(o.w, hx + o.h), y1 = o.y + Math.min(o.h, o.h - (hx + o.h - o.w));
          s.beginPath(); s.moveTo(x0, y0); s.lineTo(x1, Math.min(o.y + o.h, y1)); s.strokePath();
        }
        s.lineStyle(2.5, a.accent, 0.75);
        s.strokeRoundedRect(o.x, o.y, o.w, o.h, 7);
        this.arenaObjs.push(s);
        this.props.push({ kind: 'rect', x: o.x, y: o.y, w: o.w, h: o.h, spr: s, solid: 1 });
      }
      for (i = 0; i < (a.barrels || []).length; i++) {
        o = a.barrels[i];
        s = this.add.image(o.x, o.y, 'atlas', 'barrel').setDepth(20);
        this.arenaObjs.push(s);
        this.props.push({ kind: 'circle', x: o.x, y: o.y, r: 17, spr: s, solid: 1, hp: 22, barrel: 1 });
      }
      for (i = 0; i < (a.lamps || []).length; i++) {
        o = a.lamps[i];
        s = this.add.image(o.x, o.y, 'disc').setDepth(3).setScale(4.2).setAlpha(0.20)
          .setTint(0xffe0a0).setBlendMode(Phaser.BlendModes.ADD);
        this.arenaObjs.push(s);
      }

      // arena rim
      var rim = this.add.graphics().setDepth(18);
      rim.lineStyle(4, a.accent, 0.42);
      rim.strokeRoundedRect(6, 6, a.w - 12, a.h - 12, 22);
      rim.lineStyle(2, a.accent, 0.18);
      rim.strokeRoundedRect(22, 22, a.w - 44, a.h - 44, 18);
      this.arenaObjs.push(rim);

      this.cameras.main.setBounds(0, 0, a.w, a.h);
      this.cameras.main.setZoom(RETINA_FACTOR * 1.3);
      this.cameras.main.startFollow(this.player, false, 0.12, 0.12);
      this.cameras.main.setDeadzone(70, 46);
      this.pocketFound = !!save.pockets[a.key];
    },

    teardownArena: function () {
      var i;
      for (i = 0; i < (this.arenaObjs || []).length; i++) {
        if (this.arenaObjs[i] && this.arenaObjs[i].destroy) this.arenaObjs[i].destroy();
      }
      this.arenaObjs = [];
      this.props = [];
      this.hazards = [];
      this.pockets = [];
      this.laneMarks = [];
    },

    // ---------------------------------------------------------- player
    makePlayer: function () {
      var p = this.add.sprite(0, 0, 'atlas', 'player0').setDepth(34);
      p.play('player_idle');
      p.d = {
        x: 0, y: 0, r: 16, hp: this.mode.hp || 130, maxHp: this.mode.hp || 130,
        speed: 250, aim: 0, fireT: 0, hurtT: 0, iframe: 0, flash: 0,
        weapon: 'spread', weaponT: 0, kbx: 0, kby: 0, moving: 0, trailT: 0,
        pocketT: 0, dead: 0, anim: 'player_idle'
      };
      this.shieldSpr = this.add.image(0, 0, 'atlas', 'player_shield').setDepth(35).setVisible(false);
      return p;
    },

    placePlayerSafe: function () {
      var a = this.arena, d = this.player.d, tries, x, y;
      for (tries = 0; tries < 60; tries++) {
        x = a.w * (0.3 + this.rng() * 0.4);
        y = a.h * (0.3 + this.rng() * 0.4);
        if (!this.blocked(x, y, d.r + 8)) { d.x = x; d.y = y; break; }
      }
      if (tries >= 60) { d.x = a.w / 2; d.y = a.h / 2; }
      this.player.setPosition(d.x, d.y);
      this.cameras.main.centerOn(d.x, d.y);
    },

    blocked: function (x, y, r) {
      var i, p, cx, cy;
      if (x < r || y < r || x > this.arena.w - r || y > this.arena.h - r) return true;
      for (i = 0; i < this.props.length; i++) {
        p = this.props[i];
        if (!p.solid) continue;
        if (p.kind === 'circle') {
          if (len(x - p.x, y - p.y) < p.r + r) return true;
        } else {
          cx = clamp(x, p.x, p.x + p.w);
          cy = clamp(y, p.y, p.y + p.h);
          if (len(x - cx, y - cy) < r) return true;
        }
      }
      return false;
    },

    resolveBody: function (d) {
      var i, p, dx, dy, dd, mn, cx, cy;
      d.x = clamp(d.x, d.r, this.arena.w - d.r);
      d.y = clamp(d.y, d.r, this.arena.h - d.r);
      for (i = 0; i < this.props.length; i++) {
        p = this.props[i];
        if (!p.solid) continue;
        if (p.kind === 'circle') {
          dx = d.x - p.x; dy = d.y - p.y;
          dd = len(dx, dy) || 0.001;
          mn = p.r + d.r;
          if (dd < mn) { d.x = p.x + dx / dd * mn; d.y = p.y + dy / dd * mn; }
        } else {
          cx = clamp(d.x, p.x, p.x + p.w);
          cy = clamp(d.y, p.y, p.y + p.h);
          dx = d.x - cx; dy = d.y - cy;
          dd = len(dx, dy);
          if (dd < d.r) {
            if (dd < 0.0001) {
              // dead centre: push out along the shallowest axis
              var lx = d.x - p.x, rx = p.x + p.w - d.x, ty = d.y - p.y, by = p.y + p.h - d.y;
              var m = Math.min(lx, rx, ty, by);
              if (m === lx) d.x = p.x - d.r; else if (m === rx) d.x = p.x + p.w + d.r;
              else if (m === ty) d.y = p.y - d.r; else d.y = p.y + p.h + d.r;
            } else {
              d.x = cx + dx / dd * d.r;
              d.y = cy + dy / dd * d.r;
            }
          }
        }
      }
    },

    lineBlocked: function (x0, y0, x1, y1) {
      // coarse march; used by lancer line of sight and hitscan wall stops
      var dx = x1 - x0, dy = y1 - y0, L = len(dx, dy);
      var stepN = Math.min(48, Math.max(2, Math.floor(L / 18)));
      var i, t;
      for (i = 1; i <= stepN; i++) {
        t = i / stepN;
        if (this.blocked(x0 + dx * t, y0 + dy * t, 3)) return t;
      }
      return 1;
    },

    // ----------------------------------------------------- wave director
    waveDef: function (n) {
      var list = D.WAVES || [];
      if (!this.mode.endless && n >= 1 && n <= list.length) return list[n - 1];
      // procedural endless / overflow wave
      var pool = D.ENDLESS_POOL || ['rusher'];
      var r = mulberry32(0xE1D + n * 0x9E37);
      var budget = 8 + Math.floor(n * 1.5);
      var comp = [];
      var used = {};
      var kinds = Math.min(pool.length, 2 + Math.floor(n / 4));
      var i, k, c;
      for (i = 0; i < kinds && budget > 0; i++) {
        k = pool[Math.floor(r() * pool.length)];
        if (used[k]) k = pool[(i + n) % pool.length];
        used[k] = 1;
        c = Math.max(1, Math.round(budget / (kinds - i) * (0.7 + r() * 0.6)));
        c = Math.min(c, budget);
        budget -= c;
        comp.push([k, c]);
      }
      return {
        n: n, arena: this.arenaForWave(n), drip: Math.max(0.22, 0.55 - n * 0.012),
        comp: comp, boss: (n % 5 === 0) ? Math.min(3, 1 + Math.floor(n / 10)) : 0
      };
    },

    beginWave: function (n, first) {
      var self = this, i, j, k, c, def, dens, arenaKey;
      def = this.waveDef(n);
      this.run.wave = n;
      this.run.dripT = 0;
      this.run.spawnQueue.length = 0;
      this.run.bossPending = 0;
      this.run.intermission = 0;
      this.waveRng = mulberry32(0xC0FFEE ^ (n * 0x45D9F3B));

      arenaKey = def.arena || this.arenaForWave(n);
      if (this.startArena && (this.mode.endless || n < 4)) arenaKey = this.startArena;
      if (this.arenaOverride) arenaKey = this.arenaOverride;
      if (!this.arena || this.arena.key !== arenaKey) {
        this.clearField();
        this.buildArena(arenaKey);
        this.placePlayerSafe();
      }

      dens = this.mode.density || 1;
      for (i = 0; i < (def.comp || []).length; i++) {
        k = def.comp[i][0];
        c = Math.max(1, Math.round(def.comp[i][1] * dens));
        for (j = 0; j < c; j++) this.run.spawnQueue.push(k);
      }
      // shuffle so a wave is not sorted by type
      for (i = this.run.spawnQueue.length - 1; i > 0; i--) {
        j = Math.floor(this.waveRng() * (i + 1));
        k = this.run.spawnQueue[i]; this.run.spawnQueue[i] = this.run.spawnQueue[j]; this.run.spawnQueue[j] = k;
      }
      this.run.drip = def.drip || 0.5;

      this.run.waveTimer = this.mode.waveTimer ? this.mode.waveTimer + Math.floor(n / 5) * 3 : 0;

      if (def.boss) {
        this.run.bossPending = def.boss;
        if (this.spawnBoss(def.boss, n)) this.run.bossPending = 0;
        this.notice('SCUZZ // WAVE ' + n, 0.9, 1);
        sfx('boss_roar', 1.0);
        kit.audio.music('music_boss', 700);
      } else {
        this.notice('WAVE ' + n + (this.mode.waves ? ' / ' + this.mode.waves : ''), first ? 1.0 : 0.8);
        sfx('wave_start', 0.9);
        kit.audio.music(this.arena.music || 'music_arena', 700);
      }
      hook.state.wave = n;
      hook.state.arena = this.arena.key;
    },

    spawnPointFor: function (kind) {
      var a = this.arena, lanes = a.lanes || [], i, best = null, bd = -1, o, d, tries, x, y;
      for (i = 0; i < lanes.length; i++) {
        o = lanes[i];
        d = len(o.x - this.player.d.x, o.y - this.player.d.y) + this.waveRng() * 220;
        if (d > bd) { bd = d; best = o; }
      }
      if (!best) best = { x: a.w * 0.5, y: 60 };
      for (tries = 0; tries < 18; tries++) {
        x = best.x + (this.waveRng() - 0.5) * 120;
        y = best.y + (this.waveRng() - 0.5) * 120;
        if (!this.blocked(x, y, 26) && len(x - this.player.d.x, y - this.player.d.y) > 200) return { x: x, y: y };
      }
      return { x: best.x, y: best.y };
    },

    spawnEnemy: function (kind, x, y, small) {
      var def = look(D.ENEMIES, kind, 'rusher');
      var s = this.grab(this.pool.enemies, 'enemy');
      if (!s || !def) return null;
      var n = this.run.wave;
      var hpScale = 1 + (n - 1) * 0.085;
      var spScale = Math.min(1.5, 1 + (n - 1) * 0.012) * (this.mode.speed || 1);
      var d = s.d;
      resetEntity(d);
      d.kind = def.key; d.def = def;
      d.x = x; d.y = y; d.r = def.r; d.boss = 0;
      d.hp = d.maxHp = def.hp * hpScale * (small ? 0.55 : 1);
      d.speed = def.speed * spScale;
      d.cool = def.cooldown[0] + this.waveRng() * (def.cooldown[1] - def.cooldown[0]);
      d.phase = this.waveRng() * Math.PI * 2;
      d.orbitDir = this.waveRng() < 0.5 ? -1 : 1;
      d.facing = 0;
      d.alive = 1;
      s.setActive(true).setVisible(true);
      s.setPosition(x, y);
      s.setScale(small ? 0.7 : 1);
      s.clearTint();
      s.setAlpha(1);
      d.anim = def.key + '_move';
      s.play(d.anim);
      s.setDepth(30);
      return s;
    },

    spawnBoss: function (phaseStart, wave) {
      var s = this.grab(this.pool.enemies, 'enemy');
      if (!s) return null;
      var B = D.BOSS;
      var p = this.spawnPointFor('boss');
      var d = s.d;
      resetEntity(d);
      var phaseIdx = this.mode.furyBoss ? 2 : clamp(Math.floor(phaseStart || 1) - 1, 0, B.phases.length - 1);
      d.kind = 'scuzz'; d.def = B; d.boss = 1;
      d.x = p.x; d.y = p.y; d.r = B.r;
      d.maxHp = (B.hp + B.hpPerWave * wave) * (this.mode.density || 1);
      d.hp = d.maxHp;
      d.phaseIdx = phaseIdx;
      d.speed = B.phases[phaseIdx].speed;
      d.cool = 1.6;
      d.alive = 1;
      d.patIdx = 0;
      s.setActive(true).setVisible(true);
      s.setPosition(p.x, p.y);
      d.anim = phaseIdx >= 2 ? 'scuzz_fury' : (phaseIdx === 1 ? 'scuzz_spiral' : 'scuzz_idle');
      s.setTexture('atlas', phaseIdx >= 2 ? 'scuzz2' : (phaseIdx === 1 ? 'scuzz1' : 'scuzz0'));
      s.setScale(1);
      s.clearTint();
      s.setAlpha(1);
      s.setDepth(32);
      s.play(d.anim);
      this.run.bossAlive = s;
      return s;
    },

    // ------------------------------------------------------------ loop
    update: function (time, delta) {
      var dt = Math.min(delta, 100) / 1000;
      var j = kit.juice.frame();
      this.renderDt = dt;
      this.cosmeticFrozen = !!j.frozen;

      // GGKit owns pause. It can raise one BEFORE this scene exists (the
      // rotate gate fires at kit creation), so the scene syncs to the kit
      // every frame rather than trusting only the onPause callback.
      if (!!kit.paused !== this.simPaused) this.syncPause(!!kit.paused);

      var pauseKey = kit.input.keyDown('Escape') || kit.input.keyDown('KeyP');
      if (pauseKey && !this.pauseKeyDown && !this.over) this.togglePause();
      this.pauseKeyDown = pauseKey;
      var restartKey = kit.input.keyDown('KeyR');
      if (restartKey && !this.restartKeyDown && this.over) this.restartRun();
      this.restartKeyDown = restartKey;

      if (this.simPaused || this.over) {
        // still drain input claims so a stale pointer cannot resume held
        this.ctl.sample(this);
        this.renderAll(j);
        this.publish(delta);
        return;
      }

      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.ctl.sample(this);
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      // Degraded devices run in slow motion. They must NEVER time-skip, so
      // the leftover accumulator is capped instead of being paid back.
      if (this.acc > STEP * MAX_STEPS) this.acc = STEP * MAX_STEPS;

      this.renderAll(j);
      this.publish(delta);
    },

    publish: function (delta) {
      var st = hook.state, d = this.player.d, b = this.run.bossAlive;
      st.phase = this.over ? this.over : (this.simPaused ? 'paused' : 'play');
      st.mode = this.modeKey;
      st.arena = this.arena ? this.arena.key : null;
      st.wave = this.run.wave;
      st.waves = this.mode.waves || 0;
      st.hp = Math.max(0, Math.round(d.hp));
      st.maxHp = d.maxHp;
      st.score = Math.floor(this.run.score);
      st.best = Math.max(this.run.best, Math.floor(this.run.score));
      st.mult = this.multValue();
      st.weapon = d.weapon;
      st.enemies = this.countEnemies();
      st.boss = b && b.active ? 1 : 0;
      st.bossHp = b && b.active ? Math.max(0, Math.round(b.d.hp)) : 0;
      st.bossPhase = b && b.active ? b.d.phaseIdx + 1 : 0;
      st.alive = d.dead ? 0 : 1;
      st.time = Math.round(this.simT * 10) / 10;
      st.pickups = this.countPickups();
      st.tutorial = this.tutorial ? this.tutorial.i + 1 : 0;
      st.fps = Math.round(1000 / Math.max(1, delta));
      st.kitPaused = kit.paused ? 1 : 0;
      st.pool.enemy = this.poolStats.enemy;
      st.pool.bullet = this.poolStats.bullet;
      st.pool.ebullet = this.poolStats.ebullet;
      st.pool.pickup = this.poolStats.pickup;
      st.pool.fx = this.poolStats.fx;
      st.pool.pop = this.poolStats.pop;
      st.pool.pendingDrops = this.pendingDrops.length;
    },

    countEnemies: function () {
      var i, n = 0;
      for (i = 0; i < this.pool.enemies.length; i++) if (this.pool.enemies[i].active) n++;
      return n;
    },
    countPickups: function () {
      var i, n = 0;
      for (i = 0; i < this.pool.pickups.length; i++) if (this.pool.pickups[i].active) n++;
      return n;
    },

    // ------------------------------------------------------------ step
    step: function (dt) {
      this.simT += dt;
      this.stepPlayer(dt);
      this.stepWave(dt);
      this.stepEnemies(dt);
      this.stepBullets(dt);
      this.stepEBullets(dt);
      this.stepPickups(dt);
      this.stepHazards(dt);
      this.stepBeams(dt);
      if (!this.cosmeticFrozen) this.stepFx(dt);
      this.stepMult(dt);
      this.stepTutorial(dt);
      this.updateMusicIntensity();
    },

    updateMusicIntensity: function () {
      if (this.over) return;
      var boss = this.run.bossAlive && this.run.bossAlive.active;
      var danger = !boss && (this.player.d.hp / this.player.d.maxHp < 0.35 || this.countEnemies() >= 10);
      if (boss) {
        this.run.intensity = true;
        return;
      }
      if (danger === this.run.intensity) return;
      this.run.intensity = danger;
      kit.audio.music(danger ? 'music_boss' : (this.arena.music || 'music_arena'), 450);
    },

    stepMult: function (dt) {
      var M = D.MULT || { steps: [1], decay: 7 };
      this.run.multT -= dt;
      if (this.run.multT <= 0 && this.run.mult > 0) {
        this.run.mult--;
        this.run.multT = M.decay;
      }
    },
    multValue: function () {
      var M = D.MULT || { steps: [1] };
      return M.steps[clamp(this.run.mult, 0, M.steps.length - 1)] || 1;
    },
    bumpMult: function (n) {
      var M = D.MULT || { steps: [1], decay: 7 };
      this.run.mult = clamp(this.run.mult + (n || 1), 0, M.steps.length - 1);
      this.run.multT = M.decay;
    },

    addScore: function (base, x, y) {
      var gain = Math.round(base * this.multValue());
      this.run.score += gain;
      return gain;
    },

    // ---------------------------------------------------------- player
    stepPlayer: function (dt) {
      var d = this.player.d, c = this.ctl, i, hz, inPocket = false, pk;
      if (d.dead) return;
      d.hurtT = Math.max(0, d.hurtT - dt);
      d.iframe = Math.max(0, d.iframe - dt);
      d.flash = Math.max(0, d.flash - dt);
      d.fireT -= dt;
      if (d.weaponT > 0) {
        d.weaponT -= dt;
        if (d.weaponT <= 0) { d.weapon = 'spread'; d.weaponT = 0; }
      }

      // movement
      var mx = c.move.x, my = c.move.y, mag = c.move.mag;
      var slow = 1;
      for (i = 0; i < this.hazards.length; i++) {
        hz = this.hazards[i];
        if (len(d.x - hz.x, d.y - hz.y) < hz.r) {
          if (hz.type === 'slow') slow = Math.min(slow, 0.56);
          if (hz.type === 'burn' && d.iframe <= 0) this.damagePlayer(hz.dps * dt, 0, 0, 'hazard', 1);
          if (hz.type === 'vent' && hz.hot && d.iframe <= 0) this.damagePlayer(hz.dps * dt, 0, 0, 'hazard', 1);
        }
      }
      for (i = 0; i < this.pockets.length; i++) {
        pk = this.pockets[i];
        if (len(d.x - pk.x, d.y - pk.y) < pk.r * 0.9) { inPocket = true; break; }
      }
      if (inPocket) {
        d.hp = Math.min(d.maxHp, d.hp + 9 * dt);
        d.pocketT += dt;
        if (!this.pocketFound) {
          this.pocketFound = true;
          save.pockets[this.arena.key] = 1;
          persist();
          this.notice('SAFE POCKET FOUND', 0.9);
          sfx('unlock', 0.9);
          if (this.tutorial) this.tutorial.flags.pocket = 1;
        }
      }

      d.x += (mx * d.speed * mag * slow + d.kbx) * dt;
      d.y += (my * d.speed * mag * slow + d.kby) * dt;
      d.kbx *= Math.pow(0.02, dt);
      d.kby *= Math.pow(0.02, dt);
      this.resolveBody(d);
      d.moving = mag > 0.12 ? 1 : 0;
      if (d.moving && this.tutorial) this.tutorial.flags.moved = 1;

      if (d.moving) {
        d.trailT -= dt;
        if (d.trailT <= 0) {
          d.trailT = 0.07;
          this.emTrail.setParticleTint(0x7aeeff);
          this.emTrail.emitParticleAt(d.x - mx * 14, d.y - my * 14, 1);
        }
      }

      // aim + fire
      if (c.aim.mag > 0.12) d.aim = Math.atan2(c.aim.y, c.aim.x);
      if (c.fire && d.fireT <= 0) this.firePlayer();
    },

    firePlayer: function () {
      var d = this.player.d;
      var w = look(D.WEAPONS, d.weapon, 'spread');
      var i, a, s, bx, by, sp;
      d.fireT = w.rate;
      bx = d.x + Math.cos(d.aim) * 22;
      by = d.y + Math.sin(d.aim) * 22;

      if (w.kind === 'hitscan') {
        this.fireHitscan(w, bx, by, d.aim);
      } else {
        for (i = 0; i < (w.shots || 1); i++) {
          a = d.aim + ((w.shots || 1) > 1 ? (i / ((w.shots || 1) - 1) - 0.5) * w.arc : 0);
          a += (this.rng() - 0.5) * 0.03;
          s = this.grab(this.pool.bullets, 'bullet');
          if (!s) break;
          sp = w.speed * (0.94 + this.rng() * 0.12);
          resetEntity(s.d);
          s.d.x = bx; s.d.y = by;
          s.d.vx = Math.cos(a) * sp; s.d.vy = Math.sin(a) * sp;
          s.d.r = 6; s.d.dmg = w.dmg; s.d.life = w.life;
          s.d.bounces = w.bounces || 0; s.d.weapon = w.key;
          s.setActive(true).setVisible(true);
          s.setTexture('atlas', w.bullet || 'bolt_cyan');
          s.setPosition(bx, by);
          s.setRotation(a);
          s.setScale(1);
          s.setAlpha(1);
          s.clearTint();
        }
      }

      // muzzle flash: its own frame per weapon, so a swap is felt not read
      this.spawnFx(w.muzzle, bx, by, d.aim, 0.16, 1.0);
      d.kbx -= Math.cos(d.aim) * (w.kick || 0);
      d.kby -= Math.sin(d.aim) * (w.kick || 0);
      this.shake(w.shake || 1, 90);
      sfx(w.sfx, 0.62, 0.96 + this.rng() * 0.08);
      if (this.tutorial) this.tutorial.flags.fired = 1;
    },

    fireHitscan: function (w, x, y, a) {
      var i, s, d, along, across, dx, dy, hitAny = false;
      var stop = this.lineBlocked(x, y, x + Math.cos(a) * w.range, y + Math.sin(a) * w.range);
      var range = w.range * stop;
      for (i = 0; i < this.pool.enemies.length; i++) {
        s = this.pool.enemies[i];
        if (!s.active) continue;
        d = s.d;
        dx = d.x - x; dy = d.y - y;
        along = dx * Math.cos(a) + dy * Math.sin(a);
        across = Math.abs(dx * Math.sin(a) - dy * Math.cos(a));
        if (along > -d.r && along < range && across < d.r + w.width * 0.5) {
          this.damageEnemy(s, w.dmg, a, w.key);
          hitAny = true;
        }
      }
      var b = null;
      for (i = 0; i < this.beams.length; i++) if (!this.beams[i].on) { b = this.beams[i]; break; }
      if (b) {
        b.on = 1; b.x = x; b.y = y; b.a = a; b.r = range; b.w = w.width;
        b.life = b.max = w.key === 'rail' ? 0.22 : 0.09; b.col = w.color;
      }
      if (hitAny) this.burst(this.emHit, x + Math.cos(a) * range * 0.5, y + Math.sin(a) * range * 0.5, 4, w.color);
    },

    spawnFx: function (frame, x, y, rot, life, scale) {
      var s = this.grab(this.pool.fx, 'fx');
      if (!s) return null;
      resetEntity(s.d);
      s.d.life = life; s.d.max = life; s.d.spin = 0;
      s.d.ringFx = frame === 'p_ring' ? 1 : 0;
      s.d.baseScale = scale == null ? 1 : scale;
      s.setActive(true).setVisible(true);
      if (frame === 'p_ring') s.setTexture('p_ring'); else s.setTexture('atlas', frame);
      s.setPosition(x, y);
      s.setRotation(rot || 0);
      s.setScale(s.d.baseScale);
      s.setAlpha(1);
      s.clearTint();
      s.setBlendMode(Phaser.BlendModes.ADD);
      return s;
    },

    spawnRing: function (x, y, tint, scale) {
      var s = this.spawnFx('p_ring', x, y, 0, 0.22, scale == null ? 0.7 : scale);
      if (!s) return null;
      s.setTint(tint == null ? 0xffffff : tint);
      return s;
    },

    damagePlayer: function (amount, kx, ky, source, continuous) {
      var d = this.player.d;
      if (d.dead || this.over) return;
      if (this.god && source !== 'hook') return;
      if (!continuous && d.iframe > 0) return;
      d.hp -= amount;
      d.flash = 0.18;
      if (this.hud && this.hud.ready && this.hud.flashDamage) this.hud.flashDamage(continuous ? 0.45 : 1);
      if (!continuous) {
        d.iframe = 0.8;
        d.hurtT = 0.8;
        d.kbx += kx || 0;
        d.kby += ky || 0;
        sfx('hurt', 0.8);
        this.shake(5, 200);
        kit.juice.hitStop(55);
        this.burst(this.emHit, d.x, d.y, 8, 0xff6d7c);
      }
      if (d.hp <= 0) {
        d.hp = 0;
        d.dead = 1;
        this.endRun(false);
      }
    },

    // --------------------------------------------------------- wave run
    stepWave: function (dt) {
      var self = this, live;
      if (this.over) return;

      if (this.run.intermission > 0) {
        this.run.intermission -= dt;
        if (this.run.intermission <= 0) {
          var next = this.run.wave + 1;
          if (!this.mode.endless && this.mode.waves && this.run.wave >= this.mode.waves) {
            this.endRun(true);
            return;
          }
          this.beginWave(next, false);
        }
        return;
      }

      if (this.run.bossPending) {
        if (this.spawnBoss(this.run.bossPending, this.run.wave)) this.run.bossPending = 0;
        else return;
      }

      if (this.run.spawnQueue.length) {
        this.run.dripT -= dt;
        if (this.run.dripT <= 0) {
          this.run.dripT = this.run.drip;
          var kind = this.run.spawnQueue[0];
          var p = this.spawnPointFor(kind);
          if (this.spawnEnemy(kind, p.x, p.y, false)) this.run.spawnQueue.shift();
          else this.run.dripT = 0.12;
        }
      }

      if (this.run.waveTimer > 0) {
        this.run.waveTimer -= dt;
        if (this.run.waveTimer <= 0) {
          this.run.waveTimer = 8;
          this.notice('OVERTIME', 0.9);
          this.damagePlayer(this.mode.timerPenalty || 10, 0, 0, 'overtime');
          var i, p2;
          for (i = 0; i < 2; i++) {
            p2 = this.spawnPointFor('rusher');
            if (!this.spawnEnemy('rusher', p2.x, p2.y, false)) this.run.spawnQueue.push('rusher');
          }
        }
      }

      live = this.countEnemies();
      if (!this.run.bossPending && !this.run.spawnQueue.length && live === 0) this.clearWave();
    },

    clearWave: function () {
      var i, n = this.run.wave, DR = D.DROPS || {};
      this.clearHostiles();
      this.run.clearedWaves++;
      this.addScore(320 + n * 90, this.player.d.x, this.player.d.y - 30);
      this.bumpMult(1);
      sfx('wave_clear', 0.95);
      this.notice(n % 5 === 0 ? 'SCUZZ DOWN' : 'WAVE CLEAR', 0.9);
      this.shake(4, 260);
      // generous between-wave restock
      for (i = 0; i < (DR.waveClearHealth || 2); i++) this.dropAt(this.player.d.x + (this.rng() - 0.5) * 220,
        this.player.d.y + (this.rng() - 0.5) * 160, 'health');
      if (n % (DR.waveClearWeaponEvery || 2) === 0) {
        this.dropAt(this.player.d.x + (this.rng() - 0.5) * 260, this.player.d.y + (this.rng() - 0.5) * 180, 'weapon');
      }
      this.run.bossAlive = null;
      this.run.intermission = 2.4;
      this.run.waveTimer = 0;
      kit.audio.music(this.arena.amb || 'amb_arena', 500);
      var p = progressFor(this.modeKey);
      if (n > p.wave) { p.wave = n; persist(); }
    },

    debugClearWave: function () {
      var i;
      this.run.spawnQueue.length = 0;
      for (i = 0; i < this.pool.enemies.length; i++) {
        if (this.pool.enemies[i].active) this.killEnemy(this.pool.enemies[i], true);
      }
    },

    forceWave: function (n) {
      this.clearField();
      this.run.intermission = 0;
      this.beginWave(Math.max(1, n), false);
    },

    forceArena: function (id) {
      if (!D.ARENAS || !D.ARENAS[id]) return;
      this.arenaOverride = id;
      this.startArena = id;
      this.clearField();
      this.buildArena(id);
      this.placePlayerSafe();
      this.beginWave(this.run.wave, false);
    },

    clearField: function () {
      var i, lists = ['enemies', 'bullets', 'ebullets', 'pickups', 'fx'], L, j;
      for (i = 0; i < lists.length; i++) {
        L = this.pool[lists[i]];
        for (j = 0; j < L.length; j++) {
          L[j].setActive(false).setVisible(false);
          L[j].setPosition(-999, -999);
        }
      }
      for (i = 0; i < this.beams.length; i++) this.beams[i].on = 0;
      this.run.bossAlive = null;
      this.run.spawnQueue.length = 0;
      this.run.bossPending = 0;
      this.pendingDrops.length = 0;
    },

    clearHostiles: function () {
      var i, s;
      for (i = 0; i < this.pool.ebullets.length; i++) {
        s = this.pool.ebullets[i];
        if (s.active) { s.setActive(false).setVisible(false); s.setPosition(-999, -999); }
      }
      for (i = 0; i < this.pool.fx.length; i++) {
        s = this.pool.fx[i];
        if (s.active && s.d.ring) { s.setActive(false).setVisible(false); s.setPosition(-999, -999); }
      }
      for (i = 0; i < this.beams.length; i++) this.beams[i].on = 0;
    },

    // ---------------------------------------------------------- enemies
    stepEnemies: function (dt) {
      var i, s, d, pd = this.player.d, dx, dy, dd, tx, ty;
      for (i = 0; i < this.pool.enemies.length; i++) {
        s = this.pool.enemies[i];
        if (!s.active) continue;
        d = s.d;
        d.hitT = Math.max(0, d.hitT - dt);
        d.phase += dt;
        d.kbx *= Math.pow(0.015, dt);
        d.kby *= Math.pow(0.015, dt);
        dx = pd.x - d.x; dy = pd.y - d.y;
        dd = len(dx, dy) || 1;
        d.facing = Math.atan2(dy, dx);
        d.toPX = dx / dd; d.toPY = dy / dd; d.dist = dd;

        if (d.boss) this.stepBoss(s, dt);
        else this.stepGrunt(s, dt);

        // safe pockets repel: this is what makes them worth finding
        var j, pk, rx, ry, rl;
        for (j = 0; j < this.pockets.length; j++) {
          pk = this.pockets[j];
          rx = d.x - pk.x; ry = d.y - pk.y;
          rl = len(rx, ry);
          if (rl < pk.r + d.r) {
            rl = rl || 0.001;
            d.x = pk.x + rx / rl * (pk.r + d.r);
            d.y = pk.y + ry / rl * (pk.r + d.r);
          }
        }
        this.resolveBody(d);

        // Contact damage bounces BOTH bodies apart and puts the enemy on
        // its own touch cooldown, so a pack can never pin the player and
        // grind him down at the global i-frame rate.
        d.touchT = Math.max(0, d.touchT - dt);
        if (!pd.dead && d.touchT <= 0 && d.dist < d.r + pd.r + 2) {
          var touch = (d.def && d.def.touch) || 8;
          this.damagePlayer(touch, -d.toPX * 300, -d.toPY * 300, 'touch');
          d.touchT = 1.1;
          d.kbx -= d.toPX * 260;
          d.kby -= d.toPY * 260;
        }
      }
    },

    stepGrunt: function (s, dt) {
      var d = s.d, def = d.def, pd = this.player.d;
      var b = def.behaviour, vx = 0, vy = 0, want, ang;

      d.cool -= dt;
      if (d.tellT > 0) {
        d.tellT -= dt;
        if (d.tellT <= 0) this.commitAttack(s);
      }

      if (d.dashT > 0) {
        d.dashT -= dt;
        d.x += d.dashX * def.dashSpeed * dt;
        d.y += d.dashY * def.dashSpeed * dt;
        if (d.dashT <= 0) d.cool = def.cooldown[0] + this.rng() * (def.cooldown[1] - def.cooldown[0]);
        return;
      }

      if (b === 'dash' || b === 'chase') {
        if (d.tellT <= 0) { vx = d.toPX; vy = d.toPY; }
        if (b === 'dash' && d.cool <= 0 && d.dist < 420 && d.tellT <= 0) this.beginTell(s, def.tell);
      } else if (b === 'orbit') {
        want = lerp(def.orbit[0], def.orbit[1], (Math.sin(d.phase * 0.5) + 1) * 0.5);
        var radial = (d.dist - want) / 90;
        vx = d.toPX * clamp(radial, -1, 1) + (-d.toPY) * d.orbitDir * 0.9;
        vy = d.toPY * clamp(radial, -1, 1) + (d.toPX) * d.orbitDir * 0.9;
        if (d.cool <= 0 && d.tellT <= 0) this.beginTell(s, def.tell);
      } else if (b === 'lob' || b === 'snipe') {
        var so = def.standoff;
        if (d.dist < so[0]) { vx = -d.toPX; vy = -d.toPY; }
        else if (d.dist > so[1]) { vx = d.toPX; vy = d.toPY; }
        else { vx = -d.toPY * 0.6 * d.orbitDir; vy = d.toPX * 0.6 * d.orbitDir; }
        if (d.cool <= 0 && d.tellT <= 0 && d.dist < (def.lanceRange || 999)) {
          if (b === 'snipe' && this.lineBlocked(d.x, d.y, pd.x, pd.y) < 0.98) {
            d.cool = 0.5;
          } else {
            this.beginTell(s, def.tell);
            if (b === 'snipe') { d.aimA = d.facing; }
          }
        }
      } else if (b === 'brace') {
        if (d.dist > 150) { vx = d.toPX; vy = d.toPY; }
        else { vx = -d.toPX * 0.25; vy = -d.toPY * 0.25; }
        if (d.cool <= 0 && d.dist < 190 && d.tellT <= 0) this.beginTell(s, def.tell);
      }

      var sp = d.speed * (d.tellT > 0 ? 0.25 : 1);
      var m = len(vx, vy);
      if (m > 0.001) { vx /= m; vy /= m; }
      d.x += (vx * sp + d.kbx) * dt;
      d.y += (vy * sp + d.kby) * dt;
    },

    beginTell: function (s, secs) {
      s.d.tellT = secs || 0.5;
      s.d.tellMax = s.d.tellT;
      if (s.d.def && s.d.def.behaviour === 'snipe') s.d.aimA = s.d.facing;
    },

    commitAttack: function (s) {
      var d = s.d, def = d.def, pd = this.player.d, i, a;
      if (!def) return;
      if (def.behaviour === 'dash') {
        d.dashT = def.dashTime;
        d.dashX = d.toPX; d.dashY = d.toPY;
        sfx('dash', 0.5, 1.1);
      } else if (def.behaviour === 'orbit') {
        for (i = 0; i < (def.shots || 1); i++) {
          a = d.facing + (i / Math.max(1, (def.shots || 1) - 1) - 0.5) * def.spread;
          this.spawnEBullet(d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r,
            Math.cos(a) * def.shotSpeed, Math.sin(a) * def.shotSpeed, def.shotDmg, def.bullet, 3.0);
        }
        sfx('enemy_shoot', 0.5);
        d.cool = def.cooldown[0] + this.rng() * (def.cooldown[1] - def.cooldown[0]);
      } else if (def.behaviour === 'lob') {
        this.spawnMortar(d, pd.x, pd.y, def);
        sfx('enemy_shoot', 0.55, 0.8);
        d.cool = def.cooldown[0] + this.rng() * (def.cooldown[1] - def.cooldown[0]);
      } else if (def.behaviour === 'snipe') {
        this.lanceShot(s, def);
        d.cool = def.cooldown[0] + this.rng() * (def.cooldown[1] - def.cooldown[0]);
      } else if (def.behaviour === 'brace') {
        this.shockwave(d, def);
        d.cool = def.cooldown[0] + this.rng() * (def.cooldown[1] - def.cooldown[0]);
      }
    },

    lanceShot: function (s, def) {
      var d = s.d, a = d.aimA == null ? d.facing : d.aimA;
      var stop = this.lineBlocked(d.x, d.y, d.x + Math.cos(a) * def.lanceRange, d.y + Math.sin(a) * def.lanceRange);
      var range = def.lanceRange * stop;
      var pd = this.player.d;
      var dx = pd.x - d.x, dy = pd.y - d.y;
      var along = dx * Math.cos(a) + dy * Math.sin(a);
      var across = Math.abs(dx * Math.sin(a) - dy * Math.cos(a));
      if (along > 0 && along < range && across < pd.r + def.lanceWidth * 0.5) {
        this.damagePlayer(def.lanceDmg, Math.cos(a) * 220, Math.sin(a) * 220, 'lance');
      }
      var b = null, i;
      for (i = 0; i < this.beams.length; i++) if (!this.beams[i].on) { b = this.beams[i]; break; }
      if (b) { b.on = 1; b.x = d.x; b.y = d.y; b.a = a; b.r = range; b.w = def.lanceWidth;
               b.life = b.max = 0.24; b.col = def.color; }
      sfx('fire_rail', 0.42, 1.25);
    },

    shockwave: function (d, def) {
      var pd = this.player.d, dd = len(pd.x - d.x, pd.y - d.y);
      if (dd < def.waveRadius) {
        var nx = (pd.x - d.x) / (dd || 1), ny = (pd.y - d.y) / (dd || 1);
        this.damagePlayer(def.waveDmg, nx * def.wavePush, ny * def.wavePush, 'shock');
      }
      this.spawnFx('telegraph', d.x, d.y, 0, 0.34, def.waveRadius / 48);
      this.burst(this.emSpark, d.x, d.y, 14, def.color);
      sfx('dash', 0.6, 0.75);
      this.shake(3, 160);
    },

    spawnEBullet: function (x, y, vx, vy, dmg, frame, life, mortar, tx, ty, radius) {
      var s = this.grab(this.pool.ebullets, 'ebullet');
      if (!s) return null;
      resetEntity(s.d);
      s.d.x = x; s.d.y = y; s.d.vx = vx; s.d.vy = vy;
      s.d.dmg = dmg; s.d.life = life || 3.0; s.d.r = mortar ? 9 : 7;
      s.d.mortar = mortar || 0;
      s.d.tx = tx || 0; s.d.ty = ty || 0; s.d.blast = radius || 0;
      s.d.total = s.d.life;
      s.setActive(true).setVisible(true);
      s.setTexture('atlas', frame || 'orb_violet');
      s.setPosition(x, y);
      s.setRotation(Math.atan2(vy, vx));
      s.setScale(1);
      s.setAlpha(1);
      s.clearTint();
      return s;
    },

    spawnMortar: function (d, tx, ty, def) {
      var flight = def.lobTime;
      var vx = (tx - d.x) / flight, vy = (ty - d.y) / flight;
      var s = this.spawnEBullet(d.x, d.y, vx, vy, def.lobDmg, def.bullet || 'mortar',
        flight, 1, tx, ty, def.lobRadius);
      if (!s) return;
      // painted landing ring: the telegraph the player reads, not the shell
      var m = this.spawnFx('telegraph', tx, ty, 0, flight, def.lobRadius / 48);
      if (m) { m.setAlpha(0.55); m.setBlendMode(Phaser.BlendModes.NORMAL); m.d.ring = 1; }
    },

    // ------------------------------------------------------------ boss
    stepBoss: function (s, dt) {
      var d = s.d, B = D.BOSS, pd = this.player.d, ph, i, a, want;
      var frac = d.hp / d.maxHp;
      // phase promotion: never demote, so a heal cannot rewind the fight
      for (i = B.phases.length - 1; i >= 0; i--) {
        if (frac <= B.phases[i].at && i > d.phaseIdx) { this.bossPhase(s, i); break; }
      }
      ph = B.phases[clamp(d.phaseIdx, 0, B.phases.length - 1)];
      d.speed = ph.speed;

      if (d.chargeT > 0) {
        d.chargeT -= dt;
        d.x += d.chargeX * ph.chargeSpeed * dt;
        d.y += d.chargeY * ph.chargeSpeed * dt;
        if (d.dist < d.r + pd.r + 10) {
          this.damagePlayer(ph.chargeDmg, d.chargeX * 340, d.chargeY * 340, 'charge');
        }
        this.emTrail.setParticleTint(0xff76a2);
        this.emTrail.emitParticleAt(d.x - d.chargeX * 30, d.y - d.chargeY * 30, 1);
        if (d.chargeT <= 0) {
          if (d.tripleChain && d.tripleLeft > 0) {
            d.tripleLeft--;
            d.tellT = d.tellMax = ph.tell;
            d.pendingPat = 'triple';
          } else {
            d.tripleChain = 0;
            d.tripleLeft = 0;
            d.cool = ph.gap[0];
          }
        }
        this.resolveBody(d);
        return;
      }

      if (d.tellT > 0) {
        d.tellT -= dt;
        if (d.tellT <= 0) this.bossCommit(s, ph);
        // creep toward the player while winding up
        d.x += d.toPX * ph.speed * 0.25 * dt;
        d.y += d.toPY * ph.speed * 0.25 * dt;
        return;
      }

      // reposition: hold a mid ring around the player
      want = 210;
      var radial = clamp((d.dist - want) / 120, -1, 1);
      var vx = d.toPX * radial - d.toPY * 0.55;
      var vy = d.toPY * radial + d.toPX * 0.55;
      var m = len(vx, vy) || 1;
      d.x += (vx / m * ph.speed + d.kbx) * dt;
      d.y += (vy / m * ph.speed + d.kby) * dt;

      d.cool -= dt;
      if (d.cool <= 0) {
        d.tellT = d.tellMax = ph.tell;
        d.pendingPat = ph.patterns[d.patIdx % ph.patterns.length];
        d.patIdx++;
      }
    },

    bossPhase: function (s, idx) {
      var d = s.d, B = D.BOSS;
      d.phaseIdx = idx;
      d.cool = 0.7;
      d.tellT = 0;
      d.anim = idx >= 2 ? 'scuzz_fury' : (idx === 1 ? 'scuzz_spiral' : 'scuzz_move');
      s.setTexture('atlas', idx >= 2 ? 'scuzz2' : 'scuzz1');
      s.play(d.anim);
      this.notice('SCUZZ // ' + B.phases[idx].name, 0.9, 1);
      sfx('boss_roar', 0.85, 1 + idx * 0.06);
      this.shake(7, 420);
      this.burst(this.emDeath, d.x, d.y, 26, 0xff76a2);
    },

    bossCommit: function (s, ph) {
      var d = s.d, i, j, a, k, pool, p;
      var pat = d.pendingPat || 'spray';
      if (pat === 'charge') {
        d.chargeT = ph.chargeTime;
        d.chargeX = d.toPX; d.chargeY = d.toPY;
        sfx('dash', 0.9, 0.7);
        this.shake(4, 200);
      } else if (pat === 'spray') {
        for (i = 0; i < ph.sprayCount; i++) {
          a = i / ph.sprayCount * Math.PI * 2 + d.phase * 0.3;
          this.spawnEBullet(d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r,
            Math.cos(a) * ph.spraySpeed, Math.sin(a) * ph.spraySpeed, ph.sprayDmg, 'orb_magenta', 3.4);
        }
        sfx('enemy_shoot', 0.9, 0.7);
      } else if (pat === 'spiral') {
        for (j = 0; j < ph.spiralArms; j++) {
          for (i = 0; i < 3; i++) {
            a = d.phase * 1.4 + j / ph.spiralArms * Math.PI * 2 + i * 0.14;
            this.spawnEBullet(d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r,
              Math.cos(a) * ph.spiralSpeed, Math.sin(a) * ph.spiralSpeed, ph.spiralDmg, 'orb_magenta', 3.6);
          }
        }
        sfx('enemy_shoot', 0.9, 0.62);
      } else if (pat === 'ring') {
        for (i = 0; i < ph.ringCount; i++) {
          a = i / ph.ringCount * Math.PI * 2;
          this.spawnEBullet(d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r,
            Math.cos(a) * ph.ringSpeed, Math.sin(a) * ph.ringSpeed, ph.ringDmg, 'orb_red', 4.0);
        }
        this.spawnFx('telegraph', d.x, d.y, 0, 0.4, 2.4);
        sfx('boss_hit', 0.8, 0.7);
      } else if (pat === 'triple') {
        if (!d.tripleChain) {
          d.tripleChain = 1;
          d.tripleLeft = ph.tripleCount || 3;
        }
        d.chargeT = ph.chargeTime;
        d.chargeX = d.toPX; d.chargeY = d.toPY;
        sfx('dash', 1.0, 0.65);
      } else if (pat === 'summon') {
        pool = ph.summon || ['rusher'];
        for (i = 0; i < (ph.summonCount || 2); i++) {
          k = pool[i % pool.length];
          a = i / (ph.summonCount || 2) * Math.PI * 2;
          p = { x: d.x + Math.cos(a) * (d.r + 40), y: d.y + Math.sin(a) * (d.r + 40) };
          if (!this.spawnEnemy(k, p.x, p.y, false)) this.run.spawnQueue.push(k);
        }
        this.burst(this.emSpark, d.x, d.y, 20, 0xc68eff);
        sfx('unlock', 0.6, 0.8);
      }
      if (pat !== 'charge' && pat !== 'triple') {
        d.cool = ph.gap[0] + this.rng() * (ph.gap[1] - ph.gap[0]);
      }
      d.pendingPat = null;
    },

    // -------------------------------------------------------- projectiles
    stepBullets: function (dt) {
      var i, j, s, d, e, ed, hit, t, nx, ny;
      for (i = 0; i < this.pool.bullets.length; i++) {
        s = this.pool.bullets[i];
        if (!s.active) continue;
        d = s.d;
        d.life -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        if (d.x < 4 || d.x > this.arena.w - 4) {
          if (d.bounces > 0) { d.vx = -d.vx; d.bounces--; this.bounceFx(d); }
          else d.life = 0;
          d.x = clamp(d.x, 4, this.arena.w - 4);
        }
        if (d.y < 4 || d.y > this.arena.h - 4) {
          if (d.bounces > 0) { d.vy = -d.vy; d.bounces--; this.bounceFx(d); }
          else d.life = 0;
          d.y = clamp(d.y, 4, this.arena.h - 4);
        }
        if (this.blocked(d.x, d.y, 3)) {
          var prop = this.propAt(d.x, d.y, 3);
          if (prop && prop.barrel) this.hitBarrel(prop, d.dmg);
          if (d.bounces > 0) {
            d.vx = -d.vx; d.vy = -d.vy; d.bounces--;
            d.x += d.vx * dt * 1.6; d.y += d.vy * dt * 1.6;
            this.bounceFx(d);
          } else d.life = 0;
        }

        if (d.life > 0) {
          for (j = 0; j < this.pool.enemies.length; j++) {
            e = this.pool.enemies[j];
            if (!e.active) continue;
            ed = e.d;
            if (len(d.x - ed.x, d.y - ed.y) < d.r + ed.r) {
              this.damageEnemy(e, d.dmg, Math.atan2(d.vy, d.vx), d.weapon);
              if (d.bounces > 0) {
                d.vx = -d.vx; d.vy = -d.vy; d.bounces--;
                d.x += d.vx * dt * 2;
                this.bounceFx(d);
              } else d.life = 0;
              break;
            }
          }
        }
        if (d.life <= 0) { s.setActive(false).setVisible(false); s.setPosition(-999, -999); }
      }
    },

    propAt: function (x, y, r) {
      var i, p, cx, cy;
      for (i = 0; i < this.props.length; i++) {
        p = this.props[i];
        if (!p.solid) continue;
        if (p.kind === 'circle') { if (len(x - p.x, y - p.y) < p.r + r) return p; }
        else {
          cx = clamp(x, p.x, p.x + p.w);
          cy = clamp(y, p.y, p.y + p.h);
          if (len(x - cx, y - cy) < r) return p;
        }
      }
      return null;
    },

    bounceFx: function (d) {
      this.burst(this.emSpark, d.x, d.y, 3, 0xffcd6e);
      sfx('ui_tick', 0.25, 1.3);
    },

    hitBarrel: function (p, dmg) {
      var i, e, ed, dd;
      if (p.hp == null) return;
      p.hp -= dmg;
      if (p.hp > 0) { if (p.spr && p.spr.setTintFill) { p.spr.setTintFill(0xffffff); this.timeClear(p.spr); } return; }
      p.solid = 0;
      if (p.spr) p.spr.setVisible(false);
      this.burst(this.emDeath, p.x, p.y, 22, 0xff9c68);
      this.burst(this.emSmoke, p.x, p.y, 8, 0x886050);
      this.shake(6, 260);
      sfx('elite_death', 0.9, 0.8);
      for (i = 0; i < this.pool.enemies.length; i++) {
        e = this.pool.enemies[i];
        if (!e.active) continue;
        ed = e.d;
        dd = len(ed.x - p.x, ed.y - p.y);
        if (dd < 150) {
          this.damageEnemy(e, 60 * (1 - dd / 150), Math.atan2(ed.y - p.y, ed.x - p.x), 'barrel');
          ed.kbx += (ed.x - p.x) / (dd || 1) * 320;
          ed.kby += (ed.y - p.y) / (dd || 1) * 320;
        }
      }
      dd = len(this.player.d.x - p.x, this.player.d.y - p.y);
      if (dd < 130) this.damagePlayer(14 * (1 - dd / 130), 0, 0, 'barrel');
      this.spawnRing(p.x, p.y, 0xff9c68, 0.9);
    },

    timeClear: function (spr) {
      this.time.delayedCall(70, function () { if (spr && spr.clearTint) spr.clearTint(); });
    },

    stepEBullets: function (dt) {
      var i, s, d, pd = this.player.d, rr;
      for (i = 0; i < this.pool.ebullets.length; i++) {
        s = this.pool.ebullets[i];
        if (!s.active) continue;
        d = s.d;
        d.life -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        if (d.mortar) {
          if (d.life <= 0) {
            this.mortarBlast(d);
            s.setActive(false).setVisible(false); s.setPosition(-999, -999);
            continue;
          }
        } else {
          if (d.life <= 0 || d.x < 2 || d.y < 2 || d.x > this.arena.w - 2 || d.y > this.arena.h - 2
              || this.blocked(d.x, d.y, 3)) {
            this.burst(this.emSpark, d.x, d.y, 2, 0xc68eff);
            s.setActive(false).setVisible(false); s.setPosition(-999, -999);
            continue;
          }
          rr = d.r + pd.r;
          if (!pd.dead && len(d.x - pd.x, d.y - pd.y) < rr) {
            this.damagePlayer(d.dmg, d.vx * 0.5, d.vy * 0.5, 'bullet');
            s.setActive(false).setVisible(false); s.setPosition(-999, -999);
          }
        }
      }
    },

    mortarBlast: function (d) {
      var pd = this.player.d, dd = len(pd.x - d.tx, pd.y - d.ty);
      this.burst(this.emDeath, d.tx, d.ty, 16, 0xffcd6e);
      this.burst(this.emSmoke, d.tx, d.ty, 5, 0x776048);
      this.spawnFx('telegraph', d.tx, d.ty, 0, 0.26, (d.blast || 60) / 48);
      this.shake(3.5, 180);
      sfx('boss_hit', 0.55, 1.15);
      if (dd < (d.blast || 60)) this.damagePlayer(d.dmg, (pd.x - d.tx) * 2, (pd.y - d.ty) * 2, 'mortar');
    },

    stepBeams: function (dt) {
      var i, b;
      for (i = 0; i < this.beams.length; i++) {
        b = this.beams[i];
        if (!b.on) continue;
        b.life -= dt;
        if (b.life <= 0) b.on = 0;
      }
    },

    stepFx: function (dt) {
      var i, s;
      for (i = 0; i < this.pool.fx.length; i++) {
        s = this.pool.fx[i];
        if (!s.active) continue;
        s.d.life -= dt;
        if (s.d.life <= 0) { s.setActive(false).setVisible(false); s.setPosition(-999, -999); }
      }
    },

    stepHazards: function (dt) {
      var i, h, t;
      for (i = 0; i < this.hazards.length; i++) {
        h = this.hazards[i];
        if (h.type !== 'vent') continue;
        t = (this.simT + h.phase) % h.period;
        h.hot = t > h.period * 0.55 ? 1 : 0;
        h.warn = (!h.hot && t > h.period * 0.40) ? 1 : 0;
      }
    },

    stepPickups: function (dt) {
      var i, s, d, pd = this.player.d, dd, nx, ny;
      this.flushPendingDrops();
      for (i = 0; i < this.pool.pickups.length; i++) {
        s = this.pool.pickups[i];
        if (!s.active) continue;
        d = s.d;
        d.life -= dt;
        d.spin += dt * 2.4;
        dd = len(pd.x - d.x, pd.y - d.y);
        if (dd < 150) {
          nx = (pd.x - d.x) / (dd || 1); ny = (pd.y - d.y) / (dd || 1);
          d.x += nx * (170 - dd) * 1.5 * dt;
          d.y += ny * (170 - dd) * 1.5 * dt;
        }
        if (dd < pd.r + 20) { this.collect(s); continue; }
        if (d.life <= 0) { s.setActive(false).setVisible(false); s.setPosition(-999, -999); }
      }
    },

    flushPendingDrops: function () {
      var i, free, item;
      if (!this.pendingDrops || !this.pendingDrops.length) return;
      for (i = 0; i < this.pool.pickups.length; i++) {
        if (!this.pool.pickups[i].active) { free = true; break; }
      }
      if (!free) return;
      item = this.pendingDrops.shift();
      this.dropAt(item.x, item.y, item.what);
    },

    collect: function (s) {
      var d = s.d, pd = this.player.d;
      if (d.kind === 'health') {
        pd.hp = Math.min(pd.maxHp, pd.hp + 26);
        sfx('pickup_health', 0.85);
      } else if (d.kind === 'mult') {
        this.bumpMult(1);
        sfx('pickup_mult', 0.85);
      } else {
        var w = look(D.WEAPONS, d.kind, 'spread');
        pd.weapon = w.key;
        pd.weaponT = D.WEAPON_TIME || 15;
        pd.fireT = 0;
        sfx('pickup_weapon', 0.9);
        this.notice(w.label + ' ONLINE', 0.9);
      }
      this.burst(this.emStar, d.x, d.y, 8, 0xffffff);
      this.spawnRing(d.x, d.y, d.kind === 'health' ? 0x96ffb0 : (d.kind === 'mult' ? 0xffe082 : 0x7aeeff), 0.62);
      if (this.tutorial) this.tutorial.flags.picked = 1;
      s.setActive(false).setVisible(false);
      s.setPosition(-999, -999);
    },

    dropAt: function (x, y, what) {
      var s, kind = what, frame, rot = D.WEAPON_ROTATION || ['beam'], i, a, rr, px, py, found = false;
      if (what === 'weapon') kind = rot[Math.floor(this.rng() * rot.length)] || 'beam';
      px = clamp(x, 30, this.arena.w - 30);
      py = clamp(y, 30, this.arena.h - 30);
      for (i = 0; i < 18; i++) {
        if (i === 0) { a = 0; rr = 0; }
        else { a = i * 2.399963; rr = 18 + Math.floor((i - 1) / 6) * 24; }
        var tx = clamp(px + Math.cos(a) * rr, 30, this.arena.w - 30);
        var ty = clamp(py + Math.sin(a) * rr, 30, this.arena.h - 30);
        if (!this.blocked(tx, ty, 12)) { px = tx; py = ty; found = true; break; }
      }
      if (!found) {
        px = this.player.d.x; py = this.player.d.y;
        found = !this.blocked(px, py, 12);
      }
      if (!found) {
        if (this.pendingDrops.length < 64) this.pendingDrops.push({ x: x, y: y, what: what });
        return null;
      }
      s = this.grab(this.pool.pickups, 'pickup');
      if (!s) {
        if (this.pendingDrops.length < 64) this.pendingDrops.push({ x: x, y: y, what: what });
        return null;
      }
      if (kind === 'health') frame = 'pk_health';
      else if (kind === 'mult') frame = 'pk_mult';
      else frame = 'pk_' + kind;
      if (!this.textures.getFrame('atlas', frame)) frame = 'pk_beam';
      resetEntity(s.d);
      s.d.kind = kind;
      s.d.x = px;
      s.d.y = py;
      s.d.life = 26;
      s.d.spin = 0;
      s.setActive(true).setVisible(true);
      s.setTexture('atlas', frame);
      s.setPosition(s.d.x, s.d.y);
      s.setScale(1);
      s.setAlpha(1);
      s.clearTint();
      return s;
    },

    rollDrops: function (d) {
      var DR = D.DROPS || {}, pd = this.player.d, mul = this.mode.dropMul || 1;
      var hurt = pd.hp / pd.maxHp < (DR.healthHurtBelow || 0.7);
      var pHealth = (hurt ? (DR.healthHurt || 0.46) : (DR.health || 0.26)) * mul;
      if (this.rng() < pHealth) this.dropAt(d.x, d.y, 'health');
      if (this.rng() < (DR.mult || 0.22) * mul) this.dropAt(d.x + 16, d.y, 'mult');
      if (this.rng() < (DR.weapon || 0.12) * mul) this.dropAt(d.x - 16, d.y, 'weapon');
    },

    // ------------------------------------------------------ enemy damage
    damageEnemy: function (s, amount, incoming, weapon) {
      var d = s.d, def = d.def;
      if (!s.active || d.hp <= 0) return;
      var mul = 1, weak = false;

      if (d.boss) {
        var rear = Math.abs(angDiff(incoming, d.facing)) < (D.BOSS.rearArc || 1.0);
        // incoming travels roughly the same way the boss faces = hit the vent
        mul = rear ? (D.BOSS.rearMul || 2.2) : (D.BOSS.frontMul || 0.42);
        weak = rear;
      } else if (def && def.behaviour === 'brace') {
        var front = Math.abs(angDiff(incoming, d.facing + Math.PI)) < (def.frontArc || 1.1);
        if (front) {
          mul = def.frontMul || 0.15;
          this.burst(this.emSpark, d.x + Math.cos(d.facing) * d.r, d.y + Math.sin(d.facing) * d.r, 3, 0x68e2dc);
        }
      }

      d.hp -= amount * mul;
      d.hitT = 0.11;
      d.kbx += Math.cos(incoming) * (d.boss ? 26 : 150);
      d.kby += Math.sin(incoming) * (d.boss ? 26 : 150);
      this.burst(this.emHit, d.x, d.y, weak ? 6 : 2, weak ? 0xffe082 : ((def && def.color) || 0xffffff));
      kit.juice.hitStop(d.hp <= 0 ? 82 : (d.boss ? 58 : 42));
      if (d.boss) {
        sfx('boss_hit', 0.3, weak ? 1.15 : 0.9);
        this.spawnRing(d.x, d.y, weak ? 0xffe082 : 0xff76a2, weak ? 0.7 : 0.45);
        if (weak) this.notice('WEAK', 0.8, 1);
      }
      if (d.hp <= 0) this.killEnemy(s, false);
    },

    killEnemy: function (s, silent) {
      var d = s.d, def = d.def, i, a, kx, ky;
      if (!s.active) return;
      s.setActive(false).setVisible(false);
      s.setPosition(-999, -999);
      this.run.kills++;
      this.bumpMult(1);
      this.run.multT = (D.MULT && D.MULT.killGrace) || (D.MULT && D.MULT.decay) || 7;

      if (d.boss) {
        this.addScore(D.BOSS.score, d.x, d.y - 40);
        this.burst(this.emDeath, d.x, d.y, 46, 0xff76a2);
        this.burst(this.emSmoke, d.x, d.y, 14, 0x7a3f60);
        this.spawnRing(d.x, d.y, 0xff76a2, 1.45);
        this.shake(12, 700);
        kit.juice.hitStop(120);
        sfx('boss_death', 1.0);
        this.run.bossAlive = null;
        for (i = 0; i < (D.DROPS.bossHealth || 3); i++) {
          a = i / 3 * Math.PI * 2;
          this.dropAt(d.x + Math.cos(a) * 70, d.y + Math.sin(a) * 70, 'health');
        }
        for (i = 0; i < (D.DROPS.bossMult || 2); i++) this.dropAt(d.x + (i ? 50 : -50), d.y + 60, 'mult');
        this.dropAt(d.x, d.y - 70, 'weapon');
        kit.audio.music(this.arena.music || 'music_arena', 900);
        return;
      }

      this.addScore((def && def.score) || 25, d.x, d.y - 20);
      this.burst(this.emDeath, d.x, d.y, def && def.small ? 6 : 12, (def && def.color) || 0xffffff);
      this.burst(this.emHit, d.x, d.y, 6, (def && def.color) || 0xffffff);
      this.spawnRing(d.x, d.y, (def && def.color) || 0xffffff, def && def.small ? 0.42 : 0.68);
      if (!silent) sfx((def && def.deathSfx) || 'enemy_death', 0.55, 0.94 + this.rng() * 0.12);
      this.shake(def && def.small ? 0.8 : 1.8, 90);
      if (this.tutorial) this.tutorial.flags.killed = 1;

      if (def && def.splitInto) {
        for (i = 0; i < (def.splitCount || 2); i++) {
          a = i / (def.splitCount || 2) * Math.PI * 2 + this.rng();
          kx = d.x + Math.cos(a) * 22; ky = d.y + Math.sin(a) * 22;
          if (!this.spawnEnemy(def.splitInto, kx, ky, true)) this.run.spawnQueue.push(def.splitInto);
        }
      }
      this.rollDrops(d);
    },

    // -------------------------------------------------------- tutorial
    stepTutorial: function (dt) {
      var T = D.TUTORIAL || [], t = this.tutorial, cur;
      if (!t) return;
      if (t.i >= T.length) {
        save.tut = 1; persist();
        this.tutorial = null;
        return;
      }
      cur = T[t.i];
      t.t += dt;
      if (!t.shown) {
        t.shown = 1;
        this.coach(cur.text, 3);
        if (cur.id === 'pickup') this.dropAt(this.player.d.x + 130, this.player.d.y, 'weapon');
      }
      if (t.flags[cur.done] || (cur.optional && t.t > 14)) {
        t.i++;
        t.shown = 0;
        t.t = 0;
        if (t.i < T.length) sfx('ui_tick', 0.5, 1.2);
      }
    },

    // The Hud scene is launched from create() and its own create() runs a
    // frame later, so the first notice would land on a half-built scene.
    // Anything raised before the Hud is ready is parked and flushed.
    queueNotice: function (notice) {
      if (!notice || !notice.text) return;
      if (this.hud && this.hud.ready) {
        this.hud.enqueueNotice(notice);
      } else if (this.pendingNotices.length < 4) {
        this.pendingNotices.push(notice);
      }
    },
    coach: function (text, secs) {
      this.queueNotice({ kind: 'coach', text: text, secs: Math.min(secs || 3, 3) });
    },
    notice: function (text, secs, boss) {
      this.queueNotice({ kind: 'chip', text: text, secs: Math.min(secs || 1, 1), boss: !!boss });
    },
    flushHud: function () {
      var notice;
      if (!this.hud || !this.hud.ready) return;
      while (this.pendingNotices.length) {
        notice = this.pendingNotices.shift();
        this.hud.enqueueNotice(notice);
      }
    },
    // All shake and hit-stop goes through GGKit's juice bus, which the
    // accessibility toggle in kit.openSettings() gates. Reduced-motion users
    // start with that toggle already off (see the boot block below).
    shake: function (mag, ms) { kit.juice.shake(mag, ms); },

    // ----------------------------------------------------------- render
    renderAll: function (j) {
      var i, s, d, cam = this.cameras.main, pd = this.player.d;
      if (this.pendingNotices.length) this.flushHud();

      if (j && j.frozen) {
        if (!this.visualPauseSet) {
          this.visualPauseSet = true;
          if (this.player.anims && this.player.anims.pause) this.player.anims.pause();
          for (i = 0; i < this.pool.enemies.length; i++) {
            if (this.pool.enemies[i].active && this.pool.enemies[i].anims && this.pool.enemies[i].anims.pause) {
              this.pool.enemies[i].anims.pause();
            }
          }
        }
        cam.setFollowOffset(-(j.dx || 0), -(j.dy || 0));
        return;
      }
      if (this.visualPauseSet) {
        this.visualPauseSet = false;
        if (this.player.anims && this.player.anims.resume) this.player.anims.resume();
        for (i = 0; i < this.pool.enemies.length; i++) {
          if (this.pool.enemies[i].anims && this.pool.enemies[i].anims.resume) this.pool.enemies[i].anims.resume();
        }
      }

      // player
      this.player.setPosition(pd.x, pd.y);
      this.player.setRotation(pd.aim);
      var playerAnim = pd.flash > 0 ? 'player_hit' : (this.ctl.fire ? 'player_fire' : (pd.moving ? 'player_move' : 'player_idle'));
      if (pd.anim !== playerAnim) { pd.anim = playerAnim; this.player.play(playerAnim); }
      this.player.setAlpha(pd.iframe > 0 ? (Math.floor(this.simT * 22) % 2 ? 0.4 : 1) : 1);
      if (pd.flash > 0) this.player.setTintFill(0xffffff); else this.player.clearTint();
      this.shieldSpr.setPosition(pd.x, pd.y);
      setVisIf(this.shieldSpr, pd.iframe > 0);
      if (pd.iframe > 0) this.shieldSpr.setAlpha(clamp(pd.iframe * 1.6, 0, 0.8));

      // enemies
      for (i = 0; i < this.pool.enemies.length; i++) {
        s = this.pool.enemies[i];
        if (!s.active) continue;
        d = s.d;
        s.setPosition(d.x, d.y);
        s.setRotation(d.boss ? d.facing : d.facing);
        var enemyAnim;
        if (d.boss) {
          enemyAnim = d.hitT > 0 ? 'scuzz_hit' : ((d.tellT > 0 || d.chargeT > 0) ? 'scuzz_attack' :
            (d.phaseIdx >= 2 ? 'scuzz_fury' : (d.phaseIdx === 1 ? 'scuzz_spiral' : 'scuzz_move')));
        } else {
          enemyAnim = d.hitT > 0 ? d.kind + '_hit' : (d.tellT > 0 ? d.kind + '_attack' : d.kind + '_move');
        }
        if (d.anim !== enemyAnim) { d.anim = enemyAnim; s.play(enemyAnim); }
        if (d.hitT > 0) s.setTintFill(0xffffff);
        else if (s.tintFill || s.isTinted) s.clearTint();
        if (this.arena.dark) {
          s.setAlpha(clamp((360 - d.dist) / 130, 0.10, 1));
        } else if (s.alpha !== 1) s.setAlpha(1);
      }

      // bullets / pickups / fx
      for (i = 0; i < this.pool.bullets.length; i++) {
        s = this.pool.bullets[i];
        if (s.active) { s.setPosition(s.d.x, s.d.y); }
      }
      for (i = 0; i < this.pool.ebullets.length; i++) {
        s = this.pool.ebullets[i];
        if (!s.active) continue;
        d = s.d;
        s.setPosition(d.x, d.y);
        if (d.mortar) {
          var f = 1 - d.life / (d.total || 1);
          s.setScale(1 + Math.sin(f * Math.PI) * 0.9);
        }
      }
      for (i = 0; i < this.pool.pickups.length; i++) {
        s = this.pool.pickups[i];
        if (!s.active) continue;
        d = s.d;
        s.setPosition(d.x, d.y);
        s.setScale(1 + Math.sin(d.spin * 2) * 0.08);
        s.setAlpha(d.life < 5 ? (Math.floor(d.life * 6) % 2 ? 0.35 : 1) : 1);
      }
      for (i = 0; i < this.pool.fx.length; i++) {
        s = this.pool.fx[i];
        if (!s.active) continue;
        var k = s.d.life / (s.d.max || 1);
        if (s.d.ringFx) {
          s.setAlpha(k);
          s.setScale(s.d.baseScale * (0.45 + 1.45 * easeOutBack(1 - k)));
        } else {
          s.setAlpha(s.d.ring ? 0.25 + 0.45 * (1 - k) : k);
        }
      }
      // hazards + telegraph overlay
      this.drawOverlay();

      // Camera motion is a small spring-damped lookahead and hit dip. It is
      // gated by the same accessibility switch as GGKit's shake.
      var camDt = this.renderDt || STEP;
      var cameraOn = kit.juice.enabled;
      var lookX = cameraOn ? clamp(this.ctl.move.x * 26 + pd.kbx * 0.04, -34, 34) : 0;
      var lookY = cameraOn ? clamp(this.ctl.move.y * 26 + pd.kby * 0.04, -24, 24) : 0;
      this.camVelX += (lookX - this.camLookX) * 220 * camDt - this.camVelX * 24 * camDt;
      this.camVelY += (lookY - this.camLookY) * 220 * camDt - this.camVelY * 24 * camDt;
      this.camLookX += this.camVelX * camDt;
      this.camLookY += this.camVelY * camDt;
      var dip = cameraOn && pd.hurtT > 0 ? 8 : 0;
      this.camDipVel += (dip - this.camDip) * 260 * camDt - this.camDipVel * 26 * camDt;
      this.camDip += this.camDipVel * camDt;
      var targetZoom = cameraOn && pd.moving ? 1.32 : 1.3;
      this.camZoom = lerp(this.camZoom, targetZoom, clamp(camDt * 7, 0, 1));
      cam.setZoom(RETINA_FACTOR * this.camZoom);
      cam.setFollowOffset(-(j.dx || 0) - this.camLookX, -(j.dy || 0) - this.camLookY - this.camDip);

      if (this.debugView) this.drawDebug(); else if (this.debugGfx.commandBuffer.length) this.debugGfx.clear();
    },

    drawOverlay: function () {
      var g = this.gfx, i, s, d, h, t, a;
      g.clear();

      // vent hazards pulse on the shared cycle
      for (i = 0; i < this.hazards.length; i++) {
        h = this.hazards[i];
        if (h.type === 'vent') {
          h.spr.setAlpha(h.hot ? 0.95 : (h.warn ? 0.6 : 0.3));
          h.spr.setScale((h.r * 2) / 64 * (h.hot ? 1.02 : 0.94));
          if (h.hot) {
            g.fillStyle(0xff5a3c, 0.22);
            g.fillCircle(h.x, h.y, h.r);
          } else if (h.warn) {
            g.lineStyle(3, 0xff8a5c, 0.7);
            g.strokeCircle(h.x, h.y, h.r * 0.96);
          }
        }
      }

      // enemy telegraphs: a shrinking ring for every wind-up, a cone for
      // the ones that commit to a straight line
      for (i = 0; i < this.pool.enemies.length; i++) {
        s = this.pool.enemies[i];
        if (!s.active) continue;
        d = s.d;
        if (d.tellT > 0 && d.tellMax > 0) {
          t = d.tellT / d.tellMax;
          a = 0.75 * (1 - t) + 0.25;
          g.lineStyle(3, d.boss ? 0xff76a2 : ((d.def && d.def.color) || 0xffffff), a);
          g.strokeCircle(d.x, d.y, d.r + 14 + t * 46);
          if (d.def && d.def.behaviour === 'snipe' && d.aimA != null) {
            g.lineStyle(2, d.def.color, 0.55);
            g.beginPath();
            g.moveTo(d.x, d.y);
            g.lineTo(d.x + Math.cos(d.aimA) * d.def.lanceRange, d.y + Math.sin(d.aimA) * d.def.lanceRange);
            g.strokePath();
          }
          if (d.def && d.def.behaviour === 'dash') {
            g.lineStyle(2, 0xff6d7c, 0.4);
            g.beginPath();
            g.moveTo(d.x, d.y);
            g.lineTo(d.x + d.toPX * 260, d.y + d.toPY * 260);
            g.strokePath();
          }
        }
        // small health pips over damaged enemies
        if (!d.boss && d.hp < d.maxHp) {
          var w = 30;
          g.fillStyle(0x0a1220, 0.8);
          g.fillRect(d.x - w / 2, d.y - d.r - 12, w, 4);
          g.fillStyle((d.def && d.def.color) || 0xffffff, 1);
          g.fillRect(d.x - w / 2, d.y - d.r - 12, w * clamp(d.hp / d.maxHp, 0, 1), 4);
        }
      }

      // beams
      for (i = 0; i < this.beams.length; i++) {
        var b = this.beams[i];
        if (!b.on) continue;
        var k = clamp(b.life / b.max, 0, 1);
        var ex = b.x + Math.cos(b.a) * b.r, ey = b.y + Math.sin(b.a) * b.r;
        g.lineStyle(b.w * (0.6 + k * 0.9), b.col, 0.28 * k);
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.strokePath();
        g.lineStyle(b.w * 0.34, 0xffffff, 0.9 * k);
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.strokePath();
      }
    },

    // Debug view walks the SAME pools the sim uses. There is no second
    // list of entities to fall out of sync.
    drawDebug: function () {
      var g = this.debugGfx, i, s, d;
      g.clear();
      g.lineStyle(1, 0x00ff88, 0.8);
      for (i = 0; i < this.props.length; i++) {
        var p = this.props[i];
        if (!p.solid) continue;
        if (p.kind === 'circle') g.strokeCircle(p.x, p.y, p.r);
        else g.strokeRect(p.x, p.y, p.w, p.h);
      }
      g.lineStyle(1, 0xff4488, 0.9);
      for (i = 0; i < this.pool.enemies.length; i++) {
        s = this.pool.enemies[i];
        if (!s.active) continue;
        g.strokeCircle(s.d.x, s.d.y, s.d.r);
      }
      g.lineStyle(1, 0x88ccff, 0.9);
      for (i = 0; i < this.pool.bullets.length; i++) {
        s = this.pool.bullets[i];
        if (s.active) g.strokeCircle(s.d.x, s.d.y, s.d.r);
      }
      g.lineStyle(1, 0xffcc44, 0.9);
      for (i = 0; i < this.pool.ebullets.length; i++) {
        s = this.pool.ebullets[i];
        if (s.active) g.strokeCircle(s.d.x, s.d.y, s.d.r);
      }
      g.lineStyle(1, 0x66ff99, 0.9);
      for (i = 0; i < this.pockets.length; i++) g.strokeCircle(this.pockets[i].x, this.pockets[i].y, this.pockets[i].r);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(this.player.d.x, this.player.d.y, this.player.d.r);
    },

    // ------------------------------------------------------- run ending
    endRun: function (won) {
      if (this.over) return;
      this.over = won ? 'clear' : 'dead';
      var p = progressFor(this.modeKey);
      var score = Math.floor(this.run.score);
      var medal = medalFor(this.modeKey, score);
      var newBest = score > p.best;
      var newMedal = MEDAL_RANK[medal] > MEDAL_RANK[p.medal];
      if (newBest) p.best = score;
      if (newMedal) p.medal = medal;
      if (won) p.cleared = 1;
      p.wave = Math.max(p.wave, this.run.wave);
      p.runs = (p.runs || 0) + 1;
      persist();

      hook.state.medal = medal;
      kit.audio.stopMusic(600);
      if (won) { sfx('victory', 1.0); this.shake(8, 500); }
      else { sfx('defeat', 1.0); }
      if (newMedal && medal !== 'none') this.time.delayedCall(700, function () { sfx('medal', 0.9); });

      var unlocked = [];
      var i, k;
      for (i = 0; i < (D.MODE_ORDER || []).length; i++) {
        k = D.MODE_ORDER[i];
        if (!save.hints['unlock_' + k] && modeUnlocked(k) && k !== 'standard') {
          save.hints['unlock_' + k] = 1;
          unlocked.push(look(D.MODES, k, 'standard').label);
        }
      }
      if (unlocked.length) { persist(); this.time.delayedCall(1100, function () { sfx('unlock', 0.9); }); }

      if (this.hud && this.hud.showResult) {
        this.hud.showResult({
          won: won, score: score, best: p.best, medal: medal, newBest: newBest,
          wave: this.run.wave, kills: this.run.kills, mode: this.mode.label,
          unlocked: unlocked, time: this.simT
        });
      }
    },

    restartRun: function () {
      kit.input.clearAll();
      kit.resume('menu');
      this.scene.stop('hud');
      this.scene.start('game', { mode: this.modeKey, arena: this.startArena, wave: 1 });
    },
    quitToMenu: function () {
      kit.input.clearAll();
      kit.resume('menu');
      kit.audio.stopMusic(300);
      this.scene.stop('hud');
      this.scene.start('menu');
    },

    // ----------------------------------------------------------- pause
    togglePause: function () {
      if (this.over) return;
      if (this.simPaused) kit.resume('menu'); else kit.pause('menu');
    },
    syncPause: function (on) {
      this.simPaused = on;
      this.acc = 0;
      if (this.ctl) this.ctl.reset();
      if (this.hud && this.hud.ready) this.hud.setPaused(on);
    },
    onKitPause: function () { this.syncPause(true); },
    onKitResume: function () { this.syncPause(false); }
  });

  function resetEntity(d) {
    // Full reset on every spawn. No field may survive a trip through the
    // pool, or a recycled entity inherits the last owner's render state.
    d.x = 0; d.y = 0; d.vx = 0; d.vy = 0; d.r = 8;
    d.hp = 0; d.maxHp = 0; d.dmg = 0; d.life = 0; d.max = 0; d.total = 0;
    d.speed = 0; d.cool = 0; d.phase = 0; d.facing = 0; d.dist = 0;
    d.toPX = 0; d.toPY = 0; d.kbx = 0; d.kby = 0; d.hitT = 0;
    d.tellT = 0; d.tellMax = 0; d.dashT = 0; d.dashX = 0; d.dashY = 0;
    d.chargeT = 0; d.chargeX = 0; d.chargeY = 0; d.phaseIdx = 0; d.patIdx = 0;
    d.pendingPat = null; d.aimA = null; d.orbitDir = 1; d.boss = 0; d.anim = null;
    d.bounces = 0; d.weapon = null; d.kind = null; d.def = null;
    d.mortar = 0; d.tx = 0; d.ty = 0; d.blast = 0; d.spin = 0; d.ring = 0;
    d.touchT = 0; d.tripleLeft = 0; d.tripleChain = 0;
    d.vy = 0; d.alive = 0;
  }

  // ==================================================== control surface
  // The sticks are claimed straight out of kit.input.pointers, and the zone
  // is stamped on the pointer THE FRAME IT APPEARS, so a pointer can never
  // be claimed twice or leak into the other stick.
  function makeControls(scene) {
    var ctl = {
      move: { x: 0, y: 0, mag: 0 },
      aim: { x: 1, y: 0, mag: 0 },
      fire: false,
      left: { on: 0, bx: 0, by: 0, x: 0, y: 0 },
      right: { on: 0, bx: 0, by: 0, x: 0, y: 0 },
      radius: 74,
      reset: function () {
        ctl.move.x = ctl.move.y = ctl.move.mag = 0;
        ctl.aim.mag = 0;
        ctl.fire = false;
        ctl.left.on = ctl.right.on = 0;
        kit.input.clearAll();
      }
    };

    function toGame(clientX, clientY) {
      var b = scene.scale.canvasBounds, s = scene.scale.displayScale;
      return { x: (clientX - b.x) * s.x, y: (clientY - b.y) * s.y };
    }

    ctl.sample = function (sc) {
      var it = kit.input.pointers, p, g, gs, k;
      var lFound = false, rFound = false;

      it.forEach(function (ptr) {
        if (!ptr.zone) {
          gs = toGame(ptr.startX, ptr.startY);
          // HUD furniture claims first so a pause tap never becomes a stick
          if (sc.hud && sc.hud.hitUI && sc.hud.hitUI(gs.x, gs.y)) { ptr.zone = 'ui'; return; }
          if (gs.x < VW * 0.5) ptr.zone = ctl.left.on ? 'ui' : 'L';
          else ptr.zone = ctl.right.on ? 'ui' : 'R';
          if (ptr.zone === 'L') { ctl.left.on = 1; ctl.left.bx = gs.x; ctl.left.by = gs.y; }
          if (ptr.zone === 'R') { ctl.right.on = 1; ctl.right.bx = gs.x; ctl.right.by = gs.y; }
        }
        if (ptr.zone === 'L') {
          lFound = true;
          g = toGame(ptr.x, ptr.y);
          ctl.left.x = g.x; ctl.left.y = g.y;
        } else if (ptr.zone === 'R') {
          rFound = true;
          g = toGame(ptr.x, ptr.y);
          ctl.right.x = g.x; ctl.right.y = g.y;
        }
      });
      if (!lFound) ctl.left.on = 0;
      if (!rFound) ctl.right.on = 0;

      // ------------------------------------------------------ movement
      var mx = 0, my = 0, mag = 0, dx, dy, l;
      if (ctl.left.on) {
        dx = ctl.left.x - ctl.left.bx;
        dy = ctl.left.y - ctl.left.by;
        l = len(dx, dy);
        if (l > 6) {
          mag = clamp(l / ctl.radius, 0, 1);
          mx = dx / l; my = dy / l;
        }
        // sliding base: a long drag re-anchors so the stick never runs out
        if (l > ctl.radius) {
          ctl.left.bx += (dx / l) * (l - ctl.radius);
          ctl.left.by += (dy / l) * (l - ctl.radius);
        }
      } else {
        if (kit.input.keyDown('KeyA') || kit.input.keyDown('KeyH')) mx -= 1;
        if (kit.input.keyDown('KeyD') || kit.input.keyDown('KeyL')) mx += 1;
        if (kit.input.keyDown('KeyW') || kit.input.keyDown('KeyK')) my -= 1;
        if (kit.input.keyDown('KeyS') || kit.input.keyDown('KeyJ')) my += 1;
        l = len(mx, my);
        if (l > 0) { mx /= l; my /= l; mag = 1; }
      }
      ctl.move.x = mx; ctl.move.y = my; ctl.move.mag = mag;

      // ----------------------------------------------------- aim + fire
      var ax = 0, ay = 0, amag = 0;
      if (ctl.right.on) {
        dx = ctl.right.x - ctl.right.bx;
        dy = ctl.right.y - ctl.right.by;
        l = len(dx, dy);
        if (l > 6) { ax = dx / l; ay = dy / l; amag = clamp(l / ctl.radius, 0, 1); }
        if (l > ctl.radius) {
          ctl.right.bx += (dx / l) * (l - ctl.radius);
          ctl.right.by += (dy / l) * (l - ctl.radius);
        }
        ctl.fire = amag > 0.16;
      } else {
        if (kit.input.keyDown('ArrowLeft')) ax -= 1;
        if (kit.input.keyDown('ArrowRight')) ax += 1;
        if (kit.input.keyDown('ArrowUp')) ay -= 1;
        if (kit.input.keyDown('ArrowDown')) ay += 1;
        l = len(ax, ay);
        if (l > 0) { ax /= l; ay /= l; amag = 1; }
        ctl.fire = amag > 0 || kit.input.keyDown('Space') || kit.input.keyDown('Enter');
      }
      if (amag > 0) { ctl.aim.x = ax; ctl.aim.y = ay; }
      ctl.aim.mag = amag;
      return ctl;
    };

    return ctl;
  }

  // =============================================================== Hud
  var HudScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HudScene() { Phaser.Scene.call(this, { key: 'hud', active: false }); },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var self = this;
      readSafeArea(this.scale);
      this.gs = this.scene.get('game');
      this.uiRects = [];
      this.paused = false;
      this.result = null;
      this.ready = false;

      var L = 18 + safe.left, T = 14 + safe.top;
      var scoreR = VW - 86 - safe.right;

      this.waveTxt = this.add.text(L, T, '', tstyle(18, '#eaf7ff')).setDepth(2);
      this.hpBack = this.add.graphics().setDepth(2);
      this.hpFill = this.add.graphics().setDepth(3);
      this.weaponIcon = this.add.image(L + 13, T + 62, 'atlas', 'pk_spread')
        .setDisplaySize(26, 26).setDepth(3);
      this.weaponMeter = this.add.graphics().setDepth(3);

      this.scoreTxt = this.add.text(scoreR, T + 4, '', tstyle(20, '#ffe082')).setOrigin(1, 0).setDepth(2);
      this.multTxt = this.add.text(scoreR, T + 29, '', tstyle(16, '#ff9c68')).setOrigin(1, 0).setDepth(2);
      this.timerTxt = this.add.text(VW / 2, T + 4, '', tstyle(16, '#ff9c68')).setOrigin(0.5, 0).setDepth(2);

      this.bossPlate = this.add.graphics().setDepth(2);

      // One transient surface for both event chips and the tutorial strip.
      // Chips live at the upper-right edge; coach text uses the same surface
      // as one thin top strip. The queue prevents overlap and stacking.
      this.noticeBg = this.add.graphics().setDepth(4);
      this.noticeTxt = this.add.text(0, 0, '', tstyle(16, '#dff2ff'))
        .setOrigin(0.5, 0.5).setDepth(5).setVisible(false);
      this.noticeT = 0;
      this.noticeMax = 0;
      this.noticeKind = '';
      this.noticeBoss = false;
      this.noticeQueue = [];
      this.weaponKey = '';
      this.damageVignette = this.add.graphics().setDepth(7);
      this.damageT = 0;

      // sticks
      this.stickL = this.add.image(-999, -999, 'atlas', 'stick_base').setDepth(6).setAlpha(0.5);
      this.knobL = this.add.image(-999, -999, 'atlas', 'stick_knob').setDepth(7).setAlpha(0.6);
      this.stickR = this.add.image(-999, -999, 'atlas', 'stick_base').setDepth(6).setAlpha(0.5);
      this.knobR = this.add.image(-999, -999, 'atlas', 'stick_knob').setDepth(7).setAlpha(0.6);

      // Night arena visibility. The mask sprite is transparent inside the
      // lamp circle and opaque out to its own corners; nightGfx fills the
      // rest of the screen around that square, so coverage is exact with no
      // second camera and no render texture. Lamp pools are punched back in
      // additively on top.
      this.night = this.add.image(-999, -999, 'nightmask').setDepth(0).setVisible(false);
      this.nightGfx = this.add.graphics().setDepth(0);
      this.lampPool = [];
      var li;
      for (li = 0; li < 8; li++) {
        this.lampPool.push(this.add.image(-999, -999, 'disc').setDepth(0.5)
          .setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd9a0).setVisible(false));
      }

      this.pauseBtn = this.button(VW - 24 - safe.right, T + 20, 48, 44, 'II', function () {
        self.gs.togglePause();
      }, 0x14283c, '#bfe3f2', 15);
      this.baseUIRectCount = this.uiRects.length;

      this.overlay = this.add.container(0, 0).setDepth(20).setVisible(false);
      this.overlayBg = this.add.graphics();
      this.overlay.add(this.overlayBg);
      this.overlayItems = [];

      this.ready = true;
      this.events.on('shutdown', function () { self.ready = false; self.uiRects.length = 0; });
      if (this.gs && this.gs.simPaused) this.setPaused(true);
    },

    button: function (cx, cy, w, h, label, cb, fill, col, size, claim) {
      var c = this.add.container(cx - w / 2, cy - h / 2).setDepth(21);
      var g = this.add.graphics();
      g.fillStyle(fill, 0.95);
      g.fillRoundedRect(0, 0, w, h, 10);
      g.lineStyle(1.5, 0x3d6a8c, 1);
      g.strokeRoundedRect(0, 0, w, h, 10);
      c.add(g);
      c.add(this.add.text(w / 2, h / 2, label, tstyle(size || 14, col || '#eaf7ff')).setOrigin(0.5));
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', function () { sfx('ui_tick', 0.6); cb(); });
      // Only permanent furniture claims a stick-blocking rect. Overlay
      // buttons do not need one: hitUI already blocks the whole screen
      // while an overlay is open.
      if (claim !== false) this.uiRects.push({ x: cx - w / 2, y: cy - h / 2, w: w, h: h });
      return c;
    },

    hitUI: function (x, y) {
      var i, r;
      for (i = 0; i < this.uiRects.length; i++) {
        r = this.uiRects[i];
        if (x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 8 && y <= r.y + r.h + 8) return true;
      }
      return this.paused || !!this.result;
    },

    flashDamage: function (strength) {
      this.damageT = Math.max(this.damageT, 0.34 + (strength || 1) * 0.16);
      this.damageMax = this.damageT;
    },

    enqueueNotice: function (notice) {
      var last;
      if (!notice || !notice.text) return;
      notice.kind = notice.kind === 'coach' ? 'coach' : 'chip';
      notice.secs = clamp(notice.secs || (notice.kind === 'coach' ? 3 : 1),
        0.6, notice.kind === 'coach' ? 3 : 1);
      last = this.noticeQueue[this.noticeQueue.length - 1];
      if ((this.noticeT > 0 && this.noticeTxt.text === notice.text)
          || (last && last.text === notice.text)) return;
      if (this.noticeT <= 0 && !this.noticeQueue.length) {
        this.startNotice(notice);
      } else if (this.noticeQueue.length < 4) {
        this.noticeQueue.push(notice);
      }
    },

    startNotice: function (notice) {
      this.noticeKind = notice.kind;
      this.noticeBoss = !!notice.boss;
      this.noticeT = notice.secs;
      this.noticeMax = notice.secs;
      setTextIf(this.noticeTxt, notice.text);
      this.noticeTxt.setVisible(true).setAlpha(1);
    },

    stepNotice: function (dt) {
      var next, fadeWindow, alpha, isCoach;
      if (this.noticeT <= 0) return;
      this.noticeT -= dt;
      isCoach = this.noticeKind === 'coach';
      fadeWindow = kit.juice.enabled ? (isCoach ? 0.65 : 0.22) : 0;
      alpha = fadeWindow ? clamp(this.noticeT / fadeWindow, 0, 1) : 1;
      this.noticeBg.clear();
      if (this.noticeT > 0) {
        var nw = Math.min(VW - 32 - safe.left - safe.right,
          this.noticeTxt.width + (isCoach ? 34 : 28));
        var nh = isCoach ? 30 : 26;
        var nx = isCoach ? VW / 2 : VW - 18 - safe.right - nw / 2;
        var ny = isCoach ? 14 + safe.top + 78 : 14 + safe.top + 70;
        this.noticeTxt.setPosition(nx, ny).setAlpha(alpha);
        this.noticeBg.fillStyle(this.noticeBoss ? 0x2a0f1e : 0x08131f, 0.82 * alpha);
        this.noticeBg.fillRoundedRect(nx - nw / 2, ny - nh / 2, nw, nh, nh / 2);
        this.noticeBg.lineStyle(1.5, this.noticeBoss ? 0xff76a2 : 0x7aeeff, 0.55 * alpha);
        this.noticeBg.strokeRoundedRect(nx - nw / 2, ny - nh / 2, nw, nh, nh / 2);
      } else {
        this.noticeTxt.setVisible(false);
        next = this.noticeQueue.shift();
        if (next) this.startNotice(next);
      }
    },

    setPaused: function (on) {
      if (!this.ready) return;
      this.paused = on;
      if (on) this.buildOverlay('paused'); else this.hideOverlay();
    },

    showResult: function (r) {
      if (!this.ready) return;
      this.result = r;
      this.buildOverlay('result');
    },

    hideOverlay: function () {
      // removeAll(true) destroys every child, so nothing an overlay created
      // can survive into the next one.
      this.overlay.removeAll(true);
      this.overlayItems.length = 0;
      this.overlay.setVisible(false);
      this.overlayBg = null;
      this.uiRects.length = Math.min(this.uiRects.length, this.baseUIRectCount || 1);
    },

    buildOverlay: function (kind) {
      var self = this, gs = this.gs, i, y, t;
      this.hideOverlay();
      this.overlay.setVisible(true);
      this.overlayBg = this.add.graphics();
      this.overlayBg.fillStyle(0x040810, 0.86);
      this.overlayBg.fillRect(0, 0, VW, VH);
      this.overlay.add(this.overlayBg);

      function txt(x, yy, s, style, origin) {
        var o = self.add.text(x, yy, s, style).setOrigin(origin == null ? 0.5 : origin, 0.5);
        self.overlay.add(o);
        return o;
      }
      function btn(cx, cy, w, h, label, cb, fill, col) {
        var b = self.button(cx, cy, w, h, label, cb, fill || 0x14283c, col || '#eaf7ff', 14, false);
        self.overlay.add(b);
        return b;
      }

      if (kind === 'paused') {
        txt(VW / 2, 150, 'PAUSED', tstyle(30, '#eaf7ff'));
        txt(VW / 2, 186, gs.mode.label + '  //  ' + (gs.arena ? gs.arena.name : ''), tstyle(12, '#8fb6cf'));
        btn(VW / 2, 244, 260, 46, 'RESUME', function () { kit.resume('menu'); }, 0x7aeeff, '#06141f');
        btn(VW / 2, 300, 260, 42, 'SETTINGS', function () { kit.openSettings(); });
        btn(VW / 2, 350, 260, 42, 'RESTART RUN', function () { gs.restartRun(); });
        btn(VW / 2, 400, 260, 42, 'QUIT TO MENU', function () { gs.quitToMenu(); });
      } else {
        var r = this.result;
        txt(VW / 2, 96, r.won ? 'ARENA CLEARED' : 'RUN OVER', tstyle(34, r.won ? '#96ffb0' : '#ff8fa0'));
        txt(VW / 2, 132, r.mode + (r.won ? '' : '  //  fell on wave ' + r.wave), tstyle(13, '#8fb6cf'));
        y = 178;
        txt(VW / 2, y, 'SCORE ' + fmt(r.score) + (r.newBest ? '   NEW BEST' : ''),
            tstyle(24, r.newBest ? '#ffe082' : '#eaf7ff'));
        txt(VW / 2, y + 30, 'BEST ' + fmt(r.best) + '     KILLS ' + r.kills + '     TIME ' + Math.round(r.time) + 's',
            tstyle(12, '#7fa2ba'));
        if (r.medal && r.medal !== 'none') {
          var im = this.add.image(VW / 2 - 92, y + 74, 'atlas', 'medal_' + r.medal).setScale(1.15);
          this.overlay.add(im);
          txt(VW / 2 + 16, y + 74, r.medal.toUpperCase() + ' MEDAL', tstyle(15, '#ffd479'));
        } else {
          var next = look(D.MODES, gs.modeKey, 'standard').medals || {};
          txt(VW / 2, y + 74, 'Bronze at ' + fmt(next.bronze) + '. Keep the multiplier alive.',
              tstyle(12, '#6f8ca3'));
        }
        if (r.unlocked && r.unlocked.length) {
          txt(VW / 2, y + 112, 'UNLOCKED: ' + r.unlocked.join(', '), tstyle(13, '#96ffb0'));
        }
        btn(VW / 2 - 140, 414, 250, 48, 'RETRY RUN', function () { gs.restartRun(); }, 0x7aeeff, '#06141f');
        btn(VW / 2 + 140, 414, 250, 48, 'MODE SELECT', function () { gs.quitToMenu(); });
        txt(VW / 2, 462, 'R restarts. Esc pauses.', tstyle(10, '#5b7a90'));
      }
    },

    update: function (time, delta) {
      var gs = this.gs, dt = Math.min(delta, 100) / 1000;
      if (!gs || !gs.scene || !gs.scene.isActive() || !gs.run) return;
      var d = gs.player.d, run = gs.run, i;

      this.damageT = Math.max(0, this.damageT - dt);
      this.damageVignette.clear();
      if (this.damageT > 0) {
        var damageAlpha = clamp(this.damageT / (this.damageMax || 0.5), 0, 1) * 0.42;
        this.damageVignette.fillStyle(0xff355f, damageAlpha);
        this.damageVignette.fillRect(0, 0, VW, 16);
        this.damageVignette.fillRect(0, VH - 16, VW, 16);
        this.damageVignette.fillRect(0, 0, 18, VH);
        this.damageVignette.fillRect(VW - 18, 0, 18, VH);
      }

      // ------------------------------------------------------- compact HUD
      setTextIf(this.waveTxt, 'W' + run.wave + (gs.mode.waves ? '/' + gs.mode.waves : ''));
      setTextIf(this.scoreTxt, fmt(Math.floor(run.score)));
      var mv = gs.multValue();
      setTextIf(this.multTxt, mv > 1 ? 'x' + mv : '');
      setTextIf(this.timerTxt, run.waveTimer > 0 ? '⏱ ' + Math.ceil(run.waveTimer) : '');

      var L = 18 + safe.left, T = 14 + safe.top;
      var frac = clamp(d.hp / d.maxHp, 0, 1);
      this.hpFill.clear();
      this.hpBack.clear();
      this.hpBack.fillStyle(0x0b1522, 0.9);
      this.hpBack.fillRoundedRect(L, T + 30, 160, 12, 6);
      this.hpBack.lineStyle(1.5, 0x2f5570, 1);
      this.hpBack.strokeRoundedRect(L, T + 30, 160, 12, 6);
      var col = frac > 0.6 ? 0x96ffb0 : frac > 0.3 ? 0xffcd6e : 0xff6d7c;
      this.hpFill.fillStyle(col, 1);
      this.hpFill.fillRoundedRect(L + 2, T + 32, Math.max(2, 156 * frac), 8, 4);
      for (i = 1; i < 4; i++) {
        this.hpFill.fillStyle(0x0b1522, 0.7);
        this.hpFill.fillRect(L + 2 + 156 * (i / 4), T + 32, 2, 8);
      }
      var wdef = look(D.WEAPONS, d.weapon, 'spread');
      if (this.weaponKey !== wdef.key) {
        this.weaponKey = wdef.key;
        this.weaponIcon.setTexture('atlas', 'pk_' + wdef.key);
      }
      this.weaponMeter.clear();
      this.weaponMeter.fillStyle(0x0b1522, 0.9);
      this.weaponMeter.fillRoundedRect(L + 30, T + 58, 90, 8, 4);
      this.weaponMeter.fillStyle(wdef.color || 0x7aeeff, 1);
      this.weaponMeter.fillRoundedRect(L + 32, T + 60, 86 * (d.weaponT > 0 ? clamp(d.weaponT / (D.WEAPON_TIME || 15), 0, 1) : 1), 4, 2);

      // ------------------------------------------------------- boss bar
      var b = run.bossAlive;
      this.bossPlate.clear();
      if (b && b.active) {
        var bw = VW * 0.38, bx = VW / 2 - bw / 2, by = T + 30;
        this.bossPlate.fillStyle(0x1a0c16, 0.9);
        this.bossPlate.fillRoundedRect(bx, by, bw, 14, 7);
        this.bossPlate.fillStyle(0xff76a2, 1);
        this.bossPlate.fillRoundedRect(bx + 2, by + 2, Math.max(2, (bw - 4) * clamp(b.d.hp / b.d.maxHp, 0, 1)), 10, 5);
        this.bossPlate.lineStyle(1.5, 0xffb0c8, 1);
        this.bossPlate.strokeRoundedRect(bx, by, bw, 14, 7);
        var pips = (D.BOSS && D.BOSS.phases) ? D.BOSS.phases.length : 3;
        for (i = 0; i < pips; i++) {
          this.bossPlate.fillStyle(i <= b.d.phaseIdx ? 0xffe082 : 0x4a2c3c, 1);
          this.bossPlate.fillCircle(bx + bw + 12 + i * 12, by + 7, 4);
        }
      }

      // --------------------------------------------------------- notice
      this.stepNotice(dt);

      // -------------------------------------------------------- sticks
      var c = gs.ctl;
      if (c.left.on) {
        this.stickL.setPosition(c.left.bx, c.left.by).setVisible(true);
        this.knobL.setPosition(
          c.left.bx + clamp(c.left.x - c.left.bx, -c.radius, c.radius) * 0.75,
          c.left.by + clamp(c.left.y - c.left.by, -c.radius, c.radius) * 0.75).setVisible(true);
      } else { this.stickL.setVisible(false); this.knobL.setVisible(false); }
      if (c.right.on) {
        this.stickR.setPosition(c.right.bx, c.right.by).setVisible(true);
        this.knobR.setPosition(
          c.right.bx + clamp(c.right.x - c.right.bx, -c.radius, c.radius) * 0.75,
          c.right.by + clamp(c.right.y - c.right.by, -c.radius, c.radius) * 0.75).setVisible(true);
      } else { this.stickR.setVisible(false); this.knobR.setVisible(false); }

      // -------------------------------------------------- night masking
      this.drawNight(gs, d);

      // ------------------------------------------------ overlay furniture
      var ov = this.paused || !!this.result;
      setVisIf(this.pauseBtn, !ov);
      if (ov) {
        this.noticeBg.clear();
        setVisIf(this.noticeTxt, false);
        setVisIf(this.stickL, false); setVisIf(this.knobL, false);
        setVisIf(this.stickR, false); setVisIf(this.knobR, false);
      }
    },

    drawNight: function (gs, d) {
      var g = this.nightGfx, i, s, sx, sy, R, cam, vw, z, lamps;
      if (!gs.arena || !gs.arena.dark) {
        if (this.night.visible) {
          this.night.setVisible(false);
          g.clear();
          for (i = 0; i < this.lampPool.length; i++) this.lampPool[i].setVisible(false);
        }
        return;
      }
      cam = gs.cameras.main;
      vw = cam.worldView;
      z = cam.zoom;
      sx = (d.x - vw.x) * z;
      sy = (d.y - vw.y) * z;
      R = 168;                       // lamp radius the pilot carries, in screen px
      this.night.setVisible(true);
      this.night.setPosition(sx, sy);
      this.night.setDisplaySize(R * 2, R * 2);
      this.night.setAlpha(0.94);
      g.clear();
      g.fillStyle(0x03070f, 0.94);
      var l = sx - R, r = sx + R, t = sy - R, b = sy + R;
      if (l > 0) g.fillRect(0, 0, l, VH);
      if (r < VW) g.fillRect(r, 0, VW - r, VH);
      if (t > 0) g.fillRect(Math.max(0, l), 0, Math.min(VW, r) - Math.max(0, l), t);
      if (b < VH) g.fillRect(Math.max(0, l), b, Math.min(VW, r) - Math.max(0, l), VH - b);

      lamps = gs.arena.lamps || [];
      for (i = 0; i < this.lampPool.length; i++) {
        s = this.lampPool[i];
        if (i >= lamps.length) { setVisIf(s, false); continue; }
        s.setVisible(true);
        s.setPosition((lamps[i].x - vw.x) * z, (lamps[i].y - vw.y) * z);
        s.setDisplaySize(300, 300);
        s.setAlpha(0.20);
      }
    },

  });

  // ============================================================== boot
  function boot() {
    var config = {
      type: Phaser.AUTO,
      parent: 'game-root',
      backgroundColor: '#05080f',
      powerPreference: 'high-performance',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: VW,
        height: VH
      },
      render: { transparent: false },
      scene: [BootScene, MenuScene, GameScene, HudScene]
    };
    config.scale.width = Math.round(VW * RETINA_FACTOR);
    config.scale.height = Math.round(VH * RETINA_FACTOR);
    config.render = Object.assign({}, window.GGKit.renderDefaults, config.render || {});
    var game = new Phaser.Game(config);
    hook.game = game;
    return game;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
