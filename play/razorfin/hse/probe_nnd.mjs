// Rev15 lane FISH2: nearest-neighbour-distance probe for prey schooling.
// Runs the REAL game, spawns controlled schools FAR from the player, holds the
// player off, and records one sample per SIM STEP (World.update wrap — the only
// correct clock, see NOTES-rev15-fish.md). Reports the NND distribution in body
// lengths: p5, median, and the count of pairs closer than 0.8 BL.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/Users/lucille/greenguard-usa-web';
const tag = process.argv[2] || 'before';
const STEPS = Number(process.env.STEPS || 420);   // 7 s @ 60 Hz
const dir = path.join(root, 'play/razorfin/hse/evidence/r15-fish2');
fs.mkdirSync(dir, { recursive: true });
const port = Number(process.env.PORT || 47741);
const types = { '.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.json':'application/json','.css':'text/css' };
const server = http.createServer((rq, rs) => {
  let f = decodeURIComponent(rq.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  if (f.endsWith('sw.js')) { rs.writeHead(404); rs.end(); return; }
  fs.readFile(path.join(root, f), (e, d) => { if (e) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); rs.end(d); });
});
await new Promise((r) => server.listen(port, r));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion',
    '--run-all-compositor-stages-before-draw','--disable-new-content-rendering-timeout'] });
const page = await browser.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error('sw off')); } catch (e) {} }
  try { Object.defineProperty(screen, 'orientation', { configurable: true,
      value: { type: 'landscape-primary', angle: 90, addEventListener() {}, removeEventListener() {} } }); } catch (e) {}
});
await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load' });
async function clickDive() {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'DIVE' && x.offsetParent !== null);
    if (b) { b.click(); return true; } return false;
  });
}
for (let i = 0; i < 6; i++) {
  const ok = await clickDive();
  await new Promise(r => setTimeout(r, 1200));
  const running = await page.evaluate(() => { const S = window.RF.World.__state; let n=0; if(S&&S.instancedPrey) for(const b of S.instancedPrey) n+=(b&&b.count)||0; return n; });
  if (running > 0) break;
}
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => {
  const kit = window.RF.Game.kit;
  if (kit) { kit.paused = false; Object.defineProperty(kit, 'paused', { get: () => false, set: () => {}, configurable: true }); }
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
});

// Spawn schools FAR from the player and PIN the player in a corner so the
// calm-school steady state is what gets measured (panic is measured separately
// in the second phase by releasing the pin and warping the player in).
const spawned = await page.evaluate(() => {
  const W = window.RF.World, S = W.__state;
  const pl = (window.RF.Game.ctx && window.RF.Game.ctx.player) || S.player || null;
  // Spawn FIRST, while the player is still where the level put it: spawnBurst
  // gates every point on World.regionAt(player) matching the spawn point's
  // region, so parking the player in a far corner beforehand rejects every
  // candidate and silently spawns nothing (measured: n=0). Spawn near the
  // player's current position, THEN park the player far away so the calm
  // steady state is what gets measured.
  const px = pl ? pl.x : S.w * 0.5, py = pl ? pl.y : S.h * 0.5;
  const sx = px + 700, sy = py - 200;
  const n = W.spawnBurst('minnow', sx, sy, 10);
  const n2 = W.spawnBurst('reeffish', sx + 420, sy + 200, 8);
  // now park the player well beyond the flee radius from both schools
  const parkX = clamp(sx - 3200, 200, S.w - 200), parkY = clamp(sy + 1800, 200, S.h - 200);
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  if (pl) { pl.x = parkX; pl.y = parkY; pl.vx = 0; pl.vy = 0; window.__pl = pl; }
  window.__park = { x: parkX, y: parkY };
  return { n, n2, parkX, parkY, sx, sy, w: S.w, h: S.h };
});
console.log('SPAWN', JSON.stringify(spawned));

await page.evaluate((maxSteps) => {
  const W = window.RF.World, S = W.__state;
  const rec = []; window.__rfRec = rec; window.__panicFrom = -1;
  const orig = W.update;
  W.update = function (ctx) {
    // hold the player parked unless the probe has released it
    if (window.__pl && !window.__release) {
      window.__pl.x = window.__park.x; window.__pl.y = window.__park.y;
      window.__pl.vx = 0; window.__pl.vy = 0;
    }
    const r = orig.apply(this, arguments);
    if (rec.length >= maxSteps) return r;
    // read entities directly: positions in WORLD units, grouped by packId
    const out = [];
    for (const e of S.entities) {
      if (!e.active || e.kind !== 'prey') continue;
      const pid = e.st && e.st.packId;
      if (!pid) continue;
      out.push({ id: e.id, pid, x: e.x, y: e.y, r: e.r, def: e.def && e.def.id });
    }
    rec.push({ n: rec.length, ents: out, release: !!window.__release });
    return r;
  };
}, STEPS);

// phase 1: calm (steps 0..~300). Then release + warp the player into the school
// to exercise the burst-scatter and regroup.
await page.waitForFunction(() => window.__rfRec.length >= 300, { timeout: 90000 }).catch(() => logs.push('WARN calm phase short'));
const shotsCalm = [];
for (let i = 0; i < 3; i++) { shotsCalm.push(await page.screenshot({ encoding: 'base64' })); await new Promise(r => setTimeout(r, 120)); }
await page.evaluate(() => {
  window.__panicFrom = window.__rfRec.length;
  const S = window.RF.World.__state;
  // warp the player next to the first school to trigger panic
  const first = window.__rfRec[window.__rfRec.length - 1].ents[0];
  if (first && window.__pl) { window.__park.x = first.x + 200; window.__park.y = first.y; }
});
await page.waitForFunction((n) => window.__rfRec.length >= n, { timeout: 90000 }, STEPS).catch(() => logs.push('WARN recorder short'));
const rec = await page.evaluate(() => ({ rec: window.__rfRec, panicFrom: window.__panicFrom }));
const info = await page.evaluate(() => { try { const r = window.RF.Engine3D && window.RF.Engine3D.__renderer; return r ? { calls: r.info.render.calls, tris: r.info.render.triangles } : null; } catch(e){ return null; } });

// ---- analysis: NND in body lengths, per sim step, per pack, calm phase only
// after the first 2 s (120 steps) of settle.
function analyze(frames, from, to) {
  const nnds = []; let violations = 0; let pairsChecked = 0; const perStepMin = [];
  for (let i = from; i < to && i < frames.length; i++) {
    const ents = frames[i].ents;
    const byPack = new Map();
    for (const e of ents) { if (!byPack.has(e.pid)) byPack.set(e.pid, []); byPack.get(e.pid).push(e); }
    let stepMin = Infinity;
    for (const [pid, list] of byPack) {
      if (list.length < 2) continue;
      for (let a = 0; a < list.length; a++) {
        let best = Infinity;
        const bl = (list[a].r || 14) * 2;
        for (let b = 0; b < list.length; b++) {
          if (a === b) continue;
          const dx = list[b].x - list[a].x, dy = list[b].y - list[a].y;
          const d = Math.sqrt(dx*dx + dy*dy) / bl;   // body lengths
          if (d < best) best = d;
        }
        if (best < Infinity) { nnds.push(best); pairsChecked++; if (best < 0.8) violations++; if (best < stepMin) stepMin = best; }
      }
    }
    if (stepMin < Infinity) perStepMin.push(stepMin);
  }
  nnds.sort((a,b)=>a-b);
  const q = (p) => nnds.length ? nnds[Math.min(nnds.length-1, Math.floor(p * nnds.length))] : NaN;
  return { n: nnds.length, p5: q(0.05), p25: q(0.25), median: q(0.5), p75: q(0.75), mean: nnds.reduce((s,v)=>s+v,0)/(nnds.length||1),
    min: nnds[0], violations, pairsChecked, worstStepMin: Math.min(...perStepMin) };
}
const frames = rec.rec;
const pf = rec.panicFrom > 0 ? rec.panicFrom : frames.length;
const calm = analyze(frames, 120, pf);           // skip first 2 s of settle
const panic = analyze(frames, pf + 10, frames.length);
const out = { tag, steps: frames.length, panicFrom: pf, info, calm, panic, logs };
fs.writeFileSync(path.join(dir, `nnd-${tag}.json`), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(dir, `frames-nnd-${tag}.json`), JSON.stringify(frames), 'utf8');
shotsCalm.forEach((s,i)=>fs.writeFileSync(path.join(dir, `calm-${tag}-${i}.png`), Buffer.from(s,'base64')));
console.log(JSON.stringify(out, null, 2));
await browser.close(); server.close(); process.exit(0);
