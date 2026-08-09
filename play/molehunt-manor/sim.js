/* Molehunt Manor - simulation & deduction model. All original content. */
(function () {
  'use strict';
  var MH = (window.MH = window.MH || {});

  MH.ROOMS = [
    { n: 'Library', w: 0 }, { n: 'Study', w: 0 }, { n: 'Sun Room', w: 0 }, { n: 'Gallery', w: 0 },
    { n: 'Blue Room', w: 1 }, { n: 'Nursery', w: 1 }, { n: 'Music Rm', w: 1 }, { n: 'Linen Store', w: 1 },
    { n: 'Kitchen', w: 2 }, { n: 'Pantry', w: 2 }, { n: 'Scullery', w: 2 }, { n: 'Laundry', w: 2 },
    { n: 'Cellar', w: 3 }, { n: 'Boiler Rm', w: 3 }, { n: 'Ballroom', w: 3 }, { n: 'Strong Rm', w: 3 }
  ];
  MH.WINGS = [
    { n: 'UPPER', r: [0, 1, 2, 3] },
    { n: 'GUEST', r: [4, 5, 6, 7] },
    { n: 'SERVICE', r: [8, 9, 10, 11] },
    { n: 'LOWER', r: [12, 13, 14, 15] }
  ];
  MH.NR = 16;
  MH.STAFF = ['Ada Vell', 'Bram Otis', 'Cleo Nash', 'Dorian Pike', 'Esme Rook',
    'Fitz Malloy', 'Greta Solm', 'Hale Brint', 'Iris Fenn', 'Jorah Quill'];

  MH.TASKS = [
    ['reshelving atlases', 'oiling the map drawer', 'dusting the ledgers'],
    ['sorting seed catalogues', 'inking the day book', 'trimming quill nibs'],
    ['misting the ferns', 'repotting a fig', 'sweeping glass grit'],
    ['re-hanging a portrait', 'waxing the frames', 'logging the inventory'],
    ['airing the bedding', 'laying a fresh fire', 'beating the rug'],
    ['winding the cot mobile', 'shelving picture books', 'scrubbing hand marks'],
    ['tuning the piano wires', 'sorting sheet music', 'dusting the harp'],
    ['counting pillowcases', 'mending a torn hem', 'stacking towels'],
    ['kneading the loaf dough', 'scouring copper pans', 'basting the roast'],
    ['counting flour sacks', 'labelling preserves', 'stacking crates'],
    ['scrubbing the deep sink', 'wringing wash cloths', 'sorting cutlery'],
    ['feeding the mangle', 'starching collars', 'folding bed linen'],
    ['turning the wine racks', 'chalking barrel dates', 'sweeping the stone floor'],
    ['banking the furnace', 'checking pressure dials', 'greasing the valve wheel'],
    ['waxing the parquet', 'straightening chairs', 'polishing the sconces'],
    ['re-tallying the plate', 'oiling the lock bolts', 'sealing a ledger box']
  ];
  MH.FAKETASKS = [
    ['waving a rag at a shelf already dusted', 'flipping one page over and over'],
    ['scribbling nothing into a closed book', 'shuffling blank paper'],
    ['tipping an empty watering can', 'poking dry soil with a bare finger'],
    ['straightening a frame that was straight', 'buffing glass with a dry thumb'],
    ['patting a pillow that needs nothing', 'poking a fire that is not lit'],
    ['winding a mobile that is already wound', 'reshelving one book, twice'],
    ['pressing keys with the lid shut', 'shuffling music they never read'],
    ['refolding one towel again and again', 'threading a needle with no thread'],
    ['stirring an empty pot', 'wiping a pan that was never used'],
    ['recounting one sack six times', 'moving a crate back and forth'],
    ['rinsing a clean plate again', 'dabbing a dry cloth'],
    ['cranking a mangle with nothing in it', 'refolding the same sheet'],
    ['turning a rack with no bottles', 'chalking over yesterday\'s date'],
    ['tapping a dial that never moved', 'miming a valve turn'],
    ['buffing a board with no wax', 'nudging a chair a finger-width'],
    ['counting plate that is already counted', 'jiggling a bolt that is already shut']
  ];
  MH.SABOTAGE = [
    'cutting the lamp circuit', 'jamming the door locks', 'spoiling the roast',
    'loosening a stair tread', 'draining the pressure line'
  ];

  MH.DIFFS = [
    { n: 'CALM', d: 'Alarm board pins one wing. Sloppy alibis.', wings: 1, wingEvery: 1, smart: 0.0, noise: 0 },
    { n: 'SHREWD', d: 'Alarm narrows to two wings. Half their alibis hold.', wings: 2, wingEvery: 1, smart: 0.5, noise: 1 },
    { n: 'DEVIOUS', d: 'Two wings, and the alarm only works every other round.', wings: 2, wingEvery: 2, smart: 1.0, noise: 2 }
  ];

  MH.ROUNDS = 6;
  MH.OBS_PER_ROUND = 2;
  MH.Q_PER_ROUND = 2;

  // status
  MH.UNKNOWN = 0; MH.EXPOSED = 1; MH.CLEARED = 2; MH.CAUGHT = 3;

  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  MH.rngFrom = rngFrom;

  function pick(rnd, arr) { return arr[(rnd() * arr.length) | 0]; }
  function shuffled(rnd, arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = (rnd() * (i + 1)) | 0; t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- case ---------- */

  MH.newCase = function (diff, seed) {
    var rnd = rngFrom(seed);
    var order = shuffled(rnd, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    var c = {
      diff: diff, seed: seed, rnd: rnd,
      moles: [order[0], order[1]],
      caught: [false, false],
      round: 0,                 // 0-based
      obsLeft: MH.OBS_PER_ROUND,
      qLeft: MH.Q_PER_ROUND,
      rounds: [],               // per-round world (capped at MH.ROUNDS)
      status: new Array(10),    // per staff
      verdict: [],              // verdict[r][id] 0 none 1 verified 2 lie
      stmts: [],                // capped
      conf: new Array(10),      // conflict counts
      lastObs: null,
      obsRooms: {},             // 'r:room' -> true
      over: 0                   // 0 running, 1 win, 2 loss
    };
    var i;
    for (i = 0; i < 10; i++) { c.status[i] = MH.UNKNOWN; c.conf[i] = 0; }
    MH.buildRound(c);
    return c;
  };

  MH.isMole = function (c, id) { return c.moles[0] === id || c.moles[1] === id; };
  MH.activeMoles = function (c) {
    var a = [];
    if (!c.caught[0]) a.push(c.moles[0]);
    if (!c.caught[1]) a.push(c.moles[1]);
    return a;
  };

  MH.buildRound = function (c) {
    var rnd = c.rnd, r = c.round, i, k;
    var active = MH.activeMoles(c);
    var D = MH.DIFFS[c.diff];
    var W = {
      r: r, place: new Array(10), claim: new Array(10), task: new Array(10),
      fake: new Array(10), sabRoom: -1, saboteur: -1, act: '', wing: -1, alert: false
    };
    for (i = 0; i < 10; i++) { W.place[i] = -1; W.claim[i] = -1; W.task[i] = ''; W.fake[i] = 0; }

    var NR = MH.NR;
    var saboteur = active.length ? active[r % active.length] : -1;
    var sabRoom = (rnd() * NR) | 0;
    W.saboteur = saboteur; W.sabRoom = sabRoom;
    W.act = pick(rnd, MH.SABOTAGE);
    W.wing = MH.ROOMS[sabRoom].w;
    W.alert = (r % D.wingEvery) === 0;
    W.wings = [];
    if (W.alert) {
      W.wings.push(W.wing);
      var wl = shuffled(rnd, [0, 1, 2, 3]);
      for (k = 0; k < wl.length && W.wings.length < D.wings; k++) {
        if (wl[k] !== W.wing) W.wings.push(wl[k]);
      }
      W.wings.sort();
    }

    // place everyone (detained staff sit out)
    var pool = [];
    for (i = 0; i < 10; i++) {
      if (c.status[i] === MH.CAUGHT) continue;
      if (i === saboteur) continue;
      pool.push(i);
    }
    pool = shuffled(rnd, pool);
    var all = [];
    for (i = 0; i < NR; i++) all.push(i);
    var roomOrder = shuffled(rnd, all);
    var count = [];
    for (i = 0; i < NR; i++) count.push(0);
    if (saboteur >= 0) { W.place[saboteur] = sabRoom; count[sabRoom]++; }
    for (i = 0; i < pool.length; i++) {
      var best = -1;
      for (k = 0; k < NR; k++) {
        var rm = roomOrder[(i + k) % NR];
        if (count[rm] < 2) { best = rm; break; }
      }
      if (best < 0) best = roomOrder[i % NR];
      W.place[pool[i]] = best; count[best]++;
    }

    // claims + tasks
    for (i = 0; i < 10; i++) {
      if (W.place[i] < 0) continue;
      W.claim[i] = W.place[i];
      W.task[i] = pick(rnd, MH.TASKS[W.place[i]]);
    }
    // saboteur lies about location and is caught in the act if seen
    if (saboteur >= 0) {
      var opts = [];
      for (k = 0; k < NR; k++) if (k !== sabRoom && count[k] > 0) opts.push(k);
      if (!opts.length) for (k = 0; k < NR; k++) if (k !== sabRoom) opts.push(k);
      W.claim[saboteur] = pick(rnd, opts);
      W.task[saboteur] = pick(rnd, MH.TASKS[W.claim[saboteur]]);
      W.fake[saboteur] = 2; // caught in the act
    }
    // the other mole blends in but fakes their work
    for (i = 0; i < active.length; i++) {
      var m = active[i];
      if (m === saboteur || W.place[m] < 0) continue;
      W.fake[m] = 1;
    }

    c.rounds.push(W);
    while (c.rounds.length > MH.ROUNDS) c.rounds.shift();
    c.verdict[r] = new Array(10);
    for (i = 0; i < 10; i++) c.verdict[r][i] = 0;
    return W;
  };

  MH.world = function (c) { return c.rounds[c.rounds.length - 1]; };

  MH.claimedIn = function (W, room) {
    var a = [], i;
    for (i = 0; i < 10; i++) if (W.claim[i] === room) a.push(i);
    return a;
  };
  MH.actualIn = function (W, room) {
    var a = [], i;
    for (i = 0; i < 10; i++) if (W.place[i] === room) a.push(i);
    return a;
  };

  MH.inAlert = function (W, room) {
    return !!W.alert && W.wings.indexOf(MH.ROOMS[room].w) >= 0;
  };
  MH.alertText = function (W) {
    if (!W.alert) return 'ALARM BOARD DEAD — LOCATION UNKNOWN';
    var a = [], i;
    for (i = 0; i < W.wings.length; i++) a.push(MH.WINGS[W.wings[i]].n);
    return 'SABOTAGE SIGNAL — ' + a.join(' OR ') + ' WING' + (a.length > 1 ? 'S' : '');
  };

  /* ---------- observing ---------- */

  MH.observe = function (c, room) {
    if (c.over || c.obsLeft <= 0) return null;
    var W = MH.world(c), r = c.round;
    if (c.obsRooms[r + ':' + room]) return null;
    c.obsLeft--;
    c.obsRooms[r + ':' + room] = true;
    var rows = [], i, caughtAny = false;
    var present = MH.actualIn(W, room);
    for (i = 0; i < present.length; i++) {
      var id = present[i], kind, txt;
      if (W.fake[id] === 2) {
        kind = 2; txt = 'caught ' + W.act + ' — log says ' + MH.ROOMS[W.claim[id]].n;
      } else if (W.fake[id] === 1) {
        kind = 2; txt = 'faking it: ' + pick(c.rnd, MH.FAKETASKS[room]);
      } else {
        kind = 1; txt = W.task[id] + ' — matches the log';
      }
      if (kind === 2) caughtAny = true;
      c.verdict[r][id] = kind;
      if (kind === 2) { if (c.status[id] !== MH.CAUGHT) c.status[id] = MH.EXPOSED; }
      else if (c.status[id] === MH.UNKNOWN) c.status[id] = MH.CLEARED;
      rows.push({ id: id, kind: kind, t: txt });
    }
    var claim = MH.claimedIn(W, room);
    for (i = 0; i < claim.length; i++) {
      var q = claim[i];
      if (W.place[q] === room) continue;
      c.verdict[r][q] = 2;
      if (c.status[q] !== MH.CAUGHT) c.status[q] = MH.EXPOSED;
      caughtAny = true;
      rows.push({ id: q, kind: 2, t: 'NO-SHOW — the log posted them here' });
    }
    var res = { r: r, room: room, rows: rows, hit: caughtAny };
    c.lastObs = res;
    return res;
  };

  /* ---------- questioning ---------- */

  function nameOf(id) { return MH.STAFF[id]; }

  MH.question = function (c, id) {
    if (c.over || c.qLeft <= 0) return null;
    var W = MH.world(c), r = c.round, i;
    if (W.place[id] < 0) return null;
    var k;
    for (k = 0; k < c.stmts.length; k++) {
      if (c.stmts[k].r === r && c.stmts[k].sp === id) return null;
    }
    c.qLeft--;
    var D = MH.DIFFS[c.diff];
    var mole = MH.isMole(c, id) && c.status[id] !== MH.CAUGHT;
    var room, seen = [], line;

    if (!mole) {
      room = W.place[id];
      var co = MH.actualIn(W, room);
      for (i = 0; i < co.length; i++) if (co[i] !== id) seen.push(co[i]);
      if (seen.length === 0) {
        line = 'I was alone in the ' + MH.ROOMS[room].n + ', ' + W.task[id] + '.';
      } else {
        line = 'I was in the ' + MH.ROOMS[room].n + ', ' + W.task[id] + '. ' +
          listNames(seen) + (seen.length > 1 ? ' were' : ' was') + ' in there with me.';
      }
    } else {
      room = W.claim[id];
      var smart = c.rnd() < D.smart;
      var pool = [];
      for (i = 0; i < 10; i++) {
        if (i === id || W.place[i] < 0) continue;
        var consistent = (W.claim[i] === room);
        if (smart ? consistent : !consistent) pool.push(i);
      }
      if (!pool.length) {
        for (i = 0; i < 10; i++) if (i !== id && W.place[i] >= 0) pool.push(i);
      }
      if (smart) {
        seen = pool.slice(0, 3);
      } else {
        seen = [pick(c.rnd, pool)];
      }
      if (seen.length === 0) line = 'I was alone in the ' + MH.ROOMS[room].n + '. Nothing to tell.';
      else line = 'I never left the ' + MH.ROOMS[room].n + '. ' + listNames(seen) +
        (seen.length > 1 ? ' can' : ' can') + ' vouch for me.';
      if (D.noise > 1 && c.rnd() < 0.5) {
        var t = -1;
        for (i = 0; i < 10; i++) {
          if (i !== id && !MH.isMole(c, i) && c.status[i] === MH.UNKNOWN) { t = i; break; }
        }
        if (t >= 0) line += ' Ask why ' + nameOf(t) + ' keeps drifting off, though.';
      }
    }

    // conflicts vs the public log
    var conflicts = [];
    for (i = 0; i < seen.length; i++) {
      if (W.claim[seen[i]] !== room) conflicts.push(seen[i]);
    }
    var cl = MH.claimedIn(W, room);
    for (i = 0; i < cl.length; i++) {
      var q = cl[i];
      if (q === id) continue;
      if (seen.indexOf(q) < 0) conflicts.push(q);
    }
    var st = { r: r, sp: id, room: room, seen: seen, line: line, conf: conflicts };
    for (i = 0; i < conflicts.length; i++) {
      c.conf[conflicts[i]]++;
      c.conf[id]++;
    }
    c.stmts.push(st);
    while (c.stmts.length > 48) c.stmts.shift();
    return st;
  };

  function listNames(ids) {
    var a = [], i;
    for (i = 0; i < ids.length; i++) a.push(nameOf(ids[i]));
    if (a.length === 1) return a[0];
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  MH.listNames = listNames;

  MH.statementsFor = function (c, id) {
    var a = [], i;
    for (i = 0; i < c.stmts.length; i++) if (c.stmts[i].sp === id) a.push(c.stmts[i]);
    return a;
  };

  /* ---------- accusation & rounds ---------- */

  MH.accuse = function (c, id) {
    if (c.over || c.status[id] === MH.CAUGHT || c.status[id] === MH.CLEARED) return null;
    if (MH.isMole(c, id)) {
      c.caught[c.moles[0] === id ? 0 : 1] = true;
      c.status[id] = MH.CAUGHT;
      if (c.caught[0] && c.caught[1]) { c.over = 1; return { ok: true, win: true }; }
      return { ok: true, win: false };
    }
    c.status[id] = MH.CLEARED;
    MH.endRound(c, true);
    return { ok: false, win: false };
  };

  MH.endRound = function (c, forced) {
    if (c.over) return;
    c.round++;
    if (c.round >= MH.ROUNDS) {
      if (c.caught[0] && c.caught[1]) c.over = 1; else c.over = 2;
      return;
    }
    c.obsLeft = MH.OBS_PER_ROUND;
    c.qLeft = MH.Q_PER_ROUND;
    c.lastObs = null;
    MH.buildRound(c);
  };

  MH.suspects = function (c) {
    var n = 0, i;
    for (i = 0; i < 10; i++) if (c.status[i] === MH.UNKNOWN || c.status[i] === MH.EXPOSED) n++;
    return n;
  };
})();
