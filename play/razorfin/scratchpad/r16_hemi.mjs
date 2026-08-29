import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root='/Users/lucille/greenguard-usa-web'; const port=47759;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ext=(f.match(/\.([a-z0-9]+)$/i)||[,''])[1].toLowerCase();
 const M={js:'text/javascript',mjs:'text/javascript',html:'text/html',json:'application/json',
  glb:'model/gltf-binary',gltf:'model/gltf+json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
  webp:'image/webp',ktx2:'image/ktx2',bin:'application/octet-stream',css:'text/css'};
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
await p.evaluate(()=>{if(RF.Game.selectLevel)RF.Game.selectLevel('hawaii');RF.Game.startRun('reef');});
await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>{
  const pl=RF.Game.ctx&&RF.Game.ctx.player; const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  let top=o; while(top.parent&&top.parent.type!=='Scene')top=top.parent;
  window.__M=[]; top.traverse(n=>{ if(n.isMesh||n.isSkinnedMesh)
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{ if(m.userData.rfIdentityUniforms) window.__M.push(m); }); });
  return window.__M.length;
});
const box=await p.evaluate(()=>{
  const T=window.THREE||(RF.ctx&&RF.ctx.three);
  const pl=RF.Game.ctx&&RF.Game.ctx.player; const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  const cam=(RF.ctx&&RF.ctx.camera)||RF.Game.camera;
  const bb=new T.Box3().setFromObject(o); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; const v=new T.Vector3();
  for(let i=0;i<8;i++){v.set(i&1?bb.max.x:bb.min.x,i&2?bb.max.y:bb.min.y,i&4?bb.max.z:bb.min.z);v.project(cam);
   const sx=(v.x*.5+.5)*innerWidth, sy=(1-(v.y*.5+.5))*innerHeight;
   x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);}
  return {x0,y0,x1,y1,w:innerWidth,h:innerHeight};});
fs.writeFileSync('/tmp/rf_box.json',JSON.stringify(box));
async function meas(l){await new Promise(r=>setTimeout(r,600));
  const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/rf_a.png',Buffer.from(data,'base64'));
  try{console.log(execFileSync('python3',['scratchpad/shark_body.py','/tmp/rf_a.png','/tmp/rf_box.json',l],
    {cwd:'/Users/lucille/greenguard-usa-web/play/razorfin',encoding:'utf8'}).trim().split('\n')[0]);}catch(e){console.log(l,'FAIL');}}
const set=(o)=>p.evaluate((oo)=>{for(const m of window.__M){const u=m.userData.rfIdentityUniforms;
  for(const k in oo) if(u[k]) u[k].value=oo[k];}},o);
await meas('F_baseline_axis(0,-1,0)_hemi-0.30');

// THE TEST: flip the measured dorsal axis to +Y and set hemiBias from it.
const flip=(sign)=>p.evaluate((sg)=>{
  for(const m of window.__M){
    const u=m.userData.rfIdentityUniforms;
    if(u&&u.uRfIdBindUp&&u.uRfIdBindUp.value&&u.uRfIdBindUp.value.set){
      u.uRfIdBindUp.value.set(0,sg,0);
      if(u.uRfIdHemiBias) u.uRfIdHemiBias.value = sg*0.30;
    }
    const t=m.userData.rfTexturedUniforms;
    if(t&&t.uRfBindUp&&t.uRfBindUp.value&&t.uRfBindUp.value.set) t.uRfBindUp.value.set(0,sg,0);
  }
},sign);
await flip(1);  await meas('F_axis(0,+1,0)_hemi+0.30');
// with the axis correct, sweep the band back toward the authored intent
const set2=(o)=>p.evaluate((oo)=>{for(const m of window.__M){const u=m.userData.rfIdentityUniforms;
  for(const k in oo) if(u&&u[k]) u[k].value=oo[k];}},o);
await set2({uRfIdHemiBias:0});   await meas('F_axis+Y_hemi0');
await set2({uRfIdHemiBias:0.30}); await meas('F_axis+Y_hemi+0.30');
for(const [d,bl] of [[0.15,0.93],[0.15,0.80],[0.18,0.72],[0.22,0.68]]){
  await set2({uRfIdDorsalMax:d,uRfIdBellyMin:bl}); await meas(`F_axis+Y_d${d}_b${bl}`); }
await b.close(); server.close();
