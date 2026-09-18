// Texture/decode memory probe. There is no memprobe.mjs at HEAD (see
// README.md); this one follows the pattern described in the QA brief:
// budget total canvas+texture bytes, sample at the menu and during a run.
//
// Two components, summed:
//   1. Art3D.modelBudget().texturedBytes + rowSkinBytes -- the decoded GLB
//      texture budget this session's ModelBudget (hse/model_budget.js)
//      tracks and caps. The low-poly base set is NOT counted here (it is
//      textured:false, bytes:0 in the budget, ~5.3 MB fixed, never evicted,
//      matches the historical 29.8 MB baseline math: base set is outside
//      the "menu/in-run" figure the QA brief tracks against TEXTURED models).
//   2. renderer.info.memory reported geometries/textures count, used only
//      as a corroborating signal (three.js does not expose decoded bytes
//      per GPU texture, so it cannot replace the ModelBudget figure).
//
// Root/path gotcha (harness/README.md): serve WORKTREE ROOT, request
// /play/razorfin/ with trailing slash.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const WT = process.argv[2] || '/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa';
const MB = (n) => (n / (1024 * 1024)).toFixed(2);

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

async function sample(label) {
  const d = await p.evaluate(() => {
    const art = window.RF && RF.Art3D;
    const game = window.RF && RF.Game;
    const budget = art && typeof art.modelBudget === 'function' ? art.modelBudget() : null;
    const info = game && game.renderer && game.renderer.info;
    return {
      texturedBytes: budget ? budget.texturedBytes : null,
      texturedCount: budget ? budget.texturedCount : null,
      rowSkinBytes: budget ? budget.rowSkinBytes : null,
      residentKeys: budget ? budget.resident.map(r => r.key) : null,
      geometries: info ? info.memory.geometries : null,
      textures: info ? info.memory.textures : null
    };
  });
  const total = (d.texturedBytes || 0) + (d.rowSkinBytes || 0);
  console.log(`${label}: texturedBytes=${MB(d.texturedBytes||0)}MB (${d.texturedCount} models) rowSkinBytes=${MB(d.rowSkinBytes||0)}MB total=${MB(total)}MB | gpu geometries=${d.geometries} textures=${d.textures}`);
  console.log(`${label} resident:`, (d.residentKeys||[]).join(','));
  return { label, texturedBytes: d.texturedBytes||0, rowSkinBytes: d.rowSkinBytes||0, total, geometries: d.geometries, textures: d.textures };
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

// 2) In-run sample: start a run (dive) and let world3d spawn NPCs so the
// textured LRU actually fills toward its real worst case (player + NPC
// families), then measure again.
await p.evaluate(() => { try { if (RF.UI.onDive) RF.UI.onDive(); } catch (e) {} });
await new Promise(r => setTimeout(r, 8000));
const runSample = await sample('IN-RUN');

console.log('---');
console.log(`menu total: ${MB(menuSample.total)} MB (cap 35 MB, baseline 29.8 MB)`);
console.log(`in-run total: ${MB(runSample.total)} MB (cap 40 MB, baseline 33.7 MB)`);
console.log(`menu OK: ${menuSample.total <= 35 * 1024 * 1024}`);
console.log(`in-run OK: ${runSample.total <= 40 * 1024 * 1024}`);

await b.close(); srv.close();
