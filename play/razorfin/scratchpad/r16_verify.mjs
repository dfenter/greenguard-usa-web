import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root='/Users/lucille/greenguard-usa-web'; const port=Number(process.env.PORT||47781);
const LEVEL=process.argv[2]||'hawaii';
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
await p.evaluate(()=>{ const pl=RF.Game.ctx.player; const o=pl.sprite||pl.obj||pl.mesh||pl.root;
  let top=o; while(top.parent&&top.parent.type!=='Scene')top=top.parent; window.__T=top;
  window.__M=[]; top.traverse(n=>{ if(n.isMesh||n.isSkinnedMesh)
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{ if(m.userData.rfIdentityUniforms) window.__M.push(m);});});});
const boxOf=()=>p.evaluate(()=>{ const T=window.THREE||(RF.ctx&&RF.ctx.three);
  const pl=RF.Game.ctx.player; const o=pl.sprite||pl.obj||pl.mesh||pl.root;
  const cam=(RF.ctx&&RF.ctx.camera)||RF.Game.camera;
  const bb=new T.Box3().setFromObject(o); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; const v=new T.Vector3();
  for(let i=0;i<8;i++){v.set(i&1?bb.max.x:bb.min.x,i&2?bb.max.y:bb.min.y,i&4?bb.max.z:bb.min.z);v.project(cam);
   const sx=(v.x*.5+.5)*innerWidth, sy=(1-(v.y*.5+.5))*innerHeight;
   x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);}
  return {x0,y0,x1,y1,w:innerWidth,h:innerHeight};});
async function meas(l,save){ await new Promise(r=>setTimeout(r,700));
  fs.writeFileSync('/tmp/rf_box.json',JSON.stringify(await boxOf()));
  const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
  const buf=Buffer.from(data,'base64'); fs.writeFileSync('/tmp/rf_a.png',buf);
  if(save) fs.writeFileSync(save,buf);
  for(const sc of ['scratchpad/shark_body.py','scratchpad/shark_shade.py'])
    try{ console.log(execFileSync('python3',[sc,'/tmp/rf_a.png','/tmp/rf_box.json',l],
      {cwd:'/Users/lucille/greenguard-usa-web/play/razorfin',encoding:'utf8'}).trim().split('\n')[0]); }
    catch(e){ console.log(l,'x'); } }
const fixAxis=()=>p.evaluate(()=>{ for(const m of window.__M){
  const u=m.userData.rfIdentityUniforms, t=m.userData.rfTexturedUniforms;
  if(u?.uRfIdBindUp?.value?.set){ u.uRfIdBindUp.value.set(0,1,0);
    if(u.uRfIdHemiBias) u.uRfIdHemiBias.value=0.30; }
  if(t?.uRfBindUp?.value?.set) t.uRfBindUp.value.set(0,1,0); }});
const sun=(v)=>p.evaluate((x)=>{ if(RF.Game.setSunIntensity) return RF.Game.setSunIntensity(x);
  const s=(RF.ctx&&RF.ctx.scene)||RF.Game.scene; let n=0;
  s.traverse(o=>{ if(o.isDirectionalLight && o.intensity>0.5){ o.intensity=x; n++; } }); return n; },v);
await meas('BEFORE','/tmp/r16_before.png');
await fixAxis();
await meas('AXISFIX','/tmp/r16_axisfix.png');
// enforceLightRig re-stamps intensities every frame from LIGHT_RIG, so patch
// the exported LIGHT_RIG object itself where the game exposes it.
const rig=(o)=>p.evaluate((oo)=>{
  const L=RF.Game.LIGHT_RIG; const out={};
  // the live lights, matched by their rig role via colour+position
  const s=(RF.ctx&&RF.ctx.scene)||RF.Game.scene;
  const lights=[]; s.traverse(x=>{ if(x.isDirectionalLight||x.isHemisphereLight) lights.push(x); });
  for(const k in oo){ out[k]=oo[k]; }
  window.__rigOverride=Object.assign(window.__rigOverride||{},out);
  // re-apply every frame, beating enforceLightRig
  if(!window.__rigTimer) window.__rigTimer=setInterval(()=>{
    const o2=window.__rigOverride||{};
    const sc=(RF.ctx&&RF.ctx.scene)||RF.Game.scene;
    sc.traverse(x=>{
      if(x.isHemisphereLight && o2.hemi!=null) x.intensity=o2.hemi;
      if(x.isDirectionalLight){
        const c=x.color.getHex();
        if(c===0xfff6ec && o2.sun!=null) x.intensity=o2.sun;
        else if(c===0xdfe9f5 && o2.fill!=null) x.intensity=o2.fill;
        else if(c===0xffffff && o2.rim!=null) x.intensity=o2.rim;
      }});
    if(o2.env!=null) sc.environmentIntensity=o2.env;
    const r=(RF.ctx&&RF.ctx.renderer)||RF.Game.renderer;
    if(o2.expo!=null && r) r.toneMappingExposure=o2.expo;
  },16);
  return lights.length;
},o);
// LANDING ZONE. Axis fix (skin_identity) + exposure trim (engine3d, mine).
// Sweep exposure x sun so the specular hotspot comes back with the key.
for(const [x,su] of [[0.80,1.60],[0.80,2.20],[0.80,2.60],[0.80,3.10],
                     [0.78,2.60],[0.76,2.60],[0.82,2.60],[0.84,3.10]]){
  await rig({expo:x,sun:su}); await fixAxis(); await meas(`LAND expo=${x} sun=${su}`); }
await b.close(); server.close();
