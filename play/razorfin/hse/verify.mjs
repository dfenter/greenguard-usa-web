/* HSE lane O3: verification harness and gates.
 *
 * Proof tooling for the HSE-ification program. Everything here MEASURES; it
 * never fixes. A failure is reported with the row id and the crop path so the
 * owning lane can look at the same pixels this file scored.
 *
 * Usage, from play/razorfin/:
 *   node hse/verify.mjs                        full roster, writes verify_report.md
 *   IDS=reef,greatwhite node hse/verify.mjs    subset (fast iteration)
 *   BASELINE=hse/evidence/baseline node hse/verify.mjs   diff against a baseline
 *   OUT=<dir> node hse/verify.mjs              override evidence dir
 *
 * Why real GL and not the headless selftest: headless selftests cannot see a
 * GLSL link failure, an unmatched onBeforeCompile replace(), or a texture that
 * silently failed to decode. Every one of those ships a shark that passes
 * every node gate and renders as white plastic. The screenshot is the proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAZORFIN = path.resolve(HERE, '..');
const ROOT = path.resolve(RAZORFIN, '../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const OUT = process.env.OUT || path.join(HERE, 'evidence', 'current');
const BASELINE = process.env.BASELINE || '';
const REPORT = path.join(HERE, 'verify_report.md');

/* Viewport is the shipping target: iPhone landscape, DPR 2. Gates measured at
 * any other size are measuring a game nobody plays. */
const CSS_W = 844, CSS_H = 390, DPR = 2;

/* ---------------------------------------------------------------- gates ---
 * Thresholds are deliberately in one table so the report can print the number
 * it judged against, and so moving a gate is a visible one-line diff rather
 * than a constant buried in a branch. */
const GATES = Object.freeze({
  satFloor: 0.18,          // flank saturation floor: below this the row is grey mush in fog
  backBellyDelta: 0.06,    // countershade: belly value minus back value, 0..1
  patternContrast: 0.10,   // patterned rows: stddev of value across the flank
  distinctMin: 0.055,      // pairwise thumbnail distance floor across the roster
  eyeHighlight: true,      // a specular dot inside the head crop
  bgBleedMax: 0.02,        // fraction of body-interior pixels matching the water plate
  drawsMax: 100,
  trisMax: 55000,
  texBytesMax: 8 * 1024 * 1024, // 1K baseColor + 1K normal, RGBA8 + mips, per shark
});

const THUMB_W = 64, THUMB_H = 30;

/* -------------------------------------------------------------- roster --- */
function roster() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAZORFIN, 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
  const D = sandbox.window.RFD;
  if (!D || !Array.isArray(D.SHARKS)) throw new Error('data.js did not publish window.RFD.SHARKS');
  return D.SHARKS.map((s) => ({
    id: s.id, name: s.name, tier: s.tier, act: s.act, cls: s.cls,
    pattern: s.sil && s.sil.pattern, model: (s.sil && s.sil.model) || null,
  }));
}

/* ---------------------------------------------------------------- server --- */
const MIME = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', json: 'application/json',
  glb: 'model/gltf-binary', webp: 'image/webp',
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      fs.readFile(path.join(ROOT, p), (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

/* ------------------------------------------------------------- pixel io ---
 * PIL does the decoding. Shelling to python keeps this file free of an image
 * dependency and matches the crop-and-look workflow the program already uses. */
function py(script, args = []) {
  return execFileSync('python3', ['-c', script, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/* One python pass per shot does all the pixel work: it is far cheaper than
 * shelling out per gate, and it guarantees every gate scored the same pixels. */
const MEASURE_PY = `
import sys, json, math
import numpy as np
from scipy import ndimage
from PIL import Image

src, headOut, thumbOut = sys.argv[1], sys.argv[2], sys.argv[3]
clip = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] not in ('', 'null') else None

im = Image.open(src).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.float32)          # (H, W, 3)
out = {'size': [W, H]}

# HUD plates (score, hunger, minimap, ability button) are opaque UI in fixed
# corners and are NOT the shark. Excluded before anything is measured, or every
# row reports the same neon-on-charcoal average.
hud = np.zeros((H, W), bool)
for (x0f, y0f, x1f, y1f) in ((0,0,0.30,0.30), (0,0.72,0.28,1.0), (0.90,0.72,1.0,1.0)):
    hud[int(H*y0f):int(H*y1f), int(W*x0f):int(W*x1f)] = True

# The water plate is a fog gradient, not one flat colour: bright at the top,
# darker at the seabed, with terrain within a few units of it. A single global
# tolerance either keeps the rocks or eats the shark's dark back. Model the
# plate PER ROW as that row's median outside the HUD, which tracks the gradient
# exactly; a pixel is "shark" only if it departs from its own row's water.
# Every 4th column is plenty to estimate a row's median water colour, and it
# cuts the dominant cost of this pass by ~4x on an 1688px-wide capture.
sub = a[:, ::4, :]
subhud = hud[:, ::4]
masked = np.where(subhud[:, :, None], np.nan, sub)
rowbg = np.nanmedian(masked, axis=1)            # (H, 3)
rowbg = np.where(np.isnan(rowbg), np.nanmedian(rowbg, axis=0), rowbg)
delta = np.abs(a - rowbg[:, None, :]).sum(axis=2)
raw = (delta > 30) & (~hud)

# The engine told us where the shark projects to. Everything outside that box
# is scenery by construction, so it cannot be flood-filled into along a rock or
# kelp blade that touches the silhouette.
cx0, cy0, cx1, cy1 = 0, 0, W, H
if clip:
    cx0 = max(0, int(clip['x0'])); cy0 = max(0, int(clip['y0']))
    cx1 = min(W, int(clip['x1'])+1); cy1 = min(H, int(clip['y1'])+1)
box = np.zeros((H, W), bool)
box[cy0:cy1, cx0:cx1] = True
raw &= box

# Largest connected component inside the box is the shark.
lab, n = ndimage.label(raw)
if n == 0:
    out['empty'] = True
    print(json.dumps(out)); sys.exit(0)
sizes = ndimage.sum(raw, lab, range(1, n+1))
mask = (lab == (int(np.argmax(sizes)) + 1))

# Erode by a 4-neighbourhood so the antialiased rim, where fog and skin blend,
# does not poison the colour stats.
core = mask & ndimage.binary_erosion(mask, structure=np.array([[0,1,0],[1,1,1],[0,1,0]], bool))
if core.sum() < 400:
    out['empty'] = True; out['bodyPixels'] = int(core.sum())
    print(json.dumps(out)); sys.exit(0)

ys, xs = np.nonzero(mask)
minx, maxx, miny, maxy = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
out['bbox'] = [minx, miny, maxx, maxy]
out['bodyPixels'] = int(core.sum())
out['bodyFrac'] = float(core.sum())/(W*H)

rgb = a[core]/255.0
mx = rgb.max(axis=1); mn = rgb.min(axis=1); df = mx-mn
val = mx
sat = np.where(mx > 0, df/np.maximum(mx, 1e-6), 0.0)
r, g, b_ = rgb[:,0], rgb[:,1], rgb[:,2]
hue = np.zeros_like(mx)
nz = df > 1e-6
dfs = np.where(nz, df, 1.0)   # guard the divide; hue of a grey pixel is 0 anyway
hue = np.where(mx == r, (((g-b_)/dfs) % 6)/6.0,
      np.where(mx == g, (((b_-r)/dfs) + 2)/6.0,
                        (((r-g)/dfs) + 4)/6.0))
hue = np.where(nz, hue, 0.0)
out['satMean'] = float(sat.mean()); out['valMean'] = float(val.mean()); out['valStd'] = float(val.std())
# Circular mean hue: a plain average puts a red shark (h near 0.0 and 1.0) in
# the middle of the wheel at cyan, the exact opposite of its colour.
sx_ = float(np.cos(2*np.pi*hue).mean()); sy_ = float(np.sin(2*np.pi*hue).mean())
out['hueMean'] = (math.atan2(sy_, sx_)/(2*math.pi)) % 1.0
out['hueConc'] = math.hypot(sx_, sy_)

# Countershade: top third of the body bbox against the bottom third, over
# masked body pixels only so water above and below does not count.
# Countershade is a property of the BODY, so it is measured across the body's
# own dorsal-ventral axis, not screen vertical. A shark banked nose-down (they
# all pitch as they swim) puts tail-belly and head-back in the same screen band,
# which made the same row read +0.248 in one run and -0.074 in the next. The
# long axis comes from the pixel covariance; the perpendicular is the axis the
# countershade actually runs along, and "which end is the back" is decided by
# the darker side rather than assumed.
yy, xx = np.nonzero(core)
cxm, cym = xx.mean(), yy.mean()
dx, dy = xx-cxm, yy-cym
cov = np.cov(np.vstack([dx, dy]))
evals, evecs = np.linalg.eigh(cov)
long_ax = evecs[:, int(np.argmax(evals))]      # along the shark
perp = np.array([-long_ax[1], long_ax[0]])     # dorsal-ventral
proj = dx*perp[0] + dy*perp[1]
# Orient the perpendicular so it points DOWN-screen (+y), i.e. toward the
# belly. Taking min/max of the two sides instead would make the metric
# unsigned and every row would trivially pass, which is the opposite of a gate:
# a shark shaded the wrong way round must fail, so the sign is preserved and
# the side is chosen geometrically rather than from the answer.
if perp[1] < 0: perp = -perp
proj = dx*perp[0] + dy*perp[1]
lo_q, hi_q = np.quantile(proj, 0.25), np.quantile(proj, 0.75)
dorsal = val[proj <= lo_q]      # up-screen side of the body axis
ventral = val[proj >= hi_q]     # down-screen side
out['backVal'] = float(dorsal.mean()) if dorsal.size else 0.0
out['bellyVal'] = float(ventral.mean()) if ventral.size else 0.0
out['countershade'] = out['bellyVal'] - out['backVal']
out['csAxis'] = [float(perp[0]), float(perp[1])]

# A hole is only a hole if it is ENCLOSED. Counting each row between the first
# and last body pixel treats every concavity (the notch between head and
# pectoral fin, the gap under the tail) as see-through and scored a perfectly
# solid great white at 47%. binary_fill_holes finds what is genuinely walled in.
filled = ndimage.binary_fill_holes(mask)
holes = int((filled & ~mask).sum())
interior = int(filled.sum())
out['holePixels'] = holes; out['interiorPixels'] = interior
out['bgBleed'] = (holes/float(interior)) if interior else 0.0

# Which way the shark faces is NOT assumable, so the crop centres on the
# projected Head bone rather than on a guessed leading third.
hw = max(8, (maxx-minx+1)//3); hh = max(8, (maxy-miny+1))
if clip and clip.get('head'):
    hcx = int(clip['head']['x']); hcy = int(clip['head']['y'])
    hx0 = max(minx, hcx-hw//2); hx1 = min(maxx+1, hcx+hw//2)
    hy0 = max(miny, hcy-hh//2); hy1 = min(maxy+1, hcy+hh//2)
    if hx1-hx0 < 8 or hy1-hy0 < 8:
        hx0, hx1, hy0, hy1 = max(0, maxx-hw), maxx+1, miny, maxy+1
else:
    hx0, hx1, hy0, hy1 = max(0, maxx-hw), maxx+1, miny, maxy+1
out['headBox'] = [hx0, hy0, hx1, hy1]
head = im.crop((hx0, hy0, hx1, hy1))
head.resize((head.width*3, head.height*3), Image.LANCZOS).save(headOut)

# Eye highlight: a small bright specular dot, scored over the head crop's SHARK
# pixels only (the water is brighter than the skin here, so including it makes
# every row look like it has a highlight). Scale free, and does not assume the
# eye is white, so a red-eyed demon row still registers.
hmask = core[hy0:hy1, hx0:hx1]
harr = a[hy0:hy1, hx0:hx1]/255.0
hv = harr.max(axis=2)[hmask] if hmask.any() else np.array([0.0])
out['headMeanVal'] = float(hv.mean()); out['headMaxVal'] = float(hv.max())
bright = int((hv > hv.mean()+0.28).sum())
out['eyeHighlightPixels'] = bright
out['eyeHighlightFrac'] = bright/float(hv.size)

# Thumbnail for the distinctness matrix, cropped to the body bbox first so the
# comparison is shark-against-shark and not framing-against-framing. Water is
# neutralised to a constant so silhouette and skin drive the distance rather
# than how much ocean happened to be in the box.
comp = a.copy(); comp[~core] = np.array([20.0, 28.0, 34.0])
thumb = Image.fromarray(comp[miny:maxy+1, minx:maxx+1].astype(np.uint8)).resize((${THUMB_W}, ${THUMB_H}), Image.LANCZOS)
thumb.save(thumbOut)
out['thumb'] = (np.asarray(thumb).astype(np.float32)/255.0).reshape(-1).tolist()
print(json.dumps(out))
`;

function measure(shot, headOut, thumbOut, clip) {
  try {
    return JSON.parse(py(MEASURE_PY, [shot, headOut, thumbOut, JSON.stringify(clip || null)]));
  } catch (e) {
    return { error: String(e.message || e).split('\n').slice(-4).join(' ') };
  }
}

/* --------------------------------------------------------------- capture --- */
/* The roster does not fit in one browser session. A single page accumulating
 * 86 WebGL scenes exhausts GPU memory and Chrome dies around row 82, taking
 * the entire run with it - two hours of rendering lost to a crash in the last
 * 5%. So the browser is recycled every CHUNK rows, and each row's shot is
 * usable the moment it is written rather than only at the end. */
const CHUNK = Number(process.env.CHUNK || 12);

async function capture(ids) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'heads'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });
  const { srv, port } = await serve();
  const shots = [];
  const consoleErrors = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let attempt = 0;
    for (;;) {
      try {
        /* Hard deadline per chunk. A browser that launches but never becomes
         * usable leaves an await pending forever, which wedges the whole run
         * with no error and no output - observed as 12 shots, process alive,
         * frozen. A timeout converts that silent hang into a retryable error. */
        const budgetMs = 45000 + slice.length * 20000;
        const r = await Promise.race([
          withBrowser((register) => captureChunk(slice, port, register)),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`chunk timed out after ${Math.round(budgetMs / 1000)}s`)), budgetMs)),
        ]);
        shots.push(...r.shots);
        consoleErrors.push(...r.consoleErrors);
        break;
      } catch (e) {
        attempt++;
        const msg = String(e && e.message || e);
        if (attempt >= 2) {
          // Record the loss rather than aborting: 84 measured rows plus two
          // named failures is a far more useful report than no report.
          for (const id of slice) if (!shots.some((s) => s.id === id)) {
            shots.push({ id, shot: null, info: { ok: false, err: 'capture crashed: ' + msg.slice(0, 160) } });
          }
          consoleErrors.push(`capture chunk ${slice[0]}..${slice[slice.length-1]} failed: ${msg.slice(0, 200)}`);
          break;
        }
      }
    }
    // console.error goes to stderr, which is unbuffered when redirected, so
    // progress is visible live rather than only when the process exits.
    console.error(`  captured ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
  }
  srv.close();
  return { shots, consoleErrors };
}

async function captureChunk(ids, port, register) {
  const puppeteer = (await import('puppeteer-core')).default;

  const browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'],
  });
  if (register) register(browser);
  const page = await browser.newPage();

  /* Console errors are a gate, not decoration: a GLSL link failure surfaces
   * here and nowhere else. The service-worker scope warning is emitted by the
   * throwaway dev server, not the game, so it is filtered by exact substring
   * rather than by loosening the gate. */
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('max scope allowed')) return;
    consoleErrors.push(t.slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));

  await page.setViewport({ width: CSS_W, height: CSS_H, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: CSS_W, height: CSS_H, deviceScaleFactor: DPR, mobile: true,
    screenOrientation: { type: 'landscapePrimary', angle: 90 },
  });
  await page.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 4500));

  const shots = [];
  for (const id of ids) {
    /* The identity check is the point of this block. startRun() with an id
     * data.js does not carry, or one whose model failed to route, silently
     * falls back to another rig; the screenshot then looks fine and the whole
     * report is a lie. Reading rfPersonality.id back off the rig in the live
     * scene is what makes a fallback loud. */
    const info = await page.evaluate(async (rowId) => {
      try {
        const G = window.RF.Game;
        G.startRun(rowId);
        await new Promise((r) => setTimeout(r, 900));
        const ctx = G.ctx;
        const p = ctx.player;
        /* Determinism matters more than a dynamic pose. The procedural swim
         * wave scales its amplitude with speedFrac, so a moving shark is at a
         * different bend, roll and specular angle in every capture, and the
         * same row scored a 0.248 countershade in one run and 0.034 in the
         * next. Pinning the player at rest and holding the pose across several
         * frames lets the wave settle, so a gate measures the shark rather
         * than the frame it happened to land on. */
        p.x = 3600; p.y = 1200; p.vx = 0; p.vy = 0;
        for (let i = 0; i < 40; i++) {
          p.x = 3600; p.y = 1200; p.vx = 0; p.vy = 0;
          if (typeof p.r === 'number') p.r = 0;
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
        await new Promise((r) => setTimeout(r, 350));
        // A previous run's group can still be parented in the scene for a frame
        // or two after endRun, so "the first rig found" is not necessarily the
        // one we just started. Prefer an exact id match and fall back to the
        // first only when nothing matches, which is what makes a genuine
        // fallback still register as a mismatch instead of being papered over.
        let rigNode = null, firstNode = null;
        ctx.scene3.traverse((o) => {
          const u = o.userData;
          if (!u || !u.rfPersonality) return;
          if (!firstNode) firstNode = o;
          if (!rigNode && u.rfPersonality.id === rowId) rigNode = o;
        });
        const chosen = rigNode || firstNode;
        const rig = chosen ? {
          id: chosen.userData.rfPersonality.id,
          base: chosen.userData.rfSourceBase || null,
          propKind: chosen.userData.rfPropKind || null,
          name: chosen.name || '',
          exact: !!rigNode,
        } : null;
        // Per-row cost. renderer.info is reset each frame by three, so these
        // are this frame's real numbers for the whole scene, and the rig's own
        // share is counted separately by walking it.
        const inf = ctx.renderer.info;
        let rigDraws = 0, rigTris = 0;
        const maps = new Map();
        // Walk the rig SUBTREE. Meshes sit several levels below the group (the
        // GLB scene node, then the armature, then the skinned mesh), so a
        // parent-only check finds nothing and silently reports a 0-cost shark.
        const rigRoot = chosen;
        (rigRoot || ctx.scene3).traverse((o) => {
          if (!o.isMesh || !o.visible) return;
          if (!rigRoot) return;
          rigDraws++;
          const g = o.geometry;
          if (g) {
            const idx = g.index ? g.index.count : (g.getAttribute('position') ? g.getAttribute('position').count : 0);
            rigTris += idx / 3;
          }
          const m = o.material;
          for (const mat of (Array.isArray(m) ? m : [m])) {
            if (!mat) continue;
            for (const slot of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'metalnessMap', 'aoMap']) {
              const t = mat[slot];
              if (t && t.image && t.image.width) maps.set(t.uuid, t.image.width * t.image.height);
            }
          }
        });
        // RGBA8 plus a full mip chain is 4 bytes per texel times 4/3.
        let texBytes = 0;
        for (const texels of maps.values()) texBytes += texels * 4 * (4 / 3);
        // Where the shark actually is, in CSS pixels. Projecting the rig's own
        // world bounding box through the live camera is exact, and it is the
        // only way to keep a pixel mask from flood-filling along a rock or a
        // kelp stalk that happens to touch the silhouette. Pixel heuristics
        // guessed; this asks the engine.
        let screen = null;
        if (rigRoot) {
          const THREE = ctx.three;
          const box = new THREE.Box3().setFromObject(rigRoot);
          if (!box.isEmpty()) {
            const cam = ctx.camera;
            let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
            const v = new THREE.Vector3();
            for (let i = 0; i < 8; i++) {
              v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
              v.project(cam);
              const px2 = (v.x * 0.5 + 0.5) * window.innerWidth;
              const py2 = (-v.y * 0.5 + 0.5) * window.innerHeight;
              if (px2 < sx0) sx0 = px2; if (px2 > sx1) sx1 = px2;
              if (py2 < sy0) sy0 = py2; if (py2 > sy1) sy1 = py2;
            }
            // Which way the shark faces on screen is NOT assumable: the rigs are
            // authored nose-at--Z and the camera sees the player facing left in
            // these captures, so a "leading third" guess crops the tail and
            // every eye gate reads zero. Project the Head bone instead and let
            // the geometry say where the head is.
            let headPx = null;
            const headNames = /^(head|neck)$/i;
            let headObj = null;
            rigRoot.traverse((o) => { if (!headObj && o.isBone && headNames.test(o.name)) headObj = o; });
            if (headObj) {
              headObj.getWorldPosition(v); v.project(cam);
              headPx = { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
            }
            screen = { x0: sx0, y0: sy0, x1: sx1, y1: sy1, head: headPx, vw: window.innerWidth, vh: window.innerHeight };
          }
        }
        return {
          ok: true, rig, screen,
          sceneDraws: inf.render.calls, sceneTris: Math.round(inf.render.triangles),
          draws: rigDraws, tris: Math.round(rigTris), texBytes: Math.round(texBytes), texCount: maps.size,
        };
      } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, id);

    const shot = path.join(OUT, `shark_${id}.png`);
    const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(cap.data, 'base64'));
    shots.push({ id, shot, info });

    await page.evaluate(() => { try { window.RF.Game.endRun(); } catch (e) {} });
    await new Promise((r) => setTimeout(r, 350));
  }

  // No close() here: withBrowser's finally owns the browser's lifetime, and
  // closing it twice raced badly enough to hang a run on a chunk boundary.
  return { shots, consoleErrors };
}

/* Always reap the browser, including when the chunk throws mid-way. A leaked
 * Chrome holds its GPU allocation, so failing to close one compounds exactly
 * the memory exhaustion the chunking exists to avoid, and the retry would then
 * be more likely to die than the attempt it is retrying. */
async function withBrowser(fn) {
  let browser = null;
  try {
    return await fn((b) => { browser = b; });
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* already gone */ } }
  }
}

/* ------------------------------------------------------------ contact --- */
const SHEET_PY = `
import sys, json, math
from PIL import Image, ImageDraw
paths = json.loads(sys.argv[1]); out = sys.argv[2]
cols = 8
cw, ch = 211, 98
rows = math.ceil(len(paths)/cols)
sheet = Image.new('RGB', (cols*cw, rows*(ch+12)), (16,22,28))
d = ImageDraw.Draw(sheet)
for i,(rid, p) in enumerate(paths):
    try: im = Image.open(p).convert('RGB').resize((cw, ch), Image.LANCZOS)
    except Exception: continue
    x, y = (i%cols)*cw, (i//cols)*(ch+12)
    sheet.paste(im, (x,y))
    d.text((x+3, y+ch+1), rid[:26], fill=(210,225,235))
sheet.save(out)
print(out)
`;

function contactSheet(entries, outPath) {
  const pairs = entries.map((e) => [e.id, e.shot]);
  try { py(SHEET_PY, [JSON.stringify(pairs), outPath]); return outPath; } catch (e) { return null; }
}

/* ------------------------------------------------------------- scoring --- */
function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / a.length);
}

function grade(row, m) {
  const fails = [];
  if (!m || m.error) { fails.push(`measure failed: ${m && m.error}`); return { fails, stats: {} }; }
  if (m.empty) { fails.push('no shark in frame (body mask under 400 px) - rig did not render'); return { fails, stats: {} }; }

  if (m.satMean < GATES.satFloor) fails.push(`flank saturation ${m.satMean.toFixed(3)} < ${GATES.satFloor}`);
  if (m.countershade < GATES.backBellyDelta) fails.push(`countershade ${m.countershade.toFixed(3)} < ${GATES.backBellyDelta} (back ${m.backVal.toFixed(3)} belly ${m.bellyVal.toFixed(3)})`);

  /* Pattern contrast is only meaningful on rows that claim a pattern. A row
   * authored "plain" failing a contrast gate would be a false alarm, so the
   * gate reads the row's own data rather than assuming every shark is striped. */
  const patterned = row.pattern && row.pattern !== 'plain' && row.pattern !== 'none';
  if (patterned && m.valStd < GATES.patternContrast) {
    fails.push(`pattern "${row.pattern}" contrast ${m.valStd.toFixed(3)} < ${GATES.patternContrast}`);
  }
  if (GATES.eyeHighlight && m.eyeHighlightPixels < 3) fails.push(`no eye highlight in head crop (${m.eyeHighlightPixels} bright px)`);
  if (m.bgBleed > GATES.bgBleedMax) fails.push(`background bleeds through body at ${(m.bgBleed * 100).toFixed(2)}% > ${(GATES.bgBleedMax * 100).toFixed(2)}%`);

  return {
    fails,
    stats: {
      sat: m.satMean, val: m.valMean, hue: m.hueMean, valStd: m.valStd,
      back: m.backVal, belly: m.bellyVal, countershade: m.countershade,
      bgBleed: m.bgBleed, eyePx: m.eyeHighlightPixels, bodyFrac: m.bodyFrac,
    },
  };
}

function gradeBudget(info) {
  const fails = [];
  if (!info || !info.ok) { fails.push(`startRun failed: ${info && info.err}`); return fails; }
  if (info.draws > GATES.drawsMax) fails.push(`${info.draws} draws > ${GATES.drawsMax}`);
  if (info.tris > GATES.trisMax) fails.push(`${info.tris} tris > ${GATES.trisMax}`);
  if (info.texBytes > GATES.texBytesMax) fails.push(`${(info.texBytes / 1048576).toFixed(2)} MB textures > ${(GATES.texBytesMax / 1048576).toFixed(2)} MB`);
  return fails;
}

/* ---------------------------------------------------------------- main --- */
function fmt(n, d = 3) { return typeof n === 'number' && isFinite(n) ? n.toFixed(d) : 'n/a'; }

async function main() {
  const all = roster();
  const want = process.env.IDS ? process.env.IDS.split(',').map((s) => s.trim()).filter(Boolean) : all.map((r) => r.id);

  /* Validate every requested id against data.js before spending minutes in a
   * browser. A typo'd id would otherwise render as a fallback rig and be
   * scored as a real row. */
  const byId = new Map(all.map((r) => [r.id, r]));
  const unknown = want.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`unknown row ids (not in data.js): ${unknown.join(', ')}`);
  const rowsToRun = want.map((id) => byId.get(id));

  const started = new Date();
  const { shots, consoleErrors } = await capture(want);

  const results = [];
  for (const s of shots) {
    const row = byId.get(s.id);
    const headOut = path.join(OUT, 'heads', `head_${s.id}.png`);
    const thumbOut = path.join(OUT, 'thumbs', `thumb_${s.id}.png`);
    /* Clip rect in DEVICE pixels, padded slightly so a fin on the box edge is
     * not shaved off. Without it the flood fill escapes into scenery. */
    const sc = s.info && s.info.screen;
    let clip = null;
    if (sc) {
      const pad = 6;
      clip = {
        x0: Math.max(0, (sc.x0 - pad) * DPR), y0: Math.max(0, (sc.y0 - pad) * DPR),
        x1: (sc.x1 + pad) * DPR, y1: (sc.y1 + pad) * DPR,
        head: sc.head ? { x: sc.head.x * DPR, y: sc.head.y * DPR } : null,
      };
    }
    const m = s.shot && fs.existsSync(s.shot)
      ? measure(s.shot, headOut, thumbOut, clip)
      : { error: 'no screenshot (capture crashed for this row)' };
    const g = grade(row, m);
    const budgetFails = gradeBudget(s.info);

    /* Identity: the rig actually in the scene must be the row we asked for. */
    const idFails = [];
    const rig = s.info && s.info.rig;
    if (!rig) idFails.push('no rig with rfPersonality found in scene');
    else if (rig.id !== s.id) idFails.push(`HUD/rig identity mismatch: asked ${s.id}, scene has ${rig.id} (silent fallback)`);

    results.push({
      id: s.id, row, shot: s.shot, head: headOut, thumb: thumbOut,
      m, stats: g.stats, thumbVec: m && m.thumb,
      base: rig && rig.base, prop: rig && rig.propKind,
      draws: s.info && s.info.draws, tris: s.info && s.info.tris,
      texMB: s.info && s.info.texBytes ? s.info.texBytes / 1048576 : 0,
      fails: [...idFails, ...g.fails, ...budgetFails],
    });
  }

  /* Pairwise distinctness across the roster. O(n^2) on 64x30 thumbs is a few
   * million float ops for 86 rows, which is nothing, and it is the only gate
   * that can catch "every legendary row ended up the same purple". */
  const scored = results.filter((r) => Array.isArray(r.thumbVec));
  const pairs = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      pairs.push({ a: scored[i].id, b: scored[j].id, d: distance(scored[i].thumbVec, scored[j].thumbVec) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  const closest = pairs.slice(0, 10);
  /* Gate against EVERY pair under the floor, not just the ten the report
   * prints. Scoring only the printed slice would let an 11th-closest pair that
   * is still too similar pass purely because the table is ten rows long. */
  const resultById = new Map(results.map((r) => [r.id, r]));
  for (const p of pairs) {
    if (p.d >= GATES.distinctMin) break;   // sorted ascending, so the rest are fine
    resultById.get(p.a)?.fails.push(`too close to ${p.b} (thumb distance ${p.d.toFixed(4)} < ${GATES.distinctMin})`);
    resultById.get(p.b)?.fails.push(`too close to ${p.a} (thumb distance ${p.d.toFixed(4)} < ${GATES.distinctMin})`);
  }

  const sheet = contactSheet(results, path.join(OUT, 'contact_sheet.png'));

  /* Diff mode: a row regressed if it now fails a gate it previously passed, or
   * a stat moved by more than a visible amount. */
  let diff = null;
  if (BASELINE) {
    const bPath = path.join(BASELINE, 'results.json');
    if (fs.existsSync(bPath)) {
      const base = JSON.parse(fs.readFileSync(bPath, 'utf8'));
      const bMap = new Map((base.results || []).map((r) => [r.id, r]));
      const regressed = [], improved = [], added = [];
      for (const r of results) {
        const b = bMap.get(r.id);
        if (!b) { added.push(r.id); continue; }
        const wasOk = (b.fails || []).length === 0, nowOk = r.fails.length === 0;
        if (wasOk && !nowOk) regressed.push({ id: r.id, reason: r.fails.join('; ') });
        else if (!wasOk && nowOk) improved.push(r.id);
        else if (!wasOk && !nowOk && r.fails.length > (b.fails || []).length) {
          regressed.push({ id: r.id, reason: `new failures: ${r.fails.filter((f) => !(b.fails || []).includes(f)).join('; ')}` });
        }
        const bs = b.stats || {}, rs = r.stats || {};
        for (const k of ['sat', 'countershade', 'valStd']) {
          if (typeof bs[k] === 'number' && typeof rs[k] === 'number' && bs[k] - rs[k] > 0.08) {
            regressed.push({ id: r.id, reason: `${k} dropped ${fmt(bs[k])} -> ${fmt(rs[k])}` });
          }
        }
      }
      diff = { baseline: BASELINE, regressed, improved, added, missing: [...bMap.keys()].filter((k) => !results.some((r) => r.id === k)) };
    } else {
      diff = { baseline: BASELINE, error: 'no results.json in baseline folder' };
    }
  }

  const passCount = results.filter((r) => r.fails.length === 0).length;
  const summary = {
    when: started.toISOString(), rows: results.length, pass: passCount, fail: results.length - passCount,
    consoleErrors, gates: GATES, out: OUT, sheet, closest, diff,
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ summary, results: results.map((r) => ({ ...r, thumbVec: undefined, m: undefined })) }, null, 1));
  writeReport(summary, results, rowsToRun);
  console.log(`verify: ${passCount}/${results.length} rows pass, ${consoleErrors.length} console errors -> ${REPORT}`);
  return summary;
}

function writeReport(summary, results, rowsToRun) {
  const L = [];
  const failing = results.filter((r) => r.fails.length > 0);
  L.push('# HSE verification report (lane O3)');
  L.push('');
  L.push(`Generated ${summary.when} against ${summary.rows} rows at ${CSS_W}x${CSS_H} CSS, DPR ${DPR}, landscape.`);
  L.push('');
  L.push(`**${summary.pass}/${summary.rows} rows pass all gates. ${summary.fail} failing. ${summary.consoleErrors.length} console errors.**`);
  L.push('');
  L.push(`Evidence: \`${summary.out}\``);
  if (summary.sheet) L.push(`Contact sheet: \`${summary.sheet}\``);
  L.push('');
  L.push('## Gates');
  L.push('');
  L.push('| gate | threshold |');
  L.push('| --- | --- |');
  L.push(`| flank saturation floor | >= ${GATES.satFloor} |`);
  L.push(`| countershade (belly val - back val) | >= ${GATES.backBellyDelta} |`);
  L.push(`| pattern contrast (patterned rows only) | value stddev >= ${GATES.patternContrast} |`);
  L.push(`| pairwise thumbnail distinctness | >= ${GATES.distinctMin} |`);
  L.push('| eye highlight | >= 3 bright px in head crop |');
  L.push(`| background bleed through body | <= ${(GATES.bgBleedMax * 100).toFixed(1)}% of interior |`);
  L.push(`| draws / tris / texture bytes | <= ${GATES.drawsMax} / ${GATES.trisMax} / ${(GATES.texBytesMax / 1048576).toFixed(0)} MB |`);
  L.push('');

  if (summary.consoleErrors.length) {
    L.push('## Console errors');
    L.push('');
    for (const e of summary.consoleErrors.slice(0, 25)) L.push(`- \`${e.replace(/`/g, "'")}\``);
    L.push('');
  }

  if (summary.diff) {
    L.push('## Diff against baseline');
    L.push('');
    if (summary.diff.error) L.push(`Baseline unusable: ${summary.diff.error}`);
    else {
      L.push(`Baseline: \`${summary.diff.baseline}\``);
      L.push('');
      if (summary.diff.regressed.length) {
        L.push('**Regressed:**');
        for (const r of summary.diff.regressed) L.push(`- \`${r.id}\` ${r.reason}`);
      } else L.push('No regressions.');
      if (summary.diff.improved.length) L.push(`\nImproved: ${summary.diff.improved.map((i) => `\`${i}\``).join(', ')}`);
      if (summary.diff.added.length) L.push(`\nNew rows: ${summary.diff.added.map((i) => `\`${i}\``).join(', ')}`);
      if (summary.diff.missing.length) L.push(`\nMissing vs baseline: ${summary.diff.missing.map((i) => `\`${i}\``).join(', ')}`);
    }
    L.push('');
  }

  L.push('## Failing rows');
  L.push('');
  if (!failing.length) L.push('None.');
  else {
    L.push('Reported for the owning lane, not fixed here. Crop paths are 3x head crops.');
    L.push('');
    L.push('| row | model | failures | head crop |');
    L.push('| --- | --- | --- | --- |');
    for (const r of failing) {
      L.push(`| \`${r.id}\` | ${r.base || r.row.model || '(toon)'} | ${r.fails.join('<br>').replace(/\|/g, '/')} | \`${path.relative(RAZORFIN, r.head)}\` |`);
    }
  }
  L.push('');

  L.push('## Ten closest pairs (distinctness)');
  L.push('');
  L.push('| a | b | distance | verdict |');
  L.push('| --- | --- | --- | --- |');
  for (const p of summary.closest) {
    L.push(`| \`${p.a}\` | \`${p.b}\` | ${p.d.toFixed(4)} | ${p.d < GATES.distinctMin ? 'TOO CLOSE' : 'ok'} |`);
  }
  L.push('');

  L.push('## Per-row measurements');
  L.push('');
  L.push('| row | model | sat | hue | back | belly | c-shade | patStd | bleed | eyePx | draws | tris | texMB | verdict |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    const s = r.stats || {};
    L.push(`| \`${r.id}\` | ${r.base || r.row.model || '(toon)'} | ${fmt(s.sat)} | ${fmt(s.hue)} | ${fmt(s.back)} | ${fmt(s.belly)} | ${fmt(s.countershade)} | ${fmt(s.valStd)} | ${fmt(s.bgBleed, 4)} | ${s.eyePx ?? 'n/a'} | ${r.draws ?? 'n/a'} | ${r.tris ?? 'n/a'} | ${fmt(r.texMB, 2)} | ${r.fails.length ? 'FAIL' : 'ok'} |`);
  }
  L.push('');
  fs.writeFileSync(REPORT, L.join('\n'));
}

/* Numeric gate surface for the art3d selftest hook. Node-side only: it proves
 * the harness's own contract (gate table sane, roster complete, report fresh)
 * without needing a browser, so a broken harness fails the normal test run
 * instead of silently reporting green. */
export function __verifyGates() {
  const notes = [];
  let pass = true;
  const check = (cond, msg) => { if (cond) notes.push('ok ' + msg); else { pass = false; notes.push('FAIL ' + msg); } };

  const all = roster();
  check(all.length === 86, `roster has 86 rows (got ${all.length})`);
  check(new Set(all.map((r) => r.id)).size === all.length, 'row ids are unique');

  for (const [k, v] of Object.entries(GATES)) {
    if (typeof v === 'number') check(v > 0 && isFinite(v), `gate ${k} is a positive finite number (${v})`);
  }
  check(GATES.satFloor < 1 && GATES.backBellyDelta < 1 && GATES.patternContrast < 1, 'normalized gates stay inside 0..1');
  check(GATES.drawsMax <= 100, `draw budget ${GATES.drawsMax} <= 100`);
  check(GATES.trisMax <= 55000, `triangle budget ${GATES.trisMax} <= 55000`);
  check(THUMB_W * THUMB_H >= 1024, 'distinctness thumbnails carry enough signal');

  /* distance() is the roster-wide distinctness metric, so its own behaviour is
   * worth pinning: identical inputs must score 0 and opposite ones must not. */
  const z = new Array(64).fill(0.5);
  check(distance(z, z) === 0, 'distance of a vector with itself is 0');
  check(distance(new Array(64).fill(0), new Array(64).fill(1)) === 1, 'distance of black against white is 1');
  check(distance(z, null) === 1, 'distance against a missing vector is maximal, not 0');

  const patterned = all.filter((r) => r.pattern && r.pattern !== 'plain' && r.pattern !== 'none');
  notes.push(`ok ${patterned.length}/${all.length} rows claim a non-plain pattern and are held to the contrast gate`);

  const reportExists = fs.existsSync(REPORT);
  check(reportExists, 'verify_report.md exists (run node hse/verify.mjs to refresh)');

  return { pass, notes, gates: GATES, rows: all.length };
}

/* Rewrite verify_report.md from a saved results.json without re-rendering.
 * A subset or diff run overwrites the shared report with its own few rows, so
 * this restores the full-roster view the orchestrator reads:
 *   REPORT_FROM=hse/evidence/o3-baseline node hse/verify.mjs */
function reportFrom(dir) {
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  const results = (saved.results || []).map((r) => ({ ...r, fails: r.fails || [], stats: r.stats || {} }));
  writeReport(saved.summary, results, results);
  console.log(`verify: rewrote ${REPORT} from ${dir} (${saved.summary.pass}/${saved.summary.rows} pass)`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly && process.env.REPORT_FROM) {
  try { reportFrom(process.env.REPORT_FROM); process.exit(0); }
  catch (e) { console.error('verify: ' + (e && e.message || e)); process.exit(2); }
} else if (invokedDirectly) {
  main().then((s) => process.exit(s.fail > 0 || s.consoleErrors.length > 0 ? 1 : 0))
    .catch((e) => { console.error('verify: ' + (e && e.stack || e)); process.exit(2); });
}
