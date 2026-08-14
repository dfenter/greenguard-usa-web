/* Skyhammer - sh_art.js
 * Procedural art and audio. Every pixel and every sample in this title is
 * generated here at boot; the game ships no bitmap or audio payload beyond
 * the launcher icons, so the whole build sits far under the payload budget.
 *
 * Rules this file exists to enforce:
 *  - Phaser Graphics replays its ENTIRE command list every frame, and
 *    Graphics.arc walks a sweep in 0.01 rad steps. Nothing static is ever
 *    left in the display list as Graphics: rings, plates, HUD chrome, the
 *    bomb button and the shockwave are all BAKED into canvas textures here
 *    and drawn as plain Images.
 *  - Bullets render through Phaser Blitters, and a Blitter can only address
 *    ONE texture. Every bullet colour and size therefore lives as a frame in
 *    a single baked atlas ('sh_bullets'), with white cores and additive-look
 *    glow baked in rather than tinted at runtime.
 *  - Enemies, bosses and pods need idle / hit / destroy states. Those are
 *    baked as separate frames and swapped by setFrame, never by tint, so the
 *    canvas fallback renderer shows the same thing WebGL does.
 */
var SHArt = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------ palette */
  var CSS = {
    ink: '#050914', deep: '#0b1430', steel: '#20305c', hull: '#16224a',
    cyan: '#7ef9ff', amber: '#ffd166', rose: '#ff5f9e', violet: '#b07cff',
    mint: '#7cf5c0', ember: '#ff8a4c', peri: '#8fa6ff', pink: '#ff9ad1',
    text: '#dff2ff', dim: '#8fa6c8', white: '#ffffff', danger: '#ff4d6d'
  };
  var PAL = {};
  (function () {
    for (var k in CSS) if (CSS.hasOwnProperty(k)) PAL[k] = parseInt(CSS[k].slice(1), 16);
  })();

  /* Bullet lanes. Pattern grammar is colour coded: a player who learns the
   * colour learns the motion before the bullet has moved. */
  var LANE = {
    aimed: CSS.rose, fan: CSS.amber, spiral: CSS.cyan, wall: CSS.violet,
    ring: CSS.ember, arms: CSS.mint, rain: CSS.peri, pod: CSS.pink
  };
  var LANE_ORDER = ['aimed', 'fan', 'spiral', 'wall', 'ring', 'arms', 'rain', 'pod'];
  var SIZE_ORDER = ['s', 'm', 'l'];
  var SIZE_R = { s: 3.5, m: 4.6, l: 6.3 };

  /* ------------------------------------------------------------- canvas */
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(h1, h2, t) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    var r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
    var g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
    var bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  /* Deterministic noise so the baked art is byte-identical every boot. */
  function rnd(seed) {
    var s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function makeTex(scene, key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var t = scene.textures.createCanvas(key, w, h);
    // createCanvas can return null if the key survived a soft reload; the
    // guarded fallback keeps boot alive instead of throwing on ctx access.
    if (!t) return null;
    return t;
  }
  function finish(t) { if (t) t.refresh(); }

  /* --------------------------------------------------------- primitives */
  /* Radial falloff. The mid stop is a FRACTION of the peak alpha, not a
   * constant: hardcoding it made every faint glow brighter in its ring than
   * at its centre, which turned the nebula into grey doughnuts. */
  function softDisc(c, x, y, r, col, inner) {
    var a0 = inner == null ? 0.95 : inner;
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a0));
    g.addColorStop(0.45, rgba(col, a0 * 0.44));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath();
    for (var i = 0; i < pts.length; i += 2) {
      if (i === 0) c.moveTo(pts[0], pts[1]); else c.lineTo(pts[i], pts[i + 1]);
    }
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function ngon(c, x, y, r, n, rot, fill, stroke, lw) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = rot + i * TAU / n;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    poly(c, pts, fill, stroke, lw);
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  /* Hand-tessellated ring. Graphics.arc costs 2.4 ms/frame for HUD rings;
   * baking one here costs nothing at runtime. */
  function ring(c, x, y, rOuter, thickness, col, alpha, seg) {
    var n = seg || 96, i, a;
    var rIn = rOuter - thickness;
    c.beginPath();
    for (i = 0; i <= n; i++) { a = i / n * TAU; c.lineTo(x + Math.cos(a) * rOuter, y + Math.sin(a) * rOuter); }
    for (i = n; i >= 0; i--) { a = i / n * TAU; c.lineTo(x + Math.cos(a) * rIn, y + Math.sin(a) * rIn); }
    c.closePath();
    c.fillStyle = alpha == null ? col : rgba(col, alpha);
    c.fill('evenodd');
  }
  function glyph(c, s, x, y, size, col, weight) {
    c.font = (weight || '700') + ' ' + size + 'px Verdana, Geneva, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = col;
    c.fillText(s, x, y);
  }

  /* ============================================================ bullets */
  /* One atlas, one Blitter texture. Cell 22x22, 8 columns. */
  var BCELL = 22, BCOLS = 8;
  function buildBullets(scene) {
    var rows = SIZE_ORDER.length + 1;                 // + player shot row
    var t = makeTex(scene, 'sh_bullets', BCELL * BCOLS, BCELL * rows);
    if (!t) return;
    var c = t.getContext();
    var si, li;
    for (si = 0; si < SIZE_ORDER.length; si++) {
      var sz = SIZE_ORDER[si], r = SIZE_R[sz];
      for (li = 0; li < LANE_ORDER.length; li++) {
        var lane = LANE_ORDER[li], col = LANE[lane];
        var cx = li * BCELL + BCELL / 2, cy = si * BCELL + BCELL / 2;
        softDisc(c, cx, cy, r * 2.35, col, 0.85);
        c.fillStyle = col;
        c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
        c.fillStyle = rgba(CSS.white, 0.5);
        c.beginPath(); c.arc(cx, cy, r * 0.72, 0, TAU); c.fill();
        c.fillStyle = rgba(CSS.white, 0.96);
        c.beginPath(); c.arc(cx, cy - r * 0.1, r * 0.4, 0, TAU); c.fill();
        t.add('b_' + lane + '_' + sz, 0, li * BCELL, si * BCELL, BCELL, BCELL);
      }
    }
    /* Player shots on the last row. */
    var py = SIZE_ORDER.length * BCELL;
    function shot(idx, w, h, col, tipCol) {
      var x = idx * BCELL + BCELL / 2, y = py + BCELL / 2;
      softDisc(c, x, y, h * 0.62, col, 0.55);
      c.fillStyle = col;
      roundRect(c, x - w / 2, y - h / 2, w, h, w / 2); c.fill();
      c.fillStyle = tipCol;
      roundRect(c, x - w / 2 * 0.5, y - h / 2, w * 0.5, h * 0.55, w * 0.25); c.fill();
      t.add('pb_' + idx, 0, idx * BCELL, py, BCELL, BCELL);
    }
    shot(0, 3.4, 13, CSS.amber, CSS.white);       // pb_0 wide spread main
    shot(1, 2.4, 10, CSS.ember, CSS.amber);       // pb_1 angled side
    shot(2, 3.0, 16, CSS.cyan, CSS.white);        // pb_2 focus lance
    shot(3, 5.0, 18, CSS.mint, CSS.white);        // pb_3 power level shot
    finish(t);
  }
  function bulletFrame(lane, size) {
    // Guarded keyed lookup: a FAMILY[variant] miss hard-froze a shipped title.
    var l = LANE[lane] ? lane : 'aimed';
    var s = SIZE_R[size] ? size : 'm';
    return 'b_' + l + '_' + s;
  }

  /* ============================================================== ship */
  var SHIP_W = 34, SHIP_H = 38;
  function drawShip(c, x, y, state) {
    // state 0 idle, 1 hit, 2 destroyed
    var body = state === 1 ? CSS.white : (state === 2 ? '#2a1520' : CSS.hull);
    var edge = state === 1 ? CSS.white : (state === 2 ? CSS.danger : CSS.cyan);
    var core = state === 1 ? CSS.white : (state === 2 ? CSS.ember : CSS.cyan);
    if (state !== 2) softDisc(c, x, y + 2, 17, edge, 0.28);
    // wings
    poly(c, [x - 15, y + 11, x - 6, y - 2, x - 4, y + 9], mix(body, CSS.ink, 0.3), edge, 1.2);
    poly(c, [x + 15, y + 11, x + 6, y - 2, x + 4, y + 9], mix(body, CSS.ink, 0.3), edge, 1.2);
    // fuselage
    poly(c, [x, y - 16, x + 8, y + 4, x + 4, y + 12, x - 4, y + 12, x - 8, y + 4], body, edge, 1.6);
    // canopy
    poly(c, [x, y - 11, x + 3.4, y + 1, x - 3.4, y + 1], core, null, 0);
    if (state === 2) {
      c.strokeStyle = rgba(CSS.ink, 0.85); c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x - 7, y - 4); c.lineTo(x + 2, y + 2); c.lineTo(x - 3, y + 9);
      c.moveTo(x + 6, y - 6); c.lineTo(x + 1, y + 5);
      c.stroke();
    } else {
      c.fillStyle = rgba(CSS.white, 0.85);
      c.fillRect(x - 0.7, y - 14, 1.4, 6);
    }
  }
  function buildShip(scene) {
    var t = makeTex(scene, 'sh_ship', SHIP_W * 3, SHIP_H);
    if (!t) return;
    var c = t.getContext();
    for (var s = 0; s < 3; s++) {
      drawShip(c, s * SHIP_W + SHIP_W / 2, SHIP_H / 2, s);
      t.add('ship_' + s, 0, s * SHIP_W, 0, SHIP_W, SHIP_H);
    }
    finish(t);

    // Thruster flame, two frames, alternated by the cosmetic clock.
    var f = makeTex(scene, 'sh_flame', 32, 16);
    if (!f) return;
    var fc = f.getContext();
    for (var i = 0; i < 2; i++) {
      var ox = i * 16 + 8, len = i ? 13 : 9;
      softDisc(fc, ox, 4, 7, CSS.ember, 0.7);
      poly(fc, [ox - 3.2, 0, ox + 3.2, 0, ox, len], CSS.amber, null, 0);
      poly(fc, [ox - 1.6, 0, ox + 1.6, 0, ox, len * 0.62], CSS.white, null, 0);
      f.add('flame_' + i, 0, i * 16, 0, 16, 16);
    }
    finish(f);
  }

  /* ============================================================ enemies */
  var ECELL = 46;
  var ENEMY_KINDS = ['drone', 'pod', 'orb', 'block', 'lancer'];
  function enemyBody(c, x, y, kind, state, col) {
    var fill = state === 1 ? CSS.white : (state === 2 ? mix(col, CSS.ink, 0.72) : mix(col, CSS.ink, 0.45));
    var line = state === 1 ? CSS.white : (state === 2 ? rgba(CSS.ink, 0.8) : col);
    var R = 16;
    if (state !== 2) softDisc(c, x, y, R * 1.5, col, 0.3);
    if (kind === 'drone') {
      poly(c, [x, y + R, x + R, y - R * 0.66, x, y - R * 0.16, x - R, y - R * 0.66], fill, line, 2);
      c.fillStyle = state === 1 ? CSS.white : col;
      c.beginPath(); c.arc(x, y + R * 0.18, 3.2, 0, TAU); c.fill();
    } else if (kind === 'pod') {
      c.beginPath(); c.ellipse(x, y, R, R * 0.78, 0, 0, TAU);
      c.fillStyle = fill; c.fill(); c.strokeStyle = line; c.lineWidth = 2; c.stroke();
      ring(c, x, y, R * 0.52, 2.4, state === 1 ? CSS.white : col, 0.95, 40);
    } else if (kind === 'orb') {
      ngon(c, x, y, R, 6, 0, fill, line, 2.2);
      ngon(c, x, y, R * 0.5, 6, Math.PI / 6, state === 1 ? CSS.white : rgba(col, 0.85), null, 0);
    } else if (kind === 'block') {
      c.fillStyle = fill; c.fillRect(x - R, y - R * 0.82, R * 2, R * 1.64);
      c.strokeStyle = line; c.lineWidth = 2; c.strokeRect(x - R, y - R * 0.82, R * 2, R * 1.64);
      c.fillStyle = state === 1 ? CSS.white : rgba(col, 0.8);
      c.fillRect(x - R * 0.55, y - R * 0.3, R * 1.1, R * 0.6);
    } else { // lancer - thin fast diver
      poly(c, [x, y + R * 1.05, x + R * 0.55, y - R * 0.5, x, y - R, x - R * 0.55, y - R * 0.5], fill, line, 2);
      c.fillStyle = state === 1 ? CSS.white : col;
      c.fillRect(x - 1.6, y - R * 0.3, 3.2, R * 0.9);
    }
    if (state === 2) {
      c.strokeStyle = rgba(CSS.ink, 0.9); c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x - 9, y - 7); c.lineTo(x - 1, y - 1); c.lineTo(x - 6, y + 6);
      c.moveTo(x + 8, y - 4); c.lineTo(x + 2, y + 4); c.lineTo(x + 7, y + 9);
      c.stroke();
    }
  }
  function buildEnemies(scene) {
    var t = makeTex(scene, 'sh_enemies', ECELL * 3, ECELL * ENEMY_KINDS.length);
    if (!t) return;
    var c = t.getContext();
    var cols = { drone: CSS.rose, pod: CSS.amber, orb: CSS.cyan, block: CSS.violet, lancer: CSS.mint };
    for (var k = 0; k < ENEMY_KINDS.length; k++) {
      var kind = ENEMY_KINDS[k];
      for (var s = 0; s < 3; s++) {
        enemyBody(c, s * ECELL + ECELL / 2, k * ECELL + ECELL / 2, kind, s, cols[kind] || CSS.rose);
        t.add(kind + '_' + s, 0, s * ECELL, k * ECELL, ECELL, ECELL);
      }
    }
    finish(t);
  }
  function enemyFrame(kind, state) {
    var k = ENEMY_KINDS.indexOf(kind) >= 0 ? kind : 'drone';
    var s = (state === 1 || state === 2) ? state : 0;
    return k + '_' + s;
  }

  /* =============================================================== pods */
  /* Boss pods carry four STAGED damage states: pristine, cracked, critical,
   * and a white hit flash. The staged read is what sells pod destruction. */
  var PCELL = 44;
  function buildPods(scene) {
    var t = makeTex(scene, 'sh_pods', PCELL * 4, PCELL);
    if (!t) return;
    var c = t.getContext();
    for (var s = 0; s < 4; s++) {
      var x = s * PCELL + PCELL / 2, y = PCELL / 2, R = 15;
      var flash = s === 3;
      var wear = flash ? 0 : s;                          // 0 fresh .. 2 critical
      var col = flash ? CSS.white : [CSS.amber, CSS.ember, CSS.danger][wear];
      softDisc(c, x, y, R * 1.7, col, flash ? 0.85 : 0.34);
      ngon(c, x, y, R, 6, 0, flash ? CSS.white : mix(col, CSS.ink, 0.62), col, 2.4);
      ngon(c, x, y, R * 0.46, 6, Math.PI / 6, flash ? CSS.white : rgba(col, 0.9), null, 0);
      if (wear >= 1) {
        c.strokeStyle = rgba(CSS.ink, 0.85); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x - 8, y - 6); c.lineTo(x - 1, y + 1); c.lineTo(x - 5, y + 8); c.stroke();
      }
      if (wear >= 2) {
        c.strokeStyle = rgba(CSS.ink, 0.9); c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 9, y - 7); c.lineTo(x + 1, y - 1); c.lineTo(x + 8, y + 7); c.stroke();
        c.fillStyle = rgba(CSS.ink, 0.55);
        c.beginPath(); c.arc(x + 5, y + 4, 3.4, 0, TAU); c.fill();
      }
      t.add('pod_' + s, 0, s * PCELL, 0, PCELL, PCELL);
    }
    finish(t);
  }
  function podFrame(hpFrac, flash) {
    if (flash) return 'pod_3';
    if (hpFrac <= 0.3) return 'pod_2';
    if (hpFrac <= 0.62) return 'pod_1';
    return 'pod_0';
  }

  /* ============================================================== bosses */
  /* Five authored silhouettes, one per stage identity plus the finale. Each
   * bakes idle / hit / wrecked. Silhouette, not colour, carries identity. */
  var BOSS_W = 220, BOSS_H = 150;
  var BOSS_KEYS = ['kestrel', 'choir', 'weaver', 'bastion', 'prime'];

  function bossKestrel(c, x, y, fill, line, accent, wreck) {
    // Swept raptor frame: long forward wings, narrow cockpit spine.
    poly(c, [x - 96, y - 6, x - 30, y - 24, x - 18, y + 8, x - 62, y + 26], fill, line, 2.6);
    poly(c, [x + 96, y - 6, x + 30, y - 24, x + 18, y + 8, x + 62, y + 26], fill, line, 2.6);
    poly(c, [x, y - 52, x + 26, y - 8, x + 18, y + 40, x - 18, y + 40, x - 26, y - 8], mix(fill, CSS.ink, 0.2), line, 3);
    poly(c, [x, y - 40, x + 11, y - 4, x - 11, y - 4], accent, null, 0);
    ring(c, x, y + 14, 13, 3.4, accent, 0.95, 48);
    if (!wreck) { c.fillStyle = accent; c.beginPath(); c.arc(x, y + 14, 7, 0, TAU); c.fill(); }
  }
  function bossChoir(c, x, y, fill, line, accent, wreck) {
    // Cathedral organ: five arched pipes over a heavy plinth.
    for (var i = -2; i <= 2; i++) {
      var px = x + i * 30, ph = 66 - Math.abs(i) * 13;
      poly(c, [px - 12, y + 34, px - 12, y - ph + 12, px, y - ph, px + 12, y - ph + 12, px + 12, y + 34],
        mix(fill, CSS.ink, Math.abs(i) * 0.1), line, 2.2);
      if (!wreck) { c.fillStyle = rgba(accent, 0.9); c.fillRect(px - 3, y - ph + 20, 6, ph * 0.4); }
    }
    c.fillStyle = fill; c.fillRect(x - 92, y + 30, 184, 22);
    c.strokeStyle = line; c.lineWidth = 2.6; c.strokeRect(x - 92, y + 30, 184, 22);
    ring(c, x, y + 41, 12, 3.2, accent, 0.95, 48);
  }
  function bossWeaver(c, x, y, fill, line, accent, wreck) {
    // Ringed weaver: a core orb inside two counter-rotating halos with arms.
    var i, a;
    for (i = 0; i < 8; i++) {
      a = i * TAU / 8 + 0.18;
      poly(c, [x + Math.cos(a) * 22, y + Math.sin(a) * 22,
        x + Math.cos(a + 0.16) * 88, y + Math.sin(a + 0.16) * 52,
        x + Math.cos(a - 0.16) * 88, y + Math.sin(a - 0.16) * 52], mix(fill, CSS.ink, 0.24), line, 1.6);
    }
    ring(c, x, y, 62, 6, line, 0.85, 80);
    ring(c, x, y, 44, 4, accent, 0.7, 72);
    ngon(c, x, y, 26, 8, 0.4, fill, line, 3);
    if (!wreck) { softDisc(c, x, y, 22, accent, 0.95); }
  }
  function bossBastion(c, x, y, fill, line, accent, wreck) {
    // Fortress gate: slab body, portcullis teeth, shoulder blocks.
    c.fillStyle = fill; c.fillRect(x - 84, y - 40, 168, 84);
    c.strokeStyle = line; c.lineWidth = 3; c.strokeRect(x - 84, y - 40, 168, 84);
    for (var i = -3; i <= 3; i++) {
      poly(c, [x + i * 22 - 8, y + 44, x + i * 22 + 8, y + 44, x + i * 22, y + 62],
        mix(fill, CSS.ink, 0.16), line, 1.8);
    }
    c.fillStyle = mix(fill, CSS.ink, 0.3);
    c.fillRect(x - 108, y - 26, 24, 46); c.fillRect(x + 84, y - 26, 24, 46);
    c.strokeRect(x - 108, y - 26, 24, 46); c.strokeRect(x + 84, y - 26, 24, 46);
    if (!wreck) {
      c.fillStyle = rgba(accent, 0.92);
      c.fillRect(x - 56, y - 22, 112, 8);
      ring(c, x, y + 12, 16, 4, accent, 0.95, 56);
    }
  }
  function bossPrime(c, x, y, fill, line, accent, wreck) {
    // SKYHAMMER PRIME: a war hammer head over a braced haft.
    c.fillStyle = fill;
    poly(c, [x - 104, y - 34, x + 104, y - 34, x + 88, y + 16, x - 88, y + 16], fill, line, 3.2);
    c.fillStyle = mix(fill, CSS.ink, 0.2);
    poly(c, [x - 26, y + 16, x + 26, y + 16, x + 18, y + 64, x - 18, y + 64], mix(fill, CSS.ink, 0.2), line, 2.6);
    for (var i = -1; i <= 1; i += 2) {
      poly(c, [x + i * 104, y - 34, x + i * 128, y - 12, x + i * 96, y + 8], mix(fill, CSS.ink, 0.34), line, 2);
    }
    if (!wreck) {
      c.fillStyle = rgba(accent, 0.95);
      c.fillRect(x - 78, y - 22, 156, 9);
      ring(c, x, y - 6, 20, 5, accent, 0.95, 64);
      softDisc(c, x, y - 6, 15, accent, 0.9);
    }
    ring(c, x, y + 44, 11, 3, accent, wreck ? 0.3 : 0.9, 40);
  }
  var BOSS_DRAW = {
    kestrel: bossKestrel, choir: bossChoir, weaver: bossWeaver,
    bastion: bossBastion, prime: bossPrime
  };
  var BOSS_ACCENT = {
    kestrel: CSS.rose, choir: CSS.amber, weaver: CSS.cyan,
    bastion: CSS.violet, prime: CSS.ember
  };
  function buildBosses(scene) {
    for (var b = 0; b < BOSS_KEYS.length; b++) {
      var key = BOSS_KEYS[b];
      var t = makeTex(scene, 'sh_boss_' + key, BOSS_W * 3, BOSS_H);
      if (!t) continue;
      var c = t.getContext();
      var accent = BOSS_ACCENT[key] || CSS.rose;
      for (var s = 0; s < 3; s++) {
        var x = s * BOSS_W + BOSS_W / 2, y = BOSS_H / 2;
        var fill = s === 1 ? CSS.white : (s === 2 ? '#160c18' : CSS.hull);
        var line = s === 1 ? CSS.white : (s === 2 ? rgba(CSS.danger, 0.7) : accent);
        var acc = s === 1 ? CSS.white : accent;
        if (s !== 2) softDisc(c, x, y, 96, accent, 0.16);
        (BOSS_DRAW[key] || bossKestrel)(c, x, y, fill, line, acc, s === 2);
        t.add('boss_' + s, 0, s * BOSS_W, 0, BOSS_W, BOSS_H);
      }
      finish(t);
    }
  }
  function bossTexture(key) {
    return 'sh_boss_' + (BOSS_DRAW[key] ? key : 'kestrel');
  }

  /* ============================================================ pickups */
  var DROPS = [
    { key: 'power', label: 'P', col: CSS.mint },
    { key: 'bomb', label: 'B', col: CSS.amber },
    { key: 'score', label: 'S', col: CSS.cyan },
    { key: 'extend', label: '1', col: CSS.rose },
    { key: 'shield', label: 'O', col: CSS.violet }
  ];
  var DCELL = 34;
  function buildDrops(scene) {
    var t = makeTex(scene, 'sh_drops', DCELL * DROPS.length, DCELL);
    if (!t) return;
    var c = t.getContext();
    for (var i = 0; i < DROPS.length; i++) {
      var d = DROPS[i], x = i * DCELL + DCELL / 2, y = DCELL / 2;
      softDisc(c, x, y, 15, d.col, 0.55);
      ngon(c, x, y, 12, 6, Math.PI / 6, mix(d.col, CSS.ink, 0.62), d.col, 2.2);
      glyph(c, d.label, x, y + 0.5, 13, d.col);
      t.add('drop_' + d.key, 0, i * DCELL, 0, DCELL, DCELL);
    }
    finish(t);
  }
  function dropFrame(key) {
    for (var i = 0; i < DROPS.length; i++) if (DROPS[i].key === key) return 'drop_' + key;
    return 'drop_score';
  }

  /* ========================================================== particles */
  function buildParticles(scene) {
    var t = makeTex(scene, 'sh_spark', 12, 12);
    if (t) { softDisc(t.getContext(), 6, 6, 6, CSS.white, 1); finish(t); }

    t = makeTex(scene, 'sh_glow', 40, 40);
    if (t) { softDisc(t.getContext(), 20, 20, 20, CSS.white, 0.85); finish(t); }

    t = makeTex(scene, 'sh_shard', 8, 20);
    if (t) {
      var c = t.getContext();
      poly(c, [4, 0, 8, 10, 4, 20, 0, 10], CSS.white, null, 0);
      finish(t);
    }
    t = makeTex(scene, 'sh_smoke', 34, 34);
    if (t) {
      var sc = t.getContext(), r = rnd(0x51F17);
      for (var i = 0; i < 9; i++) {
        softDisc(sc, 17 + (r() - 0.5) * 13, 17 + (r() - 0.5) * 13, 8 + r() * 7, CSS.white, 0.2);
      }
      finish(t);
    }
    t = makeTex(scene, 'sh_ringfx', 72, 72);
    if (t) { ring(t.getContext(), 36, 36, 33, 6, CSS.white, 0.95, 96); finish(t); }

    t = makeTex(scene, 'sh_star4', 18, 18);
    if (t) {
      var stc = t.getContext();
      poly(stc, [9, 0, 11, 7, 18, 9, 11, 11, 9, 18, 7, 11, 0, 9, 7, 7], CSS.white, null, 0);
      finish(t);
    }
  }

  /* =============================================================== font */
  /* A fixed-width glyph atlas for every HUD value that changes while the
   * game is running. A Phaser Text object rebuilds its canvas and re-uploads
   * a texture on EVERY setText, so a live score readout costs a texture
   * upload per frame. These glyphs are pooled Images pointing at one baked
   * texture: changing the score moves quads and swaps frames, and touches no
   * canvas at all. Static labels stay as Text, because they never change. */
  var FONT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ .,:/+-x%';
  var FCELL_W = 14, FCELL_H = 22;
  function buildFont(scene) {
    var cols = 16;
    var rows = Math.ceil(FONT_CHARS.length / cols);
    var t = makeTex(scene, 'sh_font', cols * FCELL_W, rows * FCELL_H);
    if (!t) return;
    var c = t.getContext();
    for (var i = 0; i < FONT_CHARS.length; i++) {
      var col = i % cols, row = Math.floor(i / cols);
      var x = col * FCELL_W, y = row * FCELL_H;
      glyph(c, FONT_CHARS.charAt(i), x + FCELL_W / 2, y + FCELL_H / 2 + 1, 16, CSS.white);
      t.add('g_' + i, 0, x, y, FCELL_W, FCELL_H);
    }
    finish(t);
  }
  function fontFrame(ch) {
    var i = FONT_CHARS.indexOf(ch);
    if (i < 0) i = FONT_CHARS.indexOf(' ');   // guarded: any unmapped glyph
    return 'g_' + i;
  }

  /* ========================================================== ui chrome */
  function buildUI(scene, gw, gh) {
    // Top HUD band, baked once at the real game width.
    var t = makeTex(scene, 'sh_hudtop', gw, 46);
    if (t) {
      var c = t.getContext();
      var g = c.createLinearGradient(0, 0, 0, 46);
      g.addColorStop(0, rgba(CSS.ink, 0.92)); g.addColorStop(1, rgba(CSS.ink, 0.2));
      c.fillStyle = g; c.fillRect(0, 0, gw, 46);
      c.fillStyle = rgba(CSS.cyan, 0.35); c.fillRect(0, 44, gw, 1);
      c.fillStyle = rgba(CSS.cyan, 0.12);
      for (var i = 0; i < gw; i += 8) c.fillRect(i, 41, 4, 1);
      finish(t);
    }
    // Bottom safe band so lives / bombs read over bullet density.
    t = makeTex(scene, 'sh_hudbot', gw, 56);
    if (t) {
      var cb = t.getContext();
      var gb = cb.createLinearGradient(0, 0, 0, 56);
      gb.addColorStop(0, rgba(CSS.ink, 0)); gb.addColorStop(1, rgba(CSS.ink, 0.86));
      cb.fillStyle = gb; cb.fillRect(0, 0, gw, 56);
      finish(t);
    }
    // Bomb button: baked ring + plate, two states.
    t = makeTex(scene, 'sh_bombbtn', 176, 88);
    if (t) {
      var bc = t.getContext();
      for (var s = 0; s < 2; s++) {
        var x = s * 88 + 44, y = 44, col = s ? CSS.amber : CSS.dim;
        softDisc(bc, x, y, 40, col, s ? 0.34 : 0.14);
        bc.fillStyle = rgba(col, s ? 0.14 : 0.07);
        bc.beginPath(); bc.arc(x, y, 32, 0, TAU); bc.fill();
        ring(bc, x, y, 32, 2.6, col, s ? 0.95 : 0.42, 72);
        ring(bc, x, y, 24, 1.2, col, s ? 0.45 : 0.2, 56);
        glyph(bc, 'BOMB', x, y - 6, 11, rgba(col, s ? 1 : 0.5));
        t.add('bomb_' + s, 0, s * 88, 0, 88, 88);
      }
      finish(t);
    }
    // Focus hitbox ring, drawn only in focus mode.
    t = makeTex(scene, 'sh_focusring', 44, 44);
    if (t) {
      var fc = t.getContext();
      ring(fc, 22, 22, 20, 1.6, CSS.amber, 0.9, 64);
      ring(fc, 22, 22, 13, 1.0, CSS.amber, 0.45, 48);
      for (var q = 0; q < 4; q++) {
        var a = q * TAU / 4 + Math.PI / 4;
        fc.fillStyle = rgba(CSS.amber, 0.95);
        fc.fillRect(22 + Math.cos(a) * 20 - 1.5, 22 + Math.sin(a) * 20 - 1.5, 3, 3);
      }
      finish(t);
    }
    // True hitbox dot. Focus mode shows exactly what kills you.
    t = makeTex(scene, 'sh_hitdot', 16, 16);
    if (t) {
      var hc = t.getContext();
      softDisc(hc, 8, 8, 8, CSS.white, 0.9);
      hc.fillStyle = CSS.white; hc.beginPath(); hc.arc(8, 8, 2.8, 0, TAU); hc.fill();
      hc.fillStyle = CSS.danger; hc.beginPath(); hc.arc(8, 8, 1.4, 0, TAU); hc.fill();
      finish(t);
    }
    // Bomb shockwave, baked so no Graphics.arc runs per frame.
    t = makeTex(scene, 'sh_shock', 256, 256);
    if (t) {
      var wc = t.getContext();
      ring(wc, 128, 128, 124, 16, CSS.amber, 0.85, 128);
      ring(wc, 128, 128, 104, 6, CSS.white, 0.7, 112);
      ring(wc, 128, 128, 86, 3, CSS.amber, 0.4, 96);
      finish(t);
    }
    // Boundary banner plate; live events use the compact corner chip.
    t = makeTex(scene, 'sh_banner', 320, 76);
    if (t) {
      var nc = t.getContext();
      var ng = nc.createLinearGradient(0, 0, 320, 0);
      ng.addColorStop(0, rgba(CSS.ink, 0)); ng.addColorStop(0.12, rgba(CSS.deep, 0.94));
      ng.addColorStop(0.88, rgba(CSS.deep, 0.94)); ng.addColorStop(1, rgba(CSS.ink, 0));
      nc.fillStyle = ng; nc.fillRect(0, 0, 320, 76);
      nc.fillStyle = rgba(CSS.cyan, 0.75); nc.fillRect(24, 4, 272, 2);
      nc.fillStyle = rgba(CSS.cyan, 0.75); nc.fillRect(24, 70, 272, 2);
      nc.fillStyle = rgba(CSS.cyan, 0.2); nc.fillRect(24, 8, 272, 1);
      finish(t);
    }
    // Generic dialog / card plate.
    t = makeTex(scene, 'sh_plate', 64, 64);
    if (t) {
      var pc = t.getContext();
      pc.fillStyle = rgba(CSS.deep, 0.94);
      roundRect(pc, 2, 2, 60, 60, 12); pc.fill();
      pc.strokeStyle = rgba(CSS.cyan, 0.4); pc.lineWidth = 2;
      roundRect(pc, 2, 2, 60, 60, 12); pc.stroke();
      finish(t);
    }
    // Medals.
    var medalCols = { none: CSS.dim, bronze: '#e08a52', silver: '#cfe0f0', gold: CSS.amber };
    var order = ['none', 'bronze', 'silver', 'gold'];
    t = makeTex(scene, 'sh_medal', 28 * 4, 28);
    if (t) {
      var mc = t.getContext();
      for (var mi = 0; mi < order.length; mi++) {
        var mk = order[mi], mcol = medalCols[mk], mx = mi * 28 + 14, my = 14;
        if (mk !== 'none') softDisc(mc, mx, my, 13, mcol, 0.5);
        ngon(mc, mx, my, 10, 6, 0, mk === 'none' ? rgba(CSS.steel, 0.6) : mix(mcol, CSS.ink, 0.45), mcol, 1.8);
        if (mk !== 'none') { mc.fillStyle = rgba(mcol, 0.9); mc.beginPath(); mc.arc(mx, my, 4, 0, TAU); mc.fill(); }
        t.add('medal_' + mk, 0, mi * 28, 0, 28, 28);
      }
      finish(t);
    }
    // Lives and bomb pips.
    t = makeTex(scene, 'sh_pip', 36, 18);
    if (t) {
      var qc = t.getContext();
      poly(qc, [9, 3, 15, 15, 3, 15], CSS.cyan, null, 0);
      poly(qc, [27, 3, 33, 9, 27, 15, 21, 9], CSS.amber, null, 0);
      t.add('pip_life', 0, 0, 0, 18, 18);
      t.add('pip_bomb', 0, 18, 0, 18, 18);
      finish(t);
    }
    // Graze route gate pylon.
    t = makeTex(scene, 'sh_gate', 24, 96);
    if (t) {
      var gc2 = t.getContext();
      var gg = gc2.createLinearGradient(0, 0, 0, 96);
      gg.addColorStop(0, rgba(CSS.mint, 0.1)); gg.addColorStop(0.5, rgba(CSS.mint, 0.75));
      gg.addColorStop(1, rgba(CSS.mint, 0.1));
      gc2.fillStyle = gg; gc2.fillRect(8, 0, 8, 96);
      gc2.fillStyle = rgba(CSS.white, 0.85);
      gc2.fillRect(10, 0, 4, 96);
      for (var gy = 6; gy < 96; gy += 16) {
        gc2.fillStyle = rgba(CSS.mint, 0.9);
        gc2.fillRect(4, gy, 16, 2);
      }
      finish(t);
    }
    // Red damage vignette. Baked, stretched, never redrawn.
    t = makeTex(scene, 'sh_vig', 128, 128);
    if (t) {
      var vc = t.getContext();
      var vg = vc.createRadialGradient(64, 64, 26, 64, 64, 68);
      vg.addColorStop(0, rgba(CSS.danger, 0));
      vg.addColorStop(0.7, rgba(CSS.danger, 0.22));
      vg.addColorStop(1, rgba(CSS.danger, 0.72));
      vc.fillStyle = vg; vc.fillRect(0, 0, 128, 128);
      finish(t);
    }
    // Flat white plate for flashes (1x1 stretched, no Graphics).
    t = makeTex(scene, 'sh_white', 4, 4);
    if (t) { var wc2 = t.getContext(); wc2.fillStyle = '#ffffff'; wc2.fillRect(0, 0, 4, 4); finish(t); }

    // Title logo: baked wordmark so the menu never runs a live Graphics.
    t = makeTex(scene, 'sh_logo', 320, 96);
    if (t) {
      var lc = t.getContext();
      lc.textAlign = 'center'; lc.textBaseline = 'middle';
      lc.font = '800 40px Verdana, Geneva, system-ui, sans-serif';
      lc.fillStyle = rgba(CSS.cyan, 0.28);
      lc.fillText('SKYHAMMER', 160, 44);
      lc.fillStyle = rgba(CSS.cyan, 0.28);
      lc.fillText('SKYHAMMER', 160, 40);
      var lg = lc.createLinearGradient(0, 20, 0, 66);
      lg.addColorStop(0, CSS.white); lg.addColorStop(0.55, CSS.cyan); lg.addColorStop(1, CSS.violet);
      lc.fillStyle = lg;
      lc.fillText('SKYHAMMER', 160, 42);
      lc.font = '700 12px Verdana, Geneva, system-ui, sans-serif';
      lc.fillStyle = rgba(CSS.amber, 0.92);
      lc.fillText('P A T T E R N   G R A M M A R', 160, 76);
      finish(t);
    }
  }

  /* ======================================================== backgrounds */
  function buildBackgrounds(scene) {
    // Tileable star fields. Wrapping is guaranteed by drawing every star
    // that crosses an edge a second time on the opposite side.
    /* Density is deliberately low. These tiles are stretched across the whole
     * portrait screen and repeated, so a tile that looks "nice and starry" at
     * 256 px reads as a grey wash in play and buries the bullets. Stars get a
     * tight core with only a hint of bloom. */
    function stars(key, size, count, maxR, alpha, seed) {
      var t = makeTex(scene, key, size, size);
      if (!t) return;
      var c = t.getContext(), r = rnd(seed);
      for (var i = 0; i < count; i++) {
        var x = r() * size, y = r() * size, rad = 0.4 + r() * maxR;
        var a = alpha * (0.3 + r() * 0.7);
        for (var ox = -1; ox <= 1; ox++) {
          for (var oy = -1; oy <= 1; oy++) {
            var px = x + ox * size, py = y + oy * size;
            if (px < -6 || px > size + 6 || py < -6 || py > size + 6) continue;
            if (rad > 1.1) softDisc(c, px, py, rad * 2.2, CSS.white, a * 0.35);
            c.fillStyle = rgba(CSS.white, a);
            c.beginPath(); c.arc(px, py, rad, 0, TAU); c.fill();
          }
        }
      }
      finish(t);
    }
    stars('sh_bg_far', 256, 64, 0.9, 0.5, 0x9E3779);
    stars('sh_bg_near', 256, 22, 1.7, 0.8, 0x1F123B);

    // Nebula. Very faint: it is a mood layer, never a fog bank.
    var t = makeTex(scene, 'sh_bg_neb', 256, 256);
    if (t) {
      var c = t.getContext(), r = rnd(0x7C3B9), i, ox, oy;
      for (i = 0; i < 9; i++) {
        var x = r() * 256, y = r() * 256, rad = 40 + r() * 56;
        for (ox = -1; ox <= 1; ox++) for (oy = -1; oy <= 1; oy++) {
          softDisc(c, x + ox * 256, y + oy * 256, rad, CSS.white, 0.11);
        }
      }
      finish(t);
    }
    // Horizon bands: fast parallax streaks that sell vertical speed.
    t = makeTex(scene, 'sh_bg_band', 256, 256);
    if (t) {
      var bc = t.getContext(), br = rnd(0x51F17);
      for (var b = 0; b < 14; b++) {
        var bx = br() * 256, by = br() * 256, bw = 24 + br() * 66;
        bc.fillStyle = rgba(CSS.white, 0.05 + br() * 0.06);
        bc.fillRect(bx, by, bw, 2);
        if (bx + bw > 256) bc.fillRect(bx - 256, by, bw, 2);
      }
      finish(t);
    }
  }

  /* ============================================================== audio */
  /* Procedural WAV synthesis. GGKit's audio bus is the only playback path in
   * this title; these object URLs are simply what it decodes. No file is
   * shipped, so the ogg / mp3 packaging rule cannot be violated here. */
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
        var x = f32[i];
        if (x > 1) x = 1; else if (x < -1) x = -1;
        v.setInt16(44 + i * 2, x * 32767, true);
      }
      try {
        return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      } catch (e) { return null; }
    }

    function make(seconds, fn) {
      var n = Math.max(1, Math.round(seconds * RATE));
      var b = new Float32Array(n);
      fn(b, n, RATE);
      // Soft limiter so layered stems never clip after the bus gain.
      for (var i = 0; i < n; i++) b[i] = Math.tanh(b[i] * 1.35) * 0.82;
      return encode(b);
    }

    function osc(type, phase) {
      if (type === 'saw') return 2 * (phase - Math.floor(phase + 0.5));
      if (type === 'square') return (phase - Math.floor(phase)) < 0.5 ? 1 : -1;
      if (type === 'tri') return 4 * Math.abs(phase - Math.floor(phase + 0.75) + 0.25) - 1;
      return Math.sin(phase * TAU);
    }
    // Additive tone with an exponential envelope and optional pitch glide.
    function tone(b, rate, t0, dur, f0, f1, amp, type, curve) {
      var i0 = Math.floor(t0 * rate), n = Math.floor(dur * rate);
      var ph = 0;
      for (var i = 0; i < n; i++) {
        var idx = i0 + i;
        if (idx < 0 || idx >= b.length) continue;
        var u = i / n;
        var f = f0 + (f1 - f0) * u;
        ph += f / rate;
        var env = Math.pow(1 - u, curve == null ? 2.2 : curve);
        b[idx] += osc(type || 'square', ph) * amp * env;
      }
    }
    // Filtered noise burst. One-pole lowpass, cutoff glides down.
    function noise(b, rate, t0, dur, amp, c0, c1, curve) {
      var i0 = Math.floor(t0 * rate), n = Math.floor(dur * rate);
      var y = 0, rr = rnd(0x2545F491 ^ (i0 * 2654435761));
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

    /* ---- sfx -------------------------------------------------------- */
    urls.shot = make(0.07, function (b, n, r) {
      tone(b, r, 0, 0.06, 940, 560, 0.24, 'square', 3.2);
      noise(b, r, 0, 0.03, 0.09, 5200, 900, 3);
    });
    urls.shotFocus = make(0.07, function (b, n, r) {
      tone(b, r, 0, 0.055, 1280, 820, 0.2, 'tri', 3.4);
    });
    urls.hit = make(0.06, function (b, n, r) {
      tone(b, r, 0, 0.05, 360, 190, 0.22, 'square', 2.6);
      noise(b, r, 0, 0.04, 0.12, 3000, 600, 2.4);
    });
    urls.graze = make(0.06, function (b, n, r) {
      tone(b, r, 0, 0.05, 1720, 2180, 0.16, 'sine', 3);
      tone(b, r, 0.005, 0.04, 2580, 2900, 0.07, 'sine', 3);
    });
    urls.boom = make(0.4, function (b, n, r) {
      noise(b, r, 0, 0.34, 0.42, 3600, 220, 1.9);
      tone(b, r, 0, 0.3, 210, 48, 0.3, 'saw', 2.1);
    });
    urls.podbreak = make(0.5, function (b, n, r) {
      noise(b, r, 0, 0.42, 0.4, 5200, 400, 1.7);
      tone(b, r, 0, 0.24, 520, 130, 0.24, 'square', 2.2);
      tone(b, r, 0.08, 0.3, 300, 70, 0.2, 'saw', 2);
    });
    urls.bomb = make(1.15, function (b, n, r) {
      noise(b, r, 0, 0.95, 0.5, 7000, 160, 1.4);
      tone(b, r, 0, 0.85, 150, 26, 0.42, 'saw', 1.6);
      tone(b, r, 0.02, 0.5, 620, 90, 0.2, 'square', 2);
      tone(b, r, 0.3, 0.6, 92, 34, 0.24, 'sine', 1.5);
    });
    urls.phase = make(1.0, function (b, n, r) {
      var notes = [220, 277.2, 329.6, 440];
      for (var i = 0; i < notes.length; i++) {
        tone(b, r, i * 0.09, 0.62 - i * 0.05, notes[i], notes[i] * 1.005, 0.2, 'saw', 2.4);
        tone(b, r, i * 0.09, 0.5, notes[i] * 2, notes[i] * 2, 0.09, 'square', 2.8);
      }
      noise(b, r, 0, 0.5, 0.16, 4200, 300, 2);
    });
    urls.warn = make(1.1, function (b, n, r) {
      for (var i = 0; i < 3; i++) {
        tone(b, r, i * 0.34, 0.16, 520, 700, 0.2, 'square', 1.4);
        tone(b, r, i * 0.34 + 0.16, 0.16, 700, 520, 0.2, 'square', 1.4);
      }
    });
    urls.clear = make(1.4, function (b, n, r) {
      var notes = [392, 523.3, 659.3, 784, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone(b, r, i * 0.11, 0.85 - i * 0.07, notes[i], notes[i], 0.18, 'tri', 2.2);
        tone(b, r, i * 0.11, 0.4, notes[i] * 2, notes[i] * 2, 0.06, 'sine', 2.6);
      }
    });
    urls.medal = make(1.0, function (b, n, r) {
      var notes = [659.3, 830.6, 987.8, 1318.5];
      for (var i = 0; i < notes.length; i++) {
        tone(b, r, i * 0.07, 0.55 - i * 0.05, notes[i], notes[i], 0.16, 'sine', 2.4);
      }
      noise(b, r, 0, 0.16, 0.08, 8000, 2400, 2);
    });
    urls.pickup = make(0.24, function (b, n, r) {
      tone(b, r, 0, 0.1, 660, 990, 0.2, 'square', 2.4);
      tone(b, r, 0.07, 0.13, 990, 1320, 0.16, 'square', 2.4);
    });
    urls.extend = make(0.9, function (b, n, r) {
      var notes = [523.3, 659.3, 784, 1046.5, 1318.5];
      for (var i = 0; i < notes.length; i++) tone(b, r, i * 0.075, 0.4, notes[i], notes[i], 0.17, 'tri', 2.2);
    });
    urls.death = make(1.0, function (b, n, r) {
      noise(b, r, 0, 0.8, 0.42, 4200, 140, 1.5);
      tone(b, r, 0, 0.75, 300, 42, 0.3, 'saw', 1.8);
      tone(b, r, 0.05, 0.5, 180, 60, 0.2, 'square', 2);
    });
    urls.ui = make(0.1, function (b, n, r) {
      tone(b, r, 0, 0.08, 780, 980, 0.16, 'square', 3);
    });
    urls.gate = make(0.7, function (b, n, r) {
      tone(b, r, 0, 0.5, 440, 1320, 0.18, 'sine', 2);
      tone(b, r, 0.05, 0.4, 660, 1760, 0.12, 'tri', 2.2);
      noise(b, r, 0, 0.25, 0.1, 9000, 1800, 2);
    });
    urls.gameover = make(1.6, function (b, n, r) {
      var notes = [392, 349.2, 293.7, 233.1];
      for (var i = 0; i < notes.length; i++) {
        tone(b, r, i * 0.22, 0.7, notes[i], notes[i] * 0.99, 0.19, 'saw', 2);
      }
    });

    /* ---- music stems ------------------------------------------------ */
    /* Two intensity layers, crossfaded by GGKit: field and boss. Both loop
     * on an exact bar boundary so the crossfade never clicks. */
    function stem(bpm, bars, root, mode, drive) {
      var spb = 60 / bpm;
      var dur = spb * 4 * bars;
      return make(dur, function (b, n, r) {
        var beat = spb, step = spb / 4;
        var scale = mode === 'minor' ? [0, 3, 5, 7, 10, 12] : [0, 2, 3, 7, 8, 10];
        var seq = rnd(0x9E3779B9 ^ Math.round(bpm * 977));
        var i, t;
        var totalSteps = Math.round(dur / step);
        for (i = 0; i < totalSteps; i++) {
          t = i * step;
          var bar = Math.floor(i / 16);
          // bass: root pulses on the 1 and the and-of-3
          if (i % 8 === 0) {
            var bn = root * (bar % 4 === 3 ? 1.1892 : 1);
            tone(b, r, t, beat * 0.9, bn, bn * 0.99, 0.2 * drive, 'saw', 1.8);
            tone(b, r, t, beat * 0.5, bn * 0.5, bn * 0.5, 0.16 * drive, 'sine', 1.6);
          }
          // arp
          if (i % 2 === 0) {
            var deg = scale[Math.floor(seq() * scale.length)];
            var f = root * 4 * Math.pow(2, deg / 12);
            tone(b, r, t, step * 1.7, f, f, 0.055 * drive, 'square', 2.6);
          }
          // kick
          if (i % 8 === 0 || i % 16 === 10) {
            tone(b, r, t, 0.16, 150, 44, 0.34, 'sine', 1.5);
            noise(b, r, t, 0.05, 0.12, 2400, 400, 2);
          }
          // snare-ish
          if (i % 16 === 8) noise(b, r, t, 0.16, 0.2, 5200, 900, 2);
          // hat
          if (i % 2 === 1) noise(b, r, t, 0.05, 0.055, 11000, 5200, 2.4);
        }
      });
    }
    urls.m_field = stem(122, 4, 110, 'minor', 1.0);
    urls.m_boss = stem(142, 4, 98, 'phryg', 1.25);
    urls.m_menu = stem(96, 2, 130.8, 'minor', 0.55);

    var reg = {};
    for (var k in urls) if (urls.hasOwnProperty(k) && urls[k]) reg[k] = urls[k];
    kit.audio.register(reg);
    return Object.keys(reg);
  }

  /* ============================================================== build */
  function build(scene, gw, gh) {
    buildBullets(scene);
    buildShip(scene);
    buildEnemies(scene);
    buildPods(scene);
    buildBosses(scene);
    buildDrops(scene);
    buildParticles(scene);
    buildFont(scene);
    buildUI(scene, gw, gh);
    buildBackgrounds(scene);
  }

  return {
    build: build, buildAudio: buildAudio,
    CSS: CSS, PAL: PAL, LANE: LANE, LANE_ORDER: LANE_ORDER, SIZE_R: SIZE_R,
    FCELL_W: FCELL_W, FCELL_H: FCELL_H, fontFrame: fontFrame,
    bulletFrame: bulletFrame, enemyFrame: enemyFrame, podFrame: podFrame,
    dropFrame: dropFrame, bossTexture: bossTexture,
    BOSS_KEYS: BOSS_KEYS, BOSS_W: BOSS_W, BOSS_H: BOSS_H,
    rgba: rgba, mix: mix
  };
})();
