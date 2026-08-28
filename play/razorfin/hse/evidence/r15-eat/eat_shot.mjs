import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root=process.env.ROOT||'/Users/lucille/greenguard-usa-web'; const port=47900+(Number(process.env.PORTOFF)||0);
const server=http.createServer((rq,rs)=>{let f=decodeURIComponent(rq.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';fs.readFile(path.join(root,f),(e,d)=>{if(e){rs.writeHead(404);rs.end();return;}const x=path.extname(f);rs.writeHead(200,{'content-type':x==='.js'||x==='.mjs'?'text/javascript':x==='.json'?'application/json':x==='.png'?'image/png':x==='.glb'?'model/gltf-binary':'text/html'});rs.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--mute-audio','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-background-timer-throttling']});
const p=await b.newPage();
await p.setViewport({width:844,height:390,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const c=await p.target().createCDPSession(); await c.send('Network.setBypassServiceWorker',{bypass:true});
await c.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,4500));
const tag=process.env.TAG||'shot';
for (const level of (process.env.LEVELS||'alaska,mexico').split(',')) {
  await p.evaluate(async(level)=>{const G=window.RF.Game;G.selectLevel&&G.selectLevel(level);G.startRun('reef');await new Promise(r=>setTimeout(r,600));G.selectLevel&&G.selectLevel(level);},level);
  // let the ring fill with this level's spawns
  await p.evaluate((secs)=>new Promise(res=>{const G=window.RF.Game;const iv=setInterval(()=>{try{if(G.kit)G.kit.paused=false;}catch(e){}},16);setTimeout(()=>{clearInterval(iv);res();},secs*1000);}),18);
  const roster=await p.evaluate(()=>{const o={};for(const e of (window.RF.World.entities||[])){if(!e||!e.active)continue;if(['relic','gempickup','buffpickup','pickup'].indexOf(e.kind)>=0)continue;const k=e.defId+':'+e.kind+':t'+e.tier;o[k]=(o[k]||0)+1;}const p=window.RF.Game.ctx.player;return {roster:o,playerTier:p.tier,ceiling:window.RF.Game.ctx.mouth?window.RF.Game.ctx.mouth.eligibleTierMax:null};});
  console.log(tag,level,JSON.stringify(roster));
  const shot=await c.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(`hse/evidence/r15-eat/${tag}-${level}.png`,Buffer.from(shot.data,'base64'));
}
await b.close(); server.close();
