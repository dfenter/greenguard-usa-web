import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
for(const t of A.residentTemplates().sort((a,b)=>a.key<b.key?-1:1)){
  const o=t.scene.userData.rfOrientation;
  const tag = o.dorsalCrossCheck==='agrees' ? '' : '   <<< '+o.dorsalCrossCheck;
  console.log('%s dorsal=%s%s src=%-34s%s', t.key.padEnd(16), o.dorsalSign>0?'+':'-', o.dorsalAxis, o.dorsalSource, tag);
}
