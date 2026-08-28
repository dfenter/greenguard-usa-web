import fs from 'node:fs'; import vm from 'node:vm'; import * as THREE from 'three';
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync('/Users/lucille/greenguard-usa-web/play/razorfin/data.js','utf8'),{filename:'data.js'});
const A = (await import('/Users/lucille/greenguard-usa-web/play/razorfin/fish3d.js')).default;
// Node has no fetch-able relative URL; feed the parser from disk instead.
const dir='/Users/lucille/greenguard-usa-web/play/razorfin/';
globalThis.fetch = async (u) => { const b = fs.readFileSync(dir+u); return { ok:true, arrayBuffer: async()=> b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) }; };
await A.preloadFish();
const def = globalThis.RFD.CREATURES.find(d=>d.id==='tuna');
const b = A.buildFish(def); const g = b.geometry;
const p = g.getAttribute('position'), c = g.getAttribute('color'), sh = g.getAttribute('rfPreyShade');
console.log('bbox', JSON.stringify(g.boundingBox));
let dark=0, eye=0; let darkX=[];
for (let i=0;i<c.count;i++){
  const lum = 0.2126*c.getX(i)+0.7152*c.getY(i)+0.0722*c.getZ(i);
  if (lum<0.06){dark++; darkX.push([p.getX(i).toFixed(2),p.getY(i).toFixed(2),p.getZ(i).toFixed(2)]);}
  if (sh.getY(i)>0.01) eye++;
}
console.log('verts',c.count,'darkVerts',dark,'eyeMaskVerts',eye);
console.log('dark sample', darkX.slice(0,12));
