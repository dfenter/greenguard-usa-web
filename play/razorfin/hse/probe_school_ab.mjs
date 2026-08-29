// Rev15 lane FISH2: fixed-camera visual A/B of a prey school with the player
// held OFF it. Spawns a school in open water, parks the player far outside the
// flee radius, pins the camera on the school's centroid, and shoots a strip.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/Users/lucille/greenguard-usa-web';
const tag = process.argv[2] || 'after';
const dir = path.join(root, 'play/razorfin/hse/evidence/r15-fish2');
fs.mkdirSync(dir, { recursive: true });
const port = Number(process.env.PORT || 47755);
const types = { '.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.json':'application/json','.css':'text/css' };
const server = http.createServer((rq, rs) => {
  let f = decodeURIComponent(rq.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  if (f.endsWith('sw.js')) { rs.writeHead(404); rs.end(); return; }
  fs.readFile(path.join(root, f), (e, d) => { if (e) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); rs.end(d); });
});
await new Promise((r) => server.listen(port, r));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion',
    '--run-all-compositor-stages-before-draw','--disable-new-content-rendering-timeout'] });
const page = await browser.newPage();
const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error('sw off')); } catch (e) {} }
  try { Object.defineProperty(screen, 'orientation', { configurable: true,
      value: { type: 'landscape-primary', angle: 90, addEventListener() {}, removeEventListener() {} } }); } catch (e) {}
});
await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load' });
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='DIVE'&&x.offsetParent!==null); if(b)b.click(); });
  await new Promise(r => setTimeout(r, 1200));
  const running = await page.evaluate(() => { const S=window.RF.World.__state; let n=0; if(S&&S.instancedPrey) for(const b of S.instancedPrey) n+=(b&&b.count)||0; return n; });
  if (running > 0) break;
}
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => {
  const kit = window.RF.Game.kit;
  if (kit) { kit.paused = false; Object.defineProperty(kit,'paused',{get:()=>false,set:()=>{},configurable:true}); }
  Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
  Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});
});
// Spawn ONE school near the player, then park the player far off and pin the
// camera on the school so the strip always frames the formation itself.
const info = await page.evaluate(() => {
  const W = window.RF.World, S = W.__state;
  const pl = (window.RF.Game.ctx && window.RF.Game.ctx.player) || S.player || null;
  const px = pl ? pl.x : S.w*0.5, py = pl ? pl.y : S.h*0.5;
  const sx = px + 700, sy = py - 200;
  const n = W.spawnBurst('minnow', sx, sy, 12);
  const parkX = Math.max(200, sx - 3400), parkY = Math.min(S.h-200, sy + 1900);
  if (pl) { pl.x = parkX; pl.y = parkY; pl.vx = 0; pl.vy = 0; window.__pl = pl; window.__park={x:parkX,y:parkY}; }
  // hold the player parked every step
  const orig = W.update;
  W.update = function(ctx){ if(window.__pl){window.__pl.x=window.__park.x;window.__pl.y=window.__park.y;window.__pl.vx=0;window.__pl.vy=0;} return orig.apply(this,arguments); };
  return { n, sx, sy, parkX, parkY };
});
console.log('SPAWN', JSON.stringify(info));
// let the school settle into formation
await new Promise(r => setTimeout(r, 4000));
// Pin the camera on the school centroid each frame (three y is UP, sim y DOWN).
await page.evaluate(() => {
  const S = window.RF.World.__state;
  function centroid(){ let x=0,y=0,n=0; for(const e of S.entities){ if(e.active&&e.kind==='prey'&&e.st&&e.st.packId){x+=e.x;y+=e.y;n++;} } return n?{x:x/n,y:y/n,n}:null; }
  // The engine rewrites the camera every rendered frame (it follows the
  // player), so a setInterval pin loses the race. Pin on rAF AFTER the engine
  // has written, and hold the pin by re-applying it every animation frame.
  window.__pinOn = true;
  const cam = window.RF.Game.ctx && window.RF.Game.ctx.camera;
  window.__camZ = 420;   // close enough that a minnow school fills the frame
  (function pinLoop(){
    if (!window.__pinOn) return;
    const c = centroid();
    if (c && cam && cam.position) {
      cam.position.set(c.x, -c.y, window.__camZ);
      cam.lookAt(c.x, -c.y, 0);
      cam.updateMatrixWorld(true);
    }
    requestAnimationFrame(pinLoop);
  })();
});
await new Promise(r => setTimeout(r, 800));
const shots = [];
for (let i = 0; i < 6; i++) { shots.push(await page.screenshot({ encoding: 'base64' })); await new Promise(r => setTimeout(r, 380)); }
shots.forEach((s,i)=>fs.writeFileSync(path.join(dir, `ab-${tag}-${i}.png`), Buffer.from(s,'base64')));
const spread = await page.evaluate(() => {
  const S = window.RF.World.__state; const out=[];
  for(const e of S.entities){ if(e.active&&e.kind==='prey'&&e.st&&e.st.packId) out.push({x:e.x,y:e.y,r:e.r}); }
  return out;
});
console.log(JSON.stringify({ tag, shots: shots.length, live: spread.length, logs: logs.slice(0,5) }));
await browser.close(); server.close(); process.exit(0);
