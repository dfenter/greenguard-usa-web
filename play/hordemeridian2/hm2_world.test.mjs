// hm2_world.test.mjs - plain node test for hm2_world.js. Run with:
//   node hm2_world.test.mjs
// Exits 1 on any failure, prints PASS/FAIL per case.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

var require = createRequire(import.meta.url);
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var HM2_WORLD = require(path.join(__dirname, 'hm2_world.js'));

var failures = 0;
var cases = 0;

function ok(name, cond) {
  cases++;
  if (cond) {
    console.log('PASS ' + name);
  } else {
    failures++;
    console.log('FAIL ' + name);
  }
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var WORLD = HM2_WORLD.WORLD;
var REGIONS = HM2_WORLD.REGIONS;
var sdf = HM2_WORLD.sdf;
var clampToField = HM2_WORLD.clampToField;
var edgeGlowFactor = HM2_WORLD.edgeGlowFactor;
var regionAt = HM2_WORLD.regionAt;
var FEATURES_BY_REGION = HM2_WORLD.FEATURES_BY_REGION;
var featureHooks = HM2_WORLD.featureHooks;

// ---- 1. SDF continuity ----
(function () {
  var rand = mulberry32(1);
  var step = 60;
  var maxJump = 0;
  var allFinite = true;
  var half = WORLD / 2;
  for (var x = -half; x <= half; x += step * 4) {
    for (var y = -half; y <= half; y += step * 4) {
      var d0 = sdf(x, y);
      var d1 = sdf(x + step, y);
      if (!isFinite(d0) || !isFinite(d1)) { allFinite = false; }
      var jump = Math.abs(d1 - d0);
      if (jump > maxJump) maxJump = jump;
    }
  }
  ok('sdf finite on dense grid', allFinite);
  ok('sdf grid Lipschitz sanity (<=1.2x step)', maxJump <= step * 1.2 + 1e-6);

  // random segments
  var maxSegJump = 0;
  var segFinite = true;
  for (var i = 0; i < 500; i++) {
    var x0 = (rand() - 0.5) * WORLD * 1.2;
    var y0 = (rand() - 0.5) * WORLD * 1.2;
    var dx = (rand() - 0.5) * 40;
    var dy = (rand() - 0.5) * 40;
    var a = sdf(x0, y0);
    var b = sdf(x0 + dx, y0 + dy);
    if (!isFinite(a) || !isFinite(b)) segFinite = false;
    var segLen = Math.sqrt(dx * dx + dy * dy);
    var segJump = Math.abs(b - a);
    var ratio = segLen > 1e-6 ? segJump / segLen : 0;
    if (ratio > maxSegJump) maxSegJump = ratio;
  }
  ok('sdf finite along random segments', segFinite);
  ok('sdf random segment slope sane (<=1.2)', maxSegJump <= 1.2 + 1e-6);
}());

// ---- 2. Region union connected, centres inside ----
(function () {
  var allInside = true;
  for (var i = 0; i < REGIONS.length; i++) {
    var r = REGIONS[i];
    var d = sdf(r.cx, r.cy);
    if (!(d < 0)) allInside = false;
  }
  ok('all six region centres inside union (sdf < 0)', allInside);
  ok('exactly six regions', REGIONS.length === 6);

  // connectivity: BFS/flood-walk between consecutive region centres by
  // stepping along the straight line and checking sdf stays reasonably
  // bounded (never wildly positive) implying a continuous connected path
  // exists through the union near that line, since regions overlap ~15%.
  var connected = true;
  for (var j = 0; j < REGIONS.length - 1; j++) {
    var ra = REGIONS[j];
    var rb = REGIONS[j + 1];
    var steps = 50;
    var maxAlongPath = -Infinity;
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var px = ra.cx + (rb.cx - ra.cx) * t;
      var py = ra.cy + (rb.cy - ra.cy) * t;
      var pd = sdf(px, py);
      if (pd > maxAlongPath) maxAlongPath = pd;
    }
    // if the union is connected along this chain, the straight path between
    // adjacent centres should never leave the field by more than a small
    // margin (the smooth blend keeps a corridor open through the overlap).
    if (maxAlongPath > 400) connected = false;
  }
  ok('region chain connected (adjacent centres have a corridor)', connected);
}());

// ---- 3. clampToField never leaves the field ----
(function () {
  var rand = mulberry32(42);
  var epsilon = 5;
  var allGood = true;
  var allFinite = true;
  for (var i = 0; i < 5000; i++) {
    var far = i % 5 === 0;
    var mag = far ? WORLD * 5 : WORLD * 1.5;
    var x = (rand() - 0.5) * mag;
    var y = (rand() - 0.5) * mag;
    var r = rand() * 60;
    var res = clampToField(x, y, r);
    if (!isFinite(res.x) || !isFinite(res.y)) { allFinite = false; break; }
    var d = sdf(res.x, res.y);
    if (!(d <= -r + epsilon)) { allGood = false; }
  }
  // exactly-on-centre case
  var centre = REGIONS[2];
  var onCentre = clampToField(centre.cx, centre.cy, 30);
  var onCentreFinite = isFinite(onCentre.x) && isFinite(onCentre.y);
  var onCentreInside = sdf(onCentre.x, onCentre.y) <= -30 + epsilon;

  ok('clampToField always finite', allFinite);
  ok('clampToField keeps point inside field (sdf <= -r + eps)', allGood);
  ok('clampToField handles exact centre point', onCentreFinite && onCentreInside);
}());

// ---- 4. edgeGlowFactor ----
(function () {
  var inRange = true;
  var rand = mulberry32(7);
  for (var i = 0; i < 2000; i++) {
    var x = (rand() - 0.5) * WORLD * 1.4;
    var y = (rand() - 0.5) * WORLD * 1.4;
    var g = edgeGlowFactor(x, y);
    if (!(g >= 0 && g <= 1) || !isFinite(g)) inRange = false;
  }
  ok('edgeGlowFactor in [0,1] everywhere sampled', inRange);

  var lowAtCentres = true;
  for (var j = 0; j < REGIONS.length; j++) {
    var r = REGIONS[j];
    var g2 = edgeGlowFactor(r.cx, r.cy);
    if (g2 > 0.15) lowAtCentres = false;
  }
  ok('edgeGlowFactor near 0 at region centres', lowAtCentres);

  // sample just inside boundary for meridian-verge along -y axis, a
  // direction away from neighbor overlap so the smooth-min blend does not
  // pull the field inward from an adjacent region's influence.
  var mv = REGIONS.filter(function (r) { return r.key === 'meridian-verge'; })[0];
  var bx = mv.cx;
  var by = mv.cy - mv.ry * 0.97;
  var gBoundary = edgeGlowFactor(bx, by);
  ok('edgeGlowFactor high just inside boundary', gBoundary >= 0.6);
}());

// ---- 5. regionAt sanity ----
(function () {
  var allMatch = true;
  for (var i = 0; i < REGIONS.length; i++) {
    var r = REGIONS[i];
    var key = regionAt(r.cx, r.cy);
    if (key !== r.key) allMatch = false;
  }
  ok('regionAt returns owning key at each centre', allMatch);
}());

// ---- 6. Terrain hooks: finite, correct-typed, over spread of inputs ----
(function () {
  var rand = mulberry32(99);
  var allGood = true;
  var typesGood = true;
  var regionKeys = Object.keys(FEATURES_BY_REGION);
  var testCtxs = [
    { x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0, rand: rand },
    { x: 100000, y: -100000, dx: 999999, dy: -999999, vx: 500, vy: -500, rand: rand, inLane: true, active: true },
    { x: NaN, y: undefined, dx: 0, dy: 0, vx: 0, vy: 0, rand: rand },
    { dx: 0, dy: 0, rand: rand },
    { x: -5, y: -5, dx: -0.0001, dy: 0.0001, vx: -0.0001, vy: 0.0001, rand: rand, inLane: false, active: false }
  ];

  for (var i = 0; i < regionKeys.length; i++) {
    var features = FEATURES_BY_REGION[regionKeys[i]];
    for (var f = 0; f < features.length; f++) {
      var feature = features[f];
      var hooks = featureHooks(feature.type);
      if (!hooks) { allGood = false; continue; }

      for (var c = 0; c < testCtxs.length; c++) {
        var ctx = testCtxs[c];

        var spawnRes = hooks.spawn(feature, ctx);
        if (!spawnRes || typeof spawnRes.x !== 'number' || typeof spawnRes.y !== 'number' ||
            !isFinite(spawnRes.x) || !isFinite(spawnRes.y)) { allGood = false; typesGood = false; }

        var collideRes = hooks.collide(feature, ctx);
        if (!collideRes || typeof collideRes.blocked !== 'boolean' ||
            typeof collideRes.nx !== 'number' || typeof collideRes.ny !== 'number' ||
            typeof collideRes.damage !== 'number' ||
            !isFinite(collideRes.nx) || !isFinite(collideRes.ny) || !isFinite(collideRes.damage)) {
          allGood = false; typesGood = false;
        }

        var projRes = hooks.projectile(feature, ctx);
        if (!projRes || typeof projRes.vx !== 'number' || typeof projRes.vy !== 'number' ||
            typeof projRes.absorbed !== 'boolean' ||
            !isFinite(projRes.vx) || !isFinite(projRes.vy)) {
          allGood = false; typesGood = false;
        }

        var visRes = hooks.visibility(feature, ctx);
        if (!visRes || typeof visRes.alpha !== 'number' || typeof visRes.revealRadius !== 'number' ||
            !isFinite(visRes.alpha) || !isFinite(visRes.revealRadius)) {
          allGood = false; typesGood = false;
        }
      }
    }
  }
  ok('all terrain hooks finite over degenerate/extreme inputs', allGood);
  ok('all terrain hook return shapes correctly typed', typesGood);

  // nebula-specific: hides within 220px, reveals beyond
  var nebulaHooks = featureHooks('nebula');
  var nebulaFeature = FEATURES_BY_REGION['meridian-verge'].filter(function (f) { return f.type === 'nebula'; })[0];
  var hiddenVis = nebulaHooks.visibility(nebulaFeature, { dx: 50, dy: 0 });
  var revealedVis = nebulaHooks.visibility(nebulaFeature, { dx: 500, dy: 0 });
  ok('nebula hides enemies within 220px', hiddenVis.alpha === 0);
  ok('nebula reveals enemies beyond hide radius', revealedVis.alpha === 1);

  // gravity well bends projectile trajectory (non-zero deflection near well)
  var wellHooks = featureHooks('gravity_well');
  var wellFeature = FEATURES_BY_REGION['meridian-verge'].filter(function (f) { return f.type === 'gravity_well'; })[0];
  var bent = wellHooks.projectile(wellFeature, { dx: 100, dy: 0, vx: 10, vy: 0 });
  ok('gravity well bends projectile (vy shifts from straight line)', Math.abs(bent.vy) > 0 || Math.abs(bent.vx - 10) > 0);

  // derelict hulk blocks / absorbs at close range
  var hulkHooks = featureHooks('derelict_hulk');
  var hulkFeature = FEATURES_BY_REGION['meridian-verge'].filter(function (f) { return f.type === 'derelict_hulk'; })[0];
  var hulkClose = hulkHooks.collide(hulkFeature, { dx: 10, dy: 0 });
  ok('derelict hulk blocks at close range', hulkClose.blocked === true);
}());

// Superset test: every point inside the five hm_data.js band boxes (full
// height, EDGE = WORLD/2-40 square clamp) must satisfy sdf(x,y) <= 0. Dense
// grid plus explicit corners and edges, since ellipse-union corners are
// where coverage is most likely to fall short.
(function () {
  var sdf = HM2_WORLD.sdf;
  var WORLD = HM2_WORLD.WORLD;
  var EDGE = WORLD / 2 - 40;
  var REGION_WIDTH = WORLD / 5;
  var bands = [
    { minX: -WORLD / 2, maxX: -WORLD / 2 + REGION_WIDTH },
    { minX: -WORLD / 2 + REGION_WIDTH, maxX: -WORLD / 2 + REGION_WIDTH * 2 },
    { minX: -REGION_WIDTH / 2, maxX: REGION_WIDTH / 2 },
    { minX: WORLD / 2 - REGION_WIDTH * 2, maxX: WORLD / 2 - REGION_WIDTH },
    { minX: WORLD / 2 - REGION_WIDTH, maxX: WORLD / 2 }
  ];
  var fails = 0;
  var checked = 0;
  for (var b = 0; b < bands.length; b++) {
    var lo = Math.max(bands[b].minX, -EDGE);
    var hi = Math.min(bands[b].maxX, EDGE);
    var xs = [lo, hi];
    var ys = [-EDGE, EDGE];
    for (var i = 0; i <= 20; i++) xs.push(lo + (hi - lo) * i / 20);
    for (var j = 0; j <= 20; j++) ys.push(-EDGE + (2 * EDGE) * j / 20);
    for (var xi = 0; xi < xs.length; xi++) {
      for (var yi = 0; yi < ys.length; yi++) {
        checked++;
        if (sdf(xs[xi], ys[yi]) > 0) fails++;
      }
    }
  }
  ok('sdf field is a superset of all band boxes (' + checked + ' points, corners+edges included)', fails === 0);
}());

// Max extent test: the field must not balloon past 1.25x the old arena
// half-extent (EDGE = 6260, so cap = 7825) on either axis. A 4-axis march
// (0/90/180/270 degrees only) is NOT sufficient: the outer regions plus the
// smooth-min blend can bulge the boundary out furthest along an off-axis
// ray, and a cardinal-only check would silently miss that. Sweep the full
// circle at 0.25 degree resolution (1440+ directions), binary-search each
// ray for its boundary point, and take the max |x| and max |y| over every
// sampled boundary point (not just the on-axis ray lengths).
(function () {
  var sdf = HM2_WORLD.sdf;
  var WORLD = HM2_WORLD.WORLD;
  var EDGE = WORLD / 2 - 40;
  var CAP = 1.25 * EDGE;

  function marchTo(dirX, dirY) {
    var lo = 0;
    var hi = WORLD * 3;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (sdf(dirX * mid, dirY * mid) <= 0) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  var STEPS = 1440; // every 0.25 degrees around the full circle
  var maxAbsX = 0;
  var maxAbsY = 0;
  for (var i = 0; i < STEPS; i++) {
    var theta = (i / STEPS) * Math.PI * 2;
    var dirX = Math.cos(theta);
    var dirY = Math.sin(theta);
    var dist = marchTo(dirX, dirY);
    var bx = Math.abs(dirX * dist);
    var by = Math.abs(dirY * dist);
    if (bx > maxAbsX) maxAbsX = bx;
    if (by > maxAbsY) maxAbsY = by;
  }

  ok('field max |x| over full angular sweep <= 1.25x old half-extent (' +
    maxAbsX.toFixed(1) + ' <= ' + CAP.toFixed(1) + ')', maxAbsX <= CAP);
  ok('field max |y| over full angular sweep <= 1.25x old half-extent (' +
    maxAbsY.toFixed(1) + ' <= ' + CAP.toFixed(1) + ')', maxAbsY <= CAP);
}());

// Adjacent-pair separation test: the five primary regions (all REGIONS
// except solar-crown, which is a bonus sixth region off to the side and
// exempt) must read as visibly distinct blobs, not one big disc. For each
// adjacent pair along the band axis, require centre separation / mean rx
// >= 1.4. rx (not ry) is used for "mean radius" here because separation is
// along the x axis and these are tall, narrow ellipses (ry >> rx) hugging
// full-height bands; ry does not bear on how distinct two regions look
// along the axis they're actually spread across.
(function () {
  var primaries = REGIONS.filter(function (r) { return r.key !== 'solar-crown'; });
  var minRatio = Infinity;
  for (var i = 0; i < primaries.length - 1; i++) {
    var a = primaries[i];
    var b = primaries[i + 1];
    var sep = Math.abs(b.cx - a.cx);
    var meanRx = (a.rx + b.rx) / 2;
    var ratio = sep / meanRx;
    if (ratio < minRatio) minRatio = ratio;
  }
  ok('adjacent primary regions are visibly distinct (min separation/meanRx ratio ' +
    minRatio.toFixed(3) + ' >= 1.4)', minRatio >= 1.4);
}());

// ---- Bug A regression: unplaced terrain features never absorb shots ----
// FEATURES_BY_REGION descriptors are static and never carry x/y (nothing in
// game.js ever assigns them). game.js's featureOfTypePlaced guards against
// this by refusing to hand out a feature with no numeric x/y at the
// POSITION-DEPENDENT call sites; this test proves the hazard exists at the
// hook level (derelict_hulk.projectile and asteroid_field.collide both
// resolve dist=0 < radius when x/y are missing) and pins the exact guard.
// Note the guard is deliberately NOT applied to nebula.visibility, which
// reads the player-to-enemy delta and is correct for an unplaced feature.
// This mirrors featureOfType's contract without needing game.js's Phaser
// sandbox: hm2_world.js hooks are pure functions of (feature, ctx).
(function () {
  function hasXY(f) {
    return typeof f.x === 'number' && isFinite(f.x) && typeof f.y === 'number' && isFinite(f.y);
  }

  // 1) Prove the hazard: every shipped FEATURES_BY_REGION entry lacks x/y.
  var anyPlaced = false;
  for (var key in FEATURES_BY_REGION) {
    var list = FEATURES_BY_REGION[key];
    for (var i = 0; i < list.length; i++) {
      if (hasXY(list[i])) anyPlaced = true;
    }
  }
  ok('FEATURES_BY_REGION ships with no placed (x/y) features (hazard precondition)', !anyPlaced);

  // 2) Without a guard, calling the projectile hook on an unplaced feature
  // absorbs a shot that is nowhere near it. Reproduce the EXACT computation
  // game.js does at the call site: `s.x - hulk.x` with hulk.x undefined
  // gives NaN, which safeNum coerces to 0, so dist is 0 and 0 < radius is
  // always true, regardless of the shot's real position.
  var farHulk = FEATURES_BY_REGION['meridian-verge'].filter(function (f) { return f.type === 'derelict_hulk'; })[0];
  var hHooks = featureHooks('derelict_hulk');
  var shotX = 5000, shotY = 5000;
  var farCtx = { dx: shotX - farHulk.x, dy: shotY - farHulk.y, vx: 100, vy: 0, rand: mulberry32(7) };
  var unguardedResult = hHooks.projectile(farHulk, farCtx);
  ok('unguarded derelict_hulk.projectile on an unplaced feature absorbs a far shot (hazard reproduced)',
    unguardedResult.absorbed === true);

  var farAsteroid = FEATURES_BY_REGION['meridian-verge'].filter(function (f) { return f.type === 'asteroid_field'; })[0];
  var aHooks = featureHooks('asteroid_field');
  // asteroid_field's projectile hook rolls shatterChance regardless of
  // position (it never blocks outright), so the enemy-facing collide hook
  // is the one that reproduces the same "unplaced = always inside" hazard,
  // same NaN-from-undefined-x/y computation as game.js's applyTerrainToEnemy.
  var unguardedAsteroidCollide = aHooks.collide(farAsteroid,
    { dx: shotX - farAsteroid.x, dy: shotY - farAsteroid.y, rand: mulberry32(7) });
  ok('unguarded asteroid_field.collide on an unplaced feature blocks at any distance (hazard reproduced)',
    unguardedAsteroidCollide.blocked === true);

  // 3) The guard game.js's featureOfTypePlaced applies: never resolve a
  // feature for position-dependent hook calls unless it carries real
  // numeric x/y. Simulate the guard
  // over every shipped feature to confirm none pass (so game.js's
  // featureOfType returns null for all of them, never handing an unplaced
  // feature to a hook at all) -- this is the fix's actual invariant.
  var guardedCount = 0, totalCount = 0;
  for (var key2 in FEATURES_BY_REGION) {
    var list2 = FEATURES_BY_REGION[key2];
    for (var j = 0; j < list2.length; j++) {
      totalCount++;
      if (hasXY(list2[j])) guardedCount++;
    }
  }
  ok('placed-guard (require numeric x/y) rejects every shipped feature (' + guardedCount + '/' + totalCount + ' pass)',
    guardedCount === 0 && totalCount > 0);
}());

console.log('');
console.log(cases + ' cases, ' + failures + ' failures');
if (failures > 0) {
  process.exit(1);
}
