(function () {
  'use strict';
  // M3 boss layer. Additive: adds 3-phase thresholds, telegraph metadata and
  // arena set-piece descriptors for the 6 Swarm Lords (5 region bosses plus
  // the Meridian Core as the 6th, campaign-end boss). Pure data and pure
  // helper functions only, no Phaser scene access here; game.js reads this
  // table and drives the actual effects with its own render/scene calls, the
  // same split hm2_world.js uses for terrain hooks.

  // Phase thresholds as hp fractions, descending. 2 entries = phase 0/1/2.
  // Phase 0 is the boss's starting/default phase (no entry needed for it).
  var PHASE_THRESHOLDS = [0.66, 0.33];

  var BOSS_META = {
    'proboscis-prime': {
      setpiece: 'asteroid_field',
      telegraphName: 'HULL DRAIN LATCH',
      phaseNames: ['LATCH PATTERN', 'FEEDING FRENZY', 'STARVED FURY']
    },
    'cinder-haematarch': {
      setpiece: 'solar_flare',
      telegraphName: 'CINDER DIVE',
      phaseNames: ['EMBER TRAIL', 'FLARE IGNITION', 'ASH COLLAPSE']
    },
    'glasswing-tyrant': {
      setpiece: 'gravity_well',
      telegraphName: 'GLASSWING REFRACTION',
      phaseNames: ['REFRACTIVE WINGS', 'SHARD STORM', 'PRISM SHATTER']
    },
    'null-proboscis': {
      setpiece: 'gravity_well',
      telegraphName: 'NULL MARK',
      phaseNames: ['BLINK STALKER', 'DOUBLE MARK', 'VOID COLLAPSE']
    },
    'carrion-queen': {
      setpiece: 'asteroid_field',
      telegraphName: 'CARRION HATCHERIES',
      phaseNames: ['HATCHERIES ACTIVE', 'BROOD SURGE', 'FINAL CLUTCH']
    },
    'boss': {
      // The Meridian Core, campaign-end boss (mission 15). Set-piece rotates
      // by phase so all three terrain hooks fire across one fight.
      setpiece: 'solar_flare',
      setpieceByPhase: ['asteroid_field', 'gravity_well', 'solar_flare'],
      telegraphName: 'CORE PULSE',
      phaseNames: ['SHELL FRACTURED', 'HEART EXPOSED', 'MERIDIAN COLLAPSE']
    }
  };

  // Given current hp fraction (0..1) and current phaseStage, returns the
  // phase stage (0,1,2) the boss should be in. Never returns a lower value
  // than the current stage (phases only escalate).
  function phaseForHpFrac(hpFrac, currentStage) {
    var stage = 0;
    for (var i = 0; i < PHASE_THRESHOLDS.length; i++) {
      if (hpFrac <= PHASE_THRESHOLDS[i]) stage = i + 1;
    }
    return Math.max(stage, currentStage || 0);
  }

  function metaFor(bossKey) {
    return BOSS_META[bossKey] || null;
  }

  function setpieceType(meta, phaseStage) {
    if (meta.setpieceByPhase) return meta.setpieceByPhase[Math.min(phaseStage || 0, meta.setpieceByPhase.length - 1)];
    return meta.setpiece;
  }

  // Arena set-piece descriptor: which terrain hook to invoke and how strong,
  // scaled by phase stage. Returns null if the boss key has no set-piece.
  // ctx: { x, y, rand } where rand is a seeded () -> [0,1) function, per the
  // hm2_world.js hook contract (no Math.random here). Reads only the real
  // HOOKS interface (spawn/collide/projectile/visibility), never invents
  // hook methods hm2_world.js does not export.
  function setpieceFor(bossKey, phaseStage, ctx) {
    var meta = metaFor(bossKey);
    if (!meta) return null;
    var type = setpieceType(meta, phaseStage);
    if (!type) return null;
    var world = (typeof window !== 'undefined') ? window.HM2_WORLD : null;
    var hooks = world && world.featureHooks ? world.featureHooks(type) : null;
    if (!hooks || !hooks.spawn) return null;
    var strength = 1 + (phaseStage || 0) * 0.5;
    var result = { type: type, strength: strength, points: [] };

    if (type === 'asteroid_field') {
      // Asteroid ring collapse: sample N points via the real spawn hook,
      // spread shrinking each phase so the ring visibly closes in.
      var count = 5 + (phaseStage || 0) * 2;
      var spread = Math.max(120, 480 - (phaseStage || 0) * 140);
      for (var i = 0; i < count; i++) {
        var pt = hooks.spawn({ spread: spread }, ctx);
        if (pt && isFinite(pt.x) && isFinite(pt.y)) result.points.push(pt);
      }
    } else if (type === 'gravity_well') {
      // Gravity well flip: spawn the well point, then invert its pull sign
      // on odd phases via the strength field (game.js applies the sign).
      var well = hooks.spawn({ strength: 240 * strength }, ctx);
      if (well && isFinite(well.x) && isFinite(well.y) && isFinite(well.strength)) {
        well.flip = (phaseStage % 2) === 1;
        result.well = well;
      }
    } else if (type === 'solar_flare') {
      // Flare barrage: several lanes via the real spawn hook, count scaling
      // with phase for a denser barrage in later phases.
      var laneCount = 2 + (phaseStage || 0);
      for (var j = 0; j < laneCount; j++) {
        var lane = hooks.spawn({ width: 260 * strength, period: 6 }, ctx);
        if (lane && isFinite(lane.x) && isFinite(lane.y)) result.points.push(lane);
      }
    }
    return result;
  }

  var HM2_BOSSES = {
    PHASE_THRESHOLDS: PHASE_THRESHOLDS,
    BOSS_META: BOSS_META,
    phaseForHpFrac: phaseForHpFrac,
    metaFor: metaFor,
    setpieceFor: setpieceFor
  };

  if (typeof window !== 'undefined') window.HM2_BOSSES = HM2_BOSSES;
  if (typeof module !== 'undefined' && module.exports) module.exports = HM2_BOSSES;
}());
