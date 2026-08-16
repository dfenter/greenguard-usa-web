/* Mythweave - turn based spirit summoning. Phaser 3 view over a fixed step
 * sim. GGKit owns lifecycle, pointer identity, guarded saves, audio buses,
 * loading, settings and the juice budget. All art is baked into canvas
 * textures at load; nothing is drawn with a per frame command list.
 */
(function () {
  'use strict';

  var D = window.MWDATA;
  var W = 390;
  var H = 844;
  var HIDPI_FACTOR = window.GGKit && window.GGKit.hiDpi ? window.GGKit.hiDpi.factor(W, H) : 1;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SAVE_VERSION = 1;
  var TAU = Math.PI * 2;
  var FONT = '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, sans-serif';
  var TOTAL_BATTLES = 24;

  var C = {
    ink: '#0a0710', ink2: '#07050c',
    panel: '#150e22', panel2: '#1d1430', panelLo: '#120c1c',
    line: '#3a2f52', line2: '#5a3f8c',
    text: '#f0e6ff', dim: '#9d8fb8', faint: '#6d5f88',
    violet: '#c9a9ff', amber: '#ffd36b', ember: '#ff9a45',
    mint: '#7fe6a0', rose: '#ff6b9d', ice: '#9fd4ff', red: '#ff6b6b'
  };

  /* --------------------------------------------------------------- layout
   * One table, portrait 390x844, thumb zone left clear below y 780.
   */
  var L = {
    hudChip: { x: 12, y: 4, w: 206, h: 34 },
    turnChip: { x: 226, y: 4, w: 88, h: 34 },
    pauseBtn: { x: 326, y: 2, w: 52, h: 48 },
    strip: { x: 12, y: 52, w: 366, h: 34 },
    field: { y: 56, h: 240, spriteY: 158, intentY: 60, nameY: 228, hpY: 240, brkY: 258, statY: 276 },
    rail: { y: 302, h: 72, xs: [12, 136, 260], w: 118 },
    band: { x: 12, y: 380, w: 366, h: 60 },
    preview: { x: 12, y: 448, w: 366, h: 34 },
    hand: { y: 488, w: 68, h: 158, gap: 9, x0: 7, lift: 12 },
    resolve: { x: 70, y: 664, w: 250, h: 62 },
    foot: { y: 742, h: 26 },
    menuTitle: 92, menuSub: 122,
    row: { x: 16, w: 358, h: 76, y0: 168, gap: 86 },
    back: { x: 10, y: 4, w: 76, h: 46 },
    btnRow: 700, btnH: 62
  };

  function rowRect(i) { return { x: L.row.x, y: L.row.y0 + i * L.row.gap, w: L.row.w, h: L.row.h }; }
  function footRect(i, n) {
    if (n <= 1) return { x: 70, y: L.btnRow, w: 250, h: L.btnH };
    if (n === 2) return { x: i === 0 ? 16 : 200, y: L.btnRow, w: 174, h: L.btnH };
    return { x: 16 + i * 122, y: L.btnRow, w: 114, h: L.btnH };
  }
  function handRect(i) {
    return { x: L.hand.x0 + i * (L.hand.w + L.hand.gap), y: L.hand.y, w: L.hand.w, h: L.hand.h };
  }
  /* foe slot geometry depends only on the foe count, so the sim and the view
   * read the same table instead of storing render state on a foe. */
  function foeRect(count, i) {
    var w = count === 1 ? 200 : (count === 2 ? 168 : 118);
    var gap = count === 1 ? 0 : (count === 2 ? 18 : 10);
    var total = count * w + (count - 1) * gap;
    return { x: (W - total) / 2 + i * (w + gap), y: L.field.y, w: w, h: L.field.h };
  }

  /* -------------------------------------------------------------- helpers */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function safeInt(v, fb, lo, hi) {
    return typeof v === 'number' && isFinite(v) ? clamp(Math.floor(v), lo, hi) : fb;
  }
  function spiritOf(id) { return D.SPIRITS[id] || D.SPIRITS.weaver; }
  function foeDataOf(id) { return D.FOES[id] || D.FOES.mote; }
  function realmOf(id) { return D.REALMS[id] || D.REALMS.lantern; }
  function chapterOf(i) { return D.CHAPTERS[clamp(i | 0, 0, D.CHAPTERS.length - 1)]; }
  function elemOf(id) { return D.ELEMENTS[id] || D.ELEMENTS.loom; }
  function classOf(id) { return D.CLASSES[id] || D.CLASSES.rite; }
  function trialOf(id) {
    for (var i = 0; i < D.TRIALS.length; i++) if (D.TRIALS[i].id === id) return D.TRIALS[i];
    return D.TRIALS[0];
  }
  function battleAt(c, b) {
    var ch = chapterOf(c);
    return ch.battles[clamp(b | 0, 0, ch.battles.length - 1)];
  }
  function battleKey(c, b) { return c + '-' + b; }
  function isKnownSpirit(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(D.SPIRITS, id);
  }
  function titleCase(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  /* deterministic stream so trials replay identically from their seed */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ------------------------------------------------------- progression math */
  function xpForLevel(l) { return 45 + (l - 1) * 30; }
  function cardScale(lv, asc) {
    return D.ASC_MUL[clamp(asc | 0, 0, 3)] * (1 + 0.028 * (clamp(lv | 0, 1, D.MAX_LEVEL) - 1));
  }
  function scaleCard(card, lv, asc) {
    var m = cardScale(lv, asc);
    var out = { n: card.n, k: card.k || 'strike', tag: card.tag, ig: card.ig, wa: card.wa,
      sd: card.sd, hits: card.hits || 1 };
    ['d', 'ad', 'b', 'h', 'bu', 'p', 'dr', 'chain'].forEach(function (k) {
      if (card[k]) out[k] = Math.round(card[k] * m);
    });
    if (card.w) out.w = card.w + (asc >= 2 ? 1 : 0);
    return out;
  }
  function matchup(atkElem, atkCls, defElem, defCls) {
    var e = 1, c = 1;
    if (elemOf(atkElem).beats === defElem) e = 1.35;
    else if (elemOf(defElem).beats === atkElem) e = 0.75;
    if (classOf(atkCls).beats === defCls) c = 1.25;
    else if (classOf(defCls).beats === atkCls) c = 0.8;
    return { elem: e, cls: c, total: e * c };
  }

  /* ------------------------------------------------------------ save state */
  function freshSave() {
    return {
      v: SAVE_VERSION, ch: 0, cleared: {}, roster: ['vulmar'], party: ['vulmar'],
      lv: { vulmar: 1 }, xp: { vulmar: 0 }, asc: { vulmar: 0 }, tokens: 0,
      trials: {}, tut: 0, best: 0, freeWins: 0, seenStory: {}
    };
  }
  function validateSave(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.v !== SAVE_VERSION) return false;
    if (!Array.isArray(o.roster) || !Array.isArray(o.party)) return false;
    if (o.cleared && (typeof o.cleared !== 'object' || Array.isArray(o.cleared))) return false;
    return true;
  }
  function sanitize(raw) {
    var s = freshSave();
    if (!validateSave(raw)) return s;
    s.ch = safeInt(raw.ch, 0, 0, D.CHAPTERS.length - 1);
    s.best = safeInt(raw.best, 0, 0, 99999);
    s.tokens = safeInt(raw.tokens, 0, 0, 99);
    s.tut = safeInt(raw.tut, 0, 0, 9);
    s.freeWins = safeInt(raw.freeWins, 0, 0, 9999);
    var roster = raw.roster.slice(0, 12).filter(isKnownSpirit);
    if (roster.indexOf('vulmar') < 0) roster.unshift('vulmar');
    s.roster = roster;
    s.party = raw.party.slice(0, 3).filter(function (x) {
      return isKnownSpirit(x) && s.roster.indexOf(x) >= 0;
    });
    if (!s.party.length) s.party = s.roster.slice(0, 3);
    s.lv = {}; s.xp = {}; s.asc = {};
    s.roster.forEach(function (id) {
      s.lv[id] = safeInt(raw.lv && raw.lv[id], 1, 1, D.MAX_LEVEL);
      s.xp[id] = safeInt(raw.xp && raw.xp[id], 0, 0, 999999);
      s.asc[id] = safeInt(raw.asc && raw.asc[id], 0, 0, 3);
    });
    s.cleared = {};
    if (raw.cleared) {
      for (var c = 0; c < D.CHAPTERS.length; c++) {
        for (var b = 0; b < D.CHAPTERS[c].battles.length; b++) {
          var k = battleKey(c, b);
          if (raw.cleared[k]) s.cleared[k] = safeInt(raw.cleared[k], 1, 1, 3);
        }
      }
    }
    s.trials = {};
    if (raw.trials && typeof raw.trials === 'object') {
      D.TRIALS.forEach(function (t) {
        var v = raw.trials[t.id];
        if (v) s.trials[t.id] = safeInt(v, 99, 1, 9999);
      });
    }
    s.seenStory = {};
    if (raw.seenStory && typeof raw.seenStory === 'object') {
      Object.keys(raw.seenStory).slice(0, 60).forEach(function (k) {
        if (raw.seenStory[k] === true) s.seenStory[String(k).slice(0, 12)] = true;
      });
    }
    return s;
  }

  var save = freshSave();
  var app = { scene: null, ready: false };
  var mode = 'title';
  var B = null;               /* live battle */
  var story = null;           /* {pages, i, then} */
  var result = null;
  var pending = null;         /* what a result screen continues into */
  var partyDraft = [];
  var inspectId = 'vulmar';
  var chapterView = 0;
  var listFocus = 0;
  var bootMode = null;
  var bootStage = null;

  /* ------------------------------------------------------ verification hook
   * Created before Phaser boots and never replaced, so a harness can install
   * switches without racing scene creation. The boot fallback and the live
   * scene both read the same variables.
   */
  var hook = {
    mode: 'title', stage: 0, stageName: '', chapter: 0, progress: 0,
    score: 0, health: 1, hp: 0, maxHp: 0, turn: 0, phase: '',
    roster: 0, tokens: 0, cleared: 0, total: TOTAL_BATTLES, ready: false
  };
  window.__mw = {
    state: hook,
    forceMode: function (m) {
      bootMode = String(m || 'title');
      if (app.scene && app.scene.applyForce) app.scene.applyForce();
    },
    forceStage: function (n) {
      bootStage = clamp(Math.floor(Number(n) || 0), 0, TOTAL_BATTLES - 1);
      if (app.scene && app.scene.applyForce) app.scene.applyForce();
    }
  };

  var kit = GGKit.create({
    slug: 'mythweave',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () { if (app.scene) app.scene.dimmed = true; },
    onResume: function () { if (app.scene) app.scene.dimmed = false; },
    onRestart: function () { resetEdges(); }
  });
  kit.audio.register({
    lantern: 'assets/lantern.mp3', shrine: 'assets/shrine.mp3',
    steppe: 'assets/steppe.mp3', loom: 'assets/loom.mp3',
    ui: 'assets/ui.mp3', pick: 'assets/pick.mp3', unpick: 'assets/unpick.mp3',
    strike: 'assets/strike.mp3', guard: 'assets/guard.mp3', arcana: 'assets/arcana.mp3',
    weave: 'assets/weave.mp3', heal: 'assets/heal.mp3', hurt: 'assets/hurt.mp3',
    brk: 'assets/break.mp3', unravel: 'assets/unravel.mp3', bind: 'assets/bind.mp3',
    victory: 'assets/victory.mp3', defeat: 'assets/defeat.mp3', star: 'assets/star.mp3',
    intent: 'assets/intent.mp3'
  });
  var MUSIC_KEYS = ['lantern', 'shrine', 'steppe', 'loom'];
  var SFX_KEYS = ['ui', 'pick', 'unpick', 'strike', 'guard', 'arcana', 'weave', 'heal',
    'hurt', 'brk', 'unravel', 'bind', 'victory', 'defeat', 'star', 'intent'];
  var musicUnlocked = false;
  var wantMusic = 'lantern';
  function sfx(name, opts) { if (app.ready) kit.audio.sfx(name, opts); }
  function music(name) {
    wantMusic = MUSIC_KEYS.indexOf(name) >= 0 ? name : 'lantern';
    if (musicUnlocked) kit.audio.music(wantMusic, 700);
  }
  function unlockMusic() {
    if (musicUnlocked) return;
    musicUnlocked = true;
    kit.audio.music(wantMusic, 500);
  }

  var keyQueue = [];
  var KEY_SWALLOW = ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', function (e) {
    if (KEY_SWALLOW.indexOf(e.code) >= 0) e.preventDefault();
    if (kit.paused || e.repeat) return;
    if (keyQueue.length < 12) keyQueue.push(e.code);
  }, { passive: false });

  function persist() { kit.save.set(save); }
  function loadSave() { save = sanitize(kit.save.get(null)); }

  /* --------------------------------------------------------- progression */
  function stars(c, b) { return save.cleared[battleKey(c, b)] || 0; }
  function isCleared(c, b) { return stars(c, b) > 0; }
  function chapterStars(c) {
    var n = 0, ch = chapterOf(c);
    for (var i = 0; i < ch.battles.length; i++) n += stars(c, i);
    return n;
  }
  function chapterMaxStars(c) { return chapterOf(c).battles.length * 3; }
  function chapterCleared(c) {
    var ch = chapterOf(c);
    for (var i = 0; i < ch.battles.length; i++) {
      if (ch.battles[i].kind !== 'bond' && !isCleared(c, i)) return false;
    }
    return true;
  }
  function chapterUnlocked(c) { return c === 0 || c <= save.ch; }
  function battleUnlocked(c, b) {
    if (!chapterUnlocked(c)) return false;
    if (b === 0) return true;
    var ch = chapterOf(c);
    /* a bond fight opens as soon as the battle before it is cleared; story
     * battles never require the optional bond fight */
    for (var i = b - 1; i >= 0; i--) {
      if (ch.battles[i].kind === 'bond') continue;
      return isCleared(c, i);
    }
    return true;
  }
  function clearedCount() {
    var n = 0;
    for (var c = 0; c < D.CHAPTERS.length; c++) {
      for (var b = 0; b < D.CHAPTERS[c].battles.length; b++) if (isCleared(c, b)) n++;
    }
    return n;
  }
  function globalIndex(c, b) {
    var n = 0;
    for (var i = 0; i < c; i++) n += D.CHAPTERS[i].battles.length;
    return n + b;
  }
  function stageToChapterBattle(n) {
    var left = clamp(n | 0, 0, TOTAL_BATTLES - 1);
    for (var c = 0; c < D.CHAPTERS.length; c++) {
      var len = D.CHAPTERS[c].battles.length;
      if (left < len) return { c: c, b: left };
      left -= len;
    }
    return { c: 0, b: 0 };
  }
  function trialUnlocked(t) { return chapterCleared(t.chapter); }
  function partyLevel() {
    var ids = save.party.length ? save.party : save.roster;
    var sum = 0;
    ids.forEach(function (id) { sum += save.lv[id] || 1; });
    return Math.max(1, Math.round(sum / Math.max(1, ids.length)));
  }
  function grantXp(amount) {
    var gained = [];
    var ids = save.party.slice();
    if (ids.indexOf('vulmar') < 0 && !ids.length) ids.push('vulmar');
    ids.forEach(function (id) {
      if (!isKnownSpirit(id)) return;
      var lv = save.lv[id] || 1;
      var xp = (save.xp[id] || 0) + amount;
      var ups = 0;
      while (lv < D.MAX_LEVEL && xp >= xpForLevel(lv)) { xp -= xpForLevel(lv); lv++; ups++; }
      if (lv >= D.MAX_LEVEL) xp = Math.min(xp, xpForLevel(D.MAX_LEVEL) - 1);
      save.lv[id] = lv; save.xp[id] = xp;
      if (ups) gained.push(spiritOf(id).short + ' Lv' + lv);
    });
    return gained;
  }
  function ascendCost(asc) { return 1 + asc; }
  function ascendLevelGate(asc) { return 4 + asc * 4; }
  function canAscend(id) {
    if (!isKnownSpirit(id) || save.roster.indexOf(id) < 0) return false;
    var asc = save.asc[id] || 0;
    if (asc >= 3) return false;
    return save.tokens >= ascendCost(asc) && (save.lv[id] || 1) >= ascendLevelGate(asc);
  }
  function bindSpirit(id) {
    if (!isKnownSpirit(id) || save.roster.indexOf(id) >= 0) return false;
    save.roster.push(id);
    save.lv[id] = Math.max(1, partyLevel() - 1);
    save.xp[id] = 0;
    save.asc[id] = 0;
    if (save.party.length < 3) save.party.push(id);
    return true;
  }
  function deepenBond(id) {
    if (!isKnownSpirit(id)) return null;
    var asc = save.asc[id] || 0;
    if (asc >= 3) return spiritOf(id).short + ' is already Ascendant.';
    save.asc[id] = asc + 1;
    return spiritOf(id).short + ' is now ' + D.ASC_NAME[asc + 1];
  }

  /* ------------------------------------------------------------------ vfx
   * A facade the sim calls. It never touches sim data and it is safe before
   * the scene exists, so sim code stays free of render state.
   */
  var vfx = {
    burst: function (x, y, n, col, kind) { if (app.scene) app.scene.burst(x, y, n, col, kind); },
    float: function (x, y, text, col) { if (app.scene) app.scene.floatText(x, y, text, col); },
    shake: function (mag, ms) { kit.juice.shake(mag, ms); },
    stop: function (ms) { kit.juice.hitStop(ms); },
    flash: function (col, a) { if (app.scene) app.scene.flash(col, a); },
    hitFoe: function (i, mag) { if (app.scene) app.scene.foeHit(i, mag); },
    foeAnim: function (i, kind) { if (app.scene) app.scene.foeAnim(i, kind); },
    weaver: function (kind) { if (app.scene) app.scene.weaverAnim(kind); },
    chip: function (text, col) { if (app.scene) app.scene.queueTransient(text, 1.0, col, 'event'); },
    coach: function (text) { if (app.scene) app.scene.queueTransient(text, 3.2, C.text, 'coach'); }
  };

  function foeCenter(i) {
    var r = foeRect(B ? B.foes.length : 1, i);
    return { x: r.x + r.w / 2, y: r.y + L.field.spriteY - L.field.y };
  }
  var PLAYER_FX = { x: 44, y: 410 };

  /* ------------------------------------------------------------- the battle */
  function buildDeck(bt) {
    var deck = [];
    var sources = ['weaver'].concat(bt.party);
    for (var i = 0; i < sources.length; i++) {
      var id = sources[i];
      var sp = spiritOf(id);
      var lv = id === 'weaver' ? 1 : (save.lv[id] || 1);
      var asc = id === 'weaver' ? 0 : (save.asc[id] || 0);
      for (var c = 0; c < sp.cards.length; c++) {
        for (var k = 0; k < 2; k++) {
          var card = scaleCard(sp.cards[c], lv, asc);
          card.s = id;
          card.lv = lv;
          card.asc = asc;
          card.elem = sp.elem;
          card.cls = sp.cls;
          deck.push(card);
        }
      }
    }
    return shuffle(deck, bt.rng);
  }

  function spawnFoe(id, scale, slot) {
    var fd = foeDataOf(id);
    var hp = Math.max(6, Math.round(fd.hp * scale));
    var brk = Math.max(8, Math.round(hp * 0.45));
    return {
      id: id, data: fd, name: fd.name, elem: fd.elem, cls: fd.cls,
      hp: hp, maxhp: hp, block: 0, weak: 0, burn: 0, atk: 0,
      brk: brk, brkMax: brk, stagger: 0, mi: slot % Math.max(1, fd.moves.length),
      scale: scale, dead: false
    };
  }

  function makeBattle(opts) {
    var realm = realmOf(opts.realm);
    var party = (opts.party || save.party).filter(isKnownSpirit).slice(0, 3);
    if (!party.length) party = save.roster.slice(0, 3);
    var chIdx = clamp(opts.ch | 0, 0, D.CHAPTERS.length - 1);
    var maxhp = 62 + chIdx * 10;
    var bt = {
      kind: opts.kind || 'story', ch: chIdx, bi: opts.bi | 0,
      name: opts.name || 'Battle', realm: realm.id, rule: opts.rule || null,
      trialId: opts.trialId || null, seed: opts.seed || 0,
      party: party, maxhp: maxhp, hp: maxhp,
      block: 0, power: 0, frail: 0,
      deck: [], pile: [], hand: [], sel: [],
      foes: [], target: 0, turn: 1, phase: 'pick',
      resolved: 0, chainBonus: 0, gauge: {},
      queue: [], qt: 0, fast: false, ended: 0,
      waves: opts.waves || null, wave: 0, scale: opts.scale || 1,
      log: [], handSize: opts.rule === 'hand4' ? 4 : 5,
      totalFoeHp: 0, damageDone: 0, weaves: 0
    };
    bt.rng = makeRng(opts.seed || ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
    party.forEach(function (id) { bt.gauge[id] = 0; });
    bt.deck = buildDeck(bt);
    var roster = bt.waves ? bt.waves[0] : (opts.foes || ['mote']);
    spawnWave(bt, roster);
    bt.log.push('The weave tightens.');
    drawHand(bt);
    return bt;
  }

  function spawnWave(bt, ids) {
    bt.foes.length = 0;
    for (var i = 0; i < ids.length && i < 3; i++) {
      var f = spawnFoe(ids[i], bt.scale, i);
      bt.foes.push(f);
      bt.totalFoeHp += f.maxhp;
    }
    bt.target = 0;
  }

  function drawHand(bt) {
    bt.hand.length = 0;
    bt.sel.length = 0;
    for (var i = 0; i < bt.handSize; i++) {
      if (!bt.deck.length) { bt.deck = shuffle(bt.pile, bt.rng); bt.pile = []; }
      if (!bt.deck.length) break;
      bt.hand.push(bt.deck.pop());
    }
    if (bt.pile.length > 90) bt.pile.length = 90;
  }
  function peekNext(bt) {
    if (bt.deck.length) return bt.deck[bt.deck.length - 1];
    if (bt.pile.length) return null;
    return null;
  }
  function logAdd(bt, s) {
    bt.log.push(s);
    while (bt.log.length > 3) bt.log.shift();
  }
  function aliveFoes(bt) {
    return bt.foes.filter(function (f) { return !f.dead; });
  }
  function fixTarget(bt) {
    if (!bt.foes[bt.target] || bt.foes[bt.target].dead) {
      for (var i = 0; i < bt.foes.length; i++) {
        if (!bt.foes[i].dead) { bt.target = i; return; }
      }
    }
  }

  /* every damage number is a pure function of visible state: no hidden roll */
  function damageAgainst(bt, card, foe, chainSlot) {
    var base = (card.d || 0) + bt.power + (card.chain ? card.chain * chainSlot : 0);
    if (!base) return 0;
    var m = matchup(card.elem, card.cls, foe.elem, foe.cls);
    var v = base * m.total * (foe.stagger > 0 ? 1.5 : 1);
    return Math.max(1, Math.round(v));
  }
  function splashAgainst(bt, card, foe) {
    var base = (card.ad || 0) + bt.power;
    if (!base) return 0;
    var m = matchup(card.elem, card.cls, foe.elem, foe.cls);
    return Math.max(1, Math.round(base * m.total * (foe.stagger > 0 ? 1.5 : 1)));
  }

  /* chain bonus, shown to the player while the chain is built */
  function chainBonusFor(n) { return n <= 0 ? 0 : (n === 1 ? 0 : (n === 2 ? 2 : 4)); }

  function previewChain(bt) {
    /* dry run: what the current selection does to the current target */
    var target = bt.foes[bt.target];
    var out = { dmg: 0, splash: 0, block: 0, heal: 0, power: 0, bonus: 0, weave: null, mult: 1 };
    if (!target || !bt.sel.length) return out;
    var power = bt.power;
    var sameId = null, same = bt.sel.length === 3;
    for (var i = 0; i < bt.sel.length; i++) {
      var card = bt.hand[bt.sel[i]];
      if (!card) continue;
      if (sameId === null) sameId = card.s;
      else if (sameId !== card.s) same = false;
      var bonus = chainBonusFor(i + 1);
      out.bonus += bonus;
      var m = matchup(card.elem, card.cls, target.elem, target.cls);
      out.mult = m.total;
      if (card.d) {
        var base = card.d + power + bonus + (card.chain ? card.chain * i : 0);
        out.dmg += Math.max(1, Math.round(base * m.total * (target.stagger > 0 ? 1.5 : 1))) * (card.hits || 1);
      }
      if (card.dr) {
        var dr = Math.max(1, Math.round((card.dr + power + bonus) * m.total));
        out.dmg += dr; out.heal += dr;
      }
      if (card.ad) out.splash += Math.max(1, Math.round((card.ad + power + bonus) * m.total));
      if (card.b) out.block += card.b;
      if (card.h) out.heal += card.h;
      if (card.p) { out.power += card.p; power += card.p; }
    }
    if (same && sameId) out.weave = sameId;
    return out;
  }

  function hurtFoe(bt, f, amount, pierce) {
    if (f.dead || amount <= 0) return 0;
    var idx = bt.foes.indexOf(f);
    var pos = foeCenter(idx);
    var dealt = amount;
    if (!pierce && f.block > 0) {
      var absorbed = Math.min(f.block, dealt);
      f.block -= absorbed;
      dealt -= absorbed;
      if (absorbed > 0) vfx.float(pos.x - 18, pos.y - 34, '-' + absorbed, C.ice);
    }
    if (dealt > 0) {
      f.hp -= dealt;
      bt.damageDone += dealt;
      vfx.float(pos.x, pos.y - 20, '-' + dealt, C.amber);
      vfx.burst(pos.x, pos.y, 9, f.data.col, 'hit');
      vfx.hitFoe(idx, 6);
      vfx.shake(5, 130);
      vfx.stop(45);
      sfx('strike');
      if (f.stagger <= 0) {
        f.brk -= dealt;
        if (f.brk <= 0) {
          f.brk = f.brkMax;
          f.stagger = 1;
          vfx.burst(pos.x, pos.y, 22, '#ffffff', 'shatter');
          vfx.float(pos.x, pos.y - 54, 'BREAK', '#ffffff');
          vfx.shake(9, 200);
          sfx('brk');
          logAdd(bt, f.name + ' is staggered.');
        }
      }
    }
    if (f.hp <= 0) {
      f.hp = 0;
      f.dead = true;
      vfx.burst(pos.x, pos.y, 30, '#ffffff', 'shatter');
      vfx.shake(10, 240);
      vfx.flash('#ffffff', 0.18);
      vfx.foeAnim(idx, 'die');
      sfx('unravel');
      logAdd(bt, f.name + ' unravels.');
    }
    return dealt;
  }

  function healPlayer(bt, v) {
    if (v <= 0) return;
    if (bt.rule === 'noheal') v = Math.max(1, Math.round(v / 2));
    bt.hp = Math.min(bt.maxhp, bt.hp + v);
    vfx.float(PLAYER_FX.x + 40, PLAYER_FX.y - 16, '+' + v, C.mint);
    vfx.burst(PLAYER_FX.x + 20, PLAYER_FX.y, 12, C.mint, 'bloom');
    sfx('heal');
  }
  function gainBlock(bt, v) {
    if (v <= 0) return;
    if (bt.rule === 'noblock') v = Math.max(1, Math.round(v / 2));
    bt.block += v;
    vfx.float(PLAYER_FX.x + 40, PLAYER_FX.y + 4, '+' + v, C.ice);
    vfx.burst(PLAYER_FX.x + 20, PLAYER_FX.y, 8, C.ice, 'bloom');
    sfx('guard');
  }
  function addGauge(bt, id, amount) {
    if (bt.gauge[id] === undefined) return;
    if (bt.rule === 'gaugehalf') amount = Math.round(amount / 2);
    bt.gauge[id] = clamp(bt.gauge[id] + amount, 0, 100);
  }

  function applyCard(bt, card, chainSlot, isWeave) {
    var target = bt.foes[bt.target];
    if (!target || target.dead) { fixTarget(bt); target = bt.foes[bt.target]; }
    var bonus = isWeave ? 0 : chainBonusFor(chainSlot + 1);
    var alive = aliveFoes(bt);
    var i;
    if (card.b) gainBlock(bt, card.b + bonus);
    if (card.p) {
      bt.power += card.p;
      vfx.float(PLAYER_FX.x + 96, PLAYER_FX.y + 4, '+' + card.p, '#ffb0e0');
    }
    if (card.h) healPlayer(bt, card.h);
    if (card.sd) {
      bt.hp = Math.max(1, bt.hp - card.sd);
      vfx.float(PLAYER_FX.x, PLAYER_FX.y - 16, '-' + card.sd, C.red);
    }
    if (card.d && target) {
      var hits = card.hits || 1;
      var each = damageAgainst(bt, { d: card.d + bonus, chain: card.chain, elem: card.elem, cls: card.cls },
        target, chainSlot);
      for (i = 0; i < hits; i++) hurtFoe(bt, target, each, card.ig);
    }
    if (card.dr && target) {
      var drained = hurtFoe(bt, target,
        damageAgainst(bt, { d: card.dr + bonus, elem: card.elem, cls: card.cls }, target, 0), false);
      healPlayer(bt, drained);
    }
    if (card.ad) {
      for (i = 0; i < alive.length; i++) {
        hurtFoe(bt, alive[i], splashAgainst(bt, { ad: card.ad + bonus, elem: card.elem, cls: card.cls },
          alive[i]), card.ig);
      }
    }
    if (card.bu) {
      if (isWeave || card.wa) {
        for (i = 0; i < alive.length; i++) alive[i].burn += card.bu;
      } else if (target) target.burn += card.bu;
    }
    if (card.w && target) {
      target.weak += card.w;
      var tp = foeCenter(bt.foes.indexOf(target));
      vfx.float(tp.x, tp.y + 30, 'WEAK', C.violet);
    }
    if (card.wa) for (i = 0; i < alive.length; i++) alive[i].weak += 1;
    bt.resolved++;
  }

  function checkEnd(bt) {
    if (aliveFoes(bt).length === 0) {
      if (bt.waves && bt.wave < bt.waves.length - 1) return null;
      bt.phase = 'won';
      return 'won';
    }
    if (bt.hp <= 0) { bt.hp = 0; bt.phase = 'lost'; return 'lost'; }
    return null;
  }

  function intentOf(bt, f) {
    if (f.stagger > 0) return { s: 'STAGGERED', c: '#ffffff', icon: 'stagger', v: 0 };
    var mv = f.data.moves[f.mi % f.data.moves.length];
    var mul = f.weak > 0 ? 0.6 : 1;
    var scaled = Math.round(mv.v * f.scale);
    if (mv.t === 'grd') return { s: String(scaled), c: C.ice, icon: 'guard', v: scaled };
    if (mv.t === 'buf') return { s: '+' + Math.max(1, Math.round(mv.v * f.scale)), c: C.ember, icon: 'rage', v: 0 };
    if (mv.t === 'hex') return { s: 'FRAY', c: '#ff8fd0', icon: 'hex', v: 0 };
    var raw = Math.max(1, Math.round((scaled + f.atk) * mul * (bt.frail > 0 ? 1.3 : 1)));
    return { s: (mv.t === 'atk2' ? raw + ' x2' : String(raw)), c: '#ff8080', icon: 'atk', v: raw };
  }

  function foeAct(bt, f) {
    if (f.dead) return;
    if (f.stagger > 0) {
      var sp = foeCenter(bt.foes.indexOf(f));
      vfx.float(sp.x, sp.y - 30, 'STAGGERED', '#ffffff');
      return;
    }
    f.block = 0;
    var mv = f.data.moves[f.mi % f.data.moves.length];
    f.mi = (f.mi + 1) % f.data.moves.length;
    var idx = bt.foes.indexOf(f);
    var pos = foeCenter(idx);
    var scaled = Math.round(mv.v * f.scale);
    var mul = f.weak > 0 ? 0.6 : 1;
    if (mv.t === 'grd') {
      f.block += scaled;
      vfx.float(pos.x, pos.y - 30, '+' + scaled, C.ice);
      sfx('guard');
      return;
    }
    if (mv.t === 'buf') {
      f.atk += scaled;
      vfx.float(pos.x, pos.y - 30, 'RAGE', C.ember);
      sfx('intent');
      return;
    }
    if (mv.t === 'hex') {
      bt.frail += mv.v;
      bt.power = Math.max(0, bt.power - 2);
      vfx.float(PLAYER_FX.x + 60, PLAYER_FX.y - 10, 'FRAYED', '#ff8fd0');
      sfx('hurt');
      logAdd(bt, f.name + ' frays your thread.');
      return;
    }
    vfx.foeAnim(idx, 'attack');
    var count = mv.t === 'atk2' ? 2 : 1;
    for (var i = 0; i < count; i++) {
      var dmg = Math.max(1, Math.round((scaled + f.atk) * mul * (bt.frail > 0 ? 1.3 : 1)));
      var m = matchup(f.elem, f.cls, 'loom', 'rite');
      dmg = Math.max(1, Math.round(dmg * m.total));
      if (bt.block > 0) {
        var absorbed = Math.min(bt.block, dmg);
        bt.block -= absorbed;
        dmg -= absorbed;
        vfx.float(PLAYER_FX.x + 40, PLAYER_FX.y + 4, '-' + absorbed, C.ice);
      }
      if (dmg > 0) {
        bt.hp -= dmg;
        vfx.float(PLAYER_FX.x + 40, PLAYER_FX.y - 16, '-' + dmg, C.red);
        vfx.burst(PLAYER_FX.x + 20, PLAYER_FX.y, 14, C.red, 'hit');
        vfx.shake(8, 200);
        vfx.flash(C.red, 0.14);
        vfx.weaver('hurt');
        sfx('hurt');
      } else {
        vfx.weaver('guard');
        sfx('guard');
      }
    }
  }

  function endRound(bt) {
    var alive = aliveFoes(bt);
    for (var i = 0; i < alive.length; i++) {
      var f = alive[i];
      if (f.burn > 0) {
        hurtFoe(bt, f, f.burn, true);
        f.burn = Math.max(0, f.burn - 1);
      }
      if (f.weak > 0) f.weak--;
      if (f.stagger > 0) f.stagger--;
      if (bt.rule === 'rage') f.atk += 1;
    }
    if (bt.frail > 0) bt.frail--;
  }

  function startTurn(bt) {
    bt.block = 0;
    bt.power = Math.max(0, bt.power - 1);
    bt.resolved = 0;
    bt.turn++;
    for (var i = 0; i < bt.hand.length; i++) bt.pile.push(bt.hand[i]);
    drawHand(bt);
    fixTarget(bt);
    bt.phase = 'pick';
  }

  /* ------------------------------------------------- resolution step queue
   * Every delay lives on the stepped sim clock. Nothing uses setTimeout, so a
   * pause or a hit stop can never let the resolution run ahead of the frame.
   */
  function push(bt, delay, fn) { bt.queue.push({ d: delay, fn: fn }); }

  function tickQueue(bt, dt) {
    if (!bt.queue.length) return;
    bt.qt -= dt * (bt.fast ? 5.5 : 1);
    while (bt.qt <= 0 && bt.queue.length) {
      var step = bt.queue.shift();
      try { step.fn(); } catch (e) { bt.queue.length = 0; }
      bt.qt = step.d;
      if (bt.phase === 'won' || bt.phase === 'lost') { bt.queue.length = 0; bt.qt = 0.55; break; }
    }
    if (!bt.queue.length && bt.qt <= 0) bt.qt = 0;
  }

  function fireWeave(bt, id, viaChain) {
    var sp = spiritOf(id);
    var art = scaleCard(sp.ult, id === 'weaver' ? 1 : (save.lv[id] || 1),
      id === 'weaver' ? 0 : (save.asc[id] || 0));
    art.s = id; art.elem = sp.elem; art.cls = sp.cls;
    bt.gauge[id] = 0;
    bt.weaves++;
    vfx.chip('WEAVE ART  ' + sp.ult.n, sp.col);
    vfx.flash(sp.col, 0.24);
    vfx.shake(11, 300);
    vfx.burst(195, 200, 46, sp.col, 'weave');
    vfx.weaver('weave');
    sfx('weave');
    logAdd(bt, sp.short + ' unleashes ' + sp.ult.n + '.');
    push(bt, viaChain ? 0.75 : 0.7, function () { applyCard(bt, art, 0, true); });
  }

  function resolveChain() {
    if (!B || B.phase !== 'pick' || B.sel.length !== 3) return;
    B.phase = 'resolve';
    B.fast = false;
    B.qt = 0.12;
    var picks = B.sel.map(function (i) { return B.hand[i]; });
    var same = picks[0] && picks[0].s === picks[1].s && picks[1].s === picks[2].s;
    advanceTutorial(3);
    if (same && B.gauge[picks[0].s] !== undefined) {
      fireWeave(B, picks[0].s, true);
    } else if (same) {
      fireWeave(B, picks[0].s, true);
    } else {
      picks.forEach(function (card, slot) {
        push(B, 0.4, function () {
          vfx.weaver(card.k === 'guard' ? 'guard' : 'weave');
          sfx(card.k === 'guard' ? 'guard' : (card.k === 'arcana' ? 'arcana' : 'strike'));
          applyCard(B, card, slot, false);
          addGauge(B, card.s, 34);
          logAdd(B, card.n);
        });
      });
    }
    var played = picks.slice();
    push(B, 0.34, function () {
      for (var i = 0; i < played.length; i++) {
        var ix = B.hand.indexOf(played[i]);
        if (ix >= 0) { B.pile.push(B.hand[ix]); B.hand.splice(ix, 1); }
      }
      B.sel.length = 0;
      B.phase = 'foe';
    });
    B.foes.forEach(function (f) {
      push(B, 0.5, function () { if (!f.dead) foeAct(B, f); });
    });
    push(B, 0.4, function () { endRound(B); });
    push(B, 0.05, function () {
      if (checkEnd(B)) return;
      startTurn(B);
      if (B.turn === 3) advanceTutorial(5);
    });
  }

  function fireGauge(slotIndex) {
    if (!B || B.phase !== 'pick') return;
    var id = B.party[slotIndex];
    if (!id || B.gauge[id] === undefined || B.gauge[id] < 100) return;
    B.phase = 'resolve';
    B.fast = false;
    B.qt = 0.1;
    fireWeave(B, id, false);
    push(B, 0.2, function () {
      if (checkEnd(B)) return;
      B.phase = 'pick';
    });
  }

  function toggleCard(i) {
    if (!B || B.phase !== 'pick' || !B.hand[i]) return;
    var at = B.sel.indexOf(i);
    if (at >= 0) { B.sel.splice(at, 1); sfx('unpick'); }
    else if (B.sel.length < 3) {
      B.sel.push(i);
      sfx('pick');
      if (B.sel.length === 1) advanceTutorial(1);
      if (B.sel.length === 3) advanceTutorial(2);
    } else return;
    inspectId = B.hand[i].s;
  }

  function setTarget(i) {
    if (!B || !B.foes[i] || B.foes[i].dead) return;
    if (B.target === i) return;
    B.target = i;
    sfx('pick');
    advanceTutorial(4);
  }

  /* --------------------------------------------------------------- tutorial
   * One thin fading strip, one instruction at a time, first run only.
   */
  var TUTORIAL = [
    '',
    'Tap a command card to add it to the chain.',
    'Chain three cards. Three from one spirit fires a Weave Art.',
    'Tap RESOLVE to play the chain.',
    'Each foe shows its next move. Tap a foe to change target.',
    'Hold a card to preview its damage against the target.'
  ];
  function advanceTutorial(step) {
    if (save.tut >= step) return;
    if (save.tut !== step - 1) return;
    save.tut = step;
    persist();
    if (TUTORIAL[step]) vfx.coach(TUTORIAL[step]);
  }
  function tutorialKick() {
    if (save.tut === 0) { save.tut = 0; vfx.coach(TUTORIAL[1]); save.tut = 0; }
    if (save.tut < 1) vfx.coach(TUTORIAL[1]);
    else if (save.tut < 5) vfx.coach(TUTORIAL[save.tut + 1] || '');
  }

  /* ------------------------------------------------------------------ flow */
  function setMode(next) {
    mode = next;
    hook.mode = next;
    listFocus = 0;
    if (app.scene) app.scene.onModeChanged();
  }

  function goStory(pages, then) {
    story = { pages: pages, i: 0, then: then };
    setMode('story');
  }

  function startBattle(c, b) {
    var ch = chapterOf(c);
    var def = battleAt(c, b);
    var realm = realmOf(ch.realm);
    B = makeBattle({
      kind: def.kind, ch: c, bi: b, name: def.n, realm: ch.realm,
      foes: def.foes, scale: D.CH_SCALE[c] || 1, party: save.party
    });
    pending = { type: 'story', c: c, b: b };
    setMode('battle');
    music(def.kind === 'boss' ? 'loom' : realm.music);
    if (app.scene) {
      app.scene.showBanner(def.kind === 'boss' ? 'BOSS' : ch.name.split('. ')[1],
        def.n, def.kind === 'boss' ? C.rose : realm.accent);
    }
    if (save.tut < 5) tutorialKick();
  }

  function startTrial(t) {
    B = makeBattle({
      kind: 'trial', ch: clamp(t.chapter, 0, 4), bi: 0, name: t.name, realm: t.realm,
      waves: t.waves, rule: t.rule, trialId: t.id, seed: t.seed,
      scale: D.CH_SCALE[clamp(t.chapter, 0, 4)] || 1, party: save.party
    });
    pending = { type: 'trial', id: t.id };
    setMode('battle');
    music('loom');
    if (app.scene) app.scene.showBanner('TRIAL', t.name, C.violet);
  }

  function rollFreeEncounter(realmId) {
    var realm = realmOf(realmId);
    var lv = partyLevel();
    var rnd = makeRng(((Date.now() / 1000) | 0) ^ (realm.id.length * 7919));
    var count = 2 + (rnd() > 0.55 ? 1 : 0);
    var ids = [];
    for (var i = 0; i < count; i++) {
      ids.push(realm.encounters[Math.floor(rnd() * realm.encounters.length) % realm.encounters.length]);
    }
    return { realm: realm.id, foes: ids, scale: 1 + 0.06 * (lv - 1) };
  }

  function startFree(enc) {
    var realm = realmOf(enc.realm);
    B = makeBattle({
      kind: 'free', ch: 2, bi: 0, name: realm.short, realm: realm.id,
      foes: enc.foes, scale: enc.scale, party: save.party
    });
    pending = { type: 'free', realm: realm.id };
    setMode('battle');
    music(realm.music);
    if (app.scene) app.scene.showBanner('FREE BATTLE', realm.short, realm.accent);
  }

  function scoreStars(bt) {
    var ratio = bt.hp / bt.maxhp;
    if (bt.turn <= 5 && ratio >= 0.6) return 3;
    if (bt.turn <= 8 && ratio >= 0.3) return 2;
    return 1;
  }

  function finishBattle() {
    if (!B || B.ended) return;
    B.ended = 1;
    var won = B.phase === 'won';
    var lines = [];
    var earned = [];
    var got = 0;
    if (won) {
      sfx('victory');
      got = scoreStars(B);
      var xp = Math.max(12, Math.round(B.totalFoeHp * 0.5));
      var ups = grantXp(xp);
      lines.push('Turns used  ' + B.turn);
      lines.push('Thread left  ' + B.hp + ' / ' + B.maxhp);
      lines.push('Spirit XP  +' + xp);
      if (ups.length) earned.push(ups.join('   '));
      if (pending && pending.type === 'story') {
        var prev = stars(pending.c, pending.b);
        if (got > prev) save.cleared[battleKey(pending.c, pending.b)] = got;
        var def = battleAt(pending.c, pending.b);
        if (def.kind === 'boss' && pending.c === save.ch && save.ch < D.CHAPTERS.length - 1) {
          save.ch = pending.c + 1;
        }
        if (!prev && def.finale) {
          if (!save.best || B.turn < save.best) save.best = B.turn;
        }
      } else if (pending && pending.type === 'trial') {
        var t = trialOf(pending.id);
        var best = save.trials[t.id];
        if (!best) { save.tokens += 1; earned.push('Ascension token  +1'); }
        if (!best || B.turn < best) save.trials[t.id] = B.turn;
        lines.push('Trial best  ' + save.trials[t.id] + ' turns');
      } else if (pending && pending.type === 'free') {
        save.freeWins += 1;
        if (save.freeWins % 5 === 0) { save.tokens += 1; earned.push('Ascension token  +1'); }
      }
      persist();
    } else {
      sfx('defeat');
      lines.push('You fell on turn ' + B.turn);
      lines.push('Retry is free. It always is.');
    }
    result = {
      won: won, stars: got, lines: lines, earned: earned,
      title: won ? 'BATTLE WON' : 'THE WEAVE SNAPS',
      btn: won ? 'CONTINUE' : 'RETRY BATTLE'
    };
    setMode('result');
  }

  function afterResult() {
    var p = pending;
    result = null;
    if (!p) { setMode('map'); return; }
    if (p.type === 'trial') { setMode('trials'); B = null; return; }
    if (p.type === 'free') { setMode('free'); B = null; return; }
    var def = battleAt(p.c, p.b);
    var pages = [];
    if (def.kind === 'bond') {
      var ids = def.bond === 'any' ? save.party.slice() : [def.bond];
      var notes = [];
      ids.forEach(function (id) {
        var note = deepenBond(id);
        if (note) notes.push(note);
      });
      if (notes.length) {
        pages.push({ t: 'BOND DEEPENED', x: notes.join('. ') + '. Their command cards carry more of the weave now.', g: 0 });
      }
    }
    if (def.reward && save.roster.indexOf(def.reward) < 0) {
      if (bindSpirit(def.reward)) {
        sfx('bind');
        pages.push({
          t: spiritOf(def.reward).name.toUpperCase(),
          x: def.rstory + ' ' + spiritOf(def.reward).lore,
          spirit: def.reward, col: spiritOf(def.reward).col
        });
      }
    }
    if (def.finale) {
      persist();
      pages.push({
        t: 'THE WEAVE HOLDS',
        x: 'The cut closes. Ten myth-spirits settle into the loom-halls and the thread runs whole again. Run finished in ' + B.turn + ' turns.',
        g: 0
      });
      B = null;
      persist();
      goStory(pages, function () { setMode('end'); });
      return;
    }
    persist();
    B = null;
    if (pages.length) goStory(pages, function () { setMode('map'); });
    else setMode('map');
  }

  function retryBattle() {
    var p = pending;
    result = null;
    if (!p) { setMode('map'); return; }
    if (p.type === 'trial') { startTrial(trialOf(p.id)); return; }
    if (p.type === 'free') { startFree(rollFreeEncounter(p.realm)); return; }
    startBattle(p.c, p.b);
  }

  function openBattle(c, b) {
    var ch = chapterOf(c);
    var def = battleAt(c, b);
    var pages = [];
    var chKey = 'ch' + c;
    if (!save.seenStory[chKey]) {
      save.seenStory[chKey] = true;
      pages.push({ t: ch.name, x: ch.story + ' ' + realmOf(ch.realm).myth, g: 0 });
    }
    pages.push({ t: def.n, x: def.story, g: 0 });
    persist();
    goStory(pages, function () { startBattle(c, b); });
  }

  function newRun() {
    var best = save.best;
    save = freshSave();
    save.best = best;
    persist();
    chapterView = 0;
    openBattle(0, 0);
  }

  /* --------------------------------------------------------------- baking
   * Every piece of chrome, every creature and every card face is drawn once
   * into a canvas texture at load. Nothing replays a draw command list per
   * frame.
   */
  function mkCanvas(w, h) {
    return window.GGKit && window.GGKit.hiDpi ? window.GGKit.hiDpi.canvas(w, h, HIDPI_FACTOR).canvas : (function () {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      return cv;
    }());
  }
  function addTex(scene, key, canvas) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function shade(hex, amount) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (amount >= 0) {
      r = Math.round(r + (255 - r) * amount);
      g = Math.round(g + (255 - g) * amount);
      b = Math.round(b + (255 - b) * amount);
    } else {
      r = Math.round(r * (1 + amount)); g = Math.round(g * (1 + amount)); b = Math.round(b * (1 + amount));
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function rgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' +
      parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  function panelTexture(scene, key, w, h, fill, stroke, radius, glow) {
    var pad = glow ? 6 : 2;
    var cv = mkCanvas(w + pad * 2, h + pad * 2);
    var c = cv.getContext('2d');
    if (glow) {
      c.shadowColor = rgba(stroke, 0.75);
      c.shadowBlur = 12;
    }
    var g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, shade(fill, 0.10));
    g.addColorStop(0.55, fill);
    g.addColorStop(1, shade(fill, -0.28));
    rr(c, pad, pad, w, h, radius);
    c.fillStyle = g;
    c.fill();
    c.shadowBlur = 0;
    if (stroke) {
      rr(c, pad + 0.5, pad + 0.5, w - 1, h - 1, radius);
      c.lineWidth = 2;
      c.strokeStyle = stroke;
      c.stroke();
      rr(c, pad + 3.5, pad + 3.5, w - 7, h - 7, Math.max(2, radius - 3));
      c.lineWidth = 1;
      c.strokeStyle = rgba(stroke, 0.22);
      c.stroke();
    }
    addTex(scene, key, cv);
    return { pad: pad };
  }

  /* ---------------------------------------------------------- creature art */
  function drawGlyph(c, g, s, col) {
    var u = s / 2, i;
    var lite = shade(col, 0.35), dark = shade(col, -0.45);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, s * 0.09);
    c.fillStyle = col;
    c.strokeStyle = col;
    switch (g) {
      case 0: /* the weaver: spool crossed by thread */
        c.fillStyle = dark;
        c.fillRect(-u * 0.62, -u * 0.78, u * 1.24, u * 1.56);
        c.fillStyle = col;
        c.fillRect(-u * 0.5, -u * 0.7, u, u * 1.4);
        c.fillStyle = lite;
        c.fillRect(-u * 0.5, -u * 0.9, u, u * 0.24);
        c.fillRect(-u * 0.5, u * 0.66, u, u * 0.24);
        c.strokeStyle = lite;
        c.beginPath();
        c.moveTo(-u, -u); c.lineTo(u, u); c.moveTo(u, -u); c.lineTo(-u, u);
        c.stroke();
        break;
      case 1: /* forge titan: anvil */
        c.fillStyle = dark;
        c.fillRect(-u * 1.02, -u * 0.22, u * 2.04, u * 0.94);
        c.fillStyle = col;
        c.fillRect(-u, -u * 0.2, u * 2, u * 0.5);
        c.beginPath();
        c.moveTo(-u, -u * 0.2);
        c.lineTo(-u * 1.28, -u * 0.34);
        c.lineTo(-u * 0.96, -u * 0.44);
        c.closePath();
        c.fill();
        c.fillRect(-u * 0.62, u * 0.3, u * 1.24, u * 0.4);
        c.fillRect(-u * 0.45, -u, u * 0.9, u * 0.85);
        c.fillStyle = lite;
        c.fillRect(-u * 0.45, -u, u * 0.9, u * 0.2);
        c.fillStyle = col;
        c.fillRect(-u * 0.6, u * 0.7, u * 1.2, u * 0.35);
        break;
      case 2: /* river serpent */
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(-u, u * 0.6);
        c.quadraticCurveTo(-u * 0.3, -u * 1.1, 0, 0);
        c.quadraticCurveTo(u * 0.3, u * 1.1, u * 0.9, -u * 0.5);
        c.stroke();
        c.strokeStyle = lite;
        c.lineWidth = Math.max(1, s * 0.03);
        c.stroke();
        c.fillStyle = col;
        c.beginPath(); c.arc(u * 0.88, -u * 0.55, u * 0.3, 0, TAU); c.fill();
        c.fillStyle = '#1a0f24';
        c.beginPath(); c.arc(u * 0.95, -u * 0.62, u * 0.08, 0, TAU); c.fill();
        break;
      case 3: /* ash raven */
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, -u * 0.3); c.lineTo(-u, u * 0.3); c.lineTo(-u * 0.3, u * 0.35);
        c.lineTo(0, u * 0.95); c.lineTo(u * 0.3, u * 0.35); c.lineTo(u, u * 0.3);
        c.closePath(); c.fill();
        c.fillStyle = lite;
        c.beginPath();
        c.moveTo(0, -u * 0.28); c.lineTo(-u * 0.62, u * 0.12); c.lineTo(0, u * 0.2);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath(); c.arc(0, -u * 0.66, u * 0.3, 0, TAU); c.fill();
        c.fillStyle = '#ffcf7a';
        c.beginPath(); c.arc(u * 0.09, -u * 0.7, u * 0.08, 0, TAU); c.fill();
        break;
      case 4: /* stone hound */
        c.fillStyle = dark;
        c.fillRect(-u * 0.94, -u * 0.34, u * 1.68, u * 0.88);
        c.fillStyle = col;
        c.fillRect(-u * 0.9, -u * 0.3, u * 1.6, u * 0.8);
        c.fillRect(u * 0.35, -u * 0.82, u * 0.62, u * 0.62);
        c.fillStyle = lite;
        c.fillRect(-u * 0.9, -u * 0.3, u * 1.6, u * 0.16);
        c.fillStyle = col;
        c.fillRect(-u * 0.8, u * 0.5, u * 0.3, u * 0.52);
        c.fillRect(u * 0.3, u * 0.5, u * 0.3, u * 0.52);
        c.fillStyle = '#ffe4a0';
        c.fillRect(u * 0.7, -u * 0.66, u * 0.16, u * 0.14);
        break;
      case 5: /* glass stag */
        c.fillStyle = col;
        c.beginPath(); c.arc(0, u * 0.42, u * 0.44, 0, TAU); c.fill();
        c.strokeStyle = lite;
        c.beginPath();
        c.moveTo(-u * 0.3, 0); c.lineTo(-u * 0.72, -u * 0.94);
        c.moveTo(-u * 0.56, -u * 0.5); c.lineTo(-u, -u * 0.56);
        c.moveTo(u * 0.3, 0); c.lineTo(u * 0.72, -u * 0.94);
        c.moveTo(u * 0.56, -u * 0.5); c.lineTo(u, -u * 0.56);
        c.stroke();
        c.fillStyle = '#0e1a26';
        c.fillRect(-u * 0.24, u * 0.3, u * 0.16, u * 0.12);
        c.fillRect(u * 0.08, u * 0.3, u * 0.16, u * 0.12);
        break;
      case 6: /* dune wyrm */
        c.strokeStyle = col;
        for (i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(-u * 0.52 + i * u * 0.52, (i % 2 ? -1 : 1) * u * 0.26, u * 0.44 - i * u * 0.07, 0, TAU);
          c.stroke();
        }
        c.fillStyle = col;
        c.beginPath(); c.arc(u * 0.62, -u * 0.28, u * 0.26, 0, TAU); c.fill();
        c.fillStyle = '#2a1a08';
        c.beginPath(); c.arc(u * 0.7, -u * 0.34, u * 0.07, 0, TAU); c.fill();
        break;
      case 7: /* moth oracle */
        c.fillStyle = col;
        c.beginPath(); c.ellipse(-u * 0.5, 0, u * 0.5, u * 0.88, -0.3, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(u * 0.5, 0, u * 0.5, u * 0.88, 0.3, 0, TAU); c.fill();
        c.fillStyle = lite;
        c.beginPath(); c.ellipse(-u * 0.5, -u * 0.24, u * 0.26, u * 0.4, -0.3, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(u * 0.5, -u * 0.24, u * 0.26, u * 0.4, 0.3, 0, TAU); c.fill();
        c.fillStyle = shade(col, -0.35);
        c.fillRect(-u * 0.12, -u * 0.82, u * 0.24, u * 1.64);
        break;
      case 8: /* bone choir */
        for (i = 0; i < 4; i++) {
          var wdt = u * 2 * (0.9 - i * 0.13);
          c.fillStyle = i % 2 ? col : lite;
          rr(c, -wdt / 2, -u * 0.92 + i * u * 0.5, wdt, u * 0.24, u * 0.1);
          c.fill();
        }
        break;
      case 9: /* lantern koi */
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(u * 0.95, 0);
        c.quadraticCurveTo(u * 0.1, -u * 0.75, -u * 0.55, -u * 0.16);
        c.quadraticCurveTo(-u * 0.1, 0, -u * 0.55, u * 0.16);
        c.quadraticCurveTo(u * 0.1, u * 0.75, u * 0.95, 0);
        c.closePath(); c.fill();
        c.fillStyle = lite;
        c.beginPath();
        c.moveTo(u * 0.9, 0); c.quadraticCurveTo(u * 0.2, -u * 0.4, -u * 0.2, -u * 0.1);
        c.quadraticCurveTo(u * 0.2, 0, u * 0.9, 0);
        c.closePath(); c.fill();
        c.fillStyle = '#ffcf7a';
        rr(c, -u * 0.18, -u * 0.95, u * 0.42, u * 0.42, u * 0.1); c.fill();
        c.fillStyle = '#0d2436';
        c.beginPath(); c.arc(u * 0.62, -u * 0.06, u * 0.09, 0, TAU); c.fill();
        break;
      case 10: /* bell warden */
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(-u * 0.9, u * 0.55);
        c.quadraticCurveTo(-u * 0.78, -u * 0.85, 0, -u * 0.9);
        c.quadraticCurveTo(u * 0.78, -u * 0.85, u * 0.9, u * 0.55);
        c.closePath(); c.fill();
        c.fillStyle = lite;
        c.beginPath();
        c.moveTo(-u * 0.5, u * 0.2);
        c.quadraticCurveTo(-u * 0.42, -u * 0.6, 0, -u * 0.66);
        c.quadraticCurveTo(-u * 0.1, -u * 0.1, -u * 0.2, u * 0.2);
        c.closePath(); c.fill();
        c.fillStyle = shade(col, -0.4);
        rr(c, -u * 0.98, u * 0.5, u * 1.96, u * 0.26, u * 0.1); c.fill();
        c.fillStyle = '#ffe4a0';
        c.beginPath(); c.arc(0, u * 0.78, u * 0.18, 0, TAU); c.fill();
        break;
      default:
        c.fillStyle = col;
        c.beginPath();
        for (i = 0; i < 10; i++) {
          var a = i / 10 * TAU, r = i % 2 ? u * 0.42 : u;
          c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill();
        break;
    }
  }

  function drawFoeShape(c, fam, s, col) {
    var u = s / 2;
    var lite = shade(col, 0.32), dark = shade(col, -0.5);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(2, s * 0.055);
    var i, a, r;
    function eyes(ex, ey, ew, eh, ecol) {
      c.fillStyle = '#120a18';
      c.fillRect(-ex - ew, ey, ew, eh);
      c.fillRect(ex, ey, ew, eh);
      c.fillStyle = ecol || '#ffd36b';
      c.fillRect(-ex - ew + ew * 0.2, ey + eh * 0.2, ew * 0.5, eh * 0.6);
      c.fillRect(ex + ew * 0.3, ey + eh * 0.2, ew * 0.5, eh * 0.6);
    }
    switch (fam) {
      case 'moth':
        c.fillStyle = dark;
        c.beginPath(); c.ellipse(0, u * 0.05, u * 0.94, u * 0.72, 0, 0, TAU); c.fill();
        c.fillStyle = col;
        c.beginPath(); c.ellipse(-u * 0.46, -u * 0.05, u * 0.5, u * 0.66, -0.35, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(u * 0.46, -u * 0.05, u * 0.5, u * 0.66, 0.35, 0, TAU); c.fill();
        c.fillStyle = lite;
        c.fillRect(-u * 0.14, -u * 0.72, u * 0.28, u * 1.4);
        eyes(u * 0.06, -u * 0.6, u * 0.12, u * 0.12, '#ff9a45');
        break;
      case 'effigy':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(0, -u); c.lineTo(u * 0.72, -u * 0.1); c.lineTo(u * 0.44, u * 0.94);
        c.lineTo(-u * 0.44, u * 0.94); c.lineTo(-u * 0.72, -u * 0.1);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, -u * 0.86); c.lineTo(u * 0.6, -u * 0.08); c.lineTo(u * 0.36, u * 0.82);
        c.lineTo(-u * 0.36, u * 0.82); c.lineTo(-u * 0.6, -u * 0.08);
        c.closePath(); c.fill();
        c.strokeStyle = lite;
        for (i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(-u * 0.5 + i * u * 0.33, -u * 0.2);
          c.lineTo(-u * 0.36 + i * u * 0.28, u * 0.7);
          c.stroke();
        }
        eyes(u * 0.08, -u * 0.46, u * 0.16, u * 0.13, '#ffe4a0');
        break;
      case 'lamp':
        c.strokeStyle = shade(col, -0.3);
        c.beginPath(); c.moveTo(0, -u); c.lineTo(0, -u * 0.62); c.stroke();
        c.fillStyle = dark;
        rr(c, -u * 0.66, -u * 0.62, u * 1.32, u * 1.34, u * 0.28); c.fill();
        c.fillStyle = col;
        rr(c, -u * 0.56, -u * 0.54, u * 1.12, u * 1.16, u * 0.24); c.fill();
        c.fillStyle = rgba('#fff4d0', 0.55);
        rr(c, -u * 0.34, -u * 0.36, u * 0.36, u * 0.78, u * 0.14); c.fill();
        c.strokeStyle = shade(col, -0.45);
        for (i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(-u * 0.56, -u * 0.24 + i * u * 0.34);
          c.lineTo(u * 0.56, -u * 0.24 + i * u * 0.34);
          c.stroke();
        }
        eyes(u * 0.1, -u * 0.16, u * 0.14, u * 0.16, '#ff6b4a');
        break;
      case 'choir':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(0, -u * 0.98);
        c.quadraticCurveTo(u * 0.86, -u * 0.3, u * 0.62, u * 0.96);
        c.lineTo(-u * 0.62, u * 0.96);
        c.quadraticCurveTo(-u * 0.86, -u * 0.3, 0, -u * 0.98);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, -u * 0.84);
        c.quadraticCurveTo(u * 0.7, -u * 0.24, u * 0.5, u * 0.84);
        c.lineTo(-u * 0.5, u * 0.84);
        c.quadraticCurveTo(-u * 0.7, -u * 0.24, 0, -u * 0.84);
        c.closePath(); c.fill();
        c.fillStyle = rgba('#ffffff', 0.16);
        c.beginPath(); c.ellipse(0, -u * 0.36, u * 0.3, u * 0.42, 0, 0, TAU); c.fill();
        eyes(u * 0.09, -u * 0.5, u * 0.14, u * 0.1, '#c9a9ff');
        break;
      case 'bell':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(-u * 0.92, u * 0.5);
        c.quadraticCurveTo(-u * 0.8, -u * 0.94, 0, -u * 0.98);
        c.quadraticCurveTo(u * 0.8, -u * 0.94, u * 0.92, u * 0.5);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(-u * 0.8, u * 0.44);
        c.quadraticCurveTo(-u * 0.7, -u * 0.82, 0, -u * 0.86);
        c.quadraticCurveTo(u * 0.7, -u * 0.82, u * 0.8, u * 0.44);
        c.closePath(); c.fill();
        c.fillStyle = lite;
        c.beginPath();
        c.moveTo(-u * 0.44, u * 0.2);
        c.quadraticCurveTo(-u * 0.38, -u * 0.6, 0, -u * 0.66);
        c.quadraticCurveTo(-u * 0.08, -u * 0.1, -u * 0.16, u * 0.2);
        c.closePath(); c.fill();
        c.fillStyle = shade(col, -0.55);
        rr(c, -u * 0.98, u * 0.42, u * 1.96, u * 0.26, u * 0.1); c.fill();
        c.fillStyle = '#ffe4a0';
        c.beginPath(); c.arc(0, u * 0.76, u * 0.16, 0, TAU); c.fill();
        break;
      case 'revenant':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(0, -u); c.lineTo(u * 0.66, -u * 0.42); c.lineTo(u * 0.5, u * 0.94);
        c.lineTo(-u * 0.5, u * 0.94); c.lineTo(-u * 0.66, -u * 0.42);
        c.closePath(); c.fill();
        c.fillStyle = col;
        for (i = 0; i < 5; i++) {
          c.globalAlpha = 0.5 + i * 0.1;
          rr(c, -u * (0.56 - i * 0.06), -u * 0.8 + i * u * 0.34, u * 2 * (0.56 - i * 0.06), u * 0.26, u * 0.08);
          c.fill();
        }
        c.globalAlpha = 1;
        eyes(u * 0.1, -u * 0.58, u * 0.14, u * 0.12, '#8fd8ff');
        break;
      case 'kin':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(0, -u * 0.98); c.lineTo(u * 0.9, u * 0.2); c.lineTo(u * 0.4, u * 0.96);
        c.lineTo(-u * 0.4, u * 0.96); c.lineTo(-u * 0.9, u * 0.2);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, -u * 0.8); c.lineTo(u * 0.74, u * 0.16); c.lineTo(u * 0.32, u * 0.84);
        c.lineTo(-u * 0.32, u * 0.84); c.lineTo(-u * 0.74, u * 0.16);
        c.closePath(); c.fill();
        c.fillStyle = shade(col, 0.5);
        c.beginPath();
        c.moveTo(0, -u * 0.5); c.lineTo(u * 0.3, u * 0.1); c.lineTo(-u * 0.3, u * 0.1);
        c.closePath(); c.fill();
        c.strokeStyle = shade(col, -0.55);
        c.lineWidth = Math.max(1.5, s * 0.03);
        c.beginPath();
        c.moveTo(-u * 0.5, u * 0.1); c.lineTo(-u * 0.2, u * 0.44); c.lineTo(-u * 0.34, u * 0.8);
        c.moveTo(u * 0.46, u * 0.1); c.lineTo(u * 0.2, u * 0.4);
        c.stroke();
        c.fillStyle = '#ffd08a';
        c.beginPath(); c.arc(-u * 0.34, u * 0.5, u * 0.08, 0, TAU); c.fill();
        c.beginPath(); c.arc(u * 0.3, u * 0.56, u * 0.06, 0, TAU); c.fill();
        c.beginPath(); c.arc(0, u * 0.66, u * 0.07, 0, TAU); c.fill();
        eyes(u * 0.1, -u * 0.18, u * 0.15, u * 0.13, '#fff0c0');
        break;
      case 'marshal':
        c.fillStyle = dark;
        rr(c, -u * 0.66, -u * 0.5, u * 1.32, u * 1.46, u * 0.2); c.fill();
        c.fillStyle = col;
        rr(c, -u * 0.56, -u * 0.42, u * 1.12, u * 1.3, u * 0.18); c.fill();
        c.fillStyle = shade(col, -0.3);
        c.beginPath();
        c.moveTo(-u * 0.96, -u * 0.44); c.lineTo(u * 0.96, -u * 0.44);
        c.lineTo(u * 0.5, -u * 0.72); c.lineTo(-u * 0.5, -u * 0.72);
        c.closePath(); c.fill();
        c.fillStyle = lite;
        rr(c, -u * 0.4, u * 0.26, u * 0.8, u * 0.14, u * 0.06); c.fill();
        eyes(u * 0.1, -u * 0.2, u * 0.15, u * 0.12, '#fff0c0');
        break;
      case 'crown':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(-u * 0.9, u * 0.96); c.lineTo(-u * 0.66, -u * 0.34);
        c.lineTo(-u * 0.3, u * 0.06); c.lineTo(0, -u * 0.98); c.lineTo(u * 0.3, u * 0.06);
        c.lineTo(u * 0.66, -u * 0.34); c.lineTo(u * 0.9, u * 0.96);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(-u * 0.76, u * 0.86); c.lineTo(-u * 0.54, -u * 0.2);
        c.lineTo(-u * 0.24, u * 0.14); c.lineTo(0, -u * 0.8); c.lineTo(u * 0.24, u * 0.14);
        c.lineTo(u * 0.54, -u * 0.2); c.lineTo(u * 0.76, u * 0.86);
        c.closePath(); c.fill();
        c.fillStyle = shade(col, 0.55);
        c.beginPath(); c.arc(0, u * 0.42, u * 0.24, 0, TAU); c.fill();
        eyes(u * 0.14, u * 0.1, u * 0.16, u * 0.13, '#fff0c0');
        break;
      case 'shard':
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(0, -u); c.lineTo(u * 0.78, -u * 0.1); c.lineTo(u * 0.34, u * 0.94);
        c.lineTo(-u * 0.5, u * 0.62); c.lineTo(-u * 0.72, -u * 0.4);
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, -u * 0.84); c.lineTo(u * 0.62, -u * 0.08); c.lineTo(u * 0.26, u * 0.78);
        c.lineTo(-u * 0.4, u * 0.5); c.lineTo(-u * 0.58, -u * 0.32);
        c.closePath(); c.fill();
        c.fillStyle = rgba('#ffffff', 0.35);
        c.beginPath();
        c.moveTo(0, -u * 0.8); c.lineTo(u * 0.2, -u * 0.1); c.lineTo(-u * 0.16, u * 0.1);
        c.closePath(); c.fill();
        eyes(u * 0.12, u * 0.02, u * 0.13, u * 0.1, '#e8f8ff');
        break;
      case 'spine':
        c.fillStyle = dark;
        rr(c, -u * 0.3, -u * 0.94, u * 0.6, u * 1.9, u * 0.16); c.fill();
        c.fillStyle = col;
        for (i = 0; i < 6; i++) {
          var ww = u * (0.9 - Math.abs(i - 2.5) * 0.12);
          rr(c, -ww, -u * 0.86 + i * u * 0.3, ww * 2, u * 0.18, u * 0.08);
          c.fill();
        }
        c.fillStyle = lite;
        c.beginPath(); c.arc(0, -u * 0.98, u * 0.28, 0, TAU); c.fill();
        eyes(u * 0.07, -u * 1.04, u * 0.1, u * 0.09, '#ff8080');
        break;
      case 'warden':
        c.fillStyle = dark;
        rr(c, -u * 0.86, -u * 0.94, u * 1.72, u * 1.9, u * 0.14); c.fill();
        c.fillStyle = col;
        rr(c, -u * 0.74, -u * 0.84, u * 1.48, u * 1.7, u * 0.12); c.fill();
        c.fillStyle = rgba('#ffffff', 0.22);
        rr(c, -u * 0.58, -u * 0.7, u * 0.4, u * 1.4, u * 0.08); c.fill();
        c.strokeStyle = shade(col, -0.5);
        c.beginPath();
        c.moveTo(-u * 0.74, u * 0.1); c.lineTo(u * 0.74, u * 0.1);
        c.moveTo(0, -u * 0.84); c.lineTo(0, u * 0.86);
        c.stroke();
        eyes(u * 0.16, -u * 0.44, u * 0.2, u * 0.14, '#c9f0ff');
        break;
      case 'mote':
        c.fillStyle = rgba(col, 0.3);
        c.beginPath(); c.arc(0, 0, u * 0.94, 0, TAU); c.fill();
        c.fillStyle = col;
        c.beginPath(); c.arc(0, 0, u * 0.56, 0, TAU); c.fill();
        c.fillStyle = shade(col, 0.6);
        c.beginPath(); c.arc(-u * 0.16, -u * 0.18, u * 0.24, 0, TAU); c.fill();
        c.strokeStyle = rgba(col, 0.7);
        for (i = 0; i < 6; i++) {
          a = i / 6 * TAU;
          c.beginPath();
          c.moveTo(Math.cos(a) * u * 0.6, Math.sin(a) * u * 0.6);
          c.lineTo(Math.cos(a) * u * 0.96, Math.sin(a) * u * 0.96);
          c.stroke();
        }
        break;
      case 'hand':
        c.fillStyle = dark;
        rr(c, -u * 0.56, -u * 0.1, u * 1.12, u * 1.04, u * 0.2); c.fill();
        c.fillStyle = col;
        rr(c, -u * 0.48, -u * 0.04, u * 0.96, u * 0.92, u * 0.18); c.fill();
        for (i = 0; i < 4; i++) {
          c.fillStyle = i % 2 ? col : lite;
          rr(c, -u * 0.46 + i * u * 0.25, -u * 0.92 + (i === 0 || i === 3 ? u * 0.2 : 0),
            u * 0.2, u * 0.94, u * 0.1);
          c.fill();
        }
        break;
      case 'rift':
        c.fillStyle = rgba(col, 0.28);
        c.beginPath();
        for (i = 0; i < 14; i++) {
          a = i / 14 * TAU; r = i % 2 ? u * 0.5 : u;
          c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        for (i = 0; i < 14; i++) {
          a = i / 14 * TAU + 0.2; r = i % 2 ? u * 0.34 : u * 0.8;
          c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill();
        c.fillStyle = '#150a18';
        c.beginPath(); c.ellipse(0, 0, u * 0.2, u * 0.6, 0, 0, TAU); c.fill();
        c.fillStyle = '#ffe4f4';
        c.beginPath(); c.ellipse(0, -u * 0.12, u * 0.08, u * 0.26, 0, 0, TAU); c.fill();
        break;
      default:
        c.fillStyle = col;
        c.beginPath(); c.arc(0, 0, u * 0.8, 0, TAU); c.fill();
        break;
    }
  }

  function bakeFoeTexture(scene, id) {
    var fd = foeDataOf(id);
    var S = 128;
    var cv = mkCanvas(S, S);
    var c = cv.getContext('2d');
    c.save();
    c.translate(S / 2, S / 2 - 4);
    c.globalAlpha = 0.35;
    c.fillStyle = '#000000';
    c.beginPath();
    c.ellipse(0, S * 0.4, S * 0.28, S * 0.06, 0, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
    drawFoeShape(c, fd.fam, S * 0.78, fd.col);
    c.restore();
    addTex(scene, 'foe-' + id, cv);
  }

  function bakePortrait(scene, id) {
    var sp = spiritOf(id);
    var S = 96;
    var cv = mkCanvas(S, S);
    var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, shade(sp.dark, 0.22));
    g.addColorStop(1, shade(sp.dark, -0.4));
    rr(c, 2, 2, S - 4, S - 4, 14);
    c.fillStyle = g;
    c.fill();
    c.save();
    rr(c, 2, 2, S - 4, S - 4, 14);
    c.clip();
    c.fillStyle = rgba(sp.col, 0.16);
    for (var i = 0; i < 7; i++) c.fillRect(i * 14 + 2, 0, 2, S);
    c.restore();
    c.save();
    c.translate(S / 2, S / 2 + 2);
    drawGlyph(c, sp.g, S * 0.62, sp.col);
    c.restore();
    rr(c, 2.5, 2.5, S - 5, S - 5, 14);
    c.lineWidth = 3;
    c.strokeStyle = sp.col;
    c.stroke();
    /* class mark, so team read never relies on colour alone */
    c.fillStyle = rgba('#0a0710', 0.8);
    rr(c, S - 26, 6, 20, 20, 6);
    c.fill();
    c.fillStyle = sp.col;
    c.font = 'bold 15px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(classOf(sp.cls).mark, S - 16, 17);
    addTex(scene, 'por-' + id, cv);
  }

  function bakeCard(scene, id, selected) {
    var sp = spiritOf(id);
    var w = L.hand.w, h = L.hand.h, pad = 5;
    var cv = mkCanvas(w + pad * 2, h + pad * 2);
    var c = cv.getContext('2d');
    if (selected) {
      c.shadowColor = rgba(sp.col, 0.9);
      c.shadowBlur = 11;
    }
    var g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, shade(sp.dark, 0.28));
    g.addColorStop(0.6, sp.dark);
    g.addColorStop(1, shade(sp.dark, -0.42));
    rr(c, pad, pad, w, h, 9);
    c.fillStyle = g;
    c.fill();
    c.shadowBlur = 0;
    /* woven backing */
    c.save();
    rr(c, pad, pad, w, h, 9);
    c.clip();
    c.strokeStyle = rgba(sp.col, 0.13);
    c.lineWidth = 1;
    for (var i = -h; i < w; i += 8) {
      c.beginPath();
      c.moveTo(pad + i, pad + h);
      c.lineTo(pad + i + h, pad);
      c.stroke();
    }
    c.restore();
    /* header band */
    rr(c, pad + 3, pad + 3, w - 6, 17, 5);
    c.fillStyle = sp.col;
    c.fill();
    c.fillStyle = shade(sp.dark, -0.5);
    c.font = 'bold 11px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(sp.short, pad + w / 2, pad + 12);
    /* element pip, left; class mark, right */
    c.fillStyle = elemOf(sp.elem).col;
    c.beginPath();
    c.arc(pad + 10, pad + 12, 4, 0, TAU);
    c.fill();
    c.fillStyle = shade(sp.dark, -0.5);
    c.font = 'bold 11px ' + FONT;
    c.fillText(classOf(sp.cls).mark, pad + w - 10, pad + 12);
    /* glyph */
    c.save();
    c.translate(pad + w / 2, pad + 45);
    drawGlyph(c, sp.g, 34, sp.col);
    c.restore();
    /* divider */
    c.strokeStyle = rgba(sp.col, 0.4);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad + 8, pad + 66);
    c.lineTo(pad + w - 8, pad + 66);
    c.stroke();
    /* border */
    rr(c, pad + 0.5, pad + 0.5, w - 1, h - 1, 9);
    c.lineWidth = selected ? 3 : 2;
    c.strokeStyle = selected ? '#ffffff' : sp.col;
    c.stroke();
    addTex(scene, 'card-' + id + (selected ? '-sel' : ''), cv);
  }

  function bakeEmptyCard(scene) {
    var w = L.hand.w, h = L.hand.h, pad = 5;
    var cv = mkCanvas(w + pad * 2, h + pad * 2);
    var c = cv.getContext('2d');
    rr(c, pad, pad, w, h, 9);
    c.fillStyle = 'rgba(13,9,20,0.75)';
    c.fill();
    c.setLineDash([5, 5]);
    c.lineWidth = 2;
    c.strokeStyle = '#241b36';
    rr(c, pad + 1, pad + 1, w - 2, h - 2, 9);
    c.stroke();
    addTex(scene, 'card-empty', cv);
  }

  /* the player entity: five animation states, two frames each */
  function bakeWeaverSheet(scene) {
    var F = 72, N = 10;
    var cv = mkCanvas(F * N, F);
    var c = cv.getContext('2d');
    var body = '#c9a9ff', robe = '#4b2c78', trim = '#ffd36b';
    var states = ['idle', 'idle', 'weave', 'weave', 'guard', 'guard', 'hurt', 'hurt', 'cheer', 'cheer'];
    for (var f = 0; f < N; f++) {
      var st = states[f];
      var alt = f % 2 === 1;
      c.save();
      c.translate(F * f + F / 2, F / 2);
      var bob = alt ? 1.6 : -1.6;
      if (st === 'hurt') { c.rotate(alt ? 0.12 : -0.06); bob = 3; }
      if (st === 'cheer') bob = alt ? -4 : 0;
      c.translate(0, bob);
      /* shadow */
      c.globalAlpha = 0.3;
      c.fillStyle = '#000';
      c.beginPath(); c.ellipse(0, 28, 16, 4, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
      /* robe */
      c.fillStyle = st === 'hurt' ? '#7b3a5a' : robe;
      c.beginPath();
      c.moveTo(0, -12);
      c.lineTo(15, 26);
      c.lineTo(-15, 26);
      c.closePath();
      c.fill();
      c.fillStyle = shade(robe, 0.25);
      c.beginPath();
      c.moveTo(0, -12); c.lineTo(6, 26); c.lineTo(-3, 26);
      c.closePath();
      c.fill();
      /* head */
      c.fillStyle = body;
      c.beginPath(); c.arc(0, -19, 8.5, 0, TAU); c.fill();
      c.fillStyle = '#2a1a3c';
      c.fillRect(-5, -21, 3.4, 2.6);
      c.fillRect(1.6, -21, 3.4, 2.6);
      /* hood trim */
      c.strokeStyle = trim;
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, -19, 10.5, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      /* arms and spool */
      c.strokeStyle = body;
      c.lineWidth = 4;
      c.lineCap = 'round';
      if (st === 'weave') {
        c.beginPath(); c.moveTo(-8, -4); c.lineTo(-20, alt ? -18 : -10); c.stroke();
        c.beginPath(); c.moveTo(8, -4); c.lineTo(20, alt ? -18 : -10); c.stroke();
        c.strokeStyle = trim;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-20, alt ? -18 : -10);
        c.quadraticCurveTo(0, alt ? -34 : -26, 20, alt ? -18 : -10);
        c.stroke();
      } else if (st === 'guard') {
        c.beginPath(); c.moveTo(-8, -4); c.lineTo(-4, -16); c.stroke();
        c.beginPath(); c.moveTo(8, -4); c.lineTo(4, -16); c.stroke();
        c.strokeStyle = '#9fd4ff';
        c.lineWidth = 3;
        c.beginPath(); c.arc(0, -6, 20, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      } else if (st === 'cheer') {
        c.beginPath(); c.moveTo(-8, -4); c.lineTo(-18, -24); c.stroke();
        c.beginPath(); c.moveTo(8, -4); c.lineTo(18, -24); c.stroke();
        c.fillStyle = trim;
        c.beginPath(); c.arc(-18, -26, 3.2, 0, TAU); c.fill();
        c.beginPath(); c.arc(18, -26, 3.2, 0, TAU); c.fill();
      } else if (st === 'hurt') {
        c.beginPath(); c.moveTo(-8, -4); c.lineTo(-18, 4); c.stroke();
        c.beginPath(); c.moveTo(8, -4); c.lineTo(16, 8); c.stroke();
      } else {
        c.beginPath(); c.moveTo(-8, -4); c.lineTo(-15, alt ? 8 : 6); c.stroke();
        c.beginPath(); c.moveTo(8, -4); c.lineTo(15, alt ? 6 : 8); c.stroke();
        c.fillStyle = trim;
        c.fillRect(11, alt ? 2 : 4, 8, 7);
        c.fillStyle = shade(trim, -0.3);
        c.fillRect(11, alt ? 2 : 4, 8, 2);
      }
      c.restore();
    }
    if (scene.textures.exists('weaver')) scene.textures.remove('weaver');
    scene.textures.addSpriteSheet('weaver', cv, { frameWidth: F, frameHeight: F, endFrame: N - 1 });
  }

  /* ------------------------------------------------------------ backdrops */
  function bakeRealmBg(scene, realmId) {
    var realm = realmOf(realmId);
    var cv = mkCanvas(W, H);
    var c = cv.getContext('2d');
    var i, j, x, y, a;
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, realm.sky);
    g.addColorStop(0.42, shade(realm.deep, -0.15));
    g.addColorStop(0.78, realm.deep);
    g.addColorStop(1, shade(realm.deep, -0.55));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    /* horizon glow */
    var rg = c.createRadialGradient(W / 2, H * 0.30, 10, W / 2, H * 0.30, W * 0.95);
    rg.addColorStop(0, rgba(realm.glow, 0.34));
    rg.addColorStop(0.5, rgba(realm.glow, 0.09));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);
    /* drifting dust */
    for (i = 0; i < 150; i++) {
      x = (i * 61.7) % W;
      y = (i * 113.3) % H;
      a = 0.05 + ((i * 37) % 22) / 100;
      c.fillStyle = rgba(i % 3 ? realm.accent : '#ffffff', a * 0.5);
      c.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
    }
    if (realm.motif === 'lanterns') {
      for (i = 0; i < 11; i++) {
        x = 22 + ((i * 71) % (W - 44));
        y = 60 + ((i * 97) % 300);
        var s = 16 + (i % 4) * 7;
        c.strokeStyle = rgba('#5a3f2a', 0.8);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, y - s * 0.6); c.stroke();
        var lg = c.createRadialGradient(x, y, 2, x, y, s * 1.9);
        lg.addColorStop(0, rgba('#ffcf7a', 0.55));
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = lg;
        c.beginPath(); c.arc(x, y, s * 1.9, 0, TAU); c.fill();
        c.fillStyle = i % 2 ? '#ff9a45' : '#ffcf7a';
        rr(c, x - s * 0.42, y - s * 0.55, s * 0.84, s * 1.1, s * 0.3);
        c.fill();
        c.strokeStyle = rgba('#7a3a12', 0.6);
        c.beginPath();
        c.moveTo(x - s * 0.42, y); c.lineTo(x + s * 0.42, y);
        c.stroke();
      }
      /* rooftops */
      c.fillStyle = shade(realm.deep, -0.45);
      for (i = 0; i < 8; i++) {
        x = i * 56 - 12;
        var hgt = 130 + ((i * 53) % 90);
        c.beginPath();
        c.moveTo(x, H * 0.62);
        c.lineTo(x + 28, H * 0.62 - hgt * 0.32);
        c.lineTo(x + 62, H * 0.62);
        c.closePath();
        c.fill();
        c.fillRect(x + 6, H * 0.62, 50, 60);
      }
    } else if (realm.motif === 'bells') {
      for (i = 0; i < 6; i++) {
        x = 40 + ((i * 83) % (W - 80));
        y = 70 + ((i * 121) % 260);
        var bs = 22 + (i % 3) * 10;
        c.strokeStyle = rgba('#2c5a66', 0.7);
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, y - bs * 0.8); c.stroke();
        c.save();
        c.globalAlpha = 0.55;
        c.translate(x, y);
        drawFoeShape(c, 'bell', bs * 1.6, '#2f6b78');
        c.restore();
      }
      for (i = 0; i < 40; i++) {
        x = (i * 47) % W;
        y = H * 0.55 + ((i * 89) % 320);
        c.fillStyle = rgba('#9fe6f0', 0.10 + (i % 5) * 0.02);
        c.beginPath(); c.arc(x, y, 2 + (i % 4) * 1.6, 0, TAU); c.fill();
      }
      c.fillStyle = rgba('#0a2c38', 0.7);
      for (i = 0; i < 7; i++) {
        x = i * 60 - 10;
        c.fillRect(x, H * 0.60, 26, H * 0.4);
      }
    } else if (realm.motif === 'stones') {
      for (i = 0; i < 9; i++) {
        x = 18 + ((i * 67) % (W - 36));
        var top = 200 + ((i * 59) % 180);
        var wid = 20 + (i % 4) * 9;
        c.save();
        c.translate(x, H * 0.66);
        c.rotate((((i * 31) % 20) - 10) / 90);
        c.fillStyle = shade(realm.deep, 0.12 + (i % 3) * 0.06);
        rr(c, -wid / 2, -top, wid, top, wid * 0.35);
        c.fill();
        c.fillStyle = rgba('#000000', 0.3);
        rr(c, -wid / 2, -top, wid * 0.36, top, wid * 0.3);
        c.fill();
        c.restore();
      }
      for (i = 0; i < 70; i++) {
        x = (i * 53) % W;
        y = H * 0.45 + ((i * 71) % 400);
        c.fillStyle = rgba('#ff9a45', 0.05 + (i % 6) * 0.02);
        c.fillRect(x, y, 2, 2);
      }
    } else if (realm.motif === 'shards') {
      for (i = 0; i < 16; i++) {
        x = 10 + ((i * 79) % (W - 20));
        y = 120 + ((i * 137) % 480);
        var sz = 18 + (i % 5) * 12;
        c.save();
        c.translate(x, y);
        c.rotate(((i * 41) % 60) / 30);
        c.globalAlpha = 0.35 + (i % 4) * 0.1;
        c.fillStyle = i % 2 ? '#2a3c58' : '#3a5478';
        c.beginPath();
        c.moveTo(0, -sz); c.lineTo(sz * 0.5, sz * 0.2); c.lineTo(-sz * 0.34, sz * 0.7);
        c.closePath(); c.fill();
        c.fillStyle = rgba('#c9f0ff', 0.4);
        c.beginPath();
        c.moveTo(0, -sz); c.lineTo(sz * 0.16, sz * 0.1); c.lineTo(-sz * 0.1, sz * 0.2);
        c.closePath(); c.fill();
        c.restore();
      }
      c.fillStyle = rgba('#8fd8ff', 0.08);
      for (i = 0; i < 12; i++) c.fillRect(0, H * 0.62 + i * 18, W, 3);
    } else {
      /* the loom: vertical warp threads and the cut */
      for (i = 0; i < 26; i++) {
        x = 6 + i * 15;
        c.strokeStyle = rgba(i % 3 ? '#5b3a72' : '#8f5aa8', 0.5);
        c.lineWidth = i % 4 === 0 ? 2 : 1;
        c.beginPath();
        c.moveTo(x, 0);
        for (j = 0; j <= 8; j++) {
          c.lineTo(x + Math.sin((j + i) * 0.9) * 5, j * H / 8);
        }
        c.stroke();
      }
      var cutG = c.createLinearGradient(W * 0.2, 0, W * 0.8, H);
      cutG.addColorStop(0, 'rgba(0,0,0,0)');
      cutG.addColorStop(0.5, rgba('#ff6b9d', 0.45));
      cutG.addColorStop(1, 'rgba(0,0,0,0)');
      c.strokeStyle = cutG;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(W * 0.12, -10);
      c.quadraticCurveTo(W * 0.72, H * 0.4, W * 0.3, H + 10);
      c.stroke();
      for (i = 0; i < 60; i++) {
        x = (i * 91) % W;
        y = (i * 149) % H;
        c.fillStyle = rgba('#ff9ecb', 0.06 + (i % 5) * 0.03);
        c.beginPath(); c.arc(x, y, 1 + (i % 3), 0, TAU); c.fill();
      }
    }
    /* vignette keeps the HUD readable over any realm */
    var vg = c.createRadialGradient(W / 2, H * 0.45, H * 0.24, W / 2, H * 0.45, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,2,8,0.72)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    addTex(scene, 'bg-' + realm.id, cv);
  }

  function bakeLogo(scene) {
    var cw = 348, chh = 172;
    var cv = mkCanvas(cw, chh);
    var c = cv.getContext('2d');
    var i;
    for (i = 0; i < 20; i++) {
      c.strokeStyle = rgba('#7a5aa8', 0.16 + (i % 3) * 0.05);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(14 + i * 16, 8);
      c.lineTo(14 + i * 16, chh - 8);
      c.stroke();
    }
    c.save();
    c.translate(cw / 2, 52);
    drawGlyph(c, 0, 62, '#ffd36b');
    c.restore();
    c.font = 'bold 38px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(201,169,255,0.85)';
    c.shadowBlur = 18;
    c.fillStyle = '#f0e6ff';
    c.fillText('MYTHWEAVE', cw / 2, 122);
    c.shadowBlur = 0;
    c.font = '600 13px ' + FONT;
    c.fillStyle = '#c9a9ff';
    c.fillText('B I N D   ·   C H A I N   ·   U N M A K E', cw / 2, 152);
    addTex(scene, 'logo', cv);
  }

  function bakeParticleTextures(scene) {
    var cv = mkCanvas(16, 16);
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
    addTex(scene, 'p-dot', cv);

    cv = mkCanvas(12, 12);
    c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(6, 0); c.lineTo(9, 6); c.lineTo(6, 12); c.lineTo(3, 6);
    c.closePath(); c.fill();
    addTex(scene, 'p-shard', cv);

    cv = mkCanvas(16, 16);
    c = cv.getContext('2d');
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.4;
    c.beginPath(); c.arc(8, 8, 5.4, 0, TAU); c.stroke();
    addTex(scene, 'p-ring', cv);

    cv = mkCanvas(4, 4);
    c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 4, 4);
    addTex(scene, 'px', cv);

    cv = mkCanvas(24, 24);
    c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(12, 12, 11, 0, TAU);
    c.fill();
    addTex(scene, 'p-disc', cv);

    cv = mkCanvas(20, 20);
    c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * TAU - Math.PI / 2;
      var r = i % 2 ? 4 : 9.5;
      c[i ? 'lineTo' : 'moveTo'](10 + Math.cos(a) * r, 10 + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    addTex(scene, 'p-star', cv);
  }

  /* intent and status icons: one silhouette each, never colour alone */
  function bakeIcon(scene, key, kind, col) {
    var S = 28;
    var cv = mkCanvas(S, S);
    var c = cv.getContext('2d');
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 2.6;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (kind === 'atk') {
      c.beginPath();
      c.moveTo(5, 22); c.lineTo(20, 6);
      c.stroke();
      c.beginPath();
      c.moveTo(16, 4); c.lineTo(24, 3); c.lineTo(23, 11);
      c.closePath(); c.fill();
    } else if (kind === 'guard') {
      c.beginPath();
      c.moveTo(14, 4); c.lineTo(23, 8); c.lineTo(23, 15);
      c.quadraticCurveTo(23, 22, 14, 25);
      c.quadraticCurveTo(5, 22, 5, 15);
      c.lineTo(5, 8);
      c.closePath();
      c.stroke();
    } else if (kind === 'rage') {
      c.beginPath();
      c.moveTo(14, 3); c.lineTo(20, 13); c.lineTo(15, 12); c.lineTo(19, 25);
      c.lineTo(8, 13); c.lineTo(13, 14);
      c.closePath(); c.fill();
    } else if (kind === 'hex') {
      c.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * TAU - Math.PI / 2;
        c[i ? 'lineTo' : 'moveTo'](14 + Math.cos(a) * 10, 14 + Math.sin(a) * 10);
      }
      c.closePath();
      c.stroke();
      c.beginPath(); c.arc(14, 14, 3, 0, TAU); c.fill();
    } else if (kind === 'stagger') {
      c.beginPath();
      c.moveTo(6, 6); c.lineTo(13, 13); c.lineTo(8, 16); c.lineTo(22, 23);
      c.stroke();
      c.beginPath(); c.arc(21, 7, 3.4, 0, TAU); c.fill();
    } else if (kind === 'burn') {
      c.beginPath();
      c.moveTo(14, 3);
      c.quadraticCurveTo(22, 12, 18, 19);
      c.quadraticCurveTo(14, 25, 10, 19);
      c.quadraticCurveTo(6, 12, 14, 3);
      c.closePath(); c.fill();
    } else if (kind === 'heal') {
      c.beginPath();
      c.moveTo(14, 4); c.lineTo(14, 24);
      c.moveTo(4, 14); c.lineTo(24, 14);
      c.stroke();
    } else if (kind === 'weak') {
      c.beginPath();
      c.moveTo(5, 9); c.lineTo(23, 9);
      c.moveTo(8, 15); c.lineTo(20, 15);
      c.moveTo(11, 21); c.lineTo(17, 21);
      c.stroke();
    } else if (kind === 'power') {
      c.beginPath();
      c.arc(14, 14, 8, 0, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(14, 8); c.lineTo(14, 20);
      c.moveTo(8, 14); c.lineTo(20, 14);
      c.stroke();
    } else if (kind === 'star') {
      c.beginPath();
      for (var k = 0; k < 10; k++) {
        var ang = k / 10 * TAU - Math.PI / 2;
        var rad = k % 2 ? 5 : 12;
        c[k ? 'lineTo' : 'moveTo'](14 + Math.cos(ang) * rad, 14 + Math.sin(ang) * rad);
      }
      c.closePath(); c.fill();
    } else if (kind === 'lock') {
      c.strokeRect(7, 13, 14, 11);
      c.beginPath();
      c.arc(14, 13, 5, Math.PI, 0);
      c.stroke();
    } else if (kind === 'token') {
      c.beginPath(); c.arc(14, 14, 9, 0, TAU); c.stroke();
      c.beginPath(); c.arc(14, 14, 3.4, 0, TAU); c.fill();
      c.beginPath();
      c.moveTo(14, 5); c.lineTo(14, 23);
      c.moveTo(5, 14); c.lineTo(23, 14);
      c.stroke();
    } else if (kind === 'chev') {
      c.beginPath();
      c.moveTo(17, 5); c.lineTo(9, 14); c.lineTo(17, 23);
      c.stroke();
    } else if (kind === 'gear') {
      c.beginPath(); c.arc(14, 14, 6, 0, TAU); c.stroke();
      for (var t = 0; t < 6; t++) {
        var ta = t / 6 * TAU;
        c.beginPath();
        c.moveTo(14 + Math.cos(ta) * 8, 14 + Math.sin(ta) * 8);
        c.lineTo(14 + Math.cos(ta) * 12, 14 + Math.sin(ta) * 12);
        c.stroke();
      }
    }
    addTex(scene, key, cv);
  }

  /* --------------------------------------------------------------- widgets */
  function txt(scene, x, y, s, size, color, align, bold) {
    var o = scene.add.text(x, y, s, {
      fontFamily: FONT, fontSize: size + 'px', color: color,
      fontStyle: bold === false ? '' : 'bold', align: align || 'left'
    });
    o.setOrigin(align === 'center' ? 0.5 : (align === 'right' ? 1 : 0), 0.5);
    o.setResolution(HIDPI_FACTOR);
    return o;
  }
  function wrapText(scene, x, y, s, size, color, width, align) {
    var o = scene.add.text(x, y, s, {
      fontFamily: FONT, fontSize: size + 'px', color: color, align: align || 'left',
      wordWrap: { width: width, useAdvancedWrap: true }, lineSpacing: 6
    });
    o.setOrigin(align === 'center' ? 0.5 : 0, 0);
    o.setResolution(HIDPI_FACTOR);
    return o;
  }
  function setTx(o, v) {
    if (!o) return;
    v = String(v);
    if (o.text !== v) o.setText(v);
  }
  function setCol(o, v) {
    if (!o || o._mwCol === v) return;
    o._mwCol = v;
    o.setColor(v);
  }
  function setVis(o, v) {
    if (!o || o.visible === v) return;
    o.setVisible(v);
  }
  function setFs(o, size) {
    if (!o || o._mwFs === size) return;
    o._mwFs = size;
    o.setFontSize(size);
  }
  function setTint(o, v) {
    if (!o || o._mwTint === v) return;
    o._mwTint = v;
    o.setTint(v);
  }
  function hexNum(h) { return parseInt(String(h).replace('#', ''), 16); }

  function img(scene, x, y, key) {
    var o = scene.add.image(x, y, key);
    return o;
  }
  function bar(scene, x, y, w, h, bgCol, fgCol) {
    var bgo = scene.add.image(x, y, 'px').setOrigin(0, 0.5).setDisplaySize(w, h).setTint(hexNum(bgCol));
    var fgo = scene.add.image(x + 1, y, 'px').setOrigin(0, 0.5).setDisplaySize(w - 2, h - 2).setTint(hexNum(fgCol));
    return { bg: bgo, fg: fgo, w: w - 2, x: x + 1, set: function (p) {
      p = clamp(p, 0, 1);
      var target = Math.max(p > 0 ? 2 : 0, (w - 2) * p);
      if (Math.abs(fgo.displayWidth - target) > 0.4) fgo.setDisplaySize(target, h - 2);
    } };
  }

  var PANELS = [
    ['pn-hud', 206, 34, C.panel, C.line, 10],
    ['pn-turn', 88, 34, C.panel, C.line, 10],
    ['pn-pause', 52, 48, C.panel2, C.line2, 12],
    ['pn-strip', 366, 34, C.panel, C.line2, 9],
    ['pn-intent', 86, 28, C.panel, C.line, 8],
    ['pn-rail', 118, 72, C.panelLo, C.line, 12],
    ['pn-rail-on', 118, 72, C.panel2, C.amber, 12],
    ['pn-band', 366, 60, C.panel, C.line, 12],
    ['pn-chip', 94, 24, C.panelLo, C.line, 7],
    ['pn-prev', 366, 34, C.panelLo, C.line, 9],
    ['pn-btn', 250, 62, C.panel2, C.violet, 13],
    ['pn-btn-off', 250, 62, '#1b1526', '#33294a', 13],
    ['pn-btn-hot', 250, 62, '#3c2166', C.amber, 13, true],
    ['pn-foot', 112, 26, C.panelLo, C.line, 7],
    ['pn-foot2', 130, 26, C.panelLo, C.line, 7],
    ['pn-row', 358, 76, C.panel, C.line2, 12],
    ['pn-row-done', 358, 76, '#17251c', '#4f8a5c', 12],
    ['pn-row-off', 358, 76, '#120e1a', '#2a2238', 12],
    ['pn-fbtn1', 250, 62, C.panel2, C.violet, 13],
    ['pn-fbtn2', 174, 62, C.panel2, C.violet, 13],
    ['pn-fbtn3', 114, 62, C.panel2, C.violet, 13],
    ['pn-fbtn2-off', 174, 62, '#1b1526', '#33294a', 13],
    ['pn-fbtn3-off', 114, 62, '#1b1526', '#33294a', 13],
    ['pn-back', 76, 46, C.panel, C.line, 11],
    ['pn-cell', 176, 66, C.panelLo, C.line, 11],
    ['pn-cell-on', 176, 66, '#2a1c42', C.amber, 11],
    ['pn-cell-off', 176, 66, '#120e1a', '#241d33', 11],
    ['pn-inspect', 366, 152, C.panelLo, C.line2, 13],
    ['pn-story', 350, 424, C.panel, C.line2, 16],
    ['pn-result', 330, 330, '#140d20', C.line2, 16],
    ['pn-banner', 234, 78, C.panel, C.violet, 14, true],
    ['brk-118', 118, 240, 'rgba', C.amber, 12],
    ['brk-168', 168, 240, 'rgba', C.amber, 12],
    ['brk-200', 200, 240, 'rgba', C.amber, 12]
  ];

  function bakeBracket(scene, key, w, h) {
    var pad = 4;
    var cv = mkCanvas(w + pad * 2, h + pad * 2);
    var c = cv.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,0.045)';
    rr(c, pad, pad, w, h, 12);
    c.fill();
    c.strokeStyle = C.amber;
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    var s = 22;
    var corners = [[pad, pad, 1, 1], [pad + w, pad, -1, 1], [pad, pad + h, 1, -1], [pad + w, pad + h, -1, -1]];
    corners.forEach(function (q) {
      c.beginPath();
      c.moveTo(q[0] + s * q[2], q[1]);
      c.lineTo(q[0], q[1]);
      c.lineTo(q[0], q[1] + s * q[3]);
      c.stroke();
    });
    addTex(scene, key, cv);
  }

  var CARD_ICONS = { atk: C.amber, guard: C.ice, heal: C.mint, power: '#ffb0e0', burn: C.ember, weak: C.violet };

  function cardFace(card) {
    var chips = [];
    var icon = 'atk';
    var value = '';
    if (card.d) {
      value = (card.hits > 1) ? (card.d + 'x' + card.hits) : String(card.d);
      if (card.ig) chips.push('PIERCE');
    } else if (card.ad) {
      icon = 'atk'; value = String(card.ad); chips.push('ALL');
    } else if (card.dr) {
      icon = 'atk'; value = String(card.dr); chips.push('DRAIN');
    } else if (card.b) {
      icon = 'guard'; value = String(card.b);
    } else if (card.h) {
      icon = 'heal'; value = String(card.h);
    } else if (card.p) {
      icon = 'power'; value = '+' + card.p;
    }
    if (card.d && card.ad) chips.push('ALL ' + card.ad);
    if (card.b && icon !== 'guard') chips.push('BLK ' + card.b);
    if (card.h && icon !== 'heal') chips.push('HP ' + card.h);
    if (card.p && icon !== 'power') chips.push('PWR +' + card.p);
    if (card.bu) chips.push('BURN ' + card.bu);
    if (card.w) chips.push('WEAK ' + card.w);
    if (card.wa) chips.push('WEAK ALL');
    if (card.chain) chips.push('+' + card.chain + '/CHAIN');
    if (card.sd) chips.push('-' + card.sd + ' HP');
    return { icon: icon, value: value, chips: chips.slice(0, 2) };
  }

  /* ----------------------------------------------------------------- scene */
  var PlayScene = {
    key: 'Play',

    create: function () {
      // setOrigin(0, 0) is the other half of the retina zoom: a zoomed camera
      // transforms about its origin, so with the default centred origin the design
      // box lands at -W*(f-1)/2 and nothing is on screen. Origin (0,0) keeps world
      // coordinates, scrollFactor-0 UI and absolute setScroll() all in design space.
      this.cameras.main.setZoom(HIDPI_FACTOR); this.cameras.main.setOrigin(0, 0);
      app.scene = this;
      this.acc = 0;
      this.time0 = 0;
      this.dimmed = false;
      this.bgKey = '';
      this.transient = null;
      this.transientQueue = [];
      this.banner = null;
      this.flashV = 0;
      this.flashCol = '#ffffff';
      this.holdCard = -1;
      this.holdTime = 0;
      this.previewCard = null;
      this.foeView = [{}, {}, {}].map(function (_, i) {
        return { hit: 0, anim: '', animT: 0, phase: i * 1.7, offY: 0, scale: 1, alpha: 1 };
      });
      this.railPulse = [0, 0, 0];

      kit.loader.show('MYTHWEAVE');
      kit.loader.progress(0.04);
      this.bakeAll();
      kit.loader.progress(0.7);
      this.makeObjects();
      kit.loader.progress(0.82);
      loadSave();
      this.applyForce();
      var self = this;
      kit.audio.preload(SFX_KEYS).then(function () {
        if (!app.scene) return;
        app.ready = true;
        kit.loader.progress(1);
        kit.loader.hide();
        self.onModeChanged();
      });
      kit.registerPWA();
      this.onModeChanged();
    },

    bakeAll: function () {
      var scene = this;
      bakeParticleTextures(scene);
      PANELS.forEach(function (p) {
        if (p[0].indexOf('brk-') === 0) bakeBracket(scene, p[0], p[1], p[2]);
        else panelTexture(scene, p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
      });
      [['ic-atk', 'atk', '#ff8080'], ['ic-guard', 'guard', C.ice], ['ic-rage', 'rage', C.ember],
        ['ic-hex', 'hex', '#ff8fd0'], ['ic-stagger', 'stagger', '#ffffff'], ['ic-burn', 'burn', C.ember],
        ['ic-weak', 'weak', C.violet], ['ic-power', 'power', '#ffb0e0'], ['ic-heal', 'heal', C.mint],
        ['ic-star', 'star', C.amber], ['ic-star-off', 'star', '#3a3350'], ['ic-lock', 'lock', C.faint],
        ['ic-token', 'token', C.amber], ['ic-chev', 'chev', C.text], ['ic-gear', 'gear', C.text],
        ['ic-block', 'guard', C.ice]].forEach(function (row) {
        bakeIcon(scene, row[0], row[1], row[2]);
      });
      Object.keys(D.REALMS).forEach(function (id) { bakeRealmBg(scene, id); });
      Object.keys(D.FOES).forEach(function (id) { bakeFoeTexture(scene, id); });
      Object.keys(D.SPIRITS).forEach(function (id) {
        bakePortrait(scene, id);
        bakeCard(scene, id, false);
        bakeCard(scene, id, true);
      });
      bakeEmptyCard(scene);
      bakeWeaverSheet(scene);
      bakeLogo(scene);
      [['wv-idle', 0, 1, 2.5, -1], ['wv-weave', 2, 3, 9, 0], ['wv-guard', 4, 5, 9, 0],
        ['wv-hurt', 6, 7, 9, 0], ['wv-cheer', 8, 9, 4, -1]].forEach(function (a) {
        if (scene.anims.exists(a[0])) return;
        scene.anims.create({
          key: a[0],
          frames: scene.anims.generateFrameNumbers('weaver', { start: a[1], end: a[2] }),
          frameRate: a[3], repeat: a[4]
        });
      });
    },

    makeObjects: function () {
      var scene = this;
      var i, j;
      this.bg = img(this, W / 2, H / 2, 'bg-lantern').setDepth(0);

      /* ---- ambient loom motes, always alive, cheap */
      this.pAmbient = this.add.particles(0, 0, 'p-dot', {
        x: { min: 0, max: W }, y: { min: 60, max: H },
        speedY: { min: -22, max: -6 }, speedX: { min: -8, max: 8 },
        lifespan: 4600, frequency: 320, quantity: 1,
        scale: { start: 0.42, end: 0 }, alpha: { start: 0.5, end: 0 },
        blendMode: 'ADD', tint: 0xc9a9ff
      }).setDepth(2);

      this.pHit = this.add.particles(0, 0, 'p-dot', {
        speed: { min: 60, max: 230 }, lifespan: 430, quantity: 1,
        scale: { start: 0.95, end: 0 }, alpha: { start: 1, end: 0 },
        gravityY: 240, blendMode: 'ADD', emitting: false
      }).setDepth(45);
      this.pShatter = this.add.particles(0, 0, 'p-shard', {
        speed: { min: 90, max: 330 }, lifespan: 760, quantity: 1,
        scale: { start: 1.1, end: 0.2 }, alpha: { start: 1, end: 0 },
        rotate: { start: 0, end: 320 }, gravityY: 420, emitting: false
      }).setDepth(45);
      this.pBloom = this.add.particles(0, 0, 'p-ring', {
        speed: { min: 20, max: 90 }, lifespan: 700, quantity: 1,
        scale: { start: 0.35, end: 1.25 }, alpha: { start: 0.9, end: 0 },
        blendMode: 'ADD', emitting: false
      }).setDepth(45);
      this.pWeave = this.add.particles(0, 0, 'p-star', {
        speed: { min: 130, max: 380 }, lifespan: 950, quantity: 1,
        scale: { start: 1.15, end: 0 }, alpha: { start: 1, end: 0 },
        rotate: { start: 0, end: 180 }, gravityY: -30, blendMode: 'ADD', emitting: false
      }).setDepth(45);
      this.pSpark = this.add.particles(0, 0, 'p-dot', {
        speed: { min: 10, max: 60 }, lifespan: 900, quantity: 1,
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 },
        blendMode: 'ADD', emitting: false
      }).setDepth(45);

      /* ---- battle: hud ---- */
      this.bt = {};
      var b = this.bt;
      b.all = [];
      function reg(o, depth) { o.setDepth(depth === undefined ? 12 : depth); b.all.push(o); return o; }
      b.hudPanel = reg(img(this, L.hudChip.x + L.hudChip.w / 2, L.hudChip.y + 17, 'pn-hud'));
      b.hudText = reg(txt(this, L.hudChip.x + 14, L.hudChip.y + 17, '', 14, C.text));
      b.turnPanel = reg(img(this, L.turnChip.x + L.turnChip.w / 2, L.turnChip.y + 17, 'pn-turn'));
      b.turnText = reg(txt(this, L.turnChip.x + L.turnChip.w / 2, L.turnChip.y + 17, 'TURN 1', 14, C.violet, 'center'));

      b.foes = [];
      for (i = 0; i < 3; i++) {
        var slot = {};
        slot.bracket = reg(img(this, 0, 0, 'brk-118'));
        slot.sprite = reg(img(this, 0, 0, 'foe-mote'));
        slot.intentPanel = reg(img(this, 0, 0, 'pn-intent'));
        slot.intentIcon = reg(img(this, 0, 0, 'ic-atk'));
        slot.intentText = reg(txt(this, 0, 0, '', 15, C.text, 'left'));
        slot.name = reg(txt(this, 0, 0, '', 14, C.text, 'center'));
        slot.hp = bar(this, 0, 0, 100, 12, '#2a1c2c', '#e0556b');
        reg(slot.hp.bg); reg(slot.hp.fg);
        slot.hpText = reg(txt(this, 0, 0, '', 13, '#ffdde3', 'center', false));
        slot.brk = bar(this, 0, 0, 100, 6, '#221a2e', '#9fd4ff');
        reg(slot.brk.bg); reg(slot.brk.fg);
        slot.statIcons = [];
        slot.statTexts = [];
        for (j = 0; j < 3; j++) {
          slot.statIcons.push(reg(img(this, 0, 0, 'ic-burn').setScale(0.62)));
          slot.statTexts.push(reg(txt(this, 0, 0, '', 14, C.text, 'left')));
        }
        slot.preview = reg(txt(this, 0, 0, '', 20, C.amber, 'center'), 13);
        b.foes.push(slot);
      }

      /* ---- party rail ---- */
      b.rail = [];
      for (i = 0; i < 3; i++) {
        var x = L.rail.xs[i];
        var r = {};
        r.panel = reg(img(this, x + L.rail.w / 2, L.rail.y + L.rail.h / 2, 'pn-rail'));
        r.portrait = reg(img(this, x + 34, L.rail.y + 36, 'por-weaver').setScale(44 / 96));
        r.name = reg(txt(this, x + 62, L.rail.y + 20, '', 14, C.text));
        r.lv = reg(txt(this, x + 62, L.rail.y + 40, '', 13, C.dim, 'left', false));
        r.gauge = bar(this, x + 62, L.rail.y + 58, 48, 8, '#241b36', C.amber);
        reg(r.gauge.bg); reg(r.gauge.fg);
        r.star = reg(img(this, x + 102, L.rail.y + 18, 'ic-star').setScale(0.62));
        b.rail.push(r);
      }

      /* ---- thread band ---- */
      b.bandPanel = reg(img(this, L.band.x + L.band.w / 2, L.band.y + L.band.h / 2, 'pn-band'));
      b.weaver = reg(this.add.sprite(44, 410, 'weaver').setScale(48 / 72));
      b.hp = bar(this, 76, 390, 296, 18, '#2a1c2c', '#4fd18b');
      reg(b.hp.bg); reg(b.hp.fg);
      b.hpText = reg(txt(this, 224, 390, '', 14, '#062418', 'center'));
      b.chips = [];
      var chipDefs = [['ic-block', C.ice], ['ic-power', '#ffb0e0'], ['ic-hex', '#ff8fd0']];
      for (i = 0; i < 3; i++) {
        var cx = 76 + i * 100;
        var ch = {};
        ch.panel = reg(img(this, cx + 47, 414, 'pn-chip'));
        ch.icon = reg(img(this, cx + 16, 414, chipDefs[i][0]).setScale(0.6));
        ch.text = reg(txt(this, cx + 32, 414, '0', 14, chipDefs[i][1]));
        b.chips.push(ch);
      }

      /* ---- preview strip ---- */
      b.prevPanel = reg(img(this, L.preview.x + L.preview.w / 2, L.preview.y + 17, 'pn-prev'));
      b.prevLeft = reg(txt(this, L.preview.x + 12, L.preview.y + 17, '', 14, C.dim, 'left', false));
      b.prevRight = reg(txt(this, L.preview.x + L.preview.w - 12, L.preview.y + 17, '', 15, C.amber, 'right'));

      /* ---- hand ---- */
      b.cards = [];
      for (i = 0; i < 5; i++) {
        var rct = handRect(i);
        var cd = {};
        cd.img = reg(img(this, rct.x + rct.w / 2, rct.y + rct.h / 2, 'card-empty'));
        cd.icon = reg(img(this, rct.x + 16, rct.y + 82, 'ic-atk').setScale(0.66));
        cd.value = reg(txt(this, rct.x + rct.w - 8, rct.y + 82, '', 19, C.text, 'right'));
        cd.chip0 = reg(txt(this, rct.x + rct.w / 2, rct.y + 104, '', 12, C.dim, 'center', false));
        cd.chip1 = reg(txt(this, rct.x + rct.w / 2, rct.y + 119, '', 12, C.dim, 'center', false));
        cd.name = reg(txt(this, rct.x + rct.w / 2, rct.y + 138, '', 11, C.text, 'center', false));
        cd.name.setWordWrapWidth(62);
        cd.name.setAlign('center');
        cd.name.setLineSpacing(-2);
        cd.order = reg(txt(this, rct.x + rct.w - 12, rct.y + 30, '', 15, '#150e22', 'center'));
        cd.orderBg = reg(img(this, rct.x + rct.w - 12, rct.y + 30, 'p-disc').setScale(0.92));
        cd.order.setDepth(13);
        b.cards.push(cd);
      }

      /* ---- resolve ---- */
      b.btnPanel = reg(img(this, L.resolve.x + L.resolve.w / 2, L.resolve.y + L.resolve.h / 2, 'pn-btn'));
      b.btnText = reg(txt(this, L.resolve.x + L.resolve.w / 2, L.resolve.y + L.resolve.h / 2, '', 17, C.text, 'center'));

      /* ---- footer ---- */
      b.footPanels = [
        reg(img(this, 68, L.foot.y + 13, 'pn-foot')),
        reg(img(this, 195, L.foot.y + 13, 'pn-foot2')),
        reg(img(this, 322, L.foot.y + 13, 'pn-foot'))
      ];
      b.deckText = reg(txt(this, 68, L.foot.y + 13, '', 13, C.dim, 'center', false));
      b.nextText = reg(txt(this, 195, L.foot.y + 13, '', 13, C.violet, 'center', false));
      b.pileText = reg(txt(this, 322, L.foot.y + 13, '', 13, C.dim, 'center', false));

      /* ---- pause button, shared by every screen ---- */
      this.pausePanel = img(this, L.pauseBtn.x + 26, L.pauseBtn.y + 24, 'pn-pause').setDepth(24);
      this.pauseIcon = img(this, L.pauseBtn.x + 26, L.pauseBtn.y + 24, 'ic-gear').setDepth(24).setScale(0.85);

      /* ---- menu shell ---- */
      this.mn = {};
      var m = this.mn;
      m.all = [];
      function mreg(o, depth) { o.setDepth(depth === undefined ? 22 : depth); m.all.push(o); return o; }
      m.logo = mreg(img(this, W / 2, 200, 'logo'));
      m.title = mreg(txt(this, W / 2, L.menuTitle, '', 24, C.violet, 'center'));
      m.sub = mreg(txt(this, W / 2, L.menuSub, '', 14, C.dim, 'center', false));
      m.rows = [];
      for (i = 0; i < 6; i++) {
        var rr2 = rowRect(i);
        var row = {};
        row.panel = mreg(img(this, rr2.x + rr2.w / 2, rr2.y + rr2.h / 2, 'pn-row'));
        row.icon = mreg(img(this, rr2.x + 44, rr2.y + rr2.h / 2, 'foe-mote').setScale(0.44));
        row.title = mreg(txt(this, rr2.x + 84, rr2.y + 24, '', 16, C.text));
        row.sub = mreg(txt(this, rr2.x + 84, rr2.y + 48, '', 13, C.dim, 'left', false));
        row.tag = mreg(txt(this, rr2.x + rr2.w - 14, rr2.y + 24, '', 13, C.faint, 'right', false));
        row.stars = [];
        for (j = 0; j < 3; j++) {
          row.stars.push(mreg(img(this, rr2.x + rr2.w - 62 + j * 20, rr2.y + 52, 'ic-star').setScale(0.52)));
        }
        m.rows.push(row);
      }
      m.btns = [];
      for (i = 0; i < 3; i++) {
        var bt2 = {};
        bt2.panel = mreg(img(this, 0, 0, 'pn-fbtn1'));
        bt2.text = mreg(txt(this, 0, 0, '', 16, C.text, 'center'));
        m.btns.push(bt2);
      }
      m.backPanel = mreg(img(this, L.back.x + 38, L.back.y + 23, 'pn-back'));
      m.backIcon = mreg(img(this, L.back.x + 24, L.back.y + 23, 'ic-chev').setScale(0.8));
      m.backText = mreg(txt(this, L.back.x + 44, L.back.y + 23, 'BACK', 13, C.dim, 'left', false));
      m.foot = mreg(txt(this, W / 2, 790, '', 13, C.faint, 'center', false));

      /* ---- roster grid ---- */
      m.cells = [];
      for (i = 0; i < 12; i++) {
        var cx2 = 12 + (i % 2) * 190;
        var cy2 = 150 + Math.floor(i / 2) * 70;
        var cell = {};
        cell.panel = mreg(img(this, cx2 + 88, cy2 + 33, 'pn-cell'));
        cell.portrait = mreg(img(this, cx2 + 32, cy2 + 33, 'por-weaver').setScale(46 / 96));
        cell.name = mreg(txt(this, cx2 + 62, cy2 + 20, '', 15, C.text));
        cell.sub = mreg(txt(this, cx2 + 62, cy2 + 40, '', 13, C.dim, 'left', false));
        cell.pips = [];
        for (j = 0; j < 3; j++) {
          cell.pips.push(mreg(img(this, cx2 + 64 + j * 13, cy2 + 55, 'px').setDisplaySize(9, 9)));
        }
        cell.order = mreg(txt(this, cx2 + 164, cy2 + 20, '', 16, C.amber, 'center'));
        m.cells.push(cell);
      }
      m.inspectPanel = mreg(img(this, W / 2, 654, 'pn-inspect'));
      m.inspectName = mreg(txt(this, 28, 596, '', 16, C.violet));
      m.inspectRole = mreg(txt(this, 362, 596, '', 13, C.dim, 'right', false));
      m.inspectLines = [];
      for (i = 0; i < 4; i++) {
        var line = {};
        line.left = mreg(txt(this, 28, 622 + i * 24, '', 14, C.text, 'left', false));
        line.right = mreg(txt(this, 362, 622 + i * 24, '', 13, C.dim, 'right', false));
        m.inspectLines.push(line);
      }
      m.inspectFoot = mreg(txt(this, 28, 718, '', 13, C.faint, 'left', false));

      /* ---- story ---- */
      this.st = {};
      var s = this.st;
      s.all = [];
      function sreg(o, depth) { o.setDepth(depth === undefined ? 32 : depth); s.all.push(o); return o; }
      s.panel = sreg(img(this, W / 2, 372, 'pn-story'));
      s.glyph = sreg(img(this, W / 2, 250, 'por-weaver').setScale(96 / 96));
      s.title = sreg(txt(this, W / 2, 348, '', 20, C.text, 'center'));
      s.body = sreg(wrapText(this, W / 2, 382, '', 15, C.dim, 300, 'center'));
      s.hint = sreg(txt(this, W / 2, 640, 'TAP TO CONTINUE', 14, C.faint, 'center', false));
      s.page = sreg(txt(this, W / 2, 668, '', 13, '#4d4160', 'center', false));

      /* ---- result ---- */
      this.rs = {};
      var rsl = this.rs;
      rsl.all = [];
      function rreg(o, depth) { o.setDepth(depth === undefined ? 42 : depth); rsl.all.push(o); return o; }
      rsl.dim = rreg(img(this, W / 2, H / 2, 'px').setDisplaySize(W, H).setTint(0x060409).setAlpha(0.84), 41);
      rsl.panel = rreg(img(this, W / 2, 380, 'pn-result'));
      rsl.title = rreg(txt(this, W / 2, 262, '', 24, C.mint, 'center'));
      rsl.stars = [];
      for (i = 0; i < 3; i++) rsl.stars.push(rreg(img(this, W / 2 - 40 + i * 40, 306, 'ic-star').setScale(1.05)));
      rsl.lines = [];
      for (i = 0; i < 4; i++) rsl.lines.push(rreg(txt(this, W / 2, 348 + i * 26, '', 14, C.dim, 'center', false)));
      rsl.btn1 = rreg(img(this, W / 2, 490, 'pn-fbtn1'));
      rsl.btn1t = rreg(txt(this, W / 2, 490, '', 17, C.text, 'center'));
      rsl.btn2 = rreg(img(this, W / 2, 562, 'pn-fbtn1'));
      rsl.btn2t = rreg(txt(this, W / 2, 562, '', 16, C.dim, 'center'));

      /* ---- transient strip, banner, flash, floaters ---- */
      this.stripPanel = img(this, L.strip.x + L.strip.w / 2, L.strip.y + 17, 'pn-strip').setDepth(52).setVisible(false);
      this.stripText = txt(this, L.strip.x + 14, L.strip.y + 17, '', 14, C.text, 'left', false).setDepth(53).setVisible(false);
      this.bannerPanel = img(this, W / 2, 176, 'pn-banner').setDepth(50).setVisible(false);
      this.bannerTitle = txt(this, W / 2, 158, '', 20, C.text, 'center').setDepth(51).setVisible(false);
      this.bannerSub = txt(this, W / 2, 186, '', 14, C.dim, 'center', false).setDepth(51).setVisible(false);
      this.flashRect = img(this, W / 2, H / 2, 'px').setDisplaySize(W, H).setDepth(60).setAlpha(0);
      this.dimRect = img(this, W / 2, H / 2, 'px').setDisplaySize(W, H).setTint(0x05030a).setDepth(46).setAlpha(0);
      this.floaters = [];
      for (i = 0; i < 18; i++) {
        var fo = txt(this, 0, 0, '', 19, C.text, 'center');
        fo.setDepth(47).setVisible(false);
        fo.setStroke('#120a18', 4);
        this.floaters.push({ o: fo, life: 0 });
      }
    },

    /* ------------------------------------------------------------ vfx impl */
    burst: function (x, y, n, col, kind) {
      var e = kind === 'shatter' ? this.pShatter : (kind === 'bloom' ? this.pBloom :
        (kind === 'weave' ? this.pWeave : (kind === 'spark' ? this.pSpark : this.pHit)));
      e.setParticleTint(hexNum(col));
      e.explode(kit.juice.enabled ? n : Math.max(3, Math.round(n * 0.45)), x, y);
    },
    floatText: function (x, y, text, col) {
      for (var i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        if (f.life > 0) continue;
        f.life = 0.95;
        f.vy = -36;
        f.o.setPosition(x, y);
        setTx(f.o, text);
        setCol(f.o, col);
        f.o.setAlpha(1);
        f.o.setVisible(true);
        return;
      }
      var oldest = this.floaters[0];
      oldest.life = 0.95;
      oldest.vy = -36;
      oldest.o.setPosition(x, y);
      setTx(oldest.o, text);
      setCol(oldest.o, col);
      oldest.o.setAlpha(1);
      oldest.o.setVisible(true);
    },
    flash: function (col, a) {
      if (!kit.juice.enabled) a *= 0.4;
      this.flashCol = col;
      this.flashV = Math.max(this.flashV, a);
      this.flashRect.setTint(hexNum(col));
    },
    foeHit: function (i, mag) {
      var v = this.foeView[i];
      if (v) v.hit = 0.24;
    },
    foeAnim: function (i, kind) {
      var v = this.foeView[i];
      if (!v) return;
      v.anim = kind;
      v.animT = kind === 'die' ? 0.55 : 0.34;
    },
    weaverAnim: function (kind) {
      var key = kind === 'weave' ? 'wv-weave' : (kind === 'guard' ? 'wv-guard' :
        (kind === 'hurt' ? 'wv-hurt' : (kind === 'cheer' ? 'wv-cheer' : 'wv-idle')));
      if (!this.bt || !this.bt.weaver) return;
      this.bt.weaver.play(key, true);
      this.weaverReturn = key === 'wv-idle' || key === 'wv-cheer' ? 0 : 0.42;
    },
    queueTransient: function (text, seconds, color, kind) {
      var item = { text: text, life: seconds, color: color || C.text, kind: kind || 'event' };
      if (this.transient) {
        if (this.transientQueue.length >= 3) this.transientQueue.shift();
        this.transientQueue.push(item);
      } else this.transient = item;
    },
    showBanner: function (title, sub, color) {
      this.banner = { title: title, sub: sub, color: color || C.violet, life: 1.9, t: 0 };
      sfx('star');
    },

    /* --------------------------------------------------------------- force */
    applyForce: function () {
      if (bootStage !== null) {
        var at = stageToChapterBattle(bootStage);
        for (var c = 0; c <= at.c; c++) {
          var last = c === at.c ? at.b : D.CHAPTERS[c].battles.length;
          for (var b = 0; b < last; b++) {
            if (!save.cleared[battleKey(c, b)]) save.cleared[battleKey(c, b)] = 2;
            var def = battleAt(c, b);
            if (def.reward) bindSpirit(def.reward);
          }
        }
        save.ch = at.c;
        save.tut = 5;
        persist();
        chapterView = at.c;
        bootStage = null;
        startBattle(at.c, at.b);
        if (bootMode === 'battle') bootMode = null;
      }
      if (bootMode !== null) {
        var want = bootMode;
        bootMode = null;
        if (want === 'battle') {
          if (!B) {
            var pick = null;
            for (var cc = 0; cc < D.CHAPTERS.length && !pick; cc++) {
              for (var bb = 0; bb < D.CHAPTERS[cc].battles.length; bb++) {
                if (!isCleared(cc, bb) && battleUnlocked(cc, bb)) { pick = { c: cc, b: bb }; break; }
              }
            }
            if (!pick) pick = { c: 0, b: 0 };
            startBattle(pick.c, pick.b);
          } else setMode('battle');
        } else if (want === 'map') { chapterView = save.ch; setMode('map'); }
        else if (want === 'trials' || want === 'free' || want === 'party' ||
          want === 'title' || want === 'end') {
          if (want === 'party') partyDraft = save.party.slice();
          setMode(want);
        }
      }
    },

    onModeChanged: function () {
      var realm = 'lantern';
      if (mode === 'battle' && B) realm = B.realm;
      else if (mode === 'map' || mode === 'story') realm = chapterOf(chapterView).realm;
      else if (mode === 'end') realm = 'loom';
      var key = 'bg-' + realm;
      if (this.bgKey !== key && this.textures.exists(key)) {
        this.bgKey = key;
        this.bg.setTexture(key);
      }
      if (mode !== 'battle') {
        if (mode === 'end') music('lantern');
        else music(realmOf(realm).music);
      }
      if (mode === 'battle' && this.bt.weaver) this.bt.weaver.play('wv-idle', true);
      if (mode !== 'battle') { this.transient = null; this.transientQueue.length = 0; }
    },

    /* --------------------------------------------------------------- hits */
    resetHits: function () { this.hitCount = 0; },
    hit: function (x, y, w, h, id) {
      if (!this.hitPool) this.hitPool = [];
      var r = this.hitPool[this.hitCount];
      if (!r) { r = { x: 0, y: 0, w: 0, h: 0, id: '' }; this.hitPool.push(r); }
      r.x = x; r.y = y; r.w = w; r.h = h; r.id = id;
      this.hitCount++;
    },
    findHit: function (x, y) {
      for (var i = this.hitCount - 1; i >= 0; i--) {
        var r = this.hitPool[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
      }
      return null;
    },

    /* --------------------------------------------------------------- paint */
    placeRow: function (row, rect) {
      row.panel.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
      row.icon.setPosition(rect.x + 44, rect.y + rect.h / 2);
      row.title.setPosition(rect.x + 84, rect.y + 24);
      row.sub.setPosition(rect.x + 84, rect.y + rect.h - 26);
      row.tag.setPosition(rect.x + rect.w - 14, rect.y + 24);
      for (var j = 0; j < 3; j++) row.stars[j].setPosition(rect.x + rect.w - 60 + j * 20, rect.y + rect.h - 24);
    },
    placeBtn: function (btn, rect, tex) {
      btn.panel.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
      btn.panel.setTexture(tex);
      btn.text.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
    },
    hideRows: function (from) {
      for (var i = from; i < this.mn.rows.length; i++) {
        var r = this.mn.rows[i];
        setVis(r.panel, false); setVis(r.icon, false); setVis(r.title, false);
        setVis(r.sub, false); setVis(r.tag, false);
        for (var j = 0; j < 3; j++) setVis(r.stars[j], false);
      }
    },
    hideBtns: function (from) {
      for (var i = from; i < this.mn.btns.length; i++) {
        setVis(this.mn.btns[i].panel, false);
        setVis(this.mn.btns[i].text, false);
      }
    },
    hideCells: function (from) {
      for (var i = from; i < this.mn.cells.length; i++) {
        var c = this.mn.cells[i];
        setVis(c.panel, false); setVis(c.portrait, false); setVis(c.name, false);
        setVis(c.sub, false); setVis(c.order, false);
        for (var j = 0; j < 3; j++) setVis(c.pips[j], false);
      }
    },
    showRow: function (i, rect, opt) {
      var row = this.mn.rows[i];
      this.placeRow(row, rect);
      row.panel.setTexture(opt.tex || 'pn-row');
      setVis(row.panel, true);
      if (opt.icon) { row.icon.setTexture(opt.icon); row.icon.setScale(opt.iconScale || 0.44); setVis(row.icon, true); }
      else setVis(row.icon, false);
      setTx(row.title, opt.title || '');
      setCol(row.title, opt.titleCol || C.text);
      setVis(row.title, true);
      setTx(row.sub, opt.sub || '');
      setCol(row.sub, opt.subCol || C.dim);
      setVis(row.sub, !!opt.sub);
      setTx(row.tag, opt.tag || '');
      setCol(row.tag, opt.tagCol || C.faint);
      setVis(row.tag, !!opt.tag);
      for (var j = 0; j < 3; j++) {
        var on = opt.stars !== undefined && j < opt.stars;
        row.stars[j].setTexture(on ? 'ic-star' : 'ic-star-off');
        setVis(row.stars[j], opt.stars !== undefined);
      }
      if (opt.id) { this.hit(rect.x, rect.y, rect.w, rect.h, opt.id); this.rowIds.push(opt.id); }
    },
    showBtn: function (i, rect, tex, label, col, id) {
      var btn = this.mn.btns[i];
      this.placeBtn(btn, rect, tex);
      setVis(btn.panel, true);
      setTx(btn.text, label);
      setCol(btn.text, col || C.text);
      setVis(btn.text, true);
      if (id) { this.hit(rect.x, rect.y, rect.w, rect.h, id); this.rowIds.push(id); }
    },
    setBack: function (on, label) {
      setVis(this.mn.backPanel, on);
      setVis(this.mn.backIcon, on);
      setVis(this.mn.backText, on);
      if (on) {
        setTx(this.mn.backText, label || 'BACK');
        this.hit(L.back.x, L.back.y, L.back.w + 10, L.back.h + 6, 'back');
      }
    },

    paintBattleGroup: function (on) {
      var b = this.bt;
      if (this._btOn === on) return;
      this._btOn = on;
      for (var i = 0; i < b.all.length; i++) b.all[i].setVisible(on);
    },
    paintMenuGroup: function (on) {
      if (this._mnOn === on) return;
      this._mnOn = on;
      for (var i = 0; i < this.mn.all.length; i++) this.mn.all[i].setVisible(on);
    },
    paintStoryGroup: function (on) {
      if (this._stOn === on) return;
      this._stOn = on;
      for (var i = 0; i < this.st.all.length; i++) this.st.all[i].setVisible(on);
    },
    paintResultGroup: function (on) {
      if (this._rsOn === on) return;
      this._rsOn = on;
      for (var i = 0; i < this.rs.all.length; i++) this.rs.all[i].setVisible(on);
    },

    paintBattle: function (dt) {
      var b = this.bt, i, j;
      this.paintBattleGroup(true);
      var count = B.foes.length;
      var target = B.foes[B.target];
      var preview = previewChain(B);
      var romans = ['I', 'II', 'III', 'IV', 'V'];
      var label = B.kind === 'trial' ? 'TRIAL' : (B.kind === 'free' ? 'FREE' :
        romans[B.ch] + '-' + (B.bi + 1));
      setTx(b.hudText, label + '   ' + B.name);
      setTx(b.turnText, 'TURN ' + B.turn);
      if (B.waves) setTx(b.turnText, 'WAVE ' + (B.wave + 1) + '/' + B.waves.length);

      /* foes */
      for (i = 0; i < 3; i++) {
        var slot = b.foes[i];
        var live = i < count;
        var f = live ? B.foes[i] : null;
        if (!live) {
          setVis(slot.bracket, false); setVis(slot.sprite, false);
          setVis(slot.intentPanel, false); setVis(slot.intentIcon, false);
          setVis(slot.intentText, false); setVis(slot.name, false);
          setVis(slot.hp.bg, false); setVis(slot.hp.fg, false); setVis(slot.hpText, false);
          setVis(slot.brk.bg, false); setVis(slot.brk.fg, false); setVis(slot.preview, false);
          for (j = 0; j < 3; j++) { setVis(slot.statIcons[j], false); setVis(slot.statTexts[j], false); }
          continue;
        }
        var rect = foeRect(count, i);
        var view = this.foeView[i];
        var cx = rect.x + rect.w / 2;
        var cy = rect.y + L.field.spriteY - L.field.y + view.offY;
        var isTarget = i === B.target && !f.dead;
        slot.bracket.setTexture(count === 1 ? 'brk-200' : (count === 2 ? 'brk-168' : 'brk-118'));
        slot.bracket.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
        setVis(slot.bracket, isTarget);
        slot.sprite.setTexture('foe-' + f.id);
        slot.sprite.setPosition(cx, cy + Math.sin(this.time0 * 1.7 + view.phase) * 4);
        slot.sprite.setScale((count === 3 ? 0.78 : 0.98) * view.scale);
        slot.sprite.setAlpha(f.dead ? view.alpha * 0.28 : view.alpha);
        var tintMode = view.hit > 0 ? 2 : (f.stagger > 0 ? 1 : 0);
        if (view.tintMode !== tintMode) {
          view.tintMode = tintMode;
          if (tintMode === 2) slot.sprite.setTintFill(0xffffff);
          else if (tintMode === 1) { slot.sprite.clearTint(); slot.sprite.setTint(0x9fd4ff); }
          else slot.sprite.clearTint();
        }
        setVis(slot.sprite, true);
        if (f.dead) {
          setVis(slot.intentPanel, false); setVis(slot.intentIcon, false);
          setVis(slot.intentText, false);
          setVis(slot.hp.bg, false); setVis(slot.hp.fg, false); setVis(slot.hpText, false);
          setVis(slot.brk.bg, false); setVis(slot.brk.fg, false); setVis(slot.preview, false);
          setTx(slot.name, 'UNRAVELLED');
          setCol(slot.name, C.faint);
          slot.name.setPosition(cx, rect.y + L.field.nameY - L.field.y);
          setVis(slot.name, true);
          for (j = 0; j < 3; j++) { setVis(slot.statIcons[j], false); setVis(slot.statTexts[j], false); }
          continue;
        }
        /* telegraphed intent */
        var intent = intentOf(B, f);
        var iw = count === 3 ? 78 : 86;
        slot.intentPanel.setPosition(cx, rect.y + 16);
        slot.intentPanel.setScale(iw / 86, 1);
        setVis(slot.intentPanel, true);
        slot.intentIcon.setTexture('ic-' + intent.icon);
        slot.intentIcon.setPosition(cx - iw / 2 + 16, rect.y + 16);
        slot.intentIcon.setScale(0.66);
        setVis(slot.intentIcon, true);
        slot.intentText.setPosition(cx - iw / 2 + 30, rect.y + 16);
        setTx(slot.intentText, intent.s);
        setCol(slot.intentText, intent.c);
        setFs(slot.intentText, count === 3 ? 13 : 15);
        setVis(slot.intentText, true);
        /* name, health, break */
        slot.name.setPosition(cx, rect.y + L.field.nameY - L.field.y);
        setTx(slot.name, f.name);
        setCol(slot.name, C.text);
        setFs(slot.name, count === 3 ? 12 : 14);
        setVis(slot.name, true);
        var bw = rect.w - 16;
        slot.hp.bg.setPosition(rect.x + 8, rect.y + L.field.hpY - L.field.y);
        slot.hp.bg.setDisplaySize(bw, 12);
        slot.hp.fg.setPosition(rect.x + 9, rect.y + L.field.hpY - L.field.y);
        slot.hp.w = bw - 2;
        var hpTarget = Math.max(2, (bw - 2) * clamp(f.hp / f.maxhp, 0, 1));
        slot.hp.fg.setDisplaySize(hpTarget, 10);
        setVis(slot.hp.bg, true); setVis(slot.hp.fg, true);
        slot.hpText.setPosition(cx, rect.y + L.field.hpY - L.field.y);
        setTx(slot.hpText, f.hp + '/' + f.maxhp);
        setVis(slot.hpText, true);
        var brkW = Math.round(bw * 0.62);
        slot.brk.bg.setPosition(cx - brkW / 2, rect.y + L.field.brkY - L.field.y);
        slot.brk.bg.setDisplaySize(brkW, 6);
        slot.brk.fg.setPosition(cx - brkW / 2 + 1, rect.y + L.field.brkY - L.field.y);
        slot.brk.fg.setDisplaySize(Math.max(2, (brkW - 2) * clamp(f.brk / f.brkMax, 0, 1)), 4);
        setTint(slot.brk.fg, f.stagger > 0 ? 0xffffff : 0x9fd4ff);
        setVis(slot.brk.bg, true); setVis(slot.brk.fg, true);
        /* status row, at most three, icon plus count */
        var stats = [];
        if (f.stagger > 0) stats.push(['ic-stagger', 'STAGGER', '#ffffff']);
        if (f.block > 0) stats.push(['ic-block', String(f.block), C.ice]);
        if (f.burn > 0) stats.push(['ic-burn', String(f.burn), C.ember]);
        if (f.weak > 0) stats.push(['ic-weak', String(f.weak), C.violet]);
        if (f.atk > 0) stats.push(['ic-rage', '+' + f.atk, C.ember]);
        stats = stats.slice(0, 3);
        var offs = stats.length === 3 ? [-52, 0, 52] : (stats.length === 2 ? [-30, 30] : [0]);
        for (j = 0; j < 3; j++) {
          if (j < stats.length) {
            slot.statIcons[j].setTexture(stats[j][0]);
            slot.statIcons[j].setPosition(cx + offs[j] - 12, rect.y + L.field.statY - L.field.y);
            setVis(slot.statIcons[j], true);
            slot.statTexts[j].setPosition(cx + offs[j] + 2, rect.y + L.field.statY - L.field.y);
            setTx(slot.statTexts[j], stats[j][1]);
            setCol(slot.statTexts[j], stats[j][2]);
            setFs(slot.statTexts[j], stats[j][1].length > 4 ? 12 : 14);
            setVis(slot.statTexts[j], true);
          } else {
            setVis(slot.statIcons[j], false);
            setVis(slot.statTexts[j], false);
          }
        }
        /* damage preview on the current target */
        var showPreview = B.phase === 'pick' && isTarget && (preview.dmg > 0 || preview.splash > 0);
        if (showPreview) {
          slot.preview.setPosition(cx, cy - 52);
          setTx(slot.preview, '-' + (preview.dmg + preview.splash));
          setVis(slot.preview, true);
        } else if (B.phase === 'pick' && preview.splash > 0 && !isTarget) {
          slot.preview.setPosition(cx, cy - 52);
          setTx(slot.preview, '-' + preview.splash);
          setVis(slot.preview, true);
        } else setVis(slot.preview, false);
        if (B.phase === 'pick') this.hit(rect.x, rect.y, rect.w, rect.h - 40, 'foe' + i);
      }

      /* party rail */
      for (i = 0; i < 3; i++) {
        var r = b.rail[i];
        var id = B.party[i];
        var x = L.rail.xs[i];
        if (!id) {
          setVis(r.panel, false); setVis(r.portrait, false); setVis(r.name, false);
          setVis(r.lv, false); setVis(r.gauge.bg, false); setVis(r.gauge.fg, false);
          setVis(r.star, false);
          continue;
        }
        var sp = spiritOf(id);
        var gauge = B.gauge[id] || 0;
        var ready = gauge >= 100;
        r.panel.setTexture(ready ? 'pn-rail-on' : 'pn-rail');
        setVis(r.panel, true);
        r.portrait.setTexture('por-' + id);
        setVis(r.portrait, true);
        setTx(r.name, sp.short);
        setCol(r.name, sp.col);
        setVis(r.name, true);
        setTx(r.lv, ready ? 'READY' : ('Lv' + (save.lv[id] || 1)));
        setCol(r.lv, ready ? C.amber : C.dim);
        setVis(r.lv, true);
        r.gauge.set(gauge / 100);
        setTint(r.gauge.fg, ready ? 0xffd36b : 0x8f6ac0);
        setVis(r.gauge.bg, true); setVis(r.gauge.fg, true);
        setVis(r.star, ready);
        if (ready) r.star.setScale(0.62 + Math.sin(this.time0 * 5) * 0.07);
        if (B.phase === 'pick' && ready) this.hit(x, L.rail.y, L.rail.w, L.rail.h, 'gauge' + i);
      }

      /* thread band */
      b.hp.set(B.hp / B.maxhp);
      setTx(b.hpText, B.hp + ' / ' + B.maxhp + '  THREAD');
      var chipVals = [
        [String(B.block), B.block > 0 ? C.ice : '#3a3350'],
        ['+' + B.power, B.power > 0 ? '#ffb0e0' : '#3a3350'],
        [B.frail > 0 ? String(B.frail) : '0', B.frail > 0 ? '#ff8fd0' : '#3a3350']
      ];
      for (i = 0; i < 3; i++) {
        setTx(b.chips[i].text, chipVals[i][0]);
        setCol(b.chips[i].text, chipVals[i][1]);
        b.chips[i].icon.setAlpha(chipVals[i][1] === '#3a3350' ? 0.35 : 1);
      }

      /* preview strip: the chain read, plus the held card detail */
      var left = '';
      var right = '';
      var rightCol = C.amber;
      if (this.previewCard) {
        var pc = this.previewCard;
        var m = target ? matchup(pc.elem, pc.cls, target.elem, target.cls) : { total: 1 };
        left = pc.n + '   ' + pc.tag;
        right = m.total > 1.01 ? 'STRONG x' + m.total.toFixed(2) :
          (m.total < 0.99 ? 'WEAK x' + m.total.toFixed(2) : 'EVEN x1.00');
        rightCol = m.total > 1.01 ? C.mint : (m.total < 0.99 ? C.red : C.dim);
      } else if (preview.weave) {
        left = 'WEAVE ART  ' + spiritOf(preview.weave).ult.n;
        right = spiritOf(preview.weave).short;
        rightCol = spiritOf(preview.weave).col;
      } else if (B.sel.length) {
        left = 'CHAIN ' + B.sel.length + '/3' + (preview.bonus ? '   bonus +' + preview.bonus : '');
        var parts = [];
        if (preview.dmg + preview.splash > 0) parts.push((preview.dmg + preview.splash) + ' dmg');
        if (preview.block > 0) parts.push(preview.block + ' blk');
        if (preview.heal > 0) parts.push(preview.heal + ' hp');
        right = parts.join('  ') || 'no damage';
      } else if (B.phase === 'pick') {
        left = target ? ('TARGET   ' + elemOf(target.elem).name + '   ' + classOf(target.cls).name) : '';
        right = '';
      } else {
        left = B.log[B.log.length - 1] || '';
        right = '';
      }
      setTx(b.prevLeft, left);
      setTx(b.prevRight, right);
      setCol(b.prevRight, rightCol);

      /* hand */
      for (i = 0; i < 5; i++) {
        var cd = b.cards[i];
        var rct = handRect(i);
        if (i >= B.handSize) {
          setVis(cd.img, false); setVis(cd.icon, false); setVis(cd.value, false);
          setVis(cd.chip0, false); setVis(cd.chip1, false); setVis(cd.name, false);
          setVis(cd.order, false); setVis(cd.orderBg, false);
          continue;
        }
        var card = B.hand[i];
        if (!card) {
          cd.img.setTexture('card-empty');
          cd.img.setPosition(rct.x + rct.w / 2, rct.y + rct.h / 2);
          cd.img.setAlpha(1);
          setVis(cd.img, true);
          setVis(cd.icon, false); setVis(cd.value, false); setVis(cd.chip0, false);
          setVis(cd.chip1, false); setVis(cd.name, false);
          setVis(cd.order, false); setVis(cd.orderBg, false);
          continue;
        }
        var selIdx = B.sel.indexOf(i);
        var lift = selIdx >= 0 ? L.hand.lift : 0;
        var y = rct.y - lift;
        var face = cardFace(card);
        cd.img.setTexture('card-' + card.s + (selIdx >= 0 ? '-sel' : ''));
        cd.img.setPosition(rct.x + rct.w / 2, y + rct.h / 2);
        cd.img.setAlpha(B.phase === 'pick' ? 1 : 0.68);
        setVis(cd.img, true);
        cd.icon.setTexture('ic-' + face.icon);
        cd.icon.setPosition(rct.x + 17, y + 84);
        setVis(cd.icon, true);
        cd.value.setPosition(rct.x + rct.w - 8, y + 84);
        setTx(cd.value, face.value);
        setCol(cd.value, CARD_ICONS[face.icon] || C.text);
        setVis(cd.value, true);
        cd.chip0.setPosition(rct.x + rct.w / 2, y + 106);
        setTx(cd.chip0, face.chips[0] || '');
        setVis(cd.chip0, !!face.chips[0]);
        cd.chip1.setPosition(rct.x + rct.w / 2, y + 121);
        setTx(cd.chip1, face.chips[1] || '');
        setVis(cd.chip1, !!face.chips[1]);
        cd.name.setPosition(rct.x + rct.w / 2, y + 140);
        setTx(cd.name, card.n);
        setVis(cd.name, true);
        var showOrder = selIdx >= 0;
        cd.orderBg.setPosition(rct.x + rct.w - 13, y + 30);
        setTint(cd.orderBg, hexNum(spiritOf(card.s).col));
        setVis(cd.orderBg, showOrder);
        cd.order.setPosition(rct.x + rct.w - 13, y + 30);
        setTx(cd.order, String(selIdx + 1));
        setVis(cd.order, showOrder);
        if (B.phase === 'pick') this.hit(rct.x, rct.y - L.hand.lift, rct.w, rct.h + L.hand.lift, 'card' + i);
      }

      /* resolve */
      var ready3 = B.sel.length === 3;
      var resolving = B.phase !== 'pick';
      if (resolving) {
        b.btnPanel.setTexture('pn-btn');
        setTx(b.btnText, B.fast ? 'SKIPPING' : 'TAP TO SKIP');
        setCol(b.btnText, C.dim);
        this.hit(L.resolve.x - 20, L.resolve.y - 10, L.resolve.w + 40, L.resolve.h + 20, 'skip');
      } else {
        b.btnPanel.setTexture(ready3 ? (preview.weave ? 'pn-btn-hot' : 'pn-btn') : 'pn-btn-off');
        setTx(b.btnText, ready3 ? (preview.weave ? 'UNLEASH WEAVE ART' : 'RESOLVE CHAIN') :
          ('PICK ' + (3 - B.sel.length) + ' MORE'));
        setCol(b.btnText, ready3 ? C.text : '#6b5f80');
        if (ready3) this.hit(L.resolve.x, L.resolve.y, L.resolve.w, L.resolve.h, 'resolve');
      }

      /* footer */
      var next = peekNext(B);
      setTx(b.deckText, 'DECK ' + B.deck.length);
      setTx(b.nextText, next ? ('NEXT  ' + spiritOf(next.s).short + '  ' + next.n) : 'NEXT  reshuffle');
      setTx(b.pileText, 'USED ' + B.pile.length);

      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintMenu: function () {
      var m = this.mn;
      var i;
      this.paintMenuGroup(true);
      setVis(m.logo, mode === 'title');
      var showInspect = mode === 'party';
      setVis(m.inspectPanel, showInspect);
      setVis(m.inspectName, showInspect);
      setVis(m.inspectRole, showInspect);
      setVis(m.inspectFoot, showInspect);
      for (i = 0; i < 4; i++) {
        setVis(m.inspectLines[i].left, showInspect);
        setVis(m.inspectLines[i].right, showInspect);
      }
      if (mode === 'title') this.paintTitle();
      else if (mode === 'map') this.paintMap();
      else if (mode === 'trials') this.paintTrials();
      else if (mode === 'free') this.paintFree();
      else if (mode === 'party') this.paintParty();
      else if (mode === 'end') this.paintEnd();
    },

    paintTitle: function () {
      var m = this.mn;
      var i;
      setVis(m.title, false);
      setVis(m.sub, false);
      this.hideCells(0);
      var started = clearedCount() > 0 || save.roster.length > 1;
      var items = [
        { title: started ? 'CONTINUE THE WEAVE' : 'BEGIN THE WEAVE',
          sub: started ? ('Chapter ' + (save.ch + 1) + ' of 5   ' + clearedCount() + '/' + TOTAL_BATTLES + ' battles') : 'Chapter one, the Lantern Quarter',
          icon: 'por-weaver', id: 'play' },
        { title: 'TRIALS OF THE WEAVE',
          sub: Object.keys(save.trials).length + ' of ' + D.TRIALS.length + ' cleared   fixed seeds',
          icon: 'ic-token', iconScale: 1.1, id: 'trials' },
        { title: 'FREE BATTLE',
          sub: 'Raise your spirits in any cleared realm', icon: 'foe-mote', iconScale: 0.4, id: 'free' },
        { title: 'SPIRITS',
          sub: save.roster.length + ' of 10 bound   ' + save.tokens + ' ascension tokens',
          icon: 'por-vulmar', id: 'party' }
      ];
      for (i = 0; i < items.length; i++) {
        this.showRow(i, { x: 30, y: 366 + i * 78, w: 330, h: 68 }, {
          tex: 'pn-row', title: items[i].title, sub: items[i].sub,
          icon: items[i].icon, iconScale: items[i].iconScale || 0.46, id: items[i].id
        });
      }
      this.hideRows(items.length);
      this.hideBtns(0);
      this.setBack(false);
      setTx(m.foot, save.best ? ('Best finale run  ' + save.best + ' turns') :
        'Everything here is earned by playing.');
      setVis(m.foot, true);
      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintMap: function () {
      var m = this.mn;
      var ch = chapterOf(chapterView);
      var i;
      this.hideCells(0);
      setTx(m.title, ch.name);
      setCol(m.title, realmOf(ch.realm).accent);
      setVis(m.title, true);
      setTx(m.sub, realmOf(ch.realm).short + '   ' + chapterStars(chapterView) + '/' +
        chapterMaxStars(chapterView) + ' stars');
      setVis(m.sub, true);
      var open = chapterUnlocked(chapterView);
      for (i = 0; i < ch.battles.length && i < 6; i++) {
        var def = ch.battles[i];
        var unlocked = open && battleUnlocked(chapterView, i);
        var st = stars(chapterView, i);
        var kindText = def.kind === 'bond' ? 'Bond fight, optional' :
          (def.kind === 'boss' ? 'BOSS' : 'Story battle');
        this.showRow(i, rowRect(i), {
          tex: st ? 'pn-row-done' : (unlocked ? 'pn-row' : 'pn-row-off'),
          icon: unlocked ? ('foe-' + def.foes[0]) : 'ic-lock',
          iconScale: unlocked ? 0.42 : 0.9,
          title: unlocked ? def.n : 'Locked',
          titleCol: unlocked ? C.text : '#4a4060',
          sub: unlocked ? (kindText + '   ' + def.foes.length + ' foe' + (def.foes.length > 1 ? 's' : '')) :
            'Clear the battle before it',
          subCol: unlocked && def.kind === 'boss' ? C.rose : C.dim,
          stars: unlocked ? st : undefined,
          tag: def.reward && save.roster.indexOf(def.reward) < 0 && unlocked ? 'SPIRIT' : '',
          tagCol: C.amber,
          id: unlocked ? ('node' + i) : null
        });
      }
      this.hideRows(ch.battles.length);
      var canPrev = chapterView > 0;
      var canNext = chapterView < D.CHAPTERS.length - 1 && chapterUnlocked(chapterView + 1);
      this.showBtn(0, footRect(0, 3), canPrev ? 'pn-fbtn3' : 'pn-fbtn3-off', 'PREV',
        canPrev ? C.text : '#5a5070', canPrev ? 'chprev' : null);
      this.showBtn(1, footRect(1, 3), 'pn-fbtn3', 'PARTY', C.text, 'party');
      this.showBtn(2, footRect(2, 3), canNext ? 'pn-fbtn3' : 'pn-fbtn3-off', 'NEXT',
        canNext ? C.text : '#5a5070', canNext ? 'chnext' : null);
      this.hideBtns(3);
      this.setBack(true, 'MENU');
      setTx(m.foot, 'Party  ' + save.party.map(function (id) {
        return spiritOf(id).short + ' Lv' + (save.lv[id] || 1);
      }).join('   '));
      setVis(m.foot, true);
      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintTrials: function () {
      var m = this.mn;
      var i;
      this.hideCells(0);
      setTx(m.title, 'TRIALS OF THE WEAVE');
      setCol(m.title, C.violet);
      setVis(m.title, true);
      setTx(m.sub, 'Fixed seed, fixed waves, one standing rule');
      setVis(m.sub, true);
      for (i = 0; i < D.TRIALS.length; i++) {
        var t = D.TRIALS[i];
        var open = trialUnlocked(t);
        var best = save.trials[t.id];
        this.showRow(i, { x: 16, y: 150 + i * 78, w: 358, h: 70 }, {
          tex: best ? 'pn-row-done' : (open ? 'pn-row' : 'pn-row-off'),
          icon: open ? ('foe-' + t.waves[t.waves.length - 1][0]) : 'ic-lock',
          iconScale: open ? 0.4 : 0.85,
          title: open ? t.name : 'Sealed',
          titleCol: open ? C.text : '#4a4060',
          sub: open ? t.ruleText : ('Clear chapter ' + (t.chapter + 1) + ' to open'),
          tag: best ? ('BEST ' + best) : (open ? 'SEED ' + t.seed : ''),
          tagCol: best ? C.mint : C.faint,
          id: open ? ('trial' + i) : null
        });
      }
      this.hideRows(D.TRIALS.length);
      this.hideBtns(0);
      this.setBack(true, 'MENU');
      setTx(m.foot, 'Ascension tokens  ' + save.tokens + '   first clear of each trial grants one');
      setVis(m.foot, true);
      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintFree: function () {
      var m = this.mn;
      var i;
      this.hideCells(0);
      setTx(m.title, 'FREE BATTLE');
      setCol(m.title, C.mint);
      setVis(m.title, true);
      setTx(m.sub, 'Party level ' + partyLevel() + '   spirits gain experience every win');
      setVis(m.sub, true);
      if (!this.freeRolls) this.freeRolls = {};
      var ids = Object.keys(D.REALMS);
      for (i = 0; i < ids.length; i++) {
        var realm = realmOf(ids[i]);
        var open = i <= save.ch;
        if (open && !this.freeRolls[realm.id]) this.freeRolls[realm.id] = rollFreeEncounter(realm.id);
        var enc = this.freeRolls[realm.id];
        var names = enc ? enc.foes.map(function (fid) { return foeDataOf(fid).name; }).join(', ') : '';
        this.showRow(i, { x: 16, y: 160 + i * 84, w: 358, h: 76 }, {
          tex: open ? 'pn-row' : 'pn-row-off',
          icon: open ? ('foe-' + realm.encounters[0]) : 'ic-lock',
          iconScale: open ? 0.4 : 0.85,
          title: open ? realm.short : 'Sealed',
          titleCol: open ? realmOf(realm.id).accent : '#4a4060',
          sub: open ? names : 'Reach this realm in the campaign',
          tag: open && enc ? ('x' + enc.scale.toFixed(2)) : '',
          id: open ? ('free' + i) : null
        });
      }
      this.hideRows(ids.length);
      this.showBtn(0, footRect(0, 1), 'pn-fbtn1', 'REROLL ENCOUNTERS', C.text, 'reroll');
      this.hideBtns(1);
      this.setBack(true, 'MENU');
      setTx(m.foot, 'Wins  ' + save.freeWins + '   every fifth win grants an ascension token');
      setVis(m.foot, true);
      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintParty: function () {
      var m = this.mn;
      var i, j;
      this.hideRows(0);
      setTx(m.title, 'BIND UP TO THREE');
      setCol(m.title, C.violet);
      setVis(m.title, true);
      setTx(m.sub, 'A purer hand fires more Weave Arts');
      setVis(m.sub, true);
      var list = ['weaver'].concat(D.ORDER);
      for (i = 0; i < list.length && i < 12; i++) {
        var id = list[i];
        var sp = spiritOf(id);
        var have = id === 'weaver' || save.roster.indexOf(id) >= 0;
        var on = partyDraft.indexOf(id) >= 0;
        var cell = m.cells[i];
        var cx = 12 + (i % 2) * 190;
        var cy = 150 + Math.floor(i / 2) * 70;
        cell.panel.setPosition(cx + 88, cy + 33);
        cell.panel.setTexture(have ? (on ? 'pn-cell-on' : 'pn-cell') : 'pn-cell-off');
        setVis(cell.panel, true);
        cell.portrait.setPosition(cx + 32, cy + 33);
        cell.portrait.setTexture('por-' + id);
        cell.portrait.setAlpha(have ? 1 : 0.28);
        setVis(cell.portrait, true);
        cell.name.setPosition(cx + 62, cy + 20);
        setTx(cell.name, have ? sp.short : '???');
        setCol(cell.name, have ? sp.col : '#3d3550');
        setVis(cell.name, true);
        cell.sub.setPosition(cx + 62, cy + 40);
        setTx(cell.sub, have ? ('Lv' + (id === 'weaver' ? 1 : (save.lv[id] || 1)) + '  ' +
          elemOf(sp.elem).name) : 'not yet bound');
        setVis(cell.sub, true);
        for (j = 0; j < 3; j++) {
          cell.pips[j].setPosition(cx + 66 + j * 13, cy + 55);
          setTint(cell.pips[j], j < (id === 'weaver' ? 0 : (save.asc[id] || 0)) ?
            hexNum(sp.col) : 0x332a48);
          setVis(cell.pips[j], have);
        }
        cell.order.setPosition(cx + 164, cy + 20);
        setTx(cell.order, on ? String(partyDraft.indexOf(id) + 1) : '');
        setVis(cell.order, on);
        if (have && id !== 'weaver') this.hit(cx, cy, 176, 66, 'sp' + id);
        else if (id === 'weaver') this.hit(cx, cy, 176, 66, 'inspectweaver');
      }
      this.hideCells(list.length);
      /* inspect panel */
      var isp = spiritOf(inspectId);
      var lv = inspectId === 'weaver' ? 1 : (save.lv[inspectId] || 1);
      var asc = inspectId === 'weaver' ? 0 : (save.asc[inspectId] || 0);
      setTx(m.inspectName, isp.name);
      setCol(m.inspectName, isp.col);
      setTx(m.inspectRole, elemOf(isp.elem).name + '  ' + classOf(isp.cls).name + '  ' + D.ASC_NAME[asc]);
      for (i = 0; i < 3; i++) {
        var card = scaleCard(isp.cards[i], lv, asc);
        setTx(m.inspectLines[i].left, card.n);
        setCol(m.inspectLines[i].left, C.text);
        setTx(m.inspectLines[i].right, card.tag);
      }
      var art = scaleCard(isp.ult, lv, asc);
      setTx(m.inspectLines[3].left, 'WEAVE ART  ' + isp.ult.n);
      setCol(m.inspectLines[3].left, C.amber);
      setTx(m.inspectLines[3].right, art.tag);
      var canA = canAscend(inspectId);
      setTx(m.inspectFoot, inspectId === 'weaver' ? 'The Weaver never leaves the hand.' :
        (asc >= 3 ? 'Ascendant. This bond is complete.' :
          ('Ascend  ' + ascendCost(asc) + ' token' + (ascendCost(asc) > 1 ? 's' : '') +
            ', Lv' + ascendLevelGate(asc) + ' needed   you have ' + save.tokens)));
      this.showBtn(0, { x: 16, y: 748, w: 174, h: 58 },
        partyDraft.length ? 'pn-fbtn2' : 'pn-fbtn2-off',
        partyDraft.length ? ('CONFIRM ' + partyDraft.length + '/3') : 'PICK ONE',
        partyDraft.length ? C.text : '#5a5070', partyDraft.length ? 'confirm' : null);
      this.showBtn(1, { x: 200, y: 748, w: 174, h: 58 }, canA ? 'pn-fbtn2' : 'pn-fbtn2-off',
        'ASCEND', canA ? C.amber : '#5a5070', canA ? 'ascend' : null);
      this.hideBtns(2);
      this.setBack(true, 'BACK');
      setVis(m.foot, false);
      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintEnd: function () {
      var m = this.mn;
      var i;
      setTx(m.title, 'THE WEAVE HOLDS');
      setCol(m.title, C.mint);
      setVis(m.title, true);
      setTx(m.sub, 'Best finale run  ' + (save.best || '-') + ' turns');
      setVis(m.sub, true);
      var list = ['weaver'].concat(D.ORDER);
      for (i = 0; i < list.length && i < 12; i++) {
        var id = list[i];
        var have = id === 'weaver' || save.roster.indexOf(id) >= 0;
        var cell = m.cells[i];
        var cx = 12 + (i % 2) * 190;
        var cy = 170 + Math.floor(i / 2) * 70;
        cell.panel.setPosition(cx + 88, cy + 33);
        cell.panel.setTexture(have ? 'pn-cell' : 'pn-cell-off');
        setVis(cell.panel, true);
        cell.portrait.setPosition(cx + 32, cy + 33);
        cell.portrait.setTexture('por-' + id);
        cell.portrait.setAlpha(have ? 1 : 0.25);
        setVis(cell.portrait, true);
        cell.name.setPosition(cx + 62, cy + 24);
        setTx(cell.name, spiritOf(id).short);
        setCol(cell.name, have ? spiritOf(id).col : '#3d3550');
        setVis(cell.name, true);
        cell.sub.setPosition(cx + 62, cy + 44);
        setTx(cell.sub, have ? (D.ASC_NAME[id === 'weaver' ? 0 : (save.asc[id] || 0)]) : 'unbound');
        setVis(cell.sub, true);
        for (var j = 0; j < 3; j++) setVis(cell.pips[j], false);
        setVis(cell.order, false);
      }
      this.hideCells(list.length);
      this.hideRows(0);
      this.showBtn(0, footRect(0, 1), 'pn-fbtn1', 'RETURN TO THE LOOM', C.text, 'endback');
      this.hideBtns(1);
      this.setBack(false);
      setTx(m.foot, 'Every spirit was story loot. Nothing was sold to you.');
      setVis(m.foot, true);
      this.hit(L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 'pause');
    },

    paintStory: function () {
      var s = this.st;
      this.paintStoryGroup(true);
      var page = story.pages[story.i] || { t: '', x: '' };
      s.glyph.setTexture('por-' + (page.spirit && isKnownSpirit(page.spirit) ? page.spirit : 'weaver'));
      setTx(s.title, page.t);
      setCol(s.title, page.col || C.violet);
      setTx(s.body, page.x);
      setTx(s.page, (story.i + 1) + ' / ' + story.pages.length);
      this.hit(0, 0, W, H, 'story');
    },

    paintResult: function () {
      var r = this.rs;
      this.paintResultGroup(true);
      setTx(r.title, result.title);
      setCol(r.title, result.won ? C.mint : C.red);
      for (var i = 0; i < 3; i++) {
        r.stars[i].setTexture(i < result.stars ? 'ic-star' : 'ic-star-off');
        setVis(r.stars[i], result.won);
      }
      var lines = result.lines.concat(result.earned);
      for (i = 0; i < 4; i++) {
        setTx(r.lines[i], lines[i] || '');
        setCol(r.lines[i], i >= result.lines.length ? C.amber : C.dim);
        setVis(r.lines[i], !!lines[i]);
      }
      setTx(r.btn1t, result.btn);
      this.hit(W / 2 - 125, 460, 250, 62, 'resultok');
      var second = result.won ? '' : 'CHANGE PARTY';
      setTx(r.btn2t, second);
      setVis(r.btn2, !!second);
      setVis(r.btn2t, !!second);
      if (second) this.hit(W / 2 - 125, 532, 250, 62, 'resultparty');
    },

    /* ----------------------------------------------------------- sim step */
    sim: function (dt) {
      this.time0 += dt;
      var i;
      if (this.weaverReturn > 0) {
        this.weaverReturn -= dt;
        if (this.weaverReturn <= 0 && this.bt.weaver) this.bt.weaver.play('wv-idle', true);
      }
      for (i = 0; i < this.foeView.length; i++) {
        var v = this.foeView[i];
        if (v.hit > 0) v.hit = Math.max(0, v.hit - dt);
        if (v.animT > 0) {
          v.animT -= dt;
          var k = Math.max(0, v.animT);
          if (v.anim === 'attack') v.offY = -Math.sin((0.34 - k) / 0.34 * Math.PI) * 16;
          else if (v.anim === 'die') { v.scale = 1 + (0.55 - k) * 0.5; v.alpha = Math.max(0, k / 0.55); }
          if (v.animT <= 0) { v.anim = ''; v.offY = 0; v.scale = 1; v.alpha = 1; }
        }
      }
      for (i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) { f.o.setVisible(false); continue; }
        f.o.y += f.vy * dt;
        f.o.setAlpha(clamp(f.life / 0.5, 0, 1));
      }
      if (this.transient && !this.banner) {
        this.transient.life -= dt;
        if (this.transient.life <= 0) {
          this.transient = this.transientQueue.length ? this.transientQueue.shift() : null;
        }
      }
      if (this.banner) {
        this.banner.t += dt;
        this.banner.life -= dt;
        if (this.banner.life <= 0) this.banner = null;
      }
      if (this.flashV > 0) this.flashV = Math.max(0, this.flashV - dt * 2.4);
      if (this.holdId !== null && this.holdId !== undefined) {
        if (kit.input.pointers.has(this.holdId)) {
          this.holdTime += dt;
          if (this.holdTime > 0.24 && B && B.hand[this.holdCard]) {
            this.previewCard = B.hand[this.holdCard];
            advanceTutorial(5);
          }
        } else { this.holdId = null; this.previewCard = null; }
      }
      if (!B) return;
      tickQueue(B, dt);
      if (B.phase === 'won' || B.phase === 'lost') {
        if (!B.queue.length && B.qt <= 0 && !B.ended) {
          if (B.phase === 'won') this.weaverAnim('cheer');
          finishBattle();
        }
        return;
      }
      if (B.waves && !B.queue.length && aliveFoes(B).length === 0 && B.wave < B.waves.length - 1) {
        B.wave++;
        spawnWave(B, B.waves[B.wave]);
        this.foeView.forEach(function (v) { v.hit = 0; v.anim = ''; v.animT = 0; v.offY = 0; v.scale = 1; v.alpha = 1; });
        vfx.chip('WAVE ' + (B.wave + 1) + ' OF ' + B.waves.length, C.violet);
        sfx('intent');
        B.phase = 'pick';
      }
    },

    /* ------------------------------------------------------------- input */
    tap: function (x, y, id) {
      var hitId = this.findHit(x, y);
      if (!hitId) return;
      unlockMusic();
      if (hitId === 'pause') { sfx('ui'); this.openPause(); return; }
      if (mode === 'story') {
        story.i++;
        sfx('ui');
        if (story.i >= story.pages.length) {
          var then = story.then;
          story = null;
          then();
        }
        return;
      }
      if (mode === 'result') {
        if (hitId === 'resultok') {
          sfx('ui');
          if (result.won) afterResult(); else retryBattle();
        } else if (hitId === 'resultparty') {
          sfx('ui');
          partyDraft = save.party.slice();
          result = null;
          setMode('party');
        }
        return;
      }
      if (hitId === 'back') {
        sfx('unpick');
        if (mode === 'party') {
          if (pending && pending.type === 'story' && B) { setMode('battle'); return; }
          setMode('map');
        } else setMode('title');
        return;
      }
      if (mode === 'battle') {
        if (hitId.indexOf('card') === 0) {
          var ci = +hitId.slice(4);
          this.holdId = id;
          this.holdCard = ci;
          this.holdTime = 0;
          toggleCard(ci);
        } else if (hitId === 'resolve') { sfx('ui'); resolveChain(); }
        else if (hitId === 'skip') { if (B) B.fast = true; sfx('ui'); }
        else if (hitId.indexOf('foe') === 0) setTarget(+hitId.slice(3));
        else if (hitId.indexOf('gauge') === 0) fireGauge(+hitId.slice(5));
        return;
      }
      if (mode === 'title') {
        sfx('ui');
        if (hitId === 'play') {
          if (clearedCount() === 0 && save.roster.length <= 1) newRun();
          else { chapterView = save.ch; setMode('map'); }
        } else if (hitId === 'trials') setMode('trials');
        else if (hitId === 'free') { this.freeRolls = null; setMode('free'); }
        else if (hitId === 'party') { partyDraft = save.party.slice(); setMode('party'); }
        return;
      }
      if (mode === 'map') {
        if (hitId.indexOf('node') === 0) { sfx('ui'); openBattle(chapterView, +hitId.slice(4)); }
        else if (hitId === 'party') { sfx('ui'); partyDraft = save.party.slice(); setMode('party'); }
        else if (hitId === 'chprev') { sfx('pick'); chapterView = Math.max(0, chapterView - 1); this.onModeChanged(); }
        else if (hitId === 'chnext') { sfx('pick'); chapterView = Math.min(D.CHAPTERS.length - 1, chapterView + 1); this.onModeChanged(); }
        return;
      }
      if (mode === 'trials') {
        if (hitId.indexOf('trial') === 0) { sfx('ui'); startTrial(D.TRIALS[+hitId.slice(5)]); }
        return;
      }
      if (mode === 'free') {
        if (hitId === 'reroll') {
          sfx('pick');
          this.freeRolls = null;
          return;
        }
        if (hitId.indexOf('free') === 0) {
          var ids = Object.keys(D.REALMS);
          var realmId = ids[+hitId.slice(4)];
          var enc = this.freeRolls && this.freeRolls[realmId];
          if (enc) { sfx('ui'); startFree(enc); }
        }
        return;
      }
      if (mode === 'party') {
        if (hitId.indexOf('sp') === 0) {
          var sid = hitId.slice(2);
          inspectId = sid;
          var at = partyDraft.indexOf(sid);
          if (at >= 0) { partyDraft.splice(at, 1); sfx('unpick'); }
          else if (partyDraft.length < 3) { partyDraft.push(sid); sfx('pick'); }
          else sfx('ui');
        } else if (hitId === 'inspectweaver') { inspectId = 'weaver'; sfx('ui'); }
        else if (hitId === 'confirm') {
          sfx('ui');
          save.party = partyDraft.slice(0, 3);
          persist();
          if (pending && pending.type === 'story' && B && B.phase !== 'won') { retryBattle(); return; }
          setMode('map');
        } else if (hitId === 'ascend') {
          if (canAscend(inspectId)) {
            save.tokens -= ascendCost(save.asc[inspectId] || 0);
            deepenBond(inspectId);
            persist();
            sfx('bind');
            this.burst(195, 654, 26, spiritOf(inspectId).col, 'weave');
            this.queueTransient(spiritOf(inspectId).short + ' ascends', 1.2, C.amber, 'event');
          }
        }
        return;
      }
      if (mode === 'end' && hitId === 'endback') { sfx('ui'); setMode('title'); }
    },

    keyPressed: function (code) {
      return this.frameKeys.indexOf(code) >= 0;
    },

    handleKeys: function () {
      var i;
      this.frameKeys = keyQueue.length ? keyQueue.splice(0, keyQueue.length) : EMPTY_KEYS;
      if (!this.frameKeys.length) return;
      var digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
      for (i = 0; i < digits.length; i++) {
        if (this.keyPressed(digits[i])) {
          this.kbActive = true;
          unlockMusic();
          if (mode === 'battle') toggleCard(i);
        }
      }
      var arts = ['KeyQ', 'KeyW', 'KeyE'];
      for (i = 0; i < arts.length; i++) {
        if (this.keyPressed(arts[i]) && mode === 'battle') { unlockMusic(); fireGauge(i); }
      }
      if (this.keyPressed('Escape') || this.keyPressed('KeyP')) {
        this.kbActive = true;
        unlockMusic();
        if (mode === 'battle' || mode === 'title') this.openPause();
        else if (mode === 'party') this.forceTap('back');
        else if (mode !== 'story' && mode !== 'result') this.forceTap('back');
      }
      if (this.keyPressed('Enter') || this.keyPressed('Space')) {
        this.kbActive = true;
        unlockMusic();
        if (mode === 'story') this.forceTap('story');
        else if (mode === 'result') this.forceTap('resultok');
        else if (mode === 'battle') {
          if (B && B.phase === 'pick' && B.sel.length === 3) resolveChain();
          else if (B && B.phase !== 'pick') B.fast = true;
        } else if (this.rowIds.length) {
          this.forceTap(this.rowIds[clamp(listFocus, 0, this.rowIds.length - 1)]);
        }
      }
      if (this.keyPressed('ArrowLeft') || this.keyPressed('ArrowUp')) {
        this.kbActive = true;
        if (mode === 'battle' && B) this.cycleTarget(-1);
        else if (this.rowIds.length) { listFocus = (listFocus + this.rowIds.length - 1) % this.rowIds.length; sfx('pick'); }
      }
      if (this.keyPressed('ArrowRight') || this.keyPressed('ArrowDown')) {
        this.kbActive = true;
        if (mode === 'battle' && B) this.cycleTarget(1);
        else if (this.rowIds.length) { listFocus = (listFocus + 1) % this.rowIds.length; sfx('pick'); }
      }
    },

    forceTap: function (id) {
      var saved = this.hitCount;
      this.hit(-9999, -9999, 1, 1, id);
      this.hitCount = saved + 1;
      this.tap(-9999, -9999, 'kb');
      this.hitCount = saved;
      return true;
    },

    cycleTarget: function (dir) {
      if (!B) return;
      var live = [];
      for (var i = 0; i < B.foes.length; i++) if (!B.foes[i].dead) live.push(i);
      if (!live.length) return;
      var at = live.indexOf(B.target);
      at = (at + (dir > 0 ? 1 : live.length - 1) + live.length) % live.length;
      setTarget(live[at]);
    },

    openPause: function () {
      var self = this;
      kit.openSettings([function (box) {
        function action(label, color, fn) {
          var el = document.createElement('button');
          el.textContent = label;
          el.style.cssText = 'font:inherit;font-size:16px;color:' + color +
            ';background:#1b1526;border:1px solid #4b2c78;border-radius:10px;padding:12px 18px;' +
            'min-width:min(70vw,280px);';
          el.addEventListener('click', function () {
            box.remove();
            kit.resume('settings');
            resetEdges();
            fn();
          });
          box.appendChild(el);
        }
        if (mode === 'battle' && B) {
          action('Restart battle', '#f0e6ff', function () { retryBattle(); });
          action('Leave battle', '#9d8fb8', function () {
            B = null; result = null; pending = null; setMode('map');
          });
        } else if (mode !== 'title') {
          action('Main menu', '#f0e6ff', function () { setMode('title'); });
        }
        if (mode === 'title') {
          action('New weave (erases progress)', '#ff8fd0', function () { newRun(); });
        }
      }]);
    },

    /* --------------------------------------------------------- frame paint */
    paintFrame: function (dt) {
      this.resetHits();
      this.rowIds.length = 0;
      var showBattle = (mode === 'battle' || mode === 'result') && !!B;
      var menuMode = mode === 'title' || mode === 'map' || mode === 'trials' ||
        mode === 'free' || mode === 'party' || mode === 'end';
      this.paintBattleGroup(showBattle);
      this.paintMenuGroup(menuMode);
      this.paintStoryGroup(mode === 'story' && !!story);
      this.paintResultGroup(mode === 'result' && !!result);
      setVis(this.pausePanel, mode !== 'story' && mode !== 'result');
      setVis(this.pauseIcon, mode !== 'story' && mode !== 'result');
      if (showBattle) this.paintBattle(dt);
      if (menuMode) this.paintMenu();
      if (mode === 'story' && story) { this.resetHits(); this.paintStory(); }
      if (mode === 'result' && result) { this.resetHits(); this.paintResult(); }
      if (menuMode && this.kbActive && this.rowIds.length) {
        listFocus = clamp(listFocus, 0, this.rowIds.length - 1);
      }
      /* transient strip: one at a time, thin, top edge, auto fading */
      if (this.transient && !this.banner) {
        var t = this.transient;
        var fade = clamp(t.life / 0.45, 0, 1);
        setTx(this.stripText, t.text);
        setCol(this.stripText, t.color);
        var wdt = t.kind === 'coach' ? L.strip.w : Math.min(L.strip.w, this.stripText.width + 34);
        this.stripPanel.setPosition(L.strip.x + wdt / 2, L.strip.y + 17);
        this.stripPanel.setScale(wdt / L.strip.w, 1);
        this.stripPanel.setAlpha(0.92 * fade);
        this.stripText.setAlpha(fade);
        setVis(this.stripPanel, true);
        setVis(this.stripText, true);
      } else {
        setVis(this.stripPanel, false);
        setVis(this.stripText, false);
      }
      /* run boundary banner, sixty percent width, overshoot in */
      if (this.banner) {
        var bn = this.banner;
        var inT = clamp(bn.t / 0.26, 0, 1);
        var over = kit.juice.enabled ? 1 + Math.sin(inT * Math.PI) * 0.09 : 1;
        var alpha = clamp(bn.life / 0.4, 0, 1) * clamp(bn.t / 0.12, 0, 1);
        this.bannerPanel.setScale(inT * over, inT * over);
        this.bannerPanel.setAlpha(alpha);
        this.bannerTitle.setAlpha(alpha);
        this.bannerSub.setAlpha(alpha);
        setTx(this.bannerTitle, bn.title);
        setFs(this.bannerTitle, bn.title.length > 18 ? 15 : (bn.title.length > 13 ? 17 : 20));
        setCol(this.bannerTitle, bn.color);
        setTx(this.bannerSub, bn.sub);
        setVis(this.bannerPanel, true);
        setVis(this.bannerTitle, true);
        setVis(this.bannerSub, true);
      } else {
        setVis(this.bannerPanel, false);
        setVis(this.bannerTitle, false);
        setVis(this.bannerSub, false);
      }
      this.flashRect.setAlpha(this.flashV);
      this.dimRect.setAlpha(this.dimmed ? 0.55 : 0);
    },

    updateHook: function () {
      hook.mode = mode;
      hook.chapter = B ? B.ch : chapterView;
      hook.cleared = clearedCount();
      hook.progress = hook.cleared / TOTAL_BATTLES;
      hook.roster = save.roster.length;
      hook.tokens = save.tokens;
      hook.ready = app.ready;
      hook.total = TOTAL_BATTLES;
      if (B) {
        hook.stage = globalIndex(B.ch, B.bi);
        hook.stageName = B.name;
        hook.hp = B.hp;
        hook.maxHp = B.maxhp;
        hook.health = B.maxhp ? B.hp / B.maxhp : 1;
        hook.turn = B.turn;
        hook.phase = B.phase;
        hook.score = B.damageDone;
      } else {
        hook.stageName = '';
        hook.health = 1;
        hook.turn = 0;
        hook.phase = '';
      }
    },

    update: function (time, delta) {
      var dt = Math.min(0.05, (delta || 16.7) / 1000);
      var frame = kit.juice.frame();
      this.cameras.main.setScroll(-frame.dx, -frame.dy);
      if (!kit.paused) {
        this.handleKeys();
        this.handlePointers();
        this.acc += dt;
        var steps = 0;
        if (!frame.frozen) {
          while (this.acc >= STEP && steps < MAX_STEPS) {
            this.sim(STEP);
            this.acc -= STEP;
            steps++;
          }
          if (this.acc > STEP * MAX_STEPS) this.acc = 0;
        } else if (this.acc > STEP * 2) this.acc = STEP * 2;
      }
      this.paintFrame(dt);
      this.updateHook();
    },

    handlePointers: function () {
      var self = this;
      var rect = this.game.canvas.getBoundingClientRect();
      kit.input.pointers.forEach(function (p, id) {
        if (self.pointerClaims[id] === p.downAt) return;
        self.pointerClaims[id] = p.downAt;
        var gx = (p.x - rect.left) / Math.max(1, rect.width) * W;
        var gy = (p.y - rect.top) / Math.max(1, rect.height) * H;
        self.tap(gx, gy, id);
      });
      var keys = Object.keys(this.pointerClaims);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!kit.input.pointers.has(Number(k)) && !kit.input.pointers.has(k)) {
          delete this.pointerClaims[k];
        }
      }
    }
  };

  var EMPTY_KEYS = [];

  function resetEdges() {
    keyQueue.length = 0;
    if (!app.scene) return;
    app.scene.keyEdges = {};
    app.scene.pointerClaims = {};
    app.scene.holdId = null;
    app.scene.previewCard = null;
  }

  /* ------------------------------------------------------------------ boot */
  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    Object.keys(cfg).forEach(function (k) { if (k !== 'key') Klass.prototype[k] = cfg[k]; });
    Klass.prototype.keyEdges = {};
    Klass.prototype.frameKeys = [];
    Klass.prototype.pointerClaims = {};
    Klass.prototype.rowIds = [];
    Klass.prototype.hitCount = 0;
    Klass.prototype.holdId = null;
    Klass.prototype.kbActive = false;
    Klass.prototype.weaverReturn = 0;
    return Klass;
  }

  window.addEventListener('pointerdown', unlockMusic, { passive: true });
  window.addEventListener('keydown', unlockMusic, { passive: true });

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: C.ink2,
    render: Object.assign({}, window.GGKit.renderDefaults),
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.round(W * HIDPI_FACTOR),
      height: Math.round(H * HIDPI_FACTOR)
    },
    fps: { target: 60, min: 30 },
    scene: [toScene(PlayScene)]
  });
})();
