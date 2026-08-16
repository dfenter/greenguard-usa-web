/* te_content.js — Touchline Eleven content registry.
 * Squad, opposition clubs, venues, weather, season fixture graph, drill
 * gauntlet and medal tables. Everything the save file references by key is
 * looked up through the guarded helpers at the bottom of this file, so a
 * stale or hand edited save can never index into undefined content.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- pitch */
  // Design space is 960 x 480 (2.0), close enough to a phone in landscape
  // that the letterbox stays small on both 19.5:9 handsets and tablets.
  var PITCH = {
    left: 40, right: 920, top: 68, bottom: 462,
    midX: 480, midY: 265,
    goalHalf: 57,      // half height of the goal mouth
    goalDepth: 20,
    boxDepth: 132,     // penalty area depth from the goal line
    boxHalf: 124,
    sixDepth: 54,
    sixHalf: 76,
    spotDepth: 96      // penalty spot
  };

  /* --------------------------------------------------------------- squad */
  // Eight original players. pace drives run speed, power drives shot and
  // clearance strength, technique drives pass accuracy, first touch and the
  // odds of holding the ball under pressure.
  var PLAYERS = [
    { id: 'vantly',  num: 1,  name: 'Ora Vantly',      role: 'GK', pace: 0.80, power: 0.98, tech: 0.88, unlock: 'start',  note: 'Reads a shot early and stays big.' },
    { id: 'marrow',  num: 4,  name: 'Bex Marrow',      role: 'DF', pace: 0.92, power: 1.06, tech: 0.82, unlock: 'start',  note: 'Wins the first ball, clears the second.' },
    { id: 'quinn',   num: 5,  name: 'Sable Quinn',     role: 'DF', pace: 1.00, power: 0.90, tech: 0.88, unlock: 'start',  note: 'Steps out of the back line with it.' },
    { id: 'halloway',num: 8,  name: 'Rook Halloway',   role: 'PM', pace: 0.94, power: 0.86, tech: 1.12, unlock: 'start',  note: 'Sees the pass one beat before you do.' },
    { id: 'wilde',   num: 9,  name: 'Juniper Wilde',   role: 'ST', pace: 1.10, power: 1.00, tech: 0.92, unlock: 'start',  note: 'Runs the shoulder of the last defender.' },
    { id: 'vale',    num: 6,  name: 'Tamsin Vale',     role: 'PM', pace: 0.98, power: 1.04, tech: 0.98, unlock: 'wins3',  note: 'Carries through contact and keeps the head up.' },
    { id: 'reyes',   num: 11, name: 'Cobalt Reyes',    role: 'ST', pace: 1.18, power: 0.88, tech: 0.90, unlock: 'fix7',   note: 'Pure gas down the channel.' },
    { id: 'thorne',  num: 3,  name: 'Mica Thorne',     role: 'DF', pace: 1.04, power: 1.10, tech: 1.00, unlock: 'final',  note: 'Defends the halfway line like a goal line.' }
  ];

  var UNLOCK_TEXT = {
    start: 'In the squad',
    wins3: 'Win three league fixtures',
    fix7:  'Reach league fixture 7',
    final: 'Reach the knockout final'
  };

  // Slot layout, own team defends the left goal and attacks right.
  // Lateral positions carry the prototype's 5v5 shape across: its x range of
  // 24..366 maps onto this pitch's 68..462.
  var OWN_SLOTS = [
    { x: 137, y: 265, role: 'GK' },
    { x: 238, y: 170, role: 'DF' },
    { x: 238, y: 360, role: 'DF' },
    { x: 392, y: 265, role: 'PM' },
    { x: 548, y: 214, role: 'ST' }
  ];
  var OPP_SLOTS = [
    { x: 823, y: 265, role: 'GK' },
    { x: 722, y: 170, role: 'DF' },
    { x: 722, y: 360, role: 'DF' },
    { x: 568, y: 265, role: 'PM' },
    { x: 412, y: 316, role: 'ST' }
  ];

  /* --------------------------------------------------------------- venues */
  // Weather modifies ball roll. roll is the per second velocity retention
  // exponent: the prototype's tuned 0.25 is the dry baseline.
  var VENUES = [
    {
      key: 'ashfield', name: 'Ashfield Park', weather: 'clear',
      blurb: 'Saturday afternoon, dry grass, low sun.',
      roll: 0.25, gust: 0, drag: 0,
      sky: 0x8fd3e8, turf: 0x2f7a45, turf2: 0x35894e, line: 0xf2fbf3,
      stand: 0x22323c, standLo: 0x172630, crowd: [0xe9d8a6, 0xd98c6a, 0x7fa8c9, 0xcfd6dd, 0x9c7b5a],
      tint: 0xffffff, tintAlpha: 0, light: 0
    },
    {
      key: 'harbour', name: 'Harbour Lamps', weather: 'dew',
      blurb: 'Floodlit night by the docks, dew on the surface.',
      roll: 0.36, gust: 0, drag: 0,
      sky: 0x0a1626, turf: 0x1c5b3c, turf2: 0x226a46, line: 0xeafff2,
      stand: 0x101b26, standLo: 0x0a1119, crowd: [0x2f4a63, 0x466f8c, 0x7ea8c4, 0x243746, 0x8fb6cf],
      tint: 0x14314f, tintAlpha: 0.3, light: 1
    },
    {
      key: 'saltmarsh', name: 'Saltmarsh Reach', weather: 'wind',
      blurb: 'Sea wind across the pitch, gulls over the far stand.',
      roll: 0.28, gust: 46, drag: 0,
      sky: 0xb9d7dd, turf: 0x3d7f52, turf2: 0x468d5c, line: 0xfbfff7,
      stand: 0x35414a, standLo: 0x232d35, crowd: [0xf0e6d2, 0xc9a06a, 0x8fb0c2, 0xdfe6ea, 0xa8bfae],
      tint: 0xdfe9d8, tintAlpha: 0.1, light: 0
    },
    {
      key: 'kestrel', name: 'Kestrel Hollow', weather: 'rain',
      blurb: 'Wet valley ground, the ball skids off the surface.',
      roll: 0.44, gust: 12, drag: 0,
      sky: 0x51606b, turf: 0x2a6642, turf2: 0x2f7249, line: 0xe6f2ea,
      stand: 0x2a3138, standLo: 0x1b2026, crowd: [0x3f4a55, 0x5d6b78, 0x7b8894, 0x2c343c, 0x99a5b0],
      tint: 0x6c7f8c, tintAlpha: 0.2, light: 0
    },
    {
      key: 'aurelia', name: 'Aurelia Arena', weather: 'clear',
      blurb: 'Cup final night. Gold trim, full house, no second chance.',
      roll: 0.25, gust: 0, drag: 0,
      sky: 0x120a1f, turf: 0x1f6b4a, turf2: 0x257a55, line: 0xfff8e2,
      stand: 0x1a1226, standLo: 0x100a18, crowd: [0xffd166, 0xf0a44a, 0xe8e2ce, 0x6f5aa8, 0xffe9b0],
      tint: 0x2c1a52, tintAlpha: 0.26, light: 1
    }
  ];

  /* ---------------------------------------------------------------- clubs */
  // style drives the AI shape: park sits deep, wing stretches wide, press
  // swarms the carrier, counter drops then breaks.
  var CLUBS = [
    { key: 'northstar', name: 'Northstar Rovers', short: 'NST', style: 'park',    home: 'ashfield',  primary: 0xe8563f, secondary: 0x2a1f1c, rating: 0.86, note: 'A compact wall that waits for one clean break.' },
    { key: 'aero',      name: 'Aero Borough',     short: 'AER', style: 'wing',    home: 'saltmarsh', primary: 0x36c3d6, secondary: 0x0f2e36, rating: 0.88, note: 'Fast wide runners stretch every blade of grass.' },
    { key: 'copper',    name: 'Copper Vale',      short: 'CPV', style: 'wing',    home: 'ashfield',  primary: 0xd08a3a, secondary: 0x33231a, rating: 0.90, note: 'Early crosses and late midfield arrivals.' },
    { key: 'orchard',   name: 'Night Orchard',    short: 'NOR', style: 'park',    home: 'harbour',   primary: 0x7d5ad6, secondary: 0x1a1230, rating: 0.92, note: 'Patient, narrow and prickly near the box.' },
    { key: 'tidefall',  name: 'Tidefall Athletic',short: 'TID', style: 'counter', home: 'saltmarsh', primary: 0x3f8de8, secondary: 0x101f33, rating: 0.94, note: 'Two banks, then forty yards in four seconds.' },
    { key: 'lantern',   name: 'Lantern Row',      short: 'LNR', style: 'press',   home: 'harbour',   primary: 0xf2b134, secondary: 0x2b2110, rating: 0.96, note: 'The tempo never leaves the red zone.' },
    { key: 'briar',     name: 'Briarhead United', short: 'BRI', style: 'park',    home: 'kestrel',   primary: 0x4fae6b, secondary: 0x16291c, rating: 0.98, note: 'Ugly, effective and impossible to hurry.' },
    { key: 'redline',   name: 'Redline Union',    short: 'RDL', style: 'press',   home: 'ashfield',  primary: 0xe23c5e, secondary: 0x2b0f18, rating: 1.00, note: 'Five shirts, one swarm, no quiet first touch.' },
    { key: 'gantry',    name: 'Gantry Works',     short: 'GNT', style: 'counter', home: 'kestrel',   primary: 0x9aa7b2, secondary: 0x1d232a, rating: 1.03, note: 'Industrial shape, surgical release ball.' },
    { key: 'sablewick', name: 'Sablewick City',   short: 'SBW', style: 'wing',    home: 'harbour',   primary: 0x2f6ff0, secondary: 0x0c1730, rating: 1.06, note: 'Overlaps on both flanks for ninety minutes.' },
    { key: 'ashcourt',  name: 'Ashcourt Albion',  short: 'ASH', style: 'press',   home: 'kestrel',   primary: 0xdfe6ec, secondary: 0x171b20, rating: 1.09, note: 'They start the pressing trap on the goalkeeper.' },
    { key: 'morrow',    name: 'Morrow City',      short: 'MOR', style: 'counter', home: 'aurelia',   primary: 0x1fc38a, secondary: 0x0b2a22, rating: 1.13, note: 'The measuring stick of the whole division.' }
  ];

  var OWN_CLUB = {
    key: 'touchline', name: 'Touchline Eleven', short: 'TCH', style: 'own',
    home: 'ashfield', primary: 0x27d0a0, secondary: 0x07231b, rating: 1.0
  };

  /* ------------------------------------------------------------- fixtures */
  // Twelve league fixtures in rating order so the ramp is monotonic, then a
  // knockout final at Aurelia Arena against whoever finished top.
  function seasonFixtures() {
    var out = [];
    for (var i = 0; i < CLUBS.length; i++) {
      var c = CLUBS[i];
      out.push({
        index: i,
        club: c.key,
        // Alternate home and away so venues rotate through the season.
        venue: (i % 2 === 0) ? OWN_CLUB.home : c.home,
        away: (i % 2 === 1),
        difficulty: 0.84 + i * 0.026
      });
    }
    return out;
  }

  var FINAL_FIXTURE = { index: 12, club: 'morrow', venue: 'aurelia', away: false, difficulty: 1.24, final: true };

  /* ----------------------------------------------------------- quick tiers */
  var TIERS = [
    { key: 'friendly',  name: 'Friendly',  difficulty: 0.80, minutes: 3, note: 'Room to try the swipe.' },
    { key: 'contested', name: 'Contested', difficulty: 0.96, minutes: 3, note: 'They close the lane.' },
    { key: 'fierce',    name: 'Fierce',    difficulty: 1.12, minutes: 3, note: 'Two touches is one too many.' },
    { key: 'elite',     name: 'Elite',     difficulty: 1.30, minutes: 3, note: 'Every mistake is a goal.' }
  ];

  /* ---------------------------------------------------------------- drills */
  // Nine rounds: three disciplines, three rounds each, unlocked in order.
  var DRILLS = [
    { key: 'accuracy', name: 'Target Accuracy', rounds: 3, seconds: 45,
      brief: 'Swipe the ball through the lit panels before the clock runs out.',
      medal: { gold: 8, silver: 5, bronze: 3 }, unit: 'hits' },
    { key: 'slalom', name: 'Dribble Slalom', rounds: 3, seconds: 60,
      brief: 'Carry the ball through every gate in order. Fastest lap wins.',
      medal: { gold: 17000, silver: 22000, bronze: 30000 }, unit: 'time' },
    { key: 'penalty', name: 'Penalty Shootout', rounds: 3, seconds: 0,
      brief: 'Five kicks. Aim away from the keeper and pick your power.',
      medal: { gold: 5, silver: 4, bronze: 3 }, unit: 'scored' }
  ];

  var DRILL_ROUND_SCALE = [1.0, 1.14, 1.3];

  /* ---------------------------------------------------------------- medals */
  var MEDALS = ['none', 'bronze', 'silver', 'gold'];
  var MEDAL_COLOR = { none: 0x64798a, bronze: 0xc4763c, silver: 0xc9d4dd, gold: 0xffd166 };
  var MEDAL_LABEL = { none: 'No medal', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

  function matchMedal(scored, conceded) {
    if (scored <= conceded) return 'none';
    var margin = scored - conceded;
    if (conceded === 0 && margin >= 3) return 'gold';
    if (margin >= 3 || (conceded === 0 && margin >= 2)) return 'silver';
    return 'bronze';
  }

  function drillMedal(drillKey, value) {
    var d = getDrill(drillKey);
    if (!d) return 'none';
    if (d.unit === 'time') {
      if (value <= 0) return 'none';
      if (value <= d.medal.gold) return 'gold';
      if (value <= d.medal.silver) return 'silver';
      if (value <= d.medal.bronze) return 'bronze';
      return 'none';
    }
    if (value >= d.medal.gold) return 'gold';
    if (value >= d.medal.silver) return 'silver';
    if (value >= d.medal.bronze) return 'bronze';
    return 'none';
  }

  /* -------------------------------------------------------- guarded lookup */
  function indexBy(list, prop) {
    var m = Object.create(null);
    for (var i = 0; i < list.length; i++) m[list[i][prop]] = list[i];
    return m;
  }
  var PLAYER_BY_ID = indexBy(PLAYERS, 'id');
  var CLUB_BY_KEY = indexBy(CLUBS, 'key');
  var VENUE_BY_KEY = indexBy(VENUES, 'key');
  var TIER_BY_KEY = indexBy(TIERS, 'key');
  var DRILL_BY_KEY = indexBy(DRILLS, 'key');

  function getPlayer(id) { return PLAYER_BY_ID[id] || PLAYERS[0]; }
  function hasPlayer(id) { return !!PLAYER_BY_ID[id]; }
  function getClub(key) { return CLUB_BY_KEY[key] || CLUBS[0]; }
  function getVenue(key) { return VENUE_BY_KEY[key] || VENUES[0]; }
  function getTier(key) { return TIER_BY_KEY[key] || TIERS[0]; }
  function getDrill(key) { return DRILL_BY_KEY[key] || DRILLS[0]; }

  function unlockedIds(save) {
    var out = ['vantly', 'marrow', 'quinn', 'halloway', 'wilde'];
    var list = (save && Array.isArray(save.unlocked)) ? save.unlocked : [];
    for (var i = 0; i < list.length; i++) {
      if (hasPlayer(list[i]) && out.indexOf(list[i]) < 0) out.push(list[i]);
    }
    return out;
  }

  root.TEContent = {
    PITCH: PITCH,
    PLAYERS: PLAYERS,
    UNLOCK_TEXT: UNLOCK_TEXT,
    OWN_SLOTS: OWN_SLOTS,
    OPP_SLOTS: OPP_SLOTS,
    VENUES: VENUES,
    CLUBS: CLUBS,
    OWN_CLUB: OWN_CLUB,
    TIERS: TIERS,
    DRILLS: DRILLS,
    DRILL_ROUND_SCALE: DRILL_ROUND_SCALE,
    MEDALS: MEDALS,
    MEDAL_COLOR: MEDAL_COLOR,
    MEDAL_LABEL: MEDAL_LABEL,
    FINAL_FIXTURE: FINAL_FIXTURE,
    seasonFixtures: seasonFixtures,
    matchMedal: matchMedal,
    drillMedal: drillMedal,
    getPlayer: getPlayer,
    hasPlayer: hasPlayer,
    getClub: getClub,
    getVenue: getVenue,
    getTier: getTier,
    getDrill: getDrill,
    unlockedIds: unlockedIds
  };
})(typeof window !== 'undefined' ? window : globalThis);
