import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47733;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ct=/\.(js|mjs)$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream';
 s.writeHead(200,{'content-type':ct});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,2000));
console.log(await p.evaluate(async()=>{
  const r=await fetch('/play/razorfin/shark3d.js',{cache:'reload'});
  const t=await r.text();
  // ask the browser to parse it and report the throw site precisely
  let err='none';
  try{ await import('data:text/javascript;base64,'+btoa(unescape(encodeURIComponent(t)))); }
  catch(e){ err=e.message; }
  const lines=t.split('\n');
  return JSON.stringify({status:r.status,ct:r.headers.get('content-type'),bytes:t.length,
    lines:lines.length, first:lines[0].slice(0,80), last:lines[lines.length-2].slice(0,80),
    importErr:err},null,1);
}));
await b.close(); server.close();
