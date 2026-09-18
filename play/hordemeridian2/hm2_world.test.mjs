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

console.log('');
console.log(cases + ' cases, ' + failures + ' failures');
if (failures > 0) {
  process.exit(1);
}
