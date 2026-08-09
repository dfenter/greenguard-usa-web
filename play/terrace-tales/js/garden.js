/* Terrace Tales - garden data + scene rendering */
(function (T) {
  'use strict';

  /* ---- terraces ---- */
  var TERRACES = [
    { name: 'Lower Terrace', sub: 'Stonecress Walk', x0: 20, x1: 370, y: 430, h: 52 },
    { name: 'Middle Terrace', sub: 'Orchard Shelf', x0: 42, x1: 350, y: 332, h: 50 },
    { name: 'Upper Terrace', sub: 'Cloudline Beds', x0: 66, x1: 328, y: 236, h: 48 },
    { name: 'The Overlook', sub: 'Crest of the Rise', x0: 104, x1: 292, y: 152, h: 44 }
  ];

  /* ---- 15 renovation slots: 4 per terrace + 3 on the crest ---- */
  var SLOTS = [
    { tr: 0, k: 'Retaining Edge', v: ['Drystone Wall', 'Woven Willow Bank'] },
    { tr: 0, k: 'Water', v: ['Spill Basin', 'Reed Rill'] },
    { tr: 0, k: 'Planting', v: ['Herb Beds', 'Wildflower Drift'] },
    { tr: 0, k: 'Rest', v: ['Stone Bench', 'Timber Deck'] },

    { tr: 1, k: 'Orchard', v: ['Pear Espalier', 'Plum Grove'] },
    { tr: 1, k: 'Path', v: ['Gravel Walk', 'Steppingstones'] },
    { tr: 1, k: 'Shelter', v: ['Potting Shed', 'Open Arbour'] },
    { tr: 1, k: 'Light', v: ['Lantern Posts', 'Fire Bowl'] },

    { tr: 2, k: 'Frames', v: ['Glass Cloches', 'Reed Screens'] },
    { tr: 2, k: 'Beds', v: ['Alpine Rockery', 'Moss Garden'] },
    { tr: 2, k: 'Water', v: ['Cistern Pool', 'Mist Channel'] },
    { tr: 2, k: 'Crown', v: ['Bell Post', 'Sky Trellis'] },

    { tr: 3, k: 'Stair', v: ['Switchback Stair', 'Straight Flight'] },
    { tr: 3, k: 'Gate', v: ['Iron Gate', 'Hedge Arch'] },
    { tr: 3, k: 'Finale', v: ['Beacon Lantern', 'Star Pond'] }
  ];

  /* anchor points */
  (function () {
    var counts = [0, 0, 0, 0];
    for (var i = 0; i < SLOTS.length; i++) {
      var s = SLOTS[i], t = TERRACES[s.tr];
      var n = s.tr === 3 ? 3 : 4, k = counts[s.tr]++;
      var f = (k + 0.5) / n;
      s.x = t.x0 + (t.x1 - t.x0) * f;
      s.y = t.y;
    }
  })();

  /* ---- gem palette ---- */
  var GEMS = [
    { c: '#e6b45c', n: 'Seed' },
    { c: '#6fc25c', n: 'Leaf' },
    { c: '#57a9e0', n: 'Water' },
    { c: '#9fabb5', n: 'Stone' },
    { c: '#dd6f9e', n: 'Bloom' },
    { c: '#ef8b42', n: 'Sun' }
  ];

  /* ---- 15 seeded levels: each completion funds exactly one slot ---- */
  function lv(seed, moves, n, goals) { return { seed: seed, moves: moves, n: n, goals: goals }; }
  var LEVELS = [
    lv(10731, 26, 5, [[1, 14]]),
    lv(20913, 25, 5, [[2, 16]]),
    lv(31577, 25, 5, [[1, 13], [0, 12]]),
    lv(44201, 24, 5, [[4, 17]]),
    lv(51863, 24, 5, [[3, 13], [2, 13]]),
    lv(60449, 24, 6, [[0, 15]]),
    lv(71225, 23, 6, [[5, 12], [1, 12]]),
    lv(80987, 23, 6, [[4, 17]]),
    lv(91653, 22, 6, [[2, 13], [3, 12]]),
    lv(10241, 22, 6, [[1, 13], [5, 12]]),
    lv(11876, 21, 6, [[0, 13], [4, 13]]),
    lv(12455, 21, 6, [[3, 17]]),
    lv(13699, 20, 6, [[2, 13], [1, 12]]),
    lv(14822, 20, 6, [[5, 13], [0, 13]]),
    lv(15987, 20, 6, [[4, 11], [2, 11], [1, 10]])
  ];

  /* ---- groundskeeper narration (one line each) ---- */
  var BEFORE = [
    'Marn: "The lower wall went out in the spring rains. Start there."',
    'Marn: "Water wants somewhere to go. Give it a road."',
    'Marn: "Bare soil is just a garden waiting to be asked."',
    'Marn: "A place to sit is not idleness. It is inspection."',
    'Marn: "The middle shelf held fruit once. It remembers."',
    'Marn: "People follow the path you build, not the one you meant."',
    'Marn: "Every garden needs a roof for the gardener."',
    'Marn: "The hill gets dark early. Bring something warm."',
    'Marn: "Up here the wind decides. We only negotiate."',
    'Marn: "Thin soil, stubborn plants. My kind of company."',
    'Marn: "Catch the rain up top and the whole rise drinks."',
    'Marn: "Give the upper terrace something to be seen by."',
    'Marn: "Nobody climbs a hill without stairs. Not twice."',
    'Marn: "A gate says the garden begins here. Say it well."',
    'Marn: "One last thing, and the rise is ours again."'
  ];
  var AFTER = [
    'Marn: "It holds. First time in nine years it holds."',
    'Marn: "Listen. That is the sound of the hill relaxing."',
    'Marn: "Green already. Cheeky."',
    'Marn: "Sit. Look. That is half the work done."',
    'Marn: "Fruit by autumn, or I will eat my hat."',
    'Marn: "Feet will wear that smooth in a season."',
    'Marn: "Shelter. Now the rain can say what it likes."',
    'Marn: "Warm light on cold stone. Good trade."',
    'Marn: "The wind blinked first."',
    'Marn: "Small plants, long memories."',
    'Marn: "The cistern is full and so, nearly, am I."',
    'Marn: "You can see that from the valley road now."',
    'Marn: "The climb is a pleasure instead of a chore."',
    'Marn: "Shut it behind you. Gardens like a threshold."',
    'Marn: "Hollowbrook Rise, restored. Thank you, gardener."'
  ];

  /* ---- drawing helpers ---- */
  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function tree(ctx, x, y, h, cc, tc) {
    px(ctx, x - 2, y - h, 4, h, tc || '#6b533c');
    ctx.fillStyle = cc;
    ctx.beginPath(); ctx.arc(x, y - h - 6, 11, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 8, y - h + 2, 8, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 8, y - h + 2, 8, 0, 6.284); ctx.fill();
  }
  function bush(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y - r * 0.6, r, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.8, y - r * 0.3, r * 0.7, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 0.3, r * 0.7, 0, 6.284); ctx.fill();
  }

  /* each slot vignette draws sitting ON the terrace top (y = ground line) */
  var DRAW = [
    /* 0 retaining edge */function (ctx, x, y, v, t) {
      if (v === 0) {
        for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) {
          px(ctx, x - 30 + c * 15 + (r % 2) * 4, y - 6 - r * 7, 13, 6, r % 2 ? '#8d8578' : '#9d9486');
        }
      } else {
        px(ctx, x - 28, y - 4, 56, 4, '#6b5a3e');
        ctx.strokeStyle = '#94794f'; ctx.lineWidth = 2;
        for (var i = 0; i < 7; i++) {
          ctx.beginPath(); ctx.moveTo(x - 26 + i * 9, y - 4);
          ctx.quadraticCurveTo(x - 22 + i * 9, y - 14, x - 26 + i * 9, y - 22); ctx.stroke();
        }
      }
    },
    /* 1 water lower */function (ctx, x, y, v, t) {
      var wob = Math.sin(t * 2 + x) * 1.5;
      if (v === 0) {
        px(ctx, x - 20, y - 12, 40, 12, '#7a7268');
        ctx.fillStyle = '#4a8fc0'; ctx.fillRect(x - 16, y - 10 + wob * 0.2, 32, 7);
        px(ctx, x - 3, y - 24, 6, 12, '#8d8578');
      } else {
        ctx.fillStyle = '#4a8fc0';
        ctx.fillRect(x - 30, y - 7, 60, 5);
        ctx.fillStyle = '#7fc4e8'; ctx.fillRect(x - 30 + ((t * 26) % 54), y - 7, 8, 5);
        for (var i = 0; i < 4; i++) px(ctx, x - 24 + i * 15, y - 18, 2, 11, '#78a05a');
      }
    },
    /* 2 planting lower */function (ctx, x, y, v, t) {
      if (v === 0) {
        px(ctx, x - 26, y - 6, 52, 6, '#5b4630');
        for (var i = 0; i < 5; i++) bush(ctx, x - 20 + i * 10, y - 6, 5, i % 2 ? '#6fa74e' : '#8cbf5c');
      } else {
        for (var j = 0; j < 9; j++) {
          var fx = x - 26 + j * 6.5, fy = y - 8 - (j % 3) * 5 + Math.sin(t * 1.6 + j) * 1.2;
          px(ctx, fx, fy, 1.6, 9, '#6fa74e');
          ctx.fillStyle = ['#e6d05c', '#dd6f9e', '#c9a2e0'][j % 3];
          ctx.beginPath(); ctx.arc(fx + 0.8, fy, 3, 0, 6.284); ctx.fill();
        }
      }
    },
    /* 3 rest lower */function (ctx, x, y, v, t) {
      if (v === 0) {
        px(ctx, x - 20, y - 12, 40, 5, '#a8a096');
        px(ctx, x - 16, y - 7, 5, 7, '#8d8578'); px(ctx, x + 11, y - 7, 5, 7, '#8d8578');
      } else {
        px(ctx, x - 26, y - 6, 52, 6, '#8a6a45');
        for (var i = 0; i < 6; i++) px(ctx, x - 25 + i * 9, y - 6, 1, 6, '#6d5233');
        px(ctx, x + 12, y - 20, 4, 14, '#6d5233');
      }
    },
    /* 4 orchard */function (ctx, x, y, v, t) {
      if (v === 0) {
        px(ctx, x - 26, y - 34, 52, 2, '#7a6448'); px(ctx, x - 26, y - 20, 52, 2, '#7a6448');
        for (var i = 0; i < 3; i++) {
          px(ctx, x - 20 + i * 20, y - 36, 3, 36, '#6b533c');
          bush(ctx, x - 19 + i * 20, y - 30, 7, '#69ab52');
        }
      } else {
        tree(ctx, x - 14, y, 20, '#5f9b6e'); tree(ctx, x + 14, y, 26, '#6fae74');
        ctx.fillStyle = '#8e5fb0';
        for (var j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc(x + 8 + (j % 2) * 12, y - 30 - (j >> 1) * 8, 2.4, 0, 6.284); ctx.fill(); }
      }
    },
    /* 5 path */function (ctx, x, y, v, t) {
      if (v === 0) {
        ctx.fillStyle = '#c3b79c'; ctx.fillRect(x - 30, y - 5, 60, 5);
        ctx.fillStyle = '#a4977c';
        for (var i = 0; i < 12; i++) ctx.fillRect(x - 28 + i * 5, y - 4 + (i % 2), 2, 2);
      } else {
        for (var j = 0; j < 5; j++) {
          ctx.fillStyle = j % 2 ? '#b2a992' : '#9d9486';
          ctx.beginPath(); ctx.ellipse(x - 24 + j * 12, y - 3, 6, 3, 0, 0, 6.284); ctx.fill();
        }
      }
    },
    /* 6 shelter */function (ctx, x, y, v, t) {
      if (v === 0) {
        px(ctx, x - 20, y - 26, 40, 26, '#8a6a45');
        ctx.fillStyle = '#5f4a30';
        ctx.beginPath(); ctx.moveTo(x - 25, y - 26); ctx.lineTo(x, y - 40); ctx.lineTo(x + 25, y - 26); ctx.closePath(); ctx.fill();
        px(ctx, x - 6, y - 16, 12, 16, '#5f4a30');
        px(ctx, x + 8, y - 22, 8, 8, '#9fd0e8');
      } else {
        px(ctx, x - 22, y - 32, 4, 32, '#8a6a45'); px(ctx, x + 18, y - 32, 4, 32, '#8a6a45');
        px(ctx, x - 26, y - 36, 52, 4, '#8a6a45');
        for (var i = 0; i < 5; i++) px(ctx, x - 22 + i * 11, y - 40, 3, 5, '#7a5c3c');
        bush(ctx, x - 20, y - 36, 7, '#69ab52'); bush(ctx, x + 20, y - 30, 6, '#69ab52');
      }
    },
    /* 7 light */function (ctx, x, y, v, t, night) {
      if (v === 0) {
        for (var i = 0; i < 3; i++) {
          var lx = x - 22 + i * 22;
          px(ctx, lx - 1.5, y - 30, 3, 30, '#4e4438');
          ctx.fillStyle = night ? '#ffe08a' : '#d9cba6';
          ctx.fillRect(lx - 4, y - 38, 8, 9);
        }
      } else {
        px(ctx, x - 14, y - 8, 28, 8, '#7a7268');
        ctx.fillStyle = night ? '#ff9d3d' : '#8a5a3a';
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 8);
        ctx.quadraticCurveTo(x, y - 26 - Math.sin(t * 6) * 4, x + 8, y - 8);
        ctx.closePath(); ctx.fill();
      }
    },
    /* 8 frames */function (ctx, x, y, v, t) {
      if (v === 0) {
        for (var i = 0; i < 3; i++) {
          ctx.fillStyle = 'rgba(180,225,240,0.75)';
          ctx.beginPath(); ctx.arc(x - 20 + i * 20, y, 9, Math.PI, 0); ctx.fill();
          ctx.strokeStyle = '#cfe8f2'; ctx.lineWidth = 1; ctx.stroke();
        }
      } else {
        for (var j = 0; j < 4; j++) {
          px(ctx, x - 24 + j * 16, y - 24, 12, 24, '#b6a271');
          px(ctx, x - 24 + j * 16, y - 24, 12, 2, '#8e7c52');
        }
      }
    },
    /* 9 beds upper */function (ctx, x, y, v, t) {
      if (v === 0) {
        for (var i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? '#9d9486' : '#87806f';
          ctx.beginPath(); ctx.arc(x - 24 + i * 10, y - 4, 5 + (i % 3), 0, 6.284); ctx.fill();
        }
        bush(ctx, x - 10, y - 8, 4, '#7fb07a'); bush(ctx, x + 16, y - 8, 4, '#7fb07a');
      } else {
        for (var j = 0; j < 5; j++) {
          ctx.fillStyle = j % 2 ? '#6f9b57' : '#88b56a';
          ctx.beginPath(); ctx.ellipse(x - 24 + j * 12, y - 4, 8, 5, 0, 0, 6.284); ctx.fill();
        }
      }
    },
    /* 10 water upper */function (ctx, x, y, v, t) {
      if (v === 0) {
        px(ctx, x - 22, y - 16, 44, 16, '#6f6a60');
        ctx.fillStyle = '#4f97c8'; ctx.fillRect(x - 18, y - 13, 36, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x - 18 + ((t * 18) % 30), y - 13, 6, 6);
      } else {
        ctx.strokeStyle = '#9fd6ea'; ctx.lineWidth = 2;
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          for (var k = 0; k <= 10; k++) {
            var xx = x - 26 + k * 5.2, yy = y - 6 - i * 7 + Math.sin(t * 2 + k * 0.7 + i) * 2;
            if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
      }
    },
    /* 11 crown */function (ctx, x, y, v, t, night) {
      if (v === 0) {
        px(ctx, x - 3, y - 40, 6, 40, '#6d5a42');
        px(ctx, x - 14, y - 44, 28, 5, '#6d5a42');
        ctx.fillStyle = night ? '#e8d08a' : '#c9b478';
        ctx.beginPath(); ctx.moveTo(x - 7, y - 39); ctx.lineTo(x + 7, y - 39); ctx.lineTo(x + 4, y - 26); ctx.lineTo(x - 4, y - 26); ctx.closePath(); ctx.fill();
      } else {
        ctx.strokeStyle = '#8d8578'; ctx.lineWidth = 2;
        for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 21 + i * 14, y); ctx.lineTo(x - 21 + i * 14, y - 34); ctx.stroke(); }
        for (var j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(x - 24, y - 10 - j * 12); ctx.lineTo(x + 24, y - 10 - j * 12); ctx.stroke(); }
        ctx.fillStyle = '#7fb07a';
        for (var k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x - 20 + k * 10, y - 30 + (k % 2) * 8, 4, 0, 6.284); ctx.fill(); }
      }
    },
    /* 12 stair */function (ctx, x, y, v, t) {
      if (v === 0) {
        for (var i = 0; i < 5; i++) px(ctx, x - 24 + (i < 3 ? i * 8 : (4 - i) * 8 + 24), y - 5 - i * 6, 22, 6, i % 2 ? '#9d9486' : '#87806f');
      } else {
        for (var j = 0; j < 6; j++) px(ctx, x - 16, y - 4 - j * 6, 32, 6, j % 2 ? '#9d9486' : '#87806f');
      }
    },
    /* 13 gate */function (ctx, x, y, v, t) {
      if (v === 0) {
        ctx.strokeStyle = '#4e5a62'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x - 18, y - 30); ctx.moveTo(x + 18, y); ctx.lineTo(x + 18, y - 30); ctx.stroke();
        ctx.lineWidth = 2;
        for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - 14 + i * 7, y); ctx.lineTo(x - 14 + i * 7, y - 26); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y - 30, 18, Math.PI, 0); ctx.stroke();
      } else {
        ctx.fillStyle = '#548a4c';
        ctx.beginPath();
        ctx.moveTo(x - 26, y); ctx.lineTo(x - 26, y - 22);
        ctx.quadraticCurveTo(x, y - 56, x + 26, y - 22); ctx.lineTo(x + 26, y);
        ctx.lineTo(x + 14, y); ctx.lineTo(x + 14, y - 24);
        ctx.quadraticCurveTo(x, y - 44, x - 14, y - 24); ctx.lineTo(x - 14, y); ctx.closePath(); ctx.fill();
      }
    },
    /* 14 finale */function (ctx, x, y, v, t, night) {
      if (v === 0) {
        px(ctx, x - 4, y - 34, 8, 34, '#5f4a30');
        var glow = night ? 1 : 0.45;
        ctx.globalAlpha = glow * (0.6 + Math.sin(t * 3) * 0.15);
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath(); ctx.arc(x, y - 44, 20, 0, 6.284); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = night ? '#ffe9b0' : '#d6c48c';
        ctx.beginPath(); ctx.moveTo(x - 10, y - 34); ctx.lineTo(x + 10, y - 34); ctx.lineTo(x + 6, y - 52); ctx.lineTo(x - 6, y - 52); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = '#2f5f80';
        ctx.beginPath(); ctx.ellipse(x, y - 6, 30, 11, 0, 0, 6.284); ctx.fill();
        for (var i = 0; i < 6; i++) {
          var a = t * 0.6 + i * 1.05;
          ctx.globalAlpha = night ? 0.95 : 0.5;
          ctx.fillStyle = '#ffeeb0';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 20, y - 6 + Math.sin(a) * 6, 2.2, 0, 6.284); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  ];

  /* ---- scene ---- */
  function drawScene(ctx, state, time, w, h) {
    var built = state.lvl; /* number of slots funded */
    var night = state.night; /* 0..1, 1 = deep night */
    var sky1 = T.mixHex('#8fc6e8', '#141d33', night);
    var sky2 = T.mixHex('#dfeef6', '#2b3350', night);
    var g = ctx.createLinearGradient(0, 84, 0, 520);
    g.addColorStop(0, sky1); g.addColorStop(1, sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 84, w, 440);

    /* sun / moon */
    var ang = state.dayT * Math.PI * 2;
    var sx = w / 2 + Math.cos(ang - Math.PI / 2) * 150, sy = 300 + Math.sin(ang - Math.PI / 2) * 150;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = night > 0.5 ? '#e9eef7' : '#ffe27a';
    ctx.beginPath(); ctx.arc(sx, sy, night > 0.5 ? 11 : 15, 0, 6.284); ctx.fill();
    ctx.globalAlpha = 1;
    if (night > 0.55) {
      for (var st = 0; st < 22; st++) {
        var rx = ((st * 97) % 380) + 5, ry = 92 + ((st * 53) % 130);
        ctx.globalAlpha = (night - 0.55) * 2 * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.2 + st)));
        ctx.fillStyle = '#fff'; ctx.fillRect(rx, ry, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    /* distant hills */
    ctx.fillStyle = T.mixHex('#7fa9b8', '#1a2438', night);
    ctx.beginPath(); ctx.moveTo(0, 500);
    for (var i = 0; i <= 10; i++) ctx.lineTo(i * 39, 470 - Math.sin(i * 1.3) * 26 - (i % 3) * 8);
    ctx.lineTo(w, 520); ctx.lineTo(0, 520); ctx.closePath(); ctx.fill();

    /* hill body */
    ctx.fillStyle = T.mixHex('#6d7a52', '#232c22', night);
    ctx.beginPath();
    ctx.moveTo(-10, 620);
    ctx.lineTo(-10, 500); ctx.quadraticCurveTo(90, 300, 197, 140);
    ctx.quadraticCurveTo(300, 300, 400, 500); ctx.lineTo(400, 620);
    ctx.closePath(); ctx.fill();

    /* terraces back to front */
    for (var ti = 3; ti >= 0; ti--) {
      var tr = TERRACES[ti];
      var slotIdx = [], si;
      for (si = 0; si < SLOTS.length; si++) if (SLOTS[si].tr === ti) slotIdx.push(si);
      var doneCount = 0;
      for (si = 0; si < slotIdx.length; si++) if (slotIdx[si] < built) doneCount++;
      var lively = doneCount / slotIdx.length;

      /* terrace face (wall) */
      var faceTop = tr.y, faceH = tr.h;
      ctx.fillStyle = T.mixHex(T.mixHex('#6a6355', '#8b8471', lively), '#1e232a', night);
      ctx.fillRect(tr.x0 - 6, faceTop, (tr.x1 - tr.x0) + 12, faceH);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (var b = 0; b < 4; b++) ctx.fillRect(tr.x0 - 6, faceTop + 6 + b * 11, (tr.x1 - tr.x0) + 12, 1.5);
      /* terrace top surface */
      ctx.fillStyle = T.mixHex(T.mixHex('#5b5a42', '#6e8a4e', lively), '#1f2a26', night);
      ctx.beginPath();
      ctx.moveTo(tr.x0 - 6, faceTop); ctx.lineTo(tr.x1 + 6, faceTop);
      ctx.lineTo(tr.x1 + 16, faceTop - 12); ctx.lineTo(tr.x0 - 16, faceTop - 12); ctx.closePath(); ctx.fill();

      /* slot contents */
      for (si = 0; si < slotIdx.length; si++) {
        var id = slotIdx[si], s = SLOTS[id];
        if (id < built) {
          var v = state.choices[id] === 1 ? 1 : 0;
          ctx.save();
          var age = state.justBuilt === id ? T.clamp((time - state.justBuiltAt) / 0.5, 0, 1) : 1;
          if (age < 1) { ctx.globalAlpha = age; ctx.translate(s.x, s.y); ctx.scale(0.6 + 0.4 * age, 0.6 + 0.4 * age); ctx.translate(-s.x, -s.y); }
          DRAW[id](ctx, s.x, s.y, v, time, night > 0.5);
          ctx.restore();
        } else {
          /* unbuilt: faint marker */
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          T.rr(ctx, s.x - 16, s.y - 26, 32, 26, 4); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    /* foreground */
    ctx.fillStyle = T.mixHex('#3f4a33', '#141a18', night);
    ctx.fillRect(0, 520, w, 90);

    /* night tint over restored scene */
    if (night > 0.02) {
      ctx.globalAlpha = night * 0.38;
      ctx.fillStyle = '#101a30';
      ctx.fillRect(0, 84, w, 526);
      ctx.globalAlpha = 1;
    }
  }

  T.G = {
    TERRACES: TERRACES, SLOTS: SLOTS, LEVELS: LEVELS, GEMS: GEMS,
    BEFORE: BEFORE, AFTER: AFTER, DRAW: DRAW, drawScene: drawScene
  };
})(TT);
