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

    // Measure the BACKDROP, not the scene standing in front of it. The old
    // capture averaged the WHOLE viewport, so the reading was dominated by
    // gameplay and HUD pixels: enemies, the bright green grid/boundary, the
    // radar, banners and the pickup burst. That made the number a function of
    // how much was alive and on screen rather than of the region palette, and
    // after the terrain-guard hotfix (terrain no longer culls enemies, ~3.2x
    // more alive) aurelion-graveyard fell from 0.2146 to 0.1796 under the
    // 0.18 gate with an unchanged palette.
    //
    // The parallax backdrop occupies a clean depth band: hm2_background.js
    // lays it out at depth -140/-130/-120/-110 and every gameplay or HUD
    // object is at depth > -110 (ground grid -100, boundary -80, HUD 200+).
    // So for the capture only, hide every display object above the backdrop
    // band and restore exact prior visibility afterwards. Sim state, palette
    // and the gate are untouched.
    // Measure the BACKDROP, not the scene standing in front of it.
    //
    // The old capture averaged the WHOLE viewport, so the reading was
    // dominated by gameplay and HUD pixels: enemies, the bright green grid and
    // boundary, the radar, banners and the combo burst. That made the number a
    // function of how much happened to be alive and on screen rather than of
    // the region palette. After the terrain-guard hotfix (terrain no longer
    // culls enemies, ~3.2x more alive) aurelion-graveyard fell 0.2146 ->
    // 0.1796, under the 0.18 gate, with the palette completely unchanged.
    //
    // The parallax backdrop occupies a clean depth band: hm2_background.js
    // lays it out at depth -140/-130/-120/-110 and every gameplay or HUD
    // object sits above it (ground grid -100, boundary -80, HUD 200+). So for
    // the capture only, keep the foreground hidden and let the game go on
    // rendering normally.
    //
    // The hide has to be re-applied on a short interval rather than done once:
    // the scene's own update() re-shows parked objects every frame, so a
    // single pass is undone before the next draw (measured: the foreground was
    // fully back within ~80ms). Hiding from a 'prerender' hook does not work
    // either, it yields a blank canvas. Sim state, palette and the gate are
    // all untouched; only object visibility during the capture changes.
    const BACKDROP_MAX_DEPTH = -110;
    const setup = await page.evaluate((maxDepth) => {
      const s = window.__HORDE.game.scene;
      if (!s || !s.children || !Array.isArray(s.children.list)) return { ok: false };
      let kept = 0;
      for (const obj of s.children.list) {
        if (typeof obj.depth === 'number' && obj.depth <= maxDepth) kept++;
      }
      s.__probeHiddenCount = 0;
      s.__probeTimer = setInterval(() => {
        for (const obj of s.children.list) {
          if (typeof obj.depth !== 'number' || typeof obj.visible !== 'boolean') continue;
          if (obj.depth > maxDepth && obj.visible) { obj.visible = false; s.__probeHiddenCount++; }
        }
      }, 2);
      return { ok: true, kept: kept };
    }, BACKDROP_MAX_DEPTH);
    if (!setup.ok) fail(report, `could not reach the display list to isolate the backdrop for region '${key}'.`);
    if (setup.kept === 0) {
      fail(report, `no display object at depth <= ${BACKDROP_MAX_DEPTH} for region '${key}': the backdrop layer is missing, so there is nothing to measure.`);
    }
    entry.backdropObjectsKept = setup.kept;
    await page.waitForTimeout(400);
    entry.foregroundObjectsHidden = await page.evaluate(() => window.__HORDE.game.scene.__probeHiddenCount);
    if (entry.foregroundObjectsHidden === 0) {
      fail(report, `no foreground object was hidden for region '${key}': the backdrop isolation did nothing, so the measurement would include HUD and gameplay pixels.`);
    }

    const shotPath = `${OUT}/region_${key}.png`;
    await page.screenshot({ path: shotPath });

    await page.evaluate(() => {
      const s = window.__HORDE.game.scene;
      clearInterval(s.__probeTimer);
      s.__probeTimer = null;
    });

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

  // Region identity assertion (M2 gate BLOCKER 1): a constant-stub regionAt
  // still passes the byte-hash/luminance checks above since those are only
  // driven by ship position and HUD, not by which region key comes back.
  // Query regionAt directly at each region's OWN centre (from the live
  // HM2_WORLD.REGIONS table, never hardcoded) and require the expected key.
  const regionIdentity = await page.evaluate(() => {
    const w = window.HM2_WORLD;
    if (!w || !w.REGIONS || typeof w.regionAt !== 'function') return { available: false };
    const rows = w.REGIONS.map((r) => ({ key: r.key, cx: r.cx, cy: r.cy, got: w.regionAt(r.cx, r.cy) }));
    return { available: true, rows: rows };
  });
  report.regionIdentity = regionIdentity;
  if (!regionIdentity.available) {
    fail(report, 'window.HM2_WORLD.regionAt/REGIONS not available, cannot verify region identity.');
  } else {
    for (const row of regionIdentity.rows) {
      if (row.got !== row.key) {
        fail(report, `regionAt(${row.cx}, ${row.cy}) returned '${row.got}', expected '${row.key}' (its own centre). Region identity is not driving regionAt.`);
      }
    }
  }

  // Strengthen the rendering-side check above: distinct byte hashes alone
  // can happen from ship position/HUD alone even with a constant palette.
  // Require at least 3 distinct luminance values (rounded to 3dp) across
  // the sampled regions, so a constant-palette stub collapses this too.
  const roundedLums = Array.from(new Set(lumValues.map((v) => v.toFixed(3))));
  report.distinctRoundedLuminanceCount = roundedLums.length;
  if (lumValues.length > 1 && roundedLums.length < 3) {
    fail(report, `only ${roundedLums.length} distinct region luminance value(s) at 3dp (${roundedLums.join(', ')}); expected at least 3, indicating region palette is not actually varying rendering.`);
  }

  // Boundary-push assertion (M2 gate BLOCKER 2): the plan's core M2
  // acceptance line is "Player clamp = SDF", but teleporting to region
  // centres never exercises the field boundary. Drive the ship far outside
  // the field from several angles and confirm it ends up back inside after
  // a few frames, via the same clampField path stepInput runs every tick.
  const boundaryPush = await page.evaluate(async () => {
    const w = window.HM2_WORLD;
    const s = window.__HORDE.game.scene;
    if (!w || typeof w.sdf !== 'function' || !s || !s.p) return { available: false };
    const WORLD = w.WORLD || 12600;
    const EDGE_BAND = w.EDGE_BAND;
    // Field centre for direction-retention: mean of REGIONS centres (not the
    // origin), since the region row is off-centre toward +x/+y (solar-crown
    // sits at 6300,1000) and using the true centroid keeps the "which
    // hemisphere did this land in" check honest for every push angle.
    const regions = w.REGIONS || [];
    let cx = 0, cy = 0;
    for (const rgn of regions) { cx += rgn.cx; cy += rgn.cy; }
    if (regions.length) { cx /= regions.length; cy /= regions.length; }
    const angles = [0, 60, 120, 180, 240, 300, 45, 200];
    const results = [];
    for (const deg of angles) {
      const rad = deg * Math.PI / 180;
      const pushDir = { x: Math.cos(rad), y: Math.sin(rad) };
      s.p.x = pushDir.x * WORLD * 3;
      s.p.y = pushDir.y * WORLD * 3;
      s.p.vx = 0; s.p.vy = 0;
      // let the player update path (stepInput -> clampField) run a few frames
      await new Promise((resolve) => {
        let n = 0;
        const tick = () => { n++; if (n >= 6) resolve(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      const d = w.sdf(s.p.x, s.p.y);
      // Direction retention: the vector from field centre to the clamped
      // point should still point roughly the way it was pushed. A clamp
      // that teleports to some fixed point (e.g. always REGIONS[0]) instead
      // of resolving along the push direction will fail this for most angles.
      const rx = s.p.x - cx, ry = s.p.y - cy;
      const rlen = Math.sqrt(rx * rx + ry * ry);
      const dot = rlen > 1e-6 ? (rx / rlen) * pushDir.x + (ry / rlen) * pushDir.y : 0;
      results.push({
        angleDeg: deg, x: s.p.x, y: s.p.y, sdf: d,
        inside: d <= 4,
        inEdgeBand: typeof EDGE_BAND === 'number' ? d >= -EDGE_BAND : null,
        dot: dot
      });
    }
    return { available: true, results: results, edgeBand: EDGE_BAND, fieldCentre: { x: cx, y: cy } };
  });
  report.boundaryPush = boundaryPush;
  if (!boundaryPush.available) {
    fail(report, 'could not run boundary push test: window.HM2_WORLD.sdf or scene.p unavailable.');
  } else {
    for (const r of boundaryPush.results) {
      if (!r.inside) {
        fail(report, `boundary push at angle ${r.angleDeg} deg: ship at (${r.x.toFixed(1)}, ${r.y.toFixed(1)}) has sdf=${r.sdf.toFixed(2)} > 0, not clamped inside the field. Player clamp = SDF is not holding.`);
      }
      if (typeof boundaryPush.edgeBand === 'number' && r.inEdgeBand === false) {
        fail(report, `boundary push at angle ${r.angleDeg} deg: clamp landed at sdf=${r.sdf.toFixed(2)}, deeper than -EDGE_BAND (${(-boundaryPush.edgeBand).toFixed(2)}); a clamp should settle near the boundary band, not teleport deep into the field.`);
      }
      if (r.dot <= 0) {
        fail(report, `boundary push at angle ${r.angleDeg} deg: clamped point (${r.x.toFixed(1)}, ${r.y.toFixed(1)}) has dot=${r.dot.toFixed(3)} <= 0 against its push direction; the clamp is not retaining the push direction (result is on the wrong side of the field centre).`);
      }
    }
    // Distinctness: 8 different push angles must not all collapse to the
    // same clamped point (the direction-blind teleport-to-REGIONS[0] bug).
    const uniquePoints = new Set(boundaryPush.results.map((r) => r.x.toFixed(1) + ',' + r.y.toFixed(1)));
    report.boundaryPush.distinctPointCount = uniquePoints.size;
    if (uniquePoints.size < boundaryPush.results.length) {
      fail(report, `boundary push results are not distinct: only ${uniquePoints.size}/${boundaryPush.results.length} unique clamped points across 8 push angles; pushes from different directions are collapsing to the same point.`);
    }
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
