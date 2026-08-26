// Cline lane lineup probe: screenshot the player shark closeup for a set of defs.
// Copy of scratchpad/sharkline.js with an EADDRINUSE retry loop, because six
// lanes run the same script and the original picks from one tiny port range.
const puppeteer=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT='/Users/lucille/greenguard-usa-web';const PORT=41000+Math.floor(Math.random()*20000);
const MIME={html:'text/html',js:'text/javascript',png:'image/png',json:'application/json'};
function serve(port,tries){const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
 fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':MIME[path.extname(p).slice(1)]||'application/octet-stream'});res.end(d);});});
 srv.on('error',(e)=>{if(e.code==='EADDRINUSE'&&tries>0){setTimeout(()=>serve(PORT,tries-1),300);}else{console.error(e);process.exit(1);}});
 return srv;}
const server=serve(PORT,40);
server.listen(PORT,async()=>{
 const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--mute-audio']});
 const pg=await b.newPage();
 const errs=[];
 pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await pg.setViewport({width:844,height:390,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const c=await pg.createCDPSession();
 await c.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
 await pg.goto(`http://127.0.0.1:${PORT}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
 await new Promise(r=>setTimeout(r,4200));
 const ids=(process.env.IDS||'reef,tiger,greatwhite').split(',');
 for(const id of ids){
  const row=(async()=>{
   const ok=await pg.evaluate(async(id)=>{try{window.RF.Game.startRun(id);await new Promise(r=>setTimeout(r,900));const p=window.RF.Game.ctx.player;p.x=3600;p.y=1200;p.vx=200;p.vy=0;return true;}catch(e){return 'ERR '+e.message;}},id);
   if(ok!==true){console.log('START_FAIL '+id+' '+ok);return;}
   await new Promise(r=>setTimeout(r,1500));
   const shot=await c.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(process.env.OUT+'/shark_'+id+'.png',Buffer.from(shot.data,'base64'));
   await pg.evaluate(()=>{try{window.RF.Game.endRun();}catch(e){}});
  })().catch(e=>console.log('ROW_FAIL '+id+' '+e.message));
  // watchdog: never let one row hang the whole lineup
  const dead=await Promise.race([row,new Promise(r=>setTimeout(()=>r('timeout'),25000))]);
  if(dead==='timeout')console.log('ROW_TIMEOUT '+id);
  await new Promise(r=>setTimeout(r,400));
 }
 console.log('console_errors='+errs.length);errs.slice(0,10).forEach(e=>console.log('CERR '+e));
 console.log('done');await b.close();server.close();process.exit(0);});