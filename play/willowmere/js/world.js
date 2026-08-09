/* Willowmere - world: map layout, collision, forage nodes, rendering */
'use strict';

var MW = 780, MH = 1150;
var WATER_Y = 336;                       // lake occupies y < WATER_Y
var DOCK = { x: 356, y: 248, w: 68, h: 132 };
var COTTAGE = { x: 300, y: 398, w: 180, h: 142, door: [390, 546], nm: 'Your Cottage', a: '#c8a878', b: '#8c5a44' };

var BUILDINGS = [
  COTTAGE,
  { x: 60, y: 618, w: 152, h: 112, door: [136, 736], nm: 'Bakery', a: '#e0b48c', b: '#b05a5a' },
  { x: 560, y: 618, w: 160, h: 112, door: [640, 736], nm: 'Boat Shed', a: '#b9a184', b: '#6d7f8c' },
  { x: 70, y: 848, w: 152, h: 112, door: [146, 966], nm: 'Herb Shop', a: '#a8c398', b: '#4f7a52' },
  { x: 540, y: 848, w: 172, h: 112, door: [626, 966], nm: 'Music Hall', a: '#b7a8cf', b: '#5b4a80' }
];

/* forage nodes: k = kind */
var NODES = [
  { k: 'reeds', x: 250, y: 392 }, { k: 'reeds', x: 520, y: 388 }, { k: 'reeds', x: 168, y: 402 },
  { k: 'clay', x: 452, y: 392 }, { k: 'clay', x: 330, y: 400 },
  { k: 'rock', x: 604, y: 420 }, { k: 'rock', x: 262, y: 1062 }, { k: 'rock', x: 702, y: 560 },
  { k: 'log', x: 118, y: 560 }, { k: 'log', x: 742, y: 902 }, { k: 'log', x: 332, y: 1090 },
  { k: 'pine', x: 30, y: 782 }, { k: 'pine', x: 744, y: 700 }, { k: 'pine', x: 58, y: 1048 }, { k: 'pine', x: 740, y: 1080 },
  { k: 'bush', x: 252, y: 600 }, { k: 'bush', x: 482, y: 610 }, { k: 'bush', x: 200, y: 1002 }, { k: 'bush', x: 500, y: 1004 },
  { k: 'moss', x: 120, y: 1102 }, { k: 'moss', x: 622, y: 1100 }
];
var NODEINFO = {
  reeds: { n: 'Reed Bed', c: '#79a95e' },
  clay: { n: 'Clay Bank', c: '#b57a58' },
  rock: { n: 'Stone Pile', c: '#8f9ba7' },
  log: { n: 'Fallen Log', c: '#9c7f5e' },
  pine: { n: 'Pine', c: '#3f7a44' },
  bush: { n: 'Bush', c: '#5f8f4a' },
  moss: { n: 'Moss Patch', c: '#63c9a4' }
};
function nodeYield(kind, season, night) {
  var out = [];
  if (kind === 'reeds') { out.push(['reed', 2]); if (Math.random() < 0.3) out.push(['driftwood', 1]); }
  else if (kind === 'clay') { out.push(['clay', 2]); if (Math.random() < 0.25) out.push(['lakestone', 1]); }
  else if (kind === 'rock') { out.push(['lakestone', 2]); if (Math.random() < 0.3) out.push(['clay', 1]); }
  else if (kind === 'log') { out.push(['driftwood', 2]); if (Math.random() < (season ? 0.55 : 0.25)) out.push(['honeycap', 1]); }
  else if (kind === 'pine') { out.push(['pinecone', 2]); if (night && Math.random() < 0.4) out.push(['glowmoss', 1]); }
  else if (kind === 'bush') { out.push(season ? ['amberleaf', 2] : ['berry', 2]); if (Math.random() < 0.3) out.push(season ? ['honeycap', 1] : ['reed', 1]); }
  else if (kind === 'moss') { out.push(['glowmoss', night ? 2 : 1]); if (season && Math.random() < 0.4) out.push(['amberleaf', 1]); }
  return out;
}

/* decorative trees (fixed, deterministic) */
var TREES = (function () {
  var t = [], s = 20260805;
  function r() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  var lanes = [22, 46, 756, 730];
  for (var y = 470; y < MH - 20; y += 62) {
    for (var i = 0; i < lanes.length; i++) {
      if (r() < 0.6) t.push({ x: lanes[i] + r() * 14 - 7, y: y + r() * 26 - 13, s: 12 + r() * 6 });
    }
  }
  var cl = [[250, 700], [300, 660], [470, 690], [510, 740], [180, 1140], [420, 1120], [560, 1120], [240, 880], [470, 960], [360, 980]];
  for (var j = 0; j < cl.length; j++) t.push({ x: cl[j][0], y: cl[j][1], s: 13 + r() * 5 });
  return t;
})();

function inRect(x, y, r) { return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h; }

function blocked(x, y, rad) {
  if (x < rad + 10 || x > MW - rad - 10 || y > MH - rad - 10 || y < rad + 6) return true;
  // lake (walkable only on the dock)
  if (y < WATER_Y + rad) {
    if (!(x > DOCK.x + rad - 2 && x < DOCK.x + DOCK.w - rad + 2 && y > DOCK.y + rad)) return true;
  }
  for (var i = 0; i < BUILDINGS.length; i++) {
    var b = BUILDINGS[i];
    if (x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad) return true;
  }
  for (var j = 0; j < TREES.length; j++) {
    var t = TREES[j];
    if (dist2(x, y, t.x, t.y + 6) < (rad + 9) * (rad + 9)) return true;
  }
  return false;
}

/* ---------- navigation (static grid + BFS, built once) ---------- */
function makeNav(w, h, cell, solid, rad) {
  var cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  var grid = new Uint8Array(cols * rows);
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      grid[y * cols + x] = solid((x + 0.5) * cell, (y + 0.5) * cell, rad) ? 1 : 0;
    }
  }
  return {
    cols: cols, rows: rows, cell: cell, grid: grid, solid: solid,
    prev: new Int32Array(cols * rows), q: new Int32Array(cols * rows)
  };
}
function navClear(nav, x0, y0, x1, y1) {
  var cell = nav.cell, cols = nav.cols, rows = nav.rows, g = nav.grid;
  var dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  var n = Math.max(1, Math.ceil(d / (cell * 0.5)));
  for (var i = 0; i <= n; i++) {
    var cx = Math.floor((x0 + dx * i / n) / cell), cy = Math.floor((y0 + dy * i / n) / cell);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    if (g[cy * cols + cx]) return false;
  }
  return true;
}
function navPath(nav, sx, sy, tx, ty, rad) {
  var cols = nav.cols, rows = nav.rows, cell = nav.cell, g = nav.grid, prev = nav.prev, q = nav.q;
  var scx = clamp(Math.floor(sx / cell), 0, cols - 1), scy = clamp(Math.floor(sy / cell), 0, rows - 1);
  var tcx = clamp(Math.floor(tx / cell), 0, cols - 1), tcy = clamp(Math.floor(ty / cell), 0, rows - 1);
  prev.fill(-2);
  var head = 0, tail = 0, si = scy * cols + scx;
  prev[si] = -1; q[tail++] = si;
  var found = -1, bestAlt = -1, bestAltD = 1e9;
  while (head < tail) {
    var cur = q[head++];
    var cx = cur % cols, cy = (cur / cols) | 0;
    if (cx === tcx && cy === tcy) { found = cur; break; }
    var dd = (cx - tcx) * (cx - tcx) + (cy - tcy) * (cy - tcy);
    if (dd < bestAltD) { bestAltD = dd; bestAlt = cur; }
    for (var k = 0; k < 4; k++) {
      var nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      var ni = ny * cols + nx;
      if (prev[ni] !== -2 || g[ni]) continue;
      prev[ni] = cur; q[tail++] = ni;
    }
  }
  if (found < 0) {
    if (bestAlt < 0 || bestAltD > 36) return null;   // nothing near the destination
    found = bestAlt;
  }
  var cells = [];
  for (var c = found; c >= 0 && cells.length < 4096; c = prev[c]) { cells.push(c); if (prev[c] === -1) break; }
  cells.reverse();
  var pts = [];
  for (var i = 0; i < cells.length; i++) pts.push({ x: (cells[i] % cols + 0.5) * cell, y: (((cells[i] / cols) | 0) + 0.5) * cell });
  if (found === (tcy * cols + tcx)) pts.push({ x: tx, y: ty });
  // string-pulling: drop waypoints we can walk straight past (grid line-of-sight, cheap)
  var out = [], px = sx, py = sy, idx = 0;
  while (idx < pts.length && out.length < 64) {
    var far = idx;
    for (var j = idx; j < pts.length; j++) {
      if (navClear(nav, px, py, pts[j].x, pts[j].y)) far = j; else break;
    }
    out.push(pts[far]); px = pts[far].x; py = pts[far].y;
    idx = far + 1;
  }
  if (!out.length) out.push({ x: tx, y: ty });
  return out;
}

/* ---------- rendering ---------- */
function seasonCols(season) {
  return season === 0
    ? { grass: '#5d9a52', grass2: '#528c48', water: '#3d7fa8', water2: '#4f96bd', tree: '#3d7a45', tree2: '#2f6236', path: '#c3aa7c', sand: '#dcc890' }
    : { grass: '#82863f', grass2: '#767a37', water: '#3a6f92', water2: '#4a85a6', tree: '#c06a2a', tree2: '#9a4f22', path: '#bda274', sand: '#d3bd84' };
}

function drawWorld(g, cam, st) {
  var C = seasonCols(st.season), t = st.clock;
  g.save();
  g.translate(-cam.x, -cam.y);

  // grass
  g.fillStyle = C.grass;
  g.fillRect(cam.x, Math.max(cam.y, WATER_Y - 2), VW, VH);
  // grass texture bands
  g.fillStyle = C.grass2;
  var y0 = Math.floor(Math.max(cam.y, WATER_Y) / 40) * 40;
  for (var gy = y0; gy < cam.y + VH; gy += 40) {
    for (var gx = Math.floor(cam.x / 60) * 60; gx < cam.x + VW; gx += 60) {
      if (((gx / 60 + gy / 40) | 0) % 2 === 0) g.fillRect(gx, gy, 60, 40);
    }
  }

  // town paths
  g.fillStyle = C.path;
  g.fillRect(360, 380, 60, 640);          // main north-south
  g.fillRect(120, 760, 540, 46);          // square band
  g.fillRect(130, 800, 30, 170);
  g.fillRect(620, 800, 30, 170);
  g.fillRect(150, 700, 480, 20);
  fillRR(g, 336, 742, 108, 82, 12, '#cdb98d'); // square plaza

  // water
  if (cam.y < WATER_Y + 4) {
    g.fillStyle = C.water;
    g.fillRect(cam.x, 0, VW, WATER_Y);
    g.fillStyle = C.water2;
    for (var w = 0; w < 9; w++) {
      var wy = 26 + w * 34 + Math.sin(t * 0.7 + w) * 4;
      g.globalAlpha = 0.5;
      g.fillRect(cam.x + ((w * 53 + t * 12) % 90) - 40, wy, 70, 4);
      g.fillRect(cam.x + ((w * 91 + t * 8) % 160) + 60, wy + 14, 46, 3);
      g.globalAlpha = 1;
    }
    // shoreline
    g.fillStyle = C.sand;
    g.fillRect(cam.x, WATER_Y - 8, VW, 16);
  }

  // dock
  g.fillStyle = '#a5844f';
  g.fillRect(DOCK.x, DOCK.y, DOCK.w, DOCK.h);
  g.fillStyle = '#8d6f42';
  for (var d = 0; d < 9; d++) g.fillRect(DOCK.x, DOCK.y + 4 + d * 14, DOCK.w, 3);
  g.fillStyle = '#7a5f38';
  g.fillRect(DOCK.x - 4, DOCK.y + 20, 5, 10); g.fillRect(DOCK.x + DOCK.w - 1, DOCK.y + 20, 5, 10);

  // buildings
  for (var i = 0; i < BUILDINGS.length; i++) drawBuilding(g, BUILDINGS[i], st);

  // festival lanterns in the square
  if (st.festival) {
    for (var f = 0; f < 8; f++) {
      var lx = 340 + f * 14, ly = 748 + (f % 2) * 66;
      g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(lx, ly, 5 + Math.sin(t * 2 + f) * 0.8, 0, 6.2832); g.fill();
      g.globalAlpha = 0.25; g.beginPath(); g.arc(lx, ly, 13, 0, 6.2832); g.fill(); g.globalAlpha = 1;
    }
  }

  // forage nodes
  for (var n = 0; n < NODES.length; n++) {
    var nd = NODES[n];
    if (nd.x < cam.x - 40 || nd.x > cam.x + VW + 40 || nd.y < cam.y - 60 || nd.y > cam.y + VH + 60) continue;
    drawNode(g, nd, st.harvested[n] === st.day, st, n);
  }

  // trees
  for (var k = 0; k < TREES.length; k++) {
    var tr = TREES[k];
    if (tr.y < cam.y - 60 || tr.y > cam.y + VH + 40) continue;
    g.fillStyle = '#00000022';
    g.beginPath(); g.ellipse(tr.x, tr.y + 14, tr.s * 0.8, tr.s * 0.3, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#6b4a30'; g.fillRect(tr.x - 3, tr.y, 6, 16);
    g.fillStyle = C.tree; g.beginPath(); g.arc(tr.x, tr.y - 4, tr.s, 0, 6.2832); g.fill();
    g.fillStyle = C.tree2; g.beginPath(); g.arc(tr.x - tr.s * 0.3, tr.y - tr.s * 0.4, tr.s * 0.5, 0, 6.2832); g.fill();
  }
  g.restore();
}

function drawBuilding(g, b, st) {
  g.fillStyle = '#00000026';
  g.fillRect(b.x + 5, b.y + b.h - 4, b.w, 10);
  g.fillStyle = b.a; g.fillRect(b.x, b.y + 22, b.w, b.h - 22);
  g.fillStyle = '#00000018'; g.fillRect(b.x, b.y + b.h - 12, b.w, 12);
  // roof
  g.fillStyle = b.b;
  g.beginPath(); g.moveTo(b.x - 8, b.y + 26); g.lineTo(b.x + b.w / 2, b.y - 12); g.lineTo(b.x + b.w + 8, b.y + 26); g.closePath(); g.fill();
  // windows
  var lit = st.night;
  g.fillStyle = lit ? '#ffd98a' : '#7fa3b8';
  g.fillRect(b.x + 18, b.y + 46, 26, 22);
  g.fillRect(b.x + b.w - 44, b.y + 46, 26, 22);
  if (lit) { g.globalAlpha = 0.18; g.fillRect(b.x + 8, b.y + 36, 46, 42); g.fillRect(b.x + b.w - 54, b.y + 36, 46, 42); g.globalAlpha = 1; }
  // door
  g.fillStyle = '#6b4a30';
  g.fillRect(b.door[0] - 15, b.y + b.h - 34, 30, 34);
  g.fillStyle = '#e0c99a'; g.fillRect(b.door[0] + 7, b.y + b.h - 18, 4, 4);
  // sign
  txt(g, b.nm, b.x + b.w / 2, b.y + 34, 11, '#2a2018', 'center', 700);
}

function drawNode(g, nd, spent, st, idx) {
  var info = NODEINFO[nd.k], x = nd.x, y = nd.y;
  g.fillStyle = '#00000022';
  g.beginPath(); g.ellipse(x, y + 10, 14, 5, 0, 0, 6.2832); g.fill();
  if (spent) g.globalAlpha = 0.35;
  var C = seasonCols(st.season);
  if (nd.k === 'reeds') {
    g.strokeStyle = info.c; g.lineWidth = 3;
    for (var i = 0; i < 5; i++) {
      g.beginPath(); g.moveTo(x - 10 + i * 5, y + 8);
      g.quadraticCurveTo(x - 10 + i * 5 + Math.sin(st.clock + i) * 4, y - 6, x - 12 + i * 5 + Math.sin(st.clock + i) * 7, y - 18);
      g.stroke();
    }
  } else if (nd.k === 'rock') {
    g.fillStyle = info.c;
    g.beginPath(); g.arc(x, y, 12, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = '#b0bcc7'; g.beginPath(); g.arc(x - 5, y - 2, 6, 0, 6.2832); g.fill();
  } else if (nd.k === 'clay') {
    g.fillStyle = info.c; fillRR(g, x - 14, y - 8, 28, 16, 6, info.c);
    g.fillStyle = '#cf9070'; fillRR(g, x - 8, y - 6, 12, 7, 3, '#cf9070');
  } else if (nd.k === 'log') {
    fillRR(g, x - 18, y - 7, 36, 15, 7, info.c);
    g.fillStyle = '#7d6446'; g.beginPath(); g.ellipse(x + 17, y, 4, 7, 0, 0, 6.2832); g.fill();
  } else if (nd.k === 'pine') {
    g.fillStyle = '#6b4a30'; g.fillRect(x - 3, y - 2, 6, 12);
    g.fillStyle = st.season ? '#5c7a3e' : info.c;
    for (var p = 0; p < 3; p++) {
      g.beginPath(); g.moveTo(x - 14 + p * 2, y - 2 - p * 9); g.lineTo(x, y - 20 - p * 9); g.lineTo(x + 14 - p * 2, y - 2 - p * 9); g.closePath(); g.fill();
    }
  } else if (nd.k === 'bush') {
    g.fillStyle = st.season ? '#8a7a3c' : info.c;
    g.beginPath(); g.arc(x - 7, y, 10, 0, 6.2832); g.arc(x + 7, y, 10, 0, 6.2832); g.arc(x, y - 7, 11, 0, 6.2832); g.fill();
    if (!spent) {
      g.fillStyle = st.season ? '#e5813a' : '#c75f92';
      g.beginPath(); g.arc(x - 5, y - 6, 3, 0, 6.2832); g.arc(x + 6, y - 2, 3, 0, 6.2832); g.arc(x + 1, y + 3, 3, 0, 6.2832); g.fill();
    }
  } else if (nd.k === 'moss') {
    g.fillStyle = info.c;
    g.beginPath(); g.ellipse(x, y, 16, 9, 0, 0, 6.2832); g.fill();
    if (st.night && !spent) {
      g.globalAlpha = 0.35 + Math.sin(st.clock * 2 + idx) * 0.12;
      g.beginPath(); g.ellipse(x, y, 24, 14, 0, 0, 6.2832); g.fill(); g.globalAlpha = spent ? 0.35 : 1;
    }
  }
  g.globalAlpha = 1;
}

/* ---------- interior ---------- */
var ROOM = { x: 40, y: 150, w: 310, h: 452 };
var BENCH = { x: 52, y: 160, w: 80, h: 46 };
var BED = { x: 246, y: 158, w: 90, h: 58 };
var IDOOR = { x: 172, y: 596, w: 46, h: 12 };

function insideBlocked(x, y, r) {
  if (x < ROOM.x + r || x > ROOM.x + ROOM.w - r) return true;
  if (y < ROOM.y + r || y > ROOM.y + ROOM.h - r) return true;
  if (x > BENCH.x - r && x < BENCH.x + BENCH.w + r && y < BENCH.y + BENCH.h + r) return true;
  if (x > BED.x - r && x < BED.x + BED.w + r && y < BED.y + BED.h + r) return true;
  return false;
}

function drawInterior(g, st) {
  var wal = STYLES.wall[st.style.wall] || STYLES.wall[0];
  var flo = STYLES.floor[st.style.floor] || STYLES.floor[0];
  g.fillStyle = '#2b2620'; g.fillRect(0, 0, VW, VH);
  // back wall
  g.fillStyle = wal.c; g.fillRect(ROOM.x - 10, 86, ROOM.w + 20, 74);
  g.fillStyle = wal.c2;
  for (var i = 0; i < 8; i++) g.fillRect(ROOM.x - 10 + i * 42, 86, 3, 74);
  // window
  fillRR(g, 150, 100, 92, 46, 6, st.night ? '#1c2a3a' : '#8fc7e0');
  g.strokeStyle = '#6b4a30'; g.lineWidth = 4; g.strokeRect(150, 100, 92, 46);
  g.fillRect(194, 100, 4, 46);
  if (st.night) { g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(222, 118, 7, 0, 6.2832); g.fill(); }
  // floor
  g.fillStyle = flo.c; g.fillRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);
  g.fillStyle = flo.c2;
  for (var b = 0; b < 12; b++) g.fillRect(ROOM.x, ROOM.y + b * 38, ROOM.w, 3);
  g.strokeStyle = '#00000033'; g.lineWidth = 3; g.strokeRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);
  // bench
  fillRR(g, BENCH.x, BENCH.y, BENCH.w, BENCH.h, 6, '#9a7a52');
  g.fillStyle = '#7d6140'; g.fillRect(BENCH.x + 4, BENCH.y + BENCH.h - 12, BENCH.w - 8, 6);
  g.fillStyle = '#c9b48a'; g.fillRect(BENCH.x + 10, BENCH.y + 10, 20, 12);
  g.fillStyle = '#8e9aa6'; g.fillRect(BENCH.x + 40, BENCH.y + 12, 26, 8);
  txt(g, 'BENCH', BENCH.x + BENCH.w / 2, BENCH.y + BENCH.h + 10, 10, '#e6dcc4', 'center');
  // bed
  fillRR(g, BED.x, BED.y, BED.w, BED.h, 8, '#8a6c50');
  fillRR(g, BED.x + 5, BED.y + 16, BED.w - 10, BED.h - 22, 6, '#cfd9e6');
  fillRR(g, BED.x + 8, BED.y + 6, 30, 18, 5, '#f0f4f8');
  txt(g, 'BED', BED.x + BED.w / 2, BED.y + BED.h + 10, 10, '#e6dcc4', 'center');
  // door
  g.fillStyle = '#6b4a30'; g.fillRect(IDOOR.x, IDOOR.y - 2, IDOOR.w, 16);
  txt(g, 'OUT', IDOOR.x + IDOOR.w / 2, IDOOR.y - 12, 10, '#e6dcc4', 'center');
}

function drawFurnFit(g, f, x, y, box) {
  var s = Math.min(1, box / Math.max(f.w, f.h));
  g.save(); g.translate(x, y); g.scale(s, s);
  drawFurn(g, f, 0, 0, 1, false);
  g.restore();
}

function drawFurn(g, f, x, y, alpha, sel) {
  var w = f.w, h = f.h;
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.fillStyle = '#00000026';
  g.beginPath(); g.ellipse(x, y + h / 2 - 2, w * 0.45, 5, 0, 0, 6.2832); g.fill();
  if (f.sh === 'flat') {
    fillRR(g, x - w / 2, y - h / 2, w, h, 6, f.a);
    g.strokeStyle = f.b; g.lineWidth = 3; rr(g, x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10, 4); g.stroke();
  } else if (f.sh === 'round') {
    g.fillStyle = f.b; g.beginPath(); g.arc(x, y, w / 2, 0, 6.2832); g.fill();
    g.fillStyle = f.a; g.beginPath(); g.arc(x, y - 2, w / 2 - 5, 0, 6.2832); g.fill();
  } else if (f.sh === 'lamp') {
    g.fillStyle = f.a; g.fillRect(x - 5, y - h / 2 + 12, 10, h - 12);
    g.fillStyle = f.b; g.beginPath(); g.arc(x, y - h / 2 + 10, w / 2, 0, 6.2832); g.fill();
    g.globalAlpha = 0.22; g.beginPath(); g.arc(x, y - h / 2 + 10, w, 0, 6.2832); g.fill();
    g.globalAlpha = alpha === undefined ? 1 : alpha;
  } else if (f.sh === 'tall') {
    fillRR(g, x - w / 2, y - h / 2, w, h, 5, f.a);
    g.fillStyle = f.b; g.fillRect(x - w / 2 + 5, y - h / 2 + 6, w - 10, h * 0.4);
  } else {
    fillRR(g, x - w / 2, y - h / 2, w, h, 5, f.a);
    g.fillStyle = f.b; g.fillRect(x - w / 2 + 4, y + h / 2 - 12, w - 8, 8);
    g.fillStyle = '#ffffff22'; g.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, 6);
  }
  if (sel) {
    g.strokeStyle = '#ffe08a'; g.lineWidth = 2.5;
    rr(g, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 7); g.stroke();
  }
  g.globalAlpha = 1;
}
