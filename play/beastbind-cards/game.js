/* Beastbind Cards - AAA rebuild.
 * Phaser 3 presentation layer over BB_CARDS (content) and BB_ENGINE (rules).
 * GGKit owns lifecycle, pause, rotate, saves, audio buses, loading and juice. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var D = root.BB_CARDS;
  var E = root.BB_ENGINE;
  var C = D ? D.CARDS : [];

  // ------------------------------------------------------------- constants
  var W = 390, H = 844;
  var SAVE_VERSION = 3;
  var DECK_SIZE = 20;
  var DECK_SLOTS = 3;
  var MIN_BASICS = 6;
  var MAX_COPIES = 2;
  var DRAFT_RUN_WINS = 3;

  var PAL = {
    deep: 0x0b111c, deepCss: '#0b111c',
    felt: 0x14202f, feltCss: '#14202f',
    plate: 0x1b2a3c, plateCss: '#1b2a3c',
    plateHi: 0x243549, plateHiCss: '#243549',
    ink: '#e9f1fa', muted: '#93a6bb', dim: '#6c7f95',
    gold: '#e0b34a', goldNum: 0xe0b34a,
    good: '#39d353', goodNum: 0x39d353,
    bad: '#e2603a', badNum: 0xe2603a,
    line: 0x2e415a
  };
  var FCOL = D ? D.EL_COL : ['#e2603a', '#3d8fd0', '#4fa35c', '#b084e8'];
  var FNUM = FCOL.map(function (c) { return parseInt(c.slice(1), 16); });
  var FLIGHT = D ? D.EL_LIGHT : FCOL;
  var FDIM = D ? D.EL_DIM : FCOL;

  var CARD_W = 132, CARD_H = 184;   // detail bake
  var MINI_W = 60, MINI_H = 84;     // mini bake
  var HAND_W = 78, HAND_H = 109;
  var ACT_W = 104, ACT_H = 145;
  var BEN_W = 58, BEN_H = 81;

  var LY = {
    hud: 8, hudH: 46,
    oBench: 92, oActive: 178,
    band: 330,
    pActive: 372, pBench: 518,
    bar: 608, barH: 48,
    hand: 666
  };

  var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function whole(v, d) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v) : d; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeBack(t) { var c = 1.70158 + 1; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function shade(css, k) {
    var n = parseInt(css.slice(1), 16);
    var r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
    var g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
    var b = clamp(Math.round((n & 255) * k), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------- save data
  function defaultProfile() {
    return {
      v: SAVE_VERSION, wins: 0, losses: 0, rung: 0, beaten: newBoolArray(D ? D.LADDER.length : 15),
      credits: 0, packs: 1, col: D ? D.starterCollection() : {},
      decks: [null, null, null], deckIndex: 0,
      tutorial: 0, draftBest: 0, draftRuns: 0, packsOpened: 0, oddsSeen: 0
    };
  }
  function newBoolArray(n) { var a = []; for (var i = 0; i < n; i++) a.push(false); return a; }

  function validProfile(v) {
    if (!v || typeof v !== 'object') return false;
    if (v.v !== SAVE_VERSION) return false;
    var ladder = D ? D.LADDER.length : 15;
    if (!Number.isInteger(v.wins) || v.wins < 0 || v.wins > 99999) return false;
    if (!Number.isInteger(v.losses) || v.losses < 0 || v.losses > 99999) return false;
    if (!Number.isInteger(v.rung) || v.rung < 0 || v.rung > ladder) return false;
    if (!Array.isArray(v.beaten) || v.beaten.length !== ladder) return false;
    for (var i = 0; i < v.beaten.length; i++) if (typeof v.beaten[i] !== 'boolean') return false;
    if (!Number.isInteger(v.credits) || v.credits < 0 || v.credits > 99999) return false;
    if (!Number.isInteger(v.packs) || v.packs < 0 || v.packs > 9999) return false;
    if (!v.col || typeof v.col !== 'object' || Array.isArray(v.col)) return false;
    for (var k in v.col) {
      var id = Number(k);
      if (!Number.isInteger(id) || id < 0 || id >= D.SET_SIZE) return false;
      if (!Number.isInteger(v.col[k]) || v.col[k] < 0 || v.col[k] > MAX_COPIES) return false;
    }
    if (!Array.isArray(v.decks) || v.decks.length !== DECK_SLOTS) return false;
    for (i = 0; i < DECK_SLOTS; i++) {
      var dk = v.decks[i];
      if (dk === null) continue;
      if (!Array.isArray(dk) || dk.length !== DECK_SIZE) return false;
      for (var j = 0; j < dk.length; j++) {
        if (!Number.isInteger(dk[j]) || dk[j] < 0 || dk[j] >= D.SET_SIZE) return false;
      }
    }
    if (!Number.isInteger(v.deckIndex) || v.deckIndex < 0 || v.deckIndex >= DECK_SLOTS) return false;
    if (!Number.isInteger(v.tutorial) || v.tutorial < 0 || v.tutorial > 9) return false;
    if (!Number.isInteger(v.draftBest) || v.draftBest < 0 || v.draftBest > 99) return false;
    if (!Number.isInteger(v.draftRuns) || v.draftRuns < 0 || v.draftRuns > 99999) return false;
    if (!Number.isInteger(v.packsOpened) || v.packsOpened < 0 || v.packsOpened > 99999) return false;
    if (!Number.isInteger(v.oddsSeen) || v.oddsSeen < 0 || v.oddsSeen > 1) return false;
    return true;
  }

  // ------------------------------------------------------------- probe hook
  var bootState = {
    mode: 'boot', screen: 'boot', rung: 0, progress: 0, wins: 0, losses: 0,
    turn: 0, prizes: [0, 0], activeHp: 0, foeHp: 0, collection: 0, credits: 0, packs: 0,
    forceMode: null, forceStage: null
  };
  var hook = (root.__bb && typeof root.__bb === 'object') ? root.__bb : {};
  if (!hook.state || typeof hook.state !== 'object') hook.state = bootState;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceMode')) hook.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceStage')) hook.forceStage = null;
  root.__bb = hook;

  var Game = { phaser: null, play: null };
  var profile = defaultProfile();
  var state = bootState;

  // ------------------------------------------------------------------ kit
  var kit = root.GGKit ? root.GGKit.create({
    slug: 'beastbind-cards', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { if (Game.play) Game.play.onKitPause(); },
    onResume: function () { if (Game.play) Game.play.onKitResume(); },
    onRestart: function () { if (Game.play) Game.play.restartCurrent(); }
  }) : null;

  if (kit) {
    var loaded = kit.save.get(null);
    profile = validProfile(loaded) ? loaded : defaultProfile();
    kit.audio.register({
      tap: 'assets/tap.mp3', deal: 'assets/deal.mp3', place: 'assets/place.mp3',
      energy: 'assets/energy.mp3', hit: 'assets/hit.mp3', crit: 'assets/crit.mp3',
      ko: 'assets/ko.mp3', retreat: 'assets/retreat.mp3', undo: 'assets/undo.mp3',
      error: 'assets/error.mp3', fanfare: 'assets/fanfare.mp3', defeat: 'assets/defeat.mp3',
      pack: 'assets/pack.mp3', reveal: 'assets/reveal.mp3', rare: 'assets/rare.mp3',
      theme_bind: 'assets/theme_bind.mp3', theme_duel: 'assets/theme_duel.mp3',
      theme_champion: 'assets/theme_champion.mp3'
    });
  }
  function persist() { if (kit) kit.save.set(profile); }
  function sfx(name, vol, rate) { if (kit) kit.audio.sfx(name, { volume: vol == null ? 0.8 : vol, rate: rate || 1 }); }
  // Music lazy-loads: nothing is fetched until the player's first interaction.
  var wantMusic = null, musicUnlocked = false;
  function music(name) {
    wantMusic = name;
    if (musicUnlocked && kit) kit.audio.music(name, 700);
  }
  function unlockMusic() {
    if (musicUnlocked) return;
    musicUnlocked = true;
    if (wantMusic && kit) kit.audio.music(wantMusic, 700);
  }
  function shake(mag, ms) { if (kit && !REDUCED) kit.juice.shake(mag, ms); }
  function hitStop(ms) { if (kit && !REDUCED) kit.juice.hitStop(ms); }

  // ------------------------------------------------------------ collection
  function owned(id) { var n = profile.col[id]; return Number.isInteger(n) ? n : 0; }
  function collectionCount() {
    var n = 0;
    for (var i = 0; i < D.SET_SIZE; i++) if (owned(i) > 0) n++;
    return n;
  }
  function grantCard(id) {
    if (!Number.isInteger(id) || id < 0 || id >= D.SET_SIZE) return 'invalid';
    var have = owned(id);
    if (have >= MAX_COPIES) {
      profile.credits = Math.min(99999, profile.credits + 1);
      return 'dust';
    }
    profile.col[id] = have + 1;
    return have === 0 ? 'new' : 'copy';
  }

  // ------------------------------------------------------------ deck logic
  function deckOf(index) {
    var d = profile.decks[index];
    if (Array.isArray(d) && d.length === DECK_SIZE && deckLegal(d)) return d.slice();
    var built = autoDeck();
    profile.decks[index] = built.slice();
    persist();
    return built;
  }
  function deckLegal(d) {
    if (!Array.isArray(d) || d.length !== DECK_SIZE) return false;
    var counts = {}, basics = 0, i;
    for (i = 0; i < d.length; i++) {
      var id = d[i];
      if (!Number.isInteger(id) || id < 0 || id >= D.SET_SIZE) return false;
      counts[id] = (counts[id] || 0) + 1;
      if (counts[id] > MAX_COPIES) return false;
      if (counts[id] > owned(id)) return false;
      if (C[id].t === 'c' && C[id].s === 1) basics++;
    }
    return basics >= MIN_BASICS;
  }
  function deckIssue(d) {
    if (!Array.isArray(d)) return 'Deck is empty';
    if (d.length !== DECK_SIZE) return 'Needs ' + DECK_SIZE + ' cards (' + d.length + ')';
    var counts = {}, basics = 0, i;
    for (i = 0; i < d.length; i++) {
      counts[d[i]] = (counts[d[i]] || 0) + 1;
      if (C[d[i]].t === 'c' && C[d[i]].s === 1) basics++;
    }
    for (var k in counts) if (counts[k] > owned(Number(k))) return 'You do not own that many copies';
    if (basics < MIN_BASICS) return 'Needs ' + MIN_BASICS + ' Stage 1 beasts (' + basics + ')';
    return '';
  }

  function autoDeck() {
    var own = function (id) { return Math.min(MAX_COPIES, owned(id)); };
    var deck = [], i, k;
    var esc = [0, 0, 0, 0];
    for (i = 0; i < D.CREATURE_COUNT; i++) esc[C[i].e] += own(i) * C[i].s * C[i].s;
    var el = 0;
    for (i = 1; i < 4; i++) if (esc[i] > esc[el]) el = i;
    var lines = {};
    for (i = 0; i < D.CREATURE_COUNT; i++) {
      if (C[i].e !== el) continue;
      (lines[C[i].line] = lines[C[i].line] || []).push(i);
    }
    var arr = [];
    for (k in lines) {
      var ids = lines[k].slice().sort(function (a, b) { return C[a].s - C[b].s; });
      var sc = 0;
      for (i = 0; i < ids.length; i++) sc += own(ids[i]) * (C[ids[i]].s === 1 ? 1 : C[ids[i]].s * 2);
      if (own(ids[0]) === 0) sc = 0;
      arr.push({ ids: ids, sc: sc });
    }
    arr.sort(function (a, b) { return b.sc - a.sc; });
    var push = function (id, n) { for (var q = 0; q < n && deck.length < DECK_SIZE; q++) deck.push(id); };
    for (i = 0; i < arr.length && i < 3; i++) {
      if (!arr[i].sc) continue;
      var L = arr[i].ids;
      push(L[0], own(L[0]));
      if (L[1]) push(L[1], own(L[1]));
      if (L[2]) push(L[2], own(L[2]));
    }
    var hcount = 0;
    var pref = ['DRAW2', 'EXTRA_E', 'HEAL30', 'SEARCH', 'BOOST20', 'SCOUT', 'DRAW3', 'HEAL60', 'QUICKEVO', 'GUST'];
    for (var p = 0; p < pref.length && hcount < 6 && deck.length < DECK_SIZE; p++) {
      for (i = 0; i < D.SET_SIZE; i++) {
        if (C[i].t === 'h' && C[i].fx === pref[p] && own(i) > 0) {
          var n = Math.min(own(i), 6 - hcount, DECK_SIZE - deck.length);
          push(i, n); hcount += n;
        }
      }
    }
    var counts = {};
    for (i = 0; i < deck.length; i++) counts[deck[i]] = (counts[deck[i]] || 0) + 1;
    var fill = function (test) {
      for (var q = 0; q < D.SET_SIZE && deck.length < DECK_SIZE; q++) {
        if (!test(C[q])) continue;
        var room = own(q) - (counts[q] || 0);
        while (room-- > 0 && deck.length < DECK_SIZE) { deck.push(q); counts[q] = (counts[q] || 0) + 1; }
      }
    };
    fill(function (c) { return c.t === 'c' && c.s === 1 && c.e === el; });
    fill(function (c) { return c.t === 'c' && c.s === 1; });
    fill(function (c) { return c.t === 'h'; });
    fill(function () { return true; });
    // guarantee enough openers
    var basics = deck.filter(function (id) { return C[id].t === 'c' && C[id].s === 1; }).length;
    for (i = 0; i < D.SET_SIZE && basics < MIN_BASICS + 1; i++) {
      if (!(C[i].t === 'c' && C[i].s === 1)) continue;
      var have = deck.filter(function (x) { return x === i; }).length;
      while (have < own(i) && basics < MIN_BASICS + 1) {
        for (var j = deck.length - 1; j >= 0; j--) {
          if (!(C[deck[j]].t === 'c' && C[deck[j]].s === 1)) { deck.splice(j, 1); break; }
        }
        deck.push(i); have++; basics++;
      }
    }
    return deck.slice(0, DECK_SIZE);
  }

  // ------------------------------------------------------------------ packs
  function rollRarity(slot) {
    if (slot < 3) return 0;
    var r = Math.random();
    if (slot === 3) return r < 0.75 ? 1 : 2;
    return r < 0.50 ? 0 : (r < 0.82 ? 1 : 2);
  }
  function openPack() {
    var out = { cards: [], kind: [], index: 0 };
    for (var i = 0; i < 5; i++) {
      var pool = D.BY_RAR[rollRarity(i)];
      var id = pool[Math.floor(Math.random() * pool.length)];
      out.cards.push(id);
      out.kind.push(grantCard(id));
    }
    profile.packs = Math.max(0, profile.packs - 1);
    profile.packsOpened++;
    persist();
    return out;
  }

  // ------------------------------------------------------------------ draft
  function draftChoices(pick) {
    var basicsOnly = pick < D.DRAFT_BASIC_PICKS;
    var pool = basicsOnly ? D.BASIC_IDS : null;
    var out = [], guard = 0;
    while (out.length < 3 && guard++ < 200) {
      var id;
      if (pool) id = pool[Math.floor(Math.random() * pool.length)];
      else {
        var r = Math.random();
        if (r < 0.4) id = D.BASIC_IDS[Math.floor(Math.random() * D.BASIC_IDS.length)];
        else if (r < 0.82) id = D.EVO_IDS[Math.floor(Math.random() * D.EVO_IDS.length)];
        else id = D.HANDLER_IDS[Math.floor(Math.random() * D.HANDLER_IDS.length)];
      }
      if (out.indexOf(id) < 0) out.push(id);
    }
    while (out.length < 3) out.push(D.BASIC_IDS[out.length % D.BASIC_IDS.length]);
    return out;
  }

  // ------------------------------------------------------------ texture bake
  var Bake = {};
  var detailCache = new Map();     // id -> texture key (LRU)
  var handCache = new Map();
  var DETAIL_LRU = 48;
  var HAND_TEX_W = 120, HAND_TEX_H = 168;

  function ctxOf(scene, key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var tex = scene.textures.createCanvas(key, w, h);
    return { tex: tex, ctx: tex.getContext() };
  }
  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function bakePixel(scene) {
    var o = ctxOf(scene, 'px', 4, 4);
    o.ctx.fillStyle = '#ffffff';
    o.ctx.fillRect(0, 0, 4, 4);
    o.tex.refresh();
  }

  function bakePanels(scene) {
    // nine-slice plates: 48x48, 16px corners
    function plate(key, fill, stroke, alphaTop) {
      var o = ctxOf(scene, key, 48, 48), c = o.ctx;
      c.clearRect(0, 0, 48, 48);
      var g = c.createLinearGradient(0, 0, 0, 48);
      g.addColorStop(0, alphaTop || fill);
      g.addColorStop(1, fill);
      c.fillStyle = g;
      roundRect(c, 1, 1, 46, 46, 14); c.fill();
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
      o.tex.refresh();
    }
    plate('plate', PAL.plateCss, 'rgba(126,160,200,0.30)', shade(PAL.plateHiCss, 1.12));
    plate('plateDark', '#101a27', 'rgba(96,126,160,0.24)', '#16222f');
    plate('plateAccent', '#2c7f45', 'rgba(120,240,160,0.55)', '#3aa35a');
    plate('plateGold', '#6b5320', 'rgba(224,179,74,0.75)', '#8a6b2a');
    plate('plateDanger', '#6b2f22', 'rgba(226,96,58,0.7)', '#8a3d2c');
    // faction plates
    for (var f = 0; f < 4; f++) {
      var o = ctxOf(scene, 'plateF' + f, 48, 48), c = o.ctx;
      c.clearRect(0, 0, 48, 48);
      var g = c.createLinearGradient(0, 0, 0, 48);
      g.addColorStop(0, shade(FCOL[f], 0.55));
      g.addColorStop(1, shade(FCOL[f], 0.28));
      c.fillStyle = g;
      roundRect(c, 1, 1, 46, 46, 14); c.fill();
      c.strokeStyle = FCOL[f]; c.lineWidth = 2; c.stroke();
      o.tex.refresh();
    }
  }

  function bakeGlyphs(scene) {
    // ring highlight (legal target), focus ring, glow blob, energy orb, pip, prize marker
    var o = ctxOf(scene, 'ring', 96, 96), c = o.ctx;
    c.clearRect(0, 0, 96, 96);
    c.strokeStyle = '#ffffff'; c.lineWidth = 5;
    roundRect(c, 5, 5, 86, 86, 16); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 12;
    roundRect(c, 8, 8, 80, 80, 16); c.stroke();
    o.tex.refresh();

    o = ctxOf(scene, 'glow', 128, 128); c = o.ctx;
    var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    o.tex.refresh();

    o = ctxOf(scene, 'spark', 16, 16); c = o.ctx;
    g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 16, 16);
    o.tex.refresh();

    o = ctxOf(scene, 'shard', 14, 14); c = o.ctx;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(7, 0); c.lineTo(14, 8); c.lineTo(6, 14); c.lineTo(0, 6); c.closePath(); c.fill();
    o.tex.refresh();

    o = ctxOf(scene, 'confetti', 10, 14); c = o.ctx;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 10, 14);
    o.tex.refresh();

    // energy orb per faction plus neutral
    for (var f = 0; f < 5; f++) {
      var col = f < 4 ? FCOL[f] : '#c9d6e4';
      o = ctxOf(scene, 'orb' + f, 24, 24); c = o.ctx;
      g = c.createRadialGradient(9, 8, 1, 12, 12, 12);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, f < 4 ? FLIGHT[f] : '#ffffff');
      g.addColorStop(1, shade(col, 0.55));
      c.fillStyle = g;
      c.beginPath(); c.arc(12, 12, 10.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1;
      c.beginPath(); c.arc(12, 12, 10.5, 0, Math.PI * 2); c.stroke();
      o.tex.refresh();
    }

    // small pill chips: the nine-slice plates have a 34 px floor, so labels
    // under that height use these scaled pills instead.
    [['chipDark', 'rgba(8,14,21,0.88)', 'rgba(150,175,205,0.35)'],
     ['chipGold', 'rgba(94,72,26,0.92)', 'rgba(224,179,74,0.8)'],
     ['chipRed', 'rgba(92,38,28,0.92)', 'rgba(226,96,58,0.8)']].forEach(function (spec) {
      var oo = ctxOf(scene, spec[0], 28, 20), cc = oo.ctx;
      cc.clearRect(0, 0, 28, 20);
      cc.fillStyle = spec[1];
      roundRect(cc, 1, 1, 26, 18, 7); cc.fill();
      cc.strokeStyle = spec[2]; cc.lineWidth = 1.5; cc.stroke();
      oo.tex.refresh();
    });

    // prize marker (empty and filled)
    for (var s = 0; s < 2; s++) {
      o = ctxOf(scene, 'prize' + s, 24, 24); c = o.ctx;
      c.clearRect(0, 0, 24, 24);
      c.lineWidth = 2;
      c.strokeStyle = s ? PAL.gold : 'rgba(150,175,200,0.55)';
      c.fillStyle = s ? 'rgba(224,179,74,0.85)' : 'rgba(20,32,47,0.7)';
      c.beginPath();
      for (var k = 0; k < 6; k++) {
        var ang = -Math.PI / 2 + k * Math.PI / 3;
        var px = 12 + Math.cos(ang) * 9, py = 12 + Math.sin(ang) * 9;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill(); c.stroke();
      o.tex.refresh();
    }

    // title crest
    o = ctxOf(scene, 'crest', 220, 220); c = o.ctx;
    c.clearRect(0, 0, 220, 220);
    for (var q = 0; q < 4; q++) {
      c.strokeStyle = FCOL[q]; c.lineWidth = 13; c.lineCap = 'butt';
      c.beginPath();
      c.arc(110, 110, 76, -Math.PI / 2 + q * Math.PI / 2 + 0.09, -Math.PI / 2 + (q + 1) * Math.PI / 2 - 0.09);
      c.stroke();
    }
    c.fillStyle = '#0e1622';
    c.beginPath();
    c.moveTo(110, 62); c.lineTo(152, 110); c.lineTo(110, 158); c.lineTo(68, 110); c.closePath();
    c.fill();
    c.strokeStyle = '#f0e2be'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#f5c45c';
    c.beginPath();
    c.moveTo(110, 78); c.lineTo(119, 110); c.lineTo(110, 142); c.lineTo(101, 110); c.closePath();
    c.fill();
    o.tex.refresh();
  }

  function bakeBoard(scene) {
    var o = ctxOf(scene, 'board', W, H), c = o.ctx;
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1119');
    g.addColorStop(0.42, '#12202e');
    g.addColorStop(0.58, '#12202e');
    g.addColorStop(1, '#0a1119');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // felt weave
    c.globalAlpha = 0.05;
    for (var y = 0; y < H; y += 6) {
      c.fillStyle = y % 12 === 0 ? '#ffffff' : '#000000';
      c.fillRect(0, y, W, 1);
    }
    c.globalAlpha = 1;

    // centre bind ring behind the band
    var cx = W / 2, cy = LY.band + 16;
    var rg = c.createRadialGradient(cx, cy, 8, cx, cy, 190);
    rg.addColorStop(0, 'rgba(120,170,220,0.16)');
    rg.addColorStop(1, 'rgba(120,170,220,0)');
    c.fillStyle = rg;
    c.fillRect(0, cy - 190, W, 380);
    for (var q = 0; q < 4; q++) {
      c.strokeStyle = shade(FCOL[q], 0.9); c.globalAlpha = 0.22; c.lineWidth = 2.5;
      c.beginPath();
      c.arc(cx, cy, 104, -Math.PI / 2 + q * Math.PI / 2 + 0.16, -Math.PI / 2 + (q + 1) * Math.PI / 2 - 0.16);
      c.stroke();
    }
    c.globalAlpha = 1;

    function slot(x, y, w, h, label) {
      c.strokeStyle = 'rgba(140,175,210,0.30)';
      c.setLineDash([7, 6]);
      c.lineWidth = 2;
      roundRect(c, x, y, w, h, 9);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(10,17,25,0.36)';
      roundRect(c, x, y, w, h, 9); c.fill();
      if (label) {
        c.fillStyle = 'rgba(147,166,187,0.55)';
        c.font = '600 11px ' + FONT;
        c.textAlign = 'center';
        c.fillText(label, x + w / 2, y + h / 2 + 4);
      }
    }
    // opponent bench + active
    var bx = benchX(0);
    for (var i = 0; i < 3; i++) slot(benchX(i), LY.oBench, BEN_W, BEN_H, 'BENCH');
    slot(28, LY.oActive, ACT_W, ACT_H, 'ACTIVE');
    // player active + bench
    slot(28, LY.pActive, ACT_W, ACT_H, 'ACTIVE');
    for (i = 0; i < 3; i++) slot(benchX(i), LY.pBench, BEN_W, BEN_H, 'BENCH');
    void bx;

    // hand tray plate
    c.fillStyle = 'rgba(8,14,21,0.72)';
    roundRect(c, 0, LY.hand - 8, W, H - (LY.hand - 8), 18); c.fill();
    c.strokeStyle = 'rgba(120,155,190,0.22)'; c.lineWidth = 1.5; c.stroke();

    o.tex.refresh();
  }
  function benchX(i) { return 98 + i * (BEN_W + 10); }

  // ------------------------------------------------------------ creature art
  // Each evolution line gets its own body plan, so two cards of the same
  // faction never read as the same silhouette.
  var FORM_COUNT = 5;
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function tone(css, k) { return shade(css, k); }

  function drawBeast(c, cx, cy, size, cardId) {
    var card = C[cardId];
    var f = card.e < 0 ? 3 : card.e;
    var lineHash = hashStr((card.line || 'x') + '|' + f);
    var form = lineHash % FORM_COUNT;
    var rng = mulberry(1013 + cardId * 7919);
    var s = size;
    var stage = card.s || 1;
    // per-line colour variation inside the faction band
    var warm = 0.95 + ((lineHash >> 3) % 7) * 0.055;
    var base = tone(FCOL[f], warm);
    var light = tone(FLIGHT[f], Math.min(1.12, warm + 0.22));
    var dim = tone(FDIM[f], 1.15 + ((lineHash >> 7) % 4) * 0.14);
    var ink = 'rgba(6,10,16,0.78)';
    var lw = Math.max(1.2, s * 0.035);

    c.save();
    c.translate(cx, cy);

    // ground shadow
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(0, s * 0.64, s * 0.55, s * 0.12, 0, 0, Math.PI * 2); c.fill();

    // ---------------------------------------------- faction motif (behind)
    c.globalAlpha = 0.55;
    c.strokeStyle = light; c.lineWidth = Math.max(1.5, s * 0.05);
    var i, a;
    if (f === 0) {
      for (i = 0; i < 3; i++) {
        var ox = (i - 1) * s * 0.34;
        c.beginPath();
        c.moveTo(ox, -s * 0.22);
        c.quadraticCurveTo(ox + s * 0.16, -s * 0.72 - i * s * 0.05, ox, -s * 0.98 - i * s * 0.04);
        c.quadraticCurveTo(ox - s * 0.16, -s * 0.7, ox, -s * 0.22);
        c.fillStyle = 'rgba(255,178,110,0.32)'; c.fill();
      }
    } else if (f === 1) {
      for (i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(-s * 0.8, -s * 0.18 - i * s * 0.22);
        c.quadraticCurveTo(0, -s * 0.56 - i * s * 0.22, s * 0.8, -s * 0.18 - i * s * 0.22);
        c.stroke();
      }
    } else if (f === 2) {
      for (i = 0; i < 4; i++) {
        a = -Math.PI * 0.86 + i * 0.42;
        c.beginPath();
        c.moveTo(0, -s * 0.12);
        c.quadraticCurveTo(Math.cos(a) * s * 0.6, -s * 0.56, Math.cos(a) * s * 0.98, Math.sin(a) * s * 0.55 - s * 0.18);
        c.stroke();
      }
    } else {
      for (i = 0; i < 2; i++) {
        var sx = i ? s * 0.58 : -s * 0.68;
        c.beginPath();
        c.moveTo(sx, -s * 0.98);
        c.lineTo(sx + s * 0.16, -s * 0.52);
        c.lineTo(sx - s * 0.06, -s * 0.48);
        c.lineTo(sx + s * 0.2, -s * 0.02);
        c.stroke();
      }
    }
    c.globalAlpha = 1;

    var grad = c.createLinearGradient(0, -s * 0.6, 0, s * 0.62);
    grad.addColorStop(0, light);
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, dim);
    c.strokeStyle = ink; c.lineWidth = lw;

    var headX = 0, headY = 0, headR = s * (0.2 + stage * 0.02);

    if (form === 0) {
      // quadruped prowler
      var bw = s * (0.48 + stage * 0.06), bh = s * (0.32 + stage * 0.045);
      c.fillStyle = dim;
      for (i = 0; i < 2; i++) {
        var lx = (i ? 1 : -1) * bw * 0.55;
        roundRectPath(c, lx - s * 0.09, s * 0.34, s * 0.18, s * 0.26, s * 0.06);
        c.fill(); c.stroke();
      }
      c.strokeStyle = base; c.lineWidth = Math.max(2, s * 0.09); c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-bw * 0.9, s * 0.16);
      c.quadraticCurveTo(-bw * 1.7, s * 0.24, -bw * 1.25, -s * 0.24);
      c.stroke();
      c.lineCap = 'butt'; c.strokeStyle = ink; c.lineWidth = lw;
      c.fillStyle = grad;
      c.beginPath(); c.ellipse(0, s * 0.2, bw, bh, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      headX = bw * 0.66; headY = -s * 0.14 - stage * s * 0.02;
    } else if (form === 1) {
      // winged glider
      c.fillStyle = tone(base, 0.86);
      for (i = 0; i < 2; i++) {
        var dir = i ? 1 : -1;
        c.beginPath();
        c.moveTo(dir * s * 0.1, -s * 0.06);
        c.quadraticCurveTo(dir * s * 0.95, -s * 0.78, dir * s * 1.02, -s * 0.02);
        c.quadraticCurveTo(dir * s * 0.62, s * 0.16, dir * s * 0.12, s * 0.1);
        c.closePath(); c.fill(); c.stroke();
      }
      c.strokeStyle = base; c.lineWidth = Math.max(2, s * 0.07); c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-s * 0.06, s * 0.34);
      c.quadraticCurveTo(-s * 0.34, s * 0.6, -s * 0.02, s * 0.62);
      c.stroke();
      c.lineCap = 'butt'; c.strokeStyle = ink; c.lineWidth = lw;
      c.fillStyle = grad;
      c.beginPath(); c.ellipse(0, s * 0.2, s * (0.24 + stage * 0.03), s * (0.3 + stage * 0.04), 0, 0, Math.PI * 2);
      c.fill(); c.stroke();
      headX = s * 0.16; headY = -s * 0.22 - stage * s * 0.02;
      headR = s * (0.17 + stage * 0.02);
    } else if (form === 2) {
      // coiled serpent
      c.fillStyle = grad;
      var segs = 3 + stage;
      for (i = segs - 1; i >= 0; i--) {
        var t = i / segs;
        var rx = s * (0.42 - t * 0.2) * (0.85 + stage * 0.08);
        var ry = s * (0.2 - t * 0.08) * (0.9 + stage * 0.08);
        var px = -s * 0.42 + Math.cos(t * 3.1) * s * 0.34 + t * s * 0.36;
        var py = s * 0.46 - t * s * 0.42;
        c.beginPath(); c.ellipse(px, py, rx, ry, -t * 0.5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      headX = s * 0.34; headY = -s * 0.12 - stage * s * 0.03;
      headR = s * (0.19 + stage * 0.02);
    } else if (form === 3) {
      // shelled crawler
      c.fillStyle = dim;
      for (i = 0; i < 3; i++) {
        var fx2 = -s * 0.4 + i * s * 0.4;
        roundRectPath(c, fx2 - s * 0.06, s * 0.3, s * 0.12, s * 0.24, s * 0.05);
        c.fill(); c.stroke();
      }
      c.fillStyle = grad;
      c.beginPath();
      c.ellipse(0, s * 0.24, s * (0.52 + stage * 0.05), s * (0.4 + stage * 0.05), 0, Math.PI, Math.PI * 2);
      c.lineTo(s * (0.52 + stage * 0.05), s * 0.32);
      c.lineTo(-s * (0.52 + stage * 0.05), s * 0.32);
      c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(8,12,18,0.42)'; c.lineWidth = Math.max(1, s * 0.028);
      for (i = 1; i < 3 + stage; i++) {
        var ang = Math.PI + i * (Math.PI / (3 + stage));
        c.beginPath();
        c.moveTo(0, s * 0.24);
        c.lineTo(Math.cos(ang) * s * 0.54, s * 0.24 + Math.sin(ang) * s * 0.42);
        c.stroke();
      }
      c.strokeStyle = ink; c.lineWidth = lw;
      headX = s * 0.5; headY = s * 0.1;
      headR = s * (0.16 + stage * 0.02);
    } else {
      // upright warden
      c.fillStyle = dim;
      for (i = 0; i < 2; i++) {
        var bx2 = (i ? 1 : -1) * s * 0.17;
        roundRectPath(c, bx2 - s * 0.09, s * 0.3, s * 0.18, s * 0.3, s * 0.07);
        c.fill(); c.stroke();
      }
      c.fillStyle = grad;
      roundRectPath(c, -s * (0.26 + stage * 0.03), -s * 0.28, s * (0.52 + stage * 0.06), s * 0.64, s * 0.16);
      c.fill(); c.stroke();
      c.fillStyle = tone(base, 0.9);
      for (i = 0; i < 2; i++) {
        var ax = (i ? 1 : -1) * s * (0.28 + stage * 0.03);
        c.beginPath();
        c.moveTo(ax * 0.8, -s * 0.18);
        c.quadraticCurveTo(ax * 1.5, s * 0.06, ax * 1.05, s * 0.3);
        c.quadraticCurveTo(ax * 0.72, s * 0.1, ax * 0.6, -s * 0.16);
        c.closePath(); c.fill(); c.stroke();
      }
      headX = 0; headY = -s * 0.48 - stage * s * 0.02;
      headR = s * (0.19 + stage * 0.02);
    }

    // ---------------------------------------------------------------- head
    c.fillStyle = grad; c.strokeStyle = ink; c.lineWidth = lw;
    c.beginPath(); c.ellipse(headX, headY, headR * 1.08, headR, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = dim;
    c.beginPath();
    c.ellipse(headX + headR * 0.8, headY + headR * 0.24, headR * 0.42, headR * 0.3, 0, 0, Math.PI * 2);
    c.fill(); c.stroke();

    // crests: horns for ember and thornwood, fins for tide, spines for storm
    c.fillStyle = light;
    var crests = 1 + (stage > 1 ? 1 : 0) + ((lineHash >> 11) % 2);
    for (i = 0; i < crests; i++) {
      var t2 = crests > 1 ? i / (crests - 1) : 0;
      var lean = -1.4 + t2 * 0.8;
      c.beginPath();
      c.moveTo(headX - headR * 0.22 + i * headR * 0.36, headY - headR * 0.68);
      c.lineTo(headX - headR * 0.04 + i * headR * 0.36 + Math.cos(lean) * headR * 0.5, headY - headR * (1.3 + stage * 0.14));
      c.lineTo(headX + headR * 0.24 + i * headR * 0.36, headY - headR * 0.6);
      c.closePath(); c.fill(); c.stroke();
    }
    if (f === 3) {
      c.strokeStyle = light; c.lineWidth = Math.max(1, s * 0.025);
      for (i = 0; i < 2; i++) {
        c.beginPath();
        c.moveTo(headX - headR * 0.5, headY - headR * 0.1 + i * headR * 0.3);
        c.lineTo(headX - headR * 1.1, headY - headR * 0.5 + i * headR * 0.5);
        c.stroke();
      }
      c.strokeStyle = ink; c.lineWidth = lw;
    }

    // eye
    c.fillStyle = '#0a1018';
    c.beginPath(); c.ellipse(headX + headR * 0.26, headY - headR * 0.06, headR * 0.3, headR * 0.26, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = f === 3 ? '#ffe9a8' : '#ffd77a';
    c.beginPath(); c.ellipse(headX + headR * 0.28, headY - headR * 0.06, headR * 0.12, headR * 0.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.ellipse(headX + headR * 0.18, headY - headR * 0.2, headR * 0.07, headR * 0.07, 0, 0, Math.PI * 2); c.fill();

    // deterministic markings
    c.globalAlpha = 0.45;
    c.fillStyle = light;
    var marks = 2 + Math.floor(rng() * 3);
    for (i = 0; i < marks; i++) {
      var mx = -s * 0.3 + rng() * s * 0.6;
      var my = s * 0.02 + rng() * s * 0.24;
      c.beginPath(); c.ellipse(mx, my, s * 0.07, s * 0.035, rng() * 1.2, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    c.restore();
  }
  function roundRectPath(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y); c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr); c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  function drawHandlerArt(c, cx, cy, s, cardId) {
    var card = C[cardId];
    var rng = mulberry(4001 + cardId * 1237);
    c.save(); c.translate(cx, cy);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(0, s * 0.6, s * 0.5, s * 0.12, 0, 0, Math.PI * 2); c.fill();
    // satchel and sigil, one silhouette per handler
    var hue = ['#d8c08a', '#8fd0f5', '#a3e2ac', '#ddc0ff', '#f0b48a'][cardId % 5];
    c.fillStyle = hue; c.strokeStyle = 'rgba(6,10,16,0.7)'; c.lineWidth = Math.max(1.2, s * 0.035);
    roundRectPath(c, -s * 0.42, -s * 0.1, s * 0.84, s * 0.62, s * 0.14); c.fill(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(-s * 0.42, s * 0.06, s * 0.84, s * 0.1);
    // hood
    c.fillStyle = shade(hue, 0.78);
    c.beginPath();
    c.moveTo(-s * 0.3, -s * 0.08);
    c.quadraticCurveTo(0, -s * 0.86, s * 0.3, -s * 0.08);
    c.closePath(); c.fill(); c.stroke();
    // sigil
    c.strokeStyle = '#ffe6ae'; c.lineWidth = Math.max(1.4, s * 0.05);
    var n = 3 + Math.floor(rng() * 3);
    c.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = -Math.PI / 2 + i * (Math.PI * 2 / n);
      var px = Math.cos(a) * s * 0.17, py = -s * 0.34 + Math.sin(a) * s * 0.17;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.stroke();
    void card;
    c.restore();
  }

  // ------------------------------------------------------------- card faces
  function fitText(c, str, max, startPx, weight) {
    var px = startPx;
    for (var i = 0; i < 8; i++) {
      c.font = weight + ' ' + px + 'px ' + FONT;
      if (c.measureText(str).width <= max) break;
      px -= 1;
      if (px <= 8) break;
    }
    return px;
  }

  function drawCardFace(c, w, h, cardId, detail) {
    var card = C[cardId];
    var f = card.t === 'h' ? 4 : card.e;
    var base = f < 4 ? FCOL[f] : '#c8b98e';
    var lightC = f < 4 ? FLIGHT[f] : '#f0e2be';
    var rarCol = D.RAR_COL[card.r] || D.RAR_COL[0];
    var pad = Math.round(w * 0.035);

    // frame
    c.clearRect(0, 0, w, h);
    var g = c.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, shade(base, 0.52));
    g.addColorStop(0.5, shade(base, 0.34));
    g.addColorStop(1, shade(base, 0.22));
    c.fillStyle = g;
    roundRectPath(c, 1, 1, w - 2, h - 2, w * 0.09); c.fill();
    c.strokeStyle = rarCol; c.lineWidth = Math.max(1.5, w * 0.018); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1;
    roundRectPath(c, 3.5, 3.5, w - 7, h - 7, w * 0.075); c.stroke();

    // art window
    var awX = pad + 2, awY = Math.round(h * 0.155), awW = w - (pad + 2) * 2, awH = Math.round(h * 0.44);
    var ag = c.createLinearGradient(0, awY, 0, awY + awH);
    ag.addColorStop(0, 'rgba(255,255,255,0.20)');
    ag.addColorStop(1, 'rgba(0,0,0,0.16)');
    c.fillStyle = ag;
    roundRectPath(c, awX, awY, awW, awH, w * 0.05); c.fill();
    c.save();
    roundRectPath(c, awX, awY, awW, awH, w * 0.05); c.clip();
    if (card.t === 'h') drawHandlerArt(c, awX + awW / 2, awY + awH * 0.54, awH * 0.42, cardId);
    else drawBeast(c, awX + awW * 0.48, awY + awH * 0.52, awH * 0.40, cardId);
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1;
    roundRectPath(c, awX, awY, awW, awH, w * 0.05); c.stroke();

    // header: HP left, faction glyph right
    c.textBaseline = 'alphabetic';
    if (card.t === 'c') {
      var hpPx = Math.round(h * 0.085);
      c.fillStyle = '#ffffff';
      c.font = '800 ' + hpPx + 'px ' + FONT;
      c.textAlign = 'left';
      var hpW = c.measureText(String(card.hp)).width;
      c.fillText(String(card.hp), pad + 3, Math.round(h * 0.115));
      c.fillStyle = 'rgba(255,255,255,0.65)';
      c.font = '700 ' + Math.round(h * 0.042) + 'px ' + FONT;
      c.fillText('HP', pad + 6 + hpW, Math.round(h * 0.113));
    } else {
      c.fillStyle = '#f6ecd2';
      c.font = '800 ' + Math.round(h * 0.05) + 'px ' + FONT;
      c.textAlign = 'left';
      c.fillText('HANDLER', pad + 3, Math.round(h * 0.10));
    }
    c.textAlign = 'right';
    c.fillStyle = lightC;
    c.font = '700 ' + Math.round(h * 0.075) + 'px ' + FONT;
    c.fillText(card.t === 'h' ? '✦' : D.EL_GLYPH[card.e], w - pad - 2, Math.round(h * 0.115));

    // stage badge
    if (card.t === 'c') {
      var badge = ['I', 'II', 'III'][card.s - 1] || 'I';
      var bw2 = Math.round(w * 0.16), bh2 = Math.round(h * 0.055);
      c.fillStyle = 'rgba(8,14,21,0.75)';
      roundRectPath(c, w - pad - bw2 - 2, awY + 3, bw2, bh2, 4); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#dfeaf6';
      c.font = '700 ' + Math.round(bh2 * 0.72) + 'px ' + FONT;
      c.textAlign = 'center';
      c.fillText(badge, w - pad - bw2 / 2 - 2, awY + bh2 * 0.78 + 3);
    }

    // name plate
    var nameY = awY + awH + Math.round(h * 0.055);
    c.fillStyle = 'rgba(6,11,17,0.62)';
    roundRectPath(c, pad, nameY - Math.round(h * 0.045), w - pad * 2, Math.round(h * 0.062), 4); c.fill();
    c.textAlign = 'center';
    c.fillStyle = '#f2f7fc';
    var npx = fitText(c, card.n, w - pad * 2 - 8, Math.round(h * 0.052), '700');
    c.font = '700 ' + npx + 'px ' + FONT;
    c.fillText(card.n, w / 2, nameY);

    if (!detail) {
      // mini face carries one keyword instead of the full rules text
      if (card.t === 'h') {
        c.textAlign = 'center';
        c.fillStyle = 'rgba(240,246,252,0.82)';
        var kpx = fitText(c, handlerKeyword(card.fx), w - pad * 2 - 6, Math.round(h * 0.05), '600');
        c.font = '600 ' + kpx + 'px ' + FONT;
        c.fillText(handlerKeyword(card.fx), w / 2, nameY + Math.round(h * 0.075));
      } else {
        c.textAlign = 'center';
        c.fillStyle = 'rgba(240,246,252,0.72)';
        c.font = '600 ' + Math.round(h * 0.046) + 'px ' + FONT;
        var top = card.a[card.a.length - 1];
        c.fillText(top ? top.d + ' dmg' : '', w / 2, nameY + Math.round(h * 0.075));
      }
      c.fillStyle = rarCol;
      c.beginPath(); c.arc(w - pad - 4, h - pad - 4, Math.max(2.5, w * 0.035), 0, Math.PI * 2); c.fill();
      return;
    }

    // detail body: attacks or handler text
    var by = nameY + Math.round(h * 0.035);
    if (card.t === 'c') {
      for (var i = 0; i < card.a.length; i++) {
        var atk = card.a[i];
        var rowH = Math.round(h * 0.095);
        var ry = by + i * (rowH + 3);
        c.fillStyle = 'rgba(255,255,255,0.07)';
        roundRectPath(c, pad, ry, w - pad * 2, rowH, 4); c.fill();
        // cost pips
        var px = pad + 6, pr = Math.max(3, w * 0.031);
        for (var k = 0; k < atk.c; k++) {
          c.fillStyle = k < atk.m ? lightC : '#b9c6d4';
          c.beginPath(); c.arc(px + pr + k * (pr * 2 + 2), ry + rowH * 0.5, pr, 0, Math.PI * 2); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1; c.stroke();
        }
        var costW = atk.c * (pr * 2 + 2) + 8;
        c.textAlign = 'left';
        c.fillStyle = '#eef5fb';
        var apx = fitText(c, atk.n, w - pad * 2 - costW - Math.round(w * 0.24), Math.round(h * 0.046), '600');
        c.font = '600 ' + apx + 'px ' + FONT;
        c.fillText(atk.n, pad + costW, ry + rowH * 0.63);
        c.textAlign = 'right';
        c.fillStyle = '#ffffff';
        c.font = '800 ' + Math.round(h * 0.052) + 'px ' + FONT;
        c.fillText(String(atk.d), w - pad - 5, ry + rowH * 0.66);
        if (atk.x) {
          c.textAlign = 'left';
          c.fillStyle = 'rgba(230,240,250,0.66)';
          c.font = '600 ' + Math.round(h * 0.032) + 'px ' + FONT;
          c.fillText(effectLabel(atk.x), pad + costW, ry + rowH * 0.95);
        }
      }
      // footer: retreat + weakness
      var fy = h - pad - Math.round(h * 0.018);
      c.textAlign = 'left';
      c.fillStyle = 'rgba(220,232,244,0.75)';
      c.font = '600 ' + Math.round(h * 0.036) + 'px ' + FONT;
      c.fillText('Retreat ' + card.rt, pad + 2, fy);
      c.textAlign = 'right';
      c.fillStyle = FCOL[D.WEAK_TO[card.e]];
      c.fillText('Weak ' + D.EL_SHORT[D.WEAK_TO[card.e]], w - pad - 2, fy);
    } else {
      c.textAlign = 'center';
      c.fillStyle = '#eef5fb';
      var words = String(card.text || '').split(' ');
      var lineStr = '', lines = [];
      c.font = '600 ' + Math.round(h * 0.044) + 'px ' + FONT;
      for (var wi = 0; wi < words.length; wi++) {
        var test = lineStr ? lineStr + ' ' + words[wi] : words[wi];
        if (c.measureText(test).width > w - pad * 2 - 8 && lineStr) { lines.push(lineStr); lineStr = words[wi]; }
        else lineStr = test;
      }
      if (lineStr) lines.push(lineStr);
      for (var li = 0; li < lines.length && li < 5; li++) {
        c.fillText(lines[li], w / 2, by + Math.round(h * 0.055) + li * Math.round(h * 0.055));
      }
    }
  }

  var HANDLER_KEYWORD = {
    DRAW2: 'Draw 2', DRAW3: 'Draw 3', HEAL30: 'Heal 30', HEAL60: 'Heal 60',
    EXTRA_E: 'Extra energy', GUST: 'Gust', SEARCH: 'Search', BOOST20: 'Plus 20',
    BOOST40: 'Plus 40', SHIELD20: 'Shield 20', RECYCLE: 'Recycle 2',
    SCOUT: 'Draw and heal', QUICKEVO: 'Quick evolve', SWAPSELF: 'Free switch', REBIND: 'Move energy'
  };
  function handlerKeyword(fx) { return HANDLER_KEYWORD[fx] || 'Handler'; }

  function effectLabel(x) {
    var p = String(x).split(':'), v = p[1] || '';
    switch (p[0]) {
      case 'recoil': return 'Recoil ' + v;
      case 'heal': return 'Heal ' + v;
      case 'drain': return 'Drain ' + v;
      case 'draw': return 'Draw 1';
      case 'shield': return 'Shield ' + v;
      case 'stall': return 'Binds the target';
      case 'bench': return 'Bench ' + v;
      case 'gust': return 'Drags a bench beast up';
      default: return '';
    }
  }

  function miniKey(id) { return 'cm' + id; }
  function detailKey(id) { return 'cd' + id; }

  function bakeMini(scene, id) {
    var o = ctxOf(scene, miniKey(id), MINI_W, MINI_H);
    drawCardFace(o.ctx, MINI_W, MINI_H, id, false);
    o.tex.refresh();
  }
  function ensureDetail(scene, id) {
    var key = detailKey(id);
    if (detailCache.has(id)) { detailCache.delete(id); detailCache.set(id, key); return key; }
    var o = ctxOf(scene, key, CARD_W, CARD_H);
    drawCardFace(o.ctx, CARD_W, CARD_H, id, true);
    o.tex.refresh();
    detailCache.set(id, key);
    while (detailCache.size > DETAIL_LRU) {
      var oldest = detailCache.keys().next().value;
      var oldKey = detailKey(oldest);
      detailCache.delete(oldest);
      // Any pooled image still pointing at the evicted texture is parked on
      // the 1x1 fallback first, so a removed texture is never referenced.
      if (scene.ui && scene.ui.images) {
        for (var q = 0; q < scene.ui.images.length; q++) {
          if (scene.ui.images[q].texture && scene.ui.images[q].texture.key === oldKey) {
            scene.ui.images[q].setTexture('px');
            scene.ui.images[q].setVisible(false);
          }
        }
      }
      if (scene.textures.exists(oldKey)) scene.textures.remove(oldKey);
    }
    return key;
  }
  // Hand thumbnails deliberately drop the fine print: at 78 px wide no attack
  // row can hit the 14 px legibility floor, so the hand shows HP, art and name
  // only. The readable copy lives on the active card's attack buttons and in
  // the tap-to-inspect card sheet.
  function handKey(id) { return 'ch' + id; }
  function ensureHand(scene, id) {
    var key = handKey(id);
    if (handCache.has(id)) { handCache.delete(id); handCache.set(id, key); return key; }
    var o = ctxOf(scene, key, HAND_TEX_W, HAND_TEX_H);
    drawCardFace(o.ctx, HAND_TEX_W, HAND_TEX_H, id, false);
    o.tex.refresh();
    handCache.set(id, key);
    while (handCache.size > DETAIL_LRU) {
      var oldest = handCache.keys().next().value;
      var oldKey = handKey(oldest);
      handCache.delete(oldest);
      if (scene.ui && scene.ui.images) {
        for (var q = 0; q < scene.ui.images.length; q++) {
          if (scene.ui.images[q].texture && scene.ui.images[q].texture.key === oldKey) {
            scene.ui.images[q].setTexture('px');
            scene.ui.images[q].setVisible(false);
          }
        }
      }
      if (scene.textures.exists(oldKey)) scene.textures.remove(oldKey);
    }
    return key;
  }

  function bakeCardBack(scene) {
    var BW = MINI_W * 2, BH = MINI_H * 2;
    var o = ctxOf(scene, 'back', BW, BH), c = o.ctx;
    var g = c.createLinearGradient(0, 0, BW, BH);
    g.addColorStop(0, '#1d2c40');
    g.addColorStop(1, '#101a27');
    c.fillStyle = g;
    roundRectPath(c, 2, 2, BW - 4, BH - 4, 12); c.fill();
    c.strokeStyle = 'rgba(150,180,215,0.5)'; c.lineWidth = 3; c.stroke();
    // reversible original weave: identical either way up, no rarity clue
    c.strokeStyle = 'rgba(200,220,240,0.24)'; c.lineWidth = 1.5;
    for (var i = -BH; i < BW; i += 14) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + BH, BH); c.stroke();
      c.beginPath(); c.moveTo(i + BH, 0); c.lineTo(i, BH); c.stroke();
    }
    c.fillStyle = 'rgba(11,17,28,0.85)';
    c.beginPath();
    c.moveTo(BW / 2, BH / 2 - 26); c.lineTo(BW / 2 + 22, BH / 2);
    c.lineTo(BW / 2, BH / 2 + 26); c.lineTo(BW / 2 - 22, BH / 2);
    c.closePath(); c.fill();
    c.strokeStyle = '#e0b34a'; c.lineWidth = 3; c.stroke();
    o.tex.refresh();
  }

  // ---------------------------------------------------------------- UI pool
  function UI(scene) {
    this.scene = scene;
    this.images = []; this.imgN = 0;
    this.slices = []; this.sliceN = 0;
    this.texts = {}; this.textN = {};
    this.zones = [];
    this.layer = scene.add.container(0, 0);
    this.layer.setDepth(10);
  }
  UI.STYLES = {
    h1: { fontFamily: FONT, fontSize: '30px', fontStyle: '800', color: PAL.ink },
    h2: { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: PAL.ink },
    h3: { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: PAL.ink },
    body: { fontFamily: FONT, fontSize: '14px', fontStyle: '500', color: PAL.ink },
    muted: { fontFamily: FONT, fontSize: '14px', fontStyle: '500', color: PAL.muted },
    small: { fontFamily: FONT, fontSize: '12px', fontStyle: '600', color: PAL.muted },
    chip: { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: PAL.ink },
    num: { fontFamily: FONT, fontSize: '26px', fontStyle: '800', color: PAL.ink },
    big: { fontFamily: FONT, fontSize: '34px', fontStyle: '800', color: PAL.ink }
  };
  UI.prototype.begin = function () {
    this.imgN = 0; this.sliceN = 0;
    this.order = 0;
    for (var k in this.textN) this.textN[k] = 0;
    this.zones.length = 0;
  };
  // Pooled objects are reused in a different sequence every render, so the
  // container's child order cannot carry z. Each allocation stamps its draw
  // index as depth and the layer is sorted once per render.
  UI.prototype.stamp = function (o) { o.setDepth(this.order++); return o; };
  UI.prototype.img = function (key, x, y, w, h, opts) {
    opts = opts || {};
    var o = this.images[this.imgN];
    if (!o) {
      o = this.scene.add.image(0, 0, key);
      this.layer.add(o);
      this.images.push(o);
    }
    this.imgN++;
    if (o.texture.key !== key) o.setTexture(key);
    o.setVisible(true).setPosition(x, y);
    o.setDisplaySize(w, h);
    o.setOrigin(opts.ox == null ? 0.5 : opts.ox, opts.oy == null ? 0.5 : opts.oy);
    o.setAlpha(opts.alpha == null ? 1 : opts.alpha);
    o.setAngle(opts.angle || 0);
    if (opts.tint == null) o.clearTint(); else o.setTint(opts.tint);
    o.setBlendMode(opts.blend || Phaser.BlendModes.NORMAL);
    return this.stamp(o);
  };
  UI.prototype.rect = function (x, y, w, h, color, alpha) {
    return this.img('px', x, y, w, h, { tint: color, alpha: alpha == null ? 1 : alpha, ox: 0, oy: 0 });
  };
  UI.prototype.panel = function (key, x, y, w, h, opts) {
    opts = opts || {};
    var o = this.slices[this.sliceN];
    if (!o) {
      o = this.scene.add.nineslice(0, 0, 'plate', undefined, 48, 48, 16, 16, 16, 16);
      o.setOrigin(0, 0);
      this.layer.add(o);
      this.slices.push(o);
    }
    this.sliceN++;
    if (o.texture.key !== key) o.setTexture(key);
    o.setVisible(true).setPosition(x, y);
    o.setSize(Math.max(34, w), Math.max(34, h));
    o.setAlpha(opts.alpha == null ? 1 : opts.alpha);
    if (opts.tint == null) o.clearTint(); else o.setTint(opts.tint);
    return this.stamp(o);
  };
  UI.prototype.text = function (style, x, y, str, opts) {
    opts = opts || {};
    if (!this.texts[style]) { this.texts[style] = []; this.textN[style] = 0; }
    var pool = this.texts[style];
    var n = this.textN[style];
    var t = pool[n];
    if (!t) {
      t = this.scene.add.text(0, 0, '', UI.STYLES[style]);
      t.setResolution(Math.min(2, root.devicePixelRatio || 1));
      this.layer.add(t);
      pool.push(t);
    }
    this.textN[style] = n + 1;
    if (t.text !== str) t.setText(str);
    var col = opts.color || UI.STYLES[style].color;
    if (t.style.color !== col) t.setColor(col);
    t.setVisible(true).setPosition(x, y);
    t.setOrigin(opts.ox == null ? 0 : opts.ox, opts.oy == null ? 0 : opts.oy);
    t.setAlpha(opts.alpha == null ? 1 : opts.alpha);
    t.setAngle(opts.angle || 0);
    if (opts.size && t.style.fontSize !== opts.size) t.setFontSize(opts.size);
    else if (!opts.size && t.style.fontSize !== UI.STYLES[style].fontSize) t.setFontSize(UI.STYLES[style].fontSize);
    return this.stamp(t);
  };
  UI.prototype.zone = function (x, y, w, h, id, data, focusable) {
    // Zones are rebuilt every render, so press/release matching must compare a
    // stable key, never object identity (an object payload would never match).
    var key = id + '|';
    if (data !== null && data !== undefined) {
      key += (typeof data === 'object') ? (data.side + ',' + data.slot) : String(data);
    }
    this.zones.push({ x: x, y: y, w: w, h: h, id: id, data: data, key: key, focus: focusable !== false });
    return this.zones[this.zones.length - 1];
  };
  UI.prototype.end = function () {
    var i, k;
    for (i = this.imgN; i < this.images.length; i++) this.images[i].setVisible(false);
    for (i = this.sliceN; i < this.slices.length; i++) this.slices[i].setVisible(false);
    for (k in this.texts) {
      for (i = this.textN[k]; i < this.texts[k].length; i++) this.texts[k][i].setVisible(false);
    }
    this.layer.sort('depth');
  };
  UI.prototype.hitTest = function (x, y) {
    for (var i = this.zones.length - 1; i >= 0; i--) {
      var z = this.zones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
    }
    return null;
  };

  // ------------------------------------------------------------ boot scene
  function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;
  BootScene.prototype.create = function () {
    var scene = this;
    var steps = [];
    steps.push(function () { bakePixel(scene); bakePanels(scene); });
    steps.push(function () { bakeGlyphs(scene); bakeCardBack(scene); });
    steps.push(function () { bakeBoard(scene); });
    var ids = [];
    for (var i = 0; i < D.SET_SIZE; i++) ids.push(i);
    for (var s = 0; s < ids.length; s += 10) {
      (function (chunk) {
        steps.push(function () { for (var q = 0; q < chunk.length; q++) bakeMini(scene, chunk[q]); });
      })(ids.slice(s, s + 10));
    }
    // pre-warm the detail faces of the active deck so the first hand never hitches
    steps.push(function () {
      var deck = deckOf(profile.deckIndex);
      var uniq = [];
      for (var q = 0; q < deck.length; q++) if (uniq.indexOf(deck[q]) < 0) uniq.push(deck[q]);
      for (q = 0; q < uniq.length; q++) { ensureDetail(scene, uniq[q]); ensureHand(scene, uniq[q]); }
    });
    steps.push(function () {
      if (kit) kit.audio.preload(['tap', 'deal', 'place', 'energy', 'hit', 'crit', 'ko', 'retreat', 'undo', 'error', 'fanfare', 'defeat', 'pack', 'reveal', 'rare']);
    });

    var idx = 0;
    if (kit) { kit.loader.show('Beastbind Cards'); kit.loader.progress(0.02); }
    function run() {
      if (idx >= steps.length) {
        if (kit) { kit.loader.progress(1); kit.loader.hide(); kit.registerPWA(); }
        scene.scene.start('play');
        return;
      }
      steps[idx]();
      idx++;
      if (kit) kit.loader.progress(0.02 + 0.98 * (idx / steps.length));
      scene.time.delayedCall(1, run);
    }
    run();
  };

  // ------------------------------------------------------------ play scene
  function PlayScene() {
    Phaser.Scene.call(this, { key: 'play' });
    this.screen = 'menu';
    this.prev = 'menu';
    this.dirty = true;
    this.G = null;
    this.mode = 'menu';
    this.rung = 0;
    this.sel = null;           // {type:'hand'|'attack'|..., index}
    this.drag = null;          // {handIdx, x, y, dx, dy, moved}
    this.pending = null;       // pre-confirm action
    this.anim = null;          // attack animation timeline
    this.floats = [];          // damage counters
    this.ghosts = [];          // KO ghosts
    this.toast = null;
    this.banner = null;
    this.coach = null;
    this.hpVis = Object.create(null);
    this.aiTimer = 0;
    this.aiThinking = false;
    this.focus = -1;
    this.scrollY = 0;
    this.scrollMax = 0;
    this.pack = null;
    this.draft = null;
    this.deckEdit = null;
    this.result = null;
    this.detailCard = -1;
    this.pointerId = -1;
    this.tutorialStep = 0;
    this.time0 = 0;
    this.lastForceMode = null;
    this.lastForceStage = null;
  }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.create = function () {
    var scene = this;
    Game.play = this;

    this.boardImg = this.add.image(0, 0, 'board').setOrigin(0, 0).setDepth(0).setVisible(false);
    this.bgFill = this.add.image(0, 0, 'px').setOrigin(0, 0).setDisplaySize(W, H).setTint(PAL.deep).setDepth(-1);
    this.ui = new UI(this);
    this.fxLayer = this.add.container(0, 0).setDepth(30);

    this.buildParticles();

    this.input.on('pointerdown', function (p) { scene.onDown(p); });
    this.input.on('pointermove', function (p) { scene.onMove(p); });
    this.input.on('pointerup', function (p) { scene.onUp(p); });
    this.input.on('pointerupoutside', function (p) { scene.onUp(p); });

    // Keyboard edges are registered on window AFTER GGKit init so the kit's
    // own listeners are already in place and never clobber ours.
    this.keyHandler = function (e) { scene.onKey(e); };
    root.addEventListener('keydown', this.keyHandler);

    this.events.on('shutdown', function () { root.removeEventListener('keydown', scene.keyHandler); });

    music('theme_bind');
    this.setScreen('menu');
    this.applyForce(true);
    this.syncProbe();
  };

  PlayScene.prototype.buildParticles = function () {
    // 1 impact sparks, 2 energy motes, 3 KO shards, 4 reward confetti, 5 ambient drift
    var cfgBase = { lifespan: 520, quantity: 0, frequency: -1, blendMode: 'ADD' };
    this.pImpact = this.add.particles(0, 0, 'spark', Object.assign({}, cfgBase, {
      speed: { min: 90, max: 300 }, scale: { start: 1.0, end: 0 },
      alpha: { start: 1, end: 0 }, lifespan: { min: 260, max: 520 },
      angle: { min: 0, max: 360 }, gravityY: 260, emitting: false
    })).setDepth(28);
    this.pMote = this.add.particles(0, 0, 'spark', Object.assign({}, cfgBase, {
      speed: { min: 12, max: 60 }, scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 }, lifespan: { min: 500, max: 900 },
      angle: { min: 200, max: 340 }, gravityY: -40, emitting: false
    })).setDepth(28);
    this.pShard = this.add.particles(0, 0, 'shard', {
      speed: { min: 120, max: 340 }, scale: { start: 1.1, end: 0.2 },
      alpha: { start: 1, end: 0 }, lifespan: { min: 420, max: 780 },
      angle: { min: 0, max: 360 }, rotate: { min: -240, max: 240 },
      gravityY: 420, emitting: false
    }).setDepth(29);
    this.pConfetti = this.add.particles(0, 0, 'confetti', {
      speed: { min: 130, max: 380 }, scale: { start: 1, end: 0.7 },
      alpha: { start: 1, end: 0 }, lifespan: { min: 900, max: 1600 },
      angle: { min: 200, max: 340 }, rotate: { min: -300, max: 300 },
      gravityY: 520, emitting: false
    }).setDepth(29);
    this.pAmbient = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: W }, y: H + 10,
      speed: { min: 8, max: 26 }, scale: { start: 0.42, end: 0 },
      alpha: { start: 0.34, end: 0 }, lifespan: { min: 3200, max: 6200 },
      angle: { min: 250, max: 290 }, frequency: REDUCED ? 900 : 380,
      blendMode: 'ADD', quantity: 1
    }).setDepth(1);
  };

  PlayScene.prototype.burst = function (system, x, y, count, tint) {
    if (REDUCED) count = Math.max(2, Math.round(count * 0.4));
    if (system.setParticleTint) system.setParticleTint(tint == null ? 0xffffff : tint);
    system.emitParticleAt(x, y, count);
  };

  // -------------------------------------------------------------- screens
  PlayScene.prototype.setScreen = function (s, keepScroll) {
    if (this.screen !== s) this.prev = this.screen;
    this.screen = s;
    if (!keepScroll) this.scrollY = 0;
    this.focus = -1;
    this.dirty = true;
    this.boardImg.setVisible(s === 'duel');
    this.pAmbient.setVisible(true);
    this.syncProbe();
  };

  PlayScene.prototype.onKitPause = function () {
    this.drag = null; this.pointerId = -1;
  };
  PlayScene.prototype.onKitResume = function () { this.dirty = true; };
  PlayScene.prototype.restartCurrent = function () {
    if (this.screen === 'duel' && this.G) this.startDuel(this.rung, this.mode);
    else this.setScreen('menu');
  };

  // ------------------------------------------------------------- duel flow
  PlayScene.prototype.startDuel = function (rung, mode) {
    var ladder = D.LADDER;
    var idx = clamp(whole(rung, 0), 0, ladder.length - 1);
    var foe = ladder[idx];
    if (!foe) foe = ladder[0];
    var deck;
    if (mode === 'draft' && this.draft && this.draft.deck && this.draft.deck.length === DECK_SIZE) deck = this.draft.deck.slice();
    else deck = deckOf(profile.deckIndex);
    this.mode = mode || 'gauntlet';
    this.rung = idx;
    this.G = E.create(deck, foe, { rung: idx, mode: this.mode });
    E.beginBattle(this.G);
    // Pre-bake every detail face both decks can show, so no card art is
    // rasterised mid-duel.
    var warm = [];
    deck.concat(foe.d).forEach(function (cid) { if (warm.indexOf(cid) < 0) warm.push(cid); });
    for (var wi = 0; wi < warm.length && wi < DETAIL_LRU - 4; wi++) {
      ensureDetail(this, warm[wi]);
      ensureHand(this, warm[wi]);
    }
    this.fxMark = 0;
    this.sel = null; this.drag = null; this.pending = null; this.anim = null;
    this.floats.length = 0; this.ghosts.length = 0;
    this.hpVis = Object.create(null);
    this.aiTimer = 0; this.aiThinking = false;
    this.result = null;
    this.setScreen('duel');
    this.showBanner((this.mode === 'draft' ? 'Draft duel' : 'Rung ' + (idx + 1)) + ': ' + foe.n, foe.el >= 0 ? FCOL[foe.el] : PAL.gold, 1500);
    music(idx === ladder.length - 1 ? 'theme_champion' : 'theme_duel');
    sfx('deal', 0.7);
    this.tutorialStep = profile.tutorial >= 5 ? 99 : 0;
    if (this.tutorialStep === 0) this.setCoach('Drag a Stage 1 beast from your hand onto the ACTIVE slot.');
    else this.setCoach('');
  };

  PlayScene.prototype.endDuel = function (won) {
    var G = this.G;
    var rewards = { packs: 0, first: false };
    if (won) {
      profile.wins++;
      if (this.mode === 'gauntlet') {
        if (!profile.beaten[this.rung]) { profile.beaten[this.rung] = true; rewards.first = true; }
        if (this.rung === profile.rung && profile.rung < D.LADDER.length - 1) profile.rung++;
        else if (this.rung === profile.rung && profile.rung === D.LADDER.length - 1) profile.rung = D.LADDER.length;
      }
      if (profile.wins % D.WINS_PER_PACK === 0) { profile.packs = Math.min(9999, profile.packs + 1); rewards.packs++; }
      if (rewards.first) { profile.packs = Math.min(9999, profile.packs + 1); rewards.packs++; }
    } else profile.losses++;

    if (this.mode === 'draft' && this.draft) {
      if (won) {
        this.draft.wins++;
        if (this.draft.wins > profile.draftBest) profile.draftBest = this.draft.wins;
        if (this.draft.wins >= DRAFT_RUN_WINS) {
          profile.packs = Math.min(9999, profile.packs + 2);
          rewards.packs += 2;
          this.draft.complete = true;
          profile.draftRuns++;
        }
      } else { this.draft.done = true; profile.draftRuns++; }
    }
    persist();
    this.result = {
      won: won, rewards: rewards, foe: G.foe.n,
      turns: G.turn, prizes: [G.p.prizes, G.o.prizes]
    };
    this.setScreen('result');
    sfx(won ? 'fanfare' : 'defeat', 0.85);
    if (won && !REDUCED) {
      for (var i = 0; i < 3; i++) this.burst(this.pConfetti, 60 + i * 130, 200, 26, [0xe0b34a, 0x39d353, 0x8fd0f5][i]);
    }
    music('theme_bind');
  };

  // ---------------------------------------------------------- player moves
  PlayScene.prototype.canAct = function () {
    return !!this.G && !this.G.over && this.G.who === 'p' && !this.G.await && !this.anim && !this.aiThinking;
  };
  // A knockout can leave the board waiting on a promotion even during the
  // opponent's turn, so promotion has its own gate.
  PlayScene.prototype.awaitPromote = function () {
    return !!this.G && !this.G.over && this.G.await === 'promote' && !this.anim && !this.aiThinking;
  };
  PlayScene.prototype.allows = function (action) {
    if (action && action.t === 'promote') return this.awaitPromote();
    return this.canAct();
  };

  PlayScene.prototype.propose = function (action) {
    if (!this.allows(action)) return;
    this.pending = action;
    this.sel = null;
    this.dirty = true;
    sfx('tap', 0.5);
  };

  PlayScene.prototype.cancelPending = function () {
    if (!this.pending) return;
    this.pending = null;
    this.dirty = true;
    sfx('undo', 0.5);
  };

  PlayScene.prototype.commit = function () {
    var a = this.pending;
    if (!a || !this.allows(a)) return;
    var G = this.G, S = G.p, ok = false;
    this.pending = null;
    this.fxMark = G.fx.length;
    if (a.t !== 'attack' && a.t !== 'end') E.pushUndo(G);

    if (a.t === 'active') ok = E.placeActive(G, S, a.hand);
    else if (a.t === 'bench') ok = E.placeBench(G, S, a.hand, a.slot);
    else if (a.t === 'evolve') ok = E.evolve(G, S, a.hand, a.slot);
    else if (a.t === 'handler') ok = E.playHandler(G, S, a.hand, a.slot);
    else if (a.t === 'energy') ok = E.attachEnergy(G, S, a.slot, null);
    else if (a.t === 'retreat') ok = E.retreat(G, S, a.slot, false);
    else if (a.t === 'attack') { this.beginAttackAnim(a.index); return; }
    else if (a.t === 'end') { E.clearUndo(G); E.endTurn(G); this.afterPlayerTurn(); return; }
    else if (a.t === 'promote') ok = E.promote(G, a.slot);

    if (!ok) {
      sfx('error', 0.6);
      this.setToast('Not a legal play');
      if (G.history.length) G.history.pop();
      this.dirty = true;
      return;
    }
    G.actionsThisTurn++;
    this.playFx();
    this.advanceTutorial(a.t);
    if (G.pendingEnd && !G.await) { G.pendingEnd = false; }
    if (G.over) { this.endDuel(G.over === 1); return; }
    if (G.who === 'o') this.afterPlayerTurn();
    this.dirty = true;
    this.syncProbe();
  };

  PlayScene.prototype.doUndo = function () {
    if (!this.G || !E.canUndo(this.G) || this.anim) return;
    if (E.undo(this.G)) {
      sfx('undo', 0.7);
      this.setToast('Move taken back');
      this.pending = null; this.sel = null;
      this.dirty = true;
      this.syncProbe();
    }
  };

  PlayScene.prototype.beginAttackAnim = function (idx) {
    var G = this.G;
    if (!E.canAttack(G, G.p, idx)) { sfx('error', 0.6); this.setToast('Not enough energy'); return; }
    E.clearUndo(G);
    this.fxMark = G.fx.length;
    this.anim = { t: 0, phase: 0, side: 'p', idx: idx, resolved: false };
    this.dirty = true;
  };

  PlayScene.prototype.afterPlayerTurn = function () {
    if (this.G.over) { this.endDuel(this.G.over === 1); return; }
    if (this.G.who === 'o') { this.aiThinking = true; this.aiTimer = 380; }
    this.dirty = true;
  };

  // -------------------------------------------------------------- FX replay
  PlayScene.prototype.playFx = function () {
    var G = this.G;
    if (!G) return;
    for (var i = this.fxMark; i < G.fx.length; i++) {
      var ev = G.fx[i];
      this.applyFxEvent(ev);
    }
    this.fxMark = G.fx.length;
  };

  PlayScene.prototype.slotPoint = function (side, slot) {
    if (side === 'p') {
      if (slot < 0) return { x: 28 + ACT_W / 2, y: LY.pActive + ACT_H / 2 };
      return { x: benchX(slot) + BEN_W / 2, y: LY.pBench + BEN_H / 2 };
    }
    if (slot < 0) return { x: 28 + ACT_W / 2, y: LY.oActive + ACT_H / 2 };
    return { x: benchX(slot) + BEN_W / 2, y: LY.oBench + BEN_H / 2 };
  };

  PlayScene.prototype.applyFxEvent = function (ev) {
    var p = this.slotPoint(ev.side, ev.slot);
    switch (ev.k) {
      case 'place':
        this.burst(this.pMote, p.x, p.y, 8, 0xbcd4ea);
        sfx('place', 0.7);
        break;
      case 'energy':
        this.burst(this.pMote, p.x, p.y + 20, 14, 0xffe3a0);
        sfx('energy', 0.6);
        break;
      case 'evolve':
        this.burst(this.pMote, p.x, p.y, 22, 0xffffff);
        sfx('reveal', 0.7);
        break;
      case 'swap':
        sfx('retreat', 0.6);
        break;
      case 'hit':
        this.addFloat(p.x, p.y - 12, '-' + ev.v, ev.x === 'weak' ? PAL.gold : '#ff9a7a', ev.x === 'weak');
        this.burst(this.pImpact, p.x, p.y, ev.x === 'weak' ? 24 : 14, ev.x === 'weak' ? 0xffd27a : 0xff9a6a);
        shake(ev.x === 'weak' ? 7 : 4, ev.x === 'weak' ? 220 : 140);
        hitStop(ev.x === 'weak' ? 70 : 40);
        sfx(ev.x === 'weak' ? 'crit' : 'hit', 0.85);
        break;
      case 'heal':
        this.addFloat(p.x, p.y - 12, '+' + ev.v, PAL.good, false);
        this.burst(this.pMote, p.x, p.y, 12, 0x7be08f);
        break;
      case 'shield':
        this.addFloat(p.x, p.y - 12, 'Shield ' + ev.v, '#8fd0f5', false);
        break;
      case 'bind':
        this.addFloat(p.x, p.y - 12, 'Bound', '#8fd0f5', false);
        break;
      case 'ko':
        this.addGhost(ev.side, ev.slot, ev.v);
        this.burst(this.pShard, p.x, p.y, 22, 0xdfe9f5);
        shake(9, 300); hitStop(90);
        sfx('ko', 0.9);
        break;
      case 'draw':
        sfx('deal', 0.5);
        break;
      case 'handler':
        this.burst(this.pMote, W / 2, LY.band + 16, 16, 0xf0e2be);
        sfx('reveal', 0.55);
        break;
      default: break;
    }
  };

  PlayScene.prototype.addFloat = function (x, y, str, color, big) {
    if (this.floats.length > 10) this.floats.shift();
    this.floats.push({ x: x, y: y, str: str, color: color, t: 0, life: big ? 1100 : 850, big: !!big });
  };
  PlayScene.prototype.addGhost = function (side, slot, cardId) {
    if (!Number.isInteger(cardId) || cardId < 0 || cardId >= D.SET_SIZE) return;
    var p = this.slotPoint(side, slot);
    if (this.ghosts.length > 6) this.ghosts.shift();
    this.ghosts.push({ x: p.x, y: p.y, id: cardId, t: 0, life: 620, w: slot < 0 ? ACT_W : BEN_W, h: slot < 0 ? ACT_H : BEN_H });
  };
  PlayScene.prototype.setToast = function (str) {
    this.toast = { str: str, t: 0, life: 1000 };
    this.dirty = true;
  };
  PlayScene.prototype.showBanner = function (str, color, life) {
    this.banner = { str: str, color: color || PAL.ink, t: 0, life: life || 1400 };
    this.dirty = true;
  };
  PlayScene.prototype.setCoach = function (str) {
    this.coach = str ? { str: str, t: 0 } : null;
    this.dirty = true;
  };

  PlayScene.prototype.advanceTutorial = function (kind) {
    if (profile.tutorial >= 5) return;
    var step = profile.tutorial;
    var next = step;
    if (step === 0 && kind === 'active') next = 1;
    else if (step === 1 && kind === 'bench') next = 2;
    else if (step === 2 && kind === 'energy') next = 3;
    else if (step === 3 && kind === 'attack') next = 4;
    if (next !== step) {
      profile.tutorial = next;
      persist();
      var lines = [
        'Drag a Stage 1 beast from your hand onto the ACTIVE slot.',
        'Now fill a BENCH slot. Benched beasts can be swapped in later.',
        'Tap ENERGY, then tap a beast to charge it. One per turn.',
        'Tap an attack row, then Confirm. Cancel costs you nothing.',
        'Knock out three beasts to take the rank.'
      ];
      this.setCoach(lines[next] || '');
    }
  };

  // ------------------------------------------------------------ input
  PlayScene.prototype.onDown = function (p) {
    unlockMusic();
    if (kit && kit.paused) return;
    if (this.pointerId >= 0 && this.pointerId !== p.id) return;
    this.pointerId = p.id;
    var x = p.worldX, y = p.worldY;
    this.downPt = { x: x, y: y, t: this.time0 };
    var z = this.ui.hitTest(x, y);
    this.downZone = z;
    if (z && z.id === 'hand' && this.screen === 'duel' && this.canAct()) {
      this.drag = { hand: z.data, x: x, y: y, ox: z.x + z.w / 2, oy: z.y + z.h / 2, moved: false };
      this.dirty = true;
    }
    if (this.scrollMax > 0) this.scrollGrab = { y: y, start: this.scrollY };
  };

  PlayScene.prototype.onMove = function (p) {
    if (this.pointerId !== p.id) return;
    var x = p.worldX, y = p.worldY;
    if (this.drag) {
      this.drag.x = x; this.drag.y = y;
      if (Math.abs(x - this.drag.ox) > 6 || Math.abs(y - this.drag.oy) > 6) this.drag.moved = true;
      this.dirty = true;
      return;
    }
    if (this.scrollGrab && this.scrollMax > 0) {
      var d = y - this.scrollGrab.y;
      if (Math.abs(d) > 4) {
        this.scrollY = clamp(this.scrollGrab.start - d, 0, this.scrollMax);
        this.downZone = null;
        this.dirty = true;
      }
    }
  };

  PlayScene.prototype.onUp = function (p) {
    if (this.pointerId !== p.id) return;
    this.pointerId = -1;
    var x = p.worldX, y = p.worldY;
    var drag = this.drag;
    this.drag = null;
    this.scrollGrab = null;
    if (drag && drag.moved) {
      this.dropCard(drag.hand, x, y);
      this.dirty = true;
      return;
    }
    var z = this.ui.hitTest(x, y);
    if (z && this.downZone && z.key === this.downZone.key) this.activate(z);
    this.downZone = null;
    this.dirty = true;
  };

  PlayScene.prototype.dropCard = function (handIdx, x, y) {
    var G = this.G;
    if (!G || !this.canAct()) return;
    var legal = E.legalTargets(G, handIdx);
    var id = G.p.hand[handIdx];
    if (id === undefined) return;
    var card = C[id];
    var target = this.slotAt(x, y);
    if (card.t === 'h') {
      if (legal.handler) this.propose({ t: 'handler', hand: handIdx, slot: target ? target.slot : null, label: 'Play ' + card.n });
      else { sfx('error', 0.6); this.setToast(legal.reason || 'No legal target'); }
      return;
    }
    if (!target || target.side !== 'p') { sfx('error', 0.5); return; }
    if (card.s === 1) {
      if (target.slot < 0 && legal.active) this.propose({ t: 'active', hand: handIdx, label: 'Send out ' + card.n });
      else if (target.slot >= 0 && legal.bench.indexOf(target.slot) >= 0) this.propose({ t: 'bench', hand: handIdx, slot: target.slot, label: 'Bench ' + card.n });
      else { sfx('error', 0.6); this.setToast(legal.reason || 'That slot is taken'); }
      return;
    }
    if (legal.evolve.indexOf(target.slot) >= 0) this.propose({ t: 'evolve', hand: handIdx, slot: target.slot, label: 'Evolve into ' + card.n });
    else { sfx('error', 0.6); this.setToast(legal.reason || 'Cannot evolve there'); }
  };

  PlayScene.prototype.slotAt = function (x, y) {
    if (y >= LY.pActive - 8 && y <= LY.pActive + ACT_H + 8 && x >= 20 && x <= 28 + ACT_W + 8) return { side: 'p', slot: -1 };
    if (y >= LY.pBench - 8 && y <= LY.pBench + BEN_H + 8) {
      for (var i = 0; i < 3; i++) if (x >= benchX(i) - 6 && x <= benchX(i) + BEN_W + 6) return { side: 'p', slot: i };
    }
    if (y >= LY.oActive - 8 && y <= LY.oActive + ACT_H + 8 && x >= 20 && x <= 28 + ACT_W + 8) return { side: 'o', slot: -1 };
    if (y >= LY.oBench - 8 && y <= LY.oBench + BEN_H + 8) {
      for (i = 0; i < 3; i++) if (x >= benchX(i) - 6 && x <= benchX(i) + BEN_W + 6) return { side: 'o', slot: i };
    }
    return null;
  };

  PlayScene.prototype.onKey = function (e) {
    unlockMusic();
    if (kit && kit.paused && e.code !== 'Escape') return;
    var zones = this.ui.zones.filter(function (z) { return z.focus; });
    var handled = true;
    switch (e.code) {
      case 'ArrowDown': case 'ArrowRight':
        this.focus = zones.length ? (this.focus + 1) % zones.length : -1; break;
      case 'ArrowUp': case 'ArrowLeft':
        this.focus = zones.length ? (this.focus - 1 + zones.length) % zones.length : -1; break;
      case 'Enter': case 'Space':
        if (this.focus >= 0 && zones[this.focus]) this.activate(zones[this.focus]);
        else if (this.pending) this.commit();
        break;
      case 'Escape':
        if (this.pending) this.cancelPending();
        else if (this.screen === 'duel') this.openPause();
        else if (this.screen !== 'menu') this.setScreen('menu');
        break;
      case 'KeyU': this.doUndo(); break;
      case 'KeyE': if (this.screen === 'duel' && this.canAct()) this.propose({ t: 'end', label: 'End your turn' }); break;
      case 'KeyR': if (kit) kit.restart(); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); this.dirty = true; }
  };

  PlayScene.prototype.openPause = function () {
    var scene = this;
    if (!kit) return;
    kit.openSettings([function (box, row) {
      row('Reduced flourish', function () { return !kit.juice.enabled; }, function (v) { kit.juice.enabled = !v; });
      var b = document.createElement('button');
      b.textContent = 'Leave duel';
      b.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#3a2029;border:1px solid #6b3040;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
      b.addEventListener('click', function () {
        box.remove();
        kit.resume('settings');
        scene.setScreen('menu');
        music('theme_bind');
      });
      box.appendChild(b);
    }]);
  };

  // ------------------------------------------------------------ activation
  PlayScene.prototype.activate = function (z) {
    var scene = this;
    var G = this.G;
    switch (z.id) {
      case 'nav': sfx('tap', 0.6); this.setScreen(z.data); return;
      case 'menuPlay': sfx('tap', 0.6); this.setScreen('ladder'); return;
      case 'quick': sfx('tap', 0.6); this.setScreen('quick'); return;
      case 'settings': sfx('tap', 0.6); this.openPause(); return;
      case 'pause': sfx('tap', 0.6); this.openPause(); return;
      case 'back': sfx('tap', 0.5); this.setScreen(z.data || 'menu'); return;
      case 'rung': {
        var i = z.data;
        if (i > profile.rung) { sfx('error', 0.6); this.setToast('Beat rung ' + (profile.rung + 1) + ' first'); return; }
        this.startDuel(i, 'gauntlet');
        return;
      }
      case 'quickRung': {
        var q = z.data;
        if (q > Math.max(0, profile.rung)) { sfx('error', 0.6); this.setToast('Not unlocked yet'); return; }
        this.startDuel(q, 'quick');
        return;
      }
      case 'startDraft': this.beginDraft(); return;
      case 'draftPick': this.draftPick(z.data); return;
      case 'draftPlay': this.startDuel(this.draftOpponent(), 'draft'); return;
      case 'draftExit': this.draft = null; this.setScreen('menu'); return;
      case 'openPack': {
        if (profile.packs <= 0) { sfx('error', 0.6); this.setToast('No packs yet. Win duels to earn them.'); return; }
        this.pack = openPack();
        profile.oddsSeen = 1; persist();
        sfx('pack', 0.9);
        this.setScreen('packOpen');
        return;
      }
      case 'packNext': {
        if (!this.pack) { this.setScreen('packs'); return; }
        if (this.pack.index < this.pack.cards.length - 1) {
          this.pack.index++;
          var kind = this.pack.kind[this.pack.index];
          sfx(C[this.pack.cards[this.pack.index]].r === 2 ? 'rare' : 'reveal', 0.8);
          if (kind === 'new') this.burst(this.pConfetti, W / 2, 300, 16, 0xe0b34a);
          this.dirty = true;
        } else { this.pack = null; this.setScreen('packs'); }
        return;
      }
      case 'claim': {
        var cid = z.data;
        if (owned(cid) > 0) { sfx('error', 0.5); return; }
        if (profile.credits < D.CLAIM_COST) { sfx('error', 0.6); this.setToast('Needs ' + D.CLAIM_COST + ' dust'); return; }
        profile.credits -= D.CLAIM_COST;
        profile.col[cid] = 1;
        persist();
        sfx('rare', 0.8);
        this.burst(this.pConfetti, W / 2, 300, 14, 0xe0b34a);
        this.setToast('Claimed ' + C[cid].n);
        this.dirty = true;
        return;
      }
      case 'card': this.detailCard = z.data; this.dirty = true; sfx('tap', 0.4); return;
      case 'closeCard': this.detailCard = -1; this.dirty = true; return;
      case 'deckSlot': profile.deckIndex = z.data; persist(); this.deckEdit = deckOf(z.data); sfx('tap', 0.5); this.dirty = true; return;
      case 'deckAdd': this.deckAdd(z.data); return;
      case 'deckRemove': this.deckRemove(z.data); return;
      case 'deckAuto': this.deckEdit = autoDeck(); sfx('reveal', 0.6); this.dirty = true; return;
      case 'deckSave': this.deckSave(); return;
      case 'filter': this.deckFilter = z.data; this.scrollY = 0; this.dirty = true; sfx('tap', 0.4); return;
      // duel
      case 'hand': {
        if (!this.canAct()) return;
        var id = G.p.hand[z.data];
        if (id === undefined) return;
        if (this.sel && this.sel.type === 'hand' && this.sel.index === z.data) { this.detailCard = id; this.sel = null; this.dirty = true; return; }
        this.sel = { type: 'hand', index: z.data };
        sfx('tap', 0.4);
        this.dirty = true;
        return;
      }
      case 'slot': {
        this.duelSlotTap(z.data.side, z.data.slot);
        return;
      }
      case 'attack': {
        if (!this.canAct()) return;
        if (!E.canAttack(G, G.p, z.data)) { sfx('error', 0.6); this.setToast(G.p.active && G.p.active.fzn ? 'Your beast is bound this turn' : 'Not enough energy'); return; }
        var atk = C[G.p.active.c].a[z.data];
        this.propose({ t: 'attack', index: z.data, label: atk.n + ' for ' + E.damageOf(G, G.p, G.o, atk) });
        return;
      }
      case 'energyMode':
        if (!this.canAct()) return;
        if (G.p.energyLeft <= 0) { sfx('error', 0.6); this.setToast('Energy already attached'); return; }
        this.sel = (this.sel && this.sel.type === 'energy') ? null : { type: 'energy' };
        sfx('tap', 0.5); this.dirty = true;
        return;
      case 'retreatMode':
        if (!this.canAct()) return;
        if (!G.p.active) { sfx('error', 0.6); return; }
        if (G.p.active.fzn) { sfx('error', 0.6); this.setToast('Bound beasts cannot retreat'); return; }
        if (G.p.active.e.length < E.retreatCost(G.p.active)) { sfx('error', 0.6); this.setToast('Retreat costs ' + E.retreatCost(G.p.active) + ' energy'); return; }
        this.sel = (this.sel && this.sel.type === 'retreat') ? null : { type: 'retreat' };
        sfx('tap', 0.5); this.dirty = true;
        return;
      case 'undo': this.doUndo(); return;
      case 'end':
        if (!this.canAct()) return;
        this.propose({ t: 'end', label: 'End your turn' });
        return;
      case 'confirm': this.commit(); return;
      case 'cancel': this.cancelPending(); return;
      case 'log': this.setScreen('log', true); return;
      case 'result':
        if (z.data === 'again') this.startDuel(this.rung, this.mode);
        else if (z.data === 'next') this.startDuel(Math.min(this.rung + 1, D.LADDER.length - 1), 'gauntlet');
        else if (z.data === 'draft') { if (this.draft && !this.draft.complete && !this.draft.done) this.startDuel(this.draftOpponent(), 'draft'); else { this.draft = null; this.setScreen('menu'); } }
        else this.setScreen('menu');
        return;
      case 'promote': this.propose({ t: 'promote', slot: z.data, label: 'Send out ' + C[G.p.bench[z.data].c].n }); return;
      default: break;
    }
    void scene;
  };

  PlayScene.prototype.duelSlotTap = function (side, slot) {
    var G = this.G;
    if (!G) return;
    if (G.await === 'promote' && side === 'p' && slot >= 0 && G.p.bench[slot]) {
      this.propose({ t: 'promote', slot: slot, label: 'Send out ' + C[G.p.bench[slot].c].n });
      return;
    }
    if (!this.canAct()) return;
    var sel = this.sel;
    if (sel && sel.type === 'energy' && side === 'p') {
      var cr = E.evoTarget(G.p, slot);
      if (!cr) { sfx('error', 0.5); return; }
      this.propose({ t: 'energy', slot: slot, label: 'Charge ' + C[cr.c].n });
      return;
    }
    if (sel && sel.type === 'retreat' && side === 'p' && slot >= 0) {
      if (!G.p.bench[slot]) { sfx('error', 0.5); return; }
      this.propose({ t: 'retreat', slot: slot, label: 'Retreat to ' + C[G.p.bench[slot].c].n });
      return;
    }
    if (sel && sel.type === 'hand' && side === 'p') {
      this.dropCard(sel.index, this.slotPoint('p', slot).x, this.slotPoint('p', slot).y);
      this.sel = null;
      return;
    }
    // inspect
    var target = E.evoTarget(side === 'p' ? G.p : G.o, slot);
    if (target) { this.detailCard = target.c; this.dirty = true; sfx('tap', 0.4); }
  };

  // ------------------------------------------------------------ deck edit
  PlayScene.prototype.deckAdd = function (id) {
    if (!this.deckEdit) this.deckEdit = deckOf(profile.deckIndex);
    if (this.deckEdit.length >= DECK_SIZE) { sfx('error', 0.6); this.setToast('Deck is full'); return; }
    var have = this.deckEdit.filter(function (x) { return x === id; }).length;
    if (have >= Math.min(MAX_COPIES, owned(id))) { sfx('error', 0.6); this.setToast('No more copies owned'); return; }
    this.deckEdit.push(id);
    sfx('tap', 0.5);
    this.dirty = true;
  };
  PlayScene.prototype.deckRemove = function (index) {
    if (!this.deckEdit) return;
    if (index < 0 || index >= this.deckEdit.length) return;
    this.deckEdit.splice(index, 1);
    sfx('undo', 0.5);
    this.dirty = true;
  };
  PlayScene.prototype.deckSave = function () {
    var issue = deckIssue(this.deckEdit);
    if (issue) { sfx('error', 0.7); this.setToast(issue); return; }
    profile.decks[profile.deckIndex] = this.deckEdit.slice();
    persist();
    sfx('reveal', 0.7);
    this.setToast('Deck saved');
    this.dirty = true;
  };

  // ---------------------------------------------------------------- draft
  PlayScene.prototype.beginDraft = function () {
    this.draft = { pick: 0, deck: [], choices: draftChoices(0), wins: 0, complete: false, done: false };
    this.setScreen('draft');
    sfx('deal', 0.8);
  };
  PlayScene.prototype.draftPick = function (i) {
    var dr = this.draft;
    if (!dr || !dr.choices || i < 0 || i >= dr.choices.length) return;
    var id = dr.choices[i];
    for (var q = 0; q < D.DRAFT_COPIES; q++) dr.deck.push(id);
    dr.pick++;
    sfx('tap', 0.7);
    if (dr.pick >= D.DRAFT_PICKS) {
      dr.choices = null;
      if (dr.deck.length !== DECK_SIZE) dr.deck = dr.deck.slice(0, DECK_SIZE);
      while (dr.deck.length < DECK_SIZE) dr.deck.push(D.BASIC_IDS[dr.deck.length % D.BASIC_IDS.length]);
      this.setToast('Draft deck ready');
    } else dr.choices = draftChoices(dr.pick);
    this.dirty = true;
  };
  PlayScene.prototype.draftOpponent = function () {
    var dr = this.draft;
    var base = dr ? dr.wins : 0;
    return clamp(3 + base * 4, 0, D.LADDER.length - 1);
  };

  // ---------------------------------------------------------------- update
  PlayScene.prototype.update = function (time, delta) {
    this.time0 = time;
    var dt = Math.min(48, delta);
    var j = kit ? kit.juice.frame() : { dx: 0, dy: 0, frozen: false };
    this.cameras.main.setScroll(-j.dx, -j.dy);

    if (kit && kit.paused) return;

    this.applyForce(false);

    var animating = false;
    if (this.anim) { this.stepAnim(dt); animating = true; }
    if (this.floats.length) {
      for (var i = this.floats.length - 1; i >= 0; i--) {
        this.floats[i].t += dt;
        if (this.floats[i].t >= this.floats[i].life) this.floats.splice(i, 1);
      }
      animating = true;
    }
    if (this.ghosts.length) {
      for (i = this.ghosts.length - 1; i >= 0; i--) {
        this.ghosts[i].t += dt;
        if (this.ghosts[i].t >= this.ghosts[i].life) this.ghosts.splice(i, 1);
      }
      animating = true;
    }
    if (this.toast) { this.toast.t += dt; if (this.toast.t >= this.toast.life) this.toast = null; animating = true; }
    if (this.banner) { this.banner.t += dt; if (this.banner.t >= this.banner.life) this.banner = null; animating = true; }
    if (this.coach) { this.coach.t += dt; animating = this.coach.t < 3600 || animating; }

    // health bar catch-up
    if (this.G) {
      var crs = E.allCr(this.G.p).concat(E.allCr(this.G.o));
      for (i = 0; i < crs.length; i++) {
        var cr = crs[i];
        var want = E.curHp(cr);
        var cur = this.hpVis[cr.uid];
        if (cur === undefined) this.hpVis[cr.uid] = want;
        else if (Math.abs(cur - want) > 0.5) {
          this.hpVis[cr.uid] = lerp(cur, want, Math.min(1, dt / 110));
          animating = true;
        } else this.hpVis[cr.uid] = want;
      }
    }

    // AI turn pacing
    if (this.G && this.aiThinking && !this.anim && !this.G.over) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.fxMark = this.G.fx.length;
        var before = this.G.who;
        var more = E.aiStep(this.G);
        this.playFx();
        this.dirty = true;
        if (this.G.over) { this.endDuel(this.G.over === 1); return; }
        if (!more || this.G.who !== before) {
          this.aiThinking = false;
          if (this.G.who === 'p') { E.clearUndo(this.G); this.setCoach(profile.tutorial >= 5 ? '' : this.coachLine()); }
        } else this.aiTimer = 340;
      }
      animating = true;
    }

    if (this.G && this.G.await === 'promote' && this.G.who === 'p' && !this.anim) {
      if (this.coach == null) this.setCoach('Choose a benched beast to send out.');
    }

    if (animating) this.dirty = true;
    if (this.dirty) { this.render(); this.dirty = false; }
  };

  PlayScene.prototype.coachLine = function () {
    var lines = [
      'Drag a Stage 1 beast from your hand onto the ACTIVE slot.',
      'Now fill a BENCH slot. Benched beasts can be swapped in later.',
      'Tap ENERGY, then tap a beast to charge it. One per turn.',
      'Tap an attack row, then Confirm. Cancel costs you nothing.',
      'Knock out three beasts to take the rank.'
    ];
    return lines[clamp(profile.tutorial, 0, 4)];
  };

  PlayScene.prototype.stepAnim = function (dt) {
    var a = this.anim;
    a.t += dt;
    if (!a.resolved && a.t >= 190) {
      a.resolved = true;
      var G = this.G;
      this.fxMark = G.fx.length;
      E.attack(G, G.p, a.idx);
      this.playFx();
      this.advanceTutorial('attack');
    }
    if (a.t >= 760) {
      this.anim = null;
      var G2 = this.G;
      if (G2.over) { this.endDuel(G2.over === 1); return; }
      if (G2.who === 'o') this.afterPlayerTurn();
      this.syncProbe();
    }
  };

  // ----------------------------------------------------------- force hooks
  PlayScene.prototype.applyForce = function (initial) {
    if (!root.__bb) return;
    var fm = root.__bb.forceMode == null ? null : String(root.__bb.forceMode);
    var fs = root.__bb.forceStage == null ? null : whole(root.__bb.forceStage, 0);
    if (!initial && fm === this.lastForceMode && fs === this.lastForceStage) return;
    this.lastForceMode = fm; this.lastForceStage = fs;
    if (!fm) return;
    var stage = fs == null ? 0 : clamp(fs, 0, D.LADDER.length - 1);
    if (fm === 'duel' || fm === 'gauntlet') this.startDuel(stage, 'gauntlet');
    else if (fm === 'quick') this.startDuel(stage, 'quick');
    else if (fm === 'draft') { this.beginDraft(); }
    else if (fm === 'packs') { this.setScreen('packs'); }
    else if (fm === 'odds') { this.setScreen('odds'); }
    else if (fm === 'collection') { this.setScreen('collection'); }
    else if (fm === 'deck') { this.deckEdit = deckOf(profile.deckIndex); this.setScreen('deck'); }
    else if (fm === 'ladder') { this.setScreen('ladder'); }
    else if (fm === 'menu') { this.setScreen('menu'); }
  };

  PlayScene.prototype.syncProbe = function () {
    var G = this.G;
    var out = state;
    out.mode = this.mode;
    out.screen = this.screen;
    out.rung = this.rung;
    out.wins = profile.wins;
    out.losses = profile.losses;
    out.collection = collectionCount();
    out.credits = profile.credits;
    out.packs = profile.packs;
    out.progress = D.LADDER.length ? profile.rung / D.LADDER.length : 0;
    if (G) {
      out.turn = G.turn;
      out.prizes = [G.p.prizes, G.o.prizes];
      out.activeHp = G.p.active ? E.curHp(G.p.active) : 0;
      out.foeHp = G.o.active ? E.curHp(G.o.active) : 0;
      out.over = G.over;
      out.foe = G.foe.n;
    } else {
      out.turn = 0; out.prizes = [0, 0]; out.activeHp = 0; out.foeHp = 0; out.over = 0; out.foe = '';
    }
    out.forceMode = root.__bb ? root.__bb.forceMode : null;
    out.forceStage = root.__bb ? root.__bb.forceStage : null;
    if (root.__bb) root.__bb.state = out;
  };

  // ---------------------------------------------------------------- render
  PlayScene.prototype.render = function () {
    var ui = this.ui;
    ui.begin();
    switch (this.screen) {
      case 'menu': this.renderMenu(ui); break;
      case 'ladder': this.renderLadder(ui, false); break;
      case 'quick': this.renderLadder(ui, true); break;
      case 'duel': this.renderDuel(ui); break;
      case 'result': this.renderResult(ui); break;
      case 'collection': this.renderCollection(ui); break;
      case 'deck': this.renderDeck(ui); break;
      case 'packs': this.renderPacks(ui); break;
      case 'packOpen': this.renderPackOpen(ui); break;
      case 'odds': this.renderOdds(ui); break;
      case 'draft': this.renderDraft(ui); break;
      case 'log': this.renderLog(ui); break;
      default: this.renderMenu(ui); break;
    }
    if (this.detailCard >= 0) this.renderCardDetail(ui, this.detailCard);
    this.renderFocus(ui);
    ui.end();
    this.syncProbe();
  };

  PlayScene.prototype.renderFocus = function (ui) {
    if (this.focus < 0) return;
    var zones = ui.zones.filter(function (z) { return z.focus; });
    var z = zones[this.focus];
    if (!z) return;
    ui.img('ring', z.x + z.w / 2, z.y + z.h / 2, z.w + 8, z.h + 8, { tint: 0xe0b34a, alpha: 0.85 });
  };

  // ------------------------------------------------------------- menu
  PlayScene.prototype.renderMenu = function (ui) {
    ui.rect(0, 0, W, H, PAL.deep, 1);
    ui.img('glow', W / 2, 210, 460, 460, { tint: 0x2c5a86, alpha: 0.4, blend: Phaser.BlendModes.ADD });
    ui.img('crest', W / 2, 180, 190, 190, {});
    ui.text('h1', W / 2, 292, 'BEASTBIND', { ox: 0.5 });
    ui.text('h3', W / 2, 326, 'C A R D S', { ox: 0.5, color: PAL.gold });

    var y = 372;
    var self = this;
    function big(label, sub, id, data, tint) {
      ui.panel(tint || 'plate', 24, y, W - 48, 62, {});
      ui.text('h2', 44, y + 14, label, {});
      ui.text('small', 44, y + 38, sub, {});
      ui.zone(24, y, W - 48, 62, id, data);
      y += 70;
      void self;
    }
    var ladderDone = profile.rung >= D.LADDER.length;
    big('Gauntlet', ladderDone ? 'All 15 ranks bound' : 'Rung ' + (profile.rung + 1) + ' of ' + D.LADDER.length + ': ' + D.LADDER[Math.min(profile.rung, D.LADDER.length - 1)].n, 'menuPlay', null, 'plateAccent');
    big('Quick Duel', 'Any deck you have already beaten', 'quick', null);
    big('Draft', 'Ten picks, then a three win run. Best: ' + profile.draftBest, 'nav', 'draft');

    var row = y + 6;
    var items = [
      ['Collection', 'collection', collectionCount() + '/' + D.SET_SIZE],
      ['Decks', 'deck', 'Slot ' + (profile.deckIndex + 1)],
      ['Packs', 'packs', String(profile.packs)]
    ];
    for (var i = 0; i < items.length; i++) {
      var x = 24 + i * 114;
      ui.panel('plateDark', x, row, 106, 60, {});
      ui.text('chip', x + 53, row + 12, items[i][0], { ox: 0.5 });
      ui.text('h3', x + 53, row + 32, items[i][2], { ox: 0.5, color: PAL.gold });
      ui.zone(x, row, 106, 60, items[i][1] === 'deck' ? 'nav' : 'nav', items[i][1]);
    }

    var y2 = row + 76;
    ui.panel('plateDark', 24, y2, W - 48, 54, {});
    ui.text('small', 40, y2 + 10, 'Wins ' + profile.wins + '   Losses ' + profile.losses + '   Dust ' + profile.credits, {});
    ui.text('small', 40, y2 + 30, 'Every pull rate is posted. Nothing here is for sale.', { color: PAL.dim });

    var y3 = y2 + 66;
    ui.panel('plate', 24, y3, 168, 48, {});
    ui.text('chip', 108, y3 + 16, 'Pull odds', { ox: 0.5 });
    ui.zone(24, y3, 168, 48, 'nav', 'odds');
    ui.panel('plate', 198, y3, 168, 48, {});
    ui.text('chip', 282, y3 + 16, 'Settings', { ox: 0.5 });
    ui.zone(198, y3, 168, 48, 'settings', null);

    this.renderToast(ui);
  };

  // ------------------------------------------------------------- ladder
  PlayScene.prototype.renderLadder = function (ui, quick) {
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, quick ? 'Quick Duel' : 'Gauntlet', 'menu');
    var rows = D.LADDER;
    var top = 96, rowH = 92;
    var viewH = H - top - 16;
    this.scrollMax = Math.max(0, rows.length * rowH - viewH);
    this.scrollY = clamp(this.scrollY, 0, this.scrollMax);
    for (var i = 0; i < rows.length; i++) {
      var y = top + i * rowH - this.scrollY;
      if (y < top - rowH || y > H) continue;
      var L = rows[i];
      var locked = quick ? i > Math.max(0, profile.rung) : i > profile.rung;
      var beaten = profile.beaten[i];
      var f = L.el >= 0 ? L.el : 3;
      ui.panel(locked ? 'plateDark' : 'plateF' + f, 16, y, W - 32, rowH - 10, { alpha: locked ? 0.7 : 1 });
      ui.text('h3', 34, y + 10, (i + 1) + '. ' + L.n, { color: locked ? PAL.dim : PAL.ink });
      ui.text('small', 34, y + 32, (L.el >= 0 ? D.EL[L.el] : 'All factions') + '  |  ' + L.arch, { color: locked ? PAL.dim : PAL.ink });
      ui.text('small', 34, y + 52, locked ? 'Locked' : L.tell, { color: locked ? PAL.dim : PAL.muted });
      if (beaten) ui.img('prize1', W - 42, y + 24, 22, 22, {});
      ui.zone(16, y, W - 32, rowH - 10, quick ? 'quickRung' : 'rung', i);
    }
    this.renderToast(ui);
  };

  PlayScene.prototype.header = function (ui, title, backTo) {
    ui.rect(0, 0, W, 84, PAL.felt, 1);
    ui.rect(0, 83, W, 2, PAL.line, 1);
    ui.text('h2', 20, 36, title, {});
    ui.panel('plateDark', W - 78, 22, 60, 44, {});
    ui.text('chip', W - 48, 38, 'Back', { ox: 0.5 });
    ui.zone(W - 78, 22, 60, 44, 'back', backTo || 'menu');
  };

  // ------------------------------------------------------------- duel
  PlayScene.prototype.renderDuel = function (ui) {
    var G = this.G;
    if (!G) { this.setScreen('menu'); return; }
    var i;
    this.scrollMax = 0;

    // ---- HUD
    ui.rect(0, 0, W, LY.hudH + LY.hud, PAL.felt, 0.92);
    var f = G.foe.el >= 0 ? G.foe.el : 3;
    ui.img('px', 0, 0, 4, LY.hudH + LY.hud, { tint: FNUM[f], ox: 0, oy: 0 });
    ui.text('h3', 14, 12, G.foe.n, {});
    ui.text('small', 14, 32, G.foe.arch + '  |  deck ' + G.o.deck.length + '  hand ' + G.o.hand.length, {});
    // prize markers: opponent progress (right, top) and yours
    for (i = 0; i < E.PRIZES; i++) {
      ui.img(G.o.prizes > i ? 'prize1' : 'prize0', W - 122 + i * 24, 18, 20, 20, {});
      ui.img(G.p.prizes > i ? 'prize1' : 'prize0', W - 122 + i * 24, 40, 20, 20, {});
    }
    ui.text('small', W - 138, 12, 'Foe', { ox: 1, color: PAL.muted });
    ui.text('small', W - 138, 34, 'You', { ox: 1, color: PAL.gold });
    ui.panel('plateDark', W - 52, 8, 44, 44, {});
    ui.text('h3', W - 30, 22, '||', { ox: 0.5 });
    ui.zone(W - 52, 8, 44, 44, 'pause', null);

    // ---- opponent bench
    for (i = 0; i < 3; i++) {
      var ob = G.o.bench[i];
      if (ob) this.drawCreature(ui, ob, benchX(i), LY.oBench, BEN_W, BEN_H, false, 'o', i);
      ui.zone(benchX(i), LY.oBench, BEN_W, BEN_H, 'slot', { side: 'o', slot: i });
    }
    // ---- opponent active
    if (G.o.active) this.drawCreature(ui, G.o.active, 28, LY.oActive, ACT_W, ACT_H, true, 'o', -1);
    ui.zone(28, LY.oActive, ACT_W, ACT_H, 'slot', { side: 'o', slot: -1 });
    this.drawSideInfo(ui, G.o, 146, LY.oActive + 8, true);

    // ---- centre band: turn state, or the pending play while it waits
    var bandY = LY.band;
    var bandStr, bandPlate;
    if (this.pending) { bandStr = this.pending.label || 'Confirm this play'; bandPlate = 'plateGold'; }
    else if (G.await === 'promote') { bandStr = 'Send out a bench beast'; bandPlate = 'plateGold'; }
    else if (G.over) { bandStr = 'Duel over'; bandPlate = 'plateDark'; }
    else if (G.who === 'p') { bandStr = 'Your turn'; bandPlate = 'plateAccent'; }
    else { bandStr = G.foe.n + ' is thinking'; bandPlate = 'plateDark'; }
    ui.panel(bandPlate, 86, bandY - 2, 198, 34, { alpha: 0.95 });
    ui.text('small', 185, bandY + 9, bandStr, { ox: 0.5, color: PAL.ink });
    ui.text('small', 18, bandY + 9, 'Turn ' + G.turn, { color: PAL.muted });
    ui.panel('plateDark', W - 74, bandY - 2, 58, 34, {});
    ui.text('small', W - 45, bandY + 9, 'Log', { ox: 0.5 });
    ui.zone(W - 74, bandY - 2, 58, 34, 'log', null);

    // ---- player active
    if (G.p.active) this.drawCreature(ui, G.p.active, 28, LY.pActive, ACT_W, ACT_H, true, 'p', -1);
    ui.zone(28, LY.pActive, ACT_W, ACT_H, 'slot', { side: 'p', slot: -1 });
    this.drawAttacks(ui, G);

    // ---- player bench
    for (i = 0; i < 3; i++) {
      var pb = G.p.bench[i];
      if (pb) this.drawCreature(ui, pb, benchX(i), LY.pBench, BEN_W, BEN_H, false, 'p', i);
      ui.zone(benchX(i), LY.pBench, BEN_W, BEN_H, 'slot', { side: 'p', slot: i });
    }
    this.drawSideInfo(ui, G.p, 12, LY.pBench + 2, false);

    // ---- legal target highlights
    this.drawHighlights(ui, G);

    // ---- action bar or confirm strip
    if (this.pending) this.drawConfirm(ui);
    else this.drawActionBar(ui, G);

    // ---- hand
    this.drawHand(ui, G);

    // ---- floats, ghosts, banners, coach, toast
    // UI law: exactly one transient element at a time.
    this.drawGhosts(ui);
    this.drawFloats(ui);
    if (this.banner) this.renderBanner(ui);
    else if (this.toast) this.renderToast(ui);
    else this.renderCoach(ui);

    // ---- drag card on top
    if (this.drag && this.drag.moved) {
      var id = G.p.hand[this.drag.hand];
      if (id !== undefined) {
        var key = ensureHand(this, id);
        ui.img(key, this.drag.x, this.drag.y - 26, HAND_W * 1.08, HAND_H * 1.08, { alpha: 0.96 });
      }
    }
    // ---- attack animation overlay
    if (this.anim) {
      var t = clamp(this.anim.t / 190, 0, 1);
      var yOff = -easeOut(t) * 26;
      ui.img('glow', 28 + ACT_W / 2, LY.pActive + ACT_H / 2 + yOff, 200, 200, { tint: 0xffd27a, alpha: 0.35 * (1 - t), blend: Phaser.BlendModes.ADD });
      if (this.anim.t > 190) {
        var k = clamp((this.anim.t - 190) / 260, 0, 1);
        ui.img('glow', 28 + ACT_W / 2, LY.oActive + ACT_H / 2, 240 * (0.5 + k), 240 * (0.5 + k), { tint: 0xff9a6a, alpha: 0.5 * (1 - k), blend: Phaser.BlendModes.ADD });
      }
    }
  };

  PlayScene.prototype.drawSideInfo = function (ui, S, x, y, foe) {
    ui.text('small', x, y, 'Deck ' + S.deck.length, { color: PAL.muted, size: '12px' });
    ui.text('small', x, y + 19, 'Hand ' + S.hand.length, { color: PAL.muted, size: '12px' });
    ui.text('small', x, y + 38, 'Disc ' + S.disc.length, { color: PAL.muted, size: '12px' });
    if (!foe) ui.text('small', x, y + 57, S.energyLeft > 0 ? 'Energy 1' : 'Energy 0', { color: S.energyLeft > 0 ? PAL.gold : PAL.dim, size: '12px' });
  };

  PlayScene.prototype.drawCreature = function (ui, cr, x, y, w, h, big, side, slot) {
    var key = big ? ensureDetail(this, cr.c) : miniKey(cr.c);
    var cardW = big ? w : w, cardH = big ? h : h;
    var lift = 0;
    if (this.anim && side === 'p' && slot < 0) lift = -easeOut(clamp(this.anim.t / 190, 0, 1)) * 22;
    var hurt = 0;
    if (this.anim && this.anim.t > 190 && side === 'o' && slot < 0) {
      var k = clamp((this.anim.t - 190) / 220, 0, 1);
      hurt = Math.sin(k * Math.PI * 5) * (1 - k) * 5;
    }
    var breathe = REDUCED ? 0 : Math.sin((this.time0 + cr.uid * 320) / 620) * (big ? 1.6 : 0.8);
    var img = ui.img(key, x + w / 2 + hurt, y + h / 2 + lift + breathe, cardW, cardH, {});
    if (cr.fzn) img.setTint(0x9fd0ff);

    // hp bar
    var hp = this.hpVis[cr.uid];
    if (hp === undefined) hp = E.curHp(cr);
    var frac = clamp(hp / E.maxHp(cr), 0, 1);
    var barW = w - 10, barH = big ? 7 : 5;
    var by = y + h - barH - 4 + lift;
    ui.img('px', x + 5, by, barW, barH, { tint: 0x0a1119, alpha: 0.85, ox: 0, oy: 0 });
    ui.img('px', x + 5, by, barW * frac, barH, {
      tint: frac > 0.5 ? 0x39d353 : (frac > 0.25 ? 0xe0b34a : 0xe2603a), ox: 0, oy: 0
    });
    // current over max, as a chip over the card's printed HP corner
    if (big) {
      ui.img('chipDark', x + 4, y + 4 + lift, 66, 22, { ox: 0, oy: 0 });
      ui.text('small', x + 37, y + 8 + lift, Math.round(hp) + '/' + E.maxHp(cr), { ox: 0.5, color: frac > 0.25 ? PAL.ink : PAL.bad });
    }

    // energy orbs, along the bottom edge above the health bar
    var el = C[cr.c].e;
    var orbS = big ? 15 : 9;
    for (var i = 0; i < cr.e.length && i < 6; i++) {
      ui.img('orb' + (cr.e[i] === el ? el : 4), x + 5 + i * (orbS + 1), by - orbS - 3, orbS, orbS, { ox: 0, oy: 0 });
    }
    // status pips
    if (cr.sh > 0) ui.img('orb1', x + w - 17, y + 6 + lift, 13, 13, { ox: 0, oy: 0, alpha: 0.9 });
    if (cr.fzn) {
      ui.img('chipDark', x + w - 54, by - 24, 50, 20, { ox: 0, oy: 0 });
      ui.text('small', x + w - 29, by - 21, 'BOUND', { ox: 0.5, color: '#8fd0f5', size: '11px' });
    }
  };

  PlayScene.prototype.drawAttacks = function (ui, G) {
    var x = 142, w = W - 142 - 16;
    var y = LY.pActive + 4;
    if (!G.p.active) {
      ui.text('muted', x, y + 40, G.await === 'promote' ? 'Choose a bench beast' : 'No active beast', {});
      return;
    }
    var atks = C[G.p.active.c].a;
    for (var i = 0; i < atks.length; i++) {
      var atk = atks[i];
      var can = E.canAttack(G, G.p, i);
      var dmg = E.damageOf(G, G.p, G.o, atk);
      var ry = y + i * 56;
      ui.panel(can ? 'plate' : 'plateDark', x, ry, w, 50, { alpha: can ? 1 : 0.75 });
      // cost pips
      for (var k = 0; k < atk.c; k++) {
        ui.img('orb' + (k < atk.m ? C[G.p.active.c].e : 4), x + 10 + k * 16, ry + 8, 14, 14, { ox: 0, oy: 0 });
      }
      ui.text('chip', x + 10, ry + 26, atk.n, { color: can ? PAL.ink : PAL.dim });
      ui.text('num', x + w - 10, ry + 10, String(dmg || atk.d), { ox: 1, color: can ? (dmg > atk.d ? PAL.gold : PAL.ink) : PAL.dim, size: '22px' });
      if (atk.x) ui.text('small', x + w - 10, ry + 32, effectLabel(atk.x), { ox: 1, color: PAL.muted });
      ui.zone(x, ry, w, 50, 'attack', i);
    }
    var infoY = y + atks.length * 56 + 2;
    ui.text('small', x, infoY, 'Retreat ' + E.retreatCost(G.p.active) + '   Weak ' + D.EL_SHORT[D.WEAK_TO[C[G.p.active.c].e]], { color: PAL.muted });
  };

  PlayScene.prototype.drawHighlights = function (ui, G) {
    if (!this.canAct()) {
      if (G.await === 'promote') {
        for (var q = 0; q < 3; q++) if (G.p.bench[q]) {
          ui.img('ring', benchX(q) + BEN_W / 2, LY.pBench + BEN_H / 2, BEN_W + 12, BEN_H + 12, { tint: 0x39d353, alpha: 0.8 });
        }
      }
      return;
    }
    var pulse = REDUCED ? 0.7 : 0.55 + Math.sin(this.time0 / 260) * 0.22;
    var sel = this.sel;
    var i;
    if (sel && sel.type === 'hand') {
      var legal = E.legalTargets(G, sel.index);
      if (legal.active) ui.img('ring', 28 + ACT_W / 2, LY.pActive + ACT_H / 2, ACT_W + 12, ACT_H + 12, { tint: 0x39d353, alpha: pulse });
      for (i = 0; i < legal.bench.length; i++) {
        ui.img('ring', benchX(legal.bench[i]) + BEN_W / 2, LY.pBench + BEN_H / 2, BEN_W + 12, BEN_H + 12, { tint: 0x39d353, alpha: pulse });
      }
      for (i = 0; i < legal.evolve.length; i++) {
        var s = legal.evolve[i];
        var pt = this.slotPoint('p', s);
        var ww = s < 0 ? ACT_W : BEN_W, hh = s < 0 ? ACT_H : BEN_H;
        ui.img('ring', pt.x, pt.y, ww + 12, hh + 12, { tint: 0xe0b34a, alpha: pulse });
      }
      if (legal.handler) ui.img('ring', 28 + ACT_W / 2, LY.pActive + ACT_H / 2, ACT_W + 12, ACT_H + 12, { tint: 0xe0b34a, alpha: pulse });
    } else if (sel && sel.type === 'energy') {
      if (G.p.active) ui.img('ring', 28 + ACT_W / 2, LY.pActive + ACT_H / 2, ACT_W + 12, ACT_H + 12, { tint: 0xe0b34a, alpha: pulse });
      for (i = 0; i < 3; i++) if (G.p.bench[i]) ui.img('ring', benchX(i) + BEN_W / 2, LY.pBench + BEN_H / 2, BEN_W + 12, BEN_H + 12, { tint: 0xe0b34a, alpha: pulse });
    } else if (sel && sel.type === 'retreat') {
      for (i = 0; i < 3; i++) if (G.p.bench[i]) ui.img('ring', benchX(i) + BEN_W / 2, LY.pBench + BEN_H / 2, BEN_W + 12, BEN_H + 12, { tint: 0x8fd0f5, alpha: pulse });
    } else if (this.drag && this.drag.moved) {
      var lg = E.legalTargets(G, this.drag.hand);
      if (lg.active) ui.img('ring', 28 + ACT_W / 2, LY.pActive + ACT_H / 2, ACT_W + 12, ACT_H + 12, { tint: 0x39d353, alpha: 0.85 });
      for (i = 0; i < lg.bench.length; i++) ui.img('ring', benchX(lg.bench[i]) + BEN_W / 2, LY.pBench + BEN_H / 2, BEN_W + 12, BEN_H + 12, { tint: 0x39d353, alpha: 0.85 });
      for (i = 0; i < lg.evolve.length; i++) {
        var s2 = lg.evolve[i];
        var p2 = this.slotPoint('p', s2);
        ui.img('ring', p2.x, p2.y, (s2 < 0 ? ACT_W : BEN_W) + 12, (s2 < 0 ? ACT_H : BEN_H) + 12, { tint: 0xe0b34a, alpha: 0.85 });
      }
    }
  };

  PlayScene.prototype.drawActionBar = function (ui, G) {
    var y = LY.bar, h = LY.barH;
    var labels = [
      { id: 'energyMode', label: 'Energy', on: G.p.energyLeft > 0, sel: this.sel && this.sel.type === 'energy' },
      { id: 'retreatMode', label: 'Retreat', on: !!(G.p.active && G.p.bench.some(function (b) { return !!b; })), sel: this.sel && this.sel.type === 'retreat' },
      { id: 'undo', label: 'Undo', on: E.canUndo(G), sel: false },
      { id: 'end', label: 'End turn', on: this.canAct(), sel: false }
    ];
    for (var i = 0; i < labels.length; i++) {
      var x = 10 + i * 94;
      var w = 88;
      var L = labels[i];
      ui.panel(L.sel ? 'plateGold' : (L.on ? 'plate' : 'plateDark'), x, y, w, h, { alpha: L.on ? 1 : 0.6 });
      ui.text('chip', x + w / 2, y + h / 2 - 8, L.label, { ox: 0.5, color: L.on ? PAL.ink : PAL.dim });
      ui.zone(x, y, w, h, L.id, null);
    }
  };

  PlayScene.prototype.drawConfirm = function (ui) {
    var y = LY.bar, h = LY.barH;
    ui.panel('plateAccent', 14, y, 214, h, {});
    ui.text('chip', 121, y + h / 2 - 8, 'Confirm', { ox: 0.5 });
    ui.zone(14, y, 214, h, 'confirm', null);
    ui.panel('plateDanger', 238, y, 138, h, {});
    ui.text('chip', 307, y + h / 2 - 8, 'Cancel', { ox: 0.5 });
    ui.zone(238, y, 138, h, 'cancel', null);
  };

  PlayScene.prototype.drawHand = function (ui, G) {
    var hand = G.p.hand;
    var n = hand.length;
    if (!n) {
      ui.text('muted', W / 2, LY.hand + 46, 'Hand empty', { ox: 0.5 });
      return;
    }
    var maxW = W - 24;
    var step = n > 1 ? Math.min(HAND_W + 6, (maxW - HAND_W) / (n - 1)) : 0;
    var total = HAND_W + step * (n - 1);
    var x0 = (W - total) / 2;
    for (var i = 0; i < n; i++) {
      var id = hand[i];
      var selHere = this.sel && this.sel.type === 'hand' && this.sel.index === i;
      var dragging = this.drag && this.drag.moved && this.drag.hand === i;
      var x = x0 + i * step;
      var y = LY.hand + 8 + (selHere ? -14 : 0);
      var ang = n > 1 ? (i - (n - 1) / 2) * 1.6 : 0;
      if (!dragging) {
        var key = ensureHand(this, id);
        ui.img(key, x + HAND_W / 2, y + HAND_H / 2, HAND_W, HAND_H, { angle: ang, alpha: 1 });
        if (selHere) ui.img('ring', x + HAND_W / 2, y + HAND_H / 2, HAND_W + 10, HAND_H + 10, { tint: 0xe0b34a, alpha: 0.9, angle: ang });
        var lt = E.legalTargets(G, i);
        var playable = lt.active || lt.bench.length || lt.evolve.length || lt.handler;
        if (!playable && this.canAct()) ui.img('px', x, y, HAND_W, HAND_H, { tint: 0x05080d, alpha: 0.42, ox: 0, oy: 0 });
      }
      ui.zone(x, y, Math.max(step, 34), HAND_H, 'hand', i);
    }
  };

  PlayScene.prototype.drawFloats = function (ui) {
    for (var i = 0; i < this.floats.length; i++) {
      var fl = this.floats[i];
      var t = fl.t / fl.life;
      var y = fl.y - easeOut(t) * 40;
      ui.text(fl.big ? 'num' : 'h3', fl.x, y, fl.str, { ox: 0.5, color: fl.color, alpha: 1 - t * t });
    }
  };
  PlayScene.prototype.drawGhosts = function (ui) {
    for (var i = 0; i < this.ghosts.length; i++) {
      var g = this.ghosts[i];
      var t = g.t / g.life;
      ui.img(miniKey(g.id), g.x, g.y + t * 40, g.w * (1 - t * 0.25), g.h * (1 - t * 0.25), {
        alpha: 1 - t, angle: t * 26
      });
    }
  };

  PlayScene.prototype.renderCoach = function (ui) {
    if (!this.coach) return;
    var t = this.coach.t;
    var a = t < 2600 ? 1 : clamp(1 - (t - 2600) / 900, 0.12, 1);
    if (a <= 0.13 && t > 4200) { this.coach = null; return; }
    ui.rect(0, LY.hudH + LY.hud + 2, W, 34, 0x0a1119, 0.82 * a);
    ui.text('small', W / 2, LY.hudH + LY.hud + 12, this.coach.str, { ox: 0.5, alpha: a, color: PAL.ink });
  };

  PlayScene.prototype.renderToast = function (ui) {
    if (!this.toast) return;
    var t = this.toast.t / this.toast.life;
    var a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    var y = this.screen === 'duel' ? LY.hudH + LY.hud + 4 : 88;
    ui.img('chipDark', W - 250, y, 236, 30, { ox: 0, oy: 0, alpha: a });
    ui.text('small', W - 132, y + 9, this.toast.str, { ox: 0.5, alpha: a });
  };

  PlayScene.prototype.renderBanner = function (ui) {
    if (!this.banner) return;
    var t = this.banner.t / this.banner.life;
    var grow = REDUCED ? 1 : easeBack(clamp(this.banner.t / 260, 0, 1));
    var a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    var w = W * 0.6 * grow, h = 62;
    ui.panel('plateDark', (W - w) / 2, LY.band - 90, w, h, { alpha: 0.94 * a });
    ui.text('h3', W / 2, LY.band - 90 + 20, this.banner.str, { ox: 0.5, alpha: a, color: this.banner.color });
  };

  // ------------------------------------------------------------- result
  PlayScene.prototype.renderResult = function (ui) {
    var r = this.result || { won: false, rewards: { packs: 0 }, foe: '', turns: 0, prizes: [0, 0] };
    ui.rect(0, 0, W, H, PAL.deep, 1);
    ui.img('glow', W / 2, 220, 520, 420, { tint: r.won ? 0x2c7f45 : 0x6b2f22, alpha: 0.5, blend: Phaser.BlendModes.ADD });
    ui.text('big', W / 2, 150, r.won ? 'Bind complete' : 'Bind broken', { ox: 0.5, color: r.won ? PAL.good : PAL.bad });
    ui.text('body', W / 2, 196, (r.won ? 'You beat ' : 'You lost to ') + r.foe, { ox: 0.5 });
    ui.panel('plateDark', 34, 236, W - 68, 128, {});
    ui.text('body', 56, 252, 'Prize markers  ' + r.prizes[0] + ' to ' + r.prizes[1], {});
    ui.text('body', 56, 278, 'Turns  ' + r.turns, {});
    ui.text('body', 56, 304, 'Record  ' + profile.wins + (profile.wins === 1 ? ' win, ' : ' wins, ') + profile.losses + (profile.losses === 1 ? ' loss' : ' losses'), {});
    ui.text('body', 56, 330, r.rewards.packs ? 'Earned ' + r.rewards.packs + ' card pack' + (r.rewards.packs > 1 ? 's' : '') : 'Next pack at ' + (D.WINS_PER_PACK - (profile.wins % D.WINS_PER_PACK)) + ' more win' + ((D.WINS_PER_PACK - (profile.wins % D.WINS_PER_PACK)) > 1 ? 's' : ''), { color: PAL.gold });

    var y = 396;
    var self = this;
    function btn(label, data, key) {
      ui.panel(key || 'plate', 34, y, W - 68, 56, {});
      ui.text('h3', W / 2, y + 18, label, { ox: 0.5 });
      ui.zone(34, y, W - 68, 56, 'result', data);
      y += 66;
      void self;
    }
    if (this.mode === 'draft') {
      if (this.draft && this.draft.complete) btn('Draft run complete', 'menu', 'plateAccent');
      else if (this.draft && !this.draft.done && r.won) btn('Next draft duel', 'draft', 'plateAccent');
      else btn('End draft run', 'draft');
    } else {
      if (r.won && this.rung < D.LADDER.length - 1) btn('Next rung', 'next', 'plateAccent');
      btn(r.won ? 'Rematch' : 'Try again', 'again');
    }
    btn('Main menu', 'menu');
    if (profile.packs > 0) {
      ui.panel('plateGold', 34, y, W - 68, 56, {});
      ui.text('h3', W / 2, y + 18, 'Open ' + profile.packs + ' pack' + (profile.packs > 1 ? 's' : ''), { ox: 0.5, color: PAL.gold });
      ui.zone(34, y, W - 68, 56, 'nav', 'packs');
    }
    this.renderToast(ui);
  };

  // --------------------------------------------------------- collection
  PlayScene.prototype.renderCollection = function (ui) {
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, 'Collection', 'menu');
    ui.text('small', 20, 68, collectionCount() + ' of ' + D.SET_SIZE + ' cards   Dust ' + profile.credits + '   Claim cost ' + D.CLAIM_COST, { color: PAL.gold });

    var cols = 5, cw = 70, ch = 96, top = 96;
    var rows = Math.ceil(D.SET_SIZE / cols);
    var viewH = H - top - 10;
    this.scrollMax = Math.max(0, rows * ch - viewH + 8);
    this.scrollY = clamp(this.scrollY, 0, this.scrollMax);
    for (var i = 0; i < D.SET_SIZE; i++) {
      var cx = 12 + (i % cols) * cw;
      var cy = top + Math.floor(i / cols) * ch - this.scrollY;
      if (cy < top - ch || cy > H) continue;
      var have = owned(i);
      ui.img(have ? miniKey(i) : 'back', cx + 30, cy + 42, MINI_W, MINI_H, { alpha: have ? 1 : 0.55 });
      if (have) {
        ui.img('chipDark', cx + 8, cy + 62, 44, 18, { ox: 0, oy: 0 });
        ui.text('small', cx + 30, cy + 63, 'x' + have, { ox: 0.5, size: '11px' });
        ui.zone(cx, cy, 62, ch - 4, 'card', i);
      } else if (profile.credits >= D.CLAIM_COST) {
        ui.img('chipGold', cx + 4, cy + 62, 52, 18, { ox: 0, oy: 0 });
        ui.text('small', cx + 30, cy + 63, 'Claim', { ox: 0.5, size: '11px', color: PAL.gold });
        ui.zone(cx, cy, 62, ch - 4, 'claim', i);
      } else {
        ui.zone(cx, cy, 62, ch - 4, 'card', i);
      }
    }
    this.renderToast(ui);
  };

  // ---------------------------------------------------------------- decks
  PlayScene.prototype.renderDeck = function (ui) {
    if (!this.deckEdit) this.deckEdit = deckOf(profile.deckIndex);
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, 'Decks', 'menu');
    var i, x;
    for (i = 0; i < DECK_SLOTS; i++) {
      x = 16 + i * 88;
      var on = profile.deckIndex === i;
      ui.panel(on ? 'plateAccent' : 'plateDark', x, 92, 82, 40, {});
      ui.text('chip', x + 41, 104, 'Slot ' + (i + 1), { ox: 0.5 });
      ui.zone(x, 92, 82, 40, 'deckSlot', i);
    }
    ui.panel('plate', 286, 92, 88, 40, {});
    ui.text('chip', 330, 104, 'Auto', { ox: 0.5 });
    ui.zone(286, 92, 88, 40, 'deckAuto', null);

    var issue = deckIssue(this.deckEdit);
    ui.text('small', 20, 142, this.deckEdit.length + '/' + DECK_SIZE + '   ' + (issue || 'Legal deck'), { color: issue ? PAL.bad : PAL.good });
    ui.panel(issue ? 'plateDark' : 'plateAccent', 262, 138, 112, 34, { alpha: issue ? 0.6 : 1 });
    ui.text('chip', 318, 147, 'Save deck', { ox: 0.5 });
    ui.zone(262, 138, 112, 34, 'deckSave', null);

    // current deck strip
    ui.text('small', 20, 182, 'Tap a card below to remove it', { color: PAL.muted });
    var dx = 14, dy = 202;
    for (i = 0; i < this.deckEdit.length; i++) {
      var px = dx + (i % 10) * 36, py = dy + Math.floor(i / 10) * 50;
      ui.img(miniKey(this.deckEdit[i]), px + 17, py + 24, 32, 45, {});
      ui.zone(px, py, 34, 48, 'deckRemove', i);
    }

    // filters
    var fy = 306;
    var filters = ['All', 'Ember', 'Tide', 'Thorn', 'Storm', 'Item'];
    if (this.deckFilter === undefined) this.deckFilter = 0;
    for (i = 0; i < filters.length; i++) {
      x = 12 + i * 62;
      ui.panel(this.deckFilter === i ? 'plateGold' : 'plateDark', x, fy, 58, 32, {});
      ui.text('small', x + 29, fy + 9, filters[i], { ox: 0.5, size: '12px' });
      ui.zone(x, fy, 58, 32, 'filter', i);
    }

    // owned pool
    var list = [];
    for (i = 0; i < D.SET_SIZE; i++) {
      if (owned(i) <= 0) continue;
      var c = C[i];
      if (this.deckFilter === 5 && c.t !== 'h') continue;
      if (this.deckFilter >= 1 && this.deckFilter <= 4 && (c.t !== 'c' || c.e !== this.deckFilter - 1)) continue;
      list.push(i);
    }
    var top = 348, cols = 5, cw = 74, ch = 96;
    var viewH = H - top - 8;
    this.scrollMax = Math.max(0, Math.ceil(list.length / cols) * ch - viewH + 8);
    this.scrollY = clamp(this.scrollY, 0, this.scrollMax);
    for (i = 0; i < list.length; i++) {
      var id = list[i];
      var gx = 10 + (i % cols) * cw;
      var gy = top + Math.floor(i / cols) * ch - this.scrollY;
      if (gy < top - ch || gy > H) continue;
      var inDeck = this.deckEdit.filter(function (v) { return v === id; }).length;
      var left = Math.min(MAX_COPIES, owned(id)) - inDeck;
      ui.img(miniKey(id), gx + 32, gy + 42, MINI_W, MINI_H, { alpha: left > 0 ? 1 : 0.45 });
      ui.img(left > 0 ? 'chipDark' : 'chipRed', gx + 10, gy + 62, 46, 18, { ox: 0, oy: 0 });
      ui.text('small', gx + 33, gy + 63, left + ' left', { ox: 0.5, size: '11px' });
      ui.zone(gx, gy, 66, ch - 6, 'deckAdd', id);
    }
    this.renderToast(ui);
  };

  // ---------------------------------------------------------------- packs
  PlayScene.prototype.renderPacks = function (ui) {
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, 'Card Packs', 'menu');
    ui.img('glow', W / 2, 250, 380, 380, { tint: 0x3f6ea0, alpha: 0.4, blend: Phaser.BlendModes.ADD });
    ui.img('back', W / 2, 240, MINI_W * 2.4, MINI_H * 2.4, {});
    ui.text('h2', W / 2, 350, profile.packs + ' pack' + (profile.packs === 1 ? '' : 's') + ' ready', { ox: 0.5 });
    ui.text('small', W / 2, 378, 'One pack every ' + D.WINS_PER_PACK + ' wins, plus one per first clear.', { ox: 0.5, size: '13px' });
    ui.text('small', W / 2, 398, 'Third copies become dust. ' + D.CLAIM_COST + ' dust claims any missing card.', { ox: 0.5, size: '13px' });

    ui.panel(profile.packs > 0 ? 'plateAccent' : 'plateDark', 40, 428, W - 80, 58, { alpha: profile.packs > 0 ? 1 : 0.6 });
    ui.text('h3', W / 2, 446, 'Open a pack', { ox: 0.5 });
    ui.zone(40, 428, W - 80, 58, 'openPack', null);

    this.oddsTable(ui, 504);
    ui.text('small', W / 2, H - 62, 'Dust ' + profile.credits + '   Collection ' + collectionCount() + '/' + D.SET_SIZE, { ox: 0.5, color: PAL.gold });
    this.renderToast(ui);
  };

  PlayScene.prototype.oddsTable = function (ui, y) {
    ui.panel('plateDark', 24, y, W - 48, 196, {});
    ui.text('h3', 42, y + 12, 'Posted pull rates', {});
    var slots = D.PACK_RATES.slots;
    var ry = y + 44;
    for (var i = 0; i < slots.length; i++) {
      ui.text('small', 42, ry, slots[i].label, { color: PAL.muted });
      var str = slots[i].rows.map(function (r) { return r[0] + ' ' + r[1] + '%'; }).join('   ');
      ui.text('body', 42, ry + 18, str, { color: PAL.ink, size: '13px' });
      ry += 44;
    }
    ui.text('small', 42, ry + 2, 'Per card slot. These never change.', { color: PAL.dim });
  };

  PlayScene.prototype.renderOdds = function (ui) {
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, 'Pull Odds', 'menu');
    this.oddsTable(ui, 104);
    ui.panel('plateDark', 24, 316, W - 48, 216, {});
    ui.text('h3', 42, 330, 'How the set fills in', {});
    var lines = [
      'Set size: ' + D.SET_SIZE + ' cards, ' + D.CREATURE_COUNT + ' beasts and ' + (D.SET_SIZE - D.CREATURE_COUNT) + ' handlers.',
      'Packs hold 5 cards. You keep at most ' + MAX_COPIES + ' copies of a card.',
      'A third copy becomes 1 dust instead of a card.',
      D.CLAIM_COST + ' dust claims any single missing card you choose.',
      'Packs come only from duel wins. Nothing is for sale.',
      'Draft runs award 2 extra packs for a 3 win run.'
    ];
    for (var i = 0; i < lines.length; i++) ui.text('small', 42, 364 + i * 26, lines[i], { color: PAL.ink, size: '12px' });
    this.renderToast(ui);
  };

  PlayScene.prototype.renderPackOpen = function (ui) {
    var p = this.pack;
    if (!p) { this.setScreen('packs'); return; }
    ui.rect(0, 0, W, H, PAL.deep, 1);
    var id = p.cards[p.index];
    var kind = p.kind[p.index];
    var rar = C[id].r;
    ui.img('glow', W / 2, 330, 520, 520, {
      tint: rar === 2 ? 0xe0b34a : (rar === 1 ? 0x63b7d8 : 0x5a6b7d), alpha: 0.45, blend: Phaser.BlendModes.ADD
    });
    ui.text('small', W / 2, 96, 'Card ' + (p.index + 1) + ' of ' + p.cards.length, { ox: 0.5 });
    var key = ensureDetail(this, id);
    ui.img(key, W / 2, 330, CARD_W * 1.5, CARD_H * 1.5, {});
    ui.text('h2', W / 2, 552, C[id].n, { ox: 0.5 });
    ui.text('body', W / 2, 584, D.RAR[rar] + (C[id].t === 'c' ? '  |  ' + D.EL[C[id].e] + '  |  Stage ' + C[id].s : '  |  Handler'), { ox: 0.5, color: D.RAR_COL[rar] });
    var label = kind === 'new' ? 'New card' : (kind === 'dust' ? 'Duplicate, +1 dust' : 'Second copy');
    ui.panel(kind === 'new' ? 'plateGold' : 'plateDark', W / 2 - 90, 612, 180, 34, {});
    ui.text('chip', W / 2, 621, label, { ox: 0.5, color: kind === 'new' ? PAL.gold : PAL.ink });

    ui.panel('plateAccent', 40, 668, W - 80, 58, {});
    ui.text('h3', W / 2, 686, p.index < p.cards.length - 1 ? 'Next card' : 'Done', { ox: 0.5 });
    ui.zone(40, 668, W - 80, 58, 'packNext', null);
    ui.text('small', W / 2, 744, 'Dust ' + profile.credits + '   Collection ' + collectionCount() + '/' + D.SET_SIZE, { ox: 0.5, color: PAL.muted });
  };

  // ---------------------------------------------------------------- draft
  PlayScene.prototype.renderDraft = function (ui) {
    var dr = this.draft;
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, 'Draft', 'menu');
    if (!dr) {
      ui.panel('plateDark', 24, 110, W - 48, 200, {});
      ui.text('h3', 44, 126, 'Ten picks, one deck', {});
      var lines = [
        'Pick 1 of 3 cards, ten times.',
        'Each pick adds ' + D.DRAFT_COPIES + ' copies, for a ' + DECK_SIZE + ' card deck.',
        'The first ' + D.DRAFT_BASIC_PICKS + ' picks are Stage 1 beasts only.',
        'Win ' + DRAFT_RUN_WINS + ' duels in a row for 2 packs.',
        'Your collection is not used or changed.'
      ];
      for (var q = 0; q < lines.length; q++) ui.text('small', 44, 160 + q * 26, lines[q], {});
      ui.panel('plateAccent', 40, 340, W - 80, 58, {});
      ui.text('h3', W / 2, 358, 'Start a run', { ox: 0.5 });
      ui.zone(40, 340, W - 80, 58, 'startDraft', null);
      ui.text('small', W / 2, 424, 'Best run: ' + profile.draftBest + ' wins   Runs played: ' + profile.draftRuns, { ox: 0.5, color: PAL.muted });
      this.renderToast(ui);
      return;
    }
    if (dr.choices) {
      ui.text('h3', 20, 96, 'Pick ' + (dr.pick + 1) + ' of ' + D.DRAFT_PICKS, {});
      ui.text('small', 20, 124, dr.pick < D.DRAFT_BASIC_PICKS ? 'Stage 1 beasts only for the first picks' : 'Anything goes now', { color: PAL.muted });
      for (var i = 0; i < dr.choices.length; i++) {
        var id = dr.choices[i];
        var x = 16 + i * 120;
        var key = ensureDetail(this, id);
        ui.img(key, x + 55, 250, 110, 154, {});
        ui.panel('plateDark', x, 336, 110, 46, {});
        ui.text('small', x + 55, 344, C[id].n, { ox: 0.5, size: '11px' });
        ui.text('small', x + 55, 362, C[id].t === 'c' ? D.EL[C[id].e] + ' S' + C[id].s : 'Handler', { ox: 0.5, size: '11px', color: PAL.muted });
        ui.zone(x, 170, 110, 212, 'draftPick', i);
      }
      ui.text('small', 20, 404, 'Deck so far: ' + dr.deck.length + ' cards', { color: PAL.gold });
      var dy = 428;
      for (i = 0; i < dr.deck.length; i++) {
        var px = 14 + (i % 10) * 36, py = dy + Math.floor(i / 10) * 50;
        ui.img(miniKey(dr.deck[i]), px + 17, py + 24, 32, 45, {});
      }
    } else {
      ui.text('h3', 20, 96, 'Run record: ' + dr.wins + ' of ' + DRAFT_RUN_WINS, {});
      ui.text('small', 20, 124, dr.complete ? 'Run complete. Two packs banked.' : (dr.done ? 'Run over.' : 'Next opponent: ' + D.LADDER[this.draftOpponent()].n), { color: PAL.muted });
      var dy2 = 156;
      for (i = 0; i < dr.deck.length; i++) {
        var qx = 14 + (i % 10) * 36, qy = dy2 + Math.floor(i / 10) * 50;
        ui.img(miniKey(dr.deck[i]), qx + 17, qy + 24, 32, 45, {});
      }
      var by = dy2 + 120;
      if (!dr.complete && !dr.done) {
        ui.panel('plateAccent', 40, by, W - 80, 58, {});
        ui.text('h3', W / 2, by + 18, 'Play duel ' + (dr.wins + 1), { ox: 0.5 });
        ui.zone(40, by, W - 80, 58, 'draftPlay', null);
        by += 68;
      }
      ui.panel('plateDark', 40, by, W - 80, 54, {});
      ui.text('h3', W / 2, by + 16, 'Leave draft', { ox: 0.5 });
      ui.zone(40, by, W - 80, 54, 'draftExit', null);
    }
    this.renderToast(ui);
  };

  // ------------------------------------------------------------------ log
  PlayScene.prototype.renderLog = function (ui) {
    ui.rect(0, 0, W, H, PAL.deep, 1);
    this.header(ui, 'Duel log', 'duel');
    var G = this.G;
    if (!G) return;
    var lines = G.log.slice(-24);
    for (var i = 0; i < lines.length; i++) {
      ui.text('small', 20, 104 + i * 24, lines[i], { color: i === lines.length - 1 ? PAL.ink : PAL.muted });
    }
  };

  // ---------------------------------------------------------- card detail
  PlayScene.prototype.renderCardDetail = function (ui, id) {
    ui.rect(0, 0, W, H, 0x05080d, 0.82);
    var key = ensureDetail(this, id);
    ui.img(key, W / 2, 330, CARD_W * 1.55, CARD_H * 1.55, {});
    var c = C[id];
    ui.text('h2', W / 2, 118, c.n, { ox: 0.5 });
    ui.text('small', W / 2, 150, c.t === 'c'
      ? D.EL[c.e] + '  |  ' + c.line + ' line  |  Stage ' + c.s + '  |  ' + D.RAR[c.r]
      : 'Handler  |  ' + D.RAR[c.r], { ox: 0.5, color: PAL.muted });
    if (c.t === 'c') {
      ui.text('small', W / 2, 606, 'Weak to ' + D.EL[D.WEAK_TO[c.e]] + ' (double damage)   Retreat ' + c.rt, { ox: 0.5, color: FCOL[D.WEAK_TO[c.e]] });
      var chain = D.chainOf(id);
      var names = chain.map(function (x) { return C[x].n; }).join('  >  ');
      ui.text('small', W / 2, 630, names, { ox: 0.5, color: PAL.muted });
    }
    ui.text('small', W / 2, 664, 'Owned: ' + owned(id) + ' of ' + MAX_COPIES, { ox: 0.5, color: PAL.gold });
    ui.panel('plate', 90, 692, W - 180, 52, {});
    ui.text('h3', W / 2, 708, 'Close', { ox: 0.5 });
    ui.zone(90, 692, W - 180, 52, 'closeCard', null);
    ui.zone(0, 0, W, 680, 'closeCard', null, false);
  };

  // ------------------------------------------------------------------ boot
  if (!Phaser || !kit || !D || !E) {
    if (root.__bb) root.__bb.state = bootState;
    return;
  }

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: PAL.deepCss,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 },
    fps: { target: 60, min: 30 },
    scene: [BootScene, PlayScene]
  });

  void Bake;
})(window);
