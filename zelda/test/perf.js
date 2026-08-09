/* Headless performance probe: same script boot path as smoke.js, then 600
   update+render frames against a no-op 2D context.
   P0 baseline before P1-P6: 0.101219 ms/frame on this workspace run. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function ctx() {
  const noop = () => {};
  return new Proxy({ canvas:{width:256,height:240}, save:noop, restore:noop, translate:noop,
    scale:noop, clip:noop, beginPath:noop, rect:noop, arc:noop, fill:noop, stroke:noop,
    strokeRect:noop, fillRect:noop, drawImage:noop, fillText:noop, putImageData:noop,
    setTransform:noop, measureText:()=>({width:8}), getImageData:()=>({data:new Uint8ClampedArray(1)}),
    createLinearGradient:()=>({addColorStop:noop}), fillStyle:'#000', strokeStyle:'#000',
    globalAlpha:1, font:'', textBaseline:'', imageSmoothingEnabled:false, lineWidth:1 },
    { get(t,p){ return p in t ? t[p] : noop; }, set(t,p,v){ t[p]=v; return true; } });
}
function canvas() { return { width:0, height:0, style:{}, getContext:()=>ctx(),
  addEventListener:()=>{}, getBoundingClientRect:()=>({left:0,top:0,width:256,height:240}) }; }
const listeners = {};
const documentStub = { hidden:false, body:null, getElementById:()=>canvas(),
  createElement:t=>t === 'canvas' ? canvas() : {style:{}},
  addEventListener:(ev,fn)=>(listeners[ev] = listeners[ev] || []).push(fn) };
const windowStub = { innerWidth:1280, innerHeight:800, addEventListener:(ev,fn)=>(listeners[ev] = listeners[ev] || []).push(fn),
  requestAnimationFrame:()=>1, AudioContext:null, webkitAudioContext:null, setTimeout:()=>0, clearTimeout:()=>{} };
const sandbox = { window:windowStub, document:documentStub, requestAnimationFrame:windowStub.requestAnimationFrame,
  setTimeout:()=>0, clearTimeout:()=>{}, Image:function(){}, ImageData:function(w,h){return {width:w,height:h,data:new Uint8ClampedArray(Math.max(1,w*h*4))};},
  Math, Date, JSON, console, Uint8ClampedArray, Array, Object, String, Number, Boolean, parseInt, parseFloat, isNaN,
  Set, Map, performance:{now:()=>0}, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const order = ['engine','sound','sprites','tiles','world','dungeon','entities','items','game'];
let source = '';
for (const name of order) source += fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8') + '\n;\n';
source += '\n;globalThis.Game=Game;globalThis.Engine=Engine;';
vm.runInContext(source, sandbox, { filename:'perf-combined.js' });

const game = sandbox.Game;
game._test.startGame();
const start = process.hrtime.bigint();
for (let i = 0; i < 600; i++) {
  game._test.update();
  game._test.render(sandbox.Engine.ctx);
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
console.log('PERF 600 frames total_ms=' + elapsedMs.toFixed(3) + ' ms_per_frame=' + (elapsedMs / 600).toFixed(6));
