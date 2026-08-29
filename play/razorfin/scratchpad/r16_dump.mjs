import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47755;
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
const {src,info}=await p.evaluate(()=>{
  const r=(RF.ctx&&RF.ctx.renderer)||RF.Game.renderer; const gl=r.getContext();
  const pr=r.info.programs.find(x=>x.name&&x.name.indexOf('textured skin')>=0);
  const src=pr?gl.getShaderSource(pr.fragmentShader):'';
  // read the LIVE uniform values the program actually holds
  const glp=pr&&pr.program; const vals={};
  if(glp){
    for(const n of ['uRfIdBellyMin','uRfIdDorsalMax','uRfIdValueSpan','uRfIdHemiBias',
      'uRfIdChromaLock','uRfIdTermCenter','uRfIdTermHalf','uRfIdBakeDetail','uRfIdHasLowLum',
      'uRfCounterGain','uRfRimStrength','uRfWetness','uRfIdMicroAlbedo','uRfIdBellyWarm']){
      const loc=gl.getUniformLocation(glp,n);
      vals[n]= loc? gl.getUniform(glp,loc) : 'NO_LOCATION';
    }
  }
  return {src, info:JSON.stringify(vals,null,1)};
});
fs.writeFileSync('/tmp/rf_frag.glsl',src);
console.log('frag bytes',src.length);
console.log('LIVE UNIFORMS:',info);
await b.close(); server.close();
