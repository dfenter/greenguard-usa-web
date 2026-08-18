/* ggkit.js — GreenGuard studio kit for /play/ flagship titles.
 * Solves the fleet's catalogued systemic defect classes once, plus audio,
 * PWA, loading, settings, and juice. Zero dependencies; engine-agnostic
 * (works beside Phaser or Three). Loaded as a classic script or module.
 *
 * Usage contract (every flagship title):
 *   const kit = GGKit.create({
 *     slug: 'redline-gt',
 *     orientation: 'landscape' | 'portrait' | 'any',
 *     onPause() {...},   // MUST freeze the sim
 *     onResume() {...},
 *     onRestart() {...}, // kit clears input state BEFORE calling this
 *   });
 *   kit.loader.show(); ... kit.loader.progress(0.4); ... kit.loader.hide();
 *   kit.audio.music('theme');  kit.audio.sfx('hit');
 *   kit.save.set(obj); kit.save.get(fallback);
 *   kit.input — per-pointer identity map (defect class #3)
 *   kit.juice.shake(px, ms); kit.juice.hitStop(ms);
 *
 * Input subscriptions (added 2026-08-16, purely additive):
 *   kit.input.onDown(fn) -> unsubscribe. fn(pointer, event) runs AFTER the
 *     kit has created and stored its pointer object, so a title decorates
 *     THE KIT'S object instead of racing it. Retires the claim-side defect
 *     where a canvas-level pointerdown claimed a pointer and the kit's own
 *     window handler then overwrote the entry.
 *   kit.input.onMove(fn) -> unsubscribe. fn(pointer, event) runs after the
 *     kit has written the new position.
 *   kit.input.onUp(fn) -> unsubscribe. fn(pointer, event) runs BEFORE the
 *     entry is deleted, so `kit.input.pointers.has(id)` is still true inside
 *     it. Retires the release-side defect where the kit's window pointerup
 *     deleted the id before any later-registered title listener could run,
 *     so every release was silently swallowed.
 *     event is the real PointerEvent for a release or a cancel (check
 *     event.type), and null for a synthetic drop from blur/clearAll/pause.
 *   kit.input.onKeyDown(fn) / onKeyUp(fn) -> unsubscribe. fn(code, event),
 *     fired regardless of pause, for menus that need a rising edge a
 *     per-frame level read cannot see.
 *   Subscribers are exception-isolated: one that throws cannot break the kit
 *   or the other subscribers. All five fire regardless of pause state.
 *
 * Pause-transparent reads (added 2026-08-16, purely additive):
 *   kit.input.pointersRaw — identity map that keeps tracking while paused.
 *   kit.input.firstInRaw(rect) / kit.input.keyDownRaw(code) — the same reads
 *     without the pause suppression. Retires the paused-side defect where a
 *     pause menu that read input through the kit was dead on arrival and
 *     every title had to bridge input with a second set of listeners.
 *   pointers, firstIn and keyDown keep their exact pause-suppressing
 *   semantics: live play reads those, pause menus read the Raw variants.
 *
 * Render baseline (opt-in, see GGKit.renderDefaults / GGKit.hiDpi below).
 */
(function (root) {
  'use strict';

  const GGKit = {};

  // ---------------------------------------------------------------- utils
  function el(tag, css, parent) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    (parent || document.body).appendChild(e);
    return e;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Bounded array push (defect class: unbounded arrays). Drops oldest.
  GGKit.boundedPush = function (arr, item, max) {
    arr.push(item);
    if (arr.length > max) arr.splice(0, arr.length - max);
    return arr;
  };

  // ------------------------------------------------------- guarded saves
  // Defect classes: unguarded localStorage (private mode throws, quota),
  // persisted IDs must validate against content registries.
  function makeSave(slug, validate) {
    const key = 'gg-' + slug;
    let memFallback = null;
    return {
      get(fallback) {
        let raw = null;
        try { raw = localStorage.getItem(key); } catch (e) { raw = memFallback; }
        if (raw == null) return fallback;
        try {
          const obj = JSON.parse(raw);
          if (validate && !validate(obj)) return fallback;
          return obj;
        } catch (e) { return fallback; }
      },
      set(obj) {
        const raw = JSON.stringify(obj);
        memFallback = raw;
        try { localStorage.setItem(key, raw); } catch (e) { /* quota/private: keep memory copy */ }
      },
      clear() {
        memFallback = null;
        try { localStorage.removeItem(key); } catch (e) {}
      },
    };
  }

  // ---------------------------------------------------------- audio bus
  // Touch-unlocked WebAudio manager: music bus w/ crossfade, sfx bus,
  // persistent mute + volume. Assets registered as URLs, lazy-decoded.
  // Defect class: persisted prefs are restored without validation, so a
  // corrupt or out-of-range stored value (NaN, a string, 12, null) is written
  // straight into a GainNode and wedges the bus. Clamp on load, and again on
  // every apply, because prefs is a public object titles can write to.
  const AUDIO_DEFAULTS = { mute: false, music: 0.7, sfx: 1.0 };
  function unit(v, dflt) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? clamp(n, 0, 1) : dflt;
  }
  function sanitizeAudioPrefs(raw) {
    if (!raw || typeof raw !== 'object') return { mute: false, music: AUDIO_DEFAULTS.music, sfx: AUDIO_DEFAULTS.sfx };
    return {
      mute: raw.mute === true || raw.mute === 'true' || raw.mute === 1,
      music: unit(raw.music, AUDIO_DEFAULTS.music),
      sfx: unit(raw.sfx, AUDIO_DEFAULTS.sfx),
    };
  }

  function makeAudio(slug) {
    const save = makeSave(slug + '-audio');
    const prefs = sanitizeAudioPrefs(save.get(null));
    let ctx = null;
    let musicGain = null, sfxGain = null, masterGain = null;
      let current = null; // {source, gain, name}
      let musicToken = 0; // only the newest music/stopMusic call owns the bus
    const buffers = {}; // name -> AudioBuffer | Promise
    const urls = {};    // name -> url

    function ensureCtx() {
      if (ctx) return ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.connect(masterGain);
      sfxGain = ctx.createGain();
      sfxGain.connect(masterGain);
      applyPrefs();
      return ctx;
    }
    function applyPrefs() {
      prefs.mute = !!prefs.mute;
      prefs.music = unit(prefs.music, AUDIO_DEFAULTS.music);
      prefs.sfx = unit(prefs.sfx, AUDIO_DEFAULTS.sfx);
      if (!ctx) { save.set(prefs); return; }
      masterGain.gain.value = prefs.mute ? 0 : 1;
      musicGain.gain.value = prefs.music;
      sfxGain.gain.value = prefs.sfx;
      save.set(prefs);
    }
    function unlock() {
      const c = ensureCtx();
      if (c && c.state === 'suspended') c.resume();
    }
    // First-gesture unlock (iOS requirement)
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (t) {
      root.addEventListener(t, unlock, { once: true, passive: true });
    });

    function load(name) {
      if (buffers[name]) return Promise.resolve(buffers[name]);
      const c = ensureCtx();
      if (!c || !urls[name]) return Promise.resolve(null);
      const p = fetch(urls[name])
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return c.decodeAudioData(ab); })
        .then(function (buf) { buffers[name] = buf; return buf; })
        .catch(function () { return null; });
      buffers[name] = p;
      return p;
    }

    return {
      prefs: prefs,
      register(map) { for (const k in map) urls[k] = map[k]; },
      preload(names) { return Promise.all((names || Object.keys(urls)).map(load)); },
      sfx(name, opts) {
        const c = ensureCtx();
        if (!c || prefs.mute) return;
        Promise.resolve(load(name)).then(function (buf) {
          if (!buf || !(buf.duration)) return;
          const src = c.createBufferSource();
          src.buffer = buf;
          const g = c.createGain();
          g.gain.value = (opts && opts.volume) != null ? opts.volume : 1;
          if (opts && opts.rate) src.playbackRate.value = opts.rate;
          src.connect(g); g.connect(sfxGain);
          src.start();
        });
      },
      music(name, fadeMs) {
        const c = ensureCtx();
        if (!c) return;
        const fade = (fadeMs == null ? 800 : fadeMs) / 1000;
        // Defect class: overlapping music start/stop calls raced through the
        // decode await and a stale one could end up owning the bus. The
        // newest call takes the token; everything older bails out.
        const token = ++musicToken;
        Promise.resolve(load(name)).then(function (buf) {
          if (token !== musicToken) return;
          if (!buf || !(buf.duration)) return;
          if (current && current.name === name) return;
          const now = c.currentTime;
          if (current) {
            current.gain.gain.setValueAtTime(current.gain.gain.value, now);
            current.gain.gain.linearRampToValueAtTime(0, now + fade);
            current.source.stop(now + fade + 0.05);
          }
          const src = c.createBufferSource();
          src.buffer = buf; src.loop = true;
          const g = c.createGain();
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(1, now + fade);
          src.connect(g); g.connect(musicGain);
          src.start(now);
          current = { source: src, gain: g, name: name };
        });
      },
      stopMusic(fadeMs) {
        musicToken++; // any in-flight music() start is now stale
        if (!ctx || !current) return;
        const fade = (fadeMs == null ? 500 : fadeMs) / 1000;
        const now = ctx.currentTime;
        current.gain.gain.setValueAtTime(current.gain.gain.value, now);
        current.gain.gain.linearRampToValueAtTime(0, now + fade);
        current.source.stop(now + fade + 0.05);
        current = null;
      },
      setMute(m) { prefs.mute = !!m; applyPrefs(); },
      setMusicVolume(v) { prefs.music = clamp(v, 0, 1); applyPrefs(); },
      setSfxVolume(v) { prefs.sfx = clamp(v, 0, 1); applyPrefs(); },
      suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
      resume() { if (ctx && ctx.state === 'suspended' && !prefs.mute) ctx.resume(); },
    };
  }

  // -------------------------------------------------- per-pointer input
  // Defect class: touch controls without per-pointer identity. The kit
  // tracks every active pointer by pointerId; games query zones, never
  // raw touch arrays. clearAll() runs on every restart/pause (defect
  // class: restart not clearing input state; keyboard-respects-pause).
  function makeInput(kit, opts) {
    const pointers = new Map();    // id -> {x,y,startX,startY,downAt,zone} (pause-suppressed)
    const pointersRaw = new Map(); // same objects, kept while paused too
    const keys = new Set();        // pause-suppressed
    const keysRaw = new Set();     // kept while paused too
    const listeners = [];
    const subsDown = [], subsMove = [], subsUp = [], subsKeyDown = [], subsKeyUp = [];
    const captured = new Map();    // id -> element holding the pointer capture
    const wantCapture = !(opts && opts.pointerCapture === false);
    let clearing = false;

    function on(target, type, fn, o) {
      target.addEventListener(type, fn, o);
      listeners.push([target, type, fn, o]);
    }
    // Subscribers are exception-isolated: a throwing title handler must not
    // take the kit or its sibling subscribers down with it.
    function sub(list, fn) {
      if (typeof fn !== 'function') return function () {};
      list.push(fn);
      let done = false;
      return function () {
        if (done) return;
        done = true;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    }
    function emit(list, a, b) {
      if (!list.length) return;
      const snapshot = list.slice();
      for (let i = 0; i < snapshot.length; i++) {
        try { snapshot[i](a, b); }
        catch (err) { if (root.console && console.error) console.error('[GGKit] input subscriber threw', err); }
      }
    }
    // Defect class: a drag that leaves the canvas or the window strands a
    // pointer, because the matching pointerup is delivered elsewhere. Touch
    // pointers are implicitly captured by the browser already, so this only
    // changes anything for mouse and pen. Opt out with pointerCapture:false.
    function grab(e) {
      if (!wantCapture) return;
      const t = e.target;
      if (!t || typeof t.setPointerCapture !== 'function') return;
      try { t.setPointerCapture(e.pointerId); captured.set(e.pointerId, t); } catch (err) {}
    }
    function ungrab(id) {
      const t = captured.get(id);
      if (!t) return;
      captured.delete(id);
      if (typeof t.releasePointerCapture === 'function') { try { t.releasePointerCapture(id); } catch (err) {} }
    }

    on(root, 'pointerdown', function (e) {
      const p = {
        x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        downAt: performance.now(), zone: null,
        pointerId: e.pointerId, pointerType: e.pointerType,
      };
      pointersRaw.set(e.pointerId, p);
      if (!kit.paused) pointers.set(e.pointerId, p); // unchanged live-play semantics
      grab(e);
      emit(subsDown, p, e);
    }, { passive: true });
    on(root, 'pointermove', function (e) {
      const p = pointersRaw.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      emit(subsMove, p, e);
    }, { passive: true });
    function drop(e) {
      const p = pointersRaw.get(e.pointerId) || pointers.get(e.pointerId);
      if (p) emit(subsUp, p, e);           // fires BEFORE the delete
      pointers.delete(e.pointerId);
      pointersRaw.delete(e.pointerId);
      ungrab(e.pointerId);
    }
    on(root, 'pointerup', drop, { passive: true });
    on(root, 'pointercancel', drop, { passive: true });
    // Synthetic drop: everything the kit throws away still reports a release,
    // so no title can leak a stuck gesture. event is null for these.
    function clearAllInternal() {
      if (clearing) return;
      clearing = true;
      try {
        const live = [];
        pointersRaw.forEach(function (p) { live.push(p); });
        pointers.forEach(function (p) { if (live.indexOf(p) < 0) live.push(p); });
        pointers.clear(); pointersRaw.clear();
        keys.clear(); keysRaw.clear();
        for (let i = 0; i < live.length; i++) {
          if (live[i] && live[i].pointerId != null) ungrab(live[i].pointerId);
          emit(subsUp, live[i], null);
        }
      } finally { clearing = false; }
    }
    on(root, 'blur', clearAllInternal);
    on(root, 'keydown', function (e) {
      keysRaw.add(e.code);
      if (!kit.paused) keys.add(e.code);
      emit(subsKeyDown, e.code, e);
    });
    on(root, 'keyup', function (e) {
      keys.delete(e.code); keysRaw.delete(e.code);
      emit(subsKeyUp, e.code, e);
    });
    function firstOf(map, rect) {
      for (const p of map.values()) {
        if (p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h) return p;
      }
      return null;
    }
    return {
      pointers: pointers,
      pointersRaw: pointersRaw,
      keyDown(code) { return !kit.paused && keys.has(code); },
      keyDownRaw(code) { return keysRaw.has(code); },
      firstIn(rect) { return firstOf(pointers, rect); }, // first live pointer inside a rect {x,y,w,h} in CSS px
      firstInRaw(rect) { return firstOf(pointersRaw, rect); },
      onDown(fn) { return sub(subsDown, fn); },
      onMove(fn) { return sub(subsMove, fn); },
      onUp(fn) { return sub(subsUp, fn); },
      onKeyDown(fn) { return sub(subsKeyDown, fn); },
      onKeyUp(fn) { return sub(subsKeyUp, fn); },
      clearAll() { clearAllInternal(); },
    };
  }

  // ----------------------------------------------------------- overlays
  const OVERLAY_CSS = 'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;background:#0b0f14;color:#e8eef4;' +
    'font-family:-apple-system,system-ui,sans-serif;text-align:center;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';

  function makeLoader() {
    let box = null, bar = null;
    return {
      show(title) {
        if (box) return;
        box = el('div', OVERLAY_CSS);
        const h = el('div', 'font-size:20px;font-weight:700;margin-bottom:18px;', box);
        h.textContent = title || 'Loading';
        const track = el('div', 'width:min(70vw,320px);height:8px;border-radius:4px;background:#22303d;overflow:hidden;', box);
        bar = el('div', 'width:0%;height:100%;border-radius:4px;background:#39d353;transition:width .15s;', track);
      },
      progress(f) { if (bar) bar.style.width = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; },
      hide() { if (box) { box.remove(); box = bar = null; } },
    };
  }

  // ------------------------------------------------------------ create
  GGKit.create = function (opts) {
    const kit = {
      slug: opts.slug,
      paused: false,
      save: makeSave(opts.slug, opts.validateSave),
      audio: makeAudio(opts.slug),
      loader: makeLoader(),
    };
    kit.input = makeInput(kit, opts);

    let pauseDepth = 0;
    const pauseReasons = new Set();
    function pause(reason) {
      pauseReasons.add(reason);
      if (!kit.paused) {
        kit.paused = true;
        kit.input.clearAll();
        kit.audio.suspend();
        if (opts.onPause) opts.onPause(reason);
      }
    }
    function resume(reason) {
      pauseReasons.delete(reason);
      if (kit.paused && pauseReasons.size === 0) {
        kit.paused = false;
        kit.audio.resume();
        if (opts.onResume) opts.onResume();
      }
    }
    kit.pause = pause; kit.resume = resume;
    kit.restart = function () {
      kit.input.clearAll(); // defect class: restart must clear input state
      if (opts.onRestart) opts.onRestart();
    };

    // Defect class: visibility-hidden must pause sims.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause('hidden'); else resume('hidden');
    });
    // A transient window blur is not a reliable background signal on mobile:
    // browser chrome, notifications, and touch focus changes do not always
    // deliver a matching focus event. The input layer still clears controls
    // on blur; visibilitychange is the authoritative simulation pause.

    // Defect class: rotate overlay must PAUSE the sim, and be correct
    // for the declared orientation.
    if (opts.orientation === 'landscape' || opts.orientation === 'portrait') {
      const want = opts.orientation;
      let rotBox = null;
      let rotateTimer = null;
      function isPortrait() {
        const orientation = root.screen && root.screen.orientation;
        if (orientation && typeof orientation.type === 'string' && orientation.type) {
          return orientation.type.indexOf('portrait') === 0;
        }
        if (root.matchMedia) {
          const media = root.matchMedia('(orientation: portrait)');
          if (media && typeof media.matches === 'boolean') return media.matches;
        }
        return root.innerHeight >= root.innerWidth;
      }
      function checkOrientation() {
        const bad = (want === 'portrait') !== isPortrait();
        if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
        if (!bad) {
          if (rotBox) {
            rotBox.remove(); rotBox = null;
            resume('rotate');
          }
          return;
        }
        // Require the bad orientation to remain stable before pausing. This
        // absorbs address-bar, split-screen, and orientationchange flaps.
        if (!rotBox) rotateTimer = setTimeout(function () {
          rotateTimer = null;
          if ((want === 'portrait') === isPortrait()) return;
          rotBox = el('div', OVERLAY_CSS + 'z-index:9500;');
          const icon = el('div', 'font-size:44px;margin-bottom:12px;', rotBox);
          icon.textContent = '↻';
          const t = el('div', 'font-size:17px;max-width:260px;', rotBox);
          t.textContent = 'Rotate your device to ' + want + ' to play';
          pause('rotate');
        }, 600);
      }
      root.addEventListener('resize', checkOrientation);
      root.addEventListener('orientationchange', checkOrientation);
      checkOrientation();
    }

    // ------------------------------------------------------------ juice
    kit.juice = (function () {
      let shakeUntil = 0, shakeMag = 0;
      let hitStopUntil = 0;
      const frameState = { dx: 0, dy: 0, frozen: false };
      let reduced = kit.save.get(null); // shake toggle lives in settings prefs below
      return {
        enabled: true, // settings shell flips this (accessibility toggle)
        shake(mag, ms) {
          if (!kit.juice.enabled) return;
          const now = performance.now();
          shakeUntil = Math.max(shakeUntil, now + ms);
          shakeMag = Math.max(shakeMag, mag);
        },
        hitStop(ms) {
          if (!kit.juice.enabled) return;
          hitStopUntil = Math.max(hitStopUntil, performance.now() + ms);
        },
        // Call each frame: returns {dx, dy, frozen}. If frozen, skip sim step.
        frame() {
          const now = performance.now();
          frameState.frozen = now < hitStopUntil;
          frameState.dx = 0; frameState.dy = 0;
          if (now < shakeUntil) {
            const f = (shakeUntil - now) / 200;
            const m = shakeMag * clamp(f, 0, 1);
            frameState.dx = (Math.random() * 2 - 1) * m;
            frameState.dy = (Math.random() * 2 - 1) * m;
          } else { shakeMag = 0; }
          return frameState;
        },
      };
    })();

    // -------------------------------------------------- settings shell
    const uiPrefs = makeSave(opts.slug + '-ui');
    const up = uiPrefs.get({ juice: true });
    kit.juice.enabled = up.juice !== false;
    kit.openSettings = function (extraRows) {
      pause('settings');
      const box = el('div', OVERLAY_CSS + 'background:rgba(11,15,20,.94);gap:14px;z-index:9200;');
      const h = el('div', 'font-size:20px;font-weight:700;', box); h.textContent = 'Settings';
      function row(label, get, set) {
        const r = el('button', 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);', box);
        function paint() { r.textContent = label + ': ' + (get() ? 'On' : 'Off'); }
        r.addEventListener('click', function () { set(!get()); paint(); });
        paint();
      }
      row('Sound', function () { return !kit.audio.prefs.mute; }, function (v) { kit.audio.setMute(!v); });
      row('Screen shake', function () { return kit.juice.enabled; }, function (v) {
        kit.juice.enabled = v; up.juice = v; uiPrefs.set(up);
      });
      (extraRows || []).forEach(function (fn) { fn(box, row); });
      const close = el('button', 'font:inherit;font-size:16px;color:#0b0f14;background:#39d353;border:0;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);font-weight:700;', box);
      close.textContent = 'Back';
      close.addEventListener('click', function () { box.remove(); resume('settings'); });
      return box;
    };

    // ------------------------------------------------------ fullscreen
    kit.requestFullscreen = function () {
      const d = document.documentElement;
      const fn = d.requestFullscreen || d.webkitRequestFullscreen;
      if (fn) { try { fn.call(d); } catch (e) {} }
    };

    // --------------------------------------------------- PWA registration
    kit.registerPWA = function () {
      // localhost is a secure context too, and service workers register there.
      // The old https-only test meant offline behaviour could not be verified
      // anywhere except production, so the fleet-wide offline defect (the sw
      // scope guard missing the no-trailing-slash url) survived every local
      // gate we ever ran. Allow localhost so it is testable before deploy.
      const secure = location.protocol === 'https:'
        || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!('serviceWorker' in navigator) || !secure) return;
      // Register with an EXPLICIT slug scope that has no trailing slash.
      //
      // A worker's default scope is its own directory, '/play/<slug>/'. The
      // deployed site serves the canonical page at '/play/<slug>' with NO
      // trailing slash (vercel cleanUrls + trailingSlash:false, which
      // 308-redirects the slash form onto it). A page at '/play/<slug>' is
      // NOT inside the scope '/play/<slug>/', so the worker installed, filled
      // its cache, reported perfectly healthy, and could never control the
      // one URL that matters. Offline was dead fleet-wide because of it.
      //
      // '/play/<slug>' is a BROADER scope than the script's directory, so it
      // needs the Service-Worker-Allowed: /play/ header, which vercel.json
      // sets for /play/:slug/sw.js. Fall back to the default registration if
      // the explicit scope is refused, so a missing header degrades to the
      // old behaviour rather than to no worker at all.
      try {
        const swUrl = new URL('sw.js', document.baseURI);
        const scope = swUrl.pathname.replace(/\/sw\.js$/, '');
        navigator.serviceWorker.register(swUrl.pathname, { scope: scope })
          .catch(function () {
            navigator.serviceWorker.register(swUrl.pathname).catch(function () {});
          });
      } catch (e) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    };

    return kit;
  };

  // ------------------------------------------------- render baseline (opt-in)
  // Nothing below runs unless a title asks for it. The 106 live titles keep
  // whatever they configure today; adoption is a separate pass.
  //
  // GGKit.renderDefaults — the shared Phaser render block.
  //   antialias:true + antialiasGL:false is the important pair. Plain
  //   antialias:true asks the context for MSAA, which on a software
  //   rasteriser roughly triples frame cost; antialiasGL:false keeps LINEAR
  //   texture filtering (so art is smooth) without paying for MSAA.
  //   roundPixels:false keeps sub-pixel placement, which is what actually
  //   looks sharp once the backing store is dense.
  GGKit.renderDefaults = {
    antialias: true,
    antialiasGL: false,
    roundPixels: false,
    pixelArt: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
    desynchronized: true,
  };

  // GGKit.hiDpi — device-pixel-ratio correctness.
  //   A title that sizes its canvas in CSS pixels renders at 1x and is then
  //   upscaled by the display, which is why the fleet looks soft on a 2x/3x
  //   iPhone. Phaser 3 has no `resolution` config any more (removed after
  //   3.16, and silently ignored if you set it): the working mechanism is to
  //   size the GAME in device pixels and scale the canvas back down in CSS,
  //   which Phaser's ScaleManager does for you via `zoom`.
  GGKit.hiDpi = {
    // Capped at 3: beyond that the fill cost buys nothing an eye can see.
    dpr(max) {
      const cap = max == null ? 3 : max;
      const d = (root.devicePixelRatio || 1);
      return clamp(isFinite(d) && d > 0 ? d : 1, 1, cap);
    },

    // factor(designW, designH, max) — the multiplier to apply to a title's
    // DESIGN size to reach native device density, and the number every
    // adoption should be built on.
    //
    // Why this is not simply `dpr`: a title whose design size already differs
    // from its CSS display box is partly dense already. Multiplying the
    // design size by dpr overshoots badly. Bulwark designs at 1280x720 and
    // displays in an 844 CSS box; blind x3 gave a 3840x2160 backing store,
    // 8.3M pixels, when the panel only ever shows 2532x1170 (3M). That is
    // 2.7x the fill cost for zero visible gain, and on a software rasteriser
    // it hung the page outright.
    //
    // The correct multiplier is (displayed CSS width * dpr) / design width,
    // clamped to at least 1 (never DOWNsample a title) and at most dpr.
    factor(designW, designH, max) {
      const d = GGKit.hiDpi.dpr(max);
      if (!designW || !designH) return d;
      const vw = root.innerWidth || designW, vh = root.innerHeight || designH;
      // Letterboxed fit preserves aspect, so the displayed width is whichever
      // of width- or height-limited is smaller.
      const shownW = Math.min(vw, vh * (designW / designH));
      return clamp((shownW * d) / designW, 1, d);
    },

    // Returns a NEW Phaser config with render defaults merged (caller wins)
    // and the backing store raised to native device density.
    //
    // SAFE ONLY when the design size IS the CSS layout size (the Scale.NONE
    // and Scale.RESIZE shapes), because it sizes the game in device pixels
    // and compensates with zoom = 1/factor, which leaves world coordinates
    // in device pixels.
    //
    // For a Scale.FIT title with a fixed design size, do NOT use this: raising
    // scale.width moves the world coordinate space and every hard-coded
    // position lands in the wrong place. Use factor() plus a camera zoom,
    // which keeps world coordinates at the design size:
    //   const f = GGKit.hiDpi.factor(DESIGN_W, DESIGN_H);
    //   cfg.scale.width = Math.round(DESIGN_W * f);
    //   cfg.scale.height = Math.round(DESIGN_H * f);
    //   // then, in each scene's create():
    //   this.cameras.main.setZoom(f);
    phaser(config, opts) {
      const cfg = Object.assign({}, config || {});
      cfg.render = Object.assign({}, GGKit.renderDefaults, cfg.render || {});
      const scale = Object.assign({}, cfg.scale || {});
      const cssW = scale.width != null ? scale.width : cfg.width;
      const cssH = scale.height != null ? scale.height : cfg.height;
      const d = GGKit.hiDpi.factor(cssW, cssH, opts && opts.maxDpr);
      if (cssW && cssH && typeof cssW === 'number' && typeof cssH === 'number') {
        scale.width = Math.round(cssW * d);
        scale.height = Math.round(cssH * d);
        scale.zoom = (scale.zoom == null ? 1 : scale.zoom) / d;
        delete cfg.width; delete cfg.height;
        cfg.scale = scale;
      } else if (cfg.scale) {
        cfg.scale = scale;
      }
      cfg.ggDpr = d;
      return cfg;
    },

    // For Scale.RESIZE titles, which take their size from the window rather
    // than from config: call this instead of game.scale.resize(cssW, cssH).
    //
    // READ THIS BEFORE USING IT. Scale.RESIZE CANNOT HOLD A DENSE BACKING
    // STORE IF THE GAME SETS A PARENT. With scaleMode RESIZE and a real
    // parent element, Phaser's ScaleManager polls the parent every 500ms and
    // updateScale() re-derives gameSize and canvas.width from the parent's
    // CSS box, silently undoing whatever this function set. Nothing throws;
    // the title just quietly renders at 1x again a moment later.
    //
    // Measured, not theorised: after the boot crash below was fixed, 10 of 10
    // RESIZE titles still read a ratio of exactly 1.0, and every one of them
    // sets `parent` (document.body or '#game'). The handful the RESIZE recipe
    // did work for were the ones with NO parent element, so their poll never
    // ran.
    //
    // So: use this ONLY for a parentless RESIZE title. If the title sets a
    // parent, convert it to Scale.NONE with zoom = 1/factor, which is exactly
    // what GGKit.hiDpi.phaser() produces, and drive layout from
    // this.scale.width/height.
    //
    // Safe to call BEFORE the game has booted. `game.scale` exists from
    // construction but its internals do not, so calling straight through
    // throws "Cannot set properties of undefined (setting 'width')" from
    // inside Phaser's own resize. Eight titles hit that identically the first
    // time this helper shipped, which means the old guard (`game && game.scale`)
    // was too weak and invited the mistake: titles naturally call this at
    // module top level, right after constructing the game. So defer to the
    // ready event instead of failing.
    resize(game, cssW, cssH, max) {
      const d = GGKit.hiDpi.dpr(max);
      if (!game || !game.scale) return d;
      const apply = function () {
        try {
          game.scale.resize(Math.round(cssW * d), Math.round(cssH * d));
          const c = game.canvas;
          if (c) { c.style.width = cssW + 'px'; c.style.height = cssH + 'px'; }
        } catch (e) { /* a resize must never take the title down */ }
      };
      if (game.isBooted) apply();
      else if (game.events && game.events.once) game.events.once('ready', apply);
      return d;
    },

    // Three: one line, and the only correct one.
    three(renderer, max) {
      const d = GGKit.hiDpi.dpr(max);
      if (renderer && renderer.setPixelRatio) renderer.setPixelRatio(d);
      return d;
    },

    // Canvas textures baked by a title must be baked AT dpr scale, never
    // baked at 1x and scaled up. Draw in CSS units; the context is
    // pre-scaled, and canvas.width/height are the dense device size.
    //   const t = GGKit.hiDpi.canvas(64, 64);
    //   t.ctx.fillRect(0, 0, 64, 64);           // CSS units
    //   scene.textures.addCanvas(key, t.canvas); // then set display size to 64
    canvas(cssW, cssH, max) {
      const d = GGKit.hiDpi.dpr(max);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(cssW * d));
      c.height = Math.max(1, Math.round(cssH * d));
      const ctx = c.getContext('2d');
      if (ctx) { ctx.scale(d, d); ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'; }
      return { canvas: c, ctx: ctx, dpr: d, width: cssW, height: cssH };
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GGKit;
  root.GGKit = GGKit;
})(typeof window !== 'undefined' ? window : globalThis);
