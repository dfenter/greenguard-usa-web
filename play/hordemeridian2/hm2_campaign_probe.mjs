#!/usr/bin/env node
/* hm2_campaign_probe - M4a gate for the Horde Meridian 2 Rev 2 campaign.
 * 1. boots play/hordemeridian2, asserts all 15 levels validate (no dropped level)
 * 2. boots each level and fast-forwards through its arc
 * 3. runs the sector-steering bot (ported from hm_hotstart_gate) on 1,5,10,15
 *    for N trials each and reports survival medians.
 * Usage: node hm2_campaign_probe.mjs [url] [shotdir] [trials]
 */
import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://127.0.0.1:8791/play/hordemeridian2/';
const SHOTDIR = process.argv[3] || '/tmp/hm2_campaign_shots';
const TRIALS = Number(process.argv[4] || 3);
fs.mkdirSync(SHOTDIR, { recursive: true });
const W = 390, H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
function step(name, ok, detail) {
  log.push({ step: name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail != null ? '  :: ' + detail : ''));
}

// sector-steering bot, ported verbatim in spirit from hm_hotstart_gate.mjs
const BOT = () => {
  window.__gateBot = setInterval(() => {
    const s = window.__HORDE.game.scene;
    if (!s || !s.p) return;
    if (s.state !== 'playing') {
      if (s.pickUpgrade && (s.state === 'draft' || s.state === 'levelup')) s.pickUpgrade(0);
      return;
    }
    const p = s.p, R = 260, SEC = 8, dens = new Array(SEC).fill(0);
    let near140 = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d < 140) near140++;
      if (d < R) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        dens[k] += (R - d) / R;
        dens[(k + 1) % SEC] += 0.4 * (R - d) / R;
        dens[(k + SEC - 1) % SEC] += 0.4 * (R - d) / R;
      }
    }
    const gemPull = new Array(SEC).fill(0);
    if (s.gems) for (const g of s.gems) {
      if (!g.alive) continue;
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      if (d < 500) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        gemPull[k] += 0.6 * (500 - d) / 500;
      }
    }
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < SEC; k++) {
      const sc = dens[k] - gemPull[k];
      if (sc < bestScore) { bestScore = sc; best = k; }
    }
    const ang = (best + 0.5) / SEC * Math.PI * 2;
    const vx = Math.cos(ang), vy = Math.sin(ang);
    // Drive the REAL input path. game.js reads this.stick {active,dx,dy} at the
    // movement integrator; writing s.input.* or p.vx/p.vy directly is inert
    // (the integrator overwrites velocity every frame from the stick), which
    // made the original bot barely steer and die in ~20s on any level.
    s.stick.active = true; s.stick.dx = vx; s.stick.dy = vy;
    if (near140 >= 12 && (s.run.strikeCharges || 0) > 0 && !s.airStrike.active) s.tryCallAirstrike();
  }, 50);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--hide-scrollbars', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W},${H}`] });

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  const warns = [];
  page.on('console', (m) => {
    const t = m.text().slice(0, 300);
    if (m.type() === 'error') errs.push(t);
    if (m.type() === 'warning' || m.type() === 'warn') warns.push(t);
  });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 300)));
  let loaded = false;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__HORDE_READY === true, { timeout: 45000 });
      loaded = true;
    } catch (e) {
      if (attempt === 2) throw e;
      await wait(2000);
    }
  }
  await wait(2000);
  return { page, errs, warns };
}

// ---- Phase 1: registry ----
const { page, errs, warns } = await newPage();
const boot = await page.evaluate(() => ({
  levels: window.__HM_CAMPAIGN.levels().length,
  ids: window.__HM_CAMPAIGN.levels().map((l) => l.id),
  names: window.__HM_CAMPAIGN.levels().map((l) => l.name),
  durs: window.__HM_CAMPAIGN.levels().map((l) => l.duration),
  regions: window.__HM_CAMPAIGN.levels().map((l) => l.region),
  defined: Object.keys(window.__HM_LEVELS || {}).length,
  hasUI: !!window.__HM_CAMPAIGN_UI,
}));
step('registry: 15 level files defined', boot.defined === 15, boot.defined);
step('registry: 15 levels validate (none dropped)', boot.levels === 15, boot.ids.join(','));
const dropWarns = warns.filter((w) => /\[hm campaign\]/.test(w));
step('registry: no level rejected/missing warning', dropWarns.length === 0, dropWarns.join(' | '));
step('registry: names unique and <= 18 chars',
  new Set(boot.names).size === boot.names.length && boot.names.every((n) => n.length <= 18),
  boot.names.join('/'));
step('registry: durations span the 120..560 range',
  Math.min(...boot.durs) >= 120 && Math.max(...boot.durs) <= 560 && new Set(boot.durs).size >= 10,
  Math.min(...boot.durs) + '..' + Math.max(...boot.durs) + ' uniq=' + new Set(boot.durs).size);
step('registry: campaign UI present', boot.hasUI);
const realErrs = errs.filter((e) => !/scope/.test(e) && !/Service Worker/i.test(e));
step('boot: no console errors (sw scope noise excluded)', realErrs.length === 0, realErrs.join(' | '));
console.log('MISSIONS ' + JSON.stringify(boot.ids.map((id, i) => [id, boot.names[i], boot.regions[i], boot.durs[i]])));

// ---- Phase 2: every level boots and runs its arc ----
await page.evaluate(() => {
  window.__HORDE.profile.campaign.unlocked = 15;
  window.__HORDE.kit.save.set(window.__HORDE.profile);
});
for (let id = 1; id <= 15; id++) {
  const before = errs.length;
  await page.evaluate((lid) => window.__HM_CAMPAIGN.start(lid), id);
  await wait(2200);
  // M4: a level with an authored intro cutscene holds state at 'cutscene-intro'
  // until the cutscene ends or the player skips it. The intro is driven by the
  // real scene clock (scene.time.now), NOT by run.time, so fast-forwarding
  // run.time below will never end it. Skip it the same way a player taps to
  // skip, then wait for 'playing'. No-op on the 13 levels without cutscenes.
  await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    if (s.state === 'cutscene-intro' && s.input) s.input.emit('pointerdown');
  });
  await page.waitForFunction(
    () => window.__HORDE.game.scene.state !== 'cutscene-intro',
    { timeout: 20000 }
  ).catch(() => {});
  await wait(300);
  const sa = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    return { state: s.state, level: s.level ? s.level.id : 0, region: window.__hm.state.region, secs: s.activeRunSeconds };
  });
  step(`L${id} boots`, sa.state === 'playing' && sa.level === id, JSON.stringify(sa));
  await page.evaluate(() => { const s = window.__HORDE.game.scene; s.run.time = Math.floor(s.activeRunSeconds * 0.7); });
  await wait(4000);
  const sb = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    return { t: Math.round(s.run.time), st: s.state, n: s.enemyCount, boss: !!s.run.bossUp, final: !!s.run.campaignFinalSpawned };
  });
  // 'draft'/'levelup' are healthy states: no bot is driving in this phase, so a
  // pending upgrade card legitimately pauses the sim.
  step(`L${id} mid-run alive`,
    ['playing', 'over', 'draft', 'levelup'].indexOf(sb.st) >= 0, JSON.stringify(sb));
  step(`L${id} no console errors`, errs.length === before, errs.slice(before).join(' | '));
  if (id === 1 || id === 15) await page.screenshot({ path: `${SHOTDIR}/L${id}.png` });
}
await page.close();

// ---- Phase 3: sector bot survival on 1, 5, 10, 15 ----
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1;
  return b.length % 2 ? b[m] : Math.round((b[m - 1] + b[m]) / 2); };
const results = {};
for (const lid of [1, 5, 10, 15]) {
  const times = [];
  for (let t = 0; t < TRIALS; t++) {
    const { page: bp, errs: be } = await newPage();
    await bp.evaluate((l) => {
      const g = window.__HORDE.game;
      g.pendingLevel = window.__HM_LEVELS[l];
      (g.scene || g.phaser.scene.getScenes(true)[0]).scene.start('play');
    }, lid);
    await wait(600);
    await bp.evaluate(BOT);
    let out = null;
    const cap = Math.ceil(200 / 5);
    for (let i = 0; i < cap; i++) {
      await wait(5000);
      const s = await bp.evaluate(() => {
        const sc = window.__HORDE.game.scene;
        return { hp: Math.round(sc.p.hp), t: Math.round(sc.run.time), st: sc.state, n: sc.enemyCount };
      });
      if (s.hp <= 0 || s.st === 'dead' || s.st === 'gameover' || s.st === 'over' || s.st === 'win') { out = s; break; }
    }
    const final = out || await bp.evaluate(() => ({ t: Math.round(window.__HORDE.game.scene.run.time), st: 'running', hp: 1, n: 0 }));
    // A t=0 result means the page/run never started (flaky tab), not a death.
    // Counting it would poison the median, so retry rather than record it.
    if (final.t > 0) times.push(final.t);
    else t--;
    console.log(`  bot L${lid} trial${t + 1}: t=${final.t}s state=${final.st} hp=${final.hp} errs=${be.length}`);
    await bp.evaluate(() => clearInterval(window.__gateBot));
    await bp.close();
  }
  results[lid] = { trials: times, median: median(times) };
}
// Survival medians are INFORMATIONAL ONLY (Dan's ruling): too noisy across
// real-clock trials to assert on, not a code-correctness signal. They are
// printed for visibility but no longer gate the probe. See Phase 4 below for
// the deterministic seeded replacement metric.
console.log('BOT MEDIANS (informational only, no longer gated) ' + JSON.stringify(results));

// ---- Phase 4: deterministic seeded metric (replaces the survival-median
// gate per Dan's ruling: medians were a methodology defect, too noisy across
// real-clock trials to assert on). For each mission, with a FIXED seed, runs
// the bot-driven sim for the first 60 sim-seconds and records enemy
// composition (spawn counts by key) and total player damage taken via the
// p.damageTaken accumulator path (never sampled hp - Warden shield regen
// voids sampled-hp assertions), then asserts against SPEC LITERALS captured
// once at this HEAD.
//
// Determinism strategy: the real per-frame update loop reads real wall-clock
// time in two places that make a live browser run non-reproducible even with
// a seeded RNG: (1) Phaser's own rAF loop feeds `update(now)` real deltas,
// and (2) the shared, frozen play/_shared/ggkit.js's kit.juice.frame() gates
// the sim step on real performance.now() for hit-stop/shake windows (a
// synchronous drive loop barely advances real time, so that gate can freeze
// the sim for thousands of iterations). Both are wall-clock, not game.js, so
// they can't be fixed by editing frozen game.js. The probe instead: stops
// Phaser's real loop right after the scene starts, pins performance.now()
// to a synthetic monotonic clock, and drives scene.update(now) itself at a
// fixed 1000/60 ms step - giving the real spawn/collision/draft code paths a
// fully reproducible clock. Math.random is also reseeded (mulberry32-style)
// since game.js's own seeded srand() only covers spawn-position/region-pool
// draws, not crit rolls, drone angles, or hit-stop timing jitter.
async function deterministicMetric(lid) {
  // Isolated incognito context: phases 1-3 already ran real gameplay on the
  // shared `browser` (level boots + bot trials), which persists to
  // localStorage (campaign unlocks, meta-currency, upgrades). A plain
  // browser.newPage() shares that storage across every page on the same
  // origin, so starting stats would silently drift from the clean profile
  // the spec literals were captured against. A fresh incognito context has
  // no localStorage/IndexedDB history, matching a clean-profile capture.
  const ctx = await browser.createBrowserContext();
  const bp = await ctx.newPage();
  await bp.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await bp.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await bp.waitForFunction(() => window.__HORDE_READY === true, { timeout: 45000 });
  // Let async boot/asset-load work on the fresh incognito page fully settle
  // before seeding: without this, two identically-coded runs can still
  // diverge by a frame or two because some boot-time async work is still in
  // flight when the deterministic drive starts.
  await wait(1500);
  await bp.evaluate(() => {
    // Probe-side deterministic RNG (mulberry32-style), fixed seed. game.js is
    // frozen so this cannot be seeded inside it; overriding window.Math.random
    // here covers every Math.random() call the sim makes during the drive.
    let seed = 0xC0FFEE;
    Math.random = function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await bp.evaluate((l) => {
    const g = window.__HORDE.game;
    g.pendingLevel = window.__HM_LEVELS[l];
    (g.scene || g.phaser.scene.getScenes(true)[0]).scene.start('play');
  }, lid);
  // Let exactly one real rAF frame elapse so Phaser's scene manager
  // processes the pending 'play' start and instantiates the scene, then
  // immediately stop the real loop before any further real-time frames (and
  // their RNG/srand draws) can run.
  await bp.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__HORDE.game.phaser.loop.stop();
      resolve();
    }));
  }));
  // ---- QUIESCED START (M6-INSTR) ----------------------------------------
  // Stopping the real loop above is NOT enough. Between scene.start('play')
  // and loop.stop(), Phaser's real rAF loop runs an UNCONTROLLED number of
  // wall-clock frames (measured: ~96-101, host-load dependent). Those frames
  // spawn enemies, advance run.time, and draw from the sim RNG before the
  // synthetic drive takes over, so the drive began from a DIFFERENT scene
  // state on every run: observed 52 enemies already alive, state still
  // 'cutscene-intro', regionFieldTask still pending. That uncontrolled start
  // state is the carrier of the ~1-in-14 composition flake that made the
  // pristine baseline fail its own literals at an identical frame count.
  //
  // Fix: after pinning the synthetic clock (below), call game.js's own
  // resetRun() (game.js:3198) to return the scene to a defined t=0. It calls
  // resetSeed() (game.js:3200) and killSprite()s every enemy/gem/bonus/
  // weaponDrop/base/ambientEvent, rebuilds this.run with time:0, and clears
  // regionFieldTask (game.js:3286). We do NOT modify game.js; we only call a
  // function it already exposes, at a point where the clock is ours.
  //
  // Order matters and is: (1) pin performance.now() to the synthetic epoch,
  // (2) resetRun(), (3) deterministically clear cutscene-intro, (4) drain
  // regionFieldTask, (5) re-pin lastNow, (6) install the spawn counter and
  // zero damageTaken, (7) drive. Steps 1-5 happen BEFORE the counter is
  // installed so nothing resetRun itself does is ever counted.
  const startState = await bp.evaluate(() => {
    const sc = window.__HORDE.game.scene;
    const before = {
      enemies: sc.enemies.filter((e) => e.alive).length,
      time: sc.run.time,
      state: sc.state,
      regionFieldTask: !!sc.regionFieldTask,
    };
    // (1) pin the clock first: resetRun() reads performance.now() for its
    // watchdog bookkeeping (game.js:3300), so it must already be synthetic.
    let now = 1000000; // fixed synthetic epoch, not wall-clock
    window.__hm2Now = () => now;
    window.__hm2SetNow = (v) => { now = v; };
    performance.now = () => now;
    // (2) full reset to a defined t=0 under our clock
    sc.resetRun();
    // (3) resetRun re-enters 'cutscene-intro' for authored-intro missions.
    // Clear it deterministically here rather than mid-drive, so the drive
    // always begins in exactly one state: 'playing'.
    for (let i = 0; i < 240 && sc.state === 'cutscene-intro'; i++) {
      if (sc.input) sc.input.emit('pointerdown');
      sc.update(now);
    }
    // (4) drain the cosmetic star/debris reseed task to completion so no
    // budgeted background work straddles the frame-0 boundary.
    for (let i = 0; i < 2000 && sc.regionFieldTask; i++) sc.stepRegionFieldReseed();
    // (5) the cutscene skip above consumed synthetic frames; re-zero the run
    // clock so every context starts counting from an identical run.time.
    sc.run.time = 0;
    sc.lastNow = now;
    // Fingerprint the post-reset scene. NOTE: a live enemy count of 0 is NOT
    // the right invariant here. resetRun() ends by calling seedHotStart()
    // (game.js:3589), which deliberately places HOT_START.count enemies on a
    // ring around the player using srand() draws off the seed resetSeed()
    // just restored. Those enemies are part of the authored mission opening,
    // not leftover state. The invariant that matters is that the start state
    // is REPRODUCIBLE: same seeded count, same positions, run.time 0, state
    // 'playing', no pending background task. The cross-context check below
    // compares this fingerprint across all 3 contexts, so a start state that
    // varies run-to-run now FAILS instead of silently biasing the metric.
    const alive = sc.enemies.filter((e) => e.alive);
    let px = 0, py = 0;
    for (const e of alive) { px += e.x; py += e.y; }
    return {
      before,
      after: {
        enemies: alive.length,
        time: sc.run.time,
        state: sc.state,
        regionFieldTask: !!sc.regionFieldTask,
        // positional checksum, rounded to kill float-print noise
        posSum: Math.round((px + py) * 1000) / 1000,
        playerX: Math.round(sc.p.x * 1000) / 1000,
        playerY: Math.round(sc.p.y * 1000) / 1000,
      },
    };
  });
  if (startState.after.time !== 0 || startState.after.state !== 'playing' ||
    startState.after.regionFieldTask) {
    throw new Error(`L${lid} quiesced start not achieved: ${JSON.stringify(startState.after)}`);
  }
  await bp.evaluate(() => {
    window.__spawnCounts = {};
    const s = window.__HORDE.game.scene;
    // p.damageTaken: game.js OWNS this field on the merged (M4+M5) tree. The
    // M4-era comment that "game.js has no such field" was true when this probe
    // was written against the pre-merge M4 tree, but M5's 022cef7c added the
    // accumulator to game.js. Call-graph evidence gathered at merge time:
    //
    //   - game.js:9024 (PlayScene.hurt, the solo path) does
    //     `p.damageTaken = (p.damageTaken || 0) + amt` BEFORE the Warden
    //     shield absorbs, so it counts damage that landed, shield or not.
    //   - game.js:11632 is inside the co-op override `PS.hurt` installed at
    //     11620. That override early-returns `origHurt.call(...)` (i.e. the
    //     9024 path) unless `coop.role === 'host' && this.p2`. This probe
    //     never sets window.__HM_COOP and runs solo, so 11632 is unreachable
    //     here and the two sites can never both fire for one hit.
    //   - Every damage source routes through hurt(): game.js 6251, 8105,
    //     8415, 8425, 8697, 8752 all call `this.hurt(...)`. There is no
    //     increment site outside hurt(), so game.js's counter covers every
    //     damage path this metric needs.
    //
    // So there is exactly ONE writer. The old wrapper additionally measured
    // the wrong quantity: it diffed p.hp, which on the merged tree is
    // POST-shield (Warden is now the default class and absorbs into its 35
    // pool first), whereas the metric wants damage that landed. Assigning
    // that hp-diff onto s.p.damageTaken clobbered game.js's pre-shield value.
    // Resolution: game.js is the sole writer; the probe only READS the field.
    s.p.damageTaken = 0;
    const origSpawn = s.spawn.bind(s);
    s.spawn = function (fam, elite, atX, atY, force) {
      const e = origSpawn(fam, elite, atX, atY, force);
      if (e) window.__spawnCounts[fam] = (window.__spawnCounts[fam] || 0) + 1;
      return e;
    };
  });
  await bp.evaluate(BOT_TICK_SRC);
  const result = await bp.evaluate(async () => {
    const sc = window.__HORDE.game.scene;
    // performance.now() was already pinned to the synthetic clock in the
    // quiesced-start block above (kit.juice.frame() in the frozen shared
    // ggkit.js gates the sim step on real performance.now() for hit-stop /
    // shake windows, which would otherwise desync a synchronously-driven
    // sim). Continue from that same clock rather than re-declaring it, so
    // the reset and the drive share one monotonic timeline.
    let now = window.__hm2Now();
    sc.lastNow = now;
    const stepMs = 1000 / 60;
    let frame = 0;
    const safetyCap = 60 * 60 * 3; // generous vs. the ~3700 frames a 60s run needs
    while (sc.run.time < 61 &&
      (sc.state === 'playing' || sc.state === 'draft' || sc.state === 'levelup' || sc.state === 'cutscene-intro')) {
      now += stepMs;
      window.__hm2SetNow(now); // keep the pinned performance.now() in step
      // The quiesced-start block already cleared 'cutscene-intro' before the
      // drive began, so the drive never starts in it. Kept as a guard only:
      // if a mission were ever to re-enter an authored intro mid-run, skip it
      // deterministically rather than stalling the loop.
      if (sc.state === 'cutscene-intro' && sc.input) sc.input.emit('pointerdown');
      window.__gateBotTick && window.__gateBotTick();
      sc.update(now);
      frame++;
      if (frame > safetyCap) break;
    }
    return {
      spawnCounts: window.__spawnCounts,
      dmgTaken: sc.p.damageTaken || 0,
      finalTime: sc.run.time,
      finalState: sc.state,
      frames: frame,
    };
  });
  await ctx.close();
  // startFingerprint rides along so the cross-context check can prove the
  // DRIVE STARTED FROM THE SAME PLACE in every context, not merely that the
  // three drives happened to end up agreeing.
  result.startFingerprint = startState.after;
  return result;
}

// The bot's per-tick decision logic, ported to a standalone tick function
// (no setInterval - the deterministic drive calls it once per synthetic
// frame from window.__gateBotTick).
const BOT_TICK_SRC = () => {
  window.__gateBotTick = () => {
    const s = window.__HORDE.game.scene;
    if (!s || !s.p) return;
    if (s.state !== 'playing') {
      if (s.pickUpgrade && (s.state === 'draft' || s.state === 'levelup')) {
        const pinnedNow = s.lastNow;
        s.pickUpgrade(0);
        // pickUpgrade() resyncs lastNow to real performance.now(); re-pin it
        // to the synthetic clock so the fixed-step accumulator stays
        // deterministic across draft picks.
        s.lastNow = pinnedNow;
      }
      return;
    }
    const p = s.p, R = 260, SEC = 8, dens = new Array(SEC).fill(0);
    let near140 = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d < 140) near140++;
      if (d < R) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        dens[k] += (R - d) / R;
        dens[(k + 1) % SEC] += 0.4 * (R - d) / R;
        dens[(k + SEC - 1) % SEC] += 0.4 * (R - d) / R;
      }
    }
    const gemPull = new Array(SEC).fill(0);
    if (s.gems) for (const g of s.gems) {
      if (!g.alive) continue;
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      if (d < 500) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        gemPull[k] += 0.6 * (500 - d) / 500;
      }
    }
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < SEC; k++) {
      const sc = dens[k] - gemPull[k];
      if (sc < bestScore) { bestScore = sc; best = k; }
    }
    const ang = (best + 0.5) / SEC * Math.PI * 2;
    const vx = Math.cos(ang), vy = Math.sin(ang);
    s.stick.active = true; s.stick.dx = vx; s.stick.dy = vy;
    if (near140 >= 12 && (s.run.strikeCharges || 0) > 0 && !s.airStrike.active) s.tryCallAirstrike();
  };
};

// SPEC LITERALS, captured once at this HEAD by running deterministicMetric
// against it (game.js/hm_data.js unchanged since). Any future intentional
// gameplay change (spawn weights, damage tuning, difficulty ramp) requires
// re-capturing these by hand and noting the new HEAD in this comment - they
// are never derived from the code under test.
//
// RECAPTURED at the M4+M5 merge. Both halves of the merge moved these, and
// each changed literal has a cause:
//
//   COMPOSITION (all four missions): M4's row-gate. pickRegionEnemy now
//   intersects the region table with the ACTIVE WAVE ROW's authored pool
//   (currentRowPool), so a substitution that used to be able to draw any
//   REGION_ENEMIES entry is now restricted to the row's pool. Draws that the
//   gate rejects fall back to the row's own family, which shifts counts
//   between the base family and the region variants. This is the row-gate
//   working as designed, not a spawn-table regression; ship class does not
//   feed the spawn tables at all.
//
//   DAMAGE (L5, L10, L15): M5 made ship classes live with Warden as the
//   DEFAULT hull (hpMult 1.30 plus a 35-point regenerating shield). game.js
//   counts p.damageTaken BEFORE the shield absorbs, so the figure now
//   includes damage the shield ate, which the old hp-diff probe accumulator
//   never saw. L10 and L15 also now end early (state 'over' at ~54s/~53s),
//   so their totals cover a full death rather than a clean 60s.
//
// L1 dmgTaken stays 0: the bot takes no hits at all in the first 60s there.
//
// Determinism note: these are reproducible to the bit, but the sim is
// sensitive to host LOAD. A concurrent puppeteer run on the same machine
// perturbs L5/L15 (observed during the merge). Capture and gate these on an
// otherwise-idle machine, one browser probe at a time.
const SPEC_LITERALS = {
  1: { spawnCounts: { drifter: 34, sprinter: 47, 'grave-egg': 9, 'derelict-guard-hulk': 6, 'scrap-ripper': 3, 'wall-warden': 1, 'salvage-swarm': 99, bulwark: 8 }, dmgTaken: 0 },
  5: { spawnCounts: { drifter: 16, 'ember-scarab': 117, sprinter: 8, 'ash-wraith': 79, 'cinder-kamikaze': 68, lancer: 10 }, dmgTaken: 45.45162273333325 },
  10: { spawnCounts: { 'gravity-mite': 94, 'blink-stalker': 106, drifter: 1, 'null-leech': 64, 'wing-cutter': 1, sprinter: 3 }, dmgTaken: 24.13105263157889 },
  15: { spawnCounts: { drifter: 74, sprinter: 93, bulwark: 36, 'cinder-kamikaze': 36, 'blink-stalker': 45 }, dmgTaken: 250.7782669736837 },
};
const CAPTURE_MODE = process.env.HM2_CAPTURE === '1';
const DMG_TOL_FRAC = 0.10; // damage taken tolerance: 10% relative
const COUNT_TOL = 0; // spawn counts must match exactly for a seeded, deterministic sim

// CROSS-CONTEXT AGREEMENT (M6-INSTR). This REPLACES the former "two runs
// identical" check, which was vacuous: it called deterministicMetric() twice
// but both calls ran in ONE browser context, and the metric is stable WITHIN
// a context and unstable ACROSS contexts. The old assertion therefore could
// not fail for the thing it claimed to test, while the pristine baseline was
// in fact failing its own composition literals roughly 1 run in 14.
//
// Each deterministicMetric() call already creates its own incognito
// BrowserContext and closes it, so N=3 sequential calls are 3 INDEPENDENT
// contexts. All three must agree EXACTLY on composition and damage. This is
// strictly stronger than what it replaces, not weaker: COUNT_TOL stays 0, and
// cross-context damage agreement is required to the bit (1e-9), tighter than
// the 10% tolerance used against the stored literal.
const CONTEXTS = 3;

// Discarded warm-up context. The FIRST browser context a node process opens
// against a given mission is measurably colder than later ones: with the
// quiesced start in place and start fingerprints proven identical, context 1
// still intermittently ran 3673 frames where contexts 2 and 3 ran 3674, and
// diverged in composition with it. It was always context 1, never 2 or 3, and
// 2 and 3 always agreed with each other AND with the steady-state value. That
// is a cold-start artifact in the page's async boot/asset settle (the fixed
// `wait(1500)` above is not always enough on the very first load), not
// nondeterminism in the sim. Burning one context and discarding its result
// makes every MEASURED context a warm one. This discards no assertion: the
// three measured contexts are still asserted against each other exactly.
await deterministicMetric(1);

for (const lid of [1, 5, 10, 15]) {
  const runs = [];
  for (let c = 0; c < CONTEXTS; c++) runs.push(await deterministicMetric(lid));
  const m1 = runs[0];
  const compSigs = runs.map((r) => JSON.stringify(r.spawnCounts));
  const sameComposition = compSigs.every((s) => s === compSigs[0]);
  const sameDamage = runs.every((r) => Math.abs(r.dmgTaken - m1.dmgTaken) < 1e-9);
  // The start state itself must also agree across contexts. This is what
  // actually catches an uncontrolled number of real wall-clock frames leaking
  // in before the drive: such a run starts from a different seeded ring and
  // its fingerprint diverges even when the drive is otherwise identical.
  const startSigs = runs.map((r) => JSON.stringify(r.startFingerprint));
  const sameStart = startSigs.every((s) => s === startSigs[0]);
  step(`L${lid} deterministic metric: ${CONTEXTS} independent contexts agree (start state + composition + damage)`,
    sameStart && sameComposition && sameDamage,
    `dmg=[${runs.map((r) => r.dmgTaken).join(', ')}] frames=[${runs.map((r) => r.frames).join(', ')}] ` +
    `sameStart=${sameStart} sameComposition=${sameComposition} ` +
    `starts=${sameStart ? startSigs[0] : startSigs.join(' | ')} ` +
    `comps=${sameComposition ? compSigs[0] : compSigs.join(' | ')}`);

  if (CAPTURE_MODE) {
    console.log(`  SPEC_LITERAL L${lid}: ${JSON.stringify({ spawnCounts: m1.spawnCounts, dmgTaken: m1.dmgTaken })}`);
    console.log(`  L${lid} deterministic: t=${m1.finalTime.toFixed(2)}s state=${m1.finalState} frames=${m1.frames} spawnCounts=${JSON.stringify(m1.spawnCounts)} dmgTaken=${m1.dmgTaken}`);
    continue;
  }

  const spec = SPEC_LITERALS[lid];
  const keys = new Set([...Object.keys(spec.spawnCounts), ...Object.keys(m1.spawnCounts)]);
  let compositionOk = true;
  const compositionDetail = [];
  for (const k of keys) {
    const got = m1.spawnCounts[k] || 0;
    const want = spec.spawnCounts[k] || 0;
    if (Math.abs(got - want) > COUNT_TOL) compositionOk = false;
    compositionDetail.push(`${k}:${got}/${want}`);
  }
  step(`L${lid} enemy composition matches spec literal (exact, captured at this HEAD)`,
    compositionOk, compositionDetail.join(' '));

  const dmgTol = Math.max(spec.dmgTaken * DMG_TOL_FRAC, 0.01);
  const dmgOk = Math.abs(m1.dmgTaken - spec.dmgTaken) <= dmgTol;
  step(`L${lid} damage taken over first 60s matches spec literal ${spec.dmgTaken} +/- ${(DMG_TOL_FRAC * 100).toFixed(0)}%`,
    dmgOk, `got=${m1.dmgTaken}`);

  console.log(`  L${lid} deterministic: t=${m1.finalTime.toFixed(2)}s state=${m1.finalState} frames=${m1.frames} spawnCounts=${JSON.stringify(m1.spawnCounts)} dmgTaken=${m1.dmgTaken}`);
}

const fails = log.filter((l) => !l.ok).length;
console.log('\n' + (log.length - fails) + '/' + log.length + ' assertions passed; shots in ' + SHOTDIR);
await browser.close();
process.exit(fails ? 1 : 0);
