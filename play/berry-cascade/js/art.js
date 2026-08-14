/* Berry Cascade - texture bakery.
 * Every piece of static chrome is drawn ONCE into a canvas texture here.
 * Phaser Graphics replays its whole command list every frame, so no large
 * static Graphics object is ever left in the display list; the board frame,
 * cell field, HUD cards, rings and glyphs are all baked images.
 */
var BCArt = (function () {
  'use strict';
  var A = {};

  var TILE = 96;          /* bake size for a board piece; drawn scaled down */
  A.TILE = TILE;

  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  A.hex = hex;

  function mixc(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
  }
  A.mix = mixc;
  A.lighten = function (c, t) { return mixc(c, 0xFFFFFF, t); };
  A.darken = function (c, t) { return mixc(c, 0x000000, t); };

  /* relative luminance, used to choose an ink or highlight glyph */
  function lum(c) {
    var r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    function f(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  A.lum = lum;

  /* Creates (or replaces) a canvas texture and hands the 2d context to draw. */
  function tex(scene, key, w, h, draw) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var ct = scene.textures.createCanvas(key, w, h);
    if (!ct) return null;
    var ctx = ct.getContext();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    ct.refresh();
    return ct;
  }
  A.tex = tex;

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  A.roundRect = rr;

  function poly(ctx, cx, cy, r, sides, rot, squash) {
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = rot + i * Math.PI * 2 / sides;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * (squash || 1);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* ---------------------------------------------------- piece silhouettes */
  function shapePath(ctx, shape, cx, cy, r) {
    if (shape === 'rsquare') { rr(ctx, cx - r * 0.94, cy - r * 0.94, r * 1.88, r * 1.88, r * 0.42); return; }
    if (shape === 'hex') { poly(ctx, cx, cy, r * 1.02, 6, -Math.PI / 2, 1); return; }
    if (shape === 'diamond') { poly(ctx, cx, cy, r * 1.12, 4, -Math.PI / 2, 1); return; }
    if (shape === 'shield') { poly(ctx, cx, cy, r * 1.06, 5, Math.PI / 2, 1); return; }
    if (shape === 'octagon') { poly(ctx, cx, cy, r * 1.04, 8, Math.PI / 8, 1); return; }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  }

  /* ------------------------------------------------------------- glyphs */
  function glyphPath(ctx, kind, cx, cy, s) {
    var i, a, x, y, r1, r2, pts;
    if (kind === 'sun') {
      pts = 8;
      ctx.beginPath();
      for (i = 0; i < pts * 2; i++) {
        a = -Math.PI / 2 + i * Math.PI / pts;
        var rr2 = (i % 2 === 0) ? s : s * 0.42;
        x = cx + Math.cos(a) * rr2; y = cy + Math.sin(a) * rr2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      return;
    }
    if (kind === 'star') {
      pts = 6;
      ctx.beginPath();
      for (i = 0; i < pts * 2; i++) {
        a = -Math.PI / 2 + i * Math.PI / pts;
        r1 = (i % 2 === 0) ? s : s * 0.46;
        x = cx + Math.cos(a) * r1; y = cy + Math.sin(a) * r1;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      return;
    }
    if (kind === 'leaf') {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.85, cy + s * 0.60);
      ctx.quadraticCurveTo(cx - s * 0.75, cy - s * 0.95, cx + s * 0.85, cy - s * 0.62);
      ctx.quadraticCurveTo(cx + s * 0.20, cy + s * 0.95, cx - s * 0.85, cy + s * 0.60);
      ctx.closePath();
      return;
    }
    if (kind === 'drop') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.05);
      ctx.quadraticCurveTo(cx + s * 0.95, cy + s * 0.10, cx + s * 0.52, cy + s * 0.62);
      ctx.quadraticCurveTo(cx, cy + s * 1.15, cx - s * 0.52, cy + s * 0.62);
      ctx.quadraticCurveTo(cx - s * 0.95, cy + s * 0.10, cx, cy - s * 1.05);
      ctx.closePath();
      return;
    }
    if (kind === 'flame') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.05);
      ctx.quadraticCurveTo(cx + s * 0.85, cy - s * 0.15, cx + s * 0.55, cy + s * 0.45);
      ctx.quadraticCurveTo(cx + s * 0.30, cy + s * 1.00, cx, cy + s * 0.95);
      ctx.quadraticCurveTo(cx - s * 0.30, cy + s * 1.00, cx - s * 0.55, cy + s * 0.45);
      ctx.quadraticCurveTo(cx - s * 0.85, cy - s * 0.15, cx, cy - s * 1.05);
      ctx.closePath();
      return;
    }
    /* 'seed' - teardrop pip with a stem notch */
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.10, s * 0.62, s * 0.88, 0, 0, Math.PI * 2);
    ctx.closePath();
  }

  /* --------------------------------------------------------- berry tiles */
  function drawBerry(ctx, S, fam, sp) {
    var cx = S / 2, cy = S / 2;
    var special = sp > 0;
    var r = S * (special ? 0.455 : 0.425);
    var face = special ? A.lighten(fam.face, 0.16) : fam.face;
    var edge = fam.edge;

    /* contact shadow */
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#0A1020';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.60, r * 0.86, r * 0.34, 0, 0, Math.PI * 2);
    ctx.filter = 'blur(3px)';
    ctx.fill();
    ctx.restore();

    /* body with a vertical fake-lambert gradient */
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, hex(A.lighten(face, 0.26)));
    g.addColorStop(0.55, hex(face));
    g.addColorStop(1, hex(A.darken(face, 0.30)));
    shapePath(ctx, fam.shape, cx, cy, r);
    ctx.fillStyle = g; ctx.fill();

    /* edge */
    ctx.lineWidth = S * (special ? 0.055 : 0.040);
    ctx.strokeStyle = hex(special ? A.lighten(edge, 0.35) : edge);
    ctx.stroke();

    /* specular */
    ctx.save();
    shapePath(ctx, fam.shape, cx, cy, r);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.34, cy - r * 0.44, r * 0.36, r * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* special markings, inside the silhouette */
    if (sp === 1 || sp === 2) {
      ctx.save();
      shapePath(ctx, fam.shape, cx, cy, r * 0.96);
      ctx.clip();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#F7FBFF';
      var band = S * 0.075, gap = S * 0.13;
      for (var k = -2; k <= 2; k++) {
        if (sp === 1) ctx.fillRect(0, cy + k * gap - band / 2, S, band);
        else ctx.fillRect(cx + k * gap - band / 2, 0, band, S);
      }
      ctx.restore();
      /* direction caps so the line reads even in grayscale */
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#182238';
      ctx.lineWidth = S * 0.035;
      ctx.beginPath();
      if (sp === 1) {
        ctx.moveTo(cx - r * 0.30, cy - r * 0.26); ctx.lineTo(cx - r * 0.02, cy); ctx.lineTo(cx - r * 0.30, cy + r * 0.26);
        ctx.moveTo(cx + r * 0.06, cy - r * 0.26); ctx.lineTo(cx + r * 0.34, cy); ctx.lineTo(cx + r * 0.06, cy + r * 0.26);
      } else {
        ctx.moveTo(cx - r * 0.26, cy - r * 0.30); ctx.lineTo(cx, cy - r * 0.02); ctx.lineTo(cx + r * 0.26, cy - r * 0.30);
        ctx.moveTo(cx - r * 0.26, cy + r * 0.06); ctx.lineTo(cx, cy + r * 0.34); ctx.lineTo(cx + r * 0.26, cy + r * 0.06);
      }
      ctx.stroke();
      ctx.restore();
    } else if (sp === 3) {
      /* burst gourd: ribbed body plus a starburst mark */
      ctx.save();
      shapePath(ctx, fam.shape, cx, cy, r * 0.96);
      ctx.clip();
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = '#0A1020';
      ctx.lineWidth = S * 0.03;
      for (var q = -2; q <= 2; q++) {
        ctx.beginPath();
        ctx.moveTo(cx + q * S * 0.13, cy - r);
        ctx.quadraticCurveTo(cx + q * S * 0.17, cy, cx + q * S * 0.13, cy + r);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = '#F7FBFF';
      glyphPath(ctx, 'sun', cx, cy, r * 0.60);
      ctx.fill();
      ctx.strokeStyle = '#182238'; ctx.lineWidth = S * 0.025; ctx.stroke();
      ctx.restore();
    }

    /* family glyph, skipped for burst which already carries the starburst */
    if (sp !== 3) {
      var ink = lum(face) > 0.42 ? '#182238' : '#F7FBFF';
      var halo = lum(face) > 0.42 ? 'rgba(247,251,255,0.55)' : 'rgba(24,34,56,0.55)';
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.lineWidth = S * 0.045; ctx.strokeStyle = halo; ctx.lineJoin = 'round';
      glyphPath(ctx, fam.glyph, cx, cy, r * (sp ? 0.34 : 0.44));
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.restore();
    }

    /* powered pieces get an outer enamel ring so they read at 40px */
    if (special) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#F7FBFF';
      ctx.lineWidth = S * 0.028;
      shapePath(ctx, fam.shape, cx, cy, r * 1.06);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPrism(ctx, S) {
    var cx = S / 2, cy = S / 2, r = S * 0.46, i;
    ctx.save();
    ctx.globalAlpha = 0.42; ctx.fillStyle = '#0A1020';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.58, r * 0.84, r * 0.32, 0, 0, Math.PI * 2);
    ctx.filter = 'blur(3px)'; ctx.fill();
    ctx.restore();

    /* faceted disc: 6 wedges in the family hues, hand-tessellated (no arc sweep) */
    var hues = [0xF25C68, 0xF7C948, 0x5BCB77, 0x38A8DE, 0x9A7CF3, 0xF29A4A];
    for (i = 0; i < 6; i++) {
      var a0 = -Math.PI / 2 + i * Math.PI / 3, a1 = a0 + Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      ctx.lineTo(cx + Math.cos((a0 + a1) / 2) * r * 1.04, cy + Math.sin((a0 + a1) / 2) * r * 1.04);
      ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      ctx.closePath();
      ctx.fillStyle = hex(A.lighten(hues[i], 0.10));
      ctx.fill();
    }
    /* glass dome */
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.05, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.20)');
    g.addColorStop(1, 'rgba(24,34,56,0.30)');
    poly(ctx, cx, cy, r, 12, -Math.PI / 2, 1);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = S * 0.05; ctx.strokeStyle = '#F7FBFF'; ctx.stroke();
    /* centre gem */
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#F7FBFF'; ctx.fill();
    ctx.lineWidth = S * 0.03; ctx.strokeStyle = '#182238'; ctx.stroke();
  }

  function drawAcorn(ctx, S) {
    var cx = S / 2, cy = S / 2, r = S * 0.40;
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#0A1020';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.80, r * 0.80, r * 0.28, 0, 0, Math.PI * 2);
    ctx.filter = 'blur(3px)'; ctx.fill();
    ctx.restore();
    /* nut */
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, '#C99461'); g.addColorStop(1, '#7A4A22');
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.78, cy - r * 0.12);
    ctx.quadraticCurveTo(cx - r * 0.78, cy + r * 0.98, cx, cy + r * 0.98);
    ctx.quadraticCurveTo(cx + r * 0.78, cy + r * 0.98, cx + r * 0.78, cy - r * 0.12);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = S * 0.038; ctx.strokeStyle = '#4A2A10'; ctx.stroke();
    /* cap with hatch so it survives grayscale */
    ctx.beginPath();
    rr(ctx, cx - r * 0.88, cy - r * 0.72, r * 1.76, r * 0.66, r * 0.24);
    ctx.fillStyle = '#5E3A1C'; ctx.fill();
    ctx.strokeStyle = '#33200E'; ctx.lineWidth = S * 0.03; ctx.stroke();
    ctx.save();
    ctx.beginPath(); rr(ctx, cx - r * 0.88, cy - r * 0.72, r * 1.76, r * 0.66, r * 0.24); ctx.clip();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#C99461'; ctx.lineWidth = S * 0.022;
    for (var k = -4; k <= 4; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + k * S * 0.075, cy - r * 0.75);
      ctx.lineTo(cx + k * S * 0.075, cy - r * 0.04);
      ctx.stroke();
    }
    ctx.restore();
    /* stalk */
    ctx.beginPath();
    rr(ctx, cx - r * 0.10, cy - r * 1.06, r * 0.20, r * 0.36, r * 0.08);
    ctx.fillStyle = '#4A2A10'; ctx.fill();
    /* down arrow: acorns are delivered by reaching the floor */
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = S * 0.045; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.30, cy + r * 0.18); ctx.lineTo(cx, cy + r * 0.52); ctx.lineTo(cx + r * 0.30, cy + r * 0.18);
    ctx.stroke();
    ctx.restore();
  }

  function drawSyrup(ctx, S, layers) {
    var pad = S * 0.045;
    ctx.save();
    rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.20);
    var g = ctx.createLinearGradient(0, 0, 0, S);
    /* Syrup is an overlay above the berry. Keep the centre translucent so
     * the berry silhouette remains readable, while the border and pattern
     * carry the one-layer versus two-layer distinction. */
    g.addColorStop(0, layers > 1 ? 'rgba(138,76,18,0.30)' : 'rgba(201,123,46,0.20)');
    g.addColorStop(1, layers > 1 ? 'rgba(94,48,8,0.42)' : 'rgba(150,86,26,0.30)');
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    /* pattern coding, not colour alone: single layer = drips, double = lattice */
    ctx.globalAlpha = layers > 1 ? 0.86 : 0.72;
    ctx.strokeStyle = '#FFE3B0'; ctx.lineWidth = S * 0.035; ctx.lineCap = 'round';
    var i;
    if (layers > 1) {
      for (i = -2; i <= 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * S * 0.32, 0); ctx.lineTo(i * S * 0.32 + S, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * S * 0.32 + S, 0); ctx.lineTo(i * S * 0.32, S); ctx.stroke();
      }
    } else {
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        var x = S * (0.24 + i * 0.26);
        ctx.moveTo(x, S * 0.14);
        ctx.quadraticCurveTo(x + S * 0.05, S * 0.5, x, S * 0.80);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.20);
    ctx.lineWidth = layers > 1 ? S * 0.075 : S * 0.060;
    ctx.strokeStyle = layers > 1 ? '#FFD79A' : '#E8B26A';
    ctx.stroke();
    if (layers > 1) {
      rr(ctx, pad + S * 0.105, pad + S * 0.105, S - (pad + S * 0.105) * 2,
        S - (pad + S * 0.105) * 2, S * 0.13);
      ctx.lineWidth = S * 0.030;
      ctx.strokeStyle = '#FFE8C1';
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------- shared shapes */
  function drawFocus(ctx, S) {
    var pad = S * 0.04, w = S - pad * 2;
    ctx.lineJoin = 'round';
    ctx.lineWidth = S * 0.085;
    ctx.strokeStyle = 'rgba(24,34,56,0.85)';
    rr(ctx, pad, pad, w, w, S * 0.24); ctx.stroke();
    ctx.lineWidth = S * 0.055;
    ctx.strokeStyle = '#F7FBFF';
    rr(ctx, pad, pad, w, w, S * 0.24); ctx.stroke();
    /* corner ticks keep the ring visible over a full cascade */
    ctx.lineCap = 'round'; ctx.lineWidth = S * 0.075; ctx.strokeStyle = '#F7FBFF';
    var c = [[pad, pad, 1, 1], [S - pad, pad, -1, 1], [pad, S - pad, 1, -1], [S - pad, S - pad, -1, -1]];
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(c[i][0] + c[i][2] * S * 0.20, c[i][1]);
      ctx.lineTo(c[i][0], c[i][1]);
      ctx.lineTo(c[i][0], c[i][1] + c[i][3] * S * 0.20);
      ctx.stroke();
    }
  }

  function drawGhost(ctx, S, valid) {
    var pad = S * 0.10, w = S - pad * 2;
    ctx.save();
    rr(ctx, pad, pad, w, w, S * 0.22);
    ctx.fillStyle = valid ? 'rgba(247,251,255,0.20)' : 'rgba(242,92,104,0.18)';
    ctx.fill();
    ctx.lineWidth = S * 0.05;
    ctx.strokeStyle = valid ? '#F7FBFF' : '#F25C68';
    if (!valid) ctx.setLineDash([S * 0.14, S * 0.10]);
    ctx.stroke();
    if (!valid) {
      ctx.setLineDash([]);
      ctx.lineCap = 'round'; ctx.lineWidth = S * 0.075; ctx.strokeStyle = '#F25C68';
      ctx.beginPath();
      ctx.moveTo(S * 0.32, S * 0.32); ctx.lineTo(S * 0.68, S * 0.68);
      ctx.moveTo(S * 0.68, S * 0.32); ctx.lineTo(S * 0.32, S * 0.68);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawArrow(ctx, S) {
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#F7FBFF';
    ctx.strokeStyle = '#182238';
    ctx.lineWidth = S * 0.05; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(S * 0.34, 0);
    ctx.lineTo(S * 0.02, -S * 0.24);
    ctx.lineTo(S * 0.02, -S * 0.10);
    ctx.lineTo(-S * 0.34, -S * 0.10);
    ctx.lineTo(-S * 0.34, S * 0.10);
    ctx.lineTo(S * 0.02, S * 0.10);
    ctx.lineTo(S * 0.02, S * 0.24);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawStar(ctx, S, filled) {
    var cx = S / 2, cy = S / 2;
    ctx.lineJoin = 'round';
    glyphPath(ctx, 'star', cx, cy, S * 0.42);
    if (filled) {
      var g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#FFF0BE'); g.addColorStop(1, '#F2C74B');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#8A6A0F'; ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(93,114,148,0.28)'; ctx.fill();
      ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#5D7294'; ctx.stroke();
    }
  }

  function drawMedal(ctx, S, tier) {
    var cx = S / 2, cy = S * 0.56, r = S * 0.33;
    var ring = [0x5D7294, 0xC98A4B, 0xC9D4E4, 0xF2C74B][tier] || 0x5D7294;
    /* ribbon */
    ctx.fillStyle = '#2E4269';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.70, 0); ctx.lineTo(cx - r * 0.10, 0);
    ctx.lineTo(cx - r * 0.10, cy); ctx.lineTo(cx - r * 0.95, cy * 0.7); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.70, 0); ctx.lineTo(cx + r * 0.10, 0);
    ctx.lineTo(cx + r * 0.10, cy); ctx.lineTo(cx + r * 0.95, cy * 0.7); ctx.closePath(); ctx.fill();
    /* disc */
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, hex(A.lighten(ring, 0.35)));
    g.addColorStop(1, hex(A.darken(ring, 0.30)));
    poly(ctx, cx, cy, r, 12, -Math.PI / 2, 1);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = S * 0.055; ctx.strokeStyle = hex(A.darken(ring, 0.45)); ctx.stroke();
    /* tier pips: 1/2/3 notches read without colour */
    ctx.fillStyle = '#182238';
    var count = Math.max(1, tier);
    for (var i = 0; i < count; i++) {
      var a = -Math.PI / 2 + (i - (count - 1) / 2) * 0.6;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48, S * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    glyphPath(ctx, 'leaf', cx, cy + r * 0.10, r * 0.42);
    ctx.fillStyle = '#182238'; ctx.fill();
  }

  /* -------------------------------------------------------------- icons */
  function icon(ctx, S, kind) {
    var c = S / 2, i, a;
    ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = S * 0.09; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'map') {
      ctx.beginPath();
      ctx.moveTo(S * 0.16, S * 0.28); ctx.lineTo(S * 0.38, S * 0.18);
      ctx.lineTo(S * 0.62, S * 0.30); ctx.lineTo(S * 0.84, S * 0.20);
      ctx.lineTo(S * 0.84, S * 0.76); ctx.lineTo(S * 0.62, S * 0.86);
      ctx.lineTo(S * 0.38, S * 0.74); ctx.lineTo(S * 0.16, S * 0.84);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S * 0.38, S * 0.18); ctx.lineTo(S * 0.38, S * 0.74); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S * 0.62, S * 0.30); ctx.lineTo(S * 0.62, S * 0.86); ctx.stroke();
    } else if (kind === 'restart') {
      ctx.beginPath();
      for (i = 0; i <= 22; i++) {
        a = -Math.PI * 0.35 + i * (Math.PI * 1.72 / 22);
        var x = c + Math.cos(a) * S * 0.30, y = c + Math.sin(a) * S * 0.30;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + S * 0.30, c - S * 0.18);
      ctx.lineTo(c + S * 0.40, c + S * 0.04);
      ctx.lineTo(c + S * 0.16, c + S * 0.02);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'gear') {
      ctx.beginPath();
      for (i = 0; i < 8; i++) {
        a = i * Math.PI / 4;
        ctx.moveTo(c + Math.cos(a) * S * 0.20, c + Math.sin(a) * S * 0.20);
        ctx.lineTo(c + Math.cos(a) * S * 0.38, c + Math.sin(a) * S * 0.38);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, S * 0.22, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === 'sound') {
      ctx.beginPath();
      ctx.moveTo(S * 0.20, S * 0.38); ctx.lineTo(S * 0.34, S * 0.38);
      ctx.lineTo(S * 0.52, S * 0.20); ctx.lineTo(S * 0.52, S * 0.80);
      ctx.lineTo(S * 0.34, S * 0.62); ctx.lineTo(S * 0.20, S * 0.62);
      ctx.closePath(); ctx.fill();
      for (i = 0; i < 2; i++) {
        ctx.beginPath();
        var rr2 = S * (0.14 + i * 0.11);
        ctx.moveTo(S * 0.62, c - rr2 * 0.72);
        ctx.quadraticCurveTo(S * 0.62 + rr2, c, S * 0.62, c + rr2 * 0.72);
        ctx.stroke();
      }
    } else if (kind === 'mute') {
      ctx.beginPath();
      ctx.moveTo(S * 0.18, S * 0.38); ctx.lineTo(S * 0.32, S * 0.38);
      ctx.lineTo(S * 0.50, S * 0.20); ctx.lineTo(S * 0.50, S * 0.80);
      ctx.lineTo(S * 0.32, S * 0.62); ctx.lineTo(S * 0.18, S * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S * 0.62, S * 0.36); ctx.lineTo(S * 0.86, S * 0.64);
      ctx.moveTo(S * 0.86, S * 0.36); ctx.lineTo(S * 0.62, S * 0.64);
      ctx.stroke();
    } else if (kind === 'moves') {
      /* two-way swap arrows */
      ctx.beginPath();
      ctx.moveTo(S * 0.22, S * 0.36); ctx.lineTo(S * 0.72, S * 0.36); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(S * 0.60, S * 0.22); ctx.lineTo(S * 0.80, S * 0.36); ctx.lineTo(S * 0.60, S * 0.50);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S * 0.78, S * 0.66); ctx.lineTo(S * 0.28, S * 0.66); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(S * 0.40, S * 0.52); ctx.lineTo(S * 0.20, S * 0.66); ctx.lineTo(S * 0.40, S * 0.80);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'score') {
      glyphPath(ctx, 'star', c, c, S * 0.36); ctx.fill();
    } else if (kind === 'syrup') {
      glyphPath(ctx, 'drop', c, c, S * 0.36); ctx.fill();
    } else if (kind === 'acorn') {
      ctx.beginPath();
      ctx.moveTo(c - S * 0.26, c - S * 0.02);
      ctx.quadraticCurveTo(c - S * 0.26, c + S * 0.36, c, c + S * 0.36);
      ctx.quadraticCurveTo(c + S * 0.26, c + S * 0.36, c + S * 0.26, c - S * 0.02);
      ctx.closePath(); ctx.fill();
      rr(ctx, c - S * 0.30, c - S * 0.26, S * 0.60, S * 0.22, S * 0.08); ctx.fill();
    } else if (kind === 'combo') {
      glyphPath(ctx, 'flame', c, c, S * 0.36); ctx.fill();
    } else if (kind === 'lock') {
      rr(ctx, S * 0.26, S * 0.46, S * 0.48, S * 0.34, S * 0.09); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S * 0.36, S * 0.46); ctx.lineTo(S * 0.36, S * 0.34);
      ctx.quadraticCurveTo(S * 0.36, S * 0.18, S * 0.50, S * 0.18);
      ctx.quadraticCurveTo(S * 0.64, S * 0.18, S * 0.64, S * 0.34);
      ctx.lineTo(S * 0.64, S * 0.46);
      ctx.stroke();
    } else if (kind === 'crown') {
      ctx.beginPath();
      ctx.moveTo(S * 0.16, S * 0.72); ctx.lineTo(S * 0.22, S * 0.30);
      ctx.lineTo(S * 0.36, S * 0.50); ctx.lineTo(S * 0.50, S * 0.22);
      ctx.lineTo(S * 0.64, S * 0.50); ctx.lineTo(S * 0.78, S * 0.30);
      ctx.lineTo(S * 0.84, S * 0.72);
      ctx.closePath(); ctx.fill();
      rr(ctx, S * 0.16, S * 0.74, S * 0.68, S * 0.12, S * 0.05); ctx.fill();
    } else if (kind === 'play') {
      ctx.beginPath();
      ctx.moveTo(S * 0.32, S * 0.20); ctx.lineTo(S * 0.82, S * 0.50); ctx.lineTo(S * 0.32, S * 0.80);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'infinity') {
      ctx.lineWidth = S * 0.11;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.bezierCurveTo(c - S * 0.10, c - S * 0.26, c - S * 0.38, c - S * 0.26, c - S * 0.38, c);
      ctx.bezierCurveTo(c - S * 0.38, c + S * 0.26, c - S * 0.10, c + S * 0.26, c, c);
      ctx.bezierCurveTo(c + S * 0.10, c - S * 0.26, c + S * 0.38, c - S * 0.26, c + S * 0.38, c);
      ctx.bezierCurveTo(c + S * 0.38, c + S * 0.26, c + S * 0.10, c + S * 0.26, c, c);
      ctx.stroke();
    } else if (kind === 'medal') {
      ctx.beginPath(); ctx.arc(c, c + S * 0.10, S * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S * 0.34, S * 0.10); ctx.lineTo(S * 0.44, S * 0.10);
      ctx.lineTo(S * 0.44, S * 0.44); ctx.lineTo(S * 0.28, S * 0.34); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S * 0.66, S * 0.10); ctx.lineTo(S * 0.56, S * 0.10);
      ctx.lineTo(S * 0.56, S * 0.44); ctx.lineTo(S * 0.72, S * 0.34); ctx.closePath(); ctx.fill();
    } else if (kind === 'back') {
      ctx.beginPath();
      ctx.moveTo(S * 0.60, S * 0.22); ctx.lineTo(S * 0.34, S * 0.50); ctx.lineTo(S * 0.60, S * 0.78);
      ctx.stroke();
    } else if (kind === 'close') {
      ctx.beginPath();
      ctx.moveTo(S * 0.28, S * 0.28); ctx.lineTo(S * 0.72, S * 0.72);
      ctx.moveTo(S * 0.72, S * 0.28); ctx.lineTo(S * 0.28, S * 0.72);
      ctx.stroke();
    }
  }

  /* -------------------------------------------------- particle textures */
  function drawDot(ctx, S) {
    var g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  function drawShard(ctx, S) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(S * 0.5, 0); ctx.lineTo(S, S * 0.42); ctx.lineTo(S * 0.62, S);
    ctx.lineTo(S * 0.20, S * 0.78); ctx.closePath();
    ctx.fill();
  }
  function drawStreak(ctx, W, H) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    rr(ctx, 0, 0, W, H, W / 2);
    ctx.fill();
  }
  function drawRingTex(ctx, S) {
    /* hand-tessellated ring, never Graphics.arc at runtime */
    var cx = S / 2, cy = S / 2, ro = S * 0.48, ri = S * 0.37, i, a;
    ctx.beginPath();
    for (i = 0; i <= 48; i++) { a = i / 48 * Math.PI * 2; ctx.lineTo(cx + Math.cos(a) * ro, cy + Math.sin(a) * ro); }
    ctx.closePath();
    for (i = 48; i >= 0; i--) { a = i / 48 * Math.PI * 2; ctx.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri); }
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill('evenodd');
  }

  /* ------------------------------------------------------- trail nodes */
  function drawNode(ctx, S, kind, seg) {
    var cx = S / 2, cy = S / 2, r = S * 0.40;
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#0A1020';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.5, r * 0.9, r * 0.34, 0, 0, Math.PI * 2);
    ctx.filter = 'blur(3px)'; ctx.fill();
    ctx.restore();
    var face = kind === 'locked' ? 0x2E4269 : (kind === 'done' ? 0x5BCB77 : 0xF7C948);
    var accent = seg && seg.accent != null ? seg.accent : 0xF7FBFF;
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, hex(A.lighten(face, 0.30)));
    g.addColorStop(1, hex(A.darken(face, 0.28)));
    poly(ctx, cx, cy, r, 8, Math.PI / 8, 1);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = S * 0.055;
    ctx.strokeStyle = kind === 'locked' ? hex(A.darken(accent, 0.10)) : hex(accent);
    ctx.stroke();
    if (kind !== 'locked') {
      ctx.save();
      poly(ctx, cx, cy, r * 0.96, 8, Math.PI / 8, 1); ctx.clip();
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy - r * 0.40, r * 0.42, r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    /* Each chapter gets a small material mark inside the octagon. It is
     * intentionally secondary to the state colour and number. */
    ctx.save();
    ctx.globalAlpha = kind === 'locked' ? 0.32 : 0.52;
    ctx.strokeStyle = hex(accent);
    ctx.fillStyle = hex(accent);
    ctx.lineWidth = S * 0.025;
    if (seg && seg.motif === 'bubble') {
      ctx.beginPath(); ctx.arc(cx - r * 0.26, cy + r * 0.16, r * 0.13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + r * 0.22, cy - r * 0.22, r * 0.08, 0, Math.PI * 2); ctx.stroke();
    } else if (seg && seg.motif === 'spore') {
      ctx.beginPath(); ctx.arc(cx - r * 0.18, cy - r * 0.10, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.18, cy + r * 0.16, r * 0.11, 0, Math.PI * 2); ctx.fill();
    } else if (seg && (seg.motif === 'ember' || seg.motif === 'petal')) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.34, cy + r * 0.22); ctx.lineTo(cx, cy - r * 0.28);
      ctx.lineTo(cx + r * 0.34, cy + r * 0.22); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.34, cy); ctx.lineTo(cx + r * 0.34, cy); ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- bakery */
  A.bakeStatic = function (scene) {
    var i, sp, S = TILE;
    for (i = 0; i < BC.FAMILIES.length; i++) {
      for (sp = 0; sp <= 3; sp++) {
        (function (fam, spv) {
          tex(scene, 'bc_b' + i + '_' + spv, S, S, function (ctx) { drawBerry(ctx, S, fam, spv); });
        })(BC.FAMILIES[i], sp);
      }
    }
    tex(scene, 'bc_prism', S, S, function (ctx) { drawPrism(ctx, S); });
    tex(scene, 'bc_acorn', S, S, function (ctx) { drawAcorn(ctx, S); });
    tex(scene, 'bc_syr1', S, S, function (ctx) { drawSyrup(ctx, S, 1); });
    tex(scene, 'bc_syr2', S, S, function (ctx) { drawSyrup(ctx, S, 2); });
    tex(scene, 'bc_focus', S, S, function (ctx) { drawFocus(ctx, S); });
    tex(scene, 'bc_ghost_ok', S, S, function (ctx) { drawGhost(ctx, S, true); });
    tex(scene, 'bc_ghost_no', S, S, function (ctx) { drawGhost(ctx, S, false); });
    tex(scene, 'bc_arrow', S, S, function (ctx) { drawArrow(ctx, S); });

    tex(scene, 'bc_star1', 64, 64, function (ctx) { drawStar(ctx, 64, true); });
    tex(scene, 'bc_star0', 64, 64, function (ctx) { drawStar(ctx, 64, false); });
    for (i = 1; i <= 3; i++) {
      (function (t) { tex(scene, 'bc_medal' + t, 96, 96, function (ctx) { drawMedal(ctx, 96, t); }); })(i);
    }

    var icons = ['map', 'restart', 'gear', 'sound', 'mute', 'moves', 'score', 'syrup',
      'acorn', 'combo', 'lock', 'crown', 'play', 'infinity', 'medal', 'back', 'close'];
    for (i = 0; i < icons.length; i++) {
      (function (k) { tex(scene, 'bc_ic_' + k, 64, 64, function (ctx) { icon(ctx, 64, k); }); })(icons[i]);
    }

    tex(scene, 'bc_dot', 32, 32, function (ctx) { drawDot(ctx, 32); });
    tex(scene, 'bc_shard', 24, 24, function (ctx) { drawShard(ctx, 24); });
    tex(scene, 'bc_streak', 10, 48, function (ctx) { drawStreak(ctx, 10, 48); });
    tex(scene, 'bc_ring', 64, 64, function (ctx) { drawRingTex(ctx, 64); });

    tex(scene, 'bc_node_locked', 96, 96, function (ctx) { drawNode(ctx, 96, 'locked'); });
    tex(scene, 'bc_node_open', 96, 96, function (ctx) { drawNode(ctx, 96, 'open'); });
    tex(scene, 'bc_node_done', 96, 96, function (ctx) { drawNode(ctx, 96, 'done'); });

    /* one white pixel for cheap tinted rectangles */
    tex(scene, 'bc_px', 4, 4, function (ctx) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 4, 4); });
    /* Tint is a WebGL-only feature: anything that MUST be dark is baked dark
     * so a canvas-renderer fallback cannot turn a scrim into a white veil. */
    tex(scene, 'bc_scrim', 4, 4, function (ctx) { ctx.fillStyle = '#060B16'; ctx.fillRect(0, 0, 4, 4); });
    tex(scene, 'bc_ink', 4, 4, function (ctx) { ctx.fillStyle = '#101B31'; ctx.fillRect(0, 0, 4, 4); });
  };

  A.bakeNode = function (scene, key, kind, seg) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, 96, 96, function (ctx) { drawNode(ctx, 96, kind, seg); });
    return key;
  };

  A.berryKey = function (c, sp) {
    if (c === BC.ACORN) return 'bc_acorn';
    if (sp === BC.SP.PRISM || c === BC.PRISMC) return 'bc_prism';
    var idx = (c >= 0 && c < BC.FAMILIES.length) ? c : 0;
    var s = (sp >= 0 && sp <= 3) ? sp : 0;
    return 'bc_b' + idx + '_' + s;
  };

  /* ------------------------------------------- sized, per-scene textures */

  /* Backdrop: segment sky gradient plus a soft corner vignette. */
  A.bakeSky = function (scene, key, w, h, seg) {
    return tex(scene, key, w, h, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(seg.skyTop));
      g.addColorStop(1, hex(seg.skyBot));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var v = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.20, w / 2, h * 0.5, Math.max(w, h) * 0.72);
      v.addColorStop(0, 'rgba(255,255,255,0.05)');
      v.addColorStop(1, 'rgba(10,14,28,0.55)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    });
  };

  /* Board: frame, inner cells, syrup-free rhythm. Baked once per layout. */
  A.bakeBoard = function (scene, key, cell, pad, cols, rows, seg) {
    var w = cols * cell + pad * 2, h = rows * cell + pad * 2;
    tex(scene, key, w, h, function (ctx) {
      /* outer frame */
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(A.lighten(seg.frame, 0.22)));
      g.addColorStop(1, hex(A.darken(seg.frame, 0.30)));
      rr(ctx, 0, 0, w, h, 16);
      ctx.fillStyle = g; ctx.fill();
      /* woven picnic weave across the frame lip */
      ctx.save();
      rr(ctx, 0, 0, w, h, 16); ctx.clip();
      ctx.globalAlpha = 0.16; ctx.strokeStyle = hex(seg.frameLip); ctx.lineWidth = 3;
      for (var d = -h; d < w; d += 9) {
        ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + h, h); ctx.stroke();
      }
      ctx.restore();
      /* frame highlight edge */
      ctx.globalAlpha = 1;
      rr(ctx, 1, 1, w - 2, h - 2, 15);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(247,251,255,0.30)'; ctx.stroke();

      /* inner well */
      rr(ctx, pad - 5, pad - 5, cols * cell + 10, rows * cell + 10, 12);
      ctx.fillStyle = hex(A.darken(seg.cell, 0.42)); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,16,30,0.55)'; ctx.stroke();

      /* cells: a quiet two-value chequer so rows and columns parse instantly */
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var cx = pad + x * cell, cy = pad + y * cell;
          var f = ((x + y) % 2 === 0) ? seg.cell : A.darken(seg.cell, 0.12);
          rr(ctx, cx + 1.5, cy + 1.5, cell - 3, cell - 3, cell * 0.16);
          ctx.fillStyle = hex(f); ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(' + [(seg.cellEdge >> 16) & 255, (seg.cellEdge >> 8) & 255, seg.cellEdge & 255].join(',') + ',0.45)';
          ctx.stroke();
        }
      }
      /* inner contact shadow at the top of the well */
      var sh = ctx.createLinearGradient(0, pad - 5, 0, pad + cell * 0.6);
      sh.addColorStop(0, 'rgba(10,16,30,0.40)');
      sh.addColorStop(1, 'rgba(10,16,30,0)');
      ctx.save();
      rr(ctx, pad - 5, pad - 5, cols * cell + 10, rows * cell + 10, 12); ctx.clip();
      ctx.fillStyle = sh; ctx.fillRect(pad - 5, pad - 5, cols * cell + 10, cell);
      ctx.restore();
    });
    return { w: w, h: h };
  };

  /* Rounded card used for HUD chips, panels and buttons. */
  A.bakeCard = function (scene, key, w, h, r, fill, alpha, stroke, strokeAlpha) {
    return tex(scene, key, w, h, function (ctx) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      rr(ctx, 1, 1, w - 2, h - 2, r);
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(A.lighten(fill, 0.10)));
      g.addColorStop(1, hex(A.darken(fill, 0.16)));
      ctx.fillStyle = g; ctx.fill();
      if (stroke != null) {
        ctx.globalAlpha = strokeAlpha == null ? 0.6 : strokeAlpha;
        ctx.lineWidth = 2; ctx.strokeStyle = hex(stroke); ctx.stroke();
      }
    });
  };

  /* flat colour swatch, baked rather than tinted (see bc_scrim) */
  A.bakeSwatch = function (scene, key, fill) {
    if (scene.textures.exists(key)) return key;
    tex(scene, key, 4, 4, function (ctx) { ctx.fillStyle = hex(fill); ctx.fillRect(0, 0, 4, 4); });
    return key;
  };

  A.bakeBar = function (scene, key, w, h, fill) {
    return tex(scene, key, w, h, function (ctx) {
      rr(ctx, 0, 0, w, h, h / 2);
      ctx.fillStyle = hex(fill); ctx.fill();
    });
  };

  return A;
})();
