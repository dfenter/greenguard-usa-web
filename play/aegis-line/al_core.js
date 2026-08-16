/* Aegis Line - al_core.js
 * The shared spine: GGKit profile, validated save, harness state object,
 * pointer and tap routing, safe-area layout, and the small canvas UI toolkit
 * every screen is built from.
 *
 * Input note, and it is the important one in this file: GGKit installs its
 * window-level pointer listeners when the kit is created. A canvas-level
 * handler fires BEFORE those, so anything that claims a pointer from the
 * canvas gets its claim overwritten a moment later and touch dies. So this
 * game takes no canvas input at all (Phaser input is switched off in the game
 * config) and routes every tap through the window listener installed below,
 * AFTER GGKit.create, seeding kit.input.pointers at claim time.
 */
(function (root) {
  'use strict';

  var D = root.ALData;
  var AL = {};
  root.AL = AL;

  // ------------------------------------------------------------- tuning
  AL.STEP = 1 / 60;
  AL.MAX_STEPS = 5;
  AL.SAVE_VERSION = 3;

  // Palette. One set of colours for art, VFX and UI so the product reads as
  // a single place.
  AL.PAL = {
    ink: 0x070b12, panel: 0x0d1726, line: 0x2c4a63,
    text: 0xdfeaf4, dim: 0x8fa8bd, gold: 0xffd07a, amber: 0xffb066,
    red: 0xff6b6b, green: 0x63e6a8, cyan: 0x6ef6ff, violet: 0xc79bff, white: 0xffffff
  };
  AL.CSS = {
    text: '#dfeaf4', dim: '#8fa8bd', gold: '#ffd07a', amber: '#ffb066',
    red: '#ff6b6b', green: '#63e6a8', cyan: '#6ef6ff', white: '#ffffff'
  };
  AL.FONT = 'Verdana, Geneva, system-ui, sans-serif';

  AL.reducedMotion = (function () {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  AL.clamp = clamp;
  AL.lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---------------------------------------------------------------- save
  function defaultUnits() {
    var u = {};
    for (var i = 0; i < D.SQUAD.length; i++) u[D.SQUAD[i].id] = { lv: 1, gear: 0 };
    return u;
  }
  function defaultSave() {
    return {
      v: AL.SAVE_VERSION,
      cleared: 0,
      stars: {},
      towerBest: 0,
      daily: { date: '', best: 0, runs: 0 },
      credits: 0,
      cores: 0,
      units: defaultUnits(),
      team: ['venn', 'ossa', 'kite'],
      lead: 'venn',
      tutorial: false,
      bestScore: 0,
      totalKills: 0
    };
  }
  AL.defaultSave = defaultSave;

  // Every persisted id is checked against the live registry, every number is
  // range checked. A save that fails any check is discarded whole.
  function validateSave(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (s.v !== AL.SAVE_VERSION) return false;
    if (!Number.isFinite(s.cleared) || s.cleared < 0 || s.cleared > D.STAGES.length) return false;
    if (!Number.isFinite(s.towerBest) || s.towerBest < 0 || s.towerBest > D.TOWER.length) return false;
    if (!Number.isFinite(s.credits) || s.credits < 0 || s.credits > 9999999) return false;
    if (!Number.isFinite(s.cores) || s.cores < 0 || s.cores > 99999) return false;
    if (!s.units || typeof s.units !== 'object') return false;
    for (var i = 0; i < D.SQUAD.length; i++) {
      var rec = s.units[D.SQUAD[i].id];
      if (!rec || typeof rec !== 'object') return false;
      if (!Number.isFinite(rec.lv) || rec.lv < 1 || rec.lv > D.MAX_LEVEL) return false;
      if (!Number.isFinite(rec.gear) || rec.gear < 0 || rec.gear >= D.GEAR_TIERS.length) return false;
    }
    if (!Array.isArray(s.team) || s.team.length < 1 || s.team.length > 5) return false;
    for (var t = 0; t < s.team.length; t++) if (!D.SQUAD_BY_ID[s.team[t]]) return false;
    if (!D.SQUAD_BY_ID[s.lead]) return false;
    if (!s.daily || typeof s.daily !== 'object') return false;
    if (typeof s.daily.date !== 'string' || s.daily.date.length > 12) return false;
    if (!Number.isFinite(s.daily.best) || s.daily.best < 0) return false;
    if (!s.stars || typeof s.stars !== 'object') return false;
    return true;
  }
  AL.validateSave = validateSave;

  // Repair pass for anything the validator lets through but gameplay needs
  // normalised: the team must hold only unlocked ids, no duplicates, and the
  // lead must be on the team.
  AL.normalise = function (s) {
    var unlocked = D.unlockedIdsFor(s.cleared);
    var team = [], seen = {};
    for (var i = 0; i < s.team.length; i++) {
      var id = s.team[i];
      if (unlocked.indexOf(id) !== -1 && !seen[id]) { seen[id] = 1; team.push(id); }
    }
    for (var u = 0; u < unlocked.length && team.length < Math.min(5, unlocked.length); u++) {
      if (!seen[unlocked[u]]) { seen[unlocked[u]] = 1; team.push(unlocked[u]); }
    }
    s.team = team;
    if (team.indexOf(s.lead) === -1) s.lead = team[0];
    for (var k = 0; k < D.SQUAD.length; k++) {
      var uid = D.SQUAD[k].id;
      if (!s.units[uid]) s.units[uid] = { lv: 1, gear: 0 };
    }
    return s;
  };

  // ------------------------------------------------------- harness state
  // One object, shared by the boot fallback and every live scene, so a probe
  // reads the same fields whether or not gameplay has started. The array
  // fields are preallocated records, never aliases of a live pool, so a
  // harness read can never truncate the simulation.
  var BURSTS = [];
  for (var bi = 0; bi < 5; bi++) BURSTS.push({ id: '', gauge: 0, ready: false });
  var AL_STATE = {
    ready: false,
    mode: 'boot', phase: 'boot',
    chapter: 0, chapterName: '', stage: 0, stageName: '', floor: 0,
    wave: 0, waves: 0, enemiesAlive: 0, bossHp: 0, bossMaxHp: 0,
    score: 0, integrity: 0, maxIntegrity: 0,
    ammo: 0, mag: 0, reloading: false, popped: false,
    leadId: '', leadWeapon: '', bursts: BURSTS,
    cleared: 0, towerBest: 0, credits: 0, cores: 0, tutorialStep: -1,
    // force switches the orchestrator can set from outside, read by the boot
    // fallback and by every live scene
    forceMode: '', forceStage: 0, forceFloor: 0,
    forceClear: false, forceFail: false, forceUnlockAll: false, forceSkipIntro: false,
    forceSkipTutorial: false, forceGrant: 0
  };
  AL.state = AL_STATE;
  root.__al = { state: AL_STATE };

  AL.syncMeta = function (save) {
    AL_STATE.cleared = save.cleared;
    AL_STATE.towerBest = save.towerBest;
    AL_STATE.credits = save.credits;
    AL_STATE.cores = save.cores;
  };

  // ---------------------------------------------------------------- kit
  AL.kit = root.GGKit.create({
    slug: 'aegis-line',
    orientation: 'landscape',
    validateSave: validateSave,
    onPause: function () { if (AL.onPause) AL.onPause(); },
    onResume: function () { if (AL.onResume) AL.onResume(); },
    onRestart: function () { if (AL.onRestart) AL.onRestart(); }
  });
  var kit = AL.kit;

  var save = kit.save.get(null);
  if (!validateSave(save)) save = defaultSave();
  AL.normalise(save);
  AL.save = save;
  AL.persist = function () { kit.save.set(AL.save); AL.syncMeta(AL.save); };
  AL.syncMeta(save);

  // ------------------------------------------------------------ insets
  // Read the real safe-area values once and on every resize. The page body
  // carries no padding, so the canvas covers the viewport and the HUD does
  // the insetting itself.
  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    var cs = root.getComputedStyle(probe);
    var out = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    probe.remove();
    return out;
  }
  AL.insets = readInsets();
  root.addEventListener('resize', function () { AL.insets = readInsets(); });

  // -------------------------------------------------------- tap routing
  // A discrete tap queue fed by a WINDOW-level listener installed after
  // GGKit.create, so GGKit has already seeded kit.input.pointers by the time
  // this runs and nothing overwrites the claim. Taps are consumed by the
  // active scene exactly once, inside its update, which is also what keeps
  // the fire and burst inputs out of the event handler and free of the
  // queued-input race.
  var taps = [];
  var canvasOff = { x: 0, y: 0 };
  AL.refreshCanvasOffset = function (canvas) {
    if (!canvas || !canvas.getBoundingClientRect) return;
    var r = canvas.getBoundingClientRect();
    canvasOff.x = r.left;
    canvasOff.y = r.top;
  };
  AL.toGameX = function (clientX) { return clientX - canvasOff.x; };
  AL.toGameY = function (clientY) { return clientY - canvasOff.y; };

  root.addEventListener('pointerdown', function (e) {
    if (taps.length > 12) taps.shift();
    taps.push({ x: AL.toGameX(e.clientX), y: AL.toGameY(e.clientY), id: e.pointerId });
  }, { passive: true });
  root.addEventListener('pointerup', function () { AL.lastRelease = performance.now(); }, { passive: true });

  AL.taps = taps;
  AL.clearTaps = function () { taps.length = 0; };

  // Keys that must work even while the kit reports paused (the pause menu
  // has to be dismissable). Everything else goes through kit.input.keyDown.
  var rawKeys = {};
  root.addEventListener('keydown', function (e) {
    rawKeys[e.code] = true;
    if (AL.onRawKey) AL.onRawKey(e.code);
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) {
      if (e.target === document.body || e.target === document.documentElement) e.preventDefault();
    }
  });
  root.addEventListener('keyup', function (e) { rawKeys[e.code] = false; });
  root.addEventListener('blur', function () { for (var k in rawKeys) rawKeys[k] = false; });
  AL.rawKey = function (code) { return !!rawKeys[code]; };

  // Live pointers inside a rect, in game coordinates.
  AL.pointerIn = function (x, y, w, h) {
    var ps = kit.input.pointers;
    var it = ps.values();
    var n = it.next();
    while (!n.done) {
      var p = n.value;
      var px = AL.toGameX(p.x), py = AL.toGameY(p.y);
      if (px >= x && px < x + w && py >= y && py < y + h) return { x: px, y: py, raw: p };
      n = it.next();
    }
    return null;
  };
  AL.anyPointer = function () {
    var it = kit.input.pointers.values();
    var n = it.next();
    if (n.done) return null;
    return { x: AL.toGameX(n.value.x), y: AL.toGameY(n.value.y), raw: n.value };
  };

  // ---------------------------------------------------------- text util
  // setText and setColor both rebuild the text texture, so both get the same
  // change guard. Without it the HUD re-rasterises every label every frame.
  AL.setTxt = function (t, s) {
    if (t.__v !== s) { t.__v = s; t.setText(s); }
  };
  AL.setCol = function (t, c) {
    if (t.__c !== c) { t.__c = c; t.setColor(c); }
  };
  AL.setTint = function (o, c) {
    if (o.__tint !== c) { o.__tint = c; o.setTint(c); }
  };
  AL.setVis = function (o, v) {
    if (o.visible !== v) o.setVisible(v);
  };
  AL.txt = function (scene, x, y, s, size, color, weight) {
    var t = scene.add.text(x, y, s, {
      fontFamily: AL.FONT,
      fontSize: size + 'px',
      color: color || AL.CSS.text,
      fontStyle: weight || 'normal'
    });
    t.__v = s;
    t.__c = color || AL.CSS.text;
    return t;
  };

  AL.fmt = function (n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    var s = String(n), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  };

  // ======================================================== UI toolkit
  // Buttons are plain records rendered from atlas frames plus one text
  // object. Hit testing runs against the record list in the scene update, so
  // there is no canvas-level input anywhere in the product.
  function Btn(scene, opts) {
    var b = {
      x: opts.x, y: opts.y, w: opts.w, h: opts.h,
      label: opts.label || '', icon: opts.icon || null,
      onTap: opts.onTap, enabled: opts.enabled !== false,
      visible: true, tone: opts.tone || 'normal', size: opts.size || 15,
      sub: opts.sub || '', pressT: 0, selected: !!opts.selected,
      align: opts.align || 'center'
    };
    // Nine slice keeps the corner radius and the border weight identical at
    // every button size instead of smearing them with the stretch.
    b.bg = opts.plate
      ? scene.add.nineslice(b.x, b.y, 'atlas', 'plate', b.w, b.h, 20, 20, 20, 20)
      : scene.add.nineslice(b.x, b.y, 'atlas', 'chip', b.w, b.h, 14, 14, 14, 14);
    b.bg.setOrigin(0.5).setDepth(opts.depth || 150);
    if (b.icon) {
      b.iconImg = scene.add.image(0, b.y, 'atlas', b.icon)
        .setOrigin(0.5).setDisplaySize(opts.iconSize || 22, opts.iconSize || 22)
        .setDepth((opts.depth || 150) + 1);
    }
    b.text = AL.txt(scene, 0, b.y, b.label, b.size, AL.CSS.text, '700')
      .setOrigin(b.align === 'left' ? 0 : 0.5, b.sub ? 1 : 0.5)
      .setDepth((opts.depth || 150) + 1);
    if (b.sub) {
      b.subText = AL.txt(scene, 0, b.y + 3, b.sub, 12, AL.CSS.dim)
        .setOrigin(b.align === 'left' ? 0 : 0.5, 0)
        .setDepth((opts.depth || 150) + 1);
    }
    b.layout = function () {
      b.bg.setPosition(b.x, b.y).setSize(b.w, b.h);
      var tx = b.x, left = b.x - b.w / 2 + 12;
      if (b.iconImg) {
        if (b.align === 'left') { b.iconImg.setPosition(left + 11, b.y); tx = left + 28; }
        else if (b.label) { b.iconImg.setPosition(b.x - b.w / 2 + 20, b.y); tx = b.x + 10; }
        else b.iconImg.setPosition(b.x, b.y);
      } else if (b.align === 'left') tx = left;
      b.text.setPosition(tx, b.sub ? b.y - 2 : b.y);
      if (b.subText) b.subText.setPosition(tx, b.y + 3);
    };
    b.setLabel = function (s) { AL.setTxt(b.text, s); };
    b.setSub = function (s) { if (b.subText) AL.setTxt(b.subText, s); };
    b.setEnabled = function (v) { b.enabled = v; };
    b.setVisible = function (v) {
      b.visible = v;
      AL.setVis(b.bg, v);
      if (b.iconImg) AL.setVis(b.iconImg, v);
      AL.setVis(b.text, v);
      if (b.subText) AL.setVis(b.subText, v);
    };
    b.paint = function (dt) {
      if (!b.visible) return;
      if (b.pressT > 0) b.pressT = Math.max(0, b.pressT - dt * 4.5);
      var tone = !b.enabled ? 0x4a5a68 : b.selected ? AL.PAL.gold : (b.tone === 'go' ? AL.PAL.green : 0xffffff);
      AL.setTint(b.bg, b.enabled ? (b.selected ? 0xffe6b8 : 0xffffff) : 0x66707c);
      b.bg.setAlpha(b.enabled ? (0.92 + b.pressT * 0.08) : 0.5);
      b.bg.setScale(1 + b.pressT * 0.04);
      AL.setCol(b.text, !b.enabled ? '#6d7a88' : b.selected ? AL.CSS.gold : (b.tone === 'go' ? AL.CSS.green : AL.CSS.text));
      if (b.iconImg) AL.setTint(b.iconImg, tone);
    };
    b.hit = function (px, py) {
      return b.visible && b.enabled &&
        px >= b.x - b.w / 2 - 4 && px <= b.x + b.w / 2 + 4 &&
        py >= b.y - b.h / 2 - 4 && py <= b.y + b.h / 2 + 4;
    };
    b.destroy = function () {
      b.bg.destroy();
      if (b.iconImg) b.iconImg.destroy();
      b.text.destroy();
      if (b.subText) b.subText.destroy();
    };
    b.layout();
    return b;
  }
  AL.Btn = Btn;

  // Scene mixin: keeps a button list and drains the tap queue against it.
  // Touch targets are never below 44px; the hit box adds 4px of slop on
  // every side on top of that.
  AL.uiInit = function (scene) {
    scene.__btns = [];
    scene.addBtn = function (opts) {
      var b = Btn(scene, opts);
      scene.__btns.push(b);
      return b;
    };
    scene.clearBtns = function () {
      for (var i = 0; i < scene.__btns.length; i++) scene.__btns[i].destroy();
      scene.__btns.length = 0;
    };
    scene.paintBtns = function (dt) {
      for (var i = 0; i < scene.__btns.length; i++) scene.__btns[i].paint(dt);
    };
    // Returns true when the tap was consumed by a button.
    scene.routeTap = function (tap) {
      for (var i = scene.__btns.length - 1; i >= 0; i--) {
        var b = scene.__btns[i];
        if (b.hit(tap.x, tap.y)) {
          b.pressT = 1;
          kit.audio.sfx('sfx_ui', { volume: 0.55 });
          if (b.onTap) b.onTap(b);
          return true;
        }
      }
      return false;
    };
  };

  // ======================================================== backdrop rig
  // Title, Command and Play all sit under the same chapter sky so the game
  // reads as one place. Five flat quads, no per-frame blending beyond the one
  // additive light wash.
  var bdSeq = 0;
  AL.makeBackdrop = function (scene, chKey) {
    var ch = D.CHAPTER_BY_KEY[chKey];
    var bd = { ch: ch, key: chKey, t: 0 };

    // FILL RATE: the sky gradient, the signature light wash and the far
    // silhouette never move relative to each other, and each one used to be a
    // full-screen quad (the light wash an ADDITIVE one). Blended full-screen
    // layers are the single biggest cost on a software rasteriser, so all
    // three are composited ONCE into one opaque canvas texture per layout and
    // drawn as a single unblended quad. Only the layers that really parallax
    // stay live. The composite is baked at half resolution and stretched:
    // the fill cost is identical either way, the bake cost is a quarter.
    bd.texKey = 'bgc_' + (++bdSeq);
    bd.sky = scene.add.image(0, 0, 'px').setOrigin(0, 0).setDepth(-100);

    bd.bake = function (w, h, horizonY) {
      var bw = Math.max(64, Math.round(w * 0.5));
      var bh = Math.max(64, Math.round(h * 0.5));
      var tex = scene.textures.exists(bd.texKey) ? scene.textures.get(bd.texKey) : null;
      var canvas;
      if (tex && tex.getSourceImage()) {
        canvas = tex.getSourceImage();
        if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      } else {
        canvas = document.createElement('canvas');
        canvas.width = bw; canvas.height = bh;
        tex = scene.textures.addCanvas(bd.texKey, canvas);
      }
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, bw, bh);
      ctx.imageSmoothingEnabled = true;
      var skySrc = scene.textures.get('sky_' + chKey).getSourceImage();
      ctx.drawImage(skySrc, 0, 0, bw, bh);
      var glowSrc = scene.textures.get('glow_' + chKey).getSourceImage();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glowSrc, 0, 0, bw, Math.max(60, (horizonY / h) * bh + bh * 0.5));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      var farSrc = scene.textures.get('far_' + chKey).getSourceImage();
      var farH = bh * 0.34;
      var farW = farH * (farSrc.width / farSrc.height);
      var fy = (horizonY / h) * bh - farH * 0.62;
      for (var x = 0; x < bw + farW; x += farW) ctx.drawImage(farSrc, x, fy, farW, farH);
      tex.refresh();
      if (bd.sky.texture.key !== bd.texKey) bd.sky.setTexture(bd.texKey);
      bd.sky.setDisplaySize(w, h).setTint(0xffffff);
    };

    bd.mid = scene.add.tileSprite(0, 0, 8, 8, 'mid_' + chKey).setOrigin(0, 1).setDepth(-80);
    bd.near = scene.add.tileSprite(0, 0, 8, 8, 'near_' + chKey).setOrigin(0, 1).setDepth(-70);

    // The ground plane owns the lower 62 percent of the field and the mid
    // structures stand ON it rather than floating above it. Enemies walk from
    // the far edge of that plane down to the cover line, so the two layers
    // have to meet exactly or the depth read falls apart.
    bd.layout = function (w, h, horizonY, groundY) {
      bd.bake(w, h, horizonY);
      var field = Math.max(60, groundY - horizonY);
      var groundTop = horizonY + field * 0.38;
      var nearH = Math.max(48, groundY - groundTop) + 4;
      bd.near.setPosition(0, groundY + 3).setSize(w, nearH);
      bd.near.setTileScale(nearH / 128, nearH / 128);
      var midH = Math.max(80, (groundTop - horizonY) + field * 0.30);
      bd.mid.setPosition(0, groundTop + 4).setSize(w, midH);
      bd.mid.setTileScale(midH / 200, midH / 200);
    };
    // Sway is driven by the aim offset, so looking left actually moves the
    // world. Amounts are tiny on purpose: parallax, not camera drift.
    bd.tick = function (dt, aimX) {
      bd.t += dt;
      var a = aimX || 0;
      bd.mid.tilePositionX = a * 0.055 + bd.t * 2.6;
      bd.near.tilePositionX = a * 0.110;
    };
    bd.destroy = function () {
      bd.sky.destroy(); bd.mid.destroy(); bd.near.destroy();
      if (scene.textures.exists(bd.texKey)) scene.textures.remove(bd.texKey);
    };
    return bd;
  };

  // ===================================================== transient rules
  // UI_LAW: one transient at a time, corner chips for in-play events, centre
  // banners only at run boundaries. Both queues live here so no screen can
  // accidentally stack two.
  AL.makeToast = function (scene, depth) {
    var t = {
      queue: [], life: 0, hold: 0
    };
    t.bg = scene.add.image(0, 0, 'atlas', 'chip').setOrigin(1, 0.5)
      .setDepth(depth).setVisible(false);
    t.icon = scene.add.image(0, 0, 'atlas', 'ic_star').setOrigin(0.5)
      .setDisplaySize(17, 17).setDepth(depth + 1).setVisible(false);
    t.text = AL.txt(scene, 0, 0, '', 15, AL.CSS.text, '700')
      .setOrigin(1, 0.5).setDepth(depth + 1).setVisible(false);
    t.anchor = { x: 0, y: 0 };
    t.push = function (msg, icon, color) {
      if (t.queue.length > 3) t.queue.shift();
      t.queue.push({ msg: msg, icon: icon || 'ic_star', color: color || AL.PAL.gold });
    };
    t.tick = function (dt) {
      if (t.life > 0) {
        t.life -= dt;
        var a = t.life > 0.7 ? 1 : Math.max(0, t.life / 0.7);
        var slide = t.life > 0.85 ? (1 - (t.life - 0.85) / 0.15) : 1;
        var x = t.anchor.x + (1 - slide) * 26;
        t.bg.setPosition(x, t.anchor.y).setAlpha(a * 0.95);
        t.text.setPosition(x - 12, t.anchor.y).setAlpha(a);
        t.icon.setPosition(x - t.bg.displayWidth + 16, t.anchor.y).setAlpha(a);
        if (t.life <= 0) {
          AL.setVis(t.bg, false); AL.setVis(t.text, false); AL.setVis(t.icon, false);
        }
        return;
      }
      if (!t.queue.length) return;
      var item = t.queue.shift();
      AL.setTxt(t.text, item.msg);
      if (t.icon.frame.name !== item.icon) t.icon.setFrame(item.icon);
      AL.setTint(t.icon, item.color);
      AL.setTint(t.bg, item.color);
      var w = Math.max(96, t.text.width + 46);
      t.bg.setDisplaySize(w, 30);
      t.life = 1.0;
      AL.setVis(t.bg, true); AL.setVis(t.text, true); AL.setVis(t.icon, true);
    };
    t.clear = function () {
      t.queue.length = 0; t.life = 0;
      AL.setVis(t.bg, false); AL.setVis(t.text, false); AL.setVis(t.icon, false);
    };
    t.destroy = function () { t.bg.destroy(); t.text.destroy(); t.icon.destroy(); };
    return t;
  };

  // Run-boundary banner: 60 percent width, overshoot in, hold, slide out.
  // Never shown during live play.
  AL.makeBanner = function (scene, depth) {
    var b = { t: 0, dur: 0, w: 0, cy: 0, onDone: null, active: false };
    b.plate = scene.add.image(0, 0, 'atlas', 'plate').setOrigin(0.5)
      .setDepth(depth).setVisible(false);
    b.title = AL.txt(scene, 0, 0, '', 30, AL.CSS.gold, '700')
      .setOrigin(0.5, 1).setDepth(depth + 1).setVisible(false);
    b.sub = AL.txt(scene, 0, 0, '', 15, AL.CSS.dim)
      .setOrigin(0.5, 0).setDepth(depth + 1).setVisible(false);
    b.show = function (title, sub, color, dur, onDone) {
      b.active = true;
      b.t = 0;
      b.dur = dur || 1.8;
      b.onDone = onDone || null;
      AL.setTxt(b.title, title);
      AL.setTxt(b.sub, sub || '');
      AL.setCol(b.title, color || AL.CSS.gold);
      AL.setVis(b.plate, true); AL.setVis(b.title, true); AL.setVis(b.sub, !!sub);
    };
    b.layout = function (w, h) { b.w = w * 0.60; b.cy = h * 0.42; };
    b.tick = function (dt) {
      if (!b.active) return;
      b.t += dt;
      var p = b.t / b.dur;
      var scale = 1, alpha = 1, dx = 0;
      if (AL.reducedMotion) {
        alpha = p < 0.12 ? p / 0.12 : (p > 0.86 ? Math.max(0, (1 - p) / 0.14) : 1);
      } else if (p < 0.22) {
        var e = p / 0.22;
        scale = 0.86 + 0.20 * (1 - Math.pow(1 - e, 3));
        if (scale > 1) scale = 1 + (scale - 1) * 0.6;
        alpha = Math.min(1, e * 2);
        dx = (1 - e) * -34;
      } else if (p > 0.82) {
        var o = (p - 0.82) / 0.18;
        alpha = Math.max(0, 1 - o);
        dx = o * 30;
        scale = 1 - o * 0.06;
      }
      var pw = b.w * scale, ph = 92 * scale;
      b.plate.setPosition(dx, b.cy).setDisplaySize(pw, ph).setAlpha(alpha);
      b.title.setPosition(dx, b.cy + 2).setAlpha(alpha).setScale(scale);
      b.sub.setPosition(dx, b.cy + 8).setAlpha(alpha * 0.9);
      if (p >= 1) {
        b.active = false;
        AL.setVis(b.plate, false); AL.setVis(b.title, false); AL.setVis(b.sub, false);
        if (b.onDone) { var fn = b.onDone; b.onDone = null; fn(); }
      }
    };
    b.hide = function () {
      b.active = false; b.onDone = null;
      AL.setVis(b.plate, false); AL.setVis(b.title, false); AL.setVis(b.sub, false);
    };
    b.destroy = function () { b.plate.destroy(); b.title.destroy(); b.sub.destroy(); };
    return b;
  };

  // ------------------------------------------------------------- stats
  // Derived unit numbers, one place, used by both the command screens and
  // the simulation so a preview always matches what the gun actually does.
  AL.unitStats = function (id) {
    var u = D.SQUAD_BY_ID[id];
    var rec = AL.save.units[id] || { lv: 1, gear: 0 };
    var gear = D.GEAR_TIERS[rec.gear] || D.GEAR_TIERS[0];
    var w = D.WEAPONS[u.weapon];
    var lvMul = D.levelDamageMul(rec.lv);
    return {
      unit: u, lv: rec.lv, gearTier: rec.gear, gear: gear, weapon: w,
      damage: w.dmg * lvMul * (1 + gear.dmg),
      rpm: w.rpm * (1 + gear.rate),
      crit: w.crit + gear.crit,
      reload: w.reload,
      cover: D.levelCoverBonus(rec.lv),
      power: Math.round(w.dmg * (w.rpm / 60) * w.pellets * lvMul * (1 + gear.dmg) * 0.1)
    };
  };

  AL.teamPassives = function (team) {
    var p = { dmg: 0, armor: 0, crit: 0, stagger: 0, regen: 0, splash: 0, gauge: 0, reload: 0 };
    for (var i = 0; i < team.length; i++) {
      var u = D.SQUAD_BY_ID[team[i]];
      if (!u || !u.passive) continue;
      if (p[u.passive.key] == null) continue;
      p[u.passive.key] += u.passive.value;
    }
    return p;
  };

  AL.maxIntegrity = function (team) {
    var base = 100;
    for (var i = 0; i < team.length; i++) base += AL.unitStats(team[i]).cover;
    return Math.round(base);
  };

  // Stage and floor plan resolution, shared by the command screen preview and
  // the play scene. Every keyed lookup has a guarded fallback.
  AL.planFor = function (mode, index) {
    var ch, plan;
    if (mode === 'tower') {
      var f = D.TOWER[clamp(index, 0, D.TOWER.length - 1)] || D.TOWER[0];
      ch = D.CHAPTERS[clamp(f.ch, 0, D.CHAPTERS.length - 1)] || D.CHAPTERS[0];
      plan = {
        mode: 'tower', index: index, ch: ch, kind: f.kind,
        name: 'FLOOR ' + f.floor, sub: (D.MOD_BY_KEY[f.mod] || D.MODIFIERS[0]).name,
        waves: f.waves, tier: f.tier,
        mix: f.kind === 'boss' ? ch.families.slice(0, 2) : ch.families.slice(0),
        boss: f.kind === 'boss' ? ch.boss : null,
        mods: [f.mod], credits: f.credits, cores: f.cores
      };
    } else if (mode === 'daily') {
      var dp = D.dailyPlan(D.todayStamp());
      ch = D.CHAPTERS[clamp(dp.ch, 0, D.CHAPTERS.length - 1)] || D.CHAPTERS[0];
      plan = {
        mode: 'daily', index: 0, ch: ch, kind: 'normal',
        name: 'DAILY SIMULATION', sub: dp.date,
        waves: dp.waves, tier: dp.tier, mix: dp.mix, boss: null,
        mods: dp.mods, credits: dp.credits, cores: dp.cores, seed: dp.seed
      };
    } else {
      var s = D.STAGES[clamp(index, 0, D.STAGES.length - 1)] || D.STAGES[0];
      ch = D.CHAPTERS[clamp(s.ch, 0, D.CHAPTERS.length - 1)] || D.CHAPTERS[0];
      plan = {
        mode: 'campaign', index: index, ch: ch, kind: s.kind,
        name: (s.ch + 1) + '-' + ((index % 6) + 1) + '  ' + s.name, sub: s.sub,
        waves: s.waves, tier: s.tier, mix: s.mix,
        boss: s.kind === 'boss' ? ch.boss : null,
        mods: [], credits: s.credits, cores: s.cores
      };
    }
    return plan;
  };
})(typeof window !== 'undefined' ? window : globalThis);
