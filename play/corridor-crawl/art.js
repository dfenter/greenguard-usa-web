/* Corridor Crawl - procedural original-IP sprite, icon, and FX texture bakery.
 * Everything here is baked once into canvas textures during the loading screen
 * so the per-frame renderer only moves pooled sprites: Phaser Graphics replays
 * its whole command list every frame, and this game must not pay that cost.
 */
(function (root) {
  'use strict';
  var CC = root.CC, TAU = CC.TAU;
  var MON = CC.MON, POTIONS = CC.POTIONS, SCROLLS = CC.SCROLLS, TOOLS = CC.TOOLS;
  var S = 48, HALF = 24;

  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

  // A cached canvas texture: reuses the existing source when the size matches
  // so a per-turn board bake never allocates a fresh canvas.
  function canvasTexture(scene, key, w, h, draw) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    var tex = scene.textures.exists(key) ? scene.textures.get(key) : null;
    if (tex && (tex.source[0].width !== w || tex.source[0].height !== h)) {
      scene.textures.remove(key); tex = null;
    }
    if (!tex) tex = scene.textures.createCanvas(key, w, h);
    var src = tex.getSourceImage(), ctx = src.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    draw(ctx, w, h);
    tex.refresh();
    return tex;
  }

  function outline(ctx, col, dark) {
    ctx.fillStyle = col; ctx.strokeStyle = dark || '#0d121c'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  }
  function eyes(ctx, ax, ay, col, w, h) {
    ctx.fillStyle = col;
    ctx.fillRect(ax - 6, ay, w || 4, h || 4);
    ctx.fillRect(ax + 2, ay, w || 4, h || 4);
  }
  function poly(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ------------------------------------------------------------- creatures
  var BODIES = {
    rat: function (ctx, col) {
      outline(ctx, col);
      ctx.beginPath(); ctx.ellipse(0, 5, 14, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-9, -5, 6, 0, TAU); ctx.arc(9, -5, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-22, 12, -19, 2); ctx.stroke();
      eyes(ctx, 0, -7, '#2b1a12', 3, 3);
    },
    swarm: function (ctx, col) {
      outline(ctx, col);
      var pts = [[0, -8, 7], [-10, 2, 6], [10, 3, 6], [-3, 10, 5], [6, -4, 5]];
      for (var i = 0; i < pts.length; i++) {
        ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], pts[i][2], 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#3a1c0e';
      ctx.fillRect(-11, 1, 2, 2); ctx.fillRect(9, 2, 2, 2); ctx.fillRect(-1, -9, 2, 2);
    },
    ooze: function (ctx, col) {
      outline(ctx, col);
      ctx.beginPath(); ctx.arc(0, 2, 15, Math.PI, TAU);
      ctx.lineTo(15, 12); ctx.quadraticCurveTo(0, 21, -15, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(-5, -5, 5, 3, -0.5, 0, TAU); ctx.fill();
      eyes(ctx, 0, 0, '#11222a');
    },
    archer: function (ctx, col) {
      outline(ctx, col);
      poly(ctx, [[-11, 16], [-9, -9], [0, -17], [9, -9], [11, 16]]);
      ctx.fillStyle = '#1a1720'; ctx.fillRect(-6, -4, 12, 5);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(9, 2, 15, -1.15, 1.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(15, -11); ctx.lineTo(15, 15); ctx.stroke();
      ctx.fillStyle = '#f2eddc'; ctx.fillRect(-4, -12, 8, 3);
    },
    spitter: function (ctx, col) {
      outline(ctx, col);
      ctx.beginPath(); ctx.ellipse(0, 6, 16, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-9, -6, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(9, -6, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#25340f';
      ctx.fillRect(-11, -8, 4, 4); ctx.fillRect(7, -8, 4, 4);
      ctx.fillRect(-6, 8, 12, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(-6, 2, 4, 0, TAU); ctx.arc(6, 4, 3, 0, TAU); ctx.fill();
    },
    thief: function (ctx, col) {
      outline(ctx, col);
      poly(ctx, [[-11, 17], [-8, -8], [0, -18], [10, -7], [12, 17]]);
      ctx.fillStyle = '#0d1c26'; ctx.fillRect(-6, -5, 13, 5);
      ctx.fillStyle = '#d9fbff'; ctx.fillRect(-3, -4, 3, 3);
      ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-13, -1); ctx.lineTo(-23, 10); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(-9, 6, 18, 3);
    },
    stalker: function (ctx, col) {
      outline(ctx, col);
      poly(ctx, [[0, -20], [14, 16], [0, 11], [-14, 16]]);
      ctx.fillStyle = '#f6efff'; ctx.fillRect(-4, -3, 8, 3);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-16, -13); ctx.moveTo(9, -6); ctx.lineTo(16, -13); ctx.stroke();
    },
    mimic: function (ctx, col) {
      outline(ctx, col);
      ctx.fillRect(-15, -1, 30, 16); ctx.strokeRect(-15, -1, 30, 16);
      ctx.beginPath(); ctx.moveTo(-15, -1); ctx.lineTo(-12, -13); ctx.lineTo(12, -13); ctx.lineTo(15, -1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a140c'; ctx.fillRect(-13, -3, 26, 5);
      ctx.fillStyle = '#fff4e2';
      for (var i = 0; i < 5; i++) { ctx.fillRect(-12 + i * 6, -3, 3, 4); ctx.fillRect(-9 + i * 6, 0, 3, 3); }
      ctx.fillStyle = '#ffcf80'; ctx.fillRect(-3, 5, 6, 6);
    },
    bulwark: function (ctx, col) {
      outline(ctx, col);
      poly(ctx, [[-6, 16], [-6, -10], [4, -16], [12, -8], [12, 16]]);
      ctx.fillStyle = '#e6edf6'; ctx.strokeStyle = '#0d121c';
      ctx.beginPath(); ctx.moveTo(-17, -13); ctx.lineTo(-3, -13); ctx.lineTo(-3, 8);
      ctx.lineTo(-10, 17); ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(-13, -8, 6, 12);
      ctx.fillStyle = '#1b222c'; ctx.fillRect(2, -9, 8, 4);
    },
    brute: function (ctx, col) {
      outline(ctx, col);
      ctx.fillRect(-14, -13, 28, 27); ctx.strokeRect(-14, -13, 28, 27);
      ctx.fillStyle = '#202938'; ctx.fillRect(-10, -6, 7, 5); ctx.fillRect(3, -6, 7, 5);
      ctx.fillStyle = col;
      ctx.fillRect(-20, -7, 6, 16); ctx.strokeRect(-20, -7, 6, 16);
      ctx.fillRect(14, -7, 6, 16); ctx.strokeRect(14, -7, 6, 16);
      ctx.fillStyle = '#5c6470'; ctx.fillRect(-9, 4, 18, 3);
    },
    warden: function (ctx, col) {
      outline(ctx, col);
      poly(ctx, [[-12, 17], [-8, -6], [0, -16], [8, -6], [12, 17]]);
      ctx.fillStyle = '#3a2c14'; ctx.fillRect(-5, -6, 10, 4);
      ctx.fillStyle = '#fff0bd'; ctx.strokeStyle = '#4a3a16'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(14, 1, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(14, 1, 10, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,180,0.35)';
      ctx.beginPath(); ctx.arc(14, 1, 13, 0, TAU); ctx.fill();
    },
    wraith: function (ctx, col) {
      outline(ctx, col);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(-13, 6); ctx.quadraticCurveTo(-13, -18, 0, -18); ctx.quadraticCurveTo(13, -18, 13, 6);
      ctx.lineTo(13, 12); ctx.lineTo(9, 6); ctx.lineTo(4, 14); ctx.lineTo(0, 6);
      ctx.lineTo(-4, 14); ctx.lineTo(-9, 6); ctx.lineTo(-13, 12);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#eef2ff'; ctx.fillRect(-7, -8, 4, 5); ctx.fillRect(3, -8, 4, 5);
    },
    slagmaw: function (ctx, col) {
      outline(ctx, col);
      ctx.beginPath(); ctx.ellipse(0, 3, 21, 17, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a0d07';
      ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(16, 2); ctx.lineTo(11, 15); ctx.lineTo(-11, 15);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe07a';
      for (var i = 0; i < 6; i++) { ctx.fillRect(-15 + i * 5.6, 2, 3, 5); ctx.fillRect(-12 + i * 5.6, 10, 3, 5); }
      ctx.fillStyle = '#fff2b8'; ctx.fillRect(-12, -9, 7, 5); ctx.fillRect(5, -9, 7, 5);
      ctx.strokeStyle = '#ffb35d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(-23, -21); ctx.moveTo(18, -12); ctx.lineTo(23, -21); ctx.stroke();
    },
    sovereign: function (ctx, col) {
      outline(ctx, col);
      poly(ctx, [[-15, 20], [-11, -6], [0, -15], [11, -6], [15, 20]]);
      ctx.fillStyle = '#1a1030'; ctx.fillRect(-7, -6, 14, 5);
      ctx.fillStyle = '#ffe6a2'; ctx.fillRect(-5, -5, 3, 3); ctx.fillRect(2, -5, 3, 3);
      ctx.fillStyle = '#ffd76d'; ctx.strokeStyle = '#4a3418'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(-10, -24); ctx.lineTo(-4, -17);
      ctx.lineTo(0, -26); ctx.lineTo(4, -17); ctx.lineTo(10, -24); ctx.lineTo(12, -14);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(201,166,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -1, 21, 0, TAU); ctx.stroke();
    }
  };

  function drawMonster(ctx, key, state) {
    var base = MON[key] || MON.rat;
    var body = BODIES[key] || BODIES.rat;
    var col = state === 'hit' ? '#ffffff' : hex(base.col);
    var boss = !!base.boss;
    ctx.save();
    ctx.translate(HALF, HALF + (boss ? 1 : 2));
    if (boss) ctx.scale(1.08, 1.08);
    ctx.globalAlpha = state === 'death' ? 0.5 : 1;
    if (state === 'attack') ctx.scale(1.12, 0.92);
    if (state === 'hit') ctx.scale(0.9, 1.1);
    body(ctx, col);
    if (state === 'attack') {
      ctx.strokeStyle = '#fff1a6'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(13, -16); ctx.lineTo(23, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(-23, 6); ctx.stroke();
    }
    if (state === 'death') {
      ctx.strokeStyle = '#fff0b0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-15, -14); ctx.lineTo(15, 14); ctx.moveTo(15, -14); ctx.lineTo(-15, 14); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- player
  function drawPlayer(ctx, state) {
    var walking = state === 'walk1' || state === 'walk2';
    var bob = state === 'walk1' ? -2 : state === 'walk2' ? 1 : 0;
    ctx.save();
    ctx.translate(HALF, HALF + bob);
    if (state === 'attack') ctx.scale(1.1, 0.93);
    if (state === 'hurt') ctx.scale(0.92, 1.08);
    // Cloak
    ctx.fillStyle = state === 'hurt' ? '#ffffff' : '#2f7f9e';
    ctx.strokeStyle = '#08161f'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    poly(ctx, [[-14, 16], [-11, -4], [0, -12], [11, -4], [14, 16]]);
    // Tunic
    ctx.fillStyle = state === 'hurt' ? '#ffffff' : '#7ce7ff';
    poly(ctx, [[0, -19], [12, -7], [9, 14], [-9, 14], [-12, -7]]);
    ctx.fillStyle = '#0b3141'; ctx.fillRect(-6, -4, 4, 4); ctx.fillRect(2, -4, 4, 4);
    // Lantern always burns on the off hand: it is the torch resource made visible.
    ctx.fillStyle = '#ffd88a'; ctx.strokeStyle = '#4a3a16'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-15, 4, 4.5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,216,138,0.3)';
    ctx.beginPath(); ctx.arc(-15, 4, 8, 0, TAU); ctx.fill();
    if (state === 'attack') {
      ctx.strokeStyle = '#ffdf80'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(23, -17); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,180,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(10, -4, 15, -1.25, 0.25); ctx.stroke();
    }
    if (walking) {
      ctx.fillStyle = '#2d9fc0';
      ctx.fillRect(-10, 12, 6, 6); ctx.fillRect(4, state === 'walk1' ? 10 : 14, 6, 5);
    }
    if (state === 'hurt') {
      ctx.strokeStyle = '#ff746e'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-18, -18); ctx.lineTo(18, 18); ctx.moveTo(18, -18); ctx.lineTo(-18, 18); ctx.stroke();
    }
    ctx.restore();
  }

  // ----------------------------------------------------------- item icons
  // Every identified consumable owns a silhouette: a player reads the shape
  // before the tint, which is what keeps the pack legible at 14px tiles.
  function flask(ctx, shape, col) {
    ctx.strokeStyle = '#0e1a22'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.fillStyle = '#c9d6de';
    ctx.fillRect(13, 3, 6, 5); ctx.strokeRect(13, 3, 6, 5);
    ctx.fillStyle = col;
    ctx.beginPath();
    if (shape === 'round') { ctx.moveTo(13, 8); ctx.lineTo(19, 8); ctx.lineTo(19, 12); ctx.arc(16, 20, 9, -0.7, Math.PI + 0.7, false); ctx.lineTo(13, 12); }
    else if (shape === 'conical') { ctx.moveTo(13, 8); ctx.lineTo(19, 8); ctx.lineTo(27, 27); ctx.lineTo(5, 27); }
    else if (shape === 'teardrop') { ctx.moveTo(16, 7); ctx.quadraticCurveTo(28, 20, 16, 28); ctx.quadraticCurveTo(4, 20, 16, 7); }
    else if (shape === 'squat') { ctx.moveTo(7, 12); ctx.lineTo(25, 12); ctx.lineTo(25, 26); ctx.lineTo(7, 26); }
    else if (shape === 'orb') { ctx.arc(16, 19, 10, 0, TAU); }
    else { ctx.moveTo(12, 8); ctx.lineTo(20, 8); ctx.lineTo(20, 28); ctx.lineTo(12, 28); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillRect(11, 15, 3, 6);
  }
  function scroll(ctx, seal, col) {
    ctx.fillStyle = '#e9eef2'; ctx.strokeStyle = '#3d4a58'; ctx.lineWidth = 2;
    ctx.fillRect(7, 4, 18, 24); ctx.strokeRect(7, 4, 18, 24);
    ctx.fillStyle = '#c3ccd6'; ctx.fillRect(5, 4, 22, 3); ctx.fillRect(5, 25, 22, 3);
    ctx.fillStyle = '#94a2b0';
    ctx.fillRect(10, 10, 12, 1.5); ctx.fillRect(10, 14, 8, 1.5);
    ctx.fillStyle = col; ctx.strokeStyle = '#2e3742'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (seal === 'seal-arc') { ctx.arc(16, 20, 6, Math.PI, TAU); ctx.closePath(); }
    else if (seal === 'seal-flame') { ctx.moveTo(16, 13); ctx.quadraticCurveTo(23, 21, 16, 26); ctx.quadraticCurveTo(9, 21, 16, 13); }
    else if (seal === 'seal-shield') { ctx.moveTo(10, 14); ctx.lineTo(22, 14); ctx.lineTo(22, 21); ctx.lineTo(16, 26); ctx.lineTo(10, 21); ctx.closePath(); }
    else if (seal === 'seal-eye') { ctx.moveTo(8, 20); ctx.quadraticCurveTo(16, 12, 24, 20); ctx.quadraticCurveTo(16, 27, 8, 20); }
    else if (seal === 'seal-grid') { ctx.rect(10, 14, 12, 12); }
    else { for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; var b = a + TAU / 10; ctx.lineTo(16 + Math.cos(a) * 7, 20 + Math.sin(a) * 7); ctx.lineTo(16 + Math.cos(b) * 3, 20 + Math.sin(b) * 3); } ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    if (seal === 'seal-grid') {
      ctx.strokeStyle = '#2e3742'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(16, 14); ctx.lineTo(16, 26); ctx.moveTo(10, 20); ctx.lineTo(22, 20); ctx.stroke();
    }
  }
  function toolIcon(ctx, shape, col) {
    ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    if (shape === 'ration') {
      ctx.fillStyle = col; ctx.fillRect(6, 9, 20, 14); ctx.strokeRect(6, 9, 20, 14);
      ctx.strokeStyle = '#8c6a45'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(16, 9); ctx.lineTo(16, 23); ctx.stroke();
      ctx.fillStyle = '#f0dcbb'; ctx.fillRect(9, 12, 5, 3);
    } else if (shape === 'torch') {
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(13, 14, 6, 15); ctx.strokeRect(13, 14, 6, 15);
      ctx.fillStyle = col; ctx.strokeStyle = '#7a3a12';
      ctx.beginPath(); ctx.moveTo(16, 2); ctx.quadraticCurveTo(25, 11, 16, 17);
      ctx.quadraticCurveTo(7, 11, 16, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff0bd';
      ctx.beginPath(); ctx.moveTo(16, 6); ctx.quadraticCurveTo(21, 11, 16, 15);
      ctx.quadraticCurveTo(11, 11, 16, 6); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = col; ctx.strokeStyle = '#5b3d1e';
      ctx.beginPath(); ctx.moveTo(4, 25); ctx.lineTo(6, 8); ctx.lineTo(11, 16); ctx.lineTo(16, 5);
      ctx.lineTo(21, 16); ctx.lineTo(26, 8); ctx.lineTo(28, 25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3c6'; ctx.fillRect(10, 21, 3, 3); ctx.fillRect(19, 21, 3, 3);
    }
  }
  function unknownIcon(ctx, kind) {
    if (kind === 'potion') flask(ctx, 'round', '#5d6d7c'); else scroll(ctx, 'seal-arc', '#6b7684');
    ctx.fillStyle = '#f5fbff'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#111a22'; ctx.lineWidth = 3;
    ctx.strokeText('?', 16, 24); ctx.fillText('?', 16, 24);
  }

  // -------------------------------------------------------------- FX bakes
  function ringTexture(ctx, w, h, color) {
    // Hand-tessellated so no Graphics.arc sweep runs at 0.01 rad per frame.
    var cx = w / 2, cy = h / 2, r = w / 2 - 3, segs = 44;
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath();
    for (var i = 0; i <= segs; i++) {
      var a = i / segs * TAU, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function buildTextures(scene, progress) {
    var steps = [];
    steps.push(function () {
      canvasTexture(scene, 'cc_particle', 6, 6, function (c) { c.fillStyle = '#ffffff'; c.fillRect(1, 0, 4, 6); c.fillRect(0, 1, 6, 4); });
      canvasTexture(scene, 'cc_spark', 8, 8, function (c) { c.fillStyle = '#ffffff'; c.fillRect(3, 0, 2, 8); c.fillRect(0, 3, 8, 2); });
      canvasTexture(scene, 'cc_dust', 8, 5, function (c) { c.fillStyle = '#ffffff'; c.fillRect(0, 1, 3, 3); c.fillRect(5, 0, 3, 4); });
      canvasTexture(scene, 'cc_mote', 7, 7, function (c) {
        c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(3.5, 3.5, 2.2, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.arc(3.5, 3.5, 3.4, 0, TAU); c.fill();
      });
      canvasTexture(scene, 'cc_ember', 5, 5, function (c) {
        c.fillStyle = '#ffffff'; c.fillRect(1, 1, 3, 3); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(0, 0, 5, 5);
      });
      canvasTexture(scene, 'cc_ring', 96, 96, function (c, w, h) { ringTexture(c, w, h, '#ffffff'); });
      canvasTexture(scene, 'cc_glow', 64, 64, function (c) {
        var g = c.createRadialGradient(32, 32, 2, 32, 32, 31);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      });
    });
    steps.push(function () {
      var pstates = ['idle', 'walk1', 'walk2', 'attack', 'hurt'];
      for (var i = 0; i < pstates.length; i++) {
        (function (st) { canvasTexture(scene, 'cc_player_' + st, S, S, function (c) { drawPlayer(c, st); }); })(pstates[i]);
      }
    });
    var monKeys = Object.keys(MON), states = ['idle', 'attack', 'hit', 'death'];
    for (var mi = 0; mi < monKeys.length; mi++) {
      (function (k) {
        steps.push(function () {
          for (var si = 0; si < states.length; si++) {
            (function (st) { canvasTexture(scene, 'cc_' + k + '_' + st, S, S, function (c) { drawMonster(c, k, st); }); })(states[si]);
          }
        });
      })(monKeys[mi]);
    }
    steps.push(function () {
      var k;
      for (k in POTIONS) (function (key, spec) {
        canvasTexture(scene, 'cc_icon_' + key, 32, 32, function (c) { flask(c, spec.shape, hex(spec.col)); });
      })(k, POTIONS[k]);
      for (k in SCROLLS) (function (key, spec) {
        canvasTexture(scene, 'cc_icon_' + key, 32, 32, function (c) { scroll(c, spec.shape, hex(spec.col)); });
      })(k, SCROLLS[k]);
      for (k in TOOLS) (function (key, spec) {
        canvasTexture(scene, 'cc_icon_' + key, 32, 32, function (c) { toolIcon(c, spec.shape, hex(spec.col)); });
      })(k, TOOLS[k]);
      canvasTexture(scene, 'cc_icon_unknown_potion', 32, 32, function (c) { unknownIcon(c, 'potion'); });
      canvasTexture(scene, 'cc_icon_unknown_scroll', 32, 32, function (c) { unknownIcon(c, 'scroll'); });
      canvasTexture(scene, 'cc_gold', 32, 32, function (c) {
        c.fillStyle = '#ffd76d'; c.strokeStyle = '#5a3828'; c.lineWidth = 3;
        c.beginPath(); c.arc(16, 16, 10, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = '#fff0be'; c.beginPath(); c.arc(13, 13, 3, 0, TAU); c.fill();
        c.fillStyle = '#6d4930'; c.fillRect(13, 11, 6, 10);
      });
      canvasTexture(scene, 'cc_shrine', 32, 32, function (c) {
        c.fillStyle = '#8f7fc0'; c.strokeStyle = '#241d38'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(6, 28); c.lineTo(9, 12); c.lineTo(23, 12); c.lineTo(26, 28); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ffd76d'; c.beginPath(); c.arc(16, 9, 5, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,215,109,0.3)'; c.beginPath(); c.arc(16, 9, 9, 0, TAU); c.fill();
      });
      canvasTexture(scene, 'cc_medal', 28, 28, function (c) {
        c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
        c.beginPath(); c.arc(14, 16, 9, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(9, 1, 4, 8); c.fillRect(15, 1, 4, 8);
      });
      canvasTexture(scene, 'cc_shard', 26, 26, function (c) {
        c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(13, 1); c.lineTo(23, 13); c.lineTo(13, 25); c.lineTo(3, 13); c.closePath();
        c.fill(); c.stroke();
      });
    });
    var i = 0;
    function run() {
      if (i >= steps.length) return true;
      steps[i++]();
      if (progress) progress(i / steps.length);
      return i >= steps.length;
    }
    while (!run()) { /* pre-warm every texture before the loader hides */ }
  }

  CC.art = {
    canvasTexture: canvasTexture,
    buildTextures: buildTextures,
    drawMonster: drawMonster,
    drawPlayer: drawPlayer,
    hex: hex
  };
})(window);
