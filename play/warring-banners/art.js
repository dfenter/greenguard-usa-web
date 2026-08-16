/* Warring Banners - procedural art bakery.
 * Every pixel in the game is drawn here into canvas textures once, during the
 * loading screen. Nothing in this file runs during gameplay: Phaser Graphics
 * replays its whole command list every frame, so the board, the chrome, the
 * units, the icons and the particles are all baked and then blitted.
 */
'use strict';

(function (root) {
  var A = {};
  var TAU = Math.PI * 2;

  var PAL = {
    ink: '#0a151f', ink2: '#102432', panel: '#12283a', panelEdge: '#2c4b62',
    text: '#e8f3fb', muted: '#93aabd',
    cyan: '#43c7f4', blue: '#3864e8', paleCyan: '#bfeeff',
    coral: '#ff665c', wine: '#b72e4d', paleCoral: '#ffd0c9',
    slate: '#718092', bone: '#d8c38c', moss: '#788b5a', amber: '#e0a34a',
    white: '#ffffff', shadow: 'rgba(4,10,16,0.45)'
  };
  A.PAL = PAL;
  A.HEXR = 34;

  // terrain paint recipes, biome saturation stays under the faction accents
  var TERRAIN = {
    plain:   { base: '#54663f', alt: '#5d7145', line: '#43532f' },
    road:    { base: '#8a8064', alt: '#968a6d', line: '#6d6349' },
    terrace: { base: '#6b7a46', alt: '#7b8b52', line: '#4e5c31' },
    forest:  { base: '#31492f', alt: '#3a5637', line: '#233722' },
    hill:    { base: '#6a6449', alt: '#7a7355', line: '#514c36' },
    marsh:   { base: '#46543f', alt: '#4f5f48', line: '#333e2f' },
    ford:    { base: '#4a6d7c', alt: '#547a8b', line: '#365360' },
    water:   { base: '#23445c', alt: '#28506b', line: '#1a3345' },
    peak:    { base: '#4c5464', alt: '#5a6374', line: '#343b48' },
    wall:    { base: '#6d6355', alt: '#7b7062', line: '#4a4239' },
    gate:    { base: '#8a6a44', alt: '#9a784e', line: '#5e4629' },
    keep:    { base: '#7d7360', alt: '#8d826d', line: '#565043' }
  };
  A.TERRAIN = TERRAIN;

  function hexPath(ctx, cx, cy, s) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 30);
      var x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  A.hexPath = hexPath;

  function rnd(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  A.rnd = rnd;

  function tex(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var baked = root.GGKit.hiDpi.canvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    var texture = scene.textures.addCanvas(key, baked.canvas);
    if (texture && texture.get()) texture.get().source.resolution = baked.dpr;
    draw(baked.ctx, baked.canvas);
    texture.refresh();
    return texture;
  }
  A.tex = tex;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  A.roundRect = roundRect;

  // ------------------------------------------------------------- overlays
  A.bakeShapes = function (scene) {
    var s = A.HEXR, w = Math.ceil(Math.sqrt(3) * s) + 4, h = 2 * s + 4;

    tex(scene, 'hex-fill', w, h, function (c) {
      hexPath(c, w / 2, h / 2, s - 1.5);
      c.fillStyle = '#ffffff';
      c.fill();
    });
    tex(scene, 'hex-soft', w, h, function (c) {
      var g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, s);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0.15)');
      hexPath(c, w / 2, h / 2, s - 1.5);
      c.fillStyle = g;
      c.fill();
    });
    tex(scene, 'hex-ring', w, h, function (c) {
      hexPath(c, w / 2, h / 2, s - 2.5);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.lineJoin = 'round';
      c.stroke();
    });
    tex(scene, 'hex-ring-thin', w, h, function (c) {
      hexPath(c, w / 2, h / 2, s - 3);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.6;
      c.stroke();
    });
    tex(scene, 'hex-dash', w, h, function (c) {
      hexPath(c, w / 2, h / 2, s - 3);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2.4;
      if (c.setLineDash) c.setLineDash([6, 6]);
      c.stroke();
    });
    // square ended friendly key, per the lane bible selection language
    tex(scene, 'hex-key', w + 10, h + 10, function (c) {
      var cx = (w + 10) / 2, cy = (h + 10) / 2;
      hexPath(c, cx, cy, s - 1);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3.4;
      c.lineCap = 'square';
      c.stroke();
      c.fillStyle = '#ffffff';
      for (var i = 0; i < 6; i++) {
        var a = Math.PI / 180 * (60 * i - 30);
        c.fillRect(cx + (s + 1) * Math.cos(a) - 2.6, cy + (s + 1) * Math.sin(a) - 2.6, 5.2, 5.2);
      }
    });

    // particle vocabulary
    tex(scene, 'p-dot', 24, 24, function (c) {
      var g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 24, 24);
    });
    tex(scene, 'p-shard', 14, 14, function (c) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(7, 0); c.lineTo(13, 9); c.lineTo(7, 14); c.lineTo(1, 9);
      c.closePath();
      c.fill();
    });
    tex(scene, 'p-streak', 26, 6, function (c) {
      var g = c.createLinearGradient(0, 0, 26, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 1.5, 26, 3);
    });
    tex(scene, 'p-ring', 96, 96, function (c) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(48, 48, 42, 0, TAU);
      c.stroke();
    });
    tex(scene, 'p-slash', 90, 42, function (c) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(10, 34);
      c.quadraticCurveTo(46, 2, 80, 20);
      c.stroke();
    });
    tex(scene, 'p-spark', 10, 10, function (c) {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 4, 10, 2);
      c.fillRect(4, 0, 2, 10);
    });
    tex(scene, 'p-flake', 12, 12, function (c) {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath(); c.arc(6, 6, 3.4, 0, TAU); c.fill();
    });
  };

  // ----------------------------------------------------------------- chrome
  A.bakeChrome = function (scene) {
    function panel(key, w, h, r, fill, edge, accent) {
      tex(scene, key, w, h, function (c) {
        roundRect(c, 1, 1, w - 2, h - 2, r);
        c.fillStyle = fill;
        c.fill();
        c.strokeStyle = edge;
        c.lineWidth = 1.6;
        c.stroke();
        if (accent) {
          c.save();
          roundRect(c, 1, 1, w - 2, h - 2, r);
          c.clip();
          c.fillStyle = accent;
          c.fillRect(0, 0, w, 2.4);
          c.restore();
        }
      });
    }
    panel('chip', 220, 56, 12, 'rgba(10,21,31,0.82)', 'rgba(67,199,244,0.35)', null);
    panel('chip-wide', 380, 56, 12, 'rgba(10,21,31,0.82)', 'rgba(67,199,244,0.3)', null);
    panel('panel', 460, 260, 16, 'rgba(12,26,38,0.94)', 'rgba(67,199,244,0.34)', PAL.cyan);
    panel('panel-wide', 900, 460, 18, 'rgba(10,21,31,0.95)', 'rgba(67,199,244,0.3)', PAL.cyan);
    panel('card', 150, 108, 12, 'rgba(9,20,30,0.92)', 'rgba(67,199,244,0.45)', PAL.cyan);
    panel('card-spent', 150, 108, 12, 'rgba(9,20,30,0.6)', 'rgba(113,128,146,0.4)', PAL.slate);
    panel('btn', 190, 72, 12, 'rgba(56,100,232,0.92)', 'rgba(191,238,255,0.5)', null);
    panel('btn-slate', 190, 72, 12, 'rgba(25,44,60,0.92)', 'rgba(113,128,146,0.5)', null);
    panel('btn-amber', 190, 72, 12, 'rgba(224,163,74,0.92)', 'rgba(255,240,210,0.5)', null);
    panel('btn-coral', 190, 72, 12, 'rgba(183,46,77,0.92)', 'rgba(255,208,201,0.5)', null);
    panel('btn-sq', 76, 76, 12, 'rgba(18,40,58,0.92)', 'rgba(67,199,244,0.4)', null);
    panel('slot', 132, 150, 12, 'rgba(12,26,38,0.9)', 'rgba(113,128,146,0.45)', null);
    panel('slot-on', 132, 150, 12, 'rgba(16,40,60,0.95)', 'rgba(67,199,244,0.7)', PAL.cyan);
    panel('node', 92, 92, 14, 'rgba(12,26,38,0.94)', 'rgba(113,128,146,0.5)', null);
    panel('node-on', 92, 92, 14, 'rgba(18,48,68,0.96)', 'rgba(67,199,244,0.85)', PAL.cyan);
    panel('node-done', 92, 92, 14, 'rgba(20,44,38,0.94)', 'rgba(141,214,168,0.7)', '#8dd6a8');

    // bar pieces
    tex(scene, 'bar', 8, 8, function (c) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 8, 8); });

    // big run boundary banner: 60 percent width, only used at run edges
    tex(scene, 'banner', 780, 132, function (c) {
      var g = c.createLinearGradient(0, 0, 780, 0);
      g.addColorStop(0, 'rgba(10,21,31,0)');
      g.addColorStop(0.12, 'rgba(10,21,31,0.94)');
      g.addColorStop(0.88, 'rgba(10,21,31,0.94)');
      g.addColorStop(1, 'rgba(10,21,31,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 780, 132);
      c.fillStyle = 'rgba(67,199,244,0.75)';
      c.fillRect(90, 0, 600, 3);
      c.fillRect(90, 129, 600, 3);
    });

    // title screen sky and standard, drawn once
    tex(scene, 'sky', 1280, 720, function (c) {
      var g = c.createLinearGradient(0, 0, 0, 720);
      g.addColorStop(0, '#0b1a28');
      g.addColorStop(0.55, '#16323f');
      g.addColorStop(1, '#20402f');
      c.fillStyle = g;
      c.fillRect(0, 0, 1280, 720);
      var r = rnd(7717);
      // distant ridges
      for (var layer = 0; layer < 3; layer++) {
        c.fillStyle = ['rgba(18,42,54,0.85)', 'rgba(24,54,58,0.85)', 'rgba(30,62,52,0.9)'][layer];
        c.beginPath();
        var baseY = 360 + layer * 70;
        c.moveTo(0, 720);
        c.lineTo(0, baseY);
        for (var x = 0; x <= 1280; x += 40) {
          c.lineTo(x, baseY - Math.sin(x * 0.006 + layer * 2.1) * (34 + layer * 12) - r() * 12);
        }
        c.lineTo(1280, 720);
        c.closePath();
        c.fill();
      }
      // terraced foreground steps
      c.fillStyle = 'rgba(40,74,52,0.9)';
      for (var i = 0; i < 5; i++) c.fillRect(0, 600 + i * 26, 1280, 14);
    });
  };

  // ------------------------------------------------------------------ icons
  /* One vector routine per icon, baked to 44px textures. Icons carry meaning
   * in the HUD so labels can stay out of the play area. */
  var ICONS = {
    sun: function (c, s) {
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.2, 0, TAU); c.fill();
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * TAU;
        c.save(); c.translate(s / 2, s / 2); c.rotate(a);
        c.fillRect(s * 0.28, -s * 0.035, s * 0.14, s * 0.07);
        c.restore();
      }
    },
    rain: function (c, s) {
      c.beginPath();
      c.arc(s * 0.38, s * 0.4, s * 0.16, 0, TAU);
      c.arc(s * 0.6, s * 0.42, s * 0.2, 0, TAU);
      c.fill();
      c.lineWidth = s * 0.07; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(s * (0.32 + i * 0.16), s * 0.62);
        c.lineTo(s * (0.26 + i * 0.16), s * 0.84);
        c.stroke();
      }
    },
    snow: function (c, s) {
      c.lineWidth = s * 0.07; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var a = i / 3 * Math.PI;
        c.beginPath();
        c.moveTo(s / 2 - Math.cos(a) * s * 0.3, s / 2 - Math.sin(a) * s * 0.3);
        c.lineTo(s / 2 + Math.cos(a) * s * 0.3, s / 2 + Math.sin(a) * s * 0.3);
        c.stroke();
      }
    },
    wind: function (c, s) {
      c.lineWidth = s * 0.08; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var y = s * (0.34 + i * 0.16);
        c.beginPath();
        c.moveTo(s * 0.16, y);
        c.lineTo(s * (0.62 + i * 0.06), y);
        c.arc(s * (0.62 + i * 0.06), y - s * 0.09, s * 0.09, Math.PI / 2, Math.PI * 1.9);
        c.stroke();
      }
    },
    rout: function (c, s) {  // crossed blades
      c.lineWidth = s * 0.11; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.2, s * 0.8); c.lineTo(s * 0.8, s * 0.2); c.stroke();
      c.beginPath(); c.moveTo(s * 0.2, s * 0.2); c.lineTo(s * 0.8, s * 0.8); c.stroke();
    },
    hold: function (c, s) {  // shield
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.14);
      c.lineTo(s * 0.84, s * 0.28);
      c.lineTo(s * 0.72, s * 0.74);
      c.lineTo(s * 0.5, s * 0.88);
      c.lineTo(s * 0.28, s * 0.74);
      c.lineTo(s * 0.16, s * 0.28);
      c.closePath(); c.fill();
    },
    escort: function (c, s) {  // cart
      c.fillRect(s * 0.18, s * 0.34, s * 0.52, s * 0.26);
      c.beginPath(); c.arc(s * 0.3, s * 0.72, s * 0.11, 0, TAU); c.fill();
      c.beginPath(); c.arc(s * 0.6, s * 0.72, s * 0.11, 0, TAU); c.fill();
      c.fillRect(s * 0.7, s * 0.44, s * 0.16, s * 0.06);
    },
    siege: function (c, s) {  // gate with a crack
      c.fillRect(s * 0.2, s * 0.24, s * 0.6, s * 0.62);
      c.clearRect(s * 0.44, s * 0.34, s * 0.09, s * 0.5);
      c.fillRect(s * 0.14, s * 0.16, s * 0.72, s * 0.1);
    },
    triangle: function (c, s) {
      c.lineWidth = s * 0.09; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.16); c.lineTo(s * 0.86, s * 0.8); c.lineTo(s * 0.14, s * 0.8);
      c.closePath(); c.stroke();
    },
    flank: function (c, s) {
      c.lineWidth = s * 0.09; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.18, s * 0.3); c.lineTo(s * 0.5, s * 0.6); c.stroke();
      c.beginPath(); c.moveTo(s * 0.82, s * 0.3); c.lineTo(s * 0.5, s * 0.6); c.stroke();
      c.beginPath(); c.arc(s * 0.5, s * 0.72, s * 0.1, 0, TAU); c.fill();
    },
    height: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.12, s * 0.8); c.lineTo(s * 0.46, s * 0.28); c.lineTo(s * 0.62, s * 0.52);
      c.lineTo(s * 0.78, s * 0.32); c.lineTo(s * 0.9, s * 0.8);
      c.closePath(); c.fill();
    },
    charge: function (c, s) {
      c.lineWidth = s * 0.1; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.16, s * 0.5); c.lineTo(s * 0.7, s * 0.5); c.stroke();
      c.beginPath();
      c.moveTo(s * 0.62, s * 0.28); c.lineTo(s * 0.9, s * 0.5); c.lineTo(s * 0.62, s * 0.72);
      c.closePath(); c.fill();
    },
    supply: function (c, s) {
      c.lineWidth = s * 0.09;
      if (c.setLineDash) c.setLineDash([s * 0.12, s * 0.1]);
      c.beginPath(); c.moveTo(s * 0.16, s * 0.7); c.lineTo(s * 0.84, s * 0.3); c.stroke();
      if (c.setLineDash) c.setLineDash([]);
    },
    aura: function (c, s) {
      c.lineWidth = s * 0.08;
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.32, 0, TAU); c.stroke();
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.14, 0, TAU); c.fill();
    },
    ambush: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.14); c.lineTo(s * 0.62, s * 0.46); c.lineTo(s * 0.5, s * 0.86);
      c.lineTo(s * 0.38, s * 0.46);
      c.closePath(); c.fill();
    },
    cover: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.16); c.lineTo(s * 0.82, s * 0.32); c.lineTo(s * 0.5, s * 0.84);
      c.lineTo(s * 0.18, s * 0.32);
      c.closePath();
      c.lineWidth = s * 0.09; c.stroke();
    },
    shield: function (c, s) { ICONS.hold(c, s); },
    hp: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.82);
      c.bezierCurveTo(s * 0.05, s * 0.5, s * 0.22, s * 0.14, s * 0.5, s * 0.36);
      c.bezierCurveTo(s * 0.78, s * 0.14, s * 0.95, s * 0.5, s * 0.5, s * 0.82);
      c.fill();
    },
    warcry: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.16, s * 0.38); c.lineTo(s * 0.42, s * 0.38); c.lineTo(s * 0.66, s * 0.18);
      c.lineTo(s * 0.66, s * 0.82); c.lineTo(s * 0.42, s * 0.62); c.lineTo(s * 0.16, s * 0.62);
      c.closePath(); c.fill();
      c.lineWidth = s * 0.06;
      c.beginPath(); c.arc(s * 0.72, s * 0.5, s * 0.14, -0.9, 0.9); c.stroke();
    },
    rally: function (c, s) {
      c.fillRect(s * 0.44, s * 0.14, s * 0.07, s * 0.72);
      c.beginPath();
      c.moveTo(s * 0.51, s * 0.18); c.lineTo(s * 0.86, s * 0.28); c.lineTo(s * 0.7, s * 0.42);
      c.lineTo(s * 0.86, s * 0.56); c.lineTo(s * 0.51, s * 0.5);
      c.closePath(); c.fill();
    },
    volley: function (c, s) {
      c.lineWidth = s * 0.07; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(s * 0.14, s * (0.74 - i * 0.06));
        c.quadraticCurveTo(s * 0.5, s * (0.1 + i * 0.1), s * 0.88, s * (0.5 + i * 0.12));
        c.stroke();
      }
    },
    fire: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.12);
      c.bezierCurveTo(s * 0.82, s * 0.4, s * 0.76, s * 0.86, s * 0.5, s * 0.88);
      c.bezierCurveTo(s * 0.24, s * 0.86, s * 0.18, s * 0.44, s * 0.5, s * 0.12);
      c.fill();
    },
    march: function (c, s) {
      c.lineWidth = s * 0.09; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(s * (0.16 + i * 0.22), s * 0.68);
        c.lineTo(s * (0.34 + i * 0.22), s * 0.32);
        c.stroke();
      }
    },
    feint: function (c, s) {
      c.lineWidth = s * 0.08; c.lineCap = 'round';
      c.beginPath();
      c.arc(s * 0.5, s * 0.5, s * 0.28, 0.6, 5.2);
      c.stroke();
      c.beginPath();
      c.moveTo(s * 0.74, s * 0.24); c.lineTo(s * 0.9, s * 0.42); c.lineTo(s * 0.66, s * 0.46);
      c.closePath(); c.fill();
    },
    star: function (c, s) {
      c.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? s * 0.18 : s * 0.42;
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); c.fill();
    },
    undo: function (c, s) {
      c.lineWidth = s * 0.1; c.lineCap = 'round';
      c.beginPath(); c.arc(s * 0.52, s * 0.54, s * 0.26, Math.PI * 0.9, Math.PI * 2.4); c.stroke();
      c.beginPath();
      c.moveTo(s * 0.16, s * 0.28); c.lineTo(s * 0.34, s * 0.5); c.lineTo(s * 0.1, s * 0.56);
      c.closePath(); c.fill();
    },
    eye: function (c, s) {
      c.lineWidth = s * 0.08;
      c.beginPath();
      c.moveTo(s * 0.1, s * 0.5);
      c.quadraticCurveTo(s * 0.5, s * 0.14, s * 0.9, s * 0.5);
      c.quadraticCurveTo(s * 0.5, s * 0.86, s * 0.1, s * 0.5);
      c.stroke();
      c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.13, 0, TAU); c.fill();
    },
    gear: function (c, s) {
      c.save(); c.translate(s / 2, s / 2);
      for (var i = 0; i < 8; i++) {
        c.rotate(TAU / 8);
        c.fillRect(-s * 0.06, -s * 0.44, s * 0.12, s * 0.16);
      }
      c.restore();
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.24, 0, TAU); c.fill();
      c.save(); c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.1, 0, TAU); c.fill();
      c.restore();
    },
    end: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.2, s * 0.2); c.lineTo(s * 0.6, s * 0.5); c.lineTo(s * 0.2, s * 0.8);
      c.closePath(); c.fill();
      c.fillRect(s * 0.66, s * 0.2, s * 0.12, s * 0.6);
    },
    back: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.7, s * 0.2); c.lineTo(s * 0.3, s * 0.5); c.lineTo(s * 0.7, s * 0.8);
      c.closePath(); c.fill();
    },
    lock: function (c, s) {
      c.fillRect(s * 0.26, s * 0.46, s * 0.48, s * 0.36);
      c.lineWidth = s * 0.09;
      c.beginPath(); c.arc(s * 0.5, s * 0.46, s * 0.16, Math.PI, TAU); c.stroke();
    },
    heal: function (c, s) {
      c.fillRect(s * 0.42, s * 0.18, s * 0.16, s * 0.64);
      c.fillRect(s * 0.18, s * 0.42, s * 0.64, s * 0.16);
    },
    banner: function (c, s) {
      c.fillRect(s * 0.42, s * 0.1, s * 0.06, s * 0.8);
      c.beginPath();
      c.moveTo(s * 0.48, s * 0.14); c.lineTo(s * 0.9, s * 0.24); c.lineTo(s * 0.78, s * 0.4);
      c.lineTo(s * 0.9, s * 0.56); c.lineTo(s * 0.48, s * 0.48);
      c.closePath(); c.fill();
    }
  };
  A.ICON_KEYS = Object.keys(ICONS);

  A.bakeIcons = function (scene) {
    var size = 44;
    A.ICON_KEYS.forEach(function (name) {
      tex(scene, 'ic-' + name, size, size, function (c) {
        c.fillStyle = '#ffffff';
        c.strokeStyle = '#ffffff';
        ICONS[name](c, size);
      });
    });
  };
  A.iconKey = function (name) {
    return A.ICON_KEYS.indexOf(name) >= 0 ? 'ic-' + name : 'ic-star';
  };

  // ------------------------------------------------------------------ units
  /* Silhouette tiers per the strategy bible: grunts are one compact mass,
   * elites carry one strong asymmetry, the general is a vertical focal shape
   * with a back banner, structures sit on a wide anchored footprint. All art
   * is baked at 2x and displayed at 0.5 so it stays crisp on a phone.
   */
  var FACTION = {
    0: { body: '#3d78b8', trim: '#43c7f4', light: '#bfeeff', dark: '#1c3f66', notch: '#e8f9ff' },
    1: { body: '#a63f45', trim: '#ff665c', light: '#ffd0c9', dark: '#5e1f2c', notch: '#ffe6e2' }
  };
  A.FACTION = FACTION;

  function shade(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(4,10,16,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, TAU);
    ctx.fill();
  }
  function outline(ctx, fn, color, width) {
    ctx.save();
    ctx.strokeStyle = color || 'rgba(6,14,20,0.85)';
    ctx.lineWidth = width || 3;
    ctx.lineJoin = 'round';
    fn();
    ctx.stroke();
    ctx.restore();
  }

  function drawUnit(c, cls, side, W, H) {
    var f = FACTION[side] || FACTION[0];
    var cx = W / 2, groundY = H - 14;
    shade(c, cx, groundY + 4, 26, 9);

    function torso(topY, halfW, botHalf) {
      c.beginPath();
      c.moveTo(cx - halfW, topY);
      c.lineTo(cx + halfW, topY);
      c.lineTo(cx + botHalf, groundY);
      c.lineTo(cx - botHalf, groundY);
      c.closePath();
    }
    function head(y, r) {
      c.beginPath();
      c.arc(cx, y, r, 0, TAU);
    }

    if (cls === 'spear') {
      c.strokeStyle = '#c8b184'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx + 20, groundY + 2); c.lineTo(cx - 4, groundY - 84); c.stroke();
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 4, groundY - 96); c.lineTo(cx + 4, groundY - 78); c.lineTo(cx - 11, groundY - 79);
      c.closePath(); c.fill();
      c.fillStyle = f.body;
      torso(groundY - 46, 19, 15); c.fill();
      outline(c, function () { torso(groundY - 46, 19, 15); });
      c.fillStyle = f.dark;
      c.fillRect(cx - 19, groundY - 30, 38, 7);
      c.fillStyle = f.trim;
      c.fillRect(cx - 19, groundY - 46, 38, 5);
      c.fillStyle = '#e5d6b8';
      head(groundY - 58, 12); c.fill();
      outline(c, function () { head(groundY - 58, 12); });
      c.fillStyle = f.trim;
      c.beginPath();
      c.moveTo(cx - 12, groundY - 63); c.lineTo(cx + 12, groundY - 63); c.lineTo(cx, groundY - 76);
      c.closePath(); c.fill();
    } else if (cls === 'bow') {
      c.strokeStyle = '#caa96a'; c.lineWidth = 4;
      c.beginPath(); c.arc(cx - 22, groundY - 44, 24, -1.15, 1.15); c.stroke();
      c.strokeStyle = 'rgba(240,240,230,0.8)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(cx - 12, groundY - 66); c.lineTo(cx - 12, groundY - 22); c.stroke();
      c.fillStyle = f.body;
      torso(groundY - 42, 17, 14); c.fill();
      outline(c, function () { torso(groundY - 42, 17, 14); });
      c.fillStyle = f.dark;
      c.beginPath();
      c.moveTo(cx - 17, groundY - 42); c.lineTo(cx + 17, groundY - 42); c.lineTo(cx + 6, groundY - 20);
      c.closePath(); c.fill();
      c.fillStyle = '#e5d6b8';
      head(groundY - 54, 11); c.fill();
      outline(c, function () { head(groundY - 54, 11); });
      c.fillStyle = f.trim;
      c.fillRect(cx - 12, groundY - 62, 24, 5);
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx + 12, groundY - 62); c.lineTo(cx + 24, groundY - 56); c.lineTo(cx + 12, groundY - 50);
      c.closePath(); c.fill();
    } else if (cls === 'cav') {
      // elite: horse mass plus a raised rider, one strong asymmetry
      c.fillStyle = '#4d4335';
      c.beginPath();
      c.moveTo(cx - 34, groundY - 20);
      c.quadraticCurveTo(cx - 30, groundY - 50, cx + 4, groundY - 48);
      c.quadraticCurveTo(cx + 34, groundY - 46, cx + 32, groundY - 16);
      c.lineTo(cx + 24, groundY);
      c.lineTo(cx + 16, groundY - 18);
      c.lineTo(cx - 14, groundY - 18);
      c.lineTo(cx - 22, groundY);
      c.closePath(); c.fill();
      outline(c, function () {
        c.beginPath();
        c.moveTo(cx - 34, groundY - 20);
        c.quadraticCurveTo(cx - 30, groundY - 50, cx + 4, groundY - 48);
        c.quadraticCurveTo(cx + 34, groundY - 46, cx + 32, groundY - 16);
      }, 'rgba(6,14,20,0.8)', 3);
      c.fillStyle = '#5b5041';
      c.beginPath();
      c.moveTo(cx + 26, groundY - 44); c.lineTo(cx + 42, groundY - 62); c.lineTo(cx + 46, groundY - 44);
      c.lineTo(cx + 34, groundY - 34);
      c.closePath(); c.fill();
      c.fillStyle = f.body;
      c.beginPath();
      c.moveTo(cx - 16, groundY - 52); c.lineTo(cx + 10, groundY - 52); c.lineTo(cx + 6, groundY - 78);
      c.lineTo(cx - 12, groundY - 78);
      c.closePath(); c.fill();
      outline(c, function () {
        c.beginPath();
        c.moveTo(cx - 16, groundY - 52); c.lineTo(cx + 10, groundY - 52); c.lineTo(cx + 6, groundY - 78);
        c.lineTo(cx - 12, groundY - 78); c.closePath();
      });
      c.fillStyle = f.trim;
      c.fillRect(cx - 16, groundY - 58, 26, 5);
      c.fillStyle = '#e5d6b8';
      head(groundY - 86, 11); c.fill();
      outline(c, function () { head(groundY - 86, 11); });
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 12, groundY - 92); c.lineTo(cx + 10, groundY - 92); c.lineTo(cx - 2, groundY - 108);
      c.closePath(); c.fill();
      c.strokeStyle = '#c8b184'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx - 26, groundY - 40); c.lineTo(cx + 44, groundY - 70); c.stroke();
    } else if (cls === 'siege') {
      c.fillStyle = '#6b5738';
      c.fillRect(cx - 34, groundY - 34, 68, 22);
      outline(c, function () { c.strokeRect(cx - 34, groundY - 34, 68, 22); });
      c.fillStyle = '#4a3c26';
      c.beginPath(); c.arc(cx - 20, groundY - 8, 12, 0, TAU); c.fill();
      c.beginPath(); c.arc(cx + 20, groundY - 8, 12, 0, TAU); c.fill();
      c.strokeStyle = '#8a7145'; c.lineWidth = 8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx - 10, groundY - 34); c.lineTo(cx + 26, groundY - 84); c.stroke();
      c.fillStyle = f.body;
      c.beginPath(); c.arc(cx + 30, groundY - 88, 13, 0, TAU); c.fill();
      outline(c, function () { c.beginPath(); c.arc(cx + 30, groundY - 88, 13, 0, TAU); });
      c.fillStyle = f.trim;
      c.fillRect(cx - 34, groundY - 40, 68, 6);
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 34, groundY - 40); c.lineTo(cx - 20, groundY - 54); c.lineTo(cx - 6, groundY - 40);
      c.closePath(); c.fill();
    } else if (cls === 'healer') {
      c.fillStyle = f.body;
      torso(groundY - 44, 18, 15); c.fill();
      outline(c, function () { torso(groundY - 44, 18, 15); });
      c.fillStyle = '#e8e2cf';
      c.beginPath();
      c.moveTo(cx - 18, groundY - 44); c.lineTo(cx + 18, groundY - 44); c.lineTo(cx + 12, groundY - 12);
      c.lineTo(cx - 12, groundY - 12);
      c.closePath(); c.fill();
      c.fillStyle = f.trim;
      c.fillRect(cx - 5, groundY - 40, 10, 24);
      c.fillRect(cx - 12, groundY - 33, 24, 10);
      c.fillStyle = '#e5d6b8';
      head(groundY - 56, 11); c.fill();
      outline(c, function () { head(groundY - 56, 11); });
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 14, groundY - 62); c.lineTo(cx + 14, groundY - 62); c.lineTo(cx, groundY - 72);
      c.closePath(); c.fill();
      c.strokeStyle = '#c8b184'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(cx + 20, groundY - 6); c.lineTo(cx + 20, groundY - 40); c.stroke();
      c.fillStyle = '#9ad6a8';
      c.beginPath(); c.arc(cx + 20, groundY - 46, 8, 0, TAU); c.fill();
    } else if (cls === 'general') {
      // hero tier: vertical focal shape, back banner, ability ready accent
      c.strokeStyle = '#c8b184'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(cx - 22, groundY); c.lineTo(cx - 22, groundY - 118); c.stroke();
      c.fillStyle = f.trim;
      c.beginPath();
      c.moveTo(cx - 22, groundY - 116);
      c.lineTo(cx + 30, groundY - 104);
      c.lineTo(cx + 16, groundY - 88);
      c.lineTo(cx + 30, groundY - 72);
      c.lineTo(cx - 22, groundY - 62);
      c.closePath(); c.fill();
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 22, groundY - 116); c.lineTo(cx + 30, groundY - 104); c.lineTo(cx + 26, groundY - 96);
      c.lineTo(cx - 22, groundY - 107);
      c.closePath(); c.fill();
      c.fillStyle = f.dark;
      c.beginPath();
      c.moveTo(cx - 26, groundY - 56); c.lineTo(cx + 26, groundY - 56); c.lineTo(cx + 18, groundY);
      c.lineTo(cx - 18, groundY);
      c.closePath(); c.fill();
      c.fillStyle = f.body;
      torso(groundY - 60, 22, 17); c.fill();
      outline(c, function () { torso(groundY - 60, 22, 17); });
      c.fillStyle = f.trim;
      c.fillRect(cx - 22, groundY - 60, 44, 6);
      c.fillRect(cx - 22, groundY - 36, 44, 4);
      c.fillStyle = '#e5d6b8';
      head(groundY - 76, 13); c.fill();
      outline(c, function () { head(groundY - 76, 13); });
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 15, groundY - 82); c.lineTo(cx + 15, groundY - 82); c.lineTo(cx, groundY - 104);
      c.closePath(); c.fill();
      c.strokeStyle = '#e8d9a8'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx + 20, groundY - 24); c.lineTo(cx + 40, groundY - 64); c.stroke();
    } else if (cls === 'convoy') {
      c.fillStyle = '#6d5a3a';
      c.fillRect(cx - 34, groundY - 38, 68, 26);
      outline(c, function () { c.strokeRect(cx - 34, groundY - 38, 68, 26); });
      c.fillStyle = '#8a7145';
      c.fillRect(cx - 30, groundY - 52, 26, 16);
      c.fillRect(cx + 2, groundY - 50, 24, 14);
      c.fillStyle = '#3f3324';
      c.beginPath(); c.arc(cx - 20, groundY - 8, 13, 0, TAU); c.fill();
      c.beginPath(); c.arc(cx + 20, groundY - 8, 13, 0, TAU); c.fill();
      c.fillStyle = FACTION[0].trim;
      c.fillRect(cx - 34, groundY - 44, 68, 6);
      c.fillStyle = FACTION[0].light;
      c.beginPath();
      c.moveTo(cx + 22, groundY - 52); c.lineTo(cx + 40, groundY - 62); c.lineTo(cx + 22, groundY - 68);
      c.closePath(); c.fill();
    } else if (cls === 'gatehouse') {
      c.fillStyle = '#6f6455';
      c.fillRect(cx - 42, groundY - 76, 84, 76);
      c.fillStyle = '#5a5044';
      for (var gy = 0; gy < 4; gy++) {
        for (var gx = 0; gx < 4; gx++) {
          c.fillRect(cx - 40 + gx * 21 + (gy % 2 ? 8 : 0), groundY - 74 + gy * 19, 17, 15);
        }
      }
      c.fillStyle = '#3a2c1c';
      c.beginPath();
      c.moveTo(cx - 20, groundY);
      c.lineTo(cx - 20, groundY - 36);
      c.quadraticCurveTo(cx, groundY - 58, cx + 20, groundY - 36);
      c.lineTo(cx + 20, groundY);
      c.closePath(); c.fill();
      c.strokeStyle = '#8a7145'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(cx - 20, groundY - 22); c.lineTo(cx + 20, groundY - 22); c.stroke();
      c.fillStyle = f.trim;
      c.fillRect(cx - 42, groundY - 84, 84, 8);
      c.fillStyle = f.light;
      c.beginPath();
      c.moveTo(cx - 6, groundY - 84); c.lineTo(cx - 6, groundY - 112); c.lineTo(cx + 24, groundY - 102);
      c.lineTo(cx - 6, groundY - 94);
      c.closePath(); c.fill();
    } else if (cls === 'watchtower') {
      c.fillStyle = '#6f6455';
      c.beginPath();
      c.moveTo(cx - 30, groundY); c.lineTo(cx - 22, groundY - 78);
      c.lineTo(cx + 22, groundY - 78); c.lineTo(cx + 30, groundY);
      c.closePath(); c.fill();
      outline(c, function () {
        c.beginPath();
        c.moveTo(cx - 30, groundY); c.lineTo(cx - 22, groundY - 78);
        c.lineTo(cx + 22, groundY - 78); c.lineTo(cx + 30, groundY); c.closePath();
      });
      c.fillStyle = '#574d40';
      c.fillRect(cx - 26, groundY - 46, 52, 8);
      c.fillRect(cx - 24, groundY - 24, 48, 8);
      c.fillStyle = '#8d8069';
      c.fillRect(cx - 32, groundY - 96, 64, 20);
      for (var i = 0; i < 4; i++) c.fillRect(cx - 32 + i * 18, groundY - 108, 10, 14);
      c.fillStyle = '#2a2118';
      c.fillRect(cx - 8, groundY - 92, 16, 14);
      c.fillStyle = f.trim;
      c.fillRect(cx - 32, groundY - 100, 64, 5);
    }

    // faction notch, repeated on every unit so ownership never rests on hue
    c.fillStyle = f.notch;
    if (side === 0) {
      c.fillRect(cx - 5, 6, 10, 10);
    } else {
      c.beginPath();
      c.moveTo(cx, 4); c.lineTo(cx + 7, 16); c.lineTo(cx - 7, 16);
      c.closePath(); c.fill();
    }
  }

  A.UNIT_KEYS = ['spear', 'bow', 'cav', 'siege', 'healer', 'general', 'convoy', 'gatehouse', 'watchtower'];
  A.UNIT_W = 108;
  A.UNIT_H = 132;
  A.bakeUnits = function (scene) {
    A.UNIT_KEYS.forEach(function (cls) {
      for (var side = 0; side < 2; side++) {
        (function (cls, side) {
          tex(scene, 'u-' + cls + '-' + side, A.UNIT_W, A.UNIT_H, function (c) {
            drawUnit(c, cls, side, A.UNIT_W, A.UNIT_H);
          });
        }(cls, side));
      }
    });
    // team base rings, drawn under the unit so overlaps stay readable
    for (var s2 = 0; s2 < 2; s2++) {
      (function (side) {
        tex(scene, 'base-' + side, 72, 34, function (c) {
          var f = FACTION[side];
          c.strokeStyle = f.trim;
          c.lineWidth = 3.4;
          c.beginPath();
          c.ellipse(36, 17, 26, 10, 0, 0, TAU);
          c.stroke();
          c.strokeStyle = 'rgba(255,255,255,0.35)';
          c.lineWidth = 1.4;
          c.beginPath();
          c.ellipse(36, 17, 21, 7.5, 0, 0, TAU);
          c.stroke();
        });
      }(s2));
    }
  };

  // ------------------------------------------------------------------ board
  /* The whole battlefield is painted into one texture per battle: terrain,
   * seams, elevation, props and landmarks. A 200 cell Graphics grid cost
   * 316ms a frame at 4x throttle, a blitted texture costs one draw call. */
  A.bakeBoard = function (scene, key, battle, E) {
    var s = A.HEXR;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < battle.tiles.length; i++) {
      var p = E.toPix(battle.tiles[i].q, battle.tiles[i].r, s);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    var pad = s * 2.2;
    var ox = -minX + pad, oy = -minY + pad;
    var w = (maxX - minX) + pad * 2, h = (maxY - minY) + pad * 2;
    var prov = battle.prov;
    var r = rnd((battle.def.id * 7919 + battle.map.id.length * 131) >>> 0);

    tex(scene, key, w, h, function (c) {
      /* A soft island shadow, not a hard rectangle: the province sky shows
       * through around the field so the board reads as ground, not a card. */
      var g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, prov.sky[1]);
      g.addColorStop(0.72, prov.sky[0]);
      g.addColorStop(1, 'rgba(6,14,22,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      function centre(t) {
        var p = E.toPix(t.q, t.r, s);
        return { x: p.x + ox, y: p.y + oy };
      }

      // base terrain pass
      for (i = 0; i < battle.tiles.length; i++) {
        var t = battle.tiles[i], m = centre(t);
        var rec = TERRAIN[t.terr] || TERRAIN.plain;
        var lift = (t.elev || 0) * 3;
        if (t.elev) {
          hexPath(c, m.x, m.y + 4, s - 0.5);
          c.fillStyle = 'rgba(4,10,16,0.4)';
          c.fill();
        }
        hexPath(c, m.x, m.y - lift, s - 0.5);
        c.fillStyle = (i + t.row) % 2 ? rec.base : rec.alt;
        c.fill();

        c.save();
        hexPath(c, m.x, m.y - lift, s - 0.5);
        c.clip();
        // material motif per terrain family
        if (t.terr === 'forest') {
          for (var k = 0; k < 4; k++) {
            var tx = m.x - 16 + r() * 32, ty = m.y - lift - 12 + r() * 24;
            c.fillStyle = 'rgba(12,26,16,0.55)';
            c.beginPath(); c.ellipse(tx + 2, ty + 6, 10, 5, 0, 0, TAU); c.fill();
            c.fillStyle = k % 2 ? '#3f6b3c' : '#4a7c44';
            c.beginPath();
            c.moveTo(tx, ty - 15); c.lineTo(tx + 9, ty + 4); c.lineTo(tx - 9, ty + 4);
            c.closePath(); c.fill();
            c.fillStyle = '#2c3a22';
            c.fillRect(tx - 1.6, ty + 3, 3.2, 6);
          }
        } else if (t.terr === 'hill' || t.terr === 'peak') {
          c.strokeStyle = 'rgba(255,255,255,0.13)';
          c.lineWidth = 2;
          for (var a = 0; a < 3; a++) {
            c.beginPath();
            c.arc(m.x, m.y - lift + 10 + a * 8, 20 - a * 5, Math.PI * 1.15, Math.PI * 1.85);
            c.stroke();
          }
          if (t.terr === 'peak') {
            c.fillStyle = '#39404d';
            c.beginPath();
            c.moveTo(m.x - 22, m.y - lift + 20);
            c.lineTo(m.x - 6, m.y - lift - 22);
            c.lineTo(m.x + 4, m.y - lift - 2);
            c.lineTo(m.x + 14, m.y - lift - 26);
            c.lineTo(m.x + 26, m.y - lift + 20);
            c.closePath(); c.fill();
            c.fillStyle = 'rgba(220,232,240,0.6)';
            c.beginPath();
            c.moveTo(m.x - 6, m.y - lift - 22); c.lineTo(m.x + 1, m.y - lift - 9);
            c.lineTo(m.x - 12, m.y - lift - 6);
            c.closePath(); c.fill();
          }
        } else if (t.terr === 'terrace') {
          c.strokeStyle = 'rgba(216,195,140,0.35)';
          c.lineWidth = 2.4;
          for (var y2 = -18; y2 <= 18; y2 += 9) {
            c.beginPath();
            c.moveTo(m.x - 28, m.y - lift + y2);
            c.quadraticCurveTo(m.x, m.y - lift + y2 - 4, m.x + 28, m.y - lift + y2);
            c.stroke();
          }
        } else if (t.terr === 'water' || t.terr === 'ford') {
          c.strokeStyle = t.terr === 'ford' ? 'rgba(216,231,240,0.55)' : 'rgba(160,205,230,0.35)';
          c.lineWidth = 2;
          for (var wv = -16; wv <= 16; wv += 11) {
            c.beginPath();
            c.moveTo(m.x - 26, m.y - lift + wv);
            c.quadraticCurveTo(m.x - 8, m.y - lift + wv - 5, m.x + 8, m.y - lift + wv);
            c.quadraticCurveTo(m.x + 20, m.y - lift + wv + 5, m.x + 28, m.y - lift + wv);
            c.stroke();
          }
          if (t.terr === 'ford') {
            c.fillStyle = '#8d8069';
            for (var st = 0; st < 5; st++) {
              c.beginPath();
              c.ellipse(m.x - 20 + r() * 40, m.y - lift - 16 + r() * 32, 4.5, 3, 0, 0, TAU);
              c.fill();
            }
          }
        } else if (t.terr === 'marsh') {
          c.strokeStyle = 'rgba(150,175,120,0.5)';
          c.lineWidth = 1.8;
          for (var rd = 0; rd < 6; rd++) {
            var rx = m.x - 20 + r() * 40, ry = m.y - lift + 12;
            c.beginPath();
            c.moveTo(rx, ry);
            c.quadraticCurveTo(rx + 3, ry - 12, rx + 1, ry - 20);
            c.stroke();
          }
        } else if (t.terr === 'road') {
          c.fillStyle = 'rgba(216,195,140,0.18)';
          c.fillRect(m.x - 30, m.y - lift - 9, 60, 18);
          c.fillStyle = 'rgba(90,80,60,0.45)';
          for (var pv = 0; pv < 5; pv++) {
            c.fillRect(m.x - 26 + pv * 11, m.y - lift - 6 + (pv % 2) * 6, 8, 5);
          }
        } else if (t.terr === 'wall' || t.terr === 'keep' || t.terr === 'gate') {
          c.fillStyle = 'rgba(0,0,0,0.18)';
          for (var by = 0; by < 4; by++) {
            for (var bx = 0; bx < 4; bx++) {
              c.fillRect(m.x - 30 + bx * 16 + (by % 2 ? 8 : 0), m.y - lift - 26 + by * 14, 13, 11);
            }
          }
          if (t.terr === 'gate') {
            c.fillStyle = '#3a2c1c';
            c.beginPath();
            c.moveTo(m.x - 12, m.y - lift + 20);
            c.lineTo(m.x - 12, m.y - lift - 6);
            c.quadraticCurveTo(m.x, m.y - lift - 22, m.x + 12, m.y - lift - 6);
            c.lineTo(m.x + 12, m.y - lift + 20);
            c.closePath(); c.fill();
          }
          if (t.terr === 'keep') {
            c.fillStyle = 'rgba(224,163,74,0.28)';
            c.fillRect(m.x - 22, m.y - lift - 30, 44, 8);
          }
        } else {
          // plain: sparse grass tufts keep the ground from reading as flat fill
          c.strokeStyle = 'rgba(255,255,255,0.08)';
          c.lineWidth = 1.6;
          for (var tf = 0; tf < 5; tf++) {
            var gx = m.x - 24 + r() * 48, gy = m.y - lift - 18 + r() * 36;
            c.beginPath();
            c.moveTo(gx, gy);
            c.lineTo(gx + 2, gy - 6);
            c.stroke();
          }
        }
        c.restore();

        // crisp ownership grid, low contrast so faction colour always wins
        hexPath(c, m.x, m.y - lift, s - 0.5);
        c.strokeStyle = 'rgba(9,18,26,0.55)';
        c.lineWidth = 1.4;
        c.stroke();
        if (t.elev) {
          c.strokeStyle = 'rgba(255,255,255,0.18)';
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(m.x - s * 0.86, m.y - lift - s * 0.5);
          c.lineTo(m.x, m.y - lift - s);
          c.lineTo(m.x + s * 0.86, m.y - lift - s * 0.5);
          c.stroke();
        }
      }

      // landmark dressing: three recognisable silhouettes per province
      var poles = [];
      for (i = 0; i < battle.tiles.length; i++) {
        var lt = battle.tiles[i];
        if (lt.mark || lt.terr === 'gate') poles.push(lt);
      }
      for (i = 0; i < poles.length && i < 8; i++) {
        var pm = centre(poles[i]);
        if (poles[i].mark) {
          c.strokeStyle = '#c8b184';
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(pm.x, pm.y + 6);
          c.lineTo(pm.x, pm.y - 46);
          c.stroke();
          c.fillStyle = prov.accent;
          c.beginPath();
          c.moveTo(pm.x, pm.y - 46);
          c.lineTo(pm.x + 26, pm.y - 39);
          c.lineTo(pm.x + 16, pm.y - 29);
          c.lineTo(pm.x + 26, pm.y - 19);
          c.lineTo(pm.x, pm.y - 24);
          c.closePath();
          c.fill();
        }
      }
    });
    return { key: key, w: w, h: h, ox: ox, oy: oy };
  };

  root.WBArt = A;
})(typeof window !== 'undefined' ? window : globalThis);
