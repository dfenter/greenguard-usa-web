/* game.js — Touchline Eleven.
 *
 * Five a side arcade football. Drag from the carrier to aim a pass, swipe
 * toward the goal to shoot, hold sprint to burst, tap a team mate to switch.
 *
 * Architecture notes that matter for maintenance:
 *  - GGKit owns lifecycle, pause, rotate, per pointer identity, saves, audio
 *    buses, the loading screen, settings and the juice budget. Nothing in
 *    this file re-implements any of those.
 *  - All static art is baked into canvas textures in te_art.js. The only
 *    per frame Graphics work is the aim indicator, which is a handful of
 *    commands.
 *  - Every transient (particles aside, which Phaser pools) comes from a
 *    fixed capacity pool in te_core.js. The debug state object is a single
 *    preallocated record: there is no second copy of any live object.
 *  - Gameplay pointers are claimed on WINDOW level listeners registered
 *    after GGKit init, and the claim seeds kit.input.pointers so a canvas
 *    level handler can never race the kit and orphan a touch.
 */
(function (root) {
  'use strict';

  var C = root.TECore;
  var K = root.TEContent;
  var A = root.TEArt;
  var P = K.PITCH;

  var GW = 960, GH = 480;
  var RETINA_FACTOR = root.GGKit.hiDpi.factor(GW, GH);
  var TAU = Math.PI * 2;
  var SAVE_VERSION = 3;

  var textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    return textFactory.call(this, x, y, text, Object.assign({ resolution: RETINA_FACTOR }, style || {}));
  };

  /* ------------------------------------------------------- debug/verify */
  // ONE preallocated record. The orchestrator probes window.__te.state and
  // may write window.__te.forceMode / forceStage at any time, including
  // before the first scene exists.
  var STATE = {
    mode: 'boot', screen: 'boot', stage: '', ready: false,
    score: 0, oppScore: 0, clock: 0, minutes: 3,
    progress: 0, health: 1, stamina: 1,
    club: '', venue: '', difficulty: 0,
    medal: 'none', drill: '', drillRound: 0, drillValue: 0,
    seasonFixture: 0, seasonPoints: 0, seasonDone: false,
    unlocked: [], lineup: [], tutorialStep: 0, tutorialDone: false,
    possession: 'own', paused: false, reducedMotion: false,
    forceMode: '', forceStage: ''
  };
  if (!root.__te) root.__te = { state: STATE, forceMode: '', forceStage: '' };
  root.__te.state = STATE;

  function readForce(field) {
    var v = root.__te && root.__te[field];
    return (typeof v === 'string' && v) ? v : '';
  }

  /* ------------------------------------------------------------- saving */
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      tutorialDone: false,
      unlocked: ['vantly', 'marrow', 'quinn', 'halloway', 'wilde'],
      lineup: ['vantly', 'marrow', 'quinn', 'halloway', 'wilde'],
      season: null,
      quickTier: 'friendly',
      quickVenue: 'ashfield',
      drills: { accuracy: [0, 0, 0], slalom: [0, 0, 0], penalty: [0, 0, 0] },
      stats: { matches: 0, wins: 0, draws: 0, goals: 0, conceded: 0, cleanSheets: 0, trophies: 0, drillGolds: 0 }
    };
  }

  function validateSave(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) && o.v === SAVE_VERSION &&
      Array.isArray(o.unlocked) && Array.isArray(o.lineup) && !!o.drills && !!o.stats;
  }

  function num(v, d, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) return d;
    if (isFinite(lo)) n = Math.max(lo, n);
    if (isFinite(hi)) n = Math.min(hi, n);
    return n;
  }

  function sanitise(raw) {
    var base = defaultSave();
    if (!validateSave(raw)) return base;
    base.tutorialDone = !!raw.tutorialDone;
    var seen = Object.create(null), i;
    for (i = 0; i < raw.unlocked.length; i++) {
      var id = raw.unlocked[i];
      if (typeof id === 'string' && K.hasPlayer(id) && !seen[id]) { seen[id] = 1; }
    }
    base.unlocked = K.unlockedIds({ unlocked: Object.keys(seen) });
    // Lineup: goalkeeper plus four unlocked outfield players, deduplicated.
    var line = ['vantly'], used = { vantly: 1 };
    for (i = 0; i < raw.lineup.length && line.length < 5; i++) {
      var pid = raw.lineup[i];
      if (typeof pid !== 'string' || !K.hasPlayer(pid) || used[pid]) continue;
      if (K.getPlayer(pid).role === 'GK') continue;
      if (base.unlocked.indexOf(pid) < 0) continue;
      used[pid] = 1; line.push(pid);
    }
    for (i = 0; i < base.unlocked.length && line.length < 5; i++) {
      var uid = base.unlocked[i];
      if (!used[uid] && K.getPlayer(uid).role !== 'GK') { used[uid] = 1; line.push(uid); }
    }
    base.lineup = line;
    base.quickTier = K.getTier(raw.quickTier).key;
    base.quickVenue = K.getVenue(raw.quickVenue).key;
    ['accuracy', 'slalom', 'penalty'].forEach(function (kk) {
      var src = raw.drills && raw.drills[kk];
      var out = [0, 0, 0];
      if (Array.isArray(src)) for (var j = 0; j < 3; j++) out[j] = num(src[j], 0, 0, 9999999);
      base.drills[kk] = out;
    });
    var st = raw.stats || {};
    base.stats = {
      matches: num(st.matches, 0, 0, 99999) | 0, wins: num(st.wins, 0, 0, 99999) | 0,
      draws: num(st.draws, 0, 0, 99999) | 0, goals: num(st.goals, 0, 0, 999999) | 0,
      conceded: num(st.conceded, 0, 0, 999999) | 0, cleanSheets: num(st.cleanSheets, 0, 0, 99999) | 0,
      trophies: num(st.trophies, 0, 0, 9999) | 0, drillGolds: num(st.drillGolds, 0, 0, 999) | 0
    };
    base.season = sanitiseSeason(raw.season, base);
    return base;
  }

  function blankTable() {
    var rows = [{ key: K.OWN_CLUB.key, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }];
    for (var i = 0; i < K.CLUBS.length; i++) {
      rows.push({ key: K.CLUBS[i].key, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    }
    return rows;
  }

  function newSeason(index) {
    return {
      index: index | 0,
      fixture: 0,
      table: blankTable(),
      form: {},
      finalUnlocked: false,
      finalWon: false,
      done: false
    };
  }

  function sanitiseSeason(s, base) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    var out = newSeason(num(s.index, 0, 0, 999));
    out.fixture = num(s.fixture, 0, 0, 13) | 0;
    out.finalUnlocked = !!s.finalUnlocked;
    out.finalWon = !!s.finalWon;
    out.done = !!s.done;
    if (Array.isArray(s.table)) {
      for (var i = 0; i < out.table.length; i++) {
        var row = out.table[i];
        for (var j = 0; j < s.table.length; j++) {
          var src = s.table[j];
          if (src && src.key === row.key) {
            row.p = num(src.p, 0, 0, 99) | 0; row.w = num(src.w, 0, 0, 99) | 0;
            row.d = num(src.d, 0, 0, 99) | 0; row.l = num(src.l, 0, 0, 99) | 0;
            row.gf = num(src.gf, 0, 0, 999) | 0; row.ga = num(src.ga, 0, 0, 999) | 0;
            row.pts = row.w * 3 + row.d;
            break;
          }
        }
      }
    }
    if (s.form && typeof s.form === 'object') {
      for (var q = 0; q < K.PLAYERS.length; q++) {
        var pid = K.PLAYERS[q].id;
        out.form[pid] = num(s.form[pid], 1, 0.8, 1.2);
      }
    }
    if (base && base.unlocked.indexOf('thorne') >= 0) out.finalUnlocked = true;
    return out;
  }

  /* --------------------------------------------------------------- kit */
  var scenes = { menu: null, match: null };

  var kit = root.GGKit.create({
    slug: 'touchline-eleven',
    orientation: 'landscape',
    validateSave: validateSave,
    onPause: function () {
      STATE.paused = true;
      if (scenes.match && scenes.match.scene.isActive()) scenes.match.onKitPause();
    },
    onResume: function () {
      STATE.paused = false;
      if (scenes.match && scenes.match.scene.isActive()) scenes.match.onKitResume();
    },
    onRestart: function () {
      if (scenes.match && scenes.match.scene.isActive()) scenes.match.restartRun();
    }
  });

  var save = sanitise(kit.save.get(null));
  function persist() { kit.save.set(save); syncSaveState(); }

  function syncSaveState() {
    STATE.unlocked = save.unlocked.slice();
    STATE.lineup = save.lineup.slice();
    STATE.tutorialDone = save.tutorialDone;
    STATE.seasonFixture = save.season ? save.season.fixture : 0;
    STATE.seasonDone = save.season ? save.season.done : false;
    STATE.seasonPoints = save.season ? tableRow(save.season.table, K.OWN_CLUB.key).pts : 0;
    STATE.reducedMotion = !kit.juice.enabled;
  }

  function tableRow(table, key) {
    for (var i = 0; i < table.length; i++) if (table[i].key === key) return table[i];
    return { key: key, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }

  /* ------------------------------------------------------ pointer layer */
  // Registered AFTER GGKit.create so the kit's own window listener has
  // already created the pointer record by the time these run. Each claim
  // seeds kit.input.pointers if the kit skipped the event (paused, or a
  // synthetic pointer), so a claim can never reference a missing record.
  var canvasRect = { left: 0, top: 0, width: 1, height: 1 };
  var claims = new Map(); // pointerId -> {zone, gx, gy, sx, sy, t0, curve, px, py, moved}
  var CLAIM_POOL = [];
  for (var ci = 0; ci < 12; ci++) {
    CLAIM_POOL.push({ zone: '', gx: 0, gy: 0, sx: 0, sy: 0, t0: 0, curve: 0, px: 0, py: 0, moved: 0, id: -1 });
  }
  function takeClaim() {
    for (var i = 0; i < CLAIM_POOL.length; i++) if (CLAIM_POOL[i].id === -1) return CLAIM_POOL[i];
    return null;
  }

  function refreshRect() {
    var cv = document.querySelector('#game canvas');
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      canvasRect.left = r.left; canvasRect.top = r.top;
      canvasRect.width = r.width; canvasRect.height = r.height;
    }
  }
  root.addEventListener('resize', refreshRect);
  root.addEventListener('orientationchange', refreshRect);

  function toGameX(clientX) { return (clientX - canvasRect.left) / canvasRect.width * GW; }
  function toGameY(clientY) { return (clientY - canvasRect.top) / canvasRect.height * GH; }

  function seedKitPointer(e) {
    var p = kit.input.pointers.get(e.pointerId);
    if (!p) {
      p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: null };
      kit.input.pointers.set(e.pointerId, p);
    }
    return p;
  }

  root.addEventListener('pointerdown', function (e) {
    if (kit.paused) return;
    var scene = scenes.match;
    if (!scene || !scene.scene.isActive() || !scene.acceptsPointers()) return;
    refreshRect();
    var kp = seedKitPointer(e);
    var gx = toGameX(e.clientX), gy = toGameY(e.clientY);
    var zone = scene.claimZone(gx, gy);
    if (!zone) return;
    var rec = takeClaim();
    if (!rec) return;
    rec.id = e.pointerId; rec.zone = zone; rec.sx = gx; rec.sy = gy;
    rec.gx = gx; rec.gy = gy; rec.px = gx; rec.py = gy;
    rec.t0 = performance.now(); rec.curve = 0; rec.moved = 0;
    kp.zone = zone;
    claims.set(e.pointerId, rec);
    scene.onClaimDown(rec);
  }, { passive: true });

  root.addEventListener('pointermove', function (e) {
    var rec = claims.get(e.pointerId);
    if (!rec) return;
    var gx = toGameX(e.clientX), gy = toGameY(e.clientY);
    // Signed area accumulation gives the swipe its curvature, exactly as the
    // prototype measured it.
    rec.curve += (gx - rec.px) * (rec.py - rec.sy) - (gy - rec.py) * (rec.px - rec.sx);
    rec.px = gx; rec.py = gy;
    rec.gx = gx; rec.gy = gy;
    rec.moved = Math.max(rec.moved, C.dist(gx, gy, rec.sx, rec.sy));
    var scene = scenes.match;
    if (scene && scene.scene.isActive()) scene.onClaimMove(rec);
  }, { passive: true });

  function endPointer(e, cancelled) {
    var rec = claims.get(e.pointerId);
    if (!rec) return;
    claims.delete(e.pointerId);
    var kp = kit.input.pointers.get(e.pointerId);
    if (kp) kp.zone = null;
    var scene = scenes.match;
    if (scene && scene.scene.isActive()) scene.onClaimUp(rec, cancelled);
    rec.id = -1; rec.zone = '';
  }
  root.addEventListener('pointerup', function (e) { endPointer(e, false); }, { passive: true });
  root.addEventListener('pointercancel', function (e) { endPointer(e, true); }, { passive: true });

  function releaseAllClaims() {
    claims.forEach(function (rec) { rec.id = -1; rec.zone = ''; });
    claims.clear();
  }

  /* ---------------------------------------------------------- utilities */
  var NRM = { x: 0, y: 0, len: 0 };
  function motionOn() { return kit.juice.enabled; }
  function fxCount(n) { return motionOn() ? n : Math.max(1, Math.round(n * 0.35)); }

  function sfx(name, vol, rate) { kit.audio.sfx(name, { volume: vol == null ? 1 : vol, rate: rate || 1 }); }

  /* ==================================================================== */
  /*  BOOT                                                                 */
  /* ==================================================================== */
  class BootScene extends Phaser.Scene {
    constructor() { super('boot'); }

    create() {
      this.cameras.main.setZoom(RETINA_FACTOR);
      STATE.mode = 'boot'; STATE.screen = 'boot';
      kit.loader.show('TOUCHLINE ELEVEN');
      kit.loader.progress(0.06);
      refreshRect();
      syncSaveState();

      var self = this;
      var steps = [
        ['chrome', function () { A.buildCommon(self, GW, GH); }],
        ['teams', function () {
          var club = K.getClub(save.season ? K.CLUBS[Math.min(save.season.fixture, K.CLUBS.length - 1)].key : K.CLUBS[0].key);
          A.buildTeams(self, K.OWN_CLUB, club);
        }],
        ['pitch', function () { A.buildPitch(self, K.getVenue(save.quickVenue), GW, GH); }],
        ['audio', function () { self.audioNames = A.buildAudio(kit); }],
        ['warm', function () { self.warmTextures(); }],
        ['decode', function () { return kit.audio.preload(); }]
      ];

      var i = 0;
      function step() {
        if (i >= steps.length) { self.finish(); return; }
        var res;
        try { res = steps[i][1](); } catch (err) { res = null; }
        i++;
        kit.loader.progress(0.06 + 0.9 * (i / steps.length));
        if (res && typeof res.then === 'function') {
          res.then(function () { self.time.delayedCall(16, step); }, function () { self.time.delayedCall(16, step); });
        } else {
          self.time.delayedCall(24, step);
        }
      }
      step();
    }

    // Touch every texture once so the first gameplay frame never pays an
    // upload hitch.
    warmTextures() {
      var keys = ['te-ball', 'te-shadow', 'te-ring', 'te-chev', 'te-p-soft', 'te-p-fleck',
        'te-p-ring', 'te-p-conf', 'te-p-star', 'te-p-drop', 'te-wave', 'te-band', 'te-panel',
        'te-panel-sm', 'te-btn', 'te-btn-hot', 'te-btn-sm', 'te-btn-sm-hot', 'te-card',
        'te-card-hot', 'te-chip', 'te-strip', 'te-banner', 'te-stick', 'te-knob',
        'te-act-sprint', 'te-act-tackle', 'te-act-pause', 'te-medal-gold', 'te-medal-silver',
        'te-medal-bronze', 'te-medal-none', 'te-crest', 'te-menubg', A.PITCH_KEY,
        'te-own', 'te-own-gk', 'te-opp', 'te-opp-gk'];
      var warm = [];
      for (var i = 0; i < keys.length; i++) {
        if (!this.textures.exists(keys[i])) continue;
        var im = this.add.image(-500, -500, keys[i]).setAlpha(0.001);
        warm.push(im);
      }
      this.warmed = warm;
    }

    finish() {
      if (this.warmed) { for (var i = 0; i < this.warmed.length; i++) this.warmed[i].destroy(); this.warmed = null; }
      kit.loader.progress(1);
      kit.loader.hide();
      kit.registerPWA();
      STATE.ready = true;
      var force = readForce('forceMode');
      if (force && force !== 'menu') {
        this.scene.start('menu', { autoStart: force, stage: readForce('forceStage') });
      } else {
        this.scene.start('menu', {});
      }
    }
  }

  /* ==================================================================== */
  /*  MENU                                                                 */
  /* ==================================================================== */
  var FONT = 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif';
  var MONO = 'ui-monospace, Menlo, Monaco, Consolas, monospace';
  var INK = '#e9fbf1', DIM = '#8fb7a6', HOT = '#27d0a0', WARN = '#ffd166';

  class MenuScene extends Phaser.Scene {
    constructor() { super('menu'); }

    init(data) { this.boot = data || {}; }

    create() {
      this.cameras.main.setZoom(RETINA_FACTOR);
      scenes.menu = this;
      STATE.mode = 'menu';
      releaseAllClaims();
      this.add.image(GW / 2, GH / 2, 'te-menubg').setDepth(-30);

      this.layer = this.add.container(0, 0).setDepth(0);
      this.buttons = [];
      this.focus = 0;
      this.screen = '';
      this.pendingMatch = null;

      // Ambient menu sparkle: a single low rate emitter keeps the title
      // screen alive without competing with the copy.
      this.fxMenu = this.add.particles(0, 0, 'te-p-soft', {
        x: { min: 0, max: GW }, y: { min: GH * 0.42, max: GH * 0.78 },
        speedY: { min: -14, max: -4 }, speedX: { min: -8, max: 8 },
        lifespan: 4200, quantity: 1, frequency: 300,
        scale: { start: 0.16, end: 0 }, alpha: { start: 0.32, end: 0 },
        tint: [0xffd166, 0x27d0a0, 0xbfe9ff], blendMode: 'ADD'
      }).setDepth(-28);

      this.input.keyboard.on('keydown', this.onKey, this);
      this.events.once('shutdown', function () {
        this.input.keyboard.off('keydown', this.onKey, this);
        scenes.menu = null;
      }, this);

      kit.audio.music('anthem', 900);

      var auto = this.boot.autoStart || '';
      if (auto === 'quick') { this.showQuick(); this.startQuickFromStage(this.boot.stage); }
      else if (auto === 'season') { this.showSeason(); this.startSeasonFromStage(this.boot.stage); }
      else if (auto === 'drill') { this.showDrills(); this.startDrillFromStage(this.boot.stage); }
      else if (this.boot.returnTo === 'season') this.showSeason();
      else if (this.boot.returnTo === 'drills') this.showDrills();
      else this.showTitle();
    }

    /* ---------------------------------------------------------- widgets */
    clear() {
      this.layer.removeAll(true);
      this.buttons.length = 0;
      this.focus = 0;
    }

    label(x, y, text, size, color, align, font) {
      var t = this.add.text(x, y, text, {
        fontFamily: font || FONT, fontSize: size + 'px', color: color || INK,
        align: align || 'left'
      });
      t.setOrigin(align === 'center' ? 0.5 : (align === 'right' ? 1 : 0), 0.5);
      this.layer.add(t);
      return t;
    }

    button(x, y, w, text, onPick, opts) {
      var o = opts || {};
      var base = o.small ? 'te-btn-sm' : (o.card ? 'te-card' : 'te-btn');
      var hot = o.small ? 'te-btn-sm-hot' : (o.card ? 'te-card-hot' : 'te-btn-hot');
      var img = this.add.image(0, 0, o.selected ? hot : base);
      var h = o.card ? 96 : (o.small ? 52 : 60);
      img.setDisplaySize(w, h);
      var group = this.add.container(x, y, [img]);
      var txt = this.add.text(0, o.sub ? -14 : 0, text, {
        fontFamily: FONT, fontSize: (o.size || 22) + 'px', fontStyle: '700',
        color: o.selected ? '#052018' : INK
      }).setOrigin(0.5);
      group.add(txt);
      if (o.sub) {
        var sub = this.add.text(0, 16, o.sub, {
          fontFamily: FONT, fontSize: '17px', color: o.selected ? '#0b3b2d' : DIM,
          wordWrap: { width: w - 24 }, align: 'center'
        }).setOrigin(0.5);
        group.add(sub);
      }
      this.layer.add(group);
      if (o.disabled) {
        group.setAlpha(0.42);
        return group;
      }
      img.setInteractive({ useHandCursor: true });
      img.on('pointerup', function () { sfx('tap', 0.7); onPick(); });
      img.on('pointerover', function () { group.setScale(1.02); });
      img.on('pointerout', function () { group.setScale(1); });
      group.__pick = onPick;
      this.buttons.push(group);
      return group;
    }

    header(title, sub) {
      this.label(GW / 2, 44, title, 34, INK, 'center').setFontStyle('800');
      if (sub) this.label(GW / 2, 76, sub, 18, DIM, 'center');
    }

    backButton(fn) {
      this.button(100, 40, 168, 'Back', fn, { small: true, size: 20 });
    }

    onKey(e) {
      var code = e.code;
      if (code === 'ArrowDown' || code === 'ArrowRight' || code === 'Tab') {
        e.preventDefault();
        if (this.buttons.length) { this.focus = (this.focus + 1) % this.buttons.length; this.paintFocus(); }
      } else if (code === 'ArrowUp' || code === 'ArrowLeft') {
        e.preventDefault();
        if (this.buttons.length) { this.focus = (this.focus + this.buttons.length - 1) % this.buttons.length; this.paintFocus(); }
      } else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
        e.preventDefault();
        var b = this.buttons[this.focus];
        if (b && b.__pick) { sfx('tap', 0.7); b.__pick(); }
      } else if (code === 'Escape') {
        if (this.screen !== 'title') { sfx('tap', 0.6); this.showTitle(); }
      }
    }

    paintFocus() {
      for (var i = 0; i < this.buttons.length; i++) {
        this.buttons[i].setScale(i === this.focus ? 1.04 : 1);
      }
    }

    /* ----------------------------------------------------------- screens */
    showTitle() {
      this.clear();
      this.screen = 'title';
      STATE.screen = 'title'; STATE.stage = '';
      syncSaveState();

      this.layer.add(this.add.image(178, 250, 'te-crest').setScale(0.92));
      this.label(330, 176, 'TOUCHLINE', 52, INK).setFontStyle('800');
      this.label(330, 228, 'ELEVEN', 52, HOT).setFontStyle('800');
      this.label(332, 256, 'Five a side. One touch. Every yard earned.', 19, DIM);

      var self = this;
      this.button(GW / 2, 314, 300, 'Kick Off', function () { self.kickOffNext(); },
        { sub: this.seasonSub(), size: 26, selected: true });
      this.button(300, 392, 186, 'Season', function () { self.showSeason(); }, { small: true, size: 20 });
      this.button(496, 392, 186, 'Quick Match', function () { self.showQuick(); }, { small: true, size: 20 });
      this.button(692, 392, 186, 'Skill Drills', function () { self.showDrills(); }, { small: true, size: 20 });
      this.button(660, 44, 168, 'Squad', function () { self.showSquad('title'); }, { small: true, size: 20 });

      this.button(838, 44, 168, 'Settings', function () {
        kit.openSettings([function (box, row) {
          row('Fullscreen', function () { return !!document.fullscreenElement; }, function (v) { if (v) kit.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
        }]);
        self.time.delayedCall(60, function () { syncSaveState(); });
      }, { small: true, size: 20 });

      var st = save.stats;
      this.label(GW / 2, GH - 26, 'Played ' + st.matches + '  ·  Won ' + st.wins + '  ·  Goals ' + st.goals +
        '  ·  Clean sheets ' + st.cleanSheets + '  ·  Trophies ' + st.trophies, 17, DIM, 'center');
      this.paintFocus();
    }

    // The centre button always starts football: the next season fixture, or a
    // fresh season once the last one is won.
    kickOffNext() {
      if (!save.season || save.season.done) { save.season = newSeason(save.season ? save.season.index + 1 : 0); persist(); }
      var fixtures = K.seasonFixtures();
      var isFinal = save.season.fixture >= fixtures.length;
      var fx = isFinal ? K.FINAL_FIXTURE : fixtures[save.season.fixture];
      this.launchMatch({ mode: 'season', clubKey: fx.club, venueKey: fx.venue, difficulty: fx.difficulty, minutes: 3, final: !!fx.final });
    }

    seasonSub() {
      if (!save.season) return 'Twelve fixtures and a final';
      if (save.season.done) return 'Season complete, start a new one';
      if (save.season.fixture >= K.CLUBS.length) return 'The final awaits';
      return 'Fixture ' + (save.season.fixture + 1) + ' of 12';
    }

    drillSub() {
      var golds = 0;
      ['accuracy', 'slalom', 'penalty'].forEach(function (kk) {
        for (var i = 0; i < 3; i++) if (K.drillMedal(kk, save.drills[kk][i]) === 'gold') golds++;
      });
      return golds + ' of 9 golds';
    }

    /* ------------------------------------------------------------ season */
    showSeason() {
      this.clear();
      this.screen = 'season';
      STATE.screen = 'season';
      if (!save.season) { save.season = newSeason(0); persist(); }
      var s = save.season;
      var self = this;

      this.header('Season ' + (s.index + 1), s.done ? 'Champions. Start a new season when you are ready.' : 'League table and next fixture');

      // League table, sorted, in a mono column so it reads like a broadcast
      // graphic rather than a wall of prose.
      var rows = s.table.slice().sort(function (a, b) {
        return (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf);
      });
      this.layer.add(this.add.image(266, 278, 'te-panel').setDisplaySize(492, 340));
      this.label(46, 120, ' #  CLUB   P  W  D  L  GD PTS', 16, DIM, 'left', MONO);
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var isOwn = r.key === K.OWN_CLUB.key;
        var club = isOwn ? K.OWN_CLUB : K.getClub(r.key);
        var gd = r.gf - r.ga;
        var line = String(i + 1).padStart(2, ' ') + '  ' + club.short + '   ' +
          String(r.p).padStart(2, ' ') + ' ' + String(r.w).padStart(2, ' ') + ' ' +
          String(r.d).padStart(2, ' ') + ' ' + String(r.l).padStart(2, ' ') + ' ' +
          (gd >= 0 ? '+' : '') + String(gd).padStart(2, ' ') + ' ' + String(r.pts).padStart(3, ' ');
        this.label(46, 142 + i * 21, line, 16, isOwn ? HOT : INK, 'left', MONO);
      }

      // Next fixture card.
      var fixtures = K.seasonFixtures();
      var isFinal = s.fixture >= fixtures.length;
      var fx = isFinal ? K.FINAL_FIXTURE : fixtures[s.fixture];
      var club2 = K.getClub(fx.club);
      var venue = K.getVenue(fx.venue);

      this.layer.add(this.add.image(730, 240, 'te-panel').setDisplaySize(420, 250));
      this.label(730, 152, isFinal ? 'KNOCKOUT FINAL' : ('FIXTURE ' + (s.fixture + 1) + ' OF 12'), 18, WARN, 'center').setFontStyle('700');
      this.label(730, 190, club2.name, 30, INK, 'center').setFontStyle('800');
      this.label(730, 222, (fx.away ? 'Away at ' : 'Home at ') + venue.name, 18, DIM, 'center');
      this.label(730, 252, venue.blurb, 17, DIM, 'center');
      this.label(730, 288, club2.note, 17, INK, 'center');
      this.label(730, 320, 'Weather: ' + venue.weather + '  ·  Rating ' + club2.rating.toFixed(2), 17, DIM, 'center');

      if (s.done) {
        this.button(660, 396, 246, 'New Season', function () {
          save.season = newSeason(s.index + 1); persist(); self.showSeason();
        }, { size: 22 });
      } else {
        this.button(660, 396, 246, 'Kick Off', function () {
          self.launchMatch({ mode: 'season', clubKey: fx.club, venueKey: fx.venue, difficulty: fx.difficulty, minutes: 3, final: !!fx.final });
        }, { size: 24 });
      }
      this.button(880, 396, 148, 'Squad', function () { self.showSquad('season'); }, { small: true, size: 20 });
      this.backButton(function () { self.showTitle(); });
      this.paintFocus();
    }

    startSeasonFromStage(stage) {
      if (!save.season) { save.season = newSeason(0); persist(); }
      var idx = parseInt(stage, 10);
      if (isFinite(idx) && idx >= 0 && idx <= K.CLUBS.length) { save.season.fixture = idx; persist(); }
      var fixtures = K.seasonFixtures();
      var isFinal = save.season.fixture >= fixtures.length;
      var fx = isFinal ? K.FINAL_FIXTURE : fixtures[save.season.fixture];
      this.launchMatch({ mode: 'season', clubKey: fx.club, venueKey: fx.venue, difficulty: fx.difficulty, minutes: 3, final: !!fx.final });
    }

    /* ------------------------------------------------------------- quick */
    showQuick() {
      this.clear();
      this.screen = 'quick';
      STATE.screen = 'quick';
      var self = this;
      this.header('Quick Match', 'Pick a tier and a ground, then kick off');

      var i, t;
      for (i = 0; i < K.TIERS.length; i++) {
        t = K.TIERS[i];
        (function (tier) {
          self.button(150 + i * 220, 178, 200, tier.name, function () {
            save.quickTier = tier.key; persist(); self.showQuick();
          }, { card: true, sub: tier.note, selected: save.quickTier === tier.key, size: 23 });
        })(t);
      }
      this.label(GW / 2, 244, 'GROUND', 17, DIM, 'center');
      for (i = 0; i < K.VENUES.length; i++) {
        var v = K.VENUES[i];
        (function (venue) {
          self.button(120 + i * 180, 308, 166, venue.name, function () {
            save.quickVenue = venue.key; persist(); self.showQuick();
          }, { card: true, sub: venue.weather, selected: save.quickVenue === venue.key, size: 19 });
        })(v);
      }

      var tier = K.getTier(save.quickTier);
      var venueSel = K.getVenue(save.quickVenue);
      this.label(GW / 2, 372, venueSel.blurb, 18, INK, 'center');
      this.button(GW / 2, 424, 300, 'Kick Off', function () {
        // Opponent scales with the chosen tier so the ramp still reads.
        var idx = Math.min(K.CLUBS.length - 1, Math.round(K.TIERS.indexOf(tier) * 3.4));
        self.launchMatch({ mode: 'quick', clubKey: K.CLUBS[idx].key, venueKey: venueSel.key, difficulty: tier.difficulty, minutes: tier.minutes });
      }, { size: 24 });
      this.backButton(function () { self.showTitle(); });
      this.paintFocus();
    }

    startQuickFromStage(stage) {
      var parts = String(stage || '').split(':');
      if (parts[0]) save.quickTier = K.getTier(parts[0]).key;
      if (parts[1]) save.quickVenue = K.getVenue(parts[1]).key;
      persist();
      var tier = K.getTier(save.quickTier);
      var idx = Math.min(K.CLUBS.length - 1, Math.round(K.TIERS.indexOf(tier) * 3.4));
      this.launchMatch({ mode: 'quick', clubKey: K.CLUBS[idx].key, venueKey: save.quickVenue, difficulty: tier.difficulty, minutes: tier.minutes });
    }

    /* ------------------------------------------------------------ drills */
    showDrills() {
      this.clear();
      this.screen = 'drills';
      STATE.screen = 'drills';
      var self = this;
      this.header('Skill Drills', 'Three disciplines, three rounds each. Medals are earned, never bought.');

      for (var d = 0; d < K.DRILLS.length; d++) {
        var drill = K.DRILLS[d];
        var cx = 176 + d * 304;
        this.layer.add(this.add.image(cx, 288, 'te-panel').setDisplaySize(284, 300));
        this.label(cx, 158, drill.name, 24, INK, 'center').setFontStyle('700');
        this.label(cx, 190, drill.brief, 17, DIM, 'center').setWordWrapWidth(258).setAlign('center');
        for (var r = 0; r < drill.rounds; r++) {
          var best = save.drills[drill.key][r] || 0;
          var medal = K.drillMedal(drill.key, best);
          var open = (r === 0) || (save.drills[drill.key][r - 1] > 0);
          var bestText = best <= 0 ? 'not set' :
            (drill.unit === 'time' ? C.formatMs(best) : (best + ' ' + drill.unit));
          var y = 252 + r * 74;
          this.layer.add(this.add.image(cx - 108, y, 'te-medal-' + medal).setScale(0.46));
          (function (dk, rr) {
            self.button(cx + 28, y, 200, 'Round ' + (rr + 1), function () {
              self.launchDrill(dk, rr);
            }, { small: true, size: 20, sub: null, disabled: !open });
          })(drill.key, r);
          this.label(cx + 28, y + 27, open ? ('Best ' + bestText) : 'Clear the round first', 15, open ? DIM : WARN, 'center');
        }
      }
      this.backButton(function () { self.showTitle(); });
      this.paintFocus();
    }

    startDrillFromStage(stage) {
      var parts = String(stage || '').split(':');
      var key = K.getDrill(parts[0]).key;
      var round = parseInt(parts[1], 10);
      this.launchDrill(key, (isFinite(round) && round >= 0 && round < 3) ? round : 0);
    }

    launchDrill(drillKey, round) {
      this.launchMatch({
        mode: 'drill', drill: drillKey, round: round,
        clubKey: K.CLUBS[Math.min(K.CLUBS.length - 1, round * 3)].key,
        venueKey: round === 2 ? 'aurelia' : (round === 1 ? 'harbour' : 'ashfield'),
        difficulty: 0.9 + round * 0.16, minutes: 0
      });
    }

    /* ------------------------------------------------------------- squad */
    showSquad(from) {
      this.clear();
      this.screen = 'squad';
      STATE.screen = 'squad';
      this.lastSquadFrom = from || 'title';
      var self = this;
      this.header('Squad', 'One keeper and four outfield. Tap to swap a name in or out.');

      var form = (save.season && save.season.form) || {};
      for (var i = 0; i < K.PLAYERS.length; i++) {
        var pl = K.PLAYERS[i];
        var col = i % 4, row = (i / 4) | 0;
        var cx = 150 + col * 220, cy = 178 + row * 150;
        var unlocked = save.unlocked.indexOf(pl.id) >= 0;
        var picked = save.lineup.indexOf(pl.id) >= 0;
        var f = num(form[pl.id], 1, 0.8, 1.2);

        this.layer.add(this.add.image(cx, cy + 18, 'te-panel-sm').setDisplaySize(202, 140));
        this.label(cx, cy - 36, '#' + pl.num + '  ' + pl.name, 20, unlocked ? INK : DIM, 'center').setFontStyle('700');
        this.label(cx, cy - 12, pl.role + '  ·  form ' + f.toFixed(2), 16, picked ? HOT : DIM, 'center');
        this.statBar(cx - 78, cy + 8, 'PAC', pl.pace, unlocked);
        this.statBar(cx - 78, cy + 30, 'POW', pl.power, unlocked);
        this.statBar(cx - 78, cy + 52, 'TEC', pl.tech, unlocked);

        if (!unlocked) {
          this.label(cx, cy + 78, K.UNLOCK_TEXT[pl.unlock] || 'Locked', 16, WARN, 'center');
        } else if (pl.role === 'GK') {
          this.label(cx, cy + 78, 'Always starts', 16, DIM, 'center');
        } else {
          (function (player, isPicked) {
            self.button(cx, cy + 80, 176, isPicked ? 'In the eleven' : 'Bring in', function () {
              self.togglePick(player.id);
            }, { small: true, size: 18, selected: isPicked });
          })(pl, picked);
        }
      }

      this.label(GW / 2, GH - 22, save.lineup.length + ' of 5 named  ·  ' +
        K.getPlayer(save.lineup[1] || 'marrow').note, 17, DIM, 'center');
      this.backButton(function () { if (self.lastSquadFrom === 'season') self.showSeason(); else self.showTitle(); });
      this.paintFocus();
    }

    statBar(x, y, label, value, bright) {
      this.label(x, y, label, 14, DIM, 'left', MONO);
      var w = 96, frac = C.clamp((value - 0.75) / 0.5, 0.06, 1);
      var g = this.add.graphics();
      g.fillStyle(0x0b2019, 0.9); g.fillRoundedRect(x + 34, y - 6, w, 11, 5);
      g.fillStyle(bright ? 0x27d0a0 : 0x50705f, 1); g.fillRoundedRect(x + 34, y - 6, Math.max(8, w * frac), 11, 5);
      this.layer.add(g);
    }

    togglePick(id) {
      var idx = save.lineup.indexOf(id);
      if (idx >= 0) {
        if (save.lineup.length <= 5) {
          // Swap out is only meaningful when a replacement exists.
          var spare = null;
          for (var i = 0; i < save.unlocked.length; i++) {
            var uid = save.unlocked[i];
            if (K.getPlayer(uid).role !== 'GK' && save.lineup.indexOf(uid) < 0) { spare = uid; break; }
          }
          if (!spare) { sfx('chip', 0.5); return; }
          save.lineup[idx] = spare;
        } else {
          save.lineup.splice(idx, 1);
        }
      } else {
        // Replace the last named outfield player.
        if (save.lineup.length >= 5) save.lineup[4] = id;
        else save.lineup.push(id);
      }
      persist();
      sfx('tap', 0.7);
      this.showSquad(this.lastSquadFrom || 'title');
    }

    /* ------------------------------------------------------------ launch */
    launchMatch(cfg) {
      cfg.lineup = save.lineup.slice();
      kit.audio.stopMusic(400);
      this.scene.start('match', cfg);
    }

    update() {
      // Force switches are readable from the live scene as well as boot.
      var fm = readForce('forceMode');
      if (fm && fm !== this.lastForce) {
        this.lastForce = fm;
        if (fm === 'quick') { this.showQuick(); this.startQuickFromStage(readForce('forceStage')); }
        else if (fm === 'season') { this.showSeason(); this.startSeasonFromStage(readForce('forceStage')); }
        else if (fm === 'drill') { this.showDrills(); this.startDrillFromStage(readForce('forceStage')); }
        else if (fm === 'menu' && this.screen !== 'title') this.showTitle();
      }
      STATE.forceMode = fm;
      STATE.forceStage = readForce('forceStage');
    }
  }

  /* ------------------------------------------------------- HUD digit row */
  // A fixed row of baked glyph sprites. Changing the string swaps frames and
  // never touches a canvas or uploads a texture.
  function makeDigitRow(scene, x, y, len, scale, tint) {
    var cells = [], w = A.DIGIT_W * scale;
    for (var i = 0; i < len; i++) {
      var im = scene.add.image(0, y, 'te-digits', A.DIGIT_FRAME[' ']).setScale(scale).setTint(tint);
      im.setVisible(false);
      cells.push(im);
    }
    return {
      cells: cells, x: x, y: y, w: w, shown: null,
      set: function (str) {
        if (this.shown === str) return;
        this.shown = str;
        var n = Math.min(str.length, this.cells.length);
        var startX = this.x - (n - 1) * this.w / 2;
        for (var j = 0; j < this.cells.length; j++) {
          var cell = this.cells[j];
          if (j >= n) { C.setVisibleIfChanged(cell, false); continue; }
          var frame = A.DIGIT_FRAME[str.charAt(j)];
          if (!frame) { C.setVisibleIfChanged(cell, false); continue; }
          if (cell.frame.name !== frame) cell.setFrame(frame);
          cell.setPosition(startX + j * this.w, this.y);
          C.setVisibleIfChanged(cell, true);
        }
      }
    };
  }

  /* ==================================================================== */
  /*  MATCH                                                                */
  /* ==================================================================== */
  var STEP = 1 / 60;

  // Speed scale from the portrait prototype to this landscape pitch. The
  // prototype's goal to goal run was 472 px; here it is 880, so every tuned
  // velocity and radius is multiplied by this factor and nothing else about
  // the feel changes.
  var S = 1.864;

  class MatchScene extends Phaser.Scene {
    constructor() { super('match'); }

    init(data) { this.cfg = data || {}; }

    create() {
      this.cameras.main.setZoom(RETINA_FACTOR);
      scenes.match = this;
      releaseAllClaims();
      refreshRect();

      this.venue = K.getVenue(this.cfg.venueKey);
      this.club = K.getClub(this.cfg.clubKey);
      A.buildPitch(this, this.venue, GW, GH);
      A.buildTeams(this, K.OWN_CLUB, this.club);

      this.bg = this.add.image(GW / 2, GH / 2, A.PITCH_KEY).setDepth(-30).setScale(1.035);

      this.buildEntities();
      this.buildFx();
      this.buildHud();
      this.buildControls();
      this.buildPauseMenu();

      this.acc = 0;
      this.lastForce = readForce('forceMode');
      this.lastForceStage = readForce('forceStage');
      this.keyState = Object.create(null);

      this.input.keyboard.on('keydown', this.onKeyDown, this);
      this.input.keyboard.on('keyup', this.onKeyUp, this);
      this.events.once('shutdown', function () {
        this.input.keyboard.off('keydown', this.onKeyDown, this);
        this.input.keyboard.off('keyup', this.onKeyUp, this);
        releaseAllClaims();
        scenes.match = null;
      }, this);

      this.setupRun();
    }

    /* --------------------------------------------------------- entities */
    buildEntities() {
      var i;
      this.players = [];
      for (i = 0; i < 10; i++) {
        var side = i < 5 ? 'own' : 'opp';
        var p = {
          idx: i, side: side, slot: i % 5, id: '', name: '', num: 0, role: 'DF',
          x: 0, y: 0, vx: 0, vy: 0, homeX: 0, homeY: 0,
          pace: 1, power: 1, tech: 1, stamina: 1, cooldown: 0,
          anim: 'idle', animT: 0, frame: 'idle', facing: side === 'own' ? 0 : Math.PI,
          slideT: 0, cheerT: 0, kickT: 0, active: false, alive: true
        };
        var sh = this.add.image(0, 0, 'te-shadow').setDepth(4).setAlpha(0.42).setDisplaySize(38, 26);
        var spr = this.add.image(0, 0, side === 'own' ? 'te-own' : 'te-opp', 'idle').setDepth(6);
        p.sprite = spr; p.shadow = sh;
        this.players.push(p);
      }
      this.own = this.players.slice(0, 5);
      this.opp = this.players.slice(5, 10);

      this.ring = this.add.image(-100, -100, 'te-ring').setDepth(5).setVisible(false);
      this.chev = this.add.image(-100, -100, 'te-chev').setDepth(7).setVisible(false);
      this.targetRing = this.add.image(-100, -100, 'te-ring').setDepth(5).setVisible(false).setScale(0.62).setTint(0xffd166);

      this.ball = {
        x: P.midX, y: P.midY, vx: 0, vy: 0, spin: 0, owner: null, ownerIdx: -1,
        noPickIdx: -1, noPickT: 0, rot: 0, lastKicker: -1
      };
      this.ballShadow = this.add.image(0, 0, 'te-shadow').setDepth(7).setAlpha(0.4).setDisplaySize(20, 14);
      this.ballHalo = this.add.image(0, 0, 'te-p-soft').setDepth(8).setAlpha(0.3)
        .setDisplaySize(46, 46).setTint(0xfff3c8).setBlendMode(Phaser.BlendModes.ADD);
      this.ballSprite = this.add.image(P.midX, P.midY, 'te-ball').setDepth(9);
      this.trail = new C.Ring(12, function () { return { x: 0, y: 0 }; });
      this.trailDots = [];
      for (i = 0; i < 8; i++) {
        this.trailDots.push(this.add.image(-100, -100, 'te-p-soft').setDepth(8).setVisible(false).setTint(0xfff6d0));
      }

      // Drill props: gates and target panels, preallocated and reused.
      this.gates = [];
      for (i = 0; i < 8; i++) {
        var gA = this.add.image(-200, -200, 'te-p-soft').setDepth(3).setTint(0xffd166).setVisible(false).setDisplaySize(26, 26);
        var gB = this.add.image(-200, -200, 'te-p-soft').setDepth(3).setTint(0xffd166).setVisible(false).setDisplaySize(26, 26);
        var gC = this.add.image(-200, -200, 'te-p-fleck').setDepth(2).setTint(0xffd166).setVisible(false).setAlpha(0.2);
        this.gates.push({ x: 0, y: 0, half: 46, done: false, a: gA, b: gB, beam: gC, live: false });
      }
      this.panels = [];
      for (i = 0; i < 3; i++) {
        var pnl = this.add.image(-200, -200, 'te-p-fleck').setDepth(3).setTint(0xffd166).setVisible(false);
        this.panels.push({ x: 0, y: 0, h: 40, hit: false, img: pnl, live: false });
      }

      this.offsideLine = this.add.graphics().setDepth(2);
      this.aim = this.add.graphics().setDepth(12);
    }

    buildFx() {
      // Six pooled emitters: turf divots, contact sparks, shockwave rings,
      // celebration confetti, sprint dust and the venue weather bed.
      this.fxTurf = this.add.particles(0, 0, 'te-p-fleck', {
        speed: { min: 40, max: 190 }, lifespan: 520, quantity: 1, gravityY: 90,
        scale: { start: 1.0, end: 0.2 }, rotate: { min: -180, max: 180 },
        tint: [0x2f7a45, 0x4b8f4f, 0x6b5a33], emitting: false
      }).setDepth(8);
      this.fxSpark = this.add.particles(0, 0, 'te-p-soft', {
        speed: { min: 60, max: 240 }, lifespan: 360, quantity: 1,
        scale: { start: 0.6, end: 0 }, blendMode: 'ADD', emitting: false
      }).setDepth(10);
      this.fxRing = this.add.particles(0, 0, 'te-p-ring', {
        speed: 0, lifespan: 420, quantity: 1, scale: { start: 0.25, end: 1.5 },
        alpha: { start: 0.75, end: 0 }, blendMode: 'ADD', emitting: false
      }).setDepth(10);
      this.fxConf = this.add.particles(0, 0, 'te-p-conf', {
        speed: { min: 120, max: 460 }, lifespan: 1600, quantity: 1, gravityY: 340,
        scale: { start: 1, end: 0.7 }, rotate: { min: -260, max: 260 },
        tint: [0xffd166, 0x27d0a0, 0xff7b6b, 0x9ecbff, 0xffffff], emitting: false
      }).setDepth(24);
      this.fxDust = this.add.particles(0, 0, 'te-p-soft', {
        speed: { min: 10, max: 60 }, lifespan: 460, quantity: 1,
        scale: { start: 0.34, end: 0 }, alpha: { start: 0.35, end: 0 },
        tint: 0xdff0e4, emitting: false
      }).setDepth(5);
      this.fxWeather = this.add.particles(0, 0, 'te-p-drop', {
        x: { min: -40, max: GW + 40 }, y: -20,
        lifespan: 1400, quantity: 1, frequency: 40,
        scale: { start: 1, end: 1 }, alpha: { start: 0.5, end: 0.1 },
        speedY: { min: 460, max: 620 }, speedX: { min: -140, max: -60 },
        emitting: false
      }).setDepth(11);

      // Crowd wave sprites, additive, only shown on a goal.
      this.waves = [];
      for (var i = 0; i < 4; i++) {
        this.waves.push(this.add.image(-300, i < 2 ? 30 : GH - 20, 'te-wave')
          .setDepth(-29).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
          .setVisible(false).setScale(1.4, 1.1));
      }
      // A full stage additive plate is the single most expensive quad in the
      // scene, so it is hidden outright rather than drawn at alpha zero.
      this.flash = this.add.image(GW / 2, GH / 2, 'te-p-soft')
        .setDepth(23).setDisplaySize(GW * 1.6, GH * 1.9).setAlpha(0)
        .setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    }

    /* -------------------------------------------------------------- HUD */
    buildHud() {
      this.hud = this.add.container(0, 0).setDepth(20).setScrollFactor(0);

      this.hud.add(this.add.image(GW / 2, 30, 'te-band').setDisplaySize(560, 56));
      this.homeName = this.add.text(GW / 2 - 148, 30, K.OWN_CLUB.short, {
        fontFamily: FONT, fontSize: '22px', fontStyle: '800', color: INK
      }).setOrigin(0.5);
      this.awayName = this.add.text(GW / 2 + 148, 30, this.club.short, {
        fontFamily: FONT, fontSize: '22px', fontStyle: '800', color: INK
      }).setOrigin(0.5);
      this.scoreRow = makeDigitRow(this, GW / 2, 24, 7, 1, 0xe9fbf1);
      this.clockRow = makeDigitRow(this, GW / 2, 48, 12, 0.55, 0x8fb7a6);
      this.hud.add([this.homeName, this.awayName]);
      this.hud.add(this.scoreRow.cells);
      this.hud.add(this.clockRow.cells);

      // Team colour marks either side of the score so identity never depends
      // on the shirt colour alone.
      var g = this.add.graphics();
      g.fillStyle(K.OWN_CLUB.primary, 1); g.fillRoundedRect(GW / 2 - 222, 20, 8, 22, 3);
      g.fillStyle(this.club.primary, 1); g.fillRoundedRect(GW / 2 + 214, 20, 8, 22, 3);
      this.hud.add(g);

      // Stamina meter for the controlled player, an icon free bar under the
      // band. It replaces the prototype's TIRED text popup. Two sprites, so
      // no Graphics command list is replayed every frame.
      this.stamTrack = this.add.image(GW / 2, 61, 'te-p-fleck').setDisplaySize(142, 8).setAlpha(0.5).setTint(0x061a12);
      this.stamFill = this.add.image(GW / 2 - 70, 61, 'te-p-fleck').setOrigin(0, 0.5).setDisplaySize(140, 6).setTint(0x27d0a0);
      this.hud.add([this.stamTrack, this.stamFill]);

      // One corner chip. Queued, never stacked.
      this.chipImg = this.add.image(348, GH - 28, 'te-chip').setAlpha(0);
      this.chipText = this.add.text(348, GH - 28, '', {
        fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: INK
      }).setOrigin(0.5).setAlpha(0);
      this.hud.add([this.chipImg, this.chipText]);
      this.chipT = 0; this.chipQueue = [];

      // Thin coach strip at the top edge, one line, fades after three seconds.
      this.stripImg = this.add.image(GW / 2, 76, 'te-strip').setAlpha(0);
      this.stripText = this.add.text(GW / 2, 76, '', {
        fontFamily: FONT, fontSize: '19px', color: INK
      }).setOrigin(0.5).setAlpha(0);
      this.hud.add([this.stripImg, this.stripText]);
      this.stripT = 0;

      // Run boundary banner: 60 percent stage width, overshoot in, only at
      // kickoff, goals, full time and medal ceremonies.
      this.bannerImg = this.add.image(GW / 2, GH / 2 - 30, 'te-banner').setAlpha(0);
      this.bannerText = this.add.text(GW / 2, GH / 2 - 44, '', {
        fontFamily: FONT, fontSize: '40px', fontStyle: '800', color: INK
      }).setOrigin(0.5).setAlpha(0);
      this.bannerSub = this.add.text(GW / 2, GH / 2 - 6, '', {
        fontFamily: FONT, fontSize: '20px', color: WARN
      }).setOrigin(0.5).setAlpha(0);
      this.hud.add([this.bannerImg, this.bannerText, this.bannerSub]);
      this.bannerT = 0;
      this.hud.setScrollFactor(0, 0, true);

      // Results card, shown at the end of a run only.
      this.result = this.add.container(GW / 2, GH / 2).setDepth(28).setVisible(false).setScrollFactor(0);
      this.resultBg = this.add.image(0, 0, 'te-panel').setDisplaySize(560, 330);
      this.resultTitle = this.add.text(0, -128, '', { fontFamily: FONT, fontSize: '34px', fontStyle: '800', color: INK }).setOrigin(0.5);
      this.resultScore = this.add.text(0, -78, '', { fontFamily: MONO, fontSize: '46px', fontStyle: '700', color: INK }).setOrigin(0.5);
      this.resultMedal = this.add.image(-176, -78, 'te-medal-none').setScale(0.9);
      this.resultLines = [];
      for (var i = 0; i < 4; i++) {
        var t = this.add.text(0, -22 + i * 26, '', { fontFamily: FONT, fontSize: '19px', color: DIM }).setOrigin(0.5);
        this.resultLines.push(t);
      }
      this.result.add([this.resultBg, this.resultTitle, this.resultScore, this.resultMedal].concat(this.resultLines));
      this.result.setScrollFactor(0, 0, true);
      this.resultButtons = [];
    }

    /* --------------------------------------------------------- controls */
    buildControls() {
      this.ctl = this.add.container(0, 0).setDepth(21).setScrollFactor(0);
      this.stickBase = this.add.image(150, GH - 118, 'te-stick').setAlpha(0.4);
      this.stickKnob = this.add.image(150, GH - 118, 'te-knob').setAlpha(0.55);
      this.sprintBtn = this.add.image(GW - 70, GH - 74, 'te-act-sprint').setAlpha(0.62);
      this.tackleBtn = this.add.image(GW - 176, GH - 52, 'te-act-tackle').setAlpha(0.62);
      this.pauseBtn = this.add.image(GW - 44, 34, 'te-act-pause').setAlpha(0.5).setScale(0.56);
      this.ctl.add([this.stickBase, this.stickKnob, this.sprintBtn, this.tackleBtn, this.pauseBtn]);
      this.ctl.setScrollFactor(0, 0, true);

      this.stick = { x: 0, y: 0, cx: 150, cy: GH - 118, active: false };
      this.sprintHeld = false;
      this.tackleDownAt = 0;
      this.aimActive = false;
      this.aimStartX = 0; this.aimStartY = 0; this.aimX = 0; this.aimY = 0; this.aimCurve = 0;
    }

    buildPauseMenu() {
      this.pauseUi = this.add.container(GW / 2, GH / 2).setDepth(30).setVisible(false).setScrollFactor(0);
      var bg = this.add.image(0, 0, 'te-panel').setDisplaySize(420, 300);
      var title = this.add.text(0, -116, 'Paused', { fontFamily: FONT, fontSize: '32px', fontStyle: '800', color: INK }).setOrigin(0.5);
      this.pauseUi.add([bg, title]);
      var self = this;
      var rows = [
        ['Resume', function () { self.setMenuPause(false); }],
        ['Restart', function () { self.setMenuPause(false); self.restartRun(); }],
        ['Settings', function () { kit.openSettings(); }],
        ['Leave match', function () { self.setMenuPause(false); self.quitToMenu(); }]
      ];
      for (var i = 0; i < rows.length; i++) {
        (function (row, idx) {
          var img = self.add.image(0, -50 + idx * 62, 'te-btn').setDisplaySize(300, 54);
          var txt = self.add.text(0, -50 + idx * 62, row[0], { fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: INK }).setOrigin(0.5);
          img.setInteractive({ useHandCursor: true });
          img.on('pointerup', function () { sfx('tap', 0.7); row[1](); });
          self.pauseUi.add([img, txt]);
        })(rows[i], i);
      }
      this.pauseUi.setScrollFactor(0, 0, true);
      this.menuPaused = false;
    }

    /* -------------------------------------------------------- run setup */
    setupRun() {
      var cfg = this.cfg;
      this.mode = cfg.mode || 'quick';
      this.isDrill = this.mode === 'drill';
      this.drill = this.isDrill ? K.getDrill(cfg.drill) : null;
      this.drillRound = this.isDrill ? C.clamp(cfg.round | 0, 0, 2) : 0;
      this.difficulty = num(cfg.difficulty, 1, 0.6, 1.6);
      this.minutes = num(cfg.minutes, 3, 0, 10);
      this.isFinal = !!cfg.final;

      this.ownScore = 0; this.oppScore = 0;
      this.clock = this.minutes * 60;
      this.ended = false;
      this.phase = 'kickoff';
      this.phaseT = 1.6;
      this.restartDelay = 0;
      this.kickCooldown = 0;
      this.possession = 'own';
      this.activeIdx = 4;
      this.shots = 0; this.onTarget = 0; this.saves = 0; this.tackles = 0;
      this.goalScorers = [];
      this.gust = 0; this.gustT = 0;
      this.hitStopFrames = 0;
      this.chipQueue.length = 0; this.chipT = 0;
      this.bannerT = 0; this.stripT = 0;
      this.resultShown = false;
      this.tutorialStep = save.tutorialDone ? -1 : 0;
      this.tutorialT = 0;

      this.drillValue = 0;
      this.drillTimer = 0;
      this.drillIndex = 0;
      this.drillShots = 0;
      this.drillDone = false;
      this.drillStartAt = 0;

      this.setupTeams();
      this.setupWeather();
      this.applyModeSetup();

      STATE.mode = this.isDrill ? 'drill' : this.mode;
      STATE.screen = 'play';
      STATE.club = this.club.key;
      STATE.venue = this.venue.key;
      STATE.difficulty = this.difficulty;
      STATE.drill = this.isDrill ? this.drill.key : '';
      STATE.drillRound = this.drillRound;
      STATE.minutes = this.minutes;
      STATE.medal = 'none';

      kit.audio.music(this.isFinal ? 'pressure' : 'matchday', 700);
      sfx('whistle', 0.8);

      if (this.isDrill) {
        this.banner(this.drill.name, 'Round ' + (this.drillRound + 1));
        this.coach(this.drill.brief);
      } else {
        this.banner('KICK OFF', K.OWN_CLUB.short + '  v  ' + this.club.short + '   ·   ' + this.venue.name);
        if (this.tutorialStep >= 0) this.coach(TUTORIAL[0].text);
        else this.coach(this.club.note);
      }
    }

    setupTeams() {
      var lineup = Array.isArray(this.cfg.lineup) ? this.cfg.lineup : save.lineup;
      var form = (save.season && save.season.form) || {};
      var i, p, def;
      for (i = 0; i < 5; i++) {
        p = this.own[i];
        var pid = lineup[i];
        def = K.getPlayer(K.hasPlayer(pid) ? pid : K.PLAYERS[i].id);
        var slot = K.OWN_SLOTS[i];
        p.id = def.id; p.name = def.name; p.num = def.num; p.role = slot.role;
        var f = num(form[def.id], 1, 0.8, 1.2);
        p.pace = def.pace * f; p.power = def.power * f; p.tech = def.tech * f;
        p.homeX = slot.x; p.homeY = slot.y; p.x = slot.x; p.y = slot.y;
        p.vx = 0; p.vy = 0; p.stamina = 1; p.cooldown = 0;
        p.anim = 'idle'; p.animT = 0; p.slideT = 0; p.cheerT = 0; p.kickT = 0;
        p.facing = 0; p.alive = true;
        p.sprite.setTexture(i === 0 ? 'te-own-gk' : 'te-own', 'idle');
      }
      var oppNames = ['Kestrel', 'Barrow', 'Fenn', 'Larkin', 'Dray'];
      var r = this.difficulty * this.club.rating;
      for (i = 0; i < 5; i++) {
        p = this.opp[i];
        var os = K.OPP_SLOTS[i];
        p.id = 'opp' + i; p.name = oppNames[i]; p.num = [1, 2, 5, 6, 9][i]; p.role = os.role;
        p.pace = (0.84 + i * 0.035) * r; p.power = (0.86 + i * 0.03) * r; p.tech = (0.82 + i * 0.04) * r;
        p.homeX = os.x; p.homeY = os.y; p.x = os.x; p.y = os.y;
        p.vx = 0; p.vy = 0; p.stamina = 1; p.cooldown = 0;
        p.anim = 'idle'; p.animT = 0; p.slideT = 0; p.cheerT = 0; p.kickT = 0;
        p.facing = Math.PI; p.alive = true;
        p.sprite.setTexture(i === 0 ? 'te-opp-gk' : 'te-opp', 'idle');
      }
      this.setActive(4);
      this.resetBallTo(this.own[4], true);
    }

    setupWeather() {
      var v = this.venue;
      this.roll = v.roll;
      this.gustPower = v.gust;
      this.fxWeather.stop();
      if (v.weather === 'rain') {
        this.fxWeather.setConfig({
          x: { min: -40, max: GW + 60 }, y: -20, lifespan: 900, quantity: 2, frequency: 26,
          scale: { start: 1, end: 1 }, alpha: { start: 0.42, end: 0.08 },
          speedY: { min: 620, max: 780 }, speedX: { min: -150, max: -90 }, tint: 0xbfe0f0
        });
        this.fxWeather.start();
      } else if (v.weather === 'wind') {
        this.fxWeather.setConfig({
          x: -20, y: { min: 60, max: GH - 60 }, lifespan: 1500, quantity: 1, frequency: 90,
          scale: { start: 0.7, end: 0.2 }, alpha: { start: 0.3, end: 0 },
          speedX: { min: 260, max: 420 }, speedY: { min: -30, max: 30 }, tint: 0xf2f7ea,
          rotate: 90
        });
        this.fxWeather.start();
      } else if (v.weather === 'dew') {
        this.fxWeather.setConfig({
          x: { min: 0, max: GW }, y: { min: 90, max: GH - 90 }, lifespan: 2600, quantity: 1, frequency: 180,
          scale: { start: 0.22, end: 0 }, alpha: { start: 0.3, end: 0 },
          speedX: { min: -12, max: 12 }, speedY: { min: -22, max: -6 }, tint: 0xbfe9ff, rotate: 0
        });
        this.fxWeather.start();
      }
    }

    applyModeSetup() {
      var i;
      for (i = 0; i < this.gates.length; i++) {
        this.gates[i].live = false;
        this.gates[i].a.setVisible(false); this.gates[i].b.setVisible(false); this.gates[i].beam.setVisible(false);
      }
      for (i = 0; i < this.panels.length; i++) { this.panels[i].live = false; this.panels[i].img.setVisible(false); }

      if (!this.isDrill) {
        for (i = 0; i < 10; i++) this.players[i].alive = true;
        return;
      }
      var key = this.drill.key;
      if (key === 'slalom') {
        // Only the carrier and a token chaser.
        for (i = 0; i < 10; i++) this.players[i].alive = (i === 3) || (i === 9);
        this.setActive(3);
        this.own[3].x = P.left + 90; this.own[3].y = P.midY;
        this.opp[4].x = P.left + 250; this.opp[4].y = P.midY + 120;
        this.buildSlalom();
        this.resetBallTo(this.own[3], true);
        this.clock = this.drill.seconds;
      } else if (key === 'accuracy') {
        for (i = 0; i < 10; i++) this.players[i].alive = (i === 4);
        this.setActive(4);
        this.own[4].x = P.midX + 40; this.own[4].y = P.midY;
        this.buildPanels();
        this.resetBallTo(this.own[4], true);
        this.clock = this.drill.seconds;
      } else {
        for (i = 0; i < 10; i++) this.players[i].alive = (i === 4) || (i === 5);
        this.setActive(4);
        this.opp[0].x = P.right - 46; this.opp[0].y = P.midY;
        this.clock = 0;
        this.setupPenalty();
      }
      this.drillStartAt = this.time.now;
      this.phase = 'live';
      this.phaseT = 0;
    }

    buildSlalom() {
      var n = 5 + this.drillRound;
      var half = 58 - this.drillRound * 9;
      for (var i = 0; i < this.gates.length; i++) {
        var g = this.gates[i];
        g.live = i < n;
        g.done = false;
        if (!g.live) { g.a.setVisible(false); g.b.setVisible(false); g.beam.setVisible(false); continue; }
        g.x = P.left + 210 + i * ((P.right - P.left - 300) / Math.max(1, n - 1));
        g.y = P.midY + Math.sin(i * 1.5 + this.drillRound) * 128;
        g.half = half;
        g.a.setPosition(g.x, g.y - half).setVisible(true).setDisplaySize(30, 30);
        g.b.setPosition(g.x, g.y + half).setVisible(true).setDisplaySize(30, 30);
        g.beam.setPosition(g.x, g.y).setVisible(true).setDisplaySize(9, half * 2);
      }
      this.drillIndex = 0;
    }

    buildPanels() {
      var h = 18 - this.drillRound * 4;
      for (var i = 0; i < 3; i++) {
        var pn = this.panels[i];
        pn.live = true;
        pn.hit = false;
        pn.h = h;
        pn.x = P.right - 10;
        pn.y = P.midY + (i - 1) * (P.goalHalf * 0.7);
        pn.img.setPosition(pn.x, pn.y).setDisplaySize(14, h * 2).setTint(0xffd166).setVisible(true).setAlpha(0.6);
      }
      this.litPanel = 0;
    }

    setupPenalty() {
      this.drillShots = 0;
      this.drillValue = 0;
      this.placePenalty();
    }

    placePenalty() {
      var st = this.own[4];
      st.x = P.right - P.spotDepth - 44; st.y = P.midY;
      st.vx = 0; st.vy = 0;
      this.opp[0].x = P.right - 44; this.opp[0].y = P.midY;
      this.opp[0].vx = 0; this.opp[0].vy = 0;
      this.resetBallTo(st, true);
      this.kickCooldown = 0.25;
      this.keeperDive = 0;
      this.keeperCommitted = false;
    }

    /* ------------------------------------------------------------ helpers */
    setActive(i) {
      this.activeIdx = C.clamp(i | 0, 0, 4);
      for (var q = 0; q < 5; q++) this.own[q].active = (q === this.activeIdx);
    }

    activePlayer() { return this.own[this.activeIdx]; }

    carrier() {
      var b = this.ball;
      if (!b.owner || b.ownerIdx < 0) return null;
      return this.players[b.ownerIdx] || null;
    }

    resetBallTo(p, own) {
      var b = this.ball;
      b.owner = own ? 'own' : 'opp';
      b.ownerIdx = p.idx;
      b.x = p.x + (own ? 22 : -22); b.y = p.y;
      b.vx = 0; b.vy = 0; b.spin = 0;
      b.noPickIdx = -1; b.noPickT = 0;
      this.possession = b.owner;
      this.trail.clear();
      if (p.side === 'own') this.setActive(p.slot);
    }

    /* ----------------------------------------------------- pointer zones */
    acceptsPointers() { return !this.menuPaused && !this.resultShown; }

    claimZone(gx, gy) {
      if (this.menuPaused || this.resultShown) return '';
      if (C.dist(gx, gy, this.pauseBtn.x, this.pauseBtn.y) < 42) return 'pause';
      if (C.dist(gx, gy, this.sprintBtn.x, this.sprintBtn.y) < 56) return 'sprint';
      if (C.dist(gx, gy, this.tackleBtn.x, this.tackleBtn.y) < 56) return 'tackle';
      if (gx < 330 && gy > GH * 0.5) return 'stick';
      if (gy > 62 && gy < GH - 12) return 'pitch';
      return '';
    }

    onClaimDown(rec) {
      if (rec.zone === 'stick') {
        this.stick.cx = C.clamp(rec.sx, 96, 280);
        this.stick.cy = C.clamp(rec.sy, GH * 0.5 + 30, GH - 62);
        this.stick.active = true;
        this.updateStick(rec);
      } else if (rec.zone === 'sprint') {
        this.sprintHeld = true;
        this.sprintBtn.setAlpha(0.95);
      } else if (rec.zone === 'tackle') {
        this.tackleDownAt = rec.t0;
        this.tackleBtn.setAlpha(0.95);
      } else if (rec.zone === 'pitch') {
        var c = this.carrier();
        if (c && c.side === 'own' && C.dist(rec.sx, rec.sy, c.x, c.y) < 130) {
          this.aimActive = true;
          this.aimStartX = rec.sx; this.aimStartY = rec.sy;
          this.aimX = rec.sx; this.aimY = rec.sy; this.aimCurve = 0;
        }
      }
    }

    onClaimMove(rec) {
      if (rec.zone === 'stick') this.updateStick(rec);
      else if (rec.zone === 'pitch' && this.aimActive) {
        this.aimX = rec.gx; this.aimY = rec.gy;
        this.aimCurve = C.clamp(rec.curve / 26000, -1, 1);
      }
    }

    onClaimUp(rec, cancelled) {
      if (rec.zone === 'stick') {
        this.stick.active = false; this.stick.x = 0; this.stick.y = 0;
      } else if (rec.zone === 'sprint') {
        this.sprintHeld = false; this.sprintBtn.setAlpha(0.62);
      } else if (rec.zone === 'tackle') {
        this.tackleBtn.setAlpha(0.62);
        if (!cancelled && !kit.paused) {
          var held = performance.now() - rec.t0;
          this.doTackle(held >= 180);
        }
        this.tackleDownAt = 0;
      } else if (rec.zone === 'pause') {
        if (!cancelled) this.setMenuPause(true);
      } else if (rec.zone === 'pitch') {
        if (cancelled) { this.aimActive = false; return; }
        var dx = rec.gx - rec.sx, dy = rec.gy - rec.sy;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (this.aimActive && len >= 26) {
          this.releaseAim(dx, dy, len, C.clamp(rec.curve / 26000, -1, 1));
        } else {
          this.switchToNearest(rec.gx, rec.gy);
        }
        this.aimActive = false;
      }
    }

    updateStick(rec) {
      var dx = rec.gx - this.stick.cx, dy = rec.gy - this.stick.cy;
      var n = C.norm(dx, dy, NRM);
      var d = C.clamp(n.len / 62, 0, 1);
      this.stick.x = n.x * d; this.stick.y = n.y * d;
    }

    /* ------------------------------------------------------------- input */
    onKeyDown(e) {
      var code = e.code;
      if (KEY_BLOCK[code]) e.preventDefault();
      if (this.keyState[code]) return;
      this.keyState[code] = 1;
      if (kit.paused && code !== 'Escape' && code !== 'KeyP') return;
      if (code === 'Escape' || code === 'KeyP') { this.setMenuPause(!this.menuPaused); return; }
      if (this.menuPaused || this.resultShown) {
        if (code === 'Enter' || code === 'Space') {
          if (this.resultShown && this.resultButtons.length) this.resultButtons[0].__pick();
          else this.setMenuPause(false);
        }
        return;
      }
      if (code === 'KeyJ') this.keyKick(false);
      else if (code === 'KeyK') this.keyKick(true);
      else if (code === 'Space') this.doTackle(false);
      else if (code === 'KeyQ' || code === 'Tab') this.cycleActive();
      else if (code === 'KeyR') this.restartRun();
    }

    onKeyUp(e) {
      this.keyState[e.code] = 0;
      if (e.code === 'Space') { /* tap tackle already fired on keydown */ }
    }

    keyAxis() {
      var k = this.keyState, x = 0, y = 0;
      if (k.ArrowLeft || k.KeyA) x -= 1;
      if (k.ArrowRight || k.KeyD) x += 1;
      if (k.ArrowUp || k.KeyW) y -= 1;
      if (k.ArrowDown || k.KeyS) y += 1;
      return C.norm(x, y, NRM);
    }

    keyKick(shoot) {
      var c = this.carrier();
      if (!c || c.side !== 'own') return;
      var a = this.keyAxis();
      var dx = a.len > 0 ? a.x : 1, dy = a.len > 0 ? a.y : 0;
      if (shoot) this.shoot(dx, dy, 0.9, 0);
      else this.pass(dx, dy, 0.7, 0);
    }

    cycleActive() {
      // Never grabs the goalkeeper, and never the player already carrying.
      var start = this.activeIdx;
      for (var i = 1; i <= 4; i++) {
        var idx = (start + i) % 5;
        if (idx === 0) continue;
        if (!this.own[idx].alive) continue;
        this.setActive(idx);
        this.chip(this.own[idx].name);
        sfx('chip', 0.5);
        this.markTutorial('switch');
        return;
      }
    }

    switchToNearest(gx, gy) {
      // Player identity is resolved against the live entity list, so a switch
      // can never grab a body that is not on the pitch.
      var best = -1, bd = 1e9;
      for (var i = 1; i < 5; i++) {
        var p = this.own[i];
        if (!p.alive) continue;
        var d = C.dist2(gx, gy, p.x, p.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0 || bd > 190 * 190) return;
      if (best === this.activeIdx) { this.doTackle(false); return; }
      this.setActive(best);
      this.chip(this.own[best].name);
      sfx('chip', 0.5);
      this.markTutorial('switch');
    }

    /* --------------------------------------------------------- gameplay */
    releaseAim(dx, dy, len, curve) {
      var c = this.carrier();
      if (!c || c.side !== 'own') return;
      var n = C.norm(dx, dy, NRM);
      var power = C.clamp(len / 230, 0.3, 1);
      if (this.isShotSwipe(n.x, len, c)) this.shoot(n.x, n.y, power, curve);
      else this.pass(n.x, n.y, power, curve);
    }

    isShotSwipe(nx, len, c) {
      if (this.isDrill && this.drill.key === 'penalty') return true;
      if (this.isDrill && this.drill.key === 'accuracy') return true;
      if (nx < 0.42) return false;
      if (len >= 130) return true;
      return c.x > P.midX + 120 && len >= 92;
    }

    pass(nx, ny, power, curve) {
      var c = this.carrier();
      if (!c || c.side !== 'own' || this.kickCooldown > 0 || this.phase !== 'live') return;
      var target = this.findPassTarget(c, nx, ny);
      var b = this.ball;
      b.owner = null; b.ownerIdx = -1;
      b.x = c.x + nx * 20; b.y = c.y + ny * 20;
      // Prototype pass: base speed plus a lead term toward the read receiver.
      var base = 240 * S * (0.62 + power * 0.5) * (0.9 + c.tech * 0.14);
      var lead = target ? 0.55 : 0;
      b.vx = nx * base + (target ? (target.x - c.x) * lead : 0);
      b.vy = ny * base + (target ? (target.y - c.y) * lead : 0);
      b.spin = curve * 0.8;
      b.noPickIdx = c.idx; b.noPickT = 0.18;
      b.lastKicker = c.idx;
      this.kickCooldown = 0.22;
      c.cooldown = 0.25;
      this.setAnim(c, 'kick');
      this.checkOffside(target, nx);
      this.burst(c.x + nx * 18, c.y + ny * 18, 0x8df1bc, 6);
      sfx('pass', 0.85, 0.95 + Math.random() * 0.1);
      this.markTutorial('pass');
      this.targetRing.setVisible(false);
    }

    shoot(nx, ny, power, curve) {
      var c = this.carrier();
      if (!c || c.side !== 'own' || this.kickCooldown > 0 || this.phase !== 'live') return;
      var b = this.ball;
      b.owner = null; b.ownerIdx = -1;
      b.x = c.x + nx * 22; b.y = c.y + ny * 22;
      var speed = (350 + c.power * 50) * S * (0.6 + power * 0.55);
      b.vx = nx * speed; b.vy = ny * speed;
      b.spin = curve * 1.8;
      b.noPickIdx = c.idx; b.noPickT = 0.24;
      b.lastKicker = c.idx;
      this.kickCooldown = 0.38;
      c.cooldown = 0.45;
      this.setAnim(c, 'kick');
      this.shots++;
      this.burst(c.x + nx * 20, c.y + ny * 20, 0xffd166, 10);
      this.turf(c.x, c.y + 8, 6);
      kit.juice.shake(2.4, 90);
      sfx('kick', 1, 0.95 + Math.random() * 0.1);
      this.markTutorial('shoot');
      this.targetRing.setVisible(false);
      if (this.isDrill && this.drill.key === 'penalty') this.onPenaltyTaken();
    }

    findPassTarget(c, nx, ny) {
      var best = null, score = -Infinity;
      for (var i = 0; i < 5; i++) {
        var p = this.own[i];
        if (p === c || !p.alive) continue;
        var n = C.norm(p.x - c.x, p.y - c.y, NRM);
        var s = n.x * nx + n.y * ny - n.len / (500 * S);
        if (s > score) { score = s; best = p; }
      }
      return best;
    }

    checkOffside(target, nx) {
      if (!target || nx <= 0.1 || this.isDrill) { this.offsideMark = null; return; }
      var lastX = this.secondLastOppX();
      if (target.x > lastX + 26 && target.x > P.midX) {
        this.offsideMark = target;
      } else this.offsideMark = null;
    }

    // Deepest and second deepest opponent in one allocation free pass.
    secondLastOppX() {
      var first = -Infinity, second = -Infinity, seen = 0;
      for (var i = 0; i < 5; i++) {
        var p = this.opp[i];
        if (!p.alive) continue;
        seen++;
        if (p.x > first) { second = first; first = p.x; }
        else if (p.x > second) { second = p.x; }
      }
      if (seen > 1) return second;
      return seen === 1 ? first : P.right;
    }

    doTackle(slide) {
      var p = this.activePlayer();
      if (!p || !p.alive || this.phase !== 'live' || p.cooldown > 0) return;
      var range = slide ? 86 * 1.45 : 86;
      var target = null, bd = 1e9;
      for (var i = 0; i < 5; i++) {
        var q = this.opp[i];
        if (!q.alive) continue;
        var d = C.dist2(p.x, p.y, q.x, q.y);
        if (d < bd) { bd = d; target = q; }
      }
      if (slide) {
        this.setAnim(p, 'slide');
        p.slideT = 0.45;
        p.cooldown = 0.55;
        var a = C.norm(this.moveIntentX(), this.moveIntentY(), NRM);
        var dirx = a.len > 0.1 ? a.x : 1, diry = a.len > 0.1 ? a.y : 0;
        p.vx = dirx * 430; p.vy = diry * 430;
        sfx('slide', 0.8);
        this.turf(p.x - dirx * 14, p.y - diry * 14, 8);
      } else {
        this.setAnim(p, 'kick');
        p.cooldown = 0.3;
      }
      if (!target || bd > range * range) return;
      var b = this.ball;
      if (b.owner === 'opp' && b.ownerIdx === target.idx) {
        // A late slide, after the carrier has released, concedes the free kick.
        var clean = slide ? (target.cooldown <= 0.05) : true;
        if (clean) {
          b.owner = 'own'; b.ownerIdx = p.idx; this.possession = 'own';
          b.x = p.x + 20; b.y = p.y;
          this.tackles++;
          this.chip('Won the ball');
          this.burst(target.x, target.y, 0x8df1bc, 12);
          kit.juice.shake(4, 120); kit.juice.hitStop(60);
          sfx('tackle', 1);
          this.markTutorial('tackle');
        } else {
          this.freeKick('opp', p.x, p.y, 'Free kick against');
          sfx('whistle', 0.7);
        }
      } else if (bd < range * range * 0.5) {
        target.vx += (target.x - p.x) * 2.4;
        target.vy += (target.y - p.y) * 2.4;
        this.burst(p.x, p.y, 0xffd166, 5);
        sfx('tackle', 0.6);
      }
    }

    freeKick(side, x, y, label) {
      var b = this.ball;
      var taker = null, bd = 1e9;
      var list = side === 'own' ? this.own : this.opp;
      for (var i = 1; i < 5; i++) {
        if (!list[i].alive) continue;
        var d = C.dist2(x, y, list[i].x, list[i].y);
        if (d < bd) { bd = d; taker = list[i]; }
      }
      if (!taker) taker = list[1];
      taker.x = C.clamp(x, P.left + 24, P.right - 24);
      taker.y = C.clamp(y, P.top + 20, P.bottom - 20);
      b.owner = side; b.ownerIdx = taker.idx;
      b.x = taker.x + (side === 'own' ? 20 : -20); b.y = taker.y;
      b.vx = 0; b.vy = 0; b.spin = 0;
      this.possession = side;
      this.kickCooldown = 0.4;
      if (side === 'own') this.setActive(taker.slot);
      this.chip(label);
      this.offsideMark = null;
    }

    moveIntentX() {
      var a = this.keyAxis();
      return this.stick.active ? this.stick.x : (a.len > 0 ? a.x : 0);
    }
    moveIntentY() {
      var a = this.keyAxis();
      return this.stick.active ? this.stick.y : (a.len > 0 ? a.y : 0);
    }

    /* -------------------------------------------------------------- sim */
    step(dt) {
      if (this.phase === 'kickoff') {
        this.phaseT -= dt;
        if (this.phaseT <= 0) { this.phase = 'live'; this.phaseT = 0; }
        this.updatePlayers(dt, true);
        return;
      }
      if (this.phase === 'goal') {
        this.phaseT -= dt;
        this.updatePlayers(dt, true);
        if (this.phaseT <= 0) this.resumeAfterGoal();
        return;
      }
      if (this.phase !== 'live') return;

      this.kickCooldown = Math.max(0, this.kickCooldown - dt);
      if (this.ball.noPickT > 0) this.ball.noPickT = Math.max(0, this.ball.noPickT - dt);

      // Wind gusts drift slowly so the player can read and use them.
      if (this.gustPower > 0) {
        this.gustT += dt;
        this.gust = Math.sin(this.gustT * 0.42) * this.gustPower;
      }

      if (this.isDrill) this.stepDrill(dt);
      else {
        this.clock = Math.max(0, this.clock - dt);
        if (this.restartDelay > 0) {
          this.restartDelay = Math.max(0, this.restartDelay - dt);
        }
      }

      this.updatePlayers(dt, false);
      this.updateBall(dt);
      this.updateKeepers(dt);
      this.updateTutorial(dt);

      if (!this.isDrill && this.clock <= 0 && !this.ended) this.finishMatch();
    }

    updatePlayers(dt, frozenBall) {
      var i, p;
      var b = this.ball;
      var intentX = this.moveIntentX(), intentY = this.moveIntentY();
      var sprint = (this.sprintHeld || !!this.keyState.ShiftLeft || !!this.keyState.ShiftRight);

      for (i = 0; i < 5; i++) {
        p = this.own[i];
        if (!p.alive) continue;
        p.cooldown = Math.max(0, p.cooldown - dt);
        if (p.slideT > 0) {
          p.slideT = Math.max(0, p.slideT - dt);
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= Math.pow(0.03, dt); p.vy *= Math.pow(0.03, dt);
          p.x = C.clamp(p.x, P.left + 12, P.right - 12);
          p.y = C.clamp(p.y, P.top + 12, P.bottom - 12);
          if (motionOn() && Math.random() < 0.5) this.fxDust.explode(1, p.x, p.y + 8);
          continue;
        }
        var isCarrier = (b.owner === 'own' && b.ownerIdx === p.idx);
        var isActive = (i === this.activeIdx);
        var tx = p.homeX, ty = p.homeY;

        if (i === 0) { continue; } // keeper is driven by updateKeepers
        if (isCarrier || isActive) {
          if (intentX || intentY) {
            tx = p.x + intentX * 200; ty = p.y + intentY * 200;
          } else if (isCarrier) { tx = p.x; ty = p.y; }
          else { tx = p.homeX + C.clamp((b.x - P.midX) * 0.3, -70, 70); ty = p.homeY + C.clamp((b.y - P.midY) * 0.24, -60, 60); }
        } else {
          // Shape: shift with the ball, stay in your lane.
          tx = p.homeX + C.clamp((b.x - P.midX) * 0.34, -110, 150);
          ty = p.homeY + C.clamp((b.y - P.midY) * 0.28, -70, 70);
          if (b.owner === 'own' && p.role === 'ST') tx += 60;
          if (b.owner === 'opp') tx -= 40;
        }
        tx = C.clamp(tx, P.left + 20, P.right - 20);
        ty = C.clamp(ty, P.top + 16, P.bottom - 16);

        var boost = (isActive && sprint && p.stamina > 0.12) ? 1.34 : 1;
        var speed = (p.pace * 130 + 36) * S / 1.864 * boost * (0.72 + p.stamina * 0.28);
        this.moveToward(p, tx, ty, speed * dt, dt);

        if (isActive) {
          var drain = sprint ? 0.075 : 0.014;
          p.stamina = C.clamp(p.stamina - dt * drain, 0.1, 1);
          if (sprint && motionOn() && Math.random() < 0.45) this.fxDust.explode(1, p.x - 10, p.y + 8);
        } else {
          p.stamina = C.clamp(p.stamina + dt * 0.03, 0.1, 1);
        }
      }

      for (i = 0; i < 5; i++) {
        p = this.opp[i];
        if (!p.alive || i === 0) continue;
        p.cooldown = Math.max(0, p.cooldown - dt);
        this.stepOpponent(p, i, dt, frozenBall);
      }

      // The carrier keeps the ball glued a body length in front.
      var c = this.carrier();
      if (c) {
        var dir = c.side === 'own' ? 1 : -1;
        var fn = C.norm(c.vx, c.vy, NRM);
        var ox = fn.len > 20 ? fn.x : dir, oy = fn.len > 20 ? fn.y : 0;
        b.x = c.x + ox * 22; b.y = c.y + oy * 22;
        b.vx = c.vx; b.vy = c.vy;
        b.x = C.clamp(b.x, P.left + 8, P.right - 8);
        b.y = C.clamp(b.y, P.top + 8, P.bottom - 8);
      }
    }

    stepOpponent(p, i, dt, frozen) {
      var b = this.ball, style = this.club.style;
      var tx = p.homeX, ty = p.homeY;
      var carrying = (b.owner === 'opp' && b.ownerIdx === p.idx);

      if (carrying) {
        // Drive at the goal, drift toward the middle for the shot.
        tx = P.left + 120; ty = C.lerp(p.y, P.midY, 0.4);
        if (p.cooldown <= 0 && p.x < P.left + 300) this.aiKick(p, true);
        else if (p.cooldown <= 0 && Math.random() < dt * (0.5 + this.difficulty * 0.4)) this.aiKick(p, false);
      } else if (style === 'press') {
        tx = C.clamp(b.x + (i - 2) * 26, P.left + 30, P.right - 30);
        ty = C.clamp(b.y - 60 + i * 30, P.top + 24, P.bottom - 24);
      } else if (style === 'wing') {
        tx = C.clamp(b.x - 40, P.left + 30, P.right - 30);
        ty = (i === 1) ? P.top + 40 : (i === 2 ? P.bottom - 40 : C.lerp(p.y, b.y, 0.5));
      } else if (style === 'counter') {
        if (b.owner === 'own') { tx = C.clamp(b.x + 90, P.midX - 40, P.right - 40); ty = C.lerp(p.homeY, b.y, 0.55); }
        else { tx = C.clamp(b.x - 140, P.left + 60, P.right - 40); ty = C.lerp(p.homeY, b.y, 0.4); }
      } else {
        tx = p.homeX + C.clamp((b.x - P.midX) * 0.36, -60, 60);
        ty = p.homeY + C.clamp((b.y - P.midY) * 0.24, -46, 46);
      }

      tx = C.clamp(tx, P.left + 24, P.right - 20);
      ty = C.clamp(ty, P.top + 16, P.bottom - 16);
      var speed = (p.pace * 104 + 32) * (0.8 + this.difficulty * 0.24);
      this.moveToward(p, tx, ty, speed * dt, dt);

      // Pressure: contest the carrier, then attempt the steal.
      if (!frozen && b.owner === 'own' && p.cooldown <= 0) {
        var pressRange = (style === 'press' ? 81 : 61);
        var c = this.carrier();
        if (c && C.dist2(p.x, p.y, c.x, c.y) < pressRange * pressRange) {
          this.trySteal(p, c, dt);
        }
      }
    }

    trySteal(defender, carrier, dt) {
      // Prototype odds (0.4 per contest) expressed as a rate so the result is
      // frame rate independent, modulated by the carrier's technique.
      var rate = 1.6 * this.difficulty / Math.max(0.7, carrier.tech);
      if (Math.random() > rate * dt) return;
      var b = this.ball;
      b.owner = 'opp'; b.ownerIdx = defender.idx;
      b.x = defender.x - 20; b.y = defender.y;
      this.possession = 'opp';
      defender.cooldown = 0.35;
      carrier.cooldown = 0.3;
      this.burst(carrier.x, carrier.y, 0xff5e73, 8);
      this.turf(carrier.x, carrier.y + 8, 5);
      sfx('tackle', 0.7);
      this.chip('Lost it');
      kit.juice.shake(3, 90);
    }

    aiKick(p, urgent) {
      var b = this.ball;
      if (b.owner !== 'opp' || b.ownerIdx !== p.idx) return;
      var shooting = urgent && p.x < P.left + 300;
      var targetX = P.left - 20;
      var targetY = P.midY + (Math.random() - 0.5) * P.goalHalf * 1.5;
      if (!shooting) {
        // Release ball to the most advanced free team mate.
        var best = null, bs = -Infinity;
        for (var i = 1; i < 5; i++) {
          var q = this.opp[i];
          if (q === p || !q.alive) continue;
          var s = -q.x + Math.random() * 60;
          if (s > bs) { bs = s; best = q; }
        }
        if (best) { targetX = best.x; targetY = best.y; }
      }
      var n = C.norm(targetX - p.x, targetY - p.y, NRM);
      b.owner = null; b.ownerIdx = -1;
      b.x = p.x + n.x * 20; b.y = p.y + n.y * 20;
      var power = shooting ? (205 + this.difficulty * 25) * S * 0.92 : (205 + this.difficulty * 25) * S * 0.6;
      b.vx = n.x * power; b.vy = n.y * power;
      b.spin = (Math.random() - 0.5) * 0.6;
      b.noPickIdx = p.idx; b.noPickT = 0.2;
      b.lastKicker = p.idx;
      p.cooldown = shooting ? 1.1 : 0.6;
      this.setAnim(p, 'kick');
      this.burst(p.x + n.x * 16, p.y + n.y * 16, 0xff5e73, 6);
      sfx(shooting ? 'kick' : 'pass', 0.7);
      if (shooting) this.chip('They shoot');
    }

    moveToward(p, tx, ty, step, dt) {
      var dx = tx - p.x, dy = ty - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.6) {
        var n = C.norm(dx, dy, NRM);
        var m = Math.min(d, step);
        p.x += n.x * m; p.y += n.y * m;
        p.vx = n.x * m / Math.max(dt, 1e-4);
        p.vy = n.y * m / Math.max(dt, 1e-4);
        p.facing = C.angleLerp(p.facing, Math.atan2(n.y, n.x), C.clamp(dt * 14, 0, 1));
      } else {
        p.vx *= 0.8; p.vy *= 0.8;
      }
      p.x = C.clamp(p.x, P.left + 10, P.right - 10);
      p.y = C.clamp(p.y, P.top + 10, P.bottom - 10);
    }

    updateBall(dt) {
      var b = this.ball;
      if (b.owner) return;

      var speed0 = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      b.x += b.vx * dt; b.y += b.vy * dt;

      // Rolling resistance. The prototype's 0.25 retention is the dry
      // baseline; wet and dewy grounds hold more of the velocity.
      var f = Math.pow(this.roll, dt);
      b.vx *= f; b.vy *= f;

      // Magnus: spin bends the flight perpendicular to travel.
      if (Math.abs(b.spin) > 0.01 && speed0 > 40) {
        var n = C.norm(b.vx, b.vy, NRM);
        b.vx += -n.y * b.spin * 210 * dt;
        b.vy += n.x * b.spin * 210 * dt;
        b.spin *= Math.pow(0.42, dt);
      }
      if (this.gust !== 0) b.vy += this.gust * dt;

      b.rot += (speed0 * dt) * 0.04;
      var t = this.trail.push();
      t.x = b.x; t.y = b.y;

      // Boards: five a side sides rebound rather than going out.
      if (b.y < P.top + 8) { b.y = P.top + 8; b.vy = Math.abs(b.vy) * 0.72; this.boardHit(b); }
      else if (b.y > P.bottom - 8) { b.y = P.bottom - 8; b.vy = -Math.abs(b.vy) * 0.72; this.boardHit(b); }

      if (b.x < P.left + 8) {
        if (Math.abs(b.y - P.midY) < P.goalHalf - 4) { this.scoreGoal('opp'); return; }
        if (Math.abs(Math.abs(b.y - P.midY) - P.goalHalf) < 12) this.postHit(b);
        b.x = P.left + 8; b.vx = Math.abs(b.vx) * 0.72; this.boardHit(b);
      } else if (b.x > P.right - 8) {
        // The accuracy drill owns the far goal line, so panels are resolved
        // before the goal test can swallow the shot.
        if (this.isDrill && this.drill.key === 'accuracy') { this.checkPanelHit(b); return; }
        if (Math.abs(b.y - P.midY) < P.goalHalf - 4) { this.scoreGoal('own'); return; }
        if (Math.abs(Math.abs(b.y - P.midY) - P.goalHalf) < 12) this.postHit(b);
        b.x = P.right - 8; b.vx = -Math.abs(b.vx) * 0.72; this.boardHit(b);
      }

      this.checkDeflections(dt, speed0);
      this.checkPickup(dt);
    }

    boardHit(b) {
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > 180) {
        this.burst(b.x, b.y, 0xdff0e4, 4);
        sfx('trap', C.clamp(sp / 800, 0.15, 0.6));
      }
    }

    postHit(b) {
      b.vx *= -0.8; b.vy += (Math.random() - 0.5) * 120;
      this.burst(b.x, b.y, 0xffffff, 10);
      this.ringPop(b.x, b.y, 0xffffff);
      kit.juice.shake(5, 140);
      sfx('post', 1);
      this.chip('Off the post');
    }

    checkDeflections(dt, speed) {
      if (speed < 200) return;
      var b = this.ball;
      for (var i = 0; i < 10; i++) {
        var p = this.players[i];
        if (!p.alive || p.idx === b.noPickIdx) continue;
        if (i % 5 === 0) continue; // keepers handled separately
        if (C.dist2(p.x, p.y, b.x, b.y) > 20 * 20) continue;
        var n = C.norm(b.x - p.x, b.y - p.y, NRM);
        if (n.len < 0.01) continue;
        var dot = b.vx * n.x + b.vy * n.y;
        b.vx = (b.vx - 2 * dot * n.x) * 0.55;
        b.vy = (b.vy - 2 * dot * n.y) * 0.55;
        b.spin += (Math.random() - 0.5) * 0.7;
        b.noPickIdx = p.idx; b.noPickT = 0.22;
        this.burst(b.x, b.y, p.side === 'own' ? 0x8df1bc : 0xff5e73, 6);
        sfx('trap', 0.7);
        this.chip('Deflection');
        return;
      }
    }

    checkPickup(dt) {
      var b = this.ball;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      for (var i = 0; i < 10; i++) {
        var p = this.players[i];
        if (!p.alive) continue;
        if (b.noPickT > 0 && p.idx === b.noPickIdx) continue;
        if (p.cooldown > 0.2) continue;
        var d2 = C.dist2(p.x, p.y, b.x, b.y);
        if (d2 > 32 * 32) continue;
        // Slow balls are collected outright; quicker ones need a first touch,
        // which the technique stat governs.
        var take = sp < 22 * S;
        if (!take && sp < 260) take = Math.random() < p.tech * dt * 4.2;
        if (!take) continue;
        b.owner = p.side; b.ownerIdx = p.idx;
        b.vx *= 0.1; b.vy *= 0.1; b.spin = 0;
        this.possession = p.side;
        if (p.side === 'own' && p.slot !== 0) this.setActive(p.slot);
        this.burst(b.x, b.y, p.side === 'own' ? 0x27d0a0 : 0xff5e73, 4);
        sfx('trap', 0.5);
        if (this.offsideMark && p === this.offsideMark) {
          this.offsideMark = null;
          this.freeKick('opp', p.x, p.y, 'Offside');
          sfx('whistle', 0.7);
        }
        if (this.isDrill && this.drill.key === 'slalom' && p.side === 'own') this.setActive(p.slot);
        return;
      }
    }

    updateKeepers(dt) {
      for (var s = 0; s < 2; s++) {
        var gk = s === 0 ? this.own[0] : this.opp[0];
        if (!gk.alive) continue;
        var goalX = s === 0 ? P.left : P.right;
        var dir = s === 0 ? 1 : -1;
        var b = this.ball;
        var lineX = goalX + dir * 38;
        var ty = C.clamp(b.y, P.midY - P.goalHalf + 10, P.midY + P.goalHalf - 10);
        var tx = lineX;

        var incoming = (!b.owner) && ((s === 0 && b.vx < -60) || (s === 1 && b.vx > 60));
        var toward = Math.abs(b.x - goalX) < 320;
        if (incoming && toward) {
          // Project the ball onto the goal line and commit.
          var tTo = Math.abs((goalX - b.x) / (b.vx || 1));
          var py = b.y + b.vy * tTo;
          ty = C.clamp(py, P.midY - P.goalHalf - 12, P.midY + P.goalHalf + 12);
          tx = lineX + dir * 8;
        }
        // In the shootout the keeper commits to a guessed corner instead of
        // reading the flight, which is what makes the drill a duel.
        if (s === 1 && this.penaltyLive && isFinite(this.keeperTargetY)) {
          ty = this.keeperTargetY;
          tx = lineX + dir * 10;
        }
        var gkSpeed = (150 + gk.pace * 90) * (incoming ? 1.7 : 1) * (0.85 + this.difficulty * 0.2);
        if (s === 0) gkSpeed *= 1.0;
        this.moveToward(gk, tx, ty, gkSpeed * dt, dt);
        gk.x = C.clamp(gk.x, s === 0 ? P.left + 12 : P.right - 90, s === 0 ? P.left + 90 : P.right - 12);
        gk.cooldown = Math.max(0, gk.cooldown - dt);

        if (!b.owner && gk.cooldown <= 0 && C.dist2(gk.x, gk.y, b.x, b.y) < 30 * 30) {
          this.keeperContact(gk, s);
        }
      }
    }

    keeperContact(gk, side) {
      var b = this.ball;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var reflex = C.clamp(0.9 - sp / (1500 * S) + gk.pace * 0.12 - (side === 1 ? 0 : 0.05), 0.2, 0.96);
      if (side === 1) reflex *= 0.86 + this.difficulty * 0.14;
      var catches = Math.random() < reflex * 0.55;
      if (catches) {
        b.owner = gk.side; b.ownerIdx = gk.idx;
        b.vx = 0; b.vy = 0; b.spin = 0;
        this.possession = gk.side;
        gk.cooldown = 0.7;
        this.burst(b.x, b.y, 0xffffff, 8);
        sfx('save', 1);
        if (side === 1) { this.saves++; this.chip('Keeper claims it'); }
        else this.chip('Vantly gathers');
        if (gk.side === 'own') {
          // Immediate release to the nearest team mate keeps the pace up.
          var self = this;
          this.time.delayedCall(600, function () {
            if (self.ball.ownerIdx === gk.idx && self.ball.owner === 'own') self.keeperRelease(gk);
          });
        } else {
          var self2 = this;
          this.time.delayedCall(700, function () {
            if (self2.ball.ownerIdx === gk.idx && self2.ball.owner === 'opp') self2.keeperRelease(gk);
          });
        }
        if (this.isDrill && this.drill.key === 'penalty' && side === 1) this.onPenaltyResolved(false);
      } else {
        // Parry: the ball squirts away at an angle, still live.
        var n = C.norm(b.x - gk.x, b.y - gk.y, NRM);
        var ax = n.len > 0.01 ? n.x : (side === 1 ? -1 : 1);
        var ay = n.len > 0.01 ? n.y : (Math.random() < 0.5 ? -1 : 1);
        var out = C.norm(ax + (side === 1 ? -0.8 : 0.8), ay + (Math.random() - 0.5) * 1.2, NRM);
        b.vx = out.x * sp * 0.5; b.vy = out.y * sp * 0.5;
        b.spin = (Math.random() - 0.5) * 0.8;
        b.noPickIdx = gk.idx; b.noPickT = 0.3;
        gk.cooldown = 0.45;
        this.setAnim(gk, 'slide'); gk.slideT = 0.001;
        this.burst(b.x, b.y, 0xffd166, 10);
        this.ringPop(b.x, b.y, 0xffd166);
        kit.juice.shake(4, 110);
        sfx('save', 0.9);
        this.chip(side === 1 ? 'Parried' : 'Vantly parries');
        if (side === 1) this.saves++;
      }
    }

    keeperRelease(gk) {
      var side = gk.side;
      var list = side === 'own' ? this.own : this.opp;
      var best = null, bs = -Infinity;
      for (var i = 1; i < 5; i++) {
        var q = list[i];
        if (!q.alive) continue;
        var s = (side === 'own' ? q.x : -q.x) + Math.random() * 40;
        if (s > bs) { bs = s; best = q; }
      }
      if (!best) return;
      var b = this.ball;
      var n = C.norm(best.x - gk.x, best.y - gk.y, NRM);
      b.owner = null; b.ownerIdx = -1;
      b.x = gk.x + n.x * 20; b.y = gk.y + n.y * 20;
      b.vx = n.x * 420; b.vy = n.y * 420;
      b.noPickIdx = gk.idx; b.noPickT = 0.2;
      this.setAnim(gk, 'kick');
      sfx('pass', 0.7);
    }

    /* ------------------------------------------------------------ scoring */
    scoreGoal(team) {
      if (this.phase !== 'live' || this.ended) return;
      var b = this.ball;
      b.owner = null; b.ownerIdx = -1;
      b.vx = 0; b.vy = 0; b.spin = 0;

      if (this.isDrill) {
        if (this.drill.key === 'penalty' && team === 'own') { this.onPenaltyResolved(true); return; }
        if (this.drill.key === 'accuracy') { this.resetAccuracyBall(); return; }
        this.resetBallTo(this.own[3] || this.own[4], true);
        return;
      }

      if (team === 'own') this.ownScore++; else this.oppScore++;
      this.phase = 'goal';
      this.phaseT = 2.1;
      this.restartDelay = 0;
      this.possession = team === 'own' ? 'opp' : 'own';
      this.offsideMark = null;

      var gx = team === 'own' ? P.right - 20 : P.left + 20;
      this.celebrate(gx, P.midY, team === 'own');

      if (team === 'own') {
        var scorer = this.players[b.lastKicker] || this.activePlayer();
        var nm = (scorer && scorer.side === 'own') ? scorer.name : this.activePlayer().name;
        this.goalScorers.push(nm);
        this.banner('GOAL', nm + '  ·  ' + this.ownScore + ' - ' + this.oppScore);
        sfx('goal', 1);
        for (var i = 0; i < 5; i++) if (this.own[i].alive && i !== 0) this.setAnim(this.own[i], 'cheer');
      } else {
        this.banner('THEY SCORE', this.club.short + '  ·  ' + this.ownScore + ' - ' + this.oppScore);
        sfx('concede', 1);
      }
    }

    celebrate(x, y, good) {
      kit.juice.shake(good ? 9 : 5, 260);
      kit.juice.hitStop(good ? 90 : 50);
      this.flashPop(good ? 0.5 : 0.28);
      if (motionOn()) {
        this.fxConf.explode(fxCount(good ? 46 : 16), x, y);
        this.fxSpark.explode(fxCount(good ? 26 : 12), x, y);
        this.fxRing.explode(1, x, y);
        if (good) {
          for (var i = 0; i < this.waves.length; i++) {
            var w = this.waves[i];
            w.x = 120 + i * 240;
            w.setAlpha(0.85).setVisible(true);
            this.tweens.add({
              targets: w, alpha: 0, x: w.x + 200, duration: 900, ease: 'Sine.easeOut',
              onComplete: function (tw, tg) { tg[0].setVisible(false); }
            });
          }
        }
      }
    }

    resumeAfterGoal() {
      this.phase = 'live';
      var i;
      for (i = 0; i < 5; i++) {
        this.own[i].x = K.OWN_SLOTS[i].x; this.own[i].y = K.OWN_SLOTS[i].y;
        this.own[i].vx = 0; this.own[i].vy = 0; this.own[i].cheerT = 0;
        this.setAnim(this.own[i], 'idle');
        this.opp[i].x = K.OPP_SLOTS[i].x; this.opp[i].y = K.OPP_SLOTS[i].y;
        this.opp[i].vx = 0; this.opp[i].vy = 0;
        this.setAnim(this.opp[i], 'idle');
      }
      var taker = this.possession === 'own' ? this.own[4] : this.opp[4];
      this.resetBallTo(taker, this.possession === 'own');
      this.kickCooldown = 0.4;
      sfx('whistle', 0.5);
    }

    /* -------------------------------------------------------------- drills */
    stepDrill(dt) {
      var d = this.drill.key;
      if (d === 'penalty') return;
      this.clock = Math.max(0, this.clock - dt);
      if (d === 'slalom') this.stepSlalom(dt);
      if (this.clock <= 0 && !this.ended) this.finishDrill();
    }

    stepSlalom(dt) {
      var c = this.carrier();
      var b = this.ball;
      var px = c ? c.x : b.x, py = c ? c.y : b.y;
      for (var i = 0; i < this.gates.length; i++) {
        var g = this.gates[i];
        if (!g.live || g.done) continue;
        if (i !== this.drillIndex) continue;
        if (Math.abs(px - g.x) < 16 && Math.abs(py - g.y) < g.half) {
          g.done = true;
          this.drillIndex++;
          this.drillValue++;
          this.burst(g.x, g.y, 0x27d0a0, 8);
          sfx('chip', 0.8);
          this.chip('Gate ' + this.drillValue);
        }
      }
      var total = 5 + this.drillRound;
      if (this.drillValue >= total && !this.ended) {
        this.drillTimer = this.time.now - this.drillStartAt;
        this.finishDrill();
      }
    }

    resetAccuracyBall() {
      var st = this.own[4];
      st.x = P.midX + 20 + Math.random() * 220;
      st.y = P.top + 60 + Math.random() * (P.bottom - P.top - 120);
      st.vx = 0; st.vy = 0;
      this.resetBallTo(st, true);
      this.kickCooldown = 0.2;
      this.litPanel = (Math.random() * 3) | 0;
    }

    checkPanelHit(b) {
      if (b.owner) return;
      for (var i = 0; i < 3; i++) {
        var pn = this.panels[i];
        if (!pn.live) continue;
        if (Math.abs(b.y - pn.y) > pn.h) continue;
        if (i === this.litPanel) {
          this.drillValue++;
          this.burst(pn.x, pn.y, 0x27d0a0, 14);
          this.ringPop(pn.x, pn.y, 0x27d0a0);
          sfx('goal', 0.6);
          this.chip('Hit ' + this.drillValue);
          kit.juice.shake(3, 90);
        } else {
          this.burst(pn.x, pn.y, 0xff5e73, 6);
          sfx('post', 0.5);
          this.chip('Wrong panel');
        }
        this.resetAccuracyBall();
        return;
      }
      this.resetAccuracyBall();
    }

    onPenaltyTaken() {
      // Keeper commits a beat after the strike, so the read is on the swipe.
      var gk = this.opp[0];
      var guess = (Math.random() - 0.5) * 2;
      var skill = 0.34 + this.drillRound * 0.2;
      var b = this.ball;
      var aim = C.clamp((b.vy) / 400, -1, 1);
      var dirGuess = (Math.random() < skill) ? aim : guess;
      this.keeperTargetY = C.clamp(P.midY + dirGuess * (P.goalHalf - 10), P.midY - P.goalHalf, P.midY + P.goalHalf);
      gk.cooldown = 0;
      this.penaltyLive = true;
      var self = this;
      this.time.delayedCall(1800, function () { if (self.penaltyLive) self.onPenaltyResolved(false); });
    }

    onPenaltyResolved(scored) {
      if (!this.penaltyLive) return;
      this.penaltyLive = false;
      if (scored) {
        this.drillValue++;
        this.celebrate(P.right - 30, P.midY, true);
        this.banner('SCORED', this.drillValue + ' of ' + (this.drillShots + 1));
        sfx('goal', 1);
      } else {
        this.chip('Saved');
        sfx('save', 0.9);
      }
      this.drillShots++;
      if (this.drillShots >= 5) {
        var self = this;
        this.time.delayedCall(900, function () { if (!self.ended) self.finishDrill(); });
      } else {
        var self2 = this;
        this.time.delayedCall(900, function () { if (!self2.ended) self2.placePenalty(); });
      }
    }

    finishDrill() {
      if (this.ended) return;
      this.ended = true;
      this.phase = 'end';
      var key = this.drill.key;
      var value = this.drillValue;
      if (key === 'slalom') {
        var total = 5 + this.drillRound;
        value = (this.drillValue >= total) ? Math.max(1, this.drillTimer | 0) : 0;
      }
      var medal = K.drillMedal(key, value);
      var prev = save.drills[key][this.drillRound] || 0;
      var better = (key === 'slalom')
        ? (value > 0 && (prev === 0 || value < prev))
        : (value > prev);
      if (better) { save.drills[key][this.drillRound] = value; }
      if (medal === 'gold' && K.drillMedal(key, prev) !== 'gold') save.stats.drillGolds++;
      persist();
      STATE.medal = medal;
      STATE.drillValue = value;

      var lines = [];
      if (key === 'slalom') {
        lines.push(value > 0 ? ('Lap ' + C.formatMs(value)) : 'Gauntlet not completed');
        lines.push('Gates ' + this.drillValue + ' of ' + (5 + this.drillRound));
      } else if (key === 'accuracy') {
        lines.push('Panels hit ' + value);
        lines.push('Gold at ' + this.drill.medal.gold + ' hits');
      } else {
        lines.push('Scored ' + value + ' of 5');
        lines.push('Gold at ' + this.drill.medal.gold + ' of 5');
      }
      lines.push(better ? 'New personal best' : 'Best stands');
      this.showResult(this.drill.name, medal === 'none' ? 'No medal' : (K.MEDAL_LABEL[medal] + ' medal'), medal, lines, [
        ['Retry', this.restartRun.bind(this)],
        ['Drills', this.quitToMenu.bind(this, 'drills')]
      ]);
      sfx(medal === 'none' ? 'whistle' : 'medal', 1);
      if (medal !== 'none' && motionOn()) this.fxConf.explode(fxCount(40), GW / 2, GH / 2 - 120);
    }

    /* -------------------------------------------------------- match end */
    finishMatch() {
      if (this.ended) return;
      this.ended = true;
      this.phase = 'end';
      sfx('whistle', 1);

      var win = this.ownScore > this.oppScore;
      var draw = this.ownScore === this.oppScore;
      var medal = K.matchMedal(this.ownScore, this.oppScore);
      STATE.medal = medal;

      var st = save.stats;
      st.matches++; st.goals += this.ownScore; st.conceded += this.oppScore;
      if (win) st.wins++; if (draw) st.draws++;
      if (this.oppScore === 0) st.cleanSheets++;

      var lines = [];
      lines.push(this.goalScorers.length ? ('Scorers: ' + this.goalScorers.join(', ')) : 'No goals for us today');
      lines.push('Shots ' + this.shots + '  ·  Tackles won ' + this.tackles + '  ·  Their saves ' + this.saves);

      var buttons;
      if (this.mode === 'season') {
        this.applySeasonResult(win, draw, lines);
        buttons = [['Continue', this.quitToMenu.bind(this, 'season')], ['Replay', this.restartRun.bind(this)]];
      } else {
        lines.push(K.getVenue(this.venue.key).name + '  ·  ' + K.getTier(save.quickTier).name);
        buttons = [['Rematch', this.restartRun.bind(this)], ['Menu', this.quitToMenu.bind(this, 'title')]];
      }
      persist();

      var title = win ? 'FULL TIME  ·  WIN' : (draw ? 'FULL TIME  ·  DRAW' : 'FULL TIME  ·  LOSS');
      this.showResult(title, this.ownScore + ' - ' + this.oppScore, medal, lines, buttons);
      if (win && motionOn()) this.fxConf.explode(fxCount(50), GW / 2, GH / 2 - 130);
    }

    applySeasonResult(win, draw, lines) {
      var s = save.season || (save.season = newSeason(0));
      var fixtures = K.seasonFixtures();
      var isFinal = s.fixture >= fixtures.length;

      // Form drifts with the day's work and is capped, so no run away stat.
      for (var i = 1; i < 5; i++) {
        var p = this.own[i];
        var delta = (win ? 0.03 : (draw ? 0.005 : -0.025));
        for (var g = 0; g < this.goalScorers.length; g++) if (this.goalScorers[g] === p.name) delta += 0.02;
        s.form[p.id] = C.clamp(num(s.form[p.id], 1, 0.8, 1.2) + delta, 0.85, 1.15);
      }
      s.form.vantly = C.clamp(num(s.form.vantly, 1, 0.8, 1.2) + (this.oppScore === 0 ? 0.035 : -0.015), 0.85, 1.15);

      if (isFinal) {
        if (win) {
          s.finalWon = true; s.done = true;
          save.stats.trophies++;
          lines.push('The cup is ours. Season complete.');
        } else {
          lines.push('The final got away. Replay it when you are ready.');
        }
      } else {
        var own = tableRow(s.table, K.OWN_CLUB.key);
        var them = tableRow(s.table, fixtures[s.fixture].club);
        own.p++; them.p++;
        own.gf += this.ownScore; own.ga += this.oppScore;
        them.gf += this.oppScore; them.ga += this.ownScore;
        if (win) { own.w++; them.l++; } else if (draw) { own.d++; them.d++; } else { own.l++; them.w++; }
        own.pts = own.w * 3 + own.d; them.pts = them.w * 3 + them.d;
        this.simulateOtherResults(s, fixtures[s.fixture].club);
        s.fixture++;
        lines.push('League position ' + this.leaguePosition(s) + '  ·  ' + own.pts + ' points');
        if (s.fixture >= fixtures.length) { s.finalUnlocked = true; lines.push('The knockout final is set.'); }
      }
      this.applyUnlocks(s, lines);
      STATE.seasonFixture = s.fixture;
    }

    simulateOtherResults(s, playedKey) {
      var rng = C.makeRng(0x51ac ^ ((s.index + 1) * 977 + (s.fixture + 1) * 131));
      var pool = [];
      for (var i = 0; i < K.CLUBS.length; i++) if (K.CLUBS[i].key !== playedKey) pool.push(K.CLUBS[i]);
      for (var j = pool.length - 1; j > 0; j--) {
        var r = (rng() * (j + 1)) | 0;
        var tmp = pool[j]; pool[j] = pool[r]; pool[r] = tmp;
      }
      for (var q = 0; q + 1 < pool.length; q += 2) {
        var a = pool[q], b = pool[q + 1];
        var ra = tableRow(s.table, a.key), rb = tableRow(s.table, b.key);
        var ga = Math.max(0, Math.round(rng() * 2.4 + a.rating - 0.9));
        var gb = Math.max(0, Math.round(rng() * 2.4 + b.rating - 0.9));
        ra.p++; rb.p++; ra.gf += ga; ra.ga += gb; rb.gf += gb; rb.ga += ga;
        if (ga > gb) { ra.w++; rb.l++; } else if (gb > ga) { rb.w++; ra.l++; } else { ra.d++; rb.d++; }
        ra.pts = ra.w * 3 + ra.d; rb.pts = rb.w * 3 + rb.d;
      }
    }

    leaguePosition(s) {
      var rows = s.table.slice().sort(function (a, b) {
        return (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf);
      });
      for (var i = 0; i < rows.length; i++) if (rows[i].key === K.OWN_CLUB.key) return i + 1;
      return rows.length;
    }

    applyUnlocks(s, lines) {
      var own = tableRow(s.table, K.OWN_CLUB.key);
      var newly = [];
      function give(id) {
        if (save.unlocked.indexOf(id) < 0) { save.unlocked.push(id); newly.push(K.getPlayer(id).name); }
      }
      if (own.w >= 3) give('vale');
      if (s.fixture >= 6) give('reyes');
      if (s.finalUnlocked) give('thorne');
      if (newly.length) {
        lines.push('Signed: ' + newly.join(', '));
        sfx('unlock', 1);
      }
    }

    /* ------------------------------------------------------------ result */
    showResult(title, score, medal, lines, buttons) {
      this.resultShown = true;
      releaseAllClaims();
      this.stick.active = false; this.stick.x = 0; this.stick.y = 0;
      this.sprintHeld = false; this.aimActive = false;
      this.aim.clear();

      C.setTextIfChanged(this.resultTitle, title);
      C.setTextIfChanged(this.resultScore, score);
      this.resultMedal.setTexture('te-medal-' + (medal || 'none'));
      for (var i = 0; i < this.resultLines.length; i++) {
        C.setTextIfChanged(this.resultLines[i], lines[i] || '');
      }
      for (i = 0; i < this.resultButtons.length; i++) this.resultButtons[i].destroy();
      this.resultButtons.length = 0;
      var self = this;
      for (i = 0; i < buttons.length; i++) {
        (function (row, idx) {
          var bx = (idx - (buttons.length - 1) / 2) * 200;
          var img = self.add.image(bx, 118, idx === 0 ? 'te-btn-hot' : 'te-btn').setDisplaySize(188, 54);
          var txt = self.add.text(bx, 118, row[0], {
            fontFamily: FONT, fontSize: '21px', fontStyle: '700', color: idx === 0 ? '#052018' : INK
          }).setOrigin(0.5);
          img.setInteractive({ useHandCursor: true });
          img.on('pointerup', function () { sfx('tap', 0.8); row[1](); });
          img.__pick = row[1];
          self.result.add([img, txt]);
          self.resultButtons.push(img);
        })(buttons[i], i);
      }
      this.result.setScrollFactor(0, 0, true);
      this.result.setVisible(true).setScale(0.86).setAlpha(0);
      this.tweens.add({ targets: this.result, scale: 1, alpha: 1, duration: 340, ease: 'Back.easeOut' });
      this.hideBanner();
      kit.audio.music('anthem', 900);
    }

    /* ------------------------------------------------------------- coach */
    coach(text) {
      C.setTextIfChanged(this.stripText, text);
      this.stripT = 3.0;
    }

    chip(text) {
      // One transient at a time. New chips queue rather than stack.
      if (this.chipT > 0.22) { if (this.chipQueue.length < 2) this.chipQueue.push(text); return; }
      C.setTextIfChanged(this.chipText, text);
      this.chipT = 1.0;
    }

    banner(title, sub) {
      C.setTextIfChanged(this.bannerText, title);
      C.setTextIfChanged(this.bannerSub, sub || '');
      this.bannerT = 2.0;
      this.bannerImg.setScale(0.7, 1);
      if (motionOn()) {
        this.tweens.add({ targets: this.bannerImg, scaleX: 1, duration: 380, ease: 'Back.easeOut' });
      } else this.bannerImg.setScale(1, 1);
    }

    hideBanner() { this.bannerT = 0; }

    /* ---------------------------------------------------------- tutorial */
    updateTutorial(dt) {
      if (this.tutorialStep < 0 || this.isDrill) return;
      var stepDef = TUTORIAL[this.tutorialStep];
      if (!stepDef) { this.finishTutorial(); return; }
      this.tutorialT += dt;
      if (stepDef.check === 'move') {
        if (Math.abs(this.moveIntentX()) + Math.abs(this.moveIntentY()) > 0.35) this.markTutorial('move');
      }
      if (this.tutorialT > 14) this.markTutorial(stepDef.check);
    }

    markTutorial(what) {
      if (this.tutorialStep < 0) return;
      var stepDef = TUTORIAL[this.tutorialStep];
      if (!stepDef || stepDef.check !== what) return;
      this.tutorialStep++;
      this.tutorialT = 0;
      STATE.tutorialStep = this.tutorialStep;
      var next = TUTORIAL[this.tutorialStep];
      if (next) { this.coach(next.text); sfx('chip', 0.4); }
      else this.finishTutorial();
    }

    finishTutorial() {
      this.tutorialStep = -1;
      STATE.tutorialStep = -1;
      if (!save.tutorialDone) { save.tutorialDone = true; persist(); }
      this.coach('You have the basics. Now go and win it.');
    }

    /* -------------------------------------------------------------- fx */
    burst(x, y, tint, n) {
      if (!motionOn() && n > 6) n = Math.max(3, (n * 0.4) | 0);
      this.fxSpark.setParticleTint(tint);
      this.fxSpark.explode(fxCount(n), x, y);
    }
    turf(x, y, n) {
      this.fxTurf.explode(fxCount(n), x, y);
    }
    ringPop(x, y, tint) {
      this.fxRing.setParticleTint(tint);
      this.fxRing.explode(1, x, y);
    }
    flashPop(a) {
      if (!motionOn()) a *= 0.4;
      this.flash.setAlpha(a).setVisible(true);
      this.tweens.add({
        targets: this.flash, alpha: 0, duration: 320, ease: 'Quad.easeOut',
        onComplete: function (tw, tg) { tg[0].setVisible(false); }
      });
    }

    setAnim(p, name) {
      if (p.anim === name) return;
      p.anim = name; p.animT = 0;
      if (name === 'kick') p.kickT = 0.22;
      if (name === 'cheer') p.cheerT = 1.4;
    }

    /* ----------------------------------------------------------- lifecycle */
    setMenuPause(on) {
      if (on === this.menuPaused) return;
      this.menuPaused = on;
      this.pauseUi.setVisible(on);
      if (on) {
        kit.pause('menu');
        releaseAllClaims();
        this.stick.active = false; this.stick.x = 0; this.stick.y = 0;
        this.sprintHeld = false; this.aimActive = false;
        this.aim.clear();
      } else {
        kit.resume('menu');
      }
    }

    onKitPause() { this.pauseUi.setVisible(this.menuPaused); }
    onKitResume() { }

    restartRun() {
      this.result.setVisible(false);
      this.resultShown = false;
      this.setMenuPause(false);
      this.scene.restart(this.cfg);
    }

    quitToMenu(screen) {
      this.result.setVisible(false);
      this.resultShown = false;
      kit.audio.stopMusic(300);
      this.scene.start('menu', { returnTo: screen || 'title' });
    }

    /* --------------------------------------------------------------- loop */
    update(time, delta) {
      // Force switches are honoured live as well as at boot.
      var fm = readForce('forceMode'), fs = readForce('forceStage');
      if ((fm && fm !== this.lastForce) || (fs && fs !== this.lastForceStage)) {
        this.lastForce = fm; this.lastForceStage = fs;
        if (fm === 'menu') { this.quitToMenu('title'); return; }
        if (fm) { kit.audio.stopMusic(200); this.scene.start('menu', { autoStart: fm, stage: fs }); return; }
      }

      var jf = kit.juice.frame();
      this.cameras.main.setScroll(jf.dx, jf.dy);

      var dt = Math.min(delta, 100) / 1000;
      if (!kit.paused && !this.resultShown && !jf.frozen) {
        // Fixed step. The match clock only ever advances inside a stepped
        // simulation frame, so a hitstop or a stall can never run it on.
        this.acc += dt;
        var guard = 0;
        while (this.acc >= STEP && guard < 4) { this.step(STEP); this.acc -= STEP; guard++; }
        if (guard >= 4) this.acc = 0;
      }

      this.syncSprites(dt);
      this.syncHud(dt);
      this.syncState();
    }

    syncSprites(dt) {
      var i, p, b = this.ball;
      for (i = 0; i < 10; i++) {
        p = this.players[i];
        var vis = p.alive;
        C.setVisibleIfChanged(p.sprite, vis);
        C.setVisibleIfChanged(p.shadow, vis);
        if (!vis) continue;
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        // Animation state machine: slide and kick are timed, cheer is timed,
        // otherwise speed picks idle or the run cycle.
        if (p.slideT > 0) { p.frame = 'slide'; }
        else if (p.cheerT > 0) { p.cheerT = Math.max(0, p.cheerT - dt); p.frame = 'cheer'; if (p.cheerT === 0) p.anim = 'idle'; }
        else if (p.kickT > 0) { p.kickT = Math.max(0, p.kickT - dt); p.frame = 'kick'; if (p.kickT === 0) p.anim = 'idle'; }
        else if (sp < 26) { p.frame = 'idle'; p.animT = 0; }
        else {
          p.animT += dt * C.clamp(sp / 90, 1, 3.6);
          var f = Math.floor(p.animT * 7) % 4;
          p.frame = (f === 0 || f === 2) ? 'run2' : (f === 1 ? 'run1' : 'run3');
        }
        if (p.sprite.frame.name !== p.frame) p.sprite.setFrame(p.frame);
        p.sprite.setPosition(p.x, p.y - 4);
        p.sprite.setRotation(p.facing);
        p.shadow.setPosition(p.x + 3, p.y + 12);
      }

      // Ball, its shadow and a short speed trail.
      this.ballSprite.setPosition(b.x, b.y - 3).setRotation(b.rot);
      this.ballShadow.setPosition(b.x + 3, b.y + 7);
      this.ballHalo.setPosition(b.x, b.y - 3);
      var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var showTrail = !b.owner && speed > 260 && motionOn();
      for (i = 0; i < this.trailDots.length; i++) {
        var dot = this.trailDots[i];
        if (!showTrail || i >= this.trail.count) { C.setVisibleIfChanged(dot, false); continue; }
        var t = this.trail.at(Math.max(0, this.trail.count - 1 - i));
        dot.setVisible(true).setPosition(t.x, t.y);
        dot.setScale(0.3 - i * 0.03).setAlpha(0.4 - i * 0.045);
      }

      // Selection ring, chevron and predicted receiver.
      var act = this.activePlayer();
      if (act && act.alive && !this.resultShown) {
        this.ring.setVisible(true).setPosition(act.x, act.y + 6).setTint(K.OWN_CLUB.primary);
        this.chev.setVisible(true).setPosition(act.x, act.y - 30);
      } else {
        C.setVisibleIfChanged(this.ring, false);
        C.setVisibleIfChanged(this.chev, false);
      }

      if (this.isDrill && this.drill.key === 'slalom') this.syncGates();
      if (this.isDrill && this.drill.key === 'accuracy') this.syncPanels();
      this.drawAim();
      this.drawOffside();
      this.stickBase.setPosition(this.stick.cx, this.stick.cy).setAlpha(this.stick.active ? 0.72 : 0.34);
      this.stickKnob.setPosition(this.stick.cx + this.stick.x * 46, this.stick.cy + this.stick.y * 46)
        .setAlpha(this.stick.active ? 0.95 : 0.45);
    }

    syncGates() {
      var pulse = 0.72 + 0.28 * Math.sin(this.time.now * 0.006);
      for (var i = 0; i < this.gates.length; i++) {
        var g = this.gates[i];
        if (!g.live) continue;
        var tint = g.done ? 0x1f7a5c : (i === this.drillIndex ? 0x27d0a0 : 0xffd166);
        var a = g.done ? 0.4 : (i === this.drillIndex ? pulse : 0.6);
        g.a.setTint(tint).setAlpha(a);
        g.b.setTint(tint).setAlpha(a);
        g.beam.setTint(tint).setAlpha(a * (i === this.drillIndex ? 0.32 : 0.14));
      }
    }

    syncPanels() {
      var pulse = 0.7 + 0.3 * Math.sin(this.time.now * 0.008);
      for (var i = 0; i < this.panels.length; i++) {
        var pn = this.panels[i];
        if (!pn.live) continue;
        var lit = (i === this.litPanel);
        pn.img.setTint(lit ? 0x27d0a0 : 0xffd166).setAlpha(lit ? pulse : 0.4);
      }
    }

    drawAim() {
      var g = this.aim;
      g.clear();
      if (!this.aimActive || this.resultShown) { C.setVisibleIfChanged(this.targetRing, false); return; }
      var c = this.carrier();
      if (!c || c.side !== 'own') { C.setVisibleIfChanged(this.targetRing, false); return; }
      var dx = this.aimX - this.aimStartX, dy = this.aimY - this.aimStartY;
      var n = C.norm(dx, dy, NRM);
      if (n.len < 12) { C.setVisibleIfChanged(this.targetRing, false); return; }
      var power = C.clamp(n.len / 230, 0.3, 1);
      var shot = this.isShotSwipe(n.x, n.len, c);
      var col = shot ? 0xffd166 : 0x27d0a0;
      var curve = C.clamp(this.aimCurve, -1, 1);

      // Predicted flight, curve included, so power and bend read before the
      // finger lifts.
      var speed = shot ? (350 + c.power * 50) * S * (0.6 + power * 0.55) : 240 * S * (0.62 + power * 0.5);
      var px = c.x, py = c.y, vx = n.x * speed, vy = n.y * speed, sp = (shot ? curve * 1.8 : curve * 0.8);
      g.lineStyle(4, col, 0.85);
      g.beginPath(); g.moveTo(px, py);
      for (var i = 0; i < 16; i++) {
        var h = 0.035;
        var vn = C.norm(vx, vy, NRM);
        vx += -vn.y * sp * 210 * h; vy += vn.x * sp * 210 * h;
        var f = Math.pow(this.roll, h);
        vx *= f; vy *= f;
        px += vx * h; py += vy * h;
        if (px < P.left || px > P.right || py < P.top || py > P.bottom) break;
        g.lineTo(px, py);
      }
      g.strokePath();

      // Power arc at the carrier's feet.
      C.strokeArc(g, c.x, c.y, 34, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * power, 18);
      g.lineStyle(6, col, 0.35);
      C.strokeArc(g, c.x, c.y, 34, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * power, 18);

      if (!shot) {
        var target = this.findPassTarget(c, n.x, n.y);
        if (target) {
          this.targetRing.setVisible(true).setPosition(target.x, target.y + 6).setTint(col);
        } else C.setVisibleIfChanged(this.targetRing, false);
      } else {
        this.targetRing.setVisible(true).setPosition(P.right - 12, C.clamp(py, P.midY - P.goalHalf, P.midY + P.goalHalf)).setTint(col);
      }
    }

    drawOffside() {
      var g = this.offsideLine;
      g.clear();
      if (this.isDrill || this.ball.owner !== 'own' || this.phase !== 'live') return;
      var x = this.secondLastOppX();
      if (x <= P.midX) return;
      g.lineStyle(2, 0xffd166, 0.22);
      g.beginPath(); g.moveTo(x, P.top + 4); g.lineTo(x, P.bottom - 4); g.strokePath();
    }

    syncHud(dt) {
      if (this.isDrill) {
        C.setTextIfChanged(this.homeName, DRILL_TAG[this.drill.key] || 'DRILL');
        C.setTextIfChanged(this.awayName, 'R' + (this.drillRound + 1));
        this.scoreRow.set(this.drill.key === 'slalom'
          ? (this.drillValue + '-' + (5 + this.drillRound))
          : String(this.drillValue));
        this.clockRow.set(this.drill.key === 'penalty'
          ? (Math.min(5, this.drillShots + 1) + '-5')
          : C.formatClock(this.clock));
      } else {
        this.scoreRow.set(this.ownScore + ' - ' + this.oppScore);
        this.clockRow.set(C.formatClock(this.clock));
      }

      // Stamina under the band: a meter, not a word.
      var act = this.activePlayer();
      var stam = act ? act.stamina : 1;
      if (this.stamShown !== stam) {
        this.stamShown = stam;
        this.stamFill.setDisplaySize(Math.max(4, 140 * stam), 6);
        this.stamFill.setTint(stam > 0.4 ? 0x27d0a0 : 0xffd166);
      }

      // Chip: single slot, fast fade, 1.0 s hold, dequeues.
      if (this.chipT > 0) {
        this.chipT = Math.max(0, this.chipT - dt);
        var a = C.clamp(this.chipT / 0.28, 0, 1);
        this.chipImg.setAlpha(a * 0.92);
        this.chipText.setAlpha(a);
        if (this.chipT === 0 && this.chipQueue.length) {
          C.setTextIfChanged(this.chipText, this.chipQueue.shift());
          this.chipT = 1.0;
        }
      } else {
        C.setAlphaIfChanged(this.chipImg, 0);
        C.setAlphaIfChanged(this.chipText, 0);
      }

      // Coach strip: one line, fades to nothing after three seconds.
      if (this.stripT > 0) {
        this.stripT = Math.max(0, this.stripT - dt);
        var sa = C.clamp(this.stripT / 0.8, 0, 1);
        this.stripImg.setAlpha(sa * 0.8);
        this.stripText.setAlpha(sa * 0.95);
      } else {
        C.setAlphaIfChanged(this.stripImg, 0);
        C.setAlphaIfChanged(this.stripText, 0);
      }

      // Banner: run boundaries only.
      if (this.bannerT > 0) {
        this.bannerT = Math.max(0, this.bannerT - dt);
        var ba = C.clamp(this.bannerT / 0.5, 0, 1);
        this.bannerImg.setAlpha(ba * 0.96);
        this.bannerText.setAlpha(ba);
        this.bannerSub.setAlpha(ba * 0.9);
      } else {
        C.setAlphaIfChanged(this.bannerImg, 0);
        C.setAlphaIfChanged(this.bannerText, 0);
        C.setAlphaIfChanged(this.bannerSub, 0);
      }

      var showCtl = !this.resultShown && !this.menuPaused;
      C.setVisibleIfChanged(this.ctl, showCtl);
    }

    syncState() {
      STATE.score = this.ownScore;
      STATE.oppScore = this.oppScore;
      STATE.clock = Math.round(this.clock);
      STATE.stage = this.isDrill ? (this.drill.key + ':' + (this.drillRound + 1)) : (this.mode === 'season' ? ('fixture:' + ((save.season ? save.season.fixture : 0) + 1)) : ('tier:' + save.quickTier));
      STATE.progress = this.isDrill
        ? C.clamp(this.drillValue / Math.max(1, this.drill.key === 'penalty' ? 5 : (this.drill.key === 'slalom' ? 5 + this.drillRound : this.drill.medal.gold)), 0, 1)
        : C.clamp(1 - (this.clock / Math.max(1, this.minutes * 60)), 0, 1);
      var act = this.activePlayer();
      STATE.stamina = act ? act.stamina : 1;
      STATE.health = STATE.stamina;
      STATE.possession = this.possession;
      STATE.paused = kit.paused;
      STATE.reducedMotion = !kit.juice.enabled;
      STATE.drillValue = this.drillValue;
      STATE.forceMode = readForce('forceMode');
      STATE.forceStage = readForce('forceStage');
    }
  }

  /* --------------------------------------------------------- tutorial def */
  var TUTORIAL = [
    { check: 'move', text: 'Drag the left thumb pad to run.' },
    { check: 'pass', text: 'Drag from your carrier and release to pass along that line.' },
    { check: 'shoot', text: 'Swipe hard toward the right goal to shoot. Longer swipe, more power.' },
    { check: 'switch', text: 'Tap a team mate to take control of them.' },
    { check: 'tackle', text: 'Press the tackle button near their carrier. Hold it for a slide.' }
  ];

  var DRILL_TAG = { accuracy: 'ACCURACY', slalom: 'SLALOM', penalty: 'SHOOTOUT' };

  var KEY_BLOCK = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Space: 1, Tab: 1,
    KeyJ: 1, KeyK: 1, KeyQ: 1, KeyP: 1, KeyR: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1
  };

  /* ---------------------------------------------------------------- boot */
  syncSaveState();

  var config = {
    type: Phaser.AUTO,
    parent: document.getElementById('game') || document.body,
    width: GW,
    height: GH,
    backgroundColor: '#06150f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: {},
    fps: { target: 60, min: 30 },
    audio: { noAudio: true },
    banner: false,
    scene: [BootScene, MenuScene, MatchScene]
  };
  config.scale.width = Math.round(GW * RETINA_FACTOR);
  config.scale.height = Math.round(GH * RETINA_FACTOR);
  config.render = Object.assign({}, root.GGKit.renderDefaults, config.render || {});
  var game = new Phaser.Game(config);
  root.__te.game = game;
  game.scale.on('resize', refreshRect);
})(typeof window !== 'undefined' ? window : globalThis);
