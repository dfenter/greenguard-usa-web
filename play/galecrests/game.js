/* Galecrests, fleet F15. Phaser 3 render shell with GGKit-owned save, audio,
 * lifecycle, input identity, and juice. Raising sim plus tactical racing.
 */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var W = 390;
  var H = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  var SAVE_VERSION = 1;
  var REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var PPM = 3.1;            /* pixels per simulated metre */
  var LANE_Y = [474, 518, 562, 606, 650, 694];
  var LANE_SCALE = [0.78, 0.85, 0.92, 0.99, 1.06, 1.13];
  var ANCHOR_X = 132;
  var TURNS = 12;
  var MAX_PARTICLES = 120;

  var C = {
    ink: '#f2f6ff', muted: '#9db0d8', dim: '#6d80ab', deep: '#090f22',
    panel: '#16224a', panel2: '#1d2c5c', line: '#33488a',
    cyan: '#67e8f9', lime: '#b9f36a', gold: '#ffd267', orange: '#ffb45e',
    rose: '#ff7caa', red: '#ff6f7d', violet: '#c2a3ff', mint: '#6fe3b6', white: '#ffffff'
  };

  /* ------------------------------------------------------------ content */

  var STATS = [
    {id: 'speed', label: 'Speed', icon: '»', color: C.orange},
    {id: 'stamina', label: 'Stamina', icon: '∞', color: C.lime},
    {id: 'power', label: 'Power', icon: '▲', color: C.rose},
    {id: 'guts', label: 'Guts', icon: '♥', color: C.red},
    {id: 'wit', label: 'Wit', icon: '✦', color: C.cyan}
  ];

  var TRAINING = [
    {id: 'speed', label: 'Wind Sprints', sub: 'Top gear off the gate', color: C.orange,
      gain: 4, bold: 7, second: 'power', secondGain: 1, fatigue: 9, boldFatigue: 17, mood: 0},
    {id: 'stamina', label: 'Marsh Circuits', sub: 'Hold the pace longer', color: C.lime,
      gain: 4, bold: 7, second: 'guts', secondGain: 1, fatigue: 10, boldFatigue: 18, mood: -1},
    {id: 'power', label: 'Dune Climbs', sub: 'Push through the pack', color: C.rose,
      gain: 4, bold: 7, second: 'speed', secondGain: 1, fatigue: 11, boldFatigue: 19, mood: -1},
    {id: 'guts', label: 'Storm Drills', sub: 'Refuse to fold late', color: C.red,
      gain: 4, bold: 6, second: 'stamina', secondGain: 1, fatigue: 10, boldFatigue: 18, mood: -1},
    {id: 'wit', label: 'Stillwater', sub: 'Read the race, widen calls', color: C.cyan,
      gain: 4, bold: 6, second: 'guts', secondGain: 1, fatigue: 7, boldFatigue: 14, mood: 0}
  ];

  var MOODS = [
    {label: 'Sulky', color: C.red, mul: 0.93, gain: 0.8},
    {label: 'Uneasy', color: C.orange, mul: 0.97, gain: 0.9},
    {label: 'Steady', color: C.ink, mul: 1.0, gain: 1.0},
    {label: 'Bright', color: C.mint, mul: 1.03, gain: 1.12},
    {label: 'Soaring', color: C.gold, mul: 1.06, gain: 1.25}
  ];

  var SURFACES = {
    grass: {label: 'Grass', drain: 1.0, color: '#2f7d54', color2: '#37955f', dust: '#7fe0a4'},
    dirt: {label: 'Dirt', drain: 1.2, color: '#7c4a2c', color2: '#955833', dust: '#e0a878'},
    mud: {label: 'Rain soaked', drain: 1.32, color: '#4a4a5e', color2: '#565672', dust: '#b9c6e0'},
    turf: {label: 'Championship turf', drain: 1.1, color: '#2b6f7d', color2: '#31808f', dust: '#8ad9e6'}
  };

  var VENUES = [
    {id: 'verdant', name: 'Verdant Mile', short: 'VERDANT', surface: 'grass', dist: 1600, band: 'mile',
      sky: ['#2a4f8f', '#7fb5e0'], sky2: '#cfe6f4', skyline: 'hills', crowd: '#3f7f5f',
      accent: C.lime, weather: 'clear', blurb: 'Wide green mile, honest ground, honest pace.'},
    {id: 'emberflat', name: 'Emberflat Sprint', short: 'EMBER', surface: 'dirt', dist: 1000, band: 'sprint',
      sky: ['#5c2c4a', '#f08a4b'], sky2: '#ffd6a0', skyline: 'mesa', crowd: '#8a4a3a',
      accent: C.orange, weather: 'dust', blurb: 'Short dirt burn. The gate decides most of it.'},
    {id: 'harborline', name: 'Harborline Turn', short: 'HARBOR', surface: 'grass', dist: 1800, band: 'mile',
      sky: ['#1c3766', '#5f8fc4'], sky2: '#b9d4ea', skyline: 'harbor', crowd: '#3d6f96',
      accent: C.cyan, weather: 'gulls', blurb: 'Sea wind on the back straight, tight rail late.'},
    {id: 'mistlow', name: 'Mistlow Long', short: 'MISTLOW', surface: 'mud', dist: 2400, band: 'long',
      sky: ['#26304d', '#6b7594'], sky2: '#9aa4bd', skyline: 'towers', crowd: '#4b5372',
      accent: C.violet, weather: 'rain', blurb: 'Rain soaked marathon. Stamina is the whole story.'},
    {id: 'duneglass', name: 'Duneglass Dash', short: 'DUNE', surface: 'dirt', dist: 1200, band: 'sprint',
      sky: ['#3d3a72', '#e9b45c'], sky2: '#ffe6b0', skyline: 'dunes', crowd: '#a8763f',
      accent: C.gold, weather: 'dust', blurb: 'Glass sand under noon heat. Fast and punishing.'},
    {id: 'galecrest', name: 'Galecrest Cup', short: 'CUP', surface: 'turf', dist: 2000, band: 'long',
      sky: ['#0d1636', '#243a72'], sky2: '#5f7bb8', skyline: 'stadium', crowd: '#2f4a8c',
      accent: C.gold, weather: 'night', blurb: 'Floodlit final. Every league ends here.'}
  ];

  /* 12 turns, 8 of them end in a race. */
  var CALENDAR = [
    {turn: 2, venue: 0, name: 'Verdant Opener', tier: 1},
    {turn: 3, venue: 1, name: 'Emberflat Trial', tier: 1},
    {turn: 5, venue: 2, name: 'Harborline Stakes', tier: 2},
    {turn: 6, venue: 4, name: 'Duneglass Dash', tier: 2},
    {turn: 8, venue: 3, name: 'Mistlow Endurance', tier: 3},
    {turn: 9, venue: 0, name: 'Verdant Classic', tier: 3},
    {turn: 11, venue: 3, name: 'Mistlow Night Long', tier: 4},
    {turn: 12, venue: 5, name: 'Galecrest Cup', tier: 5}
  ];

  var LEAGUES = [
    {id: 'fledge', name: 'Fledge League', color: C.mint, rating: 34, ramp: 3.0, blurb: 'Young fields. Room to learn a plan.'},
    {id: 'gale', name: 'Gale League', color: C.cyan, rating: 48, ramp: 3.8, blurb: 'Sharper rivals. Fatigue starts to bite.'},
    {id: 'tempest', name: 'Tempest League', color: C.rose, rating: 62, ramp: 4.6, blurb: 'Every field has a real closer in it.'}
  ];

  var CRESTS = [
    {id: 'emberquill', name: 'Emberquill', color: '#ff9a5e', mark: '#ffd7b0',
      base: {speed: 46, stamina: 34, power: 44, guts: 38, wit: 34},
      apt: {grass: 1.0, dirt: 1.06, mud: 0.95, turf: 1.0, sprint: 1.05, mile: 1.0, long: 0.94},
      style: 'lead', trait: 'Gate Fire', blurb: 'Dirt sprinter. Leads from the gate and dares the field to catch it.',
      unlock: null},
    {id: 'marshpiper', name: 'Marshpiper', color: '#6fe3b6', mark: '#c8f7e4',
      base: {speed: 34, stamina: 48, power: 36, guts: 44, wit: 38},
      apt: {grass: 1.0, dirt: 0.95, mud: 1.07, turf: 1.0, sprint: 0.93, mile: 1.0, long: 1.06},
      style: 'stalk', trait: 'Rain Lung', blurb: 'Marsh stayer. Rain and long ground are where it wakes up.',
      unlock: null},
    {id: 'sunkeel', name: 'Sunkeel', color: '#ffd267', mark: '#fff0c2',
      base: {speed: 42, stamina: 40, power: 40, guts: 38, wit: 40},
      apt: {grass: 1.05, dirt: 1.0, mud: 0.98, turf: 1.02, sprint: 1.0, mile: 1.04, long: 0.99},
      style: 'press', trait: 'Even Keel', blurb: 'Balanced grass miler. No holes and no gifts either.',
      unlock: null},
    {id: 'thornwake', name: 'Thornwake', color: '#ff7caa', mark: '#ffd0e0',
      base: {speed: 44, stamina: 38, power: 46, guts: 42, wit: 30},
      apt: {grass: 0.99, dirt: 1.05, mud: 1.0, turf: 1.0, sprint: 1.0, mile: 1.03, long: 0.98},
      style: 'close', trait: 'Late Fire', blurb: 'Bruising closer. Wants traffic to open at the last bend.',
      unlock: 'Win any race'},
    {id: 'pondprism', name: 'Pondprism', color: '#67e8f9', mark: '#ccf6fd',
      base: {speed: 38, stamina: 42, power: 34, guts: 38, wit: 52},
      apt: {grass: 1.02, dirt: 0.97, mud: 1.04, turf: 1.02, sprint: 0.97, mile: 1.03, long: 1.02},
      style: 'stalk', trait: 'Wide Eye', blurb: 'Reads the race. Widest tactical call windows in the studbook.',
      unlock: 'Finish a full season'},
    {id: 'galecrown', name: 'Galecrown', color: '#c2a3ff', mark: '#e8dcff',
      base: {speed: 46, stamina: 46, power: 44, guts: 46, wit: 44},
      apt: {grass: 1.03, dirt: 1.02, mud: 1.02, turf: 1.08, sprint: 1.0, mile: 1.02, long: 1.03},
      style: 'press', trait: 'Crown Air', blurb: 'The cup line. Even everywhere, exceptional on championship turf.',
      unlock: 'Win the Galecrest Cup'}
  ];

  var STYLES = [
    {id: 'lead', name: 'Lead', icon: '⟫', color: C.orange, pace: [1.115, 1.045, 1.0],
      blurb: 'Take the front early. Cheap ground, expensive finish.'},
    {id: 'press', name: 'Press', icon: '⟩', color: C.gold, pace: [1.075, 1.065, 1.03],
      blurb: 'Sit just off the pace and keep the leader honest.'},
    {id: 'stalk', name: 'Stalk', icon: '⟨', color: C.cyan, pace: [1.015, 1.045, 1.105],
      blurb: 'Save ground midfield, then come with one long run.'},
    {id: 'close', name: 'Close', icon: '⟪', color: C.violet, pace: [0.985, 1.025, 1.165],
      blurb: 'Drop out the back and trust one huge closing quarter.'}
  ];

  var CALLS = [
    {id: 'hold', label: 'HOLD', color: C.cyan, from: 0.14, to: 0.36, dur: 5.0,
      pace: 0.925, recover: 2.2, coach: 'Hold settles the pace and buys stamina back.'},
    {id: 'surge', label: 'SURGE', color: C.orange, from: 0.44, to: 0.68, dur: 4.0,
      pace: 1.1, recover: 0, coach: 'Surge takes position before the field commits.'},
    {id: 'kick', label: 'KICK', color: C.gold, from: 0.76, to: 0.95, dur: 99,
      pace: 1.185, recover: 0, coach: 'Kick empties the tank. Time it and hold the line.'}
  ];

  var RIVAL_POOL = [
    {name: 'Brasswhistle', color: '#ff8a7a', style: 'lead'},
    {name: 'Mossglide', color: '#8ce0a0', style: 'stalk'},
    {name: 'Rillflare', color: '#f7dc72', style: 'press'},
    {name: 'Pondkite', color: '#7eb7ff', style: 'close'},
    {name: 'Thornwake Two', color: '#ff9bd0', style: 'close'},
    {name: 'Sootlark', color: '#b6a2ff', style: 'press'},
    {name: 'Quillvane', color: '#64d9bd', style: 'stalk'},
    {name: 'Reedhollow', color: '#ffb45e', style: 'lead'},
    {name: 'Glassrook', color: '#9fd0ff', style: 'press'},
    {name: 'Emberwren', color: '#ff7d6b', style: 'lead'},
    {name: 'Fenwhistle', color: '#a8e07f', style: 'stalk'},
    {name: 'Cinderpike', color: '#ff6f7d', style: 'close'}
  ];

  var TRAITS = [
    {id: 'gate', name: 'Gate Fire', blurb: 'Opening quarter pace +3 percent.'},
    {id: 'rail', name: 'Rail Hugger', blurb: 'Half as much speed lost while boxed in.'},
    {id: 'late', name: 'Late Fire', blurb: 'Kick pace +4 percent.'},
    {id: 'lung', name: 'Rain Lung', blurb: 'Wet ground drains 8 percent less.'},
    {id: 'eye', name: 'Wide Eye', blurb: 'Tactical call windows widen by a quarter.'},
    {id: 'crown', name: 'Crown Air', blurb: 'Championship turf pace +3 percent.'},
    {id: 'even', name: 'Even Keel', blurb: 'Mood drops one step slower.'}
  ];

  var GRADES = [
    {min: 470, label: 'S', color: C.gold, blurb: 'A season the studbook will remember.'},
    {min: 380, label: 'A', color: C.mint, blurb: 'A genuine title contender.'},
    {min: 290, label: 'B', color: C.cyan, blurb: 'Solid campaign with real high points.'},
    {min: 190, label: 'C', color: C.orange, blurb: 'Learning season. The legacy still counts.'},
    {min: 0, label: 'D', color: C.muted, blurb: 'Rough year. Train the weak stat next run.'}
  ];

  /* -------------------------------------------------------------- utils */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function configureRetinaScene(scene) {
    scene.cameras.main.setZoom(RETINA_FACTOR); scene.cameras.main.centerOn(W / 2, H / 2);
    var addText = scene.add.text;
    scene.add.text = function (x, y, value, style) {
      return addText.call(this, x, y, value, Object.assign({}, style || {}, { resolution: RETINA_FACTOR }));
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return Number.isFinite(v) ? v : d; }
  function whole(v, d) { return Number.isInteger(v) ? v : d; }
  function tint(hex) { return parseInt(String(hex).replace('#', ''), 16) || 0xffffff; }
  function easeBack(t) { var c = 1.70158; return 1 + c * Math.pow(t - 1, 3) + (c + 0.3) * Math.pow(t - 1, 2); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function round1(v) { return Math.round(v * 10) / 10; }

  function seeded(seed) {
    var h = 2166136261 >>> 0;
    var text = String(seed);
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
      return (h >>> 0) / 4294967296;
    };
  }

  function crestById(id) {
    for (var i = 0; i < CRESTS.length; i++) if (CRESTS[i].id === id) return CRESTS[i];
    return CRESTS[0];
  }
  function crestIndex(id) {
    for (var i = 0; i < CRESTS.length; i++) if (CRESTS[i].id === id) return i;
    return 0;
  }
  function styleById(id) {
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
    return STYLES[1];
  }
  function traitByName(name) {
    for (var i = 0; i < TRAITS.length; i++) if (TRAITS[i].name === name) return TRAITS[i];
    return null;
  }
  function venueAt(index) { return VENUES[clamp(whole(index, 0), 0, VENUES.length - 1)]; }
  function surfaceOf(venue) { return SURFACES[venue.surface] || SURFACES.grass; }
  function leagueAt(index) { return LEAGUES[clamp(whole(index, 0), 0, LEAGUES.length - 1)]; }
  function moodAt(index) { return MOODS[clamp(whole(index, 2), 0, MOODS.length - 1)]; }
  function gradeFor(points) {
    for (var i = 0; i < GRADES.length; i++) if (points >= GRADES[i].min) return GRADES[i];
    return GRADES[GRADES.length - 1];
  }
  function raceAtTurn(turn) {
    for (var i = 0; i < CALENDAR.length; i++) if (CALENDAR[i].turn === turn) return CALENDAR[i];
    return null;
  }
  function raceIndexOfTurn(turn) {
    for (var i = 0; i < CALENDAR.length; i++) if (CALENDAR[i].turn === turn) return i;
    return -1;
  }
  function nextRaceFrom(turn) {
    for (var i = 0; i < CALENDAR.length; i++) if (CALENDAR[i].turn >= turn) return CALENDAR[i];
    return null;
  }
  function placeLabel(p) { return p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : p + 'th'; }
  function placeColor(p) { return p === 1 ? C.gold : p === 2 ? '#d8e4f2' : p === 3 ? '#d69161' : C.muted; }

  /* --------------------------------------------------------- save state */

  function blankStats() { return {speed: 0, stamina: 0, power: 0, guts: 0, wit: 0}; }
  function cleanStats(input, min, max) {
    var out = blankStats();
    if (!input || typeof input !== 'object') return out;
    for (var i = 0; i < STATS.length; i++) {
      var id = STATS[i].id;
      out[id] = clamp(Math.round(num(input[id], 0)), min, max);
    }
    return out;
  }
  function validStats(v, min, max) {
    if (!v || typeof v !== 'object') return false;
    for (var i = 0; i < STATS.length; i++) {
      var n = v[STATS[i].id];
      if (!Number.isFinite(n) || n < min || n > max) return false;
    }
    return true;
  }

  function defaultProfile() {
    var venues = [];
    for (var i = 0; i < VENUES.length; i++) venues.push({place: 0, time: 0, races: 0});
    return {
      v: SAVE_VERSION, league: 0, cleared: [false, false, false],
      crests: [true, true, true, false, false, false],
      legacy: null, run: null, tutorial: false, lastCrest: 0, retired: 0,
      records: {wins: 0, races: 0, seasons: 0, cupWins: 0, bestPoints: 0, bestClose: 0, venues: venues}
    };
  }

  function validRun(v) {
    if (v == null) return true;
    if (typeof v !== 'object') return false;
    if (!Number.isInteger(v.crest) || v.crest < 0 || v.crest >= CRESTS.length) return false;
    if (!Number.isInteger(v.league) || v.league < 0 || v.league >= LEAGUES.length) return false;
    if (!Number.isInteger(v.turn) || v.turn < 1 || v.turn > TURNS + 1) return false;
    if (!validStats(v.stats, 0, 200)) return false;
    if (!Number.isFinite(v.fatigue) || v.fatigue < 0 || v.fatigue > 100) return false;
    if (!Number.isInteger(v.mood) || v.mood < 0 || v.mood >= MOODS.length) return false;
    if (!Number.isFinite(v.points) || v.points < 0 || v.points > 99999) return false;
    if (typeof v.name !== 'string' || v.name.length > 40) return false;
    if (!Array.isArray(v.history) || v.history.length > CALENDAR.length) return false;
    for (var i = 0; i < v.history.length; i++) {
      var h = v.history[i];
      if (!h || !Number.isInteger(h.place) || h.place < 1 || h.place > 6) return false;
      if (!Number.isInteger(h.venue) || h.venue < 0 || h.venue >= VENUES.length) return false;
    }
    if (!Array.isArray(v.traits) || v.traits.length > 4) return false;
    return true;
  }

  function validProfile(v) {
    if (!v || typeof v !== 'object' || v.v !== SAVE_VERSION) return false;
    if (!Number.isInteger(v.league) || v.league < 0 || v.league >= LEAGUES.length) return false;
    if (!Array.isArray(v.cleared) || v.cleared.length !== 3) return false;
    for (var i = 0; i < 3; i++) if (typeof v.cleared[i] !== 'boolean') return false;
    if (!Array.isArray(v.crests) || v.crests.length !== CRESTS.length) return false;
    for (var k = 0; k < v.crests.length; k++) if (typeof v.crests[k] !== 'boolean') return false;
    if (typeof v.tutorial !== 'boolean') return false;
    if (!Number.isInteger(v.lastCrest) || v.lastCrest < 0 || v.lastCrest >= CRESTS.length) return false;
    if (!Number.isInteger(v.retired) || v.retired < 0 || v.retired > 99999) return false;
    if (v.legacy != null) {
      var g = v.legacy;
      if (typeof g !== 'object') return false;
      if (typeof g.name !== 'string' || g.name.length > 40) return false;
      if (!Number.isInteger(g.crest) || g.crest < 0 || g.crest >= CRESTS.length) return false;
      if (!validStats(g.bonus, 0, 12)) return false;
      if (g.trait != null && typeof g.trait !== 'string') return false;
      if (!Number.isFinite(g.points) || g.points < 0 || g.points > 99999) return false;
    }
    if (!validRun(v.run)) return false;
    var r = v.records;
    if (!r || typeof r !== 'object') return false;
    var counters = ['wins', 'races', 'seasons', 'cupWins', 'bestPoints', 'bestClose'];
    for (var c = 0; c < counters.length; c++) {
      var n = r[counters[c]];
      if (!Number.isFinite(n) || n < 0 || n > 999999) return false;
    }
    if (!Array.isArray(r.venues) || r.venues.length !== VENUES.length) return false;
    for (var m = 0; m < r.venues.length; m++) {
      var row = r.venues[m];
      if (!row || typeof row !== 'object') return false;
      if (!Number.isInteger(row.place) || row.place < 0 || row.place > 6) return false;
      if (!Number.isFinite(row.time) || row.time < 0 || row.time > 9999) return false;
      if (!Number.isInteger(row.races) || row.races < 0 || row.races > 999999) return false;
    }
    return true;
  }

  /* ------------------------------------------------------- probe / boot */

  var bootState = {
    mode: 'boot', stage: 'boot', progress: 0, score: 0, health: 1,
    turn: 0, league: 0, crest: 'none', place: 0, venue: 'none', ready: false
  };
  var hook = root.__gc && typeof root.__gc === 'object' ? root.__gc : {};
  if (!hook.state || typeof hook.state !== 'object') hook.state = bootState;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceMode')) hook.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceStage')) hook.forceStage = null;
  root.__gc = hook;

  var Game = {phaser: null, play: null};
  var keyEdges = Object.create(null);
  var profile = null;
  var run = null;      /* live career */
  var race = null;     /* live race */

  var kit = root.GGKit ? root.GGKit.create({
    slug: 'galecrests', orientation: 'portrait', validateSave: validProfile,
    onPause: function () {
      keyEdges = Object.create(null);
      if (Game.play) { Game.play.pointerSeen.clear(); Game.play.pointerEdges.length = 0; Game.play.accumulator = 0; }
    },
    onResume: function () {
      keyEdges = Object.create(null);
      if (Game.play) { Game.play.pointerSeen.clear(); Game.play.pointerEdges.length = 0; Game.play.dirty = true; }
    },
    onRestart: function () { if (Game.play) Game.play.restartCurrent(); }
  }) : null;

  if (kit) profile = kit.save.get(defaultProfile());
  if (!validProfile(profile)) profile = defaultProfile();

  if (kit) kit.audio.register({
    theme: 'assets/theme.mp3', race: 'assets/race.mp3', cup: 'assets/cup.mp3',
    tap: 'assets/tap.mp3', train: 'assets/train.mp3', strain: 'assets/strain.mp3',
    rest: 'assets/rest.mp3', bond: 'assets/bond.mp3', gate: 'assets/gate.mp3',
    call_good: 'assets/call_good.mp3', call_late: 'assets/call_late.mp3',
    surge: 'assets/surge.mp3', block: 'assets/block.mp3', wall: 'assets/wall.mp3',
    win: 'assets/win.mp3', lose: 'assets/lose.mp3', unlock: 'assets/unlock.mp3',
    legacy: 'assets/legacy.mp3'
  });

  function persist() { if (kit) kit.save.set(profile); }
  function sfx(name, volume, rate) {
    if (kit) kit.audio.sfx(name, {volume: volume == null ? 0.85 : volume, rate: rate || 1});
  }
  /* Music is lazy: nothing is fetched or started until the first gesture. */
  var musicWanted = null;
  var musicUnlocked = false;
  function music(name) {
    musicWanted = name;
    if (kit && musicUnlocked) kit.audio.music(name, 700);
  }
  if (kit) {
    kit.loader.show('Galecrests');
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
      root.addEventListener(type, function () {
        if (musicUnlocked) return;
        musicUnlocked = true;
        if (musicWanted) kit.audio.music(musicWanted, 700);
      }, {once: true, passive: true});
    });
  }

  /* ------------------------------------------------------- career logic */

  var NAME_A = ['Aster', 'Brindle', 'Cinder', 'Dapple', 'Fable', 'Hush', 'Kestrel', 'Lumen', 'Mica', 'Nettle', 'Quill', 'Vane'];
  var NAME_B = ['Vale', 'Crown', 'Drift', 'Loam', 'Gleam', 'Rook', 'Thimble', 'Skylark', 'Briar', 'Marrow', 'Wick', 'Fen'];

  function makeName(seed) {
    var rng = seeded('name:' + seed);
    return NAME_A[Math.floor(rng() * NAME_A.length)] + ' ' + NAME_B[Math.floor(rng() * NAME_B.length)];
  }

  function legacyBonus() {
    if (!profile.legacy) return blankStats();
    return cleanStats(profile.legacy.bonus, 0, 12);
  }

  function startCareer(crestIdx, league) {
    var crest = CRESTS[clamp(whole(crestIdx, 0), 0, CRESTS.length - 1)];
    var bonus = legacyBonus();
    var stats = blankStats();
    for (var i = 0; i < STATS.length; i++) {
      var id = STATS[i].id;
      stats[id] = clamp(crest.base[id] + bonus[id], 0, 200);
    }
    var traits = [crest.trait];
    if (profile.legacy && profile.legacy.trait && profile.legacy.trait !== crest.trait) traits.push(profile.legacy.trait);
    run = {
      crest: crestIndex(crest.id), league: clamp(whole(league, 0), 0, profile.league),
      turn: 1, stats: stats, fatigue: 0, mood: 2, points: 0,
      name: makeName(profile.retired * 31 + crestIndex(crest.id) * 7 + (profile.records.seasons | 0)),
      history: [], traits: traits, inherited: bonus, bestClose: 0, seed: String(Date.now() % 100000)
    };
    profile.lastCrest = run.crest;
    saveRun();
    return run;
  }

  function saveRun() {
    if (!run) { profile.run = null; persist(); return; }
    profile.run = {
      crest: run.crest, league: run.league, turn: run.turn, stats: cleanStats(run.stats, 0, 200),
      fatigue: clamp(Math.round(run.fatigue), 0, 100), mood: clamp(run.mood, 0, MOODS.length - 1),
      points: clamp(Math.round(run.points), 0, 99999), name: String(run.name).slice(0, 40),
      history: run.history.slice(0, CALENDAR.length).map(function (h) {
        return {place: clamp(whole(h.place, 6), 1, 6), venue: clamp(whole(h.venue, 0), 0, VENUES.length - 1),
          points: clamp(Math.round(num(h.points, 0)), 0, 9999), time: round1(clamp(num(h.time, 0), 0, 9999))};
      }),
      traits: run.traits.slice(0, 4), inherited: cleanStats(run.inherited, 0, 12),
      bestClose: round1(clamp(num(run.bestClose, 0), 0, 999)), seed: String(run.seed).slice(0, 12)
    };
    persist();
  }

  function loadRun() {
    if (!profile.run || !validRun(profile.run)) return null;
    var r = profile.run;
    var crest = CRESTS[r.crest];
    run = {
      crest: r.crest, league: r.league, turn: r.turn, stats: cleanStats(r.stats, 0, 200),
      fatigue: num(r.fatigue, 0), mood: whole(r.mood, 2), points: num(r.points, 0),
      name: r.name, history: r.history.slice(), traits: Array.isArray(r.traits) && r.traits.length ? r.traits.slice() : [crest.trait],
      inherited: cleanStats(r.inherited, 0, 12), bestClose: num(r.bestClose, 0), seed: r.seed || '1'
    };
    return run;
  }

  function hasTrait(name) { return !!(run && run.traits.indexOf(name) >= 0); }

  function moodGain() { return moodAt(run.mood).gain; }

  function fatigueRisk(bold) {
    if (!run) return 0;
    var f = run.fatigue + (bold ? 12 : 4);
    if (f < 55) return 0;
    return clamp((f - 55) / 60, 0, 0.55);
  }

  function trainingPreview(card, bold) {
    var mult = moodGain();
    var raw = (bold ? card.bold : card.gain) * mult;
    var soft = run.stats[card.id] > 80 ? 0.7 : run.stats[card.id] > 60 ? 0.85 : 1;
    var gain = Math.max(1, Math.round(raw * soft));
    var second = Math.max(0, Math.round(card.secondGain * mult * soft));
    var fatigue = Math.round((bold ? card.boldFatigue : card.fatigue) * (1 + run.fatigue * 0.004));
    return {gain: gain, second: second, fatigue: fatigue, risk: fatigueRisk(bold)};
  }

  function applyTraining(card, bold, rng) {
    var p = trainingPreview(card, bold);
    var strained = rng() < p.risk;
    if (strained) {
      run.stats[card.id] = clamp(run.stats[card.id] + Math.round(p.gain * 0.3), 0, 200);
      run.fatigue = clamp(run.fatigue + p.fatigue + 14, 0, 100);
      run.mood = clamp(run.mood - 1, 0, MOODS.length - 1);
    } else {
      run.stats[card.id] = clamp(run.stats[card.id] + p.gain, 0, 200);
      run.stats[card.second] = clamp(run.stats[card.second] + p.second, 0, 200);
      run.fatigue = clamp(run.fatigue + p.fatigue, 0, 100);
      if (card.mood < 0 && !(hasTrait('Even Keel') && rng() < 0.5)) {
        if (rng() < (bold ? 0.5 : 0.24)) run.mood = clamp(run.mood - 1, 0, MOODS.length - 1);
      }
    }
    return {strained: strained, preview: p};
  }

  function applyRest(deep) {
    if (deep) {
      run.fatigue = clamp(run.fatigue - 34, 0, 100);
      run.mood = clamp(run.mood + 1, 0, MOODS.length - 1);
      run.stats.stamina = clamp(run.stats.stamina + 1, 0, 200);
    } else {
      run.fatigue = clamp(run.fatigue - 16, 0, 100);
      run.mood = clamp(run.mood + 2, 0, MOODS.length - 1);
      run.stats.wit = clamp(run.stats.wit + 1, 0, 200);
      run.stats.guts = clamp(run.stats.guts + 1, 0, 200);
    }
  }

  /* --------------------------------------------------------- race model */

  function playerRating() {
    var s = run.stats;
    return s.speed * 0.4 + s.stamina * 0.3 + s.power * 0.15 + s.guts * 0.1 + s.wit * 0.05;
  }

  function aptFor(crest, venue) {
    var surf = crest.apt[venue.surface];
    var band = crest.apt[venue.band];
    return num(surf, 1) * num(band, 1);
  }

  function makeBird(opts) {
    return {
      id: opts.id, name: opts.name, color: opts.color, mark: opts.mark || '#ffffff',
      isPlayer: !!opts.isPlayer, style: opts.style, styleData: styleById(opts.style),
      v0: opts.v0, accel: opts.accel, staminaMax: opts.staminaMax, stamina: opts.staminaMax,
      drainScale: opts.drainScale, gutsFloor: opts.gutsFloor, apt: opts.apt,
      pos: 0, v: 0, lane: opts.lane, laneTarget: opts.lane, laneF: opts.lane,
      blocked: 0, blockedTime: 0, wallAt: -1, finished: false, finishTime: 0, place: 0,
      anim: 0, state: 'idle', callMul: 1, callUntil: 0, kickOn: false, aiVar: opts.aiVar || 1,
      lastSplit: 0, splits: [0, 0, 0, 0], dust: 0
    };
  }

  function buildRace(entry, index) {
    var venue = venueAt(entry.venue);
    var league = leagueAt(run.league);
    var crest = CRESTS[run.crest];
    var s = run.stats;
    var fatiguePenalty = run.fatigue * 0.0016;
    var mood = moodAt(run.mood).mul;
    var apt = aptFor(crest, venue) * mood * (1 - fatiguePenalty);
    var wit = s.wit;
    var player = makeBird({
      id: 0, name: run.name, color: crest.color, mark: crest.mark, isPlayer: true,
      style: race && race.style ? race.style : crest.style,
      v0: 58 + s.speed * 0.13 + s.power * 0.05,
      accel: 24 + s.power * 0.12,
      staminaMax: 62 + s.stamina * 1.05 + s.guts * 0.3,
      drainScale: 1 / (0.72 + s.stamina * 0.0055),
      gutsFloor: 0.66 + s.guts * 0.0013,
      apt: apt, lane: 3
    });
    var rng = seeded(run.seed + ':' + run.league + ':' + index + ':' + entry.venue);
    var rating = league.rating + index * league.ramp + entry.tier * 1.5;
    var field = [player];
    var pool = RIVAL_POOL.slice();
    for (var i = 0; i < 5; i++) {
      var pick = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      var r = rating + (rng() * 12 - 6);
      var lane = i < 3 ? i : i + 1;
      field.push(makeBird({
        id: i + 1, name: pick.name, color: pick.color, mark: '#ffffff', style: pick.style,
        v0: 58 + r * 0.14, accel: 24 + r * 0.1,
        staminaMax: 62 + r * 1.05, drainScale: 1 / (0.72 + r * 0.0055),
        gutsFloor: 0.66 + r * 0.0012, apt: 0.99 + rng() * 0.04, lane: lane,
        aiVar: 0.985 + rng() * 0.03
      }));
    }
    var callWiden = 1 + wit * 0.0035 + (hasTrait('Wide Eye') ? 0.25 : 0);
    var calls = CALLS.map(function (c) {
      var mid = (c.from + c.to) / 2;
      var half = (c.to - c.from) / 2 * callWiden;
      return {id: c.id, label: c.label, color: c.color, dur: c.dur, pace: c.pace,
        recover: c.recover, coach: c.coach, from: clamp(mid - half, 0.02, 0.99),
        to: clamp(mid + half, 0.03, 0.995), used: false, quality: null, at: 0};
    });
    return {
      entry: entry, index: index, venue: venue, surface: surfaceOf(venue), dist: venue.dist,
      field: field, player: player, calls: calls, callIdx: 0, style: player.style,
      t: 0, phase: 'countdown', countdown: REDUCED ? 1.4 : 2.6, finishedCount: 0,
      results: null, camera: 0, chipTimer: 0, weatherT: 0, lastBlockSfx: 0,
      telemetry: {blocked: 0, wall: -1, wallLeft: 0, kickStamina: 0, closeSplit: 0, topSpeed: 0, leftover: 1},
      seed: run.seed + ':' + index
    };
  }

  function paceFor(bird, f) {
    var p = bird.styleData.pace;
    var base;
    if (f < 0.35) base = lerp(p[0], p[1], clamp(f / 0.35, 0, 1));
    else if (f < 0.72) base = p[1];
    else base = lerp(p[1], p[2], clamp((f - 0.72) / 0.28, 0, 1));
    return base;
  }

  function stepRace(dt) {
    var i, b;
    race.t += dt;
    var field = race.field;
    var dist = race.dist;
    var drainSurface = race.surface.drain;
    var leader = 0;
    for (i = 0; i < field.length; i++) if (field[i].pos > leader) leader = field[i].pos;

    for (i = 0; i < field.length; i++) {
      b = field[i];
      if (b.finished) { b.anim += dt * 4; continue; }
      var f = clamp(b.pos / dist, 0, 1);
      var pace = paceFor(b, f);
      if (b.isPlayer) {
        if (race.t < b.callUntil) pace *= b.callMul;
        else if (b.kickOn) pace *= b.callMul;
        if (hasTrait('Gate Fire') && f < 0.25) pace *= 1.03;
        if (hasTrait('Late Fire') && b.kickOn) pace *= 1.04;
        if (hasTrait('Crown Air') && race.venue.surface === 'turf') pace *= 1.03;
      } else {
        var gap = (leader - b.pos) / dist;
        pace *= b.aiVar * (1 + Math.sin(race.t * 1.7 + b.id) * 0.006);
        if (gap > 0.09 && f > 0.5) pace *= 1.02;
        if (gap < 0.01 && f < 0.4) pace *= 0.995;
      }
      var target = b.v0 * pace * b.apt;
      var eco = b.v0 * 0.945;
      if (b.stamina <= 0) {
        if (b.wallAt < 0) {
          b.wallAt = race.t;
          if (b.isPlayer) {
            race.telemetry.wall = race.t;
            race.telemetry.wallLeft = Math.max(0, dist - b.pos);
            sfx('wall', 0.7);
          }
        }
        target = Math.min(target, b.v0 * b.gutsFloor);
      }
      /* pack jostling: a bird directly ahead in the same lane costs speed */
      var blockedNow = false;
      for (var j = 0; j < field.length; j++) {
        if (j === i) continue;
        var o = field[j];
        if (o.finished) continue;
        var dp = o.pos - b.pos;
        if (dp > 0 && dp < 9 && Math.abs(o.laneF - b.laneF) < 0.62) { blockedNow = true; break; }
      }
      if (blockedNow) {
        var loss = hasTrait('Rail Hugger') && b.isPlayer ? 0.972 : 0.945;
        target *= loss;
        b.blocked = 0.4;
        b.blockedTime += dt;
        if (b.isPlayer) {
          race.telemetry.blocked += dt;
          if (race.t - race.lastBlockSfx > 1.1) { race.lastBlockSfx = race.t; sfx('block', 0.35); }
        }
        if (b.laneTarget === b.lane) {
          var up = b.lane > 0 ? b.lane - 1 : b.lane + 1;
          var down = b.lane < 5 ? b.lane + 1 : b.lane - 1;
          b.laneTarget = clamp(Math.random() < 0.5 ? up : down, 0, 5);
        }
      } else if (b.blocked > 0) {
        b.blocked = Math.max(0, b.blocked - dt);
        if (b.blocked <= 0) b.lane = b.laneTarget;
      }
      if (b.laneTarget !== b.lane) {
        b.laneF += (b.laneTarget - b.laneF) * Math.min(1, dt * 2.6);
        if (Math.abs(b.laneTarget - b.laneF) < 0.04) { b.laneF = b.laneTarget; b.lane = b.laneTarget; }
      } else if (Math.abs(b.laneF - b.lane) > 0.001) {
        b.laneF += (b.lane - b.laneF) * Math.min(1, dt * 2.6);
      }

      var dv = target - b.v;
      var rate = b.accel * dt * (dv > 0 ? 1 : 2.2);
      b.v += clamp(dv, -rate, rate);
      if (b.v < 4) b.v = 4;

      /* Every stride costs; anything above the economy pace costs sharply more. */
      var over = b.v - eco;
      var wet = race.venue.surface === 'mud' && b.isPlayer && hasTrait('Rain Lung') ? 0.92 : 1;
      var cost = (b.v * 0.028 + (over > 0 ? Math.pow(over, 1.55) * 0.06 : 0)) *
        drainSurface * b.drainScale * wet;
      if (over < 0) {
        cost *= 0.45;
        var holding = b.isPlayer && race.t < b.callUntil && b.callMul < 1;
        cost -= (-over) * (holding ? 1.5 : 0.7);
      }
      b.stamina -= cost * dt;
      if (b.stamina > b.staminaMax) b.stamina = b.staminaMax;
      if (b.stamina < 0) b.stamina = 0;

      b.pos += b.v * dt;
      if (b.isPlayer && b.v > race.telemetry.topSpeed) race.telemetry.topSpeed = b.v;
      var quarter = Math.min(3, Math.floor(f * 4));
      b.splits[quarter] = Math.max(b.splits[quarter], b.v);

      b.anim += dt * (3 + b.v * 0.09);
      var st = 'run';
      if (b.stamina <= 0.5) st = 'tired';
      else if ((b.isPlayer && (b.kickOn || (race.t < b.callUntil && b.callMul > 1.02))) || b.v > b.v0 * 1.06) st = 'surge';
      b.state = st;
      if (b.state === 'surge' || race.surface !== SURFACES.grass) {
        b.dust += dt * (b.state === 'surge' ? 22 : 9);
      }

      if (b.pos >= dist) {
        b.finished = true;
        b.finishTime = race.t;
        race.finishedCount++;
        b.place = race.finishedCount;
        b.pos = dist;
      }
    }
    if (race.player.finished && race.finishedCount >= 3 && race.phase === 'run') finishRace();
    else if (race.finishedCount >= field.length && race.phase === 'run') finishRace();
  }

  function useCall(auto) {
    if (!race || race.phase !== 'run') return;
    var call = race.calls[race.callIdx];
    if (!call || call.used) return;
    var f = clamp(race.player.pos / race.dist, 0, 1);
    var clean = f >= call.from && f <= call.to;
    call.used = true;
    call.at = f;
    call.quality = clean ? 'clean' : (f < call.from ? 'early' : 'late');
    race.callIdx++;
    var strength = clean ? 1 : 0.6;
    var b = race.player;
    if (call.id === 'kick') {
      b.kickOn = true;
      b.callMul = 1 + (call.pace - 1) * strength;
      b.callUntil = race.t + 99;
      race.telemetry.kickStamina = b.stamina / b.staminaMax;
    } else if (call.id === 'hold') {
      b.callMul = 1 - (1 - call.pace) * strength;
      b.callUntil = race.t + call.dur;
    } else {
      b.callMul = 1 + (call.pace - 1) * strength;
      b.callUntil = race.t + call.dur;
      if (!clean) b.stamina = Math.max(0, b.stamina - 4);
    }
    if (!clean) b.stamina = Math.max(0, b.stamina - 3);
    sfx(clean ? 'call_good' : 'call_late', clean ? 0.9 : 0.6);
    if (call.id !== 'hold') sfx('surge', clean ? 0.6 : 0.35);
    if (kit && !REDUCED) { kit.juice.shake(clean ? 5 : 2, 160); if (clean) kit.juice.hitStop(40); }
    if (Game.play) {
      Game.play.chip(call.label + ' ' + (clean ? 'CLEAN' : call.quality.toUpperCase()),
        clean ? call.color : C.orange, 1.0);
      Game.play.burst(call.id === 'hold' ? 'dot' : 'feather', clean ? 14 : 7, call.color);
    }
    if (auto && Game.play) Game.play.coachLine('Call windows are the gold band on the ring.');
  }

  function analysisLines() {
    var t = race.telemetry;
    var p = race.player;
    var out = [];
    var dist = race.dist;
    if (t.wall > 0) {
      var metresLeft = Math.round(num(t.wallLeft, 0) / 10) * 10;
      out.push('Tank ran dry with ' + metresLeft + 'm to run. Hold earlier or train stamina.');
    }
    var kick = race.calls[2];
    if (kick && kick.used) {
      if (kick.quality === 'clean') out.push('Your kick landed inside the window and held to the line.');
      else if (kick.quality === 'early') out.push('The kick came early. Wait for the gold band on the timeline.');
      else if (kick.quality === 'missed') out.push('The kick window closed unused. That is the whole last quarter given away.');
      else out.push('The kick came late. There was ground left unused.');
    } else out.push('You never called the kick. The last quarter is where races are won.');
    if (t.leftover > 0.22) {
      out.push('You crossed with ' + Math.round(t.leftover * 100) +
        ' percent still in the tank. Kick earlier or run a bolder plan.');
    }
    if (t.blocked > 1.4) out.push('Boxed in for ' + round1(t.blocked) + 's. Stalk wider or use Surge to clear traffic.');
    if (race.surface.drain > 1.15) {
      out.push(race.venue.short + ' ground drains ' + Math.round((race.surface.drain - 1) * 100) + ' percent faster than grass.');
    }
    if (p.place === 1) out.push('Winning closing speed: ' + Math.round(p.splits[3]) + ' on the last quarter.');
    else {
      var winner = race.results && race.results[0];
      if (winner) out.push(winner.name + ' closed at ' + Math.round(winner.splits[3]) + ' against your ' + Math.round(p.splits[3]) + '.');
    }
    return out.slice(0, 3);
  }

  function finishRace() {
    race.phase = 'done';
    var field = race.field.slice();
    for (var i = 0; i < field.length; i++) {
      if (!field[i].finished) {
        field[i].finishTime = race.t + (race.dist - field[i].pos) / Math.max(6, field[i].v);
      }
    }
    field.sort(function (a, b) { return a.finishTime - b.finishTime; });
    for (var k = 0; k < field.length; k++) field[k].place = k + 1;
    race.results = field;
    var p = race.player;
    var place = p.place;
    var tier = race.entry.tier;
    var pts = Math.max(6, 70 - (place - 1) * 11) + tier * 6 + run.league * 8;
    if (place === 1) pts += 20;
    run.points += pts;
    run.fatigue = clamp(run.fatigue + 8 + tier * 2, 0, 100);
    if (place <= 2) run.mood = clamp(run.mood + 1, 0, MOODS.length - 1);
    else if (place >= 5) run.mood = clamp(run.mood - 1, 0, MOODS.length - 1);
    race.telemetry.closeSplit = p.splits[3];
    race.telemetry.leftover = clamp(p.stamina / p.staminaMax, 0, 1);
    if (p.splits[3] > run.bestClose) run.bestClose = p.splits[3];
    run.history.push({place: place, venue: race.entry.venue, points: pts, time: round1(p.finishTime)});
    race.award = {place: place, points: pts, lines: analysisLines()};

    var rec = profile.records;
    rec.races++;
    if (place === 1) rec.wins++;
    if (race.venue.id === 'galecrest' && place === 1) rec.cupWins++;
    var vr = rec.venues[race.entry.venue];
    vr.races++;
    if (vr.place === 0 || place < vr.place) vr.place = place;
    if (vr.time === 0 || p.finishTime < vr.time) vr.time = round1(p.finishTime);
    if (p.splits[3] > rec.bestClose) rec.bestClose = round1(p.splits[3]);

    var unlocked = null;
    if (place === 1 && !profile.crests[3]) { profile.crests[3] = true; unlocked = CRESTS[3]; }
    if (race.venue.id === 'galecrest' && place === 1) {
      if (!profile.crests[5]) { profile.crests[5] = true; unlocked = CRESTS[5]; }
      profile.cleared = profile.cleared || [false, false, false];
      profile.cleared[run.league] = true;
      if (run.league + 1 < LEAGUES.length && profile.league < run.league + 1) profile.league = run.league + 1;
    }
    race.unlocked = unlocked;
    saveRun();
    persist();
    sfx(place === 1 ? 'win' : place <= 3 ? 'unlock' : 'lose', place === 1 ? 0.95 : 0.7);
    if (kit) { kit.juice.shake(place === 1 ? 9 : 4, 260); }
  }

  function endSeason() {
    var rec = profile.records;
    rec.seasons++;
    if (run.points > rec.bestPoints) rec.bestPoints = Math.round(run.points);
    if (!profile.crests[4]) profile.crests[4] = true;
    persist();
  }

  function retireCrest() {
    var bonus = blankStats();
    for (var i = 0; i < STATS.length; i++) {
      var id = STATS[i].id;
      bonus[id] = clamp(Math.floor(run.stats[id] * 0.12), 1, 10);
    }
    var best = run.traits[0];
    for (var k = 0; k < run.traits.length; k++) {
      if (run.traits[k] !== CRESTS[run.crest].trait) best = run.traits[k];
    }
    profile.legacy = {
      name: run.name, crest: run.crest, bonus: bonus, trait: best,
      points: Math.round(run.points)
    };
    profile.retired++;
    profile.run = null;
    run = null;
    persist();
    sfx('legacy', 0.9);
  }

  /* ------------------------------------------------------------- scene */

  function PlayScene() {
    Phaser.Scene.call(this, {key: 'play'});
    this.screen = 'title';
    this.dirty = true;
    this.accumulator = 0;
    this.visualTime = 0;
    this.pointerSeen = new Map();
    this.pointerEdges = [];
    this.hitZones = [];
    this.zoneCount = 0;
    this.particles = [];
    this.chipData = null;
    this.coachText = '';
    this.coachTimer = 0;
    this.banner = null;
    this.selected = null;
    this.bold = false;
    this.pickCrest = 0;
    this.pickLeague = 0;
    this.pickStyle = 1;
    this.tutorStep = 0;
    this.pressPulse = 0;
    this.venueKeys = Object.create(null);
    this.lastForceMode = null;
    this.lastForceStage = null;
    this.resultTab = 0;
  }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  /* ------------------------------------------------------- bake helpers */

  PlayScene.prototype.bake = function (key, w, h, draw) {
    if (this.textures.exists(key)) return key;
    var g = this.make.graphics({x: 0, y: 0, add: false});
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  };

  function poly(g, color, alpha, pts) {
    g.fillStyle(tint(color), alpha == null ? 1 : alpha);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
  }

  var BIRD_FRAMES = ['idle', 'run1', 'run2', 'surge', 'tired', 'win'];

  /* Authored crest-bird silhouette on a 96x84 sheet, feet on the baseline.
   * The body layer is tinted per crest; the mark layer carries beak, eye,
   * chest, plume and legs so every crest keeps the same readable racer. */
  var BIRD_POSE = {
    idle:  {bx: 42, by: 46, bw: 46, bh: 31, hx: 70, hy: 17, wing: 0.05, tail: 0,
      la: [36, 84, 40, 58], lb: [50, 84, 48, 58]},
    run1:  {bx: 42, by: 43, bw: 49, bh: 29, hx: 73, hy: 13, wing: 1.0, tail: -3,
      la: [26, 80, 40, 55], lb: [60, 77, 50, 55]},
    run2:  {bx: 43, by: 47, bw: 49, bh: 29, hx: 72, hy: 18, wing: -0.75, tail: 2,
      la: [56, 82, 46, 58], lb: [30, 74, 42, 58]},
    surge: {bx: 40, by: 45, bw: 56, bh: 26, hx: 80, hy: 21, wing: -1.05, tail: -6,
      la: [22, 78, 38, 55], lb: [66, 74, 52, 55]},
    tired: {bx: 42, by: 52, bw: 45, bh: 31, hx: 66, hy: 33, wing: -0.45, tail: 5,
      la: [36, 84, 40, 63], lb: [50, 84, 48, 63]},
    win:   {bx: 42, by: 42, bw: 44, bh: 33, hx: 70, hy: 8, wing: 1.55, tail: -2,
      la: [36, 84, 40, 54], lb: [50, 84, 48, 54]}
  };

  function poseOf(frame) { return BIRD_POSE[frame] || BIRD_POSE.idle; }

  function drawBirdBody(g, frame) {
    var p = poseOf(frame);
    var bx = p.bx, by = p.by, hw = p.bw / 2, hh = p.bh / 2;
    /* tail: three swept feathers */
    poly(g, '#ffffff', 1, [bx - hw * 0.7, by - 4 + p.tail, bx - hw - 20, by - 12 + p.tail,
      bx - hw - 14, by - 1 + p.tail, bx - hw - 21, by + 7 + p.tail,
      bx - hw - 6, by + 6 + p.tail, bx - hw * 0.6, by + 9]);
    /* far wing, folded behind the body */
    var wy = by - 4 - p.wing * 15;
    poly(g, '#ffffff', 0.72, [bx - hw * 0.55, by - 3, bx + hw * 0.15, wy - 4,
      bx + hw * 0.4, wy + 4, bx - hw * 0.1, by + 9]);
    /* body */
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(bx, by, p.bw, p.bh);
    /* neck, tapered from shoulder to skull */
    poly(g, '#ffffff', 1, [bx + hw * 0.35, by - hh * 0.55,
      p.hx - 8, p.hy + 4, p.hx + 1, p.hy + 8, bx + hw * 0.72, by + hh * 0.3]);
    /* head */
    g.fillEllipse(p.hx, p.hy, 19, 16);
    /* near wing over the flank */
    poly(g, '#ffffff', 1, [bx - hw * 0.5, by - 2, bx + hw * 0.32, wy + 1,
      bx + hw * 0.3, wy + 9, bx - hw * 0.05, by + 11, bx - hw * 0.55, by + 7]);
  }

  function drawBirdMark(g, frame) {
    var p = poseOf(frame);
    var bx = p.bx, by = p.by, hw = p.bw / 2, hh = p.bh / 2;
    var wy = by - 4 - p.wing * 15;
    /* chest highlight */
    g.fillStyle(0xffffff, 0.42);
    g.fillEllipse(bx + hw * 0.45, by + 3, p.bw * 0.5, p.bh * 0.72);
    /* wing feather notches */
    g.lineStyle(1.6, 0xffffff, 0.5);
    for (var k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(bx - hw * 0.34 + k * hw * 0.3, by - 1 + k * 0.6);
      g.lineTo(bx - hw * 0.05 + k * hw * 0.3, lerp(by + 8, wy + 6, 0.35));
      g.strokePath();
    }
    /* crest plume: three spikes off the skull */
    poly(g, '#ffffff', 0.95, [p.hx - 1, p.hy - 6, p.hx - 13, p.hy - 20,
      p.hx - 3, p.hy - 14, p.hx - 7, p.hy - 24, p.hx + 3, p.hy - 12,
      p.hx + 2, p.hy - 21, p.hx + 7, p.hy - 5]);
    /* beak */
    poly(g, '#ffd267', 1, [p.hx + 7, p.hy - 3, p.hx + 22, p.hy + 1, p.hx + 7, p.hy + 5]);
    poly(g, '#e0a03f', 1, [p.hx + 7, p.hy + 1, p.hx + 22, p.hy + 1, p.hx + 7, p.hy + 5]);
    /* eye */
    g.fillStyle(0x0b1024, 1);
    g.fillCircle(p.hx + 2, p.hy - 2, 2.7);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(p.hx + 2.9, p.hy - 2.9, 1);
    /* legs with a visible hock joint */
    var legs = [p.la, p.lb];
    for (var i = 0; i < legs.length; i++) {
      var l = legs[i];
      var midX = (l[0] + l[2]) / 2 + (i ? 4 : -4), midY = (l[1] + l[3]) / 2;
      g.lineStyle(i ? 2.6 : 3, i ? 0xe0a03f : 0xffd267, 1);
      g.beginPath();
      g.moveTo(l[2], l[3]);
      g.lineTo(midX, midY);
      g.lineTo(l[0], l[1]);
      g.strokePath();
      g.beginPath();
      g.moveTo(l[0], l[1]);
      g.lineTo(l[0] + 7, l[1] + 1);
      g.strokePath();
    }
  }

  PlayScene.prototype.makeTextures = function () {
    var self = this;
    this.bake('gc-rr', 64, 64, function (g) {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, 64, 64, 18);
    });
    this.bake('gc-rr-line', 64, 64, function (g) {
      g.lineStyle(2, 0xffffff, 1);
      g.strokeRoundedRect(1, 1, 62, 62, 17);
    });
    this.bake('gc-rr-s', 64, 64, function (g) {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, 64, 64, 10);
    });
    this.bake('gc-rr-s-line', 64, 64, function (g) {
      g.lineStyle(2, 0xffffff, 1);
      g.strokeRoundedRect(1, 1, 62, 62, 9);
    });
    this.bake('gc-round', 128, 128, function (g) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(64, 64, 62);
    });
    this.bake('gc-round-line', 128, 128, function (g) {
      g.lineStyle(3, 0xffffff, 1);
      g.strokeCircle(64, 64, 60);
    });
    this.bake('gc-shadow', 64, 24, function (g) {
      g.fillStyle(0x000000, 0.34);
      g.fillEllipse(32, 12, 60, 18);
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(32, 12, 64, 22);
    });
    this.bake('gc-p-dot', 16, 16, function (g) {
      g.fillStyle(0xffffff, 0.35); g.fillCircle(8, 8, 8);
      g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 4.6);
    });
    this.bake('gc-p-feather', 20, 12, function (g) {
      poly(g, '#ffffff', 1, [0, 6, 9, 0, 20, 5, 9, 12]);
    });
    this.bake('gc-p-spark', 28, 5, function (g) {
      g.fillStyle(0xffffff, 0.9); g.fillRoundedRect(0, 0, 28, 5, 2.5);
    });
    this.bake('gc-p-conf', 9, 9, function (g) {
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 9, 9);
    });
    this.bake('gc-pole', 14, 64, function (g) {
      g.fillStyle(0xdfe8ff, 1); g.fillRect(5, 0, 4, 64);
      g.fillStyle(0xff6f7d, 1); g.fillRoundedRect(0, 0, 14, 16, 3);
    });
    this.bake('gc-gate', 60, 176, function (g) {
      g.fillStyle(0xf2f6ff, 1);
      g.fillRect(4, 0, 8, 176);
      g.fillRect(48, 0, 8, 176);
      g.fillStyle(0xffd267, 1);
      g.fillRoundedRect(0, 0, 60, 22, 5);
      for (var i = 0; i < 8; i++) {
        g.fillStyle(i % 2 ? 0x0b1024 : 0xf2f6ff, 1);
        g.fillRect(14, i * 22, 32, 22);
      }
    });
    for (var i = 0; i < BIRD_FRAMES.length; i++) {
      (function (frame) {
        self.bake('gc-body-' + frame, 96, 84, function (g) { drawBirdBody(g, frame); });
        self.bake('gc-mark-' + frame, 96, 84, function (g) { drawBirdMark(g, frame); });
      })(BIRD_FRAMES[i]);
    }
    this.bake('gc-paddock', 390, 330, function (g) {
      for (var y = 0; y < 210; y += 3) {
        var f = y / 210;
        g.fillStyle(tint(mixHex('#1b2b63', '#4f78b8', f)), 1);
        g.fillRect(0, y, 390, 4);
      }
      g.fillStyle(0xf7e6b0, 0.9); g.fillCircle(310, 62, 26);
      g.fillStyle(0xf7e6b0, 0.18); g.fillCircle(310, 62, 44);
      /* far hills */
      poly(g, '#24406e', 1, [0, 210, 70, 168, 150, 205, 232, 158, 320, 200, 390, 172, 390, 240, 0, 240]);
      poly(g, '#2b5f52', 1, [0, 214, 90, 190, 190, 216, 300, 186, 390, 208, 390, 260, 0, 260]);
      /* field */
      g.fillStyle(0x2f7d54, 1); g.fillRect(0, 236, 390, 94);
      g.fillStyle(0x37955f, 1); g.fillEllipse(195, 300, 520, 150);
      /* fence */
      g.fillStyle(0xdfe8ff, 0.85);
      g.fillRect(0, 240, 390, 4);
      for (var x = 8; x < 390; x += 46) g.fillRect(x, 236, 5, 26);
      /* grass tufts */
      for (var t = 0; t < 40; t++) {
        var gx = (t * 97) % 386, gy = 268 + ((t * 53) % 56);
        g.fillStyle(t % 3 ? 0x49b077 : 0x2a6f4a, 0.7);
        g.fillEllipse(gx, gy, 16, 5);
      }
    });
  };

  /* Relative luminance decides ink or deep label colour on a filled button. */
  function luminance(hex) {
    var v = parseInt(String(hex).replace('#', ''), 16) || 0;
    return (((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114) / 255;
  }

  function mixHex(a, b, f) {
    var ai = parseInt(a.slice(1), 16), bi = parseInt(b.slice(1), 16);
    var ar = (ai >> 16) & 255, ag = (ai >> 8) & 255, ab = ai & 255;
    var br = (bi >> 16) & 255, bg = (bi >> 8) & 255, bb = bi & 255;
    var r = Math.round(ar + (br - ar) * f), g = Math.round(ag + (bg - ag) * f), bl = Math.round(ab + (bb - ab) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  PlayScene.prototype.venueTextures = function (venue) {
    var keys = this.venueKeys[venue.id];
    if (keys) return keys;
    var skyKey = 'gc-sky-' + venue.id;
    var lineKey = 'gc-line-' + venue.id;
    var crowdKey = 'gc-crowd-' + venue.id;
    var trackKey = 'gc-track-' + venue.id;
    var surf = surfaceOf(venue);
    this.bake(skyKey, 390, 330, function (g) {
      for (var y = 0; y < 330; y += 3) {
        g.fillStyle(tint(mixHex(venue.sky[0], venue.sky[1], y / 330)), 1);
        g.fillRect(0, y, 390, 4);
      }
      if (venue.weather === 'night') {
        for (var s = 0; s < 60; s++) {
          var sx = (s * 149) % 388, sy = (s * 71) % 220;
          g.fillStyle(0xffffff, 0.25 + (s % 4) * 0.16);
          g.fillCircle(sx, sy, s % 5 === 0 ? 1.8 : 1.1);
        }
        for (var l = 0; l < 4; l++) {
          g.fillStyle(0xdfe8ff, 0.1);
          g.fillEllipse(60 + l * 92, 130, 150, 210);
        }
      } else if (venue.weather === 'rain') {
        for (var c = 0; c < 7; c++) {
          g.fillStyle(0xffffff, 0.09);
          g.fillEllipse(40 + c * 58, 60 + (c % 3) * 26, 150, 48);
        }
      } else {
        g.fillStyle(tint(venue.sky2), 0.75);
        g.fillCircle(venue.weather === 'dust' ? 296 : 88, 74, 30);
        g.fillStyle(tint(venue.sky2), 0.16);
        g.fillCircle(venue.weather === 'dust' ? 296 : 88, 74, 56);
        for (var k = 0; k < 5; k++) {
          g.fillStyle(0xffffff, 0.12);
          g.fillEllipse(30 + k * 84, 118 + (k % 2) * 40, 130, 34);
        }
      }
    });
    this.bake(lineKey, 390, 120, function (g) {
      var t = venue.skyline;
      g.fillStyle(tint(mixHex(venue.sky[1], '#0b1024', 0.55)), 1);
      if (t === 'hills') {
        poly(g, mixHex(venue.sky[1], '#0b1024', 0.45), 1,
          [0, 120, 0, 78, 62, 44, 128, 82, 196, 40, 268, 84, 330, 52, 390, 80, 390, 120]);
        poly(g, mixHex(venue.sky[1], '#0b1024', 0.68), 1,
          [0, 120, 0, 96, 74, 74, 158, 100, 246, 70, 320, 98, 390, 82, 390, 120]);
        for (var h = 0; h < 9; h++) {
          poly(g, '#16351f', 1, [22 + h * 42, 118, 32 + h * 42, 86, 42 + h * 42, 118]);
        }
      } else if (t === 'mesa') {
        poly(g, '#5d2f37', 1, [0, 120, 0, 96, 40, 96, 52, 56, 118, 56, 128, 96, 210, 96, 224, 44, 300, 44, 312, 96, 390, 96, 390, 120]);
        poly(g, '#7c4142', 1, [0, 120, 0, 108, 90, 100, 190, 110, 290, 98, 390, 108, 390, 120]);
      } else if (t === 'harbor') {
        poly(g, '#1a3552', 1, [0, 120, 0, 90, 390, 90, 390, 120]);
        for (var m = 0; m < 6; m++) {
          var mx = 26 + m * 66;
          g.fillStyle(0x27476b, 1); g.fillRect(mx, 40 + (m % 3) * 12, 5, 52);
          poly(g, '#3a6288', 1, [mx + 5, 44 + (m % 3) * 12, mx + 34, 76, mx + 5, 90]);
        }
      } else if (t === 'towers') {
        for (var w = 0; w < 8; w++) {
          var bx = 6 + w * 48, bh = 40 + ((w * 37) % 56);
          g.fillStyle(0x2c3450, 1); g.fillRect(bx, 120 - bh, 38, bh);
          for (var wy = 0; wy < 4; wy++) {
            g.fillStyle(0xffd267, wy % 2 ? 0.22 : 0.4);
            g.fillRect(bx + 8, 128 - bh + wy * 14, 8, 7);
            g.fillRect(bx + 22, 128 - bh + wy * 14, 8, 7);
          }
        }
      } else if (t === 'dunes') {
        poly(g, '#a8763f', 1, [0, 120, 0, 88, 90, 58, 176, 92, 268, 54, 348, 90, 390, 74, 390, 120]);
        poly(g, '#c99458', 1, [0, 120, 0, 104, 110, 84, 220, 108, 320, 86, 390, 102, 390, 120]);
      } else {
        g.fillStyle(0x1a2a58, 1); g.fillRect(0, 46, 390, 74);
        for (var d = 0; d < 5; d++) {
          var lx = 34 + d * 82;
          g.fillStyle(0x33488a, 1); g.fillRect(lx, 20, 6, 62);
          g.fillStyle(0xffe9a8, 0.95); g.fillRoundedRect(lx - 16, 6, 38, 16, 4);
          g.fillStyle(0xffe9a8, 0.14); g.fillEllipse(lx + 3, 46, 90, 74);
        }
        for (var r2 = 0; r2 < 3; r2++) {
          g.fillStyle(0x243a72, 1);
          g.fillRect(0, 66 + r2 * 18, 390, 12);
        }
      }
    });
    this.bake(crowdKey, 130, 46, function (g) {
      g.fillStyle(tint(venue.crowd), 1);
      g.fillRect(0, 0, 130, 46);
      g.fillStyle(0x000000, 0.2);
      g.fillRect(0, 0, 130, 6);
      var cols = ['#f2f6ff', '#ffd267', '#ff7caa', '#67e8f9', '#b9f36a', '#c2a3ff'];
      for (var i = 0; i < 46; i++) {
        var cx = ((i * 31) % 126) + 2, cy = 10 + ((i * 17) % 26);
        g.fillStyle(tint(cols[i % cols.length]), 0.85);
        g.fillCircle(cx, cy, 3.1);
        g.fillStyle(0x0b1024, 0.35);
        g.fillEllipse(cx, cy + 5, 7, 5);
      }
      g.fillStyle(tint(venue.accent), 0.9);
      g.fillRect(0, 40, 130, 6);
    });
    this.bake(trackKey, 260, 300, function (g) {
      g.fillStyle(tint(surf.color), 1);
      g.fillRect(0, 0, 260, 300);
      for (var l = 0; l < 7; l++) {
        g.fillStyle(tint(surf.color2), l % 2 ? 0.55 : 0.32);
        g.fillRect(0, l * 42, 260, 40);
        g.fillStyle(0xffffff, 0.09);
        g.fillRect(0, l * 42 + 40, 260, 2);
      }
      for (var s = 0; s < 130; s++) {
        var sx = (s * 71) % 250 + 4, sy = (s * 53) % 292 + 4;
        g.fillStyle(tint(surf.dust), 0.14 + (s % 4) * 0.05);
        g.fillEllipse(sx, sy, 9, 4);
      }
      if (venue.surface === 'mud') {
        for (var p = 0; p < 9; p++) {
          g.fillStyle(0x8fa6cc, 0.24);
          g.fillEllipse(28 + (p * 47) % 200, 20 + (p * 61) % 260, 40, 13);
        }
      }
      g.fillStyle(0xffffff, 0.14);
      g.fillRect(0, 0, 260, 3);
    });
    keys = {sky: skyKey, line: lineKey, crowd: crowdKey, track: trackKey};
    this.venueKeys[venue.id] = keys;
    return keys;
  };

  /* ---------------------------------------------------------- ui pools */

  PlayScene.prototype.uiBegin = function () {
    this.rrCursor = 0;
    this.rrsCursor = 0;
    this.lineCursor = 0;
    this.linesCursor = 0;
    this.barCursor = 0;
    this.imgCursor = 0;
    this.textCursor = Object.create(null);
    this.zoneCount = 0;
    /* Depth follows draw order: pooled objects are reused in a different
     * creation order every screen, so equal depths would reorder the frame. */
    this.uiDepth = 20;
  };

  function hideFrom(pool, from) {
    for (var i = from; i < pool.length; i++) if (pool[i].visible) pool[i].setVisible(false);
  }

  PlayScene.prototype.uiEnd = function () {
    hideFrom(this.rrPool, this.rrCursor);
    hideFrom(this.rrsPool, this.rrsCursor);
    hideFrom(this.linePool, this.lineCursor);
    hideFrom(this.linesPool, this.linesCursor);
    hideFrom(this.barPool, this.barCursor);
    hideFrom(this.imgPool, this.imgCursor);
    for (var key in this.textPool) hideFrom(this.textPool[key], this.textCursor[key] || 0);
  };

  PlayScene.prototype.slice = function (pool, cursorKey, texture, inset, depth, x, y, w, h, color, alpha) {
    var n = pool[this[cursorKey]];
    if (!n) {
      n = this.add.nineslice(0, 0, texture, undefined, 64, 64, inset, inset, inset, inset)
        .setOrigin(0, 0).setDepth(depth);
      pool.push(n);
    }
    this[cursorKey]++;
    if (!n.visible) n.setVisible(true);
    if (n._w !== w || n._h !== h) { n.setSize(w, h); n._w = w; n._h = h; }
    n.setPosition(x, y);
    n.setDepth(this.uiDepth++);
    var t = tint(color);
    if (n._tint !== t) { n.setTint(t); n._tint = t; }
    var a = alpha == null ? 1 : alpha;
    if (n.alpha !== a) n.setAlpha(a);
    return n;
  };

  /* Rounded chrome routes by size: the 18px corner sheet needs >=44px of run,
   * smaller panels use the 10px sheet, and thin meters use plain bars. */
  PlayScene.prototype.card = function (x, y, w, h, fill, alpha) {
    if (h >= 46 && w >= 46) return this.slice(this.rrPool, 'rrCursor', 'gc-rr', 20, 21, x, y, w, h, fill, alpha);
    if (h >= 22 && w >= 22) return this.slice(this.rrsPool, 'rrsCursor', 'gc-rr-s', 10, 21, x, y, w, h, fill, alpha);
    return this.bar(x, y, w, h, fill, alpha);
  };

  PlayScene.prototype.outline = function (x, y, w, h, color, alpha) {
    if (h >= 46 && w >= 46) return this.slice(this.linePool, 'lineCursor', 'gc-rr-line', 20, 22, x, y, w, h, color, alpha);
    return this.slice(this.linesPool, 'linesCursor', 'gc-rr-s-line', 10, 22, x, y, w, h, color, alpha);
  };

  PlayScene.prototype.bar = function (x, y, w, h, color, alpha) {
    var n = this.barPool[this.barCursor];
    if (!n) {
      n = this.add.rectangle(0, 0, 8, 8, 0xffffff, 1).setOrigin(0, 0).setDepth(21);
      this.barPool.push(n);
    }
    this.barCursor++;
    if (!n.visible) n.setVisible(true);
    if (n._w !== w || n._h !== h) { n.setSize(Math.max(1, w), Math.max(1, h)); n._w = w; n._h = h; }
    n.setPosition(x, y);
    n.setDepth(this.uiDepth++);
    var t = tint(color);
    if (n._fill !== t) { n.setFillStyle(t, 1); n._fill = t; }
    var a = alpha == null ? 1 : alpha;
    if (n.alpha !== a) n.setAlpha(a);
    return n;
  };

  PlayScene.prototype.sprite = function (key, x, y, depth, originX, originY) {
    var n = this.imgPool[this.imgCursor];
    if (!n) { n = this.add.image(0, 0, 'gc-p-dot').setDepth(23); this.imgPool.push(n); }
    this.imgCursor++;
    if (!n.visible) n.setVisible(true);
    if (n._key !== key) { n.setTexture(key); n._key = key; }
    n.setPosition(x, y);
    n.setOrigin(originX == null ? 0.5 : originX, originY == null ? 0.5 : originY);
    n.setDepth(this.uiDepth++);
    n.setRotation(0);
    n.setScale(1);
    n.setAlpha(1);
    if (n.tintTopLeft !== 0xffffff) n.clearTint();
    return n;
  };

  PlayScene.prototype.label = function (x, y, value, size, color, align, weight) {
    var key = size + ':' + (weight || 'n');
    var pool = this.textPool[key];
    if (!pool) { pool = this.textPool[key] = []; }
    var idx = this.textCursor[key] || 0;
    var n = pool[idx];
    if (!n) {
      n = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: size + 'px', color: C.ink,
        fontStyle: weight === 'b' ? 'bold' : 'normal'
      }).setDepth(24);
      pool.push(n);
    }
    this.textCursor[key] = idx + 1;
    if (!n.visible) n.setVisible(true);
    var next = String(value);
    if (n.text !== next) n.setText(next);
    var col = color || C.ink;
    if (n._color !== col) { n.setColor(col); n._color = col; }
    var ox = align === 'c' ? 0.5 : align === 'r' ? 1 : 0;
    n.setOrigin(ox, 0.5);
    n.setPosition(x, y);
    n.setDepth(this.uiDepth++);
    if (n.alpha !== 1) n.setAlpha(1);
    return n;
  };

  PlayScene.prototype.wrap = function (x, y, value, size, color, width, weight) {
    var key = 'w' + size + ':' + (weight || 'n');
    var pool = this.textPool[key];
    if (!pool) pool = this.textPool[key] = [];
    var idx = this.textCursor[key] || 0;
    var n = pool[idx];
    if (!n) {
      n = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: size + 'px', color: C.ink,
        fontStyle: weight === 'b' ? 'bold' : 'normal',
        wordWrap: {width: width, useAdvancedWrap: true}
      }).setOrigin(0, 0).setLineSpacing(5).setDepth(24);
      pool.push(n);
    }
    this.textCursor[key] = idx + 1;
    if (!n.visible) n.setVisible(true);
    if (n._wrapW !== width) { n.setWordWrapWidth(width, true); n._wrapW = width; }
    var next = String(value);
    if (n.text !== next) n.setText(next);
    var col = color || C.ink;
    if (n._color !== col) { n.setColor(col); n._color = col; }
    n.setPosition(x, y);
    n.setDepth(this.uiDepth++);
    return n;
  };

  PlayScene.prototype.meter = function (x, y, w, h, frac, color, bg) {
    this.bar(x, y, w, h, bg || '#101a3c', 1);
    var f = clamp(frac, 0, 1);
    if (f > 0.004) this.bar(x, y, Math.max(2, w * f), h, color, 1);
  };

  PlayScene.prototype.zone = function (x, y, w, h, fn) {
    var z = this.hitZones[this.zoneCount];
    if (!z) { z = {x: 0, y: 0, w: 0, h: 0, fn: null}; this.hitZones.push(z); }
    this.zoneCount++;
    z.x = x; z.y = y; z.w = w; z.h = h; z.fn = fn;
    return z;
  };

  PlayScene.prototype.button = function (x, y, w, h, text, color, fn, sub) {
    var dark = luminance(color) > 0.55;
    this.card(x, y, w, h, color, 1);
    this.label(x + w / 2, y + h / 2 - (sub ? 9 : 0), text, sub ? 17 : 18, dark ? C.deep : C.ink, 'c', 'b');
    if (sub) this.label(x + w / 2, y + h / 2 + 12, sub, 12, dark ? '#22305e' : C.muted, 'c');
    if (fn) this.zone(x, y, w, h, fn);
  };

  PlayScene.prototype.ghostButton = function (x, y, w, h, text, color, fn) {
    this.card(x, y, w, h, '#101a3c', 0.9);
    this.outline(x, y, w, h, color, 0.85);
    this.label(x + w / 2, y + h / 2, text, 16, color, 'c', 'b');
    if (fn) this.zone(x, y, w, h, fn);
  };

  PlayScene.prototype.crestPortrait = function (x, y, scale, crest, frame, depth) {
    var b = this.sprite('gc-body-' + frame, x, y, depth == null ? 23 : depth, 0.5, 1);
    b.setScale(scale);
    b.setTint(tint(crest.color));
    var m = this.sprite('gc-mark-' + frame, x, y, (depth == null ? 23 : depth) + 1, 0.5, 1);
    m.setScale(scale);
    return b;
  };

  /* --------------------------------------------------------- particles */

  var P_TEX = {dot: 'gc-p-dot', feather: 'gc-p-feather', spark: 'gc-p-spark', conf: 'gc-p-conf'};

  PlayScene.prototype.emit = function (type, x, y, count, color, opts) {
    if (REDUCED) count = Math.ceil(count * 0.4);
    opts = opts || {};
    var tex = P_TEX[type] || P_TEX.dot;
    for (var i = 0; i < count; i++) {
      var p = null;
      for (var k = 0; k < this.particles.length; k++) {
        if (this.particles[k].life <= 0) { p = this.particles[k]; break; }
      }
      if (!p) {
        if (this.particles.length >= MAX_PARTICLES) return;
        p = {img: this.add.image(0, 0, tex).setDepth(9).setVisible(false), life: 0};
        this.particles.push(p);
      }
      var spread = opts.spread == null ? 1 : opts.spread;
      var speed = opts.speed == null ? 90 : opts.speed;
      var ang = opts.angle == null ? Math.random() * Math.PI * 2 : opts.angle + (Math.random() - 0.5) * spread;
      var mag = speed * (0.4 + Math.random() * 0.8);
      p.x = x + (Math.random() - 0.5) * (opts.jitter || 8);
      p.y = y + (Math.random() - 0.5) * (opts.jitter || 8);
      p.vx = Math.cos(ang) * mag + (opts.vx || 0);
      p.vy = Math.sin(ang) * mag + (opts.vy || 0);
      p.grav = opts.grav == null ? 220 : opts.grav;
      p.life = p.max = (opts.life == null ? 0.7 : opts.life) * (0.7 + Math.random() * 0.6);
      p.scale0 = (opts.scale == null ? 1 : opts.scale) * (0.7 + Math.random() * 0.6);
      p.scale1 = opts.scale1 == null ? 0.2 : opts.scale1;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * (opts.spin == null ? 6 : opts.spin);
      p.drag = opts.drag == null ? 1.4 : opts.drag;
      if (p.img.texture.key !== tex) p.img.setTexture(tex);
      p.img.setTint(tint(color || C.white));
      p.img.setVisible(true);
    }
  };

  PlayScene.prototype.burst = function (type, count, color) {
    var b = race && race.player ? this.birdScreen(race.player) : {x: 195, y: 420};
    this.emit(type, b.x, b.y - 24, count, color, {speed: 150, life: 0.6, grav: 90, spread: 2.4});
  };

  PlayScene.prototype.updateParticles = function (dt, shakeX, shakeY) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.img.setVisible(false); continue; }
      p.vx -= p.vx * p.drag * dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var f = p.life / p.max;
      p.img.setPosition(p.x + (shakeX || 0), p.y + (shakeY || 0));
      p.img.setRotation(p.rot);
      p.img.setAlpha(clamp(f * 1.4, 0, 1));
      p.img.setScale(lerp(p.scale1, p.scale0, f));
    }
  };

  PlayScene.prototype.clearParticles = function () {
    for (var i = 0; i < this.particles.length; i++) {
      this.particles[i].life = 0;
      this.particles[i].img.setVisible(false);
    }
  };

  /* -------------------------------------------------------- transients */

  PlayScene.prototype.chip = function (text, color, seconds) {
    this.chipData = {text: String(text), color: color || C.ink, timer: seconds == null ? 0.9 : seconds};
    this.dirty = true;
  };
  PlayScene.prototype.coachLine = function (text, seconds) {
    this.coachText = String(text);
    this.coachTimer = seconds == null ? (REDUCED ? 2.2 : 3.4) : seconds;
    this.dirty = true;
  };
  PlayScene.prototype.showBanner = function (title, sub, color, seconds) {
    this.banner = {title: String(title), sub: sub ? String(sub) : '', color: color || C.gold,
      timer: seconds == null ? 1.8 : seconds, life: seconds == null ? 1.8 : seconds};
    this.dirty = true;
  };

  /* ------------------------------------------------------------ create */

  PlayScene.prototype.create = function () {
    configureRetinaScene(this);
    Game.play = this;
    this.rrPool = [];
    this.rrsPool = [];
    this.linePool = [];
    this.linesPool = [];
    this.barPool = [];
    this.imgPool = [];
    this.textPool = Object.create(null);
    this.textCursor = Object.create(null);

    if (kit) kit.loader.progress(0.35);
    this.makeTextures();
    if (kit) kit.loader.progress(0.6);
    this.venueTextures(VENUES[0]);

    this.bg = this.add.rectangle(0, 0, W, H, tint(C.deep), 1).setOrigin(0, 0).setDepth(0);
    this.skyImg = this.add.image(0, 0, 'gc-sky-verdant').setOrigin(0, 0).setDepth(1).setVisible(false);
    this.lineTile = this.add.tileSprite(0, 300, W, 120, 'gc-line-verdant').setOrigin(0, 0).setDepth(2).setVisible(false);
    this.crowdTile = this.add.tileSprite(0, 406, W, 46, 'gc-crowd-verdant').setOrigin(0, 0).setDepth(3).setVisible(false);
    this.trackTile = this.add.tileSprite(0, 448, W, 300, 'gc-track-verdant').setOrigin(0, 0).setDepth(4).setVisible(false);
    this.rail = this.add.rectangle(0, 444, W, 5, tint('#dfe8ff'), 0.5).setOrigin(0, 0).setDepth(5).setVisible(false);
    this.railLow = this.add.rectangle(0, 744, W, 6, tint('#0b1024'), 0.55).setOrigin(0, 0).setDepth(8).setVisible(false);

    this.poles = [];
    var i;
    for (i = 0; i < 6; i++) {
      this.poles.push(this.add.image(0, 0, 'gc-pole').setOrigin(0.5, 1).setDepth(5).setVisible(false));
    }
    this.gateImg = this.add.image(-200, 448, 'gc-gate').setOrigin(0.5, 0).setDepth(5).setVisible(false);
    this.runners = [];
    for (i = 0; i < 6; i++) {
      this.runners.push({
        shadow: this.add.image(0, 0, 'gc-shadow').setDepth(6).setVisible(false),
        body: this.add.image(0, 0, 'gc-body-idle').setOrigin(0.5, 1).setDepth(7).setVisible(false),
        mark: this.add.image(0, 0, 'gc-mark-idle').setOrigin(0.5, 1).setDepth(7).setVisible(false),
        tag: this.add.text(0, 0, '', {fontFamily: FONT, fontSize: '18px', color: C.ink, fontStyle: 'bold'}).setOrigin(0.5, 1).setDepth(9).setVisible(false)
      });
    }

    this.installInputBridges();
    if (kit) { kit.loader.progress(0.85); }

    var self = this;
    var warm = kit ? kit.audio.preload(['tap', 'train', 'gate', 'call_good', 'call_late', 'surge', 'block', 'wall']) : Promise.resolve();
    Promise.resolve(warm).then(function () {
      if (kit) { kit.loader.progress(1); kit.loader.hide(); kit.registerPWA(); }
      root.__GC_READY = true;
    });

    this.applyForce(true);
    if (this.screen === 'title') this.showTitle();
    this.renderScreen();
  };

  PlayScene.prototype.installInputBridges = function () {
    var self = this;
    /* Window-level listener registered AFTER GGKit init so a claim made here
     * is never overwritten by the kit's own pointer bookkeeping. */
    this.pointerEdgeHandler = function (event) {
      if (kit && kit.paused) return;
      self.pointerEdges.push({id: event.pointerId, x: event.clientX, y: event.clientY});
      if (self.pointerEdges.length > 24) self.pointerEdges.shift();
      if (kit && !kit.input.pointers.has(event.pointerId)) {
        kit.input.pointers.set(event.pointerId, {
          x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
          downAt: performance.now(), zone: null
        });
      }
    };
    root.addEventListener('pointerdown', this.pointerEdgeHandler, {passive: true});
  };

  PlayScene.prototype.gamePoint = function (p) {
    var rect = this.game.canvas.getBoundingClientRect();
    return {
      x: (p.x - rect.left) / Math.max(1, rect.width) * W,
      y: (p.y - rect.top) / Math.max(1, rect.height) * H
    };
  };

  PlayScene.prototype.readInput = function () {
    if (!kit) return;
    var self = this, edge;
    while (this.pointerEdges.length) {
      edge = this.pointerEdges.shift();
      if (!this.pointerSeen.has(edge.id)) {
        this.pointerSeen.set(edge.id, true);
        var ep = this.gamePoint(edge);
        this.tapAt(ep.x, ep.y);
      }
    }
    kit.input.pointers.forEach(function (p, id) {
      if (!self.pointerSeen.has(id)) {
        self.pointerSeen.set(id, true);
        var point = self.gamePoint(p);
        self.tapAt(point.x, point.y);
      }
    });
    this.pointerSeen.forEach(function (v, id) {
      if (!kit.input.pointers.has(id)) self.pointerSeen.delete(id);
    });
    var codes = ['Space', 'Enter', 'Escape', 'KeyR', 'KeyS', 'KeyB', 'ArrowUp', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i], down = kit.input.keyDown(code), fired = down && !keyEdges[code];
      keyEdges[code] = down;
      if (fired) this.keyAction(code);
    }
  };

  PlayScene.prototype.tapAt = function (x, y) {
    for (var i = (this.zoneCount || 0) - 1; i >= 0; i--) {
      var z = this.hitZones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        this.pressPulse = REDUCED ? 0.05 : 0.12;
        if (z.fn) z.fn();
        return;
      }
    }
  };

  PlayScene.prototype.keyAction = function (code) {
    if (code === 'Escape') { this.openPause(); return; }
    if (code === 'KeyS') { this.openPause(); return; }
    if (this.screen === 'race') {
      if (code === 'Space' || code === 'Enter') useCall(false);
      if (code === 'KeyR') this.restartCurrent();
      return;
    }
    if (code === 'KeyR' && (this.screen === 'season' || this.screen === 'prep')) { this.restartCurrent(); return; }
    var digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    var d = digits.indexOf(code);
    if (this.screen === 'season') {
      if (d >= 0 && d < 5) { this.openTraining(d); return; }
      if (d === 5) { this.doRest(true); return; }
      if (code === 'KeyB') { this.doRest(false); return; }
      if (code === 'Space' || code === 'Enter') { this.openTraining(0); return; }
    } else if (this.screen === 'crest') {
      if (d >= 0 && d < CRESTS.length) { this.selectCrest(d); return; }
      if (code === 'Space' || code === 'Enter') { this.confirmCrest(); return; }
      if (code === 'ArrowLeft') { this.selectCrest((this.pickCrest + CRESTS.length - 1) % CRESTS.length); return; }
      if (code === 'ArrowRight') { this.selectCrest((this.pickCrest + 1) % CRESTS.length); return; }
    } else if (this.screen === 'prep') {
      if (d >= 0 && d < STYLES.length) { this.pickStyle = d; this.dirty = true; sfx('tap', 0.5); return; }
      if (code === 'Space' || code === 'Enter') { this.startRace(); return; }
    } else if (this.screen === 'train') {
      if (code === 'Space' || code === 'Enter' || d === 0) { this.commitTraining(false); return; }
      if (d === 1) { this.commitTraining(true); return; }
    } else if (this.screen === 'title') {
      if (code === 'Space' || code === 'Enter') { this.primaryTitleAction(); return; }
    } else if (code === 'Space' || code === 'Enter') {
      this.advanceScreen();
    }
  };

  PlayScene.prototype.openPause = function () {
    if (!kit) return;
    var self = this;
    kit.openSettings([function (box, row) {
      row('Coach hints', function () { return self.hintsOn !== false; },
        function (v) { self.hintsOn = v; });
    }]);
  };

  /* --------------------------------------------------- screen switching */

  PlayScene.prototype.setScreen = function (name) {
    this.screen = name;
    this.dirty = true;
    this.pointerSeen.clear();
    this.pointerEdges.length = 0;
    this.zoneCount = 0;
    this.syncProbe();
  };

  PlayScene.prototype.showTitle = function () {
    race = null;
    this.setScreen('title');
    music('theme');
  };

  PlayScene.prototype.primaryTitleAction = function () {
    if (profile.run && validRun(profile.run)) { loadRun(); this.enterSeason(); }
    else this.openCrestSelect();
  };

  PlayScene.prototype.openCrestSelect = function () {
    this.pickCrest = profile.crests[profile.lastCrest] ? profile.lastCrest : 0;
    this.pickLeague = profile.league;
    this.setScreen('crest');
    sfx('tap', 0.6);
  };

  PlayScene.prototype.selectCrest = function (index) {
    if (!profile.crests[index]) { sfx('call_late', 0.4); this.chip('LOCKED  ' + CRESTS[index].unlock, C.orange, 1.0); return; }
    this.pickCrest = index;
    this.dirty = true;
    sfx('tap', 0.5);
  };

  PlayScene.prototype.confirmCrest = function () {
    startCareer(this.pickCrest, this.pickLeague);
    sfx('bond', 0.7);
    this.enterSeason();
    if (!profile.tutorial) {
      this.tutorStep = 0;
      this.coachLine('Tap a training card. Its exact gain and fatigue show before you commit.', 5);
    }
  };

  PlayScene.prototype.enterSeason = function () {
    if (!run) { this.showTitle(); return; }
    if (run.turn > TURNS) { this.enterSeasonEnd(); return; }
    var entry = raceAtTurn(run.turn);
    this.setScreen('season');
    music('theme');
    if (entry) this.chip('RACE DAY  ' + venueAt(entry.venue).short, venueAt(entry.venue).accent, 1.0);
  };

  PlayScene.prototype.openTraining = function (index) {
    if (!run) return;
    this.selected = clamp(index, 0, TRAINING.length - 1);
    this.setScreen('train');
    sfx('tap', 0.6);
    if (!profile.tutorial && this.tutorStep < 1) {
      this.tutorStep = 1;
      this.coachLine('Steady is the safe gain. Push costs more fatigue and can strain.', 5);
    }
  };

  PlayScene.prototype.commitTraining = function (bold) {
    if (!run || this.screen !== 'train') return;
    var card = TRAINING[this.selected];
    var rng = seeded(run.seed + ':t' + run.turn + ':' + card.id + ':' + (bold ? 1 : 0));
    var out = applyTraining(card, bold, rng);
    if (out.strained) {
      sfx('strain', 0.8);
      this.chip('STRAIN  ' + card.label, C.red, 1.0);
      if (kit) kit.juice.shake(6, 200);
      this.emit('dot', 195, 300, 12, C.red, {speed: 130, life: 0.6});
    } else {
      sfx('train', 0.85);
      this.chip('+' + out.preview.gain + ' ' + card.id.toUpperCase(), card.color, 0.9);
      if (kit) kit.juice.shake(3, 120);
      this.emit('spark', 195, 300, 10, card.color, {speed: 200, life: 0.5, grav: 40, spread: 6});
      this.emit('dot', 195, 300, 8, card.color, {speed: 120, life: 0.5});
    }
    this.afterTurnAction();
  };

  PlayScene.prototype.doRest = function (deep) {
    if (!run || this.screen !== 'season') return;
    applyRest(deep);
    sfx(deep ? 'rest' : 'bond', 0.8);
    this.chip(deep ? 'RESTED' : 'BONDED', deep ? C.cyan : C.rose, 0.9);
    this.emit('dot', 195, 300, 10, deep ? C.cyan : C.rose, {speed: 90, life: 0.8, grav: -30});
    this.afterTurnAction();
  };

  PlayScene.prototype.afterTurnAction = function () {
    var entry = raceAtTurn(run.turn);
    saveRun();
    if (entry) { this.openPrep(entry); return; }
    run.turn++;
    saveRun();
    if (run.turn > TURNS) { this.enterSeasonEnd(); return; }
    this.setScreen('season');
  };

  PlayScene.prototype.openPrep = function (entry) {
    this.prepEntry = entry || raceAtTurn(run.turn) || CALENDAR[0];
    this.pickStyle = 0;
    var crest = CRESTS[run.crest];
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === crest.style) this.pickStyle = i;
    this.venueTextures(venueAt(this.prepEntry.venue));
    this.setScreen('prep');
    music('theme');
    if (!profile.tutorial && this.tutorStep < 2) {
      this.tutorStep = 2;
      this.coachLine('Pick a plan. Fit shows how it suits your crest and this ground.', 5);
    }
  };

  PlayScene.prototype.startRace = function () {
    var entry = this.prepEntry || raceAtTurn(run.turn) || CALENDAR[0];
    var index = raceIndexOfTurn(entry.turn);
    race = null;
    race = buildRace(entry, index < 0 ? 0 : index);
    race.player.style = STYLES[this.pickStyle].id;
    race.player.styleData = STYLES[this.pickStyle];
    race.style = race.player.style;
    this.venueTextures(race.venue);
    this.clearParticles();
    this.setScreen('race');
    music(race.venue.id === 'galecrest' ? 'cup' : 'race');
    sfx('gate', 0.9);
    this.showBanner(race.venue.name, Math.round(race.dist) + 'm  ' + race.surface.label, race.venue.accent, 1.6);
    if (!profile.tutorial && this.tutorStep < 3) {
      this.tutorStep = 3;
      this.coachLine('Tap the call button when the marker sits in the gold band.', 6);
    }
  };

  PlayScene.prototype.finishToResult = function () {
    this.setScreen('result');
    this.resultTab = 0;
    music('theme');
    var place = race.award.place;
    this.showBanner(placeLabel(place), race.venue.name, placeColor(place), REDUCED ? 1.0 : 1.9);
    if (place === 1) {
      this.emit('conf', 195, 240, REDUCED ? 14 : 40, C.gold, {speed: 260, life: 1.5, grav: 320, spread: 6.28, jitter: 120});
      this.emit('feather', 195, 300, 16, CRESTS[run.crest].color, {speed: 200, life: 1.1, grav: 130, spread: 6.28});
    }
    if (race.unlocked) {
      sfx('unlock', 0.9);
      this.chip('CREST UNLOCKED  ' + race.unlocked.name, C.violet, 1.0);
    }
    if (!profile.tutorial) { profile.tutorial = true; persist(); }
  };

  PlayScene.prototype.advanceFromResult = function () {
    var wasCup = race && race.venue.id === 'galecrest';
    race = null;
    run.turn++;
    saveRun();
    if (run.turn > TURNS || wasCup) this.enterSeasonEnd();
    else this.setScreen('season');
  };

  PlayScene.prototype.enterSeasonEnd = function () {
    endSeason();
    this.setScreen('seasonend');
    music('theme');
    var grade = gradeFor(run.points);
    this.showBanner('SEASON ' + grade.label, Math.round(run.points) + ' points', grade.color, REDUCED ? 1.0 : 2.0);
    if (!REDUCED) this.emit('conf', 195, 260, 26, grade.color, {speed: 220, life: 1.4, grav: 300, spread: 6.28, jitter: 140});
  };

  PlayScene.prototype.openLegacy = function () { this.setScreen('legacy'); sfx('tap', 0.6); };

  PlayScene.prototype.confirmLegacy = function () {
    retireCrest();
    this.setScreen('title');
    this.showBanner('LEGACY SAVED', 'The next crest inherits the work', C.violet, 1.8);
    this.emit('feather', 195, 380, 20, C.violet, {speed: 150, life: 1.2, grav: 60, spread: 6.28});
  };

  PlayScene.prototype.releaseNoLegacy = function () {
    profile.run = null;
    run = null;
    persist();
    sfx('tap', 0.6);
    this.showTitle();
  };

  PlayScene.prototype.openRecords = function () { this.setScreen('records'); sfx('tap', 0.6); };

  PlayScene.prototype.advanceScreen = function () {
    if (this.screen === 'result') this.advanceFromResult();
    else if (this.screen === 'seasonend') this.openLegacy();
    else if (this.screen === 'records' || this.screen === 'legacy') this.showTitle();
  };

  PlayScene.prototype.restartCurrent = function () {
    this.clearParticles();
    if (this.screen === 'race' && race) { this.startRace(); return; }
    if (run) { this.enterSeason(); return; }
    this.showTitle();
  };

  /* ------------------------------------------------------------- probe */

  PlayScene.prototype.syncProbe = function () {
    var s = root.__gc.state;
    if (!s || s === bootState) s = root.__gc.state = {};
    s.mode = this.screen;
    s.ready = !!root.__GC_READY;
    s.league = run ? run.league : profile.league;
    s.crest = run ? CRESTS[run.crest].id : 'none';
    s.turn = run ? run.turn : 0;
    s.score = run ? Math.round(run.points) : profile.records.bestPoints;
    s.seasons = profile.records.seasons;
    s.wins = profile.records.wins;
    if (!s.crests || s.crestStamp !== profile.crests.join('')) {
      s.crests = profile.crests.slice();
      s.crestStamp = profile.crests.join('');
    }
    if (this.screen === 'race' && race) {
      s.stage = race.venue.id;
      s.venue = race.venue.name;
      s.progress = clamp(race.player.pos / race.dist, 0, 1);
      s.health = clamp(race.player.stamina / race.player.staminaMax, 0, 1);
      s.place = livePlace(race.player);
      if (!Array.isArray(s.calls) || s.calls.length !== race.calls.length) s.calls = ['open', 'open', 'open'];
      for (var ci = 0; ci < race.calls.length; ci++) {
        s.calls[ci] = race.calls[ci].used ? race.calls[ci].quality : 'open';
      }
    } else {
      s.stage = run ? 'turn' + run.turn : this.screen;
      s.venue = run && nextRaceFrom(run.turn) ? venueAt(nextRaceFrom(run.turn).venue).name : 'none';
      s.progress = run ? clamp((run.turn - 1) / TURNS, 0, 1) : 0;
      s.health = run ? clamp(1 - run.fatigue / 100, 0, 1) : 1;
      s.place = race && race.award ? race.award.place : 0;
      s.calls = race && race.calls ? race.calls.map(function (c) { return c.used ? c.quality : 'open'; }) : null;
      s.leftover = race && race.telemetry ? round1(race.telemetry.leftover * 100) : null;
      s.lines = race && race.award ? race.award.lines : null;
      s.times = race && race.results ? race.results.map(function (b) {
        return b.name + ' ' + round1(b.finishTime) + (b.isPlayer ? '*' : '');
      }) : null;
    }
  };

  function livePlace(bird) {
    var n = 1;
    for (var i = 0; i < race.field.length; i++) {
      var o = race.field[i];
      if (o === bird) continue;
      if (o.finished && !bird.finished) n++;
      else if (o.pos > bird.pos) n++;
    }
    return n;
  }

  PlayScene.prototype.applyForce = function (initial) {
    var h = root.__gc;
    var fm = h.forceMode == null ? null : String(h.forceMode);
    var fs = h.forceStage == null ? null : h.forceStage;
    if (!initial && fm === this.lastForceMode && fs === this.lastForceStage) return;
    this.lastForceMode = fm;
    this.lastForceStage = fs;
    if (!fm) return;
    if (fm === 'title') { this.showTitle(); return; }
    if (fm === 'crest') { this.openCrestSelect(); return; }
    if (fm === 'records') { this.openRecords(); return; }
    if (!run) startCareer(profile.lastCrest, profile.league);
    if (fm === 'season') { this.enterSeason(); return; }
    if (fm === 'train') { this.openTraining(0); return; }
    if (fm === 'seasonend') { this.enterSeasonEnd(); return; }
    if (fm === 'legacy') { this.enterSeasonEnd(); this.openLegacy(); return; }
    if (fm === 'prep' || fm === 'race' || fm === 'result') {
      var idx = 0;
      if (fs != null) {
        if (typeof fs === 'number' || /^\d+$/.test(String(fs))) idx = clamp(Number(fs) | 0, 0, CALENDAR.length - 1);
        else {
          for (var i = 0; i < CALENDAR.length; i++) if (VENUES[CALENDAR[i].venue].id === String(fs)) idx = i;
        }
      }
      var entry = CALENDAR[idx];
      run.turn = entry.turn;
      this.openPrep(entry);
      if (fm === 'race') this.startRace();
      if (fm === 'result') {
        this.startRace();
        race.phase = 'run';
        var guard = 0;
        while (race.phase === 'run' && guard < 9000) { stepRace(STEP); guard++; }
        if (race.phase !== 'done') finishRace();
        this.finishToResult();
      }
    }
  };

  /* ------------------------------------------------------------ update */

  PlayScene.prototype.update = function (time, delta) {
    if (!kit) return;
    var dt = Math.min(0.05, delta / 1000);
    this.applyForce(false);
    this.readInput();
    var j = kit.juice.frame();
    this.visualTime += dt;
    if (this.pressPulse > 0) this.pressPulse = Math.max(0, this.pressPulse - dt);
    if (this.chipData) {
      this.chipData.timer -= dt;
      if (this.chipData.timer <= 0) this.chipData = null;
    }
    if (this.coachTimer > 0) this.coachTimer = Math.max(0, this.coachTimer - dt);
    if (this.banner) {
      this.banner.timer -= dt;
      if (this.banner.timer <= 0) this.banner = null;
    }

    if (this.screen === 'race' && race) {
      if (race.phase === 'countdown') {
        race.countdown -= dt;
        if (race.countdown <= 0) {
          race.phase = 'run';
          sfx('gate', 0.8);
          this.emit('dot', 60, 700, 10, C.white, {speed: 160, life: 0.5});
        }
      } else if (race.phase === 'run') {
        if (!j.frozen) {
          this.accumulator += dt;
          var steps = 0;
          while (this.accumulator >= STEP && steps < MAX_STEPS) {
            stepRace(STEP);
            this.accumulator -= STEP;
            steps++;
          }
          if (steps >= MAX_STEPS) this.accumulator = 0;
        }
        var cur = race.calls[race.callIdx];
        if (cur && !cur.used) {
          var cf = clamp(race.player.pos / race.dist, 0, 1);
          if (cf > cur.to + 0.05) {
            cur.used = true;
            cur.quality = 'missed';
            cur.at = cf;
            race.callIdx++;
            sfx('call_late', 0.3);
            this.chip(cur.label + ' WINDOW CLOSED', C.dim, 0.9);
          }
        }
      } else if (race.phase === 'done') {
        race.doneTimer = (race.doneTimer || 0) + dt;
        if (race.doneTimer > (REDUCED ? 0.9 : 1.6)) { this.finishToResult(); }
      }
      this.raceWeather(dt);
      this.renderRace(j.dx, j.dy);
      this.syncProbe();
    } else {
      this.renderScreen();
    }
    this.updateParticles(dt, 0, 0);
  };

  PlayScene.prototype.raceWeather = function (dt) {
    if (REDUCED || !race) return;
    race.weatherT += dt;
    var v = race.venue;
    if (v.weather === 'rain' && race.weatherT > 0.05) {
      race.weatherT = 0;
      this.emit('spark', Math.random() * W, 100 + Math.random() * 120, 1, '#b9c6e0',
        {speed: 20, life: 0.55, grav: 900, vx: -60, spread: 0.2, angle: 1.5, scale: 0.7, drag: 0.2});
    } else if (v.weather === 'dust' && race.weatherT > 0.22) {
      race.weatherT = 0;
      this.emit('dot', W + 10, 430 + Math.random() * 260, 1, v.accent,
        {speed: 30, life: 1.6, grav: -6, vx: -110, spread: 0.6, scale: 0.6, drag: 0.1});
    } else if (v.weather === 'gulls' && race.weatherT > 1.4) {
      race.weatherT = 0;
      this.emit('feather', W + 12, 150 + Math.random() * 90, 1, '#e8f1ff',
        {speed: 20, life: 2.2, grav: -4, vx: -70, spread: 0.3, scale: 0.9, drag: 0.05, spin: 1.2});
    }
  };

  /* ------------------------------------------------------- race render */

  function laneY(f) {
    var i = clamp(Math.floor(f), 0, 5), n = clamp(i + 1, 0, 5);
    return lerp(LANE_Y[i], LANE_Y[n], clamp(f - i, 0, 1));
  }
  function laneScale(f) {
    var i = clamp(Math.floor(f), 0, 5), n = clamp(i + 1, 0, 5);
    return lerp(LANE_SCALE[i], LANE_SCALE[n], clamp(f - i, 0, 1));
  }

  PlayScene.prototype.birdScreen = function (b) {
    var cam = race ? race.camera : 0;
    return {x: ANCHOR_X + (b.pos - cam) * PPM, y: laneY(b.laneF)};
  };

  function frameFor(b, visualTime) {
    if (b.finished && b.place === 1) return 'win';
    if (b.state === 'tired') return (Math.floor(visualTime * 5 + b.id) % 2) ? 'tired' : 'run2';
    if (b.state === 'surge') return 'surge';
    if (b.v < 8) return 'idle';
    return (Math.floor(b.anim) % 2) ? 'run1' : 'run2';
  }

  PlayScene.prototype.renderRace = function (dx, dy) {
    var v = race.venue;
    var keys = this.venueTextures(v);
    var i;
    var target = race.player.pos - 42;
    race.camera = race.phase === 'countdown' ? -14 : lerp(race.camera, target, 0.22);
    var cam = race.camera;
    var camX = cam * PPM;

    if (this.skyImg.texture.key !== keys.sky) this.skyImg.setTexture(keys.sky);
    this.skyImg.setPosition(dx * 0.2, 86 + dy * 0.2).setVisible(true);
    if (this.lineTile.texture.key !== keys.line) this.lineTile.setTexture(keys.line);
    this.lineTile.setPosition(0, 296 + dy * 0.3).setVisible(true);
    this.lineTile.tilePositionX = camX * 0.1;
    if (this.crowdTile.texture.key !== keys.crowd) this.crowdTile.setTexture(keys.crowd);
    this.crowdTile.setPosition(0, 402 + dy * 0.5).setVisible(true);
    this.crowdTile.tilePositionX = camX * 0.34;
    if (this.trackTile.texture.key !== keys.track) this.trackTile.setTexture(keys.track);
    this.trackTile.setPosition(0, 448 + dy).setVisible(true);
    this.trackTile.tilePositionX = camX;
    this.rail.setPosition(dx, 444 + dy).setVisible(true);
    this.railLow.setPosition(dx, 744 + dy).setVisible(true);

    var startPole = Math.floor(cam / 200) * 200;
    for (i = 0; i < this.poles.length; i++) {
      var m = startPole + i * 200;
      var px = ANCHOR_X + (m - cam) * PPM + dx;
      var pole = this.poles[i];
      if (m <= 0 || m >= race.dist || px < -20 || px > W + 20) { if (pole.visible) pole.setVisible(false); continue; }
      pole.setVisible(true).setPosition(px, 466 + dy).setScale(0.7);
    }
    var gx = ANCHOR_X + (race.dist - cam) * PPM + dx;
    if (gx > -80 && gx < W + 80) this.gateImg.setVisible(true).setPosition(gx, 436 + dy);
    else if (this.gateImg.visible) this.gateImg.setVisible(false);

    for (i = 0; i < this.runners.length; i++) {
      var r = this.runners[i];
      var b = race.field[i];
      if (!b) { r.body.setVisible(false); r.mark.setVisible(false); r.shadow.setVisible(false); r.tag.setVisible(false); continue; }
      var sx = ANCHOR_X + (b.pos - cam) * PPM + dx;
      var sy = laneY(b.laneF) + dy;
      if (sx < -70 || sx > W + 70) {
        if (r.body.visible) { r.body.setVisible(false); r.mark.setVisible(false); r.shadow.setVisible(false); r.tag.setVisible(false); }
        continue;
      }
      var sc = laneScale(b.laneF) * 0.56;
      var frame = frameFor(b, this.visualTime);
      var bob = b.finished ? 0 : Math.sin(b.anim * 3.1) * 2 * (b.state === 'surge' ? 1.6 : 1);
      if (r.body.texture.key !== 'gc-body-' + frame) r.body.setTexture('gc-body-' + frame);
      if (r.mark.texture.key !== 'gc-mark-' + frame) r.mark.setTexture('gc-mark-' + frame);
      r.body.setVisible(true).setPosition(sx, sy + bob).setScale(sc).setDepth(6 + b.laneF * 0.2);
      if (r.body._tint !== b.color) { r.body.setTint(tint(b.color)); r.body._tint = b.color; }
      r.mark.setVisible(true).setPosition(sx, sy + bob).setScale(sc).setDepth(6 + b.laneF * 0.2 + 0.05);
      r.shadow.setVisible(true).setPosition(sx, sy + 3).setScale(sc * 1.05, sc * 0.9).setAlpha(b.isPlayer ? 0.75 : 0.5);
      if (r.shadow._tint !== b.color) { r.shadow.setTint(tint(b.isPlayer ? b.color : '#0b1024')); r.shadow._tint = b.color; }
      r.shadow.setDepth(5.5);
      if (b.isPlayer) {
        r.tag.setVisible(true).setPosition(sx, sy - 74 * sc - 4).setDepth(9);
        if (r.tag.text !== '▼') r.tag.setText('▼');
        if (r.tag._color !== b.color) { r.tag.setColor(b.color); r.tag._color = b.color; }
        if (b.dust >= 1 && !REDUCED) {
          b.dust -= 1;
          this.emit('dot', sx - 16 * sc, sy - 4, 1, race.surface.dust,
            {speed: 60, life: 0.42, grav: 40, vx: -70, spread: 1.2, scale: 0.55, angle: 3.5});
        }
      } else {
        if (r.tag.visible) r.tag.setVisible(false);
        if (b.dust >= 1) {
          b.dust -= 1;
          if (!REDUCED && Math.random() < 0.5) {
            this.emit('dot', sx - 14 * sc, sy - 3, 1, race.surface.dust,
              {speed: 50, life: 0.34, grav: 40, vx: -60, spread: 1.2, scale: 0.42, angle: 3.5});
          }
        }
      }
      if (b.isPlayer && b.kickOn && !REDUCED && Math.random() < 0.35) {
        this.emit('spark', sx - 26 * sc, sy - 22 * sc, 1, C.gold,
          {speed: 40, life: 0.3, grav: 0, vx: -180, spread: 0.5, scale: 0.7, angle: 3.14, drag: 0.4});
      }
      if (b.blocked > 0 && b.isPlayer && !REDUCED && Math.random() < 0.2) {
        this.emit('dot', sx + 18 * sc, sy - 22 * sc, 1, C.red, {speed: 60, life: 0.3, grav: 0, scale: 0.5});
      }
    }

    this.uiBegin();
    this.renderRaceHud(dx, dy);
    this.uiEnd();
  };

  PlayScene.prototype.renderRaceHud = function () {
    var p = race.player;
    var f = clamp(p.pos / race.dist, 0, 1);
    var v = race.venue;
    /* progress hairline */
    this.card(0, 4, Math.max(4, W * f), 4, v.accent, 0.95);
    /* one compact primary line */
    if (!race.headline) race.headline = v.short + '  ' + race.dist + 'm  ' + race.surface.label.toUpperCase();
    this.label(14, 26, race.headline, 14, C.muted);
    var place = p.finished ? p.place : livePlace(p);
    if (race.placeShown !== place) { race.placeShown = place; race.placeText = place + '/' + race.field.length; }
    this.label(376, 26, race.placeText, 20, placeColor(place), 'r', 'b');
    /* stamina meter with icon, no label text */
    var sf = clamp(p.stamina / p.staminaMax, 0, 1);
    var sc = sf > 0.5 ? C.lime : sf > 0.22 ? C.orange : C.red;
    this.label(16, 52, '∞', 16, sc, 'l', 'b');
    this.meter(34, 45, 344, 14, sf, sc, '#101a3c');
    if (sf <= 0.001) this.label(206, 52, 'EMPTY', 13, C.red, 'c', 'b');

    /* transient: chip beats coach, only one at a time */
    if (this.chipData) {
      var alpha = clamp(this.chipData.timer * 3, 0, 1);
      this.card(206, 68, 172, 28, this.chipData.color, 0.92 * alpha);
      this.label(292, 82, this.chipData.text, 13, C.deep, 'c', 'b');
    } else if (this.coachTimer > 0 && this.hintsOn !== false) {
      var ca = clamp(this.coachTimer / 1.6, 0.12, 0.92);
      this.card(12, 68, 366, 26, '#0d1636', 0.75 * ca);
      this.label(195, 81, this.coachText, 13, C.cyan, 'c');
    }

    /* countdown at the run boundary only */
    if (race.phase === 'countdown') {
      var n = Math.max(1, Math.ceil(race.countdown));
      var pulse = 1 - (race.countdown - Math.floor(race.countdown));
      this.label(195, 300, String(n), 68, v.accent, 'c', 'b').setAlpha(clamp(1.3 - pulse, 0.25, 1));
    }
    if (this.banner) {
      var bf = 1 - clamp(this.banner.timer / this.banner.life, 0, 1);
      var scale = REDUCED ? 1 : clamp(0.86 + easeBack(clamp(bf * 3.2, 0, 1)) * 0.14, 0.86, 1.03);
      var bw = 234 * scale;
      this.card(195 - bw / 2, 232, bw, 74, '#0d1636', 0.94);
      this.outline(195 - bw / 2, 232, bw, 74, this.banner.color, 0.9);
      this.label(195, 258, this.banner.title, 22, this.banner.color, 'c', 'b');
      if (this.banner.sub) this.label(195, 286, this.banner.sub, 13, C.muted, 'c');
    }

    /* controls: style chip, pause, call timeline, call button */
    var style = p.styleData;
    this.card(14, 700, 118, 44, '#0d1636', 0.9);
    this.outline(14, 700, 118, 44, style.color, 0.7);
    this.label(30, 722, style.icon, 16, style.color, 'l', 'b');
    this.label(52, 722, style.name.toUpperCase(), 14, C.ink, 'l', 'b');
    this.card(14, 754, 60, 52, '#0d1636', 0.85);
    this.label(44, 780, 'II', 18, C.muted, 'c', 'b');
    this.zone(14, 754, 60, 52, this.openPause.bind(this));

    var call = race.calls[race.callIdx];
    var cx = 306, cy = 772, rad = 48;
    if (call) {
      var inWindow = f >= call.from && f <= call.to;
      this.card(180, 700, 196, 14, '#101a3c', 0.95);
      this.card(180 + 196 * call.from, 700, Math.max(6, 196 * (call.to - call.from)), 14,
        inWindow ? C.gold : call.color, inWindow ? 0.95 : 0.5);
      this.card(178 + 196 * f, 696, 4, 22, C.white, 0.95);
      var btn = this.sprite('gc-round', cx, cy, 21, 0.5, 0.5);
      btn.setScale(rad * 2 / 128 * (inWindow && !REDUCED ? 1 + Math.sin(this.visualTime * 9) * 0.03 : 1));
      btn.setTint(tint(inWindow ? C.gold : call.color));
      btn.setAlpha(inWindow ? 1 : 0.82);
      var ring = this.sprite('gc-round-line', cx, cy, 22, 0.5, 0.5);
      ring.setScale((rad * 2 + 12) / 128);
      ring.setTint(tint(inWindow ? C.white : '#33488a'));
      this.label(cx, cy - 8, call.label, 20, C.deep, 'c', 'b');
      this.label(cx, cy + 14, inWindow ? 'NOW' : (f < call.from ? 'WAIT' : 'LATE'), 13, '#22305e', 'c', 'b');
      this.zone(cx - rad - 8, cy - rad - 8, (rad + 8) * 2, (rad + 8) * 2, function () { useCall(false); });
    } else {
      var done = this.sprite('gc-round', cx, cy, 21, 0.5, 0.5);
      done.setScale(rad * 2 / 128);
      done.setTint(tint('#1b2751'));
      this.label(cx, cy, 'RUN', 18, C.muted, 'c', 'b');
    }
    if (race.phase === 'done' && race.award) {
      this.card(58, 300, 274, 96, '#0d1636', 0.95);
      this.outline(58, 300, 274, 96, placeColor(race.award.place), 0.95);
      this.label(195, 332, placeLabel(race.award.place), 30, placeColor(race.award.place), 'c', 'b');
      this.label(195, 368, '+' + race.award.points + ' season points', 14, C.ink, 'c');
    }
  };

  /* ----------------------------------------------------- screen render */

  PlayScene.prototype.renderScreen = function () {
    this.uiBegin();
    this.skyImg.setVisible(false);
    this.lineTile.setVisible(false);
    this.crowdTile.setVisible(false);
    this.trackTile.setVisible(false);
    this.rail.setVisible(false);
    this.railLow.setVisible(false);
    this.gateImg.setVisible(false);
    var i;
    for (i = 0; i < this.poles.length; i++) if (this.poles[i].visible) this.poles[i].setVisible(false);
    for (i = 0; i < this.runners.length; i++) {
      var r = this.runners[i];
      if (r.body.visible) { r.body.setVisible(false); r.mark.setVisible(false); r.shadow.setVisible(false); r.tag.setVisible(false); }
    }
    var s = this.screen;
    if (s === 'title') this.renderTitle();
    else if (s === 'crest') this.renderCrest();
    else if (s === 'season') this.renderSeason();
    else if (s === 'train') this.renderTrain();
    else if (s === 'prep') this.renderPrep();
    else if (s === 'result') this.renderResult();
    else if (s === 'seasonend') this.renderSeasonEnd();
    else if (s === 'legacy') this.renderLegacyConfirm();
    else if (s === 'records') this.renderRecords();
    this.renderOverlays();
    this.uiEnd();
    this.syncProbe();
  };

  PlayScene.prototype.renderOverlays = function () {
    if (this.chipData) {
      var alpha = clamp(this.chipData.timer * 3, 0, 1);
      this.card(206, 6, 172, 30, this.chipData.color, 0.95 * alpha);
      this.label(292, 21, this.chipData.text, 13, C.deep, 'c', 'b');
    } else if (this.coachTimer > 0 && this.hintsOn !== false && this.coachText) {
      var ca = clamp(this.coachTimer / 1.6, 0.14, 0.9);
      this.card(12, 786, 366, 30, '#0d1636', 0.8 * ca);
      this.label(195, 801, this.coachText, 13, C.cyan, 'c');
    }
    if (this.banner) {
      var bf = 1 - clamp(this.banner.timer / this.banner.life, 0, 1);
      var scale = REDUCED ? 1 : clamp(0.86 + easeBack(clamp(bf * 3.2, 0, 1)) * 0.14, 0.86, 1.03);
      var bw = 234 * scale;
      this.card(195 - bw / 2, 300, bw, 78, '#0d1636', 0.95);
      this.outline(195 - bw / 2, 300, bw, 78, this.banner.color, 0.95);
      this.label(195, 328, this.banner.title, 24, this.banner.color, 'c', 'b');
      if (this.banner.sub) this.label(195, 356, this.banner.sub, 13, C.muted, 'c');
    }
  };

  PlayScene.prototype.header = function (title, sub, backFn) {
    this.card(12, 10, 366, 56, C.panel, 0.96);
    this.label(28, 30, title, 20, C.ink, 'l', 'b');
    if (sub) this.label(28, 50, sub, 13, C.muted);
    if (backFn) {
      this.card(312, 14, 62, 48, '#101a3c', 1);
      this.outline(312, 14, 62, 48, C.line, 0.9);
      this.label(343, 38, 'BACK', 13, C.muted, 'c', 'b');
      this.zone(312, 14, 62, 48, backFn);
    }
  };

  PlayScene.prototype.renderTitle = function () {
    var self = this;
    var crest = CRESTS[profile.crests[profile.lastCrest] ? profile.lastCrest : 0];
    var pad = this.sprite('gc-paddock', 0, 128, 20, 0, 0);
    pad.setAlpha(0.96);
    this.bar(0, 0, W, 146, C.deep, 1);
    this.label(195, 72, 'GALECRESTS', 40, C.gold, 'c', 'b');
    this.label(195, 106, 'Raise a racing crest. Time the calls.', 14, C.muted, 'c');
    var frame = ['idle', 'run1', 'idle', 'run2'][Math.floor(this.visualTime * 2.2) % 4];
    this.crestPortrait(180, 446, 1.35, crest, frame, 21);
    this.crestPortrait(286, 424, 0.85, CRESTS[1], frame === 'run1' ? 'run2' : 'run1', 20);
    this.bar(0, 458, W, H - 458, C.deep, 0.9);

    var y = 544;
    if (profile.legacy) {
      var g = profile.legacy;
      this.card(24, y, 342, 52, C.panel, 0.95);
      this.outline(24, y, 342, 52, C.violet, 0.8);
      this.label(40, y + 20, 'LEGACY  ' + g.name, 14, C.violet, 'l', 'b');
      var bits = [];
      for (var i = 0; i < STATS.length; i++) if (g.bonus[STATS[i].id] > 0) bits.push('+' + g.bonus[STATS[i].id] + ' ' + STATS[i].id);
      this.label(40, y + 39, bits.join('  '), 13, C.muted);
      y += 62;
    }
    var hasRun = !!(profile.run && validRun(profile.run));
    if (hasRun) {
      var r = profile.run;
      this.button(44, y, 302, 58, 'CONTINUE SEASON', C.lime, function () { loadRun(); self.enterSeason(); },
        CRESTS[r.crest].name + '  turn ' + r.turn + ' of ' + TURNS);
      y += 66;
    }
    this.button(44, y, 302, 58, hasRun ? 'NEW CAREER' : 'START CAREER', hasRun ? C.cyan : C.lime,
      function () { self.openCrestSelect(); },
      LEAGUES[profile.league].name + ' unlocked');
    y += 66;
    this.ghostButton(44, y, 146, 52, 'RECORDS', C.gold, function () { self.openRecords(); });
    this.ghostButton(200, y, 146, 52, 'SETTINGS', C.muted, function () { self.openPause(); });
    y += 64;
    this.label(195, y + 16, 'Tap to play. Keys 1 to 6, Space, Esc.', 13, C.dim, 'c');
    this.label(195, y + 42, 'Six crests, six courses, three leagues.', 13, C.dim, 'c');
  };

  PlayScene.prototype.renderCrest = function () {
    var self = this;
    this.header('Choose your crest', 'Aptitudes decide the ground that suits', function () { self.showTitle(); });
    var y = 76;
    if (profile.league > 0) {
      this.label(20, y + 12, 'LEAGUE', 13, C.muted, 'l', 'b');
      for (var l = 0; l <= profile.league; l++) {
        var lx = 92 + l * 96;
        var on = this.pickLeague === l;
        this.card(lx, y, 90, 44, on ? LEAGUES[l].color : '#101a3c', on ? 1 : 0.95);
        if (!on) this.outline(lx, y, 90, 44, C.line, 0.9);
        this.label(lx + 45, y + 22, LEAGUES[l].name.split(' ')[0].toUpperCase(), 13,
          on ? C.deep : C.muted, 'c', 'b');
        this.zone(lx, y, 90, 44, (function (n) {
          return function () { self.pickLeague = n; sfx('tap', 0.5); };
        })(l));
      }
      y += 54;
    }
    for (var i = 0; i < CRESTS.length; i++) {
      var crest = CRESTS[i];
      var col = i % 2, rowY = y + Math.floor(i / 2) * 132;
      var x = 14 + col * 184;
      var locked = !profile.crests[i];
      var sel = this.pickCrest === i;
      this.card(x, rowY, 174, 122, locked ? '#111a3a' : sel ? '#1b2c62' : C.panel, 0.97);
      this.outline(x, rowY, 174, 122, locked ? C.line : sel ? crest.color : C.line, sel ? 1 : 0.7);
      if (!locked) {
        this.crestPortrait(x + 44, rowY + 84, 0.72, crest, sel ? 'run1' : 'idle', 23);
        this.label(x + 78, rowY + 26, crest.name, 15, sel ? crest.color : C.ink, 'l', 'b');
        var st = styleById(crest.style);
        this.label(x + 78, rowY + 46, st.icon + ' ' + st.name, 13, st.color, 'l');
        var top = crest.apt.dirt > crest.apt.grass && crest.apt.dirt > crest.apt.mud ? 'Dirt' :
          crest.apt.mud > crest.apt.grass ? 'Wet' : 'Grass';
        this.label(x + 78, rowY + 66, top + ' ground', 13, C.muted, 'l');
        this.label(x + 78, rowY + 86, crest.trait, 12, C.gold, 'l');
        this.label(x + 12, rowY + 108, crest.base.speed + '/' + crest.base.stamina + '/' + crest.base.power, 12, C.dim, 'l');
      } else {
        var sil = this.crestPortrait(x + 44, rowY + 92, 0.68, crest, 'idle', 22);
        sil.setTint(tint('#22305e'));
        sil.setAlpha(0.9);
        this.label(x + 116, rowY + 40, 'LOCKED', 15, C.dim, 'c', 'b');
        this.wrap(x + 78, rowY + 56, crest.unlock, 12, C.muted, 86);
      }
      this.zone(x, rowY, 174, 122, (function (n) { return function () { self.selectCrest(n); }; })(i));
    }
    var by = y + 3 * 132 + 14;
    var pick = CRESTS[this.pickCrest];
    this.card(14, by, 362, 92, C.panel, 0.96);
    this.label(30, by + 22, pick.name, 15, pick.color, 'l', 'b');
    this.wrap(30, by + 36, pick.blurb, 13, C.muted, 330);
    if (profile.legacy) {
      this.label(30, by + 108, 'LEGACY IN WAITING  ' + profile.legacy.name + '  passes ' +
        profile.legacy.trait, 12, C.violet, 'l');
    }
    this.button(44, by + 124, 302, 62, 'START SEASON', C.lime, function () { self.confirmCrest(); },
      LEAGUES[this.pickLeague].name + '  12 turns  8 races');
  };

  PlayScene.prototype.statRow = function (x, y, w, statIdx, value, extra) {
    var st = STATS[statIdx];
    this.label(x, y + 8, st.icon, 14, st.color, 'l', 'b');
    this.label(x + 20, y + 8, st.label, 13, C.muted, 'l');
    this.meter(x + 84, y + 2, w - 122, 12, clamp(value / 120, 0, 1), st.color, '#101a3c');
    this.label(x + w, y + 8, extra == null ? String(Math.round(value)) : extra, 14, C.ink, 'r', 'b');
  };

  PlayScene.prototype.renderSeason = function () {
    var self = this;
    if (!run) { this.showTitle(); return; }
    var crest = CRESTS[run.crest];
    var mood = moodAt(run.mood);
    var next = nextRaceFrom(run.turn);
    var todayRace = raceAtTurn(run.turn);

    this.card(12, 10, 366, 58, C.panel, 0.96);
    this.label(28, 30, 'TURN ' + run.turn + ' / ' + TURNS, 18, C.ink, 'l', 'b');
    this.label(28, 52, run.name + '  ' + LEAGUES[run.league].name, 13, C.muted, 'l');
    this.label(364, 28, Math.round(run.points) + ' pts', 16, C.gold, 'r', 'b');
    if (next) {
      this.label(364, 52, todayRace ? 'RACE TODAY  ' + venueAt(next.venue).short :
        'Next: ' + venueAt(next.venue).short + ' in ' + (next.turn - run.turn), 13,
        todayRace ? venueAt(next.venue).accent : C.muted, 'r');
    }

    var pad = this.sprite('gc-paddock', 0, 76, 20, 0, 0);
    pad.setAlpha(0.9);
    pad.setDisplaySize(390, 250);
    var frame = ['idle', 'run1', 'idle', 'run2'][Math.floor(this.visualTime * 1.8) % 4];
    this.crestPortrait(112, 300, 1.25, crest, frame, 21);

    this.card(196, 108, 182, 96, C.panel, 0.92);
    this.label(210, 130, crest.name, 14, crest.color, 'l', 'b');
    this.label(210, 152, 'MOOD', 12, C.muted, 'l');
    this.label(364, 152, mood.label, 14, mood.color, 'r', 'b');
    this.label(210, 176, 'FATIGUE', 12, C.muted, 'l');
    this.meter(272, 170, 76, 12, run.fatigue / 100, run.fatigue > 65 ? C.red : run.fatigue > 40 ? C.orange : C.mint, '#101a3c');
    this.label(364, 176, Math.round(run.fatigue) + '%', 13, C.ink, 'r', 'b');
    this.card(196, 212, 182, 46, '#101a3c', 0.95);
    this.outline(196, 212, 182, 46, C.rose, 0.8);
    this.label(287, 235, 'BOND  -16 FAT +MOOD', 13, C.rose, 'c', 'b');
    this.zone(196, 212, 182, 46, function () { self.doRest(false); });

    this.card(12, 330, 366, 122, C.panel, 0.95);
    for (var s = 0; s < STATS.length; s++) {
      this.statRow(28, 342 + s * 22, 336, s, run.stats[STATS[s].id]);
    }

    var gy = 462;
    for (var i = 0; i < 6; i++) {
      var col = i % 2, rowY = gy + Math.floor(i / 2) * 106;
      var x = 12 + col * 186;
      if (i < TRAINING.length) {
        var card = TRAINING[i];
        var pv = trainingPreview(card, false);
        var tutorial = !profile.tutorial && i === 0;
        this.card(x, rowY, 180, 96, C.panel, 0.97);
        this.outline(x, rowY, 180, 96, tutorial ? C.cyan : card.color, tutorial ? 0.95 : 0.6);
        this.label(x + 14, rowY + 24, STATS[i].icon, 16, card.color, 'l', 'b');
        this.label(x + 36, rowY + 24, card.label, 14, C.ink, 'l', 'b');
        this.label(x + 14, rowY + 48, card.sub, 12, C.muted, 'l');
        this.label(x + 14, rowY + 74, '+' + pv.gain + ' ' + card.id, 14, card.color, 'l', 'b');
        this.label(x + 166, rowY + 74, '+' + pv.fatigue + ' fat', 13, pv.fatigue > 14 ? C.orange : C.muted, 'r');
        this.zone(x, rowY, 180, 96, (function (n) { return function () { self.openTraining(n); }; })(i));
      } else {
        this.card(x, rowY, 180, 96, '#132048', 0.97);
        this.outline(x, rowY, 180, 96, C.cyan, 0.6);
        this.label(x + 14, rowY + 24, '☾', 16, C.cyan, 'l', 'b');
        this.label(x + 36, rowY + 24, 'Deep Rest', 14, C.ink, 'l', 'b');
        this.label(x + 14, rowY + 48, 'Clear the tank before race day', 12, C.muted, 'l');
        this.label(x + 14, rowY + 74, '-34 fatigue', 14, C.cyan, 'l', 'b');
        this.label(x + 166, rowY + 74, '+1 stam', 13, C.muted, 'r');
        this.zone(x, rowY, 180, 96, function () { self.doRest(true); });
      }
    }
    if (todayRace) {
      var acc = venueAt(todayRace.venue).accent;
      this.card(12, 780, 366, 50, acc, 0.18);
      this.outline(12, 780, 366, 50, acc, 0.9);
      this.label(195, 805, 'RACE AFTER THIS TURN  ' + todayRace.name.toUpperCase(), 13, acc, 'c', 'b');
    }
  };

  PlayScene.prototype.renderTrain = function () {
    var self = this;
    if (!run) { this.showTitle(); return; }
    var card = TRAINING[this.selected];
    var steady = trainingPreview(card, false);
    var push = trainingPreview(card, true);
    this.header(card.label, card.sub, function () { self.setScreen('season'); });
    var crest = CRESTS[run.crest];
    var pad = this.sprite('gc-paddock', 0, 76, 20, 0, 0);
    pad.setAlpha(0.75);
    pad.setDisplaySize(390, 200);
    var frame = ['run1', 'run2', 'surge', 'run2'][Math.floor(this.visualTime * 6) % 4];
    this.crestPortrait(195, 262, 1.2, crest, frame, 21);

    this.card(12, 280, 366, 74, C.panel, 0.96);
    this.label(28, 304, 'CURRENT ' + card.id.toUpperCase(), 13, C.muted, 'l');
    this.label(364, 304, String(Math.round(run.stats[card.id])), 16, card.color, 'r', 'b');
    this.label(28, 332, 'FATIGUE NOW', 13, C.muted, 'l');
    this.meter(150, 324, 150, 14, run.fatigue / 100, run.fatigue > 65 ? C.red : C.mint, '#101a3c');
    this.label(364, 332, Math.round(run.fatigue) + '%', 14, C.ink, 'r', 'b');

    var opts = [
      {label: 'STEADY', p: steady, bold: false, color: card.color, blurb: 'Compounding work with a small cost'},
      {label: 'PUSH', p: push, bold: true, color: C.orange, blurb: 'Bigger gain, real strain risk'}
    ];
    for (var i = 0; i < 2; i++) {
      var o = opts[i];
      var y = 370 + i * 176;
      this.card(12, y, 366, 164, C.panel, 0.97);
      this.outline(12, y, 366, 164, o.color, 0.85);
      this.label(30, y + 28, o.label, 20, o.color, 'l', 'b');
      this.label(364, y + 28, o.blurb, 12, C.muted, 'r');
      this.label(30, y + 62, '+' + o.p.gain + ' ' + card.id, 18, C.ink, 'l', 'b');
      if (o.p.second > 0) this.label(160, y + 62, '+' + o.p.second + ' ' + card.second, 14, C.muted, 'l');
      this.label(364, y + 62, '+' + o.p.fatigue + ' fatigue', 15, o.p.fatigue > 14 ? C.orange : C.muted, 'r', 'b');
      var after = clamp(run.fatigue + o.p.fatigue, 0, 100);
      this.label(30, y + 92, 'FATIGUE AFTER', 12, C.muted, 'l');
      this.meter(150, y + 84, 150, 14, after / 100, after > 65 ? C.red : after > 40 ? C.orange : C.mint, '#101a3c');
      this.label(364, y + 92, Math.round(after) + '%', 13, C.ink, 'r', 'b');
      this.label(30, y + 120, 'STRAIN RISK', 12, C.muted, 'l');
      this.label(150, y + 120, Math.round(o.p.risk * 100) + '%', 15,
        o.p.risk > 0.24 ? C.red : o.p.risk > 0 ? C.orange : C.mint, 'l', 'b');
      this.button(212, y + 106, 152, 44, 'COMMIT', o.color,
        (function (bold) { return function () { self.commitTraining(bold); }; })(o.bold));
      this.label(30, y + 146, o.p.risk > 0 ? 'A strain loses most of the gain and adds fatigue.' :
        'No strain risk at this fatigue level.', 12, C.dim, 'l');
    }
  };

  PlayScene.prototype.renderPrep = function () {
    var self = this;
    if (!run) { this.showTitle(); return; }
    var entry = this.prepEntry || CALENDAR[0];
    var venue = venueAt(entry.venue);
    var surf = surfaceOf(venue);
    var crest = CRESTS[run.crest];
    var keys = this.venueTextures(venue);
    this.header(entry.name, venue.name + '  ' + venue.dist + 'm', function () { self.setScreen('season'); });

    var art = this.sprite(keys.sky, 12, 76, 20, 0, 0);
    art.setDisplaySize(366, 104);
    var crowd = this.sprite(keys.crowd, 12, 148, 21, 0, 0);
    crowd.setDisplaySize(366, 20);
    var trk = this.sprite(keys.track, 12, 168, 21, 0, 0);
    trk.setDisplaySize(366, 44);
    var frame = ['run1', 'run2'][Math.floor(this.visualTime * 7) % 2];
    this.crestPortrait(88, 210, 0.95, crest, frame, 22);
    this.label(24, 96, venue.short, 20, venue.accent, 'l', 'b');
    this.wrap(24, 112, venue.blurb, 12, '#e6ecff', 300);

    this.card(12, 220, 366, 62, C.panel, 0.96);
    this.label(28, 242, 'GROUND', 12, C.muted, 'l');
    this.label(96, 242, surf.label + '  drain x' + surf.drain.toFixed(2), 14, venue.accent, 'l', 'b');
    var fit = aptFor(crest, venue);
    var fitLabel = fit > 1.03 ? 'STRONG FIT' : fit > 0.99 ? 'EVEN FIT' : 'AGAINST TYPE';
    this.label(28, 268, 'CREST FIT', 12, C.muted, 'l');
    this.label(96, 268, fitLabel + '  x' + fit.toFixed(2), 14, fit > 1.03 ? C.mint : fit > 0.99 ? C.ink : C.orange, 'l', 'b');
    this.label(364, 242, 'FATIGUE ' + Math.round(run.fatigue) + '%', 13, run.fatigue > 60 ? C.red : C.muted, 'r');
    this.label(364, 268, 'MOOD ' + moodAt(run.mood).label, 13, moodAt(run.mood).color, 'r');

    for (var i = 0; i < STYLES.length; i++) {
      var st = STYLES[i];
      var col = i % 2, rowY = 292 + Math.floor(i / 2) * 116;
      var x = 12 + col * 186;
      var on = this.pickStyle === i;
      var fitness = styleFitness(st, crest, venue, run.stats);
      this.card(x, rowY, 180, 106, on ? '#1b2c62' : C.panel, 0.97);
      this.outline(x, rowY, 180, 106, on ? st.color : C.line, on ? 1 : 0.65);
      this.label(x + 14, rowY + 26, st.icon, 18, st.color, 'l', 'b');
      this.label(x + 40, rowY + 26, st.name.toUpperCase(), 15, on ? st.color : C.ink, 'l', 'b');
      this.wrap(x + 14, rowY + 40, st.blurb, 12, C.muted, 152);
      this.label(x + 14, rowY + 86, fitness.label, 13, fitness.color, 'l', 'b');
      this.meter(x + 96, rowY + 80, 70, 10, fitness.value, fitness.color, '#101a3c');
      this.zone(x, rowY, 180, 106, (function (n) {
        return function () { self.pickStyle = n; sfx('tap', 0.5); };
      })(i));
    }

    this.card(12, 526, 366, 96, C.panel, 0.95);
    this.label(28, 548, 'RACE DAY CONDITION', 13, C.muted, 'l', 'b');
    var s = run.stats;
    var stam = 62 + s.stamina * 1.05 + s.guts * 0.3;
    this.label(28, 576, 'Stamina budget', 13, C.muted, 'l');
    this.meter(170, 568, 130, 14, clamp(stam / 220, 0, 1), C.lime, '#101a3c');
    this.label(364, 576, String(Math.round(stam)), 14, C.ink, 'r', 'b');
    this.label(28, 604, 'Call window width', 13, C.muted, 'l');
    var widen = 1 + s.wit * 0.0035 + (hasTrait('Wide Eye') ? 0.25 : 0);
    this.meter(170, 596, 130, 14, clamp((widen - 1) / 0.6, 0, 1), C.cyan, '#101a3c');
    this.label(364, 604, '+' + Math.round((widen - 1) * 100) + '%', 14, C.ink, 'r', 'b');

    this.card(12, 630, 366, 52, '#101a3c', 0.95);
    this.label(195, 656, 'HOLD then SURGE then KICK, one tap each', 13, C.muted, 'c');
    this.button(44, 700, 302, 62, 'TO THE GATE', venue.accent, function () { self.startRace(); },
      STYLES[this.pickStyle].name + ' plan  ' + venue.dist + 'm ' + surf.label);
  };

  function styleFitness(style, crest, venue, stats) {
    var v = 0.5;
    if (style.id === crest.style) v += 0.2;
    if (venue.band === 'sprint') v += style.id === 'lead' ? 0.18 : style.id === 'press' ? 0.08 : style.id === 'stalk' ? -0.04 : -0.12;
    else if (venue.band === 'long') v += style.id === 'close' ? 0.16 : style.id === 'stalk' ? 0.14 : style.id === 'press' ? 0.02 : -0.12;
    else v += style.id === 'press' ? 0.12 : style.id === 'stalk' ? 0.08 : 0;
    v += (stats.stamina - 40) * 0.0016 * (style.id === 'lead' ? 0.6 : 1);
    v += (stats.wit - 40) * 0.0012 * (style.id === 'close' ? 1.4 : 1);
    v = clamp(v, 0.05, 1);
    return {
      value: v,
      label: v > 0.74 ? 'STRONG' : v > 0.56 ? 'GOOD' : v > 0.4 ? 'EVEN' : 'RISKY',
      color: v > 0.74 ? C.mint : v > 0.56 ? C.lime : v > 0.4 ? C.ink : C.orange
    };
  }

  PlayScene.prototype.renderResult = function () {
    var self = this;
    if (!race || !race.award) { this.setScreen('season'); return; }
    var award = race.award;
    var p = race.player;
    var winner = race.results[0];
    this.header(placeLabel(award.place) + ' at ' + race.venue.short, race.entry.name + '  ' + race.dist + 'm', null);
    this.label(364, 38, '+' + award.points + ' pts', 18, C.gold, 'r', 'b');

    this.card(12, 76, 366, 148, C.panel, 0.96);
    this.label(28, 98, 'FINISH ORDER', 13, C.muted, 'l', 'b');
    for (var i = 0; i < race.results.length; i++) {
      var b = race.results[i];
      var y = 120 + i * 18;
      this.label(28, y, String(i + 1), 13, placeColor(i + 1), 'l', 'b');
      this.label(48, y, b.name + (b.isPlayer ? '  (you)' : ''), 13, b.isPlayer ? CRESTS[run.crest].color : C.muted, 'l');
      this.label(364, y, b.finishTime.toFixed(2) + 's', 13, b.isPlayer ? C.ink : C.dim, 'r');
    }

    this.card(12, 232, 366, 128, C.panel, 0.96);
    this.label(28, 254, 'QUARTER SPEED', 13, C.muted, 'l', 'b');
    this.label(364, 254, 'you vs winner', 12, C.dim, 'r');
    var maxV = 1, minV = 9999;
    for (var q = 0; q < 4; q++) {
      maxV = Math.max(maxV, p.splits[q], winner.splits[q]);
      minV = Math.min(minV, p.splits[q], winner.splits[q]);
    }
    var floorV = Math.max(1, minV * 0.97);
    var spanV = Math.max(1, maxV - floorV);
    for (q = 0; q < 4; q++) {
      var bx = 40 + q * 86;
      var hy = 344;
      var ph = 8 + clamp((p.splits[q] - floorV) / spanV, 0, 1) * 54;
      var wh = 8 + clamp((winner.splits[q] - floorV) / spanV, 0, 1) * 54;
      this.card(bx, hy - wh, 26, Math.max(3, wh), '#2c3d76', 1);
      this.card(bx + 30, hy - ph, 26, Math.max(3, ph), CRESTS[run.crest].color, 1);
      this.label(bx + 28, 352, 'Q' + (q + 1), 12, C.dim, 'c');
    }

    this.card(12, 368, 366, 152, C.panel, 0.96);
    this.label(28, 390, 'RACE READ', 13, C.cyan, 'l', 'b');
    for (var l = 0; l < award.lines.length; l++) {
      this.wrap(28, 402 + l * 38, award.lines[l], 13, C.ink, 336);
    }

    this.card(12, 528, 366, 90, C.panel, 0.96);
    this.label(28, 548, 'CALLS', 13, C.muted, 'l', 'b');
    for (var c = 0; c < race.calls.length; c++) {
      var call = race.calls[c];
      var cy = 572 + c * 21;
      this.label(28, cy, call.label, 13, call.color, 'l', 'b');
      var q2 = call.used ? call.quality.toUpperCase() : 'NOT CALLED';
      this.label(120, cy, q2, 13, call.used ?
        (call.quality === 'clean' ? C.mint : call.quality === 'missed' ? C.dim : C.orange) : C.dim, 'l');
      if (call.used) this.label(364, cy, 'at ' + Math.round(call.at * 100) + '%', 13, C.dim, 'r');
    }

    this.card(12, 626, 366, 68, C.panel, 0.96);
    this.label(28, 646, 'SEASON', 13, C.muted, 'l', 'b');
    this.label(28, 674, 'Turn ' + run.turn + ' of ' + TURNS + '   ' + Math.round(run.points) + ' points   fatigue ' + Math.round(run.fatigue) + '%', 13, C.ink, 'l');
    this.label(364, 646, 'MOOD ' + moodAt(run.mood).label, 13, moodAt(run.mood).color, 'r');

    var last = race.venue.id === 'galecrest' || run.turn >= TURNS;
    this.button(44, 704, 302, 62, last ? 'SEASON RESULTS' : 'BACK TO TRAINING', C.lime,
      function () { self.advanceFromResult(); },
      last ? 'The career board is next' : 'Turn ' + (run.turn + 1) + ' of ' + TURNS);
  };

  PlayScene.prototype.renderSeasonEnd = function () {
    var self = this;
    if (!run) { this.showTitle(); return; }
    var grade = gradeFor(run.points);
    var crest = CRESTS[run.crest];
    this.header('Season complete', run.name + '  ' + LEAGUES[run.league].name, null);
    this.card(12, 76, 366, 108, C.panel, 0.96);
    this.label(52, 118, grade.label, 46, grade.color, 'c', 'b');
    this.label(96, 104, Math.round(run.points) + ' season points', 16, C.ink, 'l', 'b');
    this.label(96, 128, grade.blurb, 13, C.muted, 'l');
    this.label(96, 152, 'Best close ' + Math.round(run.bestClose) + '   wins ' + winCount(run), 13, C.gold, 'l');
    var frame = ['idle', 'win', 'idle', 'run1'][Math.floor(this.visualTime * 2) % 4];
    this.crestPortrait(330, 176, 0.95, crest, frame, 23);

    this.card(12, 192, 366, 236, C.panel, 0.96);
    this.label(28, 214, 'SEASON CARD', 13, C.muted, 'l', 'b');
    for (var i = 0; i < CALENDAR.length; i++) {
      var h = run.history[i];
      var y = 240 + i * 23;
      var venue = venueAt(CALENDAR[i].venue);
      this.label(28, y, CALENDAR[i].name, 13, h ? C.ink : C.dim, 'l');
      this.label(300, y, h ? placeLabel(h.place) : 'not run', 13, h ? placeColor(h.place) : C.dim, 'r', 'b');
      this.label(364, y, h ? '+' + h.points : '', 13, C.gold, 'r');
    }

    this.card(12, 436, 366, 96, C.panel, 0.96);
    this.label(28, 458, 'CAREER', 13, C.muted, 'l', 'b');
    this.label(28, 484, 'Seasons ' + profile.records.seasons + '   races ' + profile.records.races +
      '   wins ' + profile.records.wins, 13, C.ink, 'l');
    this.label(28, 510, 'Cups ' + profile.records.cupWins + '   best season ' + profile.records.bestPoints +
      '   crests ' + unlockedCount() + '/' + CRESTS.length, 13, C.ink, 'l');

    this.button(44, 548, 302, 62, 'RETIRE AND PASS LEGACY', C.violet, function () { self.openLegacy(); },
      'The next crest inherits part of this work');
    this.ghostButton(44, 620, 302, 52, 'RELEASE WITHOUT LEGACY', C.muted, function () { self.releaseNoLegacy(); });
    this.ghostButton(44, 682, 146, 52, 'RECORDS', C.gold, function () { self.openRecords(); });
    this.ghostButton(200, 682, 146, 52, 'TITLE', C.muted, function () { self.showTitle(); });
    this.label(195, 762, 'Retiring is the only way to pass stats forward.', 13, C.dim, 'c');
  };

  function winCount(r) {
    var n = 0;
    for (var i = 0; i < r.history.length; i++) if (r.history[i].place === 1) n++;
    return n;
  }
  function unlockedCount() {
    var n = 0;
    for (var i = 0; i < profile.crests.length; i++) if (profile.crests[i]) n++;
    return n;
  }

  PlayScene.prototype.renderLegacyConfirm = function () {
    var self = this;
    if (!run) { this.showTitle(); return; }
    var crest = CRESTS[run.crest];
    this.header('Retire ' + run.name, 'Read what leaves and what stays', function () { self.setScreen('seasonend'); });
    var pad = this.sprite('gc-paddock', 0, 72, 20, 0, 0);
    pad.setAlpha(0.8);
    pad.setDisplaySize(390, 196);
    var frame = ['idle', 'win'][Math.floor(this.visualTime * 1.4) % 2];
    this.crestPortrait(195, 262, 1.4, crest, frame, 21);

    this.card(12, 280, 366, 108, C.panel, 0.96);
    this.label(28, 302, 'WHAT LEAVES', 13, C.red, 'l', 'b');
    this.label(28, 328, 'This crest, its trained stats, mood and fatigue.', 13, C.ink, 'l');
    this.label(28, 352, 'The season card is archived to the records hall.', 13, C.muted, 'l');
    this.label(28, 376, 'Nothing you own is spent or destroyed.', 13, C.muted, 'l');

    this.card(12, 396, 366, 84, C.panel, 0.96);
    this.label(28, 418, 'WHAT STAYS', 13, C.cyan, 'l', 'b');
    this.label(28, 444, 'Unlocked crests, leagues, records and every best time.', 13, C.ink, 'l');
    this.label(28, 468, 'Crests unlocked ' + unlockedCount() + ' of ' + CRESTS.length +
      '   leagues ' + (profile.league + 1) + ' of ' + LEAGUES.length, 13, C.muted, 'l');

    this.card(12, 488, 366, 150, C.panel, 0.96);
    this.label(28, 510, 'WHAT THE NEXT CREST GAINS', 13, C.mint, 'l', 'b');
    for (var i = 0; i < STATS.length; i++) {
      var st = STATS[i];
      var bonus = clamp(Math.floor(run.stats[st.id] * 0.12), 1, 10);
      var y = 536 + i * 21;
      this.label(28, y, st.icon + ' ' + st.label, 13, st.color, 'l');
      this.label(160, y, '+' + bonus + ' at hatch', 13, C.ink, 'l', 'b');
      this.meter(250, y - 6, 114, 12, bonus / 10, st.color, '#101a3c');
    }
    var trait = run.traits.length > 1 ? run.traits[1] : run.traits[0];
    var td = traitByName(trait);
    this.card(12, 646, 366, 56, C.panel, 0.96);
    this.label(28, 668, 'TRAIT PASSED  ' + trait, 13, C.gold, 'l', 'b');
    this.label(28, 690, td ? td.blurb : 'A learned racing habit.', 12, C.muted, 'l');

    this.button(44, 714, 302, 60, 'CONFIRM RETIREMENT', C.violet, function () { self.confirmLegacy(); },
      'Replaces any legacy already stored');
    this.label(195, 792, 'This is the only step that overwrites a stored legacy.', 12, C.dim, 'c');
  };

  PlayScene.prototype.renderRecords = function () {
    var self = this;
    var rec = profile.records;
    this.header('Hall of records', 'Career totals persist across every run', function () {
      if (run && run.turn > TURNS) self.setScreen('seasonend'); else self.showTitle();
    });
    this.card(12, 76, 366, 92, C.panel, 0.96);
    this.label(28, 100, 'Seasons ' + rec.seasons, 14, C.ink, 'l', 'b');
    this.label(200, 100, 'Races ' + rec.races, 14, C.ink, 'l', 'b');
    this.label(28, 126, 'Wins ' + rec.wins, 14, C.mint, 'l', 'b');
    this.label(200, 126, 'Cups ' + rec.cupWins, 14, C.gold, 'l', 'b');
    this.label(28, 152, 'Best season ' + Math.round(rec.bestPoints) + ' pts', 13, C.muted, 'l');
    this.label(200, 152, 'Best close ' + Math.round(rec.bestClose), 13, C.muted, 'l');

    this.card(12, 178, 366, 190, C.panel, 0.96);
    this.label(28, 200, 'COURSE BESTS', 13, C.muted, 'l', 'b');
    for (var i = 0; i < VENUES.length; i++) {
      var v = VENUES[i], row = rec.venues[i], y = 226 + i * 24;
      this.label(28, y, v.name, 13, v.accent, 'l');
      this.label(250, y, row.races ? placeLabel(row.place) : 'unraced', 13,
        row.races ? placeColor(row.place) : C.dim, 'r', 'b');
      this.label(364, y, row.time ? row.time.toFixed(1) + 's' : '', 13, C.ink, 'r');
    }

    this.card(12, 378, 366, 170, C.panel, 0.96);
    this.label(28, 400, 'STUDBOOK', 13, C.muted, 'l', 'b');
    for (var c = 0; c < CRESTS.length; c++) {
      var cr = CRESTS[c], y2 = 426 + c * 22;
      var on = profile.crests[c];
      this.label(28, y2, cr.name, 13, on ? cr.color : C.dim, 'l', on ? 'b' : 'n');
      this.label(364, y2, on ? 'unlocked' : cr.unlock, 12, on ? C.mint : C.dim, 'r');
    }

    this.card(12, 558, 366, 104, C.panel, 0.96);
    this.label(28, 580, 'LEAGUES', 13, C.muted, 'l', 'b');
    for (var l = 0; l < LEAGUES.length; l++) {
      var lg = LEAGUES[l], y3 = 606 + l * 22;
      var open = profile.league >= l;
      this.label(28, y3, lg.name, 13, open ? lg.color : C.dim, 'l', 'b');
      this.label(160, y3, lg.blurb, 12, C.muted, 'l');
      this.label(364, y3, profile.cleared[l] ? 'cup won' : open ? 'open' : 'locked', 12,
        profile.cleared[l] ? C.gold : open ? C.mint : C.dim, 'r');
    }
    this.button(44, 690, 302, 58, 'BACK', C.cyan, function () {
      if (run && run.turn > TURNS) self.setScreen('seasonend'); else self.showTitle();
    });
    this.label(195, 776, 'Original crests, courses and music, made for this title.', 12, C.dim, 'c');
  };

  /* -------------------------------------------------------------- boot */

  if (!Phaser || !kit) {
    root.__gc.state = bootState;
    return;
  }
  var config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: C.deep,
    scale: {mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H},
    render: {antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048},
    fps: {target: 60, min: 30},
    scene: [PlayScene]
  };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  Game.phaser = new Phaser.Game(config);
})(typeof window !== 'undefined' ? window : globalThis);
