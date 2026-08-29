import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47737;
const served=[];
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){served.push([404,f]);s.writeHead(404);s.end();return;}
 served.push([200,f]);
 const ct=/\.(js|mjs)$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream';
 s.writeHead(200,{'content-type':ct});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,4000));
// import each dep of shark3d one at a time from the PAGE origin
const deps=['../_shared/three/GLTFLoader.js','../_shared/utils/BufferGeometryUtils.js',
 './hse/skin_identity.js','./hse/props_textured.js','./hse/rig_morph.js',
 './hse/face_textured.js','./hse/model_budget.js'];
for(const d of deps){
  const r=await p.evaluate(async(dd)=>{ try{ await import(dd); return 'OK'; }catch(e){ return 'FAIL '+e.message.slice(0,160);} },
    new URL(d,'http://127.0.0.1:'+47737+'/play/razorfin/').pathname);
  console.log(d.padEnd(42),r);
}
console.log('--- 404s ---');
console.log(served.filter(x=>x[0]===404).map(x=>x[1]).join('\n')||'(none)');
await b.close(); server.close();
