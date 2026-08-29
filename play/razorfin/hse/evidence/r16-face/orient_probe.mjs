/* Where is the nose in the RIG GROUP frame, per bake?
 * Drives the real pipeline via headview and reads the skinned body in
 * group-local space. */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT='/Users/lucille/greenguard-usa-web';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IDS=(process.env.IDS||'greatwhite,thresher,tiger,hammerhead').split(',');
const MIME={html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',json:'application/json',glb:'model/gltf-binary',webp:'image/webp'};
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/'))p+='index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  if(p.endsWith('/headview.html')){let src=fs.readFileSync(f,'utf8');
    src=src.replace("import * as THREE from 'three';","import * as THREE from 'three';\nglobalThis.__RF_THREE=THREE;");
    src=src.replace('scene.add(rig.group);','scene.add(rig.group);\nglobalThis.__RF_RIG=rig.group;');
    res.writeHead(200,{'content-type':MIME.html,'cache-control':'no-store'});return res.end(src);}
  res.writeHead(200,{'content-type':MIME[f.split('.').pop()]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(f).pipe(res);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port=srv.address().port;
const pup=(await import('puppeteer-core')).default;
const browser=await pup.launch({headless:true,executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader']});
for(const id of IDS){
  const page=await browser.newPage();
  await page.setViewport({width:600,height:400});
  await page.evaluateOnNewDocument((rowId)=>{const w=window;w.RF=w.RF||{};
    w.RF.Game=w.RF.Game||{};w.RF.Game.ctx=w.RF.Game.ctx||{};
    w.RF.Game.ctx.player=w.RF.Game.ctx.player||{__stub:true};
    w.RF.Meta=w.RF.Meta||{};w.RF.Meta.profile=()=>({activeShark:rowId});},id);
  await page.goto(`http://127.0.0.1:${port}/play/razorfin/hse/headview.html?id=${id}`,{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,6000));
  const out=await page.evaluate(()=>{
    const THREE=globalThis.__RF_THREE,g=globalThis.__RF_RIG;
    if(!THREE||!g)return 'no rig';
    let body=null,tpl=null;
    g.traverse(o=>{if(o.isSkinnedMesh&&!o.userData.rfTexturedFace&&!body)body=o;
                   if(o.userData&&o.userData.rfOrientation)tpl=o;});
    if(!body)return 'no body';
    // Rotation from BODY-SKINNED space into GROUP space, composed from local
    // quaternions the way face_textured must do it at build time.
    const chain=[];let n=body;while(n){chain.push(n);if(n===g)break;n=n.parent;}
    const rot=new THREE.Quaternion();
    for(let i=chain.length-1;i>=0;i--)rot.multiply(chain[i].quaternion);
    const M=new THREE.Matrix4().makeRotationFromQuaternion(rot);
    const e=M.elements;
    const axisIn=(i)=>new THREE.Vector3(e[i],e[4+i],e[8+i]);
    globalThis.__AX={rot:rot.toArray().map(v=>+v.toFixed(3)),
      gx:axisIn(0).toArray().map(v=>+v.toFixed(3)),
      gy:axisIn(1).toArray().map(v=>+v.toFixed(3)),
      chain:chain.map(c=>c.name||c.type)};
    // skin every vertex, express in GROUP-LOCAL frame
    const geo=body.geometry,pos=geo.getAttribute('position'),si=geo.getAttribute('skinIndex'),sw=geo.getAttribute('skinWeight');
    const bones=body.skeleton.bones;
    const bm=bones.map(b=>new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse,b.matrixWorld));
    const gInv=new THREE.Matrix4().copy(g.matrixWorld).invert();
    const p=new THREE.Vector3(),o=new THREE.Vector3(),q=new THREE.Vector3();
    let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
    const pts=[];
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i);o.set(0,0,0);let t=0;
      for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);
        if(w<=0)continue;q.copy(p).applyMatrix4(bm[b]);o.addScaledVector(q,w);t+=w;}
      if(t>1e-6)o.multiplyScalar(1/t);else o.copy(p);
      o.applyMatrix4(body.matrixWorld).applyMatrix4(gInv);
      pts.push([o.x,o.y,o.z]);
      for(let k=0;k<3;k++){const v=o.getComponent(k);if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v;}
    }
    const L=hi[0]-lo[0];
    // girth centroid along X to say which end is really the head
    const NB=10;const bins=[];for(let k=0;k<NB;k++)bins.push([1e9,-1e9,1e9,-1e9]);
    for(const P of pts){const t=(P[0]-lo[0])/Math.max(L,1e-9);
      const k=Math.min(NB-1,Math.max(0,Math.floor(t*NB)));const B=bins[k];
      if(P[1]<B[0])B[0]=P[1];if(P[1]>B[1])B[1]=P[1];
      if(P[2]<B[2])B[2]=P[2];if(P[2]>B[3])B[3]=P[2];}
    let num=0,den=0;
    bins.forEach((B,k)=>{if(B[0]>1e8)return;const area=(B[1]-B[0])*(B[3]-B[2]);
      num+=area*((k+0.5)/NB-0.5);den+=area;});
    const centroid=den>0?num/den:0;
    // profile of half-width(z) and height(y) at 10 stations from +X end
    const prof=[];
    for(let k=0;k<10;k++){
      const xc=hi[0]-L*(k+0.5)/10*0.5;const tol=L*0.02;
      let zl=1e9,zh=-1e9,yl=1e9,yh=-1e9,n=0;
      for(const P of pts){if(Math.abs(P[0]-xc)>tol)continue;
        if(P[2]<zl)zl=P[2];if(P[2]>zh)zh=P[2];
        if(P[1]<yl)yl=P[1];if(P[1]>yh)yh=P[1];n++;}
      prof.push(n>=6?{x:+((hi[0]-xc)/L).toFixed(3),hw:+((zh-zl)/2/L).toFixed(4),h:+((yh-yl)/L).toFixed(4)}:null);
    }
    return {AX:globalThis.__AX,lo:lo.map(v=>+v.toFixed(3)),hi:hi.map(v=>+v.toFixed(3)),L:+L.toFixed(3),
      girthCentroidX:+centroid.toFixed(3),noseAtPlusX:centroid>0,prof};
  });
  console.log('=== '+id);
  console.log(JSON.stringify(out));
  await page.close();
}
await browser.close();srv.close();
