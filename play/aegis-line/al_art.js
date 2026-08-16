/* Aegis Line - al_art.js
 * Every pixel in this game is drawn here, once, into canvas textures during
 * the loading screen. Nothing in this file runs during gameplay.
 *
 * Why canvas bakes instead of live vector drawing: Phaser Graphics replays
 * its whole command list every frame, and Graphics.arc walks a sweep in 0.01
 * radian steps. A backdrop or a HUD plate drawn that way costs hundreds of
 * milliseconds per frame on a throttled phone. Here the same art is
 * rasterised once and drawn as flat quads forever after.
 *
 * Produces:
 *   atlas          one packed texture with every sprite, prop, HUD part and
 *                  particle the game uses
 *   sky_<ch>       vertical gradient strip per chapter
 *   far_<ch>       far silhouette band, hazed toward the fog colour
 *   mid_<ch>       mid structures carrying the chapter light treatment
 *   near_<ch>      foreground ground band
 *   glow_<ch>      signature light wash, additive
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- utils
  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function hex(n) {
    var s = (n & 0xffffff).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }
  function rgba(n, a) {
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
  }
  function shade(c, t) { return t < 0 ? mix(c, 0x000000, -t) : mix(c, 0xffffff, t); }
  function rr(ctx, x, y, w, h, r) {
    var m = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + m, y);
    ctx.lineTo(x + w - m, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + m);
    ctx.lineTo(x + w, y + h - m);
    ctx.quadraticCurveTo(x + w, y + h, x + w - m, y + h);
    ctx.lineTo(x + m, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - m);
    ctx.lineTo(x, y + m);
    ctx.quadraticCurveTo(x, y, x + m, y);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function vgrad(ctx, x, y, w, h, stops) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  function radial(ctx, x, y, r, stops) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.01, r));
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // Deterministic noise so every bake is reproducible frame to frame.
  function rngFrom(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function speckle(ctx, x, y, w, h, count, color, seed, maxA, maxR) {
    var rnd = rngFrom(seed);
    for (var i = 0; i < count; i++) {
      var px = x + rnd() * w, py = y + rnd() * h;
      var r = 0.4 + rnd() * (maxR || 1.2);
      ctx.fillStyle = rgba(color, 0.05 + rnd() * (maxA || 0.25));
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------- packer
  // Shelf packer. Two passes: measure every frame, then draw into a canvas
  // cut to the exact height so no VRAM is wasted on empty rows.
  function pack(items, width, pad) {
    var x = 0, y = 0, rowH = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (x + it.w + pad > width) { x = 0; y += rowH + pad; rowH = 0; }
      it.x = x; it.y = y;
      x += it.w + pad;
      if (it.h > rowH) rowH = it.h;
    }
    return y + rowH + pad;
  }

  // ==================================================== operator sprites
  // Squad members are seen from behind the cover line: back, shoulders,
  // helmet, pack and the weapon silhouette of their class. Five poses give
  // the player entity its animation states.
  var OP_W = 52, OP_H = 66;

  function drawWeapon(ctx, cls, x, y, ang, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    var body = shade(col, -0.62), edge = shade(col, 0.25);
    ctx.fillStyle = body;
    if (cls === 'SR') {
      rr(ctx, -3, -2.5, 30, 5, 1.6); ctx.fill();
      ctx.fillStyle = edge; ctx.fillRect(16, -1, 12, 1.4);
      ctx.fillStyle = rgba(0x9fe8ff, 0.9); ctx.fillRect(26, -1.2, 4, 2.4);
      ctx.fillStyle = body; rr(ctx, 2, -6, 9, 3.5, 1.4); ctx.fill();
    } else if (cls === 'SG') {
      rr(ctx, -4, -3.5, 22, 7, 2); ctx.fill();
      ctx.fillStyle = edge; ctx.fillRect(10, -2.5, 9, 1.6);
      ctx.fillStyle = shade(col, -0.35); rr(ctx, 1, 2, 10, 3, 1.2); ctx.fill();
    } else if (cls === 'MG') {
      rr(ctx, -5, -3.5, 26, 7, 2); ctx.fill();
      ctx.fillStyle = edge; ctx.fillRect(14, -1.6, 10, 1.5);
      ctx.fillStyle = shade(col, -0.3); rr(ctx, -3, 2, 9, 6, 2); ctx.fill();
      ctx.fillStyle = rgba(0xffe9b0, 0.5); ctx.fillRect(-1, 3, 5, 1.2);
    } else if (cls === 'RL') {
      rr(ctx, -6, -4.5, 27, 9, 4); ctx.fill();
      ctx.fillStyle = edge; rr(ctx, 17, -3.5, 7, 7, 3); ctx.fill();
      ctx.fillStyle = rgba(0xff9a5c, 0.8); ctx.beginPath(); ctx.arc(-6, 0, 3, 0, TAU); ctx.fill();
    } else if (cls === 'GL') {
      rr(ctx, -4, -4, 20, 8, 3); ctx.fill();
      ctx.fillStyle = edge; rr(ctx, 13, -3, 8, 6, 3); ctx.fill();
      ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.arc(2, 3, 4, 0, TAU); ctx.fill();
    } else if (cls === 'DMR') {
      rr(ctx, -3, -2.6, 26, 5.2, 1.6); ctx.fill();
      ctx.fillStyle = edge; ctx.fillRect(14, -1.2, 11, 1.6);
      ctx.fillStyle = rgba(0xd8f4ff, 0.75); rr(ctx, 3, -6, 8, 3, 1.4); ctx.fill();
    } else if (cls === 'SMG') {
      rr(ctx, -3, -3, 17, 6, 2); ctx.fill();
      ctx.fillStyle = edge; ctx.fillRect(9, -1.4, 7, 1.4);
      ctx.fillStyle = shade(col, -0.35); rr(ctx, 0, 2, 4, 7, 1.6); ctx.fill();
    } else {
      rr(ctx, -4, -3, 24, 6, 2); ctx.fill();
      ctx.fillStyle = edge; ctx.fillRect(13, -1.4, 9, 1.5);
      ctx.fillStyle = shade(col, -0.35); rr(ctx, 1, 2, 5, 8, 1.6); ctx.fill();
    }
    ctx.restore();
  }

  function drawOperator(ctx, u, pose) {
    var cx = OP_W / 2;
    var base = OP_H - 4;
    var col = u.color, alt = u.alt, hair = u.hair;
    var stand = 0, lean = 0, gunAng = 0, gunY = 0, gunX = 0;
    if (pose === 'duck') { stand = 20; lean = 0.12; gunAng = 0.9; gunY = 4; gunX = -2; }
    else if (pose === 'rise') { stand = 0; lean = 0; gunAng = 0.12; gunY = 0; gunX = 0; }
    else if (pose === 'fire') { stand = 1; lean = -0.06; gunAng = -0.04; gunY = -1; gunX = 2; }
    else if (pose === 'reload') { stand = 5; lean = 0.08; gunAng = 0.55; gunY = 2; gunX = -3; }
    else { stand = 6; lean = 0.16; gunAng = 0.35; gunY = 3; gunX = -4; } // hit

    var top = 12 + stand;
    ctx.save();
    ctx.translate(cx, base);
    ctx.rotate(lean * 0.35);
    ctx.translate(-cx, -base);

    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, base + 1, 15, 4.2, 0, 0, TAU);
    ctx.fill();

    // pack
    ctx.fillStyle = shade(col, -0.68);
    rr(ctx, cx - 12, top + 12, 24, 22, 7); ctx.fill();

    // torso
    var g = ctx.createLinearGradient(cx - 12, top, cx + 12, base);
    g.addColorStop(0, hex(shade(col, -0.1)));
    g.addColorStop(0.55, hex(shade(col, -0.42)));
    g.addColorStop(1, hex(shade(col, -0.66)));
    ctx.fillStyle = g;
    poly(ctx, [[cx - 13, top + 10], [cx + 13, top + 10], [cx + 11, base - 16], [cx - 11, base - 16]]);
    ctx.fill();

    // legs
    ctx.fillStyle = shade(col, -0.74);
    rr(ctx, cx - 10, base - 18, 8, 18, 3); ctx.fill();
    rr(ctx, cx + 2, base - 18, 8, 18, 3); ctx.fill();
    ctx.fillStyle = shade(col, -0.85);
    rr(ctx, cx - 11, base - 4, 10, 4, 2); ctx.fill();
    rr(ctx, cx + 1, base - 4, 10, 4, 2); ctx.fill();

    // shoulder rim light: the whole roster reads by its rim colour
    ctx.strokeStyle = rgba(alt, pose === 'fire' ? 0.95 : 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 13, top + 12);
    ctx.quadraticCurveTo(cx, top + 4, cx + 13, top + 12);
    ctx.stroke();

    // harness stripes
    ctx.strokeStyle = rgba(alt, 0.42);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 9, top + 16); ctx.lineTo(cx + 6, base - 20);
    ctx.moveTo(cx + 9, top + 16); ctx.lineTo(cx - 6, base - 20);
    ctx.stroke();

    // head and helmet
    var hy = top + 4;
    ctx.fillStyle = hex(shade(hair, 0.05));
    ctx.beginPath();
    ctx.arc(cx, hy, 8.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hex(shade(col, -0.25));
    ctx.beginPath();
    ctx.arc(cx, hy - 1.4, 8.2, Math.PI * 1.04, Math.PI * 1.96);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(alt, 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, hy - 1.4, 8.2, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    // visor glint
    ctx.fillStyle = rgba(alt, 0.55);
    rr(ctx, cx - 5, hy + 1.5, 10, 2.6, 1.2); ctx.fill();

    // arms and weapon
    var ax = cx + 9 + gunX, ay = top + 22 + gunY;
    ctx.strokeStyle = hex(shade(col, -0.52));
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 6, top + 20);
    ctx.lineTo(ax - 4, ay + 2);
    ctx.moveTo(cx + 7, top + 19);
    ctx.lineTo(ax, ay - 1);
    ctx.stroke();
    ctx.lineCap = 'butt';
    drawWeapon(ctx, u.weapon, ax, ay, gunAng, col);

    if (pose === 'reload') {
      ctx.fillStyle = rgba(alt, 0.9);
      rr(ctx, ax - 2, ay + 8, 5, 8, 1.5); ctx.fill();
    }
    if (pose === 'hit') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,90,90,0.30)';
      rr(ctx, cx - 14, top, 28, base - top, 8); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (pose === 'fire') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, ax + 20, ay, 9, [[0, rgba(0xfff3c8, 0.85)], [0.45, rgba(alt, 0.35)], [1, rgba(alt, 0)]]);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // Portrait bust for the squad chips and the command screens.
  var POR = 72;
  function drawPortrait(ctx, u) {
    var w = POR, h = POR;
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, hex(shade(u.color, -0.55)));
    g.addColorStop(1, hex(shade(u.color, -0.82)));
    ctx.fillStyle = g;
    rr(ctx, 0, 0, w, h, 12); ctx.fill();
    // light sweep
    ctx.save();
    rr(ctx, 0, 0, w, h, 12); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createLinearGradient(0, h, w, 0);
    sg.addColorStop(0, rgba(u.color, 0));
    sg.addColorStop(0.6, rgba(u.color, 0.30));
    sg.addColorStop(1, rgba(u.alt, 0.10));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    // shoulders
    ctx.fillStyle = hex(shade(u.color, -0.35));
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h);
    ctx.quadraticCurveTo(w * 0.5, h * 0.60, w * 0.94, h);
    ctx.closePath();
    ctx.fill();
    // head
    ctx.fillStyle = hex(shade(u.hair, 0.1));
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.46, h * 0.235, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hex(shade(u.color, -0.15));
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.44, h * 0.235, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(u.alt, 0.85);
    rr(ctx, w * 0.35, h * 0.47, w * 0.30, h * 0.055, 2); ctx.fill();
    ctx.strokeStyle = rgba(u.alt, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.94);
    ctx.quadraticCurveTo(w * 0.5, h * 0.58, w * 0.84, h * 0.94);
    ctx.stroke();
    ctx.restore();
    // frame
    ctx.strokeStyle = rgba(u.alt, 0.5);
    ctx.lineWidth = 2;
    rr(ctx, 1, 1, w - 2, h - 2, 11); ctx.stroke();
  }

  // ====================================================== enemy sprites
  var EN_W = 96, EN_H = 96;
  function drawEnemy(ctx, key, pose) {
    var cx = EN_W / 2, by = EN_H - 8;
    var hot = pose === 'windup';
    var hurt = pose === 'hurt';
    var shell = hurt ? 0xf2f6ff : 0x2b3448;
    var edge = hot ? 0xffd06a : 0x7b8fb8;
    var glow = hot ? 0xffb03c : 0x9fd8ff;

    // The hurt frame omits the contact shadow: the flash below is composited
    // source-atop and would otherwise turn the shadow into a white ellipse.
    if (!hurt) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx, by + 3, key === 'warden' ? 30 : 20, 5, 0, 0, TAU);
      ctx.fill();
    }

    function plate(pts, top, bot) {
      var g = ctx.createLinearGradient(0, by - 60, 0, by);
      g.addColorStop(0, hex(top));
      g.addColorStop(1, hex(bot));
      ctx.fillStyle = g;
      poly(ctx, pts);
      ctx.fill();
      ctx.strokeStyle = rgba(edge, 0.55);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    if (key === 'crawler') {
      ctx.strokeStyle = hex(shade(shell, -0.35)); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 14, by - 18); ctx.lineTo(cx - 22, by);
      ctx.moveTo(cx + 14, by - 18); ctx.lineTo(cx + 22, by);
      ctx.moveTo(cx - 8, by - 16); ctx.lineTo(cx - 12, by);
      ctx.moveTo(cx + 8, by - 16); ctx.lineTo(cx + 12, by);
      ctx.stroke(); ctx.lineCap = 'butt';
      plate([[cx - 17, by - 20], [cx - 9, by - 34], [cx + 9, by - 34], [cx + 17, by - 20], [cx + 11, by - 12], [cx - 11, by - 12]],
        shade(shell, 0.22), shade(shell, -0.3));
    } else if (key === 'lancer') {
      ctx.fillStyle = hex(shade(shell, -0.42));
      rr(ctx, cx - 6, by - 26, 5, 26, 2); ctx.fill();
      rr(ctx, cx + 1, by - 26, 5, 26, 2); ctx.fill();
      plate([[cx - 14, by - 28], [cx - 10, by - 54], [cx + 10, by - 54], [cx + 14, by - 28], [cx + 8, by - 22], [cx - 8, by - 22]],
        shade(shell, 0.24), shade(shell, -0.3));
      // barrel arm
      ctx.fillStyle = hex(shade(shell, -0.1));
      rr(ctx, cx + 10, by - 46, 26, 7, 3); ctx.fill();
      ctx.fillStyle = rgba(glow, hot ? 0.95 : 0.4);
      ctx.beginPath(); ctx.arc(cx + 36, by - 42.5, hot ? 5.5 : 3, 0, TAU); ctx.fill();
      ctx.fillStyle = hex(shade(shell, 0.35));
      rr(ctx, cx - 12, by - 58, 24, 8, 3); ctx.fill();
    } else if (key === 'shielder') {
      plate([[cx - 12, by - 26], [cx - 8, by - 50], [cx + 8, by - 50], [cx + 12, by - 26], [cx + 8, by - 18], [cx - 8, by - 18]],
        shade(shell, 0.18), shade(shell, -0.34));
      ctx.fillStyle = hex(shade(shell, -0.5));
      rr(ctx, cx - 8, by - 22, 6, 22, 2); ctx.fill();
      rr(ctx, cx + 2, by - 22, 6, 22, 2); ctx.fill();
      // slab shield
      var sg2 = ctx.createLinearGradient(cx - 26, by - 56, cx + 26, by - 6);
      sg2.addColorStop(0, hex(shade(0x4a5a78, 0.28)));
      sg2.addColorStop(0.5, hex(shade(0x4a5a78, -0.1)));
      sg2.addColorStop(1, hex(shade(0x4a5a78, -0.42)));
      ctx.fillStyle = sg2;
      poly(ctx, [[cx - 26, by - 54], [cx + 26, by - 54], [cx + 22, by - 4], [cx - 22, by - 4]]);
      ctx.fill();
      ctx.strokeStyle = rgba(edge, hot ? 0.9 : 0.5); ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = rgba(edge, 0.25); ctx.lineWidth = 1;
      for (var sy = 0; sy < 4; sy++) {
        ctx.beginPath(); ctx.moveTo(cx - 24, by - 46 + sy * 11); ctx.lineTo(cx + 24, by - 46 + sy * 11); ctx.stroke();
      }
      if (hot) {
        // firing slit opens: this is when the core is reachable
        ctx.fillStyle = rgba(0x0a0d14, 1);
        rr(ctx, cx - 10, by - 34, 20, 9, 2); ctx.fill();
        ctx.fillStyle = rgba(glow, 0.9);
        rr(ctx, cx - 8, by - 32, 16, 5, 2); ctx.fill();
      }
    } else if (key === 'spitter') {
      ctx.strokeStyle = hex(shade(shell, -0.4)); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 10, by - 14); ctx.lineTo(cx - 18, by);
      ctx.moveTo(cx + 10, by - 14); ctx.lineTo(cx + 18, by);
      ctx.stroke(); ctx.lineCap = 'butt';
      var bg = ctx.createRadialGradient(cx - 5, by - 30, 3, cx, by - 24, 24);
      bg.addColorStop(0, hex(shade(shell, 0.4)));
      bg.addColorStop(1, hex(shade(shell, -0.36)));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(cx, by - 22, 20, 16, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(edge, 0.5); ctx.lineWidth = 1.4; ctx.stroke();
      // mortar tube
      ctx.save();
      ctx.translate(cx + 2, by - 34);
      ctx.rotate(-0.85);
      ctx.fillStyle = hex(shade(shell, -0.05));
      rr(ctx, 0, -5, 24, 10, 4); ctx.fill();
      ctx.fillStyle = rgba(glow, hot ? 0.95 : 0.35);
      ctx.beginPath(); ctx.arc(24, 0, hot ? 6 : 3.4, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (key === 'warden') {
      // tripod legs
      ctx.strokeStyle = hex(shade(shell, -0.45)); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 12, by - 30); ctx.lineTo(cx - 30, by);
      ctx.moveTo(cx + 12, by - 30); ctx.lineTo(cx + 30, by);
      ctx.moveTo(cx, by - 30); ctx.lineTo(cx, by);
      ctx.stroke(); ctx.lineCap = 'butt';
      plate([[cx - 26, by - 34], [cx - 20, by - 74], [cx + 20, by - 74], [cx + 26, by - 34], [cx + 16, by - 26], [cx - 16, by - 26]],
        shade(shell, 0.26), shade(shell, -0.32));
      // shoulder cannons
      ctx.fillStyle = hex(shade(shell, 0.05));
      rr(ctx, cx - 40, by - 68, 20, 10, 4); ctx.fill();
      rr(ctx, cx + 20, by - 68, 20, 10, 4); ctx.fill();
      ctx.fillStyle = rgba(glow, hot ? 0.95 : 0.35);
      ctx.beginPath(); ctx.arc(cx - 40, by - 63, hot ? 5 : 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 40, by - 63, hot ? 5 : 3, 0, TAU); ctx.fill();
      ctx.fillStyle = hex(shade(shell, 0.4));
      rr(ctx, cx - 14, by - 82, 28, 10, 4); ctx.fill();
    } else { // sapper
      ctx.strokeStyle = hex(shade(shell, -0.3)); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 6, by - 14); ctx.lineTo(cx - 14, by);
      ctx.moveTo(cx + 6, by - 14); ctx.lineTo(cx + 14, by);
      ctx.stroke(); ctx.lineCap = 'butt';
      plate([[cx - 12, by - 16], [cx - 6, by - 32], [cx + 6, by - 32], [cx + 12, by - 16], [cx + 7, by - 10], [cx - 7, by - 10]],
        shade(0x5c2f3a, 0.35), shade(0x5c2f3a, -0.2));
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, by - 20, 20, [[0, rgba(0xff7a4c, hot ? 0.55 : 0.28)], [1, rgba(0xff7a4c, 0)]]);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (hurt) {
      // source-atop paints only where the body already has alpha, so the
      // damage flash never becomes a white rectangle around the silhouette.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,246,238,0.62)';
      ctx.fillRect(0, 0, EN_W, EN_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ======================================================= boss sprites
  var BOSS_W = 200, BOSS_H = 180;
  function drawBoss(ctx, key, pose) {
    var cx = BOSS_W / 2, by = BOSS_H - 10;
    var roar = pose === 'roar';
    var pal = {
      titan:    { a: 0x5a3320, b: 0x2a1610, e: 0xffb066 },
      dredge:   { a: 0x1d4a5c, b: 0x0c2430, e: 0x6ef6ff },
      maw:      { a: 0x4a6a86, b: 0x1d2f42, e: 0xd9fdff },
      queen:    { a: 0x5c1e63, b: 0x270a2e, e: 0xec9bff },
      sentinel: { a: 0x6a4a12, b: 0x2c1d06, e: 0xffd978 }
    }[key];

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, by + 4, 62, 9, 0, 0, TAU);
    ctx.fill();

    function body(pts) {
      var g = ctx.createLinearGradient(0, by - 140, 0, by);
      g.addColorStop(0, hex(shade(pal.a, 0.3)));
      g.addColorStop(0.55, hex(pal.a));
      g.addColorStop(1, hex(pal.b));
      ctx.fillStyle = g;
      poly(ctx, pts);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.e, roar ? 0.85 : 0.45);
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    function lamp(x, y, r) {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, x, y, r * 3, [[0, rgba(pal.e, roar ? 0.8 : 0.45)], [1, rgba(pal.e, 0)]]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba(pal.e, 0.95);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    if (key === 'titan') {
      ctx.strokeStyle = hex(pal.b); ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 26, by - 60); ctx.lineTo(cx - 46, by);
      ctx.moveTo(cx + 26, by - 60); ctx.lineTo(cx + 46, by);
      ctx.stroke(); ctx.lineCap = 'butt';
      body([[cx - 52, by - 66], [cx - 40, by - 132], [cx + 40, by - 132], [cx + 52, by - 66], [cx + 34, by - 52], [cx - 34, by - 52]]);
      // road-deck pauldrons, the overpass identity
      ctx.fillStyle = hex(shade(pal.a, -0.25));
      rr(ctx, cx - 78, by - 128, 40, 18, 4); ctx.fill();
      rr(ctx, cx + 38, by - 128, 40, 18, 4); ctx.fill();
      ctx.strokeStyle = rgba(0xffd08a, 0.35); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 74, by - 119); ctx.lineTo(cx - 44, by - 119);
      ctx.moveTo(cx + 44, by - 119); ctx.lineTo(cx + 74, by - 119);
      ctx.stroke();
      lamp(cx - 20, by - 108, 9); lamp(cx + 20, by - 108, 9); lamp(cx, by - 76, 11);
    } else if (key === 'dredge') {
      body([[cx - 60, by - 40], [cx - 44, by - 118], [cx + 44, by - 118], [cx + 60, by - 40], [cx + 40, by - 20], [cx - 40, by - 20]]);
      // dredge buckets
      ctx.fillStyle = hex(shade(pal.a, -0.3));
      for (var d = 0; d < 5; d++) {
        rr(ctx, cx - 56 + d * 24, by - 34, 18, 14, 3); ctx.fill();
      }
      ctx.fillStyle = hex(shade(pal.a, 0.2));
      rr(ctx, cx - 20, by - 138, 40, 24, 6); ctx.fill();
      ctx.strokeStyle = rgba(pal.e, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 70, by - 100); ctx.lineTo(cx + 70, by - 100); ctx.stroke();
      lamp(cx, by - 126, 10); lamp(cx - 46, by - 68, 8); lamp(cx + 46, by - 68, 8);
    } else if (key === 'maw') {
      body([[cx - 66, by - 20], [cx - 50, by - 96], [cx - 18, by - 128], [cx + 18, by - 128], [cx + 50, by - 96], [cx + 66, by - 20]]);
      // jaw
      ctx.fillStyle = hex(shade(pal.b, -0.2));
      poly(ctx, [[cx - 34, by - 58], [cx + 34, by - 58], [cx + 22, by - 24], [cx - 22, by - 24]]);
      ctx.fill();
      ctx.fillStyle = rgba(0xeaf8ff, 0.92);
      for (var t = 0; t < 7; t++) {
        poly(ctx, [[cx - 32 + t * 10, by - 58], [cx - 27 + t * 10, by - 40], [cx - 22 + t * 10, by - 58]]);
        ctx.fill();
      }
      lamp(cx, by - 40, 12); lamp(cx - 40, by - 92, 8); lamp(cx + 40, by - 92, 8);
      ctx.strokeStyle = rgba(0xd9fdff, 0.3); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, by - 90, 52, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (key === 'queen') {
      // abdomen
      var qg = ctx.createRadialGradient(cx, by - 46, 6, cx, by - 46, 62);
      qg.addColorStop(0, hex(shade(pal.a, 0.35)));
      qg.addColorStop(1, hex(pal.b));
      ctx.fillStyle = qg;
      ctx.beginPath(); ctx.ellipse(cx, by - 44, 54, 40, 0, 0, TAU); ctx.fill();
      body([[cx - 30, by - 74], [cx - 20, by - 132], [cx + 20, by - 132], [cx + 30, by - 74], [cx + 18, by - 62], [cx - 18, by - 62]]);
      // crown legs
      ctx.strokeStyle = hex(shade(pal.a, 0.1)); ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (var q = 0; q < 4; q++) {
        var sgn = q < 2 ? -1 : 1, off = (q % 2) * 22;
        ctx.beginPath();
        ctx.moveTo(cx + sgn * 24, by - 90 - off);
        ctx.quadraticCurveTo(cx + sgn * 76, by - 120 - off, cx + sgn * 62, by - 40 - off * 0.4);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      lamp(cx, by - 118, 10); lamp(cx - 26, by - 34, 11); lamp(cx + 26, by - 34, 11);
    } else {
      body([[cx - 46, by - 24], [cx - 46, by - 110], [cx, by - 148], [cx + 46, by - 110], [cx + 46, by - 24]]);
      ctx.strokeStyle = rgba(pal.e, roar ? 0.8 : 0.4);
      ctx.lineWidth = 3;
      for (var ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.arc(cx, by - 76, 30 + ring * 16, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      ctx.fillStyle = hex(shade(pal.a, -0.35));
      rr(ctx, cx - 62, by - 96, 22, 56, 6); ctx.fill();
      rr(ctx, cx + 40, by - 96, 22, 56, 6); ctx.fill();
      lamp(cx, by - 118, 9); lamp(cx - 51, by - 68, 9); lamp(cx + 51, by - 68, 9); lamp(cx, by - 44, 12);
    }

    if (roar) {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, by - 70, 96, [[0, rgba(pal.e, 0.22)], [1, rgba(pal.e, 0)]]);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ===================================================== props and HUD
  function drawProp(ctx, key, w, h) {
    var cx = w / 2, cy = h / 2;
    if (key === 'chip') {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(18,30,46,0.94)');
      g.addColorStop(1, 'rgba(9,16,26,0.94)');
      ctx.fillStyle = g;
      rr(ctx, 1, 1, w - 2, h - 2, 9); ctx.fill();
      ctx.strokeStyle = 'rgba(126,198,232,0.35)'; ctx.lineWidth = 1.5;
      rr(ctx, 1, 1, w - 2, h - 2, 9); ctx.stroke();
    } else if (key === 'plate') {
      var pg = ctx.createLinearGradient(0, 0, 0, h);
      pg.addColorStop(0, 'rgba(12,22,36,0.92)');
      pg.addColorStop(1, 'rgba(6,12,22,0.80)');
      ctx.fillStyle = pg;
      rr(ctx, 0, 0, w, h, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(140,215,245,0.22)'; ctx.lineWidth = 1.5;
      rr(ctx, 1, 1, w - 2, h - 2, 13); ctx.stroke();
    } else if (key === 'bar') {
      ctx.fillStyle = 'rgba(255,255,255,1)';
      rr(ctx, 0, 0, w, h, h / 2); ctx.fill();
    } else if (key === 'track') {
      ctx.fillStyle = 'rgba(8,16,26,0.88)';
      rr(ctx, 0, 0, w, h, h / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(130,200,235,0.30)'; ctx.lineWidth = 1;
      rr(ctx, 0.5, 0.5, w - 1, h - 1, h / 2); ctx.stroke();
    } else if (key === 'ring') {
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = Math.max(2, w * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, cx - ctx.lineWidth, 0, TAU);
      ctx.stroke();
    } else if (key === 'ring_soft') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, cy, cx, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'],
        [0.86, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'reticle') {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cx * 0.42, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      var arms = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (var a = 0; a < arms.length; a++) {
        ctx.beginPath();
        ctx.moveTo(cx + arms[a][0] * cx * 0.55, cy + arms[a][1] * cy * 0.55);
        ctx.lineTo(cx + arms[a][0] * cx * 0.92, cy + arms[a][1] * cy * 0.92);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, TAU); ctx.fill();
    } else if (key === 'core') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, cy, cx, [[0, 'rgba(255,255,255,0.98)'], [0.22, 'rgba(255,214,120,0.85)'],
        [0.55, 'rgba(255,120,80,0.34)'], [1, 'rgba(255,80,60,0)']]);
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'chevron') {
      ctx.fillStyle = 'rgba(255,255,255,1)';
      poly(ctx, [[cx, h * 0.86], [w * 0.08, h * 0.16], [w * 0.28, h * 0.16], [cx, h * 0.56],
        [w * 0.72, h * 0.16], [w * 0.92, h * 0.16]]);
      ctx.fill();
    } else if (key === 'muzzle') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, cy, cy, [[0, 'rgba(255,255,240,0.95)'], [0.3, 'rgba(255,214,120,0.7)'],
        [0.7, 'rgba(255,140,60,0.22)'], [1, 'rgba(255,110,40,0)']]);
      var rnd = rngFrom(9137);
      ctx.fillStyle = 'rgba(255,240,190,0.85)';
      for (var s = 0; s < 7; s++) {
        var ang = (rnd() - 0.5) * 1.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        poly(ctx, [[0, -2.5], [cx * (0.6 + rnd() * 0.7), -0.8], [cx * (0.6 + rnd() * 0.7), 0.8], [0, 2.5]]);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'tracer') {
      var tg = ctx.createLinearGradient(0, 0, w, 0);
      tg.addColorStop(0, 'rgba(255,240,200,0)');
      tg.addColorStop(0.55, 'rgba(255,238,180,0.85)');
      tg.addColorStop(1, 'rgba(255,255,255,0.98)');
      ctx.fillStyle = tg;
      rr(ctx, 0, 0, w, h, h / 2); ctx.fill();
    } else if (key === 'bolt') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, cy, cx, [[0, 'rgba(255,255,255,0.95)'], [0.35, 'rgba(255,150,110,0.7)'],
        [1, 'rgba(255,90,70,0)']]);
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'shell') {
      ctx.fillStyle = '#e0b45a';
      rr(ctx, 0, 0, w, h, 1.2); ctx.fill();
      ctx.fillStyle = '#fff0c0';
      ctx.fillRect(0, 0, w, 1);
    } else if (key === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, cy, cx, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,226,150,0.65)'],
        [1, 'rgba(255,160,60,0)']]);
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'smoke') {
      var rnd2 = rngFrom(4477);
      ctx.globalCompositeOperation = 'lighter';
      for (var p = 0; p < 9; p++) {
        radial(ctx, cx + (rnd2() - 0.5) * w * 0.4, cy + (rnd2() - 0.5) * h * 0.4,
          cx * (0.35 + rnd2() * 0.5),
          [[0, 'rgba(210,220,236,0.12)'], [1, 'rgba(190,205,225,0)']]);
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'flare') {
      ctx.globalCompositeOperation = 'lighter';
      radial(ctx, cx, cy, cx, [[0, 'rgba(255,255,255,0.95)'], [0.18, 'rgba(255,240,190,0.5)'],
        [1, 'rgba(255,200,120,0)']]);
      ctx.fillStyle = 'rgba(255,250,220,0.55)';
      ctx.fillRect(0, cy - 1, w, 2);
      ctx.fillRect(cx - 1, 0, 2, h);
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'shard') {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      poly(ctx, [[cx, 0], [w, cy * 0.8], [cx * 0.7, h], [0, cy]]);
      ctx.fill();
    } else if (key === 'dot') {
      radial(ctx, cx, cy, cx, [[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    } else if (key === 'grad_dark') {
      var dg = ctx.createLinearGradient(0, 0, 0, h);
      dg.addColorStop(0, 'rgba(0,0,0,0)');
      dg.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, w, h);
    } else if (key === 'vignette') {
      var vg = ctx.createRadialGradient(cx, cy, cx * 0.35, cx, cy, cx);
      vg.addColorStop(0, 'rgba(255,40,40,0)');
      vg.addColorStop(1, 'rgba(255,40,40,0.85)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    } else if (key === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Small pictograms so the HUD can obey the icons-over-labels rule.
  function drawIcon(ctx, key, s) {
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.6, s * 0.09);
    ctx.lineJoin = 'round';
    var c = s / 2;
    if (key === 'ic_pause') {
      rr(ctx, s * 0.28, s * 0.22, s * 0.14, s * 0.56, 2); ctx.fill();
      rr(ctx, s * 0.58, s * 0.22, s * 0.14, s * 0.56, 2); ctx.fill();
    } else if (key === 'ic_play') {
      poly(ctx, [[s * 0.32, s * 0.20], [s * 0.80, c], [s * 0.32, s * 0.80]]); ctx.fill();
    } else if (key === 'ic_shield') {
      poly(ctx, [[c, s * 0.14], [s * 0.82, s * 0.30], [s * 0.74, s * 0.68], [c, s * 0.88],
        [s * 0.26, s * 0.68], [s * 0.18, s * 0.30]]);
      ctx.fill();
    } else if (key === 'ic_ammo') {
      rr(ctx, s * 0.34, s * 0.30, s * 0.32, s * 0.48, 3); ctx.fill();
      poly(ctx, [[s * 0.34, s * 0.30], [c, s * 0.12], [s * 0.66, s * 0.30]]); ctx.fill();
    } else if (key === 'ic_core') {
      ctx.beginPath(); ctx.arc(c, c, s * 0.30, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, s * 0.12, 0, TAU); ctx.fill();
    } else if (key === 'ic_credit') {
      ctx.beginPath(); ctx.arc(c, c, s * 0.32, 0, TAU); ctx.stroke();
      rr(ctx, s * 0.42, s * 0.30, s * 0.16, s * 0.40, 2); ctx.fill();
    } else if (key === 'ic_star') {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? s * 0.16 : s * 0.38;
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    } else if (key === 'ic_lock') {
      rr(ctx, s * 0.28, s * 0.44, s * 0.44, s * 0.36, 4); ctx.fill();
      ctx.beginPath();
      ctx.arc(c, s * 0.44, s * 0.16, Math.PI, 0);
      ctx.stroke();
    } else if (key === 'ic_check') {
      ctx.beginPath();
      ctx.moveTo(s * 0.24, c);
      ctx.lineTo(s * 0.44, s * 0.70);
      ctx.lineTo(s * 0.78, s * 0.28);
      ctx.stroke();
    } else if (key === 'ic_up') {
      poly(ctx, [[c, s * 0.18], [s * 0.80, s * 0.58], [s * 0.60, s * 0.58], [s * 0.60, s * 0.84],
        [s * 0.40, s * 0.84], [s * 0.40, s * 0.58], [s * 0.20, s * 0.58]]);
      ctx.fill();
    } else if (key === 'ic_skull') {
      ctx.beginPath(); ctx.arc(c, s * 0.44, s * 0.30, Math.PI, 0); ctx.fill();
      rr(ctx, s * 0.20, s * 0.42, s * 0.60, s * 0.22, 4); ctx.fill();
      rr(ctx, s * 0.36, s * 0.64, s * 0.28, s * 0.16, 3); ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(s * 0.38, s * 0.42, s * 0.09, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.62, s * 0.42, s * 0.09, 0, TAU); ctx.fill();
    } else if (key === 'ic_burst') {
      ctx.beginPath();
      for (var b = 0; b < 12; b++) {
        var rr2 = b % 2 ? s * 0.18 : s * 0.40;
        var a2 = b * Math.PI / 6;
        var qx = c + Math.cos(a2) * rr2, qy = c + Math.sin(a2) * rr2;
        if (b === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.closePath(); ctx.fill();
    } else if (key === 'ic_gear') {
      ctx.beginPath();
      for (var gI = 0; gI < 16; gI++) {
        var gr = gI % 2 ? s * 0.26 : s * 0.40;
        var ga = gI * Math.PI / 8;
        var gx = c + Math.cos(ga) * gr, gy = c + Math.sin(ga) * gr;
        if (gI === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
      }
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(c, c, s * 0.15, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (key === 'ic_tower') {
      poly(ctx, [[s * 0.28, s * 0.84], [s * 0.36, s * 0.20], [s * 0.64, s * 0.20], [s * 0.72, s * 0.84]]);
      ctx.fill();
      ctx.fillStyle = '#000000';
      for (var tI = 0; tI < 3; tI++) ctx.fillRect(s * 0.40, s * 0.32 + tI * s * 0.16, s * 0.20, s * 0.07);
    } else if (key === 'ic_daily') {
      rr(ctx, s * 0.18, s * 0.24, s * 0.64, s * 0.58, 5); ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.fillRect(s * 0.18, s * 0.36, s * 0.64, s * 0.06);
      ctx.fillStyle = '#ffffff';
      rr(ctx, s * 0.30, s * 0.14, s * 0.08, s * 0.18, 3); ctx.fill();
      rr(ctx, s * 0.62, s * 0.14, s * 0.08, s * 0.18, 3); ctx.fill();
    } else if (key === 'ic_flag') {
      ctx.fillRect(s * 0.28, s * 0.16, s * 0.07, s * 0.68);
      poly(ctx, [[s * 0.35, s * 0.18], [s * 0.80, s * 0.32], [s * 0.35, s * 0.48]]);
      ctx.fill();
    }
  }

  // The cover line itself: a baked barricade band the squad hides behind.
  function drawCover(ctx, w, h, ch) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(shade(ch.near, 0.28)));
    g.addColorStop(0.18, hex(shade(ch.near, 0.05)));
    g.addColorStop(1, hex(shade(ch.near, -0.45)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // top lip catches the chapter key light
    ctx.fillStyle = rgba(ch.light, 0.55);
    ctx.fillRect(0, 0, w, 2);
    ctx.fillStyle = rgba(ch.accent, 0.18);
    ctx.fillRect(0, 2, w, 1.5);
    // sandbag and plate rhythm
    var rnd = rngFrom(2211);
    for (var x = 0; x < w; x += 26) {
      var hh = 6 + rnd() * 6;
      ctx.fillStyle = rgba(0x000000, 0.20 + rnd() * 0.16);
      rr(ctx, x + 2, 3, 22, hh, 4); ctx.fill();
      ctx.strokeStyle = rgba(ch.light, 0.10);
      ctx.lineWidth = 1;
      rr(ctx, x + 2.5, 3.5, 21, hh, 4); ctx.stroke();
    }
    for (var px = 0; px < w; px += 74) {
      ctx.fillStyle = rgba(0x000000, 0.30);
      rr(ctx, px + 8, h * 0.4, 54, h * 0.5, 3); ctx.fill();
      ctx.strokeStyle = rgba(ch.accent, 0.13);
      ctx.lineWidth = 1;
      rr(ctx, px + 8.5, h * 0.4, 53, h * 0.5, 3); ctx.stroke();
    }
    speckle(ctx, 0, 0, w, h, Math.round(w * 0.5), 0xffffff, 6611, 0.05, 0.9);
  }

  // ================================================= chapter backdrops
  var SKY_W = 8, SKY_H = 256;
  // Wide enough that the horizontal repeat does not read as a pattern at
  // phone widths: a 512 tile scaled to fit the band repeats three times
  // across a landscape screen and the eye catches it immediately.
  var LAYER_W = 1024;

  function bakeSky(ch) {
    var c = cv(SKY_W, SKY_H), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, SKY_H);
    for (var i = 0; i < ch.sky.length; i++) g.addColorStop(i / (ch.sky.length - 1), ch.sky[i]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SKY_W, SKY_H);
    return c;
  }

  // A soft additive wash that carries the signature light treatment.
  function bakeGlow(ch) {
    var W = 256, H = 128;
    var c = cv(W, H), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';
    if (ch.key === 'overpass') {
      radial(ctx, W * 0.72, H * 0.88, H * 1.05, [[0, rgba(ch.light, 0.55)], [0.4, rgba(0xff7a3c, 0.20)], [1, rgba(0xff5a2c, 0)]]);
    } else if (ch.key === 'tidewall') {
      radial(ctx, W * 0.5, H * 0.1, H * 1.3, [[0, rgba(ch.light, 0.30)], [1, rgba(ch.light, 0)]]);
    } else if (ch.key === 'snowline') {
      radial(ctx, W * 0.5, H * 0.2, H * 1.4, [[0, rgba(0xffffff, 0.34)], [1, rgba(0xbfe4ff, 0)]]);
    } else if (ch.key === 'hive') {
      radial(ctx, W * 0.28, H * 0.7, H * 0.9, [[0, rgba(0xff7ae0, 0.42)], [1, rgba(0xff7ae0, 0)]]);
      radial(ctx, W * 0.76, H * 0.4, H * 0.8, [[0, rgba(0x8f5cff, 0.36)], [1, rgba(0x8f5cff, 0)]]);
    } else {
      radial(ctx, W * 0.5, H * 0.55, H * 1.15, [[0, rgba(0xfff0c0, 0.5)], [0.5, rgba(0xffb347, 0.18)], [1, rgba(0xff8c1a, 0)]]);
    }
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  function bakeFar(ch) {
    var W = LAYER_W, H = 208;
    var c = cv(W, H), ctx = c.getContext('2d');
    var rnd = rngFrom(0x51f1 + ch.key.length * 977);
    var horizon = H * 0.86;
    function silhouette(color, alpha, scale, seed) {
      var r = rngFrom(seed);
      ctx.fillStyle = rgba(color, alpha);
      var x = -20;
      while (x < W + 20) {
        var bw = 18 + r() * 46;
        var bh = (24 + r() * 96) * scale;
        if (ch.key === 'overpass') {
          // road decks on piers
          ctx.fillRect(x, horizon - bh, bw, bh);
          ctx.fillRect(x - 6, horizon - bh - 8, bw + 12, 8);
        } else if (ch.key === 'tidewall') {
          ctx.fillRect(x, horizon - bh, bw, bh);
          if (r() > 0.6) {
            ctx.fillRect(x + bw * 0.4, horizon - bh - 26 * scale, 4, 26 * scale);
            ctx.fillRect(x + bw * 0.1, horizon - bh - 26 * scale, bw * 0.7, 4);
          }
        } else if (ch.key === 'snowline') {
          poly(ctx, [[x, horizon], [x + bw * 0.5, horizon - bh], [x + bw, horizon]]);
          ctx.fill();
        } else if (ch.key === 'hive') {
          ctx.beginPath();
          ctx.moveTo(x, horizon);
          ctx.quadraticCurveTo(x + bw * 0.5, horizon - bh * 1.5, x + bw, horizon);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(x, horizon - bh, bw, bh);
          ctx.beginPath();
          ctx.arc(x + bw * 0.5, horizon - bh, bw * 0.5, Math.PI, 0);
          ctx.fill();
        }
        x += bw + 4 + r() * 16;
      }
    }
    silhouette(shade(ch.far, 0.25), 0.55, 1.25, 0x1111 + ch.key.length);
    silhouette(ch.far, 0.85, 1.0, 0x2222 + ch.key.length * 7);
    // haze band at the horizon: the fog colour is the chapter identity
    var hg = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 6);
    hg.addColorStop(0, rgba(ch.fog, 0));
    hg.addColorStop(1, rgba(ch.fog, 0.30));
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizon - 70, W, 76);
    // distant window and vent lights
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 90; i++) {
      var lx = rnd() * W, ly = horizon - rnd() * 92;
      ctx.fillStyle = rgba(ch.light, 0.12 + rnd() * 0.5);
      ctx.fillRect(lx, ly, 1.4 + rnd() * 1.6, 1.4 + rnd() * 1.4);
    }
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  function bakeMid(ch) {
    var W = LAYER_W, H = 200;
    var c = cv(W, H), ctx = c.getContext('2d');
    var rnd = rngFrom(0x77a1 + ch.key.length * 331);
    var horizon = H * 0.92;
    var x = -30;
    while (x < W + 30) {
      var bw = 34 + rnd() * 70;
      var bh = 40 + rnd() * 118;
      var top = horizon - bh;
      var g = ctx.createLinearGradient(x, top, x + bw, horizon);
      g.addColorStop(0, hex(shade(ch.mid, 0.32)));
      g.addColorStop(0.5, hex(ch.mid));
      g.addColorStop(1, hex(shade(ch.mid, -0.4)));
      ctx.fillStyle = g;

      if (ch.key === 'overpass') {
        ctx.fillRect(x, top, bw, bh);
        ctx.fillStyle = hex(shade(ch.mid, -0.55));
        ctx.fillRect(x + bw * 0.2, top - 12, bw * 0.6, 12);
        // hanging rebar
        ctx.strokeStyle = rgba(shade(ch.mid, -0.6), 0.9);
        ctx.lineWidth = 1.4;
        for (var rb = 0; rb < 4; rb++) {
          ctx.beginPath();
          ctx.moveTo(x + bw * (0.2 + rb * 0.2), top);
          ctx.lineTo(x + bw * (0.18 + rb * 0.2) + (rnd() - 0.5) * 8, top - 14 - rnd() * 12);
          ctx.stroke();
        }
      } else if (ch.key === 'tidewall') {
        // container stacks
        var rows = 2 + Math.floor(rnd() * 3);
        for (var ry = 0; ry < rows; ry++) {
          var tint = mix(ch.mid, [0x2f6f7a, 0x6a3340, 0x3a4a70, 0x6a5a2a][Math.floor(rnd() * 4)], 0.55);
          ctx.fillStyle = hex(shade(tint, ry * 0.06));
          ctx.fillRect(x, horizon - (ry + 1) * 22, bw, 20);
          ctx.strokeStyle = rgba(0x000000, 0.35);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, horizon - (ry + 1) * 22 + 0.5, bw - 1, 19);
        }
        bh = rows * 22;
        top = horizon - bh;
      } else if (ch.key === 'snowline') {
        // research domes
        ctx.beginPath();
        ctx.moveTo(x, horizon);
        ctx.arc(x + bw * 0.5, horizon, bw * 0.5, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgba(0xffffff, 0.6);
        ctx.beginPath();
        ctx.arc(x + bw * 0.5, horizon, bw * 0.5, Math.PI * 1.15, Math.PI * 1.55);
        ctx.lineTo(x + bw * 0.5, horizon);
        ctx.fill();
        bh = bw * 0.5;
        top = horizon - bh;
      } else if (ch.key === 'hive') {
        ctx.beginPath();
        ctx.moveTo(x, horizon);
        ctx.quadraticCurveTo(x + bw * 0.15, top, x + bw * 0.5, top - 10);
        ctx.quadraticCurveTo(x + bw * 0.85, top, x + bw, horizon);
        ctx.closePath();
        ctx.fill();
        // pulsing veins
        ctx.strokeStyle = rgba(0xff9ee8, 0.35);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + bw * 0.5, horizon);
        ctx.quadraticCurveTo(x + bw * 0.35, horizon - bh * 0.6, x + bw * 0.5, top - 6);
        ctx.stroke();
      } else {
        ctx.fillRect(x, top, bw, bh);
        ctx.strokeStyle = rgba(ch.accent, 0.30);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, top + 8);
        ctx.lineTo(x + bw - 4, top + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + bw * 0.5, top + bh * 0.5, Math.min(bw, bh) * 0.3, 0, TAU);
        ctx.stroke();
      }

      // key light on the left face, per chapter light treatment
      ctx.fillStyle = rgba(ch.light, 0.16);
      ctx.fillRect(x, top, Math.min(6, bw * 0.2), bh);
      x += bw + 6 + rnd() * 24;
    }
    // ground contact shadow
    var sg = ctx.createLinearGradient(0, horizon - 24, 0, horizon + 8);
    sg.addColorStop(0, rgba(0x000000, 0));
    sg.addColorStop(1, rgba(0x000000, 0.55));
    ctx.fillStyle = sg;
    ctx.fillRect(0, horizon - 24, W, 32);
    ctx.globalCompositeOperation = 'lighter';
    for (var l = 0; l < 40; l++) {
      ctx.fillStyle = rgba(ch.accent, 0.15 + rnd() * 0.45);
      ctx.fillRect(rnd() * W, horizon - rnd() * 120, 1.6, 1.6);
    }
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  // The ground plane the enemy line walks down. This is the layer the player
  // actually reads depth from, so it is a receding surface, not a flat band:
  // it is lit by the chapter fog at the far edge, darkens toward the cover
  // line, and its scatter grows with the row so the perspective reads even
  // though nothing here is projected.
  function bakeNear(ch) {
    var W = LAYER_W, H = 128;
    var c = cv(W, H), ctx = c.getContext('2d');
    var rnd = rngFrom(0xbead + ch.key.length * 53);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hex(mix(ch.near, ch.fog, 0.42)));
    g.addColorStop(0.14, hex(mix(ch.near, ch.fog, 0.20)));
    g.addColorStop(0.45, hex(shade(ch.near, 0.16)));
    g.addColorStop(1, hex(shade(ch.near, -0.42)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // receding lane markings, wider and further apart as they come forward
    ctx.save();
    for (var b = 0; b < 9; b++) {
      var t = b / 8;
      var y = Math.pow(t, 1.7) * H;
      ctx.fillStyle = rgba(ch.light, 0.14 - t * 0.10);
      ctx.fillRect(0, y, W, Math.max(1, 1 + t * 2.4));
    }
    ctx.restore();

    for (var i = 0; i < 190; i++) {
      var ry = rnd();
      var y2 = Math.pow(ry, 1.5) * (H - 6) + 3;
      var scale = 0.35 + (y2 / H) * 1.9;
      var x = rnd() * W;
      var w = (3 + rnd() * 13) * scale, h = (1.2 + rnd() * 2.6) * scale;
      var light = rnd() > 0.55;
      ctx.fillStyle = rgba(light ? mix(ch.near, ch.light, 0.5) : 0x000000,
        (light ? 0.10 : 0.20) + rnd() * 0.22);
      rr(ctx, x, y2, w, h, Math.min(2, h * 0.6)); ctx.fill();
    }

    if (ch.key === 'snowline') {
      // Soft, sparse drifts. Dense bright blobs on a pale ground turn the
      // plane into noise and the enemy line stops reading against it.
      for (var s = 0; s < 22; s++) {
        var sy = Math.pow(rnd(), 1.5) * H;
        var sd = 0.4 + sy / H;
        radial(ctx, rnd() * W, sy, (18 + rnd() * 30) * sd,
          [[0, rgba(0xeaf6ff, 0.05 + (sy / H) * 0.10)], [1, rgba(0xeaf6ff, 0)]]);
      }
    } else if (ch.key === 'tidewall') {
      for (var p = 0; p < 34; p++) {
        var py = Math.pow(rnd(), 1.5) * H;
        ctx.fillStyle = rgba(0x9fe8ff, 0.06 + (py / H) * 0.16);
        ctx.beginPath();
        ctx.ellipse(rnd() * W, py, (9 + rnd() * 24) * (0.4 + py / H), (2.5 + rnd() * 3) * (0.4 + py / H), 0, 0, TAU);
        ctx.fill();
      }
    } else if (ch.key === 'hive') {
      ctx.globalCompositeOperation = 'lighter';
      for (var v = 0; v < 16; v++) {
        var vy = Math.pow(rnd(), 1.4) * H;
        radial(ctx, rnd() * W, vy, 12 + (vy / H) * 40,
          [[0, rgba(0xff7ae0, 0.16)], [1, rgba(0xff7ae0, 0)]]);
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (ch.key === 'aegis') {
      ctx.globalCompositeOperation = 'lighter';
      for (var cndt = 0; cndt < 5; cndt++) {
        var cy2 = Math.pow((cndt + 1) / 6, 1.6) * H;
        ctx.fillStyle = rgba(0xffd978, 0.10);
        ctx.fillRect(0, cy2, W, 2 + (cy2 / H) * 3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // far edge catches the chapter key light: this line is where the enemy
    // line first appears, so it has to read
    ctx.fillStyle = rgba(ch.light, 0.42);
    ctx.fillRect(0, 0, W, 2);
    ctx.fillStyle = rgba(ch.fog, 0.18);
    ctx.fillRect(0, 2, W, 4);
    return c;
  }

  // ============================================================== build
  function buildAtlas(scene, SQUAD, ENEMY_KEYS, BOSS_KEYS) {
    var items = [];
    function add(name, w, h, draw) { items.push({ name: name, w: w, h: h, draw: draw }); }

    var poses = ['duck', 'rise', 'fire', 'reload', 'hit'];
    for (var i = 0; i < SQUAD.length; i++) {
      (function (u) {
        for (var p = 0; p < poses.length; p++) {
          (function (pose) {
            add('op_' + u.id + '_' + pose, OP_W, OP_H, function (ctx) { drawOperator(ctx, u, pose); });
          })(poses[p]);
        }
        add('por_' + u.id, POR, POR, function (ctx) { drawPortrait(ctx, u); });
      })(SQUAD[i]);
    }
    var eposes = ['idle', 'windup', 'hurt'];
    for (var e = 0; e < ENEMY_KEYS.length; e++) {
      (function (k) {
        for (var q = 0; q < eposes.length; q++) {
          (function (pose) {
            add('en_' + k + '_' + pose, EN_W, EN_H, function (ctx) { drawEnemy(ctx, k, pose); });
          })(eposes[q]);
        }
      })(ENEMY_KEYS[e]);
    }
    for (var b = 0; b < BOSS_KEYS.length; b++) {
      (function (k) {
        add('boss_' + k + '_idle', BOSS_W, BOSS_H, function (ctx) { drawBoss(ctx, k, 'idle'); });
        add('boss_' + k + '_roar', BOSS_W, BOSS_H, function (ctx) { drawBoss(ctx, k, 'roar'); });
      })(BOSS_KEYS[b]);
    }

    var props = [
      ['chip', 96, 34], ['plate', 128, 64], ['bar', 32, 12], ['track', 40, 16],
      ['ring', 64, 64], ['ring_soft', 96, 96], ['reticle', 72, 72], ['core', 48, 48],
      ['chevron', 32, 32], ['muzzle', 64, 40], ['tracer', 48, 6], ['bolt', 32, 32],
      ['shell', 5, 3], ['spark', 24, 24], ['smoke', 64, 64], ['flare', 48, 48],
      ['shard', 12, 16], ['dot', 16, 16], ['grad_dark', 32, 64], ['vignette', 128, 128],
      ['white', 8, 8]
    ];
    for (var pi = 0; pi < props.length; pi++) {
      (function (row) {
        add(row[0], row[1], row[2], function (ctx) { drawProp(ctx, row[0], row[1], row[2]); });
      })(props[pi]);
    }
    var icons = ['ic_pause', 'ic_play', 'ic_shield', 'ic_ammo', 'ic_core', 'ic_credit',
      'ic_star', 'ic_lock', 'ic_check', 'ic_up', 'ic_skull', 'ic_burst', 'ic_gear',
      'ic_tower', 'ic_daily', 'ic_flag'];
    for (var ii = 0; ii < icons.length; ii++) {
      (function (k) { add(k, 40, 40, function (ctx) { drawIcon(ctx, k, 40); }); })(icons[ii]);
    }

    var W = 1024;
    var H = pack(items, W, 2);
    var canvas = cv(W, H);
    var ctx = canvas.getContext('2d');
    for (var d = 0; d < items.length; d++) {
      var it = items[d];
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.beginPath();
      ctx.rect(0, 0, it.w, it.h);
      ctx.clip();
      it.draw(ctx);
      ctx.restore();
    }
    var tex = scene.textures.addCanvas('atlas', canvas);
    for (var f = 0; f < items.length; f++) {
      // second argument is the SOURCE INDEX, not an x offset
      tex.add(items[f].name, 0, items[f].x, items[f].y, items[f].w, items[f].h);
    }

    // Full-screen fills must NOT come from the atlas. Stretching a small
    // atlas frame across the viewport makes the linear filter sample past the
    // frame edge and drag whatever is packed next to it across the whole
    // quad, which shows up as coloured bands down the sides of a flat fill.
    // These two live in their own textures where there is no neighbour.
    if (!scene.textures.exists('px')) {
      var pc = cv(8, 8);
      var pctx = pc.getContext('2d');
      pctx.fillStyle = '#ffffff';
      pctx.fillRect(0, 0, 8, 8);
      scene.textures.addCanvas('px', pc);
    }
    if (!scene.textures.exists('vig')) {
      var vc = cv(192, 192);
      drawProp(vc.getContext('2d'), 'vignette', 192, 192);
      scene.textures.addCanvas('vig', vc);
    }
    return { width: W, height: H, frames: items.length };
  }

  function buildChapter(scene, ch) {
    if (!scene.textures.exists('sky_' + ch.key)) scene.textures.addCanvas('sky_' + ch.key, bakeSky(ch));
    if (!scene.textures.exists('glow_' + ch.key)) scene.textures.addCanvas('glow_' + ch.key, bakeGlow(ch));
    if (!scene.textures.exists('far_' + ch.key)) scene.textures.addCanvas('far_' + ch.key, bakeFar(ch));
    if (!scene.textures.exists('mid_' + ch.key)) scene.textures.addCanvas('mid_' + ch.key, bakeMid(ch));
    if (!scene.textures.exists('near_' + ch.key)) scene.textures.addCanvas('near_' + ch.key, bakeNear(ch));
    if (!scene.textures.exists('cover_' + ch.key)) {
      var c = cv(512, 64);
      drawCover(c.getContext('2d'), 512, 64, ch);
      scene.textures.addCanvas('cover_' + ch.key, c);
    }
  }

  // Title logotype, baked once so the front screen is never bare type.
  function buildLogo(scene) {
    if (scene.textures.exists('logo')) return;
    var W = 560, H = 170;
    var c = cv(W, H), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';
    radial(ctx, W * 0.5, H * 0.52, W * 0.42, [[0, 'rgba(255,190,120,0.22)'], [1, 'rgba(255,120,60,0)']]);
    ctx.globalCompositeOperation = 'source-over';

    // shield mark
    ctx.save();
    ctx.translate(W * 0.5, H * 0.40);
    var sg = ctx.createLinearGradient(0, -46, 0, 46);
    sg.addColorStop(0, '#ffe3a8');
    sg.addColorStop(0.5, '#ff9a52');
    sg.addColorStop(1, '#c0432c');
    ctx.fillStyle = sg;
    poly(ctx, [[0, -50], [40, -32], [34, 22], [0, 50], [-34, 22], [-40, -32]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,232,190,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(12,16,24,0.85)';
    ctx.fillRect(-30, -6, 60, 9);
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.fillRect(-30, 8, 60, 4);
    ctx.fillRect(-22, 18, 44, 3);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 46px Verdana, Geneva, sans-serif';
    var tg = ctx.createLinearGradient(0, H * 0.68, 0, H * 0.94);
    tg.addColorStop(0, '#fff3d8');
    tg.addColorStop(1, '#ffb066');
    ctx.fillStyle = tg;
    ctx.fillText('AEGIS LINE', W * 0.5, H * 0.80);
    ctx.strokeStyle = 'rgba(255,160,90,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeText('AEGIS LINE', W * 0.5, H * 0.80);
    scene.textures.addCanvas('logo', c);
  }

  root.ALArt = {
    buildAtlas: buildAtlas,
    buildChapter: buildChapter,
    buildLogo: buildLogo,
    OP_W: OP_W, OP_H: OP_H, POR: POR, EN_W: EN_W, EN_H: EN_H,
    BOSS_W: BOSS_W, BOSS_H: BOSS_H, LAYER_W: LAYER_W, SKY_H: SKY_H
  };
})(typeof window !== 'undefined' ? window : globalThis);
