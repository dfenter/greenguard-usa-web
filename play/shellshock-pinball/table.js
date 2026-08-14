/* Shellshock Pinball - authored archetypes with seeded variation. */
(function (SS) {
  'use strict';

  var W = 430, H = 900, D2R = Math.PI / 180, TAU = SS.TAU;
  var ARCHETYPES = [
    { id: 'classic', tier: 0, name: 'BUMPER CATHEDRAL', tag: 'classic bumper field', objective: 'BANK CLEAR', accent: 0x42e8ff },
    { id: 'speedway', tier: 1, name: 'OVERPASS SPEEDWAY', tag: 'ramp-heavy speedway', objective: 'RAMP RUNS', accent: 0xffb84f },
    { id: 'gauntlet', tier: 2, name: 'SPINNER GAUNTLET', tag: 'spinner gauntlet', objective: 'SPINNER STORM', accent: 0xb97cff },
    { id: 'boss', tier: 3, name: 'CITADEL OF ECHOES', tag: 'boss mission table', objective: 'LOCK THE CITADEL', accent: 0xff5c91 }
  ];

  function addBumper(t, x, y, color, value) {
    var b = { x: x, y: y, r: 19, rest: 0.5, kick: 710, kind: 'bumper', flash: 0, value: value || 100, color: color };
    t.circles.push(b); t.bumpers.push(b);
    return b;
  }
  function addTargetBank(t, name, x, y, count, vertical, color) {
    var bank = { name: name, x: x, y: y, targets: [], clear: false, resetAt: 0, flash: 0, color: color };
    var i, target, dx = vertical ? 0 : 34, dy = vertical ? 34 : 0;
    for (i = 0; i < count; i++) {
      target = { x: x + (i - (count - 1) * 0.5) * dx, y: y + (i - (count - 1) * 0.5) * dy, r: 11, kind: 'target', bank: bank, down: false, flash: 0 };
      target.seg = SS.seg(t.segs, target.x - (vertical ? 8 : 9), target.y - (vertical ? 9 : 8), target.x + (vertical ? 8 : 9), target.y + (vertical ? 9 : 8), { r: 5, rest: 0.42, kind: 'target', target: target });
      bank.targets.push(target); t.targets.push(target);
    }
    t.banks.push(bank);
    return bank;
  }
  function addSpinner(t, x, y, angle, label) {
    var sp = { x: x, y: y, r: 15, angle: angle, rot: 0, vel: 0, turns: 0, flash: 0, label: label || 'SPINNER' };
    var nx = -Math.sin(angle), ny = Math.cos(angle), dx = Math.cos(angle), dy = Math.sin(angle);
    SS.seg(t.segs, x - dx * 44 + nx * 24, y - dy * 44 + ny * 24, x + dx * 44 + nx * 24, y + dy * 44 + ny * 24, { r: 3, rest: 0.30 });
    SS.seg(t.segs, x - dx * 44 - nx * 24, y - dy * 44 - ny * 24, x + dx * 44 - nx * 24, y + dy * 44 - ny * 24, { r: 3, rest: 0.30 });
    t.spinners.push(sp);
    return sp;
  }
  function addHole(t, x, y) {
    t.hole = { x: x, y: y, r: 17, lit: false, flash: 0, hold: 0, ejectAngle: -70 * D2R };
    SS.chain(t.segs, SS.arcPoints(x, y, 27, 27, 150 * D2R, 390 * D2R, 18), { r: 3, rest: 0.40 });
  }
  function addBonus(t, x, y, label) {
    var b = { x: x, y: y, r: 10, kind: 'bonus', lit: false, flash: 0, label: label };
    t.circles.push(b); t.bonusLights.push(b);
  }
  function addRail(t, points, color) {
    SS.chain(t.segs, points, { r: 4, rest: 0.36, kind: 'rail', color: color });
  }
  function ramp(t, mouthX, path, name) {
    var smoothed = SS.smooth(path, 7), lengths = SS.pathLength(smoothed);
    t.ramp = { path: smoothed, cumulative: lengths.cumulative, length: lengths.total, flash: 0, name: name, mouth: { x1: mouthX - 28, x2: mouthX + 28, y: 405 } };
    addRail(t, [[mouthX - 43, 468], [mouthX - 24, 405]], t.accent);
    addRail(t, [[mouthX + 43, 468], [mouthX + 24, 405]], t.accent);
  }
  function commonShell(t) {
    SS.chain(t.segs, SS.arcPoints(215, 258, 185, 160, Math.PI, TAU, 28), { r: 5, rest: 0.38, kind: 'wall' });
    SS.seg(t.segs, 28, 250, 28, 804, { r: 5, rest: 0.38 });
    SS.seg(t.segs, 402, 118, 402, 850, { r: 5, rest: 0.38 });
    /* The lane divider is a one-way gate. A launched ball can leave the
       plunger lane into the playfield, while balls on the playfield cannot
       fall back into the lane and become trapped against the outlane wall. */
    SS.seg(t.segs, 365, 850, 365, 182, { r: 4, rest: 0.32, kind: 'lane', oneWay: { x: -1, y: 0 } });
    SS.seg(t.segs, 365, 182, 318, 125, { r: 4, rest: 0.32, kind: 'lane' });
    SS.seg(t.segs, 365, 850, 402, 850, { r: 4, rest: 0.15, kind: 'floor' });
    SS.chain(t.segs, [[28, 804], [54, 860], [115, 878]], { r: 4, rest: 0.32 });
    SS.chain(t.segs, [[402, 804], [376, 860], [315, 878]], { r: 4, rest: 0.32 });
    SS.chain(t.segs, [[54, 690], [112, 742], [104, 760], [46, 715]], { r: 3, rest: 0.30 });
    SS.chain(t.segs, [[376, 690], [318, 742], [326, 760], [384, 715]], { r: 3, rest: 0.30 });
    t.slings.push({ points: [[70, 652], [142, 724], [74, 724]], flash: 0 });
    t.slings.push({ points: [[360, 652], [288, 724], [356, 724]], flash: 0 });
    for (var si = 0; si < t.slings.length; si++) {
      var sling = t.slings[si], p = sling.points;
      SS.seg(t.segs, p[0][0], p[0][1], p[1][0], p[1][1], { r: 5, rest: 0.50, kick: 620, kind: 'sling', sling: sling });
      SS.seg(t.segs, p[1][0], p[1][1], p[2][0], p[2][1], { r: 4, rest: 0.42, kick: 420, kind: 'sling', sling: sling });
      SS.seg(t.segs, p[2][0], p[2][1], p[0][0], p[0][1], { r: 4, rest: 0.42, kick: 420, kind: 'sling', sling: sling });
    }
    t.kickback = { x: 61, y: 798, r: 24, armed: true, cooldown: 0, flash: 0, uses: 0 };
    t.flippers.left = { x: 143, y: 810, len: 74, r: 9, restAngle: 29 * D2R, upAngle: -29 * D2R, angle: 29 * D2R, omega: 0, on: false, phase: 'rest' };
    t.flippers.right = { x: 287, y: 810, len: 74, r: 9, restAngle: 151 * D2R, upAngle: 209 * D2R, angle: 151 * D2R, omega: 0, on: false, phase: 'rest' };
    /* Later tables add physical chicanes and a second objective layer. */
    if (t.progression.tier >= 1) addRail(t, [[176, 430], [194, 464], [177, 500]], t.accent);
    if (t.progression.tier >= 2) addRail(t, [[254, 430], [236, 464], [253, 500]], t.accent);
    if (t.progression.tier >= 3) addRail(t, [[164, 250], [188, 270]], t.accent);
  }
  function buildClassic(t, rnd) {
    addBumper(t, 128 + rnd() * 8, 264, 0x42e8ff, 120);
    addBumper(t, 215, 226 + rnd() * 10, 0x62f6bb, 150);
    addBumper(t, 302 - rnd() * 8, 264, 0xff5c91, 120);
    addBumper(t, 215, 340, 0xffb84f, 200);
    addTargetBank(t, 'NORTH', 83, 430, 4, true, 0x62f6bb);
    addTargetBank(t, 'SOUTH', 346, 490, 4, true, 0xffb84f);
    addSpinner(t, 214, 493, 0, 'SPIN LANE');
    ramp(t, 118, [[118, 405], [138, 346], [198, 285], [315, 225], [344, 325], [330, 500], [300, 600]], 'CATHEDRAL RAMP');
    addHole(t, 215, 158);
    addBonus(t, 88, 548, 'A'); addBonus(t, 342, 586, 'B'); addBonus(t, 215, 555, 'C'); addBonus(t, 105, 348, 'D'); addBonus(t, 324, 350, 'E');
    t.signature = { type: 'bonus cascade', label: 'BONUS CASCADE' };
  }
  function buildSpeedway(t, rnd) {
    addBumper(t, 112, 252 + rnd() * 12, 0xffb84f, 140);
    addBumper(t, 215, 310, 0x42e8ff, 130);
    addBumper(t, 318, 252 - rnd() * 12, 0xff5c91, 140);
    addTargetBank(t, 'BRAKE', 92, 515, 5, false, 0xffb84f);
    addTargetBank(t, 'APEX', 330, 570, 3, true, 0x42e8ff);
    addSpinner(t, 215, 480, -26 * D2R, 'APEX SPINNER');
    ramp(t, 307, [[307, 405], [290, 350], [244, 294], [118, 222], [75, 300], [94, 530], [145, 620]], 'SPEEDWAY OVERPASS');
    addHole(t, 215, 168);
    addRail(t, [[74, 390], [112, 360], [156, 374]], t.accent);
    addRail(t, [[356, 430], [318, 390], [274, 404]], t.accent);
    addBonus(t, 86, 600, 'A'); addBonus(t, 145, 565, 'B'); addBonus(t, 285, 570, 'C'); addBonus(t, 346, 630, 'D'); addBonus(t, 215, 610, 'E');
    t.signature = { type: 'ramp race', label: 'OVERPASS RACE' };
  }
  function buildGauntlet(t, rnd) {
    addBumper(t, 104, 254, 0xb97cff, 120);
    addBumper(t, 326, 254, 0x62f6bb, 120);
    addBumper(t, 215, 370, 0xffb84f, 170);
    addTargetBank(t, 'VIOLET', 92, 438, 4, true, 0xb97cff);
    addTargetBank(t, 'MINT', 338, 438, 4, true, 0x62f6bb);
    addSpinner(t, 144, 320, Math.PI / 2, 'LEFT SPINNER');
    addSpinner(t, 286, 320, Math.PI / 2, 'RIGHT SPINNER');
    addSpinner(t, 215, 515, 0, 'CENTER SPINNER');
    ramp(t, 215, [[215, 405], [215, 345], [255, 290], [350, 240], [366, 380], [330, 555], [278, 630]], 'GAUNTLET CHUTE');
    addHole(t, 215, 165);
    addBonus(t, 71, 568, 'A'); addBonus(t, 115, 602, 'B'); addBonus(t, 315, 602, 'C'); addBonus(t, 359, 568, 'D'); addBonus(t, 215, 580, 'E');
    t.signature = { type: 'spinner storm', label: 'SPINNER STORM' };
  }
  function buildBoss(t, rnd) {
    addBumper(t, 112, 252, 0xff5c91, 160);
    addBumper(t, 318, 252, 0xff5c91, 160);
    addBumper(t, 148, 370, 0xffb84f, 160);
    addBumper(t, 282, 370, 0xffb84f, 160);
    addTargetBank(t, 'CITADEL', 215, 472, 5, false, 0xff5c91);
    addTargetBank(t, 'WING', 90, 510, 3, true, 0xffb84f);
    addSpinner(t, 215, 560, 0, 'BOSS SPINNER');
    ramp(t, 105, [[105, 405], [136, 345], [200, 300], [310, 320], [346, 420], [320, 555], [268, 640]], 'CITADEL OVERPASS');
    addHole(t, 215, 170);
    t.lock = { x: 215, y: 278, r: 20, kind: 'lock', hits: 0, need: 3, flash: 0, locked: false, down: false };
    t.circles.push(t.lock);
    addRail(t, SS.arcPoints(215, 278, 42, 42, Math.PI * 0.15, Math.PI * 1.85, 18), t.accent);
    addBonus(t, 82, 592, 'A'); addBonus(t, 135, 612, 'B'); addBonus(t, 295, 612, 'C'); addBonus(t, 348, 592, 'D'); addBonus(t, 215, 650, 'E');
    t.signature = { type: 'wizard mode', label: 'CITADEL WIZARD' };
  }

  SS.ARCHETYPES = ARCHETYPES;
  SS.generateTable = function (seed) {
    var cleanSeed = (seed >>> 0) || 1, rnd = SS.rng(cleanSeed);
    var archetype = ARCHETYPES[cleanSeed % ARCHETYPES.length] || ARCHETYPES[0];
    var t = {
      seed: cleanSeed, archetype: archetype, name: archetype.name,
      segs: [], circles: [], bumpers: [], targets: [], banks: [], spinners: [],
      bonusLights: [], slings: [], flippers: { left: null, right: null },
      ramp: null, hole: null, lock: null, kickback: null, signature: null, accent: archetype.accent,
      progression: { tier: archetype.tier, name: 'TIER ' + (archetype.tier + 1), objective: archetype.objective }
    };
    commonShell(t);
    if (archetype.id === 'classic') buildClassic(t, rnd);
    else if (archetype.id === 'speedway') buildSpeedway(t, rnd);
    else if (archetype.id === 'gauntlet') buildGauntlet(t, rnd);
    else buildBoss(t, rnd);
    t.glyphSeed = Math.floor(rnd() * 9999);
    return t;
  };
}(window.SS));
