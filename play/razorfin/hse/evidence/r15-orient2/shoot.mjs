/* r15-orient PLAYED gate.
 *
 * Drives the REAL game (index.html, ?unlockall=1) for every row in
 * RFD.SHARKS, steers right / left / down with real key events, screenshots
 * each, and measures the shark's orientation from the RENDERED PIXELS.
 *
 * Traps inherited from hse/evidence/r15-doc/shoot.mjs (all found the hard
 * way there, all still apply):
 *   1. Textured GLBs are demand-loaded and need the player stub + the
 *      RF.Meta.profile().activeShark stub, or the row renders low-poly.
 *   2. The service worker must never intercept: sw.js is 404'd below.
 *   3. ONE PAGE PER ROW - the template cache is an LRU that bleeds.
 *   4. Screenshots via CDP Page.captureScreenshot for true device pixels.
 *
 * Measurement is deliberately NOT the r15-doc approach. That shooter MOVES
 * THE CAMERA to wherever it measures the dorsal axis to be, which renders
 * every model plausibly regardless of its true orientation and so cannot
 * detect the bug. Here the camera is the game's own fixed side-on camera,
 * so a mis-oriented shark is visibly wrong and measurably wrong.
 *
 *   OUT=<dir> [IDS=a,b] node hse/evidence/r15-orient/shoot.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT || path.join(HERE, 'shots');
const roster = [];
const IDS = process.env.IDS ? process.env.IDS.split(',').map((s) => s.trim()) : ['greatwhite','leviathanrex','leviathan_rex','thresher','sawshark','snapjaw','aresrender','artemisstrike','whaleshark','reef'];

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

/* The three drives the brief asks for. Each holds its keys for 1.5s. */
const DRIVES = [
  { name: 'right', keys: ['ArrowRight'], want: 'right' },
  { name: 'left',  keys: ['ArrowLeft'],  want: 'left' },
  { name: 'down',  keys: ['ArrowDown'],  want: 'down' },
  { name: 'up',    keys: ['ArrowUp'],    want: 'up' },
];

/* Measure orientation from the silhouette MASK (alpha channel).
 *
 * (a) mask      - alpha > 0 is shark.
 * (b) nose      - the body's long axis in screen space is x. Split the mask
 *                 into a left half and a right half about the centroid and
 *                 compare mean column THICKNESS: the head end is girthier
 *                 than the tapering peduncle. The nose is the thicker end's
 *                 outer extremity. (Column COUNT is not used - a tall caudal
 *                 fin sheet has many pixels but little girth, the same trap
 *                 the geometry path documents.)
 * (c) dorsal    - one-sided extent asymmetry about the per-column median
 *                 row: the dorsal fin reaches further from the centreline
 *                 than the belly does. Positive => fin is toward -y in image
 *                 space, i.e. UP on screen (image y grows downward).
 */
function measure(sil) {
  const { W, H, data } = sil;
  const on = (x, y) => data[y * W + x] > 8;
  let minX = W, maxX = -1, sumX = 0, sumY = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; sumX += x; sumY += y; n++; }
  if (n < 50) return { ok: false, px: n };
  const cx = sumX / n, cy = sumY / n;
  /* per-column span + median row */
  const cols = [];
  for (let x = minX; x <= maxX; x++) {
    let lo = -1, hi = -1, cnt = 0;
    for (let y = 0; y < H; y++) if (on(x, y)) { if (lo < 0) lo = y; hi = y; cnt++; }
    if (lo >= 0) cols.push({ x, lo, hi, cnt, mid: (lo + hi) / 2 });
  }
  if (cols.length < 8) return { ok: false, px: n };
  const span = maxX - minX;
  /* (b) girth of the two end thirds */
  const endA = cols.filter((c) => c.x <= minX + span * 0.33);
  const endB = cols.filter((c) => c.x >= maxX - span * 0.33);
  const mean = (a) => a.length ? a.reduce((s, c) => s + c.cnt, 0) / a.length : 0;
  const gA = mean(endA), gB = mean(endB);
  const noseRight = gB > gA;            // thicker end is the head
  /* (c) dorsal asymmetry over the middle 60%, about each column's own
     centreline (median row), summed - pectorals are paired and cancel. */
  const mid = cols.filter((c) => c.x > minX + span * 0.2 && c.x < minX + span * 0.8);
  let up = 0, dn = 0, used = 0;
  for (const c of mid) {
    const rows = [];
    for (let y = c.lo; y <= c.hi; y++) if (on(c.x, y)) rows.push(y);
    if (rows.length < 3) continue;
    const m = rows[rows.length >> 1];
    up += m - c.lo;      // reach ABOVE the centreline (smaller y = up)
    dn += c.hi - m;      // reach BELOW
    used++;
  }
  if (!used) return { ok: false, px: n };
  up /= used; dn /= used;
  const dorsalUp = up > dn;            // fin reaches further up than down

  /* ROLL DETECTOR.
   *
   * The up/down asymmetry above is necessary but NOT sufficient, and trusting
   * it alone nearly passed the broken build: a shark rolled 90 degrees is
   * seen from ABOVE, where the two pectorals spread symmetrically either side
   * of the spine, so the silhouette is near-symmetric and "dorsalUp" reads
   * true on a shark that has no dorsal fin visible at all. (Measured on the
   * pre-fix build: mako drove right with dorsalUp=true and asym=+0.029 while
   * rendering a plain top-down view.)
   *
   * A true side-on shark and a top-down shark differ in a way that does not
   * depend on which way is up: the side view is SLENDER and carries ONE
   * dorsal spike, the top view is BROAD and carries TWO symmetric pectoral
   * lobes. So measure:
   *   slenderness = body height / body length   (top view is much fatter)
   *   spikiness   = max column reach / mean column reach on the dorsal side
   *                 (a single fin spikes; a symmetric pair does not)
   * A rolled shark reads fat and unspiky. */
  /* BELLY-UP DETECTOR - the failure this whole lane is about.
   *
   * 12 of the 15 baked rigs shipped rendering upside down. In pure silhouette
   * that is nearly invisible (a shark is roughly fore-aft symmetric top to
   * bottom), which is why the up/down reach test alone passed the broken
   * build. What is NOT symmetric is WHERE ALONG THE BODY the biggest
   * one-sided excursion sits: the dorsal fin sits forward of the caudal
   * peduncle, around 40-55% of the length from the nose, while the belly's
   * deepest point (the pelvic/anal region) sits further back. So compare the
   * x-position of the furthest excursion on each side, expressed as a
   * fraction of body length from the NOSE end. Dorsal-up means the upper
   * excursion peaks FORWARD of the lower one. */
  const heights = cols.map((c) => c.hi - c.lo + 1);
  const bodyH = Math.max(...heights);
  const slender = bodyH / Math.max(span, 1);
  const upReach = [];
  for (const c of mid) {
    const rows = [];
    for (let y = c.lo; y <= c.hi; y++) if (on(c.x, y)) rows.push(y);
    if (rows.length < 3) continue;
    const m = rows[rows.length >> 1];
    upReach.push(Math.max(m - c.lo, c.hi - m));   // reach on the FIN side
  }
  const meanReach = upReach.reduce((a, b) => a + b, 0) / Math.max(upReach.length, 1);
  const maxReach = Math.max(...upReach, 0);
  const spikiness = maxReach / Math.max(meanReach, 1e-6);
  /* peak-excursion position on each side, 0 = nose end, 1 = tail end */
  let bestUp = -1, bestUpX = 0, bestDn = -1, bestDnX = 0;
  for (const c of mid) {
    const rows = [];
    for (let y = c.lo; y <= c.hi; y++) if (on(c.x, y)) rows.push(y);
    if (rows.length < 3) continue;
    const m = rows[rows.length >> 1];
    if (m - c.lo > bestUp) { bestUp = m - c.lo; bestUpX = c.x; }
    if (c.hi - m > bestDn) { bestDn = c.hi - m; bestDnX = c.x; }
  }
  const toNose = (x) => noseRight ? (maxX - x) / Math.max(span, 1) : (x - minX) / Math.max(span, 1);
  const upPeak = toNose(bestUpX), dnPeak = toNose(bestDnX);
  const finForward = upPeak < dnPeak;   // dorsal peaks nearer the nose
  return { ok: true, px: n, cx: +cx.toFixed(1), cy: +cy.toFixed(1),
    girthLeft: +gA.toFixed(2), girthRight: +gB.toFixed(2), noseRight,
    reachUp: +up.toFixed(2), reachDown: +dn.toFixed(2), dorsalUp,
    slender: +slender.toFixed(3), spikiness: +spikiness.toFixed(3),
    upPeak: +upPeak.toFixed(3), dnPeak: +dnPeak.toFixed(3), finForward,
    asym: +((up - dn) / Math.max(up + dn, 1e-6)).toFixed(3) };
}

const report = [];
let n = 0;
for (const id of IDS) {
  n++;
  /* Relaunch if a previous row took the browser down with it. */
  if (!browser.connected) {
    try { await browser.close(); } catch (e) {}
    browser = await puppeteer.launch({ headless: true, executablePath: CHROME,
      args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'] });
  }
  let page;
  try { page = await browser.newPage(); }
  catch (e) { report.push({ id, frames: {}, errors: ['newPage ' + e.message] }); console.log(String(n).padStart(3), id.padEnd(18), 'NEWPAGE FAIL'); continue; }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.setViewport({ width: 900, height: 520, deviceScaleFactor: 1 });
  /* landscapePrimary, as the brief requires: the game gates on orientation. */
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 520,
    deviceScaleFactor: 1, mobile: false, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
  await page.evaluateOnNewDocument((rowId) => {
    const w = window; w.RF = w.RF || {};
    w.RF.Game = w.RF.Game || {}; w.RF.Game.ctx = w.RF.Game.ctx || {};
    w.RF.Game.ctx.player = w.RF.Game.ctx.player || { __rfEvidenceStub: true };
    w.__RF_WANT = rowId;
  }, id);

  const row = { id, frames: {}, errors };
  try {
    await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load', timeout: 40000 });
    /* Select this row through the real dev-unlock path, then start a run. */
    /* Drive the REAL UI: pick the row in the roster, DIVE to level select,
       DIVE again to start. Calling RF.Game.startRun() directly was tried and
       leaves the menu overlay up (the run starts underneath but every
       screenshot is of the roster), so the buttons are the honest path. */
    const started = await page.evaluate(async (rowId) => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const RF = window.RF;
      for (let i = 0; i < 120; i++) {
        if (RF.Meta && RF.Game && RF.UI && document.getElementById('rfDive')) break;
        await sleep(100);
      }
      if (!RF.Meta || !RF.UI) return 'no RF.Meta/RF.UI';
      /* Dev pick, never persisted; activeShark() honours sessionSelected. */
      RF.Meta.sessionSelected = rowId;
      if (RF.UI.showMenu) { try { RF.UI.showMenu(); } catch (e) {} }
      await sleep(150);
      /* Select the row's roster card so the DIVE button targets it. */
      const card = document.querySelector('[data-shark="' + rowId + '"]');
      if (card) { card.click(); await sleep(150); }
      const dive = document.getElementById('rfDive');
      if (!dive) return 'no rfDive';
      if (dive.disabled) return 'rfDive disabled (not owned?)';
      dive.click(); await sleep(400);
      /* Level select appears; its own DIVE starts the run. */
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
    /* Let the run boot and the (possibly textured) model resolve. */
    for (let i = 0; i < 40; i++) {
      const ready = await page.evaluate(() => {
        const p = window.RF?.Game?.ctx?.player;
        return !!(p && p.sprite && !p.__rfEvidenceStub && p.sprite.children?.length);
      });
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    /* Pull THREE in through the page's own importmap so the silhouette pass
       uses the exact same build the game does. */
    await page.evaluate(async () => {
      if (window.__RF_THREE) return;
      window.__RF_THREE = await import('three');
    });
    for (const D of DRIVES) {
      for (const k of D.keys) await page.keyboard.down(k);
      /* Vertical drives need longer than horizontal: the shark carries its
       * previous heading and turns at a finite rate, so a 1.5 s hold caught
       * several rows still rotating and produced frames where the snout was
       * pointing the OPPOSITE way to the key being held. Hold long enough
       * for the heading to settle, then verify it did before shooting. */
      const HOLD = (D.name === 'up' || D.name === 'down') ? 4200 : 1800;
      await new Promise((r) => setTimeout(r, HOLD));
      /* Wait until the velocity actually agrees with the drive (or give up
       * after 3 s) so a frame is never taken mid-turn. */
      await page.evaluate(async (want) => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 30; i++) {
          const p = window.RF?.Game?.ctx?.player; if (!p) return;
          const vx = p.vx || 0, vy = p.vy || 0;
          const sp = Math.hypot(vx, vy);
          if (sp > 30) {
            if (want === 'right' && vx > 0.7 * sp) return;
            if (want === 'left'  && -vx > 0.7 * sp) return;
            if (want === 'up'    && Math.abs(vy) > 0.7 * sp) return;
            if (want === 'down'  && Math.abs(vy) > 0.7 * sp) return;
          }
          await sleep(100);
        }
      }, D.want);
      const probe = await page.evaluate(() => {
        const p = window.RF?.Game?.ctx?.player; if (!p) return null;
        const out = { angle: p.angle, x: p.x, y: p.y, vx: p.vx, vy: p.vy };
        /* GEOMETRIC ground truth on the LIVE rig, in world space.
         *
         * The silhouette cannot settle belly-up: a shark is close enough to
         * symmetric top-to-bottom at gameplay scale that a flipped one still
         * reads as a shark (measured - the pre-fix build passed every
         * silhouette test this harness could pose). The SKELETON is not
         * ambiguous: the lower jaw hangs below the snout and the head leads
         * the tail, so read those bones off the rendered rig.
         *
         * Rendered-pixel tests still gate framing/nose direction above; this
         * gates roll, which is the failure the owner actually reported. */
        const T = window.__RF_THREE; const g = p.sprite;
        if (T && g) {
          g.updateMatrixWorld(true);
          const P = (n) => { const o = g.getObjectByName(n); return o ? new T.Vector3().setFromMatrixPosition(o.matrixWorld) : null; };
          const head = P('Head') || P('Nose'), jaw = P('LowerJaw') || P('Jaw');
          const tail = P('Tail3') || P('Tail2') || P('Tail1');
          /* World y is DOWN in this engine's placement (renderPlayer negates
             it), so on screen a correctly-oriented shark has its jaw at a
             GREATER world y than its head. Compare in the rig's own frame
             instead: dot the head->jaw vector against the rig's local down. */
          if (head && jaw) {
            const down = new T.Vector3(0, -1, 0).applyQuaternion(g.getWorldQuaternion(new T.Quaternion()));
            out.jawDot = +jaw.clone().sub(head).normalize().dot(down).toFixed(4);
            /* jawDot is only meaningful when the jaw is OFF the view axis.
             * On the r15 re-bakes the dorsal ends up on the model's local Z,
             * which puts the jaw on local Y and drives jawDot to ~0 - not a
             * failure, just an axis on which this cue says nothing. Record
             * how much of the head->jaw vector actually lies in the
             * screen-vertical plane so the gate can tell "belly up" from
             * "this cue does not apply". */
            const d = jaw.clone().sub(head).normalize();
            const depth = new T.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new T.Quaternion()));
            out.jawDepth = +Math.abs(d.dot(depth)).toFixed(4);
            out.jawUsable = Math.abs(out.jawDot) > 0.35;
          }
          if (head && tail) {
            const fwd = new T.Vector3(1, 0, 0).applyQuaternion(g.getWorldQuaternion(new T.Quaternion()));
            out.headDot = +head.clone().sub(tail).normalize().dot(fwd).toFixed(4);
          }
          /* PECTORAL LATERALITY - the roll gate the jaw test cannot provide.
           *
           * At exactly 90 degrees of roll the jaw sits ON the view axis, so
           * jawDot still reads ~+1.0 while the shark renders in plan view.
           * That is how 8 rows on the r15 re-bakes passed this gate while
           * visibly rolled. The pectorals are never on the roll axis: they
           * are a symmetric PAIR spread along the lateral direction, which
           * for a correctly-oriented shark is screen DEPTH (camera z), not
           * screen height. So measure, in the rig's own frame, whether the
           * paired lateral spread lies along local z (correct) or local y
           * (rolled). Balance, not extent - extent picks the tall dorsal fin
           * and mis-flags correct rigs. */
          const body = p.sprite; const pts = [];
          body.traverse((o) => {
            if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
            const pos = o.geometry.attributes.position;
            const step = Math.max(1, Math.floor(pos.count / 6000));
            const inv = new T.Matrix4().copy(g.matrixWorld).invert();
            for (let i = 0; i < pos.count; i += step) {
              const v = new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
              pts.push(v);
            }
          });
          if (pts.length > 200) {
            const bb = new T.Box3(); for (const q of pts) bb.expandByPoint(q);
            const sz = bb.getSize(new T.Vector3());
            const x1 = bb.max.x - sz.x * 0.28, x0 = bb.max.x - sz.x * 0.65;
            const band = pts.filter((q) => q.x >= x0 && q.x <= x1);
            if (band.length > 40) {
              const med = (a) => { const t2 = a.slice().sort((m, n) => m - n), k = t2.length >> 1;
                return t2.length % 2 ? t2[k] : (t2[k - 1] + t2[k]) / 2; };
              const bal = (ax) => { const c = med(band.map((q) => q[ax]));
                let hi = 0, lo = 0;
                for (const q of band) { const d = q[ax] - c; if (d > hi) hi = d; if (-d > lo) lo = -d; }
                return Math.min(hi, lo) / Math.max(hi, lo || 1e-9); };
              out.balY = +bal('y').toFixed(3); out.balZ = +bal('z').toFixed(3);
              out.pectoralLateral = out.balZ > out.balY;   // true = correct
            }
          }
        }
        return out;
      });
      /* Silhouette pass.
       *
       * The in-game camera frames the shark against reef props and other
       * creatures, so a pixel measurement of "which way is the dorsal fin"
       * cannot separate shark from scenery. So render the LIVE PLAYER RIG -
       * the same object the game is driving, with the same heading, the same
       * facing flip and the same bank this frame - into an offscreen pass on
       * a plain background, from a FIXED side-on camera.
       *
       * Fixed is the whole point: r15-doc's shooter moves the camera to
       * wherever it measures the dorsal axis to be, which renders every model
       * plausibly and cannot detect a mis-orientation. Here the camera never
       * moves, so a rolled or reversed shark is measurably wrong. */
      const sil = await page.evaluate(async () => {
        const THREE = window.__RF_THREE; if (!THREE) return null;
        const p = window.RF?.Game?.ctx?.player; if (!p || !p.sprite) return null;
        const W = 420, H = 260;
        const rt = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
        rt.setPixelRatio(1); rt.setSize(W, H);
        const scene = new THREE.Scene();
        /* Pale ground so the mask is VISIBLE in the contact sheet. Alpha is
           still what the measurement reads, so the fill cannot bias it. */
        scene.background = new THREE.Color(0xeaf2f7);
        /* Flat unlit white on transparent: we want a MASK, not a beauty
           render, so lighting cannot bias the silhouette. */
        const clones = [];
        p.sprite.updateMatrixWorld(true);
        const holder = new THREE.Group();
        p.sprite.traverse((o) => {
          if (!o.isMesh || !o.visible) return;
          const g = o.geometry; if (!g || !g.attributes.position) return;
          const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x11202b }));
          /* Bake the object's CURRENT world matrix, then undo the rig's own
             world translation so the shark sits at the origin - the heading,
             the left/right flip and the bank all survive, the position does
             not (we are not testing where it swims). */
          m.applyMatrix4(o.matrixWorld);
          holder.add(m); clones.push(m);
        });
        scene.add(holder);
        holder.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(holder);
        if (box.isEmpty()) { rt.dispose(); return null; }
        const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
        holder.position.sub(c);
        /* FIXED camera on +Z looking at the origin, world +Y up. In the
           target frame this is a true side-on profile view. */
        const span = Math.max(sz.x, sz.y) * 0.62 + 1e-3;
        const cam = new THREE.OrthographicCamera(-span * (W / H), span * (W / H), span, -span, 0.01, 100000);
        cam.position.set(0, 0, Math.max(sz.z, 1) * 8 + 10);
        cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
        rt.render(scene, cam);
        const url = rt.domElement.toDataURL('image/png');
        /* Read the mask back so the measurement is done on real pixels. */
        const gl = rt.domElement;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx2 = cv.getContext('2d');
        await new Promise((res) => { const im = new Image(); im.onload = () => { ctx2.drawImage(im, 0, 0); res(); }; im.src = url; });
        const raw = ctx2.getImageData(0, 0, W, H).data;
        rt.dispose();
        /* The background is opaque now, so the mask is LUMINANCE-keyed: the
           shark is painted near-black on a pale ground, so "dark" is shark.
           Returned as a 0/255 byte per pixel. */
        const mask = new Array(W * H);
        for (let i = 0; i < W * H; i++) {
          const r = raw[i * 4], g2 = raw[i * 4 + 1], b = raw[i * 4 + 2];
          mask[i] = (0.299 * r + 0.587 * g2 + 0.114 * b) < 110 ? 255 : 0;
        }
        return { url, W, H, data: mask };
      });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${id}_${D.name}_game.png`), Buffer.from(shot.data, 'base64'));
      if (sil && sil.url) fs.writeFileSync(path.join(OUT, `${id}_${D.name}.png`), Buffer.from(sil.url.split(',')[1], 'base64'));
      for (const k of D.keys) await page.keyboard.up(k);
      row.frames[D.name] = { ...probe, sil: sil ? measure(sil) : null };
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (e) { errors.push('SHOOT ' + e.message); }
  /* A heavy textured row can crash its renderer process; closing a dead
     target throws Target.closeTarget and used to abort the whole 86-row run
     six rows in. One row failing must not cost the other 85. */
  try { await page.close(); } catch (e) { errors.push('close ' + e.message); }
  report.push(row);
  /* Checkpoint after EVERY row so a late crash never loses earlier work and
     the run can be resumed with IDS=. */
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(String(n).padStart(3), id.padEnd(18), row.started || '-', errors[0] || '');
}
try { await browser.close(); } catch (e) {}
srv.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('done rows=' + report.length);
