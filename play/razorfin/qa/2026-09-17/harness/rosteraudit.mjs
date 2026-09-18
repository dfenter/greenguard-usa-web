// Roster thumbnail audit. Counts how many of the 86 shark cards bake a real
// 3D thumbnail vs fall back to a monogram, and WHY (withheld/loading/error).
// Run from a dir where puppeteer-core resolves (e.g. /Users/lucille).
//   node rosteraudit.mjs
// Result 2026-09-17: 32 baked, 54 withheld, 0 loading, 0 error.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const WT = process.argv[2] || '/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa';
// IMPORTANT: serve the WORKTREE ROOT and request /play/razorfin/.
// index.html declares <base href="/play/razorfin/">, so any other rooting 404s every asset.
const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.bin':'application/octet-stream','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);let fp=path.join(WT,p);if(fp.endsWith('/'))fp=path.join(fp,'index.html');
fs.readFile(fp,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':mime[path.extname(fp)]||'application/octet-stream','Service-Worker-Allowed':'/play/'});r.end(d);});});
await new Promise(x=>srv.listen(8951,x));
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:844,height:390,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const cdp=await p.target().createCDPSession();
const orient={width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}};
await cdp.send('Emulation.setDeviceMetricsOverride',orient);
await p.goto('http://127.0.0.1:8951/play/razorfin/?unlockall=1',{waitUntil:'load',timeout:25000});
await new Promise(r=>setTimeout(r,20000));
const d=await p.evaluate(()=>{
  const sharks=(window.RFD&&window.RFD.SHARKS)||[];
  let withheld=0,loading=0,ok=0,err=0; const bad=[];
  sharks.forEach(s=>{ try{
    const rec=RF.Art3D.buildShark(s);
    if(!rec||!rec.group){err++;bad.push(s.id+':norec');return;}
    const u=rec.group.userData||{};
    if(u.rfWithheld){withheld++;bad.push(s.id+':withheld');}
    else if(u.rfLoading){loading++;bad.push(s.id+':loading');}
    else ok++;
    if(RF.Art3D.releaseShark)RF.Art3D.releaseShark(rec);
  }catch(e){err++;bad.push(s.id+':throw');} });
  return {total:sharks.length,ok,withheld,loading,err,bad};
});
console.log(`total ${d.total} | baked ${d.ok} | withheld ${d.withheld} | loading ${d.loading} | err ${d.err}`);
console.log(d.bad.join('\n'));
// NOTE: re-send the orientation override after any screenshot; puppeteer drops it.
await b.close(); srv.close();
