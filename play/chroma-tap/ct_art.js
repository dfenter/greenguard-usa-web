/* Chroma Tap - procedural art + audio bakery.
 *
 * Everything the game draws is baked ONCE into canvas textures here. No
 * Graphics object survives into the display list (defect class: Phaser
 * Graphics replays its whole command list every frame; a 200-cell static grid
 * cost 316ms/frame at 4x throttle). No arcs are walked at runtime either:
 * rings and discs are hand-tessellated into these textures.
 *
 * No file is fetched. All art is procedural; all audio is synthesised into
 * Local MP3 assets are handed to the GGKit audio buses.
 */
(function (g) {
  'use strict';

  var D = g.CTData;
  var T = D.TOKENS;
  var S = 96;              // baked tile texture size (2x of the 48px design cell)
  var DENSITY = g.GGKit && g.GGKit.hiDpi ? g.GGKit.hiDpi.factor(390, 800) : 1;

  /* ------------------------------------------------------------------ canvas utils */
  function mk(w, h) {
    if (g.GGKit && g.GGKit.hiDpi) return g.GGKit.hiDpi.canvas(w, h, DENSITY).canvas;
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function put(scene, key, canvas) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  }
  function rr(ctx, x, y, w, h, r) {
    var m = Math.min(w, h) / 2;
    if (r > m) r = m;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  /* Hand-tessellated circle: 28 segments is plenty at 96px and costs nothing
     at bake time, but it keeps ctx.arc out of every per-frame path. */
  function circle(ctx, cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i <= 28; i++) {
      var a = i / 28 * Math.PI * 2;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[0], pts[1]); else ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.closePath();
  }
  function star(ctx, cx, cy, points, ro, ri, rot) {
    ctx.beginPath();
    var n = points * 2;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (rot || 0);
      var r = (i % 2 === 0) ? ro : ri;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ tile bodies
   * Silhouette is the first leg of the triple-coding: every family has its own
   * outline, so the board survives a grayscale or deuteranopia pass.
   */
  function bodyPath(ctx, shape, x, y, w, h) {
    var r = w * 0.22;
    if (shape === 'round') { rr(ctx, x, y, w, h, r); return; }
    if (shape === 'squircle') { rr(ctx, x, y, w, h, w * 0.42); return; }
    if (shape === 'cut') {
      var c = w * 0.27;
      poly(ctx, [x + c, y, x + w - c, y, x + w, y + c, x + w, y + h - c,
        x + w - c, y + h, x + c, y + h, x, y + h - c, x, y + c]);
      return;
    }
    if (shape === 'hex') {
      var q = w * 0.5, hh = h * 0.26;
      poly(ctx, [x + q, y, x + w, y + hh, x + w, y + h - hh, x + q, y + h,
        x, y + h - hh, x, y + hh]);
      return;
    }
    if (shape === 'bevel') {
      var b = w * 0.3;
      poly(ctx, [x + w * 0.12, y, x + w - w * 0.12, y, x + w, y + w * 0.12,
        x + w, y + h - b, x + w - b, y + h, x + b, y + h, x, y + h - b, x, y + w * 0.12]);
      return;
    }
    /* notch: rounded body with a chunk taken out of the top edge */
    var n = w * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w * 0.5 - n, y);
    ctx.lineTo(x + w * 0.5, y + n * 0.8);
    ctx.lineTo(x + w * 0.5 + n, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function glyphPath(ctx, glyph, cx, cy, r) {
    if (glyph === 'circle') { circle(ctx, cx, cy, r * 0.78); return; }
    if (glyph === 'star4') { star(ctx, cx, cy, 4, r, r * 0.34, -Math.PI / 2); return; }
    if (glyph === 'star6') { star(ctx, cx, cy, 6, r, r * 0.5, -Math.PI / 2); return; }
    if (glyph === 'drop') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx + r * 0.95, cy + r * 0.15, cx + r * 0.52, cy + r * 0.62);
      ctx.quadraticCurveTo(cx, cy + r * 1.05, cx - r * 0.52, cy + r * 0.62);
      ctx.quadraticCurveTo(cx - r * 0.95, cy + r * 0.15, cx, cy - r);
      ctx.closePath();
      return;
    }
    if (glyph === 'leaf') {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy + r * 0.7);
      ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.8, cx + r * 0.8, cy - r * 0.75);
      ctx.quadraticCurveTo(cx + r * 0.85, cy + r * 0.85, cx - r * 0.8, cy + r * 0.7);
      ctx.closePath();
      return;
    }
    /* flame: a square-shouldered flame, per the lane bible's "square flame" */
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.62, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.8, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.8, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.62, cy - r * 0.2);
    ctx.closePath();
  }

  function drawTile(ctx, fam, opts) {
    var o = opts || {};
    var pad = 6, w = S - pad * 2, h = S - pad * 2;
    ctx.save();
    /* contact shadow */
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = T.shadow;
    bodyPath(ctx, fam.shape, pad + 2, pad + 6, w, h);
    ctx.fill();
    ctx.globalAlpha = 1;
    /* deep base (the visible bottom edge) */
    ctx.fillStyle = fam.deep;
    bodyPath(ctx, fam.shape, pad, pad + 4, w, h);
    ctx.fill();
    /* face */
    var grad = ctx.createLinearGradient(0, pad, 0, pad + h);
    grad.addColorStop(0, fam.edge);
    grad.addColorStop(0.42, fam.face);
    grad.addColorStop(1, fam.face);
    ctx.fillStyle = grad;
    bodyPath(ctx, fam.shape, pad, pad, w, h);
    ctx.fill();
    /* one-pixel highlight edge */
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.5;
    bodyPath(ctx, fam.shape, pad + 2, pad + 2, w - 4, h - 4);
    ctx.stroke();
    /* outline */
    ctx.strokeStyle = fam.deep;
    ctx.lineWidth = 3;
    bodyPath(ctx, fam.shape, pad, pad, w, h);
    ctx.stroke();
    /* glyph, always Ink: every face clears 4.5:1 against Ink */
    ctx.fillStyle = T.ink;
    glyphPath(ctx, fam.glyph, S / 2, S / 2 + (o.glyphDy || 0), o.glyphR || S * 0.235);
    ctx.fill();
    ctx.restore();
  }

  /* Special pieces are broader, brighter and carry an enamel plate, per the
     lane bible's "special pieces must be unmistakable" rule. */
  function drawSpecialPlate(ctx, kind, rot) {
    ctx.save();
    ctx.translate(S / 2, S / 2);
    if (rot) ctx.rotate(Math.PI / 2);
    ctx.translate(-S / 2, -S / 2);
    if (kind === 'rocket') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      poly(ctx, [S * 0.16, S * 0.5, S * 0.42, S * 0.3, S * 0.72, S * 0.34,
        S * 0.86, S * 0.5, S * 0.72, S * 0.66, S * 0.42, S * 0.7]);
      ctx.fill();
      ctx.fillStyle = T.ink;
      poly(ctx, [S * 0.2, S * 0.5, S * 0.4, S * 0.4, S * 0.4, S * 0.6]);
      ctx.fill();
      ctx.fillStyle = T.ink;
      ctx.fillRect(S * 0.5, S * 0.44, S * 0.28, S * 0.12);
    } else if (kind === 'bomb') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      circle(ctx, S / 2, S * 0.54, S * 0.27);
      ctx.fill();
      ctx.fillStyle = T.ink;
      circle(ctx, S / 2, S * 0.54, S * 0.16);
      ctx.fill();
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(S * 0.56, S * 0.28);
      ctx.quadraticCurveTo(S * 0.72, S * 0.18, S * 0.78, S * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function bakeTiles(scene) {
    var i, c, ctx;
    for (i = 0; i < D.FAMILIES.length; i++) {
      var fam = D.FAMILIES[i];
      c = mk(S, S); ctx = c.getContext('2d');
      drawTile(ctx, fam, null);
      put(scene, 'tile' + i, c);

      c = mk(S, S); ctx = c.getContext('2d');
      drawTile(ctx, fam, { glyphR: S * 0.14, glyphDy: S * 0.3 });
      drawSpecialPlate(ctx, 'rocket', 0);
      put(scene, 'sp1h' + i, c);

      c = mk(S, S); ctx = c.getContext('2d');
      drawTile(ctx, fam, { glyphR: S * 0.14, glyphDy: S * 0.3 });
      drawSpecialPlate(ctx, 'rocket', 1);
      put(scene, 'sp1v' + i, c);

      c = mk(S, S); ctx = c.getContext('2d');
      drawTile(ctx, fam, { glyphR: S * 0.14, glyphDy: S * 0.32 });
      drawSpecialPlate(ctx, 'bomb', 0);
      put(scene, 'sp2' + i, c);
    }

    /* Disco orb: glass sphere carrying every family accent, so it reads as
       "all colours" without depending on hue alone (it has its own silhouette). */
    c = mk(S, S); ctx = c.getContext('2d');
    ctx.globalAlpha = 0.35; ctx.fillStyle = T.shadow;
    circle(ctx, S / 2 + 2, S / 2 + 6, S * 0.4); ctx.fill();
    ctx.globalAlpha = 1;
    var seg = D.FAMILIES.length;
    for (i = 0; i < seg; i++) {
      ctx.fillStyle = D.FAMILIES[i].face;
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      var a0 = (i / seg) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / seg) * Math.PI * 2 - Math.PI / 2;
      for (var k = 0; k <= 6; k++) {
        var a = a0 + (a1 - a0) * (k / 6);
        ctx.lineTo(S / 2 + Math.cos(a) * S * 0.4, S / 2 + Math.sin(a) * S * 0.4);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = T.ink; ctx.lineWidth = 4;
    circle(ctx, S / 2, S / 2, S * 0.4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    circle(ctx, S / 2, S / 2, S * 0.15); ctx.fill();
    ctx.fillStyle = T.ink;
    star(ctx, S / 2, S / 2, 6, S * 0.12, S * 0.05, -Math.PI / 2); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    circle(ctx, S * 0.36, S * 0.34, S * 0.09); ctx.fill();
    put(scene, 'sp3', c);
  }

  /* ------------------------------------------------------------------ goal objects */
  function bakeObjects(scene) {
    var c, ctx, i;
    /* Crates, three crack states. The crack pattern is the state cue; the
       colour barely shifts, so it survives a colourblind pass. */
    for (i = 0; i < 3; i++) {
      c = mk(S, S); ctx = c.getContext('2d');
      ctx.globalAlpha = 0.35; ctx.fillStyle = T.shadow;
      rr(ctx, 10, 14, S - 20, S - 20, 8); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#5E3F22';
      rr(ctx, 8, 10, S - 16, S - 16, 8); ctx.fill();
      ctx.fillStyle = i === 0 ? '#A9763F' : (i === 1 ? '#9A6A38' : '#8A5E31');
      rr(ctx, 8, 8, S - 16, S - 16, 8); ctx.fill();
      ctx.strokeStyle = '#4A3018'; ctx.lineWidth = 5;
      rr(ctx, 8, 8, S - 16, S - 16, 8); ctx.stroke();
      /* plank battens */
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(14, 22); ctx.lineTo(S - 14, 22);
      ctx.moveTo(14, S - 22); ctx.lineTo(S - 14, S - 22);
      ctx.stroke();
      ctx.strokeStyle = '#4A3018'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(14, 14); ctx.lineTo(S - 14, S - 14);
      ctx.moveTo(S - 14, 14); ctx.lineTo(14, S - 14);
      ctx.stroke();
      if (i > 0) {
        ctx.strokeStyle = '#241505'; ctx.lineWidth = i === 1 ? 5 : 7;
        ctx.beginPath();
        ctx.moveTo(S * 0.3, 12); ctx.lineTo(S * 0.42, S * 0.42);
        ctx.lineTo(S * 0.26, S * 0.6); ctx.lineTo(S * 0.4, S - 12);
        ctx.stroke();
        if (i > 1) {
          ctx.beginPath();
          ctx.moveTo(S - 12, S * 0.3); ctx.lineTo(S * 0.6, S * 0.46);
          ctx.lineTo(S * 0.78, S * 0.64); ctx.lineTo(S * 0.58, S - 12);
          ctx.stroke();
        }
      }
      put(scene, 'crate' + i, c);
    }

    /* Balloon */
    c = mk(S, S); ctx = c.getContext('2d');
    ctx.strokeStyle = '#2b3550'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.74); ctx.lineTo(S / 2, S * 0.94); ctx.stroke();
    ctx.globalAlpha = 0.3; ctx.fillStyle = T.shadow;
    circle(ctx, S / 2 + 3, S * 0.46 + 5, S * 0.33); ctx.fill();
    ctx.globalAlpha = 1;
    var bg2 = ctx.createLinearGradient(0, S * 0.14, 0, S * 0.78);
    bg2.addColorStop(0, '#FFD9E4'); bg2.addColorStop(0.5, '#F06292'); bg2.addColorStop(1, '#B03863');
    ctx.fillStyle = bg2;
    circle(ctx, S / 2, S * 0.46, S * 0.33); ctx.fill();
    ctx.strokeStyle = '#7C2444'; ctx.lineWidth = 4;
    circle(ctx, S / 2, S * 0.46, S * 0.33); ctx.stroke();
    ctx.fillStyle = '#7C2444';
    poly(ctx, [S / 2 - 7, S * 0.76, S / 2 + 7, S * 0.76, S / 2, S * 0.86]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    circle(ctx, S * 0.4, S * 0.34, S * 0.075); ctx.fill();
    /* up-chevron: the balloon's own "I rise" mark */
    ctx.strokeStyle = T.ink; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(S * 0.38, S * 0.52); ctx.lineTo(S / 2, S * 0.4); ctx.lineTo(S * 0.62, S * 0.52);
    ctx.stroke();
    ctx.lineCap = 'butt';
    put(scene, 'balloon', c);

    /* Gear */
    c = mk(S, S); ctx = c.getContext('2d');
    ctx.globalAlpha = 0.3; ctx.fillStyle = T.shadow;
    circle(ctx, S / 2 + 2, S / 2 + 6, S * 0.38); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8B93A6';
    var teeth = 9;
    ctx.beginPath();
    for (i = 0; i <= teeth * 4; i++) {
      var t = i / (teeth * 4) * Math.PI * 2 - Math.PI / 2;
      var rr2 = (Math.floor(i / 2) % 2 === 0) ? S * 0.4 : S * 0.31;
      var px = S / 2 + Math.cos(t) * rr2, py = S / 2 + Math.sin(t) * rr2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3F4756'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#5C6577';
    circle(ctx, S / 2, S / 2, S * 0.2); ctx.fill();
    ctx.fillStyle = T.ink;
    circle(ctx, S / 2, S / 2, S * 0.11); ctx.fill();
    /* down-chevron: the gear's own "I sink" mark */
    ctx.strokeStyle = '#22293a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(S * 0.36, S * 0.62); ctx.lineTo(S / 2, S * 0.74); ctx.lineTo(S * 0.64, S * 0.62);
    ctx.stroke();
    ctx.lineCap = 'butt';
    put(scene, 'gear', c);
  }

  /* ------------------------------------------------------------------ overlays */
  function bakeOverlays(scene) {
    var c, ctx;

    /* Selection ring: white, tinted at runtime. Baked, never an arc per frame. */
    c = mk(S, S); ctx = c.getContext('2d');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    rr(ctx, 8, 8, S - 16, S - 16, 20); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 14;
    rr(ctx, 8, 8, S - 16, S - 16, 20); ctx.stroke();
    put(scene, 'ring', c);

    /* Telegraph cell: corner ticks + a soft fill. Reads as "this will be hit"
       without hiding what is underneath. */
    c = mk(S, S); ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    rr(ctx, 6, 6, S - 12, S - 12, 18); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    var k = 22;
    ctx.beginPath();
    ctx.moveTo(12, 12 + k); ctx.lineTo(12, 12); ctx.lineTo(12 + k, 12);
    ctx.moveTo(S - 12 - k, 12); ctx.lineTo(S - 12, 12); ctx.lineTo(S - 12, 12 + k);
    ctx.moveTo(S - 12, S - 12 - k); ctx.lineTo(S - 12, S - 12); ctx.lineTo(S - 12 - k, S - 12);
    ctx.moveTo(12 + k, S - 12); ctx.lineTo(12, S - 12); ctx.lineTo(12, S - 12 - k);
    ctx.stroke();
    ctx.lineCap = 'butt';
    put(scene, 'tcell', c);

    /* Particles: fragment, spark, streak. Tinted per family at spawn. */
    c = mk(24, 24); ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; rr(ctx, 2, 2, 20, 20, 6); ctx.fill();
    put(scene, 'p_frag', c);

    c = mk(28, 28); ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; star(ctx, 14, 14, 4, 13, 4, -Math.PI / 2); ctx.fill();
    put(scene, 'p_spark', c);

    c = mk(40, 12); ctx = c.getContext('2d');
    var lg = ctx.createLinearGradient(0, 0, 40, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, '#ffffff');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg; rr(ctx, 0, 2, 40, 8, 4); ctx.fill();
    put(scene, 'p_streak', c);

    /* Medal discs */
    var med = [['bronze', '#C98A55', '#7A4C25'], ['silver', '#CBD5E1', '#7A8798'], ['gold', '#F7C948', '#A87C14']];
    for (var mi = 0; mi < med.length; mi++) {
      c = mk(64, 64); ctx = c.getContext('2d');
      ctx.fillStyle = med[mi][2]; circle(ctx, 32, 34, 26); ctx.fill();
      ctx.fillStyle = med[mi][1]; circle(ctx, 32, 32, 26); ctx.fill();
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3; circle(ctx, 32, 32, 26); ctx.stroke();
      ctx.fillStyle = T.ink; star(ctx, 32, 32, 5, 14, 6, -Math.PI / 2); ctx.fill();
      put(scene, 'medal_' + med[mi][0], c);
    }
    /* Empty medal slot */
    c = mk(64, 64); ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3;
    circle(ctx, 32, 32, 26); ctx.stroke();
    put(scene, 'medal_none', c);

    /* Lock badge for gated packs */
    c = mk(48, 48); ctx = c.getContext('2d');
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(16, 22); ctx.lineTo(16, 16);
    ctx.quadraticCurveTo(24, 6, 32, 16); ctx.lineTo(32, 22);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1'; rr(ctx, 11, 21, 26, 21, 5); ctx.fill();
    ctx.fillStyle = T.ink; circle(ctx, 24, 31, 4); ctx.fill();
    put(scene, 'lock', c);

    /* Soft panel: one baked rounded card, drawn as a nine-slice so the corner
       radius stays constant at every HUD size (a stretched card turned the
       result banner into an oval blob). Corner slice is 16, so the 14px radius
       lives entirely inside the corner patches. */
    c = mk(64, 64); ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; rr(ctx, 0, 0, 64, 64, 14); ctx.fill();
    put(scene, 'panel', c);

    /* Hairline divider */
    c = mk(8, 8); ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 8, 8);
    put(scene, 'px', c);
  }

  /* ------------------------------------------------------------------ board chrome
   * The frame, the cell field and the next-spawn dock are one static texture.
   * Nothing here is redrawn during play.
   */
  function bakeBoard(scene, key, packDef, geom) {
    var pk = packDef || D.PACKS[0];
    var cols = geom.cols, rows = geom.rows, cell = geom.cell, pad = geom.pad;
    var w = cols * cell + pad * 2, h = rows * cell + pad * 2;
    var c = mk(Math.ceil(w), Math.ceil(h)), ctx = c.getContext('2d');
    var colTop = (pk.colTop && pk.colTop.length === cols) ? pk.colTop : [0, 0, 0, 0, 0, 0, 0];

    /* frame body */
    ctx.fillStyle = pk.frame;
    rr(ctx, 0, 0, w, h, 16); ctx.fill();
    ctx.strokeStyle = pk.frameEdge; ctx.lineWidth = 3;
    rr(ctx, 1.5, 1.5, w - 3, h - 3, 15); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    rr(ctx, 4, 4, w - 8, h - 8, 13); ctx.stroke();

    /* inner field */
    ctx.fillStyle = pk.field;
    rr(ctx, pad - 5, pad - 5, cols * cell + 10, rows * cell + 10, 11); ctx.fill();

    /* cells */
    for (var x = 0; x < cols; x++) {
      for (var y = 0; y < rows; y++) {
        var px = pad + x * cell, py = pad + y * cell;
        if (y < colTop[x]) continue;
        ctx.fillStyle = T.cell;
        rr(ctx, px + 2, py + 2, cell - 4, cell - 4, 8); ctx.fill();
        ctx.strokeStyle = T.cellEdge; ctx.lineWidth = 1;
        rr(ctx, px + 2.5, py + 2.5, cell - 5, cell - 5, 8); ctx.stroke();
      }
    }
    /* quiet corner vignette so the field reads as an object, not a rectangle */
    var vg = ctx.createLinearGradient(0, pad, 0, pad + rows * cell);
    vg.addColorStop(0, 'rgba(0,0,0,0.18)');
    vg.addColorStop(0.4, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = vg;
    rr(ctx, pad - 5, pad - 5, cols * cell + 10, rows * cell + 10, 11); ctx.fill();

    put(scene, key, c);
    return { w: w, h: h };
  }

  /* ------------------------------------------------------------------ icons
   * Small goal / HUD icons, baked at 48px.
   */
  function bakeIcons(scene) {
    var c, ctx;
    function iconCanvas() { var cc = mk(48, 48); return [cc, cc.getContext('2d')]; }

    /* moves icon: a tap ripple */
    var a = iconCanvas(); c = a[0]; ctx = a[1];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    circle(ctx, 24, 26, 15); ctx.stroke();
    ctx.globalAlpha = 0.5; circle(ctx, 24, 26, 21); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff'; circle(ctx, 24, 26, 7); ctx.fill();
    put(scene, 'ic_moves', c);

    /* score icon: chevrons */
    a = iconCanvas(); c = a[0]; ctx = a[1];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 30); ctx.lineTo(24, 18); ctx.lineTo(36, 30);
    ctx.moveTo(12, 40); ctx.lineTo(24, 28); ctx.lineTo(36, 40);
    ctx.stroke(); ctx.lineCap = 'butt';
    put(scene, 'ic_score', c);

    /* hint icon */
    a = iconCanvas(); c = a[0]; ctx = a[1];
    ctx.fillStyle = '#ffffff'; circle(ctx, 24, 20, 12); ctx.fill();
    ctx.fillRect(18, 30, 12, 8);
    ctx.fillRect(20, 40, 8, 4);
    put(scene, 'ic_hint', c);

    /* pause icon */
    a = iconCanvas(); c = a[0]; ctx = a[1];
    ctx.fillStyle = '#ffffff';
    rr(ctx, 14, 12, 7, 24, 3); ctx.fill();
    rr(ctx, 27, 12, 7, 24, 3); ctx.fill();
    put(scene, 'ic_pause', c);

    /* back / levels icon */
    a = iconCanvas(); c = a[0]; ctx = a[1];
    ctx.fillStyle = '#ffffff';
    rr(ctx, 10, 10, 12, 12, 3); ctx.fill();
    rr(ctx, 26, 10, 12, 12, 3); ctx.fill();
    rr(ctx, 10, 26, 12, 12, 3); ctx.fill();
    rr(ctx, 26, 26, 12, 12, 3); ctx.fill();
    put(scene, 'ic_grid', c);

    /* restart icon: hand-tessellated open ring with an arrow head */
    a = iconCanvas(); c = a[0]; ctx = a[1];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
    ctx.beginPath();
    for (var i = 0; i <= 24; i++) {
      var ang = -Math.PI * 0.35 + (i / 24) * Math.PI * 1.7;
      var px = 24 + Math.cos(ang) * 14, py = 24 + Math.sin(ang) * 14;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    poly(ctx, [34, 4, 44, 14, 30, 16]); ctx.fill();
    put(scene, 'ic_restart', c);
  }

  /* ------------------------------------------------------------------ audio
   * Audio is kept as local MP3 assets so the browser and the service worker
   * never synthesize a non-brief format at runtime. */
  function legacyAudioData() { return ''; }

  var RATE = 22050;
  function buf(sec) { return new Float32Array(Math.max(1, Math.floor(RATE * sec))); }
  function addTone(b, t0, dur, f0, f1, amp, shape, decay) {
    var i0 = Math.floor(t0 * RATE), n = Math.floor(dur * RATE), ph = 0;
    for (var i = 0; i < n; i++) {
      var k = i0 + i;
      if (k >= b.length) break;
      var t = i / n;
      var f = f0 + (f1 - f0) * t;
      ph += (2 * Math.PI * f) / RATE;
      var s;
      if (shape === 'square') s = Math.sin(ph) >= 0 ? 1 : -1;
      else if (shape === 'saw') s = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
      else if (shape === 'tri') s = Math.abs((((ph / (2 * Math.PI)) % 1) * 4) - 2) - 1;
      else s = Math.sin(ph);
      var env = Math.pow(1 - t, decay == null ? 2.2 : decay);
      var atk = Math.min(1, t * 40);
      b[k] += s * amp * env * atk;
    }
  }
  function addNoise(b, t0, dur, amp, tilt) {
    var i0 = Math.floor(t0 * RATE), n = Math.floor(dur * RATE), last = 0;
    for (var i = 0; i < n; i++) {
      var k = i0 + i;
      if (k >= b.length) break;
      var w = (((i * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
      last = last + (w - last) * (tilt == null ? 0.5 : tilt);
      b[k] += last * amp * Math.pow(1 - i / n, 2.4);
    }
  }

  function legacySfxSources() {
    var out = {}, b;

    b = buf(0.13); addTone(b, 0, 0.1, 520, 880, 0.34, 'tri', 2.6); addNoise(b, 0, 0.05, 0.09, 0.8);
    out.tap = legacyAudioData(b, RATE);

    b = buf(0.2); addTone(b, 0, 0.16, 660, 1180, 0.3, 'sine', 2.0); addTone(b, 0.02, 0.14, 990, 1560, 0.16, 'sine', 2.2);
    out.cascade = legacyAudioData(b, RATE);

    b = buf(0.34);
    addTone(b, 0, 0.3, 300, 1200, 0.26, 'tri', 1.4);
    addTone(b, 0.06, 0.26, 600, 1800, 0.16, 'sine', 1.6);
    addNoise(b, 0.18, 0.12, 0.1, 0.9);
    out.charge = legacyAudioData(b, RATE);

    b = buf(0.62);
    var chord = [392, 494, 587, 784];
    for (var ci = 0; ci < chord.length; ci++) addTone(b, ci * 0.045, 0.5, chord[ci], chord[ci] * 1.01, 0.2, 'tri', 1.9);
    addNoise(b, 0, 0.3, 0.12, 0.35);
    out.combo = legacyAudioData(b, RATE);

    b = buf(0.3); addTone(b, 0, 0.26, 880, 1320, 0.26, 'sine', 1.8); addTone(b, 0.09, 0.2, 1320, 1760, 0.16, 'sine', 2.0);
    out.goal = legacyAudioData(b, RATE);

    b = buf(0.36); addTone(b, 0, 0.3, 330, 660, 0.24, 'tri', 1.6); addTone(b, 0.1, 0.24, 660, 990, 0.18, 'sine', 1.8);
    out.rescue = legacyAudioData(b, RATE);

    b = buf(1.25);
    var mel = [523, 659, 784, 1046, 1318];
    for (var mi = 0; mi < mel.length; mi++) addTone(b, mi * 0.13, 0.42, mel[mi], mel[mi], 0.2, 'tri', 2.2);
    addTone(b, 0.65, 0.55, 261, 261, 0.14, 'sine', 1.6);
    addNoise(b, 0.62, 0.4, 0.07, 0.25);
    out.win = legacyAudioData(b, RATE);

    b = buf(0.9);
    var dn = [440, 370, 294, 220];
    for (var di = 0; di < dn.length; di++) addTone(b, di * 0.14, 0.34, dn[di], dn[di] * 0.96, 0.18, 'tri', 2.0);
    out.lose = legacyAudioData(b, RATE);

    b = buf(0.09); addTone(b, 0, 0.07, 740, 980, 0.22, 'square', 3.0);
    out.ui = legacyAudioData(b, RATE);

    b = buf(0.22); addTone(b, 0, 0.2, 200, 130, 0.22, 'saw', 2.4);
    out.invalid = legacyAudioData(b, RATE);

    b = buf(0.4); addNoise(b, 0, 0.36, 0.24, 0.22); addTone(b, 0, 0.3, 150, 60, 0.2, 'saw', 1.7);
    out.blast = legacyAudioData(b, RATE);

    b = buf(0.3); addTone(b, 0, 0.26, 240, 180, 0.22, 'square', 2.0); addNoise(b, 0, 0.12, 0.12, 0.3);
    out.clunk = legacyAudioData(b, RATE);

    return out;
  }

  /* Two music states: a calm board loop and a brighter menu/resolve loop. */
  function legacyMusicSources() {
    var out = {};
    var bars, i, step;

    var b = buf(8.0);
    var bassSeq = [98, 98, 131, 110, 98, 98, 147, 110];
    var padSeq = [392, 440, 523, 494];
    for (i = 0; i < 8; i++) {
      addTone(b, i * 1.0, 0.9, bassSeq[i], bassSeq[i], 0.13, 'tri', 1.1);
    }
    for (i = 0; i < 4; i++) {
      addTone(b, i * 2.0, 1.9, padSeq[i], padSeq[i], 0.055, 'sine', 0.7);
      addTone(b, i * 2.0, 1.9, padSeq[i] * 1.5, padSeq[i] * 1.5, 0.035, 'sine', 0.7);
    }
    var arp = [784, 659, 587, 659, 880, 784, 659, 587];
    for (i = 0; i < 16; i++) {
      step = arp[i % arp.length];
      addTone(b, i * 0.5, 0.34, step, step, 0.045, 'tri', 2.0);
    }
    out.m_board = legacyAudioData(b, RATE);

    b = buf(6.0);
    var mBass = [131, 131, 175, 147, 131, 165];
    for (i = 0; i < 6; i++) addTone(b, i * 1.0, 0.85, mBass[i], mBass[i], 0.12, 'tri', 1.0);
    var mel2 = [523, 659, 784, 880, 784, 659, 587, 523, 587, 659, 784, 659];
    for (i = 0; i < 12; i++) {
      addTone(b, i * 0.5, 0.42, mel2[i], mel2[i], 0.07, 'sine', 1.6);
    }
    for (i = 0; i < 3; i++) addTone(b, i * 2.0, 1.8, 392, 392, 0.04, 'sine', 0.6);
    out.m_menu = legacyAudioData(b, RATE);

    return out;
  }

  function audioAsset(name) {
    return '/play/chroma-tap/assets/' + name + '.mp3';
  }
  function sfxSources() {
    var names = ['tap', 'cascade', 'charge', 'combo', 'goal', 'rescue', 'win',
      'lose', 'ui', 'invalid', 'blast', 'clunk'], out = {};
    for (var i = 0; i < names.length; i++) out[names[i]] = audioAsset(names[i]);
    return out;
  }
  function musicSources() {
    return { m_board: audioAsset('m_board'), m_menu: audioAsset('m_menu') };
  }

  g.CTArt = {
    S: S,
    density: DENSITY,
    bakeAll: function (scene) {
      bakeTiles(scene);
      bakeObjects(scene);
      bakeOverlays(scene);
      bakeIcons(scene);
    },
    bakeBoard: bakeBoard,
    sfxSources: sfxSources,
    musicSources: musicSources
  };
})(typeof window !== 'undefined' ? window : globalThis);
