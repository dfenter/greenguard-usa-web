/* EMBERHOLD TACTICS - deterministic rules module
 *
 * This file owns the tactics clock. It has no DOM, Phaser, rendering, or
 * audio dependencies. The renderer consumes state plus drainEvents(). Keep
 * the formulas here stable when changing presentation.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EmberholdSim = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var N = 9;
  var TERRAIN_NAMES = ['grass', 'grass', 'grass', 'stone', 'sand', 'grass', 'water'];
  var MAPS = {
    1: {
      id: 'ember-plaza', name: 'EMBER PLAZA', subtitle: 'Open ground / flanking lanes',
      theme: 'plaza', hazard: 'none', signature: 'Twin Waystones', vision: 9,
      waystones: [{c: 4, r: 4}, {c: 6, r: 5}],
      pickups: [{c: 2, r: 6, kind: 'heal', amount: 30}, {c: 5, r: 3, kind: 'buff', amount: 2}, {c: 4, r: 7, kind: 'heal', amount: 24}],
      layout: [[4,4,'stone',0],[5,4,'stone',1],[4,5,'stone',1],[5,5,'grass',0],[2,6,'grass',0],[5,3,'grass',0]],
      reinforcements: [{round: 3, units: [{job: 'Archer', name: 'Vox-2', c: 8, r: 1}]}],
      enemies: [{id:'e-knight',job:'Knight',name:'Grim',c:7,r:1,ct:28},{id:'e-archer',job:'Archer',name:'Vox',c:8,r:0,ct:20},{id:'e-mage',job:'Black Mage',name:'Cinder',c:8,r:2,ct:15},{id:'e-monk',job:'Monk',name:'Rook',c:7,r:3,ct:10},{id:'e-thief',job:'Thief',name:'Nyx',c:6,r:1,ct:8}]
    },
    2: {
      id: 'whisperwood', name: 'WHISPERWOOD CHOKE', subtitle: 'Forest choke points / thorn lanes',
      theme: 'forest', hazard: 'thorns', signature: 'Rootbridge', vision: 9,
      waystones: [{c: 3, r: 4}, {c: 5, r: 4}],
      pickups: [{c: 1, r: 5, kind: 'heal', amount: 34}, {c: 4, r: 3, kind: 'buff', amount: 2}, {c: 6, r: 6, kind: 'heal', amount: 34}, {c: 4, r: 6, kind: 'buff', amount: 2}],
      layout: [[2,1,'stone',2],[2,2,'stone',2],[2,3,'grass',1],[2,4,'grass',1],[2,5,'stone',2],[2,6,'grass',1],[6,2,'stone',2],[6,3,'stone',2],[6,4,'grass',1],[6,5,'stone',2],[6,6,'grass',1],[4,3,'grass',0],[4,6,'grass',0]],
      reinforcements: [{round: 3, units: [{job: 'Monk', name: 'Bramble', c: 8, r: 4}, {job: 'Archer', name: 'Fletch', c: 8, r: 5}]}],
      enemies: [{id:'e-knight',job:'Knight',name:'Barkguard',c:7,r:1,ct:28},{id:'e-archer',job:'Archer',name:'Fletch',c:8,r:0,ct:20},{id:'e-mage',job:'Black Mage',name:'Mossfire',c:8,r:2,ct:15},{id:'e-monk',job:'Monk',name:'Bramble',c:7,r:3,ct:10},{id:'e-thief',job:'Thief',name:'Shadeleaf',c:6,r:1,ct:8},{id:'e-archer2',job:'Archer',name:'Wren',c:7,r:0,ct:5}]
    },
    3: {
      id: 'ruined-keep', name: 'RUINED KEEP', subtitle: 'Elevation / exposed courtyard',
      theme: 'keep', hazard: 'collapse', signature: 'Broken Crown', vision: 9,
      waystones: [{c: 4, r: 4}, {c: 7, r: 4}],
      pickups: [{c: 3, r: 6, kind: 'heal', amount: 38}, {c: 5, r: 2, kind: 'buff', amount: 3}, {c: 7, r: 6, kind: 'heal', amount: 38}, {c: 4, r: 7, kind: 'buff', amount: 3}],
      layout: [[3,2,'stone',4],[4,2,'stone',4],[5,2,'stone',3],[3,3,'stone',3],[5,3,'stone',3],[3,4,'stone',2],[5,4,'stone',2],[3,5,'stone',3],[4,5,'stone',4],[5,5,'stone',3],[4,4,'sand',1],[4,7,'grass',0]],
      reinforcements: [{round: 3, units: [{job: 'Knight', name: 'Gatebreaker', c: 8, r: 5}, {job: 'Black Mage', name: 'Ashglass', c: 8, r: 6}]}],
      enemies: [{id:'e-knight',job:'Knight',name:'Castellan',c:7,r:1,ct:30},{id:'e-archer',job:'Archer',name:'Bellshot',c:8,r:0,ct:22},{id:'e-mage',job:'Black Mage',name:'Ashglass',c:8,r:2,ct:18},{id:'e-monk',job:'Monk',name:'Gatebreaker',c:7,r:3,ct:12},{id:'e-thief',job:'Thief',name:'Ruinrunner',c:6,r:1,ct:9},{id:'e-knight2',job:'Knight',name:'Pikehand',c:8,r:3,ct:6},{id:'e-mage2',job:'Black Mage',name:'Cinderfall',c:6,r:0,ct:4}]
    },
    4: {
      id: 'night-siege', name: 'NIGHT SIEGE', subtitle: 'Limited vision / hazard crossings',
      theme: 'night', hazard: 'void', signature: 'Signal Fires', vision: 3,
      waystones: [{c: 2, r: 4}, {c: 6, r: 4}],
      pickups: [{c: 1, r: 6, kind: 'heal', amount: 42}, {c: 4, r: 3, kind: 'buff', amount: 3}, {c: 7, r: 6, kind: 'heal', amount: 42}, {c: 5, r: 6, kind: 'buff', amount: 3}],
      layout: [[3,1,'water',0],[4,1,'water',0],[5,1,'water',0],[3,2,'stone',2],[5,2,'stone',2],[3,3,'stone',2],[5,3,'stone',2],[3,4,'grass',1],[4,4,'sand',0],[5,4,'grass',1],[3,5,'stone',2],[5,5,'stone',2],[3,6,'water',0],[4,6,'water',0],[5,6,'water',0]],
      reinforcements: [{round: 3, units: [{job: 'Thief', name: 'Nightglass', c: 8, r: 6}, {job: 'Black Mage', name: 'Umbra', c: 8, r: 5}]}],
      enemies: [{id:'e-knight',job:'Knight',name:'Siege Warden',c:7,r:1,ct:31},{id:'e-archer',job:'Archer',name:'Longnight',c:8,r:0,ct:23},{id:'e-mage',job:'Black Mage',name:'Umbra',c:8,r:2,ct:19},{id:'e-monk',job:'Monk',name:'Bell Titan',c:7,r:3,ct:13},{id:'e-thief',job:'Thief',name:'Nightglass',c:6,r:1,ct:10},{id:'e-archer2',job:'Archer',name:'Signal-Eater',c:7,r:0,ct:7},{id:'e-mage2',job:'Black Mage',name:'Blackflare',c:6,r:0,ct:5},{id:'e-knight2',job:'Knight',name:'Ironwake',c:8,r:3,ct:3}]
    },
    5: {
      id: 'emberhold-core', name: 'EMBERHOLD CORE', subtitle: 'Finale / boss arena / full roster',
      theme: 'finale', hazard: 'core', signature: 'The Ember Crown', vision: 9,
      waystones: [{c: 4, r: 4}, {c: 6, r: 4}],
      pickups: [{c: 2, r: 6, kind: 'heal', amount: 50}, {c: 4, r: 3, kind: 'buff', amount: 4}, {c: 6, r: 6, kind: 'heal', amount: 50}, {c: 5, r: 5, kind: 'buff', amount: 4}],
      layout: [[3,3,'stone',3],[4,3,'stone',4],[5,3,'stone',3],[3,4,'stone',3],[5,4,'stone',3],[3,5,'stone',3],[4,5,'sand',4],[5,5,'stone',3],[4,4,'grass',1]],
      reinforcements: [{round: 3, units: [{job: 'Monk', name: 'Coreguard', c: 8, r: 5}, {job: 'Thief', name: 'Coreknife', c: 8, r: 6}]}],
      enemies: [{id:'e-boss',job:'Boss',name:'EMBER REGENT',c:7,r:3,ct:40,boss:true},{id:'e-knight',job:'Knight',name:'Crown Guard',c:8,r:1,ct:30},{id:'e-archer',job:'Archer',name:'Crown Eye',c:8,r:0,ct:24},{id:'e-mage',job:'Black Mage',name:'Core Spark',c:8,r:2,ct:20},{id:'e-monk',job:'Monk',name:'Ash Fist',c:7,r:2,ct:15},{id:'e-thief',job:'Thief',name:'Cinderstep',c:6,r:1,ct:11},{id:'e-white',job:'White Mage',name:'Regent Veil',c:6,r:0,ct:8},{id:'e-knight2',job:'Knight',name:'Gateblade',c:8,r:4,ct:5},{id:'e-mage2',job:'Black Mage',name:'Singe',c:7,r:0,ct:4}]
    }
  };

  var JOBS = {
    Knight: {glyph:'K', hp:110, mp:10, speed:6, move:3, jump:1, pa:11, ma:3, role:'anchor', abilities:['Shield Bash','Rampart']},
    Archer: {glyph:'A', hp:70, mp:10, speed:8, move:4, jump:3, pa:9, ma:3, role:'ranged', abilities:['Aimed Shot','Pin']},
    'Black Mage': {glyph:'M', hp:55, mp:50, speed:6, move:3, jump:1, pa:4, ma:12, role:'mage', abilities:['Fireball','Frost Lance','Ember Sigil']},
    'White Mage': {glyph:'W', hp:60, mp:50, speed:7, move:3, jump:1, pa:4, ma:10, role:'healer', abilities:['Heal','Bless']},
    Monk: {glyph:'O', hp:95, mp:5, speed:9, move:4, jump:2, pa:12, ma:4, role:'bruiser', abilities:['Chakra','Wave Fist']},
    Thief: {glyph:'T', hp:65, mp:10, speed:11, move:5, jump:3, pa:8, ma:3, role:'flanker', abilities:['Backstab','Steal Tempo']},
    Boss: {glyph:'R', hp:260, mp:80, speed:5, move:3, jump:2, pa:18, ma:15, role:'boss', abilities:['Ruin Wave','Rampart']}
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function key(c, r) { return c + ',' + r; }
  function inside(c, r) { return c >= 0 && r >= 0 && c < N && r < N; }
  function dist(a, b) { return Math.abs(a.c - b.c) + Math.abs(a.r - b.r); }
  function rngFactory(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function createUnit(id, team, job, name, c, r, ct, boss) {
    var j = JOBS[job] || JOBS.Knight;
    return {id:id, team:team, job:job, name:name, c:c, r:r, homeC:c, homeR:r,
      face:team === 'player' ? 'S' : 'N', ct:ct, alive:true, hp:j.hp, hpVisual:j.hp,
      maxHp:j.hp, mp:j.mp, maxMp:j.mp, pa:j.pa, ma:j.ma, speed:j.speed, move:j.move,
      jump:j.jump, baseDefense:job === 'Knight' || job === 'Boss' ? 3 : 1,
      buffs:[], pending:null, acted:false, moveUsed:false, boss:!!boss};
  }

  function cloneLayout(map) {
    var board = [], r, c, i, item;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) board.push({h:0, terrain:'grass'});
    for (i = 0; i < map.layout.length; i++) {
      item = map.layout[i];
      if (inside(item[0], item[1])) board[item[1] * N + item[0]] = {h:item[3] || 0, terrain:item[2] || 'grass'};
    }
    return board;
  }

  function createSimulation(seed, skirmish) {
    var s = (seed >>> 0) || 2417;
    var mission = MAPS[skirmish] || MAPS[1];
    var combatRng = rngFactory(s);
    var board = [];
    var r, c, edge, terrain, h;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      edge = c === 0 || r === 0 || c === N - 1 || r === N - 1;
      h = clamp(Math.floor(combatRng() * 5) + (combatRng() < 0.18 ? 1 : -1), 0, 4);
      terrain = TERRAIN_NAMES[Math.floor(combatRng() * TERRAIN_NAMES.length)];
      if (edge && combatRng() < 0.28) terrain = 'water';
      board.push({h:h, terrain:terrain});
    }
    /* Authored overlays are deterministic content, not a rules shortcut. */
    var overlay = cloneLayout(mission), index;
    for (index = 0; index < board.length; index++) {
      if (overlay[index].h || overlay[index].terrain !== 'grass') board[index] = overlay[index];
    }
    [[1,7],[2,8],[0,8],[3,7],[7,1],[8,0],[8,2],[7,3],[6,1]].forEach(function (v) {
      board[v[1] * N + v[0]].terrain = 'grass';
      board[v[1] * N + v[0]].h = clamp(board[v[1] * N + v[0]].h, 0, 2);
    });

    var state = {
      seed:s, skirmish:skirmish || 1, mapId:mission.id, map:mission, board:board,
      waystones:mission.waystones.map(function (v) { return {c:v.c, r:v.r}; }),
      pickups:mission.pickups.map(function (v, i) { return {c:v.c, r:v.r, kind:v.kind, amount:v.amount, id:'pickup-' + i, collected:false}; }),
      fields:[], units:[], tempo:{player:1, enemy:1}, active:null, selected:null,
      mode:'boot', action:null, aim:null, origin:null, pendingMove:null, round:1,
      roundTurns:0, roundQuota:0, turnSerial:0, tick:0, tieSalt:0, ended:false,
      winner:null, endPending:false, aiClock:0, occupancyVersion:0, reinforcements:false,
      reachCache:new Map(), rangeCache:new Map(), events:[], eventSerial:0,
      tutorialStep:0, tutorialDone:false, unitsRemaining:0
    };
    state.units = [
      createUnit('p-knight','player','Knight','Aster',1,7,94),
      createUnit('p-archer','player','Archer','Vela',2,8,82),
      createUnit('p-mage','player','Black Mage','Iris',0,8,70),
      createUnit('p-white','player','White Mage','Sol',3,7,64)
    ];
    mission.enemies.forEach(function (e) { state.units.push(createUnit(e.id,'enemy',e.job,e.name,e.c,e.r,e.ct,e.boss)); });
    state.unitsRemaining = state.units.length;
    state.roundQuota = state.units.length;

    function emit(type, data) {
      state.eventSerial++;
      state.events.push(Object.assign({type:type, serial:state.eventSerial, round:state.round}, data || {}));
      if (state.events.length > 160) state.events.splice(0, state.events.length - 160);
    }
    function unitAt(cc, rr, except) { return state.units.find(function (u) { return u.alive && u !== except && u.c === cc && u.r === rr; }); }
    function terrainAt(cc, rr) { return state.board[rr * N + cc] || {h:0, terrain:'grass'}; }
    function neighbors(cc, rr) { return [[cc+1,rr],[cc-1,rr],[cc,rr+1],[cc,rr-1]].filter(function (v) { return inside(v[0], v[1]); }); }
    function canStep(u, cc, rr, from) {
      var tile = terrainAt(cc, rr);
      if (!inside(cc, rr) || tile.terrain === 'water' && state.map.hazard !== 'void') return false;
      return !unitAt(cc, rr, u) && Math.abs(tile.h - terrainAt(from.c, from.r).h) <= u.jump;
    }
    function invalidate() { state.occupancyVersion++; state.reachCache.clear(); state.rangeCache.clear(); }
    function reachable(u) {
      var cacheKey = u.id + '|' + u.c + ',' + u.r + '|' + u.move + '|' + state.occupancyVersion;
      if (state.reachCache.has(cacheKey)) return state.reachCache.get(cacheKey);
      var out = new Map(), queue = [{c:u.c, r:u.r, d:0, path:[]}], head = 0;
      out.set(key(u.c, u.r), queue[0]);
      while (head < queue.length) {
        var cur = queue[head++];
        if (cur.d >= u.move) continue;
        neighbors(cur.c, cur.r).forEach(function (v) {
          var cc = v[0], rr = v[1];
          if (!canStep(u, cc, rr, cur) || out.has(key(cc, rr))) return;
          var next = {c:cc, r:rr, d:cur.d + 1, path:cur.path.concat([{c:cc, r:rr}])};
          out.set(key(cc, rr), next); queue.push(next);
        });
      }
      state.reachCache.set(cacheKey, out); return out;
    }
    function pathTo(u, cc, rr) { var hit = reachable(u).get(key(cc, rr)); return hit ? hit.path : []; }
    function abilitySpec(u, name) {
      var j = JOBS[u.job] || JOBS.Knight;
      var common = {name:name, range:1, minRange:1, cost:0, kind:'physical', factor:1, desc:'', presentation:'slash'};
      if (name === 'Attack') return Object.assign({}, common, {range:j.role === 'ranged' ? 5 : j.role === 'mage' || j.role === 'healer' ? 3 : j.role === 'bruiser' ? 2 : j.role === 'boss' ? 3 : 1, factor:j.role === 'ranged' ? 1.05 : 1});
      var specs = {
        'Shield Bash':{range:1,factor:1.2,desc:'Damage and push',knock:1}, Rampart:{range:0,minRange:0,kind:'buff',desc:'Brace and taunt'},
        'Aimed Shot':{range:5,factor:1.9,charged:true,desc:'Charged high damage'}, Pin:{range:4,factor:.82,desc:'Damage and delay'},
        Fireball:{range:4,factor:1.15,kind:'magic',cost:16,charged:true,aoe:1,desc:'Charged 3 x 3 blast'}, 'Frost Lance':{range:4,factor:1.05,kind:'magic',cost:10,desc:'Damage and slow'},
        Heal:{range:3,minRange:0,factor:1.45,kind:'heal',cost:10,desc:'Restore ally HP'}, Bless:{range:3,minRange:0,factor:1,kind:'buff',cost:12,desc:'PA and accuracy for 2 turns'},
        Chakra:{range:0,minRange:0,factor:1,kind:'chakra',desc:'Restore self HP and MP'}, 'Wave Fist':{range:2,factor:1.05,desc:'Shockwave punch'},
        Backstab:{range:1,factor:2,desc:'Huge back bonus',backOnly:true}, 'Steal Tempo':{range:1,factor:1,kind:'steal',desc:'Drain CT, gain Tempo'},
        'Ember Sigil':{range:3,minRange:0,factor:1,kind:'terrain',cost:12,desc:'Mark a tile with burning ground'}, 'Ruin Wave':{range:3,minRange:0,factor:1.15,kind:'magic',aoe:1,desc:'Boss 3 x 3 shockwave'}
      };
      return Object.assign({}, common, specs[name] || {});
    }
    function hasBuff(u, name) { return u.buffs.some(function (b) { return b.name === name && b.duration > 0; }); }
    function addBuff(u, name, duration, mods) {
      var old = u.buffs.find(function (b) { return b.name === name; });
      if (old) { old.duration = Math.max(old.duration, duration); old.appliedOnTurn = state.active === u ? state.turnSerial : -1; return old; }
      var b = {name:name, duration:duration, mods:mods || {}, appliedOnTurn:state.active === u ? state.turnSerial : -1};
      u.buffs.push(b); return b;
    }
    function buffMod(u, name, field) { var b = u.buffs.find(function (x) { return x.name === name && x.duration > 0; }); return b && b.mods[field] || 0; }
    function defense(u) { return u.baseDefense + buffMod(u, 'rampart', 'defense'); }
    function power(u) { return u.pa + buffMod(u, 'blessed', 'pa'); }
    function faceVector(face) { return {N:[0,-1], E:[1,0], S:[0,1], W:[-1,0]}[face] || [0,1]; }
    function relativeFacing(a, t) { var f = faceVector(t.face), dx = a.c - t.c, dy = a.r - t.r, dot = dx * f[0] + dy * f[1]; return dot > 0 ? 'FRONT' : dot < 0 ? 'BACK' : 'SIDE'; }
    function facingMult(d) { return d === 'BACK' ? 1.5 : d === 'SIDE' ? 1.25 : 1; }
    function facingHitBonus(d) { return d === 'BACK' ? 16 : d === 'SIDE' ? 8 : 0; }
    function preview(u, spec, t) {
      var adv = terrainAt(u.c, u.r).h - terrainAt(t.c, t.r).h, dir = relativeFacing(u, t), hit = spec.kind === 'magic' ? 92 : 78;
      hit += facingHitBonus(dir) + clamp(adv * 7, -18, 22) + buffMod(u, 'blessed', 'accuracy');
      if (spec.backOnly && dir !== 'BACK') hit = 20;
      hit = clamp(hit, 15, 98);
      var raw = spec.kind === 'magic' ? u.ma * spec.factor : power(u) * spec.factor;
      var height = spec.name === 'Aimed Shot' ? 1 + Math.max(0, adv) * .12 : 1 + adv * .03;
      return {hit:hit, damage:Math.max(1, Math.round(raw * height * facingMult(dir) - (spec.kind === 'physical' ? defense(t) : 0))), dir:dir, adv:adv};
    }
    function validTarget(u, spec, cc, rr) {
      if (!inside(cc, rr) || terrainAt(cc, rr).terrain === 'water') return false;
      var d = dist(u, {c:cc, r:rr}), min = spec.minRange == null ? 1 : spec.minRange, t = unitAt(cc, rr);
      if (d > spec.range || d < min) return false;
      if (spec.name === 'Rampart' || spec.kind === 'chakra') return cc === u.c && rr === u.r;
      if (spec.kind === 'terrain') return !t;
      if (spec.backOnly && (!t || relativeFacing(u, t) !== 'BACK')) return false;
      if (spec.kind === 'heal' || spec.kind === 'buff') return !!t && t.team === u.team;
      if (spec.kind === 'steal') return !!t && t.team !== u.team;
      if (spec.aoe) return true;
      return !!t && t.team !== u.team;
    }
    function actionTiles(u, spec) {
      if (spec.name === 'Rampart' || spec.name === 'Chakra') return [{c:u.c, r:u.r}];
      var cacheKey = u.id + '|' + spec.name + '|' + u.c + ',' + u.r + '|' + state.occupancyVersion;
      if (state.rangeCache.has(cacheKey)) return state.rangeCache.get(cacheKey);
      var out = [], min = spec.minRange == null ? 1 : spec.minRange, rr, cc;
      for (rr = 0; rr < N; rr++) for (cc = 0; cc < N; cc++) if (terrainAt(cc, rr).terrain !== 'water') {
        var d = dist(u, {c:cc, r:rr}); if (d <= spec.range && d >= min) out.push({c:cc, r:rr});
      }
      state.rangeCache.set(cacheKey, out); return out;
    }
    function hashTie(a, b, salt) {
      function h(value) { var n = (state.seed ^ salt) >>> 0, str = value.id || value; for (var i = 0; i < str.length; i++) n = Math.imul(n ^ str.charCodeAt(i), 16777619) >>> 0; return n >>> 0; }
      return h(a) - h(b);
    }
    function compareReady(a, b) { return b.ct - a.ct || hashTie(a, b, state.tieSalt) || String(a.id).localeCompare(String(b.id)); }
    function livingCount(team) { return state.units.filter(function (u) { return u.alive && (!team || u.team === team); }).length; }
    function queueForecast() {
      var sim = state.units.filter(function (u) { return u.alive; }).map(function (u) { return {id:u.id,ct:u.ct - (state.active && u === state.active ? 100 : 0),speed:u.speed}; }), ids = [], guard = 0;
      while (ids.length < 7 && guard++ < 600 && sim.length) {
        var ready = sim.filter(function (x) { return x.ct >= 100; });
        if (!ready.length) { var min = Math.min.apply(Math, sim.map(function (x) { return Math.max(0, 100 - x.ct); })); sim.forEach(function (x) { x.ct += min; }); ready = sim.filter(function (x) { return x.ct >= 100; }); }
        ready.sort(compareReady); ids.push(ready[0].id); ready[0].ct -= 100;
      }
      return ids;
    }
    function tickBuffs(u) { for (var i = u.buffs.length - 1; i >= 0; i--) { var b = u.buffs[i]; if (b.appliedOnTurn === state.turnSerial) { b.appliedOnTurn = -1; continue; } b.duration--; if (b.duration <= 0) u.buffs.splice(i, 1); } }
    function collectPickups(u) {
      state.pickups.forEach(function (p) {
        if (p.collected || p.c !== u.c || p.r !== u.r) return;
        p.collected = true;
        if (p.kind === 'heal') { var hp = Math.min(u.maxHp - u.hp, p.amount); u.hp += hp; emit('pickup', {unitId:u.id, kind:'heal', amount:hp, c:p.c, r:p.r}); }
        else { addBuff(u, 'blessed', 2, {pa:3, accuracy:8}); emit('pickup', {unitId:u.id, kind:'buff', amount:p.amount, c:p.c, r:p.r}); }
      });
    }
    function triggerHazard(u) {
      if (!u.alive) return;
      var tile = terrainAt(u.c, u.r), damage = 0;
      if (state.map.hazard === 'thorns' && tile.terrain === 'grass' && (u.c + u.r) % 3 === 0) damage = 4;
      if (state.map.hazard === 'collapse' && tile.h >= 3 && (state.round + u.c + u.r) % 4 === 0) damage = 6;
      if (state.map.hazard === 'void' && tile.terrain === 'water') damage = 10;
      if (state.map.hazard === 'core' && tile.h >= 3) damage = 5;
      var field = state.fields.find(function (f) { return f.c === u.c && f.r === u.r; });
      if (field) damage += 7;
      if (damage) { u.hp = Math.max(0, u.hp - damage); emit('hazard', {unitId:u.id, amount:damage, c:u.c, r:u.r}); if (u.hp <= 0) { u.alive = false; emit('ko', {unitId:u.id, cause:'hazard'}); } state.unitsRemaining = livingCount(); }
    }
    function finishTurn() {
      var u = state.active; if (!u) return;
      tickBuffs(u); u.ct = Math.max(0, u.ct - 100); u.acted = true; state.roundTurns++;
      var quota = Math.max(1, state.roundQuota || livingCount());
      if (state.roundTurns >= quota) { state.roundTurns = 0; state.round++; state.tempo.player = clamp(state.tempo.player + state.waystones.filter(function (w) { return state.units.some(function (x) { return x.alive && x.team === 'player' && dist(x, w) <= 1; }); }).length, 0, 6); state.tempo.enemy = clamp(state.tempo.enemy + state.waystones.filter(function (w) { return state.units.some(function (x) { return x.alive && x.team === 'enemy' && dist(x, w) <= 1; }); }).length, 0, 6); emit('round', {round:state.round}); spawnReinforcements(); }
      state.action = null; state.aim = null; state.origin = null; state.active = null; state.mode = 'clock'; checkEnd(); if (!state.ended) beginNextTurn();
    }
    function spawnReinforcements() {
      if (state.reinforcements) return;
      var wave = state.map.reinforcements.find(function (x) { return x.round === state.round; }); if (!wave) return;
      state.reinforcements = true;
      wave.units.forEach(function (e, i) { if (!unitAt(e.c, e.r)) state.units.push(createUnit('reinforce-' + state.round + '-' + i, 'enemy', e.job, e.name, e.c, e.r, 12)); });
      state.unitsRemaining = livingCount(); state.roundQuota = Math.max(state.roundQuota, state.units.length); invalidate(); emit('reinforcements', {count:wave.units.length});
    }
    function checkEnd() {
      var player = livingCount('player') > 0, enemy = livingCount('enemy') > 0;
      state.unitsRemaining = livingCount();
      if (!player || !enemy) { state.ended = true; state.winner = player ? 'player' : 'enemy'; state.mode = 'ended'; emit('battle-end', {winner:state.winner, rounds:state.round}); }
    }
    function beginNextTurn() {
      if (state.ended) return;
      state.active = null; state.mode = 'clock'; var guard = 0;
      while (!state.active && guard++ < 300) {
        var ready = state.units.filter(function (u) { return u.alive && u.ct >= 100; });
        if (!ready.length) { state.tick++; state.units.forEach(function (u) { if (u.alive) u.ct += u.speed; }); ready = state.units.filter(function (u) { return u.alive && u.ct >= 100; }); }
        if (ready.length) { ready.sort(compareReady); state.active = ready[0]; }
      }
      if (!state.active) { state.units.filter(function (u) { return u.alive; }).forEach(function (u) { u.ct += 20; }); return beginNextTurn(); }
      state.turnSerial++; state.selected = state.active; state.active.acted = false; state.active.moveUsed = false; state.origin = {c:state.active.c, r:state.active.r}; state.aim = null; state.aiClock = 0;
      if (state.active.pending) { resolvePending(state.active); return; }
      state.mode = state.active.team === 'enemy' ? 'ai' : 'move';
      emit('turn', {unitId:state.active.id, team:state.active.team});
    }
    function applyMove(u, path) {
      if (!path.length) { state.mode = 'action'; return; }
      u.moveUsed = true;
      var from = {c:u.c, r:u.r}; path.forEach(function (p) { u.c = p.c; u.r = p.r; });
      u.face = path.length ? (path[path.length - 1].c > from.c ? 'E' : path[path.length - 1].c < from.c ? 'W' : path[path.length - 1].r > from.r ? 'S' : 'N') : u.face;
      invalidate(); collectPickups(u); triggerHazard(u); emit('move', {unitId:u.id, from:from, path:path.slice()});
      if (!u.alive) { finishTurn(); return; }
      state.mode = 'action';
    }
    function selectMove(cc, rr) { if (state.mode !== 'move' || !state.active || state.active.team !== 'player') return false; var path = pathTo(state.active, cc, rr); if (!path.length && (cc !== state.active.c || rr !== state.active.r)) return false; applyMove(state.active, path); return true; }
    function undoMove() { if (!state.active || state.mode !== 'action' || !state.active.moveUsed || !state.origin) return false; state.active.c = state.origin.c; state.active.r = state.origin.r; state.active.moveUsed = false; state.active.face = 'S'; invalidate(); state.mode = 'move'; return true; }
    function beginAction(name) { if (!state.active || state.active.team !== 'player' || (state.mode !== 'move' && state.mode !== 'action')) return false; var spec = abilitySpec(state.active, name); if (!spec || state.active.mp < spec.cost) return false; state.action = spec; state.aim = null; state.mode = 'aim'; return true; }
    function resolveAbility(u, spec, cc, rr, targetId, fizzle) {
      var targets = [], t;
      if (fizzle) { emit('fizzle', {unitId:u.id, ability:spec.name, c:cc, r:rr}); return; }
      if (spec.name === 'Rampart') { addBuff(u, 'rampart', 2, {defense:3, taunt:true}); emit('buff', {unitId:u.id, ability:spec.name, c:u.c, r:u.r}); return; }
      if (spec.name === 'Chakra') { var hp = Math.min(u.maxHp - u.hp, 25), mp = Math.min(u.maxMp - u.mp, 8); u.hp += hp; u.mp += mp; emit('support', {unitId:u.id, ability:spec.name, hp:hp, mp:mp, c:u.c, r:u.r}); return; }
      t = targetId ? state.units.find(function (x) { return x.id === targetId && x.alive; }) : unitAt(cc, rr);
      if (spec.kind === 'heal' || spec.kind === 'buff') {
        if (!t || t.team !== u.team) return;
        if (spec.name === 'Heal') { var amount = Math.min(t.maxHp - t.hp, Math.round(u.ma * spec.factor)); t.hp += amount; emit('support', {unitId:u.id, targetId:t.id, ability:spec.name, amount:amount, c:t.c, r:t.r}); }
        else { addBuff(t, 'blessed', 2, {pa:3, accuracy:8}); t.ct += 25; emit('buff', {unitId:u.id, targetId:t.id, ability:spec.name, c:t.c, r:t.r}); }
        return;
      }
      if (spec.kind === 'terrain') { state.fields.push({id:'field-' + state.eventSerial, c:cc, r:rr, kind:'ember', turns:3}); emit('terrain', {unitId:u.id, ability:spec.name, c:cc, r:rr}); return; }
      if (spec.name === 'Steal Tempo') { if (t && t.team !== u.team) { t.ct = Math.max(0, t.ct - 35); state.tempo[u.team] = clamp(state.tempo[u.team] + 1, 0, 6); emit('support', {unitId:u.id, targetId:t.id, ability:spec.name, amount:35, c:t.c, r:t.r}); } return; }
      if (spec.aoe) state.units.forEach(function (x) { if (x.alive && x.team !== u.team && Math.abs(x.c - cc) <= 1 && Math.abs(x.r - rr) <= 1) targets.push(x); });
      else if (t && t.team !== u.team) targets.push(t);
      var outcomes = [];
      targets.forEach(function (target) {
        var pre = preview(u, spec, target), hit = combatRng() * 100 <= pre.hit, crit = pre.dir === 'BACK' || !!spec.backOnly;
        var damage = hit ? Math.max(1, Math.round(pre.damage * (.9 + combatRng() * .2))) : 0;
        outcomes.push({targetId:target.id, hit:hit, crit:crit, damage:damage, hitChance:pre.hit, direction:pre.dir});
        if (hit) {
          target.hp = Math.max(0, target.hp - damage); if (spec.name === 'Pin') target.ct = Math.max(0, target.ct - 40); if (spec.name === 'Frost Lance') target.ct = Math.max(0, target.ct - 35);
          if (spec.knock) { var dx = Math.sign(target.c - u.c), dy = Math.sign(target.r - u.r), nc = target.c + dx, nr = target.r + dy; if (inside(nc, nr) && !unitAt(nc, nr) && terrainAt(nc, nr).terrain !== 'water') { target.c = nc; target.r = nr; invalidate(); } }
          if (target.hp <= 0) { target.alive = false; emit('ko', {unitId:target.id, cause:spec.name}); }
        }
        u.face = target.c > u.c ? 'E' : target.c < u.c ? 'W' : target.r > u.r ? 'S' : 'N';
      });
      state.unitsRemaining = livingCount();
      emit('attack', {unitId:u.id, ability:spec.name, c:cc, r:rr, outcomes:outcomes}); checkEnd();
    }
    function resolvePending(u) {
      var pending = u.pending; if (!pending) return; u.pending = null; var spec = abilitySpec(u, pending.name), target = pending.targetId && state.units.find(function (x) { return x.id === pending.targetId; });
      if (target && (!target.alive || target.team === u.team || !validTarget(u, spec, target.c, target.r))) resolveAbility(u, spec, pending.c, pending.r, pending.targetId, true);
      else resolveAbility(u, spec, target ? target.c : pending.c, target ? target.r : pending.r, pending.targetId, false);
      if (!state.ended) finishTurn();
    }
    function confirmAction(cc, rr) {
      if (state.mode !== 'aim' || !state.active || !state.action) return false;
      var u = state.active, spec = state.action;
      if (!validTarget(u, spec, cc, rr)) return false;
      var target = unitAt(cc, rr);
      if (spec.charged) { u.mp -= spec.cost; u.pending = {name:spec.name, c:cc, r:rr, targetId:spec.aoe ? null : target && target.id, team:target && target.team}; emit('charge', {unitId:u.id, ability:spec.name, c:cc, r:rr}); state.action = null; state.mode = 'clock'; finishTurn(); return true; }
      if (spec.cost) u.mp -= spec.cost;
      resolveAbility(u, spec, cc, rr, target && target.id, false); state.action = null; if (!state.ended) finishTurn(); return true;
    }
    function cancelAction() { if (state.mode !== 'aim') return false; state.action = null; state.aim = null; state.mode = state.active && state.active.moveUsed ? 'action' : 'move'; return true; }
    function endTurn() { if (!state.active || state.active.team !== 'player' || (state.mode !== 'move' && state.mode !== 'action')) return false; finishTurn(); return true; }
    function spendTempo(name) { var u = state.active, cost = name === 'Surge' ? 2 : 3; if (!u || state.tempo[u.team] < cost) return false; state.tempo[u.team] -= cost; if (name === 'Surge') { u.ct += 60; emit('tempo', {unitId:u.id, ability:name, amount:60}); } else { state.units.filter(function (a) { return a.alive && a.team === u.team && a !== u && dist(a, u) === 1; }).forEach(function (a) { var amount = Math.min(a.maxHp - a.hp, 18); a.hp += amount; emit('support', {unitId:u.id, targetId:a.id, ability:name, amount:amount, c:a.c, r:a.r}); }); } finishTurn(); return true; }
    function bestTarget(u) { var enemies = state.units.filter(function (t) { return t.alive && t.team !== u.team; }), taunt = enemies.filter(function (t) { return hasBuff(t, 'rampart'); }); if (taunt.length) enemies = taunt; enemies.sort(function (a, b) { return a.hp / a.maxHp - b.hp / b.maxHp || dist(u, a) - dist(u, b) || hashTie(a, b, 17); }); return enemies[0]; }
    function aiMove(u, target) {
      if (u.moveUsed) { finishTurn(); return; }
      var map = reachable(u), current = dist(u, target), best = null;
      map.forEach(function (entry) { if (entry.d === 0 || dist(entry, target) >= current) return; var score = dist(entry, target) - (terrainAt(entry.c, entry.r).h > terrainAt(target.c, target.r).h ? .3 : 0); if (!best || score < best.score || score === best.score && (entry.d > best.d || entry.d === best.d && hashTie({id:key(entry.c, entry.r)}, {id:key(best.c, best.r)}, 31) < 0)) best = Object.assign({}, entry, {score:score}); });
      if (best) { applyMove(u, best.path); if (u.team === 'enemy' && !state.ended) aiAct(u, target); } else finishTurn();
    }
    function aiAct(u, target) {
      if (!u.alive || state.ended) return;
      var job = JOBS[u.job] || JOBS.Knight, spec = null, chosen = null;
      var wounded = state.units.filter(function (a) { return a.alive && a.team === u.team && a.hp < a.maxHp * .68; }).sort(function (a, b) { return a.hp / a.maxHp - b.hp / b.maxHp || hashTie(a, b, 41); })[0];
      if (job.role === 'healer' && wounded) { var heal = abilitySpec(u, 'Heal'); if (u.mp >= heal.cost && validTarget(u, heal, wounded.c, wounded.r)) { spec = heal; chosen = wounded; } }
      if (!spec && job.role === 'mage' && u.mp >= 16) { var fire = abilitySpec(u, 'Fireball'), near = state.units.filter(function (a) { return a.alive && a.team !== u.team && dist(u, a) <= fire.range; }); var cluster = near.find(function (a) { return near.filter(function (b) { return Math.abs(b.c - a.c) <= 1 && Math.abs(b.r - a.r) <= 1; }).length >= 2; }); if (cluster && validTarget(u, fire, cluster.c, cluster.r)) { spec = fire; chosen = cluster; } }
      if (!spec && target) { var names = job.abilities.slice().reverse().concat(['Attack']); for (var i = 0; i < names.length; i++) { var candidate = abilitySpec(u, names[i]); if (u.mp >= candidate.cost && validTarget(u, candidate, target.c, target.r)) { spec = candidate; chosen = target; break; } } }
      if (spec && chosen) { if (spec.charged) { u.mp -= spec.cost; u.pending = {name:spec.name, c:chosen.c, r:chosen.r, targetId:spec.aoe ? null : chosen.id}; emit('charge', {unitId:u.id, ability:spec.name, c:chosen.c, r:chosen.r}); finishTurn(); } else { if (spec.cost) u.mp -= spec.cost; resolveAbility(u, spec, chosen.c, chosen.r, chosen.id, false); if (!state.ended) finishTurn(); } return; }
      if (target) aiMove(u, target); else finishTurn();
    }
    function runAI(u) { if (!u || u !== state.active || state.mode !== 'ai') return; var target = bestTarget(u); if (!target) { checkEnd(); return; } var attack = abilitySpec(u, 'Attack'); if (validTarget(u, attack, target.c, target.r)) aiAct(u, target); else aiMove(u, target); }
    function step(dt) {
      if (state.ended) return;
      if (state.mode === 'ai') { state.aiClock += Math.max(0, dt); if (state.aiClock >= 260) { state.aiClock = 0; runAI(state.active); } }
      state.fields.forEach(function (field) { field.turns -= dt / 10000; });
      state.fields = state.fields.filter(function (field) { return field.turns > 0; });
    }
    function drainEvents() { var copy = state.events.slice(); state.events.length = 0; return copy; }
    function start() { beginNextTurn(); emit('battle-start', {skirmish:state.skirmish, mapId:state.mapId}); return state; }

    return {state:state, start:start, step:step, drainEvents:drainEvents, queueForecast:queueForecast, reachable:reachable, actionTiles:actionTiles, abilitySpec:abilitySpec, validTarget:validTarget, preview:preview, selectMove:selectMove, undoMove:undoMove, beginAction:beginAction, confirmAction:confirmAction, cancelAction:cancelAction, endTurn:endTurn, spendTempo:spendTempo, unitAt:unitAt, key:key, maps:MAPS, jobs:JOBS};
  }

  function runAuto(seed, skirmish) {
    var sim = createSimulation(seed, skirmish); sim.start(); var signature = [], guard = 0;
    while (!sim.state.ended && guard++ < 24000) {
      var s = sim.state, u = s.active;
      if (s.mode === 'ai') sim.step(260);
      else if (u && u.team === 'player' && s.mode === 'move') {
        var autoTarget = s.units.filter(function (x) { return x.alive && x.team !== u.team; }).sort(function (a, b) { return dist(u, a) - dist(u, b) || String(a.id).localeCompare(String(b.id)); })[0];
        var autoBest = {c:u.c, r:u.r, score:autoTarget ? dist(u, autoTarget) : 0};
        sim.reachable(u).forEach(function (entry) { if (autoTarget && dist(entry, autoTarget) < autoBest.score) autoBest = {c:entry.c, r:entry.r, score:dist(entry, autoTarget)}; });
        sim.selectMove(autoBest.c, autoBest.r);
      }
      else if (u && u.team === 'player' && s.mode === 'action') {
        var attack = sim.abilitySpec(u, 'Attack'), target = s.units.find(function (x) { return x.alive && x.team !== u.team && sim.validTarget(u, attack, x.c, x.r); });
        if (target) { sim.beginAction('Attack'); sim.confirmAction(target.c, target.r); } else sim.endTurn();
      } else if (s.mode === 'aim') sim.cancelAction();
      else sim.step(16.6667);
      sim.drainEvents().forEach(function (e) { if (e.type === 'attack' || e.type === 'ko' || e.type === 'battle-end' || e.type === 'reinforcements') signature.push([e.type, e.unitId || '', e.ability || '', e.winner || '', e.round || 0, e.outcomes ? e.outcomes.map(function (o) { return [o.targetId,o.hit,o.crit,o.damage]; }) : '']); });
    }
    if (!sim.state.ended) signature.push(['timeout', '', '', '', sim.state.round, '']);
    return {winner:sim.state.winner || 'timeout', rounds:sim.state.round, signature:signature};
  }
  function regression(seed, skirmish) { var a = runAuto(seed, skirmish || 1), b = runAuto(seed, skirmish || 1); return {same:JSON.stringify(a) === JSON.stringify(b), first:a, second:b}; }

  return {N:N, JOBS:JOBS, MAPS:MAPS, create:createSimulation, regression:regression};
}));
