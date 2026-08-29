/* NPC ORIENTATION GATE.
 *
 * The player rig is only half the question: an NPC shark is placed by
 * world3d and rendered through the same renderPlayer() path, but with its
 * own heading, so a nose-sign error shows up there too.  Rather than reach
 * into world3d (another lane's file) for a spawn hook, this drives the real
 * game in a zone-2/3 level where the npc table is live, waits for predator
 * sharks to appear on the ring, and screenshots the scene plus a silhouette
 * of each NPC rig rendered from the same fixed side-on camera the player
 * gate uses.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../../..');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT=process.env.OUT||path.join(HERE,'npcshots');
fs.mkdirSync(OUT,{recursive:true});
const MIME={html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',json:'application/json',glb:'model/gltf-binary',webp:'image/webp'};
const srv=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/'))p+='index.html'; if(p.endsWith('/sw.js')){res.writeHead(404);return res.end();}
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':MIME[f.split('.').pop()]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(f).pipe(res); });
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;
const puppeteer=(await import('puppeteer-core')).default;
const browser=await puppeteer.launch({headless:true,executablePath:CHROME,args:['--no-sandbox','--mute-audio','--enable-unsafe-swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:900,height:520,deviceScaleFactor:1});
const cdp=await page.createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:900,height:520,deviceScaleFactor:1,mobile:false,screenOrientation:{angle:90,type:'landscapePrimary'}});
await page.evaluateOnNewDocument(()=>{ const w=window; w.RF=w.RF||{};
  w.RF.Game=w.RF.Game||{}; w.RF.Game.ctx=w.RF.Game.ctx||{};
  w.RF.Game.ctx.player=w.RF.Game.ctx.player||{__rfEvidenceStub:true}; });
page.on('pageerror',e=>console.log('ERR',String(e.message).slice(0,140)));
await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`,{waitUntil:'load',timeout:60000});
/* Play as a high-tier row so the nursery law does not suppress predators. */
const started=await page.evaluate(async ()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const RF=window.RF;
  for(let i=0;i<120;i++){ if(RF.Meta&&RF.Game&&RF.UI&&document.getElementById('rfDive'))break; await sleep(100); }
  RF.Meta.sessionSelected='leviathanrex';
  if(RF.UI.showMenu){try{RF.UI.showMenu();}catch(e){}}
  await sleep(200);
  const card=document.querySelector('[data-shark="leviathanrex"]');
  if(card){card.click(); await sleep(200);}
  const d=document.getElementById('rfDive'); if(!d)return 'no dive'; d.click(); await sleep(500);
  const ls=document.getElementById('rfLevelSelectDive'); if(ls){ls.click(); await sleep(500);}
  for(let i=0;i<60;i++){ const p=RF.Game?.ctx?.player; if(p&&!p.__rfEvidenceStub&&p.sprite)return 'ok'; await sleep(100); }
  return 'no start';
});
console.log('started',started);
await page.evaluate(async()=>{ if(!window.__RF_THREE) window.__RF_THREE=await import('three'); });
/* Roam so the spawn ring keeps rolling; sample for NPC sharks as we go. */
const seen={};
for(let pass=0; pass<40; pass++){
  const k = pass%2 ? 'ArrowRight':'ArrowLeft';
  await page.keyboard.down(k); await new Promise(r=>setTimeout(r,1200)); await page.keyboard.up(k);
  const found=await page.evaluate(()=>{
    const T=window.__RF_THREE; const ctx=window.RF?.Game?.ctx; if(!ctx)return [];
    const ents = (window.RF.World && window.RF.World.entities) || [];
    const out=[];
    for(const e of ents){
      if(!e||!e.sprite||e===ctx.player) continue;
      const kind = e.kind||e.role||e.type||'';
      const def  = e.def||e.rfDef||e._def||(e.defId&&window.RFD.SHARK_BY_ID[e.defId])||null;
      const model= def&&def.sil&&def.sil.model;
      if(!model) continue;
      e.sprite.updateMatrixWorld(true);
      const g=e.sprite;
      const P=n=>{const o=g.getObjectByName(n); return o? new T.Vector3().setFromMatrixPosition(o.matrixWorld):null;};
      const head=P('Head')||P('Nose'), tail=P('Tail3')||P('Tail2')||P('Tail1');
      const q=g.getWorldQuaternion(new T.Quaternion());
      const rec={id:def.id,model,kind,angle:e.angle,vx:e.vx,vy:e.vy};
      if(head&&tail){ const fwd=new T.Vector3(1,0,0).applyQuaternion(q);
        rec.headDot=+head.clone().sub(tail).normalize().dot(fwd).toFixed(3); }
      /* Silhouette of the NPC rig itself, from the same FIXED side-on
       * camera the player gate uses, so an off-camera NPC is still judged
       * by eye. The rig's live heading/facing-flip are baked in. */
      try{
        const W=420,H=260;
        const rt=new T.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});
        rt.setPixelRatio(1); rt.setSize(W,H);
        const sc=new T.Scene(); sc.background=new T.Color(0xeaf2f7);
        const holder=new T.Group();
        g.traverse(o=>{ if(!o.isMesh||!o.visible||!o.geometry?.attributes?.position)return;
          const mm=new T.Mesh(o.geometry,new T.MeshBasicMaterial({color:0x11202b}));
          mm.applyMatrix4(o.matrixWorld); holder.add(mm); });
        sc.add(holder); holder.updateMatrixWorld(true);
        const bb=new T.Box3().setFromObject(holder);
        if(!bb.isEmpty()){
          const c=bb.getCenter(new T.Vector3()), sz=bb.getSize(new T.Vector3());
          holder.position.sub(c);
          const span=Math.max(sz.x,sz.y)*0.62+1e-3;
          const cam=new T.OrthographicCamera(-span*(W/H),span*(W/H),span,-span,0.01,100000);
          cam.position.set(0,0,Math.max(sz.z,1)*8+10); cam.up.set(0,1,0); cam.lookAt(0,0,0);
          rt.render(sc,cam); rec.sil=rt.domElement.toDataURL('image/png');
        }
        rt.dispose();
      }catch(err){ rec.silErr=String(err.message).slice(0,80); }
      out.push(rec);
    }
    return out;
  });
  for(const f of found){
    const dir = (f.vx>=0)?'right':'left';
    const key=f.model+'_'+dir;
    if(!seen[key]){
      seen[key]={id:f.id,model:f.model,kind:f.kind,dir,angle:f.angle,vx:f.vx,vy:f.vy,headDot:f.headDot};
      if(f.sil) fs.writeFileSync(path.join(OUT,'npcsil_'+key+'.png'),Buffer.from(f.sil.split(',')[1],'base64'));
    }
  }
  if(found.length){
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(OUT,`npc_pass${String(pass).padStart(2,'0')}_`+found.map(f=>f.model).join('-').slice(0,60)+'.png'),Buffer.from(shot.data,'base64'));
    console.log('pass',pass,JSON.stringify(found.map(f=>({id:f.id,m:f.model,vx:Math.round(f.vx),hd:f.headDot}))));
  }
}
fs.writeFileSync(path.join(OUT,'seen.json'),JSON.stringify(seen,null,2));
console.log('models seen:',Object.keys(seen).join(','));
await browser.close(); srv.close();
