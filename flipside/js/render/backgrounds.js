// FLIPSIDE — js/render/backgrounds.js  (LANE O4)
// Painted parallax paper worlds. Everything expensive is baked once onto
// offscreen canvases and only re-baked when the viewport size (or DPR-scaled
// pixel size) changes. Per frame we do a handful of drawImage calls plus a
// couple of cheap alpha/transform tweens.
//
// Contract: drawBackground(ctx, world, timeMs, w, h)
//
// Sunside : cream sky wash, faint pencil hatching, layered doodle hills,
//           a crayon sun with slowly turning rays, drifting cut-paper clouds,
//           distant meadow detail and a baked god-ray light pass.
// Duskside: the sun composition recolored with long shadow bands and lantern
//           glow. Dawnside adds rising mist bands and dew sparkle.
// Inkside : indigo wash, paper moon with a torn crater edge, ink-splat stars,
//           slow drifting ink swirls, an aurora ribbon and a twinkle pass.
//
// Parallax is <= 3 moving layers per world and all motion is gentle: nothing
// here should compete with the board for attention.

import { COLORS } from '../config.js';

let reducedMotionState = null;

function reducedMotion() {
  if (reducedMotionState) return reducedMotionState.value;
  reducedMotionState = { value: false, media: null };
  try {
    if (typeof globalThis.matchMedia !== 'function') return false;
    const media = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionState.value = !!media.matches;
    reducedMotionState.media = media;
    const update = (event) => { reducedMotionState.value = !!event.matches; };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    else if (typeof media.addListener === 'function') media.addListener(update);
  } catch (_) {
    reducedMotionState.value = false;
  }
  return reducedMotionState.value;
}

/* ------------------------------------------------------------------ */
/* tiny deterministic rng so a re-bake at the same size looks the same */
/* ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function lerp(a, b, t) { return a + (b - a) * t; }

/* hex -> "r,g,b" for cheap rgba() strings */
function rgbOf(hex) {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3
    ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
    : s, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function mixHex(a, b, t) {
  const ar = a.replace('#', ''), br = b.replace('#', '');
  const an = parseInt(ar, 16), bn = parseInt(br, 16);
  const r = Math.round(lerp((an >> 16) & 255, (bn >> 16) & 255, t));
  const g = Math.round(lerp((an >> 8) & 255, (bn >> 8) & 255, t));
  const bl = Math.round(lerp(an & 255, bn & 255, t));
  return `rgb(${r},${g},${bl})`;
}

/* ------------------------------------------------------------------ */
/* shared: paper grain tile (baked once, reused by every world)        */
/* ------------------------------------------------------------------ */
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const S = 96;
  const c = mk(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  const rnd = mulberry32(0x9E3779B9);
  for (let i = 0; i < S * S; i++) {
    const v = rnd();
    const o = i * 4;
    d[o] = d[o + 1] = d[o + 2] = v < 0.5 ? 0 : 255;
    // very sparse, very light speckle
    d[o + 3] = v < 0.06 || v > 0.965 ? 26 : 0;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function paintGrain(g, w, h, alpha) {
  const tile = getGrainTile();
  const pat = g.createPattern(tile, 'repeat');
  if (!pat) return;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/* ------------------------------------------------------------------ */
/* SUNSIDE bakes                                                       */
/* ------------------------------------------------------------------ */

function bakeSunSky(w, h) {
  const P = COLORS.sun;
  const c = mk(w, h);
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, mixHex(P.paper, '#ffffff', 0.35));
  grad.addColorStop(0.55, P.paper);
  grad.addColorStop(1, P.panel);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // faint pencil hatching across the upper sky: two crossing sets of
  // short strokes, very light.
  const inkRgb = rgbOf(P.ink);
  const rnd = mulberry32(1337 + ((w * 7919 + h) | 0));
  g.save();
  g.lineCap = 'round';
  const step = Math.max(14, Math.round(Math.min(w, h) / 26));
  for (let pass = 0; pass < 2; pass++) {
    const ang = pass === 0 ? -0.62 : -0.30;
    g.strokeStyle = `rgba(${inkRgb},${pass === 0 ? 0.055 : 0.035})`;
    g.lineWidth = 1;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let y = -h; y < h * 1.2; y += step) {
      for (let x = -step; x < w + step; x += step * 2.1) {
        const len = step * (0.7 + rnd() * 0.9);
        const jx = x + rnd() * step * 0.5;
        const jy = y + rnd() * step * 0.5 + (x * 0.35);
        if (jy < -step || jy > h * 0.92) continue;
        g.beginPath();
        g.moveTo(jx, jy);
        g.lineTo(jx + dx * len, jy + dy * len);
        g.stroke();
      }
    }
  }
  g.restore();

  paintGrain(g, w, h, 0.5);
  return c;
}

// Crayon sun: a waxy disc with a wobbly hand-drawn edge. Rays are baked to a
// separate square sprite so we can rotate them a few degrees per minute.
function bakeSunDisc(r) {
  const S = Math.ceil(r * 2.4);
  const c = mk(S, S);
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const rnd = mulberry32(4242);

  // soft warm halo
  const halo = g.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.18);
  halo.addColorStop(0, 'rgba(242,193,78,0.30)');
  halo.addColorStop(1, 'rgba(242,193,78,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);

  // wobbly disc
  g.beginPath();
  const N = 44;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.965 + rnd() * 0.07);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  const face = g.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
  face.addColorStop(0, '#ffe9a8');
  face.addColorStop(0.6, '#f2c14e');
  face.addColorStop(1, '#e9964e');
  g.fillStyle = face;
  g.fill();

  // crayon scribble fill (short arcs inside the disc)
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(233,150,78,0.30)';
  g.lineWidth = Math.max(1.5, r * 0.055);
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a0 = rnd() * Math.PI * 2;
    const rr = r * (0.2 + rnd() * 0.8);
    g.beginPath();
    g.arc(cx, cy, rr, a0, a0 + 0.5 + rnd() * 0.9);
    g.stroke();
  }
  g.restore();

  // darker cut-edge, papercraft rule
  g.strokeStyle = 'rgba(164,106,44,0.45)';
  g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.965 + mulberry32(4242 + i)() * 0.05);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();

  return c;
}

function bakeSunRays(r) {
  const R = r * 2.05;
  const S = Math.ceil(R * 2);
  const c = mk(S, S);
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const rnd = mulberry32(909);
  g.lineCap = 'round';
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.13;
    const inner = r * (1.12 + rnd() * 0.08);
    const outer = r * (1.5 + rnd() * 0.5);
    g.strokeStyle = i % 2 ? 'rgba(242,193,78,0.34)' : 'rgba(233,150,78,0.28)';
    g.lineWidth = Math.max(2, r * (0.07 + rnd() * 0.05));
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    g.stroke();
  }
  return c;
}

// One doodle hill band: a rolling silhouette with a cut-paper top edge,
// a lighter crest line and a couple of pencil texture strokes.
function bakeHillBand(w, h, opt) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(opt.seed);
  const baseY = opt.baseY;
  const amp = opt.amp;
  const pts = [];
  const N = Math.max(6, Math.round(w / opt.wavelength));
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    const y = baseY
      - Math.sin((i / N) * Math.PI * opt.humps + opt.phase) * amp
      - rnd() * amp * 0.18;
    pts.push([x, y]);
  }

  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    g.quadraticCurveTo(x0, y0, mx, my);
  }
  g.lineTo(w, pts[pts.length - 1][1]);
  g.lineTo(w, h);
  g.closePath();

  const grad = g.createLinearGradient(0, baseY - amp, 0, h);
  grad.addColorStop(0, opt.top);
  grad.addColorStop(1, opt.bottom);
  g.fillStyle = grad;
  g.fill();

  // cut-paper crest highlight
  g.save();
  g.clip();
  g.strokeStyle = opt.crest;
  g.lineWidth = Math.max(1.5, amp * 0.09);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1] + g.lineWidth * 0.5);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    g.quadraticCurveTo(x0, y0 + g.lineWidth * 0.5, mx, my + g.lineWidth * 0.5);
  }
  g.stroke();

  // sparse doodle grass / stitch ticks
  g.strokeStyle = opt.detail;
  g.lineWidth = 1.25;
  g.lineCap = 'round';
  const ticks = Math.round(w / 46);
  for (let i = 0; i < ticks; i++) {
    const t = rnd();
    const idx = Math.min(pts.length - 1, Math.floor(t * pts.length));
    const [px, py] = pts[idx];
    const len = amp * (0.16 + rnd() * 0.2);
    g.beginPath();
    g.moveTo(px, py + amp * 0.25);
    g.lineTo(px + (rnd() - 0.5) * len, py + amp * 0.25 + len);
    g.stroke();
  }
  g.restore();

  paintGrain(g, w, h, 0.35);
  return c;
}

// A third, near-horizon layer. It is intentionally simple and low contrast:
// small cut-paper grasses give Sunside depth without competing with the board.
function bakeSunThirdLayer(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(31337 + ((w * 13 + h) | 0));
  const horizon = h * 0.70;
  g.fillStyle = 'rgba(143,191,106,0.14)';
  g.fillRect(0, horizon + h * 0.035, w, h - horizon);
  g.strokeStyle = 'rgba(74,63,51,0.16)';
  g.lineWidth = 1.25;
  g.lineCap = 'round';
  const stems = Math.max(18, Math.round(w / 13));
  for (let i = 0; i < stems; i++) {
    const x = (i / stems) * w + rnd() * 10;
    const y = horizon + rnd() * h * 0.045;
    const height = h * (0.018 + rnd() * 0.035);
    g.beginPath();
    g.moveTo(x, y + h * 0.045);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 5, y + height * 0.35, x + (rnd() - 0.5) * 8, y - height);
    g.stroke();
  }
  paintGrain(g, w, h, 0.18);
  return c;
}

// Wide, soft shafts of paper light. The layer is full-size and horizontally
// tileable so its gentle drift never needs a re-bake.
function bakeSunGodRays(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const sourceX = w * 0.78;
  const sourceY = h * 0.13;
  const bottom = h * 0.82;
  const rays = [
    [-0.24, 0.015, 'rgba(255,246,190,0.10)'],
    [-0.14, 0.022, 'rgba(255,244,180,0.075)'],
    [-0.06, 0.014, 'rgba(255,255,220,0.10)'],
    [0.05, 0.024, 'rgba(255,238,164,0.065)'],
    [0.15, 0.016, 'rgba(255,250,206,0.085)'],
    [0.26, 0.028, 'rgba(255,233,159,0.06)'],
  ];
  for (let i = 0; i < rays.length; i++) {
    const [spread, widthRatio, color] = rays[i];
    const x = sourceX + spread * w;
    const spreadAtBottom = widthRatio * w;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(sourceX - w * 0.012, sourceY);
    g.lineTo(sourceX + w * 0.012, sourceY);
    g.lineTo(x + spreadAtBottom, bottom);
    g.lineTo(x - spreadAtBottom, bottom);
    g.closePath();
    g.fill();
  }
  return c;
}

// A horizontally tileable strip of cut-paper clouds.
function bakeCloudStrip(w, h, seed, scale, alpha) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const n = Math.max(3, Math.round(w / (240 * scale)));

  function puff(cx, cy, r) {
    // draw a wrapped copy near the edges so the strip tiles seamlessly
    const offs = [0];
    if (cx < r * 3) offs.push(w);
    else if (cx > w - r * 3) offs.push(-w);
    for (const off of offs) {
      const x = cx + off;
      g.save();
      g.globalAlpha = alpha;
      // body
      g.beginPath();
      g.ellipse(x, cy, r * 1.5, r * 0.72, 0, 0, Math.PI * 2);
      g.ellipse(x - r * 0.85, cy + r * 0.1, r * 0.78, r * 0.55, 0, 0, Math.PI * 2);
      g.ellipse(x + r * 0.8, cy + r * 0.14, r * 0.68, r * 0.5, 0, 0, Math.PI * 2);
      g.ellipse(x - r * 0.1, cy - r * 0.42, r * 0.8, r * 0.6, 0, 0, Math.PI * 2);
      g.fillStyle = '#fffaf0';
      g.fill();
      // underside shadow (paper thickness)
      g.globalAlpha = alpha * 0.5;
      g.beginPath();
      g.ellipse(x, cy + r * 0.5, r * 1.42, r * 0.3, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(74,63,51,0.16)';
      g.fill();
      g.restore();
    }
  }

  for (let i = 0; i < n; i++) {
    const cx = ((i + rnd() * 0.7) / n) * w;
    const cy = h * (0.18 + rnd() * 0.6);
    const r = (16 + rnd() * 20) * scale;
    puff(cx, cy, r);
  }
  return c;
}

let vignetteLayer = null;

function bakeVignette(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const vg = g.createRadialGradient(
    w * 0.5, h * 0.5, Math.min(w, h) * 0.32,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.78,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  // One restrained edge treatment across all four pages. The paper palette
  // underneath supplies the mood; sharing this canvas keeps the pass cheap
  // during fold crossfades as well.
  vg.addColorStop(1, 'rgba(28,32,38,0.21)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}

function getVignette(w, h) {
  if (vignetteLayer && vignetteLayer.width === w && vignetteLayer.height === h) {
    return vignetteLayer;
  }
  vignetteLayer = bakeVignette(w, h);
  return vignetteLayer;
}

function bakeSun(w, h) {
  const P = COLORS.sun;
  const sky = bakeSunSky(w, h);

  const sunR = Math.max(26, Math.min(w, h) * 0.085);
  const disc = bakeSunDisc(sunR);
  const rays = bakeSunRays(sunR);
  const third = bakeSunThirdLayer(w, h);
  const lightPass = bakeSunGodRays(w, h);
  const sunX = w * 0.78, sunY = h * 0.15;

  const clouds = [
    { img: bakeCloudStrip(w, h * 0.34, 21, 0.85, 0.55), y: h * 0.06, speed: 0.0035 },
    { img: bakeCloudStrip(w, h * 0.30, 77, 1.25, 0.85), y: h * 0.16, speed: 0.0072 },
  ];

  const hillH = Math.max(90, h * 0.42);
  const hills = [
    {
      img: bakeHillBand(w, hillH, {
        seed: 5, baseY: hillH * 0.42, amp: hillH * 0.20, wavelength: 120,
        humps: 3.2, phase: 0.4,
        top: mixHex(P.panel, '#8fbf6a', 0.32),
        bottom: mixHex(P.panel, '#8fbf6a', 0.15),
        crest: 'rgba(255,255,255,0.35)',
        detail: 'rgba(74,63,51,0.16)',
      }),
      y: h - hillH * 0.92, speed: 0.0016, amp: 4,
    },
    {
      img: bakeHillBand(w, hillH, {
        seed: 19, baseY: hillH * 0.55, amp: hillH * 0.26, wavelength: 170,
        humps: 2.1, phase: 2.0,
        top: mixHex(P.panel, '#8fbf6a', 0.55),
        bottom: mixHex(P.ink, '#8fbf6a', 0.62),
        crest: 'rgba(255,255,255,0.28)',
        detail: 'rgba(74,63,51,0.22)',
      }),
      y: h - hillH * 0.62, speed: 0.0030, amp: 7,
    },
  ];

  return {
    kind: 'sun', composition: 'sun', w, h, sky, disc, rays, sunR, sunX, sunY, clouds, hills,
    third, thirdY: 0, thirdSpeed: 0.00125, thirdAmp: 5,
    lightPass, lightSpeed: 0.00042, lightAlpha: 0.82,
    vignette: getVignette(w, h),
  };
}

/* ------------------------------------------------------------------ */
/* INKSIDE bakes                                                       */
/* ------------------------------------------------------------------ */

function bakeInkWash(w, h) {
  const P = COLORS.ink;
  const c = mk(w, h);
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, mixHex(P.paper, '#000010', 0.35));
  grad.addColorStop(0.5, P.paper);
  grad.addColorStop(1, mixHex(P.panel, '#3a3f66', 0.35));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // wet indigo wash blooms: a few big soft radial pools
  const rnd = mulberry32(2718 + ((w * 31 + h) | 0));
  for (let i = 0; i < 7; i++) {
    const cx = rnd() * w, cy = rnd() * h;
    const r = Math.min(w, h) * (0.18 + rnd() * 0.34);
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const tint = i % 2 ? '90,120,220' : '60,70,150';
    rg.addColorStop(0, `rgba(${tint},0.16)`);
    rg.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = rg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  paintGrain(g, w, h, 0.55);
  return c;
}

// One bank of ink-splat stars. Splats are a tiny blot with 2-3 satellites,
// so they read as ink rather than as glow dots.
function bakeStarBank(w, h, seed, count, sizeScale) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.86;
    const r = (0.9 + rnd() * 1.7) * sizeScale;
    g.save();
    // faint bloom
    const rg = g.createRadialGradient(x, y, 0, x, y, r * 4.2);
    rg.addColorStop(0, 'rgba(207,214,255,0.55)');
    rg.addColorStop(1, 'rgba(140,180,255,0)');
    g.fillStyle = rg;
    g.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);
    // core blot
    g.fillStyle = 'rgba(226,232,255,0.92)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // satellite specks
    const sat = 1 + Math.floor(rnd() * 3);
    for (let s = 0; s < sat; s++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (1.8 + rnd() * 2.6);
      g.globalAlpha = 0.5 + rnd() * 0.35;
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.22 + rnd() * 0.3), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  return c;
}

function bakeMoon(r) {
  const S = Math.ceil(r * 3);
  const c = mk(S, S);
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const rnd = mulberry32(64);

  // moonlight halo
  const halo = g.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.45);
  halo.addColorStop(0, 'rgba(140,180,255,0.22)');
  halo.addColorStop(1, 'rgba(140,180,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);

  // torn-paper disc
  g.beginPath();
  const N = 52;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.96 + rnd() * 0.075);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  const face = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  face.addColorStop(0, '#f2f4ff');
  face.addColorStop(0.65, '#d8ddf6');
  face.addColorStop(1, '#aab2d8');
  g.fillStyle = face;
  g.fill();

  g.save();
  g.clip();
  // craters as soft paper dents
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * rnd() * 0.72;
    const cr = r * (0.07 + rnd() * 0.16);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const cg = g.createRadialGradient(x - cr * 0.3, y - cr * 0.3, 0, x, y, cr);
    cg.addColorStop(0, 'rgba(120,128,170,0.30)');
    cg.addColorStop(1, 'rgba(120,128,170,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.arc(x, y, cr, 0, Math.PI * 2);
    g.fill();
  }
  // shadow terminator on the lower right
  const term = g.createLinearGradient(cx, cy - r, cx + r, cy + r);
  term.addColorStop(0, 'rgba(27,30,52,0)');
  term.addColorStop(1, 'rgba(27,30,52,0.45)');
  g.fillStyle = term;
  g.fillRect(0, 0, S, S);
  g.restore();

  return c;
}

// Slow drifting ink swirls: long, thin, low-alpha spirals on a transparent
// layer we translate a few pixels per second.
function bakeInkSwirls(w, h, seed) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.lineCap = 'round';
  const n = Math.max(4, Math.round((w * h) / 90000));
  for (let i = 0; i < n; i++) {
    const cx = rnd() * w;
    const cy = h * (0.1 + rnd() * 0.8);
    const turns = 1.6 + rnd() * 1.6;
    const r0 = Math.min(w, h) * (0.03 + rnd() * 0.05);
    const r1 = r0 * (2.4 + rnd() * 2.2);
    const dir = rnd() < 0.5 ? 1 : -1;
    const a0 = rnd() * Math.PI * 2;
    g.strokeStyle = i % 2
      ? 'rgba(140,180,255,0.10)'
      : 'rgba(90,110,200,0.12)';
    g.lineWidth = 1 + rnd() * 2.2;
    g.beginPath();
    const steps = 60;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const a = a0 + dir * t * Math.PI * 2 * turns;
      const rr = lerp(r0, r1, t);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.62;
      if (s === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

// A broad, translucent ribbon gives the night page a third depth plane. Its
// curves are baked once; only the strip's horizontal drift changes at runtime.
function bakeAuroraRibbon(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const bands = [
    { y: h * 0.22, amp: h * 0.055, width: h * 0.075, color: '104,232,220', alpha: 0.11 },
    { y: h * 0.30, amp: h * 0.042, width: h * 0.055, color: '168,130,255', alpha: 0.08 },
  ];
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const grad = g.createLinearGradient(0, band.y - band.width, 0, band.y + band.width);
    grad.addColorStop(0, `rgba(${band.color},0)`);
    grad.addColorStop(0.5, `rgba(${band.color},${band.alpha})`);
    grad.addColorStop(1, `rgba(${band.color},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-w * 0.08, band.y);
    g.bezierCurveTo(w * 0.16, band.y - band.amp, w * 0.28, band.y + band.amp, w * 0.50, band.y);
    g.bezierCurveTo(w * 0.72, band.y - band.amp, w * 0.86, band.y + band.amp, w * 1.08, band.y - h * 0.01);
    g.lineTo(w * 1.08, band.y + band.width);
    g.bezierCurveTo(w * 0.86, band.y + band.amp + band.width, w * 0.72, band.y - band.amp + band.width, w * 0.50, band.y + band.width);
    g.bezierCurveTo(w * 0.28, band.y + band.amp + band.width, w * 0.16, band.y - band.amp + band.width, -w * 0.08, band.y + band.width);
    g.closePath();
    g.fill();
  }
  return c;
}

// Larger four-point sparkles are kept on their own baked layer so their
// twinkle is an alpha pulse, not a per-frame star redraw.
function bakeInkTwinklePass(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(6161 + ((w * 23 + h) | 0));
  const count = Math.max(12, Math.min(28, Math.round(w / 24)));
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.72;
    const r = 1.1 + rnd() * 2.1;
    const arm = r * (3.2 + rnd() * 2.8);
    const glow = g.createRadialGradient(x, y, 0, x, y, arm * 1.5);
    glow.addColorStop(0, 'rgba(207,230,255,0.36)');
    glow.addColorStop(1, 'rgba(140,180,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - arm * 1.5, y - arm * 1.5, arm * 3, arm * 3);
    g.strokeStyle = 'rgba(235,242,255,0.72)';
    g.lineWidth = Math.max(0.8, r * 0.52);
    g.beginPath();
    g.moveTo(x - arm, y);
    g.lineTo(x + arm, y);
    g.moveTo(x, y - arm);
    g.lineTo(x, y + arm);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function bakeInk(w, h) {
  const wash = bakeInkWash(w, h);
  const density = Math.max(24, Math.round((w * h) / 5200));
  const stars = [
    bakeStarBank(w, h, 101, Math.round(density * 0.5), 0.85),
    bakeStarBank(w, h, 202, Math.round(density * 0.32), 1.15),
    bakeStarBank(w, h, 303, Math.round(density * 0.20), 1.5),
  ];
  const moonR = Math.max(24, Math.min(w, h) * 0.078);
  const swirls = [
    bakeInkSwirls(w, h, 55),
    bakeInkSwirls(w, h, 88),
  ];
  const third = bakeAuroraRibbon(w, h);
  const lightPass = bakeInkTwinklePass(w, h);
  return {
    kind: 'ink', composition: 'ink', w, h, wash, stars, swirls,
    moon: bakeMoon(moonR), moonR,
    moonX: w * 0.24, moonY: h * 0.14,
    third, thirdY: 0, thirdSpeed: 0.00055, thirdAmp: h * 0.008,
    lightPass, lightSpeed: 0.00078, lightAlpha: 0.86,
    vignette: getVignette(w, h),
  };
}

/* ------------------------------------------------------------------ */
/* DUSK / DAWN tonal day variants                                     */
/* ------------------------------------------------------------------ */

function bakeMoodOverlay(w, h, world) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const dusk = world === 'dusk';
  const grad = g.createLinearGradient(0, 0, 0, h);
  if (dusk) {
    grad.addColorStop(0, 'rgba(209,105,91,0.12)');
    grad.addColorStop(0.42, 'rgba(240,171,124,0.10)');
    grad.addColorStop(1, 'rgba(73,46,88,0.27)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.52, 'rgba(188,231,209,0.09)');
    grad.addColorStop(1, 'rgba(80,139,121,0.13)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  if (dusk) {
    g.fillStyle = 'rgba(104,54,74,0.10)';
    g.fillRect(0, h * 0.49, w, h * 0.025);
    g.fillStyle = 'rgba(78,47,78,0.09)';
    g.fillRect(0, h * 0.66, w, h * 0.045);
  } else {
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(0, h * 0.36, w, h * 0.055);
    g.fillStyle = 'rgba(161,207,187,0.12)';
    g.fillRect(0, h * 0.57, w, h * 0.075);
  }
  return c;
}

// Duskside's third depth plane: stretched shadow shapes that feel like the
// last long rays of evening falling across the paper landscape.
function bakeDuskShadowBands(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const bands = [
    { y: h * 0.39, spread: h * 0.07, color: 'rgba(91,49,73,0.075)' },
    { y: h * 0.53, spread: h * 0.11, color: 'rgba(74,44,74,0.09)' },
    { y: h * 0.68, spread: h * 0.14, color: 'rgba(58,39,67,0.105)' },
  ];
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const grad = g.createLinearGradient(0, band.y - band.spread, 0, band.y + band.spread);
    grad.addColorStop(0, 'rgba(58,39,67,0)');
    grad.addColorStop(0.5, band.color);
    grad.addColorStop(1, 'rgba(58,39,67,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-w * 0.12, band.y - band.spread * 0.3);
    g.lineTo(w * 1.08, band.y - band.spread * 0.9);
    g.lineTo(w * 1.08, band.y + band.spread * 0.28);
    g.lineTo(-w * 0.12, band.y + band.spread * 0.9);
    g.closePath();
    g.fill();
  }
  return c;
}

function bakeLanterns(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(5150 + ((w * 17 + h) | 0));
  for (let i = 0; i < 7; i += 1) {
    const x = w * (0.08 + rnd() * 0.84);
    const y = h * (0.16 + rnd() * 0.34);
    const r = Math.max(4, Math.min(w, h) * (0.012 + rnd() * 0.012));
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 6.5);
    glow.addColorStop(0, 'rgba(255,202,105,0.24)');
    glow.addColorStop(0.38, 'rgba(244,151,86,0.12)');
    glow.addColorStop(1, 'rgba(244,151,86,0)');
    g.fillStyle = glow;
    g.fillRect(x - r * 6.5, y - r * 6.5, r * 13, r * 13);
    g.strokeStyle = 'rgba(90,58,51,0.26)';
    g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath();
    g.moveTo(x, y - r * 2.8);
    g.lineTo(x, y - r * 0.9);
    g.stroke();
    g.fillStyle = i % 2 ? 'rgba(240,179,69,0.52)' : 'rgba(230,107,83,0.48)';
    g.beginPath();
    g.moveTo(x - r, y - r * 0.8);
    g.quadraticCurveTo(x - r * 1.15, y + r * 0.8, x, y + r * 1.1);
    g.quadraticCurveTo(x + r * 1.15, y + r * 0.8, x + r, y - r * 0.8);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(90,58,51,0.34)';
    g.stroke();
  }
  return c;
}

function bakeMist(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(7070 + ((w * 19 + h) | 0));
  for (let i = 0; i < 5; i += 1) {
    const y = h * (0.34 + i * 0.12) + rnd() * h * 0.035;
    const grad = g.createLinearGradient(0, y, w, y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.19)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, y - h * 0.035, w, h * 0.07);
  }
  g.strokeStyle = 'rgba(47,74,66,0.15)';
  g.lineWidth = 1.1;
  g.lineCap = 'round';
  for (let i = 0; i < 14; i += 1) {
    const x = rnd() * w;
    const y = h * (0.25 + rnd() * 0.52);
    const r = 1.5 + rnd() * 2.5;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y + r);
    g.lineTo(x - r * 0.7, y + r * 2.2);
    g.moveTo(x, y + r);
    g.lineTo(x + r * 0.7, y + r * 2.2);
    g.stroke();
  }
  return c;
}

function bakeDewSparkles(w, h) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(8080 + ((w * 29 + h) | 0));
  const count = Math.max(16, Math.min(34, Math.round(w / 18)));
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = h * (0.32 + rnd() * 0.48);
    const r = 1 + rnd() * 2.4;
    const halo = g.createRadialGradient(x, y, 0, x, y, r * 4.2);
    halo.addColorStop(0, 'rgba(238,255,247,0.46)');
    halo.addColorStop(1, 'rgba(190,239,216,0)');
    g.fillStyle = halo;
    g.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);
    g.fillStyle = 'rgba(248,255,250,0.78)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.60)';
    g.lineWidth = Math.max(0.8, r * 0.42);
    g.beginPath();
    g.moveTo(x - r * 2.4, y);
    g.lineTo(x + r * 2.4, y);
    g.moveTo(x, y - r * 2.4);
    g.lineTo(x, y + r * 2.4);
    g.stroke();
  }
  return c;
}

function bakeDusk(w, h) {
  const base = bakeSun(w, h);
  return {
    ...base,
    kind: 'dusk',
    world: 'dusk',
    moodOverlay: bakeMoodOverlay(w, h, 'dusk'),
    third: bakeDuskShadowBands(w, h), thirdY: 0, thirdSpeed: 0.00026, thirdAmp: 4,
    lightPass: bakeLanterns(w, h), lightSpeed: 0.00034, lightAlpha: 0.86,
    vignette: getVignette(w, h),
  };
}

function bakeDawn(w, h) {
  const base = bakeSun(w, h);
  return {
    ...base,
    kind: 'dawn',
    world: 'dawn',
    moodOverlay: bakeMoodOverlay(w, h, 'dawn'),
    third: bakeMist(w, h), thirdY: 0, thirdSpeed: 0.00040, thirdAmp: h * 0.012,
    lightPass: bakeDewSparkles(w, h), lightSpeed: 0.00062, lightAlpha: 0.82,
    vignette: getVignette(w, h),
  };
}

/* ------------------------------------------------------------------ */
/* cache                                                               */
/* ------------------------------------------------------------------ */

const cache = { sun: null, dusk: null, ink: null, dawn: null };

function layersFor(world, w, h) {
  const key = cache[world];
  if (key && key.w === w && key.h === h) return key;
  const built = world === 'ink' ? bakeInk(w, h)
    : (world === 'dusk' ? bakeDusk(w, h)
      : (world === 'dawn' ? bakeDawn(w, h) : bakeSun(w, h)));
  cache[world] = built;
  return built;
}

/**
 * Discard cached layers (both worlds). Optional utility — the cache also
 * self-invalidates whenever drawBackground is called at a new size.
 */
export function invalidateBackgrounds() {
  cache.sun = null;
  cache.dusk = null;
  cache.ink = null;
  cache.dawn = null;
  vignetteLayer = null;
}

/* wrap-tiled horizontal draw of a full-width layer */
function drawWrapped(ctx, img, x, y, w) {
  let ox = x % w;
  if (ox > 0) ox -= w;
  ctx.drawImage(img, ox, y);
  ctx.drawImage(img, ox + w, y);
}

/* ------------------------------------------------------------------ */
/* the per-frame paint                                                 */
/* ------------------------------------------------------------------ */

/**
 * Paint the parallax paper world behind the board.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'sun'|'dusk'|'ink'|'dawn'} world
 * @param {number} timeMs  game time (monotonic, ms)
 * @param {number} w  logical width to fill
 * @param {number} h  logical height to fill
 */
export function drawBackground(ctx, world, timeMs, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const t = reducedMotion() ? 0 : (timeMs || 0);
  const normalizedWorld = world === 'dusk' || world === 'ink' || world === 'dawn' ? world : 'sun';
  const L = layersFor(normalizedWorld, w, h);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;

  if (L.composition === 'sun') {
    ctx.drawImage(L.sky, 0, 0);

    // crayon sun: rays turn about one full revolution every ~4 minutes,
    // the disc breathes a hair.
    const bob = Math.sin(t * 0.00035) * L.sunR * 0.05;
    ctx.save();
    ctx.translate(L.sunX, L.sunY + bob);
    ctx.rotate(t * 0.000026);
    ctx.drawImage(L.rays, -L.rays.width / 2, -L.rays.height / 2);
    ctx.restore();
    ctx.drawImage(L.disc, L.sunX - L.disc.width / 2, L.sunY + bob - L.disc.height / 2);

    // two cloud strips at different speeds (far slower than near)
    for (let i = 0; i < L.clouds.length; i++) {
      const c = L.clouds[i];
      drawWrapped(ctx, c.img, t * c.speed, c.y, w);
    }

    // hills: gentle horizontal sway, near band swings wider
    for (let i = 0; i < L.hills.length; i++) {
      const hb = L.hills[i];
      const sway = Math.sin(t * hb.speed * 0.35) * hb.amp;
      ctx.drawImage(hb.img, sway - hb.amp, hb.y);
    }

    // Third parallax plane: a quiet foreground meadow or, for the tonal
    // variants, their baked shadow/mist treatment.
    if (L.third) {
      const y = L.thirdY + Math.sin(t * 0.00011 + 0.8) * L.thirdAmp;
      drawWrapped(ctx, L.third, t * L.thirdSpeed, y, w);
    }
  } else {
    ctx.drawImage(L.wash, 0, 0);

    // Inkside's aurora is the third parallax plane, behind the stars and moon.
    ctx.save();
    ctx.globalAlpha = 0.86;
    drawWrapped(ctx, L.third, t * L.thirdSpeed, Math.sin(t * 0.00009) * L.thirdAmp, w);
    ctx.restore();

    // ink swirls drift in opposite directions, very slowly
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawWrapped(ctx, L.swirls[0], t * 0.0022, Math.sin(t * 0.00013) * h * 0.012, w);
    ctx.globalAlpha = 0.65;
    drawWrapped(ctx, L.swirls[1], -t * 0.0034, Math.cos(t * 0.00017) * h * 0.016, w);
    ctx.restore();

    // three star banks twinkling out of phase; alpha only, no re-bake
    for (let i = 0; i < L.stars.length; i++) {
      const twinkle = i === 0
        ? 0.62 + 0.34 * Math.sin(t * 0.0019)
        : (i === 1
          ? 0.58 + 0.38 * Math.sin(t * 0.0013 + 2.1)
          : 0.66 + 0.30 * Math.sin(t * 0.0009 + 4.3));
      const drift = i === 0 ? t * 0.0006 : (i === 1 ? t * 0.0011 : t * 0.0017);
      ctx.globalAlpha = twinkle;
      drawWrapped(ctx, L.stars[i], drift, 0, w);
    }
    ctx.globalAlpha = 1;

    // paper moon with a slow bob
    const bob = Math.sin(t * 0.00028) * L.moonR * 0.06;
    ctx.drawImage(L.moon, L.moonX - L.moon.width / 2, L.moonY + bob - L.moon.height / 2);
  }

  // Every world gets one baked light pass. Its only live animation is a
  // restrained alpha shimmer and a sub-pixel parallax drift.
  if (L.lightPass) {
    ctx.save();
    const pulse = 0.94 + 0.06 * Math.sin(t * 0.00043 + 1.1);
    ctx.globalAlpha = L.lightAlpha * pulse;
    drawWrapped(ctx, L.lightPass, t * L.lightSpeed, Math.cos(t * 0.00007) * h * 0.006, w);
    ctx.restore();
  }

  if (L.moodOverlay) ctx.drawImage(L.moodOverlay, 0, 0);

  // shared vignette is baked with the size-specific world layers.
  ctx.drawImage(L.vignette, 0, 0);

  ctx.restore();
}

export default drawBackground;
