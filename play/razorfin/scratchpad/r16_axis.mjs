import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47771;
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
console.log(await p.evaluate(()=>{
  const T=window.THREE||(RF.ctx&&RF.ctx.three);
  const pl=RF.Game.ctx&&RF.Game.ctx.player; const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  let top=o; while(top.parent&&top.parent.type!=='Scene')top=top.parent;
  const out=[];
  top.traverse(n=>{ if(!(n.isMesh||n.isSkinnedMesh))return;
    const m=Array.isArray(n.material)?n.material[0]:n.material;
    const u=m.userData&&m.userData.rfIdentityUniforms; if(!u)return;
    n.updateMatrixWorld(true);
    const bindUp=u.uRfIdBindUp.value.clone();
    const worldUp=bindUp.clone().transformDirection(n.matrixWorld);
    // where does the DORSAL FIN actually sit? use the top of the bbox in world space
    const bb=new T.Box3().setFromObject(n);
    out.push({mat:m.name,
      bindUp:bindUp.toArray().map(x=>+x.toFixed(3)),
      worldUp:worldUp.toArray().map(x=>+x.toFixed(3)),
      hemiBias:+ (Math.max(-1,Math.min(1,worldUp.y))*0.30).toFixed(3),
      liveHemi:u.uRfIdHemiBias.value,
      extent:u.uRfIdBindUpExtent.value,
      measured:m.userData.rfIdentityMeasuredBindUp,
      bbox:{min:bb.min.toArray().map(x=>+x.toFixed(2)),max:bb.max.toArray().map(x=>+x.toFixed(2))},
      rot:[n.rotation.x,n.rotation.y,n.rotation.z].map(x=>+x.toFixed(3)),
      parentRot:[top.rotation.x,top.rotation.y,top.rotation.z].map(x=>+x.toFixed(3)),
      scale:top.scale.toArray().map(x=>+x.toFixed(3)),
      srcBase:(()=>{for(let k=n;k;k=k.parent){if(k.userData&&k.userData.rfSourceBase)return k.userData.rfSourceBase;}return '(none)';})(),
      defId:RF.Game.ctx.player.defId, hasLowLum:!!n.geometry.getAttribute('rfLowLum')});
  });
  return JSON.stringify(out,null,1);
}));
await b.close(); server.close();
