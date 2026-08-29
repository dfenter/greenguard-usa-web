/* Big clean side-on renders of each approved bake IN ITS RESOLVED FRAME,
 * so I can look at which end is the head with no doubt. Nose should be +X
 * (screen RIGHT). */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT='/Users/lucille/greenguard-usa-web';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT='/Users/lucille/greenguard-usa-web/play/razorfin/hse/evidence/r15-orient2/bakes';
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
const browser=await puppeteer.launch({headless:true,executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:900,height:400});
page.on('console',m=>console.log('PAGE',m.text()));
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`,{waitUntil:'load',timeout:60000});
const keys=process.env.KEYS.split(',');
const out=await page.evaluate(async (keys)=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<120;i++){ if(window.RF&&window.RF.Art3D)break; await sleep(100); }
  const THREE=await import('three'); window.__T=THREE;
  const A=window.RF.Art3D; await A.preload();
  /* Force the demand-load of each textured bake by building a row that uses
   * it, then wait for the real template to swap in. */
  const ROWS=window.RFD.SHARKS;
  for(const k of keys){
    const def=ROWS.find(d=>d.sil&&d.sil.model===k);
    if(!def) continue;
    try{ A.buildShark(def); }catch(e){}
  }
  for(let i=0;i<200;i++){
    const have=new Set(A.residentTemplates().map(x=>x.key));
    if(keys.every(k=>have.has(k)))break; await sleep(150);
  }
  const res={};
  for(const k of keys){
    const t=A.residentTemplates().find(x=>x.key===k);
    if(!t){res[k]='MISSING';continue;}
    const W=900,H=400;
    const r=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
    r.setPixelRatio(1); r.setSize(W,H);
    const sc=new THREE.Scene(); sc.background=new THREE.Color(0xf2f6f9);
    const holder=new THREE.Group();
    t.scene.updateMatrixWorld(true);
    t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
      const m=new THREE.Mesh(o.geometry,new THREE.MeshStandardMaterial({color:0x8fa3b0,roughness:0.6,metalness:0.05,side:THREE.DoubleSide}));
      m.applyMatrix4(o.matrixWorld); holder.add(m); });
    sc.add(holder);
    sc.add(new THREE.HemisphereLight(0xffffff,0x445566,2.2));
    const dl=new THREE.DirectionalLight(0xffffff,2.0); dl.position.set(2,4,6); sc.add(dl);
    const dl2=new THREE.DirectionalLight(0xffffff,0.8); dl2.position.set(-3,1,-4); sc.add(dl2);
    holder.updateMatrixWorld(true);
    const bb=new THREE.Box3().setFromObject(holder);
    const c=bb.getCenter(new THREE.Vector3()), sz=bb.getSize(new THREE.Vector3());
    holder.position.sub(c); holder.updateMatrixWorld(true);
    const span=Math.max(sz.x/(W/H),sz.y)*0.60+1e-3;
    const cam=new THREE.OrthographicCamera(-span*(W/H),span*(W/H),span,-span,0.01,100000);
    cam.position.set(0,0,Math.max(sz.z,1)*10+10); cam.up.set(0,1,0); cam.lookAt(0,0,0);
    r.render(sc,cam);
    res[k]=r.domElement.toDataURL('image/png');
    r.dispose();
  }
  return res;
},keys);
for(const [k,v] of Object.entries(out)){
  if(typeof v!=='string'||!v.startsWith('data:')){console.log(k,v);continue;}
  fs.writeFileSync(path.join(OUT,k+'_side.png'),Buffer.from(v.split(',')[1],'base64'));
  console.log('wrote',k);
}
await browser.close(); srv.close();
