// hm2_background.js - baked, layered deep-space backdrop for Horde Meridian 2.
// ES5, no deps. Loads after hm2_world.js (window.HM2_WORLD). Exposes window.HM2_BACKGROUND.
//
// DEPTH BUDGET: game.js owns depths -100 (ground) up through -79 (region walls).
// Everything here stays at or below -110 (the world probe isolates the
// backdrop as "depth <= -110"). Back to front:
//   deep star field     depth -140  parallax 0.03  (tile, region tinted)
//   far features        depth -136  (distant galaxy / small planet, per region)
//   nebula (2 sprites)  depth -130  parallax 0.10  (ADD, baked per region, crossfaded)
//   hero features       depth -125  (planet, black hole, galaxy, giant, pulsar)
//   mid wisps + stars   depth -120  parallax 0.22  (ADD, region tinted)
//   near glow stars     depth -112  parallax 0.45  (ADD, region tinted)
//   twinkle glints      depth -111  (pooled images, sine alpha)
//   dust motes          depth -110  parallax 0.60
//
// All layers are screen-locked (scrollFactor 0, flagged _hmWorld so game.js
// keeps them on the world camera) and scroll through tilePosition. The old
// version used scrollFactor 0.05..0.8 AND tilePosition, so the layers slid
// off screen once the camera left the origin, and the whole stack sat under
// game.js's opaque ground tile anyway.
//
// DETERMINISM: every texture is baked from a private integer hash / LCG,
// never Math.random and never game.js srand, so the sim random streams are
// untouched. Animation is driven by an internal clock fed from dt.
//
// LUMINANCE: the world probe needs (darkest enemy/projectile tint luminance
// ~0.268) - (mean backdrop luminance) >= 0.18, so the mean must stay under
// ~0.088 on a 390x844 view. Colour is spent on saturated reds, blues and
// violets (low Rec.709 weight) and concentrated in clouds and hero objects,
// keeping the average near 0.05-0.07 while the frame reads as rich colour.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HM2_BACKGROUND = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var TEX_CACHE = {};
  var TAU = Math.PI * 2;

  function luminance(r, g, b) {
    return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  }

  function lerpColor(a, b, t) {
    var ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    var br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    var rr = Math.round(ar + (br - ar) * t);
    var rg = Math.round(ag + (bg - ag) * t);
    var rb = Math.round(ab + (bb - ab) * t);
    return (rr << 16) | (rg << 8) | rb;
  }

  // Private deterministic PRNG (never Math.random, never game.js srand).
  function makeRand(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s % 10000) / 10000;
    };
  }

  function hash2(ix, iy, seed) {
    var h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Periodic value noise: lattice wraps at `period`, so textures tile.
  function vnoise(x, y, period, seed) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = x - x0, fy = y - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var ix0 = ((x0 % period) + period) % period, iy0 = ((y0 % period) + period) % period;
    var ix1 = (ix0 + 1) % period, iy1 = (iy0 + 1) % period;
    var a = hash2(ix0, iy0, seed), b = hash2(ix1, iy0, seed);
    var c = hash2(ix0, iy1, seed), d = hash2(ix1, iy1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // u, v in [0,1) (any real value wraps). Returns ~[0,1].
  function fbm(u, v, period, oct, seed) {
    var sum = 0, amp = 0.5, norm = 0, p = period;
    for (var o = 0; o < oct; o++) {
      sum += amp * vnoise(u * p, v * p, p, seed + o * 131);
      norm += amp; amp *= 0.5; p *= 2;
    }
    return sum / norm;
  }

  function smooth(e0, e1, x) {
    var t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  function rgb(c) { return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]; }
  function css(c, a) {
    return 'rgba(' + ((c >> 16) & 0xff) + ',' + ((c >> 8) & 0xff) + ',' + (c & 0xff) + ',' + a + ')';
  }

  // ---------------------------------------------------------------- art ----
  // Per-region art direction. Keys match HM2_WORLD.REGIONS / hm_data REGIONS.
  // neb: [colourA, colourB, hot core], gain scales nebula brightness,
  // lanes = dark dust-lane strength. stars/mid/near/dust are layer tints.
  // features: hero objects placed relative to the view (fx, fy are fractions
  // of view width/height from centre, size is a fraction of the short side).
  var ART = {
    'aurelion-graveyard': {
      seed: 11, neb: [0x7a2350, 0xb8561f, 0xffb47e], gain: 0.62, lanes: 0.55, lum: 0.018,
      stars: 0xffe6d8, mid: 0xd9829a, near: 0xffc9a8, dust: 0xffb89a,
      features: [
        { tex: 'ringed', fx: 0.30, fy: -0.27, size: 0.85, alpha: 1, par: 0.020, spin: 0, tint: 0x9a8890 },
        { tex: 'galaxy', fx: -0.34, fy: 0.30, size: 0.40, alpha: 0.55, par: 0.008, spin: 0.01, tint: 0xffd2b0, add: true }
      ]
    },
    'void-rift': {
      seed: 23, neb: [0x2a1470, 0x6a1f9a, 0xc7a8ff], gain: 0.70, lanes: 0.8, lum: 0.018,
      stars: 0xd8d0ff, mid: 0x9b7cff, near: 0xc8b8ff, dust: 0xa89aff,
      features: [
        { tex: 'blackhole', fx: -0.18, fy: -0.24, size: 1.2, alpha: 0.6, par: 0.018, spin: 0, pulse: 0.5 },
        { tex: 'galaxy', fx: 0.36, fy: 0.34, size: 0.34, alpha: 0.5, par: 0.008, spin: -0.012, tint: 0xc0b0ff, add: true }
      ]
    },
    'meridian-verge': {
      seed: 37, neb: [0x1446a0, 0x3a2e9a, 0x9ad8ff], gain: 0.6, lanes: 0.6, cover: 0.32, lum: 0.022,
      stars: 0xd6f2ff, mid: 0x5fb8e8, near: 0xbfefff, dust: 0x9fe0ff,
      features: [
        { tex: 'galaxy', fx: 0.24, fy: -0.22, size: 1.25, alpha: 0.7, par: 0.016, spin: 0.018, add: true },
        { tex: 'moon', fx: -0.33, fy: 0.31, size: 0.26, alpha: 1, par: 0.028, spin: 0 }
      ]
    },
    'ember-drift': {
      seed: 53, neb: [0x7a140c, 0xa84414, 0xffa24a], gain: 0.72, lanes: 0.65,
      stars: 0xffe0c8, mid: 0xff7a4a, near: 0xffc090, dust: 0xffa070,
      features: [
        { tex: 'giant', fx: -0.46, fy: -0.40, size: 1.35, alpha: 0.5, par: 0.012, spin: 0.004, add: true, pulse: 0.35 },
        { tex: 'rock', fx: 0.30, fy: 0.30, size: 0.30, alpha: 1, par: 0.03, spin: 0 }
      ]
    },
    'crystal-shoals': {
      seed: 71, neb: [0x163c96, 0x2a6f9c, 0xc6f4ff], gain: 0.56, lanes: 0.5, accent: 0x5a2a92, lum: 0.016,
      stars: 0xe0f8ff, mid: 0x7fc8f0, near: 0xd0f4ff, dust: 0xb0e8ff,
      features: [
        { tex: 'pulsar', fx: 0.30, fy: -0.30, size: 1.3, alpha: 0.35, par: 0.012, spin: 0.55, add: true },
        { tex: 'ice', fx: -0.30, fy: 0.32, size: 0.42, alpha: 1, par: 0.022, spin: 0, tint: 0x8a9ab0 }
      ]
    },
    'solar-crown': {
      seed: 89, neb: [0x7a4a0c, 0x9a2e14, 0xffd67a], gain: 0.62, lanes: 0.55,
      stars: 0xfff0d0, mid: 0xffb860, near: 0xffe0a0, dust: 0xffd090,
      features: [
        { tex: 'sun', fx: 0.46, fy: -0.42, size: 1.35, alpha: 0.6, par: 0.012, spin: 0.004, add: true, pulse: 0.3 },
        { tex: 'galaxy', fx: -0.34, fy: 0.32, size: 0.36, alpha: 0.5, par: 0.008, spin: 0.01, tint: 0xffe0b0, add: true }
      ]
    }
  };
  var DEFAULT_ART = ART['meridian-verge'];
  // Mean-luminance targets for the baked tiles (see normalizeLum) and the
  // mid layer alpha. Budget on a 390x844 view: nebula ~0.02, wisps ~0.012,
  // hero art ~0.02, stars ~0.01. Clean backdrop measures 0.069-0.075 per
  // region, leaving headroom under the probe ceiling (~0.088) for the
  // foreground bleed its isolation lets through under load. art.lum
  // overrides NEB_LUM per region.
  var NEB_LUM = 0.024;
  var WISP_LUM = 0.05;
  var MID_ALPHA = 0.4;

  // ------------------------------------------------------- canvas bakers ----
  function canBake(scene) {
    return typeof document !== 'undefined' && scene && scene.textures &&
      typeof scene.textures.addCanvas === 'function' && typeof scene.textures.exists === 'function';
  }

  function bakeCanvas(scene, key, w, h, drawFn) {
    if (TEX_CACHE[key] && scene.textures.exists(key)) return key;
    if (scene.textures.exists(key)) { TEX_CACHE[key] = true; return key; }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    scene.textures.addCanvas(key, c);
    TEX_CACHE[key] = true;
    return key;
  }

  // Draws fn(x, y) at every wrap offset that could touch the tile, so glows
  // near an edge continue seamlessly on the opposite edge.
  function wrapDraw(size, x, y, r, fn) {
    for (var ox = -1; ox <= 1; ox++) {
      for (var oy = -1; oy <= 1; oy++) {
        var px = x + ox * size, py = y + oy * size;
        if (px + r < 0 || py + r < 0 || px - r > size || py - r > size) continue;
        fn(px, py);
      }
    }
  }

  function glowDot(ctx, x, y, r, color, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(color, a));
    g.addColorStop(0.25, css(color, a * 0.35));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  var STAR_COLORS = [0xffffff, 0xdfe9ff, 0xc4d6ff, 0xfff4e0, 0xffe2c0, 0xffd0b0];

  function bakeStarField(scene) {
    return bakeCanvas(scene, 'hm2bg_stars', 512, 512, function (ctx, S) {
      var rand = makeRand(1301);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, S, S);
      for (var i = 0; i < 1500; i++) {
        var x = rand() * S, y = rand() * S, k = rand();
        var col = STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)];
        if (k < 0.86) {
          ctx.fillStyle = css(col, 0.22 + rand() * 0.5);
          var sz = rand() < 0.7 ? 1 : 1.5;
          ctx.fillRect(Math.floor(x), Math.floor(y), sz, sz);
        } else if (k < 0.985) {
          ctx.fillStyle = css(col, 0.55 + rand() * 0.4);
          ctx.beginPath(); ctx.arc(x, y, 0.8 + rand() * 0.6, 0, TAU); ctx.fill();
        } else {
          var gr = 4 + rand() * 5, ga = 0.5 + rand() * 0.4;
          wrapDraw(S, x, y, gr, function (px, py) {
            glowDot(ctx, px, py, gr, col, ga);
            ctx.fillStyle = css(0xffffff, 0.95);
            ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
          });
        }
      }
    });
  }

  // Per-pixel textures are baked a few rows per frame (see JOBS below), so
  // these return a row function rather than drawing synchronously.
  function nebulaRows(art) {
    var A = rgb(art.neb[0]), B = rgb(art.neb[1]), H = rgb(art.neb[2]);
    var C = art.accent != null ? rgb(art.accent) : null;
    var sd = art.seed * 1000, gain = art.gain, lanesK = art.lanes;
    var c0 = art.cover != null ? art.cover : 0.38;
    return function (y, S, d) {
      var v = y / S;
      for (var x = 0; x < S; x++) {
        var u = x / S;
        var q1 = fbm(u, v, 3, 3, sd + 1);
        var q2 = fbm(u + 0.37, v + 0.11, 3, 3, sd + 2);
        var den = fbm(u + 0.42 * (q1 - 0.5), v + 0.42 * (q2 - 0.5), 3, 4, sd + 3);
        var dens = smooth(c0, c0 + 0.4, den);
        dens = dens * Math.sqrt(dens);
        var lane = smooth(0.50, 0.66, fbm(u + 0.2 * q2, v, 5, 3, sd + 4));
        dens *= 1 - lanesK * lane * 0.85;
        var t = smooth(0.30, 0.70, fbm(u, v, 2, 2, sd + 5));
        var hot = dens * dens * dens * dens;
        var base = 0.05 * q1;
        var r = (A[0] + (B[0] - A[0]) * t) * (dens + base) + H[0] * hot * 0.85;
        var g = (A[1] + (B[1] - A[1]) * t) * (dens + base) + H[1] * hot * 0.85;
        var b = (A[2] + (B[2] - A[2]) * t) * (dens + base) + H[2] * hot * 0.85;
        if (C) {
          var ca = smooth(0.55, 0.8, q2) * 0.6;
          r += C[0] * ca; g += C[1] * ca; b += C[2] * ca;
        }
        var o = (y * S + x) * 4;
        d[o] = Math.min(255, r * gain); d[o + 1] = Math.min(255, g * gain);
        d[o + 2] = Math.min(255, b * gain); d[o + 3] = 255;
      }
    };
  }

  // Grey ridged filaments plus mid-distance stars; tinted per region.
  function wispRows(y, S, d) {
    var v = y / S;
    for (var x = 0; x < S; x++) {
      var u = x / S;
      var w = fbm(u, v, 3, 2, 9101);
      var n = fbm(u + 0.3 * w, v + 0.3 * w, 4, 4, 9202);
      var ridge = 1 - Math.abs(2 * n - 1);
      ridge = ridge * ridge * ridge * ridge;
      var mask = smooth(0.42, 0.7, fbm(u, v, 2, 3, 9303));
      var val = (ridge * 0.9 + 0.1 * n) * mask * 150;
      var o = (y * S + x) * 4;
      d[o] = val; d[o + 1] = val; d[o + 2] = val; d[o + 3] = 255;
    }
  }
  function wispPost(ctx, S) {
    var rand = makeRand(4409);
    for (var i = 0; i < 70; i++) {
      var sx = rand() * S, sy = rand() * S;
      ctx.fillStyle = css(0xffffff, 0.35 + rand() * 0.45);
      ctx.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
    }
  }

  function bakeNear(scene) {
    return bakeCanvas(scene, 'hm2bg_near', 512, 512, function (ctx, S) {
      var rand = makeRand(5813);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, S, S);
      for (var i = 0; i < 46; i++) {
        var x = rand() * S, y = rand() * S;
        var r = 5 + rand() * 9, a = 0.35 + rand() * 0.4;
        wrapDraw(S, x, y, r, function (px, py) {
          glowDot(ctx, px, py, r, 0xffffff, a);
          ctx.fillStyle = css(0xffffff, 0.9);
          ctx.beginPath(); ctx.arc(px, py, 0.9, 0, TAU); ctx.fill();
        });
      }
    });
  }

  function bakeDust(scene) {
    return bakeCanvas(scene, 'hm2bg_motes', 256, 256, function (ctx, S) {
      var rand = makeRand(6907);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, S, S);
      for (var i = 0; i < 60; i++) {
        var x = rand() * S, y = rand() * S;
        ctx.fillStyle = css(0xffffff, 0.12 + rand() * 0.3);
        ctx.beginPath(); ctx.arc(x, y, 0.5 + rand() * 0.9, 0, TAU); ctx.fill();
      }
    });
  }

  function bakeGlint(scene) {
    return bakeCanvas(scene, 'hm2bg_glint', 64, 64, function (ctx, S) {
      var c = S / 2;
      glowDot(ctx, c, c, 22, 0xffffff, 0.8);
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 2; k++) {
        var g = ctx.createLinearGradient(k ? c : 0, k ? 0 : c, k ? c : S, k ? S : c);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        if (k) ctx.fillRect(c - 1, 0, 2, S); else ctx.fillRect(0, c - 1, S, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  // Shaded sphere: base fill, noise bands, terminator shadow, rim light.
  function sphere(ctx, cx, cy, R, cols, seed, bands) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    var base = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    base.addColorStop(0, css(cols[0], 1)); base.addColorStop(1, css(cols[1], 1));
    ctx.fillStyle = base; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    var rand = makeRand(seed);
    for (var i = 0; i < bands; i++) {
      var by = cy - R + rand() * R * 2, bh = 2 + rand() * R * 0.12;
      ctx.fillStyle = css(rand() < 0.5 ? cols[2] : cols[0], 0.18 + rand() * 0.3);
      ctx.beginPath();
      ctx.ellipse(cx, by, R * 1.1, bh, (rand() - 0.5) * 0.08, 0, TAU);
      ctx.fill();
    }
    var sh = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.2, cx - R * 0.2, cy - R * 0.2, R * 1.45);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    sh.addColorStop(1, 'rgba(0,0,0,0.96)');
    ctx.fillStyle = sh; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = R * 0.05;
    ctx.strokeStyle = css(cols[3], 0.55);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.985, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
    var at = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.18);
    at.addColorStop(0, css(cols[3], 0.3)); at.addColorStop(1, css(cols[3], 0));
    ctx.fillStyle = at;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, TAU); ctx.fill();
    ctx.restore();
  }

  var HERO_BAKERS = {
    ringed: function (ctx, S) {
      var c = S / 2, R = S * 0.24, tilt = -0.32;
      function ring(front) {
        ctx.save();
        ctx.translate(c, c); ctx.rotate(tilt);
        for (var i = 0; i < 26; i++) {
          var rr = R * (1.35 + i * 0.03);
          var a = (i % 5 === 3 ? 0.08 : 0.32) * (1 - i / 34);
          ctx.strokeStyle = css(i % 3 ? 0xe9b98a : 0xc07a6a, a);
          ctx.lineWidth = R * 0.028;
          ctx.beginPath();
          ctx.ellipse(0, 0, rr, rr * 0.22, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
      ring(false);
      sphere(ctx, c, c, R, [0xd98a5c, 0x6a2a44, 0xf0c090, 0xffc49a], 77, 26);
      ring(true);
    },
    moon: function (ctx, S) {
      var c = S / 2, R = S * 0.36;
      sphere(ctx, c, c, R, [0x9ab4cc, 0x2a3a58, 0xd0e4f4, 0xbfe8ff], 131, 10);
      var rand = makeRand(133);
      ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.clip();
      for (var i = 0; i < 22; i++) {
        var a = rand() * TAU, d = rand() * R * 0.8, r = 4 + rand() * R * 0.12;
        ctx.fillStyle = 'rgba(10,20,40,0.28)';
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    ice: function (ctx, S) {
      var c = S / 2, R = S * 0.36;
      sphere(ctx, c, c, R, [0xbfe6ff, 0x2a4a8a, 0xffffff, 0xa0e8ff], 141, 18);
    },
    rock: function (ctx, S) {
      var c = S / 2, R = S * 0.34;
      sphere(ctx, c, c, R, [0x6a4238, 0x1a0e10, 0x9a6a50, 0xff8a50], 151, 14);
    },
    blackhole: function (ctx, S) {
      var c = S / 2, R = S * 0.085;
      ctx.globalCompositeOperation = 'lighter';
      glowDot(ctx, c, c, S * 0.5, 0x6a3ad0, 0.55);
      function disk(front) {
        ctx.save(); ctx.translate(c, c); ctx.rotate(-0.18);
        for (var i = 0; i < 40; i++) {
          var rr = R * (1.5 + i * 0.075);
          var t = i / 40;
          var col = lerpColor(0xffe0b0, 0x7a3ad8, Math.min(1, t * 1.4));
          ctx.strokeStyle = css(col, 0.3 * (1 - t) + 0.03);
          ctx.lineWidth = R * 0.16;
          ctx.beginPath();
          ctx.ellipse(0, 0, rr, rr * 0.2, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
      disk(false);
      // lensed halo: the far side of the disk bent over the shadow
      for (var k = 0; k < 10; k++) {
        ctx.strokeStyle = css(lerpColor(0xffd8a0, 0xa060ff, k / 10), 0.45 * (1 - k / 10));
        ctx.lineWidth = R * 0.08;
        ctx.beginPath(); ctx.arc(c, c, R * (1.12 + k * 0.05), 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      disk(true);
      ctx.globalCompositeOperation = 'source-over';
    },
    galaxy: function (ctx, S) {
      var c = S / 2, rand = makeRand(2027);
      ctx.globalCompositeOperation = 'lighter';
      glowDot(ctx, c, c, S * 0.46, 0x3a5aa0, 0.5);
      for (var i = 0; i < 5200; i++) {
        var arm = i % 2, t = Math.pow(rand(), 0.8);
        var r = S * (0.03 + t * 0.42);
        var th = arm * Math.PI + Math.log(r / (S * 0.03) + 1) * 2.4 + (rand() - 0.5) * (0.9 - t * 0.5);
        var sq = 0.62;
        var x = c + Math.cos(th) * r, y = c + Math.sin(th) * r * sq;
        var col = t < 0.25 ? 0xffe0a8 : (rand() < 0.15 ? 0xff9ad0 : 0x9ec8ff);
        ctx.fillStyle = css(col, (0.18 + rand() * 0.45) * (1 - t * 0.5));
        var sz = rand() < 0.85 ? 1.6 : 3;
        ctx.fillRect(x, y, sz, sz);
      }
      ctx.save(); ctx.translate(c, c); ctx.scale(1, 0.62);
      glowDot(ctx, 0, 0, S * 0.14, 0xffe2b0, 0.85);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    },
    giant: function (ctx, S) {
      var c = S / 2, R = S * 0.27;
      ctx.globalCompositeOperation = 'lighter';
      glowDot(ctx, c, c, S * 0.5, 0xff4a18, 0.5);
      ctx.globalCompositeOperation = 'source-over';
      var g = ctx.createRadialGradient(c, c, 0, c, c, R);
      g.addColorStop(0, '#ffb060'); g.addColorStop(0.6, '#e8501c'); g.addColorStop(1, '#801808');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fill();
      var rand = makeRand(3001);
      ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.clip();
      for (var i = 0; i < 160; i++) {
        var a = rand() * TAU, d = Math.sqrt(rand()) * R, r = 3 + rand() * R * 0.09;
        ctx.fillStyle = rand() < 0.5 ? 'rgba(90,10,0,0.22)' : 'rgba(255,200,120,0.16)';
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (var p = 0; p < 7; p++) {
        var pa = rand() * TAU, span = 0.15 + rand() * 0.25, h = R * (0.15 + rand() * 0.3);
        ctx.strokeStyle = 'rgba(255,120,50,0.35)'; ctx.lineWidth = 2 + rand() * 3;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(pa) * R, c + Math.sin(pa) * R);
        ctx.quadraticCurveTo(c + Math.cos(pa + span / 2) * (R + h * 2), c + Math.sin(pa + span / 2) * (R + h * 2),
          c + Math.cos(pa + span) * R, c + Math.sin(pa + span) * R);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    sun: function (ctx, S) {
      var c = S / 2, R = S * 0.22;
      ctx.globalCompositeOperation = 'lighter';
      glowDot(ctx, c, c, S * 0.5, 0xff9a20, 0.5);
      ctx.globalCompositeOperation = 'source-over';
      var g = ctx.createRadialGradient(c, c, 0, c, c, R);
      g.addColorStop(0, '#fff0c0'); g.addColorStop(0.7, '#ffb030'); g.addColorStop(1, '#c05a10');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      var rand = makeRand(3203);
      for (var i = 0; i < 48; i++) {
        var a = rand() * TAU, l = R * (1.1 + rand() * 0.9);
        ctx.strokeStyle = 'rgba(255,190,90,' + (0.05 + rand() * 0.1) + ')'; ctx.lineWidth = 2 + rand() * 6;
        ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
        ctx.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    pulsar: function (ctx, S) {
      var c = S / 2;
      ctx.globalCompositeOperation = 'lighter';
      glowDot(ctx, c, c, S * 0.3, 0x6ab8ff, 0.5);
      for (var k = 0; k < 2; k++) {
        ctx.save(); ctx.translate(c, c); ctx.rotate(k * Math.PI);
        var g = ctx.createLinearGradient(0, 0, 0, -c);
        g.addColorStop(0, 'rgba(200,240,255,0.5)'); g.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-S * 0.07, -c); ctx.lineTo(S * 0.07, -c); ctx.lineTo(3, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      glowDot(ctx, c, c, S * 0.16, 0x8a6aff, 0.35);
      glowDot(ctx, c, c, S * 0.06, 0xffffff, 1);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // Scale a baked RGBA buffer so its mean (sRGB-weighted, as the world probe
  // measures it) lands on `target`. This is what keeps every region's
  // backdrop inside the probe's luminance budget whatever its palette.
  function normalizeLum(d, target) {
    var sum = 0, n = 0, i;
    for (i = 0; i < d.length; i += 16) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    var mean = sum / n / 255;
    if (mean <= 0) return;
    var k = target / mean;
    k = k < 0.15 ? 0.15 : (k > 2.2 ? 2.2 : k);
    for (i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }

  // ---------------------------------------------------------- bake jobs ----
  // Time-budgeted queue: pixel jobs run whole rows until the per-frame budget
  // is spent, draw jobs run in one go. Keeps run start and region crossings
  // free of long frames; a layer simply fades in once its texture lands.
  function makeJobQueue(scene) {
    var jobs = [];
    var now = (typeof performance !== 'undefined' && performance.now) ?
      function () { return performance.now(); } : function () { return Date.now(); };
    function has(key) { return scene.textures.exists(key); }
    function queued(key) {
      for (var i = 0; i < jobs.length; i++) if (jobs[i].key === key) return i;
      return -1;
    }
    function addPixel(key, S, rowFn, post, norm) {
      if (has(key) || queued(key) >= 0) return;
      jobs.push({ key: key, S: S, rowFn: rowFn, post: post, norm: norm, y: 0 });
    }
    function addDraw(key, S, drawFn) {
      if (has(key) || queued(key) >= 0) return;
      jobs.push({ key: key, S: S, drawFn: drawFn });
    }
    function prioritize(key) {
      var i = queued(key);
      if (i > 0) jobs.unshift(jobs.splice(i, 1)[0]);
    }
    function finish(job) {
      if (!has(job.key)) scene.textures.addCanvas(job.key, job.canvas);
      TEX_CACHE[job.key] = true;
    }
    function pump(budgetMs, onlyKey) {
      var t0 = now();
      while (jobs.length) {
        if (onlyKey && jobs[0].key !== onlyKey) break;
        var job = jobs[0];
        if (!job.canvas) {
          job.canvas = document.createElement('canvas');
          job.canvas.width = job.S; job.canvas.height = job.S;
          job.ctx = job.canvas.getContext('2d');
        }
        if (job.drawFn) {
          job.drawFn(job.ctx, job.S);
          finish(job); jobs.shift();
        } else {
          if (!job.img) job.img = job.ctx.createImageData(job.S, job.S);
          while (job.y < job.S) {
            job.rowFn(job.y, job.S, job.img.data);
            job.y++;
            if (now() - t0 > budgetMs) break;
          }
          if (job.y >= job.S) {
            if (job.norm) normalizeLum(job.img.data, job.norm);
            job.ctx.putImageData(job.img, 0, 0);
            if (job.post) job.post(job.ctx, job.S);
            job.img = null;
            finish(job); jobs.shift();
          }
        }
        if (now() - t0 > budgetMs) break;
      }
    }
    return { addPixel: addPixel, addDraw: addDraw, prioritize: prioritize, pump: pump,
      pending: function () { return jobs.length; } };
  }

  // ---------------------------------------------- legacy graphics fallback --
  // Used only where no DOM canvas exists (node unit tests with a fake scene).
  function ensureTexture(scene, key, w, h, drawFn) {
    if (TEX_CACHE[key]) return key;
    if (scene.textures.exists(key)) { TEX_CACHE[key] = true; return key; }
    var g = scene.add.graphics();
    drawFn(g);
    g.generateTexture(key, w, h);
    g.destroy();
    TEX_CACHE[key] = true;
    return key;
  }

  function buildFallbackTexture(scene, key, seed, color) {
    return ensureTexture(scene, key, 256, 256, function (g) {
      var rand = makeRand(seed);
      for (var i = 0; i < 140; i++) {
        g.fillStyle(color, 0.1 + rand() * 0.3);
        g.fillCircle(rand() * 256, rand() * 256, rand() * 1.2 + 0.3);
      }
    });
  }

  // Phaser 3.60+ TileSprite keeps its source in displayTexture; .texture is
  // an internal canvas with a generated key.
  function texKey(obj) {
    var t = obj && (obj.displayTexture || obj.texture);
    return t ? t.key : null;
  }

  function call(obj, fn) {
    if (obj && typeof obj[fn] === 'function') {
      return obj[fn].apply(obj, Array.prototype.slice.call(arguments, 2));
    }
    return obj;
  }

  // ------------------------------------------------------------- create ----
  function create(scene, worldApi) {
    var baked = canBake(scene);
    var ADD = (typeof Phaser !== 'undefined' && Phaser.BlendModes) ? Phaser.BlendModes.ADD : 1;
    var regionDefs = {};
    if (worldApi && worldApi.REGIONS) {
      for (var i = 0; i < worldApi.REGIONS.length; i++) regionDefs[worldApi.REGIONS[i].key] = worldApi.REGIONS[i];
    }
    function artFor(key) {
      if (ART[key]) return ART[key];
      var def = regionDefs[key];
      if (def && def.palette) {
        var p = def.palette;
        return { seed: 97, neb: [p.nebula, p.mid, p.dust], gain: 0.8, lanes: 0.5,
          stars: 0xffffff, mid: p.dust, near: 0xffffff, dust: p.dust, features: [] };
      }
      return DEFAULT_ART;
    }

    var W = scene.scale.width, H = scene.scale.height;
    var COVER = Math.ceil(Math.sqrt(W * W + H * H) * 1.7);

    var starKey, wispKey = 'hm2bg_wisps', nearKey, dustKey, nebKey0;
    var jobs = null;
    if (baked) {
      // Cheap vector bakes run now; per-pixel nebulae, wisps and hero art go
      // through the time-budgeted queue (cached per page across restarts).
      starKey = bakeStarField(scene);
      nearKey = bakeNear(scene);
      dustKey = bakeDust(scene);
      bakeGlint(scene);
      jobs = makeJobQueue(scene);
      jobs.addPixel(wispKey, 256, wispRows, wispPost, WISP_LUM);
      var keys = Object.keys(ART);
      for (var rk in regionDefs) if (regionDefs.hasOwnProperty(rk) && keys.indexOf(rk) < 0) keys.push(rk);
      for (var ki = 0; ki < keys.length; ki++) {
        var art0 = artFor(keys[ki]);
        jobs.addPixel('hm2bg_neb_' + keys[ki], 256, nebulaRows(art0), null, art0.lum || NEB_LUM);
        for (var fi = 0; fi < (art0.features || []).length; fi++) {
          var hn = art0.features[fi].tex;
          jobs.addDraw('hm2bg_hero_' + hn, 512, HERO_BAKERS[hn]);
        }
      }
      nebKey0 = dustKey; // placeholder until the region nebula is baked
    } else {
      starKey = buildFallbackTexture(scene, 'hm2bg_fb_stars', 7, 0xdfefff);
      wispKey = buildFallbackTexture(scene, 'hm2bg_fb_wisps', 31, 0x66d2ff);
      nearKey = buildFallbackTexture(scene, 'hm2bg_fb_near', 53, 0xffffff);
      dustKey = buildFallbackTexture(scene, 'hm2bg_fb_dust', 97, 0x9fb4c8);
      nebKey0 = buildFallbackTexture(scene, 'hm2bg_fb_neb', 11, 0x66d2ff);
    }

    function tile(key, depth, alpha, add, tileScale) {
      var t = scene.add.tileSprite(W / 2, H / 2, COVER, COVER, key);
      call(t, 'setScrollFactor', 0);
      call(t, 'setDepth', depth);
      call(t, 'setAlpha', alpha);
      if (add) call(t, 'setBlendMode', ADD);
      if (tileScale && tileScale !== 1) call(t, 'setTileScale', tileScale, tileScale);
      t._hmWorld = true;
      t._par = 0; t._ts = tileScale || 1;
      return t;
    }

    var deep = tile(starKey, -140, 1, false, 1);
    var nebulaOut = tile(nebKey0, -131, 0, true, 4);
    var nebula = tile(nebKey0, -130, 1, true, 4);
    var mid = tile(baked ? dustKey : wispKey, -120, 0.75, true, 3);
    var midReady = !baked;
    var midFade = 1;
    var near = tile(nearKey, -112, 0.55, true, 1);
    var dust = tile(dustKey, -110, 0.6, true, 1.5);
    deep._par = 0.03; nebula._par = 0.10; nebulaOut._par = 0.10;
    mid._par = 0.22; near._par = 0.45; dust._par = 0.6;
    var tiles = [deep, nebulaOut, nebula, mid, near, dust];

    // Hero feature slots: two per set, "cur" fades in and "old" fades out.
    var canImage = baked && scene.add && typeof scene.add.image === 'function';
    function makeSlot(depth) {
      if (!canImage) return null;
      var img = scene.add.image(W / 2, H / 2, 'hm2bg_glint');
      img.setScrollFactor(0).setDepth(depth).setVisible(false).setAlpha(0);
      img._hmWorld = true;
      return { img: img, f: null, a: 0, target: 0, rot: 0 };
    }
    var slots = { cur: [], old: [] };
    for (var si = 0; si < 2; si++) {
      slots.old.push(makeSlot(si === 0 ? -127 : -137));
      slots.cur.push(makeSlot(si === 0 ? -125 : -136));
    }

    // Twinkling glints: fixed seeded layout, parallax-wrapped over the view.
    var glints = [];
    if (canImage) {
      var grand = makeRand(7717);
      for (var gi = 0; gi < 16; gi++) {
        var gimg = scene.add.image(0, 0, 'hm2bg_glint').setScrollFactor(0).setDepth(-111)
          .setBlendMode(ADD).setAlpha(0);
        gimg._hmWorld = true;
        glints.push({ img: gimg, u: grand(), v: grand(), ph: grand() * TAU, w: 0.6 + grand() * 1.4,
          s: 0.22 + grand() * 0.35, par: 0.08 + grand() * 0.2 });
      }
    }

    var clock = 0;
    var currentArt = null;
    var activeRegionKey = null;
    var FADE_DURATION = 0.9;
    var fadeT = 1;
    var tintFrom = null, tintTo = null;
    var nebKeyWanted = null;
    var nebReadyT = 0; // 0..1 fade-in of the current nebula once baked

    function tintsOf(art) {
      return { deep: art.stars, mid: art.mid, near: art.near, dust: art.dust };
    }

    function assignFeatures(set, art) {
      for (var k = 0; k < 2; k++) {
        var s = set[k];
        if (!s) continue;
        var f = art && art.features ? art.features[k] : null;
        s.f = f || null;
        s.ready = false;
        if (!f) { s.img.setVisible(false); s.a = 0; continue; }
        s.key = 'hm2bg_hero_' + f.tex;
        if (jobs) jobs.prioritize(s.key);
        if (scene.textures.exists(s.key)) { s.img.setTexture(s.key); s.ready = true; }
        s.img.setBlendMode(f.add ? ADD : 0);
        if (f.tint != null) s.img.setTint(f.tint); else s.img.clearTint();
        s.img.setVisible(true);
        s.rot = 0;
      }
    }

    function setRegion(id) {
      if (id === activeRegionKey) return;
      if (!regionDefs[id] && !ART[id]) return;
      var art = artFor(id);
      var first = activeRegionKey === null;
      activeRegionKey = id;
      tintFrom = currentArt ? tintsOf(currentArt) : tintsOf(art);
      tintTo = tintsOf(art);
      fadeT = first ? FADE_DURATION : 0;
      if (baked) {
        var nk = 'hm2bg_neb_' + id;
        if (!scene.textures.exists(nk)) jobs.addPixel(nk, 256, nebulaRows(art), null, art.lum || NEB_LUM);
        jobs.prioritize(nk);
        call(nebulaOut, 'setTexture', texKey(nebula) || dustKey);
        nebulaOut.alpha = first ? 0 : nebula.alpha;
        nebKeyWanted = nk;
        nebReadyT = 0;
        if (scene.textures.exists(nk)) { call(nebula, 'setTexture', nk); nebReadyT = first ? 1 : 0; }
        else call(nebula, 'setTexture', dustKey);
        nebulaOut.tilePositionX = nebula.tilePositionX; nebulaOut.tilePositionY = nebula.tilePositionY;
        // current features become the outgoing set
        var tmp = slots.old; slots.old = slots.cur; slots.cur = tmp;
        assignFeatures(slots.cur, art);
        for (var k = 0; k < 2; k++) {
          if (slots.cur[k]) slots.cur[k].a = first ? 1 : 0;
          if (slots.old[k] && first) { slots.old[k].a = 0; slots.old[k].img.setVisible(false); }
        }
      }
      currentArt = art;
      if (first) applyTints(tintTo);
    }

    function applyTints(t) {
      deep.setTint(t.deep); mid.setTint(t.mid); near.setTint(t.near); dust.setTint(t.dust);
    }

    function placeSlot(s, alphaMul, cam, W2, H2, zoom, dt) {
      if (!s || !s.f || !s.img.visible) return;
      if (!s.ready) {
        if (!scene.textures.exists(s.key)) { s.img.alpha = 0; return; }
        s.img.setTexture(s.key); s.ready = true; s.readyT = 0;
      }
      s.readyT = Math.min(1, (s.readyT == null ? 1 : s.readyT) + dt / FADE_DURATION);
      alphaMul *= s.readyT;
      var f = s.f;
      var def = regionDefs[activeRegionKey] || { cx: 0, cy: 0 };
      var mx = cam && cam.midPoint && isFinite(cam.midPoint.x) ? cam.midPoint.x : def.cx;
      var my = cam && cam.midPoint && isFinite(cam.midPoint.y) ? cam.midPoint.y : def.cy;
      var short = Math.min(W2, H2);
      var ox = f.fx * W2 - (mx - (def.cx || 0)) * f.par;
      var oy = f.fy * H2 - (my - (def.cy || 0)) * f.par * 0.35;
      s.img.x = W2 / 2 + ox / zoom;
      s.img.y = H2 / 2 + oy / zoom;
      var px = short * f.size;
      s.img.setScale(px / (512 * zoom));
      s.rot += (f.spin || 0) * dt;
      s.img.rotation = s.rot;
      var pulse = f.pulse ? (1 - f.pulse * 0.25 + f.pulse * 0.25 * Math.sin(clock * 1.3)) : 1;
      s.img.alpha = f.alpha * alphaMul * pulse;
    }

    function update(cam, dt) {
      dt = dt || 0;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.1;
      clock += dt;
      var W2 = scene.scale.width, H2 = scene.scale.height;
      var zoom = cam && isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1;

      if (tintTo && fadeT < FADE_DURATION) {
        fadeT += dt;
        var t = Math.min(1, fadeT / FADE_DURATION);
        applyTints({
          deep: lerpColor(tintFrom.deep, tintTo.deep, t), mid: lerpColor(tintFrom.mid, tintTo.mid, t),
          near: lerpColor(tintFrom.near, tintTo.near, t), dust: lerpColor(tintFrom.dust, tintTo.dust, t)
        });
      }
      var ft = Math.min(1, fadeT / FADE_DURATION);
      // gentle breathing glow on the nebula
      var breathe = 0.9 + 0.1 * Math.sin(clock * 0.45);
      if (baked) {
        // Spend at most ~3ms per frame on pending bakes (idle once done).
        if (jobs.pending()) jobs.pump(5);
        if (!midReady && scene.textures.exists(wispKey)) { call(mid, 'setTexture', wispKey); midReady = true; midFade = 0; }
        if (midFade < 1) midFade = Math.min(1, midFade + dt / FADE_DURATION);
        mid.alpha = midReady ? MID_ALPHA * midFade : 0;
        var nk0 = texKey(nebula);
        if (nebKeyWanted && nk0 !== nebKeyWanted && scene.textures.exists(nebKeyWanted)) {
          call(nebula, 'setTexture', nebKeyWanted);
          nk0 = nebKeyWanted;
        }
        var nebOk = nk0 === nebKeyWanted;
        if (nebOk && nebReadyT < 1) nebReadyT = Math.min(1, nebReadyT + dt / FADE_DURATION);
        nebula.alpha = nebOk ? nebReadyT * breathe : 0;
        nebulaOut.alpha = (1 - Math.min(ft, nebOk ? nebReadyT : 0)) * breathe * (texKey(nebulaOut) !== dustKey ? 1 : 0);
        call(nebulaOut, 'setVisible', nebulaOut.alpha > 0.002);
      }

      if (cam && isFinite(cam.scrollX) && isFinite(cam.scrollY)) {
        for (var i = 0; i < tiles.length; i++) {
          var l = tiles[i];
          if (l.x !== W2 / 2 || l.y !== H2 / 2) { l.x = W2 / 2; l.y = H2 / 2; }
          l.tilePositionX = cam.scrollX * l._par / l._ts;
          l.tilePositionY = cam.scrollY * l._par / l._ts;
        }
      }
      if (!baked) return;

      for (var k = 0; k < 2; k++) {
        placeSlot(slots.cur[k], ft, cam, W2, H2, zoom, dt);
        if (slots.old[k]) {
          placeSlot(slots.old[k], 1 - ft, cam, W2, H2, zoom, dt);
          if (ft >= 1 && slots.old[k].img.visible) slots.old[k].img.setVisible(false);
        }
      }

      if (glints.length && cam && isFinite(cam.scrollX) && isFinite(cam.scrollY)) {
        var span = Math.max(W2, H2) / zoom * 1.2;
        var gt = currentArt ? currentArt.near : 0xffffff;
        for (var g = 0; g < glints.length; g++) {
          var gl = glints[g];
          var gx = ((gl.u * span - cam.scrollX * gl.par) % span + span) % span - span / 2;
          var gy = ((gl.v * span - cam.scrollY * gl.par) % span + span) % span - span / 2;
          gl.img.x = W2 / 2 + gx; gl.img.y = H2 / 2 + gy;
          var tw = Math.sin(clock * gl.w + gl.ph);
          gl.img.alpha = tw > 0 ? tw * tw * 0.8 : 0;
          gl.img.setScale(gl.s * (0.8 + 0.3 * tw) / zoom);
          if (gl.img.tintTopLeft !== gt) gl.img.setTint(gt);
        }
      }
    }

    function destroy() {
      for (var i = 0; i < tiles.length; i++) tiles[i].destroy();
      ['cur', 'old'].forEach(function (k) {
        for (var j = 0; j < slots[k].length; j++) if (slots[k][j]) slots[k][j].img.destroy();
      });
      for (var g = 0; g < glints.length; g++) glints[g].img.destroy();
    }

    return {
      layers: { deep: deep, nebula: nebula, nebulaOut: nebulaOut, mid: mid, near: near, dust: dust },
      update: update,
      setRegion: setRegion,
      destroy: destroy
    };
  }

  return {
    create: create,
    ART: ART,
    _luminance: luminance,
    _lerpColor: lerpColor
  };
});
