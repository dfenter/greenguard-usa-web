// hud.js — Redline GT 2D overlay: gauges, chips, countdown, menus, ceremony.
// Everything is drawn to a second canvas over the WebGL view. Motion follows
// the house language: ease-out cubic for slides, ease-out back for pops.

// ---------------------------------------------------------------- UI system
// One declared design system for every screen: title, HUD, loader, garage,
// select, settings, credits, pause and finish all read from these tokens.
// Type is a single family with a fixed scale and a fixed tracking rule
// (tracking grows as size falls, which is what makes the small all-caps labels
// legible next to the large numerals).
export const UI = {
  family: '-apple-system, system-ui, "Segoe UI", Arial, sans-serif',
  // Type scale (px at the 844x390 reference; screens scale against min(W,H)).
  size: {
    micro: 8, label: 9, caption: 11, body: 13, sub: 15,
    title: 19, display: 26, hero: 44, mega: 64,
  },
  // Tracking, paired to the step above it.
  track: {
    micro: 1.6, label: 1.4, caption: 0.6, body: 0.3, sub: 0.3,
    title: 3, display: 1.2, hero: 6, mega: 8,
  },
  weight: { regular: 700, medium: 800, bold: 900 },
  // 4px spacing grid.
  space: (n) => n * 4,
  radius: { chip: 11, card: 16, pill: 999, button: 14 },
  // Semantic palette. Accents are no longer picked per button: each colour has
  // exactly one meaning across the whole game.
  color: {
    ink: '#ffffff',
    inkSoft: 'rgba(214,228,242,0.82)',
    inkFaint: 'rgba(168,188,208,0.62)',
    surface: 'rgba(9,15,25,0.80)',
    surfaceDeep: 'rgba(6,10,18,0.92)',
    line: 'rgba(255,255,255,0.13)',
    primary: '#ffcf67',      // the one call to action on any screen
    secondary: '#9fd6ff',    // navigation and reversible choices
    positive: '#7fe8a6',     // gain: new best, medal earned, gas pedal
    negative: '#ff9b8f',     // loss: contact, brake pedal
    locked: '#6d7c8c',       // unavailable
    onPrimary: '#08101c',
  },
};

export const EASE = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// `value` of 0 means "no time recorded" for bests, so it renders as a
// placeholder. A live running clock passes live:true to get 00:00.00 instead.
export function formatTime(value, live) {
  if (!live && (!value || value <= 0)) return '--:--.--';
  const v = value > 0 ? value : 0;
  const mins = Math.floor(v / 60);
  const secs = (v % 60).toFixed(2).padStart(5, '0');
  return String(mins).padStart(2, '0') + ':' + secs;
}
export function formatDelta(value) {
  const sign = value >= 0 ? '+' : '-';
  return sign + Math.abs(value).toFixed(2);
}

export function hexStr(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
export function rgba(hex, a) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.hitZones = [];
    // Glyph advance cache keyed by font + character. The letter-spaced
    // wordmarks and readouts used to cost two measureText calls per glyph per
    // frame, which was the single largest 2D cost in the feel trace.
    this._adv = new Map();
    this._font = '';
    // weight|size -> font shorthand string (see fontFor)
    this._fontCache = new Map();
    this._vig = null;
    this._vigKey = '';
    // Press/focus response for menu buttons: id -> seconds remaining of the
    // 110 ms scale+colour pop. Keyboard focus uses the same channel.
    this._press = new Map();
    this.focusId = null;
    this.reducedMotion = false;
    // Chrome 99+ and Safari 17.4+ expose ctx.letterSpacing; older engines fall
    // back to the per-glyph path.
    this.nativeSpacing = 'letterSpacing' in this.ctx;
  }

  // Cached measureText for a single glyph under the current ctx.font.
  advance(ch) {
    let m = this._adv.get(this._font);
    if (!m) { m = new Map(); this._adv.set(this._font, m); }
    let w = m.get(ch);
    if (w === undefined) { w = this.ctx.measureText(ch).width; m.set(ch, w); }
    return w;
  }

  // Resolve every font size the HUD uses while the loading screen is still up,
  // so the first race frame never pays font resolution or glyph rasterisation.
  warmFonts(sizes) {
    const c = this.ctx;
    const prev = c.globalAlpha;
    c.globalAlpha = 0;
    for (const size of sizes) {
      for (const weight of [700, 800, 900]) {
        c.font = weight + ' ' + size + 'px -apple-system, system-ui, "Segoe UI", Arial, sans-serif';
        c.fillText('0123456789:.-+ABCDEFGHIJKLMNOPQRSTUVWXYZ', -9999, -9999);
      }
    }
    c.globalAlpha = prev;
    this._font = '';
  }

  resize(cssW, cssH, dpr) {
    this.W = cssW; this.H = cssH; this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._adv.clear();
    // Writing canvas.width resets the 2D context to its defaults, including
    // the font, so the cached "font currently set on the context" tracker has
    // to be invalidated here or the next text() would skip a needed assignment.
    this._font = '';
    this._vigKey = '';
    const cs = getComputedStyle(document.documentElement);
    const px = (v) => parseFloat(v) || 0;
    this.safe = {
      top: px(cs.getPropertyValue('--sat')) || 0,
      right: px(cs.getPropertyValue('--sar')) || 0,
      bottom: px(cs.getPropertyValue('--sab')) || 0,
      left: px(cs.getPropertyValue('--sal')) || 0,
    };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.hitZones.length = 0;
  }

  // One safe content rectangle, used by every full-screen layout so nothing is
  // ever centred against the raw viewport while an inset is present.
  safeRect() {
    const s = this.safe;
    const x = s.left, y = s.top;
    return { x, y, w: this.W - s.left - s.right, h: this.H - s.top - s.bottom, cx: x + (this.W - s.left - s.right) / 2 };
  }

  // Register a press so the next few frames animate the button.
  press(id) { if (id) this._press.set(id, 0.11); }
  tick(dt) {
    if (!this._press.size) return;
    for (const [k, v] of this._press) {
      const n = v - dt;
      if (n <= 0) this._press.delete(k); else this._press.set(k, n);
    }
  }

  zone(id, x, y, w, h, data) {
    this.hitZones.push({ id, x, y, w, h, data });
  }
  hit(x, y) {
    for (let i = this.hitZones.length - 1; i >= 0; i--) {
      const z = this.hitZones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
    }
    return null;
  }

  // ------------------------------------------------------------ primitives
  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    const q = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + q, y);
    c.arcTo(x + w, y, x + w, y + h, q);
    c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q);
    c.arcTo(x, y, x + w, y, q);
    c.closePath();
  }

  // Font shorthand strings, keyed weight|size. The race HUD makes ~30 text()
  // calls a frame and each one used to concatenate a fresh shorthand string and
  // hand it to the ctx.font setter, which re-parses CSS on every assignment.
  // That was ~30 string allocations plus 30 font parses per frame for a set of
  // at most a dozen distinct fonts. Now the string is built once per
  // weight/size pair and the setter is skipped entirely when the font has not
  // changed since the last call.
  fontFor(weight, size) {
    const key = weight + '|' + size;
    let f = this._fontCache.get(key);
    if (f === undefined) {
      f = weight + ' ' + size + 'px -apple-system, system-ui, "Segoe UI", Arial, sans-serif';
      this._fontCache.set(key, f);
    }
    return f;
  }

  text(str, x, y, size, color, align, weight, letter) {
    const c = this.ctx;
    const font = this.fontFor(weight || 700, size);
    if (font !== this._font) { c.font = font; this._font = font; }
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillStyle = color || '#fff';
    if (letter) {
      if (this.nativeSpacing) {
        // One fillText for the whole run. The per-glyph fallback below was the
        // largest single cost in the race HUD: every spaced label cost one
        // fillText per character, every frame.
        c.letterSpacing = letter + 'px';
        // Spacing is also emitted after the final glyph, so the run measures
        // one gap wider than it draws; nudge the anchor back to keep centred
        // and right-aligned labels where they were.
        const shift = align === 'center' ? letter / 2 : align === 'right' ? letter : 0;
        c.fillText(str, x - shift, y);
        c.letterSpacing = '0px';
        return;
      }
      // Manual letter-spacing fallback. Glyph advances come from the cache so
      // a redraw costs no measureText at all.
      const s = String(str);
      let total = 0;
      for (let i = 0; i < s.length; i++) total += this.advance(s[i]) + letter;
      total -= letter;
      let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
      c.textAlign = 'left';
      for (let i = 0; i < s.length; i++) {
        c.fillText(s[i], cx, y);
        cx += this.advance(s[i]) + letter;
      }
      return;
    }
    c.fillText(str, x, y);
  }

  // Styled gauge arc: track + fill + tick marks + optional redline band.
  arc(cx, cy, radius, start, end, frac, thickness, colorTrack, colorFill, redlineFrom) {
    const c = this.ctx;
    c.lineCap = 'round';
    c.lineWidth = thickness;
    c.strokeStyle = colorTrack;
    c.beginPath();
    c.arc(cx, cy, radius, start, end);
    c.stroke();
    if (redlineFrom != null && redlineFrom < 1) {
      c.strokeStyle = 'rgba(240,72,64,0.42)';
      c.beginPath();
      c.arc(cx, cy, radius, start + (end - start) * redlineFrom, end);
      c.stroke();
    }
    if (frac > 0.002) {
      c.strokeStyle = colorFill;
      c.beginPath();
      c.arc(cx, cy, radius, start, start + (end - start) * clamp(frac, 0, 1));
      c.stroke();
    }
  }

  arcTicks(cx, cy, radius, start, end, count, len, color, thickness) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = thickness || 2;
    c.lineCap = 'butt';
    for (let i = 0; i <= count; i++) {
      const a = start + (end - start) * (i / count);
      const co = Math.cos(a), si = Math.sin(a);
      c.beginPath();
      c.moveTo(cx + co * (radius - len), cy + si * (radius - len));
      c.lineTo(cx + co * radius, cy + si * radius);
      c.stroke();
    }
  }

  // Frosted chip used for lap/position/time readouts.
  chip(x, y, w, h, fill, stroke, radius) {
    const c = this.ctx;
    c.fillStyle = fill;
    this.roundRect(x, y, w, h, radius == null ? 10 : radius);
    c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.25; c.stroke(); }
  }

  // Menu button with a 110 ms press response and a keyboard focus ring.
  button(id, x, y, w, h, label, opts) {
    const o = opts || {};
    const c = this.ctx;
    const accent = o.accent || UI.color.secondary;
    const disabled = !!o.disabled;
    const pr = this._press.get(id) || 0;
    const focused = !disabled && this.focusId === id;
    // Ease-out on release; reduced motion keeps the colour flip, drops the pop.
    const pf = this.reducedMotion ? 0 : EASE.outCubic(clamp(pr / 0.11, 0, 1));
    const pressed = !!o.pressed || pr > 0;
    const sx = 1 - pf * 0.045;
    c.save();
    c.globalAlpha = disabled ? 0.4 : 1;
    if (pf > 0) {
      c.translate(x + w / 2, y + h / 2);
      c.scale(sx, sx);
      c.translate(-(x + w / 2), -(y + h / 2));
    }
    c.fillStyle = pressed ? accent : (o.solid ? accent : UI.color.surface);
    this.roundRect(x, y, w, h, o.radius == null ? UI.radius.button : o.radius);
    c.fill();
    c.strokeStyle = accent;
    c.lineWidth = o.solid ? 0 : 1.8;
    if (!o.solid) c.stroke();
    if (focused) {
      c.strokeStyle = UI.color.ink;
      c.lineWidth = 1.6;
      this.roundRect(x - 3.5, y - 3.5, w + 7, h + 7, (o.radius == null ? UI.radius.button : o.radius) + 3);
      c.stroke();
    }
    const fg = (pressed || o.solid) ? UI.color.onPrimary : accent;
    this.text(label, x + w / 2, y + h / 2 + 0.5,
      o.size || Math.max(12, Math.min(16, w * 0.14)), fg, 'center', UI.weight.medium, 0.6);
    c.restore();
    // restore() reverts ctx.font to its save()-time value; drop the cache so
    // the next text() call re-applies its font instead of trusting a stale hit.
    this._font = '';
    if (!disabled) this.zone(id, x, y, w, h, o.data);
    return { x, y, w, h };
  }

  // Off-road and damage hold the vignette up for many consecutive frames, so
  // the gradient object is reused whenever the colour and strength repeat to
  // within a step rather than rebuilt every frame.
  // The vignette is up for hundreds of consecutive frames while off-road, and
  // a full-screen radial-gradient fill at the HUD backing resolution was one of
  // the recurring stalls in the feel trace. It is now rasterised once per
  // colour into a small offscreen tile and blitted with globalAlpha, which
  // makes strength changes free and the draw a single scaled image copy.
  vignette(strength, color) {
    if (strength <= 0.002) return;
    const c = this.ctx;
    const key = (color || 'rgba(4,8,16,') + '|vig';
    if (key !== this._vigKey) {
      const baked = GGKit.hiDpi.canvas(128, 128);
      const cv = baked.canvas;
      const g2 = baked.ctx;
      const g = g2.createRadialGradient(64, 64, 24, 64, 64, 90);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, (color || 'rgba(4,8,16,') + '1)');
      g2.fillStyle = g;
      g2.fillRect(0, 0, 128, 128);
      this._vig = cv;
      this._vigKey = key;
    }
    const prev = c.globalAlpha;
    c.globalAlpha = clamp(strength, 0, 1);
    c.drawImage(this._vig, 0, 0, this.W, this.H);
    c.globalAlpha = prev;
  }

  scrim(alpha) {
    const c = this.ctx;
    c.fillStyle = 'rgba(5,9,18,' + alpha + ')';
    c.fillRect(0, 0, this.W, this.H);
  }
}
