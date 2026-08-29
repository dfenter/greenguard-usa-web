import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47747;
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
  const pl=RF.Game.ctx&&RF.Game.ctx.player;
  const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  // walk UP to the real root the renderer sees
  let top=o; while(top.parent && top.parent.type!=='Scene') top=top.parent;
  window.__rfTop=top;
  let rep=[];
  top.traverse(n=>{
    if(!(n.isMesh||n.isSkinnedMesh))return;
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{
      const fs=(m.userData&&m.userData.__rfFrag)||null;
      rep.push({mat:m.name,type:m.type,
        hasTexU:!!m.userData.rfTexturedUniforms,hasIdU:!!m.userData.rfIdentityUniforms,
        map:!!m.map, prog:!!(m.program), vcol:!!m.vertexColors,
        emissive:m.emissive&&m.emissive.getHexString(), eInt:m.emissiveIntensity,
        color:m.color&&m.color.getHexString(), rough:m.roughness, metal:m.metalness,
        envI:m.envMapIntensity, tone:m.toneMapped, tri:n.geometry.index?n.geometry.index.count/3:0});
    });
  });
  return JSON.stringify(rep,null,1);
}));
// dump the actual compiled fragment source via WebGL introspection
const src=await p.evaluate(()=>{
  const r=(RF.ctx&&RF.ctx.renderer)||RF.Game.renderer;
  const gl=r.getContext();
  const pl=RF.Game.ctx&&RF.Game.ctx.player;
  const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  let out='';
  window.__rfTop.traverse(n=>{
    if(out) return;
    if(!(n.isMesh||n.isSkinnedMesh))return;
    const m=Array.isArray(n.material)?n.material[0]:n.material;
    const prog=m.program&&m.program.program;
    if(!prog) { out='NO PROGRAM on '+m.name; return; }
    const sh=gl.getAttachedShaders(prog);
    for(const s of sh){
      const t=gl.getShaderSource(s);
      if(t.indexOf('gl_FragColor')>=0||t.indexOf('pc_fragColor')>=0) out=t;
    }
  });
  return out;
});
fs.writeFileSync('/tmp/rf_frag.glsl', src||'(none)');
console.log('FRAG bytes', (src||'').length);
for(const k of ['rf-identity applied','rfIdCountershade','uRfIdBellyMin','rfFresnel','uRfWetness','uRfTopColor','vRfLowLum','uRfIdChromaLock'])
  console.log(('has '+k).padEnd(34), (src||'').includes(k));
await b.close(); server.close();
