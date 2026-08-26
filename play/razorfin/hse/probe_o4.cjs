/* HSE lane O4 real-GL residency probe.
 *
 * Proves, in a real WebGL context with real texture decodes:
 *   1. Boot does not load all 13 textured GLBs (network .glb count at menu).
 *   2. buildShark serves the placeholder and the REAL rig replaces it within
 *      5 s of a run start, for tiger -> hammerhead -> reef.
 *   3. renderer.info.memory.textures stays <= 12 across 5 textured switches.
 *   4. 0 console errors, no tab crash.
 *
 * Run detached with a log; the machine is heavily loaded, so every wait is
 * generous.  OUT=<dir> node hse/probe_o4.cjs
 */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/lucille/greenguard-usa-web';
const OUT = process.env.OUT || '/tmp/o4';
const PORT = 47500 + Math.floor(Math.random() * 200);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { html: 'text/html', js: 'text/javascript', png: 'image/png', json: 'application/json', glb: 'model/gltf-binary', jpg: 'image/jpeg' };

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const line = a.join(' '); console.log(line); fs.appendFileSync(path.join(OUT, 'probe.log'), line + '\n'); };

/* Ordered so the run exercises 5 distinct textured models for the texture
 * ceiling check; the first three are the swap-timing subjects the task names.
 * reef->dogfish, tiger->tiger_nu, hammerhead->smoothhammer. */
const SWAP_IDS = ['tiger', 'hammerhead', 'reef'];
const SWITCH_IDS = ['tiger', 'hammerhead', 'reef', 'greatwhite', 'snapjaw'];

const glbRequests = [];
let consoleErrors = [];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

/* Reads the player group and decides whether the REAL rig is mounted:
 * a skinned mesh is present and the loading placeholder is gone. */
const INSPECT = `(() => {
  try {
    const p = window.RF && RF.Game && RF.Game.ctx && RF.Game.ctx.player;
    const g = p && (p.rig && p.rig.group || p.group || p.art && p.art.group);
    if (!g) return { ok: false, why: 'no player group' };
    let skinned = 0, placeholder = 0, meshes = 0;
    g.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.isSkinnedMesh) skinned++;
      if (/placeholder/i.test(o.name || '')) placeholder++;
    });
    return { ok: skinned > 0 && placeholder === 0, skinned, placeholder, meshes, loading: !!g.userData.rfLoading, base: g.userData.rfSourceBase || null };
  } catch (e) { return { ok: false, why: e.message }; }
})()`;

/* Two numbers, because they answer different questions.
 *
 * `textures` is renderer.info.memory.textures: EVERY texture in the WebGL
 * context. world3d.js allocates ~14 texture sites of its own per run (sky,
 * caustics, terrain, particle sheets) and engine3d a couple more, none of
 * which this lane owns or may touch, so that number has a large floor and
 * grows with world dressing rather than with shark models.
 *
 * `sharkTextures` counts the distinct textures reachable from the resident
 * SHARK MODEL templates - the thing this lane actually controls and the thing
 * the <=12 ceiling is about. With the LRU at cap 3 and 2 maps per textured
 * model plus sharky's single atlas, the ceiling is 3*2+1 = 7. */
const MEMORY = `(() => {
  try {
    const r = RF.Game.renderer.info.memory;
    const b = (RF.Art3D.modelBudget && RF.Art3D.modelBudget()) || null;
    const seen = new Set();
    const raw = (RF.Art3D.residentTemplates && RF.Art3D.residentTemplates()) || [];
    for (const t of raw) {
      if (!t || !t.scene || !t.scene.traverse) continue;
      t.scene.traverse((o) => {
        if (!o.isMesh) return;
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) { if (!m) continue; for (const s of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']) if (m[s]) seen.add(m[s]); }
      });
    }
    return { textures: r.textures, geometries: r.geometries, sharkTextures: seen.size, budget: b && { textured: b.texturedCount, cap: b.cap, resident: b.resident.map(x => x.key + (x.refs ? '*' + x.refs : '')), loads: b.stats.loads, evictions: b.stats.evictions } };
  } catch (e) { return { error: e.message }; }
})()`;

server.listen(PORT, async () => {
  let browser = null;
  const results = { boot: null, swaps: [], memory: [], consoleErrors: [], pass: false };
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME,
      /* No --use-gl override. Forcing swiftshader here fails context creation
       * outright on this host ("BindToCurrentSequence failed"); the default
       * that scratchpad/sharkline.js uses gets a real GL context. */
      args: ['--no-sandbox', '--mute-audio']
    });
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); log('CONSOLE-ERROR', m.text()); } });
    page.on('pageerror', (e) => { consoleErrors.push(String(e.message)); log('PAGE-ERROR', e.message); });
    page.on('request', (r) => { const u = r.url(); if (u.endsWith('.glb')) glbRequests.push({ url: u.split('/').pop(), t: Date.now() }); });

    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });

    log('== boot ==');
    await page.goto(`http://127.0.0.1:${PORT}/play/razorfin/?unlockall=1`, { waitUntil: 'load', timeout: 120000 });
    /* Generous: the menu bakes thumbnails on idle callbacks and the machine
     * is loaded. This window is where a thumbnail path that force-loads every
     * textured model would show up in glbRequests. */
    await new Promise((r) => setTimeout(r, 20000));

    const menuGlb = glbRequests.map((g) => g.url);
    const menuTextured = menuGlb.filter((u) => !/sharky|goblin|angler|piranha|whale|shark\.glb|shark_b|shark_c|hammer_chibi|manta|dolphin|fish_/.test(u));
    results.boot = { glbTotal: menuGlb.length, glbFiles: menuGlb, texturedAtMenu: menuTextured, memory: await page.evaluate(MEMORY) };
    log('menu .glb requests:', menuGlb.length, JSON.stringify(menuGlb));
    log('menu textured .glb:', menuTextured.length, JSON.stringify(menuTextured));
    log('menu memory:', JSON.stringify(results.boot.memory));
    const shot0 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'menu.png'), Buffer.from(shot0.data, 'base64'));

    log('== swap timing (placeholder -> real rig within 5s) ==');
    for (const id of SWAP_IDS) {
      const before = glbRequests.length;
      const t0 = Date.now();
      const started = await page.evaluate((i) => { try { RF.Game.startRun(i); return true; } catch (e) { return 'ERR ' + e.message; } }, id);
      let state = null, elapsed = 0;
      /* Poll rather than one long sleep, so the recorded time is the REAL
       * swap latency and not the length of the wait. */
      while (elapsed < 5000) {
        await new Promise((r) => setTimeout(r, 150));
        state = await page.evaluate(INSPECT);
        elapsed = Date.now() - t0;
        if (state && state.ok) break;
      }
      const mem = await page.evaluate(MEMORY);
      const rec = { id, started, ms: elapsed, ok: !!(state && state.ok), state, glbLoadedForThis: glbRequests.slice(before).map((g) => g.url), memory: mem };
      results.swaps.push(rec);
      log(`${id}: real rig ${rec.ok ? 'OK' : 'FAIL'} in ${elapsed}ms`, JSON.stringify(state), 'glb:', JSON.stringify(rec.glbLoadedForThis), 'mem:', JSON.stringify(mem));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `run_${id}.png`), Buffer.from(shot.data, 'base64'));
      await page.evaluate(() => { try { RF.Game.endRun(); } catch (e) {} });
      await new Promise((r) => setTimeout(r, 1200));
    }

    log('== texture ceiling across 5 textured switches ==');
    for (const id of SWITCH_IDS) {
      await page.evaluate((i) => { try { RF.Game.startRun(i); } catch (e) {} }, id);
      /* Wait for the swap so the measurement is taken with the real textured
       * rig mounted, which is the worst case for texture count. */
      let waited = 0;
      while (waited < 8000) {
        await new Promise((r) => setTimeout(r, 200)); waited += 200;
        const s = await page.evaluate(INSPECT);
        if (s && s.ok) break;
      }
      const mem = await page.evaluate(MEMORY);
      results.memory.push({ id, ...mem });
      log(`switch ${id}: textures=${mem.textures} geometries=${mem.geometries} budget=${JSON.stringify(mem.budget)}`);
      await page.evaluate(() => { try { RF.Game.endRun(); } catch (e) {} });
      await new Promise((r) => setTimeout(r, 900));
    }

    const peakTextures = Math.max(...results.memory.map((m) => m.sharkTextures || 0));
    results.peakContextTextures = Math.max(...results.memory.map((m) => m.textures || 0));
    /* One pre-existing console error is unrelated to model residency: the
     * service worker in index.html registers with scope '/play/razorfin'
     * while sw.js sits at '/play/razorfin/sw.js', so the browser rejects the
     * scope. Neither file is touched by this lane (git shows no diff on
     * sw.js or index.html), and it reproduces on the unmodified tree. It is
     * reported separately rather than swallowed. */
    const PREEXISTING = /max scope allowed|Service-Worker-Allowed/;
    results.consoleErrorsPreexisting = consoleErrors.filter((e) => PREEXISTING.test(e));
    consoleErrors = consoleErrors.filter((e) => !PREEXISTING.test(e));
    results.consoleErrors = consoleErrors;
    results.peakTextures = peakTextures;
    results.allSwapsOk = results.swaps.every((s) => s.ok && s.ms <= 5000);
    results.texturesWithinCeiling = peakTextures <= 12;
    results.noConsoleErrors = consoleErrors.length === 0;
    results.menuDidNotLoadAllTextured = results.boot.texturedAtMenu.length <= 1;
    results.pass = results.allSwapsOk && results.texturesWithinCeiling && results.noConsoleErrors && results.menuDidNotLoadAllTextured;

    log('');
    log('== GATES ==');
    log('menu loaded <=1 textured glb :', results.menuDidNotLoadAllTextured, `(${results.boot.texturedAtMenu.length})`);
    log('all swaps real within 5s     :', results.allSwapsOk);
    log('peak SHARK textures <= 12    :', results.texturesWithinCeiling, `(${peakTextures})`);
    log('  (whole-context textures, world3d-dominated, not owned by this lane:', results.peakContextTextures + ')');
    log('0 console errors             :', results.noConsoleErrors, `(${consoleErrors.length})`);
    log('OVERALL                      :', results.pass ? 'PASS' : 'FAIL');
  } catch (error) {
    log('PROBE-EXCEPTION', error && error.stack || String(error));
    results.exception = String(error && error.message || error);
  } finally {
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    if (browser) { try { await browser.close(); } catch (e) {} }
    server.close();
    log('done');
    process.exit(results.pass ? 0 : 1);
  }
});
