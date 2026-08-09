// hud.js — Rally Dust 2D overlay primitives: gauges, chips, pace-note cards,
// countdown, menus and the results ceremony. Everything is drawn to a second
// canvas over the WebGL view. Motion follows the house language: ease-out
// cubic for slides, ease-out back for pops.
//
// Adapted from the sibling title Redline GT's overlay layer; nothing is
// imported. The pace-note card and the ladder row are new to this title.

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

// A `value` of 0 means "no time recorded", so it renders as a placeholder. A
// live running clock passes live:true to get 00:00.00 instead.
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
    // Glyph advance cache keyed by font plus character. Letter-spaced labels
    // otherwise cost two measureText calls per glyph per frame.
    this._adv = new Map();
    this._font = '';
    this._vig = null;
    this._vigKey = '';
    this.nativeSpacing = 'letterSpacing' in this.ctx;
  }

  advance(ch) {
    let m = this._adv.get(this._font);
    if (!m) { m = new Map(); this._adv.set(this._font, m); }
    let w = m.get(ch);
    if (w === undefined) { w = this.ctx.measureText(ch).width; m.set(ch, w); }
    return w;
  }

  // Resolve every font size the HUD uses while the loading screen is still up,
  // so the first stage frame never pays font resolution or glyph rasterisation.
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

  zone(id, x, y, w, h, data) { this.hitZones.push({ id, x, y, w, h, data }); }
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

  text(str, x, y, size, color, align, weight, letter) {
    const c = this.ctx;
    const font = (weight || 700) + ' ' + size + 'px -apple-system, system-ui, "Segoe UI", Arial, sans-serif';
    c.font = font;
    this._font = font;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillStyle = color || '#fff';
    if (letter) {
      if (this.nativeSpacing) {
        c.letterSpacing = letter + 'px';
        // Spacing is emitted after the final glyph too, so the run measures one
        // gap wider than it draws; nudge the anchor back to keep centred and
        // right-aligned labels where they belong.
        const shift = align === 'center' ? letter / 2 : align === 'right' ? letter : 0;
        c.fillText(str, x - shift, y);
        c.letterSpacing = '0px';
        return;
      }
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

  // Display type. No font file ships with this game, so the title face is a
  // drawing treatment rather than a download: the heaviest system weight,
  // forward-raked like a competition plate, with a stencil slot cut through the
  // letterforms and a hard shadow plate behind. It is used for the wordmark and
  // every screen header, and it is what separates these menus from a stock
  // system-font UI.
  display(str, x, y, size, color, align, accent) {
    const c = this.ctx;
    const rake = -0.13;                 // forward italic rake, as a skew factor
    const track = size * 0.13;
    // The slot is a gap the glyphs are not painted into, not a bar drawn over
    // them: clipping means it only ever cuts the strokes, never the counters or
    // the spaces between letters, which is what makes it read as a stencil
    // instead of a strikethrough.
    const cut = size >= 34;
    const top = -size * 0.055, bot = size * 0.025;
    c.save();
    c.translate(x, y);
    c.transform(1, 0, rake, 1, 0, 0);
    if (cut) {
      c.beginPath();
      c.rect(-4000, -size * 1.2, 8000, size * 1.2 + top);
      c.rect(-4000, bot, 8000, size * 2);
      c.clip();
    }
    // Shadow plate: a hard offset copy, the screen-print register the treatment
    // is built on.
    this.text(str, 2.5, 3, size, 'rgba(6,5,4,0.55)', align, 900, track);
    this.text(str, 0, 0, size, color, align, 900, track);
    c.restore();

    if (accent) {
      const w = this.textWidth(str, size, 900, track);
      const sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      c.fillStyle = accent;
      c.fillRect(sx - size * 0.1, y + size * 0.5, w + size * 0.2, Math.max(2, size * 0.045));
    }
  }

  textWidth(str, size, weight, letter) {
    const font = (weight || 700) + ' ' + size + 'px -apple-system, system-ui, "Segoe UI", Arial, sans-serif';
    this.ctx.font = font;
    this._font = font;
    const s = String(str);
    let total = 0;
    for (let i = 0; i < s.length; i++) total += this.advance(s[i]) + (letter || 0);
    return total - (letter || 0);
  }

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

  chip(x, y, w, h, fill, stroke, radius) {
    const c = this.ctx;
    c.fillStyle = fill;
    this.roundRect(x, y, w, h, radius == null ? 10 : radius);
    c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.25; c.stroke(); }
  }

  bar(x, y, w, h, frac, back, fill, radius) {
    const c = this.ctx;
    const r = radius == null ? h / 2 : radius;
    c.fillStyle = back;
    this.roundRect(x, y, w, h, r); c.fill();
    if (frac > 0.001) {
      c.fillStyle = fill;
      this.roundRect(x, y, Math.max(h, w * clamp(frac, 0, 1)), h, r); c.fill();
    }
  }

  // `pressedId` is installed by the game and returns the id of the control the
  // finger is currently holding, so every button paints its own press state.
  button(id, x, y, w, h, label, opts) {
    const o = opts || {};
    const c = this.ctx;
    const accent = o.accent || '#ffc768';
    const held = !!o.pressed || (this.pressedId && this.pressedId() === id);
    const disabled = !!o.disabled;
    // Held controls sink a little and lose their lift, the touch equivalent of
    // a key travelling down.
    const sink = held ? 1.5 : 0;
    c.save();
    c.globalAlpha = disabled ? 0.4 : 1;
    // Layered panel: a soft drop shade under the plate, removed while held.
    if (!held && !disabled) {
      c.fillStyle = 'rgba(0,0,0,0.32)';
      this.roundRect(x, y + 2.5, w, h, o.radius == null ? 14 : o.radius);
      c.fill();
    }
    c.fillStyle = held ? accent : (o.solid ? accent : 'rgba(12,14,20,0.78)');
    this.roundRect(x, y + sink, w, h - sink, o.radius == null ? 14 : o.radius);
    c.fill();
    c.strokeStyle = accent;
    c.lineWidth = o.solid ? 0 : 1.8;
    if (!o.solid) c.stroke();
    const fg = (held || o.solid) ? '#100c08' : accent;
    this.text(label, x + w / 2, y + h / 2 + 0.5 + sink,
      o.size || Math.max(12, Math.min(16, w * 0.14)), fg, 'center', 800, 0.6);
    c.restore();
    if (!disabled) this.zone(id, x, y, w, h, o.data);
    return { x, y, w, h };
  }

  // Pace-note colour language. A hairpin, a jump and a fifth-gear kink used to
  // arrive on the identical card: the call carried its urgency in the audio
  // pitch only, and nothing on screen said "this one bites".
  static NOTE_STYLE = {
    hairpin: { col: '#ff7d5c', tag: 'HAIRPIN' },
    jump: { col: '#ffd166', tag: 'JUMP' },
    rocks: { col: '#ffb347', tag: 'CAUTION' },
    chicane: { col: '#ffb347', tag: 'CAUTION' },
    surface: { col: '#8fd4ff', tag: 'SURFACE' },
    turn: { col: '#e9e2d4', tag: 'CORNER' },
  };

  // Pace-note card: the co-driver's call, held for the length of the call.
  // Slides in from the left with an ease-out cubic. Beyond the slide it now
  // carries four urgency channels: a hazard colour, a direction arrow, the
  // corner grade as a pill, and a live distance countdown that flips the whole
  // card into an imminent state inside the last stretch.
  //
  // `note` is { text, next, kind, dist }. `pulse` is the reduced-motion gate.
  noteCard(x, y, w, h, t, note, accent, pulse) {
    const c = this.ctx;
    const text = String(note.text || '');
    const style = Hud.NOTE_STYLE[note.kind] || Hud.NOTE_STYLE.turn;
    const col = note.kind === 'turn' ? accent : style.col;
    const dist = note.dist || 0;
    // Imminent: the corner is close enough that the call is now the input.
    const near = dist > 0 && dist < 70 ? clamp(1 - (dist - 20) / 50, 0, 1) : (dist === 0 ? 1 : 0);
    const beat = pulse ? (0.5 + 0.5 * Math.sin(performance.now() / 95)) * near : near * 0.5;

    const dir = text.indexOf('LEFT') === 0 ? -1 : text.indexOf('RIGHT') === 0 ? 1 : 0;
    // The grade digit is the prototype's own 2/3/5; the rest of the call keeps
    // its words so nothing about the wording law changes.
    const gm = text.match(/^(?:LEFT|RIGHT) ([235])(.*)$/);
    const grade = gm ? gm[1] : '';
    // Whatever the arrow, the pill and the hazard tag already say is dropped
    // from the wording, so the card never reads "CAUTION / CAUTION ROCKS".
    let body = gm ? gm[2].trim() : text.replace(/^(LEFT|RIGHT) /, '');
    if (style.tag === 'CAUTION') body = body.replace(/^CAUTION /, '');

    const slide = (1 - EASE.outCubic(clamp(t, 0, 1))) * 34;
    const px = x - slide;
    c.save();
    c.globalAlpha = clamp(t * 1.6, 0, 1);

    // Body. The imminent state warms the fill and thickens the border.
    c.fillStyle = near > 0.02 ? 'rgba(26,14,12,0.9)' : 'rgba(10,12,18,0.86)';
    this.roundRect(px, y, w, h, 12);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 1.6 + beat * 2.2;
    c.stroke();

    // Accent bookmark on the leading edge, full height on an imminent call.
    c.fillStyle = col;
    const bmInset = 7 - beat * 5;
    this.roundRect(px + 5, y + bmInset, 3.5 + beat * 1.5, h - bmInset * 2, 2);
    c.fill();

    // Header row: hazard tag left, distance countdown right.
    this.text(style.tag, px + 16, y + 13, 11, near > 0.02 ? col : 'rgba(214,220,232,0.85)',
      'left', 900, 1.2);
    if (dist > 0) {
      this.text(Math.round(dist / 5) * 5 + ' M', px + w - 14, y + 13, 11,
        near > 0.02 ? col : 'rgba(200,208,220,0.7)', 'right', 900, 0.8);
    }

    // Call row: arrow, grade pill, wording. 14px floor, the live-call minimum.
    let cx = px + 16;
    const cy = y + h * 0.66;
    if (dir) {
      const a = 8 + beat * 1.5;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(cx + (dir > 0 ? a : 0), cy - a * 0.86);
      c.lineTo(cx + (dir > 0 ? a : 0), cy + a * 0.86);
      c.lineTo(cx + (dir > 0 ? 0 : a), cy);
      c.closePath();
      c.fill();
      cx += a + 7;
    }
    if (grade) {
      const pw = 20;
      c.fillStyle = col;
      this.roundRect(cx, cy - 10, pw, 20, 6);
      c.fill();
      this.text(grade, cx + pw / 2, cy + 0.5, 14, '#14100c', 'center', 900);
      cx += pw + 8;
    }
    if (body) {
      const size = Math.max(14, Math.min(17, w * 0.115));
      this.text(body, cx, cy, size, '#ffffff', 'left', 900, 0.6);
    }

    // The following call sits on its own plate under the card: unbacked type
    // over the stage was unreadable the moment the road went pale.
    if (note.next) {
      const nw = this.textWidth('THEN ' + note.next, 11, 800, 0.8) + 22;
      c.fillStyle = 'rgba(10,12,18,0.72)';
      this.roundRect(px + 6, y + h + 3, Math.min(nw, w - 12), 19, 6);
      c.fill();
      this.text('THEN ' + note.next, px + 17, y + h + 13, 11,
        'rgba(206,214,226,0.8)', 'left', 800, 0.8);
    }
    c.restore();
  }

  // Off-road and contact hold the vignette up for many consecutive frames, so
  // the gradient is reused whenever colour and strength repeat to within a step.
  vignette(strength, color) {
    const c = this.ctx;
    const s = Math.round(strength * 40) / 40;
    const key = (color || 'rgba(8,6,4,') + s + '|' + this.W + 'x' + this.H;
    if (key !== this._vigKey) {
      const g = c.createRadialGradient(
        this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.32,
        this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, (color || 'rgba(8,6,4,') + s + ')');
      this._vig = g;
      this._vigKey = key;
    }
    c.fillStyle = this._vig;
    c.fillRect(0, 0, this.W, this.H);
  }

  scrim(alpha) {
    const c = this.ctx;
    c.fillStyle = 'rgba(8,7,10,' + alpha + ')';
    c.fillRect(0, 0, this.W, this.H);
  }
}
