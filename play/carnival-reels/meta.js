/* Carnival Reels - progression, economy and persistence.
   Pure data plus guarded validation; no engine and no DOM. The Carnival Tour,
   per machine level tracks, prize collections, the Bonus Rush ladder, the
   daily wheel and the free top up all live here. */
(function (root) {
  'use strict';

  var SAVE_VERSION = 3;
  var START_BANK = 1000;
  var BETS = [1, 2, 5, 10, 20, 50, 100];
  var MACHINE_IDS = ['orchard', 'ghost', 'cascade', 'midway', 'carousel'];

  // Level track: cumulative spins on that machine. 12 levels per machine.
  var LEVEL_XP = [0, 8, 20, 36, 58, 86, 120, 162, 212, 272, 342, 424];
  var LEVEL_COINS = [0, 250, 400, 600, 850, 1150, 1500, 1900, 2400, 3000, 3800, 5000];
  var TICKET_LEVELS = [2, 4, 6, 8, 10, 12];   // one prize ticket per even level
  var UNLOCK_LEVEL = 3;                       // reach level 3 to open the next machine
  var SET_BONUS = 6000;                       // completing a machine's six tickets

  var TICKET_NAMES = {
    orchard: ['Ripe Star', 'Brass Bell', 'Cider Cup', 'Sunset Kite', 'Hill Lantern', 'Golden Bough'],
    ghost: ['Signal Lamp', 'Rusted Key', 'Whistle', 'Coal Token', 'Pale Portrait', 'Last Carriage'],
    cascade: ['Facet Chip', 'Mirror Shard', 'Prism Key', 'Cobalt Drop', 'Coral Bloom', 'Crown Prism'],
    midway: ['Ride Stub', 'Popcorn Scoop', 'Rubber Duck', 'Long Balloon', 'Silk Hat', 'Ringmaster Pin'],
    carousel: ['Brass Ring', 'Painted Mane', 'Candy Twist', 'Organ Pipe', 'Canopy Bulb', 'Grand Crown']
  };

  var MACHINE_TITLES = {
    orchard: 'Orchard Classic', ghost: 'Ghost Train', cascade: 'Gem Cascade',
    midway: 'Midway Ways', carousel: 'Grand Carousel'
  };

  /* --------------------------------------------------------- bonus rush --- */
  // Sequential challenge ladder. Each rung reads one gameplay event.
  var RUSH = [
    { id: 'r1', text: 'Spin any machine 12 times', coins: 400, need: 12, kind: 'count', ev: 'spin' },
    { id: 'r2', text: 'Win 5x your bet on one spin', coins: 500, kind: 'mult', at: 5 },
    { id: 'r3', text: 'Land a Bell line on Orchard Classic', coins: 600, kind: 'tag', tag: 'TBE' },
    { id: 'r4', text: 'Wake the Ghost Train with 3 coins', coins: 800, kind: 'feature', feature: 'hold' },
    { id: 'r5', text: 'Chain 3 tumbles on Gem Cascade', coins: 1000, kind: 'tumbles', at: 3 },
    { id: 'r6', text: 'Win 15x your bet on one spin', coins: 1300, kind: 'mult', at: 15 },
    { id: 'r7', text: 'Trigger Midway free spins', coins: 1600, kind: 'feature', feature: 'free' },
    { id: 'r8', text: 'Lock 4 coins in one hold and spin', coins: 2000, kind: 'coins', at: 4 },
    { id: 'r9', text: 'Spin the Grand Wheel', coins: 2600, kind: 'feature', feature: 'wheel' },
    { id: 'r10', text: 'Open the Prize Booth', coins: 3200, kind: 'feature', feature: 'pick' },
    { id: 'r11', text: 'Win 60x your bet on one spin', coins: 4200, kind: 'mult', at: 60 },
    { id: 'r12', text: 'Reach level 6 on any machine', coins: 6000, kind: 'level', at: 6 }
  ];

  /* ------------------------------------------------------------- badges --- */
  // The first ten ids are the prototype badge set and keep their meaning.
  var BADGES = [
    { id: 'triple_crown', name: 'Triple Crown', m: 'orchard', desc: 'Three Sevens on the line' },
    { id: 'ghost_train', name: 'Wake the Train', m: 'ghost', desc: 'Land 3 or more coins' },
    { id: 'full_vault', name: 'Full Vault', m: 'ghost', desc: 'Lock all five coins' },
    { id: 'deep_chain', name: 'Deep Chain', m: 'cascade', desc: 'A 5 tumble cascade' },
    { id: 'mega_cluster', name: 'Mega Cluster', m: 'cascade', desc: 'Cluster of 13 or more' },
    { id: 'grand_ring', name: 'Grand Ring', m: 'carousel', desc: 'The 500x wheel ring' },
    { id: 'high_road', name: 'High Road', m: 'carousel', desc: 'Land the 100x wedge' },
    { id: 'big_hit', name: 'Big Hit', m: null, desc: 'Win 50x or more on one spin' },
    { id: 'ladder_v', name: 'Ladder Five', m: null, desc: 'Reach 5,000 coins in a session' },
    { id: 'century', name: 'Century', m: null, desc: '100 spins on one machine' },
    { id: 'free_run', name: 'Free Run', m: null, desc: 'Trigger any free spin round' },
    { id: 'midway_king', name: 'Midway King', m: 'midway', desc: 'Win 60x in one free spin round' },
    { id: 'pick_bonus', name: 'Booth Raider', m: 'carousel', desc: 'Open the Prize Booth' },
    { id: 'carousel_wheel', name: 'Wheelwright', m: 'carousel', desc: 'Spin the Grand Wheel' },
    { id: 'tour_complete', name: 'Tour Complete', m: null, desc: 'Unlock all five machines' },
    { id: 'collector', name: 'Collector', m: null, desc: 'Complete every prize set' }
  ];
  var BADGE_IDS = BADGES.map(function (b) { return b.id; });

  /* -------------------------------------------------------- daily wheel --- */
  var DAILY = [
    { v: 250, w: 30 }, { v: 500, w: 24 }, { v: 750, w: 18 }, { v: 1000, w: 12 },
    { v: 1500, w: 8 }, { v: 2500, w: 5 }, { v: 4000, w: 2 }, { v: 10000, w: 1 }
  ];
  var DAILY_COOLDOWN = 4 * 3600 * 1000;

  // Free top up: below the floor the parlour hands out coins on a short timer,
  // and the reset button is always available. Nothing here is ever purchased.
  var TOPUP_FLOOR = 250;
  var TOPUP_AMOUNT = 300;
  var TOPUP_CEIL = 1500;
  var TOPUP_COOLDOWN = 90 * 1000;

  /* ------------------------------------------------------- skill games ---- */
  var SKILL = [
    {
      id: 'ringtoss', name: 'Ring Toss', tries: 3,
      hint: 'Tap to drop the ring when the marker is on the peg.',
      bands: [{ half: 0.055, coins: 900, label: 'Bullseye' },
      { half: 0.13, coins: 400, label: 'Inner ring' },
      { half: 0.24, coins: 150, label: 'Outer ring' }],
      speed: [1.05, 1.3, 1.6]
    },
    {
      id: 'striker', name: 'High Striker', tries: 3,
      hint: 'Tap to stop the hammer meter inside the gold band.',
      bands: [{ half: 0.05, coins: 1200, label: 'Bell' },
      { half: 0.12, coins: 500, label: 'Near bell' },
      { half: 0.26, coins: 200, label: 'Halfway' }],
      speed: [1.15, 1.45, 1.8]
    }
  ];

  /* ------------------------------------------------------------- helpers -- */
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  function int(v, fb) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v ? v : fb; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function levelFor(spins) {
    var lv = 1;
    for (var i = 1; i < LEVEL_XP.length; i++) if (spins >= LEVEL_XP[i]) lv = i + 1;
    return lv;
  }
  function levelProgress(spins) {
    var lv = levelFor(spins);
    if (lv >= LEVEL_XP.length) return { level: lv, have: 1, need: 1, frac: 1, max: true };
    var lo = LEVEL_XP[lv - 1], hi = LEVEL_XP[lv];
    return { level: lv, have: spins - lo, need: hi - lo, frac: clamp((spins - lo) / (hi - lo), 0, 1), max: false };
  }

  function freshMachine() {
    return {
      spins: 0, wagered: 0, won: 0, level: 1, best: 0, hits: 0,
      tickets: [false, false, false, false, false, false], setDone: false
    };
  }
  function fresh() {
    var m = {};
    MACHINE_IDS.forEach(function (id) { m[id] = freshMachine(); });
    return {
      v: SAVE_VERSION, bank: START_BANK, betIdx: 2, machine: 0, fast: false,
      unlocked: 1, tutorial: 0, m: m, badges: {}, rush: 0, rushCount: 0,
      daily: 0, topUp: 0, bestPeak: START_BANK, plays: 0
    };
  }

  function validMachine(o) {
    if (!o || typeof o !== 'object') return false;
    if (!Number.isInteger(o.spins) || o.spins < 0 || o.spins > 1e9) return false;
    if (!isFinite(o.wagered) || o.wagered < 0 || !isFinite(o.won) || o.won < 0) return false;
    if (!Number.isInteger(o.level) || o.level < 1 || o.level > LEVEL_XP.length) return false;
    if (!isFinite(o.best) || o.best < 0) return false;
    if (!Array.isArray(o.tickets) || o.tickets.length !== 6) return false;
    for (var i = 0; i < 6; i++) if (typeof o.tickets[i] !== 'boolean') return false;
    if (typeof o.setDone !== 'boolean') return false;
    return true;
  }
  function validate(s) {
    if (!s || typeof s !== 'object' || s.v !== SAVE_VERSION) return false;
    if (!isFinite(s.bank) || s.bank < 0 || s.bank > 1e12) return false;
    if (!Number.isInteger(s.betIdx) || s.betIdx < 0 || s.betIdx >= BETS.length) return false;
    if (!Number.isInteger(s.machine) || s.machine < 0 || s.machine >= MACHINE_IDS.length) return false;
    if (!Number.isInteger(s.unlocked) || s.unlocked < 1 || s.unlocked > MACHINE_IDS.length) return false;
    if (!Number.isInteger(s.rush) || s.rush < 0 || s.rush > RUSH.length) return false;
    if (typeof s.fast !== 'boolean') return false;
    if (!s.m || typeof s.m !== 'object') return false;
    for (var i = 0; i < MACHINE_IDS.length; i++) if (!validMachine(s.m[MACHINE_IDS[i]])) return false;
    if (!s.badges || typeof s.badges !== 'object') return false;
    // persisted ids must exist in the badge registry (defect class: unvalidated ids)
    for (var k in s.badges) if (BADGE_IDS.indexOf(k) < 0) return false;
    if (s.machine >= s.unlocked) return false;
    return true;
  }
  // Repair rather than discard where the shape is close enough; anything that
  // still fails validate() is thrown away for a clean profile.
  function coerce(s) {
    if (!s || typeof s !== 'object') return fresh();
    var out = fresh();
    out.bank = clamp(num(s.bank, START_BANK), 0, 1e12);
    out.betIdx = clamp(int(s.betIdx, 2), 0, BETS.length - 1);
    out.unlocked = clamp(int(s.unlocked, 1), 1, MACHINE_IDS.length);
    out.machine = clamp(int(s.machine, 0), 0, out.unlocked - 1);
    out.fast = s.fast === true;
    out.tutorial = clamp(int(s.tutorial, 0), 0, 99);
    out.rush = clamp(int(s.rush, 0), 0, RUSH.length);
    out.rushCount = clamp(int(s.rushCount, 0), 0, 1e9);
    out.daily = clamp(num(s.daily, 0), 0, 4e15);
    out.topUp = clamp(num(s.topUp, 0), 0, 4e15);
    out.bestPeak = clamp(num(s.bestPeak, START_BANK), 0, 1e12);
    out.plays = clamp(int(s.plays, 0), 0, 1e9);
    MACHINE_IDS.forEach(function (id) {
      var src = s.m && s.m[id], dst = out.m[id];
      if (!src || typeof src !== 'object') return;
      dst.spins = clamp(int(src.spins, 0), 0, 1e9);
      dst.wagered = clamp(num(src.wagered, 0), 0, 1e12);
      dst.won = clamp(num(src.won, 0), 0, 1e12);
      dst.best = clamp(num(src.best, 0), 0, 1e12);
      dst.hits = clamp(int(src.hits, 0), 0, 1e9);
      dst.level = clamp(int(src.level, levelFor(dst.spins)), 1, LEVEL_XP.length);
      if (Array.isArray(src.tickets)) {
        for (var i = 0; i < 6; i++) dst.tickets[i] = src.tickets[i] === true;
      }
      dst.setDone = src.setDone === true;
    });
    if (s.badges && typeof s.badges === 'object') {
      for (var k in s.badges) if (BADGE_IDS.indexOf(k) >= 0 && s.badges[k]) out.badges[k] = true;
    }
    return validate(out) ? out : fresh();
  }

  /* ------------------------------------------------------------ economy --- */
  function topUpReady(s, now) {
    return s.bank < TOPUP_FLOOR && (now - s.topUp) >= TOPUP_COOLDOWN;
  }
  function topUpIn(s, now) {
    if (s.bank >= TOPUP_FLOOR) return -1;
    return Math.max(0, TOPUP_COOLDOWN - (now - s.topUp));
  }
  function dailyReady(s, now) { return (now - s.daily) >= DAILY_COOLDOWN; }
  function dailyIn(s, now) { return Math.max(0, DAILY_COOLDOWN - (now - s.daily)); }
  function rollDaily() {
    var t = 0, i;
    for (i = 0; i < DAILY.length; i++) t += DAILY[i].w;
    var r = Math.random() * t;
    for (i = 0; i < DAILY.length; i++) { r -= DAILY[i].w; if (r < 0) return i; }
    return 0;
  }

  /* --------------------------------------------------------- rush check --- */
  // ev: {type, machine, mult, tags[], feature, tumbles, coins, level}
  function rushProgress(s, ev) {
    if (s.rush >= RUSH.length) return null;
    var r = RUSH[s.rush], done = false;
    if (r.kind === 'count') {
      if (ev.type === r.ev) { s.rushCount++; if (s.rushCount >= r.need) done = true; }
    } else if (r.kind === 'mult') {
      if (ev.type === 'spin' && ev.mult >= r.at) done = true;
    } else if (r.kind === 'tag') {
      if (ev.tags && ev.tags.indexOf(r.tag) >= 0) done = true;
    } else if (r.kind === 'feature') {
      if (ev.type === 'feature' && ev.feature === r.feature) done = true;
    } else if (r.kind === 'tumbles') {
      if (ev.tumbles >= r.at) done = true;
    } else if (r.kind === 'coins') {
      if (ev.coins >= r.at) done = true;
    } else if (r.kind === 'level') {
      if (ev.type === 'level' && ev.level >= r.at) done = true;
    }
    if (!done) return null;
    s.rush++; s.rushCount = 0;
    return r;
  }

  root.CR_META = {
    SAVE_VERSION: SAVE_VERSION, START_BANK: START_BANK, BETS: BETS,
    MACHINE_IDS: MACHINE_IDS, MACHINE_TITLES: MACHINE_TITLES,
    LEVEL_XP: LEVEL_XP, LEVEL_COINS: LEVEL_COINS, TICKET_LEVELS: TICKET_LEVELS,
    UNLOCK_LEVEL: UNLOCK_LEVEL, SET_BONUS: SET_BONUS, TICKET_NAMES: TICKET_NAMES,
    RUSH: RUSH, BADGES: BADGES, BADGE_IDS: BADGE_IDS,
    DAILY: DAILY, DAILY_COOLDOWN: DAILY_COOLDOWN,
    TOPUP_FLOOR: TOPUP_FLOOR, TOPUP_AMOUNT: TOPUP_AMOUNT, TOPUP_CEIL: TOPUP_CEIL,
    TOPUP_COOLDOWN: TOPUP_COOLDOWN, SKILL: SKILL,
    fresh: fresh, validate: validate, coerce: coerce,
    levelFor: levelFor, levelProgress: levelProgress,
    topUpReady: topUpReady, topUpIn: topUpIn,
    dailyReady: dailyReady, dailyIn: dailyIn, rollDaily: rollDaily,
    rushProgress: rushProgress, clamp: clamp
  };
})(typeof window !== 'undefined' ? window : globalThis);
