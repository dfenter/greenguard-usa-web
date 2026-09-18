// hm2_world.js - M2 world SDF arena + terrain hooks for Horde Meridian 2.
// Standalone module. No Phaser, no window globals read at load time.
// UMD pattern matching hm2_ui.js / hm_data.js.
(function () {
  'use strict';

  var WORLD = 12600;
  var EDGE_BAND = 340;

  // Six overlapping regions extending the five HM1 region keys with a sixth.
  // Laid out as a chain across the WORLD footprint so the union is a
  // non-rectangular connected blob with ~15 percent overlap between
  // neighbors.
  var REGIONS = [
    { key: 'aurelion-graveyard', name: 'AURELION GRAVEYARD',
      cx: -5040, cy: 900, rx: 2600, ry: 2000, tint: 0xffb47e,
      palette: { deep: 0x171b2b, nebula: 0x312846, mid: 0x5a3148, dust: 0x9a5b55 } },
    { key: 'void-rift', name: 'VOID RIFT',
      cx: -3020, cy: -1420, rx: 2600, ry: 2000, tint: 0x9b8cff,
      palette: { deep: 0x0a1020, nebula: 0x1c1e46, mid: 0x292a66, dust: 0x4f3d88 } },
    { key: 'meridian-verge', name: 'MERIDIAN VERGE',
      cx: 0, cy: 0, rx: 2700, ry: 2100, tint: 0x54d6ff,
      palette: { deep: 0x102c3b, nebula: 0x164b61, mid: 0x1f7180, dust: 0x39a89b } },
    { key: 'ember-drift', name: 'EMBER DRIFT',
      cx: 3020, cy: 1420, rx: 2600, ry: 2000, tint: 0xff756a,
      palette: { deep: 0x351b22, nebula: 0x5d2029, mid: 0x8b302d, dust: 0xc1513d } },
    { key: 'crystal-shoals', name: 'CRYSTAL SHOALS',
      cx: 5040, cy: -900, rx: 2600, ry: 2000, tint: 0xa7f3ff,
      palette: { deep: 0x173546, nebula: 0x2c657c, mid: 0x4c9db0, dust: 0x86d7d4 } },
    { key: 'solar-crown', name: 'SOLAR CROWN',
      cx: 6900, cy: 2500, rx: 2400, ry: 1900, tint: 0xffd67a,
      palette: { deep: 0x2b1c0a, nebula: 0x4d3013, mid: 0x7a4d1a, dust: 0xc98a34 } }
  ];

  var SMIN_K = 420; // smooth-min blend radius, tunable

  // ellipseSdf returns an approximate signed distance from (x, y) to the
  // boundary of an ellipse centered at (region.cx, region.cy) with radii
  // (region.rx, region.ry). Negative inside, positive outside.
  function ellipseSdf(region, x, y) {
    var dx = x - region.cx;
    var dy = y - region.cy;
    var rx = region.rx > 1 ? region.rx : 1;
    var ry = region.ry > 1 ? region.ry : 1;
    var k = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    // scale to approximate physical distance near the boundary
    var avgR = (rx + ry) * 0.5;
    return (k - 1) * avgR;
  }

  // smooth-min (polynomial) blend of two signed distances.
  function smin(a, b, k) {
    if (k <= 0) return Math.min(a, b);
    var h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }

  function sdf(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      return WORLD;
    }
    var result = Infinity;
    for (var i = 0; i < REGIONS.length; i++) {
      var d = ellipseSdf(REGIONS[i], x, y);
      result = (result === Infinity) ? d : smin(result, d, SMIN_K);
    }
    if (!isFinite(result)) return WORLD;
    return result;
  }

  function sdfGrad(x, y) {
    var eps = 4;
    var dx = (sdf(x + eps, y) - sdf(x - eps, y)) / (2 * eps);
    var dy = (sdf(x, y + eps) - sdf(x, y - eps)) / (2 * eps);
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!isFinite(len) || len < 1e-6) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  function clampToField(x, y, r) {
    r = (typeof r === 'number' && isFinite(r)) ? r : 0;
    var px = (typeof x === 'number' && isFinite(x)) ? x : 0;
    var py = (typeof y === 'number' && isFinite(y)) ? y : 0;
    var clamped = false;
    for (var i = 0; i < 24; i++) {
      var d = sdf(px, py);
      var target = -r;
      if (d <= target) break;
      var grad = sdfGrad(px, py);
      if (grad.x === 0 && grad.y === 0) {
        // no gradient info (deep inside/outside symmetric point); nudge toward
        // nearest region center to escape degeneracy.
        var nearest = REGIONS[0];
        var best = Infinity;
        for (var j = 0; j < REGIONS.length; j++) {
          var ddx = px - REGIONS[j].cx;
          var ddy = py - REGIONS[j].cy;
          var dist = ddx * ddx + ddy * ddy;
          if (dist < best) { best = dist; nearest = REGIONS[j]; }
        }
        px = px + (nearest.cx - px) * 0.5;
        py = py + (nearest.cy - py) * 0.5;
        clamped = true;
        continue;
      }
      var push = (d - target) + 1;
      px -= grad.x * push;
      py -= grad.y * push;
      clamped = true;
    }
    if (!isFinite(px) || !isFinite(py)) { px = 0; py = 0; clamped = true; }
    return { x: px, y: py, clamped: clamped };
  }

  function clamp01(v) {
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  function edgeGlowFactor(x, y) {
    var d = sdf(x, y);
    if (!isFinite(d)) return 0;
    // d is negative well inside, ramps toward 0 (and beyond) near/at boundary.
    var t = (d + EDGE_BAND) / EDGE_BAND;
    return clamp01(t);
  }

  function regionAt(x, y) {
    var best = REGIONS[0];
    var bestD = Infinity;
    for (var i = 0; i < REGIONS.length; i++) {
      var d = ellipseSdf(REGIONS[i], x, y);
      if (d < bestD) { bestD = d; best = REGIONS[i]; }
    }
    return best.key;
  }

  // ---- Terrain feature hooks ----
  // Every hook receives (feature, ctx) and returns only finite numbers.
  // ctx.rand is a seeded PRNG function () -> [0,1). No Math.random usage.

  function safeNum(v, fallback) {
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  }

  function safeRand(ctx) {
    if (ctx && typeof ctx.rand === 'function') {
      var r = ctx.rand();
      if (typeof r === 'number' && isFinite(r)) return r;
    }
    return 0.5;
  }

  var HOOKS = {
    asteroid_field: {
      spawn: function (feature, ctx) {
        var r = safeRand(ctx);
        var r2 = safeRand(ctx);
        var spread = safeNum(feature.spread, 400);
        return {
          x: safeNum(ctx && ctx.x, 0) + (r - 0.5) * spread,
          y: safeNum(ctx && ctx.y, 0) + (r2 - 0.5) * spread,
          scale: 0.6 + r * 0.8
        };
      },
      collide: function (feature, ctx) {
        var dx = safeNum(ctx && ctx.dx, 0);
        var dy = safeNum(ctx && ctx.dy, 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var radius = safeNum(feature.radius, 60);
        var blocked = dist < radius;
        var nlen = dist > 1e-6 ? dist : 1e-6;
        return {
          blocked: blocked,
          nx: dx / nlen,
          ny: dy / nlen,
          damage: blocked ? safeNum(feature.contactDamage, 8) : 0
        };
      },
      projectile: function (feature, ctx) {
        var r = safeRand(ctx);
        var vx = safeNum(ctx && ctx.vx, 0);
        var vy = safeNum(ctx && ctx.vy, 0);
        var shatterChance = safeNum(feature.shatterChance, 0.5);
        var absorbed = r < shatterChance;
        return { vx: absorbed ? 0 : vx, vy: absorbed ? 0 : vy, absorbed: absorbed };
      },
      visibility: function (feature, ctx) {
        return { alpha: 1, revealRadius: safeNum(feature.revealRadius, 0) };
      }
    },

    gravity_well: {
      spawn: function (feature, ctx) {
        var r = safeRand(ctx);
        return {
          x: safeNum(ctx && ctx.x, 0),
          y: safeNum(ctx && ctx.y, 0),
          strength: safeNum(feature.strength, 240) * (0.8 + r * 0.4)
        };
      },
      collide: function (feature, ctx) {
        var dx = safeNum(ctx && ctx.dx, 0);
        var dy = safeNum(ctx && ctx.dy, 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var pullRadius = safeNum(feature.pullRadius, 500);
        var inside = dist < pullRadius;
        var nlen = dist > 1e-6 ? dist : 1e-6;
        return { blocked: false, nx: -dx / nlen, ny: -dy / nlen, damage: 0 };
      },
      projectile: function (feature, ctx) {
        var dx = safeNum(ctx && ctx.dx, 1);
        var dy = safeNum(ctx && ctx.dy, 0);
        var vx = safeNum(ctx && ctx.vx, 0);
        var vy = safeNum(ctx && ctx.vy, 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var safeDist = dist > 1e-3 ? dist : 1e-3;
        var strength = safeNum(feature.strength, 240);
        var bendRadius = safeNum(feature.pullRadius, 500);
        var falloff = safeDist < bendRadius ? (1 - safeDist / bendRadius) : 0;
        var bend = (strength * falloff) / (safeDist * 100);
        if (!isFinite(bend)) bend = 0;
        var nx = -dx / safeDist;
        var ny = -dy / safeDist;
        return { vx: vx + nx * bend, vy: vy + ny * bend, absorbed: false };
      },
      visibility: function (feature, ctx) {
        return { alpha: 1, revealRadius: safeNum(feature.revealRadius, 0) };
      }
    },

    nebula: {
      spawn: function (feature, ctx) {
        var r = safeRand(ctx);
        var spread = safeNum(feature.spread, 900);
        return {
          x: safeNum(ctx && ctx.x, 0) + (r - 0.5) * spread,
          y: safeNum(ctx && ctx.y, 0),
          density: 0.4 + safeRand(ctx) * 0.5
        };
      },
      collide: function (feature, ctx) {
        return { blocked: false, nx: 0, ny: 0, damage: 0 };
      },
      projectile: function (feature, ctx) {
        var vx = safeNum(ctx && ctx.vx, 0);
        var vy = safeNum(ctx && ctx.vy, 0);
        return { vx: vx, vy: vy, absorbed: false };
      },
      visibility: function (feature, ctx) {
        var dx = safeNum(ctx && ctx.dx, 0);
        var dy = safeNum(ctx && ctx.dy, 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var hideRadius = safeNum(feature.hideRadius, 220);
        var alpha = dist < hideRadius ? 0 : 1;
        return { alpha: alpha, revealRadius: hideRadius };
      }
    },

    derelict_hulk: {
      spawn: function (feature, ctx) {
        return {
          x: safeNum(ctx && ctx.x, 0),
          y: safeNum(ctx && ctx.y, 0),
          rot: safeRand(ctx) * Math.PI * 2
        };
      },
      collide: function (feature, ctx) {
        var dx = safeNum(ctx && ctx.dx, 0);
        var dy = safeNum(ctx && ctx.dy, 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var radius = safeNum(feature.radius, 140);
        var blocked = dist < radius;
        var nlen = dist > 1e-6 ? dist : 1e-6;
        return { blocked: blocked, nx: dx / nlen, ny: dy / nlen, damage: 0 };
      },
      projectile: function (feature, ctx) {
        var dx = safeNum(ctx && ctx.dx, 0);
        var dy = safeNum(ctx && ctx.dy, 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var radius = safeNum(feature.radius, 140);
        var absorbed = dist < radius;
        return { vx: absorbed ? 0 : safeNum(ctx && ctx.vx, 0), vy: absorbed ? 0 : safeNum(ctx && ctx.vy, 0), absorbed: absorbed };
      },
      visibility: function (feature, ctx) {
        return { alpha: 1, revealRadius: safeNum(feature.revealRadius, 0) };
      }
    },

    solar_flare: {
      spawn: function (feature, ctx) {
        var r = safeRand(ctx);
        return {
          x: safeNum(ctx && ctx.x, 0),
          y: safeNum(ctx && ctx.y, 0),
          width: safeNum(feature.width, 260) * (0.8 + r * 0.3),
          delay: safeRand(ctx) * safeNum(feature.period, 6)
        };
      },
      collide: function (feature, ctx) {
        var inLane = !!(ctx && ctx.inLane);
        var active = !!(ctx && ctx.active);
        var damage = (inLane && active) ? safeNum(feature.damage, 12) : 0;
        return { blocked: false, nx: 0, ny: 0, damage: damage };
      },
      projectile: function (feature, ctx) {
        var vx = safeNum(ctx && ctx.vx, 0);
        var vy = safeNum(ctx && ctx.vy, 0);
        return { vx: vx, vy: vy, absorbed: false };
      },
      visibility: function (feature, ctx) {
        var active = !!(ctx && ctx.active);
        return { alpha: active ? 1 : 0.6, revealRadius: 0 };
      }
    }
  };

  function featureHooks(type) {
    return HOOKS[type] || null;
  }

  // Data-driven terrain feature table per region, one instance of each of
  // the five feature types per region (six regions x five types).
  var FEATURES_BY_REGION = {};
  (function buildFeatures() {
    for (var i = 0; i < REGIONS.length; i++) {
      var region = REGIONS[i];
      FEATURES_BY_REGION[region.key] = [
        { type: 'asteroid_field', region: region.key, radius: 70, spread: 500, shatterChance: 0.5, contactDamage: 8 },
        { type: 'gravity_well', region: region.key, strength: 240, pullRadius: 520 },
        { type: 'nebula', region: region.key, spread: 900, hideRadius: 220 },
        { type: 'derelict_hulk', region: region.key, radius: 150 },
        { type: 'solar_flare', region: region.key, width: 260, period: 6, damage: 14 }
      ];
    }
  }());

  var HM2_WORLD = {
    WORLD: WORLD,
    EDGE_BAND: EDGE_BAND,
    REGIONS: REGIONS,
    sdf: sdf,
    clampToField: clampToField,
    edgeGlowFactor: edgeGlowFactor,
    regionAt: regionAt,
    FEATURES_BY_REGION: FEATURES_BY_REGION,
    featureHooks: featureHooks
  };

  if (typeof window !== 'undefined') {
    window.HM2_WORLD = HM2_WORLD;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HM2_WORLD;
  }
}());
