/* r15 lane JAW - 12-frame bite strip.
 *
 * Screenshots one full bite cycle at a fixed cadence, so the open-close-hold-
 * return is readable as PIXELS rather than only as a number in a trace. The
 * cycle is driven deterministically (a target placed in the mouth, then the
 * cycle stepped) rather than by chasing a school, so all four rows produce
 * comparable strips.
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.ROOT || '/Users/lucille/greenguard-usa-web';
const outDir = process.env.OUT || path.join(root, 'play/razorfin/hse/evidence/r15-jaw');
const port = 47822 + (Number(process.env.PORTOFF) || 0);
const SHARKS = (process.env.SHARKS || 'reef,greatwhite,mako,leviathanrex').split(',');
const FRAMES = Number(process.env.FRAMES || 12);
const SPACING_MS = Number(process.env.SPACING || 45);

fs.mkdirSync(outDir, { recursive: true });
const server = http.createServer((request, response) => {
  let file = decodeURIComponent(request.url.split('?')[0]);
  if (file.endsWith('/')) file += 'index.html';
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const ext = path.extname(file);
    const type = ext === '.js' || ext === '.mjs' ? 'text/javascript' : ext === '.json' ? 'application/json'
      : ext === '.png' ? 'image/png' : ext === '.glb' ? 'model/gltf-binary' : 'text/html';
    response.writeHead(200, { 'content-type': type });
    response.end(data);
  });
});
await new Promise((r) => server.listen(port, r));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--mute-audio', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--window-size=844,390', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewport({ width: 900, height: 520, deviceScaleFactor: 2 });
const cdp = await page.target().createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true });
/* landscapePrimary: the game gates play behind an orientation check and
 * otherwise renders a "Rotate your device" card instead of the shark, which
 * makes every strip frame identical and useless. */
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 520,
  deviceScaleFactor: 1, mobile: false, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
await page.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4500));

const report = {};
for (const shark of SHARKS) {
  await page.evaluate(async (shark) => {
    RF.Game.startRun(shark);
    await new Promise((r) => setTimeout(r, 1400));
  }, shark);

  /* Keep the sim ticking under headless throttling, and hold the shark still
   * so the strip shows the JAW and not the scenery going past. */
  await page.evaluate(() => {
    const G = RF.Game, ctx = G.ctx, p = ctx.player;
    window.__S = { angles: [] };
    /* HOLD THE SHARK STILL and put the camera on its head.
     *
     * The game camera frames a 3:1 play area, which leaves the shark a few
     * dozen pixels wide - a strip shot from it is a picture of the ocean with
     * a jaw somewhere in it. Zeroing the throttle and parking a dedicated
     * camera at the head is the only way the 12 frames actually show the
     * open/close. Nothing here touches the JAW itself; the cycle runs exactly
     * as it does in play. */
    const spin = () => {
      if (G.kit) G.kit.paused = false;
      p.ctl.active = false; p.ctl.hasTarget = false;
      p.vx = 0; p.vy = 0;                     // hold station
      const g = p.rig && p.rig.group;
      const cam = G.camera, three = G.three;
      if (g && cam) {
        const b = new three.Box3().setFromObject(g);
        const c = b.getCenter(new three.Vector3());
        const span = Math.max(b.max.x - b.min.x, 1);
        /* Head end along the shark's facing, then in close. */
        const dir = Math.cos(p.angle || 0) >= 0 ? 1 : -1;
        cam.position.set(c.x + dir * span * 0.34, c.y + span * 0.05, span * 0.85);
        cam.lookAt(c.x + dir * span * 0.34, c.y, 0);
        cam.updateProjectionMatrix();
      }
      if (!window.__SSTOP) requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  });
  await new Promise((r) => setTimeout(r, 900));

  const dir = path.join(outDir, `strip_${shark}`);
  fs.mkdirSync(dir, { recursive: true });
  const angles = [];

  /* POSE the cycle per frame instead of racing it.
   *
   * Walking a real-time cycle with screenshot latency in the loop does not
   * work: a capture takes far longer than a 60 ms segment under headless, so
   * 11 of 12 frames land in idle and the strip shows nothing. The angles in
   * the trace are the timing evidence; this strip's job is to show the SHAPE
   * of the pose at each point of the cycle. So each frame sets the cycle's
   * phase and normalized progress directly and lets the rig render it. */
  const POSES = [
    ['idle', 0.00], ['open', 0.34], ['open', 0.67], ['open', 1.00],
    ['close', 0.30], ['close', 0.65], ['close', 1.00], ['hold', 0.50],
    ['back', 0.20], ['back', 0.50], ['back', 0.80], ['idle', 1.00],
  ];
  for (let i = 0; i < Math.min(FRAMES, POSES.length); i++) {
    /* Pose the cycle, then let one animation frame render it. */
    await page.evaluate(([phase, k]) => {
      const pp = RF.Game.ctx.player, bc = pp.st.biteCycle;
      const T = { open: 0.060, close: 0.090, hold: 0.080, back: 0.200 };
      const TARGET = { open: 0.35, close: 0.01, hold: 0.01, back: 0.15 };
      const FROM = { open: 0.15, close: 0.35, hold: 0.01, back: 0.01 };
      if (phase === 'idle') {
        bc.phase = null; pp.anim.jawGape = 0.15;
      } else {
        bc.phase = phase; bc.t = T[phase] * k; bc.from = FROM[phase];
        /* Write the resulting gape directly too, so the frame is the pose we
         * asked for even if no fixed step lands before the capture. */
        const ks = k * k * (3 - 2 * k);
        pp.anim.jawGape = FROM[phase] + (TARGET[phase] - FROM[phase]) * ks;
      }
      if (pp.rig && pp.rig.animate) {
        try { pp.rig.animate(RF.Game.ctx.time.now, Object.assign(pp.anim.state, { jawOpen: pp.anim.jawGape })); } catch (e) {}
      }
    }, POSES[i]);
    await new Promise((r) => setTimeout(r, 90));
    const info = await page.evaluate(() => {
      const ctx = RF.Game.ctx, p = ctx.player;
      const rig = p.rig, g = rig && rig.group;
      let bone = null;
      if (g) g.traverse((o) => { if (!bone && (o.isBone || o.type === 'Bone') && /LowerJaw|^Jaw$/.test(o.name)) bone = o; });
      let deg = null;
      if (bone) {
        const q = bone.quaternion;
        deg = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y)) * 180 / Math.PI;
      }
      /* Project the shark to screen space so the strip can be cropped to the
       * HEAD. At the game's own camera distance the shark is a few dozen
       * pixels wide in a 900x520 frame - technically a screenshot of the jaw,
       * practically unreadable as evidence. */
      let box = null;
      if (g) {
        const cam = RF.Game.camera, r = RF.Game.renderer;
        const three = RF.Game.three;
        const b3 = new three.Box3().setFromObject(g);
        const pts = [];
        for (const xs of [b3.min.x, b3.max.x]) for (const ys of [b3.min.y, b3.max.y]) for (const zs of [b3.min.z, b3.max.z]) {
          const v = new three.Vector3(xs, ys, zs).project(cam);
          pts.push([(v.x * 0.5 + 0.5) * r.domElement.clientWidth, (-v.y * 0.5 + 0.5) * r.domElement.clientHeight]);
        }
        box = { x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])),
                y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])),
                faceRight: Math.cos(p.angle || 0) >= 0 };
      }
      return { deg: deg === null ? null : +deg.toFixed(2), phase: p.st.biteCycle.phase, gape: +p.anim.jawGape.toFixed(3), box };
    });
    angles.push(info);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(2, '0')}.png`), Buffer.from(shot.data, 'base64'));
    await new Promise((r) => setTimeout(r, SPACING_MS));
  }
  report[shark] = angles;
  console.log(shark, JSON.stringify(angles));
  await page.evaluate(() => { window.__SSTOP = true; try { RF.Game.endRun(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 800));
}
fs.writeFileSync(path.join(outDir, 'strips.json'), JSON.stringify(report, null, 1));
await browser.close(); server.close();
