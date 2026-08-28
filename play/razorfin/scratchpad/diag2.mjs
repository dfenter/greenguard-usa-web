import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web', port=47697;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]); if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{ if(e){s.writeHead(404);s.end();return;} s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'}); s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
await cdp.send('ServiceWorker.disable').catch(()=>{});
await p.setBypassServiceWorker?.(true).catch?.(()=>{});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>{ RF.Game.selectLevel&&RF.Game.selectLevel("hawaii"); RF.Game.startRun("reef"); });
await new Promise(r=>setTimeout(r,2500));
console.log(JSON.stringify(await p.evaluate(()=>({
  body: document.body.innerText.slice(0,200),
  calls: RF.Game.renderer?.info?.render?.calls
})),null,2));
const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync('/tmp/diag2.png',Buffer.from(data,'base64'));
await b.close(); server.close();
