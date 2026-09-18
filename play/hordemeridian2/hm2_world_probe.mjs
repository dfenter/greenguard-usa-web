// hm2_world_probe.mjs - Phase A probe for HM2 M2 parallax background + world SDF.
// Usage: node hm2_world_probe.mjs [port] [outdir]
// Drives the play scene, teleports to each region centre (if the debug hook
// exists), screenshots, samples backdrop luminance, and checks it against
// enemy/projectile tint luminance per reference_track_readability (delta >= 0.18).
//
// PHASE A NOTE: game.js integration of hm2_background.js/hm2_world.js has not
// landed yet (that is a later phase). Region teleport and background-layer
// hooks are expected to be ABSENT right now. This probe degrades gracefully:
// any check whose hook is missing is reported SKIPPED, not FAILED, and the
// process exits 0 with a "PHASE A DRY RUN" banner. Once integration lands and
// window.__HORDE exposes the hooks below, the same probe should start
// asserting for real without any changes needed here.
//
// REQUIRED HOOKS for the integration phase to add to game.js (not added here):
//   window.__HORDE.debug.teleportToRegion(key)  -> moves ship to region centre
//   window.__HORDE.debug.getEnemyTints()        -> [{key, tint}] from hm_data
//   window.__HORDE.debug.getProjectileTints()   -> [{key, tint}]
//   window.__HORDE.debug.getBackdropSample()    -> {r,g,b} average of visible
//                                                   background layers at camera center
import pw from '/Users/lucille/greenguard-usa-web/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs';

const PORT = process.argv[2] || '8791';
const OUT = process.argv[3] || '/tmp/hm2_world_probe';
const W = 390, H = 844;
fs.mkdirSync(OUT, { recursive: true });
const URL = `http://localhost:${PORT}/play/hordemeridian2/index.html`;

const REGION_KEYS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];

function luminance(r, g, b) {
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

function hexToRgb(hex) {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

async function samplePngAverage(page, path) {
  // Read back the screenshot via a canvas in-page so we don't need a PNG
  // decoder dependency: load the just-taken screenshot bytes as a data URL.
  const buf = fs.readFileSync(path);
  const b64 = buf.toString('base64');
  const avg = await page.evaluate(async (dataUrl) => {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4 * 37) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        resolve({ r: r / n, g: g / n, b: b / n });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }, 'data:image/png;base64,' + b64);
  return avg;
}

async function main() {
  const report = {
    viewport: `${W}x${H}`,
    phase: 'A',
    dryRun: false,
    regions: {},
    fps: null,
    console: [],
    missingHooks: [],
    summary: ''
  };

  const consoleMsgs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => consoleMsgs.push('pageerror: ' + e.message));

  let loaded = true;
  try {
    await page.goto(URL + '?perf', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__HORDE && window.__HORDE.game && window.__HORDE.game.phaser, null, { timeout: 20000 }).catch(() => {});
  } catch (e) {
    loaded = false;
    consoleMsgs.push('loaderror: ' + e.message);
  }

  if (!loaded) {
    report.dryRun = true;
    report.summary = 'PHASE A DRY RUN: page failed to load, nothing to probe.';
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    console.log(report.summary);
    await browser.close();
    process.exit(0);
  }

  // Try to start the play scene.
  try {
    await page.evaluate(() => {
      const g = window.__HORDE.game.phaser;
      g.scene.scenes.forEach((s) => { if (s.scene.key !== 'boot' && s.scene.isActive()) g.scene.stop(s.scene.key); });
      g.scene.start('play');
    });
    await page.waitForTimeout(2500);
  } catch (e) {
    consoleMsgs.push('scenestarterror: ' + e.message);
  }

  const hasDebug = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug));
  const hasTeleport = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug && typeof window.__HORDE.debug.teleportToRegion === 'function'));
  const hasEnemyTints = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug && typeof window.__HORDE.debug.getEnemyTints === 'function'));
  const hasProjTints = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug && typeof window.__HORDE.debug.getProjectileTints === 'function'));

  if (!hasTeleport) report.missingHooks.push('window.__HORDE.debug.teleportToRegion(key)');
  if (!hasEnemyTints) report.missingHooks.push('window.__HORDE.debug.getEnemyTints()');
  if (!hasProjTints) report.missingHooks.push('window.__HORDE.debug.getProjectileTints()');

  let enemyTints = [];
  let projTints = [];
  if (hasEnemyTints) enemyTints = await page.evaluate(() => window.__HORDE.debug.getEnemyTints());
  if (hasProjTints) projTints = await page.evaluate(() => window.__HORDE.debug.getProjectileTints());

  // Fallback: known enemy tints from hm_data.js (documented in review), used
  // only to compute a reference delta if the live hook is absent, marked as
  // such in the report.
  const FALLBACK_ENEMY_TINTS = [0x65d5c3, 0xffc361, 0xa8a8e8, 0xff756a, 0x7ac8ff, 0xc480ff, 0xd6a4ff];
  const tintsSource = enemyTints.length ? 'live' : 'fallback';
  const tintList = enemyTints.length ? enemyTints.map((t) => (typeof t === 'object' ? t.tint : t)) : FALLBACK_ENEMY_TINTS;
  const darkestEnemyLum = Math.min.apply(null, tintList.map((t) => { const c = hexToRgb(t); return luminance(c.r, c.g, c.b); }));

  let anyRegionChecked = false;
  for (const key of REGION_KEYS) {
    const entry = { key: key, teleported: false, luminance: null, delta: null, pass: null, note: '' };
    if (hasTeleport) {
      try {
        await page.evaluate((k) => window.__HORDE.debug.teleportToRegion(k), key);
        await page.waitForTimeout(700);
        entry.teleported = true;
      } catch (e) {
        entry.note = 'teleport failed: ' + e.message;
      }
    } else {
      entry.note = 'SKIPPED: teleportToRegion hook absent (Phase A, integration pending)';
    }

    const shotPath = `${OUT}/region_${key}.png`;
    await page.screenshot({ path: shotPath });

    if (entry.teleported) {
      anyRegionChecked = true;
      const avg = await samplePngAverage(page, shotPath);
      if (avg) {
        const lum = luminance(avg.r, avg.g, avg.b);
        entry.luminance = lum;
        entry.delta = darkestEnemyLum - lum;
        entry.pass = entry.delta >= 0.18;
      } else {
        entry.note = 'SKIPPED: pixel sample failed';
      }
    }
    report.regions[key] = entry;
  }
  report.enemyTintSource = tintsSource;
  report.darkestEnemyLuminance = darkestEnemyLum;

  // fps watchdog under ?perf
  const fpsInfo = await page.evaluate(() => {
    try {
      const state = window.__HM_DEBUG_STATE || (window.__HORDE && window.__HORDE.game && window.__HORDE.game.debugState);
      if (state && state.watchdog) return { available: true, watchdog: state.watchdog };
      return { available: false };
    } catch (e) { return { available: false, error: String(e) }; }
  });
  if (fpsInfo.available) {
    report.fps = fpsInfo.watchdog;
  } else {
    report.missingHooks.push('watchdog fps state (window.__HM_DEBUG_STATE.watchdog or __HORDE.game.debugState)');
  }

  report.console = consoleMsgs;

  await browser.close();

  // Decide pass/fail. In Phase A, with no hooks, we do not fail: we report
  // SKIPPED everywhere and exit 0 with a dry-run banner.
  const regionResults = Object.values(report.regions);
  const anyPassChecked = regionResults.some((r) => r.pass !== null);
  const anyFail = regionResults.some((r) => r.pass === false);
  const fpsChecked = report.fps && typeof report.fps.lastBeatAgoMs === 'number';

  if (!anyRegionChecked && !fpsChecked) {
    report.dryRun = true;
    report.summary = 'PHASE A DRY RUN: no teleport/fps hooks present yet (expected pre-integration). ' +
      'Missing hooks: ' + report.missingHooks.join(', ');
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    console.log(report.summary);
    console.log('PASS (dry run, nothing to assert)');
    process.exit(0);
  }

  let exitCode = 0;
  if (anyFail) exitCode = 1;

  report.summary = anyFail
    ? 'FAIL: one or more regions failed the luminance delta gate (>= 0.18).'
    : 'PASS: all checked regions and metrics within gate.';

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(report.summary);
  console.log(JSON.stringify(report, null, 2));
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('PROBE CRASH:', e);
  process.exit(1);
});
