/* te_art.js — Touchline Eleven procedural art and audio bakery.
 *
 * Everything the title draws is baked into canvas textures here at load time
 * (or at venue change) and then blitted as sprites. Nothing static is drawn
 * with Phaser Graphics per frame: Graphics replays its whole command list
 * every frame and a full broadcast pitch would cost hundreds of ms under a
 * 4x CPU throttle.
 *
 * Audio is synthesized into 22 kHz mono WAV object URLs and registered with
 * the GGKit audio buses. No audio file ships in this directory, so the ogg
 * format law cannot be violated and the payload stays tiny.
 */
(function (root) {
  'use strict';

  var C = root.TECore;
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------- helpers */
  function hexs(v) { return '#' + ('000000' + (v >>> 0).toString(16)).slice(-6); }
  function rgba(v, a) {
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
  }
  function rnd(seed) { return C.makeRng(seed); }

  function makeTex(scene, key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var baked = root.GGKit.hiDpi.canvas(w, h);
    var t = scene.textures.addCanvas(key, baked.canvas);
    if (t && t.get()) t.get().source.resolution = baked.dpr;
    // createCanvas returns null if a key survived a soft reload.
    if (!t) { t = scene.textures.get(key); if (!t || !t.getSourceImage) return null; }
    var c = baked.ctx;
    c.clearRect(0, 0, w, h);
    return { t: t, c: c, w: w, h: h };
  }
  function finish(x) { if (x && x.t && x.t.refresh) x.t.refresh(); }

  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y); c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr); c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }
  function softDisc(c, x, y, r, col, a0, a1) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a0 == null ? 1 : a0));
    g.addColorStop(1, rgba(col, a1 == null ? 0 : a1));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  function capsule(c, x0, y0, x1, y1, r, fill) {
    c.strokeStyle = fill; c.lineWidth = r * 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }

  /* ------------------------------------------------------- pitch and venue */
  var PITCH_KEY = 'te-pitch';

  function buildPitch(scene, venue, gw, gh) {
    var P = root.TEContent.PITCH;
    var x = makeTex(scene, PITCH_KEY, gw, gh);
    if (!x) return PITCH_KEY;
    var c = x.c, R = rnd(0x51ac + venue.key.length * 977);

    // Sky / stand backdrop behind the stands.
    var sky = c.createLinearGradient(0, 0, 0, gh);
    sky.addColorStop(0, hexs(venue.sky));
    sky.addColorStop(1, hexs(C.mixColor(venue.sky, venue.standLo, 0.65)));
    c.fillStyle = sky; c.fillRect(0, 0, gw, gh);

    // Stand blocks top and bottom, with a crowd band inside each.
    drawStand(c, R, venue, 0, 0, gw, P.top - 6, true);
    drawStand(c, R, venue, 0, P.bottom + 6, gw, gh - (P.bottom + 6), false);
    // Side slivers so the pitch never touches a bare edge.
    c.fillStyle = hexs(venue.standLo);
    c.fillRect(0, P.top - 6, P.left - 12, P.bottom - P.top + 12);
    c.fillRect(P.right + 12, P.top - 6, gw - (P.right + 12), P.bottom - P.top + 12);

    // Turf apron then the pitch itself.
    c.fillStyle = hexs(C.mixColor(venue.turf, 0x000000, 0.35));
    c.fillRect(P.left - 12, P.top - 6, (P.right - P.left) + 24, (P.bottom - P.top) + 12);

    var stripe = 44;
    for (var sx = P.left; sx < P.right; sx += stripe) {
      var w = Math.min(stripe, P.right - sx);
      var idx = Math.round((sx - P.left) / stripe);
      c.fillStyle = hexs(idx % 2 === 0 ? venue.turf : venue.turf2);
      c.fillRect(sx, P.top, w, P.bottom - P.top);
    }
    // Mow texture: fine horizontal grain plus a few worn patches.
    c.globalAlpha = 0.05;
    for (var gy = P.top; gy < P.bottom; gy += 3) {
      c.fillStyle = (gy % 6 === 0) ? '#ffffff' : '#000000';
      c.fillRect(P.left, gy, P.right - P.left, 1);
    }
    c.globalAlpha = 1;
    c.globalAlpha = 0.07;
    for (var p = 0; p < 26; p++) {
      var px = P.left + R() * (P.right - P.left), py = P.top + R() * (P.bottom - P.top);
      softDisc(c, px, py, 24 + R() * 46, R() < 0.5 ? 0xffffff : 0x000000, 0.5, 0);
    }
    c.globalAlpha = 1;

    // Corner vignette so the middle of the pitch reads brightest.
    var vg = c.createRadialGradient(gw / 2, gh / 2, gh * 0.28, gw / 2, gh / 2, gh * 0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.34)');
    c.fillStyle = vg; c.fillRect(0, 0, gw, gh);

    if (venue.light) {
      // Four floodlight pools.
      var pools = [[P.left + 120, P.top + 40], [P.right - 120, P.top + 40], [P.left + 120, P.bottom - 40], [P.right - 120, P.bottom - 40]];
      for (var i = 0; i < pools.length; i++) softDisc(c, pools[i][0], pools[i][1], 300, 0xfff3d0, 0.13, 0);
    }
    if (venue.tintAlpha > 0) {
      c.fillStyle = rgba(venue.tint, venue.tintAlpha);
      c.fillRect(0, 0, gw, gh);
    }

    drawMarkings(c, P, venue);
    drawGoals(c, P, venue);

    finish(x);
    return PITCH_KEY;
  }

  function drawStand(c, R, venue, x, y, w, h, top) {
    if (h <= 0) return;
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(top ? 0 : 1, hexs(venue.standLo));
    g.addColorStop(top ? 1 : 0, hexs(venue.stand));
    c.fillStyle = g; c.fillRect(x, y, w, h);

    // A shallow strip is a touchline board, not a stand: skip the crowd rows
    // rather than smear them into two pixels.
    if (h < 26) {
      c.fillStyle = rgba(0x000000, 0.4); c.fillRect(x, top ? y + h - 7 : y, w, 7);
      c.fillStyle = rgba(venue.line, 0.22);
      for (var q = 0; q < w; q += 64) c.fillRect(x + q + 6, (top ? y + h - 7 : y) + 2, 44, 3);
      return;
    }

    // Crowd band: three rows of dots in the venue crowd palette, denser and
    // brighter toward the pitch so the eye still lands on the grass.
    var rows = 4, bandH = Math.min(h - 10, 40);
    var baseY = top ? y + h - bandH - 4 : y + 6;
    for (var r = 0; r < rows; r++) {
      var ry = baseY + r * (bandH / rows);
      var step = 8 + r * 0.6;
      for (var cx = 4; cx < w; cx += step) {
        var col = venue.crowd[(R() * venue.crowd.length) | 0] || 0xcccccc;
        var jitter = (R() - 0.5) * 3;
        c.fillStyle = rgba(col, 0.5 + r * 0.1);
        c.beginPath();
        c.arc(x + cx + jitter, ry + jitter, 2.1 + R() * 1.2, 0, TAU);
        c.fill();
      }
    }
    // Barrier rail and advertising board facing the pitch.
    var boardY = top ? y + h - 8 : y;
    c.fillStyle = rgba(0x000000, 0.45); c.fillRect(x, boardY, w, 8);
    c.fillStyle = rgba(venue.line, 0.24);
    for (var b = 0; b < w; b += 64) c.fillRect(x + b + 6, boardY + 2, 44, 4);
  }

  function drawMarkings(c, P, venue) {
    var line = rgba(venue.line, 0.86);
    c.strokeStyle = line; c.lineWidth = 3; c.lineJoin = 'round';
    c.strokeRect(P.left, P.top, P.right - P.left, P.bottom - P.top);
    // Halfway line.
    c.beginPath(); c.moveTo(P.midX, P.top); c.lineTo(P.midX, P.bottom); c.stroke();
    // Centre circle and spot, hand tessellated.
    tessCircle(c, P.midX, P.midY, 68, 46);
    c.fillStyle = line;
    c.beginPath(); c.arc(P.midX, P.midY, 4, 0, TAU); c.fill();
    // Penalty areas, six yard boxes, spots and D arcs on both ends.
    for (var s = 0; s < 2; s++) {
      var left = (s === 0);
      var gx = left ? P.left : P.right;
      var dir = left ? 1 : -1;
      c.strokeRect(Math.min(gx, gx + dir * P.boxDepth), P.midY - P.boxHalf, P.boxDepth, P.boxHalf * 2);
      c.strokeRect(Math.min(gx, gx + dir * P.sixDepth), P.midY - P.sixHalf, P.sixDepth, P.sixHalf * 2);
      var spotX = gx + dir * P.spotDepth;
      c.beginPath(); c.arc(spotX, P.midY, 4, 0, TAU); c.fill();
      // D arc clipped to outside the box.
      c.save();
      c.beginPath();
      if (left) c.rect(gx + P.boxDepth, P.top, 200, P.bottom - P.top);
      else c.rect(gx - P.boxDepth - 200, P.top, 200, P.bottom - P.top);
      c.clip();
      tessCircle(c, spotX, P.midY, 60, 40);
      c.restore();
      // Corner arcs.
      for (var q = 0; q < 2; q++) {
        var cy = q === 0 ? P.top : P.bottom;
        c.beginPath();
        var n = 10, a0 = left ? (q === 0 ? 0 : -Math.PI / 2) : (q === 0 ? Math.PI / 2 : Math.PI);
        for (var i = 0; i <= n; i++) {
          var a = a0 + (Math.PI / 2) * (i / n);
          var px = gx + Math.cos(a) * 14, py = cy + Math.sin(a) * 14;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
      }
    }
  }

  function tessCircle(c, x, y, r, n) {
    c.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * TAU;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
  }

  function drawGoals(c, P, venue) {
    for (var s = 0; s < 2; s++) {
      var left = (s === 0);
      var gx = left ? P.left : P.right;
      var dir = left ? -1 : 1;
      var back = gx + dir * P.goalDepth;
      // Net panel.
      c.fillStyle = rgba(0x0a0f12, 0.42);
      c.fillRect(Math.min(gx, back), P.midY - P.goalHalf, P.goalDepth, P.goalHalf * 2);
      c.strokeStyle = rgba(0xffffff, 0.28); c.lineWidth = 1;
      for (var i = 0; i <= P.goalDepth; i += 5) {
        c.beginPath(); c.moveTo(gx + dir * i, P.midY - P.goalHalf); c.lineTo(gx + dir * i, P.midY + P.goalHalf); c.stroke();
      }
      for (var j = -P.goalHalf; j <= P.goalHalf; j += 6) {
        c.beginPath(); c.moveTo(gx, P.midY + j); c.lineTo(back, P.midY + j); c.stroke();
      }
      // Posts and crossbar shadow.
      c.strokeStyle = rgba(venue.line, 0.98); c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(gx, P.midY - P.goalHalf); c.lineTo(back, P.midY - P.goalHalf);
      c.moveTo(gx, P.midY + P.goalHalf); c.lineTo(back, P.midY + P.goalHalf);
      c.moveTo(back, P.midY - P.goalHalf); c.lineTo(back, P.midY + P.goalHalf);
      c.stroke();
      c.lineWidth = 4; c.strokeStyle = rgba(venue.line, 0.9);
      c.beginPath(); c.moveTo(gx, P.midY - P.goalHalf); c.lineTo(gx, P.midY + P.goalHalf); c.stroke();
    }
  }

  /* ------------------------------------------------------------- players */
  var FRAMES = ['idle', 'run1', 'run2', 'run3', 'kick', 'slide', 'cheer'];
  var CELL = 60;

  function drawFigure(c, cx, cy, frame, kit, pattern, num) {
    var primary = kit.primary, secondary = kit.secondary, skin = kit.skin, short = kit.shorts;
    var lean = 0, legF = 0, legB = 0, armSpread = 0, squash = 1;
    if (frame === 'run1') { legF = 7; legB = -6; armSpread = 3; }
    else if (frame === 'run2') { legF = 1; legB = -1; armSpread = 1; }
    else if (frame === 'run3') { legF = -6; legB = 7; armSpread = 3; }
    else if (frame === 'kick') { lean = 2; legF = 13; legB = -9; armSpread = 6; }
    else if (frame === 'slide') { lean = -3; legF = 15; legB = 2; armSpread = 8; squash = 0.78; }
    else if (frame === 'cheer') { armSpread = 11; legF = 2; legB = -2; }

    c.save();
    c.translate(cx, cy);
    if (frame === 'slide') c.rotate(-0.34);
    c.scale(1, squash);

    // Legs first so the torso sits over them.
    capsule(c, -3 + lean, -5, 6 + legF, -8 - armSpread * 0.2, 3.4, hexs(short));
    capsule(c, -3 + lean, 5, 6 + legB, 8 + armSpread * 0.2, 3.4, hexs(short));
    // Boots.
    c.fillStyle = hexs(secondary);
    c.beginPath(); c.arc(6 + legF, -8 - armSpread * 0.2, 3.0, 0, TAU); c.fill();
    c.beginPath(); c.arc(6 + legB, 8 + armSpread * 0.2, 3.0, 0, TAU); c.fill();
    // Arms.
    capsule(c, -1, -8, 4 - armSpread * 0.25, -13 - armSpread, 2.6, hexs(skin));
    capsule(c, -1, 8, 4 - armSpread * 0.25, 13 + armSpread, 2.6, hexs(skin));

    // Torso: rounded rect across the facing axis.
    c.save();
    c.translate(lean * 0.5, 0);
    c.fillStyle = hexs(primary);
    roundRect(c, -9, -12, 19, 24, 7); c.fill();
    // Kit pattern so team identity never depends on colour alone.
    c.save();
    roundRect(c, -9, -12, 19, 24, 7); c.clip();
    c.fillStyle = rgba(secondary, 0.9);
    if (pattern === 'hoop') {
      c.fillRect(-9, -8, 19, 5);
      c.fillRect(-9, 3, 19, 5);
    } else if (pattern === 'sash') {
      c.beginPath(); c.moveTo(-9, -12); c.lineTo(-2, -12); c.lineTo(10, 12); c.lineTo(3, 12); c.closePath(); c.fill();
    } else if (pattern === 'stripe') {
      c.fillRect(-4, -12, 5, 24);
      c.fillRect(5, -12, 4, 24);
    } else {
      c.fillRect(-9, 8, 19, 4);
    }
    c.restore();
    // Shirt number on the back.
    c.fillStyle = rgba(0xffffff, 0.94);
    c.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.rotate(-Math.PI / 2); c.fillText(String(num), 0, -2); c.restore();
    // Torso outline.
    c.strokeStyle = rgba(0x04120c, 0.7); c.lineWidth = 1.6;
    roundRect(c, -9, -12, 19, 24, 7); c.stroke();
    c.restore();

    // Head with a hair cap so the facing direction reads from above.
    c.fillStyle = hexs(skin);
    c.beginPath(); c.arc(7 + lean, 0, 6.6, 0, TAU); c.fill();
    c.fillStyle = rgba(kit.hair, 0.95);
    c.beginPath(); c.arc(5.4 + lean, 0, 5.6, -Math.PI * 0.62, Math.PI * 0.62, true); c.fill();
    c.strokeStyle = rgba(0x04120c, 0.62); c.lineWidth = 1.4;
    c.beginPath(); c.arc(7 + lean, 0, 6.6, 0, TAU); c.stroke();
    c.restore();
  }

  function buildFigureSheet(scene, key, kit, pattern, num) {
    var x = makeTex(scene, key, CELL * FRAMES.length, CELL);
    if (!x) return;
    for (var i = 0; i < FRAMES.length; i++) {
      drawFigure(x.c, i * CELL + CELL / 2, CELL / 2, FRAMES[i], kit, pattern, num);
      // Second arg of Texture.add is the SOURCE INDEX, not an x offset.
      x.t.add(FRAMES[i], 0, i * CELL, 0, CELL, CELL);
    }
    finish(x);
  }

  function kitFor(club, keeper) {
    if (keeper) {
      return { primary: 0x1c2a33, secondary: 0xf2c744, shorts: 0x131c23, skin: 0xe7bd93, hair: 0x3a2a20 };
    }
    return { primary: club.primary, secondary: club.secondary, shorts: C.mixColor(club.secondary, 0x000000, 0.2), skin: 0xe7bd93, hair: 0x2c2018 };
  }

  function buildTeams(scene, ownClub, oppClub) {
    buildFigureSheet(scene, 'te-own', kitFor(ownClub, false), 'hoop', 8);
    buildFigureSheet(scene, 'te-own-gk', kitFor(ownClub, true), 'plain', 1);
    buildFigureSheet(scene, 'te-opp', kitFor(oppClub, false), 'sash', 7);
    buildFigureSheet(scene, 'te-opp-gk', kitFor(oppClub, true), 'stripe', 1);
  }

  /* ------------------------------------------------------- static pieces */
  function buildCommon(scene, gw, gh) {
    var x, c, i, a;

    // Ball: white panel sphere with a rim light and dark seam pattern.
    x = makeTex(scene, 'te-ball', 22, 22);
    if (x) {
      c = x.c;
      var bg = c.createRadialGradient(9, 8, 1, 11, 11, 11);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.68, '#eef3ee');
      bg.addColorStop(1, '#b9c6bd');
      c.fillStyle = bg; c.beginPath(); c.arc(11, 11, 9.4, 0, TAU); c.fill();
      c.fillStyle = 'rgba(20,32,26,0.88)';
      c.beginPath(); c.arc(11, 11, 2.7, 0, TAU); c.fill();
      for (i = 0; i < 5; i++) {
        a = (i / 5) * TAU + 0.3;
        c.beginPath();
        c.arc(11 + Math.cos(a) * 6.4, 11 + Math.sin(a) * 6.4, 1.9, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(14,26,20,0.9)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(11, 11, 9.4, 0, TAU); c.stroke();
      finish(x);
    }

    // Contact shadow shared by ball and players.
    x = makeTex(scene, 'te-shadow', 40, 40);
    if (x) { softDisc(x.c, 20, 20, 19, 0x000000, 0.5, 0); finish(x); }

    // Selection ring and lead chevron.
    x = makeTex(scene, 'te-ring', 52, 52);
    if (x) {
      c = x.c;
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 3;
      tessCircle(c, 26, 26, 21, 40);
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 6;
      tessCircle(c, 26, 26, 21, 40);
      finish(x);
    }
    x = makeTex(scene, 'te-chev', 26, 20);
    if (x) {
      c = x.c;
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(13, 18); c.lineTo(2, 4); c.lineTo(24, 4); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(6,20,14,0.7)'; c.lineWidth = 1.6; c.stroke();
      finish(x);
    }

    // Particle atlas pieces.
    x = makeTex(scene, 'te-p-soft', 32, 32);
    if (x) { softDisc(x.c, 16, 16, 15, 0xffffff, 0.95, 0); finish(x); }
    x = makeTex(scene, 'te-p-fleck', 10, 8);
    if (x) {
      c = x.c;
      c.fillStyle = '#ffffff';
      roundRect(c, 0.5, 0.5, 9, 7, 2.5); c.fill();
      finish(x);
    }
    x = makeTex(scene, 'te-p-ring', 48, 48);
    if (x) {
      c = x.c; c.strokeStyle = '#ffffff'; c.lineWidth = 4;
      tessCircle(c, 24, 24, 20, 34);
      finish(x);
    }
    x = makeTex(scene, 'te-p-conf', 8, 12);
    if (x) { x.c.fillStyle = '#ffffff'; x.c.fillRect(0, 0, 8, 12); finish(x); }
    x = makeTex(scene, 'te-p-star', 26, 26);
    if (x) {
      c = x.c; c.fillStyle = '#ffffff';
      c.beginPath();
      for (i = 0; i < 8; i++) {
        a = (i / 8) * TAU;
        var rr = (i % 2 === 0) ? 12 : 4.4;
        var px = 13 + Math.cos(a) * rr, py = 13 + Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
      finish(x);
    }
    x = makeTex(scene, 'te-p-drop', 4, 18);
    if (x) {
      c = x.c;
      var dg = c.createLinearGradient(0, 0, 0, 18);
      dg.addColorStop(0, 'rgba(255,255,255,0)');
      dg.addColorStop(1, 'rgba(255,255,255,0.95)');
      c.fillStyle = dg; c.fillRect(1, 0, 2, 18);
      finish(x);
    }

    // Crowd shimmer strip, additive, used for the celebration wave.
    x = makeTex(scene, 'te-wave', 256, 48);
    if (x) {
      c = x.c;
      var wg = c.createLinearGradient(0, 0, 256, 0);
      wg.addColorStop(0, 'rgba(255,255,255,0)');
      wg.addColorStop(0.5, 'rgba(255,244,214,0.5)');
      wg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = wg; c.fillRect(0, 0, 256, 48);
      finish(x);
    }

    buildUi(scene, gw, gh);
  }

  var INK = 0xe9fbf1, PANEL = 0x0d2820, PANEL2 = 0x123528, EDGE = 0x2fae86, ACCENT = 0x27d0a0;

  // Baked glyph sheet geometry, shared with the HUD digit rows in game.js.
  var DIGIT_W = 22, DIGIT_H = 40;
  var DIGIT_FRAME = {};
  '0123456789'.split('').forEach(function (d) { DIGIT_FRAME[d] = 'd' + d; });
  DIGIT_FRAME[':'] = 'dcolon';
  DIGIT_FRAME['-'] = 'ddash';
  DIGIT_FRAME[' '] = 'dspace';

  function buildUi(scene, gw, gh) {
    var x, c, i;

    // Broadcast HUD band.
    x = makeTex(scene, 'te-band', 560, 56);
    if (x) {
      c = x.c;
      var g = c.createLinearGradient(0, 0, 0, 56);
      g.addColorStop(0, 'rgba(6,20,15,0.94)');
      g.addColorStop(1, 'rgba(6,20,15,0.66)');
      c.fillStyle = g;
      roundRect(c, 0, -18, 560, 74, 20); c.fill();
      c.strokeStyle = rgba(EDGE, 0.55); c.lineWidth = 2;
      roundRect(c, 1, -18, 558, 73, 20); c.stroke();
      finish(x);
    }

    // Panels and buttons.
    panelTex(scene, 'te-panel', 480, 300, PANEL, 22, 0.95);
    panelTex(scene, 'te-panel-sm', 300, 132, PANEL2, 18, 0.95);
    buttonTex(scene, 'te-btn', 300, 60, PANEL2, EDGE);
    buttonTex(scene, 'te-btn-hot', 300, 60, ACCENT, 0xffffff);
    buttonTex(scene, 'te-btn-sm', 168, 52, PANEL2, EDGE);
    buttonTex(scene, 'te-btn-sm-hot', 168, 52, ACCENT, 0xffffff);
    buttonTex(scene, 'te-card', 190, 96, PANEL2, EDGE);
    buttonTex(scene, 'te-card-hot', 190, 96, 0x1c5c46, ACCENT);

    // Corner chip for in play events. Small by law: 24px of text at most.
    x = makeTex(scene, 'te-chip', 260, 40);
    if (x) {
      c = x.c;
      c.fillStyle = 'rgba(6,20,15,0.86)';
      roundRect(c, 0, 0, 260, 40, 14); c.fill();
      c.strokeStyle = rgba(ACCENT, 0.6); c.lineWidth = 2;
      roundRect(c, 1, 1, 258, 38, 14); c.stroke();
      finish(x);
    }
    // Thin coach strip, top edge, one line.
    x = makeTex(scene, 'te-strip', 520, 40);
    if (x) {
      c = x.c;
      var sg = c.createLinearGradient(0, 0, 520, 0);
      sg.addColorStop(0, 'rgba(6,24,18,0)');
      sg.addColorStop(0.18, 'rgba(6,24,18,0.82)');
      sg.addColorStop(0.82, 'rgba(6,24,18,0.82)');
      sg.addColorStop(1, 'rgba(6,24,18,0)');
      c.fillStyle = sg; roundRect(c, 0, 0, 520, 40, 12); c.fill();
      finish(x);
    }
    // Run boundary banner plate, 60 percent of the 960 wide stage.
    x = makeTex(scene, 'te-banner', 576, 96);
    if (x) {
      c = x.c;
      var bg2 = c.createLinearGradient(0, 0, 576, 0);
      bg2.addColorStop(0, 'rgba(8,32,24,0.05)');
      bg2.addColorStop(0.12, 'rgba(8,32,24,0.92)');
      bg2.addColorStop(0.88, 'rgba(8,32,24,0.92)');
      bg2.addColorStop(1, 'rgba(8,32,24,0.05)');
      c.fillStyle = bg2; c.fillRect(0, 0, 576, 96);
      c.fillStyle = rgba(ACCENT, 0.85);
      c.fillRect(72, 4, 432, 3);
      c.fillRect(72, 89, 432, 3);
      finish(x);
    }

    // Virtual stick.
    x = makeTex(scene, 'te-stick', 148, 148);
    if (x) {
      c = x.c;
      softDisc(c, 74, 74, 72, 0x061a12, 0.42, 0);
      c.strokeStyle = rgba(INK, 0.34); c.lineWidth = 3;
      tessCircle(c, 74, 74, 60, 44);
      c.strokeStyle = rgba(INK, 0.16); c.lineWidth = 2;
      tessCircle(c, 74, 74, 40, 36);
      finish(x);
    }
    x = makeTex(scene, 'te-knob', 76, 76);
    if (x) {
      c = x.c;
      var kg = c.createRadialGradient(32, 28, 2, 38, 38, 34);
      kg.addColorStop(0, 'rgba(255,255,255,0.95)');
      kg.addColorStop(1, rgba(ACCENT, 0.75));
      c.fillStyle = kg; c.beginPath(); c.arc(38, 38, 32, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(6,24,18,0.7)'; c.lineWidth = 2.5;
      tessCircle(c, 38, 38, 32, 36);
      finish(x);
    }

    // Action buttons: icons over labels, 96 px so the hit area clears 44 css px.
    actionTex(scene, 'te-act-sprint', function (cc) {
      cc.strokeStyle = '#eafff4'; cc.lineWidth = 6; cc.lineCap = 'round'; cc.lineJoin = 'round';
      cc.beginPath(); cc.moveTo(30, 22); cc.lineTo(52, 46); cc.lineTo(34, 46); cc.lineTo(54, 74); cc.stroke();
      cc.beginPath(); cc.moveTo(60, 26); cc.lineTo(72, 26); cc.moveTo(56, 44); cc.lineTo(74, 44); cc.moveTo(62, 62); cc.lineTo(76, 62); cc.stroke();
    });
    actionTex(scene, 'te-act-tackle', function (cc) {
      cc.strokeStyle = '#eafff4'; cc.lineWidth = 6; cc.lineCap = 'round';
      cc.beginPath(); cc.moveTo(26, 66); cc.lineTo(58, 40); cc.stroke();
      cc.beginPath(); cc.moveTo(58, 40); cc.lineTo(74, 46); cc.stroke();
      cc.fillStyle = '#eafff4';
      cc.beginPath(); cc.arc(66, 30, 9, 0, TAU); cc.fill();
    });
    actionTex(scene, 'te-act-pause', function (cc) {
      cc.fillStyle = '#eafff4';
      roundRect(cc, 34, 28, 10, 44, 4); cc.fill();
      roundRect(cc, 56, 28, 10, 44, 4); cc.fill();
    });

    // Digit sheet for the score and clock. Phaser Text re-renders a canvas and
    // re-uploads a texture on every setText; the clock ticks once a second, so
    // the two numbers that change during play are drawn from baked glyphs.
    var GLYPHS = '0123456789:- ';
    x = makeTex(scene, 'te-digits', DIGIT_W * GLYPHS.length, DIGIT_H);
    if (x) {
      c = x.c;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 30px ui-monospace, Menlo, Monaco, Consolas, monospace';
      c.fillStyle = '#ffffff';
      for (i = 0; i < GLYPHS.length; i++) {
        var ch = GLYPHS.charAt(i);
        if (ch !== ' ') c.fillText(ch, i * DIGIT_W + DIGIT_W / 2, DIGIT_H / 2 + 1);
        x.t.add(DIGIT_FRAME[ch], 0, i * DIGIT_W, 0, DIGIT_W, DIGIT_H);
      }
      finish(x);
    }

    // Medal discs.
    var med = root.TEContent.MEDAL_COLOR;
    ['gold', 'silver', 'bronze', 'none'].forEach(function (k) {
      var mx = makeTex(scene, 'te-medal-' + k, 72, 72);
      if (!mx) return;
      var mc = mx.c, col = med[k] || 0x64798a;
      var mg = mc.createRadialGradient(30, 26, 2, 36, 36, 34);
      mg.addColorStop(0, rgba(C.mixColor(col, 0xffffff, 0.55), 1));
      mg.addColorStop(1, rgba(C.mixColor(col, 0x000000, 0.35), 1));
      mc.fillStyle = mg; mc.beginPath(); mc.arc(36, 36, 28, 0, TAU); mc.fill();
      mc.strokeStyle = rgba(C.mixColor(col, 0xffffff, 0.3), 0.9); mc.lineWidth = 3;
      tessCircle(mc, 36, 36, 28, 36);
      mc.strokeStyle = rgba(0x06140e, 0.5); mc.lineWidth = 2;
      tessCircle(mc, 36, 36, 20, 30);
      finish(mx);
    });

    // Title crest for the menu.
    x = makeTex(scene, 'te-crest', 220, 240);
    if (x) {
      c = x.c;
      c.fillStyle = rgba(PANEL, 0.94);
      c.beginPath();
      c.moveTo(14, 16); c.lineTo(206, 16); c.lineTo(206, 140);
      c.quadraticCurveTo(206, 208, 110, 232);
      c.quadraticCurveTo(14, 208, 14, 140);
      c.closePath(); c.fill();
      c.strokeStyle = rgba(ACCENT, 0.85); c.lineWidth = 5; c.stroke();
      c.fillStyle = rgba(ACCENT, 0.2);
      c.fillRect(14, 62, 192, 26);
      c.fillRect(14, 108, 192, 26);
      c.strokeStyle = rgba(INK, 0.9); c.lineWidth = 4;
      tessCircle(c, 110, 120, 40, 34);
      c.fillStyle = rgba(INK, 0.92);
      for (i = 0; i < 5; i++) {
        var aa = (i / 5) * TAU + 0.4;
        c.beginPath(); c.arc(110 + Math.cos(aa) * 24, 120 + Math.sin(aa) * 24, 6, 0, TAU); c.fill();
      }
      c.fillStyle = rgba(INK, 0.9);
      c.beginPath(); c.arc(110, 120, 9, 0, TAU); c.fill();
      finish(x);
    }

    // Menu backdrop: stadium silhouette, works behind every menu screen.
    x = makeTex(scene, 'te-menubg', gw, gh);
    if (x) {
      c = x.c;
      var R = rnd(0x2f19);
      var g2 = c.createLinearGradient(0, 0, 0, gh);
      g2.addColorStop(0, '#071c16');
      g2.addColorStop(0.55, '#0a2a20');
      g2.addColorStop(1, '#04120d');
      c.fillStyle = g2; c.fillRect(0, 0, gw, gh);
      softDisc(c, gw * 0.5, gh * 0.1, gh * 0.9, 0x2fae86, 0.16, 0);
      // Distant stand tiers.
      for (i = 0; i < 3; i++) {
        var yy = gh * (0.42 + i * 0.09);
        c.fillStyle = rgba(C.mixColor(0x0c2a21, 0x000000, i * 0.2), 0.85);
        c.beginPath();
        c.moveTo(0, yy + 40);
        for (var xx = 0; xx <= gw; xx += 60) c.lineTo(xx, yy + Math.sin(xx * 0.01 + i) * 6);
        c.lineTo(gw, gh); c.lineTo(0, gh); c.closePath(); c.fill();
      }
      // Crowd speckle.
      for (i = 0; i < 900; i++) {
        var sx2 = R() * gw, sy2 = gh * 0.4 + R() * gh * 0.35;
        c.fillStyle = rgba([0xffd166, 0x8df1bc, 0x9ecbff, 0xf7f3e6][(R() * 4) | 0], 0.12 + R() * 0.2);
        c.fillRect(sx2, sy2, 2, 2);
      }
      // Turf foreground.
      c.fillStyle = 'rgba(4,20,14,0.86)';
      c.fillRect(0, gh * 0.78, gw, gh * 0.22);
      c.strokeStyle = 'rgba(233,251,241,0.12)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, gh * 0.86); c.lineTo(gw, gh * 0.86); c.stroke();
      finish(x);
    }
  }

  function panelTex(scene, key, w, h, col, r, a) {
    var x = makeTex(scene, key, w, h);
    if (!x) return;
    var c = x.c;
    c.fillStyle = rgba(col, a);
    roundRect(c, 0, 0, w, h, r); c.fill();
    c.strokeStyle = rgba(EDGE, 0.5); c.lineWidth = 2;
    roundRect(c, 1, 1, w - 2, h - 2, r); c.stroke();
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.4, 'rgba(255,255,255,0)');
    c.fillStyle = g; roundRect(c, 0, 0, w, h, r); c.fill();
    finish(x);
  }

  function buttonTex(scene, key, w, h, col, edge) {
    var x = makeTex(scene, key, w, h);
    if (!x) return;
    var c = x.c;
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(C.mixColor(col, 0xffffff, 0.16), 0.97));
    g.addColorStop(1, rgba(C.mixColor(col, 0x000000, 0.2), 0.97));
    c.fillStyle = g;
    roundRect(c, 0, 0, w, h, 14); c.fill();
    c.strokeStyle = rgba(edge, 0.85); c.lineWidth = 2.5;
    roundRect(c, 1.5, 1.5, w - 3, h - 3, 13); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(c, 4, 3, w - 8, h * 0.42, 10); c.fill();
    finish(x);
  }

  function actionTex(scene, key, draw) {
    var x = makeTex(scene, key, 100, 100);
    if (!x) return;
    var c = x.c;
    softDisc(c, 50, 50, 48, 0x061a12, 0.5, 0);
    c.fillStyle = 'rgba(10,38,29,0.72)';
    c.beginPath(); c.arc(50, 50, 40, 0, TAU); c.fill();
    c.strokeStyle = rgba(ACCENT, 0.7); c.lineWidth = 3;
    tessCircle(c, 50, 50, 40, 40);
    draw(c);
    finish(x);
  }

  /* --------------------------------------------------------------- audio */
  function buildAudio(kit) {
    var RATE = 22050;
    var urls = {};

    function encode(f32) {
      var n = f32.length;
      var buf = new ArrayBuffer(44 + n * 2);
      var v = new DataView(buf);
      function s(off, str) { for (var i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); }
      s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE');
      s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
      v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      s(36, 'data'); v.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) {
        var q = f32[i];
        if (q > 1) q = 1; else if (q < -1) q = -1;
        v.setInt16(44 + i * 2, q * 32767, true);
      }
      try { return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })); } catch (e) { return null; }
    }

    function make(seconds, fn) {
      var n = Math.max(1, Math.round(seconds * RATE));
      var b = new Float32Array(n);
      fn(b, n, RATE);
      for (var i = 0; i < n; i++) b[i] = Math.tanh(b[i] * 1.3) * 0.82;
      return encode(b);
    }

    function osc(type, phase) {
      if (type === 'saw') return 2 * (phase - Math.floor(phase + 0.5));
      if (type === 'square') return (phase - Math.floor(phase)) < 0.5 ? 1 : -1;
      if (type === 'tri') return 4 * Math.abs(phase - Math.floor(phase + 0.75) + 0.25) - 1;
      return Math.sin(phase * TAU);
    }
    function tone(b, rate, t0, dur, f0, f1, amp, type, curve) {
      var i0 = Math.floor(t0 * rate), n = Math.floor(dur * rate), ph = 0;
      for (var i = 0; i < n; i++) {
        var idx = i0 + i;
        if (idx < 0 || idx >= b.length) continue;
        var u = i / n;
        ph += (f0 + (f1 - f0) * u) / rate;
        b[idx] += osc(type || 'sine', ph) * amp * Math.pow(1 - u, curve == null ? 2.2 : curve);
      }
    }
    function noise(b, rate, t0, dur, amp, c0, c1, curve) {
      var i0 = Math.floor(t0 * rate), n = Math.floor(dur * rate);
      var y = 0, rr = rnd(0x2545F491 ^ ((i0 + 7) * 2654435761));
      for (var i = 0; i < n; i++) {
        var idx = i0 + i;
        if (idx < 0 || idx >= b.length) continue;
        var u = i / n;
        var cut = c0 + (c1 - c0) * u;
        var a = 1 - Math.exp(-TAU * cut / rate);
        y += a * ((rr() * 2 - 1) - y);
        b[idx] += y * amp * Math.pow(1 - u, curve == null ? 2 : curve);
      }
    }
    // Sustained band limited noise, used for the crowd bed. Loops seamlessly
    // because the envelope is a full period of a slow sine.
    function crowd(b, rate, amp, swellHz) {
      var y1 = 0, y2 = 0, rr = rnd(0x9e3779b1);
      for (var i = 0; i < b.length; i++) {
        var u = i / b.length;
        var swell = 0.62 + 0.38 * Math.sin(u * TAU * (swellHz || 1));
        var a1 = 1 - Math.exp(-TAU * 900 / rate);
        var a2 = 1 - Math.exp(-TAU * 240 / rate);
        y1 += a1 * ((rr() * 2 - 1) - y1);
        y2 += a2 * (y1 - y2);
        b[i] += y2 * amp * swell;
      }
    }

    /* --- sfx: twelve distinct cues -------------------------------------- */
    urls.pass = make(0.13, function (b, n, r) {
      tone(b, r, 0, 0.1, 420, 250, 0.2, 'tri', 2.6);
      noise(b, r, 0, 0.05, 0.1, 3800, 700, 2.6);
    });
    urls.kick = make(0.2, function (b, n, r) {
      tone(b, r, 0, 0.16, 200, 92, 0.36, 'tri', 2.2);
      noise(b, r, 0, 0.07, 0.2, 5200, 600, 2.4);
    });
    urls.trap = make(0.1, function (b, n, r) {
      tone(b, r, 0, 0.07, 300, 190, 0.16, 'sine', 3);
      noise(b, r, 0, 0.04, 0.08, 2600, 500, 3);
    });
    urls.tackle = make(0.24, function (b, n, r) {
      noise(b, r, 0, 0.2, 0.3, 2400, 260, 1.8);
      tone(b, r, 0, 0.1, 150, 70, 0.2, 'square', 2.6);
    });
    urls.slide = make(0.42, function (b, n, r) {
      noise(b, r, 0, 0.4, 0.24, 1600, 320, 1.1);
    });
    urls.post = make(0.5, function (b, n, r) {
      tone(b, r, 0, 0.45, 880, 700, 0.3, 'sine', 1.6);
      tone(b, r, 0, 0.3, 1760, 1500, 0.12, 'sine', 2.2);
    });
    urls.save = make(0.3, function (b, n, r) {
      noise(b, r, 0, 0.16, 0.24, 3200, 400, 2);
      tone(b, r, 0.02, 0.2, 340, 200, 0.18, 'tri', 2.4);
    });
    urls.goal = make(1.5, function (b, n, r) {
      // Rising fanfare over a crowd swell.
      var notes = [392, 523, 659, 784];
      for (var i = 0; i < notes.length; i++) tone(b, r, i * 0.11, 0.9 - i * 0.08, notes[i], notes[i], 0.16, 'square', 2.4);
      tone(b, r, 0.42, 1.0, 784, 1046, 0.14, 'tri', 2);
      noise(b, r, 0, 1.4, 0.16, 1400, 500, 0.7);
    });
    urls.concede = make(0.9, function (b, n, r) {
      var notes2 = [330, 262, 220];
      for (var i = 0; i < notes2.length; i++) tone(b, r, i * 0.14, 0.6, notes2[i], notes2[i] * 0.98, 0.16, 'tri', 2.4);
      noise(b, r, 0, 0.6, 0.08, 900, 300, 1.4);
    });
    urls.whistle = make(0.6, function (b, n, r) {
      for (var i = 0; i < 3; i++) {
        tone(b, r, i * 0.16, 0.13, 2350 + Math.sin(i) * 60, 2500, 0.16, 'sine', 1.4);
        tone(b, r, i * 0.16, 0.13, 3130, 3260, 0.07, 'sine', 1.4);
        noise(b, r, i * 0.16, 0.13, 0.05, 4200, 3200, 1.4);
      }
    });
    urls.chip = make(0.09, function (b, n, r) {
      tone(b, r, 0, 0.07, 900, 1240, 0.13, 'sine', 2.6);
    });
    urls.tap = make(0.08, function (b, n, r) {
      tone(b, r, 0, 0.06, 620, 760, 0.14, 'tri', 2.8);
    });
    urls.medal = make(1.1, function (b, n, r) {
      var seq = [523, 659, 784, 1046];
      for (var i = 0; i < seq.length; i++) tone(b, r, i * 0.1, 0.8 - i * 0.07, seq[i], seq[i], 0.14, 'sine', 2.2);
      tone(b, r, 0.4, 0.7, 1568, 1568, 0.06, 'sine', 2.6);
    });
    urls.unlock = make(0.8, function (b, n, r) {
      tone(b, r, 0, 0.3, 440, 660, 0.15, 'tri', 2.2);
      tone(b, r, 0.18, 0.5, 660, 880, 0.13, 'sine', 2.2);
    });

    /* --- music: three loops, crossfaded through the GGKit music bus ----- */
    // Shared chord walk in A minor, 8 second loops at 100 bpm.
    function bassLine(b, r, root0, beats, amp) {
      for (var i = 0; i < beats.length; i++) {
        var t0 = i * 0.6;
        tone(b, r, t0, 0.55, root0 * beats[i], root0 * beats[i] * 0.99, amp, 'tri', 1.6);
      }
    }
    function pluck(b, r, t0, f, amp) {
      tone(b, r, t0, 0.34, f, f, amp, 'square', 3.2);
      tone(b, r, t0, 0.2, f * 2, f * 2, amp * 0.4, 'sine', 3.4);
    }
    function drum(b, r, t0, kickAmp, hatAmp) {
      tone(b, r, t0, 0.16, 130, 48, kickAmp, 'sine', 2);
      noise(b, r, t0 + 0.3, 0.06, hatAmp, 7000, 4000, 2.6);
    }

    urls.anthem = make(9.6, function (b, n, r) {
      crowd(b, r, 0.055, 1);
      var steps = [1, 1, 1.2, 1.2, 0.9, 0.9, 1.335, 1.335, 1, 1, 1.2, 1.2, 1.5, 1.5, 1.335, 1.335];
      bassLine(b, r, 110, steps, 0.11);
      var mel = [440, 523, 587, 523, 440, 392, 440, 523, 587, 659, 587, 523, 494, 440, 392, 440];
      for (var i = 0; i < mel.length; i++) pluck(b, r, i * 0.6 + 0.15, mel[i], 0.05);
      for (var k = 0; k < 16; k++) drum(b, r, k * 0.6, 0.14, 0.03);
    });

    urls.matchday = make(9.6, function (b, n, r) {
      crowd(b, r, 0.075, 2);
      var steps2 = [1, 1, 1.335, 1.335, 1.2, 1.2, 0.9, 0.9, 1, 1, 1.5, 1.5, 1.335, 1.335, 1.2, 1.2];
      bassLine(b, r, 110, steps2, 0.13);
      var arp = [660, 880, 660, 587, 523, 660, 784, 660];
      for (var i = 0; i < 16; i++) pluck(b, r, i * 0.6 + 0.3, arp[i % arp.length], 0.045);
      for (var k = 0; k < 16; k++) drum(b, r, k * 0.6, 0.17, 0.045);
      // Off beat clap for drive.
      for (var q = 0; q < 8; q++) noise(b, r, 0.6 + q * 1.2, 0.09, 0.07, 3000, 900, 2);
    });

    urls.pressure = make(9.6, function (b, n, r) {
      crowd(b, r, 0.1, 4);
      var steps3 = [1, 0.9, 1, 0.9, 1.2, 1.335, 1.2, 1.335, 1, 0.9, 1, 0.9, 1.5, 1.335, 1.5, 1.335];
      bassLine(b, r, 110, steps3, 0.15);
      for (var i = 0; i < 32; i++) pluck(b, r, i * 0.3 + 0.15, [880, 784, 660, 587][i % 4], 0.04);
      for (var k = 0; k < 32; k++) drum(b, r, k * 0.3, 0.13, 0.05);
      for (var q = 0; q < 16; q++) noise(b, r, 0.3 + q * 0.6, 0.07, 0.075, 3400, 1000, 2);
    });

    var clean = {};
    for (var kk in urls) if (urls[kk]) clean[kk] = urls[kk];
    kit.audio.register(clean);
    return Object.keys(clean);
  }

  root.TEArt = {
    PITCH_KEY: PITCH_KEY,
    DIGIT_W: DIGIT_W,
    DIGIT_H: DIGIT_H,
    DIGIT_FRAME: DIGIT_FRAME,
    FRAMES: FRAMES,
    buildCommon: buildCommon,
    buildPitch: buildPitch,
    buildTeams: buildTeams,
    buildAudio: buildAudio,
    kitFor: kitFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
