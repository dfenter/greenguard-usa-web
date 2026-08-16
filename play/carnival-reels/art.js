/* Carnival Reels - procedural art. Every pixel in this title is generated
   here into canvas textures at boot, so nothing is drawn with Phaser Graphics
   on the hot path (Graphics replays its whole command list every frame).
   Textures are baked once during the loading screen and reused forever. */
(function (root) {
  'use strict';

  var FONT = 'Trebuchet MS, Arial, system-ui, sans-serif';

  var PAL = {
    deep: '#0b0416', night: '#12061f', night2: '#1d0b30', plum: '#2a1145',
    ink: '#fff4e6', dim: '#b8a3cc', mute: '#7d6a94',
    red: '#ff4d6d', cream: '#ffe8c9', gold: '#ffc23d', teal: '#35e0d0',
    violet: '#a06bff', mint: '#7ef2a8', rose: '#ff8fb1', amber: '#ff9538',
    sky: '#4b2168', warn: '#ff6b57'
  };

  // Per-machine identity: accent pair, backdrop sky, cabinet metal.
  var THEME = {
    orchard: {
      a: '#7ef2a8', b: '#ffc23d', sky: ['#3d1f56', '#8c4360', '#e08a52'],
      cab: ['#2f6b46', '#173a27'], marquee: '#ffc23d', name: 'ORCHARD CLASSIC',
      music: 'mus_parlour'
    },
    ghost: {
      a: '#35e0d0', b: '#a06bff', sky: ['#0d1030', '#17265c', '#1d4470'],
      cab: ['#243a6b', '#101b39'], marquee: '#35e0d0', name: 'GHOST TRAIN',
      music: 'mus_feature'
    },
    cascade: {
      a: '#a06bff', b: '#ff8fb1', sky: ['#1a0838', '#41166e', '#7a2f96'],
      cab: ['#4a2680', '#25113f'], marquee: '#c9a5ff', name: 'GEM CASCADE',
      music: 'mus_parlour'
    },
    midway: {
      a: '#ff9538', b: '#ff4d6d', sky: ['#2b0f2c', '#6d1f3d', '#c2542f'],
      cab: ['#8a2c3f', '#43121f', ], marquee: '#ffc23d', name: 'MIDWAY WAYS',
      music: 'mus_feature'
    },
    carousel: {
      a: '#ffc23d', b: '#ff8fb1', sky: ['#150a33', '#3c1560', '#8a2f6b'],
      cab: ['#8d6a1e', '#40300c'], marquee: '#ffe8c9', name: 'GRAND CAROUSEL',
      music: 'mus_finale'
    }
  };

  // Reel geometry per machine, in virtual units (720 wide design space).
  var GEO = {
    orchard: { cols: 3, rows: 3, cw: 150, ch: 150, padx: 26, pady: 26, head: 62, foot: 26 },
    ghost: { cols: 5, rows: 1, cw: 120, ch: 150, padx: 22, pady: 24, head: 62, foot: 88 },
    cascade: { cols: 5, rows: 5, cw: 106, ch: 106, padx: 22, pady: 22, head: 62, foot: 44 },
    midway: { cols: 5, rows: 3, cw: 120, ch: 118, padx: 20, pady: 22, head: 62, foot: 44 },
    carousel: { cols: 3, rows: 3, cw: 150, ch: 150, padx: 26, pady: 26, head: 62, foot: 44 }
  };
  Object.keys(GEO).forEach(function (k) {
    var g = GEO[k];
    g.gw = g.cols * g.cw;
    g.gh = g.rows * g.ch;
    g.w = g.gw + g.padx * 2;
    g.h = g.gh + g.pady * 2 + g.head + g.foot;
    g.gx = g.padx;             // grid origin inside the cabinet texture
    g.gy = g.pady + g.head;
  });

  /* ------------------------------------------------------------ canvas ---- */
  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    var x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    return { c: c, x: x, w: c.width, h: c.height };
  }
  function rr(x, a, b, w, h, r) {
    var m = Math.min(r, w / 2, h / 2);
    x.beginPath();
    x.moveTo(a + m, b);
    x.lineTo(a + w - m, b); x.quadraticCurveTo(a + w, b, a + w, b + m);
    x.lineTo(a + w, b + h - m); x.quadraticCurveTo(a + w, b + h, a + w - m, b + h);
    x.lineTo(a + m, b + h); x.quadraticCurveTo(a, b + h, a, b + h - m);
    x.lineTo(a, b + m); x.quadraticCurveTo(a, b, a + m, b);
    x.closePath();
  }
  function lg(x, x0, y0, x1, y1, stops) {
    var g = x.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }
  function rg(x, cx, cy, r0, r1, stops) {
    var g = x.createRadialGradient(cx, cy, r0, cx, cy, r1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }
  function poly(x, pts) {
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.closePath();
  }
  function starPath(x, cx, cy, r1, r2, n, rot) {
    x.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = (rot || -Math.PI / 2) + i * Math.PI / n;
      var r = i % 2 === 0 ? r1 : r2;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
  }
  function hexToRgb(h) {
    var v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(h, a) {
    var c = hexToRgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mix(h1, h2, t) {
    var a = hexToRgb(h1), b = hexToRgb(h2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function bulbs(x, pts, cols, r) {
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], col = cols[i % cols.length];
      x.fillStyle = rgba(col, 0.28);
      x.beginPath(); x.arc(p[0], p[1], r * 2.6, 0, 6.2832); x.fill();
      x.fillStyle = col;
      x.beginPath(); x.arc(p[0], p[1], r, 0, 6.2832); x.fill();
      x.fillStyle = rgba('#ffffff', 0.75);
      x.beginPath(); x.arc(p[0] - r * 0.28, p[1] - r * 0.3, r * 0.34, 0, 6.2832); x.fill();
    }
  }
  function label(x, text, cx, cy, size, col, weight, spacing) {
    x.font = (weight || '800') + ' ' + size + 'px ' + FONT;
    x.fillStyle = col;
    if (!spacing) { x.fillText(text, cx, cy); return; }
    var chars = String(text).split(''), total = 0, i, wds = [];
    for (i = 0; i < chars.length; i++) { var w = x.measureText(chars[i]).width; wds.push(w); total += w + spacing; }
    total -= spacing;
    var px = cx - total / 2;
    for (i = 0; i < chars.length; i++) { x.fillText(chars[i], px + wds[i] / 2, cy); px += wds[i] + spacing; }
  }

  /* ----------------------------------------------------------- backdrops -- */
  var BW = 480, BH = 900;
  function backdrop(id) {
    var t = THEME[id], o = mk(BW, BH), x = o.x;
    x.fillStyle = lg(x, 0, 0, 0, BH, [[0, t.sky[0]], [0.42, t.sky[1]], [0.66, t.sky[2]], [1, PAL.deep]]);
    x.fillRect(0, 0, BW, BH);
    // starfield
    var s = 1234;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    for (var i = 0; i < 130; i++) {
      var sx = rnd() * BW, sy = rnd() * BH * 0.55, r = rnd() * 1.5 + 0.4;
      x.fillStyle = rgba(PAL.cream, 0.15 + rnd() * 0.55);
      x.beginPath(); x.arc(sx, sy, r, 0, 6.2832); x.fill();
    }
    // horizon glow
    x.fillStyle = rg(x, BW / 2, BH * 0.58, 10, BW * 0.9, [[0, rgba(t.b, 0.34)], [1, rgba(t.b, 0)]]);
    x.fillRect(0, BH * 0.2, BW, BH * 0.7);

    if (id === 'orchard') {
      // rolling orchard hills with tree rows
      for (var h = 0; h < 3; h++) {
        var base = BH * (0.58 + h * 0.09), amp = 26 - h * 6;
        x.fillStyle = mix('#1c4a2f', PAL.deep, h * 0.24);
        x.beginPath(); x.moveTo(0, BH);
        for (var px = 0; px <= BW; px += 12)
          x.lineTo(px, base + Math.sin(px / 62 + h * 1.7) * amp);
        x.lineTo(BW, BH); x.closePath(); x.fill();
        for (var tI = 0; tI < 9 - h * 2; tI++) {
          var tx = 18 + tI * (BW / (9 - h * 2)) + h * 11;
          var ty = base + Math.sin(tx / 62 + h * 1.7) * amp;
          var tr = 20 - h * 5;
          x.fillStyle = mix('#2f7d4b', PAL.deep, h * 0.3);
          x.beginPath(); x.arc(tx, ty - tr * 0.7, tr, 0, 6.2832); x.fill();
          x.fillStyle = mix('#3a2418', PAL.deep, h * 0.3);
          x.fillRect(tx - 2.5, ty - tr * 0.5, 5, tr * 0.9);
          if (h === 0) {
            x.fillStyle = rgba(PAL.red, 0.85);
            for (var f = 0; f < 4; f++) {
              x.beginPath();
              x.arc(tx + Math.cos(f * 1.7) * tr * 0.6, ty - tr * 0.7 + Math.sin(f * 2.3) * tr * 0.55, 2.6, 0, 6.2832);
              x.fill();
            }
          }
        }
      }
      // bunting across the top
      for (var b = 0; b < 2; b++) {
        var by = 70 + b * 46;
        x.strokeStyle = rgba(PAL.cream, 0.5); x.lineWidth = 2;
        x.beginPath();
        for (var bx = 0; bx <= BW; bx += 8) x.lineTo(bx, by + Math.sin(bx / 70 + b) * 14);
        x.stroke();
        for (var fl = 0; fl < 14; fl++) {
          var fx = fl * (BW / 14) + 12;
          var fy = by + Math.sin(fx / 70 + b) * 14;
          poly(x, [[fx - 9, fy], [fx + 9, fy], [fx, fy + 22]]);
          x.fillStyle = [PAL.red, PAL.cream, PAL.gold, PAL.teal][fl % 4];
          x.globalAlpha = 0.8; x.fill(); x.globalAlpha = 1;
        }
      }
    } else if (id === 'ghost') {
      // tunnel mouth and converging rails
      x.fillStyle = mix('#0a1230', PAL.deep, 0.3);
      poly(x, [[0, BH], [0, BH * 0.52], [BW * 0.5, BH * 0.3], [BW, BH * 0.52], [BW, BH]]);
      x.fill();
      var ax = BW / 2, ay = BH * 0.55;
      x.fillStyle = rg(x, ax, ay, 6, 190, [[0, rgba(PAL.teal, 0.5)], [0.5, rgba('#0a1230', 0.9)], [1, rgba('#060a1c', 1)]]);
      x.beginPath(); x.ellipse(ax, ay, 150, 175, 0, 0, 6.2832); x.fill();
      x.strokeStyle = rgba(PAL.teal, 0.55); x.lineWidth = 6;
      x.beginPath(); x.ellipse(ax, ay, 150, 175, 0, 0, 6.2832); x.stroke();
      x.strokeStyle = rgba('#6d7fae', 0.75); x.lineWidth = 5;
      x.beginPath(); x.moveTo(ax - 26, ay); x.lineTo(BW * 0.14, BH); x.stroke();
      x.beginPath(); x.moveTo(ax + 26, ay); x.lineTo(BW * 0.86, BH); x.stroke();
      for (var sl = 0; sl < 16; sl++) {
        var f2 = sl / 16, yy = ay + (BH - ay) * f2 * f2;
        var half = 26 + (BW * 0.36 - 26) * f2 * f2;
        x.strokeStyle = rgba('#4a3a52', 0.8); x.lineWidth = 2 + f2 * 7;
        x.beginPath(); x.moveTo(ax - half, yy); x.lineTo(ax + half, yy); x.stroke();
      }
      // fog bands
      for (var fg = 0; fg < 5; fg++) {
        x.fillStyle = rgba('#7fa8d8', 0.05 + fg * 0.012);
        x.beginPath();
        x.ellipse(BW * (0.2 + 0.16 * fg), BH * (0.62 + 0.07 * fg), 200, 34, 0, 0, 6.2832);
        x.fill();
      }
      // hanging lanterns
      bulbs(x, [[54, 128], [BW - 62, 96], [96, 224], [BW - 106, 208]], [PAL.teal, PAL.violet, PAL.gold], 6);
    } else if (id === 'cascade') {
      // mirror maze: faceted panels
      var s2 = 991;
      function r2() { s2 = (Math.imul(s2, 1103515245) + 12345) >>> 0; return s2 / 4294967296; }
      for (var p = 0; p < 26; p++) {
        var pw = 40 + r2() * 90, ph = 90 + r2() * 240;
        var pxx = r2() * BW, pyy = BH * 0.22 + r2() * BH * 0.6;
        x.save(); x.translate(pxx, pyy); x.rotate((r2() - 0.5) * 0.5);
        x.fillStyle = lg(x, -pw / 2, -ph / 2, pw / 2, ph / 2,
          [[0, rgba(PAL.violet, 0.16)], [0.5, rgba(PAL.rose, 0.09)], [1, rgba(PAL.teal, 0.13)]]);
        x.fillRect(-pw / 2, -ph / 2, pw, ph);
        x.strokeStyle = rgba(PAL.violet, 0.3); x.lineWidth = 1.6;
        x.strokeRect(-pw / 2, -ph / 2, pw, ph);
        x.restore();
      }
      // prism shards
      for (var sh = 0; sh < 12; sh++) {
        var hx = r2() * BW, hy = BH * 0.3 + r2() * BH * 0.55, hs = 16 + r2() * 34;
        poly(x, [[hx, hy - hs], [hx + hs * 0.6, hy], [hx, hy + hs], [hx - hs * 0.6, hy]]);
        x.fillStyle = rgba([PAL.teal, PAL.rose, PAL.gold, PAL.mint][sh % 4], 0.22);
        x.fill();
      }
    } else if (id === 'midway') {
      // stall row with striped awnings
      for (var st = 0; st < 4; st++) {
        var sx2 = st * (BW / 3.4) - 40, sw = BW / 3.0, sy2 = BH * 0.5 + (st % 2) * 26;
        x.fillStyle = mix('#3b1524', PAL.deep, 0.15);
        x.fillRect(sx2, sy2, sw, BH - sy2);
        for (var g2 = 0; g2 < 7; g2++) {
          x.fillStyle = g2 % 2 ? PAL.cream : PAL.red;
          x.globalAlpha = 0.85;
          poly(x, [[sx2 + sw * g2 / 7, sy2], [sx2 + sw * (g2 + 1) / 7, sy2],
          [sx2 + sw * (g2 + 1) / 7, sy2 + 30], [sx2 + sw * (g2 + 0.5) / 7, sy2 + 40],
          [sx2 + sw * g2 / 7, sy2 + 30]]);
          x.fill(); x.globalAlpha = 1;
        }
        x.fillStyle = rgba(PAL.gold, 0.16);
        x.fillRect(sx2 + 12, sy2 + 44, sw - 24, 70);
      }
      // big top behind
      x.fillStyle = rgba('#5c1c2e', 0.9);
      poly(x, [[BW * 0.5, BH * 0.2], [BW * 0.02, BH * 0.54], [BW * 0.98, BH * 0.54]]);
      x.fill();
      for (var go = 0; go < 6; go++) {
        x.fillStyle = go % 2 ? rgba(PAL.cream, 0.3) : rgba(PAL.red, 0.35);
        poly(x, [[BW * 0.5, BH * 0.2],
        [BW * (0.02 + 0.96 * go / 6), BH * 0.54],
        [BW * (0.02 + 0.96 * (go + 1) / 6), BH * 0.54]]);
        x.fill();
      }
      // string lights
      var pts = [];
      for (var li = 0; li <= 16; li++) pts.push([li * BW / 16, 96 + Math.sin(li / 2.4) * 26]);
      x.strokeStyle = rgba(PAL.cream, 0.35); x.lineWidth = 2;
      x.beginPath(); for (var lj = 0; lj < pts.length; lj++) x.lineTo(pts[lj][0], pts[lj][1]); x.stroke();
      bulbs(x, pts, [PAL.gold, PAL.cream, PAL.amber], 4.5);
    } else {
      // carousel: lit canopy, spokes, horses in silhouette
      var ccx = BW / 2, ccy = BH * 0.52, cr = BW * 0.44;
      x.fillStyle = rg(x, ccx, ccy, 20, cr * 1.5, [[0, rgba(PAL.gold, 0.3)], [1, rgba(PAL.gold, 0)]]);
      x.beginPath(); x.arc(ccx, ccy, cr * 1.5, 0, 6.2832); x.fill();
      // canopy
      for (var cg = 0; cg < 12; cg++) {
        x.fillStyle = cg % 2 ? PAL.cream : PAL.rose;
        poly(x, [[ccx, ccy - cr * 0.95],
        [ccx - cr + 2 * cr * cg / 12, ccy - cr * 0.28],
        [ccx - cr + 2 * cr * (cg + 1) / 12, ccy - cr * 0.28]]);
        x.fill();
      }
      x.fillStyle = PAL.gold;
      rr(x, ccx - cr, ccy - cr * 0.32, cr * 2, 16, 8); x.fill();
      x.fillStyle = PAL.gold; x.fillRect(ccx - 5, ccy - cr * 1.16, 10, cr * 0.24);
      poly(x, [[ccx, ccy - cr * 1.2], [ccx + 34, ccy - cr * 1.1], [ccx, ccy - cr * 1.0]]);
      x.fillStyle = PAL.teal; x.fill();
      // poles + horses
      for (var pi = 0; pi < 5; pi++) {
        var pxp = ccx - cr * 0.82 + pi * cr * 0.41;
        x.strokeStyle = rgba(PAL.gold, 0.85); x.lineWidth = 5;
        x.beginPath(); x.moveTo(pxp, ccy - cr * 0.26); x.lineTo(pxp, ccy + cr * 0.62); x.stroke();
        var hy2 = ccy + cr * (0.08 + (pi % 2) * 0.1);
        x.fillStyle = rgba(pi % 2 ? PAL.rose : PAL.cream, 0.9);
        poly(x, [[pxp - 26, hy2 + 16], [pxp - 16, hy2 - 12], [pxp + 2, hy2 - 20],
        [pxp + 8, hy2 - 34], [pxp + 20, hy2 - 26], [pxp + 24, hy2 - 4],
        [pxp + 16, hy2 + 18], [pxp + 4, hy2 + 6], [pxp - 8, hy2 + 18]]);
        x.fill();
      }
      // base
      x.fillStyle = mix('#4a2a12', PAL.deep, 0.2);
      rr(x, ccx - cr * 1.02, ccy + cr * 0.6, cr * 2.04, 40, 12); x.fill();
      var bl = [];
      for (var bi = 0; bi <= 12; bi++) bl.push([ccx - cr + 2 * cr * bi / 12, ccy - cr * 0.24]);
      bulbs(x, bl, [PAL.gold, PAL.cream], 5);
    }

    // ground fade + vignette
    x.fillStyle = lg(x, 0, BH * 0.72, 0, BH, [[0, rgba(PAL.deep, 0)], [1, rgba(PAL.deep, 0.92)]]);
    x.fillRect(0, BH * 0.72, BW, BH * 0.28);
    x.fillStyle = rg(x, BW / 2, BH / 2, BW * 0.32, BW * 0.98, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.55)']]);
    x.fillRect(0, 0, BW, BH);
    return o.c;
  }

  /* ------------------------------------------------------------- cabinet -- */
  function cabinet(id) {
    var t = THEME[id], g = GEO[id], o = mk(g.w, g.h), x = o.x;
    // body
    x.fillStyle = lg(x, 0, 0, 0, g.h, [[0, t.cab[0]], [0.55, mix(t.cab[0], t.cab[1], 0.6)], [1, t.cab[1]]]);
    rr(x, 0, 0, g.w, g.h, 26); x.fill();
    x.strokeStyle = rgba(t.marquee, 0.55); x.lineWidth = 3;
    rr(x, 1.5, 1.5, g.w - 3, g.h - 3, 26); x.stroke();
    // marquee
    x.fillStyle = lg(x, 0, 6, 0, g.head, [[0, rgba(PAL.deep, 0.75)], [1, rgba(PAL.deep, 0.3)]]);
    rr(x, 12, 10, g.w - 24, g.head - 16, 14); x.fill();
    x.strokeStyle = rgba(t.marquee, 0.75); x.lineWidth = 2;
    rr(x, 12, 10, g.w - 24, g.head - 16, 14); x.stroke();
    label(x, t.name, g.w / 2, 10 + (g.head - 16) / 2 + 1, 22, t.marquee, '800', 3);
    // recessed grid well
    x.fillStyle = 'rgba(6,3,12,0.92)';
    rr(x, g.gx - 10, g.gy - 10, g.gw + 20, g.gh + 20, 16); x.fill();
    x.strokeStyle = rgba('#000000', 0.6); x.lineWidth = 6;
    rr(x, g.gx - 10, g.gy - 10, g.gw + 20, g.gh + 20, 16); x.stroke();
    // cell plates
    for (var c = 0; c < g.cols; c++) {
      for (var r = 0; r < g.rows; r++) {
        var cx = g.gx + c * g.cw, cy = g.gy + r * g.ch;
        x.fillStyle = lg(x, cx, cy, cx, cy + g.ch,
          [[0, 'rgba(255,255,255,0.055)'], [1, 'rgba(0,0,0,0.28)']]);
        rr(x, cx + 3, cy + 3, g.cw - 6, g.ch - 6, 12); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 1.4;
        rr(x, cx + 3, cy + 3, g.cw - 6, g.ch - 6, 12); x.stroke();
      }
    }
    // side pilasters with bulbs
    var lp = [], rp = [], n = Math.max(4, Math.round(g.gh / 66));
    for (var i = 0; i <= n; i++) {
      var yy = g.gy - 6 + g.gh * i / n + 6;
      lp.push([g.padx * 0.5, yy]); rp.push([g.w - g.padx * 0.5, yy]);
    }
    bulbs(x, lp, [t.a, t.b], 5);
    bulbs(x, rp, [t.b, t.a], 5);
    // glass sheen over the well
    x.fillStyle = lg(x, g.gx, g.gy, g.gx + g.gw * 0.5, g.gy + g.gh,
      [[0, 'rgba(255,255,255,0.08)'], [0.4, 'rgba(255,255,255,0.01)'], [1, 'rgba(255,255,255,0)']]);
    rr(x, g.gx - 8, g.gy - 8, g.gw + 16, g.gh + 16, 14); x.fill();
    return o.c;
  }

  /* ------------------------------------------------------------- symbols -- */
  var S = 128, HS = 64;
  function symBase(glow) {
    var o = mk(S, S), x = o.x;
    if (glow) {
      x.fillStyle = rg(x, HS, HS, 4, 60, [[0, rgba(glow, 0.34)], [1, rgba(glow, 0)]]);
      x.fillRect(0, 0, S, S);
    }
    return o;
  }
  function shade(x, cx, cy, r, col) {
    x.fillStyle = rgba('#000000', 0.35);
    x.beginPath(); x.ellipse(cx, cy + r * 0.92, r * 0.86, r * 0.24, 0, 0, 6.2832); x.fill();
  }
  function gloss(x, cx, cy, rx, ry) {
    x.fillStyle = 'rgba(255,255,255,0.42)';
    x.beginPath(); x.ellipse(cx, cy, rx, ry, -0.5, 0, 6.2832); x.fill();
  }

  var SYMBOLS = {
    orchard: {
      CH: function (x) { // cherries
        shade(x, HS, 78, 34);
        x.strokeStyle = '#4f9d5a'; x.lineWidth = 6; x.lineCap = 'round';
        x.beginPath(); x.moveTo(52, 74); x.quadraticCurveTo(60, 34, 76, 24); x.stroke();
        x.beginPath(); x.moveTo(82, 78); x.quadraticCurveTo(80, 42, 76, 24); x.stroke();
        poly(x, [[76, 26], [98, 14], [92, 32]]); x.fillStyle = '#63c46b'; x.fill();
        x.fillStyle = '#d92c4f'; x.beginPath(); x.arc(50, 84, 24, 0, 6.2832); x.fill();
        x.fillStyle = '#ff4d6d'; x.beginPath(); x.arc(50, 84, 20, 0, 6.2832); x.fill();
        gloss(x, 43, 76, 8, 5);
        x.fillStyle = '#b81f42'; x.beginPath(); x.arc(84, 90, 22, 0, 6.2832); x.fill();
        x.fillStyle = '#f0416a'; x.beginPath(); x.arc(84, 90, 18, 0, 6.2832); x.fill();
        gloss(x, 78, 83, 7, 4);
      },
      LE: function (x) {
        shade(x, HS, 80, 36);
        x.save(); x.translate(HS, 68); x.rotate(-0.24);
        x.fillStyle = '#e0a615'; x.beginPath(); x.ellipse(0, 0, 42, 30, 0, 0, 6.2832); x.fill();
        x.fillStyle = '#ffd54a'; x.beginPath(); x.ellipse(0, -2, 39, 27, 0, 0, 6.2832); x.fill();
        poly(x, [[38, -2], [50, -8], [40, 6]]); x.fillStyle = '#e0a615'; x.fill();
        poly(x, [[-38, -2], [-50, -8], [-40, 6]]); x.fill();
        gloss(x, -12, -12, 13, 7);
        x.restore();
        poly(x, [[HS + 12, 34], [HS + 44, 20], [HS + 30, 42]]);
        x.fillStyle = '#63c46b'; x.fill();
      },
      PL: function (x) {
        shade(x, HS, 82, 34);
        x.fillStyle = '#5e2c86'; x.beginPath(); x.arc(HS, 72, 34, 0, 6.2832); x.fill();
        x.fillStyle = '#8c4bc4'; x.beginPath(); x.arc(HS, 72, 30, 0, 6.2832); x.fill();
        x.strokeStyle = '#4b1f6d'; x.lineWidth = 3.5;
        x.beginPath(); x.moveTo(HS, 44); x.quadraticCurveTo(HS - 8, 72, HS, 102); x.stroke();
        gloss(x, HS - 12, 60, 10, 6);
        x.strokeStyle = '#6b4426'; x.lineWidth = 5; x.lineCap = 'round';
        x.beginPath(); x.moveTo(HS, 42); x.lineTo(HS + 4, 24); x.stroke();
        poly(x, [[HS + 4, 26], [HS + 34, 16], [HS + 22, 34]]);
        x.fillStyle = '#63c46b'; x.fill();
      },
      BE: function (x) {
        shade(x, HS, 84, 36);
        x.fillStyle = '#c98a12';
        x.beginPath(); x.moveTo(28, 88); x.quadraticCurveTo(30, 34, HS, 26);
        x.quadraticCurveTo(98, 34, 100, 88); x.closePath(); x.fill();
        x.fillStyle = '#ffc23d';
        x.beginPath(); x.moveTo(33, 86); x.quadraticCurveTo(35, 38, HS, 31);
        x.quadraticCurveTo(93, 38, 95, 86); x.closePath(); x.fill();
        x.fillStyle = '#c98a12'; rr(x, 26, 84, 76, 12, 6); x.fill();
        x.fillStyle = '#ffe8c9'; x.beginPath(); x.arc(HS, 102, 9, 0, 6.2832); x.fill();
        x.fillStyle = '#c98a12'; x.beginPath(); x.arc(HS, 24, 7, 0, 6.2832); x.fill();
        gloss(x, 48, 52, 8, 16);
      },
      ST: function (x) {
        shade(x, HS, 86, 36);
        starPath(x, HS, 64, 46, 19, 5);
        x.fillStyle = '#c98a12'; x.fill();
        starPath(x, HS, 62, 40, 16.5, 5);
        x.fillStyle = '#ffd96b'; x.fill();
        starPath(x, HS - 5, 58, 20, 8, 5);
        x.fillStyle = 'rgba(255,255,255,0.5)'; x.fill();
      },
      SE: function (x) {
        shade(x, HS, 88, 34);
        x.lineCap = 'round'; x.lineJoin = 'round';
        x.strokeStyle = '#a81f3f'; x.lineWidth = 20;
        x.beginPath(); x.moveTo(36, 34); x.lineTo(94, 34); x.lineTo(58, 100); x.stroke();
        x.strokeStyle = '#ff4d6d'; x.lineWidth = 13;
        x.beginPath(); x.moveTo(37, 34); x.lineTo(92, 34); x.lineTo(57, 98); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 4;
        x.beginPath(); x.moveTo(41, 30); x.lineTo(84, 30); x.stroke();
      }
    },
    ghost: {
      LAN: function (x) {
        shade(x, HS, 92, 30);
        x.strokeStyle = '#8a7a52'; x.lineWidth = 4;
        x.beginPath(); x.arc(HS, 26, 11, Math.PI, 0); x.stroke();
        x.fillStyle = '#5d5236'; rr(x, 42, 30, 44, 10, 4); x.fill();
        x.fillStyle = rgba('#ffc23d', 0.28);
        x.beginPath(); x.arc(HS, 68, 40, 0, 6.2832); x.fill();
        x.fillStyle = '#ffd96b';
        poly(x, [[44, 40], [84, 40], [90, 92], [38, 92]]); x.fill();
        x.fillStyle = '#fff4c6';
        poly(x, [[50, 46], [78, 46], [82, 86], [46, 86]]); x.fill();
        x.strokeStyle = '#5d5236'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(44, 40); x.lineTo(38, 92); x.moveTo(84, 40); x.lineTo(90, 92); x.stroke();
        x.fillStyle = '#5d5236'; rr(x, 34, 90, 60, 12, 5); x.fill();
        x.fillStyle = '#ff9538'; x.beginPath(); x.ellipse(HS, 68, 8, 16, 0, 0, 6.2832); x.fill();
      },
      KEY: function (x) {
        shade(x, HS, 92, 28);
        x.strokeStyle = '#b9a15c'; x.lineWidth = 11; x.lineCap = 'round';
        x.beginPath(); x.arc(46, 44, 20, 0, 6.2832); x.stroke();
        x.strokeStyle = '#e2c878'; x.lineWidth = 7;
        x.beginPath(); x.arc(46, 44, 20, 0, 6.2832); x.stroke();
        x.strokeStyle = '#e2c878'; x.lineWidth = 11;
        x.beginPath(); x.moveTo(60, 58); x.lineTo(98, 96); x.stroke();
        x.lineWidth = 9;
        x.beginPath(); x.moveTo(84, 90); x.lineTo(74, 100); x.stroke();
        x.beginPath(); x.moveTo(94, 80); x.lineTo(84, 90); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.35)';
        x.beginPath(); x.arc(40, 36, 5, 0, 6.2832); x.fill();
      },
      SKU: function (x) {
        shade(x, HS, 96, 32);
        x.fillStyle = '#cfd6e6';
        x.beginPath(); x.arc(HS, 58, 34, 0, 6.2832); x.fill();
        x.fillRect(44, 58, 40, 26);
        x.fillStyle = '#eef3ff';
        x.beginPath(); x.arc(HS, 56, 30, 0, 6.2832); x.fill();
        x.fillRect(46, 56, 36, 22);
        x.fillStyle = '#1a1030';
        x.beginPath(); x.ellipse(52, 56, 10, 12, 0, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(76, 56, 10, 12, 0, 0, 6.2832); x.fill();
        x.fillStyle = '#35e0d0';
        x.beginPath(); x.arc(52, 58, 4, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(76, 58, 4, 0, 6.2832); x.fill();
        poly(x, [[HS, 66], [HS - 6, 78], [HS + 6, 78]]); x.fillStyle = '#1a1030'; x.fill();
        x.fillStyle = '#eef3ff'; rr(x, 44, 82, 40, 18, 7); x.fill();
        x.strokeStyle = '#a8b0c4'; x.lineWidth = 2.4;
        x.beginPath(); x.moveTo(56, 82); x.lineTo(56, 100); x.moveTo(HS, 82); x.lineTo(HS, 100);
        x.moveTo(72, 82); x.lineTo(72, 100); x.stroke();
      },
      GHO: function (x) {
        x.fillStyle = rgba('#a06bff', 0.3);
        x.beginPath(); x.arc(HS, 60, 46, 0, 6.2832); x.fill();
        x.fillStyle = '#d9caff';
        x.beginPath();
        x.moveTo(28, 96); x.lineTo(28, 58);
        x.quadraticCurveTo(28, 20, HS, 20); x.quadraticCurveTo(100, 20, 100, 58);
        x.lineTo(100, 96); x.lineTo(88, 84); x.lineTo(76, 96); x.lineTo(HS, 84);
        x.lineTo(52, 96); x.lineTo(40, 84); x.closePath(); x.fill();
        x.fillStyle = '#fff4e6';
        x.beginPath(); x.arc(HS, 54, 30, Math.PI, 0); x.fill();
        x.fillStyle = '#2a1145';
        x.beginPath(); x.ellipse(52, 52, 7, 10, 0, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(76, 52, 7, 10, 0, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(HS, 70, 8, 6, 0, 0, 6.2832); x.fill();
        x.fillStyle = rgba('#ff8fb1', 0.5);
        x.beginPath(); x.arc(40, 66, 6, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(88, 66, 6, 0, 6.2832); x.fill();
      },
      COIN: function (x) {
        x.fillStyle = rgba('#ffc23d', 0.34);
        x.beginPath(); x.arc(HS, HS, 54, 0, 6.2832); x.fill();
        x.fillStyle = '#c98a12'; x.beginPath(); x.arc(HS, HS, 40, 0, 6.2832); x.fill();
        x.fillStyle = '#ffd96b'; x.beginPath(); x.arc(HS, HS - 2, 35, 0, 6.2832); x.fill();
        x.fillStyle = '#e8a81e'; x.beginPath(); x.arc(HS, HS - 2, 27, 0, 6.2832); x.fill();
        starPath(x, HS, HS - 2, 18, 8, 5); x.fillStyle = '#fff4e6'; x.fill();
        gloss(x, 48, 44, 10, 6);
      }
    },
    cascade: null,  // generated below (6 gem tiers)
    midway: {
      TIC: function (x) {
        shade(x, HS, 88, 34);
        x.save(); x.translate(HS, 64); x.rotate(-0.12);
        x.fillStyle = '#d98a2b'; rr(x, -44, -26, 88, 52, 8); x.fill();
        x.fillStyle = '#ffb45c'; rr(x, -41, -23, 82, 46, 7); x.fill();
        x.fillStyle = '#8a4a12';
        x.beginPath(); x.arc(-16, -23, 7, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(-16, 23, 7, 0, 6.2832); x.fill();
        x.strokeStyle = '#8a4a12'; x.lineWidth = 2; x.setLineDash([4, 4]);
        x.beginPath(); x.moveTo(-16, -16); x.lineTo(-16, 16); x.stroke(); x.setLineDash([]);
        label(x, 'ONE', 12, -6, 15, '#6b3708', '800', 1);
        label(x, 'RIDE', 12, 11, 12, '#8a4a12', '700', 1);
        x.restore();
      },
      POP: function (x) {
        shade(x, HS, 96, 32);
        x.fillStyle = '#ffe8c9';
        for (var i = 0; i < 9; i++) {
          var a = i * 0.7, px = HS + Math.cos(a) * (16 + (i % 3) * 8);
          var py = 40 + Math.sin(a * 1.3) * 12 - (i % 2) * 6;
          x.beginPath(); x.arc(px, py, 12 - (i % 3) * 2, 0, 6.2832); x.fill();
        }
        x.fillStyle = '#fff9ee';
        x.beginPath(); x.arc(52, 34, 10, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(78, 40, 9, 0, 6.2832); x.fill();
        for (var s = 0; s < 5; s++) {
          x.fillStyle = s % 2 ? '#ffe8c9' : '#ff4d6d';
          poly(x, [[36 + s * 11.2, 56], [47 + s * 11.2, 56], [44 + s * 11.2, 104], [39 + s * 11.2, 104]]);
          x.fill();
        }
        x.fillStyle = 'rgba(0,0,0,0.16)'; rr(x, 34, 96, 60, 10, 4); x.fill();
      },
      DUC: function (x) {
        shade(x, HS, 96, 32);
        x.fillStyle = '#f0b41e';
        x.beginPath(); x.ellipse(62, 82, 36, 24, 0, 0, 6.2832); x.fill();
        x.fillStyle = '#ffd54a';
        x.beginPath(); x.ellipse(60, 79, 33, 21, 0, 0, 6.2832); x.fill();
        x.fillStyle = '#ffd54a'; x.beginPath(); x.arc(46, 48, 22, 0, 6.2832); x.fill();
        x.fillStyle = '#f0b41e';
        x.beginPath(); x.ellipse(74, 76, 18, 12, -0.4, 0, 6.2832); x.fill();
        x.fillStyle = '#ff9538';
        poly(x, [[26, 46], [4, 52], [26, 58]]); x.fill();
        x.fillStyle = '#2a1145'; x.beginPath(); x.arc(44, 42, 4.5, 0, 6.2832); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(42.5, 40.5, 1.8, 0, 6.2832); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(30, 96); x.quadraticCurveTo(62, 108, 96, 94); x.stroke();
      },
      BAL: function (x) {
        x.fillStyle = rgba('#ff4d6d', 0.28);
        x.beginPath(); x.arc(HS, 52, 46, 0, 6.2832); x.fill();
        x.fillStyle = '#d92c4f'; x.beginPath(); x.ellipse(HS, 52, 32, 37, 0, 0, 6.2832); x.fill();
        x.fillStyle = '#ff4d6d'; x.beginPath(); x.ellipse(HS - 1, 50, 29, 34, 0, 0, 6.2832); x.fill();
        gloss(x, 52, 36, 9, 14);
        poly(x, [[HS - 7, 87], [HS + 7, 87], [HS, 98]]); x.fillStyle = '#d92c4f'; x.fill();
        x.strokeStyle = '#ffe8c9'; x.lineWidth = 2.6;
        x.beginPath(); x.moveTo(HS, 98); x.quadraticCurveTo(HS + 16, 112, HS - 4, 124); x.stroke();
      },
      HAT: function (x) {
        shade(x, HS, 96, 36);
        x.fillStyle = '#160a26'; rr(x, 20, 84, 88, 16, 8); x.fill();
        x.fillStyle = '#241238'; rr(x, 36, 24, 56, 64, 8); x.fill();
        x.fillStyle = '#ff4d6d'; x.fillRect(36, 66, 56, 16);
        x.fillStyle = '#ffc23d'; x.fillRect(36, 72, 56, 5);
        x.fillStyle = 'rgba(255,255,255,0.14)'; rr(x, 42, 30, 12, 34, 6); x.fill();
        starPath(x, 96, 34, 12, 5, 5); x.fillStyle = '#ffd96b'; x.fill();
      },
      WLD: function (x) { // ringmaster
        x.fillStyle = rgba('#ffc23d', 0.3);
        x.beginPath(); x.arc(HS, HS, 52, 0, 6.2832); x.fill();
        x.fillStyle = '#160a26'; rr(x, 26, 30, 76, 12, 6); x.fill();
        x.fillStyle = '#241238'; rr(x, 40, 6, 48, 28, 6); x.fill();
        x.fillStyle = '#ff4d6d'; x.fillRect(40, 24, 48, 8);
        x.fillStyle = '#ffe0c0'; x.beginPath(); x.arc(HS, 58, 20, 0, 6.2832); x.fill();
        x.fillStyle = '#2a1145';
        x.beginPath(); x.arc(58, 55, 3.4, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(70, 55, 3.4, 0, 6.2832); x.fill();
        x.fillStyle = '#8a4a12'; rr(x, 56, 66, 16, 5, 2); x.fill();
        x.fillStyle = '#c22c48';
        poly(x, [[38, 80], [HS, 72], [90, 80], [96, 118], [32, 118]]); x.fill();
        x.fillStyle = '#ffe8c9'; poly(x, [[HS - 9, 74], [HS + 9, 74], [HS, 96]]); x.fill();
        x.fillStyle = '#ffc23d';
        x.beginPath(); x.arc(46, 96, 4, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(82, 96, 4, 0, 6.2832); x.fill();
        label(x, 'WILD', HS, 118, 15, '#ffd96b', '800', 2);
      },
      SCT: function (x) { // trophy
        x.fillStyle = rgba('#ffc23d', 0.32);
        x.beginPath(); x.arc(HS, 58, 48, 0, 6.2832); x.fill();
        x.fillStyle = '#c98a12';
        x.beginPath(); x.moveTo(38, 22); x.lineTo(90, 22); x.lineTo(84, 62);
        x.quadraticCurveTo(HS, 84, 44, 62); x.closePath(); x.fill();
        x.fillStyle = '#ffd96b';
        x.beginPath(); x.moveTo(42, 26); x.lineTo(86, 26); x.lineTo(80, 60);
        x.quadraticCurveTo(HS, 78, 48, 60); x.closePath(); x.fill();
        x.strokeStyle = '#c98a12'; x.lineWidth = 6;
        x.beginPath(); x.arc(34, 38, 13, 0.5, 4.2); x.stroke();
        x.beginPath(); x.arc(94, 38, 13, -1.1, 2.6); x.stroke();
        x.fillStyle = '#c98a12'; x.fillRect(58, 78, 12, 14);
        rr(x, 40, 92, 48, 14, 5); x.fill();
        x.fillStyle = '#8a5a08'; rr(x, 34, 104, 60, 12, 5); x.fill();
        starPath(x, HS, 46, 13, 6, 5); x.fillStyle = '#fff4e6'; x.fill();
      }
    },
    carousel: {
      HOR: function (x) {
        x.fillStyle = rgba('#ff8fb1', 0.24);
        x.beginPath(); x.arc(HS, 64, 50, 0, 6.2832); x.fill();
        // brass pole through the horse
        x.strokeStyle = '#c98a12'; x.lineWidth = 7;
        x.beginPath(); x.moveTo(HS + 4, 4); x.lineTo(HS + 4, 124); x.stroke();
        x.strokeStyle = '#ffd96b'; x.lineWidth = 3.4;
        x.beginPath(); x.moveTo(HS + 3, 6); x.lineTo(HS + 3, 122); x.stroke();
        // body
        x.fillStyle = '#ffe8c9';
        x.beginPath();
        x.moveTo(24, 78); x.quadraticCurveTo(28, 56, 50, 52);
        x.lineTo(74, 50); x.quadraticCurveTo(84, 34, 92, 20);
        x.lineTo(108, 26); x.quadraticCurveTo(104, 44, 94, 56);
        x.quadraticCurveTo(104, 70, 100, 86);
        x.lineTo(90, 86); x.lineTo(86, 68);
        x.lineTo(46, 70); x.lineTo(40, 88); x.lineTo(30, 88);
        x.closePath(); x.fill();
        // legs
        x.strokeStyle = '#ffe8c9'; x.lineWidth = 9; x.lineCap = 'round';
        x.beginPath(); x.moveTo(38, 76); x.lineTo(30, 104); x.stroke();
        x.beginPath(); x.moveTo(56, 72); x.lineTo(58, 104); x.stroke();
        x.beginPath(); x.moveTo(82, 70); x.lineTo(88, 102); x.stroke();
        // mane and tail
        x.fillStyle = '#ff8fb1';
        poly(x, [[74, 50], [92, 22], [98, 38], [82, 58]]); x.fill();
        poly(x, [[26, 60], [8, 46], [12, 74], [28, 76]]); x.fill();
        // saddle and bridle
        x.fillStyle = '#a06bff'; rr(x, 48, 48, 30, 12, 5); x.fill();
        x.fillStyle = '#ffc23d'; rr(x, 50, 44, 26, 5, 2); x.fill();
        x.strokeStyle = '#c98a12'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(94, 30); x.lineTo(104, 38); x.stroke();
        x.fillStyle = '#2a1145'; x.beginPath(); x.arc(98, 32, 3.4, 0, 6.2832); x.fill();
      },
      CAN: function (x) {
        shade(x, HS, 100, 30);
        x.fillStyle = '#ffb4d4';
        x.beginPath(); x.arc(54, 44, 24, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(78, 40, 21, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(66, 62, 25, 0, 6.2832); x.fill();
        x.fillStyle = '#ffd0e4';
        x.beginPath(); x.arc(50, 38, 14, 0, 6.2832); x.fill();
        x.beginPath(); x.arc(76, 56, 12, 0, 6.2832); x.fill();
        x.fillStyle = '#a06bff';
        x.beginPath(); x.arc(84, 60, 10, 0, 6.2832); x.fill();
        x.fillStyle = '#ffe8c9'; rr(x, 60, 78, 10, 40, 5); x.fill();
        x.fillStyle = '#d9c3a4'; rr(x, 60, 78, 4, 40, 2); x.fill();
      },
      RIN: function (x) {
        x.strokeStyle = '#c98a12'; x.lineWidth = 15;
        x.beginPath(); x.arc(HS, HS, 38, 0, 6.2832); x.stroke();
        x.strokeStyle = '#ffd96b'; x.lineWidth = 10;
        x.beginPath(); x.arc(HS, HS, 38, 0, 6.2832); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 3.5;
        x.beginPath(); x.arc(HS, HS, 38, 3.4, 4.6); x.stroke();
        x.fillStyle = rgba('#ffc23d', 0.22);
        x.beginPath(); x.arc(HS, HS, 30, 0, 6.2832); x.fill();
      },
      TIK: function (x) {
        shade(x, HS, 96, 30);
        x.fillStyle = '#8a6a1e'; x.beginPath(); x.arc(HS, HS, 38, 0, 6.2832); x.fill();
        x.fillStyle = '#d9b45c'; x.beginPath(); x.arc(HS, HS - 2, 34, 0, 6.2832); x.fill();
        x.fillStyle = '#b8933f'; x.beginPath(); x.arc(HS, HS - 2, 26, 0, 6.2832); x.fill();
        label(x, 'C', HS, HS - 1, 30, '#2a1145', '800');
        gloss(x, 50, 44, 9, 5);
      },
      WHL: function (x) {
        x.fillStyle = rgba('#35e0d0', 0.3);
        x.beginPath(); x.arc(HS, HS, 50, 0, 6.2832); x.fill();
        for (var i = 0; i < 10; i++) {
          var a0 = i * 0.6283, a1 = a0 + 0.6283;
          x.beginPath(); x.moveTo(HS, HS);
          for (var k = 0; k <= 6; k++) {
            var a = a0 + (a1 - a0) * k / 6;
            x.lineTo(HS + Math.cos(a) * 40, HS + Math.sin(a) * 40);
          }
          x.closePath();
          x.fillStyle = i % 2 ? '#ff4d6d' : '#ffe8c9'; x.fill();
        }
        x.strokeStyle = '#ffc23d'; x.lineWidth = 5;
        x.beginPath(); x.arc(HS, HS, 40, 0, 6.2832); x.stroke();
        x.fillStyle = '#ffc23d'; x.beginPath(); x.arc(HS, HS, 10, 0, 6.2832); x.fill();
        poly(x, [[HS - 8, 12], [HS + 8, 12], [HS, 30]]); x.fillStyle = '#35e0d0'; x.fill();
      },
      STA: function (x) {
        x.fillStyle = rgba('#a06bff', 0.32);
        x.beginPath(); x.arc(HS, HS, 50, 0, 6.2832); x.fill();
        starPath(x, HS, HS, 46, 19, 5);
        x.fillStyle = '#7a4bd0'; x.fill();
        starPath(x, HS, HS - 2, 40, 16, 5);
        x.fillStyle = '#c9a5ff'; x.fill();
        starPath(x, HS - 4, HS - 6, 18, 7, 5);
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.fill();
      },
      PRZ: function (x) {
        shade(x, HS, 100, 34);
        x.fillStyle = '#35e0d0'; rr(x, 26, 50, 76, 52, 8); x.fill();
        x.fillStyle = '#5ff0e2'; rr(x, 26, 42, 76, 16, 6); x.fill();
        x.fillStyle = '#ff4d6d'; x.fillRect(56, 42, 16, 60);
        x.fillStyle = '#ff8fb1'; x.fillRect(26, 66, 76, 10);
        x.fillStyle = '#ff4d6d';
        x.beginPath(); x.ellipse(52, 34, 15, 11, -0.5, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(76, 34, 15, 11, 0.5, 0, 6.2832); x.fill();
        x.fillStyle = '#ffc23d'; x.beginPath(); x.arc(HS, 36, 8, 0, 6.2832); x.fill();
      }
    }
  };

  function gemSym(tier) {
    var cols = ['#cfe4f5', '#7ef2a8', '#ffd96b', '#ff8fb1', '#6b9bff', '#c9a5ff'];
    var dark = ['#7d95a8', '#3ea86a', '#c98a12', '#c2547a', '#3a5ea8', '#7a4bd0'];
    var sides = [6, 4, 5, 8, 3, 6][tier];
    return function (x) {
      var c = cols[tier], d = dark[tier], r = 40;
      x.fillStyle = rgba(c, 0.15);
      x.beginPath(); x.arc(HS, HS, 46, 0, 6.2832); x.fill();
      var pts = [], i;
      for (i = 0; i < sides; i++) {
        var a = -Math.PI / 2 + i * 6.2832 / sides;
        pts.push([HS + Math.cos(a) * r, HS + Math.sin(a) * r]);
      }
      poly(x, pts); x.fillStyle = d; x.fill();
      var pts2 = [];
      for (i = 0; i < sides; i++) {
        var a2 = -Math.PI / 2 + i * 6.2832 / sides;
        pts2.push([HS + Math.cos(a2) * (r - 5), HS - 3 + Math.sin(a2) * (r - 5)]);
      }
      poly(x, pts2); x.fillStyle = c; x.fill();
      // facets
      for (i = 0; i < sides; i++) {
        var j = (i + 1) % sides;
        poly(x, [[HS, HS - 4], pts2[i], pts2[j]]);
        x.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
        x.fill();
      }
      poly(x, [[HS, HS - 4], pts2[0], pts2[Math.max(1, sides - 1)]]);
      x.fillStyle = 'rgba(255,255,255,0.34)'; x.fill();
      x.strokeStyle = rgba('#ffffff', 0.4); x.lineWidth = 2;
      poly(x, pts2); x.stroke();
    };
  }

  /* ----------------------------------------------------------- particles -- */
  function pDot() {
    var o = mk(48, 48), x = o.x;
    x.fillStyle = rg(x, 24, 24, 0, 24, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, 48, 48);
    return o.c;
  }
  function pSpark() {
    var o = mk(48, 12), x = o.x;
    x.fillStyle = lg(x, 0, 0, 48, 0, [[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    rr(x, 0, 3, 48, 6, 3); x.fill();
    return o.c;
  }
  function pStar() {
    var o = mk(48, 48), x = o.x;
    starPath(x, 24, 24, 22, 8, 5);
    x.fillStyle = '#ffffff'; x.fill();
    return o.c;
  }
  function pConf() {
    var o = mk(24, 14), x = o.x;
    x.fillStyle = '#ffffff'; rr(x, 0, 0, 24, 14, 3); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 8, 24, 6);
    return o.c;
  }
  function pRing() {
    var o = mk(96, 96), x = o.x;
    x.strokeStyle = '#ffffff'; x.lineWidth = 7;
    x.beginPath(); x.arc(48, 48, 40, 0, 6.2832); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 14;
    x.beginPath(); x.arc(48, 48, 40, 0, 6.2832); x.stroke();
    return o.c;
  }
  function pCoin() {
    var o = mk(40, 40), x = o.x;
    x.fillStyle = '#c98a12'; x.beginPath(); x.arc(20, 20, 18, 0, 6.2832); x.fill();
    x.fillStyle = '#ffd96b'; x.beginPath(); x.arc(20, 19, 15, 0, 6.2832); x.fill();
    x.fillStyle = '#e8a81e'; x.beginPath(); x.arc(20, 19, 10, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(14, 13, 4, 0, 6.2832); x.fill();
    return o.c;
  }
  function pPuff() {
    var o = mk(64, 64), x = o.x;
    x.fillStyle = rg(x, 32, 32, 4, 32, [[0, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
    x.beginPath(); x.arc(32, 32, 32, 0, 6.2832); x.fill();
    return o.c;
  }
  function glowSoft() {
    var o = mk(128, 128), x = o.x;
    x.fillStyle = rg(x, 64, 64, 0, 64, [[0, 'rgba(255,255,255,0.85)'], [0.35, 'rgba(255,255,255,0.32)'], [1, 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, 128, 128);
    return o.c;
  }

  /* --------------------------------------------------------------- wheel -- */
  // Hand tessellated: Graphics.arc walks 0.01 rad steps, so the wheel face is
  // baked once and only rotated at runtime.
  function wheelFace(layout, segments) {
    var R0 = 210, o = mk(R0 * 2, R0 * 2), x = o.x, n = layout.length;
    var cols = ['#2a1145', '#3f6b8a', '#4a8a5e', '#8a6a1e', '#8a3f5e', '#6b3f8a',
      '#a0561e', '#2f7d8a', '#b8332f', '#c99a12'];
    x.fillStyle = '#1a0a2c'; x.beginPath(); x.arc(R0, R0, R0 - 2, 0, 6.2832); x.fill();
    for (var i = 0; i < n; i++) {
      var a0 = i * 6.2832 / n - Math.PI / 2 - 3.1416 / n;
      var a1 = a0 + 6.2832 / n;
      x.beginPath(); x.moveTo(R0, R0);
      for (var k = 0; k <= 5; k++) {
        var a = a0 + (a1 - a0) * k / 5;
        x.lineTo(R0 + Math.cos(a) * (R0 - 12), R0 + Math.sin(a) * (R0 - 12));
      }
      x.closePath();
      var seg = segments[layout[i]];
      x.fillStyle = cols[layout[i]]; x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 2; x.stroke();
      // wedge label
      var am = (a0 + a1) / 2;
      x.save();
      x.translate(R0 + Math.cos(am) * (R0 * 0.68), R0 + Math.sin(am) * (R0 * 0.68));
      x.rotate(am + Math.PI / 2);
      var big = layout[i] >= 8;
      label(x, seg[1] === 0 ? '' : (seg[1] >= 100 ? String(seg[1]) + 'x' : seg[0]),
        0, 0, big ? 20 : 15, big ? PAL.gold : PAL.cream, '800', 0);
      x.restore();
    }
    // rim + bulbs
    x.strokeStyle = PAL.gold; x.lineWidth = 9;
    x.beginPath(); x.arc(R0, R0, R0 - 8, 0, 6.2832); x.stroke();
    var bl = [];
    for (var b = 0; b < 24; b++) {
      var ab = b * 6.2832 / 24;
      bl.push([R0 + Math.cos(ab) * (R0 - 8), R0 + Math.sin(ab) * (R0 - 8)]);
    }
    bulbs(x, bl, [PAL.cream, PAL.gold], 4.5);
    return o.c;
  }
  function wheelHub() {
    var o = mk(96, 96), x = o.x;
    x.fillStyle = '#c98a12'; x.beginPath(); x.arc(48, 48, 44, 0, 6.2832); x.fill();
    x.fillStyle = '#ffd96b'; x.beginPath(); x.arc(48, 46, 38, 0, 6.2832); x.fill();
    starPath(x, 48, 46, 24, 10, 6); x.fillStyle = '#2a1145'; x.fill();
    return o.c;
  }
  function wheelPointer() {
    var o = mk(56, 72), x = o.x;
    x.fillStyle = '#8a2c3f'; poly(x, [[28, 68], [4, 8], [52, 8]]); x.fill();
    x.fillStyle = '#ff4d6d'; poly(x, [[28, 62], [10, 12], [46, 12]]); x.fill();
    x.fillStyle = '#ffd96b'; x.beginPath(); x.arc(28, 16, 9, 0, 6.2832); x.fill();
    return o.c;
  }

  /* --------------------------------------------------------------- mascot -- */
  // Pip the barker. Parts are separate textures so the runtime only moves
  // transforms; five poses are built from these five pieces.
  function pipHead() {
    var o = mk(96, 96), x = o.x;
    x.fillStyle = '#ffe0c0'; x.beginPath(); x.arc(48, 54, 30, 0, 6.2832); x.fill();
    x.fillStyle = '#f5c9a2'; x.beginPath(); x.arc(48, 68, 26, 0.2, 2.94); x.fill();
    x.fillStyle = '#2a1145';
    x.beginPath(); x.arc(38, 50, 4.6, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(58, 50, 4.6, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath(); x.arc(36.6, 48.4, 1.7, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(56.6, 48.4, 1.7, 0, 6.2832); x.fill();
    x.strokeStyle = '#8a4a12'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.arc(48, 58, 12, 0.35, 2.79); x.stroke();
    x.fillStyle = '#8a4a12'; rr(x, 40, 66, 16, 5, 2); x.fill();
    x.fillStyle = 'rgba(255,143,177,0.5)';
    x.beginPath(); x.arc(30, 60, 6, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(66, 60, 6, 0, 6.2832); x.fill();
    return o.c;
  }
  function pipHat() {
    var o = mk(96, 56), x = o.x;
    x.fillStyle = '#160a26'; rr(x, 6, 40, 84, 12, 6); x.fill();
    x.fillStyle = '#241238'; rr(x, 24, 2, 48, 42, 6); x.fill();
    x.fillStyle = '#ff4d6d'; x.fillRect(24, 30, 48, 10);
    x.fillStyle = '#ffc23d'; x.fillRect(24, 34, 48, 3);
    x.fillStyle = 'rgba(255,255,255,0.13)'; rr(x, 30, 8, 9, 22, 4); x.fill();
    return o.c;
  }
  function pipBody() {
    var o = mk(104, 104), x = o.x;
    x.fillStyle = '#c22c48';
    poly(x, [[22, 100], [26, 24], [52, 12], [78, 24], [82, 100]]); x.fill();
    x.fillStyle = '#ffe8c9'; poly(x, [[42, 14], [62, 14], [52, 56]]); x.fill();
    x.fillStyle = '#ffc23d';
    x.beginPath(); x.arc(38, 60, 5, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(66, 60, 5, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(38, 82, 5, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(66, 82, 5, 0, 6.2832); x.fill();
    x.fillStyle = '#8a1e33'; rr(x, 22, 92, 60, 12, 5); x.fill();
    return o.c;
  }
  function pipArm() {
    var o = mk(28, 76), x = o.x;
    x.fillStyle = '#c22c48'; rr(x, 4, 0, 20, 56, 10); x.fill();
    x.fillStyle = '#ffe0c0'; x.beginPath(); x.arc(14, 62, 12, 0, 6.2832); x.fill();
    x.fillStyle = '#ffe8c9'; rr(x, 2, 46, 24, 8, 4); x.fill();
    return o.c;
  }
  function pipCane() {
    var o = mk(20, 96), x = o.x;
    x.fillStyle = '#ffe8c9'; rr(x, 6, 12, 8, 84, 4); x.fill();
    x.fillStyle = '#2a1145'; rr(x, 6, 40, 8, 12, 2); x.fill();
    x.fillStyle = '#ffc23d'; x.beginPath(); x.arc(10, 10, 9, 0, 6.2832); x.fill();
    return o.c;
  }

  /* --------------------------------------------------------------- panels -- */
  function panel(w, h, opt) {
    opt = opt || {};
    var o = mk(w, h), x = o.x, r = opt.radius == null ? 18 : opt.radius;
    var f1 = opt.fill || 'rgba(28,12,46,0.94)', f2 = opt.fill2 || 'rgba(18,7,32,0.96)';
    x.fillStyle = lg(x, 0, 0, 0, h, [[0, f1], [1, f2]]);
    rr(x, 0, 0, w, h, r); x.fill();
    x.strokeStyle = opt.stroke || 'rgba(255,194,61,0.42)'; x.lineWidth = opt.lw || 2;
    rr(x, 1, 1, w - 2, h - 2, r); x.stroke();
    if (opt.sheen !== false) {
      x.fillStyle = 'rgba(255,255,255,0.06)';
      rr(x, 4, 4, w - 8, Math.min(h * 0.4, 34), r - 4); x.fill();
    }
    return o.c;
  }
  function button(w, h, kind) {
    var o = mk(w, h), x = o.x, r = Math.min(h / 2, 22);
    var top, bot, edge, glow;
    if (kind === 'primary') { top = '#ffd96b'; bot = '#e8901e'; edge = '#8a4a08'; glow = PAL.gold; }
    else if (kind === 'accent') { top = '#5ff0e2'; bot = '#12a89a'; edge = '#065c54'; glow = PAL.teal; }
    else if (kind === 'danger') { top = '#ff8fa8'; bot = '#c22c48'; edge = '#6b0f22'; glow = PAL.red; }
    else if (kind === 'ghost') { top = 'rgba(58,32,84,0.9)'; bot = 'rgba(34,16,54,0.94)'; edge = 'rgba(160,107,255,0.6)'; glow = null; }
    else { top = '#a06bff'; bot = '#5a2ba8'; edge = '#2c0f58'; glow = PAL.violet; }
    if (glow) {
      x.fillStyle = rgba(glow, 0.18);
      rr(x, 0, 0, w, h, r); x.fill();
    }
    x.fillStyle = edge; rr(x, 2, 4, w - 4, h - 4, r); x.fill();
    x.fillStyle = lg(x, 0, 2, 0, h - 4, [[0, top], [1, bot]]);
    rr(x, 2, 2, w - 4, h - 8, r); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.28)';
    rr(x, 8, 6, w - 16, (h - 8) * 0.42, r * 0.7); x.fill();
    return o.c;
  }
  function chip(w, h) {
    var o = mk(w, h), x = o.x, r = h / 2;
    x.fillStyle = 'rgba(12,5,24,0.78)'; rr(x, 0, 0, w, h, r); x.fill();
    x.strokeStyle = 'rgba(255,232,201,0.24)'; x.lineWidth = 1.6;
    rr(x, 0.8, 0.8, w - 1.6, h - 1.6, r); x.stroke();
    return o.c;
  }
  function bannerPlate(w, h) {
    var o = mk(w, h), x = o.x;
    x.fillStyle = rgba(PAL.gold, 0.16); rr(x, 0, 0, w, h, 20); x.fill();
    x.fillStyle = lg(x, 0, 0, 0, h, [[0, 'rgba(52,20,80,0.97)'], [1, 'rgba(24,8,42,0.98)']]);
    rr(x, 6, 6, w - 12, h - 12, 16); x.fill();
    x.strokeStyle = PAL.gold; x.lineWidth = 3;
    rr(x, 7.5, 7.5, w - 15, h - 15, 15); x.stroke();
    var pts = [], n = Math.round(w / 34);
    for (var i = 0; i <= n; i++) pts.push([8 + (w - 16) * i / n, 8]);
    bulbs(x, pts, [PAL.gold, PAL.cream, PAL.rose], 3.6);
    return o.c;
  }
  function ticketArt(idx, tone) {
    var o = mk(96, 96), x = o.x;
    x.fillStyle = tone; rr(x, 8, 20, 80, 56, 10); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.22)'; rr(x, 12, 24, 72, 22, 8); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.32)';
    x.beginPath(); x.arc(8, 48, 8, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(88, 48, 8, 0, 6.2832); x.fill();
    var shapes = ['star', 'ring', 'bell', 'balloon', 'horse', 'gem'];
    var s = shapes[idx % shapes.length];
    x.fillStyle = 'rgba(255,255,255,0.9)';
    if (s === 'star') { starPath(x, 48, 50, 20, 8, 5); x.fill(); }
    else if (s === 'ring') { x.lineWidth = 7; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(48, 50, 16, 0, 6.2832); x.stroke(); }
    else if (s === 'bell') { x.beginPath(); x.moveTo(32, 66); x.quadraticCurveTo(34, 34, 48, 32); x.quadraticCurveTo(62, 34, 64, 66); x.closePath(); x.fill(); }
    else if (s === 'balloon') { x.beginPath(); x.ellipse(48, 48, 15, 18, 0, 0, 6.2832); x.fill(); poly(x, [[44, 66], [52, 66], [48, 74]]); x.fill(); }
    else if (s === 'horse') { poly(x, [[32, 68], [36, 46], [46, 36], [50, 28], [60, 34], [62, 48], [66, 68], [56, 68], [52, 56], [42, 56], [40, 68]]); x.fill(); }
    else { starPath(x, 48, 50, 19, 12, 6); x.fill(); }
    return o.c;
  }

  /* ---------------------------------------------------------------- build -- */
  // Every texture is registered here; the loader walks the list so the
  // progress bar reflects real work.
  function buildJobs(scene, machines) {
    var jobs = [];
    function add(key, fn) {
      jobs.push(function () {
        if (scene.textures.exists(key)) return;
        scene.textures.addCanvas(key, fn());
      });
    }
    Object.keys(THEME).forEach(function (id) {
      add('bd_' + id, function () { return backdrop(id); });
      add('cab_' + id, function () { return cabinet(id); });
    });
    // symbols
    machines.forEach(function (m) {
      var set = SYMBOLS[m.id];
      if (m.id === 'cascade') {
        for (var t = 0; t < 6; t++) {
          (function (tier) { add('sym_cascade_g' + tier, function () { var o = symBase(null); gemSym(tier)(o.x); return o.c; }); })(t);
        }
      } else {
        Object.keys(set).forEach(function (code) {
          add('sym_' + m.id + '_' + code, function () { var o = symBase(null); set[code](o.x); return o.c; });
        });
      }
    });
    add('p_dot', pDot); add('p_spark', pSpark); add('p_star', pStar);
    add('p_conf', pConf); add('p_ring', pRing); add('p_coin', pCoin);
    add('p_puff', pPuff); add('glow_soft', glowSoft);
    add('wheel_face', function () { return wheelFace(CR_MACHINES.D.layout, CR_MACHINES.D.segments); });
    add('wheel_hub', wheelHub); add('wheel_ptr', wheelPointer);
    add('pip_head', pipHead); add('pip_hat', pipHat); add('pip_body', pipBody);
    add('pip_arm', pipArm); add('pip_cane', pipCane);
    // ui plates
    add('ui_topbar', function () { return panel(720, 96, { radius: 0, stroke: 'rgba(255,194,61,0.28)', sheen: false }); });
    add('ui_dock', function () { return panel(720, 210, { radius: 26, stroke: 'rgba(255,194,61,0.3)' }); });
    add('ui_card', function () { return panel(660, 120, { radius: 18 }); });
    add('ui_sheet', function () { return panel(660, 980, { radius: 24 }); });
    add('ui_row', function () { return panel(612, 54, { radius: 12, stroke: 'rgba(255,232,201,0.18)', sheen: false }); });
    add('btn_spin', function () { return button(300, 104, 'primary'); });
    add('btn_wide', function () { return button(420, 92, 'primary'); });
    add('btn_mid', function () { return button(300, 84, 'violet'); });
    add('btn_accent', function () { return button(300, 84, 'accent'); });
    add('btn_ghost', function () { return button(300, 84, 'ghost'); });
    add('btn_small', function () { return button(132, 84, 'ghost'); });
    add('btn_sq', function () { return button(84, 84, 'ghost'); });
    add('btn_sq_accent', function () { return button(84, 84, 'accent'); });
    add('btn_pick', function () { return button(168, 168, 'violet'); });
    add('btn_close', function () { return button(240, 84, 'danger'); });
    add('chip_sm', function () { return chip(200, 56); });
    add('chip_lg', function () { return chip(300, 64); });
    add('banner', function () { return bannerPlate(468, 196); });
    add('bar_track', function () {
      var o = mk(300, 16), x = o.x;
      x.fillStyle = 'rgba(8,3,18,0.85)'; rr(x, 0, 0, 300, 16, 8); x.fill();
      x.strokeStyle = 'rgba(255,232,201,0.2)'; x.lineWidth = 1.4;
      rr(x, 0.7, 0.7, 298.6, 14.6, 8); x.stroke();
      return o.c;
    });
    add('bar_fill', function () {
      var o = mk(300, 16), x = o.x;
      x.fillStyle = lg(x, 0, 0, 300, 0, [[0, PAL.teal], [0.6, PAL.gold], [1, PAL.rose]]);
      rr(x, 0, 0, 300, 16, 8); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.3)'; rr(x, 3, 2, 294, 6, 3); x.fill();
      return o.c;
    });
    add('band_soft', function () {
      var o = mk(120, 40), x = o.x;
      x.fillStyle = '#ffffff'; rr(x, 0, 0, 120, 40, 20); x.fill();
      return o.c;
    });
    add('strip_coach', function () { return panel(640, 62, { radius: 14, fill: 'rgba(20,8,36,0.86)', fill2: 'rgba(14,5,28,0.9)', stroke: 'rgba(53,224,208,0.4)', sheen: false }); });
    var tones = ['#ff4d6d', '#ffc23d', '#35e0d0', '#a06bff', '#7ef2a8', '#ff8fb1'];
    for (var ti = 0; ti < 6; ti++) {
      (function (i2) { add('tick_' + i2, function () { return ticketArt(i2, tones[i2]); }); })(ti);
    }
    return jobs;
  }

  root.CR_ART = {
    PAL: PAL, THEME: THEME, GEO: GEO, FONT: FONT,
    buildJobs: buildJobs, mix: mix, rgba: rgba, panel: panel, button: button
  };
})(typeof window !== 'undefined' ? window : globalThis);
