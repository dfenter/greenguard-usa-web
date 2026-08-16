/* Ace Vector - game.js
 * Phaser 3 arcade dogfighter. Landscape. GGKit owns lifecycle, audio, input
 * identity, saves, loading, settings and the juice budget.
 *
 * Architecture notes for future maintainers:
 *  - The sim runs on a fixed 60 Hz accumulator. Hit-stop freezes the COSMETIC
 *    clock only (ART_DIRECTION rule 5); sim steps are never skipped.
 *  - Everything is pooled: aircraft, tracers, missiles, flak, ejection pods,
 *    banner text. The hot loop allocates nothing, and dead entries are
 *    removed by swap-with-last, never by Array.filter.
 *  - Particles are six Phaser emitters created once in create(); no emitter
 *    is constructed during play.
 *  - Aircraft sprites carry five bank frames each. Enemies fly nose-left via
 *    flipX, and rotation is corrected by pi so a flipped sprite still points
 *    along its velocity.
 *
 *  - Preserved prototype behaviours, by name (regression-checked in review):
 *      * LEAD-PURSUIT AIMING - leadPoint() keeps the prototype's 560 px/s
 *        tracer speed and the 0.1-1.4 s clamp on lead time. The reticle and
 *        the player's own shots both aim at that point, which is the reviewed
 *        behaviour the prototype notes call proven.
 *      * HEALTH UNDERFLOW FIX - damagePlayer() floors hull at 0 and the pip
 *        HUD clamps to 0..max, so a double hit in one frame can never render
 *        negative hull or a negative pip count.
 *      * WINGMAN ATTACK RUN - the ordered wingman flies to target.x-100 with
 *        a +/-20 px sine weave and fires every 0.72 s, exactly as tuned.
 *      * BOLTER BREAK - the boom-and-zoom archetype reverses once it crosses
 *        62% of the screen width, then re-attacks from the right.
 *      * FLARE DEFEAT ENVELOPE - 5 s recharge, 190 px missile defeat radius.
 *      * MISSILE PURSUIT - 0.95 rad/s turn rate, speed 170 + min(100, age*14).
 *      * DEFLECTION BONUS - a hit whose tracer angle differs from the
 *        target's heading by more than 1.25 rad scores the deflection bonus.
 *      * SEEDED SORTIES - the 0xace2026 LCG seeds every sortie, so a given
 *        sortie number always builds the same bandit set.
 *      * RESTART INPUT-STATE CLEARING - GGKit.restart() clears pointer and
 *        key state before onRestart fires; resetSortie() zeroes the local
 *        stick binding as well.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------- constants
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var TRACER_SPEED = 560;      // LEAD-PURSUIT AIMING: prototype tracer speed
  var FLARE_RECHARGE = 5.0;    // FLARE DEFEAT ENVELOPE
  var FLARE_RADIUS = 190;
  var MISSILE_TURN = 0.95;     // MISSILE PURSUIT
  var DEFLECTION_ANGLE = 1.25; // DEFLECTION BONUS
  var INVULN = 1.1;
  var MAX_FOES = 16;
  var MAX_TRACERS = 72;
  var MAX_FOE_TRACERS = 90;
  var MAX_MISSILES = 10;
  var MAX_FLAK = 40;
  var MAX_PODS = 8;
  var MAX_BANNERS = 8;
  var MAX_RINGS = 12;          // impact/kill rings (three-beat contact stage)
  var MAX_POPS = 10;           // score popups
  var MAX_DEBRIS = 24;         // kill debris shards
  var MAX_PICKUPS = 18;
  var PLAYER_HURT_RADIUS = 13;
  var PLAYER_GRAZE_RADIUS = 46;

  var BANKF = ['bl2', 'bl1', 'lvl', 'br1', 'br2'];

  // VISUAL RNG. Cosmetic decisions never touch Math.random or the gameplay
  // LCG: a frame drop or a re-render must not be able to shift the sim, and
  // the sim seed must not be advanced by particle jitter.
  var _vseed = 0x1f35a7c1;
  function vrand() { _vseed = (_vseed * 1664525 + 1013904223) >>> 0; return _vseed / 4294967296; }
  function vseed(n) { _vseed = (0x1f35a7c1 ^ (n * 2246822519)) >>> 0; }

  // --------------------------------------------------------------- content
  // Player airframes. Unlocked by squadron rank; every one is flyable to the
  // end of the ladder, they trade hull against fire rate and agility.
  var AIRFRAMES = [
    { id: 'kestrel', frame: 'av_kestrel', name: 'AV-1 Kestrel', rank: 0,
      hull: 3, gap: 0.120, flares: 2, climb: 220, agility: 1.00, tint: 0x8fe6ff,
      blurb: 'The squadron workhorse. Balanced hull, steady guns.' },
    { id: 'lancet', frame: 'av_lancet', name: 'AV-2 Lancet', rank: 2,
      hull: 2, gap: 0.092, flares: 2, climb: 252, agility: 1.16, tint: 0x76ffd0,
      blurb: 'Thin skin, fast guns, climbs like it means it.' },
    { id: 'bastion', frame: 'av_bastion', name: 'AV-3 Bastion', rank: 4,
      hull: 5, gap: 0.146, flares: 3, climb: 192, agility: 0.86, tint: 0xffbe78,
      blurb: 'Twin engine armour bus. Slow guns, hard to kill.' },
    { id: 'vector', frame: 'av_vector', name: 'AV-4 Vector', rank: 6,
      hull: 4, gap: 0.104, flares: 3, climb: 244, agility: 1.10, tint: 0xd2a6ff,
      blurb: 'The prototype delta. No weak axis.' }
  ];
  var AIRFRAME_BY_ID = {};
  for (var ai = 0; ai < AIRFRAMES.length; ai++) AIRFRAME_BY_ID[AIRFRAMES[ai].id] = AIRFRAMES[ai];

  // Bandit squadrons. Original names; each reads by silhouette and colour.
  var SQUADRON = {
    vane:   { frame: 'foe_vane',   hp: 1, speed: 78,  score: 40,  r: 22, ai: 'weave',
              gun: 2.4, name: 'Vane' },
    bolter: { frame: 'foe_bolter', hp: 2, speed: 94,  score: 55,  r: 22, ai: 'boom',
              gun: 2.7, name: 'Bolter' },
    talon:  { frame: 'foe_talon',  hp: 3, speed: 102, score: 90,  r: 24, ai: 'pursue',
              gun: 1.8, missile: true, name: 'Talon' },
    kite:   { frame: 'foe_kite',   hp: 2, speed: 70,  score: 70,  r: 26, ai: 'high',
              gun: 2.1, burst: 3, name: 'Kite' },
    drell:  { frame: 'foe_drell',  hp: 8, speed: 52,  score: 150, r: 36, ai: 'heavy',
              gun: 3.2, flak: true, name: 'Drell' },
    shrike: { frame: 'foe_shrike', hp: 2, speed: 132, score: 80,  r: 22, ai: 'strafe',
              gun: 2.2, name: 'Shrike' }
  };

  // Ace duels: the boss beats. Three phases each, telegraphed.
  // `sign` is the call sign painted on the duel card, `wash` is the palette
  // takeover the sky is graded toward while the duel is up, and `rim` relights
  // every airframe for the length of the fight.
  var ACES = {
    ashvane:    { frame: 'ace_ashvane',    hp: 30, speed: 112, score: 600,  r: 40,
                  name: 'Ash Vane',    sign: 'CRIMSON LEAD',
                  call: 'Crimson lead. Do not follow him down.',
                  wash: 0xff5a4a, rim: 0xff8a70 },
    kestrel:    { frame: 'ace_kestrel',    hp: 46, speed: 100, score: 900,  r: 46,
                  name: 'Iron Kestrel', sign: 'IRON FLIGHT',
                  call: 'Heavy hitter. He will trade hull for hull.',
                  wash: 0xffb45c, rim: 0xffd08a },
    nightglass: { frame: 'ace_nightglass', hp: 64, speed: 124, score: 1300, r: 42,
                  name: 'Nightglass',  sign: 'NO CALLSIGN',
                  call: 'You will hear him before you see him.',
                  wash: 0x6ad0ff, rim: 0x9fe8ff },
    prime:      { frame: 'ace_prime',      hp: 88, speed: 132, score: 2000, r: 48,
                  name: 'Vector Prime', sign: 'PROGRAMME ONE',
                  call: 'The airframe you are flying was his idea.',
                  wash: 0xc08aff, rim: 0xdcb4ff }
  };

  // Midbosses and the final stage boss reuse the authored ace silhouettes but
  // have their own combat identities. They are deliberately part of the
  // sortie data rather than debug-only encounters, so a normal career run
  // teaches the player the phase language before the final duel.
  var BOSS_DEFS = {
    brasswing: { frame: 'ace_ashvane', hp: 38, speed: 104, score: 850, r: 44,
      name: 'Brasswing', sign: 'MIDBOSS // BREAKER', call: 'The breaker is opening a lane. Cut through it.',
      wash: 0xff895f, rim: 0xffd08a, tier: 'mid', phases: 3 },
    nightreaver: { frame: 'ace_nightglass', hp: 58, speed: 116, score: 1200, r: 46,
      name: 'Night Reaver', sign: 'MIDBOSS // VEIL', call: 'The veil is down. Watch the crossing fire.',
      wash: 0x5b6eff, rim: 0x9fe8ff, tier: 'mid', phases: 3 },
    prime: { frame: 'ace_prime', hp: 116, speed: 132, score: 2600, r: 50,
      name: 'Vector Prime', sign: 'STAGE BOSS // PROGRAMME ONE',
      call: 'The old programme ends here. Break the crown.',
      wash: 0xc08aff, rim: 0xdcb4ff, tier: 'stage', phases: 4 }
  };

  var WAVE_PATTERNS = [
    { id: 'vee', name: 'VEE BREAK', gap: 0.34 },
    { id: 'pincer', name: 'PINCER', gap: 0.42 },
    { id: 'crossfire', name: 'CROSS FIRE', gap: 0.30 },
    { id: 'highlow', name: 'HIGH / LOW', gap: 0.38 },
    { id: 'swoop', name: 'SWOOP RUN', gap: 0.26 },
    { id: 'wall', name: 'WALL FORMATION', gap: 0.46 }
  ];

  var WEAPONS = {
    cannon: { name: 'CANNON', color: 0xfff0c8 },
    spread: { name: 'SPREAD', color: 0xffd76a },
    homing: { name: 'HOMING', color: 0x8fe6ff },
    laser: { name: 'LASER', color: 0xff8fe6 }
  };

  var DROP_TABLE = [
    { type: 'spread', weight: 0.20 },
    { type: 'homing', weight: 0.17 },
    { type: 'laser', weight: 0.14 },
    { type: 'power', weight: 0.18 },
    { type: 'shield', weight: 0.16 },
    { type: 'bomb', weight: 0.15 }
  ];

  // Sky themes: sorties cycle through five so the ladder never looks the same
  // twice. Every colour is a stop in the baked gradient.
  //
  // SCENE-RESPONSIVE LIGHTING: a theme is not only a sky. Each one also
  // carries the lighting the aircraft and effects are lit by, so a Nightglass
  // duel and a dawn patrol do not share a single white-and-yellow FX kit:
  //   rim     key-light rim on every airframe (sun side)
  //   fill    reflected sky bounce on the shadow side
  //   tracer  the player's tracer colour under this sky
  //   foeShot bandit tracer colour
  //   smoke   damage smoke, lit by the sky rather than flat charcoal
  //   glass   HUD glass and reticle tint
  //   ridgeM  the mid terrain layer, between far ridge and near mass
  var THEMES = {
    dawn:  { sky: [0x0a1430, 0x1d3f6e, 0x8b5f8e, 0xf0a06f, 0xffd7a1], sun: 0xffdcae,
             sunY: 0.62, ridge: 0x2d3b63, ridgeM: 0x1f2a4c, ridge2: 0x141b33,
             cloud: 0xffd9c4, haze: 0xf0a06f,
             rim: 0xffd2a0, fill: 0x7f9ad4, tracer: 0xfff0c8, foeShot: 0xff9a72,
             smoke: 0x3b3450, glass: 0xd9fbff },
    noon:  { sky: [0x0b3a86, 0x1f6cc0, 0x62a8e2, 0xa8d6f2, 0xdff0fb], sun: 0xfffbe6,
             sunY: 0.20, ridge: 0x3a5b7a, ridgeM: 0x2e4a65, ridge2: 0x22384f,
             cloud: 0xffffff, haze: 0xbfe0f4,
             rim: 0xffffff, fill: 0xa8d6f2, tracer: 0xffffff, foeShot: 0xffb15c,
             smoke: 0x2b3444, glass: 0xe4fbff },
    dusk:  { sky: [0x0a0f2c, 0x2a1f57, 0x6b2d63, 0xc0505f, 0xff9d5c], sun: 0xffb072,
             sunY: 0.70, ridge: 0x2a2246, ridgeM: 0x1e173a, ridge2: 0x120e26,
             cloud: 0xffc0a8, haze: 0xd0715f,
             rim: 0xffa878, fill: 0x8a63b4, tracer: 0xffd9a0, foeShot: 0xff7a86,
             smoke: 0x3a2740, glass: 0xffd9e6 },
    storm: { sky: [0x0c1620, 0x1e2c3a, 0x3b4a58, 0x5d6b74, 0x8b969c], sun: 0x9fb0bb,
             sunY: 0.34, ridge: 0x1c2730, ridgeM: 0x152029, ridge2: 0x0d141a,
             cloud: 0xb9c6cf, haze: 0x6e7d87,
             rim: 0xd6e4ec, fill: 0x63737f, tracer: 0xdff2ff, foeShot: 0xffc46a,
             smoke: 0x222a31, glass: 0xc8dce8 },
    night: { sky: [0x03060f, 0x081227, 0x122043, 0x1e3160, 0x38507f], sun: 0xc8d8ff,
             sunY: 0.16, ridge: 0x101a33, ridgeM: 0x0b1226, ridge2: 0x070c18,
             cloud: 0x9fb4dd, haze: 0x2a3a5e,
             rim: 0x9fc4ff, fill: 0x2b4270, tracer: 0xa8e8ff, foeShot: 0xff6a5c,
             smoke: 0x141c2e, glass: 0xa8e8ff }
  };

  // The sortie ladder: 14 sorties, four of them ace duels. Waves spawn in
  // order; a wave lands when the previous one is down to its last bandit.
  var SORTIES = [
    { n: 1,  name: 'First Light',    theme: 'dawn',  aggro: 0.72,
      brief: 'Two bandits over the ridge. Learn the aeroplane.',
      waves: [['vane', 'vane'], ['vane', 'vane', 'vane']] },
    { n: 2,  name: 'Ridge Patrol',   theme: 'dawn',  aggro: 0.84,
      brief: 'Bolters run the valley. They will not turn with you.',
      waves: [['vane', 'vane', 'vane'], ['bolter', 'bolter', 'vane', 'vane']] },
    { n: 3,  name: 'Broken Cloud',   theme: 'noon',  aggro: 0.94,
      brief: 'Cloud cover both ways. Watch the gaps.',
      waves: [['bolter', 'bolter', 'bolter'], ['vane', 'vane', 'talon'],
              ['bolter', 'bolter', 'vane']] },
    { n: 4,  name: 'Duel: Ash Vane', theme: 'dusk',  aggro: 1.00, ace: 'ashvane',
      brief: 'Their flight lead wants a name. Do not give him yours.',
      waves: [['talon', 'talon']] },
    { n: 5,  name: 'Kite Country',   theme: 'noon',  aggro: 1.06,
      brief: 'Kites sit high and shoot long. Climb or die tired.',
      waves: [['kite', 'kite', 'vane', 'vane'], ['kite', 'kite', 'kite'],
              ['bolter', 'bolter', 'bolter']] },
    { n: 6,  name: 'Storm Line',     theme: 'storm', aggro: 1.16,
      brief: 'Shrikes in the weather. They come fast and leave faster.',
      waves: [['shrike', 'shrike', 'shrike'], ['shrike', 'shrike', 'talon', 'talon'],
              ['kite', 'kite', 'bolter', 'bolter']] },
    { n: 7,  name: 'Heavy Escort',   theme: 'noon',  aggro: 1.22, midboss: 'brasswing',
      brief: 'A Drell is a flying flak battery. Kill the escorts first.',
      waves: [['drell', 'vane', 'vane', 'vane'], ['drell', 'drell', 'bolter', 'bolter']] },
    { n: 8,  name: 'Duel: Iron Kestrel', theme: 'storm', aggro: 1.28, ace: 'kestrel',
      brief: 'Twin engines, twin guns, no sense of self preservation.',
      waves: [['shrike', 'shrike', 'shrike'], ['drell', 'talon', 'talon']] },
    { n: 9,  name: 'Night Sweep',    theme: 'night', aggro: 1.34,
      brief: 'Guns only light up when they fire. So do yours.',
      waves: [['talon', 'talon', 'talon'], ['shrike', 'shrike', 'shrike', 'vane', 'vane'],
              ['kite', 'kite', 'kite']] },
    { n: 10, name: 'Flak Corridor',  theme: 'night', aggro: 1.42,
      brief: 'Two Drells with the whole valley zeroed.',
      waves: [['drell', 'drell', 'shrike', 'shrike'], ['drell', 'drell', 'talon', 'talon'],
              ['kite', 'kite', 'kite', 'bolter', 'bolter']] },
    { n: 11, name: 'Vapour Trail',   theme: 'dusk',  aggro: 1.50, midboss: 'nightreaver',
      brief: 'Every bandit in the sector saw your contrail.',
      waves: [['shrike', 'shrike', 'shrike', 'shrike'], ['talon', 'talon', 'talon', 'kite', 'kite'],
              ['drell', 'shrike', 'shrike', 'shrike']] },
    { n: 12, name: 'Duel: Nightglass', theme: 'night', aggro: 1.56, ace: 'nightglass',
      brief: 'Nobody has seen his airframe and come home to describe it.',
      waves: [['talon', 'talon', 'talon'], ['shrike', 'shrike', 'shrike', 'kite', 'kite']] },
    { n: 13, name: 'The Long Climb', theme: 'storm', aggro: 1.66,
      brief: 'Everything they have left is between you and the pass.',
      waves: [['drell', 'drell', 'talon', 'talon', 'talon'],
              ['shrike', 'shrike', 'shrike', 'shrike', 'kite', 'kite'],
              ['talon', 'talon', 'talon', 'bolter', 'bolter', 'bolter']] },
    { n: 14, name: 'Duel: Vector Prime', theme: 'dawn', aggro: 1.76, stageBoss: 'prime',
      brief: 'The last airframe of the old programme. Bring it down.',
      waves: [['shrike', 'shrike', 'shrike', 'shrike'], ['drell', 'drell', 'talon', 'talon', 'talon']] }
  ];

  // Squadron rank: nine grades, earned with career score.
  var RANKS = [
    { name: 'Cadet', xp: 0 }, { name: 'Wingman', xp: 1200 },
    { name: 'Flight Officer', xp: 3000 }, { name: 'Section Lead', xp: 6000 },
    { name: 'Squadron Lead', xp: 10000 }, { name: 'Ace', xp: 15000 },
    { name: 'Double Ace', xp: 22000 }, { name: 'Wing Commander', xp: 32000 },
    { name: 'Sky Marshal', xp: 45000 }
  ];

  // -------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(a, b, dt, rate) { return lerp(a, b, 1 - Math.pow(rate, dt)); }
  function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

  // Colour mixing drives the scene-responsive lighting: aircraft rim, cloud
  // atmospheric perspective and terrain haze are all a theme colour blended
  // toward another by distance or by the sun side.
  function mixRGB(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((ar + (br - ar) * t) & 255) << 16 |
           ((ag + (bg - ag) * t) & 255) << 8 |
           ((ab + (bb - ab) * t) & 255);
  }

  // Only touch a sprite's frame or tint when it actually changes.
  function setFrameIf(spr, name) {
    if (spr._fk !== name) { spr._fk = name; spr.setFrame(name); }
  }
  function setTintIf(spr, tint) {
    if (spr._tk !== tint) { spr._tk = tint; spr.setTint(tint); }
  }
  function setTextIfChanged(obj, value) {
    value = String(value);
    if (obj._avText !== value) { obj._avText = value; obj.setText(value); }
    return obj;
  }

  function motionEnabled() { return !kit || kit.juice.enabled !== false; }

  // SEEDED SORTIES: the prototype's LCG, seed and all.
  var _seed = 0xace2026;
  function resetSeed(extra) { _seed = (0xace2026 ^ (extra * 2654435761)) >>> 0; }
  function srand() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }

  function rankIndex(xp) {
    var r = 0;
    for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
    return r;
  }

  function isCount(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v;
  }

  // ------------------------------------------------------------------ kit
  var kit = GGKit.create({
    slug: 'ace-vector',
    orientation: 'landscape',
    validateSave: function (o) {
      // Save validation: every persisted id is checked against the live
      // content registries AND against the relationships that produced it, so
      // an edited or stale save degrades to a fresh profile instead of
      // handing out a locked airframe or an unearned rung of the ladder.
      if (!o || typeof o !== 'object') return false;
      if (o.version !== 1) return false;
      if (typeof o.xp !== 'number' || !isFinite(o.xp) || o.xp < 0) return false;
      if (!isCount(o.unlocked) || o.unlocked < 1 || o.unlocked > SORTIES.length) return false;
      var plane = AIRFRAME_BY_ID[o.plane];
      if (!plane) return false;
      if (!o.best || typeof o.best !== 'object') return false;
      for (var k in o.best) {
        if (!/^\d+$/.test(k) || +k < 1 || +k > SORTIES.length) return false;
        if (typeof o.best[k] !== 'number' || !isFinite(o.best[k]) || o.best[k] < 0) return false;
      }
      // The selected airframe must be one the career rank actually opened.
      if (rankIndex(o.xp) < plane.rank) return false;
      // Sortie N+1 only opens by clearing sortie N, and clearing a sortie
      // always records a best score for it. So every rung below the current
      // one must carry a best entry: an unlocked count cannot be conjured.
      for (var n = 1; n < o.unlocked; n++) {
        if (typeof o.best[String(n)] !== 'number') return false;
      }
      // Career counters are displayed and added to, so they must be sane.
      if (o.kills !== undefined && !isCount(o.kills)) return false;
      if (o.sorties !== undefined && !isCount(o.sorties)) return false;
      if (o.aces !== undefined && !isCount(o.aces)) return false;
      if (o.tutorialDone !== undefined && typeof o.tutorialDone !== 'boolean') return false;
      if (o.tilt !== undefined && typeof o.tilt !== 'boolean') return false;
      return true;
    },
    onPause: function () { if (Game.scene && Game.scene.onKitPause) Game.scene.onKitPause(); },
    onResume: function () { if (Game.scene && Game.scene.onKitResume) Game.scene.onKitResume(); },
    onRestart: function () { if (Game.scene && Game.scene.onKitRestart) Game.scene.onKitRestart(); }
  });

  var DEFAULT_PROFILE = {
    version: 1, xp: 0, unlocked: 1, plane: 'kestrel', best: {},
    tutorialDone: false, kills: 0, sorties: 0, aces: 0, tilt: false
  };
  var profile = kit.save.get(null);
  if (!profile) profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  // validateSave already rejected anything malformed, so these only fill in
  // fields added after a save was first written.
  if (typeof profile.tutorialDone !== 'boolean') profile.tutorialDone = false;
  if (!isCount(profile.kills)) profile.kills = 0;
  if (!isCount(profile.sorties)) profile.sorties = 0;
  if (!isCount(profile.aces)) profile.aces = 0;
  if (typeof profile.tilt !== 'boolean') profile.tilt = false;
  profile.unlocked = clamp(Math.floor(profile.unlocked), 1, SORTIES.length);
  function saveProfile() { kit.save.set(profile); }
  function planeUnlocked(a) { return rankIndex(profile.xp) >= a.rank; }

  // VOICE LIMITER: a furball can land a dozen identical gun or hit cues in a
  // single frame. Each one builds a BufferSource plus a Gain plus a promise
  // chain, so collapsing repeats of the hot cues inside a short window keeps
  // the audio graph churn out of the hot loop. Nothing audible is lost: the
  // ear cannot separate two copies of the same transient 40 ms apart.
  var SFX_GAP = { gun: 40, gunWing: 60, foeGun: 70, hit: 45, kill: 70 };
  var _sfxLast = {};
  function sfx(name, opts) {
    var gap = SFX_GAP[name];
    if (gap) {
      var now = performance.now();
      if (now - (_sfxLast[name] || -1e9) < gap) return;
      _sfxLast[name] = now;
    }
    kit.audio.sfx(name, opts);
  }

  var Game = { scene: null, phaser: null };
  var DPR = 1;

  function densityCamera(scene, w, h) {
    scene.cameras.main.setZoom(DPR);
    scene.cameras.main.centerOn(w / 2, h / 2);
  }
  // Verification uses the live simulation state. The forceDrop switch is
  // intentionally tiny and inert unless a verifier flips it.
  window.__av = window.__av || { state: null, forceDrop: false };

  // Safe-area insets, read from CSS env() through a probe element. The canvas
  // is full bleed, so the HUD is inset here rather than the page. The insets
  // are RE-READ on every resize/orientation change: a notch that sits on the
  // left in one landscape sits on the right in the other, and a value read
  // once at boot is wrong for half of the device's orientations.
  var SAFE = { t: 0, r: 0, b: 0, l: 0 };
  var _safeProbe = null;
  function readSafeArea() {
    if (!_safeProbe) {
      _safeProbe = document.createElement('div');
      _safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
        'pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left);';
      document.body.appendChild(_safeProbe);
    }
    var cs = getComputedStyle(_safeProbe);
    SAFE.t = parseFloat(cs.paddingTop) || 0;
    SAFE.r = parseFloat(cs.paddingRight) || 0;
    SAFE.b = parseFloat(cs.paddingBottom) || 0;
    SAFE.l = parseFloat(cs.paddingLeft) || 0;
    return SAFE;
  }
  readSafeArea();

  // ------------------------------------------------------- branded loader
  // GGKit still owns the loader lifecycle: show/progress/hide all go through
  // kit.loader. This wrapper drives the Ace Vector boot composition in
  // index.html on top of it, so the first frame a player sees is art directed
  // rather than a grey bar, and reports what the game is actually doing.
  var Boot = (function () {
    var box = document.getElementById('av-boot');
    var bar = document.getElementById('av-boot-bar');
    var status = document.getElementById('av-boot-status');
    return {
      show: function (title) { kit.loader.show(title); },
      progress: function (f, note) {
        kit.loader.progress(f);
        if (bar) bar.style.width = (clamp(f, 0, 1) * 100).toFixed(1) + '%';
        if (note && status && status.textContent !== note) status.textContent = note;
      },
      hide: function () {
        kit.loader.hide();
        if (box) {
          box.classList.add('gone');
          var b = box;
          setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 520);
          box = bar = status = null;
        }
      }
    };
  }());

  // ------------------------------------------------ baked environment art
  // Everything below is drawn ONCE into canvas textures during the loading
  // screen. Two reasons: the parallax bands need genuinely different cloud
  // artwork per depth (a far cloud is not a near cloud at 40% scale), and a
  // baked texture is one quad per frame where a Graphics is a rebuilt
  // geometry buffer per frame.

  // Soft cumulus billboards. `soft` blurs the silhouette for distance, `rim`
  // adds a sun-lit crown, `n` sets how lumpy the stack is.
  function bakeCloudSheet(scene, key, opts) {
    if (scene.textures.exists(key)) return key;
    var CW = 200, CH = 120;
    var tex = scene.textures.createCanvas(key, CW * 2, CH * 2);
    var ctx = tex.getContext();
    vseed(opts.seed);
    for (var f = 0; f < 4; f++) {
      var ox = (f % 2) * CW, oy = ((f / 2) | 0) * CH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, CW, CH);
      ctx.clip();
      ctx.filter = 'blur(' + opts.soft + 'px)';
      // Body: a stack of lobes sitting on a flat base, the classic cumulus read.
      var lobes = opts.n;
      for (var i = 0; i < lobes; i++) {
        var t = i / (lobes - 1);
        var lx = ox + CW * (0.16 + t * 0.68) + (vrand() - 0.5) * 18;
        var ly = oy + CH * (0.66 - Math.sin(t * Math.PI) * 0.30) + (vrand() - 0.5) * 8;
        var lr = CH * (0.16 + Math.sin(t * Math.PI) * 0.20 + vrand() * 0.06);
        var g = ctx.createRadialGradient(lx, ly - lr * 0.25, lr * 0.1, lx, ly, lr);
        g.addColorStop(0, 'rgba(255,255,255,' + opts.core + ')');
        g.addColorStop(0.62, 'rgba(255,255,255,' + (opts.core * 0.72).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (opts.rim > 0) {
        // Sun-lit crown: a second, tighter pass along the upper lobes only.
        for (i = 0; i < lobes; i++) {
          var t2 = i / (lobes - 1);
          var rx = ox + CW * (0.18 + t2 * 0.66);
          var ry = oy + CH * (0.60 - Math.sin(t2 * Math.PI) * 0.32);
          var rr = CH * (0.10 + Math.sin(t2 * Math.PI) * 0.13);
          var rg = ctx.createRadialGradient(rx, ry - rr * 0.5, 0, rx, ry - rr * 0.3, rr);
          rg.addColorStop(0, 'rgba(255,255,255,' + opts.rim + ')');
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(rx, ry - rr * 0.3, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    tex.refresh();
    for (var k = 0; k < 4; k++) {
      tex.add('c' + k, 0, (k % 2) * CW, ((k / 2) | 0) * CH, CW, CH);
    }
    return key;
  }

  // The middle terrain layer the far/near pair was missing. Seamless by
  // construction: every sine harmonic completes a whole number of cycles
  // across the strip, so tilePositionX can run forever without a seam.
  function bakeMidRidge(scene) {
    var key = 'ridge_mid';
    if (scene.textures.exists(key)) return key;
    var W = 512, H = 120;
    var tex = scene.textures.createCanvas(key, W, H);
    var ctx = tex.getContext();
    vseed(0x3d17);
    var harm = [];
    for (var i = 0; i < 5; i++) {
      harm.push({ k: i + 1, a: (26 / (i + 1)) * (0.6 + vrand() * 0.8), p: vrand() * Math.PI * 2 });
    }
    function crest(x) {
      var y = H * 0.34;
      for (var j = 0; j < harm.length; j++) {
        y += Math.sin((x / W) * Math.PI * 2 * harm[j].k + harm[j].p) * harm[j].a;
      }
      return y;
    }
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var x = 0; x <= W; x++) ctx.lineTo(x, crest(x));
    ctx.lineTo(W, H);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(210,210,210,1)');
    g.addColorStop(1, 'rgba(150,150,150,1)');
    ctx.fillStyle = g;
    ctx.fill();
    // Material detail: gully shading down the sun-away face of each crest,
    // and a thin lit edge on the crest itself. Tinted per theme in game.
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = 'rgba(90,90,90,1)';
    ctx.lineWidth = 1.4;
    for (var gI = 0; gI < 46; gI++) {
      var gx = vrand() * W;
      var gy = crest(gx);
      ctx.beginPath();
      ctx.moveTo(gx, gy + 2);
      ctx.lineTo(gx + (vrand() - 0.5) * 16, gy + 14 + vrand() * 30);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (x = 0; x <= W; x++) {
      if (x === 0) ctx.moveTo(x, crest(x)); else ctx.lineTo(x, crest(x));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    tex.refresh();
    return key;
  }

  // =====================================================================
  //  BOOT SCENE - loads behind the GGKit loader with real progress
  // =====================================================================
  var BootScene = {
    key: 'boot',
    preload: function () {
      Boot.show('Ace Vector');
      this.load.on('progress', function (p) { Boot.progress(p * 0.55, 'LOADING SQUADRON'); });
      this.load.atlas('air', 'assets/air.png', 'assets/air.json');
      this.load.atlas('ui', 'assets/ui.png', 'assets/ui.json');
      this.load.image('clouds', 'assets/clouds.png');
      this.load.image('ridge_far', 'assets/ridge_far.png');
      this.load.image('ridge_near', 'assets/ridge_near.png');
      this.load.image('disc', 'assets/disc.png');
      var parts = ['p_spark', 'p_smoke', 'p_fire', 'p_flare', 'p_wisp'];
      for (var i = 0; i < parts.length; i++) this.load.image(parts[i], 'assets/' + parts[i] + '.png');
    },
    create: function () {
      var scene = this;
      densityCamera(this, this.scale.width / DPR, this.scale.height / DPR);
      // The cloud sheet ships as one image; slice it into four billboards so
      // parallax bands can pick different silhouettes.
      var tex = this.textures.get('clouds');
      var cw = tex.getSourceImage().width / 2, ch = tex.getSourceImage().height / 2;
      for (var i = 0; i < 4; i++) tex.add('c' + i, 0, (i % 2) * cw, ((i / 2) | 0) * ch, cw, ch);

      Boot.progress(0.62, 'PAINTING THE SKY');
      // Three genuinely different cloud sheets, one per parallax band: far is
      // a flat haze-bound smudge, mid is a readable cumulus, near is a big
      // high-contrast billboard with a sun crown. This is what gives the
      // furball depth rather than one sheet drawn at three scales.
      bakeCloudSheet(this, 'cloud_far', { seed: 11, soft: 7, n: 5, core: 0.42, rim: 0 });
      bakeCloudSheet(this, 'cloud_mid', { seed: 23, soft: 3, n: 6, core: 0.68, rim: 0.22 });
      bakeCloudSheet(this, 'cloud_near', { seed: 41, soft: 1.5, n: 7, core: 0.86, rim: 0.42 });
      bakeMidRidge(this);

      this.anims.create({
        key: 'prop', frames: [{ key: 'ui', frame: 'prop_0' }, { key: 'ui', frame: 'prop_1' },
                              { key: 'ui', frame: 'prop_2' }],
        frameRate: 26, repeat: -1
      });

      kit.audio.register({
        gun: 'assets/sfx_gun.mp3', gunWing: 'assets/sfx_gun_wing.mp3',
        foeGun: 'assets/sfx_foe_gun.mp3', hit: 'assets/sfx_hit.mp3',
        kill: 'assets/sfx_kill.mp3', aceKill: 'assets/sfx_ace_kill.mp3',
        hurt: 'assets/sfx_hurt.mp3', missile: 'assets/sfx_missile.mp3',
        lock: 'assets/sfx_lock.mp3', flare: 'assets/sfx_flare.mp3',
        sortie: 'assets/sfx_sortie.mp3', clear: 'assets/sfx_clear.mp3',
        rank: 'assets/sfx_rank.mp3', eject: 'assets/sfx_eject.mp3',
        fail: 'assets/sfx_fail.mp3', click: 'assets/sfx_click.mp3',
        select: 'assets/sfx_select.mp3',
        musicCruise: 'assets/music_cruise.mp3', musicCombat: 'assets/music_combat.mp3'
      });
      // ---- warm-up. FEEL GATE: the loading screen stays up until every unit
      // of first-play work has already been paid for. In fix round 1 that
      // list grew from "some audio" to the whole set, because anything left
      // out of it lands as a multi-hundred-millisecond hitch in the first
      // seconds of the measured trace:
      //   1. the bundled display/body fonts (a webfont that resolves late
      //      re-rasterises every Text object at once)
      //   2. every sky gradient, all five, baked before any of them is needed
      //   3. every atlas frame and loose texture uploaded to the GPU
      //   4. the audio cues the opening sortie can fire
      // The remaining audio (both 26 s music stems and the rarer cues) is
      // decoded AFTER the loader hides, one file at a time on an idle
      // callback, so a 300 KB decode can never share a frame with the sim.
      Boot.progress(0.66, 'WARMING TYPE');

      var fontsReady = (document.fonts && document.fonts.load)
        ? Promise.all([
            document.fonts.load('700 32px "AV Display"'),
            document.fonts.load('400 14px "AV Body"'),
            document.fonts.load('700 14px "AV Body"')
          ]).catch(function () { return null; })
        : Promise.resolve(null);

      Boot.progress(0.72, 'BAKING SKIES');
      for (var tk in THEMES) skyTexture(this, tk);

      Boot.progress(0.80, 'UPLOADING TEXTURES');
      // Pre-warm the GPU: uploading every texture during the loading screen
      // keeps the first furball free of first-draw hitches.
      var warm = this.add.container(-9999, -9999);
      ['air', 'ui'].forEach(function (k) {
        var frames = scene.textures.get(k).getFrameNames();
        for (var i = 0; i < frames.length; i++) warm.add(scene.add.image(0, 0, k, frames[i]));
      });
      ['clouds', 'cloud_far', 'cloud_mid', 'cloud_near', 'ridge_far', 'ridge_mid',
       'ridge_near', 'disc', 'p_spark', 'p_smoke', 'p_fire', 'p_flare', 'p_wisp',
       'sky_dawn', 'sky_noon', 'sky_dusk', 'sky_storm', 'sky_night']
        .forEach(function (k) { warm.add(scene.add.image(0, 0, k)); });
      // A Text object is a canvas of its own, and the first one built in a
      // scene pays for the font rasteriser. Pay for it here, at both sizes
      // the HUD uses, instead of on the frame the first banner appears.
      warm.add(this.add.text(0, 0, 'ACE VECTOR 0123456789',
        { fontFamily: FONT_DISPLAY, resolution: GGKit.hiDpi.dpr(), fontSize: '30px', color: '#ffffff' }));
      warm.add(this.add.text(0, 0, 'ace vector 0123456789',
        { fontFamily: FONT_BODY, resolution: GGKit.hiDpi.dpr(), fontSize: '13px', color: '#ffffff' }));

      Boot.progress(0.86, 'ARMING CANNON');
      var firstPlay = ['gun', 'gunWing', 'foeGun', 'hit', 'kill', 'hurt', 'click',
                       'select', 'sortie', 'lock', 'missile', 'flare'];
      Promise.all([fontsReady, kit.audio.preload(firstPlay)]).then(function () {
        Boot.progress(1, 'READY');
        // One frame of held loader so the warm container's uploads have
        // actually been flushed through a render before anything is timed.
        scene.time.delayedCall(60, function () {
          warm.destroy(true);
          Boot.hide();
          scene.scene.start('title');
          idleDecodeRest();
        });
      });
    }
  };

  // Decode the leftovers one at a time, each on its own idle slice. Chaining
  // rather than Promise.all matters: kit.audio.preload() with no argument
  // fires every fetch and decode at once, and two 300 KB stems decoding in
  // the same frame is exactly the spike the feel gate was catching.
  function idleDecodeRest() {
    var rest = ['aceKill', 'clear', 'fail', 'rank', 'eject', 'musicCruise', 'musicCombat'];
    var i = 0;
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 90); };
    function next() {
      if (i >= rest.length) return;
      var name = rest[i++];
      kit.audio.preload([name]).then(function () { idle(next, { timeout: 1500 }); });
    }
    idle(next, { timeout: 1500 });
  }

  // =====================================================================
  //  Shared UI chrome
  // =====================================================================
  // TYPE SCALE. A bundled display/body pair replaces the system Verdana the
  // art review called out: Kenney Future for anything that has to read as a
  // heading or a number at arm's length, Kenney Future Narrow for body copy
  // and dense HUD rows. Both are subset to printable ASCII (about 1.4 KB
  // each) and are warmed on the loading screen, so no Text object is ever
  // rasterised twice because a webfont resolved late.
  var FONT_DISPLAY = '"AV Display", Verdana, Geneva, system-ui, sans-serif';
  var FONT_BODY = '"AV Body", Verdana, Geneva, system-ui, sans-serif';
  var FONT = FONT_BODY;
  // Minimum readable sizes at 390 px. Nothing in the play HUD goes below
  // TYPE.micro, which the review set at the premium-mobile floor.
  var TYPE = {
    hero: 44, title: 30, head: 20, sub: 15, body: 13, micro: 11.5, tiny: 10.5
  };
  // Separator glyph: the subset does not carry U+00B7, and a missing glyph
  // falls back to a different face mid-line.
  var SEP = '   /   ';

  function hudText(scene, x, y, str, size, color, weight) {
    return scene.add.text(x, y, str, {
      fontFamily: size >= TYPE.sub ? FONT_DISPLAY : FONT_BODY,
      fontSize: size + 'px', color: color || '#e8f6ff',
      fontStyle: weight || 'bold', align: 'center'
    }).setOrigin(0.5);
  }

  // Nine-slice chrome. The atlas panels were previously stretched to every
  // button size, which smeared their border into a different thickness on
  // every control; a nine-slice keeps one authored corner radius everywhere.
  function panel(scene, x, y, w, h, hot) {
    var p = scene.add.nineslice(x, y, 'ui', hot ? 'panel_hot' : 'panel', w, h, 14, 14, 14, 14);
    return p;
  }

  function makeButton(scene, x, y, w, h, label, onTap, tone) {
    var c = scene.add.container(x, y);
    var hot = tone === 'primary';
    var glow = scene.add.image(0, 0, 'disc').setDisplaySize(w * 1.1, h * 1.5)
      .setTint(hot ? 0x8effe0 : 0x4b8cbe).setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    var bg = panel(scene, 0, 0, w, h, hot);
    var txt = hudText(scene, 0, 0, label, hot ? TYPE.sub + 1 : TYPE.body + 1,
                      hot ? '#d6fff2' : '#bcd9ea');
    c.add([glow, bg, txt]);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', function () { glow.setAlpha(0.30); });
    bg.on('pointerout', function () { glow.setAlpha(0.16); });
    bg.on('pointerdown', function (p, lx, ly, ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      sfx('click');
      // House motion: press is a real anticipate/return, not a linear dip.
      if (motionEnabled()) scene.tweens.add({ targets: c, scaleX: 0.94, scaleY: 0.94, duration: 80, yoyo: true,
        ease: 'Back.easeOut' });
      onTap();
    });
    c.hitBg = bg;
    c.label = txt;
    return c;
  }

  // Menu/overlay transition vocabulary: everything that arrives, arrives the
  // same way. Slide-and-settle in, wipe out, both on the house easing.
  function enterFrom(scene, obj, dx, dy, delay) {
    var x = obj.x, y = obj.y;
    if (!motionEnabled()) return obj.setAlpha(1).setPosition(x, y);
    obj.setAlpha(0).setPosition(x + (dx || 0), y + (dy || 0));
    scene.tweens.add({ targets: obj, x: x, y: y, alpha: 1, duration: 340,
                       delay: delay || 0, ease: 'Cubic.easeOut' });
    return obj;
  }

  function sceneSwap(scene, key, data) {
    if (scene._swapping) return;
    scene._swapping = true;
    var w = scene.scale.width / DPR, h = scene.scale.height / DPR;
    densityCamera(scene, w, h);
    if (!motionEnabled()) { scene.scene.start(key, data); return; }
    var wipe = scene.add.rectangle(w / 2, h / 2, w * 1.2, h * 1.2, 0x04091a, 0)
      .setDepth(9999);
    scene.tweens.add({
      targets: wipe, alpha: 1, duration: 190, ease: 'Quad.easeIn',
      onComplete: function () { scene.scene.start(key, data); }
    });
  }

  // Bakes a themed sky into a canvas texture ONCE per theme and returns the
  // key. A Phaser Graphics is re-tessellated and re-uploaded every frame, and
  // a 56-band gradient that never changes has no business costing anything
  // per frame; one stretched image costs a single quad.
  function rgba(c, a) {
    return 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',' + a + ')';
  }

  // FEEL GATE, fill rate. This used to be an 8 x 512 strip stretched across
  // the screen, with the sun bloom, the horizon haze band and the vignette
  // each drawn on top of it as their own large blended quad. On a software
  // rasteriser under 4x CPU throttle those three extra full-screen-ish
  // blends were the dominant per-frame cost. They are all static, so they
  // are baked into the sky itself: one opaque quad, no blend, no overdraw.
  // A small additive sun CORE is still drawn live, because its bloom pulse
  // is the one part of this that moves.
  function skyTexture(scene, theme) {
    var key = 'sky_' + theme;
    var t = THEMES[theme] || THEMES.noon;
    if (scene.textures.exists(key)) return key;
    var W = 192, H = 192;
    var tex = scene.textures.createCanvas(key, W, H);
    var ctx = tex.getContext();

    var grd = ctx.createLinearGradient(0, 0, 0, H);
    var stops = t.sky;
    for (var i = 0; i < stops.length; i++) {
      grd.addColorStop(i / (stops.length - 1), rgba(stops[i], 1));
    }
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Sun bloom, baked. Stretching a soft radial to the viewport turns it
    // into a soft ellipse, which is what atmospheric scatter looks like
    // anyway at these aspect ratios.
    var sx = W * 0.78, sy = H * t.sunY, sr = H * 0.62;
    var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, rgba(t.sun, 0.55));
    sg.addColorStop(0.35, rgba(t.sun, 0.20));
    sg.addColorStop(1, rgba(t.sun, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);

    // ATMOSPHERIC PERSPECTIVE: a haze wedge at the horizon that the terrain
    // layers sit inside, so far ridges dissolve into the sky and near ridges
    // do not. Previously a separate additive quad.
    var hz = ctx.createLinearGradient(0, H * 0.52, 0, H * 0.94);
    hz.addColorStop(0, rgba(t.haze, 0));
    hz.addColorStop(0.55, rgba(t.haze, 0.34));
    hz.addColorStop(1, rgba(t.haze, 0.16));
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.52, W, H * 0.42);

    // Vignette, baked. Keeps HUD text legible over a bright dawn without
    // paying for a 2x-oversized alpha quad every frame.
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    tex.refresh();
    return key;
  }

  // A slow scrolling sky used behind every menu, so no menu is a flat fill.
  // The vignette and haze are already inside the sky texture, so this adds a
  // three-band parallax and nothing else.
  function menuBackdrop(scene, theme) {
    var w = scene.scale.width / DPR, h = scene.scale.height / DPR;
    densityCamera(scene, w, h);
    var t = THEMES[theme] || THEMES.noon;
    var g = scene.add.image(0, 0, skyTexture(scene, theme)).setOrigin(0, 0)
      .setDisplaySize(w, h).setDepth(0);
    scene.cameras.main.setBackgroundColor(t.sky[0]);
    var sun = scene.add.image(w * 0.78, h * t.sunY, 'disc').setDepth(1)
      .setDisplaySize(h * 0.42, h * 0.42).setTint(t.sun).setAlpha(0.30)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (motionEnabled()) scene.tweens.add({ targets: sun, alpha: 0.18, duration: 4200, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut' });
    var clouds = [];
    vseed(7);
    var sheets = [
      { key: 'cloud_far', n: 3, sc: 0.52, al: 0.30, sp: 4, y0: 0.10, y1: 0.44, dep: 2 },
      { key: 'cloud_mid', n: 3, sc: 0.86, al: 0.42, sp: 11, y0: 0.16, y1: 0.56, dep: 3 },
      { key: 'cloud_near', n: 2, sc: 1.25, al: 0.28, sp: 26, y0: 0.20, y1: 0.72, dep: 6 }
    ];
    for (var si = 0; si < sheets.length; si++) {
      var sh = sheets[si];
      for (var i = 0; i < sh.n; i++) {
        var c = scene.add.image(vrand() * (w + 260) - 130,
                                h * (sh.y0 + vrand() * (sh.y1 - sh.y0)),
                                sh.key, 'c' + ((vrand() * 4) | 0))
          .setDepth(sh.dep).setScale(sh.sc * (0.8 + vrand() * 0.4))
          .setAlpha(sh.al).setTint(t.cloud);
        c.driftV = sh.sp;
        clouds.push(c);
      }
    }
    // Ridge strips are placed by CREST, not by top edge: ridge_far's crest sits
    // 62 px into its texture and ridge_near's 84 px, so the near mass reaches
    // the bottom of the screen instead of showing only its treeline. The mid
    // strip sits between them and carries the authored gully detail.
    var far = scene.add.tileSprite(0, h - 152, w, 104, 'ridge_far')
      .setOrigin(0, 0).setDepth(4).setTint(t.ridge).setAlpha(0.85);
    var mid = scene.add.tileSprite(0, h - 132, w, 118, 'ridge_mid')
      .setOrigin(0, 0).setDepth(5).setTint(t.ridgeM).setAlpha(0.95);
    var near = scene.add.tileSprite(0, h - 106, w, 148, 'ridge_near')
      .setOrigin(0, 0).setDepth(7).setTint(t.ridge2);
    function drift(time, delta) {
      if (!motionEnabled()) return;
      var dt = delta / 1000;
      far.tilePositionX += 5 * dt;
      mid.tilePositionX += 12 * dt;
      near.tilePositionX += 24 * dt;
      for (var i = 0; i < clouds.length; i++) {
        var c = clouds[i];
        c.x -= c.driftV * dt;
        if (c.x < -190) c.x = w + 190;
      }
    }
    // Registered per create(); removed on shutdown so a re-entered menu never
    // stacks a second drift handler and doubles the parallax speed.
    scene.events.on('update', drift);
    scene.events.once('shutdown', function () { scene.events.off('update', drift); });
    return g;
  }

function settingsRows(scene) {
    return [function (box, row) {
      row('Fullscreen', function () { return !!document.fullscreenElement; },
        function (v) { if (v) kit.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
      // The settings row IS the user gesture iOS wants, so this is the only
      // place the sensor permission is ever requested.
      row('Tilt steering', function () { return Tilt.wanted; },
        function (v) { Tilt.enable(v, true); });
      row('Music bus', function () { return kit.audio.prefs.music > 0; },
        function (v) { kit.audio.setMusicVolume(v ? 0.72 : 0); });
      row('SFX bus', function () { return kit.audio.prefs.sfx > 0; },
        function (v) { kit.audio.setSfxVolume(v ? 1 : 0); });
    }];
  }

  // ---------------------------------------------------------------- tilt
  // Optional device-tilt steering beside the stick, per the slate row. Off by
  // default: iOS gates the sensor behind a permission prompt that is only
  // granted inside a user gesture, so a saved preference is REMEMBERED at
  // boot but not acted on until the player next touches the Settings row.
  // Requesting at boot is what silently and permanently turned the
  // preference back off on iOS.
  var Tilt = {
    wanted: false,      // what the player asked for, and what is persisted
    active: false,      // sensor actually attached and delivering
    pending: false,     // wanted, but waiting for a gesture to ask permission
    value: 0, base: null,
    _handler: null,

    needsPermission: function () {
      var DOE = window.DeviceOrientationEvent;
      return !!(DOE && typeof DOE.requestPermission === 'function');
    },

    init: function () {
      // Preference lives in the GGKit-guarded profile, not a raw
      // localStorage key: private mode throws on write, and the kit's
      // memory fallback plus save validation cover both.
      this.wanted = profile.tilt === true;
      if (!this.wanted) return;
      if (this.needsPermission()) this.pending = true;  // wait for a gesture
      else this.attach();
    },

    // Axis transform. `beta` is front-to-back tilt in the DEVICE frame, so in
    // landscape the axis the player is actually pitching with is `gamma`, and
    // its sign flips between the two landscape orientations. Reading beta
    // unconditionally steered sideways in one landscape and backwards in the
    // other.
    read: function (e) {
      var a = 0;
      if (screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle;
      else if (typeof window.orientation === 'number') a = (window.orientation + 360) % 360;
      var beta = e.beta || 0, gamma = e.gamma || 0;
      if (a === 90) return -gamma;
      if (a === 270 || a === -90) return gamma;
      if (a === 180) return -beta;
      return beta;
    },

    attach: function () {
      if (this._handler) return;
      var self = this;
      this._handler = function (e) {
        if (!self.active) return;
        var raw = self.read(e);
        if (self.base === null) self.base = raw;
        self.value = clamp((raw - self.base) / 26, -1, 1);
      };
      window.addEventListener('deviceorientation', this._handler);
      this.active = true;
      this.pending = false;
      this.base = null;
    },

    detach: function () {
      if (this._handler) window.removeEventListener('deviceorientation', this._handler);
      this._handler = null;
      this.active = false;
      this.value = 0;
      this.base = null;
    },

    // `gesture` is true only when called from a real user interaction.
    enable: function (on, gesture) {
      var self = this;
      this.wanted = !!on;
      profile.tilt = !!on;
      saveProfile();
      if (!on) { this.pending = false; this.detach(); return; }
      if (!window.DeviceOrientationEvent) {
        this.wanted = false; profile.tilt = false; saveProfile();
        return;
      }
      if (!this.needsPermission()) { this.attach(); return; }
      if (!gesture) { this.pending = true; return; }
      window.DeviceOrientationEvent.requestPermission().then(function (r) {
        if (r === 'granted') self.attach();
        else {
          // Denied is a real answer: stop asking and stop claiming it is on.
          self.wanted = false; self.pending = false;
          profile.tilt = false; saveProfile();
        }
      }).catch(function () { self.pending = true; });
    },

    recentre: function () { this.base = null; this.value = 0; }
  };
  Tilt.init();

  // =====================================================================
  //  TITLE SCENE
  // =====================================================================
  var TitleScene = {
    key: 'title',
    create: function () {
      Game.scene = this;
      var scene = this;
      var w = this.scale.width / DPR, h = this.scale.height / DPR;
      densityCamera(this, w, h);
      menuBackdrop(this, 'dawn');
      kit.audio.music('musicCruise', 900);

      var plane = AIRFRAME_BY_ID[profile.plane] || AIRFRAMES[0];
      var hero = this.add.image(w * 0.26, h * 0.46, 'air', plane.frame + '_lvl')
        .setDepth(10).setScale(1.5);
      var heroGlow = this.add.image(hero.x, hero.y, 'disc').setDepth(9)
        .setDisplaySize(190, 190).setTint(plane.tint).setAlpha(0.35)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: [hero, heroGlow], y: '-=10', duration: 2100, yoyo: true,
                        repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: heroGlow, alpha: 0.18, duration: 1500, yoyo: true,
                        repeat: -1, ease: 'Sine.easeInOut' });
      var trail = this.add.particles(0, 0, 'p_flare', {
        lifespan: 620, speed: { min: 20, max: 60 }, angle: { min: 170, max: 190 },
        scale: { start: 0.34, end: 0 }, alpha: { start: 0.6, end: 0 },
        blendMode: 'ADD', frequency: 60, tint: plane.tint
      }).setDepth(8);
      trail.startFollow(hero, -46, 2);

      var tx = w * 0.66;
      var t1 = hudText(this, tx, h * 0.30, 'ACE', TYPE.hero + 8, '#fff6dd').setDepth(12);
      var t2 = hudText(this, tx, h * 0.30 + 44, 'VECTOR', TYPE.hero - 4, '#8fe6ff').setDepth(12);
      t1.setAlpha(0); t2.setAlpha(0);
      this.tweens.add({ targets: t1, alpha: 1, y: h * 0.30 - 6, duration: 620, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: t2, alpha: 1, y: h * 0.30 + 38, duration: 620, delay: 120,
                        ease: 'Cubic.easeOut' });
      hudText(this, tx, h * 0.30 + 74, 'FOURTEEN SORTIES. ONE SQUADRON.', TYPE.tiny, '#a8c8dc', 'normal')
        .setDepth(12);

      var ri = rankIndex(profile.xp);
      var fly = makeButton(this, tx, h * 0.60, 236, 52,
        profile.unlocked > 1 || profile.tutorialDone ? 'FLY' : 'FIRST SORTIE',
        function () { scene.go('hangar'); }, 'primary').setDepth(12);
      var bSet = makeButton(this, tx - 62, h * 0.60 + 64, 112, 44, 'SETTINGS',
        function () { kit.openSettings(settingsRows(scene)); }).setDepth(12);
      var bCred = makeButton(this, tx + 62, h * 0.60 + 64, 112, 44, 'CREDITS',
        function () { showCredits(scene); }).setDepth(12);
      enterFrom(this, fly, 0, 26, 220);
      enterFrom(this, bSet, 0, 26, 300);
      enterFrom(this, bCred, 0, 26, 340);

      hudText(this, w / 2, h - 20 - SAFE.b,
        RANKS[ri].name.toUpperCase() + SEP + profile.kills + ' CONFIRMED' + SEP + 'SORTIE ' +
        profile.unlocked + ' OF ' + SORTIES.length, TYPE.tiny, '#8fb2c6', 'normal').setDepth(12);

      var hint = hudText(this, tx, h - 36 - SAFE.b, 'TAP ANYWHERE TO CONTINUE', TYPE.tiny,
        '#7fa3b8', 'normal').setDepth(12);
      this.tweens.add({ targets: hint, alpha: 0.35, duration: 1100, yoyo: true, repeat: -1,
                        ease: 'Sine.easeInOut' });
      // `over` is the list of interactive objects under the pointer, so the
      // three buttons keep their own behaviour and a tap on bare sky advances.
      // `scene.modal` is the credits guard: while a modal owns the screen the
      // title's own handlers must not fire underneath it.
      this.input.on('pointerdown', function (p, over) {
        if (scene.modal || (over && over.length)) return;
        sfx('click');
        scene.go('hangar');
      });
      this.input.keyboard.on('keydown-ENTER', function () { if (!scene.modal) scene.go('hangar'); });
      this.input.keyboard.on('keydown-SPACE', function () { if (!scene.modal) scene.go('hangar'); });
    },

    go: function (key) { sceneSwap(this, key); }
  };

  // Art-directed overlay shell. Every modal in the game (credits, pause,
  // debrief) is built on this: a themed sky plate with its own ridge line and
  // a scrim, not a flat rectangle, and an interactive backdrop that actually
  // BLOCKS the screen underneath it.
  function overlayShell(scene, theme, depth, scrim) {
    var w = scene.scale.width / DPR, h = scene.scale.height / DPR;
    var box = scene.add.container(0, 0).setDepth(depth);
    // Modal backdrop: interactive, so nothing under it can be clicked, and
    // swallowing the event so a button that happens to sit underneath does
    // not also fire.
    var block = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.001)
      .setInteractive();
    block.on('pointerdown', function (p, x, y, ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); });
    var plate = scene.add.image(0, 0, skyTexture(scene, theme)).setOrigin(0, 0)
      .setDisplaySize(w, h).setAlpha(0.96);
    var ridge = scene.add.tileSprite(0, h - 96, w, 118, 'ridge_mid')
      .setOrigin(0, 0).setTint(THEMES[theme].ridge2).setAlpha(0.9);
    var wash = scene.add.rectangle(w / 2, h / 2, w, h, 0x04091a, scrim == null ? 0.62 : scrim);
    box.add([block, plate, ridge, wash]);
    box.plate = plate;
    box.ridge = ridge;
    if (motionEnabled()) scene.tweens.add({ targets: ridge, tilePositionX: '+=140', duration: 24000, repeat: -1 });
    box.setAlpha(0);
    if (motionEnabled()) scene.tweens.add({ targets: box, alpha: 1, duration: 220, ease: 'Quad.easeOut' });
    else box.setAlpha(1);
    return box;
  }

  function showCredits(scene) {
    if (scene.modal) return;
    kit.pause('credits');
    var w = scene.scale.width / DPR, h = scene.scale.height / DPR;
    var box = overlayShell(scene, 'dusk', 900, 0.72);
    scene.modal = box;
    var lines = [
      ['ACE VECTOR', TYPE.head, '#fff6dd', 'bold'],
      ['', TYPE.micro, '#b9d5e6', 'normal'],
      ['Design, code, art and audio by GreenGuard USA.', TYPE.micro, '#b9d5e6', 'normal'],
      ['Every sprite, particle texture, sound cue and music', TYPE.micro, '#b9d5e6', 'normal'],
      ['stem in this game is original work, released CC0.', TYPE.micro, '#b9d5e6', 'normal'],
      ['', TYPE.micro, '#b9d5e6', 'normal'],
      ['Type: Kenney Future and Kenney Future Narrow, CC0.', TYPE.micro, '#9dc2d6', 'normal'],
      ['Engine: Phaser 3. Studio kit: GGKit.', TYPE.micro, '#9dc2d6', 'normal'],
      ['Full trace: LICENSES.md', TYPE.micro, '#9dc2d6', 'normal']
    ];
    for (var i = 0; i < lines.length; i++) {
      var ln = hudText(scene, w / 2, h * 0.17 + i * 20, lines[i][0], lines[i][1],
                       lines[i][2], lines[i][3]);
      box.add(ln);
      if (lines[i][0]) enterFrom(scene, ln, 0, 12, 60 + i * 26);
    }
    box.add(makeButton(scene, w / 2, h - 40 - SAFE.b, 170, 42, 'BACK', function () {
      scene.tweens.add({
        targets: box, alpha: 0, duration: 180,
        onComplete: function () { box.destroy(true); scene.modal = null; kit.resume('credits'); }
      });
    }, 'primary'));
    scene.events.once('shutdown', function () { scene.modal = null; });
  }

  // =====================================================================
  //  HANGAR SCENE - airframe select, rank, and the sortie ladder
  // =====================================================================
  var HangarScene = {
    key: 'hangar',
    create: function () {
      Game.scene = this;
      var scene = this;
      var w = this.scale.width / DPR, h = this.scale.height / DPR;
      densityCamera(this, w, h);
      menuBackdrop(this, 'noon');
      kit.audio.music('musicCruise', 700);

      // HANGAR HERO: the airframe you are about to fly gets a presentation of
      // its own, lit and trailing, rather than living only as a 104 px card.
      var heroPlane = AIRFRAME_BY_ID[profile.plane] || AIRFRAMES[0];
      this.heroGlow = this.add.image(w * 0.40, h * 0.34, 'disc').setDepth(8)
        .setDisplaySize(230, 230).setTint(heroPlane.tint).setAlpha(0.30)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.hero = this.add.image(w * 0.40, h * 0.34, 'air', heroPlane.frame + '_lvl')
        .setDepth(10).setScale(1.7);
      this.tweens.add({ targets: [this.hero, this.heroGlow], y: '-=9', duration: 2400,
                        yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: this.heroGlow, alpha: 0.16, duration: 1700, yoyo: true,
                        repeat: -1, ease: 'Sine.easeInOut' });
      enterFrom(this, this.hero, -40, 0, 60);

      var ri = rankIndex(profile.xp);
      var next = RANKS[ri + 1];
      hudText(this, SAFE.l + 16, SAFE.t + 18, 'HANGAR', TYPE.head, '#fff6dd').setOrigin(0, 0.5).setDepth(12);
      hudText(this, SAFE.l + 16, SAFE.t + 40,
        RANKS[ri].name.toUpperCase() + (next ? SEP + 'NEXT AT ' + next.xp + ' XP' : SEP + 'TOP GRADE'),
        TYPE.micro, '#a8c8dc', 'normal').setOrigin(0, 0.5).setDepth(12);
      hudText(this, SAFE.l + 16, SAFE.t + 58, 'CAREER ' + Math.floor(profile.xp) + ' XP' + SEP +
        profile.kills + ' CONFIRMED' + SEP + profile.aces + ' ACES', TYPE.micro, '#89a9bd', 'normal')
        .setOrigin(0, 0.5).setDepth(12);

      // Rank bar.
      var barW = 200;
      var bx = SAFE.l + 16;
      this.add.rectangle(bx, SAFE.t + 76, barW, 6, 0x0d2136, 0.9).setOrigin(0, 0.5).setDepth(12);
      var prevXp = RANKS[ri].xp, nextXp = next ? next.xp : RANKS[ri].xp + 1;
      var f = next ? clamp((profile.xp - prevXp) / (nextXp - prevXp), 0, 1) : 1;
      var fill = this.add.rectangle(bx, SAFE.t + 76, barW, 6, 0x7fe3ff, 1)
        .setOrigin(0, 0.5).setDepth(13);
      fill.scaleX = 0.004;
      this.tweens.add({ targets: fill, scaleX: Math.max(0.004, f), duration: 700,
                        ease: 'Cubic.easeOut' });

      // ---- airframe strip
      hudText(this, SAFE.l + 16, SAFE.t + 94, 'AIRFRAME', TYPE.micro, '#7fa3b8', 'normal')
        .setOrigin(0, 0.5).setDepth(12);
      this.planeCards = [];
      var cardW = 104, cardH = 92;
      for (var i = 0; i < AIRFRAMES.length; i++) {
        (function (a, idx) {
          var cx = SAFE.l + 16 + cardW / 2 + idx * (cardW + 8);
          var cy = SAFE.t + 94 + 20 + cardH / 2;
          var card = scene.add.container(cx, cy).setDepth(14);
          var open = planeUnlocked(a);
          var bg = panel(scene, 0, 0, cardW, cardH, false).setAlpha(open ? 1 : 0.5);
          var art = scene.add.image(0, -14, 'air', a.frame + '_lvl').setScale(0.86)
            .setAlpha(open ? 1 : 0.32);
          var nm = hudText(scene, 0, 24, a.name, TYPE.tiny, open ? '#e8f6ff' : '#6d8698');
          var st = hudText(scene, 0, 38, open ? ('HULL ' + a.hull + '  ROF ' +
            Math.round(1 / a.gap) + '/S') : ('RANK ' + RANKS[a.rank].name.toUpperCase()),
            TYPE.tiny - 1, open ? '#8fc4dd' : '#5d7688', 'normal');
          var sel = panel(scene, 0, 0, cardW, cardH, true)
            .setAlpha(profile.plane === a.id ? 1 : 0);
          card.add([bg, sel, art, nm, st]);
          card.sel = sel; card.open = open; card.aid = a.id;
          bg.setInteractive({ useHandCursor: true });
          bg.on('pointerdown', function () {
            if (!card.open) { sfx('click'); return; }
            sfx('select');
            profile.plane = a.id; saveProfile();
            for (var k = 0; k < scene.planeCards.length; k++) {
              scene.planeCards[k].sel.setAlpha(scene.planeCards[k].aid === a.id ? 1 : 0);
            }
            setTextIfChanged(scene.blurbText, a.blurb);
            // The hero re-presents on selection: this is the storefront beat.
            setFrameIf(scene.hero, a.frame + '_lvl');
            scene.heroGlow.setTint(a.tint);
            scene.tweens.add({ targets: scene.hero, scaleX: 1.9, scaleY: 1.9, duration: 160,
                               yoyo: true, ease: 'Back.easeOut' });
            scene.tweens.add({ targets: card, scaleX: 1.06, scaleY: 1.06, duration: 90,
                               yoyo: true, ease: 'Back.easeOut' });
          });
          scene.planeCards.push(card);
          enterFrom(scene, card, 0, 22, 90 + idx * 55);
        }(AIRFRAMES[i], i));
      }
      var cur = AIRFRAME_BY_ID[profile.plane] || AIRFRAMES[0];
      this.blurbText = hudText(this, SAFE.l + 16, SAFE.t + 94 + 20 + cardH + 16, cur.blurb,
        TYPE.tiny, '#9dbfd2', 'normal').setOrigin(0, 0.5).setDepth(12);

      // ---- sortie ladder (scrollable column on the right)
      var lx = w - SAFE.r - 250;
      hudText(this, lx, SAFE.t + 18, 'SORTIE LADDER', TYPE.sub, '#fff6dd').setOrigin(0, 0.5).setDepth(12);
      var listTop = SAFE.t + 36;
      var listH = h - listTop - SAFE.b - 58;
      var rowH = 30;
      var maskG = this.make.graphics({ x: 0, y: 0, add: false });
      maskG.fillRect(lx - 6, listTop, 250, listH);
      var list = this.add.container(0, 0).setDepth(14);
      list.setMask(maskG.createGeometryMask());
      for (var s = 0; s < SORTIES.length; s++) {
        (function (so, idx) {
          var open = so.n <= profile.unlocked;
          var y = listTop + 14 + idx * rowH;
          var row = scene.add.container(lx, y);
          var bg = panel(scene, 112, 0, 236, rowH - 4, !!so.ace)
            .setAlpha(open ? (so.ace ? 0.92 : 0.95) : 0.72);
          var num = hudText(scene, 16, 0, pad(so.n, 2), TYPE.body, open ? '#ffe3a1' : '#5d7688');
          var nm = hudText(scene, 40, -5, so.name, TYPE.micro, open ? '#e8f6ff' : '#61798a')
            .setOrigin(0, 0.5);
          var bestv = profile.best[so.n] || 0;
          var sub = hudText(scene, 40, 7, open ? (bestv ? 'BEST ' + bestv : 'NOT FLOWN')
            : 'LOCKED', TYPE.tiny - 1, open ? '#87b4cc' : '#526a7b', 'normal').setOrigin(0, 0.5);
          row.add([bg, num, nm, sub]);
          if (so.ace) {
            row.add(scene.add.image(220, 0, 'ui', 'chevron').setScale(0.7).setTint(0xffd76a));
          }
          if (open) {
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerdown', function () { sfx('select'); startSortie(scene, so.n); });
          }
          list.add(row);
        }(SORTIES[s], s));
      }
      // Drag to scroll the ladder when it overflows.
      var contentH = SORTIES.length * rowH + 20;
      var minY = Math.min(0, listH - contentH);
      var drag = { on: false, y0: 0, l0: 0 };
      this.input.on('pointerdown', function (p) {
        if (p.x > lx - 20 && p.x < lx + 250) { drag.on = true; drag.y0 = p.y; drag.l0 = list.y; }
      });
      this.input.on('pointermove', function (p) {
        if (drag.on && p.isDown) list.y = clamp(drag.l0 + (p.y - drag.y0), minY, 0);
      });
      this.input.on('pointerup', function () { drag.on = false; });
      this.input.on('wheel', function (p, o, dx, dy) { list.y = clamp(list.y - dy * 0.5, minY, 0); });

      // The primary action sits in the centre of the free column so it is the
      // largest, most obvious target on the screen.
      var nextName = SORTIES[profile.unlocked - 1].name.toUpperCase();
      var flyBtn = makeButton(this, w * 0.40, h * 0.66, 284, 50,
        'FLY SORTIE ' + profile.unlocked, function () {
          startSortie(scene, profile.unlocked);
        }, 'primary').setDepth(15);
      hudText(this, w * 0.40, h * 0.66 + 35, nextName, TYPE.tiny, '#9dbfd2', 'normal').setDepth(15);
      var titleBtn = makeButton(this, w * 0.40, h * 0.66 + 64, 150, 38, 'TITLE', function () {
        sceneSwap(scene, 'title');
      }).setDepth(15);
      enterFrom(this, flyBtn, 0, 26, 200);
      enterFrom(this, titleBtn, 0, 26, 260);

      this.input.keyboard.on('keydown-ENTER', function () { startSortie(scene, profile.unlocked); });
      this.input.keyboard.on('keydown-ESC', function () { sceneSwap(scene, 'title'); });
    }
  };

  function startSortie(scene, n) {
    sceneSwap(scene, 'play', { sortie: clamp(n, 1, SORTIES.length) });
  }

  // =====================================================================
  //  PLAY SCENE
  // =====================================================================
  var PlayScene = {
    key: 'play',

    init: function (data) {
      this.sortieNo = (data && data.sortie) || 1;
      this.builtSortie = this.sortieNo;
      this.pendingSortie = null;
      this.resultsBox = null;
      this.pauseBox = null;
      this.modal = null;
      this._swapping = false;
    },

    create: function () {
      Game.scene = this;
      var scene = this;
      var w = this.scale.width / DPR, h = this.scale.height / DPR;
      densityCamera(this, w, h);
      this.vw = w; this.vh = h;

      var sortie = SORTIES[this.sortieNo - 1];
      this.sortie = sortie;
      var theme = THEMES[sortie.theme];
      this.theme = theme;

      // ------------------------------------------------------- background
      // The sky texture already carries the sun bloom, the horizon haze and
      // the vignette (see skyTexture). One opaque quad, no blending.
      this.sky = this.add.image(0, 0, skyTexture(this, sortie.theme)).setOrigin(0, 0)
        .setDisplaySize(w, h).setDepth(0);
      this.cameras.main.setBackgroundColor(theme.sky[0]);

      // Only the sun CORE is live, because only its bloom pulse moves.
      this.sun = this.add.image(w * 0.78, h * theme.sunY, 'disc').setDepth(1)
        .setDisplaySize(h * 0.40, h * 0.40).setTint(theme.sun).setAlpha(0.30)
        .setBlendMode(Phaser.BlendModes.ADD);

      // PARALLAX, rebuilt. Three bands, each with its OWN cloud artwork
      // rather than one sheet at three scales, and each graded toward the
      // horizon haze by distance: the far band is nearly the colour of the
      // sky it sits in, the near band is full contrast and drawn over the
      // aircraft. That colour separation is the depth cue; scale alone was
      // reading flat.
      this.cloudBands = [];
      vseed(this.sortieNo * 31 + 5);
      var bands = [
        { key: 'cloud_far',  n: 4, sc: 0.50, al: 0.34, sp: 9,  dep: 2,  y0: 0.04, y1: 0.40, mix: 0.72 },
        { key: 'cloud_mid',  n: 4, sc: 0.85, al: 0.46, sp: 30, dep: 3,  y0: 0.10, y1: 0.56, mix: 0.30 },
        { key: 'cloud_near', n: 3, sc: 1.30, al: 0.26, sp: 96, dep: 58, y0: 0.14, y1: 0.86, mix: 0.0 }
      ];
      for (var bi = 0; bi < bands.length; bi++) {
        var band = bands[bi];
        // Atmospheric perspective: mix the cloud colour toward the haze by
        // the band's distance.
        var bandTint = mixRGB(theme.cloud, theme.haze, band.mix);
        var arr = [];
        for (var ci = 0; ci < band.n; ci++) {
          var c = this.add.image(vrand() * (w + 400) - 200,
                                 h * (band.y0 + vrand() * (band.y1 - band.y0)),
                                 band.key, 'c' + ((vrand() * 4) | 0))
            .setDepth(band.dep).setScale(band.sc * (0.75 + vrand() * 0.5))
            .setAlpha(band.al * (0.8 + vrand() * 0.4)).setTint(bandTint);
          arr.push(c);
        }
        this.cloudBands.push({ list: arr, speed: band.sp, key: band.key });
      }

      // THREE terrain layers. The mid strip is new: it carries the authored
      // gully/crest detail and sits inside the baked haze wedge, so the far
      // ridge dissolves into the sky and the near mass reads as solid ground.
      this.ridgeFar = this.add.tileSprite(0, h - 158, w, 104, 'ridge_far')
        .setOrigin(0, 0).setDepth(4).setTint(mixRGB(theme.ridge, theme.haze, 0.45))
        .setAlpha(0.85);
      this.ridgeMid = this.add.tileSprite(0, h - 134, w, 118, 'ridge_mid')
        .setOrigin(0, 0).setDepth(5).setTint(mixRGB(theme.ridgeM, theme.haze, 0.18))
        .setAlpha(0.95);
      this.ridgeNear = this.add.tileSprite(0, h - 106, w, 148, 'ridge_near')
        .setOrigin(0, 0).setDepth(6).setTint(theme.ridge2);

      // ------------------------------------------------------- particles
      // Seven pooled emitters. Nothing is constructed after this point, and
      // every one carries a HARD CAP: Phaser's default is an unbounded pool,
      // so a full furball with four smoking bandits and three missiles grew
      // the pools to peak concurrency and never gave the memory back. With
      // maxAliveParticles set, an emission at capacity is simply dropped,
      // which is the correct behaviour for cosmetics on a mobile budget.
      this.fx = {};
      this.fx.trail = this.add.particles(0, 0, 'p_flare', {
        lifespan: 420, speed: { min: 4, max: 26 }, scale: { start: 0.22, end: 0 },
        alpha: { start: 0.55, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 1,
        maxAliveParticles: 46
      }).setDepth(38);
      this.fx.impact = this.add.particles(0, 0, 'p_spark', {
        lifespan: 300, speed: { min: 50, max: 190 }, scale: { start: 0.34, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 5,
        maxAliveParticles: 90
      }).setDepth(52);
      this.fx.fire = this.add.particles(0, 0, 'p_fire', {
        lifespan: 620, speed: { min: 40, max: 240 }, scale: { start: 0.62, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 10,
        maxAliveParticles: 80
      }).setDepth(53);
      this.fx.smoke = this.add.particles(0, 0, 'p_smoke', {
        lifespan: 1500, speed: { min: 8, max: 46 }, scale: { start: 0.30, end: 0.92 },
        alpha: { start: 0.5, end: 0 }, emitting: false, quantity: 1, tint: theme.smoke,
        maxAliveParticles: 64
      }).setDepth(50);
      this.fx.flare = this.add.particles(0, 0, 'p_flare', {
        lifespan: 900, speed: { min: 60, max: 220 }, scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 14,
        tint: 0xffd98a, gravityY: 90, maxAliveParticles: 56
      }).setDepth(54);
      this.fx.vapour = this.add.particles(0, 0, 'p_wisp', {
        lifespan: 700, speed: { min: 4, max: 20 }, scale: { start: 0.24, end: 0.9 },
        alpha: { start: 0.34, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 1,
        maxAliveParticles: 28
      }).setDepth(37);
      // DAMAGE STAGE 3: an airframe that is actually burning, not smoking.
      this.fx.burn = this.add.particles(0, 0, 'p_fire', {
        lifespan: 420, speed: { min: 10, max: 60 }, scale: { start: 0.30, end: 0.02 },
        alpha: { start: 0.85, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 1,
        maxAliveParticles: 40
      }).setDepth(51);

      // ------------------------------------------------------------ pools
      this.foes = [];
      for (var i = 0; i < MAX_FOES; i++) {
        this.foes.push({
          live: false, spr: this.add.image(0, 0, 'air', 'foe_vane_lvl').setDepth(40).setVisible(false),
          glow: this.add.image(0, 0, 'disc').setDepth(39).setVisible(false)
            .setBlendMode(Phaser.BlendModes.ADD),
          x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, kind: 'vane', def: SQUADRON.vane,
          t: 0, phase: 0, gun: 0, missile: 0, hit: 0, bank: 0, broke: false, ace: null,
          boss: null, bossTier: null, pattern: 'free', slot: 0, total: 1,
          warnT: 0, warnKind: '', smoke: 0, tele: 0, phase3: 0, burst: 0,
          dmg: 0, flash: 0, burn: 0
        });
      }
      this.tracers = this.makeProjPool(MAX_TRACERS, 'tracer_own', 46);
      this.foeTracers = this.makeProjPool(MAX_FOE_TRACERS, 'tracer_foe', 45);
      this.missiles = this.makeProjPool(MAX_MISSILES, 'missile', 47);
      this.flak = this.makeProjPool(MAX_FLAK, 'flak', 45);
      this.pods = [];
      for (i = 0; i < MAX_PODS; i++) {
        this.pods.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, t: 0,
          spr: this.add.image(0, 0, 'ui', 'pod').setDepth(43).setVisible(false),
          chute: this.add.image(0, 0, 'ui', 'chute').setDepth(42).setVisible(false) });
      }

      // THREE-BEAT IMPACT, stage 2 (contact). The authored ring_hit/ring_kill
      // frames were shipped and never used; every hit and every kill now
      // punches one out as an expanding, fading ring. Pooled, never created
      // during play.
      this.rings = [];
      for (i = 0; i < MAX_RINGS; i++) {
        this.rings.push({ live: false, t: 0, life: 0, x: 0, y: 0, s0: 0, s1: 0,
          spr: this.add.image(0, 0, 'ui', 'ring_hit').setDepth(55).setVisible(false)
            .setBlendMode(Phaser.BlendModes.ADD) });
      }
      // THREE-BEAT IMPACT, stage 3 (follow-through): score popups on an
      // ease-out-back rise, and hard debris off every kill.
      this.pops = [];
      for (i = 0; i < MAX_POPS; i++) {
        this.pops.push({ live: false, t: 0, life: 0, x: 0, y: 0,
          obj: hudText(this, 0, 0, '', TYPE.body, '#ffe3a1').setDepth(106).setVisible(false) });
      }
      this.debris = [];
      for (i = 0; i < MAX_DEBRIS; i++) {
        this.debris.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, spin: 0,
          spr: this.add.image(0, 0, 'ui', 'flak').setDepth(49).setVisible(false) });
      }

      // Power drops are field objects, not menu icons. Each one is a pooled
      // little beacon with a readable glyph, drift, lifetime and collection
      // pulse. No pickup object is constructed after scene creation.
      this.pickups = [];
      for (i = 0; i < MAX_PICKUPS; i++) {
        var pc = this.add.container(0, 0).setDepth(61).setVisible(false);
        var ph = this.add.image(0, 0, 'disc').setDisplaySize(58, 58)
          .setAlpha(0.28).setBlendMode(Phaser.BlendModes.ADD);
        var core = this.add.circle(0, 0, 15, 0x8fe6ff, 0.92)
          .setStrokeStyle(2, 0xffffff, 0.92);
        var glyph = hudText(this, 0, 0, '', TYPE.micro, '#071126');
        pc.add([ph, core, glyph]);
        this.pickups.push({ live: false, type: '', x: 0, y: 0, vx: 0, vy: 0,
          t: 0, life: 0, phase: 0, spr: pc, halo: ph, core: core, glyph: glyph });
      }

      // ---------------------------------------------------- player + wing
      var plane = AIRFRAME_BY_ID[profile.plane] || AIRFRAMES[0];
      this.plane = plane;
      // Sun-side key light plus a little reflected sky bounce, so the same
      // airframe reads warm at dawn, flat under storm and cold at night.
      this.playerLit = mixRGB(mixRGB(0xffffff, theme.rim, 0.34), theme.fill, 0.14);
      this.wingLit = mixRGB(this.playerLit, theme.fill, 0.10);
      this.playerGlow = this.add.image(0, 0, 'disc').setDepth(43)
        .setDisplaySize(120, 120).setTint(mixRGB(plane.tint, theme.rim, 0.30)).setAlpha(0.32)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.playerSpr = this.add.image(0, 0, 'air', plane.frame + '_lvl').setDepth(44)
        .setScale(1.1);
      this.playerProp = this.add.sprite(0, 0, 'ui', 'prop_0').setDepth(45).setAlpha(0.5);
      this.playerProp.play('prop');
      this.muzzle = this.add.image(0, 0, 'disc').setDepth(46).setDisplaySize(44, 44)
        .setTint(theme.tracer).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.hurtRing = this.add.circle(0, 0, PLAYER_HURT_RADIUS, 0x071126, 0)
        .setStrokeStyle(1, theme.glass, 0.34).setDepth(58);
      this.wingGlow = this.add.image(0, 0, 'disc').setDepth(41)
        .setDisplaySize(100, 100).setTint(0x8ff0e0).setAlpha(0.26)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.wingSpr = this.add.image(0, 0, 'air', 'wing_hawk_lvl').setDepth(42);

      // Lead-pursuit HUD glass.
      // The lead line is four pooled dashes rather than a Graphics: clearing
      // and re-stroking a Graphics rebuilds its geometry buffer every frame.
      this.leadDashes = [];
      for (var di = 0; di < 4; di++) {
        this.leadDashes.push(this.add.image(0, 0, 'p_wisp').setDepth(59)
          .setTint(0xd9fbff).setAlpha(0.35).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD));
      }
      this.reticle = this.add.image(0, 0, 'ui', 'reticle').setDepth(60)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.lockBox = this.add.image(0, 0, 'ui', 'lock').setDepth(60).setVisible(false);

      // --------------------------------------------------------- HUD ----
      this.buildHud();
      this.buildControls();
      this.buildAceCard();

      // ------------------------------------------------------ run state
      this.canvasRect = this.game.canvas.getBoundingClientRect();
      this.stick = { id: null, dx: 0, dy: 0, bx: 0, by: 0 };
      this.roles = {};       // pointerId -> role, assigned at pointer DOWN
      this.acc = 0;
      this.cosmetic = 0;
      this.paused = false;
      this.cam = { lookX: 0, lookY: 0, dipX: 0, dipY: 0, dipVX: 0, dipVY: 0, zoom: 1 };

      this.bindEdges();
      this.layout();

      // RESIZE / ORIENTATION. Previously only the canvas rect was refreshed,
      // so after a rotation the controls, the HUD, the movement bounds and
      // the parallax were all still sized for the viewport the scene was
      // created in. Everything layout-dependent now lives in layout() and is
      // recomputed here, safe-area insets included.
      var onResize = function () {
        if (!scene.scene || !scene.scene.isActive('play')) return;
        scene.canvasRect = scene.game.canvas.getBoundingClientRect();
        readSafeArea();
        scene.vw = scene.scale.width / DPR;
        scene.vh = scene.scale.height / DPR;
        scene.layout();
      };
      this.scale.on('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      this.events.once('shutdown', function () {
        scene.scale.off('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
      });

      this.resetSortie();

      kit.audio.music('musicCruise', 700);
      this.events.once('shutdown', function () { kit.audio.stopMusic(400); });
    },

    // =================================================================
    //  INPUT EDGES
    //  GGKit stays the owner of pointer identity and key state; what it
    //  does not expose is the MOMENT a pointer or key went down. Sampling
    //  kit.input once per update lost any tap that began and ended between
    //  two frames, and lost held taps on a frame that ran zero fixed steps.
    //  These two listeners do nothing but stamp an edge into a queue, which
    //  the fixed-step loop then consumes exactly once. No input state is
    //  duplicated: held state and pointer identity still come from the kit.
    // =================================================================
    bindEdges: function () {
      var scene = this;
      this.edge = { flare: 0, wing: 0, bomb: 0, pause: 0, confirm: 0 };
      this.downQueue = [];

      this._onDown = function (e) {
        if (kit.paused) return;
        // Classify by where the pointer went DOWN. Testing the live position
        // meant a thumb that started on the stick and slid right before the
        // first update was classified as FIRE.
        var r = scene.canvasRect;
        scene.downQueue.push({ id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top });
      };
      this._onKey = function (e) {
        if (kit.paused || e.repeat) return;
        var c = e.code;
        if (c === 'KeyF' || c === 'ShiftLeft' || c === 'ShiftRight') scene.edge.flare++;
        else if (c === 'KeyQ') scene.edge.wing++;
        else if (c === 'KeyB') scene.edge.bomb++;
        else if (c === 'Escape' || c === 'KeyP') scene.edge.pause++;
        else if (c === 'Enter' || c === 'Space') scene.edge.confirm++;
      };
      window.addEventListener('pointerdown', this._onDown, { passive: true });
      window.addEventListener('keydown', this._onKey);
      this.events.once('shutdown', function () {
        window.removeEventListener('pointerdown', scene._onDown);
        window.removeEventListener('keydown', scene._onKey);
      });
    },

    clearEdges: function () {
      this.edge.flare = 0; this.edge.wing = 0; this.edge.bomb = 0;
      this.edge.pause = 0; this.edge.confirm = 0;
      this.downQueue.length = 0;
    },

    // =================================================================
    //  LAYOUT - the single place anything is positioned from the viewport
    // =================================================================
    layout: function () {
      var w = this.vw = this.scale.width / DPR, h = this.vh = this.scale.height / DPR;
      var T = SAFE.t, L = SAFE.l, R = SAFE.r, B = SAFE.b;

      // Background.
      this.sky.setDisplaySize(w, h);
      this.sun.setPosition(w * 0.78, h * this.theme.sunY).setDisplaySize(h * 0.40, h * 0.40);
      this.ridgeFar.setPosition(0, h - 158).setSize(w, 104);
      this.ridgeMid.setPosition(0, h - 134).setSize(w, 118);
      this.ridgeNear.setPosition(0, h - 106).setSize(w, 148);

      // HUD glass band: a translucent strip behind the top row so score and
      // status read over a bright dawn sky at 390 px without a drop shadow
      // on every glyph.
      this.hud.glass.setPosition(w / 2, T + 38).setSize(w, 76);
      this.hud.sortie.setPosition(L + 14, T + 10);
      this.hud.score.setPosition(L + 14, T + 30);
      this.hud.bandits.setPosition(L + 14, T + 47);
      for (var i = 0; i < this.hud.pips.length; i++) {
        this.hud.pips[i].setPosition(w - R - 70 - i * 22, T + 14);
      }
      this.hud.flareLabel.setPosition(w - R - 60, T + 28);
      this.hud.style.setPosition(w - R - 60, T + 46);
      this.hud.weapon.setPosition(w - R - 60, T + 64);
      this.hud.bossWrap.setPosition(w / 2, T + 26);
      this.hud.combo.setPosition(w / 2, T + 88);

      this.banner.setPosition(w / 2, h * 0.28);
      this.bannerSub.setPosition(w / 2, h * 0.28 + 30);
      this.vignette.setPosition(w / 2, h / 2).setDisplaySize(w * 2.4, h * 2.6);
      this.lockWarn.setPosition(w / 2, h - B - 52);
      this.tutorBox.setPosition(w * 0.5, T + 92);
      // The message stack drops below the tutorial strip while the tutorial
      // owns that band, so a hull warning never lands on top of a lesson.
      this.msgBaseY = this.tutorial ? T + 126 : h * 0.17;
      this.letterTop.setPosition(w / 2, -1).setSize(w, 44);
      this.letterBot.setPosition(w / 2, h + 1).setSize(w, 44);
      this.aceWash.setPosition(w / 2, h / 2).setSize(w, h);
      this.aceCard.setPosition(w / 2, h * 0.44);

      // Controls, anchored inside the safe area on every edge.
      var bs = B + 16;
      this.padHome = { x: L + 82, y: h - bs - 66, r: 74 };
      this.ctl.padBase.setPosition(this.padHome.x, this.padHome.y);
      this.ctl.padKnob.setPosition(this.padHome.x, this.padHome.y);
      this.ctl.fire.setPosition(w - R - 66, h - bs - 72);
      this.ctl.flare.setPosition(w - R - 156, h - bs - 46);
      this.ctl.bomb.setPosition(w - R - 250, h - bs - 46);
      this.ctl.wing.setPosition(w - R - 154, h - bs - 130);
      this.ctl.wingLabel.setPosition(this.ctl.wing.x, this.ctl.wing.y + 28);
      this.ctl.flareLabel.setPosition(this.ctl.flare.x, this.ctl.flare.y + 28);
      this.ctl.bombLabel.setPosition(this.ctl.bomb.x, this.ctl.bomb.y + 28);
      this.ctl.pause.setPosition(w - R - 26, T + 24);
      this.ctl.ghost.setPosition(this.padHome.x, this.padHome.y);

      // Movement bounds follow the viewport, not the creation size.
      this.bounds = { top: T + 82, bottom: h - B - 96, x0: L + 54, x1: Math.min(w * 0.62, w - R - 160) };
      if (this.run) {
        this.run.px = clamp(this.run.px, this.bounds.x0, this.bounds.x1);
        this.run.py = clamp(this.run.py, this.bounds.top, this.bounds.bottom);
        this.run.wy = clamp(this.run.wy, this.bounds.top, this.bounds.bottom);
      }
    },

    // ------------------------------------------------------------ helpers
    makeProjPool: function (n, frame, depth) {
      var arr = [];
      for (var i = 0; i < n; i++) {
        arr.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, dmg: 1, wing: false,
          homing: false, grazed: false,
          spr: this.add.image(0, 0, 'ui', frame).setDepth(depth).setVisible(false)
            .setBlendMode(Phaser.BlendModes.ADD) });
      }
      return arr;
    },

    takeFree: function (pool) {
      for (var i = 0; i < pool.length; i++) if (!pool[i].live) return pool[i];
      return null;
    },

    // =================================================================
    //  HUD
    // =================================================================
    buildHud: function () {
      var w = this.vw, h = this.vh;
      var theme = this.theme;
      this.hud = {};

      // HUD ZONES. Top band = score/status/hull, centre = banners, lower
      // third = controls, and the tutorial strip now sits UNDER the top band
      // instead of over the skyline where the near cloud band crosses it.
      // The band itself is a translucent plate so 11.5 px secondary text
      // survives a noon sky.
      this.hud.glass = this.add.rectangle(w / 2, SAFE.t + 38, w, 76, 0x061223, 0.36)
        .setDepth(99);
      this.hud.sortie = this.add.text(0, 0, '', {
        fontFamily: FONT_DISPLAY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.body + 'px', color: '#fff6dd', fontStyle: 'bold'
      }).setDepth(100);
      this.hud.score = this.add.text(0, 0, '', {
        fontFamily: FONT_BODY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.micro + 'px', color: '#c4e4f4', fontStyle: 'bold'
      }).setDepth(100);
      this.hud.bandits = this.add.text(0, 0, '', {
        fontFamily: FONT_BODY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.micro + 'px', color: '#ffd0a8', fontStyle: 'bold'
      }).setDepth(100);

      // Hull pips, right aligned.
      this.hud.pips = [];
      for (var i = 0; i < 6; i++) {
        this.hud.pips.push(this.add.image(0, 0, 'ui', 'pip_on').setDepth(100).setVisible(false));
      }
      this.hud.flareLabel = this.add.text(0, 0, '', {
        fontFamily: FONT_BODY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.micro + 'px', color: '#ffe3a1', fontStyle: 'bold'
      }).setOrigin(1, 0).setDepth(100);
      this.hud.style = this.add.text(0, 0, '', {
        fontFamily: FONT_BODY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.micro + 'px', color: '#8fc4dd', fontStyle: 'bold'
      }).setOrigin(1, 0).setDepth(100);
      this.hud.weapon = this.add.text(0, 0, '', {
        fontFamily: FONT_BODY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.micro + 'px', color: '#b9ffcf', fontStyle: 'bold'
      }).setOrigin(1, 0).setDepth(100);

      // COMBO CHIP: the multiplier existed in state and was never drawn.
      this.hud.combo = this.add.container(w / 2, SAFE.t + 86).setDepth(101).setAlpha(0);
      this.hud.comboBg = panel(this, 0, 0, 82, 24, true);
      this.hud.comboTxt = hudText(this, 0, 0, '', TYPE.body, '#fff2bb');
      this.hud.combo.add([this.hud.comboBg, this.hud.comboTxt]);
      this._comboShown = 0;

      // Boss health bar (ace duels).
      this.hud.bossWrap = this.add.container(w / 2, SAFE.t + 26).setDepth(101).setVisible(false);
      this.hud.bossWrap.add(this.add.rectangle(0, 6, 300, 9, 0x0a1524, 0.85)
        .setStrokeStyle(1, 0x7fb4d0, 0.8));
      this.hud.bossFill = this.add.rectangle(-149, 6, 298, 7, 0xff6a5c, 1).setOrigin(0, 0.5);
      this.hud.bossWrap.add(this.hud.bossFill);
      this.hud.bossName = hudText(this, 0, -8, '', TYPE.micro, '#ffd0a8');
      this.hud.bossWrap.add(this.hud.bossName);

      // Banner + message stack (pooled text objects, never created in play).
      this.banner = hudText(this, w / 2, h * 0.28, '', TYPE.title, '#fff2bb')
        .setDepth(102).setAlpha(0);
      this.bannerSub = hudText(this, w / 2, h * 0.28 + 30, '', TYPE.micro, '#cfe8f6', 'normal')
        .setDepth(102).setAlpha(0);
      this.msgs = [];
      for (i = 0; i < MAX_BANNERS; i++) {
        this.msgs.push({ live: false, t: 0, life: 0, slot: 0,
          obj: hudText(this, 0, 0, '', TYPE.body, '#e8fbff').setDepth(103).setAlpha(0) });
      }

      // Damage vignette + lock warning, both full screen and cheap. The
      // vignette is only ever drawn while it is actually red.
      this.vignette = this.add.image(w / 2, h / 2, 'disc').setDepth(104)
        .setDisplaySize(w * 2.4, h * 2.6).setTint(0xff3a2a).setAlpha(0).setVisible(false);
      this.lockWarn = this.add.text(0, 0, 'MISSILE LOCK', {
        fontFamily: FONT_DISPLAY, resolution: GGKit.hiDpi.dpr(), fontSize: TYPE.sub + 'px', color: '#ffb0a0', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(104).setAlpha(0);

      // Tutorial prompt strip.
      this.tutorBox = this.add.container(w * 0.5, SAFE.t + 92).setDepth(105).setAlpha(0);
      this.tutorBox.add(panel(this, 0, 0, 460, 40, false));
      this.tutorText = hudText(this, 0, 0, '', TYPE.micro, '#eaf8ff');
      this.tutorBox.add(this.tutorText);

      // OFF-SCREEN TARGET INDICATOR: an edge arrow with range, for when the
      // lead point or the bandit itself leaves the safe rect.
      this.edgeArrow = this.add.image(0, 0, 'ui', 'chevron').setDepth(60)
        .setTint(theme.glass).setVisible(false);
      this.edgeRange = hudText(this, 0, 0, '', TYPE.tiny, '#cfe8f6', 'normal')
        .setDepth(60).setVisible(false);

      this.hudCache = { sortie: '', score: -1, bandits: -1, hull: -1, flare: '', style: -1, weapon: '', multiplier: -1, kills: -1 };
    },

    // Ace duel presentation: letterbox bars, a palette wash over the whole
    // scene, and a dedicated intro card with the call sign. Built once,
    // hidden, and driven by aceIntro().
    buildAceCard: function () {
      var w = this.vw, h = this.vh;
      this.letterTop = this.add.rectangle(w / 2, -1, w, 44, 0x04070f, 0.92)
        .setOrigin(0.5, 1).setDepth(107).setVisible(false);
      this.letterBot = this.add.rectangle(w / 2, h + 1, w, 44, 0x04070f, 0.92)
        .setOrigin(0.5, 0).setDepth(107).setVisible(false);
      this.aceWash = this.add.rectangle(w / 2, h / 2, w, h, 0xff5a4a, 0)
        .setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
      this.aceCard = this.add.container(w / 2, h * 0.44).setDepth(108).setVisible(false);
      this.aceCardBg = panel(this, 0, 0, 360, 96, true);
      this.aceCardArt = this.add.image(-132, 0, 'air', 'ace_ashvane_lvl').setScale(1.15);
      this.aceCardKicker = hudText(this, 30, -28, 'ACE DUEL', TYPE.micro, '#ffd0a8', 'normal');
      this.aceCardName = hudText(this, 30, -4, '', TYPE.head, '#fff6dd');
      this.aceCardSign = hudText(this, 30, 22, '', TYPE.micro, '#a9e6ff', 'normal');
      this.aceCard.add([this.aceCardBg, this.aceCardArt, this.aceCardKicker,
                        this.aceCardName, this.aceCardSign]);
    },

    buildControls: function () {
      var d = 200;
      this.ctl = {};
      this.ctl.padBase = this.add.image(0, 0, 'ui', 'pad_base').setDepth(d).setAlpha(0.42);
      this.ctl.padKnob = this.add.image(0, 0, 'ui', 'pad_knob').setDepth(d + 1).setAlpha(0.62);
      // Onboarding ghost thumb: a real demonstration of the control rather
      // than a sentence describing it.
      this.ctl.ghost = this.add.image(0, 0, 'ui', 'pad_knob').setDepth(d + 2)
        .setAlpha(0).setTint(0xfff2bb).setScale(0.8);
      this.ctl.fire = this.add.image(0, 0, 'ui', 'btn_fire').setDepth(d).setAlpha(0.72);
      this.ctl.flare = this.add.image(0, 0, 'ui', 'btn_flare').setDepth(d).setAlpha(0.72);
      this.ctl.wing = this.add.image(0, 0, 'ui', 'btn_wing').setDepth(d).setAlpha(0.72);
      this.ctl.bomb = this.add.image(0, 0, 'ui', 'btn_flare').setDepth(d).setAlpha(0.68)
        .setTint(0xff8f9f);
      this.ctl.wingLabel = hudText(this, 0, 0, 'COVER', TYPE.tiny, '#a9e6ff').setDepth(d + 1);
      this.ctl.flareLabel = hudText(this, 0, 0, 'FLARE', TYPE.tiny, '#ffe7ab').setDepth(d + 1);
      this.ctl.bombLabel = hudText(this, 0, 0, 'BOMB', TYPE.tiny, '#ffb0bd').setDepth(d + 1);
      var scene = this;
      this.ctl.pause = this.add.image(0, 0, 'ui', 'btn_pause')
        .setDepth(d).setAlpha(0.7).setInteractive({ useHandCursor: true });
      this.ctl.pause.on('pointerdown', function () { scene.openPause(); });
      this.padHome = { x: 82, y: 0, r: 74 };
    },

    // =================================================================
    //  Sortie lifecycle
    // =================================================================
    resetSortie: function () {
      var w = this.vw, h = this.vh;
      var sortie = this.sortie;
      var plane = this.plane;
      resetSeed(this.sortieNo);

      // RESTART INPUT-STATE CLEARING: the kit clears pointer/key state, and
      // the local stick binding, role map and queued edges are zeroed here so
      // a restart mid-hold cannot leave the aeroplane flying itself or fire a
      // flare the player pressed before the restart.
      kit.input.clearAll();
      this.stick.id = null; this.stick.dx = 0; this.stick.dy = 0;
      this.roles = {};
      this.clearEdges();
      Tilt.recentre();

      this.run = {
        over: 0, won: false, t: 0, score: 0, style: 0, kills: 0, combo: 0, comboT: 0,
        multiplier: 1, graze: 0, equippedWeapon: 'cannon', powerLevel: 1,
        shield: 0, bombs: 1, livePickups: 0, bossActive: false,
        hull: plane.hull, maxHull: plane.hull, invuln: 0, hitFlash: 0,
        flares: plane.flares, maxFlares: plane.flares, flareT: 0,
        fireT: 0, wave: 0, waveDelay: 1.4, banditsLeft: 0, aceUp: false, aceRef: null,
        bossRef: null, bossSpawned: false, midbossSpawned: false, stageBossSpawned: false,
        waveQueue: null, waveSpawned: 0, waveSpawnT: 0, waveSpawning: false,
        wavePattern: null, difficulty: this.sortie.aggro,
        danger: 0, heat: false, locked: 0, shake: 0, vign: 0,
        px: w * 0.32, py: h * 0.52, pvx: 0, pvy: 0, bank: 0, smoking: 0,
        wx: w * 0.32 - 74, wy: h * 0.52 + 72, wbank: 0, wOrder: 'cover', wShot: 0.5,
        target: null, ended: false, aceSpawned: false,
        aceIntro: 0, aceWash: 0, aceDef: null, letter: 0
      };
      // COSMETIC RESET. Everything that outlives a sim entity is torn down
      // here too, or a restart mid-explosion carries the previous sortie's
      // smoke, message tweens and cached HUD strings into the new one.
      this.deactivateAll();
      vseed(this.sortieNo * 977 + 13);

      this.tweens.killAll();
      for (var fk in this.fx) { this.fx[fk].killAll(); this.fx[fk].stop(); }
      this.banner.setAlpha(0).setScale(1);
      this.bannerSub.setAlpha(0);
      this.vignette.setAlpha(0).setVisible(false);
      this.lockWarn.setAlpha(0);
      this.hud.bossWrap.setVisible(false);
      this.hud.combo.setAlpha(0);
      this._comboShown = 0;
      this._rangeShown = -1;
      this.muzzleT = 0;
      this.tutorBox.setAlpha(0);
      this._tutorStr = null;
      this.ctl.ghost.setAlpha(0);
      this.letterTop.setVisible(false);
      this.letterBot.setVisible(false);
      this.aceCard.setVisible(false);
      this.aceWash.setAlpha(0);
      this.cam.lookX = this.cam.lookY = this.cam.dipX = this.cam.dipY = 0;
      this.cam.dipVX = this.cam.dipVY = 0;
      this.hudCache = { sortie: '', score: -1, bandits: -1, hull: -1, flare: '', style: -1, weapon: '', multiplier: -1, kills: -1 };
      // The wingman order and its label are set through ONE path, so the
      // control can never say ATTACK while the sim is flying COVER.
      this.setWingOrder('cover', false);

      this.tutorial = (!profile.tutorialDone && this.sortieNo === 1) ? {
        step: 0, t: 0, moved: 0, fired: 0, flared: false, ordered: false, missileSent: false,
        hinted: -1
      } : null;

      this.msgBaseY = this.tutorial ? SAFE.t + 126 : h * 0.17;

      this.showBanner('SORTIE ' + this.sortieNo, sortie.name.toUpperCase());
      this.pushMsg(sortie.brief, 3.4, '#cfe8f6');
      sfx('sortie');
      window.__av.state = this.run;
      this.syncHud();
    },

    deactivateAll: function () {
      var i;
      for (i = 0; i < this.foes.length; i++) {
        this.foes[i].live = false;
        this.foes[i].spr.setVisible(false);
        this.foes[i].glow.setVisible(false);
      }
      var pools = [this.tracers, this.foeTracers, this.missiles, this.flak, this.rings,
                   this.debris];
      for (var p = 0; p < pools.length; p++) {
        for (i = 0; i < pools[p].length; i++) {
          pools[p][i].live = false;
          pools[p][i].spr.setVisible(false);
        }
      }
      for (i = 0; i < this.pods.length; i++) {
        this.pods[i].live = false;
        this.pods[i].spr.setVisible(false);
        this.pods[i].chute.setVisible(false);
      }
      for (i = 0; i < this.msgs.length; i++) {
        this.msgs[i].live = false;
        this.msgs[i].obj.setAlpha(0);
      }
      for (i = 0; i < this.pops.length; i++) {
        this.pops[i].live = false;
        this.pops[i].obj.setVisible(false);
      }
      for (i = 0; i < this.pickups.length; i++) {
        this.pickups[i].live = false;
        this.pickups[i].spr.setVisible(false);
      }
      this.muzzle.setVisible(false);
    },

    // Pointer ROLES and the stick binding are game-side state that GGKit
    // cannot clear for us. Without this a pointer id reused after a rotate
    // or a blur inherited the stick or fire role it had before the pause.
    onKitPause: function () {
      this.paused = true;
      this.stick.id = null;
      this.roles = {};
      this.clearEdges();
    },
    onKitResume: function () {
      this.paused = false;
      this.stick.id = null;
      this.roles = {};
      this.clearEdges();
    },
    // The one restart entry point. A restart of the SAME sortie is a state
    // reset; a restart into a different sortie needs a different sky, ladder
    // and bandit set, so the scene is rebuilt. Both arrive here, after GGKit
    // has already cleared pointer and key state.
    onKitRestart: function () {
      var want = this.pendingSortie || this.sortieNo;
      this.pendingSortie = null;
      if (want !== this.builtSortie) {
        this.closeResults();
        this.scene.restart({ sortie: clamp(want, 1, SORTIES.length) });
        return;
      }
      this.closeResults();
      this.resetSortie();
    },

    openPause: function () {
      var scene = this;
      if (this.pauseBox || this.resultsBox) return;
      kit.pause('menu');
      var w = this.vw, h = this.vh;
      // Art-directed, not a flat scrim: the pause screen is the sortie's own
      // sky with its own ridge line, the airframe you are flying presented
      // over it, and the sortie's live state as a readable stat block.
      var box = overlayShell(this, this.sortie.theme, 920, 0.58);
      var art = this.add.image(w * 0.24, h * 0.52, 'air', this.plane.frame + '_lvl').setScale(1.5);
      var artGlow = this.add.image(w * 0.24, h * 0.52, 'disc').setDisplaySize(200, 200)
        .setTint(this.plane.tint).setAlpha(0.26).setBlendMode(Phaser.BlendModes.ADD);
      box.add([artGlow, art]);
      this.tweens.add({ targets: [art, artGlow], y: '-=8', duration: 2200, yoyo: true,
                        repeat: -1, ease: 'Sine.easeInOut' });
      box.add(hudText(this, w * 0.62, h * 0.18, 'PAUSED', TYPE.title, '#fff6dd'));
      box.add(hudText(this, w * 0.62, h * 0.18 + 28, this.sortie.name.toUpperCase() + SEP +
        'SCORE ' + this.run.score, TYPE.micro, '#a9cfe2', 'normal'));
      box.add(hudText(this, w * 0.62, h * 0.18 + 46, this.plane.name.toUpperCase() + SEP +
        'HULL ' + this.run.hull + '/' + this.run.maxHull + SEP + 'CONFIRMED ' + this.run.kills,
        TYPE.micro, '#89a9bd', 'normal'));
      function close() {
        box.destroy(true); scene.pauseBox = null; scene.modal = null; kit.resume('menu');
      }
      var b1 = makeButton(this, w * 0.62, h * 0.50, 226, 46, 'RESUME', close, 'primary');
      var b2 = makeButton(this, w * 0.62 - 118, h * 0.50 + 56, 214, 42, 'RESTART SORTIE', function () {
        close(); kit.restart();
      });
      var b3 = makeButton(this, w * 0.62 + 118, h * 0.50 + 56, 214, 42, 'SETTINGS', function () {
        kit.openSettings(settingsRows(scene));
      });
      var b4 = makeButton(this, w * 0.62, h * 0.50 + 104, 190, 40, 'LEAVE SORTIE', function () {
        close(); sceneSwap(scene, 'hangar');
      });
      box.add([b1, b2, b3, b4]);
      enterFrom(this, b1, 0, 20, 60);
      enterFrom(this, b2, 0, 20, 110);
      enterFrom(this, b3, 0, 20, 140);
      enterFrom(this, b4, 0, 20, 180);
      this.pauseBox = box;
      this.modal = box;
    },

    // =================================================================
    //  Input sampling (GGKit owns pointer identity; roles are game side)
    // =================================================================
    // Classify a touch-down position into a control role. Pure function of
    // the DOWN position, which is the whole point: a role is decided once,
    // where the thumb landed, and held until that pointer lifts.
    roleAt: function (px, py) {
      var w = this.vw;
      if (dist2(px, py, this.ctl.pause.x, this.ctl.pause.y) < 40 * 40) return 'none';
      if (px < w * 0.5) return (this.stick.id === null) ? 'stick' : 'none';
      if (dist2(px, py, this.ctl.flare.x, this.ctl.flare.y) < 58 * 58) return 'flare';
      if (dist2(px, py, this.ctl.bomb.x, this.ctl.bomb.y) < 58 * 58) return 'bomb';
      if (dist2(px, py, this.ctl.wing.x, this.ctl.wing.y) < 52 * 52) return 'wing';
      return 'fire';
    },

    sampleInput: function () {
      var w = this.vw, h = this.vh;
      var inp = this.inp || (this.inp = { x: 0, y: 0, fire: false, flare: false, wing: false, bomb: false });
      inp.fire = false;
      inp.bomb = false;

      // ---- 1. drain queued touch-downs into roles + edges.
      for (var q = 0; q < this.downQueue.length; q++) {
        var d = this.downQueue[q];
        if (this.roles[d.id] !== undefined) continue;
        var role = this.roleAt(d.x, d.y);
        this.roles[d.id] = role;
        if (role === 'stick') {
          this.stick.id = d.id;
          this.stick.bx = clamp(d.x, SAFE.l + 70, w * 0.5 - 40);
          this.stick.by = clamp(d.y, SAFE.t + 90, h - SAFE.b - 44);
        } else if (role === 'flare') {
          this.edge.flare++;   // counted here, consumed by the fixed step
        } else if (role === 'wing') {
          this.edge.wing++;
        } else if (role === 'bomb') {
          this.edge.bomb++;
        }
      }
      this.downQueue.length = 0;

      // ---- 2. held state, from the kit's pointer identity map.
      var padDX = 0, padDY = 0, padHeld = false;
      var seen = this.seen || (this.seen = {});
      for (var id in seen) delete seen[id];
      var rect = this.canvasRect;
      var it = kit.input.pointers.entries();
      var e = it.next();
      while (!e.done) {
        var pid = e.value[0], p = e.value[1];
        var px = p.x - rect.left, py = p.y - rect.top;
        seen[pid] = true;
        var r2 = this.roles[pid];
        if (r2 === undefined) {
          // A pointer the kit knows about that never reached the down queue
          // (it went down while paused, or before this scene bound its
          // listener). Classify from its own recorded start position.
          r2 = this.roleAt(p.startX - rect.left, p.startY - rect.top);
          this.roles[pid] = r2;
          if (r2 === 'stick') {
            this.stick.id = pid;
            this.stick.bx = clamp(p.startX - rect.left, SAFE.l + 70, w * 0.5 - 40);
            this.stick.by = clamp(p.startY - rect.top, SAFE.t + 90, h - SAFE.b - 44);
          }
        }
        if (r2 === 'stick') {
          var ddx = px - this.stick.bx, ddy = py - this.stick.by;
          var m = Math.sqrt(ddx * ddx + ddy * ddy);
          var r = this.padHome.r;
          if (m > r) { ddx = ddx / m * r; ddy = ddy / m * r; }
          padDX = ddx / r; padDY = ddy / r; padHeld = true;
        } else if (r2 === 'fire') {
          inp.fire = true;
        }
        e = it.next();
      }
      // Release roles whose pointer is gone.
      for (var rid in this.roles) {
        if (!seen[rid]) {
          if (this.roles[rid] === 'stick' && String(this.stick.id) === String(rid)) {
            this.stick.id = null;
          }
          delete this.roles[rid];
        }
      }

      // ---- 3. keyboard (kit.input.keyDown respects pause).
      var kx = 0, ky = 0;
      if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) kx -= 1;
      if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) kx += 1;
      if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) ky -= 1;
      if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) ky += 1;
      if (kit.input.keyDown('Space') || kit.input.keyDown('Enter')) inp.fire = true;
      // Same stick model as the pad: the virtual stick clamps its vector to a
      // unit circle, so W+D must not be sqrt(2) times faster than a diagonal
      // drag.
      if (kx && ky) { kx *= 0.7071; ky *= 0.7071; }

      if (padHeld) { inp.x = padDX; inp.y = padDY; }
      else if (kx || ky) { inp.x = kx; inp.y = ky; }
      else if (Tilt.active && Math.abs(Tilt.value) > 0.08) { inp.x = 0; inp.y = Tilt.value; }
      else { inp.x = 0; inp.y = 0; }

      // ---- 4. non-sim edges, consumed here rather than in the fixed step.
      if (this.edge.pause > 0) { this.edge.pause = 0; this.openPause(); }
      if (this.edge.confirm > 0) {
        this.edge.confirm = 0;
        if (this.run.ended) this.afterAction();
      }

      // Stick visuals ride the bound pointer, or spring home.
      this.ctl.padBase.x = padHeld ? this.stick.bx : this.padHome.x;
      this.ctl.padBase.y = padHeld ? this.stick.by : this.padHome.y;
      this.ctl.padBase.setAlpha(padHeld ? 0.62 : 0.34);
      this.ctl.padKnob.x = this.ctl.padBase.x + inp.x * 34;
      this.ctl.padKnob.y = this.ctl.padBase.y + inp.y * 34;
      this.ctl.padKnob.setAlpha(padHeld ? 0.9 : 0.42);
      this.ctl.fire.setAlpha(inp.fire ? 0.95 : 0.66);
      this.ctl.flare.setAlpha(this.run.flares > 0 ? 0.82 : 0.34);
      this.ctl.bomb.setAlpha(this.run.bombs > 0 ? 0.82 : 0.32);
      return inp;
    },

    // =================================================================
    //  Main loop
    // =================================================================
    update: function (time, delta) {
      if (kit.paused) { this.syncView(0); return; }
      var dt = Math.min(0.1, delta / 1000);
      var j = kit.juice.frame();

      var inp = this.sampleInput();

      // Fixed accumulator. Hit-stop freezes only the COSMETIC clock; sim
      // steps always run, so the sortie never desyncs from the juice.
      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.acc -= STEP;
        steps++;
        // Queued edges are consumed INSIDE the fixed loop, one per step,
        // and they survive a frame that runs zero steps because the counter
        // is not cleared until a step actually spends it.
        inp.flare = this.edge.flare > 0;
        inp.wing = this.edge.wing > 0;
        inp.bomb = this.edge.bomb > 0;
        if (inp.flare) this.edge.flare--;
        if (inp.wing) this.edge.wing--;
        if (inp.bomb) this.edge.bomb--;
        this.step(STEP, inp);
      }
      if (this.acc > STEP * MAX_STEPS) this.acc = 0;
      // A very long stall must not let a hundred queued taps fire in a row.
      if (this.edge.flare > 2) this.edge.flare = 2;
      if (this.edge.wing > 2) this.edge.wing = 2;
      if (this.edge.bomb > 2) this.edge.bomb = 2;

      if (!j.frozen) this.cosmetic += dt;
      this.syncView(j.frozen ? 0 : dt, j);
    },

    step: function (dt, inp) {
      var r = this.run;
      r.t += dt;
      if (r.ended) { this.stepFx(dt); this.stepProjectiles(dt); return; }

      // ACE INTRO. The duel gets its own beat: the sortie holds, the card is
      // up, the palette washes to the ace's colour. Nothing else simulates
      // while the card is on screen, which is what makes it read as an
      // arrival rather than another wave banner.
      if (r.aceIntro > 0) {
        r.aceIntro -= dt;
        r.letter = Math.min(1, r.letter + dt * 4);
        r.aceWash = Math.min(1, r.aceWash + dt * 2);
        this.stepProjectiles(dt);
        this.stepFx(dt);
        if (r.aceIntro <= 0) this.aceIntroEnd();
        return;
      }
      if (r.letter > 0 && !r.aceUp) r.letter = Math.max(0, r.letter - dt * 3);
      if (r.aceWash > 0 && !r.aceUp) r.aceWash = Math.max(0, r.aceWash - dt * 1.4);

      this.stepPlayer(dt, inp);
      this.stepWingman(dt, inp);
      this.stepFoes(dt);
      this.stepProjectiles(dt);
      this.stepWaves(dt);
      this.stepFx(dt);
      if (this.tutorial) this.stepTutorial(dt, inp);
    },

    // ------------------------------------------------------------ player
    stepPlayer: function (dt, inp) {
      var r = this.run, w = this.vw, h = this.vh, plane = this.plane;

      // Thrust is momentum, not a cursor teleport. The nose stays in a
      // readable left-side lane, while lateral acceleration gives the ship a
      // bank and a little look-ahead that makes a drag feel like flight.
      var desiredVX = inp.x * 190;
      r.pvx = approach(r.pvx, desiredVX, dt, 0.0007);
      r.px = clamp(r.px + r.pvx * dt, this.bounds.x0, this.bounds.x1);
      var desiredVY = inp.y * plane.climb * plane.agility;
      r.pvy = approach(r.pvy, desiredVY, dt, 0.00065);
      r.py = clamp(r.py + r.pvy * dt, this.bounds.top, this.bounds.bottom);
      r.bank = approach(r.bank, clamp(r.pvx / 170 + inp.y * 0.40, -1, 1), dt, 0.0018);

      r.invuln = Math.max(0, r.invuln - dt);
      r.hitFlash = Math.max(0, r.hitFlash - dt);
      r.fireT = Math.max(0, r.fireT - dt);

      // Flare charges recharge on the prototype's 5 s clock.
      if (r.flares < r.maxFlares) {
        r.flareT += dt;
        if (r.flareT >= FLARE_RECHARGE) { r.flareT = 0; r.flares++; }
      } else { r.flareT = 0; }

      if (inp.flare) this.fireFlare();
      if (inp.wing) this.toggleWingman();
      if (inp.bomb) this.fireBomb();
      if (inp.fire && r.fireT <= 0) this.firePlayer();

      // Vapour off the wingtips when the airframe is loaded up. Cosmetic
      // dice come from the VISUAL stream, never Math.random and never the
      // sortie LCG.
      if (Math.abs(r.bank) > 0.72 && vrand() < dt * 26) {
        this.fx.vapour.emitParticleAt(r.px - 12, r.py + (r.bank > 0 ? 20 : -20), 1);
      }
      if (vrand() < dt * (34 + Math.abs(r.pvx) * 0.05)) this.fx.trail.emitParticleAt(r.px - 26, r.py + 1, 1);
      // PLAYER DAMAGE STAGES: engine smoke from the last hull point, and a
      // real fire once the airframe is on its last legs.
      if (r.hull <= 1 && r.maxHull > 1) {
        if (vrand() < dt * 30) this.fx.smoke.emitParticleAt(r.px - 18, r.py + 2, 1);
        if (vrand() < dt * 16) this.fx.burn.emitParticleAt(r.px - 12, r.py + 1, 1);
      } else if (r.hull <= r.maxHull * 0.5 && vrand() < dt * 12) {
        this.fx.smoke.emitParticleAt(r.px - 18, r.py + 2, 1);
      }
    },

    // LEAD-PURSUIT AIMING. The prototype's reviewed aim model is preserved
    // exactly where it matters: tracer speed is still 560, the lead time is
    // still clamped to 0.1-1.4 s, and the aim point is still ahead of the
    // target along its own velocity. What changed is HOW the lead time is
    // found. It used to be horizontal distance over tracer speed, which
    // ignores the target's vertical motion entirely, so a fast-climbing ace
    // on a tall viewport put the ring hundreds of pixels off the intercept
    // and sometimes outside the playfield.
    //
    // This solves the real intercept: find t where the target, travelling at
    // its own velocity, meets a round travelling at TRACER_SPEED from the
    // muzzle. |d + v t| = S t expands to a quadratic in t; the smaller
    // positive root is the first meeting. When the target is faster than the
    // round in the closing direction there is no root, and the fallback is
    // the prototype's horizontal estimate.
    leadPoint: function (f, out) {
      var r = this.run;
      var mx = r.px + 26, my = r.py - 1;         // muzzle, same one that fires
      var dx = f.x - mx, dy = f.y - my;
      var a = f.vx * f.vx + f.vy * f.vy - TRACER_SPEED * TRACER_SPEED;
      var b = 2 * (dx * f.vx + dy * f.vy);
      var c = dx * dx + dy * dy;
      var t = -1;
      if (Math.abs(a) < 1e-3) {
        if (Math.abs(b) > 1e-6) t = -c / b;
      } else {
        var disc = b * b - 4 * a * c;
        if (disc >= 0) {
          var sq = Math.sqrt(disc);
          var t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
          // Smallest strictly positive root.
          if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
          else t = Math.max(t1, t2);
        }
      }
      if (!(t > 0) || !isFinite(t)) {
        t = Math.max(40, f.x - r.px) / TRACER_SPEED;   // prototype fallback
      }
      var lead = clamp(t, 0.1, 1.4);
      out.x = f.x + f.vx * lead;
      out.y = f.y + f.vy * lead;
      // The ring is a HUD element: keep it inside the playfield even when the
      // honest intercept is off the top or bottom of a tall viewport. The
      // clamp is generous so it only bites in the extreme case the review
      // found, and syncView flags it so the edge arrow can take over.
      out.off = (out.x < 0 || out.x > this.vw || out.y < 0 || out.y > this.vh);
      return out;
    },

    nearestFoe: function () {
      var r = this.run, best = null, bd = Infinity;
      for (var i = 0; i < this.foes.length; i++) {
        var f = this.foes[i];
        if (!f.live) continue;
        var d = dist2(f.x, f.y, r.px, r.py);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    },

    firePlayer: function () {
      var r = this.run, plane = this.plane;
      var t = r.target;
      var lp = this._lp || (this._lp = { x: 0, y: 0 });
      var mx = r.px + 26, my = r.py - 1;
      var ang;
      if (t && t.live) {
        // The round is fired along the SAME muzzle-to-lead-point vector the
        // reticle draws. It used to be fired at a fixed horizontal distance
        // of 0.48 screen widths, so on a narrow viewport, or against a
        // target far to the right, the tracer visibly passed above or below
        // the ring the HUD told you to shoot at.
        this.leadPoint(t, lp);
        ang = Math.atan2(lp.y - my, lp.x - mx);
      } else {
        // No lock: fly the round out along the nose with the stick's aim
        // offset, exactly as before.
        ang = Math.atan2(this.inp.y * 80, this.vw * 0.48 + this.inp.x * 70);
      }
      var weapon = r.equippedWeapon;
      var power = r.powerLevel;
      var count = weapon === 'spread' ? (power >= 3 ? 5 : 3) :
        (weapon === 'cannon' ? 1 + Math.floor((power - 1) / 3) : 1);
      var spread = weapon === 'spread' ? 0.15 : (count > 1 ? 0.055 : 0);
      var speed = weapon === 'laser' ? 760 : TRACER_SPEED;
      var damage = weapon === 'laser' ? 2 + Math.floor((power - 1) / 3) : 1;
      var tint = WEAPONS[weapon].color;
      var homing = weapon === 'homing';
      var fired = false;
      for (var si = 0; si < count; si++) {
        var offset = count === 1 ? 0 : (si - (count - 1) * 0.5) * spread;
        var b = this.takeFree(this.tracers);
        if (!b) break;
        b.live = true; b.x = mx; b.y = my;
        b.vx = Math.cos(ang + offset) * speed; b.vy = Math.sin(ang + offset) * speed;
        b.life = weapon === 'laser' ? 1.2 : 1.6; b.wing = false; b.dmg = damage;
        b.homing = homing; b.grazed = false; fired = true;
        b.spr.setVisible(true).setFrame('tracer_own').setRotation(ang + offset)
          .setTint(tint);
      }
      if (!fired) return;
      r.fireT = plane.gap * (weapon === 'laser' ? 0.72 : 1);
      this.muzzleT = 0.10;
      this.muzzle.setPosition(mx + Math.cos(ang) * 12, my + Math.sin(ang) * 12)
        .setTint(tint).setScale(weapon === 'laser' ? 1.15 : 0.82).setVisible(true);
      this.fx.impact.emitParticleAt(mx, my, weapon === 'laser' ? 3 : 2);
      this.cameraKick(-1.4, Math.sin(ang) * 1.4);
      sfx('gun', { volume: weapon === 'laser' ? 0.42 : 0.34,
        rate: weapon === 'laser' ? 1.18 : 1 });
    },

    fireFlare: function () {
      var r = this.run;
      if (r.flares <= 0) return;
      r.flares--;
      kit.juice.shake(4, 160);
      this.fx.flare.emitParticleAt(r.px - 16, r.py + 10, 16);
      var defeated = 0;
      for (var i = 0; i < this.missiles.length; i++) {
        var m = this.missiles[i];
        if (!m.live) continue;
        // FLARE DEFEAT ENVELOPE: 190 px radius, prototype scoring intact.
        if (dist2(m.x, m.y, r.px, r.py) < FLARE_RADIUS * FLARE_RADIUS) {
          m.live = false; m.spr.setVisible(false);
          this.fx.fire.emitParticleAt(m.x, m.y, 6);
          r.score += 18; r.style += 1; defeated++;
        }
      }
      this.pushMsg(defeated ? 'FLARE DEFEATED ' + defeated : 'FLARE OUT', 1.1,
                   defeated ? '#ffe3a1' : '#cfe8f6');
      sfx('flare');
      if (this.tutorial) this.tutorial.flared = true;
    },

    fireBomb: function () {
      var r = this.run;
      if (r.bombs <= 0 || r.ended) return;
      r.bombs--;
      r.score += 40;
      this.ring(r.px + this.vw * 0.34, r.py, 'kill');
      this.fx.fire.emitParticleAt(r.px + this.vw * 0.34, r.py, 42);
      this.fx.impact.emitParticleAt(r.px + this.vw * 0.34, r.py, 22);
      kit.juice.shake(12, 300);
      kit.juice.hitStop(55);
      for (var i = 0; i < this.foes.length; i++) {
        var f = this.foes[i];
        if (!f.live) continue;
        this.hitFoe(f, { x: f.x, y: f.y, vx: -1, vy: 0, dmg: 3 });
      }
      this.pushMsg('BOMB AWAY', 1.2, '#ffb0bd');
      this.popScore(r.px + this.vw * 0.26, r.py - 36, 'BOMB', '#ffb0bd');
      sfx('flare', { volume: 0.82, rate: 0.72 });
    },

    // SINGLE PATH for the wingman order. The label, its colour and the sim
    // flag are set together, so a restart (which resets wOrder to cover)
    // cannot leave the control reading ATTACK.
    setWingOrder: function (order, announce) {
      var r = this.run;
      if (r) r.wOrder = order;
      setTextIfChanged(this.ctl.wingLabel, order === 'cover' ? 'COVER' : 'ATTACK');
      this.ctl.wingLabel.setColor(order === 'cover' ? '#a9e6ff' : '#ffd76a');
      if (announce) {
        this.pushMsg(order === 'cover' ? 'WINGMAN: COVER ME' : 'WINGMAN: ATTACK RUN', 1.4,
                     '#a9e6ff');
        sfx('select', { volume: 0.6 });
      }
    },

    toggleWingman: function () {
      this.setWingOrder(this.run.wOrder === 'cover' ? 'attack' : 'cover', true);
      if (this.tutorial) this.tutorial.ordered = true;
    },

    // ----------------------------------------------------------- wingman
    stepWingman: function (dt) {
      var r = this.run, h = this.vh;
      // The wingman runs BEFORE stepFoes refreshes r.target, so a target that
      // died last step was still stale here: an ordered wingman broke off and
      // flew back to formation for a step instead of picking the next bandit.
      if (r.wOrder === 'attack' && (!r.target || !r.target.live)) {
        r.target = this.nearestFoe();
      }
      var target = (r.wOrder === 'attack' && r.target && r.target.live) ? r.target : null;
      // WINGMAN ATTACK RUN: the prototype's tuned offsets and weave.
      var dx = target ? target.x - 100 : r.px - 74;
      var dy = target ? target.y + Math.sin(r.t * 5) * 20 : r.py + 72;
      r.wx = approach(r.wx, dx, dt, 0.0008);
      r.wy = approach(r.wy, clamp(dy, this.bounds.top, this.bounds.bottom), dt, 0.001);
      r.wbank = approach(r.wbank, clamp((r.wy - dy) * -0.02, -1, 1), dt, 0.004);

      r.wShot -= dt;
      if (r.wShot <= 0) {
        var shootAt = target;
        if (!shootAt && r.wOrder === 'cover') {
          // In COVER the wingman only engages what is threatening you, and
          // will shoot down inbound missiles inside a short cone.
          shootAt = this.foeNearPlayer(210);
        }
        if (shootAt) {
          this.fireWingman(shootAt);
          r.wShot = 0.72;         // prototype cadence
        } else {
          r.wShot = 0.22;
        }
      }
      if (vrand() < dt * 22) this.fx.trail.emitParticleAt(r.wx - 24, r.wy + 1, 1);
    },

    foeNearPlayer: function (radius) {
      var r = this.run, best = null, bd = radius * radius;
      for (var i = 0; i < this.foes.length; i++) {
        var f = this.foes[i];
        if (!f.live) continue;
        var d = dist2(f.x, f.y, r.px, r.py);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    },

    fireWingman: function (target) {
      var r = this.run;
      var b = this.takeFree(this.tracers);
      if (!b) return;
      var ang = Math.atan2(target.y - r.wy, target.x - r.wx);
      b.live = true; b.x = r.wx + 22; b.y = r.wy;
      b.vx = Math.cos(ang) * 430; b.vy = Math.sin(ang) * 430;
      b.life = 1.6; b.wing = true; b.dmg = 1; b.grazed = false;
      b.spr.setVisible(true).setFrame('tracer_wing').setRotation(ang)
        .setTint(mixRGB(this.theme.tracer, 0x8ff0e0, 0.5));
      sfx('gunWing', { volume: 0.22 });
    },

    // -------------------------------------------------------------- foes
    spawnFoe: function (kind, aceId, bossId, formation) {
      var f = this.takeFree(this.foes);
      if (!f) return null;
      var w = this.vw, h = this.vh;
      var bossKey = bossId || null;
      var def = bossKey ? (BOSS_DEFS[bossKey] || ACES[bossKey])
        : (aceId ? ACES[aceId] : SQUADRON[kind]);
      var aggro = this.run.difficulty || this.sortie.aggro;
      f.live = true;
      f.kind = kind; f.def = def; f.ace = aceId || null;
      f.boss = bossKey || aceId || null;
      f.bossTier = bossKey ? (def.tier || 'mid') : (aceId ? 'ace' : null);
      f.maxHp = (bossKey || aceId) ? def.hp : Math.max(1, Math.round(def.hp * (0.7 + aggro * 0.45)));
      f.hp = f.maxHp;
      f.x = w + 70 + srand() * 120;
      var pat = formation && formation.pattern ? formation.pattern : 'free';
      var slot = formation ? formation.index : 0;
      var total = formation ? formation.total : 1;
      if (pat === 'pincer') f.y = slot % 2 ? h * 0.78 : h * 0.22;
      else if (pat === 'highlow') f.y = slot % 2 ? h * 0.70 : h * 0.24;
      else if (pat === 'wall') f.y = h * (0.18 + (slot / Math.max(1, total - 1)) * 0.62);
      else if (pat === 'vee') f.y = h * 0.48 + (slot - (total - 1) * 0.5) * 28;
      else f.y = 76 + srand() * Math.max(90, h - 200);
      f.vx = -def.speed * (0.85 + aggro * 0.18);
      f.vy = 0;
      f.t = 0; f.phase = srand() * Math.PI * 2;
      f.gun = 1.0 + srand() * (def.gun || 2.4) / aggro;
      f.missile = 3.4 + srand() * 3;
      f.hit = 0; f.bank = 0; f.broke = false; f.smoke = 0; f.tele = 0; f.burst = 0;
      f.warnT = 0; f.warnKind = ''; f.pattern = pat; f.slot = slot; f.total = total;
      f.phase3 = 0; f.dmg = 0; f.flash = 0; f.burn = 0;
      var frame = def.frame + '_lvl';
      f._fk = null; f._tk = null;
      f.spr.setVisible(true).setFrame(frame).setTint(0xffffff).setFlipX(true).setScale(1.0);
      // SCENE-RESPONSIVE LIGHTING: the bandit's rim glow is the theme's key
      // light warmed toward hostile red, or the ace's own palette.
      f.rimTint = (bossKey || aceId) ? def.rim : mixRGB(this.theme.rim, 0xff6a5c, 0.62);
      f.glow.setVisible(true).setTint(f.rimTint)
        .setDisplaySize(def.r * 3.2, def.r * 3.2).setAlpha((bossKey || aceId) ? 0.30 : 0.14);
      if (bossKey || aceId) this.aceIntro(f, def);
      this.run.banditsLeft++;
      return f;
    },

    // ACE DUEL AS A BOSS MOMENT. The wave banner was doing all of this work
    // before: same slide, same font, a health bar and a message. Now the
    // sortie stops, the frame letterboxes, the sky washes to the ace's
    // palette, and he gets a card with his call sign and his airframe on it.
    aceIntro: function (f, def) {
      var r = this.run;
      r.aceUp = true;
      r.aceRef = f;
      r.bossRef = f;
      r.bossActive = true;
      r.aceDef = def;
      r.aceIntro = motionEnabled() ? 2.4 : 1.1;
      this.hud.bossWrap.setVisible(true);
      setTextIfChanged(this.hud.bossName, def.name.toUpperCase());
      this.letterTop.setVisible(true);
      this.letterBot.setVisible(true);
      this.aceWash.setFillStyle(def.wash);
      setFrameIf(this.aceCardArt, def.frame + '_lvl');
      setTextIfChanged(this.aceCardKicker, def.tier === 'stage' ? 'STAGE BOSS' :
        (def.tier === 'mid' ? 'MIDBOSS' : 'ACE DUEL'));
      setTextIfChanged(this.aceCardName, def.name.toUpperCase());
      setTextIfChanged(this.aceCardSign, def.sign);
      this.aceCard.setVisible(true).setAlpha(0).setScale(0.86);
      if (motionEnabled()) this.tweens.add({ targets: this.aceCard, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 380, ease: 'Back.easeOut' });
      else this.aceCard.setAlpha(1).setScale(1);
      // Unique entry: he arrives from off the right edge at speed rather than
      // fading up wherever the spawner put him.
      f.x = this.vw + 150;
      f.y = clamp(this.run.py, this.bounds.top, this.bounds.bottom);
      f.vx = -def.speed * 1.9;
      kit.juice.shake(def.tier === 'stage' ? 13 : 9, 420);
      sfx('lock');
      sfx('sortie');
      if (!r.heat) { kit.audio.music('musicCombat', 1200); r.heat = true; }
    },

    aceIntroEnd: function () {
      var r = this.run;
      r.aceIntro = 0;
      var def = r.aceDef;
      if (motionEnabled()) this.tweens.add({
        targets: this.aceCard, alpha: 0, scaleX: 1.08, scaleY: 1.08, duration: 260,
        ease: 'Quad.easeIn',
        onComplete: function () { /* card is hidden by the alpha, kept pooled */ }
      });
      else this.aceCard.setAlpha(0);
      if (def) this.pushMsg(def.call, 3.0, '#ffd0a8');
      if (r.aceRef) r.aceRef.vx = -r.aceRef.def.speed;
    },

    stepFoes: function (dt) {
      var r = this.run, w = this.vw, h = this.vh;
      var aggro = r.difficulty || this.sortie.aggro;
      r.target = this.nearestFoe();

      for (var i = 0; i < this.foes.length; i++) {
        var f = this.foes[i];
        if (!f.live) continue;
        f.t += dt;
        f.hit = Math.max(0, f.hit - dt);
        f.tele = Math.max(0, f.tele - dt);
        var def = f.def;
        var ai = f.boss ? 'ace' : def.ai;

        if (ai === 'weave') {
          var want = r.py + Math.sin(f.t * 1.9 + f.phase) * 85;
          f.vy = lerp(f.vy, clamp((want - f.y) * 1.3, -135, 135), 1 - Math.pow(0.03, dt));
        } else if (ai === 'boom') {
          // BOLTER BREAK: reverses once past 62% of the screen, then re-attacks.
          if (!f.broke && f.x < w * 0.62) {
            f.broke = true;
            f.vx = Math.abs(f.vx) + 120;
            this.pushMsg('BOLTER BREAK', 0.9, '#ffd0a8');
          }
          f.vy = Math.sin(f.t * 2 + f.phase) * 60;
        } else if (ai === 'pursue') {
          f.vy = lerp(f.vy, (r.py - f.y) * 0.62, 1 - Math.pow(0.08, dt));
        } else if (ai === 'high') {
          // Kites hold the top third and shoot long; they dive only to escape.
          var hold = h * (0.16 + 0.12 * Math.sin(f.t * 0.7 + f.phase));
          if (f.x < w * 0.34) { f.vx = Math.abs(f.vx) * 0.9 + 60; }
          f.vy = lerp(f.vy, (hold - f.y) * 1.1, 1 - Math.pow(0.05, dt));
        } else if (ai === 'heavy') {
          f.vy = Math.sin(f.t * 0.8 + f.phase) * 26;
          if (f.x < w * 0.52) f.vx = lerp(f.vx, 12, 1 - Math.pow(0.2, dt));
        } else if (ai === 'strafe') {
          // Shrikes dive at you, extend, and come back around.
          if (!f.broke) {
            f.vy = lerp(f.vy, (r.py - f.y) * 1.5, 1 - Math.pow(0.02, dt));
            if (f.x < r.px + 40) { f.broke = true; f.vx = Math.abs(f.vx) * 1.1; }
          } else {
            f.vy = lerp(f.vy, -60 * Math.sign(r.py - f.y || 1), 1 - Math.pow(0.1, dt));
            if (f.x > w + 60) { f.broke = false; f.vx = -Math.abs(f.vx); f.y = 70 + srand() * (h - 190); }
          }
        } else if (ai === 'ace') {
          this.stepBoss(f, dt);
        }

        // Formation identity sits on top of the airframe archetype. A Vane
        // in a pincer should feel different from a Vane in a Vee, so waves
        // read as attack plans rather than a stream of unrelated sprites.
        if (!f.boss && f.pattern !== 'free') {
          var center = h * 0.50;
          if (f.pattern === 'crossfire') {
            var cross = (f.slot % 2 ? 1 : -1) * (h * 0.27);
            f.vy = lerp(f.vy, ((center + cross) - f.y) * 1.3, 1 - Math.pow(0.06, dt));
          } else if (f.pattern === 'swoop') {
            var swoop = r.py + Math.sin(f.t * 2.4 + f.phase) * 118;
            f.vy = lerp(f.vy, (swoop - f.y) * 1.8, 1 - Math.pow(0.025, dt));
          } else if (f.pattern === 'wall') {
            var lane = h * (0.20 + (f.slot / Math.max(1, f.total - 1)) * 0.60);
            f.vy = lerp(f.vy, (lane - f.y) * 1.1, 1 - Math.pow(0.05, dt));
          } else if (f.pattern === 'pincer') {
            var pinch = r.py + (f.slot % 2 ? 86 : -86);
            f.vy = lerp(f.vy, (pinch - f.y) * 1.15, 1 - Math.pow(0.05, dt));
          }
        }

        f.x += f.vx * dt;
        f.y = clamp(f.y + f.vy * dt, this.bounds.top - 10, this.bounds.bottom + 4);
        f.bank = approach(f.bank, clamp(f.vy / 160, -1, 1), dt, 0.004);
        f.flash = Math.max(0, f.flash - dt);
        // A small, explicit player hurtbox keeps the sprite readable and
        // makes contact fair. The hostile airframe is nudged away so a single
        // overlap cannot drain hull on consecutive fixed steps.
        if (dist2(f.x, f.y, r.px, r.py) < (PLAYER_HURT_RADIUS + f.def.r * 0.55) ** 2) {
          this.damagePlayer(f.boss ? 2 : 1);
          f.x += 34;
          f.vx = Math.abs(f.vx) + 30;
        }

        // Gunnery is telegraphed. The warning is short enough to keep the
        // pace, but long enough for a player to read the hostile glow and
        // make a bank instead of taking an invisible hit.
        f.warnT = Math.max(0, f.warnT - dt);
        if (f.warnT <= 0 && f.warnKind) {
          var firedKind = f.warnKind;
          f.warnKind = '';
          if (firedKind === 'gun') {
            this.foeShoot(f);
            if (def.burst && f.burst < (def.burst - 1)) { f.burst++; f.gun = 0.16; }
            else { f.burst = 0; f.gun = (def.gun || 2.4) * (0.7 + srand() * 0.7); }
          } else if (firedKind === 'missile') {
            this.launchMissile(f);
            f.missile = (f.boss ? 3.4 : 6.0) + srand() * 2.4;
          }
        } else if (f.warnT <= 0) {
          f.gun -= dt * aggro;
          if (f.gun <= 0 && f.x < w + 60 && f.x > 30) {
            f.warnKind = 'gun'; f.warnT = f.boss ? 0.42 : 0.22; f.gun = 999;
          } else if ((def.missile || f.boss) && f.x > w * 0.30 && f.x < w + 40) {
            f.missile -= dt * aggro;
            if (f.missile <= 0) { f.warnKind = 'missile'; f.warnT = f.boss ? 0.62 : 0.40; f.missile = 999; }
          }
        }
        if (def.flak && f.x < w + 40) {
          // Flak cadence rides the sortie's difficulty ramp like every other
          // weapon. It used to subtract plain dt and reset to an unscaled
          // interval, so a Drell in sortie 13 laid the same barrage as one in
          // sortie 7 while its gunnery had doubled.
          f.missile -= dt * aggro;
          if (f.missile <= 0) { this.dropFlak(f); f.missile = (2.6 + srand() * 1.6) / aggro; }
        }

        // DAMAGE STAGES. Three readable states rather than one generic puff:
        //   1 (>70% hull)  clean
        //   2 (<=70%)      engine trouble: thin smoke, dulled engine glow
        //   3 (<=35%)      burning: fire, heavy trailing smoke, shedding bits
        var frac = f.hp / f.maxHp;
        var stage = frac > 0.70 ? 1 : (frac > 0.35 ? 2 : 3);
        if (stage !== f.dmg) {
          f.dmg = stage;
          if (stage === 3) {
            // The moment an airframe catches: a short spark burst so the
            // transition is an event, not a gradual fade.
            this.fx.impact.emitParticleAt(f.x, f.y, 5);
            this.shedDebris(f.x, f.y, 2, 0.55);
          }
        }
        if (stage >= 2) {
          f.smoke -= dt;
          if (f.smoke <= 0) {
            f.smoke = stage === 3 ? 0.06 : 0.15;
            this.fx.smoke.emitParticleAt(f.x + 16, f.y + 3, 1);
          }
        }
        if (stage === 3) {
          f.burn -= dt;
          if (f.burn <= 0) {
            f.burn = 0.09;
            this.fx.burn.emitParticleAt(f.x + 13, f.y + 1, 1);
          }
        }

        // Wrap bandits that run off either edge so a furball never empties.
        if (f.x < -130 || f.x > w + 260) {
          if (f.boss) { f.x = w + 120; f.vx = -Math.abs(f.vx); }
          else {
            f.x = w + 110;
            f.y = 70 + srand() * Math.max(80, h - 190);
            f.broke = false;
            f.vx = -Math.abs(f.vx);
          }
        }
      }
    },

    // Aces and bosses run authored phase beats as their hull drops. The stage
    // boss gets one extra final phase, while both midbosses teach the same
    // readable transition language on a smaller health bar.
    stepBoss: function (f, dt) {
      var r = this.run, w = this.vw, h = this.vh;
      var frac = f.hp / f.maxHp;
      var phase = f.def.phases === 4
        ? (frac > 0.75 ? 1 : (frac > 0.50 ? 2 : (frac > 0.25 ? 3 : 4)))
        : (frac > 0.66 ? 1 : (frac > 0.33 ? 2 : 3));
      if (phase !== f.phase3) {
        f.phase3 = phase;
        f.tele = 1.2;
        if (phase > 1) {
          var phaseText = phase === 2 ? 'PHASE 2 // COMMITTING' :
            (phase === 3 ? 'PHASE 3 // BREAKING FORMATION' : 'PHASE 4 // LAST VECTOR');
          this.pushMsg(phaseText,
                       2.0, '#ffb0a0');
          kit.juice.shake(f.bossTier === 'stage' ? 9 : 6, 260);
          sfx('lock');
        }
      }
      var chase = 0.55 + phase * (f.bossTier === 'stage' ? 0.24 : 0.22);
      f.vy = lerp(f.vy, (r.py - f.y) * chase, 1 - Math.pow(0.06, dt));
      // He works the whole box rather than sitting at one range.
      var wantX = w * (0.52 + 0.26 * Math.sin(f.t * 0.5 + f.phase));
      f.vx = lerp(f.vx, (wantX - f.x) * 1.3, 1 - Math.pow(0.08, dt));
      f.vx = clamp(f.vx, -f.def.speed * (phase === 4 ? 1.8 : 1.5), f.def.speed * 1.5);
      if (phase >= 3 && f.t % (f.bossTier === 'stage' ? 3.2 : 4) < dt) f.tele = 0.8;
    },

    stepAce: function (f, dt) {
      this.stepBoss(f, dt);
    },

    foeShoot: function (f) {
      var r = this.run;
      var b = this.takeFree(this.foeTracers);
      if (!b) return;
      var speed = f.boss ? 300 : (f.def.ai === 'high' ? 280 : 225);
      var dx = r.px - f.x;
      var lead = clamp(Math.abs(dx) / speed, 0.15, 1.2);
      var ang = Math.atan2(r.py + r.pvy * lead * 0.35 - f.y, dx);
      b.live = true; b.x = f.x - 18; b.y = f.y;
      b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
      b.life = 3; b.dmg = 1; b.grazed = false;
      b.spr.setVisible(true).setFrame('tracer_foe').setRotation(ang)
        .setTint(this.theme.foeShot);
      sfx('foeGun', { volume: 0.22 });
    },

    launchMissile: function (f) {
      var m = this.takeFree(this.missiles);
      if (!m) return;
      m.live = true; m.x = f.x - 22; m.y = f.y;
      m.vx = -150; m.vy = 0; m.t = 0; m.life = 9; m.dmg = 2;
      m.grazed = false;
      m.spr.setVisible(true).setFrame('missile').setRotation(Math.PI).setBlendMode(
        Phaser.BlendModes.NORMAL);
      this.run.locked = 2.2;
      this.pushMsg('MISSILE INBOUND. FLARE.', 1.6, '#ffb0a0');
      sfx('missile');
      sfx('lock');
    },

    dropFlak: function (f) {
      for (var i = 0; i < 3; i++) {
        var b = this.takeFree(this.flak);
        if (!b) return;
        var ang = Math.PI + (srand() - 0.5) * 0.9;
        b.live = true; b.x = f.x - 20; b.y = f.y + (i - 1) * 12;
        b.vx = Math.cos(ang) * 130; b.vy = Math.sin(ang) * 130 + 40;
        b.life = 2.6; b.dmg = 1; b.grazed = false;
        b.spr.setVisible(true).setFrame('flak').setRotation(0);
      }
      sfx('foeGun', { volume: 0.3, rate: 0.8 });
    },

    // -------------------------------------------------------- projectiles
    graze: function (b) {
      if (b.grazed || this.run.ended) return;
      b.grazed = true;
      var r = this.run;
      r.graze++;
      r.combo = Math.max(1, r.combo);
      r.comboT = 2.6;
      r.multiplier = 1 + Math.min(8, Math.max(0, r.combo - 1)) * 0.18;
      r.style += 1;
      var gain = Math.round(24 * r.multiplier);
      r.score += gain;
      this.fx.impact.emitParticleAt(b.x, b.y, 3);
      this.popScore(r.px + 28, r.py - 22, 'GRAZE +' + gain, '#8fe6ff');
      if (r.graze % 2 === 1) this.pushMsg('GRAZE +' + gain, 0.8, '#8fe6ff');
      sfx('hit', { volume: 0.22, rate: 1.55 });
    },

    stepProjectiles: function (dt) {
      var r = this.run, w = this.vw, h = this.vh, i, b;

      for (i = 0; i < this.tracers.length; i++) {
        b = this.tracers[i];
        if (!b.live) continue;
        if (b.homing) {
          var home = r.target && r.target.live ? r.target : this.nearestFoe();
          if (home) {
            var wantHome = Math.atan2(home.y - b.y, home.x - b.x);
            var curHome = Math.atan2(b.vy, b.vx);
            var turnHome = curHome + clamp(angleDiff(wantHome, curHome), -2.6 * dt, 2.6 * dt);
            var homingSpeed = Math.max(TRACER_SPEED, Math.hypot(b.vx, b.vy));
            b.vx = Math.cos(turnHome) * homingSpeed;
            b.vy = Math.sin(turnHome) * homingSpeed;
          }
        }
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        var hitSomething = false;
        for (var fi = 0; fi < this.foes.length; fi++) {
          var f = this.foes[fi];
          if (!f.live) continue;
          var rr = f.def.r + 4;
          if (dist2(b.x, b.y, f.x, f.y) < rr * rr) { this.hitFoe(f, b); hitSomething = true; break; }
        }
        if (hitSomething || b.life <= 0 || b.x < -60 || b.x > w + 60 || b.y < -60 || b.y > h + 60) {
          b.live = false; b.spr.setVisible(false);
        }
      }

      for (i = 0; i < this.foeTracers.length; i++) {
        b = this.foeTracers[i];
        if (!b.live) continue;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        var foeD2 = dist2(b.x, b.y, r.px, r.py);
        if (foeD2 < PLAYER_HURT_RADIUS * PLAYER_HURT_RADIUS) {
          b.live = false; b.spr.setVisible(false); this.damagePlayer(1);
          continue;
        }
        if (foeD2 < PLAYER_GRAZE_RADIUS * PLAYER_GRAZE_RADIUS) this.graze(b);
        if (b.life <= 0 || b.x < -80 || b.x > w + 80 || b.y < -80 || b.y > h + 80) {
          b.live = false; b.spr.setVisible(false);
        }
      }

      for (i = 0; i < this.flak.length; i++) {
        b = this.flak[i];
        if (!b.live) continue;
        b.vy += 60 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        var flakD2 = dist2(b.x, b.y, r.px, r.py);
        if (flakD2 < PLAYER_HURT_RADIUS * PLAYER_HURT_RADIUS) {
          b.live = false; b.spr.setVisible(false);
          this.fx.fire.emitParticleAt(b.x, b.y, 4);
          this.damagePlayer(1);
          continue;
        }
        if (flakD2 < PLAYER_GRAZE_RADIUS * PLAYER_GRAZE_RADIUS) this.graze(b);
        if (b.life <= 0 || b.y > h + 40 || b.x < -60) { b.live = false; b.spr.setVisible(false); }
      }

      // MISSILE PURSUIT: prototype turn rate and speed schedule.
      for (i = 0; i < this.missiles.length; i++) {
        b = this.missiles[i];
        if (!b.live) continue;
        b.t += dt; b.life -= dt;
        var want = Math.atan2(r.py - b.y, r.px - b.x);
        var cur = Math.atan2(b.vy, b.vx);
        var a = cur + clamp(angleDiff(want, cur), -MISSILE_TURN * dt, MISSILE_TURN * dt);
        var sp = 170 + Math.min(100, b.t * 14);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        b.x += b.vx * dt; b.y += b.vy * dt;
        var missileD2 = dist2(b.x, b.y, r.px, r.py);
        if (missileD2 < PLAYER_HURT_RADIUS * PLAYER_HURT_RADIUS) {
          b.live = false; b.spr.setVisible(false);
          this.fx.fire.emitParticleAt(b.x, b.y, 12);
          this.damagePlayer(2);
          continue;
        }
        if (missileD2 < PLAYER_GRAZE_RADIUS * PLAYER_GRAZE_RADIUS) this.graze(b);
        if (vrand() < dt * 22) this.fx.smoke.emitParticleAt(b.x, b.y, 1);
        if (b.life <= 0 || b.x < -120 || b.x > w + 120 || b.y < -120 || b.y > h + 120) {
          b.live = false; b.spr.setVisible(false);
        }
      }

      for (i = 0; i < this.pods.length; i++) {
        var p = this.pods[i];
        if (!p.live) continue;
        p.t += dt;
        p.vy = Math.min(46, p.vy + 30 * dt);
        p.vx = approach(p.vx, -24, dt, 0.4);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t > 7 || p.y > h + 40) { p.live = false; p.spr.setVisible(false); p.chute.setVisible(false); }
      }
    },

    // ---------------------------------------------------- impact language
    // House three-beat, stage 2: an expanding ring at the contact point.
    // ring_hit / ring_kill shipped in the atlas and were never drawn.
    ring: function (x, y, kind) {
      var g = null;
      for (var i = 0; i < this.rings.length; i++) if (!this.rings[i].live) { g = this.rings[i]; break; }
      if (!g) return;
      var kill = kind === 'kill';
      g.live = true; g.t = 0;
      g.life = kill ? 0.42 : 0.22;
      g.x = x; g.y = y;
      g.s0 = kill ? 0.32 : 0.18;
      g.s1 = kill ? 2.5 : 1.1;
      g.spr.setVisible(true).setFrame(kill ? 'ring_kill' : 'ring_hit')
        .setPosition(x, y).setScale(g.s0).setAlpha(1)
        .setTint(kill ? mixRGB(this.theme.rim, 0xffd76a, 0.5) : this.theme.glass);
    },

    // Stage 3: hard debris. Sells a kill as an airframe coming apart rather
    // than a sprite being switched off.
    shedDebris: function (x, y, n, scale) {
      for (var i = 0; i < n; i++) {
        var d = null;
        for (var j = 0; j < this.debris.length; j++) if (!this.debris[j].live) { d = this.debris[j]; break; }
        if (!d) return;
        var a = vrand() * Math.PI * 2;
        var sp = 60 + vrand() * 170;
        d.live = true; d.x = x; d.y = y;
        d.vx = Math.cos(a) * sp - 30;
        d.vy = Math.sin(a) * sp - 40;
        d.t = 0; d.life = 0.7 + vrand() * 0.6;
        d.spin = (vrand() - 0.5) * 14;
        d.spr.setVisible(true).setPosition(x, y).setAlpha(1)
          .setScale(scale || (0.5 + vrand() * 0.5)).setTint(this.theme.rim);
      }
    },

    // Stage 3: the score popup, on the house ease-out-back.
    popScore: function (x, y, str, color) {
      var p = null;
      for (var i = 0; i < this.pops.length; i++) if (!this.pops[i].live) { p = this.pops[i]; break; }
      if (!p) return;
      p.live = true; p.t = 0; p.life = 0.85; p.x = x; p.y = y;
      setTextIfChanged(p.obj, str).setColor(color || '#ffe3a1').setVisible(true)
        .setPosition(x, y).setAlpha(1).setScale(0.5);
      this.tweens.killTweensOf(p.obj);
      if (motionEnabled()) this.tweens.add({ targets: p.obj, scaleX: 1, scaleY: 1, duration: 260,
        ease: 'Back.easeOut' });
      else p.obj.setScale(1);
    },

    hitFoe: function (f, b) {
      var r = this.run;
      // A sortie that is already lost must not keep scoring. Tracers still in
      // the air when the hull failed used to fly on and kill bandits, moving
      // score, kills and the ace counter AFTER xp and best had been saved.
      if (r.ended) return;
      f.hp -= b.dmg;
      f.hit = 0.14;
      f.flash = 0.06;               // stage 1: white silhouette flash
      this.ring(b.x, b.y, 'hit');   // stage 2: contact ring
      this.fx.impact.emitParticleAt(b.x, b.y, 4);
      this.cameraKick(-1.8, (b.vy || 0) * 0.012);
      kit.juice.hitStop(18);
      sfx('hit', { volume: 0.5 });

      // DEFLECTION BONUS: a hard crossing shot is worth more.
      var shotAngle = Math.atan2(b.vy, b.vx);
      var foeAngle = Math.atan2(f.vy, f.vx);
      if (Math.abs(angleDiff(shotAngle, foeAngle)) > DEFLECTION_ANGLE) {
        r.style += 1; r.score += 12;
        var now = performance.now();
        if (now - (this._deflT || -1e9) > 1100) {
          this._deflT = now;
          this.pushMsg('DEFLECTION +12', 0.8, '#8fe6ff');
        }
      }

      if (f.hp <= 0) this.killFoe(f);
      else kit.juice.shake(1.2, 60);
    },

    killFoe: function (f) {
      var r = this.run;
      if (r.ended) return;
      f.live = false;
      f.spr.setVisible(false);
      f.glow.setVisible(false);
      r.banditsLeft = Math.max(0, r.banditsLeft - 1);
      r.kills++;
      r.combo++; r.comboT = 2.6;
      r.multiplier = 1 + Math.min(8, Math.max(0, r.combo - 1)) * 0.18;
      var mult = r.multiplier;
      var gain = Math.round(f.def.score * mult);
      r.score += gain;

      // THREE-BEAT KILL: contact ring, fireball and debris, then the popup
      // rising out of the wreck on ease-out-back.
      this.ring(f.x, f.y, 'kill');
      this.fx.fire.emitParticleAt(f.x, f.y, f.boss ? 26 : 12);
      this.fx.smoke.emitParticleAt(f.x, f.y, f.boss ? 10 : 4);
      this.fx.impact.emitParticleAt(f.x, f.y, f.boss ? 18 : 8);
      this.shedDebris(f.x, f.y, f.boss ? 8 : 4);

      if (f.boss) {
        kit.juice.shake(f.bossTier === 'stage' ? 26 : 22, 700); kit.juice.hitStop(120);
        sfx('aceKill');
        r.aceUp = false; r.aceRef = null; r.aceDef = null;
        r.bossRef = null; r.bossActive = false;
        this.hud.bossWrap.setVisible(false);
        this.showBanner(f.bossTier === 'stage' ? 'SKYLINE BROKEN' : 'BOSS BROKEN',
          f.def.name.toUpperCase() + ' IS DOWN');
        this.popScore(f.x, f.y - 18, '+' + gain, '#ffd76a');
        this.ejectPod(f.x, f.y);
        this.dropPickup(f.x, f.y, null, true);
        this.dropPickup(f.x - 28, f.y + 22, null, true);
        if (f.ace) profile.aces++;
      } else {
        // House budget: 50-70 ms of hit-stop on a standard kill class.
        kit.juice.shake(7, 220); kit.juice.hitStop(60);
        sfx('kill');
        this.popScore(f.x, f.y - 14,
          (r.combo > 2 ? 'x' + r.combo + '  ' : '') + '+' + gain, '#ffe3a1');
        if (vrand() < 0.45) this.ejectPod(f.x, f.y);
        this.dropPickup(f.x, f.y);
      }
      profile.kills++;
    },

    dropPickup: function (x, y, forcedType, guaranteed) {
      var force = !!(window.__av && window.__av.forceDrop);
      if (!guaranteed && !force && vrand() > 0.46) return;
      var p = this.takeFree(this.pickups);
      if (!p) return;
      var type = forcedType;
      if (!type) {
        var total = 0, roll, i;
        for (i = 0; i < DROP_TABLE.length; i++) total += DROP_TABLE[i].weight;
        roll = vrand() * total;
        for (i = 0; i < DROP_TABLE.length; i++) {
          roll -= DROP_TABLE[i].weight;
          if (roll <= 0) { type = DROP_TABLE[i].type; break; }
        }
        if (!type) type = 'power';
      }
      var colors = { spread: 0xffd76a, homing: 0x8fe6ff, laser: 0xff8fe6,
        power: 0xfff0c8, shield: 0x9effc0, bomb: 0xff8f9f };
      var glyphs = { spread: 'S', homing: 'H', laser: 'L', power: '+', shield: 'O', bomb: 'B' };
      p.live = true; p.type = type; p.x = x; p.y = y; p.vx = -42; p.vy = 0;
      p.t = 0; p.life = guaranteed ? 18 : 13; p.phase = vrand() * Math.PI * 2;
      p.halo.setTint(colors[type] || 0xffffff).setAlpha(0.30);
      p.core.setFillStyle(colors[type] || 0xffffff, 0.90).setStrokeStyle(2, 0xffffff, 0.92);
      setTextIfChanged(p.glyph, glyphs[type] || '?');
      p.spr.setPosition(x, y).setScale(0.84).setAlpha(0.98).setVisible(true);
      this.run.livePickups++;
    },

    collectPickup: function (p) {
      var r = this.run;
      p.live = false; p.spr.setVisible(false);
      r.livePickups = Math.max(0, r.livePickups - 1);
      if (p.type === 'spread' || p.type === 'homing' || p.type === 'laser') {
        r.equippedWeapon = p.type;
        r.powerLevel = Math.min(5, r.powerLevel + 1);
      } else if (p.type === 'power') {
        r.powerLevel = Math.min(5, r.powerLevel + 1);
      } else if (p.type === 'shield') {
        r.shield = 1;
      } else if (p.type === 'bomb') {
        r.bombs = Math.min(3, r.bombs + 1);
      }
      r.score += 75;
      r.style += 2;
      this.ring(r.px, r.py, 'hit');
      this.fx.flare.emitParticleAt(r.px, r.py, 12);
      this.popScore(r.px + 34, r.py - 24, '+' + (p.type === 'power' ? 'POWER' : p.type.toUpperCase()), '#b9ffcf');
      this.pushMsg('PICKUP: ' + (p.type === 'power' ? 'POWER +' + r.powerLevel : p.type.toUpperCase()),
        1.5, '#b9ffcf');
      sfx('select', { volume: 0.72, rate: 1.15 });
    },

    stepPickups: function (dt) {
      var r = this.run, i;
      for (i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.live) continue;
        p.t += dt; p.life -= dt;
        p.vy = Math.sin(p.t * 2.5 + p.phase) * 12;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (dist2(p.x, p.y, r.px, r.py) < 32 * 32) {
          this.collectPickup(p);
          continue;
        }
        if (p.life <= 0 || p.x < -50) {
          p.live = false; p.spr.setVisible(false);
          r.livePickups = Math.max(0, r.livePickups - 1);
        }
      }
    },

    // EJECTION BEAT: a pod does not simply appear. There is a launch flash,
    // a propellant burst, a smoke ribbon behind the seat, and a chute that
    // snaps open on its own beat a third of a second later.
    ejectPod: function (x, y) {
      var p = this.takeFree(this.pods);
      if (!p) return;
      p.live = true; p.x = x; p.y = y; p.vx = -50; p.vy = -60; p.t = 0;
      p.spr.setVisible(true).setAlpha(1).setScale(1);
      p.chute.setVisible(true).setAlpha(0);
      this.fx.flare.emitParticleAt(x, y + 4, 5);
      this.fx.impact.emitParticleAt(x, y, 3);
      this.ring(x, y, 'hit');
      sfx('eject', { volume: 0.5 });
    },

    // HEALTH UNDERFLOW FIX: hull is floored at zero here, and the pip HUD
    // clamps independently, so two hits landing in the same step can never
    // render a negative hull or a negative pip count.
    damagePlayer: function (amount) {
      var r = this.run;
      if (r.invuln > 0 || r.ended) return;
      if (r.shield > 0) {
        r.shield = 0;
        r.invuln = 0.42;
        r.hitFlash = 0.16;
        r.score += 35;
        this.ring(r.px, r.py, 'hit');
        this.fx.flare.emitParticleAt(r.px, r.py, 18);
        this.pushMsg('SHIELD BROKE', 1.0, '#b9ffcf');
        sfx('hit', { volume: 0.8, rate: 0.72 });
        return;
      }
      r.hull = Math.max(0, r.hull - amount);
      r.invuln = INVULN;
      r.hitFlash = 0.3;
      r.vign = 1;
      r.combo = 0;
      r.multiplier = 1;
      kit.juice.shake(12, 320);
      // Camera dip: a spring-damped kick away from the impact, which recovers
      // on its own. Behind the GGKit juice toggle like every other camera
      // effect.
      this.cameraKick(-4, 7);
      this.ring(r.px, r.py, 'hit');
      this.fx.impact.emitParticleAt(r.px, r.py, 10);
      this.fx.fire.emitParticleAt(r.px, r.py, 5);
      this.shedDebris(r.px, r.py, 2, 0.5);
      sfx('hurt');
      if (r.hull <= 0) this.endSortie(false);
      else this.pushMsg('HULL ' + r.hull + '/' + r.maxHull, 1.2, '#ffb0a0');
    },

    // ------------------------------------------------------------- waves
    stepWaves: function (dt) {
      var r = this.run;
      if (r.ended) return;
      var sortie = this.sortie;
      // Difficulty moves continuously toward the sortie and then inches up
      // with each formation. This avoids the old staircase where an entire
      // new wave suddenly inherited a different attack cadence.
      var waveTarget = sortie.aggro + Math.max(0, r.wave - 1) * 0.018;
      r.difficulty = approach(r.difficulty, Math.min(1.92, waveTarget), dt, 0.82);

      if (r.waveSpawning) {
        r.waveSpawnT -= dt;
        if (r.waveSpawnT <= 0 && r.waveQueue && r.waveSpawned < r.waveQueue.length) {
          var pat = WAVE_PATTERNS[r.wavePatternIndex];
          this.spawnFoe(r.waveQueue[r.waveSpawned], null, null, {
            pattern: pat.id, index: r.waveSpawned, total: r.waveQueue.length
          });
          r.waveSpawned++;
          r.waveSpawnT = pat.gap / Math.max(0.90, r.difficulty * 0.72);
        }
        if (r.waveQueue && r.waveSpawned >= r.waveQueue.length) {
          r.waveSpawning = false;
          r.waveQueue = null;
          r.waveDelay = 1.25;
        }
        return;
      }

      if (r.banditsLeft > 0) return;
      r.waveDelay -= dt;
      if (r.waveDelay > 0) return;

      if (r.wave < sortie.waves.length) {
        var list = sortie.waves[r.wave];
        var pattern = WAVE_PATTERNS[(this.sortieNo + r.wave - 1) % WAVE_PATTERNS.length];
        r.wave++;
        r.waveQueue = list;
        r.waveSpawned = 0;
        r.wavePattern = pattern.id;
        r.wavePatternIndex = WAVE_PATTERNS.indexOf(pattern);
        r.waveSpawning = true;
        r.waveSpawnT = 0;
        this.showBanner('WAVE ' + r.wave, pattern.name + SEP + list.length + ' CONTACTS');
        if (r.wave > 1 && !r.heat) { kit.audio.music('musicCombat', 1400); r.heat = true; }
      } else if (sortie.midboss && !r.midbossSpawned) {
        r.midbossSpawned = true;
        this.spawnFoe(null, null, sortie.midboss);
        r.waveDelay = 1.8;
      } else if (sortie.stageBoss && !r.stageBossSpawned) {
        r.stageBossSpawned = true;
        this.spawnFoe(null, null, sortie.stageBoss);
        r.waveDelay = 2.0;
      } else if (sortie.ace && !r.aceSpawned) {
        r.aceSpawned = true;
        this.spawnFoe(null, sortie.ace);
        r.waveDelay = 2.0;
      } else {
        this.endSortie(true);
      }
    },

    // ---------------------------------------------------------- fx clocks
    stepFx: function (dt) {
      var r = this.run, i;
      this.muzzleT = Math.max(0, this.muzzleT - dt);
      if (this.muzzleT <= 0) this.muzzle.setVisible(false);
      r.comboT -= dt;
      if (r.comboT <= 0 && r.combo > 0) { r.combo = 0; r.multiplier = 1; }
      r.locked = Math.max(0, r.locked - dt);
      r.vign = Math.max(0, r.vign - dt * 1.8);
      this.stepPickups(dt);

      var restack = false;
      for (i = 0; i < this.msgs.length; i++) {
        var m = this.msgs[i];
        if (!m.live) continue;
        m.t -= dt;
        if (m.t <= 0) { m.live = false; m.obj.setAlpha(0); restack = true; }
      }
      // pushMsg claimed to move the stack and never did: it only counted the
      // live entries to pick a slot, so a message expiring in the middle left
      // a hole and the next one landed on top of a survivor.
      if (restack) this.restackMsgs();

      // Contact rings.
      for (i = 0; i < this.rings.length; i++) {
        var g = this.rings[i];
        if (!g.live) continue;
        g.t += dt;
        var u = g.t / g.life;
        if (u >= 1) { g.live = false; g.spr.setVisible(false); continue; }
        // Ease-out expansion with a linear fade: the ring outruns the eye
        // early and thins out, which is what reads as force.
        var e = 1 - (1 - u) * (1 - u);
        g.spr.setScale(lerp(g.s0, g.s1, e)).setAlpha(1 - u);
      }

      // Debris.
      for (i = 0; i < this.debris.length; i++) {
        var d = this.debris[i];
        if (!d.live) continue;
        d.t += dt;
        d.vy += 280 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.t >= d.life || d.y > this.vh + 40) { d.live = false; d.spr.setVisible(false); continue; }
        d.spr.setAlpha(1 - d.t / d.life);
      }

      // Score popups: rise and fade after the back-out settle.
      for (i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        if (!p.live) continue;
        p.t += dt;
        if (p.t >= p.life) { p.live = false; p.obj.setVisible(false); continue; }
        p.y -= 34 * dt;
        p.obj.setAlpha(p.t > p.life * 0.55 ? 1 - (p.t - p.life * 0.55) / (p.life * 0.45) : 1);
      }
      // Danger drives the music crossfade: how much is shooting at you.
      var danger = 0;
      for (i = 0; i < this.foeTracers.length; i++) if (this.foeTracers[i].live) danger += 0.06;
      for (i = 0; i < this.missiles.length; i++) if (this.missiles[i].live) danger += 0.5;
      danger += Math.min(1, r.banditsLeft * 0.12);
      r.danger = lerp(r.danger, danger, 1 - Math.pow(0.2, dt));
      if (!r.heat && r.danger > 0.75) { kit.audio.music('musicCombat', 1400); r.heat = true; }
      else if (r.heat && r.danger < 0.22 && !r.aceUp) {
        kit.audio.music('musicCruise', 1800); r.heat = false;
      }
    },

    // ------------------------------------------------------------- ending
    endSortie: function (won) {
      var r = this.run;
      if (r.ended) return;
      r.ended = true;
      r.won = won;
      r.bossActive = false;

      // Rounds already in flight stop counting the moment the sortie is
      // decided. Otherwise a tracer fired a beat before the hull failed
      // arrives during the ejection and adds a kill, an ace and score to a
      // profile that has already been written.
      for (var ti = 0; ti < this.tracers.length; ti++) {
        this.tracers[ti].live = false;
        this.tracers[ti].spr.setVisible(false);
      }

      if (won) {
        var timeBonus = Math.max(0, Math.round(600 - r.t * 3));
        var hullBonus = r.hull * 120;
        r.score += timeBonus + hullBonus;
        this.lastBreakdown = { time: timeBonus, hull: hullBonus };
        sfx('clear');
        kit.audio.music('musicCruise', 1200);
        profile.sorties++;
        if (this.sortieNo >= profile.unlocked && this.sortieNo < SORTIES.length) {
          profile.unlocked = this.sortieNo + 1;
        }
      } else {
        this.lastBreakdown = null;
        sfx('fail');
        kit.audio.music('musicCruise', 1400);
        this.fx.fire.emitParticleAt(r.px, r.py, 24);
        this.fx.smoke.emitParticleAt(r.px, r.py, 8);
        this.ejectPod(r.px, r.py);
        kit.juice.shake(20, 700);
      }

      var before = rankIndex(profile.xp);
      profile.xp += Math.round(r.score * (won ? 1 : 0.35));
      var after = rankIndex(profile.xp);
      var key = String(this.sortieNo);
      if (!profile.best[key] || r.score > profile.best[key]) profile.best[key] = r.score;
      if (this.tutorial) { profile.tutorialDone = true; this.tutorial = null; }
      saveProfile();
      this.rankedUp = after > before ? RANKS[after] : null;
      if (this.rankedUp) sfx('rank');

      this.time.delayedCall(won ? 900 : 1200, this.showResults, [], this);
    },

    // DEBRIEF. Not a flat overlay any more: the sortie's own sky with its
    // ridge line, a win/loss key-art treatment (your airframe flying home, or
    // the pilot under a chute), score that COUNTS UP, and bonuses that stage
    // in one at a time so the total assembles in front of the player.
    showResults: function () {
      var scene = this;
      var r = this.run;
      var w = this.vw, h = this.vh;
      var won = r.won;
      var box = overlayShell(this, this.sortie.theme, 910, won ? 0.5 : 0.66);
      this.resultsBox = box;
      this.modal = box;

      // ---- key art
      var artX = w * 0.23, artY = h * 0.54;
      if (won) {
        var glow = this.add.image(artX, artY, 'disc').setDisplaySize(220, 220)
          .setTint(this.plane.tint).setAlpha(0.30).setBlendMode(Phaser.BlendModes.ADD);
        var art = this.add.image(artX, artY, 'air', this.plane.frame + '_br1').setScale(1.6);
        box.add([glow, art]);
        this.tweens.add({ targets: [art, glow], y: '-=12', duration: 2000, yoyo: true,
                          repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: art, angle: -6, duration: 2600, yoyo: true, repeat: -1,
                          ease: 'Sine.easeInOut' });
      } else {
        var chute = this.add.image(artX, artY - 40, 'ui', 'chute').setScale(1.9);
        var pod = this.add.image(artX, artY + 18, 'ui', 'pod').setScale(1.5);
        box.add([chute, pod]);
        this.tweens.add({ targets: [chute, pod], x: '+=16', duration: 2800, yoyo: true,
                          repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: [chute, pod], angle: 5, duration: 2100, yoyo: true,
                          repeat: -1, ease: 'Sine.easeInOut' });
      }

      var cx = w * 0.63;
      var head = hudText(this, cx, h * 0.14, won ? 'SKY CLEARED' : 'SORTIE LOST', TYPE.title,
                         won ? '#b9ffcf' : '#ffb8aa');
      box.add(head);
      enterFrom(this, head, 0, -16, 40);
      var sub = hudText(this, cx, h * 0.14 + 28, this.sortie.name.toUpperCase(), TYPE.micro,
                        '#a9cfe2', 'normal');
      box.add(sub);
      enterFrom(this, sub, 0, -10, 110);

      // ---- staged stat block
      var lines = [];
      lines.push(['CONFIRMED', r.kills]);
      lines.push(['STYLE', r.style]);
      if (this.lastBreakdown) {
        lines.push(['TIME BONUS', this.lastBreakdown.time]);
        lines.push(['HULL BONUS', this.lastBreakdown.hull]);
      }
      lines.push(['BEST', profile.best[String(this.sortieNo)] || r.score]);
      for (var i = 0; i < lines.length; i++) {
        var y = h * 0.30 + i * 20;
        var lbl = hudText(this, cx - 110, y, lines[i][0], TYPE.micro, '#8fb2c6', 'normal')
          .setOrigin(0, 0.5);
        var val = hudText(this, cx + 110, y, String(lines[i][1]), TYPE.body, '#e8f6ff')
          .setOrigin(1, 0.5);
        box.add([lbl, val]);
        enterFrom(this, lbl, -18, 0, 180 + i * 110);
        enterFrom(this, val, 18, 0, 180 + i * 110);
      }

      // ---- the total counts up, so the number lands as an event
      var totalY = h * 0.30 + lines.length * 20 + 10;
      var totalLbl = hudText(this, cx - 110, totalY, 'SCORE', TYPE.body, '#ffe3a1')
        .setOrigin(0, 0.5);
      var totalVal = hudText(this, cx + 110, totalY, '0', TYPE.head, '#fff6dd').setOrigin(1, 0.5);
      box.add([totalLbl, totalVal]);
      var counter = { v: 0 };
      this.tweens.add({
        targets: counter, v: r.score, duration: 900, delay: 200 + lines.length * 110,
        ease: 'Cubic.easeOut',
        onUpdate: function () { setTextIfChanged(totalVal, String(Math.round(counter.v))); },
        onComplete: function () {
          setTextIfChanged(totalVal, String(r.score));
          scene.tweens.add({ targets: totalVal, scaleX: 1.16, scaleY: 1.16, duration: 200,
                             yoyo: true, ease: 'Back.easeOut' });
          if (won) sfx('clear', { volume: 0.35 });
        }
      });

      if (this.rankedUp) {
        var pr = hudText(this, cx, totalY + 28,
                         'PROMOTED: ' + this.rankedUp.name.toUpperCase(), TYPE.sub, '#ffe3a1');
        box.add(pr);
        pr.setAlpha(0);
        this.tweens.add({ targets: pr, alpha: 1, duration: 200,
                          delay: 1200 + lines.length * 110 });
        this.tweens.add({ targets: pr, scaleX: 1.12, scaleY: 1.12, duration: 260, yoyo: true,
                          repeat: 2, delay: 1200 + lines.length * 110, ease: 'Back.easeOut' });
      }

      var by = h - SAFE.b - 32;
      var main = makeButton(this, cx - 106, by, 206, 44,
        (won && this.sortieNo < SORTIES.length) ? 'NEXT SORTIE' : 'FLY AGAIN',
        function () { scene.afterAction(); }, 'primary');
      var hangar = makeButton(this, cx + 112, by, 186, 44, 'HANGAR', function () {
        scene.closeResults();
        sceneSwap(scene, 'hangar');
      });
      box.add([main, hangar]);
      enterFrom(this, main, 0, 22, 300);
      enterFrom(this, hangar, 0, 22, 350);
    },

    closeResults: function () {
      if (this.resultsBox) this.resultsBox.destroy(true);
      this.resultsBox = null;
      this.modal = null;
    },

    // SINGLE RESTART PATH. The debrief buttons used to call Phaser's scene
    // restart directly, which split restart ownership away from GGKit and
    // skipped its input clearing. Every sortie restart now goes through
    // kit.restart(), and the sortie number is carried explicitly.
    afterAction: function () {
      if (!this.resultsBox) return;
      var next = (this.run.won && this.sortieNo < SORTIES.length)
        ? this.sortieNo + 1 : this.sortieNo;
      this.closeResults();
      this.pendingSortie = next;
      kit.restart();
    },

    // =================================================================
    //  Tutorial - interactive, first run only, gates the opening sortie
    // =================================================================
    stepTutorial: function (dt, inp) {
      var t = this.tutorial, r = this.run;
      t.t += dt;
      var step = t.step;

      // ONBOARDING BY DEMONSTRATION. Every step now points at the control it
      // is talking about: the pad runs a ghost thumb through the motion, the
      // button being taught pulses, and the target being taught is
      // highlighted. The sentence is the caption, not the lesson.
      if (step === 0) {
        this.setTutor('CLIMB AND DIVE. Drag the left pad, or use W and S.', 'pad');
        t.moved += Math.abs(inp.y) * dt;
        if (t.moved > 1.4) { this.nextTutor(); }
      } else if (step === 1) {
        this.setTutor('HOLD FIRE. The ring shows where to aim: shoot the ring, not the bandit.',
                      'fire');
        if (r.kills >= 1) this.nextTutor();
      } else if (step === 2) {
        this.setTutor('That ring is lead pursuit. Bandits fly into your bullets, not under them.',
                      'reticle');
        if (t.t > 4.5) this.nextTutor();
      } else if (step === 3) {
        this.setTutor('MISSILE INBOUND. Tap FLARE, or press F.', 'flare');
        if (!t.missileSent && r.banditsLeft > 0) {
          t.missileSent = true;
          var f = this.nearestFoe();
          if (f) this.launchMissile(f);
        }
        if (t.flared) this.nextTutor();
      } else if (step === 4) {
        this.setTutor('WINGMAN: tap the wing button or press Q to switch COVER and ATTACK.',
                      'wing');
        if (t.ordered) this.nextTutor();
      } else {
        this.setTutor('', null);
        // Visible success confirmation before the tutorial lets go.
        if (!t.done) {
          t.done = true;
          this.showBanner('CHECKED OUT', 'THE AEROPLANE IS YOURS');
          sfx('rank');
        }
        profile.tutorialDone = true;
        saveProfile();
        this.tutorial = null;
      }
    },

    setTutor: function (str, hint) {
      if (this._tutorStr === str) return;
      this._tutorStr = str;
      this._tutorHint = hint || null;
      setTextIfChanged(this.tutorText, str);
      this.tweens.killTweensOf(this.tutorBox);
      // Stop any pulse the previous step left on a control.
      var ctl = this.ctl;
      [ctl.fire, ctl.flare, ctl.wing].forEach(function (o) {
        o.setScale(1);
      });
      this.tweens.killTweensOf([ctl.fire, ctl.flare, ctl.wing, ctl.ghost]);
      ctl.ghost.setAlpha(0);
      if (!str) { this.tutorBox.setAlpha(0); return; }
      this.tutorBox.setAlpha(0).setScale(0.94);
      if (motionEnabled()) this.tweens.add({ targets: this.tutorBox, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 260, ease: 'Back.easeOut' });
      else this.tutorBox.setAlpha(1).setScale(1);

      var target = hint === 'fire' ? ctl.fire : (hint === 'flare' ? ctl.flare
                 : (hint === 'wing' ? ctl.wing : null));
      if (target && motionEnabled()) {
        this.tweens.add({ targets: target, scaleX: 1.14, scaleY: 1.14, duration: 520,
                          yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (hint === 'pad' && motionEnabled()) {
        // Ghost thumb: rides the pad through a full climb and dive so the
        // gesture is shown, not described.
        ctl.ghost.setPosition(this.padHome.x, this.padHome.y).setAlpha(0.85);
        this.tweens.add({
          targets: ctl.ghost, y: this.padHome.y - 40, duration: 760, yoyo: true,
          repeat: -1, ease: 'Sine.easeInOut'
        });
        this.tweens.add({ targets: ctl.ghost, alpha: 0.35, duration: 760, yoyo: true,
                          repeat: -1, ease: 'Sine.easeInOut' });
      }
    },

    nextTutor: function () {
      this.tutorial.step++;
      this.tutorial.t = 0;
      sfx('select', { volume: 0.5 });
      // Staged success beat: each lesson lands with its own confirmation.
      this.popScore(this.run.px + 40, this.run.py - 40, 'GOOD', '#b9ffcf');
    },

    // =================================================================
    //  Banners and floating messages
    // =================================================================
    // HOUSE MOTION: banners SLIDE IN from the leading edge and settle, rather
    // than scaling up in place at a fixed position.
    showBanner: function (title, sub) {
      var h = this.vh, w = this.vw;
      var y = h * 0.28;
      setTextIfChanged(this.banner, title).setAlpha(0).setScale(0.90).setPosition(w / 2 - 90, y);
      setTextIfChanged(this.bannerSub, sub || '').setAlpha(0).setPosition(w / 2 + 70, y + 30);
      this.tweens.killTweensOf(this.banner);
      this.tweens.killTweensOf(this.bannerSub);
      if (motionEnabled()) {
        this.tweens.add({ targets: this.banner, alpha: 1, x: w / 2, scaleX: 1, scaleY: 1, duration: 380,
          ease: 'Back.easeOut' });
        this.tweens.add({ targets: this.bannerSub, alpha: 1, x: w / 2, duration: 380, delay: 90,
          ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: [this.banner, this.bannerSub], alpha: 0, duration: 420,
          delay: 1600 });
      } else {
        this.banner.setAlpha(1).setPosition(w / 2, y);
        this.bannerSub.setAlpha(1).setPosition(w / 2, y + 30);
        this.time.delayedCall(1200, function () {
          this.banner.setAlpha(0); this.bannerSub.setAlpha(0);
        }, [], this);
      }
    },

    // The message stack is a real layout: slots are recomputed whenever the
    // set of live messages changes, and every survivor animates to its new
    // row instead of leaving a hole behind.
    restackMsgs: function () {
      var slot = 0;
      for (var i = 0; i < this.msgs.length; i++) {
        var m = this.msgs[i];
        if (!m.live) continue;
        var y = (this.msgBaseY || this.vh * 0.17) + slot * 18;
        if (m.slot !== slot) {
          m.slot = slot;
          if (motionEnabled()) this.tweens.add({ targets: m.obj, y: y, duration: 180, ease: 'Cubic.easeOut' });
          else m.obj.setY(y);
        }
        slot++;
      }
    },

    pushMsg: function (str, life, color) {
      var m = null, i;
      // Prefer a free slot; otherwise recycle the message with the least life
      // left rather than always clobbering index 0.
      for (i = 0; i < this.msgs.length; i++) if (!this.msgs[i].live) { m = this.msgs[i]; break; }
      if (!m) {
        m = this.msgs[0];
        for (i = 1; i < this.msgs.length; i++) if (this.msgs[i].t < m.t) m = this.msgs[i];
      }
      var used = 0;
      for (i = 0; i < this.msgs.length; i++) if (this.msgs[i].live && this.msgs[i] !== m) used++;
      m.live = true; m.t = life; m.life = life; m.slot = used;
      setTextIfChanged(m.obj, str).setColor(color || '#e8fbff')
        .setPosition(this.vw / 2, (this.msgBaseY || this.vh * 0.17) + used * 18)
        .setAlpha(0).setScale(0.9);
      this.tweens.killTweensOf(m.obj);
      if (motionEnabled()) {
        this.tweens.add({ targets: m.obj, alpha: 1, scaleX: 1, scaleY: 1, duration: 180,
          ease: 'Back.easeOut' });
        this.tweens.add({ targets: m.obj, alpha: 0, duration: 300, delay: life * 1000 - 300 });
      } else {
        m.obj.setAlpha(1).setScale(1);
      }
      this.restackMsgs();
    },

    // Camera. Restrained, spring damped, and entirely inside the GGKit juice
    // toggle: lookahead follows the airframe's vertical rate, and an impact
    // kick decays back to zero rather than snapping.
    cameraKick: function (dx, dy) {
      if (!kit.juice.enabled) return;
      this.cam.dipVX += dx;
      this.cam.dipVY += dy;
    },

    stepCamera: function (dt) {
      var c = this.cam, r = this.run;
      if (!kit.juice.enabled) {
        c.lookX = c.lookY = c.dipX = c.dipY = c.dipVX = c.dipVY = 0;
        return;
      }
      // Velocity lookahead: the frame leads the aeroplane slightly when it is
      // climbing or diving hard. Capped tight so it never becomes motion
      // sickness.
      var wantY = clamp(-r.pvy * 0.016, -9, 9);
      c.lookY = approach(c.lookY, wantY, dt, 0.02);
      c.lookX = approach(c.lookX, (this.inp && this.inp.fire) ? -3 : 0, dt, 0.05);
      // Spring-damped impact offset.
      var k = 190, damp = 13;
      c.dipVX += (-k * c.dipX - damp * c.dipVX) * dt;
      c.dipVY += (-k * c.dipY - damp * c.dipVY) * dt;
      c.dipX += c.dipVX * dt;
      c.dipY += c.dipVY * dt;
    },

    // =================================================================
    //  View sync - the only place sprites are touched
    // =================================================================
    syncView: function (dt, j) {
      var r = this.run, w = this.vw, h = this.vh;
      var i, f;
      r.bossActive = !r.ended && !!(r.bossRef && r.bossRef.live);
      r.forceDrop = !!(window.__av && window.__av.forceDrop);
      window.__av.state = r;
      this.stepCamera(dt);
      var shakeX = (j ? j.dx : 0) + this.cam.lookX + this.cam.dipX;
      var shakeY = (j ? j.dy : 0) + this.cam.lookY + this.cam.dipY;

      // Parallax. Three bands at genuinely separated rates.
      if (dt > 0) {
        this.ridgeFar.tilePositionX += 14 * dt;
        this.ridgeMid.tilePositionX += 30 * dt;
        this.ridgeNear.tilePositionX += 62 * dt;
        for (i = 0; i < this.cloudBands.length; i++) {
          var band = this.cloudBands[i];
          for (var ci = 0; ci < band.list.length; ci++) {
            var c = band.list[ci];
            c.x -= band.speed * dt;
            if (c.x < -240) {
              c.x = w + 200 + vrand() * 120;
              c.y = h * (0.06 + vrand() * 0.72);
            }
          }
        }
      }

      // Ace duel dressing: letterbox bars drive in, palette washes over.
      if (r.letter > 0 || this.letterTop.visible) {
        var lv = r.letter > 0;
        this.letterTop.setVisible(lv).y = -1 + 44 * r.letter;
        this.letterBot.setVisible(lv).y = h + 1 - 44 * r.letter;
        if (!lv) { this.letterTop.setVisible(false); this.letterBot.setVisible(false); }
      }
      this.aceWash.setAlpha(r.aceWash * 0.13);

      // Player: bank frame + pitch rotation + hit flash + damage smoke.
      var bidx = clamp(Math.round(r.bank * 2) + 2, 0, 4);
      var blink = r.invuln > 0 && (Math.floor(r.invuln * 14) % 2 === 0);
      setFrameIf(this.playerSpr, this.plane.frame + '_' + BANKF[bidx]);
      // SCENE-RESPONSIVE LIGHTING: the airframe carries the sky's key light,
      // not a flat white, and goes hot white for the contact flash.
      setTintIf(this.playerSpr, r.hitFlash > 0 ? 0xffdddd : this.playerLit);
      this.playerSpr.setPosition(r.px + shakeX, r.py + shakeY)
        .setRotation(clamp(r.pvy / 760 + r.pvx / 1500, -0.34, 0.34))
        .setVisible(!blink);
      this.playerGlow.setPosition(r.px + shakeX - 16, r.py + shakeY).setVisible(!blink)
        .setAlpha(0.24 + (this.inp && this.inp.fire ? 0.16 : 0) + r.hitFlash);
      this.playerProp.setPosition(r.px + 28 + shakeX, r.py + shakeY).setVisible(!blink);
      this.muzzle.setPosition(r.px + 38 + shakeX, r.py - 1 + shakeY)
        .setAlpha(this.muzzleT > 0 ? (this.muzzleT / 0.10) * 0.92 : 0);
      this.hurtRing.setPosition(r.px + shakeX, r.py + shakeY)
        .setAlpha(r.shield > 0 ? 0.72 : 0.24);

      var wbidx = clamp(Math.round(r.wbank * 2) + 2, 0, 4);
      setFrameIf(this.wingSpr, 'wing_hawk_' + BANKF[wbidx]);
      setTintIf(this.wingSpr, this.wingLit);
      this.wingSpr.setPosition(r.wx + shakeX, r.wy + shakeY)
        .setRotation(clamp((r.wy - r.py) / 900, -0.25, 0.25));
      this.wingGlow.setPosition(r.wx - 14 + shakeX, r.wy + shakeY)
        .setAlpha(r.wOrder === 'attack' ? 0.34 : 0.20)
        .setTint(r.wOrder === 'attack' ? 0xffd76a : mixRGB(0x8ff0e0, this.theme.rim, 0.25));

      // Bandits. Tint priority: contact flash, then telegraph blink, then the
      // damage stage, then the theme's key light.
      for (i = 0; i < this.foes.length; i++) {
        f = this.foes[i];
        if (!f.live) { continue; }
        var fb = clamp(Math.round(f.bank * 2) + 2, 0, 4);
        var flip = f.vx < 0;
        var rot = Math.atan2(f.vy, f.vx);
        if (flip) rot -= Math.PI;
        setFrameIf(f.spr, f.def.frame + '_' + BANKF[fb]);
        var ftint;
        if (f.flash > 0) ftint = 0xffffff;                         // stage 1
        else if (f.warnT > 0 && Math.floor(f.warnT * 18) % 2 === 0) ftint =
          f.warnKind === 'missile' ? 0xff6a5c : 0xffd76a;
        else if (f.tele > 0 && Math.floor(f.tele * 12) % 2 === 0) ftint = 0xffb0a0;
        else if (f.dmg === 3) ftint = mixRGB(this.theme.rim, 0x8a6a5a, 0.55);
        else if (f.dmg === 2) ftint = mixRGB(this.theme.rim, 0xc8bcb4, 0.30);
        else ftint = mixRGB(0xffffff, this.theme.rim, 0.30);
        setTintIf(f.spr, ftint);
        f.spr.setPosition(f.x + shakeX, f.y + shakeY)
          .setFlipX(flip)
          .setRotation(clamp(rot, -0.55, 0.55));
        setTintIf(f.glow, f.warnT > 0
          ? (f.warnKind === 'missile' ? 0xff5c5c : 0xffd76a) : f.rimTint);
        f.glow.setPosition(f.x + shakeX, f.y + shakeY)
          .setAlpha((f.boss ? 0.28 : 0.13) + (f.hit > 0 ? 0.45 : 0) + (f.tele > 0 ? 0.2 : 0) +
                    (f.warnT > 0 ? 0.40 : 0) +
                    (f.dmg === 3 ? 0.12 : 0));
      }

      var pools = [this.tracers, this.foeTracers, this.missiles, this.flak];
      for (var p = 0; p < pools.length; p++) {
        var pool = pools[p];
        for (i = 0; i < pool.length; i++) {
          var b = pool[i];
          if (!b.live) continue;
          b.spr.setPosition(b.x + shakeX, b.y + shakeY);
          if (p === 2) b.spr.setRotation(Math.atan2(b.vy, b.vx));
        }
      }
      // Contact rings, debris and score popups.
      for (i = 0; i < this.rings.length; i++) {
        if (this.rings[i].live) {
          this.rings[i].spr.setPosition(this.rings[i].x + shakeX, this.rings[i].y + shakeY);
        }
      }
      for (i = 0; i < this.debris.length; i++) {
        var db = this.debris[i];
        if (!db.live) continue;
        db.spr.setPosition(db.x + shakeX, db.y + shakeY).setRotation(db.t * db.spin);
      }
      for (i = 0; i < this.pops.length; i++) {
        if (this.pops[i].live) this.pops[i].obj.setPosition(this.pops[i].x, this.pops[i].y);
      }
      for (i = 0; i < this.pods.length; i++) {
        var pod = this.pods[i];
        if (!pod.live) continue;
        pod.spr.setPosition(pod.x + shakeX, pod.y + shakeY).setRotation(Math.sin(pod.t * 3) * 0.2);
        // The chute SNAPS open on its own beat rather than fading in.
        var cu = clamp((pod.t - 0.3) * 5, 0, 1);
        var snap = cu < 1 ? 0.4 + 0.75 * (1 - (1 - cu) * (1 - cu)) : 1;
        pod.chute.setPosition(pod.x + shakeX, pod.y - 26 + shakeY)
          .setRotation(Math.sin(pod.t * 2.2) * 0.14)
          .setScale(snap, snap)
          .setAlpha(clamp((pod.t - 0.26) * 6, 0, 1));
        if (pod.t < 0.5 && vrand() < dt * 30) {
          this.fx.smoke.emitParticleAt(pod.x, pod.y + 6, 1);
        }
      }
      for (i = 0; i < this.pickups.length; i++) {
        var pu = this.pickups[i];
        if (!pu.live) continue;
        var pp = motionEnabled() ? (1 + Math.sin(this.cosmetic * 7 + pu.phase) * 0.10) : 1;
        pu.spr.setPosition(pu.x + shakeX, pu.y + shakeY).setScale(pp);
        pu.halo.setAlpha(motionEnabled() ? 0.22 + Math.sin(this.cosmetic * 6 + pu.phase) * 0.08 : 0.26);
      }

      // Lead-pursuit glass: dashed line to the aim point, ring on the point,
      // bracket on the bandit. This is the title's signature HUD element.
      var t = r.target;
      if (t && t.live && !r.ended) {
        var lp = this.leadPoint(t, this._lp || (this._lp = { x: 0, y: 0 }));
        // SAFE-EDGE AWARENESS. The ring and the lock bracket are HUD glass:
        // they belong inside the safe rect. Previously both were placed
        // straight from world coordinates, so a bandit at the right edge had
        // its bracket sliced in half by the viewport, and a hard intercept
        // could put the ring off-screen entirely.
        var pad = 26;
        var sx0 = SAFE.l + pad, sx1 = w - SAFE.r - pad;
        var sy0 = SAFE.t + 68, sy1 = h - SAFE.b - 96;
        var offRing = lp.x < sx0 || lp.x > sx1 || lp.y < sy0 || lp.y > sy1;
        var rx = clamp(lp.x, sx0, sx1), ry = clamp(lp.y, sy0, sy1);
        var x0 = r.px + 34 + shakeX, y0 = r.py + shakeY;
        var x1 = rx + shakeX, y1 = ry + shakeY;
        var ang = Math.atan2(y1 - y0, x1 - x0);
        var len = Math.hypot(x1 - x0, y1 - y0);
        for (var s = 0; s < 4; s++) {
          var u = (s + 0.5) / 4.6;
          var dsh = this.leadDashes[s];
          dsh.setVisible(true).setPosition(lerp(x0, x1, u), lerp(y0, y1, u))
            .setRotation(ang).setScale(Math.max(0.1, len / 4 / 34), 0.09);
        }
        var pulse = 1 + Math.sin(this.cosmetic * 8) * 0.06;
        this.reticle.setVisible(true).setPosition(x1, y1).setScale(pulse)
          .setAlpha(offRing ? 0.45 : 0.75).setTint(this.theme.glass);

        var lockX = clamp(t.x, sx0, sx1), lockY = clamp(t.y, sy0, sy1);
        var offTarget = lockX !== t.x || lockY !== t.y;
        this.lockBox.setVisible(!offTarget).setPosition(t.x + shakeX, t.y + shakeY)
          .setScale((t.def.r / 22) * 1.05)
          .setAlpha(0.65 + Math.sin(this.cosmetic * 6) * 0.12)
          .setTint(this.theme.glass);

        // Off-screen indicator: an edge arrow pointing at the bandit, with
        // the range so the player knows how far out he is.
        if (offTarget) {
          var ax = Math.atan2(t.y - r.py, t.x - r.px);
          this.edgeArrow.setVisible(true).setPosition(lockX + shakeX, lockY + shakeY)
            .setRotation(ax).setAlpha(0.55 + Math.sin(this.cosmetic * 7) * 0.2)
            .setTint(this.theme.glass);
          // FEEL: a Phaser Text re-rasterises its own canvas and re-uploads a
          // GPU texture on EVERY setText with a changed string. The raw pixel
          // range changes every frame, so this line was paying for a canvas
          // draw plus a texImage2D upload once per frame for as long as a
          // bandit was off-screen. Quantising to 25 m and caching the string
          // keeps the readout honest and uploads only when it actually moves.
          var range = Math.round(Math.hypot(t.x - r.px, t.y - r.py) / 25) * 25;
          if (range !== this._rangeShown) {
            this._rangeShown = range;
            setTextIfChanged(this.edgeRange, range + 'M');
          }
          this.edgeRange.setVisible(true)
            .setPosition(clamp(lockX, sx0 + 20, sx1 - 20) - Math.cos(ax) * 26,
                         clamp(lockY, sy0 + 14, sy1 - 14) - Math.sin(ax) * 20 + shakeY);
        } else {
          this.edgeArrow.setVisible(false);
          this.edgeRange.setVisible(false);
        }
      } else {
        this.reticle.setVisible(false);
        this.lockBox.setVisible(false);
        this.edgeArrow.setVisible(false);
        this.edgeRange.setVisible(false);
        for (var dj = 0; dj < 4; dj++) this.leadDashes[dj].setVisible(false);
      }

      // Damage vignette + lock warning. The vignette is a 2x oversized quad,
      // so it is hidden outright rather than drawn at alpha 0.
      if (r.vign > 0.002) this.vignette.setVisible(true).setAlpha(r.vign * 0.5);
      else if (this.vignette.visible) this.vignette.setVisible(false);
      this.lockWarn.setAlpha(r.locked > 0 ? (Math.floor(this.cosmetic * 8) % 2 ? 0.95 : 0.25) : 0);

      this.syncHud();
    },

    syncHud: function () {
      var r = this.run, c = this.hudCache;
      var s = 'SORTIE ' + this.sortieNo + '/' + SORTIES.length + '  ' +
        this.sortie.name.toUpperCase();
      if (s !== c.sortie) { c.sortie = s; setTextIfChanged(this.hud.sortie, s); }
      if (r.score !== c.score) {
        c.score = r.score;
        setTextIfChanged(this.hud.score, 'SCORE ' + pad(r.score, 5) + '   BEST ' +
          pad(Math.max(profile.best[String(this.sortieNo)] || 0, r.score), 5));
        this.pulseHud(this.hud.score, 1.05);
      }
      if (r.banditsLeft !== c.bandits) {
        c.bandits = r.banditsLeft;
        setTextIfChanged(this.hud.bandits, r.banditsLeft > 0 ? 'BANDITS ' + r.banditsLeft
          : (r.wave === 0 ? 'BANDITS INBOUND' : 'SKY CLEAR'));
      }
      if (r.hull !== c.hull) {
        c.hull = r.hull;
        // HEALTH UNDERFLOW FIX (second half): the pip row clamps independently
        // of the hull value it renders.
        var hull = clamp(r.hull | 0, 0, r.maxHull);
        for (var i = 0; i < this.hud.pips.length; i++) {
          var p = this.hud.pips[i];
          if (i >= r.maxHull) { p.setVisible(false); continue; }
          p.setVisible(true).setFrame(i < hull ? 'pip_on' : 'pip_off');
        }
      }
      var fl = 'FLARES ' + r.flares + '/' + r.maxFlares;
      if (fl !== c.flare) { c.flare = fl; setTextIfChanged(this.hud.flareLabel, fl); }
      if (r.style !== c.style || r.multiplier !== c.multiplier || r.kills !== c.kills) {
        c.style = r.style;
        c.multiplier = r.multiplier;
        c.kills = r.kills;
        setTextIfChanged(this.hud.style, 'CHAIN ' + r.multiplier.toFixed(1) + 'X   KILLS ' + r.kills);
      }
      var weaponText = WEAPONS[r.equippedWeapon].name + ' LV' + r.powerLevel +
        '   BOMB ' + r.bombs + (r.shield ? '   SHIELD' : '');
      if (weaponText !== c.weapon) { c.weapon = weaponText; setTextIfChanged(this.hud.weapon, weaponText); }
      if (r.aceRef && r.aceRef.live) {
        this.hud.bossFill.scaleX = Math.max(0.004, r.aceRef.hp / r.aceRef.maxHp);
      }

      // COMBO CHIP. The multiplier was tracked in state and never drawn.
      // It back-pops on every increment and eases out when the streak dies.
      var combo = r.combo > 1 ? r.combo : 0;
      if (combo !== this._comboShown) {
        this._comboShown = combo;
        this.tweens.killTweensOf(this.hud.combo);
        if (combo) {
          setTextIfChanged(this.hud.comboTxt, 'x' + r.multiplier.toFixed(1) + '  CHAIN');
          this.hud.combo.setAlpha(1).setScale(1.22);
          this.tweens.add({ targets: this.hud.combo, scaleX: 1, scaleY: 1, duration: 260,
                            ease: 'Back.easeOut' });
        } else {
          this.tweens.add({ targets: this.hud.combo, alpha: 0, duration: 240,
                            ease: 'Quad.easeOut' });
        }
      }
    },

    pulseHud: function (obj, scale) {
      if (!motionEnabled()) { obj.setScale(1); return; }
      this.tweens.killTweensOf(obj);
      obj.setScale(scale || 1.08);
      this.tweens.add({ targets: obj, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
    }
  };

  // =====================================================================
  //  Boot
  // =====================================================================
  // Phaser only wires preload/create/update from a plain config object, so
  // each scene literal is promoted to a real Scene subclass with its whole
  // method set on the prototype.
  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    for (var k in cfg) {
      if (k === 'key') continue;
      Klass.prototype[k] = cfg[k];
    }
    return Klass;
  }

  var cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || 1280));
  var cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || 720));
  var config = {
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#071126',
    scale: { mode: Phaser.Scale.NONE, width: cssW, height: cssH },
    render: Object.assign({}, GGKit.renderDefaults, { roundPixels: true, mipmapFilter: 'LINEAR' }),
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(TitleScene), toScene(HangarScene), toScene(PlayScene)]
  };
  config = GGKit.hiDpi.phaser(config);
  DPR = config.ggDpr;
  Game.phaser = new Phaser.Game(config);
  function syncHiDpi(game) {
    var nextW = Math.max(1, Math.floor(document.documentElement.clientWidth || 1));
    var nextH = Math.max(1, Math.floor(document.documentElement.clientHeight || 1));
    game.scale.resize(Math.round(nextW * DPR), Math.round(nextH * DPR));
    if (game.canvas) {
      game.canvas.style.width = nextW + 'px';
      game.canvas.style.height = nextH + 'px';
    }
  }
  syncHiDpi(Game.phaser);
  window.addEventListener('resize', function () { syncHiDpi(Game.phaser); });
  window.addEventListener('orientationchange', function () { syncHiDpi(Game.phaser); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(Game.phaser);
  });

  kit.registerPWA();
}());
