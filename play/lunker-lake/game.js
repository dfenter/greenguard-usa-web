/* Lunker Lake - Phaser 3 game layer. GGKit owns lifecycle, input identity,
 * saves, audio buses, loading, settings, and juice. */
(function () {
  'use strict';

  const W = 390;
  const H = 844;
  const RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  const WORLD_W = 780;
  const SHOWCASE_TRAVEL = WORLD_W - W;
  const ASSET = 'assets/';
  const SFX = ['cast','splash','twitch','hook','reel','snap','land','ui','bubble','break'];
  const SPRITES = ['blue','brown','green','grey','greyLong','orange','pink','red'];
  let game = null;
  let scene = null;
  let kit = null;
  let progress = null;
  let audioReady = false;
  let pausedMenu = false;

  const llState = { mode: 'title', playState: 'aim', forceShowcase: false };
  window.__ll = { state: llState };
  Object.defineProperty(window.__ll, 'forceShowcase', {
    configurable: true,
    get: function () { return llState.forceShowcase; },
    set: function (value) { llState.forceShowcase = !!value; }
  });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => Number(n || 0).toFixed(2);
  const css = (n) => '#' + n.toString(16).padStart(6, '0');
  const style = (size, color, weight) => ({
    fontFamily: 'Avenir Next, Trebuchet MS, system-ui, sans-serif', fontSize: size + 'px',
    color: color || '#e8f5f4', fontStyle: 'normal', fontWeight: weight || '600', resolution: RETINA_FACTOR
  });
  function configureRetinaScene(scene) {
    scene.cameras.main.setZoom(RETINA_FACTOR);
    const addText = scene.add.text;
    scene.add.text = function (x, y, value, textStyle) {
      return addText.call(this, x, y, value, Object.assign({}, textStyle || {}, { resolution: RETINA_FACTOR }));
    };
  }
  function motionEnabled() {
    const systemReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return kit && kit.juice.enabled !== false && !systemReduced;
  }
  function setTextIfChanged(obj, value) {
    if (!obj || obj.text === value) return false;
    obj.setText(value);
    return true;
  }

  function saveProgress() {
    if (!LL.validSave(progress)) progress = clone(LL.defaultSave());
    kit.save.set(progress);
  }
  function openLunkerSettings() {
    kit.openSettings([function (box) {
      const title = document.createElement('div');
      title.textContent = 'Audio mix';
      title.style.cssText = 'font-size:13px;font-weight:700;color:#f0c873;margin-top:4px;';
      box.appendChild(title);
      [['Music', 'music', kit.audio.setMusicVolume], ['Effects', 'sfx', kit.audio.setSfxVolume]].forEach(function (entry) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;width:min(70vw,280px);font-size:13px;color:#b8d9d7;';
        const name = document.createElement('span'); name.textContent = entry[0]; name.style.width = '54px';
        const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.05'; input.value = String(kit.audio.prefs[entry[1]]); input.style.cssText = 'flex:1;accent-color:#f0ad59;';
        input.addEventListener('input', function () { entry[2](Number(input.value)); });
        row.appendChild(name); row.appendChild(input); box.appendChild(row);
      });
    }]);
  }
  function armAudio() {
    if (audioReady) return;
    audioReady = true;
    kit.audio.preload(SFX).then(function () {
      kit.audio.music(scene && scene.lake ? (scene.lake.index >= 3 ? 'night' : 'dawn') : 'dawn', 700);
    });
  }
  function sfx(name, options) { armAudio(); kit.audio.sfx(name, options); }

  kit = GGKit.create({
    slug: 'lunker-lake', orientation: 'portrait', validateSave: LL.validSave,
    onPause: function () {
      if (!scene) return;
      scene.simPaused = true;
      scene.clearLocalInput();
    },
    onResume: function () { if (scene) scene.simPaused = false; },
    onRestart: function () { if (scene) scene.restartSession(); }
  });
  kit.registerPWA();
  kit.loader.show('Lunker Lake');
  kit.audio.register({
    dawn: ASSET + 'dawn_loop.mp3', night: ASSET + 'expedition_loop.mp3',
    cast: ASSET + 'sfx_cast.mp3', splash: ASSET + 'sfx_splash.mp3',
    twitch: ASSET + 'sfx_twitch.mp3', hook: ASSET + 'sfx_hook.mp3',
    reel: ASSET + 'sfx_reel.mp3', snap: ASSET + 'sfx_snap.mp3',
    land: ASSET + 'sfx_land.mp3', ui: ASSET + 'sfx_ui.mp3',
    bubble: ASSET + 'sfx_bubble.mp3', break: ASSET + 'sfx_break.mp3'
  });
  progress = kit.save.get(clone(LL.defaultSave()));

  function panel(s, x, y, w, h, fill, stroke, radius) {
    const g = s.add.graphics();
    const r = radius || 16;
    g.fillStyle(0x020d15, .34); g.fillRoundedRect(x + 4, y + 6, w, h, r + 2);
    g.fillGradientStyle(fill == null ? 0x102b3b : fill, fill == null ? 0x102b3b : fill, 0x081e2c, 0x081e2c, 1);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(1, stroke == null ? 0x3e7183 : stroke, .9); g.strokeRoundedRect(x, y, w, h, r);
    g.lineStyle(1, 0xd5f1e5, .11); g.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, Math.max(4, r - 4));
    return g;
  }
  function text(s, x, y, value, size, color, weight, originX, originY) {
    const out = s.add.text(x, y, value, style(size, color, weight)).setOrigin(originX == null ? 0 : originX, originY == null ? 0 : originY);
    if (s.layers && s.layers.ui) s.layers.ui.add(out);
    return out;
  }
  function button(s, x, y, w, h, label, onClick, opts) {
    const o = opts || {};
    const c = s.add.container(0, 0);
    const bg = s.add.graphics();
    bg.fillStyle(o.fill == null ? 0x183b4b : o.fill, o.alpha == null ? 1 : o.alpha);
    bg.fillRoundedRect(x, y, w, h, o.radius || 12);
    bg.lineStyle(1, o.stroke == null ? 0x5794a2 : o.stroke, .9);
    bg.strokeRoundedRect(x, y, w, h, o.radius || 12);
    if (o.disabled) { bg.setAlpha(.42); } else bg.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    bg.on('pointerdown', function (pointer, lx, ly, event) {
      if (o.disabled) return;
      if (event && event.stopPropagation) event.stopPropagation();
      c.setScale(.97); sfx('ui'); onClick(pointer);
    });
    bg.on('pointerup', function () { s.tweens.add({ targets:c, scaleX:1, scaleY:1, duration:150, ease:'Back.Out' }); });
    bg.on('pointerout', function () { s.tweens.add({ targets:c, scaleX:1, scaleY:1, duration:120, ease:'Quad.Out' }); });
    c.add(bg);
    const labelText = s.add.text(x + w / 2, y + h / 2, label, style(o.size || 14, o.color || '#e8f5f4', o.weight || '700')).setOrigin(.5, .5);
    c.add(labelText);
    if (s.layers && s.layers.ui) s.layers.ui.add(c);
    return c;
  }
  function clear(container) { if (container) container.removeAll(true); }

  const MainScene = {
    key: 'main',
    preload: function () {
      const s = this;
      this.load.on('progress', function (v) { kit.loader.progress(.18 + v * .72); });
      SPRITES.forEach(function (id) { s.load.image('fish_' + id, ASSET + 'fish_' + (id === 'greyLong' ? 'grey_long_a' : id) + '.png'); });
      ['rock_a','rock_b','seaweed_c','seaweed_f','bubble_a','bubble_b','bubble_c'].forEach(function (id) { s.load.image(id, ASSET + id + '.png'); });
      kit.loader.progress(.18);
    },
    create: function () {
      configureRetinaScene(this);
      scene = this;
      this.simPaused = false;
      this.screen = 'title';
      this.state = 'aim';
      this.timeAlive = 0;
      this.selectedLake = clamp(progress.lastLake || 0, 0, progress.unlockedLake);
      this.lakeSeed = (Date.now() / 86400000) | 0;
      this.lake = null;
      this.fish = [];
      this.target = null;
      this.lure = { x: 92, y: 306, vx: 0, vy: 0, active: false };
      this.castAim = { angle: .88, power: .62, startX: 0, startY: 0, holding: false };
      this.drag = { active: false, lastX: 0, lastY: 0, speed: 0, moved: 0, lastAt: 0, history: [] };
      this.pointerId = null;
      this.keyboardHold = false;
      this.reelPointers = new Set();
      this.rodPointerId = null;
      this.rodAngle = .42;
      this.actionValue = .42;
      this.action = 'pulse';
      this.strikeTime = 0;
      this.fight = null;
      this.result = null;
      this.message = '';
      this.messageTime = 0;
      this.tutorialStep = progress.tutorialComplete ? 3 : (progress.tutorialStep || 0);
      this.layers = {
        bg: this.add.container(), water: this.add.container(), fish: this.add.container(),
        fx: this.add.container(), actor: this.add.container(), ui: this.add.container()
      };
      this.shimmer = [];
      this.bubbles = Array.from({ length: 34 }, function () { return { alive:false, x:0, y:0, vx:0, vy:0, life:0, max:0, size:0 }; });
      this.splash = Array.from({ length: 48 }, function () { return { alive:false, x:0, y:0, vx:0, vy:0, life:0, max:0, size:0, color:0xffffff }; });
      this.ripples = Array.from({ length: 10 }, function () { return { alive:false, x:0, y:0, life:0, max:0, size:0, color:0xffffff }; });
      this.foam = Array.from({ length: 12 }, function () { return { alive:false, x:0, y:0, life:0, max:0, size:0, color:0xffffff }; });
      this.fxGraphics = this.add.graphics().setDepth(20);
      this.layers.fx.add(this.fxGraphics);
      this.rippleGraphics = this.add.graphics().setDepth(18); this.layers.fx.add(this.rippleGraphics);
      this.foamGraphics = this.add.graphics().setDepth(19); this.layers.fx.add(this.foamGraphics);
      this.impactGraphics = this.add.graphics().setDepth(24); this.layers.fx.add(this.impactGraphics);
      this.arcGraphics = this.add.graphics().setDepth(14);
      this.layers.fx.add(this.arcGraphics);
      this.waterMotion = null;
      this.waterCaustics = null;
      this.waterSwell = null;
      this.reflectionMotion = null;
      this.glitter = null;
      this.cloudShadows = null;
      this.reedMotion = null;
      this.moteGraphics = null;
      this.fishShadowGraphics = null;
      this.shoreFoamMotion = null;
      this.lineDetailGraphics = null;
      this.catchFxGraphics = null;
      this.parallax = null;
      this.showcaseOffset = 0;
      this.clouds = [];
      this.reeds = [];
      this.motes = Array.from({ length: 24 }, function () {
        return { x:0, y:0, vx:0, vy:0, phase:0, size:1, color:0xffffff, alpha:.4, kind:'firefly' };
      });
      this.catchSparkles = Array.from({ length: 18 }, function () {
        return { alive:false, x:0, y:0, vx:0, vy:0, life:0, max:0, size:0, phase:0 };
      });
      this.artFrame = 0;
      this.visualRng = LL.rng(this.lakeSeed ^ 0x5eeda11);
      this.menuReturnScreen = 'title';
      this.pointerTick = { id:null, x:0, y:0 };
      this.createActor();
      this.input.topOnly = true;
      this.input.on('pointerdown', this.pointerDown, this);
      this.input.on('pointerup', this.pointerUp, this);
      this.input.on('pointercancel', this.pointerUp, this);
      this.input.on('pointermove', this.pointerMove, this);
      this.input.keyboard.on('keydown-SPACE', this.keyDown, this);
      this.input.keyboard.on('keydown-ENTER', this.keyDown, this);
      this.input.keyboard.on('keydown-ESC', function () { if (this.screen !== 'title' && !pausedMenu) this.openPause(); }, this);
      this.input.keyboard.on('keydown-L', function () { if (this.screen !== 'title') this.showTrophies(); }, this);
      this.input.keyboard.on('keydown-N', function () { if (this.screen === 'aim' || this.screen === 'result') this.showMap(); }, this);
      this.input.keyboard.on('keydown-M', function () { kit.audio.setMute(!kit.audio.prefs.mute); }, this);
      this.input.keyboard.on('keyup-SPACE', this.keyUp, this);
      this.input.keyboard.on('keyup-ENTER', this.keyUp, this);
      this.input.keyboard.on('keydown-UP', function () { if (this.state === 'water') this.lure.y = clamp(this.lure.y - 28, 320, 720); else this.castAim.angle = clamp(this.castAim.angle + .05, .2, 1.32); }, this);
      this.input.keyboard.on('keydown-DOWN', function () { if (this.state === 'water') this.lure.y = clamp(this.lure.y + 28, 320, 720); else this.castAim.angle = clamp(this.castAim.angle - .05, .2, 1.32); }, this);
      this.input.keyboard.on('keydown-W', function () { if (this.state === 'water') this.lure.y = clamp(this.lure.y - 28, 320, 720); else this.castAim.angle = clamp(this.castAim.angle + .05, .2, 1.32); }, this);
      this.input.keyboard.on('keydown-S', function () { if (this.state === 'water') this.lure.y = clamp(this.lure.y + 28, 320, 720); else this.castAim.angle = clamp(this.castAim.angle - .05, .2, 1.32); }, this);
      this.cameras.main.ignore(this.layers.ui);
      this.cameras.main.setBounds(0, 0, WORLD_W, H);
      // The main camera ignores the UI layer so showcase pans and shake
      // never move the interface - which requires a second, static camera
      // that actually renders it. Without this the whole UI (including the
      // entire title screen) rendered nowhere.
      this.uiCam = this.cameras.add(0, 0, Math.round(W * RETINA_FACTOR), Math.round(H * RETINA_FACTOR));
      this.uiCam.setZoom(RETINA_FACTOR);
      this.uiCam.ignore([this.layers.bg, this.layers.water, this.layers.fish,
        this.layers.fx, this.layers.actor]);
      this.renderTitle();
      kit.loader.progress(1);
      this.time.delayedCall(80, function () { kit.loader.hide(); });
    },
    clearLocalInput: function () {
      this.pointerId = null; this.keyboardHold = false; this.castAim.holding = false;
      this.drag.active = false; this.drag.history.length = 0; this.reelPointers.clear(); this.rodPointerId = null;
      if (this.state === 'fight') this.setActor('idle');
    },
    hasReelInput: function () {
      if (kit.paused) return false;
      if (kit.input.keyDown('Space') || kit.input.keyDown('Enter')) return true;
      for (const id of this.reelPointers) if (kit.input.pointers.has(id)) return true;
      return false;
    },
    createActor: function () {
      const drawAngler = function (g, pose) {
        g.fillStyle(0x07131d, .35); g.fillEllipse(37, 99, 44, 8);
        g.fillStyle(0x223f52, 1); g.fillRect(25, 63, 22, 29); g.fillRect(21, 77, 30, 10);
        g.fillStyle(0x2f6b78, 1); g.fillRect(27, 66, 6, 21); g.fillStyle(0xf0b766, 1); g.fillRect(31, 78, 12, 5);
        g.fillStyle(0xd99b65, 1); g.fillRect(29, 44, 16, 18); g.fillRect(25, 50, 4, 8); g.fillStyle(0x172b39, 1); g.fillRect(25, 40, 23, 6); g.fillRect(30, 36, 15, 4);
        g.fillStyle(0xf5c478, 1); g.fillRect(42, 49, 3, 3); g.fillStyle(0x10222d, 1); g.fillRect(39, 50, 2, 2);
        g.fillStyle(0x183144, 1); g.fillRect(25, 91, 9, 7); g.fillRect(40, 91, 9, 7);
        g.fillStyle(0xd9bd83, 1); g.fillRect(pose === 'reel' ? 46 : 48, pose === 'cast' ? 68 : 70, 21, 5);
        g.fillStyle(0xf0b766, 1); g.fillRect(pose === 'reel' ? 45 : 62, pose === 'cast' ? 66 : 68, 6, 7);
        g.lineStyle(pose === 'reel' ? 4 : 3, 0xd9bd83, 1); g.lineBetween(58, pose === 'cast' ? 69 : 72, pose === 'cast' ? 114 : (pose === 'reel' ? 84 : 108), pose === 'cast' ? 5 : (pose === 'reel' ? 34 : 20));
        g.lineStyle(1, 0xffe1a0, .8); g.lineBetween(61, pose === 'cast' ? 68 : 71, pose === 'cast' ? 114 : (pose === 'reel' ? 84 : 108), pose === 'cast' ? 8 : (pose === 'reel' ? 38 : 23));
        g.setDepth(12);
      };
      const idle = this.add.graphics(); drawAngler(idle, 'idle');
      const cast = this.add.graphics(); drawAngler(cast, 'cast');
      const reel = this.add.graphics(); drawAngler(reel, 'reel');
      this.actorStates = { idle:idle, cast:cast, reel:reel };
      this.layers.actor.add([idle, cast, reel]);
      this.setActor('idle');
      this.layers.actor.setVisible(false);
      this.layers.fx.setVisible(false);
    },
    setActor: function (state) {
      this.playerState = state;
      Object.keys(this.actorStates).forEach(function (key) { this.actorStates[key].setVisible(key === state); }, this);
    },
    setupLake: function (index) {
      this.selectedLake = clamp(index, 0, progress.unlockedLake);
      progress.lastLake = this.selectedLake; saveProgress();
      this.lakeSeed = ((Date.now() / 86400000) | 0) + this.selectedLake * 37;
      this.lake = LL.makeLake(this.selectedLake, this.lakeSeed);
      this.rebuildLakeArt();
      this.layers.actor.setVisible(true);
      this.layers.fx.setVisible(true);
      this.restartSession();
      kit.audio.music(this.selectedLake >= 3 ? 'night' : 'dawn', 800);
    },
    rebuildLakeArt: function () {
      clear(this.layers.bg); clear(this.layers.water); clear(this.layers.fish);
      this.shimmer.length = 0;
      const cfg = this.lake;
      const color = function (hex) { return Phaser.Display.Color.HexStringToColor(hex).color; };
      const light = cfg.light;
      const lightColor = light === 'dawn' ? 0xffc481 : light === 'dusk' ? 0xff6b4f : light === 'night' ? 0x98b9ff : 0xffefaa;
      this.visualRng = LL.rng((this.lakeSeed ^ 0x5eeda11) >>> 0);
      const far = this.add.container();
      const farShore = this.add.graphics();
      farShore.fillStyle(light === 'night' ? 0x142844 : 0x415e68, .72);
      farShore.fillPoints([{x:0,y:278},{x:54,y:245},{x:108,y:270},{x:164,y:232},{x:228,y:268},{x:292,y:239},{x:356,y:267},{x:424,y:229},{x:490,y:266},{x:552,y:240},{x:620,y:274},{x:694,y:235},{x:780,y:267},{x:780,y:318},{x:0,y:318}], true);
      far.add(farShore);
      const farTrees = this.add.graphics();
      const drawPine = function (g, x, y, h, tone, alpha) {
        g.fillStyle(tone, alpha); g.fillRect(x - 2, y - h * .18, 4, h * .28);
        g.fillTriangle(x, y - h, x - h * .22, y - h * .42, x + h * .22, y - h * .42);
        g.fillTriangle(x, y - h * .74, x - h * .3, y - h * .13, x + h * .3, y - h * .13);
      };
      [22,70,119,176,242,302,364,432,493,551,618,682,742].forEach(function (x, i) {
        drawPine(farTrees, x, 276 + (i % 3) * 3, 24 + (i % 4) * 9, light === 'night' ? 0x172e49 : 0x365665, .58);
      });
      far.add(farTrees);
      this.layers.bg.add(far);

      const haze = this.add.graphics();
      haze.fillStyle(light === 'night' ? 0x9fb9da : 0xf4dec1, .08); haze.fillEllipse(180, 278, 350, 70); haze.fillEllipse(548, 274, 420, 64);
      haze.fillStyle(0xe4f0e2, .045); haze.fillRect(0, 286, WORLD_W, 36); this.layers.bg.add(haze);

      const sunX = 305;
      const bg = this.add.graphics();
      bg.fillGradientStyle(color(cfg.sky[0]), color(cfg.sky[0]), color(cfg.sky[1]), color(cfg.sky[1]), 1); bg.fillRect(0, 0, WORLD_W, H);
      bg.fillStyle(lightColor, .045); bg.fillCircle(sunX, 108, 105); bg.fillStyle(lightColor, .09); bg.fillCircle(sunX, 108, 70); bg.fillStyle(lightColor, .16); bg.fillCircle(sunX, 108, 43); bg.fillStyle(lightColor, .88); bg.fillCircle(sunX, 108, 25);
      bg.fillStyle(light === 'night' ? 0x9cb8ff : 0xf5d78b, .62);
      for (let i = 0; i < (light === 'night' ? 28 : 18); i++) bg.fillCircle(24 + i * 43, 68 + (i % 5) * 29, i % 5 === 0 ? 2 : 1);
      this.layers.bg.addAt(bg, 0);

      const clouds = this.add.graphics();
      const cloudData = [
        {x:46,y:122,w:160,h:28,a:.07,s:.34}, {x:248,y:178,w:190,h:34,a:.065,s:-.26},
        {x:470,y:108,w:220,h:38,a:.055,s:.22}, {x:650,y:194,w:170,h:30,a:.06,s:-.18}
      ];
      cloudData.forEach(function (c) { clouds.fillStyle(0x152e3b, c.a); clouds.fillEllipse(c.x, c.y, c.w, c.h); clouds.fillEllipse(c.x + c.w * .27, c.y - 6, c.w * .44, c.h * .74); });
      this.layers.bg.add(clouds);
      this.cloudShadows = this.add.graphics(); this.layers.bg.add(this.cloudShadows);
      this.clouds = cloudData;

      const mid = this.add.container();
      const shore = this.add.graphics();
      shore.fillStyle(light === 'night' ? 0x102a35 : 0x3e5d55, .98); shore.fillPoints([{x:0,y:280},{x:46,y:268},{x:90,y:283},{x:139,y:266},{x:194,y:285},{x:246,y:261},{x:303,y:280},{x:356,y:263},{x:417,y:284},{x:469,y:264},{x:530,y:282},{x:590,y:265},{x:651,y:284},{x:712,y:263},{x:780,y:278},{x:780,y:324},{x:0,y:324}], true);
      shore.fillStyle(light === 'night' ? 0x24525a : 0x75907a, .84); shore.fillPoints([{x:0,y:300},{x:60,y:291},{x:126,y:304},{x:190,y:290},{x:254,y:306},{x:324,y:291},{x:392,y:304},{x:462,y:290},{x:534,y:305},{x:606,y:290},{x:678,y:303},{x:780,y:292},{x:780,y:320},{x:0,y:320}], true);
      shore.lineStyle(3, lightColor, .38); shore.beginPath(); for (let x = 0; x <= WORLD_W; x += 48) shore.lineTo(x, 302 + Math.sin(x * .043) * 5); shore.strokePath();
      mid.add(shore);
      const vegetation = this.add.graphics();
      [18,92,151,218,284,348,405,478,544,610,675,738].forEach(function (x, i) {
        drawPine(vegetation, x, 300 + (i % 2) * 2, 34 + (i % 4) * 8, light === 'night' ? 0x0d2730 : 0x23483f, .85);
      });
      for (let i = 0; i < 13; i++) { const x = 32 + i * 58; vegetation.fillStyle(light === 'night' ? 0x123a3b : 0x37644d, .92); vegetation.fillCircle(x, 294 + (i % 3) * 3, 7 + (i % 4)); vegetation.fillCircle(x + 8, 287 + (i % 2) * 4, 6); }
      mid.add(vegetation);
      this.layers.bg.add(mid);

      const water = this.add.graphics();
      water.fillGradientStyle(color(cfg.water[0]), color(cfg.water[0]), color(cfg.water[1]), color(cfg.water[1]), 1); water.fillRect(0, 304, WORLD_W, H - 304);
      water.fillStyle(lightColor, light === 'night' ? .06 : .14); water.fillRect(0, 304, WORLD_W, 86);
      water.fillStyle(cfg.accent, .055); water.fillRect(0, 390, WORLD_W, 92);
      water.fillStyle(0x061622, .075); water.fillRect(0, 482, WORLD_W, 112);
      water.fillStyle(0x020f1a, .14); water.fillRect(0, 594, WORLD_W, 250);
      water.fillStyle(0x061827, .24); water.fillEllipse(286, 700, 500, 290); water.fillEllipse(645, 656, 430, 250);
      this.layers.water.add(water);

      const bands = this.add.graphics();
      const bandColors = [lightColor, 0x9de4e5, cfg.accent, 0x2b7782, 0x103c50, 0x061d32];
      [0, 1, 2, 3, 4, 5].forEach(function (i) { const y = 316 + i * 88; bands.fillStyle(bandColors[i], i < 2 ? .065 : .045); bands.fillRect(0, y, WORLD_W, 64); });
      this.layers.water.add(bands);

      const reflection = this.add.graphics();
      for (let i = 0; i < 42; i++) {
        const y = 316 + i * 12 + (i % 3) * 3; const width = 24 + (i % 7) * 15; const x = (i * 73) % (WORLD_W - width);
        reflection.lineStyle(i % 5 === 0 ? 2 : 1, i % 3 === 0 ? lightColor : cfg.accent, .1 + (i % 6) * .018); reflection.lineBetween(x, y, x + width, y + (i % 2 ? 1 : 0));
      }
      reflection.fillStyle(lightColor, .13); reflection.fillEllipse(sunX, 346, 150, 26); reflection.fillEllipse(sunX, 370, 108, 13); reflection.fillEllipse(sunX, 391, 72, 8);
      reflection.fillStyle(light === 'night' ? 0x081d31 : 0x2c5960, .16); reflection.fillTriangle(72, 318, 51, 347, 93, 347); reflection.fillTriangle(126, 319, 112, 340, 140, 340); reflection.fillTriangle(432, 318, 408, 350, 456, 350); reflection.fillTriangle(690, 319, 666, 346, 714, 346);
      this.layers.water.add(reflection);
      this.reflectionMotion = this.add.graphics(); this.layers.water.add(this.reflectionMotion);
      this.waterMotion = this.add.graphics(); this.layers.water.add(this.waterMotion);
      this.waterCaustics = this.add.graphics(); this.layers.water.add(this.waterCaustics);
      this.waterSwell = this.add.graphics(); this.layers.water.add(this.waterSwell);
      this.glitter = this.add.graphics(); this.layers.water.add(this.glitter);

      const dock = this.add.graphics();
      dock.fillStyle(0x1a2b32, .96); dock.fillRect(168, 291, 112, 8); dock.fillRect(178, 298, 7, 32); dock.fillRect(260, 298, 7, 27); dock.fillStyle(0x9b7751, .94); dock.fillRect(163, 286, 124, 7); dock.fillStyle(0x2b5260, .5); dock.fillRect(173, 299, 100, 3);
      dock.fillStyle(0x16313b, .38); dock.fillRect(163, 322, 124, 5); dock.fillRect(180, 328, 8, 29); dock.fillRect(261, 326, 8, 27); this.layers.water.add(dock);
      const boat = this.add.graphics(); boat.fillStyle(0x182a33, .9); boat.fillEllipse(584, 294, 82, 17); boat.fillStyle(0xc38d56, .86); boat.fillEllipse(584, 289, 68, 12); boat.lineStyle(2, 0xeac28b, .55); boat.lineBetween(552, 290, 616, 290); boat.lineStyle(1, 0x8dd5cf, .3); boat.lineBetween(584, 295, 584, 333); boat.fillStyle(0x182a33, .25); boat.fillEllipse(584, 337, 82, 10); this.layers.water.add(boat);

      const shoreFoam = this.add.graphics(); this.layers.water.add(shoreFoam); this.shoreFoamMotion = shoreFoam;
      const shoreDepth = this.add.graphics(); shoreDepth.fillStyle(light === 'night' ? 0x061a26 : 0x153b3d, .72); shoreDepth.fillPoints([{x:0,y:786},{x:52,y:770},{x:105,y:784},{x:160,y:765},{x:225,y:789},{x:281,y:766},{x:345,y:785},{x:414,y:760},{x:480,y:786},{x:548,y:766},{x:612,y:788},{x:678,y:762},{x:780,y:782},{x:780,y:844},{x:0,y:844}], true); this.layers.water.add(shoreDepth);
      const foreground = this.add.container();
      const foregroundBank = this.add.graphics(); foregroundBank.fillStyle(light === 'night' ? 0x071821 : 0x173a3d, .78); foregroundBank.fillPoints([{x:0,y:796},{x:45,y:778},{x:94,y:790},{x:148,y:774},{x:212,y:792},{x:270,y:772},{x:334,y:790},{x:402,y:768},{x:468,y:794},{x:532,y:774},{x:594,y:791},{x:658,y:770},{x:726,y:792},{x:780,y:772},{x:780,y:844},{x:0,y:844}], true); foreground.add(foregroundBank);
      const foregroundPlants = this.add.graphics();
      for (let i = 0; i < 25; i++) { const x = 14 + i * 33; foregroundPlants.fillStyle(light === 'night' ? 0x0a2830 : 0x1b4a43, .82); foregroundPlants.fillEllipse(x, 780 - (i % 4) * 5, 14, 46 + (i % 5) * 9); foregroundPlants.fillEllipse(x + 9, 785 - (i % 3) * 8, 11, 36 + (i % 4) * 7); }
      foreground.add(foregroundPlants); this.layers.water.add(foreground);
      this.reeds = [];
      for (let i = 0; i < 42; i++) this.reeds.push({ x:18 + (i * 47) % (WORLD_W - 20), y:470 + (i * 31) % 286, h:18 + (i % 5) * 7, phase:i * .83, tone:i % 3 ? (light === 'night' ? 0x1b4b4a : 0x3d7758) : (light === 'night' ? 0x27615b : 0x6b985e) });
      this.reedMotion = this.add.graphics(); this.layers.water.add(this.reedMotion);

      const rockA = this.add.image(320, 700, 'rock_a').setScale(1.35).setAlpha(.56); this.layers.water.add(rockA);
      const rockB = this.add.image(52, 610, 'rock_b').setScale(1.1).setAlpha(.52); this.layers.water.add(rockB);
      const reedsAsset = this.add.image(342, 460, 'seaweed_f').setScale(1.8).setAlpha(.42); this.layers.water.add(reedsAsset);
      const reedsAsset2 = this.add.image(30, 520, 'seaweed_c').setScale(1.55).setAlpha(.38); this.layers.water.add(reedsAsset2);

      this.clouds.forEach(function (c) { c.x0 = c.x; });
      this.shimmer = Array.from({ length: 34 }, function (_, i) { return { x:(i * 89) % WORLD_W, y:330 + (i * 47) % 365, w:16 + (i % 6) * 9, phase:i * .71, alpha:.1 + (i % 4) * .025 }; });
      this.motes.forEach(function (m, i) { const night = light === 'night'; m.x = 20 + (i * 71) % (WORLD_W - 30); m.y = 340 + (i * 53) % 405; m.vx = (i % 2 ? 1 : -1) * (.7 + (i % 4) * .18); m.vy = night ? -.22 : -.08; m.phase = i * 1.37; m.size = i % 4 === 0 ? 2 : 1; m.color = night ? 0xd5c5ff : i % 3 ? 0xf4d68d : 0xb9eee0; m.alpha = night ? .66 : .42; m.kind = night ? 'firefly' : (i % 3 === 0 ? 'dragonfly' : 'firefly'); });

      this.parallax = { far:far, mid:mid, near:foreground };
      if (!this.moteGraphics) { this.moteGraphics = this.add.graphics().setDepth(9); this.layers.fx.add(this.moteGraphics); }
      this.fishShadowGraphics = this.add.graphics().setDepth(5); this.layers.fish.add(this.fishShadowGraphics);
      if (!this.lineDetailGraphics) { this.lineDetailGraphics = this.add.graphics().setDepth(23); this.layers.fx.add(this.lineDetailGraphics); }
      this.visualRng = LL.rng((this.lakeSeed ^ 0x5eeda11) >>> 0);
      this.fish = this.lake.stock.map(function (entry, i) {
        const bandY = [360, 495, 640][entry.species.band];
        const fish = this.add.image(58 + ((entry.seed * 997) % 286), bandY + ((entry.seed * 71) % 84), 'fish_' + entry.species.sprite);
        fish.setScale(.26 + Math.min(.28, entry.weight / 70));
        fish.setTint(entry.species.tint); fish.setAlpha(.48 + entry.species.band * .09); fish.setDepth(6 + entry.species.band);
        fish.setFlipX(i % 2 === 0); this.layers.fish.add(fish);
        const mark = this.add.graphics(); mark.setPosition(fish.x, fish.y); mark.setScale(fish.scaleX); mark.setDepth(fish.depth + .1); mark.fillStyle(0xffffff, .32); mark.lineStyle(1, 0x173340, .5);
        const p = entry.species.pattern;
        if (p === 'bars' || p === 'stripe' || p === 'flash') { mark.fillRect(-18, -7, 4, 14); mark.fillRect(-5, -9, 3, 18); mark.fillRect(8, -7, 4, 14); }
        else if (p === 'spot' || p === 'pearl' || p === 'marble') { mark.fillCircle(-10, -3, 4); mark.fillCircle(4, 4, 3); mark.fillCircle(15, -2, 2); }
        else if (p === 'glint' || p === 'silver' || p === 'star') { mark.fillTriangle(-14, -2, -2, -7, -2, 3); mark.fillCircle(12, -4, 2); }
        else { mark.lineBetween(-18, 5, 12, -6); mark.lineBetween(-14, -7, 16, 5); }
        if (p === 'lantern' || p === 'aurora' || p === 'violet' || p === 'ember') { mark.fillStyle(entry.species.tint, .55); mark.fillCircle(0, 0, 5); }
        this.layers.fish.add(mark);
        return { data:entry, sprite:fish, mark:mark, baseX:fish.x, baseY:fish.y, baseScale:fish.scaleX, phase:entry.seed * 9, caught:false, interest:0 };
      }, this);
      this.updateWaterArt(0);
      this.lakeArtReady = true;
    },
    syncDebugState: function () {
      llState.mode = this.screen || 'title';
      llState.playState = this.state || 'aim';
      llState.lake = this.lake ? this.lake.name : null;
    },
    updateShowcaseCamera: function (juice) {
      const active = !!llState.forceShowcase && !!this.lake && motionEnabled();
      const target = active ? (Math.sin(this.timeAlive * .18) * .5 + .5) * SHOWCASE_TRAVEL : 0;
      this.showcaseOffset = lerp(this.showcaseOffset || 0, target, active ? .045 : .16);
      if (this.parallax) {
        this.parallax.far.x = this.showcaseOffset * .12;
        this.parallax.mid.x = this.showcaseOffset * .28;
        this.parallax.near.x = this.showcaseOffset * .48;
      }
      this.cameras.main.setScroll(this.showcaseOffset + (juice ? juice.dx : 0), juice ? juice.dy : 0);
    },
    updateWaterArt: function (dt) {
      if (!this.lake || !this.waterMotion) return;
      const animate = motionEnabled();
      const t = animate ? this.timeAlive : 0;
      const cfg = this.lake;
      const light = cfg.light;
      const lightColor = light === 'dawn' ? 0xffc481 : light === 'dusk' ? 0xff6b4f : light === 'night' ? 0x98b9ff : 0xffefaa;
      this.artFrame = (this.artFrame + 1) % 2;
      if (dt > 0 && !animate) this.motes.forEach(function (m) { m.x = clamp(m.x, 8, WORLD_W - 8); m.y = clamp(m.y, 336, 780); });
      if (animate && dt > 0) this.motes.forEach(function (m) {
        m.x += m.vx * dt * 11; m.y += m.vy * dt * 11;
        if (m.x < 8) m.x = WORLD_W - 8; if (m.x > WORLD_W - 8) m.x = 8;
        if (m.y < 330) m.y = 775;
      });
      if (this.artFrame !== 0 && dt > 0) return;

      this.cloudShadows.clear();
      this.clouds.forEach(function (c, i) {
        const x = ((c.x0 + (animate ? t * c.s * 8 : 0)) % (WORLD_W + c.w + 80) + WORLD_W + c.w + 80) % (WORLD_W + c.w + 80) - 40;
        this.cloudShadows.fillStyle(0x09202b, c.a * .72); this.cloudShadows.fillEllipse(x, 333 + i * 7, c.w * .92, 18 + (i % 2) * 6); this.cloudShadows.fillEllipse(x + c.w * .18, 347 + i * 7, c.w * .52, 11);
      }, this);

      this.waterMotion.clear();
      for (let i = 0; i < 18; i++) {
        const y = 324 + i * 28; const span = 40 + (i % 5) * 30; const x = ((i * 83 + t * (10 + i % 4) * 3) % (WORLD_W + span)) - span;
        const bend = Math.sin(t * .7 + i) * (animate ? 5 : 0);
        this.waterMotion.lineStyle(i % 4 === 0 ? 2 : 1, i % 3 ? cfg.accent : 0xe4f4e0, .1 + (i % 4) * .018); this.waterMotion.lineBetween(x, y + bend, x + span, y + bend + Math.sin(i) * 2);
      }
      this.waterMotion.alpha = animate ? .78 + Math.sin(t * .7) * .09 : .68;

      this.waterCaustics.clear();
      for (let i = 0; i < 22; i++) {
        const y = 342 + ((i * 61) % 390); const x = ((i * 109 + t * (18 + i % 6) * 4) % (WORLD_W + 80)) - 40; const width = 12 + (i % 5) * 11; const wave = Math.sin(t * 1.1 + i * .9) * (animate ? 5 : 0);
        this.waterCaustics.lineStyle(i % 3 === 0 ? 2 : 1, i % 2 ? 0xd9f2de : lightColor, .07 + (i % 4) * .016); this.waterCaustics.lineBetween(x, y + wave, x + width, y + wave + 1);
      }

      this.waterSwell.clear();
      for (let i = 0; i < 12; i++) {
        const y = 410 + i * 34; const x = ((i * 127 - t * (8 + i % 3) * 4) % (WORLD_W + 100)) - 50; const width = 56 + (i % 4) * 24;
        this.waterSwell.lineStyle(1, i % 2 ? 0x7dc7c8 : cfg.accent, .075); this.waterSwell.lineBetween(x, y + Math.sin(t * .52 + i) * 3, x + width, y + Math.sin(t * .52 + i + 1) * 3);
      }

      this.reflectionMotion.clear();
      this.shimmer.forEach(function (s, i) {
        const x = s.x + Math.sin(t * .46 + s.phase) * (animate ? 14 : 0); const y = s.y + Math.sin(t * .8 + s.phase) * (animate ? 2 : 0); const alpha = s.alpha * (animate ? .78 + Math.sin(t * 2 + s.phase) * .28 : .62);
        this.reflectionMotion.lineStyle(i % 4 === 0 ? 2 : 1, i % 3 === 0 ? lightColor : 0xc5ece0, alpha); this.reflectionMotion.lineBetween(x, y, x + s.w, y + (i % 2 ? 1 : 0));
      }, this);

      this.glitter.clear();
      const glitterWidth = 42 + (Math.sin(t * .8) * .5 + .5) * 82;
      for (let i = 0; i < 17; i++) {
        const gx = 305 + Math.sin(i * 1.7 + t * .55) * (glitterWidth * .5) + (i % 3 - 1) * 15; const gy = 325 + i * 11 + Math.sin(t * 1.3 + i) * 3;
        this.glitter.lineStyle(i % 4 === 0 ? 2 : 1, lightColor, (animate ? .15 : .1) + (i % 4) * .03); this.glitter.lineBetween(gx - 7, gy, gx + 7, gy + Math.sin(i) * 2);
      }

      this.shoreFoamMotion.clear();
      this.shoreFoamMotion.lineStyle(2, 0xe9f4df, .4); this.shoreFoamMotion.beginPath();
      for (let x = 0; x <= WORLD_W; x += 24) this.shoreFoamMotion.lineTo(x, 313 + Math.sin(x * .08 + t * .75) * (animate ? 3 : 1.5));
      this.shoreFoamMotion.strokePath(); this.shoreFoamMotion.lineStyle(1, lightColor, .3); this.shoreFoamMotion.beginPath();
      for (let x = 0; x <= WORLD_W; x += 31) this.shoreFoamMotion.lineTo(x, 319 + Math.sin(x * .11 + t * .63 + 1) * (animate ? 2 : 1));
      this.shoreFoamMotion.strokePath();

      this.reedMotion.clear();
      this.reeds.forEach(function (r, i) {
        const sway = animate ? Math.sin(t * (1.1 + i % 3 * .13) + r.phase) * 7 : 0;
        this.reedMotion.lineStyle(i % 3 === 0 ? 2 : 1, r.tone, .62); this.reedMotion.lineBetween(r.x, r.y, r.x + sway, r.y - r.h); this.reedMotion.lineBetween(r.x + 1, r.y - 4, r.x + sway * .64 - 4, r.y - r.h * .64); this.reedMotion.lineBetween(r.x + 1, r.y - 10, r.x + sway * .8 + 5, r.y - r.h * .78);
      }, this);

      this.moteGraphics.clear();
      this.motes.forEach(function (m, i) {
        const pulse = animate ? .7 + Math.sin(t * 2.4 + m.phase) * .28 : .72; const x = m.x + (animate ? Math.sin(t * .7 + m.phase) * 2 : 0); const y = m.y + (animate ? Math.cos(t * .9 + m.phase) * 2 : 0);
        this.moteGraphics.fillStyle(m.color, m.alpha * pulse); this.moteGraphics.fillCircle(x, y, m.size); if (m.kind === 'dragonfly') { this.moteGraphics.lineStyle(1, m.color, m.alpha * .52); this.moteGraphics.lineBetween(x - 5, y - 2, x - 1, y); this.moteGraphics.lineBetween(x + 1, y, x + 5, y - 2); }
      }, this);

      this.fishShadowGraphics.clear();
      this.fish.forEach(function (f, i) {
        if (f.caught || !f.sprite.visible) return;
        const alpha = .16 + f.data.species.band * .035; const width = 24 + f.baseScale * 34;
        this.fishShadowGraphics.fillStyle(0x061b27, alpha); this.fishShadowGraphics.fillEllipse(f.sprite.x + Math.sin(t + i) * 3, f.sprite.y + 8 + f.data.species.band * 4, width, 7 + f.data.species.band * 2);
        this.fishShadowGraphics.lineStyle(1, 0x9dd8d1, .12); this.fishShadowGraphics.lineBetween(f.sprite.x - width * .38, f.sprite.y + 8, f.sprite.x + width * .38, f.sprite.y + 8);
      }, this);
    },
    spawnCatchSparkles: function () {
      this.catchSparkles.forEach(function (p, i) {
        const r = this.visualRng(); p.alive = i < (motionEnabled() ? 18 : 10); p.x = 195 + (r * 2 - 1) * 74; p.y = 292 + r * 112; p.vx = (r * 2 - 1) * 18; p.vy = -18 - r * 24; p.life = p.max = .8 + r * .8; p.size = 1.5 + r * 2; p.phase = r * 6.28;
      }, this);
    },
    clearCatchSparkles: function () { this.catchSparkles.forEach(function (p) { p.alive = false; }); },
    updateCatchCardFx: function (dt) {
      if (!this.catchFxGraphics) return;
      const animate = motionEnabled(); const g = this.catchFxGraphics; g.clear();
      this.catchSparkles.forEach(function (p, i) {
        if (!p.alive) return;
        if (animate && dt > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 36 * dt; }
        if (p.life <= 0) { p.alive = false; return; }
        const a = animate ? clamp(p.life / p.max, 0, 1) : .64; g.fillStyle(i % 3 ? 0xdff8e4 : 0xf7d27f, a * .8); g.fillCircle(p.x, p.y, p.size); g.lineStyle(1, 0xe9f8e8, a * .66); g.lineBetween(p.x - p.size * 2, p.y, p.x + p.size * 2, p.y); if (i % 3 === 0) g.lineBetween(p.x, p.y - p.size * 2, p.x, p.y + p.size * 2);
      });
    },
    restartSession: function () {
      if (!this.lake) { this.setupLake(this.selectedLake); return; }
      this.state = 'aim'; this.screen = 'aim'; this.result = null; this.target = null; this.fight = null;
      this.clearCatchSparkles();
      this.lure = { x:108, y:278, vx:0, vy:0, active:false };
      this.castAim = { angle:.88, power:.62, startX:0, startY:0, holding:false };
      this.drag = { active:false, lastX:0, lastY:0, speed:0, moved:0, lastAt:0, history:[] };
      this.clearLocalInput(); this.actionValue = .42; this.action = 'pulse'; this.rodAngle = .42; this.strikeTime = 0;
      this.fish.forEach(function (f) { f.caught = false; f.interest = 0; f.sprite.setVisible(true); });
      this.fish.forEach(function (f) { f.mark.setVisible(true); f.sprite.setAlpha(.58 + f.data.species.band * .1); });
      this.setActor('idle'); this.message = this.tutorialStep === 0 ? 'Hold, aim, then flick upward to cast' : 'Flick upward to cast'; this.messageTime = 4;
      this.renderScreen();
    },
    menuSafe: function () { return this.screen === 'title' || this.screen === 'aim' || this.screen === 'result'; },
    backFromMenu: function () { this.setScreen(this.lake ? (this.menuReturnScreen || 'aim') : 'title'); },
    setScreen: function (screen) { this.screen = screen; this.renderScreen(); },
    renderScreen: function () {
      this.tweens.killAll();
      this.syncDebugState();
      clear(this.layers.ui);
      this.catchFxGraphics = null;
      if (this.screen === 'title') this.renderTitle();
      else if (this.screen === 'map') this.renderMap();
      else if (this.screen === 'trophy') this.renderTrophies();
      else if (this.screen === 'tackle') this.renderTackle();
      else if (this.screen === 'tutorial') this.renderTutorial();
      else {
        this.renderHud();
        if (this.screen === 'result') this.renderResult();
        if (this.screen === 'aim' || this.screen === 'cast' || this.screen === 'water' || this.screen === 'strike' || this.screen === 'fight') this.renderHint();
        if (pausedMenu) this.renderPauseMenu();
      }
      const wipe = this.add.graphics(); wipe.fillStyle(0x020b12, .88); wipe.fillRect(0, 0, W, H); this.layers.ui.add(wipe);
      this.tweens.add({ targets:wipe, alpha:0, duration:250, ease:'Cubic.Out', onComplete:function () { wipe.destroy(); } });
    },
    renderTitle: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .22); veil.fillRect(0, 0, W, H); u.add(veil);
      const plate = panel(this, 22, 72, 346, 672, 0x092735, 0x4a96a2, 24); plate.setAlpha(.94); u.add(plate);
      text(this, 195, 120, 'LUNKER', 48, '#f7d181', '900', .5, .5).setShadow(0, 4, '#081621', .8, 8, 2, 1);
      text(this, 195, 166, 'LAKE', 30, '#bde9e4', '800', .5, .5);
      text(this, 195, 205, 'CAST INTO THE LIGHT', 11, '#7fbcc2', '700', .5, .5);
      const ring = this.add.graphics(); ring.lineStyle(2, 0x8fdbcf, .55); ring.strokeCircle(195, 340, 90); ring.lineStyle(1, 0xf4c96d, .45); ring.strokeCircle(195, 340, 70); u.add(ring);
      const fish = this.add.image(195, 340, 'fish_orange').setTint(0xf2b35d).setScale(1.15).setAngle(-8); u.add(fish);
      this.tweens.add({ targets:fish, y:348, angle:8, duration:1700, yoyo:true, repeat:-1, ease:'Sine.inOut' });
      text(this, 195, 462, 'A five-lake fishing expedition', 16, '#d4ece6', '700', .5, .5);
      text(this, 195, 488, '20 species. Find the right depth, lure, and hour.', 11, '#8fb8bd', '600', .5, .5);
      button(this, 72, 540, 246, 58, progress.catches ? 'CONTINUE EXPEDITION' : 'START EXPEDITION', function () { armAudio(); if (progress.tutorialComplete) { this.setupLake(this.selectedLake); } else { this.setScreen('tutorial'); } }.bind(this), { fill:0xf0ad59, stroke:0xffd488, color:'#102a35', size:14 });
      button(this, 72, 612, 116, 42, 'TROPHY LOG', function () { this.showTrophies(); }.bind(this), { size:11 });
      button(this, 202, 612, 116, 42, 'TACKLE BOX', function () { this.showTackle(); }.bind(this), { size:11 });
      button(this, 124, 670, 142, 38, 'SETTINGS', function () { openLunkerSettings(); }.bind(this), { size:11, fill:0x123342 });
      text(this, 195, 728, 'Keyboard: arrows aim, space casts / reels, L log, N map', 9, '#72a0a8', '600', .5, .5);
    },
    renderTutorial: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .7); veil.fillRect(0, 0, W, H); u.add(veil);
      const p = panel(this, 28, 136, 334, 500, 0x102e3d, 0x5b9fac, 22); u.add(p);
      text(this, 195, 178, 'FIRST CATCH TRAINING', 18, '#f5cf80', '800', .5, .5);
      text(this, 195, 214, 'Three beats. One trophy.', 12, '#9ed0ce', '600', .5, .5);
      const guide = this.add.graphics(); guide.lineStyle(2, 0xf0bd6b, .8); guide.lineBetween(94, 236, 150, 236); guide.lineBetween(150, 236, 142, 229); guide.lineBetween(150, 236, 142, 243); guide.fillStyle(0xf0bd6b, .85); guide.fillCircle(76, 236, 8); guide.fillStyle(0x9de4e5, .7); guide.fillCircle(195, 236, 5); u.add(guide);
      const step = this.tutorialStep;
      const rows = [
        ['01', 'CAST', 'Hold to aim. Flick upward to send the lure over the water.'],
        ['02', 'WORK THE LURE', 'Drag slowly, pulse, or twitch fast to wake the right fish.'],
        ['03', 'LAND THE FISH', 'Tap on STRIKE, then hold to reel. Release before the line snaps.']
      ];
      rows.forEach(function (row, i) {
        const y = 270 + i * 84; const active = i === step;
        const g = this.add.graphics(); g.fillStyle(active ? 0x1e5360 : 0x143845, 1); g.fillRoundedRect(54, y - 24, 282, 65, 12); g.lineStyle(1, active ? 0xf0bd6b : 0x2e6070, active ? 1 : .5); g.strokeRoundedRect(54, y - 24, 282, 65, 12); u.add(g);
        text(this, 76, y - 1, row[0], 12, active ? '#f0bd6b' : '#6e9aa4', '800', .5, .5);
        text(this, 102, y - 10, row[1], 12, active ? '#e8f5f4' : '#86afb4', '800');
        text(this, 102, y + 10, row[2], 11, '#9bc0c1', '600').setWordWrapWidth(218).setLineSpacing(1);
      }, this);
      button(this, 78, 558, 234, 50, step >= 3 ? 'BACK TO LAKE' : 'ENTER TRAINING', function () { this.setupLake(this.selectedLake); }.bind(this), { fill:0xf0ad59, stroke:0xffd488, color:'#102a35', size:13 });
      button(this, 121, 610, 148, 32, 'SKIP TUTORIAL', function () { progress.tutorialComplete = true; progress.tutorialStep = 3; this.tutorialStep = 3; saveProgress(); this.setupLake(this.selectedLake); }.bind(this), { size:10, fill:0x123342 });
    },
    renderHud: function () {
      const u = this.layers.ui;
      const top = this.add.graphics(); top.fillStyle(0x061823, .82); top.fillRect(0, 0, W, 106); u.add(top);
      text(this, 16, 15, this.lake ? this.lake.name : 'Lunker Lake', 17, '#eff7ec', '800');
      text(this, 16, 40, this.lake ? this.lake.weather + '  /  ' + LL.timeLabel(this.lake.light) : '', 9, '#8dbcc0', '700');
      text(this, 375, 17, fmt(progress.best) + ' lb', 16, '#f2c873', '800', 1, 0);
      text(this, 375, 42, '◆ ' + Math.floor(progress.coins), 10, '#9ed9c0', '700', 1, 0);
      button(this, 12, 57, 76, 40, 'LOG', function () { this.showTrophies(); }.bind(this), { size:10, fill:0x153a48, radius:10 });
      button(this, 94, 57, 78, 40, 'MAP', function () { this.showMap(); }.bind(this), { size:10, fill:0x153a48, radius:10 });
      button(this, 178, 57, 90, 40, 'TACKLE', function () { this.showTackle(); }.bind(this), { size:10, fill:0x153a48, radius:10 });
      button(this, 274, 57, 104, 40, 'PAUSE', function () { this.openPause(); }.bind(this), { size:10, fill:0x153a48, radius:10 });
      this.hudState = text(this, 195, 122, this.state === 'fight' ? 'FIGHT  /  HOLD TO REEL' : this.state.toUpperCase(), 10, '#74bdc0', '800', .5, .5);
    },
    renderHint: function () {
      const u = this.layers.ui;
      const g = this.add.graphics(); g.fillStyle(0x061823, .82); g.fillRoundedRect(18, 776, 354, 48, 14); g.lineStyle(1, 0x4c8791, .6); g.strokeRoundedRect(18, 776, 354, 48, 14); u.add(g);
      const hint = this.state === 'aim' ? this.message || 'Flick upward to cast' : this.state === 'cast' ? 'Watch the arc...' : this.state === 'water' ? this.action.toUpperCase() + ' ACTION  /  DRAG OR TAP' : this.state === 'strike' ? 'TAP NOW TO SET THE HOOK' : 'HOLD TO REEL  /  RELEASE TO GIVE LINE';
      text(this, 195, 799, hint, 11, this.state === 'strike' ? '#ffd37a' : '#d9eee8', '800', .5, .5);
      if (this.state === 'fight') {
        const bw = 300, x = 45, y = 700;
        const bg = this.add.graphics(); bg.fillStyle(0x05131e, .9); bg.fillRoundedRect(x, y, bw, 24, 12); bg.fillStyle(0x4bbd91, .5); bg.fillRect(x + 2, y + 3, bw * .56, 18); bg.fillStyle(0xe1b15d, .6); bg.fillRect(x + bw * .56, y + 3, bw * .30, 18); bg.fillStyle(0xe46b61, .72); bg.fillRect(x + bw * .86, y + 3, bw * .14 - 2, 18); bg.lineStyle(1, 0xf5d98c, .8); bg.strokeRoundedRect(x, y, bw, 24, 12); u.add(bg);
        const fill = this.add.graphics(); fill.fillStyle(0x5bd4a4, 1); fill.fillRoundedRect(0, 0, bw, 18, 9); fill.x = x + 2; fill.y = y + 3; fill.setScale(clamp(this.fight ? this.fight.tension : 0, 0, 1), 1); u.add(fill); this.tensionBar = fill;
        this.tensionColor = 0x5bd4a4; const marker = this.add.graphics(); marker.fillStyle(0xffffff, 1); marker.fillTriangle(0, 0, -5, -7, 5, -7); marker.x = x + bw * clamp(this.fight ? this.fight.tension : 0, 0, 1); marker.y = y; u.add(marker); this.tensionMarker = marker;
        text(this, x + 9, y + 12, 'LINE TENSION', 9, '#08202a', '900', 0, .5);
        text(this, x + bw - 8, y + 12, this.fight && this.fight.slackTime > 0 ? 'SLACK' : 'CONTROL', 8, '#d9eee8', '800', 1, .5);
        const line = this.add.graphics(); line.fillStyle(0x05131e, .85); line.fillRoundedRect(0, 0, bw, 11, 5); line.lineStyle(1, 0x8dd8d2, .55); line.strokeRoundedRect(0, 0, bw, 11, 5); line.x = x; line.y = y + 36; u.add(line);
        const lineFill = this.add.graphics(); lineFill.fillStyle(0x81d5dc, 1); lineFill.fillRoundedRect(0, 0, bw, 11, 5); lineFill.x = x; lineFill.y = y + 36; lineFill.setScale(clamp(this.fight ? this.fight.progress : 0, 0, 1), 1); u.add(lineFill); this.progressBar = lineFill;
        text(this, x + bw / 2, y + 56, 'DISTANCE  ' + Math.round((this.fight ? this.fight.progress : 0) * 100) + '%', 8, '#9bc9c8', '800', .5, .5);
      }
    },
    renderPauseMenu: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .82); veil.fillRect(0, 0, W, H); u.add(veil);
      const p = panel(this, 42, 248, 306, 312, 0x102e3d, 0x5b9fac, 22); u.add(p);
      text(this, 195, 294, 'PAUSED', 28, '#f4cf83', '900', .5, .5);
      text(this, 195, 330, 'The lake will wait.', 12, '#a5d1cc', '600', .5, .5);
      button(this, 86, 370, 218, 48, 'RESUME', function () { pausedMenu = false; kit.resume('manual'); this.renderScreen(); }.bind(this), { fill:0xf0ad59, stroke:0xffd488, color:'#102a35' });
      button(this, 86, 430, 218, 42, 'RESTART CAST', function () { pausedMenu = false; kit.resume('manual'); kit.restart(); }.bind(this), { size:12 });
      button(this, 86, 484, 218, 42, 'SETTINGS', function () { openLunkerSettings(); }.bind(this), { size:12 });
    },
    renderMap: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .92); veil.fillRect(0, 0, W, H); u.add(veil);
      text(this, 22, 30, 'EXPEDITION MAP', 23, '#f4cf83', '900');
      text(this, 22, 61, 'Chart lakes by discovering unique species.', 10, '#91c2c0', '600');
      LL.LAKES.forEach(function (lake, i) {
        const y = 106 + i * 118; const unlocked = i <= progress.unlockedLake; const selected = i === this.selectedLake;
        const g = this.add.graphics(); g.fillStyle(unlocked ? (selected ? 0x205563 : 0x123846) : 0x101f2b, 1); g.fillRoundedRect(22, y, 346, 96, 16); g.lineStyle(1, unlocked ? (selected ? 0xf0bd6b : 0x3f7d88) : 0x263844, 1); g.strokeRoundedRect(22, y, 346, 96, 16); u.add(g);
        const thumb = this.add.graphics(); thumb.fillGradientStyle(Phaser.Display.Color.HexStringToColor(lake.sky[0]).color, Phaser.Display.Color.HexStringToColor(lake.sky[0]).color, Phaser.Display.Color.HexStringToColor(lake.water[1]).color, Phaser.Display.Color.HexStringToColor(lake.water[1]).color, 1); thumb.fillRoundedRect(34, y + 14, 34, 68, 9); thumb.fillStyle(lake.accent, .75); thumb.fillCircle(52, y + 31, 7); thumb.lineStyle(1, 0xe6f5e4, .36); thumb.lineBetween(36, y + 57, 66, y + 57); thumb.lineBetween(36, y + 64, 66, y + 64); u.add(thumb);
        text(this, 51, y + 73, String(i + 1).padStart(2, '0'), 9, unlocked ? '#f0bd6b' : '#5a7178', '900', .5, .5);
        text(this, 78, y + 15, unlocked ? lake.name : 'LOCKED WATER', 17, unlocked ? '#e6f1e8' : '#6d8389', '800');
        text(this, 78, y + 43, unlocked ? lake.subtitle : 'Land more trophies to chart this lake', 10, unlocked ? '#99c7c3' : '#5c7178', '600');
        text(this, 78, y + 68, unlocked ? lake.weather + '  /  ' + lake.stock.length + ' habitats' : 'Requires ' + LL.LAKES[i].unlock + ' species', 9, unlocked ? '#74b8bd' : '#5c7178', '700');
        if (unlocked) button(this, 280, y + 28, 68, 38, selected ? 'FISH' : 'GO', function () { this.setupLake(i); }.bind(this), { size:10, fill:selected ? 0xf0ad59 : 0x1d5360, color:selected ? '#102a35' : '#e8f5f4' });
        else text(this, 316, y + 46, 'LOCK', 10, '#6d8389', '800', .5, .5);
      }, this);
      button(this, 112, 712, 166, 44, 'BACK', function () { this.backFromMenu(); }.bind(this), { size:11 });
    },
    renderTrophies: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .94); veil.fillRect(0, 0, W, H); u.add(veil);
      text(this, 22, 30, 'TROPHY LOG', 23, '#f4cf83', '900');
      text(this, 22, 61, Object.keys(progress.trophies).length + ' / ' + LL.SPECIES.length + ' species recorded', 10, '#91c2c0', '600');
      LL.SPECIES.forEach(function (sp, i) {
        const col = i % 3; const row = (i / 3) | 0; const x = 22 + col * 118; const y = 100 + row * 82; const record = progress.trophies[sp.id];
        const g = this.add.graphics(); g.fillStyle(record ? 0x163f4b : 0x101f2b, 1); g.fillRoundedRect(x, y, 106, 70, 12); g.lineStyle(1, record ? LL.tierColor(sp.tier) : 0x293c45, .8); g.strokeRoundedRect(x, y, 106, 70, 12); u.add(g);
        const fish = this.add.image(x + 53, y + 22, 'fish_' + sp.sprite).setScale(.25).setTint(record ? sp.tint : 0x30404b).setAlpha(record ? 1 : .45); u.add(fish);
        text(this, x + 53, y + 45, record ? sp.name : 'Unknown species', 8, record ? '#e3eee4' : '#687a80', '700', .5, .5);
        text(this, x + 53, y + 60, record ? fmt(record) + ' lb  /  ' + sp.tier : sp.icon + '  UNDISCOVERED', 7, record ? css(LL.tierColor(sp.tier)) : '#5c7178', '800', .5, .5);
      }, this);
      button(this, 112, 712, 166, 44, 'BACK', function () { this.backFromMenu(); }.bind(this), { size:11 });
    },
    activeRod: function () { return LL.RODS.find(function (rod) { return rod.id === progress.selectedRod; }) || LL.RODS[0]; },
    activeLure: function () { return LL.LURES.find(function (lure) { return lure.id === progress.selectedLure; }) || LL.LURES[0]; },
    changeTackle: function (kind, id) {
      const list = kind === 'rod' ? progress.rods : progress.lures; const items = kind === 'rod' ? LL.RODS : LL.LURES; const item = items.find(function (entry) { return entry.id === id; });
      if (!item) return;
      if (list.indexOf(id) >= 0) { if (kind === 'rod') progress.selectedRod = id; else progress.selectedLure = id; this.menuNotice = item.name + ' equipped'; saveProgress(); this.renderTackle(); return; }
      if (progress.catches < item.catchUnlock) { this.menuNotice = 'Land ' + item.catchUnlock + ' fish to unlock ' + item.name; this.renderTackle(); return; }
      if (progress.coins < item.cost) { this.menuNotice = 'Need ' + item.cost + ' coins for ' + item.name; this.renderTackle(); return; }
      progress.coins -= item.cost; list.push(id); if (kind === 'rod') progress.selectedRod = id; else progress.selectedLure = id; this.menuNotice = item.name + ' purchased and equipped'; saveProgress(); this.renderTackle();
    },
    renderTackle: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .94); veil.fillRect(0, 0, W, H); u.add(veil);
      text(this, 22, 30, 'TACKLE BOX', 23, '#f4cf83', '900');
      text(this, 22, 61, 'Equip a rig, then spend coins on upgrades.', 10, '#91c2c0', '600');
      if (this.menuNotice) text(this, 22, 82, this.menuNotice, 9, '#f0bd6b', '700');
      text(this, 22, 100, 'RODS', 11, '#72bdc0', '800');
      LL.RODS.forEach(function (rod, i) {
        const y = 122 + i * 68; const owned = progress.rods.indexOf(rod.id) >= 0; const active = progress.selectedRod === rod.id;
        const g = this.add.graphics(); g.fillStyle(owned ? (active ? 0x205563 : 0x153d49) : 0x101f2b, 1); g.fillRoundedRect(22, y, 346, 54, 12); g.lineStyle(1, owned ? 0x4c9398 : 0x293c45, .8); g.strokeRoundedRect(22, y, 346, 54, 12); u.add(g);
        text(this, 38, y + 9, rod.name, 11, owned ? '#e3eee4' : '#687a80', '800'); text(this, 38, y + 29, rod.note + '  PWR ' + rod.power.toFixed(2) + '  CTRL ' + rod.control.toFixed(2), 7, '#82b5b8', '600');
        g.fillStyle(0x08202a, .9); g.fillRoundedRect(184, y + 12, 62, 5, 3); g.fillRoundedRect(184, y + 28, 62, 5, 3); g.fillStyle(0xf0bd6b, .9); g.fillRoundedRect(184, y + 12, 62 * clamp(rod.power / 1.4, 0, 1), 5, 3); g.fillStyle(0x8bd9c6, .9); g.fillRoundedRect(184, y + 28, 62 * clamp(rod.control / 1.2, 0, 1), 5, 3);
        button(this, 260, y + 8, 94, 38, owned ? (active ? 'EQUIPPED' : 'EQUIP') : 'BUY ' + rod.cost, function () { this.changeTackle('rod', rod.id); }.bind(this), { size:8, fill:owned && active ? 0xf0ad59 : 0x1e5360, color:owned && active ? '#102a35' : '#e8f5f4', radius:9 });
      }, this);
      text(this, 22, 342, 'LURES', 11, '#72bdc0', '800');
      LL.LURES.forEach(function (lure, i) {
        const y = 364 + i * 56; const owned = progress.lures.indexOf(lure.id) >= 0;
        const g = this.add.graphics(); g.fillStyle(owned ? 0x153d49 : 0x101f2b, 1); g.fillRoundedRect(22, y, 346, 44, 10); g.lineStyle(1, owned ? 0x4c9398 : 0x293c45, .8); g.strokeRoundedRect(22, y, 346, 44, 10); u.add(g);
        text(this, 38, y + 9, lure.name, 10, owned ? '#e3eee4' : '#687a80', '800'); text(this, 38, y + 27, lure.note + '  ' + lure.action.toUpperCase(), 7, '#82b5b8', '600');
        button(this, 260, y + 3, 94, 38, owned ? (progress.selectedLure === lure.id ? 'EQUIPPED' : 'EQUIP') : 'BUY ' + lure.cost, function () { this.changeTackle('lure', lure.id); }.bind(this), { size:8, fill:owned && progress.selectedLure === lure.id ? 0xf0ad59 : 0x1e5360, color:owned && progress.selectedLure === lure.id ? '#102a35' : '#e8f5f4', radius:9 });
      }, this);
      button(this, 112, 712, 166, 44, 'BACK', function () { this.backFromMenu(); }.bind(this), { size:11 });
    },
    renderResult: function () {
      const u = this.layers.ui;
      const veil = this.add.graphics(); veil.fillStyle(0x061823, .72); veil.fillRect(0, 0, W, H); u.add(veil);
      const p = panel(this, 28, 214, 334, 390, this.result && this.result.kind === 'land' ? 0x123f47 : 0x342c38, this.result && this.result.kind === 'land' ? 0x6fd0ae : 0xf0796e, 22); u.add(p);
      if (this.result && this.result.kind === 'land') {
        text(this, 195, 254, 'TROPHY LANDED', 22, '#8de3bb', '900', .5, .5);
        const spotlight = this.add.graphics(); spotlight.fillStyle(0xf6d27f, .08); spotlight.fillCircle(195, 350, 126); spotlight.lineStyle(2, 0xf6d27f, .46); spotlight.strokeCircle(195, 350, 94); u.add(spotlight);
        const waterCard = this.add.graphics(); waterCard.fillStyle(0x78c9c3, .12); waterCard.fillEllipse(195, 381, 178, 42); waterCard.lineStyle(1, 0xbfeee1, .34); waterCard.strokeEllipse(195, 381, 154, 30); u.add(waterCard);
        this.catchFxGraphics = this.add.graphics(); u.add(this.catchFxGraphics);
        const fish = this.add.image(195, 346, 'fish_' + this.result.sp.sprite).setScale(1.22).setTint(this.result.sp.tint); u.add(fish);
        if (motionEnabled()) { fish.setScale(.18); this.tweens.add({ targets:fish, scale:1.22, y:354, angle:4, duration:420, ease:'Back.Out' }); this.tweens.add({ targets:spotlight, alpha:.45, duration:700, yoyo:true, repeat:-1, ease:'Sine.inOut' }); } else fish.setAngle(4);
        const drops = this.add.graphics(); drops.lineStyle(2, 0xbfeee1, .62); [137,153,239,255].forEach(function (x, i) { drops.lineBetween(x, 391, x + (i % 2 ? 2 : -1), 404 + (i % 3) * 6); drops.fillCircle(x + (i % 2 ? 2 : -1), 407 + (i % 3) * 6, 2); }); u.add(drops);
        text(this, 195, 432, this.result.sp.name, 17, '#e8f5f4', '800', .5, .5);
        text(this, 195, 463, fmt(this.result.weight) + ' lb  /  ' + this.result.sp.tier, 12, css(LL.tierColor(this.result.sp.tier)), '800', .5, .5);
        text(this, 195, 494, this.result.record ? 'NEW LAKE RECORD' : '+' + this.result.coins + ' coins', 11, this.result.record ? '#ffe08b' : '#f0c873', '800', .5, .5);
        const coinText = text(this, 195, 516, '+' + this.result.coins + ' COINS', 10, '#9ed9c0', '800', .5, .5); coinText.setScale(.65); this.tweens.add({ targets:coinText, scale:1, duration:360, ease:'Back.Out' });
        if (this.result.unlocked) text(this, 195, 538, 'NEW LAKE CHARTED', 11, '#8de3bb', '800', .5, .5);
      } else {
        text(this, 195, 270, this.result && this.result.kind === 'escape' ? 'THE FISH ESCAPED' : 'THE LINE BROKE', 22, '#ff8a78', '900', .5, .5);
        text(this, 195, 320, this.result && this.result.kind === 'escape' ? 'Slack gave it a clean run.' : 'The fish found the red line.', 12, '#f0c7c2', '600', .5, .5);
        text(this, 195, 355, this.result && this.result.kind === 'escape' ? 'Keep a little tension. If the line goes slack, the fish gets away.' : 'Reel with a softer touch and release when the bar glows red.', 11, '#d49da0', '600', .5, .5).setWordWrapWidth(260).setAlign('center');
      }
      button(this, 82, 544, 226, 46, 'CAST AGAIN', function () { this.restartSession(); }.bind(this), { fill:0xf0ad59, stroke:0xffd488, color:'#102a35' });
      button(this, 116, 600, 158, 34, 'EXPEDITION MAP', function () { this.showMap(); }.bind(this), { size:10 });
    },
    showMap: function () { if (!this.menuSafe()) return; this.menuReturnScreen = this.screen; this.setScreen('map'); },
    showTrophies: function () { if (!this.menuSafe()) return; this.menuReturnScreen = this.screen; this.setScreen('trophy'); },
    showTackle: function () { if (!this.menuSafe()) return; this.menuReturnScreen = this.screen; this.setScreen('tackle'); },
    openPause: function () { if (this.screen === 'title' || this.screen === 'map' || this.screen === 'trophy' || this.screen === 'tackle' || pausedMenu) return; pausedMenu = true; kit.pause('manual'); this.renderScreen(); },
    pointerFromKit: function (id) {
      const p = kit.input.pointers.get(id);
      if (!p || !this.sys.game.canvas) return null;
      const r = this.sys.game.canvas.getBoundingClientRect();
      return { x:(p.x - r.left) * W / r.width, y:(p.y - r.top) * H / r.height };
    },
    pointerDown: function (p) {
      if (kit.paused) return;
      armAudio();
      if (this.screen === 'title' || this.screen === 'map' || this.screen === 'trophy' || this.screen === 'tackle' || this.screen === 'tutorial') return;
      const pos = this.pointerFromKit(p.id) || { x:p.x, y:p.y };
      if (pos.y < 108) return;
      if (this.state === 'aim') { if (this.pointerId !== null) return; this.pointerId = p.id; this.castAim.holding = true; this.castAim.startX = pos.x; this.castAim.startY = pos.y; this.castAim.power = .16; this.drag.history = [{x:pos.x, y:pos.y, t:performance.now()}]; }
      else if (this.state === 'water') { if (this.drag.active) return; this.pointerId = p.id; this.drag.active = true; this.drag.lastX = pos.x; this.drag.lastY = pos.y; this.drag.lastAt = performance.now(); this.drag.speed = 0; this.drag.moved = 0; }
      else if (this.state === 'strike') this.setHook();
      else if (this.state === 'fight') { if (this.reelPointers.size === 0) this.reelPointers.add(p.id); else if (this.rodPointerId === null) { this.rodPointerId = p.id; if (this.fight) this.fight.lastRodY = pos.y; } this.setActor('reel'); }
    },
    pointerMove: function (p) {
      if (kit.paused) return;
      const pos = this.pointerFromKit(p.id) || { x:p.x, y:p.y };
      if (this.state === 'aim' && this.castAim.holding) {
        if (p.id !== this.pointerId) return;
        const dx = pos.x - this.castAim.startX, dy = pos.y - this.castAim.startY;
        const now = performance.now(); this.drag.history.push({x:pos.x, y:pos.y, t:now}); while (this.drag.history.length > 2 && now - this.drag.history[0].t > 140) this.drag.history.shift();
        const first = this.drag.history[0]; const elapsed = Math.max(.025, (now - first.t) / 1000); const velocityY = (first.y - pos.y) / elapsed; const velocityX = (pos.x - first.x) / elapsed; const speed = Math.hypot(velocityX, velocityY); this.castAim.power = clamp(speed / 860, .16, 1); this.castAim.angle = clamp(Math.atan2(Math.max(0, velocityY), Math.max(25, Math.abs(velocityX))) + (velocityX < 0 ? .12 : 0), .2, 1.36);
      } else if (this.state === 'water' && this.drag.active) {
        if (p.id !== this.pointerId) return;
        const dx = pos.x - this.drag.lastX, dy = pos.y - this.drag.lastY; const d = Math.hypot(dx, dy);
        const now = performance.now(); const elapsed = Math.max(.008, (now - this.drag.lastAt) / 1000); this.drag.lastX = pos.x; this.drag.lastY = pos.y; this.drag.lastAt = now; this.drag.moved += d; this.drag.speed = lerp(this.drag.speed, d / elapsed, .35); this.actionValue = clamp(this.drag.speed / 540, 0, 1); this.action = this.drag.speed < 150 ? 'slow' : this.drag.speed > 420 ? 'fast' : 'pulse'; this.lure.y = clamp(this.lure.y + dy * .36, 320, 720); this.retrieve(d * .62);
      } else if (this.state === 'fight' && this.rodPointerId === p.id && this.fight) {
        this.fight.rodAngle = clamp(this.fight.rodAngle - (pos.y - (this.fight.lastRodY || pos.y)) * .008, -.35, 1); this.fight.lastRodY = pos.y; this.rodAngle = this.fight.rodAngle;
      }
    },
    pointerUp: function (p) {
      if (kit.paused) return;
      const pos = this.pointerFromKit(p.id) || { x:p.x, y:p.y };
      if (this.state === 'aim' && this.castAim.holding && p.id === this.pointerId) { const d = Math.hypot(pos.x - this.castAim.startX, pos.y - this.castAim.startY); const history = this.drag.history; const first = history[0] || {x:pos.x,y:pos.y,t:performance.now()}; const elapsed = Math.max(.04, (performance.now() - first.t) / 1000); const velocityY = (first.y - pos.y) / elapsed; this.castAim.holding = false; this.pointerId = null; this.drag.history.length = 0; if (d > 10 && velocityY > 125) this.cast(); else { this.message = 'Flick upward to cast'; this.messageTime = 2; this.renderScreen(); } }
      else if (this.state === 'water' && this.drag.active && p.id === this.pointerId) { this.drag.active = false; this.pointerId = null; if (this.drag.moved < 9) this.twitch(); }
      else if (this.state === 'fight' && this.reelPointers.has(p.id)) { this.reelPointers.delete(p.id); if (this.reelPointers.size === 0 && this.rodPointerId !== null && this.rodPointerId !== p.id) { this.reelPointers.add(this.rodPointerId); this.rodPointerId = null; } if (!this.hasReelInput()) this.setActor('idle'); }
      else if (this.state === 'fight' && this.rodPointerId === p.id) { this.rodPointerId = null; }
    },
    keyDown: function (e) {
      if (e && e.repeat) return; if (kit.paused) return; armAudio(); this.keyboardHold = true;
      if (this.screen === 'aim') { this.castAim.holding = true; this.castAim.power = .3; }
      else if (this.state === 'water') this.twitch();
      else if (this.state === 'strike') this.setHook();
      else if (this.state === 'fight') this.setActor('reel');
    },
    keyUp: function () {
      if (!this.keyboardHold) return; this.keyboardHold = false;
      if (this.state === 'aim' && this.castAim.holding) { this.castAim.holding = false; this.castAim.power = clamp(this.castAim.power, .16, 1); this.cast(); }
      if (this.state === 'fight') this.setActor('idle');
    },
    cast: function () {
      if (this.state !== 'aim' || !this.lake) return;
      const rod = this.activeRod(); const speed = this.castAim.power * 460 * rod.power; this.lure = { x:108, y:278, vx:Math.cos(this.castAim.angle) * speed, vy:-Math.sin(this.castAim.angle) * speed, active:true };
      if (!progress.tutorialComplete && this.tutorialStep < 1) { this.tutorialStep = 1; progress.tutorialStep = 1; saveProgress(); }
      this.state = 'cast'; this.screen = 'cast'; this.setActor('cast'); this.message = 'Cast'; this.messageTime = 1; sfx('cast'); this.renderScreen();
    },
    retrieve: function (amount) {
      if (!this.lure.active || this.state !== 'water') return;
      this.lure.x -= amount * .58; this.lure.y -= amount * .06; this.lure.y = clamp(this.lure.y, 320, 720);
      if (this.lure.x < 108) this.resetCast('Line in. Flick upward to cast');
    },
    twitch: function () {
      if (this.state !== 'water') return;
      this.action = 'pulse'; this.actionValue = .5; this.lure.y = clamp(this.lure.y - 10, 320, 720); this.lure.x = Math.max(108, this.lure.x - 5); this.burst(this.lure.x, this.lure.y, 4, 0x9de4e5, 'bubbles'); this.makeRipple(this.lure.x, this.lure.y, 0x9de4e5); sfx('twitch'); sfx('bubble', { volume:.16 });
    },
    resetCast: function (msg) { this.state = 'aim'; this.screen = 'aim'; this.target = null; this.fight = null; this.lure.active = false; this.action = 'pulse'; this.actionValue = .42; this.clearLocalInput(); this.setActor('idle'); this.message = msg || 'Flick upward to cast'; this.messageTime = 3; this.renderScreen(); },
    setHook: function () {
      if (this.state !== 'strike' || !this.target) return;
      const sp = this.target.data.species; const pull = sp.tier === 'Legendary' ? 1.05 : sp.tier === 'Epic' ? .88 : sp.tier === 'Rare' ? .72 : .58;
      this.state = 'fight'; this.screen = 'fight'; this.fight = { tension:.32, progress:0, energy:pull, elapsed:0, stamina:1, staminaMax:1 + sp.max / 18, slackTime:0, rodAngle:this.rodAngle, lastRodY:0 }; this.setActor('reel'); sfx('hook'); this.burst(this.lure.x, this.lure.y, 12, 0xf6d27f, 'splash'); this.makeRipple(this.lure.x, this.lure.y, 0xf6d27f); kit.juice.hitStop(55); kit.juice.shake(3, 130); this.renderScreen(); this.playImpact(this.lure.x, this.lure.y, 0xf6d27f);
    },
    landFish: function () {
      const sp = this.target.data.species; const weight = this.target.data.weight; const oldRecord = progress.records[this.selectedLake + ':' + sp.id] || 0; const record = weight > oldRecord; const oldSpeciesBest = progress.trophies[sp.id] || 0; const tierBonus = { Common:1, Uncommon:2, Rare:4, Epic:7, Legendary:12 }[sp.tier];
      progress.catches += 1; const earned = Math.max(1, Math.round(weight * 2 + tierBonus)); progress.coins += earned; progress.best = Math.max(progress.best, weight); progress.trophies[sp.id] = Math.max(oldSpeciesBest, weight); progress.records[this.selectedLake + ':' + sp.id] = Math.max(oldRecord, weight);
      let unlocked = false; const unique = Object.keys(progress.trophies).length; while (progress.unlockedLake < 4 && unique >= LL.LAKES[progress.unlockedLake + 1].unlock) { progress.unlockedLake += 1; unlocked = true; }
      if (!progress.tutorialComplete) { this.tutorialStep = 3; progress.tutorialComplete = true; progress.tutorialStep = 3; }
      saveProgress(); this.result = { kind:'land', sp:sp, weight:weight, coins:earned, record:record, unlocked:unlocked }; this.spawnCatchSparkles();
      this.state = 'result'; this.screen = 'result'; this.setActor('idle'); this.target.sprite.setVisible(false); this.target.mark.setVisible(false); this.target.caught = true; this.lure.active = false; sfx('land'); this.burst(this.lure.x, this.lure.y, 18, 0xf0c873, 'splash'); this.makeRipple(this.lure.x, this.lure.y, 0xf6d27f); kit.juice.shake(4, 180); this.renderScreen(); this.playImpact(this.lure.x, this.lure.y, 0xf0c873);
    }, 
    breakLine: function () { this.clearCatchSparkles(); this.result = { kind:'break' }; this.state = 'result'; this.screen = 'result'; this.setActor('idle'); this.lure.active = false; sfx('snap'); sfx('break'); this.burst(this.lure.x, this.lure.y, 14, 0xff7c6b, 'splash'); this.makeRipple(this.lure.x, this.lure.y, 0xff7c6b); kit.juice.shake(5, 200); this.renderScreen(); this.playImpact(this.lure.x, this.lure.y, 0xff7c6b); },
    escapeFish: function () { this.clearCatchSparkles(); this.result = { kind:'escape' }; this.state = 'result'; this.screen = 'result'; this.setActor('idle'); this.lure.active = false; sfx('splash'); this.burst(this.lure.x, this.lure.y, 10, 0x9de4e5, 'splash'); this.makeRipple(this.lure.x, this.lure.y, 0x9de4e5); kit.juice.shake(2, 110); this.renderScreen(); this.playImpact(this.lure.x, this.lure.y, 0x9de4e5); },
    burst: function (x, y, count, color, kind) {
      const pool = kind === 'bubbles' ? this.bubbles : this.splash;
      for (let i = 0; i < count; i++) { const p = pool.find(function (item) { return !item.alive; }); if (!p) break; const r = this.visualRng(); p.alive = true; p.x = x; p.y = y; p.vx = (r * 2 - 1) * (kind === 'bubbles' ? 20 : 85); p.vy = kind === 'bubbles' ? -18 - this.visualRng() * 26 : -70 - this.visualRng() * 110; p.life = p.max = .35 + this.visualRng() * .55; p.size = kind === 'bubbles' ? 3 + this.visualRng() * 4 : 2 + this.visualRng() * 3; p.color = color; }
    },
    makeRipple: function (x, y, color) {
      const p = this.ripples.find(function (item) { return !item.alive; }); if (!p) return; p.alive = true; p.x = x; p.y = y; p.life = p.max = .72; p.size = 8; p.color = color || 0x9de4e5;
      const f = this.foam.find(function (item) { return !item.alive; }); if (f) { f.alive = true; f.x = x; f.y = y; f.life = f.max = .48; f.size = 5; f.color = color || 0xe8f5e4; }
    },
    playImpact: function (x, y, color) {
      const g = this.impactGraphics; if (!g) return; g.clear(); g.fillStyle(color, .18); g.fillCircle(0, 0, 42); g.lineStyle(3, color, .8); g.strokeCircle(0, 0, 22); g.setPosition(x, y).setScale(.42).setAlpha(0); this.tweens.add({ targets:g, alpha:.9, scaleX:1.12, scaleY:.72, duration:70, yoyo:true, hold:55, ease:'Back.Out', onComplete:function () { g.clear(); g.setAlpha(0); } });
    },
    chooseTarget: function () {
      const depth = this.lure.y < 445 ? 0 : this.lure.y < 580 ? 1 : 2; const action = this.action; let best = null; let bestScore = -1;
      this.fish.forEach(function (f) { if (f.caught) return; const sp = f.data.species; if (sp.band !== depth || sp.action !== action || sp.time.indexOf(this.lake.light) < 0) return; const lureBonus = this.activeLure().action === action ? .5 : 0; const score = f.data.seed + lureBonus; if (score > bestScore) { bestScore = score; best = f; } }, this);
      return best;
    },
    update: function (time, delta) {
      if (llState.forceShowcase && !this.lake) this.setupLake(this.selectedLake);
      if (!this.lake) return;
      const juice = kit.juice.frame(); this.updateShowcaseCamera(juice);
      if (this.simPaused || juice.frozen) { this.updateDynamicUi(0); return; }
      const dt = Math.min(.04, Math.max(0, delta / 1000)); this.timeAlive += dt;
      this.syncDebugState();
      this.updateWaterArt(dt);
      this.updateParticles(dt);
      this.fish.forEach(function (f, i) { if (f.caught) return; const animate = motionEnabled(); const swim = animate ? Math.sin(this.timeAlive * (.9 + i * .035) + f.phase) : 0; f.sprite.x = f.baseX + (animate ? Math.sin(this.timeAlive * (.18 + i * .013) + f.phase) * 8 : 0); f.sprite.y = f.baseY + (animate ? Math.sin(this.timeAlive * (.34 + i * .01) + f.phase) * 4 : 0); f.sprite.angle = swim * (1.4 + f.data.species.band); f.sprite.scaleY = f.baseScale * (1 + swim * .035); f.mark.x = f.sprite.x; f.mark.y = f.sprite.y; f.mark.angle = f.sprite.angle; f.mark.scaleY = f.sprite.scaleY; if (this.state === 'water' && animate && i % 4 === 0 && (this.timeAlive + f.phase) % 2.8 < dt) this.makeRipple(f.sprite.x, f.sprite.y, 0x8ed8d0); }, this);
      if (this.waterMotion) { const animate = motionEnabled(); this.waterMotion.x = animate ? Math.sin(this.timeAlive * .24) * 6 : 0; this.waterMotion.alpha = animate ? .82 + Math.sin(this.timeAlive * .7) * .08 : .68; }
      if (this.state === 'aim') this.updateAim(dt);
      else if (this.state === 'cast') this.updateCast(dt);
      else if (this.state === 'water') this.updateWater(dt);
      else if (this.state === 'strike') this.updateStrike(dt);
      else if (this.state === 'fight') this.updateFight(dt);
      this.updateActor(dt); this.updateDynamicUi(dt);
    },
    updateAim: function (dt) {
      if (this.castAim.holding || kit.input.keyDown('Space') || kit.input.keyDown('Enter')) { this.castAim.power = clamp(this.castAim.power + dt * .42, .16, 1); this.drawArc(); }
      else this.arcGraphics.clear();
    },
    updateCast: function (dt) {
      this.stepTrajectory(this.lure, dt); this.drawLineToLure();
      if (this.lure.y >= 300) { this.lure.y = 306; this.state = 'water'; this.screen = 'water'; this.setActor('idle'); this.burst(this.lure.x, this.lure.y, 22, 0x9de4e5, 'splash'); sfx('splash'); this.renderScreen(); }
      if (this.lure.x > W + 20 || this.lure.y > H) this.resetCast('Wind carried the lure wide. Try again');
    },
    updateWater: function (dt) {
      this.drag.speed *= Math.pow(.03, dt); this.actionValue = lerp(this.actionValue, this.action === 'slow' ? .12 : this.action === 'pulse' ? .5 : .86, Math.min(1, dt * 2)); this.strikeTime += dt;
      if (!progress.tutorialComplete && this.tutorialStep < 2) { this.tutorialStep = 2; progress.tutorialStep = 2; saveProgress(); }
      if (this.drag.active && this.pointerId !== null) { const pos = this.pointerFromKit(this.pointerId); if (pos) { this.pointerTick.id = this.pointerId; this.pointerTick.x = pos.x; this.pointerTick.y = pos.y; this.pointerMove(this.pointerTick); } }
      if (this.target && (this.target.caught || this.target.data.species.band !== (this.lure.y < 445 ? 0 : this.lure.y < 580 ? 1 : 2) || this.target.data.species.action !== this.action || this.target.data.species.time.indexOf(this.lake.light) < 0)) this.target = null;
      if (!this.target) this.target = this.chooseTarget();
      if (this.target) {
        this.target.interest = clamp(this.target.interest + dt * (.38 + (this.activeLure().action === this.action ? .1 : 0)) - dt * .08, 0, 1); this.target.sprite.setAlpha(.62 + this.target.interest * .32); if (this.target.interest > .64 && (this.timeAlive % .28) < dt) this.burst(this.target.sprite.x, this.target.sprite.y, 1, 0xd9f6df, 'bubbles'); if (this.target.interest > .93 && this.strikeTime > 1.2) { this.state = 'strike'; this.screen = 'strike'; this.strikeTime = 0; sfx('hook'); this.makeRipple(this.target.sprite.x, this.target.sprite.y, 0xf0c873); this.renderScreen(); } }
      this.drawLineToLure();
    },
    updateStrike: function (dt) { this.strikeTime += dt; if (this.strikeTime > .95) this.resetCast('The fish slipped away. Work the lure longer'); },
    updateFight: function (dt) {
      if (!this.fight || !this.target) return; this.fight.elapsed += dt; const holding = this.hasReelInput(); const sp = this.target.data.species; const rod = this.activeRod(); const surge = .72 + .28 * Math.sin(this.timeAlive * (1.2 + sp.max * .025) + this.target.phase); const pull = (.036 + sp.max / 620) * this.fight.energy * surge / rod.control; const rodAngleControl = 1 - Math.abs((this.fight.rodAngle || 0) - .42) * .22;
      if (holding) { this.fight.tension += (.105 / rod.control + pull) * dt; if (this.fight.tension < .84) { this.fight.progress += dt * (.16 * rod.power * rodAngleControl); this.fight.stamina -= dt * (.11 * rod.power); } } else { this.fight.tension -= (.19 * rod.control - pull * .32) * dt; this.fight.progress -= dt * .018; this.fight.stamina += dt * .025; }
      this.fight.tension = clamp(this.fight.tension, 0, 1.08); this.fight.progress = clamp(this.fight.progress, 0, 1); this.fight.stamina = clamp(this.fight.stamina, 0, this.fight.staminaMax); if (this.fight.tension < .07) this.fight.slackTime += dt; else this.fight.slackTime = Math.max(0, this.fight.slackTime - dt * .7); if (holding && this.fight.elapsed % .48 < dt) sfx('reel', { volume:.16, rate:.92 + this.visualRng() * .18 }); if (this.fight.slackTime > 3.2) this.escapeFish(); else if (this.fight.tension > .99) this.breakLine(); else if (this.fight.progress >= 1 || this.fight.stamina <= 0) this.landFish(); this.drawLineToLure();
    },
    updateActor: function (dt) { const actor = this.actorStates[this.playerState]; if (!actor) return; const animate = motionEnabled(); actor.y = animate ? Math.sin(this.timeAlive * 2.1) * (this.playerState === 'idle' ? 1.4 : .5) : 0; if (this.playerState === 'reel' && animate) actor.angle = Math.sin(this.timeAlive * 12) * (this.fight ? 1.5 + this.fight.tension * 2 : 1.5); else actor.angle = 0; },
    updateDynamicUi: function (dt) {
      if (this.hudState) setTextIfChanged(this.hudState, this.state === 'fight' ? 'FIGHT' : this.state.toUpperCase());
      if (dt > 0 && this.messageTime > 0) this.messageTime = Math.max(0, this.messageTime - dt);
      if (this.tensionBar && this.state === 'fight' && this.fight) {
        const x = 45, y = 700, bw = 300; const tension = clamp(this.fight.tension, 0, 1); const color = tension > .84 ? 0xf06f58 : tension > .58 ? 0xf0b765 : 0x5bd4a4; this.tensionBar.setScale(tension, 1); if (color !== this.tensionColor) { this.tensionBar.clear(); this.tensionBar.fillStyle(color, 1); this.tensionBar.fillRoundedRect(0, 0, bw, 18, 9); this.tensionColor = color; } if (this.tensionMarker) this.tensionMarker.x = x + bw * tension;
        this.progressBar.setScale(clamp(this.fight.progress, 0, 1), 1);
      }
    },
    stepTrajectory: function (body, dt) { body.vx += this.lake.wind * 80 * dt; body.vy += 720 * dt; body.x += body.vx * dt; body.y += body.vy * dt; },
    drawArc: function () { this.arcGraphics.clear(); const body = { x:108, y:278, vx:Math.cos(this.castAim.angle) * this.castAim.power * 460 * this.activeRod().power, vy:-Math.sin(this.castAim.angle) * this.castAim.power * 460 * this.activeRod().power }; this.arcGraphics.lineStyle(2, 0xffd27b, .82); this.arcGraphics.fillStyle(0xffd27b, .9); this.arcGraphics.beginPath(); for (let i = 0; i < 52; i++) { if (i === 0) this.arcGraphics.moveTo(body.x, body.y); this.stepTrajectory(body, .032); if (body.y > 306) break; this.arcGraphics.lineTo(body.x, body.y); if (i % 6 === 0) this.arcGraphics.fillCircle(body.x, body.y, 2.7); } this.arcGraphics.strokePath(); },
    drawLineToLure: function () {
      this.arcGraphics.clear(); if (this.lineDetailGraphics) this.lineDetailGraphics.clear(); if (!this.lure.active) return;
      const tension = this.state === 'fight' && this.fight ? this.fight.tension : 0; const strain = tension > .84;
      this.arcGraphics.lineStyle(strain ? 2.2 : 1.2, strain ? 0xff7f68 : 0xdff5ef, .78); this.arcGraphics.beginPath(); this.arcGraphics.moveTo(109, 278); const sag = this.state === 'fight' && this.fight ? (1 - tension) * 22 : 8; const bend = this.state === 'fight' && this.fight ? this.fight.rodAngle * 16 : 0; this.arcGraphics.quadraticBezierTo((109 + this.lure.x) / 2 + bend, (278 + this.lure.y) / 2 + sag, this.lure.x, this.lure.y); this.arcGraphics.strokePath();
      const detail = this.lineDetailGraphics; if (!detail) return; const bob = this.state === 'strike' ? 7 : 5; const animate = motionEnabled(); const pulse = animate ? 1 + Math.sin(this.timeAlive * 5) * .12 : 1;
      detail.fillStyle(0x081923, .42); detail.fillEllipse(this.lure.x, this.lure.y + 6, 28 * pulse, 7); detail.lineStyle(1, 0xd5f5e6, .34); detail.strokeEllipse(this.lure.x, this.lure.y + 2, 20 * pulse, 5);
      detail.fillStyle(strain ? 0xff7868 : 0xf3c66c, 1); detail.fillCircle(this.lure.x, this.lure.y, bob); detail.fillStyle(0xf8f2cc, .94); detail.fillCircle(this.lure.x - 1, this.lure.y - 2, Math.max(1.5, bob * .42)); detail.lineStyle(1, 0x274b52, .9); detail.lineBetween(this.lure.x, this.lure.y + bob, this.lure.x, this.lure.y + bob + 8);
      const reeling = this.state === 'fight' && this.hasReelInput(); if (reeling || (this.state === 'water' && this.drag.active)) { detail.lineStyle(1, 0xb4e7da, .46); detail.strokeEllipse(this.lure.x - 8, this.lure.y + 7, 28, 8); detail.strokeEllipse(this.lure.x - 16, this.lure.y + 11, 38, 10); }
    },
    updateParticles: function (dt) {
      const draw = this.fxGraphics; draw.clear(); this.rippleGraphics.clear(); this.foamGraphics.clear();
      [this.bubbles, this.splash].forEach(function (pool, type) { pool.forEach(function (p) { if (!p.alive) return; p.life -= dt; if (p.life <= 0) { p.alive = false; return; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += type ? 170 * dt : -4 * dt; const alpha = clamp(p.life / p.max, 0, 1); if (type) { draw.lineStyle(1.5, p.color, alpha * .9); draw.strokeCircle(p.x, p.y, p.size * (1.2 - alpha * .2)); draw.fillStyle(p.color, alpha * .22); draw.fillCircle(p.x, p.y, p.size); } else { draw.fillStyle(p.color, alpha); draw.fillCircle(p.x, p.y, p.size); draw.lineStyle(1, p.color, alpha * .72); draw.strokeCircle(p.x, p.y, p.size * .9); } }); });
      this.ripples.forEach(function (p) { if (!p.alive) return; p.life -= dt; if (p.life <= 0) { p.alive = false; return; } const progress = 1 - p.life / p.max; p.size = 8 + progress * 58; this.rippleGraphics.lineStyle(2, p.color, (1 - progress) * .72); this.rippleGraphics.strokeEllipse(p.x, p.y, p.size * 2.2, p.size * .52); this.rippleGraphics.lineStyle(1, 0xe7f6df, (1 - progress) * .4); this.rippleGraphics.strokeEllipse(p.x, p.y, p.size * 1.5, p.size * .32); }, this);
      this.foam.forEach(function (p) { if (!p.alive) return; p.life -= dt; if (p.life <= 0) { p.alive = false; return; } const progress = 1 - p.life / p.max; p.size += dt * 18; this.foamGraphics.fillStyle(p.color, (1 - progress) * .46); this.foamGraphics.fillCircle(p.x - p.size, p.y + Math.sin(progress * 8) * 2, 3); this.foamGraphics.fillCircle(p.x + p.size, p.y - Math.sin(progress * 7) * 2, 3); }, this);
      this.updateCatchCardFx(dt);
    }
  };

  var config = {
    type: Phaser.AUTO, parent: 'game-root', backgroundColor: '#061823',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width:W, height:H },
    render: { antialias:false, roundPixels:true, pixelArt:true, powerPreference:'high-performance' },
    // Phaser only lifts preload/create/update from a plain scene config;
    // custom methods must ride in via `extend` or `this.createActor` etc. are undefined.
    scene: { key: MainScene.key, preload: MainScene.preload, create: MainScene.create, update: MainScene.update, extend: MainScene }
  };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  game = new Phaser.Game(config);
})();
