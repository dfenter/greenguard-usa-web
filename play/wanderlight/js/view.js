/* view.js - authored Phaser presentation for Wanderlight.
   The simulation is read-only from this layer. View state lives in the scene,
   while GGKit remains the owner of lifecycle, input, save, and audio policy. */

const WanderlightApp = (() => {
  const kit = window.__wanderKit;
  const state = Game.state;
  const WORLD_W = 256;
  const WORLD_H = 176;
  const TILE = 16;
  const PALETTE = {
    ink: '#06131f', paper: '#e8f3e7', mint: '#b6f3c5', teal: '#53c5b6',
    gold: '#f2cf75', ember: '#ff9b70', rose: '#ed7893', blue: '#70b8e6',
    night: '#12263c', panel: '#102033', moss: '#79aa79', water: '#2e8da0',
  };
  const FRAME_MAP = {
    town: { '.': 0, '~': 1, T: 18, M: 25, R: 29, W: 42, K: 52, '=': 53, C: 61, S: 64, D: 66, A: 28, G: 30, H: 25, U: 18 },
    dungeon: { F: 0, '#': 13, B: 26, X: 34, P: 40, L: 44, Z: 47, Q: 50, p: 27, W: 18 },
  };
  const ACTOR_FRAMES = {
    wren: [120, 121, 122, 123],
    stonepeeper: [124, 125], mossbrute: [126, 127], springclaw: [128, 129],
    sandburrow: [124, 125], reedripper: [126, 127], glimmerbat: [128, 129],
    boneguard: [130, 131], gel: [124, 125], cinderhorn: [126, 127],
    boomerkin: [128, 129], ironwarden: [130, 131], nightwarden: [124, 125],
    veilcaster: [126, 127], mireleecher: [128, 129], rushcoil: [130, 131],
    slimelet: [124, 125], emberorb: [126, 127], griphand: [128, 129],
    hungryboomerkin: [130, 131], coilwyrm: [124, 125], emberback: [126, 127],
    thorncrown: [128, 129], mireeye: [130, 131], burrower: [124, 125],
    haloswarm: [126, 127], sable: [128, 129], tidehorn: [130, 131], manymaw: [124, 125],
  };
  const ITEM_COPY = {
    bomb: ['EMBER BOMB', 'Crack walls and stagger armored foes.'],
    bow: ['LUMEN BOW', 'Spend glims to send a bright arrow.'],
    boomerang: ['REED BOOMERANG', 'Stun a target and call it home.'],
    magicalboomerang: ['STAR BOOMERANG', 'A wider, brighter returning arc.'],
    candle: ['BLUE CANDLE', 'Light dark vaults and hidden paths.'],
    whistle: ['WIND WHISTLE', 'Wake old roads and secret water.'],
    firerod: ['EMBER ROD', 'Launch a flame that reveals secrets.'],
  };
  const GEAR_COPY = {
    sword: 'Blade', whitesword: 'White blade', magicsword: 'Magic blade', shield: 'Shield',
    magicshield: 'Lumen shield', ring: 'Blue ring', redring: 'Red ring', raft: 'Raft',
    stepladder: 'Step ladder', powerbracelet: 'Power bracelet', magickey: 'Magic key',
    silverarrows: 'Silver arrows', map: 'Vault map', compass: 'Vault compass', bait: 'Bait',
  };
  const FX_FAMILIES = {
    hit: { texture: 'spark', count: 10, life: 18, color: 0xf2cf75 },
    defeat: { texture: 'flame', count: 8, life: 28, color: 0xff9b70 },
    pickup: { texture: 'magic', count: 8, life: 34, color: 0xb6f3c5 },
    dust: { texture: 'magic', count: 8, life: 16, color: 0x79aa79 },
    impact: { texture: 'spark', count: 8, life: 20, color: 0x70b8e6 },
    secret: { texture: 'magic', count: 8, life: 38, color: 0xf2cf75 },
    boss: { texture: 'flame', count: 8, life: 42, color: 0xed7893 },
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function color(hex) { return Phaser.Display.Color.HexStringToColor(hex).color; }
  function paletteFor(theme, levelId) { return Tiles.palette(theme, levelId); }
  function modeLabel(s) {
    if (s.mode === 'dungeon') return 'VAULT ' + (s.level ? s.level.id : '?');
    if (s.mode === 'cave') return 'UNDER AURELAY';
    if (s.mode === 'ending') return 'THE LUMEN CROWN';
    return 'AURELAY  ' + (s.col + 1).toString().padStart(2, '0') + ':' + (s.row + 1).toString().padStart(2, '0');
  }
  function isDungeon(s) { return s.mode === 'dungeon' || s.mode === 'cave' || s.theme === 'dungeon' || s.theme === 'dungeon2'; }
  function adjacent(grid, c, r, test) {
    return (grid[r - 1] && test(grid[r - 1][c])) || (grid[r + 1] && test(grid[r + 1][c])) ||
      (grid[r] && (test(grid[r][c - 1]) || test(grid[r][c + 1])));
  }
  function tileFrame(ch, dungeon, c, r, grid) {
    const map = dungeon ? FRAME_MAP.dungeon : FRAME_MAP.town;
    if (ch === 'W') {
      const waterNeighbor = adjacent(grid, c, r, v => v === 'W');
      return dungeon ? (waterNeighbor ? 18 : 19) : (waterNeighbor ? 42 : 43);
    }
    if (ch === '.' && adjacent(grid, c, r, v => v === 'W')) return dungeon ? 1 : 2;
    if ((ch === 'M' || ch === 'R') && adjacent(grid, c, r, v => v === '.')) return dungeon ? 14 : 27;
    return map[ch] == null ? (dungeon ? map.F : map['.']) : map[ch];
  }

  class Scene extends Phaser.Scene {
    constructor() { super({ key: 'wanderlight' }); }

    preload() {
      kit.loader.show('WANDERLIGHT');
      this.load.on('progress', value => kit.loader.progress(value));
      this.load.spritesheet('town', 'assets/town_tiles.png', { frameWidth: 16, frameHeight: 16, endFrame: 131 });
      this.load.spritesheet('dungeon', 'assets/dungeon_tiles.png', { frameWidth: 16, frameHeight: 16, endFrame: 131 });
      this.load.image('spark', 'assets/spark.png');
      this.load.image('magic', 'assets/magic.png');
      this.load.image('flame', 'assets/flame.png');
      this.load.once('complete', () => kit.loader.progress(1));
    }

    create() {
      Game.init();
      window.__wanderApp.scene = this;
      this.elapsed = 0;
      this.gridSig = '';
      this.transitionSig = '';
      this.worldScale = 3;
      this.cameraX = 0;
      this.cameraY = 0;
      this.worldX = 0;
      this.worldY = 0;
      this.manualPause = false;
      this.restartConfirm = false;
      this.splashT = 1900;
      this.tutorialStep = 0;
      this.tutorialStartX = state.wren ? state.wren.x : 0;
      this.tutorialStartY = state.wren ? state.wren.y : 0;
      this.lastSwordId = state.swordSwingId;
      this.tutorialSwordId = state.swordSwingId;
      this.lastGridVersion = 0;
      this.flashing = new WeakSet();
      this.buildSceneObjects();
      this.buildControls();
      this.bindPauseShell();
      this.layout(true);
      kit.loader.hide();
      this.refreshAll(true);
      this.ui.setVisible(false);
    }

    textStyle(size, fill, extra = {}) {
      return Object.assign({ fontFamily: 'monospace', fontSize: size + 'px', color: fill, fontStyle: 'bold' }, extra);
    }

    buildSceneObjects() {
      this.background = this.add.graphics().setDepth(-10);
      this.stars = this.add.graphics().setDepth(-9);
      this.worldLayer = this.add.container(0, 0).setDepth(2);
      this.gridLayer = this.add.container(0, 0);
      this.transitionLayer = this.add.container(0, 0);
      this.worldLayer.add(this.gridLayer);
      this.worldLayer.add(this.transitionLayer);
      this.tileSprites = [];
      this.transitionSprites = [];
      for (let i = 0; i < WORLD_W / TILE * (WORLD_H / TILE); i++) {
        const town = this.add.image(0, 0, 'town', 0).setOrigin(0).setVisible(false);
        const next = this.add.image(0, 0, 'town', 0).setOrigin(0).setVisible(false);
        this.gridLayer.add(town); this.transitionLayer.add(next);
        this.tileSprites.push(town); this.transitionSprites.push(next);
      }
      this.tileDetails = this.add.graphics();
      this.waterDetails = this.add.graphics().setDepth(2);
      this.motionDetails = this.add.graphics().setDepth(3);
      this.gridLayer.add(this.tileDetails); this.gridLayer.add(this.waterDetails); this.gridLayer.add(this.motionDetails);
      this.darkness = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x020611, 0.80).setOrigin(0).setVisible(false);
      this.worldLayer.add(this.darkness);
      this.torchGlow = this.add.image(0, 0, 'magic').setBlendMode(Phaser.BlendModes.ADD).setTint(color(PALETTE.gold)).setAlpha(0.42).setScale(0.86).setVisible(false);
      this.worldLayer.add(this.torchGlow);
      this.tutorialGuide = this.add.graphics().setDepth(18).setVisible(false);
      this.worldLayer.add(this.tutorialGuide);

      this.entityPool = [];
      for (let i = 0; i < 72; i++) {
        const sprite = this.add.image(0, 0, 'town', 124).setOrigin(0.5).setVisible(false);
        this.worldLayer.add(sprite); this.entityPool.push(sprite);
      }
      this.playerSprite = this.add.image(0, 0, 'town', 120).setOrigin(0.5).setDepth(12);
      this.bladeSprite = this.add.image(0, 0, 'spark').setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(color(PALETTE.gold)).setVisible(false);
      this.worldLayer.add(this.playerSprite); this.worldLayer.add(this.bladeSprite);

      this.entityRefs = [];
      this.entityMeta = [];
      for (let i = 0; i < 72; i++) this.entityMeta.push({ ref: null, present: false, x: 0, y: 0, kind: '', etype: '' });
      this.entityCount = 0;
      this.fxFamilies = {};
      for (const name of Object.keys(FX_FAMILIES)) this.makeFxFamily(name, FX_FAMILIES[name]);
      this.motes = [];
      for (let i = 0; i < 12; i++) {
        const sprite = this.add.image(0, 0, i % 3 ? 'magic' : 'flame').setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
        this.worldLayer.add(sprite); this.motes.push({ sprite, phase: i * 0.73, x: 10 + (i * 37) % 236, y: 12 + (i * 47) % 148 });
      }

      this.ui = this.add.container(0, 0).setDepth(30);
      this.hudPanel = this.add.graphics(); this.ui.add(this.hudPanel);
      this.brand = this.add.text(0, 0, 'WANDERLIGHT', this.textStyle(18, PALETTE.paper, { letterSpacing: 3 })); this.ui.add(this.brand);
      this.areaText = this.add.text(0, 0, '', this.textStyle(10, PALETTE.mint, { letterSpacing: 1 })); this.ui.add(this.areaText);
      this.statsText = this.add.text(0, 0, '', this.textStyle(11, PALETTE.paper, { align: 'right' }));
      this.statsText.setOrigin(1, 0); this.ui.add(this.statsText);
      this.hintText = this.add.text(0, 0, '', this.textStyle(11, '#bed0d2', { align: 'center', wordWrap: { width: 340 } })).setOrigin(0.5, 0); this.ui.add(this.hintText);
      this.messagePanel = this.add.graphics(); this.ui.add(this.messagePanel);
      this.messageText = this.add.text(0, 0, '', this.textStyle(12, PALETTE.paper, { align: 'center', wordWrap: { width: 330 } })).setOrigin(0.5); this.ui.add(this.messageText);
      this.controls = this.add.graphics().setAlpha(0.95); this.ui.add(this.controls);
      this.controlText = [
        this.add.text(0, 0, 'MOVE', this.textStyle(9, '#c8dfd6')).setOrigin(0.5),
        this.add.text(0, 0, 'B', this.textStyle(17, PALETTE.ink)).setOrigin(0.5),
        this.add.text(0, 0, 'A', this.textStyle(17, PALETTE.ink)).setOrigin(0.5),
        this.add.text(0, 0, 'PACK', this.textStyle(8, PALETTE.paper)).setOrigin(0.5),
      ];
      for (const t of this.controlText) this.ui.add(t);
      this.pauseButton = this.add.text(0, 0, 'PAUSE', this.textStyle(9, PALETTE.paper, { backgroundColor: '#17314a', padding: { left: 10, right: 10, top: 7, bottom: 7 } })).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      this.pauseButton.on('pointerup', () => this.openManualPause()); this.ui.add(this.pauseButton);
      this.settingsButton = this.add.text(0, 0, 'SETTINGS', this.textStyle(9, PALETTE.mint, { backgroundColor: '#17314a', padding: { left: 9, right: 9, top: 7, bottom: 7 } })).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      this.settingsButton.on('pointerup', () => kit.openSettings()); this.ui.add(this.settingsButton);

      this.splash = this.add.container(0, 0).setDepth(50).setVisible(true);
      this.splashCard = this.add.graphics(); this.splash.add(this.splashCard);
      this.splashGlow = this.add.image(0, 0, 'magic').setBlendMode(Phaser.BlendModes.ADD).setTint(color(PALETTE.gold)).setAlpha(0.64).setScale(0.30); this.splash.add(this.splashGlow);
      this.splashWren = this.add.image(0, 0, 'town', 120).setScale(3).setOrigin(0.5); this.splash.add(this.splashWren);
      this.splashTitle = this.add.text(0, 0, 'WANDERLIGHT', this.textStyle(31, PALETTE.paper, { letterSpacing: 5 })).setOrigin(0.5); this.splash.add(this.splashTitle);
      this.splashSub = this.add.text(0, 0, 'THE LUMEN PATH IS FADING', this.textStyle(10, PALETTE.gold, { letterSpacing: 2 })).setOrigin(0.5); this.splash.add(this.splashSub);
      this.splashPrompt = this.add.text(0, 0, 'TAP A OR PRESS Z TO ENTER', this.textStyle(11, PALETTE.mint, { letterSpacing: 1 })).setOrigin(0.5); this.splash.add(this.splashPrompt);
      this.tutorial = this.add.container(0, 0).setDepth(45).setVisible(false);
      this.tutorialCard = this.add.graphics(); this.tutorial.add(this.tutorialCard);
      this.tutorialText = this.add.text(0, 0, '', this.textStyle(12, PALETTE.paper, { align: 'center', wordWrap: { width: 300 } })).setOrigin(0.5); this.tutorial.add(this.tutorialText);
      this.tutorialStepText = this.add.text(0, 0, '', this.textStyle(9, PALETTE.gold, { letterSpacing: 1 })).setOrigin(0.5); this.tutorial.add(this.tutorialStepText);

      this.pauseMenu = this.add.container(0, 0).setDepth(60).setVisible(false);
      this.pauseScrim = this.add.graphics(); this.pauseMenu.add(this.pauseScrim);
      this.pauseCard = this.add.graphics(); this.pauseMenu.add(this.pauseCard);
      this.pauseTitle = this.add.text(0, 0, 'PAUSED', this.textStyle(24, PALETTE.paper, { letterSpacing: 4 })).setOrigin(0.5); this.pauseMenu.add(this.pauseTitle);
      this.resumeButton = this.makeMenuButton('RESUME', () => this.resumeManualPause()); this.pauseMenu.add(this.resumeButton);
      this.menuSettings = this.makeMenuButton('SETTINGS', () => kit.openSettings()); this.pauseMenu.add(this.menuSettings);
      this.restartButton = this.makeMenuButton('RESTART JOURNEY', () => this.requestRestart()); this.pauseMenu.add(this.restartButton);
      this.pauseHint = this.add.text(0, 0, 'ESC / ENTER  RESUME     R  RESTART', this.textStyle(9, '#91a9ad')).setOrigin(0.5); this.pauseMenu.add(this.pauseHint);

      this.packMenu = this.add.container(0, 0).setDepth(60).setVisible(false);
      this.packScrim = this.add.graphics(); this.packMenu.add(this.packScrim);
      this.packCard = this.add.graphics(); this.packMenu.add(this.packCard);
      this.packTitle = this.add.text(0, 0, 'PACK', this.textStyle(24, PALETTE.paper, { letterSpacing: 4 })).setOrigin(0.5); this.packMenu.add(this.packTitle);
      this.packSubtitle = this.add.text(0, 0, 'TOOLS AND RELICS', this.textStyle(9, PALETTE.mint, { letterSpacing: 1 })).setOrigin(0.5); this.packMenu.add(this.packSubtitle);
      this.packCards = [];
      for (let i = 0; i < 8; i++) {
        const bg = this.add.graphics();
        const icon = this.add.image(0, 0, 'town', 124).setOrigin(0.5).setScale(1.5);
        const label = this.add.text(0, 0, '', this.textStyle(9, PALETTE.paper, { align: 'center' })).setOrigin(0.5);
        const desc = this.add.text(0, 0, '', this.textStyle(7, '#a7c2c0', { align: 'center', wordWrap: { width: 84 } })).setOrigin(0.5);
        const slot = this.add.text(0, 0, '', this.textStyle(7, PALETTE.gold, { letterSpacing: 1 })).setOrigin(0.5);
        this.packMenu.add(bg); this.packMenu.add(icon); this.packMenu.add(label); this.packMenu.add(desc); this.packMenu.add(slot);
        this.packCards.push({ bg, icon, label, desc, slot, id: '' });
      }
      this.packHint = this.add.text(0, 0, 'ARROWS PICK   A SETS TOOL   ENTER CLOSES', this.textStyle(8, PALETTE.gold, { letterSpacing: 1 })).setOrigin(0.5); this.packMenu.add(this.packHint);
      this.packSig = '';
    }

    makeFxFamily(name, spec) {
      const family = { sprites: [], data: [], color: spec.color, life: spec.life };
      for (let i = 0; i < spec.count; i++) {
        const sprite = this.add.image(0, 0, spec.texture).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
        this.worldLayer.add(sprite); family.sprites.push(sprite); family.data.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, scale: 0.04 });
      }
      this.fxFamilies[name] = family;
    }

    makeMenuButton(label, fn) {
      const button = this.add.text(0, 0, label, this.textStyle(10, PALETTE.ink, { backgroundColor: PALETTE.mint, padding: { left: 20, right: 20, top: 11, bottom: 11 } })).setOrigin(0.5).setInteractive({ useHandCursor: true });
      button.on('pointerup', fn);
      button.on('pointerover', () => button.setStyle({ backgroundColor: PALETTE.gold }));
      button.on('pointerout', () => button.setStyle({ backgroundColor: PALETTE.mint }));
      return button;
    }

    bindPauseShell() {
      if (!this.input.keyboard) return;
      this.input.keyboard.on('keydown-ESC', () => {
        if (this.manualPause) this.resumeManualPause();
        else if (state.mode === 'pack') state.closePack && state.closePack();
        else this.openManualPause();
      });
      this.input.keyboard.on('keydown-ENTER', () => {
        if (!this.manualPause) return;
        if (this.restartConfirm) this.confirmRestart(); else this.resumeManualPause();
      });
      this.input.keyboard.on('keydown-R', () => { if (this.manualPause) this.requestRestart(); });
      this.input.keyboard.on('keydown-A', () => { if (this.manualPause && this.restartConfirm) this.confirmRestart(); });
    }

    buildControls() {}

    layout(force) {
      const w = this.scale.width || window.innerWidth;
      const h = this.scale.height || window.innerHeight;
      if (!force && w === this.lastW && h === this.lastH) return;
      this.lastW = w; this.lastH = h;
      this.worldScale = w < 700 ? 3 : clamp((w - 60) / WORLD_W, 2.25, 3.15);
      this.worldY = Math.max(94, Math.min(124, h * 0.14));
      this.background.clear();
      this.background.fillGradientStyle(0x06121e, 0x081d2b, 0x0a1827, 0x102d3b, 1);
      this.background.fillRect(0, 0, w, h);
      this.stars.clear();
      for (let i = 0; i < 42; i++) {
        const x = (i * 83) % Math.max(1, w); const y = 18 + ((i * 47) % Math.max(40, Math.floor(h * 0.64)));
        this.stars.fillStyle(i % 5 === 0 ? 0xf2cf75 : 0x6aa6a8, i % 5 === 0 ? 0.34 : 0.18);
        this.stars.fillCircle(x, y, i % 5 === 0 ? 1.4 : 1);
      }
      this.hudPanel.clear(); this.hudPanel.fillStyle(0x0b1a2a, 0.94); this.hudPanel.fillRect(12, 12, w - 24, 72);
      this.hudPanel.lineStyle(1, 0x4e8f8b, 0.62); this.hudPanel.strokeRect(12.5, 12.5, w - 25, 71);
      this.brand.setPosition(25, 23); this.areaText.setPosition(26, 52); this.statsText.setPosition(w - 24, 22);
      this.pauseButton.setPosition(w - 22, 95); this.settingsButton.setPosition(w - 104, 95);
      const cy = h - 86;
      this.controls.clear();
      this.controls.fillStyle(0x1b3b4b, 0.74); this.controls.fillCircle(72, cy, 50);
      this.controls.lineStyle(2, 0x8dc3b4, 0.56); this.controls.strokeCircle(72, cy, 50);
      this.controls.fillStyle(0x65c4b0, 0.62); this.controls.fillCircle(w - 72, h - 82, 34);
      this.controls.fillStyle(0xf0ba73, 0.66); this.controls.fillCircle(w - 148, h - 122, 30);
      this.controls.fillStyle(0x264c62, 0.92); this.controls.fillRect(w / 2 - 36, h - 53, 72, 32);
      this.controlText[0].setPosition(72, cy + 66); this.controlText[1].setPosition(w - 148, h - 122); this.controlText[2].setPosition(w - 72, h - 82); this.controlText[3].setPosition(w / 2, h - 37);
      this.messageText.setPosition(w / 2, this.worldY + WORLD_H * this.worldScale + 19);
      this.hintText.setPosition(w / 2, this.worldY + WORLD_H * this.worldScale + 45);
      this.positionSplash(w, h); this.positionTutorial(w, h); this.positionPause(w, h); this.positionPack(w, h);
      this.positionWorld();
    }

    positionWorld() {
      const w = this.scale.width || window.innerWidth;
      const h = this.scale.height || window.innerHeight;
      const viewW = w / this.worldScale;
      const viewH = Math.max(WORLD_H, (h - 256) / this.worldScale);
      const px = state.wren ? state.wren.x + 8 : WORLD_W / 2;
      const py = state.wren ? state.wren.y + 8 : WORLD_H / 2;
      this.cameraX = clamp(px - viewW * 0.5, 0, Math.max(0, WORLD_W - viewW));
      this.cameraY = clamp(py - viewH * 0.56, 0, Math.max(0, WORLD_H - viewH));
      this.worldX = w * 0.5 - (this.cameraX + viewW * 0.5) * this.worldScale;
      this.worldY = Math.max(94, Math.min(124, h * 0.14));
      this.worldLayer.setScale(this.worldScale).setPosition(this.worldX, this.worldY);
    }

    positionSplash(w, h) {
      this.splash.setPosition(w / 2, h / 2);
      this.splashCard.clear(); this.splashCard.fillStyle(0x06121f, 0.985); this.splashCard.fillRect(-w / 2, -h / 2, w, h);
      this.splashCard.lineStyle(2, 0x4e8f8b, 0.50); this.splashCard.strokeRect(20 - w / 2, 20 - h / 2, w - 40, h - 40);
      this.splashTitle.setPosition(0, -132); this.splashGlow.setPosition(0, -38); this.splashWren.setPosition(0, 5); this.splashSub.setPosition(0, 126); this.splashPrompt.setPosition(0, 174);
    }

    positionTutorial(w) {
      this.tutorial.setPosition(w / 2, this.worldY + WORLD_H * this.worldScale * 0.53);
      const width = Math.min(340, w - 28);
      this.tutorialCard.clear(); this.tutorialCard.fillStyle(0x081725, 0.95); this.tutorialCard.fillRect(-width / 2, -57, width, 114);
      this.tutorialCard.lineStyle(2, 0x6bb8a6, 0.78); this.tutorialCard.strokeRect(-width / 2 + 1, -56, width - 2, 112);
      this.tutorialText.setPosition(0, -3); this.tutorialStepText.setPosition(0, 39);
    }

    positionPause(w, h) {
      this.pauseMenu.setPosition(w / 2, h / 2);
      this.pauseScrim.clear(); this.pauseScrim.fillStyle(0x020811, 0.78); this.pauseScrim.fillRect(-w / 2, -h / 2, w, h);
      this.pauseCard.clear(); this.pauseCard.fillStyle(0x071522, 0.98); this.pauseCard.fillRect(-172, -204, 344, 408); this.pauseCard.lineStyle(2, 0x6bb8a6, 0.85); this.pauseCard.strokeRect(-171, -203, 342, 406); this.pauseCard.lineStyle(1, 0xf2cf75, 0.45); this.pauseCard.strokeRect(-164, -196, 328, 392);
      this.pauseTitle.setPosition(0, -154); this.resumeButton.setPosition(0, -78); this.menuSettings.setPosition(0, -12); this.restartButton.setPosition(0, 55); this.pauseHint.setPosition(0, 133);
    }

    positionPack(w, h) {
      this.packMenu.setPosition(w / 2, h / 2);
      this.packScrim.clear(); this.packScrim.fillStyle(0x020811, 0.76); this.packScrim.fillRect(-w / 2, -h / 2, w, h);
      const panelW = Math.min(366, w - 22); this.packCard.clear(); this.packCard.fillStyle(0x071522, 0.98); this.packCard.fillRect(-panelW / 2, -218, panelW, 436); this.packCard.lineStyle(2, 0x6bb8a6, 0.85); this.packCard.strokeRect(-panelW / 2 + 1, -217, panelW - 2, 434);
      this.packTitle.setPosition(0, -190); this.packSubtitle.setPosition(0, -166);
      const cardW = Math.min(104, (panelW - 42) / 3); const startX = -((cardW * 3 + 12 * 2) / 2) + cardW / 2;
      for (let i = 0; i < this.packCards.length; i++) {
        const col = i % 3, row = Math.floor(i / 3), x = startX + col * (cardW + 12), y = -128 + row * 92;
        const card = this.packCards[i]; card.bg.setPosition(x, y); card.icon.setPosition(x, y - 18); card.label.setPosition(x, y + 6); card.desc.setPosition(x, y + 24); card.slot.setPosition(x, y - 39);
      }
      this.packHint.setPosition(0, 193);
    }

    refreshAll(force) {
      const s = state;
      const version = s.screenImg && s.screenImg.version ? s.screenImg.version : 0;
      const sig = (s.mode || '') + ':' + (s.col || 0) + ':' + (s.row || 0) + ':' + (s.theme || '') + ':' + version;
      if (force || sig !== this.gridSig) {
        this.gridSig = sig;
        this.renderGrid(this.tileSprites, s.grid, true);
        this.lastGridVersion = version;
      }
      const scrolling = s.mode === 'scroll' && s.scroll;
      if (scrolling) {
        const p = clamp(s.scroll.t / Math.max(1, s.scroll.max), 0, 1);
        const dx = s.scroll.dir === 'left' ? 1 : s.scroll.dir === 'right' ? -1 : 0;
        const dy = s.scroll.dir === 'up' ? 1 : s.scroll.dir === 'down' ? -1 : 0;
        this.gridLayer.setPosition(dx * p * WORLD_W, dy * p * WORLD_H);
        const tsig = String(s.scroll.toGrid) + ':' + (s.scroll.toGrid ? s.scroll.toGrid.length : 0);
        if (tsig !== this.transitionSig) { this.transitionSig = tsig; this.renderGrid(this.transitionSprites, s.scroll.toGrid, false); }
        this.transitionLayer.setPosition(dx * p * WORLD_W - dx * WORLD_W, dy * p * WORLD_H - dy * WORLD_H).setVisible(true);
      } else {
        this.gridLayer.setPosition(0, 0); this.transitionLayer.setPosition(0, 0).setVisible(false); this.transitionSig = '';
      }
      this.updateWaterOverlay(s.grid);
      this.updateSecondaryMotion(s.grid);
      this.renderEntities(scrolling ? s.scroll : null);
    }

    renderGrid(sprites, grid, visible) {
      if (!grid) { for (const sprite of sprites) sprite.setVisible(false); return; }
      const dungeon = isDungeon(state); const tex = dungeon ? 'dungeon' : 'town'; const pal = paletteFor(state.theme, state.level && state.level.id);
      if (sprites === this.tileSprites) this.tileDetails.clear();
      for (let r = 0; r < 11; r++) for (let c = 0; c < 16; c++) {
        const ch = (grid[r] && grid[r][c]) || (dungeon ? 'F' : '.'); const i = r * 16 + c; const sprite = sprites[i];
        sprite.setTexture(tex).setFrame(tileFrame(ch, dungeon, c, r, grid)).setPosition(c * TILE, r * TILE).setVisible(visible);
        let tint = pal.groundAlt || pal.ground;
        if (ch === 'W' || ch === '~') tint = pal.water;
        else if (ch === 'M' || ch === 'R' || ch === '#') tint = pal.rock;
        else if (ch === 'T' || ch === 'U' || ch === 'G' || ch === 'A') tint = pal.grass;
        else if (ch === 'D' || ch === 'C' || ch === 'S') tint = pal.waterLt;
        sprite.setTint(color(tint));
        if (sprites === this.tileSprites) {
          if (ch === '.' || ch === '~' || ch === 'F') { this.tileDetails.fillStyle(color(pal.grassDk), 0.22); this.tileDetails.fillRect(c * 16 + ((c * 7 + r * 3) % 12), r * 16 + ((r * 5 + c * 2) % 12), 2, 1); }
          if (ch === 'C' || ch === 'D' || ch === 'S') { this.tileDetails.lineStyle(1, color(pal.gold || PALETTE.gold), 0.58); this.tileDetails.strokeRect(c * 16 + 3, r * 16 + 3, 10, 10); }
          if (ch !== 'W' && adjacent(grid, c, r, v => v === 'W')) { this.tileDetails.lineStyle(1, color(pal.waterLt), 0.52); this.tileDetails.lineBetween(c * 16, r * 16 + 1, c * 16 + 16, r * 16 + 1); }
        }
      }
    }

    updateWaterOverlay(grid) {
      this.waterDetails.clear();
      if (!grid) return;
      const dungeon = isDungeon(state); const pal = paletteFor(state.theme, state.level && state.level.id); const t = this.elapsed / 230;
      this.waterDetails.lineStyle(1, color(pal.waterLt), 0.58);
      for (let r = 0; r < 11; r++) for (let c = 0; c < 16; c++) if (grid[r] && grid[r][c] === 'W') {
        const wave = Math.sin(t + c * 0.8 + r * 0.35) * 2;
        this.waterDetails.lineBetween(c * 16 + 3, r * 16 + 6 + wave, c * 16 + (dungeon ? 12 : 13), r * 16 + 6 + wave);
      }
    }

    updateSecondaryMotion(grid) {
      this.motionDetails.clear();
      if (!grid || state.mode === 'scroll') return;
      const pal = paletteFor(state.theme, state.level && state.level.id);
      const grass = color(pal.grassDk), gold = color(pal.gold || PALETTE.gold);
      const t = this.elapsed / 280;
      for (let r = 0; r < 11; r++) for (let c = 0; c < 16; c++) {
        const ch = grid[r] && grid[r][c];
        if (ch === 'T' || ch === 'U' || ch === 'G') {
          const sway = Math.sin(t + c * 0.73 + r * 0.41) * 1.2;
          this.motionDetails.lineStyle(1, grass, 0.48);
          this.motionDetails.lineBetween(c * 16 + 6, r * 16 + 13, c * 16 + 7 + sway, r * 16 + 8);
        } else if (ch === 'D' || ch === 'C' || ch === 'S' || ch === 'K') {
          const pulse = 0.34 + (Math.sin(t * 1.4 + c * 0.5 + r) + 1) * 0.16;
          this.motionDetails.lineStyle(1, gold, pulse);
          this.motionDetails.strokeRect(c * 16 + 3, r * 16 + 3, 10, 10);
        }
      }
    }

    findEntitySlot(e) {
      for (let i = 0; i < this.entityCount; i++) if (this.entityMeta[i].ref === e) return i;
      for (let i = 0; i < this.entityMeta.length; i++) if (!this.entityMeta[i].present && !this.entityMeta[i].ref) return i;
      return -1;
    }

    renderEntities(scroll) {
      const s = state; const oldCount = this.entityCount;
      for (let i = 0; i < oldCount; i++) this.entityMeta[i].present = false;
      let poolIndex = 0;
      for (const e of s.entities || []) {
        if (!e || e.alive === false) continue;
        const slot = this.findEntitySlot(e);
        if (slot >= 0) {
          const record = this.entityMeta[slot]; record.ref = e; record.present = true; record.x = e.x || 0; record.y = e.y || 0; record.kind = e.kind; record.etype = e.etype || e.item || e.ptype || e.fxkind || '';
          if (slot >= this.entityCount) this.entityCount = slot + 1;
        }
        if (e.hidden || e.kind === 'wren') continue;
        const sprite = this.entityPool[poolIndex++]; if (!sprite) break;
        this.styleEntity(sprite, e);
        if (e.flash > 0) {
          if (!this.flashing.has(e)) { this.flashing.add(e); this.burst('hit', e.x || 0, e.y || 0, e.boss ? 2 : 1); if (e.boss) this.burst('boss', e.x || 0, e.y || 0, 1); kit.juice.shake(2.2, 90); kit.juice.hitStop(42); }
        } else this.flashing.delete(e);
      }
      for (let i = poolIndex; i < this.entityPool.length; i++) this.entityPool[i].setVisible(false);
      for (let i = 0; i < oldCount; i++) {
        const record = this.entityMeta[i];
        if (!record.present && record.ref) {
          if (record.kind === 'enemy') this.burst(record.etype === 'sable' ? 'boss' : 'defeat', record.x, record.y, 1);
          else if (record.kind === 'item') this.burst('pickup', record.x, record.y, 1);
          else if (record.kind === 'proj') this.burst('impact', record.x, record.y, 1);
          record.ref = null;
        }
      }
      const wren = s.wren; let px = wren ? wren.x : 120; let py = wren ? wren.y : 80;
      if (scroll) { const p = clamp(scroll.t / Math.max(1, scroll.max), 0, 1); px = scroll.wrenFrom.x + (scroll.wrenTo.x - scroll.wrenFrom.x) * p; py = scroll.wrenFrom.y + (scroll.wrenTo.y - scroll.wrenFrom.y) * p; }
      this.drawPlayer(wren, px, py);
      this.darkness.setVisible(!!s.dark && s.mode === 'dungeon');
      this.torchGlow.setVisible(!!s.dark && s.mode === 'dungeon').setPosition(px + 8, py + 8).setScale(0.82 + Math.sin(this.elapsed / 160) * 0.07);
    }

    styleEntity(sprite, e) {
      const dungeon = isDungeon(state); const texture = dungeon ? 'dungeon' : 'town'; let frames = ACTOR_FRAMES[e.etype] || [124, 125];
      let frame = frames[(Math.floor(this.elapsed / (e.kind === 'enemy' ? 180 : 120)) + (e.frame || 0)) % frames.length]; let tint = 0xffffff; let scale = 1;
      if (e.kind === 'item') { frame = 124 + ((e.item ? e.item.length : 0) % 8); tint = e.item === 'shard' ? 0xf2cf75 : e.item === 'heartcontainer' ? 0xed7893 : 0xb6f3c5; scale = 1.1 + Math.sin(this.elapsed / 150) * 0.08; }
      else if (e.kind === 'proj') { sprite.setTexture(e.fromEnemy ? 'flame' : 'magic').setPosition((e.x || 0) + 8, (e.y || 0) + 8).setScale(e.exploding ? 0.10 : 0.055).setTint(e.fromEnemy ? 0xed7893 : 0xf2cf75).setAlpha(0.92).setVisible(true); return; }
      else if (e.kind === 'fx') { sprite.setTexture(e.fxkind === 'poof' ? 'flame' : 'spark').setPosition((e.x || 0) + 8, (e.y || 0) + 8).setScale(0.05 + ((e.t || 0) % 4) * 0.008).setTint(e.fxkind === 'poof' ? 0xff9b70 : 0xb6f3c5).setAlpha(0.85).setVisible(true); return; }
      if (e.boss) scale = 1.55;
      sprite.setTexture(texture).setFrame(frame).setPosition((e.x || 0) + (e.w || 16) / 2, (e.y || 0) + (e.h || 16) / 2).setScale(scale).setTint(tint).setAlpha(e.flash > 0 ? 1 : 0.98).setFlipX(e.dir === 'left').setAngle(e.kind === 'hazard' ? 45 : 0).setVisible(true);
    }

    drawPlayer(wren, x, y) {
      if (!wren) { this.playerSprite.setVisible(false); this.bladeSprite.setVisible(false); return; }
      const blink = wren.invuln > 0 && ((wren.invuln >> 2) & 1); const frames = ACTOR_FRAMES.wren; const frame = frames[(wren.frame || 0) + (wren.moving ? 1 : 0)];
      this.playerSprite.setTexture('town').setFrame(frame).setPosition(x + 8, y + 8).setScale(wren.hoist > 0 ? 1.14 : 1.06).setVisible(!blink).setTint(wren.hasRedRing ? 0xd85b77 : wren.hasRing ? 0x70b8e6 : 0xffffff).setFlipX(wren.dir === 'left');
      const attack = wren.attackTimer > 0 || state.swordSwung > 0;
      if (attack) {
        const angle = wren.dir === 'left' ? 180 : wren.dir === 'up' ? 270 : wren.dir === 'down' ? 90 : 0;
        this.bladeSprite.setPosition(x + 8 + (wren.dir === 'left' ? -10 : wren.dir === 'right' ? 10 : 0), y + 8 + (wren.dir === 'up' ? -10 : wren.dir === 'down' ? 10 : 0)).setRotation(angle * Math.PI / 180).setScale(0.085).setAlpha(0.88).setVisible(true);
      } else this.bladeSprite.setVisible(false);
    }

    burst(name, x, y, strength) {
      const family = this.fxFamilies[name] || this.fxFamilies.hit; let index = -1;
      for (let i = 0; i < family.data.length; i++) if (family.data[i].life <= 0) { index = i; break; }
      if (index < 0) return;
      const d = family.data[index], sprite = family.sprites[index]; d.life = family.life; d.x = x + 8; d.y = y + 8; d.vx = ((index & 1) ? 1 : -1) * (0.45 + (index % 3) * 0.25) * (strength || 1); d.vy = -0.9 - (index % 4) * 0.18; d.scale = name === 'defeat' || name === 'boss' ? 0.07 : 0.045;
      sprite.setPosition(d.x, d.y).setScale(d.scale).setAlpha(0.94).setTint(family.color).setVisible(true);
    }

    updateParticles() {
      for (const name of Object.keys(this.fxFamilies)) {
        const family = this.fxFamilies[name];
        for (let i = 0; i < family.data.length; i++) {
          const d = family.data[i], sprite = family.sprites[i];
          if (d.life <= 0) { sprite.setVisible(false); continue; }
          d.life--; d.x += d.vx; d.y += d.vy; d.vy += 0.035; sprite.setPosition(d.x, d.y).setScale(d.scale * (d.life / family.life)).setAlpha(d.life / family.life);
        }
      }
      for (const mote of this.motes) { mote.phase += 0.012; mote.sprite.setPosition(mote.x + Math.sin(this.elapsed / 710 + mote.phase) * 5, mote.y + Math.cos(this.elapsed / 840 + mote.phase) * 4).setScale(0.030 + (Math.sin(this.elapsed / 510 + mote.phase) + 1) * 0.007); }
    }

    updateTutorial() {
      if (this.splashT > 0 || this.tutorialStep >= 3 || !state.wren || state.mode === 'title' || state.mode === 'pack') { this.tutorial.setVisible(false); this.tutorialGuide.setVisible(false); return; }
      if (this.tutorialStep === 0 && (Math.abs(state.wren.x - this.tutorialStartX) > 2 || Math.abs(state.wren.y - this.tutorialStartY) > 2)) this.tutorialStep = 1;
      if (this.tutorialStep === 1 && state.swordSwingId !== this.tutorialSwordId) { this.tutorialStep = 2; this.tutorialSwordId = state.swordSwingId; }
      if (this.tutorialStep === 2 && (Engine.lastPressed.b || state.wren.hoist > 0)) this.tutorialStep = 3;
      if (this.tutorialStep >= 3) { this.tutorial.setVisible(false); this.tutorialGuide.setVisible(false); return; }
      const copy = [
        'Follow the lantern. Drag the left circle to reach the moss marker.',
        'A path opens with a blade. Tap A or press Z to strike the practice target.',
        'Tools live in the B slot. Tap B once to complete the opening lesson.',
      ][this.tutorialStep];
      this.tutorial.setVisible(true); this.tutorialText.setText(copy); this.tutorialStepText.setText('FIRST LIGHT   ' + (this.tutorialStep + 1) + ' / 3');
      this.tutorialGuide.clear(); this.tutorialGuide.lineStyle(2, 0xf2cf75, 0.78); this.tutorialGuide.setVisible(true);
      const gx = this.tutorialStep === 2 ? state.wren.x + 8 : state.wren.x + (this.tutorialStep === 0 ? 34 : 0); const gy = state.wren.y + (this.tutorialStep === 1 ? 8 : 8);
      this.tutorialGuide.strokeCircle(gx, gy, 12 + Math.sin(this.elapsed / 120) * 2);
    }

    updateHud() {
      const s = state, wren = s.wren;
      this.areaText.setText(modeLabel(s));
      const hearts = wren ? '♥'.repeat(Math.max(0, Math.ceil((wren.health || 0) / 2))) : '';
      this.statsText.setText(wren ? ('SHARDS ' + s.shards + '/8   GLIMS ' + String(wren.rupees || 0).padStart(3, '0') + '\nHEARTS ' + hearts) : '');
      let hint = s.mode === 'cave' ? 'Walk to the lower gate to return' : s.mode === 'dungeon' ? 'Clear the vault and follow the Lumen pulse' : 'Explore the glowroads and find the eight vaults';
      if (s.mode === 'gameover') hint = 'The light fades. Tap A or press Enter to begin again.';
      if (s.mode === 'win') hint = 'The Lumen Crown shines again. Tap A to wander anew.';
      this.hintText.setText(hint);
      const msg = s.msg && s.msgT > 0 ? String(s.msg) : ''; this.messageText.setText(msg); this.messagePanel.clear();
      if (msg) { const width = Math.min(this.scale.width - 34, 360); const y = this.worldY + WORLD_H * this.worldScale + 2; this.messagePanel.fillStyle(0x091724, 0.94); this.messagePanel.fillRect((this.scale.width - width) / 2, y, width, 44); this.messagePanel.lineStyle(1, 0xf2cf75, 0.68); this.messagePanel.strokeRect((this.scale.width - width) / 2 + 0.5, y + 0.5, width - 1, 43); this.messageText.setPosition(this.scale.width / 2, y + 22); }
      else this.messageText.setPosition(this.scale.width / 2, this.worldY + WORLD_H * this.worldScale + 19);
      this.updatePackMenu();
    }

    updatePackMenu() {
      const open = state.mode === 'pack' && !this.manualPause; this.packMenu.setVisible(open);
      if (!open) return;
      const icons = state.pauseIcons || { bIds: [], gear: [] }; const ids = icons.bIds.concat((icons.gear || []).map(item => item.id)); const sig = ids.join('|') + ':' + state.pauseSel;
      if (sig === this.packSig) return; this.packSig = sig;
      for (let i = 0; i < this.packCards.length; i++) {
        const card = this.packCards[i], id = ids[i]; card.id = id || ''; card.bg.clear();
        if (!id) { card.icon.setVisible(false); card.label.setVisible(false); card.desc.setVisible(false); card.slot.setVisible(false); continue; }
        const selected = i < icons.bIds.length && i === state.pauseSel; const copy = ITEM_COPY[id] || [GEAR_COPY[id] || id.toUpperCase(), 'A relic carried on the Lumen road.'];
        card.bg.fillStyle(selected ? 0x315a61 : 0x10283a, selected ? 0.98 : 0.92); card.bg.fillRect(-50, -41, 100, 82); card.bg.lineStyle(selected ? 2 : 1, selected ? 0xf2cf75 : 0x3f7580, 0.82); card.bg.strokeRect(-49, -40, 98, 80);
        card.icon.setVisible(true).setTexture('town').setFrame(124 + (id.length % 8)).setTint(selected ? 0xf2cf75 : 0xb6f3c5); card.label.setVisible(true).setText(copy[0]); card.desc.setVisible(true).setText(copy[1]); card.slot.setVisible(true).setText(i < icons.bIds.length ? (selected ? 'B SLOT' : 'TOOL') : 'RELIC');
      }
    }

    openManualPause() { if (this.manualPause || state.mode === 'title' || state.mode === 'pack' || state.mode === 'gameover') return; this.manualPause = true; this.restartConfirm = false; this.restartButton.setText('RESTART JOURNEY'); this.pauseMenu.setVisible(true); kit.pause('manual'); }
    resumeManualPause() { if (!this.manualPause) return; this.manualPause = false; this.restartConfirm = false; this.pauseMenu.setVisible(false); kit.resume('manual'); }
    requestRestart() { if (!this.manualPause) return; this.restartConfirm = !this.restartConfirm; this.restartButton.setText(this.restartConfirm ? 'CONFIRM RESTART' : 'RESTART JOURNEY'); this.pauseHint.setText(this.restartConfirm ? 'ENTER / A  CONFIRM     ESC  CANCEL' : 'ESC / ENTER  RESUME     R  RESTART'); }
    confirmRestart() { if (!this.restartConfirm) return this.requestRestart(); kit.restart(); this.manualPause = false; this.restartConfirm = false; this.pauseMenu.setVisible(false); kit.resume('manual'); }
    dismissSplash() { if (this.splashT <= 0) return; this.splashT = 0; this.splash.setVisible(false); this.ui.setVisible(true); }

    update(time, delta) {
      const dt = delta || 16.6; this.elapsed += dt; this.layout(false);
      if (this.splashT > 0) { this.splashT -= dt; if (this.splashT <= 0) this.dismissSplash(); }
      const modeBefore = state.mode;
      const juice = kit.juice.frame();
      if (!juice.frozen) Engine.tick(delta);
      else { Engine.clearPressed(); for (const name in Engine.lastPressed) Engine.lastPressed[name] = false; }
      if (Engine.lastPressed.a || Engine.lastPressed.start) this.dismissSplash();
      if (Engine.lastPressed.escape && !this.manualPause && modeBefore !== 'pack' && modeBefore !== 'title') this.openManualPause();
      if (state.swordSwingId !== this.lastSwordId) { this.lastSwordId = state.swordSwingId; this.burst('hit', state.wren.x, state.wren.y, 1.4); }
      this.positionWorld(); this.refreshAll(false); this.updateParticles(); this.updateTutorial(); this.updateHud();
      this.worldLayer.x = this.worldX + juice.dx; this.worldLayer.y = this.worldY + juice.dy;
      this.splash.setAlpha(0.98 + Math.sin(this.elapsed / 240) * 0.02);
    }
  }

  return { Scene };
})();
