#!/usr/bin/env node
/* hm2_m4_probe.mjs - M4 acceptance probe for Horde Meridian 2.
 *
 * Plain node, no browser. Exercises M4's OWN functions directly:
 *   A) hm2_cutscene.js  - validateCutscene, planBeats, beatsAt,
 *      visibleLineCount, skipState.
 *   B) hm2_events.js    - pickEvent, scheduleNext, stepOffer, resolveEvent,
 *      overclockMultiplier, isOverclockActive.
 *   C) hm_data.js + levels/*.js - the 7 M3 enemies folded into
 *      REGION_ENEMIES / REGION_ENEMY_BY_KEY, and every level wave pool
 *      resolving to a real key with no ranged/sapper/speed-0 key at at:0.
 *
 * Run: node hm2_m4_probe.mjs
 * Exits 0 on pass, 1 on any failure. Prints PASS/FAIL per assertion.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

var require = createRequire(import.meta.url);
var __dirname = path.dirname(fileURLToPath(import.meta.url));

var failures = 0;
var cases = 0;

function ok(name, cond, detail) {
  cases++;
  if (cond) {
    console.log('PASS ' + name);
  } else {
    failures++;
    console.log('FAIL ' + name + (detail != null ? '  :: ' + detail : ''));
  }
}

// ----------------------------------------------------------------------
// Load hm2_cutscene.js and hm2_events.js the same way hm2_world.test.mjs
// loads hm2_world.js: plain require(), since both dual-export via
// module.exports.
var HM2_CUTSCENE = require(path.join(__dirname, 'hm2_cutscene.js'));
var HM2_EVENTS = require(path.join(__dirname, 'hm2_events.js'));

// ----------------------------------------------------------------------
// Load hm_data.js + levels/*.js in a fake window sandbox, since those
// files only export to window.__HM_DATA / window.__HM_LEVELS (no
// module.exports). hm2_weapons.js must load first (hm_data.js reads
// window.HM2_WEAPONS while building).
function loadGameData() {
  var sandbox = { window: {}, console: console };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  var files = ['hm2_weapons.js', 'hm_data.js'];
  var levelsDir = path.join(__dirname, 'levels');
  var levelFiles = fs.readdirSync(levelsDir)
    .filter(function (f) { return /^level\d+\.js$/.test(f); })
    .sort(function (a, b) {
      var na = parseInt(a.match(/\d+/)[0], 10);
      var nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    });
  var i, src, code;
  for (i = 0; i < files.length; i++) {
    src = fs.readFileSync(path.join(__dirname, files[i]), 'utf8');
    code = new vm.Script(src, { filename: files[i] });
    code.runInContext(sandbox);
  }
  for (i = 0; i < levelFiles.length; i++) {
    src = fs.readFileSync(path.join(levelsDir, levelFiles[i]), 'utf8');
    code = new vm.Script(src, { filename: 'levels/' + levelFiles[i] });
    code.runInContext(sandbox);
  }
  return { DATA: sandbox.window.__HM_DATA, LEVELS: sandbox.window.__HM_LEVELS };
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

// ========================================================================
// A) CUTSCENES
// ========================================================================
(function () {
  var validateCutscene = HM2_CUTSCENE.validateCutscene;
  var planBeats = HM2_CUTSCENE.planBeats;
  var beatsAt = HM2_CUTSCENE.beatsAt;
  var visibleLineCount = HM2_CUTSCENE.visibleLineCount;
  var skipState = HM2_CUTSCENE.skipState;

  var goodIntro = {
    beats: [
      { kind: 'pan', dur: 1.2, toX: 100, toY: -50 },
      { kind: 'flyin', dur: 1.0, toX: 0, toY: 0 },
      { kind: 'line', dur: 2.5, text: 'THE FLEET IS GONE.', speaker: 'CAPTAIN' },
      { kind: 'line', dur: 2.0, text: 'WE HOLD THE LINE.', speaker: 'CAPTAIN' },
      { kind: 'burst', dur: 0.6, color: 0xff0000 },
      { kind: 'zoom', dur: 1.0, to: 1.5 }
    ]
  };
  var goodOutro = {
    beats: [
      { kind: 'zoom', dur: 1.0, to: 1.2 },
      { kind: 'line', dur: 2.5, text: 'SECTOR CLEAR.', speaker: 'CAPTAIN' },
      { kind: 'burst', dur: 0.5, color: 0x00ff00 }
    ]
  };

  // ---- planBeats: ascending, non-overlapping, sums to durations ----
  var plan = planBeats(goodIntro);
  var ascending = true, nonOverlap = true, sum = 0, i;
  for (i = 0; i < plan.length; i++) {
    sum += goodIntro.beats[i].dur;
    if (plan[i].start !== (i === 0 ? 0 : plan[i - 1].end)) nonOverlap = false;
    if (plan[i].end <= plan[i].start) ascending = false;
    if (i > 0 && plan[i].start < plan[i - 1].end) nonOverlap = false;
  }
  var totalPlan = plan.length ? plan[plan.length - 1].end : 0;
  ok('planBeats: ascending non-overlapping starts/ends', ascending && nonOverlap);
  ok('planBeats: total end sums to beat durations', Math.abs(totalPlan - sum) < 1e-9, totalPlan + ' vs ' + sum);

  // ---- beatsAt boundaries ----
  ok('beatsAt t=0 returns first beat', beatsAt(plan, 0).length === 1 && beatsAt(plan, 0)[0].idx === 0);
  var b0end = plan[0].end;
  ok('beatsAt exact edge t=beat0.end returns beat1 not beat0',
    beatsAt(plan, b0end).length === 1 && beatsAt(plan, b0end)[0].idx === 1);
  ok('beatsAt just before edge returns beat0',
    beatsAt(plan, b0end - 0.001)[0].idx === 0);
  var pastEnd = totalPlan + 5;
  var pastBeats = beatsAt(plan, pastEnd);
  ok('beatsAt past end holds last beat', pastBeats.length === 1 && pastBeats[0].idx === plan.length - 1);

  // ---- visibleLineCount never exceeds 2 on a valid timeline ----
  var maxLines = 0, t;
  for (t = 0; t <= totalPlan + 0.5; t += 0.05) {
    var n = visibleLineCount(plan, t);
    if (n > maxLines) maxLines = n;
  }
  ok('visibleLineCount never exceeds 2 on valid intro timeline', maxLines <= 2, 'max=' + maxLines);

  // ---- visibleLineCount DOES report 3 for a deliberately overlapping 3-line construction ----
  var overlapPlan = [
    { start: 0, end: 3, idx: 0, kind: 'line', text: 'A' },
    { start: 0.5, end: 3.5, idx: 1, kind: 'line', text: 'B' },
    { start: 1, end: 4, idx: 2, kind: 'line', text: 'C' }
  ];
  ok('visibleLineCount reports 3 for deliberately overlapping 3-line construction',
    visibleLineCount(overlapPlan, 2) === 3);

  // ---- validateCutscene ACCEPTS good intro and outro ----
  var vGood = validateCutscene({ intro: goodIntro, outro: goodOutro });
  ok('validateCutscene accepts good intro+outro', vGood.ok === true, vGood.err);

  // ---- REJECTS: over-cap intro (>12s) ----
  var overCapIntro = { beats: [{ kind: 'line', dur: 12, text: 'TOO LONG', speaker: 'X' }, { kind: 'pan', dur: 1, toX: 0 }] };
  var r1 = validateCutscene({ intro: overCapIntro });
  ok('validateCutscene rejects over-cap intro (>12s)', r1.ok === false && /exceeds cap/.test(r1.err) && /intro/.test(r1.err), r1.err);

  // ---- REJECTS: over-cap outro (>8s) ----
  var overCapOutro = { beats: [{ kind: 'line', dur: 8, text: 'TOO LONG OUTRO', speaker: 'X' }, { kind: 'pan', dur: 1, toX: 0 }] };
  var r2 = validateCutscene({ outro: overCapOutro });
  ok('validateCutscene rejects over-cap outro (>8s)', r2.ok === false && /exceeds cap/.test(r2.err) && /outro/.test(r2.err), r2.err);

  // ---- REJECTS: em dash in text ----
  var emDash = { beats: [{ kind: 'line', dur: 1, text: 'BAD — DASH', speaker: 'X' }] };
  var r3 = validateCutscene({ intro: emDash });
  ok('validateCutscene rejects em dash in text', r3.ok === false && /em dash in text/.test(r3.err), r3.err);

  // ---- REJECTS: lowercase speaker ----
  var lowerSpeaker = { beats: [{ kind: 'line', dur: 1, text: 'HELLO', speaker: 'captain' }] };
  var r4 = validateCutscene({ intro: lowerSpeaker });
  ok('validateCutscene rejects lowercase speaker', r4.ok === false && /speaker must be uppercase/.test(r4.err), r4.err);

  // ---- REJECTS: bad beat kind ----
  var badKind = { beats: [{ kind: 'wobble', dur: 1 }] };
  var r5 = validateCutscene({ intro: badKind });
  ok('validateCutscene rejects bad beat kind', r5.ok === false && /bad kind/.test(r5.err), r5.err);

  // ---- REJECTS: zoom out of range ----
  var badZoom = { beats: [{ kind: 'zoom', dur: 1, to: 10 }] };
  var r6 = validateCutscene({ intro: badZoom });
  ok('validateCutscene rejects zoom out of range', r6.ok === false && /zoom range/.test(r6.err), r6.err);

  // ---- REJECTS: overlong line ----
  var longText = new Array(80).join('X');
  var overlongLine = { beats: [{ kind: 'line', dur: 1, text: longText, speaker: 'X' }] };
  var r7 = validateCutscene({ intro: overlongLine });
  ok('validateCutscene rejects overlong line', r7.ok === false && /line length/.test(r7.err), r7.err);

  // ---- REJECTS: zero/negative duration ----
  var zeroDur = { beats: [{ kind: 'pan', dur: 0, toX: 0 }] };
  var r8 = validateCutscene({ intro: zeroDur });
  ok('validateCutscene rejects zero duration', r8.ok === false && /bad dur/.test(r8.err), r8.err);
  var negDur = { beats: [{ kind: 'pan', dur: -1, toX: 0 }] };
  var r9 = validateCutscene({ intro: negDur });
  ok('validateCutscene rejects negative duration', r9.ok === false && /bad dur/.test(r9.err), r9.err);

  // ---- skipState idempotent: skipping twice consumes once ----
  var s0 = { t: 0, total: 5, consumed: false };
  var s1 = skipState(s0, { tap: true });
  ok('skipState first skip jumps to total and consumes', s1.t === 5 && s1.consumed === true);
  var s2 = skipState(s1, { tap: true });
  ok('skipState second skip is a no-op (idempotent)', s2.t === 5 && s2.consumed === true && s2.total === 5);
})();

// ========================================================================
// B) RISK EVENTS
// ========================================================================
(function () {
  var pickEvent = HM2_EVENTS.pickEvent;
  var scheduleNext = HM2_EVENTS.scheduleNext;
  var stepOffer = HM2_EVENTS.stepOffer;
  var resolveEvent = HM2_EVENTS.resolveEvent;
  var overclockMultiplier = HM2_EVENTS.overclockMultiplier;
  var isOverclockActive = HM2_EVENTS.isOverclockActive;
  var resetEvents = HM2_EVENTS.resetEvents;
  var OFFER_INTERVAL = HM2_EVENTS.OFFER_INTERVAL;
  var OFFER_WINDOW = HM2_EVENTS.OFFER_WINDOW;
  var ACCEPT_RADIUS = HM2_EVENTS.ACCEPT_RADIUS;
  var OVERCLOCK_DURATION = HM2_EVENTS.OVERCLOCK_DURATION;
  var RUN_CAP_PER_TYPE = HM2_EVENTS.RUN_CAP_PER_TYPE;
  var EVENT_TYPES = HM2_EVENTS.EVENT_TYPES;

  // ---- 90s cadence holds over a simulated 10 minute run ----
  (function () {
    var rand = mulberry32(42);
    var state = resetEvents();
    state.rng = rand;
    var offerTimes = [];
    var now = 0;
    var DT = 0.5;
    var END = 600; // 10 minutes
    while (now <= END) {
      scheduleNext(state, now);
      if (state.offer && state.offer.active && offerTimes[offerTimes.length - 1] !== state.offer.startedAt) {
        offerTimes.push(state.offer.startedAt);
      }
      // let every offer expire (decline) so scheduleNext can fire again
      if (state.offer && state.offer.active && now >= state.offer.expiresAt) {
        var outcome = stepOffer(state, { playerX: 999999, playerY: 999999, now: now }, DT);
        if (outcome === 'declined') resolveEvent(state, state.offer.type, 'declined');
      } else if (state.offer && state.offer.active) {
        stepOffer(state, { playerX: 999999, playerY: 999999, now: now }, DT);
      }
      now += DT;
    }
    var gaps = [];
    var i;
    for (i = 1; i < offerTimes.length; i++) gaps.push(offerTimes[i] - offerTimes[i - 1]);
    // Hardcode the spec value (90), not HM2_EVENTS.OFFER_INTERVAL: this
    // assertion exists to catch a regressed constant, so it must not read
    // the very value it is checking.
    var SPEC_OFFER_INTERVAL = 90;
    ok('OFFER_INTERVAL constant is the spec value of 90', OFFER_INTERVAL === SPEC_OFFER_INTERVAL, 'got=' + OFFER_INTERVAL);
    var allAtInterval = gaps.every(function (g) { return Math.abs(g - SPEC_OFFER_INTERVAL) < DT + 1e-9; });
    ok('90s cadence holds over simulated 10 minute run', offerTimes.length >= 5 && allAtInterval,
      'offers=' + offerTimes.length + ' gaps=' + JSON.stringify(gaps));
  })();

  // ---- first offer lands at t=90, not t=0 (R2 regression guard) ----
  (function () {
    // Hardcode the spec value (90), never HM2_EVENTS.OFFER_INTERVAL: this
    // assertion exists specifically to catch resetEvents() regressing
    // lastOfferAt back to -Infinity, which would make scheduleNext fire an
    // offer on the very first tick regardless of what OFFER_INTERVAL is set to.
    var SPEC_OFFER_INTERVAL = 90;
    var state = resetEvents();
    var now = 0;
    var DT = 0.5;
    var firstOfferAt = null;
    var sawOfferBeforeSpec = false;
    while (now <= SPEC_OFFER_INTERVAL + 5) {
      scheduleNext(state, now);
      if (state.offer && state.offer.active) {
        if (firstOfferAt === null) firstOfferAt = state.offer.startedAt;
        if (now < SPEC_OFFER_INTERVAL - 1e-9) sawOfferBeforeSpec = true;
      }
      now += DT;
    }
    ok('no offer is active before t=' + SPEC_OFFER_INTERVAL, !sawOfferBeforeSpec);
    ok('first offer lands at t=' + SPEC_OFFER_INTERVAL + ' (within one DT)',
      firstOfferAt !== null && Math.abs(firstOfferAt - SPEC_OFFER_INTERVAL) < DT + 1e-9,
      'firstOfferAt=' + firstOfferAt);
  })();

  // ---- pickEvent never repeats same type twice in a row ----
  (function () {
    var rand = mulberry32(7);
    var state = { eventCounts: {}, lastEventType: null };
    var prev = null;
    var repeatFound = false;
    var i;
    for (i = 0; i < 500; i++) {
      var t = pickEvent(state, rand);
      if (t === prev) repeatFound = true;
      state.lastEventType = t;
      state.eventCounts[t] = (state.eventCounts[t] || 0) + 1;
      // reset counts periodically so the cap doesn't force starvation false positives
      if (i % 30 === 0) state.eventCounts = {};
      prev = t;
    }
    ok('pickEvent never returns same type twice in a row (500 draws)', !repeatFound);
  })();

  // ---- pickEvent respects RUN_CAP_PER_TYPE ----
  (function () {
    var rand = mulberry32(11);
    var state = { eventCounts: {}, lastEventType: null };
    // Force distress-beacon to its cap by alternating with a different type.
    var i;
    for (i = 0; i < RUN_CAP_PER_TYPE; i++) {
      state.lastEventType = 'distress-beacon';
      var alt = pickEvent(state, rand); // must not be distress-beacon (last)
      ok('pickEvent avoids immediate repeat while building cap (draw ' + i + ')', alt !== 'distress-beacon');
      state.eventCounts['distress-beacon'] = (state.eventCounts['distress-beacon'] || 0) + 1;
      state.lastEventType = 'overclock'; // switch lastType so distress-beacon is eligible again except for cap
    }
    // Now distress-beacon is at RUN_CAP_PER_TYPE; with lastEventType something else,
    // pickEvent must exclude it purely on the cap.
    state.lastEventType = 'rival-ace';
    var sawCapped = false;
    for (i = 0; i < 200; i++) {
      if (pickEvent(state, rand) === 'distress-beacon') sawCapped = true;
    }
    ok('pickEvent respects RUN_CAP_PER_TYPE (excludes capped type when alternatives exist)', !sawCapped);
  })();

  // ---- stepOffer accepted/declined + accept boundary just inside/outside radius ----
  (function () {
    // Hardcode the spec values (46 / 14) rather than only reading the module's
    // own constants: the boundary assertions below place the player relative
    // to ACCEPT_RADIUS, so on their own they self-adjust to a regressed
    // constant and would still pass. Pin the spec here so a changed radius or
    // window fails loudly.
    var SPEC_ACCEPT_RADIUS = 46;
    var SPEC_OFFER_WINDOW = 14;
    ok('ACCEPT_RADIUS constant is the spec value of 46', ACCEPT_RADIUS === SPEC_ACCEPT_RADIUS, 'got=' + ACCEPT_RADIUS);
    ok('OFFER_WINDOW constant is the spec value of 14', OFFER_WINDOW === SPEC_OFFER_WINDOW, 'got=' + OFFER_WINDOW);

    // Every player position, offer construction, and timing value below uses
    // the hardcoded SPEC_* values, never the live ACCEPT_RADIUS/OFFER_WINDOW
    // constants. This is deliberate: if those constants regressed (e.g. a
    // radius shrink from 46 to 47), a boundary test built from the live
    // constant would self-adjust its player position to match and still
    // pass. Live constants are used ONLY in the two equality assertions above.
    var state = resetEvents();
    state.offer = { type: 'overclock', active: true, startedAt: 0, expiresAt: SPEC_OFFER_WINDOW, x: 0, y: 0 };
    var justInside = stepOffer(state, { playerX: SPEC_ACCEPT_RADIUS - 0.5, playerY: 0, now: 1 }, 1);
    ok('stepOffer accepts just inside SPEC_ACCEPT_RADIUS', justInside === 'accepted');

    var state2 = resetEvents();
    state2.offer = { type: 'overclock', active: true, startedAt: 0, expiresAt: SPEC_OFFER_WINDOW, x: 0, y: 0 };
    var justOutside = stepOffer(state2, { playerX: SPEC_ACCEPT_RADIUS + 0.5, playerY: 0, now: 1 }, 1);
    ok('stepOffer stays active just outside SPEC_ACCEPT_RADIUS (window not yet expired)', justOutside === 'active');

    var state3 = resetEvents();
    state3.offer = { type: 'overclock', active: true, startedAt: 0, expiresAt: SPEC_OFFER_WINDOW, x: 0, y: 0 };
    var declined = stepOffer(state3, { playerX: 999999, playerY: 999999, now: SPEC_OFFER_WINDOW + 0.1 }, 0.1);
    ok('stepOffer declines when window expires untouched', declined === 'declined');
  })();

  // ---- overclockMultiplier boundaries: t=0, t=29.9, t=30.1 relative to accept ----
  (function () {
    var stateBefore = resetEvents();
    ok('overclockMultiplier is 1 before any overclock has ever been accepted', overclockMultiplier(stateBefore, 0) === 1);

    var state = resetEvents();
    state.now = 0;
    resolveEvent(state, 'overclock', 'accepted'); // sets overclockUntil = 0 + OVERCLOCK_DURATION
    ok('overclockMultiplier is 2 at t=0 (window just started)', overclockMultiplier(state, 0) === 2);
    ok('overclockMultiplier is 2 at t=29.9', overclockMultiplier(state, 29.9) === 2);
    ok('overclockMultiplier is 1 at t=30.1 (just past ' + OVERCLOCK_DURATION + 's)', overclockMultiplier(state, 30.1) === 1);
    ok('overclockMultiplier is exactly 1 well after window', overclockMultiplier(state, 60) === 1);
    ok('isOverclockActive true inside window', isOverclockActive(state, 29.9) === true);
    ok('isOverclockActive false outside window', isOverclockActive(state, 30.1) === false);
  })();

  // ---- resolveEvent produces the right ledger for each of the three types ----
  (function () {
    var sOverclock = resetEvents();
    sOverclock.now = 100;
    resolveEvent(sOverclock, 'overclock', 'accepted');
    ok('resolveEvent overclock sets overclockUntil = now + OVERCLOCK_DURATION',
      sOverclock.effects.overclockUntil === 100 + OVERCLOCK_DURATION);
    ok('resolveEvent overclock sets pendingSpawn overclock-start',
      sOverclock.pendingSpawn && sOverclock.pendingSpawn.kind === 'overclock-start');

    var sBeacon = resetEvents();
    resolveEvent(sBeacon, 'distress-beacon', 'accepted');
    ok('resolveEvent distress-beacon sets pendingSpawn with guards:3 cache:true',
      sBeacon.pendingSpawn && sBeacon.pendingSpawn.kind === 'distress-beacon' &&
      sBeacon.pendingSpawn.guards === 3 && sBeacon.pendingSpawn.cache === true);

    var sRival = resetEvents();
    resolveEvent(sRival, 'rival-ace', 'accepted');
    ok('resolveEvent rival-ace sets pendingSpawn with blueprint:true',
      sRival.pendingSpawn && sRival.pendingSpawn.kind === 'rival-ace' && sRival.pendingSpawn.blueprint === true);

    var sDeclined = resetEvents();
    resolveEvent(sDeclined, 'overclock', 'declined');
    ok('resolveEvent declined grants nothing (no pendingSpawn, no effects)',
      sDeclined.pendingSpawn === null && Object.keys(sDeclined.effects).length === 0);
  })();
})();

// ========================================================================
// C) POOLS
// ========================================================================
(function () {
  var M3_KEYS = ['wing-cutter', 'rift-strafer', 'wall-warden', 'nebula-burrower', 'gem-mimic', 'xp-leech', 'mine-bomber'];
  var loaded;
  try {
    loaded = loadGameData();
  } catch (e) {
    ok('load hm_data.js + levels/*.js in fake window sandbox', false, String(e && e.stack || e));
    loaded = null;
  }
  if (loaded) {
    ok('load hm_data.js + levels/*.js in fake window sandbox', !!(loaded.DATA && loaded.LEVELS));
  }
  var DATA = loaded && loaded.DATA;
  var LEVELS = loaded && loaded.LEVELS;

  if (DATA) {
    // ---- all 7 M3 keys resolve in REGION_ENEMY_BY_KEY ----
    var missingByKey = M3_KEYS.filter(function (k) { return !DATA.REGION_ENEMY_BY_KEY[k]; });
    ok('all 7 M3 keys resolve in REGION_ENEMY_BY_KEY', missingByKey.length === 0, 'missing=' + JSON.stringify(missingByKey));

    // ---- all 7 M3 keys appear in at least one REGION_ENEMIES pool ----
    var poolKeys = {};
    for (var region in DATA.REGION_ENEMIES) {
      DATA.REGION_ENEMIES[region].forEach(function (e) { poolKeys[e.key] = true; });
    }
    var missingFromPools = M3_KEYS.filter(function (k) { return !poolKeys[k]; });
    ok('all 7 M3 keys appear in at least one REGION_ENEMIES pool', missingFromPools.length === 0, 'missing=' + JSON.stringify(missingFromPools));

    // ---- weighted-pool ramp coverage (R1 gate fix) ----
    // Hardcoded spec literal, not read from the module: this is what pins
    // the actual regression. If the module's def.weight silently drifts
    // (e.g. someone bumps it back to 1) these assertions must fail even
    // though def.weight === def.weight would still trivially pass.
    var M3_SPEC_WEIGHT = 0.15;
    var M3_SPEC_RAMP_WEIGHT = 1;

    // 1) each M3 addition's effective weight at t=0 is strictly below the
    //    original roster's weight, pinned to the hardcoded spec literal.
    var m3EarlyBad = [];
    M3_KEYS.forEach(function (k) {
      var def = DATA.REGION_ENEMY_BY_KEY[k];
      if (!def) { m3EarlyBad.push(k + ':missing'); return; }
      var w0 = DATA.regionEnemyWeightAt(def, 0);
      if (w0 !== M3_SPEC_WEIGHT) m3EarlyBad.push(k + ':w0=' + w0 + ' expected ' + M3_SPEC_WEIGHT);
    });
    ok('each of the 7 M3 additions has regionEnemyWeightAt(def, 0) === 0.15 (hardcoded spec literal)',
      m3EarlyBad.length === 0, JSON.stringify(m3EarlyBad));

    // 2) original (pre-M4) region enemies are full weight (1) at t=0.
    var ORIGINAL_KEYS = ['cinder-kamikaze', 'ash-wraith', 'ember-scarab',
      'refracting-shard-drone', 'glasswing-drone', 'shard-larva',
      'blink-stalker', 'gravity-mite', 'null-leech',
      'derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg'];
    var origBad = [];
    ORIGINAL_KEYS.forEach(function (k) {
      var def = DATA.REGION_ENEMY_BY_KEY[k];
      if (!def) { origBad.push(k + ':missing'); return; }
      var w0 = DATA.regionEnemyWeightAt(def, 0);
      if (w0 !== 1) origBad.push(k + ':w0=' + w0);
    });
    ok('every pre-M4 (original) region enemy has regionEnemyWeightAt(def, 0) === 1',
      origBad.length === 0, JSON.stringify(origBad));

    // 3) ramp is monotonic non-decreasing and reaches parity (1) at rampAt;
    //    midpoint sits strictly between 0.15 and 1.
    var rampBad = [];
    M3_KEYS.forEach(function (k) {
      var def = DATA.REGION_ENEMY_BY_KEY[k];
      if (!def || def.rampAt == null) { rampBad.push(k + ':no-rampAt'); return; }
      var wStart = DATA.regionEnemyWeightAt(def, 0);
      var wMid = DATA.regionEnemyWeightAt(def, def.rampAt / 2);
      var wEnd = DATA.regionEnemyWeightAt(def, def.rampAt);
      var wPast = DATA.regionEnemyWeightAt(def, def.rampAt + 30);
      if (!(wStart <= wMid && wMid <= wEnd)) rampBad.push(k + ':not-monotonic ' + wStart + '/' + wMid + '/' + wEnd);
      if (wEnd !== M3_SPEC_RAMP_WEIGHT) rampBad.push(k + ':wEnd=' + wEnd + ' expected ' + M3_SPEC_RAMP_WEIGHT);
      if (!(wMid > M3_SPEC_WEIGHT && wMid < M3_SPEC_RAMP_WEIGHT)) rampBad.push(k + ':wMid=' + wMid + ' not strictly between 0.15 and 1');
      if (wPast !== M3_SPEC_RAMP_WEIGHT) rampBad.push(k + ':holds-past-rampAt wPast=' + wPast);
    });
    ok('each M3 addition ramps monotonically from 0.15 at t=0 to 1 at rampAt, holding after, with a strictly-between midpoint',
      rampBad.length === 0, JSON.stringify(rampBad));

    // 4) AGGREGATE: void-rift M3 additions are a small minority of the pool
    //    weight at t=0 (this is the assertion that would have caught the
    //    original R1 regression) and their share rises substantially by
    //    t=180 (all void-rift M3 entries fully ramped by then).
    var VOID_RIFT_M3_KEYS = ['wing-cutter', 'rift-strafer', 'nebula-burrower'];
    var voidRiftPool = DATA.REGION_ENEMIES['void-rift'];
    function poolShareAt(t) {
      var total = 0, m3total = 0;
      voidRiftPool.forEach(function (def) {
        var w = DATA.regionEnemyWeightAt(def, t);
        total += w;
        if (VOID_RIFT_M3_KEYS.indexOf(def.key) !== -1) m3total += w;
      });
      return total > 0 ? m3total / total : -1;
    }
    var shareAt0 = poolShareAt(0);
    var shareAt180 = poolShareAt(180);
    ok('void-rift M3 additions are under 15% of pool weight at t=0 (would catch the original R1 regression)',
      shareAt0 >= 0 && shareAt0 < 0.15, 'shareAt0=' + shareAt0);
    ok('void-rift M3 additions share of pool weight rises by t=180 versus t=0',
      shareAt180 > shareAt0, 'shareAt0=' + shareAt0 + ' shareAt180=' + shareAt180);

    // 5) every key stays reachable: weight > 0 at all sampled times.
    var unreachable = [];
    var sampleTimes = [0, 1, 45, 90, 91, 150, 151, 180, 181, 600];
    for (var regionKey in DATA.REGION_ENEMIES) {
      DATA.REGION_ENEMIES[regionKey].forEach(function (def) {
        sampleTimes.forEach(function (t) {
          var w = DATA.regionEnemyWeightAt(def, t);
          if (!(w > 0)) unreachable.push(def.key + '@t=' + t + ' w=' + w);
        });
      });
    }
    ok('every REGION_ENEMIES entry has weight > 0 at every sampled time (always reachable)',
      unreachable.length === 0, JSON.stringify(unreachable));
  } else {
    ok('all 7 M3 keys resolve in REGION_ENEMY_BY_KEY', false, 'data failed to load');
    ok('all 7 M3 keys appear in at least one REGION_ENEMIES pool', false, 'data failed to load');
    ok('each of the 7 M3 additions has regionEnemyWeightAt(def, 0) === 0.15 (hardcoded spec literal)', false, 'data failed to load');
    ok('every pre-M4 (original) region enemy has regionEnemyWeightAt(def, 0) === 1', false, 'data failed to load');
    ok('each M3 addition ramps monotonically from 0.15 at t=0 to 1 at rampAt, holding after, with a strictly-between midpoint', false, 'data failed to load');
    ok('void-rift M3 additions are under 15% of pool weight at t=0 (would catch the original R1 regression)', false, 'data failed to load');
    ok('void-rift M3 additions share of pool weight rises by t=180 versus t=0', false, 'data failed to load');
    ok('every REGION_ENEMIES entry has weight > 0 at every sampled time (always reachable)', false, 'data failed to load');
  }

  if (LEVELS) {
    // Fail loudly if a level file silently failed to register. Without this,
    // a level that throws or writes to the wrong global just disappears from
    // LEVELS and every pool assertion below vacuously passes over 14 levels
    // (verified: breaking level7's registration still gave 50/50).
    var levelsDirCount = fs.readdirSync(path.join(__dirname, 'levels'))
      .filter(function (f) { return /^level\d+\.js$/.test(f); }).length;
    var registered = Object.keys(LEVELS).map(Number).sort(function (a, b) { return a - b; });
    ok('every levels/*.js file registered into __HM_LEVELS',
      registered.length === levelsDirCount,
      'files=' + levelsDirCount + ' registered=' + registered.length + ' [' + registered.join(',') + ']');
    var missingIds = [];
    for (var lvId = 1; lvId <= levelsDirCount; lvId++) {
      if (!LEVELS[lvId]) missingIds.push(lvId);
    }
    ok('levels 1..' + levelsDirCount + ' are all present by id', missingIds.length === 0, 'missing=' + JSON.stringify(missingIds));
  } else {
    ok('every levels/*.js file registered into __HM_LEVELS', false, 'data failed to load');
    ok('levels 1..15 are all present by id', false, 'data failed to load');
  }

  if (DATA && LEVELS) {
    // Classic base archetype keys handled directly by fam in game.js, not
    // present in REGION_ENEMY_BY_KEY (confirmed via game.js spawn fallback
    // pools 'drifter','sprinter','bulwark','sapper','lancer','weaver').
    var CLASSIC_BASE_KEYS = { drifter: true, sprinter: true, bulwark: true, sapper: true, lancer: true, weaver: true };

    function resolvesKey(key) {
      return !!CLASSIC_BASE_KEYS[key] || !!DATA.REGION_ENEMY_BY_KEY[key];
    }

    // ---- every enemy key in every levels/*.js wave pool resolves ----
    var unresolved = [];
    var levelNums = Object.keys(LEVELS).map(Number).sort(function (a, b) { return a - b; });
    levelNums.forEach(function (lvNum) {
      var lv = LEVELS[lvNum];
      (lv.waves || []).forEach(function (w, wi) {
        (w.pool || []).forEach(function (k) {
          if (!resolvesKey(k)) unresolved.push('level' + lvNum + ' wave[' + wi + '] key=' + k);
        });
      });
    });
    ok('every enemy key in every levels/*.js wave pool resolves', unresolved.length === 0, JSON.stringify(unresolved));

    // ---- no at:0 wave row in any level contains a ranged, sapper, or speed-0 key ----
    var badRow0 = [];
    levelNums.forEach(function (lvNum) {
      var lv = LEVELS[lvNum];
      (lv.waves || []).forEach(function (w, wi) {
        if (w.at !== 0 || !w.pool) return;
        w.pool.forEach(function (k) {
          if (CLASSIC_BASE_KEYS[k] && k !== 'sapper') return; // drifter/sprinter/bulwark/lancer/weaver are fine except sapper itself
          if (k === 'sapper') { badRow0.push('level' + lvNum + ' wave[' + wi + '] key=sapper (classic sapper archetype is ranged-class)'); return; }
          var def = DATA.REGION_ENEMY_BY_KEY[k];
          if (!def) return; // already flagged as unresolved above
          if (def.ranged) badRow0.push('level' + lvNum + ' wave[' + wi + '] key=' + k + ' ranged:true');
          if (def.sapper) badRow0.push('level' + lvNum + ' wave[' + wi + '] key=' + k + ' sapper:true');
          if (def.speed === 0) badRow0.push('level' + lvNum + ' wave[' + wi + '] key=' + k + ' speed:0');
        });
      });
    });
    ok('no at:0 wave row in any level contains a ranged, sapper, or speed-0 key', badRow0.length === 0, JSON.stringify(badRow0));
  } else {
    ok('every enemy key in every levels/*.js wave pool resolves', false, 'data failed to load');
    ok('no at:0 wave row in any level contains a ranged, sapper, or speed-0 key', false, 'data failed to load');
  }
})();

// ========================================================================
// HOT-START / SECOND-WAVE SEEDERS MUST RESPECT THE WEIGHTING
//
// R1 was first "fixed" by weighting pickRegionEnemy, but the campaign L10
// median did not move (18s against a 54s baseline) because seedHotStart and
// seedSecondWave are SEPARATE spawn paths: each flattened REGION_ENEMIES into
// a plain key array and drew uniformly, so the M3 additions kept full odds at
// t=0. Nothing in the data-model assertions above can catch that, because the
// model was already correct. These assertions pin the CALL SITES.
//
// Spec literals, never read from the module under test:
//   M3 base weight 0.15, originals 1.
//   void-rift hot-start eligible keys after the ranged/lancer/sapper/apex
//   filter are 3 originals + wing-cutter + nebula-burrower, so a UNIFORM draw
//   gives the M3 additions 2/5 = 40%, while the weighted draw must give
//   2*0.15 / (3 + 2*0.15) = 9.09%.
(function () {
  var SPEC_M3_BASE_WEIGHT = 0.15;
  var DATA = null;
  try { var ld = loadGameData(); DATA = ld && ld.DATA; } catch (e) { DATA = null; }
  var SPEC_UNIFORM_M3_SHARE = 0.40;
  var SPEC_WEIGHTED_M3_SHARE = 0.0909;

  var gameSrc = '';
  try {
    gameSrc = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
  } catch (e) {
    gameSrc = '';
  }
  ok('game.js is readable for seeder inspection', gameSrc.length > 0);

  if (gameSrc) {
    // Isolate each seeder body and require that it does NOT perform a bare
    // uniform draw over a flattened region pool. A bare
    // "Math.floor(srand() * <something>.length)" inside these seeders is the
    // exact regression signature.
    ['seedHotStart', 'seedSecondWave'].forEach(function (fnName) {
      var start = gameSrc.indexOf(fnName + ': function');
      ok(fnName + ' exists in game.js', start !== -1);
      if (start === -1) return;
      // Extract the REAL function body by brace matching. A fixed-size slice
      // would bleed into the next method and let a NEIGHBOURING
      // weightedMixedPoolPick call satisfy the check, which is itself a
      // self-deceiving assertion. Found by mutation 4.
      var open = gameSrc.indexOf('{', start);
      var depth = 0, end = -1;
      for (var ci = open; ci < gameSrc.length; ci++) {
        if (gameSrc[ci] === '{') depth++;
        else if (gameSrc[ci] === '}') { depth--; if (depth === 0) { end = ci; break; } }
      }
      var body = end === -1 ? '' : gameSrc.slice(open, end + 1);
      ok(fnName + ' body was isolated by brace matching', body.length > 0 && body.length < 2000,
        'len=' + body.length);
      if (!body) return;
      ok(fnName + ' draws through the weighted helper, not a flat pool',
        body.indexOf('weightedMixedPoolPick') !== -1,
        'no weightedMixedPoolPick call found');
      ok(fnName + ' does not push REGION_ENEMIES keys into a flat uniform pool',
        !/pool\.push\(/.test(body),
        'found a pool.push( flattening region entries');
    });
  } else {
    ok('seedHotStart exists in game.js', false, 'game.js unreadable');
    ok('seedSecondWave exists in game.js', false, 'game.js unreadable');
  }

  // Numeric guard on the intended opening mix. Computed from the real data,
  // compared against HARDCODED spec shares.
  if (DATA && DATA.REGION_ENEMIES && DATA.regionEnemyWeightAt) {
    var M3 = ['wing-cutter', 'nebula-burrower'];
    var eligible = DATA.REGION_ENEMIES['void-rift'].filter(function (d) {
      return !(d.ranged || d.base === 'lancer' || d.base === 'sapper' || d.apex);
    });
    ok('void-rift hot-start eligible pool is the expected 5 keys',
      eligible.length === 5, JSON.stringify(eligible.map(function (d) { return d.key; })));

    var tot = 0, m3tot = 0;
    eligible.forEach(function (d) {
      var w = DATA.regionEnemyWeightAt(d, 0);
      tot += w;
      if (M3.indexOf(d.key) !== -1) m3tot += w;
    });
    var weightedShare = tot > 0 ? m3tot / tot : -1;

    ok('M3 base weight is the spec 0.15 for both void-rift hot-start additions',
      eligible.filter(function (d) {
        return M3.indexOf(d.key) !== -1 &&
          DATA.regionEnemyWeightAt(d, 0) === SPEC_M3_BASE_WEIGHT;
      }).length === 2, 'weights=' + JSON.stringify(eligible.map(function (d) {
        return d.key + ':' + DATA.regionEnemyWeightAt(d, 0);
      })));

    ok('weighted hot-start M3 share at t=0 matches the spec 9.09%, not the uniform 40%',
      weightedShare > 0 && Math.abs(weightedShare - SPEC_WEIGHTED_M3_SHARE) < 0.005,
      'share=' + weightedShare.toFixed(4));

    ok('weighted hot-start M3 share at t=0 is far below the uniform-draw share',
      weightedShare < SPEC_UNIFORM_M3_SHARE / 2,
      'share=' + weightedShare.toFixed(4) + ' uniform=' + SPEC_UNIFORM_M3_SHARE);
  }
})();

// ========================================================================
console.log('');
console.log(cases + ' assertions, ' + failures + ' failed');
process.exit(failures > 0 ? 1 : 0);
