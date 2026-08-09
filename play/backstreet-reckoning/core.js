'use strict';
/* Backstreet Reckoning - core: math, rng, input, audio, fx */
(function (root) {

  /* ---------- math ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

  /* ---------- seeded rng ---------- */
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    const f = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + f() * (b - a);
    f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  }

  /* ---------- audio (WebAudio only, no files) ---------- */
  const Audio = {
    ctx: null,
    master: null,
    muted: false,
    init() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, vol, slide) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, hp, lp) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = hp || 900; f.Q.value = lp || 0.9;
      const g = this.ctx.createGain(); g.gain.value = vol || 0.25;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    },
    hit() { this.noise(0.13, 0.35, 640, 1.1); this.tone(180, 0.09, 'square', 0.16, 90); },
    heavy() { this.noise(0.24, 0.42, 320, 0.8); this.tone(110, 0.2, 'sawtooth', 0.2, 45); },
    whiff() { this.noise(0.09, 0.11, 2200, 2.5); },
    pickup() { this.tone(660, 0.09, 'square', 0.16); this.tone(990, 0.11, 'square', 0.13); },
    heal() { this.tone(520, 0.1, 'triangle', 0.2); setTimeout(() => this.tone(780, 0.14, 'triangle', 0.2), 90); },
    ko() { this.tone(300, 0.4, 'sawtooth', 0.22, 60); this.noise(0.35, 0.3, 400, 0.7); },
    hurt() { this.tone(240, 0.16, 'sawtooth', 0.2, 120); this.noise(0.1, 0.2, 500, 1); },
    knife() { this.tone(1400, 0.07, 'square', 0.1, 700); },
    clear() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.2), i * 90)); },
    dead() { [400, 330, 262, 180].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'sawtooth', 0.2), i * 150)); }
  };

  /* ---------- input ---------- */
  const Input = {
    keys: Object.create(null),
    pressed: Object.create(null),
    stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0, id: -1 },
    btn: { punch: false, jump: false },
    tap: { punch: false, jump: false },
    swipes: [],
    anyInput: false,
    _ptr: Object.create(null),
    layout: null,

    bind(canvas, layoutFn) {
      this.layout = layoutFn;
      const self = this;

      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) * (canvas.width / r.width),
          y: (e.clientY - r.top) * (canvas.height / r.height)
        };
      };

      const down = (id, p) => {
        self.anyInput = true;
        Audio.resume();
        const L = self.layout();
        const rec = { id: id, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), role: 'none' };
        const dPunch = Math.hypot(p.x - L.punch.x, p.y - L.punch.y);
        const dJump = Math.hypot(p.x - L.jump.x, p.y - L.jump.y);
        if (dPunch < L.punch.r * 1.35 && dPunch <= dJump) {
          rec.role = 'punch'; self.btn.punch = true; self.tap.punch = true;
        } else if (dJump < L.jump.r * 1.35) {
          rec.role = 'jump'; self.btn.jump = true; self.tap.jump = true;
        } else if (p.x < L.w * 0.5 && self.stick.id < 0) {
          rec.role = 'stick';
          self.stick.active = true; self.stick.id = id;
          self.stick.ox = p.x; self.stick.oy = p.y;
          self.stick.x = p.x; self.stick.y = p.y;
          self.stick.dx = 0; self.stick.dy = 0; self.stick.mag = 0;
        } else {
          rec.role = 'swipe';
        }
        self._ptr[id] = rec;
      };

      const move = (id, p) => {
        const rec = self._ptr[id];
        if (!rec) return;
        rec.x = p.x; rec.y = p.y;
        if (rec.role === 'stick') {
          const L = self.layout();
          let dx = p.x - self.stick.ox, dy = p.y - self.stick.oy;
          const m = Math.hypot(dx, dy);
          const R = L.stickR;
          if (m > R) { // drag origin along (floating stick)
            self.stick.ox += dx * (1 - R / m);
            self.stick.oy += dy * (1 - R / m);
            dx *= R / m; dy *= R / m;
          }
          self.stick.x = p.x; self.stick.y = p.y;
          self.stick.dx = dx / R; self.stick.dy = dy / R;
          self.stick.mag = Math.min(1, m / R);
        }
      };

      const up = (id, canceled) => {
        const rec = self._ptr[id];
        if (!rec) return;
        delete self._ptr[id];
        const dt = performance.now() - rec.t;
        const dx = rec.x - rec.sx, dy = rec.y - rec.sy;
        const dist = Math.hypot(dx, dy);
        const L = self.layout();
        if (rec.role === 'stick') {
          self.stick.active = false; self.stick.id = -1;
          self.stick.dx = 0; self.stick.dy = 0; self.stick.mag = 0;
        } else if (rec.role === 'punch') {
          self.btn.punch = Object.keys(self._ptr).some(k => self._ptr[k].role === 'punch');
          if (!canceled && dist > L.swipeMin && dt < 500) self.swipes.push({ dx: dx, dy: dy });
        } else if (rec.role === 'jump') {
          self.btn.jump = Object.keys(self._ptr).some(k => self._ptr[k].role === 'jump');
        } else if (rec.role === 'swipe') {
          if (!canceled && dist > L.swipeMin && dt < 500) self.swipes.push({ dx: dx, dy: dy });
        }
      };

      if (root.PointerEvent) {
        canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); down(e.pointerId, pos(e)); }, { passive: false });
        canvas.addEventListener('pointermove', (e) => { e.preventDefault(); move(e.pointerId, pos(e)); }, { passive: false });
        const end = (e) => { e.preventDefault(); up(e.pointerId, e.type === 'pointercancel'); };
        canvas.addEventListener('pointerup', end, { passive: false });
        canvas.addEventListener('pointercancel', end, { passive: false });
      } else {
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) down(t.identifier, pos(t)); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) move(t.identifier, pos(t)); }, { passive: false });
        const tend = (e) => { e.preventDefault(); for (const t of e.changedTouches) up(t.identifier, e.type === 'touchcancel'); };
        canvas.addEventListener('touchend', tend, { passive: false });
        canvas.addEventListener('touchcancel', tend, { passive: false });
        canvas.addEventListener('mousedown', (e) => { e.preventDefault(); down(-9, pos(e)); }, { passive: false });
        root.addEventListener('mousemove', (e) => { if (self._ptr[-9]) move(-9, pos(e)); });
        root.addEventListener('mouseup', () => { if (self._ptr[-9]) up(-9); });
      }
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

      root.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (!self.keys[k]) self.pressed[k] = true;
        self.keys[k] = true;
        self.anyInput = true;
        Audio.resume();
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      });
      root.addEventListener('keyup', (e) => { self.keys[e.key.toLowerCase()] = false; });
      root.addEventListener('blur', () => { self.clear(); });
    },

    key(...names) { for (const n of names) if (this.keys[n]) return true; return false; },
    hit(...names) { for (const n of names) if (this.pressed[n]) return true; return false; },
    endFrame() {
      this.pressed = Object.create(null);
      this.tap.punch = false; this.tap.jump = false;
      this.swipes.length = 0;
    },
    clear() {
      this.keys = Object.create(null); this.pressed = Object.create(null); this.stick.active = false; this.stick.id = -1; this.stick.ox = 0; this.stick.oy = 0; this.stick.x = 0; this.stick.y = 0; this.stick.dx = 0; this.stick.dy = 0; this.stick.mag = 0;
      this.btn.punch = false; this.btn.jump = false; this.tap.punch = false; this.tap.jump = false; this.swipes.length = 0; this.anyInput = false; this._ptr = Object.create(null);
    }
  };

  /* ---------- fx: particles + shake ---------- */
  const FX = {
    parts: [],
    shakeT: 0, shakeMag: 0,
    texts: [],
    MAX: 220,
    burst(x, y, z, n, color, spd, opt) {
      opt = opt || {};
      for (let i = 0; i < n && this.parts.length < this.MAX; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = spd * (0.4 + Math.random() * 0.8);
        this.parts.push({
          x: x, y: y, z: z,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opt.up || 0),
          life: opt.life || (0.35 + Math.random() * 0.4),
          max: opt.life || 0.7,
          r: opt.r || (2 + Math.random() * 3),
          c: color, g: opt.g === undefined ? 900 : opt.g
        });
      }
    },
    text(x, y, z, str, color) {
      if (this.texts.length > 18) this.texts.shift();
      this.texts.push({ x: x, y: y, z: z, s: str, c: color, life: 0.75, max: 0.75 });
    },
    shake(mag, dur) {
      if (mag > this.shakeMag || this.shakeT <= 0) { this.shakeMag = mag; }
      this.shakeT = Math.max(this.shakeT, dur);
    },
    update(dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.life -= dt;
        if (p.life <= 0) { this.parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
        if (p.y > 0) { p.y = 0; p.vy *= -0.35; p.vx *= 0.6; }
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt; t.y += 42 * dt;
        if (t.life <= 0) this.texts.splice(i, 1);
      }
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    },
    offset() {
      if (this.shakeT <= 0) return { x: 0, y: 0 };
      const m = this.shakeMag * Math.min(1, this.shakeT * 6);
      return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
    },
    clear() { this.parts.length = 0; this.texts.length = 0; this.shakeT = 0; this.shakeMag = 0; }
  };

  root.BR = { clamp, lerp, sign, approach, makeRng, Audio, Input, FX };
})(window);
