/* Kart Circuit Zero — dependency-free seeded spline time trial. */
(() => {
  'use strict';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const ui = { name:$('trackName'), lap:$('lap'), time:$('time'), best:$('bestText'), hint:$('hint'), drift:$('drift'), finish:$('finish'), result:$('resultTime'), medal:$('medal'), title:$('resultTitle') };
  const TAU = Math.PI * 2, clamp = (v,a,b) => Math.max(a,Math.min(b,v)), lerp = (a,b,t) => a+(b-a)*t;
  let W=0,H=0,scale=1,last=0,trackNo=0,track,player,cam,particles=[],shake=0,firstInput=false,audio;
  let state='race', keys={}, steerPointer=null, driftPointer=null, ghost=null, save={best:[0,0,0,0],ghost:[null,null,null,null]};
  try { const parsed=JSON.parse(localStorage.getItem('kz-zero-save')||'{}'); if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)) save=Object.assign(save,parsed); } catch(e) {}
  if (!Array.isArray(save.best)) save.best=[0,0,0,0];
  save.best=save.best.slice(0,4).map(v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:0}); while(save.best.length<4)save.best.push(0);
  if (!Array.isArray(save.ghost)) save.ghost=[null,null,null,null];
  const validGhost=g=>Array.isArray(g)&&g.length<=6000&&g.every(p=>Array.isArray(p)&&p.length>=4&&p.slice(0,4).every(Number.isFinite));
  save.ghost=save.ghost.slice(0,4).map(g=>validGhost(g)?g:null); while(save.ghost.length<4)save.ghost.push(null);

  const rand = seed => { let n=seed>>>0; return () => { n=(n*1664525+1013904223)>>>0; return n/4294967296; }; };
  const tracks = [
    {name:'EMBER LOOP', seed:812, hue:'#ef7654', gold:0.91, shape:[1.12,.82,1.03,.78,1.2,.94,1.08,.86,1.14,.9,1.06,.8,1.18,.88,1.02,.84]},
    {name:'MINT SWITCHBACK', seed:1903, hue:'#65d6b0', gold:0.87, shape:[.9,1.2,.82,1.18,.88,1.1,.8,1.16,.94,1.24,.84,1.13,.9,1.19,.82,1.1]},
    {name:'VIOLET COMET', seed:4519, hue:'#bb91ed', gold:0.9, shape:[1.15,.78,1.22,.76,1.12,.84,1.18,.72,1.2,.82,1.1,.76,1.24,.8,1.12,.74]},
    {name:'SUNSET KNOT', seed:7771, hue:'#f0be4d', gold:0.86, shape:[.94,1.18,.78,1.1,.92,1.26,.82,1.16,.88,1.22,.8,1.15,.94,1.2,.82,1.12]}
  ];
  function makeTrack(def) {
    const r=rand(def.seed), controls=[], count=16, base=950;
    for(let i=0;i<count;i++){
      const a=-Math.PI/2+i*TAU/count, radial=base*def.shape[i]*(.93+r()*.14), wobble=(r()-.5)*110;
      controls.push({x:Math.cos(a)*radial+wobble, y:Math.sin(a)*radial+(r()-.5)*110});
    }
    const pts=[], samplePer=14;
    for(let i=0;i<count;i++) for(let j=0;j<samplePer;j++){
      const t=j/samplePer, p0=controls[(i-1+count)%count],p1=controls[i],p2=controls[(i+1)%count],p3=controls[(i+2)%count], t2=t*t,t3=t2*t;
      pts.push({x:.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),y:.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)});
    }
    let len=0; for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];p.a=Math.atan2(q.y-p.y,q.x-p.x);p.nx=-Math.sin(p.a);p.ny=Math.cos(p.a);p.d=len;len+=Math.hypot(q.x-p.x,q.y-p.y)}
    const pads=[Math.floor(pts.length*.13),Math.floor(pts.length*.37),Math.floor(pts.length*.63),Math.floor(pts.length*.84)].map((i,n)=>({i,n}));
    return Object.assign(def,{pts,length:len,halfWidth:116,pads,par:len/425*3});
  }
  const allTracks=tracks.map(makeTrack);
  function at(i){ return track.pts[(i+track.pts.length)%track.pts.length]; }
  function nearest(x,y){ let best=0,bd=Infinity; for(let i=0;i<track.pts.length;i++){const p=track.pts[i],d=(x-p.x)**2+(y-p.y)**2;if(d<bd){bd=d;best=i}} return {i:best,d:Math.sqrt(bd),p:track.pts[best]}; }
  function format(t){t=Math.max(0,t);return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;}
  function saveNow(){ try{localStorage.setItem('kz-zero-save',JSON.stringify(save));}catch(e){} }
  function resetRace(no=trackNo){
    keys={}; steerPointer=null; driftPointer=null; ui.drift.classList.remove('held');
    trackNo=(no+allTracks.length)%allTracks.length; track=allTracks[trackNo]; ghost=save.ghost[trackNo];
    const p=at(0), q=at(1); player={x:p.x,y:p.y,a:Math.atan2(q.y-p.y,q.x-p.x),speed:0,lap:1,progress:0,lastProgress:0,time:0,lapStart:0,record:[],recordClock:0,drift:0,boost:0,padCooldown:0,offRoad:0};
    cam={x:p.x,y:p.y}; particles=[]; shake=0; state='race'; ui.finish.classList.remove('show'); ui.hint.classList.remove('fade'); updateUI();
  }
  function setInput(){
    if(!firstInput){firstInput=true;ui.hint.classList.add('fade'); if(!audio) try{audio=new AudioContext();}catch(e){} }
  }
  function beep(freq=300,duration=.05){if(!audio)return;try{const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;o.type='triangle';g.gain.value=.035;o.connect(g);g.connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.stop(audio.currentTime+duration)}catch(e){}}
  function steer(){
    let v=0;if(keys.ArrowLeft||keys.KeyA)v-=1;if(keys.ArrowRight||keys.KeyD)v+=1;
    if(steerPointer)v=clamp((steerPointer.x-steerPointer.start)/140,-1,1);
    return v;
  }
  function isDrifting(){return !!driftPointer||keys.Space;}
  function inputStart(e){
    setInput(); const x=e.clientX,y=e.clientY;
    if(e.target===ui.drift){if(!driftPointer)driftPointer={id:e.pointerId};ui.drift.classList.add('held');return;}
    if(x<W*.62){steerPointer={id:e.pointerId,start:x,x};try{canvas.setPointerCapture(e.pointerId)}catch(_){} }
  }
  function inputMove(e){if(steerPointer&&e.pointerId===steerPointer.id)steerPointer.x=e.clientX;}
  function inputEnd(e){
    if(driftPointer&&driftPointer.id===e.pointerId){driftPointer=null;ui.drift.classList.remove('held');}
    if(steerPointer&&e.pointerId===steerPointer.id)steerPointer=null;
  }
  canvas.addEventListener('pointerdown',inputStart); canvas.addEventListener('pointermove',inputMove); canvas.addEventListener('pointerup',inputEnd); canvas.addEventListener('pointercancel',inputEnd);
  ui.drift.addEventListener('pointerdown',inputStart); ui.drift.addEventListener('pointerup',inputEnd); ui.drift.addEventListener('pointercancel',inputEnd); ui.drift.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')inputEnd(e)});
  window.addEventListener('pointerup',inputEnd); window.addEventListener('pointercancel',inputEnd);
  document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  window.addEventListener('keydown',e=>{keys[e.code]=true;setInput();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyR')resetRace();if(e.code==='Enter'&&state==='finish')resetRace();if(/^Digit[1-4]$/.test(e.code))resetRace(+e.code.slice(-1)-1)});
  window.addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space'&&!driftPointer)ui.drift.classList.remove('held')});
  $('restart').addEventListener('click',()=>{setInput();resetRace()}); $('trackButton').addEventListener('click',()=>{setInput();resetRace(trackNo+1)});
  function resize(){
    W=innerWidth;H=innerHeight;const d=Math.min(devicePixelRatio||1,2), max=960;scale=Math.min(d,max/Math.max(W,H));canvas.width=Math.max(1,Math.floor(W*scale));canvas.height=Math.max(1,Math.floor(H*scale));canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(scale,0,0,scale,0,0);
  }
  addEventListener('resize',resize); resize(); resetRace(0);

  function burst(x,y,color,count=8,force=1){for(let i=0;i<count;i++){const a=Math.random()*TAU,s=(30+Math.random()*100)*force;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.45,max:.8,size:2+Math.random()*4,c:color})}}
  function update(dt){
    if(H>=W)return;
    if(state!=='race')return;
    dt=Math.min(dt,.035); player.time+=dt; player.recordClock+=dt;
    const s=steer(), drifting=isDrifting(), wasDrifting=player.drift>0;
    const near=nearest(player.x,player.y), off=near.d>track.halfWidth;
    const turn=(.95+player.speed/500)*s*(drifting?1.48:1); player.a+=turn*dt;
    if(drifting){player.drift+=dt;player.speed+=20*dt; if(Math.random()<dt*28)burst(player.x-Math.cos(player.a)*22,player.y-Math.sin(player.a)*22,track.hue,1,.35)}
    else if(wasDrifting){const b=clamp(player.drift*300,45,260);player.boost=Math.max(player.boost,b);burst(player.x,player.y,'#f8e56a',16,1.2);shake=Math.max(shake,4);beep(640,.09);player.drift=0;}
    if(player.boost>0)player.boost=Math.max(0,player.boost-190*dt);
    const max=off?225:405+Math.min(player.boost,180); player.speed=lerp(player.speed,max,1-Math.exp(-3.2*dt));
    if(off){player.offRoad=Math.min(1,player.offRoad+dt*2);player.speed*=Math.pow(.52,dt);if(near.d>track.halfWidth*1.18){player.a+=Math.atan2(near.p.y-player.y,near.p.x-player.x)*dt*1.5;shake=Math.max(shake,1.4)}}else player.offRoad=Math.max(0,player.offRoad-dt*3);
    if(Math.abs(s)>.2&&drifting)player.speed*=Math.pow(.9,dt);
    player.x+=Math.cos(player.a)*player.speed*dt;player.y+=Math.sin(player.a)*player.speed*dt;
    const after=nearest(player.x,player.y), prog=after.i/track.pts.length;
    if(player.lastProgress>.68&&prog<.32&&player.time-player.lapStart>3){player.lap++;player.lapStart=player.time;beep(480,.08);burst(player.x,player.y,'#ffffff',12,1.4);if(player.lap>3)finishRace();}
    player.lastProgress=prog; player.progress=prog;
    for(const pad of track.pads){const d=Math.abs(pad.i-after.i),wrap=Math.min(d,track.pts.length-d);if(wrap<3&&after.d<track.halfWidth*.48&&player.padCooldown<=0){player.boost=Math.max(player.boost,145);player.padCooldown=.7;burst(player.x,player.y,'#b7ffed',10,1.1);beep(740,.045)}} player.padCooldown=Math.max(0,player.padCooldown-dt);
    if(player.recordClock>.085){player.recordClock=0;if(player.record.length<6000)player.record.push([Math.round(player.x),Math.round(player.y),Math.round(player.a*100),Math.round(player.time*100)])}
    cam.x=lerp(cam.x,player.x+Math.cos(player.a)*150,1-Math.exp(-5*dt));cam.y=lerp(cam.y,player.y+Math.sin(player.a)*150,1-Math.exp(-5*dt));shake=Math.max(0,shake-dt*12);
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.06,dt);p.vy*=Math.pow(.06,dt);p.life-=dt;if(p.life<=0)particles.splice(i,1)}
    updateUI();
  }
  function finishRace(){
    if(state!=='race')return;state='finish'; const t=player.time, old=save.best[trackNo]||0, isBest=!old||t<old;
    if(isBest){save.best[trackNo]=t;save.ghost[trackNo]=player.record;ghost=player.record;saveNow()}
    ui.result.textContent=format(t); const par=track.par, gold=par*track.gold, silver=par*1.08;
    let label=t<=gold?'GOLD MEDAL':t<=silver?'SILVER MEDAL':'BRONZE MEDAL';ui.medal.textContent=`${label}${isBest?'  ·  NEW BEST':''}`;ui.title.textContent=isBest?'CIRCUIT CONQUERED':'RUN COMPLETE';ui.finish.classList.add('show');beep(t<=gold?880:520,.16);
  }
  function updateUI(){ui.name.textContent=`${String(trackNo+1).padStart(2,'0')} · ${track.name}`;ui.lap.textContent=state==='finish'?'3 LAPS DONE':`LAP ${Math.min(player.lap,3)} / 3`;ui.time.textContent=format(player.time);ui.best.textContent=save.best[trackNo]?`· BEST ${format(save.best[trackNo])}`:'';}

  function pathTrack(width,offset=0){ctx.beginPath();for(let i=0;i<track.pts.length;i++){const p=track.pts[i],x=p.x+p.nx*offset,y=p.y+p.ny*offset;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round'}
  function drawGround(){
    ctx.fillStyle='#17372f';ctx.fillRect(-2200,-2200,4400,4400);ctx.strokeStyle='#1c493b';ctx.lineWidth=2;
    for(let x=-2200;x<2200;x+=90){ctx.beginPath();ctx.moveTo(x,-2200);ctx.lineTo(x,2200);ctx.stroke()}for(let y=-2200;y<2200;y+=90){ctx.beginPath();ctx.moveTo(-2200,y);ctx.lineTo(2200,y);ctx.stroke()}
    ctx.globalAlpha=.22;for(let i=0;i<70;i++){const x=((i*431)%3600)-1800,y=((i*719)%3600)-1800;ctx.fillStyle=i%2?'#37634b':'#0d2924';ctx.beginPath();ctx.arc(x,y,15+(i%4)*7,0,TAU);ctx.fill()}ctx.globalAlpha=1;
  }
  function drawRibbon(){
    pathTrack(track.halfWidth*2+26);ctx.strokeStyle='#0b1715';ctx.globalAlpha=.55;ctx.stroke();ctx.globalAlpha=1;
    pathTrack(track.halfWidth*2+12);ctx.strokeStyle='#d6d0ac';ctx.stroke();
    pathTrack(track.halfWidth*2);ctx.strokeStyle='#4d5a53';ctx.stroke();
    pathTrack(5);ctx.strokeStyle='#758078';ctx.globalAlpha=.45;ctx.setLineDash([25,22]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    for(let i=0;i<track.pts.length;i+=2){const p=at(i),q=at(i+1), alternate=(Math.floor(i/4)%2===0)?'#e86d54':'#f6e5bd';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(p.x+p.nx*(track.halfWidth+2)*side,p.y+p.ny*(track.halfWidth+2)*side);ctx.lineTo(q.x+q.nx*(track.halfWidth+2)*side,q.y+q.ny*(track.halfWidth+2)*side);ctx.strokeStyle=alternate;ctx.lineWidth=12;ctx.stroke()}}
    for(const pad of track.pads){const p=at(pad.i),w=72,h=38;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle='#102a25';ctx.fillRect(-w/2-4,-h/2-4,w+8,h+8);ctx.fillStyle='#baffdc';ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle='#1d7662';for(let x=-24;x<25;x+=18){ctx.beginPath();ctx.moveTo(x-7,-12);ctx.lineTo(x+4,0);ctx.lineTo(x-7,12);ctx.closePath();ctx.fill()}ctx.restore()}
    const st=at(0);ctx.save();ctx.translate(st.x,st.y);ctx.rotate(st.a);for(let x=-track.halfWidth;x<track.halfWidth;x+=28){ctx.fillStyle=(Math.floor((x+track.halfWidth)/28)%2)?'#f6f1d4':'#24362f';ctx.fillRect(x,-8,28,16)}ctx.restore();
  }
  function drawGhost(){
    if(!validGhost(ghost)||ghost.length<2)return; const t=player.time, idx=Math.floor(t*100/8.5); if(idx>=ghost.length-1)return;const a=ghost[idx],b=ghost[idx+1],f=clamp((t*100-a[3])/(b[3]-a[3]||1),0,1),x=lerp(a[0],b[0],f),y=lerp(a[1],b[1],f),ang=lerp(a[2],b[2],f)/100;drawKart(x,y,ang,'#c4f5ed',.3,true)}
  function drawKart(x,y,a,color,alpha=1,ghostKart=false){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalAlpha=alpha;ctx.shadowColor='#07110f';ctx.shadowBlur=12;ctx.shadowOffsetY=5;ctx.fillStyle='#101d1a';ctx.fillRect(-20,-14,13,7);ctx.fillRect(7,-14,13,7);ctx.fillRect(-20,7,13,7);ctx.fillRect(7,7,13,7);ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(25,0);ctx.lineTo(9,-13);ctx.lineTo(-16,-11);ctx.lineTo(-22,0);ctx.lineTo(-16,11);ctx.lineTo(9,13);ctx.closePath();ctx.fill();ctx.fillStyle=ghostKart?'#35645b':'#fff0a0';ctx.fillRect(-7,-8,16,16);ctx.fillStyle='#132c26';ctx.fillRect(1,-6,7,12);ctx.fillStyle='#ffffff';ctx.fillRect(12,-3,4,6);ctx.restore();ctx.globalAlpha=1}
  function drawParticles(){for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(.5+p.life/p.max),0,TAU);ctx.fill()}ctx.globalAlpha=1}
  function render(){
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,W,H);ctx.save();const sx=(Math.random()-.5)*shake,sy=(Math.random()-.5)*shake;ctx.translate(W/2-cam.x+sx,H/2-cam.y+sy);drawGround();drawRibbon();drawGhost();drawParticles();drawKart(player.x,player.y,player.a,track.hue);if(player.boost>0){ctx.save();ctx.translate(player.x-Math.cos(player.a)*23,player.y-Math.sin(player.a)*23);ctx.rotate(player.a);ctx.fillStyle='#ffe56d';ctx.globalAlpha=.85;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-35,0);ctx.lineTo(0,7);ctx.closePath();ctx.fill();ctx.restore()}ctx.restore();
    requestAnimationFrame(loop);
  }
  function loop(t){const dt=last?(t-last)/1000:0;last=t;update(dt);render()}
  requestAnimationFrame(loop);
})();
