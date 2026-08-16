/* Molehunt Manor
 * Phaser 3 social deduction for the GreenGuard fleet.
 * GGKit owns lifecycle, input identity, save, audio and juice. The simulation
 * below is deliberately data-first: witnesses store time-stamped knowledge,
 * claims are generated from that knowledge, and votes score evidence links.
 */
(function () {
  'use strict';

  var W = 390, H = 844, STEP = 1 / 30, TAU = Math.PI * 2;
  var HIDPI_FACTOR = window.GGKit && window.GGKit.hiDpi ? window.GGKit.hiDpi.factor(W, H) : 1;
  var PAL = {
    ink: 0x0b1018, panel: 0x151d2a, panel2: 0x1d2a3b, line: 0x34465b,
    text: 0xe7f1ef, dim: 0x9bb0b5, brass: 0xf4c56d, mint: 0x79e0bb,
    sky: 0x77c8e9, rose: 0xf27a87, violet: 0xc5a4ff, white: 0xffffff,
    grand: 0x2c4250, glass: 0x234950, service: 0x493b45, clock: 0x3e354f
  };
  var CSS = { text: '#e7f1ef', dim: '#9bb0b5', brass: '#f4c56d', mint: '#79e0bb',
    sky: '#77c8e9', rose: '#f27a87', violet: '#c5a4ff' };

  var TASKS = [
    ['reshelve atlases', 'oil the map drawer', 'dust the ledgers'],
    ['sort seed catalogues', 'ink the day book', 'trim quill nibs'],
    ['mist the ferns', 'repot a fig', 'sweep glass grit'],
    ['re-hang a portrait', 'wax the frames', 'log the inventory'],
    ['air the bedding', 'lay a fresh fire', 'beat the rug'],
    ['wind the cot mobile', 'shelve picture books', 'scrub hand marks'],
    ['tune piano wires', 'sort sheet music', 'dust the harp'],
    ['count pillowcases', 'mend a torn hem', 'stack towels'],
    ['knead loaf dough', 'scour copper pans', 'baste the roast'],
    ['count flour sacks', 'label preserves', 'stack crates'],
    ['scrub the deep sink', 'wring wash cloths', 'sort cutlery'],
    ['feed the mangle', 'starch collars', 'fold bed linen'],
    ['turn wine racks', 'chalk barrel dates', 'sweep stone floor'],
    ['bank the furnace', 'check pressure dials', 'grease valve wheel'],
    ['wax the parquet', 'straighten chairs', 'polish sconces'],
    ['retally the plate', 'oil lock bolts', 'seal a ledger box']
  ];
  var FAKE_TASKS = [
    'waving at a shelf already dusted', 'scribbling in a closed book',
    'tipping an empty watering can', 'straightening a frame that was straight',
    'patting a pillow that needs nothing', 'reshelving one book twice',
    'pressing keys with the lid shut', 'refolding one towel again and again',
    'stirring an empty pot', 'moving a crate back and forth',
    'rinsing a clean plate again', 'refolding the same sheet',
    'chalking over yesterday date', 'miming a valve turn',
    'nudging a chair a finger width', 'jiggling a bolt already shut'
  ];
  var ROOM_NAMES = [
    'Grand Hall', 'Library', 'Gallery', 'Study',
    'Glasshouse', 'Blue Room', 'Nursery', 'Music Room',
    'Servants Warren', 'Kitchen', 'Pantry', 'Laundry',
    'Clocktower Base', 'Boiler Room', 'Ballroom', 'Strong Room'
  ];
  var WINGS = [
    { name: 'GRAND HALL', color: PAL.grand, accent: PAL.brass },
    { name: 'GLASSHOUSE', color: PAL.glass, accent: PAL.mint },
    { name: 'SERVANTS WARREN', color: PAL.service, accent: PAL.rose },
    { name: 'CLOCKTOWER', color: PAL.clock, accent: PAL.violet }
  ];
  var ROOM_TASKS = TASKS.map(function (a, i) { return a[i % a.length]; });
  var ROOM_LINKS = [
    [1, 4], [0, 2, 5], [1, 3, 6], [2, 7],
    [0, 5, 8], [1, 4, 6, 9], [2, 5, 7, 10], [3, 6, 11],
    [4, 9, 12], [5, 8, 10, 13], [6, 9, 11, 14], [7, 10, 15],
    [8, 13], [9, 12, 14], [10, 13, 15], [11, 14]
  ];
  var GUESTS = [
    { name: 'Ada Vell', color: 0xe7b36c, shape: 0, logic: 0.95, memory: 0.92, bold: 0.72 },
    { name: 'Bram Otis', color: 0x73cce8, shape: 1, logic: 0.66, memory: 0.78, bold: 0.88 },
    { name: 'Cleo Nash', color: 0xe7829b, shape: 2, logic: 0.78, memory: 0.62, bold: 0.58 },
    { name: 'Dorian Pike', color: 0xb19af5, shape: 3, logic: 0.84, memory: 0.87, bold: 0.44 },
    { name: 'Esme Rook', color: 0x78ddb0, shape: 4, logic: 0.71, memory: 0.94, bold: 0.53 },
    { name: 'Fitz Malloy', color: 0xf0d16d, shape: 5, logic: 0.57, memory: 0.69, bold: 0.82 },
    { name: 'Greta Solm', color: 0xf19a67, shape: 6, logic: 0.88, memory: 0.76, bold: 0.61 },
    { name: 'Hale Brint', color: 0x8aafd9, shape: 7, logic: 0.63, memory: 0.84, bold: 0.47 }
  ];
  var CASES = [
    { title: 'A Quiet Welcome', guests: 6, moles: 1, roles: [], limit: 44 },
    { title: 'The Glasshouse Bell', guests: 6, moles: 1, roles: ['detective'], limit: 46 },
    { title: 'A Door Left Open', guests: 7, moles: 1, roles: ['detective'], limit: 48 },
    { title: 'Ash in the Kitchen', guests: 7, moles: 1, roles: ['saboteur'], limit: 48 },
    { title: 'The Borrowed Voice', guests: 7, moles: 2, roles: ['mimic'], limit: 50 },
    { title: 'Clockwork Alibi', guests: 8, moles: 2, roles: ['detective'], limit: 52 },
    { title: 'Two Lamps Out', guests: 8, moles: 2, roles: ['saboteur'], limit: 52 },
    { title: 'A Familiar Claim', guests: 8, moles: 2, roles: ['mimic'], limit: 54 },
    { title: 'The Long Corridor', guests: 8, moles: 2, roles: ['detective', 'saboteur'], limit: 54 },
    { title: 'Echoes at Dinner', guests: 8, moles: 2, roles: ['detective', 'mimic'], limit: 56 },
    { title: 'The False Bell', guests: 8, moles: 2, roles: ['saboteur', 'mimic'], limit: 56 },
    { title: 'Molehunt Manor', guests: 8, moles: 2, roles: ['detective', 'saboteur', 'mimic'], limit: 60 }
  ];
  var ROLE_NAMES = ['detective', 'saboteur', 'mimic'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function safeInt(v, fallback, max) {
    return typeof v === 'number' && isFinite(v) ? clamp(v | 0, 0, max) : fallback;
  }
  function rng(seed) {
    var x = seed >>> 0;
    return function () {
      x = (x + 0x6d2b79f5) >>> 0;
      var t = x;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(r, a) {
    var out = a.slice(), i, j, x;
    for (i = out.length - 1; i > 0; i--) { j = (r() * (i + 1)) | 0; x = out[i]; out[i] = out[j]; out[j] = x; }
    return out;
  }
  function fmtTime(t) { var n = Math.max(0, t | 0); return String((n / 60) | 0).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
  function roomName(i) { return ROOM_NAMES[i] || ROOM_NAMES[0]; }
  function guestName(i) { return GUESTS[i] ? GUESTS[i].name : 'Unknown guest'; }
  function shortName(i) { return guestName(i).split(' ')[0]; }
  function roomWing(i) { return (i / 4) | 0; }
  function distance(a, b) { return ROOM_LINKS[a] && ROOM_LINKS[a].indexOf(b) >= 0; }
  function pushBounded(a, x, n) { a.push(x); if (a.length > n) a.splice(0, a.length - n); }

  function defaultProfile() {
    var dossiers = {}, i;
    for (i = 0; i < GUESTS.length; i++) dossiers[i] = { seen: 0, trusted: 0, accused: 0 };
    return { version: 2, unlockedCase: 1, casesPlayed: 0, casesSolved: 0, votes: 0, correctVotes: 0,
      roles: { detective: false, saboteur: false, mimic: false }, dossiers: dossiers, lastCase: null };
  }
  function validProfile(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.version !== 2) return false;
    if (safeInt(o.unlockedCase, -1, 12) < 1 || safeInt(o.casesPlayed, -1, 9999) < 0 || safeInt(o.casesSolved, -1, 9999) < 0) return false;
    if (safeInt(o.votes, -1, 99999) < 0 || safeInt(o.correctVotes, -1, 99999) < 0) return false;
    if (!o.roles || !o.dossiers) return false;
    for (var i = 0; i < ROLE_NAMES.length; i++) if (typeof o.roles[ROLE_NAMES[i]] !== 'boolean') return false;
    for (i = 0; i < GUESTS.length; i++) if (!o.dossiers[i] || safeInt(o.dossiers[i].seen, -1, 99999) < 0) return false;
    return true;
  }

  var state = { mode: 'menu', stage: 'menu', progress: 0, score: 0, health: 3, forceMode: null, forceStage: null };
  window.__mm = { state: state, forceMode: null, forceStage: null, actions: {} };
  var kit = GGKit.create({
    slug: 'molehunt-manor', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { state.paused = true; }, onResume: function () { state.paused = false; },
    onRestart: function () { if (window.__mm.actions.restart) window.__mm.actions.restart(); }
  });
  var profile = kit.save.get(defaultProfile());
  if (!validProfile(profile)) profile = defaultProfile();
  kit.audio.register({
    manor: 'assets/music_manor.mp3', tension: 'assets/music_tension.mp3',
    tap: 'assets/sfx_tap.mp3', move: 'assets/sfx_move.mp3', task: 'assets/sfx_task.mp3',
    sight: 'assets/sfx_sight.mp3', clue: 'assets/sfx_clue.mp3', alarm: 'assets/sfx_alarm.mp3',
    vote: 'assets/sfx_vote.mp3', catch: 'assets/sfx_catch.mp3', wrong: 'assets/sfx_wrong.mp3',
    reveal: 'assets/sfx_reveal.mp3'
  });

  function saveProfile() { kit.save.set(profile); }
  function newGuest(id, r, mole, role, random) {
    var g = GUESTS[id];
    return { id: id, room: r, previousRoom: r, nextRoom: r, routeClock: 1.1 + random() * 1.5,
      task: ROOM_TASKS[r], taskDone: 0, isMole: !!mole, role: role || '', memory: [], history: [{ room: r, t: 0 }],
      missing: false, alive: true, trust: 0 };
  }
  function makeCase(index, opts, seed, playerMole) {
    var base = opts || CASES[clamp(index, 0, CASES.length - 1)];
    var r = rng(seed || ((Date.now() ^ (index * 2654435761)) >>> 0));
    var guestCount = clamp(base.guests || 8, 6, 8), moleCount = clamp(base.moles || 2, 1, 2);
    var ids = [], i;
    for (i = 0; i < guestCount; i++) ids.push(i);
    var order = shuffled(r, ids), moleIds = order.slice(0, moleCount), roleIds = {};
    var rolePool = shuffled(r, ids.filter(function (id) { return moleIds.indexOf(id) < 0; }));
    (base.roles || []).forEach(function (role, ri) {
      var id = role === 'saboteur' && moleIds.length ? moleIds[ri % moleIds.length] : rolePool[ri % Math.max(1, rolePool.length)];
      roleIds[role] = id;
    });
    var rooms = shuffled(r, ids.map(function (_, n) { return n; }));
    var c = { index: index, title: base.title, config: base, seed: seed, random: r, clock: 0, round: 1,
      stage: 'manor', playerMole: !!playerMole, playerRoom: 0, playerLastRoom: 0, tasksDone: 0,
      requiredTasks: 5 + (guestCount - 6), roomDone: [], evidence: [], notebook: [], bodies: [],
      guests: [], moleIds: moleIds, caught: [], roleIds: roleIds, sabotageCount: 0, maxSabotage: 2,
      nextSabotage: 7.5, health: 3, score: 0, claims: [], selectedClaim: 0, meetingClock: 24,
      votes: [], result: null, toast: null, tutorial: true, lastMeetingReason: '', playerClaim: null };
    for (i = 0; i < 16; i++) c.roomDone[i] = false;
    c.maxSabotage += roleIds.saboteur != null ? 1 : 0;
    for (i = 0; i < guestCount; i++) {
      var mole = moleIds.indexOf(i) >= 0;
      var role = '';
      for (var rk in roleIds) if (roleIds[rk] === i) role = rk;
      c.guests.push(newGuest(i, rooms[i % rooms.length], mole, role, r));
    }
    if (playerMole) {
      c.playerGuestId = moleIds[0];
      c.guests[c.playerGuestId].player = true;
      c.moleIds = moleIds.slice();
      c.molesForWin = moleIds.filter(function (id) { return id !== c.playerGuestId; });
    }
    c.playerRoom = c.guests[0].room;
    c.playerLastRoom = c.playerRoom;
    registerAllWitnesses(c);
    recordSightings(c, c.playerRoom, 'direct', 'arrival');
    return c;
  }
  function activeGuests(c) { return c.guests.filter(function (g) { return g.alive && !g.missing; }); }
  function realMole(c, id) { return c.moleIds.indexOf(id) >= 0; }
  function registerKnowledge(a, b, c, certainty) {
    if (!a || !b || a.id === b.id || a.missing || b.missing) return;
    pushBounded(a.memory, { target: b.id, room: b.room, t: c.clock, certainty: certainty || 1 }, 32);
  }
  function registerAllWitnesses(c) {
    var gs = activeGuests(c), i, j;
    for (i = 0; i < gs.length; i++) for (j = i + 1; j < gs.length; j++) {
      if (gs[i].room === gs[j].room) { registerKnowledge(gs[i], gs[j], c, 1); registerKnowledge(gs[j], gs[i], c, 1); }
    }
  }
  function chooseNextRoom(c, g) {
    var choices = ROOM_LINKS[g.room] || [g.room], best = choices[(c.random() * choices.length) | 0];
    if (g.isMole && c.random() < 0.55) {
      var sight = choices.filter(function (x) { return x !== g.room && activeGuests(c).some(function (q) { return q.room === x && q.id !== g.id; }); });
      if (sight.length) best = sight[(c.random() * sight.length) | 0];
    }
    return best;
  }
  function moveGuest(c, g) {
    if (g.missing || !g.alive) return;
    g.previousRoom = g.room; g.room = g.nextRoom; g.task = ROOM_TASKS[g.room]; g.taskDone = 0;
    pushBounded(g.history, { room: g.room, t: c.clock }, 18);
    g.routeClock = 1.7 + c.random() * (2.8 - GUESTS[g.id].memory);
    g.nextRoom = chooseNextRoom(c, g);
    registerAllWitnesses(c);
  }
  function addEvidence(c, ev) {
    var key = ev.kind + ':' + ev.target + ':' + ev.room + ':' + Math.floor(ev.t / 2);
    if (c.evidence.some(function (e) { return e.key === key; })) return false;
    ev.key = key; pushBounded(c.evidence, ev, 48); pushBounded(c.notebook, ev, 30);
    if (ev.target != null && profile.dossiers[ev.target]) profile.dossiers[ev.target].seen++;
    return true;
  }
  function sightRooms(c, room) {
    var out = [room], links = ROOM_LINKS[room] || [], i;
    for (i = 0; i < links.length; i++) if ((links[i] + room) % 3 !== 1 || roomWing(links[i]) !== roomWing(room)) out.push(links[i]);
    return out;
  }
  function recordSightings(c, room, certainty, source) {
    var visible = sightRooms(c, room), added = 0, i, j, gs;
    for (i = 0; i < visible.length; i++) {
      gs = activeGuests(c).filter(function (g) { return g.room === visible[i]; });
      for (j = 0; j < gs.length; j++) if (addEvidence(c, { kind: 'sighting', target: gs[j].id, room: visible[i], t: c.clock,
        certainty: visible[i] === room ? 1 : 0.65, source: source || 'player' })) added++;
      if (c.bodies.some(function (b) { return b.room === visible[i] && !b.found; })) {
        var body = c.bodies.filter(function (b) { return b.room === visible[i] && !b.found; })[0];
        body.found = true; addEvidence(c, { kind: 'body', target: body.victim, room: body.room, t: c.clock, certainty: 1, source: 'player' });
        toast(c, 'BODY FOUND', PAL.rose, 1.0); kit.audio.sfx('alarm');
      }
    }
    if (added) { c.score += added * 2; state.score = c.score; kit.audio.sfx('sight'); toast(c, '+' + added + ' SIGHTING' + (added > 1 ? 'S' : ''), PAL.sky, 0.8); }
    return added;
  }
  function toast(c, text, color, duration) { c.toast = { text: text, color: color, until: c.clock + (duration || 1) }; }
  function sabotage(c) {
    if (c.sabotageCount >= c.maxSabotage || !activeGuests(c).length) return;
    var moles = c.moleIds.filter(function (id) { return !c.caught.includes(id); }), mole = moles[c.sabotageCount % Math.max(1, moles.length)];
    var victims = activeGuests(c).filter(function (g) { return g.id !== mole && (!c.playerMole || g.id !== c.playerGuestId); });
    if (!victims.length) return;
    var victim = victims[(c.sabotageCount + ((c.clock * 3) | 0)) % victims.length];
    victim.missing = true; victim.alive = false;
    c.bodies.push({ victim: victim.id, room: c.guests[mole].room, t: c.clock, found: false });
    c.sabotageCount++; c.health = Math.max(0, c.health - 1); state.health = c.health;
    c.nextSabotage = c.clock + 10 + c.random() * 6;
    kit.juice.shake(3, 180); kit.juice.hitStop(60); kit.audio.sfx('alarm');
    toast(c, 'A LAMP WENT OUT', PAL.rose, 1.0);
    if (c.health <= 0) endCase(c, false, 'The manor lost its last light.');
  }
  function advanceManor(c, dt) {
    if (!c || c.stage !== 'manor') return;
    c.clock += dt;
    c.guests.forEach(function (g) { if (!g.player && g.alive && !g.missing) { g.routeClock -= dt; if (g.routeClock <= 0) moveGuest(c, g); } });
    registerAllWitnesses(c);
    if (c.clock >= c.nextSabotage) sabotage(c);
    if (c.clock >= c.config.limit) enterMeeting(c, 'the clock');
    state.progress = clamp(c.clock / c.config.limit, 0, 1);
    if (c.toast && c.clock > c.toast.until) c.toast = null;
  }
  function doTask(c) {
    if (!c || c.stage !== 'manor' || c.roomDone[c.playerRoom]) return false;
    c.roomDone[c.playerRoom] = true; c.tasksDone++; c.score += 10; state.score = c.score;
    c.guests.forEach(function (g) { if (g.room === c.playerRoom) g.trust += 0.2; });
    toast(c, '+10 TASK', PAL.mint, 0.9); kit.audio.sfx('task');
    for (var i = 0; i < 12; i++) particle(ROOM_X(c.playerRoom), ROOM_Y(c.playerRoom), PAL.mint);
    if (c.tasksDone >= c.requiredTasks) enterMeeting(c, 'tasks complete');
    return true;
  }
  function movePlayer(c, room) {
    if (!c || c.stage !== 'manor' || !distance(c.playerRoom, room)) return false;
    c.playerLastRoom = c.playerRoom; c.playerRoom = room; c.score += 1; state.score = c.score;
    recordSightings(c, room, 'direct', 'move'); kit.audio.sfx('move');
    return true;
  }

  function claimRoom(c, g) {
    var last = g.history.length ? g.history[g.history.length - 1] : { room: g.room, t: c.clock };
    if (!g.isMole) return last.room;
    var links = ROOM_LINKS[g.room] || [], alt = links.filter(function (x) { return x !== g.room; });
    var candidate = alt.length ? alt[(g.id + c.round) % alt.length] : g.previousRoom;
    var playerSaw = c.evidence.some(function (e) { return e.kind === 'sighting' && e.target === g.id && e.room === g.room && e.certainty >= 0.9; });
    if (playerSaw && c.random() < 0.7) candidate = g.previousRoom;
    return candidate === g.room ? (g.previousRoom === g.room ? ((g.room + 1) % 16) : g.previousRoom) : candidate;
  }
  function witnessIdsFor(c, g, room) {
    var seen = [], i, m;
    for (i = 0; i < g.memory.length; i++) { m = g.memory[i]; if (m.room === room && seen.indexOf(m.target) < 0 && m.target !== g.id) seen.push(m.target); }
    return seen.slice(0, g.role === 'detective' ? 3 : 2);
  }
  function makeClaim(c, g, previous) {
    var room = claimRoom(c, g), truthful = !g.isMole, witnesses = witnessIdsFor(c, g, room), copied = null;
    if (g.role === 'mimic' && previous && (g.isMole || previous.truthful) && c.random() < 0.82) {
      copied = previous; room = previous.room; witnesses = previous.witnesses.slice();
    }
    var line = 'I was in ' + roomName(room) + '. ' + (witnesses.length ? shortName(witnesses[0]) + ' can place me there.' : 'I worked alone.');
    if (g.isMole && !witnesses.length) line = 'I kept to ' + roomName(room) + ' and saw no one worth naming.';
    return { speaker: g.id, room: room, t: c.clock, witnesses: witnesses, line: line, truthful: truthful, copied: copied ? copied.speaker : -1 };
  }
  function buildClaims(c) {
    var previous = null;
    c.claims = activeGuests(c).map(function (g) { var cl = makeClaim(c, g, previous); previous = cl; return cl; });
    c.selectedClaim = 0;
    c.playerClaim = c.playerMole ? makeClaim(c, c.guests[c.playerGuestId], null) : null;
  }
  function enterMeeting(c, reason) {
    if (!c || c.stage !== 'manor') return;
    c.stage = 'meeting'; c.lastMeetingReason = reason; c.meetingClock = 24; buildClaims(c);
    state.mode = c.playerMole ? 'mole_meeting' : 'meeting'; state.stage = 'meeting'; state.progress = 0;
    kit.audio.music('tension', 500); kit.audio.sfx('clue');
  }
  function evidenceForClaim(c, cl) {
    if (!cl) return [];
    var out = c.evidence.filter(function (e) { return e.target === cl.speaker || cl.witnesses.indexOf(e.target) >= 0; });
    return out.slice(Math.max(0, out.length - 4));
  }
  function alignmentHint(c) {
    var id = c.roleIds.detective;
    if (id == null) return null;
    var target = c.guests.filter(function (g) { return g.id !== id && g.alive && !g.missing; })[c.round % Math.max(1, activeGuests(c).length - 1)];
    return target ? { detective: id, target: target.id, mole: realMole(c, target.id) } : null;
  }
  function scoreSuspect(c, voter, suspect) {
    if (suspect === voter || !c.guests[suspect] || c.guests[suspect].missing) return -999;
    var score = c.guests[suspect].trust < 0 ? 1 : 0, cl = c.claims.filter(function (x) { return x.speaker === suspect; })[0], i, e;
    if (!cl) return score;
    var ev = evidenceForClaim(c, cl);
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      if (e.target === suspect) score += e.room === cl.room ? -0.7 * e.certainty : 3.4 * e.certainty;
      if (cl.witnesses.indexOf(e.target) >= 0 && e.room === cl.room) score -= 0.2;
    }
    var g = c.guests[voter], own = g ? g.memory.filter(function (m) { return m.target === suspect; }) : [];
    own.forEach(function (m) { score += m.room === cl.room ? -1.2 * m.certainty : 2.8 * m.certainty; });
    if (cl.copied >= 0) score += 0.25;
    if (g && g.role === 'detective') { var hint = alignmentHint(c); if (hint && hint.target === suspect) score += hint.mole ? 8 : -5; }
    return score * (g ? GUESTS[voter].logic : 0.7) + (g ? GUESTS[voter].bold * 0.12 : 0);
  }
  function aiVote(c, voter) {
    var candidates = activeGuests(c).map(function (g) { return g.id; }).filter(function (id) { return id !== voter; }), best = candidates[0], bestScore = -9999;
    candidates.forEach(function (id) { var s = scoreSuspect(c, voter, id); if (s > bestScore) { best = id; bestScore = s; } });
    return { voter: voter, suspect: best, weight: bestScore };
  }
  function resolveMeeting(c, playerVote) {
    if (!c || c.stage !== 'meeting') return;
    var votes = activeGuests(c).filter(function (g) { return g.id !== (c.playerMole ? c.playerGuestId : -1); }).map(function (g) { return aiVote(c, g.id); });
    if (playerVote >= 0) votes.push({ voter: -1, suspect: playerVote, weight: 6 });
    var tally = {}, i;
    votes.forEach(function (v) { tally[v.suspect] = (tally[v.suspect] || 0) + 1; });
    var chosen = -1, count = -1;
    Object.keys(tally).forEach(function (id) { if (tally[id] > count) { chosen = +id; count = tally[id]; } });
    if (chosen < 0) { c.health--; state.health = c.health; c.votes = votes; endCase(c, c.health > 0 && c.playerMole, 'No one held the floor.'); return; }
    c.votes = votes; c.selectedSuspect = chosen;
    if (c.playerMole) {
      if (chosen === c.playerGuestId) { endCase(c, false, 'Your alibi collapsed.'); return; }
      endCase(c, true, 'The table missed the hidden hand.'); return;
    }
    profile.votes++;
    var correct = realMole(c, chosen);
    if (correct) {
      profile.correctVotes++; c.score += 24; state.score = c.score; kit.juice.hitStop(110); kit.juice.shake(5, 220); kit.audio.sfx('catch');
      if (!c.playerMole) { c.caught.push(chosen); c.guests[chosen].alive = false; c.guests[chosen].missing = true; }
      toast(c, 'THE VOTE LANDED', PAL.mint, 1.1);
      var remaining = c.moleIds.filter(function (id) { return c.caught.indexOf(id) < 0; });
      if (!remaining.length) endCase(c, true, 'Every hidden hand is known.');
      else continueCase(c);
    } else {
      profile.dossiers[chosen].accused++; c.health = Math.max(0, c.health - 1); state.health = c.health; c.score = Math.max(0, c.score - 8); state.score = c.score;
      kit.audio.sfx('wrong'); kit.juice.shake(4, 180); toast(c, 'THE HOUSE DOUBTS YOU', PAL.rose, 1.0);
      if (c.health <= 0) endCase(c, false, 'The house no longer trusts your eye.'); else continueCase(c);
    }
  }
  function continueCase(c) {
    c.round++; c.stage = 'manor'; c.meetingClock = 24; c.nextSabotage = c.clock + 6; state.mode = c.playerMole ? 'mole' : 'manor'; state.stage = 'manor';
    kit.audio.music('manor', 500); recordSightings(c, c.playerRoom, 'direct', 'return');
  }
  function endCase(c, win, reason) {
    if (!c || c.stage === 'result') return;
    c.stage = 'result'; c.result = { win: !!win, reason: reason || '', time: c.clock, score: c.score };
    state.mode = 'result'; state.stage = 'result'; state.progress = win ? 1 : clamp(c.clock / c.config.limit, 0, 1); state.score = c.score;
    if (win && !c.playerMole) { profile.casesSolved++; profile.unlockedCase = Math.max(profile.unlockedCase, Math.min(12, c.index + 2)); }
    profile.casesPlayed++; profile.lastCase = { index: c.index, win: !!win, score: c.score, time: c.clock, moleSide: !!c.playerMole };
    (c.guests || []).forEach(function (g) { if (g.trust > 0 && profile.dossiers[g.id]) profile.dossiers[g.id].trusted++; });
    for (var ri = 0; ri < ROLE_NAMES.length; ri++) if (c.config.roles.indexOf(ROLE_NAMES[ri]) >= 0) profile.roles[ROLE_NAMES[ri]] = true;
    saveProfile(); kit.audio.music(win ? 'manor' : 'tension', 700); kit.audio.sfx(win ? 'reveal' : 'wrong');
    for (var i = 0; i < (win ? 46 : 14); i++) particle(W / 2, 380, win ? PAL.brass : PAL.rose);
  }
  function startCase(index, opts, moleSide) {
    kit.restart();
    var seed = ((Date.now() ^ ((index + 1) * 0x9e3779b9)) >>> 0);
    current = makeCase(index, opts, seed, !!moleSide); state.mode = moleSide ? 'mole' : 'manor'; state.stage = 'manor';
    state.progress = 0; state.score = 0; state.health = current.health; kit.audio.music('manor', 0); kit.audio.sfx('reveal');
  }

  var current = null, scene = null, zones = [], gestures = {}, particles = [], focus = 0, prevKeys = {};
  function particle(x, y, color) {
    if (!kit.juice.enabled) return;
    if (particles.length >= 140) particles.shift();
    var a = Math.random() * TAU, s = 35 + Math.random() * 120;
    particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.45 + Math.random() * 0.6, max: 1, color: color });
  }
  function updateParticles(dt) { particles.forEach(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }); particles = particles.filter(function (p) { return p.life > 0; }); }
  function ROOM_X(i) { return 20 + (i % 4) * 92 + 42; }
  function ROOM_Y(i) { return 142 + ((i / 4) | 0) * 88 + 33; }
  function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

  function ManorScene() { Phaser.Scene.call(this, { key: 'ManorScene' }); }
  ManorScene.prototype = Object.create(Phaser.Scene.prototype);
  ManorScene.prototype.constructor = ManorScene;
  ManorScene.prototype.create = function () {
    scene = this; this.cameras.main.setZoom(HIDPI_FACTOR); this.cameras.main.setBackgroundColor(PAL.ink);
    var sg = this.make.graphics({ x: 0, y: 0, add: false });
    sg.fillStyle(PAL.ink, 1); sg.fillRect(0, 0, W, H); sg.fillStyle(PAL.panel, 1); sg.fillRect(0, 96, W, 520); sg.fillRect(0, 716, W, 128);
    for (var i = 0; i < 16; i++) { var wing = WINGS[roomWing(i)]; sg.fillStyle(wing.color, 0.20); sg.fillRoundedRect(20 + (i % 4) * 92, 142 + ((i / 4) | 0) * 88, 84, 66, 10); }
    sg.lineStyle(3, PAL.line, 0.7);
    for (i = 0; i < ROOM_LINKS.length; i++) for (var j = 0; j < ROOM_LINKS[i].length; j++) if (ROOM_LINKS[i][j] > i) sg.lineBetween(ROOM_X(i), ROOM_Y(i), ROOM_X(ROOM_LINKS[i][j]), ROOM_Y(ROOM_LINKS[i][j]));
    sg.generateTexture('mm-static', W, H); sg.destroy();
    this.add.image(W / 2, H / 2, 'mm-static').setDepth(0);
    this.g = this.add.graphics().setDepth(3); this.fx = this.add.graphics().setDepth(8);
    this.labels = [];
    for (i = 0; i < 110; i++) this.labels.push(this.add.text(0, 0, '', { fontFamily: 'system-ui,sans-serif', fontSize: '14px', color: CSS.text, resolution: HIDPI_FACTOR }).setDepth(10).setVisible(false));
    this.boundary = this.add.rectangle(W / 2, 420, 310, 160, PAL.panel2, 0.98).setDepth(20).setVisible(false).setStrokeStyle(2, PAL.brass);
    this.boundaryText = this.add.text(W / 2, 420, '', { fontFamily: 'system-ui,sans-serif', fontSize: '28px', fontStyle: 'bold', color: CSS.brass, align: 'center', wordWrap: { width: 270 }, resolution: HIDPI_FACTOR }).setOrigin(0.5).setDepth(21).setVisible(false);
    installInput(); kit.loader.hide();
    window.__mm.actions = { start: function (n) { startCase(n == null ? 0 : n, null, false); }, startFree: function (o) { startCase(0, o || { title: 'Free Play', guests: 8, moles: 2, roles: ROLE_NAMES, limit: 60 }, false); }, startMole: function () { startCase(11, { title: 'Mole Side', guests: 8, moles: 2, roles: ROLE_NAMES, limit: 60 }, true); }, observe: function (room) { if (current) return recordSightings(current, room == null ? current.playerRoom : room, 'direct', 'hook'); }, openMeeting: function () { if (current) enterMeeting(current, 'hook'); }, selectClaim: function (n) { if (current) current.selectedClaim = clamp(n | 0, 0, Math.max(0, current.claims.length - 1)); }, vote: function (id) { if (current) resolveMeeting(current, id == null ? -1 : id); }, restart: function () { current = null; state.mode = 'menu'; state.stage = 'menu'; } };
    kit.audio.music('manor', 0); paint();
  };
  function installInput() {
    if (installInput.done) return; installInput.done = true;
    var canvas = scene.game.canvas;
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
    window.addEventListener('pointerdown', function (e) { if (kit.paused) return; var p = local(e); gestures[e.pointerId] = { x: p.x, y: p.y, zone: zoneAt(p.x, p.y) }; }, { passive: true });
    window.addEventListener('pointerup', function (e) { var d = gestures[e.pointerId]; delete gestures[e.pointerId]; if (!d || kit.paused) return; var p = local(e), z = zoneAt(p.x, p.y); if (z && z === d.zone) { kit.audio.sfx('tap'); activate(z); } });
    window.addEventListener('pointercancel', function (e) { delete gestures[e.pointerId]; });
  }
  function zoneAt(x, y) { for (var i = zones.length - 1; i >= 0; i--) { var z = zones[i]; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z; } return null; }
  function addZone(x, y, w, h, action, data) { zones.push({ x: x, y: y, w: w, h: h, action: action, data: data }); }
  function activate(z) {
    if (!z) return;
    if (z.action === 'settings') { kit.openSettings(); return; }
    if (z.action === 'campaign') startCase(z.data, null, false);
    else if (z.action === 'free') state.mode = 'free_setup';
    else if (z.action === 'mole') startCase(11, { title: 'Mole Side', guests: 8, moles: 2, roles: ROLE_NAMES, limit: 60 }, true);
    else if (z.action === 'dossiers') state.mode = 'dossiers';
    else if (z.action === 'menu') { current = null; state.mode = 'menu'; state.stage = 'menu'; kit.audio.music('manor', 500); }
    else if (z.action === 'freeGuests') freeConfig.guests = clamp(freeConfig.guests + z.data, 6, 8);
    else if (z.action === 'freeMoles') freeConfig.moles = clamp(freeConfig.moles + z.data, 1, 2);
    else if (z.action === 'freeRole') { var role = ROLE_NAMES[z.data]; freeConfig.roles = freeConfig.roles.indexOf(role) >= 0 ? freeConfig.roles.filter(function (x) { return x !== role; }) : freeConfig.roles.concat(role); }
    else if (z.action === 'freeStart') startCase(0, { title: 'Free Play', guests: freeConfig.guests, moles: freeConfig.moles, roles: freeConfig.roles, limit: 58 }, false);
    else if (z.action === 'back') state.mode = current && current.stage === 'manor' ? (current.playerMole ? 'mole' : 'manor') : 'menu';
    else if (z.action === 'move') movePlayer(current, z.data);
    else if (z.action === 'observe') recordSightings(current, z.data == null ? current.playerRoom : z.data, 'direct', 'observe');
    else if (z.action === 'task') doTask(current);
    else if (z.action === 'meeting') enterMeeting(current, 'called');
    else if (z.action === 'notebook') state.mode = 'notebook';
    else if (z.action === 'claim') current.selectedClaim = z.data;
    else if (z.action === 'cross') state.cross = !state.cross;
    else if (z.action === 'vote') resolveMeeting(current, z.data);
    else if (z.action === 'next') { if (current && current.result && current.result.win && !current.playerMole) startCase(Math.min(11, current.index + 1), null, false); else state.mode = 'menu'; }
    else if (z.action === 'again') startCase(current ? current.index : 0, current ? current.config : null, current ? current.playerMole : false);
  }
  var freeConfig = { guests: 8, moles: 2, roles: ['detective', 'saboteur', 'mimic'] };

  function text(t, x, y, size, color, align, bold) {
    var o = scene.labels[labelCursor++]; if (!o) return; o.setVisible(true); if (o.text !== String(t)) o.setText(String(t)); o.setPosition(x, y); o.setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5); o.setStyle({ fontFamily: 'system-ui,sans-serif', fontSize: size + 'px', fontStyle: bold ? 'bold' : 'normal', color: typeof color === 'number' ? hex(color) : (color || CSS.text), align: align || 'center', resolution: HIDPI_FACTOR }); }
  function box(x, y, w, h, fill, stroke, radius) { scene.g.fillStyle(fill, 1); scene.g.fillRoundedRect(x, y, w, h, radius || 10); if (stroke) { scene.g.lineStyle(2, stroke, 1); scene.g.strokeRoundedRect(x, y, w, h, radius || 10); } }
  function button(x, y, w, h, label, action, data, color, disabled) { box(x, y, w, h, disabled ? PAL.panel : PAL.panel2, disabled ? PAL.line : (color || PAL.line), 12); text(label, x + w / 2, y + h / 2 + 1, 15, disabled ? PAL.dim : (color || PAL.text), 'center', true); if (!disabled) addZone(x, y, w, h, action, data); }
  function chip(x, y, label, color, width) { box(x, y, width || 104, 28, color || PAL.panel2, color || PAL.line, 14); text(label, x + (width || 104) / 2, y + 14, 13, PAL.ink, 'center', true); }
  function guestIcon(g, x, y, scale, ghost) {
    var col = ghost ? PAL.line : GUESTS[g.id].color, s = scale || 1; scene.g.fillStyle(col, 1);
    scene.g.fillCircle(x, y - 9 * s, 7 * s);
    if (g.shape % 3 === 0) scene.g.fillRoundedRect(x - 9 * s, y - 1 * s, 18 * s, 22 * s, 5 * s);
    else if (g.shape % 3 === 1) scene.g.fillTriangle(x - 11 * s, y + 18 * s, x + 11 * s, y + 18 * s, x, y - 1 * s);
    else scene.g.fillRoundedRect(x - 11 * s, y, 22 * s, 15 * s, 8 * s);
    scene.g.lineStyle(2, ghost ? PAL.dim : PAL.ink, 0.7); scene.g.strokeCircle(x, y - 9 * s, 8 * s);
  }
  var labelCursor = 0;
  function beginPaint() { zones.length = 0; labelCursor = 0; scene.g.clear(); scene.fx.clear(); scene.labels.forEach(function (o) { o.setVisible(false); }); }
  function drawHeader(title, subtitle) {
    text(title, 18, 25, 20, PAL.brass, 'left', true); text(subtitle || '', 18, 53, 14, PAL.dim, 'left', false);
    button(336, 10, 44, 44, '⚙', 'settings', null, PAL.line, false);
  }
  function paintMenu() {
    beginPaint(); scene.g.fillStyle(PAL.ink, 1); scene.g.fillRect(0, 0, W, H);
    text('MOLEHUNT', W / 2, 84, 39, PAL.brass, 'center', true); text('MANOR', W / 2, 124, 31, PAL.text, 'center', true);
    text('A house of claims, sightings and quiet doors.', W / 2, 162, 14, PAL.dim, 'center', false);
    box(28, 204, 334, 120, PAL.panel2, PAL.brass, 18);
    text('CASE ' + String(profile.unlockedCase).padStart(2, '0'), 48, 235, 16, PAL.brass, 'left', true);
    text(CASES[profile.unlockedCase - 1].title, 48, 264, 20, PAL.text, 'left', true);
    text('Guests ' + CASES[profile.unlockedCase - 1].guests + '  /  Moles ' + CASES[profile.unlockedCase - 1].moles, 48, 294, 14, PAL.dim, 'left', false);
    button(28, 344, 334, 56, 'ENTER THE MANOR', 'campaign', profile.unlockedCase - 1, PAL.mint, false);
    button(28, 414, 162, 54, 'FREE PLAY', 'free', null, PAL.sky, false); button(200, 414, 162, 54, 'MOLE SIDE', 'mole', null, PAL.rose, false);
    button(28, 484, 334, 48, 'GUEST DOSSIERS', 'dossiers', null, PAL.violet, false);
    text('Solved ' + profile.casesSolved + ' / 12    Accuracy ' + (profile.votes ? Math.round(profile.correctVotes / profile.votes * 100) : 0) + '%', W / 2, 586, 15, PAL.text, 'center', true);
    text('No purchases  •  No network  •  Single player', W / 2, 616, 14, PAL.dim, 'center', false);
    text('Tap a case. Read the room. Trust the record.', W / 2, 790, 14, PAL.brass, 'center', false);
  }
  function paintFreeSetup() {
    beginPaint(); drawHeader('FREE PLAY', 'Build the house rules');
    text('CONFIGURE THE CASE', W / 2, 110, 19, PAL.text, 'center', true);
    box(24, 142, 342, 76, PAL.panel2, PAL.line, 12); text('GUESTS', 44, 165, 14, PAL.dim, 'left', true); text(String(freeConfig.guests), 195, 180, 26, PAL.text, 'center', true);
    button(268, 158, 42, 44, '-', 'freeGuests', -1, PAL.sky, freeConfig.guests <= 6); button(316, 158, 42, 44, '+', 'freeGuests', 1, PAL.sky, freeConfig.guests >= 8);
    box(24, 232, 342, 76, PAL.panel2, PAL.line, 12); text('MOLES', 44, 255, 14, PAL.dim, 'left', true); text(String(freeConfig.moles), 195, 270, 26, PAL.text, 'center', true);
    button(268, 248, 42, 44, '-', 'freeMoles', -1, PAL.rose, freeConfig.moles <= 1); button(316, 248, 42, 44, '+', 'freeMoles', 1, PAL.rose, freeConfig.moles >= 2);
    text('SPECIAL ROLES', W / 2, 348, 16, PAL.brass, 'center', true);
    ROLE_NAMES.forEach(function (role, i) { var on = freeConfig.roles.indexOf(role) >= 0; button(28, 372 + i * 58, 334, 46, (on ? '●  ' : '○  ') + role.toUpperCase(), 'freeRole', i, on ? PAL.mint : PAL.line, false); });
    button(28, 578, 334, 58, 'START FREE CASE', 'freeStart', null, PAL.mint, false); button(28, 654, 334, 48, 'BACK', 'menu', null, PAL.line, false);
  }
  function paintDossiers() {
    beginPaint(); drawHeader('GUEST DOSSIERS', 'Patterns persist between cases');
    GUESTS.forEach(function (g, i) { var x = 20 + (i % 2) * 178, y = 100 + ((i / 2) | 0) * 116, d = profile.dossiers[i]; box(x, y, 168, 98, PAL.panel, PAL.line, 12); guestIcon({ id: i, shape: g.shape }, x + 20, y + 40, 0.75, false); text(g.name, x + 42, y + 28, 14, PAL.text, 'left', true); text('Seen ' + d.seen, x + 42, y + 53, 13, PAL.dim, 'left', false); text('Trusted ' + d.trusted, x + 42, y + 74, 13, PAL.mint, 'left', false); });
    button(28, 752, 334, 54, 'BACK TO MANOR', 'menu', null, PAL.brass, false);
  }
  function paintManor() {
    beginPaint(); var c = current, live = c.stage === 'manor'; drawHeader(c.playerMole ? 'MOLE SIDE' : 'MOLEHUNT MANOR', 'Case ' + String(c.index + 1).padStart(2, '0') + '  •  ' + fmtTime(c.clock));
    chip(188, 12, '❤ ' + c.health, c.health <= 1 ? PAL.rose : PAL.mint, 72); chip(266, 48, 'NOTE ' + c.notebook.length, PAL.sky, 106);
    for (var i = 0; i < 16; i++) { var x = 20 + (i % 4) * 92, y = 142 + ((i / 4) | 0) * 88, wing = WINGS[roomWing(i)], here = c.playerRoom === i, linked = distance(c.playerRoom, i), done = c.roomDone[i]; box(x, y, 84, 66, here ? wing.color : PAL.panel, here ? wing.accent : PAL.line, 10); if (linked && live && !here) { scene.g.lineStyle(3, PAL.brass, 0.8); scene.g.strokeRoundedRect(x + 3, y + 3, 78, 60, 8); addZone(x, y, 84, 66, 'move', i); } text(roomName(i), x + 7, y + 15, 12, here ? PAL.ink : PAL.text, 'left', true); text(done ? '✓ DONE' : 'TASK', x + 7, y + 54, 12, done ? PAL.mint : wing.accent, 'left', true); if (!done && here && live) { scene.g.fillStyle(PAL.brass, 1); scene.g.fillCircle(x + 70, y + 50, 5); } }
    c.guests.forEach(function (g) { if (!g.alive && !g.missing) return; if (g.room >= 0) { var gx = ROOM_X(g.room) - 22 + (g.id % 3) * 20, gy = ROOM_Y(g.room) + 11 + ((g.id / 3) | 0) * 5; guestIcon(g, gx, gy, 0.6, g.missing); } });
    scene.g.fillStyle(PAL.brass, 1); scene.g.fillCircle(ROOM_X(c.playerRoom), ROOM_Y(c.playerRoom) + 28, 6); scene.g.lineStyle(2, PAL.ink, 1); scene.g.strokeCircle(ROOM_X(c.playerRoom), ROOM_Y(c.playerRoom) + 28, 7);
    text(WINGS[0].name, 22, 112, 12, WINGS[0].accent, 'left', true); text(WINGS[1].name, 116, 112, 12, WINGS[1].accent, 'left', true); text(WINGS[2].name, 210, 112, 12, WINGS[2].accent, 'left', true); text(WINGS[3].name, 304, 112, 12, WINGS[3].accent, 'left', true);
    if (c.tutorial && c.clock < 5) { box(20, 626, 350, 30, PAL.panel2, PAL.brass, 14); text(c.playerMole ? 'Sabotage, move, then survive the vote.' : 'Move along a sightline. Every witness enters the notebook.', W / 2, 641, 13, PAL.brass, 'center', false); }
    if (c.toast) chip(235, 660, c.toast.text, c.toast.color, 135);
    button(20, 690, 106, 52, 'OBSERVE', 'observe', c.playerRoom, PAL.sky, false); button(138, 690, 106, 52, 'DO TASK', 'task', null, PAL.mint, c.roomDone[c.playerRoom]); button(256, 690, 114, 52, 'NOTEBOOK', 'notebook', null, PAL.violet, false);
    button(20, 760, 350, 58, 'CALL THE MEETING', 'meeting', null, PAL.brass, !live || c.notebook.length < 2);
    if (c.playerMole && live) { text('YOU ARE THE MOLE', 195, 844 - 12, 13, PAL.rose, 'center', true); }
  }
  function paintNotebook() {
    beginPaint(); var c = current; drawHeader('EVIDENCE NOTEBOOK', 'Sightings are time stamped automatically');
    box(18, 84, 354, 628, PAL.panel, PAL.line, 14); text('ROOM RECORD', 36, 110, 15, PAL.brass, 'left', true);
    var arr = c.notebook.slice().reverse(), start = Math.max(0, arr.length - 14); if (!arr.length) text('No sightings yet.', 195, 170, 16, PAL.dim, 'center', false);
    arr.slice(start).forEach(function (e, i) { var y = 132 + i * 38; scene.g.fillStyle(e.kind === 'body' ? PAL.rose : PAL.panel2, e.kind === 'body' ? 0.2 : 1); scene.g.fillRoundedRect(30, y, 330, 30, 8); text(fmtTime(e.t), 42, y + 16, 13, PAL.dim, 'left', true); text(e.kind === 'body' ? 'BODY  ' + shortName(e.target) : shortName(e.target) + ' in ' + roomName(e.room), 95, y + 16, 14, e.kind === 'body' ? PAL.rose : PAL.text, 'left', true); text(e.source === 'move' ? 'direct' : 'sightline', 346, y + 16, 12, PAL.dim, 'right', false); });
    text('Compare these records with claims in the meeting.', W / 2, 742, 14, PAL.dim, 'center', false); button(28, 770, 334, 52, 'RETURN TO FLOOR', 'back', null, PAL.brass, false);
  }
  function paintMeeting() {
    beginPaint(); var c = current, mole = c.playerMole; drawHeader(mole ? 'THE MOLE TABLE' : 'THE NIGHT TABLE', 'Claims ' + fmtTime(c.meetingClock) + '  •  select one to compare');
    chip(20, 72, mole ? 'FRAME A GUEST' : 'NAME A MOLE', mole ? PAL.rose : PAL.brass, 148); if (c.roleIds.detective != null) { var hint = alignmentHint(c); if (hint) text('Detective note: ' + shortName(hint.target) + ' is ' + (hint.mole ? 'not clean' : 'clean'), 370, 86, 13, hint.mole ? PAL.rose : PAL.mint, 'right', true); }
    c.claims.forEach(function (cl, i) { var y = 110 + i * 48, sel = i === c.selectedClaim, g = c.guests[cl.speaker]; box(20, y, 350, 42, sel ? PAL.panel2 : PAL.panel, sel ? PAL.brass : PAL.line, 9); guestIcon(g, 42, y + 27, 0.46, false); text(shortName(cl.speaker), 60, y + 15, 14, PAL.text, 'left', true); text('claims ' + roomName(cl.room), 60, y + 32, 13, PAL.dim, 'left', false); if (cl.copied >= 0) text('↗', 344, y + 22, 17, PAL.violet, 'center', true); addZone(20, y, 350, 42, 'claim', i); });
    var cl = c.claims[c.selectedClaim], ev = evidenceForClaim(c, cl); box(20, 510, 350, 154, PAL.panel2, PAL.line, 12); text('COMPARE RECORDS', 34, 534, 14, PAL.brass, 'left', true); if (cl) { text(shortName(cl.speaker) + ': ' + cl.line, 34, 558, 13, PAL.text, 'left', false); ev.slice(0, 3).forEach(function (e, i) { text(fmtTime(e.t) + '  ' + (e.kind === 'body' ? 'body record' : roomName(e.room) + ' sighting'), 34, 586 + i * 22, 13, e.kind === 'body' ? PAL.rose : PAL.sky, 'left', false); }); } else text('Select a claim.', 34, 568, 14, PAL.dim, 'left', false);
    button(20, 680, 146, 48, state.cross ? 'CLOSE RECORD' : 'OPEN RECORD', 'cross', null, PAL.sky, false); button(180, 680, 190, 48, cl ? (mole ? 'FRAME ' + shortName(cl.speaker).toUpperCase() : 'VOTE ' + shortName(cl.speaker).toUpperCase()) : 'SELECT CLAIM', 'vote', cl ? cl.speaker : -1, mole ? PAL.rose : PAL.brass, !cl || c.meetingClock <= 0);
    text('One record at a time. You decide what conflicts.', W / 2, 752, 13, PAL.dim, 'center', false); button(20, 770, 350, 52, 'ABSTAIN', 'vote', -1, PAL.line, false);
  }
  function paintResult() {
    beginPaint(); var c = current, win = c.result && c.result.win; scene.boundary.setVisible(true).setScale(kit.juice.enabled ? 1.02 + Math.min(0.04, c.clock * 0.001) : 1); scene.boundaryText.setVisible(true).setText(win ? 'CASE CLOSED' : 'THE MANOR GOES DARK').setColor(win ? CSS.mint : CSS.rose); scene.boundaryText.setPosition(195, 386);
    text(win ? 'The hidden hands are known.' : 'A claim survived the house.', 195, 494, 16, PAL.dim, 'center', false); text('SCORE  ' + c.score, 195, 536, 21, PAL.brass, 'center', true); text(c.result ? c.result.reason : '', 195, 570, 14, PAL.dim, 'center', false);
    var who = c.moleIds.map(function (id) { return shortName(id); }).join('  /  '); text('MOLE RECORD  ' + who, 195, 622, 14, PAL.rose, 'center', true);
    button(28, 674, 334, 56, win && !c.playerMole && c.index < 11 ? 'NEXT CASE' : 'RUN IT BACK', win && !c.playerMole && c.index < 11 ? 'next' : 'again', null, win ? PAL.mint : PAL.rose, false); button(28, 746, 334, 48, 'CASE FILES', 'menu', null, PAL.brass, false);
  }
  function paint() {
    if (!scene) return; scene.boundary.setVisible(false); scene.boundaryText.setVisible(false);
    if (state.mode === 'menu') paintMenu(); else if (state.mode === 'free_setup') paintFreeSetup(); else if (state.mode === 'dossiers') paintDossiers(); else if (state.mode === 'notebook') paintNotebook(); else if (state.mode === 'meeting' || state.mode === 'mole_meeting') paintMeeting(); else if (state.mode === 'result') paintResult(); else if (current) paintManor(); else paintMenu();
    var shake = kit.juice.frame(); scene.cameras.main.setScroll(0, 0); if (shake.dx || shake.dy) { scene.cameras.main.setScroll(shake.dx, shake.dy); }
    for (var i = 0; i < particles.length; i++) { var p = particles[i]; scene.fx.fillStyle(p.color, clamp(p.life / p.max, 0, 1)); scene.fx.fillCircle(p.x, p.y, 2 + p.life * 3); }
  }

  ManorScene.prototype.update = function (time, delta) {
    var force = window.__mm.forceMode || state.forceMode;
    var forcedStage = window.__mm.forceStage != null ? window.__mm.forceStage : state.forceStage;
    if (force) { window.__mm.forceMode = null; state.forceMode = null; window.__mm.forceStage = null; state.forceStage = null; if (force === 'menu') { current = null; state.mode = 'menu'; } else if (force === 'manor' && !current) startCase(safeInt(forcedStage, 0, 11), null, false); else if (force === 'mole' && !current) startCase(11, { title: 'Mole Side', guests: 8, moles: 2, roles: ROLE_NAMES, limit: 60 }, true); else if (force === 'meeting' && current) enterMeeting(current, 'force'); else if (force === 'notebook' && current) state.mode = 'notebook'; }
    if ((window.__mm.forceStage != null || state.forceStage != null) && !current) { var st = safeInt(window.__mm.forceStage != null ? window.__mm.forceStage : state.forceStage, 0, 11); window.__mm.forceStage = null; state.forceStage = null; startCase(st, null, false); }
    var keyNames = ['Enter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'];
    keyNames.forEach(function (k) { var down = kit.input.keyDown(k); if (down && !prevKeys[k]) { if (k === 'Escape') activate({ action: current && current.stage === 'manor' ? 'notebook' : 'menu' }); else if (k === 'Enter' || k === 'Space') { var z = zones[focus]; if (z) activate(z); } else if (k.indexOf('Arrow') === 0) focus = (focus + (k === 'ArrowLeft' || k === 'ArrowUp' ? zones.length - 1 : 1)) % Math.max(1, zones.length); } prevKeys[k] = down; });
    if (!kit.paused) {
      var dt = Math.min(0.1, (delta || 0) / 1000); this.acc = (this.acc || 0) + dt; var steps = 0, frozen = kit.juice.frame().frozen;
      while (this.acc >= STEP && steps < 4) { if (!frozen && current) { if (current.stage === 'manor') advanceManor(current, STEP); else if (current.stage === 'meeting') { current.meetingClock = Math.max(0, current.meetingClock - STEP); if (current.meetingClock <= 0) resolveMeeting(current, -1); } } updateParticles(STEP); this.acc -= STEP; steps++; }
    }
    paint();
  };

  var game = new Phaser.Game({ type: Phaser.CANVAS, parent: document.body, width: Math.round(W * HIDPI_FACTOR), height: Math.round(H * HIDPI_FACTOR), transparent: false,
    render: Object.assign({}, window.GGKit.renderDefaults), scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: Math.round(W * HIDPI_FACTOR), height: Math.round(H * HIDPI_FACTOR) }, scene: [ManorScene] });
  window.__mm.game = game; window.__mm.state = state;
  // Nothing here ever registered the service worker, so the title had a
  // manifest and an sw.js but no offline capability at all.
  kit.registerPWA();
}());
