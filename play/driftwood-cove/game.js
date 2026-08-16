/* Driftwood Cove - fleet F17 AAA rebuild.
 * Phaser 3 paints the view. GGKit owns lifecycle, input identity, guarded
 * saves, audio buses, loading, settings, orientation, PWA and juice.
 */
(function (root) {
  'use strict';

  var PhaserRef = root.Phaser;
  var W = 390, H = 844;
  var COLS = 6, ROWS = 7, CELLS = COLS * ROWS;
  var CELL = 56, GAP = 3, PITCH = CELL + GAP;
  var BOARD_X = 20, BOARD_Y = 306;
  var BOARD_W = COLS * PITCH - GAP, BOARD_H = ROWS * PITCH - GAP;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  var STEP = 1 / 60, TAU = Math.PI * 2;
  var MAX_TIER = 3;
  var RECOVERY_MERGES = 4;      /* prototype constant: producers recover after 4 merges */
  var PRODUCER_MAX = 5;         /* prototype constant: five draws per producer */
  var PRODUCER_REGEN = 4.5;     /* seconds per charge: generous, never a paywall */
  var STORM_SECONDS = 75;
  var TEXT_RES = Math.min(2, root.devicePixelRatio || 1);

  var C = {
    ink: '#071923', ink2: '#0C2530', sea: '#123844', seaLit: '#1B5660',
    cell: '#17414E', cellEdge: '#2E6A72', mist: '#557975',
    paper: '#F5EFD9', muted: '#9EBDB6', gold: '#EFBD67', coral: '#E98568',
    aqua: '#75D1C4', ok: '#8FD98A', bad: '#E8A05C'
  };

  /* ------------------------------------------------------------ content */
  function chain(id, shape, label, face, edge, tiers) {
    return { id: id, shape: shape, label: label, face: face, edge: edge, tiers: tiers };
  }
  var CHAINS = [
    chain('wood', 'wood', 'Driftwood', '#B77C52', '#E8AE6E', ['Driftwood', 'Plank', 'Hull frame', 'Cove boat']),
    chain('shell', 'shell', 'Shell', '#D99C83', '#F4D0A7', ['Shell', 'Shell cup', 'Shell lamp', 'Beacon']),
    chain('kelp', 'kelp', 'Kelp', '#5FA98B', '#A9E0C0', ['Kelp', 'Twine', 'Rope', 'Net']),
    chain('glass', 'glass', 'Sea glass', '#6FC7DE', '#CFF3FB', ['Sea glass', 'Lens blank', 'Ground lens', 'Light room']),
    chain('brass', 'brass', 'Brass', '#C79B3F', '#F3D488', ['Brass nail', 'Gear', 'Clockwork', 'Rotator']),
    chain('wick', 'wick', 'Wick', '#D96F5B', '#FFC38A', ['Tallow', 'Wick', 'Candle', 'Flame pot']),
    chain('pearl', 'pearl', 'Pearl', '#CBB8DE', '#F6EEFF', ['Grit', 'Pearl', 'Pearl strand', 'Tide crown']),
    chain('coral', 'coral', 'Coral', '#E05A7A', '#FFB2C2', ['Coral chip', 'Coral branch', 'Coral bloom', 'Reef arch']),
    chain('crystal', 'crystal', 'Salt', '#7C8BE0', '#C6D0FF', ['Salt', 'Salt crystal', 'Geode', 'Prism']),
    chain('canvas', 'canvas', 'Canvas', '#DCE6E8', '#FFFFFF', ['Canvas scrap', 'Patch', 'Sail', 'Rigged sail']),
    chain('iron', 'iron', 'Iron', '#7C8C99', '#C3D3DC', ['Iron nail', 'Chain link', 'Anchor chain', 'Anchor']),
    chain('chart', 'chart', 'Paper', '#B9975B', '#F0DCA8', ['Log page', 'Note bundle', 'Chart', 'Keeper atlas'])
  ];

  var AREAS = [
    { name: 'Shell Beach', chains: [0, 1, 2], sky: '#7FC3C0', deep: '#2C7E86', land: '#E9CE9B',
      accent: '#EFBD67', music: 'cove', blurb: 'The tide leaves the first pieces.' },
    { name: 'Lighthouse Point', chains: [3, 4, 5], sky: '#9CB6D8', deep: '#3E6787', land: '#6A7E8C',
      accent: '#F7C948', music: 'cove', blurb: 'The lamp room waits for its light.' },
    { name: 'Tide Caves', chains: [6, 7, 8], sky: '#1B4655', deep: '#0E2A36', land: '#2A5A62',
      accent: '#9A7CF3', music: 'deep', blurb: 'Salt, pearl and a colder echo.' },
    { name: 'Sail Reach', chains: [9, 10, 11], sky: '#A8CBD8', deep: '#2E7A8C', land: '#8FA7A6',
      accent: '#38A8DE', music: 'deep', blurb: 'Canvas and iron for the crossing.' },
    { name: 'The Wreck', chains: [0, 3, 6, 9], sky: '#3B4A6B', deep: '#20304C', land: '#5A4A52',
      accent: '#F25C68', music: 'deep', blurb: 'The last hull, and the last page.' }
  ];
  var NATURAL = [0, 1, 2, 6, 7, 8];
  var CRAFTED = [3, 4, 5, 9, 10, 11];

  function order(area, who, title, want, frag) {
    return { area: area, who: who, title: title, want: want, frag: frag };
  }
  var ORDERS = [
    order(0, 'Maren', 'Boards for the landing', [[0, 1, 1]], 40),
    order(0, 'Maren', 'A cup that holds tea', [[1, 1, 1]], 45),
    order(0, 'Odd', 'Twine for the crab traps', [[2, 1, 1]], 45),
    order(0, 'Odd', 'Two planks for the walk', [[0, 1, 2]], 65),
    order(0, 'Signy', 'A lamp for the jetty', [[1, 2, 1]], 85),
    order(0, 'Signy', 'Rope for the mooring', [[2, 2, 1]], 85),
    order(0, 'Maren', 'Ribs for a small hull', [[0, 2, 1]], 95),
    order(0, 'Maren', 'The cove boat, finished', [[0, 3, 1]], 150),

    order(1, 'Brann', 'A blank for the lens', [[3, 1, 1]], 70),
    order(1, 'Brann', 'One good gear', [[4, 1, 1]], 70),
    order(1, 'Halla', 'A wick that will hold', [[5, 1, 1]], 70),
    order(1, 'Halla', 'Ground glass and a gear', [[3, 2, 1], [4, 1, 1]], 110),
    order(1, 'Brann', 'Candles for the stair', [[5, 2, 1]], 100),
    order(1, 'Signy', 'Clockwork for the turn', [[4, 2, 1]], 105),
    order(1, 'Halla', 'The light room, glazed', [[3, 3, 1]], 160),
    order(1, 'Brann', 'Rotator and flame pot', [[4, 3, 1], [5, 3, 1]], 220),

    order(2, 'Ivar', 'A pearl from the grit', [[6, 1, 1]], 90),
    order(2, 'Ivar', 'A branch of coral', [[7, 1, 1]], 90),
    order(2, 'Runa', 'One salt crystal', [[8, 1, 1]], 90),
    order(2, 'Runa', 'Strand and two branches', [[6, 2, 1], [7, 1, 2]], 140),
    order(2, 'Ivar', 'A geode for the shelf', [[8, 2, 1]], 120),
    order(2, 'Signy', 'Coral bloom, roped', [[7, 2, 1], [2, 2, 1]], 150),
    order(2, 'Runa', 'A prism for the beam', [[8, 3, 1]], 190),
    order(2, 'Ivar', 'Crown and arch together', [[6, 3, 1], [7, 3, 1]], 250),

    order(3, 'Torvald', 'Patch the torn canvas', [[9, 1, 1]], 110),
    order(3, 'Torvald', 'One heavy chain link', [[10, 1, 1]], 110),
    order(3, 'Alva', 'A page from the log', [[11, 1, 1]], 110),
    order(3, 'Alva', 'A sail and a rope', [[9, 2, 1], [2, 2, 1]], 165),
    order(3, 'Torvald', 'Chain with clockwork', [[10, 2, 1], [4, 2, 1]], 175),
    order(3, 'Alva', 'A chart of the reach', [[11, 2, 1]], 150),
    order(3, 'Torvald', 'Rigged sail, ready', [[9, 3, 1]], 210),
    order(3, 'Alva', 'Anchor and atlas', [[10, 3, 1], [11, 3, 1]], 280),

    order(4, 'Maren', 'A second boat for the search', [[0, 3, 1]], 240),
    order(4, 'Halla', 'Light room and flame pot', [[3, 3, 1], [5, 3, 1]], 300),
    order(4, 'Signy', 'The beacon, lit', [[1, 3, 1]], 260),
    order(4, 'Runa', 'Crown and prism', [[6, 3, 1], [8, 3, 1]], 310),
    order(4, 'Torvald', 'Sail and anchor', [[9, 3, 1], [10, 3, 1]], 320),
    order(4, 'Alva', 'Atlas and rotator', [[11, 3, 1], [4, 3, 1]], 330),
    order(4, 'Ivar', 'Reef arch on a net', [[7, 3, 1], [2, 3, 1]], 330),
    order(4, 'Keeper', 'Beacon, atlas, boat', [[1, 3, 1], [11, 3, 1], [0, 3, 1]], 500)
  ];
  var AREA_ORDERS = [8, 8, 8, 8, 8];

  var NOTES = [
    { ch: 1, title: 'The empty hook', text: '08:10. I moved the blue lantern from the pier. The fog leaned away from the empty hook.' },
    { ch: 1, title: 'A matched hand', text: 'Every tide returns with one extra shell. Keep the pairs; the cove likes a matched hand.' },
    { ch: 1, title: 'Rain remembered', text: 'Juniper grows where the old boards remember rain. I left a pinch beside the bell.' },
    { ch: 1, title: 'The waiting bell', text: 'The bell is not broken. It is waiting for someone to put the cove back in order.' },
    { ch: 2, title: 'The dry wreck', text: 'The wreck crate came in dry, though the sea was loud. Inside: a chair leg and a map with no shore.' },
    { ch: 2, title: 'Toward a window', text: 'Two planks make a table. Two tables make a room. I keep building toward a window.' },
    { ch: 2, title: 'Dusk clicks', text: 'The tide pool clicks at dusk. Five draws, then it rests until the work elsewhere is done.' },
    { ch: 2, title: 'Bootprints north', text: 'At the north bluff I found my own bootprints, leading out and never back.' },
    { ch: 3, title: 'Warm glass', text: 'The lamp glass was warm. Someone has been tending it after I stopped climbing.' },
    { ch: 3, title: 'Tomorrow ink', text: 'The keeper log ends in my handwriting, but the last page is dated tomorrow.' },
    { ch: 3, title: 'The storm behind', text: 'I was never lost at sea. I was hiding the cove from the storm that follows my name.' },
    { ch: 3, title: 'An answer, not an alarm', text: 'Light the three places, read the scraps, and tell the town: the cove is still here.' },
    { ch: 4, title: 'Salt arithmetic', text: 'The caves keep a ledger in salt. Every crystal counts a day I did not come back.' },
    { ch: 4, title: 'Canvas measure', text: 'A sail is only a promise about wind. I cut mine for a crossing I never made.' },
    { ch: 4, title: 'The reach at night', text: 'From Sail Reach the beacon looks like a second moon, lower and far more patient.' },
    { ch: 4, title: 'Iron and quiet', text: 'The anchor chain came up clean. Nothing has dragged in this water for a long while.' },
    { ch: 5, title: 'Under the hull', text: 'The wreck is not a grave. It is a workshop that the sea rearranged.' },
    { ch: 5, title: 'A borrowed hand', text: 'Someone finished the joints I left open. The cuts match mine, but steadier.' },
    { ch: 5, title: 'The last page', text: 'The atlas ends at this cove, drawn by a hand that knew it would be read.' },
    { ch: 5, title: 'The cove is still here', text: 'Light it all at once. Let the town read the water and come home for the answer.' }
  ];

  /* --------------------------------------------------------------- utils */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function finiteInt(v, fallback, lo, hi) {
    var n = typeof v === 'number' && isFinite(v) ? Math.round(v) : fallback;
    return clamp(n, lo, hi);
  }
  function setTextIfChanged(obj, value) {
    var s = String(value);
    if (obj && obj.text !== s) obj.setText(s);
    return obj;
  }
  function setColorIfChanged(obj, value) {
    if (obj && obj.__color !== value) { obj.__color = value; obj.setColor(value); }
    return obj;
  }
  function setTextureIfChanged(obj, key) {
    if (obj && obj.__tex !== key) { obj.__tex = key; obj.setTexture(key); }
    return obj;
  }
  function setVisibleIfChanged(obj, on) {
    if (obj && obj.visible !== on) obj.setVisible(on);
    return obj;
  }
  function rngFrom(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function cellX(i) { return BOARD_X + (i % COLS) * PITCH + CELL / 2; }
  function cellY(i) { return BOARD_Y + Math.floor(i / COLS) * PITCH + CELL / 2; }
  function cellAt(px, py) {
    var cx = Math.floor((px - BOARD_X) / PITCH);
    var cy = Math.floor((py - BOARD_Y) / PITCH);
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return -1;
    return cy * COLS + cx;
  }
  function chainOf(index) { return CHAINS[index] || CHAINS[0]; }
  function itemName(k, t) {
    var c = chainOf(k);
    return c.tiers[clamp(t, 0, MAX_TIER)] || c.label;
  }
  function itemKey(k, t) { return 'dc_item_' + clamp(k, 0, CHAINS.length - 1) + '_' + clamp(t, 0, MAX_TIER); }

  /* ------------------------------------------------------------ bakery */
  /* Every pixel is baked once into a canvas texture. Nothing here replays a
   * Graphics command list during gameplay. */
  function texture(scene, key, w, h, paint) {
    if (scene.textures.exists(key)) return key;
    var tex = scene.textures.createCanvas(key, w, h);
    var ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    paint(ctx, w, h);
    tex.refresh();
    return key;
  }
  function rebake(scene, key, w, h, paint) {
    if (!scene.textures.exists(key)) return texture(scene, key, w, h, paint);
    var tex = scene.textures.get(key);
    var ctx = tex.getSourceImage().getContext('2d');
    ctx.clearRect(0, 0, w, h);
    paint(ctx, w, h);
    tex.refresh();
    return key;
  }
  function rr(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.closePath(); }
  function shade(ctx, x0, y0, x1, y1, a, b) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, a); g.addColorStop(1, b);
    return g;
  }
  function grain(ctx, x, y, w, h, alpha, seed) {
    var rnd = rngFrom(seed || 1234), i;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (i = 0; i < (w * h) / 90; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#FFFFFF' : '#000000';
      ctx.fillRect(x + rnd() * w, y + rnd() * h, 1, 1);
    }
    ctx.restore();
  }

  /* Family painters: the silhouette changes on every tier, so family and
   * tier both survive greyscale and colour-blind simulation. */
  var SHAPES = {
    wood: function (ctx, t, s, face, edge) {
      var m = s / 2, i;
      ctx.fillStyle = face; ctx.strokeStyle = edge; ctx.lineWidth = 2;
      if (t === 0) {
        ctx.save(); ctx.translate(m, m); ctx.rotate(-0.42);
        rr(ctx, -18, -6, 36, 12, 6); ctx.fill();
        ctx.fillStyle = edge; rr(ctx, -18, -6, 36, 4, 3); ctx.fill();
        ctx.strokeStyle = '#7A5236'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-12, 1); ctx.lineTo(10, 0); ctx.stroke();
        ctx.restore();
      } else if (t === 1) {
        rr(ctx, m - 21, m - 13, 42, 10, 3); ctx.fill();
        rr(ctx, m - 21, m + 1, 42, 10, 3); ctx.fill();
        ctx.fillStyle = edge;
        rr(ctx, m - 21, m - 13, 42, 3, 2); ctx.fill();
        rr(ctx, m - 21, m + 1, 42, 3, 2); ctx.fill();
      } else if (t === 2) {
        ctx.strokeStyle = face; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(m + i * 11, m - 16);
          ctx.quadraticCurveTo(m + i * 15, m + 4, m + i * 5, m + 15);
          ctx.stroke();
        }
        ctx.strokeStyle = edge; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(m - 17, m - 13); ctx.lineTo(m + 17, m - 13); ctx.stroke();
      } else {
        poly(ctx, [[m - 21, m - 2], [m + 21, m - 2], [m + 14, m + 14], [m - 14, m + 14]]);
        ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 21, m - 5, 42, 4, 2); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(m, m - 5); ctx.lineTo(m, m - 21); ctx.stroke();
        ctx.fillStyle = '#F5EFD9';
        poly(ctx, [[m + 1, m - 20], [m + 14, m - 10], [m + 1, m - 6]]); ctx.fill();
      }
    },
    shell: function (ctx, t, s, face, edge) {
      var m = s / 2, i, r, cy;
      ctx.fillStyle = face; ctx.strokeStyle = edge;
      if (t === 0 || t === 1) {
        r = t === 0 ? 16 : 19; cy = m + (t === 0 ? 8 : 10);
        ctx.beginPath(); ctx.arc(m, cy, r, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2;
        for (i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(m, cy);
          ctx.lineTo(m + Math.cos(-Math.PI / 2 + i * 0.36) * r, cy + Math.sin(-Math.PI / 2 + i * 0.36) * r);
          ctx.stroke();
        }
        if (t === 1) { ctx.fillStyle = edge; rr(ctx, m - 12, cy, 24, 4, 2); ctx.fill(); }
      } else if (t === 2) {
        ctx.fillStyle = '#3E5C63'; rr(ctx, m - 5, m - 2, 10, 18, 3); ctx.fill();
        ctx.fillStyle = face;
        ctx.beginPath(); ctx.arc(m, m - 2, 17, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FFE9B0'; circle(ctx, m, m - 6, 6); ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 13, m + 14, 26, 5, 2); ctx.fill();
      } else {
        ctx.fillStyle = '#3E5C63'; poly(ctx, [[m - 12, m + 20], [m + 12, m + 20], [m + 8, m - 4], [m - 8, m - 4]]); ctx.fill();
        ctx.fillStyle = '#FFE9B0'; circle(ctx, m, m - 9, 11); ctx.fill();
        ctx.fillStyle = face; ctx.beginPath(); ctx.arc(m, m - 12, 15, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#FFF6D8'; ctx.lineWidth = 2;
        for (i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(m + i * 6, m - 9);
          ctx.lineTo(m + i * 13, m - 2 + Math.abs(i) * 2); ctx.stroke();
        }
      }
    },
    kelp: function (ctx, t, s, face, edge) {
      var m = s / 2, i, x, y, a;
      ctx.strokeStyle = face; ctx.lineCap = 'round';
      if (t === 0) {
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(m - 6, m + 18);
        ctx.bezierCurveTo(m + 10, m + 6, m - 12, m - 4, m + 4, m - 18); ctx.stroke();
        ctx.fillStyle = edge;
        for (i = 0; i < 3; i++) { circle(ctx, m - 6 + i * 6, m + 10 - i * 12, 5); ctx.fill(); }
      } else if (t === 1) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (i = 0; i <= 20; i++) {
          y = m - 18 + i * 1.8; x = m + Math.sin(i * 0.9) * 8;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = edge; ctx.lineWidth = 2;
        ctx.beginPath();
        for (i = 0; i <= 20; i++) {
          y = m - 18 + i * 1.8; x = m + Math.sin(i * 0.9 + 1) * 8;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (t === 2) {
        ctx.lineWidth = 9; ctx.strokeStyle = face;
        ctx.beginPath(); ctx.arc(m, m, 15, 0.5, TAU - 0.5); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = edge;
        for (i = 0; i < 8; i++) {
          a = 0.6 + i * 0.62;
          ctx.beginPath();
          ctx.moveTo(m + Math.cos(a) * 11, m + Math.sin(a) * 11);
          ctx.lineTo(m + Math.cos(a + 0.35) * 19, m + Math.sin(a + 0.35) * 19);
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = 2.5; ctx.strokeStyle = face;
        for (i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(m + i * 9, m - 19); ctx.lineTo(m + i * 9, m + 19); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(m - 19, m + i * 9); ctx.lineTo(m + 19, m + i * 9); ctx.stroke();
        }
        ctx.fillStyle = edge;
        for (i = 0; i < 5; i++) { circle(ctx, m - 18 + i * 9, m - 19 + (i % 2) * 38, 3.5); ctx.fill(); }
      }
    },
    glass: function (ctx, t, s, face, edge) {
      var m = s / 2, r;
      ctx.fillStyle = face; ctx.strokeStyle = edge; ctx.lineWidth = 2;
      if (t === 0) {
        poly(ctx, [[m - 15, m + 8], [m - 8, m - 14], [m + 13, m - 9], [m + 11, m + 13]]);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = 0.5;
        poly(ctx, [[m - 9, m - 11], [m - 2, m - 12], [m - 7, m + 4]]); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (t === 1) {
        circle(ctx, m, m, 17); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.globalAlpha = 0.6; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m, m, 11, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (t === 2) {
        ctx.fillStyle = face; circle(ctx, m, m, 18); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2.5;
        for (r = 5; r <= 17; r += 6) { circle(ctx, m, m, r); ctx.stroke(); }
        ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = 0.55;
        poly(ctx, [[m - 12, m - 6], [m - 3, m - 15], [m - 6, m - 2]]); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#3E5C63'; rr(ctx, m - 18, m - 12, 36, 26, 4); ctx.fill();
        ctx.fillStyle = face; rr(ctx, m - 14, m - 8, 28, 18, 3); ctx.fill();
        ctx.fillStyle = '#FFE9B0'; circle(ctx, m, m + 1, 7); ctx.fill();
        ctx.fillStyle = edge;
        poly(ctx, [[m - 20, m - 12], [m, m - 22], [m + 20, m - 12]]); ctx.fill();
        rr(ctx, m - 18, m + 12, 36, 5, 2); ctx.fill();
      }
    },
    brass: function (ctx, t, s, face, edge) {
      var m = s / 2, i, a, teeth, R;
      ctx.fillStyle = face; ctx.strokeStyle = edge; ctx.lineWidth = 2;
      if (t === 0) {
        poly(ctx, [[m - 4, m - 16], [m + 4, m - 16], [m + 3, m + 14], [m, m + 19], [m - 3, m + 14]]);
        ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 9, m - 19, 18, 6, 3); ctx.fill();
      } else if (t === 1 || t === 2) {
        teeth = t === 1 ? 8 : 12; R = t === 1 ? 17 : 19;
        ctx.fillStyle = face;
        for (i = 0; i < teeth; i++) {
          a = (i / teeth) * TAU;
          ctx.save(); ctx.translate(m, m); ctx.rotate(a);
          rr(ctx, -3.5, -R - 3, 7, 8, 2); ctx.fill();
          ctx.restore();
        }
        circle(ctx, m, m, R - 2); ctx.fill();
        ctx.fillStyle = '#0C2530'; circle(ctx, m, m, 5); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2.5; circle(ctx, m, m, R - 7); ctx.stroke();
        if (t === 2) {
          ctx.fillStyle = edge;
          for (i = 0; i < 6; i++) {
            a = i * 1.05;
            circle(ctx, m + Math.cos(a) * 10, m + Math.sin(a) * 10, 2); ctx.fill();
          }
        }
      } else {
        ctx.fillStyle = face; circle(ctx, m, m, 12); ctx.fill();
        ctx.strokeStyle = face; ctx.lineWidth = 4;
        for (i = 0; i < 4; i++) {
          a = i * (TAU / 4) + 0.4;
          ctx.beginPath(); ctx.moveTo(m + Math.cos(a) * 10, m + Math.sin(a) * 10);
          ctx.lineTo(m + Math.cos(a) * 20, m + Math.sin(a) * 20); ctx.stroke();
        }
        ctx.strokeStyle = edge; ctx.lineWidth = 3; circle(ctx, m, m, 20); ctx.stroke();
        ctx.fillStyle = '#0C2530'; circle(ctx, m, m, 4); ctx.fill();
      }
    },
    wick: function (ctx, t, s, face, edge) {
      var m = s / 2;
      ctx.fillStyle = face; ctx.strokeStyle = edge; ctx.lineWidth = 2;
      if (t === 0) {
        rr(ctx, m - 14, m - 6, 28, 20, 6); ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 14, m - 6, 28, 6, 3); ctx.fill();
      } else if (t === 1) {
        ctx.strokeStyle = '#F2E6C6'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m - 3, m + 16);
        ctx.quadraticCurveTo(m + 8, m, m - 2, m - 16); ctx.stroke();
        ctx.fillStyle = face; circle(ctx, m - 2, m - 17, 5); ctx.fill();
      } else if (t === 2) {
        ctx.fillStyle = '#F2E6C6'; rr(ctx, m - 7, m - 8, 14, 26, 4); ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 11, m + 15, 22, 5, 2); ctx.fill();
        ctx.fillStyle = face;
        poly(ctx, [[m, m - 22], [m + 6, m - 11], [m, m - 6], [m - 6, m - 11]]); ctx.fill();
        ctx.fillStyle = '#FFF0C0';
        poly(ctx, [[m, m - 18], [m + 3, m - 11], [m, m - 8], [m - 3, m - 11]]); ctx.fill();
      } else {
        ctx.fillStyle = '#8C6242'; rr(ctx, m - 16, m - 2, 32, 18, 5); ctx.fill();
        ctx.fillStyle = '#A87B52'; rr(ctx, m - 18, m - 5, 36, 6, 3); ctx.fill();
        ctx.fillStyle = face;
        poly(ctx, [[m, m - 24], [m + 10, m - 8], [m + 5, m - 2], [m - 5, m - 2], [m - 10, m - 8]]); ctx.fill();
        ctx.fillStyle = '#FFF0C0';
        poly(ctx, [[m, m - 18], [m + 5, m - 8], [m - 5, m - 8]]); ctx.fill();
      }
    },
    pearl: function (ctx, t, s, face, edge) {
      var m = s / 2, i, a, g, px, py;
      if (t === 0) {
        ctx.fillStyle = face;
        for (i = 0; i < 7; i++) {
          a = i * 0.9;
          circle(ctx, m + Math.cos(a) * (4 + i), m + Math.sin(a) * (3 + i), 3.2); ctx.fill();
        }
      } else if (t === 1) {
        g = ctx.createRadialGradient(m - 5, m - 6, 2, m, m, 18);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.55, edge); g.addColorStop(1, face);
        ctx.fillStyle = g; circle(ctx, m, m, 17); ctx.fill();
      } else if (t === 2) {
        ctx.strokeStyle = edge; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m, m - 4, 15, 0.25, Math.PI - 0.25); ctx.stroke();
        for (i = 0; i < 6; i++) {
          a = 0.35 + i * 0.5;
          px = m + Math.cos(a) * 15; py = m - 4 + Math.sin(a) * 15;
          g = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, 7);
          g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, face);
          ctx.fillStyle = g; circle(ctx, px, py, 6); ctx.fill();
        }
      } else {
        ctx.strokeStyle = edge; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(m, m + 6, 17, Math.PI + 0.2, TAU - 0.2); ctx.stroke();
        ctx.fillStyle = face;
        for (i = -2; i <= 2; i++) {
          poly(ctx, [[m + i * 8 - 5, m - 2], [m + i * 8, m - 18 + Math.abs(i) * 4], [m + i * 8 + 5, m - 2]]);
          ctx.fill();
        }
        ctx.fillStyle = '#FFFFFF';
        for (i = -2; i <= 2; i++) { circle(ctx, m + i * 8, m - 19 + Math.abs(i) * 4, 3); ctx.fill(); }
      }
    },
    coral: function (ctx, t, s, face, edge) {
      var m = s / 2, i, a;
      ctx.fillStyle = face; ctx.strokeStyle = face; ctx.lineCap = 'round';
      if (t === 0) {
        poly(ctx, [[m - 10, m + 12], [m - 4, m - 10], [m + 6, m - 6], [m + 11, m + 12]]); ctx.fill();
        ctx.fillStyle = edge; circle(ctx, m - 2, m - 2, 3); ctx.fill();
      } else if (t === 1) {
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(m, m + 18); ctx.lineTo(m, m - 2); ctx.stroke();
        for (i = -1; i <= 1; i += 2) {
          ctx.beginPath(); ctx.moveTo(m, m + 4);
          ctx.quadraticCurveTo(m + i * 12, m - 4, m + i * 10, m - 16); ctx.stroke();
        }
        ctx.fillStyle = edge;
        circle(ctx, m, m - 4, 4); ctx.fill();
        circle(ctx, m - 10, m - 17, 4); ctx.fill();
        circle(ctx, m + 10, m - 17, 4); ctx.fill();
      } else if (t === 2) {
        ctx.lineWidth = 5;
        for (i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(m, m + 18);
          ctx.quadraticCurveTo(m + i * 9, m + 2, m + i * 13, m - 15); ctx.stroke();
        }
        ctx.fillStyle = edge;
        for (i = -2; i <= 2; i++) { circle(ctx, m + i * 13, m - 16, 4.5); ctx.fill(); }
      } else {
        ctx.lineWidth = 7; ctx.strokeStyle = face;
        ctx.beginPath(); ctx.moveTo(m - 18, m + 19);
        ctx.bezierCurveTo(m - 18, m - 14, m + 18, m - 14, m + 18, m + 19); ctx.stroke();
        ctx.fillStyle = edge;
        for (i = 0; i < 5; i++) {
          a = Math.PI + 0.25 + i * 0.65;
          circle(ctx, m + Math.cos(a) * 18, m + 6 + Math.sin(a) * 18, 4); ctx.fill();
        }
      }
    },
    crystal: function (ctx, t, s, face, edge) {
      var m = s / 2, i, a, bands;
      ctx.fillStyle = face; ctx.strokeStyle = edge; ctx.lineWidth = 2;
      if (t === 0) {
        for (i = 0; i < 5; i++) {
          a = i * 1.3;
          ctx.save(); ctx.translate(m + Math.cos(a) * 8, m + Math.sin(a) * 7); ctx.rotate(a);
          rr(ctx, -4, -4, 8, 8, 2); ctx.fill(); ctx.restore();
        }
      } else if (t === 1) {
        poly(ctx, [[m, m - 20], [m + 12, m - 4], [m + 7, m + 17], [m - 7, m + 17], [m - 12, m - 4]]);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = edge; ctx.globalAlpha = 0.65;
        poly(ctx, [[m, m - 20], [m + 12, m - 4], [m, m + 4]]); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (t === 2) {
        ctx.fillStyle = '#5A4A52'; circle(ctx, m, m, 19); ctx.fill();
        ctx.fillStyle = face;
        ctx.beginPath(); ctx.arc(m, m, 19, -0.9, 2.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = edge;
        for (i = 0; i < 6; i++) {
          a = -0.7 + i * 0.45;
          poly(ctx, [[m, m], [m + Math.cos(a) * 15, m + Math.sin(a) * 15],
            [m + Math.cos(a + 0.4) * 15, m + Math.sin(a + 0.4) * 15]]);
          ctx.fill();
        }
      } else {
        poly(ctx, [[m - 18, m + 16], [m, m - 20], [m + 18, m + 16]]);
        ctx.fillStyle = face; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke();
        ctx.globalAlpha = 0.85;
        bands = ['#F25C68', '#F7C948', '#5BCB77', '#38A8DE'];
        for (i = 0; i < bands.length; i++) {
          ctx.fillStyle = bands[i];
          poly(ctx, [[m + 6, m - 4], [m + 20, m - 12 + i * 7], [m + 20, m - 6 + i * 7]]);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    },
    canvas: function (ctx, t, s, face) {
      var m = s / 2, i;
      ctx.fillStyle = face; ctx.strokeStyle = '#8FA7A6'; ctx.lineWidth = 2;
      if (t === 0) {
        poly(ctx, [[m - 16, m - 9], [m + 13, m - 14], [m + 16, m + 11], [m - 12, m + 14]]);
        ctx.fill(); ctx.stroke();
      } else if (t === 1) {
        rr(ctx, m - 17, m - 15, 34, 30, 4); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8FA7A6'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        rr(ctx, m - 11, m - 9, 22, 18, 3); ctx.stroke();
        ctx.setLineDash([]);
      } else if (t === 2) {
        poly(ctx, [[m - 3, m - 20], [m - 3, m + 17], [m - 19, m + 17]]); ctx.fill(); ctx.stroke();
        poly(ctx, [[m + 1, m - 20], [m + 17, m + 17], [m + 1, m + 17]]); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8FA7A6'; rr(ctx, m - 2, m - 22, 3, 42, 1.5); ctx.fill();
      } else {
        ctx.fillStyle = '#8FA7A6'; rr(ctx, m - 2, m - 23, 4, 46, 2); ctx.fill();
        ctx.fillStyle = face;
        ctx.beginPath(); ctx.moveTo(m - 3, m - 20);
        ctx.quadraticCurveTo(m - 24, m + 2, m - 3, m + 16); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(m + 2, m - 20);
        ctx.quadraticCurveTo(m + 22, m + 2, m + 2, m + 16); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 1.5;
        for (i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(m - 3, m + i * 8 + 2); ctx.lineTo(m - 16, m + i * 6 + 4); ctx.stroke();
        }
      }
    },
    iron: function (ctx, t, s, face, edge) {
      var m = s / 2, i;
      ctx.fillStyle = face; ctx.strokeStyle = edge; ctx.lineWidth = 3;
      if (t === 0) {
        poly(ctx, [[m - 3, m - 15], [m + 3, m - 15], [m + 2, m + 12], [m, m + 18], [m - 2, m + 12]]);
        ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 8, m - 18, 16, 5, 2); ctx.fill();
      } else if (t === 1) {
        ctx.strokeStyle = face; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(m, m, 11, 17, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = edge; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(m - 2, m - 2, 8, 13, 0, 2.2, 4.2); ctx.stroke();
      } else if (t === 2) {
        ctx.strokeStyle = face; ctx.lineWidth = 5;
        for (i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.ellipse(m + i * 13, m, 7, 12, 0, 0, TAU); ctx.stroke();
        }
        ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(m, m - 1, 5, 9, 0, 2.2, 4.2); ctx.stroke();
      } else {
        ctx.strokeStyle = face; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m, m - 18); ctx.lineTo(m, m + 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m - 13, m - 10); ctx.lineTo(m + 13, m - 10); ctx.stroke();
        ctx.beginPath(); ctx.arc(m, m + 2, 15, 0.5, Math.PI - 0.5); ctx.stroke();
        ctx.fillStyle = edge; circle(ctx, m, m - 20, 5); ctx.fill();
        ctx.fillStyle = '#0C2530'; circle(ctx, m, m - 20, 2); ctx.fill();
      }
    },
    chart: function (ctx, t, s, face, edge) {
      var m = s / 2, i;
      ctx.fillStyle = edge; ctx.strokeStyle = face; ctx.lineWidth = 1.5;
      if (t === 0) {
        ctx.save(); ctx.translate(m, m); ctx.rotate(0.14);
        rr(ctx, -13, -17, 26, 34, 2); ctx.fill();
        ctx.strokeStyle = '#9C7F4C';
        for (i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(-9, i * 4.5); ctx.lineTo(9, i * 4.5); ctx.stroke();
        }
        ctx.restore();
      } else if (t === 1) {
        for (i = 0; i < 3; i++) {
          ctx.save(); ctx.translate(m + (i - 1) * 3, m + (i - 1) * 2); ctx.rotate((i - 1) * 0.12);
          ctx.fillStyle = i === 2 ? edge : '#E4CE99';
          rr(ctx, -12, -16, 24, 32, 2); ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = '#B14B3E'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(m - 14, m + 4); ctx.lineTo(m + 14, m - 2); ctx.stroke();
      } else if (t === 2) {
        ctx.fillStyle = edge; rr(ctx, m - 19, m - 14, 38, 28, 3); ctx.fill();
        ctx.strokeStyle = '#8FA7A6'; ctx.lineWidth = 1;
        for (i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(m + i * 7, m - 14); ctx.lineTo(m + i * 7, m + 14); ctx.stroke();
        }
        ctx.strokeStyle = '#4E7F86'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m - 15, m + 8);
        ctx.bezierCurveTo(m - 4, m - 2, m + 4, m + 6, m + 15, m - 6); ctx.stroke();
        ctx.fillStyle = '#B14B3E';
        poly(ctx, [[m + 7, m - 8], [m + 12, m - 3], [m + 2, m - 3]]); ctx.fill();
      } else {
        ctx.fillStyle = '#8C6242'; rr(ctx, m - 19, m - 16, 38, 32, 3); ctx.fill();
        ctx.fillStyle = edge; rr(ctx, m - 16, m - 13, 32, 26, 2); ctx.fill();
        ctx.fillStyle = '#8C6242'; rr(ctx, m - 2, m - 16, 4, 32, 1); ctx.fill();
        ctx.strokeStyle = '#4E7F86'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(m - 8, m, 6, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(m + 9, m + 1, 5, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#EFBD67'; circle(ctx, m + 9, m + 1, 2.5); ctx.fill();
        ctx.fillStyle = '#B14B3E'; rr(ctx, m + 12, m - 18, 5, 10, 2); ctx.fill();
      }
    }
  };

  function paintItem(ctx, size, k, t) {
    var c = chainOf(k), pad = 3, s = size, i;
    ctx.save();
    ctx.fillStyle = 'rgba(3,14,20,0.45)';
    rr(ctx, pad + 2, pad + 5, s - pad * 2 - 4, s - pad * 2 - 4, 13); ctx.fill();
    ctx.fillStyle = shade(ctx, 0, pad, 0, s - pad, '#20505C', '#12333E');
    rr(ctx, pad, pad, s - pad * 2, s - pad * 2, 13); ctx.fill();
    ctx.strokeStyle = t >= MAX_TIER ? c.edge : 'rgba(245,239,217,0.30)';
    ctx.lineWidth = t >= MAX_TIER ? 2.5 : 1.5;
    rr(ctx, pad + 0.75, pad + 0.75, s - pad * 2 - 1.5, s - pad * 2 - 1.5, 12); ctx.stroke();
    ctx.fillStyle = 'rgba(245,239,217,0.13)';
    rr(ctx, pad + 3, pad + 3, s - pad * 2 - 6, 8, 5); ctx.fill();
    ctx.save();
    (SHAPES[c.shape] || SHAPES.wood)(ctx, clamp(t, 0, MAX_TIER), s, c.face, c.edge);
    ctx.restore();
    for (i = 0; i <= t; i++) {
      ctx.fillStyle = c.edge;
      circle(ctx, s / 2 - (t * 4.5) + i * 9, s - 9, 2.6); ctx.fill();
    }
    grain(ctx, pad, pad, s - pad * 2, s - pad * 2, 0.05, 90 + k * 7 + t);
    ctx.restore();
  }

  /* ---- board chrome, cards, rings, particles, dioramas ---- */
  function paintBoard(ctx, w, h) {
    var i, x, y, g;
    ctx.fillStyle = 'rgba(3,12,18,0.5)';
    rr(ctx, 6, 10, w - 12, h - 14, 20); ctx.fill();
    ctx.fillStyle = shade(ctx, 0, 0, 0, h, '#1A4C4E', '#0F3038');
    rr(ctx, 4, 4, w - 8, h - 12, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(245,239,217,0.22)'; ctx.lineWidth = 1.5;
    rr(ctx, 5, 5, w - 10, h - 14, 17); ctx.stroke();
    ctx.fillStyle = '#8A5F3E';
    rr(ctx, 8, 8, w - 16, 9, 4); ctx.fill();
    rr(ctx, 8, h - 25, w - 16, 9, 4); ctx.fill();
    ctx.fillStyle = 'rgba(232,174,110,0.45)';
    rr(ctx, 8, 8, w - 16, 3, 2); ctx.fill();
    grain(ctx, 8, 8, w - 16, h - 24, 0.06, 4242);
    for (i = 0; i < CELLS; i++) {
      x = 12 + (i % COLS) * PITCH;
      y = 22 + Math.floor(i / COLS) * PITCH;
      ctx.fillStyle = ((i % COLS) + Math.floor(i / COLS)) % 2 === 0 ? '#17414E' : '#153A46';
      rr(ctx, x, y, CELL, CELL, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(46,106,114,0.85)'; ctx.lineWidth = 1;
      rr(ctx, x + 0.5, y + 0.5, CELL - 1, CELL - 1, 11); ctx.stroke();
      ctx.fillStyle = 'rgba(3,14,20,0.30)';
      rr(ctx, x + 3, y + CELL - 8, CELL - 6, 6, 3); ctx.fill();
    }
    g = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(3,12,18,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  function paintFog(ctx, s) {
    var i, rnd = rngFrom(21);
    ctx.fillStyle = 'rgba(85,121,117,0.88)';
    rr(ctx, 1, 1, s - 2, s - 2, 12); ctx.fill();
    ctx.globalAlpha = 0.5;
    for (i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? '#7C9E99' : '#48696A';
      circle(ctx, 6 + rnd() * (s - 12), 6 + rnd() * (s - 12), 6 + rnd() * 9); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(245,239,217,0.22)'; ctx.lineWidth = 1;
    rr(ctx, 1.5, 1.5, s - 3, s - 3, 11); ctx.stroke();
  }

  function paintRing(ctx, s, color, dashed, arrow) {
    var m = s / 2, i, corners;
    ctx.strokeStyle = color; ctx.lineWidth = 3.5;
    if (dashed) ctx.setLineDash([7, 5]);
    rr(ctx, 4, 4, s - 8, s - 8, 13); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    corners = [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8]];
    for (i = 0; i < 4; i++) { circle(ctx, corners[i][0], corners[i][1], 3); ctx.fill(); }
    if (arrow) {
      poly(ctx, [[m, 12], [m + 8, 22], [m + 3, 22], [m + 3, s - 14], [m - 3, s - 14], [m - 3, 22], [m - 8, 22]]);
      ctx.fill();
    }
  }

  function paintHatch(ctx, s, color) {
    var i;
    ctx.save();
    rr(ctx, 4, 4, s - 8, s - 8, 13); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.75;
    for (i = -s; i < s * 2; i += 9) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = color; ctx.lineWidth = 3.5;
    rr(ctx, 4, 4, s - 8, s - 8, 13); ctx.stroke();
  }

  function paintCard(ctx, w, h, accent, filled) {
    ctx.fillStyle = 'rgba(3,12,18,0.45)';
    rr(ctx, 2, 4, w - 4, h - 4, 12); ctx.fill();
    ctx.fillStyle = shade(ctx, 0, 0, 0, h, filled ? '#1D5A54' : '#123844', '#0C2530');
    rr(ctx, 1, 1, w - 3, h - 5, 11); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = filled ? 2 : 1.2;
    rr(ctx, 1.5, 1.5, w - 4, h - 6, 10); ctx.stroke();
    ctx.fillStyle = accent; ctx.globalAlpha = 0.85;
    rr(ctx, 4, 4, 4, h - 12, 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function paintPanel(ctx, w, h) {
    ctx.fillStyle = 'rgba(3,12,18,0.55)';
    rr(ctx, 4, 8, w - 8, h - 10, 18); ctx.fill();
    ctx.fillStyle = shade(ctx, 0, 0, 0, h, '#F5EFD9', '#DCCFAE');
    rr(ctx, 2, 2, w - 6, h - 12, 16); ctx.fill();
    ctx.strokeStyle = '#B9975B'; ctx.lineWidth = 2;
    rr(ctx, 4, 4, w - 10, h - 16, 14); ctx.stroke();
    grain(ctx, 4, 4, w - 10, h - 16, 0.07, 777);
  }

  function paintButton(ctx, w, h, fill, edge) {
    ctx.fillStyle = 'rgba(3,12,18,0.5)';
    rr(ctx, 2, 5, w - 4, h - 5, 14); ctx.fill();
    ctx.fillStyle = shade(ctx, 0, 0, 0, h, fill, edge);
    rr(ctx, 1, 1, w - 3, h - 6, 13); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, 5, 4, w - 11, (h - 6) * 0.42, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(245,239,217,0.42)'; ctx.lineWidth = 1.4;
    rr(ctx, 1.5, 1.5, w - 4, h - 7, 12); ctx.stroke();
  }

  function paintStrip(ctx, w, h) {
    ctx.fillStyle = 'rgba(3,12,18,0.42)';
    rr(ctx, 2, 4, w - 4, h - 4, 12); ctx.fill();
    ctx.fillStyle = shade(ctx, 0, 0, 0, h, '#F7F1DC', '#DFD2B2');
    rr(ctx, 1, 1, w - 3, h - 5, 11); ctx.fill();
    ctx.strokeStyle = '#B9975B'; ctx.lineWidth = 1.4;
    rr(ctx, 2, 2, w - 5, h - 7, 10); ctx.stroke();
    ctx.fillStyle = '#EFBD67';
    rr(ctx, 6, 6, 4, h - 17, 2); ctx.fill();
    grain(ctx, 4, 4, w - 10, h - 12, 0.05, 313);
  }

  function paintDot(ctx, s, color) {
    var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color); g.addColorStop(0.5, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; circle(ctx, s / 2, s / 2, s / 2); ctx.fill();
  }

  function paintBubble(ctx, s) {
    var m = s / 2;
    var g = ctx.createRadialGradient(m - s * 0.18, m - s * 0.2, s * 0.05, m, m, m);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(117,209,196,0.22)');
    g.addColorStop(1, 'rgba(117,209,196,0.42)');
    ctx.fillStyle = g; circle(ctx, m, m, m - 2); ctx.fill();
    ctx.strokeStyle = 'rgba(245,239,217,0.65)'; ctx.lineWidth = 2;
    circle(ctx, m, m, m - 3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    circle(ctx, m - s * 0.2, m - s * 0.22, s * 0.09); ctx.fill();
  }

  /* Diorama: one texture per area, repainted only when a restoration step
   * lands. Three layers: sky and cliffs, water and shore, then props. */
  function paintScene(ctx, w, h, areaIndex, props) {
    var A = AREAS[areaIndex] || AREAS[0], i, x, y, n, horizon = h * 0.52;
    ctx.fillStyle = shade(ctx, 0, 0, 0, horizon, A.sky, A.deep);
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = 'rgba(12,37,48,0.55)';
    poly(ctx, [[0, horizon], [0, horizon - 34], [46, horizon - 52], [96, horizon - 26],
      [150, horizon - 44], [214, horizon - 20], [268, horizon - 40], [330, horizon - 18],
      [w, horizon - 36], [w, horizon]]);
    ctx.fill();
    ctx.fillStyle = shade(ctx, 0, horizon, 0, h, A.deep, '#0A2029');
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = 'rgba(245,239,217,0.16)'; ctx.lineWidth = 2;
    for (i = 0; i < 5; i++) {
      y = horizon + 8 + i * 11;
      ctx.beginPath();
      for (x = -4; x <= w + 4; x += 6) ctx.lineTo(x, y + Math.sin(x / 22 + i) * 2.2);
      ctx.stroke();
    }
    ctx.fillStyle = A.land;
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(0, h - 30);
    for (x = 0; x <= w; x += 10) ctx.lineTo(x, h - 30 + Math.sin(x / 30 + areaIndex) * 6);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(3,14,20,0.20)';
    ctx.fillRect(0, h - 10, w, 10);
    n = clamp(props | 0, 0, 8);
    for (i = 0; i < n; i++) sceneProp(ctx, w, h, areaIndex, i);
    if (n < 8) {
      ctx.fillStyle = 'rgba(85,121,117,' + (0.30 - n * 0.03).toFixed(2) + ')';
      ctx.fillRect(w * (n / 8), 0, w - w * (n / 8), h);
    }
    ctx.fillStyle = 'rgba(7,25,35,0.55)';
    ctx.fillRect(0, h - 4, w, 4);
  }

  function sceneProp(ctx, w, h, area, i) {
    var baseY = h - 30, x = 26 + i * 44, j;
    ctx.save();
    if (area === 0) {
      if (i === 0) { ctx.fillStyle = '#8A5F3E'; rr(ctx, x - 18, baseY - 8, 44, 9, 4); ctx.fill(); }
      else if (i === 1) { ctx.fillStyle = '#D99C83'; ctx.beginPath(); ctx.arc(x, baseY - 2, 11, Math.PI, TAU); ctx.closePath(); ctx.fill(); }
      else if (i === 2) { ctx.strokeStyle = '#5FA98B'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 8, baseY); ctx.quadraticCurveTo(x + 6, baseY - 18, x - 2, baseY - 30); ctx.stroke(); }
      else if (i === 3) { ctx.fillStyle = '#8A5F3E'; rr(ctx, x - 22, baseY - 16, 46, 6, 3); ctx.fill(); rr(ctx, x - 18, baseY - 10, 5, 12, 2); ctx.fill(); rr(ctx, x + 14, baseY - 10, 5, 12, 2); ctx.fill(); }
      else if (i === 4) { ctx.fillStyle = '#3E5C63'; rr(ctx, x - 5, baseY - 30, 10, 30, 3); ctx.fill(); ctx.fillStyle = '#EFBD67'; circle(ctx, x, baseY - 34, 8); ctx.fill(); }
      else if (i === 5) { ctx.strokeStyle = '#C9B48A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 20, baseY - 26); ctx.quadraticCurveTo(x, baseY - 14, x + 20, baseY - 28); ctx.stroke(); }
      else if (i === 6) { ctx.fillStyle = '#B77C52'; poly(ctx, [[x - 20, baseY - 6], [x + 20, baseY - 6], [x + 12, baseY - 22], [x - 12, baseY - 22]]); ctx.fill(); }
      else { ctx.fillStyle = '#B77C52'; poly(ctx, [[x - 26, baseY - 4], [x + 26, baseY - 4], [x + 17, baseY - 24], [x - 17, baseY - 24]]); ctx.fill(); ctx.fillStyle = '#F5EFD9'; poly(ctx, [[x, baseY - 26], [x + 14, baseY - 44], [x, baseY - 46]]); ctx.fill(); }
    } else if (area === 1) {
      if (i < 3) { ctx.fillStyle = '#6A7E8C'; rr(ctx, x - 16, baseY - 12 - i * 5, 40, 12 + i * 5, 3); ctx.fill(); }
      else if (i === 3) { ctx.fillStyle = '#F5EFD9'; poly(ctx, [[x - 14, baseY], [x - 9, baseY - 54], [x + 9, baseY - 54], [x + 14, baseY]]); ctx.fill(); }
      else if (i === 4) { ctx.fillStyle = '#C76A52'; rr(ctx, x - 13, baseY - 30, 26, 8, 2); ctx.fill(); rr(ctx, x - 11, baseY - 46, 22, 8, 2); ctx.fill(); }
      else if (i === 5) { ctx.fillStyle = '#3E5C63'; rr(ctx, x - 12, baseY - 66, 24, 12, 3); ctx.fill(); ctx.fillStyle = '#EFBD67'; rr(ctx, x - 9, baseY - 64, 18, 8, 2); ctx.fill(); }
      else if (i === 6) { ctx.fillStyle = '#C76A52'; poly(ctx, [[x - 15, baseY - 66], [x, baseY - 80], [x + 15, baseY - 66]]); ctx.fill(); }
      else {
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#F7C948';
        poly(ctx, [[x - 6, baseY - 60], [x - 74, baseY - 78], [x - 74, baseY - 40]]); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (area === 2) {
      if (i < 2) { ctx.fillStyle = '#2A5A62'; poly(ctx, [[x - 20, baseY], [x - 6, baseY - 40 - i * 8], [x + 12, baseY]]); ctx.fill(); }
      else if (i < 4) { ctx.fillStyle = '#9A7CF3'; for (j = 0; j < 3; j++) { circle(ctx, x - 8 + j * 9, baseY - 10 - (j % 2) * 7, 5); ctx.fill(); } }
      else if (i === 4) { ctx.fillStyle = '#E05A7A'; for (j = -1; j <= 1; j++) { rr(ctx, x + j * 8 - 2, baseY - 24, 4, 24, 2); ctx.fill(); } }
      else if (i === 5) { ctx.fillStyle = '#C6D0FF'; poly(ctx, [[x - 12, baseY], [x, baseY - 30], [x + 12, baseY]]); ctx.fill(); }
      else if (i === 6) { ctx.fillStyle = '#F6EEFF'; circle(ctx, x, baseY - 24, 10); ctx.fill(); ctx.fillStyle = '#CBB8DE'; circle(ctx, x - 3, baseY - 27, 4); ctx.fill(); }
      else { ctx.strokeStyle = '#9A7CF3'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x - 10, baseY, 26, Math.PI, TAU); ctx.stroke(); }
    } else if (area === 3) {
      if (i < 2) { ctx.fillStyle = '#8FA7A6'; rr(ctx, x - 18, baseY - 10, 44, 10, 3); ctx.fill(); }
      else if (i === 2) { ctx.fillStyle = '#7C8C99'; rr(ctx, x - 4, baseY - 40, 8, 40, 3); ctx.fill(); }
      else if (i === 3) { ctx.fillStyle = '#DCE6E8'; poly(ctx, [[x - 2, baseY - 40], [x - 2, baseY - 6], [x - 30, baseY - 6]]); ctx.fill(); }
      else if (i === 4) { ctx.fillStyle = '#DCE6E8'; poly(ctx, [[x + 2, baseY - 40], [x + 30, baseY - 6], [x + 2, baseY - 6]]); ctx.fill(); }
      else if (i === 5) { ctx.strokeStyle = '#7C8C99'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 26, baseY - 4); ctx.lineTo(x + 26, baseY - 34); ctx.stroke(); }
      else if (i === 6) { ctx.fillStyle = '#B9975B'; rr(ctx, x - 14, baseY - 22, 28, 20, 3); ctx.fill(); ctx.fillStyle = '#F0DCA8'; rr(ctx, x - 11, baseY - 19, 22, 14, 2); ctx.fill(); }
      else { ctx.fillStyle = '#38A8DE'; circle(ctx, x, baseY - 46, 12); ctx.fill(); ctx.fillStyle = '#CFF3FB'; circle(ctx, x - 3, baseY - 49, 5); ctx.fill(); }
    } else {
      if (i < 3) { ctx.fillStyle = '#5A4A52'; ctx.save(); ctx.translate(x, baseY); ctx.rotate(-0.22 + i * 0.08); rr(ctx, -22, -12 - i * 6, 50, 12, 5); ctx.fill(); ctx.restore(); }
      else if (i === 3) { ctx.fillStyle = '#7C8C99'; rr(ctx, x - 5, baseY - 44, 10, 44, 4); ctx.fill(); }
      else if (i === 4) { ctx.fillStyle = '#DCE6E8'; poly(ctx, [[x, baseY - 44], [x + 30, baseY - 10], [x, baseY - 10]]); ctx.fill(); }
      else if (i === 5) { ctx.fillStyle = '#F25C68'; circle(ctx, x, baseY - 52, 11); ctx.fill(); ctx.fillStyle = '#FFE9B0'; circle(ctx, x, baseY - 52, 5); ctx.fill(); }
      else if (i === 6) { ctx.fillStyle = '#B9975B'; rr(ctx, x - 15, baseY - 20, 30, 18, 3); ctx.fill(); }
      else {
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#EFBD67';
        poly(ctx, [[x - 4, baseY - 60], [x + 70, baseY - 84], [x + 70, baseY - 34]]); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function paintStormBg(ctx, w, h) {
    var i, j, rnd = rngFrom(88), x, y, sw;
    ctx.fillStyle = shade(ctx, 0, 0, 0, h, '#134350', '#07202B');
    ctx.fillRect(0, 0, w, h);
    /* light shafts from the surface */
    ctx.globalAlpha = 0.10;
    for (i = 0; i < 5; i++) {
      x = 30 + i * 78 + rnd() * 20;
      sw = 26 + rnd() * 26;
      ctx.fillStyle = '#BFF3EA';
      poly(ctx, [[x, 0], [x + sw, 0], [x + sw * 2.1, h], [x - sw * 0.6, h]]);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    /* kelp silhouettes along the floor */
    ctx.strokeStyle = 'rgba(10,42,46,0.85)';
    ctx.lineCap = 'round';
    for (i = 0; i < 9; i++) {
      x = 12 + i * 44 + rnd() * 18;
      ctx.lineWidth = 7 + rnd() * 7;
      ctx.beginPath();
      ctx.moveTo(x, h);
      for (j = 1; j <= 5; j++) ctx.lineTo(x + Math.sin(j * 1.1 + i) * 16, h - j * (26 + rnd() * 12));
      ctx.stroke();
    }
    /* drifting motes baked into the plate */
    ctx.fillStyle = 'rgba(191,243,234,0.20)';
    for (i = 0; i < 60; i++) { circle(ctx, rnd() * w, rnd() * h, 1 + rnd() * 2); ctx.fill(); }
    /* surface caustic band */
    ctx.strokeStyle = 'rgba(191,243,234,0.22)'; ctx.lineWidth = 2;
    for (i = 0; i < 4; i++) {
      y = 10 + i * 9;
      ctx.beginPath();
      for (x = -4; x <= w + 4; x += 6) ctx.lineTo(x, y + Math.sin(x / 18 + i) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(7,25,35,0.55)';
    ctx.fillRect(0, h - 6, w, 6);
  }

  function paintTitleArt(ctx, w, h) {
    var i, rnd = rngFrom(31);
    paintScene(ctx, w, h, 4, 8);
    ctx.fillStyle = 'rgba(7,25,35,0.32)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(245,239,217,0.75)';
    for (i = 0; i < 40; i++) { circle(ctx, rnd() * w, rnd() * h * 0.45, rnd() * 1.4 + 0.4); ctx.fill(); }
  }

  function bakeAll(scene, onStep) {
    var k, t, made = 0, total = CHAINS.length * (MAX_TIER + 1);
    for (k = 0; k < CHAINS.length; k++) {
      for (t = 0; t <= MAX_TIER; t++) {
        (function (kk, tt) {
          texture(scene, itemKey(kk, tt), CELL, CELL, function (ctx) { paintItem(ctx, CELL, kk, tt); });
        })(k, t);
        made++;
        if (onStep) onStep(made / total);
      }
    }
    texture(scene, 'dc_board', BOARD_W + 24, BOARD_H + 44, paintBoard);
    texture(scene, 'dc_fog', CELL, CELL, function (ctx, w) { paintFog(ctx, w); });
    texture(scene, 'dc_ring_ready', CELL + 8, CELL + 8, function (ctx, w) { paintRing(ctx, w, C.paper, false, false); });
    texture(scene, 'dc_ring_ok', CELL + 8, CELL + 8, function (ctx, w) { paintRing(ctx, w, C.ok, false, true); });
    texture(scene, 'dc_ring_goal', CELL + 8, CELL + 8, function (ctx, w) { paintRing(ctx, w, C.gold, false, true); });
    texture(scene, 'dc_ring_bad', CELL + 8, CELL + 8, function (ctx, w) { paintHatch(ctx, w, C.bad); });
    texture(scene, 'dc_ghost', CELL, CELL, function (ctx, w) { paintRing(ctx, w, 'rgba(245,239,217,0.55)', true, false); });
    texture(scene, 'dc_card', 118, 74, function (ctx, w, h) { paintCard(ctx, w, h, C.gold, false); });
    texture(scene, 'dc_card_done', 118, 74, function (ctx, w, h) { paintCard(ctx, w, h, C.ok, true); });
    texture(scene, 'dc_prod', 168, 74, function (ctx, w, h) { paintButton(ctx, w, h, '#1B5660', '#0F3038'); });
    texture(scene, 'dc_prod_rest', 168, 74, function (ctx, w, h) { paintButton(ctx, w, h, '#2A4048', '#16262C'); });
    texture(scene, 'dc_btn', 280, 56, function (ctx, w, h) { paintButton(ctx, w, h, '#1B5660', '#0F3038'); });
    texture(scene, 'dc_btn_hero', 280, 56, function (ctx, w, h) { paintButton(ctx, w, h, '#EFBD67', '#C99A45'); });
    texture(scene, 'dc_btn_small', 96, 46, function (ctx, w, h) { paintButton(ctx, w, h, '#1B5660', '#0F3038'); });
    texture(scene, 'dc_icon_btn', 46, 46, function (ctx, w, h) { paintButton(ctx, w, h, '#123844', '#0C2530'); });
    texture(scene, 'dc_panel', 300, 200, paintPanel);
    texture(scene, 'dc_banner', 236, 104, paintPanel);
    texture(scene, 'dc_chip', 150, 34, function (ctx, w, h) { paintCard(ctx, w, h, C.aqua, false); });
    texture(scene, 'dc_strip', 358, 40, paintStrip);
    texture(scene, 'dc_frag', 12, 12, function (ctx, w) { paintDot(ctx, w, '#EFBD67'); });
    texture(scene, 'dc_spark', 10, 10, function (ctx, w) { paintDot(ctx, w, '#75D1C4'); });
    texture(scene, 'dc_conf', 8, 14, function (ctx, w, h) { ctx.fillStyle = '#F5EFD9'; rr(ctx, 0, 0, w, h, 3); ctx.fill(); });
    texture(scene, 'dc_mote', 14, 14, function (ctx, w) { paintDot(ctx, w, 'rgba(245,239,217,0.85)'); });
    texture(scene, 'dc_bubble', 72, 72, function (ctx, w) { paintBubble(ctx, w); });
    texture(scene, 'dc_title_art', W, 320, paintTitleArt);
    texture(scene, 'dc_storm_bg', W, 620, paintStormBg);
    for (k = 0; k < AREAS.length; k++) {
      (function (kk) {
        texture(scene, 'dc_scene_' + kk, W, 150, function (ctx, w, h) { paintScene(ctx, w, h, kk, 0); });
      })(k);
    }
  }

  /* --------------------------------------------------------------- save */
  var SAVE_VERSION = 3;
  var kit = null;
  var save = null;
  var Game = { phaser: null, active: null };

  function freshSave() {
    var s = {
      v: SAVE_VERSION,
      board: new Array(CELLS),
      fog: new Array(CELLS),
      area: 0,
      done: 0,
      cleared: [0, 0, 0, 0, 0],
      energy: { tide: PRODUCER_MAX, wreck: PRODUCER_MAX },
      recovery: { tide: 0, wreck: 0 },
      merges: 0,
      fragments: 0,
      notes: [],
      chapter: 1,
      stormBest: 0,
      tutorial: 0,
      seenIntro: 0
    };
    var i;
    for (i = 0; i < CELLS; i++) { s.board[i] = null; s.fog[i] = true; }
    for (i = 0; i < NOTES.length; i++) s.notes.push(false);
    /* prototype opening hand: matched pairs, clear mist around them */
    var seeds = [[0, 0], [1, 0], [6, 1], [7, 1], [12, 2], [13, 2],
      [18, 0], [19, 0], [24, 1], [25, 1], [30, 2], [31, 2]];
    for (i = 0; i < seeds.length; i++) {
      s.board[seeds[i][0]] = { k: seeds[i][1], t: 0 };
      s.fog[seeds[i][0]] = false;
    }
    var open = [2, 3, 8, 9, 14, 15, 20, 21, 26, 27, 32, 33];
    for (i = 0; i < open.length; i++) s.fog[open[i]] = false;
    return s;
  }

  function validateSave(obj) {
    return !!obj && obj.v === SAVE_VERSION && Array.isArray(obj.board) && obj.board.length === CELLS;
  }

  /* Every persisted value is rebuilt against the live content registries so
   * a board can never lose or invent items on reload. */
  function normaliseSave(raw) {
    var base = freshSave(), i, cell, k, t;
    if (!validateSave(raw)) return base;
    var s = base;
    for (i = 0; i < CELLS; i++) {
      cell = raw.board[i];
      if (cell && typeof cell === 'object') {
        k = finiteInt(cell.k, -1, 0, CHAINS.length - 1);
        t = finiteInt(cell.t, 0, 0, MAX_TIER);
        s.board[i] = (typeof cell.k === 'number' && cell.k >= 0 && cell.k < CHAINS.length) ? { k: k, t: t } : null;
      } else s.board[i] = null;
      s.fog[i] = Array.isArray(raw.fog) ? raw.fog[i] !== false : true;
      if (s.board[i]) s.fog[i] = false;
    }
    s.done = finiteInt(raw.done, 0, 0, ORDERS.length);
    s.area = clamp(finiteInt(raw.area, 0, 0, AREAS.length - 1), 0, areaForOrder(s.done));
    for (i = 0; i < 5; i++) {
      s.cleared[i] = finiteInt(raw.cleared && raw.cleared[i], 0, 0, AREA_ORDERS[i]);
    }
    s.energy.tide = finiteInt(raw.energy && raw.energy.tide, PRODUCER_MAX, 0, PRODUCER_MAX);
    s.energy.wreck = finiteInt(raw.energy && raw.energy.wreck, PRODUCER_MAX, 0, PRODUCER_MAX);
    s.recovery.tide = finiteInt(raw.recovery && raw.recovery.tide, 0, 0, RECOVERY_MERGES - 1);
    s.recovery.wreck = finiteInt(raw.recovery && raw.recovery.wreck, 0, 0, RECOVERY_MERGES - 1);
    s.merges = finiteInt(raw.merges, 0, 0, 999999);
    s.fragments = finiteInt(raw.fragments, 0, 0, 9999999);
    s.chapter = finiteInt(raw.chapter, 1, 1, 5);
    s.stormBest = finiteInt(raw.stormBest, 0, 0, 9999999);
    s.tutorial = finiteInt(raw.tutorial, 0, 0, 4);
    s.seenIntro = finiteInt(raw.seenIntro, 0, 0, 1);
    for (i = 0; i < NOTES.length; i++) {
      s.notes[i] = !!(Array.isArray(raw.notes) && raw.notes[i]);
    }
    /* a save with progress but an empty board still gets a working hand */
    if (countItems(s) === 0) {
      var fresh = freshSave();
      for (i = 0; i < CELLS; i++) if (!s.board[i] && fresh.board[i]) { s.board[i] = fresh.board[i]; s.fog[i] = false; }
    }
    return s;
  }
  function countItems(s) {
    var n = 0, i;
    for (i = 0; i < CELLS; i++) if (s.board[i]) n++;
    return n;
  }
  function areaForOrder(done) {
    var acc = 0, i;
    for (i = 0; i < AREA_ORDERS.length; i++) {
      acc += AREA_ORDERS[i];
      if (done < acc) return i;
    }
    return AREAS.length - 1;
  }
  function persist() { if (kit) kit.save.set(save); }

  /* ---------------------------------------------------------------- sim */
  function unlockedChains() {
    var list = [], i, a, c;
    for (a = 0; a <= clamp(save.area, 0, AREAS.length - 1); a++) {
      for (i = 0; i < AREAS[a].chains.length; i++) {
        c = AREAS[a].chains[i];
        if (list.indexOf(c) < 0) list.push(c);
      }
    }
    if (!list.length) list = [0, 1, 2];
    return list;
  }
  function producerPool(id) {
    var unlocked = unlockedChains(), want = id === 'tide' ? NATURAL : CRAFTED, out = [], i;
    for (i = 0; i < unlocked.length; i++) if (want.indexOf(unlocked[i]) >= 0) out.push(unlocked[i]);
    if (!out.length) out = unlocked.slice();   /* guarded fallback */
    return out;
  }
  function activeOrders() {
    var list = [], i;
    for (i = save.done; i < ORDERS.length && list.length < 3; i++) {
      if (ORDERS[i].area > save.area) break;
      list.push(i);
    }
    if (!list.length && save.done < ORDERS.length) list.push(save.done);
    return list;
  }
  function countOnBoard(k, t) {
    var n = 0, i, c;
    for (i = 0; i < CELLS; i++) { c = save.board[i]; if (c && c.k === k && c.t === t) n++; }
    return n;
  }
  function orderReady(index) {
    var o = ORDERS[index];
    if (!o) return false;
    var i, need = {};
    for (i = 0; i < o.want.length; i++) {
      var key = o.want[i][0] + ':' + o.want[i][1];
      need[key] = (need[key] || 0) + o.want[i][2];
    }
    for (var key2 in need) {
      var parts = key2.split(':');
      if (countOnBoard(+parts[0], +parts[1]) < need[key2]) return false;
    }
    return true;
  }
  /* The exact chain step the tray should point at: first unmet requirement,
   * plus how many of the previous step are still missing. */
  function orderGap(index) {
    var o = ORDERS[index];
    if (!o) return null;
    var i;
    for (i = 0; i < o.want.length; i++) {
      var k = o.want[i][0], t = o.want[i][1], n = o.want[i][2];
      var have = countOnBoard(k, t);
      if (have < n) {
        var prevHave = t > 0 ? countOnBoard(k, t - 1) : 0;
        return { k: k, t: t, need: n, have: have, prevK: k, prevT: Math.max(0, t - 1),
          prevHave: prevHave, prevNeed: (n - have) * 2 };
      }
    }
    return { k: o.want[0][0], t: o.want[0][1], need: o.want[0][2], have: o.want[0][2], done: true };
  }
  function freeCells() {
    var n = 0, i;
    for (i = 0; i < CELLS; i++) if (!save.fog[i] && !save.board[i]) n++;
    return n;
  }
  function nearestFree(from) {
    var best = -1, bestD = 1e9, i, d;
    for (i = 0; i < CELLS; i++) {
      if (save.fog[i] || save.board[i]) continue;
      d = Math.abs((i % COLS) - (from % COLS)) + Math.abs(Math.floor(i / COLS) - Math.floor(from / COLS));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function clearFogNear(index) {
    var cx = index % COLS, cy = Math.floor(index / COLS), list = [], x, y, cell;
    for (y = -1; y <= 1; y++) {
      for (x = -1; x <= 1; x++) {
        var nx = cx + x, ny = cy + y;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        cell = ny * COLS + nx;
        if (save.fog[cell]) list.push(cell);
      }
    }
    list.sort(function (a, b) { return Math.abs(a - index) - Math.abs(b - index); });
    var opened = list.slice(0, 5);
    for (x = 0; x < opened.length; x++) save.fog[opened[x]] = false;
    return opened;
  }
  function openAnyFog() {
    var i;
    for (i = 0; i < CELLS; i++) if (save.fog[i]) { save.fog[i] = false; return i; }
    return -1;
  }
  /* Auto tidy: pack every item into the opened cells, grouped by chain and
   * tier so the board reads at a glance. Returns the moved pairs. */
  function tidyBoard() {
    var items = [], slots = [], i, moves = [];
    for (i = 0; i < CELLS; i++) {
      if (save.board[i]) items.push({ cell: i, k: save.board[i].k, t: save.board[i].t });
      if (!save.fog[i]) slots.push(i);
    }
    items.sort(function (a, b) { return a.k === b.k ? b.t - a.t : a.k - b.k; });
    for (i = 0; i < CELLS; i++) save.board[i] = null;
    for (i = 0; i < items.length && i < slots.length; i++) {
      save.board[slots[i]] = { k: items[i].k, t: items[i].t };
      if (slots[i] !== items[i].cell) moves.push([items[i].cell, slots[i]]);
    }
    return moves;
  }

  /* ---------------------------------------------------------- particles */
  /* Four pooled systems, allocated once. Dead items are parked offscreen. */
  function makePool(scene, key, size, depth, blend) {
    var pool = { items: [], next: 0 };
    for (var i = 0; i < size; i++) {
      var sp = scene.add.image(-80, -80, key).setDepth(depth).setVisible(false);
      if (blend) sp.setBlendMode(PhaserRef.BlendModes.ADD);
      pool.items.push({ sp: sp, life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, g: 0, s0: 1, s1: 0, rot: 0, spin: 0 });
    }
    return pool;
  }
  function emit(pool, x, y, count, opts) {
    if (!pool) return;
    var o = opts || {};
    for (var i = 0; i < count; i++) {
      var p = pool.items[pool.next];
      pool.next = (pool.next + 1) % pool.items.length;
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || TAU) : Math.random() * TAU;
      var sp = (o.speed || 90) * (0.45 + Math.random() * 0.8);
      p.x = x + (Math.random() - 0.5) * (o.jitter || 8);
      p.y = y + (Math.random() - 0.5) * (o.jitter || 8);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (o.lift || 0);
      p.g = o.gravity != null ? o.gravity : 220;
      p.max = p.life = (o.life || 0.55) * (0.7 + Math.random() * 0.6);
      p.s0 = (o.scale || 1) * (0.7 + Math.random() * 0.6);
      p.s1 = o.scaleEnd != null ? o.scaleEnd : 0.05;
      p.rot = Math.random() * TAU; p.spin = (Math.random() - 0.5) * 9;
      if (o.tint != null) p.sp.setTint(o.tint); else p.sp.clearTint();
      p.sp.setVisible(true);
    }
  }
  function stepPool(pool, dt) {
    if (!pool) return;
    for (var i = 0; i < pool.items.length; i++) {
      var p = pool.items[i];
      if (p.life <= 0) { if (p.sp.visible) p.sp.setVisible(false).setPosition(-80, -80); continue; }
      p.life -= dt;
      if (p.life <= 0) { p.sp.setVisible(false).setPosition(-80, -80); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var f = p.life / p.max;
      p.sp.setPosition(p.x, p.y).setScale(lerp(p.s1, p.s0, f)).setAlpha(clamp(f * 1.4, 0, 1)).setRotation(p.rot);
    }
  }
  function clearPool(pool) {
    if (!pool) return;
    for (var i = 0; i < pool.items.length; i++) {
      pool.items[i].life = 0;
      pool.items[i].sp.setVisible(false).setPosition(-80, -80);
    }
  }

  /* ------------------------------------------------------------ helpers */
  function makeText(scene, x, y, text, size, color, originX, weight) {
    var t = scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: size + 'px', color: color,
      fontStyle: weight || '600', resolution: TEXT_RES
    });
    t.setOrigin(originX == null ? 0.5 : originX, 0.5);
    t.__color = color;
    return t;
  }
  function motionOn() { return !!(kit && kit.juice && kit.juice.enabled); }
  function publish(extra) {
    var s = root.__dc.state, key;
    for (key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) s[key] = extra[key];
  }
  function shake(mag, ms) { if (kit && motionOn()) kit.juice.shake(mag, ms); }
  function hitStop(ms) { if (kit && motionOn()) kit.juice.hitStop(ms); }
  function sfx(name, vol, rate) { if (kit) kit.audio.sfx(name, { volume: vol == null ? 0.85 : vol, rate: rate || 1 }); }

  /* One transient at a time: chips queue, they never stack (UI law rule 1). */
  function makeChips(scene, x, y, depth) {
    var bg = scene.add.image(x, y, 'dc_chip').setDepth(depth).setVisible(false);
    var label = makeText(scene, x, y - 1, '', 14, C.paper, 0.5, '700').setDepth(depth + 1).setVisible(false);
    return { bg: bg, label: label, queue: [], hold: 0, current: null };
  }
  function pushChip(chips, text, color) {
    if (!chips) return;
    if (chips.queue.length > 2) chips.queue.length = 2;
    chips.queue.push({ text: text, color: color || C.paper });
  }
  function stepChips(chips, dt) {
    if (!chips) return;
    if (chips.hold > 0) {
      chips.hold -= dt;
      var f = clamp(chips.hold / 0.28, 0, 1);
      chips.bg.setAlpha(f); chips.label.setAlpha(f);
      if (chips.hold <= 0) {
        chips.bg.setVisible(false); chips.label.setVisible(false); chips.current = null;
      }
      return;
    }
    if (chips.queue.length) {
      var next = chips.queue.shift();
      chips.current = next;
      chips.hold = 1.0;
      setTextIfChanged(chips.label, next.text);
      setColorIfChanged(chips.label, next.color);
      var wide = clamp(chips.label.width + 30, 96, 220);
      chips.bg.setDisplaySize(wide, 34).setVisible(true).setAlpha(1);
      chips.label.setVisible(true).setAlpha(1);
    }
  }

  /* Force switches are readable from the boot fallback and from every live
   * scene, so a headless probe can jump modes at any time. */
  function handleForce(scene, current) {
    var hook = root.__dc, mode = hook.forceMode;
    if (mode && mode !== current) {
      hook.forceMode = null;
      if (mode === 'play') { scene.scene.start('play'); return true; }
      if (mode === 'storm') { scene.scene.start('storm'); return true; }
      if (mode === 'title') { scene.scene.start('title'); return true; }
      if (mode === 'log') { scene.scene.start('log', { from: current === 'play' ? 'play' : 'title' }); return true; }
    }
    if (hook.forceStage != null && current !== 'play') { scene.scene.start('play'); return true; }
    return false;
  }

  /* ---------------------------------------------------------- play scene */
  function PlayScene() { PhaserRef.Scene.call(this, { key: 'play' }); }
  PlayScene.prototype = Object.create(PhaserRef.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  var TRAY_Y = 236, COACH_Y = 286, PROD_Y = 762;

  PlayScene.prototype.create = function () {
    var self = this, i;
    Game.active = this;
    this.mode = 'play';
    this.acc = 0;
    this.time0 = 0;
    this.drag = null;
    this.dragTarget = -1;
    this.cursor = 0;
    this.combo = 0;
    this.lastMerge = -9;
    this.clock = 0;
    this.coachT = 0;
    this.coach = '';
    this.bannerT = 0;
    this.bannerTitle = '';
    this.bannerSub = '';
    this.selState = 'ready';
    this.selT = 0;
    this.resolveT = 0;
    this.resolveCell = -1;
    this.paused = false;
    this.buttons = [];
    this.keyEdges = {};
    this.trayDirty = true;
    this.tray = [];
    for (i = 0; i < 3; i++) this.tray.push({ index: -1, ready: false, k: 0, t: 0, label: '', prevNeed: 2 });

    this.add.rectangle(W / 2, H / 2, W, H, 0x071923).setDepth(0);

    /* diorama */
    this.scenery = this.add.image(W / 2, 125, 'dc_scene_' + save.area).setDepth(2);
    this.sceneryProps = save.cleared[save.area];
    this.refreshScenery(true);

    /* HUD: one compact line, icons over words */
    this.add.rectangle(W / 2, 25, W, 50, 0x071923, 0.92).setDepth(20);
    this.areaText = makeText(this, 14, 18, AREAS[save.area].name, 17, C.paper, 0, '800').setDepth(21);
    this.subText = makeText(this, 14, 37, '', 13, C.muted, 0, '600').setDepth(21);
    this.fragIcon = this.add.image(276, 25, 'dc_frag').setDepth(21).setScale(1.5);
    this.fragText = makeText(this, 288, 25, '0', 15, C.gold, 0, '750').setDepth(21);
    this.pauseBtn = this.add.image(366, 25, 'dc_icon_btn').setDepth(21).setDisplaySize(46, 46);
    this.pauseGlyph = makeText(this, 366, 24, 'II', 16, C.paper, 0.5, '800').setDepth(22);
    this.buttons.push({ x: 343, y: 2, w: 46, h: 46, fn: function () { self.openPause(); } });

    /* order tray: the persistent goal display */
    this.cards = [];
    for (i = 0; i < 3; i++) {
      var cx = 66 + i * 129;
      var card = {
        bg: this.add.image(cx, TRAY_Y, 'dc_card').setDepth(12),
        who: makeText(this, cx - 50, TRAY_Y - 24, '', 12, C.muted, 0, '700').setDepth(13),
        icon: this.add.image(cx - 34, TRAY_Y + 2, itemKey(0, 0)).setDepth(13).setScale(0.60),
        count: makeText(this, cx - 34, TRAY_Y + 24, '', 12, C.paper, 0.5, '750').setDepth(13),
        stepFrom: this.add.image(cx + 24, TRAY_Y + 2, itemKey(0, 0)).setDepth(13).setScale(0.42),
        arrow: makeText(this, cx + 2, TRAY_Y + 2, '', 16, C.gold, 0.5, '800').setDepth(13),
        need: makeText(this, cx + 24, TRAY_Y + 24, '', 12, C.gold, 0.5, '750').setDepth(13),
        ready: makeText(this, cx + 34, TRAY_Y - 24, '', 11, C.ok, 0.5, '800').setDepth(13),
        pulse: 0, index: -1
      };
      this.cards.push(card);
      (function (slot) {
        self.buttons.push({ x: 66 + slot * 129 - 59, y: TRAY_Y - 37, w: 118, h: 74,
          fn: function () { self.tapCard(slot); } });
      })(i);
    }

    /* board */
    this.board = this.add.image(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2 - 8, 'dc_board').setDepth(4);
    this.items = [];
    this.fogs = [];
    this.view = [];
    for (i = 0; i < CELLS; i++) {
      this.items.push(this.add.image(cellX(i), cellY(i), itemKey(0, 0)).setDepth(8).setVisible(false));
      this.fogs.push(this.add.image(cellX(i), cellY(i), 'dc_fog').setDepth(9).setVisible(false));
      this.view.push({ x: cellX(i), y: cellY(i), scale: 1, pop: 0, alpha: 1, key: '' });
    }
    this.selector = this.add.image(-99, -99, 'dc_ring_ready').setDepth(10).setVisible(false);
    this.ghost = this.add.image(-99, -99, 'dc_ghost').setDepth(10).setVisible(false);
    this.dragSprite = this.add.image(-99, -99, itemKey(0, 0)).setDepth(16).setVisible(false);

    /* producers and tidy */
    this.prodTide = this.makeProducer('tide', 98, 'Tide pool');
    this.prodWreck = this.makeProducer('wreck', 292, 'Wreck crate');
    this.tidyBtn = this.add.image(195, PROD_Y, 'dc_icon_btn').setDepth(21).setDisplaySize(46, 46);
    this.tidyGlyph = makeText(this, 195, PROD_Y - 1, '=', 20, C.aqua, 0.5, '800').setDepth(22);
    this.buttons.push({ x: 172, y: PROD_Y - 23, w: 46, h: 46, fn: function () { self.doTidy(true); } });

    /* particle systems: fragments, streaks, reward, ambient motes */
    this.fxFrag = makePool(this, 'dc_frag', 16, 14);
    this.fxStreak = makePool(this, 'dc_spark', 14, 14, true);
    this.fxReward = makePool(this, 'dc_conf', 20, 30);
    this.fxMote = makePool(this, 'dc_mote', 12, 3);
    this.moteT = 0;

    /* transients: one chip at a time, one thin coach strip */
    this.chips = makeChips(this, W / 2, 66, 26);
    this.coachBg = this.add.image(W / 2, COACH_Y, 'dc_strip').setDepth(26).setVisible(false);
    this.coachText = makeText(this, W / 2, COACH_Y - 1, '', 14, '#243A44', 0.5, '700').setDepth(27).setVisible(false);

    /* run boundary banner (60 percent width, overshoot) */
    this.bannerBg = this.add.image(W / 2, 420, 'dc_banner').setDepth(40).setVisible(false);
    this.bannerText = makeText(this, W / 2, 400, '', 22, '#2B2D42', 0.5, '800').setDepth(41).setVisible(false);
    this.bannerSubText = makeText(this, W / 2, 430, '', 14, '#5A5B6B', 0.5, '600').setDepth(41).setVisible(false);

    /* pause panel */
    this.pauseLayer = [];
    this.buildPause();

    this.input.on('pointerdown', function (p) { self.onDown(p); });
    this.input.on('pointermove', function (p) { self.onMove(p); });
    this.input.on('pointerup', function (p) { self.onUp(p); });
    this.input.on('pointerupoutside', function (p) { self.onUp(p); });
    this.input.keyboard.on('keydown', function (e) { self.onKey(e); });

    this.sys.events.on('prerender', this.render, this);
    this.sys.events.once('shutdown', function () {
      self.sys.events.off('prerender', self.render, self);
      Game.active = null;
    });

    if (kit) kit.audio.music(AREAS[save.area].music, 900);
    this.startCoach();
    this.publishState();
    this.render();
  };

  PlayScene.prototype.makeProducer = function (id, x, label) {
    var self = this, i, pips = [];
    var p = {
      id: id,
      bg: this.add.image(x, PROD_Y, 'dc_prod').setDepth(20),
      label: makeText(this, x, PROD_Y - 16, label, 14, C.paper, 0.5, '750').setDepth(21),
      state: makeText(this, x, PROD_Y + 18, '', 12, C.aqua, 0.5, '650').setDepth(21),
      pips: pips, pop: 0
    };
    for (i = 0; i < PRODUCER_MAX; i++) {
      pips.push(this.add.image(x - 34 + i * 17, PROD_Y + 2, 'dc_spark').setDepth(21).setScale(0.9));
    }
    this.buttons.push({ x: x - 84, y: PROD_Y - 37, w: 168, h: 74,
      fn: function () { self.draw(id); } });
    return p;
  };

  PlayScene.prototype.buildPause = function () {
    var self = this, i, rows = [
      ['Resume', function () { self.closePause(); }],
      ['Keeper log', function () { self.closePause(); self.scene.start('log', { from: 'play' }); }],
      ['Bubble Storm', function () { self.closePause(); self.scene.start('storm'); }],
      ['Settings', function () { if (kit) kit.openSettings(); }],
      ['Cove menu', function () { self.closePause(); self.scene.start('title'); }]
    ];
    var dim = this.add.rectangle(W / 2, H / 2, W, H, 0x071923, 0.88).setDepth(50).setVisible(false);
    this.pauseLayer.push(dim);
    var title = makeText(this, W / 2, 232, 'Paused', 26, C.paper, 0.5, '800').setDepth(51).setVisible(false);
    this.pauseLayer.push(title);
    this.pauseButtons = [];
    for (i = 0; i < rows.length; i++) {
      var y = 300 + i * 68;
      var bg = this.add.image(W / 2, y, 'dc_btn').setDepth(51).setVisible(false);
      var tx = makeText(this, W / 2, y - 2, rows[i][0], 17, C.paper, 0.5, '750').setDepth(52).setVisible(false);
      this.pauseLayer.push(bg); this.pauseLayer.push(tx);
      this.pauseButtons.push({ x: W / 2 - 140, y: y - 28, w: 280, h: 56, fn: rows[i][1] });
    }
  };
  PlayScene.prototype.openPause = function () {
    if (this.paused) return;
    this.paused = true;
    this.drag = null;
    for (var i = 0; i < this.pauseLayer.length; i++) this.pauseLayer[i].setVisible(true);
    if (kit) kit.pause('menu');
    sfx('ui', 0.6);
    this.publishState();
  };
  PlayScene.prototype.closePause = function () {
    if (!this.paused) return;
    this.paused = false;
    for (var i = 0; i < this.pauseLayer.length; i++) this.pauseLayer[i].setVisible(false);
    if (kit) kit.resume('menu');
    sfx('ui', 0.5);
    this.publishState();
  };

  PlayScene.prototype.refreshScenery = function (force) {
    var props = save.cleared[save.area];
    if (!force && this.sceneryProps === props && this.sceneryArea === save.area) return;
    this.sceneryProps = props;
    this.sceneryArea = save.area;
    var area = save.area;
    rebake(this, 'dc_scene_' + area, W, 150, function (ctx, w, h) { paintScene(ctx, w, h, area, props); });
    setTextureIfChanged(this.scenery, 'dc_scene_' + area);
    this.scenery.setTexture('dc_scene_' + area);
  };

  /* ------------------------------------------------------- interactions */
  PlayScene.prototype.hitButton = function (px, py, list) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  };
  PlayScene.prototype.onDown = function (p) {
    var b;
    if (this.paused) {
      b = this.hitButton(p.worldX, p.worldY, this.pauseButtons);
      if (b) b.fn();
      return;
    }
    if (kit && kit.paused) return;
    if (this.bannerT > 0.35) return;
    b = this.hitButton(p.worldX, p.worldY, this.buttons);
    if (b) { b.fn(); return; }
    var cell = cellAt(p.worldX, p.worldY);
    if (cell < 0) return;
    this.cursor = cell;
    if (save.fog[cell]) {
      pushChip(this.chips, 'Mist. Merge nearby to clear it.', C.mist);
      sfx('invalid', 0.5);
      return;
    }
    if (!save.board[cell]) { this.selState = 'ready'; return; }
    this.drag = { from: cell, x: p.worldX, y: p.worldY, id: p.id };
    this.dragTarget = cell;
    this.selState = 'preview';
    sfx('pick', 0.5, 1 + save.board[cell].t * 0.06);
  };
  PlayScene.prototype.onMove = function (p) {
    if (!this.drag || this.paused) return;
    this.drag.x = p.worldX; this.drag.y = p.worldY;
    var cell = cellAt(p.worldX, p.worldY);
    this.dragTarget = cell;
  };
  PlayScene.prototype.onUp = function (p) {
    if (!this.drag || this.paused) return;
    var from = this.drag.from, to = cellAt(p.worldX, p.worldY);
    this.drag = null;
    this.selState = 'ready';
    if (to < 0 || to === from) { this.cursor = from; return; }
    this.resolveDrop(from, to);
  };
  PlayScene.prototype.onKey = function (e) {
    if (!e || !e.code) return;
    var code = e.code;
    if (code === 'Escape') { if (this.paused) this.closePause(); else this.openPause(); return; }
    if (this.paused || (kit && kit.paused)) return;
    var cx = this.cursor % COLS, cy = Math.floor(this.cursor / COLS);
    if (code === 'ArrowLeft' || code === 'KeyA') { cx = clamp(cx - 1, 0, COLS - 1); }
    else if (code === 'ArrowRight' || code === 'KeyD') { cx = clamp(cx + 1, 0, COLS - 1); }
    else if (code === 'ArrowUp' || code === 'KeyW') { cy = clamp(cy - 1, 0, ROWS - 1); }
    else if (code === 'ArrowDown' || code === 'KeyS') { cy = clamp(cy + 1, 0, ROWS - 1); }
    else if (code === 'Space' || code === 'Enter') {
      if (this.keyPick == null || this.keyPick < 0) {
        if (save.board[this.cursor]) { this.keyPick = this.cursor; this.selState = 'preview'; sfx('pick', 0.5); }
        else sfx('invalid', 0.4);
      } else {
        var from = this.keyPick;
        this.keyPick = -1;
        this.selState = 'ready';
        this.resolveDrop(from, this.cursor);
      }
      return;
    } else if (code === 'KeyT') { this.doTidy(true); return; }
    else if (code === 'KeyQ') { this.draw('tide'); return; }
    else if (code === 'KeyE') { this.draw('wreck'); return; }
    else if (code === 'Digit1') { this.tapCard(0); return; }
    else if (code === 'Digit2') { this.tapCard(1); return; }
    else if (code === 'Digit3') { this.tapCard(2); return; }
    else return;
    this.cursor = cy * COLS + cx;
  };

  PlayScene.prototype.resolveDrop = function (from, to) {
    if (from < 0 || to < 0 || from === to) return;
    var a = save.board[from], b = save.board[to];
    if (!a) return;
    if (save.fog[to]) {
      pushChip(this.chips, 'That cell is still under mist.', C.mist);
      sfx('invalid', 0.5);
      return;
    }
    if (!b) {
      save.board[to] = a; save.board[from] = null;
      this.trayDirty = true;
      this.view[to].x = cellX(from); this.view[to].y = cellY(from);
      this.cursor = to;
      sfx('drop', 0.5);
      persist();
      return;
    }
    if (a.k !== b.k || a.t !== b.t) {
      pushChip(this.chips, 'Only a matching pair merges.', C.bad);
      sfx('invalid', 0.55);
      this.selState = 'invalid';
      this.selT = 0.4;
      return;
    }
    if (a.t >= MAX_TIER) {
      pushChip(this.chips, itemName(a.k, a.t) + ' is the final link.', C.gold);
      sfx('invalid', 0.45);
      return;
    }
    this.mergeCells(from, to);
  };

  PlayScene.prototype.mergeCells = function (from, to) {
    var item = save.board[from], tier = item.t + 1, k = item.k, i;
    save.board[from] = null;
    save.board[to] = { k: k, t: tier };
    save.merges++;
    this.trayDirty = true;
    save.fragments = Math.min(9999999, save.fragments + 12 * tier);
    var opened = clearFogNear(to);
    var now = this.clock;
    this.combo = (now - this.lastMerge) < 2.5 ? this.combo + 1 : 1;
    this.lastMerge = now;
    this.cursor = to;
    this.selState = 'resolve';
    this.resolveCell = to;
    this.resolveT = 0.36;
    this.view[to].pop = 1;
    this.view[to].x = cellX(from); this.view[to].y = cellY(from);

    var accent = PhaserRef.Display.Color.HexStringToColor(chainOf(k).edge).color;
    emit(this.fxFrag, cellX(to), cellY(to), tier >= MAX_TIER ? 10 : 6, { speed: 130, life: 0.5, tint: accent, scale: 1 });
    emit(this.fxStreak, cellX(from), cellY(from), 4, { speed: 150, life: 0.32, gravity: 40, scale: 0.9 });
    for (i = 0; i < opened.length; i++) {
      emit(this.fxStreak, cellX(opened[i]), cellY(opened[i]), 2, { speed: 60, life: 0.5, gravity: -20, scale: 1.1 });
    }
    if (tier >= MAX_TIER) {
      sfx('chain', 0.9);
      emit(this.fxReward, cellX(to), cellY(to), 16, { speed: 210, life: 0.9, lift: 60, scale: 1 });
      pushChip(this.chips, itemName(k, tier) + ' complete', C.gold);
      hitStop(70); shake(5, 220);
    } else if (this.combo >= 3) {
      sfx('mergebig', 0.85, 1 + Math.min(0.2, this.combo * 0.03));
      pushChip(this.chips, 'Chain x' + this.combo, C.aqua);
      hitStop(50); shake(3.5, 170);
    } else {
      sfx('merge', 0.8, 1 + tier * 0.05);
      hitStop(40);
      if (this.combo >= 2) shake(2, 120);
    }
    this.recoverProducers();
    if (save.tutorial === 1) { save.tutorial = 2; this.startCoach(); }
    if (freeCells() < 3) this.doTidy(false);
    this.checkOrders();
    persist();
    this.publishState();
  };

  PlayScene.prototype.recoverProducers = function () {
    var ids = ['tide', 'wreck'], i, id;
    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      if (save.energy[id] > 0) continue;
      save.recovery[id] = Math.min(RECOVERY_MERGES, save.recovery[id] + 1);
      if (save.recovery[id] >= RECOVERY_MERGES) {
        save.energy[id] = PRODUCER_MAX;
        save.recovery[id] = 0;
        pushChip(this.chips, (id === 'tide' ? 'Tide pool' : 'Wreck crate') + ' is ready', C.aqua);
        sfx('spawn', 0.5);
      }
    }
  };

  PlayScene.prototype.draw = function (id) {
    if (this.paused || (kit && kit.paused)) return;
    var pool = producerPool(id), i;
    if (save.energy[id] <= 0) {
      pushChip(this.chips, 'Resting. ' + (RECOVERY_MERGES - save.recovery[id]) + ' merges to refill.', C.bad);
      sfx('invalid', 0.45);
      return;
    }
    var target = nearestFree(id === 'tide' ? CELLS - 6 : 5);
    if (target < 0) {
      var opened = openAnyFog();
      if (opened >= 0) {
        pushChip(this.chips, 'The mist parts for one more cell.', C.mist);
        target = opened;
      } else {
        this.doTidy(false);
        target = nearestFree(0);
      }
      if (target < 0) {
        pushChip(this.chips, 'The board is full. Merge or deliver first.', C.bad);
        sfx('invalid', 0.5);
        return;
      }
    }
    var k = pool[Math.floor(Math.random() * pool.length)];
    var t = (id === 'wreck' && Math.random() < 0.3) ? 1 : 0;
    save.board[target] = { k: k, t: t };
    save.energy[id] -= 1;
    this.trayDirty = true;
    this.view[target].x = id === 'tide' ? 98 : 292;
    this.view[target].y = PROD_Y;
    this.view[target].pop = 0.7;
    var prod = id === 'tide' ? this.prodTide : this.prodWreck;
    prod.pop = 1;
    emit(this.fxStreak, cellX(target), cellY(target), 5, { speed: 90, life: 0.4, gravity: 30 });
    sfx('spawn', 0.7, 0.95 + Math.random() * 0.12);
    if (save.tutorial === 0) { save.tutorial = 1; this.startCoach(); }
    persist();
    this.publishState();
  };

  PlayScene.prototype.doTidy = function (manual) {
    var moves = tidyBoard(), i;
    this.trayDirty = true;
    for (i = 0; i < moves.length; i++) {
      this.view[moves[i][1]].x = cellX(moves[i][0]);
      this.view[moves[i][1]].y = cellY(moves[i][0]);
    }
    if (manual) {
      sfx('ui', 0.55);
      pushChip(this.chips, moves.length ? 'Board tidied' : 'Already tidy', C.aqua);
    }
    persist();
  };

  PlayScene.prototype.tapCard = function (slot) {
    var card = this.cards[slot];
    if (!card || card.index < 0) return;
    if (!orderReady(card.index)) {
      var gap = orderGap(card.index);
      if (gap) {
        pushChip(this.chips, 'Needs ' + itemName(gap.k, gap.t), C.gold);
      }
      sfx('invalid', 0.45);
      return;
    }
    this.deliver(card.index, slot);
  };

  PlayScene.prototype.deliver = function (index, slot) {
    var o = ORDERS[index], i, j, want, taken, cell;
    if (!o) return;
    for (i = 0; i < o.want.length; i++) {
      want = o.want[i]; taken = 0;
      for (j = 0; j < CELLS && taken < want[2]; j++) {
        cell = save.board[j];
        if (cell && cell.k === want[0] && cell.t === want[1]) {
          save.board[j] = null;
          taken++;
          emit(this.fxStreak, cellX(j), cellY(j), 4, { speed: 120, life: 0.45, gravity: -60 });
        }
      }
    }
    this.trayDirty = true;
    save.fragments = Math.min(9999999, save.fragments + o.frag);
    save.done = Math.min(ORDERS.length, save.done + 1);
    save.cleared[o.area] = Math.min(AREA_ORDERS[o.area], save.cleared[o.area] + 1);
    sfx('order', 0.9);
    emit(this.fxReward, this.cards[slot] ? this.cards[slot].bg.x : W / 2, TRAY_Y, 18,
      { speed: 200, life: 0.9, lift: 70 });
    hitStop(60); shake(4, 200);
    if (save.tutorial === 2) { save.tutorial = 3; }
    this.refreshScenery(true);
    this.unlockNote(o.area);
    if (save.cleared[o.area] >= AREA_ORDERS[o.area]) this.finishArea(o.area);
    else this.showBanner(o.title, 'Restored for ' + o.who + '  +' + o.frag, 1.5);
    this.doTidy(false);
    this.startCoach();
    persist();
    this.publishState();
  };

  PlayScene.prototype.unlockNote = function (area) {
    var cleared = save.cleared[area];
    if (cleared % 2 !== 0) return;
    var index = area * 4 + (cleared / 2 - 1);
    if (index < 0 || index >= NOTES.length || save.notes[index]) return;
    save.notes[index] = true;
    pushChip(this.chips, 'Note found: ' + NOTES[index].title, C.paper);
    sfx('chapter', 0.7);
    emit(this.fxReward, W / 2, 200, 10, { speed: 150, life: 0.8, lift: 40 });
  };

  PlayScene.prototype.finishArea = function (area) {
    if (area >= AREAS.length - 1) {
      save.chapter = 5;
      this.showBanner('The cove is lit', 'Every order answered. The log is complete.', 3.4);
      sfx('fanfare', 0.95);
      emit(this.fxReward, W / 2, 300, 20, { speed: 260, life: 1.2, lift: 90 });
      hitStop(110); shake(7, 320);
      persist();
      return;
    }
    save.area = area + 1;
    save.chapter = clamp(save.area + 1, 1, 5);
    this.trayDirty = true;
    this.sceneryArea = -1;
    this.refreshScenery(true);
    setTextIfChanged(this.areaText, AREAS[save.area].name);
    this.showBanner('Chapter ' + save.chapter, AREAS[save.area].name + '. ' + AREAS[save.area].blurb, 3.0);
    sfx('fanfare', 0.9);
    emit(this.fxReward, W / 2, 300, 20, { speed: 240, life: 1.1, lift: 80 });
    hitStop(110); shake(6, 300);
    if (kit) kit.audio.music(AREAS[save.area].music, 900);
    persist();
  };

  PlayScene.prototype.checkOrders = function () {
    var i, list;
    this.refreshTray();
    list = this.tray;
    for (i = 0; i < list.length; i++) {
      if (list[i].index >= 0 && list[i].ready && this.readyFlag !== list[i].index) {
        this.readyFlag = list[i].index;
        pushChip(this.chips, 'Order ready. Tap the card.', C.ok);
        sfx('ui', 0.6);
        return;
      }
    }
  };

  PlayScene.prototype.showBanner = function (title, sub, hold) {
    this.bannerTitle = title;
    this.bannerSub = sub;
    this.bannerT = hold || 2;
    this.bannerMax = this.bannerT;
  };

  PlayScene.prototype.startCoach = function () {
    var line = '';
    if (save.tutorial === 0) line = 'Tap the tide pool to draw a piece.';
    else if (save.tutorial === 1) line = 'Drag one piece onto its match to merge.';
    else if (save.tutorial === 2) line = 'Fill the order card, then tap it to deliver.';
    else if (save.done < ORDERS.length) {
      var list = activeOrders();
      if (list.length) line = ORDERS[list[0]].who + ' wants ' + ORDERS[list[0]].title.toLowerCase() + '.';
    } else line = 'The cove is restored. Bubble Storm waits in the menu.';
    if (!line) return;
    this.coach = line;
    this.coachT = 3.4;
  };

  /* ------------------------------------------------------ play sim + view */
  PlayScene.prototype.update = function (time, delta) {
    var dt = Math.min(delta, 50) / 1000, guard = 0;
    if (this.paused || (kit && kit.paused)) { this.acc = 0; return; }
    var juice = kit && kit.juice ? kit.juice.frame() : { dx: 0, dy: 0, frozen: false };
    this.shakeX = motionOn() ? clamp(juice.dx, -5, 5) : 0;
    this.shakeY = motionOn() ? clamp(juice.dy, -5, 5) : 0;
    if (juice.frozen) return;
    this.acc += dt;
    if (this.acc > STEP * 6) this.acc = STEP * 6;   /* the clock never outruns the sim */
    while (this.acc >= STEP && guard < 6) { this.stepSim(STEP); this.acc -= STEP; guard++; }
  };

  PlayScene.prototype.stepSim = function (dt) {
    var i, ids = ['tide', 'wreck'], id;
    this.clock += dt;
    this.regenT = (this.regenT || 0) + dt;
    if (this.regenT >= PRODUCER_REGEN) {
      this.regenT -= PRODUCER_REGEN;
      for (i = 0; i < 2; i++) {
        id = ids[i];
        if (save.energy[id] < PRODUCER_MAX) {
          save.energy[id]++;
          if (save.energy[id] === PRODUCER_MAX) save.recovery[id] = 0;
          persist();
        }
      }
    }
    if (this.coachT > 0) this.coachT -= dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.resolveT > 0) this.resolveT -= dt;
    if (this.selT > 0) { this.selT -= dt; if (this.selT <= 0 && this.selState === 'invalid') this.selState = 'ready'; }
    if (this.combo && this.clock - this.lastMerge > 2.5) this.combo = 0;
    this.selPhase = (this.selPhase || 0) + dt * 2.4;
    for (i = 0; i < CELLS; i++) {
      var v = this.view[i];
      v.x += (cellX(i) - v.x) * Math.min(1, dt * 16);
      v.y += (cellY(i) - v.y) * Math.min(1, dt * 16);
      if (v.pop > 0) v.pop = Math.max(0, v.pop - dt * 3.4);
    }
    this.prodTide.pop = Math.max(0, this.prodTide.pop - dt * 3);
    this.prodWreck.pop = Math.max(0, this.prodWreck.pop - dt * 3);
    for (i = 0; i < this.cards.length; i++) {
      if (this.cards[i].pulse > 0) this.cards[i].pulse -= dt;
    }
    stepChips(this.chips, dt);
    stepPool(this.fxFrag, dt);
    stepPool(this.fxStreak, dt);
    stepPool(this.fxReward, dt);
    stepPool(this.fxMote, dt);
    this.moteT += dt;
    if (this.moteT > 1.4) {
      this.moteT = 0;
      if (motionOn()) {
        emit(this.fxMote, 20 + Math.random() * (W - 40), 196, 1,
          { speed: 12, life: 3.2, gravity: -6, scale: 0.7, scaleEnd: 0.1 });
      }
    }
    this.applyForce();
    this.pubT = (this.pubT || 0) + dt;
    if (this.pubT >= 0.25) { this.pubT = 0; this.publishState(); }
  };

  PlayScene.prototype.applyForce = function () {
    var hook = root.__dc, mode, stage;
    if (!hook) return;
    mode = hook.forceMode;
    if (mode && mode !== this.mode) {
      hook.forceMode = null;
      if (mode === 'storm') { this.scene.start('storm'); return; }
      if (mode === 'title') { this.scene.start('title'); return; }
      if (mode === 'log') { this.scene.start('log', { from: 'play' }); return; }
    }
    stage = hook.forceStage;
    if (stage != null) {
      hook.forceStage = null;
      var want = clamp(finiteInt(stage, 0, 0, AREAS.length - 1), 0, AREAS.length - 1);
      if (want !== save.area) {
        var target = 0, i;
        for (i = 0; i < want; i++) { target += AREA_ORDERS[i]; save.cleared[i] = AREA_ORDERS[i]; }
        save.done = Math.max(save.done, target);
        save.area = want;
        save.chapter = clamp(want + 1, 1, 5);
        this.trayDirty = true;
        this.sceneryArea = -1;
        this.refreshScenery(true);
        setTextIfChanged(this.areaText, AREAS[save.area].name);
        if (kit) kit.audio.music(AREAS[save.area].music, 600);
        persist();
      }
    }
  };

  /* State is written straight into the hook object: no per frame literals,
   * no per frame array allocation (GC churn showed up as frame spikes). */
  PlayScene.prototype.publishState = function () {
    var s = root.__dc.state, i, notes = 0;
    for (i = 0; i < save.notes.length; i++) if (save.notes[i]) notes++;
    s.mode = this.paused ? 'paused' : 'play';
    s.scene = 'play';
    s.stage = save.area;
    s.stageName = AREAS[save.area].name;
    s.area = save.area;
    s.chapter = save.chapter;
    s.orders = save.done;
    s.progress = Math.round((save.done / ORDERS.length) * 1000) / 1000;
    s.score = save.fragments;
    s.health = Math.round(((save.energy.tide + save.energy.wreck) / (PRODUCER_MAX * 2)) * 100) / 100;
    s.energy = save.energy.tide + save.energy.wreck;
    s.merges = save.merges;
    s.items = countItems(save);
    s.notes = notes;
    s.stormBest = save.stormBest;
    s.ready = true;
  };

  PlayScene.prototype.render = function () {
    var i, v, cell, card, list, gap, o, ready, sx = this.shakeX || 0, sy = this.shakeY || 0;
    this.board.setPosition(BOARD_X + BOARD_W / 2 + sx, BOARD_Y + BOARD_H / 2 - 8 + sy);
    for (i = 0; i < CELLS; i++) {
      v = this.view[i];
      cell = save.board[i];
      var sprite = this.items[i];
      if (cell) {
        setTextureIfChanged(sprite, itemKey(cell.k, cell.t));
        var pop = 1 + v.pop * 0.28;
        var dragging = this.drag && this.drag.from === i;
        setVisibleIfChanged(sprite, !dragging);
        sprite.setPosition(v.x + sx, v.y + sy).setScale(pop).setAlpha(1);
      } else if (sprite.visible) sprite.setVisible(false);
      var fog = this.fogs[i];
      var wantFog = !!save.fog[i];
      setVisibleIfChanged(fog, wantFog);
      if (wantFog) fog.setPosition(cellX(i) + sx, cellY(i) + sy);
    }

    /* player entity: Ready, Preview, Goal, Invalid, Resolve */
    var selCell = this.drag ? this.dragTarget : (this.resolveT > 0 ? this.resolveCell : this.cursor);
    var selKey = 'dc_ring_ready', show = true, scale = 1;
    if (this.drag && this.dragTarget >= 0) {
      var src = save.board[this.drag.from], dst = save.board[this.dragTarget];
      if (this.dragTarget === this.drag.from) selKey = 'dc_ring_ready';
      else if (save.fog[this.dragTarget]) selKey = 'dc_ring_bad';
      else if (!dst) selKey = 'dc_ring_ok';
      else if (src && dst && src.k === dst.k && src.t === dst.t && src.t < MAX_TIER) {
        selKey = this.wantsItem(src.k, src.t + 1) ? 'dc_ring_goal' : 'dc_ring_ok';
      } else selKey = 'dc_ring_bad';
    } else if (this.selState === 'invalid') selKey = 'dc_ring_bad';
    else if (this.resolveT > 0) {
      selKey = 'dc_ring_goal';
      scale = 1 + Math.max(0, this.resolveT) * 0.5;
    } else if (this.keyPick != null && this.keyPick >= 0) selKey = 'dc_ring_ok';
    else {
      scale = motionOn() ? 1 + Math.sin(this.selPhase || 0) * 0.02 : 1;
      show = !!save.board[this.cursor] || (this.keyPick != null && this.keyPick >= 0);
    }
    if (selCell < 0) show = false;
    setVisibleIfChanged(this.selector, show);
    if (show) {
      setTextureIfChanged(this.selector, selKey);
      this.selector.setPosition(cellX(selCell) + sx, cellY(selCell) + sy).setScale(scale);
    }
    setVisibleIfChanged(this.ghost, !!this.drag && this.dragTarget >= 0 && this.dragTarget !== this.drag.from);
    if (this.ghost.visible) this.ghost.setPosition(cellX(this.dragTarget) + sx, cellY(this.dragTarget) + sy);
    var dragging2 = !!this.drag && !!save.board[this.drag.from];
    setVisibleIfChanged(this.dragSprite, dragging2);
    if (dragging2) {
      var d = save.board[this.drag.from];
      setTextureIfChanged(this.dragSprite, itemKey(d.k, d.t));
      this.dragSprite.setPosition(this.drag.x, this.drag.y - 22).setScale(1.12).setAlpha(0.96);
    }

    /* HUD */
    setTextIfChanged(this.fragText, save.fragments);
    setTextIfChanged(this.areaText, AREAS[save.area].name);
    setTextIfChanged(this.subText, 'Chapter ' + save.chapter + '   Orders ' + save.done + '/' + ORDERS.length);

    /* order tray, recomputed only when the board changed */
    if (this.trayDirty) this.refreshTray();
    for (i = 0; i < this.cards.length; i++) {
      card = this.cards[i];
      var slotState = this.tray[i];
      card.index = slotState.index;
      o = card.index >= 0 ? ORDERS[card.index] : null;
      var vis = !!o;
      setVisibleIfChanged(card.bg, vis);
      setVisibleIfChanged(card.who, vis);
      setVisibleIfChanged(card.icon, vis);
      setVisibleIfChanged(card.count, vis);
      setVisibleIfChanged(card.stepFrom, vis);
      setVisibleIfChanged(card.arrow, vis);
      setVisibleIfChanged(card.need, vis);
      setVisibleIfChanged(card.ready, vis);
      if (!o) continue;
      ready = slotState.ready;
      setTextureIfChanged(card.bg, ready ? 'dc_card_done' : 'dc_card');
      setTextIfChanged(card.who, o.who);
      setTextIfChanged(card.ready, ready ? 'READY' : '');
      setTextureIfChanged(card.icon, itemKey(slotState.k, slotState.t));
      setTextIfChanged(card.count, slotState.label);
      setColorIfChanged(card.count, ready ? C.ok : C.paper);
      if (!ready && slotState.t > 0) {
        setVisibleIfChanged(card.stepFrom, true);
        setTextureIfChanged(card.stepFrom, itemKey(slotState.k, slotState.t - 1));
        setTextIfChanged(card.arrow, '+');
        setTextIfChanged(card.need, 'x' + slotState.prevNeed);
        setColorIfChanged(card.need, C.gold);
      } else {
        setVisibleIfChanged(card.stepFrom, false);
        setTextIfChanged(card.arrow, '');
        setTextIfChanged(card.need, ready ? 'TAP' : '');
        setColorIfChanged(card.need, C.ok);
      }
    }

    /* producers */
    this.paintProducer(this.prodTide, 'tide', sx, sy);
    this.paintProducer(this.prodWreck, 'wreck', sx, sy);

    /* thin coach strip, one line, fades */
    var coachOn = this.coachT > 0 && this.bannerT <= 0 && !this.chips.current;
    setVisibleIfChanged(this.coachBg, coachOn);
    setVisibleIfChanged(this.coachText, coachOn);
    if (coachOn) {
      var f = clamp(this.coachT / 1.2, 0, 1);
      this.coachBg.setAlpha(0.86 * f);
      this.coachText.setAlpha(f);
      setTextIfChanged(this.coachText, this.coach);
    }

    /* run boundary banner */
    var bannerOn = this.bannerT > 0;
    setVisibleIfChanged(this.bannerBg, bannerOn);
    setVisibleIfChanged(this.bannerText, bannerOn);
    setVisibleIfChanged(this.bannerSubText, bannerOn);
    if (bannerOn) {
      var age = (this.bannerMax - this.bannerT);
      var pop = motionOn() ? 1 + Math.max(0, 0.22 - age) * 1.1 : 1;
      var fade = clamp(this.bannerT / 0.4, 0, 1);
      this.bannerBg.setScale(pop).setAlpha(fade);
      this.bannerText.setAlpha(fade);
      this.bannerSubText.setAlpha(fade);
      setTextIfChanged(this.bannerText, this.bannerTitle);
      setTextIfChanged(this.bannerSubText, this.bannerSub);
    }
  };

  PlayScene.prototype.refreshTray = function () {
    var list = activeOrders(), i, slot, gap, o;
    this.trayDirty = false;
    for (i = 0; i < 3; i++) {
      slot = this.tray[i];
      slot.index = i < list.length ? list[i] : -1;
      if (slot.index < 0) { slot.ready = false; slot.label = ''; continue; }
      o = ORDERS[slot.index];
      slot.ready = orderReady(slot.index);
      gap = orderGap(slot.index);
      if (gap && !gap.done) {
        slot.k = gap.k; slot.t = gap.t;
        slot.label = Math.min(gap.have, gap.need) + '/' + gap.need;
        slot.prevNeed = Math.max(2, gap.prevNeed || 2);
      } else {
        slot.k = o.want[0][0]; slot.t = o.want[0][1];
        slot.label = o.want[0][2] + '/' + o.want[0][2];
        slot.prevNeed = 2;
      }
    }
  };

  PlayScene.prototype.wantsItem = function (k, t) {
    var i, j, o, slot;
    for (i = 0; i < 3; i++) {
      slot = this.tray[i];
      if (slot.index < 0) continue;
      o = ORDERS[slot.index];
      for (j = 0; j < o.want.length; j++) if (o.want[j][0] === k && o.want[j][1] === t) return true;
    }
    return false;
  };

  PlayScene.prototype.paintProducer = function (p, id, sx, sy) {
    var i, charges = save.energy[id];
    setTextureIfChanged(p.bg, charges > 0 ? 'dc_prod' : 'dc_prod_rest');
    p.bg.setScale(1 + p.pop * 0.05);
    for (i = 0; i < p.pips.length; i++) {
      p.pips[i].setAlpha(i < charges ? 1 : 0.22).setScale(i < charges ? 1.1 : 0.8);
    }
    if (charges > 0) {
      setTextIfChanged(p.state, 'DRAW  ' + charges + '/' + PRODUCER_MAX);
      setColorIfChanged(p.state, C.aqua);
    } else {
      setTextIfChanged(p.state, 'RESTING  ' + save.recovery[id] + '/' + RECOVERY_MERGES);
      setColorIfChanged(p.state, C.bad);
    }
  };

  /* --------------------------------------------------------- boot scene */
  function BootScene() { PhaserRef.Scene.call(this, { key: 'boot' }); }
  BootScene.prototype = Object.create(PhaserRef.Scene.prototype);
  BootScene.prototype.constructor = BootScene;
  BootScene.prototype.create = function () {
    var self = this;
    Game.active = this;
    publish({ mode: 'boot', scene: 'boot', ready: false });
    if (kit) kit.loader.show('Driftwood Cove');
    var progress = 0;
    function step(f) {
      progress = Math.max(progress, f * 0.6);
      if (kit) kit.loader.progress(progress);
    }
    bakeAll(this, step);
    if (kit) kit.loader.progress(0.65);
    /* pre-warm every baked texture and pre-decode audio before the first
     * frame so nothing hitches mid gameplay */
    var warm = this.add.container(-400, -400), k, t;
    for (k = 0; k < CHAINS.length; k++) {
      for (t = 0; t <= MAX_TIER; t++) warm.add(this.add.image(0, 0, itemKey(k, t)));
    }
    warm.add(this.add.image(0, 0, 'dc_board'));
    warm.add(this.add.image(0, 0, 'dc_fog'));
    warm.add(this.add.image(0, 0, 'dc_bubble'));
    warm.add(this.add.image(0, 0, 'dc_title_art'));
    this.warm = warm;
    var audioReady = kit ? kit.audio.preload([
      'ui', 'pick', 'drop', 'invalid', 'merge', 'mergebig', 'chain', 'spawn', 'bubble', 'order', 'chapter', 'fanfare'
    ]) : Promise.resolve();
    audioReady.then(function () {
      if (kit) kit.loader.progress(1);
      self.time.delayedCall(60, function () {
        warm.destroy(true);
        if (kit) kit.loader.hide();
        var mode = root.__dc.forceMode;
        root.__dc.forceMode = null;
        if (mode === 'storm') self.scene.start('storm');
        else if (mode === 'log') self.scene.start('log', { from: 'title' });
        else if (mode === 'play') self.scene.start('play');
        else self.scene.start('title');
      });
    });
    if (kit) kit.registerPWA();
  };

  /* -------------------------------------------------------- title scene */
  function TitleScene() { PhaserRef.Scene.call(this, { key: 'title' }); }
  TitleScene.prototype = Object.create(PhaserRef.Scene.prototype);
  TitleScene.prototype.constructor = TitleScene;
  TitleScene.prototype.create = function () {
    var self = this, i;
    Game.active = this;
    this.buttons = [];
    this.add.rectangle(W / 2, H / 2, W, H, 0x071923).setDepth(0);
    this.add.image(W / 2, 160, 'dc_title_art').setDepth(1);
    this.add.rectangle(W / 2, 300, W, 92, 0x071923, 0.75).setDepth(2);
    makeText(this, W / 2, 262, 'Driftwood Cove', 30, C.paper, 0.5, '800').setDepth(3);
    makeText(this, W / 2, 296, 'A merge board mystery', 15, C.aqua, 0.5, '600').setDepth(3);
    var started = save.done > 0 || save.merges > 0;
    var rows = [
      [started ? 'Continue the cove' : 'Enter the cove', 'dc_btn_hero', '#0C2530', function () { self.scene.start('play'); }],
      ['Bubble Storm', 'dc_btn', C.paper, function () { self.scene.start('storm'); }],
      ['Keeper log', 'dc_btn', C.paper, function () { self.scene.start('log', { from: 'title' }); }],
      ['Settings', 'dc_btn', C.paper, function () { if (kit) kit.openSettings(); }]
    ];
    for (i = 0; i < rows.length; i++) {
      var y = 400 + i * 74;
      this.add.image(W / 2, y, rows[i][1]).setDepth(4);
      makeText(this, W / 2, y - 2, rows[i][0], 18, rows[i][2], 0.5, '750').setDepth(5);
      this.buttons.push({ x: W / 2 - 140, y: y - 28, w: 280, h: 56, fn: rows[i][3] });
    }
    var found = 0;
    for (i = 0; i < save.notes.length; i++) if (save.notes[i]) found++;
    makeText(this, W / 2, 712, 'Orders ' + save.done + '/' + ORDERS.length +
      '   Notes ' + found + '/' + NOTES.length + '   Storm best ' + save.stormBest, 13, C.muted, 0.5, '600').setDepth(5);
    var resetY = 762;
    this.add.image(W / 2, resetY, 'dc_btn_small').setDepth(4);
    makeText(this, W / 2, resetY - 2, 'New cove', 14, C.bad, 0.5, '700').setDepth(5);
    this.buttons.push({ x: W / 2 - 48, y: resetY - 23, w: 96, h: 46, fn: function () { self.confirmReset(); } });
    this.confirmT = 0;
    this.confirmText = makeText(this, W / 2, 800, '', 13, C.bad, 0.5, '650').setDepth(5);

    this.input.on('pointerdown', function (p) {
      var b = self.hit(p.worldX, p.worldY);
      if (b) { sfx('ui', 0.6); b.fn(); }
    });
    this.input.keyboard.on('keydown', function (e) {
      if (e.code === 'Enter' || e.code === 'Space') { sfx('ui', 0.6); self.scene.start('play'); }
      else if (e.code === 'KeyB') self.scene.start('storm');
      else if (e.code === 'KeyL') self.scene.start('log', { from: 'title' });
    });
    if (kit) kit.audio.music('cove', 900);
    publish({ mode: 'title', scene: 'title', stage: save.area, stageName: AREAS[save.area].name,
      area: save.area, chapter: save.chapter, progress: Math.round((save.done / ORDERS.length) * 1000) / 1000,
      score: save.fragments, orders: save.done, stormBest: save.stormBest, ready: true });
    this.sys.events.on('prerender', this.render, this);
    this.sys.events.once('shutdown', function () { self.sys.events.off('prerender', self.render, self); });
  };
  TitleScene.prototype.hit = function (px, py) {
    for (var i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  };
  TitleScene.prototype.confirmReset = function () {
    if (this.confirmT > 0) {
      save = freshSave();
      persist();
      setTextIfChanged(this.confirmText, 'The cove is new again.');
      this.confirmT = 0;
      sfx('chapter', 0.7);
      this.scene.restart();
      return;
    }
    this.confirmT = 4;
    setTextIfChanged(this.confirmText, 'Tap again to erase this cove.');
  };
  TitleScene.prototype.render = function () {
    if (handleForce(this, 'title')) return;
    if (this.confirmT > 0) {
      this.confirmT -= 1 / 60;
      if (this.confirmT <= 0) setTextIfChanged(this.confirmText, '');
    }
  };

  /* ---------------------------------------------------------- log scene */
  function LogScene() { PhaserRef.Scene.call(this, { key: 'log' }); }
  LogScene.prototype = Object.create(PhaserRef.Scene.prototype);
  LogScene.prototype.constructor = LogScene;
  LogScene.prototype.create = function (data) {
    var self = this, i;
    Game.active = this;
    this.from = (data && data.from) || 'title';
    this.page = 0;
    this.buttons = [];
    this.add.rectangle(W / 2, H / 2, W, H, 0x0C2530).setDepth(0);
    makeText(this, 20, 40, 'Keeper log', 24, C.paper, 0, '800').setDepth(2);
    this.sub = makeText(this, 20, 68, '', 13, C.muted, 0, '600').setDepth(2);
    this.rows = [];
    for (i = 0; i < 4; i++) {
      var y = 130 + i * 148;
      this.rows.push({
        bg: this.add.image(W / 2, y + 50, 'dc_panel').setDepth(2).setDisplaySize(350, 132),
        title: makeText(this, 36, y + 14, '', 16, '#2B2D42', 0, '800').setDepth(3),
        body: makeText(this, 36, y + 62, '', 13, '#4A4A58', 0, '500').setDepth(3),
        tag: makeText(this, 354, y + 14, '', 12, '#8A6A3A', 1, '700').setDepth(3)
      });
      this.rows[i].body.setWordWrapWidth(318);
      this.rows[i].body.setOrigin(0, 0.5);
      this.rows[i].title.setOrigin(0, 0.5);
    }
    var backY = 782;
    this.add.image(88, backY, 'dc_btn_small').setDepth(4);
    makeText(this, 88, backY - 2, 'Back', 15, C.paper, 0.5, '700').setDepth(5);
    this.buttons.push({ x: 40, y: backY - 23, w: 96, h: 46,
      fn: function () { self.scene.start(self.from === 'play' ? 'play' : 'title'); } });
    this.add.image(200, backY, 'dc_btn_small').setDepth(4);
    makeText(this, 200, backY - 2, 'Prev', 15, C.paper, 0.5, '700').setDepth(5);
    this.buttons.push({ x: 152, y: backY - 23, w: 96, h: 46, fn: function () { self.turn(-1); } });
    this.add.image(312, backY, 'dc_btn_small').setDepth(4);
    makeText(this, 312, backY - 2, 'Next', 15, C.paper, 0.5, '700').setDepth(5);
    this.buttons.push({ x: 264, y: backY - 23, w: 96, h: 46, fn: function () { self.turn(1); } });

    this.input.on('pointerdown', function (p) {
      for (var i2 = 0; i2 < self.buttons.length; i2++) {
        var b = self.buttons[i2];
        if (p.worldX >= b.x && p.worldX <= b.x + b.w && p.worldY >= b.y && p.worldY <= b.y + b.h) {
          sfx('ui', 0.55); b.fn(); return;
        }
      }
    });
    this.input.keyboard.on('keydown', function (e) {
      if (e.code === 'Escape' || e.code === 'Backspace') self.scene.start(self.from === 'play' ? 'play' : 'title');
      else if (e.code === 'ArrowRight') self.turn(1);
      else if (e.code === 'ArrowLeft') self.turn(-1);
    });
    this.paint();
    publish({ mode: 'log', scene: 'log', ready: true });
    this.sys.events.on('prerender', this.watch, this);
    this.sys.events.once('shutdown', function () { self.sys.events.off('prerender', self.watch, self); });
  };
  LogScene.prototype.watch = function () { handleForce(this, 'log'); };
  LogScene.prototype.turn = function (dir) {
    var pages = Math.ceil(NOTES.length / 4);
    this.page = clamp(this.page + dir, 0, pages - 1);
    this.paint();
  };
  LogScene.prototype.paint = function () {
    var i, index, note, found = 0;
    for (i = 0; i < save.notes.length; i++) if (save.notes[i]) found++;
    setTextIfChanged(this.sub, found + ' of ' + NOTES.length + ' scraps recovered   page ' + (this.page + 1) + ' of ' + Math.ceil(NOTES.length / 4));
    for (i = 0; i < this.rows.length; i++) {
      index = this.page * 4 + i;
      note = NOTES[index];
      if (!note) {
        setVisibleIfChanged(this.rows[i].bg, false);
        setTextIfChanged(this.rows[i].title, '');
        setTextIfChanged(this.rows[i].body, '');
        setTextIfChanged(this.rows[i].tag, '');
        continue;
      }
      setVisibleIfChanged(this.rows[i].bg, true);
      if (save.notes[index]) {
        setTextIfChanged(this.rows[i].title, note.title);
        setTextIfChanged(this.rows[i].body, note.text);
        setTextIfChanged(this.rows[i].tag, 'Chapter ' + note.ch);
      } else {
        setTextIfChanged(this.rows[i].title, 'Not yet found');
        setTextIfChanged(this.rows[i].body, 'Deliver two more orders in chapter ' + note.ch + ' to recover this scrap.');
        setTextIfChanged(this.rows[i].tag, 'Chapter ' + note.ch);
      }
    }
  };

  /* --------------------------------------------------------- storm scene */
  function StormScene() { PhaserRef.Scene.call(this, { key: 'storm' }); }
  StormScene.prototype = Object.create(PhaserRef.Scene.prototype);
  StormScene.prototype.constructor = StormScene;
  var STORM_TOP = 120, STORM_BOTTOM = 720;

  StormScene.prototype.create = function () {
    var self = this, i;
    Game.active = this;
    this.acc = 0;
    this.clock = 0;
    this.left = STORM_SECONDS;
    this.score = 0;
    this.combo = 0;
    this.lastMerge = -9;
    this.sel = -1;
    this.phase = 'count';
    this.countT = 2.2;
    this.spawnT = 0;
    this.cursorX = W / 2;
    this.cursorY = 460;
    this.buttons = [];
    this.pool = producerPool('tide').concat(producerPool('wreck'));
    if (!this.pool.length) this.pool = [0, 1, 2];

    this.add.rectangle(W / 2, H / 2, W, H, 0x0A2029).setDepth(0);
    this.add.image(W / 2, 125, 'dc_scene_' + clamp(save.area, 0, AREAS.length - 1)).setDepth(1).setAlpha(0.65);
    this.add.image(W / 2, (STORM_TOP + STORM_BOTTOM) / 2, 'dc_storm_bg').setDepth(2);

    this.add.rectangle(W / 2, 25, W, 50, 0x071923, 0.92).setDepth(20);
    makeText(this, 14, 18, 'Bubble Storm', 17, C.paper, 0, '800').setDepth(21);
    this.subText = makeText(this, 14, 37, 'Best ' + save.stormBest, 13, C.muted, 0, '600').setDepth(21);
    this.timeText = makeText(this, 300, 18, '', 17, C.gold, 0.5, '800').setDepth(21);
    this.scoreText = makeText(this, 300, 38, '', 14, C.paper, 0.5, '700').setDepth(21);
    this.exitBtn = this.add.image(366, 25, 'dc_icon_btn').setDepth(21).setDisplaySize(46, 46);
    makeText(this, 366, 24, 'X', 16, C.paper, 0.5, '800').setDepth(22);
    this.buttons.push({ x: 343, y: 2, w: 46, h: 46, fn: function () { self.finish(true); } });

    this.bubbles = [];
    for (i = 0; i < 18; i++) {
      this.bubbles.push({
        live: false, x: 0, y: 0, vy: 0, wob: 0, k: 0, t: 0, pop: 0,
        shell: this.add.image(-99, -99, 'dc_bubble').setDepth(10).setVisible(false),
        item: this.add.image(-99, -99, itemKey(0, 0)).setDepth(11).setVisible(false)
      });
    }
    this.ring = this.add.image(-99, -99, 'dc_ring_ok').setDepth(12).setVisible(false);
    this.cursor = this.add.image(this.cursorX, this.cursorY, 'dc_ring_ready').setDepth(12).setVisible(false).setAlpha(0.5);

    this.fxFrag = makePool(this, 'dc_frag', 16, 14);
    this.fxStreak = makePool(this, 'dc_spark', 14, 14, true);
    this.fxReward = makePool(this, 'dc_conf', 20, 30);
    this.fxMote = makePool(this, 'dc_mote', 12, 3);
    this.moteT = 0;
    this.chips = makeChips(this, W / 2, 74, 26);

    this.coachBg = this.add.image(W / 2, STORM_TOP + 26, 'dc_strip').setDepth(26).setVisible(false);
    this.coachText = makeText(this, W / 2, STORM_TOP + 25, '', 14, '#243A44', 0.5, '700').setDepth(27).setVisible(false);
    this.coachT = 3.6;
    this.coach = 'Tap two matching bubbles to merge them.';

    this.bannerBg = this.add.image(W / 2, 420, 'dc_banner').setDepth(40).setVisible(false);
    this.bannerText = makeText(this, W / 2, 398, '', 22, '#2B2D42', 0.5, '800').setDepth(41).setVisible(false);
    this.bannerSub = makeText(this, W / 2, 430, '', 14, '#5A5B6B', 0.5, '600').setDepth(41).setVisible(false);

    this.againBtn = this.add.image(W / 2, 560, 'dc_btn_hero').setDepth(41).setVisible(false);
    this.againText = makeText(this, W / 2, 558, 'Storm again', 18, '#0C2530', 0.5, '750').setDepth(42).setVisible(false);
    this.leaveBtn = this.add.image(W / 2, 634, 'dc_btn').setDepth(41).setVisible(false);
    this.leaveText = makeText(this, W / 2, 632, 'Back to the cove', 18, C.paper, 0.5, '750').setDepth(42).setVisible(false);

    this.input.on('pointerdown', function (p) { self.onDown(p); });
    this.input.keyboard.on('keydown', function (e) { self.onKey(e); });
    this.sys.events.on('prerender', this.render, this);
    this.sys.events.once('shutdown', function () { self.sys.events.off('prerender', self.render, self); });
    if (kit) kit.audio.music('storm', 600);
    publish({ mode: 'storm', scene: 'storm', stage: save.area, stageName: 'Bubble Storm',
      score: 0, progress: 0, health: 1, ready: true });
    this.render();
  };

  StormScene.prototype.spawn = function () {
    var i, b = null;
    for (i = 0; i < this.bubbles.length; i++) if (!this.bubbles[i].live) { b = this.bubbles[i]; break; }
    if (!b) return;
    b.live = true;
    b.x = 44 + Math.random() * (W - 88);
    b.y = STORM_BOTTOM + 20;
    b.vy = -(30 + Math.random() * 16 + this.clock * 0.22);
    b.wob = Math.random() * TAU;
    b.k = this.pool[Math.floor(Math.random() * this.pool.length)];
    b.t = Math.random() < 0.22 ? 1 : 0;
    b.pop = 0.4;
  };

  StormScene.prototype.bubbleAt = function (px, py) {
    var i, b, best = -1, bestD = 46 * 46;
    for (i = 0; i < this.bubbles.length; i++) {
      b = this.bubbles[i];
      if (!b.live) continue;
      var dx = b.x - px, dy = b.y - py, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  StormScene.prototype.onDown = function (p) {
    var i, b = null;
    for (i = 0; i < this.buttons.length; i++) {
      var t = this.buttons[i];
      if (p.worldX >= t.x && p.worldX <= t.x + t.w && p.worldY >= t.y && p.worldY <= t.y + t.h) { sfx('ui', 0.6); t.fn(); return; }
    }
    if (this.phase === 'done') {
      if (p.worldY > 532 && p.worldY < 588) { sfx('ui', 0.6); this.scene.restart(); return; }
      if (p.worldY > 606 && p.worldY < 662) { sfx('ui', 0.6); this.scene.start('play'); return; }
      return;
    }
    if (this.phase !== 'run') return;
    b = this.bubbleAt(p.worldX, p.worldY);
    this.pick(b);
  };

  StormScene.prototype.onKey = function (e) {
    if (!e || !e.code) return;
    if (e.code === 'Escape') { this.finish(true); return; }
    if (this.phase === 'done') {
      if (e.code === 'Enter' || e.code === 'Space') this.scene.restart();
      else if (e.code === 'Backspace') this.scene.start('play');
      return;
    }
    if (this.phase !== 'run') return;
    var stepPx = 34;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cursorX = clamp(this.cursorX - stepPx, 20, W - 20);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cursorX = clamp(this.cursorX + stepPx, 20, W - 20);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.cursorY = clamp(this.cursorY - stepPx, STORM_TOP, STORM_BOTTOM);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.cursorY = clamp(this.cursorY + stepPx, STORM_TOP, STORM_BOTTOM);
    else if (e.code === 'Space' || e.code === 'Enter') this.pick(this.bubbleAt(this.cursorX, this.cursorY));
    this.cursor.setVisible(true);
  };

  StormScene.prototype.pick = function (index) {
    var a, b;
    if (index < 0) { this.sel = -1; return; }
    if (this.sel < 0) {
      this.sel = index;
      sfx('pick', 0.5);
      return;
    }
    if (this.sel === index) { this.sel = -1; return; }
    a = this.bubbles[this.sel]; b = this.bubbles[index];
    if (!a.live || !b.live || a.k !== b.k || a.t !== b.t || a.t >= MAX_TIER) {
      sfx('invalid', 0.5);
      this.sel = index;
      return;
    }
    a.live = false;
    b.t += 1;
    b.pop = 1;
    var gain = 15 * (b.t * b.t);
    this.combo = (this.clock - this.lastMerge) < 2 ? this.combo + 1 : 1;
    this.lastMerge = this.clock;
    gain = Math.round(gain * (1 + Math.min(4, this.combo - 1) * 0.35));
    this.score += gain;
    this.sel = -1;
    var accent = PhaserRef.Display.Color.HexStringToColor(chainOf(b.k).edge).color;
    emit(this.fxFrag, b.x, b.y, 6, { speed: 120, life: 0.5, tint: accent });
    emit(this.fxStreak, a.x, a.y, 4, { speed: 140, life: 0.32, gravity: 0 });
    if (b.t >= MAX_TIER) {
      sfx('chain', 0.9);
      emit(this.fxReward, b.x, b.y, 14, { speed: 200, life: 0.85, lift: 60 });
      pushChip(this.chips, itemName(b.k, b.t) + '  +' + gain, C.gold);
      this.left = Math.min(STORM_SECONDS, this.left + 3);
      hitStop(70); shake(5, 200);
      b.live = false;
    } else {
      sfx(this.combo >= 3 ? 'mergebig' : 'bubble', 0.8, 1 + b.t * 0.06);
      if (this.combo >= 3) pushChip(this.chips, 'Chain x' + this.combo + '  +' + gain, C.aqua);
      hitStop(40);
      if (this.combo >= 2) shake(2.5, 140);
    }
  };

  StormScene.prototype.finish = function (early) {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.sel = -1;
    var best = this.score > save.stormBest;
    if (best) save.stormBest = this.score;
    save.fragments = Math.min(9999999, save.fragments + Math.floor(this.score / 10));
    persist();
    sfx(early ? 'ui' : 'fanfare', 0.9);
    if (!early) emit(this.fxReward, W / 2, 400, 20, { speed: 240, life: 1.1, lift: 80 });
    this.bannerTitle = early ? 'Storm left early' : (best ? 'New storm best' : 'Storm complete');
    this.bannerSubLine = this.score + ' points   ' + Math.floor(this.score / 10) + ' fragments kept';
    publish({ mode: 'storm', scene: 'storm', score: this.score, progress: 1, stormBest: save.stormBest, ended: true });
  };

  StormScene.prototype.update = function (time, delta) {
    var dt = Math.min(delta, 50) / 1000, guard = 0;
    if (kit && kit.paused) { this.acc = 0; return; }
    var juice = kit && kit.juice ? kit.juice.frame() : { dx: 0, dy: 0, frozen: false };
    this.shakeX = motionOn() ? clamp(juice.dx, -5, 5) : 0;
    this.shakeY = motionOn() ? clamp(juice.dy, -5, 5) : 0;
    if (juice.frozen) return;
    this.acc += dt;
    if (this.acc > STEP * 6) this.acc = STEP * 6;
    while (this.acc >= STEP && guard < 6) { this.stepSim(STEP); this.acc -= STEP; guard++; }
  };

  StormScene.prototype.stepSim = function (dt) {
    var i, b;
    this.clock += dt;
    if (this.coachT > 0) this.coachT -= dt;
    stepChips(this.chips, dt);
    stepPool(this.fxFrag, dt);
    stepPool(this.fxStreak, dt);
    stepPool(this.fxReward, dt);
    stepPool(this.fxMote, dt);
    this.moteT += dt;
    if (this.moteT > 0.9 && motionOn()) {
      this.moteT = 0;
      emit(this.fxMote, 20 + Math.random() * (W - 40), STORM_BOTTOM, 1,
        { speed: 8, life: 4, gravity: -8, scale: 0.6, scaleEnd: 0.05 });
    }
    if (this.phase === 'count') {
      this.countT -= dt;
      if (this.countT <= 0) {
        this.phase = 'run';
        sfx('ui', 0.7);
        for (i = 0; i < 7; i++) {
          this.spawn();
          if (this.bubbles[i]) this.bubbles[i].y = STORM_BOTTOM - 40 - i * 74;
        }
      }
      return;
    }
    if (this.phase !== 'run') return;
    this.left -= dt;
    if (this.left <= 0) { this.left = 0; this.finish(false); return; }
    if (this.combo && this.clock - this.lastMerge > 2) this.combo = 0;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.28, 0.55 - this.clock * 0.004);
      this.spawn();
    }
    for (i = 0; i < this.bubbles.length; i++) {
      b = this.bubbles[i];
      if (!b.live) continue;
      b.y += b.vy * dt;
      b.wob += dt * 1.6;
      if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 3);
      if (b.y < STORM_TOP - 10) {
        b.live = false;
        if (this.sel === i) this.sel = -1;
        emit(this.fxStreak, b.x, STORM_TOP, 3, { speed: 60, life: 0.35 });
      }
    }
  };

  StormScene.prototype.render = function () {
    var i, b, sx = this.shakeX || 0, sy = this.shakeY || 0;
    if (handleForce(this, 'storm')) return;
    for (i = 0; i < this.bubbles.length; i++) {
      b = this.bubbles[i];
      setVisibleIfChanged(b.shell, b.live);
      setVisibleIfChanged(b.item, b.live);
      if (!b.live) continue;
      var wobX = Math.sin(b.wob) * 8;
      var scale = (b.t >= 1 ? 0.92 : 0.78) * (1 + b.pop * 0.25);
      b.shell.setPosition(b.x + wobX + sx, b.y + sy).setScale(scale);
      setTextureIfChanged(b.item, itemKey(b.k, b.t));
      b.item.setPosition(b.x + wobX + sx, b.y + sy).setScale(scale * 0.72);
    }
    var selLive = this.sel >= 0 && this.bubbles[this.sel] && this.bubbles[this.sel].live;
    setVisibleIfChanged(this.ring, selLive);
    if (selLive) {
      var s = this.bubbles[this.sel];
      this.ring.setPosition(s.x + Math.sin(s.wob) * 8 + sx, s.y + sy).setScale(0.95);
    }
    this.cursor.setPosition(this.cursorX, this.cursorY);
    setTextIfChanged(this.timeText, Math.ceil(this.left) + 's');
    setColorIfChanged(this.timeText, this.left <= 10 ? C.coral : C.gold);
    setTextIfChanged(this.scoreText, this.score + ' pts');
    setTextIfChanged(this.subText, 'Best ' + save.stormBest);

    var coachOn = this.coachT > 0 && this.phase === 'run' && !this.chips.current;
    setVisibleIfChanged(this.coachBg, coachOn);
    setVisibleIfChanged(this.coachText, coachOn);
    if (coachOn) {
      var f = clamp(this.coachT / 1.2, 0, 1);
      this.coachBg.setAlpha(0.86 * f);
      this.coachText.setAlpha(f).setText(this.coach);
    }

    var bannerOn = this.phase === 'count' || this.phase === 'done';
    setVisibleIfChanged(this.bannerBg, bannerOn);
    setVisibleIfChanged(this.bannerText, bannerOn);
    setVisibleIfChanged(this.bannerSub, bannerOn);
    if (bannerOn) {
      if (this.phase === 'count') {
        setTextIfChanged(this.bannerText, 'Bubble Storm');
        setTextIfChanged(this.bannerSub, Math.ceil(this.countT) + '   merge as fast as you can');
        this.bannerBg.setScale(motionOn() ? 1 + Math.max(0, 0.2 - (2.2 - this.countT)) : 1);
      } else {
        setTextIfChanged(this.bannerText, this.bannerTitle || 'Storm complete');
        setTextIfChanged(this.bannerSub, this.bannerSubLine || '');
        this.bannerBg.setScale(1);
      }
    }
    var done = this.phase === 'done';
    setVisibleIfChanged(this.againBtn, done);
    setVisibleIfChanged(this.againText, done);
    setVisibleIfChanged(this.leaveBtn, done);
    setVisibleIfChanged(this.leaveText, done);
    if (this.phase === 'run') {
      var st = root.__dc.state;
      st.score = this.score;
      st.progress = Math.round((1 - this.left / STORM_SECONDS) * 100) / 100;
      st.health = Math.round((this.left / STORM_SECONDS) * 100) / 100;
    }
  };

  /* ------------------------------------------------------------- boot up */
  root.__dc = root.__dc && typeof root.__dc === 'object' ? root.__dc : {};
  if (!root.__dc.state || typeof root.__dc.state !== 'object') {
    root.__dc.state = {
      mode: 'boot', scene: 'boot', stage: 0, stageName: 'boot', area: 0, chapter: 1,
      orders: 0, progress: 0, score: 0, health: 1, energy: 10, merges: 0, items: 0,
      notes: 0, stormBest: 0, ready: false
    };
  }
  if (!Object.prototype.hasOwnProperty.call(root.__dc, 'forceMode')) root.__dc.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(root.__dc, 'forceStage')) root.__dc.forceStage = null;

  kit = root.GGKit ? root.GGKit.create({
    slug: 'driftwood-cove',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () { if (Game.active) Game.active.acc = 0; },
    onResume: function () { if (Game.active) Game.active.acc = 0; },
    onRestart: function () { if (Game.active && Game.active.scene) Game.active.scene.start('title'); }
  }) : null;

  save = normaliseSave(kit ? kit.save.get(null) : null);
  if (kit) {
    kit.audio.register({
      ui: 'assets/ui.mp3', pick: 'assets/pick.mp3', drop: 'assets/drop.mp3',
      invalid: 'assets/invalid.mp3', merge: 'assets/merge.mp3', mergebig: 'assets/mergebig.mp3',
      chain: 'assets/chain.mp3', spawn: 'assets/spawn.mp3', bubble: 'assets/bubble.mp3',
      order: 'assets/order.mp3', chapter: 'assets/chapter.mp3', fanfare: 'assets/fanfare.mp3',
      cove: 'assets/cove.mp3', deep: 'assets/deep.mp3', storm: 'assets/storm.mp3'
    });
  }

  function start() {
    if (!PhaserRef) return;
    Game.phaser = new PhaserRef.Game({
      type: PhaserRef.AUTO,
      parent: document.body,
      width: W, height: H,
      backgroundColor: '#071923',
      scene: [BootScene, TitleScene, PlayScene, StormScene, LogScene],
      scale: { mode: PhaserRef.Scale.FIT, autoCenter: PhaserRef.Scale.CENTER_BOTH },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 },
      fps: { target: 60, min: 30 },
      audio: { noAudio: true }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
})(typeof window !== 'undefined' ? window : globalThis);
