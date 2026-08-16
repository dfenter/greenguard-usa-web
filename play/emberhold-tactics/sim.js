/* EMBERHOLD TACTICS - deterministic campaign and battle rules
 *
 * The renderer consumes state plus drainEvents(). This module owns every
 * gameplay decision: campaign content, objectives, roster progression,
 * equipment, promotions, terrain, facing, combat RNG, and the AI.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EmberholdSim = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var N = 9;
  var TERRAIN_NAMES = ['grass', 'grass', 'grass', 'stone', 'sand', 'grass', 'water'];
  var BASE_LAYOUTS = [
    [[4,4,'stone',0],[5,4,'stone',1],[4,5,'stone',1],[5,5,'grass',0],[2,6,'grass',0],[5,3,'grass',0]],
    [[2,1,'stone',2],[2,2,'stone',2],[2,3,'grass',1],[2,4,'grass',1],[2,5,'stone',2],[2,6,'grass',1],[6,2,'stone',2],[6,3,'stone',2],[6,4,'grass',1],[6,5,'stone',2],[6,6,'grass',1],[4,3,'grass',0],[4,6,'grass',0]],
    [[3,2,'stone',4],[4,2,'stone',4],[5,2,'stone',3],[3,3,'stone',3],[5,3,'stone',3],[3,4,'stone',2],[5,4,'stone',2],[3,5,'stone',3],[4,5,'stone',4],[5,5,'stone',3],[4,4,'sand',1],[4,7,'grass',0]],
    [[3,1,'water',0],[4,1,'water',0],[5,1,'water',0],[3,2,'stone',2],[5,2,'stone',2],[3,3,'stone',2],[5,3,'stone',2],[3,4,'grass',1],[4,4,'sand',0],[5,4,'grass',1],[3,5,'stone',2],[5,5,'stone',2],[3,6,'water',0],[4,6,'water',0],[5,6,'water',0]],
    [[3,3,'stone',3],[4,3,'stone',4],[5,3,'stone',3],[3,4,'stone',3],[5,4,'stone',3],[3,5,'stone',3],[4,5,'sand',4],[5,5,'stone',3],[4,4,'grass',1]]
  ];
  var ENEMY_SETS = [
    [{job:'Knight',name:'Grim',c:7,r:1,ct:28},{job:'Archer',name:'Vox',c:8,r:0,ct:20},{job:'Black Mage',name:'Cinder',c:8,r:2,ct:15},{job:'Monk',name:'Rook',c:7,r:3,ct:10},{job:'Thief',name:'Nyx',c:6,r:1,ct:8},{job:'Archer',name:'Fletch',c:8,r:3,ct:6},{job:'Knight',name:'Barkguard',c:7,r:0,ct:4},{job:'White Mage',name:'Veil',c:6,r:0,ct:3},{job:'Monk',name:'Bramble',c:8,r:4,ct:2}],
    [{job:'Knight',name:'Gatebreaker',c:7,r:1,ct:30},{job:'Archer',name:'Bellshot',c:8,r:0,ct:22},{job:'Black Mage',name:'Ashglass',c:8,r:2,ct:18},{job:'Monk',name:'Pikehand',c:7,r:3,ct:12},{job:'Thief',name:'Ruinrunner',c:6,r:1,ct:9},{job:'Archer',name:'Wren',c:7,r:0,ct:6},{job:'Black Mage',name:'Cinderfall',c:6,r:0,ct:4},{job:'Knight',name:'Ironwake',c:8,r:3,ct:3},{job:'White Mage',name:'Regent Veil',c:6,r:2,ct:2}],
    [{job:'Knight',name:'Siege Warden',c:7,r:1,ct:31},{job:'Archer',name:'Longnight',c:8,r:0,ct:23},{job:'Black Mage',name:'Umbra',c:8,r:2,ct:19},{job:'Monk',name:'Bell Titan',c:7,r:3,ct:13},{job:'Thief',name:'Nightglass',c:6,r:1,ct:10},{job:'Archer',name:'Signal-Eater',c:7,r:0,ct:7},{job:'Black Mage',name:'Blackflare',c:6,r:0,ct:5},{job:'Knight',name:'Crown Guard',c:8,r:3,ct:4},{job:'White Mage',name:'Ash Choir',c:6,r:2,ct:3}],
    [{job:'Knight',name:'Crown Guard',c:8,r:1,ct:30},{job:'Archer',name:'Crown Eye',c:8,r:0,ct:24},{job:'Black Mage',name:'Core Spark',c:8,r:2,ct:20},{job:'Monk',name:'Ash Fist',c:7,r:2,ct:15},{job:'Thief',name:'Cinderstep',c:6,r:1,ct:11},{job:'White Mage',name:'Core Veil',c:6,r:0,ct:8},{job:'Knight',name:'Gateblade',c:8,r:4,ct:5},{job:'Black Mage',name:'Singe',c:7,r:0,ct:4},{job:'Boss',name:'EMBER REGENT',c:7,r:3,ct:40,boss:true}],
    [{job:'Monk',name:'Red Palm',c:7,r:1,ct:29},{job:'Archer',name:'Glasswing',c:8,r:0,ct:21},{job:'Thief',name:'Quickscar',c:8,r:2,ct:17},{job:'Black Mage',name:'Hollowflame',c:7,r:3,ct:13},{job:'Knight',name:'Iron Choir',c:6,r:1,ct:10},{job:'White Mage',name:'Mothlight',c:8,r:3,ct:8},{job:'Archer',name:'Needle',c:7,r:0,ct:6},{job:'Knight',name:'Stonewake',c:6,r:0,ct:4},{job:'Black Mage',name:'Blue Ash',c:8,r:4,ct:2}]
  ];
  var BATTLE_SPECS = [
    ['ASH GATE','Rout','plaza','none',0,5,'Break the vanguard'],
    ['ROOTBRIDGE','Hold','forest','thorns',1,6,'Hold both waystones'],
    ['GLASSMARKET','Capture','market','none',2,6,'Claim the market sigils'],
    ['MOONRAIL RUN','Escort','night','void',3,6,'Walk the courier to the far gate'],
    ['FURNACE MOUTH','Rout','keep','collapse',4,7,'Break the furnace guard'],
    ['THORN CROWN','Hold','forest','thorns',1,7,'Hold both waystones'],
    ['SUNKEN ARCHIVE','Capture','night','void',3,7,'Claim the archive sigils'],
    ['LANTERN RUN','Escort','plaza','none',0,7,'Walk the courier to the lantern'],
    ['GILT RAMPART','Rout','keep','collapse',2,7,'Break the goldguard line'],
    ['HOLLOWBELL','Hold','night','void',3,8,'Hold both signal fires'],
    ['CINDERSPAN','Capture','plaza','none',0,8,'Claim the bridge sigils'],
    ['NIGHT COURIER','Escort','forest','thorns',1,8,'Walk the courier to the root gate'],
    ['RIFT ORCHARD','Rout','forest','thorns',1,8,'Break the thorn host'],
    ['SHATTERSTEP','Hold','keep','collapse',2,8,'Hold both high steps'],
    ['BLACK CANAL','Capture','night','void',3,9,'Claim the canal sigils'],
    ['EMBER RELAY','Escort','keep','collapse',4,9,'Walk the courier to the crown'],
    ['CROWN APPROACH','Rout','plaza','none',0,9,'Break the crown approach'],
    ['ASHEN CHOIR','Hold','forest','thorns',1,9,'Hold both waystones'],
    ['LAST WAYSTONE','Capture','keep','collapse',2,10,'Claim the last sigils'],
    ['EMBERHOLD HEART','Rout','finale','core',4,10,'Defeat the Ember Regent']
  ];
  var PALETTES = {
    plaza:{sky:'#101c36',floor:'#153344',glow:'#55c6ff',accent:'#ffd36c'},
    forest:{sky:'#0d2430',floor:'#173b35',glow:'#75f0b0',accent:'#b8ff9a'},
    market:{sky:'#241a35',floor:'#3c2e4b',glow:'#c9a5ff',accent:'#ffd36c'},
    night:{sky:'#080f29',floor:'#101c3a',glow:'#79e8ef',accent:'#9c8cff'},
    keep:{sky:'#21182d',floor:'#3b2d3b',glow:'#ff9c52',accent:'#ffd36c'},
    finale:{sky:'#321526',floor:'#4b1e2d',glow:'#ff6683',accent:'#ffd36c'}
  };

  var JOBS = {
    Knight:{glyph:'K',hp:110,mp:10,speed:6,move:3,jump:1,pa:11,ma:3,role:'anchor',abilities:['Shield Bash','Rampart']},
    Archer:{glyph:'A',hp:70,mp:10,speed:8,move:4,jump:3,pa:9,ma:3,role:'ranged',abilities:['Aimed Shot','Pin']},
    'Black Mage':{glyph:'M',hp:55,mp:50,speed:6,move:3,jump:1,pa:4,ma:12,role:'mage',abilities:['Fireball','Frost Lance','Ember Sigil']},
    'White Mage':{glyph:'W',hp:60,mp:50,speed:7,move:3,jump:1,pa:4,ma:10,role:'healer',abilities:['Heal','Bless']},
    Monk:{glyph:'O',hp:95,mp:5,speed:9,move:4,jump:2,pa:12,ma:4,role:'bruiser',abilities:['Chakra','Wave Fist']},
    Thief:{glyph:'T',hp:65,mp:10,speed:11,move:5,jump:3,pa:8,ma:3,role:'flanker',abilities:['Backstab','Steal Tempo']},
    Boss:{glyph:'R',hp:260,mp:80,speed:5,move:3,jump:2,pa:18,ma:15,role:'boss',abilities:['Ruin Wave','Rampart']},
    Scout:{glyph:'C',hp:82,mp:12,speed:10,move:5,jump:3,pa:8,ma:4,role:'courier',abilities:['Attack','Dash']}
  };
  var PROMOTIONS = {
    Knight:[{id:'Vanguard',label:'Vanguard',mods:{hp:18,pa:2},abilities:['Brace Charge']},{id:'Templar',label:'Templar',mods:{hp:10,ma:3,defense:1},abilities:['Radiant Ward']}],
    Archer:[{id:'Ranger',label:'Ranger',mods:{hp:10,pa:2,move:1},abilities:['Volley']},{id:'Marksman',label:'Marksman',mods:{pa:4,move:-1},abilities:['Piercing Shot']}],
    'Black Mage':[{id:'Pyromancer',label:'Pyromancer',mods:{mp:12,ma:3},abilities:['Inferno']},{id:'Spellblade',label:'Spellblade',mods:{hp:10,pa:2},abilities:['Arcane Edge']}],
    'White Mage':[{id:'Oracle',label:'Oracle',mods:{mp:12,ma:3},abilities:['Aegis']},{id:'Cleric',label:'Cleric',mods:{hp:18,defense:1},abilities:['Sanctuary']}],
    Monk:[{id:'Battlemaster',label:'Battlemaster',mods:{hp:16,pa:3},abilities:['Counter']},{id:'Ascetic',label:'Ascetic',mods:{mp:10,ma:3},abilities:['Meditate']}],
    Thief:[{id:'Assassin',label:'Assassin',mods:{pa:4,move:1},abilities:['Vanish']},{id:'Trickster',label:'Trickster',mods:{hp:10,mp:10},abilities:['Decoy']}]
  };
  var EQUIPMENT = {
    'ironblade':{label:'Ironblade',slot:'weapon',pa:2},
    'sunbow':{label:'Sunbow',slot:'weapon',pa:1,accuracy:6},
    'emberfocus':{label:'Ember Focus',slot:'weapon',ma:2,mp:8},
    'leather':{label:'Leather Mantle',slot:'armor',hp:10},
    'wardplate':{label:'Wardplate',slot:'armor',hp:16,defense:1},
    'swiftboots':{label:'Swiftboots',slot:'armor',move:1,speed:1},
    'embercharm':{label:'Ember Charm',slot:'charm',accuracy:5,mp:6},
    'waystone':{label:'Waystone',slot:'charm',defense:1,hp:8}
  };
  var EQUIPMENT_ORDER = ['ironblade','sunbow','emberfocus','leather','wardplate','swiftboots','embercharm','waystone'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
  function key(c,r) { return c + ',' + r; }
  function inside(c,r) { return c >= 0 && r >= 0 && c < N && r < N; }
  function dist(a,b) { return Math.abs(a.c - b.c) + Math.abs(a.r - b.r); }
  function rngFactory(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function defaultRoster() {
    return [
      {id:'p-knight',name:'Aster',job:'Knight',level:1,xp:0,alive:true,promotion:null,equipment:{weapon:'ironblade',armor:'wardplate',charm:'waystone'}},
      {id:'p-archer',name:'Vela',job:'Archer',level:1,xp:0,alive:true,promotion:null,equipment:{weapon:'sunbow',armor:'leather',charm:'embercharm'}},
      {id:'p-mage',name:'Iris',job:'Black Mage',level:1,xp:0,alive:true,promotion:null,equipment:{weapon:'emberfocus',armor:'leather',charm:'embercharm'}},
      {id:'p-white',name:'Sol',job:'White Mage',level:1,xp:0,alive:true,promotion:null,equipment:{weapon:'emberfocus',armor:'wardplate',charm:'waystone'}},
      {id:'p-monk',name:'Bram',job:'Monk',level:1,xp:0,alive:true,promotion:null,equipment:{weapon:'ironblade',armor:'leather',charm:'waystone'}},
      {id:'p-thief',name:'Nyra',job:'Thief',level:1,xp:0,alive:true,promotion:null,equipment:{weapon:'ironblade',armor:'swiftboots',charm:'embercharm'}}
    ];
  }
  function defaultCampaign() { return {permadeath:false,activeRoster:['p-knight','p-archer','p-mage','p-white'],roster:defaultRoster()}; }
  function normaliseCampaign(input) {
    var base = defaultCampaign(), source = input && typeof input === 'object' ? input : {};
    if (typeof source.permadeath === 'boolean') base.permadeath = source.permadeath;
    if (Array.isArray(source.roster)) source.roster.forEach(function (member) {
      if (!member || typeof member !== 'object') return;
      var target = base.roster.find(function (x) { return x.id === member.id; });
      if (!target) return;
      ['name','job','promotion'].forEach(function (field) { if (typeof member[field] === 'string' || member[field] === null) target[field] = member[field]; });
      if (Number.isFinite(member.level)) target.level = clamp(Math.floor(member.level),1,20);
      if (Number.isFinite(member.xp)) target.xp = clamp(Math.floor(member.xp),0,9999);
      if (typeof member.alive === 'boolean') target.alive = member.alive;
      if (member.equipment && typeof member.equipment === 'object') Object.keys(target.equipment).forEach(function (slot) { if (typeof member.equipment[slot] === 'string' && EQUIPMENT[member.equipment[slot]]) target.equipment[slot] = member.equipment[slot]; });
    });
    var wanted = Array.isArray(source.activeRoster) ? source.activeRoster : base.activeRoster;
    base.activeRoster = wanted.filter(function (id, i) { return i < 4 && base.roster.some(function (m) { return m.id === id && (base.permadeath ? m.alive : true); }); });
    base.roster.filter(function (m) { return !base.permadeath || m.alive; }).forEach(function (m) { if (base.activeRoster.length < 4 && base.activeRoster.indexOf(m.id) < 0) base.activeRoster.push(m.id); });
    return base;
  }

  function makeBattle(index) {
    var spec = BATTLE_SPECS[index - 1] || BATTLE_SPECS[0], layout = clone(BASE_LAYOUTS[spec[4]]), set = ENEMY_SETS[spec[4]] || ENEMY_SETS[0], count = Math.min(spec[5], set.length), enemies = [];
    set.slice(0,count).forEach(function (unit, i) { enemies.push(Object.assign({}, unit, {id:'e-' + index + '-' + i})); });
    if (index === 20) enemies = set.map(function (unit, i) { return Object.assign({}, unit, {id:'e-20-' + i}); });
    var waystones = index % 3 === 0 ? [{c:3,r:4},{c:6,r:4}] : index % 3 === 1 ? [{c:4,r:4},{c:6,r:5}] : [{c:3,r:5},{c:5,r:4}];
    var objective = {kind:spec[1].toLowerCase(),label:spec[1].toUpperCase(),detail:spec[6],progress:0};
    if (objective.kind === 'hold') { objective.holdTiles = waystones.map(function (p) { return {c:p.c,r:p.r}; }); objective.target = 3 + (index % 3); }
    if (objective.kind === 'capture') { objective.points = waystones.map(function (p, i) { return {c:p.c,r:p.r,id:'point-' + index + '-' + i}; }); objective.target = objective.points.length; }
    if (objective.kind === 'escort') { objective.escortStart = {c:4,r:7}; objective.escortTarget = index % 2 ? {c:7,r:7} : {c:7,r:6}; objective.target = 1; }
    var palette = PALETTES[spec[2]] || PALETTES.plaza;
    return {
      id:'battle-' + index,name:spec[0],subtitle:spec[6],theme:spec[2],palette:palette,hazard:spec[3],signature:spec[6],vision:spec[2] === 'night' ? 3 : 9,
      waystones:waystones,pickups:[{c:2,r:6,kind:'heal',amount:28 + index},{c:5,r:3,kind:'buff',amount:2 + index % 3},{c:4,r:7,kind:'heal',amount:24 + index}],layout:layout,
      reinforcements:[{round:3 + index % 2,units:[{job:index % 2 ? 'Archer' : 'Monk',name:'Reserve ' + index,c:8,r:5},{job:index % 3 ? 'Knight' : 'Black Mage',name:'Reserve ' + (index + 1),c:8,r:6}]}],
      enemies:enemies,objective:objective,maxRounds:objective.kind === 'hold' ? objective.target + 6 : 18 + index % 4
    };
  }
  var MAPS = {};
  BATTLE_SPECS.forEach(function (_, i) { MAPS[i + 1] = makeBattle(i + 1); });

  function cloneLayout(map) {
    var board = [], r, c, i, item;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) board.push({h:0,terrain:'grass'});
    for (i = 0; i < map.layout.length; i++) { item = map.layout[i]; if (inside(item[0],item[1])) board[item[1] * N + item[0]] = {h:item[3] || 0,terrain:item[2] || 'grass'}; }
    return board;
  }
  function promotionSpec(job, id) { return (PROMOTIONS[job] || []).find(function (p) { return p.id === id; }) || null; }
  function equipmentMods(member) {
    var mods = {hp:0,mp:0,pa:0,ma:0,speed:0,move:0,defense:0,accuracy:0};
    Object.keys(member.equipment || {}).forEach(function (slot) { var item = EQUIPMENT[member.equipment[slot]]; if (!item) return; Object.keys(mods).forEach(function (field) { mods[field] += item[field] || 0; }); });
    return mods;
  }
  function createUnit(id, team, job, name, c, r, ct, boss, member) {
    var j = JOBS[job] || JOBS.Knight, p = member && promotionSpec(job, member.promotion), pm = p ? p.mods : {hp:0,mp:0,pa:0,ma:0,speed:0,move:0,defense:0}, em = member ? equipmentMods(member) : equipmentMods({equipment:{}}), level = member ? member.level : 1;
    var maxHp = j.hp + (level - 1) * 5 + (pm.hp || 0) + em.hp, maxMp = j.mp + (level - 1) * 2 + (pm.mp || 0) + em.mp;
    return {id:id,team:team,job:job,name:name,c:c,r:r,homeC:c,homeR:r,face:team === 'player' ? 'S' : 'N',ct:ct,alive:true,hp:maxHp,hpVisual:maxHp,maxHp:maxHp,mp:maxMp,maxMp:maxMp,pa:j.pa + (level - 1) + (pm.pa || 0) + em.pa,ma:j.ma + Math.floor((level - 1) / 2) + (pm.ma || 0) + em.ma,speed:Math.max(3,j.speed + (pm.speed || 0) + em.speed),move:Math.max(2,j.move + (pm.move || 0) + em.move),jump:j.jump,baseDefense:(job === 'Knight' || job === 'Boss' ? 3 : 1) + (pm.defense || 0) + em.defense,buffs:[],pending:null,acted:false,moveUsed:false,boss:!!boss,level:level,promotion:member && member.promotion || null,isRoster:!!member,memberId:member && member.id || null,accuracy:em.accuracy};
  }

  function createSimulation(seed, skirmish, campaignInput) {
    var s = (seed >>> 0) || 2417, battleNo = clamp(Math.floor(Number(skirmish) || 1),1,20), mission = MAPS[battleNo], campaign = normaliseCampaign(campaignInput), combatRng = rngFactory(s), board = [], r, c, edge, terrain, h;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) { edge = c === 0 || r === 0 || c === N - 1 || r === N - 1; h = clamp(Math.floor(combatRng() * 5) + (combatRng() < .18 ? 1 : -1),0,4); terrain = TERRAIN_NAMES[Math.floor(combatRng() * TERRAIN_NAMES.length)]; if (edge && combatRng() < .28) terrain = 'water'; board.push({h:h,terrain:terrain}); }
    var overlay = cloneLayout(mission), index; for (index = 0; index < board.length; index++) if (overlay[index].h || overlay[index].terrain !== 'grass') board[index] = overlay[index];
    [[1,7],[2,8],[0,8],[3,7],[7,1],[8,0],[8,2],[7,3],[6,1]].forEach(function (v) { board[v[1] * N + v[0]].terrain = 'grass'; board[v[1] * N + v[0]].h = clamp(board[v[1] * N + v[0]].h,0,2); });
    var objective = clone(mission.objective);
    var state = {seed:s,skirmish:battleNo,mapId:mission.id,map:mission,board:board,waystones:mission.waystones.map(function (v) { return {c:v.c,r:v.r}; }),pickups:mission.pickups.map(function (v,i) { return {c:v.c,r:v.r,kind:v.kind,amount:v.amount,id:'pickup-' + i,collected:false}; }),fields:[],units:[],tempo:{player:1,enemy:1},active:null,selected:null,mode:'boot',action:null,aim:null,origin:null,pendingMove:null,round:1,roundTurns:0,roundQuota:0,turnSerial:0,tick:0,tieSalt:0,ended:false,winner:null,endPending:false,aiClock:0,occupancyVersion:0,reinforcements:false,reachCache:new Map(),rangeCache:new Map(),events:[],eventSerial:0,tutorialStep:0,tutorialDone:false,unitsRemaining:0,permadeath:campaign.permadeath,objective:objective,objectiveProgress:0,capturePoints:objective.points ? objective.points.map(function (p) { return {c:p.c,r:p.r,id:p.id,owner:'neutral',progress:0}; }) : [],maxRounds:mission.maxRounds,campaign:campaign};
    campaign.activeRoster.slice(0,4).forEach(function (id, i) { var member = campaign.roster.find(function (m) { return m.id === id; }); if (member) state.units.push(createUnit(member.id,'player',member.job,member.name,[1,2,0,3][i], [7,8,8,7][i],94 - i * 10, false, member)); });
    if (objective.kind === 'escort') state.units.push(createUnit('escort-' + battleNo,'player','Scout','Mira',objective.escortStart.c,objective.escortStart.r,58,false,null));
    mission.enemies.forEach(function (e) { state.units.push(createUnit(e.id,'enemy',e.job,e.name,e.c,e.r,e.ct,e.boss,null)); });
    state.unitsRemaining = state.units.length; state.roundQuota = state.units.length;

    function emit(type,data) { state.eventSerial++; state.events.push(Object.assign({type:type,serial:state.eventSerial,round:state.round},data || {})); if (state.events.length > 180) state.events.splice(0,state.events.length - 180); }
    function unitAt(cc,rr,except) { return state.units.find(function (u) { return u.alive && u !== except && u.c === cc && u.r === rr; }); }
    function terrainAt(cc,rr) { return state.board[rr * N + cc] || {h:0,terrain:'grass'}; }
    function neighbors(cc,rr) { return [[cc+1,rr],[cc-1,rr],[cc,rr+1],[cc,rr-1]].filter(function (v) { return inside(v[0],v[1]); }); }
    function canStep(u,cc,rr,from) { var tile = terrainAt(cc,rr); if (!inside(cc,rr) || (tile.terrain === 'water' && state.map.hazard !== 'void')) return false; return !unitAt(cc,rr,u) && Math.abs(tile.h - terrainAt(from.c,from.r).h) <= u.jump; }
    function invalidate() { state.occupancyVersion++; state.reachCache.clear(); state.rangeCache.clear(); }
    function reachable(u) { var cacheKey = u.id + '|' + u.c + ',' + u.r + '|' + u.move + '|' + state.occupancyVersion; if (state.reachCache.has(cacheKey)) return state.reachCache.get(cacheKey); var out = new Map(), queue = [{c:u.c,r:u.r,d:0,path:[]}], head = 0; out.set(key(u.c,u.r),queue[0]); while (head < queue.length) { var cur = queue[head++]; if (cur.d >= u.move) continue; neighbors(cur.c,cur.r).forEach(function (v) { var cc=v[0],rr=v[1]; if (!canStep(u,cc,rr,cur) || out.has(key(cc,rr))) return; var next={c:cc,r:rr,d:cur.d+1,path:cur.path.concat([{c:cc,r:rr}])}; out.set(key(cc,rr),next); queue.push(next); }); } state.reachCache.set(cacheKey,out); return out; }
    function pathTo(u,cc,rr) { var hit = reachable(u).get(key(cc,rr)); return hit ? hit.path : []; }
    function abilitySpec(u,name) {
      var j=JOBS[u.job] || JOBS.Knight, common={name:name,range:1,minRange:1,cost:0,kind:'physical',factor:1,desc:'',presentation:'slash'};
      if (name === 'Attack') return Object.assign({},common,{range:j.role === 'ranged' ? 5 : j.role === 'mage' || j.role === 'healer' ? 3 : j.role === 'bruiser' ? 2 : j.role === 'boss' ? 3 : j.role === 'courier' ? 2 : 1,factor:j.role === 'ranged' ? 1.05 : 1,presentation:j.role === 'ranged' ? 'arrow' : j.role === 'mage' ? 'arcane' : 'slash'});
      var specs = {'Shield Bash':{range:1,factor:1.2,desc:'Damage and push',knock:1,presentation:'bash'},Rampart:{range:0,minRange:0,kind:'buff',desc:'Brace and taunt',presentation:'ward'},'Aimed Shot':{range:5,factor:1.9,charged:true,desc:'Charged high damage',presentation:'arrow'},Pin:{range:4,factor:.82,desc:'Damage and delay',presentation:'arrow'},Fireball:{range:4,factor:1.15,kind:'magic',cost:16,charged:true,aoe:1,desc:'Charged 3 x 3 blast',presentation:'fire'},'Frost Lance':{range:4,factor:1.05,kind:'magic',cost:10,desc:'Damage and slow',presentation:'frost'},Heal:{range:3,minRange:0,factor:1.45,kind:'heal',cost:10,desc:'Restore ally HP',presentation:'heal'},Bless:{range:3,minRange:0,factor:1,kind:'buff',cost:12,desc:'PA and accuracy for 2 turns',presentation:'heal'},Chakra:{range:0,minRange:0,factor:1,kind:'chakra',desc:'Restore self HP and MP',presentation:'heal'},'Wave Fist':{range:2,factor:1.05,desc:'Shockwave punch',presentation:'shock'},Backstab:{range:1,factor:2,desc:'Huge back bonus',backOnly:true,presentation:'slash'},'Steal Tempo':{range:1,factor:1,kind:'steal',desc:'Drain CT, gain Tempo',presentation:'slash'},'Ember Sigil':{range:3,minRange:0,factor:1,kind:'terrain',cost:12,desc:'Mark a tile with burning ground',presentation:'fire'},'Ruin Wave':{range:3,minRange:0,factor:1.15,kind:'magic',aoe:1,desc:'Boss 3 x 3 shockwave',presentation:'wave'},Dash:{range:3,minRange:1,kind:'dash',desc:'Leap to an open tile',presentation:'dash'},'Brace Charge':{range:2,factor:1.3,desc:'High-ground charge',presentation:'bash'},'Radiant Ward':{range:0,minRange:0,kind:'buff',desc:'Brace and cleanse',presentation:'heal'},Volley:{range:4,factor:.9,kind:'physical',aoe:1,desc:'Rain a 3 x 3 volley',presentation:'arrow'},'Piercing Shot':{range:6,factor:1.65,desc:'Ignore cover',presentation:'arrow',ignoreCover:1},Inferno:{range:4,factor:1.45,kind:'magic',cost:22,charged:true,aoe:1,desc:'Large burning blast',presentation:'fire'},'Arcane Edge':{range:2,factor:1.3,kind:'magic',cost:8,desc:'Close arcane cut',presentation:'arcane'},Aegis:{range:3,minRange:0,kind:'buff',cost:12,desc:'Shield an ally',presentation:'heal'},Sanctuary:{range:0,minRange:0,kind:'terrain',cost:15,desc:'Bless a safe tile',presentation:'heal'},Counter:{range:0,minRange:0,kind:'buff',desc:'Prepare a counter',presentation:'ward'},Meditate:{range:0,minRange:0,kind:'chakra',desc:'Restore HP and MP',presentation:'heal'},Vanish:{range:0,minRange:0,kind:'buff',desc:'Become untargetable briefly',presentation:'dash'},Decoy:{range:2,minRange:0,kind:'buff',cost:8,desc:'Draw enemy focus',presentation:'ward'}};
      var p = promotionSpec(u.job,u.promotion), available = (p && p.abilities || []).indexOf(name) >= 0; return Object.assign({},common,available ? specs[name] || {} : specs[name] || {});
    }
    function hasBuff(u,name) { return u.buffs.some(function (b) { return b.name === name && b.duration > 0; }); }
    function addBuff(u,name,duration,mods) { var old=u.buffs.find(function (b) { return b.name === name; }); if (old) { old.duration=Math.max(old.duration,duration); old.appliedOnTurn=state.active === u ? state.turnSerial : -1; return old; } var b={name:name,duration:duration,mods:mods || {},appliedOnTurn:state.active === u ? state.turnSerial : -1}; u.buffs.push(b); return b; }
    function buffMod(u,name,field) { var b=u.buffs.find(function (x) { return x.name === name && x.duration > 0; }); return b && b.mods[field] || 0; }
    function defense(u) { return u.baseDefense + buffMod(u,'rampart','defense') + buffMod(u,'aegis','defense'); }
    function power(u) { return u.pa + buffMod(u,'blessed','pa'); }
    function faceVector(face) { return {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[face] || [0,1]; }
    function relativeFacing(a,t) { var f=faceVector(t.face),dx=a.c-t.c,dy=a.r-t.r,dot=dx*f[0]+dy*f[1]; return dot > 0 ? 'FRONT' : dot < 0 ? 'BACK' : 'SIDE'; }
    function terrainLabel(attacker,target) { var a=terrainAt(attacker.c,attacker.r),t=terrainAt(target.c,target.r); if (a.h > t.h) return 'HIGH GROUND'; if (a.h < t.h) return 'LOW GROUND'; if (t.terrain === 'stone') return 'COVER'; if (t.terrain === 'sand') return 'OPEN'; return 'LEVEL'; }
    function preview(u,spec,t) {
      var attackerTile=terrainAt(u.c,u.r),targetTile=terrainAt(t.c,t.r),heightDelta=attackerTile.h-targetTile.h,dir=relativeFacing(u,t),flankBonus=dir === 'BACK' ? 16 : dir === 'SIDE' ? 8 : 0,terrainHitBonus=clamp(heightDelta * 7,-18,22) - (targetTile.terrain === 'stone' && !spec.ignoreCover ? 8 : 0) + (u.accuracy || 0),terrainDamageBonus=heightDelta * 3 - (targetTile.terrain === 'stone' && !spec.ignoreCover ? 2 : 0),hit=(spec.kind === 'magic' ? 92 : 78) + flankBonus + terrainHitBonus + buffMod(u,'blessed','accuracy'),raw=spec.kind === 'magic' ? u.ma * spec.factor : power(u) * spec.factor;
      if (spec.backOnly && dir !== 'BACK') hit=20; hit=clamp(hit,15,98);
      var damage=Math.max(1,Math.round(raw * (1 + terrainDamageBonus / 100) * (dir === 'BACK' ? 1.5 : dir === 'SIDE' ? 1.25 : 1) - (spec.kind === 'physical' ? defense(t) : 0)));
      return {hit:hit,damage:damage,dir:dir,flankBonus:flankBonus,terrainHitBonus:terrainHitBonus,terrainDamageBonus:terrainDamageBonus,terrain:terrainLabel(u,t),adv:heightDelta};
    }
    function validTarget(u,spec,cc,rr) { if (!inside(cc,rr) || terrainAt(cc,rr).terrain === 'water') return false; var d=dist(u,{c:cc,r:rr}),min=spec.minRange == null ? 1 : spec.minRange,t=unitAt(cc,rr); if (d > spec.range || d < min) return false; if (spec.name === 'Rampart' || spec.kind === 'chakra' || spec.name === 'Counter' || spec.name === 'Meditate' || spec.name === 'Vanish') return cc === u.c && rr === u.r; if (spec.kind === 'dash') return !t; if (spec.kind === 'terrain') return !t; if (spec.backOnly && (!t || relativeFacing(u,t) !== 'BACK')) return false; if (spec.kind === 'heal' || spec.kind === 'buff') return !!t && t.team === u.team; if (spec.kind === 'steal') return !!t && t.team !== u.team; if (spec.aoe) return true; return !!t && t.team !== u.team; }
    function actionTiles(u,spec) { if (spec.name === 'Rampart' || spec.name === 'Chakra' || spec.name === 'Counter' || spec.name === 'Meditate' || spec.name === 'Vanish') return [{c:u.c,r:u.r}]; var cacheKey=u.id+'|'+spec.name+'|'+u.c+','+u.r+'|'+state.occupancyVersion; if (state.rangeCache.has(cacheKey)) return state.rangeCache.get(cacheKey); var out=[],min=spec.minRange == null ? 1 : spec.minRange,rr,cc; for (rr=0;rr<N;rr++) for (cc=0;cc<N;cc++) if (terrainAt(cc,rr).terrain !== 'water') { var d=dist(u,{c:cc,r:rr}); if (d <= spec.range && d >= min) out.push({c:cc,r:rr}); } state.rangeCache.set(cacheKey,out); return out; }
    function hashTie(a,b,salt) { function h(value) { var n=(state.seed ^ salt) >>> 0,str=value.id || value; for (var i=0;i<str.length;i++) n=Math.imul(n ^ str.charCodeAt(i),16777619) >>> 0; return n >>> 0; } return h(a)-h(b); }
    function compareReady(a,b) { return b.ct-a.ct || hashTie(a,b,state.tieSalt) || String(a.id).localeCompare(String(b.id)); }
    function livingCount(team) { return state.units.filter(function (u) { return u.alive && (!team || u.team === team); }).length; }
    function queueForecast() { var sim=state.units.filter(function (u) { return u.alive; }).map(function (u) { return {id:u.id,ct:u.ct-(state.active && u === state.active ? 100 : 0),speed:u.speed}; }),ids=[],guard=0; while (ids.length < 7 && guard++ < 600 && sim.length) { var ready=sim.filter(function (x) { return x.ct >= 100; }); if (!ready.length) { var min=Math.min.apply(Math,sim.map(function (x) { return Math.max(0,100-x.ct); })); sim.forEach(function (x) { x.ct += min; }); ready=sim.filter(function (x) { return x.ct >= 100; }); } ready.sort(compareReady); ids.push(ready[0].id); ready[0].ct -= 100; } return ids; }
    function tickBuffs(u) { for (var i=u.buffs.length-1;i>=0;i--) { var b=u.buffs[i]; if (b.appliedOnTurn === state.turnSerial) { b.appliedOnTurn=-1; continue; } b.duration--; if (b.duration <= 0) u.buffs.splice(i,1); } }
    function collectPickups(u) { state.pickups.forEach(function (p) { if (p.collected || p.c !== u.c || p.r !== u.r) return; p.collected=true; if (p.kind === 'heal') { var hp=Math.min(u.maxHp-u.hp,p.amount); u.hp += hp; emit('pickup',{unitId:u.id,kind:'heal',amount:hp,c:p.c,r:p.r}); } else { addBuff(u,'blessed',2,{pa:3,accuracy:8}); emit('pickup',{unitId:u.id,kind:'buff',amount:p.amount,c:p.c,r:p.r}); } }); }
    function triggerHazard(u) { if (!u.alive) return; var tile=terrainAt(u.c,u.r),damage=0; if (state.map.hazard === 'thorns' && tile.terrain === 'grass' && (u.c+u.r) % 3 === 0) damage=4; if (state.map.hazard === 'collapse' && tile.h >= 3 && (state.round+u.c+u.r) % 4 === 0) damage=6; if (state.map.hazard === 'void' && tile.terrain === 'water') damage=10; if (state.map.hazard === 'core' && tile.h >= 3) damage=5; var field=state.fields.find(function (f) { return f.c === u.c && f.r === u.r; }); if (field) damage += field.kind === 'sanctuary' ? -5 : 7; damage=Math.max(0,damage); if (damage) { u.hp=Math.max(0,u.hp-damage); emit('hazard',{unitId:u.id,amount:damage,c:u.c,r:u.r}); if (u.hp <= 0) { u.alive=false; emit('ko',{unitId:u.id,cause:'hazard'}); } state.unitsRemaining=livingCount(); } }
    function onPoint(point) { var players=state.units.some(function (u) { return u.alive && u.team === 'player' && u.c === point.c && u.r === point.r; }),enemies=state.units.some(function (u) { return u.alive && u.team === 'enemy' && u.c === point.c && u.r === point.r; }); return {players:players,enemies:enemies}; }
    function updateObjective() {
      var obj=state.objective;
      if (obj.kind === 'hold') { var held=obj.holdTiles.filter(function (p) { var presence=onPoint(p); return presence.players && !presence.enemies; }).length; if (held === obj.holdTiles.length) state.objectiveProgress=Math.min(obj.target,state.objectiveProgress+1); else state.objectiveProgress=Math.max(0,state.objectiveProgress-1); }
      if (obj.kind === 'capture') state.capturePoints.forEach(function (point) { var presence=onPoint(point); if (presence.players && !presence.enemies) point.progress=Math.min(2,point.progress+1); else if (presence.enemies) point.progress=Math.max(0,point.progress-1); if (point.progress >= 2) point.owner='player'; else if (point.progress <= 0) point.owner='neutral'; });
      if (obj.kind === 'escort') { var escort=state.units.find(function (u) { return u.id === 'escort-' + state.skirmish; }); state.objectiveProgress=escort && escort.alive ? Math.max(0,escort.c - obj.escortStart.c + (obj.escortStart.r - escort.r) * .25) : 0; }
      emit('objective',{kind:obj.kind,progress:state.objectiveProgress,points:state.capturePoints.map(function (p) { return {id:p.id,owner:p.owner,progress:p.progress}; })});
    }
    function objectiveVictory() { var obj=state.objective; if (obj.kind === 'rout') return livingCount('enemy') === 0; if (obj.kind === 'hold') return state.objectiveProgress >= obj.target; if (obj.kind === 'capture') return state.capturePoints.length > 0 && state.capturePoints.every(function (p) { return p.owner === 'player'; }); if (obj.kind === 'escort') { var escort=state.units.find(function (u) { return u.id === 'escort-' + state.skirmish; }); return !!escort && escort.alive && escort.c === obj.escortTarget.c && escort.r === obj.escortTarget.r; } return false; }
    function finishTurn() { var u=state.active; if (!u) return; tickBuffs(u); u.ct=Math.max(0,u.ct-100); u.acted=true; state.roundTurns++; var quota=Math.max(1,state.roundQuota || livingCount()); if (state.roundTurns >= quota) { state.roundTurns=0; state.round++; state.tempo.player=clamp(state.tempo.player+state.waystones.filter(function (w) { return state.units.some(function (x) { return x.alive && x.team === 'player' && dist(x,w) <= 1; }); }).length,0,6); state.tempo.enemy=clamp(state.tempo.enemy+state.waystones.filter(function (w) { return state.units.some(function (x) { return x.alive && x.team === 'enemy' && dist(x,w) <= 1; }); }).length,0,6); updateObjective(); emit('round',{round:state.round}); spawnReinforcements(); } state.action=null; state.aim=null; state.origin=null; state.active=null; state.mode='clock'; checkEnd(); if (!state.ended) beginNextTurn(); }
    function spawnReinforcements() { if (state.reinforcements) return; var wave=state.map.reinforcements.find(function (x) { return x.round === state.round; }); if (!wave) return; state.reinforcements=true; var positions=[]; wave.units.forEach(function (e,i) { if (!unitAt(e.c,e.r)) { state.units.push(createUnit('reinforce-' + state.round + '-' + i,'enemy',e.job,e.name,e.c,e.r,12)); positions.push({c:e.c,r:e.r}); } }); state.unitsRemaining=livingCount(); state.roundQuota=Math.max(state.roundQuota,state.units.length); invalidate(); emit('reinforcements',{count:positions.length,positions:positions}); }
    function checkEnd() { state.unitsRemaining=livingCount(); var player=livingCount('player') > 0,enemy=livingCount('enemy') > 0; if (!player) { state.ended=true;state.winner='enemy';state.mode='ended';emit('battle-end',{winner:'enemy',rounds:state.round});return; } if (objectiveVictory()) { state.ended=true;state.winner='player';state.mode='ended';emit('battle-end',{winner:'player',rounds:state.round});return; } if (state.round > state.maxRounds) { state.ended=true;state.winner='enemy';state.objective.failed=true;state.mode='ended';emit('battle-end',{winner:'enemy',rounds:state.round});return; } if (!enemy && state.objective.kind === 'rout') { state.ended=true;state.winner='player';state.mode='ended';emit('battle-end',{winner:'player',rounds:state.round}); } }
    function beginNextTurn() { if (state.ended) return; state.active=null;state.mode='clock';var guard=0;while (!state.active && guard++ < 300) { var ready=state.units.filter(function (u) { return u.alive && u.ct >= 100; }); if (!ready.length) { state.tick++;state.units.forEach(function (u) { if (u.alive) u.ct += u.speed; });ready=state.units.filter(function (u) { return u.alive && u.ct >= 100; }); } if (ready.length) { ready.sort(compareReady);state.active=ready[0]; } } if (!state.active) { state.units.filter(function (u) { return u.alive; }).forEach(function (u) { u.ct += 20; });return beginNextTurn(); } state.turnSerial++;state.selected=state.active;state.active.acted=false;state.active.moveUsed=false;state.origin={c:state.active.c,r:state.active.r};state.aim=null;state.aiClock=0; if (state.active.pending) { resolvePending(state.active);return; } state.mode=state.active.team === 'enemy' ? 'ai' : 'move'; emit('turn',{unitId:state.active.id,team:state.active.team}); }
    function applyMove(u,path) { if (!path.length) { state.mode='action';return; } u.moveUsed=true;var from={c:u.c,r:u.r};path.forEach(function (p) { u.c=p.c;u.r=p.r; });u.face=path.length ? (path[path.length-1].c > from.c ? 'E' : path[path.length-1].c < from.c ? 'W' : path[path.length-1].r > from.r ? 'S' : 'N') : u.face;invalidate();collectPickups(u);triggerHazard(u);emit('move',{unitId:u.id,from:from,path:path.slice()});updateObjective();if (!u.alive) { finishTurn();return; }checkEnd();if (!state.ended) state.mode='action'; }
    function selectMove(cc,rr) { if (state.mode !== 'move' || !state.active || state.active.team !== 'player') return false;var path=pathTo(state.active,cc,rr);if (!path.length && (cc !== state.active.c || rr !== state.active.r)) return false;applyMove(state.active,path);return true; }
    function undoMove() { if (!state.active || state.mode !== 'action' || !state.active.moveUsed || !state.origin) return false;state.active.c=state.origin.c;state.active.r=state.origin.r;state.active.moveUsed=false;state.active.face='S';invalidate();state.mode='move';return true; }
    function beginAction(name) { if (!state.active || state.active.team !== 'player' || (state.mode !== 'move' && state.mode !== 'action')) return false;var spec=abilitySpec(state.active,name);if (!spec || state.active.mp < spec.cost) return false;state.action=spec;state.aim=null;state.mode='aim';return true; }
    function resolveAbility(u,spec,cc,rr,targetId,fizzle) {
      var targets=[],t;if (fizzle) { emit('fizzle',{unitId:u.id,ability:spec.name,c:cc,r:rr});return; }
      if (spec.name === 'Rampart' || spec.name === 'Radiant Ward' || spec.name === 'Counter' || spec.name === 'Vanish' || spec.name === 'Decoy') { addBuff(u,spec.name === 'Radiant Ward' ? 'aegis' : spec.name === 'Counter' ? 'counter' : spec.name === 'Vanish' ? 'vanish' : spec.name === 'Decoy' ? 'Decoy' : 'rampart',2,spec.name === 'Radiant Ward' ? {defense:4} : spec.name === 'Decoy' ? {taunt:true} : {defense:3,taunt:spec.name === 'Rampart'});emit('buff',{unitId:u.id,ability:spec.name,c:u.c,r:u.r,presentation:spec.presentation});return; }
      if (spec.name === 'Chakra' || spec.name === 'Meditate') { var hp=Math.min(u.maxHp-u.hp,spec.name === 'Meditate' ? 32 : 25),mp=Math.min(u.maxMp-u.mp,spec.name === 'Meditate' ? 14 : 8);u.hp+=hp;u.mp+=mp;emit('support',{unitId:u.id,ability:spec.name,hp:hp,mp:mp,c:u.c,r:u.r,presentation:spec.presentation});return; }
      if (spec.name === 'Dash') { if (inside(cc,rr) && !unitAt(cc,rr)) { var fromDash={c:u.c,r:u.r};u.c=cc;u.r=rr;invalidate();emit('move',{unitId:u.id,from:fromDash,path:[{c:cc,r:rr}],presentation:'dash'}); } return; }
      t=targetId ? state.units.find(function (x) { return x.id === targetId && x.alive; }) : unitAt(cc,rr);
      if (spec.kind === 'heal' || spec.kind === 'buff') { if (!t || t.team !== u.team) return; if (spec.name === 'Heal') { var amount=Math.min(t.maxHp-t.hp,Math.round(u.ma*spec.factor));t.hp+=amount;emit('support',{unitId:u.id,targetId:t.id,ability:spec.name,amount:amount,c:t.c,r:t.r,presentation:spec.presentation}); } else { addBuff(t,'blessed',2,{pa:3,accuracy:8});t.ct+=25;emit('buff',{unitId:u.id,targetId:t.id,ability:spec.name,c:t.c,r:t.r,presentation:spec.presentation}); } return; }
      if (spec.kind === 'terrain') { var kind=spec.name === 'Sanctuary' ? 'sanctuary' : 'ember';state.fields.push({id:'field-' + state.eventSerial,c:cc,r:rr,kind:kind,turns:3});emit('terrain',{unitId:u.id,ability:spec.name,c:cc,r:rr,presentation:spec.presentation});return; }
      if (spec.name === 'Steal Tempo') { if (t && t.team !== u.team) { t.ct=Math.max(0,t.ct-35);state.tempo[u.team]=clamp(state.tempo[u.team]+1,0,6);emit('support',{unitId:u.id,targetId:t.id,ability:spec.name,amount:35,c:t.c,r:t.r,presentation:spec.presentation}); } return; }
      if (spec.aoe) state.units.forEach(function (x) { if (x.alive && x.team !== u.team && Math.abs(x.c-cc) <= 1 && Math.abs(x.r-rr) <= 1) targets.push(x); }); else if (t && t.team !== u.team) targets.push(t);
      var outcomes=[];targets.forEach(function (target) { var pre=preview(u,spec,target),hit=combatRng()*100 <= pre.hit,crit=pre.dir === 'BACK' || !!spec.backOnly,damage=hit ? Math.max(1,Math.round(pre.damage*(.9+combatRng()*.2))) : 0;outcomes.push({targetId:target.id,hit:hit,crit:crit,damage:damage,hitChance:pre.hit,direction:pre.dir,terrain:pre.terrain,flankBonus:pre.flankBonus,terrainHitBonus:pre.terrainHitBonus,c:target.c,r:target.r});if (hit) { target.hp=Math.max(0,target.hp-damage);if (spec.name === 'Pin') target.ct=Math.max(0,target.ct-40);if (spec.name === 'Frost Lance') target.ct=Math.max(0,target.ct-35);if (spec.knock) { var dx=Math.sign(target.c-u.c),dy=Math.sign(target.r-u.r),nc=target.c+dx,nr=target.r+dy;if (inside(nc,nr) && !unitAt(nc,nr) && terrainAt(nc,nr).terrain !== 'water') { target.c=nc;target.r=nr;invalidate(); } }if (target.hp <= 0) { target.alive=false;emit('ko',{unitId:target.id,cause:spec.name}); } }u.face=target.c > u.c ? 'E' : target.c < u.c ? 'W' : target.r > u.r ? 'S' : 'N'; });
      state.unitsRemaining=livingCount();emit('attack',{unitId:u.id,ability:spec.name,presentation:spec.presentation,c:cc,r:rr,from:{c:u.c,r:u.r},outcomes:outcomes});updateObjective();checkEnd();
    }
    function resolvePending(u) { var pending=u.pending;if (!pending) return;u.pending=null;var spec=abilitySpec(u,pending.name),target=pending.targetId && state.units.find(function (x) { return x.id === pending.targetId; });if (target && (!target.alive || target.team === u.team || !validTarget(u,spec,target.c,target.r))) resolveAbility(u,spec,pending.c,pending.r,pending.targetId,true);else resolveAbility(u,spec,target ? target.c : pending.c,target ? target.r : pending.r,pending.targetId,false);if (!state.ended) finishTurn(); }
    function confirmAction(cc,rr) { if (state.mode !== 'aim' || !state.active || !state.action) return false;var u=state.active,spec=state.action;if (!validTarget(u,spec,cc,rr)) return false;var target=unitAt(cc,rr);if (spec.charged) { u.mp-=spec.cost;u.pending={name:spec.name,c:cc,r:rr,targetId:spec.aoe ? null : target && target.id,team:target && target.team};emit('charge',{unitId:u.id,ability:spec.name,c:cc,r:rr,presentation:spec.presentation});state.action=null;state.mode='clock';finishTurn();return true; }if (spec.cost) u.mp-=spec.cost;resolveAbility(u,spec,cc,rr,target && target.id,false);state.action=null;if (!state.ended) finishTurn();return true; }
    function cancelAction() { if (state.mode !== 'aim') return false;state.action=null;state.aim=null;state.mode=state.active && state.active.moveUsed ? 'action' : 'move';return true; }
    function endTurn() { if (!state.active || state.active.team !== 'player' || (state.mode !== 'move' && state.mode !== 'action')) return false;finishTurn();return true; }
    function spendTempo(name) { var u=state.active,cost=name === 'Surge' ? 2 : 3;if (!u || state.tempo[u.team] < cost) return false;state.tempo[u.team]-=cost;if (name === 'Surge') { u.ct+=60;emit('tempo',{unitId:u.id,ability:name,amount:60}); } else state.units.filter(function (a) { return a.alive && a.team === u.team && a !== u && dist(a,u) === 1; }).forEach(function (a) { var amount=Math.min(a.maxHp-a.hp,18);a.hp+=amount;emit('support',{unitId:u.id,targetId:a.id,ability:name,amount:amount,c:a.c,r:a.r}); });finishTurn();return true; }
    function targetScore(u,t) { var score=(t.hp/t.maxHp) * 12 + dist(u,t) * 1.6;if (hasBuff(t,'vanish')) score += 8;if (state.objective.kind === 'escort' && t.id === 'escort-' + state.skirmish) score -= 14;if (state.objective.kind === 'capture') { var point=state.capturePoints.find(function (p) { return p.owner !== 'player' && dist(t,p) <= 2; });if (point) score -= 5; }if (hasBuff(t,'rampart') || hasBuff(t,'Decoy')) score -= 4;return score; }
    function bestTarget(u) { var enemies=state.units.filter(function (t) { return t.alive && t.team !== u.team; });enemies.sort(function (a,b) { return targetScore(u,a)-targetScore(u,b) || hashTie(a,b,17); });return enemies[0]; }
    function flankScore(position,target) { var f=faceVector(target.face),dx=position.c-target.c,dy=position.r-target.r,dot=dx*f[0]+dy*f[1];return dot < 0 ? 2 : dot === 0 ? 1 : 0; }
    function aiMove(u,target) { if (u.moveUsed) { finishTurn();return; }var map=reachable(u),current=dist(u,target),best=null;map.forEach(function (entry) { if (entry.d === 0) return;var p=flankScore(entry,target),distance=dist(entry,target),score=distance - p * 1.8;if (distance >= current && p === 0) score += 3;if (!best || score < best.score || score === best.score && (p > best.flank || entry.d > best.d || entry.d === best.d && hashTie({id:key(entry.c,entry.r)},{id:key(best.c,best.r)},31) < 0)) best=Object.assign({},entry,{score:score,flank:p}); });if (best) { applyMove(u,best.path);if (u.team === 'enemy' && !state.ended) aiAct(u,target); } else finishTurn(); }
    function aiAct(u,target) { if (!u.alive || state.ended) return;var job=JOBS[u.job] || JOBS.Knight,spec=null,chosen=null,wounded=state.units.filter(function (a) { return a.alive && a.team === u.team && a.hp < a.maxHp * .68; }).sort(function (a,b) { return a.hp/a.maxHp-b.hp/b.maxHp || hashTie(a,b,41); })[0];if (job.role === 'healer' && wounded) { var heal=abilitySpec(u,'Heal');if (u.mp >= heal.cost && validTarget(u,heal,wounded.c,wounded.r)) { spec=heal;chosen=wounded; } }if (!spec && job.role === 'mage' && u.mp >= 16) { var fire=abilitySpec(u,'Fireball'),near=state.units.filter(function (a) { return a.alive && a.team !== u.team && dist(u,a) <= fire.range; }),cluster=near.find(function (a) { return near.filter(function (b) { return Math.abs(b.c-a.c) <= 1 && Math.abs(b.r-a.r) <= 1; }).length >= 2; });if (cluster && validTarget(u,fire,cluster.c,cluster.r)) { spec=fire;chosen=cluster; } }if (!spec && target) { var names=(job.abilities || []).slice().reverse().concat((promotionSpec(u.job,u.promotion) || {abilities:[]}).abilities || [],['Attack']);for (var i=0;i<names.length;i++) { var candidate=abilitySpec(u,names[i]);if (u.mp >= candidate.cost && validTarget(u,candidate,target.c,target.r)) { spec=candidate;chosen=target;break; } } }if (spec && chosen) { if (spec.charged) { u.mp-=spec.cost;u.pending={name:spec.name,c:chosen.c,r:chosen.r,targetId:spec.aoe ? null : chosen.id};emit('charge',{unitId:u.id,ability:spec.name,c:chosen.c,r:chosen.r,presentation:spec.presentation});finishTurn(); } else { if (spec.cost) u.mp-=spec.cost;resolveAbility(u,spec,chosen.c,chosen.r,chosen.id,false);if (!state.ended) finishTurn(); }return; }if (target) aiMove(u,target);else finishTurn(); }
    function runAI(u) { if (!u || u !== state.active || state.mode !== 'ai') return;var target=bestTarget(u);if (!target) { checkEnd();return; }var attack=abilitySpec(u,'Attack');if (validTarget(u,attack,target.c,target.r)) aiAct(u,target);else aiMove(u,target); }
    function step(dt) { if (state.ended) return;if (state.mode === 'ai') { state.aiClock += Math.max(0,dt);if (state.aiClock >= 260) { state.aiClock=0;runAI(state.active); } }state.fields.forEach(function (field) { field.turns -= dt / 10000; });state.fields=state.fields.filter(function (field) { return field.turns > 0; }); }
    function drainEvents() { var copy=state.events.slice();state.events.length=0;return copy; }
    function start() { emit('battle-start',{skirmish:state.skirmish,mapId:state.mapId,objective:state.objective}); if (livingCount('player') === 0) { state.ended=true;state.winner='enemy';state.mode='ended';emit('battle-end',{winner:'enemy',rounds:state.round}); } else beginNextTurn(); return state; }
    function exportCampaign(victory) { var next=clone(campaign);if (!victory) return next;next.roster.forEach(function (member) { var unit=state.units.find(function (u) { return u.memberId === member.id; });if (!unit) return;if (unit.alive) member.xp=clamp((member.xp || 0) + 48 + Math.max(0,20-state.round),0,9999);else if (next.permadeath) member.alive=false;member.level=clamp(1+Math.floor(member.xp / 100),1,20); });next.activeRoster=next.activeRoster.filter(function (id) { return next.roster.some(function (m) { return m.id === id && (!next.permadeath || m.alive); }); });next.roster.filter(function (m) { return !next.permadeath || m.alive; }).forEach(function (m) { if (next.activeRoster.length < 4 && next.activeRoster.indexOf(m.id) < 0) next.activeRoster.push(m.id); });return next; }
    return {state:state,start:start,step:step,drainEvents:drainEvents,queueForecast:queueForecast,reachable:reachable,pathTo:pathTo,actionTiles:actionTiles,abilitySpec:abilitySpec,validTarget:validTarget,preview:preview,selectMove:selectMove,undoMove:undoMove,beginAction:beginAction,confirmAction:confirmAction,cancelAction:cancelAction,endTurn:endTurn,spendTempo:spendTempo,unitAt:unitAt,key:key,maps:MAPS,jobs:JOBS,exportCampaign:exportCampaign};
  }

  function runAuto(seed,skirmish) { var sim=createSimulation(seed,skirmish,defaultCampaign());sim.start();var signature=[],guard=0;while (!sim.state.ended && guard++ < 24000) { var s=sim.state,u=s.active;if (s.mode === 'ai') sim.step(260);else if (u && u.team === 'player' && s.mode === 'move') { var autoTarget=s.units.filter(function (x) { return x.alive && x.team !== u.team; }).sort(function (a,b) { return dist(u,a)-dist(u,b) || String(a.id).localeCompare(String(b.id)); })[0],autoBest={c:u.c,r:u.r,score:autoTarget ? dist(u,autoTarget) : 0};sim.reachable(u).forEach(function (entry) { if (autoTarget && dist(entry,autoTarget) < autoBest.score) autoBest={c:entry.c,r:entry.r,score:dist(entry,autoTarget)}; });sim.selectMove(autoBest.c,autoBest.r); } else if (u && u.team === 'player' && s.mode === 'action') { var attack=sim.abilitySpec(u,'Attack'),target=s.units.find(function (x) { return x.alive && x.team !== u.team && sim.validTarget(u,attack,x.c,x.r); });if (target) { sim.beginAction('Attack');sim.confirmAction(target.c,target.r); } else sim.endTurn(); } else if (s.mode === 'aim') sim.cancelAction();else sim.step(16.6667);sim.drainEvents().forEach(function (e) { if (e.type === 'attack' || e.type === 'ko' || e.type === 'battle-end' || e.type === 'reinforcements') signature.push([e.type,e.unitId || '',e.ability || '',e.winner || '',e.round || 0,e.outcomes ? e.outcomes.map(function (o) { return [o.targetId,o.hit,o.crit,o.damage]; }) : '']); }); }if (!sim.state.ended) signature.push(['timeout','','','',sim.state.round,'']);return {winner:sim.state.winner || 'timeout',rounds:sim.state.round,signature:signature}; }
  function regression(seed,skirmish) { var a=runAuto(seed,skirmish || 1),b=runAuto(seed,skirmish || 1);return {same:JSON.stringify(a) === JSON.stringify(b),first:a,second:b}; }

  return {N:N,JOBS:JOBS,MAPS:MAPS,PROMOTIONS:PROMOTIONS,EQUIPMENT:EQUIPMENT,EQUIPMENT_ORDER:EQUIPMENT_ORDER,defaultCampaign:defaultCampaign,create:createSimulation,regression:regression};
}));
