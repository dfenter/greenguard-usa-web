/* Side-on ORTHOGRAPHIC projection of each bake in its RESOLVED frame,
 * rasterised by hand (no GL). +X is screen RIGHT, +Y is screen UP.
 * Shading = depth, so the form reads. */
import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import zlib from 'node:zlib';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const OUT=BASE+'/hse/evidence/r15-orient2/bakes';
fs.mkdirSync(OUT,{recursive:true});
function png(W,H,rgb){ // rgb: Uint8Array W*H*3
  const raw=Buffer.alloc((W*3+1)*H);
  for(let y=0;y<H;y++){ raw[y*(W*3+1)]=0; rgb.copy?0:0;
    Buffer.from(rgb.buffer,rgb.byteOffset+y*W*3,W*3).copy(raw,y*(W*3+1)+1); }
  const idat=zlib.deflateSync(raw);
  const chunks=[];
  const crcT=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
  const crc=(b)=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return ~c>>>0;};
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
    const td=Buffer.concat([Buffer.from(type),data]); const cc=Buffer.alloc(4); cc.writeUInt32BE(crc(td));
    return Buffer.concat([len,td,cc]);};
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
const KEYS=(process.env.KEYS||'greatwhite_cy,thresher,tigershark,whaler,sharky').split(',');
for(const k of KEYS){
  const t=A.residentTemplates().find(x=>x.key===k); if(!t){console.log(k,'MISSING');continue;}
  t.scene.updateMatrixWorld(true);
  // gather triangles in world space
  const tris=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const g=o.geometry, pos=g.attributes.position, idx=g.index;
    const get=i=>new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);
    const n=idx?idx.count:pos.count;
    for(let i=0;i<n;i+=3){
      const a=idx?idx.getX(i):i, b=idx?idx.getX(i+1):i+1, c=idx?idx.getX(i+2):i+2;
      tris.push([get(a),get(b),get(c)]); } });
  const box=new THREE.Box3(); for(const T of tris) for(const v of T) box.expandByPoint(v);
  const ctr=box.getCenter(new THREE.Vector3()), sz=box.getSize(new THREE.Vector3());
  const W=1000,H=420, pad=0.92;
  const scale=Math.min(W/(sz.x||1), H/(sz.y||1))*pad;
  const VIEW=process.env.VIEW||'side';
  // choose (screenX, screenY, depth) from world axes per view
  const sel = VIEW==='top'  ? (v)=>[v.x-ctr.x,  v.z-ctr.z, v.y-ctr.y]
            : VIEW==='front'? (v)=>[v.z-ctr.z,  v.y-ctr.y, v.x-ctr.x]
            :                 (v)=>[v.x-ctr.x,  v.y-ctr.y, v.z-ctr.z];
  const ext = VIEW==='top' ? [sz.x,sz.z] : VIEW==='front'? [sz.z,sz.y] : [sz.x,sz.y];
  const scale2=Math.min(W/(ext[0]||1), H/(ext[1]||1))*pad;
  const px=v=>{const a=sel(v);return [Math.round(W/2+a[0]*scale2), Math.round(H/2-a[1]*scale2)];};
  const zbuf=new Float64Array(W*H).fill(-Infinity);
  const rgb=new Uint8Array(W*H*3); for(let i=0;i<W*H;i++){rgb[i*3]=242;rgb[i*3+1]=246;rgb[i*3+2]=249;}
  for(const T of tris){
    const P=T.map(px), Z=T.map(v=>sel(v)[2]);
    // face normal for shading
    const e1=T[1].clone().sub(T[0]), e2=T[2].clone().sub(T[0]);
    const nrm=e1.cross(e2).normalize();
    const L=new THREE.Vector3(0.3,0.6,0.75).normalize();
    let lam=Math.abs(nrm.dot(L)); const sh=Math.round(60+150*lam);
    const minx=Math.max(0,Math.min(P[0][0],P[1][0],P[2][0])), maxx=Math.min(W-1,Math.max(P[0][0],P[1][0],P[2][0]));
    const miny=Math.max(0,Math.min(P[0][1],P[1][1],P[2][1])), maxy=Math.min(H-1,Math.max(P[0][1],P[1][1],P[2][1]));
    const d=(P[1][0]-P[0][0])*(P[2][1]-P[0][1])-(P[2][0]-P[0][0])*(P[1][1]-P[0][1]);
    if(!d) continue;
    for(let y=miny;y<=maxy;y++) for(let x=minx;x<=maxx;x++){
      const w0=((P[1][0]-x)*(P[2][1]-y)-(P[2][0]-x)*(P[1][1]-y))/d;
      const w1=((P[2][0]-x)*(P[0][1]-y)-(P[0][0]-x)*(P[2][1]-y))/d;
      const w2=1-w0-w1;
      if(w0<0||w1<0||w2<0) continue;
      const z=w0*Z[0]+w1*Z[1]+w2*Z[2];
      const o=y*W+x; if(z<=zbuf[o]) continue; zbuf[o]=z;
      rgb[o*3]=sh; rgb[o*3+1]=Math.round(sh*1.02); rgb[o*3+2]=Math.round(Math.min(255,sh*1.12));
    }
  }
  fs.writeFileSync(OUT+'/'+k+'_'+(process.env.VIEW||'side')+'.png', png(W,H,rgb));
  console.log('wrote',k,'tris',tris.length);
}
