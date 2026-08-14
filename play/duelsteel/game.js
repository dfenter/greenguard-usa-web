import * as THREE from 'three';

/* Duelsteel, original IP 3D weapon duels.
 *
 * The render layer is Three.js, but lifecycle, input identity, pause/resume,
 * persistence, audio and juice all belong to GGKit. Gameplay is a fixed 60Hz
 * accumulator. Render interpolation never advances gameplay time. Two pooled
 * ribbon trails and a bounded spark pool carry the visible impact language.
 */

const STEP = 1 / 60;
const MAX_STEPS = 5;
const MAX_SPARKS = 48;
const MAX_EMBERS = 36;
const SAVE_VERSION = 2;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const tint = (hex) => parseInt(String(hex).replace('#', ''), 16) || 0xffffff;
const copy = (obj) => JSON.parse(JSON.stringify(obj));

const FIGHTERS = [
  {id:'longsword', name:'Auren Vale', weapon:'Longsword', color:'#d8a760', trim:'#f5e5ad', dark:'#25354c', height:1.03, width:1.0, speed:4.4, unlock:0, style:'balanced'},
  {id:'glaive', name:'Mira Sorn', weapon:'Glaive', color:'#64c6b1', trim:'#d4ffe5', dark:'#17353b', height:1.12, width:.92, speed:4.0, unlock:0, style:'range'},
  {id:'daggers', name:'Nox Iri', weapon:'Twin Daggers', color:'#c17cff', trim:'#f1d7ff', dark:'#2d1742', height:.93, width:.72, speed:5.5, unlock:0, style:'speed'},
  {id:'axe', name:'Brakka Ohn', weapon:'War Axe', color:'#dc614d', trim:'#ffd0a4', dark:'#421e2a', height:1.07, width:1.2, speed:3.45, unlock:0, style:'power'},
  {id:'rapier', name:'Ilyra Quell', weapon:'Rapier', color:'#5e9bff', trim:'#d9ebff', dark:'#152b5d', height:1.06, width:.78, speed:5.0, unlock:0, style:'counter'},
  {id:'flail', name:'Ruum Kess', weapon:'Flail', color:'#d59c52', trim:'#ffe8a8', dark:'#422b1a', height:1.0, width:1.08, speed:3.9, unlock:0, style:'unblockable'},
  {id:'staff', name:'Tovan Reed', weapon:'Staff', color:'#54a9d9', trim:'#d5f3ff', dark:'#122c42', height:1.08, width:.88, speed:4.15, unlock:2, style:'keepaway'},
  {id:'greatsword', name:'Veyra Dusk', weapon:'Greatsword', color:'#a9b5c5', trim:'#ffffff', dark:'#202734', height:1.16, width:1.26, speed:2.8, unlock:3, style:'massive'}
];

const STAGES = [
  {id:'sunken-temple', name:'Sunken Temple', short:'TEMPLE', kind:'temple', color:'#c88755', sky:'#181a2d', fog:'#5d4650', unlock:0, ringout:'all', bounds:{x:9.8,z:6.8}},
  {id:'skybridge', name:'Skybridge of Vey', short:'BRIDGE', kind:'bridge', color:'#5489b6', sky:'#132b46', fog:'#4e7898', unlock:0, ringout:'long', bounds:{x:11.5,z:3.4}},
  {id:'iron-coliseum', name:'Iron Coliseum', short:'COLISEUM', kind:'coliseum', color:'#9a6471', sky:'#281c28', fog:'#6a4b57', unlock:0, ringout:'none', bounds:{x:8.7,z:8.7}},
  {id:'cliff-shrine', name:'Cliff Shrine', short:'SHRINE', kind:'shrine', color:'#b56a4c', sky:'#2b1e31', fog:'#754f57', unlock:0, ringout:'one', bounds:{x:8.5,z:6.1}},
  {id:'frozen-lake', name:'Frozen Lake', short:'LAKE', kind:'lake', color:'#76c9df', sky:'#112a47', fog:'#658eac', unlock:1, ringout:'octagon', bounds:{x:10.5,z:8.1}},
  {id:'throne-hall', name:'Throne Hall', short:'THRONE', kind:'throne', color:'#b8844c', sky:'#211923', fog:'#5f4a4d', unlock:2, ringout:'all', bounds:{x:10.2,z:6.6}}
];

const FRAME_DATA = {
  longsword:{H:[['Crescent',.16,.12,.30,8,2.7,1.0],['Second Sun',.18,.12,.34,10,2.8,1.2],['Low Comet',.14,.14,.32,9,2.45,1.1]],V:[['Lancefall',.20,.12,.38,10,2.65,1.15],['Crown Split',.24,.12,.42,13,2.55,1.3],['Dawn Pillar',.28,.16,.48,16,2.5,1.5]],K:[['Heel Spark',.10,.10,.28,5,1.65,.55]]},
  glaive:{H:[['Reed Sweep',.20,.14,.34,8,3.5,1.25],['Moon Hook',.22,.14,.38,10,3.45,1.35],['Long Turn',.24,.16,.42,11,3.3,1.55]],V:[['High Harvest',.26,.14,.42,11,3.25,1.4],['Shaft Rise',.29,.15,.46,13,3.1,1.6],['Sky Reaper',.34,.18,.52,17,3.2,1.85]],K:[['Staff Kick',.10,.10,.30,5,1.7,.6]]},
  daggers:{H:[['Flash Left',.08,.10,.20,5,1.8,.65],['Flash Right',.08,.10,.20,5,1.85,.7],['Cross Stitch',.10,.11,.23,7,1.9,.8]],V:[['Needle Rise',.10,.10,.22,6,1.8,.75],['Twin Lift',.12,.10,.25,7,1.9,.9],['Skylace',.15,.12,.29,10,2.0,1.0]],K:[['Knee Tap',.08,.10,.22,4,1.35,.5]]},
  axe:{H:[['Bitter Hew',.25,.16,.48,13,2.4,1.55],['Red Wheel',.28,.17,.50,15,2.55,1.75],['Fell Crescent',.32,.18,.58,19,2.7,2.05]],V:[['Woodsplit',.27,.16,.5,15,2.4,1.7],['Anvil Drop',.34,.17,.55,18,2.5,1.95],['Quarry End',.4,.2,.64,24,2.55,2.35]],K:[['Knee Ram',.12,.10,.34,6,1.55,.7]]},
  rapier:{H:[['Silver Line',.11,.10,.26,6,2.65,.8],['Pale Return',.12,.10,.28,7,2.7,.9],['Lattice Cut',.14,.12,.31,8,2.75,1.0]],V:[['Needle Point',.12,.10,.27,7,2.85,.9],['Bell Thrust',.14,.11,.3,8,2.9,1.05],['Star Pierce',.18,.12,.34,11,3.0,1.2]],K:[['Toe Flick',.08,.10,.22,4,1.4,.5]]},
  flail:{H:[['Chain Arc',.20,.18,.38,10,2.7,1.25],['Orbit Lash',.22,.2,.4,11,2.9,1.35],['Rattle Wheel',.26,.22,.44,13,3.0,1.55]],V:[['Bell Drop',.25,.16,.44,12,2.6,1.45],['Iron Pendulum',.3,.18,.5,15,2.8,1.7],['Grave Swing',.35,.2,.56,19,2.9,2.0]],K:[['Chain Snare',.12,.13,.34,7,1.7,.8,true]]},
  staff:{H:[['Long Orbit',.18,.14,.34,7,3.0,1.0],['Cinder Staff',.2,.15,.36,9,3.1,1.2],['Gate Sweep',.22,.16,.4,10,3.15,1.35]],V:[['Pole Vault',.22,.14,.38,9,3.0,1.25],['Cloud Knell',.25,.16,.42,11,3.1,1.4],['Sky Lock',.3,.18,.48,15,3.2,1.7]],K:[['Quick Step',.08,.10,.24,4,1.5,.55]]},
  greatsword:{H:[['Grave Arc',.3,.18,.6,17,2.75,2.0],['Black Horizon',.34,.2,.64,20,2.85,2.2],['World Ender',.38,.22,.72,25,2.95,2.55]],V:[['Dread Rise',.34,.18,.64,19,2.7,2.1],['Sky Cleaver',.4,.2,.72,23,2.8,2.4],['Mournfall',.46,.23,.8,30,2.9,2.85]],K:[['Boot Crush',.14,.10,.38,8,1.7,.85]]}
};
const CHAINS = {
  longsword:[['H','H','V'],['V','H','V'],['H','V','K']], glaive:[['H','H','V'],['H','V','V'],['V','H','K']],
  daggers:[['H','H','H','V'],['H','V','H','H'],['V','H','V','K']], axe:[['H','H','V'],['V','V','H'],['H','V','K']],
  rapier:[['H','V','H','V'],['V','H','H'],['H','H','K']], flail:[['H','H','V'],['V','H','V'],['H','V','K']],
  staff:[['H','H','V'],['V','H','V'],['H','V','K']], greatsword:[['H','V','H'],['V','V','H'],['H','H','K']]
};

function moveFrom(key, kind, index) {
  const row = FRAME_DATA[key][kind] || FRAME_DATA.longsword[kind];
  const raw = row[index % row.length];
  return {name:raw[0], kind, startup:raw[1], active:raw[2], recovery:raw[3], damage:raw[4], range:raw[5], knockback:raw[6], unblockable:!!raw[7]};
}
function fighterById(id) { return FIGHTERS.find((f) => f.id === id) || FIGHTERS[0]; }
function stageById(id) { return STAGES.find((s) => s.id === id) || STAGES[0]; }

const fallback = {ready:false,mode:'menu',scene:'boot',p1:'Auren Vale',p2:'Brakka Ohn',fighter1:'longsword',fighter2:'axe',stage:'sunken-temple',round:1,hp:[100,100],timer:60,roundWins:[0,0],aiVsAi:false};
const hook = (window.__ds && typeof window.__ds === 'object') ? window.__ds : {};
hook.state = (hook.state && typeof hook.state === 'object') ? hook.state : fallback;
Object.assign(hook.state, fallback, hook.state);
if (!Object.prototype.hasOwnProperty.call(hook, 'forceMatch')) hook.forceMatch = null;
if (!Object.prototype.hasOwnProperty.call(hook, 'forceStage')) hook.forceStage = null;
if (!Object.prototype.hasOwnProperty.call(hook, 'forceWin')) hook.forceWin = false;
if (!Object.prototype.hasOwnProperty.call(hook, 'aiVsAi')) hook.aiVsAi = false;
window.__ds = hook;
const DS_STATE = hook.state;

const DEFAULT_SAVE = {v:SAVE_VERSION, tutorial:false, arcadeClear:0, medals:[0,0,0,0], unlockedFighters:[true,true,true,true,true,true,false,false], unlockedStages:[true,true,true,true,false,false], altPalettes:false, bestSurvival:0};
function validBoolArray(value, length) { return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'boolean'); }
function validInt(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function validSave(v) {
  if (!v || !validInt(v.v, 1, SAVE_VERSION) || typeof v.tutorial !== 'boolean' || !validInt(v.arcadeClear,0,10) || (!(v.v===1 && v.bestSurvival==null) && !validInt(v.bestSurvival,0,10000)) || typeof v.altPalettes !== 'boolean') return false;
  if (!Array.isArray(v.medals) || v.medals.length !== 4 || !v.medals.every((medal) => validInt(medal,0,4))) return false;
  if (!validBoolArray(v.unlockedFighters,8) || !validBoolArray(v.unlockedStages,6)) return false;
  if (!v.unlockedFighters.slice(0,6).every(Boolean) || !v.unlockedStages.slice(0,4).every(Boolean)) return false;
  return true;
}
const kit = window.GGKit.create({
  slug:'duelsteel', orientation:'landscape', validateSave:validSave,
  onPause:() => { inputEdges.h = inputEdges.v = inputEdges.k = inputEdges.g = false; inputState.edgeQueue.length=0; inputState.menuQueue.length=0; if (match) match.paused = true; },
  onResume:() => { if (match) match.paused = false; },
  onRestart:() => { if (match) startMatch(match.mode, match.stage.id, match.p1Spec.id, match.p2Spec.id, match.difficulty); }
});
const loadedSave = kit.save.get(DEFAULT_SAVE);
const save = Object.assign({}, DEFAULT_SAVE, loadedSave);
if (save.v === 1) save.v = SAVE_VERSION;
save.medals = Array.isArray(save.medals) ? save.medals.slice(0,4) : DEFAULT_SAVE.medals.slice();
save.unlockedFighters = Array.isArray(save.unlockedFighters) ? save.unlockedFighters.slice(0,8) : DEFAULT_SAVE.unlockedFighters.slice();
save.unlockedStages = Array.isArray(save.unlockedStages) ? save.unlockedStages.slice(0,6) : DEFAULT_SAVE.unlockedStages.slice();
if (!validSave(save)) Object.assign(save, copy(DEFAULT_SAVE));
if (loadedSave !== DEFAULT_SAVE && loadedSave.v !== SAVE_VERSION) kit.save.set(save);
function persist() { kit.save.set(save); }
kit.audio.register({
  musicForge:'audio/music-forge.mp3', musicVeil:'audio/music-veil.mp3', whoosh:'audio/sfx-whoosh.mp3', heavy:'audio/sfx-heavy.mp3',
  dagger:'audio/sfx-dagger.mp3', clash:'audio/sfx-clash.mp3', guard:'audio/sfx-guard.mp3', parry:'audio/sfx-parry.mp3',
  hit:'audio/sfx-hit.mp3', kick:'audio/sfx-kick.mp3', ringout:'audio/sfx-ringout.mp3', crowd:'audio/sfx-crowd.mp3', ui:'audio/sfx-ui.mp3'
});
const reduceQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
if (reduceQuery && reduceQuery.matches) kit.juice.enabled = false;
const motionOn = () => kit.juice.enabled !== false;
const sfx = (name, volume=0.8) => kit.audio.sfx(name, {volume});

const app = document.getElementById('app');
const boot = document.getElementById('boot');
const bootCopy = document.getElementById('boot-copy');
const hud = document.createElement('div');
hud.id = 'ds-hud';
hud.innerHTML = '<div class="ds-top"><div class="ds-health ds-p1"><span class="ds-name" id="ds-p1-name"></span><div class="ds-bar"><i id="ds-p1-bar"></i></div><span class="ds-pips" id="ds-p1-pips"></span></div><div class="ds-center"><span class="ds-round" id="ds-round">ROUND 1</span><strong id="ds-timer">60</strong><small id="ds-stage"></small></div><div class="ds-health ds-p2"><span class="ds-name" id="ds-p2-name"></span><div class="ds-bar"><i id="ds-p2-bar"></i></div><span class="ds-pips" id="ds-p2-pips"></span></div><button id="ds-pause" aria-label="Pause and settings">Ⅱ</button></div><div id="ds-transient" aria-live="polite"></div><div id="ds-menu"></div><div id="ds-controls"><div class="ds-stick" aria-label="Move fighter"><i></i><b></b></div><div class="ds-buttons"><button data-control="H" aria-label="Horizontal strike">↔</button><button data-control="V" aria-label="Vertical strike">⇡</button><button data-control="K" aria-label="Kick or throw">✦</button><button data-control="G" aria-label="Guard">◈</button></div></div>';
app.appendChild(hud);
const style = document.createElement('style');
style.textContent = `
#ds-hud{position:absolute;inset:0;z-index:3;pointer-events:none;color:#eef3fb;font-size:14px;letter-spacing:.03em}
.ds-top{position:absolute;top:10px;left:calc(16px + env(safe-area-inset-left));right:calc(16px + env(safe-area-inset-right));padding-top:env(safe-area-inset-top);display:grid;grid-template-columns:minmax(150px,1fr) 112px minmax(150px,1fr) 44px;gap:14px;align-items:start}
.ds-health{min-width:0}.ds-p2{text-align:right}.ds-name{display:block;min-height:17px;font-size:12px;color:#d5deeb;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ds-p2 .ds-name{direction:rtl}.ds-bar{height:13px;background:#182231;border:1px solid #52647b;box-shadow:0 2px 0 #05070b inset;overflow:hidden}.ds-p1 .ds-bar{transform:skewX(-14deg);transform-origin:right}.ds-p2 .ds-bar{transform:skewX(14deg);transform-origin:left}.ds-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#e6b76c,#fff1b5);transition:width .1s linear}.ds-p2 .ds-bar i{margin-left:auto;background:linear-gradient(90deg,#a7caff,#dcecff)}.ds-pips{display:block;margin-top:4px;color:#e2b86b;letter-spacing:4px;font-size:12px}.ds-p2 .ds-pips{color:#a7caff}.ds-center{text-align:center}.ds-round{display:block;color:#e2b86b;font-size:10px;letter-spacing:.18em}.ds-center strong{display:block;font-family:Georgia,serif;font-size:32px;line-height:31px;font-weight:500}.ds-center small{display:block;color:#92a2b8;font-size:10px;letter-spacing:.14em;margin-top:3px}.ds-top,.ds-health,.ds-center{filter:drop-shadow(0 2px 3px #000b)}
#ds-transient{position:absolute;top:48px;left:50%;transform:translateX(-50%);max-width:72vw;padding:6px 14px;border-bottom:1px solid #e2b86b;color:#d9e4f2;background:#0b111bd9;text-align:center;font-size:12px;white-space:nowrap;opacity:0;transition:opacity .18s ease;pointer-events:none}.ds-transient-on{opacity:.94}
#ds-pause{display:none;width:44px;height:44px;padding:0;border:1px solid #a8b7cc99;background:#111c2ddd;color:#f4db9a;font-size:18px;pointer-events:auto;cursor:pointer}.ds-playing #ds-pause{display:block}
#ds-controls{display:none}.ds-playing #ds-controls{display:block}.ds-stick{position:absolute;left:20px;bottom:calc(20px + env(safe-area-inset-bottom));width:116px;height:116px;border:1px solid #9fb3c933;border-radius:50%;background:#10203388;box-shadow:inset 0 0 0 10px #0b142099;pointer-events:none}.ds-stick i{position:absolute;inset:20px;border:1px solid #d9e7f333;border-radius:50%}.ds-stick b{position:absolute;left:39px;top:39px;width:38px;height:38px;border-radius:50%;background:#dbe8f044;border:1px solid #e7f0ff77}.ds-buttons{position:absolute;right:18px;bottom:calc(15px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(2,64px);gap:10px;pointer-events:auto}.ds-buttons button{width:64px;height:64px;border-radius:50%;border:1px solid #b3c1d699;background:#162335dd;color:#e9eff8;font-weight:800;font-size:18px;box-shadow:0 5px 0 #05080e99;touch-action:none}.ds-buttons button:nth-child(1){color:#f2d18f}.ds-buttons button:nth-child(2){color:#a9d0ff}.ds-buttons button:nth-child(3){color:#ffad88}.ds-buttons button:nth-child(4){color:#a8e5c5}.ds-buttons button:active{transform:translateY(3px);background:#344860}
#ds-menu{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;background:linear-gradient(90deg,#070b14cc,#070b1488 50%,#070b14cc);overflow:auto}.ds-menu-hide{display:none!important}.ds-panel{width:min(92vw,820px);max-height:92vh;overflow:auto;padding:24px 28px;border:1px solid #3a4c63;background:linear-gradient(135deg,#0b111ddd,#121b2be8);box-shadow:0 20px 80px #0009}.ds-kicker{font-size:11px;letter-spacing:.24em;color:#e2b86b}.ds-panel h1{margin:4px 0 6px;font:500 clamp(38px,7vw,72px)/.92 Georgia,serif;letter-spacing:.04em}.ds-panel h2{margin:0 0 16px;font:500 28px Georgia,serif}.ds-sub{color:#9cacc2;max-width:560px;line-height:1.45;margin:0 0 18px}.ds-actions{display:flex;flex-wrap:wrap;gap:10px}.ds-action{min-height:48px;padding:11px 17px;border:1px solid #576c86;background:#172337;color:#eff5fd;cursor:pointer;letter-spacing:.06em}.ds-action.primary{border-color:#e2b86b;background:#a26c37;color:#fff5dd}.ds-action.small{min-height:44px;padding:8px 12px;font-size:13px}.ds-grid{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:8px;margin:12px 0 18px}.ds-card{min-height:74px;padding:10px;border:1px solid #364960;background:#101a2a;color:#e9f0fa;text-align:left;cursor:pointer}.ds-card strong{display:block;font-size:13px}.ds-card span{display:block;margin-top:6px;color:#9cacbf;font-size:11px}.ds-card.selected{border-color:#e2b86b;background:#2b2730}.ds-card.locked{opacity:.42}.ds-card.stage{min-height:58px}.ds-row-label{margin-top:12px;color:#9cacc2;font-size:11px;letter-spacing:.15em}.ds-orbs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}.ds-orb{width:118px;min-height:82px;padding:9px;border:1px solid #e2b86b;background:radial-gradient(circle at 50% 24%,#684d3d,#182337 65%);color:#fff4c8;cursor:pointer}.ds-orb span{display:block;color:#fff8d3;font-size:20px}.ds-orb strong{display:block;font-size:17px}.ds-orb small{display:block;margin-top:5px;color:#b9c7d8;font-size:9px;letter-spacing:.12em}.ds-foot{margin-top:18px;font-size:12px;color:#7f91a9}.ds-lock{color:#d9a262!important}
@media (max-width:700px){.ds-top{left:calc(10px + env(safe-area-inset-left));right:calc(10px + env(safe-area-inset-right));grid-template-columns:minmax(90px,1fr) 72px minmax(90px,1fr) 44px;gap:6px}.ds-center strong{font-size:26px}.ds-name{font-size:10px}.ds-bar{height:11px}.ds-stick{left:calc(12px + env(safe-area-inset-left));bottom:calc(12px + env(safe-area-inset-bottom));width:100px;height:100px}.ds-stick b{left:32px;top:32px}.ds-buttons{right:calc(10px + env(safe-area-inset-right));bottom:calc(9px + env(safe-area-inset-bottom));grid-template-columns:repeat(2,56px);gap:7px}.ds-buttons button{width:56px;height:56px}.ds-grid{grid-template-columns:repeat(2,minmax(110px,1fr))}.ds-panel{padding:19px 18px}.ds-panel h1{font-size:42px}}
`;
document.head.appendChild(style);
const p1Name = document.getElementById('ds-p1-name');
const p2Name = document.getElementById('ds-p2-name');
const p1Bar = document.getElementById('ds-p1-bar');
const p2Bar = document.getElementById('ds-p2-bar');
const p1Pips = document.getElementById('ds-p1-pips');
const p2Pips = document.getElementById('ds-p2-pips');
const timerEl = document.getElementById('ds-timer');
const roundEl = document.getElementById('ds-round');
const stageEl = document.getElementById('ds-stage');
const transientEl = document.getElementById('ds-transient');
const menuEl = document.getElementById('ds-menu');
const controlsEl = document.getElementById('ds-controls');
const pauseButton = document.getElementById('ds-pause');

function makeMenuButton(label, action, primary=false, small=false) {
  return `<button class="ds-action${primary?' primary':''}${small?' small':''}" data-action="${action}">${label}</button>`;
}
function fighterCard(spec, selected) {
  const unlocked = save.unlockedFighters[FIGHTERS.indexOf(spec)] || hook.forceMatch || hook.aiVsAi;
  return `<button class="ds-card${selected?' selected':''}${unlocked?'':' locked'}" data-action="fighter:${spec.id}"><strong>${spec.name}</strong><span>${unlocked ? spec.weapon : 'LOCKED // LADDER'}</span></button>`;
}
function stageCard(spec, selected) {
  const unlocked = save.unlockedStages[STAGES.indexOf(spec)] || hook.forceStage != null;
  return `<button class="ds-card stage${selected?' selected':''}${unlocked?'':' locked'}" data-action="stage:${spec.id}"><strong>${spec.short}</strong><span>${unlocked ? spec.name : 'LOCKED'}</span></button>`;
}
let menuDirty = true;
function renderMenu() {
  if (!menuDirty) return;
  menuDirty = false;
  if (screen === 'menu') {
    menuEl.innerHTML = `<div class="ds-panel"><div class="ds-kicker">ORIGINAL WEAPON DUELS // LANDSCAPE</div><h1>DUELSTEEL</h1><p class="ds-sub">Eight combat silhouettes. Six edge-defined arenas. Read the arc, find the ring, and make the bell stop.</p><div class="ds-actions">${makeMenuButton('ARCADE LADDER','mode:arcade',true)}${makeMenuButton('VS AI','mode:versus')}${makeMenuButton('SURVIVAL','mode:survival')}${makeMenuButton('HOW TO FIGHT','howto')}${makeMenuButton('FULLSCREEN','fullscreen',false,true)}</div><p class="ds-foot">${save.arcadeClear ? 'Ladder clears: '+save.arcadeClear+'/10 // medals '+save.medals.filter(Boolean).length+'/4' : 'First duel: move, strike, guard, and own the edge.'}</p></div>`;
  } else if (screen === 'howto') {
    menuEl.innerHTML = `<div class="ds-panel"><div class="ds-kicker">THIN STRIP TUTORIAL</div><h2>Read the weapon, then the floor.</h2><p class="ds-sub">Move with the stick. Use ↔ for a horizontal strike, ⇡ for a vertical strike, ✦ for kick or throw, and ◈ for guard. Tap guard just before contact for Guard Impact. Own the lit edge for a ring-out.</p><div class="ds-actions">${makeMenuButton('BACK','back',true)}${makeMenuButton('FULLSCREEN','fullscreen',false,true)}</div></div>`;
  } else {
    const modeLabel = menuMode === 'arcade' ? 'ARCADE LADDER' : menuMode === 'survival' ? 'SURVIVAL // GENEROUS REGEN' : 'VERSUS AI';
    menuEl.innerHTML = `<div class="ds-panel"><div class="ds-kicker">${modeLabel}</div><h2>Set the duel</h2><div class="ds-row-label">YOUR FIGHTER</div><div class="ds-grid">${FIGHTERS.map((f) => fighterCard(f, f.id === setupP1)).join('')}</div><div class="ds-row-label">STAGE</div><div class="ds-grid">${STAGES.map((s) => stageCard(s, s.id === setupStage)).join('')}</div><div class="ds-row-label">DIFFICULTY</div><div class="ds-actions">${[0,1,2,3].map((d) => makeMenuButton(['NOVICE','VETERAN','ELITE','DUELMASTER'][d], 'diff:'+d, d === setupDifficulty, true)).join('')}</div><div class="ds-actions" style="margin-top:18px">${makeMenuButton('BACK','back')}${makeMenuButton(menuMode === 'arcade' ? 'ENTER THE LADDER' : 'BEGIN DUEL','start',true)}${makeMenuButton('FULLSCREEN','fullscreen',false,true)}</div><p class="ds-foot">${menuMode === 'arcade' ? 'Ten forged encounters. Each challenger raises the tactical pressure.' : menuMode === 'survival' ? 'Health carries. Choose one of three visible regen orbs between duels.' : 'Best of three rounds. 60 seconds. Ring-outs decide the boundary.'}</p></div>`;
  }
}

let scene, camera, renderer, world, arenaRoot, fightersRoot, fxRoot;
const cameraAnchor = new THREE.Vector3(0,8.7,16.2);
const cameraLook = new THREE.Vector3(0,1.2,0);
const cameraTarget = new THREE.Vector3();
const cameraAim = new THREE.Vector3();
let cameraFrame = {x:0,y:8.7,z:16.2,zoom:0};
const stageViews = [];
const inputEdges = {h:false,v:false,k:false,g:false};
const pointerRects = {h:{},v:{},k:{},g:{},stick:{}};
const inputState = {lastMenuPress:0, lastHudRect:0, prevH:false, prevV:false, prevK:false, prevG:false, prevEnter:false, prevEscape:false, edgeQueue:[], menuQueue:[]};
let screen = 'menu';
let menuMode = 'versus';
let setupP1 = 'longsword';
let setupP2 = 'axe';
let setupStage = 'sunken-temple';
let setupDifficulty = 1;
let match = null;
const combatEvents = [];
let lastNow = performance.now();
let accumulator = 0;
let visualTime = 0;
const transient = {current:'', until:0, queue:[]};
let errorText = '';

function updatePointerRects() {
  const buttons = controlsEl.querySelectorAll('button[data-control]');
  for (const b of buttons) { const r = b.getBoundingClientRect(); pointerRects[b.dataset.control.toLowerCase()] = {x:r.left,y:r.top,w:r.width,h:r.height}; }
  const r = document.querySelector('.ds-stick').getBoundingClientRect(); pointerRects.stick = {x:r.left,y:r.top,w:r.width,h:r.height};
  inputState.lastHudRect = performance.now();
}
function inRect(p, r) { return !!(p && r && p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h); }
function startInRect(p, r) { return !!(p && r && p.startX >= r.x && p.startX <= r.x+r.w && p.startY >= r.y && p.startY <= r.y+r.h); }
function queueEdge(control) { if (inputState.edgeQueue.length < 16) inputState.edgeQueue.push(control); }
function consumeEdge(control) { const index = inputState.edgeQueue.indexOf(control); if (index < 0) return false; inputState.edgeQueue.splice(index,1); return true; }
function pointerHeldRect(r) { for (const p of kit.input.pointers.values()) if (inRect(p,r) || startInRect(p,r)) return true; return false; }
function keyEdge(code, field) {
  const now = kit.input.keyDown(code);
  const old = inputState[field]; inputState[field] = now;
  return now && !old;
}
function syncInput() {
  if (performance.now() - inputState.lastHudRect > 250) updatePointerRects();
  const h = consumeEdge('H') || keyEdge('KeyJ','prevH');
  const v = consumeEdge('V') || keyEdge('KeyI','prevV');
  const k = consumeEdge('K') || keyEdge('KeyK','prevK');
  const g = consumeEdge('G') || keyEdge('KeyL','prevG');
  inputEdges.h = h; inputEdges.v = v; inputEdges.k = k; inputEdges.g = g;
  return {h,v,k,g,guard:pointerHeldRect(pointerRects.g) || kit.input.keyDown('KeyF') || kit.input.keyDown('KeyL')};
}
function stickAxes() {
  let x = 0, z = 0;
  for (const p of kit.input.pointers.values()) if (inRect(p,pointerRects.stick) || startInRect(p,pointerRects.stick)) {
    const cx = pointerRects.stick.x + pointerRects.stick.w * .5, cy = pointerRects.stick.y + pointerRects.stick.h * .5;
    const max = pointerRects.stick.w * .42;
    x = clamp((p.x - cx) / max, -1, 1); z = clamp((p.y - cy) / max, -1, 1);
    break;
  }
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) x = -1;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) x = 1;
  if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) z = -1;
  if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) z = 1;
  const mag = Math.hypot(x,z);
  if (mag > 1) { x /= mag; z /= mag; }
  return {x,z};
}
function consumeMenuPress() {
  if (performance.now() - inputState.lastMenuPress < 80) return null;
  const action = inputState.menuQueue.shift();
  if (action) { inputState.lastMenuPress = performance.now(); return action; }
  if (keyEdge('Enter','prevEnter')) { inputState.lastMenuPress = performance.now(); return 'start'; }
  return null;
}
function setTransient(text, seconds=1, priority=false) {
  const entry = {text, seconds};
  if (transient.current && performance.now() < transient.until && !priority) { if (transient.queue.length < 4) transient.queue.push(entry); return; }
  transient.current = entry.text; transient.until = performance.now() + entry.seconds * 1000; transientEl.textContent = entry.text; transientEl.classList.add('ds-transient-on');
}
function toast(text, seconds=1) { setTransient(text, seconds, true); }
function coach(text, seconds=3.2) { setTransient(text, seconds, false); }
function tickTransient() {
  if (transient.current && performance.now() >= transient.until) {
    const next = transient.queue.shift();
    if (next) { transient.current = next.text; transient.until = performance.now() + next.seconds * 1000; transientEl.textContent = next.text; }
    else { transient.current = ''; transientEl.textContent = ''; transientEl.classList.remove('ds-transient-on'); }
  }
}
controlsEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-control]');
  if (button) { event.preventDefault(); queueEdge(button.dataset.control); }
});
menuEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button) { event.preventDefault(); inputState.menuQueue.push(button.dataset.action); }
});
pauseButton.addEventListener('click', () => openGameSettings());

const textureCache = new Map();
function patternTexture(key, color, accent) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width=128; canvas.height=128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle=color; ctx.fillRect(0,0,128,128); ctx.strokeStyle=accent; ctx.globalAlpha=.24; ctx.lineWidth=2;
  for(let i=-128;i<256;i+=16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+128,128);ctx.stroke();ctx.beginPath();ctx.moveTo(i,128);ctx.lineTo(i+128,0);ctx.stroke();}
  ctx.globalAlpha=.16; for(let i=0;i<128;i+=32){ctx.fillRect(i,0,1,128);ctx.fillRect(0,i,128,1);}
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS=THREE.RepeatWrapping; texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(3,3); texture.colorSpace=THREE.SRGBColorSpace; textureCache.set(key,texture); return texture;
}
function material(color, roughness=.72, metalness=.05, transparent=false, map=null) {
  return new THREE.MeshStandardMaterial({color:tint(color), map, roughness, metalness, flatShading:false, transparent, opacity:transparent?.55:1, depthWrite:!transparent});
}
function addMesh(parent, geometry, mat, position, rotation) {
  const mesh = new THREE.Mesh(geometry, mat);
  if (position) mesh.position.set(position[0],position[1],position[2]);
  if (rotation) mesh.rotation.set(rotation[0],rotation[1],rotation[2]);
  mesh.castShadow = !mat.transparent;
  mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function addBox(parent, size, color, position, rotation, opts) { return addMesh(parent,new THREE.BoxGeometry(size[0],size[1],size[2]),material(color,opts?.roughness??.72,opts?.metalness??.05,opts?.transparent??false,opts?.map||null),position,rotation); }
function addPlate(parent, points, depth, color, position, rotation, opts) {
  const shape = new THREE.Shape(); shape.moveTo(points[0][0],points[0][1]); for(let i=1;i<points.length;i++) shape.lineTo(points[i][0],points[i][1]); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.035,bevelThickness:.035}); geometry.translate(0,0,-depth*.5);
  return addMesh(parent,geometry,material(color,opts?.roughness??.42,opts?.metalness??.3,opts?.transparent??false,opts?.map||null),position,rotation);
}
function stageMaterial(spec, roughness=.82, metalness=.08) { return material(spec.color,roughness,metalness,false,patternTexture(spec.id,spec.color,spec.trim||'#ffffff')); }
function octagonVertices(spec) { return Array.from({length:8},(_,index)=>{const angle=index*TAU/8;return [spec.bounds.x*Math.cos(angle),spec.bounds.z*Math.sin(angle)];}); }
function polygonShape(vertices) { const shape=new THREE.Shape(); shape.moveTo(vertices[0][0],vertices[0][1]); for(let i=1;i<vertices.length;i++)shape.lineTo(vertices[i][0],vertices[i][1]); shape.closePath(); return shape; }
function makeStage(spec) {
  const group = new THREE.Group(); group.name = 'stage-'+spec.id; group.visible = false;
  const floorMat = stageMaterial(spec,.88,.16); const edgeMat = material('#e26758',.4,.2,true); const darkMat = material('#181923',.85,.2,false,patternTexture('dark-'+spec.id,'#181923','#7c6170')); const accentMat = material('#e2b86b',.38,.62);
  let floor;
  if (spec.kind === 'coliseum') floor = addMesh(group,new THREE.CylinderGeometry(spec.bounds.x,spec.bounds.x,.34,32),floorMat,[0,0,0]);
  else if (spec.kind === 'lake') floor = addMesh(group,new THREE.ShapeGeometry(polygonShape(octagonVertices(spec))),floorMat,[0,.02,0],[-Math.PI/2,0,0]);
  else floor = addBox(group,[spec.bounds.x*2,.34,spec.bounds.z*2],spec.color,[0,0,0]);
  floor.name = 'arena-floor';
  if (spec.kind !== 'coliseum' && spec.kind !== 'lake') addMesh(group,new THREE.PlaneGeometry(spec.bounds.x*2.02,spec.bounds.z*2.02),stageMaterial(spec,1,.05),[0,.19,0],[-Math.PI/2,0,0]);
  const base = addBox(group,[spec.bounds.x*2+.7,.5,spec.bounds.z*2+.7],darkMat,[0,-.35,0]); base.name='arena-base';
  if (spec.kind === 'coliseum') {
    addMesh(group,new THREE.TorusGeometry(spec.bounds.x+.08,.22,8,32),accentMat,[0,.35,0]);
    addMesh(group,new THREE.TorusGeometry(spec.bounds.x-.25,.06,6,32),edgeMat,[0,.38,0]);
    for (let i=0;i<12;i++){const a=i*TAU/12; addBox(group,[.55,1.5,.55],i%2?'#5f404a':'#7b5960',[(spec.bounds.x+.55)*Math.cos(a),.55,(spec.bounds.x+.55)*Math.sin(a)]);}
  } else {
    const dangerous = spec.ringout === 'all' || spec.ringout === 'long' || spec.ringout === 'octagon' || spec.ringout === 'one';
    if (dangerous) {
      const ring = new THREE.LineSegments(new THREE.EdgesGeometry(floor.geometry),new THREE.LineBasicMaterial({color:tint('#ed7968'),transparent:true,opacity:.85}));
      ring.position.y=.22; group.add(ring);
      if (spec.ringout === 'one') addBox(group,[spec.bounds.x*2,.52,.5],'#49323b',[0,.23,-spec.bounds.z-.25]);
    }
  }
  if (spec.kind === 'temple') {
    for (let i=-1;i<=1;i+=2) { addBox(group,[.7,3.6,.7],'#8a5546',[i*6.8,1.7,-4.4]); addBox(group,[.7,3.2,.7],'#9e6b50',[i*7.8,1.5,4.3]); }
    addBox(group,[15,.45,.65],'#d59a62',[0,3.38,-4.4]);
    addMesh(group,new THREE.TorusGeometry(2.2,.13,7,16,Math.PI),accentMat,[0,2.8,4.2],[0,Math.PI,0]);
  } else if (spec.kind === 'bridge') {
    for (let i=-4;i<=4;i+=2) { addBox(group,[.55,2.7,.55],'#3d607c',[i*2.2,1.2,-2.9]); addBox(group,[.55,2.7,.55],'#3d607c',[i*2.2,1.2,2.9]); }
    addBox(group,[23,.25,.3],'#d7ad68',[0,2.55,-3.0]); addBox(group,[23,.25,.3],'#d7ad68',[0,2.55,3.0]);
  } else if (spec.kind === 'shrine') {
    addBox(group,[15,.4,.55],'#6d3e43',[0,2.9,-5.5]); addBox(group,[.55,3.1,.55],'#7b4c45',[-6.8,1.45,-5.4]); addBox(group,[.55,3.1,.55],'#7b4c45',[6.8,1.45,-5.4]);
    addBox(group,[15,.55,.45],'#d29561',[0,.35,5.9]);
  } else if (spec.kind === 'lake') {
    for (let i=0;i<10;i++){const a=i*TAU/10; const r=spec.bounds.x*.76; addMesh(group,new THREE.ConeGeometry(.35,1.1,5),material(i%2?'#c7f4fa':'#8fd5e9',.35,.1),[r*Math.cos(a),.45,r*Math.sin(a)]);}
    for (let i=0;i<8;i++) addBox(group,[.08,.04,4.5], '#d9fbff',[0,.23,(i-3.5)*2],[0,(i%2)*.12,0],{transparent:true});
  } else if (spec.kind === 'throne') {
    for (let x=-1;x<=1;x+=2) for (let z=-1;z<=1;z+=2) addBox(group,[.8,3.4,.8],'#704842',[x*7.3,1.7,z*4.5]);
    addBox(group,[4,3.3,.8],'#a56b48',[0,1.65,-5.5]); addBox(group,[2.6,1.9,.6],'#d6a45a',[0,2.55,-5.0]);
    addMesh(group,new THREE.TorusGeometry(2.6,.09,6,20),accentMat,[0,3.5,-5.3],[Math.PI/2,0,0]);
  }
  const crowdMat = material('#22293c',.9,.02,false,patternTexture('crowd','#22293c','#6f7d9a')); const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.18,.55,3,5),crowdMat,22); const dummy = new THREE.Object3D();
  for (let i=0;i<22;i++){const side=i%2?-1:1; dummy.position.set(-9+i*.85, .55+(i%3)*.08, side*(spec.bounds.z+1.15)); dummy.rotation.y=(i%2)*Math.PI; dummy.scale.set(1,1+(i%4)*.18,1); dummy.updateMatrix(); crowd.setMatrixAt(i,dummy.matrix);} group.add(crowd);
  const haze = addMesh(group,new THREE.CircleGeometry(spec.bounds.x*.82,24),material('#ffffff',1,0,true),[0,.37,0],[-Math.PI/2,0,0]); haze.material.opacity=.045;
  const backdrop = addBox(group,[spec.bounds.x*2.8,5,.22],spec.sky,[0,2.5,-spec.bounds.z-4],null,{roughness:1,map:patternTexture('backdrop-'+spec.id,spec.sky,spec.fog)}); backdrop.receiveShadow=true;
  return {group,spec,floor};
}

function makeWeapon(spec, darkMat, metalMat, gripMat) {
  const root = new THREE.Group(); root.name='weapon-'+spec.id;
  addMesh(root,new THREE.CylinderGeometry(.055,.07,.55,8),gripMat,[0,-.24,0]);
  let blade;
  if (spec.id === 'glaive') {
    addMesh(root,new THREE.CylinderGeometry(.045,.075,2.5,8),darkMat,[0,1.18,0]);
    blade=addPlate(root,[[0,0],[.32,.28],[.18,.95],[-.04,1.36],[-.22,.85],[-.12,.18]],.12,spec.trim,[0,1.92,0],null,{metalness:.72});
  } else if (spec.id === 'staff') {
    blade=addMesh(root,new THREE.CylinderGeometry(.075,.085,2.7,10),metalMat,[0,1.18,0]);
    addMesh(root,new THREE.TorusGeometry(.15,.035,6,12),gripMat,[0,2.43,0],[Math.PI/2,0,0]);
  } else if (spec.id === 'daggers') {
    blade=addPlate(root,[[0,0],[.16,.12],[.07,.72],[-.07,.72],[-.16,.12]],.1,spec.trim,[0,.38,0],null,{metalness:.76});
    addPlate(root,[[0,0],[.14,.1],[.05,.62],[-.06,.62],[-.14,.1]],.09,spec.trim,[.2,.38,0],null,{metalness:.76});
  } else if (spec.id === 'flail') {
    blade=addMesh(root,new THREE.IcosahedronGeometry(.28,1),metalMat,[0,1.32,0]);
    addMesh(root,new THREE.CylinderGeometry(.035,.035,1.55,8),darkMat,[0,.64,0],[0,0,.25]);
    for(let i=0;i<3;i++) addMesh(root,new THREE.TorusGeometry(.09,.018,5,10),gripMat,[Math.sin(i)*.12,.9+i*.16,Math.cos(i)*.12],[0,.3,0]);
  } else if (spec.id === 'axe') {
    addMesh(root,new THREE.CylinderGeometry(.06,.08,1.7,8),darkMat,[0,.72,0],[0,0,.1]);
    blade=addPlate(root,[[0,-.34],[.55,-.15],[.62,.18],[.35,.48],[-.04,.3]],.14,spec.trim,[.18,1.0,0],null,{metalness:.74});
  } else {
    const broad = spec.id === 'greatsword'; const rapier = spec.id === 'rapier';
    blade=addPlate(root,[[0,0],[broad?.22:rapier?.045:.11,broad?.16:.08],[broad?.16:rapier?.03:.08,broad?1.9:1.55],[0,broad?2.18:1.78],[-(broad?.16:rapier?.03:.08),broad?1.9:1.55],[-(broad?.22:rapier?.045:.11),broad?.16:.08]],broad?.16:.08,spec.trim,[0,.05,0],null,{metalness:.82});
    if (broad) addPlate(root,[[-.22,0],[.22,0],[.2,.18],[-.2,.18]],.16,spec.trim,[0,.28,0],null,{metalness:.76});
  }
  blade.name='blade';
  addMesh(root,new THREE.TorusGeometry(.16,.035,6,12),gripMat,[0,-.02,0],[Math.PI/2,0,0]);
  addMesh(root,new THREE.IcosahedronGeometry(.09,1),gripMat,[0,-.55,0]);
  return root;
}
function limb(parent, name, x, y, z, sx, sy, sz, color) {
  const g = new THREE.Group(); g.name=name; g.position.set(x,y,z); parent.add(g);
  addBox(g,[sx,sy,sz],color,[0,-sy*.5,0]); return g;
}
function makeAnimationClips() {
  return [
    new THREE.AnimationClip('idle',.8,[new THREE.NumberKeyframeTrack('torso.rotation[z]',[0,.4,.8],[0,.035,0])]),
    new THREE.AnimationClip('guard',.36,[new THREE.NumberKeyframeTrack('torso.rotation[z]',[0,.18,.36],[0,-.08,0])]),
    new THREE.AnimationClip('attack',.42,[new THREE.NumberKeyframeTrack('weapon.rotation[z]',[0,.18,.42],[-.35,1.2,-.2])]),
    new THREE.AnimationClip('stagger',.72,[new THREE.NumberKeyframeTrack('torso.rotation[z]',[0,.12,.3,.72],[0,.24,-.18,0])]),
    new THREE.AnimationClip('victory',1.2,[new THREE.NumberKeyframeTrack('torso.rotation[z]',[0,.6,1.2],[0,.08,0])]),
    new THREE.AnimationClip('fall',.8,[new THREE.NumberKeyframeTrack('.rotation[z]',[0,.8],[0,Math.PI/2])])
  ];
}
function makeFighterRig(spec, side) {
  const root = new THREE.Group(); root.name='fighter-'+spec.id; root.scale.setScalar(spec.height); root.position.y=.22;
  const shadow = addMesh(root,new THREE.CircleGeometry(.8,16),material('#000000',1,0,true),[0,.01,0],[-Math.PI/2,0,0]); shadow.material.opacity=.35;
  const pelvis = new THREE.Group(); pelvis.name='pelvis'; pelvis.position.y=1.02; root.add(pelvis);
  addBox(pelvis,[.78*spec.width,.35,.46],spec.dark,[0,0,0]);
  const torso = new THREE.Group(); torso.name='torso'; torso.position.y=.2; pelvis.add(torso);
  addBox(torso,[.82*spec.width,1.1,.5],spec.color,[0,.44,0],null,{roughness:.56,metalness:.16}); addPlate(torso,[[-.38,.02],[.38,.02],[.32,.72],[0,.94],[-.32,.72]],.1,spec.trim,[0,.22,.28],null,{roughness:.38,metalness:.46}); addBox(torso,[.92*spec.width,.15,.56],spec.trim,[0,.96,0],null,{roughness:.4,metalness:.42});
  const head = new THREE.Group(); head.name='head'; head.position.y=1.38; torso.add(head);
  addMesh(head,new THREE.IcosahedronGeometry(.33,2),material(spec.color,.58,.12),[0,.2,0]); addPlate(head,[[-.3,0],[.3,0],[.22,.16],[-.22,.16]],.08,spec.dark,[0,.42,.03],null,{roughness:.45,metalness:.22});
  if (spec.id==='glaive'||spec.id==='staff') addBox(torso,[.16,.8,.62],spec.trim,[0,.48,.14]);
  if (spec.id==='axe'||spec.id==='greatsword') addMesh(torso,new THREE.ConeGeometry(.28,.7,5),material(spec.trim,.6,.1),[0,.55,.28],[Math.PI/2,0,0]);
  if (spec.id==='daggers') { addBox(head,[.56,.1,.54],spec.trim,[0,.24,.02]); }
  const shoulderL = limb(torso,'upper-arm-l',-.52*spec.width,.92,0,.22,.62,.24,spec.dark); const elbowL = limb(shoulderL,'lower-arm-l',0,-.57,0,.2,.55,.21,spec.color); const handL = limb(elbowL,'hand-l',0,-.52,0,.2,.18,.22,spec.trim);
  const shoulderR = limb(torso,'upper-arm-r',.52*spec.width,.92,0,.22,.62,.24,spec.dark); const elbowR = limb(shoulderR,'lower-arm-r',0,-.57,0,.2,.55,.21,spec.color); const handR = limb(elbowR,'hand-r',0,-.52,0,.2,.18,.22,spec.trim);
  const legL = limb(pelvis,'upper-leg-l',-.25*spec.width,-.02,0,.25,.68,.28,spec.dark); const shinL = limb(legL,'lower-leg-l',0,-.65,0,.22,.65,.26,spec.color); limb(shinL,'foot-l',0,-.62,.12,.24,.18,.45,spec.trim);
  const legR = limb(pelvis,'upper-leg-r',.25*spec.width,-.02,0,.25,.68,.28,spec.dark); const shinR = limb(legR,'lower-leg-r',0,-.65,0,.22,.65,.26,spec.color); limb(shinR,'foot-r',0,-.62,.12,.24,.18,.45,spec.trim);
  const weapon = makeWeapon(spec,material(spec.dark,.55,.35),material(spec.trim,.22,.72),material(spec.color,.62,.12)); weapon.position.set(.04,-.16,.02); handR.add(weapon);
  const cape = spec.id==='glaive'||spec.id==='flail' ? addBox(torso,[.72,.8,.05],spec.dark,[0,.37,-.3],[.18,0,0]) : null;
  const trail = makeTrail(spec.trim); fxRoot.add(trail.mesh);
  const clips=makeAnimationClips(); const mixer=new THREE.AnimationMixer(root);
  return {spec,side,root,pelvis,torso,head,shoulderL,elbowL,handL,shoulderR,elbowR,handR,legL,shinL,legR,shinR,weapon,trail,cape,clips,mixer,clipState:'',prevX:0,prevZ:0,x:0,z:0,facing:side===0?1:-1,hp:100,maxHp:100,roundWins:0,guard:false,guardReady:0,guardImpact:false,stagger:0,hitReact:0,fall:0,victory:false,low:false,sidestepping:false,attack:null,queue:[],chainPath:null,chainSlot:0,chainVariant:0,action:'idle',ai:null,moveX:0,moveZ:0,poseT:0};
}
function makeTrail(color) {
  const count=14; const positions=new Float32Array(count*2*3); const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:tint(color),transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending})); mesh.visible=false;
  return {mesh,positions,count,points:new Array(count).fill(0).map(()=>new THREE.Vector3()),active:0};
}
function resetTrail(trail, pos) { for (const p of trail.points) p.copy(pos); trail.active=0; trail.mesh.visible=false; }
function updateTrail(f) {
  const tip = f._tip || (f._tip=new THREE.Vector3()); f.weapon.getWorldPosition(tip);
  const trail=f.trail;
  if (!motionOn()) { resetTrail(trail,tip); return; }
  if (f.attack && f.attack.t >= f.attack.move.startup*.65) { trail.active=Math.min(trail.count,trail.active+1); for (let i=trail.count-1;i>0;i--) trail.points[i].lerp(trail.points[i-1],.72); trail.points[0].copy(tip); trail.mesh.visible=trail.active>2; }
  else { trail.active=Math.max(0,trail.active-2); if (!trail.active) trail.mesh.visible=false; }
  if (trail.mesh.visible) { const a=trail.positions; for (let i=0;i<trail.count;i++){const p=trail.points[i], fade=1-i/trail.count; const n=0.06+fade*.16; const k=i*6; a[k]=p.x-n; a[k+1]=p.y+n; a[k+2]=p.z; a[k+3]=p.x+n; a[k+4]=p.y-n; a[k+5]=p.z;} trail.mesh.geometry.attributes.position.needsUpdate=true; trail.mesh.material.opacity=.42; }
}

function playFighterClip(f) {
  const name = f.action==='guard'?'guard':f.action==='stagger'?'stagger':f.action==='victory'?'victory':f.action==='fall'?'fall':f.attack?'attack':'idle';
  if (name===f.clipState) { if (motionOn()) f.mixer.update(STEP); return; }
  f.mixer.stopAllAction(); const clip=f.clips.find((candidate) => candidate.name===name); if (clip) f.mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat,Infinity).play(); f.clipState=name;
}

class SparkPool {
  constructor() { this.items=[]; this.geometry=new THREE.BoxGeometry(.055,.055,.055); this.materials=[material('#fff8d3',.3,.2),material('#e2b86b',.35,.35),material('#9ed9ff',.3,.2)]; for(let i=0;i<MAX_SPARKS;i++){const m=new THREE.Mesh(this.geometry,this.materials[i%3]);m.visible=false;fxRoot.add(m);this.items.push({m,vx:0,vy:0,vz:0,life:0});} }
  burst(x,y,z,blue=false) { let made=0; for(const item of this.items) if(item.life<=0 && made<8){const a=(made/8)*TAU;item.m.visible=true;item.m.position.set(x,y,z);item.vx=Math.cos(a)*(.7+made*.04);item.vy=.4+(made%3)*.16;item.vz=Math.sin(a)*(.7+made*.04);item.life=blue?.32:.24;made++;} }
  step(dt) { if(!motionOn()){for(const item of this.items){item.life=0;item.m.visible=false;}return;} for(const item of this.items) if(item.life>0){item.life-=dt;item.m.position.x+=item.vx*dt;item.m.position.y+=item.vy*dt;item.m.position.z+=item.vz*dt;item.vy-=3*dt;if(item.life<=0)item.m.visible=false;} }
}
function particleTexture() {
  if (textureCache.has('ember-sprite')) return textureCache.get('ember-sprite');
  const canvas=document.createElement('canvas'); canvas.width=32; canvas.height=32; const ctx=canvas.getContext('2d'); const gradient=ctx.createRadialGradient(16,16,1,16,16,16); gradient.addColorStop(0,'#fff8d3'); gradient.addColorStop(.35,'#e2b86b'); gradient.addColorStop(1,'#e2675800'); ctx.fillStyle=gradient; ctx.fillRect(0,0,32,32); const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; textureCache.set('ember-sprite',texture); return texture;
}
class EmberPool {
  constructor() {
    this.items=[]; this.positions=new Float32Array(MAX_EMBERS*3); this.geometry=new THREE.BufferGeometry(); this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));
    this.points=new THREE.Points(this.geometry,new THREE.PointsMaterial({map:particleTexture(),color:'#fff3b0',size:.34,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); this.points.visible=false; fxRoot.add(this.points);
    for(let i=0;i<MAX_EMBERS;i++) this.items.push({vx:0,vy:0,vz:0,life:0});
  }
  burst(x,y,z,blue=false) { if(!motionOn()) return; let made=0; for(const item of this.items) if(item.life<=0&&made<6){const i=this.items.indexOf(item),a=made*TAU/6; item.vx=Math.cos(a)*(.5+made*.08);item.vy=.5+(made%2)*.2;item.vz=Math.sin(a)*(.5+made*.08);item.life=blue?.42:.3;this.positions[i*3]=x;this.positions[i*3+1]=y;this.positions[i*3+2]=z;made++;} this.points.visible=made>0; this.geometry.attributes.position.needsUpdate=true; }
  step(dt) { if(!motionOn()){this.points.visible=false;for(const item of this.items)item.life=0;return;} let live=false; for(let i=0;i<this.items.length;i++){const item=this.items[i];if(item.life>0){live=true;item.life-=dt;this.positions[i*3]+=item.vx*dt;this.positions[i*3+1]+=item.vy*dt;this.positions[i*3+2]+=item.vz*dt;item.vy-=2.2*dt;if(item.life<=0)item.life=0;}} this.points.visible=live; this.geometry.attributes.position.needsUpdate=live; }
}

function setupWorld() {
  scene = new THREE.Scene();
  world = new THREE.Group(); scene.add(world); arenaRoot = new THREE.Group(); fightersRoot = new THREE.Group(); fxRoot = new THREE.Group(); world.add(arenaRoot,fightersRoot,fxRoot);
  scene.fog = new THREE.Fog('#263044',16,42);
  camera = new THREE.PerspectiveCamera(42,1,.1,100); camera.position.set(0,8.7,16.2); camera.lookAt(0,1.2,0);
  const hemi = new THREE.HemisphereLight('#dbe5ff','#281b1d',1.75); scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffe2b0',3.4); key.position.set(-7,12,8); key.castShadow=true; key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-18; key.shadow.camera.right=18; key.shadow.camera.top=14; key.shadow.camera.bottom=-10; scene.add(key);
  stageViews.length=0; for(const spec of STAGES){const view=makeStage(spec);arenaRoot.add(view.group);stageViews.push(view);}
  sparks = new SparkPool(); embers = new EmberPool();
  renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); renderer.setSize(window.innerWidth,window.innerHeight,false); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.setClearColor('#0b0f1a',1); app.insertBefore(renderer.domElement,boot);
  resize(); window.addEventListener('resize',resize,{passive:true});
}
let sparks, embers;
function resize() { if(!renderer)return; renderer.setSize(window.innerWidth,window.innerHeight,false); camera.aspect=window.innerWidth/Math.max(1,window.innerHeight); camera.fov=window.innerWidth<700?47:42; camera.updateProjectionMatrix(); updatePointerRects(); }
function showStage(id) { const chosen=stageById(id); for(const view of stageViews)view.group.visible=view.spec.id===chosen.id; scene.fog.color.set(chosen.fog); scene.fog.near=chosen.kind==='bridge'?13:15; scene.fog.far=chosen.kind==='coliseum'?38:44; renderer.setClearColor(chosen.sky,1); cameraFrame={x:0,y:chosen.kind==='bridge'?7.4:8.7,z:chosen.kind==='bridge'?18.5:16.2,zoom:chosen.kind==='bridge'?-.04:0}; }
function updateCamera(juice) {
  const midX=match?(match.a.x+match.b.x)*.5:0, midZ=match?(match.a.z+match.b.z)*.5:0;
  cameraTarget.set(cameraFrame.x+midX*.14,cameraFrame.y+Math.min(1.2,Math.abs(match?(match.a.x-match.b.x):6)*.035),cameraFrame.z+cameraFrame.zoom*Math.abs(match?(match.a.x-match.b.x):6));
  cameraAnchor.lerp(cameraTarget,motionOn()?.085:1); camera.position.copy(cameraAnchor); if(motionOn()){camera.position.x+=juice.dx*.045;camera.position.y+=juice.dy*.035;}
  cameraAim.set(midX*.12,1.2,midZ*.08); cameraLook.lerp(cameraAim,motionOn()?.09:1); camera.lookAt(cameraLook);
}

function startMatch(mode, stageId, p1Id, p2Id, difficulty) {
  const stage = stageById(stageId); const p1Spec=fighterById(p1Id); const p2Spec=fighterById(p2Id);
  if (stage.unlock > 0 && !save.unlockedStages[STAGES.indexOf(stage)] && hook.forceStage == null) stageId='sunken-temple';
  if (!save.unlockedFighters[FIGHTERS.indexOf(p1Spec)] && !hook.forceMatch && !hook.aiVsAi) return;
  menuEl.classList.add('ds-menu-hide'); hud.classList.add('ds-playing'); screen='play';
  const carryHp = mode==='survival' && match && match.roundWins[0]>=2 ? (match.carryHp!=null?match.carryHp:match.a.hp) : null;
  const previousOrbs = mode==='survival' && match && Array.isArray(match.survivalOrbs) ? match.survivalOrbs.slice() : [18,30,45];
  if (match) { if(match.a) fightersRoot.remove(match.a.root); if(match.b) fightersRoot.remove(match.b.root); }
  match = {mode,stage:stageById(stageId),difficulty:clamp(difficulty|0,0,3),baseDifficulty:clamp(difficulty|0,0,3),p1Spec,p2Spec,a:null,b:null,round:1,roundWins:[0,0],draws:0,timer:60,roundIntro:2.2,roundEnd:0,paused:false,arcadeIndex:mode==='arcade'?arcadeProgress:0,survivalOrbs:previousOrbs,forceWinUsed:false,carryHp,tutorialActive:!save.tutorial};
  match.a=makeFighterRig(p1Spec,0); match.b=makeFighterRig(p2Spec,1); fightersRoot.add(match.a.root,match.b.root); resetRound(false);
  showStage(match.stage.id); kit.audio.music(mode==='survival'?'musicVeil':'musicForge',900); sfx('crowd',.25);
  if(!save.tutorial){save.tutorial=true;persist();coach('MOVE WITH THE STICK // TAP A STRIKE // HOLD GUARD',5);}
  syncProbe(); updateHUD();
}
function resetRound(keepHealth) {
  const a=match.a,b=match.b; a.x=-3.3;a.z=0;a.prevX=a.x;a.prevZ=a.z;b.x=3.3;b.z=0;b.prevX=b.x;b.prevZ=b.z;a.facing=1;b.facing=-1;a.attack=b.attack=null;a.queue.length=0;b.queue.length=0;a.guard=b.guard=false;a.guardReady=b.guardReady=0;a.guardImpact=b.guardImpact=false;a.stagger=b.stagger=0;b.stagger=0;a.hitReact=b.hitReact=0;b.hitReact=0;a.fall=b.fall=0;b.fall=0;a.victory=b.victory=false;a.low=b.low=false;a.sidestepping=b.sidestepping=false;a.action=b.action='idle';a.clipState=b.clipState='';a.ai=null;b.ai=null;a.hp=match.carryHp!=null?clamp(match.carryHp,0,100):100;b.hp=100;match.carryHp=null;match.timer=60;match.roundIntro=2.2;match.roundEnd=0;match.forceWinUsed=false;match.round=Math.min(3,match.round);a.root.rotation.set(0,a.facing>0?Math.PI/2:-Math.PI/2,0);b.root.rotation.set(0,b.facing>0?Math.PI/2:-Math.PI/2,0);a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);resetTrail(a.trail,a.weapon.getWorldPosition(new THREE.Vector3()));resetTrail(b.trail,b.weapon.getWorldPosition(new THREE.Vector3()));coach('ROUND '+match.round+' // FIGHT',1.8);sfx('ui',.45);
}
function endRound(winner, reason) {
  if(match.roundEnd>0 || match.roundIntro>0) return;
  if(!winner){match.draws++;match.roundEnd=2.8;match.timer=0;match.a.attack=null;match.b.attack=null;match.a.queue.length=0;match.b.queue.length=0;match.a.action=match.b.action='hit';sfx('crowd',.7);toast('DOUBLE KO // ROUND DRAW',1.2);syncProbe();return;}
  const winIndex=winner===match.a?0:1; const loser=winner===match.a?match.b:match.a; winner.victory=true; loser.fall=reason==='ringout'?1:0; loser.action=reason==='ringout'?'fall':'hit'; winner.action='victory'; match.roundWins[winIndex]++; match.roundEnd=2.8; if(reason==='ringout'){sfx('ringout',.95);toast('RING-OUT',1.2);} else {sfx('crowd',.7);toast('ROUND TAKEN',1.0);} match.timer=0; syncProbe();
}
function finishMatch() {
  const winIndex=match.roundWins[0]>=2?0:1; const winner=winIndex===0?match.a:match.b; const playerWin=winIndex===0; screen='result'; hud.classList.remove('ds-playing'); menuEl.classList.remove('ds-menu-hide');
  if(playerWin){if(match.mode==='arcade'){match.arcadeIndex++;save.arcadeClear=Math.max(save.arcadeClear,match.arcadeIndex);if(match.arcadeIndex>=2)save.unlockedFighters[6]=true;if(match.arcadeIndex>=4){save.unlockedFighters[7]=true;save.altPalettes=true;save.unlockedStages[4]=true;}if(match.arcadeIndex>=7)save.unlockedStages[5]=true;save.medals[match.baseDifficulty]=Math.max(save.medals[match.baseDifficulty]||0,match.baseDifficulty+1);persist();}if(match.mode==='survival'){save.bestSurvival=Math.max(save.bestSurvival,match.arcadeIndex+1);persist();}}
  renderResult(playerWin,winner);
}
function renderResult(playerWin,winner) {
  const title=playerWin?(match.mode==='arcade'&&match.arcadeIndex>=ARCADE_ENCOUNTERS.length?'LADDER CLEARED':'VICTORY'):'DEFEAT'; const sub=playerWin?(match.mode==='survival'?'Choose one visible regen orb before the next challenger.':'The edge remembers.'):'Read the guard. Then read the floor.';
  const orbs=playerWin&&match.mode==='survival'&&match.survivalOrbs.length?`<div class="ds-row-label">REGEN ORBS // CHOOSE ONE</div><div class="ds-orbs">${match.survivalOrbs.map((amount,index)=>`<button class="ds-orb" data-action="orb:${index}"><span>✦</span><strong>+${amount}</strong><small>HEALING ORB</small></button>`).join('')}</div>`:'';
  const next=playerWin&&match.mode==='survival'&&match.survivalOrbs.length?'':'<div class="ds-actions">'+makeMenuButton(playerWin&&match.mode!=='versus'?'NEXT DUEL':'REMATCH','start',true)+'</div>';
  menuEl.innerHTML=`<div class="ds-panel"><div class="ds-kicker">${match.stage.short} // ${match.roundWins[0]} - ${match.roundWins[1]}</div><h2>${title}</h2><p class="ds-sub">${sub}</p>${orbs}${next}<div class="ds-actions">${makeMenuButton('LOADOUT','back')}${makeMenuButton('MENU','menu')}</div><p class="ds-foot">${playerWin&&match.mode==='arcade'?'Unlock chain advanced. '+(save.altPalettes?'Alt palettes and late stages unlocked.':'Keep climbing for late steel.'):'Best of three. Ring-outs are instant round wins.'}</p></div>`;
  menuDirty=false;
}
function syncProbe() {
  const a=match?.a,b=match?.b;
  DS_STATE.ready=!!match; DS_STATE.mode=screen==='play'?(match?.mode||'match'):screen; DS_STATE.scene=screen; DS_STATE.p1=a?a.spec.name:fallback.p1; DS_STATE.p2=b?b.spec.name:fallback.p2; DS_STATE.fighter1=a?a.spec.id:setupP1; DS_STATE.fighter2=b?b.spec.id:setupP2; DS_STATE.stage=match?match.stage.id:setupStage; DS_STATE.round=match?match.round:1; DS_STATE.hp=a?[Math.round(a.hp),Math.round(b.hp)]:[100,100]; DS_STATE.timer=match?Math.max(0,Math.ceil(match.timer)):60; DS_STATE.roundWins=match?match.roundWins.slice():[0,0]; DS_STATE.aiVsAi=!!hook.aiVsAi; hook.state=DS_STATE;
}

const ARCADE_ENCOUNTERS = [
  {fighter:'daggers',stage:'sunken-temple',name:'The Needle Choir'},
  {fighter:'glaive',stage:'skybridge',name:'The Long Reach'},
  {fighter:'axe',stage:'iron-coliseum',name:'The Red Anvil'},
  {fighter:'rapier',stage:'cliff-shrine',name:'The Pale Line'},
  {fighter:'flail',stage:'frozen-lake',name:'The Bell Warden'},
  {fighter:'staff',stage:'throne-hall',name:'The Gate Keeper'},
  {fighter:'longsword',stage:'sunken-temple',name:'The Mirror Knight'},
  {fighter:'greatsword',stage:'skybridge',name:'The World Breaker'},
  {fighter:'glaive',stage:'cliff-shrine',name:'The Ash Reaper'},
  {fighter:'axe',stage:'throne-hall',name:'The Final Forge'}
];
function encounterFor(index) { return ARCADE_ENCOUNTERS[index % ARCADE_ENCOUNTERS.length]; }
let arcadeProgress = 0;
let rngState = 0x5d3319;
function rand() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }
function actionFor(f, controls) {
  if (controls.h) return 'H'; if (controls.v) return 'V'; if (controls.k) return 'K';
  return null;
}
function aiIntent(f, opp, dt) {
  if (!f.ai) f.ai={think:0,x:0,z:0,guard:false,action:null,state:'approach',stateTime:0,level:0};
  f.ai.think -= dt; f.ai.stateTime += dt; const dx=opp.x-f.x, dz=opp.z-f.z, dist=Math.hypot(dx,dz); const level=clamp(f.ai.level||0,0,1);
  if (f.ai.think<=0) {
    f.ai.think=.08 + rand()*(.24-level*.12); f.ai.action=null; f.ai.guard=false; f.ai.x=0; f.ai.z=0;
    const incoming=opp.attack && opp.attack.t>opp.attack.move.startup*.55 && dist<3.4;
    if (incoming && rand()<.38+level*.42) { f.ai.state='guard'; f.ai.guard=true; f.ai.stateTime=0; }
    else if (f.ai.state==='guard' && f.ai.stateTime>.18) { f.ai.state=rand()<.45?'evade':'approach'; f.ai.stateTime=0; }
    else if (dist>2.45) { f.ai.state='approach'; f.ai.x=clamp(dx/Math.max(.01,dist),-1,1); f.ai.z=clamp(dz/Math.max(.01,dist),-1,1); }
    else if (f.ai.state==='approach' || f.ai.state==='recovery') {
      const roll=rand(); if (roll<.16+level*.15) { f.ai.state='evade'; f.ai.x=dx>=0?-1:1; f.ai.z=rand()<.5?-1:1; }
      else if (roll<.76+level*.16) { f.ai.state='attack'; const p=rand(); f.ai.action=p<.42?'H':p<.78?'V':'K'; f.ai.stateTime=0; }
      else { f.ai.state='guard'; f.ai.guard=true; f.ai.stateTime=0; }
    } else if (f.ai.state==='evade') {
      if (f.ai.stateTime>.16) { f.ai.state='recovery'; f.ai.stateTime=0; }
      else { f.ai.x=dx>=0?-1:1; f.ai.z=rand()<.5?-1:1; }
    } else if (f.ai.state==='attack') {
      f.ai.state='recovery'; f.ai.stateTime=0;
    }
  }
  const action=f.ai.action; f.ai.action=null;
  return {x:f.ai.x,z:f.ai.z,guard:f.ai.guard,h:action==='H',v:action==='V',k:action==='K'};
}
function stageOutside(f) {
  const s=match.stage;
  const radius=.58;
  if (s.ringout==='none') return false;
  if (s.ringout==='long') return Math.abs(f.x)>s.bounds.x-radius;
  if (s.ringout==='one') return f.z>s.bounds.z-radius;
  if (s.ringout==='octagon') { const vertices=octagonVertices(s); for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],ex=b[0]-a[0],ez=b[1]-a[1],length=Math.hypot(ex,ez),distance=(ex*(f.z-a[1])-ez*(f.x-a[0]))/length;if(distance<radius-.04)return true;} return false; }
  return Math.abs(f.x)>s.bounds.x-radius || Math.abs(f.z)>s.bounds.z-radius;
}
function limitMovement(f) {
  const s=match.stage;
  if (s.ringout==='none') { f.x=clamp(f.x,-s.bounds.x+.7,s.bounds.x-.7); f.z=clamp(f.z,-s.bounds.z+.7,s.bounds.z-.7); }
  else if (s.ringout==='long') f.z=clamp(f.z,-s.bounds.z+.65,s.bounds.z-.65);
  else if (s.ringout==='one') f.z=clamp(f.z,-s.bounds.z+.65,s.bounds.z+.9);
  else { f.x=clamp(f.x,-s.bounds.x-.7,s.bounds.x+.7); f.z=clamp(f.z,-s.bounds.z-.7,s.bounds.z+.7); }
}
function setGuard(f, desired) {
  if (desired && !f.guard) { f.guardReady=.15; f.guardImpact=false; sfx('guard',.24); }
  if (!desired) { f.guardReady=0; f.guardImpact=false; }
  f.guard=desired;
}
function startAttack(f, kind) {
  const paths=CHAINS[f.spec.id]||CHAINS.longsword; const current=f.chainPath;
  if (!current || f.chainSlot>=current.length || current[f.chainSlot]!==kind) { f.chainPath=paths[f.chainVariant%paths.length]; f.chainVariant=(f.chainVariant+1)%paths.length; f.chainSlot=0; }
  const index=f.chainSlot; f.chainSlot=Math.min(f.chainPath.length,index+1); const move=moveFrom(f.spec.id,kind,index);
  f.attack={kind,move,t:0,hitDone:false,index,armor:false}; f.guard=false; f.guardReady=0; f.guardImpact=false; f.sidestepping=false; f.low=false; f.action=kind==='K'?'kick':'attack';
  if (kind==='H'||kind==='V') sfx(f.spec.id==='daggers'?'dagger':(f.spec.id==='axe'||f.spec.id==='greatsword'?'heavy':'whoosh'),.28);
}
function queueAttack(f, kind) { if (f.queue.length<2) f.queue.push(kind); }
function distBetween(a,b) { return Math.hypot(a.x-b.x,a.z-b.z); }
function hitTarget(attacker,target,move) {
  const dx=target.x-attacker.x, dz=target.z-attacker.z, distance=Math.hypot(dx,dz);
  if (distance>move.range || Math.abs(dz)>1.45) return null;
  if (target.sidestepping && move.kind!=='H') return null;
  if (target.low && move.kind==='H') return null;
  const throwHit=move.kind==='K' && target.guard && distance<1.55;
  if (target.guard && !move.unblockable && !throwHit) {
    if (target.guardReady>0) return {type:'impact',attacker,target,move};
    return {type:'blocked',attacker,target,move};
  }
  return {type:'damage',attacker,target,move,damage:throwHit?move.damage+7:move.damage,dx,dz,distance,throwHit};
}
function updateAttack(f,opp,dt) {
  if (!f.attack) return false; const a=f.attack; a.t+=dt; const end=a.move.startup+a.move.active+a.move.recovery;
  if (!a.hitDone && a.t>=a.move.startup && a.t<=a.move.startup+a.move.active) { a.hitDone=true; const event=hitTarget(f,opp,a.move); if(event)combatEvents.push(event); }
  if (a.t>=end) { f.attack=null; if(f.queue.length) startAttack(f,f.queue.shift()); else {f.action='idle';f.chainIndex=0;} }
  return true;
}
function resolveCombatEvents() {
  if (!combatEvents.length) return;
  const events=combatEvents.splice(0,combatEvents.length);
  for(const event of events) if(event.type==='impact'){
    event.target.guardImpact=true; event.target.guard=false; event.target.guardReady=0; event.attacker.stagger=.72; event.attacker.action='stagger'; event.attacker.attack=null; event.attacker.queue.length=0; event.attacker.sidestepping=false; event.attacker.low=false;
    sparks.burst(event.target.x,1.65,event.target.z,true); embers.burst(event.target.x,1.65,event.target.z,true); kit.juice.hitStop(120); kit.juice.shake(3,130); sfx('parry',.9); toast('GUARD IMPACT',.85);
  }
  for(const event of events) if(event.type==='blocked'){
    sparks.burst(event.target.x,1.5,event.target.z,false); embers.burst(event.target.x,1.5,event.target.z,false); sfx('guard',.62); kit.juice.hitStop(45);
  }
  for(const event of events) if(event.type==='damage'){
    const target=event.target; target.hp=Math.max(0,target.hp-event.damage); target.hitReact=.32; target.action=event.throwHit?'throw':'hit'; target.guard=false; target.guardReady=0; target.guardImpact=false; target.sidestepping=false; target.low=false;
    if(target.attack && !target.attack.armor){target.attack=null;target.queue.length=0;}
    const n=event.distance||1; const force=event.move.knockback*(event.throwHit?1.35:1)*.28; target.x+=event.dx/n*force; target.z+=event.dz/n*force;
    sparks.burst(target.x,1.55,target.z,false); embers.burst(target.x,1.55,target.z,false); kit.juice.hitStop(event.throwHit?85:65); kit.juice.shake(event.throwHit?4:2,event.throwHit?150:90); sfx(event.throwHit?'hit':(event.move.kind==='K'?'kick':'hit'),event.throwHit?.9:.65);
  }
  const aDead=match.a.hp<=0,bDead=match.b.hp<=0;
  if(aDead&&bDead) endRound(null,'double-ko'); else if(aDead) endRound(match.b,'damage'); else if(bDead) endRound(match.a,'damage');
}
function updateFighter(f,opp,intent,dt) {
  f.prevX=f.x; f.prevZ=f.z; f.poseT+=dt; f.facing=opp.x>=f.x?1:-1;
  if (f.fall>0) { f.fall+=dt; f.x+=(f.facing>0?1:-1)*dt*2.8; f.action='fall'; return; }
  if (f.victory) { f.action='victory'; return; }
  f.guardReady=Math.max(0,f.guardReady-dt); f.stagger=Math.max(0,f.stagger-dt); f.hitReact=Math.max(0,f.hitReact-dt);
  if (f.stagger>0) { f.action='stagger'; setGuard(f,false); return; }
  if (f.hitReact>0 && !f.attack) { f.action='hit'; return; }
  const queuedAction=actionFor(f,intent);
  if (f.attack && queuedAction && f.attack.t>=f.attack.move.startup+f.attack.move.active*.55) queueAttack(f,queuedAction);
  if (updateAttack(f,opp,dt)) return;
  f.sidestepping=false; f.low=false;
  if (intent.guard) { setGuard(f,true); f.moveX=0;f.moveZ=0;f.action='guard'; return; }
  setGuard(f,false);
  const action=queuedAction;
  if (action) { startAttack(f,action); f.moveX=0;f.moveZ=0; return; }
  else if (f.queue.length && !f.attack) { startAttack(f,f.queue.shift()); f.moveX=0;f.moveZ=0; return; }
  const x=intent.x||0,z=intent.z||0,mag=Math.hypot(x,z); f.moveX=x;f.moveZ=z; f.sidestepping=Math.abs(x)>.55 && Math.abs(z)<.55 && mag>.05; f.low=z>.55 && !f.guard;
  if (mag>.05 && !f.attack) { const speed=f.spec.speed*(f.sidestepping?1.04:1);f.x+=x*speed*dt;f.z+=z*speed*dt;f.action='walk'; }
  else if (!f.attack) f.action='idle';
  limitMovement(f);
  if (stageOutside(f)) { f.fall=.01; endRound(opp,'ringout'); }
}
function updateCombat(dt) {
  if (!match || screen!=='play' || match.paused) return;
  if (match.roundIntro>0) { match.roundIntro=Math.max(0,match.roundIntro-dt); if(match.roundIntro<=0) toast('FIGHT',.55); syncProbe(); return; }
  if (match.roundEnd>0) { match.roundEnd-=dt; if(match.roundEnd<=0){if(match.roundWins[0]>=2||match.roundWins[1]>=2) finishMatch(); else {match.round++;resetRound(match.mode==='survival');}} syncProbe(); return; }
  if (hook.forceWin && !match.forceWinUsed) { match.forceWinUsed=true; match.b.hp=0; endRound(match.a,'forced'); syncProbe(); return; }
  match.timer=Math.max(0,match.timer-dt); if(match.timer<=0){if(match.a.hp>=match.b.hp)endRound(match.a,'time');else endRound(match.b,'time');return;}
  const ladderRamp=match.arcadeIndex*.055+(match.mode==='survival'?match.arcadeIndex*.025:0); const aiLevel=clamp(match.baseDifficulty/3+ladderRamp,0,1); match.a.ai=match.a.ai||{level:aiLevel}; match.a.ai.level=aiLevel; match.b.ai=match.b.ai||{level:aiLevel}; match.b.ai.level=aiLevel;
  const p1Controls=syncInput(); const p1Axes=stickAxes(); const p1Intent=hook.aiVsAi?aiIntent(match.a,match.b,dt):{...p1Axes,...p1Controls};
  if(match.tutorialActive){if(Math.hypot(p1Axes.x,p1Axes.z)>.2){coach('GOOD // NOW TAP ↔ OR ⇡',2.1);match.tutorialActive=false;}else if(p1Controls.h||p1Controls.v||p1Controls.k){coach('NOW HOLD ◈ TO GUARD',2.1);match.tutorialActive=false;}else if(p1Controls.g){coach('GUARD IMPACT // TAP ◈ JUST BEFORE CONTACT',2.1);match.tutorialActive=false;}}
  const p2Intent=aiIntent(match.b,match.a,dt);
  updateFighter(match.a,match.b,p1Intent,dt); updateFighter(match.b,match.a,p2Intent,dt); resolveCombatEvents(); sparks.step(dt); embers.step(dt); syncProbe();
}

function poseFighter(f,alpha) {
  playFighterClip(f);
  const x=lerp(f.prevX,f.x,alpha), z=lerp(f.prevZ,f.z,alpha); f.root.position.x=x; f.root.position.z=z; f.root.rotation.y=f.facing>0?Math.PI/2:-Math.PI/2;
  const animate=motionOn(), t=animate?f.poseT:0, walk=animate&&f.action==='walk'?Math.sin(t*10):0, attack=f.attack, p=attack?clamp(attack.t/(attack.move.startup+attack.move.active+attack.move.recovery),0,1):0;
  f.root.rotation.z=0; f.root.position.y=.22+(animate&&f.action==='hit'?Math.sin(f.hitReact*18)*.04:0); f.pelvis.rotation.z=0; f.torso.rotation.x=0; f.torso.rotation.z=walk*.035;
  f.shoulderL.rotation.z=.08+walk*.16;f.elbowL.rotation.z=-.12-walk*.13;f.shoulderR.rotation.z=-.08-walk*.16;f.elbowR.rotation.z=.12+walk*.13;f.legL.rotation.x=walk*.34;f.legR.rotation.x=-walk*.34;f.shinL.rotation.x=-Math.max(0,walk)*.2;f.shinR.rotation.x=-Math.max(0,-walk)*.2;
  f.weapon.rotation.set(0,0,0);
  if (f.action==='guard') { f.shoulderR.rotation.z=-.68;f.elbowR.rotation.z=-.72;f.shoulderL.rotation.z=.62;f.elbowL.rotation.z=.65;f.torso.rotation.z=-.08; }
  if (attack) { const q=animate?ease(p<.45?p/.45:(1-p)/.55):.5; if(attack.kind==='H'){f.shoulderR.rotation.z=-.85+q*1.7;f.elbowR.rotation.z=-.5+q*.9;f.weapon.rotation.z=-1.15+q*2.3;f.torso.rotation.z=-q*.18;} else if(attack.kind==='V'){f.shoulderR.rotation.z=.28-q*.95;f.elbowR.rotation.z=-.3-q*.35;f.weapon.rotation.z=.25-q*.45;f.torso.rotation.x=-q*.14;} else {f.shoulderR.rotation.z=-.95+q*.55;f.elbowR.rotation.z=-.72+q*.65;f.weapon.rotation.z=-.35;f.legR.rotation.x=-q*.35;} }
  if (f.action==='stagger') {f.torso.rotation.z=Math.sin(t*28)*.22;f.shoulderR.rotation.z=.6;f.shoulderL.rotation.z=-.6;}
  if (f.action==='hit'||f.action==='throw') {f.torso.rotation.x=-.22;f.root.position.y+=animate?Math.sin(f.hitReact*18)*.05:0;}
  if (f.action==='victory') {f.shoulderR.rotation.z=-.95;f.elbowR.rotation.z=-.9;f.shoulderL.rotation.z=.85;f.elbowL.rotation.z=.8;f.torso.rotation.z=animate?Math.sin(t*3)*.04:0;}
  if (f.action==='fall') {f.root.rotation.z=animate?clamp(f.fall*2.7,0,Math.PI/2):0;f.root.position.y=animate?Math.max(-.5,.22-f.fall*1.4):.22;}
  updateTrail(f);
  if (f.sidestepping && !f.fall && animate) { if(!f.stepRing){f.stepRing=addMesh(f.root,new THREE.RingGeometry(.82,.9,20),material(f.spec.trim,.5,.1,true),[0,.03,0],[-Math.PI/2,0,0]);}f.stepRing.visible=true;f.stepRing.material.opacity=.38; } else if(f.stepRing)f.stepRing.visible=false;
}
function updateHUD() {
  if (!match) return;
  p1Name.textContent=match.a.spec.name; p2Name.textContent=match.b.spec.name; p1Bar.style.width=clamp(match.a.hp,0,100)+'%';p2Bar.style.width=clamp(match.b.hp,0,100)+'%'; p1Pips.textContent='●'.repeat(match.roundWins[0])+'○'.repeat(2-match.roundWins[0]);p2Pips.textContent='●'.repeat(match.roundWins[1])+'○'.repeat(2-match.roundWins[1]);timerEl.textContent=String(Math.ceil(match.timer)).padStart(2,'0');roundEl.textContent='ROUND '+match.round;stageEl.textContent=match.stage.short;
}
function openGameSettings() {
  kit.openSettings([(box) => {
    const makeVolume = (label, value, setter) => { const wrap=document.createElement('label'); wrap.style.cssText='font:inherit;font-size:14px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:10px 14px;min-width:min(70vw,280px);text-align:left;'; const title=document.createElement('span'); title.textContent=label; title.style.display='block'; const range=document.createElement('input'); range.type='range'; range.min='0'; range.max='1'; range.step='.05'; range.value=String(value); range.style.width='100%'; range.addEventListener('input',()=>setter(Number(range.value))); wrap.append(title,range); box.appendChild(wrap); };
    makeVolume('Music volume',kit.audio.prefs.music,(value)=>kit.audio.setMusicVolume(value)); makeVolume('Effects volume',kit.audio.prefs.sfx,(value)=>kit.audio.setSfxVolume(value));
    const full=document.createElement('button'); full.textContent='Fullscreen'; full.style.cssText='font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);'; full.addEventListener('click',()=>kit.requestFullscreen()); box.appendChild(full);
  }]);
}

function removeMatch() {
  if (match?.a) fightersRoot.remove(match.a.root); if (match?.b) fightersRoot.remove(match.b.root); match=null; hud.classList.remove('ds-playing'); stageViews.forEach((view)=>{view.group.visible=false;});
}
function selectSetupFighter(id) {
  const spec=fighterById(id); const unlocked=save.unlockedFighters[FIGHTERS.indexOf(spec)] || hook.forceMatch || hook.aiVsAi;
  if (!unlocked) { toast('LADDER LOCKED',.75); return; }
  setupP1=id; const alt=FIGHTERS[(FIGHTERS.findIndex((f)=>f.id===id)+1)%FIGHTERS.length]; setupP2=alt.id; menuDirty=true;
}
function handleMenuAction(action) {
  if (!action) return;
  if (action==='menu') { removeMatch(); screen='menu'; menuDirty=true; syncProbe(); return; }
  if (action==='back') { if(screen==='howto'||screen==='setup'||screen==='result'){screen='menu';menuDirty=true;} return; }
  if (action==='howto') {screen='howto';menuDirty=true;return;}
  if (action==='fullscreen') { kit.requestFullscreen(); return; }
  if (action.startsWith('mode:')) { menuMode=action.slice(5); screen='setup'; arcadeProgress=0; const first=encounterFor(0); setupP2=menuMode==='arcade'?first.fighter:setupP2; setupStage=menuMode==='arcade'?first.stage:setupStage; menuDirty=true; return; }
  if (action.startsWith('fighter:')) { selectSetupFighter(action.slice(8)); return; }
  if (action.startsWith('stage:')) { const id=action.slice(6),spec=stageById(id); if(save.unlockedStages[STAGES.indexOf(spec)]||hook.forceStage!=null){setupStage=id;menuDirty=true;}else toast('STAGE LOCKED',.75); return; }
  if (action.startsWith('diff:')) { setupDifficulty=clamp(Number(action.slice(5))||0,0,3);menuDirty=true;return; }
  if (action.startsWith('orb:') && screen==='result' && match && match.mode==='survival' && match.roundWins[0]>=2) { const index=Number(action.slice(4)); const amount=match.survivalOrbs[index]; if(Number.isFinite(amount)){match.carryHp=clamp(match.a.hp+amount,0,100);match.survivalOrbs.splice(index,1);arcadeProgress=match.arcadeIndex+1;const encounter=encounterFor(arcadeProgress);setupP1=match.a.spec.id;setupP2=encounter.fighter;setupStage=encounter.stage;startMatch('survival',setupStage,setupP1,setupP2,match.baseDifficulty);match.arcadeIndex=arcadeProgress;} return; }
  if (action==='start') {
    if(screen==='result' && match) {
      if(match.mode==='arcade' && match.roundWins[0]>=2 && match.arcadeIndex<ARCADE_ENCOUNTERS.length){arcadeProgress=match.arcadeIndex;const encounter=encounterFor(arcadeProgress);setupP1=match.a.spec.id;setupP2=encounter.fighter;setupStage=encounter.stage;startMatch('arcade',setupStage,setupP1,setupP2,match.baseDifficulty);return;}
      if(match.mode==='survival' && match.roundWins[0]>=2 && !match.survivalOrbs.length){arcadeProgress=match.arcadeIndex+1;const encounter=encounterFor(arcadeProgress);setupP1=match.a.spec.id;setupP2=encounter.fighter;setupStage=encounter.stage;startMatch('survival',setupStage,setupP1,setupP2,match.baseDifficulty);match.arcadeIndex=arcadeProgress;return;}
      setupP1=match.p1Spec.id;setupP2=match.p2Spec.id;setupStage=match.stage.id;startMatch('versus',setupStage,setupP1,setupP2,match.difficulty);return;
    }
    if(screen==='setup'){ if(menuMode==='arcade'){arcadeProgress=0;const first=encounterFor(0);setupP2=first.fighter;setupStage=first.stage;} startMatch(menuMode,setupStage,setupP1,setupP2,setupDifficulty); return; }
  }
}
function updateMenu() { renderMenu(); const action=consumeMenuPress(); if(action)handleMenuAction(action); }
function renderFrame(alpha,juice) {
  if(match && screen==='play') { poseFighter(match.a,alpha);poseFighter(match.b,alpha);updateHUD(); }
  tickTransient();
  updateCamera(juice||{dx:0,dy:0});
  renderer.render(scene,camera);
}
function loop(now) {
  const dt=Math.min(.12,Math.max(0,(now-lastNow)/1000)); lastNow=now; visualTime+=dt;
  if(screen==='play' && keyEdge('Escape','prevEscape')) openGameSettings();
  const juice=kit.juice.frame(); if(!kit.paused && !juice.frozen){accumulator+=dt;let steps=0;while(accumulator>=STEP&&steps<MAX_STEPS){updateCombat(STEP);accumulator-=STEP;steps++;}if(steps===MAX_STEPS&&accumulator>=STEP)accumulator=0;}
  if(screen!=='play')updateMenu(); renderFrame(clamp(accumulator/STEP,0,1),juice); requestAnimationFrame(loop);
}

function showBootError(error) {
  errorText=String(error&&error.message||error||'Unknown render error'); bootCopy.textContent='3D renderer unavailable. '+errorText.slice(0,90); boot.classList.remove('is-hidden'); DS_STATE.ready=false; DS_STATE.scene='fallback'; DS_STATE.error=errorText; console.error(error);
}
function bootGame() {
  try {
    kit.loader.show('Forging Duelsteel'); kit.loader.progress(.08); bootCopy.textContent='Preparing the forge...'; setupWorld(); kit.loader.progress(.58); kit.registerPWA();
    kit.audio.preload(['musicForge','musicVeil','whoosh','heavy','dagger','clash','guard','parry','hit','kick','ringout','crowd','ui']).catch(()=>null).then(()=>{
      kit.loader.progress(1); bootCopy.textContent='Entering the arena...'; boot.classList.add('is-hidden');
      if(hook.forceStage!=null){const forced=typeof hook.forceStage==='number'?STAGES[hook.forceStage|0]:stageById(hook.forceStage);if(forced)setupStage=forced.id;}
      if(hook.forceMatch || hook.aiVsAi){const forced=hook.forceMatch&&typeof hook.forceMatch==='object'?hook.forceMatch:{};if(forced.p1)setupP1=fighterById(forced.p1).id;if(forced.p2)setupP2=fighterById(forced.p2).id;if(forced.stage)setupStage=stageById(forced.stage).id;startMatch('versus',setupStage,setupP1,setupP2,forced.difficulty==null?setupDifficulty:forced.difficulty);} else {syncProbe();menuDirty=true;}
      kit.loader.hide(); requestAnimationFrame(loop);
    });
  } catch(error) { kit.loader.hide(); showBootError(error); }
}

bootGame();
