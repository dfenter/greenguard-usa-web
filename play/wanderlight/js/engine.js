/* engine.js — fixed 60 Hz sim bridge.
   The archived game modules still own input names, timing, and RNG. This
   adapter translates GGKit keyboard and per-pointer state into that shape;
   Phaser owns the render loop and the presentation layer. */

const TILE = 16;
const SCREEN_W = 256;
const SCREEN_H = 240;
const HUD_H = 64;
const PLAY_W = 256;
const PLAY_H = 176;
const COLS = 16;
const ROWS = 11;

const Engine = (() => {
  const kit = (typeof window !== 'undefined' && window.__wanderKit) || null;
  const keys = Object.create(null);
  const pressed = Object.create(null);
  const lastPressed = Object.create(null);
  const previous = Object.create(null);
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    KeyZ: 'a', KeyJ: 'a', Space: 'a',
    KeyX: 'b', KeyK: 'b',
    Enter: 'start', ShiftLeft: 'select', ShiftRight: 'select',
    Escape: 'escape', KeyM: 'mute', KeyR: 'restart',
  };
  let updateFn = () => {};
  let accumulator = 0;
  let started = false;
  let unlocked = false;
  const STEP = 1000 / 60;

  function keyDown(code) {
    return !!(kit && kit.input && kit.input.keyDown(code));
  }

  function readInput() {
    const next = Object.create(null);
    for (const code in KEYMAP) {
      if (keyDown(code)) next[KEYMAP[code]] = true;
    }

    // GGKit owns pointer identity. We only classify each live pointer by the
    // visible control band, so two thumbs never steal one another's action.
    if (kit && kit.input && kit.input.pointers) {
      const w = Math.max(1, window.innerWidth || 1);
      const h = Math.max(1, window.innerHeight || 1);
      for (const p of kit.input.pointers.values()) {
        const dx = p.x - p.startX;
        const dy = p.y - p.startY;
        const moveX = 72, moveY = h - 86;
        const inDpad = ((p.startX - moveX) ** 2 + (p.startY - moveY) ** 2) <= 60 ** 2;
        const leftHalf = p.startX < w * 0.54 && p.startY < h * 0.78;
        if (inDpad || leftHalf) {
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) next[dx < 0 ? 'left' : 'right'] = true;
          else if (Math.abs(dy) > 12) next[dy < 0 ? 'up' : 'down'] = true;
        } else if (Math.abs(p.startX - w / 2) < 40 && p.startY >= h - 70) {
          next.start = true;
        } else if (Math.hypot(p.startX - (w - 72), p.startY - (h - 82)) <= 40) {
          next.a = true;
        } else if (Math.hypot(p.startX - (w - 148), p.startY - (h - 122)) <= 36) {
          next.b = true;
        }
      }
    }

    for (const name of ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select', 'mute', 'escape', 'restart']) {
      keys[name] = !!next[name];
      pressed[name] = keys[name] && !previous[name];
      lastPressed[name] = lastPressed[name] || pressed[name];
      previous[name] = keys[name];
    }
    if (!unlocked && (Object.keys(next).length || (kit && kit.input && kit.input.pointers.size))) {
      unlocked = true;
      if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock();
    }
  }

  function clearPressed() {
    for (const name in pressed) pressed[name] = false;
  }

  function clearInput() {
    if (kit && kit.input) kit.input.clearAll();
    for (const name in keys) keys[name] = false;
    for (const name in pressed) pressed[name] = false;
    for (const name in previous) previous[name] = false;
  }

  function tick(delta) {
    if (!started) return;
    if (kit && kit.paused) {
      clearInput();
      for (const name in lastPressed) lastPressed[name] = false;
      return;
    }
    accumulator = Math.min(250, accumulator + Math.max(0, Math.min(100, delta || STEP)));
    for (const name in lastPressed) lastPressed[name] = false;
    while (accumulator >= STEP) {
      readInput();
      updateFn();
      clearPressed();
      accumulator -= STEP;
    }
  }

  function run(update) {
    updateFn = update || (() => {});
    started = true;
    accumulator = STEP;
  }

  let seed = 0x2545f491;
  function rand() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }
  const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const choice = arr => arr[Math.floor(rand() * arr.length)];

  // Legacy test hooks still resolve without creating a second canvas.
  function rect() {}
  function text() {}

  return {
    keys, pressed, lastPressed, run, tick, clearInput, clearPressed,
    rand, randInt, choice, rect, text,
    TILE, SCREEN_W, SCREEN_H, HUD_H, PLAY_W, PLAY_H, COLS, ROWS,
  };
})();
