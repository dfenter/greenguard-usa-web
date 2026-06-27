/* engine.js — core: canvas, scaling, input, fixed-timestep loop, helpers.
   The Legend of Zelda clone. NES playfield is 256x240: a 256x64 HUD on top
   and a 256x176 (16x11 tile) play area below. */

const TILE = 16;
const SCREEN_W = 256;          // 16 tiles
const SCREEN_H = 240;          // full NES screen
const HUD_H = 64;              // status bar height
const PLAY_W = 256;            // 16 tiles
const PLAY_H = 176;            // 11 tiles
const COLS = 16;
const ROWS = 11;

const Engine = (() => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  ctx.imageSmoothingEnabled = false;

  // Scale the canvas to fill the screen. The old build integer-floored the scale,
  // which on a phone (≈1.5x) floored to 1x — a tiny 256x240 box. Now we fill:
  // fractional scaling on touch devices (maximize size) and crisp integer scaling
  // on desktop. In portrait we reserve the lower part of the screen for the
  // on-screen controller so gameplay never hides behind the player's thumbs.
  function isCoarse() {
    return !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  }
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const coarse = isCoarse();
    const portrait = vh >= vw;
    // reserve bottom ~40% for controls on a touch phone in portrait
    const availH = (coarse && portrait) ? vh * 0.60 : vh - 8;
    const availW = vw - (coarse ? 0 : 8);
    let scale = Math.min(availW / SCREEN_W, availH / SCREEN_H);
    if (!coarse && scale >= 2) scale = Math.floor(scale);   // crisp pixels on desktop
    scale = Math.max(scale, 1);
    canvas.style.width = Math.round(SCREEN_W * scale) + 'px';
    canvas.style.height = Math.round(SCREEN_H * scale) + 'px';
    document.body && document.body.classList &&
      document.body.classList.toggle('portrait-touch', coarse && portrait);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // ---- input ----
  const keys = {};        // held
  const pressed = {};      // edge: true for one frame
  const KEYMAP = {
    ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
    KeyW:'up', KeyS:'down', KeyA:'left', KeyD:'right',
    KeyZ:'a', KeyJ:'a', Space:'a',
    KeyX:'b', KeyK:'b',
    Enter:'start', ShiftLeft:'select', ShiftRight:'select',
    KeyM:'mute'
  };
  window.addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) {
      if (!keys[k]) pressed[k] = true;
      keys[k] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) { keys[k] = false; e.preventDefault(); }
  });

  // touch: the on-screen controller. Hit-testing is done against the ACTUAL
  // control DOM elements (#dpad, #btn-a/b/start/select) so the touch zones can
  // never drift away from what the player sees. Multi-touch: move + fire at once.
  function setupTouch() {
    const $ = id => (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(id) : null;
    const dpadEl = $('dpad'), aEl = $('btn-a'), bEl = $('btn-b'),
          startEl = $('btn-start'), selEl = $('btn-select');
    const touches = {};   // identifier -> {x,y}
    window.addEventListener('touchstart', handle, {passive:false});
    window.addEventListener('touchmove', handle, {passive:false});
    window.addEventListener('touchend', end, {passive:false});
    window.addEventListener('touchcancel', end, {passive:false});
    function handle(e) {
      // only swallow the default (scroll/zoom) when the touch is on a control
      let onControl = false;
      for (const t of e.changedTouches) {
        const p = { x: t.clientX, y: t.clientY };
        touches[t.identifier] = p;
        if (hitAny(p)) onControl = true;
      }
      if (onControl) e.preventDefault();
      apply();
    }
    function end(e) {
      for (const t of e.changedTouches) delete touches[t.identifier];
      apply();
    }
    function rectOf(el) { return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; }
    function inEl(p, el) {
      const r = rectOf(el); if (!r) return false;
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    }
    function hitAny(p) {
      return inEl(p, dpadEl) || inEl(p, aEl) || inEl(p, bEl) || inEl(p, startEl) || inEl(p, selEl);
    }
    function setActive(el, on) { if (el && el.classList) el.classList.toggle('active', !!on); }
    let last = { a:false, b:false, start:false, select:false };
    function apply() {
      let up=false, dn=false, lt=false, rt=false, a=false, b=false, start=false, sel=false;
      for (const id in touches) {
        const p = touches[id];
        if (inEl(p, dpadEl)) {
          const r = rectOf(dpadEl);
          const cx = r.left + r.width/2, cy = r.top + r.height/2;
          const dx = p.x - cx, dy = p.y - cy;
          const dead = r.width * 0.16;
          if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
            if (Math.abs(dx) > Math.abs(dy)) { if (dx < 0) lt = true; else rt = true; }
            else { if (dy < 0) up = true; else dn = true; }
          }
        }
        else if (inEl(p, aEl)) a = true;
        else if (inEl(p, bEl)) b = true;
        else if (inEl(p, startEl)) start = true;
        else if (inEl(p, selEl)) sel = true;
      }
      keys.up=up; keys.down=dn; keys.left=lt; keys.right=rt;
      if (a && !last.a) pressed.a = true;
      if (b && !last.b) pressed.b = true;
      if (start && !last.start) pressed.start = true;
      if (sel && !last.select) pressed.select = true;
      keys.a=a; keys.b=b; keys.start=start; keys.select=sel;
      last = { a, b, start, select: sel };
      setActive(aEl, a); setActive(bEl, b); setActive(startEl, start);
      setActive(selEl, sel); setActive(dpadEl, up||dn||lt||rt);
    }
  }
  setupTouch();

  function clearPressed() { for (const k in pressed) pressed[k] = false; }

  // ---- loop (fixed 60Hz logic) ----
  // nowMs(): high-res clock when available, else Date.now(). Some headless/test
  // environments don't expose `performance`, and depending on it hard-crashed boot.
  const nowMs = (typeof performance !== 'undefined' && performance.now)
    ? () => performance.now() : () => Date.now();
  let updateFn = () => {}, renderFn = () => {};
  let acc = 0, last = 0;
  const STEP = 1000 / 60;
  let _useRAF = true;
  function tick() { frame(nowMs()); }
  function frame(now) {
    try {
      if (!last) last = now;
      acc += now - last;
      last = now;
      if (acc > 250) acc = 250;     // avoid spiral after tab-out
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        updateFn();
        clearPressed();
        acc -= STEP; steps++;
      }
      renderFn(ctx);
    } catch(e) {
      var _d = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('dbg') : null;
      if (_d) { _d.style.display='block'; _d.textContent='frame-err:' + (e&&e.message?e.message:String(e)); }
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.fillStyle = '#f44'; ctx.font = '8px monospace'; ctx.textBaseline = 'top';
      ctx.fillText('ERR:', 4, 4);
      ctx.fillStyle = '#fff';
      var msg = (e && e.message ? e.message : String(e)) + ' L' + (e && e.stack ? e.stack.split('\n')[1] : '');
      var words = msg.split(' '), line = '', y = 16;
      for (var i = 0; i < words.length; i++) {
        if ((line + ' ' + words[i]).length > 28) { ctx.fillText(line.trim(), 4, y); y += 10; line = words[i]; }
        else line += ' ' + words[i];
      }
      if (line.trim()) ctx.fillText(line.trim(), 4, y);
      return; // stop the loop
    }
    if (_useRAF) requestAnimationFrame(frame); else setTimeout(tick, 16);
  }
  function run(update, render) {
    updateFn = update; renderFn = render;
    // Draw gold immediately to test if ctx works at all (sync, no rAF needed)
    ctx.fillStyle = '#f8d030';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#000';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('STARTING...', 4, 4);
    // Also run one frame synchronously
    frame(nowMs());
    // Then continue async
    var _rAFfired = false;
    requestAnimationFrame(function(now) { _rAFfired = true; frame(now); });
    setTimeout(function() {
      if (!_rAFfired) { _useRAF = false; tick(); }
    }, 100);
  }

  // ---- tiny deterministic-ish RNG ----
  let seed = 0x2545f491;
  function rand() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296);
  }
  const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const choice = arr => arr[Math.floor(rand() * arr.length)];

  // ---- draw helpers ----
  function rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x|0, y|0, w|0, h|0); }
  function text(ctx, str, x, y, col='#fff', scale=1) {
    Font.draw(ctx, str, x, y, col, scale);
  }

  return { canvas, ctx, keys, pressed, run, rand, randInt, choice, rect, text,
           clearPressed,
           TILE, SCREEN_W, SCREEN_H, HUD_H, PLAY_W, PLAY_H, COLS, ROWS };
})();
