import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web'; const port=47727;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
 s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
p.on('console',m=>console.log('C['+m.type()+']',m.text().slice(0,240)));
p.on('requestfailed',r=>console.log('REQFAIL',r.url().replace(/^http:\/\/[^/]+/,''),r.failure()&&r.failure().errorText));
p.on('response',r=>{const u=r.url();if(r.status()>=400)console.log('HTTP',r.status(),u.replace(/^http:\/\/[^/]+/,''));});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,7000));
console.log('--- module state ---');
console.log(await p.evaluate(()=>JSON.stringify({
  RF:Object.keys(window.RF||{}),
  hasShark3D:!!(window.RF&&window.RF.Shark3D),
  three:!!window.THREE,
},null,1)));
await b.close(); server.close();
