/* r15-doc roster shooter: profile + head crop for every row in RFD.SHARKS.
 *
 * Traps inherited from hse/evidence/r15-face/shoot.mjs, all found the hard way:
 *
 * 1. TEXTURED MODELS ARE DEMAND-LOADED. requestTemplate() refuses a key in
 *    TEXTURED_KEYS unless mayLoadTextured() is true, which needs either the
 *    bounded boot window or a live RF.Game.ctx.player. Without the stub the
 *    row silently renders LOW-POLY and reports textured:false.
 * 2. bootTexturedKey() reads RF.Meta.profile().activeShark to pick WHICH
 *    textured model preload fetches. Without that stub every row after the
 *    first comes back untextured.
 * 3. Service worker must never intercept: the harness serves from a random
 *    port and sw.js is refused by the server below.
 * 4. ONE BROWSER PAGE PER ROW. The template cache is an LRU and it bleeds
 *    between rows: reusing a page gave later rows the previous row's model.
 *    A fresh page per row is slower and correct.
 * 5. Screenshots go through CDP Page.captureScreenshot, not page.screenshot,
 *    for a true device-pixel grab.
 *
 *   OUT=<dir> [IDS=a,b,c] [FACE=1] node hse/evidence/r15-doc/shoot.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT || path.join(HERE, 'shots');
/* FACE=1 flips the shark3d.js kill switch in flight (never on disk) so the
   textured face batch mounts. Default follows the working tree. */
const ENABLE_FACE = process.env.FACE === '1';

const roster = JSON.parse(fs.readFileSync(path.join(HERE, 'roster.json'), 'utf8'));
const IDS = process.env.IDS ? process.env.IDS.split(',').map((s) => s.trim()) : roster.map((r) => r.id);

const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  png: 'image/png', jpg: 'image/jpeg', json: 'application/json', glb: 'model/gltf-binary', webp: 'image/webp' };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  /* Trap 3: never let the service worker install and start answering from a
     stale cache - it served last week's GLBs during an earlier lineup. */
  if (p.endsWith('/sw.js')) { res.writeHead(404); return res.end(); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = f.split('.').pop();
  if (ENABLE_FACE && p.endsWith('/shark3d.js')) {
    let src = fs.readFileSync(f, 'utf8');
    const before = src;
    src = src.replace('const RF_O2_TEXTURED_FACE = false;', 'const RF_O2_TEXTURED_FACE = true;');
    if (src === before) console.warn('WARN: kill-switch line not found in shark3d.js');
    res.writeHead(200, { 'content-type': MIME.js, 'cache-control': 'no-store', 'Service-Worker-Allowed': '/' });
    return res.end(src);
  }
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
    'Service-Worker-Allowed': '/',
  });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'],
});
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { shot: 'profile', w: 1000, h: 620, suffix: '' },
  { shot: 'head', w: 700, h: 560, suffix: '_head' },
];

const report = [];
let n = 0;
for (const id of IDS) {
  n++;
  const rowRec = { id };
  for (const S of SHOTS) {
    /* Trap 4: a fresh page per shot, so the template LRU cannot hand this row
       the previous row's model. */
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await page.setViewport({ width: S.w, height: S.h, deviceScaleFactor: 1 });
    const cdp = await page.createCDPSession();
    /* Traps 1 + 2: both stubs installed before any page script runs. */
    await page.evaluateOnNewDocument((rowId) => {
      const w = window; w.RF = w.RF || {};
      w.RF.Game = w.RF.Game || {}; w.RF.Game.ctx = w.RF.Game.ctx || {};
      w.RF.Game.ctx.player = w.RF.Game.ctx.player || { __rfEvidenceStub: true };
      w.RF.Meta = w.RF.Meta || {};
      w.RF.Meta.profile = () => ({ activeShark: rowId });
    }, id);
    const url = `http://127.0.0.1:${port}/play/razorfin/hse/evidence/r15-doc/profileview.html`
      + `?id=${encodeURIComponent(id)}&shot=${S.shot}&w=${S.w}&h=${S.h}`;
    let doc = null;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      /* Textured GLBs fetch and decode after load; poll instead of a flat wait
         so heavy rows are not shot mid-load and light rows are not slow. */
      for (let i = 0; i < 30; i++) {
        doc = await page.evaluate(() => globalThis.__DOC || null);
        if (doc) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 600));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `shark_${id}${S.suffix}.png`), Buffer.from(shot.data, 'base64'));
    } catch (e) {
      errors.push('SHOOT ' + e.message);
    }
    if (S.shot === 'profile') Object.assign(rowRec, doc || {}, { errors });
    await page.close();
  }
  report.push(rowRec);
  console.log(String(n).padStart(3), String(id).padEnd(18),
    'textured=' + rowRec.textured, 'base=' + rowRec.base,
    'face=' + rowRec.faceMounted,
    (rowRec.errors && rowRec.errors.length) ? 'ERR:' + rowRec.errors[0] : '');
}
await browser.close(); srv.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('done rows=' + report.length);
