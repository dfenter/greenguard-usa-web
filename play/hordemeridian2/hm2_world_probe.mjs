// hm2_world_probe.mjs - M2 probe for HM2 parallax background + world SDF.
// Usage: node hm2_world_probe.mjs [port] [outdir]
//
// Drives the play scene, teleports to each real region (read live from the
// game's REGION_BY_KEY, never hardcoded), screenshots each region, samples
// real backdrop pixel luminance, and checks it against enemy/projectile tint
// luminance per reference_track_readability (delta >= 0.18). Also checks the
// ?perf fps watchdog floor. Fails loudly (exit 1) on any violation, including
// structural failures a naive probe could fake a pass on: wrong region keys,
// an unchecked teleport return value, or measuring the "rotate your device"
// overlay instead of the game.
import pw from '/Users/lucille/greenguard-usa-web/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs';
import crypto from 'crypto';

const PORT = process.argv[2] || '8791';
const OUT = process.argv[3] || '/tmp/hm2_world_probe';
const W = 390, H = 844;
const FPS_FLOOR = 50;
const LUM_DELTA_GATE = 0.18;
fs.mkdirSync(OUT, { recursive: true });
const URL = `http://localhost:${PORT}/play/hordemeridian2/index.html`;

function luminance(r, g, b) {
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

function hexToRgb(hex) {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function samplePngAverage(page, path) {
  // Read back the screenshot via a canvas in-page: load the just-taken
  // screenshot bytes as a data URL and average sampled pixels. This is the
  // real pixel path, not a value read from game state.
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

function fail(report, msg) {
  report.failures.push(msg);
  console.error('FAIL: ' + msg);
}

async function main() {
  const report = {
    viewport: `${W}x${H}`,
    regions: {},
    fps: null,
    console: [],
    failures: [],
    screenshotHashes: {},
    summary: ''
  };

  const consoleMsgs = [];
  const consoleErrorsOnly = [];
  const browser = await chromium.launch();

  // Viewport must be set BEFORE boot (context creation happens before
  // page.goto), and we force the orientation-detection APIs the game's
  // rotate-overlay logic reads (screen.orientation.type / matchMedia) to
  // agree with the portrait viewport BEFORE any script runs. Headless
  // Chromium does not reliably report screen.orientation as portrait just
  // because the viewport is tall, which is what let the old probe measure
  // the rotate overlay instead of the game.
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window.screen, 'orientation', {
        configurable: true,
        get() { return { type: 'portrait-primary', angle: 0 }; }
      });
    } catch (e) {}
    const origMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
    window.matchMedia = function (q) {
      if (typeof q === 'string' && q.indexOf('orientation: portrait') >= 0) {
        return { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
      }
      return origMatchMedia ? origMatchMedia(q) : { matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
    };
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text());
    if (m.type() === 'error') consoleErrorsOnly.push('error: ' + m.text());
  });
  page.on('pageerror', (e) => { consoleMsgs.push('pageerror: ' + e.message); consoleErrorsOnly.push('pageerror: ' + e.message); });

  let loaded = true;
  try {
    await page.goto(URL + '?perf', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__HORDE_READY === true, null, { timeout: 20000 });
  } catch (e) {
    loaded = false;
    consoleMsgs.push('loaderror: ' + e.message);
  }

  if (!loaded) {
    report.summary = 'FAIL: page failed to load / __HORDE_READY never became true.';
    report.failures.push(report.summary);
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    console.log(report.summary);
    await browser.close();
    process.exit(1);
  }

  // Start the play scene directly (this is the same run-start path the
  // campaign probe and hotstart gate use: scene reaches state 'playing'
  // synchronously in PlayScene.create, no title-screen tap required).
  try {
    await page.evaluate(() => {
      const g = window.__HORDE.game.phaser;
      g.scene.scenes.forEach((s) => { if (s.scene.key !== 'boot' && s.scene.isActive()) g.scene.stop(s.scene.key); });
      g.scene.start('play');
    });
    await page.waitForFunction(() => {
      const s = window.__HORDE.game.scene;
      return !!(s && s.state === 'playing' && s.p);
    }, null, { timeout: 15000 });
  } catch (e) {
    fail(report, 'could not reach playing state: ' + e.message);
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }

  // Give the rotate-overlay's debounce (600ms in ggkit.js) time to settle,
  // then hard-assert the overlay text is not present anywhere in the DOM.
  await page.waitForTimeout(900);
  const overlayText = await page.evaluate(() => document.body.innerText || '');
  if (/rotate your device/i.test(overlayText)) {
    fail(report, 'orientation overlay ("Rotate your device...") is visible after boot; portrait emulation did not defeat it.');
  }
  const gamePaused = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.kit && window.__HORDE.kit.paused));
  if (gamePaused) {
    fail(report, 'window.__HORDE.kit.paused is true after boot (rotate overlay or another pause reason is active).');
  }

  const hasDebug = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug));
  const hasTeleport = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug && typeof window.__HORDE.debug.teleportToRegion === 'function'));
  const hasEnemyTints = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug && typeof window.__HORDE.debug.getEnemyTints === 'function'));
  const hasProjTints = await page.evaluate(() => !!(window.__HORDE && window.__HORDE.debug && typeof window.__HORDE.debug.getProjectileTints === 'function'));

  if (!hasDebug) fail(report, 'window.__HORDE.debug is missing entirely.');
  if (!hasTeleport) fail(report, 'window.__HORDE.debug.teleportToRegion(key) is missing.');
  if (!hasEnemyTints) fail(report, 'window.__HORDE.debug.getEnemyTints() is missing.');
  if (!hasProjTints) fail(report, 'window.__HORDE.debug.getProjectileTints() is missing.');

  if (report.failures.length) {
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    console.log('FAIL: required debug hooks missing, cannot proceed.');
    await browser.close();
    process.exit(1);
  }

  // Region keys come from the live game (window.__HM_DATA.REGION_BY_KEY,
  // the same table game.js aliases as REGION_BY_KEY), never a hardcoded
  // list, so this probe cannot drift from hm_data.js again.
  const realRegionKeys = await page.evaluate(() => {
    if (window.__HM_DATA && window.__HM_DATA.REGION_BY_KEY) return Object.keys(window.__HM_DATA.REGION_BY_KEY);
    return [];
  });
  if (!realRegionKeys.length) {
    fail(report, 'could not read real region keys from window.__HM_DATA.REGION_BY_KEY. Cannot enumerate regions without hardcoding, refusing to guess.');
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }
  report.regionKeys = realRegionKeys;

  const enemyTints = await page.evaluate(() => window.__HORDE.debug.getEnemyTints());
  const projTints = await page.evaluate(() => window.__HORDE.debug.getProjectileTints());
  if (!enemyTints.length) fail(report, 'getEnemyTints() returned empty.');
  if (!projTints.length) fail(report, 'getProjectileTints() returned empty.');

  const tintList = enemyTints.map((t) => (typeof t === 'object' ? t.tint : t))
    .concat(projTints.map((t) => (typeof t === 'object' ? t.tint : t)));
  const darkestTintLum = Math.min.apply(null, tintList.map((t) => { const c = hexToRgb(t); return luminance(c.r, c.g, c.b); }));
  report.darkestTintLuminance = darkestTintLum;
  report.enemyTints = enemyTints;
  report.projectileTints = projTints;

  const shotHashes = {};
  for (const key of realRegionKeys) {
    const entry = { key: key, teleported: false, luminance: null, delta: null, pass: null, note: '' };

    const teleportOk = await page.evaluate((k) => window.__HORDE.debug.teleportToRegion(k), key);
    entry.teleported = teleportOk === true;
    if (!entry.teleported) {
      fail(report, `teleportToRegion('${key}') returned ${JSON.stringify(teleportOk)}, expected true.`);
    }
    await page.waitForTimeout(700);
    // Let transient presentation VFX (pickup/level-up banners, airstrike
    // telegraphs) clear so the screenshot measures the actual backdrop, not
    // a HUD toast or spawn-ring effect. Poll up to ~2.5s; proceed regardless
    // so a stuck banner shows up as a low delta rather than hanging forever.
    await page.waitForFunction(() => {
      const s = window.__HORDE.game.scene;
      return !!(s && !s.bannerActive && (!s.airStrike || !s.airStrike.active));
    }, null, { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(150);

    // Re-check the game is still actually playing (not paused/overlayed)
    // right before we measure, in case the teleport itself broke state.
    const stillPlaying = await page.evaluate(() => {
      const s = window.__HORDE.game.scene;
      return !!(s && s.state === 'playing');
    });
    if (!stillPlaying) fail(report, `scene left 'playing' state after teleporting to '${key}'.`);
    const overlayNow = await page.evaluate(() => (document.body.innerText || ''));
    if (/rotate your device/i.test(overlayNow)) {
      fail(report, `orientation overlay visible while measuring region '${key}'.`);
    }

    const shotPath = `${OUT}/region_${key}.png`;
    await page.screenshot({ path: shotPath });
    const hash = sha256(fs.readFileSync(shotPath));
    shotHashes[key] = hash;
    entry.screenshotHash = hash;

    const avg = await samplePngAverage(page, shotPath);
    if (avg) {
      const lum = luminance(avg.r, avg.g, avg.b);
      entry.luminance = lum;
      entry.delta = darkestTintLum - lum;
      entry.pass = entry.delta >= LUM_DELTA_GATE;
      if (!entry.pass) fail(report, `region '${key}' luminance delta ${entry.delta.toFixed(4)} < gate ${LUM_DELTA_GATE}.`);
    } else {
      entry.note = 'pixel sample failed';
      fail(report, `pixel sampling failed for region '${key}'.`);
    }
    report.regions[key] = entry;
  }
  report.screenshotHashes = shotHashes;

  // Screenshots must not be byte-identical across regions: that was exactly
  // the tell that the old probe was measuring a static overlay six times.
  const keys = Object.keys(shotHashes);
  const dupPairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (shotHashes[keys[i]] === shotHashes[keys[j]]) dupPairs.push([keys[i], keys[j]]);
    }
  }
  report.duplicateScreenshotPairs = dupPairs;
  if (dupPairs.length) {
    fail(report, 'byte-identical region screenshots found: ' + dupPairs.map((p) => p.join('==')).join(', '));
  }
  const lumValues = Object.values(report.regions).map((r) => r.luminance).filter((v) => v != null);
  const uniqueLumValues = new Set(lumValues.map((v) => v.toFixed(6)));
  if (lumValues.length > 1 && uniqueLumValues.size === 1) {
    fail(report, 'all region luminance measurements are identical, this indicates the probe is not actually sampling per-region pixels (investigate the probe, not the game).');
  }

  // fps watchdog under ?perf. Mobile profile floor is 50 fps.
  await page.waitForTimeout(1200);
  const fpsInfo = await page.evaluate(() => {
    try {
      const state = window.__HM_DEBUG_STATE || (window.__HORDE && window.__HORDE.game && window.__HORDE.game.debugState);
      if (state && state.watchdog) return { available: true, watchdog: state.watchdog };
      return { available: false };
    } catch (e) { return { available: false, error: String(e) }; }
  });
  if (!fpsInfo.available) {
    fail(report, 'fps watchdog state (window.__HM_DEBUG_STATE.watchdog) is not available under ?perf.');
  } else {
    report.fps = fpsInfo.watchdog;
    const maxStepMs = fpsInfo.watchdog.maxStepMs || 0;
    const estFps = maxStepMs > 0 ? 1000 / maxStepMs : null;
    report.estimatedFps = estFps;
    if (estFps == null) {
      fail(report, 'fps watchdog maxStepMs is 0/unavailable, cannot assert fps floor.');
    } else if (estFps < FPS_FLOOR) {
      fail(report, `fps floor violated: estimated ${estFps.toFixed(1)} fps < floor ${FPS_FLOOR} (maxStepMs=${maxStepMs.toFixed(2)}).`);
    }
  }

  // Gate on real console ERRORS only (type 'error' + pageerror), matching the
  // M4a campaign probe's convention. __MISSING atlas warnings and GPU/WebGL
  // performance warnings from headless rendering are warnings, not errors,
  // and are reported separately below for visibility without failing the gate.
  // The service worker scope error is a known pre-existing error and excluded.
  const newConsoleErrors = consoleErrorsOnly.filter((m) => !(/service worker/i.test(m) && /scope/i.test(m)));
  report.console = consoleMsgs;
  report.newConsoleErrors = newConsoleErrors;
  const missingAtlasWarnings = Array.from(new Set(
    consoleMsgs.filter((m) => /__MISSING/.test(m))
      .map((m) => (m.match(/__MISSING (\S+)/) || [null, m])[1])
  ));
  report.missingAtlasWarningKeys = missingAtlasWarnings;
  if (newConsoleErrors.length) {
    fail(report, 'new console errors: ' + newConsoleErrors.join(' | '));
  }

  await browser.close();

  const exitCode = report.failures.length ? 1 : 0;
  report.summary = exitCode
    ? `FAIL: ${report.failures.length} failure(s). See failures[].`
    : 'PASS: all regions, screenshots, luminance deltas, and fps floor within gate.';

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(report.summary);
  console.log(JSON.stringify(report, null, 2));
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('PROBE CRASH:', e);
  process.exit(1);
});
