import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47721;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage(); p.on('pageerror',e=>console.log('PAGEERROR',e.message));
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,
 screenOrientation:{type:'landscapePrimary',angle:90}});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>{if(RF.Game.selectLevel)RF.Game.selectLevel('hawaii');RF.Game.startRun('reef');});
await new Promise(r=>setTimeout(r,3000));
console.log(await p.evaluate(()=>{
  const pl=RF.Game.ctx&&RF.Game.ctx.player;
  const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  const rows=[];
  o.traverse(n=>{
    if(!n.isMesh&&!n.isSkinnedMesh)return;
    const ms=Array.isArray(n.material)?n.material:[n.material];
    ms.forEach(m=>rows.push({node:n.name,vis:n.visible,skinned:!!n.isSkinnedMesh,
      mat:m.name,type:m.type,tex:!!m.userData.rfTexturedUniforms,id:!!m.userData.rfIdentityUniforms,
      map:!!m.map, vcol:!!m.vertexColors, emissive:m.emissive?m.emissive.getHexString():null,
      eInt:m.emissiveIntensity, color:m.color?m.color.getHexString():null,
      transparent:m.transparent, opacity:m.opacity, envI:m.envMapIntensity,
      rough:m.roughness, metal:m.metalness, tri:n.geometry?n.geometry.index?n.geometry.index.count/3:n.geometry.attributes.position.count/3:0}));
  });
  return JSON.stringify(rows,null,1);
}));
await b.close(); server.close();
