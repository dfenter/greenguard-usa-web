import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const TRUTH={sharky:'OK',greatwhite_cy:'OK',thresher:'NOSE REVERSED',tigershark:'NOSE REVERSED',whaler:'ROLLED'};
for(const t of A.residentTemplates()){
  const o=t.scene.userData.rfOrientation; if(!o)continue;
  if(!(t.key in TRUTH)) continue;
  console.log(t.key.padEnd(15), (TRUTH[t.key]||'').padEnd(15),
    'long='+o.axis, 'dorsal='+o.dorsalAxis+(o.dorsalSign>0?'+':'-'),
    'roll='+(o.roll*180/Math.PI).toFixed(0),
    'flip='+o.flip, '| dorsalSrc='+o.dorsalSource, '| noseSrc='+o.noseSource,
    '| girth='+o.girthBias, '| lat='+o.lateralAxis, '| xcheck='+o.dorsalCrossCheck);
}
