// Measure the PLAYER SHARK's median luminance in a live frame.
//
// Classifies shark pixels exactly by rendering the same frame TWICE -- once
// with the player rig visible, once hidden -- and diffing. That avoids any
// colour-range heuristic, which would beg the very question being asked
// (a bleached shark and bright water are the same colour).
//
// Usage, from play/razorfin/:
//   node scratchpad/shark_lum.mjs [TAG] [LEVEL]
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TAG = process.argv[2] || 'after';
const LEVEL = process.argv[3] || 'hawaii';
const OUT = '/Users/lucille/greenguard-usa-web/play/razorfin/hse/evidence/r15-water2';
fs.mkdirSync(OUT, { recursive: true });
const root = '/Users/lucille/greenguard-usa-web';
const port = 47713;

const server = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]);
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(path.join(root, f), (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    // Rev 16: serve REAL MIME types. Serving .glb/.png as text/html made the
    // GLTFLoader and the texture decode fail silently, so this rig was
    // measuring an untextured white placeholder shark, not the game's shark.
    const ext = (f.match(/\.([a-z0-9]+)$/i) || [,''])[1].toLowerCase();
    const MIME = { js:'text/javascript', mjs:'text/javascript', html:'text/html',
      json:'application/json', glb:'model/gltf-binary', gltf:'model/gltf+json',
      png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp',
      ktx2:'image/ktx2', bin:'application/octet-stream', wasm:'application/wasm',
      css:'text/css', svg:'image/svg+xml', mp3:'audio/mpeg', ogg:'audio/ogg' };
    s.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    s.end(d);
  });
});
await new Promise(r => server.listen(port, r));

const b = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--mute-audio', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
const cdp = await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
  screenOrientation: { type: 'landscapePrimary', angle: 90 },
});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 5000));
await p.evaluate((lv) => {
  if (RF.Game.selectLevel) RF.Game.selectLevel(lv);
  RF.Game.startRun('reef');
}, LEVEL);
await new Promise(r => setTimeout(r, 3000));

// FREEZE THE WORLD before diffing. Without this the diff catches every
// animated thing in the frame (schools, bubbles, shafts, caustics) and the
// "shark" mask ends up spanning the whole viewport -- which is exactly what
// the first run of this probe reported. Pausing the run stops the fixed-step
// update, so the only difference between the two captures is the rig itself.
const setRig = (vis) => p.evaluate((v) => {
  const pl = RF.Game.ctx && RF.Game.ctx.player;
  const o = pl && (pl.sprite || pl.obj || pl.mesh || pl.root);
  if (o) { o.visible = v; return true; }
  return false;
}, vis);

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64');
  if (name) fs.writeFileSync(path.join(OUT, name), buf);
  return buf;
};

// The shark's SCREEN-SPACE bbox, projected from its own rig geometry through
// the live camera. This replaces the with/without-rig diff entirely: the diff
// approach needs a frozen world, engine3d's pause flag is a closure variable
// with no accessor, and every animated layer in the frame otherwise lands in
// the mask (the first two runs classified the whole viewport as shark).
// Projecting the rig is exact and needs nothing paused.
const box = await p.evaluate(() => {
  const T = window.THREE || (window.RF.ctx && window.RF.ctx.three);
  const pl = RF.Game.ctx && RF.Game.ctx.player;
  const o = pl && (pl.sprite || pl.obj || pl.mesh || pl.root);
  const cam = (window.RF.ctx && window.RF.ctx.camera) || RF.Game.camera;
  if (!o || !cam || !T) return null;
  const bb = new T.Box3().setFromObject(o);
  if (!isFinite(bb.min.x)) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const v = new T.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? bb.max.x : bb.min.x,
          i & 2 ? bb.max.y : bb.min.y,
          i & 4 ? bb.max.z : bb.min.z);
    v.project(cam);
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (1 - (v.y * 0.5 + 0.5)) * window.innerHeight;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x0, y0, x1, y1, w: window.innerWidth, h: window.innerHeight };
});
console.log('BBOX', JSON.stringify(box));

// Optional runtime EXPOSURE override (no file edit). enforceLightRig
// re-stamps light intensities every frame from a closure variable, so the
// lights cannot be pinned from the page; the renderer's toneMappingExposure
// is only written on init and on context restore, so it CAN be. Exposure is a
// global multiplier, which is exactly the point here: if dropping it brings
// the shark into range, the frame is over-exposed at the rig, not tinted by
// any layer this lane draws.
const EXPO = process.env.EXPO ? Number(process.env.EXPO) : 0;
if (EXPO > 0) {
  await p.evaluate((e) => {
    const r = (window.RF.ctx && window.RF.ctx.renderer) || RF.Game.renderer;
    if (r) r.toneMappingExposure = e;
  }, EXPO);
  await new Promise(r => setTimeout(r, 700));
}
const withShark = await shot(`${TAG}-lum-${LEVEL}.png`);
fs.writeFileSync('/tmp/rf_a.png', withShark);
fs.writeFileSync('/tmp/rf_box.json', JSON.stringify(box || {}));
console.log('wrote /tmp/rf_a.png + /tmp/rf_box.json');
await b.close();
server.close();
