// Rev16 bright bisect: toggle ONE shark-material term at a time on the live
// game and re-measure the body median. Writes /tmp/rf_a.png + /tmp/rf_box.json
// for each case so shark_body.py can score it.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const LEVEL = process.argv[2] || 'hawaii';
const root = '/Users/lucille/greenguard-usa-web';
const port = 47719;
const server = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]);
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(path.join(root, f), (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    const ext=(f.match(/\.([a-z0-9]+)$/i)||[,''])[1].toLowerCase();
    const MIME={js:'text/javascript',mjs:'text/javascript',html:'text/html',json:'application/json',
      glb:'model/gltf-binary',gltf:'model/gltf+json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
      webp:'image/webp',ktx2:'image/ktx2',bin:'application/octet-stream',wasm:'application/wasm',
      css:'text/css',svg:'image/svg+xml',mp3:'audio/mpeg',ogg:'audio/ogg'};
    s.writeHead(200, { 'content-type': MIME[ext]||'application/octet-stream' });
    s.end(d);
  });
});
await new Promise(r => server.listen(port, r));
const b = await puppeteer.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
const cdp = await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390,
  deviceScaleFactor: 2, mobile: true,
  screenOrientation: { type: 'landscapePrimary', angle: 90 } });
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 5000));
await p.evaluate((lv) => { if (RF.Game.selectLevel) RF.Game.selectLevel(lv); RF.Game.startRun('reef'); }, LEVEL);
await new Promise(r => setTimeout(r, 3000));

// Collect every material on the player rig, with its injected uniform sets.
const inv = await p.evaluate(() => {
  const pl = RF.Game.ctx && RF.Game.ctx.player;
  const o = pl && (pl.sprite || pl.obj || pl.mesh || pl.root);
  if (!o) return null;
  window.__rfMats = [];
  o.traverse(n => { if (n.isMesh||n.isSkinnedMesh) (Array.isArray(n.material)?n.material:[n.material]).forEach(m => window.__rfMats.push(m)); });
  return window.__rfMats.map(m => ({
    name: m.name, type: m.type,
    tex: !!m.userData.rfTexturedUniforms,
    id: !!m.userData.rfIdentityUniforms,
    idKeys: m.userData.rfIdentityUniforms ? Object.keys(m.userData.rfIdentityUniforms) : [],
    texKeys: m.userData.rfTexturedUniforms ? Object.keys(m.userData.rfTexturedUniforms) : []
  }));
});
console.log('MATS', JSON.stringify(inv, null, 1).slice(0, 3000));

const box = await p.evaluate(() => {
  const T = window.THREE || (window.RF.ctx && window.RF.ctx.three);
  const pl = RF.Game.ctx && RF.Game.ctx.player;
  const o = pl && (pl.sprite || pl.obj || pl.mesh || pl.root);
  const cam = (window.RF.ctx && window.RF.ctx.camera) || RF.Game.camera;
  if (!o || !cam || !T) return null;
  const bb = new T.Box3().setFromObject(o);
  if (!isFinite(bb.min.x)) return null;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; const v = new T.Vector3();
  for (let i=0;i<8;i++){ v.set(i&1?bb.max.x:bb.min.x, i&2?bb.max.y:bb.min.y, i&4?bb.max.z:bb.min.z);
    v.project(cam);
    const sx=(v.x*0.5+0.5)*window.innerWidth, sy=(1-(v.y*0.5+0.5))*window.innerHeight;
    x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy); }
  return { x0,y0,x1,y1,w:window.innerWidth,h:window.innerHeight };
});
fs.writeFileSync('/tmp/rf_box.json', JSON.stringify(box||{}));

async function measure(label) {
  await new Promise(r => setTimeout(r, 600));
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/rf_a.png', Buffer.from(data, 'base64'));
  try {
    const out = execFileSync('python3', ['scratchpad/shark_body.py','/tmp/rf_a.png','/tmp/rf_box.json',label],
      { cwd: '/Users/lucille/greenguard-usa-web/play/razorfin', encoding: 'utf8' });
    console.log(out.trim().split('\n')[0]);
  } catch (e) { console.log(label, 'MEASURE FAIL', String(e.stdout||e.message).trim()); }
}

// set a uniform on every player material that has it; returns restore fn data
async function setU(key, val) {
  return p.evaluate((k, v) => {
    const saved = [];
    for (const m of window.__rfMats) {
      for (const bag of [m.userData.rfIdentityUniforms, m.userData.rfTexturedUniforms]) {
        if (bag && bag[k]) {
          const u = bag[k];
          if (typeof u.value === 'number') { saved.push([k, u.value]); u.value = v; }
        }
      }
    }
    window.__rfSaved = window.__rfSaved || {};
    if (saved.length && !(k in window.__rfSaved)) window.__rfSaved[k] = saved[0][1];
    return saved.length;
  }, key, val);
}
async function restore(key) {
  return p.evaluate((k) => {
    const v = window.__rfSaved && window.__rfSaved[k];
    if (v === undefined) return 0;
    let n = 0;
    for (const m of window.__rfMats)
      for (const bag of [m.userData.rfIdentityUniforms, m.userData.rfTexturedUniforms])
        if (bag && bag[k]) { bag[k].value = v; n++; }
    return n;
  }, key);
}

await measure('T00_baseline');

const CASES = [
  ['uRfIdChromaLock', 0],
  ['uRfIdBellyMin', 0.50],
  ['uRfIdDorsalMax', 0.15],
  ['uRfIdValueSpan', 0],
  ['uRfIdHemiBias', 0],
  ['uRfIdBellyWarm', 0],
  ['uRfIdMicroAlbedo', 0],
  ['uRfIdGlowStrength', 0],
  ['uRfRimStrength', 0],
  ['uRfWetness', 0],
  ['uRfCounterGain', 0],
  ['uRfSaturation', 0],
];
for (const [k, v] of CASES) {
  const n = await setU(k, v);
  await measure(`T_${k}=${v}(n=${n})`);
  await restore(k);
}

// Combined: belly floor down + no chroma lock
await setU('uRfIdBellyMin', 0.50);
await measure('T_COMBO_belly0.50');
await setU('uRfIdDorsalMax', 0.10);
await measure('T_COMBO_belly0.50_dorsal0.10');

// env / exposure globals
for (const e of [1.0, 0.75, 0.5]) {
  await p.evaluate((x) => { const r=(window.RF.ctx&&window.RF.ctx.renderer)||RF.Game.renderer; if(r) r.toneMappingExposure=x; }, e);
  await measure(`T_expo=${e}`);
}
await p.evaluate(() => { const s=(window.RF.ctx&&window.RF.ctx.scene)||RF.Game.scene; if(s) s.environmentIntensity=0; });
await measure('T_envIntensity=0');

await b.close(); server.close();
