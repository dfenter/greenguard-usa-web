// FLIPSIDE boot + frame loop. Orchestrator-owned; lanes do not edit.
import * as game from './core/game.js';
import { createInput } from './input.js';
import { createFlip, applyFlipTransform, drawFlipOverlay } from './world/flip.js';
import { createRenderer } from './render/renderer.js';
import { createFx } from './render/fx.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';
import { maybeRunTutorial, loadSettings, saveSettings, stopTutorial } from './ui/tutorial.js';
import { createBot } from './autoplay.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const G = game.createGame();               // the player's game (starts at 'title')
const demoG = game.createGame();           // attract-mode demo behind the title
game.startRun(demoG);
const input = createInput(window);
input.setBoardEl(canvas);
input.setTouchRoot(document.getElementById('touch-controls'));
let flip = createFlip();                   // recreated on run transitions (no cross-run bleed)
const R = createRenderer(canvas);
const FX = createFx(canvas);
const A = createAudio();
const bot = createBot();

const settings = loadSettings();
A.setEnabled(settings);

function freshRun(g) {
  if (typeof stopTutorial === 'function') stopTutorial();
  game.startRun(g);
  flip = createFlip();
  if (input.reset) input.reset();
  if (FX.reset) FX.reset();
  A.setWorld(g.world);
}

const hooks = {
  start() { freshRun(G); A.unlock(); maybeRunTutorial(G, hud); },
  resume() {
    if (G.status === 'paused') {
      G.status = 'playing';
      if (input.reset) input.reset();
      game.update(G, 0, ['soft_off']);     // unstick soft drop held across pause
    }
  },
  restart() { freshRun(G); },
  keepFolding() { if (game.continueRun) game.continueRun(G); },
  getSettings() { return { ...settings, muted: !!settings.muted }; },
  toggleMute() { const m = A.toggleMute(); settings.muted = m; saveSettings(settings); return m; },
  toggleMusic() { settings.music = !settings.music; A.setEnabled(settings); saveSettings(settings); },
  toggleSfx() { settings.sfx = !settings.sfx; A.setEnabled(settings); saveSettings(settings); },
};
const hud = createHud(G, hooks);

// QA/debug handle (used by verify harnesses; stable API)
window.__FS = { G, demoG, hooks, game };

addEventListener('resize', () => R.resize());
R.resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last);
  last = now;

  const onTitle = G.status === 'title';
  const AG = onTitle ? demoG : G;          // active game being simulated/drawn
  const events = input.poll();
  for (const e of events) if (e === 'mute') hooks.toggleMute();

  if (onTitle) {
    if (demoG.status === 'gameover' || demoG.status === 'won') game.startRun(demoG);
    game.update(demoG, dt, bot.step(demoG));
  } else {
    game.update(G, dt, events.filter(e => e !== 'mute'));
  }

  if (AG.status === 'flipping' && !flip.active()) flip.start(AG.world === 'sun' ? 1 : -1);
  if (flip.active()) {
    const done = flip.update(dt);
    if (flip.pastMidpoint()) { game.finishFlip(AG); if (!onTitle) A.setWorld(AG.world); }
    if (done && AG.status === 'flipping') AG.status = 'playing';
  }

  if (AG.fx && AG.fx.length) {
    for (const evt of AG.fx) { FX.handle(evt, AG); if (!onTitle) A.handle(evt, AG); }
    AG.fx.length = 0;
  }

  FX.update(dt);
  A.update(dt);

  ctx.save();
  const [sx, sy] = FX.shakeOffset();
  ctx.translate(sx, sy);
  const p = flip.active() ? flip.progress() : 0;
  if (p > 0) applyFlipTransform(ctx, p, canvas.width, canvas.height);
  R.draw(AG, p);
  FX.draw(ctx, AG);
  if (p > 0) drawFlipOverlay(ctx, p, canvas.width, canvas.height, AG.world);
  ctx.restore();

  hud.update(G);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
