// Rev16 evidence shot. Freezes the player pose so BEFORE and AFTER are the
// same frame, applies the axis fix at RUNTIME (the file itself is read-only
// for this lane), and measures + saves both.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root='/Users/lucille/greenguard-usa-web'; const port=47801;
const LEVEL=process.argv[2]||'hawaii';
const OUT='/Users/lucille/greenguard-usa-web/play/razorfin/hse/evidence/r16-bright';
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ext=(f.match(/\.([a-z0-9]+)$/i)||[,''])[1].toLowerCase();
 const M={js:'text/javascript',mjs:'text/javascript',html:'text/html',json:'application/json',
  glb:'model/gltf-binary',gltf:'model/gltf+json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
  webp:'image/webp',ktx2:'image/ktx2',bin:'application/octet-stream',css:'text/css',mp3:'audio/mpeg'};
 s.writeHead(200,{'content-type':M[ext]||'application/octet-stream'});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage(); p.on('pageerror',e=>console.log('PAGEERROR',e.message.slice(0,150)));
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,
 screenOrientation:{type:'landscapePrimary',angle:90}});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate((lv)=>{if(RF.Game.selectLevel)RF.Game.selectLevel(lv);RF.Game.startRun('reef');},LEVEL);
await new Promise(r=>setTimeout(r,3000));
// FREEZE the pose: pin the player flat and level so both shots frame identically.
await p.evaluate(()=>{
  const pl=RF.Game.ctx.player;
  const o=pl.sprite||pl.obj||pl.mesh||pl.root;
  let top=o; while(top.parent&&top.parent.type!=='Scene')top=top.parent;
  window.__T=top; window.__M=[];
  top.traverse(n=>{ if(n.isMesh||n.isSkinnedMesh)
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{ if(m.userData.rfIdentityUniforms) window.__M.push(m);});});
  // hold the shark level and stop it drifting
  window.__pin=setInterval(()=>{ pl.vx=0; pl.vy=0; pl.angle=0;
    if(top.rotation){ top.rotation.x=0; top.rotation.z=0; } },16);
});
await new Promise(r=>setTimeout(r,1200));
const box=await p.evaluate(()=>{ const T=window.THREE||(RF.ctx&&RF.ctx.three);
  const pl=RF.Game.ctx.player; const o=pl.sprite||pl.obj||pl.mesh||pl.root;
  const cam=(RF.ctx&&RF.ctx.camera)||RF.Game.camera;
  const bb=new T.Box3().setFromObject(o); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; const v=new T.Vector3();
  for(let i=0;i<8;i++){v.set(i&1?bb.max.x:bb.min.x,i&2?bb.max.y:bb.min.y,i&4?bb.max.z:bb.min.z);v.project(cam);
   const sx=(v.x*.5+.5)*innerWidth, sy=(1-(v.y*.5+.5))*innerHeight;
   x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);}
  return {x0,y0,x1,y1,w:innerWidth,h:innerHeight};});
fs.writeFileSync('/tmp/rf_box.json',JSON.stringify(box));
console.log('BBOX',JSON.stringify(box));
async function shot(tag){ await new Promise(r=>setTimeout(r,800));
  const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
  const buf=Buffer.from(data,'base64');
  fs.writeFileSync('/tmp/rf_a.png',buf);
  fs.writeFileSync(path.join(OUT,`${tag}-ingame-${LEVEL}.png`),buf);
  for(const sc of ['scratchpad/shark_body.py','scratchpad/shark_shade.py'])
    console.log(execFileSync('python3',[sc,'/tmp/rf_a.png','/tmp/rf_box.json',tag],
      {cwd:'/Users/lucille/greenguard-usa-web/play/razorfin',encoding:'utf8'}).trim());
}
await shot('before');
// AFTER = the two-part fix: dorsal axis +Y (skin_identity) and the engine3d
// exposure/sun that are already committed in the file.
await p.evaluate(()=>{ for(const m of window.__M){
  const u=m.userData.rfIdentityUniforms, t=m.userData.rfTexturedUniforms;
  if(u?.uRfIdBindUp?.value?.set){ u.uRfIdBindUp.value.set(0,1,0);
    if(u.uRfIdHemiBias) u.uRfIdHemiBias.value=0.30; }
  if(t?.uRfBindUp?.value?.set) t.uRfBindUp.value.set(0,1,0); }});
await shot('after');
await b.close(); server.close();
