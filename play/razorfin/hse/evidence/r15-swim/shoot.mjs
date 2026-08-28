/* Rev 15 lane SWIM -- frame-sequence probe in the REAL game.
 *
 * Drives index.html?unlockall=1 exactly as lane ORIENT's shooter does (same
 * roster -> DIVE -> level DIVE flow, same landscapePrimary override, service
 * worker 404'd), then captures 30 fps frame strips while swimming straight
 * right and while turning, AND reads the live rig's swim state per frame so
 * the pixels and the numbers come from the same run.
 *
 * Usage:  OUT=<dir> [IDS=a,b] node hse/evidence/r15-swim/shoot.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const OUT = process.env.OUT || path.join(HERE, 'shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IDS = (process.env.IDS || 'reef,greatwhite,mako,tiger,hammerhead,leviathanrex').split(',').map((s) => s.trim());
const FPS = 30, SECS = 3, FRAMES = FPS * SECS;

fs.mkdirSync(OUT, { recursive: true });

const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary', webp: 'image/webp', css: 'text/css' };

const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/sw.js')) { res.writeHead(404); return res.end(); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const puppeteer = (await import('puppeteer-core')).default;
const LAUNCH = { headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'] };
let browser = await puppeteer.launch(LAUNCH);

const report = [];

for (const id of IDS) {
  /* The software renderer drops a target every few rows; relaunch rather than
   * lose the rest of the run. */
  if (!browser.connected) { try { await browser.close(); } catch (e) {} browser = await puppeteer.launch(LAUNCH); }
  let page;
  try { page = await browser.newPage(); }
  catch (e) { try { await browser.close(); } catch (e2) {} browser = await puppeteer.launch(LAUNCH); page = await browser.newPage(); }
  await page.setViewport({ width: 900, height: 520, deviceScaleFactor: 1 });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 520,
    deviceScaleFactor: 1, mobile: false, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
  await page.evaluateOnNewDocument((rowId) => {
    const w = window; w.RF = w.RF || {}; w.RF.Game = w.RF.Game || {}; w.RF.Game.ctx = w.RF.Game.ctx || {};
    w.RF.Game.ctx.player = w.RF.Game.ctx.player || { __rfEvidenceStub: true }; w.__RF_WANT = rowId;
  }, id);

  try {
  await page.goto(`http://127.0.0.1:${PORT}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load', timeout: 40000 });
  const started = await page.evaluate(async (rowId) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const RF = window.RF;
    for (let i = 0; i < 120; i++) { if (RF.Meta && RF.Game && RF.UI && document.getElementById('rfDive')) break; await sleep(100); }
    if (!RF.Meta || !RF.UI) return 'no RF.Meta/RF.UI';
    RF.Meta.sessionSelected = rowId;
    if (RF.UI.showMenu) { try { RF.UI.showMenu(); } catch (e) {} }
    await sleep(150);
    const card = document.querySelector('[data-shark="' + rowId + '"]');
    if (card) { card.click(); await sleep(150); }
    const dive = document.getElementById('rfDive');
    if (!dive) return 'no rfDive';
    dive.click(); await sleep(400);
    const ls = document.getElementById('rfLevelSelectDive');
    if (ls) { ls.click(); await sleep(400); }
    for (let i = 0; i < 60; i++) {
      const p = RF.Game && RF.Game.ctx && RF.Game.ctx.player;
      if (p && !p.__rfEvidenceStub && p.sprite) return 'ok';
      await sleep(100);
    }
    return 'run did not start';
  }, id);
  if (started !== 'ok') { report.push({ id, error: started }); await page.close().catch(() => {}); continue; }

  await page.evaluate(async () => { if (!window.__RF_THREE) window.__RF_THREE = await import('three'); });

  /* Per-frame reader: the swim uniforms/state the engine feeds the rig, plus
   * the live lateral position of the caudal band and the head band, measured
   * through CPU skinning so it matches what the GPU draws. */
  await page.evaluate(() => {
    const T = window.__RF_THREE;
    window.__rfSwimInit = () => {
      const p = window.RF?.Game?.ctx?.player; if (!p?.sprite) return false;
      let body = null; p.sprite.traverse((o) => { if (!body && o.isSkinnedMesh) body = o; });
      if (!body) return false;
      const bones = body.skeleton.bones, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, pos = body.geometry.attributes.position;
      const pick = (names) => { const L = [];
        for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 2000))) {
          let best = -1, bw = 0;
          for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; best = si.getComponent(i, c); } }
          if (best >= 0 && bw > 0.5 && names.includes(bones[best]?.name)) L.push(i);
        } return L; };
      window.__rfBody = body;
      window.__rfTail = pick(['Tail3', 'Tail2']);
      window.__rfHead = pick(['Head', 'LowerJaw']);
      return window.__rfTail.length > 0 && window.__rfHead.length > 0;
    };
    window.__rfRecStart = (frames) => {
      /* Sample on the page's OWN rAF loop and buffer in-page.
       *
       * Sampling with one page.evaluate per frame does NOT work here: measured
       * intervals came back 0.067-0.65 s (2-20x the intended 33 ms) because the
       * CDP round-trip under swiftshader cannot hold 30 fps. At 0.65 s gaps the
       * beat ALIASES -- phase wrapped 6.2 -> 0.98 between consecutive samples --
       * and a second-difference jerk metric on that series is meaningless
       * (it read 387% on motion the headless gate measures at 1.78%).
       * Recording in-page makes the sample interval the render interval. */
      window.__rfRec = []; window.__rfRecWant = frames;
      const tick = () => {
        if (window.__rfRec.length >= window.__rfRecWant) return;
        const s2 = window.__rfSwimRead && window.__rfSwimRead();
        if (s2) window.__rfRec.push(s2);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    window.__rfSwimRead = () => {
      const T2 = window.__RF_THREE, p = window.RF?.Game?.ctx?.player, body = window.__rfBody;
      if (!body || !p) return null;
      const v = new T2.Vector3();
      const mean = (L, ax) => { let s = 0; for (const i of L) {
        v.fromBufferAttribute(body.geometry.attributes.position, i);
        if (body.applyBoneTransform) body.applyBoneTransform(i, v);
        v.applyMatrix4(body.matrixWorld); s += v[ax]; } return L.length ? s / L.length : 0; };
      const a = p.anim || {};
      return { t: window.RF.Game.ctx.time?.now ?? 0, tailPhase: a.tailPhase, tailAmp: a.tailAmp,
        speedFrac: a.speedFrac, tailZ: mean(window.__rfTail, 'z'), tailY: mean(window.__rfTail, 'y'),
        headZ: mean(window.__rfHead, 'z') };
    };
  });
  await page.evaluate(() => window.__rfSwimInit && window.__rfSwimInit());

  const row = { id, drives: {} };
  for (const drive of [{ name: 'straight', keys: ['ArrowRight'] }, { name: 'turn', keys: ['ArrowRight', 'ArrowUp'] }]) {
    for (const k of drive.keys) await page.keyboard.down(k);
    await new Promise((r) => setTimeout(r, 600));   // settle into the drive
    const dir = path.join(OUT, `${id}_${drive.name}`);
    fs.mkdirSync(dir, { recursive: true });
    await page.evaluate((n) => window.__rfRecStart(n), FRAMES);
    /* Strip frames: 12 per row, captured while the in-page recorder runs. */
    for (let k = 0; k < 12; k++) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(dir, `f${String(k).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
      await new Promise((r) => setTimeout(r, (SECS * 1000) / 12));
    }
    const series = await page.evaluate(() => window.__rfRec || []);
    for (const k of drive.keys) await page.keyboard.up(k);
    await new Promise((r) => setTimeout(r, 250));
    row.drives[drive.name] = series;
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await page.close().catch(() => {});
  console.log(id, 'captured');
  } catch (e) {
    console.log(id, 'FAILED', e.message);
    report.push({ id, error: String(e.message) });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    try { await page.close(); } catch (e2) {}
  }
}


await browser.close(); srv.close();
console.log('done ->', OUT);
