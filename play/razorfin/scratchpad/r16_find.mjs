import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47723;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ct=/\.(js|mjs)$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream';s.writeHead(200,{'content-type':ct});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
p.on('console',m=>{const t=m.text(); if(/shark|textur|bake|glb|gltf|load|fail|error|skin/i.test(t)) console.log('CONSOLE:',t.slice(0,300));});
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,
 screenOrientation:{type:'landscapePrimary',angle:90}});
p.on('requestfailed',r=>console.log('REQFAIL',r.url().slice(-90),r.failure()&&r.failure().errorText));
p.on('response',r=>{const u=r.url(); if(/\.(glb|gltf|png|jpg|ktx2|bin)$/i.test(u)&&r.status()>=400) console.log('HTTP',r.status(),u.slice(-90));});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,6000));
await p.evaluate(()=>{if(RF.Game.selectLevel)RF.Game.selectLevel('hawaii');RF.Game.startRun('reef');});
await new Promise(r=>setTimeout(r,4000));
console.log(await p.evaluate(()=>{
  const out={};
  const pl=RF.Game.ctx&&RF.Game.ctx.player;
  out.playerKeys=pl?Object.keys(pl):null;
  const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  out.picked=o?(o.name||o.type):null;
  out.pickedFrom=pl?(pl.sprite?'sprite':pl.obj?'obj':pl.mesh?'mesh':'root'):null;
  // which of the candidate slots exist and how big is each
  for(const k of ['sprite','obj','mesh','root','rig','group','model','view']){
    const c=pl&&pl[k];
    if(c&&c.traverse){let n=0,t=0,tex=0;c.traverse(x=>{if(x.isMesh||x.isSkinnedMesh){n++;const ms=Array.isArray(x.material)?x.material:[x.material];ms.forEach(m=>{if(m.userData.rfTexturedUniforms)tex++;});t+=x.geometry&&x.geometry.attributes.position?x.geometry.attributes.position.count:0;}});
      out['slot_'+k]={meshes:n,verts:t,texMats:tex,name:c.name||c.type};}
  }
  // scan the WHOLE scene for textured/identity shark materials
  const scene=(window.RF.ctx&&window.RF.ctx.scene)||RF.Game.scene;
  let texAny=0,idAny=0,skinned=0,bigNodes=[];
  scene.traverse(x=>{
    if(x.isSkinnedMesh)skinned++;
    if(x.isMesh||x.isSkinnedMesh){
      const ms=Array.isArray(x.material)?x.material:[x.material];
      ms.forEach(m=>{if(m.userData&&m.userData.rfTexturedUniforms)texAny++;if(m.userData&&m.userData.rfIdentityUniforms)idAny++;});
      const v=x.geometry&&x.geometry.attributes.position?x.geometry.attributes.position.count:0;
      if(v>2000)bigNodes.push({name:x.name||x.type,v,vis:x.visible,skin:!!x.isSkinnedMesh});
    }});
  out.sceneTexMats=texAny; out.sceneIdMats=idAny; out.sceneSkinned=skinned;
  out.bigNodes=bigNodes.slice(0,15);
  out.templates = window.RF && RF.Shark3D ? Object.keys(RF.Shark3D) : null;
  return JSON.stringify(out,null,1);
}));
await b.close(); server.close();
