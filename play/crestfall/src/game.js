// Phaser lifecycle shell around the deterministic Emberwild simulation.
// GGKit owns input, save storage, pause, restart, PWA, and audio buses.

import { STATE, W, H, NES_W, NES_H } from './constants.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Overworld } from './overworld.js';
import { SideView } from './sideview.js';
import { TownScene } from './town.js';
import {
  drawHUD, drawTutorialStrip, drawBanner,
  drawSpellSelect, drawSkillTree, drawLevelUp, drawGameOver, drawWin, drawTitle,
} from './hud.js';
import { seedAll, resolveSeedFromURL, resolveTraceFromURL, trace } from './rng.js';
import { serializeGame, deserializeGame, resolveSaveFromURL, isValidSave } from './save.js';
import { PALACES } from './map-data.js';

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const FRAME_CLAMP_MS = 250;

class CrestfallScene extends Phaser.Scene {
  constructor() {
    super('crestfall');
  }

  create() {
    this.owner = CrestfallScene.owner;
    this.owner?._onSceneReady(this);
    // Scene systems emit `render` after the camera display list has rendered.
    // `postrender` belongs to the Game/Renderer event bus, so listening for it
    // here silently leaves the shared canvas at Phaser's clear color.
    this.sys.events.on('render', () => this.owner?._draw());
  }

  update(time, delta) {
    this.owner?._phaserUpdate(time, delta);
  }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = null;
    this.ready = false;
    this.systemPaused = false;
    this.paused = false;
    this.levelUpScreen = false;
    this.levelUpSelection = 0;
    this.menuPage = 'runes';
    this.skillSelection = 0;
    this.state = STATE.OVERWORLD;
    this.seed = resolveSeedFromURL();
    seedAll(this.seed);
    trace.enabled = resolveTraceFromURL();
    this.kit = window.GGKit.create({
      slug: 'crestfall',
      orientation: 'landscape',
      validateSave: isValidSave,
      onPause: () => { this.systemPaused = true; },
      onResume: () => { this.systemPaused = false; this._accumulatorMs = 0; },
      onRestart: () => this._resetRun(),
    });
    this.input = new Input(this.kit);
    this.player = new Player();
    this.bannerQueue = [];
    this.overworld = new Overworld(this.player, {
      onNotification: (text) => this._showBanner(text, null, '#FFE18A'),
    });
    this.sideview = new SideView(this.player, {
      onEvent: (type, data) => this._event(type, data),
      onMessage: (text, color) => this._showBanner(text, null, color),
    });
    this.town = new TownScene(this.player);
    this.bestScore = 0;
    this.titleFrame = 0;
    this.gameOverTimer = 0;
    this.winTimer = 0;
    this.palaceClearTimer = null;
    this.frame = 0;
    this.tutorialStep = 0;
    this.tutorialTimer = 180;
    this.banner = null;
    this._musicName = null;
    this._accumulatorMs = 0;
    this._lastTs = null;
    this._wireSaveAPI();
    this._wireTestAPI();
    this._loadURLSave();
    this.kit.loader.show('CRESTFALL');
    this.kit.registerPWA();
    CrestfallScene.owner = this;
    this.phaserGame = new Phaser.Game({
      type: Phaser.CANVAS,
      canvas: this.canvas,
      width: W,
      height: H,
      backgroundColor: '#050710',
      render: { antialias: false, pixelArt: true, roundPixels: true, clearBeforeRender: true },
      banner: false,
      scene: CrestfallScene,
    });
  }

  _onSceneReady(scene) {
    this.ctx = scene.sys.game.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.ready = true;
    this.kit.audio.register({
      fieldLoop: 'assets/field-loop.m4a',
      dangerLoop: 'assets/danger-loop.m4a',
      swordClash: 'assets/sword-clash.m4a',
      runeChime: 'assets/rune-chime.m4a',
      townAmbience: 'assets/town-ambience.m4a',
      guardianRoar: 'assets/guardian-roar.m4a',
      pickup: 'assets/pickup.m4a',
      damage: 'assets/damage.m4a',
      thunder: 'assets/thunder.m4a',
      jump: 'assets/jump.m4a',
      menu: 'assets/menu.m4a',
    });
    this.kit.loader.progress(1);
    this.sideview.prewarmFx();
    this.kit.loader.hide();
    this._playMusic('fieldLoop', 250);
    const requestedKeep = this._readForceKeep();
    if (requestedKeep) this.forceKeep(requestedKeep);
    this._syncCF();
  }

  _phaserUpdate(_time, delta) {
    if (!this.ready) return;
    if (this.systemPaused) {
      this._accumulatorMs = 0;
      return;
    }
    const juiceFrame = this.kit.juice.frame();
    if (juiceFrame.frozen) return;
    let dt = Number.isFinite(delta) ? delta : STEP_MS;
    dt = Math.max(0, Math.min(FRAME_CLAMP_MS, dt));
    this._accumulatorMs += dt;
    let steps = 0;
    while (this._accumulatorMs >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this._step();
      this._accumulatorMs -= STEP_MS;
      steps++;
    }
  }

  _step() {
    this._update();
    this._traceStep();
    this.input.endStep();
    this.frame++;
    if (this.tutorialTimer > 0) this.tutorialTimer--;
    if (this.banner) {
      this.banner.timer--;
      if (this.banner.timer <= 0) this.banner = this.bannerQueue.shift() || null;
    }
    this._syncCF();
  }

  _update() {
    const input = this.input;
    this._recordBestScore();
    if (this.state === STATE.TITLE) {
      this.titleFrame++;
      if (input.pressed('Enter') || input.pressed('Space') || input.pressed('KeyZ') || input.pressA) this.state = STATE.OVERWORLD;
      return;
    }
    if (this.state === STATE.OVERWORLD) {
      if (this.tutorialStep < 4 && (input.left || input.right || input.up || input.down)) {
        this._beginTraining();
        return;
      }
      if (this.paused) {
        this._updateSpellMenu();
        return;
      }
      this.overworld.update(input);
      if (this.overworld.isEntering) {
        const result = this.overworld.resetEntry();
        if (result.encounter) {
          this.sideview.loadFieldEncounter(result.encounter.tileType, Math.min(7, this.player.crystals + 1));
          this.state = STATE.SIDEVIEW;
          this._showBanner('ENCOUNTER', null, '#42F5E6');
        } else if (result.town) {
          this.town.load(result.town);
          this.state = STATE.TOWN;
          this._playMusic('townAmbience', 500);
          this._showBanner(result.town.name, null, '#9B6CFF');
        } else if (result.palace) {
          this.sideview.loadPalace(result.palace.id);
          this.state = STATE.SIDEVIEW;
          this._playMusic('fieldLoop', 500);
          this._showBanner(this.sideview.keepTheme.short, null, this.sideview.keepTheme.glow);
        }
      }
      if (input.start) {
        this.paused = true;
        this._event('menu');
      }
      return;
    }
    if (this.state === STATE.SIDEVIEW) {
      if (this.paused) {
        this._updateSpellMenu();
        return;
      }
      if (this.levelUpScreen) {
        this._updateLevelUp();
        return;
      }
      const result = this.sideview.update(input);
      if (result?.playerDied || this.player.state === 'dead') {
        this._handleDeath();
        return;
      }
      if (result?.exitScene || result?.exitPalace) {
        this.state = STATE.OVERWORLD;
        this._playMusic('fieldLoop', 500);
        return;
      }
      this._playMusic(this._dangerMusic(), 350);
      if (this.sideview.isTraining) this._updateTraining(input);
      if (this.sideview.isPalace && !this.palaceClearTimer) {
        const bossRoom = this.sideview.room?.type === 'palace_boss';
        const sigilGone = this.sideview.items.every((item) => item.type !== 'crystal' || item.collected);
        if (bossRoom && sigilGone && this.sideview.enemies.every((enemy) => !enemy.alive)) this.palaceClearTimer = 120;
      }
      if (this.palaceClearTimer > 0) {
        this.palaceClearTimer--;
        if (this.palaceClearTimer === 0) {
          this.palaceClearTimer = null;
          if (this.sideview.isFinalPalace) {
            this.state = STATE.WIN;
            this.winTimer = 0;
          } else {
            this.state = STATE.OVERWORLD;
            this._showBanner('KEEP CLEARED', null, this.sideview.keepTheme.glow);
            this._playMusic('fieldLoop', 500);
          }
        }
      }
      if (this.sideview.levelUpPending) {
        this.sideview.levelUpPending = false;
        this.levelUpScreen = true;
        this.levelUpSelection = 0;
      }
      if (input.start) {
        this.paused = true;
        this._event('menu');
      }
      return;
    }
    if (this.state === STATE.TOWN) {
      if (this.paused) {
        this._updateSpellMenu();
        return;
      }
      this.town.update(input);
      if (this.town.done) {
        this.state = STATE.OVERWORLD;
        this._playMusic('fieldLoop', 500);
        return;
      }
      if (input.start) {
        this.paused = true;
        this._event('menu');
      }
      return;
    }
    if (this.state === STATE.GAMEOVER) {
      this.gameOverTimer++;
      if (this.gameOverTimer > 0 && (input.start || input.pressed('Enter') || input.pressA || input.pressB)) this.kit.restart();
      return;
    }
    if (this.state === STATE.WIN) {
      this.winTimer++;
      if (this.winTimer > 170 && (input.start || input.pressed('Enter') || input.pressA || input.pressB)) this.kit.restart();
    }
  }

  _beginTraining() {
    this.sideview.loadTraining();
    this.state = STATE.SIDEVIEW;
    this.paused = false;
    this.tutorialStep = 0;
    this.tutorialTimer = 180;
  }

  _updateTraining(input) {
    const flags = this.sideview.trainingFlags;
    const previousStep = this.tutorialStep;
    if (this.tutorialStep === 0 && flags.move) this.tutorialStep = 1;
    else if (this.tutorialStep === 1 && flags.jump) this.tutorialStep = 2;
    else if (this.tutorialStep === 2 && flags.attack) this.tutorialStep = 3;
    if (this.tutorialStep !== previousStep) this.tutorialTimer = 180;
    if (this.tutorialStep === 3 && input.start) {
      this.player.learnSpell('SHIELD');
      this.player.selectedSpell = 'SHIELD';
      this.paused = true;
    }
  }

  _updateSpellMenu() {
    if (this.input.pressB || this.input.select) {
      this.menuPage = this.menuPage === 'runes' ? 'skills' : 'runes';
      this._event('menu');
      return;
    }
    if (this.menuPage === 'skills') {
      this._updateSkillTree();
      return;
    }
    const list = Object.keys(SPELLS_FALLBACK);
    if (!this.player.selectedSpell) this.player.selectedSpell = list[0];
    const index = list.indexOf(this.player.selectedSpell);
    if (this.input.directionPressed('up')) this.player.selectedSpell = list[Math.max(0, index - 1)];
    if (this.input.directionPressed('down')) this.player.selectedSpell = list[Math.min(list.length - 1, index + 1)];
    if (this.input.pressA) {
      const cast = this.player.castSpell(this.player.selectedSpell);
      if (this.player.lastRuneEvent) this._event('rune', this.player.lastRuneEvent);
      if (cast && this.tutorialStep === 3) {
        this.tutorialStep = 4;
        this.paused = false;
        this.sideview.isTraining = false;
        this.state = STATE.OVERWORLD;
        this._playMusic('fieldLoop', 350);
        this._showBanner('RUNE ONLINE', null, '#42F5E6');
      }
    }
    if (this.input.start || this.input.pressed('Escape') || this.input.pressed('KeyP')) this.paused = false;
  }

  _updateSkillTree() {
    const columns = 3;
    const rows = 3;
    if (this.input.directionPressed('left')) this.skillSelection = Math.max(0, this.skillSelection - 1);
    if (this.input.directionPressed('right')) this.skillSelection = Math.min(columns * rows - 1, this.skillSelection + 1);
    if (this.input.directionPressed('up')) this.skillSelection = Math.max(0, this.skillSelection - columns);
    if (this.input.directionPressed('down')) this.skillSelection = Math.min(columns * rows - 1, this.skillSelection + columns);
    if (this.input.pressA) {
      const attrs = ['blade_edge', 'blade_reprise', 'blade_reach', 'arc_efficiency', 'arc_burst', 'arc_overcharge', 'ward_shell', 'ward_parry', 'ward_heart'];
      if (this.player.unlockSkill(attrs[this.skillSelection])) this._event('reward', { tier: 2 });
    }
    if (this.input.start || this.input.pressed('Escape') || this.input.pressed('KeyP')) {
      this.paused = false;
      this.menuPage = 'runes';
    }
  }

  _updateLevelUp() {
    if (this.input.directionPressed('up')) this.levelUpSelection = (this.levelUpSelection + 2) % 3;
    if (this.input.directionPressed('down')) this.levelUpSelection = (this.levelUpSelection + 1) % 3;
    if (this.input.pressA || this.input.pressed('Enter')) {
      const attr = ['atk', 'mag', 'lif'][this.levelUpSelection];
      this.player.levelUp(attr);
      this.levelUpScreen = !!this.player._pendingLevelUp?.length;
    }
  }

  _handleDeath() {
    this.player.lives = Math.max(0, this.player.lives - 1);
    if (this.player.lives > 0) {
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
      this.player.state = 'stand';
      this.player.iframes = 0;
      this.player.damageTimer = 0;
      this.state = STATE.OVERWORLD;
      this.paused = false;
      this.levelUpScreen = false;
      this.overworld.showNotification(`CHECKPOINT RESTORED  ${this.player.lives} LIFE`);
      this._playMusic('fieldLoop', 350);
      return;
    }
    this.state = STATE.GAMEOVER;
    this.gameOverTimer = 0;
  }

  _resetRun() {
    this.input.clear();
    seedAll(this.seed);
    this.player = new Player();
    this.overworld = new Overworld(this.player, {
      onNotification: (text) => this._showBanner(text, null, '#FFE18A'),
    });
    this.sideview = new SideView(this.player, {
      onEvent: (type, data) => this._event(type, data),
      onMessage: (text, color) => this._showBanner(text, null, color),
    });
    this.town = new TownScene(this.player);
    this.state = STATE.OVERWORLD;
    this.paused = false;
    this.levelUpScreen = false;
    this.levelUpSelection = 0;
    this.menuPage = 'runes';
    this.skillSelection = 0;
    this.gameOverTimer = 0;
    this.winTimer = 0;
    this.palaceClearTimer = null;
    this.tutorialStep = 0;
    this.tutorialTimer = 180;
    this.banner = null;
    this.bannerQueue = [];
    this.frame = 0;
    this._accumulatorMs = 0;
    this._lastTs = null;
    this._musicName = null;
    this._playMusic('fieldLoop', 250);
  }

  _playMusic(name, fadeMs = 350) {
    if (this._musicName === name) return;
    this._musicName = name;
    this.kit.audio.music(name, fadeMs);
  }

  _dangerMusic() {
    if (this.sideview.isTraining || !this.sideview.room) return 'fieldLoop';
    const room = this.sideview.room;
    let intensity = room.type === 'palace_boss' ? 3 : 0;
    for (const enemy of this.sideview.enemies) {
      if (!enemy.alive) continue;
      const distance = Math.abs(enemy.x - this.player.x);
      if (distance < 84) intensity++;
      if (enemy.projectiles?.length || enemy.fireballs?.length || enemy.mace) intensity++;
    }
    if (this.player.hp < this.player.maxHp * 0.3) intensity++;
    return intensity >= 2 ? 'dangerLoop' : 'fieldLoop';
  }

  _showBanner(title, detail, color) {
    const text = String(detail ? `${title} ${detail}` : title || '').trim().replace(/\s+/g, ' ');
    if (!text) return;
    const entry = { text, color, timer: 60, duration: 60 };
    if (!this.banner || this.banner.timer <= 0) this.banner = entry;
    else if (this.banner.text !== text && this.bannerQueue.length < 5) this.bannerQueue.push(entry);
  }

  _event(type, data = {}) {
    if (type === 'sword') this.kit.audio.sfx('swordClash', { volume: 0.6 });
    if (type === 'jump') this.kit.audio.sfx('jump', { volume: 0.42 });
    if (type === 'menu') this.kit.audio.sfx('menu', { volume: 0.38 });
    if (type === 'pickup') this.kit.audio.sfx('pickup', { volume: 0.55, rate: data.type === 'xp' ? 1.2 : 1 });
    if (type === 'reward') {
      this.kit.audio.sfx('runeChime', { volume: 0.55, rate: 1 + (data.tier || 1) * 0.12 });
      this.kit.juice.shake(data.tier > 1 ? 2 : 1, data.tier > 1 ? 100 : 50);
    }
    if (type === 'damage') this.kit.audio.sfx('damage', { volume: 0.65 });
    if (type === 'thunder') this.kit.audio.sfx('thunder', { volume: 0.8 });
    if (type === 'rune') {
      if (data.result === 'cast') this.kit.audio.sfx('runeChime', { volume: 0.7 });
      else this._showBanner(data.result === 'empty' ? 'ARC EMPTY' : 'RUNE COOLING', null, '#FF557A');
    }
    if (type === 'hit') {
      this.kit.audio.sfx('swordClash', { volume: data.boss ? 0.9 : 0.35, rate: data.spell ? 1.2 : 1 });
      this.kit.juice.hitStop(data.boss ? 90 : 38);
      this.kit.juice.shake(data.boss ? 4 : 1.5, data.boss ? 160 : 70);
    }
    if (type === 'kill') {
      this.kit.juice.hitStop(data.boss ? 130 : 55);
      this.kit.juice.shake(data.boss ? 6 : 2, data.boss ? 240 : 100);
      if (data.boss) {
        this.kit.audio.sfx('guardianRoar', { volume: 0.8 });
        this._showBanner('GUARDIAN BROKEN', null, '#FFE18A');
      }
    }
    if (type === 'phase') {
      this.kit.audio.sfx('guardianRoar', { volume: 0.65, rate: 1.08 });
      this.kit.juice.shake(3, 120);
    }
    if (type === 'parry') {
      this.kit.audio.sfx('swordClash', { volume: 0.9, rate: 1.3 });
      this.kit.juice.shake(2, 90);
      this._showBanner('PARRY', null, '#42F5E6');
    }
    if (type === 'damage') this.kit.juice.shake(2, 90);
    if (type === 'sigil') this._showBanner(`SIGIL ${data.count}/7`, null, '#FFE18A');
    if (type === 'fragment') this.kit.audio.sfx('runeChime', { volume: 0.5, rate: 1.4 });
    if (type === 'fragment') this._event('reward', { tier: 3 });
  }

  _wireSaveAPI() {
    const api = {
      save: () => { this.kit.save.set(serializeGame(this)); return true; },
      load: () => {
        const data = this.kit.save.get(null);
        if (!data) return false;
        try { deserializeGame(this, data); this._syncCF(); return true; } catch (_error) {
          this._resetRun();
          return false;
        }
      },
      export: () => JSON.stringify(serializeGame(this)),
      import: (json) => {
        try {
          deserializeGame(this, typeof json === 'string' ? JSON.parse(json) : json);
          this._syncCF();
          return true;
        } catch (_error) {
          this._resetRun();
          return false;
        }
      },
    };
    if (typeof window !== 'undefined') window.emberwildSave = api;
    this.saveAPI = api;
  }

  _loadURLSave() {
    const data = resolveSaveFromURL();
    if (!data) return;
    try { deserializeGame(this, data); } catch (_error) { /* Invalid URL saves are ignored. */ }
  }

  _wireTestAPI() {
    const fallback = {
      mode: this.state,
      keep: 'FIELD',
      sigils: this.player.crystals,
      hp: this.player.hp,
    };
    if (typeof window !== 'undefined') {
      window.__cf = { state: fallback, forceKeep: (id) => this.forceKeep(id) };
    }
  }

  _readForceKeep() {
    try {
      const raw = new URLSearchParams(location.search).get('forceKeep');
      const id = Number(raw);
      return Number.isInteger(id) && id >= 1 && id <= 7 ? id : 0;
    } catch (_error) { return 0; }
  }

  forceKeep(id = 1) {
    const keepId = Number(id);
    const keep = PALACES.find((entry) => entry.id === keepId);
    if (!keep) return false;
    this.player.crystals = Math.max(this.player.crystals, keepId - 1);
    this.sideview.loadPalace(keepId);
    this.state = STATE.SIDEVIEW;
    this.paused = false;
    this._showBanner(this.sideview.keepTheme.short, null, this.sideview.keepTheme.glow);
    return true;
  }

  _syncCF() {
    if (typeof window === 'undefined') return;
    const keep = this.state === STATE.SIDEVIEW ? (this.sideview.keepTheme?.name || 'FIELD') : this.state === STATE.TOWN ? (this.town.townData?.name || 'TOWN') : 'FIELD';
    window.__cf = window.__cf || {};
    window.__cf.state = { mode: this.state, keep, sigils: this.player.crystals, hp: this.player.hp };
    window.__cf.forceKeep = (id) => this.forceKeep(id);
  }

  _loadBestScore() { return this.bestScore; }
  _recordBestScore() { this.bestScore = Math.max(this.bestScore, this.player.score); }

  _traceStep() {
    if (!trace.enabled) return;
    const enemies = (this.state === STATE.SIDEVIEW && this.sideview.enemies) || [];
    trace.steps.push({
      frame: this.frame,
      state: this.state,
      player: { x: Math.round(this.player.x * 100) / 100, y: Math.round(this.player.y * 100) / 100, hp: this.player.hp, mp: this.player.mp, owX: this.player.owX, owY: this.player.owY },
      enemyDigest: enemies.map((enemy) => `${enemy.type}#${enemy.id}:${Math.round(enemy.x)},${Math.round(enemy.y)},${enemy.hp},${enemy.alive}`).join('|'),
    });
  }

  _draw() {
    if (!this.ctx) return;
    this.ctx.save();
    const shake = this.kit.juice.frame();
    this.ctx.translate(shake.dx * 0.35, shake.dy * 0.35);
    if (this.state === STATE.TITLE) drawTitle(this.ctx, this.titleFrame);
    else if (this.state === STATE.OVERWORLD) {
      this.overworld.draw(this.ctx);
      drawHUD(this.ctx, this.player, this.bestScore, { keep: 'FIELD' });
      const coachVisible = this.tutorialStep < 4 && drawTutorialStrip(this.ctx, this.tutorialStep, !this.kit.juice.enabled, this.tutorialTimer);
      if (this.paused) drawSpellSelect(this.ctx, this.player);
      if (!coachVisible && !this.paused) drawBanner(this.ctx, this.banner, !this.kit.juice.enabled);
    } else if (this.state === STATE.SIDEVIEW) {
      drawHUD(this.ctx, this.player, this.bestScore, { keep: this.sideview.keepTheme.short, room: `${this.sideview.roomIndex + 1}` });
      this.sideview.setReducedMotion(!this.kit.juice.enabled);
      this.sideview.draw(this.ctx);
      const coachVisible = this.sideview.isTraining && this.tutorialStep < 4
        && drawTutorialStrip(this.ctx, this.tutorialStep, !this.kit.juice.enabled, this.tutorialTimer);
      if (this.paused) {
        if (this.menuPage === 'skills') drawSkillTree(this.ctx, this.player, this.skillSelection);
        else drawSpellSelect(this.ctx, this.player);
      }
      else if (this.levelUpScreen) drawLevelUp(this.ctx, this.player, ['atk', 'mag', 'lif'][this.levelUpSelection]);
      else if (!coachVisible) drawBanner(this.ctx, this.banner, !this.kit.juice.enabled);
    } else if (this.state === STATE.TOWN) {
      drawHUD(this.ctx, this.player, this.bestScore, { keep: 'TOWN' });
      this.town.draw(this.ctx);
      if (this.paused) {
        if (this.menuPage === 'skills') drawSkillTree(this.ctx, this.player, this.skillSelection);
        else drawSpellSelect(this.ctx, this.player);
      }
      else drawBanner(this.ctx, this.banner, !this.kit.juice.enabled);
    } else if (this.state === STATE.GAMEOVER) {
      drawHUD(this.ctx, this.player, this.bestScore, { keep: 'FIELD' });
      drawGameOver(this.ctx, this.player, this.bestScore);
    } else if (this.state === STATE.WIN) drawWin(this.ctx, this.winTimer, this.player, this.bestScore);
    this.ctx.restore();
  }

  destroy() {
    this.input.destroy();
    this.phaserGame?.destroy(true);
  }
}

// Kept local to the menu so a malformed content variant cannot freeze a lookup.
const SPELLS_FALLBACK = {
  SHIELD: true, JUMP: true, LIFE: true, FAIRY: true,
  FIRE: true, REFLECT: true, SPELL: true, THUNDER: true,
};
