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

// ----------------------------------------------------------------------
// Load game.js itself in a fake browser sandbox so the REAL hotStartPools,
// weightedMixedPoolPick and the real seeded srand can be exercised directly,
// instead of grepping the source text and recomputing an expected share in
// probe-local JS (the R1 gate B1 finding: that pattern lets a broken
// implementation pass because it never calls the code under test).
//
// game.js is a browser file wrapped in one big IIFE that runs a lot of
// window/document/Phaser setup at load time. It never needs to actually
// render anything for this probe: we only need the module to finish
// evaluating so its scene method objects exist. The scene configs (including
// PlayScene, which owns hotStartPools/weightedMixedPoolPick/seedHotStart)
// are handed to `new Phaser.Game(cfg)` as `cfg.scene`, an array of classes
// built by the local toScene() helper; a stub Phaser.Game constructor
// captures that array so the real prototypes can be read back out.
function loadGamePlayScene() {
  var noop = function () {};
  var fakeEl = {
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
    addEventListener: noop, removeEventListener: noop,
    appendChild: function (c) { return c; }, setAttribute: noop, getAttribute: function () { return null; },
    querySelector: function () { return fakeEl; }, querySelectorAll: function () { return []; },
    children: []
  };
  var sandbox = { window: {}, console: console };
  sandbox.window.window = sandbox.window;
  sandbox.document = {
    createElement: function () { return fakeEl; },
    addEventListener: noop, removeEventListener: noop,
    documentElement: { clientWidth: 390, clientHeight: 844, style: {} },
    body: fakeEl,
    getElementById: function () { return fakeEl; },
    querySelector: function () { return fakeEl; },
    querySelectorAll: function () { return []; },
    visibilityState: 'visible',
    fullscreenElement: null
  };
  sandbox.window.document = sandbox.document;
  sandbox.location = { search: '', href: '', hostname: 'localhost' };
  sandbox.window.location = sandbox.location;
  sandbox.window.localStorage = { getItem: function () { return null; }, setItem: noop, removeItem: noop };
  sandbox.window.addEventListener = noop;
  sandbox.window.removeEventListener = noop;
  sandbox.window.requestAnimationFrame = function () { return 0; };
  sandbox.window.cancelAnimationFrame = noop;
  sandbox.window.prompt = function () { return null; };
  sandbox.window.console = console;
  sandbox.setInterval = function () { return 0; };
  sandbox.setTimeout = function () { return 0; };
  sandbox.clearInterval = noop;
  sandbox.clearTimeout = noop;

  var savedProfile = null;
  sandbox.GGKit = {
    create: function (cfg) {
      return {
        save: {
          get: function () { return savedProfile; },
          set: function (p) { savedProfile = p; }
        },
        pause: noop, resume: noop, restart: noop, input: {}, on: noop, emit: noop,
        config: cfg, registerPWA: noop, audio: { sfx: noop, music: noop }
      };
    },
    hiDpi: { phaser: function (cfg) { cfg.ggDpr = 1; return cfg; } },
    renderDefaults: {}
  };
  sandbox.window.GGKit = sandbox.GGKit;
  sandbox.performance = { now: function () { return 0; } };
  sandbox.window.performance = sandbox.performance;

  function PhaserSceneStub() {}
  var capturedSceneClasses = null;
  sandbox.Phaser = {
    Scene: PhaserSceneStub,
    Math: { Between: function (a) { return a; }, Clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); } },
    Game: function (cfg) { this.scene = {}; this.renderer = {}; capturedSceneClasses = cfg.scene; return this; },
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0, NONE: 0 },
    GameObjects: {
      GameObjectFactory: { prototype: { text: function () { return { setScale: function () { return this; } }; } } }
    }
  };
  sandbox.window.Phaser = sandbox.Phaser;

  vm.createContext(sandbox);

  var ld = loadGameData();
  sandbox.window.__HM_DATA = ld.DATA;
  sandbox.window.__HM_LEVELS = ld.LEVELS;

  var esrc = fs.readFileSync(path.join(__dirname, 'hm2_events.js'), 'utf8');
  var ecode = new vm.Script(esrc, { filename: 'hm2_events.js' });
  ecode.runInContext(sandbox);

  var gsrc = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
  var gcode = new vm.Script(gsrc, { filename: 'game.js' });
  gcode.runInContext(sandbox);

  var classes = capturedSceneClasses || [];
  var playProto = null;
  for (var i = 0; i < classes.length; i++) {
    if (classes[i].prototype && typeof classes[i].prototype.hotStartPools === 'function') {
      playProto = classes[i].prototype;
      break;
    }
  }
  return { playProto: playProto, DATA: ld.DATA, sandbox: sandbox };
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
// Spec literals, never derived by calling the code under test:
//   void-rift hot-start eligible keys after the ranged/lancer/sapper/apex
//   filter are 3 originals + wing-cutter (4 keys total). nebula-burrower
//   carries hotStartExclude:true (highest-dmg M3 addition, untargetable
//   while burrowed - unfair at t=0 same as the ranged/sapper/apex filters)
//   so it never reaches this pool at all; this is a real hotStartPools
//   filter, not a stale literal - see the hotStartExclude check at
//   game.js hotStartPools ~3136.
//   A UNIFORM draw over those 4 would give the one M3 addition 1/4 = 25%.
//   The weighted draw (weight 0.15 for wing-cutter, 1 for the 3 originals)
//   must give 0.15 / (3 + 0.15) = 4.7619% at t=0.
//   At t=90, wing-cutter (rampAt:90) is fully ramped to weight 1.
//   Share = 1 / (3 + 1) = 25%.
//
// All of this is now driven through the REAL hotStartPools and
// weightedMixedPoolPick loaded straight out of game.js in a vm sandbox
// (loadGamePlayScene, above), not recomputed here. The one exception is the
// eligible-pool identity check, which is a spec literal by design (never
// derived by calling hotStartPools itself).
(function () {
  var PLAY = null;
  try { PLAY = loadGamePlayScene(); } catch (e) { PLAY = null; }
  ok('game.js PlayScene loads in the vm sandbox and exposes hotStartPools/weightedMixedPoolPick',
    !!(PLAY && PLAY.playProto && typeof PLAY.playProto.hotStartPools === 'function' &&
      typeof PLAY.playProto.weightedMixedPoolPick === 'function'),
    PLAY ? 'playProto=' + !!(PLAY && PLAY.playProto) : 'load failed');

  if (!PLAY || !PLAY.playProto) {
    ok('hotStartPools(void-rift) region array deep-equals the 4 spec keys', false, 'game.js failed to load');
    ok('weighted hot-start M3 share at t=0 matches the spec 4.76%', false, 'game.js failed to load');
    ok('weighted hot-start M3 share at t=90 matches the spec 25%', false, 'game.js failed to load');
    ok('seedHotStart draws through the real timeSec, not a hardcoded one', false, 'game.js failed to load');
    return;
  }

  var playProto = PLAY.playProto;
  var DATA = PLAY.DATA;
  var voidRiftRegion = DATA.REGION_BY_KEY['void-rift'];

  // SPEC LITERAL: the exact 4 keys hotStartPools must return for void-rift,
  // in the order REGION_ENEMIES lists them. nebula-burrower is deliberately
  // absent (hotStartExclude:true in hm_data.js REGION_ENEMIES['void-rift']).
  // Never derived from the call under test.
  var SPEC_HOT_START_KEYS = ['blink-stalker', 'gravity-mite', 'null-leech', 'wing-cutter'];
  var M3_HOT_START_KEYS = ['wing-cutter'];

  var realPools = playProto.hotStartPools.call({}, [], voidRiftRegion);
  var realKeys = realPools.region.map(function (d) { return d.key; });
  ok('hotStartPools(void-rift) region array deep-equals the 4 spec keys',
    JSON.stringify(realKeys) === JSON.stringify(SPEC_HOT_START_KEYS),
    'got=' + JSON.stringify(realKeys));

  // Empirically drive the REAL weightedMixedPoolPick (real srand, real
  // regionEnemyWeightAt) at two times, with the base-key pool empty so the
  // draw is purely over the 4 void-rift region entries (matching the eligible
  // pool the SPEC_HOT_START_KEYS check just pinned).
  function drawShare(timeSec, n) {
    var m3 = 0;
    for (var i = 0; i < n; i++) {
      var pick = playProto.weightedMixedPoolPick.call({}, realPools.base, realPools.region, timeSec);
      if (M3_HOT_START_KEYS.indexOf(pick) !== -1) m3++;
    }
    return m3 / n;
  }

  var N_DRAWS = 20000;
  var SPEC_SHARE_AT_0 = 0.047619; // 0.15 / (3 + 0.15)
  var SPEC_SHARE_AT_90 = 0.25;    // 1 / (3 + 1), wing-cutter fully ramped at rampAt:90
  var TOL_AT_0 = 0.015;   // +/- 1.5 absolute percentage points
  var TOL_AT_90 = 0.02;   // wider band: larger true share tolerates more sampling noise

  var shareAt0 = drawShare(0, N_DRAWS);
  ok('weighted hot-start M3 share at t=0 (real weightedMixedPoolPick, ' + N_DRAWS + ' draws) matches spec 4.76% +/- 1.5pp',
    Math.abs(shareAt0 - SPEC_SHARE_AT_0) < TOL_AT_0,
    'share=' + (shareAt0 * 100).toFixed(2) + '% expected=' + (SPEC_SHARE_AT_0 * 100).toFixed(2) + '%');

  var shareAt90 = drawShare(90, N_DRAWS);
  ok('weighted hot-start M3 share at t=90 (real weightedMixedPoolPick, ' + N_DRAWS + ' draws) matches spec 25% +/- 2pp',
    Math.abs(shareAt90 - SPEC_SHARE_AT_90) < TOL_AT_90,
    'share=' + (shareAt90 * 100).toFixed(2) + '% expected=' + (SPEC_SHARE_AT_90 * 100).toFixed(2) + '%');

  // Drive the REAL seedHotStart (not a hand-rolled reimplementation of its
  // loop) with a minimal mocked `this`, so a mutation that pins its internal
  // timeSec (independent of run.time) is caught even though the two direct
  // weightedMixedPoolPick draws above call with an explicit timeSec and can't
  // see that particular regression. regionEnemyFor is mocked to a pass-through
  // so only the timeSec-dependent weighting is exercised, not the unrelated
  // "does this hot-start slot use a region enemy at all" 46% gate. spawn is a
  // no-op; nothing else about seedHotStart's body depends on scene state.
  var VOID_RIFT_X = -3500; // regionAtX(-3500).key === 'void-rift', verified against hm_data.js
  function driveSeedHotStart(timeSec, out) {
    var fakeThis = {
      level: null,
      activeWaves: [{ pool: [] }],
      p: { x: VOID_RIFT_X, y: 0 },
      run: { time: timeSec },
      levelMods: { spawnRate: 1 },
      hotStartPools: playProto.hotStartPools,
      weightedMixedPoolPick: playProto.weightedMixedPoolPick,
      regionEnemyFor: function (fallback) { out.push(fallback); return fallback; },
      spawn: function () {}
    };
    playProto.seedHotStart.call(fakeThis);
  }
  var seedPicks = [];
  var REPEATS = Math.ceil(N_DRAWS / 80); // HOT_START.count is 80 per call
  for (var r = 0; r < REPEATS; r++) driveSeedHotStart(0, seedPicks);
  var seedShare = seedPicks.filter(function (k) { return M3_HOT_START_KEYS.indexOf(k) !== -1; }).length / seedPicks.length;
  ok('seedHotStart draws through the real timeSec, not a hardcoded one (share at run.time=0 matches spec 4.76% +/- 1.5pp)',
    Math.abs(seedShare - SPEC_SHARE_AT_0) < TOL_AT_0,
    'share=' + (seedShare * 100).toFixed(2) + '% n=' + seedPicks.length);
})();

// ========================================================================
// ROW-GATED SUBSTITUTION (Lane A / R? fix): regionEnemyFor/pickRegionEnemy
// used to substitute ANY REGION_ENEMIES entry for the region regardless of
// whether the current wave row's authored pool contained it. Post-fix,
// substitution is limited to the intersection of the region pool and the
// row's pool, and skipped entirely when that intersection is empty. Drives
// the REAL regionEnemyFor/pickRegionEnemy (via playProto), not a
// reimplementation. SPEC_LITERAL keys below are copied from hm_data.js by
// hand, never read back out of the loaded module.
(function () {
  var PLAY = null;
  try { PLAY = loadGamePlayScene(); } catch (e) { PLAY = null; }
  ok('game.js PlayScene loads for row-gated substitution check',
    !!(PLAY && PLAY.playProto && typeof PLAY.playProto.regionEnemyFor === 'function'),
    PLAY ? 'playProto=' + !!(PLAY && PLAY.playProto) : 'load failed');

  if (!PLAY || !PLAY.playProto) {
    ok('row pool WITHOUT nebula-burrower: 5000 draws through real regionEnemyFor never produce it', false, 'game.js failed to load');
    ok('row pool WITH a region enemy: 5000 draws through real regionEnemyFor sometimes produce it (non-vacuous)', false, 'game.js failed to load');
    return;
  }

  var playProto = PLAY.playProto;
  var VOID_RIFT_X = -3500; // regionAtX(-3500).key === 'void-rift', verified against hm_data.js above

  // SPEC LITERAL: void-rift's REGION_ENEMIES keys, copied by hand from
  // hm_data.js (never read back out of the loaded module).
  var VOID_RIFT_REGION_KEYS = ['blink-stalker', 'gravity-mite', 'null-leech', 'wing-cutter', 'rift-strafer', 'nebula-burrower'];

  function draw(rowPool, fallback, n) {
    var out = [];
    var fakeThis = {
      run: { time: 200, waveIdx: 0, regionEnemiesSeen: {} }, // t=200 so every ramped entry (incl. nebula-burrower rampAt:180) is at full weight; waveIdx:0 so currentRowPool() reads activeWaves[0]
      activeWaves: [{ pool: rowPool }],
      p: { x: VOID_RIFT_X, y: 0 },
      currentRowPool: playProto.currentRowPool,
      pickRegionEnemy: playProto.pickRegionEnemy,
      weightedRegionEntryPick: playProto.weightedRegionEntryPick,
      regionEnemyFor: playProto.regionEnemyFor
    };
    for (var i = 0; i < n; i++) out.push(fakeThis.regionEnemyFor.call(fakeThis, fallback, VOID_RIFT_X, true));
    return out;
  }

  var N = 5000;

  // Case 1: row pool has NO region enemy at all (not even a different one) -
  // intersection with REGION_ENEMIES['void-rift'] is empty, so substitution
  // must be skipped every single draw and the fallback key must come back
  // every time (nebula-burrower zero, but also nothing else region-side).
  var noBurrowerRow = ['drifter', 'sprinter', 'bulwark'];
  var picksNoBurrower = draw(noBurrowerRow, 'drifter', N);
  var burrowerCount = picksNoBurrower.filter(function (k) { return k === 'nebula-burrower'; }).length;
  ok('row pool WITHOUT nebula-burrower: ' + N + ' draws through real regionEnemyFor never produce it',
    burrowerCount === 0, 'count=' + burrowerCount);

  // Case 2 (anti-vacuity): row pool DOES contain one region enemy
  // (blink-stalker). The intersection is non-empty (just that one key), so
  // it MUST be drawn sometimes. This is what stops case 1 from passing
  // because substitution is dead entirely.
  var withStalkerRow = ['drifter', 'sprinter', 'blink-stalker'];
  var picksWithStalker = draw(withStalkerRow, 'drifter', N);
  var stalkerCount = picksWithStalker.filter(function (k) { return k === 'blink-stalker'; }).length;
  ok('row pool WITH blink-stalker: ' + N + ' draws through real regionEnemyFor sometimes produce it (non-vacuous)',
    stalkerCount > 0, 'count=' + stalkerCount);

  // Also assert case 2 never produces nebula-burrower (not in that row's
  // pool either), reusing the same draw set - strengthens the gate check.
  var stalkerRowBurrowerCount = picksWithStalker.filter(function (k) { return k === 'nebula-burrower'; }).length;
  ok('row pool WITH blink-stalker only: ' + N + ' draws never produce nebula-burrower (not in that row pool)',
    stalkerRowBurrowerCount === 0, 'count=' + stalkerRowBurrowerCount);
})();

// ========================================================================
// EVENTS-RNG (Lane B fix): stepRiskEvents used to consume the sim srand()
// for marker placement. Post-fix, risk events use their own seeded
// generator and never touch srand(). srand()'s implementation (game.js)
// calls Math.imul exactly twice per invocation and nothing else in the
// tested code path calls Math.imul, so a counting wrapper around
// Math.imul in the sandbox realm gives an exact srand() call count without
// reaching into game.js's private _seed closure.
(function () {
  var PLAY = null;
  try { PLAY = loadGamePlayScene(); } catch (e) { PLAY = null; }
  ok('game.js PlayScene + hm2_events.js load for events-RNG check',
    !!(PLAY && PLAY.playProto && PLAY.sandbox && PLAY.sandbox.window && PLAY.sandbox.window.HM2_EVENTS),
    PLAY ? 'playProto=' + !!(PLAY && PLAY.playProto) : 'load failed');

  if (!PLAY || !PLAY.playProto || !PLAY.sandbox || !PLAY.sandbox.window || !PLAY.sandbox.window.HM2_EVENTS) {
    ok('stepRiskEvents: srand() call count unchanged (Math.imul delta === 0) while placing a marker', false, 'load failed');
    ok('stepRiskEvents: the tick actually placed a marker (non-vacuous)', false, 'load failed');
    return;
  }

  var playProto = PLAY.playProto;
  var sandbox = PLAY.sandbox;
  var HE = sandbox.window.HM2_EVENTS;

  // Instrument a counting wrapper around Math.imul in the SANDBOX realm
  // (its own Math, separate from the outer Node Math) via a script run in
  // that context, so identity checks inside game.js (Math === Math) still
  // hold.
  var counterScript = new vm.Script(
    '(function(){ var realImul = Math.imul; var n = 0; ' +
    'Math.imul = function(a,b){ n++; return realImul(a,b); }; ' +
    'this.__getImulCount = function(){ return n; }; ' +
    'this.__resetImulCount = function(){ n = 0; }; }).call(this);',
    { filename: 'imul-counter.js' }
  );
  counterScript.runInContext(sandbox);

  // Build a risk-event state with an offer that is ALREADY active but has
  // no marker placed yet, i.e. exactly the branch in stepRiskEvents that
  // used to call srand() for mp.x/mp.y. scheduleNext() is a no-op here
  // since state.offer.active is already true, so this isolates the marker
  // placement call specifically.
  var re = HE.resetEvents();
  re.offer = { type: 'distress-beacon', active: true, startedAt: 0, expiresAt: 14, x: 0, y: 0 };
  re.lastOfferAt = 0;
  re.now = 5;

  var fakeThis = {
    run: { time: 5 },
    riskEvents: re,
    p: { x: -3500, y: 0 },
    riskEventMarker: null,
    riskEventGfx: {
      ring: { setPosition: function () { return this; }, setTint: function () { return this; }, setVisible: function () { return this; } },
      icon: { setPosition: function () { return this; }, setTint: function () { return this; }, setVisible: function () { return this; } }
    },
    showBanner: function () {},
    hideRiskEventMarker: function () {},
    resolveRiskEventSpawn: function () {},
    stepRiskEvents: playProto.stepRiskEvents
  };

  sandbox.__resetImulCount();
  fakeThis.stepRiskEvents.call(fakeThis, 0.016);
  var imulDelta = sandbox.__getImulCount();

  var markerPlaced = !!fakeThis.riskEventMarker && typeof fakeThis.riskEventMarker.x === 'number';

  ok('stepRiskEvents: the tick actually placed a marker (non-vacuous)',
    markerPlaced, 'riskEventMarker=' + JSON.stringify(fakeThis.riskEventMarker));

  ok('stepRiskEvents: srand() call count unchanged (Math.imul delta === 0) while placing a marker',
    imulDelta === 0, 'Math.imul delta=' + imulDelta + ' (2 imul calls per srand() invocation)');
})();

// ========================================================================
// HOTFIX REGRESSION: bug A (unplaced terrain features absorbing projectiles)
// and bug B (fire rate divisor undefined -> NaN). Both run the REAL
// game.js prototype methods (featureOfType, currentRegionFeatures,
// applyTerrainToProjectile, stepPrimaryWeapon) in the vm sandbox, not a
// reimplementation, so a regression in the actual fix is caught.
// ========================================================================
(function () {
  var PLAY = null;
  try { PLAY = loadGamePlayScene(); } catch (e) { PLAY = null; }
  ok('game.js PlayScene loads for the hotfix regression tests',
    !!(PLAY && PLAY.playProto && typeof PLAY.playProto.featureOfType === 'function' &&
      typeof PLAY.playProto.featureOfTypePlaced === 'function' &&
      typeof PLAY.playProto.stepPrimaryWeapon === 'function'),
    PLAY ? 'playProto=' + !!(PLAY && PLAY.playProto) : 'load failed');

  if (!PLAY || !PLAY.playProto) {
    ok('bug A: unplaced terrain features never absorb a projectile', false, 'game.js failed to load');
    ok('bug B: weapon fires at most ceil(t*rate)+1 shots in t seconds', false, 'game.js failed to load');
    return;
  }

  var playProto = PLAY.playProto;
  var sandbox = PLAY.sandbox;

  // hm2_world.js is not loaded by loadGamePlayScene (only hm2_events.js and
  // game.js are); featureOfType/currentRegionFeatures/applyTerrainToProjectile
  // all read window.HM2_WORLD, so load it into the same vm context game.js
  // ran in (dual module.exports/window export, same pattern as elsewhere).
  var wsrc = fs.readFileSync(path.join(__dirname, 'hm2_world.js'), 'utf8');
  var wcode = new vm.Script(wsrc, { filename: 'hm2_world.js' });
  wcode.runInContext(sandbox);

  // Likewise, window.HM2_WEAPONS was set in loadGameData()'s own throwaway
  // sandbox (used only to build __HM_DATA/__HM_LEVELS), not in the outer
  // sandbox game.js actually ran in. Load it here so stepPrimaryWeapon's
  // window.HM2_WEAPONS.lvl/effectiveSpec calls resolve for real.
  var wpsrc = fs.readFileSync(path.join(__dirname, 'hm2_weapons.js'), 'utf8');
  var wpcode = new vm.Script(wpsrc, { filename: 'hm2_weapons.js' });
  wpcode.runInContext(sandbox);

  // ---- Bug A: unplaced terrain features never absorb a projectile ----
  // Drive the real currentRegionFeatures/applyTerrainToProjectile with a
  // shot near the player (region features are never placed, so ANY
  // position must be safe: this is not "far from a real feature", it is
  // "there is no real feature to be far from"). Before the fix,
  // featureOfType hands back the unplaced derelict_hulk/asteroid_field
  // descriptors and the projectile hook absorbs on frame 1 every time.
  var fakePlayer = { x: 0, y: 0 };
  var fakeThisA = {
    p: fakePlayer,
    run: { time: 0, _featFrame: undefined, _featList: undefined },
    currentRegionFeatures: playProto.currentRegionFeatures,
    featureOfType: playProto.featureOfType,
    featureOfTypePlaced: playProto.featureOfTypePlaced,
    applyTerrainToProjectile: playProto.applyTerrainToProjectile
  };
  var TRIALS_A = 500;
  var absorbedCount = 0;
  for (var ai = 0; ai < TRIALS_A; ai++) {
    fakeThisA.run.time = ai; // force a fresh currentRegionFeatures resolve each trial
    fakeThisA.run._featFrame = undefined;
    var shot = { x: ai * 3, y: -ai * 2, vx: 400, vy: 0 };
    var features = fakeThisA.currentRegionFeatures.call(fakeThisA);
    var res = fakeThisA.applyTerrainToProjectile.call(fakeThisA, shot, features, sandbox.window.HM2_WORLD);
    if (res && res.absorbed) absorbedCount++;
  }
  ok('bug A: unplaced terrain features never absorb a projectile (' + absorbedCount + '/' + TRIALS_A + ' absorbed)',
    absorbedCount === 0);

  // Bug A must NOT be over-fixed. nebula.visibility reads the PLAYER-to-ENEMY
  // delta, never feature.x/y, so it is correct on an unplaced feature and must
  // still resolve. Blanket-guarding featureOfType disabled enemy cloaking and
  // moved the aurelion-graveyard world-probe luminance delta from 0.2146 to
  // 0.1797, under the 0.18 gate. Guarded lookups must reject; nebula must not.
  var nebFeatures = fakeThisA.currentRegionFeatures.call(fakeThisA);
  var nebResolved = playProto.featureOfType.call(fakeThisA, nebFeatures, 'nebula');
  var hulkGuarded = playProto.featureOfTypePlaced.call(fakeThisA, nebFeatures, 'derelict_hulk');
  ok('bug A guard is scoped: unguarded featureOfType still resolves nebula (position-independent hook)',
    !!nebResolved, 'nebula=' + (nebResolved ? nebResolved.type : 'null'));
  ok('bug A guard is scoped: featureOfTypePlaced rejects the unplaced derelict_hulk',
    hulkGuarded === null, 'hulk=' + (hulkGuarded ? 'resolved' : 'null'));

  // ---- Bug B: weapon fires at most ceil(t*rate)+1 shots in t seconds ----
  // Drive the real stepPrimaryWeapon for slot 0 over T seconds at a fixed
  // dt, counting how many times c.primarySlots[0] cooldown actually fires
  // (fireSpecWeapon/fx are stubbed no-ops so this isolates the cadence
  // math, not shot behavior). nearestEnemy always returns a target so the
  // weapon never idles waiting for one. Before the fix, data.rate is
  // undefined -> NaN -> `interval` is NaN -> `c.primarySlots[slotIndex] > 0`
  // is false every frame (NaN comparisons are always false) -> the weapon
  // fires every single step.
  var HM_DATA = sandbox.window.__HM_DATA;
  var WEAPON_BY_KEY = HM_DATA.WEAPON_BY_KEY;
  var HM2_WEAPONS_MOD = sandbox.window.HM2_WEAPONS;

  function driveWeapon(weaponKey, level, T, dt) {
    var fireCount = 0;
    var fakeTarget = { x: 200, y: 0, alive: true };
    var fakeThisB = {
      p: {
        x: 0, y: 0, ranks: { lance: 1 }, weaponRate: 0, hangarRate: 0,
        damage: 1, projectileDamage: 1, multishot: 0, wingDamage: 1
      },
      run: {
        weaponSlots: [weaponKey], equippedWeapon: weaponKey,
        buffs: { arsenal: 0 }, weaponLevel: {}
      },
      cool: { primarySlots: [0, 0, 0] },
      fx: { impact: { setParticleTint: function () {}, emitParticleAt: function () {} } },
      nearestEnemy: function () { return fakeTarget; },
      fireSpecWeapon: function () { fireCount++; return true; },
      fireWingVolley: function () {},
      contactRing: function () {}
    };
    fakeThisB.run.weaponLevel[weaponKey] = level;
    var steps = Math.round(T / dt);
    for (var i = 0; i < steps; i++) {
      playProto.stepPrimaryWeapon.call(fakeThisB, dt, 0);
    }
    return fireCount;
  }

  // The `rate` level stat is a divisor into stepPrimaryWeapon's interval
  // formula, not a literal shots/sec figure (mastery, weaponRate, hangarRate
  // and slotCadence all factor in too -- see game.js stepPrimaryWeapon).
  // With mastery=1, weaponRate=0, hangarRate=0, arsenal off and slot 0's
  // cadence=1 (all held fixed by driveWeapon's fakeThisB), the effective
  // per-shot interval the fixed code computes is:
  //   interval = max(0.12, 0.555 / rate)
  // so effective rate r_eff = 1 / interval = min(rate / 0.555, 1/0.12).
  // Before the fix, data.rate is undefined so this whole computation is NaN
  // and the cooldown gate (NaN > 0 is always false) fires every single dt
  // step instead, which is what this test catches.
  var T_SECONDS = 10, DT = 1 / 60;
  var worstOverage = null;
  for (var wk in WEAPON_BY_KEY) {
    if (!WEAPON_BY_KEY.hasOwnProperty(wk)) continue;
    var wdata = WEAPON_BY_KEY[wk];
    var row1 = HM2_WEAPONS_MOD.lvl(wdata, 0);
    if (!row1 || typeof row1.rate !== 'number') continue; // reported separately below
    var shots = driveWeapon(wk, 1, T_SECONDS, DT);
    var rEff = Math.min(row1.rate / 0.555, 1 / 0.12);
    var maxAllowed = Math.ceil(T_SECONDS * rEff) + 1;
    if (shots > maxAllowed) {
      worstOverage = wk + ': ' + shots + ' shots > ' + maxAllowed + ' allowed (rate=' + row1.rate + ', r_eff=' + rEff.toFixed(2) + ')';
      break;
    }
  }
  ok('bug B: every weapon fires at most ceil(t*r_eff)+1 shots in ' + T_SECONDS + 's at dt=1/60' +
    (worstOverage ? ' (FIRST FAILURE: ' + worstOverage + ')' : ''),
    worstOverage === null);

  // Report (not invent) any weapon lacking a rate on its level-1 row, per
  // the task instruction to report rather than invent numbers.
  var noRate = [];
  for (var wk2 in WEAPON_BY_KEY) {
    if (!WEAPON_BY_KEY.hasOwnProperty(wk2)) continue;
    var row1b = HM2_WEAPONS_MOD.lvl(WEAPON_BY_KEY[wk2], 0);
    if (!row1b || typeof row1b.rate !== 'number') noRate.push(wk2);
  }
  ok('every weapon in WEAPON_BY_KEY has a numeric rate on its level-1 row (' + noRate.length + ' missing)',
    noRate.length === 0, noRate.join(', '));
})();

// ========================================================================
console.log('');
console.log(cases + ' assertions, ' + failures + ' failed');
process.exit(failures > 0 ? 1 : 0);
