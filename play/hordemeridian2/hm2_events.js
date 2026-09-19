/* hm2_events.js - HM2 M4 risk events (classic + campaign).
 *
 * Pure, unit-testable event logic for the run-level "risk event" system:
 * every OFFER_INTERVAL seconds a marker offer is scheduled; the player
 * accepts by flying into the marker (distance check) or declines by letting
 * the offer window expire. This module is deliberately Phaser-free so it
 * can be require()'d in plain node and driven directly by a test probe.
 *
 * game.js integration (kept minimal and surgical):
 *   - resetEvents() on run start (see resetRiskEvents in game.js hook).
 *   - one step call per sim tick inside the existing run update
 *     (stepRiskEvents in game.js), which calls scheduleNext + stepOffer +
 *     resolveEvent and does the on-field marker/banner/spawn work.
 *   - the existing spawn cadence multiplies its rate by
 *     overclockMultiplier(state, now) instead of any spawn code being
 *     duplicated.
 *
 * This system is entirely separate from the declarative `events` rows in
 * level files (see LEVELS_SPEC.md): those are authored per-mission beats,
 * this is a run-level system that applies identically to classic runs and
 * every campaign level. If this module fails to load, game.js callers guard
 * every call with `window.HM2_EVENTS &&`, so absence is a no-op.
 */
(function () {
  'use strict';

  var OFFER_INTERVAL = 90;   // seconds between offers
  var OFFER_WINDOW = 14;     // seconds a marker lingers before it counts as declined
  var ACCEPT_RADIUS = 46;    // distance from marker that counts as flying into it
  var OVERCLOCK_DURATION = 30;
  var OVERCLOCK_SPAWN_MULT = 2;
  var OVERCLOCK_GEM_MULT = 2;
  var RUN_CAP_PER_TYPE = 6;  // soft per-run cap; once hit, that type is skipped

  var EVENT_TYPES = ['distress-beacon', 'overclock', 'rival-ace'];

  function defaultRng() {
    return Math.random();
  }

  // ------------------------------------------------------------------
  // makeSeededRng: mulberry32, same construction as the sim's srand() but
  // kept on a totally separate stream so risk-event draws never perturb
  // (or get perturbed by) the seeded sim RNG. Deterministic per seed.
  function makeSeededRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------
  // pickEvent: chooses the next event type. Honors a no-immediate-repeat
  // rule (never the same type twice in a row) and a soft per-run cap per
  // type (RUN_CAP_PER_TYPE); if every type is capped, repeats are allowed
  // again (the cap only softens variety pressure, it never starves offers).
  function pickEvent(state, rng) {
    rng = rng || defaultRng;
    var counts = (state && state.eventCounts) || {};
    var lastType = state && state.lastEventType;

    var pool = [];
    for (var i = 0; i < EVENT_TYPES.length; i++) {
      var t = EVENT_TYPES[i];
      var c = counts[t] || 0;
      if (t === lastType) continue;
      if (c >= RUN_CAP_PER_TYPE) continue;
      pool.push(t);
    }
    if (pool.length === 0) {
      // Everything capped or excluded: fall back to any type that is not
      // the immediate last one, ignoring the cap.
      for (var j = 0; j < EVENT_TYPES.length; j++) {
        if (EVENT_TYPES[j] !== lastType) pool.push(EVENT_TYPES[j]);
      }
    }
    if (pool.length === 0) pool = EVENT_TYPES.slice();

    var idx = Math.floor(rng() * pool.length);
    if (idx >= pool.length) idx = pool.length - 1;
    return pool[idx];
  }

  // ------------------------------------------------------------------
  // scheduleNext: advances the every-90s cadence. If no offer is pending
  // and enough time has elapsed since the last offer resolved (accepted,
  // declined, or run start), schedules a new one. Returns the mutated
  // state (also mutated in place) for convenience.
  function scheduleNext(state, now) {
    if (!state) return state;
    if (state.offer && state.offer.active) return state;
    var last = typeof state.lastOfferAt === 'number' ? state.lastOfferAt : -Infinity;
    if (now - last < OFFER_INTERVAL) return state;

    var type = pickEvent(state, state.rng);
    state.offer = {
      type: type,
      active: true,
      startedAt: now,
      expiresAt: now + OFFER_WINDOW,
      x: 0,
      y: 0
    };
    state.lastOfferAt = now;
    state.lastEventType = type;
    state.eventCounts = state.eventCounts || {};
    state.eventCounts[type] = (state.eventCounts[type] || 0) + 1;
    return state;
  }

  // ------------------------------------------------------------------
  // stepOffer: advances an active offer by dt seconds. ctx supplies the
  // player position (ctx.playerX, ctx.playerY) and the marker position
  // lives on state.offer.x/y (the caller places the marker once at offer
  // creation; game.js does this via the return of scheduleNext + a marker
  // spawn, keeping this function free of any Phaser/world knowledge beyond
  // plain coordinates).
  // Returns 'accepted' | 'declined' | 'active'.
  function stepOffer(state, ctx, dt) {
    if (!state || !state.offer || !state.offer.active) return 'active';
    var offer = state.offer;
    var now = (typeof ctx.now === 'number') ? ctx.now : offer.startedAt + dt;

    var px = (ctx && ctx.playerX) || 0;
    var py = (ctx && ctx.playerY) || 0;
    var dx = px - offer.x;
    var dy = py - offer.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= ACCEPT_RADIUS) {
      offer.active = false;
      return 'accepted';
    }
    if (now >= offer.expiresAt) {
      offer.active = false;
      return 'declined';
    }
    return 'active';
  }

  // ------------------------------------------------------------------
  // resolveEvent: applies the reward/penalty ledger for a resolved offer.
  // Mutates and returns state. `outcome` is 'accepted' or 'declined'.
  // Declined offers grant nothing and cost nothing (ignoring is always
  // safe by design, per spec: no punishment for declining).
  function resolveEvent(state, type, outcome) {
    if (!state) return state;
    state.effects = state.effects || {};
    if (outcome !== 'accepted') return state;

    if (type === 'overclock') {
      var now = state.now || 0;
      state.effects.overclockUntil = now + OVERCLOCK_DURATION;
      state.effects.overclockGemMult = OVERCLOCK_GEM_MULT;
      state.pendingSpawn = { kind: 'overclock-start' };
    } else if (type === 'distress-beacon') {
      state.pendingSpawn = { kind: 'distress-beacon', guards: 3, cache: true };
    } else if (type === 'rival-ace') {
      state.pendingSpawn = { kind: 'rival-ace', blueprint: true };
    }
    return state;
  }

  // ------------------------------------------------------------------
  // overclockMultiplier: 2 while an accepted overclock window is active,
  // else 1. Meant to multiply the existing spawn-rate cadence, not
  // duplicate spawn code.
  function overclockMultiplier(state, now) {
    if (!state || !state.effects) return 1;
    if (typeof state.effects.overclockUntil !== 'number') return 1;
    return now < state.effects.overclockUntil ? OVERCLOCK_SPAWN_MULT : 1;
  }

  function isOverclockActive(state, now) {
    return overclockMultiplier(state, now) > 1;
  }

  // ------------------------------------------------------------------
  // pickMarkerSide: draws from state.rng (never the sim's seeded srand)
  // to choose which side of the player the offer marker spawns on. Kept
  // here so game.js's stepRiskEvents hook never touches Math.random or
  // the sim RNG directly for this decision.
  function pickMarkerSide(state) {
    var rng = (state && state.rng) || defaultRng;
    return rng() < 0.5 ? -1 : 1;
  }

  // ------------------------------------------------------------------
  // resetEvents: fresh state for a new run (classic or campaign alike).
  // lastOfferAt starts at 0 (not -Infinity) so the first offer lands at
  // t=OFFER_INTERVAL (t=90), matching "one offered every 90s", instead of
  // firing on the very first tick. `seed`, if given, builds this run's own
  // seeded rng stream (mulberry32) completely separate from the sim's
  // seeded srand(); pass e.g. runSeed XOR a fixed constant so it stays
  // reproducible under a fixed run seed. Omit seed to keep the old
  // Math.random()-backed defaultRng (used by tests that inject state.rng
  // directly).
  function resetEvents(seed) {
    return {
      offer: null,
      lastOfferAt: 0,
      lastEventType: null,
      eventCounts: {},
      effects: {},
      pendingSpawn: null,
      now: 0,
      rng: (typeof seed === 'number') ? makeSeededRng(seed) : defaultRng
    };
  }

  var HM2_EVENTS = {
    OFFER_INTERVAL: OFFER_INTERVAL,
    OFFER_WINDOW: OFFER_WINDOW,
    ACCEPT_RADIUS: ACCEPT_RADIUS,
    OVERCLOCK_DURATION: OVERCLOCK_DURATION,
    OVERCLOCK_SPAWN_MULT: OVERCLOCK_SPAWN_MULT,
    OVERCLOCK_GEM_MULT: OVERCLOCK_GEM_MULT,
    RUN_CAP_PER_TYPE: RUN_CAP_PER_TYPE,
    EVENT_TYPES: EVENT_TYPES,
    pickEvent: pickEvent,
    scheduleNext: scheduleNext,
    stepOffer: stepOffer,
    resolveEvent: resolveEvent,
    overclockMultiplier: overclockMultiplier,
    isOverclockActive: isOverclockActive,
    pickMarkerSide: pickMarkerSide,
    makeSeededRng: makeSeededRng,
    resetEvents: resetEvents
  };

  if (typeof window !== 'undefined') window.HM2_EVENTS = HM2_EVENTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = HM2_EVENTS;
}());
