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
    var state = resetEvents();
    state.offer = { type: 'overclock', active: true, startedAt: 0, expiresAt: OFFER_WINDOW, x: 0, y: 0 };
    var justInside = stepOffer(state, { playerX: ACCEPT_RADIUS - 0.5, playerY: 0, now: 1 }, 1);
    ok('stepOffer accepts just inside ACCEPT_RADIUS', justInside === 'accepted');

    var state2 = resetEvents();
    state2.offer = { type: 'overclock', active: true, startedAt: 0, expiresAt: OFFER_WINDOW, x: 0, y: 0 };
    var justOutside = stepOffer(state2, { playerX: ACCEPT_RADIUS + 0.5, playerY: 0, now: 1 }, 1);
    ok('stepOffer stays active just outside ACCEPT_RADIUS (window not yet expired)', justOutside === 'active');

    var state3 = resetEvents();
    state3.offer = { type: 'overclock', active: true, startedAt: 0, expiresAt: OFFER_WINDOW, x: 0, y: 0 };
    var declined = stepOffer(state3, { playerX: 999999, playerY: 999999, now: OFFER_WINDOW + 0.1 }, 0.1);
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
  } else {
    ok('all 7 M3 keys resolve in REGION_ENEMY_BY_KEY', false, 'data failed to load');
    ok('all 7 M3 keys appear in at least one REGION_ENEMIES pool', false, 'data failed to load');
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
console.log('');
console.log(cases + ' assertions, ' + failures + ' failed');
process.exit(failures > 0 ? 1 : 0);
