import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root='/Users/lucille/greenguard-usa-web'; const port=47763;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ext=(f.match(/\.([a-z0-9]+)$/i)||[,''])[1].toLowerCase();
 const M={js:'text/javascript',mjs:'text/javascript',html:'text/html',json:'application/json',
  glb:'model/gltf-binary',gltf:'model/gltf+json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
  webp:'image/webp',ktx2:'image/ktx2',bin:'application/octet-stream',css:'text/css'};
 s.writeHead(200,{'content-type':M[ext]||'application/octet-stream'});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const TERM=process.argv[2]||'none';
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage(); p.on('pageerror',e=>console.log('PAGEERROR',e.message.slice(0,150)));
// Inject a debug hook BEFORE the modules run: wrap onBeforeCompile on the
// textured shark material so we can emit a chosen term as the final colour.
await p.evaluateOnNewDocument((term)=>{
  window.__RF_TERM=term;
  const patch = {
    diffuse:'outgoingLight = totalDiffuse;',
    specular:'outgoingLight = totalSpecular;',
    emissive:'outgoingLight = totalEmissiveRadiance;',
    albedo:'outgoingLight = diffuseColor.rgb;',
    irradiance:'outgoingLight = vec3(0.0);',
  }[term];
  if(!patch) return;
  const hook=()=>{
    const T=window.THREE; if(!T||!T.MeshStandardMaterial) return false;
    const P=T.MeshStandardMaterial.prototype;
    const d=Object.getOwnPropertyDescriptor(P,'onBeforeCompile');
    return true;
  };
  // simplest: monkeypatch WebGLProgram source via ShaderChunk is fragile, so
  // instead patch every material after the fact from the page (done below).
},TERM);
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,
 screenOrientation:{type:'landscapePrimary',angle:90}});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>{if(RF.Game.selectLevel)RF.Game.selectLevel('hawaii');RF.Game.startRun('reef');});
await new Promise(r=>setTimeout(r,3000));
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
// Force a recompile with the term patch by chaining onBeforeCompile + needsUpdate
const n=await p.evaluate((term)=>{
  const patch={diffuse:'outgoingLight = totalDiffuse;',
    specular:'outgoingLight = totalSpecular;',
    emissive:'outgoingLight = totalEmissiveRadiance;',
    albedo:'outgoingLight = diffuseColor.rgb;'}[term];
  const pl=RF.Game.ctx&&RF.Game.ctx.player; const o=pl&&(pl.sprite||pl.obj||pl.mesh||pl.root);
  let top=o; while(top.parent&&top.parent.type!=='Scene')top=top.parent;
  let c=0;
  top.traverse(nd=>{ if(!(nd.isMesh||nd.isSkinnedMesh))return;
    (Array.isArray(nd.material)?nd.material:[nd.material]).forEach(m=>{
      if(!m.userData.rfTexturedUniforms)return;
      if(patch){ const prev=m.onBeforeCompile;
        m.onBeforeCompile=(sh,r)=>{ if(prev)prev(sh,r);
          sh.fragmentShader=sh.fragmentShader.replace(
            'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
            patch+'\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );'); };
        m.customProgramCacheKey=()=>'rfterm-'+term;
        m.needsUpdate=true;
        m.version++;
        const r=(RF.ctx&&RF.ctx.renderer)||RF.Game.renderer;
        try{ r.properties.remove(m); }catch(e){}
        try{ r.info.programs.length && r.programCache && r.programCache.dispose(); }catch(e){}
      }
      c++; });});
  return c;
},TERM);
await new Promise(r=>setTimeout(r,2500));
const chk=await p.evaluate(()=>{
  const r=(RF.ctx&&RF.ctx.renderer)||RF.Game.renderer; const gl=r.getContext();
  const hits=r.info.programs.filter(x=>{try{return gl.getShaderSource(x.fragmentShader).includes('uRfTopColor');}catch(e){return false;}});
  return hits.map(x=>{const t=gl.getShaderSource(x.fragmentShader);
    return {used:x.usedTimes,bytes:t.length,
      patched:/outgoingLight = (totalSpecular|totalDiffuse|totalEmissiveRadiance|diffuseColor\.rgb);/.test(t),
      key:String(x.cacheKey||'').slice(0,40)};});
});
console.log('PROGCHK',JSON.stringify(chk));
const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync('/tmp/rf_a.png',Buffer.from(data,'base64'));
fs.writeFileSync(`/tmp/rf_term_${TERM}.png`,Buffer.from(data,'base64'));
console.log(execFileSync('python3',['scratchpad/shark_body.py','/tmp/rf_a.png','/tmp/rf_box.json','TERM_'+TERM],
  {cwd:'/Users/lucille/greenguard-usa-web/play/razorfin',encoding:'utf8'}).trim().split('\n')[0], `(mats=${n})`);
await b.close(); server.close();
