// Rev15 lane FISH: frame-sequence probe. Runs the REAL game (?unlockall=1),
// samples every live prey instance's matrix + bend phase/amp for N frames,
// and dumps metrics + a 12-frame strip.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/Users/lucille/greenguard-usa-web';
const tag = process.argv[2] || 'before';
const FRAMES = Number(process.env.FRAMES || 90);   // 3 s @ 30 fps
const dir = path.join(root, 'play/razorfin/hse/evidence/r15-fish');
fs.mkdirSync(dir, { recursive: true });
const port = Number(process.env.PORT || 47733);
const types = { '.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.json':'application/json','.css':'text/css' };
const server = http.createServer((rq, rs) => {
  let f = decodeURIComponent(rq.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  if (f.endsWith('sw.js')) { rs.writeHead(404); rs.end(); return; }   // bypass service worker
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
page.on('console', (m) => { const t = m.text(); if (/error|shader|GLSL|undeclared/i.test(t)) logs.push(m.type()+' '+t); });
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error('sw off')); } catch (e) {} }
  // ggkit's rotate gate reads screen.orientation.type; headless mobile
  // emulation reports portrait-primary even for a landscape viewport.
  try {
    Object.defineProperty(screen, 'orientation', { configurable: true,
      value: { type: 'landscape-primary', angle: 90, addEventListener() {}, removeEventListener() {} } });
  } catch (e) {}
});
await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load' });

// Menu -> DIVE -> Level Select -> DIVE -> run. Click the real buttons.
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

// Spawn a controlled school right next to the player so the probe always has
// a school to measure (the ambient spawner needs a long live run to seed one).
// Headless tabs read as hidden/blurred; ggkit pauses the sim. Force it live.
await page.evaluate(() => {
  const kit = window.RF.Game.kit;
  window.__kitFound = !!kit;
  if (kit) { kit.paused = false; Object.defineProperty(kit, 'paused', { get: () => false, set: () => {}, configurable: true }); }
  window.__diag = { paused: kit && kit.paused, ctx: !!window.RF.Game.ctx };
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
});
const spawned = await page.evaluate(() => {
  const W = window.RF.World, S = W.__state;
  const pl = (window.RF.ctx && window.RF.ctx.player) || S.player || null;
  const px = pl ? pl.x : S.w * 0.5, py = pl ? pl.y : S.h * 0.5;
  // Keep the school inside the camera frustum for the evidence strips: the
  // view is ~844 CSS px wide but the sim is world-scale, so a +-320 offset
  // put the school off-shot. Spawn tight and slightly ahead of the player.
  const n = W.spawnBurst('minnow', px + 140, py - 20, 10);
  const n2 = W.spawnBurst('reeffish', px + 60, py + 50, 8);
  return { n, n2, px, py };
});
await new Promise(r => setTimeout(r, 1200));

// wait for the world to have live prey instances
await page.waitForFunction(() => {
  const W = window.RF && window.RF.World, S = W && W.__state;
  if (!S || !S.instancedPrey) return false;
  let n = 0; for (const b of S.instancedPrey) n += (b && b.count) || 0;
  return n >= 6;
}, { timeout: 60000 }).catch(() => logs.push('WARN: no prey instances appeared'));

const sampler = () => {
  const W = window.RF.World, S = W.__state;
  const out = [];
  for (const b of S.instancedPrey) {
    if (!b || !b.count) continue;
    const arr = b.mesh.instanceMatrix.array;
    for (let s = 0; s < b.count; s++) {
      const e = b.slotEntities && b.slotEntities[s];
      const o = s * 16;
      out.push({
        def: b.def && b.def.id, slot: s,
        // column-major mat4: translation = [12,13,14]; basis X col = [0,1,2]
        px: arr[o+12], py: arr[o+13], pz: arr[o+14],
        bx: arr[o+0], by: arr[o+1], bz: arr[o+2],
        ux: arr[o+4], uy: arr[o+5], uz: arr[o+6],
        phase: b.phase.getX(s), amp: b.amp.getX(s),
        vx: e ? e.vx : 0, vy: e ? e.vy : 0,
        faceA: e && e.st ? e.st.faceA : null,
        angle: e ? e.angle : null,
        packId: e && e.st ? e.st.packId : null,
        r: e ? e.r : 0,
      });
    }
  }
  return { t: performance.now(), inst: out,
    draws: window.__rfDraws || null,
    info: (function(){ try { const r = S.renderer || (window.RF.Engine3D && window.RF.Engine3D.__renderer); return r ? { calls: r.info.render.calls, tris: r.info.render.triangles } : null; } catch(e){ return null; } })() };
};

// Record ONE sample per SIM STEP by wrapping World.update. Polling from
// outside via page.evaluate/rAF samples every ~130-200ms (8-12 steps) and
// drifts to seconds under load, which makes every "per frame" metric
// meaningless. The sim step is the only correct sampling clock.
await page.evaluate((maxSteps) => {
  const W = window.RF.World, S = W.__state;
  const rec = []; window.__rfRec = rec;
  const orig = W.update;
  W.update = function (ctx) {
    const r = orig.apply(this, arguments);
    if (rec.length >= maxSteps) return r;
    const out = [];
    for (const b of S.instancedPrey) {
      if (!b || !b.count) continue;
      const arr = b.mesh.instanceMatrix.array;
      for (let sl = 0; sl < b.count; sl++) {
        const e = b.slotEntities && b.slotEntities[sl];
        const o = sl * 16;
        out.push({ def: b.def && b.def.id, slot: sl,
          px: arr[o+12], py: arr[o+13],
          bx: arr[o+0], by: arr[o+1],
          phase: b.phase.getX(sl), amp: b.amp.getX(sl),
          vx: e ? e.vx : 0, vy: e ? e.vy : 0, r: e ? e.r : 0 });
      }
    }
    rec.push({ t: (ctx && ctx.time && ctx.time.now) || 0, inst: out });
    return r;
  };
}, FRAMES);

const frames = []; const shots = [];
while (shots.length < 12) {
  shots.push(await page.screenshot({ encoding: 'base64' }));
  await new Promise(r => setTimeout(r, 160));
}
await page.waitForFunction((n) => window.__rfRec.length >= n, { timeout: 60000 }, FRAMES)
  .catch(() => logs.push('WARN: recorder did not fill'));
const recorded = await page.evaluate(() => window.__rfRec);
const info0 = await page.evaluate(sampler);
recorded.forEach(r => frames.push({ t: r.t, inst: r.inst, info: info0.info }));
fs.writeFileSync(path.join(dir, `frames-${tag}.json`), JSON.stringify({ tag, frames, logs }, null, 0));
shots.forEach((s, i) => fs.writeFileSync(path.join(dir, `strip-${tag}-${String(i).padStart(2,'0')}.png`), Buffer.from(s, 'base64')));
console.log('DIAG', JSON.stringify(await page.evaluate(()=>({...window.__diag, kitFound:window.__kitFound, run: !!(window.RF.Game.ctx&&window.RF.Game.ctx.run), t: window.RF.Game.ctx&&window.RF.Game.ctx.time&&window.RF.Game.ctx.time.now}))));
console.log(JSON.stringify({ tag, frames: frames.length, instances: frames[0] ? frames[0].inst.length : 0, info: frames[0] && frames[0].info, logs: logs.slice(0,10) }, null, 2));
await browser.close(); server.close(); process.exit(0);
