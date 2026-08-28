/* Rev15 LIGHT lane gate: rendered-pixel luminance of shark vs water.
   Renders the live game, projects the player rig's world bbox to screen,
   classifies pixels inside that bbox as shark (by depth-buffer-free means:
   we render one frame normally, then one frame with the rig hidden, and
   diff -- pixels that changed are shark pixels). Medians are computed on
   sRGB relative luminance. */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/lucille/greenguard-usa-web';
const OUT = path.join(ROOT, 'play/razorfin/hse/evidence/r15-light');
const TAG = process.env.TAG || 'before';
const PORT = 47731 + (Number(process.env.PORTOFF) || 0);
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  let file = decodeURIComponent(req.url.split('?')[0]);
  if (file.endsWith('/')) file += 'index.html';
  const p = path.join(ROOT, file);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(p);
    const type = ext === '.js' || ext === '.mjs' ? 'text/javascript'
      : ext === '.html' ? 'text/html' : ext === '.png' ? 'image/png'
      : ext === '.json' ? 'application/json' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--mute-audio', '--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  // bypass service worker
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error('sw off')); } catch (e) {} }
  // ggkit's rotate gate reads screen.orientation.type first, and headless
  // mobile emulation reports portrait-primary for a landscape viewport.
  try {
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { type: 'landscape-primary', angle: 90, addEventListener() {}, removeEventListener() {} }
    });
  } catch (e) {}
});
await page.goto(`http://127.0.0.1:${PORT}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4500));

// SCENES: level 1 near surface, and abyss (deep y)
const SCENES = [
  { name: 'l1-surface', level: 1, y: 260 },
  { name: 'abyss', level: 1, y: 3400 }
];

const results = [];
for (const sc of SCENES) {
  const stat = await page.evaluate(async (sc) => {
    const G = window.RF.Game;
    try { G.selectLevel && G.selectLevel(sc.level); } catch (e) {}
    G.startRun('reef');
    await new Promise((r) => setTimeout(r, 1200));
    const p = G.ctx.player;
    p.x = 3000; p.y = sc.y; p.vx = 220; p.vy = 0;
    // let the follow camera converge on the teleport instead of easing for
    // seconds: run many frames' worth of wall time, then verify on screen.
    for (let k = 0; k < 40; k++) { await new Promise((r) => requestAnimationFrame(r)); }
    await new Promise((r) => setTimeout(r, 900));

    const renderer = G.renderer, scene = G.scene, camera = G.camera;
    const rig = p.rig, group = rig.group;
    const THREE = G.three;
    const cvs = renderer.domElement;
    const W = cvs.width, H = cvs.height;
    const two = document.createElement('canvas');
    two.width = W; two.height = H;
    const c2 = two.getContext('2d', { willReadFrequently: true });

    function grab() {
      renderer.render(scene, camera);
      c2.clearRect(0, 0, W, H);
      c2.drawImage(cvs, 0, 0);
      return c2.getImageData(0, 0, W, H).data;
    }
    const withShark = grab();
    const vis = group.visible; group.visible = false;
    const noShark = grab();
    group.visible = vis;

    // shark screen bbox for reporting
    const box = new THREE.Box3().setFromObject(group);
    const v = new THREE.Vector3();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }

    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const sharkL = [], waterL = [];
    let sharkPx = 0;
    for (let i = 0; i < withShark.length; i += 4) {
      const dr = Math.abs(withShark[i] - noShark[i]);
      const dg = Math.abs(withShark[i + 1] - noShark[i + 1]);
      const db = Math.abs(withShark[i + 2] - noShark[i + 2]);
      if (dr + dg + db > 14) { sharkPx++; sharkL.push(lum(withShark, i)); }
    }
    // water = pixels in a band around the shark bbox that are NOT shark
    const bx0 = Math.max(0, Math.floor(x0 - (x1 - x0) * 0.5));
    const bx1 = Math.min(W, Math.ceil(x1 + (x1 - x0) * 0.5));
    const by0 = Math.max(0, Math.floor(y0 - (y1 - y0) * 0.8));
    const by1 = Math.min(H, Math.ceil(y1 + (y1 - y0) * 0.8));
    // WATER ONLY. The band around the shark can reach above the waterline,
    // where the sky sheet is far brighter than any water; including it made
    // the "water median" 166 at the surface and the ratio meaningless. The
    // shark is the subject and the WATER is the background it has to separate
    // from, so clip the sample band to rows at or below the shark's own top
    // edge, which is always submerged in these scenes.
    const waterTop = Math.max(by0, Math.floor(y0));
    for (let y = waterTop; y < by1; y += 2) for (let x = bx0; x < bx1; x += 2) {
      const i = (y * W + x) * 4;
      const dsum = Math.abs(withShark[i] - noShark[i]) + Math.abs(withShark[i + 1] - noShark[i + 1]) + Math.abs(withShark[i + 2] - noShark[i + 2]);
      if (dsum <= 14) waterL.push(lum(noShark, i));
    }
    const med = (a) => { if (!a.length) return 0; a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const pct = (a, f) => { if (!a.length) return 0; return a[Math.min(a.length - 1, Math.floor(a.length * f))]; };
    const sm = med(sharkL), wm = med(waterL);
    // specular hotspot: top 0.5% of shark luminance vs its median
    const hot = pct(sharkL, 0.995);
    // mean hue of shark pixels (cyan check)
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let i = 0; i < withShark.length; i += 4) {
      const dsum = Math.abs(withShark[i] - noShark[i]) + Math.abs(withShark[i + 1] - noShark[i + 1]) + Math.abs(withShark[i + 2] - noShark[i + 2]);
      if (dsum > 14) { sr += withShark[i]; sg += withShark[i + 1]; sb += withShark[i + 2]; n++; }
    }
    return {
      name: sc.name, W, H, sharkPx,
      sharkMedian: +sm.toFixed(2), waterMedian: +wm.toFixed(2),
      ratio: wm > 0 ? +(sm / wm).toFixed(3) : 0,
      sharkP995: +hot.toFixed(2),
      hotspotOverMedian: sm > 0 ? +(hot / sm).toFixed(3) : 0,
      sharkMeanRGB: n ? [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] : null,
      bbox: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)]
    };
  }, sc);
  results.push(stat);
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(OUT, `${TAG}-${sc.name}.png`), buf);
  await page.evaluate(() => { try { window.RF.Game.endRun(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 600));
}

fs.writeFileSync(path.join(OUT, `lum-${TAG}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();
