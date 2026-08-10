// FLIPSIDE boot + frame loop. Orchestrator-owned; lanes do not edit.
import * as game from './core/game.js?v=e886a29';
import { FACES } from './config.js?v=e886a29';
import { createInput } from './input.js?v=e886a29';
import { createFlip } from './world/flip.js?v=e886a29';
import { createRenderer } from './render/renderer.js?v=e886a29';
import { createFx } from './render/fx.js?v=e886a29';
import { createAudio } from './audio/audio.js?v=e886a29';
import { createHud } from './ui/hud.js?v=e886a29';
import { maybeRunTutorial, loadSettings, saveSettings, stopTutorial } from './ui/tutorial.js?v=e886a29';
import { createBot } from './autoplay.js?v=e886a29';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const G = game.createGame();               // the player's game (starts at 'title')
const demoG = game.createGame();           // attract-mode demo behind the title
game.startRun(demoG);
const input = createInput(window);
input.setBoardEl(canvas);
input.setTouchRoot(document.getElementById('touch-controls'));
let flip = createFlip();                   // dimension-flip camera (recreated per run)
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
  A.setWorld(FACES[g.face]);
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
const qaQueue = [];
window.__FS = { G, demoG, hooks, game, inject: (...a) => qaQueue.push(...a) };

addEventListener('resize', () => R.resize());
R.resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last);
  last = now;

  const onTitle = G.status === 'title';
  const AG = onTitle ? demoG : G;          // active game being simulated/drawn
  const events = input.poll();
  if (qaQueue.length) { events.push(...qaQueue); qaQueue.length = 0; }
  for (const e of events) if (e === 'mute') hooks.toggleMute();

  if (onTitle) {
    if (demoG.status === 'gameover' || demoG.status === 'won') game.startRun(demoG);
    game.update(demoG, dt, bot.step(demoG));
  } else {
    game.update(G, dt, events.filter(e => e !== 'mute'));
  }

  // fold camera <-> game handshake (v4)
  if (AG.status === 'folding' && AG.fold) {
    if (!flip.active()) flip.start(AG.fold.dir);
    if (flip.update(dt)) {
      game.finishFold(AG);
      if (!onTitle) A.setWorld(FACES[AG.face]);
    }
  } else if (flip.active()) {
    flip.update(dt);                     // let a stray animation finish
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
  R.draw(AG, flip);
  FX.draw(ctx, AG);
  ctx.restore();

  hud.update(G);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
