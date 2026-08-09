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
  function el(id) {
    return (typeof document !== 'undefined' && document.getElementById)
      ? document.getElementById(id) : null;
  }
  function visRect(e) {
    if (!e || !e.getBoundingClientRect) return null;
    const r = e.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? r : null;
  }
  // The on-screen controller is the source of truth for how much room the
  // playfield may take. We MEASURE the real control rects instead of guessing a
  // percentage, so the canvas can never grow underneath a thumb button and can
  // never shrink more than it has to on a short or narrow phone.
  function resize() {
    const vv = window.visualViewport;
    const vw = Math.round((vv && vv.width) || window.innerWidth);
    const vh = Math.round((vv && vv.height) || window.innerHeight);
    const coarse = isCoarse();
    const portrait = vh >= vw;
    const body = document.body;
    if (body && body.classList) {
      body.classList.toggle('portrait-touch', coarse && portrait);
      body.classList.toggle('landscape-touch', coarse && !portrait);
    }

    let availW = vw - (coarse ? 0 : 8);
    let availH = vh - 8;
    const wrap = el('wrap');
    if (wrap && wrap.style) wrap.style.paddingBottom = '';

    if (coarse) {
      const ctrl = [visRect(el('dpad')), visRect(el('btn-group')),
                    visRect(el('sys-group'))].filter(Boolean);
      if (portrait) {
        // Everything the player touches lives in a bottom band. The playfield
        // gets the whole area above the topmost control, and is centred in it.
        let top = vh;
        for (const r of ctrl) top = Math.min(top, r.top);
        availH = Math.max(top - 10, vh * 0.45);
        // Reserve the control band inside #wrap so flex centring puts the
        // playfield in the middle of the free space, not jammed against the top.
        if (wrap && wrap.style) wrap.style.paddingBottom = Math.round(vh - availH) + 'px';
      } else {
        // Landscape: controls sit in left and right gutters. Keep the playfield
        // strictly between them so a d-pad never covers the play area.
        let left = 0, right = vw;
        for (const r of ctrl) {
          if (r.right <= vw * 0.5) left = Math.max(left, r.right);
          else if (r.left >= vw * 0.5) right = Math.min(right, r.left);
        }
        const gutter = Math.max(left, vw - right) + 10;
        availW = Math.max(vw - gutter * 2, vw * 0.34);
        availH = vh - 6;
      }
    }

    let scale = Math.min(availW / SCREEN_W, availH / SCREEN_H);
    if (!coarse && scale >= 2) scale = Math.floor(scale);   // crisp pixels on desktop
    scale = Math.max(scale, 1);
    canvas.style.width = Math.round(SCREEN_W * scale) + 'px';
    canvas.style.height = Math.round(SCREEN_H * scale) + 'px';
  }
  // resize() reads control rects that themselves depend on the body class it
  // sets, so run it twice: pass 1 lays the controls out, pass 2 measures them.
  function relayout() { resize(); resize(); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () {
    // iOS reports stale innerWidth/innerHeight during orientationchange.
    relayout(); setTimeout(relayout, 120); setTimeout(relayout, 400);
  });
  if (window.visualViewport) {
    // The mobile URL bar collapsing/expanding resizes the visual viewport only.
    window.visualViewport.addEventListener('resize', relayout);
  }
  relayout();

  // ---- input ----
  const keys = {};        // held
  const pressed = {};      // edge: true for one frame
  function clearInput() {
    for (const k in keys) keys[k] = false;
    for (const k in pressed) pressed[k] = false;
  }
  const KEYMAP = {
    ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
    KeyW:'up', KeyS:'down', KeyA:'left', KeyD:'right',
    KeyZ:'a', KeyJ:'a', Space:'a',
    KeyX:'b', KeyK:'b',
    Enter:'start', ShiftLeft:'select', ShiftRight:'select',
    KeyM:'mute', KeyC:'cont'
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
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });

  // touch: the on-screen controller. Hit-testing is done against the ACTUAL
  // control DOM elements (#dpad, #btn-a/b/start/select) so the touch zones can
  // never drift away from what the player sees. Multi-touch: move + fire at once.
  // WebAudio on mobile only starts from inside a real user-gesture handler, and
  // the game's first Sound call happens later inside requestAnimationFrame. Unlock
  // synchronously on the very first input of any kind, or the game plays silent.
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try { if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock(); } catch (e) {}
  }
  window.addEventListener('keydown', unlockAudio, true);
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('mousedown', unlockAudio, true);

  // touch: the on-screen controller. Each touch is assigned an OWNER control at
  // touchstart and keeps it until release, the marble.html stick/drag convention.
  // That means a thumb that slides off the d-pad keeps steering (direction is read
  // from the pad centre, not from containment) and a thumb that slides off A never
  // silently arms B. Multi-touch: move and attack at the same time.
  const TOUCH_BUTTONS = ['a', 'b', 'start', 'select', 'cont', 'mute'];
  function setupTouch() {
    const dpadEl = el('dpad');
    const btnEl = {
      a: el('btn-a'), b: el('btn-b'), start: el('btn-start'),
      select: el('btn-select'), cont: el('btn-c'), mute: el('btn-m')
    };
    const owners = {};   // identifier -> {own:'dpad'|button-name, x, y}
    window.addEventListener('touchstart', start, {passive:false});
    window.addEventListener('touchmove', move, {passive:false});
    window.addEventListener('touchend', end, {passive:false});
    window.addEventListener('touchcancel', end, {passive:false});
    function start(e) {
      unlockAudio();
      let onControl = false;
      for (const t of e.changedTouches) {
        const p = { x: t.clientX, y: t.clientY };
        const own = ownerAt(p);
        if (own) { owners[t.identifier] = { own: own, x: p.x, y: p.y }; onControl = true; }
      }
      if (onControl) e.preventDefault();   // only swallow scroll/zoom over a control
      apply();
    }
    function move(e) {
      let owned = false;
      for (const t of e.changedTouches) {
        const o = owners[t.identifier];
        if (o) { o.x = t.clientX; o.y = t.clientY; owned = true; }
      }
      if (owned) e.preventDefault();
      apply();
    }
    function end(e) {
      for (const t of e.changedTouches) delete owners[t.identifier];
      apply();
    }
    function inEl(p, e) {
      const r = visRect(e); if (!r) return false;
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    }
    function ownerAt(p) {
      if (inEl(p, dpadEl)) return 'dpad';
      for (const name of TOUCH_BUTTONS) if (inEl(p, btnEl[name])) return name;
      return null;
    }
    function setActive(e, on) { if (e && e.classList) e.classList.toggle('active', !!on); }
    const last = {};
    function apply() {
      let up = false, dn = false, lt = false, rt = false;
      const down = {};
      for (const id in owners) {
        const o = owners[id];
        if (o.own === 'dpad') {
          const r = visRect(dpadEl); if (!r) continue;
          const dx = o.x - (r.left + r.width / 2), dy = o.y - (r.top + r.height / 2);
          const dead = r.width * 0.16;
          if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
            if (Math.abs(dx) > Math.abs(dy)) { if (dx < 0) lt = true; else rt = true; }
            else { if (dy < 0) up = true; else dn = true; }
          }
        } else down[o.own] = true;
      }
      keys.up = up; keys.down = dn; keys.left = lt; keys.right = rt;
      for (const name of TOUCH_BUTTONS) {
        const on = !!down[name];
        if (on && !last[name]) pressed[name] = true;   // edge press for one frame
        last[name] = on;
        keys[name] = on;
        setActive(btnEl[name], on);
      }
      setActive(dpadEl, up || dn || lt || rt);
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
    // frame() owns the single recurring scheduler chain.
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
