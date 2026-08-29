import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47741;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 const ct=/\.(js|mjs)$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream';
 s.writeHead(200,{'content-type':ct});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const cdp=await p.target().createCDPSession();
await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
cdp.on('Runtime.exceptionThrown',e=>{
  const d=e.exceptionDetails;
  console.log('EXC', d.text, '|', d.exception&&d.exception.description&&d.exception.description.slice(0,120));
  console.log('   url=',d.url,'line=',d.lineNumber,'col=',d.columnNumber, 'script=',d.scriptId);
});
cdp.on('Log.entryAdded',e=>{ if(e.entry.level==='error') console.log('LOG',e.entry.text.slice(0,200), e.entry.url||''); });
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,6000));
await b.close(); server.close();
