/* Runeline Depths - simulation.
 * Pure state machine: board, move resolution, party maths, enemy skills,
 * dungeon flow, and the persisted profile. No engine, no DOM, no rendering.
 * The view reads edges from the plan objects this module returns and never
 * writes back into sim state.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  var T = RD.TUNE;
  var W = T.W, H = T.H, CELLS = W * H;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function idx(r, c) { return r * W + c; }
  function rowOf(i) { return (i / W) | 0; }
  function colOf(i) { return i % W; }
  RD.idx = idx; RD.rowOf = rowOf; RD.colOf = colOf;

  /* deterministic stream, so a Descent seed always builds the same run */
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  RD.rng = rng;

  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  RD.hashStr = hashStr;

  /* ------------------------------------------------------------ profile */
  var DEFAULT_TEAM = ['trail-ember', 'trail-storm', 'trail-tide', 'trail-moss', 'trail-ember'];

  function safeInt(v, lo, hi, fb) {
    return (typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi) ? v : fb;
  }

  RD.defaultProfile = function () {
    return {
      v: RD.SAVE_VERSION,
      runes: 0,
      roster: [],
      evo: {},
      team: DEFAULT_TEAM.slice(),
      cleared: {},
      tutorial: 0,
      descent: { day: '', rooms: 0, best: 0, cleared: false },
      stats: { rooms: 0, dungeons: 0, bestCombo: 0, turns: 0 }
    };
  };

  /* Every keyed lookup against dynamic content is guarded; unknown ids are
     dropped rather than trusted. */
  RD.validateProfile = function (p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
    return safeInt(p.v, 1, 99, 0) === RD.SAVE_VERSION;
  };

  RD.normalizeProfile = function (raw) {
    var d = RD.defaultProfile();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
    d.runes = safeInt(raw.runes, 0, 9999999, 0);

    var roster = Array.isArray(raw.roster) ? raw.roster.filter(RD.knownGuard) : [];
    var seen = {};
    d.roster = roster.filter(function (id) {
      if (seen[id]) return false; seen[id] = 1;
      /* starters are always owned and never live in the roster list */
      return RD.RUNEGUARDS.some(function (g) { return g.id === id; });
    }).slice(0, 24);

    d.evo = {};
    if (raw.evo && typeof raw.evo === 'object' && !Array.isArray(raw.evo)) {
      for (var k in raw.evo) {
        if (!Object.prototype.hasOwnProperty.call(raw.evo, k)) continue;
        if (!RD.canEvolve(k)) continue;
        if (d.roster.indexOf(k) < 0) continue;
        if (raw.evo[k] === 1 || raw.evo[k] === true) d.evo[k] = 1;
      }
    }

    var owned = RD.STARTERS.map(function (g) { return g.id; }).concat(d.roster);
    var team = Array.isArray(raw.team) ? raw.team.filter(function (id) {
      return RD.knownGuard(id) && owned.indexOf(id) >= 0;
    }) : [];
    while (team.length < T.party) team.push(DEFAULT_TEAM[team.length % DEFAULT_TEAM.length]);
    d.team = team.slice(0, T.party);

    d.cleared = {};
    if (raw.cleared && typeof raw.cleared === 'object' && !Array.isArray(raw.cleared)) {
      RD.DUNGEONS.forEach(function (dg) {
        var n = safeInt(raw.cleared[dg.id], 0, 9999, 0);
        if (n > 0) d.cleared[dg.id] = n;
      });
    }
    d.tutorial = safeInt(raw.tutorial, 0, RD.TUTORIAL.length, 0);

    var de = raw.descent;
    d.descent = { day: '', rooms: 0, best: 0, cleared: false };
    if (de && typeof de === 'object' && !Array.isArray(de)) {
      d.descent.day = typeof de.day === 'string' ? de.day.slice(0, 12) : '';
      d.descent.rooms = safeInt(de.rooms, 0, 12, 0);
      d.descent.best = safeInt(de.best, 0, 12, 0);
      d.descent.cleared = de.cleared === true;
    }
    var st = raw.stats;
    d.stats = { rooms: 0, dungeons: 0, bestCombo: 0, turns: 0 };
    if (st && typeof st === 'object' && !Array.isArray(st)) {
      d.stats.rooms = safeInt(st.rooms, 0, 9999999, 0);
      d.stats.dungeons = safeInt(st.dungeons, 0, 9999999, 0);
      d.stats.bestCombo = safeInt(st.bestCombo, 0, 999, 0);
      d.stats.turns = safeInt(st.turns, 0, 9999999, 0);
    }
    return d;
  };

  RD.ownedGuards = function (p) {
    return RD.STARTERS.map(function (g) { return g.id; }).concat(p.roster);
  };
  RD.evoLevel = function (p, id) { return p.evo && p.evo[id] === 1 ? 1 : 0; };
  RD.dungeonUnlocked = function (p, dg) {
    if (dg.id === 1) return true;
    return (p.cleared[dg.id - 1] || 0) > 0;
  };
  RD.highestUnlocked = function (p) {
    var last = 1;
    for (var i = 0; i < RD.DUNGEONS.length; i++) {
      if (RD.dungeonUnlocked(p, RD.DUNGEONS[i])) last = RD.DUNGEONS[i].id;
    }
    return last;
  };

  /* ------------------------------------------------------------- board */
  function pickOrb(rnd, heartWeight) {
    var hw = heartWeight == null ? 1 : heartWeight;
    /* five elements at weight 1, heart at hw */
    var total = 5 + hw;
    var r = rnd() * total;
    if (r >= 5) return 'heart';
    return RD.ELEMENTS[Math.min(4, r | 0)];
  }

  function lineMatches(board) {
    var out = {}, r, c, start, color;
    for (r = 0; r < H; r++) {
      for (c = 0; c < W;) {
        color = board[idx(r, c)]; start = c;
        while (c < W && board[idx(r, c)] === color) c++;
        if (color && c - start >= 3) for (var x = start; x < c; x++) out[idx(r, x)] = 1;
      }
    }
    for (c = 0; c < W; c++) {
      for (r = 0; r < H;) {
        color = board[idx(r, c)]; start = r;
        while (r < H && board[idx(r, c)] === color) r++;
        if (color && r - start >= 3) for (var y = start; y < r; y++) out[idx(y, c)] = 1;
      }
    }
    return out;
  }

  /* Connected same-colour components inside the matched set. Each one is a
     single combo, which is what the combo counter shows. */
  function groupsOf(board, matched) {
    var seen = {}, groups = [], stack = [];
    for (var key in matched) {
      var i0 = key | 0;
      if (seen[i0]) continue;
      var color = board[i0];
      var cells = [];
      stack.length = 0; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        var i = stack.pop();
        cells.push(i);
        var r = rowOf(i), c = colOf(i);
        var nb = [];
        if (r > 0) nb.push(idx(r - 1, c));
        if (r < H - 1) nb.push(idx(r + 1, c));
        if (c > 0) nb.push(idx(r, c - 1));
        if (c < W - 1) nb.push(idx(r, c + 1));
        for (var n = 0; n < nb.length; n++) {
          var j = nb[n];
          if (!seen[j] && matched[j] && board[j] === color) { seen[j] = 1; stack.push(j); }
        }
      }
      groups.push({ color: color, cells: cells });
    }
    return groups;
  }

  function collapse(board, matched, rnd, heartWeight) {
    var falls = [], spawns = [], c, r;
    for (c = 0; c < W; c++) {
      var write = H - 1;
      for (r = H - 1; r >= 0; r--) {
        var i = idx(r, c);
        if (matched[i]) continue;
        if (write !== r) {
          falls.push({ col: c, from: r, to: write, color: board[i] });
          board[idx(write, c)] = board[i];
        }
        write--;
      }
      for (r = write; r >= 0; r--) {
        var col = pickOrb(rnd, heartWeight);
        board[idx(r, c)] = col;
        spawns.push({ col: c, row: r, color: col, depth: write - r + 1 });
      }
    }
    return { falls: falls, spawns: spawns };
  }

  function seedBoard(board, rnd, heartWeight) {
    for (var tries = 0; tries < 40; tries++) {
      for (var i = 0; i < CELLS; i++) board[i] = pickOrb(rnd, heartWeight);
      var m = lineMatches(board);
      var any = false;
      for (var k in m) { any = true; break; }
      if (!any) return;
    }
  }

  /* -------------------------------------------------------------- party */
  function buildParty(profile, hpScale) {
    var out = [];
    for (var i = 0; i < profile.team.length; i++) {
      var id = profile.team[i];
      var s = RD.guardStats(id, RD.evoLevel(profile, id));
      var maxHp = Math.round(s.hp * (hpScale || 1));
      out.push({
        id: s.id, name: s.name, el: s.el, atk: s.atk,
        maxHp: maxHp, hp: maxHp, evolved: s.evolved,
        skill: s.active, cd: s.active ? s.active.cd : 0, ready: false,
        slot: i, leader: i === 0
      });
    }
    return out;
  }

  /* ------------------------------------------------------------ enemies */
  function skillOf(e, k) {
    for (var i = 0; i < e.skills.length; i++) if (e.skills[i].k === k) return e.skills[i];
    return null;
  }

  /* Health tuning. The prototype hp curve (92 + 31 * level) is preserved as
     the shape; these two scalars set how many turns a room and a boss take
     against a party that has grown at the authored rate. */
  var ROOM_HP = 0.62, BOSS_HP = 0.74;

  function makeFoe(enemyId, level, mods) {
    var e = RD.enemy(enemyId);
    var hp = Math.round((T.hpBase + T.hpStep * level) * e.hpMul * (e.boss ? BOSS_HP : ROOM_HP));
    var atk = Math.round((T.atkBase + T.atkStep * level) * e.atkMul * ((mods && mods.atk) || 1));
    var sh = skillOf(e, 'shield');
    var ar = skillOf(e, 'armour');
    var charge = Math.max(1, e.charge + ((mods && mods.charge) || 0));
    return {
      id: e.id, name: e.name, el: e.el, shape: e.shape, boss: !!e.boss,
      level: level, maxHp: hp, hp: hp, atk: atk, baseAtk: atk,
      charge: charge, chargeMax: charge, turn: 0,
      shieldMax: sh ? Math.round(hp * sh.hp) : 0,
      shield: sh ? Math.round(hp * sh.hp) : 0,
      shieldCombo: sh ? sh.v : 0,
      armour: (ar ? ar.v : 0) + ((mods && mods.armour) || 0),
      armourSuppressed: 0,
      enraged: false,
      skills: e.skills,
      mendsLeft: skillOf(e, 'mend') ? 3 : 0
    };
  }

  /* --------------------------------------------------------------- run */
  /* opts: { profile, dungeon, descent:{seed, mod, rooms}, } */
  RD.createRun = function (opts) {
    var profile = opts.profile;
    var descent = opts.descent || null;
    var mod = descent ? descent.mod : null;
    var dungeon = opts.dungeon || null;
    var seed = opts.seed != null ? opts.seed : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

    var run = {
      kind: descent ? 'descent' : 'dungeon',
      dungeon: dungeon,
      descent: descent,
      mod: mod,
      depth: dungeon ? dungeon.depth : (mod && mod.depth) || 'core',
      rnd: rng(seed),
      seed: seed,
      board: new Array(CELLS),
      party: null,
      shield: 0,
      halveNext: false,
      blockNext: false,
      binds: {},          /* colour id -> turns remaining */
      bonusTime: 0,
      roomIndex: 0,
      roomList: [],
      foe: null,
      mode: 'idle',       /* idle | drag | resolve | over */
      over: null,         /* 'clear' | 'wipe' */
      turn: 0,
      combo: 0,
      bestCombo: 0,
      firstHit: true,
      firstEmber: true,
      moveTime: (mod && mod.timer) || T.moveTime,
      timer: 0,
      path: [],
      held: -1,
      runesEarned: 0,
      roomsCleared: 0,
      log: null
    };

    if (descent) {
      run.roomList = descent.rooms.slice();
      run.depthList = descent.depths ? descent.depths.slice() : null;
    } else {
      run.roomList = dungeon.rooms.map(function (id, i) {
        return { enemy: id, level: dungeon.base + i, boss: false };
      });
      run.roomList.push({ enemy: dungeon.boss, level: dungeon.base + dungeon.rooms.length, boss: true });
    }

    run.party = buildParty(profile, (mod && mod.hp) || 1);
    seedBoard(run.board, run.rnd, mod && mod.heartWeight);
    return run;
  };

  RD.enterRoom = function (run) {
    var room = run.roomList[run.roomIndex];
    if (!room) { run.mode = 'over'; run.over = 'clear'; return null; }
    run.foe = makeFoe(room.enemy, room.level, run.mod);
    run.foe.isBoss = !!room.boss || run.foe.boss;
    run.turn = 0;
    run.firstHit = true;
    run.firstEmber = true;
    run.binds = {};
    run.mode = 'idle';
    var events = [];
    if (run.mod && run.mod.openBind) {
      var c = RD.ELEMENTS[(run.rnd() * RD.ELEMENTS.length) | 0];
      run.binds[c] = 3;
      events.push({ t: 'bind', color: c, turns: 3 });
    }
    var pre = skillOf(run.foe, 'preempt');
    if (pre) {
      var dmg = Math.round(run.foe.atk * pre.v);
      var res = applyEnemyDamage(run, dmg);
      events.push({ t: 'preempt', dmg: res.dealt, wipe: res.wipe });
    }
    return { room: room, events: events };
  };

  /* ---------------------------------------------------------- dragging */
  RD.beginDrag = function (run, i) {
    if (run.mode !== 'idle') return false;
    if (i < 0 || i >= CELLS) return false;
    run.mode = 'drag';
    run.held = i;
    run.path.length = 0;
    run.path.push(i);
    run.timer = Math.max(2, run.moveTime + run.bonusTime);
    run.bonusTime = 0;
    return true;
  };

  /* Move the held orb into a neighbouring cell, swapping what was there. */
  RD.dragTo = function (run, i) {
    if (run.mode !== 'drag') return false;
    var from = run.held;
    if (i === from || i < 0 || i >= CELLS) return false;
    var dr = Math.abs(rowOf(i) - rowOf(from)), dc = Math.abs(colOf(i) - colOf(from));
    if (dr + dc !== 1) return false;
    if (run.path.length >= T.maxPath) return false;
    var tmp = run.board[from];
    run.board[from] = run.board[i];
    run.board[i] = tmp;
    run.held = i;
    run.path.push(i);
    return true;
  };

  RD.tickDrag = function (run, dt) {
    if (run.mode !== 'drag') return false;
    run.timer -= dt;
    if (run.timer <= 0) { run.timer = 0; return true; }
    return false;
  };

  RD.cancelDrag = function (run) {
    if (run.mode !== 'drag') return;
    /* unwind the swaps in reverse so a cancel is lossless */
    for (var i = run.path.length - 1; i > 0; i--) {
      var a = run.path[i], b = run.path[i - 1];
      var t = run.board[a]; run.board[a] = run.board[b]; run.board[b] = t;
    }
    run.path.length = 0;
    run.held = -1;
    run.mode = 'idle';
  };

  /* --------------------------------------------------------- resolution */
  function leaderId(run) { return run.party[0] ? run.party[0].id : ''; }
  function leaderEvolved(run) { return !!(run.party[0] && run.party[0].evolved); }

  function livingParty(run) {
    return run.party.filter(function (m) { return m.hp > 0; });
  }

  function applyEnemyDamage(run, raw) {
    var living = livingParty(run);
    if (!living.length) return { dealt: 0, wipe: true, absorbed: 0 };
    var reduction = 1;
    var lid = leaderId(run), evo = leaderEvolved(run);
    if (lid === 'trail-moss') reduction *= 0.88;
    if (lid === 'root-rumbler') reduction *= evo ? 0.74 : 0.82;
    var total = Math.max(1, Math.round(raw * reduction));
    if (run.halveNext) { total = Math.max(1, Math.round(total * 0.5)); run.halveNext = false; }
    var absorbed = 0;
    if (run.shield > 0) {
      absorbed = Math.min(run.shield, total);
      run.shield -= absorbed;
      total -= absorbed;
    }
    var each = total / living.length;
    for (var i = 0; i < living.length; i++) {
      living[i].hp = Math.max(0, living[i].hp - each);
    }
    var wipe = livingParty(run).length === 0;
    return { dealt: Math.round(total), absorbed: absorbed, wipe: wipe };
  }

  function healParty(run, frac) {
    var healed = 0;
    for (var i = 0; i < run.party.length; i++) {
      var m = run.party[i];
      if (m.hp <= 0) continue;          /* downed guards stay down for the room */
      var before = m.hp;
      m.hp = clamp(m.hp + m.maxHp * frac, 0, m.maxHp);
      healed += m.hp - before;
    }
    return Math.round(healed);
  }
  RD.healParty = healParty;

  function damageFoe(run, amount, ignoreArmour) {
    var foe = run.foe;
    var dmg = amount;
    if (!ignoreArmour && foe.armour > 0 && foe.armourSuppressed <= 0) dmg *= (1 - foe.armour);
    dmg = Math.max(1, Math.round(dmg));
    var toShield = 0;
    if (foe.shield > 0) {
      toShield = Math.min(foe.shield, dmg);
      foe.shield -= toShield;
      dmg -= toShield;
    }
    foe.hp = Math.max(0, foe.hp - dmg);
    return { hp: dmg, shield: toShield };
  }

  /* The whole player turn: resolve every match, cascade, then the party
     strike, then the enemy action. Returns a plan the view animates. */
  RD.endDrag = function (run) {
    if (run.mode !== 'drag') return null;
    var moved = run.path.length > 1;
    run.path.length = 0;
    run.held = -1;
    if (!moved) { run.mode = 'idle'; return { empty: true, noMove: true }; }

    run.mode = 'resolve';
    run.turn++;

    var beats = [], combo = 0;
    var boardBefore = run.board.slice();
    var colorOrbs = {};   /* colour -> orbs cleared this turn */
    var heartOrbs = 0;
    var guard = 0;
    var board = run.board;
    var heartWeight = run.mod && run.mod.heartWeight;

    while (guard < T.maxCascade) {
      var matched = lineMatches(board);
      var any = false;
      for (var k in matched) { any = true; break; }
      if (!any) break;
      var groups = groupsOf(board, matched);
      var beatCells = [];
      for (var g = 0; g < groups.length; g++) {
        combo++;
        var grp = groups[g];
        if (grp.color === 'heart') heartOrbs += grp.cells.length;
        else colorOrbs[grp.color] = (colorOrbs[grp.color] || 0) + grp.cells.length;
        for (var q = 0; q < grp.cells.length; q++) beatCells.push(grp.cells[q]);
      }
      var moves = collapse(board, matched, run.rnd, heartWeight);
      beats.push({
        cascade: guard,
        groups: groups.map(function (x) { return { color: x.color, cells: x.cells.slice() }; }),
        cleared: beatCells,
        falls: moves.falls,
        spawns: moves.spawns,
        comboAfter: combo,
        /* snapshot so the view can animate each cascade step without ever
           writing into sim state */
        board: board.slice()
      });
      guard++;
    }

    var colors = Object.keys(colorOrbs);
    var lid = leaderId(run), levo = leaderEvolved(run);

    /* leader combo grants */
    var effCombo = combo;
    if (combo > 0) {
      if (lid === 'trail-storm' && colors.length >= 3) effCombo += 1;
      if (lid === 'veil-vireo' && colors.length >= 3) effCombo += levo ? 2 : 1;
    }

    /* --- party damage --------------------------------------------- */
    var offEl = T.offEl;
    if (lid === 'opal-owl') offEl += levo ? 0.58 : 0.40;
    var base = 0;
    var living = livingParty(run);
    for (var i = 0; i < living.length; i++) {
      var m = living[i];
      var n = colorOrbs[m.el] || 0;
      if (n > 0) base += m.atk * T.onEl * (1 + T.lengthStep * (n - 3));
      else if (combo > 0) base += m.atk * offEl;
    }
    var mult = 1 + Math.max(0, effCombo - 1) * T.comboStep;
    if (lid === 'thunder-mite') mult += effCombo * (levo ? 0.17 : 0.12);
    if (lid === 'cinder-crown' && colors.length >= 2) mult *= levo ? 2.3 : 2.0;
    if (lid === 'gale-gourmand' && effCombo >= 4) mult *= levo ? 1.5 : 1.35;
    if (lid === 'ash-antler' && colorOrbs.ember) mult *= levo ? 1.62 : 1.45;
    if (lid === 'rill-raven' && colorOrbs.tide) mult *= levo ? 1.74 : 1.55;
    if (lid === 'trail-ember' && colorOrbs.ember && run.firstEmber) { mult *= 1.30; run.firstEmber = false; }
    if (lid === 'flare-fawn' && run.firstHit) mult *= levo ? 1.80 : 1.50;

    var damage = combo > 0 ? Math.max(1, Math.round(base * mult)) : 0;

    /* bound colours contribute combo but no damage */
    var boundLoss = 0;
    for (var bc in run.binds) {
      if (colorOrbs[bc]) {
        var share = 0;
        for (var j = 0; j < living.length; j++) if (living[j].el === bc) share += living[j].atk * T.onEl;
        boundLoss += Math.round(share * mult);
      }
    }
    if (boundLoss > 0) damage = Math.max(combo > 0 ? 1 : 0, damage - boundLoss);

    /* --- healing --------------------------------------------------- */
    var healFrac = 0;
    if (heartOrbs > 0) healFrac += T.heartHeal * heartOrbs;
    if (colorOrbs.tide) {
      if (lid === 'trail-tide') healFrac += 0.18;
      if (lid === 'brine-bloom') healFrac += levo ? 0.28 : 0.20;
    }
    if (lid === 'fern-fang' && colors.length >= 3) healFrac += levo ? 0.13 : 0.08;
    var healed = healFrac > 0 ? healParty(run, healFrac) : 0;

    /* --- shields --------------------------------------------------- */
    var shieldGain = 0;
    if (lid === 'moon-marrow' && colors.length >= 2) {
      var pool = run.party.reduce(function (s, x) { return s + x.maxHp; }, 0);
      shieldGain = Math.round(pool * (levo ? 0.20 : 0.12));
      run.shield += shieldGain;
    }

    /* --- apply to the foe ------------------------------------------ */
    var shieldBroke = false;
    var hit = { hp: 0, shield: 0 };
    if (damage > 0) {
      run.firstHit = false;
      if (run.foe.shield > 0 && run.foe.shieldCombo > 0 && effCombo >= run.foe.shieldCombo) {
        run.foe.shield = 0;
        shieldBroke = true;
      }
      hit = damageFoe(run, damage);
    }

    if (run.foe.armourSuppressed > 0) run.foe.armourSuppressed--;
    for (var bk in run.binds) {
      run.binds[bk]--;
      if (run.binds[bk] <= 0) delete run.binds[bk];
    }

    run.combo = combo;
    if (effCombo > run.bestCombo) run.bestCombo = effCombo;

    var plan = {
      boardBefore: boardBefore,
      beats: beats, combo: combo, effCombo: effCombo,
      colors: colors, colorOrbs: colorOrbs, heartOrbs: heartOrbs,
      damage: damage, dealt: hit.hp, toShield: hit.shield,
      shieldBroke: shieldBroke, healed: healed, shieldGain: shieldGain,
      boundLoss: boundLoss,
      foeDown: run.foe.hp <= 0,
      enemy: null, wipe: false, roomCleared: false, runComplete: false
    };

    if (plan.foeDown) {
      plan.roomCleared = true;
      run.roomsCleared++;
      run.runesEarned += RD.RUNES_PER_ROOM;
      if (run.roomIndex >= run.roomList.length - 1) plan.runComplete = true;
      return plan;
    }

    plan.enemy = RD.enemyTurn(run);
    if (plan.enemy && plan.enemy.wipe) plan.wipe = true;
    return plan;
  };

  /* ------------------------------------------------------- enemy turn */
  RD.enemyTurn = function (run) {
    var foe = run.foe;
    foe.turn++;

    var enr = skillOf(foe, 'enrage');
    var enraged = false;
    if (enr && !foe.enraged && foe.hp / foe.maxHp <= enr.at) {
      foe.enraged = true;
      foe.atk = Math.round(foe.baseAtk * enr.v);
      enraged = true;
    }

    var mend = skillOf(foe, 'mend');
    if (mend && foe.mendsLeft > 0 && foe.hp / foe.maxHp <= mend.at) {
      foe.mendsLeft--;
      var amt = Math.round(foe.maxHp * mend.v);
      foe.hp = Math.min(foe.maxHp, foe.hp + amt);
      foe.charge = foe.chargeMax;
      return { act: 'mend', amount: amt, enraged: enraged, wipe: false };
    }

    foe.charge--;
    if (foe.charge > 0) return { act: 'charge', enraged: enraged, wipe: false };
    foe.charge = foe.chargeMax;

    var bind = skillOf(foe, 'bind');
    if (bind && foe.turn % Math.max(1, bind.every) === 0) {
      var present = {};
      for (var i = 0; i < CELLS; i++) if (run.board[i] !== 'heart') present[run.board[i]] = 1;
      var opts = Object.keys(present).filter(function (c) { return !run.binds[c]; });
      if (opts.length) {
        var c = opts[(run.rnd() * opts.length) | 0];
        run.binds[c] = bind.v;
        return { act: 'bind', color: c, turns: bind.v, enraged: enraged, wipe: false };
      }
    }

    var tl = skillOf(foe, 'timelock');
    if (tl && foe.turn % Math.max(1, tl.every) === 0) {
      run.bonusTime = -tl.v;
      return { act: 'timelock', amount: tl.v, enraged: enraged, wipe: false };
    }

    if (run.blockNext) {
      run.blockNext = false;
      return { act: 'blocked', enraged: enraged, wipe: false };
    }

    var res = applyEnemyDamage(run, foe.atk * (1 + foe.level * T.enemyFloorScale));
    return { act: 'attack', dmg: res.dealt, absorbed: res.absorbed, enraged: enraged, wipe: res.wipe };
  };

  /* -------------------------------------------------------- room flow */
  RD.advanceRoom = function (run) {
    run.roomIndex++;
    if (run.roomIndex >= run.roomList.length) {
      run.mode = 'over'; run.over = 'clear';
      return null;
    }
    return RD.enterRoom(run);
  };

  RD.retryRoom = function (run) {
    for (var i = 0; i < run.party.length; i++) run.party[i].hp = run.party[i].maxHp;
    run.shield = 0;
    run.halveNext = false;
    run.blockNext = false;
    run.bonusTime = 0;
    for (var j = 0; j < run.party.length; j++) run.party[j].cd = run.party[j].skill ? run.party[j].skill.cd : 0;
    seedBoard(run.board, run.rnd, run.mod && run.mod.heartWeight);
    return RD.enterRoom(run);
  };

  RD.readyTurn = function (run) {
    if (run.mode === 'resolve') run.mode = 'idle';
    for (var i = 0; i < run.party.length; i++) {
      var m = run.party[i];
      if (m.cd > 0) m.cd--;
    }
  };

  /* ------------------------------------------------------ active skills */
  RD.skillReady = function (m) { return m.hp > 0 && m.skill && m.cd <= 0; };

  function convertOrbs(run, count, to) {
    var pool = [];
    for (var i = 0; i < CELLS; i++) if (run.board[i] !== to) pool.push(i);
    var out = [];
    for (var n = 0; n < count && pool.length; n++) {
      var p = (run.rnd() * pool.length) | 0;
      var cell = pool.splice(p, 1)[0];
      run.board[cell] = to;
      out.push(cell);
    }
    return out;
  }

  RD.useSkill = function (run, slot) {
    var m = run.party[slot];
    if (!m || !RD.skillReady(m)) return null;
    if (run.mode !== 'idle') return null;
    var s = m.skill, out = { id: s.id, name: s.name, slot: slot, cells: null, amount: 0 };
    switch (s.id) {
      case 'spark-shift': out.cells = convertOrbs(run, 3, 'ember'); break;
      case 'coal-surge': out.cells = convertOrbs(run, 5, 'ember'); break;
      case 'undertow': out.cells = convertOrbs(run, 5, 'tide'); break;
      case 'prism-call': out.cells = convertOrbs(run, 4, 'aether'); break;
      case 'bloom-tide':
        out.cells = [];
        for (var i = 0; i < CELLS; i++) if (run.board[i] === 'heart') { run.board[i] = 'tide'; out.cells.push(i); }
        break;
      case 'dew-veil': out.amount = healParty(run, 0.18); break;
      case 'green-echo-a': out.amount = healParty(run, 0.24); break;
      case 'bark-wall': run.halveNext = true; break;
      case 'deep-root': run.blockNext = true; break;
      case 'jolt': run.bonusTime += 2; break;
      case 'static-web': run.bonusTime += 3; break;
      case 'veil-sight': run.binds = {}; break;
      case 'pressure-cut':
        run.foe.shield = 0; run.foe.armourSuppressed = 2; out.amount = 0; break;
      case 'quiet-ward':
        out.amount = Math.round(run.party.reduce(function (a, x) { return a + x.maxHp; }, 0) * 0.4);
        run.shield += out.amount; break;
      case 'crown-burn':
        out.amount = damageFoe(run, m.atk * 4).hp; out.foeHit = true; break;
      case 'bright-rake-a':
        out.amount = damageFoe(run, m.atk * 6, true).hp; out.foeHit = true; break;
      default: return null;
    }
    m.cd = s.cd;
    out.foeDown = run.foe && run.foe.hp <= 0;
    if (out.foeDown) {
      run.roomsCleared++;
      run.runesEarned += RD.RUNES_PER_ROOM;
      out.roomCleared = true;
      out.runComplete = run.roomIndex >= run.roomList.length - 1;
    }
    return out;
  };

  /* ------------------------------------------------------- descent seed */
  RD.todayKey = function (now) {
    var d = now ? new Date(now) : new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  };

  RD.buildDescent = function (dayKey) {
    var seed = hashStr('runeline-descent-' + dayKey);
    var r = rng(seed);
    var mod = RD.DESCENT_MODS[(r() * RD.DESCENT_MODS.length) | 0];
    var rooms = [], depths = [];
    var base = 12 + ((r() * 10) | 0);
    for (var i = 0; i < 5; i++) {
      var id = RD.DESCENT_POOL[(r() * RD.DESCENT_POOL.length) | 0];
      rooms.push({ enemy: id, level: base + i * 3, boss: false });
      depths.push(RD.DEPTHS[(r() * RD.DEPTHS.length) | 0].id);
    }
    var bossId = RD.DESCENT_BOSSES[(r() * RD.DESCENT_BOSSES.length) | 0];
    rooms.push({ enemy: bossId, level: base + 16, boss: true });
    depths.push(RD.DEPTHS[3].id);
    return { day: dayKey, seed: seed, mod: mod, rooms: rooms, depths: depths };
  };

  /* --------------------------------------------------------- rewards */
  RD.grantDungeonClear = function (profile, dungeon, run) {
    var first = !(profile.cleared[dungeon.id] > 0);
    profile.cleared[dungeon.id] = (profile.cleared[dungeon.id] || 0) + 1;
    var runes = run.runesEarned + RD.dungeonReward(dungeon, first);
    profile.runes += runes;
    profile.stats.dungeons++;
    profile.stats.rooms += run.roomsCleared;
    if (run.bestCombo > profile.stats.bestCombo) profile.stats.bestCombo = run.bestCombo;
    var drop = null;
    if (first && dungeon.drop && RD.knownGuard(dungeon.drop) && profile.roster.indexOf(dungeon.drop) < 0) {
      profile.roster.push(dungeon.drop);
      drop = dungeon.drop;
    }
    return { runes: runes, drop: drop, first: first };
  };

  RD.evolveCost = function (guardId) {
    var dg = null;
    for (var i = 0; i < RD.DUNGEONS.length; i++) {
      if (RD.DUNGEONS[i].drop === guardId) { dg = RD.DUNGEONS[i]; break; }
    }
    var tier = dg ? RD.dungeonTier(dg) : 0;
    return RD.EVO_COST[clamp(tier, 0, RD.EVO_COST.length - 1)];
  };

  RD.canAffordEvolve = function (profile, guardId) {
    if (!RD.canEvolve(guardId)) return false;
    if (profile.roster.indexOf(guardId) < 0) return false;
    if (RD.evoLevel(profile, guardId) >= 1) return false;
    return profile.runes >= RD.evolveCost(guardId);
  };

  RD.doEvolve = function (profile, guardId) {
    if (!RD.canAffordEvolve(profile, guardId)) return false;
    profile.runes -= RD.evolveCost(guardId);
    profile.evo[guardId] = 1;
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
