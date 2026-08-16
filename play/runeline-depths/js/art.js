/* Runeline Depths - procedural art bakery.
 * Every visual in this title is drawn here into canvas textures at load or
 * layout time and handed to Phaser. Nothing is drawn per frame with the
 * Graphics command list except the two hand-tessellated rings, because
 * Phaser Graphics replays its entire command list every frame.
 * No image files ship with this title.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  var Art = {}; RD.Art = Art;

  /* --------------------------------------------------------- colour */
  function hx(n) {
    var s = (n & 0xffffff).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }
  function mix(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | (((ab + (bb - ab) * t) | 0));
  }
  function lighten(c, t) { return mix(c, 0xffffff, t); }
  function darken(c, t) { return mix(c, 0x000000, t); }
  function rgba(c, a) {
    return 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',' + a + ')';
  }
  Art.hx = hx; Art.mix = mix; Art.lighten = lighten; Art.darken = darken; Art.rgba = rgba;

  var INK = 0x182238, HIGHLIGHT = 0xF7FBFF;
  Art.INK = INK; Art.HIGHLIGHT = HIGHLIGHT;

  /* deterministic cosmetic stream so bakes are stable between runs */
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  Art.rng = rng;

  function cvs(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  Art.cvs = cvs;

  function put(scene, key, canvas) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
    return key;
  }
  Art.put = put;

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
  Art.roundRect = roundRect;

  function poly(ctx, pts, close) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[0], pts[1]); else ctx.lineTo(pts[i], pts[i + 1]);
    }
    if (close !== false) ctx.closePath();
  }

  /* ------------------------------------------------------ silhouettes */
  /* Each orb family owns a distinct outer shape so the board survives a
     grayscale or colour-blind check without relying on hue. */
  function silhouette(ctx, shape, cx, cy, r) {
    var i, a, pts = [];
    switch (shape) {
      case 'hex':
        for (i = 0; i < 6; i++) { a = -Math.PI / 2 + i * Math.PI / 3; pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        poly(ctx, pts); break;
      case 'oct':
        for (i = 0; i < 8; i++) { a = -Math.PI / 2 + i * Math.PI / 4; var rr = i % 2 ? r * 0.9 : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        poly(ctx, pts); break;
      case 'square':
        roundRect(ctx, cx - r * 0.88, cy - r * 0.88, r * 1.76, r * 1.76, r * 0.34); break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 0.5, cx + r, cy);
        ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.5, cx, cy + r);
        ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.5, cx - r, cy);
        ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 0.5, cx, cy - r);
        ctx.closePath(); break;
      case 'petal':
        ctx.beginPath();
        for (i = 0; i <= 48; i++) {
          a = (i / 48) * Math.PI * 2 - Math.PI / 2;
          var k = r * (0.92 + 0.13 * Math.cos(a * 5));
          var px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    }
  }

  /* ----------------------------------------------------------- glyphs */
  /* Centred, filled, large. Survives grayscale; never decorative only. */
  function glyph(ctx, kind, cx, cy, r, fill, stroke) {
    var i, a, pts = [];
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.4, r * 0.16);
    ctx.lineJoin = 'round';
    switch (kind) {
      case 'flame':
        /* square-shouldered flame: broad base, notched crown */
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.72, cy + r * 0.78);
        ctx.lineTo(cx - r * 0.72, cy - r * 0.10);
        ctx.lineTo(cx - r * 0.24, cy - r * 0.52);
        ctx.lineTo(cx - r * 0.06, cy - r * 0.14);
        ctx.lineTo(cx + r * 0.28, cy - r * 0.86);
        ctx.lineTo(cx + r * 0.72, cy - r * 0.02);
        ctx.lineTo(cx + r * 0.72, cy + r * 0.78);
        ctx.closePath();
        break;
      case 'drop':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.92);
        ctx.bezierCurveTo(cx + r * 0.86, cy - r * 0.05, cx + r * 0.68, cy + r * 0.86, cx, cy + r * 0.86);
        ctx.bezierCurveTo(cx - r * 0.68, cy + r * 0.86, cx - r * 0.86, cy - r * 0.05, cx, cy - r * 0.92);
        ctx.closePath();
        break;
      case 'leaf':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.78, cy + r * 0.72);
        ctx.bezierCurveTo(cx - r * 0.9, cy - r * 0.5, cx - r * 0.1, cy - r * 0.95, cx + r * 0.8, cy - r * 0.78);
        ctx.bezierCurveTo(cx + r * 0.88, cy + r * 0.2, cx + r * 0.1, cy + r * 0.9, cx - r * 0.78, cy + r * 0.72);
        ctx.closePath();
        break;
      case 'star6':
        for (i = 0; i < 12; i++) {
          a = -Math.PI / 2 + i * Math.PI / 6;
          var k6 = i % 2 ? r * 0.42 : r * 0.95;
          pts.push(cx + Math.cos(a) * k6, cy + Math.sin(a) * k6);
        }
        poly(ctx, pts);
        break;
      case 'sun':
        ctx.beginPath();
        for (i = 0; i < 8; i++) {
          a = -Math.PI / 2 + i * Math.PI / 4;
          var k4 = i % 2 ? r * 0.30 : r * 0.98;
          var x4 = cx + Math.cos(a) * k4, y4 = cy + Math.sin(a) * k4;
          if (i === 0) ctx.moveTo(x4, y4); else ctx.lineTo(x4, y4);
        }
        ctx.closePath();
        break;
      case 'heart':
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.86);
        ctx.bezierCurveTo(cx - r * 1.15, cy + r * 0.02, cx - r * 0.62, cy - r * 0.95, cx, cy - r * 0.30);
        ctx.bezierCurveTo(cx + r * 0.62, cy - r * 0.95, cx + r * 1.15, cy + r * 0.02, cx, cy + r * 0.86);
        ctx.closePath();
        break;
      case 'chain':
        ctx.beginPath();
        ctx.arc(cx - r * 0.34, cy, r * 0.42, 0, Math.PI * 2);
        ctx.moveTo(cx + r * 0.76, cy);
        ctx.arc(cx + r * 0.34, cy, r * 0.42, 0, Math.PI * 2);
        break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    }
    if (stroke) ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
  Art.glyph = glyph;

  /* ------------------------------------------------------------ orbs */
  /* size = pixel size of one cell texture. Depth skin changes the rim
     material and the speckle so the same family reads differently per
     depth without changing its semantic colour. */
  var RIM = {
    stone:    { rim: 0x6E7C8C, speck: 0xB8C4CE, n: 10 },
    basalt:   { rim: 0x50413F, speck: 0xC08454, n: 14 },
    wetstone: { rim: 0x4C6B78, speck: 0xA9DCE4, n: 12 },
    obsidian: { rim: 0x3A3358, speck: 0xE6DCFF, n: 16 }
  };

  Art.bakeOrb = function (family, depthId, size, lifted) {
    var o = RD.orb(family);
    var d = RD.depth(depthId);
    var rim = RIM[d.rim] || RIM.stone;
    var S = Math.max(18, Math.round(size));
    var c = cvs(S, S), ctx = c.getContext('2d');
    var cx = S / 2, cy = S / 2, r = S * 0.415;
    var rnd = rng((family.charCodeAt(0) * 131 + depthId.charCodeAt(0) * 7717 + S) >>> 0);

    /* contact shadow */
    ctx.save();
    ctx.globalAlpha = lifted ? 0.5 : 0.34;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.74, r * 0.78, r * 0.26, 0, 0, Math.PI * 2);
    ctx.filter = 'blur(2px)';
    ctx.fill();
    ctx.restore();

    /* material rim ring: the depth skin */
    ctx.save();
    silhouette(ctx, o.shape, cx, cy + 1, r * 1.0);
    var rg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    rg.addColorStop(0, hx(lighten(rim.rim, 0.30)));
    rg.addColorStop(1, hx(darken(rim.rim, 0.45)));
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.restore();

    /* body */
    ctx.save();
    silhouette(ctx, o.shape, cx, cy, r * 0.88);
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, hx(lighten(o.color, lifted ? 0.46 : 0.30)));
    g.addColorStop(0.52, hx(o.color));
    g.addColorStop(1, hx(o.deep));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    /* fake-lambert top light */
    var lg = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.42, r * 0.05, cx - r * 0.2, cy - r * 0.3, r * 1.25);
    lg.addColorStop(0, 'rgba(255,255,255,' + (lifted ? 0.55 : 0.38) + ')');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, S, S);
    /* low frequency mineral speckle, depth-specific */
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = hx(rim.speck);
    for (var i = 0; i < rim.n; i++) {
      var px = rnd() * S, py = rnd() * S, ps = 0.7 + rnd() * (S * 0.035);
      ctx.beginPath(); ctx.arc(px, py, ps, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* edge highlight */
    ctx.save();
    silhouette(ctx, o.shape, cx, cy, r * 0.88);
    ctx.lineWidth = Math.max(1, S * 0.035);
    ctx.strokeStyle = rgba(HIGHLIGHT, lifted ? 0.85 : 0.42);
    ctx.stroke();
    ctx.restore();

    /* glyph, at least 60 percent of the cell */
    var gcol = (family === 'aether' || family === 'moss') ? hx(darken(o.deep, 0.35)) : hx(HIGHLIGHT);
    var gedge = (family === 'aether' || family === 'moss') ? rgba(HIGHLIGHT, 0.55) : rgba(INK, 0.55);
    glyph(ctx, o.glyph, cx, cy, r * 0.50, gcol, gedge);

    if (lifted) {
      ctx.save();
      silhouette(ctx, o.shape, cx, cy, r * 1.0);
      ctx.lineWidth = Math.max(1.5, S * 0.05);
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.95);
      ctx.stroke();
      ctx.restore();
    }
    return c;
  };

  /* Bind chains: drawn once, tinted per family at draw time. */
  Art.bakeBind = function (size) {
    var S = Math.max(18, Math.round(size));
    var c = cvs(S, S), ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(2, S * 0.075);
    ctx.lineCap = 'round';
    for (var k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.moveTo(S * 0.10, S * (0.5 + k * 0.24));
      ctx.lineTo(S * 0.90, S * (0.5 + k * 0.24));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,26,42,0.55)';
    roundRect(ctx, 1, 1, S - 2, S - 2, S * 0.22); ctx.fill();
    glyph(ctx, 'chain', S / 2, S / 2, S * 0.20, 'rgba(255,255,255,0.95)', null);
    return c;
  };

  /* --------------------------------------------------- board & frame */
  /* The frame plus the whole empty cell field is baked into ONE texture.
     A 30 cell grid drawn as live Graphics costs hundreds of commands per
     frame at throttle; this costs one image draw. */
  Art.bakeBoard = function (depthId, cell, cols, rows, pad) {
    var d = RD.depth(depthId);
    var W = cols * cell + pad * 2, H = rows * cell + pad * 2;
    var c = cvs(W, H), ctx = c.getContext('2d');
    var rnd = rng(depthId.charCodeAt(0) * 977 + cell);

    /* plate */
    ctx.save();
    roundRect(ctx, 0, 0, W, H, 16);
    var pg = ctx.createLinearGradient(0, 0, 0, H);
    pg.addColorStop(0, hx(lighten(d.frame.plate, 0.16)));
    pg.addColorStop(1, hx(darken(d.frame.plate, 0.30)));
    ctx.fillStyle = pg; ctx.fill();
    ctx.clip();
    /* quiet material grain */
    ctx.globalAlpha = 0.07;
    for (var i = 0; i < 70; i++) {
      ctx.fillStyle = rnd() > 0.5 ? hx(d.frame.trim) : '#000000';
      ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 26, 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* trim edge + one pixel highlight */
    roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 15);
    ctx.lineWidth = 3; ctx.strokeStyle = hx(d.frame.trim); ctx.stroke();
    roundRect(ctx, 3.5, 3.5, W - 7, H - 7, 13);
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(HIGHLIGHT, 0.30); ctx.stroke();

    /* corner bolts: material cue that connects to the depth */
    [[pad * 0.52, pad * 0.52], [W - pad * 0.52, pad * 0.52],
     [pad * 0.52, H - pad * 0.52], [W - pad * 0.52, H - pad * 0.52]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2.5, pad * 0.20), 0, Math.PI * 2);
      ctx.fillStyle = hx(d.frame.bolt); ctx.fill();
      ctx.beginPath(); ctx.arc(p[0] - 0.6, p[1] - 0.6, Math.max(1.2, pad * 0.10), 0, Math.PI * 2);
      ctx.fillStyle = rgba(HIGHLIGHT, 0.5); ctx.fill();
    });

    /* inner well */
    roundRect(ctx, pad - 4, pad - 4, cols * cell + 8, rows * cell + 8, 10);
    ctx.fillStyle = hx(d.frame.inner); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(0x000000, 0.5); ctx.stroke();

    /* cell field with a repeatable rhythm */
    for (var r = 0; r < rows; r++) {
      for (var q = 0; q < cols; q++) {
        var x = pad + q * cell, y = pad + r * cell;
        var alt = (q + r) % 2 === 0;
        roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.20);
        ctx.fillStyle = hx(alt ? d.cell.void : darken(d.cell.void, 0.12));
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(d.cell.edge, 0.42);
        ctx.stroke();
        /* inner shadow at the top so cells read as wells */
        var sg = ctx.createLinearGradient(0, y + 2, 0, y + cell * 0.5);
        sg.addColorStop(0, 'rgba(0,0,0,0.34)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.20);
        ctx.fillStyle = sg; ctx.fill();
      }
    }
    return c;
  };

  /* Vertical backdrop strip, stretched to the view. Resize proof. */
  Art.bakeSky = function (depthId) {
    var d = RD.depth(depthId);
    var c = cvs(8, 256), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hx(d.sky[0]));
    g.addColorStop(0.55, hx(d.sky[1]));
    g.addColorStop(1, hx(d.sky[2]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256);
    return c;
  };

  /* A soft corner vignette, stretched over the backdrop. */
  Art.bakeVignette = function () {
    var S = 128, c = cvs(S, S), ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return c;
  };

  /* --------------------------------------------------------- motes */
  /* One ambient prop class per depth motif, drawn once and pooled. */
  Art.bakeMote = function (depthId) {
    var d = RD.depth(depthId), S = 28;
    var c = cvs(S, S), ctx = c.getContext('2d');
    var cx = S / 2, cy = S / 2;
    ctx.save();
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, S / 2);
    g.addColorStop(0, rgba(d.mote, 0.85));
    g.addColorStop(0.4, rgba(d.mote, 0.28));
    g.addColorStop(1, rgba(d.mote, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.restore();
    if (d.motif === 'spores') {
      ctx.strokeStyle = rgba(d.mote, 0.8); ctx.lineWidth = 1.4;
      for (var i = 0; i < 5; i++) {
        var a = i * Math.PI * 2 / 5;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); ctx.stroke();
      }
    } else if (d.motif === 'embers') {
      ctx.fillStyle = rgba(0xFFF0D0, 0.95);
      ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (d.motif === 'pages') {
      ctx.fillStyle = rgba(0xE8F6FA, 0.7);
      ctx.fillRect(cx - 5, cy - 3.5, 10, 7);
      ctx.strokeStyle = rgba(0x0A1A24, 0.5); ctx.lineWidth = 1;
      ctx.strokeRect(cx - 5, cy - 3.5, 10, 7);
    } else {
      ctx.strokeStyle = rgba(0xFFF6D8, 0.9); ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx, cy - 6); ctx.lineTo(cx + 5, cy + 5);
      ctx.stroke();
    }
    return c;
  };

  /* ----------------------------------------------------- particles */
  Art.bakeSpark = function () {
    var S = 24, c = cvs(S, S), ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return c;
  };
  Art.bakeShard = function () {
    var S = 18, c = cvs(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    poly(ctx, [S * 0.5, 0, S, S * 0.42, S * 0.66, S, S * 0.18, S * 0.82, 0, S * 0.3]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    return c;
  };
  Art.bakeStreak = function () {
    var W = 48, H = 10, c = cvs(W, H), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, H * 0.25, W, H * 0.5, H * 0.25); ctx.fill();
    return c;
  };
  Art.bakeRing = function () {
    var S = 96, c = cvs(S, S), ctx = c.getContext('2d');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); ctx.stroke();
    return c;
  };
  Art.bakeDot = function () {
    var S = 12, c = cvs(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.fill();
    return c;
  };
  /* 1x1 white pixel: every bar, plate and scrim scales this one image */
  Art.bakePixel = function () {
    var c = cvs(2, 2), ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 2, 2);
    return c;
  };

  /* --------------------------------------------------------- UI cards */
  Art.bakeCard = function (w, h, r, fill, edge, alpha) {
    var c = cvs(w, h), ctx = c.getContext('2d');
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r);
    ctx.fillStyle = rgba(fill, alpha == null ? 0.92 : alpha);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(edge, 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r, 1.5); ctx.lineTo(w - r, 1.5);
    ctx.strokeStyle = rgba(HIGHLIGHT, 0.16); ctx.stroke();
    return c;
  };

  Art.bakeButton = function (w, h, tint, bright) {
    var c = cvs(w, h), ctx = c.getContext('2d');
    roundRect(ctx, 1, 1, w - 2, h - 2, Math.min(14, h / 2));
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hx(lighten(tint, bright ? 0.34 : 0.16)));
    g.addColorStop(1, hx(darken(tint, bright ? 0.10 : 0.30)));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(HIGHLIGHT, bright ? 0.55 : 0.25);
    ctx.stroke();
    return c;
  };

  /* ------------------------------------------------------ portraits */
  /* Runeguard badge: elemental shield, family silhouette, rune mark. */
  Art.bakeGuard = function (guardId, size, evolved) {
    var g = RD.guard(guardId);
    var o = RD.orb(g.el);
    var S = Math.max(28, Math.round(size));
    var c = cvs(S, S), ctx = c.getContext('2d');
    var cx = S / 2, cy = S / 2;
    var rnd = rng(guardId.length * 3313 + guardId.charCodeAt(0) * 71 + (evolved ? 5 : 0));

    /* shield plate */
    ctx.beginPath();
    ctx.moveTo(cx, S * 0.04);
    ctx.lineTo(S * 0.94, S * 0.24);
    ctx.lineTo(S * 0.94, S * 0.62);
    ctx.quadraticCurveTo(S * 0.94, S * 0.90, cx, S * 0.98);
    ctx.quadraticCurveTo(S * 0.06, S * 0.90, S * 0.06, S * 0.62);
    ctx.lineTo(S * 0.06, S * 0.24);
    ctx.closePath();
    var pg = ctx.createLinearGradient(0, 0, 0, S);
    pg.addColorStop(0, hx(lighten(o.deep, evolved ? 0.42 : 0.24)));
    pg.addColorStop(1, hx(darken(o.deep, 0.34)));
    ctx.fillStyle = pg; ctx.fill();
    ctx.save(); ctx.clip();

    /* creature silhouette: a stylised head mark unique per runeguard */
    var head = S * 0.20 + rnd() * S * 0.05;
    ctx.fillStyle = rgba(o.color, 0.92);
    ctx.beginPath();
    ctx.ellipse(cx, cy + S * 0.04, head * 1.15, head, 0, 0, Math.PI * 2);
    ctx.fill();
    /* ears / horns / fins vary by the id hash so all sixteen differ */
    var horns = 2 + Math.floor(rnd() * 3);
    ctx.strokeStyle = rgba(lighten(o.color, 0.4), 0.95);
    ctx.lineWidth = Math.max(1.6, S * 0.045);
    ctx.lineCap = 'round';
    for (var i = 0; i < horns; i++) {
      var a = -Math.PI * 0.85 + (i / Math.max(1, horns - 1)) * Math.PI * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * head * 0.9, cy + S * 0.04 + Math.sin(a) * head * 0.9);
      ctx.lineTo(cx + Math.cos(a) * head * 1.7, cy + S * 0.04 + Math.sin(a) * head * 1.75);
      ctx.stroke();
    }
    /* eyes */
    ctx.fillStyle = hx(INK);
    ctx.beginPath(); ctx.arc(cx - head * 0.38, cy + S * 0.02, head * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + head * 0.38, cy + S * 0.02, head * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(HIGHLIGHT, 0.85);
    ctx.beginPath(); ctx.arc(cx - head * 0.34, cy - head * 0.02, head * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + head * 0.42, cy - head * 0.02, head * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* element mark bottom left, always paired with the plate colour */
    glyph(ctx, o.glyph, S * 0.22, S * 0.80, S * 0.11, hx(HIGHLIGHT), rgba(INK, 0.6));

    /* evolved runeguards get a broad centre-stroke rune band */
    if (evolved) {
      ctx.strokeStyle = rgba(0xFFF2C4, 0.9);
      ctx.lineWidth = Math.max(2, S * 0.05);
      ctx.beginPath();
      ctx.moveTo(S * 0.62, S * 0.70); ctx.lineTo(S * 0.86, S * 0.70);
      ctx.moveTo(S * 0.74, S * 0.62); ctx.lineTo(S * 0.74, S * 0.86);
      ctx.stroke();
    }

    /* plate edge */
    ctx.beginPath();
    ctx.moveTo(cx, S * 0.04);
    ctx.lineTo(S * 0.94, S * 0.24);
    ctx.lineTo(S * 0.94, S * 0.62);
    ctx.quadraticCurveTo(S * 0.94, S * 0.90, cx, S * 0.98);
    ctx.quadraticCurveTo(S * 0.06, S * 0.90, S * 0.06, S * 0.62);
    ctx.lineTo(S * 0.06, S * 0.24);
    ctx.closePath();
    ctx.lineWidth = Math.max(1.5, S * 0.035);
    ctx.strokeStyle = evolved ? rgba(0xFFF2C4, 0.95) : rgba(HIGHLIGHT, 0.42);
    ctx.stroke();
    return c;
  };

  /* --------------------------------------------------------- enemies */
  /* Layered body, feature pass, rim light, contact shadow. Family adds a
     material overlay so a Vault sentry and a Core sentry read apart. */
  /* Path only. Callers that clip or stroke must never re-fill the body,
     or they paint over the feature and eye passes. */
  function foePath(ctx, shape, S) {
    var cx = S / 2, cy = S * 0.54, R = S * 0.34;
    ctx.beginPath();
    switch (shape) {
      case 'beast':
        ctx.ellipse(cx, cy + R * 0.15, R * 1.15, R * 0.82, 0, 0, Math.PI * 2);
        break;
      case 'serpent':
        ctx.moveTo(cx - R * 1.2, cy + R * 0.8);
        ctx.bezierCurveTo(cx - R * 0.4, cy - R * 0.4, cx + R * 0.5, cy + R * 1.0, cx + R * 1.15, cy - R * 0.6);
        ctx.lineTo(cx + R * 0.7, cy - R * 1.05);
        ctx.bezierCurveTo(cx + R * 0.1, cy + R * 0.4, cx - R * 0.5, cy - R * 0.2, cx - R * 1.2, cy + R * 0.8);
        break;
      case 'tower': case 'golem':
        roundRect(ctx, cx - R * 0.78, cy - R * 1.05, R * 1.56, R * 2.0, R * 0.28);
        break;
      case 'wisp': case 'lantern':
        ctx.ellipse(cx, cy, R * 0.72, R * 1.05, 0, 0, Math.PI * 2);
        break;
      case 'spider':
        ctx.ellipse(cx, cy + R * 0.1, R * 0.86, R * 0.68, 0, 0, Math.PI * 2);
        break;
      case 'robed': case 'wraith':
        ctx.moveTo(cx, cy - R * 1.2);
        ctx.bezierCurveTo(cx + R, cy - R * 0.6, cx + R * 1.05, cy + R * 1.1, cx + R * 0.7, cy + R * 1.15);
        ctx.lineTo(cx - R * 0.7, cy + R * 1.15);
        ctx.bezierCurveTo(cx - R * 1.05, cy + R * 1.1, cx - R, cy - R * 0.6, cx, cy - R * 1.2);
        break;
      case 'book': case 'wall':
        roundRect(ctx, cx - R * 1.05, cy - R * 0.8, R * 2.1, R * 1.6, R * 0.16);
        break;
      case 'squat':
        ctx.ellipse(cx, cy + R * 0.25, R * 1.2, R * 0.75, 0, 0, Math.PI * 2);
        break;
      case 'insect': case 'swarm': case 'moth':
        ctx.ellipse(cx, cy, R * 0.5, R * 0.95, 0, 0, Math.PI * 2);
        break;
      case 'fish':
        ctx.ellipse(cx - R * 0.1, cy, R * 1.0, R * 0.6, 0, 0, Math.PI * 2);
        break;
      case 'bloom': case 'vine':
        ctx.ellipse(cx, cy + R * 0.2, R * 0.7, R * 0.8, 0, 0, Math.PI * 2);
        break;
      case 'wheel': case 'bell':
        ctx.arc(cx, cy, R * 1.0, 0, Math.PI * 2);
        break;
      case 'maw':
        ctx.moveTo(cx - R * 1.1, cy - R * 0.9);
        ctx.quadraticCurveTo(cx, cy + R * 1.5, cx + R * 1.1, cy - R * 0.9);
        ctx.quadraticCurveTo(cx, cy - R * 0.2, cx - R * 1.1, cy - R * 0.9);
        break;
      case 'glyph':
        ctx.moveTo(cx, cy - R * 1.1);
        ctx.lineTo(cx + R * 1.0, cy);
        ctx.lineTo(cx, cy + R * 1.1);
        ctx.lineTo(cx - R * 1.0, cy);
        ctx.closePath();
        break;
      case 'choir': case 'cluster':
        ctx.arc(cx - R * 0.55, cy + R * 0.3, R * 0.55, 0, Math.PI * 2);
        ctx.moveTo(cx + R * 1.1, cy + R * 0.3);
        ctx.arc(cx + R * 0.55, cy + R * 0.3, R * 0.55, 0, Math.PI * 2);
        ctx.moveTo(cx + R * 0.7, cy - R * 0.5);
        ctx.arc(cx, cy - R * 0.5, R * 0.7, 0, Math.PI * 2);
        break;
      default:
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
    }
    ctx.closePath();
    return { cx: cx, cy: cy, R: R };
  }

  function foeBody(ctx, shape, S, col, deep) {
    var b = foePath(ctx, shape, S);
    var g = ctx.createLinearGradient(0, b.cy - b.R * 1.2, 0, b.cy + b.R * 1.2);
    g.addColorStop(0, hx(lighten(col, 0.34)));
    g.addColorStop(0.55, hx(col));
    g.addColorStop(1, hx(deep));
    ctx.fillStyle = g;
    ctx.fill();
    return b;
  }

  function foeFeatures(ctx, shape, S, b, col) {
    var cx = b.cx, cy = b.cy, R = b.R;
    ctx.save();
    ctx.strokeStyle = rgba(HIGHLIGHT, 0.65);
    ctx.lineWidth = Math.max(1.6, S * 0.016);
    ctx.lineCap = 'round';
    if (shape === 'spider') {
      for (var i = 0; i < 4; i++) {
        var t = -0.6 + i * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.6, cy + t * R);
        ctx.quadraticCurveTo(cx - R * 1.5, cy + t * R - R * 0.4, cx - R * 1.7, cy + R * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + R * 0.6, cy + t * R);
        ctx.quadraticCurveTo(cx + R * 1.5, cy + t * R - R * 0.4, cx + R * 1.7, cy + R * 0.8);
        ctx.stroke();
      }
    } else if (shape === 'moth' || shape === 'insect' || shape === 'swarm') {
      ctx.fillStyle = rgba(col, 0.5);
      ctx.beginPath(); ctx.ellipse(cx - R * 0.85, cy - R * 0.15, R * 0.75, R * 0.5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + R * 0.85, cy - R * 0.15, R * 0.75, R * 0.5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.5);
      ctx.beginPath(); ctx.ellipse(cx - R * 0.85, cy - R * 0.15, R * 0.75, R * 0.5, -0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + R * 0.85, cy - R * 0.15, R * 0.75, R * 0.5, 0.5, 0, Math.PI * 2); ctx.stroke();
    } else if (shape === 'fish') {
      ctx.fillStyle = rgba(col, 0.75);
      poly(ctx, [cx + R * 0.85, cy, cx + R * 1.6, cy - R * 0.6, cx + R * 1.6, cy + R * 0.6]);
      ctx.fill();
    } else if (shape === 'beast') {
      poly(ctx, [cx - R * 0.75, cy - R * 0.5, cx - R * 0.95, cy - R * 1.2, cx - R * 0.3, cy - R * 0.72], true);
      ctx.fillStyle = rgba(col, 0.9); ctx.fill();
      poly(ctx, [cx + R * 0.75, cy - R * 0.5, cx + R * 0.95, cy - R * 1.2, cx + R * 0.3, cy - R * 0.72], true);
      ctx.fill();
    } else if (shape === 'tower' || shape === 'golem' || shape === 'wall') {
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.6, cy - R * 0.2); ctx.lineTo(cx + R * 0.6, cy - R * 0.2);
      ctx.moveTo(cx - R * 0.6, cy + R * 0.4); ctx.lineTo(cx + R * 0.6, cy + R * 0.4);
      ctx.stroke();
    } else if (shape === 'wheel' || shape === 'bell') {
      for (var k = 0; k < 8; k++) {
        var a = k * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.35, cy + Math.sin(a) * R * 0.35);
        ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
        ctx.stroke();
      }
    } else if (shape === 'glyph') {
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.45, cy); ctx.lineTo(cx + R * 0.45, cy);
      ctx.moveTo(cx, cy - R * 0.55); ctx.lineTo(cx, cy + R * 0.55);
      ctx.stroke();
    } else if (shape === 'bloom' || shape === 'vine') {
      for (var p = 0; p < 6; p++) {
        var pa = p * Math.PI / 3;
        ctx.fillStyle = rgba(col, 0.65);
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(pa) * R * 0.85, cy + Math.sin(pa) * R * 0.85, R * 0.34, R * 0.2, pa, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (shape === 'maw') {
      ctx.fillStyle = rgba(HIGHLIGHT, 0.85);
      for (var m = 0; m < 5; m++) {
        var mx = cx - R * 0.8 + m * R * 0.4;
        poly(ctx, [mx, cy - R * 0.55, mx + R * 0.16, cy + R * 0.1, mx + R * 0.32, cy - R * 0.55]);
        ctx.fill();
      }
    } else if (shape === 'cluster' || shape === 'choir') {
      /* mineral cracks across the stones plus a moss cap on each */
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.35);
      [[-0.55, 0.3], [0.55, 0.3], [0, -0.5]].forEach(function (p) {
        var sx = cx + p[0] * R, sy = cy + p[1] * R;
        ctx.beginPath();
        ctx.moveTo(sx - R * 0.3, sy - R * 0.1);
        ctx.lineTo(sx - R * 0.05, sy + R * 0.12);
        ctx.lineTo(sx + R * 0.28, sy - R * 0.05);
        ctx.stroke();
      });
      ctx.fillStyle = rgba(col, 0.55);
      [[-0.55, 0.3, 0.55], [0.55, 0.3, 0.55], [0, -0.5, 0.7]].forEach(function (p) {
        ctx.beginPath();
        ctx.ellipse(cx + p[0] * R, cy + p[1] * R - R * p[2] * 0.72, R * p[2] * 0.78, R * p[2] * 0.28, 0, Math.PI, 0);
        ctx.fill();
      });
    } else if (shape === 'lantern' || shape === 'wisp') {
      var lg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.8);
      lg2.addColorStop(0, rgba(HIGHLIGHT, 0.85));
      lg2.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = lg2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.55);
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 1.05);
      ctx.quadraticCurveTo(cx + R * 0.3, cy - R * 1.5, cx, cy - R * 1.7);
      ctx.stroke();
    } else if (shape === 'robed' || shape === 'wraith') {
      /* hood opening and a tattered hem */
      ctx.fillStyle = rgba(0x000000, 0.55);
      ctx.beginPath();
      ctx.ellipse(cx, cy - R * 0.35, R * 0.42, R * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.4);
      ctx.beginPath();
      for (var h = 0; h <= 6; h++) {
        var hx2 = cx - R * 0.7 + (h / 6) * R * 1.4;
        ctx.lineTo(hx2, cy + R * 1.15 + (h % 2 ? R * 0.16 : 0));
      }
      ctx.stroke();
    } else if (shape === 'squat') {
      ctx.fillStyle = rgba(col, 0.45);
      for (var sp3 = 0; sp3 < 5; sp3++) {
        var a3 = sp3 * 1.27;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a3) * R * 0.7, cy + R * 0.35 + Math.sin(a3) * R * 0.3, R * 0.17, R * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.5);
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.55, cy + R * 0.3);
      ctx.quadraticCurveTo(cx, cy + R * 0.58, cx + R * 0.55, cy + R * 0.3);
      ctx.stroke();
    } else if (shape === 'book') {
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.45);
      for (var ln = 0; ln < 4; ln++) {
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.85, cy - R * 0.45 + ln * R * 0.3);
        ctx.lineTo(cx + R * 0.85, cy - R * 0.45 + ln * R * 0.3);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(0xE3D6A6, 0.85);
      roundRect(ctx, cx - R * 0.12, cy - R * 0.85, R * 0.24, R * 1.7, R * 0.08);
      ctx.fill();
    } else if (shape === 'serpent') {
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.4);
      for (var sc = 0; sc < 5; sc++) {
        ctx.beginPath();
        ctx.arc(cx - R * 0.8 + sc * R * 0.42, cy + R * 0.25, R * 0.2, Math.PI, 0);
        ctx.stroke();
      }
      /* head at the raised end so the eyes have somewhere to sit */
      ctx.fillStyle = rgba(col, 0.95);
      ctx.beginPath();
      ctx.ellipse(cx + R * 0.85, cy - R * 0.78, R * 0.46, R * 0.38, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(HIGHLIGHT, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  Art.bakeFoe = function (enemyId, size) {
    var e = RD.enemy(enemyId);
    var o = RD.orb(e.el);
    var S = Math.max(48, Math.round(size));
    var c = cvs(S, S), ctx = c.getContext('2d');
    var rnd = rng(enemyId.length * 7717 + enemyId.charCodeAt(0) * 313);
    /* mid-tone body so a creature never reads as a flat dark blob */
    var body = mix(o.color, o.deep, 0.52);
    var deepC = darken(o.deep, 0.30);

    /* contact shadow */
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(S / 2, S * 0.90, S * 0.30, S * 0.055, 0, 0, Math.PI * 2);
    ctx.filter = 'blur(3px)'; ctx.fill();
    ctx.restore();

    /* aura reads the element without hiding the silhouette */
    var ag = ctx.createRadialGradient(S / 2, S * 0.52, S * 0.10, S / 2, S * 0.52, S * 0.52);
    ag.addColorStop(0, rgba(o.color, e.boss ? 0.40 : 0.24));
    ag.addColorStop(1, rgba(o.color, 0));
    ctx.fillStyle = ag; ctx.fillRect(0, 0, S, S);

    var b = foeBody(ctx, e.shape, S, body, deepC);
    /* family material overlay */
    ctx.save();
    foePath(ctx, e.shape, S);
    ctx.clip();
    ctx.globalAlpha = 0.20;
    var speck = RIM[(RD.depth(e.family) || RD.DEPTHS[0]).rim] || RIM.stone;
    ctx.fillStyle = hx(speck.speck);
    for (var i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * S, rnd() * S, 0.8 + rnd() * S * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    /* rim light from the top left, house fake-lambert */
    var lg = ctx.createLinearGradient(0, b.cy - b.R * 1.2, 0, b.cy + b.R * 1.2);
    lg.addColorStop(0, rgba(HIGHLIGHT, 0.28));
    lg.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, S, S);
    ctx.restore();

    foeFeatures(ctx, e.shape, S, b, o.color);

    /* eyes: the readable focal point on every archetype */
    var ec = e.boss ? 3 : 2;
    /* per-silhouette eye anchor: the focal point has to land on the head */
    var EYE = {
      serpent: { x: 0.85, y: -0.80, s: 0.38 },
      fish: { x: -0.34, y: -0.06, s: 0.72 },
      choir: { x: 0, y: -0.55, s: 0.80 },
      cluster: { x: 0, y: -0.55, s: 0.80 },
      moth: { x: 0, y: -0.34, s: 0.48 },
      insect: { x: 0, y: -0.34, s: 0.48 },
      swarm: { x: 0, y: -0.34, s: 0.48 },
      book: { x: 0, y: -0.10, s: 0.90 },
      wall: { x: 0, y: -0.10, s: 0.90 },
      wheel: { x: 0, y: 0, s: 0.80 },
      bell: { x: 0, y: 0, s: 0.80 },
      maw: { x: 0, y: -0.70, s: 1.00 },
      glyph: { x: 0, y: -0.16, s: 0.70 },
      robed: { x: 0, y: -0.36, s: 0.58 },
      wraith: { x: 0, y: -0.36, s: 0.58 },
      lantern: { x: 0, y: -0.14, s: 0.62 },
      wisp: { x: 0, y: -0.14, s: 0.62 },
      bloom: { x: 0, y: -0.05, s: 0.68 },
      vine: { x: 0, y: -0.05, s: 0.68 }
    };
    var ea = EYE[e.shape] || { x: 0, y: -0.18, s: 1 };
    var eyeY = b.cy + b.R * ea.y;
    for (var q = 0; q < ec; q++) {
      var ex = b.cx + b.R * ea.x + (q - (ec - 1) / 2) * b.R * 0.52 * ea.s;
      /* socket, then bright sclera, then ink pupil and a catch light */
      ctx.fillStyle = rgba(darken(o.deep, 0.55), 0.9);
      ctx.beginPath(); ctx.ellipse(ex, eyeY, b.R * 0.21, b.R * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(lighten(o.color, 0.55), 1);
      ctx.beginPath(); ctx.ellipse(ex, eyeY, b.R * 0.15, b.R * 0.19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hx(INK);
      ctx.beginPath(); ctx.ellipse(ex, eyeY + b.R * 0.02, b.R * 0.065, b.R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(HIGHLIGHT, 0.9);
      ctx.beginPath(); ctx.arc(ex - b.R * 0.05, eyeY - b.R * 0.07, b.R * 0.035, 0, Math.PI * 2); ctx.fill();
    }

    /* boss crown band, broad centre stroke per the depth motif */
    if (e.boss) {
      ctx.strokeStyle = rgba(0xFFF2C4, 0.9);
      ctx.lineWidth = Math.max(2, S * 0.022);
      ctx.beginPath();
      ctx.moveTo(b.cx - b.R * 0.95, b.cy - b.R * 1.12);
      ctx.lineTo(b.cx - b.R * 0.35, b.cy - b.R * 1.45);
      ctx.lineTo(b.cx, b.cy - b.R * 1.10);
      ctx.lineTo(b.cx + b.R * 0.35, b.cy - b.R * 1.45);
      ctx.lineTo(b.cx + b.R * 0.95, b.cy - b.R * 1.12);
      ctx.stroke();
    }

    /* outline keeps the silhouette readable at 390px */
    ctx.save();
    foePath(ctx, e.shape, S);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(1.5, S * 0.018);
    ctx.strokeStyle = rgba(lighten(o.color, 0.2), 0.85);
    ctx.stroke();
    ctx.restore();
    return c;
  };

  /* --------------------------------------------------------- icons */
  /* Small monochrome pictograms. Icons over labels, per the UI law. */
  Art.bakeIcon = function (kind, size) {
    var S = Math.max(16, Math.round(size));
    var c = cvs(S, S), ctx = c.getContext('2d');
    var cx = S / 2, cy = S / 2, r = S * 0.36;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.8, S * 0.10);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (kind) {
      case 'pause':
        roundRect(ctx, cx - r * 0.72, cy - r, r * 0.5, r * 2, r * 0.16); ctx.fill();
        roundRect(ctx, cx + r * 0.22, cy - r, r * 0.5, r * 2, r * 0.16); ctx.fill();
        break;
      case 'play':
        poly(ctx, [cx - r * 0.6, cy - r, cx + r * 0.9, cy, cx - r * 0.6, cy + r]); ctx.fill();
        break;
      case 'gear':
        ctx.beginPath();
        for (var i = 0; i < 8; i++) {
          var a0 = i * Math.PI / 4;
          ctx.moveTo(cx + Math.cos(a0) * r * 0.5, cy + Math.sin(a0) * r * 0.5);
          ctx.lineTo(cx + Math.cos(a0) * r * 1.05, cy + Math.sin(a0) * r * 1.05);
        }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'back':
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.5, cy - r * 0.8); ctx.lineTo(cx - r * 0.45, cy); ctx.lineTo(cx + r * 0.5, cy + r * 0.8);
        ctx.stroke();
        break;
      case 'rune':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
        ctx.moveTo(cx - r * 0.7, cy - r * 0.35); ctx.lineTo(cx, cy - r * 0.75);
        ctx.moveTo(cx + r * 0.7, cy + r * 0.15); ctx.lineTo(cx, cy - r * 0.25);
        ctx.stroke();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.85, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.85, cy + r * 0.2);
        ctx.quadraticCurveTo(cx + r * 0.85, cy + r * 0.9, cx, cy + r);
        ctx.quadraticCurveTo(cx - r * 0.85, cy + r * 0.9, cx - r * 0.85, cy + r * 0.2);
        ctx.lineTo(cx - r * 0.85, cy - r * 0.5);
        ctx.closePath(); ctx.stroke();
        break;
      case 'sword':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy + r * 0.85); ctx.lineTo(cx + r * 0.75, cy - r * 0.75);
        ctx.moveTo(cx - r * 0.1, cy + r * 0.35); ctx.lineTo(cx + r * 0.35, cy + r * 0.8);
        ctx.stroke();
        break;
      case 'heart':
        glyph(ctx, 'heart', cx, cy, r * 0.9, '#ffffff', null);
        break;
      case 'skull':
        ctx.beginPath(); ctx.arc(cx, cy - r * 0.18, r * 0.72, Math.PI, 0); ctx.fill();
        roundRect(ctx, cx - r * 0.72, cy - r * 0.24, r * 1.44, r * 0.82, r * 0.2); ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.1, r * 0.19, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.1, r * 0.19, 0, Math.PI * 2); ctx.fill();
        break;
      case 'lock':
        roundRect(ctx, cx - r * 0.7, cy - r * 0.15, r * 1.4, r * 1.05, r * 0.2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.44, Math.PI, 0); ctx.stroke();
        break;
      case 'check':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy); ctx.lineTo(cx - r * 0.15, cy + r * 0.6); ctx.lineTo(cx + r * 0.75, cy - r * 0.65);
        ctx.stroke();
        break;
      case 'clock':
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.42, cy + r * 0.2);
        ctx.stroke();
        break;
      case 'combo':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.85, cy + r * 0.6); ctx.lineTo(cx - r * 0.2, cy - r * 0.25);
        ctx.lineTo(cx + r * 0.2, cy + r * 0.25); ctx.lineTo(cx + r * 0.85, cy - r * 0.7);
        ctx.stroke();
        break;
      case 'descent':
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.9); ctx.lineTo(cx, cy + r * 0.7);
        ctx.moveTo(cx - r * 0.55, cy + r * 0.15); ctx.lineTo(cx, cy + r * 0.8);
        ctx.lineTo(cx + r * 0.55, cy + r * 0.15);
        ctx.stroke();
        break;
      case 'roster':
        roundRect(ctx, cx - r * 0.95, cy - r * 0.7, r * 0.8, r * 1.4, r * 0.2); ctx.fill();
        roundRect(ctx, cx + r * 0.15, cy - r * 0.7, r * 0.8, r * 1.4, r * 0.2); ctx.fill();
        break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  };

  /* Depth badge used on the map cards. */
  Art.bakeDepthBadge = function (depthId, size) {
    var d = RD.depth(depthId), S = Math.max(24, Math.round(size));
    var c = cvs(S, S), ctx = c.getContext('2d');
    roundRect(ctx, 1, 1, S - 2, S - 2, S * 0.26);
    var g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, hx(lighten(d.frame.plate, 0.22)));
    g.addColorStop(1, hx(darken(d.frame.plate, 0.3)));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = hx(d.frame.trim); ctx.stroke();
    ctx.strokeStyle = rgba(d.accent, 0.95);
    ctx.lineWidth = Math.max(2, S * 0.08);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    /* one authored mark per depth so the four badges never read alike */
    switch (d.id) {
      case 'vault':   /* rising root */
        ctx.moveTo(S * 0.30, S * 0.76); ctx.lineTo(S * 0.50, S * 0.28);
        ctx.moveTo(S * 0.50, S * 0.52); ctx.lineTo(S * 0.74, S * 0.36);
        ctx.moveTo(S * 0.50, S * 0.66); ctx.lineTo(S * 0.28, S * 0.50);
        break;
      case 'seam':    /* seam crack */
        ctx.moveTo(S * 0.26, S * 0.24); ctx.lineTo(S * 0.46, S * 0.46);
        ctx.lineTo(S * 0.34, S * 0.58); ctx.lineTo(S * 0.72, S * 0.78);
        break;
      case 'library': /* standing water line over a page */
        ctx.moveTo(S * 0.24, S * 0.42);
        ctx.quadraticCurveTo(S * 0.38, S * 0.28, S * 0.5, S * 0.42);
        ctx.quadraticCurveTo(S * 0.62, S * 0.56, S * 0.76, S * 0.42);
        ctx.moveTo(S * 0.30, S * 0.68); ctx.lineTo(S * 0.70, S * 0.68);
        break;
      default:        /* the line itself, crossed */
        ctx.moveTo(S * 0.50, S * 0.22); ctx.lineTo(S * 0.50, S * 0.78);
        ctx.moveTo(S * 0.28, S * 0.40); ctx.lineTo(S * 0.50, S * 0.28);
        ctx.moveTo(S * 0.72, S * 0.58); ctx.lineTo(S * 0.50, S * 0.46);
        break;
    }
    ctx.stroke();
    return c;
  };
})(typeof window !== 'undefined' ? window : globalThis);
