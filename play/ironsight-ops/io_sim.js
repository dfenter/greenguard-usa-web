/* Ironsight Ops - io_sim.js
 * The simulation: level grid, navigation, ballistics, hostile behaviour,
 * ordnance and the mission objective machine. This file owns no Phaser
 * object and no render state whatsoever. Entities here are plain records
 * in preallocated pools; the renderer in game.js pairs them BY INDEX.
 *
 * Defect classes this split exists to prevent:
 *  - per entity render state stored on the entity passed to the renderer,
 *  - debug views built from something other than the live pool,
 *  - a clock advancing past the stepped sim (the sim owns simT; it is
 *    advanced by step() and by nothing else).
 */
var IOSim = (function () {
  'use strict';

  var C = IOContent;
  var CELL = C.CELL, COLS = C.COLS, ROWS = C.ROWS;
  var WORLD_W = C.WORLD_W, WORLD_H = C.WORLD_H;
  var TAU = Math.PI * 2;

  var FLOOR = 0, WALL = 1, CRATE = 2, GLASS = 3, DOOR = 4;

  var MAX_ENT = 40;        // hostiles + civilians
  var MAX_TRACER = 48;
  var MAX_ORD = 12;        // thrown ordnance in flight
  var MAX_SMOKE = 5;
  var MAX_INTEL = 8;
  var MAX_EVENT = 32;      // frame event ring the renderer drains

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function angDiff(a, b) { return ((b - a + Math.PI * 3) % TAU) - Math.PI; }

  /* --------------------------------------------------------- records */
  function makeEntity(id) {
    return {
      id: id, active: false, kind: 'rifleman', team: 'foe', civ: false, inert: false,
      x: 0, y: 0, vx: 0, vy: 0, r: 11, angle: 0, moveAngle: 0, speed: 0, moveMag: 0,
      hp: 0, maxHp: 1, alive: false, deadT: 0, hurtT: 0, flinch: 0, blind: 0,
      suppress: 0, fireCd: 0, burst: 0, think: 0, react: 0, shield: 0,
      goalX: 0, goalY: 0, hasGoal: false, targetSeen: false, accuracy: 0.6,
      weapon: 'ar', score: 100, followIdx: -1, anim: 'idle', animT: 0, escort: false,
      spawnT: 0, marked: 0
    };
  }
  function makeTracer(id) {
    return { id: id, active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, max: 0.08, tint: 0xffd47b, w: 2 };
  }
  function makeOrd(id) {
    return { id: id, active: false, type: 'frag', x: 0, y: 0, tx: 0, ty: 0, t: 0, fuse: 1, ownerFoe: false };
  }
  function makeSmoke(id) {
    return { id: id, active: false, x: 0, y: 0, r: 70, life: 0, max: 8, grow: 0 };
  }
  function makeIntel(id) {
    return { id: id, active: false, x: 0, y: 0, taken: false, phase: 0 };
  }

  /* ------------------------------------------------------------ state */
  var S = {
    simT: 0, running: false, mode: 'campaign', missionIndex: 0, mission: null,
    theatre: null, difficulty: 0.6,
    grid: new Uint8Array(COLS * ROWS),
    cellHp: new Float32Array(COLS * ROWS),
    cellMaxHp: new Float32Array(COLS * ROWS),
    cellKind: new Uint8Array(COLS * ROWS),     // authored kind, survives destruction
    barrels: [], lamps: [], coverSpots: [], spawnPoints: [],
    dist: new Uint16Array(COLS * ROWS),         // BFS distance to player cell
    flow: new Int8Array(COLS * ROWS * 2),       // step vector toward player
    flowT: 0, flowCell: -1,
    ents: [], tracers: [], ord: [], smokes: [], intel: [],
    player: {
      x: 0, y: 0, angle: 0, moveAngle: 0, moveMag: 0, hp: 100, maxHp: 100,
      alive: true, r: 11, hurtT: 0, regenT: 0, anim: 'idle', legAnim: 'stand',
      animT: 0, lean: 0, vaultT: 0, vaultX: 0, vaultY: 0, vaultFrom: 0,
      primary: 'ar', secondary: 'pistol', current: 'primary',
      mag: {}, reserve: {}, reloadT: 0, reloadTotal: 0, raiseT: 0,
      bloom: 0, fireCd: 0, gadget: 'frag', charges: 0, breachCharges: 0,
      shots: 0, hits: 0, kills: 0, firing: false, wantFire: false
    },
    stageIndex: 0, stage: null, stageT: 0, stageProgress: 0, stageDone: false,
    holdT: 0, clearCount: 0, intelTaken: 0, intelNeeded: 0, rescued: 0, rescueNeeded: 0,
    reinforceT: 0, timeElapsed: 0, score: 0, wave: 0, waveT: 0, waveAlive: 0,
    result: '', enemiesAlive: 0, targetsLeft: 0, trialT: 0,
    events: [], eventCount: 0,
    lastRayHit: 0
  };
  for (var i = 0; i < MAX_ENT; i++) S.ents.push(makeEntity(i));
  for (var j = 0; j < MAX_TRACER; j++) S.tracers.push(makeTracer(j));
  for (var k = 0; k < MAX_ORD; k++) S.ord.push(makeOrd(k));
  for (var m = 0; m < MAX_SMOKE; m++) S.smokes.push(makeSmoke(m));
  for (var n = 0; n < MAX_INTEL; n++) S.intel.push(makeIntel(n));
  for (var e = 0; e < MAX_EVENT; e++) S.events.push({ type: '', x: 0, y: 0, a: 0, b: 0, tint: 0xffffff, text: '' });

  /* Frame events are a fixed ring: the renderer drains them every frame and
   * a flood can never grow an array without bound. */
  function emit(type, x, y, a, b, tint, text) {
    if (S.eventCount >= MAX_EVENT) return null;
    var ev = S.events[S.eventCount++];
    ev.type = type; ev.x = x; ev.y = y; ev.a = a || 0; ev.b = b || 0;
    ev.tint = tint == null ? 0xffffff : tint; ev.text = text || '';
    return ev;
  }
  function drainEvents() { S.eventCount = 0; }

  /* ----------------------------------------------------------- grid */
  function idx(cx, cy) { return cy * COLS + cx; }
  function cellAt(x, y) {
    var cx = x / CELL | 0, cy = y / CELL | 0;
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return WALL;
    return S.grid[idx(cx, cy)];
  }
  function blocks(v) { return v === WALL || v === CRATE || v === GLASS || v === DOOR; }
  function blocksSight(v) { return v === WALL || v === CRATE || v === DOOR; }

  function circleHitsCell(x, y, r, cx, cy) {
    var rx = cx * CELL, ry = cy * CELL;
    var qx = clamp(x, rx, rx + CELL), qy = clamp(y, ry, ry + CELL);
    var dx = x - qx, dy = y - qy;
    return dx * dx + dy * dy < r * r;
  }
  function collides(x, y, r) {
    var c0 = clamp((x - r) / CELL | 0, 0, COLS - 1), c1 = clamp((x + r) / CELL | 0, 0, COLS - 1);
    var r0 = clamp((y - r) / CELL | 0, 0, ROWS - 1), r1 = clamp((y + r) / CELL | 0, 0, ROWS - 1);
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        if (!blocks(S.grid[idx(cx, cy)])) continue;
        if (circleHitsCell(x, y, r, cx, cy)) return true;
      }
    }
    return false;
  }
  /* Axis separated move so a body slides along a wall instead of sticking. */
  function moveBody(b, dx, dy, ignoreSoft) {
    var nx = clamp(b.x + dx, 6, WORLD_W - 6);
    if (!collides(nx, b.y, b.r) || ignoreSoft) b.x = nx;
    var ny = clamp(b.y + dy, 6, WORLD_H - 6);
    if (!collides(b.x, ny, b.r) || ignoreSoft) b.y = ny;
  }

  /* Sight line. Crates and walls block sight; glass does not; smoke does. */
  function lineClear(ax, ay, bx, by, smokeBlocks) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.hypot(dx, dy);
    if (len < 1) return true;
    var steps = Math.ceil(len / 12);
    var sx = dx / steps, sy = dy / steps;
    var x = ax, y = ay, occluded = 0;
    for (var i = 1; i <= steps; i++) {
      x += sx; y += sy;
      if (blocksSight(cellAt(x, y))) return false;
      if (smokeBlocks) {
        for (var s = 0; s < S.smokes.length; s++) {
          var sm = S.smokes[s];
          if (!sm.active) continue;
          var ddx = x - sm.x, ddy = y - sm.y;
          if (ddx * ddx + ddy * ddy < sm.r * sm.r) { occluded += 12; break; }
        }
        if (occluded > 26) return false;
      }
    }
    return true;
  }

  /* --------------------------------------------------- level building */
  function applyOps(th) {
    S.grid.fill(FLOOR);
    S.cellHp.fill(0); S.cellMaxHp.fill(0); S.cellKind.fill(FLOOR);
    S.barrels.length = 0; S.lamps.length = 0;
    var x, y;
    for (x = 0; x < COLS; x++) { setCell(x, 0, WALL, 0); setCell(x, ROWS - 1, WALL, 0); }
    for (y = 0; y < ROWS; y++) { setCell(0, y, WALL, 0); setCell(COLS - 1, y, WALL, 0); }
    var ops = th.ops;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i], code = op[0];
      if (code === 'b') { S.barrels.push({ cx: op[1], cy: op[2], hp: 30, alive: true }); continue; }
      if (code === 'l') { S.lamps.push({ cx: op[1], cy: op[2] }); continue; }
      var w = op[3] || 1, h = op[4] || 1;
      for (y = op[2]; y < op[2] + h; y++) {
        for (x = op[1]; x < op[1] + w; x++) {
          if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) continue;
          if (code === 'w') setCell(x, y, WALL, 0);
          else if (code === 'c') setCell(x, y, CRATE, 72);
          else if (code === 'g') setCell(x, y, GLASS, 16);
        }
      }
    }
  }
  function setCell(cx, cy, kind, hp) {
    var i = idx(cx, cy);
    S.grid[i] = kind; S.cellKind[i] = kind;
    S.cellHp[i] = hp; S.cellMaxHp[i] = hp;
  }

  /* Reachability from the player start, so no objective, spawn or pickup
   * can ever be authored into a sealed pocket. Everything snaps to the
   * nearest reachable open cell. */
  var reach = new Uint8Array(COLS * ROWS);
  var bfsQ = new Int32Array(COLS * ROWS);
  function computeReach(sx, sy) {
    reach.fill(0);
    var head = 0, tail = 0;
    var start = idx(clamp(sx | 0, 0, COLS - 1), clamp(sy | 0, 0, ROWS - 1));
    if (S.grid[start] !== FLOOR) start = nearestOpenCell(sx, sy, true);
    reach[start] = 1; bfsQ[tail++] = start;
    while (head < tail) {
      var cur = bfsQ[head++];
      var cx = cur % COLS, cy = (cur / COLS) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        var ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        var ni = idx(nx, ny);
        if (reach[ni] || S.grid[ni] !== FLOOR) continue;
        reach[ni] = 1; bfsQ[tail++] = ni;
      }
    }
  }
  function nearestOpenCell(cx, cy, anyOpen) {
    var best = -1, bestD = 1e9;
    for (var y = 1; y < ROWS - 1; y++) {
      for (var x = 1; x < COLS - 1; x++) {
        var i = idx(x, y);
        if (S.grid[i] !== FLOOR) continue;
        if (!anyOpen && !reach[i]) continue;
        var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best < 0 ? idx(1, 1) : best;
  }
  function snapPoint(cx, cy) {
    var i = idx(clamp(cx | 0, 0, COLS - 1), clamp(cy | 0, 0, ROWS - 1));
    if (S.grid[i] !== FLOOR || !reach[i]) i = nearestOpenCell(cx, cy, false);
    return { x: (i % COLS) * CELL + CELL * 0.5, y: (((i / COLS) | 0)) * CELL + CELL * 0.5 };
  }
  function buildCoverSpots() {
    S.coverSpots.length = 0;
    for (var y = 1; y < ROWS - 1; y++) {
      for (var x = 1; x < COLS - 1; x++) {
        var i = idx(x, y);
        if (S.grid[i] !== FLOOR || !reach[i]) continue;
        var near = 0;
        for (var d = 0; d < 4; d++) {
          var nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
          var ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
          var v = S.grid[idx(nx, ny)];
          if (v === WALL || v === CRATE) near++;
        }
        if (near > 0) S.coverSpots.push({ x: x * CELL + CELL * 0.5, y: y * CELL + CELL * 0.5 });
      }
    }
  }

  /* Flow field to the player, refreshed on a timer. 735 cells of BFS is
   * cheaper than a per hostile path search and never stalls a frame. */
  function refreshFlow() {
    var pc = idx(clamp(S.player.x / CELL | 0, 0, COLS - 1), clamp(S.player.y / CELL | 0, 0, ROWS - 1));
    if (S.grid[pc] !== FLOOR) pc = nearestOpenCell(S.player.x / CELL, S.player.y / CELL, false);
    S.flowCell = pc;
    S.dist.fill(65535);
    var head = 0, tail = 0;
    S.dist[pc] = 0; bfsQ[tail++] = pc;
    while (head < tail) {
      var cur = bfsQ[head++];
      var cx = cur % COLS, cy = (cur / COLS) | 0;
      var nd = S.dist[cur] + 1;
      for (var d = 0; d < 4; d++) {
        var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        var ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
        var ni = idx(nx, ny);
        if (S.grid[ni] !== FLOOR || S.dist[ni] <= nd) continue;
        S.dist[ni] = nd;
        S.flow[ni * 2] = cx - nx; S.flow[ni * 2 + 1] = cy - ny;
        bfsQ[tail++] = ni;
      }
    }
  }
  function flowStep(x, y) {
    var cx = clamp(x / CELL | 0, 0, COLS - 1), cy = clamp(y / CELL | 0, 0, ROWS - 1);
    var i = idx(cx, cy);
    if (S.dist[i] === 65535) return null;
    var fx = S.flow[i * 2], fy = S.flow[i * 2 + 1];
    if (fx === 0 && fy === 0) return null;
    return { x: (cx + fx) * CELL + CELL * 0.5, y: (cy + fy) * CELL + CELL * 0.5 };
  }

  return {
    CELL: CELL, COLS: COLS, ROWS: ROWS, WORLD_W: WORLD_W, WORLD_H: WORLD_H,
    FLOOR: FLOOR, WALL: WALL, CRATE: CRATE, GLASS: GLASS, DOOR: DOOR,
    MAX_ENT: MAX_ENT, MAX_TRACER: MAX_TRACER, MAX_ORD: MAX_ORD,
    MAX_SMOKE: MAX_SMOKE, MAX_INTEL: MAX_INTEL,
    state: S, idx: idx, cellAt: cellAt, blocks: blocks, blocksSight: blocksSight,
    collides: collides, moveBody: moveBody, lineClear: lineClear,
    applyOps: applyOps, setCell: setCell, computeReach: computeReach,
    snapPoint: snapPoint, buildCoverSpots: buildCoverSpots, reach: reach,
    refreshFlow: refreshFlow, flowStep: flowStep,
    emit: emit, drainEvents: drainEvents, clamp: clamp, angDiff: angDiff
  };
})();
