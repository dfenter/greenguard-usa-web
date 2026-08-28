/* r15-face evidence shooter.
 *
 * Renders hse/headview.html once per row and saves the head framing to PNG.
 * headview aims the camera at the EYE in a three-quarter front view, which is
 * the framing the owner's verdict is about.
 *
 * Two things this harness has to defeat, both discovered the hard way:
 *
 * 1. TEXTURED MODELS ARE DEMAND-LOADED. requestTemplate() refuses a key in
 *    TEXTURED_KEYS unless mayLoadTextured() is true, and that is only true
 *    during preload's bounded boot window or when RF.Game.ctx.player exists.
 *    A plain headview load therefore renders the LOW-POLY row - it reports
 *    rfTextured:false and frames empty water, which looks exactly like "the
 *    face code is broken" and is not. A stub RF.Game.ctx.player installed
 *    before the module runs keeps runIsLive() true for the whole page.
 *
 * 2. RF_O2_TEXTURED_FACE IS FALSE in shark3d.js, so buildTexturedFace is
 *    never called. shark3d.js is not this lane's file, so rather than edit it
 *    the server rewrites that one constant IN FLIGHT for this harness only.
 *    The working tree is never touched. FACE=0 disables the rewrite to shoot
 *    a genuine "no overlay" baseline.
 *
 *   OUT=<dir> IDS=a,b,c [FACE=0] node hse/evidence/r15-face/shoot.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT || path.join(HERE, 'before');
const ENABLE_FACE = process.env.FACE !== '0';
/* The eight rows the brief names: reef, tiger, hammerhead, the white-pointer
 * family, mako, megalodon, one god and one demon. Every id validated against
 * RFD.SHARKS before use. */
const IDS = (process.env.IDS ||
  'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',').map((s) => s.trim());

const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  png: 'image/png', jpg: 'image/jpeg', json: 'application/json', glb: 'model/gltf-binary', webp: 'image/webp' };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = f.split('.').pop();
  /* In-flight only: flip the lane O2 kill switch so the face batch actually
   * mounts. Never written back to disk. */
  /* headview.html does not expose the rig, and it is not this lane's file, so
   * the SEAT probe gets its handles by the same serving-time rewrite the kill
   * switch uses. Disk is never touched. */
  if (p.endsWith('/headview.html')) {
    let src = fs.readFileSync(f, 'utf8');
    src = src.replace("import * as THREE from 'three';",
      "import * as THREE from 'three';\nglobalThis.__RF_THREE = THREE;");
    src = src.replace('scene.add(rig.group);',
      'scene.add(rig.group);\nglobalThis.__RF_RIG = rig.group;');
    res.writeHead(200, { 'content-type': MIME.html, 'cache-control': 'no-store' });
    return res.end(src);
  }
  if (ENABLE_FACE && p.endsWith('/shark3d.js')) {
    let src = fs.readFileSync(f, 'utf8');
    const before = src;
    src = src.replace('const RF_O2_TEXTURED_FACE = false;', 'const RF_O2_TEXTURED_FACE = true;');
    if (src === before) console.warn('WARN: kill-switch line not found in shark3d.js');
    res.writeHead(200, { 'content-type': MIME.js, 'cache-control': 'no-store' });
    return res.end(src);
  }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
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
const report = [];
for (const id of IDS) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  /* Installed before any page script runs, so requestTemplate() sees a live
   * run on its very first call and admits the textured template. */
  await page.evaluateOnNewDocument((rowId) => {
    const w = window; w.RF = w.RF || {};
    /* Two stubs, both needed and for different reasons.
     *
     * runIsLive() opens the textured gate at all: without a player, every key
     * in TEXTURED_KEYS is refused and the row renders LOW-POLY, reporting
     * rfTextured:false and framing empty water.
     *
     * bootTexturedKey() then decides WHICH single textured model preload
     * fetches, and it reads RF.Meta.profile().activeShark. Without this the
     * boot key is always allRows[0] (reef), so reef was the only row that
     * ever appeared and every other row still came back untextured. */
    w.RF.Game = w.RF.Game || {}; w.RF.Game.ctx = w.RF.Game.ctx || {};
    w.RF.Game.ctx.player = w.RF.Game.ctx.player || { __rfEvidenceStub: true };
    w.RF.Meta = w.RF.Meta || {};
    w.RF.Meta.profile = () => ({ activeShark: rowId });
  }, id);
  await page.goto(`http://127.0.0.1:${port}/play/razorfin/hse/headview.html?id=${id}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 6000));
  const o2 = await page.evaluate(() => globalThis.__O2 || null);
  if (process.env.SEAT === '1') {
    const seat = await page.evaluate(() => {
      const THREE = window.__RF_THREE; if (!THREE) return 'no THREE';
      const g = window.__RF_RIG; if (!g) return 'no rig';
      let body=null, face=null;
      g.traverse(o=>{ if(o.isSkinnedMesh && o.userData.rfTexturedFace) face=o;
                      else if(o.isSkinnedMesh && !body) body=o; });
      if(!body||!face) return 'missing body/face';
      /* setFromObject on a SkinnedMesh reads BIND-POSE geometry, not the
       * skinned result, so it is useless here. Skin every vertex by hand. */
      const skinBox=(m)=>{
        const g=m.geometry, pos=g.getAttribute('position'), si=g.getAttribute('skinIndex'), sw=g.getAttribute('skinWeight');
        const bones=m.skeleton.bones;
        const bm=bones.map(b=>new THREE.Matrix4().multiplyMatrices(m.bindMatrixInverse,b.matrixWorld));
        const box=new THREE.Box3(), p=new THREE.Vector3(), o=new THREE.Vector3(), q=new THREE.Vector3();
        for(let i=0;i<pos.count;i++){
          p.fromBufferAttribute(pos,i); o.set(0,0,0); let t=0;
          for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);
            if(w<=0)continue; q.copy(p).applyMatrix4(bm[b]); o.addScaledVector(q,w); t+=w;}
          if(t>1e-6)o.multiplyScalar(1/t); else o.copy(p);
          box.expandByPoint(o.applyMatrix4(m.matrixWorld));
        }
        return box;
      };
      const bb=skinBox(body), fb=skinBox(face);
      const c=b=>b.getCenter(new THREE.Vector3());
      const bs=bb.getSize(new THREE.Vector3()).length();
      return { bodyC:c(bb).toArray().map(n=>+n.toFixed(1)),
               faceC:c(fb).toArray().map(n=>+n.toFixed(1)),
               distOverDiag:+(c(fb).distanceTo(c(bb))/bs).toFixed(3),
               faceInBody: bb.containsPoint(c(fb)),
               bodyMin:bb.min.toArray().map(n=>+n.toFixed(1)),
               bodyMax:bb.max.toArray().map(n=>+n.toFixed(1)),
               faceMin:fb.min.toArray().map(n=>+n.toFixed(1)),
               faceMax:fb.max.toArray().map(n=>+n.toFixed(1)) };
    });
    console.log('   SEAT', JSON.stringify(seat));
  }
  await page.screenshot({ path: path.join(OUT, `${id}_head.png`) });
  report.push({ id, ...(o2 || {}), errors });
  console.log(String(id).padEnd(12),
    'textured=' + (o2 ? o2.textured : '?'),
    'face=' + (o2 ? o2.faceMounted : '?'),
    'tris=' + (o2 ? o2.faceTriangles : 0),
    errors.length ? 'ERR:' + errors[0] : '');
  await page.close();
}
await browser.close(); srv.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
