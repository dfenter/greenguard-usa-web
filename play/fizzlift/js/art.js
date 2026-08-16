/* Fizzlift - procedural art bakery.
 *
 * Everything the game draws is baked ONCE into canvas textures here and then
 * blitted as pooled Images. Nothing static is left in a Phaser Graphics
 * display list: Graphics replays its entire command list every frame, and a
 * board-sized static Graphics has cost a shipped title 316ms/frame at 4x
 * throttle. Rings and arcs are baked here too rather than drawn with
 * Graphics.arc, which walks its sweep in 0.01 rad steps.
 *
 * All shapes are original vector work drawn with the 2D canvas API. No image
 * files, no fonts, no network.
 */
(function (FZ) {
  'use strict';

  var art = {};
  FZ.art = art;

  var PS = 96;      /* piece textures are baked at 96px and scaled down */

  function cv(w, h) {
    var baked = GGKit.hiDpi.canvas(w, h), c = baked.canvas;
    c.__ggCtx = baked.ctx;
    return c;
  }
  function ctxOf(c) {
    var x = c.__ggCtx || c.getContext('2d');
    x.imageSmoothingEnabled = true;
    return x;
  }
  function add(scene, key, canvas) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  }
  art.add = add;

  function rr(x, px, py, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    x.beginPath();
    x.moveTo(px + rad, py);
    x.lineTo(px + w - rad, py);
    x.quadraticCurveTo(px + w, py, px + w, py + rad);
    x.lineTo(px + w, py + h - rad);
    x.quadraticCurveTo(px + w, py + h, px + w - rad, py + h);
    x.lineTo(px + rad, py + h);
    x.quadraticCurveTo(px, py + h, px, py + h - rad);
    x.lineTo(px, py + rad);
    x.quadraticCurveTo(px, py, px + rad, py);
    x.closePath();
  }
  art.rr = rr;

  function poly(x, cx, cy, rad, n, rot, round) {
    var pts = [], i;
    for (i = 0; i < n; i++) {
      var a = rot + (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    x.beginPath();
    if (!round) {
      x.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < n; i++) x.lineTo(pts[i][0], pts[i][1]);
    } else {
      /* rounded polygon via quadratic joints at each vertex */
      for (i = 0; i < n; i++) {
        var p = pts[i], q = pts[(i + 1) % n];
        var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        if (i === 0) x.moveTo(mx, my);
        var nq = pts[(i + 1) % n], nn = pts[(i + 2) % n];
        var m2x = (nq[0] + nn[0]) / 2, m2y = (nq[1] + nn[1]) / 2;
        x.quadraticCurveTo(q[0], q[1], m2x, m2y);
      }
    }
    x.closePath();
  }

  /* ------------------------------------------------ family silhouettes */
  function shapePath(x, shape, s, inset) {
    var c = s / 2, R = s / 2 - inset;
    switch (shape) {
      case 'circle':
        x.beginPath();
        x.arc(c, c, R, 0, Math.PI * 2);
        x.closePath();
        break;
      case 'hex':
        poly(x, c, c, R, 6, Math.PI / 6, true);
        break;
      case 'diamond':
        poly(x, c, c, R, 4, -Math.PI / 2, true);
        break;
      case 'octagon':
        poly(x, c, c, R, 8, Math.PI / 8, true);
        break;
      case 'clip': {
        /* rounded square with two opposite corners cut square: a leaf */
        var k = R * 0.92;
        x.beginPath();
        x.moveTo(c - k, c - k);
        x.lineTo(c + k * 0.42, c - k);
        x.quadraticCurveTo(c + k, c - k, c + k, c - k * 0.42);
        x.lineTo(c + k, c + k);
        x.lineTo(c - k * 0.42, c + k);
        x.quadraticCurveTo(c - k, c + k, c - k, c + k * 0.42);
        x.closePath();
        break;
      }
      case 'shield': {
        /* droplet-shield: broad round top, soft point at the bottom */
        var w = R * 0.95;
        x.beginPath();
        x.moveTo(c - w, c - w * 0.35);
        x.quadraticCurveTo(c - w, c - w, c, c - w);
        x.quadraticCurveTo(c + w, c - w, c + w, c - w * 0.35);
        x.lineTo(c + w, c + w * 0.20);
        x.quadraticCurveTo(c + w, c + w, c, c + w);
        x.quadraticCurveTo(c - w, c + w, c - w, c + w * 0.20);
        x.closePath();
        break;
      }
      default:
        rr(x, inset, inset, s - inset * 2, s - inset * 2, s * 0.18);
    }
  }

  /* ------------------------------------------------------------ glyphs */
  function glyphPath(x, glyph, s) {
    var c = s / 2, u = s / 100;
    x.beginPath();
    switch (glyph) {
      case 'seed':
        /* a soft seed: teardrop with a notch */
        x.moveTo(c, c - 26 * u);
        x.quadraticCurveTo(c + 20 * u, c - 12 * u, c + 15 * u, c + 12 * u);
        x.quadraticCurveTo(c + 8 * u, c + 28 * u, c, c + 26 * u);
        x.quadraticCurveTo(c - 8 * u, c + 28 * u, c - 15 * u, c + 12 * u);
        x.quadraticCurveTo(c - 20 * u, c - 12 * u, c, c - 26 * u);
        x.closePath();
        break;
      case 'burst': {
        /* four-point sun */
        var R = 27 * u, r2 = 9 * u;
        for (var i = 0; i < 8; i++) {
          var a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
          var rr2 = (i % 2 === 0) ? R : r2;
          var px = c + Math.cos(a) * rr2, py = c + Math.sin(a) * rr2;
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.closePath();
        break;
      }
      case 'leaf':
        x.moveTo(c - 24 * u, c + 22 * u);
        x.quadraticCurveTo(c - 26 * u, c - 22 * u, c + 24 * u, c - 24 * u);
        x.quadraticCurveTo(c + 22 * u, c + 24 * u, c - 24 * u, c + 22 * u);
        x.closePath();
        break;
      case 'drop':
        x.moveTo(c, c - 28 * u);
        x.quadraticCurveTo(c + 22 * u, c + 2 * u, c + 18 * u, c + 13 * u);
        x.arc(c, c + 10 * u, 18 * u, 0.30, Math.PI - 0.30);
        x.quadraticCurveTo(c - 22 * u, c + 2 * u, c, c - 28 * u);
        x.closePath();
        break;
      case 'star': {
        var R2 = 28 * u, r3 = 12 * u;
        for (var j = 0; j < 12; j++) {
          var a2 = -Math.PI / 2 + (j / 12) * Math.PI * 2;
          var rr3 = (j % 2 === 0) ? R2 : r3;
          var qx = c + Math.cos(a2) * rr3, qy = c + Math.sin(a2) * rr3;
          if (j === 0) x.moveTo(qx, qy); else x.lineTo(qx, qy);
        }
        x.closePath();
        break;
      }
      case 'flame':
        /* square flame: a chevron stack inside a square footprint */
        x.moveTo(c - 22 * u, c + 24 * u);
        x.lineTo(c - 22 * u, c + 4 * u);
        x.lineTo(c, c - 26 * u);
        x.lineTo(c + 22 * u, c + 4 * u);
        x.lineTo(c + 22 * u, c + 24 * u);
        x.lineTo(c + 6 * u, c + 24 * u);
        x.lineTo(c + 6 * u, c + 6 * u);
        x.lineTo(c, c - 4 * u);
        x.lineTo(c - 6 * u, c + 6 * u);
        x.lineTo(c - 6 * u, c + 24 * u);
        x.closePath();
        break;
      default:
        x.arc(c, c, 20 * u, 0, Math.PI * 2);
    }
  }

  /* ------------------------------------------------------ piece bakery */
  function drawPiece(x, fam, s, opts) {
    var o = opts || {};
    var inset = o.broad ? s * 0.045 : s * 0.085;
    var face = FZ.hex(fam.face);
    var lite = FZ.hex(FZ.shade(fam.face, o.broad ? 0.38 : 0.26));
    var dark = FZ.hex(FZ.shade(fam.face, -0.22));
    var edge = FZ.hex(fam.edge);

    /* contact shadow under the piece */
    x.save();
    x.globalAlpha = 0.34;
    x.fillStyle = '#000000';
    x.translate(0, s * 0.045);
    shapePath(x, fam.shape, s, inset);
    x.filter = 'blur(' + (s * 0.035) + 'px)';
    x.fill();
    x.restore();

    /* face with a fake-lambert vertical gradient */
    var g = x.createLinearGradient(0, inset, 0, s - inset);
    g.addColorStop(0, lite);
    g.addColorStop(0.55, face);
    g.addColorStop(1, dark);
    x.fillStyle = g;
    shapePath(x, fam.shape, s, inset);
    x.fill();

    /* edge */
    x.strokeStyle = edge;
    x.lineWidth = s * (o.broad ? 0.055 : 0.045);
    shapePath(x, fam.shape, s, inset);
    x.stroke();

    /* one-pixel top highlight */
    x.save();
    shapePath(x, fam.shape, s, inset);
    x.clip();
    x.globalAlpha = 0.55;
    x.strokeStyle = '#FFFFFF';
    x.lineWidth = s * 0.03;
    x.beginPath();
    x.moveTo(s * 0.20, inset + s * 0.10);
    x.quadraticCurveTo(s * 0.5, inset + s * 0.03, s * 0.80, inset + s * 0.10);
    x.stroke();
    x.restore();

    /* centred glyph, filled for contrast against its own face */
    var onLight = fam.lum >= 0.66;
    x.save();
    x.globalAlpha = 0.30;
    x.fillStyle = onLight ? '#FFFFFF' : '#000000';
    x.translate(0, s * 0.022);
    glyphPath(x, fam.glyph, s);
    x.fill();
    x.restore();
    x.fillStyle = onLight ? FZ.hex(FZ.TOK.ink) : FZ.hex(FZ.TOK.hi);
    glyphPath(x, fam.glyph, s);
    x.fill();

    /* Authored bottle motion states. The view swaps these baked poses while a
       piece travels, so rise and fall read as deliberate states rather than a
       generic sprite sliding between cells. */
    if (o.pose === 'rise' || o.pose === 'fall') {
      var dir = o.pose === 'rise' ? -1 : 1;
      x.save();
      x.globalAlpha = 0.72;
      x.strokeStyle = onLight ? '#182238' : '#F7FBFF';
      x.lineWidth = s * 0.028;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(s * 0.23, s * 0.50 + dir * s * 0.13);
      x.lineTo(s * 0.23, s * 0.50 - dir * s * 0.13);
      x.moveTo(s * 0.77, s * 0.50 + dir * s * 0.13);
      x.lineTo(s * 0.77, s * 0.50 - dir * s * 0.13);
      x.stroke();
      x.restore();
    }
  }

  function bakeFamily(scene, i) {
    var fam = FZ.family(i), c, x;

    /* ordinary piece */
    c = cv(PS, PS); x = ctxOf(c);
    drawPiece(x, fam, PS, {});
    add(scene, 'p' + i, c);

    c = cv(PS, PS); x = ctxOf(c);
    drawPiece(x, fam, PS, { pose: 'rise' });
    add(scene, 'pu' + i, c);

    c = cv(PS, PS); x = ctxOf(c);
    drawPiece(x, fam, PS, { pose: 'fall' });
    add(scene, 'pd' + i, c);

    /* bomb: broader body, bold ring, eight spokes */
    c = cv(PS, PS); x = ctxOf(c);
    drawPiece(x, fam, PS, { broad: true });
    x.save();
    x.strokeStyle = FZ.hex(FZ.TOK.hi);
    x.lineWidth = PS * 0.055;
    x.beginPath();
    x.arc(PS / 2, PS / 2, PS * 0.30, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = PS * 0.032;
    for (var k = 0; k < 8; k++) {
      var a = (k / 8) * Math.PI * 2;
      x.beginPath();
      x.moveTo(PS / 2 + Math.cos(a) * PS * 0.30, PS / 2 + Math.sin(a) * PS * 0.30);
      x.lineTo(PS / 2 + Math.cos(a) * PS * 0.42, PS / 2 + Math.sin(a) * PS * 0.42);
      x.stroke();
    }
    x.restore();
    add(scene, 'b' + i, c);

    /* surge: broad body with a vertical double arrow, it clears a column */
    c = cv(PS, PS); x = ctxOf(c);
    drawPiece(x, fam, PS, { broad: true });
    x.save();
    x.fillStyle = FZ.hex(FZ.TOK.hi);
    x.strokeStyle = FZ.hex(FZ.TOK.ink);
    x.lineWidth = PS * 0.02;
    function arrow(dir) {
      var cy = PS / 2 + dir * PS * 0.24;
      x.beginPath();
      x.moveTo(PS / 2, cy - dir * PS * 0.14);
      x.lineTo(PS / 2 + PS * 0.15, cy + dir * PS * 0.04);
      x.lineTo(PS / 2 + PS * 0.06, cy + dir * PS * 0.04);
      x.lineTo(PS / 2 + PS * 0.06, cy + dir * PS * 0.13);
      x.lineTo(PS / 2 - PS * 0.06, cy + dir * PS * 0.13);
      x.lineTo(PS / 2 - PS * 0.06, cy + dir * PS * 0.04);
      x.lineTo(PS / 2 - PS * 0.15, cy + dir * PS * 0.04);
      x.closePath();
      x.fill();
      x.stroke();
    }
    arrow(-1); arrow(1);
    x.restore();
    add(scene, 's' + i, c);
  }

  /* ------------------------------------------------- goal object bakery */
  function bakeCap(scene) {
    var c = cv(PS, PS), x = ctxOf(c), R = PS * 0.40, cc = PS / 2;

    x.save();
    x.globalAlpha = 0.34;
    x.fillStyle = '#000';
    x.filter = 'blur(' + PS * 0.035 + 'px)';
    x.beginPath();
    x.arc(cc, cc + PS * 0.045, R, 0, Math.PI * 2);
    x.fill();
    x.restore();

    /* crimped rim */
    x.fillStyle = FZ.hex(FZ.TOK.capEdge);
    x.beginPath();
    for (var i = 0; i < 44; i++) {
      var a = (i / 44) * Math.PI * 2;
      var rad = R * (i % 2 === 0 ? 1.0 : 0.90);
      var px = cc + Math.cos(a) * rad, py = cc + Math.sin(a) * rad;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fill();

    var g = x.createLinearGradient(0, cc - R, 0, cc + R);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.5, FZ.hex(FZ.TOK.cap));
    g.addColorStop(1, '#9FB0C4');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cc, cc, R * 0.84, 0, Math.PI * 2);
    x.fill();

    x.strokeStyle = FZ.hex(FZ.TOK.capEdge);
    x.lineWidth = PS * 0.035;
    x.beginPath();
    x.arc(cc, cc, R * 0.62, 0, Math.PI * 2);
    x.stroke();

    /* up chevron: a cap always wants the surface */
    x.fillStyle = FZ.hex(FZ.TOK.ink);
    x.beginPath();
    x.moveTo(cc, cc - PS * 0.17);
    x.lineTo(cc + PS * 0.13, cc - PS * 0.01);
    x.lineTo(cc + PS * 0.055, cc - PS * 0.01);
    x.lineTo(cc + PS * 0.055, cc + PS * 0.16);
    x.lineTo(cc - PS * 0.055, cc + PS * 0.16);
    x.lineTo(cc - PS * 0.055, cc - PS * 0.01);
    x.lineTo(cc - PS * 0.13, cc - PS * 0.01);
    x.closePath();
    x.fill();

    add(scene, 'cap', c);
  }

  function bakeSeal(scene, cracked) {
    var c = cv(PS, PS), x = ctxOf(c), cc = PS / 2, R = PS * 0.40;

    x.save();
    x.globalAlpha = 0.36;
    x.fillStyle = '#000';
    x.filter = 'blur(' + PS * 0.035 + 'px)';
    poly(x, cc, cc + PS * 0.045, R, 6, 0, false);
    x.fill();
    x.restore();

    var g = x.createLinearGradient(0, cc - R, 0, cc + R);
    g.addColorStop(0, '#EAF1F9');
    g.addColorStop(0.55, FZ.hex(cracked ? FZ.TOK.sealHot : FZ.TOK.seal));
    g.addColorStop(1, '#7A8CA3');
    x.fillStyle = g;
    poly(x, cc, cc, R, 6, 0, false);
    x.fill();
    x.strokeStyle = FZ.hex(FZ.TOK.sealEdge);
    x.lineWidth = PS * 0.05;
    poly(x, cc, cc, R, 6, 0, false);
    x.stroke();

    /* bolt cross, the seal's grayscale-safe symbol */
    x.strokeStyle = FZ.hex(FZ.TOK.sealEdge);
    x.lineWidth = PS * 0.07;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cc - R * 0.46, cc); x.lineTo(cc + R * 0.46, cc);
    x.moveTo(cc, cc - R * 0.46); x.lineTo(cc, cc + R * 0.46);
    x.stroke();
    x.lineWidth = PS * 0.035;
    x.beginPath();
    x.arc(cc, cc, R * 0.30, 0, Math.PI * 2);
    x.stroke();

    if (cracked) {
      x.strokeStyle = '#3A2408';
      x.lineWidth = PS * 0.035;
      x.beginPath();
      x.moveTo(cc - R * 0.9, cc - R * 0.25);
      x.lineTo(cc - R * 0.2, cc + R * 0.05);
      x.lineTo(cc + R * 0.15, cc - R * 0.35);
      x.lineTo(cc + R * 0.85, cc + R * 0.20);
      x.stroke();
    }
    add(scene, cracked ? 'seal1' : 'seal2', c);
  }

  /* -------------------------------------------------- selection + hint */
  function bakeSelector(scene) {
    var c = cv(PS, PS), x = ctxOf(c);
    x.strokeStyle = FZ.hex(FZ.TOK.hi);
    x.lineWidth = PS * 0.075;
    rr(x, PS * 0.07, PS * 0.07, PS * 0.86, PS * 0.86, PS * 0.22);
    x.stroke();
    x.strokeStyle = FZ.hex(FZ.TOK.ink);
    x.lineWidth = PS * 0.028;
    rr(x, PS * 0.07, PS * 0.07, PS * 0.86, PS * 0.86, PS * 0.22);
    x.stroke();
    /* corner ticks give the ring a pose the eye can track over a cascade */
    x.strokeStyle = FZ.hex(FZ.TOK.hi);
    x.lineWidth = PS * 0.075;
    x.lineCap = 'round';
    var m = PS * 0.16, e = PS * 0.34;
    var corners = [[m, m, 1, 1], [PS - m, m, -1, 1], [m, PS - m, 1, -1], [PS - m, PS - m, -1, -1]];
    for (var i = 0; i < corners.length; i++) {
      var p = corners[i];
      x.beginPath();
      x.moveTo(p[0] + p[2] * e, p[1]);
      x.lineTo(p[0], p[1]);
      x.lineTo(p[0], p[1] + p[3] * e);
      x.stroke();
    }
    add(scene, 'sel', c);
  }

  function bakeGhost(scene) {
    /* proposed landing cell: solid ghost plate with a hatch, drawn under the
       dragged piece so an invalid move reads without colour alone */
    var c = cv(PS, PS), x = ctxOf(c);
    x.fillStyle = 'rgba(247,251,255,0.16)';
    rr(x, PS * 0.06, PS * 0.06, PS * 0.88, PS * 0.88, PS * 0.20);
    x.fill();
    x.strokeStyle = 'rgba(247,251,255,0.85)';
    x.lineWidth = PS * 0.04;
    x.setLineDash([PS * 0.10, PS * 0.08]);
    rr(x, PS * 0.06, PS * 0.06, PS * 0.88, PS * 0.88, PS * 0.20);
    x.stroke();
    add(scene, 'ghost', c);

    c = cv(PS, PS); x = ctxOf(c);
    x.strokeStyle = 'rgba(242,92,104,0.95)';
    x.lineWidth = PS * 0.06;
    rr(x, PS * 0.06, PS * 0.06, PS * 0.88, PS * 0.88, PS * 0.20);
    x.stroke();
    x.lineWidth = PS * 0.05;
    x.beginPath();
    for (var k = -1; k < 3; k++) {
      x.moveTo(PS * 0.06 + k * PS * 0.30, PS * 0.94);
      x.lineTo(PS * 0.06 + k * PS * 0.30 + PS * 0.88, PS * 0.06);
    }
    x.stroke();
    add(scene, 'nogo', c);
  }

  /* ------------------------------------------------------- directional */
  /* Float/fall side markers. The player must always know which way a side of
     the line moves; these ride the board edge, never the cells. */
  function bakeArrows(scene) {
    /* dir +1 puts the apex at the TOP of the canvas, which is the UP arrow.
       Getting this backwards pointed every float/fall marker the wrong way. */
    [['arrUp', 1], ['arrDn', -1]].forEach(function (pair) {
      var key = pair[0], dir = pair[1];
      var c = cv(64, 64), x = ctxOf(c);
      x.fillStyle = '#FFFFFF';
      x.beginPath();
      x.moveTo(32, 32 - dir * 22);
      x.lineTo(32 + 20, 32 + dir * 6);
      x.lineTo(32 + 9, 32 + dir * 6);
      x.lineTo(32 + 9, 32 + dir * 22);
      x.lineTo(32 - 9, 32 + dir * 22);
      x.lineTo(32 - 9, 32 + dir * 6);
      x.lineTo(32 - 20, 32 + dir * 6);
      x.closePath();
      x.fill();
      add(scene, key, c);
    });
  }

  /* ------------------------------------------------------- particles */
  function bakeParticles(scene) {
    var c, x, g;

    /* soft dot: cascade streaks and reward sparks */
    c = cv(48, 48); x = ctxOf(c);
    g = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 48, 48);
    add(scene, 'px_dot', c);

    /* shard fragment: clear debris */
    c = cv(32, 32); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.beginPath();
    x.moveTo(16, 2); x.lineTo(29, 14); x.lineTo(20, 30); x.lineTo(4, 22); x.lineTo(3, 9);
    x.closePath();
    x.fill();
    add(scene, 'px_frag', c);

    /* bubble ring: the float trail */
    c = cv(48, 48); x = ctxOf(c);
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 5;
    x.beginPath(); x.arc(24, 24, 17, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.5)';
    x.lineWidth = 3;
    x.beginPath(); x.arc(19, 18, 5, 0, Math.PI * 2); x.stroke();
    add(scene, 'px_bub', c);

    /* four-point sparkle: medal and cap celebration */
    c = cv(48, 48); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      var r = (i % 2 === 0) ? 23 : 6;
      var px = 24 + Math.cos(a) * r, py = 24 + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fill();
    add(scene, 'px_star', c);

    /* soft ring for the board-rim combo pulse (baked, never Graphics.arc) */
    c = cv(128, 128); x = ctxOf(c);
    g = x.createRadialGradient(64, 64, 40, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    add(scene, 'px_ring', c);
  }

  /* ---------------------------------------------------- fizz textures */
  function bakeFizz(scene, vat) {
    var c, x, g;

    /* fizz body: the tint under the surface, behind the pieces */
    c = cv(16, 128); x = ctxOf(c);
    g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(' + rgb(vat.foam) + ',0.55)');
    g.addColorStop(0.16, 'rgba(' + rgb(vat.fizz) + ',0.42)');
    g.addColorStop(1, 'rgba(' + rgb(vat.fizzDeep) + ',0.55)');
    x.fillStyle = g;
    x.fillRect(0, 0, 16, 128);
    add(scene, 'fizzbody', c);

    /* fizz glaze: a thin liquid pass OVER the pieces so the side of the line a
       piece is on is unmistakable at a glance. Kept low enough that no glyph
       or goal object loses contrast. */
    c = cv(16, 128); x = ctxOf(c);
    g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(' + rgb(vat.foam) + ',0.18)');
    g.addColorStop(0.10, 'rgba(' + rgb(vat.fizz) + ',0.11)');
    g.addColorStop(1, 'rgba(' + rgb(vat.fizzDeep) + ',0.16)');
    x.fillStyle = g;
    x.fillRect(0, 0, 16, 128);
    add(scene, 'fizzglaze', c);

    /* the glowing surface bar itself */
    c = cv(64, 64); x = ctxOf(c);
    g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(' + rgb(vat.fizz) + ',0)');
    g.addColorStop(0.30, 'rgba(' + rgb(vat.fizz) + ',0.35)');
    g.addColorStop(0.44, 'rgba(' + rgb(vat.foam) + ',0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.56, 'rgba(' + rgb(vat.foam) + ',0.9)');
    g.addColorStop(0.70, 'rgba(' + rgb(vat.fizz) + ',0.35)');
    g.addColorStop(1, 'rgba(' + rgb(vat.fizz) + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    /* foam beading along the crest keeps the line reading as liquid */
    x.globalAlpha = 0.75;
    x.fillStyle = 'rgba(' + rgb(vat.foam) + ',1)';
    for (var i = 0; i < 8; i++) {
      x.beginPath();
      x.arc(4 + i * 8, 32 - 3 + (i % 2) * 6, 3.2, 0, Math.PI * 2);
      x.fill();
    }
    add(scene, 'fizzbar', c);
  }

  function rgb(n) {
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  art.rgb = rgb;

  /* --------------------------------------------------- board + frame */
  /* Baked at layout time and re-baked only on resize or vat change. */
  art.bakeBoard = function (scene, vat, geo) {
    var pad = geo.pad, cell = geo.cell, cols = geo.cols, rows = geo.rows;
    var w = Math.round(cols * cell + pad * 2);
    var h = Math.round(rows * cell + pad * 2);
    var c = cv(w, h), x = ctxOf(c), i, j;
    var rad = Math.max(12, Math.min(18, cell * 0.35));

    /* contact shadow */
    x.save();
    x.globalAlpha = 0.5;
    x.fillStyle = '#000';
    x.filter = 'blur(' + (pad * 0.7) + 'px)';
    rr(x, pad * 0.4, pad * 0.7, w - pad * 0.8, h - pad * 0.8, rad);
    x.fill();
    x.restore();

    /* frame material */
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, FZ.hex(vat.frameHi));
    g.addColorStop(0.14, FZ.hex(vat.frame));
    g.addColorStop(0.86, FZ.hex(vat.frame));
    g.addColorStop(1, FZ.hex(vat.frameDark));
    x.fillStyle = g;
    rr(x, 0, 0, w, h, rad);
    x.fill();

    /* signature per-vat treatment, kept on the FRAME, never behind cells */
    x.save();
    rr(x, 0, 0, w, h, rad);
    x.clip();
    x.globalAlpha = 0.30;
    x.strokeStyle = FZ.hex(vat.frameDark);
    x.fillStyle = FZ.hex(vat.frameDark);
    if (vat.treatment === 'ribs') {
      x.lineWidth = 3;
      for (i = 0; i < w; i += 14) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, pad); x.stroke();
        x.beginPath(); x.moveTo(i, h - pad); x.lineTo(i, h); x.stroke();
      }
    } else if (vat.treatment === 'rivets') {
      for (i = pad * 0.5; i < w; i += pad * 1.4) {
        for (j = 0; j < 2; j++) {
          var ry = j === 0 ? pad * 0.5 : h - pad * 0.5;
          x.beginPath(); x.arc(i, ry, Math.max(2, pad * 0.16), 0, Math.PI * 2); x.fill();
        }
      }
      for (j = pad * 1.6; j < h - pad; j += pad * 1.6) {
        x.beginPath(); x.arc(pad * 0.5, j, Math.max(2, pad * 0.16), 0, Math.PI * 2); x.fill();
        x.beginPath(); x.arc(w - pad * 0.5, j, Math.max(2, pad * 0.16), 0, Math.PI * 2); x.fill();
      }
    } else if (vat.treatment === 'waves') {
      x.lineWidth = 3;
      for (j = 0; j < 2; j++) {
        var yy = j === 0 ? pad * 0.5 : h - pad * 0.5;
        x.beginPath();
        for (i = 0; i <= w; i += 4) x.lineTo(i, yy + Math.sin(i * 0.09) * pad * 0.24);
        x.stroke();
      }
    } else {
      /* overflow: hazard chevrons */
      x.lineWidth = 4;
      for (i = -h; i < w; i += 16) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i + pad, pad); x.stroke();
        x.beginPath(); x.moveTo(i, h - pad); x.lineTo(i + pad, h); x.stroke();
      }
    }
    x.restore();

    /* highlight edge */
    x.strokeStyle = 'rgba(255,255,255,0.55)';
    x.lineWidth = 1.5;
    rr(x, 0.75, 0.75, w - 1.5, h - 1.5, rad);
    x.stroke();

    /* cell field: quiet, opaque, with a repeatable rhythm */
    var ix = pad, iy = pad, iw = cols * cell, ih = rows * cell;
    var gg = x.createLinearGradient(0, iy, 0, iy + ih);
    gg.addColorStop(0, FZ.hex(FZ.shade(vat.glass, 0.10)));
    gg.addColorStop(1, FZ.hex(FZ.shade(vat.glass, -0.18)));
    x.fillStyle = gg;
    rr(x, ix, iy, iw, ih, Math.max(6, rad * 0.5));
    x.fill();

    x.save();
    rr(x, ix, iy, iw, ih, Math.max(6, rad * 0.5));
    x.clip();
    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        var px = ix + i * cell, py = iy + j * cell;
        x.fillStyle = ((i + j) % 2 === 0)
          ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.055)';
        rr(x, px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.20);
        x.fill();
      }
    }
    /* grid rhythm lines so rows and columns parse instantly */
    x.strokeStyle = 'rgba(' + rgb(FZ.TOK.cellEdge) + ',0.24)';
    x.lineWidth = 1;
    for (i = 1; i < cols; i++) {
      x.beginPath(); x.moveTo(ix + i * cell, iy); x.lineTo(ix + i * cell, iy + ih); x.stroke();
    }
    for (j = 1; j < rows; j++) {
      x.beginPath(); x.moveTo(ix, iy + j * cell); x.lineTo(ix + iw, iy + j * cell); x.stroke();
    }
    /* inner shadow */
    var sg = x.createLinearGradient(0, iy, 0, iy + ih * 0.16);
    sg.addColorStop(0, 'rgba(0,0,0,0.35)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sg;
    x.fillRect(ix, iy, iw, ih * 0.16);
    x.restore();

    add(scene, 'boardframe', c);
    return { w: w, h: h };
  };

  /* Backdrop: baked at half resolution and stretched. */
  art.bakeBackdrop = function (scene, vat, w, h) {
    var bw = Math.max(64, Math.round(w / 2)), bh = Math.max(64, Math.round(h / 2));
    var c = cv(bw, bh), x = ctxOf(c);
    var g = x.createLinearGradient(0, 0, 0, bh);
    g.addColorStop(0, FZ.hex(vat.bgTop));
    g.addColorStop(0.55, FZ.hex(FZ.mix(vat.bgTop, vat.bgBot, 0.6)));
    g.addColorStop(1, FZ.hex(vat.bgBot));
    x.fillStyle = g;
    x.fillRect(0, 0, bw, bh);

    /* two soft glass highlights: the vat is a place, not a flat field */
    x.save();
    var rg = x.createRadialGradient(bw * 0.22, bh * 0.18, 0, bw * 0.22, bh * 0.18, bw * 0.7);
    rg.addColorStop(0, 'rgba(' + rgb(vat.fizz) + ',0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, bw, bh);
    rg = x.createRadialGradient(bw * 0.85, bh * 0.82, 0, bw * 0.85, bh * 0.82, bw * 0.8);
    rg.addColorStop(0, 'rgba(' + rgb(vat.frame) + ',0.14)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, bw, bh);
    x.restore();

    /* corner vignette */
    var vg = x.createRadialGradient(bw / 2, bh / 2, bw * 0.30, bw / 2, bh / 2, bw * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = vg;
    x.fillRect(0, 0, bw, bh);

    add(scene, 'backdrop', c);
  };

  /* --------------------------------------------------------- chrome */
  /* HUD plates, buttons, banner plate, medal discs, icons. Baked once. */
  art.bakeChrome = function (scene) {
    var c, x, g, i;

    /* HUD chip plate */
    c = cv(240, 72); x = ctxOf(c);
    g = x.createLinearGradient(0, 0, 0, 72);
    g.addColorStop(0, 'rgba(28,40,62,0.94)');
    g.addColorStop(1, 'rgba(16,24,40,0.94)');
    x.fillStyle = g;
    rr(x, 0, 0, 240, 72, 24); x.fill();
    x.strokeStyle = 'rgba(' + rgb(FZ.TOK.cellEdge) + ',0.75)';
    x.lineWidth = 2;
    rr(x, 1, 1, 238, 70, 24); x.stroke();
    add(scene, 'chip', c);

    /* warm chip: used when a meter turns urgent */
    c = cv(240, 72); x = ctxOf(c);
    g = x.createLinearGradient(0, 0, 0, 72);
    g.addColorStop(0, 'rgba(84,32,40,0.96)');
    g.addColorStop(1, 'rgba(48,16,22,0.96)');
    x.fillStyle = g;
    rr(x, 0, 0, 240, 72, 24); x.fill();
    x.strokeStyle = 'rgba(242,92,104,0.9)';
    x.lineWidth = 2.5;
    rr(x, 1.25, 1.25, 237.5, 69.5, 24); x.stroke();
    add(scene, 'chipHot', c);

    /* banner plate for run-boundary beats only */
    c = cv(640, 200); x = ctxOf(c);
    g = x.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, 'rgba(26,38,60,0.97)');
    g.addColorStop(1, 'rgba(12,18,32,0.97)');
    x.fillStyle = g;
    rr(x, 0, 0, 640, 200, 34); x.fill();
    x.strokeStyle = 'rgba(247,251,255,0.32)';
    x.lineWidth = 3;
    rr(x, 1.5, 1.5, 637, 197, 34); x.stroke();
    add(scene, 'banner', c);

    /* dim scrim for menus and run boundaries */
    c = cv(8, 8); x = ctxOf(c);
    x.fillStyle = 'rgba(6,10,18,0.86)';
    x.fillRect(0, 0, 8, 8);
    add(scene, 'scrim', c);

    /* solid white 1px, for cheap tinted bars (never a Graphics rect) */
    c = cv(8, 8); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.fillRect(0, 0, 8, 8);
    add(scene, 'white', c);

    /* buttons */
    [['btn', 'rgba(32,46,68,0.98)', 'rgba(93,114,148,0.9)'],
     ['btnPri', 'rgba(31,111,125,0.98)', 'rgba(127,214,230,0.95)'],
     ['btnLock', 'rgba(22,30,44,0.95)', 'rgba(60,74,94,0.7)']].forEach(function (b) {
      var cc2 = cv(320, 112), xx = ctxOf(cc2);
      var gg2 = xx.createLinearGradient(0, 0, 0, 112);
      gg2.addColorStop(0, b[1]);
      gg2.addColorStop(1, 'rgba(10,16,28,0.98)');
      xx.fillStyle = gg2;
      rr(xx, 0, 0, 320, 112, 28); xx.fill();
      xx.strokeStyle = b[2];
      xx.lineWidth = 3;
      rr(xx, 1.5, 1.5, 317, 109, 28); xx.stroke();
      xx.strokeStyle = 'rgba(255,255,255,0.22)';
      xx.lineWidth = 2;
      xx.beginPath(); xx.moveTo(24, 10); xx.lineTo(296, 10); xx.stroke();
      add(scene, b[0], cc2);
    });

    /* medal discs 1..3 plus an empty slot */
    for (i = 0; i <= 3; i++) {
      c = cv(96, 96); x = ctxOf(c);
      var col = FZ.MEDAL_COLORS[i] || FZ.MEDAL_COLORS[0];
      x.save();
      x.globalAlpha = 0.4; x.fillStyle = '#000';
      x.filter = 'blur(4px)';
      x.beginPath(); x.arc(48, 52, 32, 0, Math.PI * 2); x.fill();
      x.restore();
      g = x.createLinearGradient(0, 16, 0, 80);
      g.addColorStop(0, FZ.hex(FZ.shade(col, 0.4)));
      g.addColorStop(1, FZ.hex(FZ.shade(col, -0.3)));
      x.fillStyle = i === 0 ? 'rgba(36,52,83,0.9)' : g;
      x.beginPath(); x.arc(48, 48, 32, 0, Math.PI * 2); x.fill();
      x.strokeStyle = i === 0 ? 'rgba(93,114,148,0.8)' : FZ.hex(FZ.shade(col, -0.45));
      x.lineWidth = 4;
      x.beginPath(); x.arc(48, 48, 32, 0, Math.PI * 2); x.stroke();
      /* The medal's mark is the game's own goal object: a cap chevron. A
         crimped crown here read as a gear at 40px, so the disc stays smooth
         and the chevron carries the meaning. */
      x.fillStyle = i === 0 ? 'rgba(93,114,148,0.45)' : 'rgba(24,34,56,0.88)';
      x.beginPath();
      x.moveTo(48, 26);
      x.lineTo(68, 50); x.lineTo(56, 50);
      x.lineTo(56, 68); x.lineTo(40, 68);
      x.lineTo(40, 50); x.lineTo(28, 50);
      x.closePath(); x.fill();
      if (i > 0) {
        /* tier pips: gold 3, silver 2, bronze 1 - readable in grayscale */
        x.fillStyle = FZ.hex(FZ.shade(col, 0.6));
        x.strokeStyle = 'rgba(24,34,56,0.9)';
        x.lineWidth = 2;
        for (var p = 0; p < i; p++) {
          x.beginPath();
          x.arc(48 + (p - (i - 1) / 2) * 12, 79, 5, 0, Math.PI * 2);
          x.fill(); x.stroke();
        }
      }
      add(scene, 'medal' + i, c);
    }

    /* HUD icons: moves left is a SWAP glyph, never a circular arrow - the
       retry control already owns that shape */
    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    function hArrow(y, dir) {
      x.beginPath();
      x.moveTo(32 + dir * 26, y);
      x.lineTo(32 + dir * 8, y - 11);
      x.lineTo(32 + dir * 8, y - 4.5);
      x.lineTo(32 - dir * 24, y - 4.5);
      x.lineTo(32 - dir * 24, y + 4.5);
      x.lineTo(32 + dir * 8, y + 4.5);
      x.lineTo(32 + dir * 8, y + 11);
      x.closePath();
      x.fill();
    }
    hArrow(19, 1);
    hArrow(45, -1);
    add(scene, 'ic_move', c);

    /* cap goal: a crimped bottle cap with a solid core, few enough teeth to
       survive 20px without reading as a gear */
    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.beginPath();
    for (i = 0; i < 16; i++) {
      var aa = (i / 16) * Math.PI * 2;
      var rd = i % 2 === 0 ? 26 : 20;
      var qx = 32 + Math.cos(aa) * rd, qy = 32 + Math.sin(aa) * rd;
      if (i === 0) x.moveTo(qx, qy); else x.lineTo(qx, qy);
    }
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.62)';
    x.beginPath(); x.arc(32, 32, 14, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#FFFFFF';
    x.beginPath();
    x.moveTo(32, 21); x.lineTo(41, 32); x.lineTo(35.5, 32);
    x.lineTo(35.5, 42); x.lineTo(28.5, 42); x.lineTo(28.5, 32); x.lineTo(23, 32);
    x.closePath(); x.fill();
    add(scene, 'ic_cap', c);

    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    poly(x, 32, 32, 24, 6, 0, false); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(21, 32); x.lineTo(43, 32);
    x.moveTo(32, 21); x.lineTo(32, 43);
    x.stroke();
    add(scene, 'ic_seal', c);

    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.beginPath();
    for (i = 0; i < 10; i++) {
      var a3 = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      var r3 = i % 2 === 0 ? 25 : 11;
      var sx = 32 + Math.cos(a3) * r3, sy = 32 + Math.sin(a3) * r3;
      if (i === 0) x.moveTo(sx, sy); else x.lineTo(sx, sy);
    }
    x.closePath(); x.fill();
    add(scene, 'ic_score', c);

    /* speaker + gear + pause, all icon-only controls */
    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.beginPath();
    x.moveTo(14, 25); x.lineTo(24, 25); x.lineTo(36, 13); x.lineTo(36, 51); x.lineTo(24, 39); x.lineTo(14, 39);
    x.closePath(); x.fill();
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath(); x.arc(38, 32, 12, -0.9, 0.9); x.stroke();
    x.beginPath(); x.arc(38, 32, 19, -0.9, 0.9); x.stroke();
    add(scene, 'ic_sound', c);

    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    for (i = 0; i < 8; i++) {
      var ga = (i / 8) * Math.PI * 2;
      x.save();
      x.translate(32, 32); x.rotate(ga);
      x.fillRect(-5, -27, 10, 12);
      x.restore();
    }
    x.beginPath(); x.arc(32, 32, 17, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.75)';
    x.beginPath(); x.arc(32, 32, 8, 0, Math.PI * 2); x.fill();
    add(scene, 'ic_gear', c);

    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    rr(x, 17, 14, 11, 36, 4); x.fill();
    rr(x, 36, 14, 11, 36, 4); x.fill();
    add(scene, 'ic_pause', c);

    c = cv(64, 64); x = ctxOf(c);
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.arc(32, 34, 19, 0.6, Math.PI * 1.85); x.stroke();
    x.fillStyle = '#FFFFFF';
    x.beginPath(); x.moveTo(44, 4); x.lineTo(50, 24); x.lineTo(30, 20); x.closePath(); x.fill();
    add(scene, 'ic_retry', c);

    c = cv(64, 64); x = ctxOf(c);
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(40, 14); x.lineTo(22, 32); x.lineTo(40, 50); x.stroke();
    add(scene, 'ic_back', c);

    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    x.beginPath(); x.moveTo(20, 12); x.lineTo(48, 32); x.lineTo(20, 52); x.closePath(); x.fill();
    add(scene, 'ic_play', c);

    c = cv(64, 64); x = ctxOf(c);
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath(); x.arc(32, 32, 20, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(32, 20); x.lineTo(32, 20); x.stroke();
    x.fillStyle = '#FFFFFF';
    x.beginPath(); x.arc(32, 21, 4, 0, Math.PI * 2); x.fill();
    rr(x, 29, 28, 6, 18, 3); x.fill();
    add(scene, 'ic_info', c);

    /* lock glyph for the Seal Rush unlock chain */
    c = cv(64, 64); x = ctxOf(c);
    x.fillStyle = '#FFFFFF';
    rr(x, 16, 28, 32, 26, 6); x.fill();
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 6;
    x.beginPath(); x.arc(32, 28, 11, Math.PI, 0); x.stroke();
    add(scene, 'ic_lock', c);
  };

  /* One-shot bake of everything that never changes with layout or vat. */
  art.bakeStatic = function (scene) {
    for (var i = 0; i < FZ.FAMILIES.length; i++) bakeFamily(scene, i);
    bakeCap(scene);
    bakeSeal(scene, false);
    bakeSeal(scene, true);
    bakeSelector(scene);
    bakeGhost(scene);
    bakeArrows(scene);
    bakeParticles(scene);
    art.bakeChrome(scene);
  };

  art.bakeVat = function (scene, vat, w, h) {
    bakeFizz(scene, vat);
    art.bakeBackdrop(scene, vat, w, h);
  };

  art.textureForCell = function (cell) {
    if (!cell) return 'p0';
    if (cell.k === FZ.K.CAP) return 'cap';
    if (cell.k === FZ.K.SEAL) return cell.hp > 1 ? 'seal2' : 'seal1';
    var i = FZ.clamp(cell.col | 0, 0, FZ.FAMILIES.length - 1);
    if (cell.k === FZ.K.BOMB) return 'b' + i;
    if (cell.k === FZ.K.SURGE) return 's' + i;
    return 'p' + i;
  };

})(window.FZ);
