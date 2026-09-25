/* hm2_enemies.js - HM2 M3 bestiary behaviors.
 *
 * Data-driven extension point. Each entry in HM2_ENEMY_BEHAVIORS is a step
 * function keyed by the enemy's `behavior` string from hm_data.js's
 * M3_ENEMIES table. game.js's stepEnemies loop looks up the enemy's
 * behavior in this table BEFORE falling into its existing if/else chain; if
 * a key is not present here, the old chain runs completely untouched. This
 * file never rewrites existing behavior semantics, only adds new ones.
 *
 * Step function signature: (scene, e, ctx) -> true if it fully handled
 * movement/firing for this enemy this frame (game.js should `continue` the
 * loop), false/undefined to let the existing per-enemy tail (clampEnemy +
 * enemyContact + default approach) still run.
 *
 * ctx carries: dt, enemyClock, phaseHidden, targetX, targetY, dx, dy, dist,
 * sp (base speed already scaled by enemyClock), srand (seeded PRNG),
 * clampField, TAU.
 */
(function () {
  'use strict';

  function formationStep(scene, e, ctx) {
    // V-wing: two enemies orbit a shared lead point and dive together, then
    // split hard left/right once close (the "split on approach").
    if (e.wingSplit === undefined) {
      e.wingSplit = false;
      // Deterministic per-enemy side from spawn position, so paired V-wing
      // members split away from each other rather than both picking the
      // same side.
      e.wingSide = Math.floor(e.x + e.y) % 2 === 0 ? 1 : -1;
    }
    var splitRange = 190;
    if (!e.wingSplit && ctx.dist < splitRange) {
      e.wingSplit = true;
      e.wingAngle = Math.atan2(ctx.dy, ctx.dx) + e.wingSide * 0.9;
    }
    var ang;
    if (e.wingSplit) {
      ang = e.wingAngle;
    } else {
      var lead = Math.atan2(ctx.dy, ctx.dx);
      ang = lead + e.wingSide * 0.32;
    }
    e.x += Math.cos(ang) * ctx.sp * ctx.dt;
    e.y += Math.sin(ang) * ctx.sp * ctx.dt;
    return false;
  }

  function straferStep(scene, e, ctx) {
    var want = 300;
    var orbitDir = e.orbitDir || (e.orbitDir = (ctx.srand() < 0.5 ? 1 : -1));
    if (ctx.dist > want + 40) {
      e.x += ctx.dx / ctx.dist * ctx.sp * ctx.dt;
      e.y += ctx.dy / ctx.dist * ctx.sp * ctx.dt;
    } else if (ctx.dist < want - 60) {
      e.x -= ctx.dx / ctx.dist * ctx.sp * ctx.dt;
      e.y -= ctx.dy / ctx.dist * ctx.sp * ctx.dt;
    } else {
      var tangent = Math.atan2(ctx.dy, ctx.dx) + orbitDir * Math.PI / 2;
      e.x += Math.cos(tangent) * ctx.sp * ctx.dt;
      e.y += Math.sin(tangent) * ctx.sp * ctx.dt;
    }
    if (e.cd <= 0 && !ctx.phaseHidden && ctx.dist < 520) {
      e.cd = 2.4;
      scene.fireEbolt(e, ctx.dx / ctx.dist, ctx.dy / ctx.dist, e.dmg * 0.65);
    }
    scene.clampEnemy(e);
    return true;
  }

  function shieldWallStep(scene, e, ctx) {
    // Advances slowly head-on; frontal damage is heavily reduced by
    // wallDamageMultiplier (wired into game.js's damage()), forcing the
    // player to flank instead of trading hits face-on.
    e.x += ctx.dx / ctx.dist * ctx.sp * 0.7 * ctx.dt;
    e.y += ctx.dy / ctx.dist * ctx.sp * 0.7 * ctx.dt;
    e.facing = Math.atan2(ctx.dy, ctx.dx);
    return false;
  }

  // Called from game.js's damage() before applying raw damage to a
  // shield-wall enemy: returns a multiplier so frontal hits are weak and
  // flanking hits are full. Additive hook, only consulted for this behavior.
  function wallDamageMultiplier(scene, e, hx, hy) {
    if (e.facing === undefined) return 1;
    var hitAng = Math.atan2((hy != null ? hy : e.y) - e.y, (hx != null ? hx : e.x) - e.x);
    var diff = Math.atan2(Math.sin(hitAng - e.facing), Math.cos(hitAng - e.facing));
    var frontal = Math.abs(diff) < 0.9;
    return frontal ? 0.18 : 1;
  }

  function burrowerStep(scene, e, ctx) {
    if (e.burrowT === undefined) { e.burrowT = 1.4 + ctx.srand() * 0.8; e.burrowed = false; }
    e.burrowT -= ctx.dt;
    if (e.burrowT <= 0) {
      if (!e.burrowed) {
        e.burrowed = true;
        e.burrowT = 1.2 + ctx.srand() * 0.6;
        if (e.spr) e.spr.setAlpha(0.12);
      } else {
        e.burrowed = false;
        e.burrowT = 1.6 + ctx.srand() * 0.9;
        var emergeX = ctx.targetX + (ctx.srand() - 0.5) * 60;
        var emergeY = ctx.targetY + (ctx.srand() - 0.5) * 60;
        var pos = ctx.clampField(emergeX, emergeY, -60);
        e.x = pos.x; e.y = pos.y;
        if (e.spr) e.spr.setAlpha(1).setPosition(e.x, e.y);
        scene.contactRing(e.x, e.y, 10, 60, 0.16, e.tint, 0.5);
      }
    }
    if (!e.burrowed) {
      e.x += ctx.dx / ctx.dist * ctx.sp * ctx.dt;
      e.y += ctx.dy / ctx.dist * ctx.sp * ctx.dt;
    }
    scene.clampEnemy(e);
    if (!e.burrowed) scene.enemyContact(e, ctx.dt);
    return true;
  }

  function mimicStep(scene, e, ctx) {
    // Sits still looking like a gem (rendered via base 'deco_core' frame and
    // zero speed in data) until the player closes to strike range, then
    // wakes and lunges.
    if (!e.mimicAwake) {
      if (ctx.dist < 70) {
        e.mimicAwake = true;
        e.speed = e.baseSpeed = 140;
        if (e.spr) e.spr.setTint(e.tint);
        scene.contactRing(e.x, e.y, 8, 60, 0.14, 0xffffff, 0.7);
      }
      return true; // holds position, no movement, no contact damage while dormant
    }
    var lungeSp = e.speed * ctx.enemyClock;
    e.x += ctx.dx / ctx.dist * lungeSp * ctx.dt;
    e.y += ctx.dy / ctx.dist * lungeSp * ctx.dt;
    scene.clampEnemy(e);
    scene.enemyContact(e, ctx.dt);
    return true;
  }

  function bomberStep(scene, e, ctx) {
    if (e.mineCd === undefined) e.mineCd = 1.6 + ctx.srand() * 1.0;
    e.x += ctx.dx / ctx.dist * ctx.sp * ctx.dt;
    e.y += ctx.dy / ctx.dist * ctx.sp * ctx.dt;
    e.mineCd -= ctx.dt;
    if (e.mineCd <= 0 && !ctx.phaseHidden) {
      e.mineCd = 2.8 + ctx.srand() * 0.6;
      scene.spawnAirBomb(e.x, e.y, e.baseDmg > 0 ? e.baseDmg : 14, 90, 1.4);
    }
    scene.clampEnemy(e);
    scene.enemyContact(e, ctx.dt);
    return true;
  }

  function leechStep(scene, e, ctx) {
    var tang = Math.atan2(ctx.dy, ctx.dx) + (ctx.dist > 170 ? 0.2 : 1.0);
    e.x += Math.cos(tang) * ctx.sp * ctx.dt;
    e.y += Math.sin(tang) * ctx.sp * ctx.dt;
    scene.clampEnemy(e);
    if (e.leechCd === undefined) e.leechCd = 0;
    e.leechCd -= ctx.dt;
    if (e.leechCd <= 0 && scene.gems) {
      var nearest = null, nearestD2 = 130 * 130;
      for (var gi = 0; gi < scene.gems.length; gi++) {
        var g = scene.gems[gi];
        if (!g.alive) continue;
        var gdx = g.x - e.x, gdy = g.y - e.y, gd2 = gdx * gdx + gdy * gdy;
        if (gd2 < nearestD2) { nearest = g; nearestD2 = gd2; }
      }
      if (nearest) {
        e.leechCd = 0.9;
        e.hp = Math.min(e.maxHp, e.hp + nearest.value * 0.5);
        scene.killSprite(nearest);
        scene.contactRing(e.x, e.y, 6, 30, 0.12, 0xffb4e6, 0.6);
      }
    }
    scene.enemyContact(e, ctx.dt);
    return true;
  }

  var HM2_ENEMY_BEHAVIORS = {
    formation: formationStep,
    strafer: straferStep,
    'shield-wall': shieldWallStep,
    burrower: burrowerStep,
    mimic: mimicStep,
    bomber: bomberStep,
    leech: leechStep
  };

  var HM2_ENEMIES = {
    BEHAVIORS: HM2_ENEMY_BEHAVIORS,
    wallDamageMultiplier: wallDamageMultiplier
  };

  if (typeof window !== 'undefined') window.HM2_ENEMIES = HM2_ENEMIES;
  if (typeof module !== 'undefined' && module.exports) module.exports = HM2_ENEMIES;
}());
