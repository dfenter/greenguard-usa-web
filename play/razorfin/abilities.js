/* Razorfin abilities. Lane E owns RF.Abilities only. */
(function (root) {
  'use strict';

  var RF = root.RF = root.RF || {};
  var EMPTY = [];
  var PI2 = Math.PI * 2;
  var UNKNOWN = {};

  /* These are deliberately data-independent so this file can construct before
     data.js in a headless probe. The boot scan below uses RFD when available. */
  var PASSIVE_IDS = {
    wideBite: 1, lunge: 1, lungeMega: 1, biteUp: 1, biteUpX: 1,
    filterFeed: 1, filterFeedMax: 1, ambush: 1, slowMetab: 1,
    slowMetabX: 1, junkEater: 1, pressureImmune: 1, armored: 1,
    coinMagnet: 1, fireWake: 1, fireWakeX: 1, dreadAura: 1,
    dreadAuraX: 1, undying: 1, comboPlus: 1, comboSpeed: 1, spines: 1,
    stealth: 1, regen: 1, freeTurn: 1, blink: 1, toxinWake: 1,
    freezeTouch: 1, shockTouch: 1, drain: 1, mineHeal: 1,
    fireImmune: 1, toxinEater: 1, infect: 1, surfacePower: 1,
    depthPower: 1, freezeField: 1
  };

  var ACTIVE_IDS = {
    pyro: 1, freeze: 1, volt: 1, toxin: 1, sonic: 1,
    vortex: 1, phase: 1, quake: 1, chrono: 1, atomic: 1
  };

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function num(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  function maxTimer(st, key, value) {
    value = num(value, 0);
    if (value <= 0) return;
    if (num(st[key], 0) < value) st[key] = value;
  }

  function entityState(ent) {
    if (!ent.st) ent.st = {};
    return ent.st;
  }

  function data() {
    return root.RFD || {};
  }

  function playerDef(player) {
    if (!player) return null;
    var def = player.def || player.sharkDef || player.definition || player.shark || null;
    if (typeof def === 'string') {
      var d = data();
      if (d.SHARK_BY_ID && d.SHARK_BY_ID[def]) return d.SHARK_BY_ID[def];
      return { id: def };
    }
    return def;
  }

  // Rev 6.11 item 9 (SUPERPOWER ECONOMY): sharks whose data.js def has no
  // `active` at all (the starter reef shark, data.js:6, and any other free
  // shark authored the same way) otherwise make the whole superpower system
  // invisible to a new player - no button, no charge meter, nothing to press.
  // data.js/gen_data.py belong to another lane this round, so rather than
  // authoring an active there, this resolver falls back to a cheap existing
  // active (Sonic Roar - the lowest `charge` cost in ABILITIES, see data.js)
  // whenever a shark def is otherwise ability-less. A player-level override
  // (player.active) still wins if one is ever set directly on the instance.
  var DEFAULT_ACTIVE_ID = 'sonic';
  function activeId(player) {
    var def = playerDef(player);
    // player.active must be STRING-guarded: on entities `active` is the
    // boolean liveness flag, and `true` here leaked into the HUD label.
    var override = player && typeof player.active === 'string' ? player.active : null;
    return (def && def.active) || override || DEFAULT_ACTIVE_ID;
  }

  function abilityDef(id) {
    var d = data();
    return d.ABILITIES && id ? d.ABILITIES[id] : null;
  }

  function sourceId(player) {
    var def = playerDef(player);
    return (player && (player.id || player.defId)) || (def && def.id) || 'player';
  }

  function passiveStruct() {
    return {
      wideBite: false,
      wideBiteMult: 1,
      lunge: false,
      lungeRangeMult: 1,
      biteUp: 0,
      biteUpTiers: 0,
      filterFeed: false,
      filterFeedMax: false,
      filterFeedMult: 1,
      ambush: false,
      ambushMult: 1,
      slowMetab: false,
      slowMetabMult: 1,
      junkEater: false,
      pressureImmune: false,
      armored: false,
      damageTakenMult: 1,
      coinMagnet: false,
      coinMagnetRange: 1,
      fireWake: false,
      fireWakeMult: 1,
      dreadAura: false,
      dreadAuraMult: 1,
      undying: false,
      comboPlus: false,
      comboPlusMult: 1,
      comboSpeed: false,
      comboSpeedMult: 1,
      spines: false,
      stealth: false,
      regen: false,
      regenRate: 0.04,
      freeTurn: false,
      blink: false,
      toxinWake: false,
      freezeTouch: false,
      shockTouch: false,
      drain: false,
      mineHeal: false,
      fireImmune: false,
      toxinEater: false,
      infect: false,
      surfacePower: false,
      depthPower: false,
      freezeField: false,
      speedMult: 1,
      biteMult: 1,
      boostMult: 1,
      hpMult: 1,
      metabMult: 1,
      chargeRateMult: 1,
      statMults: { speed: 1, bite: 1, boost: 1, hp: 1, metab: 1 }
    };
  }

  function reportUnknown(id, sharkId) {
    var key = String(sharkId || '?') + ':' + String(id);
    if (UNKNOWN[key]) return;
    UNKNOWN[key] = true;
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('Razorfin unknown passive id: ' + id + ' on shark ' + sharkId);
    }
  }

  function resolvePassives(sharkDef) {
    var out = passiveStruct();
    var ids = sharkDef && sharkDef.passives;
    if (!ids || !ids.length) return out;

    for (var i = 0; i < ids.length; i += 1) {
      var id = ids[i];
      if (!PASSIVE_IDS[id]) {
        reportUnknown(id, sharkDef && sharkDef.id);
        continue;
      }
      switch (id) {
        case 'wideBite':
          out.wideBite = true;
          out.wideBiteMult = 1.35;
          break;
        case 'lunge':
          out.lunge = true;
          out.lungeRangeMult = Math.max(out.lungeRangeMult, 1.25);
          break;
        case 'lungeMega':
          out.lunge = true;
          out.lungeRangeMult = Math.max(out.lungeRangeMult, 2);
          break;
        case 'biteUp':
          out.biteUp = Math.max(out.biteUp, 1);
          out.biteUpTiers = out.biteUp;
          out.biteMult = Math.max(out.biteMult, 1.1);
          break;
        case 'biteUpX':
          out.biteUp = Math.max(out.biteUp, 2);
          out.biteUpTiers = out.biteUp;
          out.biteMult = Math.max(out.biteMult, 1.2);
          break;
        case 'filterFeed':
          out.filterFeed = true;
          out.filterFeedMult = Math.max(out.filterFeedMult, 1.25);
          break;
        case 'filterFeedMax':
          out.filterFeed = true;
          out.filterFeedMax = true;
          out.filterFeedMult = Math.max(out.filterFeedMult, 1.6);
          break;
        case 'ambush':
          out.ambush = true;
          out.ambushMult = Math.max(out.ambushMult, 1.35);
          break;
        case 'slowMetab':
          out.slowMetab = true;
          out.slowMetabMult = Math.min(out.slowMetabMult, 0.75);
          out.metabMult = Math.min(out.metabMult, out.slowMetabMult);
          break;
        case 'slowMetabX':
          out.slowMetab = true;
          out.slowMetabMult = Math.min(out.slowMetabMult, 0.5);
          out.metabMult = Math.min(out.metabMult, out.slowMetabMult);
          break;
        case 'junkEater': out.junkEater = true; break;
        case 'pressureImmune': out.pressureImmune = true; break;
        case 'armored':
          out.armored = true;
          out.damageTakenMult = Math.min(out.damageTakenMult, 0.7);
          break;
        case 'coinMagnet':
          out.coinMagnet = true;
          out.coinMagnetRange = Math.max(out.coinMagnetRange, 1.2);
          break;
        case 'fireWake':
          out.fireWake = true;
          out.fireWakeMult = Math.max(out.fireWakeMult, 1);
          break;
        case 'fireWakeX':
          out.fireWake = true;
          out.fireWakeMult = Math.max(out.fireWakeMult, 2);
          break;
        case 'dreadAura':
          out.dreadAura = true;
          out.dreadAuraMult = Math.max(out.dreadAuraMult, 1);
          break;
        case 'dreadAuraX':
          out.dreadAura = true;
          out.dreadAuraMult = Math.max(out.dreadAuraMult, 2);
          break;
        case 'undying': out.undying = true; break;
        case 'comboPlus':
          out.comboPlus = true;
          out.comboPlusMult = Math.max(out.comboPlusMult, 1.25);
          break;
        case 'comboSpeed':
          out.comboSpeed = true;
          out.comboSpeedMult = Math.max(out.comboSpeedMult, 1.25);
          break;
        case 'spines': out.spines = true; break;
        case 'stealth': out.stealth = true; break;
        case 'regen': out.regen = true; break;
        case 'freeTurn': out.freeTurn = true; break;
        case 'blink': out.blink = true; break;
        case 'toxinWake': out.toxinWake = true; break;
        case 'freezeTouch': out.freezeTouch = true; break;
        case 'shockTouch': out.shockTouch = true; break;
        case 'drain': out.drain = true; break;
        case 'mineHeal': out.mineHeal = true; break;
        case 'fireImmune': out.fireImmune = true; break;
        case 'toxinEater': out.toxinEater = true; break;
        case 'infect': out.infect = true; break;
        case 'surfacePower': out.surfacePower = true; break;
        case 'depthPower': out.depthPower = true; break;
        case 'freezeField': out.freezeField = true; break;
      }
    }

    out.statMults.speed = out.speedMult;
    out.statMults.bite = out.biteMult;
    out.statMults.boost = out.boostMult;
    out.statMults.hp = out.hpMult;
    out.statMults.metab = out.metabMult;
    return out;
  }

  function bootScan() {
    var d = data();
    var sharks = d.SHARKS;
    if (!sharks || !sharks.length) return;
    for (var i = 0; i < sharks.length; i += 1) {
      var shark = sharks[i];
      var ids = shark && shark.passives;
      if (ids) {
        for (var j = 0; j < ids.length; j += 1) {
          if (!PASSIVE_IDS[ids[j]]) reportUnknown(ids[j], shark.id);
        }
      }
      if (shark && shark.active && !ACTIVE_IDS[shark.active] && root.console && typeof root.console.error === 'function') {
        root.console.error('Razorfin unknown active id: ' + shark.active + ' on shark ' + shark.id);
      }
    }
  }

  function stateFor(player) {
    var st = entityState(player);
    var state = st._rfAbility;
    if (!state) {
      state = {
        active: null,
        t: 0,
        elapsed: 0,
        triggered: false,
        prevTimeScale: 1,
        lastX: 0,
        lastY: 0,
        trailT: 0,
        passiveT: 0,
        chainVisited: [],
        chainCount: 0,
        passives: null,
        passiveDef: null,
        statMults: { speed: 1, bite: 1, boost: 1, hp: 1, metab: 1 }
      };
      st._rfAbility = state;
    }
    return state;
  }

  function getPassives(player, state) {
    var def = playerDef(player);
    if (state.passiveDef !== def) {
      state.passiveDef = def;
      state.passives = resolvePassives(def);
    }
    syncPlayerPassives(player, state.passives);
    return state.passives;
  }

  /* Player is deliberately outside World.entities, so world.js cannot publish
     these resolved self-status flags for it. Keep the status block as the
     cross-module source of truth, while p.pas remains the game-side resolver. */
  function syncPlayerPassives(player, passives) {
    if (!player) return;
    var st = entityState(player);
    passives = passives || passiveStruct();
    st.fireImmune = !!passives.fireImmune;
    st.toxinEater = !!passives.toxinEater;
    st.toxinImmune = !!(passives.toxinImmune || passives.toxinEater);
    st.pressureImmune = !!passives.pressureImmune;
    st.freezeField = !!passives.freezeField;
  }

  function tickTimer(st, key, dt) {
    var value = num(st[key], 0);
    if (value <= 0) {
      st[key] = 0;
      return 0;
    }
    value -= dt;
    if (value < 0) value = 0;
    st[key] = value;
    return value;
  }

  function tickPlayerAbilityTimers(player, dt) {
    var st = entityState(player);
    var phaseT = tickTimer(st, 'phaseT', dt);
    st.phase = phaseT > 0;

    /* powerT is mirrored from the active state below. Ticking it here also
       closes the gap when an active is interrupted before its next update. */
    tickTimer(st, 'powerT', dt);

    /* regenT is a player-side marker owned by this module. It is not a World
       status, so expire its companion rate here instead of leaving stale data. */
    if (tickTimer(st, 'regenT', dt) <= 0) st.regenRate = 0;

    /* invulnT is game.js-owned and is intentionally not decremented here. */
  }

  function upgradeLevel(ctx) {
    var p = ctx && ctx.player;
    var up = p && p.up;
    var level = up && up.power;
    if (level && typeof level === 'object') level = level.level;
    // No global-save fallback: player.up is the per-shark snapshot game.js
    // attaches at run start (REVIEW-2 RF-PROFILE-01). Absent means level 0.
    return Math.max(0, num(level, 0));
  }

  function chargeMultiplier(ctx) {
    var d = data();
    var effect = d.ECONOMY && d.ECONOMY.upgradeEffect;
    var perLevel = effect && num(effect.power, 0);
    return 1 + upgradeLevel(ctx) * perLevel;
  }

  function meter(player) {
    var st = entityState(player);
    var value = st.powerCharge;
    if (typeof value !== 'number') value = 0;
    return Math.max(0, value);
  }

  function setMeter(player, value) {
    var st = entityState(player);
    st.powerCharge = Math.max(0, num(value, 0));
    return st.powerCharge;
  }

  // FIX-ROUND-3 item 3 (SUPERPOWER OPENING): the ability meter starts FULL at
  // run start, so one of the 3 opening powerCharges (engine3d.js
  // POWER_CHARGE_START) is immediately usable rather than requiring a fresh
  // feed to fill the meter from zero first. Meter/charge economy AFTER the
  // first fire is completely unchanged - this only seeds the starting value.
  // Engine-called once per startRun, before the first canFire() check; a
  // player with no resolvable active (or an active with no charge cost) is a
  // silent no-op rather than a throw.
  function seedMeterFull(ctx) {
    var player = ctx && ctx.player;
    if (!player) return;
    var id = activeId(player);
    var def = abilityDef(id);
    var charge = def && num(def.charge, 0);
    if (!charge) return;
    setMeter(player, charge);
  }

  function worldFor(ctx) {
    var world = RF.World;
    if (!world || typeof world.query !== 'function') world = ctx && ctx.world;
    return world || null;
  }

  function query(ctx, x, y, radius) {
    var world = worldFor(ctx);
    if (!world || typeof world.query !== 'function') return EMPTY;
    var result = world.query(x, y, radius, null);
    return result && result.length ? result : EMPTY;
  }

  function kill(ctx, ent, cause) {
    var world = worldFor(ctx);
    if (world && typeof world.kill === 'function') {
      world.kill(ent, cause);
      return;
    }
    ent.hp = 0;
    entityState(ent).dead = true;
    ent.active = false;
  }

  function targetable(ent, player, includePickups) {
    if (!ent || ent === player || ent.active === false) return false;
    if (ent.kind === 'player') return false;
    if (!includePickups && ent.kind === 'pickup') return false;
    return true;
  }

  function distSq(a, b, x, y) {
    var dx = num(a && a.x, 0) - x;
    var dy = num(a && a.y, 0) - y;
    return dx * dx + dy * dy;
  }

  function angleOf(player) {
    if (typeof player.angle === 'number') return player.angle;
    if (typeof player.rotation === 'number') return player.rotation;
    var vx = num(player.vx, 0);
    var vy = num(player.vy, 0);
    if (vx || vy) return Math.atan2(vy, vx);
    return 0;
  }

  function angleDelta(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= PI2;
    while (d < -Math.PI) d += PI2;
    return d;
  }

  /* FX options are reused because Fx.emit is fire-and-forget and reads opts
     synchronously. No emitter or per-step options object is created here. */
  var FX_OPTS = { tint: 0, scale: 1, count: 1, angle: 0 };
  var BEAM_OPTS = { tint: 0, width: 1, alpha: 1 };

  function emit(name, x, y, tint, scale, count, angle) {
    var fx = RF.Fx;
    if (!fx || typeof fx.emit !== 'function') return;
    FX_OPTS.tint = tint;
    FX_OPTS.scale = scale || 1;
    FX_OPTS.count = count || 1;
    FX_OPTS.angle = num(angle, 0);
    fx.emit(name, x, y, FX_OPTS);
  }

  function beam(x1, y1, x2, y2, tint, width) {
    var fx = RF.Fx;
    if (!fx || typeof fx.beam !== 'function') return;
    BEAM_OPTS.tint = tint;
    BEAM_OPTS.width = width || 1;
    BEAM_OPTS.alpha = 1;
    fx.beam(x1, y1, x2, y2, BEAM_OPTS);
  }

  function sound(name) {
    if (RF.Sound && typeof RF.Sound.play === 'function') RF.Sound.play(name);
  }

  function noteDamage(ent, player, amount) {
    var st = entityState(ent);
    var dmg = Math.max(0, num(amount, 0));
    st.damage = num(st.damage, 0) + dmg;
    st.powerDmg = num(st.powerDmg, 0) + dmg;
    st.damageBy = sourceId(player);
    maxTimer(st, 'damageT', 1 / 60);
  }

  function applyBurn(ent, player, duration, amount) {
    if (!targetable(ent, player, false)) return;
    var st = entityState(ent);
    if (st.fireImmune) return;
    maxTimer(st, 'burnT', duration);
    st.burnDmg = Math.max(num(st.burnDmg, 0), num(amount, 0));
    st.cookedBy = sourceId(player);
  }

  function applyPoison(ent, player, duration, amount) {
    if (!targetable(ent, player, false)) return;
    var st = entityState(ent);
    if (st.toxinImmune) return;
    maxTimer(st, 'poisonT', duration);
    st.poisonDmg = Math.max(num(st.poisonDmg, 0), num(amount, 0));
    st.poisonBy = sourceId(player);
  }

  function applyPulse(ctx, player, state, def) {
    var targets = query(ctx, player.x, player.y, num(def.range, 0));
    var effectDuration = num(def.effectDur, num(def.dur, 0.5));
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!targetable(ent, player, false)) continue;
      var st = entityState(ent);
      if (state.active === 'freeze') {
        maxTimer(st, 'frozenT', effectDuration);
        st.freezeBy = sourceId(player);
      } else {
        if (def.stun) maxTimer(st, 'stunT', def.stun);
        if (def.fear) {
          maxTimer(st, 'fearT', def.fear);
          st.fearBy = sourceId(player);
          var dx = num(ent.x, 0) - num(player.x, 0);
          var dy = num(ent.y, 0) - num(player.y, 0);
          var length = Math.sqrt(dx * dx + dy * dy) || 1;
          st.fearX = dx / length;
          st.fearY = dy / length;
        }
        if (def.dmg) noteDamage(ent, player, def.dmg);
      }
    }
    emit('ring', player.x, player.y, num(def.tint, 0), 1.2, 2, 0);
    state.triggered = true;
  }

  function applyCone(ctx, player, state, def) {
    var range = num(def.range, 0);
    var arc = num(def.arc, Math.PI / 2);
    var heading = angleOf(player);
    var targets = query(ctx, player.x, player.y, range);
    var duration = Math.max(0.2, num(def.dur, 1));
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!targetable(ent, player, false)) continue;
      var dx = num(ent.x, 0) - num(player.x, 0);
      var dy = num(ent.y, 0) - num(player.y, 0);
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > range) continue;
      if (Math.abs(angleDelta(Math.atan2(dy, dx), heading)) > arc * 0.5) continue;
      applyBurn(ent, player, duration, def.dmg);
    }
    state.passiveT -= num(state.dt, 1 / 60);
    if (state.passiveT <= 0) {
      emit('elementSpark', player.x, player.y, num(def.tint, 0), 1.15, 2, heading);
      state.passiveT = 0.12;
    }
  }

  function applyChain(ctx, player, state, def) {
    if (state.triggered) return;
    state.chainVisited.length = 0;
    state.chainCount = 0;
    var fromX = num(player.x, 0);
    var fromY = num(player.y, 0);
    var jumps = Math.max(0, Math.floor(num(def.jumps, 0)));
    var first = true;
    for (var jump = 0; jump < jumps; jump += 1) {
      var radius = first ? num(def.range, 0) : num(def.jumpRange, 0);
      var targets = query(ctx, fromX, fromY, radius);
      var best = null;
      var bestDistance = radius * radius;
      for (var i = 0; i < targets.length; i += 1) {
        var ent = targets[i];
        if (!targetable(ent, player, false)) continue;
        var seen = false;
        for (var s = 0; s < state.chainCount; s += 1) {
          if (state.chainVisited[s] === ent) {
            seen = true;
            break;
          }
        }
        if (seen) continue;
        var d2 = distSq(ent, null, fromX, fromY);
        if (d2 <= bestDistance) {
          bestDistance = d2;
          best = ent;
        }
      }
      if (!best) break;
      state.chainVisited[state.chainCount] = best;
      state.chainCount += 1;
      var bestState = entityState(best);
      maxTimer(bestState, 'shockT', Math.max(0.2, num(def.dur, 0.5)));
      bestState.shockBy = sourceId(player);
      noteDamage(best, player, def.dmg);
      emit('elementSpark', best.x, best.y, num(def.tint, 0), 1, 2, 0);
      beam(fromX, fromY, num(best.x, 0), num(best.y, 0), num(def.tint, 0), 8);
      fromX = num(best.x, 0);
      fromY = num(best.y, 0);
      first = false;
    }
    emit('ring', player.x, player.y, num(def.tint, 0), 0.8, 1, 0);
    state.triggered = true;
  }

  function applyTrail(ctx, player, state, def) {
    var dt = num(state.dt, 1 / 60);
    state.trailT -= dt;
    if (state.triggered && state.trailT > 0) return;
    var x = num(player.x, 0);
    var y = num(player.y, 0);
    var heading = angleOf(player);
    if (!state.triggered) {
      state.lastX = x;
      state.lastY = y;
      state.triggered = true;
    }
    var targets = query(ctx, x, y, num(def.range, 90));
    for (var i = 0; i < targets.length; i += 1) {
      applyPoison(targets[i], player, num(def.dur, 1), def.dot);
    }
    emit('elementSpark', x - Math.cos(heading) * 24, y - Math.sin(heading) * 24, num(def.tint, 0), 0.8, 2, heading + Math.PI);
    state.trailT = 0.14;
  }

  function applyField(ctx, player, state, def) {
    var targets = query(ctx, player.x, player.y, num(def.range, 0));
    var px = num(player.x, 0);
    var py = num(player.y, 0);
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!targetable(ent, player, false)) continue;
      var dx = px - num(ent.x, 0);
      var dy = py - num(ent.y, 0);
      var length = Math.sqrt(dx * dx + dy * dy);
      if (!length) continue;
      var st = entityState(ent);
      st.pullX = dx / length;
      st.pullY = dy / length;
      st.pullPower = num(def.pull, 0);
      maxTimer(st, 'pullT', 0.15);
      st.vortexX = st.pullX;
      st.vortexY = st.pullY;
      st.vortexPower = st.pullPower;
      maxTimer(st, 'vortexT', 0.15);
    }
    emit('ring', player.x, player.y, num(def.tint, 0), 1.1, 1, 0);
  }

  function applySelf(ctx, player, state, def) {
    var st = entityState(player);
    if (state.active === 'phase') {
      maxTimer(st, 'phaseT', Math.max(0, state.t));
      st.phase = num(st.phaseT, 0) > 0;
      emit('elementSpark', player.x, player.y, num(def.tint, 0), 1.1, 1, angleOf(player));
    }
  }

  function beamHit(ctx, player, state, def) {
    var heading = angleOf(player);
    var range = num(def.range, 0);
    var width = num(def.width, 1);
    var cos = Math.cos(heading);
    var sin = Math.sin(heading);
    var x1 = num(player.x, 0);
    var y1 = num(player.y, 0);
    var x2 = x1 + cos * range;
    var y2 = y1 + sin * range;
    if (state.elapsed < num(def.windup, 0)) {
      emit('elementSpark', x1, y1, num(def.tint, 0), 1.5, 3, heading);
      return;
    }
    beam(x1, y1, x2, y2, num(def.tint, 0), width);
    if (state.triggered) return;
    var targets = query(ctx, x1, y1, range + width);
    var halfWidth = width * 0.5;
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!targetable(ent, player, true)) continue;
      var dx = num(ent.x, 0) - x1;
      var dy = num(ent.y, 0) - y1;
      var along = dx * cos + dy * sin;
      if (along < 0 || along > range) continue;
      var across = Math.abs(dx * sin - dy * cos);
      var radius = num(ent.r, 0);
      if (across > halfWidth + radius) continue;
      var st = entityState(ent);
      st.atomicBy = sourceId(player);
      st.atomicDmg = num(def.dmg, 99);
      st.atomicT = 1 / 60;
      kill(ctx, ent, 'atomic');
    }
    state.triggered = true;
  }

  function runActive(ctx, player, state, def) {
    state.dt = num(ctx && ctx.time && ctx.time.dt, 1 / 60);
    switch (def.kind) {
      case 'cone': applyCone(ctx, player, state, def); break;
      case 'pulse':
        if (!state.triggered) applyPulse(ctx, player, state, def);
        else if (state.active === 'sonic' || state.active === 'quake') {
          emit('ring', player.x, player.y, num(def.tint, 0), 0.85, 1, 0);
        }
        break;
      case 'chain': applyChain(ctx, player, state, def); break;
      case 'trail': applyTrail(ctx, player, state, def); break;
      case 'field': applyField(ctx, player, state, def); break;
      case 'self': applySelf(ctx, player, state, def); break;
      case 'beam': beamHit(ctx, player, state, def); break;
    }
  }

  function finishActive(ctx, player, state) {
    if (state.active === 'chrono' && ctx && ctx.run) {
      ctx.run.timeScale = num(state.prevTimeScale, 1);
    }
    state.active = null;
    state.t = 0;
    state.elapsed = 0;
    state.triggered = false;
    state.passiveT = 0;
    state.trailT = 0;
    state.chainCount = 0;
    if (state.chainVisited) state.chainVisited.length = 0;
    state.prevTimeScale = 1;
    clearActivePlayerState(player);
  }

  function clearActivePlayerState(player) {
    var st = entityState(player);
    st.phaseT = 0;
    st.phase = false;
    st.powerId = null;
    st.powerT = 0;
    st.powerActive = false;
  }

  function reset(ctx) {
    if (ctx && ctx.run) ctx.run.timeScale = 1;
    var player = ctx && ctx.player;
    if (!player) return;

    var st = entityState(player);
    var state = st._rfAbility;
    if (state) {
      state.active = null;
      state.t = 0;
      state.elapsed = 0;
      state.triggered = false;
      state.prevTimeScale = 1;
      state.lastX = 0;
      state.lastY = 0;
      state.trailT = 0;
      state.passiveT = 0;
      state.chainCount = 0;
      if (state.chainVisited) state.chainVisited.length = 0;
      state.passives = null;
      state.passiveDef = null;
      state.statMults.speed = 1;
      state.statMults.bite = 1;
      state.statMults.boost = 1;
      state.statMults.hp = 1;
      state.statMults.metab = 1;
    }

    clearActivePlayerState(player);
    st.powerCharge = 0;
    st.regenT = 0;
    st.regenRate = 0;
    st.speedMult = 1;
    st.biteMult = 1;
    st.boostMult = 1;
    st.hpMult = 1;
    st.metabMult = 1;
    st.statMults = state ? state.statMults : { speed: 1, bite: 1, boost: 1, hp: 1, metab: 1 };
    st.fireImmune = false;
    st.toxinEater = false;
    st.toxinImmune = false;
    st.pressureImmune = false;
    st.freezeField = false;
  }

  function zoneFor(ctx, y) {
    var world = worldFor(ctx);
    if (world && typeof world.zoneAt === 'function') return world.zoneAt(y);
    var zones = data().ZONES || EMPTY;
    for (var i = 0; i < zones.length; i += 1) {
      if (y >= num(zones[i].yMin, -Infinity) && y <= num(zones[i].yMax, Infinity)) return zones[i];
    }
    return null;
  }

  function updateStatMultipliers(ctx, player, state, passives) {
    var st = entityState(player);
    var mult = state.statMults;
    mult.speed = passives.speedMult;
    mult.bite = passives.biteMult;
    mult.boost = passives.boostMult;
    mult.hp = passives.hpMult;
    mult.metab = passives.metabMult;

    var zone = zoneFor(ctx, num(player.y, 0));
    var yMin = zone ? num(zone.yMin, 0) : 0;
    var yMax = zone ? num(zone.yMax, 3600) : 3600;
    var span = Math.max(1, yMax - yMin);
    var factor = clamp((num(player.y, 0) - yMin) / span, 0, 1);
    var zoneMult = 1;
    if (passives.surfacePower) zoneMult = Math.max(zoneMult, 1 + (1 - factor) * 0.25);
    if (passives.depthPower) zoneMult = Math.max(zoneMult, 1 + factor * 0.25);
    mult.speed *= zoneMult;
    mult.bite *= zoneMult;
    mult.boost *= zoneMult;

    if (passives.comboSpeed) {
      var combo = ctx && ctx.run ? Math.max(0, num(ctx.run.combo, 0)) : 0;
      mult.speed *= 1 + Math.min(10, combo) * 0.025 * passives.comboSpeedMult;
    }

    st.speedMult = mult.speed;
    st.biteMult = mult.bite;
    st.boostMult = mult.boost;
    st.hpMult = mult.hp;
    st.metabMult = mult.metab;
    st.statMults = mult;
  }

  function fireWake(ctx, player, state, passives) {
    state.passiveT -= num(state.dt, 1 / 60);
    if (state.passiveT > 0) return;
    var heading = angleOf(player);
    var x = num(player.x, 0) - Math.cos(heading) * Math.max(20, num(player.r, 24));
    var y = num(player.y, 0) - Math.sin(heading) * Math.max(20, num(player.r, 24));
    var radius = 70 * passives.fireWakeMult;
    var damage = 1.2 * passives.fireWakeMult;
    var targets = query(ctx, x, y, radius);
    for (var i = 0; i < targets.length; i += 1) applyBurn(targets[i], player, 0.85, damage);
    emit('elementSpark', x, y, 16742953, 0.7 * passives.fireWakeMult, 2, heading + Math.PI);
    state.passiveT = 0.14;
  }

  function dreadAura(ctx, player, passives) {
    var radius = 220 * passives.dreadAuraMult;
    var targets = query(ctx, player.x, player.y, radius);
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!targetable(ent, player, false) || ent.kind !== 'prey') continue;
      var dx = num(player.x, 0) - num(ent.x, 0);
      var dy = num(player.y, 0) - num(ent.y, 0);
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var st = entityState(ent);
      maxTimer(st, 'dreadT', 0.18);
      maxTimer(st, 'fearT', 0.18);
      st.dreadX = dx / length;
      st.dreadY = dy / length;
      st.fearInvert = true;
      st.dreadBy = sourceId(player);
    }
    emit('elementSpark', player.x, player.y, 16769162, 0.5, 1, 0);
  }

  function coinMagnet(ctx, player, passives) {
    var targets = query(ctx, player.x, player.y, 260 * passives.coinMagnetRange);
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!ent || ent === player || ent.active === false || ent.kind !== 'pickup') continue;
      var dx = num(player.x, 0) - num(ent.x, 0);
      var dy = num(player.y, 0) - num(ent.y, 0);
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var st = entityState(ent);
      st.magnetX = dx / length;
      st.magnetY = dy / length;
      st.magnetPower = 520;
      maxTimer(st, 'magnetT', 0.18);
      st.magnetBy = sourceId(player);
    }
  }

  function regen(player, passives, dt) {
    if (typeof player.hp !== 'number') return;
    var maxHp = num(player.maxHp, player.hp);
    if (maxHp <= 0 || player.hp >= maxHp) return;
    player.hp = Math.min(maxHp, player.hp + maxHp * passives.regenRate * dt);
    entityState(player).regenT = 0.2;
    entityState(player).regenRate = passives.regenRate;
  }

  function freezeField(ctx, player) {
    var targets = query(ctx, player.x, player.y, 190);
    for (var i = 0; i < targets.length; i += 1) {
      var ent = targets[i];
      if (!targetable(ent, player, false)) continue;
      var st = entityState(ent);
      maxTimer(st, 'frozenT', 0.3);
      st.freezeBy = sourceId(player);
    }
    emit('ring', player.x, player.y, 9431295, 0.65, 1, 0);
  }

  function passiveRuntime(ctx, player, state, passives) {
    var dt = num(ctx && ctx.time && ctx.time.dt, 1 / 60);
    state.dt = dt;
    updateStatMultipliers(ctx, player, state, passives);
    if (passives.fireWake) fireWake(ctx, player, state, passives);
    if (passives.dreadAura) dreadAura(ctx, player, passives);
    if (passives.coinMagnet) coinMagnet(ctx, player, passives);
    if (passives.regen) regen(player, passives, dt);
    if (passives.freezeField) freezeField(ctx, player);
  }

  function canFire(ctx) {
    var player = ctx && ctx.player;
    if (!player || player.active === false) return false;
    var id = activeId(player);
    var def = abilityDef(id);
    if (!def || !num(def.charge, 0)) return false;
    var state = stateFor(player);
    getPassives(player, state);
    if (state.active && state.t > 0) return false;
    if (num(entityState(player).powerT, 0) > 0) return false;
    return meter(player) >= num(def.charge, Infinity);
  }

  function fire(ctx) {
    if (!canFire(ctx)) return false;
    var player = ctx.player;
    var id = activeId(player);
    var def = abilityDef(id);
    var state = stateFor(player);
    var st = entityState(player);
    setMeter(player, 0);
    state.active = id;
    state.t = Math.max(1 / 60, num(def.dur, num(def.windup, 0.5)));
    state.elapsed = 0;
    state.triggered = false;
    state.passiveT = 0;
    state.trailT = 0;
    state.chainCount = 0;
    state.lastX = num(player.x, 0);
    state.lastY = num(player.y, 0);
    state.dt = num(ctx.time && ctx.time.dt, 1 / 60);
    if (id === 'chrono' && ctx.run) {
      state.prevTimeScale = num(ctx.run.timeScale, 1);
      ctx.run.timeScale = num(def.worldScale, 1);
    }
    st.powerId = id;
    st.powerT = state.t;
    st.powerActive = true;
    sound(def.sfx);
    emit('ring', player.x, player.y, num(def.tint, 0), 0.9, 1, angleOf(player));
    abilityFireSpectacle(player, def, id);
    return true;
  }

  // Rev 6.11 item 10 / FIX-ROUND-3 item 6: ability-fire spectacle hooks. F2
  // owns the actual visuals (fx3d.js primitives + shark3d.js's rfFlash
  // body-tint hook); this lane only owns FIRING them, with the right timing
  // (once, at the moment of fire), position (the player), and now the
  // element kind (the ability id, e.g. 'pyro'/'sonic'/'atomic') and an
  // explicit `atomic` flag so fx3d can key its per-element signature and the
  // Atomic/kaiju ceiling treatment off something more direct than re-deriving
  // family from the raw tint value. Every call is individually guarded - an
  // F2 primitive that has not landed yet, or landed under a different name,
  // must never throw out of fire() - and calls are independent of each other
  // so their relative order never matters.
  function abilityFireSpectacle(player, def, id) {
    var tint = num(def && def.tint, 0);
    var isAtomic = id === 'atomic';
    var fx = RF.Fx;
    if (fx) {
      if (typeof fx.eatShockwave === 'function') {
        try {
          fx.eatShockwave(player.x, player.y, {
            tint: tint, scale: isAtomic ? 1.8 : 1.3, kind: id, atomic: isAtomic
          });
        } catch (err) { warnOnce('Fx.eatShockwave', err); }
      }
      if (typeof fx.hologramFlash === 'function') {
        try {
          fx.hologramFlash(player.x, player.y, {
            tint: tint, count: isAtomic ? 24 : 16, kind: id, atomic: isAtomic
          });
        } catch (err) { warnOnce('Fx.hologramFlash', err); }
      }
      if (typeof fx.requestVignette === 'function') {
        try { fx.requestVignette('buff', isAtomic ? 1400 : 900); } catch (err) { warnOnce('Fx.requestVignette', err); }
      }
    }
    var rig = player.rig && player.rig.group;
    var flash = rig && rig.userData && rig.userData.rfFlash;
    if (typeof flash === 'function') {
      try { flash(tint || 0xff2bd6, num(def && def.dur, 0.4), isAtomic ? 1.4 : 1); } catch (err) { warnOnce('rfFlash', err); }
    }
  }
  function warnOnce(tag, err) {
    if (warnOnce._seen && warnOnce._seen[tag]) return;
    warnOnce._seen = warnOnce._seen || {};
    warnOnce._seen[tag] = true;
    if (typeof console !== 'undefined' && console.warn) console.warn('[RF.Abilities] ' + tag, err);
  }

  function update(ctx) {
    var player = ctx && ctx.player;
    if (!player) return;
    if (player.active === false) {
      reset(ctx);
      return;
    }
    var state = stateFor(player);
    var passives = getPassives(player, state);
    var dt = Math.max(0, num(ctx && ctx.time && ctx.time.dt, 1 / 60));
    state.dt = dt;
    tickPlayerAbilityTimers(player, dt);

    if (state.active && state.t > 0) {
      var id = state.active;
      var def = abilityDef(id);
      state.elapsed += dt;
      state.t -= dt;
      entityState(player).powerT = Math.max(0, state.t);
      if (def) {
        if (id === 'chrono' && ctx.run) ctx.run.timeScale = num(def.worldScale, 1);
        runActive(ctx, player, state, def);
      }
      if (state.t <= 0) finishActive(ctx, player, state);
    }

    passiveRuntime(ctx, player, state, passives);
  }

  function chargeFromEat(ctx, ent) {
    var player = ctx && ctx.player;
    var id = activeId(player);
    var def = abilityDef(id);
    if (!player || !def || !num(def.charge, 0) || !ent) return 0;
    var tier = num(ent.tier, NaN);
    if (!isFinite(tier) && ent.defId) {
      var d = data();
      var creature = d.CREATURE_BY_ID && d.CREATURE_BY_ID[ent.defId];
      tier = creature && num(creature.tier, NaN);
    }
    tier = Math.max(1, num(tier, 1));
    var amount = tier * chargeMultiplier(ctx);
    var next = Math.min(num(def.charge, amount), meter(player) + amount);
    setMeter(player, next);
    return amount;
  }

  function hud(ctx) {
    var player = ctx && ctx.player;
    var id = activeId(player);
    var def = abilityDef(id);
    if (!player || !def) return { charge: 0, ready: false, id: id || null, tint: 0 };
    var full = num(def.charge, 0);
    var charge = full > 0 ? clamp(meter(player) / full, 0, 1) : 0;
    return {
      charge: charge,
      ready: canFire(ctx),
      id: id,
      tint: num(def.tint, 0)
    };
  }

  function selftest() {
    var notes = [];
    var oldWorld = RF.World;
    var oldFx = RF.Fx;
    var oldSound = RF.Sound;
    var oldRFD = root.RFD;
    var fakeEntities = [
      { active: true, kind: 'prey', tier: 2, x: 70, y: 0, r: 8, st: {} },
      { active: true, kind: 'prey', tier: 3, x: 170, y: 0, r: 8, st: {} },
      { active: true, kind: 'hazard', defId: 'mine', tier: 99, x: 260, y: 0, r: 8, st: {} }
    ];
    var killed = 0;
    try {
      if (!root.RFD || !root.RFD.ABILITIES) {
        root.RFD = {
          ABILITIES: {
            freeze: { kind: 'pulse', range: 300, dur: 0.4, effectDur: 3, charge: 15, tint: 1 },
            volt: { kind: 'chain', range: 260, jumps: 6, jumpRange: 180, dmg: 2, dur: 0.5, charge: 12, tint: 2 },
            phase: { kind: 'self', dur: 2.6, charge: 14, tint: 4 },
            chrono: { kind: 'self', dur: 0.2, worldScale: 0.35, charge: 18, tint: 3 }
          },
          ECONOMY: { upgradeEffect: { power: 0.08 } },
          CREATURE_BY_ID: {}
        };
      }
      RF.World = {
        query: function (x, y, radius) {
          var result = [];
          var r2 = radius * radius;
          for (var i = 0; i < fakeEntities.length; i += 1) {
            if (distSq(fakeEntities[i], null, x, y) <= r2) result.push(fakeEntities[i]);
          }
          return result;
        },
        kill: function (ent) { ent.active = false; ent.hp = 0; killed += 1; }
      };
      RF.Fx = { emit: function () {}, beam: function () {} };
      RF.Sound = { play: function () {} };
      var player = {
        active: true, kind: 'player', id: 'selftest', x: 0, y: 0, angle: 0,
        hp: 10, maxHp: 10, st: { powerCharge: 99 },
        def: { id: 'selftest', active: 'freeze', passives: [] },
        up: { power: 2 }
      };
      var ctx = { player: player, run: { timeScale: 1, combo: 0 }, time: { dt: 0.1 } };
      if (!canFire(ctx) || !fire(ctx)) notes.push('freeze did not arm');
      update(ctx);
      if (!(fakeEntities[0].st.frozenT > 0)) notes.push('freeze timer was not set');
      for (var freezeStep = 0; freezeStep < 4; freezeStep += 1) update(ctx);

      player.def.active = 'volt';
      setMeter(player, 99);
      if (!fire(ctx)) notes.push('volt did not arm');
      update(ctx);
      if (!(fakeEntities[0].st.shockT > 0) || !(fakeEntities[1].st.shockT > 0)) notes.push('volt chain did not jump');
      for (var voltStep = 0; voltStep < 5; voltStep += 1) update(ctx);

      player.def.active = 'chrono';
      setMeter(player, 99);
      if (!fire(ctx) || ctx.run.timeScale !== 0.35) notes.push('chrono did not set scale');
      for (var step = 0; step < 40; step += 1) update(ctx);
      if (ctx.run.timeScale !== 1) notes.push('chrono did not restore scale');

      player.def = { id: 'phase-selftest', active: 'phase', passives: ['fireImmune', 'toxinEater', 'pressureImmune'] };
      update(ctx);
      if (!player.st.fireImmune || !player.st.toxinEater || !player.st.toxinImmune || !player.st.pressureImmune) {
        notes.push('player passive immunities were not copied to status');
      }
      setMeter(player, 99);
      if (!fire(ctx)) notes.push('phase did not arm');
      update(ctx);
      if (!player.st.phase || !(player.st.phaseT > 0)) notes.push('phase status was not set');
      for (var phaseStep = 0; phaseStep < 40; phaseStep += 1) update(ctx);
      if (player.st.phase || player.st.phaseT !== 0) notes.push('phase status did not expire');

      player.def = { id: 'chrono-reset-selftest', active: 'chrono', passives: [] };
      setMeter(player, 99);
      if (!fire(ctx) || ctx.run.timeScale !== 0.35) notes.push('chrono reset setup did not set scale');
      reset(ctx);
      if (ctx.run.timeScale !== 1 || player.st.powerActive || player.st.powerT !== 0) {
        notes.push('forced ability reset did not clear chrono state');
      }

      setMeter(player, 0);
      player.def.active = 'chrono';
      var added = chargeFromEat(ctx, { kind: 'prey', tier: 3 });
      if (Math.abs(added - 3.48) > 0.0001 || Math.abs(meter(player) - 3.48) > 0.0001) notes.push('charge math was incorrect');
      if (killed !== 0) notes.push('selftest unexpectedly killed an entity');
    } catch (error) {
      notes.push('exception: ' + (error && error.message ? error.message : String(error)));
    } finally {
      RF.World = oldWorld;
      RF.Fx = oldFx;
      RF.Sound = oldSound;
      root.RFD = oldRFD;
    }
    return { pass: notes.length === 0, notes: notes };
  }

  bootScan();

  RF.Abilities = {
    passives: resolvePassives,
    canFire: canFire,
    fire: fire,
    update: update,
    reset: reset,
    chargeFromEat: chargeFromEat,
    seedMeterFull: seedMeterFull,
    hud: hud,
    __selftest: selftest
  };
})(typeof window !== 'undefined' ? window : globalThis);
