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
  function makeAudio(slug) {
    const save = makeSave(slug + '-audio');
    const prefs = save.get({ mute: false, music: 0.7, sfx: 1.0 });
    let ctx = null;
    let musicGain = null, sfxGain = null, masterGain = null;
      let current = null; // {source, gain, name}
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
      if (!ctx) return;
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
        Promise.resolve(load(name)).then(function (buf) {
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
  function makeInput(kit) {
    const pointers = new Map(); // id -> {x,y,startX,startY,downAt,zone}
    const keys = new Set();
    const listeners = [];
    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      listeners.push([target, type, fn, opts]);
    }
    on(root, 'pointerdown', function (e) {
      if (kit.paused) return;
      pointers.set(e.pointerId, {
        x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        downAt: performance.now(), zone: null,
      });
    }, { passive: true });
    on(root, 'pointermove', function (e) {
      const p = pointers.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
    }, { passive: true });
    function drop(e) { pointers.delete(e.pointerId); }
    on(root, 'pointerup', drop, { passive: true });
    on(root, 'pointercancel', drop, { passive: true });
    on(root, 'blur', function () { pointers.clear(); keys.clear(); });
    on(root, 'keydown', function (e) { if (!kit.paused) keys.add(e.code); });
    on(root, 'keyup', function (e) { keys.delete(e.code); });
    return {
      pointers: pointers,
      keyDown(code) { return !kit.paused && keys.has(code); },
      firstIn(rect) { // first live pointer inside a rect {x,y,w,h} in CSS px
        for (const p of pointers.values()) {
          if (p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h) return p;
        }
        return null;
      },
      clearAll() { pointers.clear(); keys.clear(); },
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
    kit.input = makeInput(kit);

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
      if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    };

    return kit;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GGKit;
  root.GGKit = GGKit;
})(typeof window !== 'undefined' ? window : globalThis);
