import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47731;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ct=/\.(js|mjs)$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream';
 s.writeHead(200,{'content-type':ct});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,300)));
// import each module in isolation and report the real error
const mods=['./fx3d.js','./shark3d.js','./fish3d.js','./world3d.js','./engine3d.js','./hse/skin_identity.js'];
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,3000));
for(const m of mods){
  const r=await p.evaluate(async(mm)=>{
    try{ const x=await import(mm); return 'OK keys='+Object.keys(x).slice(0,6).join(','); }
    catch(e){ return 'FAIL '+e.message.slice(0,200); }
  },m);
  console.log(m.padEnd(26),r);
}
await b.close(); server.close();
