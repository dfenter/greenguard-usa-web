import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47751;
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
  const r=(RF.ctx&&RF.ctx.renderer)||RF.Game.renderer;
  const info=r.info;
  const pl=RF.Game.ctx&&RF.Game.ctx.player;
  const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  let top=o; while(top.parent&&top.parent.type!=='Scene')top=top.parent;
  const out={render:{calls:info.render.calls,tris:info.render.triangles},programs:r.info.programs.length};
  // list ALL cached programs and whether any contains our injected markers
  const gl=r.getContext();
  const srcOf=(pr)=>{ try{ return gl.getShaderSource(pr.fragmentShader)||''; }catch(e){ return ''; } };
  out.progHits=r.info.programs.map(pr=>{ const t=srcOf(pr); return {
    name:pr.name, used:pr.usedTimes, bytes:t.length,
    id:t.includes('rfIdCountershade'), tex:t.includes('uRfTopColor'),
    cacheKey:String(pr.cacheKey||'').slice(0,50) };});
  // the player mesh itself
  const rows=[];
  top.traverse(n=>{ if(n.isMesh||n.isSkinnedMesh){
    const m=Array.isArray(n.material)?n.material[0]:n.material;
    rows.push({node:n.name||n.type,vis:n.visible,inFrustum:n.frustumCulled,
      mat:m.name, hasProgram:!!m.program,
      progName:m.program&&m.program.name,
      version:m.version, needsUpdate:m.needsUpdate});
  }});
  out.meshes=rows;
  return JSON.stringify(out,null,1);
}));
await b.close(); server.close();
