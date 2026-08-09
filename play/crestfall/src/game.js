// Main game loop and state machine

import { STATE, W, H, NES_W, NES_H, SCALE } from './constants.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Overworld } from './overworld.js';
import { SideView } from './sideview.js';
import { TownScene } from './town.js';
import { drawHUD, drawSpellSelect, drawLevelUp, drawGameOver, drawWin, drawTitle } from './hud.js';
import { seedAll, resolveSeedFromURL, resolveTraceFromURL, trace } from './rng.js';
import { saveToLocalStorage, loadFromLocalStorage, exportSave, importSave, resolveSaveFromURL } from './save.js';

const S = SCALE;

// Rev 2 decision 1 (canonical clock): fixed-step 60Hz accumulator, cap 5
// steps/frame, remainder carries across frames, 250ms clamp on the raw
// frame delta before it enters the accumulator. Replaces the prior
// one-update-per-requestAnimationFrame loop, which advanced at display
// refresh rate rather than a fixed rate (see reviews/sol_port_spec_review_
// 2026-07-18.md "fixed-step loop is not the source loop").
const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const FRAME_CLAMP_MS = 250;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    canvas.width = W;
    canvas.height = H;

    // Seed all RNG streams from ?seed=N (falls back to a fixed default),
    // so a given seed reproduces identical world gen and combat rolls.
    this.seed = resolveSeedFromURL();
    seedAll(this.seed);
    trace.enabled = resolveTraceFromURL();

    this.input = new Input();
    this.player = new Player();
    this.overworld = new Overworld(this.player);
    this.sideview = new SideView(this.player);
    this.town = new TownScene(this.player);

    // Start in the overworld for an immediate first playable moment.
    this.state = STATE.OVERWORLD;
    this.paused = false; // spell menu
    this.levelUpScreen = false;
    this.levelUpSelection = 0; // 0=atk, 1=mag, 2=lif

    this.titleFrame = 0;
    this.gameOverTimer = 0;
    this.winTimer = 0;

    this.frame = 0;
    this.bestScore = this._loadBestScore();

    // Fixed-step clock state (decision 1).
    this._accumulatorMs = 0;
    this._lastTs = null;

    // R6: save system. Expose it for the harness (headless scripts have no
    // UI to click a "load" button) and support a ?save=<json> URL param
    // for reproducible round-trip fixtures.
    this._wireSaveAPI();
    const urlSave = resolveSaveFromURL();
    if (urlSave) {
      try {
        importSave(this, urlSave);
      } catch (e) {
        console.warn('[save] failed to import ?save= payload:', e);
      }
    }

    this.overworld.showNotification('EMBER KEEP');

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // Runs zero or more fixed 1/60s sim steps for the elapsed real time,
  // then draws once. See module header for the accumulator contract.
  _loop(ts) {
    if (window.innerHeight > window.innerWidth) {
      this.input.clear();
      this._accumulatorMs = 0;
      this._lastTs = ts;
      this._draw();
      this.frame++;
      requestAnimationFrame(this._loop);
      return;
    }
    if (this._lastTs === null) this._lastTs = ts;
    let dtMs = ts - this._lastTs;
    this._lastTs = ts;
    if (dtMs > FRAME_CLAMP_MS) dtMs = FRAME_CLAMP_MS; // clamp a big stall
    if (dtMs < 0) dtMs = 0; // guard against a non-monotonic ts source

    this._accumulatorMs += dtMs;

    let steps = 0;
    while (this._accumulatorMs >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this._update();
      this._traceStep();
      // Input edges (pressed()) are consumed by the FIRST sim step that
      // runs after the frame's input was latched. Snapshotting `prev`
      // here, after that first step, means any further sim steps this
      // same frame see those edges as already consumed (pressed() is
      // false), while held state (left/right/up/down/A/B — read straight
      // off `keys`) is unaffected and persists across all of them.
      if (steps === 0) {
        this.input.prev = { ...this.input.keys };
        this.input.consumePressed();
      }
      this._accumulatorMs -= STEP_MS;
      steps++;
    }
    // Remainder time (including any left over after hitting the 5-step
    // cap during a catch-up spiral) intentionally carries into next frame
    // rather than being discarded — no time is invented or dropped.

    this._draw();
    this.frame++;
    requestAnimationFrame(this._loop);
  }

  // Exposes the save system as window.zelda2Save for the Phase 0.5 scenario
  // harness (headless scripts drive this via page.evaluate / direct call,
  // not through UI) and for manual debugging from the browser console.
  _wireSaveAPI() {
    const api = {
      save: () => saveToLocalStorage(this),
      load: () => loadFromLocalStorage(this),
      export: () => exportSave(this),
      import: (json) => importSave(this, json),
    };
    if (typeof window !== 'undefined') window.zelda2Save = api;
    this.saveAPI = api;
  }

  _loadBestScore() {
    try {
      const value = Number(localStorage.getItem('crestfall.bestScore') || 0);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch (_e) {
      return 0;
    }
  }

  _recordBestScore() {
    if (this.player.score <= this.bestScore) return;
    this.bestScore = this.player.score;
    try {
      localStorage.setItem('crestfall.bestScore', String(this.bestScore));
    } catch (_e) {
      // Disabled storage must not stop the game.
    }
  }

  // Trace mode (?trace=1): a per-sim-step checkpoint of player position/hp/
  // mp and a digest of the live enemy array, so the scenario harness can
  // assert not just "the RNG draws matched" but "the resulting simulation
  // state matched" (Sol's "RNG trace alone is too weak" finding).
  _traceStep() {
    if (!trace.enabled) return;
    const p = this.player;
    const enemies = (this.state === STATE.SIDEVIEW && this.sideview.enemies) || [];
    const enemyDigest = enemies
      .map(e => `${e.type}#${e.id}:${Math.round(e.x)},${Math.round(e.y)},${e.hp},${e.alive}`)
      .join('|');
    trace.steps.push({
      frame: this.frame,
      state: this.state,
      player: {
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        hp: p.hp,
        mp: p.mp,
        owX: p.owX,
        owY: p.owY,
      },
      enemyDigest,
    });
  }

  _update() {
    const inp = this.input;
    this._recordBestScore();

    switch (this.state) {
      case STATE.TITLE:
        this.titleFrame++;
        if (inp.pressed('Enter') || inp.pressed('Space') || inp.pressed('KeyZ')) {
          this.state = STATE.OVERWORLD;
          this.overworld.showNotification('EMBER KEEP');
        }
        break;

      case STATE.OVERWORLD:
        if (this.paused) {
          this._updateSpellMenu();
          return;
        }
        this.overworld.update(inp);
        if (this.overworld.isEntering) {
          const result = this.overworld.resetEntry();
          if (result.encounter) {
            this.sideview.loadFieldEncounter(result.encounter.tileType, this.player.crystals + 1);
            this.state = STATE.SIDEVIEW;
          } else if (result.town) {
            this.town.load(result.town);
            this.state = STATE.TOWN;
          } else if (result.palace) {
            this.sideview.loadPalace(result.palace.id);
            this.state = STATE.SIDEVIEW;
          }
        }
        if (inp.start) this.paused = true;
        break;

      case STATE.SIDEVIEW: {
        if (this.paused) {
          this._updateSpellMenu();
          return;
        }
        if (this.levelUpScreen) {
          this._updateLevelUp();
          return;
        }
        const svResult = this.sideview.update(inp);
        if (svResult?.playerDied || this.player.state === 'dead') {
          this._handleDeath();
          return;
        }
        if (svResult?.exitScene || svResult?.exitPalace) {
          this.state = STATE.OVERWORLD;
          break;
        }

        // Check palace clear (all enemies dead + crystal collected)
        if (this.sideview.isPalace && !this.palaceClearTimer) {
          const bossRoom = this.sideview.room?.type === 'palace_boss';
          const crystalGone = this.sideview.items.every(i => i.type !== 'crystal' || i.collected);
          if (bossRoom && crystalGone && this.sideview.enemies.every(e => !e.alive)) {
            this.palaceClearTimer = 120;
          }
        }
        if (this.palaceClearTimer > 0) {
          this.palaceClearTimer--;
          if (this.palaceClearTimer === 0) {
            this.palaceClearTimer = null;
            // R3 repair: the final boss's death used to fall through to
            // the same keep-clear return path as every other
            // palace, so STATE.WIN (defined, drawn — see hud.js drawWin,
            // constants.js STATE.WIN) was never entered by any code path
            // (see reviews/sol_port_spec_review_2026-07-18.md "WIN state
            // never entered"). Repaired: the final palace's clear enters
            // STATE.WIN instead.
            if (this.sideview.isFinalPalace) {
              this.state = STATE.WIN;
              this.winTimer = 0;
            } else {
              this.state = STATE.OVERWORLD;
              this.overworld.showNotification('KEEP CLEARED!');
            }
          }
        }

        // Level up check
        if (this.sideview.levelUpPending) {
          this.sideview.levelUpPending = false;
          this.levelUpScreen = true;
          this.levelUpSelection = 0;
        }

        if (inp.start) this.paused = true;
        break;
      }

      case STATE.TOWN:
        if (this.paused) {
          this._updateSpellMenu();
          return;
        }
        this.town.update(inp);
        if (this.town.done) {
          this.state = STATE.OVERWORLD;
        }
        if (inp.start) this.paused = true;
        break;

      case STATE.GAMEOVER:
        this.gameOverTimer++;
        if (this.gameOverTimer > 0 && (inp.start || inp.pressed('Enter') || inp.pressA || inp.pressB)) {
          this._restartRun();
        }
        break;

      case STATE.WIN:
        this.winTimer++;
        if (this.winTimer > 0 && (inp.start || inp.pressed('Enter') || inp.pressA || inp.pressB)) {
          this._restartRun();
        }
        break;
    }
  }

  _updateSpellMenu() {
    const inp = this.input;
    const spellList = ['SHIELD','JUMP','LIFE','FAIRY','FIRE','REFLECT','SPELL','THUNDER'];

    if (!this.player.selectedSpell) this.player.selectedSpell = spellList[0];

    const idx = spellList.indexOf(this.player.selectedSpell);

    if (inp.pressed('ArrowUp') || inp.pressed('KeyW')) {
      this.player.selectedSpell = spellList[Math.max(0, idx - 1)];
    }
    if (inp.pressed('ArrowDown') || inp.pressed('KeyS')) {
      this.player.selectedSpell = spellList[Math.min(spellList.length - 1, idx + 1)];
    }
    // Cast selected spell
    if (inp.pressed('KeyZ') || inp.pressed('Space')) {
      if (this.player.selectedSpell) {
        this.player.castSpell(this.player.selectedSpell);
      }
    }
    // Close menu
    if (inp.start || inp.pressed('Escape') || inp.pressed('KeyP')) {
      this.paused = false;
    }
  }

  _updateLevelUp() {
    const inp = this.input;
    const opts = ['atk','mag','lif'];

    if (inp.pressed('ArrowUp') || inp.pressed('KeyW')) {
      this.levelUpSelection = (this.levelUpSelection - 1 + 3) % 3;
    }
    if (inp.pressed('ArrowDown') || inp.pressed('KeyS')) {
      this.levelUpSelection = (this.levelUpSelection + 1) % 3;
    }
    if (inp.pressA || inp.pressed('Enter')) {
      const attr = opts[this.levelUpSelection];
      const lvlKey = attr + 'Lvl';
      if (this.player[lvlKey] < 8) {
        this.player.levelUp(attr);
      }
      this.levelUpScreen = false;
    }
  }

  _handleDeath() {
    this.player.lives--;
    this.state = STATE.GAMEOVER;
    this.gameOverTimer = 0;
    if (this.player.lives < 0) {
      // Game over - full reset next
    } else {
      // Continue next press
    }
  }

  _restartRun() {
    this.input.clear();
    this.player = new Player();
    this.overworld = new Overworld(this.player);
    this.sideview = new SideView(this.player);
    this.town = new TownScene(this.player);
    this.state = STATE.OVERWORLD;
    this.paused = false;
    this.levelUpScreen = false;
    this.levelUpSelection = 0;
    this.gameOverTimer = 0;
    this.winTimer = 0;
    this.palaceClearTimer = null;
    this.overworld.showNotification('EMBER KEEP');
  }

  _draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    switch (this.state) {
      case STATE.TITLE:
        drawTitle(ctx, this.titleFrame);
        break;

      case STATE.OVERWORLD:
        this.overworld.draw(ctx);
        drawHUD(ctx, this.player, this.bestScore);
        // HUD overlays overworld - redraw on top
        if (this.paused) {
          drawSpellSelect(ctx, this.player);
        }
        break;

      case STATE.SIDEVIEW:
        drawHUD(ctx, this.player, this.bestScore);
        this.sideview.draw(ctx);
        if (this.paused) {
          drawSpellSelect(ctx, this.player);
        } else if (this.levelUpScreen) {
          const opts = ['atk','mag','lif'];
          drawLevelUp(ctx, this.player, opts[this.levelUpSelection]);
        }
        break;

      case STATE.TOWN:
        drawHUD(ctx, this.player, this.bestScore);
        this.town.draw(ctx);
        if (this.paused) {
          drawSpellSelect(ctx, this.player);
        }
        break;

      case STATE.GAMEOVER:
        drawHUD(ctx, this.player, this.bestScore);
        drawGameOver(ctx, this.player);
        break;

      case STATE.WIN:
        drawWin(ctx, this.winTimer);
        break;
    }
  }

  destroy() {
    this.input.destroy();
  }
}
