import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/lucille/greenguard-usa-web', port=47670;
const server=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]); if(f.endsWith('/'))f+='index.html';
 fs.readFile(path.join(root,f),(e,d)=>{ if(e){s.writeHead(404);s.end();return;} s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'}); s.end(d);});});
await new Promise(r=>server.listen(port,r));
const b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--mute-audio','--use-gl=angle','--enable-unsafe-swiftshader']});
const p=await b.newPage(); p.on('pageerror',e=>console.log('PAGEERROR',e.message));
const cdp=await p.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>{RF.Game.selectLevel&&RF.Game.selectLevel('hawaii'); RF.Game.startRun('reef');});
await new Promise(r=>setTimeout(r,2500));
console.log(JSON.stringify(await p.evaluate(()=>{
  const out={zones:[],garden:[]};
  const Z=RF.World.__zones?RF.World.__zones():null;
  out.worldW=RF.World.width?RF.World.width():null;
  const sc=RF.Game.scene;
  let allMesh=0, named=[];
  sc.traverse(o=>{ if(o.isMesh){allMesh++; if(o.name)named.push(o.name);} });
  out.allMesh=allMesh; out.sampleNames=named.slice(0,40);
  out.matInfo=[];
  sc.traverse(o=>{ if(o.isMesh&&/garden/i.test(o.name||'')){
    const m=Array.isArray(o.material)?o.material[0]:o.material;
    out.matInfo.push({name:o.name, fog:m.fog, transparent:m.transparent,
      alphaTest:m.alphaTest, depthWrite:m.depthWrite, toneMapped:m.toneMapped,
      vertexColors:m.vertexColors, hasMap:!!m.map});
  }});
  out.camX=RF.Game.camera.position.x;
  sc.traverse(o=>{ if(o.isMesh&&/garden/i.test(o.name||'')){
    o.geometry.computeBoundingBox&&o.geometry.computeBoundingBox();
    const bb=o.geometry.boundingBox;
    out.garden.push({name:o.name, visible:o.visible,
      bb:bb?{min:[bb.min.x|0,bb.min.y|0,bb.min.z|0],max:[bb.max.x|0,bb.max.y|0,bb.max.z|0]}:null, verts:o.geometry.attributes.position.count,
      pos:[o.position.x|0,o.position.y|0,o.position.z|0], tris:o.geometry.index?o.geometry.index.count/3:0});
  }});
  const pl=RF.Game.ctx.player;
  out.player={x:pl.x|0,y:pl.y|0};
  const cam=RF.Game.camera;
  out.cam={x:cam.position.x|0,y:cam.position.y|0,z:cam.position.z|0};
  // What three-space y range does the camera actually SEE at the garden's z?
  const fov=cam.fov*Math.PI/180;
  out.visibleY={};
  for(const gz of [-34,-70,-110]){
    const dist=cam.position.z-gz;
    const half=Math.tan(fov/2)*dist;
    out.visibleY['z'+gz]=[Math.round(cam.position.y-half),Math.round(cam.position.y+half)];
  }
  // Project the garden's own vertices to screen space with the LIVE camera.
  out.projTest=[];
  const THREE=RF.Game.three;
  sc.traverse(o=>{ if(o.isMesh&&/garden/i.test(o.name||'')){
    const pos=o.geometry.attributes.position; const v=new THREE.Vector3();
    let on=0,tot=0,xs=[1e9,-1e9],ys=[1e9,-1e9];
    for(let i=0;i<pos.count;i+=7){
      v.fromBufferAttribute(pos,i); o.localToWorld(v); v.project(cam); tot++;
      const sx=(v.x*0.5+0.5)*844, sy=(-v.y*0.5+0.5)*390;
      if(v.x>=-1&&v.x<=1&&v.y>=-1&&v.y<=1&&v.z<=1) on++;
      xs[0]=Math.min(xs[0],sx);xs[1]=Math.max(xs[1],sx);
      ys[0]=Math.min(ys[0],sy);ys[1]=Math.max(ys[1],sy);
    }
    out.projTest.push({name:o.name,onScreen:on,sampled:tot,
      sx:[Math.round(xs[0]),Math.round(xs[1])],sy:[Math.round(ys[0]),Math.round(ys[1])]});
  }});
  return out;
}),null,2));
await b.close(); server.close();
