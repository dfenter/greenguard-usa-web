import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const TAG=process.argv[2]||'before';
const MODE=process.argv[3]||'depths';
const OUT='/Users/lucille/greenguard-usa-web/play/razorfin/hse/evidence/r15-water2';
fs.mkdirSync(OUT,{recursive:true});
const root='/Users/lucille/greenguard-usa-web', port=47688;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]); if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{ if(e){s.writeHead(404);s.end();return;} s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'}); s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,5000));
const shot=async n=>{const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(OUT,`${n}.png`),Buffer.from(data,'base64'));};
const swimTo=y=>p.evaluate(async yy=>{const pl=RF.Game.ctx.player; const st=(yy-pl.y)/30;
  for(let i=0;i<30;i++){pl.y+=st; pl.vx=120; pl.vy=st*4; await new Promise(r=>setTimeout(r,40));} pl.vy=0;},y);
const calls={};
if(MODE==='depths'){
  await p.evaluate(()=>{RF.Game.selectLevel&&RF.Game.selectLevel('hawaii'); RF.Game.startRun('reef');});
  await new Promise(r=>setTimeout(r,2500));
  for(const [n,y] of [['surface',180],['shelf',260],['mid',1800],['abyss',4100]]){
    await swimTo(y); await new Promise(r=>setTimeout(r,1800));
    await shot(`${TAG}-${n}`);
    calls[n]=await p.evaluate(()=>RF.Game.renderer?.info?.render?.calls);
  }
}else{
  const levels=await p.evaluate(()=>RFD.LEVELS.map(l=>l.id));
  for(const id of levels){
    await p.evaluate(l=>{try{RF.Game.endRun&&RF.Game.endRun();}catch(e){}
      RF.Game.selectLevel&&RF.Game.selectLevel(l); RF.Game.startRun('reef');},id);
    await new Promise(r=>setTimeout(r,2400));
    await swimTo(180); await new Promise(r=>setTimeout(r,1600));
    await shot(`${TAG}-level-${id}`);
    calls[id]=await p.evaluate(()=>RF.Game.renderer?.info?.render?.calls);
  }
}
fs.writeFileSync(path.join(OUT,`${TAG}-${MODE}-calls.json`),JSON.stringify(calls,null,2));
console.log('drawCalls',JSON.stringify(calls));
await b.close(); server.close();
