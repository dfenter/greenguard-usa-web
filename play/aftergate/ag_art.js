/* Aftergate - procedural art + audio bakery.
 *
 * Nothing is fetched. Every sprite, panel, particle and sound in this title
 * is generated in code at boot: Graphics -> canvas texture (Phaser Graphics
 * replays its whole command list every frame, so NOTHING static is left in
 * the display list), and Float32 PCM -> WAV Blob -> GGKit audio bus.
 */
'use strict';
var AG = window.AG || {};
window.AG = AG;
AG.art = {};

/* ------------------------------------------------------------- helpers */
function bake(scene, key, w, h, fn) {
  if (scene.textures.exists(key)) return key;
  var g = scene.make.graphics({ add: false });
  fn(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}
AG.art.bake = bake;

/* hand-tessellated ring: Graphics.arc walks the sweep in 0.01 rad steps,
 * which is 2.4 ms/frame for a HUD ring. We bake polygons instead. */
function ringPoints(cx, cy, r, segs) {
  var pts = [], i;
  for (i = 0; i < segs; i++) {
    var a = (i / segs) * Math.PI * 2;
    pts.push(new Phaser.Geom.Point(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}
AG.art.ringPoints = ringPoints;

function shade(color, f) {
  var r = (color >> 16) & 255, gg = (color >> 8) & 255, b = color & 255;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  gg = Math.max(0, Math.min(255, Math.round(gg * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return (r << 16) | (gg << 8) | b;
}
AG.art.shade = shade;

function mixc(a, b, t) {
  var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t);
}
AG.art.mix = mixc;

/* ==================================================================== */
/* SPRITES                                                              */
/* ==================================================================== */

function bakeSoldier(scene, key, body, head, opts) {
  opts = opts || {};
  bake(scene, key, 20, 30, function (g) {
    var lean = opts.lean || 0;
    var legA = opts.legA || 0;
    // shadow
    g.fillStyle(0x000000, 0.30); g.fillEllipse(10, 28, 14, 5);
    // legs
    g.fillStyle(shade(body, 0.6), 1);
    g.fillRoundedRect(5 - legA, 18, 4, 9, 1);
    g.fillRoundedRect(11 + legA, 18, 4, 9, 1);
    g.fillStyle(shade(body, 0.35), 1);
    g.fillRect(4 - legA, 26, 6, 2); g.fillRect(10 + legA, 26, 6, 2);
    // torso
    g.fillStyle(body, 1);
    g.fillRoundedRect(4 + lean, 9, 12, 12, 3);
    g.fillStyle(shade(body, 1.25), 1);
    g.fillRoundedRect(5 + lean, 10, 10, 3, 2);
    g.fillStyle(shade(body, 0.55), 1);
    g.fillRect(8 + lean, 13, 4, 7);
    // pauldrons
    g.fillStyle(shade(body, 0.78), 1);
    g.fillCircle(4 + lean, 13, 3);
    g.fillCircle(16 + lean, 13, 3);
    // head
    g.fillStyle(head, 1);
    g.fillCircle(10.5 + lean, 6.5, 4.3);
    g.fillStyle(shade(head, 1.3), 1);
    g.fillEllipse(10 + lean, 4.5, 7, 3);
    g.fillStyle(0x102033, 1); g.fillRect(7 + lean, 7, 7, 2);
    g.fillStyle(0xffffff, 0.8); g.fillRect(8 + lean, 7, 2, 1);
    // spear haft
    if (opts.spear !== false) {
      g.lineStyle(2, 0x9c7a4a, 1);
      g.lineBetween(17 + lean, 1 + (opts.spearY || 0), 17 + lean, 22 + (opts.spearY || 0));
      g.fillStyle(0xd8e4f0, 1);
      g.fillTriangle(17 + lean, (opts.spearY || 0) - 2, 14 + lean, (opts.spearY || 0) + 4, 20 + lean, (opts.spearY || 0) + 4);
    }
    if (opts.glow) {
      g.fillStyle(opts.glow, 0.35);
      g.fillRect(3, 1, 14, 26);
    }
  });
}

function bakeFoe(scene, key, w, h, color, style) {
  bake(scene, key, w + 8, h + 12, function (g) {
    var cx = (w + 8) / 2;
    g.fillStyle(0x000000, 0.32); g.fillEllipse(cx, h + 8, w * 0.8, 5);
    var dark = shade(color, 0.62), lite = shade(color, 1.3);
    if (style === 'runner') {
      g.fillStyle(dark, 1); g.fillRect(cx - 5, h - 8, 3, 8); g.fillRect(cx + 2, h - 8, 3, 8);
      g.fillStyle(color, 1); g.fillRoundedRect(cx - w / 2 + 3, 8, w - 6, h - 16, 4);
      g.fillStyle(lite, 1); g.fillRect(cx - w / 2 + 3, 8, w - 6, 3);
      g.fillStyle(dark, 1); g.fillRect(cx - 4, 2, 8, 7);
      g.fillStyle(0x2d1732, 1); g.fillRect(cx - w / 2 + 5, h - 12, w - 10, 3);
      g.fillStyle(0xffe6a0, 1); g.fillRect(cx - 3, 4, 2, 2); g.fillRect(cx + 1, 4, 2, 2);
    } else if (style === 'brute') {
      g.fillStyle(dark, 1); g.fillRect(cx - 8, h - 6, 6, 8); g.fillRect(cx + 2, h - 6, 6, 8);
      g.fillStyle(color, 1); g.fillRoundedRect(cx - w / 2 + 2, 8, w - 4, h - 12, 5);
      g.fillStyle(lite, 1); g.fillRect(cx - w / 2 + 2, 8, w - 4, 4);
      g.fillStyle(shade(color, 0.45), 1); g.fillRect(cx - w / 2 - 1, 12, 4, h - 20);
      g.fillRect(cx + w / 2 - 3, 12, 4, h - 20);
      g.fillStyle(dark, 1); g.fillRect(cx - 6, 1, 12, 9);
      g.fillStyle(0xff6b6b, 1); g.fillRect(cx - 4, 4, 3, 3); g.fillRect(cx + 1, 4, 3, 3);
      g.fillStyle(0xd8e4f0, 1); g.fillRect(cx - w / 2 - 4, 14, 5, 3);
      g.lineStyle(2, lite, 0.8); g.strokeRoundedRect(cx - w / 2 + 2, 8, w - 4, h - 12, 5);
    } else if (style === 'ravager') {
      g.fillStyle(dark, 1); g.fillRect(cx - 9, h - 4, 7, 8); g.fillRect(cx + 2, h - 4, 7, 8);
      g.fillStyle(color, 1); g.fillRoundedRect(cx - w / 2 + 2, 10, w - 4, h - 12, 6);
      g.fillStyle(lite, 1); g.fillRect(cx - w / 2 + 2, 10, w - 4, 5);
      g.fillStyle(0x2a1410, 1); g.fillRect(cx - w / 2 + 5, 18, w - 10, 4);
      // horned helm
      g.fillStyle(shade(color, 0.5), 1); g.fillRect(cx - 7, 2, 14, 10);
      g.fillStyle(0xffd479, 1);
      g.fillRect(cx - 11, 0, 4, 6); g.fillRect(cx + 7, 0, 4, 6);
      g.fillStyle(0xffe6a0, 1); g.fillRect(cx - 4, 6, 3, 3); g.fillRect(cx + 1, 6, 3, 3);
      // greatshield
      g.fillStyle(shade(color, 0.4), 1); g.fillRect(cx + w / 2 - 2, 12, 7, h - 18);
      g.lineStyle(2, 0xffd479, 0.85); g.strokeRoundedRect(cx - w / 2 + 2, 10, w - 4, h - 12, 6);
    } else { // grunt
      g.fillStyle(dark, 1); g.fillRect(cx - 6, h - 6, 4, 8); g.fillRect(cx + 2, h - 6, 4, 8);
      g.fillStyle(color, 1); g.fillRoundedRect(cx - w / 2 + 3, 9, w - 6, h - 14, 4);
      g.fillStyle(lite, 1); g.fillRect(cx - w / 2 + 3, 9, w - 6, 3);
      g.fillStyle(dark, 1); g.fillRect(cx - 5, 2, 10, 8);
      g.fillStyle(0xffd0d0, 1); g.fillRect(cx - 3, 5, 2, 2); g.fillRect(cx + 1, 5, 2, 2);
      g.fillStyle(0x8a94a6, 1); g.fillRect(cx + w / 2 - 3, 12, 5, 10);
      g.lineStyle(2, lite, 0.7); g.strokeRoundedRect(cx - w / 2 + 3, 9, w - 6, h - 14, 4);
    }
  });
}

/* ==================================================================== */
/* ROAD + LANDMARKS                                                     */
/* ==================================================================== */

var ROAD_L = 46, ROAD_R = 494;
AG.ROAD_L = ROAD_L; AG.ROAD_R = ROAD_R;

function bakeRoad(scene, site) {
  var key = 'road_' + site.id;
  bake(scene, key, 540, 320, function (g) {
    var rnd = AG.rng(site.num * 7717 + 13);
    // verge
    g.fillStyle(site.grass, 1); g.fillRect(0, 0, 540, 320);
    var i;
    for (i = 0; i < 90; i++) {
      var vx = rnd() < 0.5 ? rnd() * (ROAD_L - 12) : ROAD_R + 10 + rnd() * (540 - ROAD_R - 12);
      var vy = rnd() * 320;
      g.fillStyle(shade(site.grass, 1 + rnd() * 0.7), 0.8);
      g.fillRect(vx, vy, 2 + rnd() * 4, 2 + rnd() * 3);
    }
    // road bed
    g.fillStyle(site.road, 1); g.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, 320);
    // paving bands
    for (i = 0; i < 320; i += 40) {
      g.fillStyle(i % 80 === 0 ? site.road2 : shade(site.road, 1.06), 1);
      g.fillRect(ROAD_L, i, ROAD_R - ROAD_L, 38);
    }
    // paving grain + cracks
    for (i = 0; i < 260; i++) {
      var px = ROAD_L + rnd() * (ROAD_R - ROAD_L);
      var py = rnd() * 320;
      g.fillStyle(rnd() < 0.5 ? shade(site.road, 0.82) : shade(site.road, 1.22), 0.55);
      g.fillRect(px, py, 1 + rnd() * 5, 1 + rnd() * 2);
    }
    for (i = 0; i < 10; i++) {
      var cx = ROAD_L + 20 + rnd() * (ROAD_R - ROAD_L - 40);
      var cy = rnd() * 300;
      g.fillStyle(shade(site.road, 0.6), 0.7);
      var j, ccx = cx;
      for (j = 0; j < 8; j++) { g.fillRect(ccx, cy + j * 3, 2, 3); ccx += (rnd() - 0.5) * 5; }
    }
    // centre seam
    g.fillStyle(0xffffff, 0.05);
    for (i = 0; i < 320; i += 80) g.fillRect(268, i, 4, 44);
    // rails
    g.fillStyle(site.rail, 1);
    g.fillRect(ROAD_L - 10, 0, 10, 320); g.fillRect(ROAD_R, 0, 10, 320);
    g.fillStyle(shade(site.rail, 1.35), 1);
    for (i = 0; i < 320; i += 26) {
      g.fillRect(ROAD_L - 10, i, 10, 3); g.fillRect(ROAD_R, i, 10, 3);
    }
    g.fillStyle(shade(site.rail, 0.55), 1);
    g.fillRect(ROAD_L - 14, 0, 4, 320); g.fillRect(ROAD_R + 10, 0, 4, 320);
    // edge shadow onto road
    g.fillStyle(0x000000, 0.22);
    g.fillRect(ROAD_L, 0, 10, 320); g.fillRect(ROAD_R - 10, 0, 10, 320);
  });
  return key;
}

function bakeLandmarks(scene) {
  bake(scene, 'lm_cairn', 300, 260, function (g) {
    g.fillStyle(0x000000, 0.25); g.fillEllipse(150, 244, 190, 24);
    var stones = [[150, 210, 96, 34], [150, 178, 84, 32], [152, 148, 70, 30], [148, 122, 54, 26], [150, 100, 38, 20]];
    for (var i = 0; i < stones.length; i++) {
      var s = stones[i];
      g.fillStyle(shade(0x6b7688, 0.7 + i * 0.09), 1);
      g.fillRect(s[0] - s[2] / 2, s[1] - s[3] / 2, s[2], s[3]);
      g.fillStyle(0xffffff, 0.10);
      g.fillRect(s[0] - s[2] / 2, s[1] - s[3] / 2, s[2], 4);
    }
    g.fillStyle(0x7ee0a8, 0.9); g.fillRect(146, 58, 8, 44);
    g.fillStyle(0x7ee0a8, 1); g.fillRect(150, 46, 44, 26);
    g.fillStyle(0x0e1622, 1); g.fillRect(158, 54, 10, 10);
  });
  bake(scene, 'lm_arch', 420, 300, function (g) {
    g.fillStyle(0x000000, 0.25); g.fillEllipse(210, 288, 340, 22);
    g.fillStyle(0x4a4763, 1);
    g.fillRect(40, 60, 60, 226);
    g.fillRect(320, 96, 58, 190);
    g.fillStyle(0x5c5878, 1);
    g.fillRect(40, 60, 60, 8); g.fillRect(320, 96, 58, 8);
    // broken span
    var i;
    for (i = 0; i < 7; i++) {
      g.fillStyle(shade(0x4a4763, 1 - i * 0.05), 1);
      g.fillRect(96 + i * 26, 58 - i * 3, 26, 26 + i * 2);
    }
    for (i = 0; i < 3; i++) {
      g.fillStyle(shade(0x4a4763, 0.85), 1);
      g.fillRect(300 - i * 24, 92 - i * 4, 24, 24);
    }
    g.fillStyle(0x8fd0ff, 0.55);
    g.fillRect(150, 130, 8, 8); g.fillRect(230, 160, 6, 6); g.fillRect(280, 120, 7, 7);
  });
  bake(scene, 'lm_totem', 260, 320, function (g) {
    g.fillStyle(0x000000, 0.28); g.fillEllipse(130, 306, 150, 22);
    g.fillStyle(0x4a3830, 1); g.fillRect(114, 70, 32, 234);
    g.fillStyle(0x5c4438, 1); g.fillRect(114, 70, 32, 8);
    var i;
    for (i = 0; i < 5; i++) {
      var y = 96 + i * 42;
      g.fillStyle(0xd9cbb4, 1);
      g.fillRect(94 - (i % 2) * 14, y, 22, 18);
      g.fillRect(144 + (i % 2) * 14, y + 8, 22, 18);
      g.fillStyle(0x2a1a18, 1);
      g.fillRect(99 - (i % 2) * 14, y + 5, 4, 4);
      g.fillRect(108 - (i % 2) * 14, y + 5, 4, 4);
      g.fillRect(149 + (i % 2) * 14, y + 13, 4, 4);
      g.fillRect(158 + (i % 2) * 14, y + 13, 4, 4);
    }
    g.fillStyle(0xffa04d, 1); g.fillRect(104, 40, 52, 32);
    g.fillStyle(0x2a1a18, 1); g.fillRect(114, 50, 10, 10); g.fillRect(136, 50, 10, 10);
  });
  bake(scene, 'lm_gate', 480, 360, function (g) {
    g.fillStyle(0x000000, 0.30); g.fillEllipse(240, 348, 420, 24);
    g.fillStyle(0x3a2224, 1); g.fillRect(20, 40, 110, 316); g.fillRect(350, 40, 110, 316);
    g.fillStyle(0x4c2e2f, 1); g.fillRect(20, 40, 110, 12); g.fillRect(350, 40, 110, 12);
    g.fillStyle(0x2c191b, 1); g.fillRect(130, 70, 220, 286);
    g.fillStyle(0x6b3c34, 1); g.fillRect(120, 40, 240, 34);
    var i;
    for (i = 0; i < 9; i++) { g.fillStyle(0x8a4c40, 1); g.fillRect(124 + i * 26, 20, 18, 22); }
    // portcullis
    g.fillStyle(0xffd479, 0.85);
    for (i = 0; i < 8; i++) g.fillRect(140 + i * 27, 78, 5, 270);
    for (i = 0; i < 6; i++) g.fillRect(132, 96 + i * 46, 216, 5);
    // brazier glow
    g.fillStyle(0xff8a3c, 0.5); g.fillEllipse(75, 120, 90, 90);
    g.fillStyle(0xffd479, 0.9); g.fillEllipse(75, 120, 34, 40);
    g.fillStyle(0xff8a3c, 0.5); g.fillEllipse(405, 120, 90, 90);
    g.fillStyle(0xffd479, 0.9); g.fillEllipse(405, 120, 34, 40);
  });
}

/* ==================================================================== */
/* MAIN BAKE                                                            */
/* ==================================================================== */

AG.art.buildAll = function (scene) {
  var i;

  /* ---- panels / chrome (nine-slice sources) ---- */
  bake(scene, 'panel9', 40, 40, function (g) {
    g.fillStyle(0x131a26, 0.94); g.fillRoundedRect(0, 0, 40, 40, 12);
    g.lineStyle(2, 0x2f4055, 1); g.strokeRoundedRect(1, 1, 38, 38, 11);
    g.fillStyle(0xffffff, 0.05); g.fillRoundedRect(3, 3, 34, 12, 8);
  });
  bake(scene, 'panelSolid9', 40, 40, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 40, 40, 12);
  });
  bake(scene, 'btn9', 40, 40, function (g) {
    g.fillStyle(0x1d2a3c, 1); g.fillRoundedRect(0, 0, 40, 40, 13);
    g.lineStyle(3, 0x3d5a7d, 1); g.strokeRoundedRect(1.5, 1.5, 37, 37, 12);
    g.fillStyle(0xffffff, 0.08); g.fillRoundedRect(4, 4, 32, 13, 8);
  });
  bake(scene, 'banner9', 48, 48, function (g) {
    g.fillStyle(0x0a0f18, 0.90); g.fillRoundedRect(0, 0, 48, 48, 14);
    g.lineStyle(3, 0xffd479, 0.85); g.strokeRoundedRect(2, 2, 44, 44, 12);
    g.fillStyle(0xffd479, 0.10); g.fillRoundedRect(5, 5, 38, 16, 9);
  });
  bake(scene, 'chip9', 28, 28, function (g) {
    g.fillStyle(0x0d1420, 0.88); g.fillRoundedRect(0, 0, 28, 28, 10);
    g.lineStyle(2, 0x3d5a7d, 0.8); g.strokeRoundedRect(1, 1, 26, 26, 9);
  });
  bake(scene, 'strip9', 24, 24, function (g) {
    g.fillStyle(0x0a1018, 0.72); g.fillRoundedRect(0, 0, 24, 24, 8);
  });
  bake(scene, 'px', 4, 4, function (g) { g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 4, 4); });
  bake(scene, 'bar9', 12, 12, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 12, 12, 5);
  });
  bake(scene, 'vign', 160, 160, function (g) {
    for (var k = 0; k < 16; k++) {
      g.fillStyle(0xff2b2b, 0.055);
      g.fillRect(k * 2, k * 2, 160 - k * 4, 160 - k * 4);
    }
    g.fillStyle(0x000000, 0); g.fillRect(40, 40, 80, 80);
  });

  /* ---- icons ---- */
  bake(scene, 'ico_squad', 30, 30, function (g) {
    g.fillStyle(0x8fd0ff, 1);
    g.fillRect(4, 12, 6, 12); g.fillRect(12, 9, 6, 15); g.fillRect(20, 12, 6, 12);
    g.fillStyle(0xd9ecff, 1);
    g.fillRect(4, 6, 6, 5); g.fillRect(12, 3, 6, 5); g.fillRect(20, 6, 6, 5);
  });
  bake(scene, 'ico_troop', 30, 30, function (g) {
    g.fillStyle(0x7ee0a8, 1); g.fillRect(6, 10, 18, 14);
    g.fillStyle(0xb6f2d0, 1); g.fillRect(6, 10, 18, 4);
    g.fillStyle(0x0e1622, 1); g.fillRect(13, 15, 4, 6);
    g.fillStyle(0x7ee0a8, 1); g.fillRect(11, 4, 8, 6);
  });
  bake(scene, 'ico_wall', 30, 30, function (g) {
    g.fillStyle(0x8a94a6, 1); g.fillRect(3, 10, 24, 15);
    g.fillStyle(0xb3bccb, 1);
    g.fillRect(3, 5, 6, 6); g.fillRect(12, 5, 6, 6); g.fillRect(21, 5, 6, 6);
    g.fillStyle(0x5c6474, 1);
    g.fillRect(3, 16, 24, 2); g.fillRect(10, 10, 2, 15); g.fillRect(19, 18, 2, 7);
  });
  bake(scene, 'ico_wave', 30, 30, function (g) {
    g.fillStyle(0xff6b6b, 1);
    g.fillRect(4, 16, 5, 8); g.fillRect(12, 13, 5, 11); g.fillRect(20, 16, 5, 8);
    g.fillStyle(0xffb3ba, 1);
    g.fillRect(4, 10, 5, 5); g.fillRect(12, 7, 5, 5); g.fillRect(20, 10, 5, 5);
  });
  bake(scene, 'ico_spear', 40, 40, function (g) {
    g.fillStyle(0x9c7a4a, 1); g.fillRect(18, 12, 4, 24);
    g.fillStyle(0x3fd18a, 1); g.fillRect(14, 4, 12, 12);
    g.fillStyle(0xa9f5cd, 1); g.fillRect(14, 4, 12, 4);
  });
  bake(scene, 'ico_bow', 40, 40, function (g) {
    g.lineStyle(4, 0x5aa9ff, 1);
    g.strokePoints(ringPoints(20, 20, 13, 20).slice(3, 15), false, false);
    g.fillStyle(0xd8e4f0, 1); g.fillRect(19, 6, 2, 28);
    g.fillStyle(0x8fd0ff, 1); g.fillRect(12, 18, 18, 4);
  });
  bake(scene, 'ico_oil', 40, 40, function (g) {
    g.fillStyle(0x6b5030, 1); g.fillRect(10, 14, 20, 16);
    g.fillStyle(0x8a6a42, 1); g.fillRect(10, 14, 20, 4);
    g.fillStyle(0xffa04d, 1); g.fillRect(28, 18, 8, 4);
    g.fillStyle(0xffd479, 1); g.fillRect(30, 22, 5, 10);
    g.fillStyle(0xff8a3c, 0.8); g.fillRect(29, 30, 8, 6);
  });
  bake(scene, 'ico_campaign', 56, 56, function (g) {
    g.fillStyle(0x8a94a6, 1); g.fillRect(6, 30, 44, 20);
    g.fillStyle(0xb3bccb, 1);
    for (i = 0; i < 5; i++) g.fillRect(6 + i * 9, 22, 6, 9);
    g.fillStyle(0x7ee0a8, 1); g.fillRect(24, 6, 8, 18);
    g.fillStyle(0xa9f5cd, 1); g.fillRect(32, 6, 16, 9);
  });
  bake(scene, 'ico_rush', 56, 56, function (g) {
    g.fillStyle(0x3fd18a, 1); g.fillRect(4, 12, 20, 34);
    g.fillStyle(0xe8515f, 1); g.fillRect(32, 12, 20, 34);
    g.fillStyle(0x0b0d12, 1); g.fillRect(26, 8, 4, 42);
    g.fillStyle(0xffd479, 1); g.fillRect(10, 22, 8, 8); g.fillRect(38, 22, 8, 8);
  });
  bake(scene, 'ico_endless', 56, 56, function (g) {
    g.lineStyle(5, 0xffd479, 1);
    g.strokePoints(ringPoints(18, 28, 12, 22), true, true);
    g.strokePoints(ringPoints(38, 28, 12, 22), true, true);
  });
  bake(scene, 'ico_lock', 34, 34, function (g) {
    g.fillStyle(0x6d7d92, 1); g.fillRect(8, 15, 18, 14);
    g.lineStyle(4, 0x6d7d92, 1);
    g.strokePoints(ringPoints(17, 14, 6, 16).slice(8, 17), false, false);
    g.fillStyle(0x0d1420, 1); g.fillRect(15, 19, 4, 6);
  });
  bake(scene, 'ico_sound', 34, 34, function (g) {
    g.fillStyle(0xe8edf5, 1); g.fillRect(6, 13, 6, 8); g.fillRect(12, 9, 6, 16);
    g.fillStyle(0x7ee0a8, 1); g.fillRect(21, 12, 3, 10); g.fillRect(26, 9, 3, 16);
  });
  bake(scene, 'ico_back', 34, 34, function (g) {
    g.fillStyle(0xe8edf5, 1);
    for (i = 0; i < 8; i++) g.fillRect(10 + i, 17 - i, 3, 3), g.fillRect(10 + i, 17 + i, 3, 3);
    g.fillRect(12, 15, 14, 5);
  });

  /* ---- medals ---- */
  var medals = [['medal_bronze', 0xc98a52], ['medal_silver', 0xc8d4e0], ['medal_gold', 0xffd479]];
  for (i = 0; i < medals.length; i++) {
    (function (name, col) {
      bake(scene, name, 52, 52, function (g) {
        g.fillStyle(shade(col, 0.5), 1); g.fillPoints(ringPoints(26, 28, 20, 24), true, true);
        g.fillStyle(col, 1); g.fillPoints(ringPoints(26, 27, 17, 24), true, true);
        g.fillStyle(shade(col, 1.35), 0.8); g.fillPoints(ringPoints(26, 27, 10, 20), true, true);
        g.fillStyle(shade(col, 0.42), 1);
        g.fillRect(16, 2, 7, 12); g.fillRect(29, 2, 7, 12);
      });
    })(medals[i][0], medals[i][1]);
  }

  /* ---- squad ---- */
  bakeSoldier(scene, 'sol_run0', 0x2f6ea8, 0x8fd0ff, { legA: 2, spearY: 0 });
  bakeSoldier(scene, 'sol_run1', 0x2f6ea8, 0x8fd0ff, { legA: 0, spearY: 1, lean: 1 });
  bakeSoldier(scene, 'sol_run2', 0x2f6ea8, 0x8fd0ff, { legA: -2, spearY: 0 });
  bakeSoldier(scene, 'sol_run3', 0x2f6ea8, 0x8fd0ff, { legA: 0, spearY: 1, lean: -1 });
  bakeSoldier(scene, 'sol_pass', 0x9fe8ff, 0xffffff, { legA: 0, spearY: -3, glow: 0x8fd0ff });
  bakeSoldier(scene, 'sol_hurt', 0xff8a8a, 0xffd0d0, { legA: 1, spearY: 3, lean: 2 });
  bakeSoldier(scene, 'sol_garrison', 0x3f7fb8, 0xa9e0ff, { legA: 0, spearY: -2, spear: true });
  bakeSoldier(scene, 'sol_idle', 0x3476a8, 0xa5ddff, { legA: 0, spearY: 0 });
  bakeSoldier(scene, 'sol_attack', 0x4ca8d4, 0xd8f3ff, { legA: 0, spearY: -8, lean: 1, glow: 0x7ee0a8 });
  bakeSoldier(scene, 'sol_evade', 0x74d6c5, 0xe4fff7, { legA: -2, spearY: -4, lean: -2, glow: 0x7ee0a8 });
  bakeSoldier(scene, 'sol_recover', 0x3f7fb8, 0xa9e0ff, { legA: 2, spearY: 2, lean: 2 });

  /* ---- foes ---- */
  bakeFoe(scene, 'foe_grunt', 22, 28, 0xc04450, 'grunt');
  bakeFoe(scene, 'foe_runner', 18, 24, 0xd98ac0, 'runner');
  bakeFoe(scene, 'foe_brute', 32, 36, 0x8f5bd6, 'brute');
  bakeFoe(scene, 'foe_ravager', 38, 42, 0xe0603a, 'ravager');
  bakeFoe(scene, 'mob_road', 24, 30, 0xb03a44, 'grunt');

  /* ---- gate furniture ---- */
  bake(scene, 'gate_post', 16, 130, function (g) {
    g.fillStyle(0x2b3446, 1); g.fillRect(0, 0, 16, 130);
    g.fillStyle(0x3f4c64, 1); g.fillRect(0, 0, 16, 6);
    g.fillStyle(0x1a2130, 1); g.fillRect(12, 0, 4, 130);
    for (i = 0; i < 6; i++) { g.fillStyle(0xffffff, 0.06); g.fillRect(2, 12 + i * 20, 10, 3); }
  });
  bake(scene, 'gate_slab', 48, 48, function (g) {
    g.fillStyle(0x0b1320, 0.96); g.fillRoundedRect(1, 1, 46, 46, 8);
    g.fillStyle(0x263b53, 0.95); g.fillRoundedRect(4, 4, 40, 40, 6);
    g.fillStyle(0x5d7894, 0.55); g.fillRoundedRect(7, 7, 34, 8, 4);
    g.lineStyle(2, 0xd8e4f0, 0.34); g.strokeRoundedRect(3, 3, 42, 42, 7);
    g.fillStyle(0xffd479, 0.42); g.fillEllipse(24, 28, 24, 12);
    g.fillStyle(0xffffff, 0.75); g.fillCircle(24, 26, 4);
  });
  bake(scene, 'gate_lip', 48, 16, function (g) {
    g.fillStyle(0x0b1320, 0.9); g.fillRoundedRect(1, 1, 46, 14, 5);
    g.fillStyle(0xffffff, 0.8); g.fillRoundedRect(5, 4, 38, 5, 2);
    g.fillStyle(0xffd479, 0.42); g.fillRect(8, 10, 32, 2);
  });

  bake(scene, 'portal_core', 54, 54, function (g) {
    g.fillStyle(0x07111d, 0.95); g.fillCircle(27, 27, 24);
    g.lineStyle(4, 0xffd479, 0.9); g.strokeCircle(27, 27, 18);
    g.lineStyle(2, 0xa9f5cd, 0.8); g.strokeCircle(27, 27, 11);
    g.fillStyle(0xffffff, 0.95); g.fillCircle(27, 27, 4);
    g.fillStyle(0xffd479, 0.18); g.fillCircle(27, 27, 25);
  });
  bake(scene, 'portal_arc', 96, 28, function (g) {
    g.lineStyle(4, 0xffd479, 0.92); g.strokePoints(ringPoints(48, 28, 28, 24).slice(0, 13), false, false);
    g.lineStyle(2, 0xa9f5cd, 0.65); g.strokePoints(ringPoints(48, 28, 22, 24).slice(0, 13), false, false);
  });
  bake(scene, 'telegraph_melee', 76, 22, function (g) {
    g.fillStyle(0xff6b6b, 0.18); g.fillEllipse(38, 11, 70, 18);
    g.lineStyle(3, 0xff6b6b, 0.95); g.strokeEllipse(38, 11, 58, 13);
    g.fillStyle(0xffd479, 0.95); g.fillTriangle(38, 2, 31, 16, 45, 16);
  });
  bake(scene, 'telegraph_projectile', 76, 22, function (g) {
    g.fillStyle(0xffa04d, 0.18); g.fillEllipse(38, 11, 70, 18);
    g.lineStyle(3, 0xffa04d, 0.95); g.strokeEllipse(38, 11, 58, 13);
    g.fillStyle(0xffd479, 0.95); g.fillCircle(38, 11, 6);
    g.fillStyle(0x341b1a, 1); g.fillCircle(38, 11, 2);
  });
  bake(scene, 'commander_idle', 34, 42, function (g) {
    g.fillStyle(0x000000, 0.35); g.fillEllipse(17, 39, 25, 6);
    g.fillStyle(0x7ee0a8, 1); g.fillRoundedRect(7, 16, 20, 19, 6);
    g.fillStyle(0xa9f5cd, 1); g.fillCircle(17, 11, 8);
    g.fillStyle(0x0e1622, 1); g.fillRect(10, 10, 14, 3);
    g.fillStyle(0xffd479, 1); g.fillRect(5, 19, 5, 10); g.fillRect(24, 19, 5, 10);
    g.lineStyle(2, 0xe8edf5, 0.75); g.strokeRoundedRect(7, 16, 20, 19, 6);
  });
  bake(scene, 'commander_evade', 46, 42, function (g) {
    g.fillStyle(0x7ee0a8, 0.22); g.fillEllipse(23, 22, 44, 28);
    g.lineStyle(3, 0x7ee0a8, 0.9); g.strokeEllipse(23, 22, 36, 22);
    g.fillStyle(0xa9f5cd, 1); g.fillCircle(23, 12, 8);
    g.fillStyle(0x2f6ea8, 1); g.fillRoundedRect(9, 17, 28, 14, 6);
    g.fillStyle(0xffd479, 1); g.fillTriangle(4, 29, 17, 24, 14, 34); g.fillTriangle(42, 29, 29, 24, 32, 34);
  });
  bake(scene, 'commander_attack', 42, 46, function (g) {
    g.fillStyle(0x000000, 0.3); g.fillEllipse(21, 43, 28, 6);
    g.fillStyle(0x7ee0a8, 1); g.fillRoundedRect(10, 17, 22, 21, 6);
    g.fillStyle(0xa9f5cd, 1); g.fillCircle(21, 11, 8);
    g.fillStyle(0x0e1622, 1); g.fillRect(14, 10, 14, 3);
    g.lineStyle(3, 0xffd479, 1); g.lineBetween(28, 24, 41, 7);
    g.fillStyle(0xd8e4f0, 1); g.fillTriangle(41, 5, 37, 12, 44, 11);
    g.lineStyle(2, 0xe8edf5, 0.8); g.strokeRoundedRect(10, 17, 22, 21, 6);
  });
  bake(scene, 'commander_recover', 36, 42, function (g) {
    g.fillStyle(0x000000, 0.3); g.fillEllipse(18, 39, 27, 6);
    g.fillStyle(0xff8a8a, 1); g.fillRoundedRect(8, 18, 20, 17, 6);
    g.fillStyle(0xffd0d0, 1); g.fillCircle(18, 11, 8);
    g.fillStyle(0x0e1622, 1); g.fillRect(11, 10, 14, 3);
    g.lineStyle(2, 0xff6b6b, 0.9); g.strokeRoundedRect(8, 18, 20, 17, 6);
  });

  /* ---- hazards ---- */
  bake(scene, 'sawblade', 72, 72, function (g) {
    g.fillStyle(0xffa04d, 1);
    for (i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      var x = 36 + Math.cos(a) * 28, y = 36 + Math.sin(a) * 28;
      g.fillRect(x - 6, y - 6, 12, 12);
    }
    g.fillStyle(0xc9762f, 1); g.fillPoints(ringPoints(36, 36, 24, 24), true, true);
    g.fillStyle(0xffd479, 1); g.fillPoints(ringPoints(36, 36, 16, 20), true, true);
    g.fillStyle(0x12151c, 1); g.fillPoints(ringPoints(36, 36, 7, 16), true, true);
  });
  bake(scene, 'barricade', 220, 46, function (g) {
    g.fillStyle(0x000000, 0.3); g.fillRect(4, 40, 212, 6);
    g.fillStyle(0x6b5030, 1); g.fillRect(0, 6, 220, 30);
    g.fillStyle(0x8a6a42, 1); g.fillRect(0, 6, 220, 6);
    g.fillStyle(0x4a3620, 1);
    for (i = 0; i < 8; i++) g.fillRect(10 + i * 27, 6, 4, 30);
    g.fillStyle(0xd8e4f0, 1);
    for (i = 0; i < 6; i++) g.fillRect(18 + i * 36, 0, 6, 10);
  });
  bake(scene, 'recruit_flag', 44, 62, function (g) {
    g.fillStyle(0x9c7a4a, 1); g.fillRect(6, 8, 5, 54);
    g.fillStyle(0x7ee0a8, 1); g.fillRect(11, 10, 30, 22);
    g.fillStyle(0xa9f5cd, 1); g.fillRect(11, 10, 30, 5);
    g.fillStyle(0x0e1622, 1); g.fillRect(20, 17, 8, 8);
    g.fillStyle(0xd8e4f0, 1); g.fillRect(4, 2, 9, 8);
  });
  bake(scene, 'finish_band', 540, 34, function (g) {
    g.fillStyle(0x3d5a7d, 1); g.fillRect(0, 0, 540, 34);
    for (i = 0; i < 18; i++) {
      g.fillStyle(i % 2 ? 0xe8edf5 : 0x12151c, 1);
      g.fillRect(i * 30, 0, 30, 17);
      g.fillStyle(i % 2 ? 0x12151c : 0xe8edf5, 1);
      g.fillRect(i * 30, 17, 30, 17);
    }
  });

  /* ---- wall + slots ---- */
  for (i = 0; i < AG.SITES.length; i++) {
    (function (site) {
      bake(scene, 'wall_' + site.id, 540, 190, function (g) {
        var base = mixc(0x59616f, site.rail, 0.35);
        var rnd = AG.rng(site.num * 991 + 5), r, c;
        // crenellated parapet
        for (c = 0; c < 18; c++) {
          g.fillStyle(shade(base, 1.18), 1);
          g.fillRect(c * 30 + 3, 0, 22, 30);
          g.fillStyle(0xffffff, 0.10);
          g.fillRect(c * 30 + 3, 0, 22, 5);
        }
        g.fillStyle(shade(base, 0.95), 1); g.fillRect(0, 30, 540, 12);
        g.fillStyle(0x000000, 0.30); g.fillRect(0, 40, 540, 4);
        // masonry body
        g.fillStyle(shade(base, 0.66), 1); g.fillRect(0, 44, 540, 146);
        for (r = 0; r < 9; r++) {
          for (c = 0; c < 19; c++) {
            var bx = c * 30 + (r % 2 ? 0 : 15) - 15, by = 46 + r * 16;
            g.fillStyle(shade(base, 0.80 + rnd() * 0.34), 1);
            g.fillRect(bx + 1, by, 28, 14);
          }
        }
        g.fillStyle(0x000000, 0.22); g.fillRect(0, 176, 540, 14);
      });
    })(AG.SITES[i]);
  }
  bake(scene, 'wall_crack', 90, 66, function (g) {
    g.fillStyle(0x0b0d12, 0.85);
    var x = 44, y = 0;
    for (i = 0; i < 22; i++) {
      g.fillRect(x, y, 4, 3);
      x += (i % 3 === 0 ? 4 : -3) + (i % 5 === 0 ? 5 : 0);
      y += 3;
    }
    g.fillStyle(0x0b0d12, 0.7);
    for (i = 0; i < 10; i++) g.fillRect(44 + (i % 4) * 7 - 10, i * 6, 3, 3);
  });
  bake(scene, 'slot_frame', 96, 84, function (g) {
    g.fillStyle(0x1a2231, 0.9); g.fillRoundedRect(0, 0, 96, 84, 11);
    g.lineStyle(3, 0xffffff, 1); g.strokeRoundedRect(2, 2, 92, 80, 10);
  });
  bake(scene, 'slot_fill', 96, 84, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 96, 84, 11);
  });
  bake(scene, 'slot_plus', 40, 40, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRect(16, 4, 8, 32); g.fillRect(4, 16, 32, 8);
  });
  bake(scene, 'lvl_pip', 12, 12, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 12, 12, 4);
  });
  bake(scene, 'threat_chev', 46, 26, function (g) {
    g.fillStyle(0xffffff, 1);
    for (i = 0; i < 12; i++) { g.fillRect(i * 2, i * 2, 4, 4); g.fillRect(44 - i * 2, i * 2, 4, 4); }
    g.fillRect(20, 20, 6, 6);
  });

  /* ---- shots ---- */
  bake(scene, 'shot_arrow', 8, 26, function (g) {
    g.fillStyle(0xd8e4f0, 1); g.fillRect(3, 4, 2, 20);
    g.fillStyle(0x5aa9ff, 1); g.fillRect(1, 0, 6, 6);
    g.fillStyle(0x8fd0ff, 1); g.fillRect(2, 22, 4, 4);
  });
  bake(scene, 'shot_jab', 12, 22, function (g) {
    g.fillStyle(0x9c7a4a, 1); g.fillRect(4, 6, 4, 16);
    g.fillStyle(0x3fd18a, 1); g.fillRect(2, 0, 8, 8);
  });
  bake(scene, 'shot_pot', 20, 20, function (g) {
    g.fillStyle(0x6b5030, 1); g.fillPoints(ringPoints(10, 11, 8, 16), true, true);
    g.fillStyle(0xffa04d, 1); g.fillPoints(ringPoints(10, 8, 5, 14), true, true);
  });
  bake(scene, 'shot_enemy', 18, 18, function (g) {
    g.fillStyle(0x2a1410, 1); g.fillCircle(9, 9, 8);
    g.fillStyle(0xff6b6b, 1); g.fillCircle(9, 9, 5);
    g.fillStyle(0xffd479, 0.9); g.fillCircle(9, 9, 2);
  });
  bake(scene, 'shot_trail', 18, 8, function (g) {
    g.fillStyle(0xffffff, 0.16); g.fillEllipse(9, 4, 18, 7);
    g.fillStyle(0xffd479, 0.7); g.fillEllipse(9, 4, 10, 4);
  });

  /* ---- particles ---- */
  bake(scene, 'p_spark', 12, 12, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRect(4, 0, 4, 12); g.fillRect(0, 4, 12, 4);
  });
  bake(scene, 'p_dot', 10, 10, function (g) {
    g.fillStyle(0xffffff, 1); g.fillPoints(ringPoints(5, 5, 4.5, 12), true, true);
    g.fillStyle(0xffffff, 0.4); g.fillPoints(ringPoints(5, 5, 5, 12), true, true);
  });
  bake(scene, 'p_chip', 8, 8, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 5, 6); g.fillRect(4, 3, 4, 5);
  });
  bake(scene, 'p_smoke', 28, 28, function (g) {
    g.fillStyle(0xffffff, 0.20); g.fillPoints(ringPoints(14, 14, 13, 14), true, true);
    g.fillStyle(0xffffff, 0.30); g.fillPoints(ringPoints(14, 14, 9, 14), true, true);
    g.fillStyle(0xffffff, 0.45); g.fillPoints(ringPoints(14, 14, 5, 12), true, true);
  });
  bake(scene, 'p_ring', 72, 72, function (g) {
    g.lineStyle(6, 0xffffff, 1); g.strokePoints(ringPoints(36, 36, 30, 40), true, true);
    g.lineStyle(2, 0xffffff, 0.5); g.strokePoints(ringPoints(36, 36, 22, 36), true, true);
  });
  bake(scene, 'p_ember', 8, 8, function (g) {
    g.fillStyle(0xffffff, 1); g.fillRect(1, 1, 6, 6);
  });

  /* ---- range rings (one per role, hand-tessellated) ---- */
  for (i = 0; i < AG.ROLE_KEYS.length; i++) {
    (function (rk) {
      var role = AG.role(rk), R = role.range;
      bake(scene, 'ring_' + rk, R * 2 + 8, R * 2 + 8, function (g) {
        g.lineStyle(3, 0xffffff, 0.9);
        g.strokePoints(ringPoints(R + 4, R + 4, R, 72), true, true);
        g.lineStyle(1, 0xffffff, 0.35);
        g.strokePoints(ringPoints(R + 4, R + 4, R - 8, 64), true, true);
      });
    })(AG.ROLE_KEYS[i]);
  }

  /* ---- per-site solid field colour. Baked rather than tinted so a
     canvas-renderer fallback never paints the battlefield white ---- */
  for (i = 0; i < AG.SITES.length; i++) {
    (function (site) {
      bake(scene, 'ground_' + site.id, 16, 16, function (g) {
        g.fillStyle(site.grass, 1); g.fillRect(0, 0, 16, 16);
        g.fillStyle(shade(site.grass, 1.25), 1);
        g.fillRect(0, 0, 16, 2); g.fillRect(3, 7, 3, 2); g.fillRect(10, 12, 4, 2);
      });
    })(AG.SITES[i]);
  }

  /* ---- per-site fog bands: mask the top of the play area so objects
     fade in instead of popping over the HUD ---- */
  for (i = 0; i < AG.SITES.length; i++) {
    (function (site) {
      bake(scene, 'fog_' + site.id, 8, 160, function (g) {
        for (var k = 0; k < 160; k++) {
          var a = 1 - Math.pow(k / 160, 1.5);
          g.fillStyle(site.fog, a);
          g.fillRect(0, k, 8, 1);
        }
      });
    })(AG.SITES[i]);
  }

  /* ---- per-site road + landmarks ---- */
  for (i = 0; i < AG.SITES.length; i++) bakeRoad(scene, AG.SITES[i]);
  bakeLandmarks(scene);

  /* ---- title mark ---- */
  bake(scene, 'title_mark', 300, 120, function (g) {
    g.fillStyle(0x2b3446, 1); g.fillRect(24, 30, 34, 90); g.fillRect(242, 30, 34, 90);
    g.fillStyle(0x3f4c64, 1); g.fillRect(16, 18, 268, 18);
    g.fillStyle(0xffd479, 0.9);
    for (i = 0; i < 7; i++) g.fillRect(64 + i * 26, 40, 8, 80);
    for (i = 0; i < 3; i++) g.fillRect(58, 48 + i * 30, 184, 6);
    g.fillStyle(0x7ee0a8, 0.55); g.fillRect(58, 100, 184, 20);
  });
};

/* ==================================================================== */
/* AUDIO - PCM synthesis to WAV blobs (no shipped audio files at all)   */
/* ==================================================================== */

function Track(dur, sr) {
  this.sr = sr;
  this.n = Math.max(1, Math.ceil(dur * sr));
  this.d = new Float32Array(this.n);
}
Track.prototype.tone = function (t0, dur, f0, f1, type, amp, curve) {
  var sr = this.sr, i0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
  for (var i = 0; i < n; i++) {
    var idx = i0 + i; if (idx < 0 || idx >= this.n) continue;
    var t = i / n;
    var f = f1 ? f0 * Math.pow(f1 / f0, t) : f0;
    var ph = (idx / sr) * f * Math.PI * 2;
    var s;
    if (type === 'saw') s = ((ph / Math.PI) % 2) - 1;
    else if (type === 'square') s = Math.sin(ph) >= 0 ? 1 : -1;
    else if (type === 'tri') s = 2 * Math.abs(((ph / Math.PI) % 2) - 1) - 1;
    else s = Math.sin(ph);
    var env;
    if (curve === 'swell') env = Math.sin(Math.PI * t);
    else if (curve === 'flat') env = Math.min(1, t * 30) * Math.min(1, (1 - t) * 12);
    else env = Math.pow(1 - t, 2.2) * Math.min(1, t * 60);
    this.d[idx] += s * amp * env;
  }
  return this;
};
Track.prototype.noise = function (t0, dur, amp, cutoff, curve) {
  var sr = this.sr, i0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
  var a = Math.exp(-2 * Math.PI * (cutoff || 1200) / sr), y = 0;
  for (var i = 0; i < n; i++) {
    var idx = i0 + i; if (idx < 0 || idx >= this.n) continue;
    var t = i / n;
    y = (1 - a) * (Math.random() * 2 - 1) + a * y;
    var env = curve === 'swell' ? Math.sin(Math.PI * t) : Math.pow(1 - t, 2.0);
    this.d[idx] += y * amp * env;
  }
  return this;
};
Track.prototype.wav = function () {
  var n = this.n, sr = this.sr;
  var buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
  function str(off, s) { for (var k = 0; k < s.length; k++) v.setUint8(off + k, s.charCodeAt(k)); }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  var peak = 0;
  for (i = 0; i < n; i++) { var m = Math.abs(this.d[i]); if (m > peak) peak = m; }
  var norm = peak > 1 ? 1 / peak : 1;
  for (i = 0; i < n; i++) {
    var s = this.d[i] * norm;
    s = s < -1 ? -1 : (s > 1 ? 1 : s);
    v.setInt16(44 + i * 2, Math.round(s * 32000), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
;

var SR = 22050, MSR = 16000;

function sfxGateGood() {
  var t = new Track(0.55, SR);
  var n = [523.25, 659.25, 783.99, 1046.5];
  for (var i = 0; i < 4; i++) t.tone(i * 0.045, 0.36, n[i], n[i], 'tri', 0.26);
  t.tone(0, 0.22, 180, 320, 'sine', 0.18);
  return t.wav();
}
function sfxGateBad() {
  var t = new Track(0.5, SR);
  t.tone(0, 0.34, 320, 84, 'saw', 0.34);
  t.tone(0.02, 0.28, 158, 46, 'square', 0.18);
  t.noise(0, 0.16, 0.16, 700);
  return t.wav();
}
function sfxMarch() {
  var t = new Track(0.24, SR);
  t.noise(0, 0.10, 0.42, 420);
  t.tone(0, 0.09, 92, 54, 'sine', 0.30);
  t.noise(0.10, 0.10, 0.22, 900);
  return t.wav();
}
function sfxSaw() {
  var t = new Track(0.36, SR);
  t.noise(0, 0.24, 0.5, 2600);
  t.tone(0, 0.2, 900, 300, 'saw', 0.2);
  return t.wav();
}
function sfxMobHit() {
  var t = new Track(0.6, SR);
  t.noise(0, 0.34, 0.55, 500);
  t.tone(0, 0.3, 150, 46, 'square', 0.34);
  t.tone(0.05, 0.24, 88, 40, 'sine', 0.3);
  return t.wav();
}
function sfxPlace() {
  var t = new Track(0.28, SR);
  t.tone(0, 0.14, 300, 620, 'tri', 0.34);
  t.noise(0, 0.08, 0.16, 1800);
  return t.wav();
}
function sfxUpgrade() {
  var t = new Track(0.5, SR);
  t.tone(0, 0.2, 420, 620, 'tri', 0.3);
  t.tone(0.10, 0.26, 620, 940, 'tri', 0.28);
  t.tone(0.20, 0.3, 940, 1250, 'sine', 0.22);
  return t.wav();
}
function sfxWaveStart() {
  var t = new Track(1.1, SR);
  t.tone(0, 0.75, 132, 176, 'saw', 0.26, 'swell');
  t.tone(0.06, 0.7, 88, 118, 'square', 0.18, 'swell');
  t.noise(0.0, 0.5, 0.12, 500, 'swell');
  return t.wav();
}
function sfxWallThud() {
  var t = new Track(0.55, SR);
  t.noise(0, 0.3, 0.6, 280);
  t.tone(0, 0.28, 96, 38, 'sine', 0.5);
  return t.wav();
}
function sfxCrack() {
  var t = new Track(0.45, SR);
  t.noise(0, 0.14, 0.55, 3400);
  t.noise(0.06, 0.26, 0.3, 900);
  t.tone(0, 0.2, 220, 70, 'square', 0.2);
  return t.wav();
}
function sfxRepair() {
  var t = new Track(0.5, SR);
  t.tone(0, 0.3, 300, 500, 'sine', 0.24);
  t.noise(0.02, 0.2, 0.2, 1500);
  t.tone(0.14, 0.26, 500, 760, 'tri', 0.22);
  return t.wav();
}
function sfxArrow() {
  var t = new Track(0.2, SR);
  t.noise(0, 0.10, 0.34, 3000);
  t.tone(0, 0.08, 1100, 520, 'tri', 0.16);
  return t.wav();
}
function sfxJab() {
  var t = new Track(0.16, SR);
  t.noise(0, 0.07, 0.3, 2200);
  t.tone(0, 0.06, 700, 380, 'square', 0.16);
  return t.wav();
}
function sfxOil() {
  var t = new Track(0.7, SR);
  t.noise(0, 0.5, 0.4, 1400, 'swell');
  t.tone(0, 0.4, 240, 110, 'saw', 0.18);
  return t.wav();
}
function sfxFoeDie() {
  var t = new Track(0.34, SR);
  t.noise(0, 0.18, 0.42, 1600);
  t.tone(0, 0.16, 360, 120, 'square', 0.24);
  return t.wav();
}
function sfxWaveHeld() {
  var t = new Track(1.1, SR);
  var n = [392, 523.25, 659.25, 783.99];
  for (var i = 0; i < 4; i++) t.tone(i * 0.09, 0.5, n[i], n[i], 'tri', 0.24);
  t.tone(0, 0.5, 130.8, 130.8, 'sine', 0.2);
  return t.wav();
}
function sfxMedal() {
  var t = new Track(1.4, SR);
  var n = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  for (var i = 0; i < 5; i++) t.tone(i * 0.10, 0.6, n[i], n[i], 'sine', 0.22);
  t.tone(0.5, 0.8, 261.6, 261.6, 'tri', 0.16);
  return t.wav();
}
function sfxVictory() {
  var t = new Track(2.2, SR);
  var mel = [[0, 523.25], [0.16, 659.25], [0.32, 783.99], [0.48, 1046.5], [0.72, 987.77], [0.88, 1046.5]];
  for (var i = 0; i < mel.length; i++) t.tone(mel[i][0], 0.7, mel[i][1], mel[i][1], 'tri', 0.22);
  t.tone(0, 1.6, 130.8, 130.8, 'sine', 0.18, 'flat');
  t.tone(0.72, 1.2, 196, 196, 'sine', 0.16, 'flat');
  t.noise(0, 0.4, 0.10, 800, 'swell');
  return t.wav();
}
function sfxDefeat() {
  var t = new Track(1.8, SR);
  var n = [392, 329.63, 261.63, 196];
  for (var i = 0; i < 4; i++) t.tone(i * 0.20, 0.7, n[i], n[i] * 0.94, 'saw', 0.22);
  t.noise(0, 0.8, 0.14, 340, 'swell');
  return t.wav();
}
function sfxClick() {
  var t = new Track(0.12, SR);
  t.tone(0, 0.06, 620, 900, 'square', 0.22);
  return t.wav();
}
function sfxDeny() {
  var t = new Track(0.22, SR);
  t.tone(0, 0.14, 220, 150, 'square', 0.26);
  return t.wav();
}
function sfxRecruit() {
  var t = new Track(0.42, SR);
  t.tone(0, 0.22, 660, 990, 'tri', 0.26);
  t.tone(0.08, 0.24, 990, 1320, 'sine', 0.2);
  return t.wav();
}
function sfxCountdown() {
  var t = new Track(0.3, SR);
  t.tone(0, 0.16, 440, 440, 'tri', 0.3);
  return t.wav();
}
function sfxEvade() {
  var t = new Track(0.28, SR);
  t.noise(0, 0.16, 0.24, 2600, 'swell');
  t.tone(0, 0.22, 420, 980, 'tri', 0.22);
  return t.wav();
}
function sfxTelegraph() {
  var t = new Track(0.34, SR);
  t.tone(0, 0.18, 180, 110, 'square', 0.22);
  t.tone(0.16, 0.14, 260, 190, 'square', 0.18);
  return t.wav();
}

/* --- music stems: short pooled loops, seamless by construction --- */
function musicLoop(opts) {
  var bars = opts.bars || 4, bpm = opts.bpm || 96;
  var beat = 60 / bpm, dur = bars * 4 * beat;
  var t = new Track(dur, MSR);
  var root = opts.root || 130.81;
  var seq = opts.seq || [0, 0, 3, 5];
  var semi = function (n) { return root * Math.pow(2, n / 12); };
  var b, s;
  for (b = 0; b < bars; b++) {
    var deg = seq[b % seq.length];
    var t0 = b * 4 * beat;
    // bass pulse on every beat
    for (s = 0; s < 4; s++) {
      t.tone(t0 + s * beat, beat * 0.85, semi(deg) / 2, null, 'tri', 0.30, 'flat');
    }
    // drum: kick 1 and 3, snare-ish on 2 and 4
    t.noise(t0, 0.10, 0.30, 260);
    t.noise(t0 + 2 * beat, 0.10, 0.28, 260);
    if (opts.drums !== false) {
      t.noise(t0 + beat, 0.09, 0.20, 2600);
      t.noise(t0 + 3 * beat, 0.09, 0.20, 2600);
    }
    // arpeggio
    var arp = opts.arp || [0, 7, 12, 7];
    for (s = 0; s < 8; s++) {
      var n = semi(deg + arp[s % arp.length] + (opts.oct || 12));
      t.tone(t0 + s * beat * 0.5, beat * 0.42, n, null, opts.wave || 'square', opts.arpAmp || 0.11);
    }
    if (opts.pad) {
      t.tone(t0, 4 * beat, semi(deg + 12), null, 'sine', 0.09, 'flat');
      t.tone(t0, 4 * beat, semi(deg + 19), null, 'sine', 0.06, 'flat');
    }
  }
  return t.wav();
}

AG.art.buildAudio = function (kit) {
  var map = {};
  try {
    map = {
      gate_good: sfxGateGood(),
      gate_bad: sfxGateBad(),
      march: sfxMarch(),
      saw: sfxSaw(),
      mob: sfxMobHit(),
      place: sfxPlace(),
      upgrade: sfxUpgrade(),
      wave_start: sfxWaveStart(),
      wall_thud: sfxWallThud(),
      crack: sfxCrack(),
      repair: sfxRepair(),
      arrow: sfxArrow(),
      jab: sfxJab(),
      pot: sfxOil(),
      foe_die: sfxFoeDie(),
      wave_held: sfxWaveHeld(),
      medal: sfxMedal(),
      victory: sfxVictory(),
      defeat: sfxDefeat(),
      click: sfxClick(),
      deny: sfxDeny(),
      recruit: sfxRecruit(),
      countdown: sfxCountdown(),
      evade: sfxEvade(),
      telegraph: sfxTelegraph(),
      mus_road: musicLoop({ bars: 4, bpm: 100, root: 146.83, seq: [0, 0, 5, 3], pad: true }),
      mus_march: musicLoop({ bars: 4, bpm: 112, root: 130.81, seq: [0, 3, 5, 3], wave: 'saw', arpAmp: 0.09 }),
      mus_siege: musicLoop({ bars: 4, bpm: 124, root: 110.0, seq: [0, 1, 5, 3], wave: 'saw', arpAmp: 0.10, pad: true }),
      mus_wall: musicLoop({ bars: 4, bpm: 92, root: 98.0, seq: [0, 5, 3, 5], wave: 'square', oct: 24, arpAmp: 0.08, pad: true }),
      mus_wall_danger: musicLoop({ bars: 4, bpm: 118, root: 73.42, seq: [0, 1, 5, 4], wave: 'saw', oct: 12, arpAmp: 0.13 })
    };
  } catch (e) {
    map = {};
  }
  if (kit && kit.audio && kit.audio.register) kit.audio.register(map);
  AG.art.audioMap = map;
  return map;
};
