/* Willowmere - game: state, loop, interaction, UI */
'use strict';

var cv = document.getElementById('cv');
var g = cv.getContext('2d', { alpha: false });
var startOv = document.getElementById('start');
var rotOv = document.getElementById('rot');

var DAYLEN = 240;          // seconds of daylight per in-game day
var PR = 9;                // player radius
var SPD = 122;             // walk speed
var started = false, paused = false, rotated = false;
var mode = 'play';         // play | fish | dialog | gift | craft | bag | menu | decorate | ending
var cam = { x: 0, y: 0 };
var shake = 0, flash = 0;
var toastT = 0, toastMsg = '';
var drag = null, dragPid = null;
var st = null, npcPos = [], dlg = null, fs = null, craftMsg = '', craftMsgT = 0;
var confirmNew = false, selFurn = -1, trayPage = 0;

/* ================= state ================= */
function blankState() {
  var n = {};
  for (var i = 0; i < NPCS.length; i++) n[NPCS[i].id] = { p: 0, s1: false, s2: false, gd: 0, td: 0 };
  return {
    day: 1, tod: 0.02, season: 0, night: false, clock: 0,
    scene: 'world', px: 392, py: 580, fx: 0, fy: 1, anim: 0,
    inv: {}, owned: {}, placed: [],
    style: { wall: 0, floor: 0, uw: [0], uf: [0] },
    npc: n, harvested: {}, festival: false, endShown: false,
    stats: { fish: 0, crafted: 0, gifts: 0 }
  };
}
function serialize() {
  return {
    v: 1, day: st.day, tod: st.tod, scene: st.scene, px: st.px, py: st.py,
    inv: st.inv, owned: st.owned, placed: st.placed, style: st.style,
    npc: st.npc, harvested: st.harvested, festival: st.festival, endShown: st.endShown, stats: st.stats
  };
}
function deserialize(o) {
  var s = blankState();
  if (!o) return s;
  s.day = clamp(int(o.day, 1), 1, 9999);
  s.tod = clamp(num(o.tod, 0.02), 0, 0.999);
  s.scene = (o.scene === 'interior') ? 'interior' : 'world';
  s.px = clamp(num(o.px, 392), 20, MW - 20);
  s.py = clamp(num(o.py, 580), 20, MH - 20);
  if (s.scene === 'interior') { s.px = clamp(num(o.px, 195), ROOM.x + 12, ROOM.x + ROOM.w - 12); s.py = clamp(num(o.py, 560), ROOM.y + 12, ROOM.y + ROOM.h - 12); }
  var inv = obj(o.inv), k;
  for (k in inv) if (ITEMS[k]) s.inv[k] = clamp(int(inv[k], 0), 0, 999);
  var ow = obj(o.owned);
  for (k in ow) if (furnById(k)) s.owned[k] = clamp(int(ow[k], 0), 0, 6);
  var pl = arr(o.placed);
  for (var i = 0; i < pl.length && s.placed.length < 40; i++) {
    var p = obj(pl[i]); var f = furnById(str(p.id, ''));
    if (!f) continue;
    s.placed.push({ id: f.id, x: clamp(num(p.x, 195), ROOM.x, ROOM.x + ROOM.w), y: clamp(num(p.y, 400), ROOM.y, ROOM.y + ROOM.h) });
  }
  var sy = obj(o.style);
  s.style.uw = [0]; s.style.uf = [0];
  var uw = arr(sy.uw); for (var a = 0; a < uw.length; a++) { var v = int(uw[a], -1); if (v >= 0 && v < STYLES.wall.length && s.style.uw.indexOf(v) < 0) s.style.uw.push(v); }
  var uf = arr(sy.uf); for (var b2 = 0; b2 < uf.length; b2++) { var v2 = int(uf[b2], -1); if (v2 >= 0 && v2 < STYLES.floor.length && s.style.uf.indexOf(v2) < 0) s.style.uf.push(v2); }
  s.style.wall = s.style.uw.indexOf(int(sy.wall, 0)) >= 0 ? int(sy.wall, 0) : 0;
  s.style.floor = s.style.uf.indexOf(int(sy.floor, 0)) >= 0 ? int(sy.floor, 0) : 0;
  var np = obj(o.npc);
  for (var j = 0; j < NPCS.length; j++) {
    var id = NPCS[j].id, src = obj(np[id]);
    s.npc[id] = { p: clamp(int(src.p, 0), 0, 30), s1: bool(src.s1), s2: bool(src.s2), gd: int(src.gd, 0), td: int(src.td, 0) };
  }
  var hv = obj(o.harvested);
  for (var h in hv) { var idx = int(h, -1); var d = int(hv[h], 0); if (idx >= 0 && idx < NODES.length && d >= s.day - 1) s.harvested[idx] = d; }
  s.festival = bool(o.festival); s.endShown = bool(o.endShown);
  var stt = obj(o.stats);
  s.stats = { fish: clamp(int(stt.fish, 0), 0, 99999), crafted: clamp(int(stt.crafted, 0), 0, 99999), gifts: clamp(int(stt.gifts, 0), 0, 99999) };
  return s;
}
function save() { Store.write(serialize()); }

function newGame() {
  Timers.clearAll(); Input.reset(); Parts.clear();
  Store.wipe();
  st = blankState();
  mode = 'play'; dlg = null; fs = null; drag = null; dragPid = null;
  selFurn = -1; trayPage = 0; confirmNew = false; shake = 0; flash = 0;
  toastT = 0; craftMsgT = 0;
  target = null; path.length = 0; stuckT = 0; repaths = 0;
  refreshTime(); snapNpcs(); centerCam();
  toast('A new season begins in Willowmere.');
  save();
}

/* ================= time ================= */
function refreshTime() {
  st.season = (Math.floor((st.day - 1) / 5) % 2);
  var h = 6 + st.tod * 18;
  st.night = (h >= 19);
}
function hourStr() {
  var h = 6 + st.tod * 18, hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 5) * 5;
  var ap = hh >= 12 && hh < 24 ? 'pm' : 'am';
  var d = hh % 12; if (d === 0) d = 12;
  if (hh >= 24) { d = 12; ap = 'am'; }
  return d + ':' + (mm < 10 ? '0' : '') + mm + ap;
}
function advanceDay(slept) {
  st.day++; st.tod = 0.02;
  for (var k in st.harvested) { if (st.harvested[k] < st.day - 1) delete st.harvested[k]; }
  refreshTime(); snapNpcs();
  if (st.scene !== 'interior') { st.scene = 'interior'; }
  st.px = BED.x + BED.w / 2; st.py = BED.y + BED.h + 26;
  target = null; path.length = 0; Parts.clear();
  toast((slept ? 'Day ' : 'You drifted off. Day ') + st.day + ' - ' + (st.season ? 'Autumn' : 'Summer'));
  Snd.tone(330, 0.3, 'sine', 0.12, 440);
  save();
}

/* ================= npcs ================= */
function slotIndex() { var h = 6 + st.tod * 18; return h < 11 ? 0 : (h < 16 ? 1 : (h < 20 ? 2 : 3)); }
function snapNpcs() {
  npcPos.length = 0;
  var si = slotIndex();
  for (var i = 0; i < NPCS.length; i++) npcPos.push({ x: NPCS[i].spots[si][0], y: NPCS[i].spots[si][1], t: 0 });
}
function updateNpcs(dt) {
  var si = slotIndex();
  for (var i = 0; i < NPCS.length; i++) {
    var p = npcPos[i], s = NPCS[i].spots[si];
    var dx = s[0] - p.x, dy = s[1] - p.y, d = Math.hypot(dx, dy);
    if (d > 2) { var sp = Math.min(52 * dt, d); p.x += dx / d * sp; p.y += dy / d * sp; p.t += dt * 6; }
    else p.t += dt * 1.2;
  }
}
function hearts(id) { return clamp(Math.floor(st.npc[id].p / 6), 0, 5); }
function storiesDone() { var c = 0; for (var i = 0; i < NPCS.length; i++) if (st.npc[NPCS[i].id].s2) c++; return c; }

/* ================= inventory ================= */
function addItem(id, n) {
  if (!ITEMS[id]) return;
  st.inv[id] = clamp((st.inv[id] || 0) + n, 0, 999);
}
function hasItems(r) { for (var k in r) if ((st.inv[k] || 0) < r[k]) return false; return true; }
function invList() {
  var out = [];
  for (var k in ITEMS) if ((st.inv[k] || 0) > 0) out.push(k);
  return out;
}
function placedCount(id) { var c = 0; for (var i = 0; i < st.placed.length; i++) if (st.placed[i].id === id) c++; return c; }
function availCount(id) { return (st.owned[id] || 0) - placedCount(id); }

function toast(m) { toastMsg = m; toastT = 3.2; }

/* ================= interactables ================= */
var target = null;   // {x,y,act}
function worldInteractables() {
  var list = [];
  list.push({ t: 'fish', x: DOCK.x + DOCK.w / 2, y: DOCK.y + 16, r: 46, label: 'Cast a line' });
  list.push({ t: 'door', x: COTTAGE.door[0], y: COTTAGE.door[1], r: 30, label: 'Go inside' });
  for (var i = 0; i < NODES.length; i++) {
    if (st.harvested[i] === st.day) continue;
    list.push({ t: 'node', i: i, x: NODES[i].x, y: NODES[i].y, r: 30, label: 'Gather ' + NODEINFO[NODES[i].k].n });
  }
  for (var j = 0; j < NPCS.length; j++) list.push({ t: 'npc', i: j, x: npcPos[j].x, y: npcPos[j].y, r: 32, label: 'Talk to ' + NPCS[j].n.split(' ')[0] });
  return list;
}
function interiorInteractables() {
  return [
    { t: 'bench', x: BENCH.x + BENCH.w / 2, y: BENCH.y + BENCH.h + 6, r: 40, label: 'Craft' },
    { t: 'bed', x: BED.x + BED.w / 2, y: BED.y + BED.h + 6, r: 40, label: 'Sleep' },
    { t: 'exit', x: IDOOR.x + IDOOR.w / 2, y: IDOOR.y - 6, r: 34, label: 'Go outside' }
  ];
}
function interactables() { return st.scene === 'world' ? worldInteractables() : interiorInteractables(); }
function nearest(x, y, maxd) {
  var l = interactables(), best = null, bd = maxd * maxd;
  for (var i = 0; i < l.length; i++) {
    var d = dist2(x, y, l[i].x, l[i].y);
    if (d < bd) { bd = d; best = l[i]; }
  }
  return best;
}

function doInteract(o) {
  if (!o) return;
  if (o.t === 'fish') startFishing();
  else if (o.t === 'door') { st.scene = 'interior'; st.px = IDOOR.x + IDOOR.w / 2; st.py = IDOOR.y - 24; target = null; path.length = 0; Snd.tap(); save(); }
  else if (o.t === 'exit') { st.scene = 'world'; st.px = COTTAGE.door[0]; st.py = COTTAGE.door[1] + 26; target = null; path.length = 0; Snd.tap(); save(); }
  else if (o.t === 'node') harvest(o.i);
  else if (o.t === 'npc') openNpc(o.i);
  else if (o.t === 'bench') { mode = 'craft'; Snd.page(); }
  else if (o.t === 'bed') {
    dlg = { name: 'Rest', col: '#9fc4d8', lines: ['Sleep until morning? The lake will still be here.'], idx: 0, npcI: -1, kind: 'sleep' };
    mode = 'dialog';
  }
}

function harvest(i) {
  if (st.harvested[i] === st.day) return;
  st.harvested[i] = st.day;
  var y = nodeYield(NODES[i].k, st.season, st.night), got = [];
  for (var j = 0; j < y.length; j++) { addItem(y[j][0], y[j][1]); got.push(y[j][1] + ' ' + ITEMS[y[j][0]].n); }
  toast('Gathered ' + got.join(', '));
  Parts.burst(NODES[i].x, NODES[i].y - 6, 12, NODEINFO[NODES[i].k].c, 90, 0.6, 120);
  Snd.pickup(); shake = Math.max(shake, 2.2);
  save();
}

/* ================= npc dialog ================= */
function openNpc(i) {
  var d = NPCS[i], s = st.npc[d.id], hp = hearts(d.id);
  if (hp >= 2 && !s.s1) { startStory(i, 1); return; }
  if (hp >= 4 && s.s1 && !s.s2) { startStory(i, 2); return; }
  var line = d.greet[hp >= 4 ? 2 : (hp >= 2 ? 1 : 0)];
  if (s.td !== st.day) { s.p = clamp(s.p + 1, 0, 30); s.td = st.day; checkHeartUp(d, hp); }
  dlg = { name: d.n, col: d.c, lines: [line], idx: 0, npcI: i, kind: 'talk' };
  mode = 'dialog'; Snd.page();
}
function startStory(i, which) {
  var d = NPCS[i];
  var lines = [], src = which === 1 ? d.s1 : d.s2;
  for (var k = 0; k < src.length; k++) lines.push((src[k].w === 'You' ? '▸ ' : '') + src[k].t);
  dlg = { name: d.n + ' - Story ' + which, col: d.c, lines: lines, idx: 0, npcI: i, kind: 'story', which: which, speakers: src };
  mode = 'dialog'; Snd.heart();
}
function finishStory(i, which) {
  var d = NPCS[i], s = st.npc[d.id];
  if (which === 1) { s.s1 = true; toast('Story unlocked: ' + d.n.split(' ')[0]); }
  else {
    s.s2 = true;
    var rw = d.rw;
    if (rw.t === 'furn') {
      st.owned[rw.id] = clamp((st.owned[rw.id] || 0) + 1, 0, 6);
      toast('Gift received: ' + furnById(rw.id).n + ' (free, always)');
    } else {
      var listk = rw.k === 'wall' ? 'uw' : 'uf';
      var arrk = rw.k === 'wall' ? STYLES.wall : STYLES.floor;
      var idx = 0; for (var z = 0; z < arrk.length; z++) if (arrk[z].id === rw.id) idx = z;
      if (st.style[listk].indexOf(idx) < 0) st.style[listk].push(idx);
      toast('Style unlocked: ' + arrk[idx].n);
    }
    Snd.catchFx(); flash = 0.5;
    if (storiesDone() >= NPCS.length && !st.festival) {
      st.festival = true;
      Timers.set(function () { mode = 'ending'; Snd.fanfare(); for (var c = 0; c < 24; c++) Parts.add(rnd(0, VW), rnd(-60, 0), rnd(-30, 30), rnd(40, 110), rnd(2, 4), pick(['#ffd77a', '#ff9ab0', '#9fe0c0', '#a8c0ff']), rnd(3, 5), 30, 1); }, 400);
    }
  }
  save();
}
function advanceDialog() {
  if (!dlg) { mode = 'play'; return; }
  if (dlg.kind === 'sleep') return;   // handled by buttons
  dlg.idx++;
  Snd.page();
  if (dlg.idx >= dlg.lines.length) {
    if (dlg.kind === 'story') { finishStory(dlg.npcI, dlg.which); dlg = null; mode = 'play'; return; }
    if (dlg.kind === 'talk') return;  // buttons stay
    dlg = null; mode = 'play';
  }
}
function giveGift(item) {
  var i = dlg.npcI, d = NPCS[i], s = st.npc[d.id];
  if ((st.inv[item] || 0) <= 0) return;
  st.inv[item]--; if (st.inv[item] <= 0) delete st.inv[item];
  var hp = hearts(d.id), nm = ITEMS[item].n, line, pts;
  if (item === d.loves) { pts = 5; line = 'Oh - ' + nm + '! You remembered. That makes the whole day lighter.'; }
  else if (item === d.likes) { pts = 3; line = 'Good ' + nm + '. That will come in handy, thank you.'; }
  else if (item === d.hates) { pts = -2; line = "Ah... I'll be honest, " + nm + " and I have history. Bad history."; }
  else { pts = 1; line = 'Thank you. I will find a use for ' + nm + '.'; }
  s.p = clamp(s.p + pts, 0, 30); s.gd = st.day; st.stats.gifts++;
  var lines = [line];
  var nh = hearts(d.id);
  if (nh > hp) { lines.push('(' + d.n.split(' ')[0] + ' warms to you - ' + nh + ' heart' + (nh > 1 ? 's' : '') + ')'); }
  if (nh >= 2 && !s.s1) lines.push('(Talk again - they have something to tell you.)');
  else if (nh >= 4 && s.s1 && !s.s2) lines.push('(Talk again - their story continues.)');
  dlg = { name: d.n, col: d.c, lines: lines, idx: 0, npcI: i, kind: 'gifted' };
  mode = 'dialog';
  if (pts >= 3) {
    Snd.heart();
    for (var k = 0; k < 8; k++) Parts.add(npcPos[i].x + rnd(-8, 8), npcPos[i].y - 16, rnd(-16, 16), rnd(-40, -18), rnd(0.6, 1.1), '#ff8fa8', rnd(2.5, 4), -10);
  } else if (pts < 0) Snd.bad(); else Snd.pickup();
  save();
}
function checkHeartUp(d, before) {
  if (hearts(d.id) > before) { Snd.heart(); toast(d.n.split(' ')[0] + ' warms to you.'); }
}

/* ================= crafting ================= */
function craft(rec) {
  if ((st.owned[rec.id] || 0) >= 3) { craftMsg = 'You already have plenty of those.'; craftMsgT = 2; Snd.bad(); return; }
  if (!hasItems(rec.r)) { craftMsg = 'Not enough materials.'; craftMsgT = 2; Snd.bad(); return; }
  for (var k in rec.r) { st.inv[k] -= rec.r[k]; if (st.inv[k] <= 0) delete st.inv[k]; }
  st.owned[rec.id] = (st.owned[rec.id] || 0) + 1;
  st.stats.crafted++;
  craftMsg = 'Crafted ' + rec.n + '!'; craftMsgT = 2.2;
  Snd.craft(); flash = 0.25; shake = 3;
  Parts.burst(VW / 2, 120, 14, '#ffd77a', 130, 0.7, 90);
  save();
}

/* ================= fishing ================= */
function startFishing() {
  var pool = fishPool(st.season, st.night);
  var id = pick(pool), f = FISH[id];
  fs = { ph: 'cast', t: 0, id: id, f: f, pos: 0, dir: 1, zc: 0.5, hits: 0, need: f.hits, miss: 0, res: '', wait: rnd(1.1, 3.0) };
  mode = 'fish'; target = null; path.length = 0;
  Snd.tone(420, 0.14, 'sine', 0.12, 620);
}
function fishAction() {
  if (!fs) return;
  if (fs.ph === 'cast') return;
  if (fs.ph === 'wait') { fs.ph = 'done'; fs.res = 'You reeled in too early.'; fs.t = 0; Snd.bad(); return; }
  if (fs.ph === 'bite') { fs.ph = 'reel'; fs.t = 0; fs.pos = 0; fs.dir = 1; fs.zc = rnd(0.25, 0.75); Snd.bite(); return; }
  if (fs.ph === 'reel') {
    if (Math.abs(fs.pos - fs.zc) < fs.f.zone / 2) {
      fs.hits++; Snd.hit(fs.hits); shake = Math.max(shake, 3);
      Parts.burst(VW / 2, 470, 10, '#8fe0c0', 120, 0.5, 60);
      if (fs.hits >= fs.need) { fs.ph = 'done'; fs.t = 0; fs.res = 'caught'; land(); }
      else { fs.zc = rnd(0.18, 0.82); }
    } else {
      fs.miss++; Snd.bad(); shake = Math.max(shake, 4);
      if (fs.miss >= 3) { fs.ph = 'done'; fs.t = 0; fs.res = 'The line went slack. It slipped away.'; }
    }
  }
  if (fs.ph === 'done' && fs.res && fs.t > 0.6) closeFishing();
}
function land() {
  addItem(fs.id, 1); st.stats.fish++;
  Snd.catchFx(); flash = 0.4; shake = 6;
  Parts.burst(VW / 2, 400, 22, ITEMS[fs.id].c, 200, 1.0, 200);
  save();
}
function closeFishing() { fs = null; mode = 'play'; }
function updateFishing(dt) {
  if (!fs) return;
  fs.t += dt;
  if (fs.ph === 'cast') { if (fs.t > 0.5) { fs.ph = 'wait'; fs.t = 0; } }
  else if (fs.ph === 'wait') { if (fs.t > fs.wait) { fs.ph = 'bite'; fs.t = 0; Snd.bite(); shake = 3; } }
  else if (fs.ph === 'bite') { if (fs.t > 0.95) { fs.ph = 'done'; fs.t = 0; fs.res = 'Missed the bite.'; Snd.bad(); } }
  else if (fs.ph === 'reel') {
    fs.pos += fs.dir * fs.f.spd * dt;
    if (fs.pos > 1) { fs.pos = 1; fs.dir = -1; }
    if (fs.pos < 0) { fs.pos = 0; fs.dir = 1; }
  } else if (fs.ph === 'done') { if (fs.t > 2.0) closeFishing(); }
}

/* ================= movement ================= */
var stuckT = 0, repaths = 0, path = [], navW = null, navI = null;
function navFor() { return st.scene === 'world' ? navW : navI; }
function solidFor() { return st.scene === 'world' ? blocked : insideBlocked; }
function setWalk(tx, ty, act) {
  var p = navPath(navFor(), st.px, st.py, tx, ty, PR + 1);
  if (!p || !p.length) { path = []; target = null; toast('No way through from here.'); return false; }
  path = p; target = { x: tx, y: ty, act: act || null }; stuckT = 0;
  return true;
}
function moveWorld(dt) {
  var kx = 0, ky = 0, K = Input.keys;
  if (K['a'] || K['arrowleft']) kx -= 1;
  if (K['d'] || K['arrowright']) kx += 1;
  if (K['w'] || K['arrowup']) ky -= 1;
  if (K['s'] || K['arrowdown']) ky += 1;
  var vx = 0, vy = 0, moved = false;
  var solid = st.scene === 'world' ? blocked : insideBlocked;
  if (kx || ky) {
    target = null; path.length = 0; stuckT = 0;
    var m = Math.hypot(kx, ky) || 1; vx = kx / m * SPD; vy = ky / m * SPD;
    var nx = st.px + vx * dt;
    if (!solid(nx, st.py, PR)) { st.px = nx; moved = true; }
    var ny = st.py + vy * dt;
    if (!solid(st.px, ny, PR)) { st.py = ny; moved = true; }
  } else if (target) {
    var dx = target.x - st.px, dy = target.y - st.py, d = Math.hypot(dx, dy);
    var stopd = target.act ? Math.max(20, target.act.r * 0.7) : 6;
    if (d <= stopd) {
      var a = target.act; target = null; path.length = 0; stuckT = 0;
      if (a) doInteract(a);
    } else {
      while (path.length > 1 && dist2(st.px, st.py, path[0].x, path[0].y) < 100) path.shift();
      var aim = path.length ? path[0] : target;
      var adx = aim.x - st.px, ady = aim.y - st.py, ad = Math.hypot(adx, ady);
      if (ad < 6 && path.length) { path.shift(); ad = 0; }
      if (ad > 0.001) {
        vx = adx / ad * SPD; vy = ady / ad * SPD;
        var ax = st.px + vx * dt;
        if (!solid(ax, st.py, PR)) { st.px = ax; moved = true; }
        var ay = st.py + vy * dt;
        if (!solid(st.px, ay, PR)) { st.py = ay; moved = true; }
      }
      if (moved) { stuckT = 0; repaths = 0; }
      else {
        stuckT += dt;
        if (stuckT > 0.35) {
          stuckT = 0;
          if (++repaths > 4) { repaths = 0; target = null; path.length = 0; toast('No way through from here.'); }
          else if (!setWalk(target.x, target.y, target.act)) { path.length = 0; }
        }
      }
    }
  }
  if (moved) {
    st.fx = vx; st.fy = vy; st.anim += dt * 9;
    if (Math.floor(st.anim) % 4 === 0 && Math.random() < 0.06) Snd.step();
  } else st.anim = 0;
}
function centerCam() {
  cam.x = clamp(st.px - VW / 2, 0, MW - VW);
  cam.y = clamp(st.py - VH / 2, 0, MH - VH);
}

/* ================= loop ================= */
var last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  var dt = (ts - last) / 1000; last = ts;
  if (!isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.05);
  if (started && !paused && !document.hidden) update(dt);
  render();
}
function update(dt) {
  st.clock += dt;
  if (toastT > 0) toastT -= dt;
  if (craftMsgT > 0) craftMsgT -= dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 14);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
  Parts.update(dt);
  if (mode === 'play' || mode === 'decorate') {
    st.tod += dt / DAYLEN;
    if (st.tod >= 1) { advanceDay(false); mode = 'play'; }
    refreshTime();
    if (mode === 'play') { moveWorld(dt); if (st.scene === 'world') updateNpcs(dt); }
  } else if (mode === 'fish') {
    st.tod += dt / DAYLEN; if (st.tod >= 1) st.tod = 0.999;
    refreshTime(); updateFishing(dt);
  }
  centerCam();
}

/* ================= buttons ================= */
function B(id, x, y, w, h, label, style) { return { id: id, x: x, y: y, w: w, h: h, l: label, s: style || 0 }; }
function buttons() {
  var b = [];
  if (mode === 'ending') { b.push(B('endok', 95, 596, 200, 56, 'Keep Playing', 1)); return b; }
  if (mode === 'menu') {
    b.push(B('snd', 55, 250, 280, 56, Snd.on ? 'Sound: On' : 'Sound: Off'));
    b.push(B('newg', 55, 320, 280, 56, confirmNew ? 'Tap again to confirm' : 'New Game', confirmNew ? 2 : 0));
    b.push(B('close', 55, 420, 280, 56, 'Back', 1));
    return b;
  }
  if (mode === 'fish') { b.push(B('act', 312, 610, 66, 66, fs && fs.ph === 'reel' ? 'Hook' : 'Reel', 1)); return b; }
  if (mode === 'craft') { b.push(B('close', 271, 96, 56, 52, 'X')); return b; }
  if (mode === 'bag') { b.push(B('close', 271, 96, 56, 52, 'X')); return b; }
  if (mode === 'gift') { b.push(B('close', 271, 116, 56, 52, 'X')); return b; }
  if (mode === 'dialog' && dlg) {
    if (dlg.kind === 'sleep') {
      b.push(B('sleepy', 30, 606, 160, 54, 'Sleep', 1));
      b.push(B('sleepn', 200, 606, 160, 54, 'Not yet'));
    } else if (dlg.kind === 'talk' && dlg.idx >= dlg.lines.length - 1) {
      var d = NPCS[dlg.npcI];
      var can = st.npc[d.id].gd !== st.day && invList().length > 0;
      b.push(B('gift', 30, 606, 160, 54, can ? 'Give Gift' : 'Gifted today', can ? 1 : 3));
      b.push(B('bye', 200, 606, 160, 54, 'Goodbye'));
    }
    return b;
  }
  if (mode === 'decorate') {
    b.push(B('decdone', 246, 8, 132, 48, 'Done', 1));
    var uw = st.style.uw.length > 1, uf = st.style.uf.length > 1;
    if (uw) b.push(B('wallsty', 12, 8, 104, 48, 'Walls'));
    if (uf) b.push(B('floorsty', 124, 8, 104, 48, 'Floor'));
    if (selFurn >= 0) b.push(B('remove', 12, 470, 120, 50, 'Put Away', 2));
    if (trayItems().length > 6) {
      b.push(B('trayl', 2, 606, 44, 84, '<'));
      b.push(B('trayr', 344, 606, 44, 84, '>'));
    }
    return b;
  }
  // play
  b.push(B('menu', 334, 4, 52, 48, '≡'));
  b.push(B('bag', 12, 616, 60, 60, 'Bag'));
  b.push(B('act', 312, 610, 66, 66, 'Use', 1));
  if (st.scene === 'interior') b.push(B('dec', 138, 620, 116, 52, 'Decorate'));
  return b;
}
function hitBtn(x, y) {
  var b = buttons();
  for (var i = b.length - 1; i >= 0; i--) {
    var o = b[i];
    if (x >= o.x - 4 && x <= o.x + o.w + 4 && y >= o.y - 4 && y <= o.y + o.h + 4) return o;
  }
  return null;
}
function fireBtn(id) {
  Snd.tap();
  if (id === 'menu') { mode = 'menu'; confirmNew = false; return; }
  if (id === 'close') { mode = 'play'; confirmNew = false; craftMsgT = 0; return; }
  if (id === 'snd') { Snd.on = !Snd.on; return; }
  if (id === 'newg') { if (!confirmNew) { confirmNew = true; } else { newGame(); } return; }
  if (id === 'bag') { mode = 'bag'; return; }
  if (id === 'act') { if (mode === 'fish') fishAction(); else doInteract(nearest(st.px, st.py, 52)); return; }
  if (id === 'dec') { mode = 'decorate'; selFurn = -1; trayPage = 0; return; }
  if (id === 'decdone') { mode = 'play'; selFurn = -1; save(); return; }
  if (id === 'wallsty') { cycleStyle('wall'); return; }
  if (id === 'floorsty') { cycleStyle('floor'); return; }
  if (id === 'remove') { if (selFurn >= 0 && selFurn < st.placed.length) { st.placed.splice(selFurn, 1); selFurn = -1; save(); } return; }
  if (id === 'trayl') { trayPage = Math.max(0, trayPage - 1); return; }
  if (id === 'trayr') { trayPage = Math.min(Math.floor((trayItems().length - 1) / 6), trayPage + 1); return; }
  if (id === 'sleepy') { dlg = null; mode = 'play'; advanceDay(true); return; }
  if (id === 'sleepn') { dlg = null; mode = 'play'; return; }
  if (id === 'bye') { dlg = null; mode = 'play'; return; }
  if (id === 'gift') {
    var d = NPCS[dlg.npcI];
    if (st.npc[d.id].gd === st.day || invList().length === 0) { toast('Nothing to give right now.'); return; }
    mode = 'gift'; return;
  }
  if (id === 'endok') { mode = 'play'; st.endShown = true; save(); return; }
}
function cycleStyle(kind) {
  var listk = kind === 'wall' ? 'uw' : 'uf';
  var av = st.style[listk];
  var cur = av.indexOf(st.style[kind]);
  st.style[kind] = av[(cur + 1) % av.length];
  save();
}

/* ================= decorate ================= */
function trayItems() {
  var out = [];
  for (var i = 0; i < FURN.length; i++) if (availCount(FURN[i].id) > 0) out.push(FURN[i]);
  return out;
}
function trayRect(i) { return { x: 54 + (i % 3) * 96, y: 608 + Math.floor(i / 3) * 44, w: 88, h: 40 }; }
function decorateDown(p) {
  // tray?
  var items = trayItems(), pg = items.slice(trayPage * 6, trayPage * 6 + 6);
  for (var i = 0; i < pg.length; i++) {
    var r = trayRect(i);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 6 && p.y <= r.y + r.h + 6) {
      if (st.placed.length >= 40) { toast('The cottage is full.'); return; }
      st.placed.push({ id: pg[i].id, x: ROOM.x + ROOM.w / 2, y: ROOM.y + ROOM.h / 2 });
      selFurn = st.placed.length - 1; Snd.tap(); save(); return;
    }
  }
  // placed?
  for (var j = st.placed.length - 1; j >= 0; j--) {
    var pl = st.placed[j], f = furnById(pl.id);
    if (!f) continue;
    if (Math.abs(p.x - pl.x) < Math.max(f.w, 44) / 2 && Math.abs(p.y - pl.y) < Math.max(f.h, 44) / 2) {
      selFurn = j; drag = { i: j, dx: pl.x - p.x, dy: pl.y - p.y }; dragPid = p.id; Snd.tap(); return;
    }
  }
  selFurn = -1;
}
function decorateMove(p) {
  if (!drag || dragPid !== p.id) return;
  var pl = st.placed[drag.i]; if (!pl) { drag = null; return; }
  var f = furnById(pl.id);
  pl.x = clamp(Math.round((p.x + drag.dx) / 5) * 5, ROOM.x + f.w / 2 + 2, ROOM.x + ROOM.w - f.w / 2 - 2);
  pl.y = clamp(Math.round((p.y + drag.dy) / 5) * 5, ROOM.y + f.h / 2 + 2, ROOM.y + ROOM.h - f.h / 2 - 2);
}
function decorateUp(p) {
  if (drag && dragPid === p.id) { drag = null; dragPid = null; save(); }
}

/* ================= input ================= */
function toV(e) {
  var r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * VW / Math.max(1, r.width), y: (e.clientY - r.top) * VH / Math.max(1, r.height) };
}
function onDown(e) {
  e.preventDefault();
  if (!started || paused) return;
  Snd.init();
  var v = toV(e), p = Input.add(e.pointerId, v.x, v.y);
  var b = hitBtn(v.x, v.y);
  if (b) { p.btn = b.id; return; }
  if (mode === 'play') { playTap(v.x, v.y); }
  else if (mode === 'fish') { fishAction(); }
  else if (mode === 'dialog') { if (dlg && dlg.kind !== 'sleep') advanceDialog(); }
  else if (mode === 'decorate') { decorateDown(p); }
  else if (mode === 'gift') { giftTap(v.x, v.y); }
  else if (mode === 'craft') { craftTap(v.x, v.y); }
  else if (mode === 'bag' || mode === 'menu') { if (v.y < 80 || v.y > 640) { mode = 'play'; confirmNew = false; } }
}
function onMove(e) {
  if (!started || paused) return;
  var p = Input.get(e.pointerId); if (!p) return;
  var v = toV(e);
  if (Math.abs(v.x - p.ox) > 6 || Math.abs(v.y - p.oy) > 6) p.moved = true;
  p.x = v.x; p.y = v.y;
  if (mode === 'decorate') decorateMove(p);
}
function onUp(e) {
  if (paused || rotated || document.hidden) { Input.reset(); drag = null; dragPid = null; return; }
  var p = Input.get(e.pointerId);
  if (!p) return;
  var v = toV(e); p.x = v.x; p.y = v.y;
  if (mode === 'decorate') decorateUp(p);
  if (p.btn) {
    var b = hitBtn(v.x, v.y);
    if (b && b.id === p.btn) fireBtn(b.id);
  }
  Input.del(e.pointerId);
}
function onCancel(e) {
  var p = Input.get(e.pointerId);
  if (p && drag && dragPid === p.id) { drag = null; dragPid = null; }
  Input.del(e.pointerId);
}
function playTap(x, y) {
  if (y < 6 || y > 604) return;       // reserve only the bottom control band
  var wx = x + (st.scene === 'world' ? cam.x : 0), wy = y + (st.scene === 'world' ? cam.y : 0);
  var l = interactables(), best = null, bd = 44 * 44;
  for (var i = 0; i < l.length; i++) {
    var d = dist2(wx, wy, l[i].x, l[i].y);
    if (d < bd) { bd = d; best = l[i]; }
  }
  if (best) {
    if (dist2(st.px, st.py, best.x, best.y) < 46 * 46) { doInteract(best); target = null; path.length = 0; }
    else setWalk(best.x, best.y, best);
  } else if (setWalk(wx, wy, null)) {
    Parts.add(wx, wy, 0, 0, 0.4, '#ffffff', 6, 0);
  }
}
function giftTap(x, y) {
  var items = invList();
  for (var i = 0; i < items.length && i < 16; i++) {
    var r = giftRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { giveGift(items[i]); return; }
  }
}
function giftRect(i) { return { x: 22 + (i % 4) * 88, y: 190 + Math.floor(i / 4) * 84, w: 82, h: 78 }; }
function craftTap(x, y) {
  for (var i = 0; i < RECIPES.length; i++) {
    var r = craftRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { craft(RECIPES[i]); return; }
  }
}
function craftRect(i) { return { x: 14 + (i % 2) * 184, y: 162 + Math.floor(i / 2) * 76, w: 178, h: 70 }; }

function onKey(e, down) {
  var k = (e.key || '').toLowerCase();
  if (document.hidden || rotated) { if (down) { Input.reset(); drag = null; dragPid = null; } return; }
  if (!started) { if (down && (k === ' ' || k === 'enter')) begin(); return; }
  if (down) {
    Snd.init();
    if (k === 'e' || k === ' ') {
      if (mode === 'play') doInteract(nearest(st.px, st.py, 52));
      else if (mode === 'fish') fishAction();
      else if (mode === 'dialog') { if (dlg && dlg.kind === 'sleep') fireBtn('sleepy'); else advanceDialog(); }
      else if (mode === 'ending') fireBtn('endok');
      e.preventDefault();
    } else if (k === 'escape') {
      if (mode === 'decorate') fireBtn('decdone');
      else if (mode !== 'play') { mode = 'play'; dlg = null; fs = null; confirmNew = false; }
      else mode = 'menu';
    } else if (k === 'i') { mode = (mode === 'bag') ? 'play' : 'bag'; }
    else if (k === 'c' && st.scene === 'interior') { mode = (mode === 'craft') ? 'play' : 'craft'; }
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) {
    e.preventDefault();
    Input.keys[k] = down;
    if (down) target = null;
  }
}

/* ================= render ================= */
function render() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0e161d';
  g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  if (!st) return;
  g.save();
  if (shake > 0) g.translate(rnd(-shake, shake), rnd(-shake, shake));

  if (st.scene === 'world') {
    drawWorld(g, cam, st);
    g.save(); g.translate(-cam.x, -cam.y);
    drawNpcs(g);
    drawPlayer(g, st.px, st.py);
    if (mode === 'fish' && fs) drawBobber(g);
    Parts.draw(g);
    g.restore();
    drawNight(g);
  } else {
    drawInterior(g, st);
    var sorted = st.placed.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < sorted.length; i++) {
      var f = furnById(sorted[i].id); if (!f) continue;
      var isSel = (mode === 'decorate' && selFurn >= 0 && st.placed[selFurn] === sorted[i]);
      drawFurn(g, f, sorted[i].x, sorted[i].y, 1, isSel);
    }
    drawPlayer(g, st.px, st.py);
    Parts.draw(g);
    if (st.night) { g.fillStyle = 'rgba(20,26,48,0.24)'; g.fillRect(0, 0, VW, VH); }
  }
  g.restore();

  if (flash > 0) { g.fillStyle = 'rgba(255,246,214,' + (flash * 0.5) + ')'; g.fillRect(0, 0, VW, VH); }

  if (mode === 'decorate') drawDecorateUI(g);
  else drawHUD(g);

  if (mode === 'fish') drawFishUI(g);
  if (mode === 'dialog') drawDialog(g);
  if (mode === 'gift') drawGift(g);
  if (mode === 'craft') drawCraft(g);
  if (mode === 'bag') drawBag(g);
  if (mode === 'menu') drawMenu(g);
  if (mode === 'ending') drawEnding(g);

  drawButtons(g);
  if (toastT > 0) drawToast(g);
}

function drawPlayer(g2, x, y) {
  var bob = Math.abs(Math.sin(st.anim)) * 2.5;
  g2.fillStyle = '#00000030';
  g2.beginPath(); g2.ellipse(x, y + 11, 9, 4, 0, 0, 6.2832); g2.fill();
  fillRR(g2, x - 8, y - 12 - bob, 16, 20, 6, '#5f8fbf');
  g2.fillStyle = '#f0cba8';
  g2.beginPath(); g2.arc(x, y - 18 - bob, 8, 0, 6.2832); g2.fill();
  g2.fillStyle = '#4a3526';
  g2.beginPath(); g2.arc(x, y - 21 - bob, 8, Math.PI, 0); g2.fill();
  g2.fillStyle = '#22303c';
  var fx = st.fx, fy = st.fy;
  if (Math.abs(fx) > Math.abs(fy)) { g2.fillRect(x + (fx > 0 ? 2 : -5), y - 20 - bob, 3, 3); }
  else if (fy < 0) { } else { g2.fillRect(x - 4, y - 19 - bob, 2.5, 3); g2.fillRect(x + 2, y - 19 - bob, 2.5, 3); }
}
function drawNpcs(g2) {
  for (var i = 0; i < NPCS.length; i++) {
    var d = NPCS[i], p = npcPos[i];
    if (p.x < cam.x - 40 || p.x > cam.x + VW + 40 || p.y < cam.y - 60 || p.y > cam.y + VH + 40) continue;
    var bob = Math.abs(Math.sin(p.t)) * 2;
    g2.fillStyle = '#00000030';
    g2.beginPath(); g2.ellipse(p.x, p.y + 11, 9, 4, 0, 0, 6.2832); g2.fill();
    fillRR(g2, p.x - 8, p.y - 12 - bob, 16, 20, 6, d.c);
    g2.fillStyle = '#f0cba8';
    g2.beginPath(); g2.arc(p.x, p.y - 18 - bob, 8, 0, 6.2832); g2.fill();
    g2.fillStyle = d.h;
    g2.beginPath(); g2.arc(p.x, p.y - 20 - bob, 8, Math.PI, 0); g2.fill();
    var hp = hearts(d.id), s = st.npc[d.id];
    if (dist2(st.px, st.py, p.x, p.y) < 90 * 90) {
      txt(g2, d.n.split(' ')[0], p.x, p.y - 36, 11, '#ffffff', 'center', 700);
      for (var k = 0; k < hp; k++) drawHeart(g2, p.x - (hp - 1) * 5 + k * 10, p.y - 48, 4, '#ff8fa8');
      if ((hp >= 2 && !s.s1) || (hp >= 4 && s.s1 && !s.s2)) {
        txt(g2, '!', p.x + 14, p.y - 34 + Math.sin(st.clock * 5) * 2, 18, '#ffe08a', 'center', 800);
      }
    }
  }
}
function drawHeart(g2, x, y, r, col) {
  g2.fillStyle = col;
  g2.beginPath();
  g2.arc(x - r * 0.5, y, r * 0.6, 0, 6.2832); g2.arc(x + r * 0.5, y, r * 0.6, 0, 6.2832);
  g2.moveTo(x - r, y + 0.2); g2.lineTo(x, y + r * 1.3); g2.lineTo(x + r, y + 0.2);
  g2.closePath(); g2.fill();
}
function drawNight(g2) {
  var h = 6 + st.tod * 18, a = 0;
  if (h > 16.5) a = clamp((h - 16.5) / 3.5, 0, 1) * 0.52;
  if (h < 7.5) a = clamp((7.5 - h) / 2, 0, 1) * 0.3;
  if (a <= 0) return;
  g2.fillStyle = 'rgba(18,24,54,' + a.toFixed(3) + ')';
  g2.fillRect(0, 0, VW, VH);
}
function drawBobber(g2) {
  var bx = DOCK.x + DOCK.w / 2, by = DOCK.y - 40;
  var dip = (fs.ph === 'bite') ? Math.sin(fs.t * 30) * 4 : Math.sin(st.clock * 2) * 2;
  g2.strokeStyle = '#e8e0c8'; g2.lineWidth = 1.5;
  g2.beginPath(); g2.moveTo(st.px, st.py - 12); g2.lineTo(bx, by + dip); g2.stroke();
  g2.fillStyle = '#e05a5a'; g2.beginPath(); g2.arc(bx, by + dip, 6, Math.PI, 0); g2.fill();
  g2.fillStyle = '#f0f0f0'; g2.beginPath(); g2.arc(bx, by + dip, 6, 0, Math.PI); g2.fill();
  g2.strokeStyle = 'rgba(255,255,255,0.5)'; g2.lineWidth = 2;
  var rr2 = 10 + (st.clock * 22 % 24);
  g2.beginPath(); g2.ellipse(bx, by + dip + 6, rr2, rr2 * 0.35, 0, 0, 6.2832); g2.stroke();
  if (fs.ph === 'bite') txt(g2, '!', bx, by - 22, 26, '#ffe08a', 'center', 800);
}

/* ---- HUD ---- */
function drawHUD(g2) {
  // top bar
  g2.fillStyle = 'rgba(14,22,29,0.72)'; g2.fillRect(0, 0, VW, 54);
  txt(g2, 'Day ' + st.day + '  ·  ' + (st.season ? 'Autumn' : 'Summer'), 12, 20, 14, '#e8f0e4', 'left', 700);
  txt(g2, hourStr() + (st.night ? '  ☽' : '  ☀'), 12, 40, 13, '#a9bcb2', 'left', 600);
  txt(g2, 'Stories ' + storiesDone() + '/6', 322, 20, 13, '#ffd98a', 'right', 700);
  txt(g2, 'Fish ' + st.stats.fish + ' · Made ' + st.stats.crafted, 322, 40, 12, '#a9bcb2', 'right', 600);
  // hint (single line)
  var n = nearest(st.px, st.py, 52);
  var hint;
  if (mode === 'fish') hint = 'Tap anywhere (or E) to hook and reel';
  else if (n) hint = 'Tap / press E: ' + n.label;
  else if (st.scene === 'world') hint = 'Tap to walk · tap the dock to fish · gather, then craft at home';
  else hint = 'Tap the bench to craft, the bed to sleep, or Decorate';
  g2.fillStyle = 'rgba(14,22,29,0.6)'; g2.fillRect(0, 576, VW, 26);
  txt(g2, hint, VW / 2, 589, 12, '#d8e4d4', 'center', 600);
}
function drawToast(g2) {
  var a = clamp(toastT, 0, 1);
  g2.globalAlpha = a;
  var w = Math.min(340, g2.measureText(toastMsg).width + 200);
  fillRR(g2, (VW - 340) / 2, 62, 340, 34, 10, 'rgba(20,32,26,0.9)');
  txt(g2, toastMsg, VW / 2, 79, 12.5, '#e8f0e4', 'center', 700);
  g2.globalAlpha = 1;
}
function drawButtons(g2) {
  var b = buttons();
  for (var i = 0; i < b.length; i++) {
    var o = b[i];
    var held = false;
    for (var k in Input.pointers) if (Input.pointers[k].btn === o.id) held = true;
    var col = o.s === 1 ? '#63a86c' : (o.s === 2 ? '#c05a5a' : (o.s === 3 ? '#3a4650' : '#2c3a45'));
    fillRR(g2, o.x, o.y, o.w, o.h, 12, held ? '#8fd08f' : col);
    g2.strokeStyle = 'rgba(255,255,255,0.16)'; g2.lineWidth = 1.5;
    rr(g2, o.x + 1, o.y + 1, o.w - 2, o.h - 2, 11); g2.stroke();
    txt(g2, o.l, o.x + o.w / 2, o.y + o.h / 2, o.l.length > 12 ? 12 : 14, o.s === 3 ? '#8894a0' : '#f2f7f0', 'center', 700);
  }
}
function panel(g2, x, y, w, h, title) {
  g2.fillStyle = 'rgba(8,14,18,0.78)'; g2.fillRect(0, 0, VW, VH);
  fillRR(g2, x, y, w, h, 16, '#1b2830');
  g2.strokeStyle = '#3d5460'; g2.lineWidth = 2; rr(g2, x, y, w, h, 16); g2.stroke();
  if (title) txt(g2, title, x + 16, y + 26, 16, '#e8f0e4', 'left', 800);
}

/* ---- fishing UI ---- */
function drawFishUI(g2) {
  fillRR(g2, 16, 430, 358, 130, 14, 'rgba(12,20,26,0.88)');
  var msg = fs.ph === 'cast' ? 'Casting...' :
    fs.ph === 'wait' ? 'Wait for the bobber to dip...' :
      fs.ph === 'bite' ? 'BITE! Tap now!' :
        fs.ph === 'reel' ? 'Tap when the marker is in the green' : '';
  txt(g2, msg, VW / 2, 452, 14, '#e8f0e4', 'center', 700);
  if (fs.ph === 'reel') {
    var bx = 40, bw = 310, by = 476;
    fillRR(g2, bx, by, bw, 26, 8, '#2b3a44');
    var zw = fs.f.zone * bw;
    fillRR(g2, bx + fs.zc * bw - zw / 2, by, zw, 26, 8, '#4fbf7a');
    var mx = bx + fs.pos * bw;
    g2.fillStyle = '#ffe08a';
    g2.beginPath(); g2.moveTo(mx, by - 6); g2.lineTo(mx + 7, by - 16); g2.lineTo(mx - 7, by - 16); g2.closePath(); g2.fill();
    g2.fillRect(mx - 2, by, 4, 26);
    for (var i = 0; i < fs.need; i++) {
      g2.fillStyle = i < fs.hits ? '#8fe0c0' : '#3a4a54';
      g2.beginPath(); g2.arc(150 + i * 22, 524, 7, 0, 6.2832); g2.fill();
    }
    for (var m = 0; m < 3; m++) {
      g2.fillStyle = m < fs.miss ? '#e07a7a' : '#2b3a44';
      g2.fillRect(300 + m * 14, 518, 9, 12);
    }
    txt(g2, 'line', 288, 524, 10, '#8894a0', 'right', 600);
  } else if (fs.ph === 'done') {
    if (fs.res === 'caught') {
      txt(g2, 'Caught a ' + ITEMS[fs.id].n + '!', VW / 2, 490, 20, ITEMS[fs.id].c, 'center', 800);
      txt(g2, 'Tap to continue', VW / 2, 528, 12, '#a9bcb2', 'center', 600);
    } else {
      txt(g2, fs.res, VW / 2, 490, 14, '#e0a0a0', 'center', 700);
      txt(g2, 'Tap to continue', VW / 2, 522, 12, '#a9bcb2', 'center', 600);
    }
  } else {
    txt(g2, 'Tap anywhere to react', VW / 2, 500, 12, '#a9bcb2', 'center', 600);
  }
}

/* ---- dialog ---- */
function drawDialog(g2) {
  var d = dlg;
  g2.fillStyle = 'rgba(8,14,18,0.55)'; g2.fillRect(0, 0, VW, VH);
  fillRR(g2, 14, 400, 362, 190, 16, '#16232b');
  g2.strokeStyle = d.col; g2.lineWidth = 2.5; rr(g2, 14, 400, 362, 190, 16); g2.stroke();
  if (d.npcI >= 0) {
    fillRR(g2, 30, 384, 44, 44, 12, d.col);
    txt(g2, d.name.charAt(0), 52, 406, 20, '#1b2830', 'center', 800);
  }
  txt(g2, d.name, d.npcI >= 0 ? 86 : 30, 406, 14, d.col, 'left', 800);
  var line = d.lines[Math.min(d.idx, d.lines.length - 1)] || '';
  var ls = wrap(g2, line, 15, 322);
  for (var i = 0; i < ls.length; i++) txt(g2, ls[i], 30, 442 + i * 23, 15, '#e8f0e4', 'left', 500);
  if (d.kind === 'story') {
    txt(g2, (d.idx + 1) + '/' + d.lines.length + '  ·  tap to continue', 360, 572, 11, '#8894a0', 'right', 600);
  } else if (d.kind !== 'sleep' && d.idx < d.lines.length - 1) {
    txt(g2, 'tap to continue', 360, 572, 11, '#8894a0', 'right', 600);
  }
}

/* ---- gift picker ---- */
function drawGift(g2) {
  panel(g2, 12, 100, 366, 500, 'Give a gift');
  var d = NPCS[dlg.npcI];
  txt(g2, 'to ' + d.n + ' · the ' + d.role, 28, 52 + 100, 12, '#a9bcb2', 'left', 600);
  var items = invList();
  if (!items.length) txt(g2, 'Your bag is empty.', VW / 2, 300, 14, '#8894a0', 'center', 600);
  for (var i = 0; i < items.length && i < 16; i++) {
    var r = giftRect(i), it = ITEMS[items[i]];
    fillRR(g2, r.x, r.y, r.w, r.h, 10, '#243440');
    g2.fillStyle = it.c;
    if (it.f) { g2.beginPath(); g2.ellipse(r.x + r.w / 2, r.y + 24, 16, 9, 0, 0, 6.2832); g2.fill(); g2.beginPath(); g2.moveTo(r.x + r.w / 2 - 16, r.y + 24); g2.lineTo(r.x + r.w / 2 - 26, r.y + 16); g2.lineTo(r.x + r.w / 2 - 26, r.y + 32); g2.closePath(); g2.fill(); }
    else { g2.beginPath(); g2.arc(r.x + r.w / 2, r.y + 24, 13, 0, 6.2832); g2.fill(); }
    var nm = it.n.length > 11 ? it.n.slice(0, 10) + '.' : it.n;
    txt(g2, nm, r.x + r.w / 2, r.y + 50, 10.5, '#e8f0e4', 'center', 700);
    txt(g2, 'x' + st.inv[items[i]], r.x + r.w / 2, r.y + 66, 10, '#a9bcb2', 'center', 600);
  }
}

/* ---- craft ---- */
function drawCraft(g2) {
  panel(g2, 8, 86, 374, 528, 'Workbench');
  txt(g2, '12 recipes · everything here is earned, never bought', 24, 142, 11, '#a9bcb2', 'left', 600);
  for (var i = 0; i < RECIPES.length; i++) {
    var rec = RECIPES[i], r = craftRect(i), can = hasItems(rec.r) && (st.owned[rec.id] || 0) < 3;
    fillRR(g2, r.x, r.y, r.w, r.h, 10, can ? '#26433a' : '#212f38');
    if (can) { g2.strokeStyle = '#4fbf7a'; g2.lineWidth = 1.5; rr(g2, r.x, r.y, r.w, r.h, 10); g2.stroke(); }
    drawFurnFit(g2, rec, r.x + 26, r.y + 34, 42);
    var nm = rec.n.length > 15 ? rec.n.slice(0, 14) + '.' : rec.n;
    txt(g2, nm, r.x + 54, r.y + 16, 11.5, '#e8f0e4', 'left', 700);
    var cx = r.x + 54, k, ci = 0;
    for (k in rec.r) {
      var have = st.inv[k] || 0, need = rec.r[k];
      g2.fillStyle = ITEMS[k].c;
      g2.beginPath(); g2.arc(cx + 5, r.y + 38 + ci * 15, 4.5, 0, 6.2832); g2.fill();
      txt(g2, ITEMS[k].n + ' ' + have + '/' + need, cx + 14, r.y + 38 + ci * 15, 10.5, have >= need ? '#8fe0c0' : '#d08080', 'left', 600);
      ci++;
    }
    var own = st.owned[rec.id] || 0;
    if (own) txt(g2, 'x' + own, r.x + r.w - 10, r.y + 16, 11, '#ffd98a', 'right', 700);
  }
  if (craftMsgT > 0) { g2.globalAlpha = clamp(craftMsgT, 0, 1); txt(g2, craftMsg, VW / 2, 604, 13, '#ffd98a', 'center', 700); g2.globalAlpha = 1; }
}

/* ---- bag ---- */
function drawBag(g2) {
  panel(g2, 8, 86, 374, 528, 'Bag');
  var items = invList();
  if (!items.length) txt(g2, 'Empty. Gather reeds, stones and wood outside.', 24, 150, 12.5, '#8894a0', 'left', 600);
  for (var i = 0; i < items.length && i < 16; i++) {
    var it = ITEMS[items[i]], x = 24 + (i % 4) * 88, y = 140 + Math.floor(i / 4) * 66;
    fillRR(g2, x, y, 82, 58, 9, '#243440');
    g2.fillStyle = it.c; g2.beginPath(); g2.arc(x + 16, y + 20, 9, 0, 6.2832); g2.fill();
    var nm = it.n.length > 11 ? it.n.slice(0, 10) + '.' : it.n;
    txt(g2, nm, x + 8, y + 42, 10, '#e8f0e4', 'left', 700);
    txt(g2, 'x' + st.inv[items[i]], x + 72, y + 20, 12, '#ffd98a', 'right', 700);
  }
  var yy = 140 + Math.ceil(Math.min(items.length, 16) / 4) * 66 + 12;
  txt(g2, 'Friends', 24, yy, 14, '#e8f0e4', 'left', 800); yy += 22;
  for (var j = 0; j < NPCS.length; j++) {
    var d = NPCS[j], hp = hearts(d.id), s = st.npc[d.id];
    g2.fillStyle = d.c; g2.beginPath(); g2.arc(30, yy, 6, 0, 6.2832); g2.fill();
    txt(g2, d.n.split(' ')[0] + ' · loves ' + ITEMS[d.loves].n, 44, yy, 11.5, '#c8d4c8', 'left', 600);
    for (var h = 0; h < hp; h++) drawHeart(g2, 268 + h * 14, yy - 1, 5, '#ff8fa8');
    txt(g2, s.s2 ? 'story done' : (s.s1 ? 'story 1/2' : ''), 366, yy, 10, '#ffd98a', 'right', 600);
    yy += 22;
  }
}

/* ---- menu ---- */
function drawMenu(g2) {
  panel(g2, 30, 150, 330, 360, 'Willowmere');
  txt(g2, 'Day ' + st.day + ' · ' + (st.season ? 'Autumn' : 'Summer') + ' · stories ' + storiesDone() + '/6', 46, 202, 12.5, '#a9bcb2', 'left', 600);
  txt(g2, 'No purchases, no timers, no energy. Ever.', 46, 392, 11.5, '#8fe0c0', 'left', 600);
  txt(g2, 'Fish ' + st.stats.fish + ' · Crafted ' + st.stats.crafted + ' · Gifts ' + st.stats.gifts, 46, 412, 11.5, '#8894a0', 'left', 600);
}

/* ---- decorate ---- */
function drawDecorateUI(g2) {
  g2.fillStyle = 'rgba(14,22,29,0.72)'; g2.fillRect(0, 0, VW, 62);
  txt(g2, 'Decorate', VW / 2, 30, 13, '#e8f0e4', 'center', 700);
  g2.fillStyle = 'rgba(14,22,29,0.86)'; g2.fillRect(0, 596, VW, 104);
  var items = trayItems(), pg = items.slice(trayPage * 6, trayPage * 6 + 6);
  if (!items.length) txt(g2, 'Craft furniture at the bench to fill this tray.', VW / 2, 640, 12, '#8894a0', 'center', 600);
  for (var i = 0; i < pg.length; i++) {
    var r = trayRect(i);
    fillRR(g2, r.x, r.y, r.w, r.h, 8, '#243440');
    drawFurnFit(g2, pg[i], r.x + 18, r.y + 20, 30);
    var nm = pg[i].n.split(' ').pop();
    txt(g2, nm, r.x + 36, r.y + 14, 9.5, '#e8f0e4', 'left', 700);
    txt(g2, 'x' + availCount(pg[i].id), r.x + 36, r.y + 28, 9.5, '#ffd98a', 'left', 600);
  }
  txt(g2, 'Drag pieces to move · tap the tray to place', VW / 2, 568, 11.5, '#d8e4d4', 'center', 600);
}

/* ---- ending ---- */
function drawEnding(g2) {
  g2.fillStyle = 'rgba(10,14,26,0.88)'; g2.fillRect(0, 0, VW, VH);
  for (var i = 0; i < 14; i++) {
    var a = st.clock * 0.6 + i;
    g2.fillStyle = ['#ffd77a', '#ff9ab0', '#9fe0c0', '#a8c0ff'][i % 4];
    g2.globalAlpha = 0.5 + Math.sin(a * 2) * 0.3;
    g2.beginPath(); g2.arc(30 + i * 25, 120 + Math.sin(a) * 26, 5, 0, 6.2832); g2.fill();
  }
  g2.globalAlpha = 1;
  txt(g2, 'THE LANTERN FESTIVAL', VW / 2, 210, 20, '#ffd98a', 'center', 800);
  var body = 'All six of Willowmere told you their whole story. Tonight the square is full of lanterns, Corvin’s skiff is on the water, and Juniper is playing the piece about somebody arriving in a small town. You stay.';
  var ls = wrap(g2, body, 14, 300);
  for (var j = 0; j < ls.length; j++) txt(g2, ls[j], VW / 2, 260 + j * 24, 14, '#e8f0e4', 'center', 500);
  txt(g2, 'Day ' + st.day + ' · ' + st.stats.fish + ' fish · ' + st.stats.crafted + ' pieces made', VW / 2, 480, 12.5, '#a9bcb2', 'center', 600);
  txt(g2, 'The town keeps going. So can you.', VW / 2, 520, 12.5, '#8fe0c0', 'center', 600);
  Parts.draw(g2);
}

/* ================= boot / resize ================= */
var sc = 1;
function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  var landscape = w > h;
  rotated = landscape && w / h > 1.05;
  rotOv.classList.toggle('on', rotated);
  var nextPaused = rotated || document.hidden || !started;
  if (nextPaused && !paused) { Input.reset(); Timers.clearAll(); drag = null; dragPid = null; }
  paused = nextPaused;
  var scale = Math.min(w / VW, h / VH);
  var cw = Math.round(VW * scale), ch = Math.round(VH * scale);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
  var longAxis = Math.max(bw, bh);
  if (longAxis > MAXAXIS) { var f = MAXAXIS / longAxis; bw = Math.round(bw * f); bh = Math.round(bh * f); }
  cv.width = Math.max(1, bw); cv.height = Math.max(1, bh);
  sc = cv.height / VH;
  g.imageSmoothingEnabled = true;
}
function begin() {
  if (started) return;
  started = true;
  startOv.classList.remove('on');
  Snd.init();
  resize();
  paused = rotated || document.hidden;
  last = performance.now();
}

/* wire up */
cv.addEventListener('pointerdown', onDown, { passive: false });
cv.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onCancel);
cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
window.addEventListener('keydown', function (e) { onKey(e, true); });
window.addEventListener('keyup', function (e) { onKey(e, false); });
window.addEventListener('blur', function () {
  Input.reset(); drag = null; dragPid = null;
});
document.addEventListener('visibilitychange', function () {
  paused = rotated || document.hidden || !started;
  if (document.hidden) { Input.reset(); Timers.clearAll(); drag = null; dragPid = null; if (st) save(); }
  else { last = performance.now(); }
});
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { Timers.set(resize, 60); });
document.getElementById('startBtn').addEventListener('click', begin);
startOv.addEventListener('pointerdown', function (e) { e.preventDefault(); Snd.init(); begin(); }, { passive: false });

navW = makeNav(MW, MH, 10, blocked, PR + 1);
navI = makeNav(VW, VH, 8, insideBlocked, PR + 1);
st = deserialize(Store.read());
refreshTime(); snapNpcs(); centerCam();
if (st.festival && !st.endShown) mode = 'play';
resize();
requestAnimationFrame(frame);
