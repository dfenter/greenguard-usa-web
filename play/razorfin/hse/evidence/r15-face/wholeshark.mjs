/* Render the WHOLE shark (not headview's crop) so the face batch can be seen
 * in context, plus a with/without-face pair for the silhouette mask gate. */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../../..');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT=process.env.OUT||path.join(HERE,'whole');
const IDS=(process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',');
const MIME={html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',json:'application/json',glb:'model/gltf-binary',webp:'image/webp'};
const PW=Number(process.env.WIDTH||1100),PH=Number(process.env.HEIGHT||620);
const PAGE=(id)=>`<!doctype html><meta charset=utf-8><title>whole ${id}</title>
<style>html,body{margin:0;background:#7fb3c4;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/play/_shared/three/three.module.min.js"}}</script>
<script src="/play/razorfin/data.js"></script>
<script>
/* Set BEFORE any module import: RF_GRIN_MOUTH_HOLD is a module-level const in
 * face_textured.js, evaluated once at import time, so the flag has to be on
 * the global before that module is ever pulled in. */
if(new URLSearchParams(location.search).get('mouth')==='1')globalThis.__RF_GRIN_MOUTH=true;
</script>
<script type="module">
import * as THREE from 'three';
import Art3D from '/play/razorfin/shark3d.js';
const P=new URLSearchParams(location.search);
const W=${PW},H=${PH};
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1);renderer.setSize(W,H);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x7fb3c4);
scene.add(new THREE.HemisphereLight(0x9fd4e8,0x06121e,0.55));
const key=new THREE.DirectionalLight(0xffffff,1.25);key.position.set(-1.1,1.4,1.6);scene.add(key);
await Art3D.preload();
const rows=(globalThis.RFD&&RFD.SHARKS)||[];
const def=rows.find(d=>d.id==='${id}');
const rig=Art3D.buildShark(def);scene.add(rig.group);rig.group.updateMatrixWorld(true);
if(P.get('noface')==='1'){rig.group.traverse(o=>{if(o.userData&&o.userData.rfTexturedFace)o.visible=false;});}
/* onlykind=N : keep only the face vertices whose rfFaceKind is N, by
 * collapsing every other vertex to the origin. Lets the gate attribute stray
 * pixels to a specific part (socket/sclera/pupil/highlight/brow/tooth). */
const OK=P.get('onlykind');
if(OK!==null){rig.group.traverse(o=>{
  if(!(o.userData&&o.userData.rfTexturedFace))return;
  const g2=o.geometry,pos=g2.getAttribute('position'),k=g2.getAttribute('rfFaceKind');
  const want=Number(OK);
  for(let i=0;i<pos.count;i++){ if(Math.abs(k.getX(i)-want)>0.5){pos.setXYZ(i,0,0,0);} }
  pos.needsUpdate=true; g2.computeBoundingSphere();
});}
/* GAPE: drive the jaw through the single authority so the frame shows the
 * mouth at a known opening. r16 needs the mouth judged at BOTH a shut jaw and
 * a working bite, because the tooth rows and cavity are authored against one
 * pose and have to stay contained in the other. */
const GAPE=P.get('gape');
if(GAPE!==null){
  const m=await import('/play/razorfin/hse/rig_morph.js');
  let rr=null;rig.group.traverse(o=>{if(!rr&&o.userData&&o.userData.rfJawAuthority)rr=o;});
  if(!rr&&rig.group.userData&&rig.group.userData.rfJawAuthority)rr=rig.group;
  if(rr){m.writeJawGape(rr,Number(GAPE));rr.updateMatrixWorld(true);
    rig.group.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton)o.skeleton.update();});}
  globalThis.__GAPE_APPLIED=!!rr;
}
if(P.get('flip')==='1'){rig.group.rotation.y+=Math.PI;rig.group.updateMatrixWorld(true);}
// frame the whole body from its true SKINNED bounds
function skinBox(m){const g=m.geometry,pos=g.getAttribute('position'),si=g.getAttribute('skinIndex'),sw=g.getAttribute('skinWeight');
 const bones=m.skeleton.bones,bm=bones.map(b=>new THREE.Matrix4().multiplyMatrices(m.bindMatrixInverse,b.matrixWorld));
 const box=new THREE.Box3(),p=new THREE.Vector3(),o=new THREE.Vector3(),q=new THREE.Vector3();
 for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);o.set(0,0,0);let t=0;
  for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(w<=0)continue;
   q.copy(p).applyMatrix4(bm[b]);o.addScaledVector(q,w);t+=w;}
  if(t>1e-6)o.multiplyScalar(1/t);else o.copy(p);box.expandByPoint(o.applyMatrix4(m.matrixWorld));}
 return box;}
let body=null;rig.group.traverse(o=>{if(o.isSkinnedMesh&&!o.userData.rfTexturedFace&&!body)body=o;});
/* The camera MUST be identical across the face/noface pair, or the two frames
 * differ everywhere and the difference image stops meaning "the pixels the
 * face batch drew". Deriving it from the body's skinned box looked safe, but
 * mounting the face changes the group's normalization pass, which moves the
 * body a little and shifted the camera between the two renders - measured as
 * a diff bbox spanning the whole shark on greatwhite and tiger, and a bogus
 * 31194 "face pixels".
 *
 * The frame is therefore pinned to the BIND-pose geometry box, which is a
 * property of the GLB alone and is identical whether or not a face is
 * mounted. */
const gb=body.geometry.boundingBox||(body.geometry.computeBoundingBox(),body.geometry.boundingBox);
const bb=gb.clone().applyMatrix4(body.matrixWorld);
const c=bb.getCenter(new THREE.Vector3());const s=bb.getSize(new THREE.Vector3());
const cam=new THREE.PerspectiveCamera(34,W/H,0.1,20000);
const span=Math.max(s.x,s.y,s.z);
cam.position.set(c.x,c.y,c.z+span*2.6);cam.lookAt(c);
renderer.render(scene,cam);
let face=null;rig.group.traverse(o=>{if(o.userData&&o.userData.rfTexturedFace)face=o;});
globalThis.__W={id:'${id}',faceMounted:!!face,gapeApplied:globalThis.__GAPE_APPLIED===true,bodyBox:[bb.min.toArray(),bb.max.toArray()]};
document.title='whole ${id} '+(face?'FACE':'noface');
</script>`;
const srv=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');let p=decodeURIComponent(u.pathname);
  if(p==='/whole'){const id=u.searchParams.get('id')||'reef';
    res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});return res.end(PAGE(id));}
  if(p.endsWith('/')) p+='index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  if(p.endsWith('/shark3d.js')){let src=fs.readFileSync(f,'utf8');
    src=src.replace('const RF_O2_TEXTURED_FACE = false;','const RF_O2_TEXTURED_FACE = true;');
    res.writeHead(200,{'content-type':MIME.js,'cache-control':'no-store'});return res.end(src);}
  res.writeHead(200,{'content-type':MIME[f.split('.').pop()]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(f).pipe(res);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;
const pup=(await import('puppeteer-core')).default;
fs.mkdirSync(OUT,{recursive:true});
for(const id of IDS){
  for(const variant of (process.env.VARIANTS||'face,noface,flip').split(',')){
    /* A FRESH BROWSER per frame.
     *
     * shark3d keeps a module-level LRU of textured templates (TEXTURED_LRU_CAP
     * = 3) that is shared by every page in a browser instance. Reusing one
     * browser across rows let an earlier row's resident template change what a
     * later row built, so the face/noface pair of the SAME row could differ in
     * the body as well as the face - measured as a diff bbox spanning the whole
     * shark on reef (9610 "face pixels") and blue (16108), while the identical
     * row rendered in isolation was bit-exact and diffed to a clean 36x43 box
     * around the eye.
     *
     * The difference image is the entire measurement here, so paying for a
     * browser launch per frame is worth it to make the pair trustworthy. */
    const browser=await pup.launch({headless:true,executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();
    await page.setViewport({width:PW,height:PH,deviceScaleFactor:1});
    await page.evaluateOnNewDocument((rowId)=>{const w=window;w.RF=w.RF||{};
      w.RF.Game=w.RF.Game||{};w.RF.Game.ctx=w.RF.Game.ctx||{};
      w.RF.Game.ctx.player=w.RF.Game.ctx.player||{__stub:true};
      w.RF.Meta=w.RF.Meta||{};w.RF.Meta.profile=()=>({activeShark:rowId});},id);
    /* A variant may carry a gape suffix, e.g. `face@0.35` or
     * `flipnoface@0`. The gape is applied to the SAME bone by the same
     * authority the runtime uses, so a face/noface pair at one gape is a
     * valid difference image. */
    const at=variant.indexOf('@');
    const base=at<0?variant:variant.slice(0,at);
    const gq=at<0?'':'&gape='+variant.slice(at+1);
    const mq=process.env.MOUTH==='1'?'&mouth=1':'';
    const q=(base==='noface'?'&noface=1':base==='flip'?'&flip=1':
            base==='flipnoface'?'&flip=1&noface=1':
            base.startsWith('kind')?'&onlykind='+base.slice(4):'')+gq+mq;
    await page.goto(`http://127.0.0.1:${port}/whole?id=${id}${q}`,{waitUntil:'load'});
    await new Promise(r=>setTimeout(r,5000));
    const w=await page.evaluate(()=>globalThis.__W||null);
    await page.screenshot({path:path.join(OUT,`${id}_${variant}.png`)});
    console.log(id.padEnd(12),variant.padEnd(16),'face='+(w?w.faceMounted:'?'),'gape='+(w?w.gapeApplied:'?'));
    await page.close();
    await browser.close();
  }
}
srv.close();
