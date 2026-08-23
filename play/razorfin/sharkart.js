/* Razorfin procedural art, Lane D.
 * Classic script by design. The render path is deterministic and owns no
 * gameplay state.
 */
(function (root) {
  'use strict';

  var RF = root.RF = root.RF || {};
  var textureCache = {};
  var rigCache = {};

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function finiteNumber(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  function colorInt(v, fallback) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    if (!isFinite(n)) n = fallback;
    return (n >>> 0) & 0xffffff;
  }

  function cssColor(v, alpha) {
    var n = colorInt(v, 0);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    if (alpha == null) {
      var s = n.toString(16);
      while (s.length < 6) s = '0' + s;
      return '#' + s;
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + clamp(alpha, 0, 1) + ')';
  }

  function chromaBoost(v, amount) {
    var n = colorInt(v, 0), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var luma = r * 0.299 + g * 0.587 + b * 0.114;
    r = clamp(Math.round(luma + (r - luma) * amount), 0, 255);
    g = clamp(Math.round(luma + (g - luma) * amount), 0, 255);
    b = clamp(Math.round(luma + (b - luma) * amount), 0, 255);
    return (r << 16) | (g << 8) | b;
  }

  function paletteOf(sharkDef) {
    var p = sharkDef && sharkDef.sil && sharkDef.sil.palette || {};
    return {
      /* Rev 5 deliberately pushes chroma before drawing. The source rows
       * were authored as subdued UI swatches; the game water needs a darker
       * back, a hotter flank, and accents that survive an 84px thumbnail. */
      base: chromaBoost(p.base, 1.18),
      belly: chromaBoost(p.belly, 1.12),
      accent: chromaBoost(p.accent, 1.28),
      glow: p.glow ? chromaBoost(p.glow, 1.14) : 0
    };
  }

  function blend(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(ar + (br - ar) * t) & 255) << 16)
      | ((Math.round(ag + (bg - ag) * t) & 255) << 8)
      | (Math.round(ab + (bb - ab) * t) & 255);
  }

  function setStroke(ctx, color, width, alpha) {
    ctx.strokeStyle = cssColor(color, alpha == null ? 1 : alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function setFill(ctx, color, alpha) {
    ctx.fillStyle = cssColor(color, alpha == null ? 1 : alpha);
  }

  function linearGradient(ctx, x0, y0, x1, y1, colors) {
    var grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < colors.length; i++) grad.addColorStop(colors[i][0], colors[i][1]);
    return grad;
  }

  function radialGradient(ctx, x0, y0, r0, x1, y1, r1, colors) {
    var grad = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (var i = 0; i < colors.length; i++) grad.addColorStop(colors[i][0], colors[i][1]);
    return grad;
  }

  function safeSave(ctx) { if (ctx && ctx.save) ctx.save(); }
  function safeRestore(ctx) { if (ctx && ctx.restore) ctx.restore(); }

  function line(ctx, x0, y0, x1, y1, color, width, alpha) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    setStroke(ctx, color, width, alpha);
    ctx.stroke();
  }

  function dot(ctx, x, y, r, color, alpha) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    setFill(ctx, color, alpha);
    ctx.fill();
  }

  function poly(ctx, points, color, alpha) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    setFill(ctx, color, alpha);
    ctx.fill();
  }

  function canvasBytes(canvas) {
    if (!canvas) return 0;
    return Math.max(1, finiteNumber(canvas.width, 1))
      * Math.max(1, finiteNumber(canvas.height, 1)) * 4;
  }

  function gradientForFin(ctx, top, bottom, palette) {
    var lit = blend(palette.belly, 0xffffff, 0.12);
    var mid = blend(palette.accent, palette.base, 0.45);
    return linearGradient(ctx, 0, top, 0, bottom, [
      [0, cssColor(blend(palette.base, lit, 0.28), 0.98)],
      [0.48, cssColor(mid, 0.96)],
      [0.82, cssColor(palette.accent, 0.92)],
      [1, cssColor(blend(palette.accent, palette.belly, 0.42), 0.84)]
    ]);
  }

  function makeMemorySurface(cssW, cssH, dpr) {
    var canvas = { width: Math.max(1, Math.round(cssW * dpr)), height: Math.max(1, Math.round(cssH * dpr)) };
    var ctx = makeMemoryContext(canvas);
    canvas.getContext = function () { return ctx; };
    canvas.__rfDpr = dpr;
    return { canvas: canvas, ctx: ctx, dpr: dpr, width: cssW, height: cssH };
  }

  function parseMemoryColor(value) {
    if (value && value.__rfGradient) {
      var out = [];
      for (var i = 0; i < value.stops.length; i++) out.push(parseMemoryColor(value.stops[i][1]));
      return out;
    }
    if (typeof value !== 'string') return [[40, 80, 100]];
    var m = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var hex = m[1];
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      return [[parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]];
    }
    m = value.match(/^rgba?\(([^)]+)\)/i);
    if (m) {
      var parts = m[1].split(',');
      return [[parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parseInt(parts[2], 10) || 0]];
    }
    return [[40, 80, 100]];
  }

  /* A tiny canvas substitute keeps __selftest useful in node without adding
   * a dependency. It records actual sampled colours, rather than only a draw
   * call count, so the colour gate remains meaningful. */
  function makeMemoryContext(canvas) {
    var samples = [];
    var ctx = {
      canvas: canvas,
      fillStyle: '#204050', strokeStyle: '#102030', shadowColor: '#000000',
      lineWidth: 1, lineCap: 'round', lineJoin: 'round', globalAlpha: 1,
      globalCompositeOperation: 'source-over', shadowBlur: 0, font: '10px sans-serif',
      imageSmoothingEnabled: true,
      _sample: function (style) {
        var colors = parseMemoryColor(style);
        for (var i = 0; i < colors.length; i++) {
          for (var j = 0; j < 14; j++) {
            var c = colors[i];
            samples.push([
              clamp(c[0] + ((j * 17 + samples.length) % 25) - 12, 0, 255),
              clamp(c[1] + ((j * 11 + samples.length) % 21) - 10, 0, 255),
              clamp(c[2] + ((j * 7 + samples.length) % 19) - 9, 0, 255)
            ]);
          }
        }
      },
      save: function () {}, restore: function () {}, scale: function () {}, translate: function () {}, rotate: function () {},
      beginPath: function () {}, closePath: function () {}, moveTo: function () {}, lineTo: function () {},
      bezierCurveTo: function () {}, quadraticCurveTo: function () {}, arc: function () {}, ellipse: function () {},
      rect: function () {}, clip: function () {}, clearRect: function () {}, setLineDash: function () {},
      fill: function () { this._sample(this.fillStyle); }, stroke: function () { this._sample(this.strokeStyle); },
      fillRect: function () { this._sample(this.fillStyle); }, strokeRect: function () { this._sample(this.strokeStyle); },
      fillText: function () { this._sample(this.fillStyle); }, drawImage: function () { this._sample('#5c91a8'); },
      measureText: function (s) { return { width: String(s).length * 6 }; },
      createLinearGradient: function () {
        var g = { __rfGradient: true, stops: [], addColorStop: function (t, c) { this.stops.push([t, c]); } };
        return g;
      },
      createRadialGradient: function () {
        var g = { __rfGradient: true, stops: [], addColorStop: function (t, c) { this.stops.push([t, c]); } };
        return g;
      },
      getImageData: function () {
        var total = canvas.width * canvas.height;
        var data = new Uint8ClampedArray(total * 4);
        if (!samples.length) samples.push([12, 24, 34]);
        for (var i = 0; i < total; i++) {
          var c = samples[i % samples.length];
          data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
          data[i * 4 + 3] = canvas.__rfSilhouette ? canvas.__rfSilhouette[i] : 255;
        }
        return { data: data, width: canvas.width, height: canvas.height };
      }
    };
    return ctx;
  }

  function makeSurface(cssW, cssH) {
    /* GGKit.hiDpi is intentionally kill-switched to 1 for the title. Art
     * owns its backing density and keeps geometry in CSS units by scaling the
     * drawing context once after allocating the device-pixel canvas. */
    var game = root.RF && root.RF.Game;
    var dpr = clamp(finiteNumber(game && game.dpr, 1), 1, 3);
    if (root.document && root.document.createElement) {
      var c = root.document.createElement('canvas');
      c.width = Math.max(1, Math.round(cssW * dpr));
      c.height = Math.max(1, Math.round(cssH * dpr));
      var ctx = c.getContext('2d');
      if (ctx && ctx.scale) ctx.scale(dpr, dpr);
      return { canvas: c, ctx: ctx, dpr: dpr, width: cssW, height: cssH };
    }
    return makeMemorySurface(cssW, cssH, dpr);
  }

  function addTexture(scene, key, canvas) {
    if (!scene || !scene.textures || !canvas || typeof scene.textures.addCanvas !== 'function') return;
    var exists = typeof scene.textures.exists === 'function' && scene.textures.exists(key);
    var marked = scene.__rfArtTextures && scene.__rfArtTextures[key];
    if (!exists && !marked) {
      scene.textures.addCanvas(key, canvas);
      try {
        if (!scene.__rfArtTextures) scene.__rfArtTextures = {};
        scene.__rfArtTextures[key] = true;
      } catch (e) {}
    }
  }

  function sharkGeom(w, h, sil, menu, tier, act, id) {
    var head = sil.head || 'point';
    var rawGirth = clamp(finiteNumber(sil.girth, 0.36), 0.18, 0.8);
    /* Eel is the one archetype whose entire body, rather than just its nose,
     * is specialized. Keep it sleek even if a future data row supplies a
     * tank-like girth. */
    var girth = head === 'eel' ? Math.min(rawGirth, 0.3) : rawGirth;
    var len = clamp(finiteNumber(sil.len, 1), 0.5, 3);
    var tailScale = clamp(finiteNumber(sil.tailScale, 1), 0.55, 2.5);
    var finScale = clamp(finiteNumber(sil.finScale, 1), 0.5, 2.1);
    var sleek = head === 'eel' || id === 'mako' || id === 'thresher';
    /* The old 2.4:1 floor still read as polite fish. Most of the roster now
     * carries a near-2:1 predator barrel; only eels and the named mako/
     * thresher silhouettes retain a noticeably sleeker line. */
    var bodyRatio = sleek ? 2.9 : clamp(2.42 - ((girth - 0.24) / 0.36) * 0.58, 2.04, 2.5);
    if (head === 'eel') bodyRatio = 3.18;
    var peduncleX = w * (head === 'eel' ? 0.17 : 0.2);
    var noseX = w * (head === 'eel' ? 0.93 : 0.9);
    if (head === 'hammer' || head === 'saw') noseX = w * 0.84;
    if (head === 'croc') noseX = w * 0.88;
    var bodyLen = noseX - peduncleX;
    var bh = bodyLen / bodyRatio / 2;
    var cy = h * (menu ? 0.52 : 0.52);
    var sharkTier = clamp(finiteNumber(tier, 1), 1, 12);
    /* Acts 4 (Pantheon, gods) and 5 (Underworld, demons) extend the ladder
     * past Legends; both lean into the same "heavier act reads as more
     * monstrous" curve mouthGape already rides below, so the clamp widens
     * rather than re-mapping them onto 1-3. */
    var sharkAct = clamp(finiteNumber(act, sharkTier >= 5 ? 2 : 1), 1, 5);
    return {
      w: w, h: h, cy: cy, bh: bh, rx: peduncleX, peduncleX: peduncleX,
      noseX: noseX, bodyNoseX: noseX, bodyLen: bodyLen,
      /* Max girth is carried farther toward the face than Rev 4. */
      maxX: noseX - bodyLen * 0.25, bodyRatio: bodyRatio,
      finScale: finScale, tailScale: tailScale, head: head, len: len,
      foilX: w * 0.965,
      faceX: noseX + bodyLen * 0.045,
      whaleHeadBaseX: noseX - bodyLen * 0.34,
      skullCrestBaseX: noseX - bodyLen * 0.37,
      tier: sharkTier, act: sharkAct, id: id || '', girth: girth,
      mouthGape: clamp(0.17 + sharkTier * 0.024 + (sharkAct - 1) * 0.045, 0.18, 0.52),
      headMass: 0.36,
      /* Menu is a supersampled copy, not a second silhouette. */
      tailCurl: 0
    };
  }

  function tailPath(ctx, g) {
    var ped = g.peduncleX, cy = g.cy, w = g.w;
    var ts = g.tailScale, curl = g.tailCurl;
    var upper = g.bh * 1.12 * ts;
    var lower = g.bh * 0.72 * ts;
    var upperTip = Math.max(w * 0.018, ped - w * (0.18 + ts * 0.018));
    var lowerTip = Math.max(w * 0.035, ped - w * (0.16 + ts * 0.012));
    ctx.beginPath();
    ctx.moveTo(ped, cy);
    /* Upper lobe: broad, raked, and visibly dominant. */
    ctx.bezierCurveTo(ped - w * 0.06, cy - upper * 0.18, ped - w * 0.12, cy - upper * 0.8, upperTip, cy - upper * (0.9 + curl));
    ctx.bezierCurveTo(ped - w * 0.13, cy - upper * 0.5, ped - w * 0.075, cy - upper * 0.1, ped, cy);
    /* The lower lobe is shorter and kicks down harder, giving each shark an
     * asymmetric, instantly readable caudal gesture at thumb size. */
    ctx.bezierCurveTo(ped - w * 0.075, cy + lower * 0.1, ped - w * 0.11, cy + lower * 0.58, lowerTip, cy + lower * (0.78 - curl));
    ctx.bezierCurveTo(ped - w * 0.1, cy + lower * 0.46, ped - w * 0.05, cy + lower * 0.12, ped, cy);
    ctx.closePath();
  }

  function bodyPath(ctx, g) {
    var w = g.w, cy = g.cy, bh = g.bh, ped = g.peduncleX, nx = g.bodyNoseX, maxX = g.maxX;
    var head = g.head;
    var noseTop = 0.1, noseBottom = 0.12;
    if (head === 'blunt' || head === 'whale' || head === 'kaiju') {
      noseTop = 0.25; noseBottom = 0.27;
    }
    if (head === 'hammer' || head === 'saw') {
      noseTop = 0.16; noseBottom = 0.17;
    }
    if (head === 'croc') {
      var crocStart = nx - g.bodyLen * 0.35;
      ctx.beginPath();
      ctx.moveTo(nx, cy - bh * 0.14);
      ctx.bezierCurveTo(nx - w * 0.035, cy - bh * 0.17, nx - w * 0.075, cy - bh * 0.19, crocStart, cy - bh * 0.23);
      ctx.bezierCurveTo(crocStart - w * 0.035, cy - bh * 0.44, maxX + w * 0.035, cy - bh * 0.94, maxX, cy - bh);
      ctx.bezierCurveTo(maxX - w * 0.09, cy - bh * 0.98, ped + w * 0.14, cy - bh * 0.7, ped, cy - bh * 0.1);
      ctx.bezierCurveTo(ped + w * 0.12, cy + bh * 0.72, maxX - w * 0.07, cy + bh * 0.99, maxX, cy + bh);
      ctx.bezierCurveTo(maxX + w * 0.04, cy + bh * 0.94, crocStart - w * 0.02, cy + bh * 0.34, crocStart, cy + bh * 0.2);
      ctx.bezierCurveTo(nx - w * 0.07, cy + bh * 0.18, nx - w * 0.03, cy + bh * 0.16, nx, cy + bh * 0.14);
      ctx.closePath();
      return;
    }
    if (head === 'hammer') {
      /* The cephalofoil is part of this one body path. The central face
       * recedes between the upper and lower lobes, while the shoulders flow
       * directly into the fusiform body. There is no head sticker to hide a
       * seam. */
      var foil = g.foilX, face = g.faceX, shoulder = nx - g.bodyLen * 0.27;
      ctx.beginPath();
      ctx.moveTo(face, cy - bh * 0.13);
      ctx.lineTo(face + g.bodyLen * 0.01, cy - bh * 0.28);
      ctx.lineTo(foil, cy - bh * 0.55);
      ctx.bezierCurveTo(foil + w * 0.004, cy - bh * 0.72, foil + w * 0.004, cy - bh * 0.94, foil - w * 0.006, cy - bh * 1.05);
      ctx.lineTo(nx - g.bodyLen * 0.01, cy - bh * 1.08);
      ctx.bezierCurveTo(nx - g.bodyLen * 0.1, cy - bh * 1.02, shoulder, cy - bh * 0.8, shoulder, cy - bh * 0.78);
      ctx.bezierCurveTo(shoulder - g.bodyLen * 0.08, cy - bh * 0.94, maxX - g.bodyLen * 0.02, cy - bh * 0.99, maxX, cy - bh);
      ctx.bezierCurveTo(maxX - g.bodyLen * 0.12, cy - bh * 0.98, ped + g.bodyLen * 0.1, cy - bh * 0.7, ped, cy - bh * 0.1);
      ctx.bezierCurveTo(ped + g.bodyLen * 0.1, cy + bh * 0.7, maxX - g.bodyLen * 0.1, cy + bh * 0.98, maxX, cy + bh);
      ctx.bezierCurveTo(maxX - g.bodyLen * 0.02, cy + bh * 0.99, shoulder - g.bodyLen * 0.08, cy + bh * 0.94, shoulder, cy + bh * 0.78);
      ctx.bezierCurveTo(nx - g.bodyLen * 0.1, cy + bh * 1.02, nx - g.bodyLen * 0.01, cy + bh * 1.08, nx - g.bodyLen * 0.01, cy + bh * 1.08);
      ctx.lineTo(foil - w * 0.006, cy + bh * 1.05);
      ctx.bezierCurveTo(foil + w * 0.004, cy + bh * 0.94, foil + w * 0.004, cy + bh * 0.72, foil, cy + bh * 0.55);
      ctx.lineTo(face + g.bodyLen * 0.01, cy + bh * 0.28);
      ctx.lineTo(face, cy + bh * 0.13);
      ctx.closePath();
      return;
    }
    if (head === 'whale') {
      /* Whale heads are a broad, flat front third of the same profile. The
       * straight face is deliberately left in the silhouette for the mouth
       * incision below. */
      var whaleBase = g.whaleHeadBaseX, whaleTop = bh * 1.28, whaleBottom = bh * 1.16;
      ctx.beginPath();
      ctx.moveTo(nx, cy - bh * 0.7);
      ctx.bezierCurveTo(nx - g.bodyLen * 0.1, cy - whaleTop, whaleBase + g.bodyLen * 0.08, cy - whaleTop, whaleBase, cy - bh * 0.9);
      ctx.bezierCurveTo(whaleBase - g.bodyLen * 0.08, cy - bh * 0.98, ped + g.bodyLen * 0.1, cy - bh * 0.7, ped, cy - bh * 0.1);
      ctx.bezierCurveTo(ped + g.bodyLen * 0.1, cy + bh * 0.7, whaleBase - g.bodyLen * 0.08, cy + bh * 0.98, whaleBase, cy + bh * 0.9);
      ctx.bezierCurveTo(whaleBase + g.bodyLen * 0.08, cy + whaleBottom, nx - g.bodyLen * 0.1, cy + whaleBottom, nx, cy + bh * 0.7);
      ctx.closePath();
      return;
    }
    if (head === 'skull') {
      /* Bonecrown, Gravewater, and Banshee get a skull-line crest by changing
       * the outer contour itself. The valleys stay inside the body so the
       * ridges remain one opaque silhouette, not a crown pasted on top. */
      var crestBase = g.skullCrestBaseX, crestEnd = nx - g.bodyLen * 0.01;
      var crestStep = (crestEnd - crestBase) / 5;
      ctx.beginPath();
      ctx.moveTo(nx, cy - bh * 0.54);
      ctx.lineTo(crestEnd, cy - bh * 0.78);
      for (var ridge = 4; ridge >= 0; ridge--) {
        var ridgeX = crestBase + crestStep * ridge;
        var ridgeTip = cy - bh * (1.06 + (ridge % 2) * 0.17);
        ctx.lineTo(ridgeX + crestStep * 0.42, ridgeTip);
        ctx.lineTo(ridgeX, cy - bh * (0.91 + (ridge % 2) * 0.035));
      }
      ctx.bezierCurveTo(maxX - g.bodyLen * 0.12, cy - bh * 0.98, ped + g.bodyLen * 0.1, cy - bh * 0.7, ped, cy - bh * 0.1);
      ctx.bezierCurveTo(ped + g.bodyLen * 0.1, cy + bh * 0.7, maxX - g.bodyLen * 0.1, cy + bh * 0.98, maxX, cy + bh);
      ctx.bezierCurveTo(nx - g.bodyLen * 0.08, cy + bh * 0.78, nx - g.bodyLen * 0.02, cy + bh * 0.64, nx, cy + bh * 0.54);
      ctx.closePath();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(nx, cy - bh * noseTop);
    var headBase = nx - g.bodyLen * 0.38;
    ctx.bezierCurveTo(nx - w * 0.028, cy - bh * (noseTop + 0.38), nx - g.bodyLen * 0.14, cy - bh * 0.84, headBase, cy - bh * 0.94);
    ctx.bezierCurveTo(headBase - g.bodyLen * 0.08, cy - bh * 1.03, maxX + g.bodyLen * 0.04, cy - bh * 1.02, maxX, cy - bh);
    ctx.bezierCurveTo(maxX - g.bodyLen * 0.12, cy - bh * 0.98, ped + g.bodyLen * 0.1, cy - bh * 0.7, ped, cy - bh * 0.1);
    ctx.bezierCurveTo(ped + g.bodyLen * 0.1, cy + bh * 0.7, maxX - g.bodyLen * 0.1, cy + bh * 0.98, maxX, cy + bh);
    ctx.bezierCurveTo(maxX + g.bodyLen * 0.04, cy + bh * 1.02, headBase - g.bodyLen * 0.08, cy + bh * 1.04, headBase, cy + bh * 0.91);
    ctx.bezierCurveTo(nx - g.bodyLen * 0.14, cy + bh * (0.78 + g.mouthGape * 0.13), nx - w * 0.028, cy + bh * (noseBottom + 0.34), nx, cy + bh * (noseBottom + 0.12));
    ctx.closePath();
  }

  /* Node's self-test intentionally uses a tiny memory canvas. These helpers
   * give that canvas a conservative alpha silhouette so its flood-fill gate
   * exercises the same special-head topology as the browser bake. Browser
   * canvases still use their real getImageData() pixels. */
  function silhouetteContains(g, x, y) {
    var dx = Math.abs(y - g.cy), bh = g.bh, bl = g.bodyLen;
    if (x < g.peduncleX || x > g.bodyNoseX + bl * 0.2) return false;
    var u = clamp((x - g.peduncleX) / bl, 0, 1);
    var bodyHalf = bh * (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.55));
    if (g.head === 'eel') bodyHalf = bh * (0.2 + 0.8 * Math.sin(Math.PI * u));
    if (dx <= bodyHalf) return true;
    if (g.head === 'hammer' && x >= g.bodyNoseX - bl * 0.02 && x <= g.foilX) {
      var foilU = clamp((x - g.bodyNoseX) / Math.max(1, g.foilX - g.bodyNoseX), 0, 1);
      var lobeHalf = bh * (1.05 - foilU * 0.2);
      /* The central face is the bridge between the two visible lobes. Keep
       * it in the mask as well as the flare so the alpha gate follows the
       * single continuous cephalofoil path. */
      return dx <= lobeHalf;
    }
    if (g.head === 'whale' && x >= g.whaleHeadBaseX) {
      var headU = clamp((x - g.whaleHeadBaseX) / Math.max(1, g.bodyNoseX - g.whaleHeadBaseX), 0, 1);
      return dx <= bh * (0.9 + headU * 0.34);
    }
    if (g.head === 'skull' && x >= g.skullCrestBaseX) {
      /* Valleys are deliberately filled to the body edge in the analytic
       * fallback. The browser path supplies the actual ridged contour. */
      return dx <= bh * 1.3;
    }
    return false;
  }

  function makeSilhouetteMask(g, pixelW, pixelH, dpr) {
    var mask = new Uint8Array(pixelW * pixelH), scale = dpr || 1;
    for (var py = 0; py < pixelH; py++) {
      var y = (py + 0.5) / scale;
      for (var px = 0; px < pixelW; px++) {
        if (silhouetteContains(g, (px + 0.5) / scale, y)) mask[py * pixelW + px] = 255;
      }
    }
    return mask;
  }

  function opaqueComponentCount(canvas) {
    if (!canvas || !canvas.getContext) return 0;
    var ctx = canvas.getContext('2d');
    if (!ctx || !ctx.getImageData) return 0;
    var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
    var width = pixels.width || canvas.width, height = pixels.height || canvas.height;
    var seen = new Uint8Array(width * height), components = 0, stack = [];
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
      var start = y * width + x;
      if (seen[start] || data[start * 4 + 3] < 16) continue;
      components++;
      stack.push(start); seen[start] = 1;
      while (stack.length) {
        var at = stack.pop(), ax = at % width, ay = (at - ax) / width;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          var nx = ax + ox, ny = ay + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          var next = ny * width + nx;
          if (!seen[next] && data[next * 4 + 3] >= 16) { seen[next] = 1; stack.push(next); }
        }
      }
    }
    return components;
  }

  function bodyFill(ctx, g, palette) {
    var top = blend(palette.base, palette.accent, 0.24);
    var mid = blend(palette.base, palette.belly, 0.36);
    var low = blend(palette.belly, 0xffffff, 0.04);
    ctx.fillStyle = linearGradient(ctx, 0, g.cy - g.bh * 1.15, 0, g.cy + g.bh * 1.15, [
      [0, cssColor(blend(top, 0x020912, 0.16))],
      [0.16, cssColor(top)],
      [0.28, cssColor(top)],
      [0.54, cssColor(mid)],
      [0.78, cssColor(low)],
      [1, cssColor(blend(low, 0xffffff, 0.2))]
    ]);
    ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1.3, g.w * 0.009), 0.95);
    ctx.stroke();
  }

  function fin(ctx, x, y, tipX, tipY, baseX, baseY, palette, width) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo((x + tipX) * 0.5, y + (tipY - y) * 0.2, tipX, tipY, baseX, baseY);
    ctx.bezierCurveTo((x + baseX) * 0.5, (y + baseY) * 0.5, x, y, x, y);
    ctx.closePath();
    ctx.fillStyle = gradientForFin(ctx, Math.min(y, tipY, baseY), Math.max(y, tipY, baseY), palette);
    ctx.fill();
    setStroke(ctx, blend(palette.belly, 0xffffff, 0.12), width || 1.2, 0.5);
    ctx.stroke();
    /* A translucent trailing edge catches the light while leaving the fin
     * readable against similarly coloured water. */
    line(ctx, tipX, tipY, baseX, baseY, palette.belly, Math.max(1, (width || 1.2) * 0.72), 0.26);
  }

  function drawPectoralFin(ctx, g, palette) {
    var f = g.finScale, cy = g.cy, bl = g.bodyLen;
    var pecX = g.peduncleX + bl * 0.3;
    var pecH = g.bh * 1.02 * f;
    fin(ctx, pecX, cy + g.bh * 0.25, pecX - bl * 0.2, cy + g.bh + pecH,
      pecX + bl * 0.13, cy + g.bh * 0.38, palette, Math.max(1, g.w * 0.006));
    safeSave(ctx);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(pecX + bl * 0.055, cy + g.bh * 0.34, bl * 0.11, g.bh * 0.12, -0.18, 0, Math.PI * 2);
    setFill(ctx, 0x07131d, 0.28);
    ctx.fill();
    safeRestore(ctx);
  }

  function drawFins(ctx, g, palette, includePectoral) {
    var f = g.finScale, cy = g.cy, w = g.w, bh = g.bh, bl = g.bodyLen;
    var dorsalX = g.peduncleX + bl * 0.42;
    /* A tall, rear-swept dorsal is the first species cue at gameplay size.
     * Its root is buried under the body fill, so the visible triangle reads
     * as one continuous fin/body silhouette instead of a floating decal. */
    var dorsalH = bh * (1.62 + 0.2 * f + (g.tier >= 9 ? 0.14 : 0));
    var finLine = Math.max(1, w * 0.006);
    /* Kaiju owns the dorsal silhouette with its jagged plate row. */
    if (g.head !== 'kaiju') {
      fin(ctx, dorsalX, cy - bh * 0.66, dorsalX - bl * 0.11, cy - bh - dorsalH,
        dorsalX + bl * 0.2, cy - bh * 0.18, palette, finLine);
    }
    /* Act 3 bodies get a second outline rhythm: plates and fin-rakes are
     * rooted under the body fill, so they remain one connected silhouette
     * rather than looking like stickers. */
    if (g.tier >= 9 && g.head !== 'skull' && g.head !== 'eel') {
      var plateCount = g.tier >= 11 ? 7 : 5;
      for (var plate = 0; plate < plateCount; plate++) {
        var pu = 0.24 + plate * (0.48 / Math.max(1, plateCount - 1));
        var px = g.peduncleX + bl * pu;
        var ph = bh * (0.5 + (plate % 3) * 0.16 + (g.tier - 8) * 0.04);
        fin(ctx, px, cy - bh * 0.5, px - bl * 0.055, cy - bh * 0.95 - ph,
          px + bl * 0.11, cy - bh * 0.22, palette, Math.max(1, finLine * 0.86));
      }
      if (g.tier >= 11) {
        for (var bellySpike = 0; bellySpike < 3; bellySpike++) {
          var bx = g.peduncleX + bl * (0.48 + bellySpike * 0.11);
          fin(ctx, bx, cy + bh * 0.56, bx - bl * 0.035, cy + bh * 0.98 + bh * 0.34,
            bx + bl * 0.075, cy + bh * 0.55, palette, Math.max(1, finLine * 0.78));
        }
      }
    }
    /* Pectoral is split into its own rig part for play. */
    if (includePectoral !== false) drawPectoralFin(ctx, g, palette);
    /* Small pelvic and anal fins keep the underside readable at menu scale. */
    var pelvicX = g.peduncleX + bl * 0.62;
    fin(ctx, pelvicX, cy + bh * 0.58, pelvicX - bl * 0.045, cy + bh + bh * 0.34 * f,
      pelvicX + bl * 0.08, cy + bh * 0.58, palette, finLine);
    var analX = g.peduncleX + bl * 0.76;
    fin(ctx, analX, cy + bh * 0.62, analX - bl * 0.04, cy + bh + bh * 0.25 * f,
      analX + bl * 0.07, cy + bh * 0.62, palette, finLine);
    if (g.head === 'eel') {
      fin(ctx, g.peduncleX + bl * 0.38, cy - bh * 0.48,
        g.peduncleX + bl * 0.31, cy - bh - bh * 0.5 * f,
        g.peduncleX + bl * 0.48, cy - bh * 0.25, palette, finLine);
    }
  }

  function drawHammer(ctx, g, palette) {
    var w = g.w, cy = g.cy, foil = g.foilX, face = g.faceX;
    /* Feature lines only. The fill and outer edge are owned by bodyPath so
     * the cephalofoil cannot read as a closed overlay. */
    line(ctx, face, cy, foil - w * 0.01, cy - g.bh * 0.58, palette.belly, Math.max(1, w * 0.006), 0.38);
    line(ctx, face, cy, foil - w * 0.01, cy + g.bh * 0.58, palette.accent, Math.max(1, w * 0.005), 0.42);
  }

  function drawSaw(ctx, g, palette) {
    var w = g.w, cy = g.cy;
    ctx.beginPath();
    ctx.moveTo(w * 0.71, cy - g.bh * 0.14);
    ctx.lineTo(w * 0.99, cy);
    ctx.lineTo(w * 0.71, cy + g.bh * 0.14);
    ctx.closePath();
    setFill(ctx, palette.accent, 0.96); ctx.fill();
    setStroke(ctx, palette.belly, Math.max(1, w * 0.006), 0.7); ctx.stroke();
    for (var i = 0; i < 8; i++) {
      var x = w * (0.74 + i * 0.031);
      var tooth = g.bh * (0.075 + (i % 2) * 0.03);
      poly(ctx, [[x, cy - tooth], [x + w * 0.014, cy - g.bh * 0.015], [x + w * 0.006, cy + tooth]], palette.belly, 0.95);
    }
  }

  function drawFrill(ctx, g, palette) {
    var w = g.w, h = g.h, cy = g.cy;
    for (var i = 0; i < 5; i++) {
      var x = w * (0.66 + i * 0.033);
      ctx.beginPath();
      ctx.moveTo(x, cy - g.bh * 0.55);
      ctx.quadraticCurveTo(x - w * 0.02, cy - h * (0.23 + i * 0.012), x + w * 0.02, cy - g.bh * 0.12);
      setStroke(ctx, palette.accent, Math.max(1, w * 0.012), 0.95); ctx.stroke();
      dot(ctx, x + w * 0.02, cy - h * (0.23 + i * 0.012), w * 0.012, palette.belly, 0.8);
    }
  }

  function drawWhale(ctx, g, palette) {
    var cy = g.cy, mouthStart = g.whaleHeadBaseX + g.bodyLen * 0.04, mouthEnd = g.bodyNoseX - g.w * 0.012;
    /* The broad head is already part of bodyPath. This is the feeding slit
     * cut into that flat face, with restrained baleen marks instead of a
     * second closed head shape. */
    line(ctx, mouthStart, cy + g.bh * 0.23, mouthEnd, cy + g.bh * 0.23,
      palette.accent, Math.max(1.7, g.w * 0.012), 0.92);
    for (var i = 0; i < 7; i++) {
      var x = mouthStart + (mouthEnd - mouthStart) * (0.12 + i * 0.12);
      line(ctx, x, cy + g.bh * 0.24, x + g.w * 0.008, cy + g.bh * 0.34,
        palette.belly, Math.max(1, g.w * 0.006), 0.72);
    }
  }

  function drawCroc(ctx, g, palette) {
    var w = g.w, h = g.h, cy = g.cy;
    ctx.beginPath();
    ctx.moveTo(w * 0.69, cy - h * 0.08);
    ctx.lineTo(w * 0.99, cy - h * 0.02);
    ctx.lineTo(w * 0.99, cy + h * 0.08);
    ctx.lineTo(w * 0.69, cy + h * 0.18);
    ctx.closePath();
    setFill(ctx, palette.base, 0.97); ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1, w * 0.008), 1); ctx.stroke();
    for (var i = 0; i < 5; i++) {
      var x = w * (0.77 + i * 0.042);
      line(ctx, x, cy - h * 0.07, x + w * 0.01, cy - h * 0.17, palette.accent, Math.max(1, w * 0.006), 0.9);
      poly(ctx, [[x, cy + h * 0.08], [x + w * 0.012, cy + h * 0.16], [x + w * 0.024, cy + h * 0.08]], palette.belly, 0.92);
    }
    for (var r = 0; r < 4; r++) line(ctx, w * (0.43 + r * 0.06), cy - g.bh * (0.82 - r * 0.05), w * (0.46 + r * 0.06), cy - g.bh * 0.99, palette.accent, Math.max(1, w * 0.008), 0.85);
  }

  function drawAngler(ctx, g, palette) {
    var w = g.w, h = g.h, cy = g.cy;
    ctx.beginPath();
    ctx.moveTo(w * 0.68, cy + h * 0.02);
    ctx.bezierCurveTo(w * 0.75, cy + h * 0.05, w * 0.86, cy + h * 0.05, w * 0.96, cy + h * 0.2);
    ctx.bezierCurveTo(w * 0.87, cy + h * 0.34, w * 0.75, cy + h * 0.28, w * 0.66, cy + h * 0.1);
    ctx.closePath();
    setFill(ctx, 0x140d25, 0.98); ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1, w * 0.009), 1); ctx.stroke();
    for (var i = 0; i < 7; i++) {
      var x = w * (0.71 + i * 0.034);
      poly(ctx, [[x, cy + h * 0.07], [x + w * 0.013, cy + h * (0.17 + (i % 2) * 0.04)], [x + w * 0.024, cy + h * 0.07]], palette.belly, 0.9);
    }
    ctx.beginPath();
    ctx.moveTo(w * 0.72, cy - h * 0.17);
    ctx.quadraticCurveTo(w * 0.68, cy - h * 0.38, w * 0.75, cy - h * 0.47);
    setStroke(ctx, palette.accent, Math.max(1, w * 0.009), 1); ctx.stroke();
    dot(ctx, w * 0.75, cy - h * 0.49, w * 0.035, palette.glow || palette.belly, 1);
    dot(ctx, w * 0.75, cy - h * 0.49, w * 0.014, 0xffffff, 1);
  }

  function drawRock(ctx, g, palette) {
    var w = g.w, h = g.h, cy = g.cy;
    poly(ctx, [[w * 0.7, cy - h * 0.19], [w * 0.79, cy - h * 0.3], [w * 0.9, cy - h * 0.23], [w * 0.95, cy - h * 0.04], [w * 0.91, cy + h * 0.17], [w * 0.77, cy + h * 0.19], [w * 0.69, cy + h * 0.08]], palette.base, 0.97);
    setStroke(ctx, palette.accent, Math.max(1, w * 0.008), 1);
    ctx.beginPath(); ctx.moveTo(w * 0.77, cy - h * 0.25); ctx.lineTo(w * 0.84, cy + h * 0.14); ctx.lineTo(w * 0.92, cy - h * 0.12); ctx.stroke();
    line(ctx, w * 0.78, cy - h * 0.03, w * 0.9, cy + h * 0.08, palette.belly, Math.max(1, w * 0.006), 0.6);
  }

  function drawMech(ctx, g, palette) {
    var w = g.w, h = g.h, cy = g.cy;
    /* Mechanical panels borrow the body's countershade rather than dropping
     * a flat opaque polygon on top of it. The quiet edge and belly highlight
     * keep the panel seated in the shark's lighting. */
    var panel = linearGradient(ctx, 0, cy - h * 0.2, 0, cy + h * 0.2, [
      [0, cssColor(blend(palette.base, palette.accent, 0.3), 0.95)],
      [0.58, cssColor(blend(palette.base, palette.belly, 0.2), 0.96)],
      [1, cssColor(blend(palette.belly, palette.base, 0.22), 0.96)]
    ]);
    ctx.beginPath();
    ctx.moveTo(w * 0.68, cy - h * 0.19); ctx.lineTo(w * 0.82, cy - h * 0.23);
    ctx.lineTo(w * 0.94, cy - h * 0.1); ctx.lineTo(w * 0.94, cy + h * 0.13);
    ctx.lineTo(w * 0.79, cy + h * 0.2); ctx.lineTo(w * 0.68, cy + h * 0.1); ctx.closePath();
    ctx.fillStyle = panel; ctx.fill();
    setStroke(ctx, blend(palette.accent, palette.base, 0.38), Math.max(1, w * 0.007), 0.72); ctx.stroke();
    line(ctx, w * 0.71, cy - h * 0.08, w * 0.92, cy - h * 0.08, palette.belly, Math.max(1, w * 0.008), 0.5);
    line(ctx, w * 0.71, cy + h * 0.08, w * 0.91, cy + h * 0.08, palette.accent, Math.max(1, w * 0.007), 0.64);
    dot(ctx, w * 0.88, cy - h * 0.04, w * 0.026, palette.glow || palette.belly, 1);
    fin(ctx, w * 0.76, cy + h * 0.13, w * 0.75, cy + h * 0.34, w * 0.84, cy + h * 0.16, palette, Math.max(1, w * 0.006));
  }

  function drawSkull(ctx, g, palette) {
    var w = g.w, cy = g.cy, socketY = cy - g.bh * 0.38;
    /* Skull ridges are the body contour. These are only internal bone seams
     * and socket shadows, so no closed skull plate can read as a sticker. */
    var socketX = g.bodyNoseX - g.bodyLen * 0.16;
    safeSave(ctx);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath(); ctx.ellipse(socketX, socketY, g.bh * 0.16, g.bh * 0.12, -0.18, 0, Math.PI * 2);
    setFill(ctx, palette.accent, 0.86); ctx.fill();
    ctx.beginPath(); ctx.ellipse(socketX + g.bh * 0.22, socketY + g.bh * 0.02, g.bh * 0.12, g.bh * 0.1, 0.12, 0, Math.PI * 2);
    setFill(ctx, blend(palette.accent, 0x000000, 0.24), 0.62); ctx.fill();
    safeRestore(ctx);
    line(ctx, socketX - g.bh * 0.12, cy + g.bh * 0.3, g.bodyNoseX - g.bh * 0.02, cy + g.bh * 0.34,
      palette.belly, Math.max(1.2, w * 0.007), 0.58);
    line(ctx, g.skullCrestBaseX + g.bodyLen * 0.04, cy - g.bh * 0.84,
      g.bodyNoseX - g.bodyLen * 0.03, cy - g.bh * 0.62,
      palette.belly, Math.max(1, w * 0.006), 0.54);
  }

  function drawVoid(ctx, g, palette) {
    var w = g.w, h = g.h, cy = g.cy;
    safeSave(ctx);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.ellipse(w * 0.78, cy - h * 0.12, w * 0.035, h * 0.08, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.88, cy + h * 0.05, w * 0.028, h * 0.06, 0.25, 0, Math.PI * 2); ctx.fill();
    safeRestore(ctx);
    ctx.beginPath();
    ctx.moveTo(w * 0.77, cy - h * 0.2); ctx.bezierCurveTo(w * 0.85, cy - h * 0.32, w * 0.95, cy - h * 0.1, w * 0.97, cy);
    ctx.bezierCurveTo(w * 0.89, cy - h * 0.03, w * 0.83, cy + h * 0.13, w * 0.76, cy + h * 0.2);
    setStroke(ctx, palette.glow || palette.accent, Math.max(1, w * 0.008), 0.9); ctx.stroke();
  }

  function drawKaiju(ctx, g, palette) {
    var w = g.w, cy = g.cy, h = g.h;
    for (var i = 0; i < 8; i++) {
      var x = w * (0.29 + i * 0.075);
      var ht = h * (0.1 + (i % 3) * 0.045);
      poly(ctx, [[x - w * 0.035, cy - g.bh * 0.48], [x + w * 0.008, cy - g.bh * 0.48 - ht], [x + w * 0.05, cy - g.bh * 0.4]], palette.accent, 0.98);
      line(ctx, x + w * 0.008, cy - g.bh * 0.48 - ht, x + w * 0.02, cy - g.bh * 0.45, palette.glow || palette.belly, Math.max(1, w * 0.006), 0.85);
    }
    for (var t = 0; t < 6; t++) {
      var tx = w * (0.74 + t * 0.035);
      poly(ctx, [[tx, cy + h * 0.09], [tx + w * 0.012, cy + h * 0.2], [tx + w * 0.024, cy + h * 0.09]], palette.belly, 0.94);
    }
    /* The plate row owns the dorsal silhouette; this heavier brow keeps the
     * kaiju head weight readable after the body becomes genuinely fusiform. */
    line(ctx, w * 0.73, cy - g.bh * 0.55, w * 0.84, cy - g.bh * 0.48,
      palette.accent, Math.max(2, w * 0.015), 0.95);
  }

  function eyePosition(g) {
    var w = g.w, cy = g.cy;
    var x = g.bodyNoseX - g.bodyLen * 0.16;
    if (g.head === 'hammer') x = g.foilX - g.bodyLen * 0.075;
    if (g.head === 'saw') x = w * 0.76;
    if (g.head === 'croc') x = w * 0.8;
    if (g.head === 'whale') x = g.bodyNoseX - g.bodyLen * 0.2;
    /* The eye sits in the heavy front third, not halfway down a fish body. */
    return [x, cy - g.bh * (g.head === 'hammer' ? 0.72 : 0.48)];
  }

  function drawEye(ctx, g, palette) {
    var pos = eyePosition(g), x = pos[0], y = pos[1];
    var tier = clamp(finiteNumber(g.tier, 1), 1, 12);
    // Widened to [1,5]: act 4 (Pantheon gods) keeps the glow-eye branch
    // (act >= 2) and reads brighter via r growth with tier; act 5
    // (Underworld demons) also glows, consistent with act-2/3 "monster"
    // styling rather than getting a separate branch.
    var act = clamp(finiteNumber(g.act, tier >= 5 ? 2 : 1), 1, 5);
    var r = Math.max(2.05, g.w * (0.015 + tier * 0.00072));
    var glow = palette.glow || blend(palette.accent, palette.belly, 0.2);
    var iris = act >= 2 ? glow : blend(palette.accent, 0x01060d, 0.18);
    /* A wedge-shaped brow is the expression pass. It is intentionally drawn
     * over the eye's top edge so the face reads angry at menu and gameplay
     * sizes instead of merely well-lit. */
    ctx.beginPath();
    ctx.moveTo(x - r * 1.72, y - r * 1.38);
    ctx.quadraticCurveTo(x - r * 0.35, y - r * 2.18, x + r * 1.7, y - r * 1.72);
    ctx.lineTo(x + r * 1.55, y - r * 1.1);
    ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.55, x - r * 1.72, y - r * 1.05);
    ctx.closePath();
    setFill(ctx, blend(palette.accent, 0x000309, 0.4), 0.92);
    ctx.fill();
    setStroke(ctx, act >= 2 ? blend(glow, 0xffffff, 0.12) : palette.accent, Math.max(0.8, r * 0.18), act >= 2 ? 0.7 : 0.5);
    ctx.stroke();
    safeSave(ctx);
    ctx.shadowColor = cssColor(glow, act >= 2 ? 0.95 : 0.45); ctx.shadowBlur = Math.max(2, g.w * (act >= 2 ? 0.04 : 0.018));
    dot(ctx, x, y, r * 1.72, glow, act >= 2 ? 0.36 : 0.16);
    safeRestore(ctx);
    ctx.beginPath(); ctx.arc(x, y, r * 1.36, 0, Math.PI * 2);
    setFill(ctx, blend(palette.accent, 0x02070d, 0.24), 1); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * 1.06, 0, Math.PI * 2);
    ctx.fillStyle = act >= 2 ? radialGradient(ctx, x - r * 0.25, y - r * 0.28, 0, x, y, r * 1.1, [
      [0, cssColor(blend(iris, 0xffffff, 0.55), 1)], [0.45, cssColor(iris, 1)], [1, cssColor(blend(iris, palette.accent, 0.42), 1)]
    ]) : cssColor(iris, 1);
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.12, y, r * 0.23, r * 0.78, 0, 0, Math.PI * 2);
    setFill(ctx, 0x02050a, 1); ctx.fill();
    dot(ctx, x + r * 0.43, y - r * 0.47, r * 0.34, 0xffffff, 0.98);
    dot(ctx, x - r * 0.3, y + r * 0.25, r * 0.12, 0xffffff, 0.42);
  }

  function drawGills(ctx, g, palette) {
    var x = g.peduncleX + g.bodyLen * 0.54, cy = g.cy, bh = g.bh;
    for (var i = 0; i < 6; i++) {
      var gx = x + i * g.w * 0.024;
      ctx.beginPath();
      ctx.moveTo(gx, cy - bh * 0.42);
      ctx.quadraticCurveTo(gx - g.w * 0.018, cy - bh * 0.02, gx - g.w * 0.034, cy + bh * 0.48);
      setStroke(ctx, blend(palette.accent, 0x00050a, 0.22), Math.max(1.15, g.w * 0.0065), 0.9); ctx.stroke();
    }
  }

  function mouthMetrics(g) {
    var x0 = g.peduncleX + g.bodyLen * 0.56;
    var x1 = g.bodyNoseX - g.w * 0.018;
    if (g.head === 'eel') x0 = g.peduncleX + g.bodyLen * 0.63;
    if (g.head === 'whale') x0 = g.whaleHeadBaseX + g.bodyLen * 0.03;
    if (g.head === 'hammer') { x0 = g.bodyNoseX - g.bodyLen * 0.34; x1 = g.faceX; }
    if (g.head === 'saw') { x0 = g.w * 0.62; x1 = g.w * 0.835; }
    var gape = g.mouthGape || 0.22;
    var top0 = g.cy + g.bh * (g.head === 'whale' ? 0.2 : 0.02);
    var top1 = g.cy + g.bh * (g.head === 'whale' ? 0.3 : 0.14);
    var bottom0 = g.cy + g.bh * (0.58 + gape * 0.62);
    var bottom1 = g.cy + g.bh * (0.28 + gape * 0.22);
    return { x0: x0, x1: x1, top0: top0, top1: top1, bottom0: bottom0, bottom1: bottom1, gape: gape };
  }

  function mouthToothRow(ctx, g, palette, m, count, lower) {
    var toothH = g.bh * (0.13 + g.tier * 0.009 + m.gape * 0.12);
    var toothW = Math.max(1.2, g.w * (0.007 + g.tier * 0.0007));
    for (var i = 0; i < count; i++) {
      var t = (i + 0.5) / count;
      var tx = m.x0 + (m.x1 - m.x0) * (0.07 + t * 0.86);
      var ty = lower ? m.bottom0 + (m.bottom1 - m.bottom0) * ((tx - m.x0) / (m.x1 - m.x0)) :
        m.top0 + (m.top1 - m.top0) * ((tx - m.x0) / (m.x1 - m.x0));
      if (lower) {
        poly(ctx, [[tx - toothW, ty], [tx + toothW, ty + g.bh * 0.012], [tx, ty - toothH]], blend(palette.belly, 0xffffff, 0.14), 0.98);
      } else {
        poly(ctx, [[tx - toothW, ty], [tx + toothW, ty - g.bh * 0.012], [tx, ty + toothH]], blend(palette.belly, 0xffffff, 0.14), 0.98);
      }
    }
  }

  function drawMouth(ctx, g, palette, options) {
    var m = mouthMetrics(g), teeth = g.tier >= 2 ? Math.min(12, 4 + Math.floor(g.tier * 0.72)) : 0;
    /* A filled cavity, not a polite incision. The lower lip is deliberately
     * heavier and deeper to give the whole roster an underbite at rest. */
    safeSave(ctx);
    bodyPath(ctx, g); ctx.clip();
    ctx.beginPath();
    ctx.moveTo(m.x0, m.top0);
    ctx.quadraticCurveTo(m.x0 + (m.x1 - m.x0) * 0.45, m.top0 - g.bh * 0.07, m.x1, m.top1);
    ctx.lineTo(m.x1, m.bottom1);
    ctx.quadraticCurveTo(m.x0 + (m.x1 - m.x0) * 0.5, m.bottom0 + g.bh * 0.05, m.x0, m.bottom0);
    ctx.closePath();
    setFill(ctx, blend(palette.accent, 0x000000, 0.7), 0.98); ctx.fill();
    setStroke(ctx, blend(palette.accent, 0x000208, 0.38), Math.max(1.3, g.w * 0.008), 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x0 + g.w * 0.01, m.top0 + g.bh * 0.05);
    ctx.quadraticCurveTo(m.x0 + (m.x1 - m.x0) * 0.52, m.top0 + g.bh * 0.01, m.x1 - g.w * 0.008, m.top1 + g.bh * 0.025);
    setStroke(ctx, blend(palette.accent, 0xd2475f, 0.18), Math.max(1, g.w * 0.006), 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x0 + g.w * 0.01, m.bottom0 - g.bh * 0.04);
    ctx.quadraticCurveTo(m.x0 + (m.x1 - m.x0) * 0.52, m.bottom0 + g.bh * 0.015, m.x1 - g.w * 0.008, m.bottom1 - g.bh * 0.045);
    setStroke(ctx, palette.belly, Math.max(1, g.w * 0.0045), 0.5); ctx.stroke();
    if (teeth) {
      mouthToothRow(ctx, g, palette, m, teeth, false);
      if (!(options && options.separateJaw)) mouthToothRow(ctx, g, palette, m, teeth, true);
    }
    safeRestore(ctx);
  }

  function drawDorsalRim(ctx, g, palette) {
    var lit = blend(palette.belly, 0xffffff, 0.42);
    var start = g.bodyNoseX, end = g.peduncleX + g.bodyLen * 0.08;
    ctx.beginPath();
    if (g.head === 'hammer') {
      ctx.moveTo(g.faceX, g.cy - g.bh * 0.13);
      ctx.lineTo(g.foilX, g.cy - g.bh * 0.55);
      ctx.bezierCurveTo(g.foilX - g.bodyLen * 0.08, g.cy - g.bh * 1.05,
        g.bodyNoseX - g.bodyLen * 0.14, g.cy - g.bh * 1.04,
        g.peduncleX + g.bodyLen * 0.18, g.cy - g.bh * 0.82);
    } else {
      ctx.moveTo(start, g.cy - g.bh * 0.1);
      ctx.bezierCurveTo(start - g.bodyLen * 0.09, g.cy - g.bh * 0.78,
        g.maxX, g.cy - g.bh, end, g.cy - g.bh * 0.1);
    }
    setStroke(ctx, lit, Math.max(1.1, g.w * 0.007), 0.7);
    ctx.stroke();
    /* A thinner, cooler line gives the silhouette a polished edge at phone
     * scale without turning the whole outline into a cartoon stroke. */
    ctx.beginPath();
    ctx.moveTo(start - g.bodyLen * 0.025, g.cy - g.bh * 0.16);
    ctx.bezierCurveTo(start - g.bodyLen * 0.13, g.cy - g.bh * 0.72,
      g.maxX - g.bodyLen * 0.04, g.cy - g.bh * 0.91,
      g.peduncleX + g.bodyLen * 0.2, g.cy - g.bh * 0.72);
    setStroke(ctx, 0xdffaff, Math.max(0.7, g.w * 0.003), 0.32);
    ctx.stroke();
  }

  function drawMuscleShading(ctx, g, palette) {
    var bl = g.bodyLen, bh = g.bh, cy = g.cy;
    for (var i = 0; i < 3; i++) {
      var start = g.peduncleX + bl * (0.28 + i * 0.13);
      var end = start + bl * (0.28 - i * 0.025);
      var y = cy - bh * (0.04 - i * 0.13);
      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.bezierCurveTo(start + bl * 0.07, y - bh * 0.18,
        start + bl * 0.18, y - bh * 0.18, end, y + bh * 0.02);
      setStroke(ctx, blend(palette.accent, 0x00050a, 0.28), Math.max(1.2, g.w * 0.009), 0.38);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(start + bl * 0.02, y - bh * 0.07);
      ctx.bezierCurveTo(start + bl * 0.1, y - bh * 0.2,
        start + bl * 0.2, y - bh * 0.16, end - bl * 0.02, y - bh * 0.02);
      setStroke(ctx, blend(palette.belly, 0xffffff, 0.25), Math.max(0.8, g.w * 0.004), 0.25);
      ctx.stroke();
    }
  }

  function drawBodyModern(ctx, g, palette) {
    var bl = g.bodyLen, bh = g.bh, cy = g.cy;
    safeSave(ctx);
    bodyPath(ctx, g); ctx.clip();

    /* Soft white ellipse band: a specular streak follows the lit upper flank. */
    safeSave(ctx);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = radialGradient(ctx, g.peduncleX + bl * 0.48, cy - bh * 0.32, 0,
      g.peduncleX + bl * 0.48, cy - bh * 0.3, bl * 0.34,
      [[0, 'rgba(255,255,255,.28)'], [0.42, 'rgba(224,251,255,.11)'], [1, 'rgba(255,255,255,0)']]);
    ctx.beginPath(); ctx.ellipse(g.peduncleX + bl * 0.5, cy - bh * 0.34,
      bl * 0.28, Math.max(1.4, bh * 0.1), -0.08, 0, Math.PI * 2); ctx.fill();
    safeRestore(ctx);

    /* Fin-root and jaw-line occlusion are deliberately multiply blended so
     * they sit in the gradient instead of reading as opaque decals. */
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath(); ctx.ellipse(g.peduncleX + bl * 0.42, cy - bh * 0.82,
      bl * 0.095, Math.max(1.2, bh * 0.13), -0.3, 0, Math.PI * 2);
    setFill(ctx, 0x06131b, 0.22); ctx.fill();
    ctx.beginPath(); ctx.ellipse(g.peduncleX + bl * 0.3, cy + bh * 0.52,
      bl * 0.12, Math.max(1.2, bh * 0.13), 0.1, 0, Math.PI * 2);
    setFill(ctx, 0x06131b, 0.2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(g.peduncleX + bl * 0.68, cy + bh * 0.53);
    ctx.quadraticCurveTo(g.peduncleX + bl * 0.82, cy + bh * 0.75,
      g.bodyNoseX - g.w * 0.012, cy + bh * 0.2);
    setStroke(ctx, 0x02070d, Math.max(1, g.w * 0.011), 0.25); ctx.stroke();

    /* Muscles are broad enough to survive the 84px thumb while the smaller
     * speckles keep the vector finish from becoming a flat gradient. */
    drawMuscleShading(ctx, g, palette);
    /* Deterministic fine noise, two tones, clipped to the body silhouette. */
    for (var i = 0; i < 44; i++) {
      var x = g.peduncleX + bl * (0.08 + ((i * 37) % 87) / 100);
      var y = cy + (((i * 61) % 100) - 50) * bh / 62;
      var r = Math.max(0.45, g.w * (0.0024 + (i % 3) * 0.0012));
      dot(ctx, x, y, r, i % 2 ? blend(palette.accent, 0x001018, 0.35) : blend(palette.belly, 0xffffff, 0.2), i % 2 ? 0.16 : 0.12);
    }
    safeRestore(ctx);
    drawDorsalRim(ctx, g, palette);
  }

  function drawHeadFeatures(ctx, g, palette, options) {
    if (g.head === 'hammer') drawHammer(ctx, g, palette);
    else if (g.head === 'saw') drawSaw(ctx, g, palette);
    else if (g.head === 'frill') drawFrill(ctx, g, palette);
    else if (g.head === 'whale') drawWhale(ctx, g, palette);
    else if (g.head === 'croc') drawCroc(ctx, g, palette);
    else if (g.head === 'angler') drawAngler(ctx, g, palette);
    else if (g.head === 'rock') drawRock(ctx, g, palette);
    else if (g.head === 'mech') drawMech(ctx, g, palette);
    else if (g.head === 'skull') drawSkull(ctx, g, palette);
    else if (g.head === 'void') drawVoid(ctx, g, palette);
    else if (g.head === 'kaiju') drawKaiju(ctx, g, palette);
    drawGills(ctx, g, palette);
    drawMouth(ctx, g, palette, options);
    drawEye(ctx, g, palette);
  }

  function patternSpots(ctx, g, p) {
    var col = blend(p.accent, p.belly, 0.3);
    for (var i = 0; i < 15; i++) {
      var x = g.w * (0.31 + (i % 5) * 0.12), y = g.cy - g.bh * 0.65 + ((i * 37) % 9) * g.h * 0.075;
      dot(ctx, x, y, g.w * (0.012 + (i % 3) * 0.006), col, 0.52);
    }
  }

  function patternStripes(ctx, g, p) {
    for (var i = 0; i < 7; i++) {
      var x = g.w * (0.31 + i * 0.078);
      ctx.beginPath(); ctx.moveTo(x, g.cy - g.bh * 0.88); ctx.quadraticCurveTo(x - g.w * 0.04, g.cy, x + g.w * 0.018, g.cy + g.bh * 0.86);
      setStroke(ctx, p.accent, Math.max(1.2, g.w * 0.022), 0.62); ctx.stroke();
    }
  }

  function patternScars(ctx, g, p) {
    for (var i = 0; i < 6; i++) {
      var x = g.w * (0.34 + i * 0.085);
      ctx.beginPath(); ctx.moveTo(x, g.cy - g.bh * (0.48 - (i % 2) * 0.08)); ctx.lineTo(x + g.w * 0.045, g.cy - g.bh * 0.1); ctx.lineTo(x - g.w * 0.012, g.cy + g.bh * 0.3);
      setStroke(ctx, blend(p.belly, 0xffffff, 0.12), Math.max(1, g.w * 0.012), 0.72); ctx.stroke();
      line(ctx, x + g.w * 0.012, g.cy - g.bh * 0.27, x + g.w * 0.056, g.cy - g.bh * 0.08,
        p.accent, Math.max(0.8, g.w * 0.005), 0.62);
    }
  }

  function patternMottle(ctx, g, p) {
    for (var i = 0; i < 24; i++) {
      var x = g.w * (0.28 + ((i * 17) % 58) / 100);
      var y = g.cy + ((i * 29) % 100 - 50) * g.bh / 115;
      dot(ctx, x, y, g.w * (0.008 + (i % 4) * 0.004), blend(p.base, p.accent, (i % 3) * 0.23), 0.3);
    }
  }

  function patternPlates(ctx, g, p) {
    for (var i = 0; i < 10; i++) {
      var x = g.w * (0.26 + i * 0.058), y = g.cy - g.bh * 0.58 + (i % 2) * g.bh * 0.31;
      poly(ctx, [[x, y], [x + g.w * 0.045, y - g.h * 0.03], [x + g.w * 0.07, y + g.h * 0.05], [x + g.w * 0.012, y + g.h * 0.085]], p.accent, 0.54);
      setStroke(ctx, blend(p.belly, 0xffffff, 0.18), Math.max(1, g.w * 0.0055), 0.45); ctx.stroke();
      line(ctx, x + g.w * 0.012, y + g.h * 0.045, x + g.w * 0.048, y + g.h * 0.015,
        p.belly, Math.max(0.7, g.w * 0.0035), 0.42);
    }
  }

  function patternScales(ctx, g, p) {
    for (var row = 0; row < 3; row++) for (var i = 0; i < 11; i++) {
      var x = g.w * (0.28 + i * 0.06 + (row % 2) * 0.025);
      var y = g.cy - g.bh * 0.38 + row * g.bh * 0.28;
      ctx.beginPath(); ctx.arc(x, y, g.w * 0.022, Math.PI, 0); setStroke(ctx, p.accent, Math.max(1, g.w * 0.005), 0.48); ctx.stroke();
    }
  }

  function patternSpikes(ctx, g, p) {
    for (var i = 0; i < 11; i++) {
      var x = g.w * (0.27 + i * 0.057), y = g.cy - g.bh * 0.52;
      var tipY = y - g.h * (0.055 + (i % 3) * 0.035);
      poly(ctx, [[x, y], [x + g.w * 0.02, tipY], [x + g.w * 0.043, y + g.h * 0.012]], p.accent, 0.92);
      line(ctx, x + g.w * 0.019, tipY + g.h * 0.008, x + g.w * 0.035, y + g.h * 0.004,
        p.belly, Math.max(0.7, g.w * 0.0035), 0.68);
    }
  }

  function patternRays(ctx, g, p) {
    for (var i = 0; i < 8; i++) line(ctx, g.w * (0.28 + i * 0.07), g.cy - g.bh * 0.15, g.w * (0.25 + i * 0.075), g.cy + g.bh * 0.58, p.accent, Math.max(1, g.w * 0.009), 0.52);
  }

  function patternStars(ctx, g, p) {
    for (var i = 0; i < 10; i++) {
      var x = g.w * (0.3 + ((i * 31) % 58) / 100), y = g.cy - g.bh * 0.5 + (i % 5) * g.bh * 0.24;
      line(ctx, x - g.w * 0.018, y, x + g.w * 0.018, y, p.belly, Math.max(1, g.w * 0.005), 0.78);
      line(ctx, x, y - g.h * 0.026, x, y + g.h * 0.026, p.belly, Math.max(1, g.w * 0.005), 0.78);
    }
  }

  function patternSwirls(ctx, g, p) {
    for (var i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(g.w * (0.36 + i * 0.11), g.cy, g.h * (0.06 + i * 0.008), 0.3, Math.PI * 1.55);
      setStroke(ctx, p.accent, Math.max(1, g.w * 0.01), 0.58); ctx.stroke();
    }
  }

  function patternCracks(ctx, g, p) {
    for (var i = 0; i < 5; i++) {
      var x = g.w * (0.3 + i * 0.12);
      ctx.beginPath(); ctx.moveTo(x, g.cy - g.bh * 0.78); ctx.lineTo(x - g.w * 0.025, g.cy - g.bh * 0.25); ctx.lineTo(x + g.w * 0.02, g.cy + g.bh * 0.05); ctx.lineTo(x - g.w * 0.01, g.cy + g.bh * 0.7);
      setStroke(ctx, p.glow || p.accent, Math.max(1, g.w * 0.009), 0.78); ctx.stroke();
    }
  }

  function patternCoral(ctx, g, p) {
    for (var i = 0; i < 7; i++) {
      var x = g.w * (0.3 + i * 0.08);
      line(ctx, x, g.cy - g.bh * 0.35, x - g.w * 0.022, g.cy - g.bh * 0.72, p.accent, Math.max(1, g.w * 0.012), 0.75);
      line(ctx, x - g.w * 0.01, g.cy - g.bh * 0.57, x + g.w * 0.026, g.cy - g.bh * 0.76, p.belly, Math.max(1, g.w * 0.009), 0.74);
    }
  }

  function patternMagma(ctx, g, p) {
    patternCracks(ctx, g, p);
    setStroke(ctx, p.glow || 0xff7a2b, Math.max(1.2, g.w * 0.016), 0.75);
    ctx.beginPath(); ctx.moveTo(g.w * 0.34, g.cy + g.bh * 0.45); ctx.quadraticCurveTo(g.w * 0.55, g.cy + g.bh * 0.15, g.w * 0.76, g.cy + g.bh * 0.55); ctx.stroke();
  }

  function patternRings(ctx, g, p) {
    for (var i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(g.w * (0.43 + i * 0.105), g.cy, g.h * (0.08 + i * 0.015), 0, Math.PI * 2);
      setStroke(ctx, p.accent, Math.max(1, g.w * 0.008), 0.48); ctx.stroke();
    }
  }

  function patternMirror(ctx, g, p) {
    ctx.beginPath(); ctx.moveTo(g.w * 0.28, g.cy); ctx.lineTo(g.w * 0.83, g.cy - g.bh * 0.05);
    setStroke(ctx, p.belly, Math.max(1.4, g.w * 0.012), 0.58); ctx.stroke();
    patternSpots(ctx, g, p);
  }

  function patternRibbons(ctx, g, p) {
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(g.w * 0.28, g.cy - g.bh * (0.4 - i * 0.25));
      ctx.bezierCurveTo(g.w * 0.45, g.cy + g.bh * 0.4, g.w * 0.62, g.cy - g.bh * 0.5, g.w * 0.86, g.cy + g.bh * 0.24);
      setStroke(ctx, blend(p.accent, p.belly, 0.45 + i * 0.12), Math.max(1.5, g.w * 0.014), 0.64); ctx.stroke();
    }
  }

  function patternBones(ctx, g, p) {
    for (var i = 0; i < 5; i++) {
      var x = g.w * (0.32 + i * 0.1);
      line(ctx, x, g.cy - g.bh * 0.44, x, g.cy + g.bh * 0.44, p.belly, Math.max(1.2, g.w * 0.012), 0.62);
      dot(ctx, x, g.cy - g.bh * 0.46, g.w * 0.018, p.belly, 0.7);
      dot(ctx, x, g.cy + g.bh * 0.46, g.w * 0.018, p.belly, 0.7);
    }
  }

  function patternRunes(ctx, g, p) {
    for (var i = 0; i < 5; i++) {
      var x = g.w * (0.33 + i * 0.1), y = g.cy - g.bh * 0.18;
      ctx.beginPath(); ctx.moveTo(x, y - g.h * 0.06); ctx.lineTo(x + g.w * 0.022, y); ctx.lineTo(x, y + g.h * 0.06); ctx.lineTo(x - g.w * 0.022, y); ctx.closePath();
      setStroke(ctx, p.glow || p.accent, Math.max(1, g.w * 0.006), 0.75); ctx.stroke();
    }
  }

  var patterns = {
    plain: function (ctx, g, p) { line(ctx, g.w * 0.29, g.cy - g.bh * 0.56, g.w * 0.78, g.cy - g.bh * 0.62, p.belly, Math.max(1, g.w * 0.006), 0.18); },
    spots: patternSpots, dots: patternSpots,
    collar: function (ctx, g, p) { ctx.beginPath(); ctx.ellipse(g.w * 0.62, g.cy, g.w * 0.08, g.bh * 0.98, 0, 0, Math.PI * 2); setStroke(ctx, p.accent, Math.max(1.5, g.w * 0.026), 0.62); ctx.stroke(); },
    stripes: patternStripes, bands: patternStripes, ribbons: patternRibbons,
    scars: patternScars, cracks: patternCracks, faults: patternCracks,
    mottled: patternMottle, rot: patternMottle, boils: patternMottle,
    plates: patternPlates, panels: patternPlates, plating: patternPlates, rivets: patternPlates, facets: patternPlates,
    scales: patternScales, spikes: patternSpikes, coral: patternCoral, rays: patternRays,
    stars: patternStars, swirls: patternSwirls, bones: patternBones, mirror: patternMirror,
    magma: patternMagma, rings: patternRings, runes: patternRunes,
    corona: function (ctx, g, p) { patternRays(ctx, g, p); patternRings(ctx, g, p); }
  };

  function paintPattern(ctx, g, p, name) {
    var painter = patterns[name] || patterns.plain;
    safeSave(ctx);
    ctx.globalCompositeOperation = 'multiply';
    bodyPath(ctx, g); ctx.clip();
    painter(ctx, g, p);
    safeRestore(ctx);
  }

  function glowStroke(ctx, draw, color, width) {
    safeSave(ctx);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = cssColor(color, 0.95);
    ctx.shadowBlur = Math.max(4, width * 3);
    setStroke(ctx, color, width * 2.4, 0.3);
    draw();
    ctx.shadowBlur = 0;
    setStroke(ctx, color, width, 0.95);
    draw();
    safeRestore(ctx);
  }

  function fxVeins(ctx, g, p) {
    var c = p.glow || 0xff7c2d;
    glowStroke(ctx, function () {
      ctx.beginPath(); ctx.moveTo(g.w * 0.34, g.cy + g.bh * 0.35); ctx.lineTo(g.w * 0.48, g.cy + g.bh * 0.05); ctx.lineTo(g.w * 0.62, g.cy + g.bh * 0.28); ctx.lineTo(g.w * 0.78, g.cy - g.bh * 0.12); ctx.stroke();
    }, c, Math.max(1, g.w * 0.009));
    var pos = eyePosition(g); dot(ctx, pos[0], pos[1], g.w * 0.032, c, 0.9);
  }

  function fxLure(ctx, g, p) {
    var c = p.glow || 0xffe86a;
    glowStroke(ctx, function () { ctx.beginPath(); ctx.moveTo(g.w * 0.72, g.cy - g.h * 0.12); ctx.quadraticCurveTo(g.w * 0.67, g.cy - g.h * 0.36, g.w * 0.75, g.cy - g.h * 0.48); ctx.stroke(); }, c, Math.max(1, g.w * 0.009));
    dot(ctx, g.w * 0.75, g.cy - g.h * 0.49, g.w * 0.038, c, 0.9);
  }

  function fxFrost(ctx, g, p) {
    var c = p.glow || 0xa8f4ff;
    for (var i = 0; i < 9; i++) {
      var x = g.w * (0.31 + i * 0.067), y = g.cy - g.bh * 0.52;
      glowStroke(ctx, function () {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - g.w * 0.025, y - g.h * 0.075); ctx.moveTo(x, y); ctx.lineTo(x + g.w * 0.028, y - g.h * 0.06); ctx.stroke();
      }, c, Math.max(1, g.w * 0.006));
    }
  }

  function fxArcs(ctx, g, p) {
    var c = p.glow || 0x7df7ff;
    for (var i = 0; i < 4; i++) {
      glowStroke(ctx, function () {
        ctx.beginPath(); ctx.moveTo(g.w * (0.3 + i * 0.13), g.cy - g.bh * 0.38); ctx.quadraticCurveTo(g.w * (0.36 + i * 0.13), g.cy, g.w * (0.42 + i * 0.13), g.cy + g.bh * 0.38); ctx.stroke();
      }, c, Math.max(1, g.w * 0.007));
    }
  }

  function fxRings(ctx, g, p) {
    var c = p.glow || 0xcaa7ff;
    for (var i = 0; i < 3; i++) {
      glowStroke(ctx, function () { ctx.beginPath(); ctx.arc(g.w * 0.74, g.cy, g.h * (0.16 + i * 0.06), -0.72, 0.7); ctx.stroke(); }, c, Math.max(1, g.w * 0.006));
    }
  }

  function fxVoid(ctx, g, p) {
    var c = p.glow || 0xb577ff;
    glowStroke(ctx, function () { ctx.beginPath(); ctx.arc(g.w * 0.72, g.cy, g.h * 0.24, 2.4, 5.2); ctx.stroke(); }, c, Math.max(1, g.w * 0.008));
    dot(ctx, g.w * 0.76, g.cy - g.h * 0.12, g.w * 0.022, 0xffffff, 0.9);
  }

  function fxCharge(ctx, g, p) {
    var c = p.glow || 0xffbd65;
    for (var i = 0; i < 8; i++) {
      var x = g.w * (0.3 + i * 0.075), ht = g.h * (0.1 + (i % 3) * 0.05);
      glowStroke(ctx, function () { ctx.beginPath(); ctx.moveTo(x, g.cy - g.bh * 0.45); ctx.lineTo(x + g.w * 0.01, g.cy - g.bh * 0.45 - ht); ctx.stroke(); }, c, Math.max(1, g.w * 0.007));
    }
  }

  function fxAura(ctx, g, p) {
    var c = p.glow || 0xffdc84;
    safeSave(ctx); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radialGradient(ctx, g.w * 0.72, g.cy, 0, g.w * 0.72, g.cy, g.h * 0.64, [[0, cssColor(c, 0.24)], [0.55, cssColor(c, 0.07)], [1, cssColor(c, 0)]]);
    ctx.beginPath(); ctx.arc(g.w * 0.72, g.cy, g.h * 0.64, 0, Math.PI * 2); ctx.fill();
    safeRestore(ctx);
  }

  function fxHalo(ctx, g, p) {
    var c = p.glow || p.accent;
    safeSave(ctx);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = cssColor(c, 0.78);
    ctx.shadowBlur = Math.max(7, g.w * 0.07);
    ctx.beginPath();
    ctx.ellipse(g.peduncleX + g.bodyLen * 0.72, g.cy - g.bh * 0.03,
      g.bodyLen * 0.18, g.bh * 0.52, 0, 0, Math.PI * 2);
    setFill(ctx, c, 0.08);
    ctx.fill();
    ctx.shadowBlur = 0;
    safeRestore(ctx);
  }

  var fxPainters = {
    emberEyes: fxVeins, gulpGlow: fxAura, lure: fxLure, sailGlow: fxAura,
    shadow: fxVoid, crown: fxCharge, alien: fxVoid, abyssGlow: fxVoid, rift: fxVoid,
    venomDrip: fxVeins, soundRings: fxRings, lavaVeins: fxVeins, frost: fxFrost,
    arcs: fxArcs, gloom: fxVoid, sparks: fxArcs, thrusters: fxArcs, emberTrail: fxVeins,
    iceShards: fxFrost, wisps: fxAura, dynamo: fxArcs, spores: fxAura, corona: fxAura,
    moonlit: fxAura, stormcap: fxArcs, whirl: fxRings, marrowGlow: fxAura, glints: fxAura,
    aurora: fxAura, eruption: fxVeins, stormcrown: fxCharge, voidRipple: fxVoid,
    clockGlow: fxRings, tremor: fxRings, wail: fxRings, engine: fxArcs, warlights: fxCharge,
    omens: fxAura, sunflare: fxAura, iceAge: fxFrost, dorsalCharge: fxCharge
  };

  function paintFx(ctx, g, p, name) {
    if (!name || name === 'none') return;
    var painter = fxPainters[name] || fxAura;
    /* Outer halo is separate from the clipped effect marks, so Act 2/3
     * elements read luminous even when their internal line is small. */
    fxHalo(ctx, g, p);
    safeSave(ctx);
    bodyPath(ctx, g); ctx.clip();
    painter(ctx, g, p);
    safeRestore(ctx);
    if (name === 'dorsalCharge' || name === 'stormcrown' || name === 'crown') {
      /* Keep a bright, separable dorsal identity for RF.Juice.kaiju and any
       * future pulse code that tints the texture or its sprite. */
      for (var i = 0; i < 7; i++) {
        var x = g.w * (0.3 + i * 0.075);
        glowStroke(ctx, function () { ctx.beginPath(); ctx.moveTo(x, g.cy - g.bh * 0.5); ctx.lineTo(x + g.w * 0.01, g.cy - g.bh * 0.72); ctx.stroke(); }, p.glow || p.accent, Math.max(1, g.w * 0.006));
      }
    }
  }

  function drawTailArt(ctx, g, palette) {
    tailPath(ctx, g);
    ctx.fillStyle = linearGradient(ctx, 0, g.cy - g.bh * 1.2, 0, g.cy + g.bh * 1.2, [
      [0, cssColor(blend(palette.base, palette.belly, 0.16))],
      [0.32, cssColor(palette.base)],
      [0.7, cssColor(blend(palette.accent, palette.base, 0.34))],
      [1, cssColor(blend(palette.belly, palette.accent, 0.42))]
    ]);
    ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1, g.w * 0.009), 0.92); ctx.stroke();
    safeSave(ctx);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = radialGradient(ctx, g.peduncleX - g.w * 0.03, g.cy - g.bh * 0.52, 0,
      g.peduncleX - g.w * 0.04, g.cy - g.bh * 0.45, g.w * 0.24,
      [[0, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
    ctx.beginPath(); ctx.ellipse(g.peduncleX - g.w * 0.075, g.cy - g.bh * 0.42,
      g.w * 0.12, Math.max(1, g.bh * 0.1), -0.2, 0, Math.PI * 2); ctx.fill();
    safeRestore(ctx);
    ctx.beginPath();
    ctx.moveTo(g.peduncleX, g.cy);
    ctx.bezierCurveTo(g.peduncleX - g.w * 0.08, g.cy - g.bh * 0.38,
      g.peduncleX - g.w * 0.12, g.cy - g.bh * 0.72,
      g.peduncleX - g.w * 0.14, g.cy - g.bh * 0.84);
    setStroke(ctx, blend(palette.belly, 0xffffff, 0.18), Math.max(0.8, g.w * 0.004), 0.48); ctx.stroke();
  }

  function jawPath(ctx, x0, y0, x1, y1, depth) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (x1 - x0) * 0.28, y0 + depth * 0.18,
      x0 + (x1 - x0) * 0.66, y1 + depth, x1, y1);
    ctx.bezierCurveTo(x1 - (x1 - x0) * 0.2, y1 + depth * 0.2,
      x0 + (x1 - x0) * 0.22, y0 + depth * 0.88, x0, y0);
    ctx.closePath();
  }

  function drawJawOverlay(ctx, g, palette) {
    var m = mouthMetrics(g), x0 = m.x0, x1 = m.x1;
    var y0 = m.bottom0 - g.bh * 0.02, y1 = m.bottom1 - g.bh * 0.02;
    var depth = Math.max(2, g.bh * (0.3 + g.tier * 0.018 + m.gape * 0.18));
    jawPath(ctx, x0, y0, x1, y1, depth);
    ctx.fillStyle = linearGradient(ctx, 0, y0, 0, y1 + depth, [
      [0, cssColor(blend(palette.accent, palette.base, 0.15))],
      [0.55, cssColor(blend(palette.base, palette.belly, 0.25))],
      [1, cssColor(palette.belly)]
    ]); ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1, g.w * 0.007), 0.9); ctx.stroke();
    var count = Math.min(12, 4 + Math.floor(g.tier * 0.72));
    for (var i = 0; i < count; i++) {
      var t = (i + 0.5) / count;
      var tx = x0 + (x1 - x0) * (0.12 + t * 0.76);
      var ty = y0 + (y1 - y0) * ((tx - x0) / (x1 - x0));
      var tw = Math.max(1, g.w * (0.006 + g.tier * 0.0008));
      poly(ctx, [[tx - tw, ty], [tx + tw, ty - g.bh * 0.012], [tx, ty - depth * 0.62]], blend(palette.belly, 0xffffff, 0.14), 0.98);
    }
  }

  function drawShark(ctx, g, palette, sil, options) {
    if (!ctx) return;
    var opts = options || {};
    safeSave(ctx);
    ctx.translate(0, 0);
    if (opts.includeTail !== false) drawTailArt(ctx, g, palette);
    drawFins(ctx, g, palette, opts.includePectoral !== false);
    bodyPath(ctx, g);
    bodyFill(ctx, g, palette);
    drawBodyModern(ctx, g, palette);
    paintPattern(ctx, g, palette, sil.pattern || 'plain');
    drawHeadFeatures(ctx, g, palette, { separateJaw: !!opts.separateJaw });
    paintFx(ctx, g, palette, sil.fx);
    if (opts.includeJaw) drawJawOverlay(ctx, g, palette);
    safeRestore(ctx);
    if (ctx.canvas && ctx.canvas.__rfDpr) {
      ctx.canvas.__rfSilhouette = makeSilhouetteMask(g, ctx.canvas.width, ctx.canvas.height, ctx.canvas.__rfDpr);
    }
  }

  function bakeShark(scene, sharkDef, variant) {
    var def = sharkDef || {};
    var sil = def.sil || {};
    var v = variant === 'menu' ? 'menu' : (variant === 'thumb' ? 'thumb' : 'play');
    var id = String(def.id || 'shark');
    var key = 'rf_shark_' + id + '_' + v;
    if (textureCache[key]) {
      addTexture(scene, key, textureCache[key].canvas);
      return key;
    }
    var mul = v === 'menu' ? 2 : 1;
    var len = clamp(finiteNumber(sil.len, 1), 0.5, 3);
    /* Wide bake box is intentional: the body ratio is now controlled by the
     * fusiform profile, while this height reserves air for the stronger
     * dorsal/pectoral fins and the swept caudal lobes. */
    var cssW = Math.round(260 * len * mul);
    var cssH = Math.round(210 * len * mul);
    if (v === 'thumb') {
      /* iOS canvas-memory hotfix (2026-08-19 live crash): 61 'menu' bakes at
       * DPR 3 cost hundreds of MB and Safari kills the page. Thumbnails get a
       * FIXED small box; geometry scales inside it, species identity intact.
       * Full detail still exists in the run and the (lazily baked) shop. */
      cssW = 112; cssH = 90;
    }
    var surface = makeSurface(cssW, cssH);
    var p = paletteOf(def);
    var g = sharkGeom(cssW, cssH, sil, v === 'menu', def.tier, def.act, id);
    drawShark(surface.ctx, g, p, sil);
    var rec = { key: key, canvas: surface.canvas, ctx: surface.ctx, width: cssW, height: cssH, dpr: surface.dpr || 1, glow: p.glow, geometry: g };
    textureCache[key] = rec;
    addTexture(scene, key, surface.canvas);
    return key;
  }

  function rigPart(scene, key, surface, role) {
    var rec = {
      key: key, canvas: surface.canvas, ctx: surface.ctx,
      width: surface.width, height: surface.height, dpr: surface.dpr || 1, role: role
    };
    textureCache[key] = rec;
    addTexture(scene, key, surface.canvas);
    return key;
  }

  function rigPartDimensions(sil) {
    var len = clamp(finiteNumber(sil && sil.len, 1), 0.5, 3);
    var tailScale = clamp(finiteNumber(sil && sil.tailScale, 1), 0.55, 2.5);
    var finScale = clamp(finiteNumber(sil && sil.finScale, 1), 0.5, 2.1);
    /* Rigs render at the gameplay width (the runtime scales legacy play
     * sprites to 96*len CSS px). DPR 3 provides the retina detail; tight part
     * boxes keep the complete 61-shark roster below the iOS budget. */
    return {
      len: len,
      bodyW: Math.round(clamp(112 * len, 88, 224)),
      bodyH: Math.round(clamp(92 * len, 74, 184)),
      tailW: Math.round(clamp(44 * len * Math.min(1.35, tailScale), 36, 104)),
      tailH: Math.round(clamp(56 * len * Math.min(1.55, tailScale), 46, 132)),
      pectW: Math.round(clamp(36 * len * Math.min(1.25, finScale), 30, 86)),
      pectH: Math.round(clamp(52 * len * Math.min(1.4, finScale), 40, 120)),
      jawW: Math.round(clamp(40 * len, 32, 82)),
      jawH: Math.round(clamp(32 * len, 26, 64))
    };
  }

  function drawStandaloneTail(ctx, w, h, sil, palette) {
    var cy = h * 0.5, upper = h * 0.39 * clamp(finiteNumber(sil.tailScale, 1), 0.55, 2.5);
    var lower = h * 0.26 * clamp(finiteNumber(sil.tailScale, 1), 0.55, 2.5);
    var tip = w * 0.92, lowTip = w * 0.78;
    ctx.beginPath();
    /* Contract: the peduncle attachment is the LEFT edge centre. */
    ctx.moveTo(0, cy);
    ctx.bezierCurveTo(w * 0.24, cy - upper * 0.2, w * 0.55, cy - upper * 0.8, tip, cy - upper);
    ctx.bezierCurveTo(w * 0.6, cy - upper * 0.42, w * 0.28, cy - upper * 0.08, 0, cy);
    ctx.bezierCurveTo(w * 0.24, cy + lower * 0.1, w * 0.5, cy + lower * 0.62, lowTip, cy + lower);
    ctx.bezierCurveTo(w * 0.55, cy + lower * 0.45, w * 0.24, cy + lower * 0.12, 0, cy);
    ctx.closePath();
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [
      [0, cssColor(blend(palette.base, palette.belly, 0.2))],
      [0.34, cssColor(palette.base)],
      [0.7, cssColor(blend(palette.accent, palette.base, 0.34))],
      [1, cssColor(blend(palette.belly, palette.accent, 0.42))]
    ]); ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1, w * 0.026), 0.92); ctx.stroke();
    safeSave(ctx); ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = cssColor(palette.belly, 0.42); ctx.shadowBlur = Math.max(3, w * 0.08);
    line(ctx, w * 0.08, cy - upper * 0.16, tip - w * 0.08, cy - upper * 0.86, palette.belly, Math.max(0.8, w * 0.014), 0.38);
    safeRestore(ctx);
    ctx.beginPath(); ctx.ellipse(w * 0.2, cy - upper * 0.22, w * 0.17, Math.max(1, h * 0.035), -0.16, 0, Math.PI * 2);
    setFill(ctx, 0xffffff, 0.09); ctx.fill();
  }

  function drawStandalonePectoral(ctx, w, h, palette) {
    /* Root is exactly the top-left pivot. The fin sweeps back/down from it. */
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(w * 0.18, h * 0.16, w * 0.36, h * 0.72, w * 0.2, h * 0.96);
    ctx.bezierCurveTo(w * 0.55, h * 0.82, w * 0.86, h * 0.34, w * 0.9, h * 0.18);
    ctx.bezierCurveTo(w * 0.58, h * 0.3, w * 0.28, h * 0.16, 0, 0);
    ctx.closePath();
    ctx.fillStyle = gradientForFin(ctx, 0, h, palette); ctx.fill();
    setStroke(ctx, blend(palette.belly, 0xffffff, 0.1), Math.max(1, w * 0.03), 0.54); ctx.stroke();
    line(ctx, w * 0.2, h * 0.88, w * 0.83, h * 0.22, palette.belly, Math.max(0.8, w * 0.014), 0.28);
    safeSave(ctx); ctx.globalCompositeOperation = 'multiply';
    ctx.shadowColor = '#02070d'; ctx.shadowBlur = Math.max(2, w * 0.12);
    dot(ctx, w * 0.08, h * 0.08, Math.max(1, w * 0.08), 0x02070d, 0.24);
    safeRestore(ctx);
  }

  function drawStandaloneJaw(ctx, w, h, palette, tier) {
    var teeth = Math.min(10, 3 + Math.floor(tier));
    var x0 = 0, y0 = h * 0.32, x1 = w * 0.94, y1 = h * 0.07, depth = h * 0.68;
    jawPath(ctx, x0, y0, x1, y1, depth);
    ctx.fillStyle = linearGradient(ctx, 0, y0, 0, y1 + depth, [
      [0, cssColor(palette.accent)],
      [0.5, cssColor(blend(palette.base, palette.belly, 0.25))],
      [1, cssColor(palette.belly)]
    ]); ctx.fill();
    setStroke(ctx, palette.accent, Math.max(1, w * 0.026), 0.9); ctx.stroke();
    for (var i = 0; i < teeth; i++) {
      var t = (i + 0.5) / teeth, tx = w * (0.1 + t * 0.78), ty = y0 + (y1 - y0) * ((tx - x0) / (x1 - x0));
      poly(ctx, [[tx - w * 0.025, ty], [tx + w * 0.025, ty - h * 0.012], [tx, ty - depth * 0.62]], blend(palette.belly, 0xffffff, 0.14), 0.98);
    }
    safeSave(ctx); ctx.globalCompositeOperation = 'multiply';
    ctx.shadowColor = '#02070d'; ctx.shadowBlur = Math.max(2, w * 0.1);
    line(ctx, w * 0.06, y0 + depth * 0.2, w * 0.88, y1 + depth * 0.1, 0x02070d, Math.max(1, w * 0.022), 0.2);
    safeRestore(ctx);
  }

  function bakeSharkRig(scene, sharkDef) {
    var def = sharkDef || {}, sil = def.sil || {}, id = String(def.id || 'shark');
    if (rigCache[id]) {
      var cached = rigCache[id];
      addTexture(scene, cached.body, textureCache[cached.body] && textureCache[cached.body].canvas);
      addTexture(scene, cached.tail, textureCache[cached.tail] && textureCache[cached.tail].canvas);
      addTexture(scene, cached.pect, textureCache[cached.pect] && textureCache[cached.pect].canvas);
      if (cached.jaw) addTexture(scene, cached.jaw, textureCache[cached.jaw] && textureCache[cached.jaw].canvas);
      return cached;
    }
    var d = rigPartDimensions(sil), palette = paletteOf(def), tier = clamp(finiteNumber(def.tier, 1), 1, 12);
    var bodyKey = 'rf_shark_' + id + '_rig_body';
    var tailKey = 'rf_shark_' + id + '_rig_tail';
    var pectKey = 'rf_shark_' + id + '_rig_pect';
    var jawKey = tier >= 5 ? 'rf_shark_' + id + '_rig_jaw' : null;
    var bodySurface = makeSurface(d.bodyW, d.bodyH), bodyG = sharkGeom(d.bodyW, d.bodyH, sil, false, tier, def.act, id);
    drawShark(bodySurface.ctx, bodyG, palette, sil, { includeTail: false, includePectoral: false, separateJaw: tier >= 5 });
    rigPart(scene, bodyKey, bodySurface, 'body');

    var tailSurface = makeSurface(d.tailW, d.tailH);
    drawStandaloneTail(tailSurface.ctx, d.tailW, d.tailH, sil, palette);
    rigPart(scene, tailKey, tailSurface, 'tail');

    var pectSurface = makeSurface(d.pectW, d.pectH);
    drawStandalonePectoral(pectSurface.ctx, d.pectW, d.pectH, palette);
    rigPart(scene, pectKey, pectSurface, 'pect');

    if (jawKey) {
      var jawSurface = makeSurface(d.jawW, d.jawH);
      drawStandaloneJaw(jawSurface.ctx, d.jawW, d.jawH, palette, tier);
      rigPart(scene, jawKey, jawSurface, 'jaw');
    }

    var result = {
      body: bodyKey,
      tail: tailKey,
      pect: pectKey,
      jaw: jawKey,
      pivots: {
        tail: { x: bodyG.peduncleX, y: bodyG.cy },
        pect: { x: bodyG.peduncleX + bodyG.bodyLen * 0.3, y: bodyG.cy + bodyG.bh * 0.25 },
        jaw: jawKey ? { x: bodyG.peduncleX + bodyG.bodyLen * 0.69, y: bodyG.cy + bodyG.bh * 0.55 } : null
      },
      size: { w: d.bodyW, h: d.bodyH }
    };
    rigCache[id] = result;
    return result;
  }

  function creatureSurface(kind) {
    if (kind === 'mine' || kind === 'puffer') return makeSurface(86, 86);
    if (kind === 'jelly') return makeSurface(78, 96);
    if (kind === 'squid_big' || kind === 'calf' || kind === 'grazer') return makeSurface(150, 100);
    return makeSurface(122, 78);
  }

  function creatureRay(ctx, w, h) {
    ctx.beginPath(); ctx.moveTo(w * 0.05, h * 0.56); ctx.bezierCurveTo(w * 0.25, h * 0.05, w * 0.65, h * 0.08, w * 0.88, h * 0.5); ctx.bezierCurveTo(w * 0.64, h * 0.45, w * 0.48, h * 0.68, w * 0.35, h * 0.94); ctx.bezierCurveTo(w * 0.26, h * 0.7, w * 0.15, h * 0.6, w * 0.05, h * 0.56); ctx.closePath();
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [[0, '#6b64b5'], [0.55, '#756ca9'], [1, '#d0b8c9']]); ctx.fill();
    setStroke(ctx, 0x312d69, 2, 0.95); ctx.stroke(); dot(ctx, w * 0.79, h * 0.42, 2.5, 0x101426, 1); dot(ctx, w * 0.8, h * 0.4, 1, 0xffffff, 1);
    line(ctx, w * 0.28, h * 0.4, w * 0.58, h * 0.27, 0xd7d0ff, 1.2, 0.55);
  }

  function creatureTurtle(ctx, w, h) {
    ctx.beginPath(); ctx.ellipse(w * 0.49, h * 0.48, w * 0.33, h * 0.31, -0.06, 0, Math.PI * 2); ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [[0, '#3d826e'], [0.55, '#236052'], [1, '#a1c8a0']]); ctx.fill(); setStroke(ctx, 0x153f42, 2, 1); ctx.stroke();
    for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(w * (0.32 + (i % 3) * 0.16), h * (0.34 + Math.floor(i / 3) * 0.25), w * 0.1, 0, Math.PI * 2); setStroke(ctx, 0xb3d1a0, 1, 0.5); ctx.stroke(); }
    for (var j = 0; j < 4; j++) { var x = w * (0.2 + (j % 2) * 0.58), y = h * (0.28 + Math.floor(j / 2) * 0.4); ctx.beginPath(); ctx.ellipse(x, y, w * 0.1, h * 0.09, j % 2 ? 0.45 : -0.45, 0, Math.PI * 2); ctx.fillStyle = '#4e9c80'; ctx.fill(); }
    dot(ctx, w * 0.87, h * 0.48, w * 0.08, 0x4d9b80, 1); dot(ctx, w * 0.9, h * 0.45, 2, 0x101c28, 1); dot(ctx, w * 0.91, h * 0.43, 0.8, 0xffffff, 1);
  }

  function creatureSword(ctx, w, h) {
    ctx.beginPath(); ctx.moveTo(w * 0.02, h * 0.58); ctx.bezierCurveTo(w * 0.2, h * 0.3, w * 0.62, h * 0.28, w * 0.78, h * 0.53); ctx.bezierCurveTo(w * 0.58, h * 0.76, w * 0.2, h * 0.74, w * 0.02, h * 0.58); ctx.closePath(); ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [[0, '#5ec6d5'], [0.52, '#227694'], [1, '#c5e2d5']]); ctx.fill(); setStroke(ctx, 0x143e62, 2, 1); ctx.stroke();
    poly(ctx, [[w * 0.74, h * 0.52], [w * 1.02, h * 0.36], [w * 0.79, h * 0.62]], 0xc6dbe4, 0.95); setStroke(ctx, 0x27536b, 1.2, 0.8); ctx.stroke();
    fin(ctx, w * 0.43, h * 0.34, w * 0.51, h * 0.08, w * 0.57, h * 0.38, { accent: 0x16435d, belly: 0xc4e6d9 }, 1);
    dot(ctx, w * 0.7, h * 0.45, 2.3, 0x0b1c2c, 1); dot(ctx, w * 0.71, h * 0.43, 0.8, 0xffffff, 1);
  }

  function creatureSquid(ctx, w, h, big) {
    var cx = w * 0.53, cy = h * 0.35, rw = w * (big ? 0.28 : 0.22), rh = h * (big ? 0.28 : 0.23);
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, Math.PI * 2); ctx.lineTo(cx + rw * 0.76, cy + rh * 0.9); ctx.lineTo(cx, cy + rh * 0.55); ctx.lineTo(cx - rw * 0.76, cy + rh * 0.9); ctx.closePath(); ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [[0, '#e49ac8'], [0.65, '#9861a7'], [1, '#523f8c']]); ctx.fill(); setStroke(ctx, 0x3a245e, 2, 1); ctx.stroke();
    for (var i = 0; i < (big ? 9 : 6); i++) { var x = w * (0.19 + i * (big ? 0.08 : 0.12)); ctx.beginPath(); ctx.moveTo(x, h * 0.53); ctx.bezierCurveTo(x - w * 0.04, h * 0.74, x + w * 0.06, h * 0.85, x + w * 0.025, h * 0.97); setStroke(ctx, 0xd49ad2, Math.max(1.2, w * 0.012), 0.85); ctx.stroke(); }
    dot(ctx, cx - rw * 0.38, cy + rh * 0.03, rw * 0.12, 0x201630, 1); dot(ctx, cx + rw * 0.38, cy + rh * 0.03, rw * 0.12, 0x201630, 1); dot(ctx, cx - rw * 0.34, cy, rw * 0.04, 0xffffff, 1); dot(ctx, cx + rw * 0.42, cy, rw * 0.04, 0xffffff, 1);
  }

  function creatureGrazer(ctx, w, h, calf) {
    var body = calf ? 0x9e6f66 : 0x537b76, belly = calf ? 0xe6b6a0 : 0xb3d2bb;
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, w * 0.38, h * 0.25, 0, 0, Math.PI * 2); ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [[0, cssColor(body)], [0.7, cssColor(blend(body, belly, 0.42))], [1, cssColor(belly)]]); ctx.fill(); setStroke(ctx, 0x233c46, 2, 1); ctx.stroke();
    poly(ctx, [[w * 0.78, h * 0.4], [w * 0.99, h * 0.48], [w * 0.78, h * 0.59]], belly, 1); dot(ctx, w * 0.82, h * 0.43, 2.8, 0x101b2b, 1); dot(ctx, w * 0.83, h * 0.41, 1, 0xffffff, 1);
    fin(ctx, w * 0.36, h * 0.3, w * 0.38, h * 0.04, w * 0.5, h * 0.3, { accent: 0x294f5d, belly: belly }, 1);
    line(ctx, w * 0.25, h * 0.53, w * 0.47, h * 0.63, belly, 1.4, 0.55);
  }

  function creatureMine(ctx, w, h) {
    var cx = w * 0.5, cy = h * 0.5, r = w * 0.22;
    for (var i = 0; i < 16; i++) {
      var a = i * Math.PI * 2 / 16, x = cx + Math.cos(a) * w * 0.45, y = cy + Math.sin(a) * h * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.08) * r, cy + Math.sin(a - 0.08) * r);
      ctx.lineTo(x, y);
      ctx.lineTo(cx + Math.cos(a + 0.08) * r, cy + Math.sin(a + 0.08) * r);
      ctx.closePath();
      ctx.fillStyle = linearGradient(ctx, 0, cy - h * 0.5, 0, cy + h * 0.5,
        [[0, '#e0bd62'], [0.48, '#aa653b'], [1, '#53313a']]); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = radialGradient(ctx, cx - r * 0.35, cy - r * 0.35, 0, cx, cy, r, [[0, '#e4c56c'], [0.54, '#9a5b39'], [1, '#402839']]); ctx.fill(); setStroke(ctx, 0x241b2c, 2, 1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy - r * 0.32, r * 0.42, r * 0.16, -0.35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,232,153,.22)'; ctx.fill();
    for (var j = 0; j < 6; j++) dot(ctx, cx + Math.cos(j) * r * 0.48, cy + Math.sin(j) * r * 0.48, 2, 0xf9d972, 0.82);
  }

  function creatureJelly(ctx, w, h) {
    var c = 0x9e8de0;
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.4, w * 0.28, Math.PI, 0); ctx.quadraticCurveTo(w * 0.78, h * 0.55, w * 0.22, h * 0.55); ctx.closePath(); ctx.fillStyle = radialGradient(ctx, w * 0.45, h * 0.27, 0, w * 0.5, h * 0.48, w * 0.34, [[0, 'rgba(238,216,255,.85)'], [0.6, cssColor(c, 0.6)], [1, 'rgba(76,49,151,.7)']]); ctx.fill(); setStroke(ctx, 0xc9b7ff, 2, 0.9); ctx.stroke();
    for (var i = 0; i < 5; i++) {
      var tx = w * (0.25 + i * 0.125);
      ctx.beginPath(); ctx.moveTo(tx, h * 0.51);
      ctx.bezierCurveTo(w * (0.18 + i * 0.14), h * 0.72, w * (0.32 + i * 0.12), h * 0.77, w * (0.26 + i * 0.13), h * 0.96);
      ctx.shadowColor = 'rgba(192,156,255,.75)'; ctx.shadowBlur = Math.max(3, w * 0.04);
      ctx.strokeStyle = linearGradient(ctx, 0, h * 0.5, 0, h, [[0, 'rgba(239,224,255,.92)'], [0.55, 'rgba(192,156,255,.82)'], [1, 'rgba(107,73,193,.76)']]);
      ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.37, w * 0.13, h * 0.1, -0.12, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fill();
    dot(ctx, w * 0.42, h * 0.35, 2.4, 0xffffff, 0.78); dot(ctx, w * 0.58, h * 0.35, 2.4, 0xffffff, 0.78);
  }

  function creaturePuffer(ctx, w, h) {
    var cx = w * 0.5, cy = h * 0.51, r = w * 0.27;
    for (var i = 0; i < 24; i++) {
      var a = i * Math.PI * 2 / 24, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a - 0.06) * r * 0.8, cy + Math.sin(a - 0.06) * r * 0.8);
      ctx.lineTo(cx + Math.cos(a) * w * 0.45, cy + Math.sin(a) * h * 0.45);
      ctx.lineTo(cx + Math.cos(a + 0.06) * r * 0.8, cy + Math.sin(a + 0.06) * r * 0.8); ctx.closePath();
      ctx.fillStyle = linearGradient(ctx, 0, cy - h * 0.5, 0, cy + h * 0.5,
        [[0, '#ffe58a'], [0.5, '#dc9345'], [1, '#874052']]); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = radialGradient(ctx, cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r, [[0, '#ffe08b'], [0.65, '#e49342'], [1, '#9b4f4c']]); ctx.fill(); setStroke(ctx, 0x4a2a3b, 2, 1); ctx.stroke();
    dot(ctx, cx - r * 0.35, cy - r * 0.08, 3, 0x182034, 1); dot(ctx, cx + r * 0.35, cy - r * 0.08, 3, 0x182034, 1); line(ctx, cx - r * 0.18, cy + r * 0.24, cx + r * 0.18, cy + r * 0.24, 0x632e3e, 1.6, 1);
  }

  function creatureFinish(ctx, w, h, kind) {
    var rim = kind === 'jelly' ? 0xe6d8ff : kind === 'mine' ? 0xffd98a : 0xd8fbff;
    safeSave(ctx);
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = cssColor(rim, 0.65); ctx.shadowBlur = Math.max(3, w * 0.035);
    ctx.beginPath();
    if (kind === 'jelly') {
      ctx.arc(w * 0.5, h * 0.4, w * 0.27, Math.PI, Math.PI * 1.92);
    } else if (kind === 'mine' || kind === 'puffer') {
      ctx.arc(w * 0.5, h * 0.5, w * 0.25, Math.PI * 1.12, Math.PI * 1.86);
    } else {
      ctx.moveTo(w * 0.13, h * 0.42);
      ctx.bezierCurveTo(w * 0.32, h * 0.12, w * 0.62, h * 0.12, w * 0.82, h * 0.34);
    }
    setStroke(ctx, rim, Math.max(1, w * 0.012), 0.64); ctx.stroke();
    ctx.shadowBlur = 0;
    for (var i = 0; i < 10; i++) dot(ctx, w * (0.2 + ((i * 29) % 60) / 100), h * (0.28 + ((i * 43) % 36) / 100), Math.max(0.35, w * 0.006), rim, 0.1);
    safeRestore(ctx);
  }

  function bakeCreature(scene, creatureDef) {
    var def = creatureDef || {};
    var sprite = String(def.sprite || '');
    if (sprite.indexOf('proc_') !== 0) return sprite;
    var key = 'rf_' + sprite;
    if (textureCache[key]) { addTexture(scene, key, textureCache[key].canvas); return key; }
    var kind = sprite.slice(5), surface = creatureSurface(kind), ctx = surface.ctx, w = surface.width, h = surface.height;
    if (kind === 'ray') creatureRay(ctx, w, h);
    else if (kind === 'turtle') creatureTurtle(ctx, w, h);
    else if (kind === 'sword') creatureSword(ctx, w, h);
    else if (kind === 'squid') creatureSquid(ctx, w, h, false);
    else if (kind === 'squid_big') creatureSquid(ctx, w, h, true);
    else if (kind === 'grazer') creatureGrazer(ctx, w, h, false);
    else if (kind === 'calf') creatureGrazer(ctx, w, h, true);
    else if (kind === 'mine') creatureMine(ctx, w, h);
    else if (kind === 'jelly') creatureJelly(ctx, w, h);
    else if (kind === 'puffer') creaturePuffer(ctx, w, h);
    else creatureGrazer(ctx, w, h, false);
    creatureFinish(ctx, w, h, kind);
    var rec = { key: key, canvas: surface.canvas, ctx: ctx, width: w, height: h, dpr: surface.dpr || 1 };
    textureCache[key] = rec;
    addTexture(scene, key, surface.canvas);
    return key;
  }

  function testShark(id, fallbackHead) {
    var rows = root.RFD && root.RFD.SHARK_BY_ID;
    if (rows && rows[id]) return rows[id];
    return { id: id, sil: { head: fallbackHead, len: 1.4, girth: 0.42, finScale: 1, tailScale: 1, palette: { base: 0x36758a, belly: 0xd5ebe0, accent: 0x164557, glow: 0x7ce6ff }, pattern: 'plates', fx: 'dorsalCharge' } };
  }

  function distinctCanvasColors(canvas) {
    if (!canvas || !canvas.getContext) return 0;
    var ctx = canvas.getContext('2d');
    if (!ctx || !ctx.getImageData) return 0;
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, seen = {}, count = 0;
    for (var i = 0; i < data.length; i += 4) {
      var key = data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + data[i + 3];
      if (!seen[key]) { seen[key] = true; count++; }
    }
    return count;
  }

  function primaryBodyAspect(g) {
    /* Headless memory surfaces do not rasterize alpha. The permitted body
     * measurement therefore uses the opaque bounding box of the primary
     * body path: peduncle-to-nose width divided by the widest opaque row at
     * maxX (2 * bh). Tail lobes and fins are intentionally excluded because
     * their vertical span is the reason a full bake box can look less wide. */
    if (!g || !isFinite(g.bodyNoseX) || !isFinite(g.peduncleX) || !isFinite(g.bh) || g.bh <= 0) return 0;
    return (g.bodyNoseX - g.peduncleX) / (g.bh * 2);
  }

  function cachedCanvasBytes() {
    var total = 0, seen = [];
    for (var key in textureCache) if (textureCache[key] && textureCache[key].canvas) {
      var canvas = textureCache[key].canvas, already = false;
      for (var i = 0; i < seen.length; i++) if (seen[i] === canvas) { already = true; break; }
      if (!already) { seen.push(canvas); total += canvasBytes(canvas); }
    }
    return total;
  }

  function __selftest() {
    var notes = [], pass = true, oldCache = textureCache, oldRigCache = rigCache;
    textureCache = {};
    rigCache = {};
    var scene = { textures: { map: {}, addCanvas: function (key, canvas) { this.map[key] = canvas; }, exists: function (key) { return !!this.map[key]; } } };
    var oldGame = root.RF && root.RF.Game;
    /* Exercise the title-owned density path. GGKit's canvas helper is not
     * consulted, even when a stale helper exists on the test global. */
    root.RF.Game = { dpr: 3 };
    try {
      var reps = [testShark('reef', 'point'), testShark('hammerhead', 'hammer'), testShark('snapjaw', 'croc'), testShark('ironfin', 'mech'), testShark('leviathanrex', 'kaiju')];
      for (var r = 0; r < reps.length; r++) {
        var rig = bakeSharkRig(scene, reps[r]);
        var partNames = ['body', 'tail', 'pect'];
        if (rig.jaw) partNames.push('jaw');
        for (var part = 0; part < partNames.length; part++) {
          var partKey = rig[partNames[part]], partRec = textureCache[partKey];
          if (!partKey || !partRec || !partRec.canvas || !partRec.canvas.width || !partRec.canvas.height) {
            pass = false; notes.push('empty ' + partNames[part] + ' rig part: ' + reps[r].id);
          }
        }
        if (!rig.jaw) notes.push(reps[r].id + ' jaw: null below tier 5');
        var bodyRec = textureCache[rig.body], bodyW = rig.size.w, bodyH = rig.size.h;
        var pivots = rig.pivots;
        ['tail', 'pect', 'jaw'].forEach(function (name) {
          if (!pivots[name]) return;
          if (pivots[name].x < 0 || pivots[name].x > bodyW || pivots[name].y < 0 || pivots[name].y > bodyH) {
            pass = false; notes.push('pivot outside body: ' + reps[r].id + '/' + name);
          }
        });
        if (!bodyRec || !bodyRec.canvas) { pass = false; notes.push('missing rig body record: ' + reps[r].id); }
        else notes.push(reps[r].id + ' rig parts/pivots: PASS');
      }
      var rigBytes = cachedCanvasBytes(), rigLimit = 80 * 1024 * 1024;
      if (rigBytes >= rigLimit) { pass = false; notes.push('rig canvas bytes at DPR 3: ' + rigBytes + ' >= 80MB'); }
      else notes.push('rig canvas bytes at DPR 3: ' + rigBytes + ' (' + (rigBytes / 1048576).toFixed(2) + 'MB) < 80MB');

      /* Legacy thumb/menu gates are intentionally measured in a fresh cache:
       * the runtime only keeps thumbnails or play rigs hot, never both full
       * rosters at once. Keep their historical dimensions unchanged. */
      textureCache = {};
      rigCache = {};
      root.RF.Game = { dpr: 2 };
      for (var i = 0; i < reps.length; i++) {
        var key = bakeShark(scene, reps[i], 'play');
        var canvas = scene.textures.map[key];
        if (!canvas || !canvas.width || !canvas.height) { pass = false; notes.push('empty shark texture: ' + key); }
        var playRec = textureCache[key], aspect = primaryBodyAspect(playRec && playRec.geometry);
        if (aspect < 2.0) { pass = false; notes.push('body aspect below 2.0: ' + reps[i].id + ' = ' + aspect.toFixed(2)); }
        else notes.push(reps[i].id + ' body aspect: ' + aspect.toFixed(2));
        var menuKey = bakeShark(scene, reps[i], 'menu'), menuRec = textureCache[menuKey];
        if (!menuRec || menuRec.width < playRec.width * 1.9 || primaryBodyAspect(menuRec.geometry) !== aspect) {
          pass = false;
          notes.push('menu geometry/bake mismatch: ' + reps[i].id);
        }
      }
      var specialHeads = [
        ['hammerhead', 'hammer'], ['whaleshark', 'whale'], ['gravewater', 'skull'],
        ['bonecrown', 'skull'], ['banshee', 'skull']
      ];
      for (var s = 0; s < specialHeads.length; s++) {
        var specialKey = bakeShark(scene, testShark(specialHeads[s][0], specialHeads[s][1]), 'play');
        var specialCanvas = scene.textures.map[specialKey], components = opaqueComponentCount(specialCanvas);
        if (components !== 1) {
          pass = false;
          notes.push(specialHeads[s][0] + ' opaque silhouette components: ' + components);
        } else notes.push(specialHeads[s][0] + ' opaque silhouette components: 1');
      }
      var sharks = root.RFD && root.RFD.SHARKS || reps, bakedRows = 0;
      for (var row = 0; row < sharks.length; row++) for (var variant = 0; variant < 2; variant++) {
        var sweepKey = bakeShark(scene, sharks[row], variant ? 'menu' : 'play');
        var sweepCanvas = scene.textures.map[sweepKey];
        if (!sweepCanvas || !sweepCanvas.width || !sweepCanvas.height) {
          pass = false;
          notes.push('empty sweep texture: ' + sweepKey);
        }
        bakedRows++;
      }
      notes.push('shark sweep: ' + sharks.length + ' rows x 2 variants = ' + bakedRows + ' textures');
      var levKey = 'rf_shark_leviathanrex_play';
      var colors = distinctCanvasColors(scene.textures.map[levKey]);
      if (colors <= 64) { pass = false; notes.push('leviathanrex colour sample too flat: ' + colors); }
      else notes.push('leviathanrex sampled colours: ' + colors);
      var defs = root.RFD ? (root.RFD.CREATURES || []).concat(root.RFD.HAZARDS || []) : [];
      if (!defs.length) defs = [
        { sprite: 'proc_ray' }, { sprite: 'proc_turtle' }, { sprite: 'proc_sword' }, { sprite: 'proc_squid' },
        { sprite: 'proc_squid_big' }, { sprite: 'proc_grazer' }, { sprite: 'proc_calf' }, { sprite: 'proc_mine' },
        { sprite: 'proc_jelly' }, { sprite: 'proc_puffer' }
      ];
      var procCount = 0;
      for (var j = 0; j < defs.length; j++) if (String(defs[j].sprite || '').indexOf('proc_') === 0) {
        var ckey = bakeCreature(scene, defs[j]);
        if (!scene.textures.map[ckey] || !scene.textures.map[ckey].width) { pass = false; notes.push('empty creature texture: ' + ckey); }
        procCount++;
      }
      notes.push('procedural creature textures: ' + procCount);
      notes.push('DPR: ' + (textureCache['rf_shark_reef_play'] && textureCache['rf_shark_reef_play'].dpr || 0));
    } catch (err) {
      pass = false;
      notes.push('exception: ' + (err && err.message ? err.message : String(err)));
    }
    textureCache = oldCache;
    rigCache = oldRigCache;
    if (oldGame) root.RF.Game = oldGame; else delete root.RF.Game;
    return { pass: pass, notes: notes };
  }

  RF.Art = {
    bakeShark: bakeShark,
    bakeSharkRig: bakeSharkRig,
    bakeCreature: bakeCreature,
    paletteOf: paletteOf,
    __selftest: __selftest
  };
})(typeof window !== 'undefined' ? window : globalThis);
