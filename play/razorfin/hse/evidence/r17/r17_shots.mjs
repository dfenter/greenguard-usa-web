/* Lane S3 (rev17): in-game shot harness for the family pipeline.
 *
 * For every given row id: one in-game profile screenshot (pattern copied
 * from hse/evidence/r15-orient/shoot.mjs -- index.html?unlockall=1, real
 * menu -> level -> dive UI drive, RF.Meta.sessionSelected + activeShark(),
 * landscapePrimary CDP override, sw.js 404'd so the service worker never
 * intercepts, CDP Page.captureScreenshot for true device pixels), PLUS a
 * jaw trace during an eat using the hse/evidence/r15-jaw gate scripts'
 * posed-cycle approach (jaw_strip.mjs) so the same run also proves the jaw
 * cycle for that row.
 *
 * This harness runs against ROWS THAT EXIST TODAY (the four approved bases
 * have live rows: greatwhite_cy/thresher/tigershark/whaler families do not
 * exist as assets/models/fam/*.glb yet, so there is nothing family-specific
 * to select in-game). It is written so that once gen_data.py's FAMILY_BY_ROW
 * ships (Sonnet S2, PLAN-rev17-families.md Step 4) the same row ids will
 * resolve to family GLBs with no changes needed here.
 *
 * Usage:
 *   node hse/evidence/r17/r17_shots.mjs                      # IDS default below
 *   IDS=greatwhite,thresher,tigershark,whaler node hse/evidence/r17/r17_shots.mjs
 *   OUT=<dir> node hse/evidence/r17/r17_shots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..'); // repo root (greenguard-usa-web)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT || path.join(HERE, 'shots');
const IDS = (process.env.IDS || 'greatwhite,thresher,tigershark,whaler').split(',').map((s) => s.trim());

const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  png: 'image/png', jpg: 'image/jpeg', json: 'application/json', glb: 'model/gltf-binary', webp: 'image/webp' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (p.endsWith('/sw.js')) { res.writeHead(404); return res.end(); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream',
    'cache-control': 'no-store', 'Service-Worker-Allowed': '/' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const puppeteer = (await import('puppeteer-core')).default;
let browser = await puppeteer.launch({ headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'] });
fs.mkdirSync(OUT, { recursive: true });

/* Posed bite cycle, same shape as hse/evidence/r15-jaw/jaw_strip.mjs POSES,
 * trimmed to the frames that matter for a trace: idle, mid-open, full-open,
 * mid-close, closed. */
const JAW_POSES = [
  ['idle', 0.00], ['open', 0.50], ['open', 1.00], ['close', 0.50], ['close', 1.00],
];

const report = [];
let n = 0;
for (const id of IDS) {
  n++;
  if (!browser.connected) {
    try { await browser.close(); } catch (e) {}
    browser = await puppeteer.launch({ headless: true, executablePath: CHROME,
      args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'] });
  }
  let page;
  try { page = await browser.newPage(); }
  catch (e) { report.push({ id, errors: ['newPage ' + e.message] }); console.log(String(n).padStart(3), id.padEnd(18), 'NEWPAGE FAIL'); continue; }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.setViewport({ width: 900, height: 520, deviceScaleFactor: 1 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 520,
    deviceScaleFactor: 1, mobile: false, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
  await page.evaluateOnNewDocument((rowId) => {
    const w = window; w.RF = w.RF || {};
    w.RF.Game = w.RF.Game || {}; w.RF.Game.ctx = w.RF.Game.ctx || {};
    w.RF.Game.ctx.player = w.RF.Game.ctx.player || { __rfEvidenceStub: true };
    w.__RF_WANT = rowId;
  }, id);

  const row = { id, errors, jawTrace: [] };
  try {
    await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load', timeout: 40000 });
    const started = await page.evaluate(async (rowId) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const RF = window.RF;
      for (let i = 0; i < 120; i++) {
        if (RF.Meta && RF.Game && RF.UI && document.getElementById('rfDive')) break;
        await sleep(100);
      }
      if (!RF.Meta || !RF.UI) return 'no RF.Meta/RF.UI';
      RF.Meta.sessionSelected = rowId;
      if (RF.UI.showMenu) { try { RF.UI.showMenu(); } catch (e) {} }
      await sleep(150);
      const card = document.querySelector('[data-shark="' + rowId + '"]');
      if (card) { card.click(); await sleep(150); }
      const dive = document.getElementById('rfDive');
      if (!dive) return 'no rfDive';
      if (dive.disabled) return 'rfDive disabled (not owned?)';
      dive.click(); await sleep(400);
      const lsDive = document.getElementById('rfLevelSelectDive');
      if (lsDive) { lsDive.click(); await sleep(400); }
      for (let i = 0; i < 60; i++) {
        const p = RF.Game && RF.Game.ctx && RF.Game.ctx.player;
        if (p && !p.__rfEvidenceStub && p.sprite) return 'ok';
        await sleep(100);
      }
      return 'run did not start';
    }, id);
    row.started = started;
    for (let i = 0; i < 40; i++) {
      const ready = await page.evaluate(() => {
        const p = window.RF?.Game?.ctx?.player;
        return !!(p && p.sprite && !p.__rfEvidenceStub && p.sprite.children?.length);
      });
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    /* one in-game PROFILE shot: hold the shark still, side-on, no drive
     * input, matching r15-orient's fixed-camera framing intent but shot from
     * the game's live camera (not an offscreen pass) since this is meant to
     * be an in-game screenshot, not a silhouette measurement. */
    await new Promise((r) => setTimeout(r, 600));
    const profileShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `${id}_profile.png`), Buffer.from(profileShot.data, 'base64'));

    /* JAW TRACE during an eat, via the r15-jaw gate scripts' posed-cycle
     * approach: pose the bite cycle directly (idle -> open -> close) and
     * read the LowerJaw bone's local-X angle back off the live rig each
     * frame, screenshotting the head. */
    for (const [phase, k] of JAW_POSES) {
      const frameInfo = await page.evaluate(([ph, kk]) => {
        const p = window.RF?.Game?.ctx?.player;
        if (!p || p.__rfEvidenceStub) return { error: 'no live player' };
        const bc = p.st && p.st.biteCycle;
        const T = { open: 0.060, close: 0.090 };
        const TARGET = { open: 0.35, close: 0.01 };
        const FROM = { open: 0.15, close: 0.35 };
        if (ph === 'idle') {
          if (bc) bc.phase = null;
          if (p.anim) p.anim.jawGape = 0.15;
        } else if (bc && p.anim) {
          bc.phase = ph; bc.t = T[ph] * kk; bc.from = FROM[ph];
          const ks = kk * kk * (3 - 2 * kk);
          p.anim.jawGape = FROM[ph] + (TARGET[ph] - FROM[ph]) * ks;
        }
        if (p.rig && p.rig.animate) {
          try { p.rig.animate(window.RF.Game.ctx.time.now, Object.assign(p.anim.state || {}, { jawOpen: p.anim.jawGape })); } catch (e) {}
        }
        let bone = null;
        const g = p.rig && p.rig.group;
        if (g) g.traverse((o) => { if (!bone && (o.isBone || o.type === 'Bone') && /LowerJaw|^Jaw$/.test(o.name)) bone = o; });
        let deg = null;
        if (bone) {
          const q = bone.quaternion;
          deg = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y)) * 180 / Math.PI;
        }
        return { phase: ph, k: kk, deg: deg === null ? null : +deg.toFixed(2), gape: p.anim ? +p.anim.jawGape.toFixed(3) : null, hasJawBone: !!bone };
      }, [phase, k]);
      await new Promise((r) => setTimeout(r, 90));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const tag = `${phase}_${String(Math.round(k * 100)).padStart(3, '0')}`;
      fs.writeFileSync(path.join(OUT, `${id}_jaw_${tag}.png`), Buffer.from(shot.data, 'base64'));
      row.jawTrace.push(frameInfo);
    }
  } catch (e) { errors.push('SHOOT ' + e.message); }
  try { await page.close(); } catch (e) { errors.push('close ' + e.message); }
  report.push(row);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(String(n).padStart(3), id.padEnd(18), row.started || '-', 'jawFrames=' + row.jawTrace.length, errors[0] || '');
}
try { await browser.close(); } catch (e) {}
srv.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('done rows=' + report.length);
