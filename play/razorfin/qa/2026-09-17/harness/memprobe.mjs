// Texture/decode memory probe.
//
// Rev 2 (this gate). The prior version FAILED to enter a run: it called
// RF.UI.onDive() with no argument, which is a callback REGISTRAR
// (ui3d.js:2970: `function onDive(fn) { CB.dive = (typeof fn === 'function')
// ? fn : null; }`). Called bare, it sets CB.dive = null, so the "IN-RUN"
// sample was just a second MENU sample (both printed 6.67MB, byte
// identical, textured residency 1->1). It also summed only
// texturedBytes+rowSkinBytes, which excludes the ~5.3MB untextured base
// set and every live GPU texture/canvas byte by construction, and it
// printed 35/40 MB "caps" that do not exist anywhere in the codebase --
// the real ModelBudget.cap (hse/model_budget.js:62, TEXTURED_LRU_CAP = 3)
// is a COUNT of resident textured templates, not a byte budget.
//
// This version:
//   1. Enters a run through the real engine call, RF.Game.startRun(id)
//      (engine3d.js:3832), which is the same function the onDive callback
//      chain (ui3d.js:2345/2801) ultimately invokes and which sets
//      ctx.player (engine3d.js:1974). It then asserts RF.Game.ctx.player
//      is truthy -- the same check shark3d.js:3988 runIsLive() makes --
//      before taking the in-run sample. If the run did not start, the
//      probe FAILS LOUDLY (throws / prints IN-RUN: RUN DID NOT START and
//      exits non-zero) instead of printing a number.
//   2. Reports components separately: untextured base-set bytes (fixed,
//      admitted bytes:0 by ModelBudget, ~5.3MB per the doc comment in this
//      file's prior revision and hse/model_budget.js), textured template
//      bytes + row-skin bytes (ModelBudget-tracked), live GPU texture/
//      geometry counts from renderer.info.memory, and baked-thumbnail
//      bytes estimated from the DOM (count of .rf-thumb nodes with a
//      baked data: background * the documented 112*90*4 = 40320-byte
//      worst-case ceiling per thumb -- see ui3d.js's BAKE_BYTE_CAP
//      comment). Components are printed individually AND summed, so the
//      total is auditable.
//   3. Does not invent thresholds. TEXTURED_LRU_CAP = 3 is reported as a
//      count cap, not a byte cap. No byte budget exists in code for the
//      menu/in-run totals this probe reports, so no pass/fail line is
//      printed. The 29.8/33.7 MB historical baseline is mentioned only
//      with an explicit caveat that it was measured a different way.
//   4. Fixes the hardcoded default WT path: it previously pointed at
//      .../scratchpad/razorfin-qa, a directory that does not exist. The
//      default now matches this worktree's actual root so running with no
//      explicit path argument audits the right tree.
//
// Root/path gotcha (harness/README.md): serve WORKTREE ROOT, request
// /play/razorfin/ with trailing slash.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const WT = process.argv[2] || '/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa-fixes';
const MB = (n) => (n / (1024 * 1024)).toFixed(2);
const RUN_SHARK_ID = 'reef'; // used throughout ui3d.js/engine3d.js selftests as a known-valid id
const THUMB_W = 112, THUMB_H = 90;
const THUMB_BYTES_CEILING = THUMB_W * THUMB_H * 4; // documented worst-case per-thumb estimate (ui3d.js BAKE_BYTE_CAP comment)
const UNTEXTURED_BASE_BYTES_APPROX = 5.3 * 1024 * 1024; // per hse/model_budget.js / prior probe doc comment; base set is admitted bytes:0 by ModelBudget, this is the historical fixed-set estimate, NOT read live from code

const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.bin':'application/octet-stream','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);let fp=path.join(WT,p);if(fp.endsWith('/'))fp=path.join(fp,'index.html');
fs.readFile(fp,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':mime[path.extname(fp)]||'application/octet-stream','Service-Worker-Allowed':'/play/'});r.end(d);});});
await new Promise(x=>srv.listen(8954,x));
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:844,height:390,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const cdp=await p.target().createCDPSession();
const orient={width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}};
await cdp.send('Emulation.setDeviceMetricsOverride',orient);
await p.goto('http://127.0.0.1:8954/play/razorfin/?unlockall=1',{waitUntil:'load',timeout:25000});
await new Promise(r=>setTimeout(r,20000));
await cdp.send('Emulation.setDeviceMetricsOverride',orient); // re-send after navigation per harness gotcha

async function sample(label) {
  const d = await p.evaluate(() => {
    const art = window.RF && RF.Art3D;
    const game = window.RF && RF.Game;
    const budget = art && typeof art.modelBudget === 'function' ? art.modelBudget() : null;
    const info = game && game.renderer && game.renderer.info;
    const thumbNodes = document.querySelectorAll('.rf-thumb[data-shark]');
    let bakedThumbs = 0, monoThumbs = 0;
    thumbNodes.forEach(n => { if (n.classList.contains('rf-mono')) monoThumbs++; else if (n.style.backgroundImage && n.style.backgroundImage.indexOf('data:') >= 0) bakedThumbs++; });
    return {
      texturedBytes: budget ? budget.texturedBytes : null,
      texturedCount: budget ? budget.texturedCount : null,
      texturedCap: budget ? budget.cap : null,
      rowSkinBytes: budget ? budget.rowSkinBytes : null,
      residentKeys: budget ? budget.resident.map(r => r.key) : null,
      geometries: info ? info.memory.geometries : null,
      gpuTextures: info ? info.memory.textures : null,
      thumbTotal: thumbNodes.length,
      bakedThumbs, monoThumbs,
      hasPlayer: !!(game && game.ctx && game.ctx.player),
      heapUsed: (performance.memory && performance.memory.usedJSHeapSize) || null
    };
  });
  const modelBudgetTotal = (d.texturedBytes || 0) + (d.rowSkinBytes || 0);
  const bakedThumbBytesEst = d.bakedThumbs * THUMB_BYTES_CEILING;
  const total = UNTEXTURED_BASE_BYTES_APPROX + modelBudgetTotal + bakedThumbBytesEst;
  console.log(`${label}: hasPlayer=${d.hasPlayer}`);
  console.log(`${label} base(untextured, fixed-est)=${MB(UNTEXTURED_BASE_BYTES_APPROX)}MB`);
  console.log(`${label} texturedBytes=${MB(d.texturedBytes||0)}MB (${d.texturedCount} models, count-cap=${d.texturedCap}) rowSkinBytes=${MB(d.rowSkinBytes||0)}MB`);
  console.log(`${label} bakedThumbs=${d.bakedThumbs}/${d.thumbTotal} (mono=${d.monoThumbs}) estBytes=${MB(bakedThumbBytesEst)}MB (worst-case ${THUMB_BYTES_CEILING}B/thumb)`);
  console.log(`${label} gpu: geometries=${d.geometries} textures=${d.gpuTextures}`);
  console.log(`${label} JS heap used=${d.heapUsed ? MB(d.heapUsed) + 'MB' : 'n/a'}`);
  console.log(`${label} TOTAL (base+modelBudget+bakedThumbsEst)=${MB(total)}MB`);
  console.log(`${label} resident:`, (d.residentKeys||[]).join(','));
  return { label, ...d, modelBudgetTotal, bakedThumbBytesEst, total };
}

// 1) Menu sample: force the menu screen and let the roster bake queue drain
// so every card (including the 54 previously-withheld ones) has built its
// rig at least once by the time we measure.
await p.evaluate(() => { try { RF.UI.showMenu(); } catch (e) {} });
await p.evaluate(async () => {
  function counts() {
    const nodes = document.querySelectorAll('.rf-thumb[data-shark]');
    let baked = 0, mono = 0;
    nodes.forEach(n => { if (n.classList.contains('rf-mono')) mono++; else if (n.style.backgroundImage && n.style.backgroundImage.indexOf('data:') >= 0) baked++; });
    return { total: nodes.length, baked, mono };
  }
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 250));
    const c = counts();
    if (c.baked + c.mono >= c.total) break;
  }
});
const menuSample = await sample('MENU');

// 2) In-run sample: enter a run through the REAL engine call
// (RF.Game.startRun), the same function the UI's onDive callback chain
// ultimately invokes. onDive(fn) is a callback REGISTRAR, not a trigger --
// calling it bare (as the prior probe did) unregisters the handler instead
// of starting a run. Assert ctx.player is set before sampling; fail loudly
// if it is not, rather than silently re-sampling the menu.
await p.evaluate((id) => { try { RF.Game.startRun(id); } catch (e) { window.__rfStartRunErr = String(e && e.stack || e); } }, RUN_SHARK_ID);
await new Promise(r => setTimeout(r, 8000));
await cdp.send('Emulation.setDeviceMetricsOverride', orient); // re-send per harness gotcha

const runIsLive = await p.evaluate(() => !!(window.RF && RF.Game && RF.Game.ctx && RF.Game.ctx.player));
if (!runIsLive) {
  const err = await p.evaluate(() => window.__rfStartRunErr || null);
  console.error(`IN-RUN: RUN DID NOT START (RF.Game.ctx.player is falsy after RF.Game.startRun('${RUN_SHARK_ID}')).${err ? ' error: ' + err : ''}`);
  console.error('Refusing to print an in-run memory figure for a run that never started.');
  await b.close(); srv.close();
  process.exit(1);
}
const runSample = await sample('IN-RUN');

console.log('---');
console.log('No byte budget exists in code for the menu/in-run totals above. hse/model_budget.js '
  + 'TEXTURED_LRU_CAP = 3 is a COUNT of resident textured templates, not a byte cap -- there is no '
  + 'byte threshold anywhere in the codebase to compare these totals against.');
console.log(`menu total: ${MB(menuSample.total)} MB | in-run total: ${MB(runSample.total)} MB`);
console.log('Historical baseline 29.8 MB (menu) / 33.7 MB (in-run) is quoted for reference ONLY. '
  + 'It was measured a different way (unknown methodology, predates this component breakdown) so it '
  + 'is NOT an apples-to-apples comparison against the totals above.');
console.log(`textured template residency: menu=${menuSample.texturedCount} in-run=${runSample.texturedCount} (count cap=${runSample.texturedCap})`);

await b.close(); srv.close();
